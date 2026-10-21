// =============================================================================
// GTK-style dialogs: message boxes, prompts and the file chooser.
// All return Promises.
// =============================================================================

import { h, clear, formatBytes, lsDate } from './util.js';
import { iconForPath } from './mime.js';

let RE = null;
export function initDialogs(re) { RE = re; }

/** A dialog with any content: {backdrop, dlg, close}. Apps build their own forms with it. */
export function dialogShell(title, content, actions, { width } = {}) {
  const backdrop = h('div.gtk-dialog-backdrop');
  const dlg = h('div.gtk-dialog', { role: 'dialog', style: width ? { width: width + 'px' } : null },
    h('div.gtk-dialog-title', title), content, h('div.gtk-dialog-actions', actions));
  backdrop.appendChild(dlg);
  document.body.appendChild(backdrop);
  return { backdrop, dlg, close: () => backdrop.remove() };
}

/** Generic message dialog. buttons: [{label, value, kind:'suggested'|'destructive'}] */
export function message({ title = '', primary = '', secondary = '', icon = 'info', buttons = [{ label: 'OK', value: true, kind: 'suggested' }], extra } = {}) {
  return new Promise((resolve) => {
    const iconSrc = {
      info: 'assets/icons/status/dialog-information.svg',
      warning: 'assets/icons/status/dialog-warning.svg',
      error: 'assets/icons/status/dialog-error.svg',
      question: 'assets/icons/status/dialog-question.svg',
      success: 'assets/icons/status/dialog-success.svg',
    }[icon] || icon;
    const content = h('div.gtk-dialog-content',
      h('img.dlg-icon', { src: iconSrc, alt: '' }),
      h('div', { style: { minWidth: 0 } }, primary ? h('div.dlg-primary', primary) : null,
        secondary ? h('div.dlg-secondary', secondary) : null, extra || null));
    let shell;
    const btns = buttons.map(b => h(`button.gtk-btn${b.kind ? '.' + b.kind : ''}`, {
      onclick: () => { shell.close(); resolve(b.value); },
    }, b.label));
    shell = dialogShell(title, content, btns);
    const onKey = (e) => {
      if (e.key === 'Escape') { shell.close(); resolve(null); document.removeEventListener('keydown', onKey, true); }
      if (e.key === 'Enter') { e.preventDefault(); btns[btns.length - 1].click(); document.removeEventListener('keydown', onKey, true); }
    };
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => btns[btns.length - 1]?.focus(), 0);
  });
}

export const info = (primary, secondary, title = 'Information') => message({ title, primary, secondary, icon: 'info' });
export const warning = (primary, secondary, title = 'Warning') => message({ title, primary, secondary, icon: 'warning' });
export const error = (primary, secondary, title = 'Error') => message({ title, primary, secondary, icon: 'error' });

export function confirm(primary, secondary = '', { title = 'Question', ok = 'OK', cancel = 'Cancel', destructive = false } = {}) {
  return message({
    title, primary, secondary, icon: 'question',
    buttons: [{ label: cancel, value: false }, { label: ok, value: true, kind: destructive ? 'destructive' : 'suggested' }],
  });
}

export function prompt(primary, { title = '', value = '', placeholder = '', ok = 'OK' } = {}) {
  return new Promise((resolve) => {
    const input = h('input.gtk-entry', { value, placeholder, style: { width: '100%', marginTop: '8px' } });
    let shell;
    const done = (v) => { shell.close(); resolve(v); };
    const content = h('div.gtk-dialog-content', h('div', { style: { flex: '1' } }, h('div.dlg-primary', primary), input));
    shell = dialogShell(title, content, [
      h('button.gtk-btn', { onclick: () => done(null) }, 'Cancel'),
      h('button.gtk-btn.suggested', { onclick: () => done(input.value) }, ok),
    ], { width: 420 });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done(input.value);
      if (e.key === 'Escape') done(null);
    });
    setTimeout(() => { input.focus(); input.select(); }, 0);
  });
}

/**
 * A dialog with several labelled fields. fields: [{name, label, value, placeholder, type, options:[[value,label]], help}]
 * Resolves to {name: value} or null when cancelled.
 */
