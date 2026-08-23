# Architecture — Simulation Interférences (ondes de surface + fentes/trous d'Young en 3D)

## Arborescence

```
interferences/
├── index.html
├── ARCHITECTURE.md      ← ce fichier
├── css/
│   └── style.css
└── js/
    ├── sim.js       ← état + physique de l'onglet "Ondes lumineuses"
    ├── scene.js     ← scène 3D (Three.js)
    ├── graph.js     ← graphe I(x) de l'onglet "Ondes lumineuses"
    ├── surfaces.js  ← onglet "Ondes de surface" (état, rendu et graphes propres)
    ├── principe.js  ← onglet "Principe" (état, physique et rendu propres — mode 1D)
    └── ui.js
```

> `surfaces.js` et `principe.js` sont **autonomes** : chacun porte son propre état (`simSurf`,
> `simPrin`) et son propre rendu canvas 2D (plus ses propres graphes pour `surfaces.js`), et ne
> partage ni `sim` ni `gview` avec l'onglet "Ondes lumineuses". `principe.js` n'emprunte au reste
> de la page que l'utilitaire `formatFr()` (`scene.js`). Les trois onglets ne communiquent que
> par `setMainTab()` (`ui.js`).

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

`index.html` expose **3 onglets principaux** (`setMainTab`, `ui.js`), dans cet ordre :

| Onglet | `#hash` | État | Contenu |
|---|---|---|---|
| **Principe** | `#principe` | **Implémenté** (`js/principe.js`) en **mode 1D** ; mode 2D en placeholder | Deux haut-parleurs face à face sur un axe, et un micro déplaçable entre eux — cf. §`js/principe.js` |
| **Ondes de surface** | `#surfaces` | **Implémenté** (`js/surfaces.js`) | Interférences de 2 sources ponctuelles synchrones dans une cuve à ondes — cf. §`js/surfaces.js` |
| **Ondes lumineuses** | `#lumineuses` | **Implémenté** (`js/sim.js` + `scene.js` + `graph.js`), **actif par défaut** | Interférences d'Young modélisées en 3D — le reste de ce document |

Le périmètre physique décrit ci-dessus (Fraunhofer, FFT, `a`/`b` en µm) est celui de l'onglet
**Ondes lumineuses** uniquement ; l'onglet **Ondes de surface** a sa propre physique (ondes
cylindriques 2D, λ et écartement en cm), documentée dans sa propre section.

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

**Chargé après scene.js.** Repris de `diffraction/` avec 5 changements :

- `N_ECHANTILLONS` porté à **6000** (vs 1200) : les franges (période ~λD/b) sont beaucoup plus
  fines que l'enveloppe de diffraction seule — à affiner visuellement si encore insuffisant à
  b maximal sur la largeur complète de l'écran (cf. §Points de calibration).
- **Cache des points échantillonnés** (`cachedPtsMono`/`cachedPtsCouleurs`,
  `invaliderCourbe()`/`assurerCourbeCalculee()`) : `echantillonnerIntensite()` (coûteuse — sinc/
  Airy × cos² par point, cf. §Clé physique de sim.js) n'est rappelée QUE quand la courbe change
  réellement (paramètre λ/a/b/D, forme, mode lumineux, couleur cochée/décochée, ou fenêtre
  visible/zoom — cf. `invaliderCourbe()` appelée depuis `ui.js` → `updateParam`/
  `updateMaskShape`/`resetSim` et depuis `graph.js` → `syncGraphModeBlanche`/la case à cocher
  légende/`syncGraphPixelParfait` au zoom), jamais au survol/épinglage (qui ne font qu'une
  RECHERCHE dans le cache via `pointLePlusProche`, aucune trigonométrie). `updateParam`
  invalide dans TOUS les cas, y compris pour `d` : `d` seul n'entre pour rien dans
  `intensiteInterference`, mais `appliquerBorneD()` (appelée pour tout changement de `d`) peut
  en cascade capper `sim.D` (banc trop court) — invalider uniquement si le nom du paramètre
  n'est pas `d` aurait raté ce cas.
