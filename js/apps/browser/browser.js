// =============================================================================
// Web Browser (Firefox-like) for the simulated RE.
//
// * Tabs, back/forward, reload, URL bar, bookmarks toolbar.
// * Pages "load": the tab spins, a progress bar runs and the status line says
//   "Waiting for <host>…" before the site appears.
// * A fake DNS (routes.js) maps RE host names to the simulated sites in sites/.
//   Whitelisted real sites open in a tab of the person's own browser; any
//   other address shows the proxy's "not whitelisted" page.
// * file:/// shows folders, text, images, PDFs and HTML from the shared files.
//
// Sites talk to the browser through iframe.reBrowser (see sites/common/site.js).
// =============================================================================

import { h, clear, escapeHtml, sleep, formatBytes, lsDate, uid } from '../../core/util.js';
import { showMenu } from '../../core/menu.js';
import { kv } from '../../core/store.js';
import { mimeForPath, iconForPath } from '../../core/mime.js';
import { SITES, siteFor, isWhitelisted, parseTyped } from './routes.js';

const ICON = (n) => `assets/icons/actions/${n}.svg`;
const HOME_URL = () => `https://${window.RE.config.sites.home}/`;

export async function launch(ctx, args = {}) {
  const { re } = ctx;
  // a link opened from another app becomes a new tab of an open browser window
  if (!args.newWindow) {
    const existing = re.wm.byApp('web-browser')[0];
    if (existing && existing.browser) { existing.focus(); existing.browser.openTab(args.url || HOME_URL()); return existing; }
  }
  const appearAs = args.appearAs;
  const win = ctx.openWindow({ width: 1100, height: 720, minWidth: 480, minHeight: 300, title: 'Web Browser', className: 'app-browser' });
  const browser = new Browser(re, win);
  win.browser = browser;
  browser.openTab(args.url || HOME_URL());
  if (appearAs && appearAs.icon) win.setIcon(appearAs.icon);
  return win;
}

class Browser {
  constructor(re, win) {
    this.re = re;
    this.win = win;
    this.tabs = [];
    this.cur = null;
    this.zoom = kv.get('browser:zoom', 1);
    this._build();
  }

