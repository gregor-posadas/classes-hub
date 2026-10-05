/**
 * Classes Hub: backend.
 *
 * Paste this file into the Apps Script editor of the "Classes Hub data" Google Sheet
 * (Extensions > Apps Script), add your bCourses token as the script property CANVAS_TOKEN,
 * run setup() once, then deploy as a web app. Full steps are in README.md.
 *
 * What it does:
 *  - Every 2 hours, reads your Fall 2026 courses, assignments (with your submission status)
 *    and announcements from bCourses, and keeps them in the Sheet.
 *  - Keeps your own progress (To do, In progress, Done) and your own to-dos next to them.
 *  - Puts every due date on a "Fall 2026 classes" Google Calendar, without inviting anyone.
 *  - Emails you at 8 AM, only on days with something to say.
 *
 * The bCourses token lives only in Script properties. It is never sent to the website.
 * The hub only reads from bCourses; it never submits, posts or changes anything there.
 */

var TZ = 'America/Los_Angeles';
var APP_NAME = 'Classes Hub';
var TABS = {
  Courses: ['id', 'canvasId', 'code', 'name', 'shortName', 'color', 'textColor', 'url', 'hidden', 'hubUrl', 'hubLabel', 'score', 'grade', 'term', 'syncedAt', 'syncError'],
  Items: ['id', 'canvasId', 'courseId', 'kind', 'title', 'due', 'unlockAt', 'points', 'url', 'description', 'submissionTypes',
    'submitted', 'submittedAt', 'late', 'missing', 'score', 'grade', 'myStatus', 'updatedAt', 'calendarEventId', 'calendarSig',
    'firstSeenAt', 'canvasUpdatedAt', 'removed', 'link'],
  Announcements: ['id', 'courseId', 'title', 'postedAt', 'author', 'url', 'message'],
  Log: ['timestamp', 'action', 'detail']
};

/* Settings. Each can be overridden in Project Settings > Script properties without editing code. */
var DEFAULTS = {
  CANVAS_URL: 'https://bcourses.berkeley.edu',
  TERM: 'Fall 2026',               // courses whose bCourses term name contains this
  SEMESTER_START: '2026-08-26',    // used only if no course has a term with that name
  SEMESTER_END: '2026-12-18',
  CALENDAR_NAME: 'Fall 2026 classes',
  CALENDAR_SYNC: 'on',             // 'off' keeps due dates off Google Calendar
  EMAIL_PREF: 'daily',             // 'daily', 'weekly' (Mondays) or 'off'
  ANNOUNCEMENT_DAYS: '30',
  // Courses that have their own team hub get a button to it. Matched against the course code.
  LINKED_HUBS: JSON.stringify([
    { match: 'DEV\\s*ENG\\s*C?200', url: 'https://gregor-posadas.github.io/microbe-busters-hub/', label: 'Open the Microbe Busters Hub' },
    { match: 'DEV\\s*ENG\\s*C?203', url: 'https://gregor-posadas.github.io/lagmay-visit-hub/', label: 'Open the Lagmay Visit Hub' }
  ])
};
function setting(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return v !== null && v !== '' ? v : (DEFAULTS[key] || '');
}

/* Course colors, in this order: blue, orange, light blue, gold, maroon. Each course also
   shows its number as text, so color is never the only way to tell courses apart. */
var PALETTE = [['#385F96', '#FFFFFF'], ['#CF5921', '#000000'], ['#9EB8DB', '#000000'], ['#E7B800', '#000000'], ['#800000', '#FFFFFF']];
var STATUSES = ['todo', 'doing', 'done'];
var EMAIL_PREFS = ['daily', 'weekly', 'off'];

/* ------------------------------------------------------------------ setup */

/** Run once from the editor. Creates tabs, the calendar, the triggers and your access code, then reads bCourses. */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', ss.getId());

  Object.keys(TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var head = TABS[name];
    if (sh.getMaxColumns() < head.length) sh.insertColumnsAfter(sh.getMaxColumns(), head.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.getRange(1, 1, sh.getMaxRows(), head.length).setNumberFormat('@');
    sh.setFrozenRows(1);
  });
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);

  if (setting('CALENDAR_SYNC') !== 'off' && !props.getProperty('CALENDAR_ID')) {
    var cal = CalendarApp.createCalendar(setting('CALENDAR_NAME'), { timeZone: TZ, color: CalendarApp.Color.BLUE });
    props.setProperty('CALENDAR_ID', cal.getId());
  }
  if (!props.getProperty('ACCESS_CODE')) props.setProperty('ACCESS_CODE', randomCode() + '-' + randomCode());
  if (!props.getProperty('OWNER_EMAIL')) props.setProperty('OWNER_EMAIL', Session.getActiveUser().getEmail());

  var handlers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (handlers.indexOf('syncCanvas') < 0) ScriptApp.newTrigger('syncCanvas').timeBased().everyHours(2).create();
  if (handlers.indexOf('sendDailyDigest') < 0) ScriptApp.newTrigger('sendDailyDigest').timeBased().everyDays(1).atHour(8).inTimezone(TZ).create();

  Logger.log('Setup done.');
  Logger.log('Your access code (enter it once on each device): ' + props.getProperty('ACCESS_CODE'));
  if (!props.getProperty('CANVAS_TOKEN')) {
    Logger.log('No bCourses token yet. Add CANVAS_TOKEN in Project Settings > Script properties, then run syncCanvas.');
    return;
  }
  var r = syncCanvas();
  Logger.log('Read bCourses: ' + r.courses + ' courses, ' + r.items + ' assignments, ' + r.announcements + ' announcements.' + (r.error ? ' Problem: ' + r.error : ''));
  Logger.log('Next: set APP_URL in Script properties to your GitHub Pages address, then deploy as a web app.');
}

