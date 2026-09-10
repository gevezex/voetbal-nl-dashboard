/**
 * Uitgebreide statistiek- en analyselaag bovenop `compute.ts`.
 *
 * Alles rekent uitsluitend op wedstrijduitslagen (geen goal-momenten of
 * line-ups), precies zoals de catalogus voorschrijft. De functies zijn puur
 * (geen I/O) zodat ze zowel in de Next.js-server als in de Chrome-extensie
 * (gebundeld met esbuild) draaien.
 *
 * Catalogus:
 *   1. Basis-KPI's per team
 *   2. Thuis/uit-splitsing + thuisvoordeel-index + reisprestatierang
 *   3. Vorm en momentum (rolling, EWMA, reeksen, breukpuntdetectie)
 *   4. Sterkteratings (Elo, Massey, Colley, Bradley-Terry, Pi, aanval/verdediging)
 *   5. Voorspellende modellen (Poisson, Dixon-Coles, bivariaat, negatief-binomiaal)
 *   6. Correctie voor programmazwaarte (SOS, tegenstanderklasse)
 *   7. Geluk en regressie (Pythagorean, geluk-index)
 *   8. Stijlprofilering (tempo, variantie, k-means archetypen)
 *   9. Onderlinge historie (meerdere seizoenen, thuis/uit, steekproefwaarschuwing)
 *  10. Scenario en hefboom (Monte Carlo, eindstand-verdeling, hefboom per duel)
 *  11. Visualisaties gebeuren in de UI; deze module levert de data.
 */

import {
  type MatchRow,
  type TeamRow,
  type Result,
  type Standing,
  type TeamRecord,
  computeStandings,
  playedMatches,
  fromTeamPerspective,
  poisson,
  type TeamPerspective,
} from './compute';

// ---------------------------------------------------------------------------
// Kleine wiskundige helpers
// ---------------------------------------------------------------------------

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
export const variance = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1);
};
export const std = (xs: number[]) => Math.sqrt(variance(xs));
export const normalizeText = (s: string | null | undefined) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Deterministische PRNG (mulberry32) zodat simulaties reproduceerbaar zijn. */
export function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Los A x = b op via Gauss-eliminatie met partiële pivoting (kleine stelsels). */
export function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  if (n === 0) return [];
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (Math.abs(M[piv][col]) < 1e-12) continue; // singulier → variabele blijft 0
    [M[col], M[piv]] = [M[piv], M[col]];
    const p = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

// ---------------------------------------------------------------------------
// 1. Basis-KPI's per team
// ---------------------------------------------------------------------------

export type Venue = 'all' | 'home' | 'away';

export type ResultKpis = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  ppg: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  gfPerGame: number;
  gaPerGame: number;
  gdPerGame: number;
  winPct: number;
  drawPct: number;
  lossPct: number;
  cleanSheets: number;
  cleanSheetPct: number;
  failedToScore: number;
  failedToScorePct: number;
};

function kpisFrom(perspectives: TeamPerspective[]): ResultKpis {
  const n = perspectives.length;
  let won = 0;
  let drawn = 0;
  let lost = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let cleanSheets = 0;
  let failedToScore = 0;
  for (const p of perspectives) {
    goalsFor += p.gf;
    goalsAgainst += p.ga;
    if (p.result === 'W') won++;
    else if (p.result === 'G') drawn++;
    else lost++;
    if (p.ga === 0) cleanSheets++;
    if (p.gf === 0) failedToScore++;
  }
  const points = won * 3 + drawn;
  return {
    played: n,
    won,
    drawn,
    lost,
    points,
    ppg: n ? points / n : 0,
    goalsFor,
    goalsAgainst,
    goalDiff: goalsFor - goalsAgainst,
    gfPerGame: n ? goalsFor / n : 0,
    gaPerGame: n ? goalsAgainst / n : 0,
    gdPerGame: n ? (goalsFor - goalsAgainst) / n : 0,
    winPct: n ? won / n : 0,
    drawPct: n ? drawn / n : 0,
    lossPct: n ? lost / n : 0,
    cleanSheets,
    cleanSheetPct: n ? cleanSheets / n : 0,
    failedToScore,
    failedToScorePct: n ? failedToScore / n : 0,
  };
}

export type TeamKpis = ResultKpis & {
  teamId: string;
  biggestWin: MatchHighlight | null;
  biggestLoss: MatchHighlight | null;
  mostCommonScore: { score: string; count: number; pct: number } | null;
  avgTotalGoals: number;
  btts: number; // beide teams scoren
  over25: number; // boven 2,5 doelpunten
  winMargins: { one: number; two: number; threePlus: number };
  winMarginDistribution: Array<{ margin: number; count: number }>;
};

export type MatchHighlight = {
  opponentId: string;
  goalsFor: number;
  goalsAgainst: number;
  margin: number;
  round: number | null;
  kickoff: number | null;
  home: boolean;
};

export function perspectivesOf(teamId: string, matches: MatchRow[], venue: Venue = 'all'): TeamPerspective[] {
  return playedMatches(matches)
    .map((m) => fromTeamPerspective(m, teamId))
    .filter((p): p is TeamPerspective => p !== null)
    .filter((p) => (venue === 'all' ? true : venue === 'home' ? p.home : !p.home));
}

/** Volledige basis-KPI-set voor een team (optioneel thuis/uit gefilterd). */
export function computeTeamKpis(teamId: string, matches: MatchRow[], venue: Venue = 'all'): TeamKpis {
  const played = playedMatches(matches).filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId);
  const perspectives = played
    .map((m) => ({ p: fromTeamPerspective(m, teamId), m }))
    .filter((x): x is { p: TeamPerspective; m: MatchRow & { homeScore: number; awayScore: number } } => x.p !== null)
    .filter((x) => (venue === 'all' ? true : venue === 'home' ? x.p.home : !x.p.home));

  const kpis = kpisFrom(perspectives.map((x) => x.p));

  let biggestWin: MatchHighlight | null = null;
  let biggestLoss: MatchHighlight | null = null;
  const scoreCount = new Map<string, number>();
  let totalGoals = 0;
  let btts = 0;
  let over25 = 0;
  const marginCount = new Map<number, number>();

  for (const { p, m } of perspectives) {
    const opponentId = m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId;
    const margin = p.gf - p.ga;
    const highlight: MatchHighlight = {
      opponentId,
      goalsFor: p.gf,
      goalsAgainst: p.ga,
      margin,
      round: m.round,
      kickoff: m.kickoff,
      home: p.home,
    };
    if (margin > 0 && (!biggestWin || margin > biggestWin.margin)) biggestWin = highlight;
    if (margin < 0 && (!biggestLoss || margin < biggestLoss.margin)) biggestLoss = highlight;

    const key = `${p.gf}-${p.ga}`;
    scoreCount.set(key, (scoreCount.get(key) || 0) + 1);
    totalGoals += p.gf + p.ga;
    if (p.gf > 0 && p.ga > 0) btts++;
    if (p.gf + p.ga > 2.5) over25++;
    if (p.result === 'W') marginCount.set(margin, (marginCount.get(margin) || 0) + 1);
  }

  const n = kpis.played;
  let mostCommonScore: TeamKpis['mostCommonScore'] = null;
  for (const [score, count] of scoreCount) {
    if (!mostCommonScore || count > mostCommonScore.count) {
      mostCommonScore = { score, count, pct: n ? count / n : 0 };
    }
  }

  const one = marginCount.get(1) || 0;
  const two = marginCount.get(2) || 0;
  const threePlus = [...marginCount.entries()].filter(([m]) => m >= 3).reduce((a, b) => a + b[1], 0);

  return {
    teamId,
    ...kpis,
    biggestWin,
    biggestLoss,
    mostCommonScore,
    avgTotalGoals: n ? totalGoals / n : 0,
    btts: n ? btts / n : 0,
    over25: n ? over25 / n : 0,
    winMargins: { one, two, threePlus },
    winMarginDistribution: [...marginCount.entries()]
      .map(([margin, count]) => ({ margin, count }))
      .sort((a, b) => a.margin - b.margin),
  };
}