- **`drawIntensityGraph()` n'est plus appelée en continu depuis `ui.js` → `loop()`** : chaque
  déclencheur qui affecte réellement le graphe l'appelle désormais explicitement (à la suite de
  `invaliderCourbe()`, cf. les mêmes points d'appel ci-dessus, + les écouteurs souris
  `mousemove`/`mouseleave`/`mousedown` de `initGraphInteractions`, + `resizeGraphCanvas`, déjà
  explicites). Avant ce changement, `N_ECHANTILLONS` bien plus élevé qu'en diffraction (+ le
  facteur d'interférence, un `cos()` de plus par point) rendait un redessin systématique à 60
  fps — y compris au repos, sans survol ni interaction — nettement plus coûteux qu'en
  diffraction (constaté par l'utilisateur, surtout en lumière blanche où le coût est multiplié
  par le nombre de couleurs cochées). `dessinerLienFigure()`, elle, reste appelée à chaque frame
  (cf. sa docstring — position des 2 canvas à surveiller en continu, pas seulement les données) ;
  elle lit désormais aussi le cache (`assurerCourbeCalculee()` + `cachedPtsMono`), donc son coût
  résiduel par frame est celui, faible, de `calculerExtrema`/du tracé des pointillés — plus de
  rééchantillonnage caché dedans.
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

### `js/surfaces.js` — Onglet « Ondes de surface »

