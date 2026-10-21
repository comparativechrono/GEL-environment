// =============================================================================
// LabKeeper – the Research Environment simulator's clinical data browser, in
// the manner of the LabKey Server portal of the real RE. Pages (LabKey URLs):
//
//   /labkey/login/home/login.view                         sign in
//   /labkey/project/home/begin.view                       projects
//   /labkey/project/<project>/begin.view                  a project's data releases
//   /labkey/project/<project>/<release>/begin.view        Data Views (tables by category)
//   /labkey/query/<project>/<release>/executeQuery.view?schemaName=lists&query.queryName=<table>   a grid
//   /labkey/list/<project>/<release>/grid.view?name=<table>                                        (the same)
//   /labkey/query/<project>/<release>/begin.view          Schema Browser
//   /labkey/query/<project>/<release>/executeSql.view     SQL query
//   /labkey/search/home/search.view?q=…                   search
//
// The data come from RE.services.labkey (js/services/labkey-server.js).
// =============================================================================

import { RE, CONFIG, h, clear, route, go, url, setTitle, requireDesktop } from '../common/site.js';
import { popup, dialog, closeMenu, ICON } from './ui.js';
import { DataRegion, stateFromQuery, stateToQuery } from './grid.js';
import { exportDialog, rScript, pyScript } from './exports.js';

const app = document.getElementById('lk-app');

const DB = () => CONFIG.dataBrowser;
const lk = () => RE.services.labkey;
const CTX = () => DB().contextPath;

/** /labkey/<controller>/<container>/<action>.view?params */
export function link(controller, action, container = '/home', params) {
  const c = container === '/' ? '' : container.replace(/\/+$/, '');
  return url(`/${CTX()}/${controller}${c}/${action}.view`, params);
}

function parseRoute(path) {
  let p = String(path || '/').replace(/^\/+/, '');
  const ctx = CTX();
  if (!p || p === ctx || p === ctx + '/') return { redirect: link('project', 'begin', '/home') };
  if (p.startsWith(ctx + '/')) p = p.slice(ctx.length + 1);
  else return { redirect: link('project', 'begin', '/home') };
  const segs = p.split('/').filter(Boolean);
  const last = segs[segs.length - 1] || '';
  let m = /^([A-Za-z]+)-([A-Za-z]+)\.(view|api)$/.exec(last);
  if (m) return { controller: m[1].toLowerCase(), action: m[2], container: '/' + segs.slice(0, -1).join('/') };
  m = /^([A-Za-z]+)\.(view|api)$/.exec(last);
  if (m && segs.length >= 2) return { controller: segs[0].toLowerCase(), action: m[1], container: '/' + segs.slice(1, -1).join('/') };
  return { controller: 'project', action: 'begin', container: '/' + segs.join('/') };
}

/** what a container path is: home, a project, or a data release folder */
function resolveContainer(c) {
  const path = String(c || '/home').replace(/\/+$/, '') || '/home';
  if (/^\/?home$/i.test(path) || path === '') return { kind: 'home', path: '/home' };
  const segs = path.split('/').filter(Boolean).filter((s, i) => !(i === 0 && s.toLowerCase() === 'home'));
  const proj = DB().projects.find(p => p.name.toLowerCase() === (segs[0] || '').toLowerCase());
  if (!proj) return { kind: 'missing', path };
  if (segs.length === 1) return { kind: 'project', path: `/${proj.name}`, project: proj };
  const rel = lk().resolve(path);
  if (!rel) return { kind: 'missing', path };
  return { kind: 'folder', path: rel.folderPath, project: proj, release: rel };
}

