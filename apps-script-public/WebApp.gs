/**
 * CareTalk Pulse — public dashboard (standalone Web App).
 *
 * Lives in YOUR OWN Apps Script project (script.google.com → New project), not inside the
 * Master Plan sheet, so deploying does not need Shared Drive manager rights.
 * Your account only needs VIEW access to the sheet. The YouTube sync stays in the sheet's own script.
 *
 * Files in this project: WebApp.gs (this file) + Dashboard.html.
 * Deploy → New deployment → Web app · Execute as: Me · Who has access: Anyone.
 */
const SHEET_ID = '1oPp5MQr5JPnpibvTQESLBqgG-_n30cHykLVB-FkFS3M';
const TABS = ['REPORT', 'YT_AUTO', 'DASHBOARD_CONFIG', 'KPI'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Dashboard')
    .setTitle('CareTalk Pulse · UMC Nursing CareTalk')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Read-only snapshot of the tabs the dashboard needs, as merged-filled 2D arrays. */
function getDashboardData() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const out = { SheetNames: [], Sheets: {} };
  TABS.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const range = sh.getDataRange();
    const values = range.getValues();
    range.getMergedRanges().forEach(m => {
      const r0 = m.getRow() - 1, c0 = m.getColumn() - 1, v = values[r0][c0];
      for (let r = r0; r < r0 + m.getNumRows(); r++)
        for (let c = c0; c < c0 + m.getNumColumns(); c++)
          if (values[r] && values[r][c] === '') values[r][c] = v;
    });
    out.SheetNames.push(name);
    out.Sheets[name] = values.map(row => row.map(toPlain_));
  });
  return out;
}

/** Dates become spreadsheet serial numbers in Vietnam time (google.script.run cannot return Date objects). */
function toPlain_(v) {
  return v instanceof Date ? (v.getTime() + 7 * 3600e3) / 864e5 + 25569 : v;
}

/** Run once from the editor to grant access and check the sheet can be read. */
function testRead() {
  const d = getDashboardData();
  console.log('Đọc được các tab: %s', d.SheetNames.join(', '));
}
