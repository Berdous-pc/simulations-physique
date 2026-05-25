# Architecture — Simulation Pression d'un gaz parfait

## Arborescence

```
pression/
├── index.html
├── ARCHITECTURE.md         ← ce fichier
├── css/
│   └── style.css
└── js/
    ├── sim.js
    ├── recipient.js
    └── ui.js
```

---

## Fichiers et responsabilités

### `index.html`

Structure HTML pure, sans logique ni style inline. Contient :
- la grille `<main>` avec la colonne gauche (canvas du récipient) et le panneau droit
- le `<canvas id="recipient-canvas">` pour la simulation
- les contrôles UI (boutons, sliders, afficheurs) avec leurs attributs `onclick`/`oninput`
- les balises `<script>` dans l'ordre de chargement requis

---

### `css/style.css`

Tout le CSS de la page. Suit la charte graphique du projet.

| Section | Contenu |
|---|---|
| Reset & base | `box-sizing`, `body` 100vh, `overflow: hidden` |
| Grille principale | `main` en CSS Grid : `1fr` + `clamp(200px, 22vw, 300px)` |
| Zone simulation `#sim-area` | Fond ivoire `#fdf8f0`, flex 1 |
| Panneau droit `#panel` | Fond `#e8e4de`, scrollable, `font-size: clamp(...)` |
| Boutons `.btn` | Variantes : `.btn-pause`, `.btn-play`, `.btn-raz`, `.btn-toggle-one` |
| Paramètres `.param-row` | Label + slider + hint |
| Afficheurs `.readout` | Fond blanc, valeurs `tabular-nums` |
| Grille chocs `.ro-chocs-grid` | 2×2 compteurs haut/bas/gauche/droite |
| Hint bas `.panel-hint` | Collé en bas hors scroll |

---

### `js/sim.js` — État global et physique

**Chargé en premier.** Expose les variables globales et fonctions utilisées par tous les autres fichiers.

#### Constantes

| Constante | Valeur | Rôle |
|---|---|---|
| `R_GAS` | 8,314 J·K⁻¹·mol⁻¹ | Constante des gaz parfaits |
| `N_SCALE` | 1000 | 1 mol = 1000 molécules à l'écran |
| `T_REF` | 300 K | Température de référence pour le calibrage visuel |
| `V0_PX` | calculé | Vitesse de base en px/s à T_REF (recalibré par recipient.js) |
| `MOL_RADIUS` | calculé | Rayon des molécules en px (recalibré par recipient.js) |
| `MOL_RADIUS_FRAC` | 0,018 | Fraction de la largeur intérieure du récipient |
| `SUBSTEPS` | 4 | Sous-pas par frame (anti-tunneling) |
| `WALL_RATE_WINDOW` | 1000 ms | Fenêtre temporelle pour le comptage des chocs/s |

#### Objet `sim`

| Propriété | Type | Rôle |
|---|---|---|
| `T_K` | K | Température courante |
| `n_mol` | mol | Quantité de matière (= `Nmol / N_SCALE`) |
| `V_L` | L | Volume courant (1,0 → 10,0 L) |
| `Nmol` | entier | Nombre de molécules à l'écran |
| `pistonY` | px | Position visuelle courante du piston |
| `pistonTargetY` | px | Position cible (lissage) |
| `molecules[]` | `{x,y,vx,vy}[]` | État de chaque molécule |
| `paused` | bool | Simulation suspendue |
| `showCollisionRate` | bool | Affichage des overlays chocs/s |
| `wallHits` | `{top,bottom,left,right}` | Horodatages des chocs (ms simulé) |
| `wallRate` | `{top,bottom,left,right}` | Chocs/s mis à jour à 10 Hz |
| `P_Pa` | Pa | Pression calculée par PV=nRT |
| `simTime` | ms | Temps simulé cumulé (fenêtre glissante) |
| `boxLeft/Right/Bottom` | px | Bords intérieurs du récipient |
| `boxTopMax/Min` | px | Positions piston à V_max/V_min |

#### Fonctions exposées

| Fonction | Rôle |
|---|---|
| `updatePressure()` | Calcule `sim.P_Pa = n·R·T/V` |
| `fmtPressureNice(P)` | Formate P en Pa (décimal si < 10 000, sinon notation scientifique avec exposants Unicode) |
| `initMolecules()` | Peuple la boîte sans chevauchement, vitesses à `v0·√(T/T_REF)` |
| `setTemperature(T)` | Rescaling instantané `v ← v·√(T_new/T_old)` |
| `setMoleculeCount(N)` | Ajoute/retire des molécules incrémentalement |
| `setVolume(V_L)` | Met à jour `pistonTargetY` |
| `stepPhysics(dt_ms)` | Un pas de temps : `SUBSTEPS` × (avance + parois + paires) |
| `pushMoleculesDownFromPiston()` | Repousse les molécules quand le piston descend |
| `updateWallRates()` | Purge + décompte → `sim.wallRate` |
| `resetSim()` | Remet tout à zéro |

---

### `js/recipient.js` — Rendu canvas

**Chargé après `sim.js`.** Prend en charge tout le rendu graphique.

#### Variables exposées

- `canvas` / `ctx` — références au canvas et à son contexte 2D
- `resize()` — redimensionne le canvas et recalcule la géométrie (avec anti-rebond RAF)
- `drawScene()` — efface et redessine l'intégralité d'une frame

#### Rendu dans l'ordre

