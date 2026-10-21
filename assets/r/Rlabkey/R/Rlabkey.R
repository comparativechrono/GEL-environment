# =============================================================================
# Rlabkey stand-in for the Research Environment training simulator.
#
# The functions that analyses in the RE use (labkey.selectRows, labkey.executeSql,
# makeFilter, labkey.setDefaults, labkey.getQueries ...) answer from the
# simulator's copy of the data browser's tables: an SQLite file per data release
# in /resources/labkey, the same tables the LabKeeper website shows. Before
# answering, they check what the real server checks - the address in baseUrl,
# your credentials in ~/.netrc, the folder, schema and query names - and fail
# with the errors the real client gives.
#
# LabKey SQL is translated to SQLite by the simulator's translator (the same one
# the website uses), which runs in R's worker (webr::eval_js).
# =============================================================================

.lk <- new.env(parent = emptyenv())
.lk$dir <- "/resources/labkey"
.lk$baseUrl <- NULL
.lk$waf <- TRUE

.lk_q <- function(x) paste0("\"", gsub("\"", "\"\"", x, fixed = TRUE), "\"")

.lk_jstr <- function(s) {
  s <- enc2utf8(as.character(s))
  s[is.na(s)] <- ""
  s <- gsub("\\", "\\\\", s, fixed = TRUE)
  s <- gsub("\"", "\\\"", s, fixed = TRUE)
  s <- gsub("\n", "\\n", s, fixed = TRUE)
  s <- gsub("\r", "\\r", s, fixed = TRUE)
  s <- gsub("\t", "\\t", s, fixed = TRUE)
  paste0("\"", s, "\"")
}

.lk_js <- function(code) {
  ok <- tryCatch(identical(webr::eval_js("typeof globalThis.__lk"), "object"), error = function(e) FALSE)
  if (!ok) stop("Rlabkey cannot reach the data browser from this R session. Restart R (Session > Restart R) and try again.", call. = FALSE)
  webr::eval_js(code)
}

.lk_http_error <- function(status, message) {
  stop(simpleError(paste0("HTTP request was unsuccessful. Status code = ", status, ", Error message = ", message),
                   call = quote(handleError(response, haltOnError))))
}

# what the real client says when the server answers with its sign-in page (no or wrong ~/.netrc)
.lk_doctype <- function() {
  stop(simpleError(paste0("lexical error: invalid char in json text.\n",
                          "                                       <!DOCTYPE html> <html lang=\"en\"> <he\n",
                          "                     (right here) ------^\n"),
                   call = quote(fromJSON(response, simplifyVector = FALSE, simplifyDataFrame = FALSE))))
}

.lk_unreachable <- function(host) {
  stop(simpleError(paste0("Could not resolve host: ", host), call = quote(curl::curl_fetch_memory(url, handle = handle))))
}

.lk_server <- function() {
  f <- file.path(.lk$dir, "server.tsv")
  if (!file.exists(f)) stop("Rlabkey cannot reach the data browser from this R session. Restart R (Session > Restart R) and try again.", call. = FALSE)
  x <- strsplit(readLines(f, warn = FALSE), "\t", fixed = TRUE)
  kind <- vapply(x, function(v) v[1], "")
  part <- function(k, i) vapply(x[kind == k], function(v) if (length(v) >= i) v[i] else "", "")
  list(hosts = tolower(part("host", 2)), context = part("context", 2)[1], user = part("user", 2)[1],
       releases = data.frame(folderPath = part("release", 2), file = part("release", 3), project = part("release", 4),
                             label = part("release", 5), stringsAsFactors = FALSE),
       projects = part("project", 2))
}

.lk_base <- function(baseUrl, srv) {
  b <- if (!is.null(baseUrl) && length(baseUrl) && nzchar(baseUrl)) baseUrl else .lk$baseUrl
  if (is.null(b) || !nzchar(b))
    stop("baseUrl is a required parameter: give baseUrl, or set it first with labkey.setDefaults(baseUrl = \"https://...\")", call. = FALSE)
  m <- regmatches(b, regexec("^(https?)://([^/:?#]+)(:[0-9]+)?(/[^?#]*)?", b))[[1]]
  if (!length(m)) .lk_unreachable(b)
  host <- tolower(m[3])
  path <- sub("/+$", "", m[5])
  if (!(host %in% srv$hosts)) .lk_unreachable(host)
  if (!identical(path, paste0("/", srv$context))) .lk_http_error(404, paste0("Not Found (the address should end in /", srv$context, "/)"))
  list(host = host, url = b)
}

