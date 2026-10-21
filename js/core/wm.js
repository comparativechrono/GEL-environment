// =============================================================================
// Window manager (xfwm4-like).
// Each application window is a WMWindow: a frame with a Greybird title bar,
// resize handles and a body element the app renders into.
// =============================================================================

import { h, clamp, uid } from './util.js';
import { Emitter } from './bus.js';
import { showMenu } from './menu.js';

const ICON_MIN = '<svg viewBox="0 0 10 10"><path d="M1.5 8.5h7"/></svg>';
const ICON_MAX = '<svg viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7"/></svg>';
const ICON_RESTORE = '<svg viewBox="0 0 10 10"><rect x="1.5" y="3.5" width="5" height="5"/><path d="M3.5 3.5V1.5h5v5h-2"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 10 10"><path d="M2 2l6 6M8 2l-6 6"/></svg>';

const SNAP_EDGE = 6;

export class WMWindow extends Emitter {
  constructor(wm, opts) {
    super();
    this.wm = wm;
    this.id = opts.id || uid('win');
    this.appId = opts.appId || 'unknown';
    this.opts = opts;
    this.state = 'normal'; // normal | maximized | tiled-left | tiled-right
    this.minimized = false;
    this.closed = false;
    this._beforeClose = [];
    this._build();
  }

  _build() {
    const o = this.opts;
    this.iconImg = h('img', { src: o.icon || 'assets/icons/apps/application.svg', alt: '' });
    this.menuBtn = h('button.wm-menu-btn', { title: 'Window menu', tabindex: -1 }, this.iconImg);
    this.titleEl = h('div.wm-title', o.title || '');
    this.btnMin = h('button.wm-btn.minimize', { title: 'Minimize', tabindex: -1, html: ICON_MIN });
    this.btnMax = h('button.wm-btn.maximize', { title: 'Maximize', tabindex: -1, html: ICON_MAX });
    this.btnClose = h('button.wm-btn.close', { title: 'Close', tabindex: -1, html: ICON_CLOSE });
    const buttons = h('div.wm-buttons', o.minimizable === false ? null : this.btnMin,
      o.resizable === false ? null : this.btnMax, this.btnClose);
    this.titlebar = h('div.wm-titlebar', this.menuBtn, this.titleEl, buttons);
    this.body = h('div.wm-body');
    this.el = h('div.wm-window.opening', { tabindex: -1, dataset: { app: this.appId, win: this.id } },
      this.titlebar, this.body);
    if (o.className) this.el.classList.add(...o.className.split(/\s+/));
    if (o.resizable === false) this.el.classList.add('no-resize');
    for (const dir of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
      const handle = h(`div.wm-resize.${dir}`);
      handle.addEventListener('pointerdown', (e) => this._startResize(e, dir));
      this.el.appendChild(handle);
    }
    if (o.minWidth) this.el.style.minWidth = o.minWidth + 'px';
    if (o.minHeight) this.el.style.minHeight = o.minHeight + 'px';

    this.el.addEventListener('pointerdown', () => this.focus(), true);
    this.titlebar.addEventListener('pointerdown', (e) => this._startMove(e));
    this.titlebar.addEventListener('dblclick', (e) => {
      if (e.target.closest('.wm-btn, .wm-menu-btn')) return;
      if (o.resizable !== false) this.toggleMaximize();
    });
    this.titlebar.addEventListener('contextmenu', (e) => { e.preventDefault(); this.showWindowMenu(e.clientX, e.clientY); });
    this.menuBtn.addEventListener('click', (e) => {
      const r = this.menuBtn.getBoundingClientRect();
      this.showWindowMenu(r.left, r.bottom);
      e.stopPropagation();
    });
    this.menuBtn.addEventListener('dblclick', () => this.close());
    this.btnMin.addEventListener('click', () => this.minimize());
    this.btnMax.addEventListener('click', () => this.toggleMaximize());
    this.btnClose.addEventListener('click', () => this.close());
  }

  get title() { return this.titleEl.textContent; }
  get icon() { return this.iconImg.src; }
  get focused() { return this.wm.focusedWindow === this; }

  setTitle(t) {
    this.titleEl.textContent = t;
    this.emit('title', t);
    this.wm.emit('change', this);
  }

