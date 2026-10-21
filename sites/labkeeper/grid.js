// =============================================================================
// The data region: a table's rows with sorting, filtering, paging, column
// choice, summary statistics and export – in the manner of a LabKey grid.
// Its state lives in the address (LabKey's own parameter names), so a view can
// be bookmarked, shared and reopened:
//   query.<column>~<operator>=<value>   a filter       (query.participant_type~eq=Proband)
//   query.sort=<col>,-<col>             the sort
//   query.offset=<n>  query.maxRows=<n>  query.showRows=all
//   query.columns=<col>,<col>           the columns shown
// =============================================================================

import { h, clear } from '../common/site.js';
import { popup, dialog, tabs, ICON } from './ui.js';
import { exportDialog } from './exports.js';

export const PAGE_SIZES = [20, 40, 100, 250, 1000];

const COMMON = [['any', 'Has Any Value'], ['eq', 'Equals'], ['neqornull', 'Does Not Equal'], ['isblank', 'Is Blank'], ['isnonblank', 'Is Not Blank']];
const OPS = {
  text: [...COMMON, ['contains', 'Contains'], ['doesnotcontain', 'Does Not Contain'], ['startswith', 'Starts With'], ['doesnotstartwith', 'Does Not Start With'],
    ['in', 'Equals One Of (example usage: a;b;c)'], ['notin', 'Does Not Equal Any Of (example usage: a;b;c)'],
    ['containsoneof', 'Contains One Of (example usage: a;b;c)'], ['containsnoneof', 'Does Not Contain Any Of (example usage: a;b;c)']],
  number: [...COMMON, ['gt', 'Is Greater Than'], ['lt', 'Is Less Than'], ['gte', 'Is Greater Than Or Equal To'], ['lte', 'Is Less Than Or Equal To'],
    ['between', 'Between (example usage: 1,5)'], ['notbetween', 'Not Between (example usage: 1,5)'],
    ['in', 'Equals One Of (example usage: 1;2;3)'], ['notin', 'Does Not Equal Any Of (example usage: 1;2;3)']],
  date: [['any', 'Has Any Value'], ['dateeq', 'Equals'], ['dateneq', 'Does Not Equal'], ['isblank', 'Is Blank'], ['isnonblank', 'Is Not Blank'],
    ['dategt', 'Is Greater Than'], ['datelt', 'Is Less Than'], ['dategte', 'Is Greater Than Or Equal To'], ['datelte', 'Is Less Than Or Equal To']],
  bool: COMMON,
};
const NO_VALUE = new Set(['any', 'isblank', 'isnonblank']);
const SYMBOL = { eq: '=', neq: '<>', neqornull: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', dateeq: '=', dateneq: '<>', dategt: '>', dategte: '>=', datelt: '<', datelte: '<=',
  contains: 'CONTAINS', doesnotcontain: 'DOES NOT CONTAIN', startswith: 'STARTS WITH', doesnotstartwith: 'DOES NOT START WITH', in: 'IS ONE OF', notin: 'IS NOT ANY OF',
  containsoneof: 'CONTAINS ONE OF', containsnoneof: 'CONTAINS NONE OF', between: 'BETWEEN', notbetween: 'NOT BETWEEN', isblank: 'IS BLANK', isnonblank: 'IS NOT BLANK', any: 'HAS ANY VALUE' };

export const kindOf = (type) => (/^(Integer|Decimal|Double)$/.test(type) ? 'number' : /^Date/.test(type) ? 'date' : type === 'Boolean' ? 'bool' : 'text');
export const describeFilter = (f) => {
  const sym = SYMBOL[f.op] || f.op;
  if (NO_VALUE.has(f.op)) return `${f.column} ${sym}`;
  if (f.op === 'in' || f.op === 'notin' || f.op === 'containsoneof' || f.op === 'containsnoneof') return `${f.column} ${sym} (${String(f.value).split(';').join(', ')})`;
  if (f.op === 'between' || f.op === 'notbetween') { const [a, b] = String(f.value).split(','); return `${f.column} ${sym} ${a} AND ${b}`; }
  return `${f.column} ${sym} ${f.value}`;
};

