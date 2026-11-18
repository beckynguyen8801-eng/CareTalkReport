/**
 * CareTalk Pulse — YouTube sync for the Care Talk Master Plan sheet.
 *
 * What it does
 *  - Scans the uploads of the two YouTube channels that air UMC Nursing CareTalk.
 *      @MCVTV                     → keeps videos whose TITLE contains "Care Talk"
 *      @benhviendaihocyduochcmc   → keeps videos whose DESCRIPTION contains "UMC Nursing CareTalk"
 *  - Writes views / likes / comments into the YT_AUTO tab (refreshed every hour).
 *  - Keeps the manual columns (episode override, type override, comment seeding) across runs.
 *
 * Setup (once)
 *  1. Open the Master Plan sheet → Extensions → Apps Script, paste this file.
 *  2. Services (+) → add "YouTube Data API v3" (identifier: YouTube).
 *  3. Run setup() once and accept the permissions. It creates the tabs, the REPORT
 *     columns and the hourly trigger, then runs the first sync.
 */

// ───────────────────────── Config (single place to change rules) ─────────────────────────
const CONFIG = {
  START_DATE: new Date('2026-10-01T00:00:00+07:00'), // ignore uploads older than this
  FIRST_AIR_FRIDAY: new Date('2026-10-30T00:00:00+07:00'), // Tập 1 airs this Friday; a new Full every Friday
  SYNC_EVERY_HOURS: 1,
  TABS: { YT: 'YT_AUTO', CONFIG: 'DASHBOARD_CONFIG', REPORT: 'REPORT' },
  REPORT_EXTRA_COLUMNS: ['Comment seeding', 'Save'],
  SOURCES: [
    {
      handle: '@MCVTV',
      channelName: 'MCV TV',
      owner: 'MCV',
      tier: 'Chính',
      matches: v => normalize_(v.title).includes('care talk') || normalize_(v.title).includes('caretalk'),
    },
    {
      handle: '@benhviendaihocyduochcmc',
      channelName: 'Bệnh viện ĐH Y Dược TP.HCM',
      owner: 'UMC',
      tier: 'Chính',
      matches: v => normalize_(v.description).includes('umc nursing caretalk') ||
                    normalize_(v.description).includes('umc nursing care talk'),
    },
  ],
};

const YT_HEADERS = [
  'Video ID', 'Kênh', 'Đơn vị', 'Ngày đăng', 'Tiêu đề', 'Thời lượng (giây)',
  'Loại (tự động)', 'Tập (tự động)', 'Tập (sửa tay)', 'Loại (sửa tay)',
  'Views', 'Likes', 'Comments', 'Comment seeding', 'Link', 'Cập nhật lúc',
];
const MANUAL_COLUMNS = ['Tập (sửa tay)', 'Loại (sửa tay)', 'Comment seeding'];

// ───────────────────────── Menu ─────────────────────────
function onOpen() {
  SpreadsheetApp.getUi().createMenu('CareTalk')
    .addItem('Đồng bộ YouTube ngay', 'syncYouTube')
    .addItem('Cài đặt lần đầu', 'setup')
    .addToUi();
}

// ───────────────────────── Setup ─────────────────────────
function setup() {
  const ss = SpreadsheetApp.getActive();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  ensureYtTab_(ss);
  ensureReportColumns_(ss);
  ensureConfigTab_(ss);
  installTrigger_();
  syncYouTube();
}

