// Tests voor de gedeelde scrape-parsers (lib/scrape.ts → extension/poule-scrape.js).
// Die parsers worden door het content script én het dashboard gebruikt, dus dit is de plek waar
// de afspraken met de markup van voetbal.nl vastliggen: teamnamen koppelen aan team-id's,
// programma en uitslagen ontdubbelen, en afgeschermde/onbekende regels overslaan.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const { PouleScrape } = (() => {
  const context = {
    DOMParser: class { parseFromString(html) { return docs[html] || { querySelectorAll: () => [] }; } },
  };
  vm.runInNewContext(readFileSync('extension/poule-scrape.js', 'utf8'), context);
  return context;
})();

// Objecten uit de vm hebben een andere realm-prototype; even kaal maken zodat
// deepStrictEqual er gewoon naar kan kijken.
const kaal = (x) => JSON.parse(JSON.stringify(x));

/** Klein knoopje met dezelfde api als een echt DOM-element. */
const knoop = (text, attrs = {}, kinderen = {}) => ({
  textContent: text,
  getAttribute: (naam) => (naam in attrs ? attrs[naam] : null),
  querySelector: (sel) => kinderen[sel] ?? null,
  querySelectorAll: (sel) => kinderen[sel] ?? [],
});

const standRij = (naam, id, pos) =>
  knoop('', { href: '/team/' + id }, {
    '.value.team': knoop(naam),
    '.value.position': knoop(pos),
    '.value.logo img': knoop('', { src: '/logo/' + id + '.png' }),
  });

const wedstrijdRij = (id, thuis, uit, uitslag) =>
  knoop('', { href: '/wedstrijd/' + id }, {
    '.value.home .team': knoop(thuis),
    '.value.away .team': knoop(uit),
    '.value.center': knoop(uitslag),
  });

const blok = (datum, ronde, rijen) =>
  knoop('', {}, {
    '.header .title': knoop(datum),
    '.header .subtitle': knoop(ronde),
    '.row': rijen,
  });

const docs = {
  STAND: {
    querySelectorAll: (sel) => (sel === '.table-standingstable .row'
      ? [knoop('', { href: '#/' }, { '.value.team': knoop('Team') }), standRij('Barendrecht O13-1', 'T1', '1'), standRij('RBC O13-1', 'T2', '2')]
      : []),
  },
  PROGRAMMA: {
    querySelectorAll: (sel) => (sel === '.table-timetable'
      ? [blok('Zaterdag 12 september 2026', 'Ronde 3', [
          wedstrijdRij('w1', 'Barendrecht O13-1', 'RBC O13-1', '2 - 1'),
          wedstrijdRij('w2', 'RBC O13-1', 'Barendrecht O13-1', ''),
          wedstrijdRij('w3', 'Barendrecht O13-1', 'Onbekende Club O13-1', ''),
        ])]
      : []),
  },
  UITSLAGEN: {
    querySelectorAll: (sel) => (sel === '.table-timetable'
      ? [blok('Zaterdag 12 september 2026', 'Ronde 3', [wedstrijdRij('w1', 'Barendrecht O13-1', 'RBC O13-1', '2 - 1')])]
      : []),
  },
  MENU: {
    querySelectorAll: (sel) => (sel === '.ScheduleResults-viewSelectTrigger'
      ? [
          knoop('', { href: '/team/T1/stand/competitie-najaar' }, { span: knoop('Competitie najaar') }),
          knoop('', { href: '/team/T1/stand/beker' }, { span: knoop('Beker') }),
          knoop('', { href: '/team/T1/stand/beker' }, { span: knoop('Beker') }),
        ]
      : []),
  },
};

test('parsePoule koppelt teamnamen aan id\'s en ontdubbelt programma en uitslagen', () => {
  const { teams, matches } = PouleScrape.parsePoule({ stand: 'STAND', programma: 'PROGRAMMA', uitslagen: 'UITSLAGEN' }, 'T1');
  assert.deepEqual(kaal(teams.map((t) => [t.id, t.name, t.shortName, t.ours])), [
    ['T1', 'Barendrecht O13-1', 'Barendrecht', true],
    ['T2', 'RBC O13-1', 'RBC', false],
  ]);
  // w1 staat op beide tabbladen (maar één keer), w2 is nog niet gespeeld, w3 heeft een
  // tegenstander die niet in de stand staat en valt af.
  assert.deepEqual(kaal(matches.map((m) => [m.id, m.homeTeamId, m.awayTeamId, m.homeScore, m.awayScore, m.status, m.round])), [
    ['w1', 'T1', 'T2', 2, 1, 'played', 3],
    ['w2', 'T2', 'T1', null, null, 'scheduled', 3],
  ]);
  assert.equal(matches[0].kickoff, Date.UTC(2026, 8, 12, 12, 0, 0));
  assert.equal(teams[0].logo, '/logo/T1.png');
});

test('parseCompetitions leest het competitiemenu en laat dubbelen weg', () => {
  assert.deepEqual(kaal(PouleScrape.parseCompetitions(docs.MENU)), [
    { slug: 'competitie-najaar', label: 'Competitie najaar' },
    { slug: 'beker', label: 'Beker' },
  ]);
});

test('parseNLDate en parseRound verdragen ontbrekende gegevens', () => {
  assert.equal(PouleScrape.parseNLDate('Zaterdag 5 september 2026'), Date.UTC(2026, 8, 5, 12, 0, 0));
  assert.equal(PouleScrape.parseNLDate('nog onbekend'), null);
  assert.equal(PouleScrape.parseNLDate(''), null);
  assert.equal(PouleScrape.parseRound('Ronde 12'), 12);
  assert.equal(PouleScrape.parseRound(''), null);
});
