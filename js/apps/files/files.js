// =============================================================================
// Home — the file manager (Thunar-like). The mounted RE folders (genomes,
// gel_data_resources, pgen_public_data_resources, re_gecip) appear as
// bookmarks in the side panel, as on the Ubuntu RE desktop.
// =============================================================================

import { h, clear, formatBytes, lsDate } from '../../core/util.js';
import { showMenu, menubar } from '../../core/menu.js';
import { kv } from '../../core/store.js';
import { iconForPath, mimeForPath } from '../../core/mime.js';
import { openPath, openWithItems, showProperties } from '../../shell/desktop.js';

let clipboard = null; // {mode:'copy'|'cut', paths:[]}

export async function launch(ctx, args = {}) {
  const { re } = ctx;
  const vfs = re.vfs;
  const home = re.session.home;
  let dir = args.path && vfs.isDir(args.path) ? vfs.normalize(args.path) : home;
  let back = [], fwd = [];
  let selected = new Set(args.select ? [args.select] : []);
  let showHidden = kv.get('fm:hidden', false);
  let viewMode = kv.get('fm:view', 'icons');
  let filter = '';

  const win = ctx.openWindow({ width: 900, height: 560, title: 'Home', minWidth: 420, minHeight: 260, className: 'app-files' });

  const btn = (icon, title, fn) => h('button.tool-btn', { title, onclick: fn }, h('img', { src: `assets/icons/actions/${icon}.svg`, alt: '' }));
  const bBack = btn('go-previous', 'Back (Alt+Left)', () => goBack());
  const bFwd = btn('go-next', 'Forward (Alt+Right)', () => goFwd());
  const bUp = btn('go-up', 'Open the parent folder (Alt+Up)', () => go(vfs.dirname(dir)));
  const bHome = btn('go-home', 'Home', () => go(home));
  const pathBar = h('div.fm-pathbar');
  const location = h('input.gtk-entry.fm-location.hidden', { spellcheck: 'false' });
  const search = h('input.gtk-entry.fm-search', { type: 'search', placeholder: 'Filter…' });
  const bView = btn(viewMode === 'icons' ? 'view-list' : 'view-grid', 'Change view', () => { viewMode = viewMode === 'icons' ? 'list' : 'icons'; kv.set('fm:view', viewMode); bView.querySelector('img').src = `assets/icons/actions/${viewMode === 'icons' ? 'view-list' : 'view-grid'}.svg`; render(); });
  const toolbar = h('div.gtk-toolbar.fm-toolbar', bBack, bFwd, bUp, bHome, h('div.sep'), pathBar, location, h('div.sep'), search, bView);

  const side = h('div.fm-side.gtk-scroll');
  // (data-accept-file-drop: files dropped on it are not stopped by js/core/clipboard.js – the handler below says why
  // they cannot come in)
  const main = h('div.fm-main.gtk-scroll', { tabindex: 0, 'data-accept-file-drop': '' });
  const status = h('div.gtk-statusbar.fm-status');

  const bar = menubar([
    { label: 'File', items: () => [
      { label: 'Open New Window', shortcut: 'Ctrl+N', action: () => re.apps.launchApp('file-manager', { path: dir }) },
      { label: 'Create Folder…', shortcut: 'Shift+Ctrl+N', icon: 'assets/icons/actions/folder-new.svg', action: newFolder, disabled: !vfs.canWrite(dir + '/x') },
      { label: 'Create Document', submenu: createDocItems(), disabled: !vfs.canWrite(dir + '/x') },
      { type: 'separator' },
      { label: 'Open Terminal Here', icon: 'assets/icons/actions/terminal.svg', action: () => re.apps.launchApp('terminal', { cwd: dir }) },
      { type: 'separator' },
      { label: 'Properties…', action: () => showProperties(re, selected.size === 1 ? [...selected][0] : dir) },
      { type: 'separator' },
      { label: 'Close Window', shortcut: 'Ctrl+W', action: () => win.close() },
    ] },
    { label: 'Edit', items: () => [
      { label: 'Cut', shortcut: 'Ctrl+X', action: () => setClip('cut'), disabled: !selected.size },
      { label: 'Copy', shortcut: 'Ctrl+C', action: () => setClip('copy'), disabled: !selected.size },
      { label: 'Paste', shortcut: 'Ctrl+V', action: paste, disabled: !clipboard },
      { type: 'separator' },
      { label: 'Move to Trash', shortcut: 'Delete', action: trashSelected, disabled: !selected.size },
      { label: 'Rename…', shortcut: 'F2', action: renameSelected, disabled: selected.size !== 1 },
      { type: 'separator' },
      { label: 'Select All', shortcut: 'Ctrl+A', action: () => { selected = new Set(entries().map(e => e.path)); render(); } },
      { label: 'Copy Location', action: () => navigator.clipboard?.writeText(selected.size === 1 ? [...selected][0] : dir) },
    ] },
    { label: 'View', items: () => [
      { label: 'Reload', shortcut: 'Ctrl+R', action: render },
      { label: 'Show Hidden Files', shortcut: 'Ctrl+H', checked: showHidden, action: toggleHidden },
      { type: 'separator' },
      { label: 'Icon View', radio: true, checked: viewMode === 'icons', action: () => { viewMode = 'icons'; kv.set('fm:view', viewMode); render(); } },
      { label: 'Detailed List View', radio: true, checked: viewMode === 'list', action: () => { viewMode = 'list'; kv.set('fm:view', viewMode); render(); } },
      { type: 'separator' },
      { label: 'Location Bar', shortcut: 'Ctrl+L', action: editLocation },
    ] },
    { label: 'Go', items: () => [
      { label: 'Open Parent', shortcut: 'Alt+Up', action: () => go(vfs.dirname(dir)) },
      { label: 'Back', shortcut: 'Alt+Left', action: goBack, disabled: !back.length },
      { label: 'Forward', shortcut: 'Alt+Right', action: goFwd, disabled: !fwd.length },
      { type: 'separator' },
      { label: 'Home', action: () => go(home) },
      { label: 'Working folder (re_gecip)', action: () => go(re.session.workdir) },
      { label: 'File System', action: () => go('/') },
      { label: 'Trash', action: () => go(`${home}/.local/share/Trash/files`) },
    ] },
    { label: 'Help', items: () => [
      { label: 'About the file system', action: () => re.apps.launchApp('web-browser', { url: 'https://re-docs.genomicsengland.co.uk/home_directory/' }) },
    ] },
  ]);

  win.body.append(bar.el, toolbar, h('div.fm-body', side, main), status);

  // ---------------------------------------------------------------- side
  function renderSide() {
    clear(side);
    const item = (label, path, icon) => {
      if (!vfs.exists(path)) return null;
      const real = vfs.normalize(path);
      const el = h('div.fm-place' + (real === dir ? '.active' : ''), { title: vfs.pretty(path) }, h('img', { src: icon, alt: '' }), h('span', label));
      el.addEventListener('click', () => go(path));
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu([{ label: 'Open', action: () => go(path) }, { label: 'Open in New Window', action: () => re.apps.launchApp('file-manager', { path }) }, { label: 'Open Terminal Here', action: () => re.apps.launchApp('terminal', { cwd: path }) }], { x: e.clientX, y: e.clientY }); });
      return el;
    };
    side.append(
      h('div.fm-side-h', 'Places'),
      item(re.session.username, home, 'assets/icons/places/folder-home.svg'),
      item('Desktop', `${home}/Desktop`, 'assets/icons/places/folder-desktop.svg'),
      item('Documents', `${home}/Documents`, 'assets/icons/places/folder-documents.svg'),
      item('Downloads', `${home}/Downloads`, 'assets/icons/places/folder-downloads.svg'),
      item('Trash', `${home}/.local/share/Trash/files`, 'assets/icons/places/user-trash.svg'),
      item('File System', '/', 'assets/icons/places/drive-harddisk.svg'),
      h('div.fm-side-h', 'Bookmarks'),
      ...vfs.bookmarks().map(b => item(b.label, b.path, 'assets/icons/places/folder-remote.svg')),
      item('my re_gecip folder', re.session.workdir, 'assets/icons/places/folder.svg'),
    );
  }

  // ---------------------------------------------------------------- main
  function entries() {
    let list;
    try { list = vfs.readdir(dir, { withTypes: true }); } catch (e) { return []; }
    return list
      .filter(e => showHidden || !e.name.startsWith('.'))
      .filter(e => !filter || e.name.toLowerCase().includes(filter))
      .map(e => ({ ...e, path: (dir === '/' ? '' : dir) + '/' + e.name }))
      .sort((a, b) => (isDirLike(a) ? 0 : 1) - (isDirLike(b) ? 0 : 1) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  }
  const isDirLike = (e) => e.type === 'dir' || e.type === 'symlink-dir';

  function iconOf(e) {
    if (e.type === 'symlink-dir') return 'assets/icons/places/folder-remote.svg';
    return iconForPath(e.path, e.type === 'dir' ? 'dir' : 'file', { home });
  }

  function typeName(e) {
    if (e.type === 'dir') return 'folder';
    if (e.type === 'symlink-dir') return 'link to folder';
    if (e.type === 'symlink') return 'link';
    const m = mimeForPath(e.path);
    return { 'text/x-r': 'R script', 'text/x-python': 'Python script', 'text/x-sh': 'shell script', 'text/plain': 'plain text document', 'text/tab-separated-values': 'tab-separated values', 'application/x-vcf': 'VCF variant calls', 'application/x-bam': 'BAM alignments', 'application/x-index': 'index', 'application/gzip': 'compressed archive', 'application/json': 'JSON document', 'application/pdf': 'PDF document', 'image/*': 'image', 'text/markdown': 'Markdown document', 'text/html': 'HTML document', 'application/x-fasta': 'FASTA sequence', 'application/x-bed': 'genomic intervals' }[m] || 'file';
  }

  function render() {
    renderSide();
    renderPath();
    clear(main);
    main.className = 'fm-main gtk-scroll fm-' + viewMode;
    const list = entries();
    win.setTitle(dir === home ? re.session.username : vfs.basename(dir) === '/' ? 'File System' : vfs.basename(dir));
    if (!vfs.canRead(dir)) { main.appendChild(h('div.fm-empty', 'You do not have permission to view this folder.')); return; }
    if (dir === '/discovery_forum' && !list.length) main.appendChild(h('div.fm-empty', 'You do not have permission to view the contents of this folder (Discovery Forum members only).'));
    else if (!list.length) main.appendChild(h('div.fm-empty', filter ? 'No files match the filter.' : 'This folder is empty.'));
    if (viewMode === 'list' && list.length) {
      const tbl = h('table.gtk-table.fm-table', h('thead', h('tr', h('th', 'Name'), h('th', 'Size'), h('th', 'Type'), h('th', 'Date Modified'))));
      const tb = h('tbody');
      for (const e of list) {
        const tr = h('tr' + (selected.has(e.path) ? '.selected' : ''), { dataset: { path: e.path } },
          h('td', h('span.fm-cell', h('img', { src: iconOf(e), alt: '' }), e.name + (e.link ? ` → ${e.link}` : ''))),
          h('td', isDirLike(e) ? `${safeCount(e.path)} items` : formatBytes(e.size)),
          h('td', typeName(e)),
          h('td', e.mtime ? lsDate(e.mtime) : ''));
        hook(tr, e);
        tb.appendChild(tr);
      }
      tbl.appendChild(tb);
      main.appendChild(tbl);
    } else {
      for (const e of list) {
        const el = h('div.fm-item' + (selected.has(e.path) ? '.selected' : ''), { title: e.name + (e.link ? ` → ${e.link}` : ''), dataset: { path: e.path } },
          h('div.fm-ic', h('img', { src: iconOf(e), alt: '' }), e.link ? h('span.fm-emblem', '↗') : null, e.readonly && !isDirLike(e) && !dir.startsWith(home) ? h('span.fm-lock', '🔒') : null),
          h('div.fm-name', e.name));
        hook(el, e);
        main.appendChild(el);
      }
    }
    renderStatus(list);
  }

  function safeCount(p) { try { return vfs.readdir(p).filter(n => showHidden || !n.startsWith('.')).length; } catch { return 0; } }

  function renderStatus(list = entries()) {
    if (selected.size === 1) {
      const p = [...selected][0];
      const st = vfs.stat(p);
      status.textContent = st ? `"${vfs.basename(p)}" (${st.type === 'dir' ? `${safeCount(p)} items` : formatBytes(st.size)}) ${st.readonly ? '· read-only' : ''}` : '';
    } else if (selected.size > 1) status.textContent = `${selected.size} items selected`;
    else status.textContent = `${list.length} item${list.length === 1 ? '' : 's'}${vfs.canWrite(dir + '/x') ? '' : ' · read-only folder'}`;
  }

  function hook(el, e) {
    el.addEventListener('click', (ev) => {
      if (ev.ctrlKey || ev.metaKey) { selected.has(e.path) ? selected.delete(e.path) : selected.add(e.path); }
      else if (ev.shiftKey && selected.size) {
        const list = entries().map(x => x.path);
        const a = list.indexOf([...selected].pop()), b = list.indexOf(e.path);
        selected = new Set(list.slice(Math.min(a, b), Math.max(a, b) + 1));
      } else selected = new Set([e.path]);
      updateSel();
    });
    el.addEventListener('dblclick', () => open(e));
    el.addEventListener('contextmenu', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      if (!selected.has(e.path)) { selected = new Set([e.path]); updateSel(); }
      const many = selected.size > 1;
      const ro = !vfs.canWrite(e.path);
      showMenu([
        { label: 'Open', action: () => open(e) },
        isDirLike(e) ? { label: 'Open in New Window', action: () => re.apps.launchApp('file-manager', { path: e.path }) } : { label: 'Open With', submenu: openWithItems(re, e.path), disabled: many },
        isDirLike(e) ? { label: 'Open Terminal Here', icon: 'assets/icons/actions/terminal.svg', action: () => re.apps.launchApp('terminal', { cwd: e.path }) } : null,
        { type: 'separator' },
        { label: 'Cut', shortcut: 'Ctrl+X', action: () => setClip('cut'), disabled: ro },
        { label: 'Copy', shortcut: 'Ctrl+C', action: () => setClip('copy') },
        isDirLike(e) ? { label: 'Paste Into Folder', action: () => paste(e.path), disabled: !clipboard } : null,
        { type: 'separator' },
        { label: 'Move to Trash', shortcut: 'Delete', action: trashSelected, disabled: ro },
        { label: 'Rename…', shortcut: 'F2', action: renameSelected, disabled: many || ro },
        { type: 'separator' },
        { label: 'Copy Path', action: () => navigator.clipboard?.writeText([...selected].join('\n')) },
        !isDirLike(e) ? { label: 'Request export via Airlock…', icon: 'assets/icons/apps/airlock.svg', action: () => re.apps.launchApp('airlock', { attach: [...selected] }) } : null,
        { type: 'separator' },
        { label: 'Properties…', action: () => showProperties(re, e.path), disabled: many },
      ], { x: ev.clientX, y: ev.clientY });
    });
  }

  function updateSel() {
    for (const el of main.querySelectorAll('[data-path]')) el.classList.toggle('selected', selected.has(el.dataset.path));
    renderStatus();
  }

  function open(e) {
    if (isDirLike(e)) go(e.path);
    else openPath(re, e.path);
  }

  function renderPath() {
    clear(pathBar);
    const showAs = vfs.pretty(dir);
    const atHome = showAs === '~' || showAs.startsWith('~/');
    const parts = atHome ? showAs.slice(1).split('/').filter(Boolean) : dir.split('/').filter(Boolean);
    let acc = atHome ? home : '';
    pathBar.appendChild(h('button.gtk-btn.small.fm-crumb' + ((atHome && !parts.length) || dir === '/' ? '.active' : ''), { onclick: () => go(atHome ? home : '/') },
      h('img', { src: atHome ? 'assets/icons/places/folder-home.svg' : 'assets/icons/places/drive-harddisk.svg', alt: '' }), atHome ? re.session.username : ''));
    parts.forEach((part, i) => {
      acc += '/' + part;
      const target = acc;
      pathBar.appendChild(h('button.gtk-btn.small.fm-crumb' + (i === parts.length - 1 ? '.active' : ''), { onclick: () => go(target) }, part));
    });
    bBack.disabled = !back.length; bFwd.disabled = !fwd.length; bUp.disabled = dir === '/';
  }

  function editLocation() {
    pathBar.classList.add('hidden');
    location.classList.remove('hidden');
    location.value = dir;
    location.focus(); location.select();
  }
  location.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const p = vfs.normalize(location.value.trim() || '/', dir);
      if (vfs.isDir(p)) { go(p); location.classList.add('hidden'); pathBar.classList.remove('hidden'); }
      else if (vfs.exists(p)) openPath(re, p);
      else re.dialogs.error('Failed to open', `The folder "${location.value}" does not exist.`);
    }
    if (e.key === 'Escape') { location.classList.add('hidden'); pathBar.classList.remove('hidden'); }
  });
  location.addEventListener('blur', () => { location.classList.add('hidden'); pathBar.classList.remove('hidden'); });
  search.addEventListener('input', () => { filter = search.value.trim().toLowerCase(); render(); });

  function go(p, { record = true } = {}) {
    const target = vfs.normalize(p);
    if (!vfs.isDir(target)) return;
    if (record && target !== dir) { back.push(dir); fwd = []; }
    dir = target;
    selected = new Set();
    filter = ''; search.value = '';
    render();
    main.focus({ preventScroll: true });
  }
  function goBack() { if (!back.length) return; fwd.push(dir); go(back.pop(), { record: false }); }
  function goFwd() { if (!fwd.length) return; back.push(dir); go(fwd.pop(), { record: false }); }
  function toggleHidden() { showHidden = !showHidden; kv.set('fm:hidden', showHidden); render(); }

  function setClip(mode) { if (selected.size) clipboard = { mode, paths: [...selected] }; }
  async function paste(into = dir) {
    if (!clipboard) return;
    for (const p of clipboard.paths) {
      try {
        let dest = `${into === '/' ? '' : into}/${vfs.basename(p)}`;
        if (clipboard.mode === 'copy') {
          let i = 1;
          while (vfs.exists(dest)) dest = `${into}/${vfs.basename(p).replace(/(\.[^.]*)?$/, ` (copy ${i++})$1`)}`;
          await vfs.copy(p, dest, { recursive: true });
        } else vfs.rename(p, dest);
      } catch (e) { await re.dialogs.error(`Could not ${clipboard.mode === 'copy' ? 'copy' : 'move'} "${vfs.basename(p)}"`, e.message); break; }
    }
    if (clipboard.mode === 'cut') clipboard = null;
    render();
  }
  async function trashSelected() {
    for (const p of [...selected]) {
      try { vfs.trash(p); } catch (e) { await re.dialogs.error(`Could not move "${vfs.basename(p)}" to the Trash`, e.message); break; }
    }
    selected.clear(); render();
  }
  async function renameSelected() {
    const p = [...selected][0];
    if (!p) return;
    const name = await re.dialogs.prompt('Rename to:', { title: `Rename "${vfs.basename(p)}"`, value: vfs.basename(p) });
    if (!name || name === vfs.basename(p)) return;
    try { const n = vfs.rename(p, `${vfs.dirname(p)}/${name}`); selected = new Set([n]); render(); } catch (e) { re.dialogs.error('Could not rename', e.message); }
  }
  async function newFolder() {
    const name = await re.dialogs.prompt('Enter the new folder name:', { title: 'Create New Folder', value: 'New Folder' });
    if (!name) return;
    try { const p = vfs.mkdir(`${dir}/${name}`); selected = new Set([p]); render(); } catch (e) { re.dialogs.error('Could not create the folder', e.message); }
  }
  function createDocItems() {
    const mk = (name, text) => async () => {
      const n = await re.dialogs.prompt('Enter the new file name:', { title: 'Create Document', value: name });
      if (!n) return;
      try { const p = vfs.writeFile(`${dir}/${n}`, text); selected = new Set([p]); render(); } catch (e) { re.dialogs.error('Could not create the file', e.message); }
    };
    return [
      { label: 'Empty File', action: mk('Untitled Document.txt', '') },
      { label: 'R Script', action: mk('analysis.R', '# R script\n') },
      { label: 'Python Script', action: mk('analysis.py', '# Python script\n') },
      { label: 'Shell Script / LSF job', action: mk('job.sh', '#!/bin/bash\n#BSUB -q short\n#BSUB -P re_gecip_training\n#BSUB -o job.%J.out\n#BSUB -e job.%J.err\n#BSUB -R "rusage[mem=1000]"\n#BSUB -M 1000\n\n') },
    ];
  }

  main.addEventListener('click', (e) => { if (e.target === main) { selected.clear(); updateSel(); } });
  main.addEventListener('contextmenu', (e) => {
    if (e.target !== main && !e.target.classList.contains('fm-empty')) return;
    e.preventDefault();
    const canW = vfs.canWrite(dir + '/x');
    showMenu([
      { label: 'Create Folder…', icon: 'assets/icons/actions/folder-new.svg', action: newFolder, disabled: !canW },
      { label: 'Create Document', submenu: createDocItems(), disabled: !canW },
      { type: 'separator' },
      { label: 'Open Terminal Here', icon: 'assets/icons/actions/terminal.svg', action: () => re.apps.launchApp('terminal', { cwd: dir }) },
      { label: 'Paste', action: () => paste(), disabled: !clipboard || !canW },
      { type: 'separator' },
      { label: 'Show Hidden Files', checked: showHidden, action: toggleHidden },
      { label: 'Properties…', action: () => showProperties(re, dir) },
    ], { x: e.clientX, y: e.clientY });
  });
  main.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && selected.size) trashSelected();
    else if (e.key === 'F2') renameSelected();
    else if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) go(vfs.dirname(dir));
    else if (e.altKey && e.key === 'ArrowLeft') goBack();
    else if (e.altKey && e.key === 'ArrowRight') goFwd();
    else if (e.ctrlKey && e.key === 'h') { e.preventDefault(); toggleHidden(); }
    else if (e.ctrlKey && e.key === 'l') { e.preventDefault(); editLocation(); }
    else if (e.ctrlKey && e.key === 'c') setClip('copy');
    else if (e.ctrlKey && e.key === 'x') setClip('cut');
    else if (e.ctrlKey && e.key === 'v') paste();
    else if (e.ctrlKey && e.key === 'a') { e.preventDefault(); selected = new Set(entries().map(x => x.path)); updateSel(); }
    else if (e.key === 'Enter' && selected.size) { const p = [...selected][0]; const en = entries().find(x => x.path === p); if (en) open(en); }
  });
  // dropping files from the user's own computer is not allowed in the RE
  main.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
  main.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); window.MG.app.pickFiles(); } });

  const off = re.bus.on('fs:change', (ev) => {
    if (ev.path === dir || vfs.dirname(ev.path) === dir || ev.path.startsWith(dir + '/')) { clearTimeout(win._fmT); win._fmT = setTimeout(render, 120); }
  });
  win.on('close', off);
  win.on('relaunch', (a) => a?.path && go(a.path));
  render();
  return win;
}
