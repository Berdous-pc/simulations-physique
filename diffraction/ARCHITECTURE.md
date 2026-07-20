# Architecture — Simulation Diffraction par une fente (3D)

## Arborescence

```
diffraction/
├── index.html
├── ARCHITECTURE.md      ← ce fichier
├── css/
│   └── style.css
└── js/
    ├── sim.js
    ├── scene.js
    ├── graph.js
    └── ui.js
```

Dépendances externes vendées dans `site/libs/` (partagées entre futures simulations 3D) :
`three.min.js` (build UMD/global, r128) + `OrbitControls.js` (version non-module correspondante).
Chargées en `<script>` classiques avant `sim.js` — scope global, pas de modules ES, pour rester
ouvrables en double-clic (`file://`), comme toutes les autres pages du site.

---

## Périmètre physique

Diffraction de Fraunhofer par une **fente simple** uniquement (pas de fentes d'Young, pas de
réseau). Laser monochromatique, λ réglable. Cf. CONTEXTE_PROJET.md pour l'historique des choix.

---

## Fichiers et responsabilités

### `js/sim.js` — État global et physique

**Chargé en premier.** Ne dépend de rien d'autre dans le projet.

| Élément | Rôle |
|---|---|
| `sim.lambda` | Longueur d'onde du laser (nm, 400–700) |
| `sim.a` | Largeur de la fente (µm, 20–500) |
| `sim.D` | Distance fente-écran (m, 0.5–3) |
| `sim.showRays` | Affichage des rayons pointillés vers les 1ers minima |
| `sim.view` | Vue caméra active : `'3d'` \| `'top'` \| `'side'` \| `'screen'` |
| `sim.screenHalfWidth` | Demi-largeur physique fixe de l'écran simulé (0.125 m — écran réel de TP 25×15 cm) |
| `thetaPremierMinimum(λ,a)` | sin θ ≈ λ/a |
| `xPremierMinimum(λ,a,D)` | Position du 1er minimum sur l'écran (m) |
| `FAISCEAU_DIAMETRE_MM` | Diamètre réel du faisceau laser (1 mm) — source unique pour le rendu et la physique |
| `largeurFaisceauGaussien(λ,D)` | Rayon du faisceau (m) à distance D par divergence gaussienne naturelle (w0·√(1+(D/zR)²)) — utilisé pour le profil vertical de la texture d'écran, cf. `scene.js` |
| `intensiteFente(x,λ,a,D)` | I(x) normalisée, formule sinc² de Fraunhofer (sinθ exact, pas d'approximation petit angle) |
| `echantillonnerIntensite(n)` | Échantillonne I(x) sur toute la largeur de l'écran — **source physique unique**, utilisée à la fois par `graph.js` (courbe) et `scene.js` (texture de l'écran 3D) |
| `longueurOndeVersRGB/Hex/Css(nm)` | Conversion λ → couleur (algorithme de Dan Bruton) |
| `resetParams()` | Remet λ/a/D/showRays aux valeurs par défaut |

---

### `js/scene.js` — Scène 3D (Three.js)

**Chargé après sim.js.** Dépend de `THREE` et `THREE.OrbitControls` (vendés).

#### Convention d'échelle et de repère

