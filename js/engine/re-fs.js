// =============================================================================
// The Research Environment's file system, built inside the engine's MG.VFS.
//
//   /home/<user>                    desktop home – NOT visible from the HPC     writable, kept in the browser
//     ~/genomes, ~/gel_data_resources, ~/pgen_public_data_resources,
//     ~/public_data_resources, ~/re_gecip                                       links to the mounts below
//   /genomes/by_date/...            Illumina deliveries                         read-only (data/fs manifest)
//   /gel_data_resources/...         Genomics England pipeline outputs           read-only
//   /pgen_public_data_resources/... public resources (references, IGV ...)      read-only
//   /public_data_resources       -> /pgen_public_data_resources
//   /re_gecip/<domain>/             Research Network working space              writable in your own domain
//   /re_scratch/re_gecip/<domain>/<user>  temporary files                       writable
//   /discovery_forum                industry working space                      no access (academic users)
//   /hpc_home/<user>                where the HPC's /home/<user> is kept        (shown as /home/<user> after ssh)
//   /resources/labkey/*.sqlite      the data browser's tables, for R and Python read-only
//
// Read-only data come from data/fs/manifest.json (built by tools/build_fs_manifest.py).
// =============================================================================

import { CONFIG } from '../config.js';
import { siteUrl } from '../core/util.js';

export const GECIP_DOMAINS = [
  'cancer', 'cardiovascular', 'endocrine_metabolism', 'haematology', 'hearing_and_sight', 'immunology',
  'neurology', 'paediatrics', 'renal', 'respiratory', 'skin', 'training', 'shared_allGECIPs',
];

export const READONLY_ROOTS = ['/genomes', '/gel_data_resources', '/pgen_public_data_resources'];

function bashrc(user, domain) {
  return `# ~/.bashrc: executed by bash(1) for non-login shells.

# If not running interactively, don't do anything
case $- in
    *i*) ;;
      *) return;;
esac

HISTCONTROL=ignoreboth
HISTSIZE=1000

alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'

# Work in your Research Network folder: the desktop home (10 GB) is NOT on the HPC.
export WORKDIR=/re_gecip/${domain}/${user}

# Temporary files belong in re_scratch, not /tmp:
export TMPDIR=/re_scratch/re_gecip/${domain}/${user}
`;
}

const PROFILE = `# ~/.profile: executed by the command interpreter for login shells.
if [ -n "$BASH_VERSION" ]; then
    if [ -f "$HOME/.bashrc" ]; then
        . "$HOME/.bashrc"
    fi
fi
`;

function readme(user, domain) {
  const C = CONFIG;
  return `Welcome to the ${C.environmentName} training simulator, ${user}!

This desktop mimics the ${C.organisation} Research Environment (RE).

  * Your desktop home (~, /home/${user}) is limited to 10 GB and is NOT
    available on the HPC. Work in your Research Network folder instead:
        /re_gecip/${domain}/${user}      (also reachable as ~/re_gecip/${domain}/${user})
  * Genomic data are under /genomes (read-only). Find the files you need with
    the genome_file_paths_and_types table in ${C.dataBrowser.productName} - never by
    browsing /genomes, which holds genomes of participants who have withdrawn.
  * Nothing leaves the RE except through the Airlock, and only for a project
    registered in the Research Registry at least ${C.submissions.exportWaitDays} days before.

In the Terminal:
  ssh ${user}@${C.hpc.loginHost}     log in to the HPC (Double Helix)
  module avail / module load R/4.3.3       software modules
  bsub / bjobs / bqueues / bkill           the LSF job scheduler (on the HPC)
  R, python3                               interactive R and Python
  rstudio, spyder, igv                     open the desktop applications
`;
}

/**
 * Build the file system for the logged-in user.
 * Returns the MG.VFS instance (also set as MG.app.fs).
 */
