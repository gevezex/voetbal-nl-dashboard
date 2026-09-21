/**
 * Centrale bibliotheek met uitleg bij alle metrics, grafieken en modellen.
 *
 * Eén bron voor zowel de Next.js-app (`InfoTip`) als de Chrome-extensie (`tip`).
 * De teksten zijn bewust in eenvoudig Nederlands geschreven: elke trainer moet
 * ze kunnen lezen zonder statistiekachtergrond. De `body` is opgebouwd uit
 * vertrouwde HTML (`<p>`, `<h5>`, `<ul>`, `<li>`, `<strong>`) en wordt in de
 * styling als een echte infobox weergegeven (titel, tussenkopjes, paragrafen).
 */

export type TipContent = { title: string; body: string };

export const TIPS: Record<string, TipContent> = {
  // -------------------------------------------------------------------------
  // Algemeen / overzicht
  // -------------------------------------------------------------------------
  stand: {
    title: 'De stand',
    body:
      '<p>De ranglijst op <strong>punten</strong>, daarna <strong>doelsaldo</strong> en daarna <strong>doelpunten voor</strong>.</p>' +
      '<h5>Hoe lees je de kolommen?</h5>' +
      '<ul>' +
      '<li><strong>G</strong> = gespeeld, <strong>W</strong> = gewonnen, <strong>GL</strong> = gelijk, <strong>V</strong> = verloren.</li>' +
      '<li><strong>DV</strong> = doelpunten voor en <strong>DT</strong> = doelpunten tegen, beide als <strong>totaal</strong> over alle gespeelde duels.</li>' +
      '<li><strong>DS</strong> = doelsaldo (gemaakte min tegendoelpunten).</li>' +
      '<li><strong>Ptn</strong> = punten: 3 per overwinning, 1 per gelijkspel.</li>' +
      '<li><strong>PPD</strong> = punten per duel; handig om teams met een verschillend aantal wedstrijden eerlijk te vergelijken.</li>' +
      '<li><strong>Vorm</strong> = de laatste 5 resultaten (W/G/V), het meest recente rechts.</li>' +
      '</ul>' +
      '<p class="tip-note">Klik op een team voor het volledige profiel met alle analyses.</p>' +
      '<p class="tip-note">De teamnaam staat er net als op voetbal.nl, inclusief leeftijdssuffix (bijv. <strong>Feyenoord O13-2</strong>), zodat je meteen ziet om welk team van de club het gaat.</p>',
  },
  ppg: {
    title: 'Punten per duel (PPD)',
    body:
      '<p>Het gemiddelde aantal punten dat een team per wedstrijd haalt. Een team dat alles wint zit op <strong>3,00</strong>; gelijkspel levert 1 punt.</p>' +
      '<h5>Waarom is dit handig?</h5>' +
      '<p>In de stand kan een team hoger staan puur omdat het al meer wedstrijden heeft gespeeld. PPD haalt dat verschil weg, zodat je appels met appels vergelijkt.</p>' +
      '<h5>Vuistregel</h5>' +
      '<ul><li>Boven 2,00 = kampioenskandidaat.</li><li>1,50 – 2,00 = sterke middenmoter.</li><li>Onder 1,00 = zorgenkindje.</li></ul>',
  },
  sparkline: {
    title: 'Puntenverloop (sparkline)',
    body:
      '<p>Het kleine lijntje toont het <strong>cumulatieve puntenaantal</strong> van een team na elke speelronde.</p>' +
      '<h5>Hoe lees je het?</h5>' +
      '<ul>' +
      '<li>Een <strong>stijgende lijn</strong> betekent dat het team blijft winnen of gelijkspelen.</li>' +
      '<li>Een <strong>vlak stuk</strong> betekent dat er weinig punten bijkomen (verliesreeksen).</li>' +
      '<li>Een steile helling ergens in het midden wijst op een goede reeks; een knik wijst op een omslagpunt.</li>' +
      '</ul>' +
      '<p class="tip-note">De sparkline gaat alleen over punten, niet over de vraag tegen wie die punten zijn gehaald.</p>',
  },
  smallMultiples: {
    title: 'Alle teams in één oogopslag',
    body:
      '<p>Kleine kaartjes (small multiples) van elk team, met dezelfde onderdelen naast elkaar: record, doelsaldo, PPD, doelpunten voor/tegen, het puntenverloop en de vorm.</p>' +
      '<h5>Waarom zo?</h5>' +
      '<p>Omdat alles dezelfde schaal gebruikt, kun je in één blik zien wie aanvallend sterk is, wie veel weggeeft en wie in vorm is. Handig als voorbereiding op de volgende tegenstander.</p>',
  },
  form: {
    title: 'Vorm: W / G / V',
    body:
      '<p>De laatste resultaten, meest recent rechts. <strong>W</strong> = gewonnen, <strong>G</strong> = gelijk, <strong>V</strong> = verloren.</p>' +
      '<h5>Let op</h5>' +
      '<p>Vijf duels zeggen weinig over de absolute kwaliteit: tegen wie speelde je? Een 5-uit-5 tegen de onderste ploegen is minder indrukwekkend dan 3 overwinningen op de top 3. Combineer de vorm daarom met de programmazwaarte.</p>',
  },
  nextRound: {
    title: 'Volgende speelronde',
    body:
      '<p>Alle nog te spelen duels, elk met de <strong>kans op winst, gelijk of verlies</strong>.</p>' +
      '<p>De balk loopt van groen (thuiswinst) via grijs (gelijk) naar rood (uitwinst). De percentages komen uit het voorspelmodel (Dixon-Coles).</p>' +
      '<p class="tip-note">We tonen bewust géén één voorspeld doelsaldo: bij jeugdvoetbal is de onzekerheid te groot. Kansen zijn eerlijker.</p>',
  },

  // -------------------------------------------------------------------------
  // Basis-KPI's
  // -------------------------------------------------------------------------
  basicKpis: {
    title: 'Basis-KPI\'s van dit team',
    body:
      '<p>De kerncijfers uit alle gespeelde duels:</p>' +
      '<ul>' +
      '<li><strong>PPD</strong> — punten per duel.</li>' +
      '<li><strong>Voor / tegen</strong> — gemiddeld gemaakte en tegengespeelde doelpunten per duel.</li>' +
      '<li><strong>W / G / V</strong> — winst, gelijk en verlies.</li>' +
      '<li><strong>Clean sheets</strong> — duels zonder tegendoelpunt.</li>' +
      '<li><strong>Zonder te scoren</strong> — duels waarin het team niet scoorde.</li>' +
      '</ul>',
  },
  goalsForAgainst: {
    title: 'Doelpunten voor en tegen (gemiddeld)',
    body:
      '<p>Per team het gemiddelde aantal <strong>gemaakte</strong> (groen) en <strong>tegengespeelde</strong> (rood) doelpunten per wedstrijd.</p>' +
      '<h5>Hoe gebruik je dit?</h5>' +
      '<ul>' +
      '<li>Veel groen + weinig rood = sterk team.</li>' +
      '<li>Veel groen + veel rood = aanvallend maar kwetsbaar (vaak spektakel).</li>' +
      '<li>Weinig groen + weinig rood = gesloten en voorzichtig.</li>' +
      '</ul>' +
      '<p class="tip-note">Gemiddelden zijn eerlijk te vergelijken, ook als teams een verschillend aantal duels speelden.</p>',
  },
  goalDiffTimeline: {
    title: 'Doelsaldo over tijd',
    body:
      '<p>Het <strong>cumulatieve doelsaldo</strong> (gemaakte min tegendoelpunten) van een team na elke speelronde.</p>' +
      '<h5>Hoe lees je het?</h5>' +
      '<ul>' +
      '<li><strong>Boven de nullijn</strong> = positief doelsaldo, het team heeft meer gescoord dan tegen gekregen.</li>' +
      '<li>Een <strong>stijgende lijn</strong> = een goede periode; een <strong>dalende lijn</strong> = een dip.</li>' +
      '</ul>' +
      '<p>Zo zie je wanneer een team zijn vorm vond of juist wegglipte — los van de stand, die ook door gelijke spelen wordt bepaald.</p>',
  },
  avgTotalGoals: {
    title: 'Gemiddeld totaal aantal doelpunten',
    body:
      '<p>Het gemiddelde aantal doelpunten in de duels van dit team: gemaakte plus tegendoelpunten per wedstrijd. Dit is een maat voor het <strong>tempo</strong> van de wedstrijden.</p>' +
      '<p>Een hoog gemiddelde betekent vaak open, aantrekkelijk voetbal; een laag gemiddelde wijst op voorzichtige, gesloten duels.</p>',
  },
  btts: {
    title: 'Beide teams scoren (BTTS)',
    body:
      '<p>Het percentage duels waarin <strong>beide ploegen minimaal één doelpunt maakten</strong>.</p>' +
      '<h5>Hoe lees je het?</h5>' +
      '<ul><li>Hoog percentage = beide ploegen scoren makkelijk en er is ruimte weg te geven.</li>' +
      '<li>Laag percentage = minstens één ploeg houdt de nul, of de wedstrijd is gesloten.</li></ul>' +
      '<p class="tip-note">Engelse afkorting: BTTS = Both Teams To Score.</p>',
  },
  over25: {
    title: 'Boven 2,5 doelpunten',
    body:
      '<p>Het percentage duels met <strong>drie of meer doelpunten in totaal</strong> (dus meer dan 2,5).</p>' +
      '<p>Dit zegt iets over hoe open de wedstrijden van dit team zijn. Handig als je vooraf inschat of het een doelpuntrijke of juist een zuinige wedstrijd wordt.</p>',
  },
  winMargins: {
    title: 'Verdeling van winstmarges',
    body:
      '<p>Van alle overwinningen: hoeveel waren er met <strong>1 doelpunt verschil</strong>, met 2, en met 3 of meer.</p>' +
      '<h5>Waarom belangrijk?</h5>' +
      '<p>Teams die veel met één doelpunt verschil winnen, hebben vaak meer geluk dan ze laten zien. Zulke ploegen <strong>zakken in de tweede seizoenshelft</strong> regelmatig terug. Een flink aantal ruime zeges is een teken van echte kracht.</p>',
  },
  biggestResult: {
    title: 'Grootste zege en grootste nederlaag',
    body:
      '<p>De wedstrijd met het grootste positieve en het grootste negatieve doelsaldo.</p>' +
      '<p>Zo zie je meteen het beste en het slechtste gezicht van een team, inclusief tegen wie en thuis of uit dat gebeurde.</p>',
  },
  mostCommonScore: {
    title: 'Meest voorkomende uitslag',
    body:
      '<p>De uitslag die bij dit team het vaakst voorkomt, met hoe vaak.</p>' +
      '<p>Bijvoorbeeld 5 keer 1-0 zeggen nog meer dan een gemiddelde: het team wint veel, maar nipt. Dat is precies het type team waar de geluk-index en de regressieanalyse naar kijken.</p>',
  },
  cleanSheets: {
    title: 'Clean sheets',
    body:
      '<p>Het aantal wedstrijden waarin dit team <strong>geen enkel doelpunt tegen kreeg</strong>, met het percentage van alle duels.</p>' +
      '<p>Een hoge score wijst op een goed georganiseerde verdediging en/of een sterke keeper.</p>',
  },
  failedToScore: {
    title: 'Wedstrijden zonder te scoren',
    body:
      '<p>Het aantal duels waarin dit team <strong>niet scoorde</strong>, met het percentage van alle wedstrijden.</p>' +
      '<p>Een hoog percentage betekent dat de aanval vaak vastloopt. Dat is vaak het verschil tussen meedoen om het kampioenschap en de middenmoot.</p>',
  },

  // -------------------------------------------------------------------------
  // Thuis/uit
  // -------------------------------------------------------------------------
  homeAway: {
    title: 'Thuis en uit apart',
    body:
      '<p>Alle kerncijfers nog eens apart voor <strong>thuiswedstrijden</strong> en <strong>uitwedstrijden</strong>: gespeeld, winst/gelijk/verlies, doelpunten en punten per duel.</p>' +
      '<h5>Waarom apart kijken?</h5>' +
      '<p>Veel jeugdteams zijn thuis duidelijk sterker. Als je de cijfers op één hoop gooit, zie je dat verschil niet. Apart kijken laat zien waar de kracht van een team écht zit.</p>',
  },
  homeAdvantageIndex: {
    title: 'Thuisvoordeel-index',
    body:
      '<p>Het verschil tussen de punten per duel thuis en uit, min het <strong>gemiddelde thuisvoordeel in deze poule</strong>.</p>' +
      '<h5>Hoe lees je het?</h5>' +
      '<ul>' +
      '<li><strong>Positief</strong> (groen): dit team haalt meer uit thuis dan je op basis van de hele poule zou verwachten. Een échte thuistijger.</li>' +
      '<li><strong>Rond 0</strong>: het team doet gewoon mee met het normale thuisvoordeel.</li>' +
      '<li><strong>Negatief</strong> (rood): het team presteert relatief juist beter uit dan thuis — een reisploeg.</li>' +
      '</ul>' +
      '<p class="tip-note">Door te vergelijken met het poulegemiddelde zie je of een team écht een thuistijger is of dat het gewoon het gebruikelijke thuisvoordeel heeft.</p>',
  },
  travelRank: {
    title: 'Reisprestatierang',
    body:
      '<p>De rangorde binnen de poule op <strong>punten per uitwedstrijd</strong>. Nummer 1 haalt de meeste punten op verplaatsing.</p>' +
      '<p>Een hoge positie betekent dat een team ook buiten het eigen veld goed presteert — vaak een teken van mentale weerbaarheid.</p>',
  },
  dumbbell: {
    title: 'Dumbbell: thuis versus uit',
    body:
      '<p>De <strong>groene bol</strong> is thuis, de <strong>rode bol</strong> is uit. Het verbindende balkje laat het verschil zien.</p>' +
      '<h5>Hoe lees je het?</h5>' +
      '<ul><li>Bollen ver uit elkaar = groot verschil tussen thuis en uit.</li><li>Bollen dicht bij elkaar = team presteert overal ongeveer hetzelfde.</li></ul>',
  },

  // -------------------------------------------------------------------------
  // Vorm, momentum, reeksen
  // -------------------------------------------------------------------------
  momentum: {
    title: 'Momentum',
    body:
      '<p>Momentum kijkt niet naar het hele seizoen, maar naar <strong>recente duels</strong>. Er zijn drie cijfers:</p>' +
      '<ul>' +
      '<li><strong>Rolling PPD (groen)</strong> — het gemiddelde aantal punten per duel over de laatste 5 wedstrijden, als schuivend gemiddelde.</li>' +
      '<li><strong>EWMA (stippellijn)</strong> — een vorm van wegen waarbij de meest recente wedstrijd het zwaarst telt en oudere duels steeds minder. Reageert sneller op een omslag.</li>' +
      '<li><strong>Momentum-delta</strong> — het verschil tussen de vorm van de laatste 5 duels en het seizoensgemiddelde. Positief = het team is in opmars, negatief = het zakt weg.</li>' +
      '</ul>' +
      '<p class="tip-note">TP: een team met een sterk seizoensgemiddelde maar een negatieve momentum-delta is misschien over zijn hoogtepunt heen.</p>',
  },
  streaks: {
    title: 'Reeksen',
    body:
      '<p>Reeksen vertellen een verhaal dat losse uitslagen niet laten zien:</p>' +
      '<ul>' +
      '<li><strong>Huidige reeks</strong> — de reeks waarin het team nu zit (bijvoorbeeld 4 wedstrijden ongeslagen of 3 keer op rij verloren).</li>' +
      '<li><strong>Langste winstreeks</strong> — het beste stuk van het seizoen.</li>' +
      '<li><strong>Langste ongeslagen reeks</strong> — hoe lang het team zonder verlies bleef.</li>' +
      '<li><strong>Langste verliesreeks</strong> — de diepste dip.</li>' +
      '</ul>',
  },
  turningPoint: {
    title: 'Omslagpunt en trend',
    body:
      '<p>Met <strong>breukpuntdetectie</strong> zoeken we het moment waarop de puntencurve het sterkst van richting veranderde — bijvoorbeeld na de winterstop, na een blessure of nadat een spits vertrok.</p>' +
      '<h5>Trend</h5>' +
      '<p>De trend vergelijkt de laatste 3 duels met de 3 daarvoor: <strong>opgaand</strong>, <strong>dalend</strong> of <strong>stabiel</strong>.</p>' +
      '<p class="tip-note">Een omslagpunt is een aanwijzing, geen bewijs. Kijk altijd of er een logische oorzaak is (wedstrijdschema, personele wijzigingen).</p>',
  },

  // -------------------------------------------------------------------------
  // Sterkte / ratings
  // -------------------------------------------------------------------------
  teamStrength: {
    title: 'Teamprofiel (radar)',
    body:
      '<p>De radar vergelijkt dit team met het <strong>poulegemiddelde (50)</strong> op drie assen:</p>' +
      '<ul>' +
      '<li><strong>Aanval</strong> — hoe makkelijk het team scoort.</li>' +
      '<li><strong>Verdediging</strong> — hoe moeilijk het is om tegen dit team te scoren.</li>' +
      '<li><strong>Algemeen</strong> — het gemiddelde van beide.</li>' +
      '</ul>' +
      '<p>Alles boven 50 is bovengemiddeld, daaronder ondergemiddeld. Zo zie je in één oogopslag waar een ploeg sterk en zwak is.</p>',
  },
  strengthsWeaknesses: {
    title: 'Sterke en zwakke punten',
    body:
      '<p>Automatisch opgemaakt uit de aanval- en verdedigingsscore:</p>' +
      '<ul>' +
      '<li><span class="tip-good">Groen</span> = een echt sterk punt om op voort te bouwen.</li>' +
      '<li><span class="tip-bad">Rood</span> = een aandachtspunt voor de training.</li>' +
      '<li>Grijs = ongeveer gemiddeld.</li>' +
      '</ul>',
  },
  radar: {
    title: 'Spider / radarvergelijking',
    body:
      '<p>Twee teams op dezelfde assen (aanval, verdediging, algemeen), getekend als een spinneweb.</p>' +
      '<p>Hoe groter het vlak, hoe sterker dat team op die punten. Overlappende vlakken laten direct zien waar jij beter of slechter bent dan de tegenstander.</p>',
  },
  offensiveDefensive: {
    title: 'Offensieve en defensieve kracht',
    body:
      '<p>Een score van 0 tot 100 per team, afgezet tegen het poulegemiddelde.</p>' +
      '<ul><li><strong>Groen / aanval</strong> — hoe gevaarlijk het team is voor het doel.</li><li><strong>Rood / verdediging</strong> — hoe goed het de eigen goal afschermt.</li></ul>' +
      '<p>Zo zie je snel welke ploegen je met een aanvallende of juist behoudende tactiek moet bestrijden.</p>',
  },
  ratings: {
    title: 'Sterkteratings in het kort',
    body:
      '<p>Vijf onafhankelijke manieren om te meten hoe sterk een team is. Ze gebruiken allemaal dezelfde uitslagen, maar leggen andere accenten. Samen geven ze een betrouwbaarder beeld dan één rating alleen.</p>' +
      '<ul>' +
      '<li><strong>Elo</strong> — kijkt naar doelpunten én wie je tegenstander was.</li>' +
      '<li><strong>Massey</strong> — kijkt naar het doelsaldo, in één keer voor de hele poule.</li>' +
      '<li><strong>Colley</strong> — kijkt alleen naar winst/verlies, dus niet onder de indruk van een 8-0.</li>' +
      '<li><strong>Bradley-Terry</strong> — kijkt naar wie van wie wint.</li>' +
      '<li><strong>Pi</strong> — past zich na elke wedstrijd aan, robuust bij weinig duels.</li>' +
      '</ul>' +
      '<p class="tip-note">Staan de modellen het eens? Dan is het beeld sterk. Wijzen ze verschillend, dan zit er ruis in de data.</p>',
  },
  ratingsTable: {
    title: 'Ratingtabel',
    body:
      '<p>Alle ratings naast elkaar, gesorteerd op Elo. Hoger is bij alle modellen beter, behalve bij de <strong>verdedigingscoëfficiënt</strong>: daar is lager juist beter.</p>' +
      '<p>De kolommen <strong>Aanval / Verdediging</strong> en de thuis- en uitvarianten zijn vermenigvuldigingsfactoren: <strong>1,00 = precies gemiddeld</strong> in deze poule.</p>',
  },
  modelComparison: {
    title: 'Vijf modellen, één beeld',
    body:
      '<p>Elk model kijkt net anders naar de uitslagen. Dat is bewust: ze vullen elkaar aan.</p>' +
      '<h5>Waarom meerdere modellen?</h5>' +
      '<p>Eén model kan misleid worden door één rare uitslag. Als vijf modellen ongeveer hetzelfde zeggen, kun je daarop vertrouwen. Verschillen ze sterk, dan is de data (nog) te dun of te wisselvallig.</p>',
  },
  elo: {
    title: 'Elo-rating',
    body:
      '<p>Elo kent elk team een cijfer toe. Je begint op <strong>1500</strong>. Win je van een sterke tegenstander, dan stijg je veel; win je van een zwakkere, dan stijg je weinig. Verlies je verrassend, dan zak je juist hard.</p>' +
      '<h5>Doelsaldo en thuisvoordeel</h5>' +
      '<p>Een ruime zege telt zwaarder dan een nipte, en thuis spelen geeft een klein voordeel in de berekening. Zo ontstaat een dynamisch krachtcijfer dat meebeweegt met de resultaten.</p>',
  },
  massey: {
    title: 'Massey-rating',
    body:
      '<p>Massey lost alle doelsaldo\'s in de poule in één keer op, als een soort rekensom: als A met 2 van B wint en B met 1 van C, hoe sterk zijn A, B en C dan?</p>' +
      '<p>Een positief cijfer betekent dat een team gemiddeld meer scoort dan het tegen krijgt, gecorrigeerd voor de tegenstanders. Het is een rustige, stabiele rating.</p>',
  },
  colley: {
    title: 'Colley-rating',
    body:
      '<p>Colley gebruikt <strong>alleen winst, gelijk en verlies</strong> — niet de doelpunten.</p>' +
      '<h5>Waarom dat slim is</h5>' +
      '<p>Een 8-0 en een 1-0 tellen allebei als één overwinning. Daardoor is deze rating immuun voor extreme uitslagen die het beeld kunnen vertekenen. Handig als jeugdteams nog weleens uitschieten.</p>',
  },
  bradleyTerry: {
    title: 'Bradley-Terry-rating',
    body:
      '<p>Dit model schat hoe sterk teams zijn op basis van <strong>wie van wie wint</strong>. Winst op een sterke ploeg weegt zwaarder dan winst op een zwakke.</p>' +
      '<p>Een gelijkspel telt als een halve overwinning voor beide teams. Hoe hoger het cijfer, hoe sterker.</p>',
  },
  pi: {
    title: 'Pi-rating',
    body:
      '<p>De Pi-rating werkt als een soort <strong>dagkoers</strong>: na elke wedstrijd wordt de rating een beetje bijgesteld op basis van het resultaat.</p>' +
      '<p>Doordat de aanpassingen klein zijn, blijft de rating stabiel bij weinig wedstrijden. Dat maakt hem geschikt voor jeugdpoules, waar teams elkaar soms maar één keer treffen.</p>',
  },
  attackDefense: {
    title: 'Aanval- en verdedigingscoëfficiënten',
    body:
      '<p>Twee cijfers die je direct kunt gebruiken bij de wedstrijdvoorbereiding:</p>' +
      '<ul>' +
      '<li><strong>Aanval</strong> — hoeveel keer meer (of minder) dit team scoort dan een gemiddeld team in deze poule.</li>' +
      '<li><strong>Verdediging</strong> — hoeveel keer meer (of minder) het team tegendoelpunten weggeeft. Lager is beter.</li>' +
      '</ul>' +
      '<h5>Hoe lees je de getallen?</h5>' +
      '<ul>' +
      '<li><strong>1,00</strong> = precies gemiddeld.</li>' +
      '<li><strong>1,50</strong> = 50% beter dan gemiddeld.</li>' +
      '<li><strong>0,75</strong> = 25% onder het gemiddelde.</li>' +
      '</ul>' +
      '<p>Twee teams die allebei sterk zijn in aanval en zwak in verdediging? Dan voorspelt het model veel doelpunten.</p>',
  },
  attackDefenseHome: {
    title: 'Aanval / verdediging thuis',
    body:
      '<p>Dezelfde coëfficiënten, maar dan alleen over thuiswedstrijden. <strong>1,00 = gemiddeld</strong>.</p>' +
      '<p>Aan de linkerkant van de schuine streep staat de aanval, rechts de verdediging. Voor verdediging geldt: hoe lager, hoe beter.</p>',
  },
  attackDefenseAway: {
    title: 'Aanval / verdediging uit',
    body:
      '<p>Dezelfde coëfficiënten, maar dan alleen over uitwedstrijden. <strong>1,00 = gemiddeld</strong>.</p>' +
      '<p>Zo zie je of een ploeg op verplaatsing anders speelt: sommige teams verdedigen uit veel degelijker, andere verliezen hun scherpte.</p>',
  },

  // -------------------------------------------------------------------------
  // Voorspelmodellen
  // -------------------------------------------------------------------------
  prediction: {
    title: 'Wedstrijdvoorspelling',
    body:
      '<p>Het model rekent voor elke mogelijke uitslag de kans uit en telt die op tot de kans op <strong>winst, gelijk of verlies</strong>.</p>' +
      '<h5>Wat je hier ziet</h5>' +
      '<ul>' +
      '<li><strong>Verwachte goals</strong> — het gemiddelde aantal doelpunten dat het model per ploeg verwacht.</li>' +
      '<li><strong>Meest waarschijnlijke uitslag</strong> — de enkele uitslag met de hoogste kans (lang niet altijd de uitslag die écht komt!).</li>' +
      '<li><strong>Beide teams scoren</strong> en de <strong>over/under</strong>-kansen.</li>' +
      '<li><strong>Verwachte punten</strong> — het gemiddelde puntenaantal dat dit duel een team oplevert.</li>' +
      '</ul>' +
      '<p class="tip-note">Kansen zijn geen zekerheden. Bij kleine jeugdpoules is de onzekerheid groot; gebruik dit als richting, niet als waarheid.</p>',
  },
  matchChance: {
    title: 'Kans op winst / gelijk / verlies',
    body:
      '<p>De gekleurde balk toont hoe waarschijnlijk elke uitkomst is: <strong>groen</strong> = winst, <strong>grijs</strong> = gelijk, <strong>rood</strong> = verlies.</p>' +
      '<p>De percentages komen uit de doelpuntenpatronen van beide teams (aanval, verdediging, thuisvoordeel). Hoe groter het gekleurde stuk, hoe waarschijnlijker die uitkomst.</p>',
  },
  predictiveModels: {
    title: 'Welk voorspelmodel kies je?',
    body:
      '<p>Er zijn vier modellen. Ze hebben allemaal dezelfde invoer (aanval, verdediging, thuisvoordeel), maar reageren net anders op de data:</p>' +
      '<ul>' +
      '<li><strong>Poisson</strong> — het eenvoudige basis­model. Fijn als je een nuchtere, snelle inschatting wilt.</li>' +
      '<li><strong>Dixon-Coles</strong> — de aanrader voor voetbal. Corrigeert de bekende onderschatting van 0-0, 1-0, 0-1 en 1-1.</li>' +
      '<li><strong>Bivariaat</strong> — houdt rekening met samenhang tussen de scores van beide ploegen. Nuttig bij verwacht open of gesloten wedstrijden.</li>' +
      '<li><strong>Negatief-binomiaal</strong> — laat uitschieters toe. Nuttig in poules met grote krachtsverschillen (6-0, 7-1).</li>' +
      '</ul>' +
      '<p class="tip-note">Staan de modellen het eens? Dan is de voorspelling robuust. Wijkt één model sterk af, dan zit er ruis in de data of is de poule erg wisselvallig.</p>',
  },
  poisson: {
    title: 'Poisson-model',
    body:
      '<p>Het basisdenkmodel achter de voorspelling. Het schat hoeveel doelpunten een ploeg gemiddeld maakt op basis van de eigen aanval en de verdediging van de tegenstander.</p>' +
      '<p>Daaruit volgt een kans voor elke uitslag (0-0, 1-0, 2-1, enzovoort). Simpel en verrassend effectief, zolang er genoeg wedstrijden zijn.</p>',
  },
  dixonColes: {
    title: 'Dixon-Coles-correctie',
    body:
      '<p>Het standaard-Poissonmodel onderschat een paar typische uitslagen: <strong>0-0, 1-0, 0-1 en 1-1</strong> komen in het echt vaker voor dan het model denkt.</p>' +
      '<p>Dixon-Coles corrigeert dat met één extra getal (ρ, uitgesproken "rho"). Dat getal wordt automatisch uit de uitslagen van de poule geschat. Voor de rest verandert er niets.</p>',
  },
  bivariate: {
    title: 'Bivariaat Poisson',
    body:
      '<p>Een variant die rekent met een <strong>verband tussen de doelpunten van beide teams</strong>. Soms is het spelbeeld zodanig dat als de ene ploeg scoort, de andere dat vaak ook doet (of juist niet).</p>' +
      '<p>Het model laat beide scores dus niet los van elkaar bewegen. Handig bij wedstrijden waarvan je verwacht dat ze open of juist gesloten worden.</p>',
  },
  negbin: {
    title: 'Negatief-binomiaal model',
    body:
      '<p>Standaard-Poisson gaat uit van nette, gemiddelde wedstrijden. In amateurklassen zijn de krachtsverschillen soms groot en vallen er uitschieters (6-0, 7-1).</p>' +
      '<p>Het negatief-binomiale model laat <strong>extra spreiding</strong> toe (overdispersie), zodat één uitschieter het beeld niet meteen vertekent. Precies wat je wilt in een jeugdpoule.</p>',
  },
  scoreMatrix: {
    title: 'Kansmatrix (heatmap)',
    body:
      '<p>Elke cel is één mogelijke uitslag. De <strong>rij</strong> is het aantal doelpunten van de thuisploeg, de <strong>kolom</strong> dat van de uitploeg.</p>' +
      '<h5>Hoe lees je de kleuren?</h5>' +
      '<p>Donkerder groen = waarschijnlijker. Het donkerste vakje is de meest waarschijnlijke uitslag, maar zelfs die kans is vaak maar 10-15%. De hele matrix bij elkaar is 100%.</p>' +
      '<p class="tip-note">Tel je de vakjes rechtsboven de diagonaal op, dan krijg je de kans dat de thuisploeg wint — precies wat de 1X2-balk toont.</p>',
  },
  markets: {
    title: 'Markten: over/under en BTTS',
    body:
      '<ul>' +
      '<li><strong>Over/Under 1,5 – 2,5 – 3,5</strong> — de kans dat er méér (over) of minder (under) dan dat aantal doelpunten valt.</li>' +
      '<li><strong>Beide teams scoren (BTTS)</strong> — de kans dat beide ploegen minimaal één keer scoren.</li>' +
      '</ul>' +
      '<p>Deze kansen komen uit dezelfde kansmatrix en zijn handig om je verwachting van het spelbeeld te toetsen: wordt het een doelpuntenfestival of een schaakpartij?</p>',
  },

  // -------------------------------------------------------------------------
  // Programmazwaarte
  // -------------------------------------------------------------------------
  sos: {
    title: 'Programmazwaarte (strength of schedule)',
    body:
      '<p>Niet elke ploeg speelt tegen even sterke tegenstanders. Deze analyse kijkt daarom naar <strong>wie je al gehad hebt</strong> en <strong>wie er nog komt</strong>, uitgedrukt in de gemiddelde Elo-rating van de tegenstanders.</p>' +
      '<h5>De cijfers</h5>' +
      '<ul>' +
      '<li><strong>Gem. rating gespeeld</strong> — hoe zwaar het programma tot nu toe was.</li>' +
      '<li><strong>Gem. rating restprogramma</strong> — hoe zwaar de slotfase wordt.</li>' +
      '<li><strong>Rang</strong> — 1 = het zwaarste programma, de hoogste = het makkelijkste.</li>' +
      '<li><strong>Gecorrigeerde PPD</strong> — de behaalde punten per duel, plus een correctie voor de zwaarte van de tegenstanders.</li>' +
      '</ul>' +
      '<p>Zo ontmasker je het klassieke geval: <strong>het team dat tweede staat maar nog geen enkele topper heeft gespeeld</strong>.</p>',
  },
  opponentTier: {
    title: 'Prestatie per tegenstanderklasse',
    body:
      '<p>Het record wordt gesplitst in drie groepen: de <strong>top</strong> van de poule, de <strong>middenmoot</strong> en de <strong>onderste</strong> ploegen.</p>' +
      '<h5>Wat je hiermee ziet</h5>' +
      '<ul>' +
      '<li>Punten tegen de top = hoe sterk je bent in de echte toppers.</li>' +
      '<li>Punten tegen de onderkant = of je de verplichte zege ook echt pakt.</li>' +
      '</ul>' +
      '<p>Een team dat veel punten haalt tegen de onderkant maar weinig tegen de top, is vaak een middenmoter met een mooi positie in de stand.</p>',
  },

  // -------------------------------------------------------------------------
  // Geluk en regressie
  // -------------------------------------------------------------------------
  pythagorean: {
    title: 'Geluk en regressie (Pythagorean)',
    body:
      '<p>De <strong>Pythagorean expectation</strong> zet doelpunten voor en tegen om in een verwacht puntenaantal. De gedachte komt uit honkbal en werkt ook goed in voetbal: wie veel scoort en weinig tegen krijgt, verdient meer punten.</p>' +
      '<h5>De geluk-index</h5>' +
      '<p>Het verschil tussen de <strong>werkelijk behaalde punten</strong> en de <strong>verwachte punten</strong>. Positief = het team haalt meer punten dan zijn doelsaldo rechtvaardigt (een geluksje); negatief = het laat punten liggen.</p>' +
      '<h5>Waarom dit zo waardevol is</h5>' +
      '<p>Teams die veel nipte duels (één doelpunt verschil) winnen en tegelijk een positieve geluk-index hebben, <strong>zakken bijna altijd terug</strong>. Dit is vaak de beste manier om te zien of de stand een team niet mooier maakt dan het is.</p>',
  },
  luckIndex: {
    title: 'Geluk-index',
    body:
      '<p>Het aantal punten dat een team méér (positief) of minder (negatief) haalde dan je op basis van de doelpunten zou verwachten.</p>' +
      '<p>Positief + veel nipte zeges = het kan bijna niet anders of er komt een terugval. Dit cijfer is een uitstekende voorspeller van de tweede seizoenshelft.</p>',
  },

  // -------------------------------------------------------------------------
  // Stijl
  // -------------------------------------------------------------------------
  style: {
    title: 'Stijlprofiel',
    body:
      '<p>Uit alleen de uitslagen is al veel af te leiden over hoe een team speelt:</p>' +
      '<ul>' +
      '<li><strong>Tempo</strong> — het gemiddelde totaal aantal doelpunten in de duels van dit team. Hoog tempo = open wedstrijden.</li>' +
      '<li><strong>Variantie / grilligheid</strong> — hoe wisselvallig de doelpunten zijn. Een grillig team wint de ene week met 5-0 en verliest de volgende met 1-4.</li>' +
      '<li><strong>Archetype</strong> — het type team dat eruit rolt (zie de uitleg bij archetypen).</li>' +
      '</ul>',
  },
  archetypes: {
    title: 'Archetypen (k-means-clustering)',
    body:
      '<p>De computer groepeert teams op vier kenmerken: aanval, verdediging, grilligheid en het verschil tussen thuis en uit. Teams die op elkaar lijken krijgen hetzelfde type.</p>' +
      '<h5>De labels</h5>' +
      '<ul>' +
      '<li><strong>Aanvalsmachine</strong> — scoort veel en geeft weinig weg.</li>' +
      '<li><strong>Open aanvalsteam</strong> — scoort veel, maar geeft ook veel weg.</li>' +
      '<li><strong>Gesloten counterploeg</strong> — verdedigt goed, scoort weinig.</li>' +
      '<li><strong>Thuistijger</strong> — presteert vooral thuis veel beter dan uit.</li>' +
      '<li><strong>Reisploeg</strong> — juist sterker op verplaatsing.</li>' +
      '<li><strong>Worstelt / wisselvallig</strong> — geen duidelijke lijn.</li>' +
      '</ul>' +
      '<p class="tip-note">k-means is een groepeeralgoritme: het zoekt de teams die het meest op elkaar lijken. De labels zijn een hulpmiddel om snel een type te herkennen, geen exacte wetenschap.</p>',
  },
  archetypeTable: {
    title: 'Archetypen en stijl per team',
    body:
      '<p>Voor elk team het archetype plus de onderliggende cijfers: aanvals- en verdedigingscoëfficiënt (1,00 = gemiddeld), tempo, grilligheid en het verschil tussen thuis en uit in punten per duel.</p>' +
      '<p>Gebruik dit als spiekbriefje bij de wedstrijdvoorbereiding: tegen een gesloten counterploeg heb je andere wapens nodig dan tegen een open aanvalsteam.</p>',
  },

  // -------------------------------------------------------------------------
  // Historie
  // -------------------------------------------------------------------------
  h2h: {
    title: 'Onderlinge historie (meerdere seizoenen)',
    body:
      '<p>Alle ontmoetingen tussen dit team en de tegenstander, verzameld over alle opgeslagen competities en seizoenen, gesplitst naar thuis en uit.</p>' +
      '<h5>Let op de steekproef</h5>' +
      '<p>Zes duels zeggen statistisch gezien <strong>heel weinig</strong>. Eén gelukkige of ongelukkige dag kan het beeld volledig kantelen. Lees de reeks dus altijd als sfeerbeeld, niet als bewijs.</p>' +
      '<p class="tip-note">Daarom staat er een waarschuwing bij als er minder dan 4 ontmoetingen zijn.</p>',
  },
  opponentComparison: {
    title: 'Vergelijking per tegenstander',
    body:
      '<p>Per tegenstander zie je twee dingen naast elkaar:</p>' +
      '<ul>' +
      '<li><strong>Ons record</strong> — hoe wij het tegen hen deden.</li>' +
      '<li><strong>Zij tegen de rest</strong> — hoe die tegenstander presteert tegen alle andere teams.</li>' +
      '</ul>' +
      '<p>Is ons record beter dan hun algemene record, dan ligt die tegenstander ons goed. Andersom kan een ploeg ons juist in de weg zitten. De kans op winst uit het model wordt erbij gezet als richtlijn.</p>' +
      '<h5>De balk per tegenstander</h5>' +
      '<p>Elke horizontale balk hoort bij één tegenstander en telt op tot <strong>100%</strong>: het groene deel is de kans dat wij winnen, het grijze dat we gelijkspelen en het rode dat we verliezen.</p>' +
      '<p class="tip-note">Let op: de kansen van verschillende tegenstanders staan los van elkaar. Ze tellen dus <strong>niet</strong> op tot één geheel — je speelt immers tegen één tegenstander per wedstrijd.</p>',
  },
  opponentSpider: {
    title: 'Sterkte van de tegenstander',
    body:
      '<p>Dezelfde radar (aanval, verdediging, algemeen) maar dan voor de komende tegenstander, zodat je in één oogopslag ziet waar wij beter of slechter zijn.</p>' +
      '<p>Onderaan staan de losse cijfers: gemiddelde doelpunten voor/tegen en de aanval- en verdedigingsscore.</p>',
  },
  teamResults: {
    title: 'Uitslagen per fase',
    body:
      '<p>Alle wedstrijden die dit team heeft gespeeld, met de <strong>nieuwste uitslag bovenaan</strong> en de oudste onderaan.</p>' +
      '<h5>Ook eerdere fases</h5>' +
      '<p>Onder de scheidingslijn staan de duels uit de andere competities van dit team, bijvoorbeeld de <strong>beker</strong> of een <strong>vorige competitie</strong>. Die haalt het dashboard automatisch op bij voetbal.nl (met je eigen sessie), één keer per team. Ze tellen <strong>niet</strong> mee in de statistieken, ratings of modellen op deze pagina — ze staan er alleen zodat je de hele reeks van dit team terugziet.</p>' +
      '<h5>Hoe lees je een regel?</h5>' +
      '<ul>' +
      '<li><strong>Datum</strong> — de speeldag zoals voetbal.nl die toont.</li>' +
      '<li><strong>Ronde</strong> — de speelronde binnen die fase (R1, R2, …).</li>' +
      '<li><strong>Wedstrijd</strong> — thuisploeg – uitploeg; het team van deze pagina staat vet.</li>' +
      '<li><strong>Uitslag</strong> — de score in dezelfde volgorde als de wedstrijd (thuis–uit). De kleur laat zien hoe dit team het deed: groen = winst, grijs = gelijk, rood = verlies.</li>' +
      '</ul>' +
      '<p class="tip-note">Speelt een team maar in één competitie, dan blijft deze lijst leeg. Lukt het ophalen niet (geen sessie of storing), dan zie je alleen wat er al bekend is.</p>',
  },
  rosterStaff: {
    title: 'Staf',
    body:
      '<p>De begeleiding en trainers van dit team, zoals voetbal.nl die toont. Namen die spelers/staf zelf hebben afgeschermd, worden overgeslagen.</p>',
  },
  rosterPlayers: {
    title: 'Spelers',
    body:
      '<p>De selectie van dit team. Namen die spelers zelf hebben afgeschermd, worden overgeslagen. Beweeg over een foto voor een grotere weergave.</p>',
  },

  // -------------------------------------------------------------------------
  // Visualisaties
  // -------------------------------------------------------------------------
  bumpChart: {
    title: 'Positieverloop (bump chart)',
    body:
      '<p>De positie van elk team in de stand na elke speelronde. De bovenste lijn is de koploper.</p>' +
      '<h5>Hoe lees je het?</h5>' +
      '<ul>' +
      '<li>Een stijgende lijn = opklimmen op de ranglijst.</li>' +
      '<li>Kruisende lijnen = ploegen die elkaar op de ranglijst inhaalslagen.</li>' +
      '<li>Een lange vlakke lijn = een team dat al een tijd op dezelfde plek bungelt.</li>' +
      '</ul>' +
      '<p>Zo zie je het seizoen als verhaal in plaats van één momentopname.</p>',
  },
  quadrant: {
    title: 'Kwadrant: aanval × verdediging',
    body:
      '<p>Elke stip is een team. Naar <strong>rechts</strong> = betere aanval. Naar <strong>boven</strong> = betere verdediging.</p>' +
      '<h5>De vier hoeken</h5>' +
      '<ul>' +
      '<li><strong>Rechtsboven</strong> — sterk aanvallend én sterk verdedigend: titelkandidaat.</li>' +
      '<li><strong>Rechtsonder</strong> — scoort veel, geeft veel weg: spektakel.</li>' +
      '<li><strong>Linksboven</strong> — verdedigt goed, scoort weinig: de counterploeg.</li>' +
      '<li><strong>Linksonder</strong> — worstelt aan beide kanten.</li>' +
      '</ul>' +
      '<p class="tip-note">De stippellijnen geven het poulegemiddelde (1,00) aan.</p>',
  },
  quadrantScatter: {
    title: 'Kwadrant: aanval × verdediging',
    body:
      '<p>Elke stip is een team. Naar rechts = betere aanval; naar boven = betere verdediging. De stippellijnen markeren het poulegemiddelde, zodat je in één oogopslag ziet wie boven of onder de maat presteert.</p>',
  },
  histogram: {
    title: 'Doelpuntenverdeling',
    body:
      '<p>Een histogram laat zien hoe vaak elk totaal aantal doelpunten per wedstrijd voorkomt in deze poule.</p>' +
      '<p>Bijvoorbeeld: hoe hoger de balk bij 3, hoe vaker er precies drie doelpunten in een wedstrijd vielen. Zo zie je of de poule doelpuntrijk is en of uitschieters (7-8 doelpunten) vaak voorkomen.</p>',
  },
  resultsMatrix: {
    title: 'Onderlinge uitslagen (matrix)',
    body:
      '<p>Alle gespeelde duels in één tabel. De <strong>rij</strong> is de thuisploeg, de <strong>kolom</strong> de uitploeg.</p>' +
      '<h5>Kleuren</h5>' +
      '<ul>' +
      '<li><strong>Groen</strong> — de thuisploeg won.</li>' +
      '<li><strong>Rood</strong> — de uitploeg won.</li>' +
      '<li><strong>Grijs</strong> — gelijkspel.</li>' +
      '<li><strong>Streepje</strong> — nog niet gespeeld.</li>' +
      '</ul>' +
      '<p>Zo vind je razendsnel alle uitslagen van één team terug. De teamnamen boven de kolommen staan schuin, net als op voetbal.nl — zo past de hele matrix zonder scrollen in het scherm.</p>',
  },

  // -------------------------------------------------------------------------
  // Scenario / simulatie
  // -------------------------------------------------------------------------
  monteCarlo: {
    title: 'Monte Carlo-simulatie',
    body:
      '<p>De computer speelt het resterende seizoen honderden keren opnieuw, telkens met net andere uitslagen (op basis van de kansen uit het model). Daarna wordt geteld hoe vaak elk team kampioen wordt, in de top eindigt of degradeert.</p>' +
      '<h5>Hoe lees je de percentages?</h5>' +
      '<p>50% kampioen betekent: in de helft van de gesimuleerde seizoenen werd dit team eerste. Het is een kans, geen voorspelling. Een team dat nu eerste staat maar een zwaar restprogramma heeft, ziet zijn kans toch dalen.</p>' +
      '<p class="tip-note">Hoe meer simulaties, hoe stabieler de percentages. Dit dashboard gebruikt er 1.200.</p>',
  },
  positionDist: {
    title: 'Positieverdeling',
    body:
      '<p>Een gestapelde balk per team: hoe groot de kans is dat het op elke eindpositie eindigt. Groen = bovenin, rood = onderin.</p>' +
      '<p>Zo zie je niet alleen de meest waarschijnlijke plek, maar ook de <strong>spreiding</strong>. Een team met de hoogste piek bovenaan én een dikke rode onderkant is onvoorspelbaar; een team met één smalle groene band is stabiel.</p>',
  },
  fanChart: {
    title: 'Puntenwaaier',
    body:
      '<p>De verwachte eindpunten per team. De buitenste stippellijnen zijn de <strong>10e en 90e percentiel</strong>: in 80% van de simulaties eindigt het team tussen die twee waarden. De dikke lijn is het gemiddelde.</p>' +
      '<p>Hoe breder de waaier, hoe onzekerder het restseizoen. Een smalle waaier betekent dat het team al bijna zeker is van zijn plekje.</p>',
  },
  leverage: {
    title: 'Hefboom per wedstrijd',
    body:
      '<p>De hefboom laat zien hoeveel <strong>procentpunt</strong> de kans op een goede eindklassering verandert als deze wedstrijd gewonnen wordt in plaats van verloren.</p>' +
      '<h5>Hoe lees je het?</h5>' +
      '<ul>' +
      '<li>Een <strong>grote hefboom</strong> = een cruciaal duel. Hier staat veel op het spel.</li>' +
      '<li>Een <strong>kleine hefboom</strong> = het resultaat maakt voor de eindstand weinig uit.</li>' +
      '</ul>' +
      '<p>Handig om te bepalen voor welke wedstrijden je je het beste volledig kunt opladen (en waar je misschien kunt rouleren).</p>',
  },
};

export function getTip(id: string): TipContent | null {
  return TIPS[id] ?? null;
}
