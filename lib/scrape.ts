/**
 * Pure parsers voor de server-gerenderde HTML van voetbal.nl.
 *
 * Deze regels staan bewust op één plek. Het content script gebruikt de gegenereerde
 * `extension/poule-scrape.js` (esbuild-bundel van dit bestand, als globale `PouleScrape`),
 * het dashboard importeert dit bestand rechtstreeks. Verandert voetbal.nl zijn markup, dan
 * hoef je dat dus maar op één plek op te lossen.
 *
 * Alles werkt op HTML-strings of een al geparseerd Document en doet zelf geen netwerkverkeer.
 */

export type ScrapeTeam = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  club: string;
  ours?: boolean;
  logo?: string | null;
};

export type ScrapeMatch = {
  id: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  round: number | null;
  kickoff: number | null;
};

/** Wedstrijd waarin de teamnamen al aan team-id's zijn gekoppeld. */
export type ScrapeMatchRow = ScrapeMatch & { homeTeamId: string; awayTeamId: string };

export type Competition = { slug: string; label: string };

export type Roster = {
  staff: { name: string; photo: string | null }[];
  players: { name: string; photo: string | null }[];
};

const tekst = (el: Element | null | undefined): string =>
  el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();
const binnen = (root: ParentNode, sel: string): Element | null => root.querySelector(sel);
const maakDoc = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

const MONTHS: Record<string, number> = {
  januari: 0, februari: 1, maart: 2, april: 3, mei: 4, juni: 5,
  juli: 6, augustus: 7, september: 8, oktober: 9, november: 10, december: 11,
};

/** "Zaterdag 12 september 2026" → epoch in ms (12:00 UTC), of null. */
export function parseNLDate(s: string | null | undefined): number | null {
  const mm = (s || '').match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/i);
  if (!mm) return null;
  const mon = MONTHS[mm[2].toLowerCase()];
  if (mon === undefined) return null;
  return Date.UTC(+mm[3], mon, +mm[1], 12, 0, 0);
}

/** Eerste getal uit een ronde-titel ("Ronde 3" → 3), of null. */
export function parseRound(s: string | null | undefined): number | null {
  const mm = (s || '').match(/(\d+)/);
  return mm ? +mm[1] : null;
}