/** The grid's state from the address. */
export function stateFromQuery(q) {
  const st = { filters: [], sort: [], offset: 0, maxRows: 100, columns: null };
  q.forEach((v, k) => {
    const m = /^query\.(.+)~([a-z]+)$/i.exec(k);
    if (m) st.filters.push({ column: m[1], op: m[2].toLowerCase(), value: v });
  });
  const s = q.get('query.sort');
  if (s) st.sort = s.split(',').map(x => x.trim()).filter(Boolean).map(x => ({ column: x.replace(/^[-+]/, ''), dir: x.startsWith('-') ? 'DESC' : 'ASC' }));
  st.offset = Math.max(0, parseInt(q.get('query.offset') || '0', 10) || 0);
  if (q.get('query.showRows') === 'all') st.maxRows = -1;
  else if (q.get('query.maxRows')) st.maxRows = Math.max(1, parseInt(q.get('query.maxRows'), 10) || 100);
  const c = q.get('query.columns');
  if (c) st.columns = c.split(',').map(x => x.trim()).filter(Boolean);
  return st;
}

/** The address parameters of a state (added to the base parameters). */
export function stateToQuery(base, st) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) p.set(k, v);
  for (const f of st.filters) p.append(`query.${f.column}~${f.op}`, NO_VALUE.has(f.op) ? '' : (f.value ?? ''));
  if (st.sort.length) p.set('query.sort', st.sort.map(s => (s.dir === 'DESC' ? '-' : '') + s.column).join(','));
  if (st.offset) p.set('query.offset', String(st.offset));
  if (st.maxRows === -1) p.set('query.showRows', 'all');
  else if (st.maxRows && st.maxRows !== 100) p.set('query.maxRows', String(st.maxRows));
  if (st.columns && st.columns.length) p.set('query.columns', st.columns.join(','));
  return p;
}

const fmtNum = (n) => Number(n).toLocaleString('en-US');

export class DataRegion {
  /**
   * opts: {lk, folderPath, table (schema with columns), state, onChange(state), context: {host, contextPath}}
   */
  constructor(opts) {
    Object.assign(this, opts);
    this.state = { filters: [], sort: [], offset: 0, maxRows: 100, columns: null, ...(opts.state || {}) };
    this.colByName = new Map(this.table.columns.map(c => [c.name.toLowerCase(), c]));
    // (a filter or sort on a column that does not exist is dropped, as LabKey ignores unknown parameters)
    this.state.filters = this.state.filters.filter(f => this.colByName.has(String(f.column).toLowerCase())).map(f => ({ ...f, column: this.colByName.get(f.column.toLowerCase()).name }));
    this.state.sort = this.state.sort.filter(s => this.colByName.has(String(s.column).toLowerCase())).map(s => ({ ...s, column: this.colByName.get(s.column.toLowerCase()).name }));
    if (this.state.columns) {
      this.state.columns = this.state.columns.filter(c => this.colByName.has(c.toLowerCase())).map(c => this.colByName.get(c.toLowerCase()).name);
      if (!this.state.columns.length) this.state.columns = null;
    }
    this.el = h('div.lk-dr');
  }

  get visibleColumns() { return this.state.columns || this.table.columns.map(c => c.name); }

  change(patch) { this.onChange({ ...this.state, ...patch }); }

  async load() {
    clear(this.el);
    this.el.appendChild(h('div.lk-dr-loading', 'Loading…'));
    try {
      const res = await this.lk.selectRows({
        folderPath: this.folderPath, schemaName: 'lists', queryName: this.table.name, columns: this.visibleColumns.slice(),
        filters: this.state.filters.map(f => ({ ...f })), sort: this.state.sort.map(s => ({ ...s })),
        maxRows: this.state.maxRows, offset: this.state.offset,
      });
      this.result = res;
      this.render();
    } catch (e) {
      clear(this.el);
      this.el.appendChild(h('div.lk-note.err', { style: { margin: '12px' } }, String(e.message || e)));
    }
  }

