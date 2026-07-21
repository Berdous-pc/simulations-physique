# Architecture — Simulation Diffraction par une ouverture (3D)

## Arborescence

```
diffraction/
├── index.html
├── ARCHITECTURE.md      ← ce fichier
├── PISTES_EVOLUTION.md
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

Diffraction de Fraunhofer par une ouverture réglable, **4 formes** (`sim.maskShape`, cf.
`sim.js` → `MASK_SHAPES`) : fente simple, trou carré, trou circulaire, fil (fente
complémentaire, via le principe de Babinet). Pas de fentes d'Young, pas de réseau. Source
laser réglable en `λ` (monochromatique) **ou** lumière blanche (6 couleurs de référence, cf.
§Lumière blanche ci-dessous).

`index.html` expose deux onglets principaux (`setMainTab`, `ui.js`) : **Ondes lumineuses**
(cette simulation, entièrement implémentée) et **Ondes de surfaces** (placeholder, à venir —
cf. §Écarts connus).

Le calcul du rendu visuel (texture d'écran, enveloppe 3D — cf. §Pipeline FFT ci-dessous) est
généralisé aux 4 formes d'ouverture ci-dessus via un unique pipeline FFT 2D, plutôt que
spécifique à la fente — cf. §Pipeline FFT et `PISTES_EVOLUTION.md` pour l'historique de cette
généralisation et ce qui reste hors périmètre (fente inclinée, réseau...).

---

## Fichiers et responsabilités

### `js/sim.js` — État global et physique

**Chargé en premier.** Ne dépend de rien d'autre dans le projet.

| Élément | Rôle |
|---|---|
| `sim.lambda` | Longueur d'onde du laser (nm, 400–700) — actif seulement en `sim.lightSource==='mono'` |
| `sim.a` | Dimension caractéristique de l'ouverture (µm, 20–500) — son sens physique dépend de `sim.maskShape` (largeur/côté/rayon/diamètre du fil, cf. `MASK_SHAPES`) |
| `sim.d` | Distance laser-fente (m, réglable, 0.15–2.5) — position de la fente sur le banc, cf. `scene.js` |
| `sim.D` | Distance fente-écran (m). Borne max **dynamique**, dépendante de `sim.d` (cf. `dMaxPourPetitD`) — le banc a une longueur fixe |
| `sim.lightSource` | `'mono'` (longueur d'onde réglable via `sim.lambda`) \| `'blanche'` (lumière blanche, cf. §Lumière blanche) |
| `sim.blancheVisibles` | `{ [nom de couleur]: bool }` — courbes cochées dans la légende du graphe en mode blanc, une entrée par `BLANCHE_COULEURS` |
| `sim.maskShape` | `'fente'` \| `'carre'` \| `'cercle'` \| `'fil'` — forme de l'ouverture de la diapositive, cf. `MASK_SHAPES` |
| `sim.showRays` | Affichage des rayons pointillés vers les 1ers minima + l'axe optique |
| `sim.showLengths` | Affichage des doubles flèches de mesure d, D, L (cf. `scene.js` §Doubles flèches de mesure) |
| `sim.beamMode` | Mode d'affichage du faisceau : `'visible'` (laser + enveloppe diffractée) \| `'laserOnly'` (laser→fente uniquement) \| `'off'` (aucun faisceau, seulement la tache à l'écran + point de couleur en sortie du laser) — cf. `scene.js` §Objets de la scène |
| `sim.view` | Vue caméra active : `'3d'` \| `'top'` \| `'side'` \| `'screen'` |
| `sim.screenHalfWidth` | Demi-largeur physique fixe de l'écran simulé (0.125 m — écran réel de TP 25×15 cm) |
| `MASK_SHAPES` | Table des 4 formes : `label` (option du `<select>`), `aLabel` (texte du `<label>` du slider `a`, dépend de la forme). Toutes les formes partagent les mêmes bornes `A_MIN`/`A_MAX` — la diapo 3D reste de toute façon schématique (cf. `scene.js` → `largeurFenteVisuelle`), pas à l'échelle réelle |
| `PETIT_D_MIN_M` / `PETIT_D_MAX_M` | Bornes HTML du slider `d` |
| `BANC_LONGUEUR_M` / `dMaxPourPetitD(d)` | Longueur fixe du banc de TP virtuel ; `Dmax(d) = BANC_LONGUEUR_M - d` — la borne max de `D` suit `d` en temps réel pour que `d+D` ne dépasse jamais la table (cf. `ui.js` → `appliquerBorneD`) |
| `thetaMinimum(λ,a,m)` / `thetaPremierMinimum(λ,a,shape?)` | sin θ ≈ m·λ/a pour une ouverture séparable (fente/carré/fil, zéros de sinc), généralisée au m-ième minimum. `thetaPremierMinimum` (m=1) est dispatché par forme : cas particulier `'cercle'` = 1,22·λ/diamètre (1er zéro de la fonction de Bessel J1, anneau d'Airy — `diamètre = 2·a_um`, car `a_um` est le RAYON pour le cercle, cf. `MASK_SHAPES`) |
| `xMinimum(λ,a,D,m)` / `xPremierMinimum(λ,a,D,shape?)` | Position du m-ième minimum sur l'écran (m), idem — formes séparables uniquement pour `xMinimum` |
| `FAISCEAU_DIAMETRE_MM` | Diamètre réel du faisceau laser (1 mm) — source unique pour le rendu et la physique |
| `largeurFaisceauGaussien(λ,D)` | Rayon du faisceau (m) à distance D par divergence gaussienne naturelle (w0·√(1+(D/zR)²)) — utilisé pour le profil vertical de la texture d'écran et de l'enveloppe 3D pour fente/fil (cf. `scene.js`) |
| `intensiteSinc(x,λ,a,D)` | I(x) sinc² de Fraunhofer (sinθ exact), commune à fente/carré (coupe y=0)/fil (Babinet, cf. sa docstring) |
| `besselJ1(x)` | Approximation rationnelle standard de J1 (Abramowitz & Stegun), sans dépendance externe |
| `intensiteAiry(x,λ,a,D)` | I(v) = [2·J1(v)/v]² — tache d'Airy pour le trou circulaire (non séparable, mais fonction fermée exacte) |
| `intensiteOuverture(x,λ,a,D,shape?)` | Dispatch par forme (`intensiteAiry` pour `'cercle'`, `intensiteSinc` sinon) — **SEULE source** pour le graphe I(x) et les encarts de valeurs (θ, position des minima). Jamais utilisée pour le rendu visuel 3D (texture, enveloppe), cf. §Pipeline FFT |
| `echantillonnerIntensite(n, xMin?, xMax?, lambda_nm?)` | Échantillonne I(x) sur `[xMin,xMax]` (par défaut toute la largeur de l'écran) via `intensiteOuverture` — utilisée par `graph.js`, qui passe la fenêtre RÉELLEMENT visible (`gview`). `lambda_nm` optionnel permet de tracer une courbe à une AUTRE longueur d'onde que `sim.lambda` (mode Lumière blanche, une courbe par couleur) |
| `longueurOndeVersRGB/Hex/Css(nm)` | Conversion λ → couleur (algorithme de Dan Bruton) |
| `resetParams()` | Remet λ/a/d/D/lightSource/blancheVisibles/showRays/beamMode/showLengths/maskShape aux valeurs par défaut |

#### Lumière blanche (`BLANCHE_COULEURS`, `intensiteBlancheRGB`)

Pas une vraie décomposition spectrale continue, mais un compromis pédagogique délibéré : **6
longueurs d'onde de référence**, une par couleur nommée (`BLANCHE_COULEURS` — Violet 420,
Bleu 460, Vert 520, Jaune 580, Orange 610, Rouge 660 nm), utilisées à la fois par le graphe
(une courbe par couleur, cf. `graph.js`) et par la texture d'écran (sommées). Chaque couleur du
graphe correspond ainsi exactement à une composante visible dans la figure sur l'écran.

| Élément | Rôle |
|---|---|
| `BLANCHE_REF` | Référence de « balance des blancs » : somme des RGB des 6 couleurs à I=1 (comme au centre de la figure). `longueurOndeVersRGB` n'a aucune raison de sommer à du blanc pur sur ces 6 teintes précises (choisies pour être reconnaissables, pas pour un équilibre spectral, et penchant côté chaud) — diviser par cette référence force le centre à retomber sur blanc |
| `BLANCHE_LAMBDA_MOYENNE` | λ moyenne des 6 couleurs, utilisée uniquement pour la largeur verticale (gaussienne) du faisceau affiché en mode blanc — varie peu avec λ, un seul réglage représentatif suffit |
| `DECOMPOSE_Y_CM_STANDARD` / `DECOMPOSE_Y_CM_LARGE` / `decomposeYCm(shape?)` | Décalage vertical cible (cm) de chaque couleur en mode « Décomposer la figure de diffraction » (cf. `scene.js`) — violet en haut, rouge en bas. Étendue **par forme** : ±3 cm (fente/fil) vs ±5 cm (carré/cercle, dont les 6 figures sont plus étalées verticalement — diffraction réelle en y — et se chevauchaient trop à l'étendue standard) |
| `intensiteBlancheComposantes(x,a,D)` | Composantes RGB (0-255, non normalisées) des 6 couleurs à l'abscisse x, + leur somme normalisée (`merged`, cf. `intensiteBlancheRGB`). Racine carrée sur chaque intensité avant pondération (même compression que l'affichage mono) : sans elle, les franges secondaires colorées seraient quasi invisibles. Les composantes non normalisées sont réutilisées telles quelles par la vue « Décomposer » (chaque couleur garde sa propre figure) |
| `intensiteBlancheRGB(x,a,D)` | Couleur composite de la figure en lumière blanche à l'abscisse x — `.merged` de la fonction ci-dessus |

#### Pipeline FFT de diffraction (texture d'écran + enveloppe 3D)

**Deux sources d'intensité volontairement indépendantes** — ne jamais faire dépendre l'une de
l'autre : `intensiteOuverture()` (formule fermée exacte, dispatchée par forme) reste l'unique
source du graphe I(x) et des encarts de valeurs ; tout le rendu visuel 3D (texture d'écran,
enveloppe du faisceau, cf. `scene.js`) passe par le pipeline FFT ci-dessous. Motivation : ce
pipeline visuel se généralise à n'importe quelle forme de masque en ne changeant que la
géométrie dessinée dans `construireChampOuverture` — jamais un risque de fausser une valeur
affichée à l'élève (cf. `PISTES_EVOLUTION.md`).

Principe (optique de Fourier) : le champ juste après une ouverture éclairée par un faisceau réel
(pas une onde plane infinie) est `masque(x,y) · champ_incident(x,y)`. La figure de diffraction de
Fraunhofer est `|FFT2D(ce champ)|²`. `champ_incident` = profil gaussien du faisceau laser
(même approximation que `largeurFaisceauGaussien` : col du faisceau au niveau de la fente) dans
tous les cas ; `masque` dépend de `shape` (cf. `construireChampOuverture` ci-dessous). Avantage
par rapport à un facteur `Iy` gaussien multiplié après coup (ancienne approche, encore utilisée
pour fente/fil, cf. `scene.js`) : pour carré/cercle, la divergence naturelle du faisceau ET la
diffraction verticale réelle sortent de la **même** FFT.

| Élément | Rôle |
|---|---|
| `FENTE_HAUTEUR_CM` | Hauteur réelle de la fente (5.6 cm, forme `'fente'`/`'fil'` uniquement), à l'échelle — source unique, reprise par `scene.js` |
| `FFT_N` | Résolution de la grille FFT (1024, puissance de 2) |
| `FFT_FENETRE_FACTEUR` | Facteur (25) de la fenêtre physique échantillonnée dans le plan de l'ouverture, **proportionnelle à la dimension caractéristique de l'ouverture** (`FFT_FENETRE_M = FFT_FENETRE_FACTEUR × extent_m`, calculée par `construireChampOuverture` — `extent_m` = diamètre pour le cercle, `a_m` sinon, cf. piège §4 de `PISTES_EVOLUTION.md`) — pas une largeur fixe |
| `fft1D(re,im,invert)` | FFT radix-2 Cooley-Tukey, en place, itérative |
| `fft2D(re,im,N,invert)` | FFT 2D par décomposition lignes puis colonnes (exact, pas une approximation) |
| `construireChampOuverture(λ,a,D,shape?)` | Construit masque×gaussien incident (masque dépendant de `shape` : rectangle `a×FENTE_HAUTEUR_CM` pour fente/fil — Babinet, cf. sa docstring, pas de masque complémentaire — rectangle `a×a` pour carré, disque de rayon `a` pour cercle), propage par FFT2D, renvoie `{ grille, N, lambda_m, D_m, FFT_FENETRE_M }` (intensité normalisée, pic=1) — appelée par changement de paramètre (`scene.js` → `updateSceneParams`, une fois en mono, 6 fois en lumière blanche cf. §Lumière blanche de `scene.js`), partagée par texture et enveloppe |
| `echantillonnerChamp(champ,x,y)` | Lit l'intensité à une position physique (m), plus proche voisin, renvoie 0 hors de la zone couverte. Conversion position→indice de grille par la relation géométrique **exacte** `sinθ = x/√(x²+D²)` (même relation que `intensiteOuverture()`) — **pas** l'approximation paraxiale `x ≈ λ·D·fx` |

**Piège de dimensionnement (constaté à l'usage, deux fois de suite)** : le rapport entre la
portée couverte par la FFT à l'écran et la position du 1er minimum x₁ vaut
`N / (2·FFT_FENETRE_FACTEUR)` avec une fenêtre proportionnelle à la dimension de l'ouverture —
indépendant de λ, D **et** `a`. Avec `FFT_FENETRE_FACTEUR = 25`, ce rapport vaut ≈20,5, quel que
soit le réglage (fenêtre fixe → proportionnelle à `a`/à l'ouverture : cf. `PISTES_EVOLUTION.md`
pour l'historique complet de ce piège et de sa généralisation aux 4 formes).

---

### `js/scene.js` — Scène 3D (Three.js)

**Chargé après sim.js.** Dépend de `THREE` et `THREE.OrbitControls` (vendés).

#### Convention d'échelle et de repère

**1 unité Three.js = 1 cm.** Axes : `x` = direction de diffraction (largeur de la fente), `y` =
vertical, `z` = axe de propagation (source → écran, `z` croissant).

**Toutes les tailles sont à l'échelle du matériel réel de TP, sauf la largeur de la fente**
(choix explicite de l'utilisateur, cf. discussion de conception) :

| Élément | Taille réelle modélisée |
|---|---|
| Écran (`SCREEN_WIDTH` × `SCREEN_HEIGHT`) | 25 × 15 cm |
| Longueur du banc (`BANC_LONGUEUR_M`, `sim.js`) | 3.15 m — borne `d + D` ensemble (cf. §Réglage d ci-dessous) |
| Lame porte-fente (`SLIDE_SIZE`) | 7 × 7 cm |
| Bande où la fente est gravée (`SLIT_BAND_HEIGHT`) | 5.6 cm — reprend directement `FENTE_HAUTEUR_CM` (`sim.js`, source unique, aussi utilisée par la physique FFT pour fente/fil) |
| Diamètre du faisceau laser (`BEAM_DIAMETER`) | 1 mm |
| Module laser (`LASER_DIAMETER` × `LASER_LENGTH`) | Ø 1,5 cm × 5 cm — dimensions choisies cohérentes avec un module de TP réel |
| Distance laser-fente (`sim.d`, position `SLIT_Z`) | 0.15–2.5 m, réglable — cf. §Réglage d ci-dessous |
| Dimension de l'ouverture (`a`, via `largeurFenteVisuelle`) | **Pas à l'échelle** — mappée sur `LARGEUR_FENTE_MIN_CM`–`LARGEUR_FENTE_MAX_CM` (≈0.064–0.4 cm), commune aux 4 formes (schématique). **La valeur réelle `sim.a` reste seule utilisée dans tous les calculs physiques** |
| Supports (tige + plateau) | Décoratifs, sous laser/lame/écran, posés sur une table virtuelle `TABLE_Y` commune — aucune taille réelle de référence |

Conséquence pédagogique : ce qu'un élève *mesure* (θ, D, position/largeur de la figure) est
physiquement juste ; seule la largeur *dessinée* de l'ouverture elle-même est exagérée.

#### Réglage `d` et longueur du banc

`sim.d` (distance laser-fente) est désormais réglable (slider `sl-d`), pas fixe : le laser
reste à `SOURCE_Z` (fixe), la fente se décale en `SLIT_Z = SOURCE_Z + sim.d·100` — l'écran suit
pour garder `D` inchangé. Comme un vrai banc de TP a une longueur finie, `d + D` ne peut pas
dépasser `BANC_LONGUEUR_M` (`sim.js`) : `ui.js` → `appliquerBorneD()` recalcule la borne `max`
du slider `D` à chaque changement de `d` (`dMaxPourPetitD`) et cappe `D` si nécessaire, **avant**
que `scene.js` ne repositionne quoi que ce soit — la scène ne voit donc jamais un état
`d+D > BANC_LONGUEUR_M`. `D_MAX_CM` (constante scène, 300) doit rester cohérent avec
`BANC_LONGUEUR_M`/`PETIT_D_MIN_M` (`sim.js`) : la table elle-même (cf. §Table et supports) a une
longueur fixe dimensionnée sur ce maximum, pas sur `d`/`D` courants.

#### Forme de l'ouverture (`sim.maskShape`)

La lame porte-fente change de géométrie selon `sim.maskShape` (`refreshSlideVisibility()`,
appelée par `updateSceneParams()` et `setSceneView()`) :

| Forme | Objets visibles | Construction |
|---|---|---|
| `fente` | `topBand`/`bottomBand` (cadre) + `wallLeft`/`wallRight` | 2 bandes pleines + 2 murs latéraux, géométrie unitaire mise à l'échelle (`.scale`) — pas de CSG, l'ouverture est l'espace vide entre les murs |
| `carre` | idem `fente` | Même 4 objets, mais écartement horizontal **et** vertical égal à `gap` (bandes devenues dynamiques, plus fixées à `SLIT_BAND_HEIGHT`) |
| `fil` | `topBand`/`bottomBand` (cadre inchangé) + `wallCenter` | Murs latéraux cachés, remplacés par une fine barre centrale (le fil) |
| `cercle` | `slideCercleMesh` uniquement | Vrai trou circulaire découpé dans le carré `SLIDE_SIZE` via `THREE.Shape` + un trou (`THREE.Path.absarc`), extrudé (`reconstruireSlideCercle`) — la seule forme qui ne peut pas s'obtenir avec des boîtes assemblées, sans CSG |

`largeurFenteVisuelle(a_um)` (écartement schématique `gap`) reste commune aux 4 formes. Côté
physique (FFT, `intensiteOuverture`), le masque correspondant est construit par
`construireChampOuverture(...,shape)` (`sim.js`) — la représentation 3D et le calcul physique
sont deux dispatches indépendants sur `sim.maskShape`, mais cohérents.

#### Objets de la scène (construits une fois par `construireObjets()`)

| Objet | Description |
|---|---|
| `laserBody` | Cylindre représentant le module laser (Ø 1,5 cm × 5 cm), en `z = SOURCE_Z - LASER_LENGTH/2` |
| `beamMesh` | Cylindre fin (Ø 1 mm réel) `MeshBasicMaterial` (auto-éclairé, opaque) de la source à la fente (longueur dépend de `sim.d`), coloré selon λ (blanc en mode lumière blanche) — visible en mode `sim.beamMode` `'visible'` ou `'laserOnly'` |
| `beamEnvelopeMesh` | Enveloppe pleine et translucide du faisceau diffracté (fente → écran) en mode monochromatique — cf. §Enveloppe 3D du faisceau. Visible en mode `'visible'` uniquement, cachée en lumière blanche |
| `beamEnvelopeMeshesBlanche[]` | 3 enveloppes couleur (Rouge/Vert/Bleu, cf. §Lumière blanche ci-dessous), affichées à la place de `beamEnvelopeMesh` en mode `'blanche'` + `'visible'` |
| `beamDot` | Petite sphère colorée selon λ, en sortie du laser — seul indice de couleur visible en mode `'off'` (aucun faisceau dessiné) |
| `topBand` / `bottomBand` | Bandes pleines (haut/bas) de la lame porte-fente — cf. §Forme de l'ouverture |
| `wallLeft` / `wallRight` | Murs latéraux (fente/carré) — cf. §Forme de l'ouverture |
| `wallCenter` | Fil central (forme `'fil'`) — cf. §Forme de l'ouverture |
| `slideCercleMesh` | Trou circulaire extrudé (forme `'cercle'`) — cf. §Forme de l'ouverture |
| `screenMesh` | Plan `PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT)` avec `CanvasTexture` recalculée à chaque changement de paramètre |
| `raysLine` / `axisLine` | `LineSegments`/`Line` en pointillés vers les deux 1ers minima (±x₁) et l'axe optique, masquables via `sim.showRays` |
| `lengthsGroup` (`mesurePetitD`/`mesureGrandD`/`mesureL`) | Doubles flèches de mesure d/D/L — cf. §Doubles flèches de mesure |
| `supportLaser` / `supportSlide` / `supportScreen` | Groupes `creerSupport()` (tige + plateau), un par élément — purement décoratifs |

`updateBeamVisibility()` centralise la visibilité de `beamMesh`/`beamEnvelopeMesh`/
`beamEnvelopeMeshesBlanche`/`beamDot` d'après `sim.beamMode` × `sim.lightSource` croisés avec la
vue active (masqués en vue Écran) — appelée depuis `updateSceneParams()` et `setSceneView()`. Le
bouton « Faisceau lumineux » du panneau (`ui.js` → `cycleBeamMode()`) fait cycler `sim.beamMode`
entre les 3 valeurs ; le bouton « Source lumineuse » (`ui.js` → `cycleLightSource()`) bascule
`sim.lightSource`.

#### Lumière blanche (rendu 3D)

Deux volets, tous deux basés sur les 6 (texture) ou 3 (enveloppe) couleurs de référence de
`sim.js` → `BLANCHE_COULEURS`, chacune nécessitant sa **propre** FFT complète
(`construireChampOuverture` par couleur — pas de raccourci analytique, pour rester généralisable
à d'autres formes) :

- **Enveloppes couleur** (`beamEnvelopeMeshesBlanche`, `reconstruireEnveloppesBlanche()`) : **TEST
  volontairement limité à 3 couleurs** (`ENVELOPPE_COULEURS_TEST` = Rouge/Vert/Bleu, pas les 6 de
  `BLANCHE_COULEURS`) — hypothèse qu'une synthèse additive RVB suffit à redonner du blanc en
  volume 3D, pour moitié moins de FFT (donc moins de lag) que les 6 couleurs complètes ;
  normalisation dédiée (`ENVELOPPE_REF_TEST`), propre à ce sous-ensemble. `THREE.AdditiveBlending`
  (contrairement au blending normal de l'enveloppe mono) : la lumière réelle qui se superpose
  s'additionne (rouge+vert+bleu → blanc), pas un mélange terne de calques semi-transparents.
- **Texture d'écran** (`dessinerTextureEcranBlanche(t)`) : toujours les **6** couleurs. Pour
  fente/fil, approximation par profil gaussien vertical `Iy(y)` précalculé par ligne (comme le
  rendu mono) ; pour carré/cercle (diffraction verticale réelle), échantillonnage direct du champ
  FFT 2D par couleur, mis en cache (`champsTextureBlanche`/`champsTextureBlancheShape`) et
  reconstruit avec anti-rebond (`planifierChampsTextureBlanche`, `ENVELOPPES_BLANCHE_DEBOUNCE_MS`
  = 50 ms) — pas à chaque frappe de slider ni à chaque frame de l'animation Décomposer. Tant que
  le cache n'est pas prêt pour la forme courante, retombe sur l'approximation gaussienne.

**Anti-rebond** (`enveloppesBlancheTimer`/`champsTextureBlancheTimer`) commun aux deux volets :
chaque changement de paramètre relance un court délai, annulé et redémarré à chaque nouvelle
frappe pendant un glissement de slider — évite de relancer 3 ou 6 FFT complètes en continu.
`annulerEnveloppesBlancheEnAttente()`/`annulerChampsTextureBlancheEnAttente()` annulent un délai
en attente en quittant le mode blanc (`ui.js` → `syncModeBlancheUI`).

**Décomposition animée** (`toggleDecompose()`, `tickDecompose()`, bouton « Décomposer la figure
de diffraction », `index.html` → `#decompose-buttons`) : disponible en vue Écran + lumière blanche
uniquement (`syncBoutonDecompose()`). `decomposeActive` (état cible du bouton) et `decomposeT`
(degré de transition réellement atteint, 0→1, animé à `DECOMPOSE_VITESSE` par frame,
`DECOMPOSE_DUREE_S` = 2 s) sont séparés pour permettre une animation fluide dans les deux sens.
`dessinerTextureEcranBlanche(t)` interpole la position verticale ET la largeur de chaque couleur
entre l'état fusionné (t=0, toutes superposées) et `decomposeYCm(shape)` (t=1, 6 figures
séparées) — chaque composante est normalisée **individuellement** par `BLANCHE_REF` pour qu'à
t=0 la somme retombe exactement sur la figure fusionnée normale (pas un fondu entre deux rendus
différents, un seul morphing continu). `annulerDecompose()` coupe instantanément (sans animation)
en sortant du mode blanc ou en changeant de vue.

