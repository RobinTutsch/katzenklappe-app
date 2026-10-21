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

  function createDemo(opts) {
    opts = opts || {};
    var runDelay = opts.runDelay != null ? opts.runDelay : 2500;
    var tz = "Europe/Berlin";
    var schedule = {
      enabled: true, timezone: tz, alert_window_minutes: 45,
      cats: [
        { name: "Tom", lock: "22:00", unlock: "06:30" },
        { name: "Mimo", lock: "23:30", unlock: "05:30" }
      ]
    };
    var overrides = {};
    var locations = { Tom: "outside", Mimo: "inside" };
    var applied = {};
    var lastRun = { id: 1, event: "schedule", status: "completed", conclusion: "success", at: Date.now() - 12 * 60000 };
    var nextId = 2;

    function now() { return L.nowNaive(tz); }

    function catView(c, naive) {
      var live = Object.assign({}, c);
      var o = overrides[Object.keys(overrides).filter(function (k) { return k.toLowerCase() === c.name.toLowerCase(); })[0]];
      live.override = o && o.until > naive ? o : null;
      return live;
    }

    function runNow() {
      var naive = now();
      schedule.cats.forEach(function (c) {
        if (schedule.enabled) applied[c.name] = L.desired(catView(c, naive), naive).locked;
      });
    }
    runNow();

    function statusDoc() {
      var naive = now();
      return {
        version: 1, config_ok: true, timezone: tz, paused: !schedule.enabled, api_ok: true,
        problems: [], offline: [],
        cats: schedule.cats.map(function (c) {
          var live = catView(c, naive);
          var want = L.desired(live, naive);
          var chg = L.nextChange(live, naive);
          return {
            name: c.name, location: locations[c.name] || "unknown",
            locked: c.name in applied ? applied[c.name] : null,
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
      getOverrides: function () { return delay(clone(overrides)); },
      setOverrides: function (o) { overrides = clone(o); return delay(true); },
      getSchedule: function () { return delay(clone(schedule)); },
      setSchedule: function (text) {
        var s = JSON.parse(text);
        schedule = L.normalizeSchedule(s);
        schedule.cats.forEach(function (c) { if (!(c.name in locations)) locations[c.name] = "inside"; });
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
        var iso = new Date(lastRun.at).toISOString();
        return delay([{ id: lastRun.id, event: lastRun.event, status: lastRun.status, conclusion: lastRun.conclusion,
          createdAt: iso, startedAt: iso, updatedAt: iso }]);
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
