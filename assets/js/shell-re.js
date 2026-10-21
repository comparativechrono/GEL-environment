/* =====================================================================
   Research Environment commands for the terminal (RE simulator).

     module avail|load|unload|list|purge|spider|show|whatis   (and ml)
     ssh [user@]doublehelix.helix.prod.aws.gel.ac          log in to the HPC
     ssh-keygen, ssh-copy-id                                  key-based login
     bsub, bjobs, bkill, bqueues, bhosts, bhist, bpeek,
     bacct, lsid, lshosts, lsload                             LSF – on the HPC only
     bsub -q inter -P CODE -Is bash                           an interactive job
     rstudio, spyder, igv, firefox, mousepad, scite, gvim,
     code, xdg-open                                           desktop applications
     exit / logout                                            leave the HPC, a job – or close the window
     help, man                                                the RE's own listing and pages

   Programs of the workbench engine that this site does not bundle, and
   the commands for workbench tabs that the desktop has no use for
   (network, dot), are taken out of the terminal here.

   Where the shell is (desktop, the HPC's login node, a compute node) is
   kept on the shell: shell.re = { mode, modules, stack }. A terminal's
   view of the files (Object.create(fs)) gets the HPC's own home folder
   while it is logged in (see vfs.js: aliases).
   ===================================================================== */