export function form({ title = '', primary = '', fields = [], ok = 'OK', width = 520 } = {}) {
  return new Promise((resolve) => {
    const inputs = {};
    const rows = fields.map((f) => {
      let el;
      if (f.options) el = h('select.gtk-select', f.options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(f.value) }, l)));
      else if (f.type === 'textarea') el = h('textarea.gtk-textarea', { rows: f.rows || 4, placeholder: f.placeholder || '' }, f.value || '');
      else if (f.type === 'checkbox') el = h('input', { type: 'checkbox', checked: !!f.value });
      else el = h('input.gtk-entry', { type: f.type || 'text', value: f.value ?? '', placeholder: f.placeholder || '' });
      inputs[f.name] = el;
      return h('div.dlg-field', h('label', f.label), el, f.help ? h('div.dlg-help', f.help) : null);
    });
    let shell;
    const values = () => Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.type === 'checkbox' ? el.checked : el.value]));
    const done = (v) => { shell.close(); resolve(v); };
    const content = h('div.gtk-dialog-content', h('div.dlg-form', primary ? h('div.dlg-primary', primary) : null, ...rows));
    shell = dialogShell(title, content, [
      h('button.gtk-btn', { onclick: () => done(null) }, 'Cancel'),
      h('button.gtk-btn.suggested', { onclick: () => done(values()) }, ok),
    ], { width });
    shell.dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') done(null);
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); done(values()); }
    });
    setTimeout(() => { const first = Object.values(inputs)[0]; first?.focus(); first?.select?.(); }, 0);
  });
}

/**
 * File chooser.
 *   mode: 'open' | 'save' | 'folder'
 *   multiple: allow selecting several files (open mode)
 *   filters: [{name:'R scripts', patterns:['*.R','*.r']}]
 * Resolves to a path (or array of paths when multiple), or null when cancelled.
 */
