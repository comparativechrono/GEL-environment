// =============================================================================
// Environment Modules (`module avail / load / list / unload / purge / spider`).
// The catalogue follows the software listed for the Ubuntu HPC in the RE docs.
// `provides` lists the commands that become available after loading; those
// commands are implemented (or simulated) by the terminal.
// =============================================================================

const CATALOGUE = {
  aliview: ['1.28'], annovar: ['2019Nov', '2024-03-14'], ant: ['1.9.16'], bamtools: ['2.5.2'],
  bcftools: ['1.16', '1.21'], beagle: ['5.4'], bedtools: ['2.30.0', '2.31.1'], bison: ['3.8.2'], blat: ['1.0'],
  boost: ['1.83', '1.84'], cargo: ['1.75.0'], cmake: ['3.24.0'], conform: ['2.2'], cromwell: ['v65'], curl: ['7.81.0'],
  eigen: ['3.3.9'], exomiser: ['13.3.0'], exonerate: ['2.2.0'], ExpansionHunter: ['3.2.2', '4.0.2', '5.0.0'],
  ExpansionHunterDenovo: ['0.9.0'], fetk: ['1.9.3'], flex: ['2.6.4'], gatk: ['4.5.0.0'], gcc: ['10.4.0'], gdal: ['3.7.0'],
  geos: ['3.12.2'], gmp: ['6.2.1'], go: ['1.22.2'], gsl: ['2.7'], haplocheck: ['1.3.3'], hipstr: ['0.7'], 'hla-la': ['1.0.3'],
  hmftools: ['2024-02-06'], htslib: ['1.18', '1.21'], inkscape: ['1.2.2'],
  java: ['1.8', '11.0.2', '17.0.2', '19.0.2', '21.0.2', '23.0.1'], jq: ['1.7.1'], king: ['2.3.2'], kraken: ['1.1.1'],
  kraken2: ['2.1.3'], libdeflate: ['1.20'], libffi: ['3.4.4'], libgit2: ['1.6.2'], libpcre: ['8.45'], libpng: ['1.6.40'],
  libtiff: ['4.7.0'], locuszoom: ['1.4'], m4: ['1.4.19'], magma: ['1.10'], maven: ['3.9.6'], miniconda: ['24.1.2'],
  MPFR: ['4.2.0'], mpc: ['1.3.1'], ncurses: ['6.4'],
  nextflow: ['22.10.5', '23.04', '23.10', '23.10-with-plugins', '24.04.2-with-plugins'], 'nf-core': ['0.3.1'],
  'nf-test': ['0.7.3', '0.8.2', '0.9.0'], openrefine: ['3.7.4'], openssl: ['1.1.1o', '1.1.1t', '3.6.0'], perl: ['5.38.2'],
  picard: ['3.1.1'], plink: ['1.9', '2.0', '2.00a3.3LM'], postgresql: ['16.2'], proj: ['8.2.1'], python: ['3.11', '3.13.9'],
  'qgrs-cpp': ['1.0'], qt: ['5.15.2'], R: ['4.3.3', '4.5.2'], regenie: ['3.4.1'], REViewer: ['0.2.7'], 'rtg-tools': ['3.12.1'],
  rust: ['1.75.0'], samtools: ['1.16.1', '1.21'], singularity: ['3.8.3', '4.1.1'], sniffles: ['1.0.11'], sqlite3: ['3.38.1'],
  strelka: ['2.9.10'], tabix: ['1.21'], udunits: ['2.2.28'], xz: ['5.4.7'], 'yt-dlp': ['2024.04.09'], zlib: ['1.3'],
};

// Commands each module family provides.
const PROVIDES = {
  bcftools: ['bcftools'], samtools: ['samtools'], htslib: ['tabix', 'bgzip', 'htsfile'], tabix: ['tabix', 'bgzip'],
  bedtools: ['bedtools'], bamtools: ['bamtools'], plink: ['plink', 'plink2'], R: ['R', 'Rscript'], python: ['python', 'python3', 'pip', 'jupyter'],
  java: ['java'], gatk: ['gatk'], picard: ['picard'], nextflow: ['nextflow'], regenie: ['regenie'], king: ['king'],
  jq: ['jq'], sqlite3: ['sqlite3'], singularity: ['singularity'], exomiser: ['exomiser'], ExpansionHunter: ['ExpansionHunter'],
  annovar: ['table_annovar.pl', 'annotate_variation.pl'], 'rtg-tools': ['rtg'], beagle: ['beagle'], perl: ['perl'],
  miniconda: ['conda'], kraken2: ['kraken2'], magma: ['magma'], strelka: ['configureStrelkaGermlineWorkflow.py'],
};

