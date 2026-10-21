/* =====================================================================
   SAMtools, BCFtools and HTSlib in the Research Environment's versions,
   1.16 and 1.21 (RE simulator).

   The genomics-wasm project built both releases of the three, matched, for
   the browser – with all 39 stock BCFtools plugins built into bcftools
   (+split-vep, +fill-tags, +trio-dnm2 …; 1.16 has +mendelian, 1.21 its
   successor +mendelian2): assets/vendor/genomics-wasm/hts/VERSION/ holds
   bcftools, samtools, bgzip, tabix and htsfile. Each command runs in a worker
   of its own (assets/js/threads-worker.mjs), as the other genomics-wasm
   programs do, with the files that its arguments name and their indexes (and
   the files named in a list – samtools merge -b, bcftools concat -f … – or in
   an option's value: bcftools view -i 'ID=@ids.txt', -S ^samples.txt).

   The version that runs is that of the module that is loaded – samtools/1.16
   or samtools/1.21; htslib/… or tabix/1.21 for bgzip, tabix and htsfile – as
   PATH decides on the RE. With the requirement of modules turned off and no
   module loaded, it is the default, 1.21. The terminal's own uses of bgzip
   (gzip, gunzip, zcat …) keep the Biowasm build of the shared program runner.
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const RE = window.RE;
  const W = MG.wasm;
  const T = MG.shellTools;
  if (!W || !W.ownWorker || !RE || !RE.services || !RE.services.modules) return;
  const M = RE.services.modules;
  const VERSIONS = ['1.16', '1.21'];
  const DEFAULT = '1.21';
  const TOOLS = ['samtools', 'bcftools', 'bgzip', 'tabix', 'htsfile'];
  const loadedOf = (env) => String((env && env.LOADEDMODULES) || '').split(':').filter(Boolean);

  // the options whose value is a file the program writes (it is not handed over as an input)
  const OUTPUTS = {
    samtools: (a) => (/^(fastq|fasta)$/.test(a[0] || '') ? ['-o', '-0', '-1', '-2', '-s'] : ['-o', '--output']),
    bcftools: () => ['-o', '--output', '--output-file'],
    bgzip: () => ['-o', '--output'],
    tabix: () => [],
    htsfile: () => [],
  };
  // the options whose value is a file that lists input files, one per line
  const LISTS = {
    samtools: (a) => (/^(merge|cat|coverage|mpileup)$/.test(a[0] || '') ? ['-b'] : a[0] === 'depth' ? ['-f'] : []),
    bcftools: (a) => (a[0] === 'concat' ? ['-f', '--file-list'] : a[0] === 'merge' ? ['-l', '--file-list'] : a[0] === 'mpileup' ? ['-b', '--bam-list'] : []),
  };
  // the files named inside an option's value: bcftools -i/-e 'ID=@ids.txt' (a file of IDs; a plugin's own -i after --
  // too), -S/-T/-M ^FILE (all but those of the file); samtools view -N ^FILE, -D TAG:FILE
  const valuesOf = (a, opts) => {
    const out = [];
    for (let i = 0; i < a.length; i++) {
      const m = /^(--[^=]+)=([\s\S]*)$/.exec(a[i]);
      if (m && opts.includes(m[1])) out.push(m[2]);
      else if (opts.includes(a[i]) && i + 1 < a.length) out.push(a[++i]);
    }
    return out;
  };
  // bgzip FILE writes FILE.gz, and bgzip -d FILE.gz writes FILE; one that is there already is not overwritten without
  // -f (bgzip asks first, at a terminal): that file is handed over too, so that bgzip finds it, as on the RE
  const BGZIP_VALUE = 'b@sIlo';
  const BGZIP_LONG_VALUE = ['--offset', '--index-name', '--compress-level', '--size', '--threads', '--output'];
  function bgzipTargets(a) {
    let d = false, elsewhere = false;
    const files = [];
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      if (x === '--') { files.push(...a.slice(i + 1)); break; }
      if (x.startsWith('--')) {
        const k = x.split('=')[0];
        if (k === '--decompress') d = true;
        // (to the standard output, into the file of -o, or no output: test, reindex)
        if (['--stdout', '--output', '--test', '--reindex', '--offset', '--size'].includes(k)) elsewhere = true;
        if (BGZIP_LONG_VALUE.includes(k) && !x.includes('=')) i++;
      } else if (x.length > 1 && x[0] === '-') {
        for (let j = 1; j < x.length; j++) {
          const c = x[j];
          if (c === 'd') d = true;
          if ('ctrobs'.includes(c)) elsewhere = true;
          if (BGZIP_VALUE.includes(c)) { if (j === x.length - 1) i++; break; }
        }
      } else if (x !== '-') files.push(x);
    }
    if (elsewhere) return [];
    return files.map((f) => (d ? f.replace(/\.[^./]*$/, '') : f + '.gz')).filter((f) => f && !f.endsWith('/'));
  }
  const NAMED = {
    bcftools: (a) => [
      ...valuesOf(a, ['-i', '-e', '--include', '--exclude']).flatMap((x) => Array.from(x.matchAll(/@([^\s'"()&|,;]+)/g), (m) => m[1])),
      ...valuesOf(a, ['-S', '--samples-file', '-T', '--targets-file', '-M', '--mask-file']).filter((x) => x.startsWith('^')).map((x) => x.slice(1)),
    ],
    samtools: (a) => (a[0] !== 'view' ? [] : [
      ...valuesOf(a, ['-N', '--qname-file']).filter((x) => x.startsWith('^')).map((x) => x.slice(1)),
      ...valuesOf(a, ['-D', '--tag-file']).filter((x) => x.includes(':')).map((x) => x.slice(x.indexOf(':') + 1)),
    ]),
    bgzip: (a) => bgzipTargets(a),
  };
  for (const v of VERSIONS) {
    for (const tool of TOOLS) {
      // (tty: a command typed without a pipe or redirect into it reads from the terminal – samtools view and bcftools
      // view with no file print their usage, as on the RE)
      W.ownWorker[`${tool}@${v}`] = { name: tool, module: `hts/${v}/${tool}.mjs`, outputs: OUTPUTS[tool], lists: LISTS[tool], named: NAMED[tool], tty: true };
    }
  }

  /** the build that a command runs: samtools@1.21 … (program: as the terminal knows it) */
  W.programKey = (program, ctx) => {
    if (!TOOLS.includes(program) || !ctx) return program;
    // (gzip, gunzip, zcat and zgrep run bgzip themselves: the Biowasm build, as before)
    if (ctx.name && ctx.name !== program) return program;
    const mod = M.providerOf(program, loadedOf(ctx.env));
    const v = mod ? mod.split('/')[1] : DEFAULT;
    return VERSIONS.includes(v) ? `${program}@${v}` : program;
  };

  /** the top folders of the RE, so that a path written in a file a program reads names the same file there */
  W.workerRoots = (fs) => {
    const roots = ['/genomes', '/gel_data_resources', '/pgen_public_data_resources', '/re_gecip', '/re_scratch', '/resources', '/discovery_forum', '/hpc_home']
      .filter((r) => fs.isDir(r)).map((r) => [r, r]);
    if (fs.isDir('/pgen_public_data_resources')) roots.push(['/pgen_public_data_resources', '/public_data_resources']);
    return roots;
  };

  W.htsVersions = VERSIONS.slice();
  const versions = VERSIONS.join(' and ');
  const header = (name, mod) => `${name} ${versions} (module load ${mod}/1.16 or ${mod}/1.21) · compiled programs, running in your browser`;
  for (const [name, mod] of [['samtools', 'samtools'], ['bcftools', 'bcftools'], ['bgzip', 'htslib'], ['tabix', 'htslib'], ['htsfile', 'htslib']]) {
    const t = T[name];
    if (!t) continue;
    t.version = DEFAULT;
    const examples = String(t.man || '').split('\n\n').slice(1).join('\n\n');
    t.man = `${header(name, mod)}\n\n${examples}` + (name === 'bcftools'
      ? '\n\nThe plugins are built in:  bcftools plugin -l  lists them;  bcftools +split-vep -h  (or +NAME -h) shows one\'s options.\n  bcftools +split-vep calls.vcf.gz -f \'%CHROM\\t%POS\\t%Consequence\\t%SYMBOL\\n\' -d\n  bcftools +fill-tags in.vcf.gz -Oz -o out.vcf.gz -- -t AN,AC,AF\n  bcftools +mendelian2 trio.vcf.gz -P family.ped -m c        (1.16: +mendelian -p family.ped)'
      : '');
  }
  // bgzip asks before it overwrites a file (and before it decompresses one whose extension it does not know); a
  // program here cannot wait for an answer – it reads its input as it starts – so the answer is no: say what to do
  if (T.bgzip) {
    const run0 = T.bgzip.run;
    T.bgzip.run = async (ctx) => {
      const code = await run0(ctx);
      const asked = code === 2 && !ctx.stdin && !ctx.inherit && W.programKey && W.programKey('bgzip', ctx) !== 'bgzip' &&
        !ctx.args.some((x) => x === '--force' || /^-[^-]*f/.test(x)) && bgzipTargets(ctx.args).length;
      if (asked && ctx.io && ctx.io.note) ctx.io.note('bgzip asked a question, and a program in this terminal cannot wait for your answer: it was taken as no. To overwrite (or to decompress all the same), give -f:  bgzip -f …');
      return code;
    };
  }
  if (T.bcftools) T.bcftools.summary = 'Variant calling, filtering and VCF/BCF operations – with all its plugins (+split-vep, +fill-tags …)';
})();
