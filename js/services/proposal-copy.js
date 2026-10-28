// =============================================================================
// The applicant's copy of an approved Research Registry proposal: a PDF with the
// project's details, every section of the proposal as it was approved, the
// declarations and the review.
//
// The PDF is written here, with no library: A4 pages in the standard Helvetica
// fonts (which every PDF reader has, so nothing is embedded), text wrapped with
// Helvetica's own character widths. Those fonts show the Windows-1252
// characters (accents, curly quotes, dashes, £, €, ±, ×, µ, ²); anything else
// that a proposal might contain is spelt out (≥ as >=, β as beta) or shown as ?.
//
// When a project is approved, js/services/submissions.js downloads this copy to
// the person's own computer (outside the Research Environment), unless
// CONFIG.submissions.downloadApprovedProposal is false; the project's page in
// the Registry (sites/registry/registry.js) can download it again.
// =============================================================================

/** The declarations of the proposal form (the Registry's form shows the same texts). */
export const DECLARATIONS = {
  training: 'I have completed the Research Environment training and I will follow its rules.',
  inside: 'The data will only be analysed inside the Research Environment; only results approved through the Airlock will leave it.',
  noreid: 'I will not try to identify, or to contact, any participant.',
  publication: 'I will follow the publication policy: results are shared with Genomics England before they are published.',
};

const STATUS = { draft: 'Draft', submitted: 'Submitted', screening: 'Screening', review: 'In review', approved: 'Approved', revisions: 'Revisions requested', rejected: 'Not approved' };
const DAY = 864e5;

// ------------------------------------------------------------------ text
// Helvetica and Helvetica-Bold: the width of each character 32–255 of WinAnsiEncoding, in 1/1000 of the font size
// (from the fonts' AFM metrics). Helvetica-Oblique has Helvetica's widths.
const WIDTHS = {
  F1: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],
  F2: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556],
};
WIDTHS.F3 = WIDTHS.F1;

// the characters of Windows-1252 between 0x80 and 0x9F
const CP1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E,
  0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
// what to write for characters the standard fonts don't have
const SPELL = {
  '≥': '>=', '≤': '<=', '≠': '!=', '≈': '~', '∼': '~', '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '⇔': '<=>', '↑': '^', '↓': 'v',
  '−': '-', '‐': '-', '‑': '-', '‒': '-', '―': '-', '′': "'", '″': '"', '√': 'sqrt', '∞': 'infinity', '∑': 'sum', '∏': 'product', '∫': 'integral',
  '∈': 'in', '∉': 'not in', '∩': 'and', '∪': 'or', '∧': 'and', '∨': 'or', '∝': 'proportional to', '∆': 'Delta', '∂': 'd', 
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', ζ: 'zeta', η: 'eta', θ: 'theta', ι: 'iota', κ: 'kappa', λ: 'lambda', μ: 'µ', ν: 'nu', ξ: 'xi',
  π: 'pi', ρ: 'rho', σ: 'sigma', ς: 'sigma', τ: 'tau', υ: 'upsilon', φ: 'phi', χ: 'chi', ψ: 'psi', ω: 'omega',
  Γ: 'Gamma', Δ: 'Delta', Θ: 'Theta', Λ: 'Lambda', Ξ: 'Xi', Π: 'Pi', Σ: 'Sigma', Φ: 'Phi', Ψ: 'Psi', Ω: 'Omega',
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'ı': 'i', 'Ħ': 'H', 'ħ': 'h',
  '✓': 'yes', '✔': 'yes', '✗': 'no', '✘': 'no', '◦': '-', '▪': '-', '★': '*', '\u2009': ' ', '\u200A': ' ', '\u2002': ' ', '\u2003': ' ', '\u202F': ' ', '\u200B': '', '\uFEFF': '',
};

