/* Classes Hub: this week's work across every Fall 2026 course, from bCourses.
   Data comes from a Google Apps Script web app (see apps-script/Code.gs),
   or from data/demo.json when no apiUrl is set in assets/config.js.
   Same design and building blocks as the Microbe Busters Hub. */
(function () {
  "use strict";

  var cfg = window.CH_CONFIG || {};
  var TZ = cfg.timeZone || "America/Los_Angeles";
  var DAY = 86400000;
  var main = document.getElementById("main");
  var state = { data: null, demo: !cfg.apiUrl };
  var OWNER = cfg.ownerName || "you";

  /* ---------- small helpers ---------- */
  var store = {
    get: function (k) { try { return window.localStorage.getItem("ch." + k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem("ch." + k, v); } catch (e) { /* private mode */ } },
    del: function (k) { try { window.localStorage.removeItem("ch." + k); } catch (e) { /* ignore */ } }
  };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || "")) ? String(u) : ""; }
  function byId(list, id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; } return null; }
  function newId(prefix) { return prefix + "-" + Math.random().toString(36).slice(2, 9); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  function newTab() { return '<span class="sr"> (opens in a new tab)</span>'; }

  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("is-on");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("is-on"); }, 3200);
  }

  /* ---------- dates (always shown in Pacific time) ---------- */
  function parts(date) {
    var f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
    var o = {}; f.formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  function dayNumber(date) { var p = parts(date); return Date.UTC(+p.year, +p.month - 1, +p.day) / DAY; }
  function fmtDay(date, withYear) {
    return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", year: withYear ? "numeric" : undefined }).format(date);
  }
  function fmtLongDay(date) { return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" }).format(date); }
  function fmtTime(date) { return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(date); }
  function due(x) { return x && x.due ? new Date(x.due) : null; }
  function dayName(d) {
    var diff = dayNumber(d) - dayNumber(new Date());
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    return fmtDay(d);
  }
  function relDue(d, done) {
    if (done) return "Done";
    if (!d) return "No due date";
    var now = new Date(), diff = dayNumber(d) - dayNumber(now);
    if (d < now) {
      var hours = Math.round((now - d) / 3600000);
      if (hours < 24) return hours <= 1 ? "Overdue by 1 hour" : "Overdue by " + hours + " hours";
      var days = Math.max(1, -diff);
      return "Overdue by " + plural(days, "day");
    }
    if (diff === 0) return +parts(d).hour >= 18 ? "Due tonight" : "Due today";
    if (diff === 1) return "Due tomorrow";
    if (diff < 7) return "Due in " + diff + " days";
    var w = Math.round(diff / 7);
    return "Due in " + plural(w, "week");
  }
  function tzOffsetMin(ts) {
    var p = parts(new Date(ts));
    var asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    return Math.round((asUTC - Math.floor(ts / 60000) * 60000) / 60000);
  }
  function zonedIso(dateStr, timeStr) {
    if (!dateStr) return "";
    var d = dateStr.split("-"), t = (timeStr || "23:59").split(":");
    var guess = Date.UTC(+d[0], +d[1] - 1, +d[2], +t[0], +t[1]);
    var off = tzOffsetMin(guess);
    off = tzOffsetMin(guess - off * 60000);
    var sign = off < 0 ? "-" : "+", abs = Math.abs(off);
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return dateStr + "T" + pad(+t[0]) + ":" + pad(+t[1]) + ":00" + sign + pad(Math.floor(abs / 60)) + ":" + pad(abs % 60);
  }
  function localParts(iso) {
    if (!iso) return { date: "", time: "23:59" };
    var p = parts(new Date(iso));
    return { date: p.year + "-" + p.month + "-" + p.day, time: p.hour + ":" + p.minute };
  }
  /* Monday of the week a date falls in, as a day number. */
  function weekOf(d) { var n = dayNumber(d), wd = new Date(n * DAY).getUTCDay(); return n - ((wd + 6) % 7); }

  /* ---------- courses ---------- */
  function course(id) { return byId(state.data.courses, id) || null; }
  function courseHidden(id) { var c = course(id); return !!(c && c.hidden === "yes"); }
  /* The number on a course's badge: "DEVENG C200" -> "C200". Color is never the only clue. */
  function abbr(c) {
    var s = String((c && (c.shortName || c.code)) || "").trim();
    var m = /([A-Z]*\d+[A-Z]*)\s*$/i.exec(s);
    return (m ? m[1] : s.slice(0, 4)).toUpperCase() || "?";
  }
  function cbadge(c, size) {
    if (!c) return '<span class="cbadge cbadge--none' + (size ? " cbadge--" + size : "") + '" aria-hidden="true">Me</span>';
    return '<span class="cbadge' + (size ? " cbadge--" + size : "") + '" style="--c:' + esc(c.color || "#1b1a17") + ";--t:" + esc(c.textColor || "#fff") + '" aria-hidden="true">' + esc(abbr(c)) + "</span>";
  }
  function chip(c) { return c ? '<span class="chip">' + cbadge(c, "sm") + "<span>" + esc(c.shortName || c.code) + "</span></span>" : '<span class="chip">' + cbadge(null, "sm") + "<span>Personal</span></span>"; }
  function visibleCourses() {
    return state.data.courses.filter(function (c) { return c.hidden !== "yes"; }).sort(function (a, b) { return String(a.shortName).localeCompare(String(b.shortName)); });
  }
  function bcoursesBase() { return (state.data.settings && state.data.settings.canvasUrl) || cfg.bcoursesUrl || "https://bcourses.berkeley.edu"; }

  /* ---------- items: assignments from bCourses and your own to-dos ---------- */
  function isDone(it) { return it.submitted === "yes" || it.myStatus === "done"; }
  function noSubmit(it) { return it.kind === "canvas" && /^(none|on_paper|not_graded|)$/.test(String(it.submissionTypes || "").split(",")[0]) ; }
  var LABEL = { todo: "To do", doing: "In progress", done: "Done", late: "Overdue", missing: "Missing", submitted: "Submitted" };
  function statusKey(it) {
    if (isDone(it)) return "done";
    var d = due(it);
    if (d && d < new Date()) return "late";
    return it.myStatus === "doing" ? "doing" : "todo";
  }
  function statusWord(it) {
    var k = statusKey(it);
    if (k === "done") return it.submitted === "yes" ? (it.grade === "Excused" ? "Excused" : "Submitted") : "Done";
    if (k === "late") return it.missing === "yes" ? "Missing" : "Overdue";
    return LABEL[k];
  }
  function shape(key) {
    var s = '<svg class="st__shape" viewBox="0 0 18 18" aria-hidden="true" focusable="false">';
    if (key === "done") s += '<circle cx="9" cy="9" r="8.5" fill="var(--st-done)"/><path d="M5 9.4l2.6 2.6L13 6.6" fill="none" stroke="var(--paper)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
    else if (key === "late") s += '<path d="M9 1.2L17.2 16.4H0.8Z" fill="var(--st-late)"/><path d="M9 6.5v4.6" stroke="var(--paper)" stroke-width="2.2" stroke-linecap="round"/><circle cx="9" cy="13.6" r="1.2" fill="var(--paper)"/>';
    else if (key === "doing") s += '<circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--st-doing)" stroke-width="2.5"/><path d="M9 1.5a7.5 7.5 0 0 1 0 15z" fill="var(--st-doing)"/>';
    else if (key === "soon") s += '<circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--st-soon)" stroke-width="2.5"/><path d="M9 4.5V9l3.2 2" fill="none" stroke="var(--st-soon)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
    else s += '<circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--st-todo)" stroke-width="2.5"/>';
    return s + "</svg>";
  }
  function badge(it) { return '<span class="st">' + shape(statusKey(it)) + esc(statusWord(it)) + "</span>"; }
  function items() { return state.data.items.filter(function (it) { return !courseHidden(it.courseId); }); }
  function sortByDue(a, b) {
    var da = due(a), db = due(b);
    if (!da && !db) return String(a.title).localeCompare(String(b.title)); if (!da) return 1; if (!db) return -1;
    return da - db;
  }
  function pts(it) { var p = parseFloat(it.points); return isNaN(p) || p === 0 ? "" : (p % 1 ? p.toFixed(1) : p) + " pts"; }
  function scoreText(it) {
    if (it.grade === "Excused") return "Excused";
    if (it.score === "" || it.score == null) return "";
    var p = parseFloat(it.points);
    return "Graded: " + it.score + (isNaN(p) || !p ? "" : " / " + (p % 1 ? p.toFixed(1) : p));
  }

  function rowHtml(it, hideCourse) {
    var d = due(it), k = statusKey(it), c = course(it.courseId);
    var meta = badge(it) + (hideCourse ? "" : chip(c)) + (pts(it) ? "<span>" + esc(pts(it)) + "</span>" : "") + (it.kind === "mine" ? "<span>Your to-do</span>" : "") +
      (it.kind === "team" ? '<span class="tag-team">' + esc(teamName()) + "</span>" : "");
    return '<li class="row' + (k === "done" ? " is-done" : "") + '" data-peek="i:' + esc(it.id) + '"><a href="#/i/' + esc(it.id) + '">' +
      '<span class="row__main"><span class="row__title">' + esc(it.title) + '</span><span class="row__meta">' + meta + "</span></span>" +
      '<span class="row__due"><span class="row__day">' + (d ? esc(fmtDay(d)) + ", " + esc(fmtTime(d)) : "No due date") + '</span><span class="row__rel">' + (d || k === "done" ? esc(relDue(d, k === "done")) : "") + "</span></span></a></li>";
  }
  function teamName() { var t = (state.data.settings && state.data.settings.teamHub) || {}; return (t.name || "Microbe Busters Hub").replace(/ Hub$/, ""); }
  function rows(list, hideCourse) { return '<ul class="rows">' + list.map(function (x) { return rowHtml(x, hideCourse); }).join("") + "</ul>"; }

  /* ---------- demo data stays current: shift its dates to this week ---------- */
  function shiftDemo(d) {
    if (!d.anchor) return d;
    var weeks = Math.round((weekOf(new Date()) - weekOf(new Date(d.anchor))) / 7), ms = weeks * 7 * DAY;
    if (!ms) return d;
    var move = function (o, keys) { keys.forEach(function (k) { if (o[k]) o[k] = new Date(new Date(o[k]).getTime() + ms).toISOString(); }); };
    d.items.forEach(function (it) { move(it, ["due", "unlockAt", "submittedAt", "updatedAt", "firstSeenAt"]); });
    d.announcements.forEach(function (n) { move(n, ["postedAt"]); });
    ((d.calendar || {}).events || []).forEach(function (e) {
      if (e.allDay) ["start", "end"].forEach(function (k) { e[k] = new Date(new Date(e[k] + "T12:00:00Z").getTime() + ms).toISOString().slice(0, 10); });
      else move(e, ["start", "end"]);
    });
    move(d.settings, ["lastSync", "lastSyncOk"]);
    return d;
  }

  /* ---------- talking to the backend ---------- */
  var busyCount = 0;
  function busy(on, msg) {
    busyCount = Math.max(0, busyCount + (on ? 1 : -1));
    var bar = document.getElementById("busy"), txt = document.getElementById("busy-text");
    main.setAttribute("aria-busy", busyCount > 0 ? "true" : "false");
    if (bar) bar.hidden = busyCount === 0;
    if (txt) txt.textContent = busyCount > 0 ? (msg || "Saving") : "";
  }
  function tracked(promise, msg) {
    busy(true, msg);
    return promise.then(function (v) { busy(false); return v; }, function (e) { busy(false); throw e; });
  }
  function apiGet() {
    var url = cfg.apiUrl + (cfg.apiUrl.indexOf("?") > -1 ? "&" : "?") + "action=data&code=" + encodeURIComponent(store.get("code") || "");
    return tracked(fetch(url, { method: "GET", redirect: "follow" }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) { var e = new Error(j.error || "The server said no."); e.code = j.code; throw e; }
      return j.data;
    }), "Loading");
  }
  function apiPost(body, msg) {
    if (state.demo) return Promise.resolve({ ok: true, demo: true });
    body.code = store.get("code") || "";
    return tracked(fetch(cfg.apiUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) { var e = new Error(j.error || "The change wasn't saved."); e.code = j.code; throw e; } return j; }), msg || "Saving");
  }
  function setData(d) {
    d.courses = d.courses || []; d.items = d.items || []; d.announcements = d.announcements || []; d.settings = d.settings || {}; d.me = d.me || {};
    d.calendar = d.calendar || null; d.settings.teamHub = d.settings.teamHub || null;
    state.data = d;
    showNotice();
  }
  function load() {
    var p = state.demo ? tracked(fetch("data/demo.json").then(function (r) { return r.json(); }).then(shiftDemo), "Loading") : apiGet();
    return p.then(setData);
  }
  function showNotice() {
    var n = document.getElementById("notice"), s = state.data.settings;
    if (state.demo) n.innerHTML = "<p><b>Demo mode.</b> These are sample courses with dates moved to this week. Nothing is saved. Connect the backend to see your real classes (see README).</p>";
    else if (!s.hasToken) n.innerHTML = '<p><b>bCourses isn\'t connected yet.</b> <a href="#/about/sync">Connect bCourses</a> to bring in your classes.</p>';
    else if (s.syncError) n.innerHTML = '<p><b>bCourses:</b> ' + esc(s.syncError) + ' <a href="#/about/sync">More</a></p>';
    else { n.hidden = true; n.innerHTML = ""; }
    if (n.innerHTML) n.hidden = false;
    var fs = document.getElementById("foot-status"), ok = s.lastSyncOk ? new Date(s.lastSyncOk) : null;
    var dn = ok ? dayName(ok) : "", when = dn === "Today" ? "today" : "on " + dn;
    fs.textContent = state.demo ? "Showing demo data." : ok ? "bCourses last checked " + when + " at " + fmtTime(ok) + ". It's checked every 2 hours." : "bCourses hasn't been read yet.";
  }

  /* ---------- rich text from bCourses: [label](url) links, "- " bullets, "### " headings ---------- */
  var LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/g;
  function shortUrl(u) { var t = u.replace(/^https?:\/\/(www\.)?/i, ""); return t.length > 44 ? t.slice(0, 42) + "…" : t; }
  function inline(text) {
    var out = "", last = 0, m;
    text = String(text || "");
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(text))) {
      out += esc(text.slice(last, m.index));
      var url = m[2] || m[3], label = m[1] || shortUrl(url);
      out += '<a class="ilink" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(label) + newTab() + "</a>";
      last = LINK_RE.lastIndex;
    }
    return out + esc(text.slice(last));
  }
  function richText(text, emptyMsg) {
    var lines = String(text || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) return emptyMsg ? '<p class="empty">' + esc(emptyMsg) + "</p>" : "";
    var BUL = /^[-*•]\s+/, NUM = /^\d+[.)]\s+/, html = "", open = "";
    lines.forEach(function (l) {
      var kind = BUL.test(l) ? "ul" : NUM.test(l) ? "ol" : "";
      if (open && kind !== open) { html += "</" + open + ">"; open = ""; }
      if (kind && !open) { html += "<" + kind + ' class="list">'; open = kind; }
      if (kind) html += "<li>" + inline(l.replace(BUL, "").replace(NUM, "")) + "</li>";
      else if (/^#{2,3}\s+/.test(l)) html += '<h3 class="rt-h">' + inline(l.replace(/^#+\s+/, "")) + "</h3>";
      else html += '<p class="rt-p">' + inline(l) + "</p>";
    });
    return html + (open ? "</" + open + ">" : "");
  }
  function plainPreview(text, n) {
    var s = String(text || "").replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1").split(/\n+/).map(function (l) {
      l = l.replace(/^[-#*•\s]+/, "").trim();
      return l && !/[.!?:;,]$/.test(l) ? l + "." : l;   // list lines read as sentences in a one-line preview
    }).join(" ").replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s;
  }
  function calendarUrl(it) {
    var d = due(it); if (!d) return "";
    var f = function (x) { return x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); };
    var c = course(it.courseId), start = new Date(d.getTime() - 30 * 60000);
    var details = (it.url ? "On bCourses: " + it.url + "\n\n" : "") + (it.link ? it.link + "\n\n" : "") + "Classes Hub: " + location.href.split("#")[0] + "#/i/" + it.id;
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent("Due" + (c ? " (" + c.shortName + ")" : "") + ": " + it.title) +
      "&dates=" + f(start) + "/" + f(d) + "&details=" + encodeURIComponent(details);
  }

  /* ---------- views ---------- */
  function counts(list) {
    var now = new Date(), week = new Date(now.getTime() + 7 * DAY), c = { late: 0, week: 0, done: 0, open: 0 };
    list.forEach(function (it) {
      var k = statusKey(it), d = due(it);
      if (k === "done") { c.done++; return; }
      c.open++;
      if (k === "late") c.late++; else if (d && d <= week) c.week++;
    });
    return c;
  }
  function semester() {
    var s = new Date(zonedIso(cfg.semesterStart || "2026-08-26", "00:00")), e = new Date(zonedIso(cfg.semesterEnd || "2026-12-18", "23:59")), now = new Date();
    var total = dayNumber(e) - dayNumber(s) + 1, elapsed = dayNumber(now) - dayNumber(s);
    return { start: s, end: e, pct: Math.max(0, Math.min(100, Math.round(100 * (now - s) / (e - s)))),
      week: Math.max(1, Math.min(Math.ceil(total / 7), Math.floor(elapsed / 7) + 1)), weeks: Math.ceil(total / 7),
      left: Math.max(0, dayNumber(e) - dayNumber(now)), before: now < s, after: now > e };
  }
  function meter(id, label, value, meta, cls) {
    return '<div class="meter ' + cls + '"><p class="meter__label" id="' + id + '"><b>' + value + "%</b> " + label + "</p>" +
      '<div class="meter__bar" role="progressbar" aria-labelledby="' + id + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + value + '"><i style="width:' + value + '%"></i></div>' +
      '<p class="meter__meta">' + meta + "</p></div>";
  }
  function progressHtml() {
    var sem = semester(), now = new Date();
    var dueSoFar = items().filter(function (it) { var d = due(it); return d && d <= now && !(it.kind === "canvas" && noSubmit(it) && it.myStatus !== "done" && it.score === ""); });
    var turnedIn = dueSoFar.filter(isDone).length, wpct = dueSoFar.length ? Math.round(100 * turnedIn / dueSoFar.length) : 100;
    return '<section class="semester rail__sec" aria-labelledby="prog-h"><h2 id="prog-h">' + esc(cfg.semesterLabel || "This semester") + "</h2><div class=\"semester__grid\">" +
      meter("prog-time", "of the semester has gone by", sem.pct, sem.before ? "Starts " + esc(fmtDay(sem.start)) : sem.after ? "The semester is over." : "Week " + sem.week + " of " + sem.weeks + ", " + plural(sem.left, "day") + " left. Ends " + esc(fmtDay(sem.end)) + ".", "meter--time") +
      meter("prog-work", "of the work due so far is done", wpct, turnedIn + " of " + dueSoFar.length + " done", "meter--work") + "</div></section>";
  }

  /* ---------- your Google Calendar events ---------- */
  function gcal() { return state.data.calendar || { calendars: [], events: [], error: "" }; }
  function evStart(e) { return e.allDay ? new Date(zonedIso(e.start, "00:00")) : new Date(e.start); }
  function evEnd(e) { return e.allDay ? new Date(zonedIso(e.end, "00:00")) : new Date(e.end); }
  function eventsOn(dn) {
    return gcal().events.filter(function (e) {
      var a = dayNumber(evStart(e)), b = e.allDay ? dayNumber(evEnd(e)) - 1 : dayNumber(new Date(evEnd(e).getTime() - 1));
      return a <= dn && dn <= Math.max(a, b);
    }).sort(function (x, y) { return (y.allDay - x.allDay) || (evStart(x) - evStart(y)); });
  }
  /* "10:00 to 10:45 AM", or "11:30 AM to 1:00 PM" when it crosses noon. */
  function evWhen(e) {
    if (e.allDay) return "All day";
    var a = fmtTime(evStart(e)), b = fmtTime(evEnd(e)), pa = a.slice(-2), pb = b.slice(-2);
    return (pa === pb ? a.slice(0, -3) : a) + " to " + b;
  }
  function eventRow(e) {
    var url = safeUrl(e.url), meet = safeUrl(e.meetLink), past = !e.allDay && evEnd(e) < new Date();
    var when = (e._showDay ? dayName(evStart(e)) + ", " : "") + evWhen(e);
    return '<li class="evt' + (past ? " is-past" : "") + '" data-peek="e:' + esc(e.id) + '"><span class="evt__time">' + esc(when) + "</span>" +
      '<span class="evt__main">' + (url ? '<a class="evt__title" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(e.title) + newTab() + "</a>" : '<span class="evt__title">' + esc(e.title) + "</span>") +
      '<span class="evt__cal">' + esc(e.calendar) + (e.tentative ? ", maybe" : "") + (e.location ? ", " + esc(e.location) : "") + "</span></span>" +
      (meet && !past ? '<a class="evt__join" href="' + esc(meet) + '" target="_blank" rel="noopener">Join<span class="sr"> ' + esc(e.title) + " (opens in a new tab)</span></a>" : "") + "</li>";
  }
  function eventList(list) { return '<ul class="evts">' + list.map(eventRow).join("") + "</ul>"; }
  function showEvents() { return store.get("showEvents") !== "0"; }
  function isoDay(dn) { return new Date(dn * DAY).toISOString().slice(0, 10); }
  function dayFromIso(iso) { var p = String(iso || "").split("-"); return p.length === 3 ? Date.UTC(+p[0], +p[1] - 1, +p[2]) / DAY : NaN; }
  function noonOf(dn) { return new Date(zonedIso(isoDay(dn), "12:00")); }

  /* ---------- clock and month calendar ---------- */
  var calMonth = null;   // { y, m } being shown; null means this month
  function clockText() { return fmtTime(new Date()); }
  function monthHtml() {
    var now = new Date(), p = parts(now), y = calMonth ? calMonth.y : +p.year, m = calMonth ? calMonth.m : +p.month;
    var first = Date.UTC(y, m - 1, 1) / DAY, days = new Date(Date.UTC(y, m, 0)).getUTCDate(), today = dayNumber(now);
    var lead = (new Date(first * DAY).getUTCDay() + 6) % 7, cells = [];
    var open = items().filter(function (it) { return due(it) && !isDone(it); });
    var byDay = {}; open.forEach(function (it) { var k = dayNumber(due(it)); (byDay[k] = byDay[k] || []).push(it); });
    for (var i = 0; i < lead; i++) cells.push('<span class="mc__pad" aria-hidden="true"></span>');
    for (var d = 0; d < days; d++) {
      var dn = first + d, dueList = byDay[dn] || [], evs = eventsOn(dn), date = noonOf(dn);
      var label = fmtDay(date) + (dn === today ? ", today" : "") + ": " + (dueList.length ? plural(dueList.length, "thing") + " due" : "nothing due") + (evs.length ? ", " + plural(evs.length, "event") : "");
      var dots = dueList.slice(0, 3).map(function (it) { var c = course(it.courseId); return '<i class="mc__dot" style="--c:' + esc(c ? c.color : "var(--ink)") + '"></i>'; }).join("") + (dueList.length > 3 ? '<i class="mc__more">+</i>' : "");
      cells.push('<a class="mc__day' + (dn === today ? " is-today" : "") + (dn < today ? " is-past" : "") + (dueList.length ? " has-due" : "") + '" href="#/d/' + isoDay(dn) + '" aria-label="' + esc(label) + '" data-peek="d:' + isoDay(dn) + '">' +
        '<span class="mc__n" aria-hidden="true">' + (d + 1) + '</span><span class="mc__marks" aria-hidden="true">' + dots + (evs.length ? '<i class="mc__evt"></i>' : "") + "</span></a>");
    }
    var title = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(first * DAY + 12 * 3600000));
    return '<div class="mc" id="month"><div class="mc__head"><button type="button" class="mc__nav" data-act="cal-prev" aria-label="Previous month">‹</button><h3 class="mc__title" aria-live="polite">' + esc(title) + "</h3>" +
      '<button type="button" class="mc__nav" data-act="cal-next" aria-label="Next month">›</button></div>' +
      '<div class="mc__grid">' + ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(function (w) { return '<abbr class="mc__wd" title="' + w + '">' + w.charAt(0) + "</abbr>"; }).join("") + cells.join("") + "</div>" +
      '<p class="mc__key"><span><i class="mc__dot" style="--c:var(--ink)"></i> due, in its course color</span>' + (gcal().events.length ? '<span><i class="mc__evt"></i> on your calendar</span>' : "") + "</p>" +
      (calMonth ? '<button type="button" class="btn btn--quiet mc__today" data-act="cal-today">Back to this month</button>' : "") + "</div>";
  }
  /* A split-flap clock, like the vintage ones: each card folds down to the next digit when the minute turns.
     Screen readers get the time as text; the cards are decoration. Reduced motion swaps digits without the fold. */
  function clockParts() {
    var p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(new Date()), o = {};
    p.forEach(function (x) { o[x.type] = x.value; });
    var h = String(o.hour || ""), m = String(o.minute || "00");
    return { h1: h.length > 1 ? h.charAt(0) : "", h2: h.slice(-1), m1: m.charAt(0), m2: m.charAt(1), ap: String(o.dayPeriod || "").toUpperCase() };
  }
  function flipFace(v) { return '<span class="flip__half flip__top"><span>' + esc(v) + '</span></span><span class="flip__half flip__bottom"><span>' + esc(v) + "</span></span>"; }
  function flipCard(key, v) { return '<span class="flip' + (key === "ap" ? " flip--ap" : "") + (v === "" ? " is-blank" : "") + '" data-f="' + key + '" data-v="' + esc(v) + '">' + flipFace(v) + "</span>"; }
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function flipTo(el, v) {
    var old = el.getAttribute("data-v");
    if (old === v) return;
    el.setAttribute("data-v", v); el.classList.toggle("is-blank", v === "");
    if (reduceMotion) { el.innerHTML = flipFace(v); return; }
    el.innerHTML = '<span class="flip__half flip__top"><span>' + esc(v) + '</span></span><span class="flip__half flip__bottom"><span>' + esc(old) + "</span></span>" +
      '<span class="flip__half flip__top flip__flap flip__flap--down"><span>' + esc(old) + '</span></span><span class="flip__half flip__bottom flip__flap flip__flap--up"><span>' + esc(v) + "</span></span>";
    clearTimeout(el._t); el._t = setTimeout(function () { el.innerHTML = flipFace(v); }, 700);
  }
  function tickClock() {
    var c = clockParts();
    document.querySelectorAll("[data-f]").forEach(function (el) { flipTo(el, c[el.getAttribute("data-f")]); });
    document.querySelectorAll('[data-clock="time"]').forEach(function (el) { el.textContent = clockText(); });
  }
  function clockHtml() {
    var sem = semester(), now = new Date(), c = clockParts();
    return '<div class="clock"><p class="sr">The time is <span data-clock="time">' + esc(clockText()) + "</span>.</p>" +
      '<div class="flipclock" aria-hidden="true">' + flipCard("h1", c.h1) + flipCard("h2", c.h2) + '<span class="flip__colon"><i></i><i></i></span>' + flipCard("m1", c.m1) + flipCard("m2", c.m2) + flipCard("ap", c.ap) + "</div>" +
      '<p class="clock__date" data-clock="date">' + esc(fmtLongDay(now)) + "</p>" +
      (sem.before || sem.after ? "" : '<p class="clock__week">Week ' + sem.week + " of " + sem.weeks + ", " + plural(sem.left, "day") + " left</p>") + "</div>";
  }

  function courseCards(list) {
    var all = items(), now = new Date();
    return list.map(function (c) {
      var mine = all.filter(function (it) { return it.courseId === c.id; }), n = counts(mine);
      var up = mine.filter(function (it) { return !isDone(it) && due(it) && due(it) >= now; }).sort(sortByDue)[0];
      var cs = (n.late ? '<span class="count">' + shape("late") + "<span><b>" + n.late + "</b> overdue</span></span>" : "") +
        '<span class="count">' + shape("todo") + "<span><b>" + n.week + "</b> due in 7 days</span></span>" + '<span class="count">' + shape("done") + "<span><b>" + n.done + "</b> done</span></span>";
      return '<a class="sign" href="#/c/' + esc(c.id) + '">' + cbadge(c, "lg") + '<span><span class="sign__name">' + esc(c.shortName || c.code) + '</span><br><span class="sign__role">' + esc(c.name) + "</span>" +
        '<span class="sign__counts">' + cs + "</span>" +
        (up ? '<p class="sign__next">Next up<b>' + esc(up.title) + "</b>" + esc(fmtDay(due(up)) + ", " + fmtTime(due(up))) + "</p>" : '<p class="sign__next">Nothing coming up.</p>') + "</span></a>";
    }).join("");
  }
  function viewCourses() {
    var shown = visibleCourses(), hidden = state.data.courses.filter(function (c) { return c.hidden === "yes"; });
    return '<div class="wrap"><div class="head"><h1 tabindex="-1">Courses</h1><p>Your ' + esc(cfg.semesterLabel || "") + " courses from bCourses. Open one for everything it has, its announcements and its settings.</p></div>" +
      (shown.length ? '<section class="section" aria-label="Courses"><div class="signs">' + courseCards(shown) + "</div></section>"
        : '<p class="empty">' + (state.data.settings.hasToken ? "No courses yet. They show up after the first bCourses check." : 'No courses yet. <a href="#/about/sync">Connect bCourses</a> and they show up right away.') + "</p>") +
      (hidden.length ? '<section class="section" aria-labelledby="hc-h"><h2 id="hc-h">Hidden courses</h2><p class="section__note">Left off This week, All work, the email and the calendar. Open one to show it again.</p><ul class="hidden-courses">' +
        hidden.map(function (c) { return '<li><a href="#/c/' + esc(c.id) + '">' + chip(c) + "</a> " + esc(c.name) + "</li>"; }).join("") + "</ul></section>" : "") + "</div>";
  }

  /* This week, laptop first: Today leads (your schedule and what's due today), then anything overdue,
     then the rest of the week through Sunday. The side column holds the clock, the month, the semester and announcements. */
  function viewHome() {
    var all = items(), now = new Date(), sem = semester(), today = dayNumber(now), sunday = weekOf(now) + 6;
    var open = all.filter(function (it) { return !isDone(it); }).sort(sortByDue);
    var overdue = open.filter(function (it) { var d = due(it); return d && d < now; });
    var dueToday = open.filter(function (it) { var d = due(it); return d && d >= now && dayNumber(d) === today; });
    var doneToday = all.filter(function (it) { return isDone(it) && due(it) && dayNumber(due(it)) === today; }).length;
    var evsToday = state.data.calendar ? eventsOn(today) : [];
    var rest = open.filter(function (it) { var d = due(it); return d && dayNumber(d) > today && dayNumber(d) <= sunday; });
    var nextWeek = open.filter(function (it) { var d = due(it); return d && dayNumber(d) > sunday && dayNumber(d) <= sunday + 7; }).length;

    var todayHtml = '<section class="today" aria-labelledby="td-h"><div class="today__head"><h2 id="td-h">Today</h2><p>' + esc(fmtLongDay(now)) + "</p></div>" +
      (state.data.calendar ? '<div class="today__block"><h3 class="today__h">Schedule</h3>' +
        (gcal().error ? '<p class="section__note">' + esc(gcal().error) + "</p>" : evsToday.length ? eventList(evsToday) : '<p class="empty empty--tight">Nothing on your calendar today.</p>') + "</div>" : "") +
      '<div class="today__block"><h3 class="today__h">Due today' + (doneToday ? ' <span class="day__count">' + doneToday + " done</span>" : "") + "</h3>" +
      (dueToday.length ? rows(dueToday) : '<p class="empty empty--tight">' + (doneToday ? "All done for today." : "Nothing due today.") + "</p>") + "</div></section>";

    var groups = [];
    for (var dn = today + 1; dn <= sunday; dn++) {
      var list = rest.filter(function (it) { return dayNumber(due(it)) === dn; });
      if (!list.length) continue;
      var d = noonOf(dn), nm = dayName(d);
      groups.push('<div class="day"><h3 class="day__h"><a href="#/d/' + isoDay(dn) + '">' + esc(nm) + "</a>" + (nm === fmtDay(d) ? "" : ' <span class="day__date">' + esc(fmtDay(d)) + "</span>") +
        ' <span class="day__count">' + plural(list.length, "thing") + " due</span></h3>" + rows(list) + "</div>");
    }
    var restHtml = '<section class="section" aria-labelledby="rw-h"><h2 id="rw-h">' + (today === sunday ? "Next week" : "Rest of this week") + "</h2>" +
      (today === sunday ? '<p class="empty">Today is the last day of the week. ' + (nextWeek ? '<a href="#/all">' + plural(nextWeek, "thing") + " due next week</a>." : "Nothing due next week yet.") + "</p>"
        : (groups.length ? groups.join("") : '<p class="empty">Nothing else due through Sunday.</p>') +
          (nextWeek ? '<p class="section__note"><a href="#/all">' + plural(nextWeek, "thing") + " due next week</a></p>" : "")) +
      '<div class="actions"><button type="button" class="btn" data-act="new-todo">Add a to-do</button></div></section>';

    var recent = state.data.announcements.filter(function (n) { return !courseHidden(n.courseId) && n.postedAt && now - new Date(n.postedAt) < 7 * DAY; });
    var rail = '<aside class="rail" aria-label="Clock, calendar and announcements">' +
      '<section class="card" aria-label="Clock and calendar">' + clockHtml() + monthHtml() + "</section>" +
      progressHtml() +
      '<section class="rail__sec" aria-labelledby="hn-h"><h2 id="hn-h">Announcements' + (recent.length ? ' <span class="h-count">' + recent.length + " this week</span>" : "") + "</h2>" +
      (recent.length ? newsCompact(recent.slice(0, 5)) : '<p class="empty">No announcements this week.</p>') +
      '<p class="rail__more"><a href="#/news">All announcements</a></p></section></aside>';

    var weekLeft = rest.length + dueToday.length;
    return '<div class="wrap"><div class="head"><h1 tabindex="-1">This week</h1><p>' + (sem.before || sem.after ? "" : "Week " + sem.week + " of " + sem.weeks + ". ") +
      (overdue.length ? plural(overdue.length, "thing") + " overdue, " : "") + plural(weekLeft, "thing") + " still due through Sunday.</p></div>" +
      '<div class="home"><div class="home__main">' + todayHtml +
      (overdue.length ? '<section class="section section--alert" aria-labelledby="od-h"><h2 id="od-h">Overdue</h2>' + rows(overdue) + "</section>" : "") +
      restHtml + "</div>" + rail + "</div></div>";
  }

  function newsCompact(list) {
    return '<ul class="newsc">' + list.map(function (n) {
      var c = course(n.courseId), at = n.postedAt ? new Date(n.postedAt) : null, url = safeUrl(n.url);
      return '<li data-peek="n:' + esc(n.id) + '"><p class="newsc__meta">' + chip(c) + "<span>" + (at ? esc(dayName(at)) : "") + "</span></p>" +
        (url ? '<a class="newsc__title" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(n.title) + newTab() + "</a>" : '<span class="newsc__title">' + esc(n.title) + "</span>") + "</li>";
    }).join("") + "</ul>";
  }

  /* One day: your calendar and everything due. Reached from the month calendar and the day headings. */
  function viewDay(iso) {
    var dn = dayFromIso(iso);
    if (isNaN(dn)) return notFound("That date isn't right.");
    var d = noonOf(dn), list = items().filter(function (it) { return due(it) && dayNumber(due(it)) === dn; }).sort(sortByDue);
    var evs = eventsOn(dn), open = list.filter(function (it) { return !isDone(it); }), done = list.filter(isDone);
    return '<div class="wrap"><div class="head"><a class="crumb" href="#/">This week</a><h1 tabindex="-1">' + esc(fmtLongDay(d)) + "</h1>" +
      "<p>" + (dn === dayNumber(new Date()) ? "Today. " : "") + plural(open.length, "thing") + " due" + (done.length ? ", " + done.length + " done" : "") + (state.data.calendar ? ", " + plural(evs.length, "event") + " on your calendar" : "") + ".</p>" +
      '<nav class="jump" aria-label="Other days"><a href="#/d/' + isoDay(dn - 1) + '">‹ ' + esc(fmtDay(noonOf(dn - 1))) + '</a><a href="#/d/' + isoDay(dn + 1) + '">' + esc(fmtDay(noonOf(dn + 1))) + " ›</a></nav></div>" +
      (state.data.calendar ? '<section class="section" aria-labelledby="dc-h"><h2 id="dc-h">On your calendar</h2>' + (evs.length ? eventList(evs) : '<p class="empty">Nothing on your calendar.</p>') + "</section>" : "") +
      '<section class="section" aria-labelledby="dd-h"><h2 id="dd-h">Due</h2>' + (open.length ? rows(open) : '<p class="empty">Nothing due.</p>') +
      (done.length ? '<details class="done-list"><summary>Done (' + done.length + ")</summary>" + rows(done) + "</details>" : "") + "</section></div>";
  }

  function viewCourse(id) {
    var c = course(id);
    if (!c) return notFound("That course isn't in the hub. It may have been dropped on bCourses.");
    var now = new Date(), week = new Date(now.getTime() + 7 * DAY);
    var list = state.data.items.filter(function (it) { return it.courseId === id; }).sort(sortByDue);
    var g = { late: [], week: [], later: [], none: [], done: [] };
    list.forEach(function (it) {
      var k = statusKey(it), d = due(it);
      if (k === "done") g.done.push(it); else if (k === "late") g.late.push(it); else if (!d) g.none.push(it); else if (d <= week) g.week.push(it); else g.later.push(it);
    });
    function sec(key, title, empty) {
      if (!g[key].length && !empty) return "";
      return '<section class="section' + (key === "late" ? " section--alert" : "") + '" aria-labelledby="cg-' + key + '"><h2 id="cg-' + key + '">' + title + "</h2>" + (g[key].length ? rows(g[key], true) : '<p class="empty">' + empty + "</p>") + "</section>";
    }
    var news = state.data.announcements.filter(function (n) { return n.courseId === id; });
    var hub = safeUrl(c.hubUrl), url = safeUrl(c.url);
    var score = c.score !== "" && c.score != null ? '<details class="score"><summary>Current score on bCourses</summary><p><b>' + esc(c.score) + "%</b>" + (c.grade ? " (" + esc(c.grade) + ")" : "") + ". It counts only what's been graded, the same way bCourses does.</p></details>" : "";
    return '<div class="wrap"><div class="head"><a class="crumb" href="#/courses">Courses</a>' +
      '<div class="detail__who">' + cbadge(c, "lg") + "<div><h1 tabindex=\"-1\">" + esc(c.shortName || c.code) + "</h1><p>" + esc(c.name) + (c.hidden === "yes" ? ". Hidden from This week and All work." : "") + "</p></div></div>" +
      '<div class="actions">' + (url ? '<a class="btn btn--solid" href="' + esc(url) + '" target="_blank" rel="noopener">Open on bCourses' + newTab() + "</a>" : "") +
      (hub ? '<a class="btn" href="' + esc(hub) + '" target="_blank" rel="noopener">' + esc(c.hubLabel || "Open the team hub") + newTab() + "</a>" : "") +
      '<button type="button" class="btn btn--quiet" data-act="edit-course" data-id="' + esc(c.id) + '">Course settings</button></div>' +
      (c.syncError ? '<p class="error" style="margin-top:12px">' + esc(c.syncError) + "</p>" : "") + score + "</div>" +
      sec("late", "Overdue") + sec("week", "Due in the next 7 days", "Nothing due in the next 7 days.") + sec("later", "Later") + sec("none", "No due date") +
      (g.done.length ? '<section class="section"><details class="done-list"><summary>Done (' + g.done.length + ")</summary>" + rows(g.done, true) + "</details></section>" : "") +
      '<div class="actions" style="margin-top:0"><button type="button" class="btn" data-act="new-todo" data-course="' + esc(c.id) + '">Add a to-do for this course</button></div>' +
      (news.length ? '<section class="section" aria-labelledby="cn-h" style="margin-top:32px"><h2 id="cn-h">Announcements</h2>' + newsList(news, false) + "</section>" : "") + "</div>";
  }

  function viewItem(id) {
    var it = byId(state.data.items, id);
    if (!it) return notFound("This assignment is no longer on bCourses, or the link is wrong.");
    var c = course(it.courseId), d = due(it), k = statusKey(it), mine = it.kind === "mine", team = it.kind === "team";
    var unlock = it.unlockAt && new Date(it.unlockAt) > new Date() ? '<p class="section__note">Opens on bCourses ' + esc(fmtDay(new Date(it.unlockAt))) + ", " + esc(fmtTime(new Date(it.unlockAt))) + ".</p>" : "";
    var canvasLine = "";
    if (team) canvasLine = "Your assignment in the " + teamName() + " Hub" + (it.project ? ", for " + it.project : "") + ". Changing your progress here changes it there too.";
    else if (!mine) {
      if (it.submitted === "yes") canvasLine = "bCourses shows this " + (it.grade === "Excused" ? "excused" : "submitted" + (it.submittedAt ? " " + fmtDay(new Date(it.submittedAt)) + ", " + fmtTime(new Date(it.submittedAt)) : "")) + (it.late === "yes" ? ", marked late" : "") + ".";
      else if (it.missing === "yes") canvasLine = "bCourses marks this missing.";
      else if (noSubmit(it)) canvasLine = "Nothing to turn in on bCourses. Mark it done here once you've finished.";
      else canvasLine = "Not submitted on bCourses yet. It's marked done here on its own once you submit there.";
      if (scoreText(it)) canvasLine += " " + scoreText(it) + ".";
    }
    var opts = [["todo", "To do"], ["doing", "In progress"], ["done", "Done"]].map(function (o) {
      var on = (it.myStatus || "todo") === o[0];
      return '<label><input type="radio" name="status" value="' + o[0] + '"' + (on ? " checked" : "") + "><span>" + o[1] + "</span></label>";
    }).join("");
    var link = safeUrl(it.url), extra = safeUrl(it.link);
    return '<div class="wrap"><div class="detail"><div class="head" style="padding-bottom:0"><a class="crumb" href="' + (c ? "#/c/" + esc(c.id) : "#/") + '">' + esc(c ? c.shortName : "This week") + "</a>" +
      '<div class="detail__who">' + chip(c) + "</div>" +
      '<h1 tabindex="-1">' + esc(it.title) + '</h1><p class="detail__project">' + (mine ? "Your own to-do" : team ? "From the " + esc(teamName()) + " Hub" : "From bCourses") + (pts(it) ? ", " + esc(pts(it)) : "") + "</p></div>" +
      '<div class="due-block"><div class="due-block__when"><p class="due-block__label">Due</p><p class="due-block__date">' + (d ? esc(fmtDay(d)) + "<br>" + esc(fmtTime(d)) : "No due date") + '</p><p class="due-block__rel">' + esc(relDue(d, k === "done")) + '</p></div><div class="due-block__status">' + badge(it) + "</div></div>" +
      unlock + (canvasLine ? '<p class="canvas-line">' + esc(canvasLine) + "</p>" : "") +
      '<div class="actions">' + (link ? '<a class="btn btn--solid" href="' + esc(link) + '" target="_blank" rel="noopener">' + (team ? "Open in the " + esc(teamName()) + " Hub" : "Open on bCourses") + newTab() + "</a>" : "") +
      (extra ? '<a class="btn' + (link ? "" : " btn--solid") + '" href="' + esc(extra) + '" target="_blank" rel="noopener">' + (team ? "Open the document" : "Open the link") + newTab() + "</a>" : "") +
      (d ? '<a class="btn" href="' + esc(calendarUrl(it)) + '" target="_blank" rel="noopener">Add to Google Calendar' + newTab() + "</a>" : "") + "</div>" +
      '<fieldset class="picker"><legend>Your progress</legend><div class="picker__opts" data-status-for="' + esc(it.id) + '">' + opts + "</div></fieldset>" +
      (it.submitted === "yes" && it.myStatus !== "done" ? '<p class="section__note">It counts as done because bCourses shows it submitted.</p>' : "") +
      "<h2>" + (mine ? "Notes" : team ? "What to do" : "Instructions") + "</h2>" + richText(it.description, mine ? "No notes." : team ? "No steps written in the team hub." : "No instructions on bCourses. Open it there for the details.") +
      (mine ? '<div class="actions"><button type="button" class="btn" data-act="edit-todo" data-id="' + esc(it.id) + '">Edit to-do</button></div>' : "") +
      "</div></div>";
  }

  function viewAll() {
    var f = { course: store.get("f.course") || "", show: store.get("f.show") || "open" };
    var now = new Date();
    var list = items().filter(function (it) {
      if (f.course && it.courseId !== f.course) return false;
      return f.show === "all" ? true : f.show === "done" ? isDone(it) : !isDone(it);
    }).sort(sortByDue);
    if (f.show === "done") list.reverse();
    function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + ">" + esc(label) + "</option>"; }
    var toolbar = '<form class="toolbar" id="all-filter" aria-label="Filter the list">' +
      '<div class="field"><label for="f-course">Course</label><select id="f-course" name="course">' + opt("", "All courses", f.course) + visibleCourses().map(function (c) { return opt(c.id, c.shortName, f.course); }).join("") + opt("none", "Personal to-dos", f.course) + "</select></div>" +
      '<div class="field"><label for="f-show">Show</label><select id="f-show" name="show">' + opt("open", "Still to do", f.show) + opt("done", "Done", f.show) + opt("all", "Everything", f.show) + "</select></div>" +
      '<button type="button" class="btn btn--solid" data-act="new-todo">Add a to-do</button></form>';
    if (f.course === "none") list = items().filter(function (it) { return !it.courseId && (f.show === "all" || (f.show === "done") === isDone(it)); }).sort(sortByDue);
    var groups = [], cur = null;
    list.forEach(function (it) {
      var d = due(it), key, label;
      if (!d) { key = "none"; label = "No due date"; }
      else if (!isDone(it) && d < now) { key = "late"; label = "Overdue"; }
      else {
        key = "w" + weekOf(d);
        var monday = new Date(weekOf(d) * DAY + 12 * 3600000), thisWeek = weekOf(now);
        label = weekOf(d) === thisWeek ? "This week" : weekOf(d) === thisWeek + 7 ? "Next week" : weekOf(d) === thisWeek - 7 ? "Last week" : "Week of " + new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(monday);
      }
      if (!cur || cur.key !== key) { cur = { key: key, label: label, list: [] }; groups.push(cur); }
      cur.list.push(it);
    });
    var body = groups.length ? groups.map(function (g) {
      return '<section class="section' + (g.key === "late" ? " section--alert" : "") + '"><h2>' + esc(g.label) + ' <span class="h-count">' + g.list.length + "</span></h2>" + rows(g.list, !!f.course) + "</section>";
    }).join("") : '<p class="empty">' + (f.show === "done" ? "Nothing done yet with these filters." : "Nothing left to do with these filters.") + "</p>";
    return '<div class="wrap"><div class="head"><h1 tabindex="-1">All work</h1><p>Every assignment from bCourses and your own to-dos, by week.</p></div>' + toolbar + body + "</div>";
  }

  function newsList(list, withCourse) {
    return '<ul class="news">' + list.map(function (n) {
      var c = course(n.courseId), at = n.postedAt ? new Date(n.postedAt) : null, url = safeUrl(n.url);
      var preview = plainPreview(n.message, 220), long = String(n.message || "").length > 240;
      return '<li class="news__item"><p class="news__meta">' + (withCourse ? chip(c) : "") + "<span>" + (at ? esc(dayName(at)) + ", " + esc(fmtTime(at)) : "") + "</span>" + (n.author ? "<span>" + esc(n.author) + "</span>" : "") + "</p>" +
        '<h3 class="news__title">' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(n.title) + newTab() + "</a>" : esc(n.title)) + "</h3>" +
        (long ? '<details class="news__more"><summary><span class="news__preview">' + esc(preview) + '</span><span class="news__toggle">Read it all</span></summary><div class="news__body">' + richText(n.message) + "</div></details>"
          : '<div class="news__body">' + richText(n.message) + "</div>") + "</li>";
    }).join("") + "</ul>";
  }
  function viewNews() {
    var f = store.get("f.ncourse") || "";
    var list = state.data.announcements.filter(function (n) { return !courseHidden(n.courseId) && (!f || n.courseId === f); });
    function opt(v, label) { return '<option value="' + esc(v) + '"' + (v === f ? " selected" : "") + ">" + esc(label) + "</option>"; }
    return '<div class="wrap"><div class="head"><h1 tabindex="-1">Announcements</h1><p>From the last 30 days of bCourses, newest first. Each title opens the announcement on bCourses.</p></div>' +
      '<form class="toolbar" id="news-filter" aria-label="Filter announcements"><div class="field"><label for="f-ncourse">Course</label><select id="f-ncourse" name="ncourse">' + opt("", "All courses") + visibleCourses().map(function (c) { return opt(c.id, c.shortName); }).join("") + "</select></div></form>" +
      (list.length ? newsList(list, !f) : '<p class="empty">No announcements in the last 30 days.</p>') + "</div>";
  }

  var EMAIL_OPTS = [["daily", "Daily", "Only on days something is due soon, overdue, new or announced"], ["weekly", "Mondays only", "One email with the whole week"], ["off", "Off", "No emails"]];
  function viewAbout() {
    var s = state.data.settings, cur = s.emailPref || "daily";
    function faq(q, a) { return '<details class="faq"><summary>' + q + '</summary><div class="faq__a">' + a + "</div></details>"; }
    var legend = [["todo", "To do", "Not started, and not due yet."], ["doing", "In progress", "You marked it as started."], ["done", "Submitted or Done", "Submitted on bCourses, or you marked it done here."], ["late", "Overdue or Missing", "The due date passed and it isn't done. Missing means bCourses flags it too."]].map(function (x) {
      return '<li><span class="st legend__k">' + shape(x[0]) + x[1] + '</span><span class="legend__v">' + x[2] + "</span></li>";
    }).join("");
    var last = s.lastSyncOk ? fmtDay(new Date(s.lastSyncOk)) + ", " + fmtTime(new Date(s.lastSyncOk)) : "never";
    return '<div class="wrap"><div class="head"><h1 tabindex="-1">About and settings</h1><p>Your ' + esc(cfg.semesterLabel || "") + ' classes in one place. The hub reads bCourses every 2 hours and keeps a copy in a Google Sheet. It only reads: it never submits, posts or changes anything on bCourses.</p></div>' +
      syncSection(s, last) + teamSection(s) + calendarsSection() +
      '<section class="section" id="email" aria-labelledby="email-h"><h2 id="email-h" tabindex="-1">Morning email</h2>' +
      '<p class="section__note">Comes at 8 AM, only on days with something to say: what\'s overdue, what\'s due in the next 2 days, assignments new on bCourses, and announcements. Each item links to its page here.</p>' +
      '<fieldset class="picker picker--email"><legend class="sr">How often you get the morning email</legend><div class="picker__opts" data-email>' +
      EMAIL_OPTS.map(function (o) { return '<label><input type="radio" name="emailPref" value="' + o[0] + '"' + (o[0] === cur ? " checked" : "") + "><span><b>" + o[1] + "</b><small>" + o[2] + "</small></span></label>"; }).join("") +
      '</div></fieldset><div class="actions"><button type="button" class="btn" data-act="send-digest"' + (state.demo ? " disabled" : "") + ">Email me the summary now</button></div></section>" +
      '<section class="section" aria-labelledby="sym-h"><h2 id="sym-h">What the symbols mean</h2><p class="section__note">Each status has its own shape and word, and each course its own number on its badge, so color is never the only clue.</p><ul class="legend">' + legend + "</ul></section>" +
      '<section class="section" aria-labelledby="faq-h"><h2 id="faq-h">Questions</h2>' +
      faq("An assignment I can see on bCourses isn't here.", "<p>The hub checks every 2 hours, so it may just be new: use <b>Check bCourses now</b> above. If it still doesn't show, the course may hide its Assignments page from students (the course page says so), or the work lives on another site like Gradescope. Add it yourself with <b>Add a to-do</b>.</p>") +
      faq("Something I turned in still shows as not done.", "<p>Things turned in on paper, in class or on another site don't show as submitted on bCourses. Open it here and set <b>Your progress</b> to Done. Anything you submit on bCourses is marked done on its own at the next check.</p>") +
      faq("A course I'm not really taking shows up.", "<p>Open the course, choose <b>Course settings</b>, and tick <b>Hide this course</b>. Its work drops off This week, All work, the email and the calendar.</p>") +
      faq("Is the bCourses token safe?", "<p>When you paste it under bCourses above, it goes once, over a secure connection, to the hub's backend in your Google account, which keeps it in its private settings. From then on it's only ever sent to bcourses.berkeley.edu. The site can replace the token but can't show it, so even someone with your access code couldn't see it. It's never in the GitHub repo or the Sheet. The hub only reads from bCourses. Keep your access code private, and if it ever leaks, change ACCESS_CODE in the Apps Script project.</p>") +
      faq("bCourses says the token stopped working.", "<p>Tokens expire on the date you picked when you made one, or stop when regenerated. Make a new one in bCourses and paste it under <a href=\"#/about/sync\">bCourses</a> on this page, with <b>Replace the bCourses token</b>. You can do this from your phone.</p>") +
      faq("Where's the team work for DevEng C200?", "<p>Your assignments from the Microbe Busters Hub show up here under DevEng C200, with a " + '<span class="tag-team">' + esc(teamName()) + "</span> tag, once the team code is added above. Marking one done here marks it done there too. The team's meetings, deliverables and files stay in the Microbe Busters Hub; the course page has a button to it.</p>") +
      faq("Which calendar events show up, and who can see them?", "<p>Events from the Google calendars you have switched on in Google Calendar, for the account that runs the hub, from last week to six weeks ahead. Choose which ones above. Only titles, times, places and meeting links come through, never descriptions or guest lists. Anyone with your access code can see them, so keep it private. A calendar from another account (your berkeley.edu one, say) shows up once you add it to this account's Google Calendar.</p>") +
      faq("Does it work on my phone, with a screen reader, or in dark mode?", "<p>Yes. It fits small screens, follows your device's dark mode, and works with a keyboard and screen readers.</p>") +
      "</section></div>";
  }

  /* bCourses: connection status, the token box, and Check now. The token is sent once to the backend
     and never comes back, so this page can replace it but can't show it. */
  function syncSection(s, last) {
    var connected = !!s.hasToken, since = s.tokenSetAt ? fmtDay(new Date(s.tokenSetAt), true) : "";
    var status = connected
      ? '<p class="conn conn--on">' + shape("done") + "<span><b>Connected</b>" + (state.data.me.name ? " as " + esc(state.data.me.name) : "") + (since ? ", token added " + esc(since) : "") + ". Last read " + esc(last) + ".</span></p>"
      : '<p class="conn">' + shape("todo") + "<span><b>Not connected yet.</b> Paste a bCourses token below to start.</span></p>";
    var steps = '<ol class="steps token-steps"><li>In bCourses, open <b>Account</b>, then <b>Settings</b>.</li>' +
      '<li>Under Approved Integrations, choose <b>New Access Token</b>. For Purpose write "Classes Hub", and set the expiry after the semester ends (' + esc(fmtDay(semester().end, true)) + ").</li>" +
      "<li>Copy the token bCourses shows (it starts with a number and a ~) and paste it here. bCourses only shows it once.</li></ol>";
    var form = '<form class="token-form" id="token-form" autocomplete="off">' +
      '<div class="field"><label for="token-input">' + (connected ? "Replace the bCourses token" : "bCourses token") + "</label>" +
      '<input id="token-input" name="token-input" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" required' + (state.demo ? " disabled" : "") + ">" +
      "<small>Checked with bCourses before it's saved. Once saved, it can't be shown again, here or anywhere else on the site.</small></div>" +
      '<div class="actions" style="margin-top:0"><button type="submit" class="btn btn--solid"' + (state.demo ? " disabled" : "") + ">" + (connected ? "Replace token" : "Connect bCourses") + "</button>" +
      (connected ? '<button type="button" class="btn btn--quiet" data-act="clear-token">Disconnect bCourses</button>' : "") + "</div></form>";
    return '<section class="section" id="sync" aria-labelledby="sync-h"><h2 id="sync-h" tabindex="-1">bCourses</h2>' + status +
      (s.syncError ? '<p class="error">' + esc(s.syncError) + "</p>" : "") +
      (connected ? '<div class="actions"><button type="button" class="btn" data-act="sync-now"' + (state.demo ? " disabled" : "") + ">Check bCourses now</button></div>" : "") +
      (connected ? '<details class="token-more"><summary>Replace or remove the token</summary>' + steps + form + "</details>" : steps + form) +
      (state.demo ? '<p class="section__note">The token box is off in demo mode.</p>' : "") +
      (store.get("code") ? '<div class="actions"><button type="button" class="btn btn--quiet" data-act="forget-code">Forget the access code on this device</button></div>' : "") +
      (s.calendar === false ? "" : '<p class="section__note" style="margin-top:16px">Every due date is also on your "' + esc((cfg.semesterLabel || "") + " classes") + '" Google Calendar, which the hub keeps up to date. Nobody is invited to those events.</p>') + "</section>";
  }
  /* The Microbe Busters Hub: your assignments there, filed under DevEng C200. The team code works like the token: saved, never shown. */
  function teamSection(s) {
    var t = s.teamHub;
    if (!t) return "";
    var mine = state.data.items.filter(function (x) { return x.kind === "team"; }).length;
    var status = t.connected
      ? '<p class="conn conn--on">' + shape("done") + "<span><b>Connected.</b> " + plural(mine, "assignment") + " of yours" + (t.lastSync ? ", checked " + esc(dayName(new Date(t.lastSync)).toLowerCase() === "today" ? "today at " + fmtTime(new Date(t.lastSync)) : fmtDay(new Date(t.lastSync))) : "") + ".</span></p>"
      : '<p class="conn">' + shape("todo") + "<span><b>Not connected.</b> Add the team code to bring your " + esc(teamName()) + " assignments in here.</span></p>";
    var form = '<form class="token-form" id="team-form" autocomplete="off"><div class="field"><label for="team-input">' + (t.connected ? "Replace the team code" : "Team code") + "</label>" +
      '<input id="team-input" name="team-input" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" required' + (state.demo ? " disabled" : "") + ">" +
      "<small>The same code your team enters in the " + esc(t.name) + ". Checked with it before it's saved, and never shown again.</small></div>" +
      '<div class="actions" style="margin-top:0"><button type="submit" class="btn btn--solid"' + (state.demo ? " disabled" : "") + ">" + (t.connected ? "Replace code" : "Connect") + "</button>" +
      (t.connected ? '<button type="button" class="btn btn--quiet" data-act="clear-team">Disconnect</button>' : "") + "</div></form>";
    return '<section class="section" id="team" aria-labelledby="team-h"><h2 id="team-h" tabindex="-1">' + esc(t.name) + "</h2>" + status +
      (t.error ? '<p class="error">' + esc(t.error) + "</p>" : "") +
      '<p class="section__note">Your assignments there show up under DevEng C200 with a <span class="tag-team">' + esc(teamName()) + "</span> tag. Marking one done here marks it done there too." +
      (safeUrl(t.url) ? ' <a href="' + esc(t.url) + '" target="_blank" rel="noopener">Open the ' + esc(t.name) + newTab() + "</a>" : "") + "</p>" +
      (t.connected ? '<details class="token-more"><summary>Replace or remove the team code</summary>' + form + "</details>" : form) + "</section>";
  }
  function calendarsSection() {
    var g = state.data.calendar;
    if (!g) return "";
    var list = g.calendars.length ? '<fieldset class="checks cal-list"><legend>Show events from</legend>' + g.calendars.map(function (c, i) {
      return '<label class="check"><input type="checkbox" name="cal" value="' + esc(c.id) + '" id="cal-' + i + '"' + (c.included ? " checked" : "") + "> " + esc(c.name) + (c.primary ? " (your main calendar)" : "") + "</label>";
    }).join("") + '</fieldset><div class="actions"><button type="button" class="btn" data-act="save-calendars"' + (state.demo ? " disabled" : "") + ">Save calendar choices</button></div>" : '<p class="empty">No calendars found.</p>';
    return '<section class="section" id="calendars" aria-labelledby="gc-h"><h2 id="gc-h" tabindex="-1">Google Calendar</h2>' +
      '<p class="section__note">Two ways. <b>In:</b> events from the calendars you pick here show on This week, the month calendar and each day\'s page, read only. <b>Out:</b> every due date goes onto your "' + esc((cfg.semesterLabel || "") + " classes") + '" calendar, which is left off this list so nothing shows twice.</p>' +
      (g.error ? '<p class="error">' + esc(g.error) + "</p>" : "") + list + "</section>";
  }
  function saveTeamCode(form) {
    var input = form.querySelector("#team-input"), btn = form.querySelector('[type="submit"]'), code = input.value.trim();
    input.value = "";
    var old = form.querySelector(".error"); if (old) old.remove();
    if (!code) { input.focus(); return; }
    var label = btn.textContent; btn.disabled = true; btn.classList.add("is-working"); btn.textContent = "Checking the code";
    apiPost({ action: "setTeamCode", teamCode: code }, "Checking the team code").then(function (r) {
      code = "";
      if (r.data) setData(r.data);
      refresh(); var h = document.getElementById("team-h"); if (h) h.focus();
      toast(teamName() + " connected. " + plural((r.result || {}).items || 0, "assignment") + " of yours came in.");
    }).catch(function (e) {
      code = ""; btn.disabled = false; btn.classList.remove("is-working"); btn.textContent = label;
      var err = document.createElement("p"); err.className = "error"; err.setAttribute("role", "alert"); err.textContent = e.message || "The code wasn't saved.";
      form.appendChild(err); input.focus();
    });
  }
  function saveCalendars(btn) {
    var boxes = Array.prototype.slice.call(document.querySelectorAll('.cal-list input[name="cal"]'));
    var exclude = boxes.filter(function (b) { return !b.checked; }).map(function (b) { return b.value; });
    btn.disabled = true;
    apiPost({ action: "saveCalendars", exclude: exclude }, "Saving").then(function (r) {
      if (r.calendar) state.data.calendar = r.calendar;
      btn.disabled = false; toast("Calendar choices saved");
    }).catch(function (e) { btn.disabled = false; toast("Not saved: " + e.message); });
  }

  function saveToken(form) {
    var input = form.querySelector("#token-input"), btn = form.querySelector('[type="submit"]'), token = input.value.replace(/\s+/g, "");
    input.value = "";   // never left sitting in the page
    var old = form.querySelector(".error"); if (old) old.remove();
    if (!token) { input.focus(); return; }
    var label = btn.textContent; btn.disabled = true; btn.classList.add("is-working"); btn.textContent = "Checking with bCourses";
    apiPost({ action: "setToken", token: token }, "Checking the token with bCourses").then(function (r) {
      token = "";
      if (r.data) setData(r.data);
      refresh();
      var h = document.getElementById("sync-h"); if (h) h.focus();
      var res = r.result || {};
      toast("bCourses connected" + (r.name ? " as " + r.name : "") + (res.courses != null ? ". Read " + plural(res.courses, "course") + " and " + plural(res.items || 0, "assignment") : ""));
    }).catch(function (e) {
      token = "";
      btn.disabled = false; btn.classList.remove("is-working"); btn.textContent = label;
      var err = document.createElement("p"); err.className = "error"; err.setAttribute("role", "alert"); err.textContent = e.message || "The token wasn't saved.";
      form.appendChild(err); input.focus();
    });
  }
  function confirmClearToken() {
    openDialog('<form method="dialog">' + dlgHead("Disconnect bCourses?") + '<div class="dlg__body"><p>The hub stops reading bCourses until you paste a new token. Everything it already read stays here.</p>' +
      "<p>This removes the token from the hub only. To switch it off on bCourses too, delete it under Account, then Settings, on bCourses.</p></div>" +
      '<div class="dlg__foot"><button type="button" class="btn" data-close>Keep it connected</button><button type="submit" class="btn btn--solid">Disconnect</button></div></form>', function () {
      return apiPost({ action: "clearToken" }).then(function (r) {
        state.data.settings.hasToken = false; state.data.settings.tokenSetAt = ""; showNotice(); refresh();
        toast("bCourses disconnected" + (r.demo ? " (demo, nothing changed)" : ""));
      });
    });
  }

  function viewGate(msg) {
    return '<div class="wrap"><form class="gate" id="gate"><h1 tabindex="-1">Enter your access code</h1><p>It\'s in the Apps Script execution log from setup, and under Script properties as ACCESS_CODE. You only need to enter it once on each device.</p>' +
      '<div class="field"><label for="code">Access code</label><input id="code" type="password" autocomplete="current-password" required></div>' +
      (msg ? '<p class="error" role="alert">' + esc(msg) + "</p>" : "") + '<div><button class="btn btn--solid" type="submit">Continue</button></div></form></div>';
  }
  function notFound(msg) {
    return '<div class="wrap"><div class="head"><a class="crumb" href="#/">This week</a><h1 tabindex="-1">Not found</h1><p>' + esc(msg) + "</p></div></div>";
  }

  /* ---------- router ---------- */
  function route() {
    var h = location.hash.replace(/^#\/?/, "").split("/");
    var view = h[0] || "home";
    document.querySelectorAll("[data-nav]").forEach(function (a) {
      var on = a.getAttribute("data-nav") === (view === "c" ? "courses" : view === "i" || view === "d" ? "home" : view);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (!state.data) return;
    var html, title = "Classes Hub";
    if (view === "c") { var c = course(h[1]); html = viewCourse(h[1]); if (c) title = c.shortName; }
    else if (view === "i") { var it = byId(state.data.items, h[1]); html = viewItem(h[1]); if (it) title = it.title; }
    else if (view === "all") { html = viewAll(); title = "All work"; }
    else if (view === "courses") { html = viewCourses(); title = "Courses"; }
    else if (view === "d") { html = viewDay(h[1]); var dd = dayFromIso(h[1]); if (!isNaN(dd)) title = fmtLongDay(noonOf(dd)); }
    else if (view === "news") { html = viewNews(); title = "Announcements"; }
    else if (view === "about") { html = viewAbout(); title = "About and settings"; }
    else { html = viewHome(); }
    hidePeek(true);
    main.innerHTML = html;
    document.title = title + (title === "Classes Hub" ? "" : " | Classes Hub");
    var h1 = main.querySelector("h1");
    if (route._moved && h1 && !route._keepFocus) h1.focus({ preventScroll: true });
    route._moved = true;
    if (!route._keepFocus) window.scrollTo(0, 0);
    route._keepFocus = false;
    if (!route._keepFocus) reveal();
    if (view === "about" && h[1]) { var sec = document.getElementById(h[1]); if (sec) { sec.scrollIntoView(); var hd = sec.querySelector("h2"); if (hd) hd.focus({ preventScroll: true }); } }
  }
  /* Re-render in place (after a save or a filter change) without jumping to the top. */
  function refresh() { var y = window.scrollY; route._keepFocus = true; route(); window.scrollTo(0, y); }

  /* ---------- writes ---------- */
  function setStatus(id, status) {
    var it = byId(state.data.items, id); if (!it) return;
    var prev = it.myStatus;
    it.myStatus = status; refresh();
    var radio = main.querySelector('[data-status-for] input[value="' + status + '"]'); if (radio) radio.focus();
    apiPost({ action: "setStatus", id: id, status: status }).then(function (r) {
      toast("Marked " + LABEL[status].toLowerCase() + (r.demo ? " (demo, not saved)" : ""));
    }).catch(function (e) { it.myStatus = prev; refresh(); toast("Not saved: " + e.message); });
  }
  function setEmailPref(pref) {
    var s = state.data.settings, prev = s.emailPref; s.emailPref = pref;
    apiPost({ action: "setEmailPref", pref: pref }).then(function (r) {
      toast("Morning email: " + EMAIL_OPTS.filter(function (o) { return o[0] === pref; })[0][1] + (r.demo ? " (demo, not saved)" : ""));
    }).catch(function (e) { s.emailPref = prev; refresh(); toast("Not saved: " + e.message); });
  }

  function openDialog(html, onSubmit) {
    var opener = document.activeElement;
    var dlg = document.createElement("dialog");
    dlg.innerHTML = html;
    document.body.appendChild(dlg);
    var close = function () { dlg.close(); };
    dlg.addEventListener("close", function () { if (dlg.parentNode) dlg.remove(); if (opener && document.contains(opener)) opener.focus(); });
    dlg.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", close); });
    var form = dlg.querySelector("form");
    if (form) form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var fd = new FormData(form), vals = {};
      fd.forEach(function (v, k) { vals[k] = v; });
      var btn = form.querySelector('[type="submit"]'), btnText = btn ? btn.textContent : "";
      var reset = function () { if (btn) { btn.disabled = false; btn.classList.remove("is-working"); btn.textContent = btnText; } };
      if (btn) { btn.disabled = true; btn.classList.add("is-working"); btn.textContent = state.demo ? btnText : "Working on it"; }
      Promise.resolve(onSubmit(vals, dlg)).then(function (ok) { if (ok !== false) close(); else reset(); })
        .catch(function (e) {
          reset();
          var err = form.querySelector(".error") || document.createElement("p");
          err.className = "error"; err.setAttribute("role", "alert"); err.textContent = "Not saved: " + (e && e.message ? e.message : "try again.");
          form.querySelector(".dlg__body").appendChild(err);
        });
    });
    dlg.showModal();
    var firstInput = dlg.querySelector("input:not([type=hidden]), select, textarea");
    if (firstInput) firstInput.focus();
    return dlg;
  }
  function dlgHead(title) { return '<div class="dlg__head"><h2>' + esc(title) + '</h2><button type="button" data-close aria-label="Close">×</button></div>'; }

  function todoForm(it, courseId) {
    var editing = !!it;
    it = it || { courseId: courseId || "", title: "", due: "", description: "", link: "" };
    var lp = localParts(it.due);
    var opts = '<option value="">No course (personal)</option>' + visibleCourses().map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === it.courseId ? " selected" : "") + ">" + esc(c.shortName) + "</option>"; }).join("");
    return '<form method="dialog">' + dlgHead(editing ? "Edit to-do" : "Add a to-do") + '<div class="dlg__body">' +
      '<p class="section__note" style="margin:0">For anything that isn\'t an assignment on bCourses: a reading, a lab slot, a Gradescope upload, a personal deadline.</p>' +
      '<div class="field"><label for="td-title">What</label><input id="td-title" name="title" type="text" required maxlength="300" value="' + esc(it.title) + '"><small>Start with a verb, for example "Read chapter 4".</small></div>' +
      '<div class="field"><label for="td-course">Course</label><select id="td-course" name="courseId">' + opts + "</select></div>" +
      '<div class="two"><div class="field"><label for="td-date">Due date</label><input id="td-date" name="date" type="date" value="' + esc(lp.date) + '"><small>Optional.</small></div><div class="field"><label for="td-time">Due time</label><input id="td-time" name="time" type="time" value="' + esc(lp.time) + '"></div></div>' +
      '<div class="field"><label for="td-notes">Notes</label><textarea id="td-notes" name="description" style="min-height:110px">' + esc(it.description) + "</textarea><small>Start lines with a dash for a list.</small></div>" +
      '<div class="field"><label for="td-link">Link</label><input id="td-link" name="link" type="url" value="' + esc(it.link) + '" placeholder="https://"><small>Optional, for example the reading or the Gradescope page.</small></div>' +
      '</div><div class="dlg__foot">' + (editing ? '<button type="button" class="btn btn--danger" data-act="delete-todo" data-id="' + esc(it.id) + '">Delete to-do</button>' : "") +
      '<button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn--solid">' + (editing ? "Save changes" : "Add to-do") + "</button></div></form>";
  }
  function saveTodo(existing, v) {
    var it = Object.assign({}, existing || { id: newId("m"), kind: "mine", myStatus: "todo", firstSeenAt: new Date().toISOString() },
      { title: String(v.title || "").trim(), courseId: v.courseId || "", due: v.date ? zonedIso(v.date, v.time) : "", description: v.description || "", link: v.link || "" });
    if (!it.title) return Promise.reject(new Error("Give the to-do a title."));
    return apiPost({ action: "saveTodo", item: it }).then(function (r) {
      var saved = r.item || it, i = state.data.items.findIndex(function (x) { return x.id === (existing ? existing.id : it.id); });
      if (i > -1) state.data.items[i] = saved; else state.data.items.push(saved);
      if (!existing) location.hash = "#/i/" + saved.id; else refresh();
      toast((existing ? "Saved" : "To-do added") + (r.demo ? " (demo, not saved)" : ""));
    });
  }
  function confirmDeleteTodo(id) {
    var it = byId(state.data.items, id); if (!it) return;
    openDialog('<form method="dialog">' + dlgHead("Delete this to-do?") + '<div class="dlg__body"><p><b>' + esc(it.title) + "</b> will be removed from the hub and from your calendar. This can't be undone.</p></div>" +
      '<div class="dlg__foot"><button type="button" class="btn" data-close>Keep it</button><button type="submit" class="btn btn--solid">Delete to-do</button></div></form>', function () {
      return apiPost({ action: "deleteTodo", id: id }).then(function (r) {
        var c = it.courseId;
        state.data.items = state.data.items.filter(function (x) { return x.id !== id; });
        location.hash = c ? "#/c/" + c : "#/";
        toast("Deleted" + (r.demo ? " (demo, not saved)" : ""));
      });
    });
  }

  function courseForm(c) {
    return '<form method="dialog">' + dlgHead("Course settings") + '<div class="dlg__body">' +
      '<p style="margin:0"><b>' + esc(c.name) + "</b><br><small>" + esc(c.code) + "</small></p>" +
      '<div class="field"><label for="cs-short">Short name</label><input id="cs-short" name="shortName" type="text" maxlength="40" required value="' + esc(c.shortName) + '"><small>Used on badges, rows, the email and the calendar. The number at the end goes on the course badge.</small></div>' +
      '<label class="check"><input type="checkbox" name="hidden" value="yes"' + (c.hidden === "yes" ? " checked" : "") + "> Hide this course (for example a department site you're not taking as a class)</label>" +
      '<div class="field"><label for="cs-hub">Team hub link</label><input id="cs-hub" name="hubUrl" type="url" value="' + esc(c.hubUrl) + '" placeholder="https://"><small>Adds a button to this course page, like the one to the Microbe Busters Hub.</small></div>' +
      '<div class="field"><label for="cs-hublabel">Button text</label><input id="cs-hublabel" name="hubLabel" type="text" maxlength="60" value="' + esc(c.hubLabel) + '" placeholder="Open the team hub"></div>' +
      '</div><div class="dlg__foot"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn--solid">Save</button></div></form>';
  }
  function saveCourse(c, v) {
    var next = Object.assign({}, c, { shortName: String(v.shortName || "").trim() || c.shortName, hidden: v.hidden ? "yes" : "", hubUrl: v.hubUrl || "", hubLabel: v.hubUrl ? v.hubLabel || "" : "" });
    return apiPost({ action: "saveCourse", course: next }).then(function (r) {
      Object.assign(c, r.course || next); showNotice(); refresh();
      toast("Course saved" + (r.demo ? " (demo, not saved)" : ""));
    });
  }

  /* ---------- events ---------- */
  document.addEventListener("change", function (ev) {
    var t = ev.target;
    if (t.name === "status" && t.closest("[data-status-for]")) setStatus(t.closest("[data-status-for]").getAttribute("data-status-for"), t.value);
    if (t.name === "emailPref" && t.closest("[data-email]")) setEmailPref(t.value);
    if (t.closest && t.closest("#all-filter")) {
      store.set("f.course", document.getElementById("f-course").value);
      store.set("f.show", document.getElementById("f-show").value);
      refresh(); var again = document.getElementById(t.id); if (again) again.focus();
    }
    if (t.id === "show-events") { store.set("showEvents", t.checked ? "1" : "0"); refresh(); var se = document.getElementById("show-events"); if (se) se.focus(); }
    if (t.id === "f-ncourse") { store.set("f.ncourse", t.value); refresh(); var n = document.getElementById("f-ncourse"); if (n) n.focus(); }
  });
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-act]"); if (!b) return;
    var act = b.getAttribute("data-act"), id = b.getAttribute("data-id");
    if (act === "new-todo") openDialog(todoForm(null, b.getAttribute("data-course")), function (v) { return saveTodo(null, v); });
    if (act === "edit-todo") { var it = byId(state.data.items, id); openDialog(todoForm(it), function (v) { return saveTodo(it, v); }); }
    if (act === "delete-todo") { ev.preventDefault(); var d = b.closest("dialog"); if (d) d.close(); confirmDeleteTodo(id); }
    if (act === "edit-course") { var c = course(id); openDialog(courseForm(c), function (v) { return saveCourse(c, v); }); }
    if (act === "forget-code") { store.del("code"); toast("Access code removed from this device"); start(); }
    if (act === "sync-now") {
      b.disabled = true; b.classList.add("is-working"); b.textContent = "Checking bCourses";
      apiPost({ action: "syncNow" }, "Checking bCourses").then(function (r) {
        if (r.data) setData(r.data);
        refresh(); toast(r.result ? "Read " + plural(r.result.courses, "course") + " and " + plural(r.result.items, "assignment") : "Checked bCourses");
      }).catch(function (e) { toast("Couldn't check bCourses: " + e.message); refresh(); });
    }
    if (act === "clear-token") confirmClearToken();
    if (act === "clear-team") {
      openDialog('<form method="dialog">' + dlgHead("Disconnect the " + teamName() + " Hub?") + '<div class="dlg__body"><p>Your team assignments leave this hub. Nothing changes in the team hub itself.</p></div>' +
        '<div class="dlg__foot"><button type="button" class="btn" data-close>Keep it connected</button><button type="submit" class="btn btn--solid">Disconnect</button></div></form>', function () {
        return apiPost({ action: "clearTeamCode" }).then(function () {
          state.data.items = state.data.items.filter(function (x) { return x.kind !== "team"; });
          if (state.data.settings.teamHub) state.data.settings.teamHub.connected = false;
          refresh(); toast("Disconnected");
        });
      });
    }
    if (act === "save-calendars") saveCalendars(b);
    if (act === "cal-prev" || act === "cal-next" || act === "cal-today") {
      var p0 = parts(new Date()), cur = calMonth || { y: +p0.year, m: +p0.month };
      if (act === "cal-today") calMonth = null;
      else { var m2 = cur.m + (act === "cal-next" ? 1 : -1), y2 = cur.y; if (m2 < 1) { m2 = 12; y2--; } if (m2 > 12) { m2 = 1; y2++; } calMonth = (y2 === +p0.year && m2 === +p0.month) ? null : { y: y2, m: m2 }; }
      var box = document.getElementById("month");
      if (box) { box.outerHTML = monthHtml(); var again = document.querySelector('#month [data-act="' + (act === "cal-today" ? "cal-next" : act) + '"]'); if (again) again.focus(); }
    }
    if (act === "send-digest") {
      b.disabled = true;
      apiPost({ action: "sendDigest" }, "Sending").then(function (r) { toast(r.sent ? "Sent. Check your inbox." : "Nothing to send right now."); })
        .catch(function (e) { toast("Not sent: " + e.message); }).then(function () { b.disabled = false; });
    }
  });
  document.addEventListener("submit", function (ev) {
    if (ev.target.id === "all-filter" || ev.target.id === "news-filter") { ev.preventDefault(); return; }
    if (ev.target.id === "token-form") { ev.preventDefault(); saveToken(ev.target); return; }
    if (ev.target.id === "team-form") { ev.preventDefault(); saveTeamCode(ev.target); return; }
    if (ev.target.id !== "gate") return;
    ev.preventDefault();
    store.set("code", document.getElementById("code").value.trim());
    start();
  });
  window.addEventListener("hashchange", route);

  /* ---------- previews: hover a row (or focus it with the keyboard) to see what it's about ----------
     Same behavior as the explainer boxes on gregor-posadas.github.io: a short delay, a boxed card that fades in,
     placed below (or above, if there's no room) and never clipped. Escape closes it. Touch screens skip it: tapping opens the page. */
  var peekEl = document.getElementById("peek"), peekOn = null, peekTimer = null;
  var canHover = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  function peekContent(key) {
    var kind = key.slice(0, 1), id = key.slice(2);
    if (kind === "i") {
      var it = byId(state.data.items, id); if (!it) return "";
      var c = course(it.courseId), d = due(it), desc = plainPreview(it.description, 340);
      var src = it.kind === "team" ? "From the " + teamName() + " Hub" + (it.project ? ", " + it.project : "") : it.kind === "mine" ? "Your to-do" : "From bCourses";
      return '<p class="peek__meta">' + chip(c) + badge(it) + "</p><p class=\"peek__title\">" + esc(it.title) + "</p>" +
        '<p class="peek__when">' + (d ? esc(fmtDay(d)) + ", " + esc(fmtTime(d)) + ". " + esc(relDue(d, isDone(it))) : "No due date") + (pts(it) ? ". " + esc(pts(it)) : "") + "</p>" +
        (desc ? '<p class="peek__body">' + esc(desc) + "</p>" : '<p class="peek__body peek__body--none">' + (it.kind === "canvas" ? "No instructions on bCourses." : "No notes.") + "</p>") +
        '<p class="peek__foot">' + esc(src) + ". Open it for everything.</p>";
    }
    if (kind === "n") {
      var n = byId(state.data.announcements, id); if (!n) return "";
      var at = n.postedAt ? new Date(n.postedAt) : null;
      return '<p class="peek__meta">' + chip(course(n.courseId)) + "<span>" + (at ? esc(dayName(at)) + ", " + esc(fmtTime(at)) : "") + "</span></p><p class=\"peek__title\">" + esc(n.title) + "</p>" +
        '<p class="peek__body">' + esc(plainPreview(n.message, 420)) + "</p>" + '<p class="peek__foot">' + (n.author ? esc(n.author) + ". " : "") + "Opens on bCourses.</p>";
    }
    if (kind === "d") {
      var dn = dayFromIso(id); if (isNaN(dn)) return "";
      var dl = items().filter(function (it) { return due(it) && dayNumber(due(it)) === dn; }).sort(sortByDue);
      var openD = dl.filter(function (it) { return !isDone(it); }), doneD = dl.length - openD.length, evD = state.data.calendar ? eventsOn(dn) : [];
      var li = function (t, sub) { return "<li>" + t + (sub ? '<span class="peek__sub">' + sub + "</span>" : "") + "</li>"; };
      var dueHtml = openD.length ? '<ul class="peek__list">' + openD.slice(0, 5).map(function (it) {
        var c = course(it.courseId); return li(cbadge(c, "sm") + " <b>" + esc(it.title) + "</b>", esc(fmtTime(due(it))) + (statusKey(it) === "late" ? ", " + esc(statusWord(it).toLowerCase()) : ""));
      }).join("") + (openD.length > 5 ? li("+ " + (openD.length - 5) + " more") : "") + "</ul>" : "";
      var evHtml = evD.length ? '<ul class="peek__list">' + evD.slice(0, 5).map(function (e) { return li('<span class="peek__dash" aria-hidden="true"></span> ' + esc(e.title), esc(evWhen(e))); }).join("") + (evD.length > 5 ? li("+ " + (evD.length - 5) + " more") : "") + "</ul>" : "";
      return '<p class="peek__title">' + esc(fmtLongDay(noonOf(dn))) + "</p>" +
        (dueHtml ? '<p class="peek__label">Due' + (doneD ? ", " + doneD + " already done" : "") + "</p>" + dueHtml : '<p class="peek__when">' + (doneD ? "Everything due is done." : "Nothing due.") + "</p>") +
        (evHtml ? '<p class="peek__label">On your calendar</p>' + evHtml : "") + '<p class="peek__foot">Click for the whole day.</p>';
    }
    if (kind === "e") {
      var e = byId(gcal().events, id); if (!e) return "";
      return '<p class="peek__meta"><span>' + esc(e.calendar) + "</span>" + (e.tentative ? "<span>Maybe</span>" : "") + "</p><p class=\"peek__title\">" + esc(e.title) + "</p>" +
        '<p class="peek__when">' + esc(fmtDay(evStart(e))) + ", " + esc(evWhen(e)) + "</p>" + (e.location ? '<p class="peek__body">' + esc(e.location) + "</p>" : "") +
        '<p class="peek__foot">' + (e.meetLink ? "Has a meeting link. " : "") + "Opens in Google Calendar.</p>";
    }
    return "";
  }
  function placePeek(anchor) {
    var r = anchor.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight;
    peekEl.style.left = "0px"; peekEl.style.top = "0px";
    var w = peekEl.offsetWidth, h = peekEl.offsetHeight;
    var left = Math.min(Math.max(12, r.left + 12), vw - 12 - w), top = r.bottom + 6;
    if (top + h > vh - 12 && r.top - 6 - h >= 12) top = r.top - 6 - h;
    peekEl.style.left = Math.max(12, left) + "px"; peekEl.style.top = Math.max(12, top) + "px";
  }
  function showPeek(anchor) {
    var html = peekContent(anchor.getAttribute("data-peek"));
    if (!html) return;
    if (peekOn && peekOn !== anchor) unlinkPeek(peekOn);
    peekEl.innerHTML = html; peekOn = anchor;
    var target = anchor.querySelector("a") || anchor; target.setAttribute("aria-describedby", "peek");
    placePeek(anchor);
    peekEl.setAttribute("aria-hidden", "false"); peekEl.classList.add("is-on");
  }
  function unlinkPeek(a) { var t = a.querySelector("a") || a; if (t.getAttribute("aria-describedby") === "peek") t.removeAttribute("aria-describedby"); }
  function hidePeek(now) {
    clearTimeout(peekTimer);
    if (peekOn) unlinkPeek(peekOn);
    peekOn = null; peekEl.classList.remove("is-on"); peekEl.setAttribute("aria-hidden", "true");
    if (now) peekEl.innerHTML = "";
  }
  if (canHover) {
    document.addEventListener("mouseover", function (ev) {
      var a = ev.target.closest && ev.target.closest("[data-peek]");
      if (!a || a === peekOn) { clearTimeout(peekTimer); if (!a && peekOn) peekTimer = setTimeout(function () { hidePeek(); }, 120); return; }
      clearTimeout(peekTimer); peekTimer = setTimeout(function () { showPeek(a); }, peekOn ? 60 : 220);
    });
    document.addEventListener("mouseleave", function () { hidePeek(); });
  }
  document.addEventListener("focusin", function (ev) {
    var a = ev.target.closest && ev.target.closest("[data-peek]");
    if (a && ev.target.matches && ev.target.matches(":focus-visible")) { clearTimeout(peekTimer); showPeek(a); }
    else if (peekOn && (!a || a !== peekOn)) hidePeek();
  });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && peekOn) hidePeek(); });
  window.addEventListener("scroll", function () { if (peekOn) hidePeek(); }, { passive: true });
  document.addEventListener("click", function () { if (peekOn) hidePeek(true); });

  /* The clock: checked every second so the cards flip right as the minute turns; a new day re-draws the page. */
  var shownDay = dayNumber(new Date());
  setInterval(function () {
    var now = new Date();
    if (dayNumber(now) !== shownDay) { shownDay = dayNumber(now); if (state.data && !document.querySelector("dialog[open]")) refresh(); return; }
    if (document.visibilityState === "visible") tickClock();
  }, 1000);

  /* Reveal on scroll (the same "gentle reveal" as gregor-posadas.github.io): blocks below the fold fade up a few
     pixels as they scroll into view. Nothing is hidden until this runs, blocks already on screen show at once,
     keyboard focus shows a block right away, and anyone who asked for reduced motion gets no effect. */
  var revealIO = null;
  function reveal() {
    if (revealIO) { revealIO.disconnect(); revealIO = null; }
    if (!("IntersectionObserver" in window) || reduceMotion) return;
    var LIST = "ul.rows, ul.evts, ul.newsc, ul.news, .signs, .day";
    var picked = [];
    main.querySelectorAll(".section, .today, .rail").forEach(function (sec) {
      Array.prototype.forEach.call(sec.children, function (c) {
        if (c.matches(LIST)) Array.prototype.forEach.call(c.children, function (x) { if (x.matches("ul.rows")) Array.prototype.push.apply(picked, x.children); else picked.push(x); });
        else picked.push(c);
      });
    });
    var vh = window.innerHeight, pending = [];
    picked.forEach(function (el) { if (el.getBoundingClientRect().top >= vh * 0.95) { el.classList.add("rv"); pending.push(el); } });
    if (!pending.length) return;
    document.documentElement.classList.add("rv-on");
    function done(el) { el.classList.remove("rv", "rv-in"); el.style.removeProperty("--rv-d"); }
    function show(el, delay) {
      if (!el.classList.contains("rv") || el.classList.contains("rv-in")) return;
      if (delay) el.style.setProperty("--rv-d", delay + "ms");
      el.classList.add("rv-in");
      setTimeout(function () { done(el); }, 900 + (delay || 0));
    }
    revealIO = new IntersectionObserver(function (es) {
      var n = 0;
      es.forEach(function (e) { if (!e.isIntersecting) return; revealIO.unobserve(e.target); show(e.target, Math.min(n++, 4) * 70); });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0 });
    pending.forEach(function (el) { revealIO.observe(el); });
  }
  document.addEventListener("focusin", function (e) { var el = e.target.closest && e.target.closest(".rv"); if (el) { if (revealIO) revealIO.unobserve(el); el.classList.remove("rv", "rv-in"); } });
  window.addEventListener("beforeprint", function () { main.querySelectorAll(".rv").forEach(function (el) { el.classList.remove("rv", "rv-in"); }); });

  /* ---------- light and dark mode ---------- */
  function effectiveTheme() {
    var set = document.documentElement.getAttribute("data-theme");
    if (set) return set;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function paintToggle() {
    var b = document.getElementById("theme-toggle"); if (!b) return;
    var next = effectiveTheme() === "dark" ? "light" : "dark";
    b.textContent = next === "light" ? "Light mode" : "Dark mode";
    b.setAttribute("aria-label", "Switch to " + next + " mode");
  }
  document.getElementById("theme-toggle").addEventListener("click", function () {
    var next = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    store.set("theme", next); paintToggle();
  });
  if (window.matchMedia) { try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintToggle); } catch (e) { /* old browsers */ } }
  paintToggle();
  var sub = document.getElementById("brand-sub"); if (sub && cfg.semesterLabel) sub.textContent = cfg.semesterLabel + ", UC Berkeley";

  /* ---------- stay on the newest version (same approach as the Microbe Busters Hub) ---------- */
  var BUILD = "20261005072656";
  var lastCheck = 0;
  function checkVersion(onLoad) {
    if (BUILD.indexOf("__") === 0) return;            // local copy without a stamp
    lastCheck = Date.now();
    fetch("version.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.v || j.v === BUILD) return;
      var tried = null; try { tried = sessionStorage.getItem("ch.reloadedFor"); } catch (e) { /* ignore */ }
      if (onLoad && tried !== j.v) { refreshTo(j.v); return; }
      var n = document.getElementById("update-notice");
      if (!n) { n = document.createElement("div"); n.id = "update-notice"; n.className = "notice"; n.setAttribute("role", "status"); document.getElementById("notice").before(n); }
      n.innerHTML = '<p><b>The hub was updated.</b> <button type="button" class="btn btn--quiet" id="reload-new">Reload to get the new version</button></p>';
      document.getElementById("reload-new").addEventListener("click", function () { refreshTo(j.v); });
    }).catch(function () { /* offline: keep going */ });
  }
  function refreshTo(v) {
    try { sessionStorage.setItem("ch.reloadedFor", v); } catch (e) { /* ignore */ }
    var urls = ["./", "index.html", "assets/app.js?v=" + v, "assets/styles.css?v=" + v, "assets/config.js?v=" + v];
    Promise.all(urls.map(function (u) { return fetch(u, { cache: "reload" }).catch(function () {}); })).then(function () { location.reload(); });
  }
  /* Coming back to the tab: check for a new version, and quietly reload the data if it's been a while. */
  var loadedAt = Date.now();
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastCheck > 5 * 60000) checkVersion(false);
    if (!state.demo && state.data && Date.now() - loadedAt > 15 * 60000 && !document.querySelector("dialog[open]")) {
      loadedAt = Date.now(); load().then(refresh).catch(function () { /* keep what we have */ });
    }
  });

  function start() {
    if (!state.demo && !store.get("code")) { main.innerHTML = viewGate(""); return; }
    load().then(function () { loadedAt = Date.now(); route(); }).catch(function (e) {
      if (e.code === "code") { store.del("code"); main.innerHTML = viewGate("That code didn't work. Check ACCESS_CODE in the Apps Script project's Script properties and try again."); return; }
      main.innerHTML = '<div class="wrap"><div class="head"><h1 tabindex="-1">Couldn\'t load your classes</h1><p>' + esc(e.message || "The server didn't respond.") + ' Check your connection, then reload the page.</p><div class="actions"><button class="btn btn--solid" type="button" onclick="location.reload()">Reload</button></div></div></div>';
    });
  }
  checkVersion(true);
  start();
})();
