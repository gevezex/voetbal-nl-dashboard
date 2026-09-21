# AGENTS.md

Chrome-extensie (Manifest V3) die van elke KNVB-jeugdpoule op voetbal.nl een statistisch
analyse-dashboard maakt. De extensie leest de poule rechtstreeks uit de eigen, ingelogde
browsersessie; alle data blijft lokaal in `chrome.storage`.

## Setup en commando's

- Dependencies: `pnpm install`
- Extensiebundel bouwen: `pnpm build:ext` (esbuild: `extension-src/dashboard.ts` + `lib/` → `extension/dashboard.js`, en `lib/scrape.ts` → `extension/poule-scrape.js` als globale `PouleScrape` voor het content script)
- Typecheck: `pnpm typecheck`
- Tests: `node tests/<naam>.test.cjs` (er is géén test-script in `package.json`)
- Alle tests: `for f in tests/*.test.cjs; do node "$f"; done`
- Release: `pnpm bump <versie>` — werkt `extension/manifest.json` + `package.json` bij, draait
  typecheck en zet de uploadbare zip in `store/dist/`

## Projectstructuur

- `extension/` — de geladen extensie (`manifest.json`, `content.js`, `background.js`, `popup.*`, `dashboard.*`, `poule-storage.js`)
- `extension-src/dashboard.ts` — bron van het dashboard (het enige TypeScript-bestand van de UI)
- `lib/stats/` — pure statistiek (`compute.ts`, `analytics.ts`); `lib/tips.ts` — infoboxteksten; `lib/scrape.ts` — pure HTML-parsers van voetbal.nl (gedeeld door content script en dashboard)
- `scripts/` — build-, package- en release-hulpjes
- `tests/` — tests met `node:test`
- `store/` — Chrome Web Store-materiaal; `store/dist/` (gitignored) bevat de zip; `docs/` — GitHub Pages (privacybeleid)
- `.dev/` — lokale dev-hulpjes (CDP-scripts, screenshots, Chrome-profiel); gitignored

## Werkwijze

- **Maak altijd eerst een feature branch vanaf `main` voordat je wijzigingen maakt** — nooit
  direct op `main` werken. Bijv. `git checkout -b feature/<onderwerp>`; daarna in logische
  commits werken en met `--no-ff` terugmergen naar `main`, zoals in de bestaande historie.
- Committen en pushen alleen wanneer de gebruiker dat vraagt.
- Draai vóór elke commit `pnpm typecheck` én de tests; beide moeten groen zijn.
- `extension/dashboard.js` en `extension/poule-scrape.js` zijn **gegenereerde** bestanden: na elke
  wijziging in `extension-src/` of `lib/` opnieuw `pnpm build:ext` draaien en de bundels meecommitten.
- De HTML van voetbal.nl wordt op één plek geparseerd (`lib/scrape.ts`): het content script krijgt
  die parsers via `extension/poule-scrape.js`, het dashboard importeert ze rechtstreeks. Voeg daar
  geen tweede kopie van toe.
- Versiebeleid: één versie per release; bumpen met `pnpm bump` in plaats van losse edits.

## Codestijl

- TypeScript strict (`tsconfig.json`), 2 spaties, puntkomma's, enkele quotes.
- Commentaar en documentatie in het Nederlands; identifiers en bestandsnamen in het Engels.
- `extension/content.js` en `extension/background.js` zijn bewust plain JS (geen bundel):
  geen TypeScript-syntax gebruiken, en ze moeten ook los parseerbaar blijven voor de tests.
- UI-teksten in eenvoudig Nederlands, in dezelfde toon als `lib/tips.ts`.

## Tests

- Framework: `node:test` in `tests/*.test.cjs`, met `vm` + stubs voor `chrome`, `document` en `fetch`.
- Voeg bij elke bugfix een regressietest toe in dezelfde stijl (zie
  `tests/background-open-dashboard.test.cjs` en `tests/content-save-fallback.test.cjs`).
- Alle tests moeten groen zijn vóór een commit.

## Verifiëren in een echte browser

- Chrome met CDP: `--remote-debugging-port=9333 --user-data-dir="$PWD/.dev/chrome-profile" --no-first-run --enable-unsafe-extension-debugging`
- `--load-extension` werkt niet in Chrome 153: laad de extensie via CDP `Extensions.loadUnpacked`.
- `.dev/chrome-profile` bevat een ingelogde voetbal.nl-sessie — **niet wissen**; hij is nodig om
  de echte flow te testen.
- Handige scripts: `.dev/real-flow.mjs` (end-to-end + vergelijking met de officiële stand),
  `.dev/verify-matrix*.mjs` (matrixmetingen en screenshots), `.dev/stand-check.mjs` (console/netwerk).
- Let op: na het herladen van de extensie is een open `dashboard.html`-tab orphaned (geen
  `chrome.*`-API's meer) — tab sluiten en opnieuw openen.

## Beveiliging

- Nooit secrets committen; `.env*` staat in `.gitignore`.
- De extensie draait volledig lokaal: geen server, geen scraping buiten de eigen sessie, niets
  wordt naar buiten gestuurd. Zie `SCRAPING.md` en de privacyverklaring in `store/`.