// ---------------------------------------------------------------------------
// 2. Thuis/uit-splitsing + thuisvoordeel-index + reisprestatierang
// ---------------------------------------------------------------------------

export type HomeAwayAnalysis = {
  teamId: string;
  home: TeamKpis;
  away: TeamKpis;
  /** (ppg thuis − ppg uit) van dit team. */
  rawEdge: number;
  /** Gemiddelde (ppg thuis − ppg uit) over de hele poule. */
  leagueEdge: number;
  /** rawEdge − leagueEdge: >0 = échte thuistijger, <0 = reisploeg. */
  homeAdvantageIndex: number;
  /** Rang binnen de poule op uit-punten per duel (1 = beste reisprestatie). */
  travelRank: number;
  travelTeams: number;
};

export function homeAwayAnalysis(teamId: string, teams: TeamRow[], matches: MatchRow[]): HomeAwayAnalysis {
  const home = computeTeamKpis(teamId, matches, 'home');
  const away = computeTeamKpis(teamId, matches, 'away');
  const rawEdge = home.ppg - away.ppg;

  const perTeam = teams
    .map((t) => ({
      id: t.id,
      edge: computeTeamKpis(t.id, matches, 'home').ppg - computeTeamKpis(t.id, matches, 'away').ppg,
      awayPpg: computeTeamKpis(t.id, matches, 'away').ppg,
      played: computeTeamKpis(t.id, matches).played,
    }))
    .filter((x) => x.played > 0);

  const leagueEdge = mean(perTeam.map((x) => x.edge));
  const travelOrder = [...teams]
    .map((t) => ({ id: t.id, ppg: computeTeamKpis(t.id, matches, 'away').ppg }))
    .filter((x) => computeTeamKpis(x.id, matches, 'away').played > 0)
    .sort((a, b) => b.ppg - a.ppg);
  const travelRank = travelOrder.findIndex((x) => x.id === teamId) + 1;

  return {
    teamId,
    home,
    away,
    rawEdge,
    leagueEdge,
    homeAdvantageIndex: rawEdge - leagueEdge,
    travelRank: travelRank || travelOrder.length,
    travelTeams: travelOrder.length,
  };
}

// ---------------------------------------------------------------------------
// 3. Vorm en momentum
// ---------------------------------------------------------------------------

export type Momentum = {
  teamId: string;
  form5: Result[];
  form6: Result[];
  /** Punten per wedstrijd over een schuivend venster van 5 (chronologisch). */
  rollingPpg: number[];
  /** Doelsaldo per wedstrijd over een schuivend venster van 5. */
  rollingGd: number[];
  last5Ppg: number;
  seasonPpg: number;
  momentumDelta: number;
  /** Exponentieel gewogen vorm (alpha = 0.35), 0-3 punten per duel. */
  ewmaPpg: number;
  /** EWMA-verloop per duel (chronologisch). */
  ewmaSeries: number[];
  currentStreak: { type: Result | 'onbeat'; length: number };
  currentUnbeaten: number;
  longestWinStreak: number;
  longestUnbeatenStreak: number;
  longestLossStreak: number;
  /** Omslagpunt: speelronde waarop de puntencurve kantelde. */
  turningPoint: { round: number | null; kickoff: number | null; label: string } | null;
  trend: 'opgaand' | 'dalend' | 'stabiel';
};

function streaks(results: Result[]) {
  let longestWin = 0;
  let longestUnbeaten = 0;
  let longestLoss = 0;
  let win = 0;
  let unbeaten = 0;
  let loss = 0;
  for (const r of results) {
    win = r === 'W' ? win + 1 : 0;
    unbeaten = r === 'V' ? 0 : unbeaten + 1;
    loss = r === 'V' ? loss + 1 : 0;
    longestWin = Math.max(longestWin, win);
    longestUnbeaten = Math.max(longestUnbeaten, unbeaten);
    longestLoss = Math.max(longestLoss, loss);
  }
  return { longestWin, longestUnbeaten, longestLoss };
}

export function computeMomentum(teamId: string, matches: MatchRow[], window = 5): Momentum {
  const chronological = playedMatches(matches)
    .map((m) => ({ p: fromTeamPerspective(m, teamId), m }))
    .filter((x): x is { p: TeamPerspective; m: MatchRow & { homeScore: number; awayScore: number } } => x.p !== null)
    .sort((a, b) => (a.m.kickoff ?? 0) - (b.m.kickoff ?? 0));

  const points = chronological.map((x) => (x.p.result === 'W' ? 3 : x.p.result === 'G' ? 1 : 0));
  const gds = chronological.map((x) => x.p.gf - x.p.ga);
  const results = chronological.map((x) => x.p.result);
  const n = results.length;

  const rollingPpg: number[] = [];
  const rollingGd: number[] = [];
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = points.slice(start, i + 1);
    rollingPpg.push(mean(slice));
    rollingGd.push(mean(gds.slice(start, i + 1)));
  }

  const last5Ppg = n ? rollingPpg[n - 1] : 0;
  const seasonPpg = n ? sum(points) / n : 0;

  const alpha = 0.35;
  let ewma = 0;
  const ewmaSeries: number[] = [];
  points.forEach((p, i) => {
    ewma = i === 0 ? p : alpha * p + (1 - alpha) * ewma;
    ewmaSeries.push(ewma);
  });

  // Huidige reeks vanaf de laatste wedstrijd terug.
  let currentUnbeaten = 0;
  for (let i = n - 1; i >= 0 && results[i] !== 'V'; i--) currentUnbeaten++;
  let currentType: Result | 'onbeat' = 'onbeat';
  let currentLength = 0;
  if (n > 0 && results[n - 1] === 'V') {
    currentType = 'V';
    for (let i = n - 1; i >= 0 && results[i] === 'V'; i--) currentLength++;
  } else {
    currentLength = currentUnbeaten;
  }

  const { longestWin, longestUnbeaten, longestLoss } = streaks(results);

  // Breukpuntdetectie: splitst de puntenreeks in twee en kiest de splitsing met
  // het grootste verschil in gemiddelde (min. 3 duels aan beide kanten).
  let turningPoint: Momentum['turningPoint'] = null;
  let bestDiff = 0;
  for (let split = 3; split <= n - 3; split++) {
    const before = mean(points.slice(0, split));
    const after = mean(points.slice(split));
    const diff = after - before;
    if (Math.abs(diff) > Math.abs(bestDiff)) {
      bestDiff = diff;
      const at = chronological[split];
      turningPoint = {
        round: at.m.round,
        kickoff: at.m.kickoff,
        label: diff > 0 ? 'vorm kantelde omhoog' : 'vorm kantelde omlaag',
      };
    }
  }

  const last3 = mean(points.slice(-3));
  const prev3 = mean(points.slice(-6, -3));
  const trend: Momentum['trend'] = last3 - prev3 > 0.4 ? 'opgaand' : prev3 - last3 > 0.4 ? 'dalend' : 'stabiel';

  return {
    teamId,
    form5: results.slice(-5),
    form6: results.slice(-6),
    rollingPpg,
    rollingGd,
    last5Ppg,
    seasonPpg,
    momentumDelta: last5Ppg - seasonPpg,
    ewmaPpg: ewma,
    ewmaSeries,
    currentStreak: { type: currentType, length: currentLength },
    currentUnbeaten,
    longestWinStreak: longestWin,
    longestUnbeatenStreak: longestUnbeaten,
    longestLossStreak: longestLoss,
    turningPoint,
    trend,
  };
}