**Chargé après `graph.js`, avant `ui.js`.** Adapté de `diffraction/js/surfaces.js` (même principe
de vue de dessus d'un bassin, mêmes conventions de drag), mais avec **2 sources ponctuelles
réelles** au lieu d'une somme de Huygens sur une ouverture.

#### Physique et rendu du champ

- Chaque source émet une onde circulaire ; le champ affiché est leur **superposition**. On écrit
  `champ(x,y,t) = P(x,y)·cos(ωt) + Q(x,y)·sin(ωt)`, avec `P`/`Q` **indépendants du temps** :
  ils sont précalculés une fois par géométrie (`_rebuildSurfFieldCache`) sur une grille basse
  résolution, ensuite agrandie par `drawImage`. Le coût par frame se réduit donc à 2 sources
  × 1 addition par cellule.
- Chaque source ponctuelle utilise le **même modèle asymptotique d'onde cylindrique 2D** que les
  sources de Huygens de `diffraction/` (facteur `(1−i)/√(2λ)`, `_surfPointSourcePQ`) — le Green
  du problème 2D, pas un simple `sin(kr−ωt)/√r`, pour rester cohérent avec le reste du site.
- Grille de calcul bornée en dur (`SURF_GRID_W_MAX` 380 × `SURF_GRID_H_MAX` 250,
  `SURF_GRID_CELLS_PER_LAMBDA` = 5) : le coût du rebuild et du dessin par frame est proportionnel
  à largeur × hauteur de grille. Les rebuilds sont regroupés par `_scheduleSurfRebuild()`
  (au plus un par frame, même principe que `resize()`/`resizeScheduled`).
- **Célérité fixe** `SURF_C_CM = 9,6 cm/s` ; largeur visible du bassin `SURF_VIEW_WIDTH_CM = 45 cm`
  (calibre `pxPerCm` au resize).

#### Causalité des sources activables

`s1Enabled`/`s2Enabled` donnent l'état courant des cases à cocher, mais `s1Toggles`/`s2Toggles`
gardent **l'historique** des bascules `{t, enabled}`. `_surfSourceContrib` évalue l'état de la
source au **temps retardé** `t − r/c`, pas à l'instant présent : une onde déjà émise avant une
coupure continue de se propager (elle n'est pas effacée d'un coup), et une source rallumée ne
fait pas réapparaître tout le bassin — seul un nouveau front part de l'instant de rallumage.

#### État (`simSurf`)

| Groupe | Champs |
|---|---|
| Animation | `paused`, `simTime`, `speedFactor` (`SURF_SPEED_STEPS` = ×0,10 / 0,25 / 0,50 / 1,00) |
| Paramètres | `lambda` (cm, 1–10), `b` (écartement des sources, cm, 1–30) |
| Sources | `s1Enabled`/`s2Enabled`, `s1Toggles`/`s2Toggles` (cf. ci-dessus) |
| Géométrie | `canvasW/H`, `pxPerCm`, `zoom` (`SURF_ZOOM_MIN`→`MAX`, slider à 3 crans), `originX/Y`, `s1`, `s2` |
| Point de mesure M | `point {x, y, cmX, cmY}` + `dragging` — position **physique en cm**, donc invariante au zoom |
| Axes de coupe | `cut` (vertical, graphe Amplitude(y)) et `cutH` (horizontal, graphe Amplitude(x)), tous deux draggables |
| Vue | `viewMode` `'top'` \| `'plongeante'`, `tiltDeg` (10–75°, défaut 45°) |
| Options d'affichage | `interfMode` (`none`/`constructive`/`destructive`/`both`), `distMode` (`none`/`cm`/`lambda`), `showValeurs` (S₁M, S₂M, δ) |
| Graphes | `showGraph`, `graphMode` `'single'` \| `'dual'`, `graphTab1`/`graphTab2`, `ptData`, `ptTimeOrigin` |

#### Vues et options

- **Vue de dessus** (défaut) : champ colorié entre `SURF_COL_TROUGH` et `SURF_COL_CREST`.
- **Vue plongeante** (`_render3DSurfView`) : la surface est projetée en 3D avec un angle
  d'inclinaison réglable ; les éléments 2D (sources, point M, axes de coupe, zones
  d'interférences) sont projetés dans le même repère (`_surf3DProjectPoint` / `_surf3DInvertY`).
- **Zones d'interférences** (`_drawSurfInterfZones`) : trame de points sur les lieux d'interférence
  constructive (jaune `#ffe14d`) et/ou destructive (violet `#8a3fd6`) — hyperboles tracées
  analytiquement (médiatrice + branches), pas par seuillage du champ.
- **Distances** `S₁M`/`S₂M` (`_drawSurfDistances`) affichées en cm **ou en nombre de λ**, avec la
  différence de marche δ ; couleurs dédiées par source (`#e07020` / `#e0397a`).

#### Graphes (`SURF_GRAPH_TABS`)

Trois graphes au choix, affichables **seul ou par deux** (`graphMode`, `toggleSurfDualGraph`) :

| Clé | Titre | Contenu |
|---|---|---|
| `amp-t` | Hauteur(t) | Hauteur de l'eau au point M en fonction du temps (fenêtre `SURF_GRAPH_WINDOW` = 5 s) |
| `amp-y` | Amplitude(y) | Amplitude le long de l'axe de coupe vertical (`cut`) |
| `amp-x` | Amplitude(x) | Amplitude le long de l'axe de coupe horizontal (`cutH`) |

Échantillonnage adaptatif (`SURF_GRAPH_SAMPLES_PER_LAMBDA` = 8, plafonné à
`SURF_GRAPH_SAMPLES_MAX` = 6000) : le nombre de points suit λ et l'étendue affichée.

### `js/principe.js` — Onglet « Principe »

**Chargé après `surfaces.js`, avant `ui.js`.** Autonome : état `simPrin`, rendu canvas 2D propre,
aucune dépendance au reste de la page hormis `formatFr()` (`scene.js`).

#### Mise en situation (mode 1D)

Deux haut-parleurs **S₁** (gauche) et **S₂** (droite) se font face sur un même axe horizontal et
émettent l'un vers l'autre le même signal sinusoïdal ; un micro **M**, placé entre les deux, reçoit
la somme. Les trois éléments se déplacent le long de l'axe au glisser-déposer.

La zone centrale est un **seul canvas** découpé en trois lignes de même échelle horizontale :

| Ligne | Hauteur | Contenu |
|---|---|---|
| 1 | 1 unité | `S₁` seule → y₁(x, t) |
| 2 | 1 unité | `S₂` seule → y₂(x, t) |
| 3 | 2 unités | `S₁`, `S₂` et `M` → y₁ + y₂ |

La ligne 3 reçoit **le double** de hauteur précisément parce que la somme peut atteindre
A₁ + A₂ = 2 : l'échelle verticale (`simPrin.ampPx`, px par unité d'amplitude) reste ainsi
**identique et fixe** sur les trois lignes — pas d'auto-échelle, donc un doublement d'amplitude
se voit vraiment. Ce point n'est plus implicite : une **échelle verticale** est graduée dans la
gouttière gauche de chaque bande (±1 sur les lignes 1-2, ±2 sur la ligne 3, `_prinDrawEchelleY`) —
sans elle, rien ne disait à l'élève que les bandes ne sont pas auto-normalisées.

