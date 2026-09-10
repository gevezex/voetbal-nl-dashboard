# 📡 Databron: uitslagen lezen uit voetbal.nl

De extensie haalt de poule **rechtstreeks uit je eigen, ingelogde browsersessie** op
voetbal.nl. Er is geen server, geen aparte scraper en geen Chrome DevTools Protocol (CDP) nodig:
de extensie draait in jouw browser, dus je KNVB-login en de Cloudflare-clearance werken automatisch.

## Hoe de extensie data leest

Op een **team/poule-pagina** injecteert het content script een groene knop
**"📊 Maak poule-dashboard"**. Na het kiezen van een competitie worden — met `fetch(..., {
credentials: 'include' })` — de volgende server-gerenderde tabbladen opgehaald en met de DOM
geparseerd:

| Tab | Wat eruit wordt gehaald |
| --- | --- |
| `/stand` | de teams in de poule (naam, id, logo) → de standtabel opbouwen |
| `/programma` | de nog te spelen duels (datum, ronde, teams) |
| `/uitslagen` | de gespeelde duels met eindstand |
| `/team` (per club) | de selectie: **staf** en **spelers** (foto's + namen) |

Belangrijke details:

- **Alleen uitslagen en selectie.** Er worden geen goal-momenten of line-ups gelezen; alle
  analyses rekenen op eindstanden (zie de catalogus in de README).
- **Afgeschermde namen** (spelers/staf die dat wensen) worden overgeslagen.
- **Deduplicatie** van wedstrijden gebeurt op het wedstrijd-id uit de link.
- **Ronde en datum** worden uit de kop van elk programma-/uitslagenblok gehaald; een tijd
  ("10:15") wordt niet als uitslag gezien, een uitslag ("3 - 3") wel.
- De **klasse/divisie** staat als subtitel op de Programma-/Uitslagen-tabs (bijv.
  "Divisie 3 B NAJAAR"); bij de beker ontbreekt die.

## Opslag

Alles blijft **lokaal** in `chrome.storage.local` onder de sleutel `poules`, per poule
gescheiden op id. Er wordt niets naar buiten gestuurd en je sessie/cookies worden nooit gedeeld.
Via het extensie-icoon (popup) kun je opgeslagen poules opnieuw openen.

## Opnieuw bundelen

Na wijzigingen aan `extension-src/dashboard.ts` of de statistiek-kern in `lib/`:

```bash
pnpm build:ext
```

Daarna in Chrome: `chrome://extensions` → **"Uitgepakte extensie laden"** → kies de map
**`extension/`**.

## Gebruiksvoorwaarden

Dit is een persoonlijk/coach-gebruiksscenario: de extensie leest pagina's die je zelf in je
browser mag bekijken. Houd je aan de gebruiksvoorwaarden van voetbal.nl en deel opgeslagen data
niet breder dan nodig.
