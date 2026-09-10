import { Chart } from 'chart.js/auto';
import {
  computeStandings,
  computeForm,
  computeStrength,
  predictMatch,
  headToHead,
  teamRecordVsOpponent,
  teamRecordVsOthers,
  chanceVsOpponent,
  goalDiffByRound,
  roundNumbers,
  type TeamRow,
  type MatchRow,
} from '../lib/stats/compute';
import { getTip } from '../lib/tips';
import {
  computeTeamKpis,
  homeAwayAnalysis,
  computeMomentum,
  computeRatingTable,
  predictAdvanced,
  strengthOfSchedule,
  luckAnalysis,
  styleProfile,
  clusterArchetypes,
  multiSeasonHeadToHead,
  teamKeyOf,
  simulateSeason,
  matchLeverage,
  positionByRound,
  headToHeadMatrix,
  goalsHistogram,
  type ModelKind,
  type ScenarioResult,
  type AdvancedPrediction,
} from '../lib/stats/analytics';

/* eslint-disable */

declare const chrome: any;

type PouleTeam = TeamRow & { ours?: boolean; logo?: string | null };
type PouleMatch = MatchRow;
type Poule = {
  id: string;
  name: string;
  season: string;
  category: string | null;
  level?: string | null;
  division?: string | null;
  day?: string | null;
  competition?: string | null;
  competitionSlug?: string | null;
  rosters?: {
    [teamId: string]: { staff: { name: string; photo: string | null }[]; players: { name: string; photo: string | null }[] };
  };
  teams: PouleTeam[];
  matches: PouleMatch[];
  ourTeamId: string;
  updatedAt: string;
};

type View = 'overzicht' | 'poule' | 'team' | 'modellen' | 'voorspelling' | 'scenario';

const state: {
  poules: Record<string, Poule>;
  allPoules: Poule[];
  pouleId: string | null;
  teamId: string | null;
  view: View;
  model: ModelKind;
  matchId: string | null;
} = {
  poules: {},
  allPoules: [],
  pouleId: null,
  teamId: null,
  view: 'overzicht',
  model: 'dixon-coles',
  matchId: null,
};

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'overzicht', label: 'Overzicht' },
  { id: 'poule', label: 'Poule-analyse' },
  { id: 'modellen', label: 'Modellen' },
  { id: 'voorspelling', label: 'Voorspelling' },
  { id: 'scenario', label: 'Scenario' },
];

const MODELS: Array<{ id: ModelKind; label: string }> = [
  { id: 'poisson', label: 'Poisson' },
  { id: 'dixon-coles', label: 'Dixon-Coles' },
  { id: 'bivariate', label: 'Bivariaat' },
  { id: 'negbin', label: 'Negatief-binomiaal' },
];

