/**
 * Content script: verschijnt op voetbal.nl-team/poule-pagina's.
 * Toont een knop waarmee de gebruiker de huidige poule omzet naar een dashboard.
 * Leest de Stand- en Programma/Uitslagen-tabs uit (server-gerenderde HTML via fetch,
 * met de ingelogde sessie van de gebruiker), slaat de poule op en opent het dashboard.
 */
(() => {
  const m = location.pathname.match(/^\/team\/([^/]+)/);
  if (!m) return;
  const OUR_TEAM_ID = m[1];

  const $ = (sel, root) => (root || document).querySelector(sel);
  const text = (el) => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '');
  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const isNum = (v) => v != null && v !== '' && !isNaN(parseInt(String(v), 10));

  const MONTHS = {
    januari: 0, februari: 1, maart: 2, april: 3, mei: 4, juni: 5,
    juli: 6, augustus: 7, september: 8, oktober: 9, november: 10, december: 11,
  };
  function parseNLDate(s) {
    // "Zaterdag 12 september 2026"
    const mm = (s || '').match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/i);
    if (!mm) return null;
    const mon = MONTHS[mm[2].toLowerCase()];
    if (mon === undefined) return null;
    return new Date(Date.UTC(+mm[3], mon, +mm[1], 12, 0, 0));
  }
  function parseRound(s) {
    const mm = (s || '').match(/(\d+)/);
    return mm ? +mm[1] : null;
  }

  async function fetchHTML(path) {
    const res = await fetch(path, { credentials: 'include', headers: { Accept: 'text/html' } });
    if (!res.ok) throw new Error('Ophalen mislukt: ' + res.status);
    return res.text();
  }

  /** Parseer het competitie-subtitel (bijv. "Divisie 3 B NAJAAR") uit een tab-pagina. */
  function parseDivision(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const els = doc.querySelectorAll('h3, .subtitle, .title');
    for (const el of els) {
      const t = text(el);
      const m = t.match(/Onder\s*\d+[^]*?\-\s*(.+)$/i);
      if (m && m[1].trim()) return m[1].trim();
    }
    return null;
  }

  /** Parseer de selectie (spelers + staf) uit de Team-tab, zonder afgeschermde namen. */
  function parseRoster(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const staff = [];
    const players = [];
    doc.querySelectorAll('.Playerlist').forEach((group) => {
      const title = text(group.querySelector('.Playerlist-groupTitle')) || '';
      const isStaff = /staf/i.test(title);
      const isPlayers = /spelers/i.test(title);
      if (!isStaff && !isPlayers) return;
      group.querySelectorAll('.Playerlist-group .Playerlist-item').forEach((item) => {
        const first = text(item.querySelector('.Playercopy-firstname'));
        const last = text(item.querySelector('.Playercopy-lastname'));
        const name = (first + ' ' + last).trim();
        if (!name || /afgescherm/i.test(name)) return; // afgeschermde namen overslaan
        const img = item.querySelector('.Avatar-image');
        const src = img ? (img.getAttribute('src') || img.getAttribute('data-src') || '') : '';
        let photo = null;
        if (src && !/fallback|members/i.test(src)) photo = 'https://www.voetbal.nl' + src;
        (isStaff ? staff : players).push({ name, photo });
      });
    });
    return { staff, players };
  }

  /** Parseer de stand-tabel -> lijst van teams in de poule. */
  function parseTeams(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const teams = [];
    const rows = doc.querySelectorAll('.table-standingstable .row');
    for (const row of rows) {
      const teamEl = row.querySelector('.value.team');
      const posEl = row.querySelector('.value.position');
      if (!teamEl || !posEl) continue;
      const name = text(teamEl).replace(/\s+$/, '');
      const pos = text(posEl).replace(/\s+/g, ' ').trim();
      if (!name || /^#$/i.test(pos) || /^(Team|\#)$/i.test(name)) continue;
      const href = row.getAttribute('href') || '';
      const id = (href.match(/\/team\/([^/]+)/) || [])[1] || 't' + teams.length;
      const slug = id;
      const shortName = name.replace(/\s+O\d+.*$/i, '').trim() || name;
      const logoEl = row.querySelector('.value.logo img');
      const logo = logoEl ? (logoEl.getAttribute('src') || logoEl.getAttribute('data-src') || '') : '';
      teams.push({ id, slug, name, shortName, club: name, ours: id === OUR_TEAM_ID, logo });
    }
    return teams;
  }

  /** Parseer een (programma/uitslagen) tabblad -> lijst van wedstrijden. */
  function parseTimetable(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = [];
    const blocks = doc.querySelectorAll('.table-timetable');
    for (const block of blocks) {
      const dateTxt = text($('.header .title', block));
      const roundTxt = text($('.header .subtitle', block));
      const kickoff = parseNLDate(dateTxt);
      const round = parseRound(roundTxt);
      const rows = block.querySelectorAll('.row');
      for (const row of rows) {
        const home = text($('.value.home .team', row));
        const away = text($('.value.away .team', row));
        const center = text($('.value.center', row));
        const href = row.getAttribute('href') || '';
        const matchId = (href.match(/\/wedstrijd\/([^/]+)/) || [])[1] || 'w' + out.length;
        if (!home || !away) continue;
        const score = center.match(/^\s*(\d+)\s*[-–—]\s*(\d+)\s*$/);
        let homeScore = null, awayScore = null, status = 'scheduled';
        if (score) { homeScore = +score[1]; awayScore = +score[2]; status = 'played'; }
        out.push({ id: matchId, home, away, homeScore, awayScore, status, round, kickoff: kickoff ? kickoff.getTime() : null });
      }
    }
    return out;
  }

  /** Detecteer de competities (bijv. "Beker", "Competitie najaar") waarin het team speelt. */
  function parseCompetitions(doc) {
    const root = doc || document;
    const comps = [];
    const seen = new Set();
    root.querySelectorAll('.ScheduleResults-viewSelectTrigger').forEach((a) => {
      const href = a.getAttribute('href') || '';
      const label = text(a.querySelector('span')) || text(a) || a.getAttribute('title') || '';
      const slug = (href.match(/\/(?:stand|programma|uitslagen|indeling)\/([^/]+)/) || [])[1] || '';
      const key = slug || '__default__';
      if (seen.has(key)) return;
      seen.add(key);
      comps.push({ slug, label });
    });
    return comps;
  }

  /** Bouw het poule-object op voor een gekozen competitie. */
  async function gatherPoule(competitionSlug = '', competitionLabel = '') {
    const suffix = competitionSlug ? '/' + competitionSlug : '';
    const base = '/team/' + OUR_TEAM_ID;
    const [standHtml, progHtml, uitHtml] = await Promise.all([
      fetchHTML(base + '/stand' + suffix),
      fetchHTML(base + '/programma' + suffix),
      fetchHTML(base + '/uitslagen' + suffix),
    ]);

    const teams = parseTeams(standHtml);
    if (teams.length === 0) throw new Error('Geen poule-teams gevonden op deze pagina.');

    // Selectie (spelers/staf) ophalen voor ELK team in de poule.
    const rosters = {};
    await Promise.all(
      (teams.slice(0, 20)).map(async (t) => {
        try {
          const html = await fetchHTML('/team/' + t.id + '/team');
          rosters[t.id] = parseRoster(html);
        } catch (e) {
          rosters[t.id] = { staff: [], players: [] };
        }
      })
    );

    const nameById = new Map(teams.map((t) => [norm(t.name), t.id]));

    // Alle wedstrijden (programma = komend, uitslagen = gespeeld), dedupe op id.
    const matches = [];
    const seen = new Set();
    for (const tm of [...parseTimetable(progHtml), ...parseTimetable(uitHtml)]) {
      if (seen.has(tm.id)) continue;
      seen.add(tm.id);
      const homeId = nameById.get(norm(tm.home));
      const awayId = nameById.get(norm(tm.away));
      if (!homeId || !awayId) continue;
      matches.push({ ...tm, homeTeamId: homeId, awayTeamId: awayId });
    }

    const competition = competitionLabel || 'Competitie';
    const ourTeam = teams.find((t) => t.ours) || teams[0];
    const titleTxt = document.title;
    const catM = titleTxt.match(/Onder\s*(\d+)/i);
    const category = catM ? 'O' + catM[1] : null;
    const day = (titleTxt.match(/Onder\s*\d+\s*(Zaterdag|Zondag)/i) || [])[1] || null;
    // klasse/divisie: staat in de subtitel op de Programma/Uitslagen-tabs, bijv. "Divisie 3 B NAJAAR".
    const division = parseDivision(progHtml) || parseDivision(uitHtml);
    const lm = (ourTeam.name || '').match(/O(\d+)(-\d+)?/i);
    const level = lm ? 'O' + lm[1] + (lm[2] || '') : category ? category + '-1' : null;

    const poule = {
      id: OUR_TEAM_ID + '-' + (competitionSlug || 'default') + '-' + (new Date().getTime()),
      name: ourTeam.name + ' · ' + competition,
      season: '2026/2027',
      category,
      level,
      division,
      day,
      competition,
      competitionSlug,
      rosters,
      teams,
      matches,
      ourTeamId: OUR_TEAM_ID,
      updatedAt: new Date().toISOString(),
    };
    return poule;
  }

  let button;
  async function startGather(slug, label) {
    const old = button.textContent;
    button.textContent = '⏳ Poule ophalen…';
    button.disabled = true;
    try {
      const poule = await gatherPoule(slug, label);
      await new Promise((resolve) =>
        chrome.storage.local.get('poules', (d) => {
          const all = d.poules || {};
          all[poule.id] = poule;
          chrome.storage.local.set({ poules: all }, resolve);
        })
      );
      chrome.runtime.sendMessage({ type: 'open-dashboard', pouleId: poule.id });
      button.textContent = old;
      button.disabled = false;
    } catch (e) {
      button.textContent = '❌ ' + (e && e.message ? e.message : 'Er ging iets mis');
      setTimeout(() => { button.textContent = old; button.disabled = false; }, 3500);
    }
  }

  function showMenu(comps) {
    const existing = document.getElementById('vnd-poule-menu');
    if (existing) existing.remove();
    const menu = document.createElement('div');
    menu.id = 'vnd-poule-menu';
    menu.style.cssText =
      'position:fixed;bottom:76px;right:22px;z-index:2147483647;background:#fff;border:1px solid #e4e4e7;' +
      'border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:6px;min-width:190px;font-family:-apple-system,sans-serif;';
    comps.forEach((c) => {
      const item = document.createElement('button');
      item.textContent = '📊 ' + c.label;
      item.style.cssText = 'display:block;width:100%;text-align:left;background:none;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-size:14px;color:#111;';
      item.onmouseover = () => (item.style.background = '#f0fdf4');
      item.onmouseout = () => (item.style.background = 'none');
      item.onclick = () => { menu.remove(); startGather(c.slug, c.label); };
      menu.appendChild(item);
    });
    document.body.appendChild(menu);
    setTimeout(() => {
      if (document.body.contains(menu)) menu.remove();
    }, 8000);
  }

  function ensureButton() {
    if (button && document.body.contains(button)) return;
    button = document.createElement('button');
    button.id = 'vnd-poule-btn';
    button.textContent = '📊 Maak poule-dashboard';
    button.style.cssText =
      'position:fixed;bottom:22px;right:22px;z-index:2147483647;background:#16a34a;color:#fff;' +
      'border:none;border-radius:999px;padding:12px 18px;font-size:14px;font-weight:600;' +
      'box-shadow:0 6px 18px rgba(0,0,0,.28);cursor:pointer;font-family:-apple-system,sans-serif;';
    button.onclick = async () => {
      let comps = parseCompetitions();
      if (comps.length === 0) {
        // Competitie-selects zitten in de tab-pagina's; haal ze op via de stand-pagina.
        try {
          const html = await fetchHTML('/team/' + OUR_TEAM_ID + '/stand');
          comps = parseCompetitions(new DOMParser().parseFromString(html, 'text/html'));
        } catch (e) {
          /* geef het gewoon op, dan wordt de standaard-competitie gebruikt */
        }
      }
      if (comps.length <= 1) startGather(comps[0]?.slug ?? '', comps[0]?.label ?? '');
      else showMenu(comps);
    };
    document.body.appendChild(button);
  }

  function inject() {
    ensureButton();
  }

  if (document.readyState === 'complete') inject();
  else window.addEventListener('load', inject);
  // SPA-navigaties (voetbal.nl navigeert soms client-side)
  new MutationObserver(() => inject()).observe(document.body, { childList: true, subtree: true });
})();
