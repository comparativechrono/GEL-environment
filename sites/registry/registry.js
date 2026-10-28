// =============================================================================
// The Research Registry: register a research project (a cut-down version of
// the Genomics England process) and follow its review. An approved project
// gets an RR number and an LSF project code; its members can transfer files
// through the Airlock once it has been approved for 30 days.
//
// Pages:  /                         my projects
//         /projects/new             a new proposal (a draft)
//         /projects/<ref>           a project: status, review, details
//         /projects/<ref>/edit      the proposal form
//         /process                  how the review works
// Records: RE.services.submissions (js/services/submissions.js).
// =============================================================================

import { RE, h, clear, route, go, setTitle, requireDesktop, fmtDate } from '../common/site.js';
import { GECIP_DOMAINS } from '../../js/engine/re-fs.js';
import { DECLARATIONS } from '../../js/services/proposal-copy.js';

const app = document.getElementById('rr-app');
const sub = () => RE.services.submissions;
const DAY = 864e5;

const DATA_TYPES = [
  '100,000 Genomes Project: rare disease participants',
  '100,000 Genomes Project: cancer participants',
  'NHS Genomic Medicine Service participants',
  'Clinical and phenotype tables (data browser)',
  'Hospital Episode Statistics and other NHS England data',
  'Cancer registry data (NCRAS)',
  'Genome sequence files (BAM / CRAM)',
  'Variant calls (VCF) and aggregate variant data',
  'Long-read sequencing data',
  'Transcriptomics data',
];
const STAGES = [['draft', 'Draft'], ['submitted', 'Submitted'], ['screening', 'Screening'], ['review', 'Committee review'], ['approved', 'Approved']];
const STATUS = { draft: ['Draft', 'grey'], submitted: ['Submitted', 'blue'], screening: ['Screening', 'amber'], review: ['In review', 'amber'], approved: ['Approved', 'green'], revisions: ['Revisions requested', 'amber'], rejected: ['Not approved', 'red'] };
const badge = (s) => h('span.s-badge.' + (STATUS[s] || [s, 'grey'])[1], (STATUS[s] || [s])[0]);
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

// ===================================================================== frame
let off = null;
function frame(active, title) {
  clear(app);
  setTitle(title ? `${title} – Research Registry` : 'Research Registry');
  const user = RE.session.user;
  const nav = h('nav', h('a' + (active === 'projects' ? '.active' : ''), { href: '/' }, 'My projects'),
    h('a' + (active === 'new' ? '.active' : ''), { href: '/projects/new' }, 'New proposal'),
    h('a' + (active === 'process' ? '.active' : ''), { href: '/process' }, 'How review works'));
  const main = h('main.s-page');
  app.append(h('header.rr-header', h('a.rr-brand', { href: '/' }, h('img', { src: '../../assets/icons/apps/research-registry.svg', alt: '' }), h('span', 'Research Registry', h('small', 'Projects of the Research Environment'))),
    nav, h('span.rr-user', `${user.fullName || user.username} · ${user.userGroup || ''}`)), main);
  return main;
}

function render({ path }) {
  document.querySelectorAll('.s-modal-back').forEach(e => e.remove());
  if (off) { off(); off = null; }
  let m;
  if (path === '/' || path === '') return listPage();
  if (path === '/projects/new') return newProject();
  if (path === '/process') return processPage();
  if ((m = /^\/projects\/([\w-]+)\/edit$/.exec(path))) return editPage(m[1]);
  if ((m = /^\/projects\/([\w-]+)$/.exec(path))) return projectPage(m[1]);
  const main = frame('', 'Not found');
  main.appendChild(h('div.s-card', h('h2', 'Page not found'), h('a', { href: '/' }, 'My projects')));
}

