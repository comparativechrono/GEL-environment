// =============================================================================
// Environment Modules (`module avail / load / list / unload / purge / spider /
// keyword / show / whatis`), as Lmod on the Research Environment.
//
// The catalogue is the software that this simulator really has – nothing is
// listed that cannot be run. Each module is a program (or a set of programs)
// that the terminal runs: compiled to WebAssembly (assets/vendor/biowasm,
// assets/vendor/genomics-wasm), Snakemake (assets/py/smk.py), R (webR) and
// Python (Pyodide). The versions are those of the programs themselves;
// tests/smoke.py checks them against the terminal's own list. SAMtools,
// BCFtools and HTSlib come in the RE's two versions, 1.16 and 1.21 (the
// genomics-wasm builds, with every BCFtools plugin; assets/js/hts-re.js runs
// the one whose module is loaded); as on the RE, the newest is the default and
// samtools and bcftools load their HTSlib with them. ExpansionHunter and
// REViewer have the RE's module names, with capitals (assets/js/repeats-re.js).
//
// Loading a module puts its folder on PATH and its name in LOADEDMODULES, as
// Lmod does; both are exported, so scripts, bash -c and LSF jobs inherit them.
// The terminal (assets/js/shell-re.js) refuses a module's commands until it is
// loaded – except R and Python, which the desktop has without a module (RStudio,
// Spyder) – unless an instructor turns that off (Settings ▸ Training).
// =============================================================================

export const MODULE_ROOT = '/resources/tools/modules/ubuntu';
export const APPS_ROOT = '/resources/tools/apps';

const HMMER = ['hmmbuild', 'hmmsearch', 'hmmscan', 'hmmpress', 'hmmfetch', 'hmmalign', 'hmmconvert', 'hmmemit', 'hmmstat', 'phmmer', 'jackhmmer', 'nhmmer', 'nhmmscan'];

/** The groups of `help`, in order. */
export const GROUPS = [
  ['reads', 'Reads: quality control, trimming, simulation'],
  ['align', 'Alignment and BAM/CRAM files'],
  ['variants', 'Variants: calling and VCF files'],
  ['somatic', 'Somatic variants (tumour/normal)'],
  ['repeats', 'Repeat expansions: short tandem repeats (STRs)'],
  ['popgen', 'Genotypes of many people: QC, LD, kinship, association'],
  ['rnaseq', 'RNA-seq: counts and abundances'],
  ['chip', 'ChIP-seq and ATAC-seq: peaks'],
  ['meta', 'Metagenomics: who is in the sample'],
  ['genes', 'Genes and proteins: gene finding, profile HMMs'],
  ['seq', 'Sequences, alignments and trees'],
  ['lang', 'Languages, pipelines and data'],
];

/**
 * name, version, the commands the module provides, group, a line about it.
 * base: the command works without loading the module (R and Python, as on the desktop).
 */
