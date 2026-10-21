"""The simulated server behind the labkey client stand-in.

Requests are answered from the simulator's copy of the data browser's tables: an
SQLite file per data release in /resources/labkey (the tables the LabKeeper website
shows). Before answering, the checks the real server makes are made - the server
name, the context path, your credentials in ~/.netrc, the folder, schema and query
names - and the real client's exceptions are raised when they fail.

LabKey SQL is translated to SQLite by the simulator's translator (the same one the
website uses), which runs in Python's worker (the js module).
"""
import json
import math
import os
import re

from labkey.exceptions import (QueryNotFoundError, RequestAuthorizationError, RequestError, ServerContextError,
                               ServerNotFoundError)

DIR = "/resources/labkey"
_PLACEHOLDER_LOGINS = {"yourusername", "username", "<username>", "your_username"}
_PLACEHOLDER_PASSWORDS = {"yourPasswordHere", "password", "<password>", "your_password", "yourpassword"}


def _js():
    try:
        from js import __lk  # noqa: the simulator's translator, put in the worker when Python started
        return __lk
    except ImportError:
        raise RequestError(message="The data browser cannot be reached from this Python. Restart the kernel and try again.",
                           status_code=503)


def server():
    path = os.path.join(DIR, "server.tsv")
    if not os.path.exists(path):
        raise RequestError(message="The data browser cannot be reached from this Python. Restart the kernel and try again.",
                           status_code=503)
    srv = {"hosts": [], "context": "labkey", "user": "", "releases": [], "projects": []}
    with open(path) as fh:
        for line in fh:
            f = line.rstrip("\n").split("\t")
            if f[0] == "host" and len(f) > 1:
                srv["hosts"].append(f[1].lower())
            elif f[0] == "context" and len(f) > 1:
                srv["context"] = f[1]
            elif f[0] == "user" and len(f) > 1:
                srv["user"] = f[1]
            elif f[0] == "project" and len(f) > 1:
                srv["projects"].append(f[1])
            elif f[0] == "release" and len(f) > 2:
                srv["releases"].append({"folderPath": f[1], "file": f[2], "project": f[3] if len(f) > 3 else "",
                                        "folder": f[4] if len(f) > 4 else ""})
    return srv


def _netrc_ok(host, user):
    path = os.path.expanduser("~/.netrc")
    if not os.path.exists(path):
        path = os.path.expanduser("~/_netrc")
    if not os.path.exists(path):
        return False
    try:
        with open(path) as fh:
            tok = fh.read().split()
    except OSError:
        return False
    starts = [i for i, t in enumerate(tok) if t in ("machine", "default")]
    for n, k in enumerate(starts):
        if tok[k] == "machine" and (k + 1 >= len(tok) or tok[k + 1].lower() != host):
            continue
        end = starts[n + 1] if n + 1 < len(starts) else len(tok)
        t = tok[k:end]
        login = t[t.index("login") + 1] if "login" in t and t.index("login") + 1 < len(t) else None
        password = t[t.index("password") + 1] if "password" in t and t.index("password") + 1 < len(t) else None
        if not login or not password:
            return False
        if login.lower() in _PLACEHOLDER_LOGINS or password in _PLACEHOLDER_PASSWORDS:
            return False
        if user and login != user:
            return False
        return True
    return False


def _norm(path):
    p = str(path or "").strip().strip("/").lower()
    if p.startswith("home/"):
        p = p[5:]
    return p.replace("_", "-")


def resolve(server_context, container_path=None):
    """Check the server, the credentials and the folder: -> (srv, release)."""
    srv = server()
    domain = str(getattr(server_context, "_domain", "") or "").lower()
    host = domain.split(":")[0].replace("https://", "").replace("http://", "").strip("/")
    if host not in srv["hosts"]:
        raise ServerNotFoundError(message=f"Failed to resolve '{host}' ([Errno -2] Name or service not known)", status_code=None)
    ctx_path = str(getattr(server_context, "_context_path", "") or "").strip("/")
    if ctx_path != srv["context"]:
        raise RequestError(message=f"Not Found (context_path should be '{srv['context']}')", status_code=404)
    user = os.environ.get("USER", "") or srv["user"]
    if not _netrc_ok(host, user):
        raise RequestAuthorizationError(message="User does not have permission to perform this operation.", status_code=401)
    cp = container_path if container_path is not None else getattr(server_context, "_container_path", None)
    if not cp:
        raise ServerContextError(message="A container path (the data release folder) is required.", status_code=None)
    want = _norm(cp)
    for rel in srv["releases"]:
        a = _norm(rel["folderPath"])
        leaf = _norm(rel["folderPath"].rstrip("/").split("/")[-1])
        if want == a or want == leaf or want.endswith("/" + leaf):
            return srv, rel
    if want in [_norm(p) for p in srv["projects"]]:
        raise QueryNotFoundError(message=f"The data are in the release folders of {cp}, for example {cp.rstrip('/')}/<release>.", status_code=404)
    raise QueryNotFoundError(message=f"Folder not found: {cp}", status_code=404)