// ===================================================================== list
function listPage() {
  const main = frame('projects', 'My projects');
  main.appendChild(h('div.s-row', h('h1', { style: { margin: 0 } }, 'My projects'), h('span.s-spacer'), h('a.s-btn.primary', { href: '/projects/new' }, 'New proposal')));
  main.appendChild(h('p.muted', 'Projects you lead or are a member of. Every analysis in the Research Environment belongs to an approved project, and so does every Airlock transfer.'));
  const list = sub().projects().slice().sort((a, b) => (b.updatedAt || b.submittedAt || 0) - (a.updatedAt || a.submittedAt || 0));
  main.appendChild(h('div.s-card', h('table.s-table',
    h('thead', h('tr', h('th', 'Project'), h('th', 'Title'), h('th', 'Domain'), h('th', 'Status'), h('th', 'Last change'))),
    h('tbody', list.map(p => h('tr',
      h('td', h('a', { href: `/projects/${p.ref}` }, p.id || p.ref)),
      h('td', p.title || h('i.muted', '(no title yet)')),
      h('td', p.domain || ''),
      h('td', badge(p.status)),
      h('td', fmtDate((p.history && p.history.length ? p.history[p.history.length - 1].t : p.updatedAt) || p.submittedAt)))))),
  ));
  off = sub().on('change', () => { if ((location.hash.slice(1) || '/') === '/') listPage(); });
}

function newProject() {
  const p = sub().saveDraft({ title: '', laySummary: '', scientificAbstract: '', aims: [''], dataRequested: [], methods: '', benefit: '', declarations: {}, domain: RE.session.user.domain || 'training',
    lead: { name: RE.session.user.fullName || RE.session.username, institution: '' }, collaborators: '' });
  go(`/projects/${p.ref}/edit`, { replace: true });
}

