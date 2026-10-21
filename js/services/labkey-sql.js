// =============================================================================
// LabKey SQL -> SQLite translation.
//
// LabKey SQL is close to standard SQL. The differences that matter for the
// queries used in the RE documentation and practicals are handled here:
//   * schema prefix            lists.participant        -> participant
//   * date part functions      YEAR(x), MONTH(x), ...   -> strftime(...)
//   * NOW(), CURDATE(), CURTIME()
//   * TIMESTAMPDIFF(SQL_TSI_DAY, a, b), TIMESTAMPADD(...), AGE(a[, b])
//   * CAST(x AS DATE|TIMESTAMP|VARCHAR|DOUBLE|FLOAT|BIGINT)
//   * ILIKE                    -> LIKE
//   * STDDEV / VARIANCE        -> stdev / variance (provided as aggregates)
//
// The R (Rlabkey) and Python (labkey) client stand-ins use this very file: it is
// evaluated in R's and Python's workers (js/engine/labkey-clients.js), so a
// query behaves identically from every tool. Keep it free of imports.
// =============================================================================

const DATE_PARTS = {
  YEAR: "CAST(strftime('%Y', $1) AS INTEGER)",
  MONTH: "CAST(strftime('%m', $1) AS INTEGER)",
  DAY: "CAST(strftime('%d', $1) AS INTEGER)",
  DAYOFMONTH: "CAST(strftime('%d', $1) AS INTEGER)",
  DAYOFYEAR: "CAST(strftime('%j', $1) AS INTEGER)",
  DAYOFWEEK: "(CAST(strftime('%w', $1) AS INTEGER) + 1)",
  WEEK: "CAST(strftime('%W', $1) AS INTEGER)",
  QUARTER: "((CAST(strftime('%m', $1) AS INTEGER) + 2) / 3)",
  HOUR: "CAST(strftime('%H', $1) AS INTEGER)",
  MINUTE: "CAST(strftime('%M', $1) AS INTEGER)",
  SECOND: "CAST(strftime('%S', $1) AS INTEGER)",
};

const TSI_FACTORS = {
  SQL_TSI_FRAC_SECOND: '* 86400000', SQL_TSI_SECOND: '* 86400', SQL_TSI_MINUTE: '* 1440', SQL_TSI_HOUR: '* 24',
  SQL_TSI_DAY: '', SQL_TSI_WEEK: '/ 7', SQL_TSI_MONTH: '/ 30.4375', SQL_TSI_QUARTER: '/ 91.3125', SQL_TSI_YEAR: '/ 365.25',
};
const TSI_MODIFIERS = {
  SQL_TSI_SECOND: 'seconds', SQL_TSI_MINUTE: 'minutes', SQL_TSI_HOUR: 'hours', SQL_TSI_DAY: 'days',
  SQL_TSI_WEEK: 'weeks', SQL_TSI_MONTH: 'months', SQL_TSI_QUARTER: 'quarters', SQL_TSI_YEAR: 'years',
};

const CAST_TYPES = {
  DATE: (x) => `date(${x})`,
  TIMESTAMP: (x) => `datetime(${x})`,
  DATETIME: (x) => `datetime(${x})`,
  TIME: (x) => `time(${x})`,
  VARCHAR: (x) => `CAST(${x} AS TEXT)`,
  CHAR: (x) => `CAST(${x} AS TEXT)`,
  STRING: (x) => `CAST(${x} AS TEXT)`,
  TEXT: (x) => `CAST(${x} AS TEXT)`,
  DOUBLE: (x) => `CAST(${x} AS REAL)`,
  FLOAT: (x) => `CAST(${x} AS REAL)`,
  REAL: (x) => `CAST(${x} AS REAL)`,
  DECIMAL: (x) => `CAST(${x} AS REAL)`,
  NUMERIC: (x) => `CAST(${x} AS REAL)`,
  INTEGER: (x) => `CAST(${x} AS INTEGER)`,
  INT: (x) => `CAST(${x} AS INTEGER)`,
  BIGINT: (x) => `CAST(${x} AS INTEGER)`,
  SMALLINT: (x) => `CAST(${x} AS INTEGER)`,
  BOOLEAN: (x) => `CAST(${x} AS INTEGER)`,
};

