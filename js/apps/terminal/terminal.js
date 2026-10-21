// =============================================================================
// Terminal Emulator (xfce4-terminal look) around the engine's TerminalUI:
// a real bash interpreter with coreutils and WebAssembly bioinformatics tools,
// plus the RE commands of assets/js/shell-re.js (module, ssh, bsub ...).
// =============================================================================

import { h } from '../../core/util.js';
import { menubar } from '../../core/menu.js';
import { kv } from '../../core/store.js';
import { loadEngine } from '../../engine/loader.js';
import { loadingScreen, withListenerCapture, relayResize } from '../engine-host.js';

export async function launch(ctx, args = {}) {
  const { re } = ctx;
  const win = ctx.openWindow({ width: 820, height: 500, title: 'Terminal - ' + re.session.username + '@' + re.config.desktopHostname, minWidth: 360, minHeight: 200, className: 'app-terminal' });
  const loading = loadingScreen(win, { text: 'Starting the terminal…' });
  try {
    await loadEngine('shell');
  } catch (e) {
    loading.set('The terminal could not start: ' + e.message);
    return win;
  }
  const MG = window.MG;
  const fs = MG.app.fs;
  const host = h('div.term-host');
  let fontSize = kv.get('term:fontSize', 13);
  const applyFont = () => { host.style.setProperty('--term-font', fontSize + 'px'); kv.set('term:fontSize', fontSize); };
  applyFont();

  let term;
  const view = Object.create(fs);
  view.cwd = args.cwd && fs.isDir(args.cwd) ? fs.resolve(args.cwd) : MG.app.HOME;
  const cap = withListenerCapture(() => {
    term = new MG.TerminalUI(host, {
      fs: view,
      hostname: re.config.desktopHostname,
      env: { DISPLAY: ':0', XDG_SESSION_TYPE: 'x11', DESKTOP_SESSION: 'xubuntu', TERM: 'xterm-256color' },
      welcome: kv.get('term:welcomed', false) ? null
        : `Terminal on the ${re.config.environmentName} desktop. Type  help  for the commands,  module avail  for software, and  ssh ${re.session.username}@${re.config.hpc.loginHost}  to log in to the HPC.`,
    });
    return term;
  });
  kv.set('term:welcomed', true);
  term.reWindow = win;

  const copy = () => { const s = String(window.getSelection() || ''); if (s) navigator.clipboard?.writeText(s); };
  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      const i = term.input; const a = i.selectionStart, b = i.selectionEnd;
      i.value = i.value.slice(0, a) + t.replace(/\n$/, '') + i.value.slice(b);
      i.focus();
    } catch { re.dialogs.info('Paste', 'Use Ctrl+Shift+V or the browser\'s paste: the clipboard could not be read.'); }
  };

  const bar = menubar([
    { label: 'File', items: () => [
      { label: 'New Window', shortcut: 'Shift+Ctrl+N', action: () => re.apps.launchApp('terminal', { cwd: term.fs.cwd }) },
      { type: 'separator' },
      { label: 'Save Session…', action: () => MG.termSession && MG.termSession.menu(bar.el, term) },
      { type: 'separator' },
      { label: 'Close Window', shortcut: 'Shift+Ctrl+Q', action: () => win.close() },
    ] },
    { label: 'Edit', items: () => [
      { label: 'Copy', shortcut: 'Shift+Ctrl+C', action: copy },
      { label: 'Paste', shortcut: 'Shift+Ctrl+V', action: paste },
    ] },
    { label: 'View', items: () => [
      { label: 'Show Files Panel', checked: !term.filesEl.hidden, action: () => term.toggleFiles() },
      { type: 'separator' },
      { label: 'Zoom In', shortcut: 'Ctrl++', action: () => { fontSize = Math.min(24, fontSize + 1); applyFont(); } },
      { label: 'Zoom Out', shortcut: 'Ctrl+-', action: () => { fontSize = Math.max(9, fontSize - 1); applyFont(); } },
      { label: 'Normal Size', shortcut: 'Ctrl+0', action: () => { fontSize = 13; applyFont(); } },
    ] },
    { label: 'Terminal', items: () => [
      { label: 'Clear', shortcut: 'Ctrl+L', action: () => term.clear() },
      { label: 'Stop the running command', shortcut: 'Ctrl+C', action: () => term.stop && term.stop() },
    ] },
    { label: 'Help', items: () => [
      { label: 'Commands', action: () => term.run('help') },
      { label: 'RE Documentation: the terminal', action: () => re.apps.launchApp('web-browser', { url: 'https://re-docs.genomicsengland.co.uk/terminal/' }) },
      { label: 'RE Documentation: the HPC', action: () => re.apps.launchApp('web-browser', { url: 'https://re-docs.genomicsengland.co.uk/hpc/' }) },
    ] },
  ]);

  loading.remove();
  win.body.append(bar.el, host);

  // the window title follows the terminal's (user@host: dir)
  const syncTitle = () => win.setTitle('Terminal - ' + (term.titleEl.textContent || ''));
  new MutationObserver(syncTitle).observe(term.titleEl, { childList: true, characterData: true, subtree: true });
  syncTitle();

  win.on('focus', () => { MG.app.term = term; setTimeout(() => term.focus(), 0); });
  MG.app.term = term;
  win.body.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) { e.preventDefault(); copy(); }
    if (e.ctrlKey && e.shiftKey && (e.key === 'V' || e.key === 'v')) { e.preventDefault(); paste(); }
    if (e.ctrlKey && e.shiftKey && (e.key === 'N' || e.key === 'n')) { e.preventDefault(); re.apps.launchApp('terminal', { cwd: term.fs.cwd }); }
  });
  relayResize(win);
  win.onBeforeClose(async () => {
    const st = term.shell.re;
    if ((term.busy && !term.program) || (st && st.stack.length)) {
      return re.dialogs.confirm('Close this terminal?', st && st.stack.length ? 'You are still logged in to the HPC in this terminal. Closing it ends the session (and any interactive job).' : 'A command is still running in this terminal.', { ok: 'Close Terminal', destructive: true });
    }
    return true;
  });
  win.on('close', () => {
    try {
      const st = term.shell.re;
      for (const f of (st && st.stack) || []) if (f.kind === 'job') re.services.lsf.finishInteractive(f.job, 130);
      if (term.program && term.program.interrupt) term.program.interrupt();
    } catch { /* ignore */ }
    cap.dispose();
    if (MG.app.term === term) MG.app.term = null;
  });
  setTimeout(() => term.focus(), 50);
  if (args.command) setTimeout(() => term.run(args.command), 100);
  return win;
}