// ===================================================================== a project
function projectPage(ref) {
  const p = sub().project(ref);
  if (!p) return render({ path: '/missing' });
  const main = frame('projects', p.id || p.ref);
  main.appendChild(h('div.s-row', h('h1', { style: { margin: 0 } }, p.title || '(untitled proposal)'), h('span.s-spacer'), badge(p.status)));
  main.appendChild(h('p.muted', `${p.id ? `Project ${p.id} · ` : ''}Reference ${p.ref} · Domain: ${p.domain || '—'}`));
  // where it is in the process
  const idx = Math.max(0, STAGES.findIndex(([s]) => s === p.status));
  if (p.status !== 'rejected' && p.status !== 'revisions') {
    main.appendChild(h('div.s-steps', STAGES.map(([, label], i) => h('div.s-step' + (i < idx || p.status === 'approved' ? '.done' : i === idx ? '.current' : ''), label))));
  }
  if (p.status === 'approved') {
    const exportFrom = (p.approvedAt || Date.now()) + RE.config.submissions.exportWaitDays * DAY;
    const copies = !p.seeded && RE.config.submissions.downloadApprovedProposal !== false;
    main.appendChild(h('div.rr-approved', h('div.id', p.id), h('p', { style: { margin: '6px 0' } }, `Approved on ${fmtDate(p.approvedAt, false)}.`),
      h('dl.rr-kv',
        h('dt', 'LSF project code'), h('dd', h('code', p.lsfCode || '')),
        h('dt', 'Airlock exports'), h('dd', exportFrom <= Date.now() ? 'Possible now.' : `Possible from ${fmtDate(exportFrom, false)} (30 days after approval).`),
        h('dt', 'Members'), h('dd', (p.members || []).join(', ')),
        copies ? h('dt', 'Your copy') : null,
        copies ? h('dd', p.copyDownloadedAt ? `Downloaded to your own computer on ${fmtDate(p.copyDownloadedAt)}. ` : 'Not downloaded yet. ',
          h('button.s-btn.small', { onclick: () => sub().downloadProposal(p.ref) }, p.copyDownloadedAt ? 'Download it again' : 'Download a copy')) : null),
      h('p', { style: { marginBottom: 0 } }, 'Use ', h('code', `bsub -P ${p.lsfCode} …`), ' to run jobs on the HPC for this project, and give ', h('b', p.id), ' in Airlock requests.'),
      copies ? h('p.muted', { style: { margin: '6px 0 0', fontSize: '12.5px' } }, 'Your copy of the approved proposal is a PDF, downloaded to your own computer (outside the Research Environment) when the project is approved. Keep it: it is the record of the project as it was approved.') : null));
  }
  if (p.status === 'revisions' || p.status === 'rejected') {
    const last = (p.history || []).slice().reverse().find(e => e.status === p.status);
    main.appendChild(h('div.s-note' + (p.status === 'rejected' ? '.bad' : '.warn'), h('b', p.status === 'rejected' ? 'Not approved. ' : 'Revisions requested. '), last ? last.note : ''));
  }
  const editable = p.status === 'draft' || p.status === 'revisions';
  main.appendChild(h('div.s-row', { style: { margin: '10px 0 16px' } },
    editable ? h('a.s-btn.primary', { href: `/projects/${p.ref}/edit` }, p.status === 'draft' ? 'Continue the proposal' : 'Revise and resubmit') : null,
    p.status === 'approved' ? h('a.s-btn', { href: `https://${RE.config.sites.airlock}/forms` }, 'Open the Airlock') : null));
  main.appendChild(h('div.s-card', h('h2', 'Review'), h('ul.s-timeline', (p.history || []).map(ev => h('li' + (ev.status === 'approved' ? '.good' : ev.status === 'rejected' ? '.bad' : ev.status === 'revisions' ? '.warn' : ''),
    h('div', badge(ev.status), ' ', ev.note || ''), h('div.t', `${fmtDate(ev.t)}${ev.by && ev.by !== 'system' ? ' · ' + ev.by : ''}`)))),
    !(p.history || []).length ? h('p.muted', 'Not submitted yet.') : null));
  main.appendChild(h('div.s-card', h('h2', 'Proposal'), h('dl.rr-kv',
    h('dt', 'Lead applicant'), h('dd', `${p.lead?.name || ''}${p.lead?.institution ? ', ' + p.lead.institution : ''}`),
    p.collaborators ? h('dt', 'Collaborators') : null, p.collaborators ? h('dd', p.collaborators) : null,
    h('dt', 'Lay summary'), h('dd', p.laySummary || '—'),
    p.scientificAbstract ? h('dt', 'Scientific abstract') : null, p.scientificAbstract ? h('dd', p.scientificAbstract) : null,
    (p.aims || []).filter(Boolean).length ? h('dt', 'Aims') : null, (p.aims || []).filter(Boolean).length ? h('dd', p.aims.filter(Boolean).map((a, i) => `${i + 1}. ${a}`).join('\n')) : null,
    (p.dataRequested || []).length ? h('dt', 'Data requested') : null, (p.dataRequested || []).length ? h('dd', p.dataRequested.join('\n')) : null,
    p.methods ? h('dt', 'Methods') : null, p.methods ? h('dd', p.methods) : null,
    p.benefit ? h('dt', 'Benefit to patients') : null, p.benefit ? h('dd', p.benefit) : null)));
  off = sub().on('change', () => { if (location.hash.slice(1) === `/projects/${ref}`) projectPage(ref); });
}

