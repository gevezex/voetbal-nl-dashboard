// Tests voor de uitslagenlijst in de teamview: de duels van de huidige fase plus
// (alleen ter weergave) de duels uit eerder opgeslagen fases.
// De pure logica staat in TypeScript (lib/stats/analytics.ts); die bundelen we
// hier met esbuild naar CommonJS zodat we hem zonder browser kunnen testen.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');

function loadAnalytics() {
  const out = buildSync({
    entryPoints: ['lib/stats/analytics.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    target: 'es2020',
  });
  const mod = { exports: {} };
  new Function('module', 'exports', out.outputFiles[0].text)(mod, mod.exports);
  return mod.exports;
}

const { teamResults, previousPhaseResults, phaseLabel } = loadAnalytics();

const team = (id, name, club) => ({ id, slug: id, name, shortName: name, club: club || name });
const played = (id, homeTeamId, awayTeamId, homeScore, awayScore, kickoff, round = null) => ({
  id,
  round,
  kickoff,
  homeTeamId,
  awayTeamId,
  homeScore,
  awayScore,
  status: 'played',
});
const scheduled = (id, homeTeamId, awayTeamId, kickoff) => ({
  id,
  round: null,
  kickoff,
  homeTeamId,
  awayTeamId,
  homeScore: null,
  awayScore: null,
  status: 'scheduled',
});

const A = team('T1', 'Barendrecht O13-1');
const B = team('T2', 'RBC O13-1');
const C = team('T3', 'FC Skillz O13-1');

test('teamResults geeft alleen de eigen gespeelde duels, nieuwste bovenaan', () => {
  const rows = teamResults('T1', [A, B, C], [
    played('m1', 'T1', 'T2', 2, 1, 1000, 1),
    scheduled('m3', 'T1', 'T3', 5000),
    played('m4', 'T2', 'T3', 1, 1, 2000),
    played('m2', 'T2', 'T1', 0, 3, 3000, 2),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.matchId, r.home, r.opponentId, r.goalsFor, r.goalsAgainst, r.result, r.round]),
    [
      ['m2', false, 'T2', 3, 0, 'W', 2],
      ['m1', true, 'T2', 2, 1, 'W', 1],
    ]
  );
  assert.equal(rows[0].opponentName, 'RBC O13-1');
});

test('teamResults telt verlies en gelijkspel goed en zet duels zonder datum onderaan', () => {
  const rows = teamResults('T1', [A, B], [
    played('m1', 'T1', 'T2', 0, 2, null),
    played('m2', 'T2', 'T1', 1, 1, 4000),
  ]);
  assert.deepEqual(rows.map((r) => [r.matchId, r.result]), [
    ['m2', 'G'],
    ['m1', 'V'],
  ]);
});

test('phaseLabel valt terug op de competitienaam als die ontbreekt', () => {
  assert.equal(phaseLabel({ season: '2026/2027', competition: 'Beker', teams: [], matches: [] }), 'Beker · 2026/2027');
  assert.equal(phaseLabel({ season: '2025/2026', teams: [], matches: [] }), 'Competitie · 2025/2026');
  assert.equal(phaseLabel({ season: '', competition: 'Beker', teams: [], matches: [] }), 'Beker');
});

const current = {
  id: 'poule:huidig',
  season: '2026/2027',
  name: 'Barendrecht O13-1 · Competitie najaar',
  competition: 'Competitie najaar',
  competitionSlug: 'competitie-najaar',
  ourTeamId: 'T1',
  updatedAt: '2026-09-21T11:17:28.131Z',
  teams: [A, B],
  matches: [played('c1', 'T1', 'T2', 2, 1, 9000, 1)],
};

const beker = {
  id: 'poule:beker',
  season: '2026/2027',
  name: 'Barendrecht O13-1 · Beker',
  competition: 'Beker',
  competitionSlug: 'beker',
  ourTeamId: 'T1',
  updatedAt: '2026-09-21T11:03:36.397Z',
  teams: [A, C],
  matches: [played('b1', 'T3', 'T1', 1, 4, 5000, 1), played('b2', 'T1', 'T3', 2, 2, 6000, 2)],
};

test('previousPhaseResults toont de andere fase van dezelfde teampagina, nieuwste eerst', () => {
  const blocks = previousPhaseResults(A, current, [current, beker]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].label, 'Beker · 2026/2027');
  assert.deepEqual(blocks[0].rows.map((r) => [r.matchId, r.goalsFor, r.goalsAgainst, r.result]), [
    ['b2', 2, 2, 'G'],
    ['b1', 4, 1, 'W'],
  ]);
});

