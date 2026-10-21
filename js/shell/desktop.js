// =============================================================================
// xfdesktop-like icon view: application launchers plus files in ~/Desktop.
// Icons can be dragged to new grid positions (remembered per user).
// =============================================================================

import { h, clear } from '../core/util.js';
import { showMenu } from '../core/menu.js';
import { kv } from '../core/store.js';
import { iconForPath, defaultAppFor } from '../core/mime.js';

const CELL_W = 96, CELL_H = 92, MARGIN_X = 10, MARGIN_Y = 10;

export function createDesktop(RE) {
  const { apps, vfs, session, bus } = RE;
  const layer = h('div#desktop-icons');
  let selected = new Set();
  let items = [];

  const posKey = () => `desktopPositions:${session.username}`;
  const getPositions = () => kv.get(posKey(), {});
  const savePosition = (key, col, row) => { const p = getPositions(); p[key] = [col, row]; kv.set(posKey(), p); };

  function desktopDir() { return `${session.home}/Desktop`; }

  function collect() {
    const list = [];
    for (const a of apps.listApps().filter(a => a.desktop !== false && a.desktop !== undefined).sort((a, b) => a.desktop - b.desktop)) {
      list.push({ key: 'app:' + a.id, label: a.desktopLabel || a.name, icon: a.icon, tooltip: a.comment, open: () => apps.launchApp(a.id), app: a });
    }
    const dir = desktopDir();
    if (vfs.isDir(dir)) {
      for (const e of vfs.readdir(dir, { withTypes: true }).filter(e => !e.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name))) {
        const path = `${dir}/${e.name}`;
        list.push({
          key: 'file:' + e.name, label: e.name, icon: iconForPath(path, e.type), path, type: e.type,
          open: () => openPath(RE, path),
        });
      }
    }
    return list;
  }

  function layout() {
    const rows = Math.max(1, Math.floor((layer.clientHeight - MARGIN_Y) / CELL_H));
    const taken = new Set();
    const pos = getPositions();
    const placed = [];
    // honour saved positions first
    for (const it of items) {
      const p = pos[it.key];
      if (p && p[1] < rows && !taken.has(p.join(','))) { it.col = p[0]; it.row = p[1]; taken.add(p.join(',')); placed.push(it); }
    }
    let col = 0, row = 0;
    for (const it of items) {
      if (placed.includes(it)) continue;
      while (taken.has(`${col},${row}`)) { row++; if (row >= rows) { row = 0; col++; } }
      it.col = col; it.row = row; taken.add(`${col},${row}`);
    }
    for (const it of items) {
      it.el.style.left = MARGIN_X + it.col * CELL_W + 'px';
      it.el.style.top = MARGIN_Y + it.row * CELL_H + 'px';
    }
  }

  function render() {
    clear(layer);
    items = collect();
    for (const it of items) {
      it.el = h('div.desk-icon', { title: it.tooltip || it.label, dataset: { key: it.key } },
        h('img', { src: it.icon, alt: '' }), h('div.label', it.label));
      if (selected.has(it.key)) it.el.classList.add('selected');
      attach(it);
      layer.appendChild(it.el);
    }
    layout();
  }

  function select(keys) {
    selected = new Set(keys);
    for (const it of items) it.el.classList.toggle('selected', selected.has(it.key));
  }

  function attach(it) {
    const el = it.el;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey) {
        const s = new Set(selected);
        s.has(it.key) ? s.delete(it.key) : s.add(it.key);
        select(s);
      } else if (!selected.has(it.key)) select([it.key]);
      // drag to move
      const start = { x: e.clientX, y: e.clientY, left: el.offsetLeft, top: el.offsetTop };
      let dragging = false;
      el.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
        if (!dragging && Math.abs(dx) + Math.abs(dy) < 6) return;
        dragging = true;
        el.classList.add('dragging');
        el.style.left = start.left + dx + 'px';
        el.style.top = start.top + dy + 'px';
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        if (!dragging) return;
        el.classList.remove('dragging');
        const col = Math.max(0, Math.round((el.offsetLeft - MARGIN_X) / CELL_W));
        const row = Math.max(0, Math.round((el.offsetTop - MARGIN_Y) / CELL_H));
        const occupant = items.find(o => o !== it && o.col === col && o.row === row);
        if (occupant) savePosition(occupant.key, it.col, it.row);
        savePosition(it.key, col, row);
        layout();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
    el.addEventListener('dblclick', () => it.open());
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') it.open(); });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!selected.has(it.key)) select([it.key]);
      const menu = [{ label: 'Open', action: () => it.open() }];
      if (it.app) {
        menu.push({ type: 'separator' }, { label: 'Properties…', action: () => RE.dialogs.info(it.app.name, `${it.app.comment || ''}\n\nCommand: ${it.app.id}`, 'Launcher Properties') });
      } else if (it.path) {
        menu.push(
          { label: 'Open With…', submenu: openWithItems(RE, it.path) },
          { label: 'Open Containing Folder', action: () => apps.launchApp('file-manager', { path: desktopDir() }) },
          { type: 'separator' },
          { label: 'Rename…', action: () => renamePath(RE, it.path) },
          { label: 'Move to Trash', action: () => trashPath(RE, it.path) },
          { type: 'separator' },
          { label: 'Copy Path', action: () => navigator.clipboard?.writeText(it.path) },
          { label: 'Properties…', action: () => showProperties(RE, it.path) },
        );
      }
      showMenu(menu, { x: e.clientX, y: e.clientY });
    });
  }

  // Rubber-band selection & deselect on empty click
  layer.addEventListener('pointerdown', (e) => {
    if (e.target !== layer || e.button !== 0) return;
    select([]);
    const r = layer.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const band = h('div.desk-rubber');
    layer.appendChild(band);
    layer.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      const L = Math.min(sx, x), T = Math.min(sy, y), W = Math.abs(x - sx), H = Math.abs(y - sy);
      Object.assign(band.style, { left: L + 'px', top: T + 'px', width: W + 'px', height: H + 'px' });
      select(items.filter(it => it.el.offsetLeft < L + W && it.el.offsetLeft + it.el.offsetWidth > L && it.el.offsetTop < T + H && it.el.offsetTop + it.el.offsetHeight > T).map(it => it.key));
    };
    const up = () => { band.remove(); layer.removeEventListener('pointermove', move); layer.removeEventListener('pointerup', up); };
    layer.addEventListener('pointermove', move);
    layer.addEventListener('pointerup', up);
  });

  layer.addEventListener('contextmenu', (e) => {
    if (e.target !== layer) return;
    e.preventDefault();
    showMenu([
      { label: 'Open Terminal Here', icon: 'assets/icons/actions/terminal.svg', action: () => apps.launchApp('terminal', { cwd: desktopDir() }) },
      { label: 'Open in File Manager', icon: 'assets/icons/actions/document-open.svg', action: () => apps.launchApp('file-manager', { path: desktopDir() }) },
      { type: 'separator' },
      { label: 'Create Folder…', icon: 'assets/icons/actions/folder-new.svg', action: async () => {
        const name = await RE.dialogs.prompt('Enter the new folder name:', { title: 'Create New Folder', value: 'New Folder' });
        if (name) { try { vfs.mkdir(`${desktopDir()}/${name}`); } catch (err) { RE.dialogs.error('Could not create folder', err.message); } }
      } },
      { label: 'Create Document', submenu: [
        { label: 'Empty File', action: async () => {
          const name = await RE.dialogs.prompt('Enter the new file name:', { title: 'Create Document', value: 'Untitled Document.txt' });
          if (name) vfs.writeFile(`${desktopDir()}/${name}`, '');
        } },
        { label: 'R Script', action: () => vfs.writeFile(uniqueName(vfs, desktopDir(), 'untitled.R'), '# R script\n') },
        { label: 'Python Script', action: () => vfs.writeFile(uniqueName(vfs, desktopDir(), 'untitled.py'), '# Python script\n') },
      ] },
      { type: 'separator' },
      { label: 'Arrange Desktop Icons', action: () => { kv.remove(posKey()); render(); } },
      { label: 'Desktop Settings…', icon: 'assets/icons/actions/preferences-system.svg', action: () => apps.launchApp('settings') },
      { type: 'separator' },
      { label: 'Applications', submenu: () => apps.listApps().sort((a, b) => a.name.localeCompare(b.name)).map(a => ({ label: a.name, icon: a.icon, action: () => apps.launchApp(a.id) })) },
    ], { x: e.clientX, y: e.clientY });
  });

  document.addEventListener('keydown', (e) => {
    if (document.activeElement && document.activeElement !== document.body) return;
    if (e.key === 'Enter' && selected.size) items.filter(i => selected.has(i.key)).forEach(i => i.open());
  });

  bus.on('fs:change', (ev) => { if (ev.path.startsWith(desktopDir())) render(); });
  bus.on('session:login', render);
  window.addEventListener('resize', () => layout());

  return { el: layer, render };
}

