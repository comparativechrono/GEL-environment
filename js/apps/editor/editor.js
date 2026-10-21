// =============================================================================
// Text Editor (Mousepad-like): tabs, syntax highlighting (CodeMirror 5),
// find & replace, go to line, read-only files, unsaved-change warnings.
// =============================================================================

import { h, clear } from '../../core/util.js';
import { menubar } from '../../core/menu.js';
import { kv } from '../../core/store.js';
import { loadEngine } from '../../engine/loader.js';
import { relayResize } from '../engine-host.js';

const MODES = [
  { id: 'text/plain', label: 'Plain Text', re: /\.(txt|log|out|err|csv|tsv|tab|ped|fam|bim)$/i },
  { id: 'r', label: 'R', re: /\.(r|rprofile)$|(^|\/)\.rprofile$/i },
  { id: 'markdown', label: 'Markdown', re: /\.(md|markdown|rmd|qmd)$/i },
  { id: 'python', label: 'Python', re: /\.(py|pyw)$/i },
  { id: 'shell', label: 'Shell Script', re: /\.(sh|bash|lsf|bsub)$|(^|\/)\.(bashrc|profile|bash_profile)$/i },
  { id: 'yaml', label: 'YAML', re: /\.(ya?ml|cwl)$/i },
  { id: 'javascript', label: 'JavaScript / JSON', re: /\.(js|mjs|json)$/i },
];
const modeFor = (path) => (MODES.find(m => m.re.test(path || '')) || MODES[0]);
const MAX_SIZE = 8 * 1024 * 1024;

