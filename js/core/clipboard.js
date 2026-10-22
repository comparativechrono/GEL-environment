// =============================================================================
// The Research Environment's own clipboard.
//
// In the RE, a remote desktop, copy and paste work between the programs of the
// desktop, but what is copied there never reaches the person's own computer,
// and what is copied on their computer cannot be pasted in. The simulator does
// the same. Copying (Ctrl+C, Ctrl+X, the right-click menu, the Copy buttons,
// the clipboard API) fills a clipboard kept in this page instead of the
// computer's; pasting (Ctrl+V, the menus, the clipboard API) takes from it,
// whatever the computer's clipboard holds. Dragging is switched off (it would
// carry text, links and pictures out of the page; dropping, into it), and the
// browser's own right-click menu (Copy Image, Save Image As, Search for …)
// gives way to the desktop's: Cut, Copy, Paste, Delete, Select All.
//
// guardWindow() does this in one window: the desktop's page, and every frame of
// the same origin (the web browser's websites, Shiny apps …) as it loads. HTML
// shown in a sandboxed frame (RStudio's Viewer, an HTML file in the web
// browser) cannot be reached from here: isolateHtml() puts the same code at the
// top of it, and it talks to this page with postMessage.
//
// It is always on: there is no setting to turn it off, so that the Airlock
// stays the only way data can leave the RE. The sign-in screens stand for the
// WorkSpaces client, outside the remote desktop, so they keep the computer's
// clipboard. A web page cannot stop screenshots, retyping, the browser's
// developer tools or its PDF viewer, nor – on Linux – the middle-click paste
// of text selected in the page.
// =============================================================================

import { showMenu, closeMenus } from './menu.js';

const clip = { text: '', html: '', blobs: null }; // what was copied last
let RE = null;
const isolated = true;  // always on: the clipboard stays inside the RE – there is no switch to turn it off
let explained = false;  // the first copy has been explained
let baseline = null;    // the computer's clipboard as the first paste after a copy saw it
let warnedAt = 0;
const bridged = new Set();     // sandboxed frames that keep a copy of the text (isolateHtml)
const hooked = new WeakSet();  // iframe elements whose loads are watched
const watched = new WeakSet(); // documents whose new frames are watched

/** Installs the RE's clipboard in this page (and its frames, as they appear): RE.clipboard. */
export function installClipboard(re) {
  RE = re;
  window.addEventListener('message', onMessage);
  re.clipboard = {
    get isolated() { return isolated; },
    readText: () => clip.text,
    writeText: (text) => put({ text }),
    installIn,
    isolateHtml,
  };
  installIn(window);
  return re.clipboard;
}

// ---------------------------------------------------------------- the store
const host = {
  on: (t) => isolated && !(t && t.closest && t.closest('#login')),
  text: () => clip.text,
  put: (d) => put(d),
  putItems,
  items,
  outside,
  menu: editMenu,
};

function put({ text = '', html = '', blobs = null } = {}) {
  clip.text = String(text ?? '');
  clip.html = String(html || '');
  clip.blobs = blobs;
  baseline = null;
  broadcast();
  if (!explained && RE) {
    explained = true;
    RE.notify({
      title: 'Copied inside the Research Environment',
      body: 'You can paste it anywhere in the RE. As in the real RE, the clipboard is not shared with your own computer: what you copy here cannot be pasted there, and what you copy there cannot be pasted here.',
      icon: 'assets/icons/actions/edit-copy.svg', timeout: 9000,
    });
  }
}

/** navigator.clipboard.write(): ClipboardItems (a plot as PNG …) */
async function putItems(list) {
  const blobs = {};
  for (const item of Array.from(list || [])) {
    for (const type of Array.from(item.types || [])) {
      try { blobs[type] = await item.getType(type); } catch { /* left out */ }
    }
  }
  const text = blobs['text/plain'] ? await blobs['text/plain'].text() : '';
  const html = blobs['text/html'] ? await blobs['text/html'].text() : '';
  put({ text, html, blobs: Object.keys(blobs).length ? blobs : null });
}

