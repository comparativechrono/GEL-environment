// =============================================================================
// The Airlock pre-check: an automated reading of the RE's export rules
// ("What you can and can't export" in the RE documentation), applied to the
// files and the form of an export request. It produces the findings the
// simulated Airlock Team decides on — and that students can learn from.
//
//   level: 'fail'  the request would be rejected
//          'warn'  needs a justification / may go to the Airlock Committee
//          'pass'  the check found nothing
// =============================================================================

const TEXT_EXT = /\.(txt|csv|tsv|tab|r|rmd|qmd|py|ipynb|sh|bash|nf|wdl|smk|cwl|md|markdown|json|ya?ml|log|out|err|cfg|conf|ini|sql|pl|java|js|c|cpp|h|tex|bib)$/i;
const OK_BINARY = /\.(pdf|png|jpe?g|svg|gif|tiff?|zip|docx|xlsx|pptx|odt|ods|odp)$/i;
const RAW_SEQ = /\.(bam|bai|cram|crai|sam|fastq|fq|fastq\.gz|fq\.gz|bcf|csi|g?vcf\.gz|g?vcf|tbi|bed\.gz|bigwig|bw)$/i;
const MODEL = /\.(pkl|pickle|joblib|h5|hdf5|onnx|pt|pth|ckpt|keras|tflite|safetensors|rds|rdata|rda)$/i;
const DB_FILE = /\.(sqlite|sqlite3|db|feather|parquet)$/i;