// ===================================================================== frame
function frame({ container, title, tab }) {
  clear(app);
  const user = RE.session.user;
  const projBtn = h('button.lk-hbtn.lk-caret', 'Projects');
  projBtn.addEventListener('click', () => {
    const items = [{ head: 'Projects' }];
    for (const p of DB().projects) {
      items.push({ label: p.title || p.name, action: () => go(link('project', 'begin', `/${p.name}`)) });
      for (const r of p.releases) items.push({ label: ` ${r.folder}${r.current ? '  (current)' : ''}`, action: () => go(link('project', 'begin', `/${p.name}/${r.folder}`)) });
    }
    popup(items, projBtn);
  });
  const q = h('input', { type: 'search', placeholder: 'Search tables and columns', value: '' });
  const search = h('form.lk-search', { onsubmit: (e) => { e.preventDefault(); if (q.value.trim()) go(link('search', 'search', '/home', { q: q.value.trim() })); } },
    q, h('button', { type: 'submit', title: 'Search' }, '⌕'));
  const userBtn = h('button.lk-hbtn.lk-caret.lk-user', h('span.lk-avatar', (user.fullName || user.username).split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase()), user.username);
  userBtn.addEventListener('click', () => popup([
    { head: user.fullName || user.username },
    { label: 'Sign Out', action: () => { lk().signedIn = false; go(link('login', 'login', '/home')); } },
    { sep: true },
    { label: 'Help: the data browser in the RE', action: () => go('https://re-docs.genomicsengland.co.uk/labkey/') },
  ], userBtn, { align: 'right' }));
  const header = h('header.lk-header',
    h('a.lk-brand', { href: link('project', 'begin', '/home') }, h('img', { src: '../../assets/icons/apps/labkeeper.svg', alt: '' }),
      h('span', DB().productName, h('small', DB().tagline || 'Clinical data browser'))),
    projBtn, h('span.lk-spacer'), search, userBtn);
  // breadcrumbs: home › project › release
  const crumbs = h('div.lk-crumbs');
  const trail = [['home', link('project', 'begin', '/home')]];
  if (container && container.project) trail.push([container.project.name, link('project', 'begin', `/${container.project.name}`)]);
  if (container && container.release) trail.push([container.release.folder, link('project', 'begin', container.release.folderPath)]);
  trail.forEach(([label, href], i) => { if (i) crumbs.appendChild(h('span.sep', '›')); crumbs.appendChild(h('a', { href }, label)); });
  const bar = h('div.lk-titlebar', crumbs, h('h1', title));
  if (container && container.kind === 'folder') {
    const tabsEl = h('div.lk-tabs');
    const t = (id, label, href) => tabsEl.appendChild(h('a.lk-tab' + (tab === id ? '.active' : ''), { href }, label));
    t('views', 'Data Views', link('project', 'begin', container.path));
    t('schema', 'Schema Browser', link('query', 'begin', container.path, { schemaName: 'lists' }));
    t('sql', 'SQL Query', link('query', 'executeSql', container.path));
    bar.appendChild(tabsEl);
  }
  const main = h('main.lk-main');
  app.append(header, bar, main, h('div.lk-foot', `${DB().productName} · training simulator of the Research Environment's data browser · synthetic data only · not LabKey Server`));
  setTitle(`${title} - ${DB().productName}`);
  return main;
}

const wp = (title, body, extra) => h('section.lk-wp', h('div.lk-wp-title', title, h('span.lk-spacer'), extra || null), body);

// ===================================================================== render
async function render({ path, query }) {
  // (a new page: dialogs and menus of the old one go)
  document.querySelectorAll('.s-modal-back').forEach((e) => e.remove());
  closeMenu();
  const r = parseRoute(path);
  if (r.redirect) return go(r.redirect, { replace: true });
  const key = `${r.controller}-${r.action.toLowerCase()}`;
  if (key === 'login-logout') { lk().signedIn = false; return go(link('login', 'login', '/home'), { replace: true }); }
  if (!lk().signedIn && r.controller !== 'login') {
    const back = path + (query.toString() ? '?' + query.toString() : '');
    return go(link('login', 'login', '/home', { returnUrl: back }), { replace: true });
  }
  try {
    switch (key) {
      case 'login-login': return loginPage(query);
      case 'project-begin': return containerPage(resolveContainer(r.container));
      case 'query-executequery': case 'list-grid': return gridPage(resolveContainer(r.container), query);
      case 'query-begin': case 'query-schema': return schemaPage(resolveContainer(r.container), query);
      case 'query-executesql': case 'query-sourcequery': return sqlPage(resolveContainer(r.container), query);
      case 'search-search': return searchPage(query);
      default: return notFound(`The page ${path} does not exist.`);
    }
  } catch (e) {
    console.error(e);
    return notFound(e.message || String(e));
  }
}

function notFound(text, container) {
  const main = frame({ container, title: 'Not Found' });
  main.appendChild(wp('Error', h('div.lk-wp-body', h('div.lk-note.err', text),
    h('a', { href: link('project', 'begin', '/home') }, 'Go to the home page'))));
}

