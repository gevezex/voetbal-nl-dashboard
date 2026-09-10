# Gegevensgebruik (Privacy practices → Data usage)

Het dashboard stelt tijdens het indienen een reeks vragen. Hieronder wat je
invult en waarom.

## Kernpunt

De extensie **verstuurt niets** naar een server. Alle verwerking en opslag
gebeurt lokaal in de browser (`chrome.storage.local`). Er is geen analytics,
geen tracking, geen account en geen backend.

## Vraag: "Does this item collect or use user data?"

De Chrome Web Store verstaat onder "collect" het overbrengen van data van het
apparaat naar een server. Dat doen wij niet. Toch is het verstandig transparant
te zijn over de **websitepagina's die lokaal worden gelezen**.

Aanbevolen invulling:

| Datacategorie | Aanvinken? | Toelichting |
| --- | --- | --- |
| Personally identifiable information | **Nee**\* | Namen van spelers/staf staan alleen lokaal, worden niet verzonden. |
| Health information | Nee | — |
| Financial and payment information | Nee | — |
| Authentication information | Nee | De extensie gebruikt je bestaande voetbal.nl-sessie, maar leest of bewaart geen inloggegevens. |
| Personal communications | Nee | — |
| Location | Nee | — |
| Web history | **Nee**\* | Alleen voetbal.nl-pagina's die je zelf opent; niet verzonden. |
| User activity | Nee | — |
| Website content | **Ja** (transparant) | De inhoud van de voetbal.nl-pagina's (stand, uitslagen, selectie) wordt gelezen om het dashboard te maken; lokaal, niet verzonden. |

\* Als het formulier niet toestaat dat je "Nee" kiest terwijl je wel
webpagina-inhoud leest, kies dan de dichtstbijzijnde categorie en gebruik de
toelichting hierboven. Het belangrijkste is dat je aangeeft **lokaal, zonder
transmissie**.

## Vraag: "Is your extension using remote code?"

**Nee.** Alle code (inclusief Chart.js) is meegebundeld in `dashboard.js`.

## Certificeringen (aanvinken)

- [x] Ik verkoop of deel geen gebruikersgegevens aan derden.
- [x] Ik gebruik of draag geen gegevens over voor doeleinden die geen verband
      houden met de kernfunctionaliteit.
- [x] Ik gebruik of draag geen gegevens over om kredietwaardigheid te bepalen of
      voor geldleningen.

## Privacybeleid-URL

Verplicht invullen zodra je aangeeft gegevens te verwerken:

`https://gevezex.github.io/voetbal-nl-dashboard/privacy.html`

(of de GitHub-URL naar `store/privacy-policy.md`, zie
`listing/category-and-urls.md`).
