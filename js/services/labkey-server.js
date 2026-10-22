// =============================================================================
// Simulated LabKey-style data server.
//
// Each data-release folder (e.g. /main-programme/main-programme_v19_2024-10-31)
// is an in-browser SQLite database (sql.js) created from:
//   1. the table schema  data/labkey/schema/<folder>.json   (all tables, empty)
//   2. optional data      data/labkey/data/<folder>/index.json + <table>.tsv
//   3. optional uploads   TSV files an instructor loads in Settings (IndexedDB)
// When index.json gives each table's row count ("rows"), a table's TSV is only
// fetched when something first needs it (a query naming it, or the grid);
// otherwise every table is loaded when the folder opens.
//
// The GUI (LabKeeper site) queries it directly. R and Python receive a database
// file (/resources/labkey/<folder>.sqlite) with every table's columns, the rows of
// tables loaded in Settings, and where each other table's TSV is; their clients
// fetch a table from the website when one of their queries first names it, and query it
// through the Rlabkey / labkey stand-ins – R with sql.js inside R's worker, Python
// with its sqlite3 – so results are identical everywhere (js/engine/labkey-clients.js).
// =============================================================================

import { CONFIG } from '../config.js';
import { loadScript, siteUrl } from '../core/util.js';
import { idb } from '../core/store.js';
import { Emitter } from '../core/bus.js';
import { translateLabkeySql, buildWhere, quoteIdent, labkeyErrorMessage } from './labkey-sql.js';
import { createTableSql, insertTsvRows, tablesNamedIn } from './labkey-tsv.js';

let sqlPromise = null;
function loadSqlJs() {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      const base = CONFIG.cdn.sqljs;
      await loadScript(base + 'sql-wasm.js');
      return window.initSqlJs({ locateFile: (f) => base + f });
    })();
  }
  return sqlPromise;
}

function registerFunctions(db) {
  const agg = (name, finalize) => {
    if (!db.create_aggregate) return;
    db.create_aggregate(name, { init: () => [], step: (st, v) => { if (v !== null && v !== undefined && !isNaN(v)) st.push(Number(v)); return st; }, finalize });
  };
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const variance = (a) => { if (a.length < 2) return null; const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1); };
  agg('stdev', (a) => { const v = variance(a); return v === null ? null : Math.sqrt(v); });
  agg('variance', variance);
  agg('median', (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; });
  db.create_function('regexp', (re, s) => (s !== null && new RegExp(re).test(String(s)) ? 1 : 0));
}

