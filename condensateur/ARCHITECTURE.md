# Architecture — Simulation Condensateur Plan (Circuit RC)

## Arborescence

```
condensateur/
├── index.html
├── ARCHITECTURE.md         ← ce fichier
├── css/
│   └── style.css
└── js/
    ├── sim.js
    ├── circuit.js
    ├── graph.js
    └── ui.js
```

---

## Fichiers et responsabilités

### `index.html`

Structure HTML pure, sans logique ni style inline. Contient :
- le `<header>` avec le titre de la simulation
- la grille `<main>` avec la colonne gauche (circuit + splitter + graphes) et le panneau droit
- les balises `<canvas>` (`#circuit-canvas`, `#graph-Uc`, `#graph-i`)
- les contrôles UI (boutons, sliders, afficheurs) avec leurs attributs `onclick`/`oninput`
- les balises `<script>` dans l'ordre de chargement requis (voir section Dépendances)

---

### `css/style.css`

Tout le CSS de la page. Organisé dans cet ordre :

| Section | Contenu |
|---|---|
| Reset & base | `box-sizing`, `body` flex colonne, `overflow: hidden` |
| Header | Bandeau titre |
| Grille principale | `main` en CSS Grid : `1fr` + `clamp(200px, 280px, 22vw)` |
| Colonne gauche `#left-col` | Flex colonne contenant circuit, splitter, graphes |
| Zone circuit `#circuit-area` | Fond ivoire `#fdf8f0`, `flex: 3` |
| Splitter `#left-splitter` | Barre `6px`, `cursor: row-resize`, bleu au survol/drag |
| Panneau droit `#panel` | Fond `#e8e4de`, `overflow-y: auto`, `font-size: clamp(...)` |
| Zone graphes `#graph-area` | Flex colonne, `flex: 2` |
| Barre de contrôle graphes | Boutons gauche (mode + sélecteurs `.graph-select`) et droite (réticule/zoom/pan). Dimensions pilotées par les variables `--gctl-*` posées sur `#graph-area` |
| Canvases graphes | `.graph-wrap` porte le cadre (bordure, `border-radius: 8px`, ombre) ; le `canvas` le remplit bord à bord |
| Panneau — composants | `.section-title`, `.param-row`, `.btn`, `.readout`, `#state-indicator` |
| Contrôle | `.panel-title`, `.panel-section`, `.sep`, `#btn-playpause`, `.slider-ticks` |
| Options | `.btn-toggle-one#btn-toggle-graph` — masque/affiche `#graph-area` + `#left-splitter` (classe `#left-col.graph-off`) |

---

### `js/sim.js` — État global et physique

**Chargé en premier.** Expose les variables et fonctions globales utilisées par tous les autres fichiers.

#### Objet `sim`

Objet central qui contient tout l'état de la simulation :

| Propriété | Type | Rôle |
|---|---|---|
| `phase` | `'idle'` \| `'charge'` \| `'discharge'` | Phase en cours |
| `t` | ms | Temps écoulé dans la phase courante |
| `tTotal` | ms | Temps total depuis le dernier reset |
| `Uc` | V | Tension aux bornes du condensateur |
| `U0_chg` / `U0_dis` | V | Conditions initiales de chaque phase |
| `E`, `C`, `R1`, `R2` | — | Paramètres physiques. `E` est la fem du générateur, notée comme sur le schéma du circuit — à ne pas confondre avec `Uc`, tension aux bornes du condensateur |
| `graphUc`, `graphI` | `{t, v}[]` | Données des courbes (Uc en V, I en mA) |
| `graphWindowMs` | ms | Largeur de la fenêtre visible (zoom X) |
| `viewOffsetMs` | ms | Bord gauche de la fenêtre visible (pan) |
| `userPanned` | bool | Désactive l'auto-scroll si vrai |
| `graphMode` | `'sync'` \| `'continuous'` | Mode d'enregistrement |
| `graphTab1` / `graphTab2` | `'Uc'` \| `'i'` \| `'q'` | Grandeur affichée sur le graphe 1 / 2 |
| `syncFrozen` | bool | Tracé figé en mode sync : intensité affichée nulle **et** tension arrivée à sa valeur finale. Les deux conditions sont nécessaires — même constante de temps mais calibres indépendants, donc seuils de résolution atteints à des instants différents |
| `paused` | bool | Simulation suspendue |
| `timeScale` | number | Facteur d'accélération (0.1 à 5) |

