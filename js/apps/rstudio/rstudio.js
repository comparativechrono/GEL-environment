// =============================================================================
// RStudio: the engine's RStudio imitation (Source, Console, Environment,
// Files/Plots/Packages/Help/Viewer, Terminal) with R from webR, in a window.
// One window at a time, like the desktop application.
// =============================================================================

import { h } from '../../core/util.js';
import { loadEngine } from '../../engine/loader.js';
import { loadingScreen, withListenerCapture, relayResize } from '../engine-host.js';

export async function launch(ctx, args = {}) {
  const { re } = ctx;
  const win = ctx.openWindow({ width: 1200, height: 760, title: 'RStudio', minWidth: 640, minHeight: 420, className: 'app-ide app-rstudio' });
  const loading = loadingScreen(win, { logo: 'assets/icons/apps/rstudio.svg', title: 'RStudio', text: 'Loading RStudio…' });
  let cap = null;
  win.ideReady = (async () => {
    await loadEngine('rstudio');
    const MG = window.MG;
    const root = h('div.ide-app');
    loading.remove();
    win.body.appendChild(root);
    cap = withListenerCapture(() => new MG.RStudioApp(root, { fs: MG.app.fs }));
    MG.app.rstudio = cap.result;
    return cap.result;
  })();
  win.ideReady.catch((e) => loading.set('RStudio could not start: ' + (e?.message || e)));
  relayResize(win);
  win.on('focus', () => setTimeout(() => window.dispatchEvent(new Event('resize')), 0));
  win.onBeforeClose(() => re.dialogs.confirm('Quit R Session?', 'Closing RStudio ends its R session. Objects in R\'s memory (the Environment pane) are lost; your files are kept.', { ok: 'Quit', cancel: 'Cancel' }));
  win.on('close', async () => {
    const app = await win.ideReady.catch(() => null);
    try { if (app && app.S) app.S.close(true); } catch { /* ignore */ }
    cap?.dispose();
    if (window.MG?.app?.rstudio === app) window.MG.app.rstudio = null;
  });
  win.on('relaunch', async (a = {}) => {
    if (!a.path) return;
    const app = await win.ideReady;
    if (app.restored) await app.restored.catch(() => {});
    await app.openFile(window.MG.app.fs.resolve(a.path));
  });
  if (args.path) {
    const app = await win.ideReady;
    if (app.restored) await app.restored.catch(() => {});
    await app.openFile(window.MG.app.fs.resolve(args.path));
  }
  return win;
}