function randomCode() {
  var words = ['campanile', 'strawberry', 'creek', 'sather', 'doe', 'moffitt', 'oak', 'bay', 'tilden', 'evans', 'davis', 'wurster'];
  return words[Math.floor(Math.random() * words.length)] + '-' + Math.floor(1000 + Math.random() * 9000);
}

/* ------------------------------------------------------------------ web app */

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.action === 'data') {
      checkCode(p.code);
      return json({ ok: true, data: payload() });
    }
    return json({ ok: true, service: APP_NAME });
  } catch (err) {
    return json({ ok: false, error: err.message, code: err.codeType || '' });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var b = JSON.parse(e.postData.contents || '{}');
    checkCode(b.code);
    lock.waitLock(30000);
    switch (b.action) {
      case 'setStatus': return json(setStatus(b.id, b.status));
      case 'saveTodo': return json(saveTodo(b.item || {}));
      case 'deleteTodo': return json(deleteTodo(b.id));
      case 'saveCourse': return json(saveCourse(b.course || {}));
      case 'setEmailPref': return json(setEmailPref(b.pref));
      case 'syncNow':
        lock.releaseLock();   // syncCanvas takes the lock itself
        var r = syncCanvas();
        return json({ ok: !r.error || r.items > 0, error: r.error || '', result: r, data: payload() });
      case 'sendDigest': return json({ ok: true, sent: sendDailyDigest(true) });
      default: throw new Error('Unknown action.');
    }
  } catch (err) {
    return json({ ok: false, error: err.message, code: err.codeType || '' });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkCode(code) {
  var want = PropertiesService.getScriptProperties().getProperty('ACCESS_CODE');
  if (!want || !code || code !== want) {
    var err = new Error('The access code is wrong.');
    err.codeType = 'code';
    throw err;
  }
}

/* ------------------------------------------------------------------ Sheet */

function sheet(name) {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
  return ss.getSheetByName(name);
}

function cell(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
  return v === null || v === undefined ? '' : String(v);
}

function readTable(name) {
  var sh = sheet(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getRange(1, 1, sh.getLastRow(), TABS[name].length).getValues();
  var head = values.shift();
  return values.filter(function (r) { return String(r[0]).trim() !== ''; }).map(function (r) {
    var o = {};
    head.forEach(function (h, i) { o[h] = cell(r[i]); });
    return o;
  });
}

/** Rewrites a whole tab in one go (used by the bCourses sync). */
function writeTable(name, rows) {
  var sh = sheet(name), head = TABS[name];
  var values = rows.map(function (o) { return head.map(function (h) { return o[h] === undefined || o[h] === null ? '' : String(o[h]); }); });
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, head.length).clearContent();
  if (values.length) sh.getRange(2, 1, values.length, head.length).setNumberFormat('@').setValues(values);
}

function writeRow(name, obj) {
  var sh = sheet(name), head = TABS[name];
  var row = head.map(function (h) { return obj[h] === undefined || obj[h] === null ? '' : String(obj[h]); });
  var ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  var i = ids.indexOf(String(obj[head[0]]));
  var range = i > -1 ? sh.getRange(i + 2, 1, 1, head.length) : sh.getRange(sh.getLastRow() + 1, 1, 1, head.length);
  range.setNumberFormat('@').setValues([row]);
}

function deleteRow(name, id) {
  var sh = sheet(name);
  if (sh.getLastRow() < 2) return;
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); });
  var i = ids.indexOf(String(id));
  if (i > -1) sh.deleteRow(i + 2);
}

function log(action, detail) {
  try { sheet('Log').appendRow([cell(new Date()), action, String(detail || '').slice(0, 500)]); } catch (e) { /* never block on logging */ }
}

function indexBy(list) { var o = {}; list.forEach(function (x) { o[x.id] = x; }); return o; }