// ===================================================================== sign in
function loginPage(query) {
  clear(app);
  setTitle(`Sign In - ${DB().productName}`);
  const user = RE.session.user;
  const email = h('input.lk-input', { value: user.username, autocomplete: 'username' });
  const pw = h('input.lk-input', { type: 'password', autocomplete: 'current-password' });
  const err = h('div.err');
  const submit = (e) => {
    e.preventDefault();
    const name = email.value.trim().toLowerCase().replace(/@.*$/, '');
    if (!email.value.trim() || !pw.value) { err.textContent = 'Please enter your username and password.'; return; }
    if (name !== user.username.toLowerCase()) { err.textContent = 'The username and password you entered did not match any accounts on file. (Use your Research Environment username.)'; return; }
    lk().signedIn = true;
    const back = query.get('returnUrl');
    go(back && back.startsWith('/') ? back : link('project', 'begin', '/home'), { replace: true });
  };
  app.append(
    h('header.lk-header', h('span.lk-brand', h('img', { src: '../../assets/icons/apps/labkeeper.svg', alt: '' }), h('span', DB().productName, h('small', DB().tagline || '')))),
    h('form.lk-signin', { onsubmit: submit },
      h('h2', 'Sign In'),
      h('label', 'Username'), email,
      h('label', 'Password'), pw,
      h('label', { style: { fontWeight: 400, display: 'flex', gap: '6px', alignItems: 'center' } }, h('input', { type: 'checkbox', checked: true }), 'Remember my username'),
      h('button.lk-btn.primary', { type: 'submit' }, 'Sign In'), err,
      h('p.lk-muted', { style: { fontSize: '12px', marginTop: '16px' } }, 'Sign in with your Research Environment username and password. The R and Python clients read the same credentials from ~/.netrc.')));
  setTimeout(() => pw.focus(), 50);
}