function uniqueName(vfs, dir, name) {
  let p = `${dir}/${name}`;
  let i = 1;
  const m = name.match(/^(.*?)(\.[^.]+)?$/);
  while (vfs.exists(p)) p = `${dir}/${m[1]} (${i++})${m[2] || ''}`;
  return p;
}

export function openWithItems(RE, path) {
  const preferred = defaultAppFor(path);
  const ids = ['text-editor', 'rstudio', 'spyder', 'igv', 'web-browser', 'terminal'];
  return ids.map(id => RE.apps.getApp(id)).filter(Boolean).map(a => ({
    label: a.name + (a.id === preferred ? ' (default)' : ''),
    icon: a.icon,
    action: () => RE.apps.launchApp(a.id, a.id === 'terminal' ? { cwd: RE.vfs.dirname(path) } : { path }),
  }));
}

export async function openPath(RE, path) {
  const { vfs } = RE;
  if (vfs.isDir(path)) return RE.apps.launchApp('file-manager', { path });
  const app = defaultAppFor(path);
  if (!app) {
    return RE.dialogs.message({
      title: 'Open With', icon: 'question',
      primary: `There is no default application for "${vfs.basename(path)}".`,
      secondary: 'Binary or compressed files are usually opened with command-line tools in the Terminal (for example samtools, bcftools or zcat).',
      buttons: [{ label: 'Cancel', value: null }, { label: 'Open Terminal Here', value: 'term', kind: 'suggested' }],
    }).then(v => v === 'term' && RE.apps.launchApp('terminal', { cwd: vfs.dirname(path) }));
  }
  return RE.apps.launchApp(app, { path });
}