#### Table et supports (`creerSupport()`)

Chaque élément posé « en l'air » (laser, lame, écran) a un support (tige verticale + plateau) dont
le **dessus du plateau est à `TABLE_Y`**, et repose sur une **table physique** (un seul plan,
`TABLE_WIDTH` × longueur fixe, construite une fois dans `construireObjets()`) dont le dessus est à
`TABLE_Y - PLATEAU_EPAISSEUR` — juste sous les plateaux.

**Longueur de la table fixe, pas dynamique** : de `SOURCE_Z - LASER_LENGTH - 5` jusqu'à
`D_MAX_CM + 10` (marge de chaque côté) — dimensionnée sur le maximum théorique de `d+D`
(`BANC_LONGUEUR_M`), pas sur les valeurs courantes. Elle ne rétrécit/s'allonge jamais quand `d`
ou `D` changent, comme une vraie table.

**Principe pour ne jamais casser l'alignement optique** : `creerSupport()` construit le groupe
avec le **sommet de la tige à l'origine locale** (`y = 0`) — poser le groupe à
`(x, yBasElement, z)` de l'élément suffit à le faire tenir exactement en dessous. `supportSlide`
suit `SLIT_Z` (donc `sim.d`) et `supportScreen` suit `screenZ = SLIT_Z + D_cm` — tous deux mis à
jour dans `updateSceneParams()` ; `x` et `y` ne sont jamais modifiés après la construction
initiale.