export async function launch(ctx, args = {}) {
  const { re } = ctx;
  const vfs = re.vfs;
  // a file opened while an editor window is open becomes a tab of that window (as in Mousepad)
  const existing = args.path && !args.newWindow ? re.wm.byApp('text-editor')[0] : null;
  if (existing) { existing.focus(); existing.emit('relaunch', args); return existing; }
  await loadEngine('codemirror');
  const CM = window.CodeMirror;

  const win = ctx.openWindow({ width: 860, height: 600, title: 'Text Editor', minWidth: 360, minHeight: 240, className: 'app-editor' });
  const tabsEl = h('div.gtk-tabs.ed-tabs');
  const banner = h('div.ed-banner.hidden');
  const host = h('div.ed-host');
  const findBar = h('div.ed-find.hidden');
  const status = h('div.gtk-statusbar.ed-status');
  const docs = [];
  let cur = null;
  let wrap = kv.get('ed:wrap', false);
  let lineNumbers = kv.get('ed:lineNumbers', true);
  let fontSize = kv.get('ed:fontSize', 13);

  function title(d) { return (d.dirty ? '*' : '') + (d.path ? vfs.basename(d.path) : 'Untitled ' + d.n); }

  function renderTabs() {
    clear(tabsEl);
    tabsEl.classList.toggle('hidden', docs.length < 2);
    for (const d of docs) {
      const close = h('button.tab-close', { title: 'Close tab' }, '×');
      const t = h('div.gtk-tab' + (d === cur ? '.active' : ''), { title: d.path || '' }, h('span', title(d)), close);
      t.addEventListener('click', (e) => { if (e.target !== close) show(d); });
      close.addEventListener('click', () => closeDoc(d));
      t.addEventListener('auxclick', (e) => { if (e.button === 1) closeDoc(d); });
      tabsEl.appendChild(t);
    }
    win.setTitle(cur ? `${title(cur)} - Text Editor` : 'Text Editor');
  }

  function renderStatus() {
    if (!cur) { status.textContent = ''; return; }
    const c = cur.cm.getCursor();
    status.replaceChildren(
      h('span', `Filetype: ${cur.mode.label}`),
      h('span', `Line: ${c.line + 1}  Column: ${c.ch + 1}`),
      h('span', cur.readonly ? 'Read-only' : 'INS'),
      h('span.spacer', { style: { flex: '1' } }),
      h('span.muted', cur.path ? vfs.pretty(cur.path) : 'Not saved yet'));
  }

  function makeDoc({ path = null, text = '', readonly = false } = {}) {
    const el = h('div.ed-doc');
    const mode = modeFor(path);
    const cm = CM(el, {
      value: text, mode: mode.id, lineNumbers, lineWrapping: wrap, readOnly: readonly,
      indentUnit: mode.id === 'python' ? 4 : 2, tabSize: 4, indentWithTabs: false, matchBrackets: true, autoCloseBrackets: true,
      styleActiveLine: true, extraKeys: {
        'Ctrl-S': () => save(), 'Ctrl-Shift-S': () => saveAs(), 'Ctrl-F': () => openFind(false), 'Ctrl-H': () => openFind(true),
        'Ctrl-G': () => gotoLine(), 'Ctrl-W': () => closeDoc(cur), 'Ctrl-N': () => newDoc(), 'Ctrl-O': () => openDialog(),
        'Ctrl-/': 'toggleComment', 'Tab': (c) => (c.somethingSelected() ? c.indentSelection('add') : c.replaceSelection(mode.id === 'python' ? '    ' : '  ')),
      },
    });
    const d = { n: docs.length + 1, path, cm, el, mode, readonly, dirty: false, saved: text };
    cm.on('change', () => { const was = d.dirty; d.dirty = cm.getValue() !== d.saved; if (was !== d.dirty) renderTabs(); });
    cm.on('cursorActivity', renderStatus);
    docs.push(d);
    return d;
  }

  function show(d) {
    cur = d;
    for (const x of docs) x.el.classList.toggle('hidden', x !== d);
    if (!d.el.isConnected) host.appendChild(d.el);
    banner.classList.toggle('hidden', !d.readonly);
    banner.textContent = d.readonly ? `This file is read-only (${d.path ? vfs.pretty(d.path) : ''}). Use File ▸ Save As… to save a copy in your own folder.` : '';
    renderTabs();
    renderStatus();
    applyView();
    setTimeout(() => { d.cm.refresh(); d.cm.focus(); }, 0);
  }

  function applyView() {
    host.style.setProperty('--ed-font', fontSize + 'px');
    for (const d of docs) { d.cm.setOption('lineWrapping', wrap); d.cm.setOption('lineNumbers', lineNumbers); }
    cur?.cm.refresh();
  }

  function newDoc() { show(makeDoc()); }

  async function openPath(path) {
    const abs = vfs.normalize(path);
    const existing = docs.find(d => d.path === abs);
    if (existing) { show(existing); return; }
    if (!vfs.exists(abs)) {
      // a new file (nano newfile.txt): an empty document that is saved there
      const d = makeDoc({ path: abs, text: '', readonly: !vfs.canWrite(abs) });
      d.dirty = false;
      show(d);
      return;
    }
    const st = vfs.stat(abs);
    if (st.type === 'dir') return re.apps.launchApp('file-manager', { path: abs });
    if (st.size > MAX_SIZE) {
      await re.dialogs.warning(`"${vfs.basename(abs)}" is too large to open in the Text Editor (${(st.size / 1048576).toFixed(1)} MB).`, 'Use the terminal (less, head, zcat …) to look at large files.');
      return;
    }
    let bytes;
    try { bytes = await vfs.readFile(abs); } catch (e) { re.dialogs.error(`Could not open "${vfs.basename(abs)}"`, e.message); return; }
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (/\.(gz|bam|cram|bcf|bai|tbi|csi|zip|xlsx|ods|png|jpe?g|pdf|sqlite)$/i.test(abs) || text.slice(0, 4096).includes('\u0000')) {
      await re.dialogs.warning(`"${vfs.basename(abs)}" is not a text file.`, 'Binary and compressed files cannot be edited as text. Use the terminal: zcat, samtools view, bcftools view …');
      return;
    }
    if (cur && !cur.path && !cur.dirty && cur.cm.getValue() === '') closeDoc(cur, true);
    const d = makeDoc({ path: abs, text, readonly: !vfs.canWrite(abs) });
    show(d);
    pushRecent(abs);
  }

  function pushRecent(p) { const r = kv.get('ed:recent', []).filter(x => x !== p); r.unshift(p); kv.set('ed:recent', r.slice(0, 10)); }

  async function openDialog() {
    const paths = await re.dialogs.fileChooser({ mode: 'open', multiple: true, startDir: cur?.path ? vfs.dirname(cur.path) : re.session.workdir });
    for (const p of paths || []) await openPath(p);
  }

  async function save() {
    if (!cur) return false;
    if (!cur.path || cur.readonly) return saveAs();
    try {
      vfs.writeFile(cur.path, cur.cm.getValue());
      cur.saved = cur.cm.getValue(); cur.dirty = false; cur.readonly = false;
      renderTabs(); renderStatus();
      return true;
    } catch (e) {
      await re.dialogs.error(`Failed to save "${vfs.basename(cur.path)}"`, e.message);
      return false;
    }
  }

  async function saveAs() {
    if (!cur) return false;
    const start = cur.path && vfs.canWrite(vfs.dirname(cur.path)) ? vfs.dirname(cur.path) : re.session.workdir;
    const p = await re.dialogs.fileChooser({ mode: 'save', startDir: vfs.isDir(start) ? start : re.session.home, filename: cur.path ? vfs.basename(cur.path) : 'Untitled.txt' });
    if (!p) return false;
    cur.path = p;
    const m = modeFor(p);
    if (m !== cur.mode) { cur.mode = m; cur.cm.setOption('mode', m.id); }
    cur.readonly = false; cur.cm.setOption('readOnly', false);
    const ok = await save();
    if (ok) { pushRecent(p); show(cur); }
    return ok;
  }

  async function closeDoc(d, force = false) {
    if (!d) return true;
    if (d.dirty && !force) {
      const v = await re.dialogs.message({
        title: 'Save Changes', icon: 'question',
        primary: `Do you want to save the changes before closing "${title(d).replace(/^\*/, '')}"?`,
        secondary: 'If you don\'t save, changes will be permanently lost.',
        buttons: [{ label: 'Don\'t Save', value: 'discard', kind: 'destructive' }, { label: 'Cancel', value: null }, { label: 'Save', value: 'save', kind: 'suggested' }],
      });
      if (!v) return false;
      if (v === 'save') { const was = cur; cur = d; const ok = await save(); cur = was; if (!ok) return false; }
    }
    const i = docs.indexOf(d);
    docs.splice(i, 1);
    d.el.remove();
    if (!docs.length) { if (!force) { win.close(true); return true; } }
    if (cur === d) show(docs[Math.min(i, docs.length - 1)]);
    else renderTabs();
    return true;
  }

  // -------------------------------------------------------- find / replace
  const findIn = h('input.gtk-entry', { placeholder: 'Search…', style: { width: '200px' } });
  const replIn = h('input.gtk-entry', { placeholder: 'Replace with…', style: { width: '180px' } });
  const caseCb = h('input', { type: 'checkbox' });
  const findMsg = h('span.muted');
  const replRow = h('span.ed-repl', replIn,
    h('button.gtk-btn.small', { onclick: () => replace(false) }, 'Replace'),
    h('button.gtk-btn.small', { onclick: () => replace(true) }, 'Replace All'));
  findBar.append(findIn,
    h('button.gtk-btn.small', { onclick: () => find(true) }, '▲'),
    h('button.gtk-btn.small', { onclick: () => find(false) }, '▼'),
    h('label.gtk-check', caseCb, 'Match case'), replRow, findMsg,
    h('span', { style: { flex: '1' } }),
    h('button.tool-btn', { title: 'Close', onclick: () => findBar.classList.add('hidden') }, '✕'));
  function openFind(withReplace) {
    findBar.classList.remove('hidden');
    replRow.classList.toggle('hidden', !withReplace || cur?.readonly);
    const sel = cur?.cm.getSelection();
    if (sel && !sel.includes('\n')) findIn.value = sel;
    findIn.focus(); findIn.select();
  }
  function find(back) {
    if (!cur || !findIn.value) return;
    const cm = cur.cm;
    let c = cm.getSearchCursor(findIn.value, back ? cm.getCursor('from') : cm.getCursor('to'), { caseFold: !caseCb.checked });
    if (!(back ? c.findPrevious() : c.findNext())) {
      c = cm.getSearchCursor(findIn.value, back ? { line: cm.lastLine() } : { line: 0, ch: 0 }, { caseFold: !caseCb.checked });
      if (!(back ? c.findPrevious() : c.findNext())) { findMsg.textContent = 'Not found'; return; }
      findMsg.textContent = 'Wrapped around';
    } else findMsg.textContent = '';
    cm.setSelection(c.from(), c.to());
    cm.scrollIntoView({ from: c.from(), to: c.to() }, 60);
  }
  function replace(all) {
    if (!cur || cur.readonly || !findIn.value) return;
    const cm = cur.cm;
    if (all) {
      let n = 0;
      cm.operation(() => {
        const c = cm.getSearchCursor(findIn.value, { line: 0, ch: 0 }, { caseFold: !caseCb.checked });
        while (c.findNext()) { c.replace(replIn.value); n++; }
      });
      findMsg.textContent = `${n} replaced`;
      return;
    }
    const sel = cm.getSelection();
    if (sel && (caseCb.checked ? sel === findIn.value : sel.toLowerCase() === findIn.value.toLowerCase())) cm.replaceSelection(replIn.value);
    find(false);
  }
  findIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') find(e.shiftKey); if (e.key === 'Escape') { findBar.classList.add('hidden'); cur?.cm.focus(); } });

  async function gotoLine() {
    if (!cur) return;
    const v = await re.dialogs.prompt('Line number:', { title: 'Go to Line', value: String(cur.cm.getCursor().line + 1) });
    const n = parseInt(v, 10);
    if (n > 0) { cur.cm.setCursor({ line: n - 1, ch: 0 }); cur.cm.scrollIntoView(null, 120); cur.cm.focus(); }
  }

  // ------------------------------------------------------------- menus
  const bar = menubar([
    { label: 'File', items: () => [
      { label: 'New', shortcut: 'Ctrl+N', icon: 'assets/icons/actions/document-new.svg', action: newDoc },
      { label: 'New Window', action: () => re.apps.launchApp('text-editor', {}) },
      { label: 'Open…', shortcut: 'Ctrl+O', icon: 'assets/icons/actions/document-open.svg', action: openDialog },
      { label: 'Open Recent', submenu: () => { const r = kv.get('ed:recent', []).filter(p => vfs.exists(p)); return r.length ? r.map(p => ({ label: vfs.pretty(p), action: () => openPath(p) })) : [{ label: 'No recent files', disabled: true }]; } },
      { type: 'separator' },
      { label: 'Save', shortcut: 'Ctrl+S', icon: 'assets/icons/actions/document-save.svg', action: save, disabled: !cur },
      { label: 'Save As…', shortcut: 'Shift+Ctrl+S', icon: 'assets/icons/actions/document-save-as.svg', action: saveAs, disabled: !cur },
      { label: 'Reload', action: async () => { if (cur?.path) { const p = cur.path; await closeDoc(cur, true); await openPath(p); } }, disabled: !cur?.path },
      { type: 'separator' },
      { label: 'Close Tab', shortcut: 'Ctrl+W', action: () => closeDoc(cur) },
      { label: 'Close Window', shortcut: 'Shift+Ctrl+Q', action: () => win.close() },
    ] },
    { label: 'Edit', items: () => [
      { label: 'Undo', shortcut: 'Ctrl+Z', action: () => cur?.cm.undo() },
      { label: 'Redo', shortcut: 'Shift+Ctrl+Z', action: () => cur?.cm.redo() },
      { type: 'separator' },
      { label: 'Cut', shortcut: 'Ctrl+X', action: () => { const s = cur?.cm.getSelection(); if (s) { navigator.clipboard?.writeText(s); cur.cm.replaceSelection(''); } } },
      { label: 'Copy', shortcut: 'Ctrl+C', action: () => { const s = cur?.cm.getSelection(); if (s) navigator.clipboard?.writeText(s); } },
      { label: 'Paste', shortcut: 'Ctrl+V', action: async () => { try { cur?.cm.replaceSelection(await navigator.clipboard.readText()); } catch { /* blocked */ } } },
      { label: 'Select All', shortcut: 'Ctrl+A', action: () => cur?.cm.execCommand('selectAll') },
      { type: 'separator' },
      { label: 'Toggle Comment', shortcut: 'Ctrl+/', action: () => cur?.cm.execCommand('toggleComment') },
    ] },
    { label: 'Search', items: () => [
      { label: 'Find…', shortcut: 'Ctrl+F', action: () => openFind(false) },
      { label: 'Find and Replace…', shortcut: 'Ctrl+H', action: () => openFind(true) },
      { label: 'Go to Line…', shortcut: 'Ctrl+G', action: gotoLine },
    ] },
    { label: 'View', items: () => [
      { label: 'Line Numbers', checked: lineNumbers, action: () => { lineNumbers = !lineNumbers; kv.set('ed:lineNumbers', lineNumbers); applyView(); } },
      { label: 'Word Wrap', checked: wrap, action: () => { wrap = !wrap; kv.set('ed:wrap', wrap); applyView(); } },
      { type: 'separator' },
      { label: 'Zoom In', shortcut: 'Ctrl++', action: () => { fontSize = Math.min(28, fontSize + 1); kv.set('ed:fontSize', fontSize); applyView(); } },
      { label: 'Zoom Out', shortcut: 'Ctrl+-', action: () => { fontSize = Math.max(9, fontSize - 1); kv.set('ed:fontSize', fontSize); applyView(); } },
      { label: 'Reset Zoom', shortcut: 'Ctrl+0', action: () => { fontSize = 13; kv.set('ed:fontSize', fontSize); applyView(); } },
    ] },
    { label: 'Document', items: () => [
      { type: 'header', label: 'Filetype' },
      ...MODES.map(m => ({ label: m.label, radio: true, checked: cur?.mode === m, action: () => { if (cur) { cur.mode = m; cur.cm.setOption('mode', m.id); renderStatus(); } } })),
    ] },
    { label: 'Help', items: () => [
      { label: 'About', action: () => re.dialogs.info('Text Editor', 'A simple text editor for the Research Environment simulator (CodeMirror 5).', 'About') },
    ] },
  ]);

  win.body.append(bar.el, tabsEl, banner, findBar, host, status);
  relayResize(win, () => cur?.cm.refresh());
  win.onBeforeClose(async () => {
    for (const d of docs.slice()) { if (d.dirty) { show(d); if (!(await closeDoc(d))) return false; } }
    return true;
  });
  win.on('relaunch', (a) => a?.path && openPath(a.path));

  if (args.path) await openPath(args.path);
  if (!docs.length) newDoc();
  return win;
}