function ensureYtTab_(ss) {
  let sh = ss.getSheetByName(CONFIG.TABS.YT);
  if (!sh) sh = ss.insertSheet(CONFIG.TABS.YT);
  sh.getRange(1, 1, 1, YT_HEADERS.length).setValues([YT_HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  const manualStart = YT_HEADERS.indexOf('Tập (sửa tay)') + 1;
  sh.getRange(1, manualStart, 1, 2).setBackground('#FFF4C2');
  sh.getRange(1, YT_HEADERS.indexOf('Comment seeding') + 1).setBackground('#FFF4C2');
  return sh;
}

/** Adds "Comment seeding" and "Save" headers after the last used REPORT column (row 1). */
function ensureReportColumns_(ss) {
  const sh = ss.getSheetByName(CONFIG.TABS.REPORT);
  if (!sh) throw new Error('Không tìm thấy tab REPORT');
  const lastCol = sh.getLastColumn();
  const header = sh.getRange(1, 1, 3, lastCol).getValues();
  const flat = header.map(r => r.map(c => normalize_(c))).flat();
  let col = lastCol + 1;
  CONFIG.REPORT_EXTRA_COLUMNS.forEach(name => {
    if (flat.includes(normalize_(name))) return;
    sh.getRange(1, col).setValue(name).setFontWeight('bold').setBackground('#FFF4C2');
    col++;
  });
}

/** One row per channel: name | platform | owner (MCV/UMC) | tier (Chính/Hỗ trợ). Never overwrites edits. */
function ensureConfigTab_(ss) {
  let sh = ss.getSheetByName(CONFIG.TABS.CONFIG);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.TABS.CONFIG);
    sh.getRange(1, 1, 1, 4).setValues([['Kênh', 'Nền tảng', 'Đơn vị (MCV/UMC)', 'Hạng (Chính/Hỗ trợ)']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  const existing = new Set(sh.getDataRange().getValues().slice(1).map(r => key_(r[0], r[1])));
  const rows = [];
  CONFIG.SOURCES.forEach(s => rows.push([s.channelName, 'YouTube', s.owner, s.tier]));
  const rep = ss.getSheetByName(CONFIG.TABS.REPORT);
  if (rep && rep.getLastRow() >= 4) {
    rep.getRange(4, 4, rep.getLastRow() - 3, 2).getValues().forEach(([platform, channel]) => {
      if (!platform || !channel) return;
      const isUmc = /umc|đại học y dược|dai hoc y duoc|đh y dược|dh y duoc/i.test(String(channel));
      rows.push([String(channel).trim(), String(platform).trim(), isUmc ? 'UMC' : 'MCV', 'Hỗ trợ']);
    });
  }
  const fresh = [];
  rows.forEach(r => { const k = key_(r[0], r[1]); if (!existing.has(k)) { existing.add(k); fresh.push(r); } });
  if (fresh.length) sh.getRange(sh.getLastRow() + 1, 1, fresh.length, 4).setValues(fresh);
}

function installTrigger_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncYouTube')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncYouTube').timeBased().everyHours(CONFIG.SYNC_EVERY_HOURS).create();
}

// ───────────────────────── Sync ─────────────────────────
function syncYouTube() {
  const ss = SpreadsheetApp.getActive();
  const sh = ensureYtTab_(ss);
  const manual = readManualColumns_(sh);
  const now = new Date();

  const videos = [];
  CONFIG.SOURCES.forEach(source => {
    const uploads = getUploadsPlaylistId_(source.handle);
    const matched = listUploadsSince_(uploads, CONFIG.START_DATE).filter(source.matches);
    fetchVideoDetails_(matched.map(v => v.id)).forEach(v => {
      const kept = manual[v.id] || {};
      v.source = source;
      v.kept = kept;
      v.autoType = detectType_(v);
      v.type = kept['Loại (sửa tay)'] || v.autoType;
      videos.push(v);
    });
  });
  assignEpisodes_(videos);

  const rows = videos.map(v => [
    v.id, v.source.channelName, v.source.owner, v.publishedAt, v.title, v.durationSec,
    v.autoType, v.episode || '',
    v.kept['Tập (sửa tay)'] ?? '', v.kept['Loại (sửa tay)'] ?? '',
    v.views, v.likes, v.comments,
    v.kept['Comment seeding'] ?? '',
    'https://www.youtube.com/watch?v=' + v.id, now,
  ]);
  rows.sort((a, b) => b[3] - a[3]);
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, YT_HEADERS.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, YT_HEADERS.length).setValues(rows);
  console.log('Synced %s CareTalk videos', rows.length);
}

function readManualColumns_(sh) {
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return {};
  const head = values[0];
  const idCol = head.indexOf('Video ID');
  const cols = MANUAL_COLUMNS.map(name => [name, head.indexOf(name)]).filter(([, i]) => i >= 0);
  const out = {};
  values.slice(1).forEach(r => {
    if (!r[idCol]) return;
    out[r[idCol]] = {};
    cols.forEach(([name, i]) => { if (r[i] !== '') out[r[idCol]][name] = r[i]; });
  });
  return out;
}

// ───────────────────────── YouTube API (Advanced Service) ─────────────────────────
function getUploadsPlaylistId_(handle) {
  const res = YouTube.Channels.list('contentDetails', { forHandle: handle });
  if (!res.items || !res.items.length) throw new Error('Không tìm thấy kênh ' + handle);
  return res.items[0].contentDetails.relatedPlaylists.uploads;
}

/** Uploads are newest-first: stop paging once we pass START_DATE. */
function listUploadsSince_(playlistId, since) {
  const out = [];
  let pageToken;
  do {
    const res = YouTube.PlaylistItems.list('snippet,contentDetails', { playlistId, maxResults: 50, pageToken });
    let reachedOld = false;
    (res.items || []).forEach(it => {
      const published = new Date(it.contentDetails.videoPublishedAt || it.snippet.publishedAt);
      if (published < since) { reachedOld = true; return; }
      out.push({ id: it.contentDetails.videoId, title: it.snippet.title, description: it.snippet.description });
    });
    pageToken = reachedOld ? null : res.nextPageToken;
  } while (pageToken);
  return out;
}

