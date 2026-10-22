// =============================================================================
// IGV — the desktop Integrative Genomics Viewer as it appears in the Research
// Environment: menu bar (File, Genomes, View, Tracks, Regions, Tools, Help),
// the tool bar (genome box, chromosome box, locus box, Go, navigation, region
// of interest, details pop-ups, zoom ticks) and the status bar, around igv.js
// (Broad Institute / UC San Diego, MIT licence) which draws the data.
//
// Files come from the simulated file system (/genomes, /re_gecip …): hosted
// files are read in pieces with HTTP range requests, files made in the
// simulator are handed to igv.js as File objects. The genome definitions of
// /pgen_public_data_resources/IGV point at genome files hosted by the IGV team.
//
// MG.app.igv = {goto, loadPaths, setGenome, loadGenomeFromFiles} lets the
// terminal's `igv` command and the other apps drive it.
// =============================================================================

import { h, clear, debounce, escapeHtml } from '../../core/util.js';
import { menubar, showMenu } from '../../core/menu.js';
import { kv } from '../../core/store.js';
import { loadEngine } from '../../engine/loader.js';
import { relayResize } from '../engine-host.js';
import { isWhitelisted } from '../browser/routes.js';

const IGV_VERSION = '2.17.4';
const DEMO = '/pgen_public_data_resources/reference_genomes/demo_chr21_windows';
const GENOME_DIR = '/pgen_public_data_resources/IGV';

/** Genomes in the genome box. */
const BUILTIN = [
  { id: 'training_chr21', name: 'GRCh38 chr21 windows (training)', fasta: `${DEMO}/reference.fa`, index: `${DEMO}/reference.fa.fai`, locus: 'chr21_10572001_10582000:4,600-4,760' },
  { id: 'hg38', name: 'Human (GRCh38/hg38)', json: `${GENOME_DIR}/hg38/hg38_local.json`, locus: 'chr21:33,031,597-33,041,570' },
  { id: 'hg19', name: 'Human (GRCh37/hg19)', json: `${GENOME_DIR}/hg19/hg19_local.json`, locus: 'chr21:34,403,906-34,413,879' },
];
/** Genomes "hosted" by the IGV team (Genomes ▸ Select Hosted Genome…), loaded by igv.js from igv.org. */
const HOSTED = [
  ['hg38', 'Human (GRCh38/hg38)'], ['hg19', 'Human (GRCh37/hg19)'], ['hs1', 'Human (T2T CHM13-v2.0/hs1)'],
  ['mm39', 'Mouse (GRCm39/mm39)'], ['mm10', 'Mouse (GRCm38/mm10)'], ['danRer11', 'Zebrafish (GRCz11/danRer11)'],
  ['dm6', 'D. melanogaster (BDGP Release 6/dm6)'], ['ce11', 'C. elegans (WBcel235/ce11)'], ['sacCer3', 'S. cerevisiae (sacCer3)'],
];
/** Servers IGV may reach from inside the RE, besides the whitelisted websites (the genome files). */
const IGV_HOSTS = ['igv-genepattern-org.s3.amazonaws.com', 'igv.genepattern.org', 's3.amazonaws.com', 'hgdownload.soe.ucsc.edu', 'igv.org', 'data.broadinstitute.org'];

const TRACK_FILE = /\.(bam|cram|vcf|vcf\.gz|bcf|bed|bed\.gz|gff|gff3|gff\.gz|gff3\.gz|gtf|gtf\.gz|bedgraph|bedgraph\.gz|bdg|wig|wig\.gz|bw|bigwig|bb|bigbed|seg|narrowpeak|broadpeak|gappedpeak|maf|mut|tdf|bedpe|interact)$/i;
const GENOME_FILE = /\.(json|fa|fasta|fna|fa\.gz|fasta\.gz|2bit|gbk|genome)$/i;

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const ICON = {
  home: '<svg viewBox="0 0 16 16"><path d="M2 8.2 8 2.6l6 5.6" fill="none" stroke="#3b5d8f" stroke-width="1.6"/><path d="M3.6 7.4V14h3.2v-4h2.4v4h3.2V7.4" fill="#e9eef6" stroke="#3b5d8f" stroke-width="1.2"/></svg>',
  back: '<svg viewBox="0 0 16 16"><path d="M10.5 2.5 5 8l5.5 5.5" fill="none" stroke="#2e7d32" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  fwd: '<svg viewBox="0 0 16 16"><path d="M5.5 2.5 11 8l-5.5 5.5" fill="none" stroke="#2e7d32" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  refresh: '<svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.6-3.7" fill="none" stroke="#3b5d8f" stroke-width="1.7"/><path d="M12.6 1.6v3.6H9" fill="none" stroke="#3b5d8f" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  roi: '<svg viewBox="0 0 16 16"><rect x="1.5" y="3" width="13" height="10" fill="#fff" stroke="#666"/><rect x="5" y="3" width="5" height="10" fill="#7fa6e0" stroke="#3b5d8f"/></svg>',
  fit: '<svg viewBox="0 0 16 16"><rect x="1.5" y="1.5" width="13" height="13" fill="#fff" stroke="#666"/><path d="M8 3.5v9M5.5 6 8 3.5 10.5 6M5.5 10 8 12.5 10.5 10" fill="none" stroke="#3b5d8f" stroke-width="1.4"/></svg>',
  popup: '<svg viewBox="0 0 16 16"><path d="M2 2.5h12v8H7l-3.5 3v-3H2z" fill="#ffe680" stroke="#b18c00" stroke-linejoin="round"/></svg>',
  zoomOut: '<svg viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="4.6" fill="#fff" stroke="#555" stroke-width="1.4"/><path d="M4.2 6.5h4.6M10 10l4 4" stroke="#555" stroke-width="1.6"/></svg>',
  zoomIn: '<svg viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="4.6" fill="#fff" stroke="#555" stroke-width="1.4"/><path d="M4.2 6.5h4.6M6.5 4.2v4.6M10 10l4 4" stroke="#555" stroke-width="1.6"/></svg>',
};

export async function launch(ctx, args = {}) {
  const { re } = ctx;
  const win = ctx.openWindow({ width: 1220, height: 780, minWidth: 640, minHeight: 380, title: 'IGV', className: 'app-igv' });
  const igvApp = new IGVDesktop(re, win);
  win.igvApp = igvApp;
  win.igvReady = igvApp.start(args);
  win.on('relaunch', (a) => { win.igvReady.then(() => igvApp.handleArgs(a || {})).catch(() => {}); });
  return win;
}

class IGVDesktop {
  constructor(re, win) {
    this.re = re;
    this.win = win;
    this.browser = null;
    this.genome = null;
    this.loaded = []; // tracks loaded from files: {name, path, indexPath, url, format, type}
    this.rois = []; // {chr, start, end, description}
    this.hist = [];
    this.hIdx = -1;
    this.navigating = false;
    this.popupMode = kv.get('igv:popup', 'click');
    this.prefs = { centerLine: false, cursorGuide: false, trackNames: true, ...kv.get('igv:prefs', {}) };
    this.snapshotDir = null;
    this.sessionPath = null;
    this._build();
  }

