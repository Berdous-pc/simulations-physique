# Architecture — Simulation Cinétique chimique

## Arborescence

```
cinetique/
├── index.html
├── ARCHITECTURE.md         ← ce fichier
├── css/
│   └── style.css
└── js/
    ├── sim.js
    ├── recipient.js
    ├── graph.js
    └── ui.js
```

---

## Vue d'ensemble

Modèle des chocs efficaces pour la réaction **A + B → C + D** : un grand récipient
contient des molécules A et B en mouvement rectiligne uniforme (chocs élastiques entre
elles et sur les parois, cf. `pression/`). Quand une molécule A percute une molécule B,
la réaction a lieu : les deux disparaissent et sont remplacées par une molécule C et
une molécule D. Un graphe suit en temps réel l'évolution du nombre de molécules de
chaque espèce.

### Mode 1 ou 2 simulations

Le bouton à deux états **« Nombre de simulation(s) »** (en tête de la section
Paramètres) affiche 1 ou 2 simulations, pour comparer en direct l'évolution des
quantités de matière sous deux jeux de paramètres. En mode 2, on obtient deux zones
d'animation l'une sous l'autre, deux graphes alignés chacun avec sa zone, et deux
triplets de sliders (T, N_A, N_B) indépendants. L'équation de réaction, commune, n'est
pas dupliquée.

Conséquences dans le code :

- **`sims`** est un tableau de 2 instances créées par `createSim(index)` ; `simCount`
  (1 ou 2) dit combien sont affichées et animées, `activeSims()` renvoie la tranche
  correspondante. Toute fonction physique ou de rendu prend l'instance `s` en
  **premier argument** — il n'y a plus d'objet `sim` global.
- **Restent globaux** (partagés) : `paused` et `speedFactor`. Lancer/Pause, la RAZ et
  la vitesse d'animation agissent sur les deux simulations, qui avancent au même temps
  simulé : c'est la condition pour que la comparaison ait un sens.
- **Bornes d'axes communes** aux deux graphes (`_axisBounds()` dans `graph.js`) : sans
  cela, deux évolutions très différentes se ressembleraient une fois chacune mise à
  l'échelle de son propre cadre.
- **Suffixes DOM** : tous les id dupliqués sont suffixés par l'index
  (`recipient-canvas-1/-2`, `cinetique-chart-1/-2`, `sl-T-1/-2`, `ro-A-1/-2`, …).
  Les éléments propres au mode double portent la classe `.duo-only`, masquée tant que
  `<body>` n'a pas la classe `duo`.

---

## Fichiers et responsabilités

### `index.html`

Structure HTML pure. Colonne gauche divisée en deux zones **côte à côte**
(`grid-template-columns: 60fr 40fr` sur `#left-col`) : `.sim-area` (récipient, 60 % de
la largeur, à gauche) et `.graph-area` (graphe, 40 %, à droite). En mode 2 simulations,
une seconde paire `.sim-area` / `.graph-area` (classe `.duo-only`) forme une deuxième
ligne de la même grille — d'où l'alignement automatique de chaque graphe avec sa zone
d'animation. Panneau droit avec contrôle (Lancer/Pause, RAZ, vitesse d'animation) et
paramètres (nombre de simulations, puis un bloc T / N_A / N_B + readout par simulation).

---

### `css/style.css`

Charte graphique du projet (cf. `contexte_projet.md`). Particularités de cette page :

| Section | Contenu |
|---|---|
| `#left-col` | `display:grid; grid-template-columns:60fr 40fr; grid-auto-rows:1fr` — récipient à gauche, graphe à droite ; en mode double, les deux lignes ont exactement la même hauteur |
| `body:not(.duo) .duo-only` | `display:none` — masque les éléments du mode 2 simulations sans écraser leur `display` propre |
| `.graph-area` | Flex colonne centrée — équation puis graphe, qui ne prend pas toute la hauteur disponible |
| `#cinetique-equation` | Équation A + B → C + D, lettres colorées via `SPECIES_COLORS` (posées par ui.js) ; réduite en mode double (hauteur de ligne divisée par deux) |
| `.chart-wrap` | `aspect-ratio: 4/3` + `max-height: 100%` ; `container-type: size` — nécessaire pour la légende overlay en `cqmin` |
| `.cinetique-legende` | Overlay HTML positionné en haut-droite du graphe, checkboxes de visibilité par courbe |
| `.nsim-toggle` / `.nsim-btn` | Bouton 2 états « Nombre de simulation(s) », même motif que `.light-source-toggle` de `diffraction/` |
| `.sim-group-title` | Sous-titre « Simulation 1 / 2 » au-dessus de chaque triplet de sliders (mode double uniquement) |
| `.chart-legend-item` | Ligne de légende (checkbox + pastille couleur + texte), style pilule inspiré de `titrage/` |