// ---------- helpers ----------
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};
const esc = (s: string | null | undefined) => (s || '').replace(/[&<>"]/g, (c) => HTML_ESCAPES[c] ?? c);

/**
 * Info-icoon met een uitgebreide infobox. De inhoud komt uit de gedeelde
 * tip-bibliotheek (`lib/tips.ts`) en wordt in een <template> gezet; de
 * tooltip-engine toont die in een zwevend paneel zodat lange uitleg niet
 * afgeknipt wordt door scrollende tabellen.
 */
function tip(id: string): string {
  const t = getTip(id);
  const inner = t ? `<span class="tip-pop-title">${esc(t.title)}</span>${t.body}` : esc(id);
  return `<span class="tip" tabindex="0" role="note">ⓘ<template class="tip-template">${inner}</template></span>`;
}
const pct = (v: number) => Math.round(v * 100) + '%';
const pct1 = (v: number) => (v * 100).toFixed(1) + '%';
const ds = (v: number) => (v > 0 ? '+' + v : String(v));
const n1 = (v: number) => (isFinite(v) ? v.toFixed(1) : '—');
const n2 = (v: number) => (isFinite(v) ? v.toFixed(2) : '—');
const fdate = (ms: number | null) =>
  ms ? new Date(ms).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : '—';
const clampPct = (v: number) => Math.max(0, Math.min(100, v));

const teamById = (p: Poule, id: string) => p.teams.find((t) => t.id === id)!;
const teamsArg = (p: Poule) => p.teams;
const matchesArg = (p: Poule) => p.matches;
const short = (t: PouleTeam) => esc(t.shortName || t.name);

function ours(poule: Poule): PouleTeam | null {
  return poule.teams.find((t) => t.id === poule.ourTeamId) || poule.teams[0] || null;
}

function getPoule(): Poule | null {
  const id = state.pouleId || Object.keys(state.poules)[0] || null;
  return id ? state.poules[id] : null;
}

function compareOpponent(team: PouleTeam, poule: Poule): PouleTeam | null {
  const next = poule.matches.find(
    (m) => m.status === 'scheduled' && (m.homeTeamId === team.id || m.awayTeamId === team.id)
  );
  if (next) return teamById(poule, next.homeTeamId === team.id ? next.awayTeamId : next.homeTeamId);
  let best: PouleTeam | null = null;
  let bestS = -1;
  for (const t of poule.teams) {
    if (t.id === team.id) continue;
    const s = computeStrength(t.id, poule.teams, poule.matches).overall;
    if (s > bestS) {
      best = t;
      bestS = s;
    }
  }
  return best;
}

function formBadges(form: string[]) {
  if (!form.length) return '<span class="muted">geen data</span>';
  return '<span class="form">' + form.map((r) => `<span class="${r}">${r}</span>`).join('') + '</span>';
}

function strengthBars(team: PouleTeam, teams: TeamRow[], matches: MatchRow[]) {
  const s = computeStrength(team.id, teams, matches);
  return (
    `<div class="muted" style="margin:6px 0 2px">Aanval ${Math.round(s.attack)} · Verdediging ${Math.round(s.defense)} · Algemeen ${Math.round(s.overall)}</div>` +
    `<div class="bar-wrap"><div class="bar" style="width:${s.attack}%;background:${s.attack >= 55 ? 'var(--green)' : 'var(--red)'}"></div></div>` +
    `<div class="bar-wrap" style="margin-top:5px"><div class="bar" style="width:${s.defense}%;background:${s.defense >= 55 ? '#0ea5e9' : '#f59e0b'}"></div></div>`
  );
}

/** Kleine sparkline (SVG) voor in tabellen/kaartjes. */
function sparkline(values: number[], color = '#16a34a', w = 120, h = 30): string {
  if (values.length < 2) return '<span class="muted">—</span>';
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => h - ((v - min) / (max - min)) * h;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${d} L${w},${h} L0,${h} Z`;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${area}" fill="rgba(22,163,74,.12)"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2"/></svg>`;
}

function cumulativePoints(teamId: string, matches: MatchRow[]): number[] {
  const pts: number[] = [0];
  let total = 0;
  const ordered = matches
    .filter((m) => m.status === 'played' && (m.homeTeamId === teamId || m.awayTeamId === teamId))
    .sort((a, b) => (a.kickoff ?? 0) - (b.kickoff ?? 0));
  for (const m of ordered) {
    const isHome = m.homeTeamId === teamId;
    const gf = (isHome ? m.homeScore : m.awayScore) ?? 0;
    const ga = (isHome ? m.awayScore : m.homeScore) ?? 0;
    total += gf > ga ? 3 : gf === ga ? 1 : 0;
    pts.push(total);
  }
  return pts;
}

/** CSS-heatmap van de kansmatrix van een voorspelling. */
function heatmapMatrix(pr: AdvancedPrediction, homeName: string, awayName: string): string {
  const size = pr.matrix.length;
  let max = 0;
  for (const row of pr.matrix) for (const p of row) max = Math.max(max, p);
  let rows = '';
  for (let x = 0; x < size; x++) {
    let cells = '';
    for (let y = 0; y < size; y++) {
      const p = pr.matrix[x][y];
      const alpha = max > 0 ? p / max : 0;
      const bg = `rgba(22,163,74,${(alpha * 0.85).toFixed(3)})`;
      const color = alpha > 0.5 ? '#fff' : '#334155';
      const label = p >= 0.01 ? pct(p) : '';
      cells += `<div class="hm-cell" style="background:${bg};color:${color}">${label}</div>`;
    }
    rows += `<div class="hm-row"><div class="hm-axis">${x}</div>${cells}</div>`;
  }
  let head = '<div class="hm-row"><div class="hm-axis"></div>';
  for (let y = 0; y < size; y++) head += `<div class="hm-head">${y}</div>`;
  head += '</div>';
  return (
    `<div class="hm-wrap"><div class="hm-legend"><span>${esc(homeName)} (rij)</span><span>${esc(awayName)} (kolom)</span></div>` +
    `<div class="hm">${head}${rows}</div>` +
    `<div class="muted" style="margin-top:6px">Kans per uitslag (thuisdoelpunten × uitdoelpunten). Donkerder = waarschijnlijker.</div></div>`
  );
}

function kpiCard(label: string, value: string, sub = ''): string {
  return `<div class="kpi"><div class="l">${esc(label)}</div><div class="v">${esc(value)}</div><div class="s">${sub}</div></div>`;
}

function statRow(label: string, value: string, sub = ''): string {
  return `<div class="stat-row"><span class="stat-label">${esc(label)}</span><span class="stat-value">${esc(value)}${sub ? ` <span class="muted">${sub}</span>` : ''}</span></div>`;
}

/** Dumbbell: twee waarden (thuis vs uit) op één schaal. */
function dumbbell(label: string, homeVal: number, awayVal: number, max: number, unit = ''): string {
  const h = clampPct((homeVal / (max || 1)) * 100);
  const a = clampPct((awayVal / (max || 1)) * 100);
  const left = Math.min(h, a);
  const width = Math.abs(h - a);
  return (
    `<div class="dumbbell"><div class="db-label">${esc(label)}</div><div class="db-track">` +
    `<div class="db-line" style="left:${left}%;width:${width}%"></div>` +
    `<div class="db-dot db-home" style="left:${h}%"></div>` +
    `<div class="db-dot db-away" style="left:${a}%"></div>` +
    `</div><div class="db-values"><span class="db-home-t">${n1(homeVal)}${unit}</span><span class="db-away-t">${n1(awayVal)}${unit}</span></div></div>`
  );
}

/** Bullet: werkelijk tegenover verwacht (verwacht = marker). */
function bullet(label: string, actual: number, expected: number, max: number, unit = ''): string {
  const a = clampPct((actual / (max || 1)) * 100);
  const e = clampPct((expected / (max || 1)) * 100);
  const tone = actual >= expected ? 'var(--green)' : 'var(--red)';
  return (
    `<div class="bullet"><div class="bullet-head"><span>${esc(label)}</span><span><b style="color:${tone}">${n1(actual)}${unit}</b> <span class="muted">vs verwacht ${n1(expected)}${unit}</span></span></div>` +
    `<div class="bullet-track"><div class="bullet-fill" style="width:${a}%;background:${tone}"></div><div class="bullet-target" style="left:${e}%"></div></div></div>`
  );
}

// ---------- header ----------
function header(poule: Poule) {
  const selected = state.teamId ? poule.teams.find((t) => t.id === state.teamId) : null;
  const logo = selected && selected.logo ? selected.logo : null;
  const chips = poule.teams
    .map((t) => {
      const active = state.teamId === t.id;
      return `<button class="chip ${active ? 'active' : ''} ${t.ours ? 'ours' : ''}" data-team="${esc(t.id)}">${short(t)}</button>`;
    })
    .join('');
  const nav = VIEWS.map(
    (v) => `<button class="nav-btn ${state.view === v.id ? 'active' : ''}" data-view="${v.id}">${v.label}</button>`
  ).join('');
  return (
    `<div class="card header-card" style="position:relative">` +
    (logo ? `<img class="club-logo" src="${esc(logo)}" alt="${esc(selected!.shortName)}">` : '') +
    `<div class="brand"><span class="logo">⚽</span>Voetbal Poule Dashboard</div>` +
    `<h1 style="padding-right:${logo ? '70px' : '0'}">${esc(poule.name)}</h1>` +
    `<div class="meta">${esc(poule.season)}${poule.division ? ' · ' + esc(poule.division) : ''}${poule.category ? ' · ' + esc(poule.category) : ''}${poule.day ? ' · ' + esc(poule.day) : ''}${poule.competition ? ' · ' + esc(poule.competition) : ''} · bijgewerkt ${fdate(new Date(poule.updatedAt).getTime())}</div>` +
    `<div class="nav">${nav}</div>` +
    `<div class="chips" style="margin-top:10px">${state.view === 'team' ? `<button class="chip" data-back>← Overzicht</button>` : ''}${chips}</div>` +
    `</div>`
  );
}

// ---------- Selectie (spelers/staf) ----------
function rosterRow(people: { name: string; photo: string | null }[]) {
  if (!people.length) return '';
  return (
    `<div class="roster">` +
    people
      .map((p) => {
        const init = p.name.split(' ').map((s) => (s[0] || '')).slice(0, 2).join('').toUpperCase();
        const av = p.photo
          ? `<img class="roster-avatar" src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy">`
          : `<div class="roster-avatar roster-avatar--init">${esc(init)}</div>`;
        const bigAv = p.photo
          ? `<img class="roster-popup-avatar" src="${esc(p.photo)}" alt="${esc(p.name)}">`
          : `<div class="roster-popup-avatar roster-popup-avatar--init">${esc(init)}</div>`;
        return (
          `<div class="roster-item">${av}<div class="roster-name">${esc(p.name)}</div>` +
          `<div class="roster-popup">${bigAv}<div class="roster-popup-name">${esc(p.name)}</div></div></div>`
        );
      })
      .join('') +
    `</div>`
  );
}

function rosterSection(poule: Poule, teamId: string) {
  const r = poule.rosters && poule.rosters[teamId];
  const staff = (r && r.staff) || [];
  const players = (r && r.players) || [];
  if (!staff.length && !players.length) return '';
  return (
    (staff.length
      ? `<div class="section-title">Staf ${tip('rosterStaff')}</div>` +
        rosterRow(staff)
      : '') +
    (players.length
      ? `<div class="section-title" style="margin-top:14px">Spelers ${tip('rosterPlayers')}</div>` +
        rosterRow(players)
      : '')
  );
}

// ---------- Overzicht ----------
function overview(poule: Poule) {
  const teams = teamsArg(poule);
  const matches = matchesArg(poule);
  const standings = computeStandings(teams, matches);
  const played = matches.filter((m) => m.status === 'played');
  const totalGoals = played.reduce((s, m) => s + (m.homeScore || 0) + (m.awayScore || 0), 0);
  const avgGoals = played.length ? totalGoals / played.length : 0;
  const aggs = teams.map((t) => ({ team: t, s: computeStrength(t.id, teams, matches) }));
  const bestAtk = [...aggs].sort((a, b) => b.s.attack - a.s.attack)[0];
  const bestDef = [...aggs].sort((a, b) => b.s.defense - a.s.defense)[0];

  const kpi =
    `<div class="grid kpi">` +
    kpiCard('Teams', String(teams.length), 'in de poule') +
    kpiCard('Gespeeld', String(played.length), `${matches.filter((m) => m.status === 'scheduled').length} nog te spelen`) +
    kpiCard('Gem. doelpunten', n1(avgGoals), 'per wedstrijd') +
    kpiCard('Sterkste aanval', bestAtk ? String(Math.round(bestAtk.s.attack)) : '—', bestAtk ? short(bestAtk.team) : '') +
    kpiCard('Beste verdediging', bestDef ? String(Math.round(bestDef.s.defense)) : '—', bestDef ? short(bestDef.team) : '') +
    `</div>`;

  const table =
    `<div class="table-scroll"><table><thead><tr><th>#</th><th>Team</th><th class="num">G</th><th class="num">W</th><th class="num">GL</th><th class="num">V</th><th class="num">DS</th><th class="num">Ptn</th><th class="num">PPD</th><th>Vorm</th><th>Punten­verloop</th></tr></thead><tbody>` +
    standings
      .map((s, i) => {
        const form = computeForm(s.team.id, matches, 5);
        const isOurs = s.team.id === poule.ourTeamId;
        const cum = cumulativePoints(s.team.id, matches);
        return (
          `<tr><td class="num">${i + 1}</td>` +
          `<td><a href="#" data-team-link="${esc(s.team.id)}" style="${isOurs ? 'font-weight:700' : ''}">${short(s.team)}</a></td>` +
          `<td class="num">${s.played}</td><td class="num">${s.won}</td><td class="num">${s.drawn}</td><td class="num">${s.lost}</td>` +
          `<td class="num">${ds(s.goalDiff)}</td><td class="num"><b>${s.points}</b></td>` +
          `<td class="num">${n2(s.played ? s.points / s.played : 0)}</td>` +
          `<td>${formBadges(form)}</td>` +
          `<td>${sparkline(cum)}</td></tr>`
        );
      })
      .join('') +
    `</tbody></table></div>`;

  // Small multiples: alle poulegenoten in één oogopslag.
  const smallMultiples =
    `<div class="grid small">` +
    standings
      .map((s) => {
        const k = computeTeamKpis(s.team.id, matches);
        const cum = cumulativePoints(s.team.id, matches);
        return (
          `<div class="mini-card" data-team-link="${esc(s.team.id)}">` +
          `<div class="mini-head"><b>${short(s.team)}</b><span class="mini-rank">#${s.points}</span></div>` +
          `<div class="mini-sub">${s.won}-${s.drawn}-${s.lost} · ${ds(s.goalDiff)} · ${n2(k.ppg)} ppd</div>` +
          `<div class="mini-sub">${n1(k.gfPerGame)} voor · ${n1(k.gaPerGame)} tegen · BTTS ${pct(k.btts)}</div>` +
          `${sparkline(cum, '#16a34a', 160, 34)}` +
          `<div style="margin-top:4px">${formBadges(computeForm(s.team.id, matches, 5))}</div>` +
          `</div>`
        );
      })
      .join('') +
    `</div>`;

  const upcoming = matches.filter((m) => m.status === 'scheduled');
  const nextMatches = upcoming.length
    ? `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr))">` +
      upcoming
        .map((m) => {
          const h = teamById(poule, m.homeTeamId);
          const a = teamById(poule, m.awayTeamId);
          const pr = predictMatch(h, a, teams, matches);
          const tone = pr.confidence === 'hoog' ? 'green' : pr.confidence === 'gemiddeld' ? 'blue' : 'neutral';
          return (
            `<div class="card" style="margin-bottom:0">` +
            `<div style="display:flex;justify-content:space-between;font-size:13px"><b>${short(h)}</b><b>${short(a)}</b></div>` +
            `<div style="text-align:center" class="muted">${fdate(m.kickoff)}${m.round ? ' · ronde ' + m.round : ''}</div>` +
            `<div class="bar-wrap" style="margin-top:8px;display:flex;height:12px">` +
            `<div style="width:${pr.probHome * 100}%;background:var(--green);height:100%"></div>` +
            `<div style="width:${pr.probDraw * 100}%;background:#a1a1aa;height:100%"></div>` +
            `<div style="width:${pr.probAway * 100}%;background:var(--red);height:100%"></div>` +
            `</div>` +
            `<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:4px" class="muted">` +
            `<span style="color:${pr.probHome > pr.probAway ? 'var(--green)' : ''}">${pct(pr.probHome)} W</span>` +
            `<span>${pct(pr.probDraw)} G</span>` +
            `<span style="color:${pr.probAway > pr.probHome ? 'var(--red)' : ''}">${pct(pr.probAway)} V</span>` +
            `</div>` +
            `<div style="margin-top:6px"><span class="badge ${tone}">${pr.confidence}</span></div>` +
            `</div>`
          );
        })
        .join('') +
      `</div>`
    : `<p class="muted">Geen geplande wedstrijden meer.</p>`;

  return (
    kpi +
    `<div class="section-title">Stand ${tip('stand')}</div><div class="card">${table}</div>` +
    `<div class="section-title">Alle teams in één oogopslag ${tip('smallMultiples')}</div><div class="card">${smallMultiples}</div>` +
    `<div class="section-title">Doelpunten per wedstrijd (gem.) ${tip('goalsForAgainst')}</div><div class="card"><div class="chart-box"><canvas id="goalsChart"></canvas></div></div>` +
    `<div class="section-title">Volgende speelronde ${tip('nextRound')}</div>${nextMatches}`
  );
}

// ---------- Poule-analyse ----------
function pouleView(poule: Poule) {
  const teams = teamsArg(poule);
  const matches = matchesArg(poule);
  const standings = computeStandings(teams, matches);
  const played = matches.filter((m) => m.status === 'played');
  const avg = played.length ? played.reduce((s, m) => s + (m.homeScore || 0) + (m.awayScore || 0), 0) / played.length : 0;
  const btts = played.length ? played.filter((m) => (m.homeScore || 0) > 0 && (m.awayScore || 0) > 0).length / played.length : 0;
  const over25 = played.length ? played.filter((m) => (m.homeScore || 0) + (m.awayScore || 0) > 2.5).length / played.length : 0;
  const homeWins = played.filter((m) => (m.homeScore || 0) > (m.awayScore || 0)).length;
  const awayWins = played.filter((m) => (m.homeScore || 0) < (m.awayScore || 0)).length;

  const ratings = computeRatingTable(teams, matches);
  const ad = new Map(ratings.map((r) => [r.teamId, r]));
  const archs = clusterArchetypes(teams, matches);
  const archBy = new Map(archs.map((a) => [a.teamId, a]));

  const kpi =
    `<div class="grid kpi">` +
    kpiCard('Gem. doelpunten', n1(avg), 'per wedstrijd') +
    kpiCard('Beide teams scoren', pct(btts), 'van de duels') +
    kpiCard('Boven 2,5', pct(over25), 'van de duels') +
    kpiCard('Thuiswinst', pct(played.length ? homeWins / played.length : 0), `${awayWins} uitoverwinningen`) +
    `</div>`;

  // Bump chart (positieverloop)
  const pbr = positionByRound(teams, matches);
  const bumpLegend = `<div class="legend">${teams
    .map((t, i) => `<span class="legend-item"><i style="background:${chartColor(i)}"></i>${short(t)}</span>`)
    .join('')}</div>`;

  // Kwadrant-scatter data wordt via JSON doorgegeven aan Chart.js.
  const quadData = teams.map((t) => {
    const r = ad.get(t.id)!;
    return { x: r.attack, y: 1 / (r.defense || 1), label: t.shortName || t.name };
  });

  const archTable =
    `<div class="table-scroll"><table><thead><tr><th>Team</th><th>Archetype</th><th class="num">Aanval</th><th class="num">Verdediging</th><th class="num">Tempo</th><th class="num">Grilligheid</th><th class="num">Thuis−uit (ppd)</th></tr></thead><tbody>` +
    standings
      .map((s) => {
        const r = ad.get(s.team.id)!;
        const a = archBy.get(s.team.id);
        const st = styleProfile(s.team.id, matches);
        const ha = homeAwayAnalysis(s.team.id, teams, matches);
        return (
          `<tr><td><a href="#" data-team-link="${esc(s.team.id)}">${short(s.team)}</a></td>` +
          `<td><span class="badge blue">${esc(a ? a.label : '—')}</span></td>` +
          `<td class="num">${n2(r.attack)}×</td><td class="num">${n2(r.defense)}×</td>` +
          `<td class="num">${n1(st.tempo)}</td><td class="num">${n1(st.volatility)}</td>` +
          `<td class="num" style="color:${ha.homeAdvantageIndex >= 0 ? 'var(--green)' : 'var(--red)'}">${ds(Math.round(ha.homeAdvantageIndex * 100) / 100)}</td></tr>`
        );
      })
      .join('') +
    `</tbody></table></div>`;

  // Uitslagen-matrix
  const matrix = headToHeadMatrix(teams, matches);
  const scoreBy = new Map(matrix.map((c) => [c.homeTeamId + '|' + c.awayTeamId, c.score]));
  const matrixHead = `<tr><th class="hm"></th>${standings.map((s) => `<th class="hm">${short(s.team)}</th>`).join('')}</tr>`;
  const matrixRows = standings
    .map(
      (row) =>
        `<tr><th class="hm">${short(row.team)}</th>` +
        standings
          .map((col) => {
            if (row.team.id === col.team.id) return `<td class="hm hm-self">—</td>`;
            const sc = scoreBy.get(row.team.id + '|' + col.team.id);
            if (!sc) return `<td class="hm hm-empty">·</td>`;
            const [h, a] = sc.split('-').map(Number);
            const cls = h > a ? 'hm-win' : h < a ? 'hm-loss' : 'hm-draw';
            return `<td class="hm ${cls}">${sc}</td>`;
          })
          .join('') +
        `</tr>`
    )
    .join('');

  return (
    kpi +
    `<div class="section-title">Positieverloop per speelronde ${tip('bumpChart')}</div>` +
    `<div class="card"><div class="chart-box tall"><canvas id="bumpChart"></canvas></div>${bumpLegend}</div>` +
    `<div class="grid two">` +
    `<div class="card"><h2>Kwadrant: aanval × verdediging ${tip('quadrant')}</h2><div class="chart-box"><canvas id="quadChart"></canvas></div></div>` +
    `<div class="card"><h2>Doelpuntenverdeling ${tip('histogram')}</h2><div class="chart-box"><canvas id="histChart"></canvas></div></div>` +
    `</div>` +
    `<div class="section-title">Archetypen &amp; stijl ${tip('archetypes')}</div><div class="card">${archTable}</div>` +
    `<div class="section-title">Onderlinge uitslagen ${tip('resultsMatrix')}</div>` +
    `<div class="card"><div class="matrix-scroll"><table class="matrix"><thead>${matrixHead}</thead><tbody>${matrixRows}</tbody></table></div></div>` +
    `<div style="display:none" id="quadData">${JSON.stringify(quadData)}</div>` +
    `<div style="display:none" id="bumpData">${JSON.stringify(pbr)}</div>` +
    `<div style="display:none" id="histData">${JSON.stringify(goalsHistogram(matches))}</div>`
  );
}

// ---------- Team-view ----------
function predictionBlock(pr: AdvancedPrediction, match: MatchRow, opts: { modelSelector?: boolean } = {}) {
  const models = opts.modelSelector
    ? `<div class="seg">${MODELS.map(
        (m) => `<button class="seg-btn ${state.model === m.id ? 'active' : ''}" data-model="${m.id}">${m.label}</button>`
      ).join('')}</div>`
    : '';
  const markets =
    `<div class="market-grid">` +
    `<div class="market"><div class="l">Verwachte goals</div><div class="v">${n2(pr.lambdaHome)} – ${n2(pr.lambdaAway)}</div></div>` +
    `<div class="market"><div class="l">Meest waarschijnlijk</div><div class="v">${pr.mostLikelyScore.home}–${pr.mostLikelyScore.away}</div></div>` +
    `<div class="market"><div class="l">Verwachte punten</div><div class="v">${n2(pr.expectedPointsHome)} / ${n2(pr.expectedPointsAway)}</div></div>` +
    `<div class="market"><div class="l">Beide teams scoren</div><div class="v">${pct(pr.btts)}</div></div>` +
    `</div>`;
  const ou =
    `<div class="ou-row">` +
    pr.overUnder
      .map(
        (o) =>
          `<div class="ou"><div class="ou-line">${o.line}</div><div class="bar-wrap"><div class="bar" style="width:${o.over * 100}%;background:var(--green)"></div></div><div class="muted">Over ${pct(o.over)} · Under ${pct(o.under)}</div></div>`
      )
      .join('') +
    `</div>`;
  return (
    models +
    `<div style="display:flex;justify-content:space-between;font-size:14px;margin:8px 0 2px"><b>${short(pr.home)}</b><b>${short(pr.away)}</b></div>` +
    `<div class="muted">${fdate(match.kickoff)}${match.round ? ' · ronde ' + match.round : ''} · model: ${esc(MODELS.find((m) => m.id === pr.model)!.label)} · zekerheid ${pr.confidence}</div>` +
    `<div class="bar-wrap" style="display:flex;height:14px;margin-top:10px">` +
    `<div style="width:${pr.probHome * 100}%;background:var(--green)"></div>` +
    `<div style="width:${pr.probDraw * 100}%;background:#a1a1aa"></div>` +
    `<div style="width:${pr.probAway * 100}%;background:var(--red)"></div>` +
    `</div>` +
    `<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:5px"><span style="color:var(--green)">${pct(pr.probHome)} winst</span><span>${pct(pr.probDraw)} gelijk</span><span style="color:var(--red)">${pct(pr.probAway)} verlies</span></div>` +
    markets +
    heatmapMatrix(pr, pr.home.shortName || pr.home.name, pr.away.shortName || pr.away.name) +
    ou
  );
}

function homeAwayTable(ha: ReturnType<typeof homeAwayAnalysis>): string {
  const rec = (label: string, r: { played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; ppg: number }) =>
    `<tr><td><b>${label}</b></td><td class="num">${r.played}</td><td class="num">${r.won}-${r.drawn}-${r.lost}</td><td class="num">${r.goalsFor}-${r.goalsAgainst}</td><td class="num"><b>${n2(r.ppg)}</b></td></tr>`;
  return (
    `<table><thead><tr><th>Venue</th><th class="num">G</th><th class="num">W-G-V</th><th class="num">Doelen</th><th class="num">PPD</th></tr></thead><tbody>` +
    rec('Thuis', ha.home) +
    rec('Uit', ha.away) +
    `</tbody></table>`
  );
}

function teamView(poule: Poule, team: PouleTeam) {
  const teams = teamsArg(poule);
  const matches = matchesArg(poule);
  const standings = computeStandings(teams, matches);
  const rank = standings.findIndex((s) => s.team.id === team.id) + 1;
  const st = standings.find((s) => s.team.id === team.id)!;
  const form = computeForm(team.id, matches, 5);
  const strength = computeStrength(team.id, teams, matches);
  const kpis = computeTeamKpis(team.id, matches);
  const ha = homeAwayAnalysis(team.id, teams, matches);
  const mom = computeMomentum(team.id, matches);
  const sos = strengthOfSchedule(team.id, teams, matches);
  const luck = luckAnalysis(team.id, teams, matches);
  const style = styleProfile(team.id, matches);
  const rating = computeRatingTable(teams, matches).find((r) => r.teamId === team.id)!;
  const arch = clusterArchetypes(teams, matches).find((a) => a.teamId === team.id);

  const highlight = (h: { opponentId: string; round: number | null; home: boolean } | null) =>
    h ? `${h.home ? 'thuis' : 'uit'} vs ${esc(teamById(poule, h.opponentId).shortName || '')}${h.round ? ' (R' + h.round + ')' : ''}` : '—';

  // Basis-KPI's (catalogus 1)
  const basicKpi =
    `<div class="grid kpi">` +
    kpiCard('Positie', `#${rank}`, formBadges(form)) +
    kpiCard('Punten / duel', n2(kpis.ppg), `${kpis.points} punten in ${kpis.played}`) +
    kpiCard('Voor / tegen', `${n2(kpis.gfPerGame)} / ${n2(kpis.gaPerGame)}`, `DS/duel ${ds(Math.round(kpis.gdPerGame * 100) / 100)}`) +
    kpiCard('W / G / V', `${kpis.won}-${kpis.drawn}-${kpis.lost}`, `${pct(kpis.winPct)} winst`) +
    kpiCard('Clean sheets', `${kpis.cleanSheets}`, `${pct(kpis.cleanSheetPct)} van de duels`) +
    kpiCard('Zonder te scoren', `${kpis.failedToScore}`, `${pct(kpis.failedToScorePct)} van de duels`) +
    `</div>`;

  const detailKpi =
    `<div class="grid kpi">` +
    kpiCard('Gem. totaal', n1(kpis.avgTotalGoals), 'doelpunten per duel') +
    kpiCard('Beide scoren', pct(kpis.btts), 'BTTS') +
    kpiCard('Boven 2,5', pct(kpis.over25), 'doelpunten') +
    kpiCard('Grootste zege', kpis.biggestWin ? `${kpis.biggestWin.goalsFor}-${kpis.biggestWin.goalsAgainst}` : '—', highlight(kpis.biggestWin)) +
    kpiCard('Grootste nederlaag', kpis.biggestLoss ? `${kpis.biggestLoss.goalsFor}-${kpis.biggestLoss.goalsAgainst}` : '—', highlight(kpis.biggestLoss)) +
    kpiCard('Meest voorkomend', kpis.mostCommonScore ? kpis.mostCommonScore.score : '—', kpis.mostCommonScore ? `${kpis.mostCommonScore.count}×` : '') +
    `</div>`;

  const margins =
    `<div class="muted" style="margin-top:6px">Overwinningen naar marge: ${kpis.winMargins.one}× met 1 doelpunt verschil, ${kpis.winMargins.two}× met 2, ${kpis.winMargins.threePlus}× met 3+.</div>`;

  // Momentum
  const momentumSection =
    `<div class="grid two">` +
    `<div class="card"><h2>Momentum ${tip('momentum')}</h2><div class="chart-box"><canvas id="momentumChart"></canvas></div>` +
    `<div class="stat-row"><span class="stat-label">Vorm (laatste 6)</span><span>${formBadges(mom.form6)}</span></div>` +
    statRow('Momentum-delta', ds(Math.round(mom.momentumDelta * 100) / 100), `laatste 5 (${n2(mom.last5Ppg)}) − seizoen (${n2(mom.seasonPpg)})`) +
    statRow('EWMA-vorm', n2(mom.ewmaPpg)) +
    statRow('Huidige reeks', `${mom.currentStreak.type === 'onbeat' ? 'onbeat' : mom.currentStreak.type} ${mom.currentStreak.length}`, `onbeat ${mom.currentUnbeaten}`) +
    statRow('Langste reeksen', `${mom.longestWinStreak} W · ${mom.longestUnbeatenStreak} onbeat · ${mom.longestLossStreak} V`) +
    `</div>` +
    `<div class="card"><h2>Omslagpunt &amp; trend ${tip('turningPoint')}</h2>` +
    statRow('Trend', mom.trend, 'laatste 3 vs daarvoor') +
    statRow('Omslagpunt', mom.turningPoint ? `R${mom.turningPoint.round ?? '?'} — ${mom.turningPoint.label}` : 'geen duidelijk omslagpunt') +
    `<div class="muted" style="margin-top:8px">Rolling doelsaldo per duel</div>` +
    `<div class="chart-box" style="height:160px"><canvas id="gdMomentChart"></canvas></div>` +
    `</div>` +
    `</div>`;

  // Sterkteratings + aanval/verdediging
  const ratingsSection =
    `<div class="grid two">` +
    `<div class="card"><h2>Sterkteratings ${tip('ratings')}</h2>` +
    `<table><tbody>` +
    statRow('Elo', String(Math.round(rating.elo))) +
    statRow('Massey', n2(rating.massey)) +
    statRow('Colley', n2(rating.colley)) +
    statRow('Bradley-Terry', n2(rating.bradleyTerry)) +
    statRow('Pi-rating', n2(rating.pi)) +
    `</tbody></table></div>` +
    `<div class="card"><h2>Aanval- &amp; verdedigingscoëfficiënten ${tip('attackDefense')}</h2><div class="chart-box" style="height:220px"><canvas id="adChart"></canvas></div>` +
    `<div class="muted" style="margin-top:4px">>1 = sterker dan gemiddeld. Verdediging is geïnverteerd weergegeven (hoger = beter).</div></div>` +
    `</div>`;

  // Thuis/uit met index
  const thuisUit =
    `<div class="grid two">` +
    `<div class="card"><h2>Thuis &amp; uit ${tip('homeAway')}</h2>${homeAwayTable(ha)}` +
    `<div class="muted" style="margin-top:8px">Thuisvoordeel-index <b>${ds(Math.round(ha.homeAdvantageIndex * 100) / 100)}</b> ppd t.o.v. het poulegemiddelde (${n2(ha.leagueEdge)}). ${ha.homeAdvantageIndex > 0.15 ? 'Een échte thuistijger.' : ha.homeAdvantageIndex < -0.15 ? 'Presteert juist beter uit dan thuis.' : 'Meedeinend met het normale thuisvoordeel.'}</div>` +
    `<div class="muted">Reisprestatierang: <b>${ha.travelRank}/${ha.travelTeams}</b> op uit-punten per duel (1 = beste reisprestatie).</div></div>` +
    `<div class="card"><h2>Dumbbell thuis vs uit ${tip('dumbbell')}</h2>` +
    dumbbell('Punten per duel', ha.home.ppg, ha.away.ppg, 3, '') +
    dumbbell('Doelpunten voor', ha.home.gfPerGame, ha.away.gfPerGame, Math.max(3, ha.home.gfPerGame, ha.away.gfPerGame)) +
    dumbbell('Doelpunten tegen', ha.home.gaPerGame, ha.away.gaPerGame, Math.max(3, ha.home.gaPerGame, ha.away.gaPerGame)) +
    dumbbell('Winst %', ha.home.winPct * 100, ha.away.winPct * 100, 100, '%') +
    `</div>` +
    `</div>`;

  // Programmazwaarte
  const sosSection =
    `<div class="grid two">` +
    `<div class="card"><h2>Programmazwaarte ${tip('sos')}</h2>` +
    statRow('Gem. rating gespeeld', String(Math.round(sos.avgOpponentElo)), `zwaarte-rang ${sos.scheduleRank}/${teams.length}`) +
    statRow('Gem. rating restprogramma', String(Math.round(sos.avgRemainingElo)), `rang ${sos.remainingRank}/${teams.length}`) +
    statRow('Werkelijk PPD', n2(sos.actualPpg)) +
    statRow('Verwacht PPD', n2(sos.expectedPpg), 'op basis van tegenstandersterkte') +
    statRow('Gecorrigeerd PPD', n2(sos.adjustedPpg), 'beloont zwaar programma') +
    `</div>` +
    `<div class="card"><h2>Prestatie per tegenstanderklasse ${tip('opponentTier')}</h2>` +
    `<table><thead><tr><th>Klasse</th><th class="num">G</th><th class="num">W-G-V</th><th class="num">Doelen</th><th class="num">PPD</th></tr></thead><tbody>` +
    ([['Top', sos.tier.top], ['Middenmoot', sos.tier.mid], ['Onder', sos.tier.bottom]] as const)
      .map(([label, r]) =>
        `<tr><td>${label}</td><td class="num">${r.played}</td><td class="num">${r.won}-${r.drawn}-${r.lost}</td><td class="num">${r.goalsFor}-${r.goalsAgainst}</td><td class="num"><b>${n2(r.played ? (r.won * 3 + r.drawn) / r.played : 0)}</b></td></tr>`
      )
      .join('') +
    `</tbody></table></div>` +
    `</div>`;

  // Geluk & regressie
  const luckSection =
    `<div class="card"><h2>Geluk &amp; regressie ${tip('pythagorean')}</h2>` +
    bullet('Punten', luck.actualPoints, luck.expectedPoints, Math.max(luck.actualPoints, luck.expectedPoints, 1) * 1.05) +
    `<div class="grid kpi" style="margin-top:8px">` +
    kpiCard('Verwacht W%', pct(luck.pythWinRatio), `verwachte PPD ${n2(luck.expectedPpg)}`) +
    kpiCard('Geluk-index', ds(Math.round(luck.luck * 10) / 10), `rang ${luck.luckRank}/${teams.length}`) +
    kpiCard('1-doelpunt-zeges', `${luck.oneGoalWins}`, `${pct(luck.oneGoalWinShare)} van de zeges`) +
    kpiCard('Regressie', luck.regression === 'neerwaarts' ? '↓ terugval' : luck.regression === 'opwaarts' ? '↑ opmars' : '→ stabiel') +
    `</div></div>`;

  // Stijl
  const styleSection =
    `<div class="card"><h2>Stijlprofiel ${tip('style')}</h2>` +
    `<div class="grid kpi">` +
    kpiCard('Tempo', n1(style.tempo), 'doelpunten per duel') +
    kpiCard('Variantie voor', n1(style.varFor)) +
    kpiCard('Variantie tegen', n1(style.varAgainst)) +
    kpiCard('Grilligheid', n1(style.volatility)) +
    kpiCard('Archetype', arch ? arch.label : '—') +
    `</div></div>`;

  // Onderlinge historie over meerdere seizoenen
  const h2hRows = poule.teams
    .filter((t) => t.id !== team.id)
    .map((opp) => {
      const h2h = multiSeasonHeadToHead(teamKeyOf(team), teamKeyOf(opp), state.allPoules);
      return (
        `<tr><td><a href="#" data-team-link="${esc(opp.id)}">${short(opp)}</a></td>` +
        `<td>${h2h.warning ? `<span class="badge red">${h2h.meetings}× ⚠</span>` : `<span class="badge green">${h2h.meetings}×</span>`}</td>` +
        `<td class="num">${h2h.overall.won}-${h2h.overall.drawn}-${h2h.overall.lost}</td>` +
        `<td class="num">${h2h.overall.goalsFor}-${h2h.overall.goalsAgainst}</td>` +
        `<td class="num">${h2h.home.won}-${h2h.home.drawn}-${h2h.home.lost}</td>` +
        `<td class="num">${h2h.away.won}-${h2h.away.drawn}-${h2h.away.lost}</td>` +
        `<td class="muted">${h2h.warning ? esc(h2h.warning) : 'meerdere seizoenen'}</td></tr>`
      );
    })
    .join('');
  const h2hSection =
    `<div class="card"><h2>Onderlinge historie (meerdere seizoenen) ${tip('h2h')}</h2>` +
    `<div class="table-scroll"><table><thead><tr><th>Tegenstander</th><th>Duels</th><th class="num">Totaal W-G-V</th><th class="num">Doelen</th><th class="num">Thuis</th><th class="num">Uit</th><th>Betrouwbaarheid</th></tr></thead><tbody>${h2hRows}</tbody></table></div></div>`;

  // Voorspelling + hefboom van de volgende wedstrijd
  const nextMatch = matches
    .filter((m) => m.status === 'scheduled' && (m.homeTeamId === team.id || m.awayTeamId === team.id))
    .sort((a, b) => (a.kickoff || 0) - (b.kickoff || 0))[0];
  let nextPrediction = '';
  let leverageHtml = '';
  if (nextMatch) {
    const h = teamById(poule, nextMatch.homeTeamId);
    const a = teamById(poule, nextMatch.awayTeamId);
    const pr = predictAdvanced(h, a, teams, matches, { model: state.model });
    nextPrediction =
      `<div class="card">${predictionBlock(pr, nextMatch, { modelSelector: true })}</div>`;
    const lev = matchLeverage(team.id, nextMatch, teams, matches, { simulations: 500, metric: 'top' });
    const who = nextMatch.homeTeamId === team.id ? short(a) : short(h);
    leverageHtml =
      `<div class="muted">Hefboom (kans op top-${Math.max(1, teams.length > 6 ? 3 : 2)}-finish): winst ${pct(lev.win)} · gelijk ${pct(lev.draw)} · verlies ${pct(lev.loss)} → verschil <b>${pct1(lev.leverage)}</b> tussen winst en verlies tegen ${who}.</div>`;
  }

  // Vergelijking per tegenstander (bestaand)
  const rows = poule.teams
    .filter((t) => t.id !== team.id)
    .map((opp) => ({
      opp,
      our: teamRecordVsOpponent(team.id, opp.id, matches),
      oppVsRest: teamRecordVsOthers(opp.id, [team.id], matches),
      h2h: headToHead(team.id, opp.id, matches),
      chance: chanceVsOpponent(team.id, opp.id, teams, matches),
      str: computeStrength(opp.id, teams, matches),
    }))
    .sort((a, b) => b.chance.win - a.chance.win);

  const insight = (our: { played: number; won: number }, opp: { played: number; won: number }) => {
    if (our.played === 0) return { tone: 'neutral', text: 'Nog niet tegen dit team gespeeld' };
    const a = our.won / our.played;
    const b = opp.played ? opp.won / opp.played : 0;
    if (a > b + 0.15) return { tone: 'green', text: 'Doen we beter dan de rest van de poule' };
    if (b > a + 0.15) return { tone: 'red', text: 'Moeilijke tegenstander — sterker dan gemiddeld' };
    return { tone: 'neutral', text: 'Gelijkwaardig aan de rest van de poule' };
  };

  const compTable =
    `<div class="table-scroll"><table style="min-width:720px"><thead><tr><th>Tegenstander</th><th>Ons record</th><th>Zij tegen de rest</th><th>Kans</th><th>Uitslagen</th><th>Inzicht</th></tr></thead><tbody>` +
    rows
      .map(({ opp, our, oppVsRest, h2h, chance, str }) => {
        const i = insight(our, oppVsRest);
        const chips = h2h.map((r) => `<span class="${r.result}">${r.teamAGoals}-${r.teamBGoals}</span>`).join('');
        return (
          `<tr><td><a href="#" data-team-link="${esc(opp.id)}">${short(opp)}</a><div class="muted">sterkte ${Math.round(str.overall)}</div></td>` +
          `<td><b>${our.won}-${our.drawn}-${our.lost}</b> <span class="muted">(${our.played})</span><br>${our.goalsFor}-${our.goalsAgainst}</td>` +
          `<td><b>${oppVsRest.won}-${oppVsRest.drawn}-${oppVsRest.lost}</b> <span class="muted">(${oppVsRest.played})</span><br>${oppVsRest.goalsFor}-${oppVsRest.goalsAgainst}</td>` +
          `<td><b style="color:var(--green)">${pct(chance.win)}</b><div class="muted">G ${pct(chance.draw)} · V ${pct(chance.loss)}</div></td>` +
          `<td><span class="score-chips">${chips || '—'}</span></td>` +
          `<td><span class="badge ${i.tone}">${i.text}</span></td></tr>`
        );
      })
      .join('') +
    `</tbody></table></div>`;

  return (
    `<div class="section-title">Team · ${short(team)} ${formBadges(form)} ${tip('form')}</div>` +
    rosterSection(poule, team.id) +
    basicKpi +
    detailKpi +
    margins +
    momentumSection +
    `<div class="grid two">` +
    `<div class="card"><h2>Teamprofiel ${tip('teamStrength')}</h2><div class="chart-box"><canvas id="teamRadar"></canvas></div>${strengthBars(team, teams, matches)}</div>` +
    `<div class="card"><h2>Doelsaldo over tijd ${tip('goalDiffTimeline')}</h2><div class="chart-box"><canvas id="gdChart"></canvas></div></div>` +
    `</div>` +
    ratingsSection +
    thuisUit +
    sosSection +
    luckSection +
    styleSection +
    h2hSection +
    `<div class="section-title">Volgende wedstrijd · voorspelling ${tip('prediction')}</div>` +
    (nextMatch ? nextPrediction + leverageHtml : `<p class="muted">Geen geplande wedstrijden meer.</p>`) +
    `<div class="section-title">Vergelijking per tegenstander ${tip('opponentComparison')}</div>` +
    `<div class="card"><div class="chart-box" style="height:220px;max-width:380px;margin:0 auto"><canvas id="donut"></canvas></div><div style="overflow-x:auto">${compTable}</div></div>`
  );
}

// ---------- Modellen-view ----------
function modelsView(poule: Poule) {
  const teams = teamsArg(poule);
  const matches = matchesArg(poule);
  const standings = computeStandings(teams, matches);
  const ratings = computeRatingTable(teams, matches);
  const by = new Map(ratings.map((r) => [r.teamId, r]));

  const rank = (key: keyof (typeof ratings)[number], invert = false) => {
    const sorted = [...ratings].sort((a, b) => (invert ? (a[key] as number) - (b[key] as number) : (b[key] as number) - (a[key] as number)));
    return new Map(sorted.map((r, i) => [r.teamId, i + 1]));
  };
  const eloRank = rank('elo');
  const atkRank = rank('attack');
  const defRank = rank('defense', true);

  const table =
    `<div class="table-scroll"><table style="min-width:860px"><thead><tr>` +
    `<th>#</th><th>Team</th><th class="num">Elo</th><th class="num">Massey</th><th class="num">Colley</th><th class="num">B-T</th><th class="num">Pi</th>` +
    `<th class="num">Aanval</th><th class="num">Verded.</th><th class="num">Aanval thuis</th><th class="num">Verded. thuis</th><th class="num">Aanval uit</th><th class="num">Verded. uit</th>` +
    `</tr></thead><tbody>` +
    standings
      .map((s, i) => {
        const r = by.get(s.team.id)!;
        const cell = (v: number, rk: Map<string, number>, invert = false, digits = 2) => {
          const pos = rk.get(s.team.id)!;
          const color = pos === 1 ? 'var(--green)' : pos === ratings.length ? 'var(--red)' : '';
          return `<td class="num" style="color:${color}" title="rang ${pos}">${invert ? n2(v) : digits === 0 ? String(Math.round(v)) : n2(v)}</td>`;
        };
        return (
          `<tr><td class="num">${i + 1}</td><td><a href="#" data-team-link="${esc(s.team.id)}">${short(s.team)}</a></td>` +
          cell(r.elo, eloRank, false, 0) +
          `<td class="num">${n2(r.massey)}</td>` +
          `<td class="num">${n2(r.colley)}</td>` +
          `<td class="num">${n2(r.bradleyTerry)}</td>` +
          `<td class="num">${n2(r.pi)}</td>` +
          `<td class="num">${n2(r.attack)}×</td>` +
          `<td class="num">${n2(r.defense)}×</td>` +
          `<td class="num">${n2(r.attackHome)}×</td>` +
          `<td class="num">${n2(r.defenseHome)}×</td>` +
          `<td class="num">${n2(r.attackAway)}×</td>` +
          `<td class="num">${n2(r.defenseAway)}×</td></tr>`
        );
      })
      .join('') +
    `</tbody></table></div>`;

  return (
    `<div class="help">Vijf onafhankelijke ratings uit dezelfde uitslagen. <b>Elo</b> weegt doelsaldo en thuisvoordeel, <b>Massey</b> lost kleinste kwadraten op doelsaldo op, <b>Colley</b> gebruikt alleen winst/verlies (immuun voor 8–0), <b>Bradley-Terry</b> werkt met winstkansen en <b>Pi</b> past thuis/uit-ratings incrementeel aan. De coëfficiënten tonen hoeveel keer het competitiesgemiddelde een team scoort/incasseert.</div>` +
    `<div class="section-title">Sterkteratings per team</div><div class="card">${table}</div>` +
    `<div class="section-title">Tegenstander-gecorrigeerde kracht ${tip('attackDefense')}</div>` +
    `<div class="grid small">${standings
      .map((s) => {
        const r = by.get(s.team.id)!;
        return (
          `<div class="mini-card"><div class="mini-head"><b>${short(s.team)}</b><span class="mini-rank">${n2(r.attack)}× / ${n2(r.defense)}×</span></div>` +
          `<div class="mini-sub">Aanval: thuis ${n2(r.attackHome)}× · uit ${n2(r.attackAway)}×</div>` +
          `<div class="mini-sub">Verdediging: thuis ${n2(r.defenseHome)}× · uit ${n2(r.defenseAway)}×</div></div>`
        );
      })
      .join('')}</div>`
  );
}

// ---------- Voorspelling-view ----------
function predictionView(poule: Poule) {
  const teams = teamsArg(poule);
  const matches = matchesArg(poule);
  const scheduled = matches
    .filter((m) => m.status === 'scheduled')
    .sort((a, b) => (a.kickoff || 0) - (b.kickoff || 0));
  const all = [...scheduled, ...matches.filter((m) => m.status === 'played')];
  if (!all.length) return `<p class="muted">Geen wedstrijden beschikbaar.</p>`;

  const currentId = state.matchId && all.some((m) => m.id === state.matchId) ? state.matchId : all[0].id;
  const match = all.find((m) => m.id === currentId)!;
  const h = teamById(poule, match.homeTeamId);
  const a = teamById(poule, match.awayTeamId);
  const pr = predictAdvanced(h, a, teams, matches, { model: state.model });

  const options =
    `<div class="select-row"><label>Wedstrijd</label><select id="matchSelect">` +
    all
      .map(
        (m) =>
          `<option value="${esc(m.id)}" ${m.id === currentId ? 'selected' : ''}>${m.status === 'played' ? '✔ ' : ''}${short(teamById(poule, m.homeTeamId))} – ${short(teamById(poule, m.awayTeamId))}${m.round ? ' (R' + m.round + ')' : ''} ${fdate(m.kickoff)}</option>`
      )
      .join('') +
    `</select></div>`;

  const modelOptions = `<div class="select-row"><label>Model</label><div class="seg">${MODELS.map(
    (m) => `<button class="seg-btn ${state.model === m.id ? 'active' : ''}" data-model="${m.id}">${m.label}</button>`
  ).join('')}</div></div>`;

  const info =
    pr.model === 'dixon-coles'
      ? `Dixon-Coles-correctie ρ = ${n2(pr.rho)} (herstelt de onderschatting van 0–0, 1–0, 0–1 en 1–1).`
      : pr.model === 'negbin'
        ? `Negatief-binomiaal met overdispersie φ = ${n2(pr.dispersion)} (vangt grote krachtsverschillen in amateurklassen op).`
        : pr.model === 'bivariate'
          ? `Bivariaat Poisson: expliciete correlatie tussen beide scores.`
          : `Onafhankelijk Poisson-model.`;

  return (
    options +
    modelOptions +
    `<div class="muted" style="margin:-2px 0 6px">Welk model past bij deze wedstrijd? ${tip('predictiveModels')}</div>` +
    `<div class="section-title">Voorspelling · ${short(h)} – ${short(a)} ${tip('prediction')}</div>` +
    `<div class="card">${predictionBlock(pr, match)}</div>` +
    `<div class="muted" style="margin-top:6px">${esc(info)}</div>`
  );
}

// ---------- Scenario-view ----------
const scenarioCache = new Map<string, ScenarioResult>();

function getScenario(poule: Poule): ScenarioResult {
  const cached = scenarioCache.get(poule.id);
  if (cached) return cached;
  const topCut = poule.teams.length > 6 ? 3 : 2;
  const result = simulateSeason(poule.teams, poule.matches, { simulations: 1200, seed: 7, topCut, bottomCut: 1 });
  scenarioCache.set(poule.id, result);
  return result;
}

const leverageCache = new Map<string, ReturnType<typeof matchLeverage>>();

function scenarioView(poule: Poule) {
  const teams = teamsArg(poule);
  const matches = matchesArg(poule);
  const scenario = getScenario(poule);
  const by = new Map(scenario.teams.map((t) => [t.teamId, t]));
  const oursTeam = ours(poule);

  const table =
    `<div class="table-scroll"><table><thead><tr><th>Team</th><th class="num">Kampioen</th><th class="num">Top-${scenario.topCut}</th><th class="num">Degradatie</th><th class="num">Punten (gem.)</th><th class="num">P10–P90</th></tr></thead><tbody>` +
    teams
      .map(
        (t) => {
          const s = by.get(t.id)!;
          return (
            `<tr><td><a href="#" data-team-link="${esc(t.id)}">${short(t)}</a></td>` +
            `<td class="num"><b>${pct(s.champion)}</b></td><td class="num">${pct(s.top)}</td><td class="num">${pct(s.bottom)}</td>` +
            `<td class="num">${n1(s.pointsMean)}</td><td class="num">${s.pointsP10}–${s.pointsP90}</td></tr>`
          );
        }
      )
      .join('') +
    `</tbody></table></div>`;

  let leverage = '';
  if (oursTeam) {
    const upcoming = matches
      .filter((m) => m.status === 'scheduled' && (m.homeTeamId === oursTeam.id || m.awayTeamId === oursTeam.id))
      .sort((a, b) => (a.kickoff || 0) - (b.kickoff || 0))
      .slice(0, 4);
    const rows = upcoming
      .map((m) => {
        const key = poule.id + '|' + m.id;
        let lev = leverageCache.get(key);
        if (!lev) {
          lev = matchLeverage(oursTeam.id, m, teams, matches, { simulations: 500, metric: 'top' });
          leverageCache.set(key, lev);
        }
        const opp = teamById(poule, m.homeTeamId === oursTeam.id ? m.awayTeamId : m.homeTeamId);
        return (
          `<tr><td>${short(opp)} <span class="muted">${m.homeTeamId === oursTeam.id ? '(thuis)' : '(uit)'}</span></td>` +
          `<td class="num">${pct(lev.win)}</td><td class="num">${pct(lev.draw)}</td><td class="num">${pct(lev.loss)}</td>` +
          `<td class="num"><b style="color:${lev.leverage >= 0 ? 'var(--green)' : 'var(--red)'}">${pct1(lev.leverage)}</b></td></tr>`
        );
      })
      .join('');
    leverage = `<div class="section-title">Hefboom per resterend duel ${tip('leverage')}</div>` +
      `<div class="card"><div class="table-scroll"><table><thead><tr><th>Tegenstander</th><th class="num">Kans bij winst</th><th class="num">bij gelijk</th><th class="num">bij verlies</th><th class="num">Hefboom</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted">Geen resterende duels.</td></tr>'}</tbody></table></div></div>`;
  }

  return (
    `<div class="help">Monte Carlo-simulatie van het restseizoen (${scenario.simulations.toLocaleString('nl-NL')} runs). Elk resterend duel wordt gesampled uit het Dixon-Coles-model; daarna wordt de eindstand opgemaakt. <b>Top-${scenario.topCut}</b> = play-off/ promotieplaatsen, <b>degradatie</b> = onderste plaats. De banden tonen de 10e–90e percentiel van het puntenaantal.</div>` +
    `<div class="section-title">Kansen op de eindstand</div><div class="card">${table}</div>` +
    `<div class="grid two">` +
    `<div class="card"><h2>Positieverdeling ${tip('positionDist')}</h2><div class="chart-box"><canvas id="posChart"></canvas></div></div>` +
    `<div class="card"><h2>Puntenwaaier ${tip('fanChart')}</h2><div class="chart-box"><canvas id="fanChart"></canvas></div></div>` +
    `</div>` +
    leverage
  );
}

// ---------- Charts ----------
let charts: Chart[] = [];
const chartColor = (i: number) =>
  ['#16a34a', '#2563eb', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981', '#f97316', '#0ea5e9', '#ec4899', '#14b8a6'][i % 10];

function parseJSON<T>(id: string, fallback: T): T {
  const el = document.getElementById(id);
  if (!el) return fallback;
  try {
    return JSON.parse(el.textContent || '') as T;
  } catch {
    return fallback;
  }
}

function destroyCharts() {
  charts.forEach((c) => c.destroy());
  charts = [];
}

function initOverviewCharts(poule: Poule) {
  const goals = document.getElementById('goalsChart') as HTMLCanvasElement | null;
  if (!goals) return;
  const teams = poule.teams;
  const aggs = teams.map((t) => {
    const m = poule.matches.filter((x) => x.status === 'played' && (x.homeTeamId === t.id || x.awayTeamId === t.id));
    let gf = 0,
      ga = 0;
    for (const x of m) {
      if (x.homeTeamId === t.id) {
        gf += x.homeScore || 0;
        ga += x.awayScore || 0;
      } else {
        gf += x.awayScore || 0;
        ga += x.homeScore || 0;
      }
    }
    const n = m.length;
    return { name: t.shortName || t.name, voor: n ? +(gf / n).toFixed(2) : 0, tegen: n ? +(ga / n).toFixed(2) : 0 };
  });
  charts.push(
    new Chart(goals, {
      type: 'bar',
      data: {
        labels: aggs.map((a) => a.name),
        datasets: [
          { label: 'Voor (gem.)', data: aggs.map((a) => a.voor), backgroundColor: '#16a34a' },
          { label: 'Tegen (gem.)', data: aggs.map((a) => a.tegen), backgroundColor: '#ef4444' },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
    })
  );
}

const labelPlugin = {
  id: 'pointLabels',
  afterDatasetsDraw(chart: any) {
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillStyle = '#334155';
    chart.data.datasets.forEach((ds: any, di: number) => {
      const meta = chart.getDatasetMeta(di);
      meta.data.forEach((pt: any, i: number) => {
        const label = ds.data[i] && ds.data[i].label;
        if (label) ctx.fillText(label, pt.x + 5, pt.y + 3);
      });
    });
    ctx.restore();
  },
};

function initPouleCharts(poule: Poule) {
  const teams = poule.teams;

  const bumpEl = document.getElementById('bumpChart') as HTMLCanvasElement | null;
  const bumpData = parseJSON<{ rounds: number[]; positions: Record<string, (number | null)[]> }>('bumpData', { rounds: [], positions: {} });
  if (bumpEl && bumpData.rounds.length) {
    const datasets = teams.map((t, i) => ({
      label: t.shortName || t.name,
      data: bumpData.positions[t.id] || [],
      borderColor: chartColor(i),
      backgroundColor: chartColor(i),
      tension: 0.25,
      pointRadius: 2,
      borderWidth: 2,
    }));
    charts.push(
      new Chart(bumpEl, {
        type: 'line',
        data: { labels: bumpData.rounds.map((r) => 'R' + r), datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { reverse: true, min: 0.5, max: teams.length + 0.5, ticks: { stepSize: 1 } } },
        },
      })
    );
  }

  const quadEl = document.getElementById('quadChart') as HTMLCanvasElement | null;
  const quadData = parseJSON<Array<{ x: number; y: number; label: string }>>('quadData', []);
  if (quadEl && quadData.length) {
    charts.push(
      new Chart(quadEl, {
        type: 'scatter',
        data: { datasets: [{ data: quadData, backgroundColor: teams.map((_, i) => chartColor(i)), pointRadius: 6 }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => `${c.raw.label}: aanval ${c.raw.x.toFixed(2)}×, verdediging ${(1 / c.raw.y).toFixed(2)}×` } } },
          scales: {
            x: { title: { display: true, text: 'Aanval (× gemiddelde)' } },
            y: { title: { display: true, text: 'Verdediging (hoger = beter)' } },
          },
        },
        plugins: [labelPlugin],
      })
    );
  }

  const histEl = document.getElementById('histChart') as HTMLCanvasElement | null;
  const histData = parseJSON<Array<{ label: string; count: number }>>('histData', []);
  if (histEl && histData.length) {
    charts.push(
      new Chart(histEl, {
        type: 'bar',
        data: { labels: histData.map((h) => h.label), datasets: [{ label: 'Wedstrijden', data: histData.map((h) => h.count), backgroundColor: '#2563eb' }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
      })
    );
  }
}

function initTeamCharts(poule: Poule, team: PouleTeam) {
  const teams = poule.teams;
  const strength = computeStrength(team.id, teams, poule.matches);

  const radar = document.getElementById('teamRadar') as HTMLCanvasElement | null;
  if (radar) {
    charts.push(
      new Chart(radar, {
        type: 'radar',
        data: {
          labels: ['Aanval', 'Verdediging', 'Algemeen'],
          datasets: [
            { label: 'Dit team', data: [strength.attack, strength.defense, strength.overall], backgroundColor: 'rgba(22,163,74,.35)', borderColor: '#16a34a' },
            { label: 'Poule-gem.', data: [50, 50, 50], backgroundColor: 'rgba(148,163,184,.2)', borderColor: '#94a3b8' },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { r: { min: 0, max: 100 } } },
      })
    );
  }

  const gd = document.getElementById('gdChart') as HTMLCanvasElement | null;
  if (gd) {
    const gdMap = goalDiffByRound(team.id, poule.matches);
    const rounds = roundNumbers(poule.matches);
    let last = 0;
    const vals = rounds.map((r) => {
      if (gdMap.has(r)) last = gdMap.get(r) as number;
      return last;
    });
    charts.push(
      new Chart(gd, {
        type: 'line',
        data: { labels: rounds.map((r) => 'R' + r), datasets: [{ label: team.shortName || team.name, data: vals, borderColor: '#16a34a', fill: true, backgroundColor: 'rgba(22,163,74,.12)', tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false },
      })
    );
  }

  const momEl = document.getElementById('momentumChart') as HTMLCanvasElement | null;
  if (momEl) {
    const mom = computeMomentum(team.id, poule.matches);
    const labels = mom.rollingPpg.map((_, i) => 'D' + (i + 1));
    charts.push(
      new Chart(momEl, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Rolling PPD (5)', data: mom.rollingPpg, borderColor: '#16a34a', tension: 0.3, pointRadius: 2 },
            { label: 'EWMA-vorm', data: mom.ewmaSeries, borderColor: '#2563eb', borderDash: [6, 4], pointRadius: 0 },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, suggestedMax: 3 } } },
      })
    );
  }

  const gdMom = document.getElementById('gdMomentChart') as HTMLCanvasElement | null;
  if (gdMom) {
    const mom = computeMomentum(team.id, poule.matches);
    charts.push(
      new Chart(gdMom, {
        type: 'line',
        data: { labels: mom.rollingGd.map((_, i) => 'D' + (i + 1)), datasets: [{ label: 'Rolling doelsaldo', data: mom.rollingGd, borderColor: '#f59e0b', tension: 0.3, pointRadius: 2 }] },
        options: { responsive: true, maintainAspectRatio: false },
      })
    );
  }

  const adEl = document.getElementById('adChart') as HTMLCanvasElement | null;
  if (adEl) {
    const r = computeRatingTable(teams, poule.matches).find((x) => x.teamId === team.id)!;
    charts.push(
      new Chart(adEl, {
        type: 'bar',
        data: {
          labels: ['Aanval', 'Verdediging', 'Aanval thuis', 'Verded. thuis', 'Aanval uit', 'Verded. uit'],
          datasets: [
            {
              label: '× gemiddelde',
              data: [r.attack, 2 - r.defense, r.attackHome, 2 - r.defenseHome, r.attackAway, 2 - r.defenseAway],
              backgroundColor: ['#16a34a', '#0ea5e9', '#22c55e', '#38bdf8', '#84cc16', '#7dd3fc'],
            },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
      })
    );
  }

  const donut = document.getElementById('donut') as HTMLCanvasElement | null;
  if (donut) {
    const rows = poule.teams
      .filter((t) => t.id !== team.id)
      .map((t) => ({ name: t.shortName || t.name, value: chanceVsOpponent(team.id, t.id, teams, poule.matches).win }))
      .sort((a, b) => b.value - a.value);
    charts.push(
      new Chart(donut, {
        type: 'doughnut',
        data: { labels: rows.map((r) => r.name), datasets: [{ data: rows.map((r) => r.value), backgroundColor: rows.map((_, i) => chartColor(i)) }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (c: any) => ' ' + pct(c.parsed) } } } },
      })
    );
  }
}

function initScenarioCharts(poule: Poule) {
  const scenario = getScenario(poule);
  const teams = poule.teams;
  const by = new Map(scenario.teams.map((t) => [t.teamId, t]));

  const posEl = document.getElementById('posChart') as HTMLCanvasElement | null;
  if (posEl) {
    const datasets = Array.from({ length: scenario.positions }, (_, p) => ({
      label: `#${p + 1}`,
      data: teams.map((t) => by.get(t.id)!.positionDist[p] || 0),
      backgroundColor: `hsl(${140 - p * (120 / Math.max(1, scenario.positions - 1))}, 65%, ${45 + p * 3}%)`,
      stack: 'pos',
    }));
    charts.push(
      new Chart(posEl, {
        type: 'bar',
        data: { labels: teams.map((t) => t.shortName || t.name), datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: { stacked: true }, y: { stacked: true, max: 1, ticks: { callback: (v: any) => Math.round(v * 100) + '%' } } },
        },
      })
    );
  }

  const fanEl = document.getElementById('fanChart') as HTMLCanvasElement | null;
  if (fanEl) {
    charts.push(
      new Chart(fanEl, {
        type: 'line',
        data: {
          labels: teams.map((t) => t.shortName || t.name),
          datasets: [
            { label: 'P90', data: teams.map((t) => by.get(t.id)!.pointsP90), borderColor: 'rgba(37,99,235,.5)', borderDash: [5, 4], pointRadius: 0, tension: 0.3 },
            { label: 'Gemiddeld', data: teams.map((t) => by.get(t.id)!.pointsMean), borderColor: '#2563eb', borderWidth: 3, pointRadius: 3, tension: 0.3 },
            { label: 'P10', data: teams.map((t) => by.get(t.id)!.pointsP10), borderColor: 'rgba(37,99,235,.5)', borderDash: [5, 4], pointRadius: 0, tension: 0.3 },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
      })
    );
  }
}

function initCharts(poule: Poule, team: PouleTeam | null) {
  destroyCharts();
  if (state.view === 'overzicht') initOverviewCharts(poule);
  else if (state.view === 'poule') initPouleCharts(poule);
  else if (state.view === 'team' && team) initTeamCharts(poule, team);
  else if (state.view === 'scenario') initScenarioCharts(poule);
}

// ---------- Tooltips ----------
let hideActiveTooltip: () => void = () => {};

/**
 * Zwevende, grote infobox. Door `position: fixed` op documentniveau wordt de
 * uitleg nooit afgeknipt door scrollende tabellen of kaarten.
 */
function initTooltips() {
  const pop = document.createElement('div');
  pop.className = 'tip-pop';
  pop.style.display = 'none';
  document.body.appendChild(pop);
  let current: HTMLElement | null = null;

  const position = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    let left = r.left + r.width / 2 - pw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    let top = r.top - ph - 12;
    if (top < 8) top = Math.min(window.innerHeight - ph - 8, r.bottom + 12);
    pop.style.left = left + 'px';
    pop.style.top = Math.max(8, top) + 'px';
  };

  const show = (el: HTMLElement) => {
    const tpl = el.querySelector('template');
    if (!tpl) return;
    current = el;
    pop.innerHTML = tpl.innerHTML;
    pop.style.display = 'block';
    position(el);
  };

  const hide = () => {
    current = null;
    pop.style.display = 'none';
  };
  hideActiveTooltip = hide;

  const closestTip = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    return el && el.closest ? (el.closest('.tip') as HTMLElement | null) : null;
  };

  document.addEventListener('mouseover', (e) => {
    const el = closestTip(e.target);
    if (el && el !== current) show(el);
  });
  document.addEventListener('mouseout', (e) => {
    const el = closestTip(e.target);
    if (el && el === current) {
      const related = (e as MouseEvent).relatedTarget as Node | null;
      if (!related || !pop.contains(related)) hide();
    }
  });
  document.addEventListener('focusin', (e) => {
    const el = closestTip(e.target);
    if (el) show(el);
  });
  document.addEventListener('focusout', () => hide());
  window.addEventListener('scroll', () => { if (current) position(current); }, true);
  window.addEventListener('resize', () => { if (current) position(current); });
  pop.addEventListener('mouseleave', () => { if (current) hide(); });
}

// ---------- Events ----------
function attachHandlers(poule: Poule) {
  document.querySelectorAll<HTMLElement>('[data-team]').forEach((b) => {
    b.onclick = () => {
      state.teamId = b.dataset.team || null;
      state.view = 'team';
      render();
    };
  });
  document.querySelectorAll<HTMLElement>('[data-team-link]').forEach((a) => {
    a.onclick = (e) => {
      e.preventDefault();
      state.teamId = a.dataset.teamLink || null;
      state.view = 'team';
      render();
    };
  });
  document.querySelectorAll<HTMLElement>('[data-back]').forEach((b) => {
    b.onclick = () => {
      state.teamId = null;
      state.view = 'overzicht';
      render();
    };
  });
  document.querySelectorAll<HTMLElement>('[data-view]').forEach((b) => {
    b.onclick = () => {
      state.view = (b.dataset.view as View) || 'overzicht';
      if (state.view !== 'team') state.teamId = null;
      render();
    };
  });
  document.querySelectorAll<HTMLElement>('[data-model]').forEach((b) => {
    b.onclick = () => {
      state.model = (b.dataset.model as ModelKind) || 'dixon-coles';
      render();
    };
  });
  const matchSelect = document.getElementById('matchSelect') as HTMLSelectElement | null;
  if (matchSelect) {
    matchSelect.onchange = () => {
      state.matchId = matchSelect.value;
      render();
    };
  }
}

function render() {
  hideActiveTooltip();
  const app = document.getElementById('app') as HTMLElement;
  const poule = getPoule();
  if (!poule) {
    app.innerHTML =
      `<div class="help">Open een <b>team/poule-pagina op voetbal.nl</b> en klik op de knop <b>“📊 Maak poule-dashboard”</b>.</div>` +
      `<div class="card"><p class="muted">Er is nog geen poule opgeslagen. Klik in het popup-menu of op de groene knop op een voetbal.nl-team-pagina.</p></div>`;
    return;
  }
  const team = state.teamId ? poule.teams.find((t) => t.id === state.teamId) || null : null;
  if (state.view === 'team' && !team) state.view = 'overzicht';

  let body: string;
  switch (state.view) {
    case 'poule':
      body = pouleView(poule);
      break;
    case 'modellen':
      body = modelsView(poule);
      break;
    case 'voorspelling':
      body = predictionView(poule);
      break;
    case 'scenario':
      body = scenarioView(poule);
      break;
    case 'team':
      body = team ? teamView(poule, team) : overview(poule);
      break;
    default:
      body = overview(poule);
  }
  app.innerHTML = header(poule) + body;
  attachHandlers(poule);
  initCharts(poule, team);
}

async function init() {
  const params = new URLSearchParams(location.search);
  state.pouleId = params.get('poule');
  const team = params.get('team');
  if (team) {
    state.teamId = team;
    state.view = 'team';
  }
  const d = await new Promise<Record<string, Poule>>((res) =>
    chrome.storage.local.get('poules', (x: { poules?: Record<string, Poule> }) => res(x.poules || {}))
  );
  state.poules = d;
  state.allPoules = Object.values(d);
  initTooltips();
  render();
}

init();
