// =============================================================================
// Desktop view of the shared file system.
//
// The single source of truth is the engine's MG.VFS (assets/js/vfs.js), used by
// the terminal, the WebAssembly tools, R and Python. This module wraps it with
// the small, promise-friendly API the desktop apps use (file manager, editors,
// dialogs, Airlock, IGV...). See js/engine/re-fs.js for how the RE layout is
// built inside MG.VFS.
// =============================================================================

import { bus } from './bus.js';
import { bytesToText } from './util.js';

const MG = () => window.MG;

export class FSError extends Error {
  constructor(code, path, msg) { super(msg || `${path}: ${code}`); this.code = code; this.path = path; }
}

function permString(e) {
  if (!e) return '----------';
  if (e.kind === 'link') return 'lrwxrwxrwx';
  if (MG().permText) return MG().permText(e);
  const t = e.kind === 'dir' ? 'd' : '-';
  return t + (e.readonly || e.protected ? 'r--r--r--' : 'rw-r--r--');
}

class DesktopVFS {
  constructor() { this._fs = null; this.user = 'user'; }

  /** Attach to the engine's file system (called once by js/engine/re-fs.js). */
  attach(mgfs, { user, bookmarks = [] } = {}) {
    this._fs = mgfs;
    this.user = user || this.user;
    this._bookmarks = bookmarks;
    mgfs.onChange((path, what) => bus.emit('fs:change', { path, kind: what }));
  }

  get engine() { return this._fs; }
  get home() { return this._fs.home; }