/** navigator.clipboard.read(), as ClipboardItems of the window that asks */
function items(w = window) {
  if (!w.ClipboardItem) return [];
  if (clip.blobs) return [new w.ClipboardItem(clip.blobs)];
  if (clip.text) return [new w.ClipboardItem({ 'text/plain': new w.Blob([clip.text], { type: 'text/plain' }) })];
  return [];
}

/**
 * A paste was stopped while the computer's clipboard held something (sig: a hash of it): say why, unless that is
 * what was pasted anyway (same), the paste was not into a text box (editable), or it is old news. What the
 * computer's clipboard held when the RE's was filled is not known: the first paste after a copy only notes it, and
 * a later change means that something new was copied on the computer.
 */
function outside(sig, same, editable) {
  if (!sig || same || !editable) return;
  if (clip.text || clip.blobs) {
    if (baseline === null) { baseline = sig; return; }
    if (sig === baseline) return;
  }
  baseline = sig;
  const now = Date.now();
  if (now - warnedAt < 15000 || !RE) return;
  warnedAt = now;
  RE.notify({
    title: 'Pasting from your computer is blocked',
    body: 'As in the real RE, what you copy on your own computer cannot be pasted into the Research Environment (files come in through an Airlock import request).'
      + (clip.text ? ' What you last copied in the RE was pasted instead.' : ''),
    icon: 'assets/icons/status/dialog-warning.svg', timeout: 9000,
  });
}

// ---------------------------------------------------------------- windows and frames
/**
 * The rules in a window of this origin (and, as they load, in its frames). false: another origin.
 * (A frame's first page keeps the window of the empty page the frame starts with – its listeners and all – and gets
 * a document of its own: the guard belongs to the window, and the frames of each document are watched.)
 */
function installIn(w) {
  let doc;
  try { doc = w.document; } catch { return false; } // a frame of another origin (a sandboxed one: see isolateHtml)
  if (!doc) return false;
  if (!Object.prototype.hasOwnProperty.call(w, '__reClipGuard')) {
    guardWindow(w, host);
    if (w !== window) {
      // (the desktop's menus close when the frame is clicked, or on Escape in it)
      w.addEventListener('pointerdown', () => closeMenus(), true);
      w.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); }, true);
    }
  }
  if (!watched.has(doc)) { watched.add(doc); watchFrames(doc); }
  return true;
}

function watchFrames(doc) {
  const scan = (n) => {
    if (!n || n.nodeType !== 1) return;
    if (n.tagName === 'IFRAME' || n.tagName === 'FRAME') hookFrame(n);
    else if (n.firstElementChild) for (const f of Array.from(n.getElementsByTagName('iframe'))) hookFrame(f);
  };
  scan(doc.documentElement);
  new doc.defaultView.MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) scan(n);
  }).observe(doc, { childList: true, subtree: true });
}

function hookFrame(fr) {
  if (!hooked.has(fr)) {
    hooked.add(fr);
    fr.addEventListener('load', () => installFrame(fr));
  }
  installFrame(fr);
}

function installFrame(fr) {
  let w = null;
  try { w = fr.contentWindow; } catch { w = null; }
  if (w) installIn(w);
}

// sandboxed frames (isolateHtml): they say hello, are sent the text, and send what is copied in them
function onMessage(e) {
  const d = e.data;
  if (!d || typeof d !== 'object' || typeof d.__reClip !== 'string' || !e.source) return;
  if (d.__reClip === 'hello') {
    bridged.add(e.source);
    try { e.source.postMessage({ __reClip: 'text', text: clip.text, on: isolated }, '*'); } catch { /* gone */ }
  } else if (d.__reClip === 'copy') {
    if (isolated) put({ text: String(d.text ?? '') });
  } else if (d.__reClip === 'outside') {
    outside(String(d.sig || ''), !!d.same, !!d.editable);
  }
}

function broadcast() {
  for (const w of [...bridged]) {
    try {
      if (w.closed) { bridged.delete(w); continue; }
      w.postMessage({ __reClip: 'text', text: clip.text, on: isolated }, '*');
    } catch { bridged.delete(w); }
  }
}

