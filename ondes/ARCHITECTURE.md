# Architecture — Simulation Propagation d'une Onde Sonore

## Arborescence

```
ondes/
├── index.html
├── ARCHITECTURE.md         ← ce fichier
├── css/
│   └── style.css
└── js/
    ├── sim.js
    ├── tube.js
    ├── graph.js
    └── ui.js
```

---

## Fichiers et responsabilités

### `index.html`
Structure HTML pure. Contient :
- `<main>` en CSS Grid : colonne gauche (animation + splitter + graphes) + panneau droit
- `#anim-area` : flex-row avec `#source-box` (HTML) et `#tube-container` (canvas)
- `#left-splitter` : barre draggable 6 px
- `#graph-area` : barre de contrôle graphes + canvas graphe
- `#panel` : onglets Corde/Son/Vagues + sections + bandeau Instructions

---

### `css/style.css`
Tout le CSS. Sections principales :
- Reset + body/main (grid 1fr + clamp panneau)
- `#anim-area` (flex-row), `#source-box`, `#tube-container`, `#tube-top-btns`
- `#left-splitter`, `#graph-area`, `#graph-ctrl`
- Panneau droit : `.panel-main-tabs`, `.btn`, `.param-row`, `.readout`
- Bandeau `.panel-hint` collapsible (pattern titrage/radioactivite)

---

### `js/sim.js` — État global et physique

**Chargé en premier.** Expose l'objet `sim` et les fonctions physiques.

#### Objet `sim` (propriétés principales)

| Propriété | Rôle |
|---|---|
| `simTime` | Temps simulé cumulé (s) |
| `paused` | Animation suspendue |
| `sinusoidalActive` | Source sinusoïdale en cours |
| `sinStartTime`, `sinStopTime` | Fenêtre temporelle de la sinusoïdale |
| `impulses[]` | Liste d'impulsions actives `{startTime}` |
| `freq` | Fréquence de la sinusoïdale (Hz) |
| `rho`, `K`, `attenuation` | Paramètres du milieu |
| `c_sim`, `c_cms` | Célérité (px/s et cm/s) |
| `memAmplitude` | Amplitude de la membrane (px) |
| `particles[]` | Tableau `{x0,y0,vx,vy,dx,dy,selected}` |
| `beacon1`, `beacon2` | Balises `{active, x}` |
| `tubeLeft/Right/Top/Bottom/Length` | Géométrie du tube (px, remplie par tube.js) |
| `graphMode` | `'dpx'` ou `'dpt'` |
| `dpxData[]`, `dptData1[]`, `dptData2[]` | Données graphes |

#### Fonctions exportées

- `updateCelerite()` — recalcule `c_sim` et `c_cms`
- `memDisplacement(t_ret)` — déplacement membrane au temps retardé
- `waveDisplacement(x_px, t_sim)` — champ d'onde `u(x,t) = d_mem(t−x/c)·exp(−α·x/L)`
- `waveDeltaP(x_px, t_sim)` — surpression `ΔP = K·(u(x−h)−u(x+h))/(2h)`
- `particleRadius()` — rayon adaptatif selon densité
- `initParticles()` — initialise la grille de particules
- `stepParticles(dt)` — avance les positions (thermique + onde + rebonds)
- `rescaleThermalVelocities(K_old, K_new)` — adapte les vitesses quand K change
- `updateDpxData()` — snapshot 220 points de ΔP(x)
- `updateDptData()` — enregistrement ΔP(t) aux balises actives
- `pruneImpulses()` — supprime les impulsions expirées
- `resetAnim()` — RAZ sans toucher aux paramètres utilisateur

---

### `js/tube.js` — Rendu canvas et interactions

**Chargé après sim.js.**

#### Variables exposées
- `tubeCanvas`, `tubeCtx` — références canvas

#### Fonctions exportées
- `resizeTube()` — redimensionne le canvas, recalibrise `C_BASE`, reinit particules
- `scheduleResizeTube()` — anti-rebond resize avec `requestAnimationFrame`
- `drawTube()` — dessine : fond tube, membrane, particules, balises, rectangle sélection
- `clearSelection()` — désélectionne toutes les particules

