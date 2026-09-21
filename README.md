# <img src="store/assets/icon.svg" width="32" height="32" alt=""> Voetbal.nl Poule Dashboard — Chrome-extensie

Een **Chrome-extensie (Manifest V3)** die van elke **KNVB-jeugdpoule** op
[voetbal.nl](https://www.voetbal.nl) een compleet analyse-dashboard maakt. De extensie leest de
poule rechtstreeks uit je **eigen, ingelogde browsersessie** — geen server, geen scraping-scripts en
geen Chrome DevTools Protocol nodig. Je Cloudflare-clearance en KNVB-login werken automatisch.

> **Status:** werkend. De extensie leest de tabs **stand / programma / uitslagen** en (per club) de
> **Team**-tab, slaat alles lokaal op in `chrome.storage` en opent een analyse-dashboard met de
> volledige statistiek-catalogus.

## ✨ Wat het dashboard biedt

De header heeft **vijf views** (tabbladen):

- **Overzicht** — poulekop, kern-KPI's, de stand met de **volledige teamnaam** (net als op
  voetbal.nl, inclusief leeftijdssuffix zoals *Feyenoord O13-2*), de **doelpunten voor (DV) en
  tegen (DT)** als totaal, **sparklines** van het puntenverloop, **small multiples** van alle
  teams, gemiddelde doelpunten per wedstrijd en de komende speelronde met kans op
  winst/gelijk/verlies.
- **Poule-analyse** — **bump chart** (positieverloop per speelronde), **kwadrant-scatter**
  aanval × verdediging, **archetype-clustering**, doelpunten-**histogram** en de
  **uitslagen-matrix** van alle onderlinge duels, met **schuine teamnamen** boven de kolommen
  (zoals op voetbal.nl) zodat de matrix zonder scrollen past.
- **Modellen** — alle sterkeratings naast elkaar: **Elo, Massey, Colley, Bradley-Terry en Pi**,
  plus de **aanval-/verdedigingscoëfficiënten** totaal en apart thuis/uit.
- **Voorspelling** — kies een wedstrijd en een model (**Poisson, Dixon-Coles, bivariaat,
  negatief-binomiaal**) en zie de volledige **kansmatrix**, 1X2, over/under, BTTS en verwachte punten.
- **Scenario** — **Monte Carlo** van het restseizoen (kampioens-, top- en degradatiekansen), de
  positieverdeling, de puntenwaaier en de **hefboom** per resterend duel.
- **Per team** — meteen na de KPI's de **uitslagenlijst**: alle gespeelde duels van dit team in deze
  competitie of beker, nieuwste bovenaan. Daaronder, achter een duidelijke **scheidingslijn per
  fase**, ook de wedstrijden uit de andere competities van dat team (de beker naast de competitie,
  of de vorige fase). Die haalt het dashboard automatisch op — één keer per team — en ze zijn puur
  ter weergave: ze tellen **niet** mee in de statistieken of modellen. Verder de
  volledige catalogus: uitgebreide basis-KPI's, thuis/uit + thuisvoordeel-index +
  dumbbell, momentum (rolling/EWMA/reeksen/omslagpunt), sterkteratings, programmazwaarte, geluk &
  regressie (Pythagorean), stijl & archetype, multi-seizoens **onderlinge historie** met
  steekproefwaarschuwing, de geavanceerde voorspelling van de volgende wedstrijd en de **hefboom**,
  naast de bestaande radar, doelsaldo-over-tijd en **vergelijking per tegenstander** met een
  gestapelde winst/gelijk/verlies-balk per tegenstander.

## 🚀 Installeren