  // ===================================================================== UI
  _build() {
    this.bar = menubar(this._menus());
    this.genomeSel = h('select.igv-combo.igv-genome', { title: 'Select a genome' });
    this.genomeSel.addEventListener('change', () => this._genomeChosen());
    this.chrSel = h('select.igv-combo.igv-chr', { title: 'Select a chromosome to view' });
    this.chrSel.addEventListener('change', () => this.goto(this.chrSel.value === 'All' ? 'all' : this.chrSel.value));
    this.locusBox = h('input.igv-locus', { spellcheck: 'false', title: 'Enter a gene, a locus (chr1:1,000-2,000) or several loci separated by spaces' });
    this.locusBox.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.goto(this.locusBox.value); });
    const go = h('button.igv-go', { title: 'Jump to the gene or locus typed in the box', onclick: () => this.goto(this.locusBox.value) }, 'Go');
    const tb = (icon, title, fn, extra = '') => {
      const b = h('button.igv-tool' + extra, { title, html: ICON[icon] });
      b.addEventListener('click', fn);
      return b;
    };
    this.backBtn = tb('back', 'Go back', () => this._history(-1));
    this.fwdBtn = tb('fwd', 'Go forward', () => this._history(1));
    this.roiBtn = tb('roi', 'Define a region of interest', () => this._startRoi());
    this.popupBtn = tb('popup', 'Select the behaviour of the details pop-up', (e) => this._popupMenu(e.currentTarget));
    this.ticks = h('div.igv-ticks');
    const toolbar = h('div.igv-toolbar',
      this.genomeSel, this.chrSel, this.locusBox, go,
      h('span.igv-sep'),
      tb('home', 'Jump to the whole genome view', () => this._home()), this.backBtn, this.fwdBtn,
      tb('refresh', 'Reload tracks and refresh the screen', () => this._refresh()),
      h('span.igv-sep'),
      this.roiBtn, tb('fit', 'Resize tracks to fit in the window', () => this.fitToWindow()), this.popupBtn,
      h('span.igv-grow'),
      tb('zoomOut', 'Zoom out', () => this.zoom(-1), '.igv-zbtn'), this.ticks, tb('zoomIn', 'Zoom in', () => this.zoom(1), '.igv-zbtn'));
    this.host = h('div.igv-dhost', { tabindex: '-1' });
    this.msgEl = h('span.igv-st-msg');
    this.posEl = h('span.igv-st-pos');
    this.memEl = h('span.igv-st-mem');
    const status = h('div.igv-status', this.msgEl, this.posEl, this.memEl);
    this.win.body.append(this.bar.el, toolbar, h('div.igv-main', this.host), status);
    this._wireHost();
    this._memTimer = setInterval(() => this._memory(), 4000);
    this._memory();
    this.win.on('close', () => { clearInterval(this._memTimer); this._dispose(); if (window.MG?.app?.igv === this.api) window.MG.app.igv = null; });
    relayResize(this.win, () => this._ticks());
    this._navState();
  }

  _splash(text) {
    const msg = h('div.igv-splash-msg', text);
    const el = h('div.igv-splash',
      h('div.igv-splash-box',
        h('div.igv-splash-logo', h('span', 'IGV')),
        h('div.igv-splash-title', 'Integrative Genomics Viewer'),
        h('div.igv-splash-ver', `Version ${IGV_VERSION}`),
        h('div.igv-splash-bar', h('div')),
        msg));
    this.win.body.appendChild(el);
    return { set: (t) => { msg.textContent = t; }, remove: () => el.remove() };
  }

  status(text) { this.msgEl.textContent = text || ''; }

  _memory() {
    const base = 380 + this.loaded.length * 90;
    this.memEl.textContent = `${base + Math.round(Math.random() * 120)}M of 7,920M`;
  }

  _menus() {
    const re = this.re;
    const has = () => !!this.browser;
    return [
      { label: 'File', items: () => [
        { label: 'Load from File...', action: () => this.loadFromFileDialog() },
        { label: 'Load from URL...', action: () => this.loadFromUrlDialog() },
        { label: 'Load from Server...', action: () => re.dialogs.info('Load from Server is not available in the Research Environment.', 'The IGV data servers cannot be reached from inside the RE. Load files with File ▸ Load from File... instead (find their paths in the genome_file_paths_and_types table of the data browser).', 'IGV') },
        { label: 'Recent Files', submenu: this._recentItems() },
        { type: 'separator' },
        { label: 'New Session...', action: () => this.newSession(true) },
        { label: 'Open Session...', action: () => this.openSessionDialog() },
        { label: 'Save Session...', disabled: !has(), action: () => this.saveSessionDialog() },
        { label: 'Reload Session', disabled: !this.sessionPath, action: () => this.openSession(this.sessionPath) },
        { type: 'separator' },
        { label: 'Save PNG Image...', disabled: !has(), action: () => this.saveImageDialog('png') },
        { label: 'Save SVG Image...', disabled: !has(), action: () => this.saveImageDialog('svg') },
        { type: 'separator' },
        { label: 'Exit', action: () => this.win.close() },
      ] },
      { label: 'Genomes', items: () => [
        { label: 'Load Genome from File...', action: () => this.loadGenomeDialog() },
        { label: 'Load Genome from URL...', action: () => this.loadGenomeUrlDialog() },
        { label: 'Select Hosted Genome...', action: () => this.hostedGenomeDialog() },
        { type: 'separator' },
        { label: 'Remove Genomes...', disabled: !this._userGenomes().length, action: () => this.removeGenomesDialog() },
      ] },
      { label: 'View', items: () => [
        { label: 'Preferences...', action: () => this.preferencesDialog() },
        { type: 'separator' },
        { label: 'Show Center Line', checked: this.prefs.centerLine, action: () => this._pref('centerLine', !this.prefs.centerLine) },
        { label: 'Show Cursor Guide', checked: this.prefs.cursorGuide, action: () => this._pref('cursorGuide', !this.prefs.cursorGuide) },
        { label: 'Show Track Names', checked: this.prefs.trackNames, action: () => this._pref('trackNames', !this.prefs.trackNames) },
        { type: 'separator' },
        { label: 'Color Legends...', disabled: true },
        { label: 'Go to', submenu: [
          { label: 'Back', disabled: this.hIdx <= 0, action: () => this._history(-1) },
          { label: 'Forward', disabled: this.hIdx >= this.hist.length - 1, action: () => this._history(1) },
        ] },
      ] },
      { label: 'Tracks', items: () => [
        { label: 'Sort Tracks...', disabled: true },
        { label: 'Group Tracks...', disabled: true },
        { label: 'Filter Tracks...', disabled: true },
        { type: 'separator' },
        { label: 'Fit Data to Window', disabled: !has(), action: () => this.fitToWindow() },
        { label: 'Set Track Height...', disabled: !has(), action: () => this.trackHeightDialog() },
        { type: 'separator' },
        { label: 'Expand All Tracks', disabled: !has(), action: () => this.displayMode('EXPANDED') },
        { label: 'Squish All Tracks', disabled: !has(), action: () => this.displayMode('SQUISHED') },
        { label: 'Collapse All Tracks', disabled: !has(), action: () => this.displayMode('COLLAPSED') },
      ] },
      { label: 'Regions', items: () => [
        { label: 'Region Navigator...', disabled: !has(), action: () => this.regionNavigator() },
        { label: 'Gene Lists...', disabled: true },
        { type: 'separator' },
        { label: 'Export Regions...', disabled: !this.rois.length, action: () => this.exportRegionsDialog() },
        { label: 'Import Regions...', disabled: !has(), action: () => this.importRegionsDialog() },
        { type: 'separator' },
        { label: 'Clear Regions...', disabled: !this.rois.length, action: async () => { if (await re.dialogs.confirm('Clear all regions of interest?', '', { title: 'IGV', ok: 'Clear' })) this.setRois([]); } },
      ] },
      { label: 'Tools', items: () => [
        { label: 'Run Batch Script...', action: () => this.batchDialog() },
        { type: 'separator' },
        { label: 'BLAT', disabled: true },
        { label: 'Combine Data Tracks', disabled: true },
      ] },
      { label: 'Help', items: () => [
        { label: 'User Guide...', action: () => re.apps.launchApp('web-browser', { url: 'https://igv.org/doc/desktop/' }) },
        { label: 'Help Forum...', action: () => re.apps.launchApp('web-browser', { url: 'https://igv.org/doc/desktop/#Support/' }) },
        { label: 'RE documentation: IGV', action: () => re.apps.launchApp('web-browser', { url: 'https://re-docs.genomicsengland.co.uk/igv/' }) },
        { type: 'separator' },
        { label: 'About IGV...', action: () => this.about() },
      ] },
    ];
  }

  _recentItems() {
    const list = kv.get('igv:recent', []);
    if (!list.length) return [{ label: '(no recent files)', disabled: true }];
    return [...list.map(p => ({ label: p, action: () => this.loadPaths([p]) })), { type: 'separator' }, { label: 'Clear Recent Files', action: () => kv.set('igv:recent', []) }];
  }

  _remember(p) {
    const list = kv.get('igv:recent', []).filter(x => x !== p);
    list.unshift(p);
    kv.set('igv:recent', list.slice(0, 10));
  }

  _wireHost() {
    // the position under the mouse, as the status bar of desktop IGV shows it
    this.host.addEventListener('mousemove', (e) => {
      const pos = this._positionAt(e);
      this.posEl.textContent = pos ? `${pos.chr}:${fmt(pos.bp)}` : '';
    });
    this.host.addEventListener('mouseleave', () => { this.posEl.textContent = ''; });
    // defining a region of interest: two clicks in the data panel
    this.host.addEventListener('click', (e) => {
      if (!this.roiPick) return;
      const pos = this._positionAt(e);
      if (!pos) return;
      e.stopPropagation();
      e.preventDefault();
      if (!this.roiPick.first) {
        this.roiPick.first = pos;
        this.status('Click the end of the region of interest');
        return;
      }
      const a = this.roiPick.first;
      this.roiPick = null;
      this.host.classList.remove('igv-picking');
      this.roiBtn.classList.remove('active');
      this.status('');
      if (a.chr !== pos.chr) return;
      const start = Math.min(a.bp, pos.bp), end = Math.max(a.bp, pos.bp);
      this.setRois([...this.rois, { chr: pos.chr, start: start - 1, end, description: '' }]);
    }, true);
    this.host.addEventListener('keydown', (e) => {
      const t = (e.composedPath && e.composedPath()[0]) || e.target;
      if (t && t.closest && t.closest('input, textarea, select')) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); this.zoom(1); }
      else if (e.key === '-') { e.preventDefault(); this.zoom(-1); }
      else if (e.key === 'Escape' && this.roiPick) { this.roiPick = null; this.host.classList.remove('igv-picking'); this.roiBtn.classList.remove('active'); this.status(''); }
    });
  }

  _positionAt(e) {
    const b = this.browser;
    if (!b || !b.referenceFrameList) return null;
    // (igv.js draws inside a shadow root: the event's own target is found through its composed path)
    const t = (e.composedPath && e.composedPath()[0]) || e.target;
    const vp = t && t.closest && t.closest('.igv-viewport');
    if (!vp) return null;
    const frames = b.referenceFrameList;
    let idx = 0;
    if (frames.length > 1) {
      const col = vp.parentElement;
      const cols = col && col.parentElement ? [...col.parentElement.children].filter(c => c.classList.contains(col.classList[0])) : [];
      idx = Math.max(0, Math.min(frames.length - 1, cols.indexOf(col)));
    }
    const rf = frames[idx];
    if (!rf || !rf.chr || rf.chr.toLowerCase() === 'all') return null;
    const rect = vp.getBoundingClientRect();
    const bp = Math.floor(rf.start + (e.clientX - rect.left) * rf.bpPerPixel) + 1;
    return { chr: rf.chr, bp: Math.max(1, bp) };
  }

  // ================================================================== start
  async start(args = {}) {
    const splash = this._splash('Initializing...');
    const t0 = Date.now();
    try {
      splash.set('Loading igv.js...');
      await loadEngine('igv');
      if (!window.igv) throw new Error('igv.js did not load.');
      this._fillGenomes();
      const want = args.genome || kv.get('igv:genome', 'training_chr21');
      splash.set('Loading genome...');
      const g = this._genomeFor(want) || this._genomeFor('training_chr21');
      try {
        await this._createBrowser(g, args.locus);
      } catch (e) {
        console.error(e);
        if (g.id !== 'training_chr21') {
          splash.set('Could not load the genome, loading the training genome...');
          await this._createBrowser(this._genomeFor('training_chr21'), args.locus);
          this.re.dialogs.error(`Error loading genome: ${g.name}`, String(e.message || e), 'IGV');
        } else throw e;
      }
    } catch (e) {
      console.error(e);
      splash.remove();
      this.host.appendChild(h('div.igv-failed', h('b', 'IGV could not start.'), h('div', String(e.message || e)),
        h('button.gtk-btn', { onclick: () => location.reload() }, 'Reload the page')));
      throw e;
    }
    const wait = 900 - (Date.now() - t0);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    splash.remove();
    this.api = {
      goto: (locus, genome) => this.goto(locus, genome),
      loadPaths: (fs, paths) => this.loadPaths(Array.isArray(fs) ? fs : paths),
      setGenome: (id) => this.setGenome(id),
      loadGenomeFromFiles: (fs, p) => this.setGenome(p),
      igvApp: this,
    };
    if (window.MG?.app) window.MG.app.igv = this.api;
    await this.handleArgs({ ...args, genome: undefined, locus: undefined });
    return this;
  }

  async handleArgs(a = {}) {
    if (a.genome && (!this.genome || (this._genomeFor(a.genome)?.id !== this.genome.id))) await this.setGenome(a.genome);
    if (a.session) await this.openSession(a.session);
    if (a.paths && a.paths.length) await this.loadPaths(a.paths);
    if (a.locus) await this.goto(a.locus);
    if (a.batch) await this.runBatch(a.batch);
    this.win.focus();
  }

  // ================================================================ genomes
  _userGenomes() { return kv.get('igv:genomes', []); }

  _genomeFor(ref) {
    if (!ref) return null;
    if (typeof ref === 'object') return ref;
    const all = [...BUILTIN, ...this._userGenomes()];
    const hit = all.find(g => g.id === ref || g.json === ref || g.fasta === ref || g.url === ref);
    if (hit) return hit;
    if (/^https?:\/\//i.test(ref)) return { id: ref, name: ref.split('/').pop(), url: ref };
    if (ref.startsWith('/') || ref.startsWith('~')) {
      const p = this.re.vfs.normalize(ref);
      if (/\.json$/i.test(p)) return { id: p, name: p.split('/').pop(), json: p };
      return { id: p, name: p.split('/').pop(), fasta: p, index: p + '.fai' };
    }
    const hosted = HOSTED.find(([id]) => id === ref);
    if (hosted) return { id: 'hosted:' + hosted[0], name: hosted[1] + ' (hosted)', hosted: hosted[0] };
    return null;
  }

  _fillGenomes() {
    const S = this.genomeSel;
    clear(S);
    for (const g of BUILTIN) S.appendChild(h('option', { value: g.id }, g.name));
    const mine = this._userGenomes();
    if (mine.length) {
      S.appendChild(h('option', { disabled: true }, '──────────────'));
      for (const g of mine) S.appendChild(h('option', { value: g.id }, g.name));
    }
    S.appendChild(h('option', { disabled: true }, '──────────────'));
    S.appendChild(h('option', { value: '__file' }, 'Load Genome from File...'));
    S.appendChild(h('option', { value: '__hosted' }, 'More...'));
    if (this.genome) {
      if (![...S.options].some(o => o.value === this.genome.id)) S.insertBefore(h('option', { value: this.genome.id }, this.genome.name), S.firstChild);
      S.value = this.genome.id;
    }
  }

  async _genomeChosen() {
    const v = this.genomeSel.value;
    if (v === '__file') { this._fillGenomes(); return this.loadGenomeDialog(); }
    if (v === '__hosted') { this._fillGenomes(); return this.hostedGenomeDialog(); }
    return this.setGenome(v);
  }

  /** igv.js's configuration of a genome. */
  async _genomeConfig(g) {
    const vfs = this.re.vfs;
    if (g.hosted) return { genome: g.hosted };
    if (g.reference) return { reference: { ...g.reference } };
    if (g.url) {
      this._checkHost(g.url);
      return { genome: g.url };
    }
    if (g.json) {
      if (!vfs.exists(g.json)) throw new Error(`File not found: ${g.json}`);
      const text = await vfs.readFile(g.json, { encoding: 'utf8' });
      let obj;
      try { obj = JSON.parse(text); } catch (e) { throw new Error(`${g.json} is not a valid genome definition (JSON): ${e.message}`); }
      const dir = vfs.dirname(g.json);
      const fix = async (u) => {
        if (!u || typeof u !== 'string') return u;
        if (/^https?:\/\//i.test(u)) { this._checkHost(u); return u; }
        return this._fileUrl(u.startsWith('/') ? u : `${dir}/${u}`);
      };
      for (const k of ['fastaURL', 'indexURL', 'cytobandURL', 'aliasURL', 'twoBitURL', 'compressedIndexURL', 'chromSizesURL']) if (obj[k]) obj[k] = await fix(obj[k]);
      for (const t of obj.tracks || []) { if (t.url) t.url = await fix(t.url); if (t.indexURL) t.indexURL = await fix(t.indexURL); }
      if (!g.name || g.name === g.json.split('/').pop()) g.name = obj.name || g.name;
      return { reference: obj };
    }
    if (g.fasta) {
      if (!vfs.exists(g.fasta)) throw new Error(`File not found: ${g.fasta}`);
      const idx = [g.index, g.fasta + '.fai'].find(p => p && vfs.exists(p));
      if (/\.gz$/i.test(g.fasta)) throw new Error('A gzipped FASTA file needs to be bgzipped and indexed (samtools faidx). Use an uncompressed copy instead.');
      if (!idx) throw new Error(`Index file not found: ${g.fasta}.fai\nCreate it with  samtools faidx ${g.fasta}  (in the Terminal, after  module load samtools/1.21).`);
      return { reference: { id: g.id, name: g.name, fastaURL: await this._fileUrl(g.fasta), indexURL: await this._fileUrl(idx) } };
    }
    throw new Error('Unknown genome.');
  }

  /** IGV inside the RE reaches only its genome servers and the whitelisted websites. */
  _checkHost(u) {
    let host = '';
    try { host = new URL(u).host; } catch { return; }
    if (host === location.host || IGV_HOSTS.includes(host) || isWhitelisted(host)) return;
    throw new Error(`Connection refused: ${host}\nIGV in the Research Environment can only reach whitelisted servers.`);
  }

  async _fileUrl(p) {
    const fs = window.MG.app.fs;
    const e = fs.get(p);
    if (!e) throw new Error(`File not found: ${p}`);
    if (e.kind === 'dir') throw new Error(`${p} is a directory`);
    const name = p.split('/').pop();
    if (e.kind === 'url') return igvAddress(e.url);
    if (e.kind === 'blob') return e.blob instanceof File ? e.blob : new File([e.blob], name);
    return new File([await fs.toBlob(p)], name);
  }

  async _createBrowser(g, locus) {
    const cfg = await this._genomeConfig(g);
    this._dispose();
    const opts = {
      ...cfg,
      locus: locus || g.locus || undefined,
      showNavigation: false,
      showSVGButton: false,
      showControls: false,
      showChromosomeWidget: false,
      showCenterGuide: this.prefs.centerLine,
      showCursorGuide: this.prefs.cursorGuide,
      showTrackLabels: this.prefs.trackNames,
      showTrackLabelButton: false,
      // (desktop IGV has no gear buttons: a track's menu opens with a right-click on the track)
      showGearColumn: false,
      queryParametersSupported: false,
    };
    let timer;
    const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The genome took more than a minute to load.')), 60000); });
    let b;
    try {
      b = await Promise.race([window.igv.createBrowser(this.host, opts), late]);
    } catch (e) {
      this._dispose();
      throw e;
    } finally { clearTimeout(timer); }
    this.browser = b;
    this.genome = g;
    this.loaded = [];
    this.rois = [];
    this.hist = [];
    this.hIdx = -1;
    kv.set('igv:genome', g.id);
    this._fillGenomes();
    this._fillChromosomes();
    b.on('locuschange', () => this._locusChanged());
    b.on('trackclick', () => (this.popupMode === 'never' ? false : undefined));
    b.on('trackremoved', (tracks) => {
      const gone = new Set((tracks || []).map(t => t && t.name));
      this.loaded = this.loaded.filter(t => !gone.has(t.name));
    });
    this._locusChanged(true);
    this.win.setTitle(this.sessionPath ? `IGV - Session: ${this.sessionPath}` : 'IGV');
    return b;
  }

  _dispose() {
    try { if (this.browser && window.igv?.removeBrowser) window.igv.removeBrowser(this.browser); } catch (e) { console.warn(e); }
    this.browser = null;
    clear(this.host);
  }

  _fillChromosomes() {
    const S = this.chrSel;
    clear(S);
    const names = this.browser?.genome?.chromosomeNames || [];
    if (names.length > 1 && names.length < 2000) S.appendChild(h('option', { value: 'All' }, 'All'));
    for (const n of names.slice(0, 3000)) S.appendChild(h('option', { value: n }, n));
  }

  async setGenome(ref) {
    const g = this._genomeFor(ref);
    if (!g) { this.re.dialogs.error(`Could not find genome: ${ref}`, '', 'IGV'); return false; }
    if (this.genome && g.id === this.genome.id && this.browser) return true;
    const before = this.genome;
    this.status(`Loading genome: ${g.name}`);
    const shade = h('div.igv-busy', h('div.gtk-spinner'), h('div', `Loading ${g.name}...`));
    this.host.parentElement.appendChild(shade);
    try {
      await this._createBrowser(g);
      // a genome loaded from a file is offered in the genome box from now on
      if (!BUILTIN.some(x => x.id === g.id) && !g.hosted) {
        const mine = this._userGenomes().filter(x => x.id !== g.id);
        mine.push({ id: g.id, name: g.name, json: g.json, fasta: g.fasta, index: g.index, url: g.url, reference: g.reference });
        kv.set('igv:genomes', mine.slice(-12));
        this._fillGenomes();
      }
      this.status('');
      return true;
    } catch (e) {
      console.error(e);
      this.status('');
      await this.re.dialogs.error(`Error loading genome: ${g.name}`, String(e.message || e), 'IGV');
      if (before) { try { await this._createBrowser(before); } catch (e2) { console.error(e2); } }
      this._fillGenomes();
      return false;
    } finally { shade.remove(); }
  }

  // ============================================================= navigation
  _locusString() {
    const b = this.browser;
    if (!b) return '';
    try {
      const loci = b.currentLoci();
      // (as desktop IGV writes them: chr1:1,000-2,000)
      return (Array.isArray(loci) ? loci : [loci]).map((l) => String(l).replace(/^(.*):(\d+)-(\d+)$/, (m, c, a, z) => `${c}:${fmt(+a)}-${fmt(+z)}`)).join(' ');
    } catch { return ''; }
  }

  _locusChanged(initial) {
    const b = this.browser;
    if (!b) return;
    const s = this._locusString();
    if (document.activeElement !== this.locusBox) this.locusBox.value = s.toLowerCase() === 'all' ? 'All' : s;
    const rf = b.referenceFrameList && b.referenceFrameList[0];
    if (rf) {
      const chr = String(rf.chr || '').toLowerCase() === 'all' ? 'All' : rf.chr;
      if ([...this.chrSel.options].some(o => o.value === chr)) this.chrSel.value = chr;
    }
    this._ticks();
    if (!this.navigating) this._pushHistory(s, initial);
  }

  _pushHistory = debounce((s) => {
    if (!s || this.hist[this.hIdx] === s) return;
    this.hist = this.hist.slice(0, this.hIdx + 1);
    this.hist.push(s);
    if (this.hist.length > 100) this.hist.shift();
    this.hIdx = this.hist.length - 1;
    this._navState();
  }, 450);

  _navState() {
    this.backBtn.disabled = this.hIdx <= 0;
    this.fwdBtn.disabled = this.hIdx >= this.hist.length - 1;
  }

  async _history(d) {
    const i = this.hIdx + d;
    if (i < 0 || i >= this.hist.length || !this.browser) return;
    this.hIdx = i;
    this.navigating = true;
    try { await this.browser.search(this.hist[i]); } catch { /* ignore */ }
    setTimeout(() => { this.navigating = false; }, 500);
    this._navState();
  }

  async goto(locus, genome) {
    if (genome && (!this.genome || this._genomeFor(genome)?.id !== this.genome.id)) {
      if (!(await this.setGenome(genome))) return false;
    }
    const b = this.browser;
    const q = String(locus || '').trim();
    if (!b || !q) return false;
    try {
      const ok = await b.search(q.toLowerCase() === 'all' ? 'all' : q);
      if (ok === false) throw new Error('not found');
      this.locusBox.blur();
      return true;
    } catch (e) {
      await this.re.dialogs.warning(`Cannot find feature or locus: ${q}`, '', 'IGV');
      this._locusChanged();
      return false;
    }
  }

  _home() {
    const b = this.browser;
    if (!b) return;
    const names = b.genome?.chromosomeNames || [];
    this.goto(names.length > 1 ? 'all' : names[0]);
  }

  _refresh() {
    const b = this.browser;
    if (!b) return;
    try { (b.repaintViews || b.updateViews).call(b); } catch { /* ignore */ }
  }

  zoom(d) {
    const b = this.browser;
    if (!b) return;
    try { d > 0 ? b.zoomIn() : b.zoomOut(); } catch { /* ignore */ }
  }

  /** the zoom ticks of the toolbar: one per halving of the view, from the whole chromosome down to ~40 bp */
  _ticks() {
    const b = this.browser;
    clear(this.ticks);
    const rf = b?.referenceFrameList?.[0];
    if (!rf || !rf.chr || rf.chr.toLowerCase() === 'all') return;
    const chr = b.genome.getChromosome(rf.chr);
    const L = chr?.bpLength || 0;
    if (!L) return;
    const width = (rf.end ?? rf.start + rf.bpPerPixel * 800) - rf.start;
    const levels = Math.max(1, Math.min(24, Math.ceil(Math.log2(L / 40))));
    const cur = Math.max(0, Math.min(levels, Math.round(Math.log2(L / Math.max(1, width)))));
    for (let i = 0; i <= levels; i++) {
      const t = h('span.igv-tick' + (i === cur ? '.cur' : ''), { title: `Zoom level ${i}` });
      t.addEventListener('click', () => {
        const w = L / 2 ** i;
        const c = (rf.start + (rf.end ?? rf.start + width)) / 2;
        const s = Math.max(1, Math.round(c - w / 2)), e = Math.min(L, Math.round(c + w / 2));
        this.goto(`${rf.chr}:${s}-${e}`);
      });
      this.ticks.appendChild(t);
    }
  }

  _popupMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const set = (m) => { this.popupMode = m; kv.set('igv:popup', m); };
    showMenu([
      { label: 'Show Details on Hover', radio: true, checked: this.popupMode === 'hover', action: () => set('hover') },
      { label: 'Show Details on Click', radio: true, checked: this.popupMode === 'click', action: () => set('click') },
      { label: 'Never Show Details', radio: true, checked: this.popupMode === 'never', action: () => set('never') },
    ], { x: r.left, y: r.bottom });
  }

  _pref(k, v) {
    this.prefs[k] = v;
    kv.set('igv:prefs', this.prefs);
    const b = this.browser;
    if (!b) return;
    try {
      if (k === 'centerLine') b.setCenterLineVisibility(v);
      if (k === 'cursorGuide') b.setCursorGuideVisibility(v);
      if (k === 'trackNames') b.setTrackLabelsVisibility(v);
    } catch (e) { console.warn(e); }
  }

  // ================================================================= tracks
  async loadFromFileDialog() {
    const last = kv.get('igv:lastDir', null);
    const paths = await this.re.dialogs.fileChooser({ mode: 'open', multiple: true, title: 'Select Files', startDir: last || this.re.session.home,
      filters: [{ name: 'Genomic data files (BAM, CRAM, VCF, BED, GFF, wig…)', patterns: ['*.bam', '*.cram', '*.vcf', '*.vcf.gz', '*.bed', '*.bed.gz', '*.gff', '*.gff3', '*.gtf', '*.bedgraph', '*.wig', '*.bw', '*.bigwig', '*.bb', '*.seg', '*.tdf', '*.gz'] }] });
    if (!paths || !paths.length) return;
    kv.set('igv:lastDir', this.re.vfs.dirname(paths[0]));
    await this.loadPaths(paths);
  }

  async loadFromUrlDialog() {
    const v = await this.re.dialogs.form({ title: 'Load from URL', ok: 'OK', fields: [
      { name: 'url', label: 'File URL:', placeholder: 'https://…' },
      { name: 'index', label: 'Index URL:', placeholder: '(optional – required for BAM and CRAM files)' },
    ] });
    if (!v || !v.url.trim()) return;
    const url = v.url.trim();
    try {
      this._checkHost(url);
      const name = decodeURIComponent(url.split('?')[0].split('/').pop() || url);
      const cfg = this._trackConfig(name, url, v.index.trim() || undefined);
      if (!cfg) throw new Error(`Unknown file type: ${name}`);
      await this._addTrack(cfg, { url, format: cfg.format });
    } catch (e) {
      this.re.dialogs.error(`Error loading ${url}`, String(e.message || e), 'IGV');
    }
  }

  /** load files of the file system as tracks (a genome file becomes the genome) */
  async loadPaths(paths) {
    if (!this.browser) return;
    const vfs = this.re.vfs;
    const errors = [];
    for (const p0 of paths) {
      const p = vfs.normalize(p0);
      const name = p.split('/').pop();
      if (!vfs.exists(p)) { errors.push([`File not found: ${p0}`, '']); continue; }
      if (vfs.isDir(p)) { errors.push([`${p0} is a directory`, 'Choose the files inside it.']); continue; }
      if (/\.(bai|crai|tbi|csi|fai)$/i.test(name)) { errors.push([`${name} is an index file`, 'Load the data file it indexes (the .bam, .cram or .vcf.gz file); IGV finds the index next to it.']); continue; }
      if (GENOME_FILE.test(name) && !TRACK_FILE.test(name)) {
        if (await this.re.dialogs.confirm(`${name} looks like a genome file.`, 'Load it as the genome? (The tracks now loaded will be unloaded.)', { title: 'IGV', ok: 'Load Genome' })) await this.setGenome(p);
        continue;
      }
      if (!TRACK_FILE.test(name)) { errors.push([`Unknown file type: ${p0}`, 'IGV loads BAM, CRAM, VCF, BED, GFF/GTF, bedGraph, wig, bigWig, bigBed and SEG files.']); continue; }
      this.status(`Loading ${name}...`);
      try {
        let indexPath;
        if (/\.(bam|cram)$/i.test(name)) {
          const ext = /\.cram$/i.test(name) ? '.crai' : '.bai';
          indexPath = [p + ext, p.replace(/\.(bam|cram)$/i, ext)].find(x => vfs.exists(x));
          if (!indexPath) throw new Error(`An index file is required for ${/\.cram$/i.test(name) ? 'CRAM' : 'BAM'} files. Tried:\n${p}${ext}\n${p.replace(/\.(bam|cram)$/i, ext)}\n\nCreate one with  samtools index ${p}  (after  module load samtools/1.21), in a folder you can write to.`);
        } else if (/\.(vcf|bed|gff3?|gtf|bedgraph|wig)\.gz$/i.test(name)) {
          indexPath = [p + '.tbi', p + '.csi'].find(x => vfs.exists(x));
        }
        if (/\.bcf$/i.test(name)) throw new Error('IGV cannot read BCF files. Convert it with  bcftools view -Oz -o file.vcf.gz file.bcf  and index it with  tabix -p vcf file.vcf.gz');
        const mismatch = await this._contigCheck(p, name);
        if (mismatch) { errors.push(mismatch); continue; }
        const cfg = this._trackConfig(name, await this._fileUrl(p), indexPath ? await this._fileUrl(indexPath) : undefined, !!indexPath);
        await this._addTrack(cfg, { path: p, indexPath, format: cfg.format });
        this._remember(p);
      } catch (e) {
        console.error(e);
        errors.push([`Error loading ${p}`, String(e.message || e)]);
      }
    }
    this.status('');
    for (const [a, b] of errors) await this.re.dialogs.error(a, b, 'IGV');
  }

  _trackConfig(name, url, indexURL, indexed) {
    const n = name.toLowerCase();
    if (/\.(bam|cram)$/.test(n)) return { type: 'alignment', format: n.endsWith('.cram') ? 'cram' : 'bam', name, url, indexURL, height: 380, displayMode: 'EXPANDED' };
    if (/\.vcf(\.gz)?$/.test(n)) return { type: 'variant', format: 'vcf', name, url, ...(indexURL ? { indexURL } : { indexed: false }), displayMode: 'EXPANDED', height: 100, visibilityWindow: 1000000 };
    if (/\.(bw|bigwig)$/.test(n)) return { type: 'wig', format: 'bigwig', name, url };
    if (/\.(bb|bigbed)$/.test(n)) return { type: 'annotation', format: 'bigbed', name, url };
    if (/\.tdf$/.test(n)) return { type: 'wig', format: 'tdf', name, url };
    if (/\.(bedgraph|bdg)(\.gz)?$/.test(n)) return { type: 'wig', format: 'bedgraph', name, url, ...(indexURL ? { indexURL } : { indexed: false }) };
    if (/\.wig(\.gz)?$/.test(n)) return { type: 'wig', format: 'wig', name, url, indexed: false };
    if (/\.seg$/.test(n)) return { type: 'seg', format: 'seg', name, url };
    if (/\.(maf|mut)$/.test(n)) return { type: 'mut', format: n.endsWith('.maf') ? 'maf' : 'mut', name, url };
    if (/\.(bedpe|interact)$/.test(n)) return { type: 'interact', format: n.endsWith('.bedpe') ? 'bedpe' : 'interact', name, url };
    if (/\.(narrowpeak|broadpeak|gappedpeak)$/.test(n)) return { type: 'annotation', format: n.split('.').pop(), name, url, indexed: false };
    const fmtName = /\.gtf(\.gz)?$/.test(n) ? 'gtf' : /\.gff3?(\.gz)?$/.test(n) ? 'gff3' : 'bed';
    if (/\.(bed|gff3?|gtf)(\.gz)?$/.test(n)) return { type: 'annotation', format: fmtName, name, url, ...(indexURL ? { indexURL } : { indexed: false }), displayMode: 'EXPANDED' };
    return null;
  }

  async _addTrack(cfg, info) {
    const b = this.browser;
    const old = this.loaded.find(t => t.name === cfg.name);
    if (old) { try { b.removeTrackByName(cfg.name); } catch { /* gone */ } this.loaded = this.loaded.filter(t => t !== old); }
    await b.loadTrack({ removable: true, ...cfg });
    this.loaded.push({ name: cfg.name, ...info, type: cfg.type });
    this._memory();
  }

  /** Does the file name any chromosome of the genome? IGV warns when none match (and does not load it). */
  async _contigCheck(p, name) {
    let names = null;
    try {
      if (/\.bam$/i.test(name)) names = await bamContigs(window.MG.app.fs, p);
      else if (/\.(vcf|bed|gff3?|gtf|bedgraph|bdg|seg)$/i.test(name)) names = await textContigs(this.re.vfs, p, name);
    } catch (e) { console.warn('[igv] contig check', e); return null; }
    if (!names || !names.length) return null;
    const g = this.browser.genome;
    const canon = (c) => { try { return g.getChromosomeName ? g.getChromosomeName(c) : c; } catch { return c; } };
    const known = new Set(g.chromosomeNames || []);
    if (names.some(c => known.has(c) || known.has(canon(c)))) return null;
    const list = (a) => a.slice(0, 6).join(', ') + (a.length > 6 ? ', ...' : '');
    return [`File: ${p} does not contain any sequence names which match the current genome.`,
      `File:      ${list(names)}\nGenome: ${list(g.chromosomeNames || [])}\n\nCheck which genome the file was aligned to, and select that genome in the genome box first.`];
  }

  fitToWindow() {
    const b = this.browser;
    if (!b) return;
    const tvs = (b.trackViews || []).filter(tv => tv.track && !['sequence', 'ideogram', 'ruler'].includes(tv.track.type) && tv.track.id !== 'sequence');
    if (!tvs.length) return;
    const avail = Math.max(120, this.host.clientHeight - 120);
    const each = Math.max(25, Math.floor(avail / tvs.length));
    for (const tv of tvs) { try { tv.setTrackHeight(each, true); } catch { /* ignore */ } }
  }

  async trackHeightDialog() {
    const v = await this.re.dialogs.prompt('Track height (pixels):', { title: 'Set Track Height', value: '50' });
    const n = Number(v);
    if (!v || !Number.isFinite(n) || n < 5) return;
    for (const tv of this.browser.trackViews || []) {
      if (!tv.track || tv.track.type === 'sequence' || tv.track.id === 'sequence') continue;
      try { tv.setTrackHeight(Math.round(n), true); } catch { /* ignore */ }
    }
  }

  displayMode(mode, trackName) {
    for (const tv of this.browser.trackViews || []) {
      const t = tv.track;
      if (!t || (trackName && t.name !== trackName)) continue;
      if (!('displayMode' in t)) continue;
      t.displayMode = mode;
      try { tv.checkContentHeight?.(); tv.repaintViews?.(); } catch { /* ignore */ }
    }
  }

  // ================================================================ regions
  async setRois(list) {
    this.rois = list;
    const b = this.browser;
    if (!b) return;
    try {
      await b.clearROIs();
      if (list.length) await b.loadROI([{ name: 'Regions of Interest', color: 'rgba(68,134,247,0.22)', features: list.map(r => ({ chr: r.chr, start: r.start, end: r.end, name: r.description || '' })) }]);
    } catch (e) { console.warn('[igv] ROI', e); }
  }

  _startRoi() {
    if (!this.browser) return;
    if (this.roiPick) { this.roiPick = null; this.host.classList.remove('igv-picking'); this.roiBtn.classList.remove('active'); this.status(''); return; }
    const rf = this.browser.referenceFrameList?.[0];
    if (!rf || String(rf.chr).toLowerCase() === 'all') { this.re.dialogs.info('Regions of interest can only be defined in the chromosome view.', 'Choose a chromosome first.', 'IGV'); return; }
    this.roiPick = {};
    this.host.classList.add('igv-picking');
    this.roiBtn.classList.add('active');
    this.status('Click the start of the region of interest (Esc cancels)');
    this.host.focus();
  }

  regionNavigator() {
    const re = this.re;
    const body = h('div.igv-rn-body');
    const render = () => {
      clear(body);
      if (!this.rois.length) body.appendChild(h('div.igv-rn-empty', 'No regions of interest. Use the region button of the toolbar, or Add.'));
      else {
        const tbl = h('table.gtk-table.igv-rn-table', h('thead', h('tr', h('th', 'Chr'), h('th', 'Start'), h('th', 'End'), h('th', 'Description'), h('th', ''))));
        const tb = h('tbody');
        this.rois.forEach((r, i) => {
          const desc = h('input.gtk-entry', { value: r.description || '', style: { width: '100%' } });
          desc.addEventListener('change', () => { this.rois[i].description = desc.value; this.setRois(this.rois); });
          tb.appendChild(h('tr',
            h('td', r.chr), h('td', fmt(r.start + 1)), h('td', fmt(r.end)), h('td', desc),
            h('td', { style: { whiteSpace: 'nowrap' } },
              h('button.gtk-btn.small', { onclick: () => this.goto(`${r.chr}:${r.start + 1}-${r.end}`) }, 'View'),
              h('button.gtk-btn.small', { onclick: () => { this.setRois(this.rois.filter((_, j) => j !== i)); render(); } }, 'Delete'))));
        });
        tbl.appendChild(tb);
        body.appendChild(tbl);
      }
    };
    render();
    const content = h('div.gtk-dialog-content', { style: { display: 'block', minHeight: '180px', maxHeight: '420px' } }, body);
    const shell = re.dialogs.dialogShell('Regions of Interest', content, [
      h('button.gtk-btn', { onclick: () => {
        const rf = this.browser.referenceFrameList?.[0];
        if (!rf || String(rf.chr).toLowerCase() === 'all') return;
        this.setRois([...this.rois, { chr: rf.chr, start: Math.max(0, Math.floor(rf.start)), end: Math.floor(rf.end ?? rf.start + 1000), description: '' }]);
        render();
      } }, 'Add'),
      h('button.gtk-btn.suggested', { onclick: () => shell.close() }, 'Close'),
    ], { width: 640 });
  }

  async exportRegionsDialog() {
    const p = await this.re.dialogs.fileChooser({ mode: 'save', title: 'Export Regions', filename: 'regions.bed', startDir: this.re.session.home });
    if (!p) return;
    const bed = this.rois.map(r => [r.chr, r.start, r.end, r.description || ''].join('\t')).join('\n') + '\n';
    try { await this.re.vfs.writeFile(p, bed); this.status(`Regions exported to ${p}`); } catch (e) { this.re.dialogs.error('Could not export the regions', String(e.message || e), 'IGV'); }
  }

  async importRegionsDialog() {
    const p = await this.re.dialogs.fileChooser({ mode: 'open', title: 'Import Regions', startDir: this.re.session.home, filters: [{ name: 'BED files', patterns: ['*.bed', '*.txt'] }] });
    if (!p) return;
    try {
      const text = await this.re.vfs.readFile(p, { encoding: 'utf8' });
      const add = [];
      for (const line of text.split('\n')) {
        if (!line.trim() || /^(#|track|browser)/.test(line)) continue;
        const f = line.split('\t');
        if (f.length < 3 || isNaN(+f[1]) || isNaN(+f[2])) continue;
        add.push({ chr: f[0], start: +f[1], end: +f[2], description: f[3] || '' });
      }
      await this.setRois([...this.rois, ...add]);
      this.status(`${add.length} regions imported`);
    } catch (e) { this.re.dialogs.error('Could not import the regions', String(e.message || e), 'IGV'); }
  }

  // =============================================================== sessions
  async newSession(ask) {
    if (ask && this.loaded.length && !(await this.re.dialogs.confirm('Unload all tracks and start a new session?', '', { title: 'IGV', ok: 'New Session' }))) return;
    for (const t of [...this.loaded]) { try { this.browser.removeTrackByName(t.name); } catch { /* gone */ } }
    this.loaded = [];
    await this.setRois([]);
    this.sessionPath = null;
    this.win.setTitle('IGV');
  }

  _genomeRef() {
    const g = this.genome;
    if (!g) return '';
    if (BUILTIN.some(b => b.id === g.id)) return g.id;
    return g.hosted || g.json || g.fasta || g.url || g.id;
  }

  sessionXml() {
    const esc = (s) => escapeHtml(String(s));
    const res = this.loaded.map(t => `        <Resource name="${esc(t.name)}" path="${esc(t.path || t.url)}" type="${esc(t.format || '')}"${t.indexPath ? ` index="${esc(t.indexPath)}"` : ''}/>`).join('\n');
    const regions = this.rois.length ? `    <Regions>\n${this.rois.map(r => `        <Region chromosome="${esc(r.chr)}" description="${esc(r.description || '')}" end="${r.end}" start="${r.start}"/>`).join('\n')}\n    </Regions>\n` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<Session genome="${esc(this._genomeRef())}" hasGeneTrack="false" hasSequenceTrack="true" locus="${esc(this._locusString())}" version="8">\n    <Resources>\n${res}\n    </Resources>\n${regions}</Session>\n`;
  }

  async saveSessionDialog() {
    const p = await this.re.dialogs.fileChooser({ mode: 'save', title: 'Save Session', filename: this.sessionPath ? this.sessionPath.split('/').pop() : 'igv_session.xml', startDir: this.sessionPath ? this.re.vfs.dirname(this.sessionPath) : this.re.session.home });
    if (!p) return;
    try {
      await this.re.vfs.writeFile(p, this.sessionXml());
      this.sessionPath = p;
      this.win.setTitle(`IGV - Session: ${p}`);
      this.status(`Session saved to ${p}`);
    } catch (e) { this.re.dialogs.error('Could not save the session', String(e.message || e), 'IGV'); }
  }

  async openSessionDialog() {
    const p = await this.re.dialogs.fileChooser({ mode: 'open', title: 'Open Session', startDir: this.re.session.home, filters: [{ name: 'Session files (*.xml, *.json)', patterns: ['*.xml', '*.json'] }] });
    if (p) await this.openSession(p);
  }

  async openSession(p) {
    try {
      const text = await this.re.vfs.readFile(p, { encoding: 'utf8' });
      let genome, locus, resources = [], regions = [];
      if (/^\s*\{/.test(text)) {
        const j = JSON.parse(text);
        genome = j.genome?.id || j.genome || j.reference?.id;
        locus = Array.isArray(j.locus) ? j.locus.join(' ') : j.locus;
        resources = (j.tracks || []).filter(t => t.url && typeof t.url === 'string').map(t => ({ path: t.url, index: t.indexURL }));
      } else {
        const doc = new DOMParser().parseFromString(text, 'application/xml');
        const s = doc.querySelector('Session');
        if (!s) throw new Error('Not an IGV session file.');
        genome = s.getAttribute('genome');
        locus = s.getAttribute('locus');
        resources = [...doc.querySelectorAll('Resources > Resource')].map(r => ({ path: r.getAttribute('path'), index: r.getAttribute('index') }));
        regions = [...doc.querySelectorAll('Regions > Region')].map(r => ({ chr: r.getAttribute('chromosome'), start: +r.getAttribute('start'), end: +r.getAttribute('end'), description: r.getAttribute('description') || '' }));
      }
      if (genome && (!this.genome || this._genomeFor(genome)?.id !== this.genome.id)) { if (!(await this.setGenome(genome))) return; } else await this.newSession(false);
      const local = resources.filter(r => r.path && !/^https?:/i.test(r.path)).map(r => r.path);
      if (local.length) await this.loadPaths(local);
      for (const r of resources.filter(r => r.path && /^https?:/i.test(r.path))) {
        try { this._checkHost(r.path); const name = r.path.split('/').pop(); await this._addTrack(this._trackConfig(name, r.path, r.index || undefined), { url: r.path, format: '' }); } catch (e) { this.re.dialogs.error(`Error loading ${r.path}`, String(e.message || e), 'IGV'); }
      }
      if (regions.length) await this.setRois(regions);
      if (locus) await this.goto(locus);
      this.sessionPath = p;
      this.win.setTitle(`IGV - Session: ${p}`);
    } catch (e) {
      this.re.dialogs.error(`Error loading session: ${p}`, String(e.message || e), 'IGV');
    }
  }

  // ================================================================= images
  async _snapshotBytes(type) {
    const svg = await this.browser.toSVG();
    if (type === 'svg') return new TextEncoder().encode(svg);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('The view could not be drawn.')); img.src = url; });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      return new Uint8Array(await blob.arrayBuffer());
    } finally { URL.revokeObjectURL(url); }
  }

  _snapshotName(ext) {
    return (this._locusString() || 'igv_snapshot').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) + '.' + ext;
  }

  async saveImageDialog(type) {
    const p = await this.re.dialogs.fileChooser({ mode: 'save', title: `Save ${type.toUpperCase()} Image`, filename: this._snapshotName(type), startDir: kv.get('igv:snapDir', this.re.session.home) });
    if (!p) return;
    await this.saveImage(p, type);
  }

  async saveImage(p, type) {
    try {
      this.status('Saving image...');
      const bytes = await this._snapshotBytes(type || (/\.svg$/i.test(p) ? 'svg' : 'png'));
      await this.re.vfs.writeFile(p, bytes);
      kv.set('igv:snapDir', this.re.vfs.dirname(p));
      this.status(`Image saved to ${p}`);
      return true;
    } catch (e) {
      this.status('');
      this.re.dialogs.error('Error saving the image', String(e.message || e), 'IGV');
      return false;
    }
  }

  // ================================================================ genomes
  async loadGenomeDialog() {
    const p = await this.re.dialogs.fileChooser({ mode: 'open', title: 'Load Genome from File', startDir: GENOME_DIR,
      filters: [{ name: 'Genome files (*.json, *.fa, *.fasta, *.2bit, *.gbk)', patterns: ['*.json', '*.fa', '*.fasta', '*.fna', '*.2bit', '*.gbk'] }] });
    if (p) await this.setGenome(p);
  }

  async loadGenomeUrlDialog() {
    const v = await this.re.dialogs.form({ title: 'Load Genome from URL', fields: [
      { name: 'url', label: 'Genome URL (a .json genome definition, or a FASTA file):', placeholder: 'https://…' },
      { name: 'index', label: 'Index URL (FASTA only):', placeholder: 'https://….fai' },
    ] });
    if (!v || !v.url.trim()) return;
    const url = v.url.trim();
    try { this._checkHost(url); } catch (e) { return this.re.dialogs.error(`Error loading genome: ${url}`, String(e.message || e), 'IGV'); }
    if (/\.json$/i.test(url.split('?')[0])) return this.setGenome(url);
    const name = decodeURIComponent(url.split('?')[0].split('/').pop());
    return this.setGenome({ id: url, name, reference: { id: name, name, fastaURL: url, indexURL: v.index.trim() || url + '.fai' } });
  }

  hostedGenomeDialog() {
    const re = this.re;
    const list = h('div.gtk-list.igv-hosted');
    let chosen = null;
    for (const [id, name] of HOSTED) {
      const row = h('div.gtk-list-row', `${name}`);
      row.addEventListener('click', () => { list.querySelectorAll('.selected').forEach(x => x.classList.remove('selected')); row.classList.add('selected'); chosen = id; });
      row.addEventListener('dblclick', () => { shell.close(); this.setGenome(id); });
      list.appendChild(row);
    }
    const content = h('div.gtk-dialog-content', { style: { display: 'block' } },
      h('div.dlg-help', { style: { marginBottom: '8px' } }, 'Genomes hosted by the IGV team. They are downloaded from igv.org when they are loaded.'), list);
    const shell = re.dialogs.dialogShell('Select Hosted Genome', content, [
      h('button.gtk-btn', { onclick: () => shell.close() }, 'Cancel'),
      h('button.gtk-btn.suggested', { onclick: () => { if (!chosen) return; shell.close(); this.setGenome(chosen); } }, 'OK'),
    ], { width: 440 });
  }

  removeGenomesDialog() {
    const re = this.re;
    const mine = this._userGenomes();
    const checks = mine.map(g => ({ g, cb: h('input', { type: 'checkbox' }) }));
    const content = h('div.gtk-dialog-content', { style: { display: 'block' } },
      h('div.dlg-primary', 'Remove these genomes from the genome box:'),
      ...checks.map(({ g, cb }) => h('label.gtk-check', { style: { display: 'flex', margin: '4px 0' } }, cb, `${g.name}  (${g.json || g.fasta || g.url || g.id})`)));
    const shell = re.dialogs.dialogShell('Remove Genomes', content, [
      h('button.gtk-btn', { onclick: () => shell.close() }, 'Cancel'),
      h('button.gtk-btn.destructive', { onclick: () => {
        const drop = new Set(checks.filter(c => c.cb.checked).map(c => c.g.id));
        kv.set('igv:genomes', mine.filter(g => !drop.has(g.id) || g.id === this.genome?.id));
        this._fillGenomes();
        shell.close();
      } }, 'Remove'),
    ], { width: 520 });
  }

  // ================================================================== tools
  async batchDialog() {
    const p = await this.re.dialogs.fileChooser({ mode: 'open', title: 'Run Batch Script', startDir: this.re.session.home, filters: [{ name: 'Batch scripts (*.txt, *.bat, *.igv)', patterns: ['*.txt', '*.bat', '*.igv', '*.batch'] }] });
    if (p) await this.runBatch(p);
  }

  /** IGV batch commands: new, genome, load, goto, region, snapshotDirectory, snapshot, collapse/expand/squish, saveSession, echo, exit … */
  async runBatch(path) {
    const vfs = this.re.vfs;
    let text;
    try { text = await vfs.readFile(path, { encoding: 'utf8' }); } catch (e) { return this.re.dialogs.error(`Error reading batch script ${path}`, String(e.message || e), 'IGV'); }
    const base = vfs.dirname(path);
    const abs = (x) => (x.startsWith('/') || x.startsWith('~') ? vfs.normalize(x) : `${base}/${x}`);
    const log = [];
    let snapDir = this.snapshotDir || this.re.session.home;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const [cmd0, ...args] = line.split(/\s+/);
      const cmd = cmd0.toLowerCase();
      let res = 'OK';
      try {
        if (cmd === 'new' || cmd === 'reset' || cmd === 'clear') await this.newSession(false);
        else if (cmd === 'genome') { if (!(await this.setGenome(this._genomeFor(args[0]) ? args[0] : abs(args[0])))) res = 'ERROR: genome not loaded'; }
        else if (cmd === 'load') {
          const files = args.filter(a => !/^(index|name|format)=/i.test(a)).join(' ').split(',').map(s => s.trim()).filter(Boolean);
          for (const f of files) {
            if (/^https?:/i.test(f)) { this._checkHost(f); await this._addTrack(this._trackConfig(f.split('/').pop(), f), { url: f }); }
            else await this.loadPaths([abs(f)]);
          }
        } else if (cmd === 'goto') { if (!(await this.goto(args.join(' ')))) res = 'ERROR: locus not found'; }
        else if (cmd === 'region') await this.setRois([...this.rois, { chr: args[0], start: Math.max(0, +args[1] - 1), end: +args[2], description: args.slice(3).join(' ') }]);
        else if (cmd === 'snapshotdirectory') { snapDir = abs(args.join(' ')); if (!vfs.isDir(snapDir)) await vfs.mkdir(snapDir); this.snapshotDir = snapDir; }
        else if (cmd === 'snapshot') {
          await new Promise(r => setTimeout(r, 700));
          const name = args.join(' ') || this._snapshotName('png');
          if (!(await this.saveImage(`${snapDir}/${name}`, /\.svg$/i.test(name) ? 'svg' : 'png'))) res = 'ERROR: snapshot failed';
        } else if (cmd === 'collapse' || cmd === 'expand' || cmd === 'squish') this.displayMode({ collapse: 'COLLAPSED', expand: 'EXPANDED', squish: 'SQUISHED' }[cmd], args.join(' ') || undefined);
        else if (cmd === 'savesession') { await vfs.writeFile(abs(args.join(' ')), this.sessionXml()); }
        else if (cmd === 'echo') res = 'echo';
        else if (cmd === 'exit') { log.push(`${line}  →  OK`); setTimeout(() => this.win.close(true), 300); break; }
        else if (['maxpanelheight', 'setsleepinterval', 'sort', 'preference', 'viewaspairs', 'colorby', 'group', 'settrackheight'].includes(cmd)) {
          if (cmd === 'settrackheight') for (const tv of this.browser.trackViews || []) { if (tv.track?.type !== 'sequence') try { tv.setTrackHeight(+args[0], true); } catch { /* ignore */ } }
        } else res = `ERROR: unrecognized command: ${cmd0}`;
      } catch (e) { res = `ERROR: ${e.message || e}`; }
      log.push(`${line}  →  ${res}`);
    }
    this.status(`Batch script ${path.split('/').pop()} finished`);
    const pre = h('pre.igv-batchlog', log.join('\n'));
    this.re.dialogs.message({ title: 'IGV', primary: `Batch script finished: ${path}`, icon: log.some(l => /→ {2}ERROR/.test(l)) ? 'warning' : 'info', extra: pre });
  }

  preferencesDialog() {
    this.re.dialogs.form({ title: 'Preferences', ok: 'Save', fields: [
      { name: 'centerLine', label: 'Show center line', type: 'checkbox', value: this.prefs.centerLine },
      { name: 'cursorGuide', label: 'Show cursor guide', type: 'checkbox', value: this.prefs.cursorGuide },
      { name: 'trackNames', label: 'Show track names', type: 'checkbox', value: this.prefs.trackNames },
      { name: 'popup', label: 'Details pop-up', options: [['click', 'Show details on click'], ['hover', 'Show details on hover'], ['never', 'Never show details']], value: this.popupMode },
    ] }).then((v) => {
      if (!v) return;
      for (const k of ['centerLine', 'cursorGuide', 'trackNames']) if (v[k] !== this.prefs[k]) this._pref(k, v[k]);
      this.popupMode = v.popup;
      kv.set('igv:popup', v.popup);
    });
  }

  about() {
    this.re.dialogs.message({ title: 'About IGV', icon: 'assets/icons/apps/igv.svg', primary: `Integrative Genomics Viewer  ${IGV_VERSION}`,
      secondary: `This training simulator imitates the desktop IGV of the Research Environment. The data are drawn by igv.js ${window.igv?.version?.() || '3.8.9'} (MIT licence, Broad Institute and the Regents of the University of California).\n\nGenome: ${this.genome?.name || '–'}` });
  }

}

/* IGV reads a hosted file in pieces (Range requests); the terminal reads the same file whole, when a program needs it.
   On GitHub Pages a whole file can come gzip-compressed, and a piece asked for later at the same address is then
   answered from the browser's cache as a piece of the compressed bytes, which cannot be decoded
   (ERR_CONTENT_DECODING_FAILED: IGV said "Error accessing resource … status: 0"). IGV's own address keeps its pieces
   apart from the whole file. */
function igvAddress(url) {
  const u = new URL(url, location.href);
  if (u.origin === location.origin) u.searchParams.set('igv', '1');
  return u.href;
}

/** The reference names of a BAM file, read from its header (the first BGZF blocks). */
async function bamContigs(fs, p) {
  const e = fs.get(p);
  if (!e || typeof DecompressionStream === 'undefined') return null;
  const MAX = 1 << 20;
  let buf;
  if (e.kind === 'url') {
    const r = await fetch(igvAddress(e.url), { headers: { Range: `bytes=0-${MAX - 1}` } });
    if (!r.ok) return null;
    buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length > MAX) buf = buf.subarray(0, MAX);
  } else {
    const blob = await fs.toBlob(p);
    buf = new Uint8Array(await blob.slice(0, MAX).arrayBuffer());
  }
  const parts = [];
  let total = 0, off = 0;
  while (off + 18 <= buf.length && buf[off] === 31 && buf[off + 1] === 139) {
    const xlen = buf[off + 10] | (buf[off + 11] << 8);
    let bsize = -1;
    for (let x = off + 12; x < off + 12 + xlen;) {
      const slen = buf[x + 2] | (buf[x + 3] << 8);
      if (buf[x] === 66 && buf[x + 1] === 67) bsize = buf[x + 4] | (buf[x + 5] << 8);
      x += 4 + slen;
    }
    if (bsize < 0) return null;
    const end = off + bsize + 1;
    if (end > buf.length) break;
    const out = new Uint8Array(await new Response(new Blob([buf.subarray(off, end)]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    parts.push(out);
    total += out.length;
    const names = parseBamHeader(concat(parts, total));
    if (names) return names;
    off = end;
  }
  return null;
}

function concat(parts, total) {
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function parseBamHeader(d) {
  if (d.length < 12 || d[0] !== 66 || d[1] !== 65 || d[2] !== 77 || d[3] !== 1) return null;
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  let pos = 8 + dv.getInt32(4, true);
  if (pos + 4 > d.length) return null;
  const n = dv.getInt32(pos, true);
  pos += 4;
  const names = [];
  const dec = new TextDecoder();
  for (let i = 0; i < n; i++) {
    if (pos + 4 > d.length) return null;
    const l = dv.getInt32(pos, true);
    pos += 4;
    if (pos + l + 4 > d.length) return null;
    names.push(dec.decode(d.subarray(pos, pos + l - 1)));
    pos += l + 4;
  }
  return names;
}

/** The chromosome names of a (small, uncompressed) text track file. */
async function textContigs(vfs, p, name) {
  const st = vfs.stat(p);
  if (!st || st.size > 20 * 1024 * 1024) return null;
  const text = await vfs.readFile(p, { encoding: 'utf8' });
  const seen = new Set();
  let lines = 0;
  const isSeg = /\.seg$/i.test(name);
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#') || /^(track|browser)\b/.test(line)) continue;
    if (++lines > 5000) break;
    const f = line.split('\t');
    const c = isSeg ? f[1] : f[0];
    if (c && !(isSeg && lines === 1)) seen.add(c.trim());
  }
  return [...seen];
}
