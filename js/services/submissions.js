// =============================================================================
// Research Registry projects and Airlock transfer requests.
//
// Records are kept in this browser (localStorage; file snapshots in IndexedDB).
// A simulated review moves them through the real process after a delay:
//   project:  submitted → screening (Research Management Team) → review (Access
//             Review Committee) → approved (RR number) | revisions | rejected
//   airlock:  submitted → in review (Airlock Team) [→ Airlock Committee] →
//             approved | rejected | more information needed
// Instructors can turn the automatic review off and decide by hand (Settings ▸
// Training), or shorten the delays.
//
// Transport: CONFIG.submissions.mode = 'local' (default) or 'appsScript', which
// also POSTs each submission to a Google Apps Script web app (apps-script/).
//
// When a project is approved, the web browser downloads the applicant's copy of
// the proposal, a PDF, to their own computer (js/services/proposal-copy.js), unless
// CONFIG.submissions.downloadApprovedProposal is false.
// =============================================================================

import { CONFIG } from '../config.js';
import { kv, idb } from '../core/store.js';
import { Emitter } from '../core/bus.js';
import { checkAirlockRequest, decide } from './airlock-rules.js';
import { bytesToBase64, downloadBlob } from '../core/util.js';
import { proposalCopy } from './proposal-copy.js';

const DAY = 864e5;

