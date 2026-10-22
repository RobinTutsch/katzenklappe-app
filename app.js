/* Katzenklappe - Oberfläche */
(function () {
  "use strict";

  var L = window.KL;
  var $app = document.getElementById("app");
  var CFG_KEY = "klappe.cfg.v1";
  var CACHE_KEY = "klappe.cache.v1";
  var HINT_KEY = "klappe.hint.install";
  var VERSION = "1.2";
  var STALE_MINUTES = 100;      // so lange darf der letzte Lauf zurückliegen
  var POLL_MS = 4000;
  var WAIT_MAX_MS = 240000;

  var S = {
    cfg: null, api: null, demo: false,
    tab: "home",
    status: null, runs: null, overrides: null, history: null, histFilter: null, histShown: 30,
    loading: false, error: null, fetchedAt: null, fromCache: false,
    pending: {},
    sheet: null,
    toast: null,
    draft: null, saved: null, scheduleLoaded: false, scheduleError: null,
    vacForm: null, vacError: "", shortcut: null,
    diag: null, diagBusy: false,
    installEvt: null, setupError: "", setupBusy: false,
    online: navigator.onLine !== false
  };

  /* ---------- Hilfen ---------- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* egal */ } }

  function clockNaive() {
    return L.nowNaive(S.status && S.status.timezone || L.DEFAULT_TZ);
  }
  function catByName(status, name) {
    if (!status) return null;
    var list = status.cats || [];
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return null;
  }
  function isStandalone() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  }

  var I = {
    moon: '<svg class="cat-icon" viewBox="0 0 48 48" fill="currentColor" aria-hidden="true"><path d="M41 30.5A18 18 0 0 1 17.5 7 18.5 18.5 0 1 0 41 30.5z"/></svg>',
    sun: '<svg class="cat-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" aria-hidden="true"><circle cx="24" cy="24" r="8.5" fill="currentColor" stroke="none"/><path d="M24 4.5v6M24 37.5v6M4.5 24h6M37.5 24h6M10.2 10.2l4.2 4.2M33.6 33.6l4.2 4.2M10.2 37.8l4.2-4.2M33.6 14.4l4.2-4.2"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 21V11a6.5 6.5 0 0 1 13 0v10"/><path d="M3 21h18"/><path d="M9.5 21v-5.5h5V21"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.5 2"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="18.5" cy="12" r="1.9"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.01"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.4v.01"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
    no: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20"/><circle cx="4.5" cy="6.5" r=".9" fill="currentColor"/><circle cx="4.5" cy="12" r=".9" fill="currentColor"/><circle cx="4.5" cy="17.5" r=".9" fill="currentColor"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>',
    inn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 7L7 17M15 17H7V9"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/></svg>',
    unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8.5 11V8a3.5 3.5 0 0 1 6.6-1.4"/></svg>'
  };

  /* ---------- Speicher ---------- */

  function loadCfg() {
    var raw = lsGet(CFG_KEY);
    if (!raw) return null;
    try {
      var c = JSON.parse(raw);
      return c && c.owner && c.repo && c.token ? c : null;
    } catch (e) { return null; }
  }
  function saveCfg(cfg) { lsSet(CFG_KEY, JSON.stringify(cfg)); }

  function cacheSave() {
    if (S.demo || !S.cfg || !S.status) return;
    lsSet(CACHE_KEY, JSON.stringify({ key: S.cfg.owner + "/" + S.cfg.repo, status: S.status, runs: S.runs, at: S.fetchedAt,
      history: S.history ? S.history.slice(0, 80) : null }));
  }
  function cacheLoad() {
    var raw = lsGet(CACHE_KEY);
    if (!raw) return null;
    try {
      var c = JSON.parse(raw);
      return c && c.key === S.cfg.owner + "/" + S.cfg.repo ? c : null;
    } catch (e) { return null; }
  }

  /* ---------- Verbinden ---------- */

  function startApp(cfg, api, demo) {
    S.cfg = cfg; S.api = api; S.demo = !!demo;
    S.status = null; S.runs = null; S.error = null; S.fetchedAt = null; S.fromCache = false;
    S.history = null; S.histFilter = null; S.histShown = 30;
    S.pending = {}; S.sheet = null; S.draft = null; S.saved = null; S.scheduleLoaded = false; S.scheduleError = null;
    S.tab = "home";
    if (!demo) {
      var cached = cacheLoad();
      if (cached) {
        S.status = cached.status; S.runs = cached.runs; S.fetchedAt = cached.at; S.fromCache = true;
        S.history = Array.isArray(cached.history) ? cached.history : null;
      }
    }
    render();
    return refresh(true);
  }

  async function tryConnect(cfg) {
    S.setupBusy = true; S.setupError = ""; render();
    var api = new L.GitHub(cfg);
    try {
      await api.getRepo();
    } catch (e) {
      S.setupBusy = false;
      var text = L.errorText(e);
      if (e.kind === "notfound") text = "Das Repository wurde nicht gefunden. Name und Rechte des Schlüssels prüfen.";
      S.setupError = text;
      render();
      return false;
    }
    S.setupBusy = false;
    saveCfg(cfg);
    await startApp(cfg, api, false);
    return true;
  }

  function startDemo() {
    var api = L.createDemo();
    S.cfg = { owner: "demo", repo: "katzenklappe", token: "demo" };
    return startApp(S.cfg, api, true);
  }

  function logout() {
    lsDel(CFG_KEY); lsDel(CACHE_KEY);
    S.cfg = null; S.api = null; S.demo = false; S.status = null; S.runs = null; S.history = null; S.pending = {};
    S.setupError = ""; S.tab = "home";
    render();
  }

  /* ---------- Daten holen ---------- */

  // light = ohne Verlauf (beim Warten auf einen Lauf wird er nicht gebraucht)
  async function fetchState(light) {
    var res = await Promise.all([
      S.api.getStatus(),
      S.api.runs().catch(function () { return null; }),
      S.api.getOverrides().catch(function () { return null; }),
      light || !S.api.getHistory ? Promise.resolve(null) : S.api.getHistory().catch(function () { return null; })
    ]);
    S.status = res[0];
    if (res[1]) S.runs = res[1];
    S.overrides = res[2];
    if (Array.isArray(res[3])) S.history = res[3];
    S.fetchedAt = Date.now();
    S.fromCache = false;
    cacheSave();
    return res;
  }

  async function refresh(quiet) {
    if (S.loading || !S.api) return;
    S.loading = true;
    if (!quiet) render();
    try {
      await fetchState();
      S.error = null;
    } catch (e) {
      S.error = e;
    }
    S.loading = false;
    render();
  }

  /* ---------- Rechnen mit dem Stand ---------- */

  function newestRun() { return S.runs && S.runs.length ? S.runs[0] : null; }
  function minutesSince(iso) {
    var t = Date.parse(iso);
    return isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 60000));
  }
  function lastCheckLabel() {
    var r = newestRun();
    if (!r) return null;
    var m = minutesSince(r.updatedAt || r.createdAt);
    return m == null ? null : L.agoLabel(m);
  }
  function lastFinishedRun() {
    var list = S.runs || [];
    for (var i = 0; i < list.length; i++) if (list[i].status === "completed") return list[i];
    return null;
  }
  function isStale() {
    var r = newestRun();
    if (!r) return false;
    var m = minutesSince(r.createdAt);
    return m != null && m > STALE_MINUTES;
  }

  function health() {
    var st = S.status;
    if (S.demo) return { tone: "idle", label: "Demo" };
    if (S.error && !st) return { tone: "bad", label: "Keine Verbindung" };
    if (!st) return { tone: "idle", label: "Noch kein Stand" };
    if (st.config_ok === false || st.api_ok === false) return { tone: "bad", label: "Störung" };
    if ((st.offline || []).length) return { tone: "warn", label: "Hub offline" };
    if (st.paused) return { tone: "warn", label: "Pausiert" };
    var f = lastFinishedRun();
    if (f && f.conclusion && f.conclusion !== "success") return { tone: "warn", label: "Lauf fehlgeschlagen" };
    if (isStale()) return { tone: "warn", label: "Lauf fehlt" };
    if ((st.problems || []).length) return { tone: "warn", label: "Hinweis" };
    if ((st.warnings || []).length) return { tone: "warn", label: "Warnung" };
    return { tone: "ok", label: "Alles in Ordnung" };
  }

  /* ---------- Ansichten ---------- */

  function noteHtml(tone, title, lines, actionsHtml) {
    return '<div class="note" data-tone="' + tone + '" role="' + (tone === "bad" ? "alert" : "status") + '">' +
      (tone === "info" ? I.info : I.warn) +
      '<div class="note-body"><p><strong>' + esc(title) + "</strong></p>" +
      (lines || []).map(function (l) { return "<p>" + esc(l) + "</p>"; }).join("") +
      (actionsHtml ? '<div class="note-actions">' + actionsHtml + "</div>" : "") +
      "</div></div>";
  }

  function headerHtml() {
    var h = health();
    return '<header class="top"><span class="brand">Katzenklappe</span>' +
      '<span class="pill" data-tone="' + h.tone + '"><span class="dot"></span>' + esc(h.label) + "</span></header>";
  }

  function bannersHtml() {
    var st = S.status, out = "";
    if (!S.online) {
      out += noteHtml("warn", "Du bist offline.", [S.fetchedAt ? "Angezeigt wird der Stand von " + L.agoLabel(Math.floor((Date.now() - S.fetchedAt) / 60000)) + "." : ""]);
    } else if (S.error) {
      out += noteHtml("bad", "Der aktuelle Stand konnte nicht geladen werden.", [L.errorText(S.error)],
        '<button class="note-btn" data-action="refresh">Nochmal versuchen</button>' +
        (S.error.kind === "auth" || S.error.kind === "forbidden" ? '<button class="note-btn" data-action="goto-more">Verbindung prüfen</button>' : ""));
    }
    if (!st) {
      if (!S.error) {
        out += noteHtml("info", "Es gibt noch keinen Stand.",
          ["Der Zeitplan hat noch nicht gelaufen. Du kannst ihn jetzt einmal starten."],
          '<button class="note-btn" data-action="run-now">Jetzt starten</button>');
      }
      return out;
    }
    if (st.config_ok === false) {
      out += noteHtml("bad", "Der Zeitplan hat einen Fehler.", st.problems || [],
        '<button class="note-btn" data-action="goto-times">Zeiten öffnen</button>');
    } else if (st.api_ok === false) {
      out += noteHtml("bad", "Sure Petcare war beim letzten Lauf nicht erreichbar.", st.problems || []);
    } else if ((st.problems || []).length) {
      out += noteHtml("warn", "Beim letzten Lauf gab es ein Problem.", st.problems);
    }
    if ((st.offline || []).length) {
      out += noteHtml("warn", "Hub oder Klappe ist offline.",
        ["Offline: " + st.offline.join(", ") + ". Sperren kommen so nicht an der Klappe an. Strom und Internet des Hubs prüfen."]);
    }
    if (st.paused) {
      out += noteHtml("warn", "Der Zeitplan ist pausiert.", ["Die Klappe wird nicht automatisch umgestellt."],
        '<button class="note-btn" data-action="goto-times">Zu den Zeiten</button>');
    }
    var f = lastFinishedRun();
    if (f && f.conclusion && f.conclusion !== "success" && st.config_ok !== false && st.api_ok !== false) {
      out += noteHtml("warn", "Der letzte Lauf ist fehlgeschlagen.", ["Die Details stehen bei GitHub unter „Actions“."]);
    }
    if (isStale() && !S.demo) {
      var m = minutesSince(newestRun().createdAt);
      out += noteHtml("warn", "Der Zeitplan hat sich länger nicht gemeldet.",
        ["Der letzte Lauf war " + L.agoLabel(m) + ". Bei GitHub unter „Actions“ nachsehen, ob der Zeitplan noch aktiv ist."]);
    }
    var tz = st.timezone || L.DEFAULT_TZ, nowMs = Date.now();
    (st.warnings || []).forEach(function (w) {
      var text = L.warningText(w, tz, nowMs);
      if (text) out += noteHtml(w.level === "bad" ? "bad" : "warn", L.warningTitle(w), [text]);
    });
    return out;
  }

  function installHintHtml() {
    if (S.demo || isStandalone() || lsGet(HINT_KEY) === "1") return "";
    var btn = S.installEvt
      ? '<button class="note-btn" data-action="install">Installieren</button>'
      : "";
    return noteHtml("info", "Als App auf den Startbildschirm legen",
      S.installEvt ? ["Dann öffnet sich die Klappe mit einem Tipp wie jede andere App."]
        : ["Im Chrome-Menü (drei Punkte oben rechts) „Zum Startbildschirm hinzufügen“ wählen."],
      btn + '<button class="note-btn" data-action="hint-dismiss">Nicht mehr zeigen</button>');
  }

  function segHtml(list) {
    return list.map(function (s) {
      return '<span class="bar-seg" style="left:' + s.from.toFixed(3) + "%;width:" + (s.to - s.from).toFixed(3) + '%"></span>';
    }).join("");
  }

  // Tagesleiste: gesperrte Abschnitte (Liste in Prozent), Jetzt-Markierung (oder null), Text darunter
  function barHtml(segs, nowPct, caption) {
    return '<div class="bar"><div class="bar-track">' + segHtml(segs) + "</div>" +
      (nowPct == null ? "" : '<span class="bar-now" style="left:' + nowPct.toFixed(3) + '%"></span>') + "</div>" +
      (caption ? '<p class="bar-caption">' + esc(caption) + "</p>" : "");
  }

  // Leiste fuer ein Tier aus dem Status (Plan, sonst die alten Felder lock/unlock)
  function catBarHtml(c, naive) {
    var day = naive.slice(0, 10);
    if (c.plan) {
      return barHtml(L.planSegments(c.plan, day), L.nowPercent(naive),
        L.planCaption(c.plan, day, c.lock && c.unlock ? [c.lock, c.unlock] : null));
    }
    if (c.lock && c.unlock) {
      return barHtml(L.barSegments(c.lock, c.unlock), L.nowPercent(naive), "Gesperrt von " + c.lock + " bis " + c.unlock + " Uhr");
    }
    return "";
  }

  function pendingTexts(p) {
    switch (p.phase) {
      case "saving": return ["Wird gespeichert …", ""];
      case "dispatch": return ["Lauf wird gestartet …", ""];
      case "waiting": return ["Klappe wird umgestellt …", "Das dauert etwa eine Minute. Du kannst die App schließen."];
      case "slow": return ["Das dauert länger als üblich.", "Die Änderung ist gespeichert. Der nächste automatische Lauf übernimmt sie spätestens in etwa 30 Minuten."];
      case "nodispatch": return ["Gespeichert, aber der Lauf startet nicht sofort.", "Der nächste automatische Lauf übernimmt es spätestens in etwa 30 Minuten. " + L.errorText(p.error)];
      case "failed": return ["Der Lauf ist fehlgeschlagen.", "Die Änderung ist gespeichert. Details stehen bei GitHub unter „Actions“."];
      default: return ["Das hat nicht geklappt.", p.error ? L.errorText(p.error) : ""];
    }
  }
  function pendingDone(p) { return ["slow", "nodispatch", "failed", "error"].indexOf(p.phase) >= 0; }

  function busyHtml(key, p) {
    var t = pendingTexts(p), done = pendingDone(p);
    return '<div class="busy" role="status"><p class="busy-text">' + esc(t[0]) + "</p>" +
      (t[1] ? '<p class="busy-sub">' + esc(t[1]) + "</p>" : "") +
      (done ? '<div class="cat-actions"><button class="cat-btn" data-action="dismiss-pending" data-key="' + esc(key) + '">Schließen</button></div>'
        : '<div class="progress"></div>') + "</div>";
  }

  // Gespeicherte Sonderregel (Variable) eines Tiers, falls noch nicht abgelaufen
  function savedOverride(name, naive) {
    if (!S.overrides) return null;
    var keys = Object.keys(S.overrides);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].trim().toLowerCase() === name.trim().toLowerCase()) {
        var o = S.overrides[keys[i]];
        return o && o.until > naive ? o : null;
      }
    }
    return null;
  }

  // Text, wenn die gespeicherte Sonderregel noch nicht vom Zeitplan übernommen wurde
  function queuedLabel(c, naive) {
    if (!S.overrides) return "";
    var saved = savedOverride(c.name, naive), cur = L.activeOverride(c, naive);
    if (!saved && !cur) return "";
    if (saved && cur && saved.state === cur.state && saved.until === cur.until) return "";
    if (!saved) return "Gespeichert: Der Zeitplan gilt wieder. Das wird beim nächsten Lauf übernommen.";
    return "Gespeichert: " + (saved.state === "locked" ? "drinnen bleiben" : "draußen erlaubt") +
      " bis " + L.whenLabel(naive, saved.until) + ". Das wird beim nächsten Lauf übernommen.";
  }

  function descOpts() {
    var st = S.status || {};
    return { lead: st.lead_minutes || 0, tz: st.timezone || L.DEFAULT_TZ, nowMs: Date.now() };
  }

  // Aktivitaet eines Tieres aus dem Verlauf (null, solange der Verlauf fehlt)
  function activityOf(pet) {
    if (!S.history) return null;
    var o = descOpts();
    return L.activityFor(S.history, pet, o.tz, o.nowMs, 7);
  }

  function catCardHtml(c, naive) {
    var d = L.describeCat(c, naive, descOpts());
    var activity = L.activityLine(activityOf(c));
    var p = S.pending[c.name];
    var html = '<section class="cat" data-tone="' + d.tone + '" aria-label="' + esc(c.name) + '">' +
      '<div class="cat-head"><h2 class="cat-name">' + esc(c.name) + "</h2>" + (d.tone === "night" ? I.moon : I.sun) + "</div>" +
      '<p class="cat-state">' + esc(d.headline) + "</p>" +
      (d.sub ? '<p class="cat-sub">' + esc(d.sub) + "</p>" : "") +
      (d.locationText ? '<p class="cat-where">' + esc(d.locationText) + "</p>" : "") +
      (activity ? '<p class="cat-activity">' + esc(activity) + "</p>" : "") +
      catBarHtml(c, naive) +
      (d.override ? '<p class="cat-override">' + esc(d.overrideLabel) + "</p>" : "");
    var queued = p ? "" : queuedLabel(c, naive);
    if (queued) html += '<p class="cat-override" data-queued="1">' + esc(queued) + "</p>";
    if (p) {
      html += busyHtml(c.name, p);
    } else {
      html += '<div class="cat-actions"><button class="cat-btn" data-action="open-sheet" data-name="' + esc(c.name) + '" data-locked="' + (d.wantLocked ? "0" : "1") + '">' +
        (d.wantLocked ? "Jetzt rauslassen" : "Jetzt drinnen lassen") + "</button>" +
        (d.override || savedOverride(c.name, naive) ? '<button class="cat-link" data-action="clear-override" data-name="' + esc(c.name) + '">Zeitplan wieder gelten lassen</button>' : "") +
        "</div>";
    }
    return html + "</section>";
  }

  function bulkHtml() {
    var st = S.status;
    if (!st || (st.cats || []).length < 2) return "";
    var naive = clockNaive(), p = S.pending["__bulk"];
    var any = (st.cats || []).some(function (c) { return c.override; }) || (S.overrides && Object.keys(L.pruneOverrides(S.overrides, naive)).length);
    return '<section class="card" aria-label="Alle Tiere"><h2 class="card-title">Alle Tiere</h2>' +
      '<p class="card-sub">Gilt für alle Tiere mit Zeitplan auf einmal.</p>' +
      (p ? busyHtml("__bulk", p)
        : '<div class="cat-actions"><button class="cat-btn" data-action="open-bulk" data-locked="1">Alle drinnen lassen</button>' +
          '<button class="cat-btn" data-action="open-bulk" data-locked="0">Alle rauslassen</button>' +
          (any ? '<button class="cat-link" data-action="clear-all-overrides">Für alle den Zeitplan wieder gelten lassen</button>' : "") + "</div>") +
      "</section>";
  }

  // Hinweis auf laufenden oder bald beginnenden Urlaub
  function vacationNoteHtml(naive) {
    var st = S.status, today = naive.slice(0, 10), soon = L.addDays(today + "T00:00", 7).slice(0, 10);
    var list = (st && st.vacations) || [];
    var now = list.filter(function (v) { return v.from <= today && today <= v.to; });
    var next = list.filter(function (v) { return v.from > today && v.from <= soon; });
    if (!now.length && !next.length) return "";
    var lines = now.map(function (v) {
      return vacWho(v) + ": " + vacWhat(v) + " bis " + fmtDate(v.to, v.to.slice(0, 4) !== today.slice(0, 4)) + (v.note ? " (" + v.note + ")" : "") + ".";
    }).concat(next.map(function (v) {
      return "Ab " + fmtDate(v.from, false) + ": " + vacWho(v) + ", " + vacWhat(v) + (v.note ? " (" + v.note + ")" : "") + ".";
    }));
    return noteHtml("info", now.length ? "Gerade gilt eine Ausnahme vom Wochenplan" : "Bald gilt eine Ausnahme vom Wochenplan", lines,
      '<button class="note-btn" data-action="goto-times">Zu den Zeiten</button>');
  }

  function othersHtml() {
    var st = S.status;
    if (!st || !(st.pets || []).length) return "";
    var scheduled = (st.cats || []).map(function (c) { return c.name.trim().toLowerCase(); });
    var others = st.pets.filter(function (p) { return scheduled.indexOf(p.name.trim().toLowerCase()) < 0; });
    if (!others.length) return "";
    var o = descOpts();
    return '<section class="card" aria-label="Weitere Tiere"><h2 class="card-title">Weitere Tiere</h2>' +
      '<p class="card-sub">Ohne Zeitplan in dieser App.</p><ul class="pet-list">' +
      others.map(function (p) {
        var where = p.location === "inside" ? "drinnen" : p.location === "outside" ? "draußen" : "";
        var since = where && p.location_since ? " " + L.sinceLabel(p.location_since, o.tz, o.nowMs) : "";
        var act = L.activityLine(activityOf(p));
        return '<li class="pet-row"><span class="pet-dot" data-where="' + esc(p.location || "unknown") + '"></span><div>' +
          "<strong>" + esc(p.name) + "</strong>" +
          '<span class="pet-where">' + (where ? esc(where + since) : "Ort unbekannt") + "</span>" +
          (act ? '<span class="pet-act">' + esc(act) + "</span>" : "") + "</div></li>";
      }).join("") + "</ul></section>";
  }

  function gaugeHtml(d, warnAt) {
    var pct = d.battery_pct, tone = L.batteryTone(pct, warnAt);
    var volts = typeof d.battery_v === "number" ? String(d.battery_v).replace(".", ",") + " Volt. " : "";
    return '<div class="gauge" data-tone="' + tone + '">' +
      '<div class="gauge-row"><span>Batterie</span><strong>' + (pct == null ? "unbekannt" : pct + " %") + "</strong></div>" +
      (pct == null ? "" : '<div class="gauge-track" role="img" aria-label="Batterie ' + pct + ' Prozent"><span style="width:' + pct + '%"></span></div>') +
      '<p class="gauge-sub">' + esc(volts + "Die Prozentzahl ist aus der Spannung geschätzt.") + "</p></div>";
  }

  function signalHtml(db) {
    var lvl = L.signalLevel(db);
    return '<div class="sig-row"><span>Funkverbindung</span><span class="sig-val">' +
      '<span class="sig" data-level="' + lvl + '" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
      "<strong>" + esc(L.signalLabel(db)) + "</strong></span></div>";
  }

  function devicesHtml() {
    var st = S.status, devs = (st && st.devices) || [];
    if (!devs.length) return "";
    var a = st.alerts || {};
    var warnAt = a.enabled === false ? 0 : (a.battery_percent == null ? L.DEFAULT_ALERTS.battery_percent : a.battery_percent);
    var html = '<section class="card" aria-label="Klappe und Hub"><h2 class="card-title">Klappe und Hub</h2>';
    devs.filter(function (d) { return d.kind === "flap"; }).forEach(function (d) {
      html += gaugeHtml(d, warnAt) + (typeof d.signal_db === "number" ? signalHtml(d.signal_db) : "");
    });
    html += '<ul class="dev-list">' + devs.map(function (d) {
      var kind = d.kind === "flap" ? "Klappe" : d.kind === "hub" ? "Hub" : "Gerät";
      var state = d.online === true ? "online" : d.online === false ? "offline" : "unbekannt";
      return '<li><span class="dot" data-on="' + (d.online === true ? "1" : d.online === false ? "0" : "") + '"></span>' +
        "<span>" + esc(kind + (d.name ? " „" + d.name + "“" : "")) + "</span><small>" + state + "</small></li>";
    }).join("") + "</ul></section>";
    return html;
  }

  function viewHome() {
    var naive = clockNaive();
    var cats = (S.status && S.status.cats) || [];
    var html = headerHtml() + bannersHtml() + vacationNoteHtml(naive);
    cats.forEach(function (c) { html += catCardHtml(c, naive); });
    html += bulkHtml() + othersHtml() + devicesHtml();
    var ago = lastCheckLabel();
    html += '<div class="meta"><span>' +
      (S.loading ? "Wird aktualisiert …" : (ago ? "Zuletzt geprüft " + esc(ago) : "")) +
      '</span><button data-action="refresh">Aktualisieren</button></div>';
    html += '<div style="height:16px"></div>' + installHintHtml();
    return html;
  }

  /* ----- Verlauf ----- */

  var DAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

  function historyNames() {
    var st = S.status || {}, seen = {}, out = [];
    function add(n) {
      var k = String(n || "").trim().toLowerCase();
      if (k && !seen[k]) { seen[k] = true; out.push(String(n).trim()); }
    }
    (st.cats || []).forEach(function (c) { add(c.name); });
    (st.pets || []).forEach(function (p) { add(p.name); });
    (S.history || []).forEach(function (e) { add(e.cat); });
    return out;
  }

  function petOrStub(name) {
    var st = S.status || {}, key = name.trim().toLowerCase(), i, list = (st.pets || []).concat(st.cats || []);
    for (i = 0; i < list.length; i++) if (list[i].name.trim().toLowerCase() === key) return list[i];
    return { name: name, location: "unknown", location_since: null };
  }

  function weekHtml(name) {
    var pet = petOrStub(name), act = activityOf(pet);
    if (!act || !act.hasData) return "";
    var o = descOpts();
    var firstDay = act.firstT ? L.utcToNaive(act.firstT, o.tz).slice(0, 10) : "9999-99-99";
    var max = Math.max(60, Math.max.apply(null, act.perDay.map(function (d) { return d.minutes; })));
    // Durchschnitt nur aus vollen Tagen (ohne heute) und erst, wenn es mindestens zwei davon gibt
    var done = act.perDay.slice(0, -1).filter(function (d) { return d.date > firstDay; });
    var total = done.reduce(function (n, d) { return n + d.minutes; }, 0);
    var known = done.length;
    var cols = act.perDay.map(function (d, i) {
      var isKnown = d.date >= firstDay, h = isKnown ? Math.max(d.minutes ? 4 : 0, Math.round(d.minutes / max * 100)) : 0;
      var label = i === act.perDay.length - 1 ? "heute" : DAY_SHORT[L.toDate(d.date + "T00:00").getUTCDay()];
      return '<li class="wk-col" data-known="' + (isKnown ? "1" : "0") + '"><span class="wk-val">' +
        esc(isKnown ? L.durationShort(d.minutes) : "–") + '</span><span class="wk-bar"><i style="height:' + h + '%"></i></span>' +
        '<span class="wk-day">' + esc(label) + "</span></li>";
    }).join("");
    return '<section class="card" aria-label="Draußen pro Tag, ' + esc(name) + '"><h2 class="card-title">' + esc(name) + ": Zeit draußen</h2>" +
      '<p class="card-sub">Pro Tag, die letzten 7 Tage' +
      (known >= 2 ? ". Im Schnitt " + esc(L.durationLabel(total / known).replace(/\.$/, "")) + " am Tag." : ". Der Verlauf füllt sich mit jedem Tag.") +
      '</p><ol class="week">' + cols + "</ol></section>";
  }

  function eventRowHtml(r) {
    var icon = r.kind === "lock" ? (r.e.to === "locked" ? I.lock : I.unlock) : r.dir === "out" ? I.out : I.inn;
    var tone = r.kind === "lock" ? "lock" : r.dir === "out" ? "out" : "in";
    return '<li class="ev" data-kind="' + tone + '"><span class="ev-time">' + esc(r.time) + '</span><span class="ev-icon">' + icon +
      '</span><span class="ev-text">' + esc(r.text) +
      (r.outMin != null ? "<small>war " + esc(L.durationLabel(r.outMin)) + " draußen</small>" : "") + "</span></li>";
  }

  function viewHistory() {
    var html = '<h1 class="page-title">Verlauf</h1>';
    if (!S.status && !S.history) {
      return html + (S.error ? noteHtml("bad", "Der Verlauf konnte nicht geladen werden.", [L.errorText(S.error)],
        '<button class="note-btn" data-action="refresh">Nochmal versuchen</button>') : '<p class="muted">Wird geladen …</p>');
    }
    if (!S.history) {
      return html + noteHtml("info", "Der Verlauf ist noch nicht da.", ["Er wird mit dem nächsten Aktualisieren geladen."],
        '<button class="note-btn" data-action="refresh">Aktualisieren</button>');
    }
    var names = historyNames();
    var filter = S.histFilter && names.indexOf(S.histFilter) >= 0 ? S.histFilter : null;
    html += '<div class="chips" role="group" aria-label="Tier wählen">' +
      ['<button class="chip" data-action="hist-filter" data-name="" aria-pressed="' + (filter ? "false" : "true") + '">Alle</button>']
        .concat(names.map(function (n) {
          return '<button class="chip" data-action="hist-filter" data-name="' + esc(n) + '" aria-pressed="' + (filter === n ? "true" : "false") + '">' + esc(n) + "</button>";
        })).join("") + "</div>";
    (filter ? [filter] : names).forEach(function (n) { html += weekHtml(n); });

    var o = descOpts(), nowNv = L.nowNaive(o.tz);
    var rows = L.annotateEvents(S.history, o.tz).filter(function (r) { return !filter || r.name === filter; });
    if (!rows.length) {
      html += '<p class="muted">Noch keine Einträge. Sobald die Klappe benutzt wird, erscheint es hier.</p>';
    } else {
      var shown = rows.slice(0, S.histShown), lastDate = null;
      html += '<h2 class="list-title">Letzte Ereignisse</h2>';
      shown.forEach(function (r) {
        if (r.date !== lastDate) {
          if (lastDate !== null) html += "</ul>";
          html += '<h3 class="day-title">' + esc(L.dayHeading(nowNv, r.date)) + '</h3><ul class="events">';
          lastDate = r.date;
        }
        html += eventRowHtml(r);
      });
      html += "</ul>";
      if (rows.length > shown.length) {
        html += '<div class="stack"><button class="btn btn-quiet btn-wide" data-action="hist-more">Mehr anzeigen (' + (rows.length - shown.length) + ")</button></div>";
      }
    }
    html += '<p class="muted small">Der Verlauf kommt aus der Sure-Cloud und wird bei jedem Lauf ergänzt (etwa alle 30 Minuten). Die letzten drei Wochen bleiben gespeichert.</p>';
    return html;
  }

  /* ----- Zeiten ----- */

  function timesStatusHtml() {
    var p = S.pending["__schedule"];
    if (!p) return "";
    var t = pendingTexts(p), done = pendingDone(p);
    return '<div class="note" data-tone="' + (done && p.phase !== "slow" ? "warn" : "info") + '" role="status">' + I.info +
      '<div class="note-body"><p><strong>' + esc(t[0]) + "</strong></p>" + (t[1] ? "<p>" + esc(t[1]) + "</p>" : "") +
      (done ? '<div class="note-actions"><button class="note-btn" data-action="dismiss-pending" data-key="__schedule">Schließen</button></div>' : "") +
      "</div></div>";
  }

  function saveBarHtml() {
    var errors = L.validateSchedule(S.draft);
    var dirty = !L.sameSchedule(S.draft, S.saved);
    var busy = !!S.pending["__schedule"] && !pendingDone(S.pending["__schedule"]);
    var list = dirty && errors.length
      ? '<ul class="errors">' + errors.map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") + "</ul>" : "";
    return list + '<button class="btn btn-wide" data-action="save-times"' + (!dirty || errors.length || busy ? " disabled" : "") + ">" +
      (dirty ? "Änderungen speichern" : "Keine Änderungen") + "</button>";
  }

  var CITIES = [["Berlin", 52.52, 13.405], ["Hamburg", 53.55, 9.99], ["München", 48.14, 11.58], ["Köln", 50.94, 6.96],
    ["Frankfurt am Main", 50.11, 8.68], ["Stuttgart", 48.78, 9.18], ["Düsseldorf", 51.23, 6.78], ["Leipzig", 51.34, 12.37],
    ["Dresden", 51.05, 13.74], ["Hannover", 52.37, 9.73], ["Nürnberg", 49.45, 11.08], ["Bremen", 53.08, 8.8],
    ["Wien", 48.21, 16.37], ["Zürich", 47.38, 8.54]];
  var OFFSETS = [-120, -90, -60, -45, -30, -15, 0, 15, 30, 45, 60, 90, 120];

  function draftTz() { return (S.draft && S.draft.timezone) || (S.status && S.status.timezone) || L.DEFAULT_TZ; }

  function offsetLabel(n) {
    return n === 0 ? "genau" : Math.abs(n) + " Min. " + (n < 0 ? "vorher" : "nachher");
  }

  // Auswahl "Uhrzeit | Sonnenuntergang | Sonnenaufgang" plus Uhrzeit bzw. Versatz
  function whenEditHtml(base, label, value, attrs) {
    var kind = L.whenKind(value);
    var kinds = [["clock", "Uhrzeit"], ["sunset", "Sonnenuntergang"], ["sunrise", "Sonnenaufgang"]];
    var html = '<div class="when-row"><label class="when-label" for="' + base + '">' + esc(label) + '</label><div class="when-ctrl">' +
      '<select class="select select-sm" id="' + base + '-k" aria-label="Art: ' + esc(label) + '" data-when="kind" ' + attrs + ">" +
      kinds.map(function (k) { return '<option value="' + k[0] + '"' + (k[0] === kind ? " selected" : "") + ">" + k[1] + "</option>"; }).join("") + "</select>";
    if (kind === "clock") {
      html += '<input class="time-input" type="time" id="' + base + '" ' + attrs + ' value="' + esc(L.isHHMM(value) ? value : "") + '">';
    } else {
      var off = L.whenOffset(value), list = OFFSETS.indexOf(off) >= 0 ? OFFSETS : OFFSETS.concat([off]).sort(function (x, y) { return x - y; });
      html += '<select class="select select-sm" id="' + base + '" aria-label="Versatz: ' + esc(label) + '" data-when="offset" ' + attrs + ">" +
        list.map(function (n) { return '<option value="' + n + '"' + (n === off ? " selected" : "") + ">" + offsetLabel(n) + "</option>"; }).join("") + "</select>";
    }
    return html + "</div></div>";
  }

  function modeSwitchHtml(c, i) {
    var mode = L.catMode(c);
    return '<div class="seg" role="group" aria-label="Art des Zeitplans">' + [
      ["daily", "Jeden Tag gleich"], ["weekly", "Je Wochentag"], ["none", "Kein fester Zeitplan"]
    ].map(function (m) {
      return '<button class="seg-btn" data-action="cat-mode" data-idx="' + i + '" data-mode="' + m[0] + '" aria-pressed="' + (mode === m[0]) + '">' + m[1] + "</button>";
    }).join("") + "</div>";
  }

  function ruleHtml(c, i, r, j) {
    var attrs = 'data-idx="' + i + '" data-rule="' + j + '"';
    var days = L.DAY_ABBR.map(function (d, k) {
      return '<button class="chip chip-day" data-action="toggle-day" data-idx="' + i + '" data-rule="' + j + '" data-day="' + k +
        '" aria-pressed="' + (r.days.indexOf(k) >= 0) + '" aria-label="' + L.DAY_NAMES[k] + '">' + d + "</button>";
    }).join("");
    return '<div class="rule"><p class="rule-title">Zeit ' + (j + 1) + "</p>" +
      '<div class="chips chips-days" role="group" aria-label="Wochentage, Zeit ' + (j + 1) + '">' + days + "</div>" +
      '<div class="preset-row">' + [["all", "Alle Tage"], ["week", "Mo–Fr"], ["weekend", "Sa + So"]].map(function (pr) {
        return '<button class="btn-text" data-action="days-preset" data-idx="' + i + '" data-rule="' + j + '" data-preset="' + pr[0] + '">' + pr[1] + "</button>";
      }).join("") + "</div>" +
      whenEditHtml("l" + i + "-" + j, "Ausgang sperren ab", r.lock, attrs + ' data-field="lock"') +
      whenEditHtml("u" + i + "-" + j, "Wieder freigeben um", r.unlock, attrs + ' data-field="unlock"') +
      (c.rules.length > 1 ? '<div class="stack"><button class="btn-text btn-text-danger" data-action="remove-rule" data-idx="' + i + '" data-rule="' + j + '">Diese Zeit entfernen</button></div>' : "") +
      "</div>";
  }

  // Plan der Vorschau aus dem Entwurf (ohne Urlaub); null, solange etwas ungueltig ist
  function previewPlan(c, days) {
    var mode = L.catMode(c);
    var rules = L.catRules(c);
    if (mode === "none") return L.buildPlan([], [], clockNaive().slice(0, 10), days || 7, null, draftTz());
    var ok = rules.length && rules.every(function (r) {
      return L.isWhen(r.lock) && L.isWhen(r.unlock) && L.canonWhen(r.lock) !== L.canonWhen(r.unlock) && r.days.length;
    });
    var loc = L.normalizeLocation(S.draft.location);
    if (!ok || (L.usesSun(rules) && !loc)) return null;
    try {
      return L.buildPlan(rules, [], clockNaive().slice(0, 10), days || 7, loc, draftTz());
    } catch (e) { return null; }
  }

  function previewHtml(c, naive) {
    var mode = L.catMode(c);
    if (mode === "none") {
      return '<p class="muted small">Die Klappe ist nach Zeitplan immer frei. Sonderregeln, Urlaub und „Alle drinnen lassen“ gelten trotzdem.</p>';
    }
    var plan = previewPlan(c, 7);
    if (!plan) return '<p class="muted small">Die Vorschau erscheint, sobald alle Zeiten gültig sind' +
      (L.usesSun(L.catRules(c)) && !L.normalizeLocation(S.draft.location) ? " und der Standort eingestellt ist" : "") + ".</p>";
    var today = naive.slice(0, 10);
    if (mode === "daily") {
      var simple = L.isHHMM(c.lock) && L.isHHMM(c.unlock) ? [c.lock, c.unlock] : null;
      return barHtml(L.planSegments(plan, today), L.nowPercent(naive), L.planCaption(plan, today, simple));
    }
    var rows = "";
    for (var d = 0; d < 7; d++) {
      var day = L.addDays(today + "T00:00", d).slice(0, 10);
      rows += '<div class="wp-row"><span class="wp-day">' + (d === 0 ? "Heute" : L.DAY_ABBR[L.weekdayOf(day)]) + "</span>" +
        barHtml(L.planSegments(plan, day), d === 0 ? L.nowPercent(naive) : null, "") + "</div>";
    }
    return '<div class="wp" role="img" aria-label="Wochenübersicht der Sperrzeiten">' + rows + "</div>" +
      '<p class="bar-caption">' + esc(L.planCaption(plan, today)) + "</p>";
  }

  function catEditHtml(c, i, naive) {
    var mode = L.catMode(c), body = "";
    if (mode === "daily") {
      var attrs = 'data-idx="' + i + '"';
      body = whenEditHtml("l" + i, "Ausgang sperren ab", c.lock, attrs + ' data-field="lock"') +
        whenEditHtml("u" + i, "Wieder freigeben um", c.unlock, attrs + ' data-field="unlock"');
    } else if (mode === "weekly") {
      body = c.rules.map(function (r, j) { return ruleHtml(c, i, r, j); }).join("") +
        (c.rules.length < L.MAX_RULES ? '<div class="stack"><button class="btn btn-quiet" data-action="add-rule" data-idx="' + i + '">Weitere Zeit hinzufügen</button></div>' : "");
    }
    return '<section class="cat-edit">' +
      '<label class="sr" for="n' + i + '">Name des Tiers</label>' +
      '<input class="name-input" id="n' + i + '" data-field="name" data-idx="' + i + '" value="' + esc(c.name) + '" placeholder="Name" autocomplete="off" autocapitalize="words" spellcheck="false">' +
      '<p style="color:var(--ink-2);font-size:14px;margin-top:6px">Genau so geschrieben wie in der Sure-App.</p>' +
      modeSwitchHtml(c, i) + body +
      '<div class="preview" data-preview="' + i + '">' + previewHtml(c, naive) + "</div>" +
      '<div class="stack"><button class="btn-text btn-text-danger" data-action="remove-cat" data-idx="' + i + '">Tier entfernen</button></div>' +
      "</section>";
  }

  /* ----- Standort ----- */

  function locationKey(loc) {
    if (!loc) return "none";
    for (var i = 0; i < CITIES.length; i++) {
      if (loc.label === CITIES[i][0] && Math.abs(loc.lat - CITIES[i][1]) < 0.0005 && Math.abs(loc.lon - CITIES[i][2]) < 0.0005) return "c" + i;
    }
    return loc.label === "Mein Standort" ? "gps" : "custom";
  }

  function sunLineHtml() {
    var loc = L.normalizeLocation(S.draft.location);
    if (!loc) return "";
    var t = L.sunTimes(clockNaive().slice(0, 10), loc.lat, loc.lon, draftTz());
    if (!t[0] || !t[1]) return '<p class="muted small">An diesem Ort geht die Sonne heute nicht auf oder unter.</p>';
    return '<p class="muted small" id="sun-line">Heute: Sonnenaufgang ' + esc(L.timeOf(t[0])) + " Uhr, Sonnenuntergang " + esc(L.timeOf(t[1])) + " Uhr.</p>";
  }

  function locationEditHtml() {
    var loc = S.draft.location, key = locationKey(loc);
    var used = S.draft.cats.some(function (c) { return L.usesSun(L.catRules(c)); });
    var opts = [["none", "Kein Standort"]].concat(CITIES.map(function (c, i) { return ["c" + i, c[0]]; }))
      .concat([["gps", "Mein Standort (GPS)"], ["custom", "Eigene Koordinaten"]]);
    var html = '<section class="section"><h2>Standort</h2>' +
      "<p>Nur nötig, wenn eine Zeit „Sonnenuntergang“ oder „Sonnenaufgang“ heißt." + (used ? "" : " Im Moment nutzt kein Tier das.") + "</p>" +
      '<div class="sel-row"><label for="loc-city">Ort</label><select class="select select-wide" id="loc-city" data-loc="city">' +
      opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === key ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></div>";
    if (key === "custom") {
      html += '<div class="time-row"><label for="loc-lat">Breite (Nord)</label><input class="time-input num-input" type="number" step="0.0001" min="-90" max="90" inputmode="decimal" id="loc-lat" data-locfield="lat" value="' + esc(loc.lat) + '"></div>' +
        '<div class="time-row"><label for="loc-lon">Länge (Ost)</label><input class="time-input num-input" type="number" step="0.0001" min="-180" max="180" inputmode="decimal" id="loc-lon" data-locfield="lon" value="' + esc(loc.lon) + '"></div>';
    } else if (key === "gps") {
      html += '<p class="muted small">Auf etwa einen Kilometer gerundet: ' + esc(String(loc.lat).replace(".", ",") + " / " + String(loc.lon).replace(".", ",")) + ".</p>";
    }
    html += '<div class="stack"><button class="btn btn-quiet" data-action="geolocate">Meinen Standort verwenden</button></div>' +
      '<div id="sun-wrap">' + sunLineHtml() + "</div></section>";
    return html;
  }

  /* ----- Urlaub und Ausnahmen ----- */

  function fmtDate(iso, withYear) {
    var p = iso.split("-");
    return p[2] + "." + p[1] + "." + (withYear ? p[0] : "");
  }
  function vacRange(v, today) {
    var y = today.slice(0, 4), many = v.from.slice(0, 4) !== y || v.to.slice(0, 4) !== y;
    return v.from === v.to ? fmtDate(v.from, many) : fmtDate(v.from, many) + " – " + fmtDate(v.to, many);
  }
  function vacWho(v) { return v.cats && v.cats.length ? v.cats.join(", ") : "Alle Tiere"; }
  function vacWhat(v) { return v.state === "free" ? "draußen erlaubt" : "drinnen bleiben"; }

  function newVacForm() {
    return { from: "", to: "", state: "locked", cats: [], note: "" };
  }

  function vacationEditHtml() {
    var today = clockNaive().slice(0, 10);
    var list = (S.draft.vacations || []).slice().sort(function (a, b) { return a.from < b.from ? -1 : a.from > b.from ? 1 : 0; });
    var f = S.vacForm || (S.vacForm = newVacForm());
    var html = '<section class="section"><h2>Urlaub und Ausnahmen</h2>' +
      "<p>Für ganze Tage: Die Tiere bleiben drinnen oder dürfen den ganzen Tag raus, egal was der Wochenplan sagt.</p>";
    if (list.length) {
      html += '<ul class="vac-list">' + list.map(function (v) {
        var idx = S.draft.vacations.indexOf(v), active = v.from <= today && today <= v.to;
        return '<li class="vac"><div><strong>' + esc(vacRange(v, today)) + "</strong>" + (active ? ' <span class="badge">läuft</span>' : "") +
          "<span>" + esc(vacWho(v) + ": " + vacWhat(v)) + "</span>" + (v.note ? "<small>" + esc(v.note) + "</small>" : "") + "</div>" +
          '<button class="btn-text btn-text-danger" data-action="remove-vac" data-idx="' + idx + '" aria-label="Eintrag ' + esc(vacRange(v, today)) + ' entfernen">Entfernen</button></li>';
      }).join("") + "</ul>";
    } else {
      html += '<p class="muted small">Noch nichts eingetragen.</p>';
    }
    html += '<div class="vac-form"><h3 class="mini-title">Neu eintragen</h3>' +
      '<div class="time-row"><label for="vac-from">Von</label><input class="time-input date-input" type="date" id="vac-from" data-vac="from" min="' + today + '" value="' + esc(f.from) + '"></div>' +
      '<div class="time-row"><label for="vac-to">Bis (einschließlich)</label><input class="time-input date-input" type="date" id="vac-to" data-vac="to" min="' + esc(f.from || today) + '" value="' + esc(f.to) + '"></div>' +
      '<p class="form-label" id="vac-who-l">Für wen</p><div class="chips" role="group" aria-labelledby="vac-who-l">' +
      '<button class="chip" data-action="vac-cat" data-name="" aria-pressed="' + (f.cats.length === 0) + '">Alle</button>' +
      S.draft.cats.filter(function (c) { return c.name.trim(); }).map(function (c) {
        return '<button class="chip" data-action="vac-cat" data-name="' + esc(c.name.trim()) + '" aria-pressed="' + (f.cats.indexOf(c.name.trim()) >= 0) + '">' + esc(c.name.trim()) + "</button>";
      }).join("") + "</div>" +
      '<p class="form-label" id="vac-what-l">Was gilt</p><div class="seg" role="group" aria-labelledby="vac-what-l">' +
      '<button class="seg-btn" data-action="vac-state" data-state="locked" aria-pressed="' + (f.state === "locked") + '">Drinnen bleiben</button>' +
      '<button class="seg-btn" data-action="vac-state" data-state="free" aria-pressed="' + (f.state === "free") + '">Draußen erlaubt</button></div>' +
      '<div class="field"><label for="vac-note">Notiz (freiwillig)</label><input class="input" id="vac-note" data-vac="note" maxlength="80" value="' + esc(f.note) + '" placeholder="z. B. Besuch, Tierarzt" autocomplete="off"></div>' +
      '<div class="stack"><button class="btn btn-quiet" data-action="add-vac">Eintragen</button></div>' +
      (S.vacError ? '<p class="err" role="alert">' + esc(S.vacError) + "</p>" : "") + "</div></section>";
    return html;
  }

  function alertSelectHtml(key, label) {
    var a = S.draft.alerts;
    return '<div class="sel-row"><label for="a-' + key + '">' + esc(label) + '</label>' +
      '<select class="select" id="a-' + key + '" data-alert="' + key + '"' + (a.enabled ? "" : " disabled") + ">" +
      L.alertChoices(key, a[key]).map(function (o) {
        return '<option value="' + o.value + '"' + (o.selected ? " selected" : "") + ">" + esc(o.label) + "</option>";
      }).join("") + "</select></div>";
  }

  function alertsEditHtml() {
    var a = S.draft.alerts;
    return '<section class="section"><h2>Warnungen</h2>' +
      "<p>Meldungen aufs Handy und Hinweise in der App, wenn etwas nicht stimmt.</p>" +
      '<div class="switch-row switch-flush"><div><strong>Warnungen aktiv</strong></div>' +
      '<label class="switch"><span class="sr">Warnungen aktiv</span><input type="checkbox" id="a-enabled" data-alert="enabled"' + (a.enabled ? " checked" : "") + "><span></span></label></div>" +
      alertSelectHtml("outside_after_lock_min", "Noch draußen, obwohl gesperrt, nach") +
      alertSelectHtml("outside_long_hours", "Sehr lange draußen ab") +
      alertSelectHtml("battery_percent", "Batterie schwach ab") +
      '<p class="muted small">Bei „Aus“ gibt es diese Warnung nicht. Dass die Klappe oder der Hub offline ist, wird immer gemeldet.</p></section>';
  }

  async function loadSchedule() {
    if (S.scheduleLoaded || S.scheduleLoading) return;
    S.scheduleLoading = true;
    try {
      var raw = await S.api.getSchedule();
      if (!raw && S.status) {
        raw = {
          enabled: !S.status.paused, timezone: S.status.timezone,
          lead_minutes: S.status.lead_minutes, alerts: S.status.alerts,
          location: S.status.location || null, vacations: S.status.vacations || [],
          cats: (S.status.cats || []).map(function (c) {
            return c.lock && c.unlock ? { name: c.name, lock: c.lock, unlock: c.unlock }
              : { name: c.name, rules: c.rules || [] };
          })
        };
      }
      S.saved = L.normalizeSchedule(raw);
      S.saved.vacations = L.pruneVacations(S.saved.vacations, clockNaive());
      S.draft = clone(S.saved);
      S.vacForm = null; S.vacError = "";
      S.scheduleLoaded = true; S.scheduleError = null;
    } catch (e) {
      S.scheduleError = e;
    }
    S.scheduleLoading = false;
    if (S.tab === "times") render();
  }

  function viewTimes() {
    var html = '<h1 class="page-title">Zeiten</h1>';
    if (!S.scheduleLoaded) {
      loadSchedule();
      return html + (S.scheduleError
        ? noteHtml("bad", "Die Zeiten konnten nicht geladen werden.", [L.errorText(S.scheduleError)],
            '<button class="note-btn" data-action="retry-times">Nochmal versuchen</button>')
        : '<p style="color:var(--ink-2)">Wird geladen …</p>');
    }
    var naive = clockNaive();
    html += '<div id="times-status">' + timesStatusHtml() + "</div>";
    S.draft.cats.forEach(function (c, i) { html += catEditHtml(c, i, naive); });
    html += '<div class="stack"><button class="btn btn-quiet btn-wide" data-action="add-cat">Tier hinzufügen</button></div>';
    html += vacationEditHtml();
    html += locationEditHtml();
    html += alertsEditHtml();
    html += '<div class="switch-row" style="margin-top:20px"><div><strong>Zeitplan aktiv</strong><p>Ausgeschaltet bleibt die Klappe, wie sie ist (z. B. beim Tierarzt).</p></div>' +
      '<label class="switch"><span class="sr">Zeitplan aktiv</span><input type="checkbox" data-field="enabled"' + (S.draft.enabled ? " checked" : "") + "><span></span></label></div>";
    html += '<div class="savebar" id="savebar">' + saveBarHtml() + "</div>";
    return html;
  }

  /* ----- Mehr ----- */

  function diagHtml() {
    if (S.diagBusy) return '<p style="margin-top:12px">Wird geprüft …</p>';
    if (!S.diag) return "";
    return '<ul class="diag">' + S.diag.map(function (d) {
      return "<li>" + (d.ok ? '<span class="ok">' + I.ok + "</span>" : '<span class="no">' + I.no + "</span>") +
        "<span>" + esc(d.label) + (d.ok ? (d.detail ? "<small>" + esc(d.detail) + "</small>" : "")
          : "<small>" + esc(d.detail) + (d.hint ? " " + esc(d.hint) : "") + "</small>") + "</span></li>";
    }).join("") + "</ul>";
  }

  function viewMore() {
    var html = '<h1 class="page-title">Mehr</h1>';
    if (S.demo) {
      html += noteHtml("info", "Das ist die Demo.", ["Nichts davon ist echt. Es wird keine Klappe geschaltet."],
        '<button class="note-btn" data-action="logout">Demo beenden</button>');
    }
    html += '<section class="section"><h2>Verbindung</h2>' +
      "<p>" + (S.demo ? "Demo ohne Verbindung." : "Verbunden mit " + esc(S.cfg.owner + "/" + S.cfg.repo) + ".") + "</p>" +
      '<div class="stack"><button class="btn btn-quiet" data-action="diag">Verbindung testen</button>' +
      (S.demo ? "" : '<button class="btn btn-quiet" data-action="run-now">Zeitplan jetzt ausführen</button>') + "</div>" +
      diagHtml() + "</section>";
    if (!S.demo) {
      html += '<section class="section"><h2>Zweite Person einladen</h2>' +
        "<p>Der Link richtet die App auf einem anderen Handy ein, ohne dass dort etwas getippt werden muss. Er enthält den Zugangsschlüssel: nur an Personen schicken, denen du vertraust.</p>" +
        '<div class="stack"><button class="btn" data-action="share">Link teilen</button>' +
        '<button class="btn btn-quiet" data-action="copy-link">Link kopieren</button></div></section>';
    }
    if (!isStandalone() && !S.demo) {
      html += '<section class="section"><h2>Als App installieren</h2>' +
        "<p>Im Chrome-Menü (drei Punkte oben rechts) „Zum Startbildschirm hinzufügen“ wählen. Danach öffnet sich die Klappe wie jede andere App.</p>" +
        (S.installEvt ? '<div class="stack"><button class="btn btn-quiet" data-action="install">Jetzt installieren</button></div>' : "") +
        "</section>";
    }
    html += '<section class="section"><h2>So funktioniert es</h2>' +
      '<details class="help"><summary>Was heißt „Ausgang gesperrt“?</summary><p>Das Tier kann noch hinein, aber nicht mehr hinaus. Draußen vor der Tür kommt es also immer nach Hause.</p></details>' +
      '<details class="help"><summary>Was macht „Jetzt rauslassen“?</summary><p>Du hebst die Sperre für eine Weile auf, zum Beispiel für eine Stunde. Danach gilt wieder der Zeitplan. Eine laufende Sonderregel kannst du jederzeit beenden.</p></details>' +
      '<details class="help"><summary>Warum dauert es etwa eine Minute?</summary><p>Die App gibt den Auftrag an einen kleinen Dienst weiter, der ihn über die Sure-Cloud an den Hub schickt. Das braucht ein bis zwei Minuten. Die App darf in der Zeit geschlossen werden.</p></details>' +
      '<details class="help"><summary>Was, wenn ich in der Sure-App etwas ändere?</summary><p>Beim nächsten Lauf (alle 30 Minuten) stellt der Zeitplan die Klappe wieder so, wie es hier eingestellt ist. Für Ausnahmen die Sonderregeln hier benutzen. Die Zeitschaltuhr in der Sure-App am besten ausgeschaltet lassen.</p></details>' +
      '<details class="help"><summary>Warum schaltet die Klappe manchmal ein paar Minuten früher?</summary><p>GitHub startet den Zeitplan nicht immer pünktlich, manchmal erst nach vielen Minuten. Damit trotzdem rechtzeitig gesperrt oder freigegeben wird, gilt der Zeitplan bis zu 8 Minuten früher als eingestellt.</p></details>' +
      '<details class="help"><summary>Wie funktionieren Wochentage und Sonnenuntergang?</summary><p>Unter „Zeiten“ kannst du pro Tier „Je Wochentag“ wählen und mehrere Zeiten eintragen, zum Beispiel unter der Woche früher sperren als am Wochenende. Statt einer Uhrzeit geht auch „Sonnenuntergang“ oder „Sonnenaufgang“, auf Wunsch einige Minuten davor oder danach. Dafür braucht die App einen Standort.</p></details>' +
      '<details class="help"><summary>Was ist „Urlaub und Ausnahmen“?</summary><p>Für ganze Tage kannst du festlegen, dass ein Tier drinnen bleibt oder den ganzen Tag raus darf. Das ersetzt dann den Wochenplan. Danach gilt er von selbst wieder.</p></details>' +
      '<details class="help"><summary>Was macht „Alle drinnen lassen“?</summary><p>Es setzt für jedes Tier mit Zeitplan eine Sonderregel. Tiere, die keinen festen Zeitplan haben, kannst du unter „Zeiten“ mit „Kein fester Zeitplan“ aufnehmen. Dann wirkt „Alle drinnen lassen“ auch bei ihnen, sonst bleiben sie immer frei.</p></details>' +
      '<details class="help"><summary>Was bedeuten die Warnungen?</summary><p>Die App meldet sich, wenn ein Tier trotz Sperre noch draußen ist, sehr lange draußen bleibt, die Batterie der Klappe schwächer wird oder die Klappe oder der Hub offline ist. Auf dem Handy kommt die Meldung per ntfy, in der App steht sie oben in der Übersicht. Wann gewarnt wird, stellst du unter „Zeiten“ ein.</p></details>' +
      '<details class="help"><summary>Wie genau ist die Batterieanzeige?</summary><p>Die Klappe meldet nur ihre Spannung. Daraus wird der Prozentwert geschätzt, so wie es auch andere Programme für die Klappe machen. Er ist eine Orientierung, kein Messgerät. Bei etwa 25 Prozent solltest du neue Batterien bereitlegen.</p></details>' +
      '<details class="help"><summary>Woher kommt der Verlauf?</summary><p>Die Sure-Cloud merkt sich jeden Durchgang an der Klappe. Der Zeitplan holt diese Einträge bei jedem Lauf ab und speichert sie drei Wochen lang. In Echtzeit ist das nicht: Ein Eintrag erscheint erst beim nächsten Lauf.</p></details>' +
      '<details class="help"><summary>Was, wenn der Hub keinen Strom hat?</summary><p>Dann kommt kein Befehl bei der Klappe an. Die App zeigt „Hub offline“ an, sobald der Dienst das bemerkt.</p></details>' +
      "</section>";
    if (!S.demo) {
      html += '<section class="section"><h2>Auf diesem Handy abmelden</h2><p>Entfernt den Zugangsschlüssel von diesem Gerät. Der Zeitplan läuft weiter.</p>' +
        '<div class="stack"><button class="btn btn-danger" data-action="logout">Abmelden</button></div></section>';
    }
    html += '<p class="version">Katzenklappe ' + VERSION + "</p>";
    return html;
  }

  /* ----- Einrichten ----- */

  function viewSetup() {
    return '<div class="welcome"><h1>Katzenklappe</h1>' +
      '<p class="lead">Zeitplan für jede Katze einzeln.</p>' +
      (S.setupError ? '<p class="err" role="alert">' + esc(S.setupError) + "</p>" : "") +
      '<section class="section"><h2>Einrichtungs-Link einfügen</h2>' +
      "<p>Den Link hast du per Nachricht bekommen. Wenn du ihn direkt geöffnet hast, ist hier schon alles erledigt.</p>" +
      '<div class="field"><label for="code">Link</label><textarea class="input" id="code" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea></div>' +
      '<div class="stack"><button class="btn btn-wide" data-action="connect-code"' + (S.setupBusy ? " disabled" : "") + ">Verbinden</button></div></section>" +
      '<details class="help"><summary>Ich richte es zum ersten Mal ein</summary>' +
      '<div class="field"><label for="o">GitHub-Konto</label><input class="input" id="o" autocomplete="off" autocapitalize="off" spellcheck="false"></div>' +
      '<div class="field"><label for="r">Repository</label><input class="input" id="r" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="katzenklappe"></div>' +
      '<div class="field"><label for="t">Zugangsschlüssel</label><input class="input" id="t" type="password" autocomplete="off" autocapitalize="off" spellcheck="false"></div>' +
      '<div class="stack" style="margin-bottom:16px"><button class="btn btn-wide" data-action="connect-manual"' + (S.setupBusy ? " disabled" : "") + ">Verbinden</button></div></details>" +
      '<div class="section"><button class="btn btn-quiet btn-wide" data-action="demo">Erst einmal die Demo ansehen</button></div></div>';
  }

  /* ----- Dialog, Meldung, Navigation ----- */

  function sheetHtml() {
    var sh = S.sheet;
    if (!sh) return "";
    var inner;
    if (sh.kind === "confirm") {
      inner = "<h2>" + esc(sh.title) + "</h2><p class=\"sheet-sub\">" + esc(sh.text) + "</p>" +
        '<button class="opt" data-action="confirm-yes"><strong>' + esc(sh.confirmLabel) + "</strong></button>";
    } else if (sh.kind === "pickpet") {
      inner = "<h2>Welches Tier?</h2><p class=\"sheet-sub\">Diese Tiere kennt die Sure-Cloud, sie haben hier noch keinen Eintrag.</p>" +
        sh.names.map(function (n, i) {
          return '<button class="opt" data-action="choose-pet" data-idx="' + i + '"><strong>' + esc(n) + "</strong></button>";
        }).join("") +
        '<button class="opt" data-action="choose-pet" data-idx="-1"><strong>Anderer Name …</strong><small>Zum Eintippen</small></button>';
    } else if (sh.kind === "bulk") {
      inner = "<h2>" + (sh.wantLocked ? "Alle drinnen lassen" : "Alle rauslassen") + "</h2>" +
        '<p class="sheet-sub">' + esc(sh.wantLocked
          ? "Bei allen Tieren bleibt der Ausgang gesperrt. Hinein kommen sie weiterhin. Für wie lange?"
          : "Die Klappe lässt alle Tiere raus und rein. Für wie lange?") + "</p>" +
        sh.options.map(function (o, i) {
          return '<button class="opt" data-action="choose-bulk" data-idx="' + i + '"><strong>' + esc(o.label) + "</strong>" +
            (o.hint ? "<small>" + esc(o.hint) + "</small>" : "") + "</button>";
        }).join("");
    } else {
      inner = "<h2>" + esc(sh.name + (sh.wantLocked ? " drinnen lassen" : " rauslassen")) + "</h2>" +
        '<p class="sheet-sub">' + esc(sh.wantLocked
          ? "Der Ausgang bleibt gesperrt. Hinein kommt " + sh.name + " weiterhin. Für wie lange?"
          : "Die Klappe lässt " + sh.name + " raus und rein. Für wie lange?") + "</p>" +
        sh.options.map(function (o, i) {
          return '<button class="opt" data-action="choose" data-idx="' + i + '"><strong>' + esc(o.label) + "</strong>" +
            (o.hint ? "<small>" + esc(o.hint) + "</small>" : "") + "</button>";
        }).join("");
    }
    return '<div class="scrim" data-action="close-sheet"><div class="sheet" role="dialog" aria-modal="true" aria-label="Auswahl">' + inner +
      '<button class="opt opt-cancel" data-action="close-sheet"><strong>Abbrechen</strong></button></div></div>';
  }

  function toastHtml() {
    return S.toast ? '<div class="toast" role="status">' + esc(S.toast) + "</div>" : "";
  }

  function navHtml() {
    function item(tab, label, icon) {
      return '<button class="nav-item" data-action="nav" data-tab="' + tab + '"' + (S.tab === tab ? ' aria-current="page"' : "") + ">" +
        '<span class="nav-pill">' + icon + "</span>" + label + "</button>";
    }
    return '<nav class="nav" aria-label="Hauptmenü"><div class="nav-inner">' +
      item("home", "Übersicht", I.home) + item("history", "Verlauf", I.list) + item("times", "Zeiten", I.clock) + item("more", "Mehr", I.more) + "</div></nav>";
  }

  function render(force) {
    var ae = document.activeElement;
    if (!force && S.tab === "times" && ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName) && S.draft && !S.sheet) {
      updateScheduleUi();
      return;
    }
    var html;
    if (!S.cfg) {
      html = viewSetup();
    } else {
      html = (S.tab === "home" ? viewHome() : S.tab === "history" ? viewHistory() : S.tab === "times" ? viewTimes() : viewMore()) + navHtml();
    }
    $app.innerHTML = html + sheetHtml() + toastHtml();
    var focus = $app.querySelector(".sheet .opt");
    if (S.sheet && focus) focus.focus();
  }

  function updateScheduleUi() {
    if (!S.draft) return;
    var bar = document.getElementById("savebar");
    if (bar) bar.innerHTML = saveBarHtml();
    var st = document.getElementById("times-status");
    if (st) st.innerHTML = timesStatusHtml();
    var naive = clockNaive();
    S.draft.cats.forEach(function (c, i) {
      var el = $app.querySelector('[data-preview="' + i + '"]');
      if (el) el.innerHTML = previewHtml(c, naive);
    });
    var sun = document.getElementById("sun-wrap");
    if (sun) sun.innerHTML = sunLineHtml();
  }

  var toastTimer = null;
  function toast(text) {
    S.toast = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { S.toast = null; render(); }, 5000);
    render();
  }

  /* ---------- Änderungen senden und abwarten ---------- */

  function failedSince(runs, sinceMs) {
    return (runs || []).some(function (r) {
      return r.status === "completed" && r.conclusion && r.conclusion !== "success" &&
        Date.parse(r.createdAt) >= sinceMs;
    });
  }

  async function runAndWait(key, token, isDone, doneText) {
    token.phase = "dispatch"; render();
    var t0 = Date.now();
    try {
      await S.api.dispatch();
    } catch (e) {
      token.phase = "nodispatch"; token.error = e; render();
      return;
    }
    token.phase = "waiting"; render();
    while (S.pending[key] === token) {
      if (Date.now() - t0 > WAIT_MAX_MS) { token.phase = "slow"; render(); return; }
      await sleep(POLL_MS);
      if (S.pending[key] !== token) return;
      try {
        var res = await fetchState(true);
        S.error = null;
        if (isDone(S.status)) {
          delete S.pending[key];
          toast(typeof doneText === "function" ? doneText(S.status) : doneText);
          return;
        }
        if (failedSince(res[1], t0 - 60000)) { token.phase = "failed"; render(); return; }
      } catch (e) {
        /* kurzer Netzfehler: weiter versuchen, bis die Zeit um ist */
      }
      render();
    }
  }

  function overrideDone(name, wantLocked, until) {
    return function (st) {
      var c = catByName(st, name);
      return !!(c && c.override && c.override.state === (wantLocked ? "locked" : "free") &&
        c.override.until === until && c.locked === wantLocked);
    };
  }
  function clearDone(name) {
    return function (st) {
      var c = catByName(st, name);
      return !!(c && !c.override && c.locked === c.should_lock);
    };
  }
  function catSummary(name) {
    return function (st) {
      var c = catByName(st, name);
      return c ? name + ": " + L.describeCat(c, clockNaive(), descOpts()).headline : name;
    };
  }

  async function changeOverride(name, wantLocked, until) {
    var token = { phase: "saving", error: null };
    S.pending[name] = token; render();
    try {
      var cur = await S.api.getOverrides();
      var next = L.setOverride(cur, name, wantLocked ? "locked" : "free", until, clockNaive());
      await S.api.setOverrides(next);
    } catch (e) {
      token.phase = "error"; token.error = e; render();
      return;
    }
    await runAndWait(name, token, overrideDone(name, wantLocked, until), catSummary(name));
  }

  async function removeOverride(name) {
    var token = { phase: "saving", error: null };
    S.pending[name] = token; render();
    try {
      var cur = await S.api.getOverrides();
      await S.api.setOverrides(L.clearOverride(cur, name, clockNaive()));
    } catch (e) {
      token.phase = "error"; token.error = e; render();
      return;
    }
    await runAndWait(name, token, clearDone(name), catSummary(name));
  }

  function bulkDone(map, wantLocked) {
    return function (st) {
      return Object.keys(map).every(function (name) {
        var c = catByName(st, name);
        return !!(c && c.override && c.override.state === map[name].state && c.override.until === map[name].until && c.locked === wantLocked);
      });
    };
  }

  async function changeBulk(wantLocked, key) {
    var naive = clockNaive();
    var map = L.bulkOverrides((S.status && S.status.cats) || [], naive, wantLocked, key);
    if (!Object.keys(map).length) {
      toast(wantLocked ? "Alle sind ohnehin schon drinnen gesperrt." : "Alle dürfen ohnehin schon raus.");
      return;
    }
    var token = { phase: "saving", error: null };
    S.pending["__bulk"] = token; render();
    try {
      var cur = await S.api.getOverrides(), next = L.pruneOverrides(cur, naive);
      Object.keys(map).forEach(function (name) { next = L.setOverride(next, name, map[name].state, map[name].until, naive); });
      await S.api.setOverrides(next);
    } catch (e) {
      token.phase = "error"; token.error = e; render();
      return;
    }
    await runAndWait("__bulk", token, bulkDone(map, wantLocked),
      wantLocked ? "Alle bleiben drinnen" : "Alle dürfen raus");
  }

  async function clearAllOverrides() {
    var token = { phase: "saving", error: null };
    S.pending["__bulk"] = token; render();
    try {
      await S.api.setOverrides({});
    } catch (e) {
      token.phase = "error"; token.error = e; render();
      return;
    }
    await runAndWait("__bulk", token, function (st) {
      return (st.cats || []).every(function (c) { return !c.override && c.locked === c.should_lock; });
    }, "Der Zeitplan gilt wieder für alle");
  }

  function scheduleDone(draft) {
    return function (st) {
      if (!st || st.config_ok === false) return false;
      if (!!st.paused !== !draft.enabled) return false;
      if (st.alerts && !L.sameAlerts(st.alerts, draft.alerts)) return false;
      var cats = st.cats || [];
      if (cats.length !== draft.cats.length) return false;
      var catsOk = draft.cats.every(function (d) {
        var c = catByName(st, d.name.trim());
        if (!c) return false;
        if (c.rules) return L.sameRules(c.rules, L.catRules(d));   // Dienst mit Wochenplan: Regeln vergleichen
        return !Array.isArray(d.rules) && c.lock === d.lock && c.unlock === d.unlock;
      });
      if (!catsOk) return false;
      if (st.vacations !== undefined) {
        var key = function (v) { return JSON.stringify([v.id, v.from, v.to, v.state, (v.cats || []).join("|"), v.note || ""]); };
        var want = L.pruneVacations(L.normalizeVacations(draft.vacations), clockNaive()).map(key).sort();
        if (JSON.stringify(want) !== JSON.stringify((st.vacations || []).map(key).sort())) return false;
      }
      if (st.location !== undefined) {
        var loc = L.normalizeLocation(draft.location);
        if (JSON.stringify(st.location || null) !== JSON.stringify(loc ? { lat: loc.lat, lon: loc.lon } : null)) return false;
      }
      return true;
    };
  }

  async function saveTimes() {
    var errors = L.validateSchedule(S.draft);
    if (errors.length) return;
    var snapshot = clone(S.draft);
    var token = { phase: "saving", error: null };
    S.pending["__schedule"] = token; render(true);
    try {
      await S.api.setSchedule(L.serializeSchedule(snapshot));
      S.saved = clone(snapshot);
    } catch (e) {
      token.phase = "error"; token.error = e; render(true);
      return;
    }
    render(true);
    await runAndWait("__schedule", token, scheduleDone(snapshot), "Zeiten gespeichert und übernommen");
    if (S.tab === "times") render(true);
  }

  async function runNow() {
    var token = { phase: "dispatch", error: null };
    S.pending["__run"] = token; render();
    try {
      await S.api.dispatch();
    } catch (e) {
      delete S.pending["__run"];
      toast(L.errorText(e));
      return;
    }
    delete S.pending["__run"];
    toast("Zeitplan gestartet. In etwa einer Minute ist der neue Stand da.");
    for (var i = 0; i < 20; i++) {
      await sleep(POLL_MS * 2);
      try { await fetchState(); render(); } catch (e) { /* weiter */ }
      var r = newestRun();
      if (r && r.status === "completed" && Date.parse(r.createdAt) > Date.now() - 600000) break;
    }
  }

  /* ---------- Eingaben ---------- */

  function shareLink() {
    var base = location.origin + location.pathname;
    return base + "#setup=" + L.encodeSetup(S.cfg);
  }

  async function share() {
    var link = shareLink();
    var text = "Katzenklappe: Diesen Link auf dem Handy öffnen, dann ist die App eingerichtet. Danach im Chrome-Menü „Zum Startbildschirm hinzufügen“ wählen.";
    if (navigator.share) {
      try { await navigator.share({ title: "Katzenklappe", text: text, url: link }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    copyLink();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareLink());
      toast("Link kopiert. Jetzt in einer Nachricht einfügen.");
    } catch (e) {
      toast("Kopieren hat nicht geklappt.");
    }
  }

  async function runDiag() {
    S.diagBusy = true; S.diag = null; render();
    try { S.diag = await S.api.diagnose(); } catch (e) { S.diag = [{ label: "Prüfung", ok: false, detail: L.errorText(e) }]; }
    S.diagBusy = false; render();
  }

  function addCatNamed(name) {
    S.draft.cats.push({ name: name, lock: "22:00", unlock: "06:30" });
    render(true);
    var inputs = $app.querySelectorAll(".name-input");
    var last = inputs[inputs.length - 1];
    if (last) { last.scrollIntoView({ block: "center" }); if (!name) last.focus(); }
  }

  // Tiere aus der Sure-Cloud anbieten, die noch keinen Eintrag haben
  function addCat() {
    var have = S.draft.cats.map(function (c) { return c.name.trim().toLowerCase(); });
    var names = ((S.status && S.status.pets) || []).map(function (p) { return p.name; })
      .filter(function (n) { return have.indexOf(n.trim().toLowerCase()) < 0; });
    if (!names.length) { addCatNamed(""); return; }
    S.sheet = { kind: "pickpet", names: names };
    render();
  }

  function setCatMode(i, mode) {
    var c = S.draft.cats[i], cur = L.catMode(c);
    if (mode === cur) return;
    if (cur === "weekly") c._stash = c.rules;
    if (mode === "daily") {
      if (cur === "weekly" && c.rules.length) { c.lock = c.rules[0].lock; c.unlock = c.rules[0].unlock; }
      delete c.rules;
    } else if (mode === "weekly") {
      c.rules = c._stash && c._stash.length ? c._stash : [{ days: [0, 1, 2, 3, 4, 5, 6], lock: c.lock, unlock: c.unlock }];
    } else {
      c.rules = [];
    }
    render(true);
  }

  function toggleDay(i, j, day) {
    var r = S.draft.cats[i].rules[j], at = r.days.indexOf(day);
    if (at >= 0) r.days.splice(at, 1); else { r.days.push(day); r.days.sort(function (a, b) { return a - b; }); }
    render(true);
  }
  function daysPreset(i, j, preset) {
    S.draft.cats[i].rules[j].days = preset === "week" ? [0, 1, 2, 3, 4] : preset === "weekend" ? [5, 6] : [0, 1, 2, 3, 4, 5, 6];
    render(true);
  }

  // Zeit-Auswahl (Art / Versatz) geaendert
  function changeWhen(t) {
    var cat = S.draft.cats[+t.dataset.idx], target = t.dataset.rule != null ? cat.rules[+t.dataset.rule] : cat;
    var f = t.dataset.field, cur = target[f];
    if (t.dataset.when === "kind") {
      target[f] = t.value === "clock" ? (L.whenKind(cur) === "clock" ? cur : (f === "lock" ? "22:00" : "06:30")) : L.whenWith(t.value, 0);
      if (t.value !== "clock" && !S.draft.location) S.draft.location = { lat: 52.52, lon: 13.405, label: "Berlin" };
    } else {
      target[f] = L.whenWith(L.whenKind(cur), parseInt(t.value, 10) || 0);
    }
    var id = t.id;
    render(true);
    var again = id && document.getElementById(id);
    if (again) again.focus();
  }

  function addVacation() {
    var f = S.vacForm || newVacForm();
    var v = { id: L.newVacationId(), from: f.from, to: f.to || f.from, state: f.state, cats: f.cats.slice(), note: (f.note || "").trim() };
    if (!L.isDate(v.from)) { S.vacError = "Bitte den ersten Tag wählen."; render(true); return; }
    if (!L.isDate(v.to) || v.to < v.from) { S.vacError = "Das Ende darf nicht vor dem Beginn liegen."; render(true); return; }
    S.vacError = "";
    S.draft.vacations.push(v);
    S.vacForm = newVacForm();
    render(true);
  }

  function useGps() {
    if (!navigator.geolocation) { toast("Dieses Gerät kann den Standort nicht ermitteln."); return; }
    toast("Standort wird ermittelt …");
    navigator.geolocation.getCurrentPosition(function (pos) {
      S.draft.location = L.normalizeLocation({ lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100, label: "Mein Standort" });
      toast("Standort übernommen. Zum Übernehmen noch speichern.");
      if (S.tab === "times") render(true);
    }, function () {
      toast("Der Standort war nicht verfügbar. Bitte einen Ort aus der Liste wählen.");
    }, { timeout: 12000, maximumAge: 600000 });
  }

  function askRemove(i) {
    var c = S.draft.cats[i];
    S.sheet = {
      kind: "confirm", action: { type: "remove", idx: i },
      title: (c.name.trim() || "Dieses Tier") + " entfernen?",
      text: "Das Tier wird nicht mehr automatisch gesperrt oder freigegeben. Eine gerade aktive Sperre bleibt bestehen, bis du sie in der Sure-App aufhebst. Gespeichert wird erst mit „Änderungen speichern“.",
      confirmLabel: "Entfernen"
    };
    render();
  }

  $app.addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-action]");
    if (!el) return;
    if (el.classList.contains("scrim") && ev.target !== el) return; // Klick im Dialog selbst schließt nicht
    var a = el.dataset.action;
    switch (a) {
      case "nav":
        S.tab = el.dataset.tab; render(true); window.scrollTo(0, 0); break;
      case "goto-times": S.tab = "times"; render(true); window.scrollTo(0, 0); break;
      case "goto-more": S.tab = "more"; render(true); window.scrollTo(0, 0); break;
      case "refresh": refresh(false); break;
      case "retry-times": S.scheduleError = null; render(); break;
      case "hist-filter": S.histFilter = el.dataset.name || null; S.histShown = 30; render(true); break;
      case "hist-more": S.histShown += 30; render(true); break;
      case "run-now": runNow(); break;
      case "open-sheet": {
        var name = el.dataset.name, wantLocked = el.dataset.locked === "1";
        var cat = catByName(S.status, name);
        if (!cat) return;
        S.sheet = { kind: "override", name: name, wantLocked: wantLocked, options: L.overrideOptions(cat, clockNaive(), wantLocked) };
        render();
        break;
      }
      case "choose": {
        var sh = S.sheet; if (!sh) return;
        var opt = sh.options[+el.dataset.idx]; S.sheet = null;
        changeOverride(sh.name, sh.wantLocked, opt.until);
        break;
      }
      case "confirm-yes": {
        var act = S.sheet && S.sheet.action; S.sheet = null;
        if (act && act.type === "remove") { S.draft.cats.splice(act.idx, 1); render(true); }
        else if (act && act.type === "logout") { logout(); }
        else render();
        break;
      }
      case "close-sheet": S.sheet = null; render(); break;
      case "clear-override": removeOverride(el.dataset.name); break;
      case "dismiss-pending": delete S.pending[el.dataset.key]; render(true); if (S.tab !== "times") refresh(true); break;
      case "add-cat": addCat(); break;
      case "choose-pet": {
        var sp = S.sheet; if (!sp) return;
        var pi = +el.dataset.idx, nm = pi >= 0 ? sp.names[pi] : ""; S.sheet = null;
        addCatNamed(nm);
        break;
      }
      case "open-bulk": {
        var bl = el.dataset.locked === "1";
        S.sheet = { kind: "bulk", wantLocked: bl, options: L.bulkChoices(bl) };
        render();
        break;
      }
      case "choose-bulk": {
        var sb = S.sheet; if (!sb) return;
        var ob = sb.options[+el.dataset.idx]; S.sheet = null;
        changeBulk(sb.wantLocked, ob.key);
        break;
      }
      case "clear-all-overrides": clearAllOverrides(); break;
      case "cat-mode": setCatMode(+el.dataset.idx, el.dataset.mode); break;
      case "toggle-day": toggleDay(+el.dataset.idx, +el.dataset.rule, +el.dataset.day); break;
      case "days-preset": daysPreset(+el.dataset.idx, +el.dataset.rule, el.dataset.preset); break;
      case "add-rule": {
        var cr = S.draft.cats[+el.dataset.idx];
        cr.rules.push(L.newRule());
        render(true);
        break;
      }
      case "remove-rule": {
        var cr2 = S.draft.cats[+el.dataset.idx];
        cr2.rules.splice(+el.dataset.rule, 1);
        render(true);
        break;
      }
      case "vac-cat": {
        var f = S.vacForm || (S.vacForm = newVacForm()), nmv = el.dataset.name;
        if (!nmv) f.cats = [];
        else { var at = f.cats.indexOf(nmv); if (at >= 0) f.cats.splice(at, 1); else f.cats.push(nmv); }
        render(true);
        break;
      }
      case "vac-state": (S.vacForm || (S.vacForm = newVacForm())).state = el.dataset.state; render(true); break;
      case "add-vac": addVacation(); break;
      case "remove-vac": S.draft.vacations.splice(+el.dataset.idx, 1); render(true); break;
      case "geolocate": useGps(); break;
      case "remove-cat": askRemove(+el.dataset.idx); break;
      case "save-times": saveTimes(); break;
      case "diag": runDiag(); break;
      case "share": share(); break;
      case "copy-link": copyLink(); break;
      case "install":
        if (S.installEvt) { S.installEvt.prompt(); S.installEvt = null; render(); }
        break;
      case "hint-dismiss": lsSet(HINT_KEY, "1"); render(); break;
      case "logout": if (S.demo) { logout(); } else { S.sheet = { kind: "confirm", action: { type: "logout" }, title: "Abmelden?", text: "Der Zugangsschlüssel wird von diesem Handy entfernt. Den Link zum Einrichten brauchst du dann noch einmal.", confirmLabel: "Abmelden" }; render(); } break;
      case "demo": startDemo(); break;
      case "connect-code": {
        var cfg = L.decodeSetup(document.getElementById("code").value);
        if (!cfg) { S.setupError = "Mit diesem Text kann ich nichts anfangen. Bitte den ganzen Link einfügen."; render(); return; }
        tryConnect(cfg);
        break;
      }
      case "connect-manual": {
        var owner = document.getElementById("o").value.trim();
        var repo = document.getElementById("r").value.trim();
        var token = document.getElementById("t").value.trim();
        if (repo.indexOf("/") > 0) { owner = repo.split("/")[0]; repo = repo.split("/")[1]; }
        if (!owner || !repo || !token) { S.setupError = "Bitte Konto, Repository und Zugangsschlüssel ausfüllen."; render(); return; }
        tryConnect({ owner: owner, repo: repo, token: token });
        break;
      }
    }
  });

  $app.addEventListener("input", function (ev) {
    var t = ev.target, ds = t.dataset || {};
    if (!S.draft) return;
    if (ds.vac) {
      var f2 = S.vacForm || (S.vacForm = newVacForm());
      f2[ds.vac] = t.value;
      if (ds.vac === "from") { var to = document.getElementById("vac-to"); if (to) to.min = t.value || clockNaive().slice(0, 10); }
      return;
    }
    if (ds.locfield) {
      var v = parseFloat(t.value);
      S.draft.location = Object.assign({}, S.draft.location || {}, { label: "Eigene Koordinaten" });
      S.draft.location[ds.locfield] = isNaN(v) ? "" : v;
      updateScheduleUi();
      return;
    }
    var f = ds.field;
    if (!f || f === "enabled" || ds.when) return;
    var cat = S.draft.cats[+ds.idx];
    (ds.rule != null ? cat.rules[+ds.rule] : cat)[f] = t.value;
    updateScheduleUi();
  });
  $app.addEventListener("change", function (ev) {
    var t = ev.target;
    if (t.dataset && t.dataset.when && S.draft) { changeWhen(t); return; }
    if (t.dataset && t.dataset.loc === "city" && S.draft) {
      var val = t.value;
      if (val === "none") S.draft.location = null;
      else if (val === "custom") S.draft.location = L.normalizeLocation({ lat: (S.draft.location || { lat: 52.52 }).lat, lon: (S.draft.location || { lon: 13.405 }).lon, label: "Eigene Koordinaten" });
      else if (val === "gps") { useGps(); return; }
      else { var c = CITIES[+val.slice(1)]; S.draft.location = { lat: c[1], lon: c[2], label: c[0] }; }
      render(true);
      var again = document.getElementById("loc-city");
      if (again) again.focus();
      return;
    }
    if (t.dataset && t.dataset.alert && S.draft) {
      var key = t.dataset.alert, id = t.id;
      S.draft.alerts[key] = key === "enabled" ? !!t.checked : parseInt(t.value, 10) || 0;
      S.draft.alerts = L.normalizeAlerts(S.draft.alerts);
      render(true);
      var again = id && document.getElementById(id);
      if (again) again.focus();
      return;
    }
    if (t.dataset && t.dataset.field === "enabled" && S.draft) {
      S.draft.enabled = t.checked;
      updateScheduleUi();
    }
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && S.sheet) { S.sheet = null; render(); }
  });

  window.addEventListener("online", function () { S.online = true; render(); refresh(true); });
  window.addEventListener("offline", function () { S.online = false; render(); });
  window.addEventListener("beforeinstallprompt", function (ev) { ev.preventDefault(); S.installEvt = ev; render(); });
  window.addEventListener("appinstalled", function () { S.installEvt = null; lsSet(HINT_KEY, "1"); render(); });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && S.api && (!S.fetchedAt || Date.now() - S.fetchedAt > 30000)) refresh(true);
  });
  setInterval(function () {
    if (document.hidden || !S.api) return;
    if ((S.tab === "home" || S.tab === "history") && !S.sheet) {
      if (!S.fetchedAt || Date.now() - S.fetchedAt > 300000) refresh(true); else render();
    }
  }, 60000);

  /* ---------- Start ---------- */

  // Einrichtungs-Link (#setup=...) oder Demo (#demo) in der Adresse. Gibt true zurück, wenn etwas zu tun war.
  async function handleHash() {
    var hash = location.hash || "";
    if (/[#&]setup=/.test(hash)) {
      var cfg = L.decodeSetup(hash);
      history.replaceState(null, "", location.pathname + location.search);
      if (!cfg) {
        S.setupError = "Der Einrichtungs-Link ist unvollständig. Bitte noch einmal den ganzen Link öffnen.";
        if (!S.cfg) render();
        return true;
      }
      render();
      await tryConnect(cfg);
      return true;
    }
    var sc = /^#(lockall|freeall|history|times|home)$/.exec(hash);
    if (sc) {
      history.replaceState(null, "", location.pathname + location.search);
      S.shortcut = sc[1];
      if (S.cfg && S.api) { applyShortcut(); return true; }
      return false; // noch nicht verbunden: nach dem Start anwenden
    }
    if (/^#demo/.test(hash)) {
      history.replaceState(null, "", location.pathname + location.search);
      await startDemo();
      return true;
    }
    return false;
  }

  // Kurzbefehle vom Startbildschirm (#lockall, #freeall, #history, #times): oeffnen nur den Dialog bzw. Reiter
  function applyShortcut() {
    var name = S.shortcut; S.shortcut = null;
    if (!name || !S.cfg) return;
    if (name === "lockall" || name === "freeall") {
      S.tab = "home";
      if (((S.status && S.status.cats) || []).length) {
        var bl = name === "lockall";
        S.sheet = { kind: "bulk", wantLocked: bl, options: L.bulkChoices(bl) };
      }
    } else {
      S.tab = name;
    }
    render(true);
    window.scrollTo(0, 0);
  }

  async function boot() {
    if (await handleHash()) return;
    var stored = loadCfg();
    if (stored) { await startApp(stored, new L.GitHub(stored), false); applyShortcut(); return; }
    render();
  }

  window.addEventListener("hashchange", function () { handleHash(); });

  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* ohne Offline-Hülle weiter */ });
    });
  }

  window.KLApp = { state: S, render: render };
  boot();
})();