.lk_netrc_ok <- function(host, user) {
  f <- path.expand("~/.netrc")
  if (!file.exists(f)) f <- path.expand("~/_netrc")
  if (!file.exists(f)) return(FALSE)
  tok <- tryCatch(scan(f, what = "", quiet = TRUE), error = function(e) character(0))
  if (!length(tok)) return(FALSE)
  starts <- which(tok %in% c("machine", "default"))
  for (k in starts) {
    if (tok[k] == "machine" && (k + 1 > length(tok) || tolower(tok[k + 1]) != host)) next
    end <- if (any(starts > k)) min(starts[starts > k]) - 1 else length(tok)
    t <- tok[k:end]
    login <- t[match("login", t) + 1]
    pass <- t[match("password", t) + 1]
    if (is.na(login) || is.na(pass) || !nzchar(pass)) return(FALSE)
    if (tolower(login) %in% c("yourusername", "username", "<username>", "your_username")) return(FALSE)
    if (pass %in% c("yourPasswordHere", "password", "<password>", "your_password", "yourpassword")) return(FALSE)
    if (nzchar(user) && !identical(login, user)) return(FALSE)
    return(TRUE)
  }
  FALSE
}

.lk_folder <- function(folderPath, srv) {
  if (missing(folderPath) || is.null(folderPath) || !nzchar(folderPath)) stop("folderPath is a required parameter", call. = FALSE)
  norm <- function(x) gsub("_", "-", tolower(sub("^home/", "", gsub("^/+|/+$", "", x))))
  want <- norm(folderPath)
  rel <- srv$releases
  for (i in seq_len(nrow(rel))) {
    a <- norm(rel$folderPath[i])
    leaf <- norm(basename(rel$folderPath[i]))
    if (want == a || want == leaf || endsWith(want, paste0("/", leaf))) return(rel[i, , drop = FALSE])
  }
  if (want %in% norm(srv$projects)) .lk_http_error(404, paste0("Query or table not found in folder ", folderPath, ": the data are in its release folders (labkey.getFolders lists them)"))
  .lk_http_error(404, paste0("Folder not found: ", folderPath))
}

.lk_ctx <- function(baseUrl, folderPath) {
  srv <- .lk_server()
  b <- .lk_base(baseUrl, srv)
  user <- Sys.getenv("USER", srv$user)
  if (!.lk_netrc_ok(b$host, user)) .lk_doctype()
  list(srv = srv, host = b$host, url = b$url, rel = if (missing(folderPath)) NULL else .lk_folder(folderPath, srv))
}

# The tables are queried with sql.js (SQLite compiled to WebAssembly), the engine the website uses, running in
# R's worker: no R package needs to be installed.
.lk_con <- function(rel) {
  db <- file.path(.lk$dir, rel$file)
  if (!file.exists(db)) stop("Rlabkey cannot reach the data browser from this R session. Restart R (Session > Restart R) and try again.", call. = FALSE)
  db
}

# results come back as one string: "OK" GS columns RS row RS row ..., fields separated by US and each field
# prefixed with its kind: s (text), d (number) or n (null)
.lk_query <- function(db, sql, params = list()) {
  pj <- if (length(params)) paste0("[", paste(vapply(params, function(p) .lk_jstr(p), ""), collapse = ","), "]") else ""
  res <- .lk_js(paste0("__lk.queryR(", .lk_jstr(db), ",", .lk_jstr(sql), ",", .lk_jstr(pj), ")"))
  if (startsWith(res, "ERR")) .lk_http_error(400, substring(res, 5))
  parts <- strsplit(substring(res, 4), "\036", fixed = FALSE)[[1]]
  cols <- substring(strsplit(parts[1], "\037")[[1]], 2)
  rows <- parts[-1]
  n <- length(rows)
  fields <- if (n) strsplit(rows, "\037") else list()
  out <- vector("list", length(cols))
  for (j in seq_along(cols)) {
    f <- if (n) vapply(fields, function(r) if (length(r) >= j) r[j] else "n", "") else character(0)
    kind <- substr(f, 1, 1)
    v <- substring(f, 2)
    v[kind == "n"] <- NA
    if (n && all(kind[kind != "n"] == "d") && any(kind == "d")) {
      num <- as.numeric(v)
      whole <- !is.na(num) & num == round(num) & abs(num) < 2147483647
      out[[j]] <- if (all(whole | is.na(num)) && !any(grepl("[.eE]", v[!is.na(v)]))) as.integer(num) else num
    } else out[[j]] <- v
  }
  names(out) <- cols
  as.data.frame(out, stringsAsFactors = FALSE, check.names = FALSE, optional = TRUE)
}

