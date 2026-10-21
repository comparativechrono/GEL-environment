// =============================================================================
// Simulated LabKey-style data server.
//
// Each data-release folder (e.g. /main-programme/main-programme_v19_2024-10-31)
// is an in-browser SQLite database (sql.js) created from:
//   1. the table schema  data/labkey/schema/<folder>.json   (all tables, empty)
//   2. optional data      data/labkey/data/<folder>/index.json + <table>.tsv
//   3. optional uploads   TSV files an instructor loads in Settings (IndexedDB)
//
// The GUI (LabKeeper site) queries it directly. R and Python receive an exported
// copy of the same database file (/resources/labkey/<folder>.sqlite) and query it
// through the Rlabkey / labkey stand-ins – R with sql.js inside R's worker, Python
// with its sqlite3 – so results are identical everywhere (js/engine/labkey-clients.js).
// =============================================================================

import { CONFIG } from '../config.js';
import { loadScript, siteUrl } from '../core/util.js';
import { idb } from '../core/store.js';
import { Emitter } from '../core/bus.js';
import { translateLabkeySql, buildWhere, quoteIdent, labkeyErrorMessage } from './labkey-sql.js';

const SQL_TYPES = {
  Integer: 'INTEGER', Decimal: 'REAL', Double: 'REAL', Boolean: 'INTEGER',
  Date: 'TEXT', DateTime: 'TEXT', Time: 'TEXT', Enum: 'TEXT', String: 'TEXT', 'Clinical code': 'TEXT',
};

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

function parseTsv(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.length);
  if (!lines.length) return { header: [], rows: [] };
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const split = sep === '\t' ? (l) => l.split('\t') : splitCsvLine;
  const header = split(lines[0]).map(s => s.trim());
  const rows = lines.slice(1).map(split);
  return { header, rows };
}

function splitCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function convert(value, type) {
  if (value === undefined || value === null) return null;
  const v = String(value);
  if (v === '' || v === 'NA' || v === 'NULL' || v === 'null') return null;
  if (type === 'Integer') { const n = parseInt(v, 10); return isNaN(n) ? v : n; }
  if (type === 'Decimal' || type === 'Double') { const n = parseFloat(v); return isNaN(n) ? v : n; }
  if (type === 'Boolean') return /^(true|t|yes|y|1)$/i.test(v) ? 1 : /^(false|f|no|n|0)$/i.test(v) ? 0 : v;
  return v;
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
      const cols = t.columns.map(c => `${quoteIdent(c.name)} ${SQL_TYPES[c.type] || 'TEXT'}`).join(', ');
      db.run(`CREATE TABLE ${quoteIdent(t.name)} (${cols})`);
      tables.set(t.name.toLowerCase(), t);
    }
    db.run('COMMIT');
    const folder = { ...rel, schema, db, tables, rowCounts: new Map(), loaded: [] };
    // bundled data
    try {
      const res = await fetch(siteUrl(rel.dataUrl + 'index.json'));
      if (res.ok) {
        const index = await res.json();
        for (const [table, file] of Object.entries(index.tables || {})) {
          const r = await fetch(siteUrl(rel.dataUrl + file));
          if (r.ok) insertTsv(folder, table, await r.text());
        }
      }
    } catch (e) { console.warn('[labkey] no bundled data for', rel.folderPath, e); }
    // instructor uploads
    for (const key of await idb.keys(`labkey:${rel.folderPath}:`)) {
      const text = await idb.get(key);
      const table = key.split(':').pop();
      if (text) insertTsv(folder, table, text, { replace: true });
    }
    refreshCounts(folder);
    return folder;
  }

  function insertTsv(folder, tableName, text, { replace = false } = {}) {
    const t = folder.tables.get(String(tableName).toLowerCase());
    if (!t) { console.warn('[labkey] unknown table in data:', tableName); return 0; }
    const { header, rows } = parseTsv(text);
    const colByName = new Map(t.columns.map(c => [c.name.toLowerCase(), c]));
    const usable = header.map(h => colByName.get(h.toLowerCase()) || null);
    const unknown = header.filter((h, i) => !usable[i]);
    if (unknown.length) console.warn(`[labkey] ${t.name}: ignoring unknown columns`, unknown);
    const cols = usable.filter(Boolean);
    if (!cols.length) return 0;
    const db = folder.db;
    db.run('BEGIN');
    if (replace) db.run(`DELETE FROM ${quoteIdent(t.name)}`);
    const stmt = db.prepare(`INSERT INTO ${quoteIdent(t.name)} (${cols.map(c => quoteIdent(c.name)).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
    for (const r of rows) {
      const vals = [];
      usable.forEach((c, i) => { if (c) vals.push(convert(r[i], c.type)); });
      stmt.run(vals);
    }
    stmt.free();
    db.run('COMMIT');
    folder.loaded.push(t.name);
    return rows.length;
  }

  function refreshCounts(folder) {
    for (const t of folder.schema.tables) {
      const r = folder.db.exec(`SELECT COUNT(*) FROM ${quoteIdent(t.name)}`);
      folder.rowCounts.set(t.name.toLowerCase(), r[0]?.values[0][0] ?? 0);
    }
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
      const col = t.columns.find(c => c.name.toLowerCase() === String(column).toLowerCase());
      if (!col) return [];
      const where = buildWhere(filters.filter(x => x.column.toLowerCase() !== col.name.toLowerCase()));
      const res = f.db.exec(`SELECT ${quoteIdent(col.name)} AS v, COUNT(*) AS n FROM ${quoteIdent(t.name)} ${where.sql} GROUP BY 1 ORDER BY 1 LIMIT ${limit}`, where.params);
      return (res[0]?.values || []).map(([v, n]) => ({ value: v, count: n }));
    },

    /** SQLite file bytes for the R / Python clients: the tables plus _lk_tables and _lk_columns (captions, types). */
    async exportDatabase(folderPath) {
      const f = await open(folderPath);
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
     * The files R and Python read (written into the shared file system, which copies them into R's and Python's own):
     *   /resources/labkey/<release folder>.sqlite   one database per data release
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
              const bytes = await api.exportDatabase(rel.folderPath);
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