**1 unité Three.js = 1 cm.** Axes : `x` = direction de diffraction (largeur de la fente), `y` =
vertical (fente supposée « infinie » selon cet axe — approximation standard, la figure ne varie
qu'en `x`), `z` = axe de propagation (source → écran, `z` croissant).

**Toutes les tailles sont à l'échelle du matériel réel de TP, sauf la largeur de la fente** (choix
explicite de l'utilisateur, cf. discussion de conception) :

| Élément | Taille réelle modélisée |
|---|---|
| Écran (`SCREEN_WIDTH` × `SCREEN_HEIGHT`) | 25 × 15 cm |
| Distance fente-écran max (slider `sl-D`) | 3.0 m (borne HTML, pas dans `sim.js` — cf. §Règles générales) |
| Lame porte-fente (`SLIDE_SIZE`) | 7 × 7 cm |
| Bande où la fente est gravée (`SLIT_BAND_HEIGHT`) | 80% de la hauteur de la lame (5.6 cm) — ne couvre pas toute la hauteur |
| Diamètre du faisceau laser (`BEAM_DIAMETER`) | 1 mm |
| Module laser (`LASER_DIAMETER` × `LASER_LENGTH`) | Ø 1,5 cm × 5 cm — dimensions choisies cohérentes avec un module de TP réel, non spécifiées par l'utilisateur |
| Distance laser-fente (`SOURCE_Z`) | 15 cm — laser monté proche de la fente, comme sur un vrai banc |
| Largeur de la fente (`a`, via `largeurFenteVisuelle`) | **Pas à l'échelle** — `a` (~0.1 mm) et `D` (~mètres) ont un rapport de l'ordre de 10 000:1, impossible à représenter réellement (la fente serait invisible). Mappée sur `LARGEUR_FENTE_MIN_CM`–`LARGEUR_FENTE_MAX_CM` (≈0.064–0.4 cm). Plage resserrée après le passage de `SLIT_BAND_HEIGHT` à 80% : le nouveau maximum correspond à l'ancien minimum (0.4 cm), et le reste de la plage est compressé dans la même proportion (facteur 0.4/2.5) pour garder une fente fine et haute plutôt qu'un carré. **La valeur réelle `sim.a` reste seule utilisée dans tous les calculs physiques** (`intensiteFente`, `thetaPremierMinimum`) |
| Supports (tige + plateau) | Décoratifs, sous laser/lame/écran, posés sur une table virtuelle `TABLE_Y` commune (cf. ci-dessous) — aucune taille réelle de référence |

Conséquence pédagogique : ce qu'un élève *mesure* (θ, D, position/largeur de la figure) est
physiquement juste ; seule la largeur *dessinée* de la fente elle-même est exagérée.

#### Objets de la scène (construits une fois par `construireObjets()`)

| Objet | Description |
|---|---|
| `laserBody` | Cylindre représentant le module laser (Ø 1,5 cm × 5 cm), en `z = SOURCE_Z - LASER_LENGTH/2` |
| `beamMesh` | Cylindre fin (Ø 1 mm réel) `MeshBasicMaterial` (auto-éclairé) de la source à la fente, coloré selon λ |
| `topBand` / `bottomBand` | Bandes pleines (haut/bas) de la lame porte-fente, hauteur fixe, ne dépendent pas de `a` |
| `wallLeft` / `wallRight` | Murs latéraux de la fente (géométrie unitaire mise à l'échelle via `.scale`), confinés à la bande centrale `SLIT_BAND_HEIGHT`, écartés de `largeurFenteVisuelle(a)` — avec `topBand`/`bottomBand`, forment la lame 7×7 cm sans CSG (la fente est l'espace vide entre les deux murs) |
| `screenMesh` | Plan `PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT)` avec `CanvasTexture` recalculée à chaque changement de paramètre |
| `raysLine` | `LineSegments` en pointillés (`LineDashedMaterial`) de la fente vers les deux 1ers minima (±x₁), masquable via `sim.showRays` |
| `supportLaser` / `supportSlide` / `supportScreen` | Groupes `creerSupport()` (tige + plateau), un par élément — purement décoratifs |

**Pas de rendu volumétrique du faisceau diffracté** (choix assumé, cf. discussion de conception) :
seule la texture projetée sur l'écran représente la figure de diffraction.

#### Table et supports (`creerSupport()`)

Chaque élément posé « en l'air » (laser, lame, écran) a un support (tige verticale + plateau) dont
le **dessus du plateau est à `TABLE_Y`**, et repose sur une **table physique** (un seul plan,
`TABLE_WIDTH` × longueur fixe, construite une fois dans `construireObjets()`) dont le dessus est à
`TABLE_Y - PLATEAU_EPAISSEUR` — juste sous les plateaux, pour qu'ils reposent dessus sans s'y
enfoncer ni flotter au-dessus. Donne un vrai look de banc optique monté sur table.

**Longueur de la table fixe, pas dynamique** : elle va de `SOURCE_Z - LASER_LENGTH - 5` jusqu'à
`D_MAX_CM + 10` (marge de chaque côté), en dur — **`D_MAX_CM` doit être tenu à jour avec la borne
`max` du slider `sl-D` dans `index.html`**, sinon la table ne s'étend plus jusque sous l'écran à
distance maximale. Elle ne rétrécit jamais quand on rapproche l'écran (D petit) : comme une vraie
table, elle dépasse simplement de chaque côté.

**Principe pour ne jamais casser l'alignement optique** : `creerSupport()` construit le groupe avec
le **sommet de la tige à l'origine locale** (`y = 0`) — poser le groupe à `(x, yBasElement, z)` de
l'élément suffit à le faire tenir exactement en dessous, sans jamais toucher aux coordonnées de
l'élément lui-même. Seul `supportScreen.position.z` est mis à jour (dans `updateSceneParams()`, en
même temps que `screenMesh`, car `D` est réglable) — `x` et `y` ne sont jamais modifiés après la
construction initiale, pour aucun des trois supports (ni pour la table, entièrement statique).

