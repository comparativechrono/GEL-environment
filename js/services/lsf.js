// =============================================================================
// Simulated IBM Spectrum LSF for the "Double Helix" HPC.
//
// Jobs really run: each batch job's command or script is executed by the
// engine's bash (MG.Shell) on the HPC view of the file system, after a short
// pending time, and its output is written in LSF's own format to the -o / -e
// files. Interactive jobs (bsub -Is) are handled by the terminal (shell-re.js)
// with the records kept here.
// =============================================================================

import { CONFIG } from '../config.js';
import { kv } from '../core/store.js';
import { Emitter } from '../core/bus.js';

const H = CONFIG.hpc;
const NODES = Array.from({ length: 80 }, (_, i) => `hpc-compute-${String(i + 1).padStart(3, '0')}`);
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n) => String(n).padStart(2, '0');
const lsfTime = (t) => { const d = new Date(t); return `${DAY[d.getDay()]} ${MON[d.getMonth()]} ${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())} ${d.getFullYear()}`; };
const shortTime = (t) => { const d = new Date(t); return `${MON[d.getMonth()]} ${String(d.getDate()).padStart(2, ' ')} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };

export class LsfError extends Error {}

/** bsub's options (and #BSUB lines). Returns {opts, cmd} or throws LsfError. */
export function parseBsub(args) {
  const o = { queue: null, project: null, name: null, out: null, err: null, outOverwrite: false, errOverwrite: false, cores: 1, resource: '', memLimit: null, runLimit: null, interactive: false, pty: false, shellMode: false, cwd: null, depend: null, env: null, wait: false };
  const takes = new Set(['-q', '-P', '-J', '-o', '-e', '-oo', '-eo', '-n', '-R', '-M', '-W', '-cwd', '-w', '-app', '-env', '-u', '-G', '-g', '-m', '-sla', '-Jd', '-i', '-We', '-b', '-E', '-Ep']);
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('-') || a === '-') break;
    if (a === '--') { i++; break; }
    if (/^-I[sp]*$/.test(a)) { o.interactive = true; o.shellMode = a.includes('s'); o.pty = a.includes('p') || a.includes('s'); continue; }
    if (a === '-K') { o.wait = true; continue; }
    if (a === '-N' || a === '-B' || a === '-x' || a === '-r' || a === '-rn' || a === '-H') continue;
    if (takes.has(a)) {
      const v = args[++i];
      if (v === undefined) throw new LsfError(`${a}: option requires an argument.\nUsage: bsub [options] command [arguments]`);
      switch (a) {
        case '-q': o.queue = v; break;
        case '-P': o.project = v; break;
        case '-J': o.name = v; break;
        case '-o': o.out = v; break;
        case '-oo': o.out = v; o.outOverwrite = true; break;
        case '-e': o.err = v; break;
        case '-eo': o.err = v; o.errOverwrite = true; break;
        case '-n': o.cores = Math.max(1, parseInt(v, 10) || 1); break;
        case '-R': o.resource += (o.resource ? ' ' : '') + v; break;
        case '-M': o.memLimit = v; break;
        case '-W': o.runLimit = v; break;
        case '-cwd': o.cwd = v; break;
        case '-w': o.depend = v; break;
        case '-env': o.env = v; break;
        default: break;
      }
      continue;
    }
    throw new LsfError(`${a}: Illegal option.\nUsage: bsub [options] command [arguments]\n       bsub -h for help`);
  }
  return { opts: o, cmd: args.slice(i) };
}

/** #BSUB lines at the top of a script → extra arguments */
export function directives(script) {
  const extra = [];
  for (const line of String(script || '').split('\n')) {
    const m = /^\s*#BSUB\s+(.*)$/.exec(line);
    if (!m) continue;
    const words = m[1].match(/"[^"]*"|'[^']*'|\S+/g) || [];
    for (const w of words) { if (w.startsWith('#')) break; extra.push(w.replace(/^["']|["']$/g, '')); }
  }
  return extra;
}

function memRequested(o) {
  const m = /rusage\[\s*mem\s*=\s*([\d.]+)\s*(KB|MB|GB)?\s*\]/i.exec(o.resource || '');
  if (m) { const n = parseFloat(m[1]); const u = (m[2] || 'MB').toUpperCase(); return u === 'GB' ? n * 1024 : u === 'KB' ? n / 1024 : n; }
  return o.memLimit ? parseFloat(o.memLimit) : 1000;
}

function arraySpec(name) {
  const m = /^([^[]*)\[([\d,\-:]+)\](%\d+)?$/.exec(name || '');
  if (!m) return null;
  const idx = [];
  for (const part of m[2].split(',')) {
    const r = /^(\d+)(?:-(\d+)(?::(\d+))?)?$/.exec(part);
    if (!r) continue;
    const a = +r[1], b = r[2] ? +r[2] : a, step = r[3] ? +r[3] : 1;
    for (let k = a; k <= b && idx.length < 1000; k += step) idx.push(k);
  }
  return idx.length ? { base: m[1], indices: idx } : null;
}

export function createLsf(RE) {
  const ev = new Emitter();
  const jobs = new Map();          // id(string) -> job
  let nextId = kv.get('lsf:nextId', 4210001);
  for (const j of kv.get('lsf:history', [])) jobs.set(String(j.id), j);

  const save = () => {
    kv.set('lsf:nextId', nextId);
    const done = [...jobs.values()].filter(j => j.stat === 'DONE' || j.stat === 'EXIT').slice(-100)
      .map(({ output, ...rest }) => rest);
    kv.set('lsf:history', done);
  };

  const user = () => RE.session.username;
  const validProjects = () => {
    const extra = (RE.services.submissions?.approvedProjects?.() || []).map(p => p.lsfCode).filter(Boolean);
    return new Set([...H.projectCodes, `re_gecip_${RE.session.user.domain || 'training'}`, ...extra].map(s => s.toLowerCase()));
  };

  function validate(o) {
    if (!o.project) throw new LsfError('Please specify a project code with -P <project_code> (see "Choosing your LSF project code" in the RE documentation).\nRequest aborted by esub. Job not submitted.');
    if (!validProjects().has(String(o.project).toLowerCase())) {
      throw new LsfError(`Project code <${o.project}> is not valid for user <${user()}>. Valid project codes: ${[...validProjects()].join(', ')}\nRequest aborted by esub. Job not submitted.`);
    }
    const q = o.queue || 'short';
    if (!H.queues.some(x => x.name === q)) throw new LsfError(`${q}: No such queue. Job not submitted.`);
    if (o.interactive && q !== 'inter') throw new LsfError(`Interactive jobs must be submitted to the inter queue (bsub -q inter -Is ...).\nRequest aborted by esub. Job not submitted.`);
    if (!o.interactive && q === 'inter') throw new LsfError(`The inter queue only accepts interactive jobs (bsub -q inter -Is bash).\nRequest aborted by esub. Job not submitted.`);
    if (o.interactive && [...jobs.values()].filter(j => j.user === user() && j.interactive && j.stat === 'RUN').length >= 5) {
      throw new LsfError('User has reached the limit of 5 running jobs in the inter queue. Kill one with bkill <job_id>.\nJob not submitted.');
    }
    return q;
  }

  function newJob(o, cmdText, ctx, extra = {}) {
    const id = String(nextId++);
    const q = o.queue || 'short';
    const job = {
      id, user: user(), queue: q, project: o.project, name: o.name || (cmdText.split('\n').find(l => l.trim() && !l.startsWith('#')) || cmdText).slice(0, 60),
      cmd: cmdText, stat: 'PEND', fromHost: H.loginNodeName, execHost: null, submit: Date.now(), start: null, end: null,
      exitCode: null, cores: o.cores, mem: memRequested(o), resource: o.resource, out: o.out, err: o.err,
      outOverwrite: o.outOverwrite, errOverwrite: o.errOverwrite, cwd: ctx.cwd, home: ctx.home, interactive: !!o.interactive,
      cwdShown: ctx.fsView && ctx.fsView.shown ? ctx.fsView.shown(ctx.cwd) : ctx.cwd,
      depend: o.depend, output: '', pendReason: 'New job is waiting for scheduling', ...extra,
    };
    jobs.set(id, job);
    return job;
  }

  /**
   * Submit a batch job (or an array of them).
   * ctx: {cwd, home, fsView (MG.VFS view with the HPC aliases), env}
   * Returns the message bsub prints.
   */
  function submit(args, ctx, stdinScript = null) {
    let script = null;
    let { opts, cmd } = parseBsub(args);
    if (!cmd.length && stdinScript) {
      script = stdinScript;
      const more = parseBsub(directives(script));
      // command-line options win over #BSUB lines
      for (const [k, v] of Object.entries(more.opts)) if (opts[k] === null || opts[k] === false || opts[k] === '' || (k === 'cores' && opts.cores === 1)) opts[k] = v;
    } else if (cmd.length) {
      // bsub myscript.sh: the #BSUB lines of a script given by name count too
      const first = cmd[0] === 'bash' || cmd[0] === 'sh' ? cmd[1] : cmd[0];
      try {
        if (first && ctx.fsView.exists(first) && !ctx.fsView.isDir(first)) {
          const e = ctx.fsView.get(first);
          if (e && e.kind === 'text') {
            const more = parseBsub(directives(e.text));
            for (const [k, v] of Object.entries(more.opts)) if (opts[k] === null || opts[k] === false || opts[k] === '') opts[k] = v;
          }
        }
      } catch { /* not a file */ }
    }
    const q = validate(opts);
    opts.queue = q;
    if (!cmd.length && !script) throw new LsfError('bsub> (no command given: type the command, or use  bsub < script.sh)\nJob not submitted.');
    // As in LSF, the command and its arguments are joined with spaces and run by the shell,
    // so  bsub "samtools index x.bam; echo done"  runs both commands.
    const cmdText = script ?? cmd.join(' ');
    // The job keeps the view of the file system it was submitted from (the HPC's /home), even
    // if the terminal logs out of the HPC before the job starts.
    const snap = Object.create(ctx.fsView);
    if (ctx.fsView.aliases) snap.aliases = ctx.fsView.aliases.slice();
    ctx = { ...ctx, fsView: snap };
    if (opts.cwd) ctx = { ...ctx, cwd: ctx.fsView.resolve(opts.cwd) };
    const arr = arraySpec(opts.name);
    if (arr) {
      const parent = newJob(opts, cmdText, ctx, { name: opts.name, isArray: true, children: [] });
      parent.stat = 'PEND';
      for (const k of arr.indices) {
        const child = { ...parent, id: `${parent.id}[${k}]`, arrayIndex: k, parentId: parent.id, isArray: false, children: undefined, name: `${arr.base}[${k}]` };
        jobs.set(child.id, child);
        parent.children.push(child.id);
        schedule(child, ctx);
      }
      ev.emit('change');
      save();
      return `Job <${parent.id}> is submitted to queue <${q}>.`;
    }
    const job = newJob(opts, cmdText, ctx);
    schedule(job, ctx);
    ev.emit('change');
    save();
    return `Job <${job.id}> is submitted to queue <${q}>.`;
  }

  function dependencyMet(job) {
    if (!job.depend) return true;
    // done(ID) ended(ID) exit(ID), joined by &&
    const parts = String(job.depend).split(/&&/).map(s => s.trim()).filter(Boolean);
    return parts.every(part => {
      const m = /^(done|ended|exit|started)\s*\(\s*([\w[\]]+)\s*\)$/i.exec(part) || /^(done)?\s*([\w[\]]+)$/.exec(part);
      if (!m) return true;
      const kind = (m[1] || 'done').toLowerCase();
      const dep = jobs.get(m[2]) || [...jobs.values()].find(j => j.name === m[2]);
      if (!dep) return true;
      const st = dep.isArray ? arrayStat(dep) : dep.stat;
      if (kind === 'done') return st === 'DONE';
      if (kind === 'exit') return st === 'EXIT';
      if (kind === 'started') return st !== 'PEND';
      return st === 'DONE' || st === 'EXIT';
    });
  }

  function arrayStat(parent) {
    const kids = (parent.children || []).map(id => jobs.get(id)).filter(Boolean);
    if (kids.some(k => k.stat === 'RUN')) return 'RUN';
    if (kids.some(k => k.stat === 'PEND')) return 'PEND';
    if (kids.some(k => k.stat === 'EXIT')) return 'EXIT';
    return 'DONE';
  }

  function schedule(job, ctx) {
    const pendMs = { short: 2500, medium: 4000, long: 6000 }[job.queue] ?? 3000;
    const tryStart = () => {
      if (job.stat !== 'PEND') return;
      if (!dependencyMet(job)) { job.pendReason = `Job dependency condition not satisfied: ${job.depend}`; setTimeout(tryStart, 1500); return; }
      run(job, ctx);
    };
    setTimeout(tryStart, pendMs + Math.random() * 1500);
  }

  async function run(job, ctx) {
    const MG = window.MG;
    job.stat = 'RUN';
    job.start = Date.now();
    job.execHost = NODES[Math.floor(Math.random() * NODES.length)];
    ev.emit('change');
    let out = '', err = '';
    let code = 0;
    try {
      const view = Object.create(ctx.fsView);
      view.cwd = ctx.cwd;
      const env = {
        ...(ctx.env || {}), HOME: ctx.home, USER: job.user, LOGNAME: job.user, HOSTNAME: job.execHost,
        LSB_JOBID: job.parentId || job.id, LSB_JOBNAME: job.name, LSB_QUEUE: job.queue, LSB_PROJECT_NAME: job.project,
        LSB_DJOB_NUMPROC: String(job.cores), LSB_HOSTS: job.execHost, LSB_JOBINDEX: job.arrayIndex ? String(job.arrayIndex) : '0',
        LSB_EXEC_CWD: job.cwdShown || ctx.cwd, PWD: job.cwdShown || ctx.cwd, LSF_ENVDIR: '/usr/share/lsf/conf',
      };
      const sh = new MG.Shell({ fs: view, term: null, env });
      job._shell = sh;
      const io = {
        out: (t) => { const s = t instanceof Uint8Array ? `[${t.length} bytes of binary output]\n` : String(t); out += s; job.output = out; },
        err: (t) => { err += String(t); },
        colored: (t) => { out += String(t); job.output = out; },
        note: () => {},
        html: () => {},
        progress: () => {},
        clear: () => {},
      };
      const minRun = new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
      code = await sh.exec(job.cmd, io, { command: true, name: 'bash' });
      await minRun;
    } catch (e) {
      err += String(e?.message || e) + '\n';
      code = 1;
    }
    if (job.stat === 'EXIT' && job.killed) code = 130;
    job.end = Date.now();
    job.exitCode = Number(code) || 0;
    job.stat = job.killed ? 'EXIT' : (job.exitCode ? 'EXIT' : 'DONE');
    delete job._shell;
    writeOutputs(job, ctx, out, err);
    ev.emit('change');
    ev.emit('finished', job);
    save();
    if (job.parentId) {
      const parent = jobs.get(job.parentId);
      if (parent) { parent.stat = arrayStat(parent); if (parent.stat === 'DONE' || parent.stat === 'EXIT') { parent.end = Date.now(); save(); } }
    }
  }

  function substitute(path, job) {
    return String(path).replace(/%J/g, job.parentId || job.id).replace(/%I/g, job.arrayIndex ? String(job.arrayIndex) : '0');
  }

  function report(job, stdout, errFile) {
    const status = job.stat === 'DONE' ? 'Done' : 'Exited';
    const secs = Math.max(1, Math.round((job.end - job.start) / 1000));
    const turn = Math.max(secs, Math.round((job.end - job.submit) / 1000));
    const maxMem = Math.round(5 + Math.random() * 40);
    return `Sender: LSF System <lsfadmin@${job.execHost}>
Subject: Job ${job.id}: <${job.cmd.split('\n')[0].slice(0, 70)}> in cluster <${H.clusterName}> ${status}

Job <${job.cmd.split('\n')[0].slice(0, 70)}> was submitted from host <${job.fromHost}> by user <${job.user}> in cluster <${H.clusterName}> at ${lsfTime(job.submit)}
Job was executed on host(s) <${job.execHost}>, in queue <${job.queue}>, as user <${job.user}> in cluster <${H.clusterName}> at ${lsfTime(job.start)}
<${job.home}> was used as the home directory.
<${job.cwdShown || job.cwd}> was used as the working directory.
Started at ${lsfTime(job.start)}
Terminated at ${lsfTime(job.end)}
Results reported at ${lsfTime(job.end)}

Your job looked like:

------------------------------------------------------------
# LSBATCH: User input
${job.cmd.replace(/\n+$/, '')}
------------------------------------------------------------

${job.stat === 'DONE' ? 'Successfully completed.' : job.killed ? 'TERM_OWNER: job killed by owner.\nExited with exit code 130.' : `Exited with exit code ${job.exitCode}.`}

Resource usage summary:

    CPU time :                                   ${(secs * 0.37).toFixed(2)} sec.
    Max Memory :                                 ${maxMem} MB
    Average Memory :                             ${(maxMem * 0.8).toFixed(2)} MB
    Total Requested Memory :                     ${job.mem.toFixed(2)} MB
    Delta Memory :                               ${(job.mem - maxMem).toFixed(2)} MB
    Max Swap :                                   -
    Max Processes :                              3
    Max Threads :                                4
    Run time :                                   ${secs} sec.
    Turnaround time :                            ${turn} sec.

The output (if any) follows:

${stdout}
${errFile ? `\nPS:\n\nRead file <${errFile}> for stderr output of this job.\n` : ''}`;
  }

  function writeOutputs(job, ctx, out, err) {
    const fs = ctx.fsView;
    const resolve = (p) => fs.resolve(substitute(p, job), ctx.cwd);
    const put = (path, text, overwrite) => {
      try {
        const e = fs.get(path);
        if (e && e.kind === 'text' && !overwrite) fs.writeText(path, e.text + text);
        else fs.writeText(path, text);
      } catch (e2) { console.warn('[lsf] cannot write', path, e2); }
    };
    const errPath = job.err ? resolve(job.err) : null;
    if (job.out) {
      const outPath = resolve(job.out);
      put(outPath, report(job, errPath ? out : out + err, errPath ? substitute(job.err, job) : null), job.outOverwrite);
    } else {
      // (without -o LSF would e-mail the report: the simulator keeps it in ~/.lsbatch)
      const dir = `${ctx.home}/.lsbatch`;
      try { fs.mkdirp(dir); put(`${dir}/${job.id.replace(/[[\]]/g, '_')}.out`, report(job, out + (errPath ? '' : err), null), true); } catch { /* ignore */ }
    }
    if (errPath) put(errPath, err, job.errOverwrite);
  }

  function kill(id, by) {
    const ids = id === '0' ? [...jobs.values()].filter(j => j.user === by && (j.stat === 'PEND' || j.stat === 'RUN')).map(j => j.id) : [String(id)];
    const msgs = [];
    for (const jid of ids) {
      const j = jobs.get(jid);
      if (!j) { msgs.push(`Job <${jid}>: No matching job found`); continue; }
      if (j.isArray) { for (const c of j.children) kill(c, by); msgs.push(`Job <${jid}> is being terminated`); continue; }
      if (j.stat !== 'PEND' && j.stat !== 'RUN') { msgs.push(`Job <${jid}>: Job has already finished`); continue; }
      j.killed = true;
      if (j.stat === 'PEND') { j.stat = 'EXIT'; j.end = Date.now(); j.start = j.start || j.end; j.execHost = j.execHost || '-'; j.exitCode = 130; }
      else { try { j._shell?.term?.stop?.(); } catch { /* ignore */ } j.stat = 'EXIT'; }
      if (j.interactive) j.onKill?.();
      msgs.push(`Job <${jid}> is being terminated`);
    }
    ev.emit('change');
    save();
    return msgs.join('\n') || 'No unfinished job found';
  }

  // ---------------------------------------------------------- reports
  function bjobs(args) {
    const all = args.includes('-a');
    const long = args.includes('-l');
    const wide = args.includes('-w');
    const done = args.includes('-d');
    const runOnly = args.includes('-r');
    const pendOnly = args.includes('-p');
    const ui = args.indexOf('-u');
    const who = ui >= 0 ? args[ui + 1] : user();
    const qi = args.indexOf('-q');
    const qf = qi >= 0 ? args[qi + 1] : null;
    const ids = args.filter((a, i) => /^\d+(\[\d+\])?$/.test(a) && args[i - 1] !== '-u' && args[i - 1] !== '-q');
    let list = [...jobs.values()].filter(j => !j.isArray && (who === 'all' || j.user === who));
    if (ids.length) list = list.filter(j => ids.includes(j.id) || ids.includes(j.parentId));
    else if (done) list = list.filter(j => j.stat === 'DONE' || j.stat === 'EXIT');
    else if (!all) list = list.filter(j => j.stat === 'PEND' || j.stat === 'RUN');
    if (all) list = list.filter(j => j.stat === 'PEND' || j.stat === 'RUN' || Date.now() - (j.end || 0) < 3600e3);
    if (runOnly) list = list.filter(j => j.stat === 'RUN');
    if (pendOnly) list = list.filter(j => j.stat === 'PEND');
    if (qf) list = list.filter(j => j.queue === qf);
    if (!list.length) return ids.length ? ids.map(i => `Job <${i}> is not found`).join('\n') : (done ? 'No finished job found' : 'No unfinished job found');
    if (long) return list.map(longFormat).join('\n------------------------------------------------------------------------------\n');
    const nm = (s) => (wide ? s : s.length > 10 ? '*' + s.slice(-9) : s);
    const host = (s) => (s ? (wide ? s : s.length > 11 ? s.slice(0, 11) : s) : '');
    const rows = list.map(j => [j.id, j.user, j.stat, j.queue, host(j.fromHost), host(j.execHost), nm(j.name), shortTime(j.submit)]);
    const head = ['JOBID', 'USER', 'STAT', 'QUEUE', 'FROM_HOST', 'EXEC_HOST', 'JOB_NAME', 'SUBMIT_TIME'];
    const w = head.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)) + 1);
    return [head, ...rows].map(r => r.map((c, i) => (i === r.length - 1 ? c : String(c).padEnd(w[i]))).join(' ')).join('\n');
  }

  function longFormat(j) {
    const lines = [
      `Job <${j.id}>, Job Name <${j.name}>, User <${j.user}>, Project <${j.project}>, Status <${j.stat}>, Queue <${j.queue}>, Command <${j.cmd.split('\n')[0]}>`,
      `${lsfTime(j.submit)}: Submitted from host <${j.fromHost}>, CWD <${j.cwd}>${j.out ? `, Output File <${j.out}>` : ''}${j.err ? `, Error File <${j.err}>` : ''}, Requested Resources <${j.resource || 'rusage[mem=' + j.mem + ']'}>;`,
    ];
    if (j.stat === 'PEND') lines.push(` PENDING REASONS:\n ${j.pendReason};`);
    if (j.start) lines.push(`${lsfTime(j.start)}: Started 1 Task(s) on Host(s) <${j.execHost}>, Allocated ${j.cores} Slot(s) on Host(s) <${j.execHost}>, Execution Home <${j.home}>, Execution CWD <${j.cwd}>;`);
    if (j.end) lines.push(`${lsfTime(j.end)}: ${j.stat === 'DONE' ? 'Done successfully' : `Exited with exit code ${j.exitCode}`}. The CPU time used is ${((j.end - j.start) / 2700).toFixed(1)} seconds.`);
    lines.push('', ` MEMORY USAGE:\n MAX MEM: ${Math.round(5 + (j.id.length % 7) * 4)} Mbytes;  AVG MEM: ${Math.round(4 + (j.id.length % 5) * 3)} Mbytes`, '', ` SCHEDULING PARAMETERS:\n           r15s   r1m  r15m   ut      pg    io   ls    it    tmp    swp    mem\n loadSched   -     -     -     -       -     -    -     -     -      -      -\n loadStop    -     -     -     -       -     -    -     -     -      -      -`);
    return lines.join('\n');
  }

  function bqueues(args) {
    const name = args.find(a => !a.startsWith('-'));
    const qs = H.queues.filter(q => !name || q.name === name);
    if (!qs.length) return `${name}: No such queue`;
    if (args.includes('-l')) {
      return qs.map(q => `QUEUE: ${q.name}\n  -- ${q.description}\n\nPARAMETERS/STATISTICS\nPRIO NICE STATUS          MAX JL/U JL/P JL/H NJOBS  PEND   RUN SSUSP USUSP  RSV PJOBS\n ${String(q.prio).padEnd(4)} 0  Open:Active       -    ${q.name === 'inter' ? '5' : '-'}    -    -  ${String(count(q.name)).padStart(5)} ${String(count(q.name, 'PEND')).padStart(5)} ${String(count(q.name, 'RUN')).padStart(5)}     0     0    0     0\n${q.maxRuntime ? `\n RUNLIMIT\n ${q.maxRuntime}.0 min\n` : ''}`).join('\n');
    }
    const head = 'QUEUE_NAME      PRIO STATUS          MAX JL/U JL/P JL/H NJOBS  PEND   RUN  SUSP';
    return [head, ...qs.map(q => `${q.name.padEnd(16)}${String(q.prio).padStart(3)}  Open:Active       -    -    -    - ${String(count(q.name)).padStart(5)} ${String(count(q.name, 'PEND')).padStart(5)} ${String(count(q.name, 'RUN')).padStart(5)}     0`)].join('\n');
  }

  function count(queue, stat) {
    return [...jobs.values()].filter(j => !j.isArray && j.queue === queue && (stat ? j.stat === stat : j.stat === 'PEND' || j.stat === 'RUN')).length;
  }

  function bhosts(args) {
    const busy = new Map();
    for (const j of jobs.values()) if (j.stat === 'RUN' && j.execHost) busy.set(j.execHost, (busy.get(j.execHost) || 0) + 1);
    const head = 'HOST_NAME          STATUS       JL/U    MAX  NJOBS    RUN  SSUSP  USUSP    RSV';
    const list = NODES.slice(0, args.includes('-a') ? 80 : 12).map((n, i) => {
      const bg = (i * 7) % 25;
      const nj = Math.min(24, bg + (busy.get(n) || 0));
      const st = i === 9 ? 'closed_Adm' : nj >= 24 ? 'closed_Full' : 'ok';
      return `${n.padEnd(19)}${st.padEnd(13)}-${String(24).padStart(10)}${String(nj).padStart(7)}${String(nj).padStart(7)}      0      0      0`;
    });
    return [head, ...list, args.includes('-a') ? '' : `... ${NODES.length - 12} more hosts (bhosts -a lists them all)`].filter(Boolean).join('\n');
  }

  function bhist(args) {
    const ids = args.filter(a => /^\d/.test(a));
    let list = [...jobs.values()].filter(j => !j.isArray && j.user === user());
    if (ids.length) list = list.filter(j => ids.includes(j.id) || ids.includes(j.parentId));
    else if (!args.includes('-a')) list = list.filter(j => j.stat === 'DONE' || j.stat === 'EXIT' || j.stat === 'RUN' || j.stat === 'PEND');
    if (!list.length) return 'No matching job found';
    const sec = (a, b) => (a && b ? Math.max(0, Math.round((b - a) / 1000)) : 0);
    const head = 'Summary of time in seconds spent in various states:\nJOBID   USER    JOB_NAME  PEND    PSUSP   RUN     USUSP   SSUSP   UNKWN   TOTAL';
    return [head, ...list.map(j => {
      const pend = sec(j.submit, j.start || Date.now()), run = sec(j.start, j.end || (j.start ? Date.now() : null));
      return `${j.id.padEnd(8)}${j.user.padEnd(8)}${(j.name.length > 9 ? '*' + j.name.slice(-8) : j.name).padEnd(10)}${String(pend).padEnd(8)}0       ${String(run).padEnd(8)}0       0       0       ${pend + run}`;
    })].join('\n');
  }

  function bpeek(args) {
    const id = args.find(a => /^\d/.test(a)) || [...jobs.values()].filter(j => j.user === user() && j.stat === 'RUN').map(j => j.id).pop();
    const j = id && jobs.get(String(id));
    if (!j) return 'No unfinished job found';
    if (j.stat === 'PEND') return `Job <${j.id}> : Not yet started.`;
    if (j.stat !== 'RUN') return `Job <${j.id}> : Job has already finished; use bjobs -l or the output file`;
    return `<< output from stdout >>\n${j.output || ''}`;
  }

  const lsid = () => `${H.lsfVersion}\nCopyright International Business Machines Corp. 1992, 2016.\nUS Government Users Restricted Rights - Use, duplication or disclosure restricted by GSA ADP Schedule Contract with IBM Corp.\n\nMy cluster name is ${H.clusterName}\nMy master name is ${H.masterHost}`;

  const lshosts = () => ['HOST_NAME                     type    model  cpuf ncpus maxmem maxswp server RESOURCES',
    ...NODES.slice(0, 8).map(n => `${n.padEnd(30)}X86_64  Intel_EM 60.0    24  92G      -    Yes (mg)`), '...'].join('\n');

  const lsload = () => ['HOST_NAME               status  r15s   r1m  r15m   ut    pg  ls    it   tmp   swp   mem',
    ...NODES.slice(0, 8).map((n, i) => `${n.padEnd(24)}ok   ${(0.2 + i * 0.7).toFixed(1).padStart(5)} ${(0.3 + i * 0.6).toFixed(1).padStart(5)} ${(0.5 + i * 0.4).toFixed(1).padStart(5)}  ${String(5 + i * 9).padStart(2)}%   0.0   0    ${String(2 + i).padStart(2)}   78G    0M   ${60 - i * 5}G`), '...'].join('\n');

  function startInteractive(args, ctx) {
    const { opts } = parseBsub(args);
    opts.queue = opts.queue || 'inter';
    validate(opts);
    const job = newJob(opts, args.slice(args.findIndex(a => !a.startsWith('-') && !/^(inter|short|medium|long)$/.test(a)) || 0).join(' ') || 'bash', ctx, { interactive: true });
    job.execHost = NODES[Math.floor(Math.random() * NODES.length)];
    ev.emit('change');
    save();
    return job;
  }

  function markRunning(job) { job.stat = 'RUN'; job.start = Date.now(); ev.emit('change'); }
  function finishInteractive(job, code = 0) {
    if (job.stat !== 'RUN' && job.stat !== 'PEND') return;
    job.stat = code ? 'EXIT' : 'DONE'; job.exitCode = code; job.end = Date.now();
    ev.emit('change'); save();
  }

  return {
    on: (...a) => ev.on(...a),
    submit, kill, bjobs, bqueues, bhosts, bhist, bpeek, lsid, lshosts, lsload,
    startInteractive, markRunning, finishInteractive, parseBsub, directives,
    jobs: () => [...jobs.values()],
    get: (id) => jobs.get(String(id)),
    validProjects,
    nodes: NODES,
  };
}