#### Pieds de table et sol

3 paires de pieds (`LEG_SECTION` × `LEG_LENGTH`, 75 cm), réparties au début, au milieu et à la fin
de la table. Le **sol** (`floor`) est un grand plan fixe dont le dessus définit `FLOOR_Y` (déduit
de `TABLE_Y` et de la hauteur des pieds). Entièrement statique, comme la table.

#### Zoom ancré sur l'axe optique (`initZoomVersCurseur()`)

Le zoom natif d'`OrbitControls` (molette) dolly toujours vers `controls.target`, un pivot fixe —
`controls.enableZoom = false` désactive ce comportement natif ; `initZoomVersCurseur()` le
remplace, avec un comportement **asymétrique entre zoom avant et zoom arrière** :

- **Zoom avant** (`pas > 0`) : vise le **point de l'axe optique le plus proche du rayon souris**
  (`pointAxeLePlusProche()`, distance minimale entre deux droites). `camPersp.position` et
  `controls.target` sont interpolés (`lerp`, `t=0.15`) vers ce point, qui devient le nouveau pivot.
- **Zoom arrière** (`pas < 0`) : cf. §Recentrage au dézoom — ne cherche délibérément **pas** de
  nouveau point.

Distance résultante recadrée dans `[controls.minDistance, controls.maxDistance]`. Actif
uniquement en vue 3D.

