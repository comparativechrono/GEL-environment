// =============================================================================
// The Airlock: requests to take files out of the Research Environment (or to
// bring files in). A request belongs to a Research Registry project, lists its
// files with a description and a justification, passes the automated
// pre-check, and is reviewed (simulated) by the Airlock team; approved exports
// are retrieved outside the RE (here: downloaded to your own computer).
//
// Pages:  /                     home
//         /forms                the available forms
//         /forms/<form>         a request (?attach=<path>… adds files)
//         /requests             my requests
//         /requests/<id>        a request, its review and its files
//         /files                approved imports
//         /rules                the rules the Airlock team applies
// The records live in RE.services.submissions (js/services/submissions.js).
// =============================================================================

import { RE, h, clear, route, go, url, setTitle, requireDesktop, fmtDate, formatBytes } from '../common/site.js';
import { iconForPath } from '../../js/core/mime.js';
import { loadScript } from '../../js/core/util.js';

const app = document.getElementById('al-app');
const sub = () => RE.services.submissions;
const icon = (p, type) => '../../' + iconForPath(p, type);

export const FORMS = [
  { id: 'export-findings', direction: 'export', form: 'findings', label: 'Findings', icon: '📊',
    blurb: 'The results of your analysis: summary tables, statistics, figures, a manuscript or poster.' },
  { id: 'export-scripts', direction: 'export', form: 'scripts', label: 'Analysis scripts and software', icon: '🧾',
    blurb: 'Code that you wrote in the Research Environment. Scripts must not contain data, IDs or paths to participants’ files.' },
  { id: 'import-data', direction: 'import', form: 'data', label: 'Phenotypic and/or genetic data', icon: '🧬',
    blurb: 'External data to analyse alongside the participants’ data. Your project must allow it, and you must have the right to bring them in.' },
  { id: 'import-software', direction: 'import', form: 'software', label: 'Software and scripts', icon: '🛠',
    blurb: 'Code or tools to use in the Research Environment.' },
  { id: 'import-other', direction: 'import', form: 'other', label: 'Other files', icon: '📁',
    blurb: 'Reference files, gene lists, documents and anything else.' },
];
const USER_GROUPS = ['Research Network (Academic)', 'Research Network (Industry)', 'Discovery Forum', 'Genomics England'];
const STATUS = {
  draft: ['Draft', 'grey'], submitted: ['Submitted', 'blue'], 'in-review': ['In review', 'amber'], committee: ['With the Airlock Committee', 'amber'],
  'more-info': ['More information needed', 'amber'], approved: ['Approved', 'green'], rejected: ['Rejected', 'red'], withdrawn: ['Withdrawn', 'grey'],
};
const OPEN = new Set(['submitted', 'in-review', 'committee', 'more-info']);
const badge = (s) => h('span.s-badge.' + (STATUS[s] || [s, 'grey'])[1], (STATUS[s] || [s])[0]);

// ===================================================================== frame
let off = null;
function frame(active, title) {
  clear(app);
  setTitle(title ? `${title} – Airlock` : 'Airlock');
  const user = RE.session.user;
  const open = sub().requests().filter(r => OPEN.has(r.status)).length;
  const nav = h('nav.al-nav',
    navLink('/', 'Home', active === 'home'),
    h('div.sect', 'New request'),
    navLink('/forms', 'Available forms', active === 'forms'),
    h('div.sect', 'Your transfers'),
    navLink('/requests', 'My requests', active === 'requests', open),
    navLink('/files', 'Files', active === 'files'),
    h('div.sect', 'Help'),
    navLink('/rules', 'Airlock rules', active === 'rules'));
  const main = h('main.al-main');
  app.append(
    h('header.al-header', h('a.al-brand', { href: '/' }, h('img', { src: '../../assets/icons/apps/airlock.svg', alt: '' }), h('span', 'Airlock', h('small', 'File transfer for the Research Environment'))),
      h('span.s-spacer'), h('span.al-user', `${user.fullName || user.username} (${user.username})`)),
    h('div.al-wrap', nav, main));
  return main;
}

function navLink(path, label, active, count) {
  return h('a' + (active ? '.active' : ''), { href: path }, label, count ? h('span.count', String(count)) : null);
}