/**
 * An HTML document for a sandboxed frame (a string, or the bytes of a file – which come back as a string), with the
 * clipboard rules as its first script. A Blob made of it must say charset=utf-8.
 */
export function isolateHtml(src) {
  const s = typeof src === 'string' ? src : decodeHtml(src);
  if (!isolated) return s;
  const m = /^\ufeff?\s*(?:<!--[\s\S]*?-->\s*)*<!doctype[^>]*>/i.exec(s);
  const at = m ? m[0].length : (s.charCodeAt(0) === 0xfeff ? 1 : 0);
  return s.slice(0, at) + `<script>(${guardWindow})(window, (${frameHost})(window));<\/script>` + s.slice(at);
}

function decodeHtml(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return new TextDecoder('windows-1252').decode(b); }
}

// ---------------------------------------------------------------- the right-click menu
const isTextBox = (n) => !!n && (n.tagName === 'TEXTAREA' || (n.tagName === 'INPUT' && /^(text|search|url|tel|email|number|password)$/i.test(n.type || 'text')));

function boxText(n) {
  if (n.tagName === 'INPUT' && !/^(text|search|url|tel)$/i.test(n.type || 'text')) return ''; // (no selection API; a password is never copied)
  try { return n.selectionEnd > n.selectionStart ? n.value.slice(n.selectionStart, n.selectionEnd) : ''; } catch { return ''; }
}

/** the text box or editable element a right-click is in */
function fieldOf(t) {
  const box = t.closest('input, textarea');
  if (box) return isTextBox(box) ? box : null;
  if (!t.isContentEditable) return null;
  let r = t;
  while (r.parentElement && r.parentElement.isContentEditable) r = r.parentElement;
  return r;
}

function editMenu(e, target) {
  const doc = target.ownerDocument, w = doc.defaultView;
  const guard = w.__reClipGuard;
  const cmEl = target.closest('.CodeMirror');
  const cm = cmEl && cmEl.CodeMirror && typeof cmEl.CodeMirror.getSelection === 'function' ? cmEl.CodeMirror : null;
  const field = cm ? null : fieldOf(target);
  const box = isTextBox(field);
  const sel = cm ? cm.getSelection() : box ? boxText(field) : String(doc.getSelection() || '');
  const writable = cm ? !cm.isReadOnly() : !!field && (box ? !field.readOnly && !field.disabled : true);
  // (a website in the web browser – or a frame in one – has the browser's Back, Forward and Reload)
  let tab = null;
  try {
    for (let x = w; !tab && x && x !== window && x.frameElement; x = x.frameElement.ownerDocument.defaultView) tab = x.frameElement.reBrowser || null;
  } catch { tab = null; }
  const icon = (n) => `assets/icons/actions/${n}.svg`;
  const refocus = () => { try { if (cm) cm.focus(); else if (field) field.focus({ preventScroll: true }); } catch { /* gone */ } };
  const remove = () => { refocus(); if (cm) cm.replaceSelection(''); else doc.execCommand('delete'); };
  const items = [];
  if (tab && !writable && !sel) {
    items.push(
      { label: 'Back', icon: icon('go-previous'), shortcut: 'Alt+Left', disabled: !tab.canGoBack, action: () => tab.back() },
      { label: 'Forward', icon: icon('go-next'), shortcut: 'Alt+Right', disabled: !tab.canGoForward, action: () => tab.forward() },
      { label: 'Reload', icon: icon('view-refresh'), shortcut: 'Ctrl+R', action: () => tab.reload() },
      { type: 'separator' });
  }
  if (writable) items.push({ label: 'Cut', icon: icon('edit-cut'), shortcut: 'Ctrl+X', disabled: !sel, action: () => { put({ text: sel }); remove(); } });
  if (writable || sel) items.push({ label: 'Copy', icon: icon('edit-copy'), shortcut: 'Ctrl+C', disabled: !sel, action: () => put({ text: sel }) });
  if (writable) {
    items.push(
      { label: 'Paste', icon: icon('edit-paste'), shortcut: 'Ctrl+V', disabled: !clip.text, action: () => { refocus(); if (guard) guard.deliver(cm ? cm.getInputField() : field, clip.text); } },
      { label: 'Delete', icon: icon('edit-delete'), disabled: !sel, action: remove });
  }
  if (!items.length) return; // (no menu, as on the desktop's buttons and pictures)
  items.push({ type: 'separator' }, {
    label: 'Select All', shortcut: 'Ctrl+A', action: () => {
      if (cm) { cm.focus(); cm.execCommand('selectAll'); } else if (box) { field.focus(); field.select(); } else if (field) { field.focus(); doc.execCommand('selectAll'); } else doc.getSelection().selectAllChildren((w === window && target.closest('.wm-body')) || doc.body);
    },
  });
  showMenu(items, topPoint(w, e.clientX, e.clientY));
}

