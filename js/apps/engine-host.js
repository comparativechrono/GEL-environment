// Helpers for hosting engine (MG) components inside desktop windows.
import { h, debounce } from '../core/util.js';

/** A loading screen in a window body while engine scripts / R / Python download. */
export function loadingScreen(win, { logo, title, text = 'Loading…' } = {}) {
  const msg = h('div.engine-loading-text', text);
  const el = h('div.loading-shade.engine-loading',
    logo ? h('img', { src: logo, alt: '', style: { width: '64px', height: '64px' } }) : null,
    title ? h('div', { style: { fontSize: '18px', fontWeight: 600, color: '#444' } }, title) : null,
    h('div.gtk-spinner'), msg);
  win.body.appendChild(el);
  return { el, set: (t) => { msg.textContent = t; }, remove: () => el.remove() };
}

/**
 * Run `make()` while recording the listeners it adds to MG.bus and to the shared
 * file system, so they can be removed when the window closes (engine components
 * were written for a page that lives as long as they do).
 */
export function withListenerCapture(make) {
  const MG = window.MG;
  const fs = MG.app.fs;
  const offs = [];
  const busOn = MG.bus.on;
  MG.bus.on = function (type, fn) { const off = busOn.call(MG.bus, type, fn); offs.push(off); return off; };
  const before = fs.listeners.length;
  let result;
  try {
    result = make();
  } finally {
    MG.bus.on = busOn;
  }
  const fsAdded = fs.listeners.slice(before);
  return {
    result,
    dispose() {
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
      for (const fn of fsAdded) { const i = fs.listeners.indexOf(fn); if (i >= 0) fs.listeners.splice(i, 1); }
    },
  };
}

/** Engine components measure themselves on window 'resize': relay desktop window resizes to them. */
export function relayResize(win, extra) {
  const fire = debounce(() => { window.dispatchEvent(new Event('resize')); extra?.(); }, 80);
  win.on('resize', fire);
  win.on('restore', fire);
  return fire;
}

export function stopPython(k) {
  if (!k) return;
  try { k.worker && k.worker.terminate(); } catch { /* gone */ }
  k.state = 'off';
}
