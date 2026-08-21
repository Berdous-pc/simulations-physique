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
| Boutons `.btn` | Variantes : `.btn-pause`, `.btn-play`, `.btn-raz` |
| Paramètres `.param-row` | Label + slider + hint |
| Hint bas `.panel-hint` | Collé en bas hors scroll |
| Colonne gauche `#left-col` | Flex, `container-type: size` — référentiel des unités `cq` du tableau |
| Informations `#info-panel` | Deux tableaux `.info-table` (macroscopique / chocs) ; largeur en `em` (20em), police en `min(1.75cqw, 5.5cqh)`, colonnes fixées par `<colgroup>` (38/62 partagé, pour que la séparation verticale coïncide entre les deux tableaux) |
| Fenêtre étroite / portrait | `@media (max-width: 820px), (max-aspect-ratio: 3/4)` : `#left-col` en colonne, `#info-panel` sous la simulation (`order: 1`) et ses deux tableaux côte à côte |
| Animations réduites | `@media (prefers-reduced-motion: reduce)` : transitions de l'habillage coupées |

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
| `MOL_RADIUS_FRAC` | 0,006 | Fraction de la largeur intérieure du récipient |
| `SUBSTEPS_MIN` / `SUBSTEPS_MAX` | 2 / 4 | Bornes du nombre de sous-pas par image ; le nombre effectif vient de `_substepCount()` |
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
| `speedFactor` | 0,10 → 1,00 | Facteur appliqué au pas de temps de la physique (ralenti), comme dans `ondes/` |
| `gravityFactor` | 0 → 3 | Multiplicateur de pesanteur (0 = désactivée) |
| `wallHits` | `{top,bottom,left,right}` | Horodatages des chocs (ms simulé) |
| `wallRate` | `{top,bottom,left,right}` | Chocs/s mis à jour à 10 Hz |
| `P_Pa` | Pa | Pression calculée par PV=nRT |
| `needsRedraw` | bool | Levé par tout ce qui modifie l'image ; consommé par `loop()` pour éviter de redessiner en pause |
| `simTime` | ms | Temps simulé cumulé (fenêtre glissante) |
| `boxLeft/Right/Bottom` | px | Bords intérieurs du récipient |
| `boxTopMax/Min` | px | Positions piston à V_max/V_min |

#### Fonctions exposées

| Fonction | Rôle |
|---|---|
| `updatePressure()` | Calcule `sim.P_Pa = n·R·T/V` |
| `initMolecules()` | Peuple la boîte sans chevauchement, vitesses à `v0·√(T/T_REF)` |
| `remapMoleculesToBox(o)` | Après un resize, reporte chaque molécule à la même position RELATIVE dans la nouvelle zone gaz |
| `setTemperature(T)` | Rescaling instantané `v ← v·√(T_new/T_old)` |
| `setMoleculeCount(N)` | Ajoute/retire des molécules incrémentalement |
| `setVolume(V_L)` | Met à jour `pistonTargetY` |
| `stepPhysics(dt_ms)` | Un pas de temps : `_substepCount()` × (avance + paires via la grille spatiale + parois) |
| `pushMoleculesDownFromPiston()` | Repousse les molécules quand le piston descend |
| `updateWallRates()` | Purge + décompte → `sim.wallRate` |
| `_gridBuild(cap)` / `_gridInsert(i)` / `_gridHasNeighbor(x,y)` | Grille spatiale : rangement des molécules en cellules d'un diamètre, et requête de voisinage 3×3 |
| `resetSim()` | Remet tout à zéro |

---

### `js/recipient.js` — Rendu canvas

**Chargé après `sim.js`.** Prend en charge tout le rendu graphique.

#### Variables exposées

- `canvas` / `ctx` — références au canvas et à son contexte 2D
- `resize()` — redimensionne le canvas et recalcule la géométrie (avec anti-rebond RAF)
- `drawScene()` — redessine l'intégralité d'une frame (fond opaque, pas de `clearRect`)
- `isOnPiston(x, y)` — test de saisie du piston, en px CSS ; défini à côté de `_drawPiston()` pour que la zone saisissable reste celle qui est dessinée

#### Rendu dans l'ordre

1. Fond ivoire (`#fdf8f0`)
2. Fond intérieur de la boîte (`#f5f0e8`)
3. 3 parois fixes (gauche, droite, bas) en `#2c3e50`
4. Piston animé (tige + corps hachuré + contour)
5. Molécules — recopie d'un sprite hors écran (disque `#2a6aaa` + reflet), reconstruit quand `MOL_RADIUS` ou la densité de pixels change
(les anciennes étiquettes chocs/s dessinées dans le canvas ont été remplacées par le tableau HTML `#info-panel`)

#### Géométrie recalculée dans `_doResize()`