#### Pieds de table et sol

3 paires de pieds (`LEG_SECTION` × `LEG_LENGTH`, 75 cm — hauteur de table/paillasse classique),
réparties au début, au milieu et à la fin de la table, du dessous de la table
(`TABLE_Y - PLATEAU_EPAISSEUR - TABLE_THICK`) jusqu'au sol. Le **sol** (`floor`) est un grand plan
fixe, largement plus grand que la table dans les deux dimensions, dont le dessus définit `FLOOR_Y`
(déduit de `TABLE_Y` et de la hauteur des pieds — pas une valeur indépendante, pour que pieds et sol
restent toujours raccordés si l'une des hauteurs change). Entièrement statique, comme la table.

#### Zoom ancré sur l'axe optique (`initZoomVersCurseur()`)

Le zoom natif d'`OrbitControls` (molette) dolly toujours vers `controls.target`, un pivot fixe —
sans repositionner ce pivot au préalable (clic-droit-glissé), on ne peut que se rapprocher/éloigner
du même point, ce qui rend l'exploration libre de la scène pénible. `controls.enableZoom = false`
désactive ce comportement natif ; `initZoomVersCurseur()` le remplace, avec un comportement
**asymétrique entre zoom avant et zoom arrière** (cf. discussion de conception ci-dessous) :

- **Zoom avant** (`pas > 0`) : vise le **point de l'axe optique (droite x=0,y=0, le prolongement du
  faisceau) le plus proche du rayon souris** (`pointAxeLePlusProche()`, distance minimale entre
  deux droites) — pas un point quelconque de la scène : tout ce qui compte (laser, fente, écran)
  est sur cet axe. `camPersp.position` et `controls.target` sont tous deux interpolés (`lerp`) vers
  ce point d'un même facteur `t=0.15` : ce point devient le nouveau pivot, donc l'orbite suivante
  tourne autour de la zone qu'on vient d'explorer.
- **Zoom arrière** (`pas < 0`) : cf. section « Recentrage au dézoom » ci-dessous — ne cherche
  délibérément **pas** de nouveau point.

Dans les deux cas, la distance résultante est ensuite recadrée dans
`[controls.minDistance, controls.maxDistance]`, comme le ferait le zoom natif. Actif uniquement en
vue 3D (`sim.view === '3d'`) — les vues orthographiques fixes n'ont pas de zoom interactif.

#### Recentrage au dézoom

Une première version cherchait un nouveau point (comme le zoom avant) aussi en dézoomant. Problème
constaté à l'usage : après avoir zoomé sur une extrémité de la scène (ex. la fente), le pivot
(`controls.target`) y restait figé même une fois dézoomé — contre-intuitif, on s'attend à retrouver
un pivot proche du centre de la scène une fois suffisamment dézoomé, pas à rester bloqué sur le
dernier point exploré.

Le zoom arrière fait donc deux choses à la fois, sans jamais recalculer de point via un raycast :
1. **S'éloigne** de la cible actuelle : `dir = (position - target) × 1.15`.
2. **Recentre** progressivement `controls.target.z` vers le milieu de la scène
   (`centreZ = (SOURCE_Z + D_cm) / 2`), d'une fraction `0.12` de l'écart à chaque cran de molette —
   converge vers le centre sur plusieurs crans, sans jamais sauter brutalement.

