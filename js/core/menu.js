// =============================================================================
// GTK-style popup menus: context menus, menubar dropdowns, submenus.
// Item: { label, icon, shortcut, action, disabled, checked, radio,
//         submenu: [...items], type: 'separator' | 'header' }
// =============================================================================

import { h } from './util.js';

let openMenus = [];
let activeMenubar = null;

export function closeMenus() {
  for (const m of openMenus) m.remove();
  openMenus = [];
  if (activeMenubar) { activeMenubar.deactivate(); activeMenubar = null; }
  document.removeEventListener('pointerdown', onOutside, true);
  document.removeEventListener('keydown', onKey, true);
}

function onOutside(e) {
  if (openMenus.some(m => m.contains(e.target))) return;
  if (activeMenubar && activeMenubar.el.contains(e.target)) return;
  closeMenus();
}

function onKey(e) {
  if (e.key === 'Escape') { closeMenus(); e.stopPropagation(); return; }
  const menu = openMenus[openMenus.length - 1];
  if (!menu) return;
  const items = [...menu.querySelectorAll('.menu-item:not(.disabled)')];
  const cur = items.indexOf(menu.querySelector('.menu-item.hover'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const next = items[(cur + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
    items.forEach(i => i.classList.remove('hover'));
    next?.classList.add('hover');
  } else if (e.key === 'Enter' && cur >= 0) {
    e.preventDefault();
    items[cur].click();
  } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && activeMenubar && openMenus.length === 1) {
    e.preventDefault();
    activeMenubar.step(e.key === 'ArrowRight' ? 1 : -1);
  }
}

function buildMenu(items, depth) {
  const menu = h('div.menu-popup', { role: 'menu' });
  for (const it of items) {
    if (!it) continue;
    if (it.type === 'separator') { menu.appendChild(h('div.menu-separator')); continue; }
    if (it.type === 'header') { menu.appendChild(h('div.menu-header', it.label)); continue; }
    const check = it.checked !== undefined
      ? h('span.menu-check', it.checked ? (it.radio ? '●' : '✓') : '')
      : h('span.menu-check');
    const icon = it.icon ? h('img.menu-icon', { src: it.icon, alt: '' }) : h('span.menu-icon');
    const row = h('div.menu-item', { role: 'menuitem', class: it.disabled ? 'disabled' : '' },
      check, icon, h('span.menu-label', it.label),
      it.shortcut ? h('span.menu-shortcut', it.shortcut) : null,
      it.submenu ? h('span.menu-arrow', '▸') : null);
    row.addEventListener('pointerenter', () => {
      menu.querySelectorAll('.menu-item.hover').forEach(i => i.classList.remove('hover'));
      row.classList.add('hover');
      // close deeper submenus
      while (openMenus.length > depth + 1) openMenus.pop().remove();
      if (it.submenu && !it.disabled) {
        const r = row.getBoundingClientRect();
        const sub = buildMenu(typeof it.submenu === 'function' ? it.submenu() : it.submenu, depth + 1);
        place(sub, r.right - 2, r.top - 4, r.left);
      }
    });
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      if (it.disabled || it.submenu) return;
      closeMenus();
      try { it.action?.(); } catch (err) { console.error(err); }
    });
    menu.appendChild(row);
  }
  return menu;
}

function place(menu, x, y, altX) {
  menu.style.visibility = 'hidden';
  document.body.appendChild(menu);
  openMenus.push(menu);
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = x, top = y;
  if (left + mw > vw - 2) left = altX !== undefined ? Math.max(2, altX - mw + 2) : Math.max(2, vw - mw - 2);
  if (top + mh > vh - 2) top = Math.max(2, vh - mh - 2);
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  menu.style.visibility = '';
}

/** Show a popup menu at screen position {x, y}. */
export function showMenu(items, { x, y, keepMenubar = false } = {}) {
  if (!keepMenubar) closeMenus();
  else { for (const m of openMenus) m.remove(); openMenus = []; }
  const menu = buildMenu(items, 0);
  place(menu, x, y);
  setTimeout(() => {
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
  }, 0);
  return menu;
}

/** Attach a context menu to an element. itemsFn(event) returns items (or null). */
export function contextMenu(el, itemsFn) {
  el.addEventListener('contextmenu', (e) => {
    const items = itemsFn(e);
    if (!items) return;
    e.preventDefault();
    e.stopPropagation();
    showMenu(items, { x: e.clientX, y: e.clientY });
  });
}

/**
 * A GTK menubar.  spec: [{label: 'File', items: [...] | () => [...]}, ...]
 * Returns {el, setSpec}.
 */
export function menubar(spec) {
  const el = h('div.gtk-menubar', { role: 'menubar' });
  let entries = [];
  const bar = {
    el,
    open(i) {
      entries.forEach(e => e.btn.classList.remove('open'));
      const entry = entries[i];
      if (!entry) return;
      entry.btn.classList.add('open');
      const r = entry.btn.getBoundingClientRect();
      const items = typeof entry.items === 'function' ? entry.items() : entry.items;
      showMenu(items, { x: r.left, y: r.bottom, keepMenubar: true });
      activeMenubar = bar;
      bar.current = i;
      document.addEventListener('pointerdown', onOutside, true);
      document.addEventListener('keydown', onKey, true);
    },
    step(d) { bar.open((bar.current + d + entries.length) % entries.length); },
    deactivate() { entries.forEach(e => e.btn.classList.remove('open')); bar.current = -1; },
    setSpec(newSpec) {
      el.innerHTML = '';
      entries = newSpec.map((s, i) => {
        const btn = h('div.gtk-menubar-item', { role: 'menuitem' }, s.label);
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (activeMenubar === bar && bar.current === i) { closeMenus(); return; }
          bar.open(i);
        });
        btn.addEventListener('pointerenter', () => { if (activeMenubar === bar && bar.current !== i) bar.open(i); });
        el.appendChild(btn);
        return { btn, items: s.items };
      });
    },
    current: -1,
  };
  bar.setSpec(spec);
  return bar;
}
