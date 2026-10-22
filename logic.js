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

  /* Anzeige-Modell fuer eine Katze (cat = Eintrag aus status.json).
   * opts: {lead: Minuten Schaltzeit-Toleranz, tz: Zeitzone, nowMs: jetzt}. Der Zeitplan gilt so, als waere es `lead`
   * Minuten spaeter (wie im Zeitplan-Dienst); die Tageswoerter ("heute", "morgen") beziehen sich auf die echte Zeit. */
  function describeCat(cat, naive, opts) {
    opts = typeof opts === "number" ? { lead: opts } : (opts || {});
    var real = naive;
    naive = opts.lead ? addMinutes(naive, opts.lead) : naive;
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
      sub = "bis " + whenLabel(real, change.at);
    }

    var location = cat.location === "inside" ? "inside" : cat.location === "outside" ? "outside" : "unknown";
    var locationText = "";
    var since = cat.location_since && opts.tz && opts.nowMs != null
      ? " (" + sinceLabel(cat.location_since, opts.tz, opts.nowMs) + ")" : "";
    if (location === "outside") {
      locationText = shownLocked
        ? cat.name + " ist noch draußen" + since + " und kann nur noch hinein."
        : cat.name + " ist gerade draußen" + since + ".";
    } else if (location === "inside") {
      locationText = cat.name + " ist gerade drinnen" + since + ".";
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
          " bis " + whenLabel(real, override.until)
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

  var DEFAULT_ALERTS = { enabled: true, outside_after_lock_min: 30, outside_long_hours: 12, battery_percent: 25 };
  var DEFAULT_LEAD = 8;

  function clampInt(v, low, high, dflt) {
    var n = parseInt(v, 10);
    return isNaN(n) ? dflt : Math.max(low, Math.min(high, n));
  }

  // Warn-Einstellungen: fehlende/unsinnige Werte -> Standard, null/0/false = aus
  function normalizeAlerts(raw) {
    var out = {};
    for (var k in DEFAULT_ALERTS) out[k] = DEFAULT_ALERTS[k];
    if (!raw || typeof raw !== "object") return out;
    if ("enabled" in raw) out.enabled = !!raw.enabled;
    [["outside_after_lock_min", 720], ["outside_long_hours", 72], ["battery_percent", 100]].forEach(function (p) {
      if (p[0] in raw) out[p[0]] = (raw[p[0]] === null || raw[p[0]] === false) ? 0 : clampInt(raw[p[0]], 0, p[1], DEFAULT_ALERTS[p[0]]);
    });
    return out;
  }

  function emptySchedule() {
    return { enabled: true, timezone: DEFAULT_TZ, alert_window_minutes: 45, lead_minutes: DEFAULT_LEAD,
      alerts: normalizeAlerts(null), cats: [] };
  }

  function normalizeSchedule(raw) {
    var base = emptySchedule();
    if (!raw || typeof raw !== "object") return base;
    base.enabled = raw.enabled !== false;
    base.timezone = typeof raw.timezone === "string" && raw.timezone ? raw.timezone : DEFAULT_TZ;
    var w = parseInt(raw.alert_window_minutes, 10);
    base.alert_window_minutes = isNaN(w) ? 45 : w;
    base.lead_minutes = clampInt(raw.lead_minutes, 0, 30, DEFAULT_LEAD);
    base.alerts = normalizeAlerts(raw.alerts);
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
      lead_minutes: schedule.lead_minutes == null ? DEFAULT_LEAD : schedule.lead_minutes,
      alerts: normalizeAlerts(schedule.alerts),
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

  /* ---------- Orte, Dauer, Verlauf ---------- */

  function utcToNaive(iso, tz) { return nowNaive(tz, new Date(iso)); }

  function clockLabel(iso, tz) { return timeOf(utcToNaive(iso, tz)); }

  function durationLabel(minutes) {
    var m = Math.max(0, Math.round(minutes));
    if (m < 1) return "unter 1 Min.";
    if (m < 60) return m + " Min.";
    var h = Math.floor(m / 60), r = m % 60;
    if (h < 24) return r === 0 ? h + " Std." : h + " Std. " + r + " Min.";
    var d = Math.floor(h / 24), hh = h % 24;
    return (d === 1 ? "1 Tag" : d + " Tage") + (hh ? " " + hh + " Std." : "");
  }

  // Tageswort fuer vergangene Tage: heute / gestern / vorgestern / Wochentag / 19.10.
  function pastDayWord(nowNv, target) {
    var d = dayDiff(target, nowNv);
    if (d <= 0) return "heute";
    if (d === 1) return "gestern";
    if (d === 2) return "vorgestern";
    if (d < 7) return WEEKDAYS[toDate(target).getUTCDay()];
    var t = target.slice(0, 10).split("-");
    return t[2] + "." + t[1] + ".";
  }

  // "seit 13:49", "seit gestern 21:30", "seit Montag 08:05"
  function sinceLabel(iso, tz, nowMs) {
    var then = utcToNaive(iso, tz), now = nowNaive(tz, new Date(nowMs));
    var word = pastDayWord(now, then);
    return "seit " + (word === "heute" ? "" : word + " ") + timeOf(then);
  }

  function sortedMoves(events, name) {
    return (events || []).filter(function (e) {
      return e && e.k === "move" && e.cat === name && (e.dir === "in" || e.dir === "out");
    }).sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });
  }

  // Zeitraeume draussen: [{from, to}] (ISO/UTC), to = null solange das Tier draussen ist.
  // `pet` ({location, location_since}) berichtigt das Ende: ist das Tier laut Cloud drinnen, gibt es keinen offenen Zeitraum;
  // ist es draussen, ohne dass wir den Auszug kennen, zaehlt die Cloud-Angabe "seit".
  function excursions(events, name, pet) {
    var list = [], open = null;
    sortedMoves(events, name).forEach(function (m) {
      if (m.dir === "out") open = m.t;
      else if (open) { list.push({ from: open, to: m.t }); open = null; }
    });
    var loc = pet && pet.location;
    if (loc === "inside") open = null;
    else if (loc === "outside" && pet.location_since && (!open || open < pet.location_since)) open = pet.location_since;
    if (open) list.push({ from: open, to: null });
    return list;
  }

  // Minuten draussen je Kalendertag (Ortszeit); `days` Tage bis einschliesslich heute, aeltester zuerst
  function outsideByDay(exc, tz, nowMs, days) {
    var now = nowNaive(tz, new Date(nowMs)), today = now.slice(0, 10), sums = {};
    exc.forEach(function (x) {
      var a = utcToNaive(x.from, tz), b = x.to ? utcToNaive(x.to, tz) : now;
      var cur = a, guard = 0;
      while (cur < b && guard++ < 400) {
        var next = addDays(cur.slice(0, 10) + "T00:00", 1);
        var end = b < next ? b : next;
        var key = cur.slice(0, 10);
        sums[key] = (sums[key] || 0) + minutesBetween(cur, end);
        cur = end;
      }
    });
    var out = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = addDays(today + "T00:00", -i).slice(0, 10);
      out.push({ date: d, minutes: sums[d] || 0 });
    }
    return out;
  }

  // Heutige Aktivitaet eines Tieres: {count, minutes, hasData, perDay}
  function activityFor(events, pet, tz, nowMs, days) {
    var name = pet.name, now = nowNaive(tz, new Date(nowMs)), today = now.slice(0, 10);
    var moves = sortedMoves(events, name);
    var exc = excursions(events, name, pet);
    var perDay = outsideByDay(exc, tz, nowMs, days || 7);
    var count = moves.filter(function (m) { return m.dir === "out" && utcToNaive(m.t, tz).slice(0, 10) === today; }).length;
    var todayRow = perDay[perDay.length - 1];
    return { count: count, minutes: todayRow ? todayRow.minutes : 0, hasData: moves.length > 0, perDay: perDay,
      firstT: moves.length ? moves[0].t : null };
  }

  function activityLine(act, name) {
    if (!act || !act.hasData) return "";
    if (act.count === 0 && act.minutes === 0) return "Heute noch nicht draußen.";
    var total = durationLabel(act.minutes);
    return act.count === 0 ? "Heute zusammen " + total + " draußen." : "Heute " + act.count + "× draußen, zusammen " + total + (/\.$/.test(total) ? "" : ".");
  }

  function eventText(e) {
    if (e.k === "move") {
      if (e.dir === "out") return e.cat + " ist nach draußen gegangen";
      if (e.dir === "in") return e.cat + " ist hereingekommen";
      return e.cat + " war an der Klappe";
    }
    if (e.k === "lock") {
      var by = e.by ? " (" + e.by + ")" : "";
      return (e.to === "locked" ? "Ausgang für " + e.cat + " gesperrt" : "Ausgang für " + e.cat + " freigegeben") + by;
    }
    return e.cat || "";
  }

  // Verlauf fuer die Anzeige: neueste zuerst; bei "hereingekommen" mit der Zeit, die das Tier draussen war
  function annotateEvents(events, tz) {
    var asc = (events || []).filter(function (e) { return e && e.t && e.k; })
      .sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : (String(a.id) < String(b.id) ? -1 : 1); });
    var lastOut = {}, out = [];
    asc.forEach(function (e) {
      var row = { e: e, id: e.id, name: e.cat, kind: e.k, dir: e.dir || null, text: eventText(e), outMin: null };
      var local = utcToNaive(e.t, tz);
      row.date = local.slice(0, 10); row.time = timeOf(local);
      if (e.k === "move" && e.dir === "out") lastOut[e.cat] = e.t;
      else if (e.k === "move" && e.dir === "in" && lastOut[e.cat]) {
        var mins = (Date.parse(e.t) - Date.parse(lastOut[e.cat])) / 60000;
        if (mins >= 0 && mins < 72 * 60) row.outMin = Math.round(mins);
        delete lastOut[e.cat];
      }
      out.push(row);
    });
    return out.reverse();
  }

  function dayHeading(nowNv, date) {
    var d = dayDiff(date + "T00:00", nowNv.slice(0, 10) + "T00:00");
    if (d <= 0) return "Heute";
    if (d === 1) return "Gestern";
    var t = date.split("-");
    return WEEKDAYS[toDate(date + "T00:00").getUTCDay()] + ", " + t[2] + "." + t[1] + ".";
  }

  /* ---------- Geraete und Warnungen ---------- */

  function batteryTone(pct, warnAt) {
    if (pct == null) return "idle";
    if (pct <= 10) return "bad";
    return pct <= (warnAt || 0) ? "warn" : "ok";
  }
  function signalLevel(db) {
    if (typeof db !== "number") return 0;
    return db >= -60 ? 4 : db >= -70 ? 3 : db >= -80 ? 2 : 1;
  }
  function signalLabel(db) {
    return ["unbekannt", "schwach", "mittel", "gut", "sehr gut"][signalLevel(db)];
  }

  function warningText(w, tz, nowMs) {
    if (w.kind === "outside_lock") {
      var gilt = w.locked_since ? "Die Sperre gilt seit " + clockLabel(w.locked_since, tz) : "Die Sperre gilt";
      return gilt + ", " + w.cat + " ist draußen " + sinceLabel(w.since, tz, nowMs) + ". Hinein kommt " + w.cat + " weiterhin.";
    }
    if (w.kind === "outside_long") {
      return "Draußen " + sinceLabel(w.since, tz, nowMs) + ", das sind " +
        durationLabel((nowMs - Date.parse(w.since)) / 60000).replace(/\.$/, "") + ". Vielleicht einmal nachsehen.";
    }
    if (w.kind === "battery") {
      return "Die Batterie der Klappe „" + w.device + "“ ist bei etwa " + w.percent + " %. " +
        (w.level === "bad" ? "Bitte bald neue Batterien einsetzen." : "Neue Batterien bereitlegen.");
    }
    return "";
  }

  function warningTitle(w) {
    if (w.kind === "outside_lock") return w.cat + " ist trotz Sperre noch draußen";
    if (w.kind === "outside_long") return w.cat + " ist lange draußen";
    if (w.kind === "battery") return w.level === "bad" ? "Batterie fast leer" : "Batterie wird schwach";
    return "Hinweis";
  }

  // Kurze Dauer fuer Saeulen: "35 Min.", "2,5 Std."
  function durationShort(minutes) {
    var m = Math.max(0, Math.round(minutes));
    if (m === 0) return "0";
    if (m < 60) return m + " Min.";
    return (Math.round(m / 6) / 10).toString().replace(".", ",") + " Std.";
  }

  var ALERT_CHOICES = {
    outside_after_lock_min: { unit: "min", values: [15, 30, 45, 60, 120] },
    outside_long_hours: { unit: "h", values: [6, 8, 12, 18, 24] },
    battery_percent: { unit: "%", values: [15, 20, 25, 30, 40] }
  };
  function choiceLabel(key, v) {
    if (!v) return "Aus";
    if (key === "outside_after_lock_min") return v >= 60 && v % 60 === 0 ? (v / 60 === 1 ? "1 Stunde" : (v / 60) + " Stunden") : v + " Minuten";
    if (key === "outside_long_hours") return v === 1 ? "1 Stunde" : v + " Stunden";
    return v + " %";
  }
  // Auswahl fuer eine Warn-Einstellung: [{value, label, selected}], ein ungewoehnlicher Wert bleibt erhalten
  function alertChoices(key, current) {
    var vals = [0].concat(ALERT_CHOICES[key].values);
    if (vals.indexOf(current) < 0) { vals.push(current); vals.sort(function (a, b) { return a - b; }); }
    return vals.map(function (v) { return { value: v, label: choiceLabel(key, v), selected: v === current }; });
  }
  function sameAlerts(a, b) { return JSON.stringify(normalizeAlerts(a)) === JSON.stringify(normalizeAlerts(b)); }

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
    DEFAULT_ALERTS: DEFAULT_ALERTS, DEFAULT_LEAD: DEFAULT_LEAD, normalizeAlerts: normalizeAlerts,
    utcToNaive: utcToNaive, clockLabel: clockLabel, durationLabel: durationLabel, pastDayWord: pastDayWord,
    sinceLabel: sinceLabel, excursions: excursions, outsideByDay: outsideByDay, activityFor: activityFor,
    activityLine: activityLine, eventText: eventText, annotateEvents: annotateEvents, dayHeading: dayHeading,
    batteryTone: batteryTone, signalLevel: signalLevel, signalLabel: signalLabel, warningText: warningText,
    warningTitle: warningTitle, durationShort: durationShort, alertChoices: alertChoices, sameAlerts: sameAlerts,
    encodeSetup: encodeSetup, decodeSetup: decodeSetup, isLocalBase: isLocalBase
  };
});