// superscripts: a run the fonts can't show is written after a caret (10⁻⁸ as 10^-8); ¹, ² and ³ they have
const SUPER = { '\u2070': '0', '\u00B9': '1', '\u00B2': '2', '\u00B3': '3', '\u2074': '4', '\u2075': '5', '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9', '\u207A': '+', '\u207B': '-', '\u207D': '(', '\u207E': ')' };
const superscripts = (s) => s.replace(/[\u2070\u00B9\u00B2\u00B3\u2074-\u207B\u207D\u207E]+/g, (run) => (/^[\u00B9\u00B2\u00B3]+$/.test(run) ? run : `^${[...run].map((c) => SUPER[c]).join('')}`));

/** A string in WinAnsiEncoding: one character (code 0–255) per byte. */
function winAnsi(s) {
  let out = '';
  for (const ch of superscripts(String(s ?? '').normalize('NFC'))) {
    const c = ch.codePointAt(0);
    if (c === 9) out += '    ';
    else if (c < 32 || c === 127) continue;
    else if (c < 127 || (c >= 0xA0 && c <= 0xFF)) out += ch;
    else if (CP1252[c]) out += String.fromCharCode(CP1252[c]);
    else if (ch in SPELL) out += winAnsi(SPELL[ch]);
    else {
      // a letter with an accent the fonts don't have: the letter without it
      const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      out += base !== ch && [...base].every((b) => b.codePointAt(0) < 0x100) ? base : '?';
    }
  }
  return out;
}

const textWidth = (s, font, size) => { let w = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); w += c >= 32 ? WIDTHS[font][c - 32] || 0 : 0; } return (w * size) / 1000; };

/** Break a WinAnsi string into lines no wider than width (the first line can be narrower). */
function wrap(s, font, size, width, firstWidth = width) {
  const lines = [];
  let cur = '';
  const limit = () => (lines.length ? width : firstWidth);
  for (const word of s.split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (textWidth(next, font, size) <= limit()) { cur = next; continue; }
    if (cur) { lines.push(cur); cur = ''; }
    let rest = word;
    while (textWidth(rest, font, size) > limit()) {   // a word longer than a line (a web address): break it
      let k = rest.length - 1;
      while (k > 1 && textWidth(rest.slice(0, k), font, size) > limit()) k--;
      lines.push(rest.slice(0, k));
      rest = rest.slice(k);
    }
    cur = rest;
  }
  if (cur || !lines.length) lines.push(cur);
  return lines;
}

// ------------------------------------------------------------------ the page
const PAGE_W = 595.28, PAGE_H = 841.89;              // A4, in points
const LEFT = 56.7, RIGHT = PAGE_W - 56.7, TOP = PAGE_H - 54, BOTTOM = 70;
const WIDTH = RIGHT - LEFT;
const INK = [0.114, 0.153, 0.2], MUTED = [0.357, 0.42, 0.478], GREEN = [0.122, 0.478, 0.337], RULE = [0.867, 0.89, 0.918], PALE = [0.89, 0.957, 0.925], GREY = [0.961, 0.969, 0.98];
const num = (v) => (Math.round(v * 100) / 100).toString();
const rgb = (c) => c.map(num).join(' ');
const literal = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, (c) => `\\${c.charCodeAt(0).toString(8).padStart(3, '0')}`);

