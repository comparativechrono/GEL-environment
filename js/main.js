// =============================================================================
// Research Environment simulator — bootstrap.
// Exposes the shared services as window.RE so apps (and same-origin site
// iframes inside the browser, via window.parent.RE) can use them.
// =============================================================================

import { CONFIG } from './config.js';
import { h } from './core/util.js';
import { bus } from './core/bus.js';
import { kv } from './core/store.js';
import { session } from './core/session.js';
import { vfs } from './core/vfs.js';
import { WindowManager } from './core/wm.js';
import * as apps from './core/apps.js';
import * as dialogs from './core/dialogs.js';
import { notify as rawNotify } from './core/notify.js';
import { installClipboard } from './core/clipboard.js';
import { startEngine } from './engine/index.js';
import { createPanel } from './shell/panel.js';
import { createDesktop } from './shell/desktop.js';
import { showLogin, showReconnect, showPowerOff } from './shell/login.js';
import { registerAllApps } from './apps/index.js';
import { services, initServices } from './services/index.js';

const RE = window.RE = {
  config: CONFIG,
  bus, kv, session, vfs, apps, dialogs,
  notificationLog: [],
  notify(opts) {
    const d = new Date();
    RE.notificationLog.push({ ...opts, time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` });
    return rawNotify(opts);
  },
  services,
  shell: {},
};

async function boot() {
  const root = h('div#desktop-root');
  const workspace = h('div#workspace');
  document.body.appendChild(root);

  RE.wm = new WindowManager(workspace);
  apps.initApps(RE);
  dialogs.initDialogs(RE);
  registerAllApps();

  const params = new URLSearchParams(location.search);
  if (params.has('reset')) {
    kv.clearAll();
    try { indexedDB.deleteDatabase(`${CONFIG.storageNamespace}-files`); indexedDB.deleteDatabase(CONFIG.storageNamespace); } catch { /* ignore */ }
    history.replaceState(null, '', location.pathname);
  }

  // the RE's own clipboard: copy and paste stay inside the desktop (js/core/clipboard.js)
  installClipboard(RE);

  // ---- login (or reconnect to an existing session)
  if (params.get('user')) session.login({ username: params.get('user') });
  if (!session.loggedIn) await showLogin(RE);
  else if (!params.has('fast')) await showReconnect(RE);

  await prepareFilesystem();
  await initServices(RE);

  const panel = createPanel(RE);
  const desktop = createDesktop(RE);
  root.append(panel.el, desktop.el, workspace);
  desktop.render();
  RE.desktop = desktop;

  RE.shell.lock = async () => { await showLogin(RE, { mode: 'unlock' }); };
  RE.shell.logout = async () => {
    const ok = await dialogs.confirm('Log out of the Research Environment?',
      'Your open windows will be closed. Files you have saved are kept.', { ok: 'Log Out' });
    if (!ok) return;
    for (const w of [...RE.wm.windows]) await w.close(true);
    session.logout();
    await showLogin(RE);
    await prepareFilesystem();
    desktop.render();
  };
  RE.shell.powerOff = async () => {
    const ok = await dialogs.confirm('Power off your WorkSpace?',
      'If you power off, there will be a delay of several minutes before you can sign in again. Use Log Out if you want to come straight back.', { ok: 'Power Off', destructive: true });
    if (!ok) return;
    for (const w of [...RE.wm.windows]) await w.close(true);
    session.logout();
    await showPowerOff(RE);
    await showLogin(RE);
    await prepareFilesystem();
    desktop.render();
  };

  // Deep links for practicals: ?open=terminal,rstudio  ?url=https://...
  const open = params.get('open');
  if (open) for (const id of open.split(',')) await apps.launchApp(id.trim());
  if (params.get('url')) apps.launchApp('web-browser', { url: params.get('url') });

  bus.emit('desktop:ready');
}

let fsUser = null;
async function prepareFilesystem() {
  // A different user signed in: start from a clean page (each user has their own files).
  if (fsUser && fsUser !== session.username) { location.reload(); await new Promise(() => {}); }
  await startEngine(RE);
  fsUser = session.username;
}

boot().catch((e) => {
  console.error(e);
  document.body.appendChild(h('pre', { style: { color: '#fff', padding: '20px', whiteSpace: 'pre-wrap' } },
    'The Research Environment simulator failed to start:\n\n' + (e?.stack || e)));
});
