// =============================================================================
// The applicant's copy of an approved Research Registry proposal: one
// self-contained HTML page with the project's details, every section of the
// proposal as it was approved, the declarations and the review. HTML shows
// whatever characters were typed, opens in any web browser and prints to PDF.
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

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = (t) => (t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const when = (t) => (t ? `${day(t)}, ${new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '');
const fileSafe = (s) => String(s || '').replace(/[^\w.-]+/g, '_');

/**
 * The copy of an approved proposal.
 * p: the project record (js/services/submissions.js); who: { username, fullName, site, exportWaitDays }.
 * Returns { name, html }: the file name (RR number, username) and the page.
 */
export function proposalCopy(p, who = {}) {
  const username = who.username || (p.members || [])[0] || '';
  const name = `${fileSafe(p.id || p.ref)}_${fileSafe(username)}_approved_proposal.html`;
  const aims = (p.aims || []).map((a) => String(a || '').trim()).filter(Boolean);
  const data = p.dataRequested || [];
  const agreed = Object.entries(DECLARATIONS).filter(([k]) => p.declarations && p.declarations[k]);
  const exportsFrom = p.approvedAt ? p.approvedAt + (who.exportWaitDays ?? 30) * DAY : null;
  const kv = (label, value) => (value ? `<dt>${esc(label)}</dt><dd>${value}</dd>` : '');
  const text = (s) => (String(s || '').trim() ? `<div class="text">${esc(String(s).trim())}</div>` : '<p class="none">Not given.</p>');
  const section = (n, title, body) => `<section><h2><span class="n">${n}</span>${esc(title)}</h2>${body}</section>`;

  const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.id || p.ref)}: ${esc(p.title)} (approved proposal)</title>
<style>
  :root { --ink: #1d2733; --muted: #5b6b7a; --line: #dde3ea; --green: #1f7a56; --pale: #e3f4ec; }
  * { box-sizing: border-box; }
  body { margin: 32px auto; max-width: 820px; padding: 0 20px 40px; color: var(--ink); background: #fff;
         font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
  header { border-bottom: 3px solid var(--green); padding-bottom: 14px; margin-bottom: 18px; }
  .kicker { color: var(--green); font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
  .id { color: var(--green); font-size: 30px; font-weight: 700; line-height: 1.2; margin-top: 4px; }
  h1 { font-size: 23px; line-height: 1.3; margin: 4px 0 10px; }
  .badge { display: inline-block; background: var(--pale); color: var(--green); border-radius: 999px; padding: 2px 11px; font-size: 13px; font-weight: 600; margin-right: 8px; }
  .note { background: #f5f7fa; border: 1px solid var(--line); border-radius: 6px; padding: 9px 13px; color: var(--muted); font-size: 13px; }
  section { margin: 24px 0; }
  h2 { font-size: 17px; border-bottom: 1px solid var(--line); padding-bottom: 5px; margin: 0 0 10px; }
  h2 .n { display: inline-block; min-width: 1.6em; color: var(--green); }
  dl { display: grid; grid-template-columns: 200px 1fr; gap: 6px 16px; margin: 0; }
  dt { color: var(--muted); }
  dd { margin: 0; }
  .text { white-space: pre-wrap; overflow-wrap: anywhere; }
  .none { color: var(--muted); font-style: italic; margin: 0; }
  ol, ul { margin: 0; padding-left: 1.4em; }
  li { margin: 3px 0; }
  ul.agreed { list-style: none; padding-left: 0; }
  ul.agreed li { padding-left: 1.6em; text-indent: -1.6em; }
  ul.agreed li::before { content: "\\2611\\00a0\\00a0"; color: var(--green); }
  ol.review li { margin: 6px 0; }
  ol.review .t { color: var(--muted); font-size: 13px; }
  footer { border-top: 1px solid var(--line); margin-top: 30px; padding-top: 10px; color: var(--muted); font-size: 12.5px; }
  @media (max-width: 600px) { dl { grid-template-columns: 1fr; } dt { margin-top: 6px; } }
  @media print { body { margin: 0; max-width: none; padding: 0; } section { break-inside: avoid-page; } }
</style>
</head>
<body>
<header>
  <div class="kicker">Research Registry · approved project proposal</div>
  <div class="id">${esc(p.id || p.ref)}</div>
  <h1>${esc(p.title)}</h1>
  <span class="badge">Approved</span><span>${esc(when(p.approvedAt))}</span>
</header>
<p class="note">This is the applicant’s copy of a proposal approved in the Research Environment simulator, a training copy of the Genomics England Research Environment. It is not a Genomics England document.</p>
${section(1, 'The project', `<dl>
${kv('Project ID', esc(p.id))}
${kv('Proposal reference', esc(p.ref))}
${kv('Lead applicant', esc([p.lead?.name, p.lead?.institution].filter(Boolean).join(', ')))}
${kv('Research Environment user', esc([username, who.fullName && who.fullName !== username ? `(${who.fullName})` : ''].filter(Boolean).join(' ')))}
${kv('Research domain', esc(p.domain))}
${kv('Collaborators', esc(p.collaborators))}
${kv('Submitted', esc(when(p.submittedAt)))}
${kv('Approved', esc(when(p.approvedAt)))}
${kv('LSF project code', p.lsfCode ? `<code>${esc(p.lsfCode)}</code>` : '')}
${kv('Airlock exports', exportsFrom ? esc(`Possible from ${day(exportsFrom)} (${who.exportWaitDays ?? 30} days after approval).`) : '')}
</dl>`)}
${section(2, 'Lay summary', text(p.laySummary))}
${section(3, 'Scientific abstract', text(p.scientificAbstract))}
${section(4, 'Aims and objectives', aims.length ? `<ol>${aims.map((a) => `<li class="text">${esc(a)}</li>`).join('')}</ol>` : '<p class="none">Not given.</p>')}
${section(5, 'Data requested', data.length ? `<ul>${data.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : '<p class="none">Not given.</p>')}
${section(6, 'Methods', text(p.methods))}
${section(7, 'Benefit to patients and participants', text(p.benefit))}
${section(8, 'Declarations', agreed.length ? `<p>The applicant agreed to the following.</p><ul class="agreed">${agreed.map(([, t]) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="none">None recorded.</p>')}
<section><h2>Review</h2><ol class="review">${(p.history || []).map((e) => `<li><b>${esc(STATUS[e.status] || e.status)}.</b> ${esc(e.note || '')}<div class="t">${esc(when(e.t))}${e.by && e.by !== 'system' ? ` · ${esc(e.by)}` : ''}</div></li>`).join('')}</ol></section>
<footer>Downloaded from the Research Registry of the Research Environment simulator${who.site ? ` (${esc(who.site)})` : ''} on ${esc(when(Date.now()))}.</footer>
</body>
</html>
`;
  return { name, html };
}
