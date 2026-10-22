// =============================================================================
// Shared code for the simulated websites in sites/.
//
// A site runs in an iframe of the desktop's web browser (same origin). It gets:
//   RE       the desktop's services (window.parent.RE): vfs, session, services …
//   browser  the tab it is in (iframe.reBrowser): navigate, download, setTitle
//   route()  a tiny router: the virtual path + query live in location.hash
//   go(path) a "page load" to another path of this site (the browser shows it loading)
// =============================================================================

export const RE = (() => { try { return window.parent && window.parent !== window ? window.parent.RE : null; } catch { return null; } })();
export const browser = (() => { try { return window.frameElement ? window.frameElement.reBrowser : null; } catch { return null; } })();
export const CONFIG = RE ? RE.config : null;

// The RE's clipboard rules (js/core/clipboard.js) from the start: the desktop adds them too, when the page has loaded
try { RE?.clipboard?.installIn(window); } catch { /* opened outside the desktop */ }

export { h, clear, escapeHtml, formatBytes, debounce, sleep, uid } from '../../js/core/util.js';
import { h } from '../../js/core/util.js';

/** The host name this site answers for in the address bar. */
export function host() {
  try { return new URL(browser?.url || '').host; } catch { return location.host; }
}

/** {path, query: URLSearchParams} of the current virtual URL (the query keeps its own encoding until parsed) */
export function current() {
  const raw = location.hash.slice(1) || '/';
  const qi = raw.indexOf('?');
  let path = qi >= 0 ? raw.slice(0, qi) : raw;
  try { path = decodeURIComponent(path); } catch { /* as it is */ }
  const query = new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : '');
  return { path: path || '/', query };
}

/** A path of this site with query parameters: url('/a/b.view', {x: 1, y: [2, 3]}) */
export function url(path, params) {
  const q = new URLSearchParams();
  if (params instanceof URLSearchParams) params.forEach((v, k) => q.append(k, v));
  else for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (Array.isArray(v)) v.forEach(x => q.append(k, x));
    else q.append(k, v);
  }
  const qs = q.toString();
  return path + (qs ? '?' + qs : '');
}

/** Call fn(current()) now and whenever the location changes. */
export function route(fn) {
  const run = () => { try { fn(current()); } catch (e) { console.error(e); showFatal(e); } window.scrollTo(0, 0); };
  window.addEventListener('hashchange', run);
  run();
}

/** Go to another page of this site (with a simulated page load). */
export function go(path, { replace = false, newTab = false } = {}) {
  // (a whole address – another website – goes to the browser as it is)
  if (/^https?:\/\//i.test(path)) {
    if (browser) browser.navigate(path, { replace, newTab });
    else window.open(path, '_blank');
    return;
  }
  const p = path.startsWith('/') ? path : '/' + path;
  if (browser) browser.navigate(`https://${host()}${p}`, { replace, newTab });
  else if (replace) location.replace('#' + p); else location.hash = p;
}

/** Links: href="/path" stays in this site; data-newtab opens a new tab. */
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[href]');
  if (!a || e.defaultPrevented || a.hasAttribute('download')) return;
  const href = a.getAttribute('href');
  if (href.startsWith('/')) { e.preventDefault(); go(href, { newTab: a.target === '_blank' || e.ctrlKey || e.metaKey }); }
});

export function setTitle(t) { document.title = t; }

/** When the page is opened outside the desktop (directly), say so. */
export function requireDesktop() {
  if (RE) return true;
  document.body.innerHTML = '<div style="font:15px system-ui;padding:40px;max-width:640px;margin:auto"><h1>Research Environment simulator</h1><p>This page is part of the simulated Research Environment and only works inside its web browser. <a href="../../index.html">Open the desktop</a>.</p></div>';
  return false;
}

function showFatal(e) {
  const box = document.getElementById('site-error') || document.body.appendChild(h('div#site-error'));
  box.textContent = 'Something went wrong on this page: ' + (e?.message || e);
}

/** Format a date (ISO or ms) as 2026-10-21 10:15 */
export function fmtDate(v, withTime = true) {
  if (!v) return '';
  const d = typeof v === 'number' ? new Date(v) : new Date(v);
  if (isNaN(d)) return String(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}${withTime ? ` ${p(d.getHours())}:${p(d.getMinutes())}` : ''}`;
}

/** A small modal dialog inside the site page. Resolves with the value of the button pressed. */
export function modal({ title, body, buttons = [{ label: 'OK', value: true, primary: true }], width = 520 }) {
  return new Promise((resolve) => {
    const back = h('div.s-modal-back');
    const box = h('div.s-modal', { style: { width: width + 'px' } },
      h('div.s-modal-h', title, h('button.s-modal-x', { onclick: () => done(null), title: 'Close' }, '×')),
      h('div.s-modal-b', body),
      h('div.s-modal-f', buttons.map(b => h('button.s-btn' + (b.primary ? '.primary' : '') + (b.danger ? '.danger' : ''), { onclick: () => done(typeof b.value === 'function' ? b.value() : b.value) }, b.label))));
    back.appendChild(box);
    document.body.appendChild(back);
    function done(v) { if (v === false && buttons.some(b => b.keepOpen)) return; back.remove(); resolve(v); }
    back.addEventListener('click', (e) => { if (e.target === back) done(null); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', esc); done(null); } });
  });
}

/** Choose files from the shared file system (the desktop's file chooser). */
export function chooseFiles(opts = {}) {
  return RE.dialogs.fileChooser({ mode: 'open', multiple: true, startDir: RE.session.workdir, ...opts });
}
