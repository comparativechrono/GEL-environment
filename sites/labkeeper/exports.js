// =============================================================================
// Export of a grid (or of SQL results): Excel workbook, text (TSV / CSV), or
// a script – R (Rlabkey) or Python (labkey) code that fetches the same rows,
// with the same filters and sort, to paste into RStudio or Spyder.
// Files are saved in ~/Downloads inside the Research Environment.
// =============================================================================

import { h, browser, CONFIG } from '../common/site.js';
import { loadScript } from '../../js/core/util.js';
import { dialog, tabs } from './ui.js';

const R_OPS = { eq: 'EQUAL', neq: 'NOT_EQUAL', neqornull: 'NOT_EQUAL_OR_MISSING', gt: 'GREATER_THAN', gte: 'GREATER_THAN_OR_EQUAL', lt: 'LESS_THAN',
  lte: 'LESS_THAN_OR_EQUAL', contains: 'CONTAINS', doesnotcontain: 'DOES_NOT_CONTAIN', startswith: 'STARTS_WITH', doesnotstartwith: 'DOES_NOT_START_WITH',
  in: 'IN', notin: 'NOT_IN', containsoneof: 'CONTAINS_ONE_OF', containsnoneof: 'CONTAINS_NONE_OF', isblank: 'MISSING', isnonblank: 'NOT_MISSING',
  between: 'BETWEEN', notbetween: 'NOT_BETWEEN', dateeq: 'DATE_EQUAL', dateneq: 'DATE_NOT_EQUAL', dategt: 'DATE_GREATER_THAN', dategte: 'DATE_GREATER_THAN_OR_EQUAL',
  datelt: 'DATE_LESS_THAN', datelte: 'DATE_LESS_THAN_OR_EQUAL' };
const PY_OPS = { eq: 'EQUAL', neq: 'NOT_EQUAL', neqornull: 'NEQ_OR_NULL', gt: 'GREATER_THAN', gte: 'GREATER_THAN_OR_EQUAL', lt: 'LESS_THAN', lte: 'LESS_THAN_OR_EQUAL',
  contains: 'CONTAINS', doesnotcontain: 'DOES_NOT_CONTAIN', startswith: 'STARTS_WITH', doesnotstartwith: 'DOES_NOT_START_WITH', in: 'IN', notin: 'NOT_IN',
  containsoneof: 'CONTAINS_ONE_OF', containsnoneof: 'CONTAINS_NONE_OF', isblank: 'IS_BLANK', isnonblank: 'IS_NOT_BLANK', between: 'BETWEEN', notbetween: 'NOT_BETWEEN',
  dateeq: 'DATE_EQUAL', dateneq: 'DATE_NOT_EQUAL', dategt: 'DATE_GREATER_THAN', dategte: 'DATE_GREATER_THAN_OR_EQUAL', datelt: 'DATE_LESS_THAN', datelte: 'DATE_LESS_THAN_OR_EQUAL' };