// ===================================================================== routes
function render({ path, query }) {
  document.querySelectorAll('.s-modal-back').forEach(e => e.remove());
  let m;
  if (path === '/' || path === '') return home();
  if (path === '/forms') return formsPage();
  if ((m = /^\/forms\/([\w-]+)$/.exec(path))) return formPage(m[1], query);
  if (path === '/requests') return requestsPage();
  if ((m = /^\/requests\/([\w-]+)$/.exec(path))) return requestPage(m[1], query);
  if (path === '/files') return filesPage();
  if (path === '/rules') return rulesPage();
  const main = frame('', 'Not found');
  main.appendChild(h('div.s-card', h('h2', 'Page not found'), h('p', h('a', { href: '/' }, 'Back to the Airlock home page'))));
}

// ===================================================================== home
function home() {
  const main = frame('home', 'Home');
  const user = RE.session.user;
  main.append(
    h('h1', `Welcome, ${(user.fullName || user.username).split(' ')[0]}`),
    h('p.muted', 'Files leave the Research Environment only through the Airlock, after the Airlock team has checked them. Files can be brought in the same way.'),
    h('div.al-hero',
      h('a.al-big', { href: '/forms#export' }, h('span.ic', '⇪'), h('div', h('b', 'Export files'), h('span', 'Results, figures or your scripts, for a registered project approved at least 30 days ago.'))),
      h('a.al-big', { href: '/forms#import' }, h('span.ic', '⇩'), h('div', h('b', 'Import files'), h('span', 'External data, software or reference files that your project needs.')))),
  );
  const recent = sub().requests().slice().sort((a, b) => b.submittedAt - a.submittedAt).slice(0, 5);
  main.appendChild(h('div.s-card', h('div.s-row', h('h2', { style: { margin: 0 } }, 'Recent requests'), h('span.s-spacer'), h('a', { href: '/requests' }, 'All my requests')),
    recent.length ? requestsTable(recent) : h('p.muted', { style: { marginTop: '10px' } }, 'You have not made any requests yet.')));
  main.appendChild(h('div.s-note.warn', h('b', 'Before you export: '), 'no participant IDs or individual-level data, no counts below 5 (write “<5”), no raw data (BAM, VCF …), R objects or models. ', h('a', { href: '/rules' }, 'Read the rules')));
}

// ===================================================================== forms
function formsPage() {
  const main = frame('forms', 'Available forms');
  main.appendChild(h('h1', 'Available forms'));
  for (const dir of ['export', 'import']) {
    main.appendChild(h('h2', { id: dir, style: { marginTop: '18px' } }, dir === 'export' ? 'Export from the Research Environment' : 'Import into the Research Environment'));
    main.appendChild(h('div.al-forms', FORMS.filter(f => f.direction === dir).map(f => h('div.al-form-card',
      h('h3', `${f.icon} ${f.label}`), h('p', f.blurb), h('div', h('a.s-btn.primary.small', { href: `/forms/${f.id}` }, 'Start a request'))))));
  }
}

// ----- drafts (kept while the tab is open)
const draftKey = (id) => `al:draft:${RE.session.username}:${id}`;
const loadDraft = (id) => { try { return JSON.parse(sessionStorage.getItem(draftKey(id)) || 'null'); } catch { return null; } };
const saveDraft = (id, d) => { try { sessionStorage.setItem(draftKey(id), JSON.stringify({ ...d, uploads: undefined })); } catch { /* full */ } };
const uploads = new Map(); // formId -> [{name, bytes, size}] (files from the user's own computer, not kept in drafts)

