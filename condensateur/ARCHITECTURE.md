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
| Barre de contrôle graphes | Boutons gauche (mode/affichage) et droite (réticule/zoom/pan) |
| Canvases graphes | `.graph-wrap`, `.graph-title`, `canvas` |
| Tooltip hover | `#graph-hover-tooltip`, position absolute |
| Panneau — composants | `.section-title`, `.param-row`, `.btn`, `.readout`, `#state-indicator` |
| Contrôle du temps | `#btn-playpause`, `.btn-speed` |

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
| `U`, `C`, `R1`, `R2` | — | Paramètres physiques |
| `graphUc`, `graphI` | `{t, v}[]` | Données des courbes (Uc en V, I en mA) |
| `tAcq` | ms | Durée d'acquisition maximale |
| `graphWindowMs` | ms | Largeur de la fenêtre visible (zoom X) |
| `viewOffsetMs` | ms | Bord gauche de la fenêtre visible (pan) |
| `userPanned` | bool | Désactive l'auto-scroll si vrai |
| `graphMode` | `'sync'` \| `'continuous'` | Mode d'enregistrement |
| `graphMode1` | `'q'` \| `'Uc'` | Grandeur affichée sur le graphe gauche |
| `syncFrozen` | bool | Tracé figé (6τ atteint en mode sync) |
| `paused` | bool | Simulation suspendue |
| `timeScale` | number | Facteur d'accélération (0.1 à 5) |

#### Fonctions exportées

- `tau()` — constante de temps de la phase courante (s) : `R1·C` ou `R2·C`
- `currentI()` — intensité instantanée (A)
- `fmtMs(ms)` — formate une durée en "X ms" ou "X s"
- `fmtTau(ms)` — formate une constante de temps
- `setTimeWindow(ms)` — modifie la fenêtre d'affichage
- `autoTimeWindow()` — recale la fenêtre sur `tAcq` et réactive l'auto-scroll
- `updateAcqTime(idx)` — lit le slider de durée d'acquisition et remet à zéro
- `resetGraphs()` — vide les tableaux de points et remet la vue à t=0

---

### `js/circuit.js` — Dessin du circuit et système d'électrons

**Chargé après `sim.js`.** Prend en charge tout le rendu du canvas `#circuit-canvas`.

#### Canvas et géométrie

- `canvas` / `ctx` — références au canvas et à son contexte 2D
- `pt` — objet contenant les 6 nœuds du circuit : `A`, `B`, `C`, `D`, `E`, `F`
- `buildPoints()` — calcule les coordonnées des nœuds à partir des dimensions du canvas
- `circuitScale()` — facteur d'échelle (racine carrée du rapport taille/référence 1200×700)
- `getCircuitGeometry()` — retourne toutes les dimensions dérivées (rayons, positions des composants…)
- `resize()` — redimensionne le canvas circuit et les deux canvas graphes, avec anti-rebond `requestAnimationFrame`

#### Dessin des composants

| Fonction | Composant dessiné |
|---|---|
| `drawWire(x1,y1,x2,y2,active,discharge)` | Segment de fil |
| `drawCurrentArrow(x1,y1,x2,y2)` | Flèche rouge de courant + label "I" |
| `drawGenerator(cx,cy,r,active)` | Générateur (cercle + bornes +/−) |
| `drawResistor(cx,cy,label,active,discharge)` | Résistance (rectangle + label) |
| `drawCapacitor(cx,cy,active)` | Condensateur (armatures + ions + signes) |
| `drawSwitch(armLen)` | Interrupteur K (bras mobile) |

#### Système d'électrons

Modèle discret : des électrons (disques bleus `−`) circulent le long d'un chemin normalisé `[0, 1)`.

- `nIonsFromC()` — nombre d'ions par armature, interpolé selon C (100–500 µF → 6–30 ions)
- `initElectrons()` — initialise les positions et le facteur de vitesse `wireSpeedK`
- `buildPathCharge(g)` / `buildPathDischarge(g)` — tableaux de nœuds définissant le chemin
- `pathLength(path)` — longueur totale du chemin
- `posToXY(path, p)` — convertit une position normalisée en coordonnées `(x, y, hidden)`
- `updateElectrons(path, I, dt)` — avance les électrons, gère les arrivées/départs sur les plaques
- `drawElectronsOnPath(path)` — dessine les électrons visibles sur le fil
- `drawElectronDot(x, y, alpha)` — dessine un électron (disque bleu + "−")
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
- `toggleGraphMode1()` — bascule entre affichage q(t) et Uc(t) sur le graphe gauche
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

#### Rendu (`drawGraph`)

Paramètres : `(canvasId, data, color, yMin, yMax, yUnit)`

Étapes de rendu dans l'ordre :
1. Calcul de la marge gauche dynamique selon la largeur des labels Y
2. Fond blanc, grille X (temps) avec pas "joli", grille Y avec pas "joli"
3. Courbe avec léger halo (`shadowBlur`)
4. Rectangle de zoom en cours (si applicable)
5. Hover : réticule libre ou point snappé selon le mode actif

---

### `js/ui.js` — Contrôles UI et boucle d'animation

**Chargé en dernier.** Orchestre la simulation.

#### Contrôles

- `setPhase(p)` — démarre une phase charge/décharge : mémorise la condition initiale, reinitialise les électrons, injecte un point à t=0
- `togglePause()` — suspend/reprend la simulation
- `setTimeScale(v)` — change le facteur d'accélération (0.1 à 5)
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
  └── <script src="js/sim.js">       expose : sim, tau, currentI, fmtMs, fmtTau,
  │                                           resetGraphs, setTimeWindow, autoTimeWindow,
  │                                           updateAcqTime, TIME_VALUES
  │
  └── <script src="js/circuit.js">   dépend de : sim, currentI, tau
  │                                  expose : canvas, ctx, pt, resize, buildPoints,
  │                                           circuitScale, getCircuitGeometry,
  │                                           drawScene, initElectrons,
  │                                           buildPathCharge, buildPathDischarge,
  │                                           pathLength, wireElectrons, wireN0,
  │                                           wireSettled, ELECTRON_SPACING,
  │                                           nOnPlateLeft, nOnPlateRight,
  │                                           CAP_GAP_BASE, CAP_PLATE_W_BASE
  │
  └── <script src="js/graph.js">     dépend de : sim, setTimeWindow
  │                                  expose : drawGraph, initGraphHover,
  │                                           toggleGraphMode, toggleGraphMode1,
  │                                           toggleGraphZoom, toggleGraphCursor,
  │                                           prevGraphView, pushGraphView
  │
  └── <script src="js/ui.js">        dépend de : tous les fichiers précédents
                                     expose : setPhase, togglePause, setTimeScale,
                                              resetSim, updateParam, updateReadouts
                                     démarre : init() → requestAnimationFrame(loop)
```

> Tous les fichiers JS utilisent le scope global (pas de modules ES). L'ordre de chargement est donc critique et doit être respecté.