function payload() {
  var props = PropertiesService.getScriptProperties();
  return {
    me: { name: props.getProperty('CANVAS_NAME') || '' },
    courses: readTable('Courses'),
    items: readTable('Items').filter(function (x) { return x.removed !== 'yes'; }).map(function (x) {
      delete x.calendarEventId; delete x.calendarSig; return x;
    }),
    announcements: readTable('Announcements'),
    settings: {
      emailPref: setting('EMAIL_PREF'),
      calendar: setting('CALENDAR_SYNC') !== 'off',
      canvasUrl: setting('CANVAS_URL'),
      lastSync: props.getProperty('LAST_SYNC') || '',
      lastSyncOk: props.getProperty('LAST_SYNC_OK') || '',
      syncError: props.getProperty('SYNC_ERROR') || '',
      hasToken: !!props.getProperty('CANVAS_TOKEN')
    },
    generated: cell(new Date())
  };
}

/* ------------------------------------------------------------------ bCourses (Canvas API), read only */

/** GET from the Canvas API with your token, following every page. Returns an array for list endpoints. */
function canvasGet(path) {
  var token = PropertiesService.getScriptProperties().getProperty('CANVAS_TOKEN');
  if (!token) { var e0 = new Error('No bCourses token yet. Add CANVAS_TOKEN in Project Settings > Script properties.'); e0.kind = 'auth'; throw e0; }
  var base = setting('CANVAS_URL').replace(/\/+$/, '');
  var url = base + path, out = null, pages = 0;
  while (url && pages++ < 40) {
    if (url.indexOf(base + '/') !== 0) break;   // never send the token anywhere but bCourses
    var res = UrlFetchApp.fetch(url, { method: 'get', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, muteHttpExceptions: true, followRedirects: false });
    var code = res.getResponseCode();
    if (code === 401) {
      var e1 = new Error('bCourses did not accept the token. It may have expired or been regenerated. Make a new one in bCourses (Account > Settings) and paste it into CANVAS_TOKEN.');
      e1.kind = 'auth'; throw e1;
    }
    if (code === 403 && /rate limit/i.test(res.getContentText())) { Utilities.sleep(2000); pages--; continue; }
    if (code < 200 || code >= 300) { var e2 = new Error('bCourses answered ' + code + ' for ' + path.split('?')[0] + '.'); e2.kind = 'http'; e2.status = code; throw e2; }
    var body = JSON.parse(res.getContentText() || 'null');
    if (!Array.isArray(body)) return body;
    out = (out || []).concat(body);
    var h = res.getHeaders();
    url = nextLink(h.Link || h.link || '');
  }
  return out || [];
}

/** The rel="next" URL from a Canvas Link header, or ''. */
function nextLink(header) {
  var parts = String(header || '').split(',');
  for (var i = 0; i < parts.length; i++) {
    var m = /<([^>]+)>\s*;\s*rel="?next"?/.exec(parts[i]);
    if (m) return m[1];
  }
  return '';
}

/** Courses for this semester: those whose term name contains TERM, or failing that, whose term overlaps the semester dates. */
function termCourses(list, termName, startDay, endDay) {
  list = (list || []).filter(function (c) { return c && c.id && c.name && !c.access_restricted_by_date; });
  var want = String(termName || '').toLowerCase();
  var byName = list.filter(function (c) { return want && c.term && String(c.term.name || '').toLowerCase().indexOf(want) > -1; });
  if (byName.length) return byName;
  var s = new Date(startDay + 'T00:00:00-07:00'), e = new Date(endDay + 'T23:59:59-08:00');
  return list.filter(function (c) {
    var t = c.term || {};
    var ts = t.start_at ? new Date(t.start_at) : (c.start_at ? new Date(c.start_at) : null);
    var te = t.end_at ? new Date(t.end_at) : (c.end_at ? new Date(c.end_at) : null);
    return (!ts || ts <= e) && (!te || te >= s);
  });
}

/** "DEVENG C200 001 - LEC 001" -> "DEVENG C200" */
function shortCode(code) {
  return String(code || '').replace(/\s*[-–:]\s*(LEC|SEM|DIS|LAB|STD|IND|COL|WOR|GRP|FLD|CLN|TUT|SES)\b.*$/i, '').replace(/^(.*\d.*?)\s+\d{3}$/, '$1').replace(/\s+/g, ' ').trim();   // a trailing section number only after the course number
}