  _build() {
    const re = this.re;
    this.tabStrip = h('div.bw-tabs');
    this.newTabBtn = h('button.bw-newtab', { title: 'Open a new tab (Ctrl+T)', onclick: () => this.openTab(HOME_URL()) }, '+');
    const tabRow = h('div.bw-tabrow', this.tabStrip, this.newTabBtn);

    const nb = (icon, title, fn) => h('button.bw-nav', { title, onclick: fn }, h('img', { src: ICON(icon), alt: '' }));
    this.bBack = nb('go-previous', 'Go back one page (Alt+Left)', () => this.back());
    this.bFwd = nb('go-next', 'Go forward one page (Alt+Right)', () => this.forward());
    this.bReload = nb('view-refresh', 'Reload current page (Ctrl+R)', () => (this.cur?.loading ? this.stop() : this.reload()));
    this.bHome = nb('go-home', 'Home page', () => this.navigate(this.cur, HOME_URL()));
    this.lock = h('span.bw-lock', { title: 'Connection secure' });
    this.url = h('input.bw-url', { spellcheck: 'false', autocomplete: 'off' });
    this.url.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { this.navigate(this.cur, this.url.value); this.url.blur(); }
      if (e.key === 'Escape') { this.url.value = this.cur?.url || ''; this.url.blur(); }
    });
    this.url.addEventListener('focus', () => setTimeout(() => this.url.select(), 0));
    const urlWrap = h('div.bw-urlwrap', this.lock, this.url);
    this.menuBtn = nb('open-menu', 'Open application menu', (e) => this._appMenu(e.currentTarget));
    this.progress = h('div.bw-progress', h('div'));
    const navRow = h('div.bw-navrow', this.bBack, this.bFwd, this.bReload, this.bHome, urlWrap, this.menuBtn);

    const bm = (label, url, icon) => h('button.bw-bm', { title: url, onclick: () => this.navigate(this.cur, url) }, h('img', { src: icon, alt: '' }), label);
    const C = re.config;
    this.bookmarks = h('div.bw-bookmarks',
      bm('RE Home', HOME_URL(), 'assets/icons/apps/re-logo.svg'),
      bm(C.dataBrowser.productName, `https://${C.dataBrowser.host}/${C.dataBrowser.contextPath}/project/home/begin.view`, 'assets/icons/apps/labkeeper.svg'),
      bm('Research Registry', `https://${C.sites.registry}/`, 'assets/icons/apps/research-registry.svg'),
      bm('Airlock', `https://${C.sites.airlock}/`, 'assets/icons/apps/airlock.svg'),
      bm('Variant interpreter', `https://${C.sites.variantInterpreter}/`, 'assets/icons/apps/variant-interpreter.svg'),
      bm('Whitelisted sites', `https://${C.sites.home}/whitelist`, 'assets/icons/actions/bookmark.svg'),
      bm('RE Documentation', 'https://re-docs.genomicsengland.co.uk/', 'assets/icons/apps/documentation.svg'));

    this.views = h('div.bw-views');
    this.status = h('div.bw-status.hidden');
    this.content = h('div.bw-content', this.views, this.status);
    this.win.body.append(tabRow, navRow, this.progress, this.bookmarks, this.content);

    this.win.body.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 't') { e.preventDefault(); this.openTab(HOME_URL()); }
      else if (e.ctrlKey && e.key === 'w') { e.preventDefault(); this.closeTab(this.cur); }
      else if (e.ctrlKey && e.key === 'l') { e.preventDefault(); this.url.focus(); }
      else if ((e.ctrlKey && e.key === 'r') || e.key === 'F5') { e.preventDefault(); this.reload(); }
      else if (e.altKey && e.key === 'ArrowLeft') this.back();
      else if (e.altKey && e.key === 'ArrowRight') this.forward();
    });
    this.win.on('close', () => { for (const t of this.tabs) this._teardown(t); });
  }

  // ------------------------------------------------------------------ tabs
  openTab(url, { background = false } = {}) {
    const tab = { id: uid('tab'), url: '', title: 'New Tab', favicon: 'assets/icons/apps/web-browser.svg', history: [], index: -1, loading: false, view: h('div.bw-view') };
    tab.el = h('div.bw-tab', { title: '' }, h('span.bw-tab-ic', h('img', { src: tab.favicon, alt: '' })), h('span.bw-tab-title', tab.title), h('button.bw-tab-x', { title: 'Close tab' }, '×'));
    tab.el.addEventListener('click', (e) => { if (e.target.closest('.bw-tab-x')) this.closeTab(tab); else this.select(tab); });
    tab.el.addEventListener('auxclick', (e) => { if (e.button === 1) this.closeTab(tab); });
    this.tabStrip.appendChild(tab.el);
    this.views.appendChild(tab.view);
    this.tabs.push(tab);
    if (!background || !this.cur) this.select(tab);
    this.navigate(tab, url);
    return tab;
  }

  select(tab) {
    this.cur = tab;
    for (const t of this.tabs) { t.el.classList.toggle('active', t === tab); t.view.classList.toggle('hidden', t !== tab); }
    this._chrome();
  }

  closeTab(tab) {
    if (!tab) return;
    const i = this.tabs.indexOf(tab);
    this._teardown(tab);
    tab.el.remove(); tab.view.remove();
    this.tabs.splice(i, 1);
    if (!this.tabs.length) { this.win.close(true); return; }
    if (this.cur === tab) this.select(this.tabs[Math.min(i, this.tabs.length - 1)]);
  }

  _teardown(tab) { clearTimeout(tab.timer); tab.cancelled = true; if (tab.blobUrl) URL.revokeObjectURL(tab.blobUrl); }

  _chrome() {
    const t = this.cur;
    if (!t) return;
    if (document.activeElement !== this.url) this.url.value = t.url;
    this.bBack.disabled = t.index <= 0;
    this.bFwd.disabled = t.index >= t.history.length - 1;
    this.bReload.querySelector('img').src = ICON(t.loading ? 'process-stop' : 'view-refresh');
    this.bReload.title = t.loading ? 'Stop loading this page' : 'Reload current page (Ctrl+R)';
    const secure = /^https:/.test(t.url), local = /^(file|about):/.test(t.url);
    this.lock.className = 'bw-lock' + (secure ? ' secure' : local ? ' local' : ' insecure');
    this.lock.title = secure ? 'Connection secure' : local ? 'This is a local page' : 'Connection is not secure';
    this.win.setTitle(`${t.title || t.url} — ${this.re.config.browserName || 'Web Browser'}`);
    this.progress.classList.toggle('active', t.loading);
  }

  _setTab(tab, { title, favicon }) {
    if (title !== undefined) { tab.title = title; tab.el.querySelector('.bw-tab-title').textContent = title; tab.el.title = title; }
    if (favicon) { tab.favicon = favicon; tab.el.querySelector('.bw-tab-ic img').src = favicon; }
    if (tab === this.cur) this._chrome();
  }

  _status(text) {
    this.status.textContent = text || '';
    this.status.classList.toggle('hidden', !text);
  }

  _setLoading(tab, on) {
    tab.loading = on;
    tab.el.classList.toggle('loading', on);
    if (tab === this.cur) {
      this._chrome();
      const bar = this.progress.firstChild;
      if (on) { bar.style.transition = 'none'; bar.style.width = '0'; requestAnimationFrame(() => { bar.style.transition = 'width 1.2s ease-out'; bar.style.width = '70%'; }); }
      else { bar.style.transition = 'width .2s ease'; bar.style.width = '100%'; setTimeout(() => { if (!tab.loading) { bar.style.transition = 'none'; bar.style.width = '0'; } }, 250); }
    }
  }

  // ------------------------------------------------------------ history
  back() { const t = this.cur; if (t && t.index > 0) { t.index--; this.navigate(t, t.history[t.index], { fromHistory: true }); } }
  forward() { const t = this.cur; if (t && t.index < t.history.length - 1) { t.index++; this.navigate(t, t.history[t.index], { fromHistory: true }); } }
  reload() { const t = this.cur; if (t && t.url) this.navigate(t, t.url, { fromHistory: true, reload: true }); }
  stop() { const t = this.cur; if (!t) return; t.cancelled = true; clearTimeout(t.timer); this._setLoading(t, false); this._status(''); }

  _push(tab, url, replace) {
    if (replace && tab.index >= 0) tab.history[tab.index] = url;
    else { tab.history = tab.history.slice(0, tab.index + 1); tab.history.push(url); tab.index = tab.history.length - 1; }
    const hist = kv.get('browser:history', []);
    hist.unshift({ url, t: Date.now() });
    kv.set('browser:history', hist.slice(0, 200));
  }

  // ---------------------------------------------------------- navigation
  async navigate(tab, input, opts = {}) {
    if (!tab) return;
    const parsed = typeof input === 'string' ? parseTyped(input) : input;
    if (!parsed) return;
    if (parsed.isSearch) return this._page(tab, `about:neterror?search=${encodeURIComponent(parsed.query)}`, this._noSearchPage(parsed.query), { title: 'Search unavailable', opts });
    let url = parsed;
    if (url.protocol === 'http:' && siteFor(url.host)) url = new URL(url.href.replace(/^http:/, 'https:'));
    const href = url.href;
    tab.cancelled = false;
    clearTimeout(tab.timer);

    if (url.protocol === 'about:') {
      if (/^about:(home|newtab|blank)?$/.test(href) && href !== 'about:blank') return this.navigate(tab, HOME_URL(), opts);
      if (href === 'about:blank') return this._page(tab, href, h('div'), { title: 'New Tab', opts });
      return this._page(tab, href, this._errorPage('Page not found', `The address ${href} is not available in this browser.`), { title: 'Error', opts });
    }
    if (url.protocol === 'file:') return this._file(tab, decodeURIComponent(url.pathname), opts);
    if (!/^https?:$/.test(url.protocol)) return this._page(tab, href, this._errorPage('The address wasn’t understood', `The browser doesn’t know how to open this address, because the protocol (${url.protocol}) isn’t associated with any program.`), { title: 'Problem loading page', opts });

    const site = siteFor(url.host);
    const host = url.host;
    if (!site) {
      await this._fakeLoad(tab, host, 250, 700, opts);
      if (tab.cancelled) return;
      if (isWhitelisted(host)) return this._page(tab, href, this._externalPage(url), { title: host, favicon: 'assets/icons/apps/web-browser.svg', opts, noLoad: true });
      return this._page(tab, href, this._blockedPage(url), { title: 'Access denied', favicon: 'assets/icons/status/dialog-warning.svg', opts, noLoad: true });
    }
    // a simulated site
    const sameSite = tab.site === site && tab.iframe && !opts.reload;
    if (!opts.fromHistory || opts.reload) { /* recorded below */ }
    if (!opts.fromHistory) this._push(tab, href, opts.replace);
    tab.url = href;
    this._setTab(tab, { favicon: site.favicon });
    if (tab === this.cur) this._chrome();
    const [lo, hi] = sameSite ? [120, 450] : site.latency;
    await this._fakeLoad(tab, host, lo, hi, { quiet: false });
    if (tab.cancelled) return;
    const frag = site.hashRouting ? (url.hash || '#/') : '#' + (url.pathname + url.search + url.hash);
    if (sameSite && tab.iframe.contentWindow) {
      tab.suppressHash = true;
      tab.iframe.contentWindow.location.hash = frag.slice(1) ? frag : '#/';
      setTimeout(() => { tab.suppressHash = false; }, 50);
      this._finish(tab);
      return;
    }
    this._mountSite(tab, site, frag);
  }

  async _fakeLoad(tab, host, lo, hi, opts = {}) {
    this._setLoading(tab, true);
    const total = lo + Math.random() * (hi - lo);
    if (tab === this.cur) this._status(`Looking up ${host}…`);
    await sleep(total * 0.2);
    if (tab.cancelled) return;
    if (tab === this.cur) this._status(`Connecting to ${host}…`);
    await sleep(total * 0.25);
    if (tab.cancelled) return;
    if (tab === this.cur) this._status(`Waiting for ${host}…`);
    await sleep(total * 0.4);
    if (tab.cancelled) return;
    if (tab === this.cur) this._status(`Transferring data from ${host}…`);
    await sleep(total * 0.15);
  }

  _finish(tab) {
    this._setLoading(tab, false);
    if (tab === this.cur) this._status('');
  }

  _mountSite(tab, site, frag) {
    clear(tab.view);
    tab.site = site;
    const iframe = h('iframe.bw-frame', { src: `${site.page}${frag}`, title: site.title, allow: 'clipboard-read; clipboard-write; fullscreen' });
    tab.iframe = iframe;
    iframe.style.zoom = this.zoom;
    const self = this;
    iframe.reBrowser = {
      navigate: (u, o = {}) => (o.newTab ? self.openTab(u) : self.navigate(tab, u, o)),
      openTab: (u) => self.openTab(u),
      setTitle: (t) => self._setTab(tab, { title: t }),
      download: (name, data, type) => self.download(name, data, type),
      loading: (on) => self._setLoading(tab, on),
      get url() { return tab.url; },
      site: site.id,
    };
    iframe.addEventListener('load', () => {
      this._finish(tab);
      let doc;
      try { doc = iframe.contentDocument; } catch { doc = null; }
      if (!doc) return;
      const syncTitle = () => this._setTab(tab, { title: doc.title || site.title });
      syncTitle();
      const t = doc.querySelector('title');
      if (t) new MutationObserver(syncTitle).observe(t, { childList: true, characterData: true, subtree: true });
      else new MutationObserver(syncTitle).observe(doc.head || doc.documentElement, { childList: true, subtree: true });
      // the site changed its own location (a link, its router): the URL bar and history follow
      iframe.contentWindow.addEventListener('hashchange', () => {
        if (tab.suppressHash) return;
        const hsh = iframe.contentWindow.location.hash;
        const base = `https://${site.hosts[0]}`;
        const u = site.hashRouting ? `${base}/${hsh}` : `${base}${hsh.slice(1) || '/'}`;
        if (u !== tab.url) { this._push(tab, u); tab.url = u; if (tab === this.cur) this._chrome(); }
      });
      // links to other hosts open as navigations of this tab (sites/common/site.js does the same for its own links)
      doc.addEventListener('click', (e) => {
        const a = e.target.closest && e.target.closest('a[href]');
        if (!a || e.defaultPrevented) return;
        const href = a.getAttribute('href');
        if (!/^https?:\/\//i.test(href)) return;
        let target;
        try { target = new URL(href); } catch { return; }
        if (site.hosts.includes(target.host) && site.hashRouting) return;
        e.preventDefault();
        if (a.target === '_blank' || e.ctrlKey || e.metaKey) this.openTab(target.href); else this.navigate(tab, target.href);
      }, true);
      // a site's own window.open of a whitelisted address: a new tab here
      try {
        const w = iframe.contentWindow;
        const open0 = w.open.bind(w);
        w.open = (u, name, feat) => {
          try { const t2 = new URL(u, w.location.href); if (/^https?:$/.test(t2.protocol) && (siteFor(t2.host) || !isWhitelisted(t2.host))) { this.openTab(t2.href); return null; } } catch { /* fall through */ }
          return open0(u, name, feat);
        };
      } catch { /* cross-origin */ }
    });
    tab.view.appendChild(iframe);
  }

  /** an internal page (error pages, file views) */
  _page(tab, href, el, { title, favicon, opts = {}, noLoad = false } = {}) {
    if (!opts.fromHistory) this._push(tab, href, opts.replace);
    tab.url = href;
    tab.site = null; tab.iframe = null;
    clear(tab.view);
    tab.view.appendChild(h('div.bw-page', el));
    this._setTab(tab, { title: title || href, favicon: favicon || 'assets/icons/apps/web-browser.svg' });
    this._finish(tab);
  }

  // ------------------------------------------------------------- pages
  _errorPage(heading, text, extra) {
    return h('div.bw-error', h('div.bw-err-ic', '⚠'), h('h1', heading), h('p', text), extra || null);
  }

  _blockedPage(url) {
    const C = this.re.config;
    return h('div.bw-error.bw-blocked',
      h('div.bw-err-ic', '🛡'),
      h('h1', 'Access to this website is blocked'),
      h('p', h('b', url.host), ' is not on the Research Environment’s list of whitelisted websites.'),
      h('p', 'To protect participants’ data, the RE has no general internet access. Only a small number of reference resources can be reached from inside it, and data can only leave through the Airlock.'),
      h('div.bw-err-actions',
        h('button.gtk-btn.suggested', { onclick: () => this.navigate(this.cur, `https://${C.sites.home}/whitelist`) }, 'See the whitelisted websites'),
        h('button.gtk-btn', { onclick: () => this.back() }, 'Go Back')),
      h('p.muted', { style: { marginTop: '24px', fontSize: '12px' } }, `Proxy: squid (${C.environmentShortName} egress) · ERR_ACCESS_DENIED`));
  }

  _externalPage(url) {
    return h('div.bw-error.bw-external',
      h('div.bw-err-ic', '↗'),
      h('h1', `${url.host} is a whitelisted website`),
      h('p', 'In the real Research Environment this site opens here. It doesn’t allow itself to be shown inside another page, so the training simulator opens it in a new tab of your own browser instead.'),
      h('p.mono', url.href),
      h('div.bw-err-actions',
        h('a.gtk-btn.suggested', { href: url.href, target: '_blank', rel: 'noopener' }, 'Open in a new tab'),
        h('button.gtk-btn', { onclick: () => this.back() }, 'Go Back')));
  }

  _noSearchPage(q) {
    return this._errorPage('Hmm. We’re having trouble finding that site.', `There is no internet search inside the Research Environment, so “${q}” cannot be searched for. Type the address of a whitelisted website, or use the bookmarks.`,
      h('div.bw-err-actions', h('button.gtk-btn', { onclick: () => this.navigate(this.cur, `https://${this.re.config.sites.home}/whitelist`) }, 'Whitelisted websites')));
  }

  // -------------------------------------------------------------- files
  async _file(tab, path, opts) {
    const vfs = this.re.vfs;
    const href = 'file://' + path;
    if (!vfs.exists(path)) return this._page(tab, href, this._errorPage('File not found', `The file at ${path} could not be found.`), { title: 'Problem loading page', opts });
    const st = vfs.stat(path);
    if (st.type === 'dir' || vfs.isDir(path)) {
      const list = vfs.readdir(path, { withTypes: true }).filter(e => !e.name.startsWith('.'));
      const up = path === '/' ? null : vfs.dirname(path);
      const tbl = h('table.bw-index',
        h('thead', h('tr', h('th', 'Name'), h('th', 'Size'), h('th', 'Last Modified'))),
        h('tbody',
          up ? h('tr', h('td', h('a', { href: '#', onclick: (e) => { e.preventDefault(); this.navigate(tab, 'file://' + up); } }, '⬆ Up to higher level directory')), h('td'), h('td')) : null,
          ...list.map(e => {
            const p = (path === '/' ? '' : path) + '/' + e.name;
            return h('tr', h('td', h('a', { href: '#', onclick: (ev) => { ev.preventDefault(); this.navigate(tab, 'file://' + p); } }, h('img', { src: iconForPath(p, e.type === 'dir' || e.type === 'symlink-dir' ? 'dir' : 'file'), alt: '' }), e.name + (e.type === 'dir' || e.type === 'symlink-dir' ? '/' : ''))), h('td', e.type === 'dir' ? '' : formatBytes(e.size)), h('td', e.mtime ? new Date(e.mtime).toLocaleString() : ''));
          })));
      return this._page(tab, href, h('div.bw-dir', h('h1', `Index of ${path}`), tbl), { title: `Index of ${path}`, opts });
    }
    const mime = mimeForPath(path);
    try {
      if (mime === 'image/*') {
        const u = await vfs.urlFor(path);
        return this._page(tab, href, h('div.bw-image', h('img', { src: u, alt: vfs.basename(path) })), { title: vfs.basename(path), opts });
      }
      if (mime === 'application/pdf' || mime === 'text/html') {
        const bytes = await vfs.readFile(path);
        if (tab.blobUrl) URL.revokeObjectURL(tab.blobUrl);
        tab.blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime === 'application/pdf' ? 'application/pdf' : 'text/html' }));
        const fr = h('iframe.bw-frame', { src: tab.blobUrl, sandbox: mime === 'text/html' ? 'allow-scripts allow-popups' : undefined });
        return this._page(tab, href, fr, { title: vfs.basename(path), opts });
      }
      if (st.size > 4 * 1024 * 1024) return this._page(tab, href, this._errorPage('File too large to show', `${vfs.basename(path)} is ${formatBytes(st.size)}. Use the terminal to look at it (less, head, zcat …).`), { title: vfs.basename(path), opts });
      const bytes = await vfs.readFile(path);
      const text = new TextDecoder().decode(bytes);
      if (text.slice(0, 2048).includes('\u0000') || /\.(gz|bam|cram|bcf|bai|tbi|zip|sqlite)$/i.test(path)) {
        return this._page(tab, href, this._errorPage('This file cannot be shown', `${vfs.basename(path)} is a binary or compressed file. Use the terminal (zcat, samtools, bcftools …) or IGV.`), { title: vfs.basename(path), opts });
      }
      return this._page(tab, href, h('pre.bw-text', text), { title: vfs.basename(path), opts });
    } catch (e) {
      return this._page(tab, href, this._errorPage('File could not be read', e.message), { title: 'Problem loading page', opts });
    }
  }

  // ----------------------------------------------------------- downloads
  /** Save a download into ~/Downloads (inside the RE — nothing reaches the real computer). */
  async download(name, data, type) {
    const vfs = this.re.vfs;
    const dir = `${this.re.session.home}/Downloads`;
    if (!vfs.isDir(dir)) vfs.mkdir(dir, { recursive: true });
    let base = String(name || 'download').replace(/[/\\]/g, '_');
    let p = `${dir}/${base}`;
    let i = 1;
    const m = base.match(/^(.*?)(\.[^.]+)?$/);
    while (vfs.exists(p)) p = `${dir}/${m[1]}(${i++})${m[2] || ''}`;
    // (sites run in frames: their Blobs and arrays belong to another window, so instanceof cannot tell them)
    if (data && typeof data !== 'string') {
      if (typeof data.arrayBuffer === 'function') data = await data.arrayBuffer();
      if (ArrayBuffer.isView(data)) data = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      data = new Uint8Array(data);
    }
    vfs.writeFile(p, data);
    this.re.notify({ title: 'Download complete', body: `${vfs.basename(p)} was saved in ~/Downloads (inside the Research Environment).`, icon: 'assets/icons/places/folder-downloads.svg', onClick: () => this.re.apps.launchApp('file-manager', { path: dir, select: p }) });
    return p;
  }

  _appMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const hist = kv.get('browser:history', []).slice(0, 12);
    showMenu([
      { label: 'New Tab', shortcut: 'Ctrl+T', action: () => this.openTab(HOME_URL()) },
      { label: 'New Window', shortcut: 'Ctrl+N', action: () => this.re.apps.launchApp('web-browser', { newWindow: true }) },
      { type: 'separator' },
      { label: 'History', submenu: hist.length ? hist.map(x => ({ label: x.url.length > 70 ? x.url.slice(0, 67) + '…' : x.url, action: () => this.navigate(this.cur, x.url) })) : [{ label: 'No history yet', disabled: true }] },
      { label: 'Downloads', action: () => this.re.apps.launchApp('file-manager', { path: `${this.re.session.home}/Downloads` }) },
      { type: 'separator' },
      { label: 'Zoom In', action: () => this._zoom(0.1) },
      { label: 'Zoom Out', action: () => this._zoom(-0.1) },
      { label: `Reset Zoom (${Math.round(this.zoom * 100)}%)`, action: () => this._zoom(0) },
      { type: 'separator' },
      { label: 'Whitelisted Websites', action: () => this.navigate(this.cur, `https://${this.re.config.sites.home}/whitelist`) },
      { label: 'Close Window', action: () => this.win.close() },
    ], { x: r.right - 220, y: r.bottom });
  }

  _zoom(d) {
    this.zoom = d === 0 ? 1 : Math.max(0.5, Math.min(2, Math.round((this.zoom + d) * 10) / 10));
    kv.set('browser:zoom', this.zoom);
    for (const t of this.tabs) if (t.iframe) t.iframe.style.zoom = this.zoom;
  }
}
