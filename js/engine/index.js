// =============================================================================
// Starts the workbench engine for the logged-in user:
//   1. window.MG_CONFIG, then the engine's core scripts
//   2. the RE file system (MG.VFS) with the user's saved files
//   3. MG.app hooks → desktop windows
//   4. the data browser's R and Python clients (labkey-clients.js)
//   5. the desktop's file API (RE.vfs) attached to the same file system
// The shell (terminal), RStudio and Spyder load later, when first opened.
// =============================================================================

import { engineConfig, loadEngine } from './loader.js';
import { buildEngineFs } from './re-fs.js';
import { installAppAdapter } from './app-adapter.js';
import { installLabkeyClients } from './labkey-clients.js';

let started = null;

export function startEngine(RE) {
  if (started) return started;
  started = (async () => {
    window.MG_CONFIG = engineConfig();
    document.body.dataset.page = 're';
    await loadEngine('core');
    const fs = await buildEngineFs(RE.session);
    installAppAdapter(RE);
    // the data browser's R and Python clients (library(Rlabkey), import labkey)
    installLabkeyClients(RE);
    RE.vfs.attach(fs, {
      user: RE.session.username,
      bookmarks: [
        { label: 'genomes', path: `${fs.home}/genomes` },
        { label: 'gel_data_resources', path: `${fs.home}/gel_data_resources` },
        { label: 'pgen_public_data_resources', path: `${fs.home}/pgen_public_data_resources` },
        { label: 're_gecip', path: `${fs.home}/re_gecip` },
        { label: 're_scratch', path: '/re_scratch' },
      ],
    });
    // the shell is needed by the terminal, R, Python and the IDEs: start loading it in the background
    setTimeout(() => loadEngine('shell').catch((e) => console.warn('[engine] shell preload', e)), 1500);
    return fs;
  })();
  return started;
}

export { loadEngine };