// ---------------------------------------------------------------------------
// 4. Sterkteratings
// ---------------------------------------------------------------------------

export type RatingSet = {
  elo: Record<string, number>;
  massey: Record<string, number>;
  colley: Record<string, number>;
  bradleyTerry: Record<string, number>;
  pi: Record<string, number>;
  /** Elo-verloop per speelronde (voor bump/rating-grafieken). */
  eloHistory: Array<{ round: number | null; kickoff: number | null; ratings: Record<string, number> }>;
};

const HOME_ELO_ADVANTAGE = 65;

/** World-Football-Elo-achtige rating met doelsaldo-aanpassing en thuisvoordeel. */
export function eloRatings(
  teams: TeamRow[],
  matches: MatchRow[],
  opts: { k?: number; start?: number } = {}
): RatingSet['eloHistory'] & { final: Record<string, number> } {
  const K = opts.k ?? 24;
  const start = opts.start ?? 1500;
  const ratings: Record<string, number> = {};
  for (const t of teams) ratings[t.id] = start;

  const history: RatingSet['eloHistory'] = [];
  const chronological = playedMatches(matches)
    .slice()
    .sort((a, b) => (a.kickoff ?? 0) - (b.kickoff ?? 0));

  for (const m of chronological) {
    const rh = ratings[m.homeTeamId];
    const ra = ratings[m.awayTeamId];
    if (rh === undefined || ra === undefined) continue;
    const expHome = 1 / (1 + Math.pow(10, (ra - (rh + HOME_ELO_ADVANTAGE)) / 400));
    const scoreHome = m.homeScore > m.awayScore ? 1 : m.homeScore < m.awayScore ? 0 : 0.5;
    const gd = Math.abs(m.homeScore - m.awayScore);
    const mult = gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8;
    const delta = K * mult * (scoreHome - expHome);
    ratings[m.homeTeamId] = rh + delta;
    ratings[m.awayTeamId] = ra - delta;
    history.push({ round: m.round, kickoff: m.kickoff, ratings: { ...ratings } });
  }
  return Object.assign(history, { final: ratings }) as RatingSet['eloHistory'] & { final: Record<string, number> };
}

/** Massey-ratings: kleinste-kwadraten op doelsaldo, met thuisvoordeel en ridge. */
export function masseyRatings(teams: TeamRow[], matches: MatchRow[]): Record<string, number> {
  const idx = new Map(teams.map((t, i) => [t.id, i]));
  const n = teams.length;
  const A: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const b: number[] = Array(n).fill(0);
  const played = playedMatches(matches);
  const hfa = estimateHomeAdvantage(played);

  for (const m of played) {
    const h = idx.get(m.homeTeamId);
    const a = idx.get(m.awayTeamId);
    if (h === undefined || a === undefined) continue;
    const y = m.homeScore - m.awayScore - hfa;
    A[h][h] += 1;
    A[h][a] -= 1;
    A[a][a] += 1;
    A[a][h] -= 1;
    b[h] += y;
    b[a] -= y;
  }
  // Ridge-regularisatie voorkomt onoplosbare stelsels bij weinig duels.
  for (let i = 0; i < n; i++) A[i][i] += 0.5;
  const raw = solveLinearSystem(A, b);
  const m0 = mean(raw);
  const out: Record<string, number> = {};
  teams.forEach((t, i) => (out[t.id] = raw[i] - m0));
  return out;
}

/** Colley-matrix: uitsluitend op winst/verlies → immuun voor uitslagen als 8-0. */
export function colleyRatings(teams: TeamRow[], matches: MatchRow[]): Record<string, number> {
  const idx = new Map(teams.map((t, i) => [t.id, i]));
  const n = teams.length;
  const C: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const b: number[] = Array(n).fill(1);
  const games = Array(n).fill(0);
  const wins = Array(n).fill(0);
  const losses = Array(n).fill(0);

  for (const m of playedMatches(matches)) {
    const h = idx.get(m.homeTeamId);
    const a = idx.get(m.awayTeamId);
    if (h === undefined || a === undefined) continue;
    games[h]++;
    games[a]++;
    C[h][a] -= 1;
    C[a][h] -= 1;
    if (m.homeScore > m.awayScore) {
      wins[h]++;
      losses[a]++;
    } else if (m.homeScore < m.awayScore) {
      wins[a]++;
      losses[h]++;
    } else {
      wins[h] += 0.5;
      wins[a] += 0.5;
      losses[h] += 0.5;
      losses[a] += 0.5;
    }
  }
  for (let i = 0; i < n; i++) {
    C[i][i] = 2 + games[i];
    b[i] = 1 + (wins[i] - losses[i]) / 2;
  }
  const raw = solveLinearSystem(C, b).map((v) => v / 2);
  const out: Record<string, number> = {};
  teams.forEach((t, i) => (out[t.id] = raw[i]));
  return out;
}

/** Bradley-Terry via MM-iteratie; gelijkspel telt als halve winst voor beide. */
export function bradleyTerryRatings(teams: TeamRow[], matches: MatchRow[]): Record<string, number> {
  const idx = new Map(teams.map((t, i) => [t.id, i]));
  const n = teams.length;
  const wins = Array(n).fill(0.5);
  const games: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (const m of playedMatches(matches)) {
    const h = idx.get(m.homeTeamId);
    const a = idx.get(m.awayTeamId);
    if (h === undefined || a === undefined) continue;
    games[h][a]++;
    games[a][h]++;
    if (m.homeScore > m.awayScore) wins[h] += 1;
    else if (m.homeScore < m.awayScore) wins[a] += 1;
    else {
      wins[h] += 0.5;
      wins[a] += 0.5;
    }
  }

  let p = wins.map((w) => Math.max(w, 1e-3));
  for (let iter = 0; iter < 200; iter++) {
    const next = p.map((pi, i) => {
      let denom = 0;
      for (let j = 0; j < n; j++) {
        if (i === j || games[i][j] === 0) continue;
        denom += games[i][j] / (pi + p[j]);
      }
      return denom > 0 ? wins[i] / denom : pi;
    });
    const m0 = mean(next) || 1;
    p = next.map((v) => v / m0);
    if (p.some((v) => !isFinite(v))) break;
  }
  const out: Record<string, number> = {};
  teams.forEach((t, i) => (out[t.id] = p[i]));
  return out;
}

/**
 * Pi-ratings (geïnspireerd op Constantinou & Fenton). Aparte thuis- en
 * uit-rating die na elke wedstrijd wordt bijgesteld op basis van de
 * voorspelfout in doelsaldo. Robuuster tegen kleine steekproeven door een
 * lage leerfactor.
 */
export function piRatings(teams: TeamRow[], matches: MatchRow[]): Record<string, number> {
  const home: Record<string, number> = {};
  const away: Record<string, number> = {};
  for (const t of teams) {
    home[t.id] = 0;
    away[t.id] = 0;
  }
  const gamma = 0.045;
  const ha = 0.3;
  const chronological = playedMatches(matches)
    .slice()
    .sort((a, b) => (a.kickoff ?? 0) - (b.kickoff ?? 0));

  for (const m of chronological) {
    if (home[m.homeTeamId] === undefined || away[m.awayTeamId] === undefined) continue;
    const predicted = home[m.homeTeamId] - away[m.awayTeamId] + ha;
    const actual = m.homeScore - m.awayScore;
    const error = actual - predicted;
    home[m.homeTeamId] += gamma * error;
    away[m.awayTeamId] -= gamma * error;
  }
  const overall: Record<string, number> = {};
  const raw = teams.map((t) => home[t.id] + away[t.id]);
  const m0 = mean(raw);
  teams.forEach((t, i) => (overall[t.id] = raw[i] - m0));
  return overall;
}