async function formPage(id, query) {
  const f = FORMS.find(x => x.id === id);
  if (!f) return render({ path: '/missing' });
  // files added from the file manager ("Request export via Airlock…")
  const attach = query.getAll('attach');
  const draft = loadDraft(id) || { rrNumber: '', userGroup: RE.session.user.userGroup || USER_GROUPS[0], description: '', justification: '', comments: '', source: '', participantList: '', files: [] };
  if (attach.length) {
    for (const p of attach) if (!draft.files.includes(p)) draft.files.push(p);
    saveDraft(id, draft);
    return go(`/forms/${id}`, { replace: true });
  }
  const main = frame('forms', f.label);
  const isExport = f.direction === 'export';
  main.appendChild(h('div.s-row', h('h1', { style: { margin: 0 } }, `${isExport ? 'Export' : 'Import'}: ${f.label}`), h('span.s-spacer'), h('a', { href: '/forms' }, 'All forms')));
  main.appendChild(h('p.muted', f.blurb));
  main.appendChild(h('div.s-steps.al-steps', h('div.s-step.current', 'Details'), h('div.s-step', 'Files'), h('div.s-step', 'Automated check'), h('div.s-step', 'Submit')));

  // ---- the project and the user group
  const projects = sub().projects();
  const proj = h('select.s-select', h('option', { value: '' }, '— choose your project —'),
    projects.map(p => h('option', { value: p.id || '', disabled: p.status !== 'approved', selected: (p.id || '') === draft.rrNumber && !!p.id },
      p.id ? `${p.id} – ${p.title}${p.status !== 'approved' ? ` (${p.status})` : ''}` : `${p.ref} – ${p.title} (${p.status}: no RR number yet)`)));
  const group = h('select.s-select', USER_GROUPS.map(g => h('option', { selected: g === draft.userGroup }, g)));
  const ta = (key, rows = 4, ph = '') => { const t = h('textarea.s-textarea', { rows, placeholder: ph }, draft[key] || ''); t.addEventListener('input', () => { draft[key] = t.value; saveDraft(id, draft); }); return t; };
  proj.addEventListener('change', () => { draft.rrNumber = proj.value; saveDraft(id, draft); });
  group.addEventListener('change', () => { draft.userGroup = group.value; saveDraft(id, draft); });
  const details = h('div.s-card', h('h2', '1. About the request'),
    field('Research Registry project', proj, 'The approved project the files belong to. Only members of a project can transfer files for it.', true),
    field('User group', group),
    field(isExport ? 'Describe the files' : 'Describe the files and what they contain', ta('description', 5, isExport ? 'What is in each file? Expand acronyms and explain anything a non-specialist would not understand.' : 'What is in each file, and where do the data come from?'),
      isExport ? 'Describe every file so that someone outside your field can check it.' : '', true),
    field(isExport ? 'Why do you need these files outside the Research Environment?' : 'Why does your project need these files?', ta('justification', 4,
      isExport ? 'How will you use them (publication, poster, collaboration …)?' : 'How will you use them in the Research Environment?'), '', true),
    !isExport ? field('Licence or permission', ta('source', 2, 'Are you allowed to bring these data into the RE? Under which licence or agreement?')) : null,
    field('Anything else the Airlock team should know?', ta('comments', 2)));
  main.appendChild(details);

  // ---- the files
  const list = h('ul.al-filelist');
  const drawFiles = () => {
    clear(list);
    const items = isExport ? draft.files.map(p => ({ path: p })) : (uploads.get(id) || []);
    if (!items.length) list.appendChild(h('li', { style: { display: 'block', color: '#7b8794' } }, 'No files yet.'));
    items.forEach((it, i) => {
      const st = it.path ? RE.vfs.stat(it.path) : null;
      list.appendChild(h('li', h('img', { src: icon(it.path || it.name, 'file'), alt: '' }), h('span.path', { title: it.path || it.name }, it.path ? RE.vfs.pretty(it.path) : it.name),
        h('span.size', st ? formatBytes(st.size) : it.size != null ? formatBytes(it.size) : h('span', { style: { color: '#b42318' } }, 'missing')),
        h('button', { title: 'Remove', onclick: () => { if (isExport) { draft.files.splice(i, 1); saveDraft(id, draft); } else uploads.get(id).splice(i, 1); drawFiles(); } }, '×')));
    });
  };
  let filesCard;
  if (isExport) {
    const addBtn = h('button.s-btn', { onclick: async () => {
      const got = await RE.dialogs.fileChooser({ mode: 'open', multiple: true, title: 'Choose files to export', startDir: RE.session.workdir });
      for (const p of got || []) if (!draft.files.includes(p)) draft.files.push(p);
      saveDraft(id, draft);
      drawFiles();
    } }, '＋ Add files from the Research Environment');
    const pl = h('input.s-input', { value: draft.participantList || '', placeholder: '/re_gecip/…/participant_ids.txt', readonly: true });
    const plBtn = h('button.s-btn.small', { onclick: async () => {
      const p = await RE.dialogs.fileChooser({ mode: 'open', title: 'Choose the participant list', startDir: RE.session.workdir });
      if (p) { draft.participantList = p; pl.value = p; saveDraft(id, draft); }
    } }, 'Choose…');
    filesCard = h('div.s-card', h('h2', '2. Files to export'),
      h('p.muted', 'Choose the files from your folders in the Research Environment. Keep only the final results: one request per set of results.'),
      list, addBtn,
      f.form === 'findings' ? h('div', { style: { marginTop: '18px' } }, field('Participant list', h('div.s-row', pl, plBtn),
        'A file in the Research Environment listing the participant IDs whose data went into these results. It stays inside the RE: the Airlock team uses it to check the results.')) : null);
  } else {
    if (!uploads.has(id)) uploads.set(id, []);
    const input = h('input', { type: 'file', multiple: true, style: { display: 'none' } });
    input.addEventListener('change', async () => {
      for (const file of input.files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        uploads.get(id).push({ name: file.name, size: file.size, bytes });
      }
      input.value = '';
      drawFiles();
    });
    filesCard = h('div.s-card', h('h2', '2. Files to import'),
      h('p.muted', 'Choose the files on your own computer (outside the Research Environment). They are checked before they appear in the Airlock’s Files area.'),
      list, input, h('button.s-btn', { onclick: () => input.click() }, '＋ Upload files from your computer'));
  }
  main.appendChild(filesCard);
  drawFiles();

  // ---- check and submit
  const findingsBox = h('div');
  const decl = isExport
    ? ['I have checked every file against the Airlock rules.', 'The files contain no participant, sample or family IDs and no individual-level data.', 'Every count below 5 has been masked (written as “<5”), and no total lets it be worked out.', 'I understand that the files are reviewed by hand and that the request may be rejected.']
    : ['I am allowed to bring these files into the Research Environment.', 'The files contain no identifiable information about Genomics England participants.', 'I understand that the files are checked before they can be used.'];
  const checks = decl.map((d) => h('input', { type: 'checkbox' }));
  const submitBtn = h('button.s-btn.primary', 'Submit request');
  const checkBtn = h('button.s-btn', 'Run the automated check');
  const request = () => ({
    direction: f.direction, form: f.form, formLabel: f.label, userGroup: draft.userGroup, rrNumber: draft.rrNumber,
    description: draft.description, justification: draft.justification + (draft.source ? `\n\nLicence / permission: ${draft.source}` : ''), comments: draft.comments,
    participantList: draft.participantList || null,
    files: isExport ? draft.files.map(p => ({ path: p })) : (uploads.get(id) || []).map(u => ({ name: u.name, bytes: new window.parent.Uint8Array(u.bytes) })),
  });
  const runCheck = async () => {
    clear(findingsBox);
    findingsBox.appendChild(h('p.muted', 'Checking…'));
    const findings = await sub().precheck(request());
    clear(findingsBox);
    findingsBox.appendChild(findingsList(findings));
    return findings;
  };
  checkBtn.addEventListener('click', runCheck);
  submitBtn.addEventListener('click', async () => {
    const missing = [];
    if (!draft.rrNumber) missing.push('the project');
    if (!draft.description.trim()) missing.push('the description');
    if (!draft.justification.trim()) missing.push('the justification');
    if (!(isExport ? draft.files.length : (uploads.get(id) || []).length)) missing.push('at least one file');
    if (!checks.every(c => c.checked)) missing.push('every declaration');
    if (missing.length) { alertBox(findingsBox, `Please complete ${missing.join(', ')}.`); return; }
    const findings = await runCheck();
    const fails = findings.filter(x => x.level === 'fail').length;
    if (fails && !window.confirm(`The automated check found ${fails} problem${fails === 1 ? '' : 's'}. Requests with these problems are rejected. Submit anyway?`)) return;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
    try {
      const rec = await sub().submitAirlock(request());
      sessionStorage.removeItem(draftKey(id));
      uploads.delete(id);
      go(`/requests/${rec.id}`);
    } catch (e) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit request';
      alertBox(findingsBox, 'The request could not be submitted: ' + (e.message || e));
    }
  });
  main.appendChild(h('div.s-card', h('h2', '3. Check and submit'),
    h('p.muted', 'The automated check looks for the most common problems. The Airlock team still reviews every file by hand.'),
    checkBtn, h('div', { style: { marginTop: '12px' } }, findingsBox),
    h('h3', { style: { marginTop: '18px' } }, 'Declarations'),
    decl.map((d, i) => h('label.s-check', checks[i], h('span', d))),
    h('div.al-actions', submitBtn, h('button.s-btn', { onclick: () => { if (window.confirm('Discard this request?')) { sessionStorage.removeItem(draftKey(id)); uploads.delete(id); go('/forms'); } } }, 'Discard'))));
}

