// Persistence helpers.
//  - kv: small JSON settings in localStorage (namespaced)
//  - idb: key/value store in IndexedDB for larger blobs (user files, submissions)
// Everything degrades gracefully to memory when storage is unavailable
// (private windows, blocked site data).

import { CONFIG } from '../config.js';

const NS = CONFIG.storageNamespace;
const memory = new Map();

export const kv = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(`${NS}:${key}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return memory.has(key) ? memory.get(key) : fallback;
    }
  },
  set(key, value) {
    memory.set(key, value);
    try { localStorage.setItem(`${NS}:${key}`, JSON.stringify(value)); } catch { /* memory only */ }
  },
  remove(key) {
    memory.delete(key);
    try { localStorage.removeItem(`${NS}:${key}`); } catch { /* ignore */ }
  },
  clearAll() {
    memory.clear();
    try {
      Object.keys(localStorage).filter(k => k.startsWith(`${NS}:`)).forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
  },
};

let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(NS, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

const idbMemory = new Map();

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction('kv', mode);
    const store = t.objectStore('kv');
    let result;
    Promise.resolve(fn(store)).then(r => { result = r; });
    t.oncomplete = () => resolve(result?.result !== undefined ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const idb = {
  async get(key) {
    const db = await openDb();
    if (!db) return idbMemory.get(key);
    try {
      return await new Promise((resolve, reject) => {
        const r = db.transaction('kv').objectStore('kv').get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    } catch { return idbMemory.get(key); }
  },
  async set(key, value) {
    idbMemory.set(key, value);
    const db = await openDb();
    if (!db) return;
    try { await tx(db, 'readwrite', s => s.put(value, key)); } catch (e) { console.warn('[store] idb set failed', e); }
  },
  async del(key) {
    idbMemory.delete(key);
    const db = await openDb();
    if (!db) return;
    try { await tx(db, 'readwrite', s => s.delete(key)); } catch { /* ignore */ }
  },
  async keys(prefix = '') {
    const db = await openDb();
    if (!db) return [...idbMemory.keys()].filter(k => String(k).startsWith(prefix));
    try {
      const all = await new Promise((resolve, reject) => {
        const r = db.transaction('kv').objectStore('kv').getAllKeys();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      return all.filter(k => String(k).startsWith(prefix));
    } catch { return []; }
  },
  async clearAll() {
    idbMemory.clear();
    const db = await openDb();
    if (!db) return;
    try { await tx(db, 'readwrite', s => s.clear()); } catch { /* ignore */ }
  },
};
