// =============================================================================
// Whisker menu (Xubuntu application menu): user header, search, app list and
// category column.
// =============================================================================

import { h, clear } from '../core/util.js';

const CATEGORIES = [
  { id: 'favourites', label: 'Favourites', icon: 'assets/icons/actions/star.svg' },
  { id: 'recent', label: 'Recently Used', icon: 'assets/icons/actions/edit-undo.svg' },
  { id: 'all', label: 'All Applications', icon: 'assets/icons/panel/applications.svg' },
  { id: 'Accessories', label: 'Accessories', icon: 'assets/icons/apps/text-editor.svg' },
  { id: 'Development', label: 'Development', icon: 'assets/icons/apps/terminal.svg' },
  { id: 'Science', label: 'Science', icon: 'assets/icons/apps/igv.svg' },
  { id: 'Internet', label: 'Internet', icon: 'assets/icons/apps/web-browser.svg' },
  { id: 'Research', label: 'Research Environment', icon: 'assets/icons/apps/re-logo.svg' },
  { id: 'System', label: 'System', icon: 'assets/icons/apps/settings.svg' },
];

let current = null;

export function closeWhisker() {
  if (!current) return;
  current.el.remove();
  current.btn.classList.remove('open');
  document.removeEventListener('pointerdown', current.outside, true);
  document.removeEventListener('keydown', current.key, true);
  current = null;
}

export function toggleWhisker(RE, btn) {
  if (current) { closeWhisker(); return; }
  const { apps, session } = RE;
  let category = 'favourites';
  let hoverIdx = 0;

  const search = h('input.gtk-entry', { placeholder: 'Search…', type: 'search' });
  const list = h('div.whisker-apps.gtk-scroll');
  const cats = h('div.whisker-cats.gtk-scroll');
  const initials = (session.user.fullName || session.username).split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();

  const headBtn = (icon, title, fn) => h('button.tool-btn', { title, onclick: () => { closeWhisker(); fn(); } }, h('img', { src: icon, alt: '' }));
  const el = h('div.whisker',
    h('div.whisker-head',
      h('div.whisker-avatar', initials),
      h('div.whisker-user', session.user.fullName, h('div', { style: { fontWeight: 400, fontSize: '11.5px', color: '#777' } }, `${session.username} · ${session.user.userGroup}`)),
      headBtn('assets/icons/actions/preferences-system.svg', 'All Settings', () => apps.launchApp('settings')),
      headBtn('assets/icons/actions/system-lock-screen.svg', 'Lock Screen', () => RE.shell.lock()),
      headBtn('assets/icons/actions/system-log-out.svg', 'Log Out', () => RE.shell.logout())),
    h('div.whisker-search', search),
    h('div.whisker-main', list, cats));

  function appsFor(cat) {
    const all = apps.listApps().sort((a, b) => a.name.localeCompare(b.name));
    if (cat === 'favourites') return all.filter(a => a.favourite).sort((a, b) => (a.desktop || 99) - (b.desktop || 99));
    if (cat === 'recent') return apps.recentApps().map(id => apps.getApp(id)).filter(Boolean);
    if (cat === 'all') return all;
    return all.filter(a => a.categories.includes(cat));
  }

  function renderList() {
    clear(list);
    const q = search.value.trim().toLowerCase();
    let items = q
      ? apps.listApps().filter(a => [a.name, a.genericName, a.comment, ...(a.keywords || [])].join(' ').toLowerCase().includes(q))
      : appsFor(category);
    if (!items.length) { list.appendChild(h('div.whisker-empty', q ? 'No applications match your search.' : 'Nothing here yet.')); return; }
    hoverIdx = Math.min(hoverIdx, items.length - 1);
    items.forEach((a, i) => {
      const row = h('div.whisker-item' + (i === hoverIdx && q ? '.hover' : ''), { title: a.comment || '' },
        h('img', { src: a.icon, alt: '' }),
        h('div', h('div.wi-name', a.name), a.genericName || a.comment ? h('div.wi-desc', a.genericName || a.comment) : null));
      row.addEventListener('click', () => { closeWhisker(); apps.launchApp(a.id); });
      list.appendChild(row);
    });
    list._items = items;
  }

  function renderCats() {
    clear(cats);
    for (const c of CATEGORIES) {
      if (!['favourites', 'recent', 'all'].includes(c.id) && !appsFor(c.id).length) continue;
      const row = h('div.whisker-cat' + (c.id === category && !search.value ? '.active' : ''), h('img', { src: c.icon, alt: '' }), c.label);
      row.addEventListener('pointerenter', () => { if (!search.value && category !== c.id) { category = c.id; renderCats(); renderList(); } });
      row.addEventListener('click', () => { search.value = ''; category = c.id; renderCats(); renderList(); });
      cats.appendChild(row);
    }
  }

  search.addEventListener('input', () => { hoverIdx = 0; renderList(); renderCats(); });
  search.addEventListener('keydown', (e) => {
    const items = list._items || [];
    if (e.key === 'ArrowDown') { hoverIdx = Math.min(items.length - 1, hoverIdx + 1); renderList(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { hoverIdx = Math.max(0, hoverIdx - 1); renderList(); e.preventDefault(); }
    if (e.key === 'Enter' && items[hoverIdx]) { const a = items[hoverIdx]; closeWhisker(); apps.launchApp(a.id); }
  });

  renderCats();
  renderList();
  document.body.appendChild(el);
  btn.classList.add('open');
  setTimeout(() => search.focus(), 0);

  const outside = (e) => { if (!el.contains(e.target) && !btn.contains(e.target)) closeWhisker(); };
  const key = (e) => { if (e.key === 'Escape') closeWhisker(); };
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key, true);
  }, 0);
  current = { el, btn, outside, key };
}