function field(label, control, help, required) {
  return h('div.s-field', h('label' + (required ? '.s-required' : ''), label), control, help ? h('div.s-help', help) : null);
}

function alertBox(where, text) {
  clear(where);
  where.appendChild(h('div.s-note.bad', text));
}

function findingsList(findings) {
  const ic = { fail: '✖', warn: '⚠', pass: '✔' };
  const order = { fail: 0, warn: 1, pass: 2 };
  return h('ul.al-findings', findings.slice().sort((a, b) => order[a.level] - order[b.level]).map(x => h('li.' + x.level, h('span', ic[x.level]),
    h('div', x.file ? h('div.f', x.file) : null, x.message))));
}

// ===================================================================== requests
function requestsTable(list) {
  return h('table.s-table', { style: { marginTop: '10px' } },
    h('thead', h('tr', h('th', 'Request'), h('th', 'Type'), h('th', 'Project'), h('th', 'Files'), h('th', 'Submitted'), h('th', 'Status'))),
    h('tbody', list.map(r => h('tr',
      h('td', h('a', { href: `/requests/${r.id}` }, r.transfer)),
      h('td', `${r.direction === 'export' ? 'Export' : 'Import'} · ${r.formLabel || r.form}`),
      h('td', r.rrNumber || '—'),
      h('td', String(r.files.length)),
      h('td', fmtDate(r.submittedAt)),
      h('td', badge(r.status))))));
}