#### Splitter draggable (IIFE `initSplitter`)
Ajuste les hauteurs de `#anim-area` et `#graph-area` par `pointerdown/move/up`.

#### Interactions canvas tube (IIFE `initTubeInteractions`)
- `pointerdown` : priorité balise-drag → sélection rectangulaire
- `pointermove` : curseur adaptatif, déplacement balise ou rectangle
- `pointerup` : applique la sélection (`_applySelection`)

#### Calibration `C_BASE`
Recalculée à chaque resize :
```
C_BASE = tubeLength / (8 × c_norm_default)
```
Garantit que l'onde traverse le tube en ~8 s aux paramètres par défaut.

---

### `js/graph.js` — Graphes interactifs

**Chargé après tube.js.**

#### Fonctions exportées
- `resizeGraph()` — redimensionne le canvas graphe
- `drawGraph()` — dispatche vers `_drawDpxGraph` ou `_drawDptGraph`
- `setGraphMode(mode)` — bascule `'dpx'` / `'dpt'`
- `toggleGraphZoom()`, `toggleGraphCursor()` — modes d'interaction exclusifs
- `autoScaleGraph()` — réinitialise l'auto-scroll/échelle
- `pushGraphView()`, `prevGraphView()` — historique de vues (bouton ←)

#### Mode ΔP(x)
- Axe X fixe 0→L_tube, affiché en cm (40 cm de simulation)
- Axe Y auto-scale sur le max(|ΔP|) courant + 18 % de marge
- Marqueurs des balises actives superposés sur le graphe

#### Mode ΔP(t)
- Auto-scroll temporel (fenêtre glissante de 30 s)
- Série orange (balise 1) + série verte (balise 2) + légende
- Pan par clic-glissé, zoom molette, zoom rectangulaire

---

### `js/ui.js` — Boucle animation et contrôles

**Chargé en dernier.**

#### Boucle `loop(ts)`
1. Calcul `dtReal` (plafonné à 50 ms)
2. `sim.simTime += dtReal` si non pausé
3. `stepParticles(dtReal)`
4. `pruneImpulses()`
5. `updateDptData()` (rate-limited 30 Hz simulé)
6. `updateDpxData()`
7. `drawTube()` + `drawGraph()`

#### Fonctions UI
- `sendImpulse()` — ajoute une impulsion à `sim.impulses`
- `toggleSinusoidal()` — démarre/arrête la source sinusoïdale
- `togglePause()` — pause / reprise
- `resetSimAnim()` — appelle `resetAnim()` + reset UI
- `setMainTab(tab)` — gestion des onglets Corde/Son/Vagues
- `onSliderFreq/Rho/K/Atten(v)` — mise à jour des paramètres
- `toggleSelect()` — mode sélection particules
- `toggleBeacon(n)` — activer/désactiver balise 1 ou 2
- `toggleHint(id)` — bandeau Instructions collapsible

---

## Ordre de chargement et dépendances

```
index.html
  └── sim.js     expose : sim, C_BASE, K_DEFAULT, RHO_DEFAULT, updateCelerite,
  │               memDisplacement, waveDisplacement, waveDeltaP, particleRadius,
  │               initParticles, stepParticles, rescaleThermalVelocities,
  │               updateDpxData, updateDptData, pruneImpulses, resetAnim
  │
  └── tube.js    dépend de : sim.js
  │               expose : tubeCanvas, tubeCtx, resizeTube, scheduleResizeTube,
  │                         drawTube, clearSelection
  │
  └── graph.js   dépend de : sim.js
  │               expose : resizeGraph, drawGraph, setGraphMode,
  │                         toggleGraphZoom, toggleGraphCursor,
  │                         autoScaleGraph, pushGraphView, prevGraphView
  │
  └── ui.js      dépend de : tous les fichiers précédents
                  expose : sendImpulse, toggleSinusoidal, togglePause,
                            resetSimAnim, setMainTab, onSlider*, toggleSelect,
                            toggleBeacon, toggleHint
                  démarre : init() → requestAnimationFrame(loop)
```

> Tous les fichiers utilisent le scope global (`var`, pas de modules ES).
> L'ordre de chargement est critique.
