// Checks the bCourses parsing and merge logic in apps-script/Code.gs against Canvas-shaped sample data.
// Run: node tests/backend.test.js
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const props = {};
const ctx = {
  console,
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
  Utilities: { formatDate: (d) => d.toISOString(), getUuid: () => 'abcdef1234', sleep: () => {} },
  Logger: { log: () => {} }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8'), ctx);
const base = 'https://bcourses.berkeley.edu';
let n = 0;
function t(name, fn) { fn(); n++; console.log('ok', name); }

t('nextLink finds the next page', () => {
  const h = '<https://bcourses.berkeley.edu/api/v1/courses?page=1&per_page=100>; rel="current",<https://bcourses.berkeley.edu/api/v1/courses?page=2&per_page=100>; rel="next",<https://bcourses.berkeley.edu/api/v1/courses?page=1&per_page=100>; rel="first"';
  assert.strictEqual(ctx.nextLink(h), 'https://bcourses.berkeley.edu/api/v1/courses?page=2&per_page=100');
  assert.strictEqual(ctx.nextLink('<https://x/a>; rel="last"'), '');
  assert.strictEqual(ctx.nextLink(''), '');
});

t('shortCode drops section suffixes', () => {
  assert.strictEqual(ctx.shortCode('DEVENG C200 001 - LEC 001'), 'DEVENG C200');
  assert.strictEqual(ctx.shortCode('CIVENG 211A - LEC 001'), 'CIVENG 211A');
  assert.strictEqual(ctx.shortCode('ESPM 290'), 'ESPM 290');
});

const courses = [
  { id: 101, name: 'DEVENG C200 - Design Impact', course_code: 'DEVENG C200 - LEC 001', term: { name: 'Fall 2026' }, enrollments: [{ computed_current_score: 95.2, computed_current_grade: 'A' }] },
  { id: 102, name: 'Environmental Microbiology', course_code: 'CIVENG 210', term: { name: 'Fall 2026' }, enrollments: [{ computed_current_score: null }] },
  { id: 90, name: 'Grad orientation', course_code: 'ORIENT', term: { name: 'Summer 2026' } },
  { id: 91, name: 'Locked', course_code: 'X', access_restricted_by_date: true }
];

t('termCourses keeps only the Fall 2026 term', () => {
  const r = ctx.termCourses(courses, 'Fall 2026', '2026-08-26', '2026-12-18');
  assert.deepStrictEqual(r.map((c) => c.id), [101, 102]);
});

t('termCourses falls back to dates when no term name matches', () => {
  const r = ctx.termCourses([
    { id: 1, name: 'A', term: { name: 'Default Term', start_at: '2026-08-20T07:00:00Z', end_at: '2026-12-20T08:00:00Z' } },
    { id: 2, name: 'B', term: { name: 'Default Term', start_at: '2025-08-20T07:00:00Z', end_at: '2025-12-20T08:00:00Z' } }
  ], 'Fall 2026', '2026-08-26', '2026-12-18');
  assert.deepStrictEqual(r.map((c) => c.id), [1]);
});

const hubs = JSON.parse(ctx.DEFAULTS.LINKED_HUBS);
let mergedCourses;
t('mergeCourses assigns palette colors, short names and the Microbe Busters link', () => {
  mergedCourses = ctx.mergeCourses([], ctx.termCourses(courses, 'Fall 2026', '', ''), hubs, '2026-10-04T22:00:00-07:00');
  assert.strictEqual(mergedCourses.length, 2);
  assert.strictEqual(mergedCourses[0].color, '#385F96');
  assert.strictEqual(mergedCourses[1].color, '#CF5921');
  assert.strictEqual(mergedCourses[0].shortName, 'DEVENG C200');
  assert.strictEqual(mergedCourses[0].hubUrl, 'https://gregor-posadas.github.io/microbe-busters-hub/');
  assert.strictEqual(mergedCourses[1].hubUrl, '');
  assert.strictEqual(mergedCourses[0].score, '95.2');
  assert.strictEqual(mergedCourses[1].score, '');
});

t('mergeCourses keeps your settings and hides a dropped course', () => {
  const mine = mergedCourses.map((c) => Object.assign({}, c));
  mine[1].shortName = 'Env Micro'; mine[1].hubUrl = ''; mine[0].hidden = '';
  const again = ctx.mergeCourses(mine, [courses[1]], hubs, 'later');
  const env = again.find((c) => c.id === 'c-102'), dev = again.find((c) => c.id === 'c-101');
  assert.strictEqual(env.shortName, 'Env Micro');
  assert.strictEqual(env.color, '#CF5921');
  assert.strictEqual(dev.hidden, 'yes');
});

const assignments = [
  { id: 1, name: 'Problem set 3', due_at: '2026-10-09T06:59:59Z', points_possible: 10, html_url: base + '/courses/102/assignments/1', published: true,
    description: '<p>Do <strong>problems 1&ndash;4</strong>. See <a href="/courses/102/files/55/download?wrap=1">the data file</a>.</p><ul><li><p>Show your work</p></li><li>Upload a PDF</li></ul>',
    submission_types: ['online_upload'], submission: { workflow_state: 'unsubmitted', submitted_at: null, missing: false } },
  { id: 2, name: 'Reading response 2', due_at: '2026-09-30T06:59:59Z', points_possible: 5, published: true, submission_types: ['online_text_entry'],
    submission: { workflow_state: 'unsubmitted', submitted_at: null, missing: true, late: false } },
  { id: 3, name: 'Lab report 1', due_at: '2026-09-25T06:59:59Z', points_possible: 20, published: true, submission_types: ['online_upload'],
    submission: { workflow_state: 'graded', submitted_at: '2026-09-24T20:00:00Z', score: 18, grade: '18', late: false, missing: false } },
  { id: 4, name: 'Midterm (in class)', due_at: '2026-10-20T17:00:00Z', points_possible: 100, published: true, submission_types: ['on_paper'], submission: { workflow_state: 'unsubmitted' } },
  { id: 5, name: 'Draft, not published', published: false }
];

let items;
t('normalizeAssignment reads submission state and converts the description', () => {
  items = assignments.filter((a) => a.published !== false).map((a) => ctx.normalizeAssignment(a, 'c-102', base));
  const ps = items[0], rr = items[1], lab = items[2], mid = items[3];
  assert.strictEqual(ps.id, 'a-1');
  assert.strictEqual(ps.submitted, '');
  assert.strictEqual(rr.missing, 'yes');
  assert.strictEqual(lab.submitted, 'yes');
  assert.strictEqual(lab.score, '18');
  assert.strictEqual(mid.submissionTypes, 'on_paper');
  assert.ok(ps.description.includes('problems 1–4'), ps.description);
  assert.ok(ps.description.includes('[the data file](https://bcourses.berkeley.edu/courses/102/files/55/download?wrap=1)'), ps.description);
  assert.ok(ps.description.split('\n').includes('- Show your work'), JSON.stringify(ps.description));
  assert.ok(ps.description.split('\n').includes('- Upload a PDF'), JSON.stringify(ps.description));
});

t('mergeItems keeps your status, marks vanished items removed, leaves to-dos alone', () => {
  const now = '2026-10-04T22:00:00-07:00';
  let rows = ctx.mergeItems([], items, { 'c-102': true }, now);
  assert.strictEqual(rows.length, 4);
  assert.ok(rows.every((r) => r.firstSeenAt === now && r.myStatus === 'todo'));
  rows[3].myStatus = 'done';
  rows.push({ id: 'm-1', kind: 'mine', courseId: 'c-102', title: 'Read chapter 4', myStatus: 'todo' });
  rows.push({ id: 'a-99', kind: 'canvas', courseId: 'c-101', title: 'From a course that failed to sync' });
  const later = '2026-10-05T00:00:00-07:00';
  const again = ctx.mergeItems(rows, items.slice(1), { 'c-102': true }, later);
  const by = Object.fromEntries(again.map((r) => [r.id, r]));
  assert.strictEqual(by['a-1'].removed, 'yes');
  assert.strictEqual(by['a-4'].myStatus, 'done');
  assert.strictEqual(by['a-4'].firstSeenAt, now);
  assert.strictEqual(by['m-1'].removed, undefined);
  assert.strictEqual(by['a-99'].removed, undefined);
  const back = ctx.mergeItems(again, items, { 'c-102': true }, later);
  assert.strictEqual(back.find((r) => r.id === 'a-1').removed, '');
});

t('normalizeAnnouncement maps the course and cleans the message', () => {
  const a = ctx.normalizeAnnouncement({ id: 7, title: 'Room change', posted_at: '2026-10-03T18:00:00Z', context_code: 'course_102', author: { display_name: 'Prof. Example' },
    html_url: base + '/courses/102/discussion_topics/7', read_state: 'read', message: '<p>We meet in 534 Davis&nbsp;on Tuesday.</p>' }, { 102: 'c-102' }, base);
  assert.strictEqual(a.courseId, 'c-102');
  assert.strictEqual(a.message, 'We meet in 534 Davis on Tuesday.');
  assert.strictEqual(a.author, 'Prof. Example');
  assert.strictEqual(a.read, 'yes');
});

t('htmlToText handles headings, tables and relative and odd links', () => {
  const s = ctx.htmlToText('<h3>Part 1</h3><table><tr><td>Due</td><td>Oct 9</td></tr></table><a href="mailto:x@y.z">email</a> <a href="/courses/1/pages/a (b)">Page</a>', base);
  const lines = s.split('\n');
  assert.ok(lines.includes('### Part 1'), JSON.stringify(s));
  assert.ok(lines.includes('Due | Oct 9'), JSON.stringify(s));
  assert.ok(s.includes('email'), s);
  assert.ok(!s.includes('mailto'), s);
  assert.ok(s.includes('[Page](https://bcourses.berkeley.edu/courses/1/pages/a%20%28b%29)'), s);
});

t('cleanToken accepts a pasted token and rejects junk', () => {
  const tok = '1072~' + 'aB3dE5fG7hJ9kL1mN3pQ5rS7tV9wX1yZ3aB5cD7eF9gH1jK3mN5pQ7';
  assert.strictEqual(ctx.cleanToken('  ' + tok + '\n'), tok);
  assert.strictEqual(ctx.cleanToken(tok.slice(0, 20) + ' ' + tok.slice(20)), tok);
  assert.strictEqual(ctx.cleanToken(''), '');
  assert.strictEqual(ctx.cleanToken('my password'), '');
  assert.strictEqual(ctx.cleanToken('<script>alert(1)</script>xxxxxxxxxxxx'), '');
});

t('normalizeTeamItems files your Microbe Busters work under DevEng C200 and links back', () => {
  const data = { members: [{ id: 'gregor' }, { id: 'muthoni' }], projects: [{ id: 'discovery', name: 'User discovery' }],
    assignments: [
      { id: 'a-1', memberId: 'gregor', projectId: 'discovery', title: 'Draft survey questions', due: '2026-10-06T17:00:00-07:00', status: 'doing', link: 'https://docs.google.com/document/d/x', instructions: '- Five questions' },
      { id: 'a-2', memberId: 'muthoni', title: 'Not mine', status: 'todo' },
      { id: 'a-3', memberId: 'gregor', title: 'Odd status', status: 'weird', link: 'javascript:alert(1)' }] };
  const courses = [{ id: 'c-101', code: 'DEVENG C200 - LEC 001', name: 'Design', shortName: 'DEVENG C200' }, { id: 'c-102', code: 'CIVENG 210', name: 'Env', shortName: 'CIVENG 210' }];
  const r = ctx.normalizeTeamItems(data, courses, 'gregor', 'https://gregor-posadas.github.io/microbe-busters-hub/', ctx.DEFAULTS.TEAM_HUB_COURSE);
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].id, 't-a-1');
  assert.strictEqual(r[0].courseId, 'c-101');
  assert.strictEqual(r[0].kind, 'team');
  assert.strictEqual(r[0].myStatus, 'doing');
  assert.strictEqual(r[0].project, 'User discovery');
  assert.strictEqual(r[0].url, 'https://gregor-posadas.github.io/microbe-busters-hub/#/a/a-1');
  assert.strictEqual(r[1].myStatus, 'todo');
  assert.strictEqual(r[1].link, '');
});

