/**
 * Pure statistics + prediction logic for a KNVB youth poule.
 *
 * All functions operate on plain rows so they are easy to test and can run
 * either in the seed script or on the server.
 *
 * Conventions for results:
 *  - "played" matches are those with `status === 'played'` AND scores present.
 *  - Results are always seen from the perspective of a team.
 */

export type TeamRow = {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  club: string | null;
};

export type MatchRow = {
  id: string;
  round: number | null;
  kickoff: number | null;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
};

export type Result = 'W' | 'G' | 'V';

export type Standing = {
  team: TeamRow;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
};

export const isPlayed = (
  m: MatchRow
): m is MatchRow & { homeScore: number; awayScore: number } =>
  m.status === 'played' && m.homeScore !== null && m.awayScore !== null;

export const playedMatches = (
  matches: MatchRow[]
): (MatchRow & { homeScore: number; awayScore: number })[] => matches.filter(isPlayed);

export type TeamPerspective = { gf: number; ga: number; home: boolean; result: Result };

export function fromTeamPerspective(
  m: MatchRow & { homeScore: number; awayScore: number },
  teamId: string
): TeamPerspective | null {
  if (m.homeTeamId === teamId) {
    const gf = m.homeScore;
    const ga = m.awayScore;
    return { gf, ga, home: true, result: (gf > ga ? 'W' : gf < ga ? 'V' : 'G') as Result };
  }
  if (m.awayTeamId === teamId) {
    const gf = m.awayScore;
    const ga = m.homeScore;
    return { gf, ga, home: false, result: (gf > ga ? 'W' : gf < ga ? 'V' : 'G') as Result };
  }
  return null;
}

