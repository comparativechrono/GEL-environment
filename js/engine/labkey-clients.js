// =============================================================================
// The data browser's R and Python clients.
//
//   R       library(Rlabkey)  - assets/r/Rlabkey, "installed" into every R
//           session (webR) as it starts, from its source files, with R's own
//           installer functions;
//   Python  import labkey     - assets/py/labkey, written into every Python
//           (Pyodide) as it starts, next to the engine's own modules.
//
// Both read the data release databases that js/services/labkey-server.js
// writes to /resources/labkey (copied into R's and Python's file systems with
// the other synced folders), and translate LabKey SQL with the very code of
// js/services/labkey-sql.js, evaluated in their workers as globalThis.__lk.
// =============================================================================

const R_FILES = ['DESCRIPTION', 'NAMESPACE', 'R/Rlabkey.R'];
const PY_FILES = ['labkey/__init__.py', 'labkey/_simulator.py', 'labkey/api_wrapper.py', 'labkey/exceptions.py',
  'labkey/query.py', 'labkey/server_context.py', 'labkey/utils.py',
  'labkey-2.4.0.dist-info/METADATA', 'labkey-2.4.0.dist-info/INSTALLER'];
// R packages a Research Environment R has: fetched from the webR repository the first time they are loaded
const R_PREINSTALLED = ['dplyr', 'tidyr', 'readr', 'ggplot2', 'tibble', 'stringr', 'purrr', 'data.table', 'jsonlite'];

const abs = (p) => new URL(p, document.baseURI).href;

/** The translator's source as a script for a worker: defines globalThis.__lk. */
async function helperScript(build) {
  const src = await (await fetch(new URL('../services/labkey-sql.js', import.meta.url).href + '?v=' + build)).text();
  const body = src.replace(/^export\s+\{[^}]*\};?[ \t]*$/gm, '').replace(/^export\s+(?=(const|let|function|class|async)\b)/gm, '');
  const sqljs = abs('assets/vendor/sqljs/');
  return `(function () {
${body}
var P = function (s) { return 'v' + (s == null ? '' : String(s)); };
var lk = globalThis.__lk = {
  translate: translateLabkeySql,
  translateR: function (sql) { try { return translateLabkeySql(String(sql)); } catch (e) { return '\\u0001' + labkeyErrorMessage(e && e.message || String(e)); } },
  whereR: function (json) { var w = buildWhere(JSON.parse(json)); return w.sql + '\\u0001' + w.params.map(P).join('\\u0002'); },
  errorMessage: function (m) { return labkeyErrorMessage(String(m)); },
  normaliseOp: normaliseOp,
  dbs: {}
};
// R's queries run here, with sql.js (the website's SQL engine), loaded synchronously: R's worker cannot wait
// for promises (webr::eval_js runs while the worker is busy)
lk.sql = function () {
  if (lk.SQL) return lk.SQL;
  var get = function (u, bin) {
    var x = new XMLHttpRequest();
    x.open('GET', u, false);
    if (bin) x.responseType = 'arraybuffer';
    x.send();
    if (x.status !== 200 && x.status !== 0) throw new Error('HTTP ' + x.status + ' for ' + u);
    return x.response;
  };
  if (typeof globalThis.initSqlJs !== 'function') (0, eval)(get(${JSON.stringify(sqljs + 'sql-wasm.js')}, false));
  var bytes = new Uint8Array(get(${JSON.stringify(sqljs + 'sql-wasm.wasm')}, true));
  var cfg = { wasmBinary: bytes, instantiateWasm: function (imports, receive) { var inst = new WebAssembly.Instance(new WebAssembly.Module(bytes), imports); receive(inst); return inst.exports; } };
  globalThis.initSqlJs(cfg);
  if (!cfg.Database) throw new Error('the SQL engine did not start');
  lk.SQL = cfg;
  return cfg;
};
lk.db = function (path) {
  var FS = globalThis.Module.FS;
  var st = FS.stat(path);
  var key = (st.mtime && st.mtime.getTime ? st.mtime.getTime() : st.mtime) + ':' + st.size;
  var c = lk.dbs[path];
  if (c && c.key === key) return c.db;
  if (c) { try { c.db.close(); } catch (e) {} }
  var db = new (lk.sql().Database)(FS.readFile(path));
  var agg = function (name, fin) {
    if (!db.create_aggregate) return;
    db.create_aggregate(name, { init: function () { return []; }, step: function (a, v) { if (v !== null && v !== undefined && !isNaN(v)) a.push(Number(v)); return a; }, finalize: fin });
  };
  var mean = function (a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; };
  var variance = function (a) { if (a.length < 2) return null; var m = mean(a); return a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1); };
  agg('stdev', function (a) { var v = variance(a); return v === null ? null : Math.sqrt(v); });
  agg('variance', variance);
  agg('median', function (a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); var m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; });
  db.create_function('regexp', function (re, s) { return s !== null && new RegExp(re).test(String(s)) ? 1 : 0; });
  lk.dbs[path] = { key: key, db: db };
  return db;
};
// -> "OK" GS columns RS row RS row ..., fields separated by US, each prefixed s (text), d (number) or n (null);
//    or "ERR" GS message
lk.queryR = function (path, sql, paramsJson) {
  try {
    var db = lk.db(path);
    var res = db.exec(String(sql), paramsJson ? JSON.parse(paramsJson) : []);
    var r = res.length ? res[res.length - 1] : { columns: [], values: [] };
    var f = function (v) { return v === null || v === undefined ? 'n' : typeof v === 'number' ? 'd' + String(v) : v instanceof Uint8Array ? 's[' + v.length + ' bytes]' : 's' + String(v); };
    var out = [r.columns.map(function (c) { return 's' + c; }).join('\\u001f')];
    for (var i = 0; i < r.values.length; i++) out.push(r.values[i].map(f).join('\\u001f'));
    return 'OK\\u001d' + out.join('\\u001e');
  } catch (e) {
    return 'ERR\\u001d' + labkeyErrorMessage(e && e.message || String(e));
  }
};
return 'ok';
})()`;
}