const DEFAULTS = { R: '4.3.3', python: '3.11', samtools: '1.21', bcftools: '1.21', htslib: '1.21', bedtools: '2.31.1', plink: '2.0', java: '17.0.2', nextflow: '24.04.2-with-plugins' };

// Commands available without loading anything.
export const BASE_COMMANDS = new Set(['python3', 'perl', 'curl', 'git', 'nano', 'vim', 'vi', 'less', 'R', 'Rscript', 'rstudio', 'igv', 'spyder']);

export function createModules() {
  const all = Object.entries(CATALOGUE).flatMap(([name, versions]) => versions.map(v => `${name}/${v}`));

  function find(spec) {
    if (!spec) return null;
    if (all.includes(spec)) return spec;
    const lower = spec.toLowerCase();
    const exact = all.find(m => m.toLowerCase() === lower);
    if (exact) return exact;
    const fam = Object.keys(CATALOGUE).find(k => k.toLowerCase() === lower.replace(/\/$/, ''));
    if (fam) return `${fam}/${DEFAULTS[fam] || CATALOGUE[fam][CATALOGUE[fam].length - 1]}`;
    return null;
  }

  function family(mod) { return mod.split('/')[0]; }

  return {
    all: () => all,
    find,
    family,
    defaults: DEFAULTS,

    /** `module avail [pattern]` output as text, laid out in columns. */
    avail(pattern = '', width = 100) {
      const p = pattern.toLowerCase();
      const list = all.filter(m => !p || m.toLowerCase().startsWith(p) || m.toLowerCase().includes(p))
        .map(m => (DEFAULTS[family(m)] && m.endsWith('/' + DEFAULTS[family(m)]) ? m + '(default)' : m));
      if (!list.length) return null;
      const head = ' /resources/tools/modules/ubuntu ';
      const dash = Math.max(4, Math.floor((width - head.length) / 2));
      const colW = Math.max(...list.map(s => s.length)) + 3;
      const cols = Math.max(1, Math.floor(width / colW));
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
      return `${'-'.repeat(dash)}${head}${'-'.repeat(dash)}\n${lines.join('\n')}\n\n  Where:\n   (default):  default module version for this family\n\nUse "module spider" to find all possible modules and extensions.\nUse "module keyword key1 key2 ..." to search for all possible modules matching any of the "keys".\n`;
    },

    commandsFor(mod) { return PROVIDES[family(mod)] || [family(mod).toLowerCase()]; },

    /** Which loaded module (if any) provides a command. */
    providerOf(cmd, loaded) {
      for (const m of loaded) if ((PROVIDES[family(m)] || []).includes(cmd)) return m;
      return null;
    },

    /** Module that would provide a command (for "command not found" hints). */
    suggestFor(cmd) {
      for (const [fam, cmds] of Object.entries(PROVIDES)) if (cmds.includes(cmd)) return `${fam}/${DEFAULTS[fam] || CATALOGUE[fam][CATALOGUE[fam].length - 1]}`;
      return null;
    },

    whatis(mod) {
      const fam = family(mod);
      return `${mod}: ${fam} — loads ${(PROVIDES[fam] || [fam]).join(', ')} into your PATH`;
    },

    show(mod) {
      const fam = family(mod);
      const v = mod.split('/')[1];
      return `-------------------------------------------------------------------\n   /resources/tools/modules/ubuntu/${mod}.lua:\n-------------------------------------------------------------------\nwhatis("${fam} ${v}")\nprepend_path("PATH","/resources/tools/apps/${fam}/${v}/bin")\nprepend_path("LD_LIBRARY_PATH","/resources/tools/apps/${fam}/${v}/lib")\n`;
    },
  };
}