#### Fonctions exportées

- `tau()` — constante de temps de la phase courante (s) : `R1·C` ou `R2·C`
- `currentI()` — intensité instantanée (A)
- `fmtSig3(value)` — formate un nombre en 3 chiffres significatifs, virgule française. Écriture décimale sur `[0,01 ; 1000[`, scientifique **des deux côtés** de cet intervalle. La borne basse est indispensable : sans elle, `Uc` décroissant exponentiellement finissait affiché « 0,000000100 », puis provoquait un `RangeError: toFixed() digits argument must be between 0 and 100` vers 1e-300 (le nombre de décimales demandé suivait l'ordre de grandeur, sans borne)
- `fmtScale(value, fullScale)` — affiche une mesure sur un **calibre**, façon multimètre : le nombre de décimales vient de la pleine échelle et non de la valeur, soit 3 chiffres significatifs à pleine échelle, moins en dessous, jamais plus. Sous la résolution, l'arrondi produit un zéro **avec les décimales du calibre** (« 0,000 » sur un calibre 0,5 mA, « 0,00 » sur un calibre 5 V), pas un `0` nu. Délègue à `fmtSig3` quand `fullScale ≥ 1000`, domaine où l'écriture scientifique est le bon rendu.

  Appliqué aux encarts de valeurs instantanées (calibres `U` et `iFullScale_mA()`) et aux étiquettes de survol des graphes (calibre = étendue du cadrage vertical).

  Motivation : à chiffres significatifs constants, `i` s'affichait « 1,23×10⁻³ mA » — qui désigne en fait 1,23 µA et n'a aucun sens sur un calibre en mA. Sur un calibre 0,5 mA on lit maintenant « 0,123 mA », puis « 0,001 », puis « 0,000 ».
- `iFullScale_mA()` — calibre de l'ampèremètre (mA), pris sur la **phase courante** comme `tau()` : `U/R1` en charge, `U/R2` en décharge. À ne pas confondre avec `U/min(R1,R2)`, qui borne l'axe du graphe `i(t)` parce que celui-ci doit cadrer les deux phases. Partagé par l'encart du panneau et le critère d'arrêt du mode Synchronisé
- `scaleResolution(fullScale)` — seuil sous lequel une mesure s'affiche comme un zéro sur ce calibre. Extrait de `fmtScale()` pour être testable sans passer par le formatage : le critère d'arrêt tourne dans la boucle d'échantillonnage, où l'on ne veut pas construire une chaîne par point
- `fmtMs(ms)` — formate une durée en "X ms" ou "X s"
- `fmtTau(ms)` — formate une constante de temps
- `minTimeWindowMs()` — fenêtre minimale = **cap du zoom avant**, calé sur `τ/20` (plancher 1 ms). Sans cap, les graduations finissaient par partager tous leurs chiffres de poids fort. Calé sur τ et non sur une durée fixe, parce que c'est τ qui donne l'échelle du phénomène ; laisse un facteur ~400 entre la vue « Adapter » et le zoom maximal
- `setTimeWindow(ms)` — modifie la fenêtre d'affichage, en la bornant par `minTimeWindowMs()`
- `autoTimeWindow()` — recale la fenêtre sur `20τ × GRAPH_WINDOW_MARGIN` (τ de la phase courante) et réactive l'auto-scroll. Appelée une fois au chargement de `sim.js` pour poser le cadrage initial
- `resetGraphs()` — vide les tableaux de points et remet la vue à t=0

---

### `js/circuit.js` — Dessin du circuit et système d'électrons

**Chargé après `sim.js`.** Prend en charge tout le rendu du canvas `#circuit-canvas`.

#### Repère virtuel

Le schéma est dessiné **dans un repère fixe `VW × VH` = 1200 × 700**, ramené au
canvas par une homothétie unique appliquée en tête de `drawScene()`
(`translate(view.ox, view.oy)` puis `scale(view.k, view.k)`, avec
`k = min(W/VW, H/VH)` et centrage type letterbox).

Motivation : l'ancien `circuitScale()` valait `√(min(W/1200, H/700))`, si bien
que **le dessin rétrécissait deux fois plus vite que le texte**. En dessous
d'environ 520 px de haut pour la zone circuit — c'est-à-dire dès un portable
1366×768 avec les graphes affichés — l'étiquette `E` était plaquée en haut du
canvas par un `Math.max` de garde et mordait sur le générateur. Avec une
homothétie stricte, ce qui ne se chevauche pas à la taille de référence ne peut
plus se chevaucher à aucune taille ni aucun format.

Corollaires : toutes les constantes du fichier sont des longueurs de la maquette
(plus aucun facteur d'échelle disséminé) ; `pt` et la longueur des chemins
d'électrons deviennent indépendants de la taille de la fenêtre, donc le nombre
d'électrons sur le fil ne saute plus au redimensionnement.

- `computeView()` — calcule `view = {k, ox, oy}` ; appelée par `resize()`
- `textScale()` — grossissement du texte, `min(1.35, max(1, 0.5/k))`. Compense
  l'illisibilité des étiquettes sur une zone courte. **Plafonné**, et la maquette
  réserve la place correspondant au grossissement maximal : le boost ne peut donc
  pas recréer de collision
- `strokeW(v)` — épaisseur de trait bornée à ~1,1 px réel après homothétie, sinon
  les contours disparaissent sur les petites fenêtres
- `pt` — les 6 nœuds du circuit (`A`…`F`), en unités virtuelles, donc constants
- `buildPoints()` — pose les nœuds sur les marges `0,13·VW` / `0,10·VH`. Ces
  marges n'ont plus à héberger d'étiquettes : les labels des composants sont posés
  **du côté intérieur** de leur branche (`E` et `R₁` sous la branche du haut, `R₂`
  au-dessus de celle du bas), là où l'espace est libre
- `getCircuitGeometry()` — **source unique** de toute la géométrie dérivée
  (positions des composants, bornes des résistances `r1`/`r2`, armatures,
  contacts de l'interrupteur). `drawScene()` la consomme au lieu de recalculer
  les mêmes valeurs en parallèle, comme c'était le cas auparavant
- `resize()` — redimensionne le canvas circuit et les deux canvas graphes, avec
  anti-rebond `requestAnimationFrame`

#### Dessin des composants

| Fonction | Composant dessiné |
|---|---|
| `drawWire(x1,y1,x2,y2,active,discharge)` | Segment de fil |
| `drawCurrentArrow(x1,y1,x2,y2)` | Flèche rouge de courant + label "I" |
| `drawGenerator(cx,cy,r,active)` | Générateur (cercle + bornes +/− + label `E`) |
| `drawResistor(cx,cy,label,active,discharge,inside)` | Résistance ; `inside` = ±1, sens vers l'intérieur du circuit où poser le label |
| `drawCapacitor(cx,cy,active)` | Condensateur (armatures + ions + signes) |
| `drawSwitch(armLen)` | Interrupteur K (bras mobile) |

#### Couleur des branches

`branchColor(active, discharge)` / `branchFill(active, discharge)` — noir au
repos, **bleu** `#2a6aaa` sur la branche qui conduit en charge, **rouge**
`#b04020` en décharge, **gris** `#b0a898` sur la branche inactive. Appliqué aux
fils (également épaissis), au contour et au label des résistances, au générateur,
et au remplissage des armatures.

L'ancienne palette `COL.compCharge/compDischarge/compInactive` existait déjà mais
était **morte** : `drawResistor` calculait la couleur puis peignait en noir, et
les trois couleurs de fil valaient toutes `#1a1a1a`. Le seul indice d'activité
était l'épaisseur du trait.

#### Système d'électrons

Modèle discret : des électrons (billes bleues `−`) circulent le long d'un chemin normalisé `[0, 1)`.

##### Rendu des charges

`drawChargeBead(x, y, r, sign, pal, gloss)` — bille commune aux électrons
(`ELECTRON_R = 6`) et aux ions (`ION_R = 9`) : dégradé radial, liseré, et **signe
tracé au trait plutôt qu'en glyphe** — l'ancien caractère « − » rendu en police
7 px se réduisait à une tache grise après antialiasing.

Aucune bille n'est cerclée d'un halo couleur fond : les électrons doivent
**chevaucher** leur ion, un halo les en séparerait. Seuls les ions portent le
reflet spéculaire (`gloss`), qui alourdirait le rendu sur les électrons vu leur
densité le long du fil.

`drawElectronDot(x, y, alpha)` et `drawIonDot(x, y)` en dérivent.

##### Géométrie des armatures

Les électrons sont « accrochés » **en diagonale** à leur ion (`ELECTRON_OFFSETS`),
en le **chevauchant** (`CAP_OFF = 0,8 · ION_R`) : le premier en haut à droite, le
second en bas à gauche. Un site occupe donc un carré de `2·CAP_SITE_R` de côté.

Le chevauchement n'est pas qu'un choix de rendu : c'est lui qui rend le site assez
compact pour que **2 colonnes** — donc 15 rangées à 500 µF — tiennent dans la
maille du circuit avec les charges à pleine taille. Sans lui il fallait passer à 3
colonnes ou rapetisser les billes.

`CAP_IONS_COLS` se bascule à 2 ou 3 sans rien d'autre à toucher : largeur et
hauteur d'armature sont **dérivées du contenu**
(`CAP_PLATE_W_BASE = CAP_IONS_COLS × CAP_COL_PITCH`, `capPlateH(nIons)`) au lieu
d'être figées comme avant.

Lecture de l'état par le nombre d'électrons par site : armature neutre → 1 par
ion, négative → 2 par ion, positive → ion nu.

- `nIonsFromC()` — nombre d'ions par armature, interpolé selon C (100–500 µF → 6–30 ions)
- `initElectrons()` — initialise les positions et le facteur de vitesse `wireSpeedK`
- `buildPathCharge(g)` / `buildPathDischarge(g)` — tableaux de nœuds définissant le chemin
- `pathLength(path)` — longueur totale du chemin
- `posToXY(path, p)` — convertit une position normalisée en coordonnées `(x, y, hidden)`
- `updateElectrons(path, I, dt)` — avance les électrons, gère les arrivées/départs sur les plaques
- `drawElectronsOnPath(path)` — dessine les électrons visibles sur le fil
- `updateAndDrawElectrons(dt)` — point d'entrée appelé à chaque frame

Variables d'état des électrons :

| Variable | Rôle |
|---|---|
| `nOnPlateLeft` / `nOnPlateRight` | Électrons sur chaque armature |
| `wireElectrons` | Positions normalisées ∈ [0,1) des électrons sur le fil |
| `wireN0` | Nombre d'électrons dans le fil au début de la phase |
| `wireSpeedK` | Facteur de calibration de la vitesse |
| `wireSettled` | Vrai quand les plaques ont atteint leur état final |

#### Scène complète

- `drawScene(dt)` — efface le canvas et redessine l'intégralité du circuit + électrons à chaque frame

#### Splitter draggable

IIFE `initSplitter()` attachée au chargement du fichier. Gère le redimensionnement par glisser-déposer entre `#circuit-area` et `#graph-area`.

---

### `js/graph.js` — Graphes interactifs

**Chargé après `circuit.js`.** Gère les deux canvas de graphe (`#graph-Uc`, `#graph-i`).

#### Fonctions de bascule UI

- `toggleGraphMode()` — bascule entre modes Synchronisé et Continu
- `onGraphTabChange(slot, key)` — change la grandeur (`'Uc'`/`'i'`/`'q'`) affichée sur le graphe 1 ou 2
- `graphStyleFor(key)` — couleur, échelle Y, unité et nom (`name` : `Uc`/`i`/`q`) d'une grandeur, **sans** construire la série de points (appelée à chaque `mousemove`)
- `graphDefFor(key)` — `graphStyleFor(key)` + la série de points correspondante
- `graphTimeAxis(endMs)` — `{div, unit}` : unité unique de l'axe des temps (ms ou s) pour toute la fenêtre. `fmtMs()` tranchait valeur par valeur et pouvait mélanger « 500 ms » et « 1,00 s » sur un même axe ; l'unité vit désormais dans le titre, les graduations ne portent que des nombres. `fmtMs()` reste utilisé pour les étiquettes de survol, qui se lisent seules.
- `axisFormat(step, maxAbs)` — `{suffix, fmt(v)}` : format commun à **toutes** les graduations d'un axe. Nombre de décimales imposé par le **pas seul** (borné à 6) ; écriture décimale conservée tant que les valeurs tiennent dans `[10⁻³, 10⁴[`, sinon facteur `×10ⁿ` commun sorti dans `suffix` (donc dans le titre d'axe, pas sur chaque graduation).

  Motivation : `fmtSig3()` décidait pour chaque valeur isolément, d'où des axes portant « 500 » puis « 1,00×10³ ». Effet de bord bien pire que l'esthétique — la largeur des étiquettes sert à estimer le nombre de graduations qui tiennent, et une étiquette de 8 caractères faisait tomber cette estimation à 2 graduations alors que la place ne manquait pas.

  **Pas de plafond à 3 chiffres significatifs**, volontairement : sur un axe zoomé loin de l'origine les graduations partagent leurs chiffres de poids fort (50,00 s / 50,02 s / 50,04 s…) et un tel plafond les rendait toutes identiques. Le pas venant de `niceStep()` (toujours 1/2/5 × 10ⁿ), on retombe de toute façon sur ≤ 3 chiffres significatifs dès que l'axe part de zéro — soit tous les cadrages courants.
- `toggleGraphZoom()` — active/désactive le mode zoom par sélection rectangulaire
- `toggleGraphCursor()` — active/désactive le réticule libre

#### Historique de vues

- `graphViewHistory[]` — pile de `{windowMs, offsetMs}`
- `pushGraphView()` — sauvegarde la vue courante avant un zoom
- `prevGraphView()` — dépile et restaure la vue précédente (bouton "←")

#### Interactions souris (`initGraphHover`)

Attaché aux deux canvas :

| Interaction | Comportement |
|---|---|
| Survol (défaut) | Tooltip snappé au point le plus proche de la courbe |
| Réticule libre actif | Croix pleine hauteur + coordonnées libres |
| Clic-glissé (sans zoom) | Pan horizontal de la vue |
| Clic-glissé (zoom actif) | Rectangle de sélection → zoom sur la zone |
| Molette | Zoom centré sur la position X du curseur |

#### Métriques du repère (`graphFont`, `graphPads`, `graphPadsFor`)

**Source unique** des marges et de la taille de police, partagée par le rendu et
par les handlers souris (pan, molette, rectangle de zoom) — qui codaient
auparavant trois marges gauches différentes en dur, d'où un zoom décalé par
rapport au rectangle tracé.

- `graphFont(h)` — police dérivée de la hauteur réelle du canvas :
  `max(11, min(26, h × 0,057))`. Calibré pour redonner les 22 px historiques
  à la taille de fenêtre nominale (zone graphes ≈ 385 px de haut en 1080p).
- `graphPads(cv, yMin, yMax)` — `{fs, yStep, yFmt, t, r, b, l}` ; `l` est mesuré
  sur la largeur réelle des labels Y, les autres marges dérivent de `fs`. `b` et
  `l` incluent chacun un `titleGap` (≈ `fs × 1,15`) réservé au titre d'axe, en
  plus de la bande des graduations. `yStep` et `yFmt` sont renvoyés pour que
  `drawGraph` trace exactement les graduations sur lesquelles `l` a été mesuré,
  et avec le même format.
- `graphPadsFor(canvasId)` — idem pour la grandeur affichée par ce canvas.

#### Rendu (`drawGraph`)

Paramètres : `(canvasId, data, color, yMin, yMax, yUnit, yName)`

Étapes de rendu dans l'ordre :
1. Marges et police via `graphPads` (sortie anticipée si la zone est trop petite)
2. Fond blanc, grille X (temps) avec pas "joli", grille Y avec pas "joli" —
   le **nombre** de graduations n'est pas fixe : il est déduit de la place
   disponible (largeur mesurée des étiquettes X, hauteur pour Y), sinon elles
   se chevauchaient sur une fenêtre graphique étroite ou courte. En X le
   calcul est circulaire (largeur ← format ← pas ← nombre de graduations) et
   se résout en deux passes, en partant de 6 et en redescendant —
   la ligne `y = 0` est appuyée (`rgba(44,62,80,0.38)`, 1,4 px), essentielle
   sur `i(t)` qui change de signe entre charge et décharge
3. Axes X et Y en `#2c3e50` (1,5 px), puis titres d'axes : `t (ms|s)` centré
   sous les graduations, `yName (yUnit)` pivoté à −90° le long de l'axe Y —
   chacun préfixé du `suffix` (`×10ⁿ`) de son format d'axe s'il y en a un
4. Courbe (trait plein, sans halo, `lineJoin: 'round'`)
5. Rectangle de zoom en cours (si applicable)
6. Hover : réticule libre ou point snappé selon le mode actif — l'étiquette
   est tracée par `drawHoverPill()`

#### `drawHoverPill(gc, label, ax, ay, color, pad, gw, gh, fs)`

Cartouche arrondi blanc bordé de la couleur de la courbe, placé à droite du
point si la place y est, à gauche sinon, puis recadré dans le repère. Partagé
par les deux branches de survol (réticule libre et point snappé), dont le
calcul de placement était auparavant dupliqué.

---

### `js/ui.js` — Contrôles UI et boucle d'animation

**Chargé en dernier.** Orchestre la simulation.

#### Contrôles

- `setPhase(p)` — démarre une phase charge/décharge : mémorise la condition initiale, reinitialise les électrons, injecte un point à t=0
- `togglePause()` — suspend/reprend la simulation
- `onSliderSpeed(val)` — change le facteur d'accélération via le slider Vitesse d'animation (index 0 à 4 → 0.1/0.5/1/2/5)
- `toggleGraphVisible()` — affiche/masque la zone de graphes (option « Afficher graphe », désactivée par défaut : le circuit occupe alors toute la colonne gauche)
- `resetSim()` — remet tout à zéro (état physique, graphes, électrons, UI)
- `updateParam(name, val)` — met à jour un paramètre physique depuis un slider
- `updateReadouts()` — rafraîchit les encarts de valeurs instantanées et l'indicateur d'état

#### Boucle d'animation `loop(ts)`

Appelée par `requestAnimationFrame` à ~60 fps :

1. Calcule `dtReal` (temps réel, plafonné à 50 ms)
2. Calcule `dt` simulé = `dtReal × timeScale`, mis à zéro si simulation arrêtée
3. Avance `sim.t` et `sim.tTotal`
4. Calcule `sim.Uc` par la **solution analytique exacte** :
   - Charge : `Uc(t) = U + (U0_chg − U) × e^(−t/τ)`
   - Décharge : `Uc(t) = U0_dis × e^(−t/τ)`
5. Stocke les points de graphe avec sous-échantillonnage adaptatif (`τ/100`, plancher 0.5 ms)
6. Écrête à 8000 points par tableau (sous-échantillonnage ×2 si dépassé)
7. Auto-scroll si l'utilisateur n'a pas pané manuellement
8. Appelle `drawScene(dt)`, puis `drawGraph(...)` pour les deux graphes

#### Initialisation `init()`

Appelée une seule fois au chargement :
```
resize()          → dimensionne les canvas
initElectrons()   → place les électrons en position initiale
initGraphHover()  → attache les écouteurs souris aux graphes
updateReadouts()  → affiche les valeurs initiales
requestAnimationFrame(loop)  → démarre la boucle
```

---

## Ordre de chargement et dépendances

```
index.html
  └── <script src="js/sim.js">       expose : sim, tau, currentI, fmtSig3, fmtScale,
  │                                              fmtMs, fmtTau,
  │                                           resetGraphs, setTimeWindow, autoTimeWindow,
  │                                           minTimeWindowMs, GRAPH_WINDOW_MARGIN
  │
  └── <script src="js/circuit.js">   dépend de : sim, currentI, tau
  │                                  expose : canvas, ctx, pt, resize, buildPoints,
  │                                           VW, VH, view, computeView, textScale,
  │                                           strokeW, getCircuitGeometry,
  │                                           drawScene, initElectrons,
  │                                           buildPathCharge, buildPathDischarge,
  │                                           pathLength, wireElectrons, wireN0,
  │                                           wireSettled, ELECTRON_SPACING,
  │                                           nOnPlateLeft, nOnPlateRight,
  │                                           CAP_GAP_BASE, CAP_PLATE_W_BASE
  │
  └── <script src="js/graph.js">     dépend de : sim, setTimeWindow
  │                                  expose : drawGraph, drawHoverPill, initGraphHover,
  │                                           toggleGraphMode, onGraphTabChange,
  │                                           graphStyleFor, graphDefFor, graphTimeAxis,
  │                                           graphFont, graphPads, graphPadsFor,
  │                                           toggleGraphZoom, toggleGraphCursor,
  │                                           prevGraphView, pushGraphView
  │
  └── <script src="js/ui.js">        dépend de : tous les fichiers précédents
                                     expose : setPhase, togglePause, onSliderSpeed,
                                              toggleGraphVisible,
                                              resetSim, updateParam, updateReadouts
                                     démarre : init() → requestAnimationFrame(loop)
```

> Tous les fichiers JS utilisent le scope global (pas de modules ES). L'ordre de chargement est donc critique et doit être respecté.
