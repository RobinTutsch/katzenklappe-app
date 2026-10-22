/* Katzenklappe - Katzengesichter: Fellfarben, Muster und das Gesicht als SVG.
 * Reine Funktionen ohne Zugriff auf Seite oder Speicher (läuft auch in Node für die Tests).
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

  var INK = "#1F1B3F";

  // Fellfarben: Anzeigename und Farbe. Alle sind hell genug für dunkle Schrift (Kontrast mindestens 5:1).
  var COATS = [
    { id: "blaugrau", name: "Blaugrau", hex: "#A9B8E6" },
    { id: "orange", name: "Orange", hex: "#FF9F45" },
    { id: "mint", name: "Mint", hex: "#8FDDB8" },
    { id: "rosa", name: "Rosa", hex: "#FFA9C4" },
    { id: "flieder", name: "Flieder", hex: "#C9A8FF" },
    { id: "himmel", name: "Himmelblau", hex: "#8CD3F5" },
    { id: "sand", name: "Sand", hex: "#F2D9A0" },
    { id: "pfirsich", name: "Pfirsich", hex: "#FFC2A1" },
    { id: "karamell", name: "Karamell", hex: "#D49A62" },
    { id: "limette", name: "Limette", hex: "#C9E87F" },
    { id: "schiefer", name: "Schiefer", hex: "#9CA3BD" },
    { id: "creme", name: "Creme", hex: "#FFF6DC" }
  ];

  function coatIndex(hex) {
    for (var i = 0; i < COATS.length; i++) if (COATS[i].hex.toLowerCase() === String(hex || "").toLowerCase()) return i;
    return -1;
  }
  function coatName(hex) {
    var i = coatIndex(hex);
    return i >= 0 ? COATS[i].name : "";
  }

  // Standard-Look nach Platz in der sortierten Namensliste: jede Katze bekommt eine andere Farbe,
  // abwechselnd mit weißer Schnauze oder mit Streifen.
  function defaultLook(index) {
    var i = Math.max(0, index | 0);
    return { coat: COATS[i % COATS.length].hex, tabby: i % 2 === 1, muzzle: i % 2 === 0 };
  }

  function normalizeLook(l, fallback) {
    var fb = fallback || defaultLook(0);
    if (!l || typeof l !== "object") return { coat: fb.coat, tabby: !!fb.tabby, muzzle: !!fb.muzzle };
    var idx = coatIndex(l.coat);
    return {
      coat: idx >= 0 ? COATS[idx].hex : fb.coat,
      tabby: typeof l.tabby === "boolean" ? l.tabby : !!fb.tabby,
      muzzle: typeof l.muzzle === "boolean" ? l.muzzle : !!fb.muzzle
    };
  }

  function nameKey(n) { return String(n == null ? "" : n).trim().toLowerCase(); }

  // Gespeicherte Looks (Objekt Name -> Look) bereinigen: nur bekannte Farben, nur Wahrheitswerte
  function sanitizeLooks(raw) {
    var out = {};
    if (!raw || typeof raw !== "object") return out;
    Object.keys(raw).forEach(function (k) {
      var key = nameKey(k);
      if (!key || key.length > 40 || !raw[k] || coatIndex(raw[k].coat) < 0) return;
      out[key] = normalizeLook(raw[k]);
    });
    return out;
  }

  // Look einer Katze: gespeicherter Eintrag, sonst Standard nach Platz in der sortierten Liste aller bekannten Namen
  function lookFor(saved, allNames, name) {
    var key = nameKey(name);
    var keys = [], seen = {};
    (allNames || []).concat([name]).forEach(function (n) {
      var k = nameKey(n);
      if (k && !seen[k]) { seen[k] = true; keys.push(k); }
    });
    keys.sort();
    var def = defaultLook(Math.max(0, keys.indexOf(key)));
    var mine = saved && saved[key];
    return mine ? normalizeLook(mine, def) : def;
  }

  // Das Gesicht. asleep: geschlossene Augen (Tier ist gesperrt/schläft). size: Kantenlänge in Pixel oder null (füllt den Rahmen).
  function faceSvg(look, asleep, size) {
    var l = normalizeLook(look);
    var eyes = asleep
      ? '<path d="M26 54q7 7 14 0M60 54q7 7 14 0" fill="none" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>'
      : '<g class="eyes"><ellipse cx="33" cy="53" rx="5.5" ry="7.5" fill="' + INK + '"/><ellipse cx="67" cy="53" rx="5.5" ry="7.5" fill="' + INK + '"/>' +
        '<circle cx="35" cy="50" r="2" fill="#fff"/><circle cx="69" cy="50" r="2" fill="#fff"/></g>';
    var stripes = l.tabby
      ? '<path d="M50 22v11M40 24l2 9M60 24l-2 9M16 52h9M17 61h8M84 52h-9M83 61h-8" stroke="' + INK + '" stroke-opacity=".3" stroke-width="4" stroke-linecap="round" fill="none"/>'
      : "";
    var muzzle = l.muzzle ? '<ellipse cx="50" cy="68" rx="19" ry="13" fill="#fff"/>' : "";
    var dim = size ? ' width="' + size + '" height="' + size + '"' : "";
    return '<svg class="face-svg' + (asleep ? " asleep" : "") + '" viewBox="0 0 100 100"' + dim + ' aria-hidden="true" focusable="false">' +
      '<path d="M13 47L19 9l28 18z M87 47L81 9L53 27z" fill="' + l.coat + '" stroke="' + INK + '" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M22 36l3-15 12 9z M78 36l-3-15-12 9z" fill="#FFB3C1"/>' +
      '<ellipse cx="50" cy="57" rx="40" ry="34" fill="' + l.coat + '" stroke="' + INK + '" stroke-width="4"/>' +
      muzzle + stripes + eyes +
      '<path d="M45 64h10l-5 6z" fill="#FF7A93" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M50 70q-5 6-11 3M50 70q5 6 11 3" fill="none" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/></svg>';
  }

  return {
    COATS: COATS, coatName: coatName, defaultLook: defaultLook, normalizeLook: normalizeLook,
    sanitizeLooks: sanitizeLooks, lookFor: lookFor, faceSvg: faceSvg
  };
});
