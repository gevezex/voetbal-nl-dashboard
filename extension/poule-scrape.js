"use strict";
var PouleScrape = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // lib/scrape.ts
  var scrape_exports = {};
  __export(scrape_exports, {
    parseCompetitions: () => parseCompetitions,
    parseDivision: () => parseDivision,
    parseNLDate: () => parseNLDate,
    parsePoule: () => parsePoule,
    parseRoster: () => parseRoster,
    parseRound: () => parseRound,
    parseTeams: () => parseTeams,
    parseTimetable: () => parseTimetable
  });
  var tekst = (el) => el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "";
  var norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  var binnen = (root, sel) => root.querySelector(sel);
  var maakDoc = (html) => new DOMParser().parseFromString(html, "text/html");
  var MONTHS = {
    januari: 0,
    februari: 1,
    maart: 2,
    april: 3,
    mei: 4,
    juni: 5,
    juli: 6,
    augustus: 7,
    september: 8,
    oktober: 9,
    november: 10,
    december: 11
  };
  function parseNLDate(s) {
    const mm = (s || "").match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/i);
    if (!mm) return null;
    const mon = MONTHS[mm[2].toLowerCase()];
    if (mon === void 0) return null;
    return Date.UTC(+mm[3], mon, +mm[1], 12, 0, 0);
  }
  function parseRound(s) {
    const mm = (s || "").match(/(\d+)/);
    return mm ? +mm[1] : null;
  }
  function parseDivision(html) {
    const doc = maakDoc(html);
    for (const el of Array.from(doc.querySelectorAll("h3, .subtitle, .title"))) {
      const t = tekst(el);
      const m = t.match(/Onder\s*\d+[^]*?\-\s*(.+)$/i);
      if (m && m[1].trim()) return m[1].trim();
    }
    return null;
  }
  function parseRoster(html) {
    const doc = maakDoc(html);
    const staff = [];
    const players = [];
    doc.querySelectorAll(".Playerlist").forEach((group) => {
      const title = tekst(binnen(group, ".Playerlist-groupTitle"));
      const isStaff = /staf/i.test(title);
      const isPlayers = /spelers/i.test(title);
      if (!isStaff && !isPlayers) return;
      group.querySelectorAll(".Playerlist-group .Playerlist-item").forEach((item) => {
        const first = tekst(binnen(item, ".Playercopy-firstname"));
        const last = tekst(binnen(item, ".Playercopy-lastname"));
        const name = (first + " " + last).trim();
        if (!name || /afgescherm/i.test(name)) return;
        const img = binnen(item, ".Avatar-image");
        const src = img ? img.getAttribute("src") || img.getAttribute("data-src") || "" : "";
        let photo = null;
        if (src && !/fallback|members/i.test(src)) photo = "https://www.voetbal.nl" + src;
        (isStaff ? staff : players).push({ name, photo });
      });
    });
    return { staff, players };
  }
  function parseTeams(html, ourTeamId) {
    const doc = maakDoc(html);
    const teams = [];
    for (const row of Array.from(doc.querySelectorAll(".table-standingstable .row"))) {
      const teamEl = binnen(row, ".value.team");
      const posEl = binnen(row, ".value.position");
      if (!teamEl || !posEl) continue;
      const name = tekst(teamEl).replace(/\s+$/, "");
      const pos = tekst(posEl);
      if (!name || /^#$/i.test(pos) || /^(Team|#)$/i.test(name)) continue;
      const href = row.getAttribute("href") || "";
      const id = (href.match(/\/team\/([^/]+)/) || [])[1] || "t" + teams.length;
      const shortName = name.replace(/\s+O\d+.*$/i, "").trim() || name;
      const logoEl = binnen(row, ".value.logo img");
      const logo = logoEl ? logoEl.getAttribute("src") || logoEl.getAttribute("data-src") || "" : "";
      teams.push({ id, slug: id, name, shortName, club: name, ours: id === ourTeamId, logo });
    }
    return teams;
  }
  function parseTimetable(html) {
    const doc = maakDoc(html);
    const out = [];
    for (const block of Array.from(doc.querySelectorAll(".table-timetable"))) {
      const dateTxt = tekst(binnen(block, ".header .title"));
      const roundTxt = tekst(binnen(block, ".header .subtitle"));
      const kickoff = parseNLDate(dateTxt);
      const round = parseRound(roundTxt);
      for (const row of Array.from(block.querySelectorAll(".row"))) {
        const home = tekst(binnen(row, ".value.home .team"));
        const away = tekst(binnen(row, ".value.away .team"));
        const center = tekst(binnen(row, ".value.center"));
        if (!home || !away) continue;
        const href = row.getAttribute("href") || "";
        const matchId = (href.match(/\/wedstrijd\/([^/]+)/) || [])[1] || "w" + out.length;
        const score = center.match(/^\s*(\d+)\s*[-–—]\s*(\d+)\s*$/);
        let homeScore = null;
        let awayScore = null;
        let status = "scheduled";
        if (score) {
          homeScore = +score[1];
          awayScore = +score[2];
          status = "played";
        }
        out.push({ id: matchId, home, away, homeScore, awayScore, status, round, kickoff });
      }
    }
    return out;
  }
  function parseCompetitions(doc) {
    const comps = [];
    const seen = /* @__PURE__ */ new Set();
    doc.querySelectorAll(".ScheduleResults-viewSelectTrigger").forEach((a) => {
      const href = a.getAttribute("href") || "";
      const label = tekst(binnen(a, "span")) || tekst(a) || a.getAttribute("title") || "";
      const slug = (href.match(/\/(?:stand|programma|uitslagen|indeling)\/([^/]+)/) || [])[1] || "";
      const key = slug || "__default__";
      if (seen.has(key)) return;
      seen.add(key);
      comps.push({ slug, label });
    });
    return comps;
  }
  function parsePoule(files, ourTeamId) {
    const teams = parseTeams(files.stand, ourTeamId);
    const nameById = new Map(teams.map((t) => [norm(t.name), t.id]));
    const matches = [];
    const seen = /* @__PURE__ */ new Set();
    for (const tm of [...parseTimetable(files.programma), ...parseTimetable(files.uitslagen)]) {
      if (seen.has(tm.id)) continue;
      seen.add(tm.id);
      const homeId = nameById.get(norm(tm.home));
      const awayId = nameById.get(norm(tm.away));
      if (!homeId || !awayId) continue;
      matches.push({ ...tm, homeTeamId: homeId, awayTeamId: awayId });
    }
    return { teams, matches };
  }
  return __toCommonJS(scrape_exports);
})();