// ===================================================================== containers
async function containerPage(c) {
  if (c.kind === 'missing') return notFound(`Folder not found: ${c.path}`);
  if (c.kind === 'home') {
    const main = frame({ container: c, title: 'Home' });
    const projects = h('div.lk-projects');
    for (const p of DB().projects) {
      const cur = p.releases.find(r => r.current) || p.releases[p.releases.length - 1];
      projects.appendChild(h('a.lk-project', { href: link('project', 'begin', `/${p.name}`) }, h('img.ic', { src: ICON.project, alt: '' }),
        h('div', h('b', p.title || p.name), h('span', cur ? `Current release: ${cur.folder}` : 'No data release in the simulator'))));
    }
    main.appendChild(h('div.lk-cols',
      h('div', wp('Projects', h('div.lk-wp-body', projects))),
      h('div', wp('Welcome', h('div.lk-wp-body',
        h('p', `${DB().productName} holds the clinical and phenotype data of the participants, as tables of each data release.`),
        h('p', 'Open a project, then its most recent data release. Browse the tables in Data Views, filter them, and export what you need – or query them with SQL, here or from R and Python.'),
        h('div.lk-note', 'Training simulator: every row is synthetic.'))))));
    return;
  }
  if (c.kind === 'project') {
    const main = frame({ container: c, title: c.project.title || c.project.name });
    const p = c.project;
    if (!p.releases.length) {
      main.appendChild(wp('Folders', h('div.lk-wp-body', h('p', p.description || ''), h('div.lk-note.warn', 'There are no data releases of this project in the training simulator.'))));
      return;
    }
    const tbl = h('table.lk-folders', h('thead', h('tr', h('th', 'Folder'), h('th', 'Release'), h('th', 'Date'), h('th', ''))));
    const tb = h('tbody');
    for (const r of p.releases) {
      const m = /_v(\d+)_(\d{4}-\d{2}-\d{2})$/.exec(r.folder) || [];
      tb.appendChild(h('tr', h('td', h('img', { src: ICON.folder, alt: '', style: { width: '18px', verticalAlign: 'middle', marginRight: '6px' } }),
        h('a', { href: link('project', 'begin', `/${p.name}/${r.folder}`) }, r.folder), r.current ? h('span.lk-badge', 'current') : null),
        h('td', m[1] ? `v${m[1]}` : ''), h('td', m[2] || ''), h('td', h('a', { href: link('query', 'begin', `/${p.name}/${r.folder}`, { schemaName: 'lists' }) }, 'Schema'))));
    }
    tbl.appendChild(tb);
    main.appendChild(wp('Data Releases', h('div.lk-wp-body.flush', h('div', { style: { padding: '10px 12px' } }, p.description || ''), tbl)));
    return;
  }
  // a data release folder: Data Views
  const main = frame({ container: c, title: c.release.folder, tab: 'views' });
  const listBox = h('div', h('div.lk-dr-loading', 'Loading…'));
  const filter = h('input.lk-input', { type: 'search', placeholder: 'Filter', style: { width: '240px' } });
  const showEmpty = h('input', { type: 'checkbox', checked: true });
  const info = h('div.lk-wp-body', 'Loading…');
  main.appendChild(h('div.lk-cols',
    h('div', wp('Data Views', h('div', h('div.lk-dv-filter', filter, h('label', { style: { display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12.5px' } }, showEmpty, 'Show tables without rows')), listBox))),
    h('div', wp('About this release', info), wp('Query the tables', h('div.lk-wp-body',
      h('p', { style: { marginTop: 0 } }, 'Use SQL to join tables:'), h('a.lk-btn', { href: link('query', 'executeSql', c.path) }, 'SQL Query'),
      h('p', 'Or from R and Python (credentials from ~/.netrc):'),
      h('pre', { style: { fontSize: '11.5px', background: '#f6f8fa', padding: '8px', overflow: 'auto', margin: 0 } }, `library(Rlabkey)\nlabkey.selectRows(\n  baseUrl = "https://${DB().host}/${CTX()}",\n  folderPath = "${c.path}",\n  schemaName = "lists",\n  queryName = "participant",\n  colNameOpt = "rname")`))))));
  let tables;
  try { tables = await lk().tables(c.path); } catch (e) { clear(listBox); listBox.appendChild(h('div.lk-note.err', { style: { margin: '12px' } }, String(e.message || e))); return; }
  const schema = (await lk().open(c.path)).schema;
  const cats = [...(schema.categories || [])];
  for (const t of tables) if (!cats.includes(t.category)) cats.push(t.category);
  const open = new Set(JSON.parse(sessionStorage.getItem('lk:open:' + c.path) || 'null') || cats.slice(0, 3));
  const draw = () => {
    clear(listBox);
    const q = filter.value.trim().toLowerCase();
    for (const cat of cats) {
      const items = tables.filter(t => t.category === cat && (!q || t.name.toLowerCase().includes(q)) && (showEmpty.checked || t.rowCount));
      if (!items.length) continue;
      const isOpen = open.has(cat) || !!q;
      const head = h('div.lk-dv-cathead', h('span.tw', isOpen ? '▼' : '▶'), cat, h('span.n', `(${items.length})`));
      head.addEventListener('click', () => { open.has(cat) ? open.delete(cat) : open.add(cat); sessionStorage.setItem('lk:open:' + c.path, JSON.stringify([...open])); draw(); });
      const box = h('div.lk-dv-cat', head);
      if (isOpen) {
        const list = h('div.lk-dv-items');
        for (const t of items.sort((a, b) => a.name.localeCompare(b.name))) {
          list.appendChild(h('div.lk-dv-item' + (t.rowCount ? '' : '.empty'), h('img', { src: ICON.table, alt: '' }),
            h('a', { href: link('query', 'executeQuery', c.path, { schemaName: 'lists', 'query.queryName': t.name }), title: `lists.${t.name}` }, t.name),
            h('span.rows', `${t.rowCount.toLocaleString('en-US')} rows`), h('span.cols', `${t.columns.length} columns`)));
        }
        box.appendChild(list);
      }
      listBox.appendChild(box);
    }
    if (!listBox.children.length) listBox.appendChild(h('div.lk-dr-empty', 'No tables match.'));
  };
  filter.addEventListener('input', draw);
  showEmpty.addEventListener('change', draw);
  draw();
  const withRows = tables.filter(t => t.rowCount).length;
  clear(info);
  info.appendChild(h('dl.lk-kv',
    h('dt', 'Release'), h('dd', schema.label || c.release.folder),
    h('dt', 'Release date'), h('dd', schema.releaseDate || ''),
    h('dt', 'Folder path'), h('dd', h('code', c.path)),
    h('dt', 'Schema'), h('dd', h('code', 'lists')),
    h('dt', 'Tables'), h('dd', `${tables.length} (${withRows} with rows in the simulator)`)));
  if (schema.source && schema.source.url) info.appendChild(h('p', { style: { marginBottom: 0 } }, 'Field definitions: ', h('a', { href: schema.source.url }, 'the data dictionary'), ' (opens outside the simulator).'));
}

// ===================================================================== grid
async function gridPage(c, query) {
  if (c.kind !== 'folder') return notFound(c.kind === 'missing' ? `Folder not found: ${c.path}` : 'Choose a data release folder first: the tables are in the release folders.', c);
  const name = query.get('query.queryName') || query.get('name') || query.get('queryName');
  const schemaName = query.get('schemaName') || 'lists';
  if (schemaName.toLowerCase() !== 'lists') return notFound(`Schema '${schemaName}' does not exist. The tables are in the schema "lists".`, c);
  let table;
  try { table = await lk().table(c.path, name); } catch (e) { return notFound(String(e.message || e), c); }
  const main = frame({ container: c, title: table.name, tab: 'views' });
  const base = { schemaName: 'lists', 'query.queryName': table.name };
  const dr = new DataRegion({
    lk: lk(), folderPath: c.path, table, state: stateFromQuery(query),
    onChange: (st) => go(link('query', 'executeQuery', c.path, stateToQuery(base, st))),
  });
  const head = h('div', { style: { display: 'flex', gap: '10px', alignItems: 'baseline', marginBottom: '10px', flexWrap: 'wrap' } },
    h('span.lk-muted', `lists.${table.name}`), h('span.lk-badge.grey', table.category || ''),
    h('span.lk-spacer'), h('a', { href: link('query', 'begin', c.path, { schemaName: 'lists', 'query.queryName': table.name }) }, 'Column details'),
    h('a', { href: link('query', 'executeSql', c.path, { sql: `SELECT *\nFROM ${table.name}` }) }, 'Query with SQL'));
  main.append(head, dr.el);
  await dr.load();
}

// ===================================================================== schema browser
async function schemaPage(c, query) {
  if (c.kind !== 'folder') return notFound('Choose a data release folder first: the tables are in the release folders.', c);
  const main = frame({ container: c, title: 'Schema Browser', tab: 'schema' });
  const tables = (await lk().tables(c.path)).slice().sort((a, b) => a.name.localeCompare(b.name));
  const sel = (query.get('query.queryName') || '').toLowerCase();
  const filter = h('input.lk-input', { type: 'search', placeholder: 'Filter tables', style: { width: '100%' } });
  const tree = h('div.lk-tree');
  const detail = h('div');
  const drawTree = () => {
    clear(tree);
    tree.appendChild(h('div.lk-tree-root', '▼ lists'));
    const q = filter.value.trim().toLowerCase();
    for (const t of tables) {
      if (q && !t.name.toLowerCase().includes(q)) continue;
      const n = h('div.lk-tree-node' + (t.name.toLowerCase() === sel ? '.sel' : ''), { title: t.name }, t.name);
      n.addEventListener('click', () => go(link('query', 'begin', c.path, { schemaName: 'lists', 'query.queryName': t.name }), { replace: true }));
      tree.appendChild(n);
    }
  };
  filter.addEventListener('input', drawTree);
  drawTree();
  main.appendChild(h('div.lk-sb', wp('Schemas', h('div', h('div', { style: { padding: '8px' } }, filter), tree)), detail));
  const t = tables.find(x => x.name.toLowerCase() === sel);
  if (!t) {
    detail.appendChild(wp('lists', h('div.lk-wp-body',
      h('p', `The schema lists holds the ${tables.length} tables of this data release. Choose a table to see its columns.`),
      h('p.lk-muted', 'In SQL, refer to a table by its name (participant) or with the schema (lists.participant).'))));
    return;
  }
  const cols = h('table.lk-coltable', h('thead', h('tr', h('th', 'Name'), h('th', 'Caption'), h('th', 'Type'), h('th', 'Coded values'))));
  const tb = h('tbody');
  for (const col of t.columns) {
    const vals = col.values ? col.values.slice(0, 12).map(v => (v[1] && v[1] !== v[0] ? `${v[0]} = ${v[1]}` : v[0])).join('; ') + (col.values.length > 12 ? ` … (${col.values.length} values)` : '') : '';
    tb.appendChild(h('tr', h('td', h('code', col.name)), h('td', col.label || ''), h('td', col.type), h('td.vals', vals)));
  }
  cols.appendChild(tb);
  detail.appendChild(wp(`lists.${t.name}`, h('div',
    h('div.lk-wp-body', h('dl.lk-kv', h('dt', 'Category'), h('dd', t.category), h('dt', 'Rows'), h('dd', t.rowCount.toLocaleString('en-US')), h('dt', 'Columns'), h('dd', String(t.columns.length))),
      h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } },
        h('a.lk-btn.primary', { href: link('query', 'executeQuery', c.path, { schemaName: 'lists', 'query.queryName': t.name }) }, 'View Data'),
        h('a.lk-btn', { href: link('query', 'executeSql', c.path, { sql: `SELECT *\nFROM ${t.name}` }) }, 'Query with SQL'))),
    h('div', { style: { maxHeight: 'calc(100vh - 340px)', overflow: 'auto' } }, cols))));
}

// ===================================================================== SQL
const EXAMPLES = [
  ['Participants by programme', 'SELECT programme, COUNT(*) AS participants\nFROM participant\nGROUP BY programme'],
  ['Rare disease probands and their disease', "SELECT p.participant_id, p.year_of_birth, p.participant_phenotypic_sex,\n       d.normalised_specific_disease\nFROM participant p\nJOIN rare_diseases_participant_disease d ON p.participant_id = d.participant_id\nWHERE p.participant_type = 'Proband'"],
  ['HPO terms present in probands', "SELECT normalised_hpo_term, COUNT(DISTINCT participant_id) AS probands\nFROM rare_diseases_participant_phenotype\nWHERE hpo_present = 'Yes'\nGROUP BY normalised_hpo_term\nORDER BY probands DESC"],
  ['Genome files of a participant', "SELECT participant_id, platekey, type, file_sub_type, file_path\nFROM genome_file_paths_and_types\nWHERE participant_id = '219000001'"],
  ['Age at consent', 'SELECT participant_id, year_of_birth, date_of_consent,\n       YEAR(date_of_consent) - year_of_birth AS age_at_consent\nFROM participant\nORDER BY age_at_consent'],
];

async function sqlPage(c, query) {
  if (c.kind !== 'folder') return notFound('Choose a data release folder first: the tables are in the release folders.', c);
  const main = frame({ container: c, title: 'SQL Query', tab: 'sql' });
  const sql = query.get('sql') || sessionStorage.getItem('lk:sql:' + c.path) || EXAMPLES[0][1];
  const ta = h('textarea.lk-textarea', { spellcheck: 'false' }, sql);
  const out = h('div');
  const exBtn = h('button.lk-btn.lk-caret', 'Examples');
  exBtn.addEventListener('click', () => popup(EXAMPLES.map(([l, s]) => ({ label: l, action: () => { ta.value = s; } })), exBtn));
  let last = null;
  const run = async () => {
    const text = ta.value;
    sessionStorage.setItem('lk:sql:' + c.path, text);
    clear(out);
    out.appendChild(h('div.lk-dr-loading', 'Running…'));
    const t0 = performance.now();
    try {
      const res = await lk().executeSql({ folderPath: c.path, schemaName: 'lists', sql: text });
      last = { columns: Array.from(res.columns), rows: Array.from(res.rows), sql: text };
      drawResults(out, last, c, ((performance.now() - t0) / 1000).toFixed(2));
    } catch (e) {
      clear(out);
      out.appendChild(h('div.lk-note.err', h('div.lk-sqlerr', String(e.message || e))));
    }
  };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); } });
  main.appendChild(wp('Query', h('div.lk-wp-body',
    h('p.lk-muted', { style: { marginTop: 0 } }, 'LabKey SQL: tables of the schema "lists" of this release. Ctrl+Enter runs the query.'),
    ta,
    h('div.lk-sqlbar', h('button.lk-btn.primary', { onclick: run }, 'Execute Query'), exBtn,
      h('button.lk-btn', { onclick: () => showScript({ folderPath: c.path, sql: ta.value }) }, 'Script for R / Python')))));
  main.appendChild(out);
  if (query.get('sql') || query.get('run')) run();
}