.lk_schema <- function(schemaName) {
  if (missing(schemaName) || is.null(schemaName) || !nzchar(schemaName)) stop("schemaName is a required parameter", call. = FALSE)
  if (tolower(schemaName) != "lists") .lk_http_error(404, paste0("Schema '", schemaName, "' does not exist. The data release tables are in the schema \"lists\"."))
}

.lk_table <- function(con, schemaName, queryName) {
  .lk_schema(schemaName)
  if (missing(queryName) || is.null(queryName) || !nzchar(queryName)) stop("queryName is a required parameter", call. = FALSE)
  t <- .lk_query(con, "SELECT name FROM _lk_tables WHERE lower(name) = lower(?)", list(queryName))
  if (!nrow(t)) .lk_http_error(404, paste0("Query '", queryName, "' in schema '", schemaName, "' doesn't exist."))
  t$name[1]
}

.lk_colnames <- function(fields, captions, colNameOpt) {
  opt <- match.arg(colNameOpt, c("caption", "fieldname", "rname"))
  switch(opt,
         caption = ifelse(is.na(captions) | !nzchar(captions), fields, captions),
         fieldname = fields,
         rname = tolower(gsub("[^A-Za-z0-9]+", "_", fields)))
}

.lk_convert <- function(df, types) {
  for (i in seq_along(df)) {
    ty <- types[i]
    if (is.na(ty)) next
    v <- df[[i]]
    df[[i]] <- switch(ty,
      Integer = suppressWarnings(as.integer(v)),
      Decimal = , Double = suppressWarnings(as.numeric(v)),
      Boolean = as.logical(suppressWarnings(as.integer(v))),
      Date = suppressWarnings(as.Date(substr(as.character(v), 1, 10))),
      DateTime = suppressWarnings(as.POSIXct(sub("T", " ", as.character(v)), tz = "UTC", format = "%Y-%m-%d %H:%M:%OS")),
      { if (is.character(v)) v else as.character(v) })
  }
  df
}

.lk_split_list <- function(x) {
  s <- trimws(unlist(strsplit(paste(as.character(x), collapse = ","), ",", fixed = TRUE)))
  s[nzchar(s)]
}

.lk_order <- function(colSort, cols) {
  if (is.null(colSort) || !length(colSort) || !nzchar(paste(colSort, collapse = ""))) return("")
  s <- .lk_split_list(colSort)
  parts <- vapply(s, function(x) {
    desc <- startsWith(x, "-")
    n <- sub("^[-+]", "", x)
    k <- match(tolower(n), tolower(cols))
    if (is.na(k)) .lk_http_error(400, paste0("Column '", n, "' not found."))
    paste0(.lk_q(cols[k]), if (desc) " DESC" else " ASC")
  }, "")
  paste0(" ORDER BY ", paste(parts, collapse = ", "))
}

.lk_limit <- function(maxRows, rowOffset) {
  out <- ""
  if (!is.null(maxRows) && length(maxRows) && !is.na(maxRows) && as.numeric(maxRows) >= 0) out <- paste0(" LIMIT ", as.integer(maxRows))
  if (!is.null(rowOffset) && length(rowOffset) && !is.na(rowOffset) && as.numeric(rowOffset) > 0)
    out <- paste0(if (nzchar(out)) out else " LIMIT -1", " OFFSET ", as.integer(rowOffset))
  out
}