#### Recentrage au dézoom

Le zoom arrière fait deux choses à la fois, sans jamais recalculer de point via un raycast :
1. **S'éloigne** de la cible actuelle : `dir = (position - target) × 1.15`.
2. **Recentre** progressivement `controls.target.z` vers le milieu de la scène
   (`centreZ = (SOURCE_Z + screenZ) / 2`, `screenZ = SLIT_Z + D_cm`), d'une fraction `0.12` de
   l'écart à chaque cran de molette.

**Mode axial** (cas dégénéré, vue en enfilade dans le faisceau) : `initZoomVersCurseur()` teste
`Math.abs(forward.z)` contre `SEUIL_MODE_AXIAL` (0.95, ≈18° de l'axe) **avant** tout calcul de
point sur l'axe. Au-delà, **mode axial : un coulissement, pas un zoom** — `camPersp.position` et
`controls.target` translatent **du même vecteur**, selon `z` uniquement (jamais `forward`
complet, qui dériverait hors axe), avec un garde-fou large (`SOURCE_Z - 300` à `D_MAX_CM + 300`).
Le signe de la translation vient de `Math.sign(controls.target.z - camPersp.position.z)` (relation
caméra→cible, cohérente avec le clamp de distance juste après), pas de `forward.z` (source
indirecte, pouvait donner un signe incohérent près du seuil).

#### Caméras — 2 objets pour 4 vues

- **`camPersp`** (`PerspectiveCamera` + `OrbitControls`) : vue **3D**, orbite libre à la souris.
  Cadrage par défaut fixé par `reset3DCamera()`, appelé à l'initialisation et par « Réinitialiser »
  uniquement — pas en recliquant sur « Vue 3D » (choix volontaire, préserve le cadrage de l'élève).
- **`camOrtho`** (`OrthographicCamera`, réutilisée) : vues **Dessus / Profil / Écran**.
  Repositionnée et recadrée à **chaque frame** par `updateOrthoCamera()`. `OrbitControls` désactivé
  sur ces 3 vues.
  - **Dessus** : laser à **gauche**, écran à **droite** (`camOrtho.up = (1,0,0)`). L'évasement du
    faisceau diffracté n'est exagéré (`TOP_VIEW_PLANCHER_GAIN`, ×6) que sur les tout premiers
    `TOP_VIEW_FLARE_LONGUEUR_CM` (= `SLIDE_SIZE`) après la fente.
  - **Dessus / Profil — cadrage figé sous `D_CADRAGE_MIN_CM`** (140 cm) : `updateOrthoCamera`
    borne la distance utilisée pour le cadrage (`D_cadrage = max(D_cm, D_CADRAGE_MIN_CM)`).
  - **Écran** : caméra alignée avec l'axe du graphe I(x) en bas. Figure et montage
    **symétriques par rapport à x = 0** pour cette simulation.
  - **Écran — zoom molette** (`screenViewZoom`, 1 à `SCREEN_VIEW_ZOOM_MAX`=15) : centré sur (0,0),
    jamais sur le curseur. Le graphe se recale automatiquement, cf. §graph.js.
  - En vue **Écran**, le banc (source, faisceau, plaque de la fente) est masqué.
  - `fitOrtho(cam, halfW, halfH, aspect)` : ajuste `left/right/top/bottom` en mode « contain ».
  - `fracXVueEcran(x_m)` : position horizontale d'un point physique dans le canvas 3D courant, en
    fraction 0..1 — utilisée par `graph.js` → `dessinerLienFigure()`.

#### Texture de l'écran

`updateSceneParams()` construit d'abord `champ = construireChampOuverture(λ,a,D,shape)` (mode
mono) — ou 6 champs en mode blanc, cf. §Lumière blanche — puis reconstruit un `ImageData`
(512×64) en lisant `echantillonnerChamp` pour la composante horizontale (fente/fil) ou un
balayage 2D direct (carré/cercle, `balayage2D`) — **pas** `intensiteOuverture()`, réservée au
graphe et aux encarts. Le même `champ` mono est aussi passé à `construireGeometrieEnveloppe()` :
un seul calcul FFT par changement de paramètre, partagé entre texture et enveloppe.

**Profil vertical (fente/fil)** : `largeurFaisceauGaussien(λ,D)` reste calculée séparément et
appliquée après coup en y — la fente (bien plus haute que le faisceau) ne contraint jamais
verticalement à l'échelle de la fenêtre FFT. **Carré/cercle** : diffractent réellement en y ; leur
profil vertical vient directement d'un échantillonnage 2D du champ FFT (`balayage2D`), pas de ce
facteur séparé.

**Piège #1 (aspect du buffer)** : le buffer de la texture (`screenTexCanvas`) doit garder le
**même ratio largeur/hauteur que le plan physique** (`SCREEN_WIDTH`/`SCREEN_HEIGHT`).

**Piège #2 (échelle non proportionnée)** : `largeurFaisceauGaussien` fournit une vraie grandeur
physique plutôt qu'un écart-type vertical arbitraire.

**Plancher de rendu (`RENDU_W_MIN_CM`)** : `w_cm` est plancherisé à 0.2 cm (le faisceau réel peut
descendre sous 1 mm de rayon, en dessous de ce que la texture peut représenter proprement).

**Rayons masqués en vue Écran** : `raysLine.visible` tient compte de `sim.showRays` et de
`sim.view !== 'screen'`.

#### Enveloppe 3D du faisceau (`beamEnvelopeMesh`, `construireGeometrieEnveloppe()`)

Un vrai cône dont la base épouse la silhouette de la tache projetée, reconstruit entièrement à
chaque changement de paramètre, généralisé aux 4 formes via un paramètre `shape` :

- **Un seul maillage continu**, formé d'une nappe « côté écran » (grille (x,y) complète à
  `z=zFar`) et d'un « ruban » en profondeur pour **chaque** rangée y — une rangée n'allant que du
  sommet-arête commun côté fente au contour de la grille écran laisserait la vue Profil creuse en
  son centre.
