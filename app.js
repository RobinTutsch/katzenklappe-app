/* Katzenklappe - Oberfläche */
(function () {
  "use strict";

  var L = window.KL;
  var $app = document.getElementById("app");
  var CFG_KEY = "klappe.cfg.v1";
  var CACHE_KEY = "klappe.cache.v1";
  var HINT_KEY = "klappe.hint.install";
  var VERSION = "1.1";
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

  function barHtml(lock, unlock, naive) {
    var segs = L.barSegments(lock, unlock).map(function (s) {
      return '<span class="bar-seg" style="left:' + s.from.toFixed(3) + "%;width:" + (s.to - s.from).toFixed(3) + '%"></span>';
    }).join("");
    return '<div class="bar"><div class="bar-track">' + segs + "</div>" +
      '<span class="bar-now" style="left:' + L.nowPercent(naive).toFixed(3) + '%"></span></div>' +
      '<p class="bar-caption">Gesperrt von ' + esc(lock) + " bis " + esc(unlock) + " Uhr</p>";
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
      barHtml(c.lock, c.unlock, naive) +
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
    var html = headerHtml() + bannersHtml();
    cats.forEach(function (c) { html += catCardHtml(c, naive); });
    html += othersHtml() + devicesHtml();
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

  function catEditHtml(c, i, naive) {
    return '<section class="cat-edit">' +
      '<label class="sr" for="n' + i + '">Name des Tiers</label>' +
      '<input class="name-input" id="n' + i + '" data-field="name" data-idx="' + i + '" value="' + esc(c.name) + '" placeholder="Name" autocomplete="off" autocapitalize="words" spellcheck="false">' +
      '<p style="color:var(--ink-2);font-size:14px;margin-top:6px">Genau so geschrieben wie in der Sure-App.</p>' +
      '<div class="time-row"><label for="l' + i + '">Ausgang sperren ab</label>' +
      '<input class="time-input" type="time" id="l' + i + '" data-field="lock" data-idx="' + i + '" value="' + esc(c.lock) + '"></div>' +
      '<div class="time-row"><label for="u' + i + '">Wieder freigeben um</label>' +
      '<input class="time-input" type="time" id="u' + i + '" data-field="unlock" data-idx="' + i + '" value="' + esc(c.unlock) + '"></div>' +
      '<div class="preview" data-bar="' + i + '">' + barHtml(c.lock, c.unlock, naive) + "</div>" +
      '<div class="stack"><button class="btn-text btn-text-danger" data-action="remove-cat" data-idx="' + i + '">Tier entfernen</button></div>' +
      "</section>";
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
          cats: (S.status.cats || []).map(function (c) { return { name: c.name, lock: c.lock, unlock: c.unlock }; })
        };
      }
      S.saved = L.normalizeSchedule(raw);
      S.draft = clone(S.saved);
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
      var el = $app.querySelector('[data-bar="' + i + '"]');
      if (el) el.innerHTML = barHtml(c.lock, c.unlock, naive);
    });
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

  function scheduleDone(draft) {
    return function (st) {
      if (!st || st.config_ok === false) return false;
      if (!!st.paused !== !draft.enabled) return false;
      if (st.alerts && !L.sameAlerts(st.alerts, draft.alerts)) return false;
      var cats = st.cats || [];
      if (cats.length !== draft.cats.length) return false;
      return draft.cats.every(function (d) {
        var c = catByName(st, d.name.trim());
        return !!c && c.lock === d.lock && c.unlock === d.unlock;
      });
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

  function addCat() {
    S.draft.cats.push({ name: "", lock: "22:00", unlock: "06:30" });
    render(true);
    var inputs = $app.querySelectorAll(".name-input");
    var last = inputs[inputs.length - 1];
    if (last) { last.focus(); last.scrollIntoView({ block: "center" }); }
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
    var t = ev.target, f = t.dataset && t.dataset.field;
    if (!f || !S.draft || f === "enabled") return;
    S.draft.cats[+t.dataset.idx][f] = t.value;
    updateScheduleUi();
  });
  $app.addEventListener("change", function (ev) {
    var t = ev.target;
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
    if (/^#demo/.test(hash)) {
      history.replaceState(null, "", location.pathname + location.search);
      await startDemo();
      return true;
    }
    return false;
  }

  async function boot() {
    if (await handleHash()) return;
    var stored = loadCfg();
    if (stored) { await startApp(stored, new L.GitHub(stored), false); return; }
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