const DB = () => CONFIG.dataBrowser;
export const baseUrl = () => `https://${DB().host}/${DB().contextPath}`;
const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`; };
const rq = (s) => JSON.stringify(String(s));
const pq = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

// --------------------------------------------------------------- scripts
export function rScript(spec) {
  const lines = ['library(Rlabkey)', ''];
  if (spec.sql) {
    lines.push("# Run the query; the results go into a data frame called 'labkey.data'", '',
      'labkey.data <- labkey.executeSql(',
      `    baseUrl=${rq(baseUrl())},`,
      `    folderPath=${rq(spec.folderPath)},`,
      '    schemaName="lists",',
      `    sql=${rq(spec.sql.trim())},`,
      '    colNameOpt="rname"', ')');
    return lines.join('\n') + '\n';
  }
  const st = spec.state;
  const args = [`    baseUrl=${rq(baseUrl())}`, `    folderPath=${rq(spec.folderPath)}`, '    schemaName="lists"', `    queryName=${rq(spec.queryName)}`, '    viewName=""'];
  if (st.columns && st.columns.length) args.push(`    colSelect=${rq(st.columns.join(','))}`);
  if (st.sort.length) args.push(`    colSort=${rq(st.sort.map(s => (s.dir === 'DESC' ? '-' : '') + s.column).join(','))}`);
  const flt = st.filters.filter(f => f.op !== 'any');
  args.push(flt.length ? `    colFilter=makeFilter(${flt.map(f => `c(${rq(f.column)}, ${rq(R_OPS[f.op] || f.op.toUpperCase())}, ${rq(f.value ?? '')})`).join(', ')})` : '    colFilter=NULL');
  args.push('    containerFilter=NULL', '    colNameOpt="rname"');
  lines.push("# Select rows into a data frame called 'labkey.data'", '', 'labkey.data <- labkey.selectRows(', args.join(',\n'), ')');
  return lines.join('\n') + '\n';
}

export function pyScript(spec) {
  const dom = DB().host, cp = spec.folderPath.replace(/^\//, '');
  if (spec.sql) {
    return ['from labkey.api_wrapper import APIWrapper', '',
      `api = APIWrapper(${pq(dom)}, ${pq(cp)}, ${pq(DB().contextPath)}, use_ssl=True)`, '',
      "# Run the query; the results are in my_results['rows']", '',
      'my_results = api.query.execute_sql(', "    schema_name='lists',", `    sql=${JSON.stringify(spec.sql.trim())}`, ')', ''].join('\n');
  }
  const st = spec.state;
  const out = ['from labkey.api_wrapper import APIWrapper', 'from labkey.query import QueryFilter', '',
    `api = APIWrapper(${pq(dom)}, ${pq(cp)}, ${pq(DB().contextPath)}, use_ssl=True)`, '',
    "# Select rows into a dictionary called 'my_results'", '', 'my_results = api.query.select_rows(', "    schema_name='lists',", `    query_name=${pq(spec.queryName)}`];
  const flt = st.filters.filter(f => f.op !== 'any');
  if (st.columns && st.columns.length) out[out.length - 1] += ',', out.push(`    columns=${pq(st.columns.join(','))}`);
  if (flt.length) {
    out[out.length - 1] += ',';
    out.push('    filter_array=[', flt.map(f => `        QueryFilter(${pq(f.column)}, ${pq(f.value ?? '')}, QueryFilter.Types.${PY_OPS[f.op] || 'EQUAL'})`).join(',\n'), '    ]');
  }
  if (st.sort.length) out[out.length - 1] += ',', out.push(`    sort=${pq(st.sort.map(s => (s.dir === 'DESC' ? '-' : '') + s.column).join(','))}`);
  out.push(')', '');
  return out.join('\n');
}

// --------------------------------------------------------------- files
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

export async function xlsxBytes(sheet, columns, rows, captions) {
  await loadScript('../../assets/vendor/jszip/jszip.min.js');
  const zip = new window.JSZip();
  const ns = 'http://schemas.openxmlformats.org';
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(String(sheet).replace(/[[\]:*?/\\]/g, '_').slice(0, 31) || 'Sheet1')}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${ns}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="${ns}/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`);
  const out = [`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="${ns}/spreadsheetml/2006/main"><sheetData>`];
  const cell = (r, i, v, style) => {
    const ref = colName(i) + r;
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${style ? ' s="1"' : ''}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${style ? ' s="1"' : ''}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  };
  out.push(`<row r="1">${columns.map((c, i) => cell(1, i, (captions && captions[i]) || c, true)).join('')}</row>`);
  rows.forEach((row, k) => out.push(`<row r="${k + 2}">${columns.map((c, i) => cell(k + 2, i, row[c])).join('')}</row>`));
  out.push('</sheetData></worksheet>');
  zip.file('xl/worksheets/sheet1.xml', out.join(''));
  return zip.generateAsync({ type: 'uint8array' });
}

export function delimited(columns, rows, sep, captions) {
  const q = sep === '\t'
    ? (v) => (v === null || v === undefined ? '' : String(v).replace(/[\t\r\n]+/g, ' '))
    : (v) => { if (v === null || v === undefined) return ''; const s = String(v); return /[",;\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [columns.map((c, i) => q((captions && captions[i]) || c)).join(sep), ...rows.map(r => columns.map(c => q(r[c])).join(sep))].join('\n') + '\n';
}

async function save(name, data) {
  if (browser) return browser.download(name, data);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data]));
  a.download = name;
  a.click();
  return name;
}