const rstr = (s) => JSON.stringify(String(s)).replace(/\\u([0-9a-f]{4})/gi, (x, h4) => '\\u' + h4);

const R_INSTALL = `local({
  src <- "/tmp/.re-pkgs/Rlabkey"
  lib <- "/usr/local/lib/R/site-library"
  dir.create(lib, recursive = TRUE, showWarnings = FALSE)
  out <- file.path(lib, "Rlabkey")
  unlink(out, recursive = TRUE)
  dir.create(file.path(out, "R"), recursive = TRUE, showWarnings = FALSE)
  dir.create(file.path(out, "Meta"), showWarnings = FALSE)
  suppressWarnings(tools:::.install_package_description(src, out))
  tools:::.install_package_namespace_info(src, out)
  file.copy(file.path(src, "NAMESPACE"), file.path(out, "NAMESPACE"), overwrite = TRUE)
  file.copy(file.path(src, "R", "Rlabkey.R"), file.path(out, "R", "Rlabkey"), overwrite = TRUE)
  if (!(lib %in% .libPaths())) .libPaths(c(.libPaths(), lib))
  invisible(NULL)
})`;

export function installLabkeyClients(RE) {
  const MG = window.MG;
  const build = RE.config.buildId || '1';
  const text = async (url) => { const r = await fetch(url + '?v=' + build); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.text(); };
  const ready = (async () => {
    const [js, rfiles] = await Promise.all([
      helperScript(build),
      Promise.all(R_FILES.map(async (f) => [f, await text(abs('assets/r/Rlabkey/' + f))])),
    ]);
    return { js, rfiles };
  })();
  ready.catch((e) => console.warn('[labkey clients]', e));

  // R packages that the RE's R has (the engine fetches a package of this list when it is first loaded)
  try {
    const have = MG.store.get('rlib', null);
    if (!Array.isArray(have)) MG.store.set('rlib', R_PREINSTALLED.slice().sort());
  } catch (e) { console.warn(e); }

  /** Called by every R session as it starts (rsession.js), before the synced folders are copied into it. */
  MG.app.rStartup = async (webR) => {
    const { js, rfiles } = await ready;
    await RE.services.labkey.writeFiles().catch((e) => console.warn('[labkey] files', e));
    const enc = new TextEncoder();
    for (const d of ['/tmp/.re-pkgs', '/tmp/.re-pkgs/Rlabkey', '/tmp/.re-pkgs/Rlabkey/R']) {
      try { await webR.FS.mkdir(d); } catch { /* there */ }
    }
    for (const [f, t] of rfiles) await webR.FS.writeFile('/tmp/.re-pkgs/Rlabkey/' + f, enc.encode(t));
    await webR.evalRVoid(R_INSTALL);
    await webR.evalRVoid(`invisible(webr::eval_js(${rstr(js)}))`);
  };

  /** Python: the labkey package (written into /lib/smk, on Python's path) and the translator for its worker. */
  MG.app.pyModules = PY_FILES.map((f) => ({ name: 'site-packages/' + f, url: abs('assets/py/' + f) + '?v=' + build }));
  MG.app.beforePython = async () => {
    const { js } = await ready;
    MG.app.pyJsHelpers = js;
    await RE.services.labkey.writeFiles().catch((e) => console.warn('[labkey] files', e));
  };
  return ready;
}