export type AttackDefense = {
  teamId: string;
  attackHome: number;
  defenseHome: number;
  attackAway: number;
  defenseAway: number;
  attack: number;
  defense: number;
  played: number;
};

/**
 * Aanvals- en verdedigingscoëfficiënten t.o.v. het competitiesgemiddelde,
 * apart voor thuis en uit. 1.0 = gemiddeld.
 */
export function attackDefenseCoefficients(teams: TeamRow[], matches: MatchRow[]): Record<string, AttackDefense> {
  const played = playedMatches(matches);
  const homeGames = played.length;
  const awayGames = played.length;
  const totalHomeGoals = sum(played.map((m) => m.homeScore));
  const totalAwayGoals = sum(played.map((m) => m.awayScore));
  const leagueHome = homeGames ? totalHomeGoals / homeGames : 1.4;
  const leagueAway = awayGames ? totalAwayGoals / awayGames : 1.1;
  const leaguePerTeam = (totalHomeGoals + totalAwayGoals) / (2 * homeGames || 1);

  const SHRINK = 2;
  const shrink = (rating: number, n: number) => 1 + (rating - 1) * (n / (n + SHRINK));

  const out: Record<string, AttackDefense> = {};
  for (const t of teams) {
    const ps = perspectivesOf(t.id, played);
    const h = ps.filter((p) => p.home);
    const a = ps.filter((p) => !p.home);
    const agg = kpisFrom(ps);
    const hGF = sum(h.map((p) => p.gf));
    const hGA = sum(h.map((p) => p.ga));
    const aGF = sum(a.map((p) => p.gf));
    const aGA = sum(a.map((p) => p.ga));

    const rawAttackHome = h.length && leagueHome ? hGF / h.length / leagueHome : 1;
    const rawDefenseHome = h.length && leagueAway ? hGA / h.length / leagueAway : 1;
    const rawAttackAway = a.length && leagueAway ? aGF / a.length / leagueAway : 1;
    const rawDefenseAway = a.length && leagueHome ? aGA / a.length / leagueHome : 1;
    const rawAttack = agg.played && leaguePerTeam ? agg.goalsFor / agg.played / leaguePerTeam : 1;
    const rawDefense = agg.played && leaguePerTeam ? agg.goalsAgainst / agg.played / leaguePerTeam : 1;

    out[t.id] = {
      teamId: t.id,
      attackHome: shrink(rawAttackHome, h.length),
      defenseHome: shrink(rawDefenseHome, h.length),
      attackAway: shrink(rawAttackAway, a.length),
      defenseAway: shrink(rawDefenseAway, a.length),
      attack: shrink(rawAttack, agg.played),
      defense: shrink(rawDefense, agg.played),
      played: agg.played,
    };
  }
  return out;
}

export type RatingTable = {
  teamId: string;
  elo: number;
  massey: number;
  colley: number;
  bradleyTerry: number;
  pi: number;
  attack: number;
  defense: number;
  attackHome: number;
  defenseHome: number;
  attackAway: number;
  defenseAway: number;
};

export function computeRatingTable(teams: TeamRow[], matches: MatchRow[]): RatingTable[] {
  const elo = eloRatings(teams, matches);
  const massey = masseyRatings(teams, matches);
  const colley = colleyRatings(teams, matches);
  const bt = bradleyTerryRatings(teams, matches);
  const pi = piRatings(teams, matches);
  const ad = attackDefenseCoefficients(teams, matches);
  return teams.map((t) => ({
    teamId: t.id,
    elo: elo.final[t.id] ?? 1500,
    massey: massey[t.id] ?? 0,
    colley: colley[t.id] ?? 0.5,
    bradleyTerry: bt[t.id] ?? 1,
    pi: pi[t.id] ?? 0,
    attack: ad[t.id]?.attack ?? 1,
    defense: ad[t.id]?.defense ?? 1,
    attackHome: ad[t.id]?.attackHome ?? 1,
    defenseHome: ad[t.id]?.defenseHome ?? 1,
    attackAway: ad[t.id]?.attackAway ?? 1,
    defenseAway: ad[t.id]?.defenseAway ?? 1,
  }));
}

// ---------------------------------------------------------------------------
// 5. Voorspellende modellen
// ---------------------------------------------------------------------------

export type ModelKind = 'poisson' | 'dixon-coles' | 'bivariate' | 'negbin';

export type AdvancedPrediction = {
  home: TeamRow;
  away: TeamRow;
  model: ModelKind;
  lambdaHome: number;
  lambdaAway: number;
  matrix: number[][];
  maxGoals: number;
  probHome: number;
  probDraw: number;
  probAway: number;
  mostLikelyScore: { home: number; away: number };
  expectedPointsHome: number;
  expectedPointsAway: number;
  overUnder: Array<{ line: number; over: number; under: number }>;
  btts: number;
  rho: number;
  dispersion: number;
  confidence: 'laag' | 'gemiddeld' | 'hoog';
};

const MAX_GOALS = 8;
const LAMBDA_MIN = 0.2;
const LAMBDA_MAX = 3.2;

function estimateHomeAdvantage(played: MatchRow[]): number {
  if (!played.length) return 0.3;
  const diff = sum(played.map((m) => (m.homeScore ?? 0) - (m.awayScore ?? 0)));
  return diff / played.length;
}

/** Dixon-Coles-rho schatten via grid-search op de gespeelde duels. */
export function estimateDixonColesRho(teams: TeamRow[], matches: MatchRow[]): number {
  const played = playedMatches(matches);
  if (played.length < 8) return -0.05;
  const ad = attackDefenseCoefficients(teams, matches);
  const leagueHome = mean(played.map((m) => m.homeScore)) || 1.4;
  const leagueAway = mean(played.map((m) => m.awayScore)) || 1.1;

  let bestRho = 0;
  let bestLl = -Infinity;
  for (let rho = -0.2; rho <= 0.2; rho += 0.01) {
    let ll = 0;
    for (const m of played) {
      const h = ad[m.homeTeamId];
      const a = ad[m.awayTeamId];
      if (!h || !a) continue;
      const lh = clamp(leagueHome * h.attackHome * a.defenseAway, LAMBDA_MIN, LAMBDA_MAX);
      const la = clamp(leagueAway * a.attackAway * h.defenseHome, LAMBDA_MIN, LAMBDA_MAX);
      const p = poisson(m.homeScore, lh) * poisson(m.awayScore, la) * dixonColesTau(m.homeScore, m.awayScore, lh, la, rho);
      if (p > 0) ll += Math.log(p);
    }
    if (ll > bestLl) {
      bestLl = ll;
      bestRho = rho;
    }
  }
  return bestRho;
}

function dixonColesTau(x: number, y: number, lh: number, la: number, rho: number): number {
  if (x === 0 && y === 0) return 1 - lh * la * rho;
  if (x === 0 && y === 1) return 1 + lh * rho;
  if (x === 1 && y === 0) return 1 + la * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

/** Overdispersie voor het negatief-binomiaal model (variantie/gemiddelde). */
export function estimateOverdispersion(teams: TeamRow[], matches: MatchRow[]): number {
  void teams;
  const goals: number[] = [];
  for (const m of playedMatches(matches)) {
    goals.push(m.homeScore, m.awayScore);
  }
  if (goals.length < 8) return 1.1;
  const m0 = mean(goals);
  const v = variance(goals);
  const phi = m0 > 0 ? v / m0 : 1;
  return clamp(phi, 1.01, 3);
}

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];
function lnGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i++) x += LANCZOS[i] / (z + i + 1);
  const t = z + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function negBinomPmf(k: number, mu: number, phi: number): number {
  // phi = variantie/gemiddelde (>1). r = mu/(phi-1).
  if (phi <= 1.0001) return poisson(k, mu);
  const r = mu / (phi - 1);
  const p = r / (r + mu);
  return Math.exp(lnGamma(k + r) - lnGamma(r) - lnGamma(k + 1) + r * Math.log(p) + k * Math.log(1 - p));
}