class Layout {
  constructor() { this.pages = []; this.newPage(); }
  newPage() { this.ops = []; this.pages.push(this.ops); this.y = TOP; }
  /** Start a new page unless there is room for h points. */
  room(h) { if (this.y - h < BOTTOM) this.newPage(); }
  draw(x, y, s, font, size, colour) { if (s) this.ops.push(`BT /${font} ${num(size)} Tf ${rgb(colour)} rg ${num(x)} ${num(y)} Td (${literal(s)}) Tj ET`); }
  hline(x1, x2, y, colour, w) { this.ops.push(`${rgb(colour)} RG ${num(w)} w ${num(x1)} ${num(y)} m ${num(x2)} ${num(y)} l S`); }
  rect(x, y, w, h, fill, stroke) { this.ops.push(`${fill ? `${rgb(fill)} rg ` : ''}${stroke ? `${rgb(stroke)} RG 0.6 w ` : ''}${num(x)} ${num(y)} ${num(w)} ${num(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`); }
  /** One line of text, below the last. */
  line(s, x, font, size, colour, leading) { this.room(leading); this.y -= leading; this.draw(x, this.y, s, font, size, colour); }
  /** Text (with its own line breaks) wrapped to the width from x. */
  text(raw, { x = LEFT, width = RIGHT - x, font = 'F1', size = 10, colour = INK, leading = size * 1.42 } = {}) {
    for (const para of String(raw ?? '').replace(/\r\n?/g, '\n').split('\n')) {
      if (!para.trim()) { this.y -= leading * 0.5; continue; }
      for (const l of wrap(winAnsi(para), font, size, width)) this.line(l, x, font, size, colour, leading);
    }
  }
  /** A numbered section heading, kept with the first lines of what follows. */
  heading(n, title) {
    this.y -= 14;
    this.room(64);
    this.y -= 15;
    if (n) this.draw(LEFT, this.y, String(n), 'F2', 12.5, GREEN);
    this.draw(LEFT + (n ? 20 : 0), this.y, winAnsi(title), 'F2', 12.5, INK);
    this.hline(LEFT, RIGHT, this.y - 6, RULE, 0.7);
    this.y -= 9;
  }
}

