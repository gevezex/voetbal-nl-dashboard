# Permissie-onderbouwing

Vul deze teksten in bij **Privacy practices → Permission justification** (per
permissie). De dashboardvelden zijn Engelstalig; hieronder staat per permissie
een Engelse tekst om te plakken plus een Nederlandse toelichting.

De extensie vraagt alleen:

- `storage`
- host permission: `https://www.voetbal.nl/*`
- content script op `https://www.voetbal.nl/team/*`

> De `tabs`-permissie is verwijderd: `chrome.tabs.create()` werkt zonder die
> permissie en wordt alleen gebruikt om het dashboard in een nieuw tabblad te
> openen. Zo blijft de permissielijst zo klein mogelijk.

---

## `storage`

**English:**
```
Used to store the pool data the user asked to analyse (teams, matches, standings
and team selection) locally in chrome.storage.local, so the dashboard can be
reopened without fetching the pages again. The data never leaves the user's
device and the user can clear it at any time.
```

**Nederlands:** nodig om de geanalyseerde poule lokaal te bewaren zodat het
dashboard direct opnieuw te openen is. Niets wordt verstuurd.

---

## Host permission `https://www.voetbal.nl/*`

**English:**
```
The extension only works on voetbal.nl. On a team/pool page the content script
adds a "Create dashboard" button and, after the user clicks it and picks a
competition, reads the stand / programma / uitslagen / team tabs of that same
voetbal.nl page using the user's own logged-in session. Access is limited to
www.voetbal.nl.
```

**Nederlands:** de extensie draait uitsluitend op voetbal.nl, voegt daar de knop
toe en leest op verzoek van de gebruiker de tabs stand/programma/uitslagen/team
met de eigen sessie. Geen toegang tot andere sites.

---

## Content script match `https://www.voetbal.nl/team/*`

**English:**
```
Injects the small "Create dashboard" button into voetbal.nl team/pool pages that
the user visits. The button does nothing until the user clicks it.
```

**Nederlands:** toont de knop op team-/poulepagina's; doet niets zonder klik.

---

## Geen remote code

**English:**
```
No. All JavaScript is bundled in the package. The extension does not load or
execute any remote code and contains no eval().
```

**Nederlands:** alle code zit in het pakket; geen remote code, geen `eval`.