class _Stats:
    def __init__(self):
        self.v = []

    def step(self, x):
        if x is not None:
            try:
                self.v.append(float(x))
            except (TypeError, ValueError):
                pass


class _Stdev(_Stats):
    def finalize(self):
        if len(self.v) < 2:
            return None
        m = sum(self.v) / len(self.v)
        return math.sqrt(sum((x - m) ** 2 for x in self.v) / (len(self.v) - 1))


class _Variance(_Stats):
    def finalize(self):
        if len(self.v) < 2:
            return None
        m = sum(self.v) / len(self.v)
        return sum((x - m) ** 2 for x in self.v) / (len(self.v) - 1)


class _Median(_Stats):
    def finalize(self):
        if not self.v:
            return None
        s = sorted(self.v)
        k = len(s) // 2
        return s[k] if len(s) % 2 else (s[k - 1] + s[k]) / 2


def connect(rel):
    try:
        import sqlite3
    except ImportError:
        raise RequestError(message="The sqlite3 module is not loaded: run  import labkey  on a line of its own first, then try again.",
                           status_code=503)
    path = os.path.join(DIR, rel["file"])
    if not os.path.exists(path):
        raise RequestError(message="The data browser cannot be reached from this Python. Restart the kernel and try again.",
                           status_code=503)
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    except Exception:
        con = sqlite3.connect(path)
    con.create_function("regexp", 2, lambda pattern, s: 1 if s is not None and re.search(pattern, str(s)) else 0)
    con.create_aggregate("stdev", 1, _Stdev)
    con.create_aggregate("variance", 1, _Variance)
    con.create_aggregate("median", 1, _Median)
    return con


def run(con, sql, params=()):
    try:
        cur = con.execute(sql, list(params))
        cols = [d[0] for d in (cur.description or [])]
        return cols, cur.fetchall()
    except Exception as e:  # sqlite3.Error
        message = str(_js().errorMessage(str(e)))
    raise RequestError(message=message, status_code=400)


def table(con, schema_name, query_name):
    if not schema_name or str(schema_name).lower() != "lists":
        raise QueryNotFoundError(message=f"Schema '{schema_name}' does not exist. The data release tables are in the schema \"lists\".",
                                 status_code=404)
    row = con.execute("SELECT name FROM _lk_tables WHERE lower(name) = lower(?)", [str(query_name)]).fetchone()
    if not row:
        raise QueryNotFoundError(message=f"Query '{query_name}' in schema '{schema_name}' doesn't exist.", status_code=404)
    return row[0]


def columns_of(con, tbl):
    return con.execute("SELECT column_name, caption, type FROM _lk_columns WHERE table_name = ? ORDER BY position", [tbl]).fetchall()


def all_columns(con):
    return {r[0].lower(): r for r in con.execute("SELECT column_name, MIN(caption), MIN(type) FROM _lk_columns GROUP BY column_name")}


def where(filters, names):
    """[QueryFilter] -> (sql, params), with the simulator's translator."""
    if not filters:
        return "", []
    known = {n.lower(): n for n in names}
    items = []
    for f in filters:
        col = getattr(f, "column_name", None)
        if col is None:
            raise RequestError(message=f"Not a QueryFilter: {f!r}", status_code=400)
        name = known.get(str(col).lower())
        if not name:
            raise RequestError(message=f"Column '{col}' not found.", status_code=400)
        value = f.value
        if isinstance(value, (list, tuple, set)):
            value = ";".join(str(v) for v in value)
        items.append({"column": name, "op": f.filter_type or "", "value": "" if value is None else str(value)})
    res = str(_js().whereR(json.dumps(items)))
    parts = res.split("\u0001")
    params = [p[1:] for p in parts[1].split("\u0002")] if len(parts) > 1 and parts[1] else []
    return parts[0], params


def order(sort, names):
    if not sort:
        return ""
    known = {n.lower(): n for n in names}
    out = []
    for s in (sort if isinstance(sort, (list, tuple)) else str(sort).split(",")):
        s = str(s).strip()
        if not s:
            continue
        desc = s.startswith("-")
        n = s.lstrip("+-")
        if n.lower() not in known:
            raise RequestError(message=f"Column '{n}' not found.", status_code=400)
        out.append('"' + known[n.lower()].replace('"', '""') + '"' + (" DESC" if desc else " ASC"))
    return (" ORDER BY " + ", ".join(out)) if out else ""


