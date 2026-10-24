/* Kalender - Oberflaeche. Alle Daten bleiben auf diesem Handy (localStorage), nichts geht ins Netz. */
(function () {
  "use strict";
  var L = window.KalLogic, T = window.KalTheme;
  var VERSION = "1.0";
  var DATA_KEY = "kal.data.v1";
  var $app = document.getElementById("app");
  var $toast = document.getElementById("toast");

  /* ---------- Zustand ---------- */
  var S = { tab: "month", y: 0, m: 0, year: 0, sel: "", today: "", data: L.emptyData(), storageOk: true, loadNote: "", sheetOpen: false, lastFocus: null, confirmCb: null, importItems: null };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }

  function load() {
    var raw = null;
    try { raw = window.localStorage.getItem(DATA_KEY); } catch (e) { S.storageOk = false; }
    if (raw) {
      try { S.data = L.normalizeData(JSON.parse(raw)); }
      catch (e) {
        try { window.localStorage.setItem(DATA_KEY + ".defekt", raw); } catch (e2) { /* egal */ }
        S.loadNote = "Die gespeicherten Daten waren nicht lesbar. Sie wurden zur Sicherheit beiseitegelegt, der Kalender startet neu.";
        S.data = L.emptyData();
      }
    }
  }
  function save() {
    try { window.localStorage.setItem(DATA_KEY, JSON.stringify(S.data)); S.storageOk = true; }
    catch (e) { S.storageOk = false; toast("Speichern am Handy hat nicht geklappt."); }
  }
  var toastTimer = 0;
  function toast(text) {
    $toast.textContent = text; $toast.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { $toast.hidden = true; }, 3200);
  }

  /* ---------- Hilfen ---------- */
  var I = {
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    month: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    year: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h9"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/></svg>'
  };
  var CHIP = { frueh: "F", spaet: "S", frei: "frei", urlaub: "U" };
  var SHIFT_NAMES = L.SHIFT_TYPES;

  function monthName(m) { return L.MONTHS[m - 1]; }
  function firstOfMonth(y, m) { return L.ymd(y, m, 1); }
  function selectDefault() { S.sel = (S.today.slice(0, 7) === S.y + "-" + L.pad(S.m)) ? S.today : firstOfMonth(S.y, S.m); }
  function goMonth(delta) {
    var idx = S.y * 12 + (S.m - 1) + delta;
    S.y = Math.floor(idx / 12); S.m = idx - S.y * 12 + 1;
    selectDefault();
  }
  function shiftTimes(sh) { return sh && sh.start ? sh.start + " – " + sh.end + " Uhr" : ""; }
  function setToday() {
    var t = L.todayFrom(new Date());
    if (t !== S.today) { S.today = t; return true; }
    return false;
  }

  /* ---------- Ansichten ---------- */
  function dayLabel(date, sh, bds, evs, hol) {
    var d = +date.slice(8, 10), m = +date.slice(5, 7);
    var parts = [L.WEEKDAYS[(L.isoWeekday(date) % 7)] + ", " + d + ". " + monthName(m)];
    if (sh) parts.push(sh.label + (sh.start ? " " + sh.start + " bis " + sh.end : ""));
    if (hol) parts.push(hol);
    if (bds.length) parts.push("Geburtstag " + bds.map(function (b) { return b.name; }).join(", "));
    if (evs.length) parts.push(evs.length + (evs.length === 1 ? " Termin" : " Termine"));
    return parts.join(", ");
  }

  function viewMonth() {
    var D = S.data, y = S.y, m = S.m;
    var grid = L.monthGrid(y, m);
    var nowWeek = L.isoWeek(S.sel);
    var wk = D.shift.enabled ? L.shiftWeekSummary(S.sel, D.shift) : "";
    var html = '<div class="page"><div class="head"><h1>' + monthName(m) + " <span>" + y + '</span></h1><div class="head-tools">' +
      '<button class="round" data-action="prev-month" aria-label="Vorheriger Monat">' + I.left + "</button>" +
      '<button class="pill-btn" data-action="today">Heute</button>' +
      '<button class="round" data-action="next-month" aria-label="Nächster Monat">' + I.right + "</button></div></div>";
    html += '<div class="subline">' + (D.shift.enabled ? '<span class="weekchip" data-shift="' + wk + '">KW ' + nowWeek.week + " · " + SHIFT_NAMES[wk] + "</span>" : "") +
      "<span>heute " + esc(L.shortDate(S.today)) + "</span></div>";
    html += '<div class="dow" aria-hidden="true"><div>KW</div><div>Mo</div><div>Di</div><div>Mi</div><div>Do</div><div>Fr</div><div>Sa</div><div>So</div></div>';
    grid.forEach(function (w) {
      html += '<div class="wk"><div class="kw" aria-hidden="true">' + w.week + "</div>";
      w.days.forEach(function (date) {
        var inMonth = +date.slice(5, 7) === m;
        var sh = L.shiftOn(date, D.shift, D.overrides), hol = L.holidayOn(date);
        var bds = L.birthdaysOn(D.birthdays, date), evs = L.eventsOn(D.events, date);
        var red = hol || L.isoWeekday(date) === 7;
        html += '<button class="day" data-action="pick-day" data-date="' + date + '" aria-pressed="' + (date === S.sel) + '"' +
          (sh ? ' data-shift="' + sh.type + '"' : "") + (date === S.today ? ' data-today="1"' : "") + (red ? ' data-red="1"' : "") + (inMonth ? "" : ' data-out="1"') +
          ' aria-label="' + esc(dayLabel(date, sh, bds, evs, hol)) + '">' +
          '<span class="num">' + (+date.slice(8, 10)) + "</span>" +
          '<span class="chip"' + (sh && sh.changed ? ' data-changed="1"' : "") + ">" + (sh ? CHIP[sh.type] : "") + "</span>" +
          '<span class="dots">' + (bds.length ? '<i class="d-bd"></i>' : "") + (evs.length ? '<i class="d-ev"></i>' : "") + "</span></button>";
      });
      html += "</div>";
    });
    html += '<div class="legend" aria-hidden="true"><span><i style="background:var(--frueh-solid)"></i>Früh</span><span><i style="background:var(--spaet-solid)"></i>Spät</span>' +
      '<span><i class="l-dot" style="background:var(--bd)"></i>Geburtstag</span><span><i class="l-dot" style="background:var(--ev)"></i>Termin</span></div>';
    html += detailHtml(S.sel) + "</div>";
    return html + '<button class="fab" data-action="new-event" aria-label="Neuer Termin">' + I.plus + "</button>";
  }

  function detailHtml(date) {
    var D = S.data, sh = L.shiftOn(date, D.shift, D.overrides), hol = L.holidayOn(date);
    var bds = L.birthdaysOn(D.birthdays, date), evs = L.eventsOn(D.events, date);
    var html = '<section class="detail" aria-label="Tag ' + esc(L.longDate(date)) + '"><div class="detail-head"><h2>' + esc(L.longDate(date).replace(/ \d{4}$/, "")) + "</h2><span>KW " + L.isoWeek(date).week + "</span></div>";
    if (D.shift.enabled) {
      if (sh) {
        html += '<div class="row shiftrow" data-k="' + sh.type + '"><span class="bar" data-k="' + sh.type + '"></span><div class="row-main"><strong>' + sh.label + "</strong>" +
          (sh.start ? "<span>" + shiftTimes(sh) + "</span>" : "") +
          (sh.changed ? "<span>Geändert" + (sh.plan ? " · geplant: " + SHIFT_NAMES[sh.plan] : " · sonst kein Dienst") + "</span>" : "") + "</div>" +
          '<button class="small-btn" data-action="shift-sheet" data-date="' + date + '">Ändern</button></div>';
      } else {
        html += '<div class="row shiftrow"><span class="bar"></span><div class="row-main"><strong>Kein Dienst</strong></div>' +
          '<button class="small-btn" data-action="shift-sheet" data-date="' + date + '">Schicht eintragen</button></div>';
      }
    }
    if (hol) html += '<div class="row"><span class="bar" data-k="holiday"></span><div class="row-main"><strong>' + esc(hol) + "</strong><span>Feiertag in Berlin</span></div></div>";
    bds.forEach(function (b) {
      html += '<div class="row"><span class="bar" data-k="bd"></span><div class="row-main"><strong>' + esc(b.name) + "</strong><span>Geburtstag" + (b.age ? " · wird " + b.age : "") + "</span></div></div>";
    });
    evs.forEach(function (e) {
      html += '<button class="row row-btn" data-action="edit-event" data-id="' + esc(e.id) + '" data-date="' + date + '"><span class="bar" data-k="ev"></span><div class="row-main"><strong>' + esc(e.title) + "</strong><span>" +
        esc(L.eventTimeLabel(e)) + (e.repeat !== "none" ? " · " + L.REPEATS[e.repeat].toLowerCase() : "") + "</span>" +
        (e.notes ? '<span class="note">' + esc(e.notes) + "</span>" : "") + "</div></button>";
    });
    if (!evs.length && !bds.length) html += '<p class="empty">Keine Termine. Mit „+“ legst du einen an.</p>';
    return html + "</section>";
  }

  function viewYear() {
    var D = S.data, y = S.year;
    var html = '<div class="page"><div class="head"><h1>' + y + '</h1><div class="head-tools">' +
      '<button class="round" data-action="prev-year" aria-label="Vorheriges Jahr">' + I.left + "</button>" +
      '<button class="pill-btn" data-action="today">Heute</button>' +
      '<button class="round" data-action="next-year" aria-label="Nächstes Jahr">' + I.right + "</button></div></div>" +
      '<div class="subline"><span>Tippe auf einen Monat. Farben: Früh · Spät · Urlaub · frei.</span></div><div class="year-grid">';
    for (var m = 1; m <= 12; m++) {
      var first = L.ymd(y, m, 1), lead = L.isoWeekday(first) - 1, n = L.daysInMonth(y, m);
      var cells = "";
      for (var i = 0; i < lead; i++) cells += "<span></span>";
      for (var d = 1; d <= n; d++) {
        var date = L.ymd(y, m, d), sh = L.shiftOn(date, D.shift, D.overrides);
        var mark = L.birthdaysOn(D.birthdays, date).length || L.eventsOn(D.events, date).length;
        cells += "<span" + (sh ? ' data-shift="' + sh.type + '"' : "") + (date === S.today ? ' data-today="1"' : "") + (mark ? ' data-mark="1"' : "") + ">" + d + "</span>";
      }
      html += '<button class="mini" data-action="open-month" data-y="' + y + '" data-m="' + m + '"' + (S.today.slice(0, 7) === y + "-" + L.pad(m) ? ' data-now="1"' : "") + ' aria-label="' + monthName(m) + " " + y + ' öffnen"><h3>' + monthName(m) + '</h3><div class="mini-grid" aria-hidden="true">' +
        "<b>M</b><b>D</b><b>M</b><b>D</b><b>F</b><b>S</b><b>S</b>" + cells + "</div></button>";
    }
    return html + "</div></div>";
  }

  function viewAgenda() {
    var D = S.data, items = L.agendaFrom(D, S.today, 186);
    var html = '<div class="page"><div class="head"><h1>Termine</h1></div><div class="subline"><span>Die nächsten sechs Monate</span></div>';
    if (!items.length) html += '<p class="empty">Nichts eingetragen. Mit „+“ legst du einen Termin an.</p>';
    html += '<div class="agenda">';
    items.forEach(function (it) {
      html += "<section><h3>" + esc(L.shortDate(it.date)) + (it.date === S.today ? " <em>heute</em>" : "") + '</h3><div class="card">';
      if (it.holiday) html += '<div class="row"><span class="bar" data-k="holiday"></span><div class="row-main"><strong>' + esc(it.holiday) + "</strong><span>Feiertag in Berlin</span></div></div>";
      it.birthdays.forEach(function (b) { html += '<div class="row"><span class="bar" data-k="bd"></span><div class="row-main"><strong>' + esc(b.name) + "</strong><span>Geburtstag" + (b.age ? " · wird " + b.age : "") + "</span></div></div>"; });
      it.events.forEach(function (e) {
        html += '<button class="row row-btn" data-action="edit-event" data-id="' + esc(e.id) + '" data-date="' + it.date + '"><span class="bar" data-k="ev"></span><div class="row-main"><strong>' + esc(e.title) + "</strong><span>" + esc(L.eventTimeLabel(e)) + "</span>" +
          (e.notes ? '<span class="note">' + esc(e.notes) + "</span>" : "") + "</div></button>";
      });
      html += "</div></section>";
    });
    return html + '</div></div><button class="fab" data-action="new-event" aria-label="Neuer Termin">' + I.plus + "</button>";
  }

  function weekPreview() {
    var D = S.data, out = [], mon = L.mondayOf(S.today);
    for (var i = 0; i < 4; i++) {
      var d = L.addDays(mon, i * 7);
      out.push("KW " + L.isoWeek(d).week + " " + (L.shiftWeekSummary(d, D.shift) === "frueh" ? "Früh" : "Spät"));
    }
    return out.join(" · ");
  }
  function viewMore() {
    var D = S.data, sh = D.shift, mode = T.get();
    var thisWeek = L.shiftWeekSummary(S.today, sh);
    var html = '<div class="page"><div class="head"><h1>Mehr</h1></div>';
    if (S.loadNote) html += '<p class="warn">' + esc(S.loadNote) + "</p>";
    if (!S.storageOk) html += '<p class="warn">Dieses Handy erlaubt gerade kein Speichern. Änderungen gehen beim Schließen verloren.</p>';
    // Darstellung
    html += '<section class="section"><h2>Darstellung</h2><div class="seg" role="group" aria-label="Darstellung">' +
      [["auto", "Automatisch"], ["light", "Hell"], ["dark", "Dunkel"]].map(function (o) {
        return '<button class="chipbtn" data-action="theme" data-v="' + o[0] + '" aria-pressed="' + (mode === o[0]) + '">' + o[1] + "</button>";
      }).join("") + '</div><p class="small" style="margin-top:10px">Automatisch folgt der Einstellung deines Handys. Gilt nur für dieses Handy.</p></section>';
    // Schichtplan
    html += '<section class="section"><h2>Schichtplan</h2><div class="switch-row"><strong>Schichten anzeigen</strong><label class="switch"><span class="sr">Schichten anzeigen</span><input type="checkbox" data-field="shift-enabled"' + (sh.enabled ? " checked" : "") + "><span></span></label></div>";
    if (sh.enabled) {
      html += '<div class="field"><span class="lbl" id="lbl-thisweek">Diese Woche (KW ' + L.isoWeek(S.today).week + ") ist</span><div class=\"seg\" style=\"grid-template-columns:1fr 1fr\" role=\"group\" aria-labelledby=\"lbl-thisweek\">" +
        ["frueh", "spaet"].map(function (k) { return '<button class="chipbtn" data-action="this-week" data-v="' + k + '" aria-pressed="' + (thisWeek === k) + '">' + SHIFT_NAMES[k] + "</button>"; }).join("") +
        '</div><p class="small">Danach wechselt es jede Woche zwischen Früh und Spät, für das ganze Jahr. ' + esc(weekPreview()) + "</p></div>";
      html += '<div class="field"><span class="lbl" id="lbl-days">Arbeitstage</span><div class="chips" role="group" aria-labelledby="lbl-days">' +
        [1, 2, 3, 4, 5, 6, 7].map(function (n) { return '<button class="chipbtn" data-action="toggle-day" data-v="' + n + '" aria-pressed="' + (sh.days.indexOf(n) >= 0) + '">' + L.WD_SHORT[n % 7] + "</button>"; }).join("") + "</div></div>";
      html += '<div class="field"><span class="lbl">Frühschicht</span><div class="two"><div><label class="sr" for="t-frueh-start">Frühschicht Beginn</label><input class="input" id="t-frueh-start" type="time" data-field="time" data-k="frueh" data-p="start" value="' + sh.times.frueh.start + '"></div>' +
        '<div><label class="sr" for="t-frueh-end">Frühschicht Ende</label><input class="input" id="t-frueh-end" type="time" data-field="time" data-k="frueh" data-p="end" value="' + sh.times.frueh.end + '"></div></div></div>' +
        '<div class="field"><span class="lbl">Spätschicht</span><div class="two"><div><label class="sr" for="t-spaet-start">Spätschicht Beginn</label><input class="input" id="t-spaet-start" type="time" data-field="time" data-k="spaet" data-p="start" value="' + sh.times.spaet.start + '"></div>' +
        '<div><label class="sr" for="t-spaet-end">Spätschicht Ende</label><input class="input" id="t-spaet-end" type="time" data-field="time" data-k="spaet" data-p="end" value="' + sh.times.spaet.end + '"></div></div></div>';
      html += '<div class="switch-row"><div><strong>An Feiertagen frei</strong></div><label class="switch"><span class="sr">An Feiertagen frei</span><input type="checkbox" data-field="holidays-free"' + (sh.holidaysFree ? " checked" : "") + "><span></span></label></div>" +
        '<p class="small">Feiertage in Berlin werden dann als „frei“ gezeigt. Einzelne Tage kannst du im Tagesdetail über „Ändern“ anpassen (Tausch, Urlaub, frei).</p>';
    }
    html += "</section>";
    // Geburtstage
    var imp = D.birthdays.filter(function (b) { return b.source === "import"; }).length, man = D.birthdays.length - imp;
    html += '<section class="section"><h2>Geburtstage</h2><p>' + (D.birthdays.length ? imp + " aus dem Import, " + man + " von Hand." : "Noch keine Geburtstage.") + "</p>" +
      '<details class="help"><summary>So bekommst du die Geburtstage aus Google</summary><ol>' +
      "<li>Öffne <strong>contacts.google.com</strong> im Browser und melde dich an. Am Handy: im Chrome-Menü „Desktop-Version“ einschalten.</li>" +
      "<li>Links auf <strong>Exportieren</strong> tippen.</li><li>Alle Kontakte wählen und als <strong>vCard</strong> oder <strong>Google CSV</strong> exportieren.</li>" +
      "<li>Die Datei landet in den Downloads. Hier unten „Datei wählen“ tippen und sie auswählen.</li></ol></details>" +
      '<label class="btn wide file-btn" style="margin-bottom:10px"><span>Datei wählen (vCard oder CSV)</span><input type="file" data-field="import-contacts" accept=".vcf,.csv,text/vcard,text/x-vcard,text/csv,text/plain" aria-label="Kontakte-Datei wählen"></label>' +
      '<button class="btn ghost wide" data-action="add-birthday">Geburtstag von Hand eintragen</button>';
    if (D.birthdays.length) {
      var sorted = D.birthdays.slice().sort(function (a, b) { return a.month - b.month || a.day - b.day || a.name.localeCompare(b.name, "de"); });
      html += '<details class="help" style="margin-top:12px"><summary>Alle ' + D.birthdays.length + " Geburtstage ansehen</summary><ul class=\"list\">" + sorted.map(function (b) {
        return "<li><div><strong>" + esc(b.name) + "</strong><small>" + b.day + ". " + monthName(b.month) + (b.year ? " " + b.year : "") + "</small></div>" +
          '<button class="small-btn" data-action="del-birthday" data-id="' + esc(b.id) + '" aria-label="' + esc(b.name) + ' löschen">Löschen</button></li>';
      }).join("") + "</ul></details>";
    }
    html += "</section>";
    // Vorlagen
    html += '<section class="section"><h2>Vorlagen</h2><p>Typische Termine, die du beim Anlegen mit einem Tipp übernimmst. Speichern kannst du sie im Termin über „Als Vorlage speichern“.</p>';
    if (D.templates.length) html += '<ul class="list">' + D.templates.map(function (t) {
      return "<li><div><strong>" + esc(t.title) + "</strong><small>" + esc(t.time ? t.time + (t.endTime ? "–" + t.endTime : "") : "ganztägig") + (t.repeat !== "none" ? " · " + L.REPEATS[t.repeat].toLowerCase() : "") + "</small></div>" +
        '<button class="small-btn" data-action="del-template" data-id="' + esc(t.id) + '" aria-label="Vorlage ' + esc(t.title) + ' löschen">Löschen</button></li>';
    }).join("") + "</ul>"; else html += '<p class="small">Noch keine Vorlagen.</p>';
    html += "</section>";
    // Daten
    html += '<section class="section"><h2>Sicherung</h2><p>Deine Daten liegen nur auf diesem Handy. Mit einer Sicherungsdatei kannst du sie aufbewahren oder auf ein neues Handy mitnehmen.</p>' +
      '<button class="btn wide" data-action="export-backup" style="margin-bottom:10px">Sicherung speichern</button>' +
      '<label class="btn ghost wide file-btn" style="margin-bottom:10px"><span>Sicherung zurückspielen</span><input type="file" data-field="import-backup" accept=".json,application/json" aria-label="Sicherungsdatei wählen"></label>' +
      '<button class="btn danger wide" data-action="wipe">Alle Daten löschen</button></section>';
    html += '<p class="version">Kalender ' + VERSION + "</p></div>";
    return html;
  }

  function navHtml() {
    var items = [["month", "Monat", I.month], ["year", "Jahr", I.year], ["agenda", "Termine", I.list], ["more", "Mehr", I.more]];
    return '<nav class="nav" aria-label="Hauptmenü">' + items.map(function (it) {
      return '<button data-action="tab" data-tab="' + it[0] + '"' + (S.tab === it[0] ? ' aria-current="page"' : "") + (S.tab === it[0] ? "" : "") + ">" + it[2] + "<span>" + it[1] + "</span></button>";
    }).join("") + "</nav>";
  }

  function render() {
    var body = S.tab === "year" ? viewYear() : S.tab === "agenda" ? viewAgenda() : S.tab === "more" ? viewMore() : viewMonth();
    var scroll = window.scrollY;
    $app.innerHTML = body + navHtml();
    if (S.keepScroll) window.scrollTo(0, scroll); else window.scrollTo(0, 0);
    S.keepScroll = false;
  }
  function rerender() { S.keepScroll = true; render(); }

  /* ---------- Fenster ---------- */
  function openSheet(html, focusSel) {
    closeSheet(true);
    S.lastFocus = document.activeElement;
    var root = document.createElement("div");
    root.id = "sheet-root"; root.className = "scrim"; root.setAttribute("data-action", "scrim");
    root.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">' + html + "</div>";
    document.body.appendChild(root);
    $app.inert = true; $app.setAttribute("aria-hidden", "true");
    S.sheetOpen = true;
    var f = focusSel ? $(focusSel, root) : null;
    (f || $("input, button, select, textarea", root) || root).focus();
  }
  function closeSheet(silent) {
    var root = document.getElementById("sheet-root");
    if (root) root.remove();
    $app.inert = false; $app.removeAttribute("aria-hidden");
    S.sheetOpen = false;
    if (!silent && S.lastFocus && document.contains(S.lastFocus)) { try { S.lastFocus.focus(); } catch (e) { /* egal */ } }
  }
  function sheetVal(id) { var el = document.getElementById(id); return el ? el.value : ""; }
  function sheetErr(text) { var e = document.getElementById("sheet-err"); if (e) e.textContent = text; }

  function confirmSheet(opts) {
    S.confirmCb = opts.onOk;
    openSheet('<h2 id="sheet-title">' + esc(opts.title) + "</h2><p style=\"margin-bottom:14px;color:var(--ink-2)\">" + esc(opts.text) + '</p><div class="actions">' +
      '<button class="btn' + (opts.danger ? " danger" : "") + '" data-action="confirm-ok">' + esc(opts.ok) + '</button><button class="btn ghost" data-action="close-sheet">Abbrechen</button></div>', '[data-action="close-sheet"]');
  }

  function eventSheet(id, date) {
    var ev = id ? S.data.events.filter(function (e) { return e.id === id; })[0] : null;
    var e = ev || { title: "", date: date, time: "09:00", endTime: "", notes: "", repeat: "none", until: "" };
    var allday = !e.time;
    var html = '<h2 id="sheet-title">' + (ev ? "Termin ändern" : "Neuer Termin") + "</h2>";
    if (!ev && S.data.templates.length) {
      html += '<div class="field"><span class="lbl">Vorlage verwenden</span><div class="chips">' + S.data.templates.map(function (t) {
        return '<button class="chipbtn" data-action="use-template" data-id="' + esc(t.id) + '">' + esc(t.title) + "</button>";
      }).join("") + "</div></div>";
    }
    html += '<div class="field"><label for="ev-title">Titel</label><input class="input" id="ev-title" maxlength="120" autocomplete="off" value="' + esc(e.title) + '"></div>' +
      '<div class="field"><label for="ev-date">Datum</label><input class="input" id="ev-date" type="date" value="' + e.date + '"></div>' +
      '<label class="check"><input type="checkbox" id="ev-allday"' + (allday ? " checked" : "") + '> Ganztägig</label>' +
      '<div class="two field" id="ev-times"' + (allday ? " hidden" : "") + '><div><label for="ev-time" style="font-size:14px;font-weight:600;color:var(--ink-2)">Beginn</label><input class="input" id="ev-time" type="time" value="' + (e.time || "09:00") + '"></div>' +
      '<div><label for="ev-end" style="font-size:14px;font-weight:600;color:var(--ink-2)">Ende (optional)</label><input class="input" id="ev-end" type="time" value="' + (e.endTime || "") + '"></div></div>' +
      '<div class="field" style="margin-top:8px"><label for="ev-repeat">Wiederholen</label><select class="select" id="ev-repeat">' + Object.keys(L.REPEATS).map(function (k) { return '<option value="' + k + '"' + (e.repeat === k ? " selected" : "") + ">" + L.REPEATS[k] + "</option>"; }).join("") + "</select></div>" +
      '<div class="field" id="ev-until-wrap"' + (e.repeat === "none" ? " hidden" : "") + '><label for="ev-until">Wiederholen bis (optional)</label><input class="input" id="ev-until" type="date" value="' + (e.until || "") + '"></div>' +
      '<div class="field"><label for="ev-notes">Notizen</label><textarea class="textarea" id="ev-notes" maxlength="4000">' + esc(e.notes) + "</textarea></div>" +
      '<p class="err" id="sheet-err" role="alert"></p><div class="actions"><button class="btn" data-action="save-event" data-id="' + (ev ? esc(ev.id) : "") + '">Speichern</button>' +
      '<button class="btn ghost" data-action="save-template">Als Vorlage speichern</button>' +
      (ev ? '<button class="btn danger" data-action="delete-event" data-id="' + esc(ev.id) + '">' + (ev.repeat !== "none" ? "Ganze Serie löschen" : "Löschen") + "</button>" : "") +
      '<button class="btn ghost" data-action="close-sheet">Abbrechen</button></div>';
    openSheet(html, "#ev-title");
  }
  function readEventForm() {
    var allday = document.getElementById("ev-allday").checked;
    return {
      title: sheetVal("ev-title"), date: sheetVal("ev-date"), time: allday ? "" : sheetVal("ev-time"), endTime: allday ? "" : sheetVal("ev-end"),
      repeat: sheetVal("ev-repeat"), until: sheetVal("ev-until"), notes: sheetVal("ev-notes")
    };
  }
  function fillEventForm(t) {
    function set(id, v) { var el = document.getElementById(id); if (el) el.value = v; }
    set("ev-title", t.title || "");
    set("ev-notes", t.notes || ""); set("ev-repeat", t.repeat || "none");
    var all = !t.time; document.getElementById("ev-allday").checked = all; document.getElementById("ev-times").hidden = all;
    set("ev-time", t.time || "09:00"); set("ev-end", t.endTime || "");
    document.getElementById("ev-until-wrap").hidden = (t.repeat || "none") === "none";
  }

  function shiftSheet(date) {
    var D = S.data, plan = L.planShiftType(date, D.shift), cur = D.overrides[date] || "";
    var html = '<h2 id="sheet-title">Schicht am ' + esc(L.shortDate(date)) + "</h2>";
    html += '<button class="opt" data-action="set-shift" data-date="' + date + '" data-v="plan" aria-pressed="' + (!cur) + '"><span class="sw" style="background:var(--ink-3)"></span><div><strong>Wie geplant</strong><small>' + (plan ? SHIFT_NAMES[plan] : "Kein Dienst") + "</small></div></button>";
    ["frueh", "spaet", "frei", "urlaub"].forEach(function (k) {
      var t = D.shift.times[k];
      html += '<button class="opt" data-action="set-shift" data-date="' + date + '" data-v="' + k + '" aria-pressed="' + (cur === k) + '"><span class="sw" style="background:var(--' + k + '-solid)"></span><div><strong>' + SHIFT_NAMES[k] + "</strong>" + (t ? "<small>" + t.start + " – " + t.end + " Uhr</small>" : "") + "</div></button>";
    });
    html += '<div class="actions"><button class="btn ghost" data-action="close-sheet">Abbrechen</button></div>';
    openSheet(html, '.opt[aria-pressed="true"]');
  }

  function birthdaySheet() {
    var html = '<h2 id="sheet-title">Geburtstag eintragen</h2><div class="field"><label for="bd-name">Name</label><input class="input" id="bd-name" maxlength="100" autocomplete="off"></div>' +
      '<div class="two field"><div><label for="bd-day" style="font-size:14px;font-weight:600;color:var(--ink-2)">Tag</label><input class="input" id="bd-day" type="number" inputmode="numeric" min="1" max="31"></div>' +
      '<div><label for="bd-month" style="font-size:14px;font-weight:600;color:var(--ink-2)">Monat</label><select class="select" id="bd-month">' + L.MONTHS.map(function (n, i) { return '<option value="' + (i + 1) + '">' + n + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="field"><label for="bd-year">Geburtsjahr (optional, für das Alter)</label><input class="input" id="bd-year" type="number" inputmode="numeric" min="1900" max="2200"></div>' +
      '<p class="err" id="sheet-err" role="alert"></p><div class="actions"><button class="btn" data-action="save-birthday">Speichern</button><button class="btn ghost" data-action="close-sheet">Abbrechen</button></div>';
    openSheet(html, "#bd-name");
  }

  /* ---------- Aktionen ---------- */
  function saveEvent(id) {
    var raw = readEventForm();
    if (!raw.title.trim()) { sheetErr("Bitte einen Titel eingeben."); $("#ev-title").focus(); return; }
    if (!L.isDate(raw.date)) { sheetErr("Bitte ein gültiges Datum wählen."); return; }
    if (raw.time && !L.isTime(raw.time)) { sheetErr("Bitte eine gültige Uhrzeit wählen."); return; }
    if (raw.until && raw.until < raw.date) { sheetErr("„Bis“ liegt vor dem Datum."); return; }
    var obj = L.normalizeEvent(Object.assign({ id: id || undefined }, raw));
    if (!obj) { sheetErr("Der Termin konnte nicht gespeichert werden."); return; }
    if (id) S.data.events = S.data.events.map(function (e) { return e.id === id ? obj : e; }); else S.data.events.push(obj);
    save(); closeSheet(); S.sel = obj.date;
    S.y = +obj.date.slice(0, 4); S.m = +obj.date.slice(5, 7);
    if (S.tab !== "agenda") S.tab = "month";
    rerender(); toast("Termin gespeichert.");
  }
  function saveTemplate() {
    var raw = readEventForm();
    var t = L.normalizeTemplate({ title: raw.title, time: raw.time, endTime: raw.endTime, notes: raw.notes, repeat: raw.repeat });
    if (!t) { sheetErr("Für eine Vorlage braucht es einen Titel."); return; }
    S.data.templates = S.data.templates.filter(function (x) { return x.title.toLowerCase() !== t.title.toLowerCase(); }).concat([t]);
    save(); sheetErr(""); toast("Vorlage „" + t.title + "“ gespeichert.");
  }
  function applyImport(items) {
    var res = L.mergeImportedBirthdays(S.data.birthdays, items);
    S.data.birthdays = res.list; save(); closeSheet(); rerender();
    toast(res.imported + " Geburtstage importiert.");
  }
  function exportBackup() {
    var text = L.backupText(S.data, new Date().toISOString());
    var blob = new Blob([text], { type: "application/json" }), url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "kalender-sicherung-" + S.today + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast("Sicherung wird gespeichert (Downloads).");
  }
  function readFile(file, cb) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast("Die Datei ist zu groß."); return; }
    var fr = new FileReader();
    fr.onload = function () { cb(String(fr.result || ""), file.name); };
    fr.onerror = function () { toast("Die Datei konnte nicht gelesen werden."); };
    fr.readAsText(file);
  }

  /* ---------- Ereignisse ---------- */
  document.addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-action]");
    if (!el) return;
    var a = el.getAttribute("data-action"), ds = el.dataset;
    if (a === "scrim") { if (ev.target === el) closeSheet(); return; }
    switch (a) {
      case "tab": S.tab = ds.tab; if (S.tab === "year") S.year = S.y; render(); break;
      case "prev-month": goMonth(-1); rerender(); break;
      case "next-month": goMonth(1); rerender(); break;
      case "prev-year": S.year--; rerender(); break;
      case "next-year": S.year++; rerender(); break;
      case "today": setToday(); S.y = +S.today.slice(0, 4); S.m = +S.today.slice(5, 7); S.year = S.y; S.sel = S.today; rerender(); break;
      case "pick-day":
        S.sel = ds.date; S.y = +ds.date.slice(0, 4); S.m = +ds.date.slice(5, 7); rerender(); break;
      case "open-month": S.y = +ds.y; S.m = +ds.m; selectDefault(); S.tab = "month"; render(); break;
      case "new-event": eventSheet(null, S.tab === "month" ? S.sel : S.today); break;
      case "edit-event": eventSheet(ds.id, ds.date); break;
      case "save-event": saveEvent(ds.id); break;
      case "save-template": saveTemplate(); break;
      case "use-template": {
        var t = S.data.templates.filter(function (x) { return x.id === ds.id; })[0];
        if (t) fillEventForm(t);
        break;
      }
      case "delete-event":
        if (!el.dataset.armed) { el.dataset.armed = "1"; el.textContent = "Wirklich löschen? Nochmal tippen"; break; }
        S.data.events = S.data.events.filter(function (e) { return e.id !== ds.id; });
        save(); closeSheet(); rerender(); toast("Termin gelöscht."); break;
      case "close-sheet": closeSheet(); break;
      case "confirm-ok": { var cb = S.confirmCb; S.confirmCb = null; if (cb) cb(); break; }
      case "shift-sheet": shiftSheet(ds.date); break;
      case "set-shift":
        if (ds.v === "plan") delete S.data.overrides[ds.date]; else S.data.overrides[ds.date] = ds.v;
        save(); closeSheet(); rerender(); break;
      case "theme": T.set(ds.v); rerender(); break;
      case "this-week":
        S.data.shift.anchorMonday = L.mondayOf(S.today); S.data.shift.anchorType = ds.v; save(); rerender(); toast("Schichtplan angepasst."); break;
      case "toggle-day": {
        var n = +ds.v, days = S.data.shift.days.slice(), i = days.indexOf(n);
        if (i >= 0) days.splice(i, 1); else days.push(n);
        S.data.shift.days = days.sort(); save(); rerender(); break;
      }
      case "add-birthday": birthdaySheet(); break;
      case "save-birthday": {
        var bd = L.normalizeBirthday({ name: sheetVal("bd-name"), day: sheetVal("bd-day"), month: sheetVal("bd-month"), year: sheetVal("bd-year") });
        if (!bd) { sheetErr("Bitte Namen, Tag und Monat prüfen."); break; }
        S.data.birthdays.push(bd); save(); closeSheet(); rerender(); toast("Geburtstag gespeichert."); break;
      }
      case "del-birthday":
        S.data.birthdays = S.data.birthdays.filter(function (b) { return b.id !== ds.id; }); save();
        S.keepScroll = true; render(); var d = $("details.help[open]"); break;
      case "del-template":
        S.data.templates = S.data.templates.filter(function (t2) { return t2.id !== ds.id; }); save(); rerender(); break;
      case "export-backup": exportBackup(); break;
      case "wipe":
        confirmSheet({ title: "Alle Daten löschen?", text: "Schichtplan, Termine, Geburtstage und Vorlagen werden von diesem Handy gelöscht. Das lässt sich nicht rückgängig machen. Besser vorher eine Sicherung speichern.", ok: "Alles löschen", danger: true, onOk: function () {
          S.data = L.emptyData(); save(); closeSheet(); S.tab = "month"; render(); toast("Alle Daten gelöscht.");
        } });
        break;
      case "apply-import": if (S.importItems) { var it = S.importItems; S.importItems = null; applyImport(it); } break;
      default: break;
    }
  });

  document.addEventListener("change", function (ev) {
    var t = ev.target, f = t.dataset && t.dataset.field;
    if (t.id === "ev-allday") { document.getElementById("ev-times").hidden = t.checked; return; }
    if (t.id === "ev-repeat") { document.getElementById("ev-until-wrap").hidden = t.value === "none"; return; }
    if (!f) return;
    if (f === "shift-enabled") { S.data.shift.enabled = t.checked; save(); rerender(); }
    else if (f === "holidays-free") { S.data.shift.holidaysFree = t.checked; save(); rerender(); }
    else if (f === "time") {
      var k = t.dataset.k, p = t.dataset.p;
      if (L.isTime(t.value)) { S.data.shift.times[k][p] = t.value; save(); }
      else { t.value = S.data.shift.times[k][p]; toast("Bitte eine gültige Uhrzeit wählen."); }
    } else if (f === "import-contacts") {
      var file = t.files && t.files[0]; t.value = "";
      readFile(file, function (text, name) {
        var res = L.parseContacts(text, name);
        if (!res.items.length) {
          toast(res.kind === "unknown" ? "Diese Datei kenne ich nicht. Gebraucht wird eine vCard (.vcf) oder CSV aus Google Kontakte." : "In der Datei stehen keine Geburtstage.");
          return;
        }
        S.importItems = res.items;
        var sample = res.items.slice(0, 3).map(function (i2) { return i2.name; }).join(", ");
        var existing = S.data.birthdays.filter(function (b) { return b.source === "import"; }).length;
        openSheet('<h2 id="sheet-title">' + res.items.length + " Geburtstage gefunden</h2><p style=\"margin-bottom:14px;color:var(--ink-2)\">Zum Beispiel: " + esc(sample) + "." +
          (existing ? " Frühere Importe (" + existing + ") werden ersetzt, von Hand eingetragene bleiben." : "") + '</p><div class="actions"><button class="btn" data-action="apply-import">Importieren</button><button class="btn ghost" data-action="close-sheet">Abbrechen</button></div>', '[data-action="apply-import"]');
      });
    } else if (f === "import-backup") {
      var file2 = t.files && t.files[0]; t.value = "";
      readFile(file2, function (text) {
        var res = L.parseBackup(text);
        if (!res.ok) { toast(res.error); return; }
        confirmSheet({ title: "Sicherung zurückspielen?", text: "Die Sicherung enthält " + res.data.events.length + " Termine, " + res.data.birthdays.length + " Geburtstage und " + res.data.templates.length + " Vorlagen. Die aktuellen Daten auf diesem Handy werden ersetzt.", ok: "Zurückspielen", danger: true, onOk: function () {
          S.data = res.data; save(); closeSheet(); render(); toast("Sicherung zurückgespielt.");
        } });
      });
    }
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && S.sheetOpen) { closeSheet(); return; }
    if (ev.key === "Tab" && S.sheetOpen) {   // Tab bleibt im Fenster
      var root = document.getElementById("sheet-root");
      var els = [].slice.call(root.querySelectorAll("button, input, select, textarea, [href]")).filter(function (e) { return !e.disabled && e.offsetParent !== null; });
      if (!els.length) return;
      var first = els[0], last = els[els.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
    if (ev.key === "Enter" && S.sheetOpen && ev.target && ev.target.id === "ev-title") { ev.preventDefault(); var b = $('[data-action="save-event"]'); if (b) b.click(); }
  });

  // Wischen im Monat: links = naechster, rechts = voriger Monat
  var tx = 0, ty = 0, tOn = false;
  document.addEventListener("touchstart", function (e) {
    tOn = S.tab === "month" && !S.sheetOpen && !!e.target.closest(".dow, .wk");
    if (tOn && e.touches.length === 1) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; } else tOn = false;
  }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (!tOn) return; tOn = false;
    var t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 40) { goMonth(dx < 0 ? 1 : -1); rerender(); }
  }, { passive: true });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && setToday() && !S.sheetOpen) { if (S.y === 0) return; rerender(); }
  });

  /* ---------- Start ---------- */
  function boot() {
    load(); setToday();
    S.y = +S.today.slice(0, 4); S.m = +S.today.slice(5, 7); S.year = S.y; S.sel = S.today;
    render();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* egal */ }
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () { /* egal */ }); });
    }
  }
  window.KalApp = { state: S };   // fuer Tests
  boot();
})();