function drawResults(out, res, c, secs) {
  clear(out);
  const size = 100;
  let page = 0;
  const box = h('div.lk-dr');
  const draw = () => {
    clear(box);
    const n = res.rows.length;
    const start = n ? page * size + 1 : 0, end = Math.min(n, (page + 1) * size);
    box.appendChild(h('div.lk-dr-bar',
      h('button.lk-btn', { html: ICON.export + '<span>Export</span>', onclick: () => exportDialog({ name: 'query', folderPath: c.path, sql: res.sql, fetch: async () => ({ columns: res.columns, rows: res.rows }) }) }),
      h('span.lk-muted', { style: { fontSize: '12px' } }, `${n.toLocaleString('en-US')} rows in ${secs} s`), h('span.lk-spacer'),
      h('div.lk-dr-paging', h('span.lk-dr-count', n ? `${start} - ${end} of ${n.toLocaleString('en-US')}` : 'No rows'),
        h('button.lk-btn', { disabled: page === 0, onclick: () => { page--; draw(); } }, '‹'),
        h('button.lk-btn', { disabled: end >= n, onclick: () => { page++; draw(); } }, '›'))));
    const head = h('tr', res.columns.map(col => h('th', h('div.hd', col))));
    const tb = h('tbody');
    for (const r of res.rows.slice(page * size, end)) {
      tb.appendChild(h('tr', res.columns.map(col => {
        const v = r[col];
        return v === null || v === undefined ? h('td.null', '') : h('td' + (typeof v === 'number' ? '.num' : ''), { title: String(v) }, String(v));
      })));
    }
    box.appendChild(h('div.lk-dr-scroll', h('table.lk-dr-table', h('thead', head), tb)));
    if (!n) box.appendChild(h('div.lk-dr-empty', 'The query returned no rows.'));
  };
  draw();
  out.appendChild(box);
}