export type PredictOptions = {
  model?: ModelKind;
  rho?: number;
  dispersion?: number;
  /** Extra thuisvoordeel-factor bovenop de coëfficiënten (default uit data). */
  homeBoost?: number;
};

/**
 * Voorspelt een wedstrijd met een van de vier modellen en levert de volledige
 * kansmatrix plus afgeleide markten (1X2, over/under, BTTS, verwachte punten).
 */
export function predictAdvanced(
  home: TeamRow,
  away: TeamRow,
  teams: TeamRow[],
  matches: MatchRow[],
  opts: PredictOptions = {}
): AdvancedPrediction {
  const model = opts.model ?? 'dixon-coles';
  const played = playedMatches(matches);
  const ad = attackDefenseCoefficients(teams, matches);
  const h = ad[home.id] ?? { attackHome: 1, defenseHome: 1, attackAway: 1, defenseAway: 1, attack: 1, defense: 1 };
  const a = ad[away.id] ?? { attackHome: 1, defenseHome: 1, attackAway: 1, defenseAway: 1, attack: 1, defense: 1 };

  const leagueHome = played.length ? mean(played.map((m) => m.homeScore)) : 1.4;
  const leagueAway = played.length ? mean(played.map((m) => m.awayScore)) : 1.1;

  const lambdaHome = clamp(leagueHome * h.attackHome * a.defenseAway * (opts.homeBoost ?? 1), LAMBDA_MIN, LAMBDA_MAX);
  const lambdaAway = clamp(leagueAway * a.attackAway * h.defenseHome, LAMBDA_MIN, LAMBDA_MAX);

  const rho = opts.rho ?? estimateDixonColesRho(teams, matches);
  const dispersion = opts.dispersion ?? estimateOverdispersion(teams, matches);
  const covariance = estimateGoalCovariance(played);

  const matrix: number[][] = [];
  let probHome = 0;
  let probDraw = 0;
  let probAway = 0;
  let best = { home: 0, away: 0, p: -1 };
  let btts = 0;

  for (let x = 0; x <= MAX_GOALS; x++) {
    matrix.push([]);
    for (let y = 0; y <= MAX_GOALS; y++) {
      let p: number;
      switch (model) {
        case 'poisson':
          p = poisson(x, lambdaHome) * poisson(y, lambdaAway);
          break;
        case 'dixon-coles':
          p = poisson(x, lambdaHome) * poisson(y, lambdaAway) * dixonColesTau(x, y, lambdaHome, lambdaAway, rho);
          break;
        case 'bivariate':
          p = bivariatePoisson(x, y, lambdaHome, lambdaAway, covariance);
          break;
        case 'negbin':
          p = negBinomPmf(x, lambdaHome, dispersion) * negBinomPmf(y, lambdaAway, dispersion);
          break;
      }
      p = Math.max(0, p);
      matrix[x].push(p);
      if (x > y) probHome += p;
      else if (x === y) probDraw += p;
      else probAway += p;
      if (x >= 1 && y >= 1) btts += p;
      if (p > best.p) best = { home: x, away: y, p };
    }
  }

  const total = sum(matrix.map((row) => sum(row))) || 1;
  for (let x = 0; x <= MAX_GOALS; x++) {
    for (let y = 0; y <= MAX_GOALS; y++) matrix[x][y] /= total;
  }
  probHome /= total;
  probDraw /= total;
  probAway /= total;
  btts /= total;

  const lineProb = (line: number) => {
    let over = 0;
    for (let x = 0; x <= MAX_GOALS; x++) {
      for (let y = 0; y <= MAX_GOALS; y++) {
        if (x + y > line) over += matrix[x][y];
      }
    }
    return { line, over, under: 1 - over };
  };

  const strongest = Math.max(probHome, probDraw, probAway);
  const confidence: AdvancedPrediction['confidence'] =
    strongest > 0.5 ? 'hoog' : strongest > 0.38 ? 'gemiddeld' : 'laag';

  return {
    home,
    away,
    model,
    lambdaHome,
    lambdaAway,
    matrix,
    maxGoals: MAX_GOALS,
    probHome,
    probDraw,
    probAway,
    mostLikelyScore: { home: best.home, away: best.away },
    expectedPointsHome: probHome * 3 + probDraw,
    expectedPointsAway: probAway * 3 + probDraw,
    overUnder: [lineProb(1.5), lineProb(2.5), lineProb(3.5)],
    btts,
    rho,
    dispersion,
    confidence,
  };
}

function bivariatePoisson(x: number, y: number, lh: number, la: number, cov: number): number {
  const l3 = clamp(cov, 0, Math.min(lh, la) * 0.9);
  const l1 = Math.max(0, lh - l3);
  const l2 = Math.max(0, la - l3);
  let p = 0;
  const kMax = Math.min(x, y);
  for (let k = 0; k <= kMax; k++) {
    p += poisson(x - k, l1) * poisson(y - k, l2) * poisson(k, l3);
  }
  return p;
}

function estimateGoalCovariance(played: (MatchRow & { homeScore: number; awayScore: number })[]): number {
  if (played.length < 4) return 0.1;
  const xs = played.map((m) => m.homeScore);
  const ys = played.map((m) => m.awayScore);
  return mean(xs.map((x, i) => x * ys[i])) - mean(xs) * mean(ys);
}

// ---------------------------------------------------------------------------
// 6. Correctie voor programmazwaarte
// ---------------------------------------------------------------------------

export type StrengthOfSchedule = {
  teamId: string;
  avgOpponentElo: number;
  avgRemainingElo: number;
  scheduleRank: number;
  remainingRank: number;
  actualPpg: number;
  expectedPpg: number;
  adjustedPpg: number;
  opponents: Array<{ teamId: string; elo: number; played: number }>;
  remaining: Array<{ teamId: string; elo: number }>;
  tier: { top: TeamRecord; mid: TeamRecord; bottom: TeamRecord };
  tierCut: number;
};