/** a point of a frame in the desktop page's coordinates (the web browser zooms its frames) */
function topPoint(w, x, y) {
  try {
    while (w && w !== window && w.frameElement) {
      const fe = w.frameElement, r = fe.getBoundingClientRect();
      const s = w.innerWidth ? r.width / w.innerWidth : 1;
      x = r.left + x * s;
      y = r.top + y * s;
      w = fe.ownerDocument.defaultView;
    }
  } catch { /* another origin */ }
  return { x, y };
}

// ---------------------------------------------------------------- in one window
/**
 * The clipboard rules in window w; host: on(target), text(), put({text, html}), putItems(items, w), items(w),
 * outside(sig, same, editable), menu(event, target) or null. Returns {deliver(target, text)}.
 * It uses nothing but its arguments and w's globals, so that isolateHtml can write its source into a page: no
 * imports, nothing of this module, and nothing that would end a script element in its text.
 */
function guardWindow(w, host) {
  if (Object.prototype.hasOwnProperty.call(w, '__reClipGuard')) return w.__reClipGuard;
  var EP = w.Event.prototype, pd = EP.preventDefault, sp = EP.stopPropagation, sip = EP.stopImmediatePropagation;
  var copies = new w.WeakMap();
  var BOX = /^(text|search|url|tel|email|number|password)$/i, SELECTS = /^(text|search|url|tel|password)$/i;

  function norm(t) { t = String(t == null ? '' : t).toLowerCase(); return t === 'text' ? 'text/plain' : t === 'url' ? 'text/uri-list' : t; }
  function elementOf(n) { return n && n.nodeType === 1 ? n : (n && n.parentElement) || null; }
  function targetOf(e) { var p = e.composedPath ? e.composedPath() : null; return elementOf(p && p.length ? p[0] : e.target); }
  function active() { var a = w.document.activeElement; while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement; return a; }
  function isBox(n) { return !!n && (n.tagName === 'TEXTAREA' || (n.tagName === 'INPUT' && BOX.test(n.type || 'text'))); }
  function editable(n) { return !!n && (isBox(n) ? !n.readOnly && !n.disabled : !!n.isContentEditable); }
  function range(n) {
    if (n.tagName === 'INPUT' && !SELECTS.test(n.type || 'text')) return null;
    try { return [n.selectionStart, n.selectionEnd]; } catch (err) { return null; }
  }
  function selectedText() {
    var doc = w.document, a = active();
    if (isBox(a)) {
      if (String(a.type).toLowerCase() === 'password') return '';
      var r = range(a);
      if (r && r[1] > r[0]) return a.value.slice(r[0], r[1]);
    }
    var s = doc.getSelection ? doc.getSelection() : null;
    return s ? String(s) : '';
  }
  function deleteSelection() {
    var doc = w.document, a = active();
    if (isBox(a)) {
      var r = range(a);
      if (editable(a) && r && r[1] > r[0]) doc.execCommand('delete');
      return;
    }
    var s = doc.getSelection ? doc.getSelection() : null;
    if (s && !s.isCollapsed && editable(a)) doc.execCommand('delete');
  }

  // copy and cut: what the page puts in the event, or else the selection, goes to the RE's clipboard and nothing to
  // the computer's. The event's data are caught as the page writes them; an event a page stops on its way is
  // finished all the same.
  function capture(e) {
    if (!e.isTrusted || !host.on(targetOf(e))) return;
    var st = { data: {}, done: false, prevented: false };
    copies.set(e, st);
    var dt = e.clipboardData;
    if (dt) {
      try {
        dt.setData = function (type, value) { st.data[norm(type)] = String(value); };
        dt.getData = function (type) { var v = st.data[norm(type)]; return v == null ? '' : v; };
        dt.clearData = function (type) { if (type == null) st.data = {}; else delete st.data[norm(type)]; };
        if (dt.items) dt.items.add = function (data, type) { if (typeof data === 'string') st.data[norm(type)] = data; return null; };
      } catch (err) { /* left as it is */ }
    }
    e.preventDefault = function () { st.prevented = true; return pd.call(e); };
    var stop = function (real) {
      return function () {
        if (e.defaultPrevented) st.prevented = true;
        pd.call(e);
        if (!st.done) w.setTimeout(function () { if (!st.done) finish(e, st); }, 0);
        return real.call(e);
      };
    };
    e.stopPropagation = stop(sp);
    e.stopImmediatePropagation = stop(sip);
  }
  function bubble(e) {
    var st = copies.get(e);
    if (!st || st.done) return;
    if (e.defaultPrevented) st.prevented = true; // (a page that did the cut itself)
    pd.call(e);
    finish(e, st);
  }
  function finish(e, st) {
    st.done = true;
    var text = st.data['text/plain'];
    if (text == null) text = selectedText();
    if (e.type === 'cut' && !st.prevented) deleteSelection();
    if (text) host.put({ text: text, html: st.data['text/html'] || '' });
  }

  // paste: the computer's clipboard is ignored; the page is handed the RE's in a paste event of its own (CodeMirror,
  // the terminal and the consoles take it from there), or it is typed in
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36) + ':' + s.length;
  }
  function signature(dt) {
    if (!dt) return '';
    try {
      var t = dt.getData('text/plain');
      if (t) return 't' + hash(t);
      var f = dt.files, s = '';
      if (f && f.length) { for (var i = 0; i < f.length; i++) s += f[i].name + '/' + f[i].size + ';'; return 'f' + hash(s); }
      var ty = dt.types;
      return ty && ty.length ? 'y' + Array.prototype.join.call(ty, ',') : '';
    } catch (err) { return ''; }
  }
  function paste(e) {
    if (!e.isTrusted) return;
    var t = targetOf(e);
    if (!host.on(t)) return;
    pd.call(e);
    sip.call(e);
    var text = host.text(), dt = e.clipboardData, ext = '';
    try { ext = dt ? dt.getData('text/plain') : ''; } catch (err) { ext = ''; }
    host.outside(signature(dt), !!text && ext === text, editable(active()) || editable(t));
    if (text) deliver(t, text);
  }
  function deliver(t, text) {
    var doc = w.document, ev = null;
    try {
      var data = new w.DataTransfer();
      data.setData('text/plain', text);
      ev = new w.ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true, composed: true });
      if (!ev.clipboardData || ev.clipboardData.getData('text/plain') !== text) ev = null;
    } catch (err) { ev = null; }
    if (ev && !(t || doc.body || doc.documentElement).dispatchEvent(ev)) return;
    if (editable(active())) doc.execCommand('insertText', false, text);
  }
  function beforeInput(e) {
    if (e.isTrusted && /^insertFrom(Paste|Drop|Yank)/.test(e.inputType || '') && host.on(targetOf(e))) pd.call(e);
  }

  // drag and drop: no drags start here, and nothing is dropped in – but files on a file box, or on a place that
  // says what happens to them (data-accept-file-drop)
  function filesWelcome(e) {
    var dt = e.dataTransfer, t = targetOf(e);
    if (!dt || !t || !t.closest) return false;
    return Array.prototype.indexOf.call(dt.types || [], 'Files') >= 0 && !!t.closest('input[type=file], [data-accept-file-drop]');
  }
  function dragStart(e) { if (host.on(targetOf(e))) pd.call(e); }
  function dragOver(e) {
    if (!host.on(targetOf(e)) || filesWelcome(e)) return;
    pd.call(e);
    sip.call(e);
    try { e.dataTransfer.dropEffect = 'none'; } catch (err) { /* protected */ }
  }
  function drop(e) {
    if (!host.on(targetOf(e)) || filesWelcome(e)) return;
    pd.call(e);
    sip.call(e);
  }

  // the browser's own right-click menu (Copy Image, Save Image As, Search for …): the host's, or none
  function menu(e) {
    if (e.defaultPrevented) return;
    var t = targetOf(e);
    if (!t || !host.on(t)) return;
    pd.call(e);
    if (host.menu) host.menu(e, t);
  }

  // navigator.clipboard: the RE's clipboard
  var CP = w.Clipboard && w.Clipboard.prototype;
  if (!CP && w.navigator && w.navigator.clipboard) CP = w.navigator.clipboard;
  if (CP && !Object.prototype.hasOwnProperty.call(CP, '__reGuard')) {
    var o = { writeText: CP.writeText, readText: CP.readText, write: CP.write, read: CP.read };
    try { Object.defineProperty(CP, '__reGuard', { value: true }); } catch (err) { /* frozen */ }
    CP.writeText = function (t) { if (!host.on()) return o.writeText.apply(this, arguments); host.put({ text: String(t) }); return w.Promise.resolve(); };
    CP.readText = function () { if (!host.on()) return o.readText.apply(this, arguments); return w.Promise.resolve(host.text()); };
    if (o.write) CP.write = function (list) { if (!host.on()) return o.write.apply(this, arguments); return w.Promise.resolve(host.putItems(list, w)); };
    if (o.read) CP.read = function () { if (!host.on()) return o.read.apply(this, arguments); return w.Promise.resolve(host.items(w)); };
  }

  w.addEventListener('copy', capture, true);
  w.addEventListener('cut', capture, true);
  w.addEventListener('copy', bubble, false);
  w.addEventListener('cut', bubble, false);
  w.addEventListener('paste', paste, true);
  w.addEventListener('beforeinput', beforeInput, true);
  w.addEventListener('dragstart', dragStart, true);
  w.addEventListener('dragenter', dragOver, true);
  w.addEventListener('dragover', dragOver, true);
  w.addEventListener('drop', drop, true);
  w.addEventListener('contextmenu', menu, false);
  var api = { deliver: deliver };
  try { Object.defineProperty(w, '__reClipGuard', { value: api }); } catch (err) { /* sealed */ }
  return api;
}