function showScript(spec) {
  const lang = h('select.lk-select', h('option', { value: 'r' }, 'R (Rlabkey)'), h('option', { value: 'py' }, 'Python (labkey)'));
  const code = h('textarea.lk-script', { readonly: true });
  const upd = () => { code.value = lang.value === 'r' ? rScript(spec) : pyScript(spec); };
  lang.addEventListener('change', upd);
  upd();
  dialog({ title: 'Script', width: 640, body: h('div', h('div.lk-frow', h('span', 'Language:'), lang), code),
    buttons: [{ label: 'Copy', onClick: async () => { try { await navigator.clipboard.writeText(code.value); } catch { code.select(); document.execCommand('copy'); } return false; } }, { label: 'Close', primary: true }] });
}

// ===================================================================== search
async function searchPage(query) {
  const q = (query.get('q') || '').trim();
  const main = frame({ title: `Search Results: ${q}` });
  const box = h('div.lk-wp-body', 'Searching…');
  main.appendChild(wp('Search', box));
  if (!q) { box.textContent = 'Type something to search for.'; return; }
  const needle = q.toLowerCase();
  const hits = [];
  for (const rel of lk().releases()) {
    let tables;
    try { tables = await lk().tables(rel.folderPath); } catch { continue; }
    for (const t of tables) {
      if (t.name.toLowerCase().includes(needle)) hits.push({ kind: 'table', rel, t });
      for (const col of t.columns) if (col.name.toLowerCase().includes(needle) || (col.label || '').toLowerCase().includes(needle)) hits.push({ kind: 'column', rel, t, col });
    }
  }
  clear(box);
  box.appendChild(h('p.lk-muted', { style: { marginTop: 0 } }, `${hits.length} result${hits.length === 1 ? '' : 's'} for “${q}”`));
  for (const hit of hits.slice(0, 300)) {
    const href = hit.kind === 'table' ? link('query', 'executeQuery', hit.rel.folderPath, { schemaName: 'lists', 'query.queryName': hit.t.name })
      : link('query', 'begin', hit.rel.folderPath, { schemaName: 'lists', 'query.queryName': hit.t.name });
    box.appendChild(h('div.lk-search-hit', h('a', { href }, hit.kind === 'table' ? `Table: ${hit.t.name}` : `Column: ${hit.t.name}.${hit.col.name}`),
      h('small', `${hit.rel.folder}${hit.kind === 'column' ? ` · ${hit.col.label || ''} · ${hit.col.type}` : ` · ${hit.t.category} · ${hit.t.rowCount} rows`}`)));
  }
}

// ===================================================================== start
if (requireDesktop()) route(render);
