# Architecture — Simulation Interférences (fentes/trous d'Young, 3D)

## Arborescence

```
interferences/
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

Dépendances externes vendées dans `site/libs/` (partagées avec `diffraction/` et toute future
simulation 3D) : `three.min.js` (build UMD/global, r128) + `OrbitControls.js`. Chargées en
`<script>` classiques avant `sim.js` — scope global, pas de modules ES, pour rester ouvrables en
double-clic (`file://`), comme toutes les autres pages du site.

**Origine** : dossier dupliqué depuis `diffraction/` puis adapté (l'essentiel du pipeline FFT/
rendu 3D de la diffraction se généralise directement aux interférences, cf. §Pipeline FFT
ci-dessous) — les deux pages partagent la même architecture générale mais **aucun fichier
commun** : chaque dossier a sa propre copie de `sim.js`/`scene.js`/`graph.js`/`ui.js`, avec ses
propres constantes (ex. `FFT_N`/`FFT_FENETRE_FACTEUR`, différents entre les deux, cf.
§Fenêtrage FFT).

---

## Périmètre physique

Interférences de Fraunhofer par **2 ouvertures identiques** (fentes d'Young verticales, **par
défaut**, ou trous d'Young), séparées d'un écartement réglable **b** (centre à centre, 0,1–1 mm).
Chaque ouverture a la même grandeur caractéristique `a` (largeur de fente / rayon de trou, 20–500
µm, mêmes bornes que `diffraction/`) qu'en diffraction simple. Source laser réglable en `λ`
(monochromatique) **ou** lumière blanche (6 couleurs de référence). Pas de fentes/trous
horizontaux, carrés ou fil pour l'instant (`sim.maskShape` réduit à `'fente'`/`'cercle'`,
contrairement aux 5 formes de `diffraction/`) — évolution possible plus tard.

`index.html` expose **3 onglets principaux** (`setMainTab`, `ui.js`) : **Principe** (placeholder),
**Ondes de surface** (placeholder), **Ondes lumineuses** (cette simulation, entièrement
implémentée) — dans cet ordre, "Ondes lumineuses" actif par défaut.

---

## Clé physique : théorème du réseau (pourquoi la duplication depuis `diffraction/` fonctionne)

Pour 2 ouvertures identiques centrées en x=∓b/2, le champ est la convolution du masque d'une seule
ouverture avec 2 Dirac en ∓b/2. En champ lointain (Fraunhofer), une convolution devient un
**produit** :

```
I_interférence(x) = I_enveloppe(x) × facteurInterference(x)
```

où `I_enveloppe` est l'enveloppe de diffraction d'**une seule** ouverture (exactement
`intensiteOuverture()`/`intensiteSinc()`/`intensiteAiry()` de `diffraction/`, reprises
**sans changement**) et `facteurInterference(x) = cos²(π·b·sinθ/λ)` (sinθ exact, cf. sim.js).
Cette factorisation est **exacte pour n'importe quelle forme d'ouverture**, pas seulement la
fente — d'où la généralité de l'approche.

- **Formule fermée (graphe/encarts)** : `intensiteInterference()` = `intensiteOuverture()` ×
  `facteurInterference()`, aucune nouvelle physique à dériver au-delà du produit ci-dessus.
- **Pipeline FFT (texture/enveloppe 3D)** : cf. §Pipeline FFT plus bas — **le produit est appliqué
  au moment de l'ÉCHANTILLONNAGE du champ FFT, pas dans le masque**. Une première version dessinait
  le masque comme l'union de 2 ouvertures décalées de ∓b/2 (la FFT d'un tel masque redonne aussi
  directement enveloppe × franges) ; abandonnée pour des raisons de performance et de résolution,
  cf. §Pipeline FFT.

---

## Fichiers et responsabilités

### `js/sim.js` — État global et physique

**Chargé en premier.** Ne dépend de rien d'autre dans le projet.