  setIcon(src) {
    this.iconImg.src = src;
    this.wm.emit('change', this);
  }

  /** Register a hook that can veto closing (return false or a Promise<false>). */
  onBeforeClose(fn) { this._beforeClose.push(fn); }

  geometry() {
    return { x: this.el.offsetLeft, y: this.el.offsetTop, w: this.el.offsetWidth, h: this.el.offsetHeight };
  }

  setGeometry({ x, y, w, h: hh }) {
    if (x !== undefined) this.el.style.left = Math.round(x) + 'px';
    if (y !== undefined) this.el.style.top = Math.round(y) + 'px';
    if (w !== undefined) this.el.style.width = Math.round(w) + 'px';
    if (hh !== undefined) this.el.style.height = Math.round(hh) + 'px';
    this._notifyResize();
  }

  _notifyResize() {
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => this.emit('resize', this.geometry()));
  }

  focus() {
    if (this.closed) return;
    if (this.minimized) this.restoreFromMinimize();
    this.wm.focus(this);
  }

  minimize() {
    if (this.minimized) return;
    this.minimized = true;
    this.el.classList.add('minimized');
    this.emit('minimize');
    this.wm._onMinimize(this);
  }

  restoreFromMinimize() {
    if (!this.minimized) return;
    this.minimized = false;
    this.el.classList.remove('minimized');
    this.emit('restore');
    this.wm.emit('change', this);
  }

  toggleMaximize() {
    if (this.state === 'maximized') this.restore(); else this.maximize();
  }

  maximize() {
    if (this.state === 'normal') this._saved = this.geometry();
    this.state = 'maximized';
    this.el.classList.add('maximized');
    const ws = this.wm.bounds();
    this.setGeometry({ x: 0, y: 0, w: ws.width, h: ws.height });
    this.btnMax.innerHTML = ICON_RESTORE;
    this.btnMax.title = 'Restore';
    this.wm.emit('change', this);
  }

  tile(side) {
    if (this.state === 'normal') this._saved = this.geometry();
    const ws = this.wm.bounds();
    this.state = side === 'left' ? 'tiled-left' : 'tiled-right';
    this.el.classList.remove('maximized');
    this.setGeometry({ x: side === 'left' ? 0 : Math.floor(ws.width / 2), y: 0, w: Math.ceil(ws.width / 2), h: ws.height });
    this.btnMax.innerHTML = ICON_MAX;
    this.wm.emit('change', this);
  }

  restore() {
    this.state = 'normal';
    this.el.classList.remove('maximized');
    if (this._saved) this.setGeometry(this._saved);
    this.btnMax.innerHTML = ICON_MAX;
    this.btnMax.title = 'Maximize';
    this.wm.emit('change', this);
  }

  async close(force = false) {
    if (this.closed) return true;
    if (!force) {
      for (const fn of this._beforeClose) {
        try {
          if ((await fn()) === false) return false;
        } catch (e) { console.error(e); }
      }
    }
    if (this.closed) return true; // (a close hook closed the window itself)
    this.closed = true;
    this.el.classList.add('closing');
    this.emit('close');
    setTimeout(() => this.el.remove(), 130);
    this.wm._onClose(this);
    return true;
  }

  showWindowMenu(x, y) {
    const max = this.state === 'maximized';
    showMenu([
      { label: 'Minimize', icon: null, action: () => this.minimize(), disabled: this.opts.minimizable === false },
      { label: max ? 'Unmaximize' : 'Maximize', action: () => this.toggleMaximize(), disabled: this.opts.resizable === false },
      { label: 'Tile left', action: () => this.tile('left'), disabled: this.opts.resizable === false },
      { label: 'Tile right', action: () => this.tile('right'), disabled: this.opts.resizable === false },
      { type: 'separator' },
      { label: 'Always on top', checked: !!this.alwaysOnTop, action: () => { this.alwaysOnTop = !this.alwaysOnTop; this.wm.focus(this); } },
      { type: 'separator' },
      { label: 'Close', shortcut: 'Alt+F4', action: () => this.close() },
    ], { x, y });
  }

  // -------------------------------------------------------------- move/resize
  _startMove(e) {
    if (e.button !== 0 || e.target.closest('.wm-btn, .wm-menu-btn')) return;
    e.preventDefault();
    const start = { mx: e.clientX, my: e.clientY, ...this.geometry() };
    const wsRect = this.wm.workspace.getBoundingClientRect();
    let moved = false;
    let snap = null;
    this.titlebar.setPointerCapture(e.pointerId);
    const onMove = (ev) => {
      const dx = ev.clientX - start.mx, dy = ev.clientY - start.my;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (!moved) {
        moved = true;
        document.body.classList.add('wm-dragging', 'wm-moving');
        if (this.state !== 'normal') {
          // Un-maximize while keeping the cursor at the same relative point.
          const saved = this._saved || { w: Math.min(900, start.w * 0.7), h: Math.min(650, start.h * 0.8) };
          const rel = (start.mx - wsRect.left - start.x) / start.w;
          this.state = 'normal';
          this.el.classList.remove('maximized');
          this.btnMax.innerHTML = ICON_MAX;
          start.w = saved.w; start.h = saved.h;
          start.x = start.mx - wsRect.left - rel * saved.w;
          start.y = 0;
          this.setGeometry({ w: saved.w, h: saved.h });
          this.wm.emit('change', this);
        }
      }
      const ws = this.wm.bounds();
      const nx = start.x + dx;
      const ny = clamp(start.y + dy, 0, ws.height - 30);
      this.setGeometry({ x: nx, y: ny });
      if (this.opts.resizable !== false) {
        const px = ev.clientX - wsRect.left, py = ev.clientY - wsRect.top;
        snap = py <= SNAP_EDGE ? 'max' : px <= SNAP_EDGE ? 'left' : px >= ws.width - SNAP_EDGE ? 'right' : null;
        this.wm._showSnap(snap);
      }
    };
    const onUp = () => {
      this.titlebar.removeEventListener('pointermove', onMove);
      this.titlebar.removeEventListener('pointerup', onUp);
      this.titlebar.removeEventListener('pointercancel', onUp);
      document.body.classList.remove('wm-dragging', 'wm-moving');
      this.wm._showSnap(null);
      if (moved && snap) {
        this._saved = { x: start.x, y: Math.max(0, start.y), w: start.w, h: start.h };
        if (snap === 'max') this.maximize(); else this.tile(snap);
      }
      if (moved) this.emit('moved', this.geometry());
    };
    this.titlebar.addEventListener('pointermove', onMove);
    this.titlebar.addEventListener('pointerup', onUp);
    this.titlebar.addEventListener('pointercancel', onUp);
  }

  _startResize(e, dir) {
    if (e.button !== 0 || this.state === 'maximized') return;
    e.preventDefault();
    e.stopPropagation();
    this.focus();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const start = { mx: e.clientX, my: e.clientY, ...this.geometry() };
    const minW = this.opts.minWidth || 220, minH = this.opts.minHeight || 120;
    document.body.classList.add('wm-dragging');
    this.state = 'normal';
    const onMove = (ev) => {
      const dx = ev.clientX - start.mx, dy = ev.clientY - start.my;
      let { x, y, w, h: hh } = start;
      if (dir.includes('e')) w = Math.max(minW, start.w + dx);
      if (dir.includes('s')) hh = Math.max(minH, start.h + dy);
      if (dir.includes('w')) { w = Math.max(minW, start.w - dx); x = start.x + (start.w - w); }
      if (dir.includes('n')) { hh = Math.max(minH, start.h - dy); y = Math.max(0, start.y + (start.h - hh)); }
      this.setGeometry({ x, y, w, h: hh });
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      document.body.classList.remove('wm-dragging');
      this.emit('resized', this.geometry());
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }
}