  /** every row the filters let through (for exports) */
  async allRows() {
    const res = await this.lk.selectRows({ folderPath: this.folderPath, schemaName: 'lists', queryName: this.table.name, columns: this.visibleColumns.slice(),
      filters: this.state.filters.map(f => ({ ...f })), sort: this.state.sort.map(s => ({ ...s })), maxRows: -1, offset: 0 });
    return { columns: Array.from(res.columns), rows: Array.from(res.rows) };
  }

  render() {
    const { rows, rowCount } = this.result;
    const cols = this.visibleColumns.map(n => this.colByName.get(n.toLowerCase()));
    clear(this.el);
    // ---- the bar
    const viewsBtn = h('button.lk-btn', { html: ICON.views + '<span>Grid Views</span>' });
    viewsBtn.classList.add('lk-caret');
    viewsBtn.addEventListener('click', () => popup([
      { label: 'Default', checked: !this.state.columns, action: () => this.change({ columns: null }) },
      this.state.columns ? { label: 'Customized (not saved)', checked: true, action: () => {} } : null,
      { sep: true },
      { label: 'Customize Grid…', action: () => this.customize() },
      { label: 'Revert to Default', disabled: !this.state.columns, action: () => this.change({ columns: null }) },
    ], viewsBtn));
    const chartBtn = h('button.lk-btn', { html: ICON.chart + '<span>Charts</span>' });
    chartBtn.classList.add('lk-caret');
    chartBtn.addEventListener('click', () => popup([
      { head: 'Quick chart of a column' },
      ...cols.filter(c => kindOf(c.type) !== 'date').slice(0, 40).map(c => ({ label: c.label || c.name, action: () => this.quickChart(c) })),
    ], chartBtn));
    const exportBtn = h('button.lk-btn', { html: ICON.export + '<span>Export</span>', onclick: () => exportDialog(this) });
    const start = rowCount ? this.state.offset + 1 : 0;
    const end = this.state.maxRows === -1 ? rowCount : Math.min(rowCount, this.state.offset + this.state.maxRows);
    const size = this.state.maxRows === -1 ? rowCount || 1 : this.state.maxRows;
    const last = Math.max(0, Math.floor((rowCount - 1) / size) * size);
    const count = h('span.lk-dr-count', { title: 'Paging' }, rowCount ? `${fmtNum(start)} - ${fmtNum(end)} of ${fmtNum(rowCount)}` : 'No rows');
    count.addEventListener('click', () => popup([
      { label: 'Show first page', disabled: !this.state.offset, action: () => this.change({ offset: 0 }) },
      { label: 'Show last page', disabled: this.state.maxRows === -1 || this.state.offset >= last, action: () => this.change({ offset: last }) },
      { sep: true }, { head: 'Paging' },
      ...PAGE_SIZES.map(n => ({ label: `${n} per page`, checked: this.state.maxRows === n, action: () => this.change({ maxRows: n, offset: 0 }) })),
      { label: 'Show All', checked: this.state.maxRows === -1, action: () => this.change({ maxRows: -1, offset: 0 }) },
    ], count, { align: 'right' }));
    const pg = (label, title, enabled, offset) => h('button.lk-btn', { title, disabled: !enabled, onclick: () => this.change({ offset }) }, label);
    const paging = h('div.lk-dr-paging', count,
      pg('«', 'First page', this.state.offset > 0, 0),
      pg('‹', 'Previous page', this.state.offset > 0, Math.max(0, this.state.offset - size)),
      pg('›', 'Next page', this.state.maxRows !== -1 && end < rowCount, this.state.offset + size),
      pg('»', 'Last page', this.state.maxRows !== -1 && end < rowCount, last));
    this.el.appendChild(h('div.lk-dr-bar', viewsBtn, chartBtn, exportBtn, h('span.lk-spacer'), paging));
    // ---- filters and sorts
    if (this.state.filters.length || this.state.sort.length) {
      const msg = h('div.lk-dr-msg');
      if (this.state.filters.length) msg.appendChild(h('b', 'Filter:'));
      this.state.filters.forEach((f, i) => msg.appendChild(h('span.lk-chip', describeFilter(f),
        h('button', { title: 'Remove this filter', onclick: () => this.change({ filters: this.state.filters.filter((_, j) => j !== i), offset: 0 }) }, '×'))));
      if (this.state.sort.length) msg.appendChild(h('b', { style: { marginLeft: '6px' } }, 'Sort:'));
      this.state.sort.forEach((s, i) => msg.appendChild(h('span.lk-chip.sort', `${s.column} ${s.dir === 'DESC' ? '↓' : '↑'}`,
        h('button', { title: 'Remove this sort', onclick: () => this.change({ sort: this.state.sort.filter((_, j) => j !== i) }) }, '×'))));
      msg.appendChild(h('a', { href: '#', style: { marginLeft: '8px' }, onclick: (e) => { e.preventDefault(); this.change({ filters: [], sort: [], offset: 0 }); } }, 'Clear All'));
      this.el.appendChild(msg);
    }
    // ---- the table
    const filtered = new Set(this.state.filters.map(f => f.column.toLowerCase()));
    const sorted = new Map(this.state.sort.map(s => [s.column.toLowerCase(), s.dir]));
    const thead = h('tr');
    for (const c of cols) {
      const dir = sorted.get(c.name.toLowerCase());
      const hd = h('div.hd', { title: `${c.name} (${c.type})` }, h('span', c.label || c.name),
        dir ? h('span.ind', dir === 'DESC' ? '▼' : '▲') : null, filtered.has(c.name.toLowerCase()) ? h('span.ind', '⧩') : null, h('span.tri'));
      hd.addEventListener('click', () => this.columnMenu(c, hd));
      thead.appendChild(h('th' + (filtered.has(c.name.toLowerCase()) ? '.filtered' : ''), hd));
    }
    const tbody = h('tbody');
    for (const r of rows) {
      const tr = h('tr');
      for (const c of cols) tr.appendChild(this.cell(c, r[c.name]));
      tbody.appendChild(tr);
    }
    const table = h('table.lk-dr-table', h('thead', thead), tbody);
    const scroll = h('div.lk-dr-scroll', table);
    this.el.appendChild(scroll);
    if (!rows.length) this.el.appendChild(h('div.lk-dr-empty', this.state.filters.length ? 'No data to show. (Check the filters above.)' : 'No data to show.'));
  }

