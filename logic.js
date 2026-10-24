/* Kalender - Logik ohne Oberflaeche (Datum, Schichtplan, Termine, Geburtstage, Import, Sicherung).
 * Alle Daten sind Text "JJJJ-MM-TT"; gerechnet wird in UTC, damit Zeitumstellungen nichts verschieben. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KalLogic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  var MONTHS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  var WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  var WD_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  var DAY_MS = 86400000;

  /* ---------- Datum ---------- */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isDate(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = toUtc(s);
    return d.getUTCFullYear() === +s.slice(0, 4) && d.getUTCMonth() === +s.slice(5, 7) - 1 && d.getUTCDate() === +s.slice(8, 10);
  }
  function toUtc(s) { return new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))); }
  function fromUtc(d) { return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
  function ymd(y, m, d) { return String(y).padStart(4, "0") + "-" + pad(m) + "-" + pad(d); }
  function addDays(s, n) { return fromUtc(new Date(toUtc(s).getTime() + n * DAY_MS)); }
  function diffDays(a, b) { return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / DAY_MS); }
  function isoWeekday(s) { var w = toUtc(s).getUTCDay(); return w === 0 ? 7 : w; }       // 1 = Montag ... 7 = Sonntag
  function mondayOf(s) { return addDays(s, 1 - isoWeekday(s)); }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function isoWeek(s) {   // {year, week} nach ISO 8601 (Woche mit dem ersten Donnerstag)
    var thursday = addDays(s, 4 - isoWeekday(s));
    var y = +thursday.slice(0, 4);
    var jan1 = ymd(y, 1, 1);
    return { year: y, week: Math.floor(diffDays(jan1, thursday) / 7) + 1 };
  }
  function todayFrom(date) { return fromUtc(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))); }
  function monthGrid(y, m) {   // Wochen (Montag zuerst) als Listen von 7 Daten, inkl. Tage der Nachbarmonate
    var first = ymd(y, m, 1), last = ymd(y, m, daysInMonth(y, m));
    var out = [], cur = mondayOf(first);
    while (cur <= last) {
      var row = [];
      for (var i = 0; i < 7; i++) row.push(addDays(cur, i));
      out.push({ week: isoWeek(row[0]).week, days: row });
      cur = addDays(cur, 7);
    }
    return out;
  }
  function longDate(s) {
    return WEEKDAYS[toUtc(s).getUTCDay()] + ", " + (+s.slice(8, 10)) + ". " + MONTHS[+s.slice(5, 7) - 1] + " " + s.slice(0, 4);
  }
  function shortDate(s) { return WD_SHORT[toUtc(s).getUTCDay()] + ", " + (+s.slice(8, 10)) + ". " + MONTHS_SHORT[+s.slice(5, 7) - 1]; }

  /* ---------- Feiertage (Berlin) ---------- */
  function easter(y) {   // Gaussche Osterformel (gregorianisch)
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return ymd(y, month, day);
  }
  var holidayCache = {};
  function holidays(y) {   // { "JJJJ-MM-TT": "Name" }
    if (holidayCache[y]) return holidayCache[y];
    var e = easter(y), h = {};
    h[ymd(y, 1, 1)] = "Neujahr";
    h[ymd(y, 3, 8)] = "Frauentag";
    h[addDays(e, -2)] = "Karfreitag";
    h[addDays(e, 0)] = "Ostersonntag";
    h[addDays(e, 1)] = "Ostermontag";
    h[ymd(y, 5, 1)] = "Tag der Arbeit";
    h[addDays(e, 39)] = "Christi Himmelfahrt";
    h[addDays(e, 49)] = "Pfingstsonntag";
    h[addDays(e, 50)] = "Pfingstmontag";
    h[ymd(y, 10, 3)] = "Tag der Deutschen Einheit";
    h[ymd(y, 12, 25)] = "1. Weihnachtstag";
    h[ymd(y, 12, 26)] = "2. Weihnachtstag";
    holidayCache[y] = h;
    return h;
  }
  function holidayOn(s) { return holidays(+s.slice(0, 4))[s] || null; }

  /* ---------- Schichtplan ---------- */
  var SHIFT_TYPES = { frueh: "Frühschicht", spaet: "Spätschicht", frei: "Frei", urlaub: "Urlaub" };
  function defaultShift() {
    return {
      enabled: true,
      anchorMonday: "2026-10-19",      // Woche, in der die Fruehschicht beginnt (KW 43 / 2026)
      anchorType: "frueh",
      days: [1, 2, 3, 4, 5],           // Arbeitstage (1 = Montag)
      times: { frueh: { start: "06:00", end: "14:15" }, spaet: { start: "14:00", end: "22:15" } },
      holidaysFree: false
    };
  }
  function isTime(t) { return typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t); }
  function normalizeShift(raw) {
    var d = defaultShift(), s = raw && typeof raw === "object" ? raw : {};
    var out = {
      enabled: s.enabled !== false,
      anchorMonday: isDate(s.anchorMonday) ? mondayOf(s.anchorMonday) : d.anchorMonday,
      anchorType: s.anchorType === "spaet" ? "spaet" : "frueh",
      days: Array.isArray(s.days) ? s.days.filter(function (n, i, a) { return n >= 1 && n <= 7 && Math.floor(n) === n && a.indexOf(n) === i; }).sort() : d.days,
      times: {
        frueh: { start: d.times.frueh.start, end: d.times.frueh.end },
        spaet: { start: d.times.spaet.start, end: d.times.spaet.end }
      },
      holidaysFree: s.holidaysFree === true
    };
    ["frueh", "spaet"].forEach(function (k) {
      var t = s.times && s.times[k];
      if (t && isTime(t.start)) out.times[k].start = t.start;
      if (t && isTime(t.end)) out.times[k].end = t.end;
    });
    return out;
  }
  function planShiftType(date, shift) {   // nur der Plan, ohne Einzelaenderungen: "frueh" | "spaet" | null
    if (!shift.enabled || shift.days.indexOf(isoWeekday(date)) < 0) return null;
    var weeks = Math.round(diffDays(shift.anchorMonday, mondayOf(date)) / 7);
    var same = weeks % 2 === 0;   // auch fuer negative Wochen korrekt (-2 % 2 === -0)
    return same ? shift.anchorType : (shift.anchorType === "frueh" ? "spaet" : "frueh");
  }
  function shiftOn(date, shift, overrides) {
    // { type, plan, changed, start, end, label } oder null (kein Dienst, keine Aenderung)
    var plan = planShiftType(date, shift);
    var type = plan, changed = false;
    var ov = overrides && overrides[date];
    if (ov && SHIFT_TYPES[ov]) { type = ov; changed = ov !== plan; }
    else if (type && shift.holidaysFree && holidayOn(date)) type = "frei";
    if (!type) return null;
    var t = shift.times[type];
    return { type: type, plan: plan, changed: changed, start: t ? t.start : null, end: t ? t.end : null, label: SHIFT_TYPES[type] };
  }
  function shiftWeekSummary(date, shift) {   // "Frühschicht" / "Spätschicht" der Woche (auch wenn der Tag frei ist)
    var w = mondayOf(date), d0 = null;
    for (var i = 0; i < 7 && !d0; i++) { var t = planShiftType(addDays(w, i), shift); if (t) d0 = t; }
    if (d0) return d0;
    var weeks = Math.round(diffDays(shift.anchorMonday, w) / 7);
    return weeks % 2 === 0 ? shift.anchorType : (shift.anchorType === "frueh" ? "spaet" : "frueh");
  }

  /* ---------- Termine ---------- */
  var REPEATS = { none: "Einmalig", weekly: "Jede Woche", monthly: "Jeden Monat", yearly: "Jedes Jahr" };
  function newId(prefix) { return (prefix || "x") + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function normalizeEvent(raw) {
    var e = raw && typeof raw === "object" ? raw : {};
    var title = typeof e.title === "string" ? e.title.trim().slice(0, 120) : "";
    if (!title || !isDate(e.date)) return null;
    var out = {
      id: typeof e.id === "string" && e.id ? e.id.slice(0, 40) : newId("e"),
      title: title, date: e.date,
      time: isTime(e.time) ? e.time : "",
      endTime: isTime(e.endTime) && isTime(e.time) ? e.endTime : "",
      notes: typeof e.notes === "string" ? e.notes.slice(0, 4000) : "",
      repeat: REPEATS[e.repeat] ? e.repeat : "none",
      until: isDate(e.until) && e.until >= e.date ? e.until : ""
    };
    return out;
  }
  function occursOn(ev, date) {
    if (date < ev.date) return false;
    if (ev.until && date > ev.until) return false;
    if (ev.repeat === "none") return date === ev.date;
    if (ev.repeat === "weekly") return diffDays(ev.date, date) % 7 === 0;
    var y = +date.slice(0, 4), m = +date.slice(5, 7), d = +date.slice(8, 10);
    var ey = +ev.date.slice(0, 4), em = +ev.date.slice(5, 7), ed = +ev.date.slice(8, 10);
    if (ev.repeat === "monthly") return d === Math.min(ed, daysInMonth(y, m));
    if (ev.repeat === "yearly") {
      if (m !== em) return false;
      if (ed === 29 && em === 2 && !isLeap(y)) return d === 28;
      return d === ed;
    }
    return false;
  }
  function eventsOn(events, date) {   // nach Uhrzeit sortiert, ganztaegige zuerst
    return (events || []).filter(function (e) { return occursOn(e, date); }).sort(function (a, b) {
      return (a.time || "") < (b.time || "") ? -1 : (a.time || "") > (b.time || "") ? 1 : a.title.localeCompare(b.title, "de");
    });
  }
  function eventTimeLabel(e) { return e.time ? (e.endTime ? e.time + "–" + e.endTime : e.time) : "ganztägig"; }
  function normalizeTemplate(raw) {
    var t = raw && typeof raw === "object" ? raw : {};
    var title = typeof t.title === "string" ? t.title.trim().slice(0, 120) : "";
    if (!title) return null;
    return { id: typeof t.id === "string" && t.id ? t.id.slice(0, 40) : newId("t"), title: title, time: isTime(t.time) ? t.time : "",
      endTime: isTime(t.endTime) && isTime(t.time) ? t.endTime : "", notes: typeof t.notes === "string" ? t.notes.slice(0, 4000) : "",
      repeat: REPEATS[t.repeat] ? t.repeat : "none" };
  }

  /* ---------- Geburtstage ---------- */
  function normalizeBirthday(raw) {
    var b = raw && typeof raw === "object" ? raw : {};
    var name = typeof b.name === "string" ? b.name.trim().slice(0, 100) : "";
    var m = +b.month, d = +b.day;
    if (!name || !(m >= 1 && m <= 12) || !(d >= 1 && d <= daysInMonth(2024, m))) return null;   // 2024 ist Schaltjahr: 29.2. erlaubt
    var y = +b.year;
    return { id: typeof b.id === "string" && b.id ? b.id.slice(0, 40) : newId("b"), name: name, month: m, day: d,
      year: y >= 1900 && y <= 2200 ? y : 0, source: b.source === "import" ? "import" : "manual" };
  }
  function birthdaysOn(list, date) {
    var y = +date.slice(0, 4), m = +date.slice(5, 7), d = +date.slice(8, 10);
    return (list || []).filter(function (b) {
      if (b.month !== m) return false;
      if (b.day === 29 && m === 2 && !isLeap(y)) return d === 28;
      return b.day === d;
    }).map(function (b) { return { id: b.id, name: b.name, age: b.year ? y - b.year : null, source: b.source }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, "de"); });
  }

  /* ---------- Import: Kontakte (vCard / CSV) ---------- */
  function parseBirthdayValue(v) {   // -> {year, month, day} | null; Jahr 0 = unbekannt
    if (typeof v !== "string") return null;
    v = v.trim();
    if (!v) return null;
    var m;
    if ((m = /^--(\d{2})-?(\d{2})$/.exec(v))) return mk(0, +m[1], +m[2]);
    if ((m = /^(\d{4})-?(\d{2})-?(\d{2})(?:[T ].*)?$/.exec(v))) return mk(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v))) return mk(+m[3], +m[2], +m[1]);
    if ((m = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(v))) return mk(0, +m[2], +m[1]);
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v))) return mk(+m[3], +m[1], +m[2]);
    return null;
    function mk(y, mo, d) {
      if (!(mo >= 1 && mo <= 12) || !(d >= 1 && d <= daysInMonth(2024, mo))) return null;
      return { year: y >= 1900 && y <= 2200 ? y : 0, month: mo, day: d };   // 1604, 0000, 1900 u. a. sind Platzhalter
    }
  }
  function unfoldLines(text) {
    return String(text).replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  }
  function vcfUnescape(s) { return s.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\;/g, ";").replace(/\\\\/g, "\\").trim(); }
  function parseVcf(text) {   // [{name, year, month, day}]
    var out = [], card = null;
    unfoldLines(text).forEach(function (line) {
      var up = line.trim().toUpperCase();
      if (up === "BEGIN:VCARD") { card = { fn: "", n: "", org: "", bday: null }; return; }
      if (up === "END:VCARD") {
        if (card && card.bday) {
          var name = card.fn || card.n || card.org;
          if (name) out.push({ name: name, year: card.bday.year, month: card.bday.month, day: card.bday.day });
        }
        card = null; return;
      }
      if (!card) return;
      var i = line.indexOf(":");
      if (i < 0) return;
      var key = line.slice(0, i).split(";")[0].toUpperCase().replace(/^.*\./, "");   // "item1.BDAY" -> "BDAY"
      var val = line.slice(i + 1);
      if (key === "FN") card.fn = vcfUnescape(val);
      else if (key === "N") { var p = val.split(";"); card.n = vcfUnescape(((p[1] || "") + " " + (p[0] || "")).trim()); }
      else if (key === "ORG") card.org = vcfUnescape(val.split(";")[0]);
      else if (key === "BDAY") card.bday = parseBirthdayValue(val);
    });
    return out;
  }
  function parseCsv(text) {   // Zeilen aus Feldern; Anfuehrungszeichen, Komma oder Semikolon
    var s = String(text).replace(/^﻿/, ""), rows = [], row = [], cur = "", q = false;
    var first = s.split(/\r?\n/)[0] || "";
    var sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) {
        if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
      } else if (c === '"') q = true;
      else if (c === sep) { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
      else cur += c;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return x.trim() !== ""; }); });
  }
  function parseContactsCsv(text) {
    var rows = parseCsv(text);
    if (rows.length < 2) return [];
    var head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    function col() { for (var a = 0; a < arguments.length; a++) { var i = head.indexOf(arguments[a]); if (i >= 0) return i; } return -1; }
    var iB = col("birthday", "geburtstag"), iF = col("first name", "vorname", "given name"), iL = col("last name", "nachname", "family name"),
        iN = col("name", "display name", "anzeigename", "file as"), iO = col("organization name", "organization 1 - name", "firma");
    if (iB < 0) return [];
    var out = [];
    rows.slice(1).forEach(function (r) {
      var b = parseBirthdayValue(r[iB] || "");
      if (!b) return;
      var name = ((iF >= 0 ? r[iF] || "" : "") + " " + (iL >= 0 ? r[iL] || "" : "")).trim() || (iN >= 0 ? (r[iN] || "").trim() : "") || (iO >= 0 ? (r[iO] || "").trim() : "");
      if (name) out.push({ name: name, year: b.year, month: b.month, day: b.day });
    });
    return out;
  }
  function parseContacts(text, filename) {   // erkennt vCard oder CSV am Inhalt
    var s = String(text || "");
    if (/BEGIN:VCARD/i.test(s)) return { kind: "vcf", items: parseVcf(s) };
    if (/\.csv$/i.test(filename || "") || /birthday|geburtstag/i.test(s.split("\n")[0] || "")) return { kind: "csv", items: parseContactsCsv(s) };
    return { kind: "unknown", items: [] };
  }
  function mergeImportedBirthdays(existing, items) {   // alte Importe ersetzen, von Hand angelegte behalten
    var manual = (existing || []).filter(function (b) { return b.source !== "import"; });
    var seen = {}, imported = [];
    items.forEach(function (it) {
      var b = normalizeBirthday({ name: it.name, month: it.month, day: it.day, year: it.year, source: "import" });
      if (!b) return;
      var key = b.name.toLowerCase() + "|" + b.month + "|" + b.day;
      if (seen[key]) return;
      seen[key] = 1; imported.push(b);
    });
    return { list: manual.concat(imported), imported: imported.length, kept: manual.length };
  }

  /* ---------- Gesamtdaten, Sicherung ---------- */
  function emptyData() { return { v: 1, shift: defaultShift(), overrides: {}, events: [], birthdays: [], templates: [] }; }
  function normalizeData(raw) {
    var r = raw && typeof raw === "object" ? raw : {};
    var out = emptyData();
    out.shift = normalizeShift(r.shift);
    if (r.overrides && typeof r.overrides === "object") {
      Object.keys(r.overrides).forEach(function (k) { if (isDate(k) && SHIFT_TYPES[r.overrides[k]]) out.overrides[k] = r.overrides[k]; });
    }
    out.events = (Array.isArray(r.events) ? r.events : []).map(normalizeEvent).filter(Boolean);
    out.birthdays = (Array.isArray(r.birthdays) ? r.birthdays : []).map(normalizeBirthday).filter(Boolean);
    out.templates = (Array.isArray(r.templates) ? r.templates : []).map(normalizeTemplate).filter(Boolean);
    return out;
  }
  function backupText(data, nowIso) {
    return JSON.stringify({ app: "kalender", v: 1, saved: nowIso || null, data: data }, null, 1);
  }
  function parseBackup(text) {   // { ok, data, error }
    var j;
    try { j = JSON.parse(text); } catch (e) { return { ok: false, error: "Die Datei ist keine Sicherung (kein gültiges JSON)." }; }
    if (!j || j.app !== "kalender" || !j.data || typeof j.data !== "object") return { ok: false, error: "Das ist keine Sicherungsdatei dieser App." };
    return { ok: true, data: normalizeData(j.data) };
  }

  /* ---------- Hilfen fuer die Anzeige ---------- */
  function weekdayLetters(days) {
    return days.map(function (n) { return WD_SHORT[n % 7]; }).join(", ");
  }
  function agendaFrom(data, from, count) {   // naechste Tage mit Terminen/Geburtstagen: [{date, events, birthdays, holiday, shift}]
    var out = [], d = from;
    for (var i = 0; i < count; i++, d = addDays(d, 1)) {
      var ev = eventsOn(data.events, d), bd = birthdaysOn(data.birthdays, d), ho = holidayOn(d);
      if (ev.length || bd.length || ho) out.push({ date: d, events: ev, birthdays: bd, holiday: ho });
    }
    return out;
  }

  return {
    MONTHS: MONTHS, MONTHS_SHORT: MONTHS_SHORT, WEEKDAYS: WEEKDAYS, WD_SHORT: WD_SHORT, SHIFT_TYPES: SHIFT_TYPES, REPEATS: REPEATS,
    pad: pad, isDate: isDate, ymd: ymd, addDays: addDays, diffDays: diffDays, isoWeekday: isoWeekday, mondayOf: mondayOf,
    daysInMonth: daysInMonth, isLeap: isLeap, isoWeek: isoWeek, todayFrom: todayFrom, monthGrid: monthGrid, longDate: longDate, shortDate: shortDate,
    easter: easter, holidays: holidays, holidayOn: holidayOn,
    defaultShift: defaultShift, normalizeShift: normalizeShift, planShiftType: planShiftType, shiftOn: shiftOn, shiftWeekSummary: shiftWeekSummary, isTime: isTime,
    newId: newId, normalizeEvent: normalizeEvent, occursOn: occursOn, eventsOn: eventsOn, eventTimeLabel: eventTimeLabel, normalizeTemplate: normalizeTemplate,
    normalizeBirthday: normalizeBirthday, birthdaysOn: birthdaysOn,
    parseBirthdayValue: parseBirthdayValue, parseVcf: parseVcf, parseCsv: parseCsv, parseContactsCsv: parseContactsCsv, parseContacts: parseContacts,
    mergeImportedBirthdays: mergeImportedBirthdays,
    emptyData: emptyData, normalizeData: normalizeData, backupText: backupText, parseBackup: parseBackup,
    weekdayLetters: weekdayLetters, agendaFrom: agendaFrom
  };
});
