# The engine: terminal, R, Python, RStudio and Spyder

`assets/` holds the engine of the comparativechrono workbenches – `window.MG`, a set of classic scripts – which the desktop uses for everything that runs code:

- **the terminal**: a bash-like shell written in JavaScript (`shell.js`, `shell-lang.js`, `shell-extra.js`), the real command-line programs compiled to WebAssembly (`tools-wasm.js`, `assets/vendor/biowasm`, `assets/vendor/genomics-wasm`), and the terminal's screen (`terminal.js`);
- **R** (webR 0.6.0, R 4.6.0): RStudio's sessions (`rsession.js`), `R` and `Rscript` in the terminal (`shell-r.js`);
- **Python** (Pyodide 0.29.5): `python` in the terminal (`kernels.js`, `py-worker.js`) and Spyder's console (`pyide.js`, `py-ide-worker.js`);
- **RStudio** and **Spyder**, the imitations of the two IDEs (`rstudio.js`, `rsource.js`, `rui.js`, `knit.js`, `dataview.js`, `shiny.js`; `spyder.js`, `spyder-panes.js`);
- **the file system** that all of these share (`vfs.js`, `project.js`, `pysync.js`).

The desktop (`js/`) is written for this site. It loads the engine lazily (`js/engine/loader.js`): the core with the page, the shell when a terminal first opens, RStudio's or Spyder's scripts when that application first opens.

## Where the files come from

The engine is copied, not rewritten, so that improvements made in the workbenches can be brought over. Files were changed as little as possible; most changes carry a comment that starts with **RE simulator:**.

