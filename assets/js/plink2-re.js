/* =====================================================================
   PLINK 2 in the Research Environment: relatedness (RE simulator).

   Genomics England computed the relatedness of its aggregated genomes (aggV2,
   aggV3) with PLINK 2's KING-robust: --make-king-table, and --king-cutoff 0.0442
   for the unrelated participants. The workshop in
   /gel_data_resources/example_scripts/workshop_scripts/relatedness/ does the same
   on a synthetic cohort. For the terminal, this file adds:
   - KING itself is not installed: typing  king  says so and points to PLINK 2;
   - man plink2 points to the workshop and describes the fault below;
   - a note after a run that the fault affects. With an odd number of samples,
     this build of PLINK 2 (genomics-wasm; plink-ng 7211906, 32-bit WebAssembly)
     gets the pairs of the first sample wrong in --make-king, --make-king-table,
     --king-cutoff and --distance. Builds without SSE2 transpose the genotypes
     with TransposeBitblock32, which writes the sample rows in pairs. The buffers
     it writes into hold exactly one row per sample (plink2_matrix_calc.cc:
     CalcKing, CalcDistance), so with an odd count the last pair writes one row
     past the end, over the start of the next buffer: the first sample's bits.
     The run's log says how many samples it kept, and when that number is odd,
     the terminal says so (a batch job writes it to its error file). This part
     goes once a fixed build is in.
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const T = MG.shellTools;
  if (!T || !T.plink2) return;
  const D = '/gel_data_resources/example_scripts/workshop_scripts/relatedness';

  if (MG.shellUtil && MG.shellUtil.ABSENT) {
    MG.shellUtil.ABSENT.unshift([/^king$/, `is not installed here. PLINK 2 computes KING's kinship coefficients (KING-robust), as Genomics England did for aggV2 and aggV3:  module load plink2/2.0.0-b.1-dev;  plink2 --bfile NAME --make-king-table --out NAME   (a workshop: ${D}/README.txt)`]);
  }

  T.plink2.man += `\n\nIn the Research Environment: relatedness as Genomics England computed it for aggV2 and aggV3 (KING-robust, then
--king-cutoff 0.0442), on a synthetic cohort with a family and a duplicate sample:
  ${D}/README.txt

A fault of this build: with an odd number of samples, --make-king, --make-king-table, --king-cutoff and --distance get
the pairs of the first sample wrong (the terminal says so when it happens). Keep the number of samples even: --remove
or --keep one sample more or fewer.`;

  // (an argument of PLINK 2 is an option when it starts with - and goes on with neither a digit nor a dot, as in tools-wasm.js)
  const plinkFlag = (a) => (a.length > 1 && a[0] === '-' && !/[\d.]/.test(a[1]) ? a.replace(/^--?/, '') : null);

  /** the option of a run that the fault touches, or '' */
  function faultyFlag(args) {
    const names = args.map(plinkFlag);
    const valuesOf = (i) => { let j = i + 1; while (j < args.length && names[j] == null) j++; return args.slice(i + 1, j); };
    if (names.includes('make-king')) return 'make-king';
    // (rel-check and --king-table-subset compute only some pairs, in another way: they come out right)
    const t = names.indexOf('make-king-table');
    if (t >= 0 && !valuesOf(t).includes('rel-check') && !names.includes('king-table-subset')) return 'make-king-table';
    // (--king-cutoff PREFIX VALUE reads a matrix made before; the log tells whether it computed one)
    if (names.includes('king-cutoff')) return 'king-cutoff';
    if (names.includes('distance')) return 'distance';
    return '';
  }

  async function oddNote(ctx, args) {
    const flag = faultyFlag(args);
    if (!flag) return;
    let out = 'plink2';
    args.forEach((a, i) => { if (plinkFlag(a) === 'out' && args[i + 1] != null && plinkFlag(args[i + 1]) == null) out = args[i + 1]; });
    const log = ctx.fs.resolve(`${out}.log`);
    if (!ctx.fs.exists(log)) return;
    const text = new TextDecoder().decode(await ctx.fs.readBytes(log));
    if (!new RegExp(`^--${flag}\\b[^\\n]*(variants processed|written)`, 'm').test(text)) return;
    const n = /^(\d+) samples? \([^)]*\) remaining after main filters\./m.exec(text) || /^(\d+) samples? \([^)]*\) loaded from /m.exec(text);
    if (!n || +n[1] % 2 === 0) return;
    const msg = `This build of PLINK 2 has a fault: with an odd number of samples (${n[1]} here), --${flag} gets every pair with the first sample wrong. Keep the number even: --remove or --keep one sample more or fewer (man plink2).`;
    if (ctx.term && ctx.io && ctx.io.note) ctx.io.note(`plink2: ${msg}`);
    else ctx.err(`plink2: ${msg}\n`);
  }

  const run0 = T.plink2.run;
  T.plink2.run = async (ctx) => {
    const args = ctx.args.slice();
    const status = await run0(ctx);
    if (status === 0) {
      try { await oddNote(ctx, args); } catch (e) { /* the note is a courtesy: never fail the command for it */ }
    }
    return status;
  };
})();