export function createLabkeyServer(RE) {
  const ev = new Emitter();
  const cache = new Map();
  let filesPromise = null;
  // (new table data: R and Python get new copies of the database)
  ev.on('change', () => { if (filesPromise) { filesPromise = null; api.writeFiles().catch(() => {}); } });

  function releases() {
    const out = [];
    for (const p of CONFIG.dataBrowser.projects) {
      for (const r of p.releases) out.push({ project: p.name, projectTitle: p.title, folder: r.folder, folderPath: `/${p.name}/${r.folder}`, schemaUrl: r.schema, dataUrl: r.data, current: !!r.current });
    }
    return out;
  }

  /** Accepts "/main-programme/main-programme_v19_...", "main_programme/...", "home/main-programme/..." etc. */
  function resolve(folderPath) {
    if (!folderPath) return null;
    const norm = String(folderPath).trim().toLowerCase().replace(/_/g, '-').replace(/^\/+|\/+$/g, '').replace(/^home\//, '');
    return releases().find(r => {
      const a = r.folderPath.toLowerCase().replace(/_/g, '-').replace(/^\//, '');
      return norm === a || norm.endsWith('/' + r.folder.toLowerCase().replace(/_/g, '-')) || norm === r.folder.toLowerCase().replace(/_/g, '-');
    }) || null;
  }

  async function open(folderPath) {
    const rel = resolve(folderPath);
    if (!rel) {
      const e = new Error(`Container not found: ${folderPath}`);
      e.status = 404;
      throw e;
    }
    if (!cache.has(rel.folderPath)) cache.set(rel.folderPath, build(rel).catch((e) => { cache.delete(rel.folderPath); throw e; }));
    return cache.get(rel.folderPath);
  }

  async function build(rel) {
    const SQL = await loadSqlJs();
    const schema = await (await fetch(siteUrl(rel.schemaUrl))).json();
    const db = new SQL.Database();
    registerFunctions(db);
    const tables = new Map();
    db.run('BEGIN');
    for (const t of schema.tables) {
      db.run(createTableSql(t));
      tables.set(t.name.toLowerCase(), t);
    }
    db.run('COMMIT');
    // bundled: every table's TSV file (lower-case name -> file); files: those not loaded yet; pending: their loads in
    // progress; uploaded: the tables replaced by a file loaded in Settings
    const folder = { ...rel, schema, db, tables, rowCounts: new Map(), loaded: [], bundled: new Map(), files: new Map(), pending: new Map(), uploaded: new Set() };
    // bundled data: the index now, a table's rows when they are first needed (all at once if the index has no counts)
    let lazy = false;
    try {
      const res = await fetch(siteUrl(rel.dataUrl + 'index.json'));
      if (res.ok) {
        const index = await res.json();
        lazy = !!index.rows;
        for (const [table, file] of Object.entries(index.tables || {})) { folder.bundled.set(table.toLowerCase(), file); folder.files.set(table.toLowerCase(), file); }
        for (const [table, n] of Object.entries(index.rows || {})) folder.rowCounts.set(table.toLowerCase(), n);
      }
    } catch (e) { console.warn('[labkey] no bundled data for', rel.folderPath, e); }
    // instructor uploads replace the bundled tables
    for (const key of await idb.keys(`labkey:${rel.folderPath}:`)) {
      const text = await idb.get(key);
      const table = key.split(':').pop();
      if (text) { folder.files.delete(table.toLowerCase()); folder.uploaded.add(table.toLowerCase()); insertTsv(folder, table, text, { replace: true }); }
    }
    if (!lazy) await ensure(folder, [...folder.files.keys()]);
    refreshCounts(folder);
    return folder;
  }

  /** Loads the bundled rows of these tables (fetched in parallel, each once). */
  async function ensure(folder, names) {
    const want = [...new Set(names.map(n => String(n).toLowerCase()))].filter(n => folder.files.has(n) || folder.pending.has(n));
    await Promise.all(want.map((n) => {
      if (!folder.pending.has(n)) {
        const file = folder.files.get(n);
        folder.pending.set(n, (async () => {
          try {
            const r = await fetch(siteUrl(folder.dataUrl + file));
            const text = r.ok ? await r.text() : '';
            // (an upload may have replaced the table while it was being fetched)
            if (folder.files.get(n) === file) {
              folder.files.delete(n);
              if (text) insertTsv(folder, n, text);
            }
          } catch (e) {
            console.warn('[labkey] cannot load', n, e);
            folder.files.delete(n);
          }
          countTable(folder, n);
        })());
      }
      return folder.pending.get(n);
    }));
  }

  /** The tables a SQL text names (any word that is a table name; a few extra loads are harmless). */
  function tablesIn(folder, sql) {
    return tablesNamedIn(sql, [...folder.tables.keys()]);
  }

  function insertTsv(folder, tableName, text, { replace = false } = {}) {
    const t = folder.tables.get(String(tableName).toLowerCase());
    if (!t) { console.warn('[labkey] unknown table in data:', tableName); return 0; }
    const { rows, unknown } = insertTsvRows(folder.db, t.name, t.columns, text, { replace });
    if (unknown.length) console.warn(`[labkey] ${t.name}: ignoring unknown columns`, unknown);
    folder.loaded.push(t.name);
    return rows;
  }

  function countTable(folder, n) {
    const t = folder.tables.get(n);
    if (!t) return;
    const r = folder.db.exec(`SELECT COUNT(*) FROM ${quoteIdent(t.name)}`);
    folder.rowCounts.set(n, r[0]?.values[0][0] ?? 0);
  }

  function refreshCounts(folder) {
    // (a table still to be loaded keeps the count the index gives)
    for (const t of folder.schema.tables) if (!folder.files.has(t.name.toLowerCase())) countTable(folder, t.name.toLowerCase());
  }

  function rowsFrom(result) {
    if (!result || !result.length) return { columns: [], rows: [] };
    const { columns, values } = result[result.length - 1];
    return { columns, rows: values.map(v => Object.fromEntries(columns.map((c, i) => [c, v[i]]))) };
  }

  function assertSchema(schemaName) {
    if (schemaName && String(schemaName).toLowerCase() !== 'lists') {
      const e = new Error(`Schema '${schemaName}' not found. Use schemaName = "lists".`);
      e.status = 404;
      throw e;
    }
  }

  const api = {
    on: (...a) => ev.on(...a),
    releases,
    resolve,
    open,

    async tables(folderPath) {
      const f = await open(folderPath);
      return f.schema.tables.map(t => ({ ...t, rowCount: f.rowCounts.get(t.name.toLowerCase()) || 0 }));
    },

    async table(folderPath, name) {
      const f = await open(folderPath);
      const t = f.tables.get(String(name).toLowerCase());
      if (!t) { const e = new Error(`Query '${name}' in schema 'lists' doesn't exist.`); e.status = 404; throw e; }
      return { ...t, rowCount: f.rowCounts.get(t.name.toLowerCase()) || 0 };
    },

    /**
     * selectRows({folderPath, schemaName, queryName, columns:[..], filters:[{column, op, value}],
     *             sort:[{column, dir:'ASC'|'DESC'}] | '+col,-col', maxRows, offset})
     */
    async selectRows({ folderPath, schemaName = 'lists', queryName, columns, filters = [], sort, maxRows = -1, offset = 0 }) {
      assertSchema(schemaName);
      const f = await open(folderPath);
      const t = await api.table(folderPath, queryName);
      await ensure(f, [t.name]);
      const known = new Map(t.columns.map(c => [c.name.toLowerCase(), c.name]));
      const cols = (columns && columns.length ? columns : t.columns.map(c => c.name)).map(c => {
        const n = known.get(String(c).trim().toLowerCase());
        if (!n) { const e = new Error(`Column '${c}' not found in ${t.name}`); e.status = 400; throw e; }
        return n;
      });
      for (const flt of filters) {
        const n = known.get(String(flt.column).toLowerCase());
        if (!n) { const e = new Error(`Column '${flt.column}' not found in ${t.name}`); e.status = 400; throw e; }
        flt.column = n;
      }
      const where = buildWhere(filters);
      let order = '';
      const sorts = typeof sort === 'string'
        ? sort.split(',').map(s => s.trim()).filter(Boolean).map(s => ({ column: s.replace(/^[+-]/, ''), dir: s.startsWith('-') ? 'DESC' : 'ASC' }))
        : (sort || []);
      if (sorts.length) order = 'ORDER BY ' + sorts.map(s => `${quoteIdent(known.get(String(s.column).toLowerCase()) || s.column)} ${s.dir === 'DESC' ? 'DESC' : 'ASC'}`).join(', ');
      const base = `FROM ${quoteIdent(t.name)} ${where.sql}`;
      const total = f.db.exec(`SELECT COUNT(*) ${base}`, where.params)[0]?.values[0][0] ?? 0;
      const limit = maxRows !== undefined && maxRows >= 0 ? `LIMIT ${Number(maxRows)} OFFSET ${Number(offset) || 0}` : (offset ? `LIMIT -1 OFFSET ${Number(offset)}` : '');
      const res = f.db.exec(`SELECT ${cols.map(quoteIdent).join(', ')} ${base} ${order} ${limit}`, where.params);
      const out = rowsFrom(res);
      return { ...out, columns: out.columns.length ? out.columns : cols, rowCount: total, table: t };
    },

    async executeSql({ folderPath, schemaName = 'lists', sql, maxRows = -1 }) {
      assertSchema(schemaName);
      const f = await open(folderPath);
      await ensure(f, tablesIn(f, sql));
      const translated = translateLabkeySql(sql);
      let res;
      try {
        res = f.db.exec(translated);
      } catch (e) {
        const err = new Error(labkeyErrorMessage(e.message));
        err.status = 400;
        err.translated = translated;
        throw err;
      }
      const out = rowsFrom(res);
      if (maxRows >= 0) out.rows = out.rows.slice(0, maxRows);
      return { ...out, rowCount: out.rows.length, translated };
    },

    async distinctValues({ folderPath, queryName, column, filters = [], limit = 250 }) {
      const f = await open(folderPath);
      const t = await api.table(folderPath, queryName);
      await ensure(f, [t.name]);
      const col = t.columns.find(c => c.name.toLowerCase() === String(column).toLowerCase());
      if (!col) return [];
      const where = buildWhere(filters.filter(x => x.column.toLowerCase() !== col.name.toLowerCase()));
      const res = f.db.exec(`SELECT ${quoteIdent(col.name)} AS v, COUNT(*) AS n FROM ${quoteIdent(t.name)} ${where.sql} GROUP BY 1 ORDER BY 1 LIMIT ${limit}`, where.params);
      return (res[0]?.values || []).map(([v, n]) => ({ value: v, count: n }));
    },

    /** SQLite file bytes of the whole release: every table with its rows, plus _lk_tables and _lk_columns (captions, types). */
    async exportDatabase(folderPath) {
      const f = await open(folderPath);
      await ensure(f, [...f.files.keys()]);
      const bytes = f.db.export();
      // (sql.js forgets the functions it was given when it exports)
      registerFunctions(f.db);
      const SQL = await loadSqlJs();
      const copy = new SQL.Database(bytes);
      try {
        copy.run('BEGIN');
        copy.run('CREATE TABLE _lk_tables (name TEXT, category TEXT, row_count INTEGER)');
        copy.run('CREATE TABLE _lk_columns (table_name TEXT, column_name TEXT, caption TEXT, type TEXT, position INTEGER)');
        const st = copy.prepare('INSERT INTO _lk_tables VALUES (?, ?, ?)');
        const sc = copy.prepare('INSERT INTO _lk_columns VALUES (?, ?, ?, ?, ?)');
        for (const t of f.schema.tables) {
          st.run([t.name, t.category || '', f.rowCounts.get(t.name.toLowerCase()) || 0]);
          t.columns.forEach((c, i) => sc.run([t.name, c.name, c.label || c.name, c.type || 'String', i + 1]));
        }
        st.free(); sc.free();
        copy.run('COMMIT');
        return copy.export();
      } finally { copy.close(); }
    },

    /**
     * The database file R and Python start from: every table's columns, the rows of the tables loaded in Settings, and
     * _lk_tables and _lk_columns (names, categories, row counts, captions, types) and _lk_files (the address of each
     * bundled table's TSV). Their clients fetch a bundled table when one of their queries first names it.
     */
    async clientDatabase(folderPath) {
      const f = await open(folderPath);
      const SQL = await loadSqlJs();
      const copy = new SQL.Database();
      try {
        copy.run('BEGIN');
        for (const t of f.schema.tables) copy.run(createTableSql(t));
        copy.run('CREATE TABLE _lk_tables (name TEXT, category TEXT, row_count INTEGER)');
        copy.run('CREATE TABLE _lk_columns (table_name TEXT, column_name TEXT, caption TEXT, type TEXT, position INTEGER)');
        copy.run('CREATE TABLE _lk_files (table_name TEXT, url TEXT)');
        const st = copy.prepare('INSERT INTO _lk_tables VALUES (?, ?, ?)');
        const sc = copy.prepare('INSERT INTO _lk_columns VALUES (?, ?, ?, ?, ?)');
        const sf = copy.prepare('INSERT INTO _lk_files VALUES (?, ?)');
        for (const t of f.schema.tables) {
          const n = t.name.toLowerCase();
          st.run([t.name, t.category || '', f.rowCounts.get(n) || 0]);
          t.columns.forEach((c, i) => sc.run([t.name, c.name, c.label || c.name, c.type || 'String', i + 1]));
          if (f.bundled.has(n) && !f.uploaded.has(n)) sf.run([t.name, siteUrl(f.dataUrl + f.bundled.get(n))]);
        }
        st.free(); sc.free(); sf.free();
        copy.run('COMMIT');
        // the tables loaded in Settings travel with their rows (they are in no file of the website)
        for (const n of f.uploaded) {
          const t = f.tables.get(n);
          if (!t) continue;
          const names = t.columns.map(c => quoteIdent(c.name)).join(', ');
          const res = f.db.exec(`SELECT ${names} FROM ${quoteIdent(t.name)}`);
          if (!res.length) continue;
          copy.run('BEGIN');
          const ins = copy.prepare(`INSERT INTO ${quoteIdent(t.name)} (${names}) VALUES (${t.columns.map(() => '?').join(', ')})`);
          for (const row of res[0].values) ins.run(row);
          ins.free();
          copy.run('COMMIT');
        }
        return copy.export();
      } finally { copy.close(); }
    },

    /**
     * The files R and Python read (written into the shared file system, which copies them into R's and Python's own):
     *   /resources/labkey/<release folder>.sqlite   one database per data release (clientDatabase)
     *   /resources/labkey/server.tsv                the server's names, its folders and the user
     * Done once, and again when table data change.
     */
    writeFiles() {
      if (!filesPromise) {
        filesPromise = (async () => {
          const MG = window.MG;
          const fs = MG && MG.app && MG.app.fs;
          if (!fs) return false;
          const put = (p, entry) => {
            const isNew = !fs.entries.has(p);
            fs.entries.set(p, { mtime: Date.now(), protected: true, readonly: true, ...entry });
            if (isNew && fs._dirTouched) fs._dirTouched(p);
            if (fs._changed) fs._changed(p, 'write');
          };
          const DB = CONFIG.dataBrowser;
          const lines = [['context', DB.contextPath], ['user', RE.session.username],
            ...[...new Set([DB.host, ...(DB.acceptedHosts || [])])].map(hh => ['host', hh]),
            ...DB.projects.map(p => ['project', p.name])];
          for (const rel of releases()) {
            try {
              const bytes = await api.clientDatabase(rel.folderPath);
              put(`/resources/labkey/${rel.folder}.sqlite`, { kind: 'blob', blob: new Blob([bytes], { type: 'application/vnd.sqlite3' }), size: bytes.length });
              lines.push(['release', rel.folderPath, `${rel.folder}.sqlite`, rel.project, rel.folder]);
            } catch (e) { console.warn('[labkey] cannot prepare', rel.folderPath, e); }
          }
          const text = lines.map(l => l.join('\t')).join('\n') + '\n';
          put('/resources/labkey/server.tsv', { kind: 'text', text, size: new Blob([text]).size });
          return true;
        })().catch((e) => { filesPromise = null; throw e; });
      }
      return filesPromise;
    },

    /** The website's sign-in lasts as long as the desktop session (like a session cookie). */
    signedIn: false,

    /** Load (replace) a table from TSV text. persist=true keeps it in this browser. */
    async loadTable(folderPath, table, text, { persist = true } = {}) {
      const f = await open(folderPath);
      f.files.delete(String(table).toLowerCase());
      f.uploaded.add(String(table).toLowerCase());
      const n = insertTsv(f, table, text, { replace: true });
      refreshCounts(f);
      if (persist) await idb.set(`labkey:${f.folderPath}:${table.toLowerCase()}`, text);
      ev.emit('change', { folderPath: f.folderPath, table });
      return n;
    },

    async clearUploads() {
      for (const key of await idb.keys('labkey:')) await idb.del(key);
      cache.clear();
      ev.emit('change', {});
    },

    toTsv(columns, rows) {
      const esc = (v) => (v === null || v === undefined ? '' : String(v).replace(/[\t\n]/g, ' '));
      return [columns.join('\t'), ...rows.map(r => columns.map(c => esc(r[c])).join('\t'))].join('\n') + '\n';
    },

    toCsv(columns, rows) {
      const esc = (v) => { if (v === null || v === undefined) return ''; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      return [columns.map(esc).join(','), ...rows.map(r => columns.map(c => esc(r[c])).join(','))].join('\n') + '\n';
    },
  };
  return api;
}
