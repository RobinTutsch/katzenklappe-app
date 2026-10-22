/* Katzenklappe - App-Sperre mit einem Hauptpasswort.
 *
 * Das Passwort wird nie im Klartext gespeichert: Im privaten Zeitplan-Repository (Variable LOCK_JSON) liegt nur ein
 * Abdruck (PBKDF2-SHA256 mit Salz). Jedes Handy hält eine Kopie davon, damit die Sperre auch ohne Netz greift, und
 * gleicht sie bei jedem Laden ab. Das ist eine Sperre für die App, kein Tresor: Wer den Zugangsschlüssel hat,
 * kommt auch ohne die App an die Daten.
 *
 * Der erste Teil sind reine Funktionen (läuft auch in Node für die Tests), der zweite baut die Bildschirme.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.KLLock = api;
  }
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  var KEY = "klappe.lock.v1";          // lokale Kopie des Abdrucks
  var AFTER_KEY = "klappe.lock.after"; // Minuten Pause bis zur erneuten Abfrage (nur dieses Handy)
  var ITER = 200000;
  var MIN_LEN = 6;
  var MAX_LEN = 200;
  var FLICKER_MS = 3000;               // kürzer weg als das zählt nicht als "Öffnen" (Teilen-Dialog, Tastatur usw.)
  var AFTER_CHOICES = [[0, "Jedes Mal beim Öffnen"], [5, "Nach 5 Minuten Pause"], [30, "Nach 30 Minuten Pause"]];

  var g = typeof globalThis !== "undefined" ? globalThis : (root || {});

  function cryptoObj() { return (root && root.crypto) || g.crypto || null; }
  function subtle() { var c = cryptoObj(); return c && c.subtle ? c.subtle : null; }
  function supported() { return !!subtle() && typeof TextEncoder !== "undefined"; }

  function b64enc(buf) {
    var b = new Uint8Array(buf), s = "";
    for (var i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return g.btoa(s);
  }
  function b64dec(str) {
    var s = g.atob(String(str)), b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }

  async function digest(password, salt, iter) {
    var raw = new TextEncoder().encode(String(password).normalize("NFKC"));
    var base = await subtle().importKey("raw", raw, "PBKDF2", false, ["deriveBits"]);
    return new Uint8Array(await subtle().deriveBits({ name: "PBKDF2", salt: salt, iterations: iter, hash: "SHA-256" }, base, 256));
  }

  // Neuer Abdruck für ein Passwort (wird als JSON in der Variable LOCK_JSON gespeichert)
  async function makeRecord(password, iter) {
    var it = iter || ITER;
    var salt = cryptoObj().getRandomValues(new Uint8Array(16));
    var hash = await digest(password, salt, it);
    return { v: 1, kdf: "PBKDF2-SHA256", iter: it, salt: b64enc(salt), hash: b64enc(hash) };
  }

  function recordOk(r) {
    return !!r && typeof r === "object" && r.v === 1 && r.kdf === "PBKDF2-SHA256" && typeof r.iter === "number" &&
      r.iter >= 1000 && r.iter <= 2000000 && typeof r.salt === "string" && typeof r.hash === "string";
  }

  // true, wenn das Passwort zum Abdruck passt. Kaputter Abdruck: immer false.
  async function verify(record, password) {
    if (!recordOk(record) || typeof password !== "string") return false;
    var salt, want;
    try { salt = b64dec(record.salt); want = b64dec(record.hash); } catch (e) { return false; }
    var got = await digest(password, salt, record.iter);
    if (got.length !== want.length) return false;
    var diff = 0;
    for (var i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
    return diff === 0;
  }

  // null = in Ordnung, sonst der Hinweis für die Person
  function checkPassword(pw) {
    var s = String(pw == null ? "" : pw);
    if (s.length < MIN_LEN) return "Das Passwort braucht mindestens " + MIN_LEN + " Zeichen.";
    if (s.length > MAX_LEN) return "Das Passwort ist zu lang.";
    if (!s.trim()) return "Das Passwort darf nicht nur aus Leerzeichen bestehen.";
    return null;
  }

  // Muss nach der Pause erneut gefragt werden? hiddenMs: so lange war die App im Hintergrund (null = unbekannt)
  function shouldLock(hiddenMs, afterMin) {
    if (hiddenMs == null || isNaN(hiddenMs)) return false;
    return afterMin > 0 ? hiddenMs >= afterMin * 60000 : hiddenMs >= FLICKER_MS;
  }

  // Wartezeit nach Fehlversuchen: ab dem dritten wird es länger (nur Bremse gegen Durchprobieren am Handy)
  function waitSeconds(fails) {
    if (fails < 3) return 0;
    return Math.min(30, Math.pow(2, fails - 2));
  }

  /* ---------- Lokale Kopie ---------- */

  function ls() { try { return (root && root.localStorage) || g.localStorage || null; } catch (e) { return null; } }

  function has() {
    var s = ls();
    try { return !!(s && s.getItem(KEY)); } catch (e) { return false; }
  }
  function read() {
    var s = ls();
    try { var raw = s && s.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return { v: 0 }; }
  }
  function write(rec) {
    var s = ls();
    try { if (s) s.setItem(KEY, JSON.stringify(rec)); return !!s; } catch (e) { return false; }
  }
  function clear() {
    var s = ls();
    try { if (s) s.removeItem(KEY); } catch (e) { /* egal */ }
  }
  function getAfter() {
    var s = ls(), v = 0;
    try { v = parseInt(s && s.getItem(AFTER_KEY), 10); } catch (e) { v = 0; }
    for (var i = 0; i < AFTER_CHOICES.length; i++) if (AFTER_CHOICES[i][0] === v) return v;
    return 0;
  }
  function setAfter(n) {
    var s = ls();
    try { if (s) s.setItem(AFTER_KEY, String(n)); } catch (e) { /* egal */ }
  }

  var api = {
    supported: supported, makeRecord: makeRecord, verify: verify, recordOk: recordOk, checkPassword: checkPassword,
    shouldLock: shouldLock, waitSeconds: waitSeconds,
    has: has, read: read, write: write, clear: clear, getAfter: getAfter, setAfter: setAfter,
    AFTER_CHOICES: AFTER_CHOICES, MIN_LEN: MIN_LEN, KEY: KEY, AFTER_KEY: AFTER_KEY, ITER: ITER
  };

  /* ---------- Bildschirme (nur im Browser) ---------- */

  var doc = root && root.document;
  if (doc && doc.createElement && doc.body !== undefined) {
    var ui = {};

    var el = function (tag, attrs, kids) {
      var n = doc.createElement(tag);
      Object.keys(attrs || {}).forEach(function (k) {
        if (k === "text") n.textContent = attrs[k];
        else if (attrs[k] === true) n.setAttribute(k, "");
        else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k]);
      });
      (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
      return n;
    };

    var setBusy = function (btn, busy, label) {
      btn.disabled = !!busy;
      if (label != null) btn.textContent = label;
    };

    // Vollbild-Sperre. opts: onUnlock(pw) -> Promise (wirft bei falschem Passwort, Fehler mit kind "wrongpw"),
    // onDone(result) nach dem Entsperren, onForgot() entfernt die Verbindung von diesem Handy.
    ui.showUnlock = function (opts) {
      ui.hideUnlock();
      var fails = 0, timer = null, mode = "main";
      var wrap = el("div", { "class": "lk", id: "lk", role: "dialog", "aria-modal": "true", "aria-labelledby": "lk-title" });
      doc.body.appendChild(wrap);
      doc.body.classList.add("lk-open");
      var face = root.KL && root.KL.faceSvg ? root.KL.faceSvg(root.KL.defaultLook(0), true, 96) : "";

      function main() {
        mode = "main";
        wrap.textContent = "";
        var form = el("form", { "class": "lk-card", novalidate: true });
        var faceBox = el("span", { "class": "lk-face", "aria-hidden": "true" });
        faceBox.innerHTML = face; // fest eingebautes SVG aus looks.js, keine Eingaben
        var pw = el("input", { "class": "input", id: "lk-pw", type: "password", autocomplete: "current-password",
          autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "go", "aria-describedby": "lk-err" });
        var err = el("p", { "class": "lk-err", id: "lk-err", role: "alert", hidden: true });
        var go = el("button", { "class": "btn btn-wide", id: "lk-go", type: "submit", text: "Entsperren" });
        var forgot = el("button", { "class": "btn-text", id: "lk-forgot", type: "button", text: "Passwort vergessen?" });
        form.appendChild(faceBox);
        form.appendChild(el("h1", { id: "lk-title", text: "Katzenklappe" }));
        form.appendChild(el("p", { "class": "lk-sub lk-center", text: "Gesperrt. Zum Öffnen bitte das Passwort eingeben." }));
        form.appendChild(el("label", { "class": "sr", "for": "lk-pw", text: "Passwort" }));
        form.appendChild(pw);
        form.appendChild(err);
        form.appendChild(go);
        form.appendChild(forgot);
        wrap.appendChild(form);

        function showErr(t) { err.textContent = t; err.hidden = !t; }
        function tick(until) {
          clearInterval(timer);
          var left = Math.ceil((until - Date.now()) / 1000);
          if (left <= 0) { setBusy(go, false, "Entsperren"); return; }
          setBusy(go, true, "Bitte " + left + " s warten");
          timer = setInterval(function () {
            var l = Math.ceil((until - Date.now()) / 1000);
            if (l <= 0) { clearInterval(timer); setBusy(go, false, "Entsperren"); pw.focus(); }
            else go.textContent = "Bitte " + l + " s warten";
          }, 500);
        }

        form.addEventListener("submit", function (ev) {
          ev.preventDefault();
          if (go.disabled) return;
          var value = pw.value;
          if (!value) { showErr("Bitte das Passwort eingeben."); pw.focus(); return; }
          showErr("");
          setBusy(go, true, "Prüfe …");
          Promise.resolve().then(function () { return opts.onUnlock(value); }).then(function (result) {
            clearInterval(timer);
            ui.hideUnlock();
            if (opts.onDone) opts.onDone(result);
          }, function (e) {
            pw.value = "";
            setBusy(go, false, "Entsperren");
            if (e && e.kind === "wrongpw") {
              fails++;
              showErr("Das Passwort stimmt nicht.");
              var w = waitSeconds(fails);
              if (w) tick(Date.now() + w * 1000); else pw.focus();
            } else {
              showErr("Das ging gerade nicht. Bitte noch einmal versuchen.");
              pw.focus();
            }
          });
        });
        forgot.addEventListener("click", forgotView);
        setTimeout(function () { if (doc.getElementById("lk-pw")) pw.focus(); }, 30);
      }

      function forgotView() {
        mode = "forgot";
        clearInterval(timer);
        wrap.textContent = "";
        var card = el("div", { "class": "lk-card" });
        card.appendChild(el("h1", { id: "lk-title", text: "Passwort vergessen?" }));
        card.appendChild(el("p", { "class": "lk-sub", text: "Das Passwort kann nur dort zurückgesetzt werden, wo es gespeichert ist: bei GitHub im privaten Zeitplan-Repository unter Settings → Secrets and variables → Actions → Variables. Dort die Variable LOCK_JSON löschen. Danach lässt sich die App wieder ohne Passwort öffnen." }));
        card.appendChild(el("p", { "class": "lk-sub", text: "Alternativ kannst du die Verbindung auf diesem Handy löschen und die App mit dem Einrichtungs-Link neu verbinden." }));
        var back = el("button", { "class": "btn btn-wide", id: "lk-back", type: "button", text: "Zurück" });
        var wipe = el("button", { "class": "btn btn-wide btn-danger", id: "lk-wipe", type: "button", text: "Verbindung auf diesem Handy löschen" });
        card.appendChild(back);
        card.appendChild(wipe);
        wrap.appendChild(card);
        back.addEventListener("click", main);
        wipe.addEventListener("click", function () {
          if (mode === "forgot") {
            mode = "confirm-wipe";
            wipe.textContent = "Ja, wirklich löschen";
            return;
          }
          ui.hideUnlock();
          if (opts.onForgot) opts.onForgot();
        });
        back.focus();
      }

      main();
      ui.cancelTimer = function () { clearInterval(timer); };
    };

    ui.hideUnlock = function () {
      if (ui.cancelTimer) ui.cancelTimer();
      var w = doc.getElementById("lk");
      if (w && w.parentNode) w.parentNode.removeChild(w);
      doc.body.classList.remove("lk-open");
    };

    ui.isShowing = function () { return !!doc.getElementById("lk"); };

    // Eingabefenster mit Passwortfeldern. spec: { title, text, submit, danger, fields: [{id, label, auto}],
    //   validate(values) -> Promise<string|null> }. Ergebnis: Werte oder null bei Abbruch.
    ui.askForm = function (spec) {
      return new Promise(function (resolve) {
        var before = doc.activeElement;
        var scrim = el("div", { "class": "scrim lk-scrim" });
        var form = el("form", { "class": "sheet lk-sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": "lkd-title", novalidate: true });
        form.appendChild(el("h2", { id: "lkd-title", text: spec.title }));
        if (spec.text) form.appendChild(el("p", { "class": "sheet-sub", text: spec.text }));
        var inputs = {};
        spec.fields.forEach(function (f) {
          var id = "lkd-" + f.id;
          var input = el("input", { "class": "input", id: id, type: "password", autocomplete: f.auto || "off",
            autocapitalize: "off", autocorrect: "off", spellcheck: "false" });
          inputs[f.id] = input;
          form.appendChild(el("div", { "class": "field" }, [el("label", { "for": id, text: f.label }), input]));
        });
        var show = el("input", { type: "checkbox", id: "lkd-show" });
        form.appendChild(el("label", { "class": "lk-show", "for": "lkd-show" }, [show, el("span", { text: "Passwort anzeigen" })]));
        var err = el("p", { "class": "lk-err", id: "lkd-err", role: "alert", hidden: true });
        form.appendChild(err);
        var ok = el("button", { "class": "btn btn-wide" + (spec.danger ? " btn-danger" : ""), type: "submit", id: "lkd-ok", text: spec.submit });
        var cancel = el("button", { "class": "btn btn-quiet btn-wide", type: "button", id: "lkd-cancel", text: "Abbrechen" });
        form.appendChild(el("div", { "class": "stack" }, [ok, cancel]));
        scrim.appendChild(form);
        doc.body.appendChild(scrim);

        function close(result) {
          doc.removeEventListener("keydown", onKey, true);
          if (scrim.parentNode) scrim.parentNode.removeChild(scrim);
          if (before && before.focus) { try { before.focus(); } catch (e) { /* egal */ } }
          resolve(result);
        }
        function onKey(ev) { if (ev.key === "Escape") { ev.stopPropagation(); close(null); } }
        doc.addEventListener("keydown", onKey, true);
        cancel.addEventListener("click", function () { close(null); });
        scrim.addEventListener("click", function (ev) { if (ev.target === scrim) close(null); });
        show.addEventListener("change", function () {
          Object.keys(inputs).forEach(function (k) { inputs[k].type = show.checked ? "text" : "password"; });
        });
        form.addEventListener("submit", function (ev) {
          ev.preventDefault();
          if (ok.disabled) return;
          var values = {};
          Object.keys(inputs).forEach(function (k) { values[k] = inputs[k].value; });
          err.hidden = true;
          setBusy(ok, true, "Einen Moment …");
          Promise.resolve().then(function () { return spec.validate ? spec.validate(values) : null; }).then(function (msg) {
            if (msg) {
              err.textContent = msg; err.hidden = false;
              setBusy(ok, false, spec.submit);
              return;
            }
            close(values);
          }, function () {
            err.textContent = "Das ging gerade nicht. Bitte noch einmal versuchen."; err.hidden = false;
            setBusy(ok, false, spec.submit);
          });
        });
        var first = spec.fields.length ? inputs[spec.fields[0].id] : ok;
        setTimeout(function () { first.focus(); }, 30);
      });
    };

    api.ui = ui;
  }

  return api;
});
