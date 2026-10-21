// Tiny publish/subscribe bus used for cross-app events
// (file changes, window changes, airlock/registry status updates, ...).

export class Emitter {
  constructor() { this._handlers = new Map(); }

  on(event, fn) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(fn);
    return () => this.off(event, fn);
  }

  once(event, fn) {
    const off = this.on(event, (...a) => { off(); fn(...a); });
    return off;
  }

  off(event, fn) { this._handlers.get(event)?.delete(fn); }

  emit(event, ...args) {
    for (const fn of [...(this._handlers.get(event) || [])]) {
      try { fn(...args); } catch (err) { console.error(`[bus] handler for "${event}" failed`, err); }
    }
    for (const fn of [...(this._handlers.get('*') || [])]) {
      try { fn(event, ...args); } catch (err) { console.error('[bus] wildcard handler failed', err); }
    }
  }
}

export const bus = new Emitter();
