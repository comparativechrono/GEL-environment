// =============================================================================
// Spyder: the engine's Spyder imitation (Editor, IPython console, Variable
// Explorer, Plots, Files, Help) with Python from Pyodide, in a window.
// =============================================================================

import { h } from '../../core/util.js';
import { loadEngine } from '../../engine/loader.js';
import { loadingScreen, withListenerCapture, relayResize, stopPython } from '../engine-host.js';

export async function launch(ctx, args = {}) {
  const { re } = ctx;
  const win = ctx.openWindow({ width: 1200, height: 760, title: 'Spyder (Python 3.13)', minWidth: 640, minHeight: 420, className: 'app-ide app-spyder' });
  const loading = loadingScreen(win, { logo: 'assets/icons/apps/spyder.svg', title: 'Spyder', text: 'Loading Spyder…' });
  let cap = null;
  win.ideReady = (async () => {
    await loadEngine('spyder');
    const MG = window.MG;
    const root = h('div.ide-app');
    loading.remove();
    win.body.appendChild(root);
    cap = withListenerCapture(() => new MG.SpyderApp(root, { fs: MG.app.fs }));
    MG.app.spyder = cap.result;
    return cap.result;
  })();
  win.ideReady.catch((e) => loading.set('Spyder could not start: ' + (e?.message || e)));
  relayResize(win);
  win.on('focus', () => setTimeout(() => window.dispatchEvent(new Event('resize')), 0));
  win.onBeforeClose(() => re.dialogs.confirm('Quit Spyder?', 'Closing Spyder ends its Python console. Variables in memory are lost; your files are kept.', { ok: 'Quit' }));
  win.on('close', async () => {
    const app = await win.ideReady.catch(() => null);
    stopPython(app && app.py);
    cap?.dispose();
    if (window.MG?.app?.spyder === app) window.MG.app.spyder = null;
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