export async function buildEngineFs(session) {
  const MG = window.MG;
  const user = session.username;
  const domain = session.user.domain || 'training';
  const home = `/home/${user}`;
  MG.user.set(user);
  MG.app = MG.app || {};

  const fs = new MG.VFS(home);
  fs.group = session.user.group || 're_gecip';
  const T0 = Date.parse('2024-10-31T09:00:00Z');
  const protectedDirs = new Set();
  const mk = (p, prot = false) => { fs.mkdirp(p); const e = fs.entries.get(p); if (e) e.mtime = Math.min(e.mtime, T0); if (prot) protectedDirs.add(p); };

  // ---- system folders (root's)
  for (const p of ['/bin', '/usr', '/usr/bin', '/usr/local', '/usr/local/bin', '/etc', '/opt', '/var', '/mnt', '/home', '/resources', '/resources/tools']) mk(p, true);
  mk('/tmp');
  // ---- data mounts
  for (const r of READONLY_ROOTS) mk(r, true);
  mk('/genomes/by_date', true);
  // ---- shared working spaces
  mk('/re_gecip', true);
  for (const d of GECIP_DOMAINS) mk(`/re_gecip/${d}`, d !== domain && d !== 'shared_allGECIPs');
  mk(`/re_gecip/${domain}/${user}`);
  mk('/discovery_forum', true);
  mk('/re_scratch', true);
  mk('/re_scratch/re_gecip', true);
  mk('/re_scratch/discovery_forum', true);
  mk(`/re_scratch/re_gecip/${domain}`, true);
  mk(`/re_scratch/re_gecip/${domain}/${user}`);
  // ---- the data browser's databases (written by js/services/labkey-server.js)
  mk('/resources/labkey', true);
  // ---- homes
  for (const d of ['Desktop', 'Documents', 'Downloads', '.local/share/Trash/files', '.ssh', '.config']) mk(`${home}/${d}`);
  mk('/hpc_home', true);
  mk(`/hpc_home/${user}`);
  mk(`/hpc_home/${user}/.ssh`);

  // ---- links (symbolic links on the real desktop)
  const links = [
    [`${home}/genomes`, '/genomes'],
    [`${home}/gel_data_resources`, '/gel_data_resources'],
    [`${home}/pgen_public_data_resources`, '/pgen_public_data_resources'],
    [`${home}/public_data_resources`, '/pgen_public_data_resources'],
    [`${home}/re_gecip`, '/re_gecip'],
    ['/public_data_resources', '/pgen_public_data_resources'],
  ];
  for (const [from, to] of links) fs.entries.set(from, { kind: 'link', to, mtime: T0 });
  fs.aliases = links.slice().sort((a, b) => b[0].length - a[0].length);

  // ---- a few system files
  const sys = (p, text) => fs.entries.set(p, { kind: 'text', text, size: text.length, mtime: T0, protected: true, readonly: true });
  sys('/etc/hostname', CONFIG.desktopHostname + '\n');
  sys('/etc/os-release', 'PRETTY_NAME="Ubuntu 24.04.3 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04.3 LTS (Noble Numbat)"\nVERSION_CODENAME=noble\nID=ubuntu\nID_LIKE=debian\n');
  sys('/etc/motd', `\nWelcome to the ${CONFIG.organisation} ${CONFIG.environmentName}.\nAll activity is monitored. Data may only leave the environment through the Airlock.\n\n`);

  // ---- read-only data (manifests)
  const dataFiles = await loadManifests(fs, protectedDirs);

  // protected folders: nothing new may be made in them; their files are read-only
  for (const [p, e] of fs.entries) {
    if (e.kind === 'dir' && (protectedDirs.has(p) || READONLY_ROOTS.some(r => p.startsWith(r + '/')))) e.protected = true;
  }

  // ---- the user's own files, kept in this browser
  const persistRoots = [home, `/re_gecip/${domain}`, '/re_gecip/shared_allGECIPs', `/re_scratch/re_gecip/${domain}/${user}`, `/hpc_home/${user}`];
  await MG.project.restore(fs, persistRoots);
  const seed = (p, text) => { if (!fs.exists(p)) fs.writeText(p, text); };
  seed(`${home}/.bashrc`, bashrc(user, domain));
  seed(`${home}/.profile`, PROFILE);
  seed(`${home}/README.txt`, readme(user, domain));
  seed(`/hpc_home/${user}/.bashrc`, bashrc(user, domain));
  fs.cwd = home;
  MG.project.watch(fs);

  // ---- what the rest of the engine needs to know
  Object.assign(MG.app, {
    fs,
    HOME: home,
    PROJECT: home,
    WORKDIR: `/re_gecip/${domain}/${user}`,
    // folders R and Python keep a copy of (both ways), besides the home folder
    syncRoots: [home, `/re_gecip/${domain}`, `/re_scratch/re_gecip/${domain}/${user}`, '/resources/labkey'],
    readonlyRoots: READONLY_ROOTS.slice(),
    fsLinks: links.filter(([from]) => from.startsWith(home + '/') || from === '/public_data_resources'),
    exampleFiles: dataFiles,
  });
  return fs;
}

/**
 * Manifests list read-only files:
 *   {entries: [{path, type: 'dir'|'file', size, mtime, src, text}]}
 * data/fs/manifests.json may list several manifests (practicals can add their own).
 */
async function loadManifests(fs, protectedDirs) {
  let list = ['data/fs/manifest.json'];
  try {
    const r = await fetch(siteUrl('data/fs/manifests.json'));
    if (r.ok) list = (await r.json()).manifests || list;
  } catch { /* the default */ }
  const files = [];
  for (const url of list) {
    let m;
    try {
      const r = await fetch(siteUrl(url));
      if (!r.ok) continue;
      m = await r.json();
    } catch (e) { console.warn('[re-fs] manifest', url, e); continue; }
    for (const e of m.entries || []) {
      const p = window.MG.path.norm(e.path);
      const mtime = e.mtime ? Date.parse(e.mtime) || Date.now() : Date.now();
      try {
        if (e.type === 'dir') {
          fs.mkdirp(p);
          fs.entries.get(p).mtime = mtime;
          protectedDirs.add(p);
          continue;
        }
        fs.mkdirp(window.MG.path.dirname(p));
        if (e.text !== undefined) {
          fs.entries.set(p, { kind: 'text', text: e.text, size: new Blob([e.text]).size, mtime, protected: true, readonly: true, ...(e.exec ? { mode: 'x' } : {}) });
          // R and Python read it from the site too
          if (e.src) files.push({ path: p, url: /^https?:/.test(e.src) ? e.src : siteUrl(e.src), size: e.size || 0, mtime });
        } else {
          const url2 = /^https?:/.test(e.src) ? e.src : siteUrl(e.src);
          fs.entries.set(p, { kind: 'url', url: url2, size: e.size || 0, mtime, protected: true, readonly: true });
          files.push({ path: p, url: url2, size: e.size || 0, mtime });
        }
      } catch (err) { console.warn('[re-fs] entry', e.path, err); }
    }
  }
  return files;
}
