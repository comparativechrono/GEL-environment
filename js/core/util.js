// Small DOM and general helpers shared by every module.

/**
 * Create an element.  h('div.foo#bar', {title:'x', onclick: fn}, child, 'text')
 * Attributes starting with "on" become event listeners; "style" may be an object;
 * "dataset" an object; "html" sets innerHTML (only use with trusted strings).
 */
export function h(tag, attrs, ...children) {
  let tagName = 'div', id = null;
  const classes = [];
  String(tag).replace(/([.#]?)([\w-]+)/g, (_, sigil, name) => {
    if (sigil === '.') classes.push(name);
    else if (sigil === '#') id = name;
    else tagName = name;
  });
  const el = document.createElement(tagName);
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'class' || k === 'className') el.className = [el.className, v].filter(Boolean).join(' ');
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) appendChildren(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function formatBytes(n) {
  if (n === undefined || n === null || isNaN(n)) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let x = Number(n);
  while (x >= 1024 && i < u.length - 1) { x /= 1024; i++; }
  return (i === 0 ? x : x.toFixed(x < 10 ? 1 : 0)) + ' ' + u[i];
}

/** Human size like `ls -lh` (1.2K, 34M). */
export function formatBytesShort(n) {
  const u = ['', 'K', 'M', 'G', 'T'];
  let i = 0; let x = Number(n) || 0;
  while (x >= 1024 && i < u.length - 1) { x /= 1024; i++; }
  if (i === 0) return String(x);
  return (x < 10 ? x.toFixed(1) : Math.round(x)) + u[i];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export { MONTHS, DAYS };

export function pad(n, w = 2) { return String(n).padStart(w, '0'); }

export function isoDate(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function isoDateTime(d = new Date()) {
  return `${isoDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Date in `ls -l` style: "Oct 21 10:15" or "Oct 21  2024". */
export function lsDate(ms) {
  const d = new Date(ms);
  const now = Date.now();
  const recent = Math.abs(now - ms) < 1000 * 60 * 60 * 24 * 182;
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, ' ')} ${recent ? pad(d.getHours()) + ':' + pad(d.getMinutes()) : ' ' + d.getFullYear()}`;
}

export function textToBytes(s) { return new TextEncoder().encode(s); }
export function bytesToText(b) { return new TextDecoder().decode(b); }

export function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Resolve a path relative to the site root (works when hosted in a sub-folder). */
export function siteUrl(rel) {
  return new URL(rel.replace(/^\//, ''), document.baseURI).href;
}

/** Load a classic script once (for libraries that are not ES modules). */
const scriptCache = new Map();
export function loadScript(src) {
  if (scriptCache.has(src)) return scriptCache.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptCache.delete(src); reject(new Error('Failed to load ' + src)); };
    document.head.appendChild(s);
  });
  scriptCache.set(src, p);
  return p;
}

const cssCache = new Set();
export function loadCss(href) {
  if (cssCache.has(href)) return;
  cssCache.add(href);
  document.head.appendChild(h('link', { rel: 'stylesheet', href }));
}

/** Simple draggable splitter between two flex panes. */
export function makeSplitter(splitter, { vertical = false, onDrag } = {}) {
  splitter.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    splitter.setPointerCapture(e.pointerId);
    document.body.classList.add('wm-dragging');
    const move = (ev) => onDrag && onDrag(vertical ? ev.clientY : ev.clientX, ev);
    const up = () => {
      splitter.removeEventListener('pointermove', move);
      splitter.removeEventListener('pointerup', up);
      document.body.classList.remove('wm-dragging');
    };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', up);
  });
}

export function downloadBlob(blob, filename) {
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
