/* =====================================================================
   ExpansionHunter 5.0.0 and REViewer 0.2.7 – the Research Environment's
   modules ExpansionHunter/5.0.0 and REViewer/0.2.7 (RE simulator).

   The genomics-wasm project built both for the browser:
   assets/vendor/genomics-wasm/expansionhunter/5.0.0/ and reviewer/0.2.7/.
   Each command runs in a worker of its own (assets/js/threads-worker.mjs),
   as the other genomics-wasm programs do, with the files its arguments name
   and their indexes (a BAM's .bai, a FASTA's .fai, a bgzipped FASTA's .gzi).
   The workflow is upstream's:

     ExpansionHunter --reads S.bam --reference REF.fa --variant-catalog CAT.json --output-prefix S
         → S.vcf, S.json and S_realigned.bam (the reads it used – the BAMlet – not sorted)
     samtools sort -o S.sorted.bam S_realigned.bam && samtools index S.sorted.bam
     REViewer --reads S.sorted.bam --vcf S.vcf --reference REF.fa --catalog CAT.json --locus ID --output-prefix S
         → S.ID.svg (the picture: firefox S.ID.svg), S.metrics.tsv, S.phasing.tsv

   The builds run on one thread: ExpansionHunter's --threads (-n) is left
   out with a note, as the terminal does for the other programs.
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const W = MG.wasm;
  const T = MG.shellTools;
  if (!W || !W.ownWorker || !T || !MG.runReal) return;

  const PROGRAMS = {
    ExpansionHunter: { version: '5.0.0', module: 'expansionhunter/5.0.0/expansionhunter.mjs' },
    REViewer: { version: '0.2.7', module: 'reviewer/0.2.7/reviewer.mjs' },
  };
  for (const [name, p] of Object.entries(PROGRAMS)) {
    // (--output-prefix names no file: what the program writes is found afterwards)
    W.ownWorker[name] = { name, module: p.module, outputs: () => ['--output-prefix'] };
    if (W.versions) W.versions[name] = p.version;
  }

  /** ExpansionHunter -n/--threads N: the build counts on one thread (it refuses others) – the option is left out */
  function oneThread(args, io) {
    const out = [];
    let dropped = '';
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      const glued = /^--threads=(.*)$/.exec(a) || (/^-n(\d+)$/.exec(a));
      if (a === '--threads' || a === '-n') {
        if (args[i + 1] === '1') out.push(a, args[i + 1]);
        else dropped = `${a} ${args[i + 1] || ''}`.trim();
        i++;
        continue;
      }
      if (glued) {
        if (glued[1] === '1') out.push(a);
        else dropped = a;
        continue;
      }
      out.push(a);
    }
    if (dropped && io && io.note) io.note(`ExpansionHunter: ${dropped} left out – in the browser every program runs on one thread.`);
    return out;
  }

  async function run(ctx, name) {
    const given = ctx.args;
    if (name === 'ExpansionHunter') ctx.args = oneThread(ctx.args, ctx.io);
    try { return await MG.runReal(ctx, name); } finally { ctx.args = given; }
  }

  const D = '/gel_data_resources/example_scripts/workshop_scripts/repeat_expansions';
  T.ExpansionHunter = {
    version: PROGRAMS.ExpansionHunter.version,
    summary: 'Genotypes repeat expansions (short tandem repeats) from the reads of a BAM or CRAM file',
    man: `ExpansionHunter 5.0.0 (module load ExpansionHunter/5.0.0) · compiled program, running in your browser

Genotypes repeat expansions – short tandem repeats (STRs) – at the loci of a variant catalog (JSON), from the reads
of a BAM or CRAM file. It writes PREFIX.vcf, PREFIX.json and PREFIX_realigned.bam: the reads it used (the BAMlet).

  D=${D}
  ExpansionHunter --reads $D/synthetic/reads.bam --reference $D/synthetic/reference.fa \\
      --variant-catalog $D/synthetic/catalog.json --sex male --output-prefix sample
  grep -v '^##' sample.vcf | cut -f1,2,5,10     (REPCN: the repeat count of each allele; REPCI: its interval)
  samtools sort -o sample.sorted.bam sample_realigned.bam && samtools index sample.sorted.bam
                                                (the BAMlet, sorted and indexed: for REViewer)

  --sex male|female           female (the default) has two X chromosomes, male one
  --analysis-mode seeking|streaming   seeking (the default) needs the BAM's index
  --region-extension-length   how far around a locus to look for reads (1000; REViewer must be given the same)
  --aligner dag-aligner|path-aligner,  --log-level trace|debug|info|warn|error

The BAM (or CRAM) needs its index, the reference its .fai; the folder of the prefix must exist. Here the program runs
on one thread: --threads is left out. ${D}/README.txt has the whole
workflow, with REViewer and an LSF job script.`,
    run: (ctx) => run(ctx, 'ExpansionHunter'),
  };
  T.REViewer = {
    version: PROGRAMS.REViewer.version,
    summary: 'Draws the reads behind an ExpansionHunter repeat call (SVG), with allele depths and phasing',
    man: `REViewer 0.2.7 (module load REViewer/0.2.7) · compiled program, running in your browser

Draws the reads that ExpansionHunter assigned to each allele of a repeat – a picture, PREFIX.LOCUS.svg – and writes
the allele depths (PREFIX.metrics.tsv) and the phasing (PREFIX.phasing.tsv).

  D=${D}
  samtools sort -o sample.sorted.bam sample_realigned.bam && samtools index sample.sorted.bam
  REViewer --reads sample.sorted.bam --vcf sample.vcf --reference $D/synthetic/reference.fa \\
      --catalog $D/synthetic/catalog.json --locus EXPANDED_CAG --output-prefix sample
  firefox sample.EXPANDED_CAG.svg               (the picture, in the web browser of the desktop)
  cat sample.metrics.tsv sample.phasing.tsv

--locus takes a locus ID of the catalog, or several separated by commas (a picture each). Give REViewer the BAMlet
of ExpansionHunter, sorted and indexed, and the VCF, reference and catalog of the same run (and the same
--region-extension-length, 1000 by default). REViewer 0.2.7 cannot draw a locus whose catalog entry has a small
variant next to the repeat.`,
    run: (ctx) => run(ctx, 'REViewer'),
  };
})();
