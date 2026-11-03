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
    ├── tf-graph.js          ← onglet Transformations : graphes T, P, V(t) et diagramme de Clapeyron
    ├── tf-etapes.js         ← onglet Transformations : journal des étapes, lettres, instantanés
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

> Construit par paliers selon `PLAN_TRANSFORMATIONS.md` (palier 1 terminé : moteur, scène minimale, masse, loquet, isolation du fond, ralenti ; palier 2 terminé : mise en évidence du hors-équilibre ; palier 3 terminé : famille à volume imposé, 80 tranches, retrait du son ralenti, molécules selon la tranche locale ; palier 4 terminé : graphes, diagramme de Clapeyron et nouvelle disposition ; palier 5 terminé : pression de l'air de l'enceinte et température de la source, en échelon ou en rampe ; refonte R1 terminée (PLAN §10) : piston tenu ou libre sans réinitialisation, carte « Transformation » unique, escaliers, masse en blocs et en sable, vitesse adaptée ; R2 terminée : journal des étapes, lettres et couleurs par étape sur le diagramme PV, flèches de sens, état actuel mis en valeur, retour à un état, chrono des graphes figé à l'équilibre ; R3 terminée : trois manières ; palier 7 terminé : diagramme entropique T(S), sections Bilan et Gaz).

### Cohabitation avec l'onglet Pression

- **Noms globaux préfixés** `tf` / `TF_` / `_tf` : l'onglet Pression occupe déjà `sim`, `canvas`, `ctx`, `resize`, `drawScene`, `loop`, `init`, `resetSim`, `togglePause`…
- **Deux colonnes gauches** dans la même cellule de grille : `#left-col` (Pression) et `#tf-left-col` (Transformations), une seule affichée. Leurs règles CSS sont communes (sélecteurs groupés).
- **Deux boucles RAF** : chacune ne calcule et ne dessine que si son onglet est affiché (`ongletPrincipal`, défini dans `ui.js`).
- **Démarrage différé de l'onglet Pression** : `_initPression()` a besoin de la taille de son canvas, nulle quand la page s'ouvre sur `#transformations`. `_initPressionEnAttente` reporte ce démarrage à la première bascule vers Pression (`setMainTab`).
- **Bandeaux Informations** : un par onglet (`#panel-hint-pression`, `#panel-hint-transformations`), `toggleHint()` agit sur celui de l'onglet affiché. Raccourcis Espace / R aiguillés vers l'onglet affiché.

### `js/tf-sim.js` — Modèle physique

Gaz parfait découpé en `TF_N = 80` tranches de même masse (lagrangien 1D), sous un piston. Unités SI, temps simulé en s. Le piston est **tenu** ou **libre** (`tf.tenu`, `tfSetTenu()`), et passe de l'un à l'autre à tout moment, sans réinitialiser (PLAN §10.2) :

- **libre** : piston pesant, chargé (`tf.masse` = `tf.blocs` + `tf.sable`), sous l'air de l'enceinte ;
- **tenu** : la pince du **vérin** le maintient (ancien loquet), ou le mène à une hauteur visée en une durée τ (crans `TF_DUREES`, 0,5 ms à 60 s ; les plus courtes donnent un piston plus rapide que le son). Le poids et l'air de l'enceinte sont repris par la pince. Tenir un piston en mouvement l'arrête net.

| Élément | Choix |
|---|---|
| Dispositif | S = 20 cm², V₀ = 0,6 L, piston-membrane de 1 g (1 kg jusqu'à R3 : PLAN §10.5), T₀ = 293,15 K, P₀ = 101,33 kPa, cylindre de 50 cm, butée basse 2 cm |
| Inertie du gaz | masse molaire de l'air (0,029 kg/mol) : **célérité réelle** (343 m/s à 293 K) |
| Schéma | saute-mouton sur grille décalée : vitesses des interfaces `u`, positions `z`, puis énergies `E` par `dE = −(P̄ + q)·dV` avec P̄ moyenne avant/après résolue exactement |
| Pas de temps | `TF_CFL × min(dz/c)` (≈ 2–4 µs à 80 tranches) ; au plus `TF_BUDGET_MS = 8` ms de calcul par image (horloge lue tous les 64 sous-pas ; avant : 12 000 sous-pas, ~14 ms ici et bien plus sur une machine lente), au-delà `tf.limite` (vitesse réelle inférieure à la demande ; hors mode quasi statique, le message dit que le calcul suit le son, ×3 environ au plus). Vérin en marche : au plus τ/400, et un sous-pas finit pile à l'arrivée |
| Viscosité artificielle | `q = −TF_CL·ρ·c·Δu + TF_CQ·ρ·Δu²` (terme quadratique en compression seulement, pour les fronts raides), `TF_CL = 0,5`, `TF_CQ = 2`  (énergie mieux conservée sur les chocs forts). **Bug corrigé au palier 3** : le terme quadratique était soustrait, ce qui « aspirait » les tranches en compression forte et faisait diverger les chocs (50 → 13 cm en 2 ms). Elle entre aussi dans le pas de temps stable |
| Vérin | position imposée calculée exactement, z(s) = z_dép + Δz·(s − sin 2πs / 2π), s = (t − t₀)/τ (vitesse (Δz/τ)(1 − cos 2πs), nulle au départ et à l'arrivée) ; `u[N]` en est déduit à chaque sous-pas. Travail reçu par le gaz `tf.Wop` : celui de la face du piston sur la tranche du haut, avec la même pression moyenne que la mise à jour de son énergie, plus l'énergie cinétique de la demi-tranche portée par la face. `tfLancerVerin(zArr, tau)` tient le piston et le mène à zArr. **Vitesse de pointe bornée** à `TF_V_VERIN_MAX` = 400 m/s (piston supersonique possible) : `tfTauEffectif()` allonge une durée trop courte pour la course ; toutes les courses essayées (5 ↔ 50 cm) passent jusqu'à 700 m/s, énergie à 2·10⁻³ à 400 m/s. Le panneau le signale sous le curseur Durée |
| Amortissement du piston | `−b·U`, b = `TF_AMORT` (8 %) de l'amortissement critique 2√(k·M), k = γ·P·S²/V, **recalculé à chaque sous-pas** ; la chaleur dissipée est rendue au gaz **près du piston** (poids ∝ j + 1 : double de la moyenne sous le piston, presque rien au fond), là où le gaz est brassé ; une compression brutale laisse ainsi une couche chaude sous le piston (jusqu'à ~65 K d'écart pour 40 kg), qui s'uniformise en ~15 s |
| Butées | choc mou, énergie cinétique rendue au gaz |
| Conduction | entre tranches, conductivité effective `TF_LAMBDA = 2,2 W·m⁻¹·K⁻¹` (≈ 15 s pour se mettre en équilibre) |
| Fond | flux `G·(T_ext − T_tranche basse)`, G = `TF_G_PAROI[tf.paroi]` (isolant 0, peu conductrice 3·10⁻⁵ W/K, conductrice 1 W/K) ; cumulé dans `tf.Qrecu` |

**Célérité toujours réelle.** Le curseur « Vitesse du son » du palier 2 bis (inertie du gaz multipliée par r²) est retiré : sous une masse posée, le piston est de toute façon ~170 fois plus lent que le son (c/√(gL)), et c'est la famille à volume imposé qui montre le gaz inhomogène (PLAN §2.3).

`tfDurees()` : traversée du gaz par le son L/c (L hauteur actuelle), mise en équilibre thermique 4L²/(π²D) + n·Cv/G (infinie si calorifugé ; ~15,6 s diathermane à 30 cm), mise en mouvement du piston pesant.

Fonctions : `tfReset()`, `tfAvancer(dt)`, `tfSetTenu(bool)`, `tfSetIsolation(G)`, `tfAppliquer(cle, cible, duree, pasMax)`, `tfNbMarches()`, `tfLancerVerin(zArr, tau)`, `tfEnCours()`, `tfInterrompre()`, `tfDurees()`, `tfTTranche(j)`, `tfMesures()` (moyennes, extrêmes des tranches, `Pface`, critère `equilibre` du §2.4 du plan : piston tenu et vérin arrêté, ou butée, ou P_gaz = P_ext), `tfPext()`, `tfPFace()` (pression sur le piston, viscosité comprise : celle que mesure le vérin), `tfVolume()`, `tfEnergieTotale()`.

**Mode quasi statique** (`tf.qs`) : le calcul complet doit suivre les ondes sonores, pas CFL ~1 µs quand le gaz est chaud et comprimé ; au plafond `TF_SOUS_PAS_MAX`, le cran ×20 ne tenait que ×0,8 (escalier de T_ext de 500 s : 10 min à l'écran). Quand le gaz est au repos mécanique — Ec < `TF_QS_EC` = 10⁻⁷ U, écarts de P entre tranches et, piston libre, avec P_ext sous `TF_QS_P` = 2·10⁻⁵, pas en butée, vérin arrêté ou lent (τ ≥ `TF_QS_VERIN` = 200 L/c), et pas avant `tf.tReposMin` après un pas à la main sur le piston (l'oscillation d'un grain de 10 g reste sous `TF_QS_EC` : l'entrée la coupait au premier essai tombé près de la position d'équilibre, tantôt dès le premier passage, tantôt après trois oscillations, et le chemin du diagramme PV changeait d'un grain à l'autre) —, `_tfEssayerQS` (au début de `tfAvancer`, puis tous les `TF_QS_ESSAI` = 2000 sous-pas) passe en mode quasi statique : pression uniforme, conduction seule, pas limité par la stabilité de la conduction explicite (`_tfDtQS`, ~0,7 ms, au plus 20 ms). `_tfQSAppliquer` : piston libre, chaque tranche reçoit sa chaleur à P_ext constante (dE = dQ/γ, volumes (γ−1)E/P_ext, travail de l'air compté) ; piston tenu (immobile ou vérin lent), chaleur à volume constant puis ajustement adiabatique de chaque tranche à la pression commune P' qui donne le volume imposé, P'^(1/γ) = Σ V_j·P_j^(1/γ) / V, la variation d'énergie de cet ajustement allant dans W_op. Entrée (`_tfEntrerQS`) : vitesses mises à zéro, pression rendue uniforme, l'écart d'énergie rendu au gaz en chaleur. Sortie (`_tfQuitterQS`) : marche ou échelon de pression ou de masse piston libre (`_tfFixer`), piston libéré, vérin rapide, butée atteinte, retour à un instantané. Une marche d'escalier tombe toujours au début d'un sous-pas. Rien ne l'affiche : c'est une optimisation, sans effet sur les résultats.

**Piston oscillant** (`tf.osc`, variante du mode quasi statique, 03/11/2026) : après une marche sur le piston libre chargé, les ondes s'éteignent en quelques traversées du son (~1 ms), mais le piston oscille encore ~4,6 périodes (~0,25 s de période avec 7 kg posés) avant le repos ; le calcul complet suivait cette oscillation au pas CFL (~2 µs, qui rétrécit encore à mesure que le gaz se comprime et chauffe) : une suite de 50 pas 0 → 15 kg sur l'isolant, ~1 s simulée par pas, tenait ×0,98 au début et ×0,79 au pas 28 au lieu du ×5 demandé (56,5 millions de sous-pas). Ici le gaz reste à pression uniforme, toutes les tranches suivent la face en proportion de façon adiabatique (U ∝ z_N^(1−γ)), et le piston obéit à M_eff·dv/dt = S·(P − P_air) − M·g − b·v, M_eff = M + m_Tr·(Σ (z_i/z_N)² + ½) (vitesses du gaz au profil linéaire u_i = v·z_i/z_N : exactement l'énergie cinétique de `_tfEc`). Intégration par gradient discret (`_tfSousPasOsc` : point milieu, force moyenne −ΔΦ/Δz exacte, Newton sur le déplacement) : énergie totale conservée, énergie cinétique perdue = b·v̄²·dt, déposée près du piston comme en calcul complet ; puis conduction implicite à volume constant (`_tfConductionImplicite(dt, Q, true)`) et pression rendue commune (`_tfOscEgaliser`, écart d'énergie du second ordre rendu en proportion, v ajustée au changement de M_eff). Pas : min(`_tfDtQS`, période / `TF_OSC_FRAC` = 200). **Entrée** (`_tfEssayerQS` → `_tfEssayerOsc`, piston libre hors butée, quand le repos ordinaire n'est pas atteint) : écarts de P entre tranches sous `TF_QS_P`, énergie cinétique des ondes (écart au profil linéaire, `_tfEcOndes`) sous `TF_OSC_EC` = 10⁻⁹ U, période ≥ `TF_OSC_RAPPORT` = 50 traversées (rapport 2π·√(M/m_gaz) environ : piston-membrane seul, 1 g, jamais ; ~0,3 kg posés et plus) ; possible entre deux marches d'un escalier (rampe continue rapide : non). **Sortie** : marche (`_tfFixer`), piston tenu (`tfSetTenu`), butée (le sous-pas renvoie faux, le calcul complet traite le choc) ; piston au repos (critères de `_tfEntrerQS`, après `tReposMin`, sans escalier en cours) : mode quasi statique ordinaire. Banc (`TF_OSC` coupé contre actif) : 50 pas 0 → 15 kg isolant, 56,5 M sous-pas complets → 92 k complets + 55 k oscillants, T 343,226 / 343,209 K, V 404,75 / 404,80 mL, S_c 0,3835 / 0,3840 mJ/K, aucun échantillon non défini dans les deux ; 20 pas 0 → 1 kg, 6,0 M → 38 k + 22 k, T à 4 mK, S_c 0,0070 mJ/K les deux ; 5 kg posés d'un coup et 5 pas 0 → 10 kg sur fond conducteur (10 M sous-pas complets → 9 k oscillants) : états finaux et S_c identiques à 10⁻⁴ près. Les petits écarts de la suite de pas tiennent à l'instant où l'équilibre est déclaré (P à 1 ‰ de P_ext, dans un reste d'oscillation) : P finale 173,661 / 173,630 kPa.

**Rampes continues** (R3, `tfAppliquer(cle, cible, duree, pasMax, true)`) : la grandeur suit une droite de `depart` à `cible` en `duree` (`_tfAvancerRampes`, à chaque sous-pas ; la masse est du sable versé en continu). Une rampe de pression ou de masse est **lente** (`r.lente`, fixé au lancement) si elle dure au moins `TF_QS_RAMPE` = 20 fois le temps mécanique `_tfTempsMeca` (période du piston libre avec la plus grande masse et la plus forte pression de la rampe, ou traversée du gaz par le son) : le piston la suit sans osciller, et le mode quasi statique la calcule — à chaque sous-pas, `_tfQSAppliquer` comprime ou détend chaque tranche de façon adiabatique de son ancienne pression à la nouvelle P_ext (E ∝ P^((γ−1)/γ)) avant d'ajouter la chaleur ; travail de l'air avec la moyenne de P_air sur le sous-pas (`tf._PairQS`). Une rampe rapide reste en calcul complet. `tfDurees()` donne aussi les deux étapes de la mise en équilibre thermique, `interne` (4L²/(π²D)) et `paroi` (n·Cv/G).

| Test (R3, moteur ; piston de 1 g, P₀ = 101,33 kPa) | Résultat |
|---|---|
| Échelon de P_air 101 → 200 kPa, calorifugé | **Pmax/Pmin = 1,50**, P non définie 48 ms (1,0007 et jamais avec le piston de 1 kg) ; T_f 374,71 K (formule brutale 374,71) ; quasi statique dès 0,10 s ; énergie à 1,2·10⁻² J (choc fort : ~10⁻⁴ en relatif) |
| Rampe continue de P_air en 30 s, calorifugé | 356,01 K, 0,3692 L (Laplace 356,01 K, 0,3692 L) ; 100 % quasi statique, 40 456 sous-pas ; énergie à 2·10⁻⁹ J |
| Rampe continue de P_air en 10 τ_th (148 s), diathermane | 0,3044 L (isotherme 0,3040 L) ; énergie à 2·10⁻⁵ J |
| Sable versé en continu, 20 kg en 30 s, calorifugé | 355,72 K (Laplace 355,72 K) |
| Bloc de 20 kg brutal | 374,24 K (formule brutale 374,24 K) |
| Sable continu en 0,5 s (temps mécanique 0,65 s : rampe rapide) | calcul complet pendant la rampe, 356,88 K |
| Rampe continue de T_ext → 400 K en 10 τ_th, piston libre | 395,0 K et 0,8085 L en fin de rampe (isobare à 400 K : 0,8187 L) : la colonne qui s'allonge s'équilibre plus lentement, τ_th est à évaluer sur l'état final |

| Test (mode quasi statique contre calcul complet, `TF_QS` coupé) | Résultat |
|---|---|
| Isobare, T_ext 400 K, diathermane, 60 s | V 0,7990 L, T 390,37 K (385,02–399,74) identiques ; 46 503 sous-pas contre 25 234 454 ; énergie à 4·10⁻¹¹ J |
| Isochore, T_ext 400 K, 60 s | P 144,130 kPa, T 397,74 K identiques ; 55 817 contre 31 572 903 sous-pas |
| Escalier de T_ext jusqu'à 400 K en 40 s, piston libre | V 0,7608 L, T 371,72 K identiques ; 42 709 contre 22 022 151 sous-pas |
| Vérin 30 → 15 cm en 20 s, diathermane | P 214,218 kPa, T 295,58 K identiques ; 63 870 contre 33 007 900 sous-pas |
| Masse 20 kg brutale ; sable en 40 marches (calorifugé) | 370,50 K ; 354,19 K, identiques (calcul complet pendant les oscillations, quasi statique 63 % et 22 % du temps) |
| Gaz chaud et comprimé (0,374 L, 427 K), escalier de T_ext, cran ×20 | 0,3333 s simulées par image, plafond jamais atteint (avant : 0,0135 s, ×0,8) |

Le panneau affiche la vitesse réellement tenue quand le calcul plafonne encore (« Calcul trop lourd : ×0,8 atteint au lieu de ×20 », moyenne glissante `_tfVitesseAtteinte` sur ~1 s).

**Conduction implicite en mode quasi statique** (R3, `TF_QS_IMPLICITE`) : Euler rétrograde, système tridiagonal résolu par l'algorithme de Thomas (`_tfConductionImplicite` ; capacité d'une tranche à pression constante piston libre, à volume constant piston tenu ; la somme des chaleurs reçues est exactement celle du fond). Stable quel que soit le pas : `_tfDtQS` ne le limite plus que pour la précision, τ_int/100 (au plus 0,1 s), (n·Cv/G)/20, durée d'une rampe continue/400 (0,7 ms en explicite). **Pas adaptatif** : les deux premières bornes valent pour un écart de température de 1 K (entre tranches, entre la tranche du fond et la source) et s'allongent comme √(1 K / écart), jusqu'à ×1000 et 60 s ; un pas long s'arrête sur l'échantillon suivant des graphes. Avant, un gaz à l'équilibre coûtait autant qu'un gaz qui se réchauffe : ×10 000 plafonnait à ×4 600–8 700 (12 000 sous-pas par image). Cycles réversibles à ×10 000 : plus aucune image plafonnée (Stirling 59 h simulées en 21 s d'écran contre 31 s), S_c du cycle 2,1 / 4,6 / 2,3 µJ/K (Carnot / Stirling / Lenoir) contre 1,9 / 4,3 / 2,2, W et Q identiques à 10⁻⁴ J. Comparé à l'explicite (isobare, isochore, vérin 20 s et 600 s, rampe continue de P_air) : mêmes températures à 0,01–0,08 K, 20 à 120 fois moins de sous-pas (vérin 600 s, G = 0,003 : 19 510 contre 2 409 974). Le calcul complet garde la conduction explicite : son pas, fixé par le son (~1 µs), est très en deçà de sa limite. Crans de vitesse jusqu'à ×10 000 (`TF_VITESSES`, fenêtres des graphes jusqu'à 200 000 s).

**Équilibre et source** (R3) : avec un fond conducteur, `tfMesures` exige aussi |T_gaz − T_ext| < `TF_SEUIL_T`. Sans cela, un gaz uniforme qui chauffait lentement à travers un fond peu conducteur passait pour « à l'équilibre » : chrono des graphes figé et lettre du journal posée alors que le gaz évoluait encore.

**Bilan d'énergie unique** : `tfEnergieTotale()` = U + Ec (+ Ec et (M + m)·g·z du piston s'il est libre) − Q − W_air − W_op + `tf.eDecal`. W_air ne varie que piston libre, W_op que piston tenu. `_tfRecaler(fn)` applique un changement discontinu de commande (tenir, libérer, poser ou retirer une masse, à la main ou à chaque marche d'escalier) et reporte l'écart dans `eDecal` : c'est le travail de l'opérateur, et le compte reste continu (constant aux erreurs de schéma près, il sert aux tests).

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
| Son ralenti ×100, 10 / 20 / 40 kg brutaux | mêmes états finaux (447,82 K pour 447,84 K) ; écart de P entre tranches 18 à 26 % ; pic de l'impulsion au fond à 88,0 ms pour 87,5 ms attendues |
| 40 kg brutaux, son réel / ×30 / ×100 / ×300 | écart de P max 0,0 / 2,7 / 25,5 / 91 % (front net à ×300) ; états finaux exacts dans tous les cas, énergie conservée à 5·10⁻⁵ près (son ralenti retiré au palier 3) |

**Validation (palier 3, 80 tranches)** :

| Test | Résultat |
|---|---|
| 10 / 20 / 40 kg brutaux, calorifugé, 15 s | T_f = 331,82 / 370,50 / 447,84 K (inchangé) ; énergie à 2·10⁻⁷ ; écart de P max entre tranches 2,1–2,3·10⁻⁵ (gaz uniforme sous la masse) |
| Volume imposé 30 → 15 cm, calorifugé, τ = 2 / 3 / 5 / 10 / 100 / 1000 ms | Pmax/Pmin pendant la course 2,22 / 1,32 / 1,10 / 1,02 / 1,000 / 1,000 ; écart de T entre tranches 83 / 27 / 8 / 1,4 / 0 / 0 K ; T_f 390,23 / 387,36 / 386,93 / 386,87 / 386,82 / 386,81 K (Laplace 386,81) ; S_c 4,8 / 0,8 / 0,2 / 0,1 / 0 / 0 mJ/K |
| Bilan avec le vérin | W_op = ΔU à 0,01 J ; énergie (U + Ec − Q − W_op) constante à 6·10⁻⁶ (τ = 2 ms), 10⁻¹¹ (τ long) |
| Aller-retour 30 → 15 → 30 cm, calorifugé | τ = 1 s : retour à T₀ à 1 mK ; τ = 2 ms : retour 4,15 K plus chaud |
| Volume imposé 30 → 15 cm, diathermane, τ = 10 ms / 1 / 5 / 20 / 60 s | état final isotherme exact (293,15 K, 212,46 kPa) ; W 50,9 / 50,3 / 49,4 / 48,0 / 46,4 J (isotherme réversible 44,2 J) ; S_c 23,0 / 20,8 / 17,8 / 13,0 / 7,5 mJ/K : la réversibilité n'est approchée que pour τ ≫ τ_th (15,6 s à 30 cm, 8 s à 15 cm) |
| Course rapide de 50 à 13 cm (cas signalé : divergence à 370 m/s) | durée portée de 2 à 4,9 ms (150 m/s) ; P 173 à 247 kPa à mi-course, arrêt à 13,00 cm, T_f 412,6 K |
| τ = 0,5 ms, 30 → 15 / 5 / 50 cm (durée portée à 0,75 / 1,25 / 1 ms, 400 m/s) | Pmax/Pmin 11,0 / 5,3 / 6,3 ; T_f 481,1 / 703,6 / 270,3 K (Laplace 386,8 / 602 / 238 K) ; énergie à 10⁻³ |
| Coût | ~0,4–0,8 s de calcul par seconde simulée à 80 tranches : ×1 tenu, ×5 et ×20 plafonnés (`tf.limite`) à ~1,2–2,5 fois le temps réel |

#### Contraintes extérieures (palier 5)

- **P_air** (`tf.Pair`, air de l'enceinte au-dessus du piston, 0 à 500 kPa) remplace `TF_P_ATM` dans l'équation du piston et dans `tfPext()`. Son travail est cumulé dans `tf.Wair` (−P_air·S·dz à chaque sous-pas, avec le déplacement réel, butées comprises), piston libre seulement (tenu, la pince reprend tout).
- **T_ext** (`tf.Text`, source sous le fond, 250 à 600 K) ; n'agit que si G > 0.
- **Masse posée** (`tf.masse`, 0 à `TF_MASSE_MAX` = 40 kg) : `_tfChangerMasse(cible, lent)` ajoute un **bloc** (d'un coup) ou du **sable** (marche d'escalier) ; le retrait brutal prend d'abord sur les blocs, le retrait lent d'abord sur le sable.
- `tfAppliquer(cle, cible, duree, pasMax)` (`cle` = `'Pair'`, `'Text'` ou `'masse'`, refonte R1) : durée nulle = échelon ; sinon **escalier** de n = ⌈|Δ| / pasMax⌉ marches égales (`tf.rampes[cle]`), une première tout de suite puis une toutes les duree / n s. `_tfAvancerRampes()` avant chaque sous-pas.
- `tfReset()` remet P_air à l'atmosphère et T_ext à T0 (l'état initial est l'équilibre sous l'atmosphère, à T0), et arrête les rampes.
- **Butées** : `tfButee(Pmoy)` renvoie `'haute'` / `'basse'` quand le piston libre y est plaqué par le gaz (ou la charge) ; une butée compte comme tenue du piston dans le critère d'équilibre. La chaleur d'un choc sur une butée vient de la vitesse d'arrivée **avant** la force du sous-pas : un piston plaqué reprenait sinon à chaque sous-pas une vitesse que le choc transformait en chaleur créée de rien (dérive de l'énergie de 7,6·10⁻⁴ en 5 s de vide, 3,7·10⁻⁷ après correction).

| Test (palier 5, calorifugé sauf mention) | Résultat |
|---|---|
| Échelon de P_air 101,3 → 300 kPa, loquet libéré | T_f 449,79 K, V_f 0,3207 L (formule de la masse posée avec P_ext : 449,80 K, 0,3207 L) ; énergie à 2·10⁻⁶ |
| Rampe de P_air 101,3 → 200 kPa, pas de 1 kPa toutes les 0,5 s | T_f 353,84 K (Laplace 353,68 K, brutal 370,95 K) ; énergie à 10⁻⁹ |
| Vide (P_air = 0) | piston en butée haute (1 L), « hors équilibre » tant que T n'est pas uniforme ; énergie à 4·10⁻⁷ |
| Échelon de T_ext 293 → 400 K, diathermane, piston libre | V/V₀ = 1,2260 / 1,3316 / 1,3604 à 20 / 60 / 120 s (attendu 1,3645 : isobare ; la colonne, plus haute, s'équilibre plus lentement) ; énergie à 4·10⁻⁸ |

| Test (refonte R1, enchaînements sans réinitialiser, calorifugé sauf mention) | Résultat |
|---|---|
| 20 kg brutaux (bloc), piston libéré | T_f 370,50 K, V_f 0,3942 L (inchangé) |
| puis vérin 0,394 → 0,300 L en 1 s | T 413,28 K (adiabatique réversible : 413,3 K) |
| puis libéré sous P_ext = 204,3 kPa | V 0,3998 L, T 375,75 K : n·Cv·ΔT = −20,40 J pour −P_ext·ΔV = −20,41 J |
| puis bloc retiré, escalier de P_air vers 200 kPa en 10 marches (1 s) | T_f 392,97 K (Laplace 391,2 K) |
| Sable 0 → 20 kg en 40 marches de 0,5 kg (20 s) | T_f 354,23 K, V_f 0,3768 L (Laplace 353 K, 0,376 L ; bloc brutal 370,5 K) |
| T_ext 400 K, diathermane, tenu puis libéré | P suit l'isochore (P/T constant), puis détente et isobare à 106,23 kPa (V/T constant) |
| Bilan d'énergie sur toutes ces bascules | dérive ≤ 3,6·10⁻⁴ J (escalier de P_air), ~10⁻⁴ J ailleurs ; aucune NaN |

### `js/tf-molecules.js` — Molécules par bandes de gaz

Pour l'affichage, les 80 tranches du calcul sont regroupées en bandes de même masse de gaz (10 bandes de 8 tranches au plus, `TF_MOL_TOTAL` = 600 molécules en tout). Chaque bande est une petite boîte de gaz : ses molécules volent en ligne droite et rebondissent sur les parois, le fond, le piston et **les limites de leur bande, qu'elles ne franchissent jamais**. Leur position verticale `zr` est une **coordonnée de masse dans la bande**, placée dans les tranches là où elles se trouvent (`_tfMolTranche`, `tfMolZ` ; inverse `_tfMolZr`, au regroupement) : une tranche comprimée serre ses molécules, densité juste par construction **à la résolution des tranches**. Un front de compression se voit directement comme une zone de molécules serrées qui traverse le gaz, et les molécules suivent le mouvement d'ensemble de leur tranche. Avant, la position était proportionnelle à la hauteur de la bande : densité uniforme dans la bande, et le front, épais de ~3 tranches sur 8, ne se voyait pas. `zr` avance à vitesse uniforme en masse (pas divisé par la hauteur de la bande), sans quoi les molécules s'accumuleraient dans les tranches épaisses ; la vitesse verticale vue est donc multipliée par ρ̄/ρ de la tranche dans sa bande. Mesuré : vérin 30 → 15 cm en 1 ms, à 0,6 ms, densité des molécules dans les 6 tranches les plus serrées / les 6 plus larges entre 1,6 et 2,2 selon le tirage (~40 molécules par côté : bruit statistique), celle du gaz 2,22 ; par groupe de 8 tranches, ±√n de bruit statistique quand les bandes sont regroupées. Vitesse et couleur selon T **de la tranche où se trouve la molécule** (`tfMolT` : T interpolée en masse entre centres de tranches), et non la moyenne de la bande : un front, épais de quelques tranches, serait lissé. Le calcul garde ses 80 tranches : seule l'image est découpée.

**Nombre de bandes adaptatif** (`tfMolNb`, parmi `TF_MOL_NB_BANDES` = 10, 8, 5, 4, 2, 1) : une bande plus basse que `TF_MOL_BANDE_RAYONS` = 16 rayons de molécule à l'écran (au moins `TF_MOL_BANDE_PX_MIN` = 24 px) ne laisserait voir que le vol horizontal (avec 8 rayons et 10 px, le va-et-vient horizontal se voyait encore dès 15 cm) ; on prend alors moins de bandes, et on ne redécoupe qu'au-dessus de ce seuil × 1,25. Au regroupement (`_tfMolRegrouper`), les molécules sont classées par altitude et réparties à parts égales : chacune garde son altitude (au redécoupage, les rares tombées du mauvais côté d'une limite sont ramenées contre elle). Le nombre de molécules et leur taille ne changent jamais. Mesuré en compression, fenêtre 1400 × 900 (rayon 1,6 px) : 10 bandes à 30 cm, 8 à 25 cm, 5 de 20 à 15 cm, 2 de 10 à 7,5 cm, 1 en dessous ; fenêtre 1100 × 650 (rayon 1,3 px) : 5 bandes de 30 à 20 cm, 2 à 15 et 10 cm, 1 en dessous. À 3,6 cm, déplacement vertical moyen / horizontal ≈ 0,6 (0,2 avec l'ancien seuil).

**Vitesse d'agitation** : conventionnelle, `TF_MOL_VITESSE` = 0,12 m/s d'échelle à T0 (une bande au repos traversée en ~0,25 s), en temps d'affichage ; **aux crans lents, elle ralentit avec le curseur** (`_tfMolFacteurTemps`, `TF_MOL_TEMPS` : ×0,7 à ×0,1, ×0,5 à ×1/100, ×0,35 à ×1/1000, ×0,25 à ×1/5000, interpolé en log entre les crans pour les passages progressifs ; ×1 au-dessus de ×1) : un repère du ralenti, monotone et sans jamais figer le gaz, qui laisse mieux ressortir la densité d'un front. Avant le 31/10/2026, la même à tous les crans. Abandonné : agitation freinée en racine cubique du cran et tirée du temps simulé à l'échelle réelle au cran ×1/5000 (mention « Vitesses réelles ») ; la loi n'était pas monotone (×1/1000 huit fois plus lent que ×1/5000) et, dès ×1/1000, les vraies vitesses dépassent de toute façon l'échelle lisible. **Écarts exagérés** (option `tfAff.exagere`, cochée par défaut, `tfMolExagere`) : v ∝ (T/T0)³ au lieu de √(T/T0), facteur borné entre `TF_MOL_EXAGERE_MIN` = 0,12 et `TF_MOL_EXAGERE_MAX` = 5 ; une compression adiabatique de 30 à 15 cm (×1,32 en T) donne ×2,3 au lieu de ×1,15 (avec l'exposant 1,5, ×1,5, l'écart ne se voyait toujours pas) ; un gaz refroidi de 70 K va deux fois moins vite.

**Éclats de chocs** (option `tfAff.chocs`, essai) : chaque rebond sur une paroi, le fond (bande du bas) ou le piston (bande du haut) laisse un court trait clair qui s'efface en `TF_CHOC_VIE` = 0,15 s réelle (au plus `TF_CHOC_MAX` = 400) ; leur fréquence suit densité × agitation, donc la pression.

**Versions abandonnées** : (1) vols libres d'une paroi à l'autre, avec règle de passage entre tranches : tout se mélangeait ; (2) libre parcours court : l'onde restait noyée dans le bruit des positions aléatoires ; (3) molécules ancrées dans le gaz qui frémissaient autour de leur point (une puis deux rangées par tranche) : le frémissement (~1 px) laissait l'image d'un gaz figé, l'agitation thermique était invisible. Réduire les tranches du calcul lui-même a été écarté : front, gradient de T, profil et sondes seraient devenus grossiers.

**Dessin** (`tf-scene.js`) : chaque molécule a la couleur de la température à son altitude, arrondie à `TF_MOL_NUANCES` = 16 nuances de chaque côté de T0 (un chemin par nuance) ; limites des 10 bandes de repère en pointillé léger (à la place des 79 lignes de tranches), même quand les molécules sont regroupées en moins de bandes. Elles ne servent à aucun calcul : P et T viennent des tranches (le bandeau Informations le dit).

### `js/tf-scene.js` — Rendu

Options d'affichage dans `tfAff` (section Affichage du panneau) : molécules, écarts d'agitation exagérés, chocs sur les parois, couleur selon T (gaz et molécules), sondes, profil de pression, profil amplifié.

- **Couleur selon T** : chaque tranche est colorée du bleu (plus froide que T0) au rouge (plus chaude), en racine de l'écart saturée à ±150 K, pour que quelques kelvins se voient.
- **Sondes** : T et P de trois tranches (`TF_SONDES` : haut, milieu, bas), dans des étiquettes contre la paroi droite ; P au pascal près (kPa à trois décimales). Une étiquette est omise si le gaz est trop écrasé pour la loger.
- **Profil de pression** : P(z) tranche par tranche, dans un cadre à droite du cylindre, à la hauteur du gaz. Par défaut en **échelle absolue** (axe de 0 à une valeur ronde en kPa, moyenne en pointillé) : les écarts d'une compression rapide se lisent tels quels. Option **amplifiée** : P(z) − P̄ en Pa (au moins 1 Pa : en deçà, ce n'est que du bruit numérique), pour les très petits écarts de la masse posée. Échelle ronde (1, 2, 5 × 10ⁿ) agrandie aussitôt, resserrée après ~1 s de petites valeurs. Sa largeur est retranchée de celle du cylindre (`_tfDoResize`).
- **Source thermique**, toujours sous le cylindre (sous la couche d'isolant ou de paroi peu conductrice s'il y en a une) : four rouge au-dessus de T0, bain bleu en dessous (`TF_COUL_SOURCE`), température écrite dessus.
- **Enceinte** (toujours dessinée) : cloche de verre scellée sur le haut du cylindre par une collerette (`TF_Z_CLOCHE`), qui loge le vérin suspendu à son plafond ; son air, et celui qui surmonte le piston dans le cylindre, est teinté d'autant plus que P_air est forte (mention « vide » sous 0,5 kPa). Manomètre à aiguille (0 à 500 kPa) à gauche, relié à la cloche.
- **Piston en butée** : étiquette sous le piston quand `tfButee` le signale.
- **Piston, charge et vérin** : la tige du piston traverse le plateau et monte au-dessus de la charge (`TF_H_TIGE_HAUT`) ; les **blocs** sont un disque fendu enfilé sur la tige (masse écrite), le **sable** un tas de grains par-dessus : un grain dessiné par `TF_GRAIN_MAIN` = 10 g de sable posé à la main (`tf.sableMain`, tenu par `_tfChangerMasse(cible, lent, main)` pour le dessin seulement, dans les instantanés ; un retrait à la main le prend d'abord sur cette part, tout autre retrait d'abord sur le sable versé) et par `TF_GRAIN_DESSIN` = 50 g de sable versé (⌈main / 10 g⌉ + ⌈versé / 50 g⌉), plafonné à `TF_GRAINS_MAX` = 800 (8 kg à la main, 40 kg versés : au-delà, la masse croît, le tas non), carré de `TF_GRAIN_LARG` = 0,016 de la largeur du cylindre (≈ 5 px), quatre teintes contrastées (`TF_GRAIN_TEINTES`), dessiné devant la tige ; à 40 kg, le tas arrive au haut de la tige. Les places sont tirées une fois (`_tfGrains`, hasard déterministe) et rangées par la clé rang + écart au sommet plat / 1,33 + bruit de moins d'un rang : le tas garde sa forme (sommet plat, flancs inclinés, base 0,94 de la largeur), aucun grain n'est en l'air, un grain versé apparaît d'un coup et le dernier versé est le premier retiré. Masse écrite à droite de la tige, sur une étiquette claire, au-delà de 11 px de haut. Le **vérin** est suspendu à un bâti hachuré au plafond de l'enceinte (orangé pendant un mouvement) ; piston tenu, sa tige descend et sa **pince** (orangée, fermée) saisit le haut de la tige du piston ; libre, tige rétractée, pince grise ouverte. Quand l'action choisie porte sur le volume (`tfRepereVisee`), la **hauteur visée** est marquée d'un trait pointillé orangé dans le cylindre et d'un triangle sur les graduations.

Échelle verticale réelle (graduations en cm), cylindre **élargi** horizontalement : aussi large que la zone le permet, au plus `TF_LARG_MAX` (75 %) de sa hauteur dessinée. De bas en haut : couche hachurée sous le fond (`TF_EP_COUCHE` : isolant `TF_EP_ISOLANT`, peu conductrice moitié moins épaisse, conductrice aucune ; nommée « isolant » ou « peu conductrice »), paroi du fond (claire si conductrice), gaz et limites des tranches (elles se resserrent dans une compression : ondes visibles au ralenti), parois, graduations (à gauche, au-delà d'une marge `_tfMargeCote`, ancienne place des goupilles du loquet), vérin et pince, tige, plateau, charge, corps du piston hachuré. `tfResize()` avec anti-rebond, `window.resize` et `ResizeObserver` sur `#tf-sim-area`.

### `js/tf-graph.js` — Graphes et disposition de la colonne gauche

**Disposition** : `#tf-left-col` = `#tf-graph-col`, splitter `#tf-vsplit`, `#tf-sim-area`. `#tf-graph-col` : barre `.tf-barre-vues` = `#tf-choix-vues`, quatre **boutons activables** (P = f(V), T = f(S), T, P, V = f(t), Tableau ; `tfGraph.vues`, `tfGraphBasculerVue`, `_tfgMajVues`), suivis du bouton **Options ▾** (`tfGraphMenu`) et de son menu déroulant `#tf-options-menu` qui porte la **convention de tracé** (boutons radio `tf-ckg-gaz` / `tf-ckg-ext`, `tfGraphAff.ext`) et toutes les cases `tf-ckg-…` des graphes (tranches, pression sur le piston, quatre courbes de référence, chrono figé ; fermé par un clic ailleurs ou Échap), puis les encarts `#tf-pv-zone`, `#tf-hsplit-pv`, `#tf-ts-zone`, `#tf-hsplit-ts`, `#tf-temps-zone` (chacun son canvas et ses outils) et le tableau `#tf-info`. De 0 à 4 encarts : un splitter n'est affiché qu'entre deux encarts de graphe affichés ; tableau seul, il se range en haut (`.tf-sans-graphe`) ; aucun encart (`.tf-sans-encart`), la colonne se réduit à la barre, boutons empilés, et le cylindre prend la place. Par défaut : P = f(V), f(t) et tableau. Les encarts de graphe se partagent la hauteur selon leurs poids `--tf-poids-pv`, `-ts`, `-temps` (flex-grow, sur `#tf-graph-col`) ; un splitter horizontal (`_tfgSplitterH`) redistribue la somme des poids des deux encarts affichés qui l'entourent. Le splitter vertical écrit un **pourcentage** dans `--tf-larg-graphes` (sur `#tf-left-col`, 25 à 70 %, défaut 48 %), qui tient seul au redimensionnement ; la disposition étroite (cylindre en haut, colonne dessous, splitter vertical masqué) l'ignore. Un `ResizeObserver` sur les trois zones de graphe et sur `#tf-sim-area` redessine tout ce qui change de taille.

**Enregistrement** : `tfAvancer` appelle `tf.echantillon` (= `_tfgEchantillon`) dès que `tf.t` atteint `tf.tEchant`. Pas d'échantillonnage = min(durée que montrent ~20 s d'écran au cran actuel, `TF_G_FENETRES`, durée de l'axe des temps `axeT.L`) / 500, ramené à τ/200 pendant un mouvement du vérin (une compression de 2 ms reste décrite au cran ×1) ; `tfGraphReprogrammer()` rapproche l'échéance après un changement de cran ou un Lancer. Un échantillon garde t, V, moyennes et extrêmes de P et T, `Pdef`, `Tdef`, `eq`, la pression exercée par le piston (P_ext piston libre, `Pface` piston tenu) et T_ext. Au-delà de 20 000 échantillons (`TF_G_MAX`), l'historique est ramené à 10 000 par `_tfgEclaircir`, étape par étape : les étapes courtes restent entières, les longues sont réduites à un même quota, moitié sur une grille en temps, moitié par rang ; début et fin de chaque étape, passages défini ↔ non défini, bornes des séjours à l'équilibre, marches et coupures toujours gardés. (Avant : un échantillon sur deux de tout l'historique à chaque débordement. Après un cycle de Stirling quasi statique de 5 h 24 simulées au cran ×1, il ne restait qu'un échantillon de A → B, aucun de B → C, et le début de C → D, éclairci à chaque débordement, était tracé en ligne droite.) `tfGraphEffacer()` (Réinitialiser) repart de l'état initial.

**Chrono figé à l'équilibre** (option `tfGraphAff.gel`, case `tf-ckg-gel` du menu Options, cochée par défaut) : à l'équilibre et sans action en cours, `_tfgEchantillon` n'enregistre plus rien et `tfGraph.gele` passe à vrai ; le temps des graphes (`s.t` = temps simulé − `tfGraph.decal`, `tfGraphTemps()`) s'arrête, le temps simulé (`s.ts`, tableau) continue. Le chrono repart quand le gaz quitte l'équilibre, ou à toute action (`tfGraphDegeler` : l'état d'avant l'action est enregistré, puis le gel attend que le gaz ait quitté l'équilibre ou `TF_G_BLOCAGE_GEL` = 20 échantillons). Au repos (`tfGraph.repos` : aucune action depuis Réinitialiser ou un retour à un état), le chrono se fige dès le premier échantillon, si bien que les graphes restent à t = 0 tant que rien n'est lancé (auparavant, ~0,1 s de tracé au chargement). Après une action, le gel demande en outre `TF_G_EQ_GEL` = 5 échantillons d'équilibre de suite, comptés depuis la dernière action ou marche : un échantillon pris à l'extrémité d'une oscillation du piston passe le critère, et figer là aurait gardé un dernier état faux (vu : 116,249 kPa pour 116,230 sur le dernier palier d'un escalier). L'échantillon qui suit une attente porte `coupure` : trait pointillé vertical dans les trois cases, mention sous l'axe. Les courbes théoriques partent du départ de l'étape en cours (`tfGraphDepartEtape`).

**Graphes temporels** (un canvas, trois cases T, P, V partageant l'axe des temps) : courbe pleine quand la grandeur est définie (`Pdef`, `Tdef`) ; sinon **bande hachurée** entre les extrêmes des tranches, sans moyenne, et mention « non définie ». Tracé de la bande : échantillons d'un même pixel regroupés (enveloppe des extrêmes, sinon un contour en zigzag serré fait une tache sombre), bords écartés d'au moins 1 px (la bande n'est jamais plus fine que la courbe pleine qui la prolonge), et un tronçon défini de moins de 2 px coincé entre deux tronçons non définis rejoint la bande (jamais l'inverse). Repères pointillés : T_ext si le fond échange de la chaleur ; P_ext piston libre ; pression mesurée par le vérin piston tenu, si l'option « Pression sur le piston » est cochée. **Axe des temps de l'étape** (`tfGraph.axeT` = {t0, L, y}) : sans zoom, les graphes montrent l'étape en cours, de son départ t0 (`tfGraphDepartEtape`) à t0 + L, plus L/25 de l'état d'avant ; les temps se lisent depuis t0 (« t (ms) depuis B », lettre de départ, `_tfgLettreDepart`). Au cours d'un cycle (`tfCyEnCours` : première étape faite, tour pas fini), les étapes suivantes gardent l'origine du départ du cycle (`tfGraph.cycleT` = {t0, etape}, lettre A) : le temps et le chrono Δt de la scène courent d'une étape à l'autre, L ne fait que s'allonger (temps écoulé + durée attendue) ; un nouveau tour, Réinitialiser ou un retour à un état antérieur au cycle repartent de zéro. L ne dépend pas du cran de vitesse : la durée attendue de l'action (`_tfDureeAction`, tf-ui.js, celle qui sert aussi à la vitesse adaptée) fixe le premier cran (`tfGraphDureeAttendue`, 1,2·D arrondi aux crans 1, 2, 5 × 10ⁿ), puis L passe au cran suivant quand le temps des graphes atteint 95 % de L. Les plages verticales des cases (`_tfgPlageEtape`, `axeT.y`) ne changent pas tant que les données y tiennent (marge 4 %), sinon s'agrandissent avec une réserve de un cinquième de leur étendue ; étendues minimales 10 K, 10 kPa, 0,05 L. Chaque agrandissement est une transition de 350 ms (`_tfgAnimer`, `tfGraph.anim`). Déplacement, molette et « Tout voir » donnent une vue figée (`vueT` = {t1, t2, o, lt}, origine des temps comprise), « Auto » y revient (bouton nommé « Étape » jusqu'au 31/10/2026). Mention discrète sous l'axe : « vue figée » ou « chrono figé (équilibre) ». Une bande de titre est réservée en haut de chaque case.

**Diagramme de Clapeyron** :
- chemin plein tant que la **pression** du gaz est définie (`Pdef` ; et non `eq` : un vérin lent laisse le gaz uniforme mais n'est pas « à l'équilibre », le piston bougeant). Une température non uniforme ne suffit pas à effacer le point : V et P restent définis, P·V = nR·T_moy exactement, et l'aire sous la courbe reste le travail (choix de l'auteur, après R3 ; auparavant `Pdef && Tdef`) ; le style se décide **par passage** (`_tfgPassages`), d'une borne à la suivante : premier échantillon, échantillon `marche` (pas à la main, marche d'escalier), `coupure` (reprise après le chrono figé), dernier échantillon de chaque étape, dernier de l'historique. Grandeur définie (`D.def`, selon la convention) à tous les échantillons du passage, bornes comprises — et définie **tout au long de l'intervalle** de chaque échantillon : `_tfAccumuler` (tf-sim.js) note à chaque sous-pas si les critères de `tfMesures` tombent (`acc.ndP`, `ndT`, `ndExt`) et `_tfgEchantillon` met alors `Pdef`, `Tdef`, `ext` à faux (graphes temporels et frise compris ; l'équilibre reste instantané). Jugés au seul instant des échantillons (7 à 9 par pas d'une suite de 50), les pics de l'oscillation du piston (2,5 à 3,6 ‰ entre tranches, seuil 1 ‰) étaient tantôt vus, tantôt manqués : 100 → 140 → 100 kPa en 50 + 50 pas sur l'isolant donnait des bandes de pas pleins et pointillés au gré de la période du piston ; désormais tous pointillés (02/11/2026). **Étape faite en N pas** (`et.man === 'pas'`, Viser une valeur et Cycles) : chaque passage est une corde, sans jugement au seuil (03/11/2026) — +20 kg en 10 pas sur l'isolant laissait P uniforme (< 0,03 ‰) mais une couche chaude sous le piston (dissipation de l'amortissement déposée près de lui) de 0,3 à 0,7 K entre tranches, autour des 0,5 K de `TF_SEUIL_T` : en T(S), des pas pleins et d'autres pointillés au sein d'une même suite ; la frise met aussi le trait de ces étapes en pointillé. Le dépassement du piston se juge de même sur `Vlo`/`Vhi` (extrêmes de l'intervalle ; ceux de la borne de départ appartiennent au passage d'avant), et `_tfgEclaircir` reporte les extrêmes des échantillons retirés sur le suivant gardé (`_tfgReporterExtremes`), pour qu'une corde ne redevienne pas pleine après coup (et, convention « équilibre avec l'extérieur » seulement, volume resté entre ceux des deux bornes, à `TF_G_DEPASSE` = 10⁻⁵ près en relatif : le piston qui dépasse l'état d'arrivée, emporté par son inertie, montre que P ≠ P_ext même sous `TF_SEUIL_P`, grain de 10 g : 0,05 % ; en « uniforme », l'oscillation reste tracée, le gaz y est défini) : courbe pleine par tous ; sinon **une seule corde** droite pointillée, fine (1,4 px), d'une borne à l'autre, sans échantillon intermédiaire ; celle du passage en cours, gaz pas encore à l'équilibre, est pâle (provisoire). Une borne non définie est prise à l'état moyen du gaz (V, P_moy = (γ − 1)·U/V ; en T(S), ΔS, T_moy = U/(n·Cv)), et une corde ne franchit jamais une frontière d'étape. Remplace le **squelette** (cordes d'un échantillon défini au suivant) : l'extrémité d'une oscillation du piston, après un pas brutal, repasse un instant sous les seuils ; elle semait des bouts pleins au milieu des cordes, qui zigzaguaient d'une extrémité à l'autre (choix de l'auteur, nov. 2026). Les deux conventions restent : elles disent quels échantillons sont définis, le passage comment tracer (« uniforme » : plein = quasi statique ; « équilibre avec l'extérieur » : plein = réversible). Essai abandonné : un pointillé le long de l'état moyen à chaque échantillon (géométrie indépendante de la convention, mais moins lisible ; l'auteur préfère les cordes). Segments de même style et de même étape tracés d'un seul trait (tirets continus) ; sans étiquette, la légende l'explique ;
- **une couleur par étape** (échantillon `etape`, couleur de l'échantillon d'arrivée de chaque segment ; pointillés compris) ; **flèche de sens** au milieu (en longueur) du chemin de chaque étape, cordes comprises (points tracés des passages, `_tfgFleches`) ; **lettres** du journal en pastilles cerclées de la couleur de l'étape qui y arrive (`_tfgLettres`) ; **état actuel** par-dessus tout, halo et anneau orange `TF_G_ACTUEL` réservés à lui ;
- états d'équilibre en petits points de la couleur de leur étape : **un point par marche d'escalier, par pas à la main et par étape**, au dernier échantillon avant ce qui dérange le gaz — échantillon `marche` ou changement d'étape — s'il est à l'équilibre ; aucun au dernier échantillon : le chrono se fige dès que l'oscillation passe sous les seuils, ce peut être un bout d'oscillation (point en trop au-delà de B après un pas de 50 g), et l'état actuel a son propre marqueur. **Repos après un pas** (`tfPasPiston`, appelé par `_tfPapPas` pour la masse et P_air) : un grain de 10 g ne change la pression que de 0,05 %, sous le seuil `TF_SEUIL_P` ; le gaz était jugé à l'équilibre dès le pas, le chrono se figeait au bout de 2 ms et le chemin s'arrêtait un pas avant l'état actuel (5 pas : 9,5 ms enregistrées). Le piston n'est maintenant au repos (`tfMesures`, `repos`) qu'après `tf.tReposMin` = t + ln 10 · période / (2π · `TF_AMORT`) (amortissement de l'oscillation au dixième, ~4,6 périodes ; dans les instantanés) : 5 pas de 10 g, 836 ms enregistrées, chemin jusqu'à l'état actuel, un point au repos par pas (49 Pa d'écart). **Pas de la source** : crans de 0,1 à 20 K (`TF_PAS_ESC.Text`, huit crans, curseur `#tf-main-sl-source` de 0 à 7, défaut 1 K) ; `tfPasSource` fixe `tf.tThMin` = t + ln 10 · `tfDurees().thermique`, avant lequel `tfMesures` refuse l'équilibre thermique (un pas de 0,1 K reste sous `TF_SEUIL_T` = 0,5 K ; dans les instantanés). Banc, source 1, piston libre, 2 K de chauffage : 20 pas de 0,1 K → S_c 1,1 µJ/K (théorie n·Cp·(ΔT/T)²/2 par pas : 0,8) ; 4 pas de 0,5 K → 5,2 µJ/K (4,1) ; ~34 s simulées par pas, écart final 0,02 K ; un point d'équilibre par pas. La vitesse Auto (`_tfVitesseRelax`) prend cette attente (`tf.tThMin − t`) pour durée restante : elle ne regardait que l'écart de température au-delà de 0,25 K et restait à ×1 après un pas de 0,1 K (~35 s d'écran par pas, pas suivants lancés hors équilibre) ; banc, 5 pas de 0,1 K : ×5, ~7 s d'écran par pas, chemin TS de A à l'état actuel, pente n·Cp·ΔT/T (0,5 K pour 1,2 mJ/K). **Résolution de l'expérience** (`TF_RESOL_S` = 0,1 mJ/K, tf-ui.js) : entropies du Bilan et de la frise à 0,1 mJ/K (`_tfFmtmJK`), verdict réversible sous `TF_SC_REV` = la moitié ; le calcul garde toute sa précision. Les cadrages des diagrammes avaient déjà des étendues minimales (PV 0,05 L × 5 kPa, TS 2 mJ/K × 5 K, graphes au cours du temps 10 K, 10 kPa, 0,05 L). Le cran le plus fin de chaque organe passe sous la résolution sur une transformation entière (banc, S_c par pas vers 100 kPa et 30 cm, ∝ pas²) : sable 10 g 0,018 µJ/K (100 → 200 kPa : 0,02 mJ/K) ; source 0,1 K 0,053 µJ/K (+100 K : 0,04) ; air 0,1 kPa, cran ajouté (`TF_PAS_ESC.Pair`, huit crans, curseur du piston à `max` selon la grandeur), 0,073 µJ/K (100 → 200 kPa : 0,04 ; 0,5 kPa : 1,8 µJ/K, 0,18) ; vérin 1 mm, pas d'au moins `TF_PAS_VERIN_TRAV` = 3 traversées du son (avant 0,5 ms, plus court qu'une traversée : 6,8 µJ/K ; 1 traversée : 3,3 ; 2 : 0,85 ; 3 : 0,11 ; 6 : 0,005, mais un pas de 5 cm y devient réversible, 0,014 mJ/K) : course 30 → 15 cm en pas de 1 mm ≈ 0,03 mJ/K, de 1 cm 0,24, de 5 cm 0,53. Bouton Réversiblement : `TF_REV_SC` 2,5 → 15 µJ/K estimés par étape ; Carnot 3,3 h simulées (avant 7 h 15), S_c du cycle 0,012 mJ/K ; Stirling 11,3 h (avant 57 h), 0,027 mJ/K ; affichés 0,0 mJ/K. Les cycles quasi statiques (Carnot 0,016, Lenoir 0,056, Stirling 0,07 mJ/K) s'affichent 0,0 ou 0,1 mJ/K. **Chrono figé** : le dernier échantillon suit l'état du gaz (`_tfgSuivreGele`, appelé par `_tfgEchantillon` tant que `figer` tient ; valeurs instantanées, moyennes et extrêmes, entropie, enveloppe ; pas un échantillon `marche`). Le gaz déclaré à l'équilibre finit encore d'approcher l'état final, sous les seuils (dixième d'un pas de la source, oscillation résiduelle du piston) ; le chemin s'arrêtait avant l'état actuel, qui restait seul dans le prolongement. Chaque **marche d'escalier** force un échantillon juste avant elle (`tf.echantillon(true)` dans `_tfAvancerRampes`, champ `marche`, conservé quand l'historique est éclairci) ; un **pas à la main** marque le dernier échantillon (`tfGraphMarche`, appelé par `_tfPapPas` après `tfGraphDegeler`). *Palier 6* : la règle précédente, un point à la fin de chaque séjour à l'équilibre, en semait plusieurs par pas — après un petit pas (50 g, 0,25 %), le piston qui oscille repasse plusieurs fois sous les seuils de 0,1 % : 17 points pour 4 pas, 5 maintenant (A et un par pas, espacés de 0,25 kPa). Vérifié avant : 20 marches de 0,5 kPa à ×20 → 21 états espacés de 0,500 kPa ; état actuel cerclé s'il est défini, sinon mention « État du gaz non défini » ;
- **pression de chaque tranche** (option `tfGraphAff.tranches`, activée) : un point (V du gaz, P_tranche) par tranche, coloré selon T avec la palette des molécules, sur un trait vertical de Pmin à Pmax : un volume, plusieurs pressions. Remplace le « nuage » (N·V_tranche, P_tranche), dont l'abscisse — le volume qu'aurait le gaz entier à l'état de la tranche — n'était pas le volume du gaz porté par l'axe (étalement horizontal trompeur après une compression brutale) ;
- options pression sur le piston (tireté orangé : l'aire dessous est le travail reçu), isotherme et adiabatique réversible passant par `tfGraph.ref`, le dernier état d'équilibre avant que le gaz n'en sorte (départ de la transformation en cours ; elles restent en place à l'arrivée, pour comparer) ;
- **champ fixe** (`tfGraph.champ`, `_tfgChamp`) : au départ (`_tfgChampBase`), cadré sur ce que le diagramme aura à montrer : le **cycle idéal** choisi s'il y en a un (marge 10 %, ΔS sur 0,5·n·R au moins) ; sinon un voisinage de l'état initial : cylindre plein (0 à 1 L) et pression de P_A/2 à 2·P_A en P(V), ΔS sur ±1,5·n·R arrondi et températures du gaz et des deux sources en T(S). Bornes par `_tfgAxe` : étendue minimale, marge, **zéro de V, P et T pris s'il ne fait au plus que doubler l'étendue** (aires W et Q lisibles sans écraser un cycle resserré, ex. Stirling 0 à 110 kPa, Lenoir 95 à 145 kPa), arrondi vers l'extérieur au dixième de l'étendue. Un autre cycle choisi, ou son retrait, recadre le champ (`tfGraph.champF` : fantôme pour lequel il a été calculé). Le champ ne fait ensuite que s'agrandir, en **fenêtre glissante** : une borne suit le contenu (`_tfgContenu`) dès qu'il en approche à moins de 8 % de l'étendue (`_tfgSuivre`, l'autre borne fixe ; une borne basse positive ne passe pas sous zéro), pendant la transformation et non à l'arrivée, pour contenir le chemin défini, les lettres, le cycle idéal et l'état actuel (son abscisse toujours, son ordonnée si elle est tracée selon la convention). Suivi continu immédiat, transition animée seulement pour un saut de plus d'un dixième de l'étendue (`_tfgAnimerChamp`). Les tranches et la pression sur le piston ne l'agrandissent pas (un choc ferait dézoomer pour quelques images) : une tranche hors champ est signalée par un triangle au bord (`_tfgMarqueBord`). Il est recalculé (et peut donc se resserrer) à Réinitialiser et au retour à un état ;
- **légende fixe** (`_tfgLegende`) en bande au-dessus du tracé, une ligne ou deux selon la largeur : chemin, non défini, équilibre, actuel, et, selon les options, tranches et P piston ; elle ne dépend pas de ce qui est visible. Mention « … non définie » en bas à gauche dans les deux diagrammes ; courbes théoriques étiquetées directement (verticales en haut).