function fetchVideoDetails_(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const res = YouTube.Videos.list('snippet,statistics,contentDetails', { id: ids.slice(i, i + 50).join(',') });
    (res.items || []).forEach(v => out.push({
      id: v.id,
      title: v.snippet.title,
      description: v.snippet.description,
      publishedAt: new Date(v.snippet.publishedAt),
      durationSec: isoDurationToSec_(v.contentDetails.duration),
      views: +(v.statistics.viewCount || 0),
      likes: +(v.statistics.likeCount || 0),
      comments: +(v.statistics.commentCount || 0),
    }));
  }
  return out;
}

// ───────────────────────── Classification ─────────────────────────
/** Full ≥ 15 phút, ≤ 3 phút = Short Cut, còn lại Best Cut; từ khoá trong title được ưu tiên. */
function detectType_(v) {
  const t = normalize_(v.title);
  if (/\bbts\b|hau truong|hậu trường/.test(t)) return 'BTS';
  if (/best ?cut/.test(t)) return 'Best Cut';
  if (/short ?cut|#shorts/.test(t)) return 'Short Cut';
  if (v.durationSec >= 15 * 60) return 'Full';
  if (v.durationSec <= 180) return 'Short Cut';
  return 'Best Cut';
}

/**
 * Episodes follow the airing order: one Full per Friday.
 *  - Full: the N-th Friday-week that has a Full (across both channels) is Tập N, so a skipped week
 *    (e.g. Tết) does not create a gap.
 *  - Best/Short cut, BTS: the Full whose title shares the most keywords; otherwise the latest Full
 *    aired on or before it.
 *  A manual "Tập (sửa tay)" on a Full also anchors its week to that number.
 */
function assignEpisodes_(videos) {
  const fulls = videos.filter(v => v.type === 'Full');
  const weeks = [...new Set(fulls.map(v => airWeek_(v.publishedAt)))].sort((a, b) => a - b);
  const epByWeek = {};
  weeks.forEach((w, i) => { epByWeek[w] = i + 1; });
  fulls.forEach(v => {
    const manualEp = +v.kept['Tập (sửa tay)'];
    if (manualEp) epByWeek[airWeek_(v.publishedAt)] = manualEp;
  });
  fulls.forEach(v => { v.episode = epByWeek[airWeek_(v.publishedAt)]; v.words = keywords_(v.title); });

  videos.filter(v => v.type !== 'Full').forEach(v => {
    const words = keywords_(v.title);
    let best = null, bestScore = 1; // need at least 2 shared keywords
    fulls.forEach(f => {
      const score = words.filter(w => f.words.includes(w)).length;
      if (score > bestScore) { best = f; bestScore = score; }
    });
    if (!best) {
      const before = fulls.filter(f => airWeek_(f.publishedAt) <= airWeek_(v.publishedAt))
        .sort((a, b) => b.publishedAt - a.publishedAt)[0];
      best = before || null;
    }
    v.episode = best ? best.episode : '';
  });
}

/** Week index counted from the first airing Friday (Friday → next Thursday is one week, Vietnam time). */
function airWeek_(date) {
  return Math.floor((date.getTime() - CONFIG.FIRST_AIR_FRIDAY.getTime()) / (7 * 864e5));
}

const STOP_WORDS_ = new Set(['care', 'talk', 'caretalk', 'nursing', 'cach', 'nhung', 'trong', 'khong', 'nguoi', 'dung', 'nhat', 'shorts', 'tap', 'cua', 'cho', 'voi', 'the', 'nao']);
function keywords_(title) {
  const folded = String(title || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  return [...new Set(folded.split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP_WORDS_.has(w)))];
}

// ───────────────────────── Helpers ─────────────────────────
function isoDurationToSec_(iso) {
  const m = String(iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}
function normalize_(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function key_(name, platform) { return normalize_(name) + '|' + normalize_(platform); }

// ───────────────────────── Public dashboard (Web App) ─────────────────────────
/**
 * Deploy → New deployment → Web app · Execute as: Me · Who has access: Anyone.
 * Viewers need no Google account and no access to the sheet; the app reads the sheet as you.
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Dashboard')
    .setTitle('CareTalk Pulse · UMC Nursing CareTalk')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Read-only snapshot of the tabs the dashboard needs, as merged-filled 2D arrays. */
function getDashboardData() {
  const ss = SpreadsheetApp.openById(getSheetId_());
  const out = { SheetNames: [], Sheets: {} };
  ['REPORT', CONFIG.TABS.YT, CONFIG.TABS.CONFIG, 'KPI'].forEach(name => {
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
  if (v instanceof Date) return (v.getTime() + 7 * 3600e3) / 864e5 + 25569;
  return v;
}

/** setup() stores the sheet id so the web app can open it outside the editor. */
function getSheetId_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SHEET_ID');
  if (!id) { id = SpreadsheetApp.getActive().getId(); props.setProperty('SHEET_ID', id); }
  return id;
}