export function strengthOfSchedule(teamId: string, teams: TeamRow[], matches: MatchRow[]): StrengthOfSchedule {
  const elo = eloRatings(teams, matches).final;
  const standings = computeStandings(teams, matches);
  const n = teams.length;
  const cut = Math.max(1, Math.min(3, Math.floor(n / 3)));

  const played = playedMatches(matches).filter(
    (m) => m.homeTeamId === teamId || m.awayTeamId === teamId
  );
  const scheduled = matches.filter(
    (m) => m.status !== 'played' && (m.homeTeamId === teamId || m.awayTeamId === teamId)
  );

  const oppOf = (m: MatchRow) => (m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId);
  const oppCount = new Map<string, number>();
  for (const m of played) oppCount.set(oppOf(m), (oppCount.get(oppOf(m)) ?? 0) + 1);
  const opponents = [...oppCount.entries()].map(([id, count]) => ({
    teamId: id,
    elo: elo[id] ?? 1500,
    played: count,
  }));
  const remaining = scheduled.map((m) => ({ teamId: oppOf(m), elo: elo[oppOf(m)] ?? 1500 }));
  const avgOpponentElo = mean(opponents.map((o) => o.elo));
  const avgRemainingElo = mean(remaining.map((o) => o.elo));

  const scheduleRank = rankOf(teams, (t) => {
    const ops = played.filter((m) => m.homeTeamId === t.id || m.awayTeamId === t.id).map((m) => oppOf(m));
    return ops.length ? mean(ops.map((id) => elo[id] ?? 1500)) : -Infinity;
  }).findIndex((x) => x === teamId) + 1;
  const remainingRank = rankOf(teams, (t) => {
    const ops = scheduled.filter((m) => m.homeTeamId === t.id || m.awayTeamId === t.id).map((m) => oppOf(m));
    return ops.length ? mean(ops.map((id) => elo[id] ?? 1500)) : -Infinity;
  }).findIndex((x) => x === teamId) + 1;

  // Verwachte punten per duel via het voorspelmodel tegen de daadwerkelijke tegenstanders.
  const byId = new Map(teams.map((t) => [t.id, t]));
  let expectedPoints = 0;
  for (const m of played) {
    const home = byId.get(m.homeTeamId)!;
    const away = byId.get(m.awayTeamId)!;
    const pr = predictAdvanced(home, away, teams, matches, { model: 'poisson' });
    expectedPoints += m.homeTeamId === teamId ? pr.expectedPointsHome : pr.expectedPointsAway;
  }
  const actualPpg = computeTeamKpis(teamId, matches).ppg;
  const expectedPpg = played.length ? expectedPoints / played.length : actualPpg;
  const leaguePpg = mean(teams.map((t) => computeTeamKpis(t.id, matches).ppg).filter((p) => p > 0));

  const tierRecords: Record<'top' | 'mid' | 'bottom', TeamPerspective[]> = { top: [], mid: [], bottom: [] };
  for (const m of played) {
    const opp = oppOf(m);
    const p = fromTeamPerspective(m, teamId);
    if (!p) continue;
    const rank = standings.findIndex((s) => s.team.id === opp) + 1;
    if (rank <= cut) tierRecords.top.push(p);
    else if (rank > n - cut) tierRecords.bottom.push(p);
    else tierRecords.mid.push(p);
  }
  const toRecord = (ps: TeamPerspective[]): TeamRecord => ({
    played: ps.length,
    won: ps.filter((p) => p.result === 'W').length,
    drawn: ps.filter((p) => p.result === 'G').length,
    lost: ps.filter((p) => p.result === 'V').length,
    goalsFor: sum(ps.map((p) => p.gf)),
    goalsAgainst: sum(ps.map((p) => p.ga)),
  });

  return {
    teamId,
    avgOpponentElo,
    avgRemainingElo,
    scheduleRank: scheduleRank || teams.length,
    remainingRank: remainingRank || teams.length,
    actualPpg,
    expectedPpg,
    adjustedPpg: actualPpg + (leaguePpg - expectedPpg),
    opponents,
    remaining,
    tier: { top: toRecord(tierRecords.top), mid: toRecord(tierRecords.mid), bottom: toRecord(tierRecords.bottom) },
    tierCut: cut,
  };
}

function rankOf(teams: TeamRow[], value: (t: TeamRow) => number): string[] {
  return teams
    .map((t) => ({ id: t.id, v: value(t) }))
    .sort((a, b) => b.v - a.v)
    .map((x) => x.id);
}

// ---------------------------------------------------------------------------
// 7. Geluk en regressie
// ---------------------------------------------------------------------------

export type LuckAnalysis = {
  teamId: string;
  exponent: number;
  pythWinRatio: number;
  expectedPpg: number;
  actualPpg: number;
  expectedPoints: number;
  actualPoints: number;
  luck: number;
  oneGoalWins: number;
  oneGoalWinShare: number;
  regression: 'neerwaarts' | 'opwaarts' | 'stabiel';
  luckRank: number;
};

const PYTHAGOREAN_EXPONENT = 1.3;

export function luckAnalysis(teamId: string, teams: TeamRow[], matches: MatchRow[]): LuckAnalysis {
  const kpis = computeTeamKpis(teamId, matches);
  const gf = kpis.goalsFor;
  const ga = kpis.goalsAgainst;
  const pythWinRatio = gf ** PYTHAGOREAN_EXPONENT / (gf ** PYTHAGOREAN_EXPONENT + ga ** PYTHAGOREAN_EXPONENT || 1);
  const expectedPpg = 3 * pythWinRatio;
  const actualPpg = kpis.ppg;
  const expectedPoints = expectedPpg * kpis.played;
  const luck = kpis.points - expectedPoints;
  const oneGoalWins = kpis.winMargins.one;
  const oneGoalWinShare = kpis.won ? oneGoalWins / kpis.won : 0;

  let regression: LuckAnalysis['regression'] = 'stabiel';
  if (luck > 0.15 * kpis.played && oneGoalWinShare >= 0.4) regression = 'neerwaarts';
  else if (luck < -0.15 * kpis.played) regression = 'opwaarts';

  const all = teams
    .map((t) => {
      const k = computeTeamKpis(t.id, matches);
      const p = k.goalsFor ** PYTHAGOREAN_EXPONENT /
        (k.goalsFor ** PYTHAGOREAN_EXPONENT + k.goalsAgainst ** PYTHAGOREAN_EXPONENT || 1);
      return { id: t.id, luck: k.points - 3 * p * k.played };
    })
    .sort((a, b) => b.luck - a.luck);
  const luckRank = all.findIndex((x) => x.id === teamId) + 1;

  return {
    teamId,
    exponent: PYTHAGOREAN_EXPONENT,
    pythWinRatio,
    expectedPpg,
    actualPpg,
    expectedPoints,
    actualPoints: kpis.points,
    luck,
    oneGoalWins,
    oneGoalWinShare,
    regression,
    luckRank: luckRank || all.length,
  };
}

// ---------------------------------------------------------------------------
// 8. Stijlprofilering
// ---------------------------------------------------------------------------

export type StyleProfile = {
  teamId: string;
  tempo: number;
  varFor: number;
  varAgainst: number;
  volatility: number;
  homeAwayPpgDiff: number;
  avgFor: number;
  avgAgainst: number;
};

export function styleProfile(teamId: string, matches: MatchRow[]): StyleProfile {
  const kpis = computeTeamKpis(teamId, matches);
  const perMatch = perspectivesOf(teamId, matches);
  const varFor = variance(perMatch.map((p) => p.gf));
  const varAgainst = variance(perMatch.map((p) => p.ga));
  const home = computeTeamKpis(teamId, matches, 'home');
  const away = computeTeamKpis(teamId, matches, 'away');
  return {
    teamId,
    tempo: kpis.avgTotalGoals,
    varFor,
    varAgainst,
    volatility: Math.sqrt(varFor + varAgainst),
    homeAwayPpgDiff: home.ppg - away.ppg,
    avgFor: kpis.gfPerGame,
    avgAgainst: kpis.gaPerGame,
  };
}

export type Archetype = {
  teamId: string;
  cluster: number;
  label: string;
  attack: number;
  defense: number;
  homeEdge: number;
  volatility: number;
};