/** Competitie-subtitel (bijv. "Divisie 3 B NAJAAR") uit een tab-pagina. */
export function parseDivision(html: string): string | null {
  const doc = maakDoc(html);
  for (const el of Array.from(doc.querySelectorAll('h3, .subtitle, .title'))) {
    const t = tekst(el);
    const m = t.match(/Onder\s*\d+[^]*?\-\s*(.+)$/i);
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

/** Selectie (spelers + staf) uit de Team-tab; afgeschermde namen worden overgeslagen. */
export function parseRoster(html: string): Roster {
  const doc = maakDoc(html);
  const staff: Roster['staff'] = [];
  const players: Roster['players'] = [];
  doc.querySelectorAll('.Playerlist').forEach((group) => {
    const title = tekst(binnen(group, '.Playerlist-groupTitle'));
    const isStaff = /staf/i.test(title);
    const isPlayers = /spelers/i.test(title);
    if (!isStaff && !isPlayers) return;
    group.querySelectorAll('.Playerlist-group .Playerlist-item').forEach((item) => {
      const first = tekst(binnen(item, '.Playercopy-firstname'));
      const last = tekst(binnen(item, '.Playercopy-lastname'));
      const name = (first + ' ' + last).trim();
      if (!name || /afgescherm/i.test(name)) return; // afgeschermde namen overslaan
      const img = binnen(item, '.Avatar-image');
      const src = img ? img.getAttribute('src') || img.getAttribute('data-src') || '' : '';
      let photo: string | null = null;
      if (src && !/fallback|members/i.test(src)) photo = 'https://www.voetbal.nl' + src;
      (isStaff ? staff : players).push({ name, photo });
    });
  });
  return { staff, players };
}

/** Stand-tabel → de teams van de poule. `ourTeamId` markeert de eigen ploeg. */
export function parseTeams(html: string, ourTeamId: string): ScrapeTeam[] {
  const doc = maakDoc(html);
  const teams: ScrapeTeam[] = [];
  for (const row of Array.from(doc.querySelectorAll('.table-standingstable .row'))) {
    const teamEl = binnen(row, '.value.team');
    const posEl = binnen(row, '.value.position');
    if (!teamEl || !posEl) continue;
    const name = tekst(teamEl).replace(/\s+$/, '');
    const pos = tekst(posEl);
    if (!name || /^#$/i.test(pos) || /^(Team|#)$/i.test(name)) continue;
    const href = row.getAttribute('href') || '';
    const id = (href.match(/\/team\/([^/]+)/) || [])[1] || 't' + teams.length;
    const shortName = name.replace(/\s+O\d+.*$/i, '').trim() || name;
    const logoEl = binnen(row, '.value.logo img');
    const logo = logoEl ? logoEl.getAttribute('src') || logoEl.getAttribute('data-src') || '' : '';
    teams.push({ id, slug: id, name, shortName, club: name, ours: id === ourTeamId, logo });
  }
  return teams;
}

/** Programma- of uitslagen-tab → de wedstrijden (nog zonder team-id's). */
export function parseTimetable(html: string): ScrapeMatch[] {
  const doc = maakDoc(html);
  const out: ScrapeMatch[] = [];
  for (const block of Array.from(doc.querySelectorAll('.table-timetable'))) {
    const dateTxt = tekst(binnen(block, '.header .title'));
    const roundTxt = tekst(binnen(block, '.header .subtitle'));
    const kickoff = parseNLDate(dateTxt);
    const round = parseRound(roundTxt);
    for (const row of Array.from(block.querySelectorAll('.row'))) {
      const home = tekst(binnen(row, '.value.home .team'));
      const away = tekst(binnen(row, '.value.away .team'));
      const center = tekst(binnen(row, '.value.center'));
      if (!home || !away) continue;
      const href = row.getAttribute('href') || '';
      const matchId = (href.match(/\/wedstrijd\/([^/]+)/) || [])[1] || 'w' + out.length;
      const score = center.match(/^\s*(\d+)\s*[-–—]\s*(\d+)\s*$/);
      let homeScore: number | null = null;
      let awayScore: number | null = null;
      let status = 'scheduled';
      if (score) {
        homeScore = +score[1];
        awayScore = +score[2];
        status = 'played';
      }
      out.push({ id: matchId, home, away, homeScore, awayScore, status, round, kickoff });
    }
  }
  return out;
}

/** De competities waarin een team speelt, uit het keuzemenu van voetbal.nl. */
export function parseCompetitions(doc: ParentNode): Competition[] {
  const comps: Competition[] = [];
  const seen = new Set<string>();
  doc.querySelectorAll('.ScheduleResults-viewSelectTrigger').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const label = tekst(binnen(a, 'span')) || tekst(a) || a.getAttribute('title') || '';
    const slug = (href.match(/\/(?:stand|programma|uitslagen|indeling)\/([^/]+)/) || [])[1] || '';
    const key = slug || '__default__';
    if (seen.has(key)) return;
    seen.add(key);
    comps.push({ slug, label });
  });
  return comps;
}

/**
 * Stand + programma + uitslagen → teams en wedstrijden met team-id's.
 * Wedstrijden waarvan een teamnaam niet in de stand voorkomt, worden overgeslagen;
 * duels die op beide tabbladen staan (programma én uitslagen) tellen maar één keer.
 */
export function parsePoule(
  files: { stand: string; programma: string; uitslagen: string },
  ourTeamId: string
): { teams: ScrapeTeam[]; matches: ScrapeMatchRow[] } {
  const teams = parseTeams(files.stand, ourTeamId);
  const nameById = new Map(teams.map((t) => [norm(t.name), t.id]));
  const matches: ScrapeMatchRow[] = [];
  const seen = new Set<string>();
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