- **Sommets partagés** entre triangles adjacents (géométrie indexée), jamais de solide dupliqué
  par échantillon.
- **Connectivité X et Y** : chaque rangée reliée en profondeur à ses voisines en x **et** ses
  rangées voisines reliées entre elles à chaque profondeur.
- **Fente/fil (`balayage2D = false`)** : double codage x/y — demi-hauteur de la silhouette
  proportionnelle à `√I(x)` (pince à une largeur nulle exactement aux minima) ; couleur de sommet
  suit un dégradé `√I(x)·Iy(y)` avec `Iy` = profil gaussien réel du faisceau incident (indépendant
  de x). `ENVELOPPE_GAMMA_LUMINOSITE` (1.6, au lieu de 0.5) compresse plus fort la LUMINOSITÉ que
  la géométrie : les taches secondaires restent visibles en silhouette mais paraissent moins
  lumineuses.
- **Carré/cercle (`balayage2D = true`)** : silhouette ET luminosité échantillonnées directement
  dans le champ 2D réel (`echantillonnerChamp(champ, x, y)`), par un balayage du bord vers le
  centre (`PAS_BALAYAGE_Y`) — robuste même si l'intensité n'est pas monotone en y (anneaux
  d'Airy du cercle, exclut une simple bissection). Borne verticale du balayage
  (`yBalayageMax_m`) dérivée de la portée maximale réellement couverte par la grille FFT
  (mêmes calculs que le ratio couverture/1er-minimum de `sim.js`), pas `sim.screenHalfWidth`
  (bien trop grossier) — sans cette borne, la silhouette était quantifiée/artefactée (cercle pas
  circulaire, constaté par l'utilisateur).
- **Couleur constante le long de chaque rayon** (pas un fondu depuis un blanc plein à la fente).
- **`ShaderMaterial` sur mesure** plutôt que `MeshBasicMaterial`+vertexColors : réutilise
  directement l'attribut `color` comme alpha du fragment (l'absence de lumière donnait des
  bandes noires opaques avec le matériau standard).
- **Plancher d'opacité** (`uPlancherAlpha`, borné par `uXLimite`/`uYLimite`) : la largeur réelle
  de l'enveloppe près de la fente est physiquement correcte mais quasi invisible en alpha. Actif
  sur toute la longueur du faisceau, restreint aux rayons dont l'abscisse **à l'écran** (attribut
  `aXFar`/`aYFar`, constants le long du rayon) tombe dans la zone de la tache centrale.
  `uPlancherRadial` (0/1) sélectionne un test rectangulaire (produit de deux smoothstep 1D — forme
  exacte du 1er minimum d'un carré séparable) ou radial/elliptique (forme exacte du 1er anneau
  d'Airy) selon la forme — un test rectangulaire donnait un plancher visiblement pas circulaire
  pour le cercle. `uXLimiteReel`/`uXLimiteExagere` (+ pendant Y) mélangés selon `z` reproduisent
  l'exagération en vue de dessus (cf. §Caméras), inchangée dans son principe.

Historique complet des versions intermédiaires : cf. les commentaires détaillés dans `scene.js`
autour de `construireGeometrieEnveloppe()` et `PISTES_EVOLUTION.md`.

#### Doubles flèches de mesure (`sim.showLengths`, bouton « Afficher les longueurs »)

Trois mesures superposées à la scène, **indépendantes** des rayons pointillés (`sim.showRays`) :
`mesurePetitD` (distance laser→fente, `d`), `mesureGrandD` (fente→écran, `D`), `mesureL` (largeur
de la tache centrale, `2·x1`). Chacune combine une double flèche (`creerFlecheDouble`/
`creerFlecheDoublePlate`), deux pointillés de rappel (`creerPointilleSegment`) et un label texte
(`creerLabelMesure`/`setLabelTexte`, canvas → `CanvasTexture`), repositionnés par
`updateLengthsGroup()` (appelée par `updateSceneParams()` et `setSceneView()`).

- **Rendu par pavés pleins, pas des `THREE.Line`** (`creerPointilleSegment`) : l'épaisseur réelle
  à l'écran d'une ligne GL native n'est pas garantie (souvent clampée à 0-1 px selon le pilote,
  notamment ANGLE/Windows) — invisible à certains zooms (bug observé, non résolu par
  depthTest/depthWrite/ordre de rendu). Des pavés (`Mesh` `BoxGeometry`) ont une épaisseur réelle
  en cm, donc toujours visible.
- **`renderOrder` très élevé** (`LEN_RENDER_ORDER` = 500) + `depthTest:false` sur tous les
  matériaux de ce module : garantit que flèches/pointillés/labels restent toujours dessinés
  par-dessus, quelle que soit la géométrie 3D sous-jacente (ex. le plateau du support d'écran).
- **d/D** : positionnées sur la table (vue 3D/Dessus, décalées latéralement de `LEN_OFFSET_X`
  pour éviter les supports) ou dans la tranche de la table (vue Profil, `LEN_SIDE_Y`) —
  masquées en vue Écran (pas de profondeur visible de face). Labels compensés en taille
  (`zoomCompense`) sous `D_CADRAGE_MIN_CM` pour rester lisibles quand la caméra Dessus/Profil
  recule (cf. §Caméras).
- **L** : deux variantes selon la vue — `mesureL.fleche` (volumique, cônes) en vue Dessus, où
  la flèche est reportée légèrement derrière l'écran (`LEN_TOP_L_DECALAGE_Z`) car l'axe Y réel
  y est aplati ; `mesureL.flechePlate` (`creerFlecheDoublePlate`, strictement plate, aucune
  épaisseur en z) en vue 3D/Écran, posée à même le plan de l'écran — un décalque 2D plutôt qu'un
  objet 3D visible en volume depuis la perspective. Masquée en vue Profil (une ligne horizontale
  vue de côté n'apporte rien).
- **`orienterDecalque(mesh, right, up)`** : oriente un décalque (label ou flèche plate) via une
  base orthonormée explicite (normale + sens de lecture simultanément fixés), plutôt qu'une
  rotation Euler à un seul axe — nécessaire pour ne jamais rendre le texte en miroir.

#### DPI

`renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` — le cap à 2 évite de saturer le fill-rate
WebGL sur écran très haute densité. **Différent du pattern `ctx.setTransform` du canvas 2D
classique** utilisé ailleurs sur le site (cf. `graph.js`) : ne pas mélanger les deux approches en
cas de copier-coller vers une autre page.

---

### `js/graph.js` — Graphe I(x) interactif

**Chargé après scene.js.** Dépend de `sim.js` (canvas 2D classique, aucune dépendance à Three.js)
et, pour le mode Lien figure, de quelques éléments exposés par `scene.js` (`camOrtho`,
`fracXVueEcran`).

- Pas de dimension temporelle : I(x) est recalculée intégralement à chaque frame à partir des
  paramètres courants (`echantillonnerIntensite`), pas d'accumulation de points dans le temps.
- **Interactions volontairement réduites au minimum** (zoom rectangulaire, pan clic-glissé,
  molette, tangente, historique de vues — retirés, jugés superflus) :
  - **Survol toujours actif** — mode mono uniquement (cf. ci-dessous) : le point de la courbe le
    plus proche de l'abscisse survolée est mis en évidence, via `pointLePlusProche()`.
  - **Épingler** (`graphPinMode`, bouton 📍) : en mode actif, cliquer épingle le point le plus
    proche dans `graphPins[]` ; recliquer sur une épingle existante (tolérance 8 px) la retire.
    RAZ par `resetSim()`.
  - Plus de pan/zoom manuel sur le graphe lui-même — la seule façon de changer la fenêtre affichée
    est le zoom molette de la vue Écran (`scene.js` → `screenViewZoom`), pilotée via
    `syncGraphPixelParfait()`.
- Vue courante : `gview = { xMin, xMax, yMin, yMax }` (mètres en x, intensité normalisée en y).
  `GRAPH_PAD` (marge interne fixe) partagée entre le dessin et les interactions souris, via
  `graphLayout(cv)`.
- Axe X affiché en cm.

#### Mode Lumière blanche (`syncGraphModeBlanche`, `initLegendeBlanche`)

Une **légende à cases à cocher** (`#graph-legend-blanche`, visible seulement en lumière blanche)
liste les 6 `BLANCHE_COULEURS`, chaque case pilotant `sim.blancheVisibles[nom]` — décochable
indépendamment, redessine le graphe à chaque changement (`initLegendeBlanche()`, appelée une
seule fois par `ui.js` → `init()`).

`drawIntensityGraph()` trace **une courbe par couleur cochée** (au lieu de la seule courbe de
`sim.lambda`) quand `sim.lightSource==='blanche'`. Le survol/épinglage bascule alors sur
`dessinerInfoMultiCourbes()` : un marqueur par couleur visible à l'abscisse pointée + un seul
encart listant toutes leurs valeurs — « le » point le plus proche n'aurait pas de sens univoque
avec plusieurs courbes superposées.

Le bouton « Lien figure » (cf. ci-dessous) n'a pas de sens avec plusieurs courbes superposées :
`syncGraphLienDisponibilite()` le désactive aussi en lumière blanche, pas seulement hors vue
Écran.

#### Lien Figure (`graphLienMode`, bouton « Lien figure »)

N'a de sens qu'en **vue Écran** ET **mode monochromatique** (seul cas où la figure 3D et le
graphe représentent sans ambiguïté la même chose, au même endroit physique) :
`syncGraphLienDisponibilite()` (appelée par `scene.js` → `setSceneView()` et par
`syncGraphModeBlanche()`) grise/coupe le mode dès que l'une des deux conditions cesse d'être
vraie.

Dessine, sur un overlay dédié (`#graph-lien-overlay`, `<canvas>` en `position:absolute`
recouvrant scène 3D + splitter + graphe, `pointer-events:none`), des pointillés reliant chaque
extremum du graphe à sa position sur la figure affichée en vue Écran — une couleur pour les
maxima (`COULEUR_LIEN_MAXIMA`), une pour les minima (`COULEUR_LIEN_MINIMA`). Redessiné à
**chaque frame** (`dessinerLienFigure()`, appelée depuis `ui.js` → `loop()`) : la géométrie des
deux canvas peut changer à tout moment sans qu'aucun événement dédié ne le signale.

- **Détection des extrema** (`calculerExtrema(pts)`) : comparaison de chaque point à une fenêtre
  de `EXTREMA_FENETRE` (2) voisins de chaque côté, avec des inégalités **larges** — au sommet
  d'un maximum, la courbe est quasi plate sur plusieurs échantillons ; `dedupePlateau()` fusionne
  ensuite les points consécutifs d'un même groupe en un seul point représentatif (celui
  d'intensité réellement la plus haute/basse, pas son milieu géométrique).
- **Coupure au 2e minimum** (`limiterAuDeuxiemeMinimum()`) : n'affiche que le maximum central, le
  1er minimum, la 1ère tache secondaire et le 2e minimum de chaque côté.
- **Alignement pixel-parfait** (`syncGraphPixelParfait()`, appelée par `scene.js` →
  `syncGraphAvecVueEcran()`) : calcule `gview` pour que le graphe ait exactement la **même
  échelle px/m** et le **même pixel de page pour x=0** que la vue Écran.

---

### `js/ui.js` — Contrôles et boucle d'animation

**Chargé en dernier.**

- `updateParam(name, val)` : met à jour `sim` (`lambda`/`a`/`D`/`d`), les labels, appelle
  `appliquerBorneD()` (si `d` a changé), `updateSceneParams()` + `updateReadouts()`.
- `updateMaskShape(shape)` : change `sim.maskShape`, resynchronise le `<select>` et le label du
  slider `a` (`syncMaskShapeUI()`), appelle `updateSceneParams()` + `updateReadouts()`.
- `appliquerBorneD()` : recalcule la borne `max` du slider `D` (`dMaxPourPetitD(sim.d)`,
  `sim.js`) et cappe `sim.D`/le slider si nécessaire — appelée à chaque changement de `d`, à
  `resetSim()` et à `init()`.
- `cycleLightSource()` : bascule `sim.lightSource` entre `'mono'`/`'blanche'`, met à jour le
  libellé du bouton « Source lumineuse », appelle `syncModeBlancheUI()` (désactive slider λ,
  bouton rayons et encarts θ/largeur — sans sens en lumière blanche — coupe la décomposition en
  cours) puis `updateSceneParams()` + `updateReadouts()`.
- `toggleRays()` / `toggleLengths()` : basculent `sim.showRays`/`sim.showLengths`.
- `cycleBeamMode()` : fait cycler `sim.beamMode` entre `'off'`/`'laserOnly'`/`'visible'`.
- `setView(view)` : appelle `setSceneView(view)` (scene.js) + met à jour les boutons `.btn-view`.
- `setMainTab(tab)` : bascule entre les deux onglets principaux du panneau (`'lumineuses'` /
  `'surfaces'`, cf. §Écarts connus) — met à jour l'URL (`history.replaceState`, lien profond
  `#surfaces`/`#lumineuses`), la visibilité des sections panneau/scène, et relance `resize()`
  (la scène 3D et le canvas du graphe n'ont des dimensions exploitables qu'une fois réaffichés).
- `resetSim()` : `resetParams()` + `appliquerBorneD()` + RAZ sliders (dont `d`)/épingles du
  graphe/vue graphe/caméra 3D/libellés des boutons (mode faisceau, source lumineuse, forme de
  l'ouverture). Le mode Lien figure se coupe automatiquement via `setView('3d')` →
  `setSceneView()` → `syncGraphLienDisponibilite()`.
- Splitter draggable entre `#scene-area` et `#graph-area` (pattern identique à
  `condensateur/js/circuit.js`).
- `resize()` anti-rebond (`requestAnimationFrame`) → `resizeScene()` + `resizeGraphCanvas()`.
- `loop()` : boucle continue (`requestAnimationFrame`) qui appelle `renderScene()`,
  `tickDecompose()` (animation Décomposer, no-op hors mode blanc/vue Écran),
  `drawIntensityGraph()` et `dessinerLienFigure()` à chaque frame.

---

## Ordre de chargement et dépendances

```
index.html
  └── ../libs/three.min.js       expose : THREE (global)
  └── ../libs/OrbitControls.js   expose : THREE.OrbitControls
  └── js/sim.js       expose : sim, A_MIN/MAX, MASK_SHAPES, PETIT_D_MIN/MAX_M, BANC_LONGUEUR_M,
  │                             dMaxPourPetitD, FAISCEAU_DIAMETRE_MM,
  │                             thetaMinimum/thetaPremierMinimum, xMinimum/xPremierMinimum,
  │                             intensiteSinc, besselJ1, intensiteAiry, intensiteOuverture,
  │                             largeurFaisceauGaussien, echantillonnerIntensite,
  │                             FENTE_HAUTEUR_CM, FFT_N, FFT_FENETRE_FACTEUR, fft1D, fft2D,
  │                             construireChampOuverture, echantillonnerChamp,
  │                             longueurOndeVersRGB/Hex/Css, BLANCHE_COULEURS, BLANCHE_REF,
  │                             BLANCHE_LAMBDA_MOYENNE, decomposeYCm,
  │                             intensiteBlancheComposantes, intensiteBlancheRGB, resetParams
  │
  └── js/scene.js     dépend de : sim.js, THREE, THREE.OrbitControls
  │                   expose : initScene, updateSceneParams, setSceneView, reset3DCamera,
  │                             resizeScene, renderScene, camOrtho, fracXVueEcran,
  │                             syncGraphAvecVueEcran, toggleDecompose, tickDecompose,
  │                             syncBoutonDecompose, annulerDecompose,
  │                             annulerEnveloppesBlancheEnAttente,
  │                             annulerChampsTextureBlancheEnAttente, formatFr
  │                             (appelle en retour des fonctions de graph.js)
  │
  └── js/graph.js     dépend de : sim.js, et de scene.js pour le mode Lien figure (camOrtho, fracXVueEcran)
  │                   expose : gview, graphPins, graphPinMode, drawIntensityGraph, dessinerLienFigure,
  │                             initGraphInteractions, initLegendeBlanche, syncGraphModeBlanche,
  │                             resizeGraphCanvas, toggleGraphPin, toggleGraphLien,
  │                             syncGraphLienDisponibilite, syncGraphPixelParfait
  │
  └── js/ui.js        dépend de : tous les fichiers précédents
                       expose : updateParam, updateMaskShape, appliquerBorneD, cycleLightSource,
                                 toggleRays, toggleLengths, cycleBeamMode, setView, setMainTab,
                                 updateReadouts, resetSim, toggleHint, resize, init
                       démarre : init() → requestAnimationFrame(loop)
```

> Tous les fichiers utilisent le scope global (pas de modules ES). L'ordre de chargement est critique.

---

## Écarts connus par rapport à CONTEXTE_PROJET.md

- Aucune fonctionnalité de détection téléphone/orientation (pas d'overlay de rotation, pas de
  media query dédiée) : choix assumé pour cette page.
- Onglet principal « Ondes de surfaces » (`#section-surfaces`, `#surfaces-area`) : placeholder
  non implémenté (icône + texte « Simulation à venir »), déjà présent dans le HTML/CSS/`ui.js` →
  `setMainTab()` pour préparer une future simulation dans cette même page — n'affecte pas
  l'onglet « Ondes lumineuses » documenté ci-dessus.