export class WindowManager extends Emitter {
  constructor(workspace) {
    super();
    this.workspace = workspace;
    this.windows = [];
    this.focusedWindow = null;
    this.z = 10;
    this.cascade = 0;
    this.snapPreview = h('div.wm-snap-preview.hidden');
    workspace.appendChild(this.snapPreview);
    window.addEventListener('resize', () => this._fitAll());
    document.addEventListener('keydown', (e) => {
      if (e.altKey && e.key === 'F4' && this.focusedWindow) { e.preventDefault(); this.focusedWindow.close(); }
    });
  }

  bounds() { return { width: this.workspace.clientWidth, height: this.workspace.clientHeight }; }

  /**
   * Open a new window.
   * opts: {appId, title, icon, width, height, x, y, minWidth, minHeight,
   *        resizable, minimizable, maximized, className, center}
   */
  open(opts = {}) {
    const win = new WMWindow(this, opts);
    const ws = this.bounds();
    const w = Math.min(opts.width || 800, ws.width - 20);
    const hh = Math.min(opts.height || 560, ws.height - 20);
    let x = opts.x, y = opts.y;
    if (x === undefined || y === undefined) {
      if (opts.center !== false && this.windows.length === 0) {
        x = (ws.width - w) / 2; y = Math.max(8, (ws.height - hh) / 2.4);
      } else {
        const step = (this.cascade++ % 8) * 28;
        x = Math.max(8, (ws.width - w) / 2 - 120 + step);
        y = Math.max(8, (ws.height - hh) / 3 - 40 + step);
      }
    }
    win.setGeometry({ x, y, w, h: hh });
    this.workspace.appendChild(win.el);
    this.windows.push(win);
    this.focus(win);
    requestAnimationFrame(() => requestAnimationFrame(() => win.el.classList.remove('opening')));
    if (opts.maximized) win.maximize();
    this.emit('open', win);
    return win;
  }