  cell(c, v) {
    if (v === null || v === undefined || v === '') return h('td.null', '');
    const kind = kindOf(c.type);
    let text = String(v);
    let title = text;
    if (kind === 'date') text = c.type === 'DateTime' ? text.replace('T', ' ').slice(0, 16) : text.slice(0, 10);
    if (c.values) {
      const hit = c.values.find(x => String(x[0]) === text);
      if (hit && hit[1]) title = `${text}: ${hit[1]}`;
    }
    if (kind === 'bool') text = Number(v) ? 'true' : 'false';
    return h('td' + (kind === 'number' ? '.num' : ''), { title }, text);
  }

  columnMenu(c, anchor) {
    const name = c.name;
    const sorted = this.state.sort.find(s => s.column === name);
    const hasFilter = this.state.filters.some(f => f.column === name);
    const sortBy = (dir) => this.change({ sort: [{ column: name, dir }, ...this.state.sort.filter(s => s.column !== name)].slice(0, 3), offset: 0 });
    popup([
      { label: 'Sort Ascending', action: () => sortBy('ASC') },
      { label: 'Sort Descending', action: () => sortBy('DESC') },
      { label: 'Clear Sort', disabled: !sorted, action: () => this.change({ sort: this.state.sort.filter(s => s.column !== name) }) },
      { sep: true },
      { label: 'Filter…', action: () => this.filterDialog(c) },
      { label: 'Clear Filter', disabled: !hasFilter, action: () => this.change({ filters: this.state.filters.filter(f => f.column !== name), offset: 0 }) },
      { sep: true },
      { label: 'Column Summary Statistics…', action: () => this.summary(c) },
      { label: 'Quick Chart', disabled: kindOf(c.type) === 'date', action: () => this.quickChart(c) },
      { sep: true },
      { label: 'Remove Column', disabled: this.visibleColumns.length < 2, action: () => this.change({ columns: this.visibleColumns.filter(x => x !== name) }) },
    ], anchor);
  }