export function createSubmissions(RE) {
  const ev = new Emitter();
  const key = (k) => `sub:${RE.session.username}:${k}`;
  const load = (k) => kv.get(key(k), []);
  const store = (k, v) => { kv.set(key(k), v); ev.emit('change', k); };
  const settings = () => RE.session.settings;

  // ------------------------------------------------------------ seeding
  // A training project every user belongs to, approved long enough ago to export from.
  function ensureSeed() {
    const projects = load('projects');
    let added = false;
    for (const seed of CONFIG.submissions.seedProjects || []) {
      if (projects.some(p => p.id === seed.id)) continue;
      added = true;
      const approvedAt = Date.now() - (seed.approvedDaysAgo || 120) * DAY;
      projects.push({
        id: seed.id, ref: `RRS-${seed.id}`, title: seed.title, laySummary: seed.laySummary || '', domain: seed.domain || 'training',
        lead: { name: seed.lead || 'Training Lead', institution: seed.institution || 'Training University' },
        members: [RE.session.username], status: 'approved', submittedAt: approvedAt - 40 * DAY, approvedAt,
        lsfCode: seed.lsfCode || `re_gecip_${seed.domain || 'training'}`, seeded: true,
        history: [{ t: approvedAt - 40 * DAY, status: 'submitted', note: 'Submitted' }, { t: approvedAt, status: 'approved', note: `Approved by the Access Review Committee. Project ID ${seed.id}.` }],
      });
    }
    if (added) store('projects', projects);
  }

  // -------------------------------------------------------- transport
  async function transport(kind, record, files = []) {
    const S = CONFIG.submissions;
    if (S.mode !== 'appsScript' || !S.appsScriptUrl) return { ok: true, local: true };
    try {
      const payload = {
        kind, user: RE.session.user, record,
        files: await Promise.all(files.map(async f => ({ name: f.name, path: f.path, size: f.size, mime: f.mime || 'application/octet-stream', base64: f.bytes ? bytesToBase64(f.bytes) : null }))),
        sentAt: new Date().toISOString(), site: location.href,
      };
      // text/plain avoids a CORS preflight, which Apps Script web apps do not answer
      const res = await fetch(S.appsScriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok && data.ok !== false, remote: data };
    } catch (e) {
      console.warn('[submissions] Apps Script submission failed', e);
      return { ok: false, error: String(e.message || e) };
    }
  }

  function addHistory(rec, status, note, by = 'system') {
    rec.status = status;
    rec.history = rec.history || [];
    rec.history.push({ t: Date.now(), status, note, by });
  }

  function nextNumber(name, start) { const n = kv.get(`sub:counter:${name}`, start); kv.set(`sub:counter:${name}`, n + 1); return n; }

  // ============================================================ projects
  function projects() { ensureSeed(); return load('projects'); }
  function project(id) { return projects().find(p => p.id === id || p.ref === id) || null; }
  function saveProject(p) { const all = projects().filter(x => x.ref !== p.ref); all.push(p); store('projects', all); return p; }

  /** Save a draft (no review). */
  function saveDraft(p) {
    if (!p.ref) p.ref = `RRS-${new Date().getFullYear()}-${String(nextNumber('rrs', 101)).padStart(5, '0')}`;
    p.status = p.status || 'draft';
    p.updatedAt = Date.now();
    p.members = p.members || [RE.session.username];
    return saveProject(p);
  }

  function projectIssues(p) {
    const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
    const issues = [];
    if (!p.title || p.title.length < 10) issues.push('Give the project a descriptive title.');
    if (words(p.laySummary) < 60) issues.push('The lay summary should be at least 60 words, in plain English.');
    if (words(p.laySummary) > 300) issues.push('The lay summary should be no more than 300 words.');
    if (words(p.scientificAbstract) < 80) issues.push('The scientific abstract should be at least 80 words.');
    if (!(p.aims || []).filter(a => a.trim()).length) issues.push('List at least one aim or objective.');
    if (!(p.dataRequested || []).length) issues.push('Say which data the project needs.');
    if (words(p.methods) < 40) issues.push('Describe the analysis methods (at least 40 words).');
    if (words(p.benefit) < 20) issues.push('Explain the expected benefit to patients and participants.');
    if (!p.declarations || !Object.values(p.declarations).every(Boolean)) issues.push('All the declarations must be agreed to.');
    return issues;
  }

  async function submitProject(p) {
    const issues = projectIssues(p);
    if (issues.length) return { ok: false, issues };
    saveDraft(p);
    p.submittedAt = Date.now();
    addHistory(p, 'submitted', 'Project proposal submitted to the Research Registry.', RE.session.username);
    saveProject(p);
    const t = await transport('project', p);
    if (!t.ok) addHistory(p, 'submitted', `Note: the copy for the course could not be sent (${t.error || 'error'}). It is kept in this browser.`);
    saveProject(p);
    scheduleProjectReview(p.ref);
    return { ok: true, project: p };
  }

  function scheduleProjectReview(ref) {
    if (!settings().autoReview) return;
    const d = Math.max(2000, settings().reviewDelayMs || 20000);
    setTimeout(() => step(ref, 'submitted', 'screening', 'Screening by the Research Management Team: checking the proposal is complete and in scope.'), d * 0.25);
    setTimeout(() => step(ref, 'screening', 'review', 'Passed to the Access Review Committee (ARC) for review.'), d * 0.55);
    setTimeout(() => {
      const p = project(ref);
      if (!p || p.status !== 'review') return;
      approveProject(ref, 'Approved by the Access Review Committee.');
    }, d);
  }

  function step(ref, from, to, note) {
    const p = project(ref);
    if (!p || p.status !== from) return;
    addHistory(p, to, note);
    saveProject(p);
    RE.notify({ title: 'Research Registry', body: `${p.title}: ${note}`, icon: 'assets/icons/apps/research-registry.svg', onClick: () => RE.apps.launchApp('research-registry', { project: p.ref }) });
  }

  function approveProject(ref, note = 'Approved by the Access Review Committee.', { backdateDays = 0 } = {}) {
    const p = project(ref);
    if (!p) return null;
    if (!p.id) p.id = `RR${nextNumber('rr', 4120)}`;
    p.approvedAt = Date.now() - backdateDays * DAY;
    p.lsfCode = p.lsfCode || `re_gecip_${p.domain || 'training'}`;
    addHistory(p, 'approved', `${note} Project ID ${p.id}. Exports are possible from ${new Date(p.approvedAt + CONFIG.submissions.exportWaitDays * DAY).toLocaleDateString('en-GB')}.`);
    saveProject(p);
    // the applicant's copy, downloaded to their own computer (once, when the project is first approved)
    const copy = p.copyDownloadedAt ? null : downloadProposal(p.ref);
    RE.notify({ title: 'Project approved', body: `${p.title} is now ${p.id}.${copy ? ' A copy of the approved proposal has been downloaded to your computer.' : ''}`, icon: 'assets/icons/status/dialog-success.svg', onClick: () => RE.apps.launchApp('research-registry', { project: p.ref }), timeout: copy ? 9000 : undefined });
    return project(ref);
  }

  /** Download the applicant's copy of an approved proposal to the person's own computer (outside the RE). */
  function downloadProposal(ref) {
    const p = project(ref);
    if (!p || p.status !== 'approved' || p.seeded || CONFIG.submissions.downloadApprovedProposal === false) return null;
    try {
      const u = RE.session.user;
      const { name, bytes } = proposalCopy(p, { username: RE.session.username, fullName: u.fullName, site: location.href.split(/[?#]/)[0], exportWaitDays: CONFIG.submissions.exportWaitDays });
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), name);
      p.copyDownloadedAt = Date.now();
      saveProject(p);
      return name;
    } catch (e) {
      console.warn('[submissions] the copy of the proposal could not be downloaded', e);
      return null;
    }
  }

  function setProjectStatus(ref, status, note, by = 'instructor') {
    if (status === 'approved') return approveProject(ref, note || 'Approved.');
    const p = project(ref);
    if (!p) return null;
    addHistory(p, status, note || status, by);
    saveProject(p);
    return p;
  }

  function backdateProject(ref, days) {
    const p = project(ref);
    if (!p || !p.approvedAt) return null;
    p.approvedAt -= days * DAY;
    addHistory(p, p.status, `Training: approval date moved back ${days} days.`, 'instructor');
    saveProject(p);
    return p;
  }

  const approvedProjects = () => projects().filter(p => p.status === 'approved');

  // ============================================================ airlock
  function requests() { return load('airlock'); }
  function request(id) { return requests().find(r => r.id === id) || null; }
  function saveRequest(r) { const all = requests().filter(x => x.id !== r.id); all.push(r); store('airlock', all); return r; }

  /** Read the attached files (for the checks and the snapshot). files: [{path} | {name, bytes}] */
  async function readFiles(files) {
    const out = [];
    for (const f of files) {
      if (f.bytes) { out.push({ name: f.name, path: f.path || null, size: f.bytes.length, bytes: f.bytes, text: looksText(f.name, f.bytes) }); continue; }
      const st = RE.vfs.stat(f.path);
      if (!st) continue;
      let bytes = null;
      try { bytes = st.size <= 50 * 1024 * 1024 ? await RE.vfs.readFile(f.path) : null; } catch { bytes = null; }
      out.push({ name: RE.vfs.basename(f.path), path: f.path, size: st.size, bytes, text: bytes ? looksText(f.path, bytes) : null });
    }
    return out;
  }

  function looksText(name, bytes) {
    if (!bytes || bytes.length > 20 * 1024 * 1024) return null;
    if (/\.(gz|bam|cram|bcf|zip|png|jpe?g|gif|pdf|xlsx|docx|ods|odt|sqlite|rds|rdata|pkl|h5)$/i.test(name)) return null;
    const head = bytes.subarray(0, 8192);
    for (const b of head) if (b === 0) return null;
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; }
  }

  /** The automated pre-check (shown to the user before they submit). */
  async function precheck(req) {
    const files = await readFiles(req.files || []);
    const proj = req.rrNumber ? project(req.rrNumber) : null;
    return checkAirlockRequest({ ...req, files }, proj, { exportWaitDays: CONFIG.submissions.exportWaitDays, enforceWait: settings().enforceExportWait });
  }

  async function submitAirlock(req) {
    const files = await readFiles(req.files || []);
    const proj = req.rrNumber ? project(req.rrNumber) : null;
    const findings = checkAirlockRequest({ ...req, files }, proj, { exportWaitDays: CONFIG.submissions.exportWaitDays, enforceWait: settings().enforceExportWait });
    const id = `${String(nextNumber('trq', 1240))}`;
    const rec = {
      id, transfer: `TR-${id}`, gelRef: `RE-${nextNumber('gelref', 58210)}`,
      direction: req.direction, form: req.form, formLabel: req.formLabel, userGroup: req.userGroup, rrNumber: req.rrNumber,
      description: req.description, justification: req.justification, comments: req.comments || '',
      participantList: req.participantList || null,
      files: files.map(f => ({ name: f.name, path: f.path, size: f.size })),
      findings, submittedAt: Date.now(), history: [],
    };
    addHistory(rec, 'submitted', `Request submitted. Confirmation e-mail sent (GEL reference ${rec.gelRef}, transfer request ${rec.transfer}).`, RE.session.username);
    saveRequest(rec);
    await idb.set(`airlock:files:${RE.session.username}:${id}`, files.map(f => ({ name: f.name, path: f.path, size: f.size, bytes: f.bytes })));
    const t = await transport('airlock', rec, files);
    if (!t.ok) { addHistory(rec, 'submitted', `Note: the copy for the course could not be sent (${t.error || 'error'}). It is kept in this browser.`); saveRequest(rec); }
    RE.notify({ title: 'Airlock request received', body: `${rec.transfer}: ${files.length} file${files.length === 1 ? '' : 's'} for ${req.direction}. The Airlock team will review it.`, icon: 'assets/icons/apps/airlock.svg', onClick: () => RE.apps.launchApp('airlock', { request: rec.id }) });
    scheduleAirlockReview(id);
    return rec;
  }

  function scheduleAirlockReview(id) {
    if (!settings().autoReview) return;
    const d = Math.max(2000, settings().reviewDelayMs || 20000);
    setTimeout(() => {
      const r = request(id);
      if (!r || r.status !== 'submitted') return;
      addHistory(r, 'in-review', 'The Airlock team has started reviewing the files.');
      saveRequest(r);
    }, d * 0.3);
    setTimeout(() => {
      const r = request(id);
      if (!r || r.status !== 'in-review') return;
      const dec = r.direction === 'import' ? { outcome: r.findings.some(f => f.level === 'fail') ? 'rejected' : 'approved', committee: false, reasons: r.findings.filter(f => f.level === 'fail').map(f => f.message) } : decide(r.findings);
      if (dec.committee) {
        addHistory(r, 'committee', 'Referred to the Airlock Committee (individual-level or bulk data need the approval of at least two members).');
        saveRequest(r);
        setTimeout(() => finishAirlock(id, dec), d * 0.6);
      } else finishAirlock(id, dec);
    }, d);
  }

  function finishAirlock(id, dec, by = 'Airlock team') {
    const r = request(id);
    if (!r || ['approved', 'rejected', 'withdrawn'].includes(r.status)) return r;
    r.decision = { outcome: dec.outcome, reasons: dec.reasons || [], by, at: Date.now() };
    if (dec.outcome === 'approved') {
      addHistory(r, 'approved', r.direction === 'import'
        ? 'Approved. The files are in the Airlock site under Files ▸ Home, in a folder named after the transfer request.'
        : 'Approved. A download link has been e-mailed to you: retrieve the files from the Airlock retrieval site (outside the RE).', by);
    } else if (dec.outcome === 'more-info') {
      addHistory(r, 'more-info', 'The Airlock team has a question about this request: ' + (dec.reasons || []).join(' '), by);
    } else {
      addHistory(r, 'rejected', 'Rejected. ' + (dec.reasons || []).slice(0, 4).join(' '), by);
    }
    saveRequest(r);
    RE.notify({
      title: `Airlock request ${r.transfer} ${r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'needs information'}`,
      body: r.status === 'approved' ? 'See the Airlock site for your files.' : (dec.reasons || [])[0] || '',
      icon: r.status === 'approved' ? 'assets/icons/status/dialog-success.svg' : 'assets/icons/status/dialog-warning.svg',
      onClick: () => RE.apps.launchApp('airlock', { request: r.id }), timeout: 9000,
    });
    return r;
  }

  function withdraw(id) {
    const r = request(id);
    if (!r || ['approved', 'rejected'].includes(r.status)) return r;
    addHistory(r, 'withdrawn', 'Withdrawn by the requester.', RE.session.username);
    saveRequest(r);
    return r;
  }

  async function filesOf(id) { return (await idb.get(`airlock:files:${RE.session.username}:${id}`)) || []; }

  /** Answer the Airlock team (a request that needs more information goes back into review). */
  function reply(id, text) {
    const r = request(id);
    if (!r) return null;
    addHistory(r, 'in-review', `Your reply: ${text}`, RE.session.username);
    saveRequest(r);
    if (settings().autoReview) setTimeout(() => finishAirlock(id, decide(r.findings)), Math.max(2000, (settings().reviewDelayMs || 20000) * 0.5));
    return r;
  }

  /** After a reload: pending reviews carry on (their timers were lost with the page). */
  function resume() {
    for (const p of projects()) {
      if (p.status === 'submitted') scheduleProjectReview(p.ref);
      else if (p.status === 'screening') { const d = Math.max(2000, settings().reviewDelayMs || 20000); if (settings().autoReview) { setTimeout(() => step(p.ref, 'screening', 'review', 'Passed to the Access Review Committee (ARC) for review.'), d * 0.3); setTimeout(() => { const q = project(p.ref); if (q && q.status === 'review') approveProject(p.ref); }, d * 0.6); } }
      else if (p.status === 'review' && settings().autoReview) setTimeout(() => { const q = project(p.ref); if (q && q.status === 'review') approveProject(p.ref); }, Math.max(2000, (settings().reviewDelayMs || 20000) * 0.4));
    }
    for (const r of requests()) {
      if (r.status === 'submitted' || r.status === 'in-review') { if (r.status === 'in-review') r.status = 'submitted'; scheduleAirlockReview(r.id); }
      else if (r.status === 'committee' && settings().autoReview) setTimeout(() => finishAirlock(r.id, decide(r.findings)), Math.max(2000, (settings().reviewDelayMs || 20000) * 0.4));
    }
  }
  setTimeout(resume, 3000);

  function resetAll() { kv.remove(key('projects')); kv.remove(key('airlock')); ev.emit('change', 'all'); }

  return {
    on: (...a) => ev.on(...a),
    // projects
    projects, project, saveDraft, submitProject, projectIssues, approveProject, setProjectStatus, backdateProject, approvedProjects, downloadProposal,
    // airlock
    requests, request, precheck, submitAirlock, finishAirlock, withdraw, reply, filesOf,
    resetAll,
  };
}