---

### `js/sim.js` — État et physique

**Chargé en premier.**

#### Constantes

| Constante | Valeur | Rôle |
|---|---|---|
| `T_REF` | 300 K | Température de référence pour le calibrage visuel |
| `V0_PX_DEFAULT` | 180 | Vitesse de base en px/s à T_REF, avant le premier resize (ensuite `s.v0px`, propre à chaque instance, recalibré par recipient.js) |
| `MOL_RADIUS_FRAC` | 0,007 | Fraction de la largeur intérieure du récipient |
| `SUBSTEPS_MIN` / `SUBSTEPS_MAX` | 4 / 32 | Bornes du nombre de sous-pas par frame, calculé à chaque frame par `_requiredSubsteps()` (anti-tunneling) |
| `MAX_STEP_FRAC` | 0,5 | Déplacement toléré par sous-pas, en fraction du rayon |
| `HISTORY_PERIOD` | 200 ms | Période d'échantillonnage de l'historique (temps simulé). Historique conservé en entier depuis t=0 (pas de fenêtre glissante) : le graphe garde la totalité de l'expérience visible, même après plusieurs minutes |
| `SPECIES_COLORS` | `{A,B,C,D}` | Couleurs (fill/border) de chaque espèce — **source unique**, réutilisée par recipient.js, graph.js et les pastilles du readout (posées par ui.js). Réactifs A/B en teintes **vives** (bleu `#0f7fe0`, orange-rouge `#f04a10`), produits C/D en teintes **ternes** (vert-de-gris `#8fa896`, mauve grisé `#a89ab0`) pour que les réactifs restants ressortent au milieu des produits accumulés |

#### Instance de simulation (`createSim(index)`)

| Propriété | Rôle |
|---|---|
| `index` | 1 ou 2 — suffixe des id du DOM correspondants |
| `molecules[]` | `{type:'A'|'B'|'C'|'D', x, y, vx, vy}[]` |
| `N0_A` / `N0_B` | Quantités pilotées par les sliders (état courant, pas seulement init) |
| `T_C` / `T_K` | Consigne du slider (°C) et température de simulation associée (K) |
| `boxLeft/Right/Top/Bottom` | Bords intérieurs du récipient |
| `molRadius` / `v0px` | Rayon (px) et vitesse de base (px/s à T_REF), recalculés au resize |
| `canvas` / `ctx` / `cw` / `ch` | Canvas du récipient (posés par `attachCanvas`) |
| `chartCanvas` / `chartCtx` / `chartVisible` / `chartHover` | Graphe et son état (posés par `attachChart`) |
| `simTime` | Temps simulé cumulé (ms) |
| `history` | `{t[], A[], B[], C[], D[]}` — historique pour le graphe |
| `_historyTimer`, `_grid`, `_gridCols`, `_gridRows` | Accumulateur d'échantillonnage et grille spatiale de collisions, **propres à l'instance** (deux simulations animées dans la même frame ne doivent pas se partager les buckets) |

#### Variables globales restantes

| Variable | Rôle |
|---|---|
| `sims` | Les 2 instances (toujours créées ; seules les `simCount` premières sont animées) |
| `simCount` | 1 ou 2 — nombre de simulations affichées |
| `activeSims()` | `sims.slice(0, simCount)` |
| `paused` | Animation suspendue — **commun** aux deux simulations |
| `speedFactor` | Multiplicateur de dt (×0,10 à ×2,00) — **commun** |

#### Règle de réaction A + B → C + D

