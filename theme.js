/* Katzenklappe - Tag und Nacht.
 * Tag ist sonnengelb, Nacht ist violett. "Automatisch" folgt Sonnenauf- und -untergang, sobald ein Standort
 * eingestellt ist, sonst 7:00 bis 19:00 Uhr. Die Datei wird vor dem Seitenaufbau geladen, damit nichts aufblitzt.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.KLTheme = api;
  }
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  var KEY = "klappe.theme";
  var SUN_KEY = "klappe.sun";
  var MODES = ["auto", "system", "day", "night"];
  var PAL_KEY = "klappe.palette";
  var PALETTES = [
    { id: "sonne", name: "Sonnengelb", day: "#FFD84A", night: "#2A2565" },
    { id: "rosa", name: "Rosa", day: "#FF9EC4", night: "#4A1D4F" },
    { id: "flieder", name: "Flieder", day: "#C9A8FF", night: "#2B1F5C" },
    { id: "mint", name: "Mint", day: "#8FDDB8", night: "#12383A" },
    { id: "himmel", name: "Himmelblau", day: "#8CD3F5", night: "#14284F" },
    { id: "pfirsich", name: "Pfirsich", day: "#FFB38A", night: "#4A2330" }
  ];
  function palette(id) {
    for (var i = 0; i < PALETTES.length; i++) if (PALETTES[i].id === id) return PALETTES[i];
    return PALETTES[0];
  }
  var DEFAULT_TZ = "Europe/Berlin";

  function toMin(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }

  // Wahl ("auto" | "system" | "day" | "night") -> "day" oder "night".
  // sun: { date, sunrise, sunset } (nur wenn date heute ist, sonst Standardzeiten), today: "YYYY-MM-DD"
  function resolve(mode, nowMin, sun, systemDark, today) {
    if (mode === "day" || mode === "night") return mode;
    if (mode === "system") return systemDark ? "night" : "day";
    var rise = null, set = null;
    if (sun && (!today || sun.date === today)) { rise = toMin(sun.sunrise); set = toMin(sun.sunset); }
    if (rise == null || set == null || rise >= set) { rise = 7 * 60; set = 19 * 60; }
    return nowMin >= rise && nowMin < set ? "day" : "night";
  }

  // Uhrzeit (Minuten seit Mitternacht) und Datum in der Zeitzone des Zeitplans
  function clock(tz, when) {
    var d = when || new Date();
    try {
      var parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz || DEFAULT_TZ, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23"
      }).formatToParts(d);
      var o = {};
      parts.forEach(function (p) { o[p.type] = p.value; });
      return { min: ((+o.hour) % 24) * 60 + (+o.minute), date: o.year + "-" + o.month + "-" + o.day };
    } catch (e) {
      return { min: d.getHours() * 60 + d.getMinutes(), date: d.toISOString().slice(0, 10) };
    }
  }

  var api = { resolve: resolve, clock: clock, MODES: MODES, PALETTES: PALETTES, palette: palette, toMin: toMin };

  var doc = root && root.document;
  if (doc && doc.documentElement) {
    var state = { mode: "auto", pal: "sonne", sun: null, tz: DEFAULT_TZ, theme: "day" };
    var store = {
      get: function (k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } },
      set: function (k, v) { try { root.localStorage.setItem(k, v); } catch (e) { /* egal */ } }
    };
    var saved = store.get(KEY);
    if (MODES.indexOf(saved) >= 0) state.mode = saved;
    var savedPal = store.get(PAL_KEY);
    if (savedPal && palette(savedPal).id === savedPal) state.pal = savedPal;
    try { state.sun = JSON.parse(store.get(SUN_KEY) || "null"); } catch (e) { state.sun = null; }

    api.getMode = function () { return state.mode; };
    api.getPalette = function () { return state.pal; };
    api.setPalette = function (id) {
      state.pal = palette(id).id; store.set(PAL_KEY, state.pal);
      return api.apply();
    };
    api.current = function () { return state.theme; };
    api.setMode = function (m) {
      if (MODES.indexOf(m) < 0) return state.theme;
      state.mode = m; store.set(KEY, m);
      return api.apply();
    };
    // Sonnenzeiten und Zeitzone aus dem Status des Zeitplans übernehmen
    api.setSun = function (sun, tz) {
      if (tz) state.tz = tz;
      state.sun = sun && sun.sunrise && sun.sunset ? { date: sun.date, sunrise: sun.sunrise, sunset: sun.sunset } : null;
      store.set(SUN_KEY, JSON.stringify(state.sun));
      return api.apply();
    };
    api.apply = function () {
      var dark = false;
      try { dark = !!(root.matchMedia && root.matchMedia("(prefers-color-scheme: dark)").matches); } catch (e) { /* hell */ }
      var c = clock(state.tz);
      var theme = resolve(state.mode, c.min, state.sun, dark, c.date);
      state.theme = theme;
      doc.documentElement.setAttribute("data-theme", theme);
      doc.documentElement.setAttribute("data-palette", state.pal);
      var meta = doc.querySelector ? doc.querySelector('meta[name="theme-color"]') : null;
      if (meta) meta.setAttribute("content", palette(state.pal)[theme]);
      return theme;
    };
    api.apply();
  }

  return api;
});