function requestsPage() {
  const main = frame('requests', 'My requests');
  main.appendChild(h('div.s-row', h('h1', { style: { margin: 0 } }, 'My requests'), h('span.s-spacer'), h('a.s-btn.primary.small', { href: '/forms' }, 'New request')));
  const list = sub().requests().slice().sort((a, b) => b.submittedAt - a.submittedAt);
  main.appendChild(list.length ? h('div.s-card', requestsTable(list)) : h('div.al-empty', { style: { marginTop: '14px' } }, 'You have no Airlock requests yet.'));
}

async function requestPage(id) {
  const r = sub().request(id);
  if (!r) return render({ path: '/missing' });
  const main = frame('requests', r.transfer);
  main.appendChild(h('div.s-row', h('h1', { style: { margin: 0 } }, `Request ${r.transfer}`), badge(r.status), h('span.s-spacer'), h('a', { href: '/requests' }, 'All my requests')));
  main.appendChild(h('p.muted', `Genomics England reference ${r.gelRef} · ${r.direction === 'export' ? 'Export' : 'Import'}: ${r.formLabel || r.form}`));
  // ---- outcome first
  if (r.status === 'approved' && r.direction === 'export') main.appendChild(retrievalBox(r));
  if (r.status === 'approved' && r.direction === 'import') main.appendChild(h('div.s-note.good', 'Approved. The files are in ', h('a', { href: '/files' }, 'Files'), `, in the folder ${r.transfer}.`));
  if (r.status === 'rejected') main.appendChild(h('div.s-note.bad', h('b', 'Rejected. '), (r.decision?.reasons || []).join(' ') || 'See the review below.',
    h('div', { style: { marginTop: '8px' } }, h('a.s-btn.small', { href: url('/forms/' + (FORMS.find(f => f.form === r.form && f.direction === r.direction)?.id || 'export-findings'), { attach: r.files.map(x => x.path).filter(Boolean) }) }, 'Start a new request with these files'))));
  if (r.status === 'more-info') {
    const t = h('textarea.s-textarea', { rows: 3, placeholder: 'Your answer to the Airlock team' });
    main.appendChild(h('div.s-note.warn', h('b', 'The Airlock team has a question. '), (r.decision?.reasons || []).join(' '),
      h('div', { style: { marginTop: '10px' } }, t, h('div.al-actions', h('button.s-btn.primary', { onclick: () => { if (!t.value.trim()) return; sub().reply(r.id, t.value.trim()); render({ path: `/requests/${r.id}` }); } }, 'Send reply')))));
  }
  // ---- the request
  main.appendChild(h('div.s-card', h('h2', 'Details'), h('dl.al-kv',
    h('dt', 'Project'), h('dd', r.rrNumber || '—'),
    h('dt', 'User group'), h('dd', r.userGroup || '—'),
    h('dt', 'Submitted'), h('dd', fmtDate(r.submittedAt)),
    h('dt', 'Description'), h('dd', r.description || ''),
    h('dt', 'Justification'), h('dd', r.justification || ''),
    r.comments ? h('dt', 'Comments') : null, r.comments ? h('dd', r.comments) : null,
    r.participantList ? h('dt', 'Participant list') : null, r.participantList ? h('dd', h('code', r.participantList)) : null)));
  main.appendChild(h('div.s-card', h('h2', `Files (${r.files.length})`), h('ul.al-filelist', r.files.map(f => h('li', { style: { gridTemplateColumns: '22px minmax(0,1fr) 90px' } },
    h('img', { src: icon(f.path || f.name, 'file'), alt: '' }), h('span.path', f.path ? RE.vfs.pretty(f.path) : f.name), h('span.size', formatBytes(f.size || 0)))))));
  main.appendChild(h('div.s-card', h('h2', 'Automated check'), findingsList(r.findings || [])));
  main.appendChild(h('div.s-card', h('h2', 'Review'), h('ul.s-timeline', (r.history || []).map(ev => h('li' + (ev.status === 'approved' ? '.good' : ev.status === 'rejected' ? '.bad' : ev.status === 'more-info' || ev.status === 'committee' ? '.warn' : ''),
    h('div', badge(ev.status), ' ', ev.note || ''), h('div.t', `${fmtDate(ev.t)}${ev.by && ev.by !== 'system' ? ' · ' + ev.by : ''}`))))));
  if (OPEN.has(r.status)) main.appendChild(h('div.al-actions', h('button.s-btn', { onclick: () => { if (window.confirm(`Withdraw request ${r.transfer}?`)) { sub().withdraw(r.id); render({ path: `/requests/${r.id}` }); } } }, 'Withdraw request')));
  // live updates while the page is open
  if (off) off();
  off = sub().on('change', () => { if (location.hash.slice(1).startsWith(`/requests/${r.id}`)) render({ path: `/requests/${r.id}` }); });
}