export const MODULES = [
  { name: 'fastp', version: '0.20.1', commands: ['fastp'], group: 'reads', what: 'quality control and trimming of FASTQ files (HTML and JSON report)' },
  { name: 'cutadapt', version: '5.2', commands: ['cutadapt'], group: 'reads', what: 'removes adapters, primers and poly-A; trims by quality' },
  { name: 'seqtk', version: '1.4', commands: ['seqtk'], group: 'reads', what: 'FASTQ/FASTA files: convert, subsample, trim, statistics' },
  { name: 'wgsim', version: '0.3.1-r13', commands: ['wgsim'], group: 'reads', what: 'simulates reads from a reference' },
  { name: 'minimap2', version: '2.22', commands: ['minimap2'], group: 'align', what: 'maps reads:  minimap2 -ax sr REF.fa R1.fastq R2.fastq' },
  { name: 'bowtie2', version: '2.4.2', commands: ['bowtie2', 'bowtie2-build', 'bowtie2-align-s', 'bowtie2-build-s'], group: 'align', what: 'maps short reads (bowtie2-build makes the index)' },
  { name: 'bwa', version: '0.7.19', commands: ['bwa'], group: 'align', what: 'maps short reads:  bwa index REF.fa;  bwa mem REF.fa R1 R2' },
  { name: 'bwa-mem2', version: '2.2.1', commands: ['bwa-mem2'], group: 'align', what: 'bwa mem, rewritten for speed' },
  { name: 'hisat2', version: '2.2.2', commands: ['hisat2', 'hisat2-build', 'hisat2-inspect'], group: 'align', what: 'maps RNA-seq reads across splice junctions' },
  { name: 'samtools', versions: ['1.16', '1.21'], commands: ['samtools'], group: 'align', what: 'SAM/BAM/CRAM: view, sort, index, flagstat, stats, depth, faidx …', requires: (v) => [`htslib/${v}`] },
  { name: 'htslib', versions: ['1.16', '1.21'], commands: ['bgzip', 'tabix', 'htsfile'], group: 'align', what: 'bgzip, tabix and htsfile: compress, index and identify files' },
  { name: 'tabix', versions: ['1.21'], commands: ['tabix', 'bgzip'], group: 'align', what: 'tabix and bgzip (those of HTSlib 1.21)' },
  { name: 'mosdepth', version: '0.3.14', commands: ['mosdepth'], group: 'align', what: 'read depth per base, window or region' },
  { name: 'bedtools', version: '2.31.0', commands: ['bedtools'], group: 'align', what: 'genome arithmetic: intersect, merge, genomecov, getfasta …' },
  { name: 'gffread', version: '0.12.7', commands: ['gffread'], group: 'align', what: 'GFF/GTF files: convert; transcript, CDS and protein sequences' },
  { name: 'bcftools', versions: ['1.16', '1.21'], commands: ['bcftools'], group: 'variants', what: 'view, query, filter, norm, mpileup, call, csq … and its plugins: +split-vep, +fill-tags, +mendelian …', requires: (v) => [`htslib/${v}`] },
  { name: 'freebayes', version: '1.3.6', commands: ['freebayes'], group: 'variants', what: 'calls variants:  freebayes -f REF.fa sorted.bam > calls.vcf' },
  { name: 'lofreq', version: '2.1.5', commands: ['lofreq'], group: 'somatic', what: 'low-frequency variants (lofreq call) and somatic variants (lofreq somatic)' },
  { name: 'somaticsniper', version: '1.0.5.0', commands: ['bam-somaticsniper', 'somaticsniper'], group: 'somatic', what: 'somatic SNVs:  bam-somaticsniper -F vcf -f REF.fa tumour.bam normal.bam out.vcf' },
  { name: 'strelka', version: '2.9.10', commands: ['configureStrelkaSomaticWorkflow.py', 'configureStrelkaGermlineWorkflow.py'], group: 'somatic', what: 'Strelka2 somatic SNVs and indels (configure, then RUNDIR/runWorkflow.py)' },
  { name: 'ExpansionHunter', version: '5.0.0', commands: ['ExpansionHunter'], group: 'repeats', what: 'genotypes repeat expansions:  ExpansionHunter --reads S.bam --reference REF.fa --variant-catalog CAT.json --output-prefix S' },
  { name: 'REViewer', version: '0.2.7', commands: ['REViewer'], group: 'repeats', what: 'draws the reads of a repeat call (SVG):  REViewer --reads S.sorted.bam --vcf S.vcf --reference REF.fa --catalog CAT.json --locus ID --output-prefix S' },
  { name: 'plink2', version: '2.0.0-b.1-dev', commands: ['plink2'], group: 'popgen', what: 'PLINK 2:  plink2 --vcf cohort.vcf.gz --freq --missing --hardy --out cohort' },
  { name: 'subread', version: '2.1.1', commands: ['featureCounts'], group: 'rnaseq', what: 'featureCounts: reads per gene' },
  { name: 'stringtie', version: '3.0.3', commands: ['stringtie'], group: 'rnaseq', what: 'assembles transcripts and their abundance' },
  { name: 'kallisto', version: '0.52.0', commands: ['kallisto'], group: 'rnaseq', what: 'transcript abundances by pseudoalignment' },
  { name: 'salmon', version: '2.8.0', commands: ['salmon'], group: 'rnaseq', what: 'transcript abundances by selective alignment' },
  { name: 'bustools', version: '0.45.1', commands: ['bustools'], group: 'rnaseq', what: 'single-cell RNA-seq: the BUS files of kallisto bus' },
  { name: 'macs3', version: '3.0.5', commands: ['macs3'], group: 'chip', what: 'peaks over a control:  macs3 callpeak -t chip.bam -c input.bam -g hs -n NAME' },
  { name: 'kraken2', version: '2.17.2', commands: ['kraken2', 'kraken2-build', 'kraken2-inspect'], group: 'meta', what: 'reads to taxa' },
  { name: 'bracken', version: '3.1', commands: ['bracken', 'bracken-build', 'est_abundance.py', 'generate_kmer_distribution.py', 'kmer2read_distr'], group: 'meta', what: 'species abundances from a Kraken2 report' },
  { name: 'prodigal', version: '2.6.3', commands: ['prodigal'], group: 'genes', what: 'genes of bacteria and archaea' },
  { name: 'hmmer', version: '3.4', commands: HMMER, group: 'genes', what: 'profile HMMs: hmmbuild, hmmsearch, hmmscan, phmmer, jackhmmer, nhmmer …' },
  { name: 'kalign', version: '3.3.1', commands: ['kalign'], group: 'seq', what: 'multiple alignment' },
  { name: 'muscle', version: '3.8.1551', commands: ['muscle'], group: 'seq', what: 'multiple alignment' },
  { name: 'fasttree', version: '2.1.11', commands: ['fasttree', 'FastTree'], group: 'seq', what: 'trees from alignments' },
  { name: 'seq-align', version: '2017.10.18', commands: ['needleman_wunsch', 'smith_waterman', 'lcs'], group: 'seq', what: 'pairwise global and local alignment' },
  { name: 'lastz', version: '1.04.52', commands: ['lastz'], group: 'seq', what: 'aligns long DNA sequences' },
  { name: 'R', version: '4.6.0', commands: ['R', 'Rscript'], group: 'lang', base: true, what: 'R (webR): R starts its console here;  Rscript script.R  runs a script' },
  { name: 'python', version: '3.13.2', commands: ['python', 'python3', 'pip', 'pip3'], group: 'lang', base: true, what: 'Python (Pyodide):  python3 script.py,  pip install NAME' },
  { name: 'snakemake', version: '9.27.0', commands: ['snakemake'], group: 'lang', what: 'workflows:  snakemake -n,  snakemake --cores 1' },
  { name: 'jq', version: '1.7', commands: ['jq'], group: 'lang', what: 'JSON on the command line' },
];

