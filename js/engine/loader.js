// =============================================================================
// Loads the workbench engine (window.MG — plain scripts in assets/js/, copied
// from the comparativechrono workbenches; see assets/ENGINE.md) in the right
// order, lazily: the core with the page, the shell when a terminal opens, an
// IDE when it is first opened.
// =============================================================================

import { CONFIG } from '../config.js';
import { loadScript, loadCss } from '../core/util.js';

const CM = 'assets/vendor/codemirror/';

/** window.MG_CONFIG for the engine (read by assets/js/core.js when it loads). */
export function engineConfig() {
  const e = CONFIG.engine;
  return {
    courseTitle: `${CONFIG.organisation} ${CONFIG.environmentName}`,
    courseSubtitle: CONFIG.trainingBanner,
    storePrefix: CONFIG.storageNamespace,
    hostname: CONFIG.desktopHostname,
    pyodideBase: e.pyodideBase,
    pythonPreload: e.pythonPreload,
    webrBase: e.webrBase,
    rRepos: e.rRepos,
    // R packages that the repositories have no browser build of (locfit, which DESeq2 and edgeR need)
    rLocalRepo: 'assets/vendor/r-packages',
    biowasmBase: 'assets/vendor/biowasm',
    threadsBase: 'assets/vendor/genomics-wasm/',
    storageWarnMB: 1500,
    readonlyHint: '',
    buildId: CONFIG.buildId,
  };
}

const groups = {
  // (assets/css/app.css is linked in index.html, before the desktop's own style sheets)
  core: { css: [], js: ['assets/js/core.js', 'assets/js/icons.js', 'assets/js/vfs.js', 'assets/js/project.js'] },
  shell: {
    css: ['assets/css/genomics.css'],
    js: ['assets/js/shell.js', 'assets/js/shell-lang.js', 'assets/js/tools-wasm.js', 'assets/js/somatic.js', 'assets/js/metagenomics.js', 'assets/js/shell-extra.js',
      'assets/js/shell-wb.js', 'assets/js/terminal.js', 'assets/vendor/dompurify/purify.min.js', 'assets/vendor/marked/marked.min.js',
      'assets/js/kernels.js', 'assets/js/pysync.js', 'assets/js/rsession.js', 'assets/js/shell-r.js', 'assets/js/shell-re.js', 'assets/js/hts-re.js', 'assets/js/repeats-re.js', 'assets/js/plink2-re.js'],
    after: () => {
      // R and Rscript come from shell-r.js (an interactive R console in the terminal, as on Linux) rather than the
      // notebook-style versions in shell-wb.js: the shell's own builtins win over tools, so those are removed.
      delete window.MG.shellBuiltins.R;
      delete window.MG.shellBuiltins.Rscript;
    },
  },
  codemirror: {
    css: [CM + 'codemirror.css'],
    js: [CM + 'codemirror.js', CM + 'python.js', CM + 'r.js', CM + 'yaml.js', CM + 'shell.js', CM + 'markdown.js',
      CM + 'javascript.js', CM + 'matchbrackets.js', CM + 'closebrackets.js', CM + 'comment.js', CM + 'searchcursor.js',
      CM + 'active-line.js', CM + 'runmode.js'],
  },
  rstudio: {
    needs: ['shell', 'codemirror'],
    css: ['assets/css/r.css', 'assets/css/rstudio.css'],
    js: [CM + 'overlay.js', CM + 'multiplex.js', CM + 'yaml-frontmatter.js', CM + 'rmarkdown.js', 'assets/js/rui.js',
      'assets/js/dataview.js', 'assets/js/knit.js', 'assets/js/rstudio.js', 'assets/js/rsource.js', 'assets/js/shiny.js'],
  },
  spyder: {
    needs: ['shell', 'codemirror'],
    css: ['assets/css/r.css', 'assets/css/spyder.css'],
    js: ['assets/js/rui.js', 'assets/js/dataview.js', 'assets/js/pyide.js', 'assets/js/spyder.js', 'assets/js/spyder-panes.js'],
  },
  igv: { js: ['assets/vendor/igv/igv.min.js'] },
};

const loading = new Map();

/** Load a group of engine files (and the groups it needs) once. */
export function loadEngine(name) {
  if (loading.has(name)) return loading.get(name);
  const g = groups[name];
  if (!g) return Promise.reject(new Error(`Unknown engine group: ${name}`));
  const p = (async () => {
    for (const dep of g.needs || []) await loadEngine(dep);
    for (const href of g.css || []) loadCss(href);
    for (const src of g.js || []) await loadScript(src);
    g.after?.();
  })();
  p.catch(() => loading.delete(name));
  loading.set(name, p);
  return p;
}
