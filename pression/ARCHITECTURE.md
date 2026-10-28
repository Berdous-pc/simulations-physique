# Architecture — Simulation Pression d'un gaz parfait

## Arborescence

```
pression/
├── index.html
├── ARCHITECTURE.md         ← ce fichier
├── css/
│   └── style.css
└── js/
    ├── sim.js               ← onglet Pression
    ├── recipient.js         ← onglet Pression
    ├── tf-sim.js            ← onglet Transformations : moteur en tranches
    ├── tf-molecules.js      ← onglet Transformations : molécules pilotées par le modèle
    ├── tf-scene.js          ← onglet Transformations : rendu du cylindre
    ├── tf-ui.js             ← onglet Transformations : panneau et boucle
    ├── ui.js                ← onglets, boucle et initialisation de l'onglet Pression
    └── sections-repliables.js   ← copie de titrage/, sections du panneau repliables
```

La page a deux onglets principaux : **Pression** (modèle cinétique, molécules) et **Transformations** (en construction, cf. `PLAN_TRANSFORMATIONS.md`). Deep-linking `#pression` / `#transformations`. Les deux onglets n'ont aucun code commun ; seuls `ui.js` (bascule) et la feuille de style sont partagés.

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

**Chargé après sim.js et recipient.js** (seul sections-repliables.js vient après). Orchestre tout.

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