// one version (version) or several (versions: the last is the default, as Lmod takes the newest)
for (const m of MODULES) {
  m.versions = m.versions || [m.version];
  m.default = m.default || m.versions[m.versions.length - 1];
  m.version = m.default;
}
const BY_NAME = new Map(MODULES.map((m) => [m.name.toLowerCase(), m]));
/** command → the modules that provide it, in catalogue order (tabix: htslib, then tabix) */
const BY_COMMAND = new Map();
for (const m of MODULES) for (const c of m.commands) BY_COMMAND.set(c, (BY_COMMAND.get(c) || []).concat(m));

/** "samtools/1.21" → its module record */
const recordOf = (full) => BY_NAME.get(String(full).split('/')[0].toLowerCase()) || null;
const fullName = (m, v = m.default) => `${m.name}/${v}`;

export function createModules() {
  /** a name as typed (samtools, samtools/1.17, SAMTOOLS) → "samtools/1.17", or null if there is no such module */
  function find(spec) {
    if (!spec) return null;
    const [n, v] = String(spec).replace(/\/$/, '').split('/');
    const m = BY_NAME.get(n.toLowerCase());
    if (!m) return null;
    if (v !== undefined && !m.versions.includes(v)) return null;
    return fullName(m, v === undefined ? m.default : v);
  }

  const family = (mod) => (recordOf(mod) ? recordOf(mod).name : String(mod).split('/')[0]);

  function columns(list, width) {
    const colW = Math.max(...list.map((s) => s.length)) + 4;
    const cols = Math.max(1, Math.floor((width - 3) / colW));
    const rows = Math.ceil(list.length / cols);
    const lines = [];
    for (let r = 0; r < rows; r++) {
      let line = '';
      for (let c = 0; c < cols; c++) {
        const item = list[c * rows + r];
        if (item) line += item.padEnd(colW);
      }
      lines.push('   ' + line.trimEnd());
    }
    return lines.join('\n');
  }

  /** every module/version whose name contains pattern: [full name, record] */
  function match(pattern) {
    const p = String(pattern || '').toLowerCase();
    return MODULES.flatMap((m) => m.versions.map((v) => [fullName(m, v), m])).filter(([f]) => !p || f.toLowerCase().includes(p));
  }

  return {
    modules: () => MODULES.slice(),
    groups: GROUPS,
    all: () => MODULES.flatMap((m) => m.versions.map((v) => fullName(m, v))),
    find,
    family,
    root: MODULE_ROOT,

    /** the folder a module puts on PATH */
    binDir: (mod) => `${APPS_ROOT}/${mod}/bin`,

    /** `module avail [pattern]` as Lmod prints it, or null when nothing matches (loaded: the modules that are loaded) */
    avail(pattern = '', width = 100, loaded = []) {
      // (Lmod marks the modules that are loaded, and the default of a module that has several versions:
      // samtools/1.21 (L,D))
      const marks = { L: false, D: false };
      const list = match(pattern).map(([f, m]) => {
        const k = [loaded.includes(f) && 'L', m.versions.length > 1 && f === fullName(m) && 'D'].filter(Boolean);
        for (const x of k) marks[x] = true;
        return k.length ? `${f} (${k.join(',')})` : f;
      });
      if (!list.length) return null;
      const head = ` ${MODULE_ROOT} `;
      const left = Math.max(4, Math.floor((width - head.length) / 2));
      const legend = marks.L || marks.D ? `  Where:\n${marks.L ? '   L:  Module is loaded\n' : ''}${marks.D ? '   D:  Default Module\n' : ''}\n` : '';
      return `${'-'.repeat(left)}${head}${'-'.repeat(Math.max(4, width - left - head.length))}\n${columns(list, width)}\n\n${legend}` +
        'Use "module spider" to find all possible modules and extensions.\nUse "module keyword key1 key2 ..." to search for all possible modules matching any of the "keys".\n';
    },

    /** `module spider [name]` */
    spider(pattern = '') {
      const found = match(pattern);
      if (!found.length) return null;
      const ms = [...new Set(found.map(([, m]) => m))];
      const line = '----------------------------------------------------------------------------';
      if (pattern && ms.length === 1) {
        const m = ms[0];
        const one = found.length === 1 ? found[0][0] : null;
        return `\n${line}\n  ${m.name}: ${one || m.versions.map((v) => fullName(m, v)).join(', ')}\n${line}\n    Description:\n      ${m.what}\n\n` +
          (one ? '' : `     Versions:\n${m.versions.map((v) => `        ${fullName(m, v)}`).join('\n')}\n\n`) +
          `    Provides: ${m.commands.join(', ')}\n\n    This module can be loaded directly: module load ${one || fullName(m)}\n\n`;
      }
      return `\n${line}\nThe following is a list of the modules and extensions currently available:\n${line}\n` +
        ms.map((m) => `  ${m.name}: ${m.versions.map((v) => fullName(m, v)).join(', ')}\n    ${m.what}\n`).join('\n') +
        '\n----------------------------------------------------------------------------\nTo learn more about a package and how to load it, use "module spider" with its name:\n\n  $ module spider samtools\n----------------------------------------------------------------------------\n';
    },

    /** `module keyword WORD …`: the modules whose name, description or commands contain a word */
    keyword(words) {
      const ws = words.map((w) => w.toLowerCase());
      const ms = MODULES.filter((m) => ws.some((w) => [m.name, m.what, ...m.commands].join(' ').toLowerCase().includes(w)));
      if (!ms.length) return null;
      return `\n----------------------------------------------------------------------------\nThe following modules match your search criteria: "${words.join('", "')}"\n----------------------------------------------------------------------------\n\n` +
        ms.map((m) => `  ${m.name}: ${m.versions.map((v) => fullName(m, v)).join(', ')}\n    ${m.what}\n`).join('\n') + '\n';
    },

    /** the (first) module whose commands include cmd, whether or not it is loaded */
    moduleOf: (cmd) => (BY_COMMAND.get(cmd) || [])[0] || null,
    /** a command that needs its module loaded first (not R or Python) */
    isGated: (cmd) => (BY_COMMAND.get(cmd) || []).some((m) => !m.base),
    commandsFor: (mod) => (recordOf(mod) ? recordOf(mod).commands.slice() : []),
    /** the modules that loading this one loads first ("samtools/1.21" → ["htslib/1.21"]), as Lmod's depends_on */
    requires: (mod) => (recordOf(mod) && recordOf(mod).requires ? recordOf(mod).requires(mod.split('/')[1]) : []),

    /** which of the loaded modules ("samtools/1.21" …) provides cmd – the last loaded, which is first on PATH */
    providerOf(cmd, loaded) {
      const ms = BY_COMMAND.get(cmd) || [];
      for (let i = loaded.length - 1; i >= 0; i--) if (ms.some((m) => m.name === family(loaded[i]))) return loaded[i];
      return null;
    },

    /** the module to load for cmd (for "command not found" hints) */
    suggestFor: (cmd) => ((BY_COMMAND.get(cmd) || [])[0] ? fullName(BY_COMMAND.get(cmd)[0]) : null),

    whatis(mod) {
      const m = recordOf(mod);
      return `${mod}: ${m ? m.what : ''}`;
    },

    show(mod) {
      const m = recordOf(mod);
      const v = mod.split('/')[1];
      const deps = m.requires ? m.requires(v) : [];
      return `-------------------------------------------------------------------\n   ${MODULE_ROOT}/${mod}.lua:\n-------------------------------------------------------------------\nwhatis("Name: ${m.name}")\nwhatis("Version: ${v}")\nwhatis("Description: ${m.what}")\n${deps.map((d) => `depends_on("${d}")\n`).join('')}prepend_path("PATH","${APPS_ROOT}/${mod}/bin")\n`;
    },
  };
}