  focus(win) {
    if (!win || win.closed) return;
    if (this.focusedWindow !== win) {
      this.focusedWindow?.el.classList.remove('focused');
      this.focusedWindow?.emit('blur');
      this.focusedWindow = win;
      win.el.classList.add('focused');
      win.emit('focus');
    }
    const top = this.windows.filter(w => w.alwaysOnTop).length;
    win.el.style.zIndex = String(++this.z + (win.alwaysOnTop ? 10000 : 0));
    if (!win.alwaysOnTop && top) {
      for (const w of this.windows) if (w.alwaysOnTop) w.el.style.zIndex = String(++this.z + 10000);
    }
    this.emit('focus', win);
    this.emit('change', win);
  }

  _onMinimize(win) {
    if (this.focusedWindow === win) {
      win.el.classList.remove('focused');
      this.focusedWindow = null;
      const next = this.topmost({ exclude: win });
      if (next) this.focus(next);
    }
    this.emit('change', win);
  }

  _onClose(win) {
    this.windows = this.windows.filter(w => w !== win);
    if (this.focusedWindow === win) {
      this.focusedWindow = null;
      const next = this.topmost();
      if (next) this.focus(next);
    }
    this.emit('close', win);
    this.emit('change', win);
  }

  topmost({ exclude } = {}) {
    return this.windows
      .filter(w => w !== exclude && !w.minimized && !w.closed)
      .sort((a, b) => Number(b.el.style.zIndex) - Number(a.el.style.zIndex))[0] || null;
  }

  byApp(appId) { return this.windows.filter(w => w.appId === appId && !w.closed); }

  get(id) { return this.windows.find(w => w.id === id); }

  minimizeAll() { for (const w of this.windows) w.minimize(); }

  _showSnap(where) {
    const p = this.snapPreview;
    if (!where) { p.classList.add('hidden'); return; }
    const ws = this.bounds();
    const g = where === 'max' ? [0, 0, ws.width, ws.height]
      : where === 'left' ? [0, 0, ws.width / 2, ws.height] : [ws.width / 2, 0, ws.width / 2, ws.height];
    Object.assign(p.style, { left: g[0] + 4 + 'px', top: g[1] + 4 + 'px', width: g[2] - 8 + 'px', height: g[3] - 8 + 'px' });
    p.classList.remove('hidden');
  }

  _fitAll() {
    const ws = this.bounds();
    for (const w of this.windows) {
      if (w.state === 'maximized') w.setGeometry({ x: 0, y: 0, w: ws.width, h: ws.height });
      else if (w.state.startsWith('tiled')) w.tile(w.state === 'tiled-left' ? 'left' : 'right');
      else {
        const g = w.geometry();
        w.setGeometry({ x: clamp(g.x, -g.w + 80, ws.width - 80), y: clamp(g.y, 0, ws.height - 30) });
      }
    }
  }
}
