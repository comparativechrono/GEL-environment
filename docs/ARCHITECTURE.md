# How the simulator is put together

A static site: HTML, JavaScript modules and data files, with no server-side code. Everything – the desktop, the programs, R, Python, the "websites" and the "servers" behind them – runs in the student's browser.

```
index.html ─ js/main.js ─ window.RE ─┬─ desktop shell   js/shell/   panel, desktop icons, Whisker menu, sign-in
                                     ├─ window manager  js/core/wm.js
                                     ├─ applications    js/apps/    lazy modules, one window each (or several)
                                     ├─ services        js/services/  data server, LSF, modules, submissions
                                     ├─ file system     js/core/vfs.js → MG.VFS (js/engine/re-fs.js)
                                     └─ engine (MG)     assets/js/  shell, WebAssembly programs, R, Python,
                                                                    RStudio, Spyder – loaded when first needed
web browser app ─ iframe (same origin) ─ sites/<site>/  LabKeeper, Airlock, Registry, home, Variant Interpreter
                                         └─ window.parent.RE: the same services
```

## Start-up

`js/main.js` builds `window.RE` – `config`, `bus` (events), `kv` (localStorage), `session`, `vfs`, `apps`, `dialogs`, `wm`, `services`, `notify` – then:

1. registers the applications (`js/apps/index.js`);
2. reads the address: `?reset` clears this browser's data, `?user=NAME` signs in, otherwise the sign-in screen (`js/shell/login.js`);
3. starts the engine and the file system for the user (`js/engine/index.js`);
4. starts the services (`js/services/index.js`);
5. draws the panel and the desktop, and opens what `?open=` and `?url=` ask for.

Signing in as another user reloads the page, so that each user has their own files.

## Applications

An application is declared in `js/apps/index.js` (id, names, icon, Whisker-menu categories, desktop position, MIME types for *Open With*, `singleton`) and loaded when first launched: its module exports `launch(ctx, args)`, where `ctx.openWindow(opts)` opens a window and `args` is what the caller passed (`{path}`, `{url}`, `{paths, locus}` …). `RE.apps.launchApp(id, args)` launches one from anywhere – the desktop, the terminal (`xdg-open`, `igv`), a website (`window.parent.RE`), a notification.

Applications that are websites (LabKeeper, Airlock, Research Registry, Variant Interpreter, the documentation) have a `launch` that opens the web browser at their address.

The window manager (`js/core/wm.js`) gives each window a title bar, the Greybird look, moving, resizing, maximising, minimising to the panel's window buttons, and focus. Dialogs (`js/core/dialogs.js`) are GTK-like: message boxes, prompts, forms and the file chooser.

## The file system

There is one file system, the engine's `MG.VFS` (`assets/js/vfs.js`), shared by the desktop, the terminal, the WebAssembly programs, R and Python. `js/core/vfs.js` gives the desktop's applications a small API on top of it.

`js/engine/re-fs.js` lays out the Research Environment in it:

| Path | What | |
| --- | --- | --- |
| `/home/<user>` | the desktop's home, with links `~/genomes`, `~/gel_data_resources`, `~/pgen_public_data_resources`, `~/public_data_resources`, `~/re_gecip` | writable, kept |
| `/genomes`, `/gel_data_resources`, `/pgen_public_data_resources` | the read-only data, from `data/fs/manifest.json`: small text files inline, the others fetched from `data/fs/` when read (BAM files in pieces, with range requests) | read-only |
| `/re_gecip/<domain>/<user>` | the project working space (other domains: no access) | writable, kept |
| `/re_scratch/re_gecip/<domain>/<user>` | temporary files | writable, kept |
| `/discovery_forum` | industry space | no access |
| `/hpc_home/<user>` | the HPC's home, shown as `/home/<user>` after `ssh` (an alias of the terminal's view of the files) | writable, kept |
| `/resources/labkey` | the data releases as SQLite files, for R and Python | read-only |

Writable files are kept in the browser's IndexedDB by `assets/js/project.js`. Links and aliases (`fs.aliases`: pairs of folders that are the same place) are resolved by the engine; RStudio's and Spyder's panes list folders through `fs.listShown()`, so `~/genomes/…` stays `~/genomes/…`.

R and Python have file systems of their own (Emscripten's, in their workers). The engine copies the synced folders (`MG.app.syncRoots`: the home folder, the domain's folder, the scratch folder, `/resources/labkey`) into them before code runs and copies changes back after (`assets/js/rsession.js`, `assets/js/pysync.js`); the read-only data are lazy files there too, and the links are made as symbolic links (and not copied back).

To add read-only data, put the files under `data/fs/` and run `python3 tools/build_fs_manifest.py` (a `.keep` file keeps an empty folder).

## The engine

The terminal, the programs, R, Python, RStudio and Spyder are the engine of the comparativechrono workbenches, copied into `assets/` – see [assets/ENGINE.md](../assets/ENGINE.md) for what it is, where each file comes from and what was changed. The desktop meets it in three places:

- `js/engine/loader.js` loads its scripts in groups, when first needed;
- `js/engine/app-adapter.js` is `MG.app`: when the engine asks to show "the IDE tab", open a file or a URL, the desktop opens a window;
- `assets/js/shell-re.js` adds the Research Environment's commands to the shell (`module`, `ssh`, LSF, the desktop applications, `help`, `man`).

## The web browser and the websites

The web browser (`js/apps/browser/`) has tabs, an address bar, history, bookmarks and downloads. `routes.js` is its "DNS": a host name answered by a simulated site is shown in an iframe with that site's page (`sites/<name>/index.html`), after a short loading delay; the virtual path and query travel in the iframe's `location.hash`. Hosts on `CONFIG.whitelist` are real websites that refuse to be framed, so the browser offers to open them in a tab of the student's own browser; anything else gets the proxy's "blocked" page.

A site is plain HTML and JavaScript modules. `sites/common/site.js` gives it:

- `RE` – the desktop's services (`window.parent.RE`): the file system, the session, the data server, submissions …;
- `browser` – its tab (`iframe.reBrowser`): `navigate`, `download` (to `~/Downloads`, or to the real computer), `setTitle`;
- `route(render)` – calls `render({path, query})` for each address; `go(path)` moves to another address of the site (with the loading delay); `url(path, params)` builds one.

Code in a site runs in another realm than the desktop: objects from the desktop fail `instanceof` checks in the site, and arrays passed to the desktop should be made with `window.parent.Uint8Array`.

To add a site: a folder in `sites/`, an entry in `SITES` in `routes.js` (and a host name in `CONFIG.sites`), and optionally an application in `js/apps/index.js` that opens it.

## The data server and LabKeeper

`js/services/labkey-server.js` is the LabKey server. Each data release (`CONFIG.dataBrowser.projects[].releases`) is an SQLite database in memory (sql.js), made from:

1. the schema, `data/labkey/schema/<folder>.json` – every table and column of the release's data dictionary, with captions, types and coded values (`tools/build_labkey_schema.py` reads the dictionary's `.xlsx`);
2. the rows, `data/labkey/data/<folder>/index.json` and a TSV per table (`tools/make_demo_data.py` writes synthetic ones);
3. TSV files loaded in Settings (kept in IndexedDB, for that browser only).