# colFilter: makeFilter()'s strings "column~operator=value"
.lk_where <- function(colFilter, cols) {
  if (is.null(colFilter) || !length(colFilter)) return(list(sql = "", params = list()))
  items <- lapply(as.character(colFilter), function(s0) {
    s <- utils::URLdecode(s0)
    tl <- regexpr("~", s, fixed = TRUE)
    if (tl < 1) stop("Invalid filter: ", s0, ". Make filters with makeFilter(c(\"column\", \"OPERATOR\", \"value\")).", call. = FALSE)
    rest <- substr(s, tl + 1, nchar(s))
    eq <- regexpr("=", rest, fixed = TRUE)
    col <- substr(s, 1, tl - 1)
    op <- if (eq < 1) rest else substr(rest, 1, eq - 1)
    val <- if (eq < 1) "" else substr(rest, eq + 1, nchar(rest))
    k <- match(tolower(col), tolower(cols))
    if (is.na(k)) .lk_http_error(400, paste0("Column '", col, "' not found."))
    paste0("{\"column\":", .lk_jstr(cols[k]), ",\"op\":", .lk_jstr(op), ",\"value\":", .lk_jstr(val), "}")
  })
  json <- paste0("[", paste(unlist(items), collapse = ","), "]")
  res <- .lk_js(paste0("__lk.whereR(", .lk_jstr(json), ")"))
  parts <- strsplit(res, "\001", fixed = TRUE)[[1]]
  params <- if (length(parts) > 1 && nzchar(parts[2])) as.list(substring(strsplit(parts[2], "\002", fixed = TRUE)[[1]], 2)) else list()
  list(sql = parts[1], params = params)
}

# =========================================================================== API

labkey.setDefaults <- function(apiKey = "", baseUrl = "", email = "", password = "") {
  if (!is.null(baseUrl) && nzchar(baseUrl)) .lk$baseUrl <- baseUrl
  invisible(NULL)
}

labkey.getBaseUrl <- function(baseUrl = NULL) {
  if (!is.null(baseUrl) && nzchar(baseUrl)) return(baseUrl)
  .lk$baseUrl
}

labkey.setWafEncoding <- function(wafEncode = TRUE) {
  .lk$waf <- isTRUE(wafEncode)
  invisible(NULL)
}

labkey.setDebugMode <- function(debug = FALSE) invisible(NULL)

labkey.acceptSelfSignedCerts <- function() invisible(NULL)

.lk_ops <- c(EQUAL = "eq", EQUALS = "eq", NOT_EQUAL = "neqornull", NOT_EQUAL_OR_MISSING = "neqornull", NOT_EQUALS = "neqornull",
             GREATER_THAN = "gt", GREATER_THAN_OR_EQUAL = "gte", GREATER_THAN_OR_EQUAL_TO = "gte",
             LESS_THAN = "lt", LESS_THAN_OR_EQUAL = "lte", LESS_THAN_OR_EQUAL_TO = "lte",
             CONTAINS = "contains", DOES_NOT_CONTAIN = "doesnotcontain", STARTS_WITH = "startswith",
             DOES_NOT_START_WITH = "doesnotstartwith", IN = "in", EQUALS_ONE_OF = "in", NOT_IN = "notin",
             EQUALS_NONE_OF = "notin", CONTAINS_ONE_OF = "containsoneof", CONTAINS_NONE_OF = "containsnoneof",
             MISSING = "isblank", IS_MISSING = "isblank", NOT_MISSING = "isnonblank", IS_NOT_MISSING = "isnonblank",
             BETWEEN = "between", NOT_BETWEEN = "notbetween", DATE_EQUAL = "dateeq", DATE_GREATER_THAN = "dategt",
             DATE_LESS_THAN = "datelt", HAS_ANY_VALUE = "")

makeFilter <- function(...) {
  args <- list(...)
  if (!length(args)) return(NULL)
  f <- vapply(args, function(a) {
    a <- as.character(a)
    if (length(a) < 2) stop("each filter is c(column, operator, value)", call. = FALSE)
    op <- toupper(a[2])
    tok <- if (op %in% names(.lk_ops)) .lk_ops[[op]] else if (tolower(a[2]) %in% .lk_ops) tolower(a[2]) else stop("Invalid operator: ", a[2], call. = FALSE)
    val <- if (length(a) > 2) a[3] else ""
    if (!nzchar(tok)) return(NA_character_)
    paste0(utils::URLencode(a[1], reserved = TRUE), "~", tok, "=", utils::URLencode(val, reserved = TRUE))
  }, "")
  f <- f[!is.na(f)]
  matrix(f, ncol = 1)
}