/** k-means (met vaste seed) op aanval, verdediging, grilligheid en thuis/uit-verschil. */
export function clusterArchetypes(teams: TeamRow[], matches: MatchRow[], k?: number): Archetype[] {
  const profiles = teams.map((t) => {
    const kpis = computeTeamKpis(t.id, matches);
    const ha = homeAwayAnalysis(t.id, teams, matches);
    return {
      teamId: t.id,
      avgFor: kpis.gfPerGame,
      avgAgainst: kpis.gaPerGame,
      volatility: styleProfile(t.id, matches).volatility,
      homeEdge: ha.rawEdge,
    };
  });
  if (profiles.length === 0) return [];

  const kk = k ?? clamp(Math.ceil(profiles.length / 2), 2, 4);
  const features = profiles.map((p) => [p.avgFor, -p.avgAgainst, p.volatility, p.homeEdge]);
  const dims = features[0].length;
  const means = Array.from({ length: dims }, (_, d) => mean(features.map((f) => f[d])));
  const stds = Array.from({ length: dims }, (_, d) => std(features.map((f) => f[d])) || 1);
  const X = features.map((f) => f.map((v, d) => (v - means[d]) / stds[d]));

  const rng = mulberry32(42);
  // k-means++ initialisatie.
  const centroids: number[][] = [X[Math.floor(rng() * X.length)]];
  while (centroids.length < kk && centroids.length < X.length) {
    const dists = X.map((x) => Math.min(...centroids.map((c) => sum(x.map((v, d) => (v - c[d]) ** 2)))));
    const total = sum(dists);
    let r = rng() * total;
    let pick = 0;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    centroids.push(X[pick]);
  }

  let assign = X.map(() => 0);
  for (let iter = 0; iter < 60; iter++) {
    const next = X.map((x) => {
      let best = 0;
      let bestD = Infinity;
      centroids.forEach((c, ci) => {
        const d = sum(x.map((v, dd) => (v - c[dd]) ** 2));
        if (d < bestD) {
          bestD = d;
          best = ci;
        }
      });
      return best;
    });
    const changed = next.some((v, i) => v !== assign[i]);
    assign = next;
    for (let ci = 0; ci < centroids.length; ci++) {
      const members = X.filter((_, i) => assign[i] === ci);
      if (members.length) centroids[ci] = Array.from({ length: dims }, (_, d) => mean(members.map((m) => m[d])));
    }
    if (!changed) break;
  }

  // Label per cluster op basis van de centroïden. We kennen labels greedy toe
  // (hoogste score eerst) zodat elk cluster een onderscheidend archetype krijgt.
  const candidates: Array<{ label: string; score: (c: number[]) => number }> = [
    { label: 'Aanvalsmachine', score: (c) => c[0] + c[1] },
    { label: 'Open aanvalsteam', score: (c) => c[0] - c[1] },
    { label: 'Gesloten counterploeg', score: (c) => c[1] - c[0] },
    { label: 'Thuistijger', score: (c) => c[3] },
    { label: 'Reisploeg', score: (c) => -c[3] },
    { label: 'Worstelt / wisselvallig', score: (c) => c[2] },
    { label: 'Solide middenmoter', score: () => 0 },
  ];
  const pairs: Array<{ ci: number; label: string; score: number }> = [];
  centroids.forEach((c, ci) => {
    for (const cand of candidates) pairs.push({ ci, label: cand.label, score: cand.score(c) });
  });
  pairs.sort((a, b) => b.score - a.score);
  const labels: string[] = Array(centroids.length).fill('');
  const usedLabels = new Set<string>();
  for (const p of pairs) {
    if (labels[p.ci] || usedLabels.has(p.label)) continue;
    labels[p.ci] = p.label;
    usedLabels.add(p.label);
  }
  labels.forEach((l, i) => {
    if (!l) labels[i] = 'Middenmoter';
  });

  return profiles.map((p, i) => {
    const raw = X[i];
    return {
      teamId: p.teamId,
      cluster: assign[i],
      label: labels[assign[i]],
      attack: raw[0],
      defense: raw[1],
      homeEdge: raw[3],
      volatility: raw[2],
    };
  });
}

// ---------------------------------------------------------------------------
// 9. Onderlinge historie over meerdere seizoenen
// ---------------------------------------------------------------------------

export type PouleLike = {
  season: string;
  name?: string;
  teams: TeamRow[];
  matches: MatchRow[];
};

export type MultiSeasonH2H = {
  teamKey: string;
  opponentKey: string;
  meetings: number;
  overall: TeamRecord & { ppg: number };
  home: TeamRecord;
  away: TeamRecord;
  seasons: Array<{ season: string; record: TeamRecord; results: Array<{ score: string; result: Result; home: boolean }> }>;
  reliable: boolean;
  warning: string | null;
};

/** Normaliseert een teamnaam tot een sleutel die over competities/seizoenen heen stabiel is. */
export function teamKeyOf(team: TeamRow): string {
  const base = team.club || team.name;
  return normalizeText(base)
    .replace(/\bo\s?\d+\b/g, '')
    .replace(/\b[0-9]+$/g, '')
    .trim();
}

function findTeam(poule: PouleLike, key: string): TeamRow | null {
  return poule.teams.find((t) => teamKeyOf(t) === key) || null;
}

/**
 * Aggregeert alle onderlinge duels over meerdere opgeslagen poules/seizoenen,
 * gesplitst naar thuis en uit, met een expliciete waarschuwing bij een te
 * kleine steekproef.
 */
export function multiSeasonHeadToHead(
  teamKey: string,
  opponentKey: string,
  poules: PouleLike[],
  minMeetings = 4
): MultiSeasonH2H {
  const seasonMap = new Map<string, Array<{ score: string; result: Result; home: boolean }>>();
  const all: TeamPerspective[] = [];

  for (const poule of poules) {
    const us = findTeam(poule, teamKey);
    const them = findTeam(poule, opponentKey);
    if (!us || !them) continue;
    const results = seasonMap.get(poule.season) || [];
    for (const m of playedMatches(poule.matches)) {
      if (
        !(
          (m.homeTeamId === us.id && m.awayTeamId === them.id) ||
          (m.homeTeamId === them.id && m.awayTeamId === us.id)
        )
      ) {
        continue;
      }
      const p = fromTeamPerspective(m, us.id);
      if (!p) continue;
      all.push(p);
      results.push({ score: `${p.gf}-${p.ga}`, result: p.result, home: p.home });
    }
    if (results.length) seasonMap.set(poule.season, results);
  }

  const record = (ps: TeamPerspective[]): TeamRecord => ({
    played: ps.length,
    won: ps.filter((p) => p.result === 'W').length,
    drawn: ps.filter((p) => p.result === 'G').length,
    lost: ps.filter((p) => p.result === 'V').length,
    goalsFor: sum(ps.map((p) => p.gf)),
    goalsAgainst: sum(ps.map((p) => p.ga)),
  });

  const overall = record(all);
  const meetings = overall.played;
  return {
    teamKey,
    opponentKey,
    meetings,
    overall: { ...overall, ppg: meetings ? (overall.won * 3 + overall.drawn) / meetings : 0 },
    home: record(all.filter((p) => p.home)),
    away: record(all.filter((p) => !p.home)),
    seasons: [...seasonMap.entries()].map(([season, results]) => ({
      season,
      record: record(
        results.map((r) => ({
          gf: +r.score.split('-')[0],
          ga: +r.score.split('-')[1],
          home: r.home,
          result: r.result,
        }))
      ),
      results,
    })),
    reliable: meetings >= minMeetings,
    warning:
      meetings < minMeetings
        ? `Slechts ${meetings} onderlinge ontmoeting(en): statistisch te weinig om conclusies aan te verbinden.`
        : null,
  };
}

// ---------------------------------------------------------------------------
// 10. Scenario en hefboom (Monte Carlo)
// ---------------------------------------------------------------------------

export type ScenarioTeam = {
  teamId: string;
  champion: number;
  top: number;
  bottom: number;
  positionDist: number[];
  pointsMean: number;
  pointsP10: number;
  pointsP90: number;
};

export type ScenarioResult = {
  simulations: number;
  teams: ScenarioTeam[];
  topCut: number;
  bottomCut: number;
  positions: number;
};