De extensie is beschikbaar in de [Chrome Web Store](https://chromewebstore.google.com/detail/voetbal-poule-dashboard/abcobomhkkmchncifpbchjijgacejaeg).

Installeer je dashboard als volgt:

1. Open de pagina van **Voetbal.nl Poule Dashboard** in de Chrome Web Store met Google Chrome op je computer.
2. Klik op **Toevoegen aan Chrome**.
3. Bekijk de gevraagde machtigingen en bevestig met **Extensie toevoegen**.
4. Klik rechtsboven in Chrome op het **puzzelstukje** (Extensies) en pin **Voetbal.nl Poule Dashboard**
   met het speldje, zodat je het icoon altijd in de werkbalk ziet.
5. Ga naar [voetbal.nl](https://www.voetbal.nl), log in en open een team/poule-pagina.
   Klik rechtsonder op **Maak poule-dashboard** om te beginnen.

## 🧑‍🏫 Gebruiken

1. Ga op voetbal.nl (ingelogd) naar een **team/poule-pagina**.
2. Rechtsonder verschijnt de knop **"📊 Maak poule-dashboard"**.
3. Klik → kies de **competitie** (bijv. Beker of Competitie najaar). De extensie leest de tabs
   **stand / programma / uitslagen** en (voor elke club in de poule) de **Team**-tab voor de
   selectie, slaat alles lokaal op en opent het **dashboard** in een nieuw tabblad.
4. Via het **extensie-icoon** (popup) zie je opgeslagen poules en kun je ze opnieuw openen.
   Met **Knop op voetbal.nl** zet je de zwevende knop aan of uit. Deze instelling blijft bewaard,
   ook na het herstarten van Chrome. **Alles verwijderen** wist alle lokaal opgeslagen dashboards.
   Opnieuw ophalen werkt de bestaande poule bij; team, competitie en seizoen blijven apart.

> 💡 Alle data blijft lokaal in `chrome.storage`; je sessie wordt nooit gedeeld. Alleen **Chrome
> (MV3)**.

## 🛠️ Installeren voor developers

```bash
pnpm install
pnpm build:ext   # bundelt extension-src/dashboard.ts + lib/ + Chart.js → extension/dashboard.js
```

Daarna in **Chrome**:

1. Open `chrome://extensions`.
2. Zet rechtsboven **"Ontwikkelaarsmodus"** aan.
3. Klik **"Uitgepakte extensie laden"** en kies de map **`extension/`**.

### Beschikbare commando's

| Commando          | Beschrijving                                                        |
| ----------------- | ------------------------------------------------------------------- |
| `pnpm build:ext`  | De extensie-bundel (`extension/dashboard.js`) opnieuw genereren.    |
| `pnpm typecheck`  | TypeScript-controle over `lib/` en `extension-src/`.                |
| `pnpm bump`       | Interactief: versie bumpen, bouwen en de Web Store-zip klaarzetten. |

## 📊 Analyse-catalogus

Alle analyses zitten in **`lib/stats/`** (pure functies) en worden door het dashboard gebruikt.

1. **Basis-KPI's per team** — punten/duel, doelpunten voor/tegen per duel, doelsaldo, W/G/V-%,
   clean sheets, duels zonder te scoren, grootste zege en nederlaag, meest voorkomende uitslag,
   gemiddeld totaal, % beide teams scoren, % boven 2,5 en de verdeling van winstmarges.
   (`computeTeamKpis`)
2. **Thuis/uit-splitsing** — alles apart, plus een **thuisvoordeel-index** (verschil in ppd t.o.v.
   het competitiesgemiddelde) en de **reisprestatierang**. (`homeAwayAnalysis`)
3. **Vorm en momentum** — vormstring, voortschrijdend gemiddelde van punten en doelsaldo,
   **exponentieel gewogen vorm (EWMA)**, momentum-delta, huidige/langste reeksen en
   **breukpuntdetectie**. (`computeMomentum`)
4. **Sterkteratings** — **Elo** (doelsaldo-aanpassing + thuisvoordeel), **Massey** (kleinste
   kwadraten op doelsaldo), **Colley** (alleen winst/verlies), **Bradley-Terry**, **Pi-ratings** en
   de **aanval-/verdedigingscoëfficiënten** apart thuis/uit. (`computeRatingTable`)
5. **Voorspellende modellen** — **Poisson**, **Dixon-Coles** (ρ via grid-search), **bivariaat
   Poisson** en **negatief-binomiaal**, met volledige kansmatrix + 1X2, over/under, BTTS en
   verwachte punten. (`predictAdvanced`)
6. **Correctie voor programmazwaarte** — gemiddelde rating van gespeelde/restende tegenstanders,
   verwachte en gecorrigeerde punten per duel en prestaties per tegenstanderklasse.
   (`strengthOfSchedule`)
7. **Geluk en regressie** — **Pythagorean expectation** (exponent 1,3) tegenover de werkelijke
   punten als **geluk-index**, met een terugval-signaal bij veel nipte zeges. (`luckAnalysis`)
8. **Stijlprofilering uit alleen uitslagen** — wedstrijdtempo, variantie/grilligheid en
   **k-means-archetypen**. (`styleProfile`, `clusterArchetypes`)
9. **Onderlinge historie** — over meerdere opgeslagen competities/seizoenen, thuis/uit, met een
   expliciete **steekproefwaarschuwing**. (`multiSeasonHeadToHead`)
10. **Scenario en hefboom** — **Monte Carlo** van het restseizoen met kampioens-, top- en
    degradatiekansen, positieverdeling en puntenwaaier; en de **hefboom** per duel.
    (`simulateSeason`, `matchLeverage`)
11. **Uitslagen per fase** — de pure functies achter de uitslagenlijst in de teamview: alle
    gespeelde duels van één ploeg (nieuwste eerst) en de duels uit de andere fases van die ploeg
    (beker, vorige competitie), inclusief het label, de sortering en het ontdubbelen van een fase
    die zowel opgeslagen als opgehaald is. **Alleen weergave**: deze duels worden nergens anders in
    de statistieken, ratings of modellen meegenomen. (`teamResults`, `previousPhaseResults`)
12. **Visualisaties** — heatmap (kansmatrix + uitslagen-matrix), bump chart, kwadrant-scatter,
    radar, sparklines, bullet charts, dumbbell, waaierdiagram, histogram en small multiples.

## 📁 Projectstructuur

```
extension/                 # de geladen Chrome-extensie (MV3)
  manifest.json            #      perms + content_script op voetbal.nl
  content.js               #      knop + competitiemenu + poule-tabs & selectie uitlezen
  background.js, popup.*   #      service worker + popup (opgeslagen poules)
  dashboard.html/css/js    #      het dashboard (dashboard.js is de esbuild-bundel)
  poule-scrape.js          #      scrape-parsers voor het content script (gegenereerd, zie lib/scrape.ts)
extension-src/
  dashboard.ts             #      broncode van het extensie-dashboard (→ pnpm build:ext)
lib/
  tips.ts                  #      infobox-teksten (eenvoudig Nederlands)
  scrape.ts                #      pure parsers voor de HTML van voetbal.nl (content script + dashboard)
  stats/compute.ts         #      basis: stand, vorm, sterkte, eenvoudige Poisson-voorspelling
  stats/analytics.ts       #      volledige catalogus: KPI's, ratings, modellen, SOS, geluk, scenario
scripts/
  build-extension.mjs      #      extensie bundelen (esbuild)
```

`lib/` en `extension-src/` zijn de enige TypeScript-bronnen; `extension/dashboard.js` en
`extension/poule-scrape.js` zijn **gegenereerde** bestanden die je met `pnpm build:ext` opnieuw
maakt na wijzigingen.

## 🏪 Publiceren naar de Chrome Web Store

Alles wat je voor de winkel nodig hebt staat in **[`store/`](./store/README.md)**
(teksten, iconen, privacybeleid, permissie-onderbouwing en de checklist).

```bash
pnpm bump         # vraagt oude/nieuwe versie, werkt de versie bij, bouwt en maakt de zip
pnpm package      # bouwt de extensie en maakt store/dist/voetbal-poule-dashboard-<versie>.zip
pnpm release      # typecheck + package
pnpm assets:generate   # iconen/promotiebeelden opnieuw genereren (vereist rsvg-convert)
```

Voor een nieuwe winkelversie: `pnpm bump` → het genoemde ZIP-bestand in `store/dist/`
uploaden op het **bestaande** item in het Chrome Web Store-dashboard.

Het privacybeleid staat in `store/privacy-policy.md` en als kant-en-klare
GitHub Pages-pagina in `docs/privacy.html`.

## 🛠️ Tech-stack

- **Chrome Manifest V3** (content script + service worker + popup).
- **TypeScript** voor de statistiek-kern en de dashboard-logica.
- **Chart.js** voor de grafieken.
- **esbuild** voor het bundelen van de extensie.

## 📌 Notities & beperkingen

- **Divisie/klasse:** voetbal.nl toont de KNVB-divisie alleen als subtitel op de
  Programma-/Uitslagen-tabs (bijv. "Onder 13 Zaterdag – Divisie 3 B NAJAAR"). De beker heeft zo'n
  divisie niet.
- **Afgeschermde namen:** spelers/staf met een verborgen naam worden overgeslagen.
- **Resultaatletters:** overal Nederlands **W / G / V**.
- **Voorspelling:** het model toont een volledige kansmatrix (incl. verwacht aantal doelpunten),
  maar geen één blind voorspeld doelsaldo; de nadruk ligt op kansen en onzekerheid.
- **Prestatie:** bij het aanmaken van een dashboard doet de extensie één netwerkverzoek per team
  (voor de selectie) — bij veel teams duurt de eerste keer iets langer. Daarna staat alles in
  `chrome.storage`.
- **Andere competities in de teamview:** open je een team, dan haalt het dashboard één keer de
  andere competities van dat team op bij voetbal.nl (drie verzoeken per extra competitie: het
  competitiemenu, de stand en de uitslagen) en toont die onder een scheidingslijn. Dat gebeurt met
  je eigen sessie, het resultaat blijft in het geheugen van het dashboardtabblad, en het komt in
  géén enkele statistiek of model terecht. Tijdens het ophalen staat er een **voortgangsindicator**
  ("Oude uitslagen ophalen… Beker"); is er niets te halen, dan zegt de sectie dat er geen andere
  competities zijn. Lukt het ophalen niet (geen sessie of storing), dan blijft de lijst staan met
  wat er al bekend is.
- **Databron/autorisatie:** de extensie draait in jouw eigen browser en gebruikt je eigen sessie.
  Zie [SCRAPING.md](./SCRAPING.md) voor details en gebruiksvoorwaarden.
- **Na een update van de extensie:** een voetbal.nl-tab die al openstond, is zijn verbinding met de
  extensie kwijt (Chrome noemt dat *extension context invalidated*). De knop zegt dan
  **"🔄 Herlaad deze pagina"** — herlaad de pagina (F5) en het werkt weer. Dat is normaal
  Chrome-gedrag bij elke update of herlaadbeurt.

## 📈 Roadmap

- [x] Uitslagen en standen direct uit de ingelogde voetbal.nl-sessie lezen
- [x] Volledige analyse-catalogus (KPI's, thuis/uit-index, momentum, ratings, Dixon-Coles,
      programmazwaarte, geluk/regressie, archetypen, multi-seizoens-H2H, Monte Carlo + hefboom)
- [x] Visualisaties: bump chart, kwadrant-scatter, heatmap, sparklines, bullet, dumbbell, waaier,
      histogram en small multiples
- [x] Uitgebreide infoboxen (ⓘ) in begrijpelijke taal
- [ ] Automatische parser die elke gescrapte poule zonder tussenstappen omzet
- [ ] Koppeling met de betaalde KNVB Data Service API als alternatief
- [ ] Doelpuntenmomenten (bijv. per helft) en vergelijking tussen meerdere categorieën
