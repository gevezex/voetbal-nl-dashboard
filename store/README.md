# Chrome Web Store — indienmap

Deze map bevat alles wat je nodig hebt om **Voetbal Poule Dashboard** in de
Chrome Web Store te publiceren: de teksten, de beeldmerken, de privacy- en
permissie-onderbouwing en de ZIP die je uploadt.

Het uploadbare pakket maak je met:

```bash
pnpm package        # bouwt de extensie en zet store/dist/voetbal-poule-dashboard-<versie>.zip klaar
```

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
- [ ] Na goedkeuring: versie bumpen (`manifest.json` + `package.json`) bij elke update

> **Item in het dashboard:** `abcobomhkkmchncifpbchjijgacejaeg`
> (`Voetbal Poule Dashboard`) — ingediend op 10 september 2026.

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
> als nieuw item uploaden) en verhoog `version` in `extension/manifest.json`.