/** Merges courses from bCourses with what's in the Sheet, keeping your own settings (short name, hidden, hub link, color). */
function mergeCourses(existing, fetched, linkedHubs, nowIso) {
  var prev = indexBy(existing), used = {}, out = [];
  existing.forEach(function (c) { if (c.color) used[c.color] = true; });
  fetched.forEach(function (c) {
    var id = 'c-' + c.id, old = prev[id];
    var enr = (c.enrollments || [])[0] || {};
    var row = old ? Object.assign({}, old) : { id: id, hidden: '', hubUrl: '', hubLabel: '' };
    row.canvasId = String(c.id);
    row.code = String(c.course_code || '');
    row.name = String(c.name || '');
    row.term = c.term ? String(c.term.name || '') : '';
    row.url = c.html_url || (setting('CANVAS_URL') + '/courses/' + c.id);
    row.score = enr.computed_current_score === null || enr.computed_current_score === undefined ? '' : String(enr.computed_current_score);
    row.grade = enr.computed_current_grade || '';
    row.syncedAt = nowIso;
    row.syncError = '';
    if (!row.shortName) row.shortName = shortCode(row.code) || row.name;
    if (!old && !row.hubUrl) {
      for (var i = 0; i < linkedHubs.length; i++) {
        if (new RegExp(linkedHubs[i].match, 'i').test(row.code + ' ' + row.name)) { row.hubUrl = linkedHubs[i].url; row.hubLabel = linkedHubs[i].label || ''; break; }
      }
    }
    if (!row.color) {
      var pick = PALETTE.filter(function (p) { return !used[p[0]]; })[0] || PALETTE[out.length % PALETTE.length];
      row.color = pick[0]; row.textColor = pick[1]; used[pick[0]] = true;
    }
    out.push(row);
  });
  // Courses that dropped off bCourses (or out of the term) stay in the Sheet but are hidden.
  existing.forEach(function (c) {
    if (!out.some(function (o) { return o.id === c.id; })) { var keep = Object.assign({}, c); keep.hidden = 'yes'; out.push(keep); }
  });
  return out;
}

/** One Canvas assignment, flattened for the Sheet. */
function normalizeAssignment(a, courseId, base) {
  var s = a.submission || {};
  var submitted = !!(s.submitted_at || s.excused || (s.workflow_state === 'graded' && !s.missing));
  var desc = a.description ? htmlToText(a.description, base) : (a.lock_explanation ? htmlToText(a.lock_explanation, base) : '');
  var score = s.score === null || s.score === undefined ? '' : String(s.score);
  return {
    id: 'a-' + a.id,
    canvasId: String(a.id),
    courseId: courseId,
    kind: 'canvas',
    title: String(a.name || 'Untitled assignment'),
    due: a.due_at || '',
    unlockAt: a.unlock_at || '',
    points: a.points_possible === null || a.points_possible === undefined ? '' : String(a.points_possible),
    url: a.html_url || '',
    description: desc.slice(0, 30000),
    submissionTypes: (a.submission_types || []).join(','),
    submitted: submitted ? 'yes' : '',
    submittedAt: s.submitted_at || '',
    late: s.late ? 'yes' : '',
    missing: s.missing && !submitted ? 'yes' : '',
    score: s.excused ? '' : score,
    grade: s.excused ? 'Excused' : (s.grade || ''),
    canvasUpdatedAt: a.updated_at || ''
  };
}

/**
 * Merges fresh assignments into the Items tab. Your own fields (myStatus, calendar event, first seen)
 * are kept. Assignments that vanished from a course that synced fine are marked removed, not deleted.
 * Your own to-dos and items of courses that failed to sync are left alone.
 */
function mergeItems(existing, fetched, syncedCourseIds, nowIso) {
  var prev = indexBy(existing), seen = {}, out = [];
  fetched.forEach(function (f) {
    var old = prev[f.id];
    var row = Object.assign({}, old || { myStatus: 'todo', calendarEventId: '', calendarSig: '', updatedAt: '', link: '' }, f);
    row.firstSeenAt = old && old.firstSeenAt ? old.firstSeenAt : nowIso;
    row.removed = '';
    seen[f.id] = true;
    out.push(row);
  });
  existing.forEach(function (x) {
    if (seen[x.id]) return;
    var row = Object.assign({}, x);
    if (x.kind === 'canvas' && syncedCourseIds[x.courseId]) row.removed = 'yes';
    out.push(row);
  });
  return out;
}

function normalizeAnnouncement(n, courseByCanvas, base) {
  var cid = String(n.context_code || '').replace(/^course_/, '');
  return {
    id: 'n-' + n.id,
    courseId: courseByCanvas[cid] || '',
    title: String(n.title || 'Announcement'),
    postedAt: n.posted_at || n.delayed_post_at || '',
    author: n.author && n.author.display_name ? String(n.author.display_name) : (n.user_name || ''),
    url: n.html_url || '',
    message: htmlToText(n.message || '', base).slice(0, 8000)
  };
}