test('previousPhaseResults slaat de huidige poule, vreemde teampagina\'s en lege fases over', () => {
  const andereTeampagina = { ...beker, id: 'poule:ander', ourTeamId: 'T99' };
  const zonderOns = { ...beker, id: 'poule:zonder-ons', teams: [B, C], matches: [played('x', 'T2', 'T3', 1, 0, 7000)] };
  const zonderUitslagen = { ...beker, id: 'poule:leeg', matches: [scheduled('y', 'T1', 'T3', 8000)] };
  const blocks = previousPhaseResults(A, current, [current, andereTeampagina, zonderOns, zonderUitslagen]);
  assert.deepEqual(blocks, []);
});

test('previousPhaseResults sorteert fases op de meest recente speeldag', () => {
  const oud = {
    id: 'poule:oud',
    season: '2025/2026',
    competition: 'Competitie najaar',
    competitionSlug: 'competitie-najaar',
    ourTeamId: 'T1',
    updatedAt: '2025-12-01T10:00:00.000Z',
    teams: [A, B],
    matches: [played('o1', 'T1', 'T2', 1, 0, 1000)],
  };
  const blocks = previousPhaseResults(A, current, [current, beker, oud]);
  assert.deepEqual(blocks.map((b) => b.label), ['Beker · 2026/2027', 'Competitie najaar · 2025/2026']);
});

test('previousPhaseResults herkent dezelfde ploeg aan de clubnaam als het id verschilt', () => {
  const vorigSeizoen = {
    id: 'poule:vorig',
    season: '2025/2026',
    competition: 'Competitie najaar',
    competitionSlug: 'competitie-najaar',
    ourTeamId: 'T1',
    updatedAt: '2025-12-01T10:00:00.000Z',
    teams: [team('T7', 'Barendrecht O12-1'), B],
    matches: [played('v1', 'T7', 'T2', 3, 1, 4000)],
  };
  const blocks = previousPhaseResults(A, current, [current, vorigSeizoen]);
  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0].rows.map((r) => [r.matchId, r.goalsFor, r.goalsAgainst]), [['v1', 3, 1]]);
});

test('previousPhaseResults slaat een fase over die niet bij deze ploeg hoort', () => {
  const vreemdePoule = { ...beker, id: 'poule:ander-team', ourTeamId: 'T99', teams: [B, C] };
  const blocks = previousPhaseResults(A, current, [current, vreemdePoule]);
  assert.deepEqual(blocks, []);
});

test('previousPhaseResults toont de huidige competitie niet als "vorige fase"', () => {
  const dubbel = { ...current, id: 'poule:kopie', updatedAt: '2026-09-22T10:00:00.000Z' };
  const blocks = previousPhaseResults(A, current, [current, dubbel]);
  assert.deepEqual(blocks, []);
});

test('dezelfde fase uit twee poules (opgeslagen + opgehaald) verschijnt maar één keer', () => {
  const opgehaald = { ...beker, id: 'fase:T1:beker', ourTeamId: 'T1', updatedAt: '' };
  const blocks = previousPhaseResults(A, current, [current, beker, opgehaald]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].id, 'poule:beker', 'de opgeslagen poule wint van de opgehaalde fase');
  assert.equal(blocks[0].slug, 'beker');
});

test('dezelfde competitieslug uit een ouder seizoen blijft een eigen fase', () => {
  const vorigeNajaar = {
    ...current,
    id: 'poule:vorig-najaar',
    season: '2025/2026',
    competitionSlug: 'competitie-najaar',
    updatedAt: '2025-12-01T10:00:00.000Z',
    matches: [played('vn1', 'T1', 'T2', 2, 2, 1000)],
  };
  const blocks = previousPhaseResults(A, current, [current, beker, vorigeNajaar]);
  assert.deepEqual(blocks.map((b) => b.label), ['Beker · 2026/2027', 'Competitie najaar · 2025/2026']);
});

test('opgehaalde fase van een andere ploeg werkt via het team-id van de teampagina', () => {
  // Zo komt een fase binnen die het dashboard zelf bij voetbal.nl ophaalt: ourTeamId = het team.
  const opgehaald = {
    id: 'fase:T2:beker',
    season: '2026/2027',
    competition: 'Beker',
    competitionSlug: 'beker',
    ourTeamId: 'T2',
    updatedAt: '',
    teams: [B, C],
    matches: [played('ob1', 'T2', 'T3', 3, 3, 7000)],
  };
  // B is een ander team dan A, en de poule hoort bij B's teampagina.
  const blocks = previousPhaseResults(B, current, [current, opgehaald]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].label, 'Beker · 2026/2027');
  assert.deepEqual(blocks[0].rows.map((r) => [r.matchId, r.goalsFor, r.goalsAgainst, r.result]), [['ob1', 3, 3, 'G']]);
});