Appelée une seule fois au `DOMContentLoaded` : `tfInit()` (onglet Transformations), puis `setMainTab()` sur l'onglet demandé par l'URL. L'onglet Pression démarre par `_initPression()` dès qu'il est affiché (tout de suite, ou à la première bascule si la page s'ouvre sur `#transformations`) :

```
_doResize()  (géométrie synchrone)
→ initMolecules()
→ updatePressure()
→ syncUIToSim()
→ requestAnimationFrame(loop)
```

> Note : `_initPression()` appelle directement `_doResize()` (variante synchrone de `resize()`) pour que la géométrie soit connue avant le premier `initMolecules()`. Si le conteneur n'est pas encore mis en page (`_cw === 0`), `_initPression()` se replanifie à l'image suivante (seulement si l'onglet est affiché).

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
  │
  └── <script src="js/sections-repliables.js">  autonome (aucune dépendance) : rend repliables
                                       les titres data-repliable du panneau (Paramètres)
```

---

## Mapping unités réelles ↔ simulation

| Grandeur | Unité affichée | Plage | Défaut | Mapping interne |
|---|---|---|---|---|
| Température T | K | 10 → 1000 K | 300 K | Vitesse : `v = v0 × √(T/T_REF)` |
| Quantité de matière n | mol | 0,02 → 0,30 mol | 0,10 mol | `Nmol = round(n × 1000)` |
| Volume V | L | 1,0 → 10,0 L | 7,0 L | Hauteur piston proportionnelle à V |
| Pression P | Pa | calculée | ~35 600 Pa | `P = nRT/V` (SI strict) — calculée mais **pas encore affichée** |
| Vitesse d'animation | × | ×0,10 → ×1,00 | ×1,00 | Facteur sur `dt` (temps simulé uniquement) |

## Points sensibles

- **Anti-tunneling** : nombre de sous-pas calculé par `_substepCount()` d'après 3σ et la durée réelle de l'image, borné à `[SUBSTEPS_MIN, SUBSTEPS_MAX]` ; élargir `SUBSTEPS_MAX` si des molécules se traversent à T > 800 K
- **Anti-sticking** : séparation positionnelle appliquée après chaque choc paire-à-paire, avec une marge de `MOL_RADIUS × 0,08` — proportionnelle au rayon et non en px fixes : ce déplacement n'est pas thermique et ne doit pas prendre le pas sur l'agitation, or à 10 K une molécule n'avance que d'environ 0,3 px par image
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


---

## Onglet Transformations

> Construit par paliers selon `PLAN_TRANSFORMATIONS.md` (palier 1 terminé : moteur, scène minimale, masse, loquet, isolation du fond, ralenti ; palier 2 terminé : mise en évidence du hors-équilibre).

### Cohabitation avec l'onglet Pression

- **Noms globaux préfixés** `tf` / `TF_` / `_tf` : l'onglet Pression occupe déjà `sim`, `canvas`, `ctx`, `resize`, `drawScene`, `loop`, `init`, `resetSim`, `togglePause`…
- **Deux colonnes gauches** dans la même cellule de grille : `#left-col` (Pression) et `#tf-left-col` (Transformations), une seule affichée. Leurs règles CSS sont communes (sélecteurs groupés).
- **Deux boucles RAF** : chacune ne calcule et ne dessine que si son onglet est affiché (`ongletPrincipal`, défini dans `ui.js`).
- **Démarrage différé de l'onglet Pression** : `_initPression()` a besoin de la taille de son canvas, nulle quand la page s'ouvre sur `#transformations`. `_initPressionEnAttente` reporte ce démarrage à la première bascule vers Pression (`setMainTab`).
- **Bandeaux Informations** : un par onglet (`#panel-hint-pression`, `#panel-hint-transformations`), `toggleHint()` agit sur celui de l'onglet affiché. Raccourcis Espace / R aiguillés vers l'onglet affiché.

### `js/tf-sim.js` — Modèle physique

Gaz parfait découpé en `TF_N = 30` tranches de même masse (lagrangien 1D), sous un piston pesant, atmosphère au-dessus. Unités SI, temps simulé en s.

| Élément | Choix |
|---|---|
| Dispositif | S = 20 cm², V₀ = 0,6 L, piston 1 kg, T₀ = 293,15 K, cylindre de 50 cm, butée basse 2 cm |
| Inertie du gaz | masse molaire de l'air (0,029 kg/mol) : **célérité réelle** (343 m/s à 293 K) |
| Schéma | saute-mouton sur grille décalée : vitesses des interfaces `u`, positions `z`, puis énergies `E` par `dE = −(P̄ + q)·dV` avec P̄ moyenne avant/après résolue exactement |
| Pas de temps | `TF_CFL × min(dz/c)` (≈ 5–12 µs) ; au plus `TF_SOUS_PAS_MAX = 30 000` sous-pas par image, au-delà `tf.limite` (vitesse réelle inférieure à la demande) |
| Viscosité artificielle | `q = −TF_CL·ρ·c·Δu` (dissipative dans les deux sens) : amortit les ondes |
| Amortissement du piston | `−b·U`, b = `TF_AMORT` (8 %) de l'amortissement critique 2√(k·M), k = γ·P·S²/V, **recalculé à chaque sous-pas** ; la chaleur dissipée est rendue au gaz, répartie entre les tranches |
| Butées | choc mou, énergie cinétique rendue au gaz |
| Conduction | entre tranches, conductivité effective `TF_LAMBDA = 2,2 W·m⁻¹·K⁻¹` (≈ 15 s pour se mettre en équilibre) |
| Fond | flux `G·(T_ext − T_tranche basse)`, G pris dans `TF_ISOLATIONS` (0 = calorifugé … 1 W/K) ; cumulé dans `tf.Qrecu` |

**Ondes exagérées** (`tf.ondesExagerees`) : l'inertie du gaz est multipliée par `TF_INERTIE_EXAGEREE = 10⁴`, dans l'équation du mouvement seulement. La célérité tombe à ~3,4 m/s (un aller-retour ≈ 0,18 s, environ le tiers de la période du piston). `tfSetOndesExagerees()` réinitialise l'expérience.

Fonctions : `tfReset()`, `tfAvancer(dt)`, `tfSetMasse(kg)`, `tfSetLoquet(bool)`, `tfSetIsolation(G)`, `tfSetOndesExagerees(bool)`, `tfTTranche(j)`, `tfMesures()` (moyennes, extrêmes des tranches, critère `equilibre` du §2.4 du plan), `tfPext()`, `tfVolume()`, `tfEnergieTotale()` (constante aux erreurs de schéma près : sert aux tests).

**Validation (Chrome headless, palier 1)** :

| Test | Résultat |
|---|---|
| Repos 60 s | dérive < 10⁻¹¹ |
| 10 / 20 / 40 kg brutaux, calorifugé | T_f = 331,82 / 370,50 / 447,85 K pour 331,82 / 370,50 / 447,84 K attendus ; V_f exact au 0,1 mL |
| Conservation de l'énergie | écart relatif ≤ 1,2·10⁻⁶ |
| 20 kg, diathermane, 150 s | T = 293,15 K, V = V_isotherme |
| Célérité | pic de l'impulsion au fond à 0,892 ms pour H/c = 0,875 ms |
| Uniformité de P (40 kg brutal) | écart max entre tranches 2,7·10⁻⁵ |
| Ralenti ×1/5000 contre ×20 | même position du piston à 0,4 µm près |
| Coût | ~1,4 ms par image à ×1 ; ×20 plafonné (~10 ms par image) quand le gaz est comprimé et chaud |
| Ondes exagérées, 10 / 20 / 40 kg brutaux | mêmes états finaux (447,81 K pour 447,84 K) ; écart de P entre tranches jusqu'à 19 à 27 % ; pic de l'impulsion au fond à 88,5 ms pour 87,5 ms attendues |
| Molécules, moitié basse des tranches plus fine (×0,5), plus froide (×0,5) ou les deux | 49,7 / 49,8 / 50,1 % des molécules dans la moitié basse en masse (attendu 50 %), moyenne sur 18 000 images |
| Molécules, gradient réel après compression et refroidissement par le fond (301 → 426 K) | 299 à 304 molécules sur 600 dans la moitié basse en masse, qui n'occupe que 45 % de la hauteur |

### `js/tf-molecules.js` — Molécules pilotées par le modèle

600 petites molécules (`TF_MOL_PAR_TRANCHE = 20` par tranche, rayon `TF_MOL_RAYON` = 0,75 % de la largeur dessinée, au moins 1,8 px). Chacune est repérée par sa tranche `j`, sa position relative `s` dans la tranche et son abscisse `x` (fraction de la largeur) : elle est donc entraînée avec le gaz (piston, ondes) sans calcul. Vitesse ∝ √T de sa tranche (`TF_MOL_VITESSE` à T0, à l'échelle du dessin), rebonds sur les parois, le fond et le piston.

**Libre parcours court** (`TF_MOL_LPM` = 8 mm d'échelle, distances tirées selon une loi exponentielle) : après chaque vol, nouvelle direction au hasard, comme dans un gaz réel où les chocs sont incessants. Les molécules restent dans leur région. La première version (180 grosses molécules en vol libre d'une paroi à l'autre) mélangeait tout : on ne voyait aucune différence entre le haut et le bas. Le libre parcours est **constant** : le faire varier comme 1/ρ biaisait la règle de passage (+11 à +14 % de molécules dans le gaz dense, mesuré).

**Dessin** (`tf-scene.js`) : molécules regroupées par tranche et colorées selon sa température (palette plus soutenue que le fond, lui-même atténué à 45 % quand les molécules sont affichées) ; traînées en option (case « Traînées »), segment derrière la molécule de longueur vitesse × `TF_MOL_TRAINEE` (0,09 s).

**Densité** : un passage de la tranche a à la tranche b est accepté avec la probabilité min(1, ρ_b·v_b / (ρ_a·v_a)), sinon la molécule rebrousse chemin. Cette règle équilibre les flux de part et d'autre de chaque limite : en régime établi, le nombre de molécules par tranche est proportionnel à la masse de gaz (identique pour toutes), quelles que soient les températures. Sans elle, des vols libres se répartissent uniformément en hauteur et le gaz froid ou comprimé n'apparaît pas plus dense.

**Temps** : agitation en temps d'affichage, multipliée par (min(1, vitesse))^(1/3) dans `tf-ui.js` : au ralenti extrême, elles dérivent lentement sans se figer ; elles ne sont jamais accélérées au-delà de ×1, où elles deviendraient illisibles. Elles ne servent à aucun calcul : P et T viennent des tranches (le bandeau Informations le dit).

### `js/tf-scene.js` — Rendu

Options d'affichage dans `tfAff` (section Affichage du panneau) : molécules, traînées, couleur selon T (gaz et molécules), sondes, profil de pression.

- **Couleur selon T** : chaque tranche est colorée du bleu (plus froide que T0) au rouge (plus chaude), en racine de l'écart saturée à ±150 K, pour que quelques kelvins se voient.
- **Sondes** : T et P de trois tranches (`TF_SONDES` : haut, milieu, bas), dans des étiquettes contre la paroi droite ; P au pascal près (kPa à trois décimales). Une étiquette est omise si le gaz est trop écrasé pour la loger.
- **Profil de pression** : P(z) − P̄ tranche par tranche, dans un cadre à droite du cylindre, à la hauteur du gaz. Échelle en Pa (1, 2, 5 × 10ⁿ, au moins 1 Pa : en deçà, ce n'est que du bruit numérique), agrandie aussitôt, resserrée après ~1 s de petits écarts. Sa largeur est retranchée de celle du cylindre (`_tfDoResize`).
- **Mention « Ondes exagérées »** en haut à gauche de la scène tant que la case est cochée.

Échelle verticale réelle (graduations en cm), cylindre **élargi** horizontalement : aussi large que la zone le permet, au plus `TF_LARG_MAX` (75 %) de sa hauteur dessinée. De bas en haut : isolant hachuré (d'autant plus épais que G est faible), paroi du fond (claire si conductrice), gaz et limites des tranches (elles se resserrent dans une compression : ondes visibles au ralenti), parois, graduations (à gauche, au-delà des goupilles), tige, plateau, masse, corps du piston hachuré, goupilles du loquet (enfoncées dans le piston : verrouillé ; reculées hors du cylindre : libéré). `tfResize()` avec anti-rebond, `window.resize` et `ResizeObserver` sur `#tf-sim-area`.

### `js/tf-ui.js` — Panneau et boucle

Afficheurs `#tf-info` à 10 Hz (temps en ms aux crans < ×1/100, P en kPa, T, V, P_ext, État). P ou T non définies (critère de `tfMesures`) : « ? » suivi de l'intervalle couvert par les tranches, jamais la moyenne. État : « À l'équilibre » (vert) ou « Hors équilibre » (terracotta). Section Affichage (repliable) : cases `tf-ck-…`, resynchronisées sur `tfAff` au chargement (un navigateur peut conserver l'état des cases au rechargement). curseur Vitesse à 7 crans `TF_VITESSES` (×1/5000 → ×20), sélecteur et bouton de masse, bouton du loquet, curseur Isolation. `tfInit()` est appelée par `ui.js`.
