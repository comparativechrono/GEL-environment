/**
 * Research Environment simulator – receiver for submissions (Google Apps Script).
 *
 * The simulator POSTs every research proposal and every Airlock request here
 * when js/config.js has  submissions: { mode: 'appsScript', appsScriptUrl: '<this web app's URL>' }.
 * Each submission becomes a row of the "Submissions" sheet of the spreadsheet this
 * script is bound to; the files of Airlock requests are saved in a Drive folder.
 *
 * The body is JSON (sent as text/plain, which needs no CORS preflight):
 *   { kind: 'project' | 'airlock',
 *     user:   { username, fullName, domain, userGroup },
 *     record: the proposal or the request (id, ref/transfer, title, status, …),
 *     files:  [{ name, path, size, mime, base64 }],   (Airlock requests)
 *     sentAt: ISO time, site: the simulator's address }
 *
 * This is a starting point: reviewing submissions from the sheet (and sending the
 * decision back to the simulator) is not wired up yet.
 */

// The Drive folder for the files of Airlock requests (its ID is the last part of its address).
// Leave empty to make (and reuse) a folder called "RE simulator – Airlock files".
var FOLDER_ID = '';
var SHEET_NAME = 'Submissions';
var MAX_FILE_BYTES = 10 * 1024 * 1024;

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var body = JSON.parse(e.postData.contents);
    var rec = body.record || {};
    var user = body.user || {};
    var sheet = sheet_();
    var links = [];
    if (body.kind === 'airlock' && body.files && body.files.length) {
      var folder = folder_().createFolder((rec.transfer || 'request') + ' – ' + (user.username || 'unknown'));
      body.files.forEach(function (f) {
        if (!f.base64) return;
        var bytes = Utilities.base64Decode(f.base64);
        if (bytes.length > MAX_FILE_BYTES) return;
        var file = folder.createFile(Utilities.newBlob(bytes, f.mime || 'application/octet-stream', f.name));
        links.push(file.getUrl());
      });
    }
    sheet.appendRow([
      new Date(),
      body.kind,
      user.username || '',
      user.fullName || '',
      user.userGroup || '',
      rec.id || rec.ref || rec.transfer || '',
      rec.title || rec.formLabel || '',
      rec.direction || '',
      rec.rrNumber || '',
      rec.status || '',
      (rec.findings || []).filter(function (x) { return x.level === 'fail'; }).length,
      links.join('\n'),
      JSON.stringify(rec).slice(0, 45000),
      body.site || '',
    ]);
    return json_({ ok: true, row: sheet.getLastRow(), files: links.length });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** A GET (opening the web app's address in a browser) just says that it works. */
function doGet() {
  return json_({ ok: true, service: 'RE simulator submissions', time: new Date().toISOString() });
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['Received', 'Kind', 'Username', 'Name', 'User group', 'ID', 'Title / form', 'Direction', 'Project', 'Status',
      'Pre-check failures', 'Files', 'Record (JSON)', 'Sent from']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function folder_() {
  if (FOLDER_ID) return DriveApp.getFolderById(FOLDER_ID);
  var name = 'RE simulator – Airlock files';
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