export function fileChooser({ mode = 'open', title, startDir, filename = '', multiple = false, filters = [], okLabel } = {}) {
  const vfs = RE.vfs;
  const home = RE.session.home;
  let dir = startDir && vfs.isDir(startDir) ? startDir : home;
  let selected = new Set();
  let filterIdx = 0;
  const allFilters = filters.length ? [...filters, { name: 'All files', patterns: ['*'] }] : [{ name: 'All files', patterns: ['*'] }];

  return new Promise((resolve) => {
    const pathBar = h('div.fc-pathbar');
    const list = h('div.fc-list.gtk-list.gtk-scroll');
    const nameEntry = h('input.gtk-entry', { value: filename, style: { flex: '1' } });
    const filterSel = h('select.gtk-select', allFilters.map((f, i) => h('option', { value: i }, f.name)));
    const places = h('div.fc-places.gtk-scroll');
    const placeList = [
      { label: RE.session.username, path: home, icon: 'assets/icons/places/folder-home.svg' },
      { label: 'Desktop', path: `${home}/Desktop`, icon: 'assets/icons/places/folder-desktop.svg' },
      { label: 'Documents', path: `${home}/Documents`, icon: 'assets/icons/places/folder-documents.svg' },
      { label: 'Downloads', path: `${home}/Downloads`, icon: 'assets/icons/places/folder-downloads.svg' },
      { type: 'sep' },
      ...RE.vfs.bookmarks().map(b => ({ label: b.label, path: b.path, icon: 'assets/icons/places/folder-remote.svg' })),
      { type: 'sep' },
      { label: 'File System', path: '/', icon: 'assets/icons/places/drive-harddisk.svg' },
    ];
    for (const p of placeList) {
      if (p.type === 'sep') { places.appendChild(h('div.menu-separator')); continue; }
      if (!vfs.exists(p.path)) continue;
      places.appendChild(h('div.fc-place', { onclick: () => go(p.path) }, h('img', { src: p.icon }), h('span', p.label)));
    }

    function matches(name) {
      const pats = allFilters[filterIdx].patterns;
      return pats.some(p => p === '*' || new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i').test(name));
    }

    function go(path) {
      if (!vfs.isDir(path)) return;
      dir = path;
      selected.clear();
      render();
    }

    function render() {
      clear(pathBar);
      const parts = dir.split('/').filter(Boolean);
      let acc = '';
      pathBar.appendChild(h('button.gtk-btn.small', { onclick: () => go('/') }, '/'));
      for (const part of parts) {
        acc += '/' + part;
        const p = acc;
        pathBar.appendChild(h('button.gtk-btn.small', { onclick: () => go(p) }, part));
      }
      clear(list);
      let entries = [];
      try { entries = vfs.readdir(dir, { withTypes: true }); } catch (e) { list.appendChild(h('div.muted', { style: { padding: '10px' } }, String(e.message || e))); return; }
      entries = entries.filter(e => !e.name.startsWith('.'))
        .filter(e => e.type === 'dir' || (mode !== 'folder' && matches(e.name)))
        .sort((a, b) => (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1) || a.name.localeCompare(b.name));
      const header = h('div.fc-row.fc-head', h('span.fc-name', 'Name'), h('span.fc-size', 'Size'), h('span.fc-date', 'Modified'));
      list.appendChild(header);
      for (const e of entries) {
        const full = (dir === '/' ? '' : dir) + '/' + e.name;
        const row = h('div.fc-row' + (selected.has(full) ? '.selected' : ''),
          h('span.fc-name', h('img', { src: iconForPath(full, e.type) }), e.name),
          h('span.fc-size', e.type === 'dir' ? '' : formatBytes(e.size)),
          h('span.fc-date', e.mtime ? lsDate(e.mtime) : ''));
        row.addEventListener('click', (ev) => {
          if (e.type === 'dir' && mode !== 'folder') { /* single click selects folders */ }
          if (multiple && (ev.ctrlKey || ev.metaKey)) {
            selected.has(full) ? selected.delete(full) : selected.add(full);
          } else {
            selected = new Set([full]);
          }
          if (e.type !== 'dir' && mode !== 'open') nameEntry.value = e.name;
          if (e.type === 'dir' && mode === 'folder') nameEntry.value = '';
          list.querySelectorAll('.fc-row.selected').forEach(r => r.classList.remove('selected'));
          row.classList.add('selected');
          if (multiple) render();
        });
        row.addEventListener('dblclick', () => {
          if (e.type === 'dir') go(full);
          else if (mode === 'open') finish([full]);
          else if (mode === 'save') { nameEntry.value = e.name; accept(); }
        });
        list.appendChild(row);
      }
      if (!entries.length) list.appendChild(h('div.muted', { style: { padding: '12px' } }, 'This folder is empty.'));
    }

    let shell;
    const finish = (paths) => { shell.close(); resolve(multiple ? paths : paths[0] ?? null); };

    async function accept() {
      if (mode === 'save') {
        const name = nameEntry.value.trim();
        if (!name) return;
        const target = name.startsWith('/') ? name : (dir === '/' ? '' : dir) + '/' + name;
        if (!vfs.canWrite(target)) {
          await error('Permission denied', `You do not have permission to save files in\n${vfs.dirname(target)}`);
          return;
        }
        if (vfs.exists(target) && vfs.isFile(target)) {
          const ok = await confirm(`A file named "${vfs.basename(target)}" already exists. Do you want to replace it?`,
            'The file already exists. Replacing it will overwrite its contents.', { ok: 'Replace', destructive: true });
          if (!ok) return;
        }
        finish([target]);
      } else if (mode === 'folder') {
        const sel = [...selected].find(p => vfs.isDir(p));
        finish([sel || dir]);
      } else {
        // a path typed (or pasted) in the Location box: a folder opens, a file is chosen
        const typed = nameEntry.value.trim();
        if (typed) {
          const p = typed.startsWith('/') ? vfs.normalize(typed) : typed === '~' || typed.startsWith('~/') ? vfs.normalize(home + typed.slice(1)) : (dir === '/' ? '' : dir) + '/' + typed;
          if (vfs.isDir(p)) { nameEntry.value = ''; go(p); return; }
          if (vfs.isFile(p)) { finish([p]); return; }
          await error('The file could not be found', `${typed}: No such file or directory`);
          return;
        }
        const files = [...selected].filter(p => vfs.isFile(p));
        if (files.length) finish(files);
        else if (selected.size === 1) go([...selected][0]);
      }
    }

    filterSel.addEventListener('change', () => { filterIdx = Number(filterSel.value); render(); });
    nameEntry.addEventListener('keydown', (e) => { if (e.key === 'Enter') accept(); });

    if (mode === 'open') nameEntry.placeholder = 'Type or paste a path (/genomes/…), or choose a file below';
    const top = mode === 'save'
      ? h('div.fc-namerow', h('label', 'Name:'), nameEntry)
      : mode === 'open' ? h('div.fc-namerow', h('label', 'Location:'), nameEntry) : null;
    const content = h('div.fc-wrap',
      top,
      h('div.fc-main', places, h('div.fc-right', pathBar, list)),
      h('div.fc-bottom', h('span.spacer'), filterSel));
    content.classList.add('gtk-dialog-content');
    shell = dialogShell(title || (mode === 'save' ? 'Save File' : mode === 'folder' ? 'Select Folder' : 'Open File'), content, [
      h('button.gtk-btn', { onclick: () => { shell.close(); resolve(null); } }, 'Cancel'),
      h('button.gtk-btn.suggested', { onclick: accept }, okLabel || (mode === 'save' ? 'Save' : mode === 'folder' ? 'Select' : 'Open')),
    ], { width: 760 });
    shell.dlg.classList.add('file-chooser');
    render();
    setTimeout(() => (mode === 'save' ? nameEntry : list).focus?.(), 0);
  });
}