labkey.selectRows <- function(baseUrl = NULL, folderPath, schemaName, queryName, viewName = NULL, colSelect = NULL,
                              maxRows = NULL, rowOffset = NULL, colSort = NULL, colFilter = NULL, showHidden = FALSE,
                              colNameOpt = "caption", containerFilter = NULL, parameters = NULL,
                              includeDisplayValues = FALSE, method = "POST") {
  ctx <- .lk_ctx(baseUrl, folderPath)
  con <- .lk_con(ctx$rel)
  tbl <- .lk_table(con, schemaName, queryName)
  if (!is.null(viewName) && length(viewName) && nzchar(viewName) && viewName != "~~DEFAULT~~")
    .lk_http_error(404, paste0("Unable to find the view '", viewName, "' for query '", tbl, "'."))
  meta <- .lk_query(con, "SELECT column_name, caption, type FROM _lk_columns WHERE table_name = ? ORDER BY position", list(tbl))
  cols <- meta$column_name
  sel <- meta
  if (!is.null(colSelect) && length(colSelect) && nzchar(paste(colSelect, collapse = ""))) {
    want <- .lk_split_list(colSelect)
    idx <- match(tolower(want), tolower(cols))
    if (anyNA(idx)) .lk_http_error(400, paste0("Column '", want[which(is.na(idx))[1]], "' not found in ", tbl, "."))
    sel <- meta[idx, , drop = FALSE]
  }
  w <- .lk_where(colFilter, cols)
  sql <- paste0("SELECT ", paste(.lk_q(sel$column_name), collapse = ", "), " FROM ", .lk_q(tbl), " ", w$sql,
                .lk_order(colSort, cols), .lk_limit(maxRows, rowOffset))
  df <- .lk_query(con, sql, w$params)
  df <- .lk_convert(df, sel$type)
  names(df) <- .lk_colnames(sel$column_name, sel$caption, colNameOpt)
  df
}

labkey.executeSql <- function(baseUrl = NULL, folderPath, schemaName, sql, maxRows = NULL, rowOffset = NULL, colSort = NULL,
                              showHidden = FALSE, colNameOpt = "caption", containerFilter = NULL, parameters = NULL) {
  ctx <- .lk_ctx(baseUrl, folderPath)
  .lk_schema(schemaName)
  if (missing(sql) || is.null(sql) || !nzchar(paste(sql, collapse = ""))) stop("sql is a required parameter", call. = FALSE)
  con <- .lk_con(ctx$rel)
  tr <- .lk_js(paste0("__lk.translateR(", .lk_jstr(paste(sql, collapse = "\n")), ")"))
  if (startsWith(tr, "\001")) .lk_http_error(400, substring(tr, 2))
  if (!is.null(colSort) || !is.null(maxRows) || !is.null(rowOffset)) {
    inner <- .lk_query(con, paste0("SELECT * FROM (", tr, ") LIMIT 0"))
    tr <- paste0("SELECT * FROM (", tr, ")", .lk_order(colSort, names(inner)), .lk_limit(maxRows, rowOffset))
  }
  df <- .lk_query(con, tr)
  meta <- .lk_query(con, "SELECT column_name, MIN(caption) AS caption, MIN(type) AS type FROM _lk_columns GROUP BY column_name")
  k <- match(tolower(names(df)), tolower(meta$column_name))
  df <- .lk_convert(df, meta$type[k])
  fields <- names(df)
  names(df) <- .lk_colnames(fields, ifelse(is.na(k), fields, meta$caption[k]), colNameOpt)
  df
}

labkey.getSchemas <- function(baseUrl = NULL, folderPath) {
  ctx <- .lk_ctx(baseUrl, folderPath)
  data.frame(schemaName = "lists", stringsAsFactors = FALSE)
}

labkey.getQueries <- function(baseUrl = NULL, folderPath, schemaName) {
  ctx <- .lk_ctx(baseUrl, folderPath)
  .lk_schema(schemaName)
  con <- .lk_con(ctx$rel)
  m <- .lk_query(con, "SELECT table_name AS queryName, column_name AS fieldName, caption FROM _lk_columns ORDER BY table_name, position")
  m
}