t('mergeTeamItems swaps in fresh team items and leaves everything else', () => {
  const items = [{ id: 'a-5', kind: 'canvas', title: 'PS' }, { id: 't-a-9', kind: 'team', title: 'Old', firstSeenAt: 'x' }, { id: 't-a-1', kind: 'team', title: 'Old title', firstSeenAt: 'first' }];
  const out = ctx.mergeTeamItems(items, [{ id: 't-a-1', kind: 'team', title: 'New title' }], 'now');
  const by = Object.fromEntries(out.map((x) => [x.id, x]));
  assert.strictEqual(by['a-5'].title, 'PS');
  assert.strictEqual(by['t-a-1'].title, 'New title');
  assert.strictEqual(by['t-a-1'].firstSeenAt, 'first');
  assert.strictEqual(by['t-a-9'].removed, 'yes');
  assert.strictEqual(ctx.mergeTeamItems(items, null, 'now'), items);
});

t('normalizeEvent keeps times and meeting links, drops declined and cancelled events', () => {
  const ev = ctx.normalizeEvent({ id: 'abc', summary: 'Advisor meeting', start: { dateTime: '2026-10-06T10:00:00-07:00' }, end: { dateTime: '2026-10-06T10:30:00-07:00' },
    hangoutLink: 'https://meet.google.com/xyz', location: '410 Davis', htmlLink: 'https://calendar.google.com/e', description: 'private notes' }, 'Gregor');
  assert.strictEqual(ev.title, 'Advisor meeting');
  assert.strictEqual(ev.allDay, false);
  assert.strictEqual(ev.meetLink, 'https://meet.google.com/xyz');
  assert.strictEqual(ev.description, undefined);
  const allDay = ctx.normalizeEvent({ id: 'd', summary: 'Holiday', start: { date: '2026-10-12' }, end: { date: '2026-10-13' } }, 'Holidays');
  assert.strictEqual(allDay.allDay, true);
  assert.strictEqual(allDay.start, '2026-10-12');
  assert.strictEqual(ctx.normalizeEvent({ id: 'x', status: 'cancelled', start: { date: '2026-10-12' } }, 'c'), null);
  assert.strictEqual(ctx.normalizeEvent({ id: 'y', start: { dateTime: '2026-10-06T10:00:00-07:00' }, attendees: [{ self: true, responseStatus: 'declined' }] }, 'c'), null);
});

