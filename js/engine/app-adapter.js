// =============================================================================
// MG.app for the desktop.
//
// The workbench engine asks its host page to "show the IDE tab", "open this
// file", "browse this URL" and so on. On the desktop those become windows:
// RStudio, Spyder, the text editor, IGV and the web browser.
// =============================================================================

import { CONFIG } from '../config.js';
import { addLocalSite } from '../apps/browser/routes.js';

export function installAppAdapter(RE) {
  const MG = window.MG;
  const app = MG.app;
  const launch = (id, args) => RE.apps.launchApp(id, args);

  const IDE_FILES = {
    rstudio: /\.(r|rmd|rmarkdown|qmd|rnw|rhistory|rprofile)$|(^|\/)\.rprofile$/i,
    spyder: /\.(py|pyw|pyi)$/i,
  };

  // the engine's notion of "tabs" → desktop applications
  const BENCH_APP = { terminal: 'terminal', editor: 'text-editor', igv: 'igv', ide: null, notebook: null, assistant: null };
  app.showWorkbench = async (name) => {
    const id = BENCH_APP[name];
    if (id) await launch(id, {});
  };
  app.tabBuilt = () => true;

  /** an IDE window (opened if need be) → a promise of the IDE object (MG.RStudioApp / MG.SpyderApp) */
  app.openIDE = async (name) => {
    const win = await launch(name, {});
    return win && win.ideReady ? win.ideReady : null;
  };
  app.ideFor = (path) => {
    const p = String(path || '');
    for (const [name, re] of Object.entries(IDE_FILES)) if (re.test(p)) return name;
    return null;
  };
  app.ideReady = async (name) => {
    const ide = await app.openIDE(name);
    if (ide && ide.restored) await ide.restored.catch(() => {});
    return ide;
  };
  app.openInRStudio = async (path, opts = {}) => { const rs = await app.ideReady('rstudio'); if (rs) return rs.openFile(app.fs.resolve(path), opts); };
  app.openInSpyder = async (path, opts = {}) => { const sp = await app.ideReady('spyder'); if (sp) return sp.openFile(app.fs.resolve(path), opts); };
  app.openInIDE = (path, opts = {}) => {
    const ide = app.ideFor(path);
    if (ide === 'rstudio') return app.openInRStudio(path, opts);
    if (ide === 'spyder') return app.openInSpyder(path, opts);
    return app.editFile(path, opts);
  };

  /** nano, vim, gedit … in the terminal → the desktop text editor */
  app.editFile = async (path, opts = {}) => {
    const p = app.fs.resolve(path);
    if (opts.create && !app.fs.exists(p)) {
      try { app.fs.writeText(p, ''); } catch (e) { RE.dialogs.error('Could not create the file', e.message); return; }
    }
    return launch('text-editor', { path: p });
  };

  /** open / xdg-open: the application a file belongs to */
  app.openFile = async (path, opts = {}) => {
    const p = app.fs.resolve(path);
    const { openPath } = await import('../shell/desktop.js');
    return openPath(RE, p, opts);
  };
  app.revealFile = (path) => launch('file-manager', { path: app.fs.resolve(path).replace(/\/[^/]*$/, '') || '/', select: app.fs.resolve(path) });

  /** R's browseURL(), RStudio's Viewer links: the web browser window */
  app.browse = async (url) => {
    url = String(url || '');
    if (/^https?:\/\//i.test(url)) return launch('web-browser', { url, newWindow: false });
    const p = app.fs.resolve(url.replace(/^file:\/\//, ''));
    return launch('web-browser', { url: 'file://' + p });
  };

  /** HTML for a sandboxed frame (RStudio's Viewer): with the RE's clipboard rules as its first script */
  app.frameHtml = (html) => (RE.clipboard ? RE.clipboard.isolateHtml(html) : html);

  /**
   * RStudio's Viewer ▸ Show in a new window: the desktop's web browser, as on the RE (not a tab of the computer's own
   * browser, which the RE's rules do not reach). v: the Viewer's {path, html, url, app (a Shiny app)}.
   */
  app.viewerWindow = async (v = {}) => {
    if (v.app && v.app.port && v.app.url) {
      const host = `127.0.0.1:${v.app.port}`;
      addLocalSite(host, { page: v.app.url, title: v.title || v.app.title });
      return launch('web-browser', { url: `http://${host}/` });
    }
    if (v.path) return launch('web-browser', { url: 'file://' + app.fs.resolve(v.path) });
    if (v.html != null) {
      // (as R does: an HTML page of the Viewer is written to R's temporary folder)
      const tag = Math.random().toString(36).slice(2, 8);
      const p = `/tmp/Rtmp${tag}/viewhtml${tag}/index.html`;
      app.fs.writeText(p, String(v.html));
      return launch('web-browser', { url: 'file://' + p });
    }
    if (v.url) return app.browse(v.url);
  };

  /**
   * A "download" from any of the engine's tools (the terminal's `download`, Save session, RStudio's file and plot
   * export, the project .zip buttons) is saved in ~/Downloads inside the Research Environment, not on the person's
   * computer: as in the RE, files leave only through an Airlock export. `data` may be a Blob, a typed array, an
   * ArrayBuffer or a string (and may belong to another realm – a site's frame). Returns the path it was saved at.
   */
  app.saveDownload = async (name, data, type) => {
    const vfs = RE.vfs;
    const dir = `${RE.session.home}/Downloads`;
    if (!vfs.isDir(dir)) vfs.mkdir(dir, { recursive: true });
    const base = String(name || 'download').replace(/[/\\]/g, '_');
    const m = base.match(/^(.*?)(\.[^.]+)?$/);
    let p = `${dir}/${base}`, i = 1;
    while (vfs.exists(p)) p = `${dir}/${m[1]}(${i++})${m[2] || ''}`;
    if (data && typeof data !== 'string') {
      if (typeof data.arrayBuffer === 'function') data = await data.arrayBuffer();
      data = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
    }
    vfs.writeFile(p, data);
    RE.notify({
      title: 'Saved in the Research Environment',
      body: `${vfs.basename(p)} was saved in ~/Downloads (inside the RE). Files leave the Research Environment only through an Airlock export request.`,
      icon: 'assets/icons/places/folder-downloads.svg',
      onClick: () => launch('file-manager', { path: dir, select: p }),
    });
    return p;
  };

  /** "Upload files from your computer": not possible in the RE – only through an Airlock import */
  app.pickFiles = async () => {
    await RE.dialogs.message({
      title: 'Upload', icon: 'warning',
      primary: 'Files cannot be uploaded into the Research Environment.',
      secondary: 'Everything that comes into the RE goes through an Airlock import request, which the Airlock team reviews. Use the Airlock application on the desktop to request an import.',
      buttons: [{ label: 'Close', value: false }, { label: 'Open the Airlock', value: true, kind: 'suggested' }],
    }).then((v) => v && launch('airlock', {}));
    return [];
  };

  /** the workbench help pages → the RE documentation (the real user guide) */
  app.showHelp = () => launch('documentation', {});

  // the genome browser (shell-wb.js's `igv` command uses MG.app.igv once it is shown)
  app.igvGoto = (locus) => app.igv && app.igv.goto(locus);
  app.igvLoad = (paths) => app.igv && app.igv.loadPaths(app.fs, paths);

  app.agentBusy = false;
  app.CONFIG = CONFIG;
}