labkey.getQueryDetails <- function(baseUrl = NULL, folderPath, schemaName, queryName) {
  ctx <- .lk_ctx(baseUrl, folderPath)
  con <- .lk_con(ctx$rel)
  tbl <- .lk_table(con, schemaName, queryName)
  m <- .lk_query(con, "SELECT column_name, caption, type FROM _lk_columns WHERE table_name = ? ORDER BY position", list(tbl))
  data.frame(queryName = tbl, fieldName = m$column_name, caption = m$caption, fieldKey = m$column_name,
             type = tolower(m$type), isNullable = TRUE, isKeyField = FALSE, isAutoIncrement = FALSE,
             isVersionField = FALSE, isHidden = FALSE, isSelectable = TRUE, isUserEditable = FALSE,
             isReadOnly = TRUE, isMvEnabled = FALSE, lookupKeyField = NA, lookupSchemaName = NA,
             lookupDisplayField = NA, lookupQueryName = NA, lookupIsPublic = NA, stringsAsFactors = FALSE)
}

labkey.getDefaultViewDetails <- function(baseUrl = NULL, folderPath, schemaName, queryName)
  labkey.getQueryDetails(baseUrl, folderPath, schemaName, queryName)

labkey.getLookupDetails <- function(baseUrl = NULL, folderPath, schemaName, queryName, lookupKey) {
  ctx <- .lk_ctx(baseUrl, folderPath)
  .lk_http_error(400, paste0("Column '", lookupKey, "' is not a lookup."))
}

labkey.getFolders <- function(baseUrl = NULL, folderPath, includeEffectivePermissions = TRUE, includeSubfolders = FALSE,
                              depth = 50, includeChildWorkbooks = TRUE, includeStandardProperties = TRUE) {
  ctx <- .lk_ctx(baseUrl)
  srv <- ctx$srv
  norm <- function(x) gsub("^/+|/+$", "", sub("^/?home/", "/", x))
  want <- if (missing(folderPath) || is.null(folderPath)) "" else norm(folderPath)
  rel <- srv$releases
  if (!nzchar(want)) {
    out <- data.frame(name = srv$projects, folderPath = paste0("/", srv$projects), stringsAsFactors = FALSE)
  } else if (want %in% srv$projects) {
    kids <- rel[rel$project == want, , drop = FALSE]
    out <- data.frame(name = c(want, basename(kids$folderPath)), folderPath = c(paste0("/", want), kids$folderPath), stringsAsFactors = FALSE)
    if (!isTRUE(includeSubfolders)) out <- out[1, , drop = FALSE]
  } else {
    r <- .lk_folder(folderPath, srv)
    out <- data.frame(name = basename(r$folderPath), folderPath = r$folderPath, stringsAsFactors = FALSE)
  }
  if (isTRUE(includeEffectivePermissions)) out$effectivePermissions <- "org.labkey.api.security.permissions.ReadPermission"
  out
}

.lk_readonly <- function(baseUrl, folderPath) {
  ctx <- .lk_ctx(baseUrl, folderPath)
  .lk_http_error(403, "User does not have permission to perform this operation.")
}
labkey.insertRows <- function(baseUrl = NULL, folderPath, schemaName, queryName, toInsert, na = NULL, options = NULL) .lk_readonly(baseUrl, folderPath)
labkey.updateRows <- function(baseUrl = NULL, folderPath, schemaName, queryName, toUpdate, provenanceParams = NULL, options = NULL) .lk_readonly(baseUrl, folderPath)
labkey.deleteRows <- function(baseUrl = NULL, folderPath, schemaName, queryName, toDelete, provenanceParams = NULL, options = NULL) .lk_readonly(baseUrl, folderPath)
labkey.importRows <- function(baseUrl = NULL, folderPath, schemaName, queryName, toImport, na = NULL) .lk_readonly(baseUrl, folderPath)
labkey.truncateTable <- function(baseUrl = NULL, folderPath, schemaName, queryName) .lk_readonly(baseUrl, folderPath)

labkey.whoAmI <- function(baseUrl = NULL) {
  ctx <- .lk_ctx(baseUrl)
  u <- Sys.getenv("USER", ctx$srv$user)
  list(id = 1000L + sum(utf8ToInt(u)), displayName = u, email = paste0(u, "@re.local"), impersonated = FALSE)
}