| Élément | Rôle |
|---|---|
| `sim.a` | Grandeur caractéristique de CHAQUE ouverture (µm, 20–500) — largeur (fente) ou rayon (trou), mêmes bornes que `diffraction/` |
| `sim.b` | Écartement CENTRE À CENTRE des 2 ouvertures (µm, 100–1000) — stocké en µm (même convention que `sim.a`), affiché en mm dans le panneau (cf. `ui.js` → `updateParam`) |
| `sim.maskShape` | `'fente'` (fentes d'Young verticales, **défaut**) \| `'cercle'` (trous d'Young) |
| `MASK_SHAPES` | Table des 2 formes (label du `<select>`, `aLabel` du slider `a`) |
| `A_MIN`/`A_MAX`, `B_MIN`/`B_MAX` | Bornes des sliders `a` (20–500 µm) et `b` (100–1000 µm) |
| `intensiteOuverture(x,λ,a,D,shape)` | Enveloppe de diffraction d'UNE seule ouverture — reprise telle quelle de `diffraction/` (dispatch `intensiteSinc`/`intensiteAiry` par forme), **jamais** utilisée seule pour le rendu final |
| `facteurInterference(x,λ,b,D)` | `cos²(π·b·sinθ/λ)`, sinθ exact — cf. §Clé physique |
| `intensiteInterference(x,λ,a,b,D,shape)` | `intensiteOuverture(...) × facteurInterference(...)` — **SEULE source** pour le graphe I(x) et les encarts de valeurs, jamais le pipeline FFT |
| `interfrangeI(λ,b,D)` | `λ·D/b` (formule standard, approximation petits angles — valide ici car b,x≪D sur tout le domaine réglable) — écart entre 2 franges consécutives, seule grandeur utilisée par l'encart "Interfrange" |
| `construireChampOuverture(λ,a,D,shape)` | **UNE SEULE** ouverture, centrée en x=0 — signature et implémentation strictement identiques à `diffraction/js/sim.js` (aucune trace de `b`). Propagé par `fft2D` — cf. §Pipeline FFT |
| `echantillonnerChamp(champ,x,y)` | Inchangée vs `diffraction/` — lit l'intensité de l'ENVELOPPE (une seule ouverture) à une position physique, conversion exacte sinθ=x/√(x²+D²) |
| `echantillonnerChampInterference(champ,x,y,b)` | **Nouvelle** — `echantillonnerChamp(...) × facteurInterference(...)` (λ/D lus sur `champ`) : combine l'enveloppe FFT avec le facteur de frange exact. C'est cette fonction, pas `echantillonnerChamp` seule, qui donne l'intensité d'interférence réellement affichée — cf. §Pipeline FFT pour pourquoi |
| `echantillonnerIntensite(n,xMin?,xMax?,λ?)` | Appelle `intensiteInterference` (avec `sim.b`) au lieu de `intensiteOuverture` — utilisée par `graph.js` |
| `intensiteBlancheComposantes/RGB(x,a,b,D)` | Signature étendue avec `b` vs `diffraction/` (mêmes fonctions, même principe — 6 couleurs de référence, `BLANCHE_REF` pour la balance des blancs) ; formule fermée, aucun rapport avec le FFT |
| `resetParams()` | Ajoute `sim.b = 500` (0,5 mm, défaut) aux réinitialisations héritées de `diffraction/` |

Toutes les autres fonctions (`thetaMinimum`/`thetaPremierMinimum`/`xMinimum`/`xPremierMinimum`,
`besselJ1`, `fft1D`/`fft2D`, `longueurOndeVersRGB/Hex/Css`, `BLANCHE_COULEURS`/`BLANCHE_REF`/
`decomposeYCm`, `largeurFaisceauGaussien`, `FENTE_HAUTEUR_CM`) sont reprises **sans changement**
de `diffraction/` — elles décrivent l'enveloppe/le faisceau d'une seule ouverture, toujours
valables comme composantes du produit ci-dessus.

#### Pipeline FFT — pourquoi le masque ne contient PAS les 2 ouvertures

**Version initiale (abandonnée)** : le masque FFT dessinait directement les 2 ouvertures
(rectangles/disques centrés en x=∓b_m/2), avec une fenêtre `FFT_FENETRE_M = FACTEUR × (b_m +
extent_m)` élargie pour couvrir l'écartement `b` (jusqu'à 1 mm) en plus de la largeur `a` (jusqu'à
20 µm — rapport b/a jusqu'à 50). Deux problèmes constatés à l'usage :

1. **Performance** : pour garder assez d'échantillons dans l'ouverture la plus étroite malgré une
   fenêtre élargie, `FFT_N` avait été porté à 2048 (vs 1024 en diffraction). Une FFT 2D à
   2048×2048 coûte environ 8-9× plus cher qu'à 1024×1024 (coût en N²·log N) — et cette FFT est
   relancée **à chaque frappe de slider** en mode mono (pas de anti-rebond sur ce chemin,
   contrairement au mode lumière blanche). Résultat : lags très importants pendant le glissement
   de n'importe quel slider (constaté par l'utilisateur — "giga lent, lag de fou").