Un **guide vertical pointillé** à l'abscisse de M traverse les trois lignes, avec un point de
lecture sur chaque courbe : y₁(M), y₂(M) et leur somme se lisent sur la même verticale (et,
quand « Afficher les valeurs » est actif, chaque point porte sa valeur chiffrée). Les trois guides
(S₁ sur les bandes 1→3, S₂ sur 2→3, M sur 1→3) sont tracés **d'une seule pièce** via `_prinSpan()`,
avant la boucle de rendu des bandes : tracés bande par bande, leurs pointillés étaient tronqués à
chaque gouttière.

Sous la ligne 3 viennent, **dans cet ordre** : les valeurs chiffrées de l'axe, collées au bas de la
bande — elles graduent son axe, elles lui restent attachées — puis un **couloir de cotes**
(`simPrin.coteYs`) qui accueille les doubles flèches λ/2, S₁M et S₂M. Ces cotes étaient auparavant
tracées *dans* la bande, à `y0 + half·0,82` — c'est-à-dire exactement sur l'amplitude 2, donc dans
la courbe dès que A₁ + A₂ approchait son maximum.

Ses `PRIN_N_COTES` = 3 lignes sont réservées **en permanence**, à slots fixes (0 = λ/2, 1 = S₁M,
2 = S₂M) : une cote masquée laisse sa ligne vide. Un couloir dimensionné sur les options actives
faisait se comprimer et se translater toute la scène à chaque bascule de « Coter S₁M et S₂M » ou
« Repérer les interférences » — le repère visuel de l'élève sautait à chaque clic. Aucune option
d'affichage ne touche donc plus à la mise en page.

#### Physique

