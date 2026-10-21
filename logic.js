/* Katzenklappe - reine Rechen- und Textlogik (ohne Zugriff auf Seite oder Netz).
 *
 * "Naive" Zeiten sind Ortszeit-Texte im Format "2026-11-04T06:30" (ohne Zeitzone).
 * Das ist dasselbe Format, das curfew.py fuer Sonderregeln erwartet und vergleicht.
 * Rechnen tun wir darauf wie auf UTC (ohne Sommerzeit-Sprung): auf eine Stunde im
 * Herbst/Fruehling kommt es hier nicht an.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.KL = root.KL || {};
    for (var k in api) root.KL[k] = api[k];
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_TZ = "Europe/Berlin";
  var HOLD_DAYS = 30; // "bis ich es aufhebe" = so viele Tage
  var WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* ---------- naive Zeiten ---------- */

  function nowNaive(tz, date) {
    var parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || DEFAULT_TZ,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(date || new Date());
    var p = {};
    parts.forEach(function (x) { p[x.type] = x.value; });
    return p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute;
  }

  function toDate(naive) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(naive || "");
    if (!m) throw new Error("Ungueltige Zeit: " + naive);
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  }

  function fromDate(d) {
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) +
      "T" + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes());
  }

  function addMinutes(naive, n) { return fromDate(new Date(toDate(naive).getTime() + n * 60000)); }
  function addDays(naive, n) { return addMinutes(naive, n * 1440); }
  function minutesBetween(a, b) { return Math.round((toDate(b) - toDate(a)) / 60000); }
  function dayDiff(a, b) {
    var da = toDate(a.slice(0, 10) + "T00:00"), db = toDate(b.slice(0, 10) + "T00:00");
    return Math.round((db - da) / 86400000);
  }
  function timeOf(naive) { return naive.slice(11, 16); }

  function isHHMM(v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(v || ""); }
  function minutesOfDay(hhmm) { var p = hhmm.split(":"); return (+p[0]) * 60 + (+p[1]); }

  /* ---------- Zeitplan ---------- */

  // Soll laut Zeitplan: gesperrt zwischen lock und unlock (darf ueber Mitternacht gehen)
  function lockedBySchedule(naive, cat) {
    var t = minutesOfDay(timeOf(naive)), l = minutesOfDay(cat.lock), u = minutesOfDay(cat.unlock);
    return l < u ? (l <= t && t < u) : (t >= l || t < u);
  }

  // Naechstes Auftreten einer Uhrzeit, strikt nach `naive`
  function nextOccurrence(naive, hhmm) {
    var c = naive.slice(0, 10) + "T" + hhmm;
    return c <= naive ? addDays(c, 1) : c;
  }

  function nextTransition(naive, cat) {
    var a = { at: nextOccurrence(naive, cat.lock), to: "locked" };
    var b = { at: nextOccurrence(naive, cat.unlock), to: "free" };
    return a.at <= b.at ? a : b;
  }

  function activeOverride(cat, naive) {
    var o = cat.override;
    return o && naive < o.until ? o : null;
  }

  // Was soll jetzt gelten? {locked, source, override}
  function desired(cat, naive) {
    var o = activeOverride(cat, naive);
    if (o) return { locked: o.state === "locked", source: "override", override: o };
    return { locked: lockedBySchedule(naive, cat), source: "schedule", override: null };
  }

  // Naechster Wechsel (beruecksichtigt Sonderregel)
  function nextChange(cat, naive) {
    var o = activeOverride(cat, naive);
    if (o) return { at: o.until, to: lockedBySchedule(o.until, cat) ? "locked" : "free", viaOverride: true };
    var t = nextTransition(naive, cat);
    return { at: t.at, to: t.to, viaOverride: false };
  }

  /* ---------- Texte ---------- */

  function dayWord(naive, target) {
    var d = dayDiff(naive, target);
    if (d === 0) return "heute";
    if (d === 1) return "morgen";
    if (d === 2) return "übermorgen";
    if (d > 0 && d < 7) return WEEKDAYS[toDate(target).getUTCDay()];
    var t = target.slice(0, 10).split("-");
    return t[2] + "." + t[1] + ".";
  }

  function whenLabel(naive, target) {
    return dayWord(naive, target) + " " + timeOf(target) + " Uhr";
  }

  function agoLabel(minutes) {
    if (minutes == null || isNaN(minutes)) return "unbekannt";
    if (minutes < 1) return "gerade eben";
    if (minutes === 1) return "vor 1 Minute";
    if (minutes < 60) return "vor " + minutes + " Minuten";
    var h = Math.floor(minutes / 60);
    if (h < 24) return h === 1 ? "vor 1 Stunde" : "vor " + h + " Stunden";
    var d = Math.floor(h / 24);
    return d === 1 ? "vor 1 Tag" : "vor " + d + " Tagen";
  }

  /* Anzeige-Modell fuer eine Katze (cat = Eintrag aus status.json) */
  function describeCat(cat, naive) {
    var want = desired(cat, naive);
    var actual = cat.locked; // true / false / null (unbekannt)
    var shownLocked = actual === null || actual === undefined ? want.locked : actual;
    var mismatch = actual === true || actual === false ? actual !== want.locked : false;
    var change = nextChange(cat, naive);
    var override = want.override;

    var sub;
    if (mismatch) {
      sub = want.locked
        ? "Die Sperre wird beim nächsten Lauf gesetzt."
        : "Die Sperre wird beim nächsten Lauf aufgehoben.";
    } else if (change) {
      sub = "bis " + whenLabel(naive, change.at);
    }

    var location = cat.location === "inside" ? "inside" : cat.location === "outside" ? "outside" : "unknown";
    var locationText = "";
    if (location === "outside") {
      locationText = shownLocked
        ? cat.name + " ist noch draußen und kann nur noch hinein."
        : cat.name + " ist gerade draußen.";
    } else if (location === "inside") {
      locationText = cat.name + " ist gerade drinnen.";
    }

    return {
      tone: shownLocked ? "night" : "day",
      headline: shownLocked ? "Ausgang gesperrt" : "Klappe frei",
      sub: sub || "",
      locationText: locationText,
      location: location,
      mismatch: mismatch,
      uncertain: actual === null || actual === undefined,
      wantLocked: want.locked,
      override: override,
      overrideLabel: override
        ? (override.state === "locked" ? "Sonderregel: drinnen bleiben" : "Sonderregel: draußen erlaubt") +
          " bis " + whenLabel(naive, override.until)
        : "",
      next: change
    };
  }

  /* Auswahl im Dialog "jetzt drinnen lassen" / "jetzt rauslassen" */
  function overrideOptions(cat, naive, wantLocked) {
    var out = [];
    function add(key, label, until, hint) {
      if (out.some(function (o) { return o.until === until; })) return;
      out.push({ key: key, label: label, until: until, hint: hint || "" });
    }
    if (wantLocked) {
      add("2h", "2 Stunden", addMinutes(naive, 120));
      var u = nextOccurrence(naive, cat.unlock);
      add("unlock", "Bis " + whenLabel(naive, u), u, "dann gilt wieder der Zeitplan");
      add("hold", "Bis ich es aufhebe", addDays(naive, HOLD_DAYS), "höchstens " + HOLD_DAYS + " Tage");
    } else {
      add("1h", "1 Stunde", addMinutes(naive, 60));
      add("3h", "3 Stunden", addMinutes(naive, 180));
      var l = nextOccurrence(naive, cat.lock);
      add("lock", "Bis " + whenLabel(naive, l), l, "dann gilt wieder der Zeitplan");
    }
    return out;
  }

  /* ---------- Sonderregeln (Variable OVERRIDES_JSON) ---------- */

  function pruneOverrides(overrides, naive) {
    var out = {};
    Object.keys(overrides || {}).forEach(function (k) {
      var o = overrides[k];
      if (o && typeof o.until === "string" && o.until > naive) out[k] = o;
    });
    return out;
  }

  function withoutName(overrides, name) {
    var out = {}, wanted = String(name).trim().toLowerCase();
    Object.keys(overrides || {}).forEach(function (k) {
      if (k.trim().toLowerCase() !== wanted) out[k] = overrides[k];
    });
    return out;
  }

  function setOverride(overrides, name, state, until, naive) {
    var out = withoutName(pruneOverrides(overrides, naive), name);
    out[name] = { state: state, until: until };
    return out;
  }

  function clearOverride(overrides, name, naive) {
    return withoutName(pruneOverrides(overrides, naive), name);
  }

  /* ---------- Zeitplan-Datei (Variable SCHEDULE_JSON) ---------- */

  function emptySchedule() {
    return { enabled: true, timezone: DEFAULT_TZ, alert_window_minutes: 45, cats: [] };
  }

  function normalizeSchedule(raw) {
    var base = emptySchedule();
    if (!raw || typeof raw !== "object") return base;
    base.enabled = raw.enabled !== false;
    base.timezone = typeof raw.timezone === "string" && raw.timezone ? raw.timezone : DEFAULT_TZ;
    var w = parseInt(raw.alert_window_minutes, 10);
    base.alert_window_minutes = isNaN(w) ? 45 : w;
    base.cats = (Array.isArray(raw.cats) ? raw.cats : []).map(function (c) {
      return { name: String(c.name || ""), lock: String(c.lock || "22:00"), unlock: String(c.unlock || "06:30") };
    });
    return base;
  }

  function validateSchedule(schedule) {
    var errors = [], seen = {};
    if (!schedule.cats.length) errors.push("Bitte mindestens ein Tier eintragen.");
    schedule.cats.forEach(function (c, i) {
      var label = c.name.trim() || "Tier " + (i + 1);
      if (!c.name.trim()) errors.push("Tier " + (i + 1) + ": Der Name fehlt.");
      var key = c.name.trim().toLowerCase();
      if (key && seen[key]) errors.push("Der Name „" + c.name.trim() + "“ kommt doppelt vor.");
      seen[key] = true;
      if (!isHHMM(c.lock)) errors.push(label + ": Die Sperrzeit fehlt.");
      if (!isHHMM(c.unlock)) errors.push(label + ": Die Freigabezeit fehlt.");
      if (isHHMM(c.lock) && c.lock === c.unlock) errors.push(label + ": Sperren und Freigeben dürfen nicht dieselbe Uhrzeit sein.");
    });
    return errors;
  }

  function serializeSchedule(schedule) {
    return JSON.stringify({
      enabled: !!schedule.enabled,
      timezone: schedule.timezone || DEFAULT_TZ,
      alert_window_minutes: schedule.alert_window_minutes || 45,
      cats: schedule.cats.map(function (c) {
        return { name: c.name.trim(), lock: c.lock, unlock: c.unlock };
      })
    });
  }

  function sameSchedule(a, b) { return serializeSchedule(a) === serializeSchedule(b); }

  /* ---------- Tagesleiste (24 Stunden) ---------- */

  // Liste von {from, to} in Prozent, in denen gesperrt ist
  function barSegments(lock, unlock) {
    if (!isHHMM(lock) || !isHHMM(unlock) || lock === unlock) return [];
    var l = minutesOfDay(lock) / 14.4, u = minutesOfDay(unlock) / 14.4;
    return l < u ? [{ from: l, to: u }] : [{ from: 0, to: u }, { from: l, to: 100 }];
  }
  function nowPercent(naive) { return minutesOfDay(timeOf(naive)) / 14.4; }

  /* ---------- Einrichtungs-Link ---------- */

  function b64urlEncode(str) {
    var b = (typeof btoa === "function" ? btoa(str) : Buffer.from(str, "binary").toString("base64"));
    return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlDecode(str) {
    var b = str.replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    return typeof atob === "function" ? atob(b) : Buffer.from(b, "base64").toString("binary");
  }

  function encodeSetup(cfg) {
    var payload = { o: cfg.owner, r: cfg.repo, t: cfg.token };
    if (cfg.base) payload.b = cfg.base;
    return b64urlEncode(JSON.stringify(payload));
  }

  function isLocalBase(url) {
    return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url || "");
  }

  // Nimmt einen ganzen Link, "#setup=..." oder nur den Code. Gibt {owner, repo, token, base?} oder null.
  function decodeSetup(input) {
    if (!input) return null;
    var text = String(input).trim();
    var m = /setup=([A-Za-z0-9_-]+)/.exec(text);
    var code = m ? m[1] : (/^[A-Za-z0-9_-]{20,}$/.test(text) ? text : null);
    if (!code) return null;
    try {
      var p = JSON.parse(b64urlDecode(code));
      if (!p || !p.o || !p.r || !p.t) return null;
      var cfg = { owner: String(p.o), repo: String(p.r), token: String(p.t) };
      if (p.b && isLocalBase(p.b)) cfg.base = p.b; // nur fuer lokale Tests
      return cfg;
    } catch (e) {
      return null;
    }
  }

  return {
    DEFAULT_TZ: DEFAULT_TZ, HOLD_DAYS: HOLD_DAYS,
    nowNaive: nowNaive, toDate: toDate, fromDate: fromDate, addMinutes: addMinutes, addDays: addDays,
    minutesBetween: minutesBetween, dayDiff: dayDiff, timeOf: timeOf, isHHMM: isHHMM,
    lockedBySchedule: lockedBySchedule, nextOccurrence: nextOccurrence, nextTransition: nextTransition,
    desired: desired, nextChange: nextChange, activeOverride: activeOverride,
    dayWord: dayWord, whenLabel: whenLabel, agoLabel: agoLabel,
    describeCat: describeCat, overrideOptions: overrideOptions,
    pruneOverrides: pruneOverrides, setOverride: setOverride, clearOverride: clearOverride,
    emptySchedule: emptySchedule, normalizeSchedule: normalizeSchedule,
    validateSchedule: validateSchedule, serializeSchedule: serializeSchedule, sameSchedule: sameSchedule,
    barSegments: barSegments, nowPercent: nowPercent,
    encodeSetup: encodeSetup, decodeSetup: decodeSetup, isLocalBase: isLocalBase
  };
});
