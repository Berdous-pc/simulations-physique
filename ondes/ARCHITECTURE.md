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
| `cols[]` | Tableau de colonnes `{x0, selected, ry}` (positions de repos, état sélection, position y jitterée) |
| `selectionMode` | Mode sélection par proximité activé |
| `selectionRadius` | Rayon de sélection adaptatif (px), recalculé en fonction de la densité |
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
- `initCols()` — initialise la grille de colonnes (particules) avec densité ∝ ρ
- `stepParticles(dt)` — no-op (le modèle colonnes n'intègre pas de vitesses)
- `rescaleThermalVelocities(K_old, K_new)` — no-op (compatibilité ascendante)
- `updateDpxData()` — snapshot 600 points de ΔP(x)
- `updateDptData(t)` — enregistrement ΔP(t) aux balises actives
- `pruneImpulses()` — supprime les impulsions expirées
- `resetAnim()` — RAZ sans toucher aux paramètres utilisateur, reinit colonnes
- `selectNearbyParticles(x0_click, modifiers)` — sélectionne/ajoute/retire les colonnes dans un rayon (NEW)

---

### `js/tube.js` — Rendu canvas et interactions

**Chargé après sim.js.**

#### Variables exposées
- `tubeCanvas`, `tubeCtx` — références canvas

#### Fonctions exportées
- `resizeTube()` — redimensionne le canvas, recalibrise `C_BASE`, reinit colonnes
- `scheduleResizeTube()` — anti-rebond resize avec `requestAnimationFrame`
- `drawTube()` — dessine : fond tube, membrane, colonnes, balises
- `clearSelection()` — désélectionne toutes les colonnes

#### Splitter draggable (IIFE `initSplitter`)
Ajuste les hauteurs de `#anim-area` et `#graph-area` par `pointerdown/move/up`.

#### Interactions canvas tube (IIFE `initTubeInteractions`) — REFONTE v2 (NEW)
**Ancien système (v1)** : rectangle de sélection par clic-glissé
**Nouveau système (v2)** : sélection par proximité avec modifieurs clavier
- `pointerdown` : priorité balise-drag → appel `selectNearbyParticles()` si mode actif
- `pointermove` : curseur adaptatif (`grab` balise, `crosshair` sélection, `default` normal)
- `pointerup` : aucune action (sélection appliquée immédiatement à `pointerdown`)
- **Modifieurs clavier** :
  - **Clic normal** : efface tout, sélectionne colonnes dans le rayon
  - **Ctrl+clic** : ajoute colonnes du rayon à la sélection actuelle
  - **Maj+clic** : retire colonnes du rayon de la sélection actuelle

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
  │               initCols, stepParticles, rescaleThermalVelocities,
  │               updateDpxData, updateDptData, pruneImpulses, resetAnim,
  │               selectNearbyParticles (NEW)
  │
  └── tube.js    dépend de : sim.js, selectNearbyParticles
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

---

## Système de sélection de particules (v2 — proximité) [NEW]

### Principes pédagogiques

**Objectif** : L'utilisateur observe que les colonnes oscillent autour d'une position d'équilibre et ne se déplacent **pas macroscopiquement** au passage de l'onde.

**Mécanique** :
- Chaque colonne possède une position de repos **x0** (fixe en grille).
- À chaque frame, sa position affichée = `tubeLeft + x0 + u(x0, t)`, où `u()` est le déplacement d'onde (petit).
- L'agitation thermique randomise les **positions y** (verticales) à chaque frame, mais les **x0** sont déterministes.
- Le système de sélection capture des groupes cohérents de colonnes (proche x0s voisins) pour que l'utilisateur suive visuellement leur mouvement oscillatoire.

### Rayon adaptatif

Le rayon `sim.selectionRadius` se recalcule automatiquement dans `initCols()` pour rester proportionnel à la densité des colonnes :

```javascript
var dx0 = slot;  // espacement moyen entre colonnes
sim.selectionRadius = Math.max(20, Math.min(40, 1.5 * dx0));
```

**Bornes** :
- Min 20 px : assure une cible souris confortable
- Max 40 px : capture ~2-3 colonnes pour isoler un phénomène local
- Nominal : 1.5× l'espacement spatial moyen

**Adaptation automatique** : Quand `ρ` change, `N` (nombre de colonnes) change, `dx0` change, `selectionRadius` change. Aucun paramètre utilisateur à régler.

### Interface

**Bouton** : `#btn-select` dans `#tube-top-btns` appelle `toggleSelect()` (ui.js:256)

**États** :
- `sim.selectionMode = false` : bouton inactif, aucune interaction souris
- `sim.selectionMode = true` : bouton actif (classe `.active`), curseur passe en `crosshair`

**Interaction** :
- **Clic simple** : applique `selectNearbyParticles(x0_click, {ctrl: false, shift: false})`
  - Efface l'ancienne sélection
  - Sélectionne toutes les colonnes dont `|x0 - x0_click| ≤ selectionRadius`
- **Ctrl+clic** : `selectNearbyParticles(x0_click, {ctrl: true, shift: false})`
  - Ajoute les colonnes du rayon à la sélection actuelle
- **Maj+clic** : `selectNearbyParticles(x0_click, {ctrl: false, shift: true})`
  - Retire les colonnes du rayon de la sélection actuelle

**Retrait** : `toggleSelect()` quand le bouton est actif appelle `clearSelection()`, vidant `sim.cols[].selected`.

### Rendu

Les colonnes sélectionnées sont dessinées en **rouge** (`#b04020`) dans `tube.js:_drawParticles()` (pass 2).
Les colonnes non-sélectionnées sont en **bleu** (`#2a6aaa`) (pass 1).

En mode pression, les colonnes sont affichées selon leur ΔP (couleurs dégradées), indépendamment de leur état de sélection (pas de contour distinctif pour garder l'interface épurée).

### Interaction avec le mode pression

Les deux modes (sélection et pression) sont **mutuellement exclusifs** :
- Quand l'utilisateur active "Colorier selon la pression" :
  - Le bouton "Sélectionner" est désactivé (`disabled`) et grisé (opacity 60%)
  - La mode sélection est force-désactivé (`sim.selectionMode = false`)
  - Toute sélection active est annulée
  - Curseur passe en `not-allowed`
- Quand l'utilisateur désactive "Colorier selon la pression" :
  - Le bouton "Sélectionner" est réactivé et peut être utilisé normalement

Cela évite la confusion visuelle entre les deux modes d'affichage des colonnes.
