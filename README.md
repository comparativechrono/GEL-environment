# Research Environment simulator

**A training copy of the Genomics England Research Environment that runs entirely in the browser: the Xubuntu desktop of an RE WorkSpace, a terminal with the real command-line programs, the HPC with LSF, RStudio, Spyder, IGV, the LabKey data browser (here called LabKeeper), the Airlock, the Research Registry and a variant interpreter – for practicals in which students learn how the RE works before they use it.**

Everything runs on the student's own computer, in one web page. No participant data are in it: the clinical tables are synthetic and the genomes are public cell-line data. It is not made or endorsed by Genomics England.

---

## Contents

1. [What is in it](#what-is-in-it)
2. [Put it on GitHub Pages](#put-it-on-github-pages)
3. [Try it on your own computer](#try-it-on-your-own-computer)
4. [Running a practical](#running-a-practical)
5. [The data](#the-data)
6. [Submissions to Google (Apps Script)](#submissions-to-google-apps-script)
7. [Settings: `js/config.js`](#settings-jsconfigjs)
8. [What students keep, and privacy](#what-students-keep-and-privacy)
9. [Browser support and limits](#browser-support-and-limits)
10. [Files](#files)
11. [Credits and licences](#credits-and-licences)

---

## What is in it

The page opens on the RE's sign-in screen, then the desktop: the panel at the top (Applications menu, window buttons, the clock, notifications, the user menu), icons on the left, windows that move, resize, maximise and minimise as in Xfce.

| Desktop icon | What it is |
| --- | --- |
| **Terminal** | bash with the real programs compiled to WebAssembly – fastp, Cutadapt, minimap2, Bowtie 2, BWA, BWA-MEM2, HISAT2, SAMtools, BCFtools (with all its plugins: `+split-vep`, `+fill-tags`, `+trio-dnm2` …) and HTSlib's bgzip, tabix and htsfile in the RE's versions, 1.16 and 1.21, bedtools, mosdepth, FreeBayes, LoFreq, SomaticSniper, Strelka2, ExpansionHunter and REViewer (repeat expansions, with REViewer's plots shown in the web browser), PLINK 2, featureCounts, StringTie, kallisto, Salmon, bustools, MACS3, Kraken2, Bracken, Prodigal, HMMER and others – plus GNU coreutils, grep, sed and awk, Graphviz, Snakemake, `python3` and `R`/`Rscript`. The Research Environment's own commands: `module avail/load` (environment modules: `module avail` lists exactly the programs that are there – 42 modules; samtools, bcftools and htslib in two versions, as on the RE, `module load bcftools/1.16` loading `htslib/1.16` with it –, and a module's programs are "command not found" until it is loaded; scripts, Snakemake and LSF jobs inherit the loaded modules), `ssh` to the HPC (host key, password, `ssh-keygen`/`ssh-copy-id`), and on the HPC the LSF scheduler – `bsub` (with `#BSUB` job scripts, `-P` project codes, queues, `-Is` interactive jobs), `bjobs`, `bkill`, `bqueues`, `bhist`, `bpeek`. Type `help`. |
| **Home** | the file manager (Thunar): the home folder with the RE's links (`~/genomes`, `~/gel_data_resources`, `~/re_gecip` …), `/re_gecip/<domain>/<user>`, `/re_scratch`, the read-only data; copy, move, rename, open with, properties |
| **RStudio** | an imitation of RStudio with R 4.6 (webR): Source, Console, Environment, Files, Plots, Packages, Help, Viewer, Terminal; R Markdown; `library(Rlabkey)` reads the data browser's tables, as in the RE |
| **Spyder** | an imitation of Spyder 6 with Python 3.13 (Pyodide): Editor, IPython console, Variable Explorer, Plots, Files; `import labkey` works as in the RE |
| **Text Editor** | Mousepad: tabs, search and replace, syntax colouring |
| **LabKeeper** | the LabKey Server data browser at `https://labkey.prod.aws.gel.ac/labkey`: sign-in, the projects (main-programme, nhs-gms), the data releases, *Data Views*, grids with sorting, filters, paging, customised views, charts, export to Excel, TSV, CSV and **Export ▸ Script** (the R or Python code that fetches the same rows), the schema browser and SQL queries. The tables and columns are those of the 100,000 Genomes Project release v19 (127 tables) and the NHS GMS release v5 (35 tables) |
| **Variant Interpreter** | the DECIPHER-like variant interpretation app of [comparativechrono/variant-interpreter](https://github.com/comparativechrono/variant-interpreter), as a website of the RE |
| **IGV** | IGV desktop: its menus, toolbar, locus box, chromosome list, Region Navigator, sessions (XML), batch scripts (`igv -b`), snapshots (PNG, SVG), preferences; BAM, CRAM, VCF, BED and GFF files from the file system, the training genome and the hosted hg38/hg19 |
| **Airlock** | the Airlock website: export requests (findings, scripts) and import requests (data, software, other files), with the RE's rules checked as the form is filled in (small counts, identifiers, raw data, exact ages, dates …); a simulated Airlock Team reviews each request, and approved exports are downloaded to the student's real computer |
| **Research Registry** | registering a research project: lay summary, aims, data requested, declarations, then screening and review by a simulated Access Review Committee, ending with an RR number that the Airlock needs |
| **Web Browser** | the browser in which LabKeeper, the Airlock, the Registry and the Variant Interpreter open, with an address bar, tabs, history and downloads to `~/Downloads`; other sites are blocked, as in the RE, and the whitelisted ones (PanelApp, ClinVar, gnomAD, Ensembl, the RE user guide …) open in a tab of the student's own browser |
| **RE Documentation** | the RE's start page: the web tools, a getting-started route through them, the whitelist |

The Applications menu (Whisker Menu) has these and the **Settings Manager** (desktop, account, the instructors' *Training controls*, the data browser's tables). Files open in the right application by double-click, *Open With*, or from the terminal (`xdg-open`, `igv file.bam`, `rstudio script.R`, `mousepad notes.txt`).

## Put it on GitHub Pages

1. *Settings → Pages → Build and deployment*: Source **Deploy from a branch**, branch **main**, folder **/ (root)**. Save.
2. After a minute the site is at `https://<owner>.github.io/<repository>/` – for this repository `https://comparativechrono.github.io/GEL-environment/`. The first time a browser opens it, the page loads once more by itself: it installs a small service worker (`isolation-sw.js`) that makes the page *cross-origin isolated*, which R's and Python's input, interrupting them, and the threads of featureCounts, Salmon and PLINK 2 need.

The empty file `.nojekyll` stops GitHub from processing the site. Keep `assets/vendor/licenses/` with the site: it holds the source code of the GPL programs. Any other web server works too: copy the folder; there is no server-side code, but the server must answer HTTP range requests (all common ones do), which IGV uses.

## Try it on your own computer

Opening `index.html` directly (`file://…`) does not work. Serve the folder:

```bash
python3 serve.py 8765        # then open http://localhost:8765
```

`serve.py` answers range requests and sends the cross-origin isolation headers itself.

Addresses that help in a practical:

| Address | What it does |
| --- | --- |
| `index.html?user=jdoe` | signs in as `jdoe` without the sign-in screen (RE user names are an initial and a surname: `jsmith`) |
| `index.html?reset` | deletes everything this simulator keeps in the browser – files, settings, requests – and starts again |
| `index.html?fast` | skips the "reconnecting to your WorkSpace" screen |
| `index.html?open=terminal,rstudio` | opens applications after sign-in (their ids: `terminal`, `file-manager`, `rstudio`, `spyder`, `text-editor`, `labkeeper`, `variant-interpreter`, `igv`, `airlock`, `research-registry`, `web-browser`, `documentation`, `settings`) |
| `index.html?url=https://labkey.prod.aws.gel.ac/labkey/project/home/begin.view` | opens the web browser at an address of the RE |

## Running a practical

**Before the session.** Open the site once on a computer like the students'. The first start of R and of Python downloads them (some tens of megabytes each; the browser then keeps them). Decide whether the reviews should be automatic.

**Training controls** (Applications menu ▸ System ▸ Settings Manager ▸ *Training controls*) act on the browser they are set in – each student's own, or the instructor's for a demonstration:

- *Review submissions automatically* – on: the simulated Research Management Team, Access Review Committee and Airlock Team decide each submission after a delay (the delay can be changed, for example to 5 seconds); off: submissions wait for a decision made here.
- *Enforce the 30-day rule for exports* – as in the RE, nothing leaves a project before it has been approved for 30 days. The training project RR4001, which every user is a member of, was approved 120 days ago; projects approved in the session can be backdated here.
- *Require "module load"* – whether the programs of `module avail` need `module load` first, as in the RE (R and Python never do).
- The lists of proposals and Airlock requests, with buttons to approve, ask for revisions or more information, reject, and backdate; *Reset* clears the requests, or the whole simulator.

**A route through the RE** (also on the RE Documentation page): find a cohort in LabKeeper (filter `rare_diseases_participant_disease`, look up `genome_file_paths_and_types`), export it or copy *Export ▸ Script* into RStudio; set up `~/.netrc` so that Rlabkey and labkey can sign in; look at a participant's BAM in IGV; log in to the HPC, `module load samtools`, submit `samtools flagstat` with `bsub -q short -P re_gecip_training`; register a project in the Research Registry; export a summary table through the Airlock – and see it rejected when it has a count below 5.

## The data

| Where | What |
| --- | --- |
| LabKeeper's tables | the full structure of two data releases – every table, column, caption, type and coded value – from the Genomics England data dictionaries (`data/labkey/schema/`, built by `tools/build_labkey_schema.py`), and **synthetic** rows in every table (`data/labkey/data/`): a main programme of 12,885 simulated participants (4,000 rare-disease families, with 8,480 genomes, and 4,405 people with cancer) and an NHS GMS release of 1,850, with their clinical data, tiered variants, cancer analyses and linked hospital, registry, mortality and mental-health records. They were made for teaching statistics, by a generator that is kept out of this repository so that the answers are not in it; their proportions follow published 100,000 Genomes Project figures, and no row describes a real person. The HCC1395 rows (participant 219000001) point at the genome files below |
| `/genomes/by_date/…` | two BAM files with their indexes and one VCF: public reads of the cell lines HCC1395 and HCC1395BL (SEQC2), on two windows of chromosome 21 – named as RE deliveries, and listed in `genome_file_paths_and_types` |
| `/gel_data_resources`, `/pgen_public_data_resources` | the folders the RE documentation describes, with READMEs, example scripts and `.netrc`/`.Rprofile` examples, the training reference, IGV's genome definitions, a small synthetic family for BCFtools' plugins (`/gel_data_resources/example_scripts/workshop_scripts/bcftools_plugins/`) and repeat-expansion examples for ExpansionHunter and REViewer (`…/workshop_scripts/repeat_expansions/`: a synthetic sample with a normal, an expanded and an X-linked CAG repeat, and the two programs' own examples, with a README and an LSF job script) and a synthetic cohort for relatedness with PLINK 2's KING-robust (`…/workshop_scripts/relatedness/`: a family, a duplicate sample under another family ID and unrelated people, with a README and an LSF job script) – all from genomics-wasm. With LabKeeper's rows go their genotypes: 7,200 common SNPs of every main-programme genome in PLINK format (`main_programme/aggregation/aggregate_gVCF_strelka/aggV2/additional_data/genotypes_plink/`), its principal components, inferred ancestries and KING relatedness (`…/additional_data/PCs_relatedness/`), and the same SNPs for the GMS genomes (`gms/aggregation/gms_germline_v5/additional_data/`) – synthetic too |

**Putting in other data.** For a whole class, edit or replace the files in `data/labkey/data/<release>/` – a TSV per table with the column names of the schema, listed in `index.json` with its number of rows (a table is read when it is first used). For one browser, *Settings Manager ▸ Data browser tables* loads a TSV file into a table. Files for `/genomes`, `/gel_data_resources` and `/pgen_public_data_resources` go into `data/fs/`; then run `python3 tools/build_fs_manifest.py`. A new data release is a schema (from its data dictionary, with `tools/build_labkey_schema.py`), a data folder, and an entry in `CONFIG.dataBrowser.projects` in `js/config.js`.

## Submissions to Google (Apps Script)

Research proposals and Airlock requests are kept in each student's browser and reviewed there. To receive a copy of every submission – for marking, or to review them yourself – deploy `apps-script/Code.gs` as a Google Apps Script web app and set `submissions.mode` to `'appsScript'` and `submissions.appsScriptUrl` in `js/config.js`; each submission then adds a row to a Google Sheet, and the Airlock's files are saved in a Drive folder. Step by step: [apps-script/README.md](apps-script/README.md). Not done yet: decisions made in the sheet are not sent back to the desktops.

## Settings: `js/config.js`

Names, host names and addresses live in one file: the environment's and the data browser's names (`LabKeeper`), the fake host names (`labkey.prod.aws.gel.ac`, `doublehelix.helix.prod.aws.gel.ac`), the HPC's queues and project codes, the data releases, the simulated websites and the whitelist, the submissions transport, the review delay and the 30-day rule, the training project, and where webR and Pyodide are loaded from. When the engine's files change, change `buildId`, so that browsers fetch its workers and modules again.

## What students keep, and privacy

Each student's files, settings, proposals and requests are kept by their browser for the site's address (IndexedDB and localStorage) – not on a server. They survive closing the page; they are lost if the browser's data for the site are cleared, and a private window keeps nothing. Files leave through the Airlock (approved exports are downloaded) or `download FILE` in the terminal.

The site sets no cookies and has no tracking. What leaves the computer: requests for the site's own files, R and Python and their packages (webR's and Pyodide's CDNs), the hosted genomes when chosen in IGV (igv.org, UCSC), the variant interpreter's queries to public web services, and – only if it is switched on – each submission to the instructor's Apps Script.

## Browser support and limits

Current Chrome, Edge, Firefox and Safari on a laptop or desktop with 8 GB of memory. It is a desktop: on a phone it works, cramped.

- The programs run in the browser, on one core each with a few gigabytes of memory at most: the training files work; a whole genome would not.
- The HPC is simulated: jobs run in the same browser, with LSF's states (PEND, RUN, DONE, EXIT), output files and messages.
- The hosted genomes in IGV (hg38, hg19) need the internet; the training genome does not.
- Whitelisted websites cannot be shown inside the simulated browser (they refuse to be framed): they open in a tab of the student's own browser.
- `man` pages of the programs show examples with the bioinformatics workbench's file names; the terminal says so. Apart from the tumour/normal BAM files in `/genomes`, the simulator has no example inputs for the programs (FASTQ files, RNA-seq, metagenomic databases …): bring them through the Airlock's import, or add them to `data/fs`.

## Files

```
index.html             the desktop (sign-in, panel, windows)
js/                    the desktop: window manager, panel, menus, dialogs, file manager,
                       text editor, web browser, IGV, Settings, and the services – the
                       data server (sql.js), LSF, environment modules, submissions
css/                   the Xubuntu (Greybird / elementary-xfce) look
sites/                 the websites of the RE that open in the web browser: labkeeper,
                       airlock, registry, home, variant-interpreter
assets/js, assets/css  the engine: shell, terminal, R, Python, RStudio, Spyder (see assets/ENGINE.md)
assets/r, assets/py    the Rlabkey and labkey stand-ins
assets/vendor          WebAssembly programs and libraries, with their licences and sources
assets/icons           the icon set (made by tools/make_icons.py)
assets/wallpaper       the desktop's wallpaper (its DNA helix drawn by tools/wallpaper_helix.py)
data/fs                the read-only folders (/genomes, /gel_data_resources, …) and their manifest
data/labkey            the data releases: schema and (synthetic) rows
apps-script            the Google Apps Script for submissions
tools                  build_fs_manifest.py, build_labkey_schema.py, make_icons.py, wallpaper_helix.py
tests/smoke.py         a smoke test in headless Chromium (Playwright): python3 tests/smoke.py
docs/ARCHITECTURE.md   how it is put together, and how to extend it
serve.py               a local server
```

## Credits and licences

The terminal, R, Python, RStudio and Spyder come from the engine of the comparativechrono workbenches ([bioinformatics-workbench](https://github.com/comparativechrono/bioinformatics-workbench), [r-workbench](https://github.com/comparativechrono/r-workbench)) – see [assets/ENGINE.md](assets/ENGINE.md). The bundled programs, libraries and data keep their own licences: [THIRD_PARTY.md](THIRD_PARTY.md). The variant interpreter is MIT-licensed ([sites/variant-interpreter/LICENSE](sites/variant-interpreter/LICENSE)).

Genomics England, the 100,000 Genomes Project, LabKey, IGV, RStudio, Spyder, Xubuntu, Xfce and IBM Spectrum LSF are names of their owners; the simulator imitates how they look and behave, for teaching, and contains none of their code beyond the open-source libraries listed in THIRD_PARTY.md. The descriptions of the RE's processes follow its public documentation, [re-docs.genomicsengland.co.uk](https://re-docs.genomicsengland.co.uk/).
