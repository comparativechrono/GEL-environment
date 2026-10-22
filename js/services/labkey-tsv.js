// =============================================================================
// A data release's tables from text: the CREATE TABLE statements of the schema
// and a table's rows read from TSV (or CSV) with the data dictionary's types.
//
// Used by the data server (labkey-server.js) and, as plain script, by the R and
// Python clients' workers (labkey-clients.js), which fetch a table's TSV file
// from the website the first time one of their queries names the table. So
// this module imports nothing, and its names must not clash with those of
// labkey-sql.js, which is evaluated in the same worker script.
// =============================================================================

/** SQLite column types for the data dictionary's types. */
export const SQL_TYPES = {
  Integer: 'INTEGER', Decimal: 'REAL', Double: 'REAL', Boolean: 'INTEGER',
  Date: 'TEXT', DateTime: 'TEXT', Time: 'TEXT', Enum: 'TEXT', String: 'TEXT', 'Clinical code': 'TEXT',
};

const quoteName = (s) => '"' + String(s).replace(/"/g, '""') + '"';

/** CREATE TABLE for a table of the schema ({name, columns: [{name, type}]}). */
export function createTableSql(t) {
  return `CREATE TABLE ${quoteName(t.name)} (${t.columns.map(c => `${quoteName(c.name)} ${SQL_TYPES[c.type] || 'TEXT'}`).join(', ')})`;
}

export function parseTsv(text) {
  const lines = String(text).replace(/\r/g, '').split('\n').filter(l => l.length);
  if (!lines.length) return { header: [], rows: [] };
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const split = sep === '\t' ? (l) => l.split('\t') : splitCsvLine;
  const header = split(lines[0]).map(s => s.trim());
  const rows = lines.slice(1).map(split);
  return { header, rows };
}

export function splitCsvLine(line) {
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

/** A TSV field as the column's type stores it ('' and NA are missing). */
export function convertValue(value, type) {
  if (value === undefined || value === null) return null;
  const v = String(value);
  if (v === '' || v === 'NA' || v === 'NULL' || v === 'null') return null;
  if (type === 'Integer') { const n = parseInt(v, 10); return isNaN(n) ? v : n; }
  if (type === 'Decimal' || type === 'Double') { const n = parseFloat(v); return isNaN(n) ? v : n; }
  if (type === 'Boolean') return /^(true|t|yes|y|1)$/i.test(v) ? 1 : /^(false|f|no|n|0)$/i.test(v) ? 0 : v;
  return v;
}

/**
 * Inserts TSV text into a table of a sql.js database. columns = the table's [{name, type}].
 * Returns {rows, unknown}: the number of rows, and the header's names that are not columns (left out).
 */
export function insertTsvRows(db, table, columns, text, { replace = false } = {}) {
  const { header, rows } = parseTsv(text);
  const byName = new Map(columns.map(c => [String(c.name).toLowerCase(), c]));
  const usable = header.map(h => byName.get(h.toLowerCase()) || null);
  const unknown = header.filter((h, i) => !usable[i]);
  const cols = usable.filter(Boolean);
  if (!cols.length) return { rows: 0, unknown };
  db.run('BEGIN');
  try {
    if (replace) db.run(`DELETE FROM ${quoteName(table)}`);
    const stmt = db.prepare(`INSERT INTO ${quoteName(table)} (${cols.map(c => quoteName(c.name)).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
    try {
      for (const r of rows) {
        const vals = [];
        usable.forEach((c, i) => { if (c) vals.push(convertValue(r[i], c.type)); });
        stmt.run(vals);
      }
    } finally { stmt.free(); }
    db.run('COMMIT');
  } catch (e) {
    try { db.run('ROLLBACK'); } catch { /* none open */ }
    throw e;
  }
  return { rows: rows.length, unknown };
}

/** The table names of a schema that a SQL text names (any word that is one; a few extra loads are harmless). */
export function tablesNamedIn(sql, names) {
  const words = new Set(String(sql || '').toLowerCase().match(/[a-z_][a-z0-9_]*/g) || []);
  return names.filter(n => words.has(String(n).toLowerCase()));
}