// --------------------------------------------------------------- the dialog
/**
 * src: a DataRegion, or {name, folderPath, sql, fetch: async () => ({columns, rows})}
 */
export async function exportDialog(src) {
  const isGrid = !!src.table;
  const name = isGrid ? src.table.name : (src.name || 'query');
  const spec = isGrid ? { folderPath: src.folderPath, queryName: src.table.name, state: src.state } : { folderPath: src.folderPath, sql: src.sql };
  const fetchAll = isGrid ? () => src.allRows() : src.fetch;
  const captionsFor = (cols) => (isGrid ? cols.map(c => (src.table.columns.find(x => x.name === c) || {}).label || c) : null);
  const status = h('div.lk-muted', { style: { marginTop: '10px', fontSize: '12.5px', minHeight: '18px' } });

  const xl = h('div', h('label.lk-radio', h('input', { type: 'radio', name: 'xl', checked: true }), 'Excel Workbook (*.xlsx)'),
    h('label.lk-radio', h('input', { type: 'checkbox', name: 'xlcap', checked: false }), 'Use column captions as headers (otherwise column names)'));
  const txtSep = h('select.lk-select', h('option', { value: '\t' }, 'Tab separated (*.tsv)'), h('option', { value: ',' }, 'Comma separated (*.csv)'), h('option', { value: ';' }, 'Semicolon separated (*.txt)'));
  const txt = h('div', h('div.lk-frow', h('span', 'Separator:'), txtSep));
  const lang = h('select.lk-select', h('option', { value: 'r' }, 'R (Rlabkey)'), h('option', { value: 'py' }, 'Python (labkey)'));
  const code = h('textarea.lk-script', { readonly: true, spellcheck: 'false' });
  const showCode = () => { code.value = lang.value === 'r' ? rScript(spec) : pyScript(spec); };
  lang.addEventListener('change', showCode);
  showCode();
  const scr = h('div', h('div.lk-frow', h('span', 'Language:'), lang), code,
    h('p.lk-muted', { style: { fontSize: '12px', margin: '8px 0 0' } }, 'The script reads your credentials from ~/.netrc. Paste it into RStudio or Spyder in the Research Environment.'));
  const t = tabs([['Excel', xl], ['Text', txt], ['Script', scr]]);

  const doExport = async () => {
    status.textContent = 'Preparing the export…';
    try {
      if (t.index === 2) {
        const ext = lang.value === 'r' ? 'R' : 'py';
        const p = await save(`${name}_${stamp()}.${ext}`, code.value);
        status.textContent = `Saved as ${p}`;
        return false;
      }
      const { columns, rows } = await fetchAll();
      const caps = isGrid && xl.querySelector('[name=xlcap]').checked ? captionsFor(columns) : null;
      let p;
      if (t.index === 0) p = await save(`${name}_${stamp()}.xlsx`, await xlsxBytes(name, columns, rows, caps));
      else {
        const sep = txtSep.value;
        p = await save(`${name}_${stamp()}.${sep === '\t' ? 'tsv' : sep === ',' ? 'csv' : 'txt'}`, delimited(columns, rows, sep));
      }
      status.textContent = `${rows.length.toLocaleString('en-US')} rows saved as ${p}`;
    } catch (e) {
      status.textContent = 'The export failed: ' + (e.message || e);
    }
    return false;
  };
  const copy = async () => {
    if (t.index !== 2) return false;
    try { await navigator.clipboard.writeText(code.value); status.textContent = 'Copied to the clipboard.'; } catch { code.select(); document.execCommand('copy'); status.textContent = 'Copied.'; }
    return false;
  };
  await dialog({ title: `Export: ${name}`, width: 640, body: h('div', t.el, status),
    buttons: [{ label: 'Copy Script', onClick: copy }, { label: 'Close', value: null }, { label: 'Export', primary: true, onClick: doExport }] });
}