/** The pages and the document information → the bytes of a PDF file. */
function pdfFile(pages, info) {
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const catalog = add(null), pageTree = add(null);
  const fonts = ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique'].map((f) => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`));
  const resources = `<< /Font << /F1 ${fonts[0]} 0 R /F2 ${fonts[1]} 0 R /F3 ${fonts[2]} 0 R >> >>`;
  const kids = pages.map((ops) => {
    const stream = ops.join('\n');
    const contents = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    return add(`<< /Type /Page /Parent ${pageTree} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources ${resources} /Contents ${contents} 0 R >>`);
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pageTree} 0 R >>`;
  objects[pageTree - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  // document information: text strings in UTF-16 when they are not plain ASCII
  const pdfText = (s) => (/^[\x20-\x7e]*$/.test(s) ? `(${literal(s)})` : `<FEFF${[...String(s)].map((ch) => {
    const c = ch.codePointAt(0);
    const units = c > 0xFFFF ? [0xD800 + ((c - 0x10000) >> 10), 0xDC00 + ((c - 0x10000) & 0x3FF)] : [c];
    return units.map((u) => u.toString(16).padStart(4, '0').toUpperCase()).join('');
  }).join('')}>`);
  const d = new Date();
  const p2 = (v) => String(v).padStart(2, '0');
  const stamp = `D:${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
  const infoObj = add(`<< ${Object.entries(info).filter(([, v]) => v).map(([k, v]) => `/${k} ${pdfText(v)}`).join(' ')} /CreationDate (${stamp}) >>`);
  // the file: header, objects, cross-reference table, trailer
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  objects.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xFF;
  return bytes;
}

// ------------------------------------------------------------------ the copy
const day = (t) => (t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const when = (t) => (t ? `${day(t)}, ${new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '');
const fileSafe = (s) => String(s || '').replace(/[^\w.-]+/g, '_');

/**
 * The copy of an approved proposal.
 * p: the project record (js/services/submissions.js); who: { username, fullName, site, exportWaitDays }.
 * Returns { name, bytes }: the file name (RR number, username) and the PDF.
 */
export function proposalCopy(p, who = {}) {
  const username = who.username || (p.members || [])[0] || '';
  const name = `${fileSafe(p.id || p.ref)}_${fileSafe(username)}_approved_proposal.pdf`;
  const wait = who.exportWaitDays ?? 30;
  const L = new Layout();
  const notGiven = () => L.line('Not given.', LEFT, 'F3', 10, MUTED, 14.2);

  // the heading of the first page
  L.line(winAnsi('RESEARCH REGISTRY · APPROVED PROJECT PROPOSAL'), LEFT, 'F2', 8.5, GREEN, 9);
  L.line(winAnsi(p.id || p.ref), LEFT, 'F2', 26, GREEN, 30);
  for (const l of wrap(winAnsi(p.title || '(untitled)'), 'F2', 16.5, WIDTH)) L.line(l, LEFT, 'F2', 16.5, INK, 21);
  L.y -= 22;
  const badge = winAnsi('Approved'), bw = textWidth(badge, 'F2', 9) + 14;
  L.rect(LEFT, L.y - 4.5, bw, 15, PALE);
  L.draw(LEFT + 7, L.y, badge, 'F2', 9, GREEN);
  L.draw(LEFT + bw + 8, L.y, winAnsi(when(p.approvedAt)), 'F1', 10.5, INK);
  L.y -= 13;
  L.hline(LEFT, RIGHT, L.y, GREEN, 2.2);
  L.y -= 14;
  const note = wrap(winAnsi('This is the applicant’s copy of a proposal approved in the Research Environment simulator, a training copy of the Genomics England Research Environment. It is not a Genomics England document.'), 'F1', 8.5, WIDTH - 20);
  const nh = note.length * 11.5 + 11;
  L.rect(LEFT, L.y - nh, WIDTH, nh, GREY, RULE);
  L.y -= 3;
  for (const l of note) L.line(l, LEFT + 10, 'F1', 8.5, MUTED, 11.5);
  L.y -= 8;

  // 1. the project: a two-column list
  L.heading(1, 'The project');
  const rows = [
    ['Project ID', p.id], ['Proposal reference', p.ref],
    ['Lead applicant', [p.lead?.name, p.lead?.institution].filter(Boolean).join(', ')],
    ['Research Environment user', [username, who.fullName && who.fullName !== username ? `(${who.fullName})` : ''].filter(Boolean).join(' ')],
    ['Research domain', p.domain], ['Collaborators', p.collaborators],
    ['Submitted', when(p.submittedAt)], ['Approved', when(p.approvedAt)], ['LSF project code', p.lsfCode],
    ['Airlock exports', p.approvedAt ? `Possible from ${day(p.approvedAt + wait * DAY)} (${wait} days after approval).` : ''],
  ].filter(([, v]) => v);
  for (const [label, value] of rows) {
    const ls = wrap(winAnsi(label), 'F1', 9.5, 140), vs = wrap(winAnsi(value), 'F1', 9.5, WIDTH - 150);
    const n = Math.max(ls.length, vs.length);
    L.room(n * 13.5 + 2);
    for (let i = 0; i < n; i++) {
      L.y -= 13.5;
      L.draw(LEFT, L.y, ls[i] || '', 'F1', 9.5, MUTED);
      L.draw(LEFT + 150, L.y, vs[i] || '', 'F1', 9.5, INK);
    }
  }

  // 2–7. the sections of the form
  const prose = (n, title, value) => { L.heading(n, title); if (String(value || '').trim()) L.text(String(value).trim()); else notGiven(); };
  prose(2, 'Lay summary', p.laySummary);
  prose(3, 'Scientific abstract', p.scientificAbstract);
  L.heading(4, 'Aims and objectives');
  const aims = (p.aims || []).map((a) => String(a || '').trim()).filter(Boolean);
  if (!aims.length) notGiven();
  aims.forEach((a, i) => {
    const ls = wrap(winAnsi(a), 'F1', 10, WIDTH - 18);
    ls.forEach((l, j) => { L.line(l, LEFT + 18, 'F1', 10, INK, 14.2); if (!j) L.draw(LEFT, L.y, `${i + 1}.`, 'F1', 10, INK); });
  });
  L.heading(5, 'Data requested');
  if (!(p.dataRequested || []).length) notGiven();
  for (const d of p.dataRequested || []) {
    wrap(winAnsi(d), 'F1', 10, WIDTH - 14).forEach((l, j) => { L.line(l, LEFT + 14, 'F1', 10, INK, 14.2); if (!j) L.draw(LEFT + 2, L.y, '\x95', 'F1', 10, GREEN); });
  }
  prose(6, 'Methods', p.methods);
  prose(7, 'Benefit to patients and participants', p.benefit);

  // 8. the declarations, each with a ticked box
  L.heading(8, 'Declarations');
  const agreed = Object.entries(DECLARATIONS).filter(([k]) => p.declarations && p.declarations[k]);
  if (!agreed.length) L.line('None recorded.', LEFT, 'F3', 10, MUTED, 14.2);
  else L.line('The applicant agreed to the following.', LEFT, 'F1', 10, INK, 14.2);
  L.y -= 2;
  for (const [, t] of agreed) {
    wrap(winAnsi(t), 'F1', 10, WIDTH - 18).forEach((l, j) => {
      L.line(l, LEFT + 18, 'F1', 10, INK, 14.2);
      if (!j) {
        const x = LEFT + 1, y = L.y - 1;
        L.rect(x, y, 8.5, 8.5, null, GREEN);
        L.ops.push(`${rgb(GREEN)} RG 1.1 w ${num(x + 1.8)} ${num(y + 4.4)} m ${num(x + 3.6)} ${num(y + 2.2)} l ${num(x + 7)} ${num(y + 6.8)} l S`);
      }
    });
  }

  // the review, event by event
  L.heading(0, 'Review');
  (p.history || []).forEach((e, i) => {
    const status = winAnsi(`${i + 1}.  ${STATUS[e.status] || e.status}.`);
    const sw = textWidth(status, 'F2', 10) + textWidth(' ', 'F1', 10);
    const ls = wrap(winAnsi(e.note || ''), 'F1', 10, WIDTH - 18, WIDTH - sw);
    L.room(ls.length * 14.2 + 14);
    ls.forEach((l, j) => {
      if (!j) { L.line(status, LEFT, 'F2', 10, INK, 14.2); L.draw(LEFT + sw, L.y, l, 'F1', 10, INK); } else L.line(l, LEFT + 18, 'F1', 10, INK, 14.2);
    });
    L.line(winAnsi(`${when(e.t)}${e.by && e.by !== 'system' ? ` · ${e.by}` : ''}`), LEFT + 18, 'F1', 8.5, MUTED, 12);
    L.y -= 3;
  });

  // the last words, then the footer of every page
  L.y -= 10;
  L.text(`Downloaded from the Research Registry of the Research Environment simulator${who.site ? ` (${who.site})` : ''} on ${when(Date.now())}.`, { size: 8.5, colour: MUTED, leading: 11.5 });
  const pages = L.pages.length;
  L.pages.forEach((ops, i) => {
    const left = winAnsi(`${p.id || p.ref} · ${username} · approved project proposal (Research Environment simulator)`);
    const right = `Page ${i + 1} of ${pages}`;
    ops.push(`${rgb(RULE)} RG 0.6 w ${num(LEFT)} 46 m ${num(RIGHT)} 46 l S`);
    ops.push(`BT /F1 8 Tf ${rgb(MUTED)} rg ${num(LEFT)} 34 Td (${literal(left)}) Tj ET`);
    ops.push(`BT /F1 8 Tf ${rgb(MUTED)} rg ${num(RIGHT - textWidth(right, 'F1', 8))} 34 Td (${literal(right)}) Tj ET`);
  });

  const bytes = pdfFile(L.pages, {
    Title: `${p.id || p.ref}: ${p.title || ''}`,
    Author: [p.lead?.name, username ? `(${username})` : ''].filter(Boolean).join(' '),
    Subject: 'Approved project proposal, Research Registry (Research Environment simulator)',
    Creator: 'Research Environment simulator: Research Registry',
    Producer: 'Research Environment simulator',
  });
  return { name, bytes };
}