/** Canvas HTML to the hub's plain text: links become [text](url), lists become "- " lines, headings "### ". */
function htmlToText(html, base) {
  var s = String(html || '');
  base = String(base || '').replace(/\/+$/, '');
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<a\b[^>]*?href\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi, function (all, q, d1, d2, inner) {
    var href = decodeEntities(d1 !== undefined ? d1 : (d2 || '')).trim();
    var text = decodeEntities(inner.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim().replace(/[\[\]]/g, '');
    if (/^\//.test(href) && base) href = base + href;
    if (!/^https?:\/\//i.test(href)) return text;
    href = href.replace(/ /g, '%20').replace(/\)/g, '%29').replace(/\(/g, '%28');
    return text && text !== href ? ' [' + text + '](' + href + ') ' : ' ' + href + ' ';
  });
  s = s.replace(/<h[1-6][^>]*>/gi, '\n### ').replace(/<\/h[1-6]>/gi, '\n');
  s = s.replace(/<li[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/?(p|div|tr|ul|ol|table|tbody|thead|blockquote|section|article|header|footer|pre|hr)\b[^>]*>/gi, '\n');
  s = s.replace(/<\/t[dh]>/gi, ' | ').replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  // "<li><p>text</p></li>" leaves the bullet on its own line; join it back to its text.
  s = s.replace(/\n(-|###)[ \t ]*\n+/g, '\n$1 ');
  return s.split('\n').map(function (l) { return l.replace(/[ \t ]+/g, ' ').replace(/\s*\|\s*$/, '').trim(); })
    .filter(function (l) { return l !== '' && l !== '-' && l !== '###'; })
    .join('\n');
}

function decodeEntities(s) {
  var named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', bull: '•', middot: '·', copy: '©', eacute: 'é', ntilde: 'ñ' };
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (all, code) {
    if (code.charAt(0) === '#') {
      var n = code.charAt(1).toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      try { return isNaN(n) ? all : String.fromCodePoint(n); } catch (e) { return all; }
    }
    return named[code.toLowerCase()] !== undefined ? named[code.toLowerCase()] : all;
  });
}

/** Reads bCourses and updates the Sheet and calendar. Runs every 2 hours and from "Check bCourses now". */
function syncCanvas() {
  var lock = LockService.getScriptLock();
  var props = PropertiesService.getScriptProperties();
  var result = { courses: 0, items: 0, announcements: 0, error: '' };
  try { lock.waitLock(60000); } catch (e) { result.error = 'Another update was running. Try again in a minute.'; return result; }
  var nowIso = cell(new Date());
  try {
    var base = setting('CANVAS_URL').replace(/\/+$/, '');
    if (!props.getProperty('CANVAS_NAME')) {
      try { var me = canvasGet('/api/v1/users/self'); if (me && me.short_name) props.setProperty('CANVAS_NAME', me.short_name); } catch (e) { if (e.kind === 'auth') throw e; }
    }
    var all = canvasGet('/api/v1/courses?enrollment_state=active&state[]=available&include[]=term&include[]=total_scores&per_page=100');
    var fetchedCourses = termCourses(all, setting('TERM'), setting('SEMESTER_START'), setting('SEMESTER_END'));
    var hubs = [];
    try { hubs = JSON.parse(setting('LINKED_HUBS') || '[]'); } catch (e) { hubs = []; }
    var courses = mergeCourses(readTable('Courses'), fetchedCourses, hubs, nowIso);

    var fetchedItems = [], synced = {}, problems = [];
    fetchedCourses.forEach(function (c) {
      var id = 'c-' + c.id, row = courses.filter(function (x) { return x.id === id; })[0];
      try {
        var list = canvasGet('/api/v1/courses/' + c.id + '/assignments?include[]=submission&order_by=due_at&per_page=100');
        list.filter(function (a) { return a.published !== false; }).forEach(function (a) { fetchedItems.push(normalizeAssignment(a, id, base)); });
        synced[id] = true;
      } catch (e) {
        if (e.kind === 'auth') throw e;
        // Some course sites hide the Assignments page from students. Keep what we had and say so.
        if (row) row.syncError = e.status === 403 || e.status === 404 ? 'This course hides its assignments list on bCourses.' : e.message;
        problems.push((row ? row.shortName : c.name) + ': ' + e.message);
      }
    });
    var items = mergeItems(readTable('Items'), fetchedItems, synced, nowIso);
    if (!props.getProperty('FIRST_SYNC_AT')) props.setProperty('FIRST_SYNC_AT', nowIso);

    // Announcements from the last few weeks, for every course of the term.
    var announcements = [];
    if (fetchedCourses.length) {
      var byCanvas = {}; fetchedCourses.forEach(function (c) { byCanvas[String(c.id)] = 'c-' + c.id; });
      var start = Utilities.formatDate(new Date(Date.now() - Number(setting('ANNOUNCEMENT_DAYS')) * 86400000), TZ, 'yyyy-MM-dd');
      var end = Utilities.formatDate(new Date(Date.now() + 86400000), TZ, 'yyyy-MM-dd');
      for (var i = 0; i < fetchedCourses.length; i += 10) {
        var q = fetchedCourses.slice(i, i + 10).map(function (c) { return 'context_codes[]=course_' + c.id; }).join('&');
        try {
          canvasGet('/api/v1/announcements?' + q + '&start_date=' + start + '&end_date=' + end + '&per_page=50').forEach(function (n) {
            announcements.push(normalizeAnnouncement(n, byCanvas, base));
          });
        } catch (e) { if (e.kind === 'auth') throw e; problems.push('Announcements: ' + e.message); }
      }
      announcements.sort(function (a, b) { return a.postedAt < b.postedAt ? 1 : -1; });
    }

    syncItemCalendar(items, courses);
    writeTable('Courses', courses);
    writeTable('Items', items);
    writeTable('Announcements', announcements);

    result.courses = fetchedCourses.length;
    result.items = fetchedItems.length;
    result.announcements = announcements.length;
    result.error = problems.join(' ');
    props.setProperty('LAST_SYNC', nowIso);
    props.setProperty('LAST_SYNC_OK', nowIso);
    props.setProperty('SYNC_ERROR', problems.length ? 'Part of bCourses could not be read: ' + problems.join(' ') : '');
    log('sync', result.courses + ' courses, ' + result.items + ' assignments' + (problems.length ? ', problems: ' + problems.join(' ') : ''));
  } catch (err) {
    result.error = err.message;
    props.setProperty('LAST_SYNC', nowIso);
    props.setProperty('SYNC_ERROR', err.message);
    log('sync failed', err.message);
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
  return result;
}

/* ------------------------------------------------------------------ your changes */

function setStatus(id, status) {
  if (STATUSES.indexOf(status) < 0) throw new Error('Unknown status.');
  var items = readTable('Items'), it = indexBy(items)[id];
  if (!it) throw new Error('That item is no longer on bCourses. Reload the page.');
  it.myStatus = status;
  it.updatedAt = cell(new Date());
  syncItemCalendar([it], readTable('Courses'));
  writeRow('Items', it);
  log('status', it.title + ' -> ' + status);
  return { ok: true, item: publicItem(it) };
}

/** Your own to-do (a reading, a personal deadline), optionally tied to a course. */
function saveTodo(input) {
  var title = String(input.title || '').trim();
  if (!title) throw new Error('A to-do needs a title.');
  var old = input.id ? indexBy(readTable('Items'))[input.id] : null;
  if (old && old.kind !== 'mine') throw new Error('Items from bCourses can only be changed on bCourses.');
  var it = Object.assign({}, old || { id: 'm-' + Utilities.getUuid().slice(0, 8), kind: 'mine', myStatus: 'todo', firstSeenAt: cell(new Date()), calendarEventId: '', calendarSig: '' }, {
    title: title.slice(0, 300),
    courseId: String(input.courseId || ''),
    due: /^\d{4}-\d{2}-\d{2}T/.test(input.due || '') ? input.due : '',
    description: String(input.description || '').slice(0, 10000),
    link: /^https?:\/\//i.test(input.link || '') ? String(input.link) : '',
    updatedAt: cell(new Date())
  });
  syncItemCalendar([it], readTable('Courses'));
  writeRow('Items', it);
  log(old ? 'to-do edit' : 'to-do add', it.title);
  return { ok: true, item: publicItem(it) };
}

function deleteTodo(id) {
  var it = indexBy(readTable('Items'))[id];
  if (!it) return { ok: true };
  if (it.kind !== 'mine') throw new Error('Items from bCourses can\'t be deleted here.');
  removeEvent(it.calendarEventId);
  deleteRow('Items', id);
  log('to-do delete', it.title);
  return { ok: true };
}

function saveCourse(input) {
  var c = indexBy(readTable('Courses'))[input.id];
  if (!c) throw new Error('That course is no longer on bCourses. Reload the page.');
  c.shortName = String(input.shortName || '').trim().slice(0, 40) || shortCode(c.code) || c.name;
  c.hidden = input.hidden ? 'yes' : '';
  c.hubUrl = /^https?:\/\//i.test(input.hubUrl || '') ? String(input.hubUrl) : '';
  c.hubLabel = c.hubUrl ? String(input.hubLabel || '').slice(0, 60) : '';
  writeRow('Courses', c);
  log('course settings', c.shortName);
  return { ok: true, course: c };
}

function setEmailPref(pref) {
  if (EMAIL_PREFS.indexOf(pref) < 0) throw new Error('Pick daily, weekly or off.');
  PropertiesService.getScriptProperties().setProperty('EMAIL_PREF', pref);
  log('email setting', pref);
  return { ok: true, emailPref: pref };
}

function publicItem(it) { var o = Object.assign({}, it); delete o.calendarEventId; delete o.calendarSig; return o; }
function isDone(it) { return it.submitted === 'yes' || it.myStatus === 'done'; }

/* ------------------------------------------------------------------ calendar */

function calendar() {
  var id = PropertiesService.getScriptProperties().getProperty('CALENDAR_ID');
  return id ? CalendarApp.getCalendarById(id) : null;
}

/**
 * Keeps one 30-minute event, ending at the due time, per item with a due date. Only touches the
 * calendar when the title, time or done state changed. Removed items lose their event.
 */
function syncItemCalendar(items, courses) {
  var cal = setting('CALENDAR_SYNC') === 'off' ? null : calendar();
  if (!cal) return;
  var byCourse = indexBy(courses), appUrl = setting('APP_URL'), made = 0;
  items.forEach(function (it) {
    var course = byCourse[it.courseId] || {};
    var gone = it.removed === 'yes' || !it.due || course.hidden === 'yes';
    if (gone) { if (it.calendarEventId) { removeEvent(it.calendarEventId); it.calendarEventId = ''; it.calendarSig = ''; } return; }
    var title = (isDone(it) ? 'Done' : 'Due') + (course.shortName ? ' (' + course.shortName + ')' : '') + ': ' + it.title;
    var sig = title + '|' + it.due;
    if (it.calendarEventId && it.calendarSig === sig) return;
    var end = new Date(it.due), start = new Date(end.getTime() - 30 * 60000);
    var desc = (it.url ? 'On bCourses: ' + it.url : '') + (it.link ? '\n\nLink: ' + it.link : '') + (appUrl ? '\n\n' + APP_NAME + ': ' + appUrl + '#/i/' + it.id : '');
    try {
      var ev = null;
      if (it.calendarEventId) { try { ev = cal.getEventById(it.calendarEventId); } catch (e) { ev = null; } }
      if (ev) {
        ev.setTitle(title); ev.setDescription(desc);
        if (ev.getEndTime().getTime() !== end.getTime()) ev.setTime(start, end);
      } else {
        if (made++ > 0) Utilities.sleep(250);   // Calendar limits how fast events can be created
        ev = cal.createEvent(title, start, end, { description: desc });
        ev.addPopupReminder(24 * 60);
      }
      it.calendarEventId = ev.getId(); it.calendarSig = sig;
    } catch (e) {
      log('calendar', it.title + ': ' + e.message);   // tried again on the next sync
    }
  });
}

function removeEvent(eventId) {
  if (!eventId) return;
  try { var cal = calendar(); var ev = cal && cal.getEventById(eventId); if (ev) ev.deleteEvent(); } catch (e) { /* already gone */ }
}

/** Run once from the editor if you turn CALENDAR_SYNC off: clears every event the hub made. */
function clearCalendar() {
  var items = readTable('Items');
  items.forEach(function (it) { if (it.calendarEventId) { removeEvent(it.calendarEventId); it.calendarEventId = ''; it.calendarSig = ''; } });
  writeTable('Items', items);
}

/* ------------------------------------------------------------------ the morning email */

/*
 * One email at 8 AM, only on days with something to say:
 *  - overdue (the day after, then every third day, not daily), due in the next 2 days,
 *  - assignments that showed up on bCourses since the last email, and new announcements.
 * Weekly sends one on Monday with the whole week. Every item links to its page in the hub.
 */
function sendDailyDigest(force) {
  var props = PropertiesService.getScriptProperties();
  var to = props.getProperty('OWNER_EMAIL');
  var pref = setting('EMAIL_PREF');
  var now = new Date(), DAYMS = 86400000;
  var isMonday = Utilities.formatDate(now, TZ, 'u') === '1';
  if (!to || (!force && (pref === 'off' || (pref === 'weekly' && !isMonday)))) return 0;
  var weekly = pref === 'weekly';
  var lastRun = props.getProperty('LAST_DIGEST') ? new Date(props.getProperty('LAST_DIGEST')) : new Date(now.getTime() - DAYMS);
  var firstSync = props.getProperty('FIRST_SYNC_AT') || '';
  var appUrl = setting('APP_URL');
  var courses = indexBy(readTable('Courses'));
  var visible = function (it) { var c = courses[it.courseId]; return it.removed !== 'yes' && !(c && c.hidden === 'yes'); };
  var items = readTable('Items').filter(visible);
  var today = dayNum(now), horizon = new Date(now.getTime() + (weekly ? 7 : 2) * DAYMS);
  var byDue = function (a, b) { return new Date(a.due) - new Date(b.due); };
  var open = items.filter(function (it) { return !isDone(it); });
  var overdue = open.filter(function (it) {
    if (!it.due || new Date(it.due) >= now) return false;
    var late = today - dayNum(new Date(it.due));
    return late <= 21 && (force || weekly || late <= 1 || late % 3 === 0);
  }).sort(byDue);
  var soon = open.filter(function (it) { return it.due && new Date(it.due) >= now && new Date(it.due) <= horizon; }).sort(byDue);
  var shown = {}; overdue.concat(soon).forEach(function (it) { shown[it.id] = true; });
  var since = weekly ? new Date(now.getTime() - 7 * DAYMS) : lastRun;
  var fresh = items.filter(function (it) {
    return it.kind === 'canvas' && !shown[it.id] && it.firstSeenAt && it.firstSeenAt !== firstSync && new Date(it.firstSeenAt) > since && !isDone(it);
  }).sort(byDue);
  var news = readTable('Announcements').filter(function (n) {
    var c = courses[n.courseId]; return n.postedAt && new Date(n.postedAt) > since && !(c && c.hidden === 'yes');
  });
  if (!overdue.length && !soon.length && !fresh.length && !news.length) { if (!force) props.setProperty('LAST_DIGEST', cell(now)); return 0; }

  var tag = function (it) { var c = courses[it.courseId]; return c ? c.shortName + ': ' : ''; };
  var item = function (it) {
    var d = it.due ? new Date(it.due) : null;
    var when = d ? (d < now ? 'Was due ' : 'Due ') + relDay(d, now) + ' at ' + Utilities.formatDate(d, TZ, 'h:mm a') : 'No due date';
    if (it.missing === 'yes') when += ', bCourses marks it missing';
    return emailItem(appUrl ? appUrl + '#/i/' + it.id : '', tag(it) + it.title, when, it.url || it.link, it.url ? 'Open on bCourses' : 'Open the link');
  };
  var newsItem = function (n) {
    var c = courses[n.courseId];
    return emailItem(n.url, (c ? c.shortName + ': ' : '') + n.title, 'Posted ' + relDay(new Date(n.postedAt), now) + (n.author ? ' by ' + n.author : ''), '', '');
  };
  var parts = [];
  if (overdue.length) parts.push(overdue.length + ' overdue');
  if (soon.length) parts.push(soon.length + (weekly ? ' due this week' : ' due soon'));
  if (fresh.length) parts.push(fresh.length + ' new');
  if (news.length) parts.push(news.length + ' announcement' + (news.length > 1 ? 's' : ''));
  var first = (props.getProperty('CANVAS_NAME') || '').split(' ')[0];
  var html = emailShell('Good morning' + (first ? ', ' + first : '') + '.',
    emailSection('Overdue', overdue.map(item)) +
    emailSection(weekly ? 'Due this week' : 'Due in the next 2 days', soon.map(item)) +
    emailSection('New on bCourses', fresh.map(item)) +
    emailSection('Announcements', news.map(newsItem)),
    appUrl ? '<a href="' + esc(appUrl) + '">Open the hub</a> or <a href="' + esc(appUrl + '#/about/email') + '">change how often you get this email</a>.' : '');
  sendMail(to, 'Classes: ' + parts.join(', '), html);
  if (!force) props.setProperty('LAST_DIGEST', cell(now));
  log('email', parts.join(', '));
  return 1;
}

function dayNum(d) { var s = Utilities.formatDate(d, TZ, 'yyyy-MM-dd').split('-'); return Date.UTC(+s[0], +s[1] - 1, +s[2]) / 86400000; }
/** "today", "tomorrow", "yesterday", "Fri, Oct 2" */
function relDay(d, now) {
  var diff = dayNum(d) - dayNum(now);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return Utilities.formatDate(d, TZ, 'EEE, MMM d');
}
function emailItem(href, title, meta, linkUrl, linkLabel) {
  return '<li style="margin:0 0 16px">' +
    (href ? '<a href="' + esc(href) + '" style="color:#000;font-weight:700">' + esc(title) + '</a>' : '<b>' + esc(title) + '</b>') +
    (meta ? '<br><span style="color:#4d4a43">' + esc(meta) + '</span>' : '') +
    (linkUrl ? '<br><a href="' + esc(linkUrl) + '" style="color:#0060a0">' + esc(linkLabel) + '</a>' : '') + '</li>';
}
function emailSection(title, items) {
  return items.length ? '<h3 style="font-size:16px;margin:20px 0 8px;border-bottom:2px solid #000;padding-bottom:4px">' + esc(title) + '</h3><ul style="list-style:none;padding:0;margin:0">' + items.join('') + '</ul>' : '';
}
function emailShell(greeting, body, footer) {
  return '<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#000;max-width:560px">' +
    '<p style="margin:0 0 4px">' + esc(greeting) + '</p>' + body +
    (footer ? '<p style="margin:24px 0 0;font-size:14px;color:#4d4a43">' + footer + '</p>' : '') + '</div>';
}
function sendMail(to, subject, html) {
  MailApp.sendEmail({ to: to, subject: subject, htmlBody: html, body: stripHtml(html), name: APP_NAME });
}
function esc(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function stripHtml(h) { return h.replace(/<\/[uo]l>/g, '\n\n').replace(/<li[^>]*>/g, '\n- ').replace(/<br>/g, '\n').replace(/<\/p>/g, '\n\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'); }
