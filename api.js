/* Katzenklappe - Zugriff auf die GitHub-Schnittstelle des privaten Zeitplan-Repositories.
 * Die App spricht nur mit GitHub (nie direkt mit Sure Petcare): Sonderregeln und Zeiten werden als
 * "Variablen" des Repositories gespeichert, ein Lauf des Zeitplans wird angestossen und der
 * Ergebnis-Stand von dort gelesen.
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

  var WORKFLOW_FILE = "katzenklappe.yml";
  var STATUS_BRANCH = "status";
  var STATUS_FILE = "status.json";
  var HISTORY_FILE = "history.json";
  var VAR_SCHEDULE = "SCHEDULE_JSON";
  var VAR_OVERRIDES = "OVERRIDES_JSON";

  function ApiError(kind, status, message) {
    var e = new Error(message || kind);
    e.name = "ApiError";
    e.kind = kind;       // network | auth | forbidden | rate | notfound | other
    e.status = status || 0;
    return e;
  }

  function errorText(e) {
    if (!e) return "Unbekannter Fehler.";
    switch (e.kind) {
      case "network": return "Keine Verbindung zu GitHub. Bitte Internet prüfen.";
      case "auth": return "Der Zugangsschlüssel wurde abgelehnt. Er ist ungültig oder abgelaufen.";
      case "forbidden": return "Dem Zugangsschlüssel fehlt eine Berechtigung (GitHub meldet „verboten“).";
      case "rate": return "GitHub bremst gerade zu viele Anfragen. Bitte in ein paar Minuten noch einmal versuchen.";
      case "notfound": return "Nicht gefunden. Bitte Name des Repositories und Rechte des Schlüssels prüfen.";
      default: return "GitHub hat einen Fehler gemeldet" + (e.status ? " (" + e.status + ")" : "") + ".";
    }
  }

  function GitHub(cfg, opts) {
    opts = opts || {};
    this.owner = cfg.owner;
    this.repo = cfg.repo;
    this.token = cfg.token;
    this.base = (cfg.base || "https://api.github.com").replace(/\/$/, "");
    this.f = opts.fetch || function (u, o) { return fetch(u, o); };
    this.defaultBranch = null;
  }

  GitHub.prototype.url = function (path) {
    return this.base + "/repos/" + encodeURIComponent(this.owner) + "/" + encodeURIComponent(this.repo) + path;
  };

  // Liefert {status, data, text}. 404 wird nur zurueckgegeben, wenn allowNotFound gesetzt ist.
  GitHub.prototype.req = function (method, path, body, extra) {
    extra = extra || {};
    // Nur Kopfzeilen, die GitHub bei Browser-Anfragen (CORS) zulässt: Accept, Authorization, Content-Type.
    var headers = {
      "Accept": extra.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "Authorization": "Bearer " + this.token
    };
    var init = { method: method, headers: headers };
    if (method === "GET") {
      // Zeitstempel in der Adresse: GitHub erlaubt dem Browser sonst, eine Minute lang Veraltetes zu zeigen
      path += (path.indexOf("?") >= 0 ? "&" : "?") + "_=" + Date.now();
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    return this.f(this.url(path), init).then(function (res) {
      if (res.status >= 200 && res.status < 300) {
        return res.text().then(function (text) {
          var data = null;
          if (!extra.raw && text) { try { data = JSON.parse(text); } catch (e) { data = null; } }
          return { status: res.status, data: data, text: text };
        });
      }
      if (res.status === 404 && extra.allowNotFound) return { status: 404, data: null, text: "" };
      var remaining = res.headers && res.headers.get ? res.headers.get("x-ratelimit-remaining") : null;
      if (res.status === 401) throw ApiError("auth", 401);
      if (res.status === 429 || (res.status === 403 && remaining === "0")) throw ApiError("rate", res.status);
      if (res.status === 403) throw ApiError("forbidden", 403);
      if (res.status === 404) throw ApiError("notfound", 404);
      throw ApiError("other", res.status);
    }, function () {
      throw ApiError("network", 0);
    });
  };

  GitHub.prototype.getRepo = function () {
    var self = this;
    return this.req("GET", "").then(function (r) {
      self.defaultBranch = r.data && r.data.default_branch || "main";
      return { defaultBranch: self.defaultBranch, isPrivate: !!(r.data && r.data.private), fullName: r.data && r.data.full_name };
    });
  };

  // Stand des Zeitplans (Branch "status"); null, wenn es noch keinen gibt
  GitHub.prototype.getStatus = function () {
    return this.req("GET", "/contents/" + STATUS_FILE + "?ref=" + STATUS_BRANCH, undefined, { raw: true, allowNotFound: true })
      .then(function (r) {
        if (r.status === 404) return null;
        try { return JSON.parse(r.text); } catch (e) { throw ApiError("other", 0, "status.json ist kein gueltiges JSON"); }
      });
  };

  // Verlauf (Durchgaenge, Sperren) vom Branch "status": Liste, neueste zuerst; [] wenn es noch keinen gibt.
  // Ein kaputter oder fehlender Verlauf darf die App nie am Laden hindern.
  GitHub.prototype.getHistory = function () {
    return this.req("GET", "/contents/" + HISTORY_FILE + "?ref=" + STATUS_BRANCH, undefined, { raw: true, allowNotFound: true })
      .then(function (r) {
        if (r.status === 404) return [];
        try {
          var d = JSON.parse(r.text);
          return d && Array.isArray(d.events) ? d.events.filter(function (e) { return e && e.t && e.k; }) : [];
        } catch (e) { return []; }
      });
  };

  GitHub.prototype.getVariable = function (name) {
    return this.req("GET", "/actions/variables/" + name, undefined, { allowNotFound: true }).then(function (r) {
      return r.status === 404 ? null : (r.data && typeof r.data.value === "string" ? r.data.value : null);
    });
  };

  GitHub.prototype.setVariable = function (name, value) {
    var self = this;
    return this.req("PATCH", "/actions/variables/" + name, { name: name, value: value }, { allowNotFound: true })
      .then(function (r) {
        if (r.status !== 404) return true;
        return self.req("POST", "/actions/variables", { name: name, value: value }).then(function () { return true; });
      });
  };

  // Datei aus dem Standard-Branch als JSON; null, wenn es sie nicht gibt
  GitHub.prototype.getFileJson = function (path) {
    return this.req("GET", "/contents/" + path, undefined, { raw: true, allowNotFound: true }).then(function (r) {
      if (r.status === 404) return null;
      try { return JSON.parse(r.text); } catch (e) { return null; }
    });
  };

  GitHub.prototype.dispatch = function () {
    var self = this;
    var go = function () {
      return self.req("POST", "/actions/workflows/" + WORKFLOW_FILE + "/dispatches", { ref: self.defaultBranch });
    };
    return (self.defaultBranch ? Promise.resolve() : self.getRepo()).then(go).then(function (r) {
      return { runId: r.data && r.data.workflow_run_id ? r.data.workflow_run_id : null };
    });
  };

  GitHub.prototype.runs = function () {
    return this.req("GET", "/actions/workflows/" + WORKFLOW_FILE + "/runs?per_page=5").then(function (r) {
      var list = (r.data && r.data.workflow_runs) || [];
      return list.map(function (x) {
        return {
          id: x.id, event: x.event, status: x.status, conclusion: x.conclusion,
          createdAt: x.created_at, startedAt: x.run_started_at, updatedAt: x.updated_at
        };
      });
    });
  };

  GitHub.prototype.getOverrides = function () {
    return this.getVariable(VAR_OVERRIDES).then(function (v) {
      if (!v) return {};
      try { var o = JSON.parse(v); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch (e) { return {}; }
    });
  };

  GitHub.prototype.setOverrides = function (obj) {
    return this.setVariable(VAR_OVERRIDES, JSON.stringify(obj));
  };

  // Gespeicherte Zeiten: Variable, sonst schedule.json aus dem Repository, sonst null
  GitHub.prototype.getSchedule = function () {
    var self = this;
    return this.getVariable(VAR_SCHEDULE).then(function (v) {
      if (v) { try { return JSON.parse(v); } catch (e) { /* faellt auf Datei zurueck */ } }
      return self.getFileJson("schedule.json");
    });
  };

  GitHub.prototype.setSchedule = function (jsonText) {
    return this.setVariable(VAR_SCHEDULE, jsonText);
  };

  // Verbindungstest in Alltagssprache: [{label, ok, hint}]
  GitHub.prototype.diagnose = function () {
    var self = this, out = [];
    function step(label, fn, hint) {
      return fn().then(function (detail) {
        out.push({ label: label, ok: true, detail: detail || "" });
      }, function (e) {
        out.push({ label: label, ok: false, detail: errorText(e), hint: hint, kind: e.kind });
      });
    }
    return step("Repository erreichbar", function () {
      return self.getRepo().then(function (r) { return r.fullName; });
    }, "Name von Konto und Repository sowie den Zugangsschlüssel prüfen.")
      .then(function () {
        return step("Stand lesen (Contents: Read)", function () {
          return self.getStatus().then(function (s) { return s ? "" : "Noch kein Stand vorhanden - der erste Lauf fehlt noch."; });
        }, "Beim Schlüssel „Contents“ auf „Read-only“ stellen.");
      })
      .then(function () {
        return step("Einstellungen lesen (Variables: Read)", function () { return self.getVariable(VAR_OVERRIDES).then(function () { return ""; }); },
          "Beim Schlüssel „Variables“ auf „Read and write“ stellen.");
      })
      .then(function () {
        return step("Läufe sehen (Actions: Read)", function () {
          return self.runs().then(function (r) { return r.length ? "" : "Noch kein Lauf vorhanden."; });
        }, "Beim Schlüssel „Actions“ auf „Read and write“ stellen.");
      })
      .then(function () { return out; });
  };

  return {
    GitHub: GitHub, ApiError: ApiError, errorText: errorText,
    WORKFLOW_FILE: WORKFLOW_FILE, STATUS_BRANCH: STATUS_BRANCH,
    VAR_SCHEDULE: VAR_SCHEDULE, VAR_OVERRIDES: VAR_OVERRIDES
  };
});