  // ------------------------------------------------------------- paths
  normalize(p, cwd) { return this._fs.resolve(p, cwd || this._fs.home); }
  dirname(p) { return MG().path.dirname(this.normalize(p)); }
  basename(p) { const n = this.normalize(p); return n === '/' ? '/' : MG().path.basename(n); }
  join(...parts) { return this.normalize(parts.join('/')); }
  extname(p) { const b = this.basename(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; }
  pretty(p) { return this._fs.pretty(this.normalize(p)); }

  _entry(p) { return this._fs.get(p); }

  exists(p) { try { return this._fs.exists(p); } catch { return false; } }
  isDir(p) { try { return this._fs.isDir(p); } catch { return false; } }
  isFile(p) { const e = this._raw(p); return !!e && e.kind !== 'dir' && e.kind !== 'link'; }

  /** entry without following the final link */
  _raw(p) {
    const abs = MG().path.norm(String(p).startsWith('~') ? this._fs.home + String(p).slice(1) : p);
    return this._fs.entries.get(abs) || this._fs.get(p);
  }

  isSymlink(p) {
    const abs = MG().path.norm(String(p).startsWith('~') ? this._fs.home + String(p).slice(1) : p);
    return this._fs.entries.get(abs)?.kind === 'link';
  }

  readlink(p) {
    const abs = MG().path.norm(String(p).startsWith('~') ? this._fs.home + String(p).slice(1) : p);
    const e = this._fs.entries.get(abs);
    if (!e || e.kind !== 'link') throw new FSError('EINVAL', p, `${p}: Invalid argument`);
    return e.to;
  }

  realpath(p) { return this.normalize(p); }

  stat(p) {
    const abs = this.normalize(p);
    const e = this._fs.entries.get(abs);
    if (!e) return null;
    const ro = !this.canWrite(abs);
    return {
      type: e.kind === 'dir' ? 'dir' : e.kind === 'link' ? 'symlink' : 'file',
      kind: e.kind,
      size: this._fs.size(e),
      mtime: e.mtime || Date.now(),
      readonly: ro,
      path: abs,
      owner: e.protected ? 'root' : this.user,
      group: e.protected ? 'root' : (this._fs.group || this.user),
      lazy: e.kind === 'url',
      url: e.kind === 'url' ? e.url : null,
      exec: e.mode === 'x',
      modeString: permString(e),
    };
  }

  /** Children of a folder. withTypes: [{name, type, size, mtime, link}] */
  readdir(p, { withTypes = false } = {}) {
    const abs = this.normalize(p);
    const e = this._fs.entries.get(abs);
    if (!e) throw new FSError('ENOENT', p, `${p}: No such file or directory`);
    if (e.kind !== 'dir') throw new FSError('ENOTDIR', p, `${p}: Not a directory`);
    const kids = this._fs.list(abs);
    if (!withTypes) return kids.map(k => k.name);
    return kids.map(k => {
      let type = k.entry.kind === 'dir' ? 'dir' : 'file';
      if (k.entry.kind === 'link') type = this._fs.isDir(k.entry.to) ? 'symlink-dir' : 'symlink';
      return { name: k.name, type, size: this._fs.size(k.entry), mtime: k.entry.mtime, link: k.entry.kind === 'link' ? k.entry.to : null, readonly: !!(k.entry.readonly || k.entry.protected) };
    });
  }

  walk(p, cb) {
    const abs = this.normalize(p);
    const pre = abs === '/' ? '/' : abs + '/';
    for (const [k, e] of this._fs.entries) if (k === abs || k.startsWith(pre)) cb(k, e);
  }

  du(p) { let n = 0; this.walk(p, (_, e) => { if (e.kind !== 'dir' && e.kind !== 'link') n += this._fs.size(e); }); return n; }

  // -------------------------------------------------------------- read
  async readFile(p, { encoding } = {}) {
    const e = this._entry(p);
    if (!e) throw new FSError('ENOENT', p, `${p}: No such file or directory`);
    if (e.kind === 'dir') throw new FSError('EISDIR', p, `${p}: Is a directory`);
    if (encoding === 'utf8') {
      if (e.kind === 'text') return e.text;
      return bytesToText(await this._fs.readBytes(p));
    }
    return this._fs.readBytes(p);
  }

  /** Synchronous read — only for files already held in memory as text. */
  readFileSync(p, { encoding } = {}) {
    const e = this._entry(p);
    if (!e) throw new FSError('ENOENT', p, `${p}: No such file or directory`);
    if (e.kind === 'text') return encoding === 'utf8' ? e.text : new TextEncoder().encode(e.text);
    throw new FSError('EAGAIN', p, `${p}: not loaded`);
  }

  async blobFor(p) { return this._fs.toBlob(p); }

  /** A URL a viewer can fetch (IGV, the browser): the hosted file itself when it is one, else an object URL. */
  async urlFor(p) {
    const e = this._entry(p);
    if (!e) throw new FSError('ENOENT', p, `${p}: No such file or directory`);
    if (e.kind === 'url') return e.url;
    return URL.createObjectURL(await this._fs.toBlob(p));
  }

  // ------------------------------------------------------------- write
  canRead(p) { return this.exists(p); }

  canWrite(p) {
    const fs = this._fs;
    let abs;
    try { abs = fs.resolve(p); } catch { return false; }
    const e = fs.entries.get(abs);
    if (e) {
      if (e.protected || e.readonly) return false;
      if (e.kind === 'dir') return true;
      return !fs.lockedDir(MG().path.dirname(abs)) || !e.protected;
    }
    return !fs.refusesNew(abs) && fs.isDir(MG().path.dirname(abs));
  }

  _deny(p) { throw new FSError('EACCES', p, `${this.pretty(p)}: Permission denied`); }

  writeFile(p, data, { append = false, exec } = {}) {
    const abs = this.normalize(p);
    const e = this._fs.entries.get(abs);
    if ((e && (e.protected || e.readonly)) || (!e && this._fs.refusesNew(abs))) this._deny(abs);
    if (typeof data === 'string') {
      if (append && e && e.kind === 'text') this._fs.appendText(abs, data);
      else if (e) this._fs.rewrite(abs, append && e.kind === 'text' ? e.text + data : data);
      else this._fs.writeText(abs, data, exec ? { mode: 'x' } : undefined);
    } else {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      const text = MG().looksText ? MG().looksText(abs, bytes) : null;
      if (text != null) return this.writeFile(abs, text, { append, exec });
      this._fs.put(abs, { kind: 'blob', blob: new Blob([bytes]), size: bytes.length, ...(exec ? { mode: 'x' } : {}) });
    }
    return abs;
  }

  appendFile(p, text) { return this.writeFile(p, text, { append: true }); }

  mkdir(p, { recursive = false } = {}) {
    const abs = this.normalize(p);
    if (this._fs.exists(abs)) {
      if (recursive && this._fs.isDir(abs)) return abs;
      throw new FSError('EEXIST', p, `${this.pretty(abs)}: File exists`);
    }
    if (!recursive && !this._fs.isDir(MG().path.dirname(abs))) throw new FSError('ENOENT', p, `${this.pretty(MG().path.dirname(abs))}: No such file or directory`);
    if (this._fs.refusesNew(abs)) this._deny(abs);
    return this._fs.mkdirp(abs);
  }

  rm(p, { recursive = false, force = false } = {}) {
    const abs = this.normalize(p);
    const e = this._fs.entries.get(abs);
    if (!e) { if (force) return; throw new FSError('ENOENT', p, `${this.pretty(abs)}: No such file or directory`); }
    if (e.protected || this._fs.lockedDir(MG().path.dirname(abs))) this._deny(abs);
    if (e.kind === 'dir' && !recursive && this._fs.list(abs).length) throw new FSError('ENOTEMPTY', p, `${this.pretty(abs)}: Directory not empty`);
    this._fs.remove(abs);
  }
  unlink(p) { return this.rm(p); }
  rmdir(p, { recursive = false } = {}) { return this.rm(p, { recursive }); }

  rename(a, b) {
    const A = this.normalize(a);
    let B = this.normalize(b);
    if (!this._fs.entries.has(A)) throw new FSError('ENOENT', a, `${this.pretty(A)}: No such file or directory`);
    if (this._fs.isDir(B) && !this._fs.isDir(A)) B = B + '/' + MG().path.basename(A);
    if (!this.canWrite(A) || (!this._fs.entries.has(B) && this._fs.refusesNew(B))) this._deny(A);
    if (!this._fs.rename(A, B)) throw new FSError('EINVAL', a, `cannot move '${this.pretty(A)}' to '${this.pretty(B)}'`);
    return B;
  }

  async copy(a, b, { recursive = false } = {}) {
    const A = this.normalize(a);
    let B = this.normalize(b);
    const e = this._fs.entries.get(A);
    if (!e) throw new FSError('ENOENT', a, `${this.pretty(A)}: No such file or directory`);
    if (this._fs.isDir(B)) B = B + '/' + MG().path.basename(A);
    if (e.kind === 'dir') {
      if (!recursive) throw new FSError('EISDIR', a, `-r not specified; omitting directory '${this.pretty(A)}'`);
      this.mkdir(B, { recursive: true });
      for (const k of this._fs.list(A)) await this.copy(k.path, B + '/' + k.name, { recursive: true });
      return B;
    }
    if (this._fs.refusesNew(B)) this._deny(B);
    if (e.kind === 'url') {
      // fetch the hosted file so the copy is the user's own
      const bytes = await this._fs.readBytes(A);
      this.writeFile(B, bytes);
    } else if (!this._fs.copy(A, B)) throw new FSError('EIO', a, `could not copy ${this.pretty(A)}`);
    return B;
  }

  chmod(p, { exec, readonly } = {}) {
    if (!this.canWrite(p) && !this._entry(p)?.readonly) this._deny(p);
    this._fs.chmod(p, { exec, readonly });
  }

  touch(p) {
    const abs = this.normalize(p);
    if (!this.canWrite(abs)) this._deny(abs);
    this._fs.touch(abs);
  }

  trash(p) {
    const abs = this.normalize(p);
    const dir = `${this._fs.home}/.local/share/Trash/files`;
    this._fs.mkdirp(dir);
    let dest = `${dir}/${MG().path.basename(abs)}`;
    let i = 1;
    while (this._fs.exists(dest)) dest = `${dir}/${MG().path.basename(abs)}.${i++}`;
    return this.rename(abs, dest);
  }

  bookmarks() { return (this._bookmarks || []).filter(b => this.exists(b.path)); }
}

export const vfs = new DesktopVFS();