Dans `_resolvePair()`, une paire (A,B) en collision ne subit pas un choc élastique
standard : elle réagit. On part de la vitesse du centre de masse `vG = (vA+vB)/2`, puis
on ajoute à C et on retranche à D un même vecteur `kick` (tangent à la normale de choc,
sens tiré au hasard, proportionnel à la vitesse d'approche `vrel_n`) :

```
vC = vG + kick
vD = vG − kick
```

`vC + vD = 2·vG = vA + vB` **quel que soit `kick`**, puisqu'il s'annule dans la somme —
c'est ce qui autorise à faire diverger C et D (au lieu de leur donner la même vitesse)
sans jamais rompre la conservation de la quantité de mouvement. Sans ce `kick`, C et D
repartiraient à l'identique, collés, en translation parallèle : conservatif sur le
papier mais visuellement trompeur (aucune vraie collision ne "colle" ainsi les deux
produits), au point de donner l'impression que la conservation n'est pas respectée.
**L'énergie cinétique du système n'est volontairement pas conservée** lors d'une
réaction (analogue simplifié à une transformation exo/endothermique) — ce n'est pas
un choc élastique, c'est assumé.

#### Sliders N_A / N_B

`setSpeciesCount(s, type, target)` met à jour `N0_A`/`N0_B` : changer une quantité de
réactif redéfinit les conditions initiales de l'expérience, donc l'animation repart de
zéro. Sans ça, la courbe affichée mélangerait deux expériences différentes sur le même
axe des temps.

En mode 2 simulations, le comportement dépend de si l'expérience a déjà commencé
(`activeSims().some(sim => sim.simTime > 0)`) :
- **au moins une simulation a été lancée** → RAZ complète (`resetSim()`), les deux
  repartent ensemble à t=0. Nécessaire pour que les deux courbes restent comparables
  sur le même axe des temps.
- **aucune n'a encore été lancée** (réglage des paramètres avant le premier
  « Lancer ») → seule `s` est repositionnée (`initMolecules(s)`). Repositionner
  l'autre n'aurait aucun effet utile (elle est déjà à t=0) mais lui ferait perdre
  son placement aléatoire initial sans raison, ce qui donnait l'impression que les
  molécules « sautaient » de place à chaque réglage.

Le `.readout` (A/B/C/D actuels) reflète en revanche le compte en temps réel, qui évolue
tout seul au fil des réactions.

#### Fin de réaction (`s.finished`)

