# Chrome Web Store — indienmap

Deze map bevat alles wat je nodig hebt om **Voetbal.nl Poule Dashboard** in de
Chrome Web Store te publiceren: de teksten, de beeldmerken, de privacy- en
permissie-onderbouwing en de ZIP die je uploadt.

Het uploadbare pakket maak je met:

```bash
pnpm bump           # vraagt oude + nieuwe versie, werkt manifest.json/package.json bij en maakt de zip
pnpm package        # of: alleen bouwen + zippen met de huidige versie
```

`pnpm bump` is de aanbevolen route bij een update: het vraagt het oude en nieuwe
versienummer, controleert dat de nieuwe versie hoger is, werkt
`extension/manifest.json` + `package.json` bij, draait typecheck + build en zet
de ZIP in `store/dist/`. Daarna hoef je alleen die ZIP nog te uploaden.

---

## Structuur

```
store/
├── README.md                     ← dit bestand (checklist)
├── privacy-policy.md             ← brontekst van het privacybeleid
├── listing/
│   ├── name.txt                  ← winkelnaam
│   ├── short-description.txt     ← korte beschrijving (max 132 tekens)
│   ├── detailed-description.txt  ← uitgebreide beschrijving
│   ├── category-and-urls.md      ← categorie, taal, URL's
│   └── screenshots.md            ← eisen + opnamelijst voor screenshots
├── compliance/
│   ├── single-purpose.md         ← "single purpose"-verklaring
│   ├── permission-justifications.md ← uitleg per permissie
│   └── data-usage.md             ← invulhulp voor het tabblad Gegevensgebruik
├── assets/
│   ├── icon.svg                  ← bronvector van het icoon
│   ├── icon-512.png
│   ├── store-icon-128.png        ← winkelicoon (verplicht)
│   ├── promo-tile-440x280.png    ← kleine promotietegel
│   └── marquee-1400x560.png      ← marquee
├── screenshots/                  ← hier komen de echte screenshots
│   └── README.md
└── dist/                         ← ZIP-uitvoer (niet in git)
```

---

## Checklist vóór indiening

### Al geregeld in de repo
- [x] `manifest_version: 3`
- [x] Iconen in `extension/icons/` (16/32/48/128) + verwijzing in `manifest.json`
- [x] `action.default_icon` ingesteld
- [x] Onnodige `tabs`-permissie verwijderd (alleen `storage` + host `voetbal.nl`)
- [x] Winkelteksten, categorie en URL's voorbereid
- [x] Privacybeleid + single-purpose + permissie-onderbouwing voorbereid
- [x] Beeldmerken (icoon, promo-tegel, marquee) gegenereerd
- [x] `pnpm package` maakt de upload-ZIP met `manifest.json` in de root
- [x] Geen remote code, geen `eval`, geen externe scripts (MV3-conform)

### Nog te doen (deels via het dashboard)
- [x] **Screenshots** gemaakt (5 × 1280×800) — in `store/screenshots/`
- [x] **Privacybeleid online** (GitHub blob-URL) en ingevuld in het dashboard
- [ ] **GitHub Pages** aanzetten voor een schonere URL (optioneel, zie hieronder)
- [ ] **Trader-status (DSA)** verklaren in het dashboard (verplicht voor EU-distributie)
- [ ] **2-stapsverificatie** op het Google-account aan hebben staan
- [x] ZIP geüpload, listing + privacy + distributie ingevuld
- [x] **Ingediend ter beoordeling** — status: *Wacht op beoordeling* (met automatisch publiceren na goedkeuring)
- [ ] Bij elke update: `pnpm bump` draaien (bumpt `manifest.json` + `package.json` en maakt de zip)

> **Item in het dashboard:** `abcobomhkkmchncifpbchjijgacejaeg`
> (`Voetbal.nl Poule Dashboard`) — ingediend op 10 september 2026.

---

## Stap voor stap in het Developer Dashboard

1. **Nieuw item** → ZIP uit `store/dist/` uploaden.
2. **Store listing** invullen:
   - Naam, korte + uitgebreide beschrijving (zie `listing/`).
   - Categorie **Sport** (of **Productiviteit**), taal **Nederlands**.
   - Winkelicoon `assets/store-icon-128.png`.
   - Screenshots uit `store/screenshots/`.
   - Promo-tegel en marquee (optioneel, wel aanbevolen).
3. **Privacy practices** invullen:
   - Single purpose (`compliance/single-purpose.md`).
   - Rechtvaardiging per permissie (`compliance/permission-justifications.md`).
   - Remote code: **Nee**.
   - Gegevensgebruik + privacybeleid-URL (`compliance/data-usage.md`).
4. **Distribution**:
   - Zichtbaarheid: Openbaar (of Unlisted).
   - Alle regio's of gericht; prijs: gratis.
   - Trader-status (DSA) verklaren.
5. **Submit for review**. Review duurt doorgaans enkele dagen.

> Tip: houd bij een update altijd de **zelfde extensie-ID** aan (niet opnieuw
> als nieuw item uploaden). Draai `pnpm bump`, dat verhoogt `version` in
> `extension/manifest.json` + `package.json` en maakt de nieuwe ZIP.

---

## Een update uitbrengen

1. `pnpm bump` — vul de oude (huidige winkel)versie en de nieuwe versie in.
2. De ZIP staat daarna in `store/dist/voetbal-poule-dashboard-<nieuwe-versie>.zip`.
3. Chrome Web Store-dashboard → **het bestaande item** → *Nieuw pakket uploaden* → kies die ZIP.
4. Controleer eventueel de listing/screenshots en klik op **Submit for review**.
5. Commit `extension/manifest.json` + `package.json` (de ZIP zelf staat in `.gitignore`).