// ===================================================================== the form
function editPage(ref) {
  const p = sub().project(ref);
  if (!p) return render({ path: '/missing' });
  if (p.status !== 'draft' && p.status !== 'revisions') return go(`/projects/${ref}`, { replace: true });
  const main = frame('new', 'Proposal');
  const save = () => { p.updatedAt = Date.now(); sub().saveDraft(p); savedNote.textContent = `Draft saved ${fmtDate(Date.now())}`; };
  const autosave = (() => { let t; return () => { clearTimeout(t); t = setTimeout(save, 600); }; })();
  const savedNote = h('span.muted', { style: { fontSize: '12.5px' } });
  const input = (get, set, attrs = {}) => { const el = h('input.s-input', { value: get() || '', ...attrs }); el.addEventListener('input', () => { set(el.value); autosave(); }); return el; };
  const area = (key, rows, min, max, ph) => {
    const t = h('textarea.s-textarea', { rows, placeholder: ph || '' }, p[key] || '');
    const wc = h('div.rr-wc');
    const upd = () => { const n = words(t.value); wc.textContent = `${n} word${n === 1 ? '' : 's'}${min ? ` (at least ${min}${max ? `, at most ${max}` : ''})` : ''}`; wc.classList.toggle('bad', (min && n < min) || (max && n > max)); };
    t.addEventListener('input', () => { p[key] = t.value; upd(); autosave(); });
    upd();
    return h('div', t, wc);
  };
  const section = (n, id, title, ...kids) => h('section.s-card.rr-section', { id }, h('h2', h('span.n', String(n)), title), ...kids);
  const fieldEl = (label, control, help, req) => h('div.s-field', h('label' + (req ? '.s-required' : ''), label), control, help ? h('div.s-help', help) : null);

  // aims: a list
  if (!Array.isArray(p.aims) || !p.aims.length) p.aims = [''];
  const aimsBox = h('div.rr-aims');
  const drawAims = () => {
    clear(aimsBox);
    p.aims.forEach((a, i) => {
      const el = input(() => p.aims[i], (v) => { p.aims[i] = v; }, { placeholder: `Aim ${i + 1}` });
      aimsBox.appendChild(h('div.s-row', h('span.muted', `${i + 1}.`), el, p.aims.length > 1 ? h('button.s-btn.small', { title: 'Remove', onclick: () => { p.aims.splice(i, 1); drawAims(); autosave(); } }, '×') : null));
    });
    aimsBox.appendChild(h('button.s-btn.small', { onclick: () => { p.aims.push(''); drawAims(); } }, '＋ Add an aim'));
  };
  drawAims();
  const dataChecks = h('div.rr-checks', DATA_TYPES.map(d => {
    const cb = h('input', { type: 'checkbox', checked: (p.dataRequested || []).includes(d) });
    cb.addEventListener('change', () => { p.dataRequested = DATA_TYPES.filter((x, i) => dataChecks.querySelectorAll('input')[i].checked); autosave(); });
    return h('label.s-check', cb, h('span', d));
  }));
  p.declarations = p.declarations || {};
  const declBox = h('div', Object.entries(DECLARATIONS).map(([k, text]) => {
    const cb = h('input', { type: 'checkbox', checked: !!p.declarations[k] });
    cb.addEventListener('change', () => { p.declarations[k] = cb.checked; autosave(); });
    return h('label.s-check', cb, h('span', text));
  }));
  for (const k of Object.keys(DECLARATIONS)) if (!(k in p.declarations)) p.declarations[k] = false;
  const domain = h('select.s-select', GECIP_DOMAINS.filter(d => d !== 'shared_allGECIPs').map(d => h('option', { value: d, selected: d === p.domain }, d)));
  domain.addEventListener('change', () => { p.domain = domain.value; autosave(); });
  p.lead = p.lead || {};
  const issuesBox = h('div');
  const submitBtn = h('button.s-btn.primary', 'Submit for review');
  submitBtn.addEventListener('click', async () => {
    save();
    const issues = sub().projectIssues(p);
    clear(issuesBox);
    if (issues.length) {
      issuesBox.appendChild(h('div.s-note.bad', h('b', 'Please complete the proposal:'), h('ul.rr-issues', issues.map(i => h('li', i)))));
      issuesBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
    const res = await sub().submitProject(p);
    if (!res.ok) { submitBtn.disabled = false; submitBtn.textContent = 'Submit for review'; issuesBox.appendChild(h('div.s-note.bad', res.issues.join(' '))); return; }
    go(`/projects/${p.ref}`);
  });

  const form = h('div',
    h('div.s-row', h('h1', { style: { margin: 0 } }, p.status === 'revisions' ? 'Revise your proposal' : 'New research proposal'), h('span.s-spacer'), savedNote),
    h('p.muted', `Reference ${p.ref}. Your answers are saved as a draft as you type. All fields marked * are needed before you can submit.`),
    section(1, 'project', 'The project',
      fieldEl('Project title', input(() => p.title, (v) => { p.title = v; }, { placeholder: 'A descriptive title' }), '', true),
      h('div.rr-grid2',
        fieldEl('Lead applicant', input(() => p.lead.name, (v) => { p.lead.name = v; })),
        fieldEl('Institution', input(() => p.lead.institution, (v) => { p.lead.institution = v; }, { placeholder: 'University or organisation' }))),
      h('div.rr-grid2', fieldEl('Research domain', domain, 'The GECIP domain the project belongs to.'),
        fieldEl('Collaborators', input(() => p.collaborators, (v) => { p.collaborators = v; }, { placeholder: 'Names (they must have Research Environment accounts)' })))),
    section(2, 'lay', 'Lay summary', h('p.s-help', 'In plain English, for a participant to understand: what you want to find out, and why it matters.'), area('laySummary', 6, 60, 300)),
    section(3, 'abstract', 'Scientific abstract', area('scientificAbstract', 8, 80, 0, 'Background, aims, data and methods, expected results.')),
    section(4, 'aims', 'Aims and objectives', aimsBox),
    section(5, 'data', 'Data requested', h('p.s-help', 'Request only the data the project needs (data minimisation).'), dataChecks),
    section(6, 'methods', 'Methods', area('methods', 6, 40, 0, 'Cohort definition, analyses, tools, how you will handle small numbers.')),
    section(7, 'benefit', 'Benefit to patients and participants', area('benefit', 4, 20)),
    section(8, 'declarations', 'Declarations', declBox),
    issuesBox,
    h('div.s-row', submitBtn, h('button.s-btn', { onclick: () => { save(); go(`/projects/${p.ref}`); } }, 'Save draft and close')));
  const toc = h('div.s-card.rr-sidebar', h('b', 'Sections'), h('div.rr-toc', [['project', 'The project'], ['lay', 'Lay summary'], ['abstract', 'Scientific abstract'], ['aims', 'Aims'], ['data', 'Data requested'], ['methods', 'Methods'], ['benefit', 'Benefit'], ['declarations', 'Declarations']]
    .map(([id, l]) => h('a', { href: '#', onclick: (e) => { e.preventDefault(); document.getElementById(id).scrollIntoView({ behavior: 'smooth' }); } }, l))),
    h('p.muted', { style: { fontSize: '12.5px', marginBottom: 0 } }, 'After you submit, the Research Management Team screens the proposal and the Access Review Committee reviews it.'));
  main.appendChild(h('div.rr-layout', form, toc));
}

// ===================================================================== the process
function processPage() {
  const main = frame('process', 'How review works');
  const C = RE.config.submissions;
  main.append(h('h1', 'How a proposal is reviewed'),
    h('div.s-note', 'This is a simplified version of the Genomics England process, for training.'),
    h('div.s-card', h('ol',
      h('li', h('b', 'Draft. '), 'Write the proposal: title, lay summary, abstract, aims, the data you need, methods and the benefit to patients.'),
      h('li', h('b', 'Screening. '), 'The Research Management Team checks that the proposal is complete and in scope.'),
      h('li', h('b', 'Committee review. '), 'The Access Review Committee checks that the project is in the participants’ interest and uses only the data it needs. It may ask for revisions.'),
      h('li', h('b', 'Approval. '), 'The project gets its RR number and an LSF project code for the HPC (bsub -P …).'),
      h('li', h('b', `After ${C.exportWaitDays} days, `), 'results can be exported through the Airlock, citing the RR number.'))),
    h('div.s-card', h('h2', 'In the simulator'), h('p', `Reviews are simulated and take about ${Math.round((RE.session.settings.reviewDelayMs || C.simulatedReviewDelay) / 1000)} seconds. Your course may decide them by hand instead. Every user is a member of the approved training project ${(C.seedProjects[0] || {}).id || ''}.`)));
}

// ===================================================================== start
if (requireDesktop()) {
  window.addEventListener('pagehide', () => { if (off) off(); });
  route(render);
}