La nouvelle position caméra est `newTarget + dir` (avec `dir` calculé avant le recentrage) : la
direction/orientation de la caméra est préservée exactement, seuls la distance et le point pivoté
changent — un dézoom prolongé ramène donc naturellement un pivot sensé, proche du centre du banc.

**Mode axial (cas dégénéré, vue en enfilade dans le faisceau)** : quand la CAMÉRA elle-même regarde
à peu près le long de l'axe optique, le rayon souris est quasi-parallèle à l'axe quel que soit le
pixel visé — `denom` (dans `pointAxeLePlusProche()`) s'approche de 0 et le point calculé explose
numériquement. Ce n'est pas qu'un problème de précision flottante : dans cette configuration, le
rayon devient presque équidistant de tout l'axe sur une grande longueur, donc « le » point le plus
proche n'a plus vraiment de sens unique — rafistoler la formule (seuil de repli, mélange progressif
vers un point de secours...) ne fait que déplacer le problème et produit des sauts de caméra
perceptibles.

Solution retenue : **basculer entièrement de méthode** plutôt que corriger le calcul. `initZoomVersCurseur()`
teste `Math.abs(forward.z)` (direction de visée de la caméra, via `camPersp.getWorldDirection()`)
contre `SEUIL_MODE_AXIAL` (0.95, ≈18° de l'axe) — **avant** tout calcul de point sur l'axe. En dessous
de ce seuil, comportement normal (zoom ancré sur l'axe, décrit ci-dessus). La décision se base sur
l'orientation de la caméra, pas sur la position du curseur : stable et prévisible pendant l'orbite,
pas de dépendance à quel pixel précis est survolé.

Au-delà du seuil, **mode axial : un coulissement, pas un zoom**. Une première version y faisait
quand même un dolly classique (mise à l'échelle de la distance caméra-cible) — mais dans cette
configuration la « cible » n'a plus vraiment de sens, et le dolly se faisait rattraper par
`controls.minDistance` : on butait sur un plafond de zoom qui n'a pourtant aucune raison d'exister
ici (constaté à l'usage — « ça semble bloqué de temps en temps »). Le mode axial **translate**
`camPersp.position` et `controls.target` **du même vecteur** : leur distance ne change donc jamais,
rien ne peut buter contre `minDistance`/`maxDistance`.

**Translation selon `z` uniquement, jamais selon `forward`** : une première version translatait selon
le vecteur `forward` complet (mis à l'échelle de `PAS_COULISSEMENT_CM`, 10 cm/cran) — mais même dans
le cône du mode axial (< 18° de l'axe), `forward` garde une petite composante x/y qui s'accumule à
chaque cran de molette et fait dériver la cible hors de l'axe optique (constaté à l'usage — le
coulissement partait vers le sol). Le delta ne porte donc que sur `z` (signe aligné sur le sens de
visée de la caméra, `forward.z > 0`), x et y ne sont jamais touchés. Seul un garde-fou très large
(`SOURCE_Z - 300` à `D_MAX_CM + 300`) borne `z`, pour rester dans la zone utile de la scène sans
jamais se faire sentir comme une limite de zoom pendant l'exploration normale.

#### Caméras — 2 objets pour 4 vues

- **`camPersp`** (`PerspectiveCamera` + `OrbitControls`) : vue **3D**, orbite libre à la souris.
  Cadrage par défaut fixé par `reset3DCamera()`, appelé à l'initialisation et par « Réinitialiser »
  uniquement — **pas** en recliquant sur « Vue 3D » après être passé sur Dessus/Profil/Écran : la
  pose de `camPersp` n'est jamais touchée par ces vues (seule `camOrtho` bouge), donc revenir en
  vue 3D restaure exactement la position laissée par le dernier orbit de l'utilisateur (choix
  volontaire — resynchroniser au cadrage par défaut à chaque clic perdrait le cadrage de l'élève).
- **`camOrtho`** (`OrthographicCamera`, réutilisée) : vues **Dessus / Profil / Écran**. Repositionnée
  et recadrée à **chaque frame** par `updateOrthoCamera()` tant que l'une de ces vues est active
  (reste donc juste si `D` change pendant qu'on est sur une vue fixe). `OrbitControls` désactivé
  (`controls.enabled = false`) sur ces 3 vues.
  - **Écran** : caméra du côté de la fente, regardant vers `+z`, alignée avec l'axe du graphe I(x)
    en bas (mêmes unités physiques, même sens). Note : la figure de diffraction et le montage sont
    **symétriques par rapport à x = 0** (sinc² est une fonction paire) — un éventuel miroir gauche-droite
    de la caméra serait donc invisible dans cette simulation précise ; à surveiller si une future
    simulation 3D asymétrique réutilise ce pattern de caméra.
  - En vue **Écran**, le banc (source, faisceau, plaque de la fente) est masqué (`.visible = false`)
    pour ne pas cacher l'écran — c'est une vue analytique, pas une vue « photo-réaliste ».
  - `fitOrtho(cam, halfW, halfH, aspect)` : ajuste `left/right/top/bottom` en mode « contain »
    (aucune des deux dimensions n'est jamais coupée, quel que soit le ratio du canvas).

#### Texture de l'écran

`updateSceneParams()` reconstruit un `ImageData` (512×64) à partir de `intensiteFente()` (même
fonction que le graphe, cf. `sim.js`), module la couleur de base (`longueurOndeVersRGB(λ)`) par
l'intensité, et marque `screenTexture.needsUpdate = true`.

**Profil vertical (divergence du faisceau gaussien)** : le modèle physique de la diffraction est 1D
(fente « infinie » en y, cf. §Périmètre physique de `sim.js`) — il n'y a donc aucune vraie
diffraction verticale *par la fente* à calculer. Mais rien n'empêche de modéliser la vraie
divergence du faisceau laser lui-même (mode gaussien TEM00), indépendante de la fente : c'est
`largeurFaisceauGaussien(λ,D)` (cf. `sim.js`) qui la calcule, avec la formule standard d'optique
laser `w(D) = w0·√(1+(D/zR)²)` (zR = portée de Rayleigh), à partir du diamètre réel du faisceau
(`FAISCEAU_DIAMETRE_MM = 1`). La texture applique ce rayon `w` comme profil gaussien en y
(convention laser `I(r) = I0·exp(-2r²/w²)`), indépendant de x — identique pour l'ordre central et
les ordres secondaires, comme sur une vraie photo de diffraction. Sans lui, `I(x)` peinte identique
sur toute la hauteur donnerait des **bandes verticales infinies** au lieu de taches.

**Piège #1 (aspect du buffer)** : le buffer de la texture (`screenTexCanvas`) doit garder le **même
ratio largeur/hauteur que le plan physique** (`SCREEN_WIDTH`/`SCREEN_HEIGHT`, cf. `construireObjets()`).
Un buffer dont le ratio ne correspond pas à celui du plan écrase (ou étire) verticalement tout profil
dessiné dedans une fois plaqué dessus.

**Piège #2 (échelle non proportionnée)** : une première version utilisait un écart-type vertical
arbitraire (fixe, puis proportionnel à la largeur de la tache centrale) — visuellement correct mais
sans base physique. `largeurFaisceauGaussien` la remplace par une vraie grandeur physique.

**Plancher de rendu (`RENDU_W_MIN_CM`)** : le faisceau réel (Ø 1 mm) diverge très peu sur les
premiers mètres — son rayon physique peut descendre sous 1 mm, largement en dessous de ce que la
texture (résolution finie, cf. Piège #1) peut représenter proprement sans buffer démesurément
grand. `w_cm` est donc plancherisé à `RENDU_W_MIN_CM` (0.2 cm) ; dès que la vraie divergence dépasse
ce plancher (grand D), c'est elle qui prend le dessus et la croissance de la tache avec D redevient
visible — seul le très petit reste artificiellement gonflé, par nécessité de rendu.

**Rayons masqués en vue Écran** : `raysLine.visible` tient compte à la fois de `sim.showRays`
(bascule utilisateur) et de `sim.view !== 'screen'` — mis à jour dans `updateSceneParams()` (change
de paramètre) **et** dans `setSceneView()` (change de vue), les deux étant des déclencheurs valides.
Une caméra orthographique de face ne représente pas la profondeur : les deux rayons vers ±x₁
s'y aplatissent en un simple trait horizontal qui n'apporte rien dans cette vue précise.

#### DPI

`renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` — le cap à 2 évite de saturer le fill-rate
WebGL sur écran très haute densité. **Différent du pattern `ctx.setTransform` du canvas 2D classique**
utilisé ailleurs sur le site (cf. `graph.js` et CONTEXTE_PROJET.md §7) : ne pas mélanger les deux
approches en cas de copier-coller vers une autre page.

---

### `js/graph.js` — Graphe I(x) interactif

**Chargé après scene.js.** Dépend de `sim.js` uniquement (canvas 2D classique, aucune dépendance à Three.js).

- Pas de dimension temporelle : I(x) est recalculée intégralement à chaque frame à partir des
  paramètres courants (`echantillonnerIntensite`), pas d'accumulation de points dans le temps
  (contrairement à `condensateur/` ou `radioactivite/`).
- Outils interactifs : zoom rectangulaire (`graphZoomMode`), pan clic-glissé, molette, réticule
  libre (`graphCursorActive`), **tangente** (`graphTangenteMode`) — version simplifiée du pattern
  générique (clic pour figer une tangente avec étiquette pente + croix de suppression individuelle,
  plusieurs tangentes peuvent coexister dans `tangentesFig[]`), différente de la « méthode des
  tangentes » multi-phases spécifique à `titrage/`.
- Vue courante : `gview = { xMin, xMax, yMin, yMax }` (mètres en x, intensité normalisée en y),
  historique dans `graphViewHistory[]` pour le bouton « ← ».
- Axe X affiché en cm.

---

### `js/ui.js` — Contrôles et boucle d'animation

**Chargé en dernier.**

- `updateParam(name, val)` : met à jour `sim`, les labels, appelle `updateSceneParams()` +
  `updateReadouts()`.
- `setView(view)` : appelle `setSceneView(view)` (scene.js) + met à jour les boutons `.btn-view`.
- `resetSim()` : `resetParams()` + RAZ sliders/tangentes/vue graphe/caméra 3D.
- Splitter draggable entre `#scene-area` et `#graph-area` (pattern identique à `condensateur/js/circuit.js`).
- `resize()` anti-rebond (`requestAnimationFrame`) → `resizeScene()` + `resizeGraphCanvas()`.
- `loop()` : boucle continue (`requestAnimationFrame`) qui appelle `renderScene()` (nécessaire en
  continu même sans animation physique, pour l'amortissement `OrbitControls.enableDamping`) et
  `drawIntensityGraph()` à chaque frame.

---

## Ordre de chargement et dépendances

```
index.html
  └── ../libs/three.min.js       expose : THREE (global)
  └── ../libs/OrbitControls.js   expose : THREE.OrbitControls
  └── js/sim.js       expose : sim, A_MIN/MAX, FAISCEAU_DIAMETRE_MM,
  │                             thetaPremierMinimum, xPremierMinimum, intensiteFente,
  │                             largeurFaisceauGaussien, echantillonnerIntensite,
  │                             longueurOndeVersRGB/Hex/Css, resetParams
  │
  └── js/scene.js     dépend de : sim.js, THREE, THREE.OrbitControls
  │                   expose : initScene, updateSceneParams, setSceneView, reset3DCamera,
  │                             resizeScene, renderScene
  │
  └── js/graph.js     dépend de : sim.js
  │                   expose : gview, tangentesFig, graphViewHistory, drawIntensityGraph,
  │                             initGraphInteractions, resizeGraphCanvas, toggleGraphZoom,
  │                             toggleGraphCursor, toggleGraphTangente, prevGraphView, autoScaleGraph
  │
  └── js/ui.js        dépend de : tous les fichiers précédents
                       expose : updateParam, toggleRays, setView, updateReadouts, resetSim,
                                 toggleHint, resize, init
                       démarre : init() → requestAnimationFrame(loop)
```

> Tous les fichiers utilisent le scope global (pas de modules ES). L'ordre de chargement est critique.

---

## Écarts connus par rapport à CONTEXTE_PROJET.md

- Aucune fonctionnalité de détection téléphone/orientation (pas d'overlay de rotation, pas de
  media query dédiée) : choix assumé pour cette page, à la demande de l'utilisateur.