2. **Résolution** : même à ce coût, la fenêtre (≈4×b) ne laissait que ~4-5 échantillons par
   frange dans la grille FFT — crénelage visible sur les franges les plus fines (constaté par
   l'utilisateur — "la résolution ne semble pas suffisante pour l'interfrange").

Ces deux problèmes sont deux facettes du même piège : élargir la fenêtre FFT pour résoudre `b`
dégrade forcément la résolution disponible pour `a` à `FFT_N` fixé (et fixer un `FFT_N` assez
grand pour satisfaire les deux à la fois — de l'ordre de 30 000, calcul détaillé dans la
discussion de conception — est totalement irréaliste en temps réel).

**Solution retenue** : exploiter la factorisation exacte du §Clé physique ci-dessus. Le masque FFT
ne contient plus qu'**une seule ouverture** (centrée en x=0) — `construireChampOuverture(λ,a,D,
shape)` est désormais **identique** à `diffraction/js/sim.js` (même `FFT_N`=1024, même
`FFT_FENETRE_M = FFT_FENETRE_FACTEUR × extent_m`, `FFT_FENETRE_FACTEUR`=25 — cf. son
ARCHITECTURE.md pour le détail du raisonnement, inchangé). Le facteur de frange `cos²(π·b·sinθ/λ)`
est appliqué **au moment de l'échantillonnage**, pas dans le masque : `echantillonnerChampInterference(champ,x,y,b)` = `echantillonnerChamp(champ,x,y) × facteurInterference(...)`.
Comme ce facteur est une simple évaluation de cosinus (aucun coût FFT), cette combinaison n'a
**aucune limite de résolution sur les franges** — elles restent nettes à n'importe quelle valeur de
`b`, tout en gardant le coût FFT (et donc la fluidité) de `diffraction/`. C'est cette fonction,
et non `echantillonnerChamp()` seule, qui doit être utilisée PARTOUT dans `scene.js` où l'intensité
d'interférence réellement affichée est nécessaire (texture d'écran, enveloppe 3D — mono et lumière
blanche).

---

### `js/scene.js` — Scène 3D (Three.js)

**Chargé après sim.js.** Dépend de `THREE` et `THREE.OrbitControls` (vendés). Convention
d'échelle, repère, table/supports, caméras, zoom, doubles flèches de mesure (d/D/L), lumière
blanche/décomposition, DPI : **identiques à `diffraction/`**, cf. son ARCHITECTURE.md pour le
détail — non reproduits ici, seules les différences liées aux 2 ouvertures sont documentées.

#### Lame porte-fente à 2 ouvertures

Contrairement à `diffraction/` (5 formes, dont `fente_h`/`carre`/`fil`), seules 2 formes existent
ici, ce qui simplifie nettement ce module (aucune branche `horizontal`/`balayage2D` complexe à
gérer pour des formes séparables tournées) :

| Forme | Objets visibles | Construction |
|---|---|---|
| `fente` (défaut) | `topBand`/`bottomBand` (cadre haut/bas, ouverture `SLIT_BAND_HEIGHT`) + `wallLeft`/`wallCenter`/`wallRight` (3 bandeaux opaques) | Les 2 fentes ouvertes sont l'espace vide entre `wallLeft`↔`wallCenter` et `wallCenter`↔`wallRight` — `wallCenter` est centré en x=0, largeur `2·max(0, wB-wA)` (wA = demi-largeur RÉELLE de chaque fente, wB = demi-écartement RÉEL, cf. `ecartementVisuel`) ; `wallLeft`/`wallRight` occupent le reste jusqu'aux bords de la lame |
| `cercle` | `slideCercleMesh` uniquement | 2 vrais trous circulaires (rayon = `gap`, PAS `gap/2` — cf. ci-dessous) percés via `THREE.Shape` + 2 trous (`THREE.Path.absarc`, centrés en x=∓`ecartementVisuel(b)/2`), extrudés (`reconstruireSlideCercle(rayon_cm, gap_cm)`) |

**`a`/`b` représentés à l'ÉCHELLE RÉELLE, pas schématique** (revu après un premier essai à
bornes schématiques indépendantes, cf. §Historique ci-dessous) : `largeurFenteVisuelle(a_um)`
et `ecartementVisuel(b_um)` sont désormais de simples conversions µm→cm (`× 1e-4`, cohérentes
avec `BEAM_DIAMETER` — même convention « 1 unité = 1 cm » que tout le reste de la scène), sans
aucun remappage vers une plage cm arbitraire. Motivation : `a` (20–500 µm) et `b` (100–1000 µm)
sont du même ordre de grandeur que le diamètre RÉEL du faisceau (`BEAM_DIAMETER` = 0,1 cm =
1 mm) — un mapping schématique (essayé initialement) rendait l'écartement des 2 ouvertures bien
plus large que le faisceau lui-même, donnant l'impression fausse que le faisceau heurte un mur
plutôt que d'éclairer les 2 ouvertures (constaté par l'utilisateur).

**Conséquence sur `cercle`** : `a_um` est le RAYON du trou (cf. `MASK_SHAPES`), donc
`largeurFenteVisuelle(a_um)` — maintenant une conversion directe — donne déjà le rayon en cm ;
contrairement à l'ancien mapping schématique (qui traitait la valeur comme un « diamètre visuel »
à diviser par 2, un raccourci sans conséquence tant que tout était de toute façon schématique),
`reconstruireSlideCercle` reçoit `gap` directement, sans division.

**Cas dégénéré PHYSIQUE ET VISUEL désormais cohérents** : si `a` réel est réglé grand par rapport
à `b` réel (sliders indépendants — a max=500µm > b min=100µm est un réglage atteignable), les 2
ouvertures se chevauchent **à la fois** dans le masque FFT (`construireChampOuverture`, sim.js —
état physiquement dégénéré mais qui ne casse rien numériquement, le masque reste un OR de deux
régions) **et** dans leur représentation 3D — contrairement à l'ancien mapping schématique, qui
masquait ce chevauchement visuellement (bornes choisies pour ne jamais le laisser apparaître).
`wallCenter` est simplement clampé à une largeur minimale non-nulle dans ce cas, pour ne jamais
passer par une échelle Three.js littéralement nulle/négative — sans prétendre représenter une
largeur négative. Choix assumé, non corrigé par un clamp inter-slider.

#### Pipeline FFT (texture d'écran + enveloppe 3D)

`construireChampOuverture(λ,a,D,shape)` (sim.js) construit le champ d'UNE seule ouverture (coût
identique à `diffraction/`, cf. §Pipeline FFT de sim.js ci-dessus) ; `construireGeometrieEnveloppe()`
et le rendu de texture l'échantillonnent via `echantillonnerChampInterference(champ,x,y,sim.b)`
(sim.js) partout où l'intensité affichée est nécessaire — jamais `echantillonnerChamp()` seule,
qui ne donnerait que l'enveloppe sans les franges. Changements mécaniques par rapport à
`diffraction/` :
- Tous les appels à `construireChampOuverture(...)` (mono, 6 couleurs blanches — enveloppes ET
  cache texture) ont perdu leur argument `b` (redevenus identiques à `diffraction/`).
- Tous les appels à `echantillonnerChamp(champ,x,y)` qui représentaient l'intensité FINALE
  affichée sont devenus `echantillonnerChampInterference(champ,x,y,sim.b)` — dans
  `construireGeometrieEnveloppe()` (silhouette + luminosité de l'enveloppe 3D, balayage2D du
  trou circulaire) et dans le rendu de texture (mono et lumière blanche).
- Toute la logique `fente_h` (rôles x/y échangés) et `carre`/`fil` de `diffraction/` a été retirée
  (formes non reprises ici, cf. §Périmètre physique) — `balayage2D` (échantillonnage 2D réel du
  champ FFT, par opposition à la factorisation `hauteur(x) = wMax × facteur(x)`) ne concerne plus
  que `'cercle'`.
- `RATIO_X2_SUR_X1` réduit à `{ fente: 2, cercle: 2.233/1.22 }`.

Les rayons pointillés (bouton « Tracer l'angle de diffraction ») et le plancher d'opacité du
shader (`appliquerXLimiteUniforms`) pointent toujours vers le **1er zéro de l'ENVELOPPE**
(dépend de `a` seul, via `xPremierMinimum` inchangée) — pas vers une frange d'interférence. Ça
reste pertinent : ça délimite le lobe central de l'enveloppe qui module les franges, visible en
3D comme au 1er zéro d'une diffraction simple.

**Résolution des franges en 3D** : `ENVELOPPE_N_TRANCHES` (résolution en x de l'enveloppe 3D)
porté à **400** (vs 240 en diffraction) et largeur de `screenTexCanvas` portée à **1024** (vs
512) — augmentations bon marché puisque chaque échantillon supplémentaire ne coûte qu'une
lecture FFT (déjà calculée) + un `cos()` via `echantillonnerChampInterference`, sans relancer de
FFT. À affiner encore si nécessaire (cf. §Points de calibration).

---

### `js/graph.js` — Graphe I(x) interactif

**Chargé après scene.js.** Repris de `diffraction/` avec 3 changements :

- `N_ECHANTILLONS` porté à **6000** (vs 1200) : les franges (période ~λD/b) sont beaucoup plus
  fines que l'enveloppe de diffraction seule — à affiner visuellement si encore insuffisant à
  b maximal sur la largeur complète de l'écran (cf. §Points de calibration).
- `dessinerInfoMultiCourbes()` (survol/épingles en lumière blanche) lit désormais
  `intensiteInterference(x,λ,a,b,D)` au lieu de `intensiteOuverture(...)` — sinon les valeurs
  affichées auraient été celles de l'enveloppe seule, pas de la figure réellement tracée.
- `limiterAuDeuxiemeMinimum` renommée `limiterExtremaCentraux` et généralisée : au lieu de
  couper au "2e minimum de l'enveloppe" (notion diffraction pure, ~2-3 extrema en tout), coupe à
  `LIEN_MINIMA_MAX_PAR_COTE` (8) franges de chaque côté du centre — le nombre de franges dans une
  fenêtre donnée dépend fortement de b/a, une notion de "2e minimum" n'a plus de sens fixe.

`syncGraphLienDisponibilite()`/`toggleGraphLien()` : condition simplifiée (plus de cas
`fente_h` à exclure, cf. formes retirées). Le reste (survol, épinglage, extrema, « Lien
figure », mode Lumière blanche) est inchangé.

---

### `js/ui.js` — Contrôles et boucle d'animation

**Chargé en dernier.** Repris de `diffraction/` avec :

- `updateParam()` : nouveau cas `'b'` — le slider HTML est en **mm** (0,10–1,00, précision utile
  à ce réglage), converti en µm dans `sim.b` (`×1000`) pour rester cohérent avec `sim.a` dans les
  formules physiques ; le label affiché reste en mm.
- `THETA_LABEL_FORMULE` réduit à `{ fente, cercle }`.
- `updateReadouts()`/`updateReadoutsBlanche()` : ajoutent l'encart **Interfrange**
  (`interfrangeI(λ,b,D)`, en mm) en plus des encarts angle/largeur hérités (qui décrivent
  l'enveloppe de diffraction, dépendent de `a` seul) — mono : valeur unique ; lumière blanche :
  une ligne par couleur de référence, même pattern que les 2 autres encarts.
- `resetSim()` : ajoute la remise à zéro du slider `b`.
- `setMainTab(tab)` généralisée à **3 onglets** (`MAIN_TABS = ['principe','surfaces',
  'lumineuses']`, parcourus en boucle) plutôt que les 2 branches hardcodées de `diffraction/` —
  chaque onglet suit la convention d'ID `tab-{t}`/`section-{t}`/`panel-hint-{t}`/`{t}-area`,
  aucun cas particulier par onglet.
- `init()` : lit le hash parmi les 3 valeurs de `MAIN_TABS` (défaut `'lumineuses'`).

Le reste (`appliquerBorneD`, `setLightSource`, `toggleRays/Lengths`, `cycleBeamMode`,
`toggleGraphIntensite/ValeursExp`, `setView`, splitter draggable, `resize`, `loop`) : inchangé.

---

## Ordre de chargement et dépendances

```
index.html
  └── ../libs/three.min.js       expose : THREE (global)
  └── ../libs/OrbitControls.js   expose : THREE.OrbitControls
  └── js/sim.js       expose : sim, A_MIN/MAX, B_MIN/MAX, MASK_SHAPES, PETIT_D_MIN/MAX_M,
  │                             BANC_LONGUEUR_M, dMaxPourPetitD, FAISCEAU_DIAMETRE_MM,
  │                             thetaMinimum/thetaPremierMinimum, xMinimum/xPremierMinimum,
  │                             intensiteSinc, besselJ1, intensiteAiry, intensiteOuverture,
  │                             facteurInterference, intensiteInterference, interfrangeI,
  │                             largeurFaisceauGaussien, echantillonnerIntensite,
  │                             FENTE_HAUTEUR_CM, FFT_N, FFT_FENETRE_FACTEUR, fft1D, fft2D,
  │                             construireChampOuverture, echantillonnerChamp,
  │                             echantillonnerChampInterference,
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
                       expose : updateParam, updateMaskShape, appliquerBorneD, setLightSource,
                                 toggleRays, toggleLengths, cycleBeamMode, toggleGraphIntensite,
                                 toggleValeursExp, setView, setMainTab, updateReadouts, resetSim,
                                 toggleHint, resize, init
                       démarre : init() → requestAnimationFrame(loop)
