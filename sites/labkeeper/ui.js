// Small UI pieces of the LabKeeper site: popup menus and dialogs.
import { h, clear } from '../common/site.js';

let openMenu = null;

export function closeMenu() {
  if (openMenu) { openMenu.remove(); openMenu = null; document.removeEventListener('mousedown', onDown, true); }
}

function onDown(e) { if (openMenu && !openMenu.contains(e.target)) closeMenu(); }

/** items: [{label, action, disabled, checked, sep, head}] shown under (or beside) anchor. */
export function popup(items, anchor, { align = 'left' } = {}) {
  closeMenu();
  const m = h('div.lk-menu', { role: 'menu' });
  for (const it of items) {
    if (!it) continue;
    if (it.sep) { m.appendChild(h('div.lk-menu-sep')); continue; }
    if (it.head) { m.appendChild(h('div.lk-menu-head', it.head)); continue; }
    const el = h('div.lk-menu-item' + (it.disabled ? '.disabled' : ''), { role: 'menuitem' },
      it.checked !== undefined ? h('span.ck', it.checked ? '✓' : '') : null, it.label);
    if (!it.disabled) el.addEventListener('click', () => { closeMenu(); it.action && it.action(); });
    m.appendChild(el);
  }
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  const w = m.offsetWidth, hh = m.offsetHeight;
  let x = align === 'right' ? r.right - w : r.left;
  let y = r.bottom + 2;
  if (x + w > window.innerWidth - 4) x = window.innerWidth - w - 4;
  if (y + hh > window.innerHeight - 4) y = Math.max(4, r.top - hh - 2);
  m.style.left = Math.max(4, x) + 'px';
  m.style.top = y + 'px';
  openMenu = m;
  setTimeout(() => document.addEventListener('mousedown', onDown, true), 0);
  return m;
}

/**
 * A dialog: dialog({title, body, buttons: [{label, primary, value, onClick}], width})
 * Resolves with the value of the button pressed (null: closed). A button's onClick may return false to keep it open.
 */
export function dialog({ title, body, buttons = [{ label: 'OK', primary: true, value: true }], width = 560 }) {
  let resolveFn;
  const p = new Promise((r) => { resolveFn = r; });
  const back = h('div.s-modal-back');
  const done = (v) => { back.remove(); document.removeEventListener('keydown', esc, true); resolveFn(v); };
  const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
  const btns = buttons.map((b) => {
    const el = h('button.lk-btn' + (b.primary ? '.primary' : ''), b.label);
    el.addEventListener('click', async () => {
      if (b.onClick) { const r = await b.onClick(); if (r === false) return; if (r !== undefined && b.value === undefined) return done(r); }
      done(b.value === undefined ? true : b.value);
    });
    return el;
  });
  const box = h('div.s-modal', { style: { width: width + 'px' } },
    h('div.s-modal-h', title, h('button.s-modal-x', { title: 'Close', onclick: () => done(null) }, '×')),
    h('div.s-modal-b', body),
    h('div.s-modal-f', btns));
  back.appendChild(box);
  document.body.appendChild(back);
  document.addEventListener('keydown', esc, true);
  p.close = () => done(null);
  p.box = box;
  return p;
}

/** Tabs inside a dialog: tabs([['Excel', el], ['Text', el]]) */
export function tabs(list, onSwitch) {
  const bar = h('div.lk-tabbar');
  const panes = h('div');
  let current = 0;
  const show = (i) => {
    current = i;
    [...bar.children].forEach((b, j) => b.classList.toggle('active', j === i));
    clear(panes);
    panes.appendChild(list[i][1]);
    onSwitch && onSwitch(i);
  };
  list.forEach(([label], i) => bar.appendChild(h('button', { type: 'button', onclick: () => show(i) }, label)));
  show(0);
  return { el: h('div', bar, panes), get index() { return current; }, show };
}

export const ICON = {
  table: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="#fff" stroke="#5b7da3"/><path d="M1.5 6h13M1.5 9.5h13M6 6v7.5" stroke="#5b7da3"/><rect x="1.5" y="2.5" width="13" height="3.5" fill="#cfe0f3" stroke="#5b7da3"/></svg>'),
  folder: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34"><path d="M3 8a2 2 0 0 1 2-2h8l3 3h13a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="#e9b949"/><path d="M3 12h28v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="#f4cf6a"/></svg>'),
  project: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34"><rect x="4" y="5" width="26" height="24" rx="3" fill="#2b8a7e"/><path d="M9 12h16M9 17h16M9 22h10" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>'),
  export: '<svg viewBox="0 0 16 16"><path d="M8 2v8M4.5 6.5 8 10l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2.5 11v2.5h11V11" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  views: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2 6.5h12M6 6.5V13" stroke="currentColor" stroke-width="1.4"/></svg>',
  chart: '<svg viewBox="0 0 16 16"><path d="M2.5 13.5h11" stroke="currentColor" stroke-width="1.4"/><rect x="3.5" y="8" width="2" height="5" fill="currentColor"/><rect x="7" y="4" width="2" height="9" fill="currentColor"/><rect x="10.5" y="6" width="2" height="7" fill="currentColor"/></svg>',
};