Its API: `releases()`, `tables(folder)`, `table(folder, name)`, `selectRows({folderPath, queryName, columns, filters, sort, maxRows, offset})`, `executeSql({folderPath, sql, maxRows})`, `distinctValues(…)`, `loadTable(…)`, `exportDatabase(folder)`, `writeFiles()`. LabKey SQL is translated to SQLite by `js/services/labkey-sql.js` (date functions such as `YEAR` and `AGE`, `STDDEV` and `VARIANCE`, `CAST`, and the filter operators of LabKey's URLs: `eq`, `in`, `contains`, `dategte`, `isblank` …), and errors are worded as LabKey words them.

`sites/labkeeper/` is LabKey's web interface at LabKey's addresses (`/labkey/<controller>/<folder>/<action>.view?…`): `project-begin` (a folder and its Data Views), `query-executeQuery` (a grid: `query.<column>~<op>=<value>`, `query.sort`, `query.offset`, `query.maxRows`, `query.columns`), `query-begin` (the schema browser), `query-executeSql` (SQL), `login-login`, `search-search`. `grid.js` is the data region (filters, sorting, paging, column menus, customised views, a quick chart), `exports.js` the exports (Excel through JSZip, TSV, CSV, and scripts in R and Python that fetch the same rows).

**R and Python** (`js/engine/labkey-clients.js`). As each R or Python starts, the server writes each release to `/resources/labkey/<folder>.sqlite` (with two extra tables, `_lk_tables` and `_lk_columns`, that describe it) and `server.tsv` (host, context path, releases). `library(Rlabkey)` (`assets/r/Rlabkey`, installed into every R) and `import labkey` (`assets/py/labkey`, in Python's site-packages) read them: Python with its `sqlite3`, R with sql.js loaded inside R's worker (RSQLite does not load in webR 0.6). The SQL translator is the same code in all three places – it is evaluated in the workers as `globalThis.__lk` – so the GUI, R and Python give the same rows. As in the RE, the clients need `~/.netrc` with the user's name (an RE-style HTML error otherwise), the right `baseUrl` and `folderPath`.

## LSF and environment modules

`js/services/lsf.js` is the scheduler: queues (`CONFIG.hpc.queues`), project codes, `bsub` options and `#BSUB` lines, job states (PEND → RUN → DONE/EXIT), dependencies (`-w "done(ID)"`), output files with `%J`, LSF's environment variables and the job report at the end of the output file. A job runs its command in a shell of its own with a snapshot of the submitting terminal's view of the files, in the folder it was submitted from. `js/services/modules.js` holds the catalogue of modules (`module avail`): every program the terminal has – and only those –, with the program's own version and the commands each module provides. SAMtools, BCFtools and HTSlib have two versions, 1.16 and 1.21, as on the RE (`versions`; the newest is the default, marked `(D)` as Lmod marks it); a module can depend on others (`requires`: `bcftools/1.16` → `htslib/1.16`), which `module load` loads first, as Lmod's `depends_on`, and loading another version of a loaded module swaps it ("The following have been reloaded with a version change"). Which build of samtools, bcftools, bgzip, tabix and htsfile runs is decided by the module that is loaded, as `PATH` decides on the RE (`assets/js/hts-re.js`). `module load` works as Lmod does: the module's folder goes on `PATH` (`/resources/tools/apps/NAME/VERSION/bin`) and its name into `LOADEDMODULES`, both exported, so `bash script.sh`, `$( )`, Snakemake's rules and LSF jobs (which get the environment they were submitted from) have the modules of the shell that started them; `ssh` starts with none, and leaving the HPC or an interactive job puts the shell's modules back. `shell-re.js` makes a module's programs "command not found" until it is loaded – R and Python excepted, as on the desktop –, and `which`, `type` and `command -v` say where a loaded program is (Settings can turn the requirement off). A program added to the engine needs a module here; `tests/smoke.py` checks that every module's commands exist and that its version is the program's.

## Submissions: the Research Registry and the Airlock

`js/services/submissions.js` keeps projects and Airlock requests (localStorage; the Airlock's files in IndexedDB) and moves them through the RE's process after a delay (Settings ▸ Training controls):

- project: draft → submitted → screening (Research Management Team) → review (Access Review Committee) → approved, with an RR number | revisions requested | rejected;
- Airlock request: submitted → in review (Airlock Team) [→ the Airlock Committee] → approved | rejected | more information needed.

`js/services/airlock-rules.js` is the pre-check: it reads the request and its files against the RE's export rules (counts below 5, Genomics England identifiers, raw sequencing or genotype data, exact ages, dates about individuals, individual-level tables, bulk variant lists, R objects and binary files, the project's approval and its 30 days …) and produces the findings that the simulated reviewers decide on – and that students see as they fill in the form. With `CONFIG.submissions.mode = 'appsScript'`, each submission is also posted to a Google Apps Script web app (`apps-script/`).

## IGV

`js/apps/igv/igv.js` draws IGV desktop's window around igv.js 3.8.9: menus (File, Genomes, View, Tracks, Regions, Tools, Help), the toolbar, locus box and chromosome list, the Region Navigator, preferences, sessions in IGV's XML format, batch scripts, snapshots, and IGV's messages (a missing index; a file whose sequence names do not match the genome, found by reading the BAM header). Files are read where they are in the file system. `MG.app.igv` (`goto`, `loadPaths`, `setGenome`, `loadGenomeFromFiles`) lets the terminal drive it.

## Storage

Keys are prefixed with `CONFIG.storageNamespace` (`gelre`), so another copy of the simulator at the same address, with another prefix, keeps its own data. localStorage holds settings, the session, submissions and small state; IndexedDB holds files and uploads. `?reset` and Settings ▸ *Reset* clear both.

## Testing

There is no build step; checks are done in a browser.

- **By hand**, after a change: sign in; open each desktop icon; in the terminal `ls ~/genomes`, `module load samtools/1.21`, `samtools view -H` on a BAM under `/genomes`, `module load bcftools/1.16` and `bcftools --version` (1.16, with `htslib/1.16` loaded too), the workflow of `/gel_data_resources/example_scripts/workshop_scripts/repeat_expansions/README.txt` (ExpansionHunter, `samtools sort` and `index`, REViewer) and its SVG in the web browser, `ssh` to the HPC and `bsub` a job; in LabKeeper filter a table and export it as a script; run that script in RStudio and in Spyder (after making `~/.netrc` from `/gel_data_resources/example_config_files`); open a BAM in IGV; submit a project in the Research Registry and an export in the Airlock.
- **Automatically**: `tests/smoke.py` signs in, runs commands in the terminal and on the HPC, queries the data server, opens a grid in LabKeeper and a BAM file in IGV, runs the Airlock's pre-check, and – unless `--quick` – reads a table with Rlabkey in RStudio and with labkey in Spyder (`pip install playwright`, `python3 -m playwright install chromium`, `python3 serve.py 8765 &`, then `python3 tests/smoke.py`; `RE_BASE=https://… python3 tests/smoke.py` tests a published copy). The simulator was developed with longer Playwright scripts of the same kind, driving headless Chromium against `python3 serve.py 8765`: the desktop, the terminal and HPC, the file manager and editor, RStudio and Spyder with file sync, IGV (files, mismatched genomes, batch scripts, sessions, snapshots), LabKeeper (sign-in, grids, filters, exports, SQL, schema), Rlabkey and labkey against the same releases, the Airlock (rejected and approved exports, an import), the Research Registry (to an RR number), the home page and the Variant Interpreter. `window.RE` and `window.MG` make such tests short: `RE.apps.launchApp('igv', {paths: [...]})`, `RE.services.labkey.selectRows({...})`, `MG.app.rstudio.consoleRun('…')`.