export type SimulateOptions = {
  simulations?: number;
  topCut?: number;
  bottomCut?: number;
  seed?: number;
  forcedResults?: Record<string, [number, number]>;
};

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = clamp(Math.floor(p * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[idx];
}

/**
 * Monte Carlo-simulatie van het restseizoen. Elk nog te spelen duel wordt
 * gesampled uit het Poisson/Dixon-Coles-model; daarna wordt de eindstand
 * opgemaakt. Levert kampioens-, top- en degradatiekansen plus de volledige
 * positieverdeling (voor het waaier-/heatmapdiagram).
 */
export function simulateSeason(teams: TeamRow[], matches: MatchRow[], opts: SimulateOptions = {}): ScenarioResult {
  const simulations = opts.simulations ?? 1500;
  const topCut = opts.topCut ?? 1;
  const bottomCut = opts.bottomCut ?? 1;
  const n = teams.length;
  const scheduled = matches.filter((m) => m.status !== 'played');
  const played = playedMatches(matches);
  const rng = mulberry32(opts.seed ?? 12345);

  const byId = new Map(teams.map((t) => [t.id, t]));

  // Voorberekende lambdas en Dixon-Coles-correcties per duel.
  const matchModels = scheduled.map((m) => {
    const pr = predictAdvanced(byId.get(m.homeTeamId)!, byId.get(m.awayTeamId)!, teams, matches, {
      model: 'dixon-coles',
    });
    const cumulative: number[] = [];
    let acc = 0;
    for (let x = 0; x <= pr.maxGoals; x++) {
      for (let y = 0; y <= pr.maxGoals; y++) {
        acc += pr.matrix[x][y];
        cumulative.push(acc);
      }
    }
    return { m, cumulative, maxGoals: pr.maxGoals };
  });

  const basePlayed = new Map<string, { points: number; gd: number; gf: number }>();
  for (const t of teams) basePlayed.set(t.id, { points: 0, gd: 0, gf: 0 });
  for (const m of played) {
    const h = basePlayed.get(m.homeTeamId)!;
    const a = basePlayed.get(m.awayTeamId)!;
    h.gf += m.homeScore;
    h.gd += m.homeScore - m.awayScore;
    a.gf += m.awayScore;
    a.gd += m.awayScore - m.homeScore;
    if (m.homeScore > m.awayScore) h.points += 3;
    else if (m.homeScore < m.awayScore) a.points += 3;
    else {
      h.points += 1;
      a.points += 1;
    }
  }

  const stats = new Map<string, { champion: number; top: number; bottom: number; positions: number[]; points: number[] }>();
  for (const t of teams) {
    stats.set(t.id, { champion: 0, top: 0, bottom: 0, positions: Array(n).fill(0), points: [] });
  }

  for (let s = 0; s < simulations; s++) {
    const table = new Map<string, { points: number; gd: number; gf: number }>();
    for (const t of teams) table.set(t.id, { ...basePlayed.get(t.id)! });

    for (const { m, cumulative, maxGoals } of matchModels) {
      let homeScore: number;
      let awayScore: number;
      const forced = opts.forcedResults?.[m.id];
      if (forced) {
        [homeScore, awayScore] = forced;
      } else {
        const r = rng();
        let k = 0;
        while (k < cumulative.length - 1 && r > cumulative[k]) k++;
        homeScore = Math.floor(k / (maxGoals + 1));
        awayScore = k % (maxGoals + 1);
      }
      const h = table.get(m.homeTeamId)!;
      const a = table.get(m.awayTeamId)!;
      h.gf += homeScore;
      h.gd += homeScore - awayScore;
      a.gf += awayScore;
      a.gd += awayScore - homeScore;
      if (homeScore > awayScore) h.points += 3;
      else if (homeScore < awayScore) a.points += 3;
      else {
        h.points += 1;
        a.points += 1;
      }
    }

    const ranked = teams
      .map((t) => ({ id: t.id, ...table.get(t.id)! }))
      .sort((p, q) => q.points - p.points || q.gd - p.gd || q.gf - p.gf);

    ranked.forEach((row, i) => {
      const st = stats.get(row.id)!;
      st.positions[i]++;
      st.points.push(row.points);
      if (i === 0) st.champion++;
      if (i < topCut) st.top++;
      if (i >= n - bottomCut) st.bottom++;
    });
  }

  const result: ScenarioTeam[] = teams.map((t) => {
    const st = stats.get(t.id)!;
    const sortedPoints = [...st.points].sort((a, b) => a - b);
    return {
      teamId: t.id,
      champion: st.champion / simulations,
      top: st.top / simulations,
      bottom: st.bottom / simulations,
      positionDist: st.positions.map((c) => c / simulations),
      pointsMean: mean(st.points),
      pointsP10: percentile(sortedPoints, 0.1),
      pointsP90: percentile(sortedPoints, 0.9),
    };
  });

  return { simulations, teams: result, topCut, bottomCut, positions: n };
}

export type Leverage = {
  matchId: string;
  teamId: string;
  win: number;
  draw: number;
  loss: number;
  leverage: number;
};

/**
 * Hefboom van één duel: het verschil in (bijv. kampioens)kans tussen winnen en
 * verliezen. Drie gesimuleerde scenario's met het duel geforceerd.
 */
export function matchLeverage(
  teamId: string,
  match: MatchRow,
  teams: TeamRow[],
  matches: MatchRow[],
  opts: { simulations?: number; metric?: 'champion' | 'top' | 'bottom' } = {}
): Leverage {
  const metric = opts.metric ?? 'champion';
  const simulations = opts.simulations ?? 900;
  const pick = (t: ScenarioTeam) => (metric === 'champion' ? t.champion : metric === 'top' ? t.top : t.bottom);

  const run = (forced: [number, number]) =>
    simulateSeason(teams, matches, { simulations, forcedResults: { [match.id]: forced } }).teams.find(
      (t) => t.teamId === teamId
    )!;

  const win = pick(run([1, 0]));
  const draw = pick(run([1, 1]));
  const loss = pick(run([0, 1]));
  return { matchId: match.id, teamId, win, draw, loss, leverage: win - loss };
}

// ---------------------------------------------------------------------------
// 11. Positieverloop (bump chart) en uitslagen-matrix
// ---------------------------------------------------------------------------

export type PositionByRound = {
  rounds: number[];
  /** per team: positie per ronde (1 = bovenaan), null als nog niet gespeeld. */
  positions: Record<string, Array<number | null>>;
};

export function positionByRound(teams: TeamRow[], matches: MatchRow[]): PositionByRound {
  const maxRound = matches.reduce((m, x) => Math.max(m, x.round ?? 0), 0);
  const rounds = Array.from({ length: maxRound }, (_, i) => i + 1);
  const positions: Record<string, Array<number | null>> = {};
  for (const t of teams) positions[t.id] = [];

  for (const r of rounds) {
    const upto = matches.filter((m) => (m.round ?? 0) <= r && m.status === 'played');
    const standings = computeStandings(teams, upto);
    standings.forEach((s, i) => positions[s.team.id].push(i + 1));
  }
  return { rounds, positions };
}

export type H2HMatrixCell = { homeTeamId: string; awayTeamId: string; score: string | null };

/** Alle onderlinge uitslagen als matrix (thuis in de rij, uit in de kolom). */
export function headToHeadMatrix(teams: TeamRow[], matches: MatchRow[]): H2HMatrixCell[] {
  const cells: H2HMatrixCell[] = [];
  for (const h of teams) {
    for (const a of teams) {
      if (h.id === a.id) continue;
      const m = playedMatches(matches).find((x) => x.homeTeamId === h.id && x.awayTeamId === a.id);
      cells.push({ homeTeamId: h.id, awayTeamId: a.id, score: m ? `${m.homeScore}-${m.awayScore}` : null });
    }
  }
  return cells;
}

export type HistogramBucket = { label: string; count: number };

/** Histogram van het totaal aantal doelpunten per wedstrijd. */
export function goalsHistogram(matches: MatchRow[], maxGoals = 8): HistogramBucket[] {
  const buckets: HistogramBucket[] = [];
  const counts = Array(maxGoals + 1).fill(0);
  for (const m of playedMatches(matches)) {
    counts[Math.min(maxGoals, m.homeScore + m.awayScore)]++;
  }
  for (let i = 0; i <= maxGoals; i++) buckets.push({ label: i === maxGoals ? `${maxGoals}+` : String(i), count: counts[i] });
  return buckets;
}

export type { Standing };
