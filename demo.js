/* Katzenklappe - Demo-Modus: dieselbe Schnittstelle wie GitHub, aber alles im Speicher.
 * Zum Ausprobieren und Vorzeigen, ohne Konto und ohne echte Klappe. Der "Lauf" dauert hier
 * wenige Sekunden (in Wirklichkeit etwa eine Minute).
 */
(function (root, factory) {
  var api = factory(typeof module === "object" && module.exports ? require("./logic.js") : root.KL);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.KL = root.KL || {};
    for (var k in api) root.KL[k] = api[k];
  }
})(typeof self !== "undefined" ? self : this, function (L) {
  "use strict";

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function iso(ms) { return new Date(ms).toISOString().replace(/\.\d+Z$/, "Z"); }

  function createDemo(opts) {
    opts = opts || {};
    var runDelay = opts.runDelay != null ? opts.runDelay : 2500;
    var tz = "Europe/Berlin";
    var schedule = {
      enabled: true, timezone: tz, alert_window_minutes: 45, lead_minutes: 0,
      alerts: L.normalizeAlerts(null),
      cats: [
        { name: "Tom", lock: "22:00", unlock: "06:30" },
        { name: "Mimo", lock: "23:30", unlock: "05:30" }
      ]
    };
    var overrides = {};
    // Wann sich Tier und Sperre zuletzt geaendert haben (ms); Tom ist seit einigen Stunden draussen
    var startMs = Date.now();
    var places = {
      Tom: { where: "outside", since: startMs - 95 * 60000 },
      Mimo: { where: "inside", since: startMs - 6 * 3600000 },
      Luna: { where: "inside", since: startMs - 40 * 60000 }
    };
    var applied = {};
    var profileSince = {};
    var battery = 41;
    var lastRun = { id: 1, event: "schedule", status: "completed", conclusion: "success", at: Date.now() - 12 * 60000 };
    var nextId = 2;
    var history = [];

    function now() { return L.nowNaive(tz); }

    // Ortszeit "YYYY-MM-DDTHH:MM" (heute minus `back` Tage um hh:mm) als UTC-Zeitstempel
    function pastIso(back, hh, mm) {
      var n = now();
      var day = L.addDays(n.slice(0, 10) + "T00:00", -back).slice(0, 10);
      var offset = Date.parse(n + ":00Z") - Math.floor(Date.now() / 60000) * 60000;
      return iso(Date.parse(day + "T" + (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm + ":00Z") - offset);
    }

    // Erfundener Verlauf der letzten Tage (nur Eintraege in der Vergangenheit)
    (function seed() {
      var id = 1, ev = [];
      // heute nur, was vor der aktuellen Lage der Tiere liegt (damit Aus- und Eintritte zusammenpassen)
      var before = { Tom: startMs - 100 * 60000, Mimo: startMs - 6 * 3600000 - 60000, Luna: startMs - 100 * 60000 };
      function add(back, hh, mm, cat, dir) {
        var t = pastIso(back, hh, mm);
        if (back > 0 || Date.parse(t) < before[cat]) ev.push({ id: "d" + (id++), t: t, k: "move", cat: cat, dir: dir });
      }
      var tom = [[7, 10, 8, 40], [12, 5, 13, 20], [17, 30, 18, 15], [20, 50, 21, 40]];
      for (var back = 6; back >= 0; back--) {
        var rows = back % 2 === 0 ? tom : tom.slice(0, 3);
        rows.forEach(function (r, i) {
          add(back, r[0], r[1], "Tom", "out");
          add(back, r[2], r[3], "Tom", "in");
        });
        add(back, 6, 45, "Mimo", "out"); add(back, 9, 5, "Mimo", "in");
        add(back, 15, 30, "Mimo", "out"); add(back, 16, 10, "Mimo", "in");
        add(back, 22, 40, "Mimo", "out"); add(back, 23, 20, "Mimo", "in");
        if (back % 3 === 0) { add(back, 19, 10, "Luna", "out"); add(back, 20, 5, "Luna", "in"); }
        ev.push({ id: "dl" + back, t: pastIso(back, 22, 0), k: "lock", cat: "Tom", to: "locked", by: "Zeitplan" });
        ev.push({ id: "dm" + back, t: pastIso(back, 6, 30), k: "lock", cat: "Tom", to: "free", by: "Zeitplan" });
      }
      // heute: Tom ging vor 95 Minuten hinaus, Luna kam vor 40 Minuten herein
      ev = ev.filter(function (e) { return Date.parse(e.t) <= startMs; });
      ev.push({ id: "dx1", t: iso(startMs - 95 * 60000), k: "move", cat: "Tom", dir: "out" });
      ev.push({ id: "dx2", t: iso(startMs - 95 * 60000), k: "move", cat: "Luna", dir: "out" });
      ev.push({ id: "dx3", t: iso(startMs - 40 * 60000), k: "move", cat: "Luna", dir: "in" });
      ev.sort(function (a, b) { return a.t < b.t ? 1 : a.t > b.t ? -1 : 0; });
      history = ev;
    })();

    function catView(c, naive) {
      var live = Object.assign({}, c);
      var o = overrides[Object.keys(overrides).filter(function (k) { return k.toLowerCase() === c.name.toLowerCase(); })[0]];
      live.override = o && o.until > naive ? o : null;
      return live;
    }

    function runNow() {
      var naive = now();
      schedule.cats.forEach(function (c) {
        if (!schedule.enabled) return;
        var want = L.desired(catView(c, naive), naive).locked;
        if (!(c.name in applied) && want) profileSince[c.name] = iso(Date.now() - 41 * 60000);
        if (c.name in applied && applied[c.name] !== want) {
          profileSince[c.name] = iso(Date.now());
          history.unshift({ id: "s" + Date.now() + "-" + c.name, t: iso(Date.now()), k: "lock", cat: c.name,
            to: want ? "locked" : "free", by: overrides[c.name] ? "Sonderregel" : "Zeitplan" });
        }
        applied[c.name] = want;
      });
    }
    runNow();

    function warnings() {
      var a = schedule.alerts, out = [], nowMs = Date.now();
      if (!a.enabled) return out;
      if (a.battery_percent > 0 && battery <= a.battery_percent) {
        out.push({ kind: "battery", level: battery <= 10 ? "bad" : "warn", device: "Haustür", percent: battery, volts: 5.7 });
      }
      schedule.cats.forEach(function (c) {
        var p = places[c.name];
        if (!p || p.where !== "outside") return;
        var mins = (nowMs - p.since) / 60000;
        var lockedSince = profileSince[c.name] && applied[c.name] === true ? profileSince[c.name] : null;
        if (a.outside_after_lock_min > 0 && applied[c.name] === true && lockedSince &&
            (nowMs - Math.max(p.since, Date.parse(lockedSince))) / 60000 >= a.outside_after_lock_min) {
          out.push({ kind: "outside_lock", level: "warn", cat: c.name, since: iso(p.since), locked_since: lockedSince });
        } else if (a.outside_long_hours > 0 && mins >= a.outside_long_hours * 60) {
          out.push({ kind: "outside_long", level: "warn", cat: c.name, since: iso(p.since) });
        }
      });
      return out;
    }

    function statusDoc() {
      var naive = now();
      return {
        version: 2, config_ok: true, timezone: tz, paused: !schedule.enabled, api_ok: true,
        problems: [], offline: [], lead_minutes: 0, alerts: clone(schedule.alerts),
        devices: [
          { id: 1, kind: "flap", name: "Haustür", online: true, battery_v: 5.7, battery_pct: battery, signal_db: -65, hub_signal_db: -55 },
          { id: 2, kind: "hub", name: "Wohnzimmer", online: true }
        ],
        pets: Object.keys(places).sort().map(function (n) {
          return { name: n, location: places[n].where, location_since: iso(places[n].since) };
        }),
        warnings: warnings(),
        cats: schedule.cats.map(function (c) {
          var live = catView(c, naive);
          var want = L.desired(live, naive);
          var chg = L.nextChange(live, naive);
          var p = places[c.name];
          return {
            name: c.name, location: p ? p.where : "unknown", location_since: p ? iso(p.since) : null,
            locked: c.name in applied ? applied[c.name] : null, profile_since: profileSince[c.name] || null,
            should_lock: want.locked, source: want.source,
            lock: c.lock, unlock: c.unlock,
            override: live.override ? clone(live.override) : null,
            next_change: { at: chg.at, to: chg.to }
          };
        })
      };
    }

    function delay(v) { return new Promise(function (res) { setTimeout(function () { res(v); }, 120); }); }

    return {
      demo: true,
      getRepo: function () { return delay({ defaultBranch: "main", isPrivate: true, fullName: "demo/katzenklappe" }); },
      getStatus: function () { return delay(statusDoc()); },
      getHistory: function () { return delay(clone(history)); },
      getOverrides: function () { return delay(clone(overrides)); },
      setOverrides: function (o) { overrides = clone(o); return delay(true); },
      getSchedule: function () { return delay(clone(schedule)); },
      setSchedule: function (text) {
        var s = JSON.parse(text);
        schedule = L.normalizeSchedule(s);
        schedule.lead_minutes = 0;
        schedule.cats.forEach(function (c) { if (!(c.name in places)) places[c.name] = { where: "inside", since: Date.now() }; });
        return delay(true);
      },
      dispatch: function () {
        var id = nextId++;
        lastRun = { id: id, event: "workflow_dispatch", status: "queued", conclusion: null, at: Date.now() };
        setTimeout(function () {
          runNow();
          lastRun = { id: id, event: "workflow_dispatch", status: "completed", conclusion: "success", at: Date.now() };
        }, runDelay);
        return delay({ runId: id });
      },
      runs: function () {
        var stamp = new Date(lastRun.at).toISOString();
        return delay([{ id: lastRun.id, event: lastRun.event, status: lastRun.status, conclusion: lastRun.conclusion,
          createdAt: stamp, startedAt: stamp, updatedAt: stamp }]);
      },
      diagnose: function () {
        return delay([
          { label: "Repository erreichbar", ok: true, detail: "demo/katzenklappe" },
          { label: "Stand lesen (Contents: Read)", ok: true, detail: "" },
          { label: "Einstellungen lesen (Variables: Read)", ok: true, detail: "" },
          { label: "Läufe sehen (Actions: Read)", ok: true, detail: "" }
        ]);
      }
    };
  }

  return { createDemo: createDemo };
});
