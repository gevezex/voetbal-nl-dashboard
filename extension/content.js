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

  /**
   * Haalt een server-gerenderde tab-pagina op. Met `pogingen > 1` probeert hij het bij een
   * tijdelijke storing (netwerkfout, 403/429 of 5xx) opnieuw met oplopende wachttijd; een
   * pagina die echt niet bestaat (404/410) wordt niet herhaald.
   */
  async function fetchHTML(path, pogingen = 1) {
    let laatsteFout = null;
    for (let poging = 1; poging <= pogingen; poging++) {
      if (poging > 1) await new Promise((r) => setTimeout(r, 500 * Math.pow(2, poging - 2)));
      try {
        const res = await fetch(path, { credentials: 'include', headers: { Accept: 'text/html' } });
        if (res.ok) return res.text();
        laatsteFout = new Error('Ophalen mislukt (' + res.status + ')');
        const tijdelijk = res.status === 403 || res.status === 429 || res.status >= 500;
        if (!tijdelijk) break;
      } catch (e) {
        laatsteFout = new Error('Ophalen mislukt (netwerkfout)');
        laatsteFout.cause = e;
      }
    }
    throw laatsteFout || new Error('Ophalen mislukt');
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

  // Cache only for this page lifetime; reloading picks up competition changes.
  let cachedCompetitions = null;
  let competitionsRequest = null;
  async function loadCompetitions() {
    const visible = parseCompetitions();
    if (visible.length) {
      cachedCompetitions = visible;
      return visible;
    }
    if (cachedCompetitions) return cachedCompetitions;
    if (!competitionsRequest) {
      competitionsRequest = (async () => {
        try {
          const html = await fetchHTML('/team/' + OUR_TEAM_ID + '/stand');
          const comps = parseCompetitions(new DOMParser().parseFromString(html, 'text/html'));
          if (comps.length) cachedCompetitions = comps;
          return comps;
        } finally {
          competitionsRequest = null;
        }
      })();
    }
    return competitionsRequest;
  }

  /** Bouw het poule-object op voor een gekozen competitie. */
  async function gatherPoule(competitionSlug = '', competitionLabel = '', voortgang = () => {}) {
    const suffix = competitionSlug ? '/' + competitionSlug : '';
    const base = '/team/' + OUR_TEAM_ID;
    const [standHtml, progHtml, uitHtml] = await Promise.all([
      fetchHTML(base + '/stand' + suffix, 3),
      fetchHTML(base + '/programma' + suffix, 3),
      fetchHTML(base + '/uitslagen' + suffix, 3),
    ]);

    const teams = parseTeams(standHtml);
    if (teams.length === 0) throw new Error('Geen poule-teams gevonden op deze pagina.');

    // Selectie (spelers/staf) ophalen voor ELK team in de poule — in kleine groepjes, zodat we
    // voetbal.nl niet in één keer overwragen. Een team dat blijft hangen slaan we over.
    const rosters = {};
    const teamLijst = teams.slice(0, 20);
    let gedaan = 0;
    for (let i = 0; i < teamLijst.length; i += 4) {
      await Promise.all(
        teamLijst.slice(i, i + 4).map(async (t) => {
          try {
            rosters[t.id] = parseRoster(await fetchHTML('/team/' + t.id + '/team', 2));
          } catch (e) {
            rosters[t.id] = { staff: [], players: [] };
          }
          gedaan++;
          voortgang(gedaan, teamLijst.length);
        })
      );
    }

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
      id: OUR_TEAM_ID + '-' + (competitionSlug || 'default'),
      name: ourTeam.name + ' · ' + competition,
      season: (() => {
        const now = new Date();
        const year = now.getFullYear() - (now.getMonth() < 6 ? 1 : 0);
        return year + '/' + (year + 1);
      })(),
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
  let enabled = false;
  let settingsLoaded = false;
  let settingsRevision = 0;
  /** Bericht naar de service worker; die kan net in slaap zijn, dus we proberen het zo nodig opnieuw. */
  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const fout = chrome.runtime.lastError?.message || response?.error;
        if (fout) reject(new Error(fout));
        else resolve(response || {});
      });
    });
  }
  async function sendMessageMetPoging(message, pogingen = 2) {
    let laatste;
    for (let i = 0; i < pogingen; i++) {
      if (i) await new Promise((r) => setTimeout(r, 400 * Math.pow(2, i - 1)));
      try {
        return await sendMessage(message);
      } catch (e) {
        laatste = e;
      }
    }
    throw laatste;
  }

  /** Terugvalpad: zelf in chrome.storage schrijven, ook als de service worker niet antwoordt. */
  async function savePouleDirect(poule) {
    if (typeof PouleStorage === 'undefined') throw new Error('Opslaan mislukt');
    const data = await new Promise((resolve) => chrome.storage.local.get(['poules', 'pouleAliases'], (d) => resolve(d || {})));
    const result = PouleStorage.merge(data, poule);
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ poules: result.poules, pouleAliases: result.pouleAliases }, () => {
        const fout = chrome.runtime.lastError?.message;
        if (fout) reject(new Error(fout));
        else resolve();
      });
    });
    return result;
  }

  /**
   * Slaat de poule op. Normaal doet de service worker dat (met zijn schrijfrij), maar die kan
   * net in slaap zijn en dan klapt het bericht eruit ("The message port closed…"). Daarom
   * proberen we het daar eerst en schrijven we het anders zelf weg — de merge is idempotent.
   */
  async function savePoule(poule) {
    try {
      const viaWorker = await sendMessageMetPoging({ type: 'save-poule', poule }, 2);
      if (viaWorker.pouleId) return viaWorker;
    } catch (e) {
      console.warn('[poule-dashboard] opslaan via de service worker mislukte, nu direct:', e);
    }
    return savePouleDirect(poule);
  }

  /**
   * Opent het dashboard. Eén poging: elke poging opent namelijk een tabblad. Het antwoord van de
   * service worker komt soms niet aan ("The message port closed…") terwijl het tabblad wél opent —
   * dat is hier dus geen fout.
   */
  async function openDashboard(pouleId) {
    try {
      await sendMessageMetPoging({ type: 'open-dashboard', pouleId }, 1);
      return true;
    } catch (e) {
      if (/message port closed/i.test(String((e && e.message) || ''))) return true;
      console.warn('[poule-dashboard] dashboard openen mislukte:', e);
      return false;
    }
  }

  async function startGather(slug, label) {
    if (!enabled) return;
    const revision = settingsRevision;
    const old = button.textContent;
    const herstel = () => {
      button.textContent = old;
      button.disabled = false;
      if (button.removeAttribute) button.removeAttribute('title');
    };
    const actief = () => enabled && revision === settingsRevision;
    const meld = (tekst, detail, wachttijd) => {
      button.textContent = tekst;
      if (detail) button.title = detail;
      setTimeout(() => {
        if (revision === settingsRevision) herstel();
      }, wachttijd);
    };
    button.textContent = '⏳ Poule ophalen…';
    if (button.removeAttribute) button.removeAttribute('title');
    button.disabled = true;
    try {
      const poule = await gatherPoule(slug, label, (gedaan, totaal) => {
        button.textContent = '⏳ Teams inlezen… ' + gedaan + '/' + totaal;
      });
      if (!actief()) return herstel();
      const saved = await savePoule(poule);
      if (!saved.pouleId) throw new Error('Opslaan mislukt');
      if (!actief()) return herstel();
      const geopend = await openDashboard(saved.pouleId);
      if (!actief()) return herstel();
      if (!geopend) {
        meld('⚠️ Opgeslagen · open via het extensie-icoon', 'De poule is opgeslagen, maar het dashboard openen mislukte.', 8000);
        return;
      }
      herstel();
    } catch (e) {
      if (!actief()) return herstel();
      const melding = e && e.message ? e.message : 'Er ging iets mis';
      console.warn('[poule-dashboard] poule ophalen mislukt:', e, e && e.cause ? e.cause : '');
      const kort = melding.length > 70 ? melding.slice(0, 67) + '…' : melding;
      meld('❌ ' + kort + ' · probeer opnieuw', melding, 6000);
    }
  }

  let closeCompetitionMenu = null;
  function showMenu(comps) {
    if (!enabled) return;
    if (closeCompetitionMenu) closeCompetitionMenu();
    const menu = document.createElement('div');
    menu.id = 'vnd-poule-menu';
    const close = () => {
      menu.remove();
      document.removeEventListener('click', onOutsideClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      closeCompetitionMenu = null;
    };
    const onOutsideClick = (event) => {
      if (!menu.contains(event.target) && !button.contains(event.target)) close();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        close();
        button.focus();
      }
    };
    closeCompetitionMenu = close;
    menu.style.cssText =
      'position:fixed;bottom:76px;right:22px;z-index:2147483647;background:#fff;border:1px solid #e4e4e7;' +
      'border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:6px;min-width:190px;font-family:-apple-system,sans-serif;';
    comps.forEach((c) => {
      const item = document.createElement('button');
      item.textContent = '📊 ' + c.label;
      item.style.cssText = 'display:block;width:100%;text-align:left;background:none;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-size:14px;color:#111;';
      item.onmouseover = () => (item.style.background = '#f0fdf4');
      item.onmouseout = () => (item.style.background = 'none');
      item.onclick = () => { close(); startGather(c.slug, c.label); };
      menu.appendChild(item);
    });
    document.body.appendChild(menu);
    document.addEventListener('click', onOutsideClick, true);
    document.addEventListener('keydown', onKeyDown, true);
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
      if (!enabled || button.disabled) return;
      const revision = settingsRevision;
      if (closeCompetitionMenu) { closeCompetitionMenu(); return; }
      button.disabled = true;
      button.textContent = '⏳ Competities laden…';
      let comps;
      try {
        comps = await loadCompetitions();
        if (!enabled || revision !== settingsRevision) return;
      } catch (e) {
        if (!enabled || revision !== settingsRevision) return;
        button.textContent = '❌ Laden mislukt · probeer opnieuw';
        button.disabled = false;
        return;
      }
      button.textContent = '📊 Maak poule-dashboard';
      button.disabled = false;
      if (comps.length <= 1) startGather(comps[0]?.slug ?? '', comps[0]?.label ?? '');
      else showMenu(comps);
    };
    document.body.appendChild(button);
    // Share this request with an early click instead of fetching the page twice.
    void loadCompetitions().catch(() => {});
  }

  function inject() {
    if (settingsLoaded && enabled) ensureButton();
  }

  function applyEnabled(value) {
    settingsLoaded = true;
    enabled = value !== false;
    settingsRevision++;
    if (!enabled) {
      if (closeCompetitionMenu) closeCompetitionMenu();
      if (button) button.remove();
    } else {
      inject();
    }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.dashboardEnabled) applyEnabled(changes.dashboardEnabled.newValue);
  });
  const initialRevision = settingsRevision;
  chrome.storage.local.get('dashboardEnabled', (data) => {
    if (!chrome.runtime.lastError && settingsRevision === initialRevision) applyEnabled(data.dashboardEnabled);
  });

  if (document.readyState === 'complete') inject();
  else window.addEventListener('load', inject);
  // SPA-navigaties (voetbal.nl navigeert soms client-side)
  new MutationObserver(() => inject()).observe(document.body, { childList: true, subtree: true });
})();
