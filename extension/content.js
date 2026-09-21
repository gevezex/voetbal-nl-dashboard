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

  // De scrape-parsers staan in lib/scrape.ts en komen hier binnen als de globale
  // `PouleScrape` (gegenereerd door `pnpm build:ext`, zie het manifest).
  const { parseCompetitions, parseDivision, parsePoule, parseRoster } = PouleScrape;

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

  // Cache only for this page lifetime; reloading picks up competition changes.
  let cachedCompetitions = null;
  let competitionsRequest = null;
  async function loadCompetitions() {
    const visible = parseCompetitions(document);
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

    const { teams, matches } = parsePoule({ stand: standHtml, programma: progHtml, uitslagen: uitHtml }, OUR_TEAM_ID);
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

  const CONTEXT_FOUT = /extension context invalidated/i;
  const HERLAAD_TEKST = '🔄 Herlaad deze pagina';
  const HERLAAD_DETAIL =
    'De extensie is bijgewerkt of opnieuw geladen. Herlaad deze voetbal.nl-pagina (F5) en klik daarna weer op de knop.';
  let contextDood = false;

  /**
   * Is de extensie-API in dit tabblad nog bruikbaar? Zodra de extensie wordt bijgewerkt of opnieuw
   * geladen, raakt een al geopend content script zijn context kwijt: `chrome.*` gooit dan
   * "Extension context invalidated" (of `chrome.runtime` verdwijnt helemaal). Opnieuw proberen helpt
   * dan niet — alleen de pagina herladen.
   *
   * Een verlopen context gooit die fout synchroon, dus doen we één goedkope proefaanroep. Zo weten
   * we het vóórdat we een hele poule — inclusief alle selecties — binnenhalen.
   */
  function contextWeg() {
    if (contextDood) return true;
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.storage) return true;
      chrome.storage.local.get(null, () => {});
      return false;
    } catch (e) {
      contextDood = true;
      return true;
    }
  }

  /** Blijvende melding op de knop: geen "probeer opnieuw", maar de pagina herladen. */
  function meldContextWeg() {
    if (!button) return;
    button.textContent = HERLAAD_TEKST;
    button.title = HERLAAD_DETAIL;
    button.disabled = false;
  }

  /** Bericht naar de service worker; die kan net in slaap zijn, dus we proberen het zo nodig opnieuw. */
  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const fout = chrome.runtime.lastError?.message || response?.error;
        if (fout) {
          if (CONTEXT_FOUT.test(fout)) contextDood = true;
          reject(new Error(fout));
        } else resolve(response || {});
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
    // Eerst kijken of de extensie-context nog leeft: anders zouden we de hele poule inlezen
    // (inclusief alle selecties) om pas bij het opslaan te ontdekken dat het niet kan.
    if (contextWeg()) return meldContextWeg();
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
      // De extensie kan tijdens het inlezen zijn bijgewerkt: dan is dit tabblad zijn context kwijt.
      if (contextWeg() || CONTEXT_FOUT.test(melding)) return meldContextWeg();
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
      // Een menu openen heeft geen zin als de extensie-context intussen weg is.
      if (contextWeg()) return meldContextWeg();
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