Célérité fixe `PRIN_C` = 340 m/s (son dans l'air), ω = 2π·c/λ :

```
y₁(x,t) = A₁·sin(ω·(t − (x−x₁)/c))   pour x ≥ x₁ et t ≥ (x−x₁)/c,   0 sinon
y₂(x,t) = A₂·sin(ω·(t − (x₂−x)/c))   pour x ≤ x₂ et t ≥ (x₂−x)/c,   0 sinon
```

La condition `t ≥ d/c` est le **front d'onde** : après RAZ tout est plat, « ▶ Lancer » fait partir
les deux fronts, qui se croisent et installent progressivement la zone de recouvrement.
*Approximation assumée* : déplacer une source pendant l'animation re-cale son front sur la
nouvelle position (pas d'historique causal à la `_surfSourceContrib` de `surfaces.js` — inutile
ici, une seule position par source).

Là où les deux fronts sont passés, avec d₁ = x−x₁, d₂ = x₂−x et δ = d₂ − d₁ :

```
A(x) = √(A₁² + A₂² + 2·A₁·A₂·cos(2π·δ/λ))        (_prinEnveloppe)
```

C'est une **onde stationnaire** : nœuds et ventres sont FIXES, espacés de λ/2. Comme d₁ + d₂ =
x₂ − x₁ est constant, δ(x) = x₁ + x₂ − 2x varie **linéairement** — les positions remarquables
s'écrivent donc en clair, sans balayage numérique (`_prinPositionsRemarquables()`, source unique
pour le fond coloré, les marqueurs V/N, la cote λ/2 et l'aimantation du glisser-déposer) :

```
constructif   x = (x₁ + x₂ − k·λ)/2
destructif    x = (x₁ + x₂ − (k+½)·λ)/2
```

#### Ralenti

À λ = 0,60 m, T = λ/c ≈ 1,8 ms : inobservable en temps réel. `simTime` avance de
`dtRéel · speedFactor / PRIN_RALENTI` avec `PRIN_RALENTI` = 340, soit une célérité **apparente**
de 1 m/s — le front traverse les 4 m de l'axe en 4 s au facteur de vitesse ×1,00. Le curseur
« Vitesse » garde les crans habituels du site (`[0.10, 0.25, 0.50, 1.00]`).

#### Réglages et bornes

| Grandeur | Bornes | Défaut |
|---|---|---|
| λ | 0,20 → 1,50 m (pas 0,01) | 0,60 m |
| A₁, A₂ | 0 → 1,00 u.a. (pas 0,05) | 0,80 |
| x₁, x_M, x₂ | axe de `PRIN_VIEW_WIDTH_M` = 4,00 m (`PRIN_BORD_M` = 0 : sources jusqu'aux bords) | 0,00 / 2,00 / 4,00 m |

Le glisser-déposer impose l'ordre **S₁ < M < S₂** avec une marge `PRIN_MARGE_M` = 0,10 m, sans
« poussée » : chaque élément est simplement borné par ses voisins (`_prinSetDragPos`).

Trois **curseurs de position** (section « Positions » du panneau) doublent le geste à la souris :
un énoncé du type « placez M à 1,80 m » ne se traite pas au glissement, et au vidéoprojecteur le
curseur est plus sûr. Les deux voies restent synchronisées — `_prinUpdateValeurs()` appelle
`_prinSyncPosSliders()`, donc tout déplacement du canvas remonte dans les curseurs.

#### Options d'affichage (toutes OFF au départ)

| Bouton | Effet |
|---|---|
| Afficher l'enveloppe | ±A(x) en pointillés sur la ligne 3 — rend les nœuds/ventres visibles comme positions fixes |
| Repérer les interférences | **bandes translucides** de fond (ocre / violet) aux positions remarquables + marqueurs **V** (ventre) / **N** (nœud) sur l'axe + cote λ/2 dans le couloir + légende. Les anciens traits verticaux concurrençaient les guides de S₁/S₂/M ; en bandes, ils passent au fond. V et N sont les mots du programme |
| Coter S₁M et S₂M | doubles flèches cotées dans le couloir sous la ligne 3, couleurs de S₁/S₂ |
| Afficher les valeurs | encarts du panneau (S₁M, S₂M, δ = \|S₁M − S₂M\|, δ/λ, conclusion) **et** valeur chiffrée à chaque point de lecture du micro sur le canvas |

La conclusion constructive / destructive / intermédiaire (tolérance `PRIN_TOL_RATIO` = 0,03 sur
δ/λ) est calculée par **`_prinNature()`**, seule source de vérité, partagée par l'encart du
panneau et par le **badge « δ = … · constructive »** dessiné en permanence sous le micro. Ce badge
est le résultat même de la simulation : il était auparavant invisible tant que l'encart
« Valeurs » restait replié.

#### Conventions de rendu

- Fond **`#fdf8f0`** (fond « simulation » de la charte) et non le `#14181d` des deux autres
  onglets : celui-ci trace des courbes sur des axes, pas un champ. Chaque ligne est posée sur une
  **bande** à coins arrondis (`PRIN_COL_BAND`, filet `PRIN_COL_BAND_BD`) parcourue d'une **grille
  verticale** tous les 0,5 m : on lit trois panneaux au lieu d'un aplat continu, et une abscisse
  se repère sur les trois lignes d'un coup d'œil. La grille a **deux niveaux** — mètre entier
  (`PRIN_COL_GRILLE_MAJ`, 1,3 px) nettement plus marqué que le demi-mètre (`PRIN_COL_GRILLE`) —
  un ton unique trop pâle ne donnait aucun repère chiffrable. Une **gouttière**
  (`gap` = `max(8, fs·1,15)`, deux intervalles pour trois bandes) sépare les panneaux, qui étaient
  jointifs et se lisaient donc comme un seul bloc.
- **Graduations** dessinées sur les trois axes, de part et d'autre de la ligne (7 px au mètre,
  4 px au demi-mètre) et dans un ton `PRIN_COL_TICK` franchement plus foncé que l'axe lui-même :
  au ton de l'axe, elles s'y noyaient, et n'exister que sur la bande du bas laissait les deux
  autres sans repère chiffrable. Même ton pour l'échelle verticale, les valeurs chiffrées et
  « x (m) ».
- **Hiérarchie de taille des pictogrammes** : le haut-parleur est plus grand que le micro
  (`s.srcH = 1,35 · s.micH`, calculés dans `_prinLayout`). L'ancien code faisait l'inverse — le
  micro valait le double d'une source.
- Le **micro est un micro de mesure debout, nettement décalé sous l'axe** (socle, pied fin, corps
  cylindrique, tête grillagée). Le décalage est délibéré : collé à l'axe, le pictogramme se mêle au
  tracé de la superposition, la courbe la plus ample de la scène — c'est le guide vertical
  pointillé à l'abscisse de M qui fait le lien avec l'axe, pas un contact physique.
  `PRIN_MIC_BAS_RATIO` donne la hauteur totale rapportée à `micH` : c'est elle qui cale le libellé
  « M » puis le badge δ dessous (badge rabattu dans la bande si la fenêtre est trop basse).