```

> Tous les fichiers utilisent le scope global (pas de modules ES). L'ordre de chargement est critique.

---

## Points de calibration (empiriques, à valider au navigateur)

Contrairement au reste de ce document (comportement voulu), les valeurs suivantes sont des
**points de départ raisonnés mais pas définitivement validés visuellement** à la rédaction de ce
fichier — à ajuster si un artefact (lag, franges encore hachées) est constaté en testant les
réglages extrêmes (D minimal + b maximal pour la frange la plus fine, glissement rapide de
n'importe quel slider pour la fluidité) :

1. `ENVELOPPE_N_TRANCHES` (400), largeur de `screenTexCanvas` (1024), `js/scene.js` — résolution
   des franges en 3D. Peuvent être augmentées encore si besoin (coût faible désormais, cf.
   §Pipeline FFT) — mais chaque pixel/tranche coûte quand même un `cos()`, donc pas totalement
   gratuit pendant un glissement de slider (le rendu texture/enveloppe reste synchrone, non
   anti-rebond, sur le chemin mono).
2. `N_ECHANTILLONS` (6000), `js/graph.js` — densité du graphe I(x). Cheap (pas de FFT), tourne à
   chaque frame — éviter de le pousser inutilement haut si le graphe est affiché en continu.
3. `largeurFenteVisuelle`/`ecartementVisuel` (échelle réelle, `ECHELLE_REELLE_UM_VERS_CM`),
   `js/scene.js` — à l'échelle réelle, les 2 ouvertures occupent une zone minuscule (quelques
   centièmes de cm, cf. §Lame porte-fente à 2 ouvertures) au centre d'une lame de 7 cm : peut
   nécessiter un zoom important (vue 3D, molette) pour bien distinguer les 2 fentes/trous à `a`
   réglé bas — à valider si ça reste lisible en pratique, sinon reconsidérer le cadrage caméra
   par défaut plutôt que de ré-exagérer l'échelle (qui recréerait le problème résolu, cf.
   §Historique).

**Historique** :
- Une première version mettait les 2 ouvertures directement dans le masque FFT (`FFT_N`=2048,
  `FFT_FENETRE_FACTEUR`=4) — abandonnée pour lenteur ET résolution insuffisante, cf. §Pipeline
  FFT de `js/sim.js` pour le diagnostic complet et la solution retenue
  (`echantillonnerChampInterference`, FFT à une seule ouverture identique à `diffraction/`).
- Une deuxième version gardait `largeurFenteVisuelle`/`ecartementVisuel` schématiques (bornes cm
  indépendantes choisies pour rester lisibles, comme en diffraction) — abandonnée car
  l'écartement affiché (jusqu'à 2,6 cm) devenait bien plus large que le faisceau réel (0,1 cm),
  donnant l'impression que le faisceau heurtait un mur opaque plutôt que d'éclairer 2 ouvertures
  (constaté par l'utilisateur). Remplacée par l'échelle réelle documentée ci-dessus.

---

## Écarts connus par rapport à CONTEXTE_PROJET.md

- Aucune fonctionnalité de détection téléphone/orientation (pas d'overlay de rotation, pas de
  media query dédiée) : choix assumé pour cette page, comme `diffraction/`.
- Onglets « Principe » (`#section-principe`, `#principe-area`) et « Ondes de surface »
  (`#section-surfaces`, `#surfaces-area`) : placeholders non implémentés (icône + texte
  « Simulation à venir »), déjà présents dans le HTML/CSS/`ui.js` → `setMainTab()` pour préparer
  de futures simulations dans cette même page — n'affectent pas l'onglet « Ondes lumineuses »
  documenté ci-dessus.
- Formes d'ouverture limitées à fente verticale et trou circulaire (pas de fente horizontale,
  trou carré ou fil, contrairement à `diffraction/`) — limitation assumée, cf. §Périmètre
  physique.