// identifiers that may never leave the RE (Genomics England IDs)
const ID_PATTERNS = [
  { re: /\bLP\d{7}-DNA_[A-H]\d{2}\b/g, what: 'plate keys (sample IDs)' },
  { re: /\b(?:HX|CH|BE)\d{8}\b/g, what: 'genome delivery IDs' },
  // (not part of chr:position notation, a decimal or a range)
  { re: /(?<![:\d.,_-])\b[12]\d{8}\b(?![:\d.,_-])/g, what: '100kGP participant or family IDs' },
  { re: /\bp\d{11}\b/gi, what: 'NHS GMS participant IDs' },
  { re: /\br\d{11}\b/gi, what: 'NHS GMS referral IDs' },
  { re: /\/genomes\/by_date\/[^\s,;"']+/g, what: 'paths to participants’ genome files' },
];

const COUNT_HEADER = /^(n|count|counts|n_.*|.*_n|num.*|number.*|.*_count|freq(uency)?|cases|controls|participants|individuals|patients|probands|carriers|total)$/i;
const AGE_HEADER = /^(age|age_.*|.*_age|age_at_.*|year_of_birth|yob|birth_year)$/i;
const DATE_HEADER = /(date_of_birth|dob|date_of_death|dod|birth_date|death_date|diagnosis_date|date_of_diagnosis)/i;

function splitRow(line, sep) { return line.split(sep).map(s => s.trim().replace(/^"|"$/g, '')); }

function scanTable(name, text, findings) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
  if (lines.length < 2) return;
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(',') ? ',' : null;
  if (!sep) return;
  const head = splitRow(lines[0], sep);
  const rows = lines.slice(1, 5001).map(l => splitRow(l, sep));
  head.forEach((col, i) => {
    const vals = rows.map(r => r[i]).filter(v => v !== undefined && v !== '');
    if (!vals.length) return;
    if (COUNT_HEADER.test(col)) {
      const small = vals.filter(v => /^[1-4]$/.test(v));
      if (small.length) findings.push({ level: 'fail', rule: 'counts', file: name, message: `Column "${col}" has ${small.length} non-zero count${small.length > 1 ? 's' : ''} below 5. Mask counts of 1–4 as "<5" (and make sure they can't be recalculated from totals).` });
      const masked = vals.some(v => /^<\s*5$/.test(v));
      const total = rows.some(r => /^total$/i.test(r[0] || ''));
      if (masked && total) findings.push({ level: 'warn', rule: 'counts-recalc', file: name, message: `"${col}" masks small counts but the table also has a total: check that a masked count can't be worked out from the total and the other counts.` });
    }
    if (AGE_HEADER.test(col)) {
      const exact = vals.filter(v => /^\d{1,3}(\.\d+)?$/.test(v));
      if (exact.length) findings.push({ level: 'fail', rule: 'age', file: name, message: `Column "${col}" gives exact ages or birth years. Ages must be given in ranges (10-year ranges are recommended, e.g. 40-49).` });
    }
    if (DATE_HEADER.test(col)) findings.push({ level: 'fail', rule: 'dates', file: name, message: `Column "${col}" contains dates about individuals (birth, death or diagnosis). These are identifying and can't be exported.` });
  });
  // participant-level rows: one row per person with phenotype columns
  const hasIdCol = head.some(c => /participant|patient|sample|platekey|family|individual|^id$/i.test(c));
  if (hasIdCol && rows.length > 0) findings.push({ level: 'warn', rule: 'individual', file: name, message: 'This table looks like individual-level data (one row per participant). Individual-level data are only exported in exceptional cases with a strong justification (see “Individual level data and case studies”).' });
  // variants with low counts / frequencies
  const posCols = head.some(c => /^(#?chrom|chr|chromosome)$/i.test(c)) && head.some(c => /^(pos|position|start|bp)$/i.test(c));
  const variantRows = posCols ? rows.length : rows.filter(r => r.some(v => /^(chr)?([0-9]{1,2}|X|Y|MT?)[:_-]\d+[:_-][ACGTN]+[:_-][ACGTN]+$/i.test(v) || /^rs\d+$/.test(v))).length;
  if (variantRows) {
    const afCol = head.findIndex(c => /^(af|maf|alt_freq|freq|allele_freq.*)$/i.test(c));
    const acCol = head.findIndex(c => /^(ac|alt_count|allele_count|mac)$/i.test(c));
    const rare = rows.filter(r => (afCol >= 0 && parseFloat(r[afCol]) < 0.005) || (acCol >= 0 && parseFloat(r[acCol]) < 20)).length;
    if (variantRows > 300 && rare) findings.push({ level: 'fail', rule: 'variants', file: name, message: `${variantRows} variants with ${rare} below the GWAS thresholds (MAF ≥ 0.005 and allele count ≥ 20). Bulk variant exports must apply these filters.` });
    else if (variantRows > 300) findings.push({ level: 'warn', rule: 'variants', file: name, message: `${variantRows} variants: bulk variant lists need a justification of their scientific value (data minimisation). Small lists (<300) selected for significance are usually fine.` });
    else findings.push({ level: 'pass', rule: 'variants', file: name, message: `${variantRows} variant${variantRows > 1 ? 's' : ''}: a small list, usually acceptable if selected for significance.` });
  }
}

/** a table without its genomic-position columns (positions are 9-digit numbers too) */
function withoutPositionColumns(text) {
  const lines = text.split(/\r?\n/);
  const sep = (lines[0] || '').includes('\t') ? '\t' : ',';
  const head = splitRow(lines[0] || '', sep);
  const drop = new Set(head.map((c, i) => (/^(pos|position|start|end|stop|bp|coord.*|loc.*|base_pair|chrom_?start|chrom_?end|.*_pos)$/i.test(c) ? i : -1)).filter(i => i >= 0));
  if (!drop.size) return text;
  return lines.map(l => splitRow(l, sep).filter((_, i) => !drop.has(i)).join(sep)).join('\n');
}

function scanIds(where, text, findings, level = 'fail') {
  const hits = [];
  for (const p of ID_PATTERNS) {
    const m = text.match(p.re);
    if (m && m.length) hits.push(`${m.length} × ${p.what} (e.g. ${m[0]})`);
  }
  if (hits.length) findings.push({ level, rule: 'ids', file: where, message: `Contains Genomics England identifiers: ${hits.join('; ')}. All participant, sample, family and plate key IDs must be removed (public sample IDs only with a justification).` });
  return hits.length > 0;
}

function scanSmallCountsInProse(where, text, findings) {
  const m = text.match(/\b(n\s*=\s*[1-4]|[1-4]\s+(participants?|patients?|individuals?|people|cases|probands|families))\b/gi);
  if (m) findings.push({ level: 'fail', rule: 'counts', file: where, message: `Mentions ${m.length > 1 ? 'counts' : 'a count'} below 5 (${m.slice(0, 3).join(', ')}). Counts of 1–4 must be given as "<5".` });
}

/**
 * request: {direction, form, rrNumber, description, justification, comments, participantList,
 *           files: [{name, path, size, text|null}]}
 * project: the Research Registry record for request.rrNumber (or null)
 * opts: {exportWaitDays, enforceWait, now}
 * → [{level, rule, file, message}]
 */
export function checkAirlockRequest(request, project, opts = {}) {
  const findings = [];
  const now = opts.now || Date.now();
  const waitDays = opts.exportWaitDays ?? 30;
  const isExport = request.direction !== 'import';

  // ---- the project
  if (!request.rrNumber) findings.push({ level: 'fail', rule: 'project', message: 'No Research Registry (RR) number: every transfer must belong to a registered project.' });
  else if (!project) findings.push({ level: 'fail', rule: 'project', message: `${request.rrNumber} is not a project in the Research Registry that you are a member of.` });
  else if (project.status !== 'approved') findings.push({ level: 'fail', rule: 'project', message: `Project ${project.id || request.rrNumber} has not been approved yet (status: ${project.status}).` });
  else if (isExport) {
    const days = Math.floor((now - (project.approvedAt || now)) / 864e5);
    if (days < waitDays && opts.enforceWait !== false) findings.push({ level: 'fail', rule: 'wait', message: `Project ${project.id} was approved ${days} day${days === 1 ? '' : 's'} ago. Exports are only possible once a project has been approved for at least ${waitDays} days (from ${new Date((project.approvedAt || now) + waitDays * 864e5).toLocaleDateString('en-GB')}).` });
    else findings.push({ level: 'pass', rule: 'wait', message: `Project ${project.id} has been approved for ${days} days.` });
  }

  // ---- the form itself follows the rules too
  const formText = [request.description, request.justification, request.comments].filter(Boolean).join('\n');
  if (isExport) {
    scanIds('the request form', formText, findings);
    scanSmallCountsInProse('the request form', formText, findings);
    if ((request.description || '').trim().split(/\s+/).length < 15) findings.push({ level: 'warn', rule: 'description', message: 'The description is very short. Describe everything in the files, expand all acronyms and explain anything ambiguous so a non-specialist can understand it.' });
    if ((request.justification || '').trim().split(/\s+/).length < 15) findings.push({ level: 'warn', rule: 'justification', message: 'The justification is very short. Explain why you need these files outside the RE and how you will use them (the approval only covers what you describe).' });
  }

  // ---- the files
  if (!request.files || !request.files.length) findings.push({ level: 'fail', rule: 'files', message: 'No files attached.' });
  for (const f of request.files || []) {
    const n = f.name;
    if (f.size > 5 * 1024 ** 3) findings.push({ level: 'fail', rule: 'size', file: n, message: 'Larger than 5 GB: split it into chunks of 4 GB or less (or ask the Airlock team about another route).' });
    if (!isExport) continue;
    if (RAW_SEQ.test(n)) { findings.push({ level: 'fail', rule: 'raw', file: n, message: 'Raw sequencing or genotype data (BAM, CRAM, FASTQ, VCF …) are never exported from the RE.' }); continue; }
    if (MODEL.test(n)) { findings.push({ level: 'fail', rule: 'model', file: n, message: /\.(rds|rdata|rda)$/i.test(n) ? 'R objects (.rds, .RData) can’t be reviewed and may contain individual-level data: export the final results as text or figures instead.' : 'Trained machine-learning models can’t be exported from the RE (only their test statistics and suitable outputs).' }); continue; }
    if (DB_FILE.test(n)) { findings.push({ level: 'fail', rule: 'binary', file: n, message: 'Database and binary data files can’t be reviewed by the Airlock team, so they are not exported. Export the final summary results as text.' }); continue; }
    if (/\.html?$/i.test(n)) findings.push({ level: 'warn', rule: 'html', file: n, message: 'HTML files should be converted to PDF (or another reviewable format) before export.' });
    if (/screen.?shot|screen.?capture/i.test(n)) findings.push({ level: 'warn', rule: 'screenshot', file: n, message: 'Screenshots of the RE are not allowed except IGV coverage views without IDs: make sure this is an exported figure, not a screenshot of the desktop.' });
    if (f.text !== null && f.text !== undefined) {
      const idHit = scanIds(n, /\.(csv|tsv|tab)$/i.test(n) ? withoutPositionColumns(f.text) : f.text, findings);
      if (/\.(csv|tsv|tab|txt)$/i.test(n)) scanTable(n, f.text, findings);
      if (!idHit && !/\.(csv|tsv|tab)$/i.test(n)) scanSmallCountsInProse(n, f.text, findings);
      if (/^##fileformat=VCF/m.test(f.text)) findings.push({ level: 'fail', rule: 'raw', file: n, message: 'This is a VCF file (individual genotypes): raw variant calls are not exported.' });
    } else if (!TEXT_EXT.test(n) && !OK_BINARY.test(n)) {
      findings.push({ level: 'fail', rule: 'binary', file: n, message: 'Binary files are not considered for export. Export results as text, tables, PDF or images.' });
    } else if (OK_BINARY.test(n) && /\.(png|jpe?g|svg|pdf|tiff?|gif)$/i.test(n)) {
      findings.push({ level: 'pass', rule: 'figure', file: n, message: 'A figure: check by eye that no group in it has fewer than 5 participants and that it shows no IDs.' });
    }
  }
  if (isExport && request.form === 'findings' && !request.participantList) {
    findings.push({ level: 'warn', rule: 'participant-list', message: 'No participant list attached: for exported findings, include a file listing the participant IDs whose data were used as input (it stays inside the RE for the Airlock team).' });
  }
  if (!findings.some(f => f.level !== 'pass')) findings.push({ level: 'pass', rule: 'summary', message: 'No problems were found by the automated checks. The Airlock team still reviews every file by hand.' });
  return findings;
}

/** The outcome the simulated Airlock team reaches from the findings. */
export function decide(findings) {
  const fails = findings.filter(f => f.level === 'fail');
  const warns = findings.filter(f => f.level === 'warn');
  if (fails.length) return { outcome: 'rejected', committee: false, reasons: fails.map(f => (f.file ? `${f.file}: ` : '') + f.message) };
  const committee = warns.some(f => f.rule === 'individual' || f.rule === 'variants');
  return { outcome: 'approved', committee, reasons: warns.map(f => (f.file ? `${f.file}: ` : '') + f.message) };
}