- `sim.boxLeft/Right/Bottom` — bords intérieurs de la boîte
- `sim.boxTopMax` — position Y du piston quand V = 10 L
- `sim.boxTopMin` — position Y du piston quand V = 1 L
- `MOL_RADIUS` = `innerWidth × MOL_RADIUS_FRAC`
- `V0_PX` = `innerWidth × 0,18` (vitesse de base en px/s à T_REF)

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
| `onSliderGravity(val)` | Curseur pesanteur | Fixe `sim.gravityFactor` |
| `onSliderSpeed(val)` | Curseur vitesse | Fixe `sim.speedFactor` (×0,10 / ×0,25 / ×0,50 / ×1,00) |
| Glisser-déposer du piston | `pointerdown/move/up` sur le canvas | `_setPistonFromY()` : hauteur → volume calé sur 0,5 L, puis synchronisation du curseur V, des étiquettes et des molécules |
| `resetSim()` | Bouton Réinitialiser | Délègue à `sim.js/resetSim()`, puis `syncUIToSim()` |
| `syncUIToSim()` | Init + reset | Synchronise les valeurs des sliders/labels avec l'état `sim` |
| `updateReadouts()` | 10 Hz | Rafraîchit N, P, chocs/s dans le panneau |

#### Boucle `loop(ts)`

Appelée par RAF à ~60 fps :

1. `dtReal = min(ts - lastTs, 50 ms)` — protection contre les grandes pauses
2. `dt = paused ? 0 : dtReal × sim.speedFactor` — le facteur de vitesse ne touche que le temps SIMULÉ
3. `stepPhysics(dt)` si dt > 0
4. Lissage piston : `pistonY += (target - pistonY) × (1 - exp(-dtReal / PISTON_TAU))`
5. `pushMoleculesDownFromPiston()` si le piston a bougé
6. `updateWallRates()` + `updateReadouts()` à 10 Hz (timers internes)
7. `drawScene()` — seulement si `dt > 0` ou `sim.needsRedraw` (rien à redessiner en pause)

#### Initialisation `init()`

Appelée une seule fois au `DOMContentLoaded` :

```
_doResize()  (géométrie synchrone)
→ initMolecules()
→ updatePressure()
→ syncUIToSim()
→ requestAnimationFrame(loop)
```

> Note : `init()` appelle directement `_doResize()` (variante synchrone de `resize()`) pour que la géométrie soit connue avant le premier `initMolecules()`. Si le conteneur n'est pas encore mis en page (`_cw === 0`), `init()` se replanifie à l'image suivante.

---

## Ordre de chargement et dépendances

```
index.html
  └── <script src="js/sim.js">         expose : sim, R_GAS, N_SCALE, T_REF,
  │                                             V0_PX, MOL_RADIUS, MOL_RADIUS_FRAC,
  │                                             SUBSTEPS_MIN/MAX, WALL_RATE_WINDOW,
  │                                             updatePressure, remapMoleculesToBox,
  │                                             initMolecules, setTemperature,
  │                                             setMoleculeCount, setVolume,
  │                                             stepPhysics, pushMoleculesDownFromPiston,
  │                                             updateWallRates, resetSim
  │
  └── <script src="js/recipient.js">   dépend de : sim, MOL_RADIUS, V0_PX, MOL_RADIUS_FRAC
  │                                    expose : canvas, ctx, resize, drawScene, isOnPiston
  │
  └── <script src="js/ui.js">          dépend de : tous les fichiers précédents
                                       expose : togglePause, onSliderT, onSliderN,
                                                onSliderV, onSliderGravity, onSliderSpeed,
                                                syncUIToSim, updateReadouts
                                       démarre : init() → requestAnimationFrame(loop)
```

---

## Mapping unités réelles ↔ simulation

| Grandeur | Unité affichée | Plage | Défaut | Mapping interne |
|---|---|---|---|---|
| Température T | K | 100 → 1000 K | 300 K | Vitesse : `v = v0 × √(T/T_REF)` |
| Quantité de matière n | mol | 0,02 → 0,30 mol | 0,10 mol | `Nmol = round(n × 1000)` |
| Volume V | L | 1,0 → 10,0 L | 7,0 L | Hauteur piston proportionnelle à V |
| Pression P | Pa | calculée | ~35 600 Pa | `P = nRT/V` (SI strict) — calculée mais **pas encore affichée** |
| Vitesse d'animation | × | ×0,10 → ×1,00 | ×1,00 | Facteur sur `dt` (temps simulé uniquement) |

## Points sensibles