def limit(max_rows, offset):
    out = ""
    if max_rows is not None and int(max_rows) >= 0:
        out = f" LIMIT {int(max_rows)}"
    if offset:
        out = (out or " LIMIT -1") + f" OFFSET {int(offset)}"
    return out


_TYPES = {"Integer": "int", "Decimal": "float", "Double": "float", "Boolean": "boolean", "Date": "date", "DateTime": "date"}


def convert(value, ltype):
    if value is None:
        return None
    if ltype == "Integer":
        try:
            return int(value)
        except (TypeError, ValueError):
            return value
    if ltype in ("Decimal", "Double"):
        try:
            return float(value)
        except (TypeError, ValueError):
            return value
    if ltype == "Boolean":
        return bool(int(value)) if str(value).lstrip("-").isdigit() else value
    if ltype in ("Date", "DateTime"):
        s = str(value).replace("T", " ")
        d, _, t = s.partition(" ")
        return d.replace("-", "/") + " " + (t[:8] if t else "00:00:00")
    return value


def response(schema_name, query_name, cols, rows, meta):
    """A selectRows / executeSql answer (the response format of the real API)."""
    fields = []
    for c in cols:
        m = meta.get(c.lower())
        lt = m[2] if m else None
        fields.append({"name": c, "fieldKey": c, "caption": m[1] if m else c, "type": _TYPES.get(lt, "string"),
                       "jsonType": _TYPES.get(lt, "string")})
    types = [(meta.get(c.lower()) or (None, None, None))[2] for c in cols]
    out_rows = [{c: convert(v, t) for c, v, t in zip(cols, r, types)} for r in rows]
    return {
        "schemaName": schema_name, "queryName": query_name, "formatVersion": 8.3,
        "metaData": {"root": "rows", "totalProperty": "rowCount", "id": cols[0] if cols else None, "fields": fields},
        "columnModel": [{"dataIndex": f["name"], "header": f["caption"], "hidden": False, "sortable": True} for f in fields],
        "rows": out_rows, "rowCount": len(out_rows),
    }


def select_rows(server_context, schema_name, query_name, view_name=None, filter_array=None, container_path=None,
                columns=None, max_rows=-1, sort=None, offset=None, **kwargs):
    srv, rel = resolve(server_context, container_path)
    con = connect(rel)
    try:
        tbl = table(con, schema_name, query_name)
        if view_name and view_name != "~~DEFAULT~~":
            raise QueryNotFoundError(message=f"Unable to find the view '{view_name}' for query '{tbl}'.", status_code=404)
        meta = columns_of(con, tbl)
        names = [m[0] for m in meta]
        if columns:
            want = [c.strip() for c in (columns if isinstance(columns, (list, tuple)) else str(columns).split(",")) if c.strip()]
            known = {n.lower(): n for n in names}
            sel = []
            for c in want:
                if c.lower() not in known:
                    raise RequestError(message=f"Column '{c}' not found in {tbl}.", status_code=400)
                sel.append(known[c.lower()])
        else:
            sel = names
        w_sql, params = where(filter_array, names)
        sql = ("SELECT " + ", ".join('"' + c.replace('"', '""') + '"' for c in sel) + f' FROM "{tbl}" {w_sql}'
               + order(sort, names) + limit(None if max_rows is None or int(max_rows) < 0 else max_rows, offset))
        cols, rows = run(con, sql, params)
        total = len(rows) if (max_rows is None or int(max_rows) < 0) and not offset else run(con, f'SELECT COUNT(*) FROM "{tbl}" {w_sql}', params)[1][0][0]
        meta_map = {m[0].lower(): m for m in meta}
        res = response(schema_name, tbl, cols, rows, meta_map)
        res["rowCount"] = total
        return res
    finally:
        con.close()


def execute_sql(server_context, schema_name, sql, container_path=None, max_rows=None, sort=None, **kwargs):
    srv, rel = resolve(server_context, container_path)
    if not schema_name or str(schema_name).lower() != "lists":
        raise QueryNotFoundError(message=f"Schema '{schema_name}' does not exist. The data release tables are in the schema \"lists\".",
                                 status_code=404)
    con = connect(rel)
    try:
        tr = str(_js().translateR(str(sql)))
        if tr.startswith("\u0001"):
            raise RequestError(message=tr[1:], status_code=400)
        if sort or (max_rows is not None and int(max_rows) >= 0):
            inner, _ = run(con, f"SELECT * FROM ({tr}) LIMIT 0")
            tr = f"SELECT * FROM ({tr})" + order(sort, inner) + limit(max_rows, None)
        cols, rows = run(con, tr)
        return response(schema_name, "sql", cols, rows, all_columns(con))
    finally:
        con.close()