t('autoCompleteLinked marks the week whose window holds the latest journal submission', () => {
  const link = 'https://bcourses.berkeley.edu/courses/1559283/assignments/9141348';
  const items = [
    { id: 'a-9141348', kind: 'canvas', canvasId: '9141348', submittedAt: '2026-10-09T21:30:00-07:00' },
    { id: 'm-1', kind: 'mine', link, due: '2026-10-09T23:59:00-07:00', myStatus: 'todo' },
    { id: 'm-2', kind: 'mine', link, due: '2026-10-16T23:59:00-07:00', myStatus: 'todo' },
    { id: 'm-0', kind: 'mine', link, due: '2026-10-02T23:59:00-07:00', myStatus: 'todo' },
    { id: 'm-3', kind: 'mine', link: 'https://example.com', due: '2026-10-09T23:59:00-07:00', myStatus: 'todo' }];
  ctx.autoCompleteLinked(items, 'now');
  const by = Object.fromEntries(items.map((x) => [x.id, x.myStatus]));
  assert.deepStrictEqual([by['m-0'], by['m-1'], by['m-2'], by['m-3']], ['todo', 'done', 'todo', 'todo']);
  items[0].submittedAt = '2026-10-10T22:00:00-07:00';   // a day late still counts for that week, not the next
  items[1].myStatus = 'todo'; ctx.autoCompleteLinked(items, 'now');
  assert.strictEqual(items[1].myStatus, 'done'); assert.strictEqual(items[2].myStatus, 'todo');
});

t('cachePutBig and cacheGetBig round-trip a value bigger than one cache entry', () => {
  const store = {};
  ctx.CacheService = { getScriptCache: () => ({ putAll: (m) => Object.assign(store, m), put: (k, v) => { store[k] = v; }, get: (k) => (k in store ? store[k] : null),
    getAll: (ks) => Object.fromEntries(ks.map((k) => [k, store[k]])), remove: (k) => { delete store[k]; } }) };
  const big = { s: 'x'.repeat(95000), list: [1, 2, 3] };
  ctx.cachePutBig('payload', big, 60);
  assert.strictEqual(store.payload, '4');
  assert.strictEqual(JSON.stringify(ctx.cacheGetBig('payload')), JSON.stringify(big));
  ctx.bustPayload();
  assert.strictEqual(ctx.cacheGetBig('payload'), null);
});

console.log(n + ' checks passed');