- **Anti-tunneling** : nombre de sous-pas calculé par `_substepCount()` d'après 3σ et la durée réelle de l'image, borné à `[SUBSTEPS_MIN, SUBSTEPS_MAX]` ; élargir `SUBSTEPS_MAX` si des molécules se traversent à T > 800 K
- **Anti-sticking** : séparation positionnelle (+0,5 px de marge) appliquée après chaque choc paire-à-paire
- **Push du piston** : `pushMoleculesDownFromPiston()` appelé uniquement si `|ΔpistonY| > 0,1 px`
- **Marges du canvas** : proportionnelles (`MARGIN_FRAC = 0,03` de `min(largeur, hauteur)`, plancher `MARGIN_MIN = 8 px`) ; la marge haute est en plus minorée par `PISTON_BODY_H + 6`, car le corps du piston dépasse le sommet du récipient à V maximum
- **Lissage du piston** : constante de temps `PISTON_TAU = 110 ms` (`1 - exp(-dt/TAU)`), et non un facteur fixe par image — indispensable pour que le mouvement soit identique à 60 et à 144 Hz
- **Démarrage** : `DOMContentLoaded` (et non `load`, qui attend le script de statistiques distant et bloquerait la page hors ligne)
- **Raccourcis clavier** : Espace = pause, R = réinitialiser ; ignorés si le focus est sur un `INPUT`/`BUTTON`
- **Glisser-déposer du piston** : `_setPistonFromY()` cale le volume sur le pas de 0,5 L du curseur — sans quoi le curseur et l'étiquette afficheraient une valeur arrondie différente de la position réelle du piston — puis appelle `pushMoleculesDownFromPiston()` explicitement : le déplacement ayant lieu entre deux images, la détection de mouvement de `loop()` compare deux valeurs déjà à jour et ne verrait rien
- **Vitesse d'animation** : `sim.speedFactor` multiplie le pas de temps de la physique, pas le lissage du piston (une commande, qui doit rester réactive) ni la période de rafraîchissement de l'affichage. La fenêtre glissante des chocs étant en temps simulé, les taux affichés restent des chocs par seconde simulée, donc justes au ralenti Crans, étiquette et nom d'état repris de `ondes/`, qui porte déjà ce curseur ; ses quatre repères utilisent `.speed-ticks` (grille `repeat(3, 1fr) 0fr`) et non `.slider-ticks`, calibré pour les cinq crans de la pesanteur
- **Typographie du panneau** : les valeurs en px fixes (`.section-title`, `.panel-hint-title`, `.panel-hint-menu-btn` à 11px ; paddings des boutons à 10/9px ; `margin-bottom` des `.param-row` à 10px) sont la convention du site — `#panel` porte déjà un `font-size: clamp(11px, 1.1vw, 14px)` dont tout le reste hérite. Les passer en `clamp()` désaligne cette page des autres : à copier telles quelles depuis `ondes/` ou `dissolution/`
- **Calibrage `V0_PX`** : recalibré à chaque resize (`innerWidth × 0,18`), les vitesses ET les positions existantes sont rescalées dans le même rapport au resize, de sorte que la trajectoire visible est inchangée (cf. `remapMoleculesToBox()`)
- **`container-type: size` sur `#left-col`** : impose une ligne `grid-template-rows: 1fr` sur `main`, la hauteur intrinsèque d'un conteneur de requête en `size` étant nulle
- **Dimensionnement du bloc d'informations** : `#info-panel` porte la police et la largeur, en `em` (20em) — la largeur nécessaire étant proportionnelle au corps du texte, seule la police est calculée, à partir des DEUX axes de `#left-col` : `min(1.75cqw, 5.5cqh)`. L'écriture précédente mélangeait les axes (police en `vh`, largeur en `vw`), ce qui donnait un texte minuscule dans une boîte immense en fenêtre large et courte, et l'inverse en fenêtre étroite et haute. Les colonnes sont fixées par `<colgroup>`. Empilés, les deux tableaux partagent le même partage 38/62, sans quoi leur séparation verticale ne coïncide pas ; côte à côte, où ce sont deux cartes indépendantes, celui des chocs reprend 25/75. À 50/50, la colonne des valeurs ne logeait plus le sous-tableau des chocs dès que la moyenne passait à deux chiffres
- **Structure en deux tableaux** : `#info-panel` contient `#it-macro` (T, n, V) et `#it-chocs`. Empilés, ils forment une seule carte — fond, bordure et arrondi sont portés par le conteneur, pas par les tableaux. En fenêtre étroite ils passent côte à côte et redeviennent deux cartes distinctes : leurs huit lignes empilées mangeaient plus de hauteur que la simulation, réduite à une bande où le récipient carré n'était plus qu'une vignette
- **`display: block` sur un `<td>`** : à proscrire. La cellule sort de l'algorithme de mise en page du tableau, cesse d'être contrainte par la largeur de sa colonne, et déborde silencieusement (c'est ce qui rognait la ligne « Moyenne » dès qu'elle passait à deux chiffres)
- **Suivi des tailles** : `window.resize` ET un `ResizeObserver` sur `#sim-area` (la zone peut changer sans que la fenêtre bouge : bascule en colonne, barre de défilement du panneau) ; les deux convergent vers `resize()`, dont l'anti-rebond n'exécute qu'un `_doResize()` par image
- **Performance** : collisions en `O(N)` via la grille spatiale (cellules d'un diamètre, voisinage 3×3) ; à N=300, ~2 700 consultations par sous-pas contre 44 850 comparaisons avec l'ancien double balayage `O(N²)`. Molécules dessinées par recopie d'un sprite hors écran plutôt que deux chemins Canvas chacune
