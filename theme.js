/* Kalender - Hell/Dunkel. Wird vor dem Seitenaufbau geladen, damit nichts aufblitzt.
 * Auswahl: "auto" (wie das Handy), "light", "dark"; gespeichert nur auf diesem Handy. */
(function (root) {
  "use strict";
  var KEY = "kal.theme", MODES = ["auto", "light", "dark"], COLORS = { light: "#FAFAF7", dark: "#0E1014" };
  var mode = "auto";
  function read() { try { var v = root.localStorage.getItem(KEY); return MODES.indexOf(v) >= 0 ? v : "auto"; } catch (e) { return "auto"; } }
  function systemDark() { try { return !!(root.matchMedia && root.matchMedia("(prefers-color-scheme: dark)").matches); } catch (e) { return false; } }
  function resolve() { return mode === "auto" ? (systemDark() ? "dark" : "light") : mode; }
  function apply() {
    var t = resolve(), de = root.document.documentElement;
    de.setAttribute("data-theme", t);
    var meta = root.document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", COLORS[t]);
    return t;
  }
  mode = read();
  apply();
  try {
    var mq = root.matchMedia("(prefers-color-scheme: dark)");
    var on = function () { if (mode === "auto") apply(); };
    if (mq.addEventListener) mq.addEventListener("change", on); else if (mq.addListener) mq.addListener(on);
  } catch (e) { /* egal */ }
  root.KalTheme = {
    MODES: MODES,
    get: function () { return mode; },
    current: function () { return resolve(); },
    set: function (m) {
      mode = MODES.indexOf(m) >= 0 ? m : "auto";
      try { root.localStorage.setItem(KEY, mode); } catch (e) { /* egal */ }
      return apply();
    }
  };
})(typeof self !== "undefined" ? self : this);
