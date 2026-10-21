// =============================================================================
// Application registry.
// Apps are declared in js/apps/index.js and lazily imported when first launched.
// =============================================================================

import { bus } from './bus.js';
import { kv } from './store.js';

const registry = new Map();
const loaded = new Map();
let RE = null;

export function initApps(re) { RE = re; }

/**
 * def = {
 *   id, name, genericName, comment, icon,
 *   categories: ['Development', ...],       // Whisker menu categories
 *   desktop: number | false,                // desktop icon order (false = none)
 *   favourite: boolean,                     // shown under Favourites
 *   module: './apps/terminal/index.js',     // lazy module exporting launch(ctx, args)
 *   launch: (ctx, args) => {},              // OR an inline launcher
 *   singleton: boolean,                     // focus existing window instead of opening another
 *   mimeTypes: ['text/plain'],              // used by "Open With"
 *   keywords: ['shell', 'bash'],
 *   hidden: boolean                         // registered but not shown in menus
 * }
 */
export function registerApp(def) {
  registry.set(def.id, { categories: [], keywords: [], mimeTypes: [], desktop: false, ...def });
}

export function getApp(id) { return registry.get(id); }

export function listApps({ includeHidden = false } = {}) {
  return [...registry.values()].filter(a => includeHidden || !a.hidden);
}

export function appsForMime(mime) {
  return listApps().filter(a => a.mimeTypes.some(m => m === mime || (m.endsWith('/*') && mime.startsWith(m.slice(0, -1)))));
}

export function recentApps() { return kv.get('recentApps', []); }

function markRecent(id) {
  const list = recentApps().filter(x => x !== id);
  list.unshift(id);
  kv.set('recentApps', list.slice(0, 10));
}

/**
 * Launch an app. args are app-specific (e.g. {path} for an editor, {url} for the browser).
 * Returns whatever the app's launch() returns (usually its window).
 */
export async function launchApp(id, args = {}) {
  const app = registry.get(id);
  if (!app) {
    RE.dialogs.error('Failed to launch application', `No application is registered with the name "${id}".`);
    return null;
  }
  if (app.singleton) {
    const existing = RE.wm.byApp(id)[0];
    if (existing) {
      existing.focus();
      existing.emit('relaunch', args);
      return existing;
    }
  }
  markRecent(id);
  bus.emit('app:launch', id, args);
  try {
    let launch = app.launch;
    if (!launch && app.module) {
      if (!loaded.has(app.module)) loaded.set(app.module, import(app.module));
      const mod = await loaded.get(app.module);
      launch = mod.launch || mod.default?.launch;
    }
    if (!launch) throw new Error(`Application "${id}" has no launcher`);
    const ctx = {
      re: RE,
      app,
      openWindow: (opts) => RE.wm.open({ appId: id, icon: app.icon, title: app.name, ...opts }),
    };
    return await launch(ctx, args);
  } catch (err) {
    console.error(err);
    loaded.delete(app.module);
    RE.dialogs.error(`Failed to execute "${app.name}"`, String(err?.message || err));
    return null;
  }
}
