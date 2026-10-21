// =============================================================================
// Settings Manager: desktop preferences, the user's account, and the training
// controls an instructor uses during practicals (review automation, the 30-day
// export rule, deciding Airlock requests and proposals by hand, table data).
// =============================================================================

import { h, clear, formatBytes } from '../../core/util.js';
import { GECIP_DOMAINS } from '../../engine/re-fs.js';

export async function launch(ctx, args = {}) {
  const { re } = ctx;
  const win = ctx.openWindow({ width: 880, height: 600, title: 'Settings Manager', className: 'app-settings', minWidth: 560, minHeight: 360 });
  const side = h('div.st-side');
  const main = h('div.st-main.gtk-scroll');
  win.body.append(h('div.st-body', side, main));
  const S = () => re.session.settings;
  const set = (k, v) => re.session.setSetting(k, v);

  const pages = [
    { id: 'desktop', label: 'Desktop', icon: 'assets/icons/places/folder-desktop.svg', render: desktopPage },
    { id: 'account', label: 'Account', icon: 'assets/icons/actions/user.svg', render: accountPage },
    { id: 'training', label: 'Training controls', icon: 'assets/icons/apps/research-registry.svg', render: trainingPage },
    { id: 'data', label: 'Data browser tables', icon: 'assets/icons/apps/labkeeper.svg', render: dataPage },
    { id: 'about', label: 'About', icon: 'assets/icons/apps/re-logo.svg', render: aboutPage },
  ];
  let current = args.page || 'desktop';

  function renderSide() {
    clear(side);
    for (const p of pages) {
      const el = h('div.st-cat' + (p.id === current ? '.active' : ''), h('img', { src: p.icon, alt: '' }), p.label);
      el.addEventListener('click', () => { current = p.id; render(); });
      side.appendChild(el);
    }
  }
  function render() { renderSide(); clear(main); pages.find(p => p.id === current).render(); }

  const section = (title, ...kids) => h('div.st-section', h('h3', title), ...kids);
  const check = (label, key, help) => {
    const cb = h('input', { type: 'checkbox', checked: !!S()[key] });
    cb.addEventListener('change', () => set(key, cb.checked));
    return h('div.st-row', h('label.gtk-check', cb, label), help ? h('div.st-help', help) : null);
  };

  function desktopPage() {
    main.append(
      section('Clock', check('24-hour clock', 'clock24h'), check('Show seconds', 'showSeconds', 'Takes effect after the next sign-in.')),
      section('Desktop icons', h('div.st-row', h('button.gtk-btn', { onclick: () => { re.kv.remove(`desktopPositions:${re.session.username}`); re.desktop.render(); } }, 'Arrange desktop icons'))),
    );
  }

  function accountPage() {
    const u = re.session.user;
    const name = h('input.gtk-entry', { value: u.fullName || '' });
    const dom = h('select.gtk-select', GECIP_DOMAINS.filter(d => d !== 'shared_allGECIPs').map(d => h('option', { value: d, selected: d === (u.domain || 'training') }, d)));
    const grp = h('select.gtk-select', ['Research Network (Academic)', 'Research Network (Industry)'].map(g => h('option', { selected: g === u.userGroup }, g)));
    main.append(section('Your account',
      h('div.st-grid', h('label', 'Username'), h('div.mono', u.username),
        h('label', 'Full name'), name,
        h('label', 'GECIP domain'), dom,
        h('label', 'User group'), grp),
      h('div.st-help', 'Your username is set when you sign in. Changing the domain changes which re_gecip folder you can write to (the page reloads).'),
      h('div.st-row', h('button.gtk-btn.suggested', { onclick: async () => {
        const changedDomain = dom.value !== (u.domain || 'training');
        re.session.user = { ...u, fullName: name.value.trim() || u.fullName, domain: dom.value, userGroup: grp.value };
        if (changedDomain) { await re.dialogs.info('Domain changed', 'The page will reload so the file system can be set up for the new domain.'); location.reload(); }
        else re.notify({ title: 'Account updated', body: 'Your details have been saved.' });
      } }, 'Save'))));
  }

  function trainingPage() {
    const delay = h('input.gtk-entry', { type: 'number', min: 2, max: 3600, value: Math.round((S().reviewDelayMs || 20000) / 1000), style: { width: '90px' } });
    delay.addEventListener('change', () => set('reviewDelayMs', Math.max(2, Number(delay.value) || 20) * 1000));
    main.append(
      h('div.st-note', 'These controls are for instructors running practicals. They change how the simulated review processes behave in this browser only.'),
      section('Reviews',
        check('Review submissions automatically', 'autoReview', 'When off, proposals and Airlock requests wait until you decide them below.'),
        h('div.st-row', h('label', 'Time the simulated reviewers take (seconds): '), delay),
        check('Enforce the 30-day rule for exports', 'enforceExportWait', 'Projects must have been approved for 30 days before anything can be exported.'),
        check('Require "module load" for tools such as samtools and bcftools', 'requireModules')),
      section('Research Registry proposals', projectsTable()),
      section('Airlock requests', airlockTable()),
      section('Reset', h('div.st-row',
        h('button.gtk-btn', { onclick: async () => { if (await re.dialogs.confirm('Delete all proposals and Airlock requests?', 'Your files are kept.', { ok: 'Delete', destructive: true })) { re.services.submissions.resetAll(); render(); } } }, 'Clear proposals and Airlock requests'),
        h('button.gtk-btn.destructive', { onclick: async () => { if (await re.dialogs.confirm('Reset the whole simulator?', 'This deletes all your files, settings, proposals and requests kept in this browser, and signs you out.', { ok: 'Reset everything', destructive: true })) location.href = location.pathname + '?reset'; } }, 'Reset the simulator…'))),
    );
  }

  const statusBadge = (s) => h('span.st-badge.st-' + s, s);

  function projectsTable() {
    const sub = re.services.submissions;
    const list = sub.projects().sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
    if (!list.length) return h('div.st-help', 'No proposals yet.');
    const tbl = h('table.gtk-table.st-table', h('thead', h('tr', h('th', 'Project'), h('th', 'Status'), h('th', 'Approved'), h('th', ''))));
    const tb = h('tbody');
    for (const p of list) {
      const act = (label, fn) => h('button.gtk-btn.small', { onclick: async () => { await fn(); render(); } }, label);
      tb.appendChild(h('tr',
        h('td', h('div', { style: { fontWeight: 600 } }, p.id || p.ref), h('div.st-help', p.title)),
        h('td', statusBadge(p.status)),
        h('td', p.approvedAt ? `${Math.floor((Date.now() - p.approvedAt) / 864e5)} days ago` : '—'),
        h('td.st-actions',
          p.status !== 'approved' && p.status !== 'draft' ? act('Approve', () => sub.approveProject(p.ref, 'Approved (by the instructor).')) : null,
          p.status !== 'approved' && p.status !== 'draft' ? act('Ask for revisions', async () => { const n = await re.dialogs.prompt('What should the applicant revise?', { title: 'Revisions', value: 'Please expand the lay summary and the analysis plan.' }); if (n) sub.setProjectStatus(p.ref, 'revisions', n); }) : null,
          p.status !== 'approved' && p.status !== 'draft' ? act('Reject', async () => { const n = await re.dialogs.prompt('Reason for rejection:', { title: 'Reject', value: 'The proposal is out of scope for the Research Network.' }); if (n) sub.setProjectStatus(p.ref, 'rejected', n); }) : null,
          p.status === 'approved' ? act('Backdate 30 days', () => sub.backdateProject(p.ref, 30)) : null)));
    }
    tbl.appendChild(tb);
    return tbl;
  }

  function airlockTable() {
    const sub = re.services.submissions;
    const list = sub.requests().sort((a, b) => b.submittedAt - a.submittedAt);
    if (!list.length) return h('div.st-help', 'No Airlock requests yet.');
    const tbl = h('table.gtk-table.st-table', h('thead', h('tr', h('th', 'Request'), h('th', 'Status'), h('th', 'Pre-check'), h('th', ''))));
    const tb = h('tbody');
    for (const r of list) {
      const fails = r.findings.filter(f => f.level === 'fail').length, warns = r.findings.filter(f => f.level === 'warn').length;
      const act = (label, fn) => h('button.gtk-btn.small', { onclick: async () => { await fn(); render(); } }, label);
      const open = !['approved', 'rejected', 'withdrawn'].includes(r.status);
      tb.appendChild(h('tr',
        h('td', h('div', { style: { fontWeight: 600 } }, `${r.transfer} · ${r.direction}`), h('div.st-help', `${r.rrNumber || ''} · ${r.files.map(f => f.name).join(', ')}`)),
        h('td', statusBadge(r.status)),
        h('td', `${fails} fail, ${warns} warn`),
        h('td.st-actions',
          open ? act('Approve', () => sub.finishAirlock(r.id, { outcome: 'approved', reasons: [] }, 'Airlock team (instructor)')) : null,
          open ? act('Reject', async () => { const n = await re.dialogs.prompt('Reason for rejection:', { title: 'Reject', value: r.findings.filter(f => f.level === 'fail').map(f => f.message).join(' ') || 'Counts below 5 must be masked.' }); if (n) sub.finishAirlock(r.id, { outcome: 'rejected', reasons: [n] }, 'Airlock team (instructor)'); }) : null,
          open ? act('Ask a question', async () => { const n = await re.dialogs.prompt('Your question to the requester:', { title: 'More information', value: 'Please explain how the participant subset was chosen.' }); if (n) sub.finishAirlock(r.id, { outcome: 'more-info', reasons: [n] }, 'Airlock team (instructor)'); }) : null)));
    }
    tbl.appendChild(tb);
    return tbl;
  }

  async function dataPage() {
    const lk = re.services.labkey;
    const rels = lk.releases();
    const relSel = h('select.gtk-select', rels.map(r => h('option', { value: r.folderPath }, r.folderPath)));
    const tblSel = h('select.gtk-select', { style: { minWidth: '260px' } });
    const info = h('div.st-help');
    const fillTables = async () => {
      clear(tblSel);
      info.textContent = 'Loading…';
      try {
        const tables = await lk.tables(relSel.value);
        for (const t of tables.sort((a, b) => a.name.localeCompare(b.name))) tblSel.appendChild(h('option', { value: t.name }, `${t.name} (${t.rowCount} rows)`));
        info.textContent = `${tables.length} tables, ${tables.filter(t => t.rowCount).length} with data.`;
      } catch (e) { info.textContent = 'Could not load the release: ' + e.message; }
    };
    relSel.addEventListener('change', fillTables);
    const file = h('input', { type: 'file', accept: '.tsv,.csv,.txt' });
    main.append(
      h('div.st-note', 'Load a table\'s rows from a TSV/CSV file on your own computer (the header row must use the table\'s column names). The data are kept in this browser and replace the table\'s rows. For data shared with a whole class, add TSV files to data/labkey/data/<release>/ in the repository instead.'),
      section('Load table data',
        h('div.st-grid', h('label', 'Release'), relSel, h('label', 'Table'), tblSel, h('label', 'File'), file),
        info,
        h('div.st-row',
          h('button.gtk-btn.suggested', { onclick: async () => {
            const f = file.files[0];
            if (!f) return re.dialogs.warning('Choose a file first.');
            try { const n = await lk.loadTable(relSel.value, tblSel.value, await f.text()); re.notify({ title: 'Table loaded', body: `${n} rows loaded into ${tblSel.value}.` }); fillTables(); } catch (e) { re.dialogs.error('Could not load the table', e.message); }
          } }, 'Load into table'),
          h('button.gtk-btn', { onclick: async () => { if (await re.dialogs.confirm('Remove all uploaded table data?', 'The tables go back to the data that come with the simulator.', { ok: 'Remove', destructive: true })) { await lk.clearUploads(); fillTables(); } } }, 'Remove uploaded data'))),
    );
    fillTables();
  }

  function aboutPage() {
    const C = re.config;
    main.append(
      h('div.st-about', h('img', { src: 'assets/icons/apps/re-logo.svg', alt: '' }),
        h('div', h('h2', `${C.environmentName} — training simulator`), h('p', C.trainingBanner),
          h('p.st-help', `Data browser: ${C.dataBrowser.productName}. Engine: the comparativechrono workbenches (bash, WebAssembly tools, webR, Pyodide). Storage namespace: ${C.storageNamespace}.`),
          h('p.st-help', 'This is a teaching simulation. It is not affiliated with, or endorsed by, Genomics England, Posit (RStudio), the Spyder project, the Broad Institute (IGV) or LabKey Corporation.'))),
      section('Storage', h('div', { id: 'st-storage' }, 'Measuring…')),
    );
    navigator.storage?.estimate?.().then(e => { const el = main.querySelector('#st-storage'); if (el) el.textContent = `This browser holds ${formatBytes(e.usage)} for the simulator (of ${formatBytes(e.quota)} available).`; });
  }

  win.on('relaunch', (a) => { if (a?.page) { current = a.page; render(); } });
  const off = re.services.submissions.on('change', () => { if (current === 'training') render(); });
  win.on('close', off);
  render();
  return win;
}