**Convention de tracé** (`tfGraphAff.ext`, menu Options) : par défaut, un point du chemin dès que l'ordonnée est uniforme dans le gaz (`Pdef` en P(V), `Tdef` en T(S)) ; sinon, seulement quand le gaz est en équilibre avec l'extérieur (`tfMesures().ext`, champ `ext` des échantillons) : gaz uniforme (P et T), pression égale à P_ext piston libre (ou piston en butée ; piston tenu, le vérin exerce la pression du gaz), température à moins de `TF_SEUIL_T` de celle de la source si le fond conduit. Le piston peut bouger : une transformation réversible reste tracée, une transformation quasi statique à fond peu conducteur ne l'est pas (écart de température avec la source). `TF_G_DIAGS[d].def` et `.defM` lisent l'option ; mention « Gaz hors d'équilibre avec l'extérieur ».

**Outils** : glisser = déplacer la vue (bouton **Zoom** enfoncé, `tfGraphZoomZone(cible)`, `tfGraph.zoomZone` : glisser trace un rectangle, `glisse.cadre`, borné au tracé et dessiné par `_tfgDessinerCadre`, qui devient la vue au relâcher, `_tfgZoomCadre` ; en temps, l'intervalle de temps seul ; moins de 6 px ou Échap : abandonné ; le mode reste actif jusqu'au clic suivant), molette = zoom autour du curseur (les deux axes d'un diagramme d'état, l'axe des temps seul pour les graphes temporels), indépendamment sur chaque graphe ; la vue est alors figée, et l'état d'avant est empilé une fois par geste (`_tfgEmpiler`, crans de molette à moins de 600 ms regroupés) ; ↶ vue précédente (piles `pileT`, `pileD`) ; Auto des graphes temporels (`tfGraphSuivre`, retour à l'étape en cours) ; Tout voir (historique complet) ; Ajuster (`tfGraphAjuster`, vue figée au plus près du chemin, du cycle idéal et des arrivées prévues (`tfGraph.prevu`), sans chercher le zéro, `_tfgCadrage`) et Auto (`tfGraphChamp`, retour au champ fixe, recadré sur le contenu ; bouton nommé « Champ » jusqu'au 31/10/2026) pour chaque diagramme d'état ; + réticule commun aux deux canvas, avec bulle de valeurs (graphes temporels : « non définie (… à …) » hors équilibre). Options dans `tfGraphAff` (cases `tf-ckg-…` du menu Options). Tracé dans la boucle (`tfGraphDessiner`) seulement si `tfGraph.sale`.

#### Diagramme entropique, Bilan et Gaz (palier 7, PLAN §10.6)

- **Entropie** (`tfEntropie()`, tf-sim.js) : chaque tranche est localement à l'équilibre, s_j = n_j·[Cv·ln(T_j/T0) + R·ln(V_j/V_j0)] ; la somme, toujours définie, est nulle à l'état initial. 80 logarithmes par échantillon (champ `S`) et par image.
- **Compteurs du bilan** (`tfBilan()` : U, `tf.Wgaz`, `tf.Qrecu`, `tf.QsurT`, S) : `tf.Wgaz`, travail reçu par le gaz par la face du piston, même formule que W_op (pression moyenne de la mise à jour d'énergie, énergie cinétique de la demi-tranche portée par la face), plus, piston libre, la chaleur dissipée par l'amortissement du piston et les chocs en butée, rendue au gaz (c'est un frottement) ; en mode quasi statique, ΔU − ΣQ de chaque sous-pas. `tf.QsurT` = Σ δQ / T_ext, à la température de la source au moment de l'échange (rampes comprises). Les deux sont dans l'instantané des lettres. Entropie créée S_c = ΔS − Σ δQ / T_ext : elle compte aussi celle créée dans la paroi du fond (écart T_ext − T_gaz), d'où S_c > 0 en quasi statique à fond peu conducteur.
- **Références** : `tfEtapes.bilanA` (état A, à Réinitialiser) et `bilan0` de chaque étape (à son ouverture). Section **Bilan** du panneau (`_tfMajBilan`, 10 Hz, dépliée) : colonnes « Étape X → Y » (dernière étape, de son départ à maintenant) et « Depuis A » ; lignes W, Q, ΔU, W + Q, ΔS du gaz, Σ δQ / T_source, S créée. ΔU et W + Q diffèrent de l'énergie cinétique du gaz tant qu'il bouge.
- **Diagrammes d'état** (tf-graph.js) : le tracé du diagramme de Clapeyron est généralisé (`_tfgDessinerDiag`), paramétré par `TF_G_DIAGS` (`pv`, `ts`) : abscisse et ordonnée lues dans un échantillon, une lettre ou les mesures, critère « défini » (`Pdef` pour P(V), `Tdef` pour T(S)), grandeur des tranches, textes. Chemin, états d'équilibre, flèches, lettres, état actuel, tranches (verticale à l'abscisse du gaz), champ (`tfGraph.champ[d]`), zoom et réticule valent pour les deux. Chaque diagramme a son encart et son canvas (`tfGraph.cv.pv`, `.ts`), ses outils ↶, Ajuster, Auto et Zoom (`tfGraphPrecedente(d)`, `tfGraphAjuster(d)`, `tfGraphChamp(d)`, `tfGraphZoomZone(d)`), sa vue `tfGraph.vue[d]`, sa pile `pileD[d]` et sa géométrie `geoD[d]` (la souris d'un canvas agit sur son diagramme : `cible` = `'pv'`, `'ts'` ou `'t'`). Mention « non définie » en bas à gauche et légende fixe au-dessus du tracé, dans les deux diagrammes. Courbes de référence (`_tfgCourbesRef`, options isotherme, adiabatique, isochore, isobare) par l'état de départ : en T(S), isotherme horizontale, adiabatique réversible verticale, isochore T = Tr·e^(ΔS/(n·Cv)), isobare T = Tr·e^(ΔS/(n·Cp)) ; en P(V), isochore verticale et isobare horizontale en plus.
- **Section Gaz** (repliée) : γ (Monoatomique 5/3, Diatomique 7/5, Polyatomique 4/3, curseur 1,05 à 1,67), température initiale `tf.T0` (250 à 600 K) et hauteur initiale (10 à 45 cm, `tf.V0`) ; chaque changement réinitialise (`tfOnGamma`, `tfOnEtatInitial`). Le gaz part à la pression atmosphérique, la source à T0. `TF_T0` reste la référence des couleurs (20 °C).

| Test (palier 7 ; calorifugé sauf mention) | Résultat |
|---|---|
| Vérin 30 → 15 cm en 20 s | T 386,814 K (Laplace 386,81) ; ΔS = 0,000 mJ/K, S_c = 0 ; W = ΔU = 48,564 J (écart 4·10⁻¹¹ J) |
| Même course en 2 ms, puis retour à l'équilibre | T 390,25 K ; S_c = 4,586 mJ/K, égale à n·Cv·ln(T/T0) + n·R·ln(V/V0) recalculée sur l'état final ; W + Q − ΔU = −1,6 mJ |
| Diathermane, τ = 10 ms / 60 s | ΔS = −143,755 mJ/K = −nR·ln 2 exactement ; S_c = 21,9 / 6,97 mJ/K (palier 3 : 23,0 / 7,5) ; W = −Q |
| Bloc de 20 kg, piston libre | T 374,237 K ; W = 42,043 J = −P_ext·ΔV ; S_c = 36,84 mJ/K |
| Sable continu, 20 kg en 30 s | T 355,717 K ; S_c = 0,000 |
| Sable lent sur la source 1 à 293 K, +10 kg (palier 6, durées des boutons) | quasi statique (4 702 s) : T 293,000 K, P·V / P₀V₀ = 1,00000, V 0,4026 L (isotherme 0,4026), W 23,955 J (isotherme 23,947), S_c = 28 µJ/K ; réversible (37 h) : W 23,947 J, S_c = 1,0 µJ/K |
| Échelon de P_air → 200 kPa (P et T non définies pendant le front) | T 374,71 K ; S_c = 37,16 mJ/K |
| Isobare quasi statique, T_source → 400 K en 20 000 s, G = 0,003 W/K | Q = 77,56 J, W = −22,16 J, ΔU = 55,40 J ; ΔS = 225,59 mJ/K, Σ δQ/T = 224,69 : S_c = 0,9 mJ/K, créée dans la paroi |
| γ = 5/3, vérin 30 → 15 cm en 20 s | T = T0·2^(2/3) ; S_c = 0 |
| T0 = 400 K, hauteur 20 cm | T 400 K, V 0,4 L, P 101,33 kPa, S = 0 |
| Parcours par l'interface (brutal), puis ↺ A | lettre B à ΔS = 4,59 mJ/K ; Bilan « Étape A → B » et « Depuis A » identiques ; après le retour, colonne d'étape retirée, tout à 0 |
| Rendu | P(V), T(S), Les deux sans erreur ; pendant un choc, la verticale des tranches en T(S) est à droite de l'adiabatique réversible (ΔS ≈ 0,5 mJ/K, 342 à 359 K) |

### `js/tf-etapes.js` — Journal des étapes (R2)

- `tfEtapes.liste` : une étape par Lancer, bascule du piston ou changement d'isolation (`tfEtapeNouvelle(desc)`), avec sa couleur (`TF_COUL_ETAPES`), sa lettre de départ et d'arrivée (indices dans `tfEtapes.etats`), son statut (`en cours`, `arrivee`, `interrompue` si une autre action est lancée avant l'équilibre : la suivante part alors de « ? »).
- `tfEtapesSuivre(m)`, appelée à chaque échantillon des graphes (chrono figé compris) : l'étape en cours arrive au premier équilibre une fois l'action finie (`!tfEnCours()`), et reçoit la lettre suivante. Si l'état n'a pas changé depuis le départ (à 10⁻⁴ en V et P, 0,01 K), l'étape est **retirée** et ses échantillons rendus à la précédente (`tfGraphRetirerEtape`). La dernière lettre (`suivie`) est mise à jour tant que dure l'équilibre et qu'aucune étape n'est lancée : c'est la fin du séjour, l'état le plus reposé (même raison que les points d'équilibre du diagramme).
- **Retour à un état déjà vu** (`_tfEtatDejaVu`) : la nouvelle lettre reprend celle d'un état noté s'ils coïncident à `TF_RETOUR_VP` = 10⁻⁴ près en V et P, `TF_RETOUR_T` = 0,02 K, comparés sur l'**état visé** (`_tfEtatVise`, champ `vise` de chaque lettre) : T de la source si le fond conduit (`tf.G > 0`), sinon T mesurée ; P = P_ext piston libre hors butée et V = nRT/P ; sinon V mesuré (vérin, butée) et P = nRT/V. Au premier équilibre détecté, le gaz peut être encore à 0,5 K de la source : l'état visé rend la comparaison exacte. Avant le 02/11/2026, 0,5 % sur V et P et 0,5 K sur T, comparés aux mesures : 100 → 140 → 100 kPa en 50 + 50 pas sur l'isolant finit à +0,16 K et +0,27 mJ/K, et passait pour un retour en A. Désormais seul le réversible (∞) y revient ; sur une source (50 pas), le cycle se ferme. Aller-retour et Carnot en N pas finis affichent « Tour fini, mais le gaz n'est pas revenu en A ».
- **Instantanés** : chaque lettre garde une copie de `z, u, E, P, q` et des grandeurs de commande (`tenu`, masse, blocs, sable, P_air, T_ext, W_op, W_air, Q, Σ δQ/T, W_gaz, `eDecal`, t), et son entropie `S` (diagramme entropique). `tfEtapesRevenir(i)` restaure l'instantané (vérin et escaliers arrêtés ; l'isolation, réglage du panneau, est gardée), tronque le journal et les lettres, et l'historique des graphes (`tfGraphRevenir` : échantillons postérieurs effacés, chrono repris au dernier gardé).
- `tfEtapesSelectionner(k)` : étape mise en évidence sur le diagramme (les autres à 22 % d'opacité).

### `js/tf-ui.js` — Panneau et boucle

Afficheurs `#tf-info` (tableau sous les graphes, deux grandeurs par ligne) à 10 Hz (temps en ms aux crans < ×1/100, P en kPa, T, V, P_ext ou, piston tenu, « Pression sur le piston » mesurée par le vérin, État). P ou T non définies (critère de `tfMesures`) : « ? » suivi de l'intervalle couvert par les tranches, jamais la moyenne. État : « À l'équilibre » (vert) ou « Hors équilibre » (terracotta). Section Affichage (repliable) : cases `tf-ck-…`, resynchronisées sur `tfAff` au chargement (un navigateur peut conserver l'état des cases au rechargement).

**Nombre de pas** (01/11/2026, remplace les trois boutons de manière, dans Viser comme dans Cycles) : curseur `#tf-sl-nbpas` (`tfCarte.iN`, crans `TF_NB_PAS` = 1, 2, 5, 10, 20, 50, 100, ∞) et un seul bouton **Appliquer** (`tfLancerPas(N)`), qui affiche la taille d'un pas et la durée prévue (`_tfMajNbPas`, `_tfDureeN`). N = 1 : manière brutale ; N = ∞ : manière réversible (rampe continue) ; toutes deux par `_tfLancerManiere(man)`, l'ancien `tfLancerManiere` (la manière quasi statique n'a plus de bouton, `_tfParamsManiere('qs')` sert encore au calcul de la réversible). Entre les deux, **suite de pas** : `tf.seq = { suivant }` (tf-sim.js) ; `tfEnCours()` est vrai tant qu'elle dure (pas de lettre, chrono non figé) ; `tfAvancer` appelle `tf.seq.suivant()` dès `tfMesures().equilibre`, testé tous les `TF_SEQ_LOT` = 16 sous-pas (et à chaque sous-pas quasi statique). `_tfPasSuivant` force un échantillon `avantMarche` (un point d'équilibre par pas sur les diagrammes ; `tfGraphMarche` au premier), fait le pas (`_tfFairePas`, commun avec le mode À la main : vérin en au moins trois traversées du son, échelon de la source, grain de sable ou de P_air), et efface `tf.seq` au dernier : la lettre se pose au premier équilibre qui suit. Attente minimale avant de juger l'équilibre (`_tfAttentePas`, un petit pas peut rester sous les seuils dès son départ) : vérin, sa course + 10 traversées ; piston libre, l'amortissement au dixième de `tfPasPiston` ; fond conducteur, en plus ln 10 · `thermique`. Vitesse adaptée : un cran pour toute la suite, durée prévue `_tfDureeSeq` sur `TF_ECRAN_SEQ` (0,5 s d'écran par pas, entre 5 et 20 s) ; entre deux pas (`_tfEntrePas`), `_tfVitesseRelax` peut encore accélérer. Étape : `man: 'pas'`, `nPas` (puce « 10 pas », `.tf-f-pas`) ; cycles : `tfCycle.iN` (`#tf-cy-sl-nbpas`), `run.N`, `faits[k] = {man, nPas}`, « Appliquer l'étape » et « Tout le cycle » (`#tf-cy-tout-btn`) ; contact avec une source en N > 1 pas : source d'abord mise à la température du gaz.
**Paroi du fond** (même date) : `tf.paroi` 'cond' ou 'peu' (`TF_G_PAROI` : 1 W/K ou 3·10⁻⁵ W/K), onglets `#tf-paroi-cond` / `#tf-paroi-peu` sous le Fond (`tfOnParoi`, `tfSetParoi` ; un réglage, pas une étape ; gardé dans les instantanés avec G). Peu conductrice, un échelon de la source reste quasi statique et irréversible : la manière quasi statique irréversible, sans bouton propre, s'obtient ainsi.

**Montage** (02/11/2026, remplace « Conditions ») : lignes Piston, **Source** (`#tf-fond-1`, `#tf-fond-2` : le cylindre est toujours posé sur une source, `tf.fond` '1' ou '2', défaut '1') et **Paroi** (`#tf-paroi-isolant`, `-cond`, `-peu` : `tf.paroi` 'isolant', 'cond' ou 'peu', défaut 'isolant'). L'ancien fond « isolant » est devenu une paroi : `tfContact()` (tf-sim.js) rend 'isolant' ou la source sous le fond, et c'est lui que gardent les étapes de cycle (champ `fond`) ; `tfPoserContact(c)` y mène, en reprenant la dernière paroi non isolante choisie (`_tfParoiSource`). `tfOnFond` et `tfOnParoi` passent par `_tfPoser(f, p)` : une étape s'ouvre quand le contact change (« Paroi isolante », ou chauffage / refroidissement par la source) ; entre conductrice et peu conductrice, un réglage. Derrière une paroi isolante, la source sous le cylindre se règle par son menu ▾ (`tfFixerTSource`) ; au contact, dans Transformation. RAZ remet la paroi isolante si la source n'est pas à T0.

| Test (01/11/2026, défaut : 0,600 L, 100 kPa, 293 K) | Résultat |
|---|---|
| Vérin 30 → 15 cm, source à T gaz, paroi conductrice, N = 1 / 10 / 100 | S_c 186 / 2,55 / 0,287 mJ/K (∝ 1/N) ; 0 / 10 / 100 points d'équilibre, lettres A B ; 48 s / 337 s / 2 586 s simulées, 24 / 3 / 38 s d'écran |
| P_air 100 → 200 kPa, isolant, N = 10 / 100 | S_c 3,70 / 0,290 mJ/K ; T_f 359,0 / 357,3 K (Laplace 356, brutal 371) |
| Échelon de la source 293 → 400 K, piston tenu, paroi peu conductrice | gaz uniforme à 0,11 K près tout du long (non défini jamais) ; S_c 22,4 mJ/K ; 92 000 s simulées, 9 s d'écran |
| Stirling, Tout le cycle en 5 pas par étape | A B C D A, cycle fermé ; 361 s simulées, 43 s d'écran |

**Trois manières** (R3, PLAN §10.5, remplacées par le Nombre de pas le 01/11/2026) : boutons **Brutalement / Quasi statiquement / Réversiblement** (`tfLancerManiere`), la durée choisie par la page (`_tfParamsManiere`) écrite sur chacun, message sur ce que l'isolation fait des deux manières lentes (`_tfMajManieres`), journal en clair (`_tfDescManiere` : « Compression quasi statique (V → 0,300 L, en 2 h 18) »). Brutalement : vérin à vitesse de pointe `TF_V_BRUTAL` = `TF_V_VERIN_MAX` = 400 m/s (τ ≥ 0,5 ms ; 150 m/s avant le 31/10/2026 : la course durait deux traversées du son et le gaz se comprimait presque d'un bloc, sans front visible), échelon ou bloc sinon. Mesuré à 400 m/s, calorifugé : 30 → 15 cm en 0,75 ms, Pmax/Pmin 13, T_f 481 K ; 50 → 13 cm, 505 K ; 50 → 5 cm, 736 K ; 5 → 50 cm, 258 K ; énergie à 1,6·10⁻³ au plus. En Auto, l'échelon de P_air sur la membrane nue a pour durée d'action une traversée du son (10 avant : ×1/1000, front traversé en moins d'une seconde d'écran) : cran ×1/5000 à toute hauteur, ~4 s d'écran par traversée à 30 cm. Les manières lentes partent de la chaleur Q de la transformation réversible et de deux résistances thermiques en série, le gaz (R_int = 0,72·π²·τ_int/(4·n·Cv), facteur mesuré) et la paroi (1/G) : quasi statiquement, lent devant le son et le piston (au moins 1 s ; 25 temps mécaniques pour une rampe de pression), et flux Q/durée laissant moins de `TF_QS_ECART` = 0,25 K entre tranches (sauf si la paroi limite seule le flux sous ce seuil) ; réversiblement, en plus, entropie créée Q²·(R_int + 1/G)/(T²·durée) sous `TF_REV_SC` = 0,2 mJ/K. Les anciens curseurs de durée et de marches sont dans **Réglages fins** (repliés, `<details>`), avec « Lancer avec ces réglages ».

| Test (R3, interface ; compression 30 → 15 cm, air 101 → 200 kPa, source → 400 K) | Résultat |
|---|---|
| Brutalement | vérin : Pmax/Pmin = 2,21, gaz non défini 99 % de la course ; air : 1,50 |
| Calorifugé, quasi statiquement = réversiblement | loi de Laplace exacte (386,81 K ; 356,01 K), S_c = 0 ; source désactivée (sans effet) |
| G = 0,001 W/K | quasi statiquement (2 h 15 à 5 h 46 simulées) : gaz défini 100 % de l'action et de la relaxation, S_c = 2,3 à 3,7 mJ/K ; réversiblement (29 à 104 h) : S_c = 0,14 à 0,29 mJ/K |
| G = 0,03 W/K et diathermane | les deux manières lentes presque identiques, gaz défini 100 %, S_c ≤ 0,19 mJ/K |
| Brutalement, toutes isolations | S_c = 26 à 61 mJ/K |
| Recalibrage (`TF_REV_SC` 0,2 mJ/K → 2,5 µJ/K, verdict `TF_SC_REV` 0,2 mJ/K → 5 µJ/K, l'arrondi de l'affichage), cycles par défaut | S_c ∝ 1/durée, mesuré 2,6 fois sous l'estimation. Avant, réversiblement = quasi statiquement : Carnot 0,016 mJ/K, Stirling 0,070, Lenoir 0,056. Après : Carnot 1,9 µJ/K (7 h 15 simulées), Stirling 4,3 µJ/K (57 h), Lenoir 2,2 µJ/K (43 h), tous affichés 0,00 mJ/K, verdict réversible ; quasi statiquement, verdict irréversible |

**Vitesse adaptée au retour à l'équilibre** (`_tfVitesseRelax`, à 10 Hz) : le cran choisi au lancement montre le phénomène rapide, puis, l'action finie et `TF_ECRAN_FRONT` = 3 s d'écran passées, il monte (jamais ne descend) pour que le reste du retour à l'équilibre dure ~5 s : d'abord ondes (100 L/c) ou piston chargé (16 quarts de période) tant que le gaz n'est pas à l'équilibre mécanique (`m.meca` de `tfMesures` : P uniforme, gaz et piston au repos) ; puis, cet équilibre vu `TF_ECRAN_MECA` = 1 s à l'écran (le compte n'est remis à zéro que si les écarts de pression dépassent cinq fois les seuils), écart de température à résorber (τ_th, ou τ_int si calorifugé, × ln(écart / 0,25 K)) : on ne voit jamais le piston osciller en accéléré pour suivre l'équilibre thermique. Après une action brutale, le cran restait sinon à ×1/5000 : l'équilibre n'était jamais atteint (plus de 10 min à l'écran). Mesuré, de l'action à l'équilibre : 4 à 22 s à l'écran selon l'action et l'isolation (compression brutale diathermane : ×1/5000 → ×5, 21,7 s ; G = 0,001 : → ×500). **Phase mécanique bornée** : sans repos mécanique après `TF_ECRAN_MECA_MAX` = 6 s d'écran (compte `R.attente`), le cran monte d'un cran, jusqu'à ×1 (Carnot brutal : la détente adiabatique restait 18 s à ×1/100). **Phases nommées** (`tfPhaseAuto`) sur le compteur de la scène, à la place de « ralenti / accéléré » : avant l'action, pendant l'action, ondes (piston tenu) ou ondes et piston, équilibre thermique. Carnot brutal, tour complet : 84 s d'écran au lieu de 108.

**Bilan (après R4g)** : section repliée ; onglets `#tf-bil-etape` (titre « Étape B → C »), `#tf-bil-A`, `#tf-bil-cycle` (grisé sans cycle) → `tfBilanVue` ('etape', 'A', 'cycle' ; `tfOnBilanVue`, remis à 'etape' par `tfOnSelEtape`, passé à 'cycle' quand un cycle se ferme, `_tfBilanCycleSig`) ; `#tf-bilan` devient un bloc : les deux principes en égalités (`_tfBilanEgalite` : ΔU = W + Q en J, ΔS = Sₑ + S꜀ en mJ/K), verdict `.tf-bil-verdict` (S꜀ < `TF_SC_REV` : réversible) ; `_tfMajBilanCycle` seulement dans la vue Cycle ; la note ne dit plus que « Étape en cours ». **Tableau (après R4g)** : gaz face à l'extérieur (`#tf-it-P`, `#tf-it-T`, `#tf-it-V` ; `#tf-it-Pext`, `#tf-it-Text` avec leur origine `.tf-ext-src`), signes `#tf-sig-P`, `#tf-sig-T` (=, ≠, ? ; seuils `TF_SEUIL_P`, `TF_SEUIL_T`), voyants `#tf-voy-meca` (`meca`) et `#tf-voy-th` ; supprimés : `#tf-it-t`, `#tf-it-etat`, `#tf-it-Pext-lbl`. **R4g (PLAN §10.13)** : `js/tf-cycles.js` (chargé après tf-ui.js), section Cycles. `TF_CYCLES` (nom, `champs` : deux réglages parmi `TF_CY_CHAMPS` Vmin, Vmax, Pmin, Pmax, PA ; `defaut`) ; `tfCycle` {cle, v (réglages), k, faits, etatsFaits, tour, run, Tnom, def, sigA, sigF} ; lignes génériques `#tf-cy-lbl-i`, `#tf-cy-in-i`… (`tfCyPas(i, sens)`, `tfCySaisie(i, txt)`, `_tfCyFixer`) ; `_tfCyCalculer` (A et étapes {titre, type 'P' ou 'fond', tenu, fond, loi, V, T, P} ; piston libre et P_air visée pour 'P', `_tfCyPiston` ; contact lent `_tfCyContact` ; `tfCycle.Tnom`), `_tfCyFantome` → `tfGraph.fantome` (tf-graph.js : `_tfgFantome`, champ `_tfgChamp`) ; `_tfCyMettreAJour` passe A dans `tfDepart` puis `_tfDepartChange` quand `sigA` change ; `_tfCyTic` (appelé par `tfMajAfficheurs`) : étape faite (`_tfCyAtteinte` au repos `_tfCyRepos`), puis `_tfCyPreparer` (une condition à la fois) et `tfLancerManiere` ; `tfOnCycle`, `tfCyPas`, `tfCySaisie`, `tfCyEtape`, `tfCyTout`, `tfCyArreter` ; `tfCyclesRaz(i)` depuis `tfReinitialiser` et `tfOnRevenir` ; `tfCyclesInit` depuis `tfInit`. CSS `.tf-cy-*`. **R4f (PLAN §10.12)** : cycles. Lettre `retour` (indice de la lettre retrouvée) posée par `_tfEtatDejaVu` dans `tfEtapesSuivre`, `_tfLettreSuivante` ; `et.cycle` = {debut, fin} (`_tfCycleFerme`), `tfEtapesCycle`, `tfEtapesLettresCycle` ; `et.TsMin`/`TsMax` (sources au contact) ; `tf.Qabs` (tf-sim.js, `tfBilan().Qabs`, instantanés) ; Bilan : colonne Cycle et `_tfMajBilanCycle` (`#tf-bilan-cycle`) ; `_tfgLettres` et `_tfMajSelEtat` sautent les retours. **R4e (PLAN §10.11)** : journal des étapes en frise (`_tfMajJournal`, `_tfPointFrise` ; CSS `.tf-f-*`). Étape : `titre`, `detail`, `man` ('brutal', 'qs', 'rev', 'main' ou null ; puce `TF_PUCE_MANIERE`) au lieu de `desc` — `tfEtapeNouvelle(desc)` reçoit {titre, detail, man}, construits par `_tfDescManiere`, `_tfDescPap` (avec `nbHors`), `tfOnFond`, `tfBasculerPiston`, et `_tfTitreEtape(o, sens, lent)` ; `nonDef` (P ou T non définie à un échantillon, `tfEtapesSuivre`) = trait pointillé ; `bilan1` relevé à l'arrivée (effacé par `tfEtapeRouvrir`). Sélections : `tfEtapes.sel` (trait : diagramme et Bilan, `tfOnSelEtape`) et `tfEtapes.selEtat` (point : courbes de référence, `tfOnSelEtat`, `tfEtapesSelectionnerEtat`), qui remplace `selA` / `tfOnSelA` ; `_tfMajBilan` prend l'étape `sel` (la dernière sinon), de `bilan0` à `bilan1` ; `_tfScree`. **R4d (PLAN §10.10)** : section État initial = Dispositif + Point de départ A. `tf.P0` (défaut `TF_P0`, piston seul à l'air libre) ; `tfReset` en déduit n et équilibre le gaz par `tf.Pair` (enceinte) ou par un bloc `tfMasseDepart(P0)` (masses, P_air = P_atm) ; bornes `tfBornesP0(montage)`. Brouillon `tfDepart` {montage, gamma, P0, V0, T0} (champs `TF_DEPART` : facteur, décimales, pas) : `tfOnMontage`, `tfOnGamma`, `tfOnDepartSaisie`, `tfOnDepartPas` → `_tfDepartChange` (appliqué par `tfReinitialiser` si le journal est vide, sinon encart `#tf-dep-attente`) ; `tfReinitialiser` copie toujours le brouillon dans `tf` ; `tfDepartRetablir`, `_tfDepartModifie`, `_tfMajDepart` (onglets, γ, champs, n, encart, résumé). Supprimés : curseurs γ, T0, V0, `tfOnEtatInitial`, `_tfMajGaz`, confirmation de `tfOnMontage`. **R4c (PLAN §10.9)** : sections Contrôle, État initial (repliée, résumé `_tfMajResume` dans `#tf-resume-init` ; montage `tfOnMontage` et ancienne section Gaz), Conditions (piston, fond), Transformation, Étapes (↶ Annuler la dernière dans le titre). `tfCarte.mode` = 'viser' ou 'main' (`tfOnMode`), `tfCarte.organe` = 'piston' ou 'source' (`tfOnOrgane` ; « Agir sur la source » toujours visible, grisé sur l'isolant, où `_tfOrgane` rend le piston) ; `_tfCle()` = `_tfCleOrgane(_tfOrgane())` (tenu → 'volume', libre → `tfCarte.moyen`, source → 'Text') ; `_tfNature`. Manières : boutons `.tf-maniere` à liseré coloré ; pendant une action, `_tfMajProgres` les remplace par une barre (`#tf-progres`, ■ = `tfOnInterrompre`). À la main (`_tfMajMain`) : voyant `#tf-voyant` (`equilibre`), cartes `#tf-carte-piston` et `#tf-carte-source` ; boutons d'un pas `tfMainDebut(o, sens)` / `tfMainClavier` (répétition commune `_tfRepeter`), `_tfPapPas(o, sens)` compte `nbPas` et `nbHors` sur l'étape ; curseur du pas `tfOnPasMain(o, i)` (`TF_PAS_ESC`, six crans 1-2-5, iPas par grandeur). Supprimés : `tfCarte.action`, `tfCarte.pap`, `tfOnAction`, `tfBasculerPap`, `#tf-en-cours` ; puis les **réglages fins** (`tfLancer`, `tfOnDuree`, `tfOnPas`, `_tfMajDuree`, `_tfDescAction`, `_tfRegime`, `_tfRegimeEscalier`, `TF_DUREES`, `TF_DUREES_ESC`, `iDuree`) : ce qui suit sur le curseur Durée, les marches et la transformation attendue est historique. **Refonte R4a (PLAN §10.7)** : `tfCarte.moyen` est le **montage** (section Montage et gaz, `tfOnMontage`, réinitialise) ; fond posé sur l'isolant ou une source (`tfOnFond` → `tfSetFond` de tf-sim.js ; `tf.fond`, `tf.Tchaude`, `tf.Tfroide`, `tfTSource`, saisie `tfOnTSource`, `tfOnSourceTgaz` ; instantanés compris, scène : isolant ou « source chaude · 400 K ») ; piston en deux onglets (`tfOnPiston`) ; un seul champ de valeur visée (`TF_VISEE` : libellé, unité, pas des − et +, bornes ; `tfCarte[cle].suit` : la valeur actuelle tant qu'on n'y touche pas ; `tfOnSaisieVise`, `tfOnPlusMoins`, menu des états `tfOnCopierEtat`) ; arrivée prévue (`_tfPrevoir`, `_tfMajPrevu`, cercles pointillés `tfGraph.prevu` dessinés par `_tfgPrevus`) ; pas à pas (`tfPapDebut` au pointerdown, répétition `TF_PAP_DELAI` puis `TF_PAP_PERIODE`, `_tfPapPas`, une étape par suite de clics grâce à `tfEtapeRouvrir`) ; ↶ Annuler l'étape (`tfOnAnnuler`, `tfEtapesEtatAnnuler`) ; courbes de référence par l'état sélectionné (`tfEtapesEtatRef`, ligne A cliquable `tfOnSelA`) ; Vitesse repliée sous Pause et RAZ. **R4b (PLAN §10.8)** : montage en tête de carte (`tfOnMontage`, `tf.montage` lu par la scène : `_tfDessinerPortique`, fond d'air libre, plateau seulement avec les masses) ; vitesse sur une ligne, bouton Auto (`tfBasculerAuto`) ; fond en onglets Isolant, Source 1, Source 2 (`tf.fond` = '1' ou '2', `tf.T1`, `tf.T2`), chacune avec une flèche ▾ qui déroule le réglage de sa température (`tfBasculerSource`, `tfFermerSource`, `tfOnTSourceSaisie`, `tfOnTSourcePM`, `tfOnSourceTgaz`, `_tfMajPopSource`) ; pas à pas comme manière (`tfCarte.pap`, `tfBasculerPap`), − et + (`tfPmDebut`, `tfPmClavier`, `tfOnPlusMoins`) règlent la valeur visée ou font un pas (`_tfPapPas` : sable, P_air, vérin à `TF_V_BRUTAL`, échelon de Text ; pas dans `TF_PAS_ESC`, volume compris) ; plus de phrases d'aide sous les manières ni sous le fond. Ce qui suit décrit l'état antérieur, encore valable pour le reste.

Panneau (refonte R1, PLAN §10.3) :
- **Contrôle** : Pause et RAZ sur une ligne (`.btn-row`), curseur Vitesse à 7 crans `TF_VITESSES` (×1/5000 → ×20), case **Vitesse adaptée à la transformation** (`tfCarte.auto`, police réduite `.check-row-petit`) : à chaque Lancer, `_tfVitesseAdaptee` prend le cran qui fait durer l'action ~`TF_ECRAN_ACTION` = 5 s à l'écran (course du vérin, escalier, 16 quarts de période du piston pour une pression brutale, mise en équilibre thermique pour une température brutale). Les changements de cran de la vitesse adaptée sont progressifs (`_tfVersCran`, `_tfAvancerRampeV`) : `tf.vitesse` suit une progression géométrique lissée, ~0,7 s réelle par décade pour accélérer (0,8 à 3,5 s), ~0,45 s pour ralentir (0,8 à 2 s) ; **gaz au repos** (`tfMesures().equilibre` au lancement, ou avant un changement de fond), le cran change d'un coup dans les deux sens (`_tfSauterCran`), surligné 1,5 s sur le compteur (`tfChrono.saut`) : le ralentissement préalable coûtait 1,3 à 2 s d'écran à chaque étape d'un cycle, sans rien à voir. Gaz hors d'équilibre, s'il faut ralentir pour une action, `_tfLancerApresRalenti` la diffère jusqu'à la fin du ralentissement (durée prévue par `_tfDureePrevue`, boutons désactivés, Interrompre l'annule). `tf.vitesse` prend donc des valeurs entre les crans : `tfCranVitesse` (tf-sim.js) donne le cran le plus proche (curseur, fenêtre d'échantillonnage des graphes). **Compteur de temps** (tf-scene.js, `_tfDessinerChrono`) : cadre bordé en haut de l'enceinte, entre le corps du vérin et la paroi de la cloche à égale distance des deux, à la même distance sous le bâti (police ajustée à la place, 24 px au plus ; la scène n'est pas réduite) : Δt depuis le départ de l'étape, lu sur le chrono des graphes (`tfGraphChrono`, grisé quand il est figé à l'équilibre), et vitesse, précédée de ▲/▼ pendant un passage (`tfChrono.sens`). Le curseur bougé à la main (`tfOnVitesseCurseur`) coupe Auto, qui reprenait sinon la main à la phase suivante. **Repères de vitesse** sur les graphes au cours du temps (`_tfgDessinerCrans`) : chaque échantillon garde le cran visé (`cr`, `tfCranVise` : celui d'arrivée d'un passage progressif) ; à chaque changement, un pointillé bleu sur les trois cases et le nouveau cran au bas de la dernière (libellé omis à moins de 4,5 caractères du précédent). L'étiquette « vide » de l'enceinte est passée en haut à gauche.
- **Transformation** (`tfCarte`) : bouton **Piston tenu / libre** (`tfBasculerPiston`), puis bouton à deux états **Fond calorifugé / diatherme** (`tfBasculerIsolation`, `tfOnIsolation(diatherme)` : G = 0 ou le dernier de `TF_ISOLATIONS`, un état et non une action ; RAZ le conserve) ; sous-onglets **Volume / Pression / Température** (`tfOnAction`), et pour la pression **Masse posée / Air de l'enceinte** (`tfOnMoyen`) ; un curseur de valeur visée par grandeur (`tf-sl-volume`, `-masse`, `-Pair`, `-Text`, `tfOnVisee`), suivi de la valeur actuelle et de ce que fera Lancer au piston ; curseur **Durée** dont les crans changent avec la grandeur (`TF_DUREES` pour le volume, `TF_DUREES_ESC` sinon, 0 = brutale ; un cran retenu par grandeur) ; curseur **Hauteur des marches** (`TF_PAS_ESC`, escalier seulement) avec nombre de marches et rythme ; **Lancer** (une action à la fois ; grisé si rien ne changerait) et **Interrompre** ; action en cours ; **transformation attendue** (`_tfRegime` pour le volume : « onde de choc » si la vitesse de pointe dépasse c ; avec r = τ / (L/c), L la plus grande des hauteurs de départ et d'arrivée : brutale (front) si r < `TF_TAU_FRONT` = 5, « rapide, non quasi statique » (ondes, gaz non uniforme pendant la course ; état final proche du réversible si calorifugé) si r < `TF_TAU_QS` = 50 — seuil où les écarts de P passent sous les 0,1 % du critère « P définie » —, sinon quasi statique : réversible si calorifugé, irréversible si τ < 10·τ_th, presque réversible au-delà. Auparavant, le quasi statique commençait dès 5·L/c : à τ = 5 ms (r ≈ 5,7, Pmax/Pmin = 1,10), le panneau annonçait « quasi statique et réversible » pendant que les graphes montraient P et T non définies ; `_tfRegimeEscalier` pour pression et température : marches comparées au retour au repos du piston et à τ_th, isochore ou isobare selon le piston) ; durées caractéristiques (traversée L/c, période d'oscillation du piston, équilibre thermique).
- **Étapes** : journal (`_tfMajJournal`, reconstruit seulement quand son contenu change ; ligne de départ A, puis une ligne par étape : pastille, lettres, action (`_tfDescAction`), état d'arrivée, bouton ↺ `tfOnRevenir`) ; clic sur une ligne : `tfOnSelEtape`. Chaque action passe d'abord par `_tfOuvrirEtape` (chrono dégelé, étape ouverte, départ des courbes théoriques) ; une bascule du fond refaite avant l'équilibre ne fait qu'une étape « Fond … » tant que le gaz n'a pas atteint l'équilibre.
- Lancer : volume → `tfLancerVerin` ; masse ou P_air → `tfAppliquer` puis `tfSetTenu(false)` ; température → `tfAppliquer`, piston inchangé.

`tfInit()` est appelée par `ui.js`.