  async filterDialog(c) {
    const kind = kindOf(c.type);
    const ops = OPS[kind];
    const existing = this.state.filters.filter(f => f.column === c.name);
    const row = (f) => {
      const sel = h('select.lk-select', ops.map(([v, l]) => h('option', { value: v, selected: f && f.op === v }, l)));
      const inp = h('input.lk-input', { value: f && !NO_VALUE.has(f.op) ? f.value : '', type: kind === 'date' ? 'date' : 'text' });
      const sync = () => { inp.disabled = NO_VALUE.has(sel.value); if (inp.disabled) inp.value = ''; };
      sel.addEventListener('change', sync);
      if (!f) sel.value = kind === 'date' ? 'dateeq' : 'eq';
      sync();
      return { el: h('div.lk-frow', sel, inp), sel, inp };
    };
    const r1 = row(existing[0] || null);
    const r2 = row(existing[1] || null);
    if (!existing[1]) { r2.sel.value = 'any'; r2.inp.disabled = true; }
    const choose = h('div', h('div', { style: { marginBottom: '8px', color: '#6b7785' } }, `Show the rows where ${c.label || c.name}:`), r1.el,
      h('div', { style: { margin: '2px 0 8px', color: '#6b7785' } }, 'and'), r2.el);
    // Choose Values: the distinct values with their counts (with the other filters applied)
    const valuesBox = h('div.lk-values', h('div', { style: { padding: '8px 10px', color: '#6b7785' } }, 'Loading…'));
    const valuesPane = h('div', valuesBox);
    let checks = [];
    let distinctOk = false;
    const t = tabs([['Choose Filters', choose], ['Choose Values', valuesPane]]);
    this.lk.distinctValues({ folderPath: this.folderPath, queryName: this.table.name, column: c.name, filters: this.state.filters.filter(f => f.column !== c.name).map(f => ({ ...f })), limit: 251 })
      .then((vals) => {
        clear(valuesBox);
        if (vals.length > 250) { valuesBox.appendChild(h('div', { style: { padding: '8px 10px' } }, 'There are too many different values to list. Use Choose Filters.')); return; }
        distinctOk = true;
        const current = existing.find(f => f.op === 'in' || f.op === 'eq');
        const chosen = current ? new Set(String(current.value).split(';')) : null;
        const all = h('input', { type: 'checkbox', checked: !chosen });
        all.addEventListener('change', () => checks.forEach(([cb]) => { cb.checked = all.checked; }));
        valuesBox.appendChild(h('label', all, h('b', '[All]')));
        checks = vals.map(({ value, count }) => {
          const label = value === null || value === '' ? '[blank]' : String(value);
          const cb = h('input', { type: 'checkbox', checked: !chosen || chosen.has(String(value ?? '')) });
          valuesBox.appendChild(h('label', cb, h('span', label), h('span.cnt', fmtNum(count))));
          return [cb, value];
        });
      }).catch((e) => { clear(valuesBox); valuesBox.appendChild(h('div', { style: { padding: '8px 10px' } }, String(e.message || e))); });
    const others = this.state.filters.filter(f => f.column !== c.name);
    const ok = await dialog({
      title: `Show Rows Where ${c.label || c.name}…`, width: 560, body: t.el,
      buttons: [
        { label: 'Clear Filter', value: 'clear' },
        { label: 'Cancel', value: null },
        { label: 'OK', primary: true, value: 'ok' },
      ],
    });
    if (ok === 'clear') return this.change({ filters: others, offset: 0 });
    if (ok !== 'ok') return;
    let mine = [];
    if (t.index === 1 && distinctOk) {
      const picked = checks.filter(([cb]) => cb.checked).map(([, v]) => (v === null ? '' : String(v)));
      if (picked.length && picked.length < checks.length) mine = [{ column: c.name, op: 'in', value: picked.join(';') }];
      if (!picked.length) mine = [{ column: c.name, op: 'isblank', value: '' }, { column: c.name, op: 'isnonblank', value: '' }];
    } else {
      for (const r of [r1, r2]) {
        if (r.sel.value === 'any') continue;
        if (!NO_VALUE.has(r.sel.value) && r.inp.value.trim() === '') continue;
        mine.push({ column: c.name, op: r.sel.value, value: NO_VALUE.has(r.sel.value) ? '' : r.inp.value.trim() });
      }
    }
    this.change({ filters: [...others, ...mine], offset: 0 });
  }