Quand A ou B tombe à 0, la réaction A + B → C + D ne peut plus avoir lieu :
`stepPhysics(s, dt)` lève `s.finished = true` et retourne immédiatement à chaque appel
suivant, ce qui fige à la fois l'animation (molécules immobiles) et le tracé du
graphe (plus de nouveaux points d'historique) — **indépendamment pour chaque
simulation** en mode double, sans attendre que l'autre finisse aussi. Un point
d'historique est forcé au moment même de l'épuisement (au lieu d'attendre le
prochain échantillon prévu, jusqu'à 200 ms plus tard) pour que la courbe s'arrête
pile à l'instant exact. `initMolecules()` réinitialise `s.finished` (à `true` d'emblée
si N_A ou N_B vaut 0 dès le départ — la réaction est déjà impossible, inutile
d'attendre un premier choc).

#### Pause et RAZ

La simulation démarre **en pause** (`paused = true` à l'état initial) : au chargement
ou au rafraîchissement de la page, l'élève voit la situation de départ figée et lance
lui-même la réaction. `resetSim()` remet aussi l'animation en pause, et conserve la
température et les N_A/N_B actuellement réglés par les sliders — ce n'est pas un retour
aux valeurs par défaut (50/50, 300 K).

---

### `js/recipient.js` — Rendu du récipient

**Chargé après `sim.js`.** `attachCanvas(s)` relie l'instance à son canvas
(`#recipient-canvas-<index>`). `resizeRecipient(s)` calque `pression/js/recipient.js` :
récipient rectangulaire occupant toute la zone utile (moins une marge fixe `MARGIN`),
4 parois fermées (pas de piston). `s.molRadius` et `s.v0px` recalculés à chaque resize,
avec rescale des vitesses existantes si `s.v0px` change. `resizeAll()` (branché sur
l'événement `resize` de la fenêtre, anti-rebond RAF) boucle sur `activeSims()`.
`drawSphere()` dessine chaque molécule (disque uni + contour), couleur selon
`SPECIES_COLORS[type]`.

**Transposition au resize** : les positions des molécules sont stockées en pixels du
canvas. `resizeRecipient()` mémorise donc l'ancienne zone intérieure avant de l'écraser, puis
replace chaque molécule à coordonnées **relatives** constantes dans la nouvelle zone
(avec clamp sur les bords). Sans ça, un redimensionnement de fenêtre laisse les molécules
groupées là où se trouvait l'ancien récipient, voire hors du nouveau cadre.

---

### `js/graph.js` — Graphe N(t)

**Chargé après `recipient.js`.** Un canvas séparé par simulation
(`#cinetique-chart-<index>`), relié par `attachChart(s)`, resize DPR propre
(`resizeChart(s)`, `resizeChartAll()`). `drawChart(s)` dessine grille/axes/courbes à
partir de `s.history`, en ne traçant que les courbes dont `s.chartVisible[espèce]` est
vrai. `buildChartLegend(s)` génère les 4 lignes à checkbox dans
`#cinetique-legende-<index>` (overlay HTML positionné en `cqmin` sur `.chart-wrap`).

**Bornes d'axes communes** : `_axisBounds()` balaie *toutes* les simulations affichées
— échelle Y dynamique (`_niceStep`, marge 10 % au-dessus du maximum affiché), échelle X
sur `[0, max(15 s, t_dernier_point)]`. Les deux graphes partagent donc exactement les
mêmes axes, seule façon de comparer les allures à l'œil. Corollaire : décocher une
courbe dans une légende peut changer l'échelle de l'autre graphe, d'où l'appel à
`drawAllCharts()` (et non `drawChart(s)`) depuis les checkboxes. En mode double, le
titre « Simulation 1 / 2 » est écrit en haut à gauche de chaque cadre.

Ordre de tracé des courbes : B, C, D puis **A en dernier** (`drawOrder` dans
`drawChart()`) — A est ainsi peint par-dessus les autres là où elles se superposent,
ce qui compte surtout au démarrage (N0_A = N0_B par défaut : A et B coïncident
exactement, sans ce choix la courbe B masquerait A).

#### Survol (coordonnées du point le plus proche)

`s.chartHover` mémorise la position souris (mise à jour par les listeners `mousemove`/
`mouseleave` attachés une fois par canvas dans `attachChart`). À chaque `drawChart()`,
`_drawChartHover()` cherche l'échantillon temporel `h.t[i]` le plus proche du curseur
en X, puis, parmi les courbes visibles, celle dont le point à cet indice est le plus
proche du curseur en pixels (si deux courbes sont superposées à cet instant, seule la
plus proche du curseur est retenue). Au-delà d'un seuil de distance, rien ne s'affiche.
Rendu : lignes pointillées vers les axes, point plein de la couleur de la courbe,
bulle blanche avec `espèce | t = … s | N = …` — même pattern que `titrage/js/graph.js`
(`_drawHoverTooltip`).

---

### `js/ui.js` — Contrôles UI et boucle d'animation

**Chargé en dernier.**

#### Boucle `loop(ts)`

1. `dtReal = min(ts - lastTs, 50 ms)`
2. `dt = paused ? 0 : dtReal × speedFactor` — **le même pour toutes les simulations**
3. `stepPhysics(s, dt)` sur chaque `activeSims()` + `updateReadouts()` si `dt > 0`
4. `drawScene(s)` (récipients) puis `drawAllCharts()` si au moins une simulation a un
   nouveau point d'historique — toujours, même en pause

#### Contrôles

| Fonction | Déclencheur | Rôle |
|---|---|---|
| `togglePause()` | Bouton Lancer/Pause | Suspend/reprend (commun) |
| `onSliderSpeed(val)` | Slider vitesse | Fixe `speedFactor` (crans `SPEED_STEPS`, commun) |
| `setSimCount(n)` | Bouton Nombre de simulation(s) | Bascule `body.duo`, redimensionne les canvas, puis `resetSim()` — les molécules doivent être replacées dans des récipients de hauteur différente, et les deux simulations repartir ensemble |
| `onSliderT(i, val)` | Slider T de la simu `i` | `setTemperature(sims[i-1], …)` |
| `onSliderNA(i, val)` / `onSliderNB(i, val)` | Sliders N_A/N_B de la simu `i` | `setSpeciesCount(sims[i-1], …)` |
| `resetSim()` | Bouton RAZ | Défini dans `sim.js`, RAZ de toutes les simulations affichées, appelle `syncUIToSim()` |
| `syncUIToSim()` | Init + reset | Synchronise sliders/labels/readouts des deux simulations |

---

## Ordre de chargement et dépendances

```
index.html
  └── js/sim.js         expose : createSim, sims, simCount, activeSims, paused,
  │                                speedFactor, SPECIES_COLORS, T_REF,
  │                                MOL_RADIUS_FRAC, SUBSTEPS, randomVelocity,
  │                                countSpecies, initMolecules, setTemperature,
  │                                setSpeciesCount, stepPhysics, resetSim
  │
  └── js/recipient.js    dépend de : sims, MOL_RADIUS_FRAC, SPECIES_COLORS
  │                       expose : attachCanvas, resizeAll, resizeRecipient,
  │                                drawScene, drawSphere
  │
  └── js/graph.js        dépend de : sims (history, chartVisible), SPECIES_COLORS
  │                       expose : attachChart, resizeChartAll, resizeChart,
  │                                drawChart, drawAllCharts, buildChartLegend
  │
  └── js/ui.js            dépend de : tous les fichiers précédents
                          expose : togglePause, onSliderSpeed, setSimCount, onSliderT,
                                   onSliderNA, onSliderNB, syncUIToSim, updateReadouts
                          démarre : init() → requestAnimationFrame(loop)
```

## Points sensibles

- **Anti-tunneling** : nombre de sous-pas **adaptatif** (4 à 32), recalculé à chaque
  frame par `_requiredSubsteps()` d'après la vitesse de la molécule la plus rapide.
  Contrairement à `pression/` (4 sous-pas fixes), le slider de vitesse d'animation
  multiplie ici `dt` jusqu'à ×4 : à T élevée, un nombre fixe laisserait les molécules
  rapides se traverser et ferait manquer des chocs efficaces A+B.
- **Réaction vs choc élastique** : la même boucle `_collidePairs()` gère les deux cas ;
  seule la paire {A,B} déclenche la réaction (`_isReactive()`), toute autre paire
  (même type, ou impliquant C/D) subit un choc élastique standard.
- **Recyclage d'objets** : une réaction modifie `type`/`vx`/`vy` en place sur les objets
  existants (`mols[i]`, `mols[j]`) plutôt que de faire un `splice`/`push`, pour ne pas
  perturber les indices de la boucle `i<j` en cours.
- **Historique non borné** : le tableau `history` croît sans limite (pas de fenêtre
  glissante) — l'élève doit pouvoir revoir le début de la courbe même après une
  expérience longue, sans que les premiers points ne s'effacent. À 5 points/s, cela
  reste négligeable en mémoire (quelques centaines de points par minute).

### Performance

Trois optimisations, motivées par des ralentissements observés à fort N :

1. **Grille spatiale pour les collisions** (`_collidePairs`). Un balayage naïf de toutes
   les paires est en `O(N²)` : à N = 300 et 4 sous-pas, ~180 000 tests par frame, soit
   ~11 M/s. Les molécules sont donc rangées dans une grille de cellules de côté
   `2 × diamètre` ; chacune n'est testée que contre sa cellule et les 8 voisines, ce qui
   ramène le coût à `O(N)` (le nombre de voisins par cellule dépend de la densité, pas
   de N). Les buckets sont réutilisés d'une frame à l'autre (`_grid`), seule leur
   `length` est remise à 0 — pas de réallocation. La grille vit **sur l'instance**
   (`s._grid`) : en mode 2 simulations, deux jeux de molécules sont traités dans la
   même frame et ne doivent pas partager les buckets.
   Les décalages de `_GRID_NEIGHBOURS` ne couvrent que les voisines « en avant »
   (droite, bas-gauche, bas, bas-droite) pour ne traiter chaque paire qu'une fois.
2. **Graphe redessiné seulement quand il change** : `s.historyDirty` est levé par
   `recordHistoryPoint()`, donc `drawChart()` ne tourne que ~5 fois par seconde de temps
   simulé au lieu de 60 fps — le tracé complet (grille, graduations, textes, jusqu'à
   600 points × 4 courbes) était le deuxième poste de coût.
3. **Readouts du panneau à 10 Hz** (`READOUT_PERIOD` dans `ui.js`) plutôt qu'à chaque
   frame : évite 4 écritures DOM par frame et les recalculs de mise en page associés.

Le rendu du récipient (`drawScene`), lui, reste à 60 fps — c'est l'animation elle-même.