/** Full standings table for a poule, sorted by points then goal difference. */
export function computeStandings(teams: TeamRow[], matches: MatchRow[]): Standing[] {
  const byTeam = new Map<string, Standing>();
  for (const t of teams) {
    byTeam.set(t.id, {
      team: t,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
    });
  }

  for (const m of playedMatches(matches)) {
    const home = byTeam.get(m.homeTeamId);
    const away = byTeam.get(m.awayTeamId);
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.goalsFor += m.homeScore;
    home.goalsAgainst += m.awayScore;
    away.goalsFor += m.awayScore;
    away.goalsAgainst += m.homeScore;

    if (m.homeScore > m.awayScore) {
      home.won++;
      away.lost++;
      home.points += 3;
    } else if (m.homeScore < m.awayScore) {
      away.won++;
      home.lost++;
      away.points += 3;
    } else {
      home.drawn++;
      away.drawn++;
      home.points += 1;
      away.points += 1;
    }
  }

  const standings = [...byTeam.values()];
  for (const s of standings) s.goalDiff = s.goalsFor - s.goalsAgainst;
  return standings.sort(
    (a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor
  );
}

/** Last `n` results as W/D/L, most recent first. */
export function computeForm(teamId: string, matches: MatchRow[], n = 5): Result[] {
  return playedMatches(matches)
    .map((m) => ({ perspective: fromTeamPerspective(m, teamId), kickoff: m.kickoff ?? 0 }))
    .filter((x): x is { perspective: TeamPerspective; kickoff: number } => x.perspective !== null)
    .sort((a, b) => b.kickoff - a.kickoff)
    .slice(0, n)
    .map((x) => x.perspective.result);
}

export type TeamAggregate = {
  teamId: string;
  played: number;
  goalsFor: number;
  goalsAgainst: number;
  avgFor: number;
  avgAgainst: number;
  cleanSheets: number;
  homePlayed: number;
  homeFor: number;
  homeAgainst: number;
  awayPlayed: number;
  awayFor: number;
  awayAgainst: number;
};

/** Per-team aggregates (used for the strength model + radar chart). */
export function computeAggregate(teamId: string, matches: MatchRow[]): TeamAggregate {
  const played = playedMatches(matches)
    .map((m) => fromTeamPerspective(m, teamId))
    .filter((p): p is TeamPerspective => p !== null);
  const sum = (key: 'gf' | 'ga') => played.reduce((acc, p) => acc + p[key], 0);

  let homePlayed = 0;
  let homeFor = 0;
  let homeAgainst = 0;
  let awayPlayed = 0;
  let awayFor = 0;
  let awayAgainst = 0;
  let cleanSheets = 0;

  for (const p of played) {
    if (p.home) {
      homePlayed++;
      homeFor += p.gf;
      homeAgainst += p.ga;
    } else {
      awayPlayed++;
      awayFor += p.gf;
      awayAgainst += p.ga;
    }
    if (p.ga === 0) cleanSheets++;
  }

  const goalsFor = sum('gf');
  const goalsAgainst = sum('ga');
  const n = played.length;

  return {
    teamId,
    played: n,
    goalsFor,
    goalsAgainst,
    avgFor: n ? goalsFor / n : 0,
    avgAgainst: n ? goalsAgainst / n : 0,
    cleanSheets,
    homePlayed,
    homeFor,
    homeAgainst,
    awayPlayed,
    awayFor,
    awayAgainst,
  };
}

export type Strength = {
  attack: number; // 0-100
  defense: number; // 0-100
  overall: number; // 0-100
  attackRating: number; // relative to league (1.0 = average)
  defenseRating: number; // relative to league (1.0 = average)
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Strength model: attack = how many goals a team scores relative to the league,
 * defense = how few it concedes. Both normalised to a 0-100 scale for the radar.
 */
export function computeStrength(teamId: string, teams: TeamRow[], matches: MatchRow[]): Strength {
  const agg = computeAggregate(teamId, matches);
  const allAggs = teams.map((t) => computeAggregate(t.id, matches)).filter((a) => a.played > 0);

  const leagueAvgFor = allAggs.length ? allAggs.reduce((s, a) => s + a.avgFor, 0) / allAggs.length : 1;
  const leagueAvgAgainst = allAggs.length
    ? allAggs.reduce((s, a) => s + a.avgAgainst, 0) / allAggs.length
    : 1;

  const attackRating = leagueAvgFor > 0 ? agg.avgFor / leagueAvgFor : 1;
  const defenseRating = leagueAvgAgainst > 0 ? agg.avgAgainst / leagueAvgAgainst : 1;

  // 1.0 = average => scale so that typical range is ~0.5..1.6 mapped to 5..95
  const normalize = (rating: number, invert: boolean) => {
    const scale = clamp((rating - 1) * 55 + 50, 5, 95);
    return invert ? clamp(100 - scale, 5, 95) : scale;
  };

  const attack = normalize(attackRating, false);
  const defense = normalize(defenseRating, true);
  const overall = clamp((attack + defense) / 2, 5, 95);

  return { attack, defense, overall, attackRating, defenseRating };
}

export type H2HResult = {
  date: number | null;
  round: number | null;
  teamAGoals: number;
  teamBGoals: number;
  result: Result; // from teamA's perspective
};

/** All meetings between two teams, from teamA's perspective. */
export function headToHead(
  teamAId: string,
  teamBId: string,
  matches: MatchRow[]
): H2HResult[] {
  return playedMatches(matches)
    .filter(
      (m) =>
        (m.homeTeamId === teamAId && m.awayTeamId === teamBId) ||
        (m.homeTeamId === teamBId && m.awayTeamId === teamAId)
    )
    .map((m) => {
      const aIsHome = m.homeTeamId === teamAId;
      const teamAGoals = aIsHome ? m.homeScore : m.awayScore;
      const teamBGoals = aIsHome ? m.awayScore : m.homeScore;
      const result: Result = teamAGoals > teamBGoals ? 'W' : teamAGoals < teamBGoals ? 'V' : 'G';
      return { date: m.kickoff, round: m.round, teamAGoals, teamBGoals, result };
    })
    .sort((a, b) => (a.date ?? 0) - (b.date ?? 0));
}

export type Prediction = {
  home: TeamRow;
  away: TeamRow;
  lambdaHome: number;
  lambdaAway: number;
  probHome: number;
  probDraw: number;
  probAway: number;
  mostLikelyScore: { home: number; away: number };
  probabilities: number[][]; // 9x9 matrix P(home goals, away goals)
  confidence: 'laag' | 'gemiddeld' | 'hoog';
};

export const poisson = (k: number, lambda: number) =>
  (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);

export function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

const HOME_ADVANTAGE = 1.15;
// Regularisatie: trek team-cijfers naar het poulegemiddelde (James-Stein shrink)
// naarmate een team weinig heeft gespeeld, en cap verwachte doelpunten op een
// realistische waarde. Zo wordt het model niet over-fitted op een klein,
// hoogscorend pouletje.
const SHRINK = 2; // "aantal wedstrijden" aan vertrouwen in het gemiddelde
const BASE_CAP = 1.7; // max. gemiddelde doelpunten per team per wedstrijd
const LAMBDA_CAP = 2.9; // max. verwachte doelpunten per team
const LAMBDA_MIN = 0.25;

/**
 * Poisson-based match prediction. Lambda for each side is derived from the
 * team's attack and the opponent's defence, relative to league averages, then
 * scaled by a home-advantage factor. Shrunk towards the league mean to avoid
 * over-fitting on small samples.
 */
export function predictMatch(
  home: TeamRow,
  away: TeamRow,
  teams: TeamRow[],
  matches: MatchRow[]
): Prediction {
  const allAggs = teams.map((t) => computeAggregate(t.id, matches)).filter((a) => a.played > 0);
  const observedLeagueAvg = allAggs.length > 0 ? allAggs.reduce((s, a) => s + a.avgFor, 0) / allAggs.length : 1.4;
  const base = clamp(observedLeagueAvg, 1.0, BASE_CAP);

  const shrinkFor = (gf: number, played: number) =>
    played > 0 ? (gf + SHRINK * base) / (played + SHRINK) : base;
  const shrinkAgainst = (ga: number, played: number) =>
    played > 0 ? (ga + SHRINK * base) / (played + SHRINK) : base;

  const homeAgg = computeAggregate(home.id, matches);
  const awayAgg = computeAggregate(away.id, matches);

  const attackHome = shrinkFor(homeAgg.goalsFor, homeAgg.played) / base;
  const attackAway = shrinkFor(awayAgg.goalsFor, awayAgg.played) / base;
  const defenseHome = shrinkAgainst(homeAgg.goalsAgainst, homeAgg.played) / base;
  const defenseAway = shrinkAgainst(awayAgg.goalsAgainst, awayAgg.played) / base;

  const lambdaHome = clamp(base * attackHome * defenseAway * HOME_ADVANTAGE, LAMBDA_MIN, LAMBDA_CAP);
  const lambdaAway = clamp(base * attackAway * defenseHome / HOME_ADVANTAGE, LAMBDA_MIN, LAMBDA_CAP);

  const MAX_GOALS = 8;
  const probabilities: number[][] = [];
  let probHome = 0;
  let probDraw = 0;
  let probAway = 0;
  let best = { home: 0, away: 0, p: -1 };

  for (let h = 0; h <= MAX_GOALS; h++) {
    probabilities.push([]);
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = poisson(h, lambdaHome) * poisson(a, lambdaAway);
      probabilities[h].push(p);
      if (h > a) probHome += p;
      else if (h === a) probDraw += p;
      else probAway += p;
      if (p > best.p) best = { home: h, away: a, p };
    }
  }

  const total = probHome + probDraw + probAway;
  probHome /= total;
  probDraw /= total;
  probAway /= total;

  const strongest = Math.max(probHome, probDraw, probAway);
  const confidence: Prediction['confidence'] =
    strongest > 0.5 ? 'hoog' : strongest > 0.38 ? 'gemiddeld' : 'laag';

  return {
    home,
    away,
    lambdaHome,
    lambdaAway,
    probHome,
    probDraw,
    probAway,
    mostLikelyScore: { home: best.home, away: best.away },
    probabilities,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Extra analyses: records, home/away, tijdlijn
// ---------------------------------------------------------------------------

export type TeamRecord = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
};

function perspectivesOf(teamId: string, matches: MatchRow[]): TeamPerspective[] {
  return playedMatches(matches)
    .map((m) => fromTeamPerspective(m, teamId))
    .filter((p): p is TeamPerspective => p !== null);
}

function recordFrom(perspectives: TeamPerspective[]): TeamRecord {
  let won = 0;
  let drawn = 0;
  let lost = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  for (const p of perspectives) {
    goalsFor += p.gf;
    goalsAgainst += p.ga;
    if (p.result === 'W') won++;
    else if (p.result === 'G') drawn++;
    else lost++;
  }
  return { played: perspectives.length, won, drawn, lost, goalsFor, goalsAgainst };
}

/** Complete record of a team across all played matches. */
export function teamRecord(teamId: string, matches: MatchRow[]): TeamRecord {
  return recordFrom(perspectivesOf(teamId, matches));
}

/** Record of a team against one specific opponent. */
export function teamRecordVsOpponent(ourId: string, opponentId: string, matches: MatchRow[]): TeamRecord {
  const ps = playedMatches(matches)
    .filter(
      (m) =>
        (m.homeTeamId === ourId && m.awayTeamId === opponentId) ||
        (m.homeTeamId === opponentId && m.awayTeamId === ourId)
    )
    .map((m) => fromTeamPerspective(m, ourId))
    .filter((p): p is TeamPerspective => p !== null);
  return recordFrom(ps);
}

/** Record of a team against everyone EXCEPT the excluded team(s). */
export function teamRecordVsOthers(teamId: string, excludeTeamIds: string[], matches: MatchRow[]): TeamRecord {
  const ps = playedMatches(matches)
    .filter(
      (m) =>
        (m.homeTeamId === teamId || m.awayTeamId === teamId) &&
        !(excludeTeamIds.includes(m.homeTeamId) || excludeTeamIds.includes(m.awayTeamId))
    )
    .map((m) => fromTeamPerspective(m, teamId))
    .filter((p): p is TeamPerspective => p !== null);
  return recordFrom(ps);
}

/** Home and away record split for a team. */
export function homeAwaySplit(
  teamId: string,
  matches: MatchRow[]
): { home: TeamRecord; away: TeamRecord } {
  const ps = perspectivesOf(teamId, matches);
  return { home: recordFrom(ps.filter((p) => p.home)), away: recordFrom(ps.filter((p) => !p.home)) };
}

/** Cumulative points + goal difference after each (chronological) played match. */
export function cumulativeTimeline(
  teamId: string,
  matches: MatchRow[]
): Array<{ kickoff: number; round: number | null; points: number; goalDiff: number }> {
  const events = playedMatches(matches)
    .map((m) => ({
      p: fromTeamPerspective(m, teamId),
      kickoff: m.kickoff ?? 0,
      round: m.round,
    }))
    .filter(
      (x): x is { p: TeamPerspective; kickoff: number; round: number | null } => x.p !== null
    )
    .sort((a, b) => a.kickoff - b.kickoff);

  let points = 0;
  let goalDiff = 0;
  return events.map((x) => {
    points += x.p.result === 'W' ? 3 : x.p.result === 'G' ? 1 : 0;
    goalDiff += x.p.gf - x.p.ga;
    return { kickoff: x.kickoff, round: x.round, points, goalDiff };
  });
}

/** Round -> cumulative goal difference, aligned by speelronde. */
export function goalDiffByRound(teamId: string, matches: MatchRow[]): Map<number, number> {
  const map = new Map<number, number>();
  let cumulative = 0;
  const rounds = playedMatches(matches)
    .map((m) => ({ p: fromTeamPerspective(m, teamId), round: m.round }))
    .filter((x): x is { p: TeamPerspective; round: number } => x.p !== null && x.round !== null)
    .sort((a, b) => a.round - b.round);
  for (const x of rounds) {
    cumulative += x.p.gf - x.p.ga;
    map.set(x.round, cumulative);
  }
  return map;
}

/** Alle (opeenvolgende) speelrondes die in de poule voorkomen. */
export function roundNumbers(matches: MatchRow[]): number[] {
  const rounds = matches.filter((m) => m.round != null).map((m) => m.round!);
  const max = rounds.length ? Math.max(...rounds) : 1;
  return Array.from({ length: max }, (_, i) => i + 1);
}

export type Chance = { win: number; draw: number; loss: number };

/**
 * Kans (0-1) van een team om te winnen van een tegenstander, gemiddeld over
 * "wij thuis" en "wij uit", zodat het thuisvoordeel eruit wordt gemiddeld.
 */
export function chanceVsOpponent(
  ourId: string,
  opponentId: string,
  teams: TeamRow[],
  matches: MatchRow[]
): Chance {
  const our = teams.find((t) => t.id === ourId)!;
  const opp = teams.find((t) => t.id === opponentId)!;
  const asHome = predictMatch(our, opp, teams, matches); // wij thuis → win = probHome
  const asAway = predictMatch(opp, our, teams, matches); // wij uit → win = probAway
  return {
    win: (asHome.probHome + asAway.probAway) / 2,
    draw: (asHome.probDraw + asAway.probDraw) / 2,
    loss: (asHome.probAway + asAway.probHome) / 2,
  };
}