/** Split the text between parentheses into top-level comma separated args. */
function splitArgs(s) {
  const out = [];
  let depth = 0, cur = '', q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim() || out.length) out.push(cur.trim());
  return out;
}

/** Find the index of the parenthesis closing the one at `open`. */
function matchParen(s, open) {
  let depth = 0, q = null;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** Mask string literals so keyword replacements never touch them. */
function maskStrings(sql) {
  const strings = [];
  const masked = sql.replace(/'(?:[^']|'')*'/g, (m) => { strings.push(m); return `\u0000${strings.length - 1}\u0000`; });
  return { masked, unmask: (s) => s.replace(/\u0000(\d+)\u0000/g, (_, i) => strings[Number(i)]) };
}

function rewriteFunctions(sql, unmask = (x) => x) {
  const fnRe = /\b(YEAR|MONTH|DAYOFMONTH|DAYOFYEAR|DAYOFWEEK|DAY|WEEK|QUARTER|HOUR|MINUTE|SECOND|TIMESTAMPDIFF|TIMESTAMPADD|AGE|CAST|NOW|CURDATE|CURTIME|STDDEV|STDDEV_SAMP|VARIANCE|VAR_SAMP)\s*\(/gi;
  let out = '';
  let pos = 0;
  let m;
  fnRe.lastIndex = 0;
  while ((m = fnRe.exec(sql))) {
    const name = m[1].toUpperCase();
    const open = m.index + m[0].length - 1;
    const close = matchParen(sql, open);
    if (close < 0) break;
    const inner = rewriteFunctions(sql.slice(open + 1, close), unmask);
    const args = splitArgs(inner);
    let rep = null;
    if (DATE_PARTS[name]) rep = DATE_PARTS[name].replace('$1', args[0]);
    else if (name === 'NOW') rep = "datetime('now')";
    else if (name === 'CURDATE') rep = "date('now')";
    else if (name === 'CURTIME') rep = "time('now')";
    else if (name === 'STDDEV' || name === 'STDDEV_SAMP') rep = `stdev(${inner})`;
    else if (name === 'VARIANCE' || name === 'VAR_SAMP') rep = `variance(${inner})`;
    else if (name === 'TIMESTAMPDIFF' && args.length === 3) {
      const unit = unmask(args[0]).replace(/['"]/g, '').toUpperCase();
      const f = TSI_FACTORS[unit] ?? '';
      rep = `CAST((julianday(${args[2]}) - julianday(${args[1]})) ${f} AS INTEGER)`;
    } else if (name === 'TIMESTAMPADD' && args.length === 3) {
      const unit = unmask(args[0]).replace(/['"]/g, '').toUpperCase();
      const mod = TSI_MODIFIERS[unit] || 'days';
      rep = mod === 'weeks' ? `datetime(${args[2]}, (${args[1]}) * 7 || ' days')`
        : mod === 'quarters' ? `datetime(${args[2]}, (${args[1]}) * 3 || ' months')`
          : `datetime(${args[2]}, (${args[1]}) || ' ${mod}')`;
    } else if (name === 'AGE') {
      const end = args[1] ? args[1] : "date('now')";
      rep = `CAST((julianday(${end}) - julianday(${args[0]})) / 365.25 AS INTEGER)`;
    } else if (name === 'CAST') {
      const am = inner.match(/^([\s\S]*)\s+AS\s+([A-Za-z_]+)\s*(\(\s*\d+(\s*,\s*\d+)?\s*\))?\s*$/i);
      if (am) {
        const fn = CAST_TYPES[am[2].toUpperCase()];
        rep = fn ? fn(am[1].trim()) : `CAST(${inner})`;
      } else rep = `CAST(${inner})`;
    }
    if (rep === null) rep = `${m[1]}(${inner})`;
    out += sql.slice(pos, m.index) + rep;
    pos = close + 1;
    fnRe.lastIndex = close + 1;
  }
  return out + sql.slice(pos);
}

export function translateLabkeySql(sql) {
  const { masked, unmask } = maskStrings(String(sql));
  let s = masked;
  s = s.replace(/\blists\s*\.\s*/gi, '');
  s = s.replace(/\bILIKE\b/gi, 'LIKE');
  s = rewriteFunctions(s, unmask);
  s = s.replace(/;\s*$/, '');
  return unmask(s);
}

// ---------------------------------------------------------------- filters
// Filter operators shared by the GUI, R makeFilter() and Python QueryFilter.
// Each maps to SQL with ? placeholders.
export const FILTER_OPS = {
  any: { label: 'Has Any Value', sql: () => '1=1', arity: 0 },
  eq: { label: 'Equals', sql: (c) => `${c} = ?`, arity: 1 },
  neq: { label: 'Does Not Equal', sql: (c) => `(${c} IS NULL OR ${c} <> ?)`, arity: 1 },
  neqornull: { label: 'Does Not Equal', sql: (c) => `(${c} IS NULL OR ${c} <> ?)`, arity: 1 },
  isblank: { label: 'Is Blank', sql: (c) => `(${c} IS NULL OR ${c} = '')`, arity: 0 },
  isnonblank: { label: 'Is Not Blank', sql: (c) => `(${c} IS NOT NULL AND ${c} <> '')`, arity: 0 },
  gt: { label: 'Is Greater Than', sql: (c) => `${c} > ?`, arity: 1 },
  gte: { label: 'Is Greater Than or Equal To', sql: (c) => `${c} >= ?`, arity: 1 },
  lt: { label: 'Is Less Than', sql: (c) => `${c} < ?`, arity: 1 },
  lte: { label: 'Is Less Than or Equal To', sql: (c) => `${c} <= ?`, arity: 1 },
  contains: { label: 'Contains', sql: (c) => `${c} LIKE '%' || ? || '%'`, arity: 1 },
  doesnotcontain: { label: 'Does Not Contain', sql: (c) => `(${c} IS NULL OR ${c} NOT LIKE '%' || ? || '%')`, arity: 1 },
  startswith: { label: 'Starts With', sql: (c) => `${c} LIKE ? || '%'`, arity: 1 },
  doesnotstartwith: { label: 'Does Not Start With', sql: (c) => `(${c} IS NULL OR ${c} NOT LIKE ? || '%')`, arity: 1 },
  in: { label: 'Equals One Of', list: true },
  notin: { label: 'Does Not Equal Any Of', list: true, negate: true },
  containsoneof: { label: 'Contains One Of', list: true, like: true },
  containsnoneof: { label: 'Does Not Contain Any Of', list: true, like: true, negate: true },
  between: { label: 'Between', sql: (c) => `${c} BETWEEN ? AND ?`, arity: 2 },
  notbetween: { label: 'Not Between', sql: (c) => `(${c} NOT BETWEEN ? AND ?)`, arity: 2 },
  dateeq: { label: 'Equals (date)', sql: (c) => `date(${c}) = date(?)`, arity: 1 },
  dateneq: { label: 'Does Not Equal (date)', sql: (c) => `(${c} IS NULL OR date(${c}) <> date(?))`, arity: 1 },
  dategt: { label: 'Is Greater Than (date)', sql: (c) => `date(${c}) > date(?)`, arity: 1 },
  dategte: { label: 'Is Greater Than or Equal To (date)', sql: (c) => `date(${c}) >= date(?)`, arity: 1 },
  datelt: { label: 'Is Less Than (date)', sql: (c) => `date(${c}) < date(?)`, arity: 1 },
  datelte: { label: 'Is Less Than or Equal To (date)', sql: (c) => `date(${c}) <= date(?)`, arity: 1 },
};

// Aliases used by Rlabkey makeFilter() and the Python QueryFilter.Types names.
export const FILTER_ALIASES = {
  EQUAL: 'eq', EQUALS: 'eq', EQ: 'eq', NOT_EQUAL: 'neq', NEQ: 'neq', NOT_EQUAL_OR_MISSING: 'neqornull', NEQ_OR_NULL: 'neqornull',
  MISSING: 'isblank', IS_MISSING: 'isblank', ISBLANK: 'isblank', IS_BLANK: 'isblank',
  NOT_MISSING: 'isnonblank', IS_NOT_MISSING: 'isnonblank', ISNONBLANK: 'isnonblank', IS_NOT_BLANK: 'isnonblank', NON_BLANK: 'isnonblank',
  GREATER_THAN: 'gt', GT: 'gt', GREATER_THAN_OR_EQUAL: 'gte', GREATER_THAN_OR_EQUAL_TO: 'gte', GTE: 'gte',
  LESS_THAN: 'lt', LT: 'lt', LESS_THAN_OR_EQUAL: 'lte', LESS_THAN_OR_EQUAL_TO: 'lte', LTE: 'lte',
  CONTAINS: 'contains', DOES_NOT_CONTAIN: 'doesnotcontain', DOESNOTCONTAIN: 'doesnotcontain',
  STARTS_WITH: 'startswith', STARTSWITH: 'startswith', DOES_NOT_START_WITH: 'doesnotstartwith', DOESNOTSTARTWITH: 'doesnotstartwith',
  IN: 'in', EQUALS_ONE_OF: 'in', NOT_IN: 'notin', EQUALS_NONE_OF: 'notin', NOTIN: 'notin',
  CONTAINS_ONE_OF: 'containsoneof', CONTAINS_NONE_OF: 'containsnoneof',
  BETWEEN: 'between', NOT_BETWEEN: 'notbetween', NOTBETWEEN: 'notbetween',
  DATE_EQUAL: 'dateeq', DATE_NOT_EQUAL: 'dateneq', DATE_GREATER_THAN: 'dategt', DATE_GREATER_THAN_OR_EQUAL: 'dategte',
  DATE_LESS_THAN: 'datelt', DATE_LESS_THAN_OR_EQUAL: 'datelte', HAS_ANY_VALUE: 'any',
};

export function normaliseOp(op) {
  if (op === '') return 'any';
  if (!op) return 'eq';
  const k = String(op).trim();
  if (FILTER_OPS[k.toLowerCase()]) return k.toLowerCase();
  return FILTER_ALIASES[k.toUpperCase()] || 'eq';
}

const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;
export { quoteIdent };

/** Build a WHERE clause from [{column, op, value}]. Returns {sql, params}. */
export function buildWhere(filters = []) {
  const parts = [], params = [];
  for (const f of filters) {
    const op = normaliseOp(f.op);
    const def = FILTER_OPS[op];
    const col = quoteIdent(f.column);
    if (def.list) {
      const values = Array.isArray(f.value) ? f.value : String(f.value ?? '').split(/;/).map(s => s.trim()).filter(s => s !== '');
      if (!values.length) { parts.push(def.negate ? '1=1' : '1=0'); continue; }
      if (def.like) {
        const ors = values.map(() => `${col} LIKE '%' || ? || '%'`).join(' OR ');
        parts.push(def.negate ? `NOT (${ors})` : `(${ors})`);
      } else {
        const ph = values.map(() => '?').join(', ');
        parts.push(def.negate ? `(${col} IS NULL OR ${col} NOT IN (${ph}))` : `${col} IN (${ph})`);
      }
      params.push(...values);
    } else if (def.arity === 2) {
      const [a, b] = Array.isArray(f.value) ? f.value : String(f.value ?? '').split(',').map(s => s.trim());
      parts.push(def.sql(col));
      params.push(a, b);
    } else if (def.arity === 1) {
      parts.push(def.sql(col));
      params.push(f.value);
    } else {
      parts.push(def.sql(col));
    }
  }
  return { sql: parts.length ? 'WHERE ' + parts.join(' AND ') : '', params };
}

/** A LabKey-style message for an SQLite error: the website and the R and Python clients show the same. */
export function labkeyErrorMessage(msg) {
  const m = String(msg || '').replace(/^Error:\s*/, '');
  let x;
  if ((x = /no such table:\s*(?:main\.)?(\S+)/i.exec(m))) return `Error on line 1: Query or table not found: ${x[1]}`;
  if ((x = /no such column:\s*(\S+)/i.exec(m))) return `Error on line 1: Column not found: ${x[1]}`;
  if ((x = /ambiguous column name:\s*(\S+)/i.exec(m))) return `Error on line 1: Ambiguous column name: ${x[1]}`;
  if ((x = /near "([^"]*)": syntax error/i.exec(m))) return `Error on line 1: Syntax error near '${x[1]}'`;
  if (/incomplete input/i.test(m)) return 'Error on line 1: Syntax error: the query ends too early';
  if ((x = /no such function:\s*(\S+)/i.exec(m))) return `Error on line 1: Unknown method: ${x[1]}`;
  if (/^Error on line/.test(m)) return m;
  return `Error on line 1: ${m}`;
}