| Files | Copied from | Commit |
| --- | --- | --- |
| `assets/js/*` (except `shell-r.js`, `shell-re.js`, `hts-re.js`), `assets/css/*`, `assets/py/smk.py`, `assets/py/wb_ide.py`, `assets/vendor/*` (all but the libraries of the workbench's own tabs), `isolation-sw.js`, `serve.py` | [comparativechrono/bioinformatics-workbench](https://github.com/comparativechrono/bioinformatics-workbench) | `3f656f082b2c3bed09393f8614cdddadab5192a5` (15 October 2026) |
| `assets/js/shell-r.js`, and in `assets/js/terminal.js` the part that lets a program read what is typed (R's console) | [comparativechrono/r-workbench](https://github.com/comparativechrono/r-workbench) | `785399150e88937a1e8ed6f932251fbb27160094` (15 October 2026) |
| `sites/variant-interpreter/` (unchanged; its build scripts and tests left out) | [comparativechrono/variant-interpreter](https://github.com/comparativechrono/variant-interpreter) | `fda632d33ab9b0b18a694b7853d8c35a3744147d` (20 October 2026) |

Unchanged from the bioinformatics workbench: `core.js`, `icons.js`, `isolation.js`, `dataview.js`, `rui.js`, `pyide.js`, `py-ide-worker.js`, `shiny.js`, `shiny-socket.js`, `python-worker.mjs`, `somatic.js`, `metagenomics.js`, the style sheets, `isolation-sw.js`, `serve.py`, and every vendored program and library: `assets/vendor/biowasm`, `assets/vendor/genomics-wasm` (with the Pyodide 314.0.7 of Cutadapt, Bracken and MACS3), `assets/vendor/viz` (Graphviz), `assets/vendor/r-packages` (locfit, for DESeq2 and edgeR) and `assets/vendor/licenses` (with the source archives of the GPL and MPL programs) are the workbench's folders as they are (see [THIRD_PARTY.md](../THIRD_PARTY.md)) – but for what this site adds: SAMtools, BCFtools and HTSlib 1.16 and 1.21 in `assets/vendor/genomics-wasm/hts/`, from the genomics-wasm project (commit `170e9f0`), and their recipes in `assets/vendor/licenses/genomics-wasm-build/`.

Left out: the workbench page and its tabs (`workbench.js`, `page-wb.js`, `config.js`, `ide.js`) – the notebooks (`notebook.js`), the Files tab (`editor.js`, `pdfview.js`), the genome-browser tab (`igv-panel.js`; IGV is `js/apps/igv/igv.js` here), Galaxy (`galaxy.js`), the Networks tab (`networks.js`, `net-*.js`), the Databases tab (`apis.js`), Proteins in 3D (`viewer-*.js`, `annot.js`, `commands.js`, `session.js`, `pdb.js`, `uniprot.js`, `alphafold.js`), the AI assistant (`assistant.js`) – and the libraries only they use (PDF.js, NGL, Cytoscape.js).

## Written for this site

| File | What it does |
| --- | --- |
| `assets/js/shell-re.js` | the Research Environment's commands in the terminal: `module`/`ml` (environment modules, as Lmod: the catalogue of `js/services/modules.js` – every program the terminal has, and only those –, loaded into `PATH` and `LOADEDMODULES`, which scripts, Snakemake's rules and LSF jobs inherit; a module's programs are "command not found" until it is loaded; a module with several versions – `samtools/1.16` and `samtools/1.21` – has its default marked `(D)`, the modules it depends on are loaded first – `bcftools/1.16` loads `htslib/1.16` – and loading another version swaps it, with Lmod's message), `ssh` to the HPC (host key, password or key, a separate HPC home), LSF (`bsub` – batch, job scripts with `#BSUB`, interactive `-Is` –, `bjobs`, `bkill`, `bqueues`, `bhosts`, `bhist`, `bpeek` …), the desktop applications (`rstudio`, `spyder`, `igv -b batch.txt`, `firefox`, `mousepad`, `xdg-open` …), `quota`, the RE's own `help` and `man` pages; it takes out `network` (the workbench's Networks tab) |
| `assets/js/hts-re.js` | SAMtools, BCFtools and HTSlib in the Research Environment's versions, 1.16 and 1.21 (`assets/vendor/genomics-wasm/hts/`): their five programs of each version in the program runner's table of programs that run in a worker of their own (`MG.wasm.ownWorker`), which version a command runs – that of the module that is loaded (`MG.wasm.programKey`) –, the Research Environment's top folders in each worker, so that the paths in a list of files (`samtools merge -b`, `bcftools concat -f`) are found (`MG.wasm.workerRoots`), and their man pages. a command typed with nothing piped into it reads from the terminal, and `bgzip` is handed the file it would overwrite, so that it asks first, as upstream (a question a program here cannot wait for: the answer is no, and the terminal says so). `gzip`, `gunzip` and `zcat` keep the Biowasm bgzip, as in the workbench |
| `assets/r/Rlabkey/` | a stand-in for the R package Rlabkey 3.4.1 (`labkey.selectRows`, `labkey.executeSql`, `makeFilter`, `getSchemas`/`getQueries`/`getQueryDetails` …), installed into every R as it starts |
| `assets/py/labkey/` | a stand-in for the Python package labkey 2.4.0 (`APIWrapper`, `query.select_rows`, `execute_sql`, `QueryFilter`, its exceptions), written into Python's site-packages |
| `js/engine/loader.js` | loads the engine's scripts in order, in groups (core, shell, codemirror, rstudio, spyder, igv) |
| `js/engine/index.js` | starts the engine for the signed-in user (configuration, file system, `MG.app`, the data clients) |
| `js/engine/re-fs.js` | builds the Research Environment's folders in the engine's file system: home, the read-only mounts from `data/fs`, `/re_gecip`, `/re_scratch`, the HPC home, the links in the home folder |
| `js/engine/app-adapter.js` | `MG.app` for the desktop: where the engine asks for "the IDE tab", "open this file", "show this in the browser", the desktop opens windows |
| `js/engine/labkey-clients.js` | puts the Rlabkey and labkey stand-ins into R and Python, with the data releases as SQLite files and the LabKey SQL translator (`js/services/labkey-sql.js`) |

## The changes to copied files

| File | Change |
| --- | --- |
| `vfs.js` | `fs.aliases`: folder pairs that are the same place (the home folder's links, the HPC's own `/home/USER`), honoured when paths are resolved; `fs.shown()` – the path as the user sees it; `fs.listShown()` – a folder's children with the path they were reached by, links to folders listed as folders (RStudio's and Spyder's file panes); the read-only message no longer names the workbench's example data |
| `shell.js`, `shell-lang.js` | `pwd` and `$PWD` show `fs.shown()`; `exit` at the top level calls `MG.shellHooks.onExit` (leaves an ssh session or an interactive job, or closes the terminal window); messages |
| `terminal.js` | from the R workbench: a program that reads what is typed (R's console) takes over the prompt; for `ssh`, a program can read without echo (passwords); from the bioinformatics workbench: stopping a program that runs in a worker of its own |
| `tools-wasm.js` | a link in the file system is a name only (the shell has followed it); read-only messages; for `hts-re.js`: `MG.wasm.ownWorker` (the table of programs that run in a worker of their own), and hooks – `programKey` (the build a command runs), `workerRoots` (more folders in a worker), `lists` (options whose value is a file that lists input files, which are handed over too), `named` (files named inside an option's value) and `tty` (the standard input is the terminal when nothing is piped in) –, `bcftools +PLUGIN` refused only by the Biowasm build (which has no plugins), and `htsfile` |
| `threads-worker.mjs` | `tty`: a program's standard input can be Emscripten's terminal device – a terminal to the program (`isatty`), which gives end-of-file when read – instead of an empty input (for `hts-re.js`'s programs: `bcftools view` with no file prints its usage, as upstream) |
| `shell-extra.js`, `shell-wb.js` | messages and man pages for the desktop instead of the workbench's tabs; `rstudio`/`spyder` open windows; `R`'s and `Rscript`'s man pages are those of `shell-r.js` |
| `shell-r.js` | messages |
| `kernels.js` | Python starts after `MG.app.beforePython()` (the data clients' files are ready) and receives the synced folders, the links, the read-only folders, extra modules (`MG.app.pyModules`) and JavaScript helpers (`MG.app.pyJsHelpers`); only small example files are copied in eagerly; error hints name the RE's folders |
| `py-worker.js` | the synced folders, links and read-only folders from the desktop; links are not followed when files are sent back; modules may be package files, installed into site-packages; `sqlite3` is loaded when code imports `labkey`; error hints |
| `rsession.js` | R sees the desktop's synced folders (not only the home folder) and its links; links are not sent back; `MG.app.rStartup` runs as each R starts (Rlabkey); webR's `default.profraw` is removed |
| `pysync.js` | the synced folders; links are not copied |
| `rstudio.js`, `spyder.js`, `spyder-panes.js` | the file panes use `fs.listShown()`; RStudio's Files pane works outside the home folder (`/` as its root); texts |
| `rsource.js`, `knit.js`, `project.js` | texts |
| `assets/vendor/licenses/` | `README.txt` and `genomics-wasm-build/README.txt` name SAMtools, BCFtools and HTSlib 1.16 and 1.21 (the latter has a section on them at its end), `genomics-wasm-build/` has their recipes from genomics-wasm (`scripts/*hts*`, `tools/hts/`, `validation/hts/`, `datasets/hts/`, `.github/workflows/hts.yml`), and `SHA256SUMS` lists them |

## Bringing in a newer engine

1. Copy the newer files over these, except `shell-re.js` and `hts-re.js`.
2. Re-apply the changes above: `git diff` against the previous commit shows them, and the **RE simulator:** comments mark most of them.
3. Check that the scripts the loader lists still exist and are in the right order (`js/engine/loader.js`), and that a program added to the engine has its files in `assets/vendor/` and a module in `js/services/modules.js` (`tests/smoke.py` checks that every module's commands exist and that its version is the program's).
4. Change `CONFIG.buildId` in `js/config.js`: the engine adds it to the addresses of its workers and of the modules it loads into R and Python, so browsers fetch the new ones rather than cached copies.
5. Run the checks in [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md#testing).