(function () {
  'use strict';
  const MG = window.MG;
  const B = MG.shellBuiltins;
  const RE = window.RE;
  const C = RE.config;
  const H = C.hpc;
  const userErr = (msg, code = 1) => (MG.shellUtil && MG.shellUtil.userErr ? MG.shellUtil.userErr(msg, code) : Object.assign(new Error(msg), { code }));
  MG.shellHooks = MG.shellHooks || {};

  const LSF_CMDS = ['bsub', 'bjobs', 'bkill', 'bqueues', 'bhosts', 'bhist', 'bpeek', 'bacct', 'lsid', 'lshosts', 'lsload', 'bstop', 'bresume', 'bmod', 'btop', 'bbot'];
  const GATED = new Set(['samtools', 'bcftools', 'tabix', 'bgzip', 'htsfile', 'bedtools', 'plink', 'plink2', 'bamtools', 'gatk', 'picard', 'nextflow', 'regenie', 'king', 'beagle', 'exomiser', 'ExpansionHunter', 'rtg', 'kraken2', 'magma', 'singularity']);

  /** where this shell is: desktop | hpc (login node) | compute (a job) */
  function state(ctx) {
    const sh = ctx.shell;
    if (!sh.re) sh.re = { mode: ctx.term ? 'desktop' : 'compute', modules: [], stack: [] };
    return sh.re;
  }
  const onHpc = (ctx) => state(ctx).mode !== 'desktop';
  const user = () => RE.session.username;
  const hpcHome = () => `/hpc_home/${user()}`;
  const loginHosts = () => [H.loginHost, 'doublehelix', 'doublehelix.helix.prod.aws.gel.ac', 'helix', 'cluster'];

  // ------------------------------------------------------------ the session stack
  function setPrompt(ctx, host) {
    if (ctx.term) {
      ctx.term.hostname = host;
      ctx.term._renderPrompt && ctx.term._renderPrompt();
    }
    ctx.shell.env.HOSTNAME = host;
  }

  function enterHpc(ctx, host) {
    const st = state(ctx);
    const view = ctx.term ? ctx.term.fs : null;
    st.stack.push({ kind: 'ssh', host: ctx.term ? ctx.term.hostname : C.desktopHostname, mode: st.mode, modules: st.modules.slice(), cwd: ctx.fs.cwd, aliases: view ? view.aliases : null, hasOwnAliases: view ? Object.prototype.hasOwnProperty.call(view, 'aliases') : false, env: { HOME: ctx.shell.env.HOME } });
    st.mode = 'hpc';
    st.modules = [];
    if (view) {
      // on the HPC, /home/USER is the HPC's own home; the desktop's links are not there
      view.aliases = [[`/home/${user()}`, hpcHome(), { shown: true }], ['/public_data_resources', '/pgen_public_data_resources']];
      view.cwd = hpcHome();
    }
    setPrompt(ctx, host);
  }

  function leave(ctx, io) {
    const st = state(ctx);
    const top = st.stack.pop();
    if (!top) return false;
    if (top.kind === 'job') {
      RE.services.lsf.finishInteractive(top.job, 0);
      io.out('exit\n');
      st.mode = 'hpc';
      st.modules = top.modules;
      setPrompt(ctx, top.host);
      if (ctx.term && top.cwd) ctx.term.fs.cwd = top.cwd;
      return true;
    }
    io.out(`logout\nConnection to ${H.loginHost} closed.\n`);
    st.mode = top.mode;
    st.modules = top.modules;
    if (ctx.term) {
      const view = ctx.term.fs;
      if (top.hasOwnAliases) view.aliases = top.aliases; else delete view.aliases;
      view.cwd = top.cwd && MG.app.fs.isDir(top.cwd) ? top.cwd : MG.app.HOME;
    }
    setPrompt(ctx, top.host);
    return true;
  }

  MG.shellHooks.onExit = (shell, io) => {
    const ctx = { shell, term: shell.term, fs: shell.fs };
    if (shell.re && shell.re.stack.length) return leave(ctx, io);
    // the top level of a desktop terminal: the window closes, as xfce4-terminal does
    if (shell.term && shell.term.reWindow) { setTimeout(() => shell.term.reWindow.close(), 150); return true; }
    return false;
  };

  /** ask a question on the terminal's line (yes/no, a password) → the answer, or null after Ctrl+C */
  function ask(ctx, prompt, { secret = false } = {}) {
    const term = ctx.term;
    if (!term || !term.attach) return Promise.resolve(null);
    return new Promise((resolve) => {
      const prog = {
        prompt, title: 'ssh', secret, history: [],
        line: (t) => { term.detach(prog); resolve(t); },
        interrupt: () => { term.detach(prog); term.out && term.out('^C\n'); resolve(null); },
      };
      term.attach(prog);
    });
  }

  // ---------------------------------------------------------------- modules
  const M = RE.services.modules;
  B.module = async (ctx) => {
    const st = state(ctx);
    const [sub, ...rest] = ctx.args;
    switch (sub) {
      case undefined: case 'help': case '-h': case '--help':
        ctx.out('Usage: module [options] sub-command [args ...]\n\nSub-commands:\n  avail [pattern]      List the modules that can be loaded\n  spider [pattern]     Search all modules\n  load mod ...         Load modules (e.g. module load R/4.3.3)\n  unload mod ...       Remove modules\n  swap old new         Unload one module and load another\n  list                 List the loaded modules\n  purge                Unload all modules\n  show mod             What a module does\n  whatis mod           A one-line description\n');
        return 0;
      case 'avail': case 'av': case 'spider': {
        const t = M.avail(rest[0] || '', 110);
        if (!t) { ctx.err(`No module(s) or extension(s) found!\nUse "module spider" to find all possible modules and extensions.\n`); return 1; }
        ctx.out(t);
        return 0;
      }
      case 'load': case 'add': {
        if (!rest.length) throw userErr('module load: no module named');
        for (const name of rest) {
          const mod = M.find(name);
          if (!mod) {
            ctx.err(`Lmod has detected the following error:  The following module(s) are unknown: "${name}"\n\nPlease check the spelling or version number. Also try "module spider ..."\nIt is also possible your cache file is out-of-date; it may help to try:\n  $ module --ignore_cache load "${name}"\n`);
            return 1;
          }
          const fam = M.family(mod);
          st.modules = st.modules.filter(m => M.family(m) !== fam);
          st.modules.push(mod);
          if (/^python\//.test(mod)) ctx.out(`${mod} has been loaded\n`);
          if (/^R\//.test(mod)) ctx.shell.env.R_VERSION = mod.split('/')[1];
        }
        ctx.shell.env.LOADEDMODULES = st.modules.join(':');
        return 0;
      }
      case 'unload': case 'rm': case 'del': {
        for (const name of rest) st.modules = st.modules.filter(m => m !== name && M.family(m) !== name.split('/')[0]);
        ctx.shell.env.LOADEDMODULES = st.modules.join(':');
        return 0;
      }
      case 'swap': case 'switch': {
        const [a, b] = rest;
        st.modules = st.modules.filter(m => m !== a && M.family(m) !== String(a).split('/')[0]);
        const mod = M.find(b);
        if (mod) st.modules.push(mod); else { ctx.err(`The following module(s) are unknown: "${b}"\n`); return 1; }
        return 0;
      }
      case 'list': case 'li':
        ctx.out(st.modules.length ? `\nCurrently Loaded Modules:\n${st.modules.map((m, i) => `  ${i + 1}) ${m}`).join('   ')}\n\n` : 'No modules loaded\n');
        return 0;
      case 'purge':
        st.modules = [];
        ctx.shell.env.LOADEDMODULES = '';
        return 0;
      case 'show': case 'display': {
        const mod = M.find(rest[0]);
        if (!mod) { ctx.err(`Lmod has detected the following error: Unable to find: "${rest[0]}"\n`); return 1; }
        ctx.out(M.show(mod));
        return 0;
      }
      case 'whatis': {
        const mod = M.find(rest[0]);
        if (!mod) { ctx.err(`Unable to find: "${rest[0]}"\n`); return 1; }
        ctx.out(M.whatis(mod) + '\n');
        return 0;
      }
      default:
        ctx.err(`module: unknown sub-command "${sub}" (see  module help)\n`);
        return 1;
    }
  };
  B.ml = (ctx) => {
    if (!ctx.args.length) return B.module(Object.assign(ctx, { args: ['list'] }));
    if (['avail', 'av', 'spider', 'list', 'purge', 'show', 'unload', 'load', 'swap', 'whatis', 'help'].includes(ctx.args[0])) return B.module(ctx);
    return B.module(Object.assign(ctx, { args: ['load', ...ctx.args] }));
  };

  // ------------------------------------------------------- gate: modules & LSF
  const dispatch0 = MG.Shell.prototype.dispatch;
  MG.Shell.prototype.dispatch = async function (name, ctx) {
    if (LSF_CMDS.includes(name) && (!this.re || this.re.mode === 'desktop') && ctx.term) {
      ctx.err(`bash: ${name}: command not found\n`);
      ctx.io.note(`The LSF job scheduler runs on the HPC, not on the desktop. Log in first:  ssh ${user()}@${H.loginHost}`);
      return 127;
    }
    if (GATED.has(name) && RE.session.settings.requireModules !== false) {
      const st = this.re || { modules: [] };
      if (!M.providerOf(name, st.modules)) {
        const mod = M.suggestFor(name);
        ctx.err(`bash: ${name}: command not found\n`);
        if (mod) ctx.io.note(`${name} is installed as a module. Load it first:  module load ${mod}   (module avail ${mod.split('/')[0]} lists the versions)`);
        return 127;
      }
    }
    return dispatch0.call(this, name, ctx);
  };

  // ---------------------------------------------------------------------- ssh
  const knownFile = () => `${MG.app.HOME}/.ssh/known_hosts`;
  function sshConfigHosts(ctx) {
    // Host aliases from ~/.ssh/config (Host cluster / Hostname doublehelix... / IdentityFile ~/.ssh/cluster)
    const out = {};
    const e = MG.app.fs.get(`${MG.app.HOME}/.ssh/config`);
    if (!e || e.kind !== 'text') return out;
    let cur = null;
    for (const line of e.text.split('\n')) {
      const m = /^\s*(\w+)\s+(.+?)\s*$/.exec(line);
      if (!m) continue;
      const k = m[1].toLowerCase();
      if (k === 'host') { cur = { names: m[2].split(/\s+/) }; for (const n of cur.names) out[n] = cur; }
      else if (cur) cur[k] = m[2];
    }
    return out;
  }

  B.ssh = async (ctx) => {
    let target = null, login = null;
    for (let i = 0; i < ctx.args.length; i++) {
      const a = ctx.args[i];
      if (/^-[XYAqtvC46N]+$/.test(a)) continue;
      if (a === '-l') { login = ctx.args[++i]; continue; }
      if (/^-[ipFoLRDWJ]$/.test(a)) { i++; continue; }
      if (a.startsWith('-')) continue;
      target = a;
      break;
    }
    if (!target) { ctx.err('usage: ssh [-46AaCfGgKkMNnqsTtVvXxYy] [-B bind_interface] [-b bind_address]\n           [-c cipher_spec] [-D [bind_address:]port] [-E log_file]\n           [-i identity_file] [-J destination] [-l login_name]\n           [-o option] [-p port] [-R address] destination [command [argument ...]]\n'); return 255; }
    const m = /^(?:([^@]+)@)?(.+)$/.exec(target);
    const who = login || m[1] || user();
    let host = m[2];
    const cfg = sshConfigHosts(ctx)[host];
    if (cfg && cfg.hostname) host = cfg.hostname;
    if (cfg && cfg.user && !m[1]) { /* user from config */ }
    if (!loginHosts().includes(host)) {
      if (/^(\d+\.){3}\d+$/.test(host) || /\./.test(host)) { ctx.err(`ssh: connect to host ${host} port 22: Connection timed out\n`); ctx.io.note('Only the Genomics England HPC can be reached from the Research Environment.'); }
      else ctx.err(`ssh: Could not resolve hostname ${host}: Name or service not known\n`);
      return 255;
    }
    if (onHpc(ctx)) { ctx.err(`You are already logged in to the HPC (${ctx.term ? ctx.term.hostname : 'compute node'}). Type  exit  to go back to the desktop.\n`); return 1; }
    if (who !== user()) {
      const pw = await ask(ctx, `${who}@${H.loginHost}'s password: `, { secret: true });
      if (pw === null) return 130;
      ctx.err('Permission denied, please try again.\n');
      return 255;
    }
    const fs = MG.app.fs;
    const known = fs.get(knownFile());
    if (!known || known.kind !== 'text' || !known.text.includes(H.loginHost)) {
      ctx.out(`The authenticity of host '${H.loginHost} (10.128.12.177)' can't be established.\nED25519 key fingerprint is SHA256:Gm3Lw8yKp1Qe2N0rT5uVxZb7cHd9fJ4kM6sA0oPqRtU.\nThis key is not known by any other names.\n`);
      let ans = await ask(ctx, 'Are you sure you want to continue connecting (yes/no/[fingerprint])? ');
      while (ans !== null && !/^(yes|no)$/i.test(ans.trim())) ans = await ask(ctx, 'Please type \'yes\', \'no\' or the fingerprint: ');
      if (ans === null) return 130;
      if (/^no$/i.test(ans.trim())) { ctx.err('Host key verification failed.\n'); return 255; }
      ctx.err(`Warning: Permanently added '${H.loginHost}' (ED25519) to the list of known hosts.\n`);
      const line = `${H.loginHost} ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOq3kT7d0yUu5n9c2x8m1VbRsZqH4aLfW6eJpGyNtC0v\n`;
      try { fs.mkdirp(`${MG.app.HOME}/.ssh`); if (known && known.kind === 'text') fs.appendText(knownFile(), line); else fs.writeText(knownFile(), line); } catch (e) { /* ignore */ }
    }
    const keyOk = RE.kv.get('ssh:keyInstalled', false) && (!cfg || !cfg.identityfile || fs.exists(String(cfg.identityfile).replace(/^~/, MG.app.HOME)));
    if (!keyOk) {
      let tries = 0;
      for (;;) {
        const pw = await ask(ctx, `${who}@${H.loginHost}'s password: `, { secret: true });
        if (pw === null) return 130;
        if (pw.length) break;
        if (++tries >= 3) { ctx.err(`${who}@${H.loginHost}: Permission denied (publickey,password).\n`); return 255; }
        ctx.err('Permission denied, please try again.\n');
      }
    }
    const last = RE.kv.get('ssh:lastLogin', null);
    RE.kv.set('ssh:lastLogin', Date.now());
    ctx.out(`${last ? `Last login: ${new Date(last).toString().replace(/ GMT.*/, '')} from ${C.desktopHostname.replace(/^ip-/, '').replace(/-/g, '.')}\n` : ''}` +
      `\n  ____              _     _        _   _      _ _\n |  _ \\  ___  _   _| |__ | | ___  | | | | ___| (_)_  __\n | | | |/ _ \\| | | | '_ \\| |/ _ \\ | |_| |/ _ \\ | \\ \\/ /\n | |_| | (_) | |_| | |_) | |  __/ |  _  |  __/ | |>  <\n |____/ \\___/ \\__,_|_.__/|_|\\___| |_| |_|\\___|_|_/_/\\_\\\n\n` +
      `  ${C.organisation} High Performance Cluster (${H.clusterName})  [training simulator]\n  Run analyses as LSF jobs: bsub, bjobs, bqueues.  Interactive work: bsub -q inter -P <project> -Is bash\n  Your HPC home is NOT your desktop home: keep your work in /re_gecip/${RE.session.user.domain || 'training'}/${user()}\n\n`);
    enterHpc(ctx, H.loginNodeName);
    return 0;
  };

  B['ssh-keygen'] = async (ctx) => {
    const fs = MG.app.fs;
    const dir = (onHpc(ctx) ? hpcHome() : MG.app.HOME) + '/.ssh';
    let file = null;
    const fi = ctx.args.indexOf('-f');
    if (fi >= 0) file = ctx.args[fi + 1];
    ctx.out('Generating public/private ed25519 key pair.\n');
    if (!file) {
      const ans = await ask(ctx, `Enter file in which to save the key (${dir}/id_ed25519): `);
      if (ans === null) return 130;
      file = ans.trim() || `${dir}/id_ed25519`;
    }
    const abs = ctx.fs.resolve(file.replace(/^~/, MG.app.HOME));
    const p1 = await ask(ctx, 'Enter passphrase (empty for no passphrase): ', { secret: true });
    if (p1 === null) return 130;
    const p2 = await ask(ctx, 'Enter same passphrase again: ', { secret: true });
    if (p2 === null) return 130;
    if (p1 !== p2) { ctx.err('Passphrases do not match.  Try again.\n'); return 1; }
    const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'[b % 64]).join('');
    try {
      fs.mkdirp(MG.path.dirname(abs));
      fs.writeText(abs, `-----BEGIN OPENSSH PRIVATE KEY-----\n${rnd()}${rnd()}\n${rnd()}${rnd()}\n-----END OPENSSH PRIVATE KEY-----\n`);
      fs.chmod(abs, { readonly: false, bits: 0o600 });
      fs.writeText(abs + '.pub', `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI${rnd().slice(0, 43)} ${user()}@${C.desktopHostname}\n`);
    } catch (e) { ctx.err(`${abs}: ${e.message}\n`); return 1; }
    ctx.out(`Your identification has been saved in ${abs}\nYour public key has been saved in ${abs}.pub\nThe key fingerprint is:\nSHA256:${rnd().slice(0, 43)} ${user()}@${C.desktopHostname}\n`);
    return 0;
  };

  B['ssh-copy-id'] = async (ctx) => {
    const target = ctx.args.filter(a => !a.startsWith('-') && !/\.pub$/.test(a)).pop();
    if (!target) { ctx.err('Usage: /usr/bin/ssh-copy-id [-h|-?|-f|-n|-s|-x] [-i [identity_file]] [-p port] [-F alternative ssh_config file] [-t target_path] [[-o <ssh -o options>] ...] [user@]hostname\n'); return 1; }
    let host = target.replace(/^.*@/, '');
    const cfg = sshConfigHosts(ctx)[host];
    if (cfg && cfg.hostname) host = cfg.hostname;
    if (!loginHosts().includes(host)) { ctx.err(`ssh: Could not resolve hostname ${host}: Name or service not known\n`); return 1; }
    ctx.out('/usr/bin/ssh-copy-id: INFO: attempting to log in with the new key(s), to filter out any that are already installed\n/usr/bin/ssh-copy-id: INFO: 1 key(s) remain to be installed -- if you are prompted now it is to install the new keys\n');
    const pw = await ask(ctx, `${user()}@${H.loginHost}'s password: `, { secret: true });
    if (pw === null) return 130;
    RE.kv.set('ssh:keyInstalled', true);
    ctx.out(`\nNumber of key(s) added: 1\n\nNow try logging into the machine, with:   "ssh '${target}'"\nand check to make sure that only the key(s) you wanted were added.\n\n`);
    return 0;
  };

  // ---------------------------------------------------------------------- LSF
  const L = () => RE.services.lsf;
  const lsfCtx = (ctx) => ({ cwd: ctx.fs.cwd, home: `/home/${user()}`, fsView: ctx.term ? ctx.term.fs : ctx.fs, env: { PATH: ctx.shell.env.PATH } });

  B.bsub = async (ctx) => {
    const args = ctx.args;
    if (args.includes('-h') || args.includes('--help')) {
      ctx.out('Usage: bsub [-q queue] [-P project] [-J job_name] [-n cores] [-R "rusage[mem=MB]"] [-M MB]\n            [-o out_file] [-e err_file] [-W [hours:]minutes] [-w "done(JOBID)"] [-Is]\n            command [arguments] | < script\n\nExamples:\n  bsub -q short -P re_gecip_training -o job.%J.out -e job.%J.err -R "rusage[mem=1000]" -M 1000 bash myscript.sh\n  bsub < myscript.sh            (with #BSUB lines in the script)\n  bsub -q inter -P re_gecip_training -Is bash\n');
      return 0;
    }
    try {
      const { opts } = L().parseBsub(args);
      if (opts.interactive) return await interactive(ctx, args);
      let stdin = null;
      if (ctx.stdin != null) stdin = typeof ctx.stdin === 'string' ? ctx.stdin : null;
      else if (ctx.inherit && ctx.inherit.pos < ctx.inherit.text.length) { stdin = ctx.inherit.text.slice(ctx.inherit.pos); ctx.inherit.pos = ctx.inherit.text.length; }
      const msg = L().submit(args, lsfCtx(ctx), stdin);
      ctx.out(msg + '\n');
      return 0;
    } catch (e) {
      ctx.err(String(e.message || e) + '\n');
      return 255;
    }
  };

  async function interactive(ctx, args) {
    const st = state(ctx);
    if (st.mode === 'compute') { ctx.err('bsub: you are already inside a job on a compute node.\n'); return 255; }
    const job = L().startInteractive(args, lsfCtx(ctx));
    ctx.out(`Job <${job.id}> is submitted to queue <${job.queue}>.\n<<Waiting for dispatch ...>>\n`);
    await new Promise(r => setTimeout(r, 1200 + Math.random() * 1500));
    ctx.out(`<<Starting on ${job.execHost}>>\n`);
    L().markRunning(job);
    st.stack.push({ kind: 'job', job, host: ctx.term ? ctx.term.hostname : H.loginNodeName, modules: st.modules.slice(), cwd: ctx.fs.cwd });
    st.mode = 'compute';
    setPrompt(ctx, job.execHost);
    job.onKill = () => {
      if (st.stack.length && st.stack[st.stack.length - 1].job === job) {
        const top = st.stack.pop();
        st.mode = 'hpc'; st.modules = top.modules; setPrompt(ctx, top.host);
        if (ctx.term) ctx.term.note && ctx.term.note(`Job <${job.id}> was terminated (bkill): back on the login node.`);
      }
    };
    return 0;
  }

  const report = (fn) => async (ctx) => { const t = fn(ctx.args); ctx.out(t.endsWith('\n') ? t : t + '\n'); return 0; };
  B.bjobs = report((a) => L().bjobs(a));
  B.bqueues = report((a) => L().bqueues(a));
  B.bhosts = report((a) => L().bhosts(a));
  B.bhist = report((a) => L().bhist(a));
  B.bpeek = report((a) => L().bpeek(a));
  B.lsid = report(() => L().lsid());
  B.lshosts = report(() => L().lshosts());
  B.lsload = report(() => L().lsload());
  B.bacct = report(() => {
    const done = L().jobs().filter(j => j.user === user() && (j.stat === 'DONE' || j.stat === 'EXIT'));
    return `Accounting information about jobs that are:\n  - submitted by users ${user()},\n  - accounted on all projects.\n  - completed normally or exited\n  - executed on all hosts.\n  - submitted to all queues.\n  - accounted on all service classes.\n------------------------------------------------------------------------------\n\nSUMMARY:      ( time unit: second )\n Total number of done jobs:    ${done.filter(j => j.stat === 'DONE').length}      Total number of exited jobs:     ${done.filter(j => j.stat === 'EXIT').length}\n`;
  });
  B.bkill = async (ctx) => {
    const ids = ctx.args.filter(a => /^\d+(\[\d+\])?$/.test(a));
    if (!ids.length) { ctx.err('bkill: Job ID or "0" must be specified\nUsage: bkill [-l] [-s signal_value] [-q queue_name] [-u user_name | -u all] [-J job_name] [jobId | "jobId[index_list]" ...]\n'); return 255; }
    for (const id of ids) ctx.out(L().kill(id, user()) + '\n');
    return 0;
  };
  for (const c of ['bstop', 'bresume', 'bmod', 'btop', 'bbot']) B[c] = async (ctx) => { ctx.err(`${c}: not available in the training simulator\n`); return 1; };

  // ------------------------------------------------------- desktop applications
  const gui = (name, fn) => async (ctx) => {
    if (onHpc(ctx)) {
      ctx.err(`${name}: cannot open display: the HPC has no desktop.\n`);
      ctx.io.note(`Graphical programs run on the Research Environment desktop. Type  exit  to leave the HPC, then run ${name} again.`);
      return 1;
    }
    return fn(ctx);
  };
  const ide0 = { rstudio: B.rstudio, spyder: B.spyder };
  B.rstudio = gui('rstudio', (ctx) => ide0.rstudio(ctx));
  B.spyder = gui('spyder', (ctx) => ide0.spyder(ctx));
  B.igv = gui('igv', async (ctx) => {
    const files = [];
    let locus = null, genome = null, batch = null;
    for (let i = 0; i < ctx.args.length; i++) {
      const a = ctx.args[i];
      if (a === '-g' || a === '--genome') genome = ctx.args[++i];
      else if (a === '-l' || a === '--locus') locus = ctx.args[++i];
      else if (a === '-b' || a === '--batch') {
        const b = ctx.args[++i];
        if (!b || !ctx.fs.exists(b)) throw userErr(`igv: ${b || ''}: No such file or directory`);
        batch = ctx.fs.resolve(b);
      }
      else if (/^[\w.]+:[\d,]+(-[\d,]+)?$/.test(a) && !ctx.fs.exists(a)) locus = a;
      else if (!a.startsWith('-')) {
        if (!ctx.fs.exists(a)) throw userErr(`igv: ${a}: No such file or directory`);
        files.push(ctx.fs.resolve(a));
      }
    }
    await RE.apps.launchApp('igv', { paths: files, locus, batch, genome: genome && ctx.fs.exists(genome) ? ctx.fs.resolve(genome) : genome });
    return 0;
  });
  B.firefox = gui('firefox', async (ctx) => {
    const url = ctx.args.find(a => !a.startsWith('-'));
    await RE.apps.launchApp('web-browser', { url: url ? (/^[a-z]+:\/\//i.test(url) ? url : (ctx.fs.exists(url) ? 'file://' + ctx.fs.resolve(url) : 'https://' + url)) : undefined, newWindow: true });
    return 0;
  });
  B['xdg-open'] = gui('xdg-open', async (ctx) => {
    const f = ctx.args[0];
    if (!f) { ctx.err('xdg-open: no file or URL given\nUsage: xdg-open { file | URL }\n'); return 1; }
    if (/^https?:\/\//.test(f)) return B.firefox(ctx);
    if (!ctx.fs.exists(f)) { ctx.err(`xdg-open: file '${f}' does not exist\n`); return 2; }
    await MG.app.openFile(ctx.fs.resolve(f));
    return 0;
  });
  const editor = (name) => gui(name, async (ctx) => {
    const files = ctx.args.filter(a => !a.startsWith('-') && !a.startsWith('+'));
    if (!files.length) await RE.apps.launchApp('text-editor', {});
    for (const f of files) await MG.app.editFile(ctx.fs.resolve(f), { create: true });
    return 0;
  });
  for (const n of ['mousepad', 'scite', 'SciTE', 'gvim', 'gedit', 'code', 'pluma']) B[n] = editor(n);
  B.nautilus = B.thunar = gui('thunar', async (ctx) => { await RE.apps.launchApp('file-manager', { path: ctx.args[0] ? ctx.fs.resolve(ctx.args[0]) : ctx.fs.cwd }); return 0; });
  B['xfce4-terminal'] = B['gnome-terminal'] = gui('xfce4-terminal', async () => { await RE.apps.launchApp('terminal', {}); return 0; });
  B.jupyter = async (ctx) => {
    ctx.err('jupyter: Jupyter notebooks are not part of the training simulator.\n');
    ctx.io.note('In the real RE you would run  module load python/3.11  and  jupyter notebook --port <port>. Here, use Spyder (spyder) or python3 in the terminal for Python work.');
    return 1;
  };

  // ------------------------------------------- what this site does not bundle
  // The engine knows every program of the bioinformatics workbench, but only some of them are copied into this site
  // (assets/vendor/genomics-wasm holds PLINK 2 only), and two commands open workbench tabs that the desktop does not
  // have (network: the Networks tab; dot: Graphviz). They are taken out, so that the shell says "command not found",
  // as on a computer without them – not that a file failed to load.
  const T = MG.shellTools || {};
  for (const n of ['featureCounts', 'salmon', 'cutadapt', 'lofreq', 'bam-somaticsniper', 'somaticsniper', 'macs3', 'prodigal', 'bustools',
    'hmmbuild', 'hmmsearch', 'hmmscan', 'hmmpress', 'hmmfetch', 'hmmalign', 'hmmconvert', 'hmmemit', 'hmmstat', 'phmmer', 'jackhmmer',
    'nhmmer', 'nhmmscan']) delete T[n];
  delete B.network;
  delete B.dot;

  // ------------------------------------------------------------- help and man
  B.help = (ctx) => {
    const v = (MG.wasm && MG.wasm.versions) || {};
    const has = (n) => !!T[n];
    const row = (name, text) => '  ' + name.padEnd(37) + ' ' + text;
    const list = (names) => names.filter(has).map((n) => (v[n] ? `${n} ${v[n]}` : n)).join(', ');
    ctx.out([
      'Commands of the Research Environment terminal. (man NAME: how to use one; NAME --help: its options)',
      '',
      'The Research Environment:',
      row('module avail | load NAME | list', 'software comes as environment modules (ml for short):  module load samtools'),
      row(`ssh ${user()}@${H.loginHost.split('.')[0]}…`, `log in to the HPC:  ssh ${user()}@${H.loginHost}`),
      row('bsub, bjobs, bkill, bqueues, bhist', 'LSF jobs, on the HPC:  bsub -q short -P <project> -o job.%J.out "COMMAND"'),
      row('bsub -q inter -P <project> -Is bash', 'an interactive job on a compute node (exit to leave it)'),
      row('quota', 'the space your home folder uses'),
      row('rstudio, spyder, igv FILE…', 'open RStudio, Spyder or IGV (igv: with BAM, CRAM, VCF or BED files)'),
      row('mousepad FILE, firefox URL', 'the text editor; the web browser'),
      row('xdg-open FILE', 'open a file with its application'),
      '',
      'Genomics programs (the real programs, compiled to WebAssembly – load their module first):',
      '  ' + list(['samtools', 'bcftools', 'bgzip', 'tabix', 'bedtools', 'plink2']),
      '  ' + list(['fastp', 'seqtk', 'minimap2', 'bowtie2', 'bwa', 'bwa-mem2', 'hisat2']),
      '  ' + list(['mosdepth', 'freebayes', 'stringtie', 'kallisto', 'wgsim', 'gffread']),
      '  ' + list(['kalign', 'muscle', 'fasttree', 'lastz', 'needleman_wunsch', 'smith_waterman']) + (has('jq') ? `, jq ${v.jq || ''}`.trimEnd() : ''),
      '',
      'Languages:',
      row('R, Rscript', 'R 4.6 (webR): R starts its console here;  Rscript script.R  runs a script'),
      row('python3, pip', 'Python 3.13 (Pyodide):  python3 script.py,  pip install NAME'),
      '',
      'GNU text tools (WebAssembly):',
      `  cat head tail wc sort uniq cut tr tee paste join comm seq fold shuf md5sum date (coreutils ${v.coreutils || ''})`,
      `  grep egrep fgrep (grep ${v.grep || ''})   sed (sed ${v.sed || ''})   awk gawk (gawk ${v.gawk || ''})   diff cmp (diffutils ${v.diffutils || ''})`,
      '  gzip gunzip zcat zgrep (done by bgzip)',
      '',
      'Files and folders:',
      '  ls cd pwd mkdir cp mv rm rmdir touch tree find du stat file chmod basename dirname realpath',
      '  unzip, zip, tar (-xzf, -czf)   curl, wget   nano FILE (the text editor)   download FILE (to your own computer)',
      '  export-session FILE.sh   the commands of this session as a script',
      '',
      'Your folders: ~ (your home), /re_gecip/<domain>/<you> (your project work), /re_scratch (temporary files);',
      '  read-only: /genomes, /gel_data_resources, /pgen_public_data_resources. Results leave only through the Airlock.',
      '',
      'The shell is bash: | && || ; > >> < 2> 2>&1, quotes, $VAR, $( ), $(( )), globs, if/for/while/case, functions,',
      '  [[ ]], here-documents, <( ), xargs, printf, read. Scripts: bash script.sh. Not there: background jobs (&), sudo, apt.',
      'Keys: ↑/↓ earlier commands · Tab completes · Ctrl+C stops · Ctrl+L clears.',
      '',
    ].join('\n'));
    return 0;
  };

  const RE_MAN = {
    module: 'module – environment modules (Lmod): the software of the Research Environment\n\n  module avail [TEXT]        the modules that can be loaded (ml av)\n  module spider TEXT         search the modules\n  module load NAME[/VER] …   load modules – the default version when none is given (ml NAME)\n  module list                the modules loaded in this shell (ml)\n  module unload NAME         unload one;   module purge   unload them all\n  module swap OLD NEW        change version\n  module show NAME           what a module sets;   module whatis NAME   one line about it\n\nPrograms such as samtools, bcftools, bedtools, tabix and plink2 are modules: load them before use – on the desktop,\non the HPC and in job scripts (put  module load samtools/1.21  before the samtools command).',
    ssh: `ssh – log in to the HPC\n\n  ssh USER@${H.loginHost}     log in (USER: your Research Environment user name)\n  exit                                            log out, back to the desktop\n\nThe first login asks you to accept the HPC's host key, then for your password. To log in without a password, make\na key and copy it to the HPC:  ssh-keygen -t ed25519   then   ssh-copy-id USER@${H.loginHost}\nYour HPC home folder (/home/USER on the HPC) is not your desktop's home: keep your work in /re_gecip/<domain>/USER,\nwhich both see. Graphical programs (RStudio, IGV …) run on the desktop only.`,
    bsub: `bsub – submit a job to LSF (on the HPC)\n\n  bsub -q QUEUE -P PROJECT [-J NAME] [-o OUT] [-e ERR] [-n CORES] [-R "rusage[mem=MB]"] [-M MB] [-W [HH:]MM] COMMAND\n  bsub < script.sh                    a job script, with #BSUB lines for the options\n  bsub -q inter -P PROJECT -Is bash   an interactive job: a shell on a compute node (exit to leave it)\n\n  -q   queue: ${H.queues.map((q) => q.name).join(', ')} (see  bqueues)\n  -P   project code – required:  ${H.projectCodes[0]}\n  -o, -e   files for the job's output and errors; %J becomes the job number\n  -w "done(JOBID)"   start after another job has finished\n\nThe job runs in the folder you submit it from. Follow it with  bjobs ,  bpeek JOBID  and  bhist JOBID ; stop it with  bkill JOBID .`,
    bjobs: 'bjobs – your LSF jobs (on the HPC)\n\n  bjobs            jobs that are pending or running\n  bjobs -a         also those that finished recently\n  bjobs -l JOBID   everything about one job\n  bjobs -d         finished jobs only\n\nSTAT: PEND waiting for a slot, RUN running, DONE finished (exit status 0), EXIT failed or killed.',
    bkill: 'bkill – stop LSF jobs\n\n  bkill JOBID …     stop these jobs\n  bkill 0           stop all your jobs',
    bqueues: 'bqueues – the LSF queues, with their limits and how busy they are\n\n  bqueues\n  bqueues -l QUEUE  details of one queue',
    bhosts: 'bhosts – the compute nodes of the HPC and their slots',
    bhist: 'bhist – how long your jobs waited and ran\n\n  bhist           your recent jobs\n  bhist -a        all your jobs\n  bhist JOBID     one job',
    bpeek: 'bpeek – the output of a running job so far\n\n  bpeek JOBID',
    igv: 'igv – open IGV, the Integrative Genomics Viewer (on the desktop)\n\n  igv                         open IGV\n  igv FILE …                  open IGV with BAM, CRAM, VCF, BED or GFF files (a BAM needs its .bai index)\n  igv -g GENOME FILE …        choose the genome first: hg38, hg19, training_chr21 – or a FASTA or .json file\n  igv -l chr21:4,600-4,760    go to a place (a locus, or a gene name)\n  igv -b script.txt           run an IGV batch script (new, genome, load, goto, snapshot, exit …)\n\nIGV shows the files where they are – nothing is copied. Use File ▸ Load from File… in IGV for more files.',
    quota: 'quota – the space your home folder uses, and the limit',
  };
  RE_MAN.ml = RE_MAN.module;
  for (const n of ['lsid', 'lshosts', 'lsload', 'bacct']) RE_MAN[n] = `${n} – information about the LSF cluster (on the HPC). See also  man bsub ,  man bjobs .`;
  const man1 = B.man;
  B.man = async (ctx) => {
    const name = ctx.args.filter((a) => !a.startsWith('-'))[0];
    if (RE_MAN[name]) { ctx.out(RE_MAN[name] + '\n'); return 0; }
    // (the engine's examples name the workbench's training files, /data/examples, which the RE does not have)
    let examples = false;
    const out0 = ctx.out;
    const r = await man1(Object.assign({}, ctx, { out: (t) => { if (/\/data\/examples/.test(t)) examples = true; return out0(t); } }));
    if (examples) out0('\n(The examples name the training files of the bioinformatics workbench, /data/examples, which are not in the Research Environment: use your own files – the BAM and VCF files that LabKeeper\'s genome_file_paths_and_types table lists, and the references in /pgen_public_data_resources/reference_genomes.)\n');
    return r;
  };

  B.hostname = (ctx) => { ctx.out((ctx.term ? ctx.term.hostname : ctx.shell.env.HOSTNAME || C.desktopHostname) + '\n'); return 0; };
  B.quota = (ctx) => {
    const home = onHpc(ctx) ? hpcHome() : MG.app.HOME;
    const used = Array.from(MG.app.fs.entries).filter(([p]) => p.startsWith(home + '/')).reduce((s, [, e]) => s + MG.app.fs.size(e), 0);
    ctx.out(`Disk quotas for user ${user()}:\n     Filesystem   space   quota   limit   files\n  ${(onHpc(ctx) ? 'hpc:/home' : 'workspace:/home').padEnd(14)} ${MG.humanSize(used).padStart(6)}     10G     10G\n`);
    return 0;
  };
})();
