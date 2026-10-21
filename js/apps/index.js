// =============================================================================
// Every application available in the simulated RE.
// `desktop` gives the icon order on the desktop (omit / false = menu only).
// Web-based tools open in the browser at their (fake) URL, like the real RE.
// =============================================================================

import { registerApp } from '../core/apps.js';
import { CONFIG } from '../config.js';

const S = CONFIG.sites;
const DB = CONFIG.dataBrowser;

// Absolute module URLs: import() resolves relative to the caller (js/core/apps.js).
const mod = (p) => new URL(p, import.meta.url).href;

const openUrl = (url) => (ctx) => ctx.re.apps.launchApp('web-browser', { url, newWindow: true, appearAs: ctx.app });

export function registerAllApps() {
  registerApp({
    id: 'terminal', name: 'Terminal Emulator', desktopLabel: 'Terminal', genericName: 'Command line',
    comment: 'Use the command line (and log in to the HPC)', icon: 'assets/icons/apps/terminal.svg',
    categories: ['System', 'Development'], keywords: ['shell', 'bash', 'console', 'hpc', 'ssh'],
    desktop: 1, favourite: true, module: mod('./terminal/terminal.js'),
  });
  registerApp({
    id: 'file-manager', name: 'Home', genericName: 'File Manager', desktopLabel: 'Home',
    comment: 'Browse the file system', icon: 'assets/icons/apps/file-manager.svg',
    categories: ['System', 'Accessories'], keywords: ['files', 'folder', 'thunar', 'nautilus'],
    desktop: 2, favourite: true, module: mod('./files/files.js'),
  });
  registerApp({
    id: 'rstudio', name: 'RStudio', genericName: 'R integrated development environment',
    comment: 'Statistical computing with R', icon: 'assets/icons/apps/rstudio.svg',
    categories: ['Development', 'Science'], keywords: ['r', 'statistics', 'ide'],
    desktop: 3, favourite: true, singleton: true, module: mod('./rstudio/rstudio.js'), mimeTypes: ['text/x-r'],
  });
  registerApp({
    id: 'spyder', name: 'Spyder', genericName: 'Python integrated development environment',
    comment: 'Scientific Python development environment', icon: 'assets/icons/apps/spyder.svg',
    categories: ['Development', 'Science'], keywords: ['python', 'ide', 'ipython'],
    desktop: 4, favourite: true, singleton: true, module: mod('./spyder/spyder.js'), mimeTypes: ['text/x-python'],
  });
  registerApp({
    id: 'text-editor', name: 'Text Editor', genericName: 'Edit text files',
    comment: 'Simple text editor with syntax highlighting', icon: 'assets/icons/apps/text-editor.svg',
    categories: ['Accessories', 'Development'], keywords: ['mousepad', 'scite', 'gedit', 'editor', 'notepad'],
    desktop: 5, favourite: true, module: mod('./editor/editor.js'), mimeTypes: ['text/*', 'application/json'],
  });
  registerApp({
    id: 'labkeeper', name: DB.productName, genericName: DB.tagline,
    comment: 'Browse and filter the clinical, phenotype and bioinformatics tables', icon: 'assets/icons/apps/labkeeper.svg',
    categories: ['Research', 'Science'], keywords: ['labkey', 'clinical', 'tables', 'phenotype', 'data'],
    desktop: 6, favourite: true, launch: openUrl(`https://${DB.host}/${DB.contextPath}/project/home/begin.view`),
  });
  registerApp({
    id: 'variant-interpreter', name: 'Variant Interpreter', genericName: 'Variant interpretation (DECIPHER-like)',
    comment: 'Interpret variants in the context of phenotype and gene data', icon: 'assets/icons/apps/variant-interpreter.svg',
    categories: ['Research', 'Science'], keywords: ['decipher', 'variants', 'acmg', 'cnv'],
    desktop: 7, favourite: true, launch: openUrl(`https://${S.variantInterpreter}/`),
  });
  registerApp({
    id: 'igv', name: 'IGV', genericName: 'Integrative Genomics Viewer',
    comment: 'Interactive exploration of genomic data (BAM, VCF, BED...)', icon: 'assets/icons/apps/igv.svg',
    categories: ['Science'], keywords: ['genome browser', 'bam', 'vcf', 'alignments'],
    desktop: 8, favourite: true, singleton: true, module: mod('./igv/igv.js'), mimeTypes: ['application/x-bam', 'application/x-vcf', 'application/x-bed'],
  });
  registerApp({
    id: 'airlock', name: 'Airlock', genericName: 'File Transfer', desktopLabel: 'Airlock',
    comment: 'Request the export (or import) of files from the Research Environment', icon: 'assets/icons/apps/airlock.svg',
    categories: ['Research'], keywords: ['export', 'import', 'file transfer'],
    desktop: 9, favourite: true,
    // {attach: [paths]} (the file manager's "Request export via Airlock…"), {request: id}, {page: '/files'}
    launch: (ctx, args = {}) => {
      const q = new URLSearchParams();
      for (const p of args.attach || []) q.append('attach', p);
      const path = args.request ? `/requests/${args.request}` : args.attach && args.attach.length ? `/forms/export-findings?${q}` : (args.page || '/');
      return ctx.re.apps.launchApp('web-browser', { url: `https://${S.airlock}${path}`, newWindow: !args.request && !args.attach, appearAs: ctx.app });
    },
  });
  registerApp({
    id: 'research-registry', name: 'Research Registry', genericName: 'Register a research project',
    comment: 'Submit a research proposal and track its review', icon: 'assets/icons/apps/research-registry.svg',
    categories: ['Research'], keywords: ['proposal', 'project', 'registration', 'rr number'],
    desktop: 10, favourite: true,
    // {project: ref} opens that proposal
    launch: (ctx, args = {}) => ctx.re.apps.launchApp('web-browser', { url: `https://${S.registry}${args.project ? `/projects/${args.project}` : (args.page || '/')}`, newWindow: !args.project, appearAs: ctx.app }),
  });
  registerApp({
    id: 'web-browser', name: 'Web Browser', genericName: 'Browse whitelisted websites',
    comment: 'Internet browser (whitelisted websites only)', icon: 'assets/icons/apps/web-browser.svg',
    categories: ['Internet'], keywords: ['firefox', 'internet', 'web', 'www'],
    desktop: 11, favourite: true, module: mod('./browser/browser.js'), mimeTypes: ['text/html', 'application/pdf', 'image/*'],
  });
  registerApp({
    id: 'documentation', name: 'RE Documentation', genericName: 'Research Environment user guide',
    comment: 'Open the Research Environment documentation', icon: 'assets/icons/apps/documentation.svg',
    categories: ['Research', 'Internet'], keywords: ['help', 'docs', 'guide'],
    desktop: 12, launch: openUrl(`https://${S.home}/`),
  });
  registerApp({
    id: 'settings', name: 'Settings Manager', genericName: 'Desktop and training settings',
    comment: 'Configure the desktop and the training simulator', icon: 'assets/icons/apps/settings.svg',
    categories: ['System'], keywords: ['preferences', 'configuration', 'reset', 'training'],
    singleton: true, module: mod('./settings/settings.js'),
  });
}