/** The host of a sandboxed frame (isolateHtml): the desktop's page keeps the clipboard; this keeps a copy of its text. */
function frameHost(w) {
  var parent = w.parent, text = '', on = true;
  function post(m) { try { parent.postMessage(m, '*'); } catch (err) { /* gone */ } }
  w.addEventListener('message', function (e) {
    var d = e.data;
    if (e.source === parent && d && d.__reClip === 'text') { text = String(d.text == null ? '' : d.text); on = d.on !== false; }
  });
  post({ __reClip: 'hello' });
  return {
    on: function () { return on; },
    text: function () { return text; },
    put: function (d) { text = String(d.text == null ? '' : d.text); post({ __reClip: 'copy', text: text }); },
    putItems: function (list) {
      var item = Array.prototype.filter.call(list || [], function (i) { return Array.prototype.indexOf.call(i.types || [], 'text/plain') >= 0; })[0];
      if (!item) return w.Promise.resolve();
      return item.getType('text/plain').then(function (b) { return b.text(); }).then(function (t) { text = t; post({ __reClip: 'copy', text: t }); });
    },
    items: function () { return text && w.ClipboardItem ? [new w.ClipboardItem({ 'text/plain': new w.Blob([text], { type: 'text/plain' }) })] : []; },
    outside: function (sig, same, editable) { post({ __reClip: 'outside', sig: sig, same: same, editable: editable }); },
    menu: null,
  };
}