- **Couleur des pictogrammes** : même doctrine pour le micro que pour les haut-parleurs — corps en
  gris métallique (l'objet), couleur d'identité réservée au seul organe actif : le pavillon pour
  une source, la tête grillagée pour le micro. Un micro entièrement bleu lisait comme un symbole,
  pas comme un instrument.
- **Titres de ligne en pastille** (`_prinDrawTitre`) plutôt qu'en texte haloé posé dans le coin du
  tracé ; escamotés quand la bande devient trop basse.
- Les **haut-parleurs sont animés** : membrane qui respire et arcs qui s'éloignent, en phase avec
  ω·t. Ils étaient figés même en pleine animation.
- Une **horloge** en haut à droite affiche `t`, `T = λ/c` et `f` : le ralenti × `PRIN_RALENTI`
  rend sinon le temps physique impossible à estimer.
- Positions stockées en **mètres**, jamais en pixels — le resize les reprojette, rien ne dérive.
- Tous les libellés passent par `_prinText()`, qui les cerne d'un halo couleur fond : ils se
  superposent forcément aux courbes. Le paramètre optionnel `halo` sert aux textes posés **sur une
  bande**, dont le fond n'est plus `PRIN_COL_BG`. Corollaire : `_prinText()` écrase `strokeStyle`, on ne
  l'appelle donc jamais au milieu d'un tracé (cf. `_prinDrawAxe`, qui trace axe + graduations en
  un seul `stroke()` avant d'écrire quoi que ce soit).
- Glisser-déposer en **Pointer Events + `setPointerCapture`** (souris et tactile d'un seul jeu
  d'écouteurs, cf. `pression/js/ui.js`), hit-test tolérant à `_prinGrabTol()` =
  `max(22, canvasW/45)` px — les 16 px fixes d'origine étaient sous la cible tactile recommandée.
  Quatre points d'ergonomie s'y ajoutent :
  - l'**écart de saisie** est mémorisé (`simPrin.dragOff`) au `pointerdown` au lieu de recentrer
    l'élément sous le pointeur : un clic 10 px à côté ne le téléporte plus ;
  - **retour visuel par le guide** : celui de l'élément survolé ou déplacé passe en trait plein
    appuyé (`_prinDrawGuide(..., actif)`) — seul le curseur CSS changeait, donc rien en tactile.
    Pas de halo autour du pictogramme : il empâtait l'objet au lieu de le désigner ;
  - **aimantation** du micro sur les positions remarquables à `PRIN_SNAP_PX` = 5 px (Alt la
    désactive). Seul M s'aimante : déplacer une source déplacerait aussi les cibles, l'aimant y
    serait un piège ;
  - **clavier** : le canvas est focusable (`tabindex="0"`), ← → déplacent l'élément sélectionné de
    1 cm (10 cm avec Maj), 1/2/3 choisissent S₁, M ou S₂. Aucune aimantation au clavier — le pas
    y est déjà exact.
- `drawPrincipe()` est appelée **à chaque frame, même en pause** : sinon un redimensionnement ou
  un glissement de source pendant la pause laisserait une image obsolète.

#### RAZ et « Par défaut »

- **RAZ** (section Contrôles) : `simTime = 0`, retour en pause (bouton → « ▶ Lancer ») et
  positions de S₁/M/S₂ par défaut. `_prinLastFrameT = null` au passage, sinon le premier `dt`
  après le reset vaudrait tout le temps écoulé depuis la dernière frame.
- **Par défaut** (section Paramètres) : remet λ, A₁, A₂ — des réglages, pas un état d'animation.

#### Mode 2D

Le sélecteur `.seg-toggle` du panneau expose déjà **1D / 2D** ; le mode 2D est un **placeholder**
(`#prin-2d-placeholder`). `setPrincipeMode()` masque la zone de tracé et les blocs de réglages
propres au 1D (`#prin-1d-blocks`) sans toucher à l'état de l'animation, et `tickPrincipe()` sort
immédiatement — le temps ne doit pas avancer dans le dos de l'élève.

---

### `js/ui.js` — Contrôles et boucle d'animation

**Chargé en dernier.** Repris de `diffraction/` avec :

- **`scheduleSceneUpdate()`/`sceneUpdateScheduled`** : regroupe `updateSceneParams()` (texture
  d'écran + enveloppe 3D — la reconstruction la plus coûteuse) + `updateReadouts()` +
  `drawIntensityGraph()` en un seul rebuild PAR FRAME RÉELLEMENT RENDUE, même principe que
  `resize()`/`resizeScheduled` plus bas (drapeau + `requestAnimationFrame`). Nécessaire ici :
  l'évènement `oninput` d'un `<input type=range>` peut se déclencher plus vite que l'affichage
  pendant un glissement rapide — sans ce regroupement, chaque frappe relançait sa propre
  reconstruction complète alors que seul le DERNIER état compte visuellement. `updateParam()`
  affecte `sim.a`/`sim.b`/etc. de façon SYNCHRONE (avant d'appeler `scheduleSceneUpdate()`),
  donc le rebuild différé lit toujours l'état le plus récent au moment où il s'exécute —
  aucune valeur intermédiaire n'est perdue, seule sa reconstruction visuelle est coalescée.
  `updateMaskShape()` (un `<select>`, pas de glissement continu) et `resetSim()` (action
  ponctuelle) appellent, eux, `updateSceneParams()`/`updateReadouts()`/`drawIntensityGraph()`
  directement, sans passer par ce regroupement — inutile pour des déclenchements isolés.
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
  aucun cas particulier par onglet. Elle termine par un `resize()` **inconditionnel** : les trois
  zones portent désormais un canvas, et aucune n'a de dimensions exploitables tant qu'elle est
  `display:none`.
- `init()` : lit le hash parmi les 3 valeurs de `MAIN_TABS` (défaut `'lumineuses'`), puis appelle
  `initScene()`, `initSurfaces()` et `initPrincipe()`.
- `resize()` appelle `resizeScene()` + `resizeGraphCanvas()` + `resizeSurfaces()` +
  `resizePrincipe()` ; `loop()` appelle `tickSurfaces()` et `tickPrincipe()`, chacun uniquement si
  sa zone est visible.

Le reste (`appliquerBorneD`, `setLightSource`, `toggleRays/Lengths`, `cycleBeamMode`,
`toggleGraphIntensite/ValeursExp`, `setView`, splitter draggable) : inchangé.

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
  └── js/surfaces.js  dépend de : rien d'autre (état `simSurf` autonome ; chargé après scene.js/
  │                               graph.js par simple convention d'ordre, pas par dépendance)
  │                   expose : simSurf, SURF_GRAPH_TABS, initSurfaces, resizeSurfaces,
  │                             tickSurfaces, drawSurfaces, drawSurfGraph, resizeSurfGraphCanvas,
  │                             togglePauseSurfaces, onSliderSpeedSurf, onSliderZoomSurf,
  │                             onSliderTiltSurf, onSliderLambdaSurf, onSliderBSurf,
  │                             setSurfViewMode, toggleSurfSource, toggleSurfInterfMode,
  │                             toggleSurfDistMode, toggleSurfValeurs, toggleGraphSurf,
  │                             toggleSurfDualGraph, resetSurfaces
  │
  └── js/principe.js  dépend de : formatFr (js/scene.js) ; état `simPrin` autonome pour tout le reste
  │                   expose : simPrin, initPrincipe, resizePrincipe, tickPrincipe, drawPrincipe,
  │                             setPrincipeMode, togglePausePrincipe, resetPrincipe,
  │                             onSliderSpeedPrin, onSliderLambdaPrin, onSliderA1Prin,
  │                             onSliderX1Prin, onSliderXMPrin, onSliderX2Prin,
  │                             onSliderA2Prin, resetParamsPrincipe, togglePrinEnveloppe,
  │                             togglePrinReperes, togglePrinCotes, togglePrinValeurs
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
- Onglet « Principe » : le **mode 1D est implémenté** (`js/principe.js`) ; le **mode 2D** du
  sélecteur reste un placeholder (icône + texte « Simulation à venir »), câblé dans
  `setPrincipeMode()` en attendant son contenu — il n'affecte ni « Ondes de surface » ni
  « Ondes lumineuses ».
- Formes d'ouverture limitées à fente verticale et trou circulaire (pas de fente horizontale,
  trou carré ou fil, contrairement à `diffraction/`) — limitation assumée, cf. §Périmètre
  physique.