export async function renamePath(RE, path) {
  const name = await RE.dialogs.prompt('Rename to:', { title: 'Rename', value: RE.vfs.basename(path) });
  if (!name || name === RE.vfs.basename(path)) return;
  try { RE.vfs.rename(path, `${RE.vfs.dirname(path)}/${name}`); } catch (e) { RE.dialogs.error('Could not rename', e.message); }
}

export async function trashPath(RE, path) {
  try { RE.vfs.trash(path); } catch (e) { RE.dialogs.error('Could not move to Trash', e.message); }
}

export function showProperties(RE, path) {
  const st = RE.vfs.stat(path);
  if (!st) return;
  RE.dialogs.message({
    title: `${RE.vfs.basename(path)} — Properties`, icon: iconForPath(path, st.type),
    primary: RE.vfs.basename(path),
    secondary: [
      `Kind: ${st.type === 'dir' ? 'folder' : 'file'}`,
      `Location: ${RE.vfs.dirname(path)}`,
      st.type === 'file' ? `Size: ${st.size.toLocaleString()} bytes` : null,
      `Modified: ${new Date(st.mtime).toLocaleString()}`,
      `Permissions: ${st.readonly ? 'read-only' : 'read & write'} (${st.modeString})`,
      `Owner: ${st.owner}`,
    ].filter(Boolean).join('\n'),
  });
}