function retrievalBox(r) {
  const btn = h('button.s-btn.primary', 'Download the approved files');
  const note = h('div.muted', { style: { marginTop: '8px', fontSize: '12.5px' } });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    note.textContent = 'Preparing the download…';
    try {
      const files = await sub().filesOf(r.id);
      await loadScript('../../assets/vendor/jszip/jszip.min.js');
      const zip = new window.JSZip();
      for (const f of files) zip.file(f.name, f.bytes ? new Uint8Array(f.bytes) : '');
      zip.file('README.txt', `Files approved by the Airlock team (training simulator).\nTransfer request ${r.transfer}, Genomics England reference ${r.gelRef}, project ${r.rrNumber}.\nApproved ${fmtDate(r.decision?.at)}.\n`);
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${r.transfer}_approved_files.zip`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      note.textContent = `Downloaded ${r.transfer}_approved_files.zip to your own computer (outside the Research Environment).`;
    } catch (e) {
      note.textContent = 'The download failed: ' + (e.message || e);
    }
    btn.disabled = false;
  });
  return h('div.al-retrieval', h('h3', '✔ Approved – retrieve your files'),
    h('p', 'Approved exports are collected outside the Research Environment: in the real RE a link to the Airlock retrieval site is e-mailed to you, and the files are downloaded on your own computer. In this simulator the button below does that – the files are downloaded by the web browser of your own computer, not into the Research Environment.'),
    btn, note);
}

// ===================================================================== files (approved imports)
async function filesPage() {
  const main = frame('files', 'Files');
  main.appendChild(h('h1', 'Files'));
  main.appendChild(h('p.muted', 'Files that you imported, after the Airlock team approved them. Save them to your folders in the Research Environment to use them.'));
  const imports = sub().requests().filter(r => r.direction === 'import' && r.status === 'approved').sort((a, b) => b.submittedAt - a.submittedAt);
  if (!imports.length) { main.appendChild(h('div.al-empty', 'No approved imports yet.')); return; }
  const tree = h('ul.al-tree');
  main.appendChild(tree);
  for (const r of imports) {
    const files = await sub().filesOf(r.id);
    const saveAll = h('button.s-btn.small', 'Save all to my folder');
    const status = h('span.muted', { style: { fontSize: '12.5px', fontWeight: 400 } });
    saveAll.addEventListener('click', async () => {
      const dir = await RE.dialogs.fileChooser({ mode: 'folder', title: 'Save the files in…', startDir: RE.session.workdir });
      if (!dir) return;
      try {
        const target = `${dir}/${r.transfer}`;
        RE.vfs.mkdir(target, { recursive: true });
        for (const f of files) RE.vfs.writeFile(`${target}/${f.name}`, f.bytes ? new window.parent.Uint8Array(f.bytes) : '');
        status.textContent = `Saved in ${RE.vfs.pretty(target)}`;
      } catch (e) { status.textContent = 'Could not save: ' + (e.message || e); }
    });
    tree.appendChild(h('li', h('div.head', h('img', { src: '../../assets/icons/places/folder.svg', alt: '', style: { width: '20px' } }), r.transfer, h('span.muted', { style: { fontWeight: 400, fontSize: '12.5px' } }, r.formLabel), h('span.s-spacer'), status, saveAll),
      h('ul.files', files.map(f => h('li', h('img', { src: icon(f.name, 'file'), alt: '' }), h('span', f.name), h('span.muted', { style: { fontSize: '12px', textAlign: 'right' } }, formatBytes(f.size || 0)), h('span'))))));
  }
}

// ===================================================================== rules
function rulesPage() {
  const main = frame('rules', 'Airlock rules');
  const C = RE.config.submissions;
  main.append(h('h1', 'What may leave the Research Environment'),
    h('div.s-note', 'A summary for the training simulator. The Research Environment documentation has the full Airlock rules: ', h('a', { href: 'https://re-docs.genomicsengland.co.uk/airlock/' }, 're-docs.genomicsengland.co.uk/airlock'), '.'),
    h('div.s-card', h('h2', 'Before you start'), h('ul.al-rules',
      h('li', 'Every transfer belongs to a project registered in the Research Registry, and you must be a member of it.'),
      h('li', `Exports are only possible once the project has been approved for at least ${C.exportWaitDays} days.`),
      h('li', 'Describe every file so that someone outside your field can review it, and say why you need it outside the RE.'),
      h('li', 'Split files larger than 5 GB into parts of at most 4 GB.'))),
    h('div.s-card', h('h2', 'Never exported'), h('ul.al-rules',
      h('li', 'Participant, sample, family or plate IDs, genome delivery IDs, or paths to participants’ files.'),
      h('li', 'Individual-level data: one row per participant, case descriptions (except with a strong justification, reviewed by the Airlock Committee).'),
      h('li', 'Raw data: BAM, CRAM, FASTQ, VCF and other genotype files.'),
      h('li', 'R objects (.rds, .RData), trained machine-learning models, databases and binary files the Airlock team cannot read.'),
      h('li', 'Screenshots of the Research Environment (IGV views without IDs are the exception).'))),
    h('div.s-card', h('h2', 'Small numbers'), h('ul.al-rules',
      h('li', 'A count of 1 to 4 participants must not be shown: write “<5”.'),
      h('li', 'Totals or percentages must not let a masked count be worked out (mask a second cell if needed).'),
      h('li', 'Check figures by eye: no group may have fewer than 5 participants, and no IDs may be visible.'),
      h('li', 'Exact ages and dates of events are identifying: use ranges or years.'))),
    h('div.s-card', h('h2', 'Variants'), h('ul.al-rules',
      h('li', 'Lists of a few hundred variants at most, with summary statistics only – no genotypes of individuals.'),
      h('li', 'Rare variants (low allele counts or frequencies) can identify participants: aggregate them.'))));
}

// ===================================================================== start
if (requireDesktop()) {
  window.addEventListener('pagehide', () => { if (off) off(); });
  route(render);
}