  async summary(c) {
    const kind = kindOf(c.type);
    const body = h('div', 'Calculating…');
    dialog({ title: `Column Summary Statistics: ${c.label || c.name}`, body, width: 440, buttons: [{ label: 'Close', primary: true }] });
    try {
      const res = await this.lk.selectRows({ folderPath: this.folderPath, schemaName: 'lists', queryName: this.table.name, columns: [c.name],
        filters: this.state.filters.map(f => ({ ...f })), maxRows: -1 });
      const vals = res.rows.map(r => r[c.name]);
      const non = vals.filter(v => v !== null && v !== undefined && v !== '');
      const lines = [['Count', vals.length], ['Count (non-blank)', non.length], ['Count (blank)', vals.length - non.length], ['Distinct values', new Set(non.map(String)).size]];
      if (kind === 'number' && non.length) {
        const nums = non.map(Number).sort((a, b) => a - b);
        const mean = nums.reduce((s, x) => s + x, 0) / nums.length;
        const sd = nums.length > 1 ? Math.sqrt(nums.reduce((s, x) => s + (x - mean) ** 2, 0) / (nums.length - 1)) : null;
        const med = nums.length % 2 ? nums[nums.length >> 1] : (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2;
        lines.push(['Minimum', nums[0]], ['Maximum', nums[nums.length - 1]], ['Mean', mean.toFixed(3)], ['Median', med], ['Standard deviation', sd === null ? '' : sd.toFixed(3)]);
      } else if (kind === 'date' && non.length) {
        const s = non.map(String).sort();
        lines.push(['Earliest', s[0].slice(0, 10)], ['Latest', s[s.length - 1].slice(0, 10)]);
      }
      clear(body);
      body.appendChild(h('table.lk-stats', lines.map(([k, v]) => h('tr', h('td', k), h('td', typeof v === 'number' ? fmtNum(v) : String(v))))));
      if (this.state.filters.length) body.appendChild(h('p.lk-muted', { style: { marginTop: '10px', fontSize: '12px' } }, 'Calculated on the rows that the filters let through.'));
    } catch (e) { clear(body); body.appendChild(h('div.lk-note.err', String(e.message || e))); }
  }

  async quickChart(c) {
    const body = h('div', 'Drawing…');
    dialog({ title: `Quick Chart: ${c.label || c.name}`, body, width: 640, buttons: [{ label: 'Close', primary: true }] });
    try {
      const vals = await this.lk.distinctValues({ folderPath: this.folderPath, queryName: this.table.name, column: c.name, filters: this.state.filters.map(f => ({ ...f })), limit: 2000 });
      clear(body);
      if (!vals.length) { body.textContent = 'No data.'; return; }
      let bars;
      if (kindOf(c.type) === 'number' && vals.length > 20) {
        // a histogram of 12 bins
        const all = vals.filter(v => v.value !== null);
        const lo = Math.min(...all.map(v => Number(v.value))), hi = Math.max(...all.map(v => Number(v.value)));
        const n = 12, w = (hi - lo) / n || 1;
        bars = Array.from({ length: n }, (_, i) => ({ label: `${+(lo + i * w).toFixed(1)}–${+(lo + (i + 1) * w).toFixed(1)}`, count: 0 }));
        for (const v of all) bars[Math.min(n - 1, Math.floor((Number(v.value) - lo) / w))].count += v.count;
      } else {
        bars = vals.map(v => ({ label: v.value === null || v.value === '' ? '[blank]' : String(v.value), count: v.count })).sort((a, b) => b.count - a.count).slice(0, 25);
      }
      const max = Math.max(...bars.map(b => b.count));
      const W = 600, rowH = 22, labelW = 210, H = bars.length * rowH + 10;
      const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Arial" font-size="12">`];
      bars.forEach((b, i) => {
        const y = 5 + i * rowH;
        const bw = Math.max(1, (W - labelW - 60) * b.count / max);
        const lab = b.label.length > 30 ? b.label.slice(0, 29) + '…' : b.label;
        svg.push(`<text x="${labelW - 6}" y="${y + 15}" text-anchor="end" fill="#333">${lab.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`,
          `<rect x="${labelW}" y="${y + 3}" width="${bw}" height="${rowH - 6}" fill="#2b8a7e"/>`,
          `<text x="${labelW + bw + 5}" y="${y + 15}" fill="#555">${b.count}</text>`);
      });
      svg.push('</svg>');
      body.appendChild(h('div', { html: svg.join('') }));
      if (bars.some(b => b.count > 0 && b.count < 5)) body.appendChild(h('p.lk-muted', { style: { fontSize: '12px', marginTop: '8px' } }, 'Some groups have fewer than 5 participants: they must be masked (<5) before anything like this chart leaves the Research Environment.'));
    } catch (e) { clear(body); body.appendChild(h('div.lk-note.err', String(e.message || e))); }
  }

  async customize() {
    const shown = new Set(this.visibleColumns);
    const filter = h('input.lk-input', { placeholder: 'Filter the columns…', style: { width: '100%', marginBottom: '8px' } });
    const list = h('div.lk-colpick');
    const boxes = this.table.columns.map((c) => {
      const cb = h('input', { type: 'checkbox', checked: shown.has(c.name) });
      const row = h('label', cb, h('span', c.name), h('small', c.label || ''));
      list.appendChild(row);
      return { c, cb, row };
    });
    filter.addEventListener('input', () => {
      const q = filter.value.toLowerCase();
      boxes.forEach(b => { b.row.style.display = !q || b.c.name.toLowerCase().includes(q) || (b.c.label || '').toLowerCase().includes(q) ? '' : 'none'; });
    });
    const all = h('div', { style: { margin: '8px 0 0', display: 'flex', gap: '8px' } },
      h('button.lk-btn', { onclick: () => boxes.forEach(b => { b.cb.checked = true; }) }, 'Select All'),
      h('button.lk-btn', { onclick: () => boxes.forEach(b => { b.cb.checked = false; }) }, 'Select None'));
    const ok = await dialog({ title: `Customize Grid: ${this.table.name}`, width: 600, body: h('div', filter, list, all),
      buttons: [{ label: 'Cancel', value: null }, { label: 'Apply', primary: true, value: 'ok' }] });
    if (ok !== 'ok') return;
    const cols = boxes.filter(b => b.cb.checked).map(b => b.c.name);
    if (!cols.length) return;
    this.change({ columns: cols.length === this.table.columns.length ? null : cols });
  }
}