1. Fond ivoire (`#fdf8f0`)
2. Fond intérieur de la boîte (`#f5f0e8`)
3. 3 parois fixes (gauche, droite, bas) en `#2c3e50`
4. Piston animé (tige + corps hachuré + contour + flèche indicative)
5. Molécules (disques `#2a6aaa` + reflet)
6. Overlays chocs/s (si `sim.showCollisionRate`) : étiquettes à l'extérieur de chaque paroi, dessinées dans le canvas (pas en DOM)

#### Géométrie recalculée dans `resize()`

- `sim.boxLeft/Right/Bottom` — bords intérieurs de la boîte
- `sim.boxTopMax` — position Y du piston quand V = 10 L
- `sim.boxTopMin` — position Y du piston quand V = 1 L
- `MOL_RADIUS` = `innerWidth × MOL_RADIUS_FRAC`
- `V0_PX` = `innerWidth × 0,22` (vitesse de base en px/s à T_REF)

---

### `js/ui.js` — Contrôles UI et boucle d'animation

**Chargé en dernier.** Orchestre tout.

#### Contrôles

| Fonction | Déclencheur | Rôle |
|---|---|---|
| `togglePause()` | Bouton Play/Pause | Suspend/reprend la simulation |
| `onSliderT(val)` | Slider T | Appelle `setTemperature()`, met à jour le label |
| `onSliderN(val)` | Slider n | Appelle `setMoleculeCount()`, met à jour les labels |
| `onSliderV(val)` | Slider V | Appelle `setVolume()`, met à jour le label |
| `toggleChocs()` | Bouton toggle | Active/désactive overlays + readouts chocs/s |
| `resetSim()` | Bouton Réinitialiser | Délègue à `sim.js/resetSim()`, puis `syncUIToSim()` |
| `syncUIToSim()` | Init + reset | Synchronise les valeurs des sliders/labels avec l'état `sim` |
| `updateReadouts()` | 10 Hz | Rafraîchit N, P, chocs/s dans le panneau |

#### Boucle `loop(ts)`

Appelée par RAF à ~60 fps :

1. `dtReal = min(ts - lastTs, 50 ms)` — protection contre les grandes pauses
2. `dt = paused ? 0 : dtReal`
3. `stepPhysics(dt)` si dt > 0
4. Lissage piston : `pistonY += (target - pistonY) × 0,15`
5. `pushMoleculesDownFromPiston()` si le piston a bougé
6. `updateWallRates()` + `updateReadouts()` à 10 Hz (timers internes)
7. `drawScene()`

#### Initialisation `init()`

Appelée une seule fois au `window.load` :

```
Calcul géométrie synchrone (sans RAF)
→ initMolecules()
→ updatePressure()
→ syncUIToSim()
→ requestAnimationFrame(loop)
```

> Note : l'initialisation duplique partiellement le calcul de géométrie de `_doResize()` de recipient.js pour garantir que les dimensions sont disponibles avant le premier `initMolecules()`.

---

## Ordre de chargement et dépendances

```
index.html
  └── <script src="js/sim.js">         expose : sim, R_GAS, N_SCALE, T_REF,
  │                                             V0_PX, MOL_RADIUS, MOL_RADIUS_FRAC,
  │                                             SUBSTEPS, WALL_RATE_WINDOW,
  │                                             updatePressure, fmtPressureNice,
  │                                             initMolecules, setTemperature,
  │                                             setMoleculeCount, setVolume,
  │                                             stepPhysics, pushMoleculesDownFromPiston,
  │                                             updateWallRates, resetSim
  │
  └── <script src="js/recipient.js">   dépend de : sim, MOL_RADIUS, V0_PX, MOL_RADIUS_FRAC
  │                                    expose : canvas, ctx, resize, drawScene
  │
  └── <script src="js/ui.js">          dépend de : tous les fichiers précédents
                                       expose : togglePause, onSliderT, onSliderN,
                                                onSliderV, toggleChocs, syncUIToSim,
                                                updateReadouts
                                       démarre : init() → requestAnimationFrame(loop)
```

---

## Mapping unités réelles ↔ simulation

| Grandeur | Unité affichée | Plage | Défaut | Mapping interne |
|---|---|---|---|---|
| Température T | K | 100 → 1000 K | 300 K | Vitesse : `v = v0 × √(T/T_REF)` |
| Quantité de matière n | mol | 0,01 → 0,30 mol | 0,10 mol | `Nmol = round(n × 1000)` |
| Volume V | L | 1,0 → 10,0 L | 7,0 L | Hauteur piston proportionnelle à V |
| Pression P | Pa | calculée | ~35 600 Pa | `P = nRT/V` (SI strict) |

## Points sensibles

- **Anti-tunneling** : 4 sous-pas par frame ; à augmenter si des molécules traversent les parois à T > 800 K
- **Anti-sticking** : séparation positionnelle (+0,5 px de marge) appliquée après chaque choc paire-à-paire
- **Push du piston** : `pushMoleculesDownFromPiston()` appelé uniquement si `|ΔpistonY| > 0,1 px`
- **Calibrage `V0_PX`** : recalibré à chaque resize (`innerWidth × 0,22`), les vitesses existantes ne sont PAS rescalées au resize (pour ne pas perturber la simulation)
- **Performance** : `O(N²)` collisions ; à N=300 et 4 sous-pas, ~21 M tests/s à 60 fps — acceptable sur tout PC lycée moderne
