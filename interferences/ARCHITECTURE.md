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
    ├── principe.js  ← onglet "Interférences en 1D" (état, physique et rendu propres — mode 1D)
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
| **Interférences en 1D** | `#principe` | **Implémenté** (`js/principe.js`) en **mode 1D** ; mode 2D en placeholder | Deux haut-parleurs face à face sur un axe, et un micro déplaçable entre eux — cf. §`js/principe.js` |
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

**Grille en x de l'enveloppe 3D : étendue restreinte + `n` adaptatif** (correctif ultérieur —
franges visiblement sous-échantillonnées à grand `b`, surtout à petit `D`, constaté par
l'utilisateur). Deux volets, dans `construireGeometrieEnveloppe` :

1. **Étendue** — la grille couvrait toujours toute la demi-largeur d'écran (±12,5 cm) alors que
   le champ FFT n'a de valeur non nulle que jusqu'à `porteeChamp_m` (= `D·tanθmax` avec
   `sinθmax = (N/2)·λ/FFT_FENETRE_M`, la même borne qui servait déjà au balayage vertical du
   trou circulaire). `spreadHalfCm = min(halfW, porteeChamp_m)·100` : troncature **sans perte**
   (au-delà, `echantillonnerChamp` renvoie 0 — colonnes noires et de hauteur nulle), qui rend à
   la zone utile toute la résolution jusqu'ici dépensée dans le vide. Le gain est d'autant plus
   grand que `a` est grand (fenêtre FFT large ⇒ portée angulaire faible) : jusqu'à ~30× à
   `a`=500 µm.
2. **`n` adaptatif** — l'interfrange `λD/b` n'a aucun rapport avec la largeur de l'écran et
   descend à ~0,1 mm à `b` max / `D` min, contre 0,6 mm de pas de grille à `n`=400 sur 12,5 cm.
   `n` est donc recalculé pour tenir `ENVELOPPE_ECH_PAR_FRANGE` (8) échantillons par
   interfrange sur l'étendue ci-dessus, borné par `ENVELOPPE_N_TRANCHES` (400, plancher
   historique) et `ENVELOPPE_N_MAX` (1600, garde-fou de coût : le nombre de sommets du maillage
   est proportionnel à `n` et la géométrie est reconstruite à chaque frappe de slider ; en
   lumière blanche s'y ajoute le facteur 6 des enveloppes couleur, heureusement anti-rebondies).

Les deux volets se combinent : c'est la restriction d'étendue qui rend 8 échantillons par frange
atteignable sous le plafond `ENVELOPPE_N_MAX`.

**Anti-crénelage des franges : `pas_m` (moyenne au lieu du pointage)**. La texture d'écran ne
peut PAS recevoir le traitement ci-dessus : elle doit couvrir les 25 cm de l'écran entiers (elle
est mappée sur le plan `screenMesh`), donc impossible de concentrer sa résolution là où il en
faut, et augmenter `TEXTURE_LARGEUR_PX` coûte quadratiquement (la hauteur suit, pour garder des
texels carrés). À 1024 px sur 25 cm, un pixel vaut 0,24 mm contre un interfrange descendant à
~0,10 mm : **moins d'un pixel par frange**, irrémédiablement.

La sortie n'est donc pas plus de résolution mais le bon **filtrage**. `facteurInterference()`
(`sim.js`) accepte un argument optionnel `pas_m` = largeur physique de l'échantillon à l'écran
(un pixel de texture, une colonne d'enveloppe) et renvoie alors la MOYENNE du facteur sur cet
intervalle au lieu de sa valeur au centre. Avec φ = π·b·sinθ/λ et cos²φ = (1+cos2φ)/2, φ étant
localement affine à l'échelle d'un pixel :

```
⟨cos²φ⟩ = ½ · (1 + cos(2φ₀) · sin(u)/u · G(u)),   u = φ'(x₀)·pas_m,   φ' = (π·b/λ)·D²/(x²+D²)^{3/2}
```

`cos²φ` étant de période π en φ, **u = π × pas / interfrange** : `u` mesure directement le pas
d'échantillonnage en fraction de frange, et `u = π/2` est exactement la fréquence de **Nyquist**
(2 échantillons par frange).

`G(u)` = `gardeAntiRepliement()`, ajoutée après coup — **la moyenne seule ne suffit pas**.
Symptôme constaté par l'utilisateur : en augmentant `b`, le nombre de franges affichées croissait
normalement puis se remettait à **décroître** vers `b` ≈ 0,5 mm à petit `D`, ce qui est
physiquement impossible. Cause : moyenner sur un échantillon revient à filtrer par une fenêtre
**rectangulaire**, dont la réponse `sin(u)/u` ne décroît qu'en `1/u`. Au-delà de Nyquist il
subsistait 30 à 60 % de contraste sur une porteuse trop fine pour la grille, qui se repliait en
fausses franges **larges** — d'autant plus larges que `b` augmentait, d'où l'inversion. Le seuil
mesuré tombe pile sur Nyquist (`b` ≈ 0,52 mm à `D` = 0,40 m ; > `b` max dès `D` ≥ 1 m, cohérent
avec « quand D est grand le problème ne se pose pas »).

`G(u) = exp(-(u/(π/2))⁶)` : quasi plat tant que les franges sont confortablement résolues (0,94 à
3 px/frange — la moyenne rectangulaire, physiquement exacte, reste alors seule aux commandes),
puis chute très vite (0,37 à Nyquist, 1,5·10⁻³ à 1,5 px/frange, 10⁻⁸ à 1,25). Surtout :
**strictement décroissant en `u`, donc en `b`** (vérifié numériquement sur tout le domaine) — le
contraste ne peut plus jamais remonter, ce qui rend l'inversion structurellement impossible. Le
nombre de franges visibles croît avec `b` puis **sature** en un éclairement uniforme (= ½ ×
enveloppe, la vraie moyenne).

Cette saturation est le prix assumé, et c'est le bon : un écran de 25 cm ne peut pas montrer les
~2600 franges de `b` max à `D` min, quelle que soit la résolution de texture. Les fondre est le
rendu honnête ; les replier ne l'est pas. La lecture quantitative des franges reste le rôle du
graphe I(x), qui est zoomable et n'est pas filtré (cf. `pas_m` = 0 par défaut).

Forme fermée — **aucun sur-échantillonnage**, coût O(1) par point (un `sin` + un `exp`), ce qui
comptait : la texture est redessinée à chaque frappe de slider, et jusqu'à 6× en lumière
blanche. Le terme `sin(u)/u` seul a été vérifié numériquement contre une moyenne par force brute :
écart max 1,5·10⁻⁴ (échelle 0–1) dans le cas le plus défavorable (`b` max + `D` min) — c'est donc
bien la vraie moyenne tant que `G(u)` ≈ 1, c'est-à-dire tant que les franges sont résolues.

Comportement aux deux extrêmes : sinus cardinal ≈ 1 quand les franges sont résolues (on retrouve
exactement `cos²φ₀`, rien n'est perdu ni flouté), et → 0 quand le pixel couvre plusieurs franges,
la moyenne tendant vers ½ × enveloppe — un gris uniforme, exactement ce que montre un écran réel
photographié de trop loin. C'est **physiquement juste**, contrairement au pointage ponctuel qui
fabriquait de fausses franges larges (moiré) n'existant nulle part.

`pas_m` est transmis en cascade par `intensiteInterference()` → `intensiteBlancheComposantes()`
et par `echantillonnerChampInterference()`, **toujours en paramètre optionnel valant 0 par
défaut** (= ancien comportement, valeur ponctuelle exacte, bit à bit) : seuls les appels de RENDU
le renseignent. Le graphe I(x) (`graph.js`), `echantillonnerIntensite()` et les encarts de
valeurs gardent l'intensité physique ponctuelle — leur lecture doit rester quantitative. Les
appelants qui le renseignent : texture d'écran mono et lumière blanche (`PAS_TEXTURE_M`,
constante de module dans `scene.js`) et enveloppe 3D (`pasColonne_m`, cf.
`construireGeometrieEnveloppe`) — pour cette dernière, c'est ce qui rend le plafond
`ENVELOPPE_N_MAX` inoffensif : quand il mord, les franges se fondent proprement au lieu de se
déchirer.

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
  ils sont précalculés une fois par géométrie (`_rebuildSurfFieldCache`) sur une grille dont la
  résolution suit λ (cf. ci-dessous). Le coût par frame se réduit donc à 2 sources × 1 addition
  par cellule. Les deux vues consomment ensuite cette grille différemment : la **vue de dessus**
  colorie la grille puis l'agrandit par `drawImage` (interpolation du navigateur), la **vue
  plongeante** l'interpole elle-même, bilinéairement, directement à la résolution de l'écran
  (`putImageData` à l'échelle 1:1, aucun agrandissement — cf. §Vue plongeante).
- Chaque source ponctuelle utilise le **même modèle asymptotique d'onde cylindrique 2D** que les
  sources de Huygens de `diffraction/` (facteur `(1−i)/√(2λ)`, `_surfPointSourcePQ`) — le Green
  du problème 2D, pas un simple `sin(kr−ωt)/√r`, pour rester cohérent avec le reste du site.
- **Dimensionnement de la grille** — un scalaire unique `m` = cellules par pixel écran, tiré de
  `SURF_GRID_CELLS_PER_LAMBDA` (= 9) divisé par λ en pixels, borné en bas par
  `1/SURF_GRID_FACTOR` et en haut par 1 (au-delà, l'écran ne peut plus rien montrer de plus).
  La grille vaut `m × canvas`, puis un **budget isotrope** `SURF_GRID_BUDGET` (360 000 cellules)
  la rétrécit par un facteur de forme unique `√(budget/aire)` si elle déborde. Les anciens
  plafonds anisotropes en dur (380 × 250) produisaient une grille de rapport 1,52 sur un canvas
  de rapport 1,25, donc une résolution deux fois moindre en x qu'en y. Les rebuilds sont
  regroupés par `_scheduleSurfRebuild()` (au plus un par frame, même principe que
  `resize()`/`resizeScheduled`).
- **Symétries du maillage** (`_rebuildSurfFieldCache`) : les deux sources étant sur la médiane
  horizontale, `r₁` d'une cellule vaut `r₂` de sa cellule miroir gauche/droite, et la moitié basse
  de la grille est le miroir exact de la moitié haute. Seul un quart de la grille est réellement
  calculé ; le reste est rempli par écriture croisée puis recopie de lignes (`set`/`subarray`).
- **Célérité fixe** `SURF_C_CM = 9,6 cm/s`. Le cadrage est décrit par `viewCm` (largeur visible du
  bassin en cm), qui calibre `pxPerCm` au resize.

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
| Géométrie | `canvasW/H`, `pxPerCm`, `viewCm` (largeur visible en cm, `SURF_VIEW_MIN_CM` 20 → `SURF_VIEW_MAX_CM` 160, défaut 80 ; slider **géométrique** à `SURF_ZOOM_STEPS` = 240 crans, cf. §Zoom), `originX/Y`, `s1`, `s2` |
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

#### Zoom

Même doctrine que `diffraction/` : le cadrage est décrit par une **largeur visible en cm**
(`viewCm`), pas par un facteur multiplicatif. `pxPerCm = canvasW / viewCm`, donc redimensionner la
fenêtre ne change pas ce qu'on voit, seulement la finesse avec laquelle on le voit.

- Slider **géométrique** (`_surfViewFromSlider` / `_surfSliderFromView`) : un cran donne toujours
  le même rapport, jamais le même nombre de cm. Il va de `SURF_VIEW_MAX_CM` (dézoom, à gauche) à
  `SURF_VIEW_MIN_CM` (zoom, à droite), et le libellé affiche `SURF_VIEW_DEFAULT_CM / viewCm`.
- **Molette** (`initSurfWheelZoom`) : loi multiplicative `viewCm × exp(Δ·SURF_WHEEL_SENS)`,
  resynchronisée sur le slider.
- **Barre d'échelle** (`_drawSurfScaleBar`) : longueur « ronde » choisie dans
  `SURF_SCALE_NICE_CM`, visant `SURF_SCALE_TARGET_FR` de la largeur du bassin. Dessinée dans les
  **deux** vues — l'inclinaison tournant autour de l'axe horizontal S₁S₂, les longueurs en x
  gardent leur échelle exacte en vue plongeante.

**Le cadrage ne réagit jamais automatiquement à λ.** Ce serait masquer la grandeur qu'on fait
varier : c'est à l'élève de constater que les crêtes se resserrent, et de zoomer s'il le souhaite.

#### Vue plongeante — échantillonnage et artefacts

Le rendu 3D (`_render3DSurfView`) est un **algorithme du peintre** : `N_Z` bandes de profondeur
dessinées d'arrière en avant, chacune remplissant verticalement l'écart avec la silhouette de la
bande précédente (`_prevSy`), ce qui produit l'occlusion. Tampon `ImageData` et tables
d'interpolation par colonne réutilisés d'une frame à l'autre (rien n'est alloué par frame).

Quatre réglages gouvernent la qualité, et chacun corrige un artefact précis :

| réglage | rôle |
|---|---|
| `SURF_3D_BANDS_BUDGET` (750 000 itérations) | plafonne `N_Z × PW`. Exprimé en **itérations**, pas en millisecondes : le budget d'une frame appartient à l'écran, pas au code, et une constante en ms serait fausse sur toute autre machine |
| `SURF_3D_STEEPNESS` (0,5) | **plafond de raideur** : la hauteur effective (`_surfAmp3D`) est bornée à une fraction de λ *à l'écran*. Sans lui, 42 px fixes sur une λ de 10 px donnent une vague 8 fois plus haute que large — une palissade dont la silhouette est un peigne et dont l'occlusion masque toute la figure |
| recalage `N_Z` sur `gh` (`SURF_3D_BEAT_PERIOD` = 4) | supprime le **battement de rééchantillonnage**. Décimer 537 lignes de grille en 469 bandes fait dériver le poids `ty` de 0,145 par bande : `ty` = 0 lit une ligne telle quelle (contraste plein), `ty` = 0,5 moyenne deux lignes en quasi-opposition de phase (contraste écrasé), d'où des stries net/fondu de période ~13 px. `N_Z` est calé sur un sous-multiple entier de `gh` (`ty` constant), mais **seulement** en décimation et seulement si la période dépasse 4 bandes |
| interpolation verticale de la couleur | le remplissage rampe entre la couleur de la bande précédente et celle de la bande courante. Sans elle, la profondeur était reconstruite en escalier alors que l'axe x l'est linéairement : à nombre de cellules par λ pourtant identique, les vagues se propageant en profondeur paraissaient bien plus grossières que celles se propageant latéralement |

**Ce qui a été mesuré puis écarté.** Réduire la résolution de *peinture* : la boucle est un
rastériseur, pas un interpolateur — elle produit des arêtes (bords de crête, occlusion, limite
eau/fond marin) que la grille ne contient pas, et dont la finesse ne dépend que de `PW`/`PH`.
Découpler l'échantillonnage du champ de la résolution de remplissage, et transposer le tampon
pour la localité de cache : mesuré à ~3 ms chacun sur 25, pour un vrai risque de régression —
le peintre est équilibré ~50/50 entre préambule par colonne et écritures (2,61 M d'écritures pour
859 k évaluations, segment moyen 2,70 px, surdessin 1,28×).

#### Gel en pause

`tickSurfaces` ne redessine pas à l'arrêt. L'invalidation se fait sur les **événements d'entrée**
(`initSurfInvalidation`, en capture à la racine du document) et non sur une signature d'état :
une signature n'est juste que si elle est exhaustive, et un champ oublié fige l'image sur une
valeur périmée — panne silencieuse. L'animation étant à l'arrêt, rien ne peut changer l'image sans
qu'un événement l'ait précédé. Filet de sécurité (`SURF_PAUSED_REFRESH_MS` = 500 ms) pour
rattraper une invalidation manquante en moins d'une demi-seconde.

#### Graphes (`SURF_GRAPH_TABS`)

Trois graphes au choix, affichables **seul ou par deux** (`graphMode`, `toggleSurfDualGraph`) :

| Clé | Titre | Contenu |
|---|---|---|
| `amp-t` | Hauteur(t) | Hauteur de l'eau au point M en fonction du temps (fenêtre `SURF_GRAPH_WINDOW` = 5 s) |
| `amp-y` | Amplitude(y) | Amplitude le long de l'axe de coupe vertical (`cut`) |
| `amp-x` | Amplitude(x) | Amplitude le long de l'axe de coupe horizontal (`cutH`) |

Échantillonnage adaptatif (`SURF_GRAPH_SAMPLES_PER_LAMBDA` = 8, plafonné à
`SURF_GRAPH_SAMPLES_MAX` = 6000) : le nombre de points suit λ et l'étendue affichée.

### `js/principe.js` — Onglet « Interférences en 1D »

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
(`simPrin.coteYs`) qui accueille les doubles flèches S₁M et S₂M. Ces cotes étaient auparavant
tracées *dans* la bande, à `y0 + half·0,82` — c'est-à-dire exactement sur l'amplitude 2, donc dans
la courbe dès que A₁ + A₂ approchait son maximum.

Ses `PRIN_N_COTES` = 2 lignes sont réservées **en permanence**, à slots fixes (0 = S₁M, 1 = S₂M) :
une cote masquée laisse sa ligne vide. Un couloir dimensionné sur les options actives faisait se
comprimer et se translater toute la scène à chaque bascule de « Coter S₁M et S₂M » — le repère
visuel de l'élève sautait à chaque clic. Aucune option d'affichage ne touche donc plus à la mise
en page.

Le couloir a compté une **troisième ligne**, en tête, pour une cote λ/2 tracée avec les repères
d'interférences. Supprimée : elle repoussait les deux cotes utiles vers le bas pour une
information déjà lisible dans l'espacement des marqueurs V/N. `basH` se décompose désormais en
trois termes explicites — descente jusqu'à la dernière ligne (`coteY0 + coteDY · (N − 1)`, en
unités de `fs`), place des pointes de flèche (`10 · lw`), puis `0,55 · fs` de marge avec le bord
bas du cadre, sans laquelle la cote S₂M s'y retrouvait collée. `coteY0` = 2,10 et `coteDY` = 1,60
sont des **variables locales de `_prinLayout`, pas des littéraux répétés** : elles servent à la
fois à `basH` et au remplissage de `s.coteYs`, les deux calculs doivent rester d'accord. Leurs
valeurs dégagent le cartouche des libellés de cote (1,20 · fs de haut) des valeurs chiffrées de
l'axe qui le précèdent, et empêchent deux cartouches consécutifs de se toucher.

Les **libellés de cote** sont au même corps que ceux de S₁/S₂/M (1,05 · fs) — ce sont les mêmes
grandeurs lues au tableau — et posés sur un **cartouche plein** (`PRIN_COL_BG`) plutôt que sur le
simple halo de `_prinText()` : le halo laissait deviner le trait de cote derrière les lettres. Le
cartouche est dessiné dans `_prinDrawCote` et non dans `_prinText()`, pour être calé sur la
hauteur du couloir. Les distances sont affichées en **valeur absolue** : l'ordre S₁ < M < S₂ est
certes garanti par `PRIN_MARGE_M`, mais la formule doit dire ce qu'elle mesure plutôt que
s'appuyer sur cette contrainte.

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
pour le fond coloré, les marqueurs V/N et l'aimantation du glisser-déposer) :

```
constructif   x = (x₁ + x₂ − k·λ)/2
destructif    x = (x₁ + x₂ − (k+½)·λ)/2
```

#### Ce que représente `y` : la SURPRESSION

`y₁`, `y₂` et leur somme sont des **surpressions acoustiques**, pas des déplacements de matière.
Le choix n'est pas cosmétique : il commande entièrement le mode « Particules » ci-dessous, et
c'est lui qui rend les deux représentations superposables.

- Un micro est un capteur de **pression** : la ligne 3 est donc littéralement ce que M mesure, et
  « δ = k·λ → constructif » veut dire « le micro entend fort ».
- L'excès de densité d'un gaz vaut −∂u/∂x à un facteur près, soit exactement ΔP : **pression et
  densité sont rigoureusement en phase**. La courbe tracée est donc aussi la courbe de densité, et
  en mode « Les deux » un sommet de courbe tombe *pile* sur un paquet de particules. Avec
  `y` = déplacement, la compression se serait située là où la courbe a sa **pente** maximale —
  courbe et paquets décalés de λ/4 à l'écran, ce qui aurait disqualifié le mode superposé.
- Les deux membranes sources se déplacent alors **en miroir** (elles poussent vers l'intérieur
  ensemble), ce qu'on obtient en branchant deux haut-parleurs identiques sur la même sortie
  d'ampli. Avec `y` = déplacement elles auraient translaté parallèlement, dans le même sens.

Contrepartie assumée : le champ de **déplacement** du gaz est en quadrature avec la courbe. Aux
ventres de pression les particules sont quasi immobiles et la densité pulse au maximum ; aux nœuds
c'est l'inverse. C'est correct — c'est même le contenu — mais la **légende des repères change de
libellé** en mode Particules (`_prinDrawReperesLegende`) pour le dire, sans quoi l'élève lit
« constructif » sur des particules immobiles et en conclut le contraire.

#### Mode « Particules » — gaz de compressions / détentes

`simPrin.repr` ∈ `'signal'` (défaut) | `'particules'` | `'lesdeux'`, piloté par un sélecteur
segmenté à trois crans (`setPrinRepresentation`). Chaque bande devient un **tube de gaz
horizontal** : les haut-parleurs y sont des membranes, le micro une membrane mise en mouvement par
la pression.

**Le basculement ne déplace rien.** `_prinLayout` ne connaît pas `simPrin.repr` : les trois bandes,
le couloir de cotes, le micro et les sources gardent leur place au pixel près, et seul le contenu
des bandes change. On peut donc basculer en pleine animation pour comparer — c'est l'usage visé.

Physique identique à celle de l'onglet Son de la page Ondes (`ondes/js/tube.js` + `ondes/js/sim.js`) :
modèle lagrangien continu, une particule = une parcelle de fluide, position affichée = position de
repos + déplacement du champ. Le code en est **adapté, non partagé** — aucune page du site n'a de
fichier commun avec une autre. Deux simplifications par rapport au tab Son : pas d'historique de
source (λ et A s'appliquent instantanément ici, comme partout dans cet onglet, donc `u` est
analytique) et pas de curseurs ρ/K.

Le déplacement se déduit de `p = −K·∂u/∂x`, en tenant compte de `∂d₂/∂x = −1` :

```
u₁(x,t) = +A₁·(1 − cos(ω·tr₁))     ⟹  p₁ = A₁·sin(ω·tr₁)   = _prinY1Libre   ✔
u₂(x,t) = −A₂·(1 − cos(ω·tr₂))     ⟹  p₂ = A₂·sin(ω·tr₂)   = _prinY2Libre   ✔
```

Les deux redonnent **exactement** les courbes déjà tracées : il n'y a pas deux modèles parallèles
à tenir d'accord. Le terme `(1 − cos)` et non `(−cos)` est la constante d'intégration d'une source
qui démarre **au repos** — sans elle `u` sauterait de 0 à −U au passage du front et toutes les
particules se décaleraient d'un coup. Conséquence assumée : derrière le front le gaz est translaté
en bloc de U, ce qui est **invisible dans le gaz** (∂/∂x d'une constante est nul, donc aucune
densité n'en dépend) et se compense exactement entre les sources si A₁ = A₂ ; cela ne se voit que
sur les membranes, qui pompent vers l'intérieur au lieu de battre autour de leur repos — le
comportement réel d'un haut-parleur démarré brutalement sur une sinusoïde.

**Calibrage de l'amplitude** (`_prinGazGain`) : ce qui rend une compression visible n'est pas
l'amplitude mais le produit `A·k`. Le gain vise `PRIN_GAZ_AK` = 0,55 **pour A = 1** et s'applique à
l'identique sur les trois bandes — même doctrine que `ampPx` pour les courbes : un ventre à
A₁ + A₂ = 2 doit vraiment montrer deux fois plus de contraste, et A₁ = 0 ne doit plus rien montrer.
0,55 et non 0,75 (`AK_CAP` du tab Son) parce que la ligne somme monte à 2·A·k = 1,10 : au-delà de
π/2 ≈ 1,57 les trajectoires de particules voisines se croisent et le nuage produit des caustiques.
Un plafond absolu (`PRIN_GAZ_G_MAX_FRAC` = 4,5 % de la largeur de l'axe) évite qu'à λ = 1,50 m le
mouvement d'ensemble masque la structure de l'onde.

**Nuage** (`_prinGazInit`) : un tableau par bande, positions de repos stockées **en mètres** — jamais
en pixels, même doctrine que `simPrin.x1/x2/xM`. Un redimensionnement ne le régénère que si le
grain change réellement, et le nuage couvre **tout l'axe** indépendamment de la position des
sources, si bien que déplacer S₁ ou S₂ ne le reconstruit pas : c'est le clip au dessin qui
restreint la portion visible. Le rayon est indexé sur `unitH` et non sur la hauteur de la bande —
les trois bandes montrent le *même* gaz, la ligne somme en contient simplement deux fois plus.
Grille jitterée en x et ordre des ordonnées mélangé, comme `initCols`.

Le **plafond d'effectif** (`PRIN_GAZ_N_MAX` = 8 000, aligné sur `initCols`) est appliqué en
**élargissant la case** (`_prinGazSlot`) et non par un écrêtage bande par bande : les trois bandes
montrent le *même* gaz, leur densité doit rester identique. Un plafond par bande écrêterait d'abord
la ligne somme, deux fois plus peuplée, qui apparaîtrait alors deux fois moins dense que les lignes
sources. Comme la case s'élargit exactement de ce que le plafond retire, le rapport λ/espacement —
la seule grandeur qui compte pour la lisibilité des bandes — reste indépendant de la taille de la
fenêtre. `_prinGazEspacement` est dérivé de la case **effective**, plafond compris, sinon le voile
se doserait sur un grain plus fin que celui réellement affiché.

#### Agitation thermique : c'est le PAS qui compte, pas l'amplitude

Marche aléatoire 2D isotrope rappelée, **multipliée par `speedFactor`** (sans quoi l'onde
ralentirait et le gaz non), avec repliement aux parois (`_prinGazFold`) plutôt qu'un clamp qui
empilerait les particules en deux liserés.

Le réglage repris tel quel de l'onglet Son rendait les **zones destructives invisibles**, et pas
pour la raison qu'on croit. Un nœud de pression est un ventre de *déplacement* : le gaz y oscille en
bloc sans changer de densité, et le seul indice est ce mouvement d'ensemble. L'œil sait parfaitement
le détecter dans un champ de points aléatoires — à condition qu'il ressorte du bruit. Or aux
réglages par défaut :

| | par frame (60 fps) |
|---|---|
| mouvement cohérent au ventre de déplacement | 1,12 px (RMS) |
| pas de l'errance, ancien réglage | 1,30 px (σ) |

Le bruit était **plus grand que le signal**. Le ratio ne dépend pas du ralenti, `speedFactor`
multipliant déjà les deux.

Les deux grandeurs se règlent séparément puisque `σ_stat = σ_pas / √(2·pull)`. On baisse donc à la
fois l'amplitude (σ visé = λ_px/52 ≈ 2,5 px au lieu de 6,5) **et** le rappel (0,020 → 0,014, soit
une relaxation de ~1,2 s) : l'errance devient plus lente et plus douce, le gaz reste vivant, et le
pas tombe à ≈ 0,42 px/frame — le mouvement cohérent passe devant d'un facteur ~2,7. Rétrécir la
seule amplitude à rappel constant aurait gardé un scintillement, simplement plus serré. Le budget de
flou, lui, n'est plus contraignant : à σ = λ/52 le contraste des bandes perd `exp(−2π²σ²/λ²)`, soit
moins de 1 %.

**Voile de densité** (`_prinDrawGazVoile`) : halo unilatéral dans la couleur des particules sous les
cœurs de compression, **dosé sur λ mesurée en espacements** — inexistant au réglage par défaut
(λ ≈ 15 espacements, le nuage suffit), franc en bas de plage. Il est indispensable là : à λ = 0,20 m
une bande de compression fait ~22 px pour un grain de ~9 px, le nuage est à sa limite de résolution
et aucun réglage d'amplitude n'y changera rien, alors que le voile est un champ continu. Posé en
**transparence** et non en aplat : un aplat, fût-il de la couleur exacte du fond, effacerait la
grille verticale de la bande.

**Membranes** : la source garde son libellé et son ergot de position à l'abscisse **exacte** x₁/x₂,
jamais sur la membrane qui bouge — sinon la cote S₁M paraîtrait respirer. La caisse **suit** la
face de la membrane, faute de quoi celle-ci laisserait derrière elle une bande de fond nu large de
tout son débattement. Le déplacement de la membrane est lu dans le champ **de la bande** et non
dans la seule contribution de sa propre source : sur les lignes 1 et 2 cela revient au même, mais
sur la ligne somme prendre u₁ seul ferait glisser le gaz *à travers* la membrane de S₁, de tout ce
que vaut u₂ à cette abscisse. Contrepartie : sur la ligne somme la membrane réagit aussi à l'onde
qui lui arrive d'en face, ce qui est bien ce que décrit le modèle affiché (superposition libre,
sans réflexion sur les sources).

#### La membrane du micro (`_prinDrawMembraneMicro`)

Une membrane **horizontale** encastrée sur une **cavité rigide et scellée**, dont le centre est
exactement le point M. Elle s'enfonce dans la cavité quand le gaz se comprime au-dessus d'elle, se
bombe vers l'extérieur quand il se raréfie. Sa flèche suit `y₁(M) + y₂(M)`, la valeur même que
lisent les trois fenêtres d'oscilloscope ; le gain (`_prinMicGain`) est indexé sur la taille du
pictogramme et **non sur λ**, la réponse d'un micro à une pression donnée ne dépendant pas de la
longueur d'onde.

Une première version faisait **coulisser une membrane verticale selon x**, comme un piston. Deux
défauts, tous deux sérieux :

- une barre mince avec du gaz **des deux côtés** subit la même pression sur ses deux faces et ne
  devrait pas bouger : l'objet dessiné était mécaniquement incohérent, et l'élève avait raison de ne
  pas y croire. D'où la cavité scellée — c'est elle, à pression de référence, qui fait qu'une
  membrane répond à ΔP ;
- surtout, elle se déplaçait dans la **même direction que le ballottement des particules**. Cela ne
  brouillait pas seulement la lecture : cela suggérait que le micro *suit le flux*, c'est-à-dire
  précisément l'idée à détruire. Une membrane qui se bombe dit « quelque chose appuie dessus » ;
  une membrane qui glisse dit « quelque chose l'emporte ».

La pression étant un scalaire, presser perpendiculairement est tout aussi juste — et les deux
mouvements, désormais orthogonaux, se lisent sans se gêner.

Effet de bord bienvenu : à la position par défaut (x_M = 2,00 m, δ = 0) le micro est sur un ventre
de pression, donc sur un **nœud de déplacement** — le gaz y est rigoureusement immobile. Avec une
membrane qui coulissait, la toute première image montrait un objet qui glisse au milieu de
particules figées, le cas le plus déroutant possible. Avec une membrane qui se bombe, il n'y a plus
de paradoxe apparent. C'est ce qui a rendu inutile un décalage de la position par défaut de M.

**La cavité contient du gaz**, à la densité de repos, teinté en `PRIN_COL_M` (il appartient à
l'appareil, pas à la bande). Ce n'est pas un ornement : c'est la raison même pour laquelle la
membrane bouge. Un capteur de pression ne mesure pas « la pression », il mesure un **écart à une
référence** — et cette référence est là, visible, sous la forme d'un gaz dont la densité ne change
jamais, contre lequel se lit la compression du dehors.

Le comptage se fait sur l'aire **réellement occupée** (`geo.gazW × geo.gazH`, retraits de paroi
compris) et non sur l'aire brute de la cavité : compter sur l'aire brute puis tasser les particules
dans une boîte plus petite les rendait une fois et demie plus denses que le gaz ambiant, soit
exactement le contraire de ce que la cavité doit montrer. `_prinMicGeo` est donc la **source unique**
de cette géométrie, partagée par `_prinGazInit` et le rendu.

Les ordonnées sont rapportées à la **membrane courante** et non à l'axe : le volume se réduit un peu
quand elle s'enfonce et le gaz s'y resserre d'autant, ce qui est physiquement juste (une cavité
fermée dont une paroi avance se comprime) et évite surtout que des particules disparaissent sous le
couvercle à chaque compression. L'ordonnée de la membrane à la fraction `t` de sa largeur vaut
`y0 + 4·flèche·t·(1−t)` : le point de contrôle de la quadratique étant à l'abscisse médiane, `x(t)`
est exactement linéaire et `t` se confond avec la fraction de largeur.

**La membrane est posée sous l'axe** (`PRIN_MIC_DECALAGE` = 0,50 · micH) : au repos elle tombait
exactement sur y = 0 et s'y confondait — on ne savait plus si le trait horizontal était l'axe ou le
capteur. Le **fond** de la cavité, lui, ne bouge pas : il reste calé sur `PRIN_MIC_BAS_RATIO`, et
avec lui le libellé et le badge δ. C'est un point contraint, pas un choix : le badge n'a qu'un pixel
de marge avant d'être rabattu dans la bande (cf. la borne `min(…)` de `drawPrincipe`), donc
descendre le fond de la cavité le ferait chevaucher le libellé. **C'est la cavité qui se raccourcit,
pas la scène qui bouge.**

Conséquences en chaîne, toutes liées : la membrane est **élargie de 25 %** (`1,25 → 1,5625 · micH`),
et le gain `_prinMicGain` **abaissé de 0,30 à 0,20 · micH`**. Le gain devait baisser pour deux
raisons simultanées — le bombement vers l'extérieur doit rester sous l'axe (flèche max
0,40 · micH < 0,50 · micH de décalage), et une membrane qui s'enfoncerait de la moitié de la
profondeur restante écraserait le gaz de référence qu'elle est censée laisser tranquille. La
lisibilité n'y perd rien : c'est le rapport flèche/corde qui fait la courbure perçue, et la corde
s'est allongée dans le même temps. L'effectif du gaz enfermé suit automatiquement, `geo.gazW` et
`geo.gazH` étant recalculés depuis la nouvelle géométrie.

Détails de rendu : la flèche est calculée à partir de la pression au **seul centre** — la largeur du
dessin est picturale, elle ne moyenne rien (ce qui suppose, comme pour tout micro réel, un capteur
petit devant λ, hypothèse qui s'affaiblit en bas de plage où λ ne fait plus que ~45 px). Le contour
de la cavité est tracé **d'une pièce, couvercle déformé compris**, pour que le volume reste fermé
quand la membrane se bombe au-dessus de l'axe : cette portion appartient alors à la cavité, pas au
gaz. Le corps est **opaque** — c'est un volume scellé, aucune particule ne doit se voir au travers —
et creusé d'un vide intérieur clair, sans lequel il se lirait comme un bloc plein sur lequel une
membrane ne peut pas s'enfoncer. Les mors d'encastrement aux deux extrémités disent qu'elle est
*tenue* là, donc qu'elle se déforme au lieu de se déplacer. Le fond de la cavité est calé sur
`PRIN_MIC_BAS_RATIO`, inchangé : libellé et badge δ ne bougent pas d'un pixel.

**Ce qui s'efface** en mode `'particules'` : l'échelle verticale (elle gradue une amplitude de
courbe), le point de lecture bleu et sa valeur (la membrane du micro les remplace). En mode
`'lesdeux'` la courbe est tracée plus fine et **sans son aplat de remplissage**, qui délaverait le
nuage sur toute la hauteur de la bande.

#### Sélection de particules

Même principe que « Sélectionner des particules » de l'onglet Son (`selectNearbyParticles`,
`ondes/js/sim.js`) : en mode sélection, un clic marque le paquet voisin de l'abscisse cliquée,
Ctrl+clic ajoute un paquet, Maj+clic en retire un, quitter le mode efface tout. Le paquet est repéré
par la particule **affichée** la plus proche du clic, et non par conversion directe de l'abscisse
écran : l'onde ayant déplacé les particules, `_prinXm()` désignerait la position de repos d'une
autre parcelle.

Trois adaptations propres à cet onglet :

- **Un seul bouton pour deux fonctions.** « Afficher l'enveloppe » n'a d'objet que sur une courbe,
  « Sélectionner des particules » que sur un gaz : ils ne peuvent jamais servir en même temps et se
  partagent donc la même place (`togglePrinEnvOuSel` dispatche sur `simPrin.repr`). Une première
  version neutralisait le bouton d'enveloppe (`disabled`) ; le remplacer vaut mieux que le griser.
  Conséquence assumée en mode `'lesdeux'` : la courbe est là mais son enveloppe n'est plus
  atteignable — `showEnv` est **conservé** et reprend effet au retour en `'signal'`, seul mode où
  `drawPrincipe` la trace.
- **Le paquet est marqué dans la seule bande cliquée**, comme l'onglet Son ne marque que son unique
  tube. Marquer la même abscisse sur les trois d'un coup serait tentant — on comparerait la même
  tranche de gaz sous y₁ seule, y₂ seule et la superposition — mais un clic sur la ligne 1 qui fait
  apparaître des marques sur la ligne 3 surprend plus qu'il n'aide.
- **Le gaz de la cavité du micro n'est jamais sélectionnable** : `simPrin.gazMic` n'est pas touché
  par `_prinGazSelect`, et ses particules n'ont même pas de champ `sel`. Il n'est pas là pour être
  suivi, il est la référence de pression et doit rester le même quoi qu'on fasse.

Rendu : les particules marquées sont **mises de côté au passage** de la boucle principale plutôt que
redessinées dans une seconde boucle — l'errance doit être avancée exactement une fois par frame et
par particule, une seconde boucle la ferait courir deux fois plus vite. Le tampon `_prinGazSelBuf`
est réutilisé d'une frame à l'autre pour ne pas donner au ramasse-miettes de quoi hoqueter. Couleur
`#0e7a45` : l'onglet Son passe ses particules marquées en brique sur un nuage bleu, mais ici le
nuage prend trois teintes dont un orange, et le vert profond est la seule famille encore libre de la
page (l'ocre est pris par les repères constructifs, le violet par les destructifs). Le **rayon est
inchangé** : ce sont les mêmes parcelles de fluide, seulement repeintes. Une version les grossissait
de 55 % — ça en faisait des objets à part, et surtout ça gonflait artificiellement le paquet, donc
l'étendue qu'on croit observer.

**Largeur du paquet** (`_prinGazSelRadius`) : indexée sur **λ** et non sur la largeur du canvas comme
`_prinGrabTol()`. L'étalon pertinent n'est pas la taille de l'écran mais celle de la structure
observée : un paquet doit tenir *entier* dans une zone de même comportement, sinon il en enjambe deux
et ne montre plus rien. Un premier réglage à 25 px de rayon valait 38 % de λ aux réglages par défaut
— à cheval sur un cœur de compression et sur le nœud voisin, il empêchait précisément de voir les
endroits où les molécules ne font que se translater sans jamais se comprimer. À λ/12 de rayon le
paquet fait λ/6 et tient dans la zone de détente d'un ventre de déplacement, large d'environ λ/4.
Bornes 7 → 20 px.

**Zones de saisie resserrées en mode sélection** (`_prinHit`, via `_prinSelActive`). La générosité
du glisser-déposer se retourne contre l'élève dès qu'un clic peut vouloir dire autre chose que
« déplacer » : M étant saisissable sur les **trois** lignes et sur ±22 px, il stérilisait une colonne
entière de gaz — impossible de marquer les particules au voisinage du micro, c'est-à-dire justement
là où l'on veut regarder. En mode sélection, la saisie se réduit donc à ce que l'on **voit** : M
n'est attrapable que sur son boîtier (ligne 3, sur la seule hauteur de la cavité et de son libellé),
S₁ et S₂ gardent leurs lignes — leur membrane y barre toute la hauteur — mais avec la largeur de
leur caisse plutôt que la tolérance tactile. Le clavier est inchangé : M se déplace toujours aux
flèches quel que soit le mode, donc rien n'est perdu en accessibilité.

La sélection **survit à un redimensionnement** (`_prinGazSelSnapshot` / `_prinGazSelRestore`) : le
passage en plein écran pour le vidéoprojecteur est précisément le moment où l'on vient de préparer
un paquet. Les intervalles sont relevés **en mètres** — contrairement à `_colsSelectionSnapshot`, il
n'y a rien à rapporter à une longueur de référence, les positions de repos n'étant déjà pas en
pixels.

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
| Repérer les interférences | **marqueurs ponctuels** aux positions remarquables de la bande somme : trait vertical fin calé au pixel sur x, encadré de deux **pointes pleines** (haut/bas de bande) dont l'apex tombe sur x — ocre + trait continu pour le constructif, violet + trait tireté pour le destructif. Ces positions sont des **points**, pas des intervalles : ni bandes translucides ni trame de points, qui en faisaient des zones floues. Légende (`_prinDrawReperesLegende`) dans le coin haut-droit de la bande — elle nomme les deux natures, sans la condition sur δ (contenu du cours et de l'encart « Valeurs ») |
| Coter S₁M et S₂M | doubles flèches cotées dans le couloir sous la ligne 3, couleurs de S₁/S₂ |
| Afficher les valeurs | encarts du panneau (S₁M, S₂M, δ = \|S₁M − S₂M\|, δ/λ, conclusion) **et** valeur chiffrée à chaque point de lecture du micro sur le canvas |

La conclusion constructive / destructive / intermédiaire (tolérance `PRIN_TOL_RATIO` = 0,03 sur
δ/λ) est calculée par **`_prinNature()`**, seule source de vérité, partagée par l'encart du
panneau et par le **badge « δ = … · constructive »** dessiné en permanence sous le micro. Ce badge
est le résultat même de la simulation : il était auparavant invisible tant que l'encart
« Valeurs » restait replié.


#### Graphes temporels y(M, t) — fenêtres volantes

Le tracé principal montre **y(x) à un instant donné** ; ces graphes montrent la grandeur
**complémentaire — y(t) en un point fixe**, celui du micro : c'est ce que « voit » M, et c'est sur
y(t) que se lit l'amplitude reçue. Section « Graphes temporels » du panneau (entre *Paramètres* et
*Options*), trois boutons sur une même ligne (`.btn-row.btn-row-tight`) — `y₁(M)`, `y₂(M)`,
`y₁(M)+y₂(M)` — chacun ouvrant/fermant une **fenêtre volante** superposée à la zone de tracé
(`#prin-win-y1` / `-y2` / `-som`, déclarées dans `index.html` à l'intérieur de `#prin-scene-area`).

- **Descripteurs `PRIN_GRAPHS`** : source unique du bouton, de la fenêtre, de la couleur (celle de
  la ligne correspondante) et de la ligne d'ancrage de la flèche.
- **Échelle verticale COMMUNE** — `PRIN_GRAPH_MAXU` = 2, soit ±(A₁ + A₂), sur les **trois**
  graphes. Les trois fenêtres ayant la même taille, une demi-étendue commune vaut un nombre de
  pixels par unité d'amplitude commun, et le doublement de y₁ + y₂ devant y₁ ou y₂ **se voit**.
  Un axe ajusté par graphe (±1 pour y₁/y₂, ±2 pour la somme) donnait trois courbes de même hauteur
  à l'écran : exactement l'illusion que cette simulation doit détruire. Même doctrine que
  `simPrin.ampPx`, identique sur les trois bandes du tracé principal.
- **Calcul analytique, pas d'historique** : `_prinGraphVal` réévalue la courbe sur toute la fenêtre
  temporelle à chaque frame, avec les réglages **courants**. Même approximation assumée que le
  reste de l'onglet (déplacer une source re-cale son front) ; bouger M ou λ pendant l'animation
  redessine un graphe cohérent, au lieu de laisser traîner un morceau de courbe obtenu avec les
  anciens réglages.
- **Fenêtre temporelle** de `PRIN_GRAPH_PERIODES` = 4 **périodes** et non une durée fixe : T = λ/c
  va de 0,6 à 4,4 ms sur la plage de λ, un axe en durée fixe montrerait tantôt une demi-oscillation,
  tantôt vingt. Tant que t < 4T la courbe **pousse** vers la droite depuis un axe vide — le palier
  plat du début est le temps de vol d/c du front — puis l'axe défile comme sur un oscilloscope.
  **Graduation de l'axe des temps** : pas ROND en millisecondes (1 / 2 / 5 ×10ⁿ, `_prinNicePas`),
  jamais un pas d'une demi-période. Le pas en période donnait des étiquettes qui changeaient de
  valeur dès qu'on touchait λ, et l'axe ne portait que ses deux valeurs extrêmes, elles-mêmes en
  défilement continu : rien n'était lisible. Désormais les nombres sont ronds quel que soit λ,
  seule leur DENSITÉ suit la largeur disponible (≈ une étiquette par 4,2·fs, entre 2 et 8) — une
  petite fenêtre ne se retrouve pas avec dix étiquettes qui se chevauchent. La grille verticale
  tombe EXACTEMENT sur ces graduations — c'est elle qui relie le nombre écrit sous le cadre au
  point de la courbe qui lui correspond — et les marques sont portées à la fois par l'axe des
  temps (la ligne y = 0, de part et d'autre, comme `_prinDrawAxe` sur le tracé principal) et par
  le bord bas, là où sont écrits les nombres. Le libellé « t (ms) » est posé au bout de la ligne
  comme « x (m) » sur le tracé principal ; une valeur qui viendrait le heurter est omise plutôt
  que superposée.
- **La fenêtre est un OSCILLOSCOPE, pas un graphe de plus** — boîtier sombre (CSS), écran encastré,
  verre `PRIN_COL_SCOPE_BG` et tracé « phosphore » (`shadowBlur` sur la courbe). C'est la réponse à
  un vrai risque didactique : y(M, t) et y(x, t) ont forcément le même aspect — même sinusoïde,
  même couleur d'identité — et l'élève confond alors représentation spatiale et représentation
  temporelle (la confusion λ ↔ T, classique). On ne casse **pas** la ressemblance des courbes,
  qui est précisément ce qui rend la superposition lisible d'un coup d'œil sur y₁+y₂(t) : on rend
  impossible la confusion des **cadres**. Un écran d'appareil ne se lit pas comme la scène — et
  c'est en prime l'écran qu'on branche vraiment sur un micro en TP. Corollaire : les tons de la
  scène sont calibrés pour l'ivoire et illisibles sur le verre, d'où les contreparties
  `PRIN_COL_SCOPE_S1/S2/SOMME` — la somme y passe en **bleu vif**, qui reste sa couleur d'identité
  (`PRIN_COL_SOMME` est un bleu nuit, invisible sur fond sombre) tout en se détachant de l'orange
  et du rose des sources — plus `PRIN_COL_SCOPE_GRID/AXE/TICK`. La couleur de la LIGNE, elle, reste
  sur le cadre, la barre de titre et la flèche : c'est elle qui relie la fenêtre à sa bande.
- Un **point de lecture** (`PRIN_COL_SCOPE_CURSEUR`) marque l'instant courant sur la courbe, jumeau
  de celui que porte le micro sur le tracé principal : c'est lui qui fait le lien entre les deux
  vues. Il garde le bleu du micro (`PRIN_COL_SCOPE_CURSEUR`, contrepartie claire de `PRIN_COL_M`),
  au plus près de la teinte de la somme sur le verre : c'est son trait pointillé et son cerne
  sombre qui le distinguent de la courbe, pas sa couleur.
- **Flèche de rattachement** (`_prinDrawGraphFleches` / `_prinFlecheVersFenetre`, dessinée sur le
  canvas principal) : elle part de l'abscisse de M **sur la ligne concernée** (1, 2 ou 3) et rejoint
  le point du boîtier le plus proche, dans la couleur de la ligne. Sans elle, trois fenêtres de plus
  flottent sans qu'on sache laquelle montre quoi. **Rectiligne** : le plus court chemin, donc le
  plus lisible au vidéoprojecteur. Ancrée sur l'**axe** de la bande et non sur le point de lecture,
  qui oscille : la flèche battrait au rythme de l'onde. Elle est tracée sur le canvas, donc **sous**
  les fenêtres DOM qui le recouvrent — la pointe s'arrête au boîtier. Les fenêtres étant des
  éléments DOM de `#prin-scene-area`, conteneur du canvas, leurs `offsetLeft/offsetTop` sont
  **déjà** dans le repère du canvas en px CSS.
- **Légende cliquable** de la fenêtre « y₁ + y₂ » : deux cases superposent y₁ et y₂ à leur somme,
  **décochées par défaut** (la somme seule est le sujet du graphe), tracées sous elle et plus fines.
  Elle est logée **dans la barre de titre** — en rangée sous le graphe, elle coûtait de la hauteur
  à une fenêtre déjà petite ; c'est le titre qui cède la place quand la fenêtre rétrécit
  (`min-width: 0` + ellipsis), jamais les cases. Ses teintes sont des versions **éclaircies** de
  PRIN_COL_S1/S2 : les tons du tracé sont calibrés pour l'ivoire de la scène et manquent de
  contraste sur le bleu foncé de la barre. Le glisser-déposer l'exclut de la poignée, au même titre
  que le bouton de fermeture : ce sont des contrôles, un clic sur une case ne doit pas embarquer la
  fenêtre.
- **Glisser-déposer** par la barre de titre, en Pointer Events + capture comme S₁/M/S₂ — l'écart
  de saisie est mémorisé, donc pas de saut sous le pointeur. La dernière fenêtre touchée passe
  devant (`_prinGraphZ`).
- **Responsivité** : largeur en `clamp(190px, 26%, 460px)` et hauteur déduite par `aspect-ratio`,
  donc lisible au vidéoprojecteur sans dévorer une petite fenêtre ; le canvas suit sa taille rendue
  à chaque frame (comparaison de `clientWidth/Height`, pas de `ResizeObserver`) et police comme
  épaisseurs dérivent de `_prinGraphFont`/`_prinGraphLW`, indexées sur **ce** canvas. La position
  est mémorisée en px **et** en fraction de la place disponible : c'est la fraction qui est
  rejouée au redimensionnement (`_prinRelayoutGraphWins`, appelée par `resizePrincipe`), donc une
  fenêtre calée en haut à droite le reste au passage en plein écran. Les libellés passent par
  `_prinGraphText` et non `_prinText`, dont le halo est calibré sur la police du tracé principal
  (jusqu'à 24 px) et mangerait la courbe dans une petite fenêtre.
#### Conventions de rendu

- **Lisibilité au vidéoprojecteur — `_prinFont()` / `_prinLW()`.** Toute la typographie et toutes
  les épaisseurs de trait de l'onglet dérivent de ces deux fonctions ; aucune valeur en px fixe.
  `_prinFont()` prend le **plus grand** de deux calibrages : `min(canvasW/62, 17)`, l'ancien
  calibrage conservé comme **plancher** (aucune fenêtre ne peut perdre en taille de texte), et
  `min(canvasW/52, canvasH/30, 24)`, le calibrage « grande image ». Le plafond de 17 px était
  atteint dès 1054 px de canvas : projeté en plein écran (canvas ≈ 1615 px), le texte ne faisait
  plus que 1 % de la largeur de l'image, donc illisible au fond d'une salle. Le terme en
  `canvasH` n'est pas décoratif — `_prinLayout` consomme ≈ 7,6·fs hors bandes (padTop +
  gouttières + couloir de cotes), donc suivre la seule largeur écraserait les bandes sur une
  fenêtre large et basse. Résultat : ×1,41 en plein écran (17 → 24 px) pour seulement −9 %
  d'amplitude de courbe, ×1,19 en 1280×800, inchangé sur les fenêtres déjà contraintes.
  `_prinLW()` = `max(1, fs/17)` multiplie **toutes** les épaisseurs et longueurs de graduation :
  sans lui on obtenait de gros textes posés sur des traits de 1 px, qui se noient dans le voile
  lumineux d'un vidéoprojecteur. Son plancher à 1 garantit un rendu identique à l'ancien partout
  où `fs < 17`.
- **Hiérarchie typographique resserrée** : les libellés les plus utiles en classe (échelle
  verticale, lettres V/N, badge δ, titres de bande) étaient les plus petits de la scène
  (0,72–0,85 · fs). Ils sont remontés à 0,85–0,95 · fs, le rapport au libellé de source (1,05)
  restant lisible comme hiérarchie. Les marges correspondantes de `_prinLayout` (`margeEch`) sont
  mesurées avec la **même** police que le tracé : toute modification d'un de ces facteurs doit
  être répercutée des deux côtés.
- Fond **`#fdf8f0`** (fond « simulation » de la charte) et non le `#14181d` des deux autres
  onglets : celui-ci trace des courbes sur des axes, pas un champ. Chaque ligne est posée sur une
  **bande** à coins arrondis (`PRIN_COL_BAND`, filet `PRIN_COL_BAND_BD`) parcourue d'une **grille
  verticale** tous les 0,5 m : on lit trois panneaux au lieu d'un aplat continu, et une abscisse
  se repère sur les trois lignes d'un coup d'œil. La grille a **deux niveaux** — mètre entier
  (`PRIN_COL_GRILLE_MAJ`, 1,3 · lw) nettement plus marqué que le demi-mètre (`PRIN_COL_GRILLE`) —
  un ton unique trop pâle ne donnait aucun repère chiffrable. Une **gouttière**
  (`gap` = `max(8, fs·1,15)`, deux intervalles pour trois bandes) sépare les panneaux, qui étaient
  jointifs et se lisaient donc comme un seul bloc.
- **Graduations** dessinées sur les trois axes, de part et d'autre de la ligne (7 · lw au mètre,
  4 · lw au demi-mètre) et dans un ton `PRIN_COL_TICK` franchement plus foncé que l'axe lui-même :
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
  de M puis le badge δ dessous (badge rabattu dans la bande si la fenêtre est trop basse). Ce
  libellé porte l'abscisse entre parenthèses — `M (2,00 m)` — exactement comme ceux des sources ;
  il est passé en paramètre à `_prinDrawMicro()`, qui écrivait auparavant un « M » en dur.
- **Couleur des pictogrammes** : même doctrine pour le micro que pour les haut-parleurs — corps en
  gris métallique (l'objet), couleur d'identité réservée au seul organe actif : le pavillon pour
  une source, la tête grillagée pour le micro. Un micro entièrement bleu lisait comme un symbole,
  pas comme un instrument.
- **Titres de ligne en pastille** (`_prinDrawTitre`) plutôt qu'en texte haloé posé dans le coin du
  tracé ; escamotés quand la bande devient trop basse.
- Les **haut-parleurs sont animés** : membrane qui respire et arcs qui s'éloignent, en phase avec
  ω·t. Ils étaient figés même en pleine animation.
- **Pas d'horloge.** Une ligne `t / T = λ/c / f` occupait le haut de la zone ; elle relevait de
  l'information de panneau, pas de la scène, et coûtait `padTop = 1,6 · fs` de hauteur. Supprimée,
  `padTop` est retombé à `0,55 · fs` (simple respiration avant la première bande) et la hauteur
  récupérée est allée aux bandes.
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
  │                             tickSurfaces, drawSurfaces, surfInvalidate, drawSurfGraph, resizeSurfGraphCanvas,
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
  │                             togglePrinReperes, togglePrinCotes, togglePrinValeurs,
  │                             togglePrinDelta, togglePrinHideBeyondMic,
  │                             togglePrinGraph, setPrinGraphOverlay,
  │                             setPrinRepresentation, togglePrinEnvOuSel,
  │                             togglePrinSelection
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

1. `ENVELOPPE_ECH_PAR_FRANGE` (8) / `ENVELOPPE_N_MAX` (1600) / `ENVELOPPE_N_TRANCHES` (400,
   plancher) et largeur de `screenTexCanvas` (1024), `js/scene.js` — résolution des franges en
   3D. L'enveloppe est désormais échantillonnée **par interfrange** et non plus sur la largeur
   d'écran (cf. §Grille en x de l'enveloppe 3D) : à ajuster via `ENVELOPPE_ECH_PAR_FRANGE`
   (qualité) et `ENVELOPPE_N_MAX` (coût). La **texture d'écran** garde ses 1024 px sur les 25 cm
   entiers (0,24 mm/px, moins d'un pixel par interfrange dans le cas extrême) : son crénelage
   est traité par filtrage (`PAS_TEXTURE_M`, cf. §Anti-crénelage) et non par résolution, la
   monter coûtant quadratiquement. Peuvent être augmentées encore si besoin (coût faible désormais, cf. §Pipeline FFT) — mais
   chaque pixel/tranche coûte quand même un `cos()`, donc pas totalement gratuit pendant un
   glissement de slider (le rendu texture/enveloppe reste synchrone, non anti-rebond, sur le
   chemin mono).
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
- Onglet « Interférences en 1D » : le **mode 1D est implémenté** (`js/principe.js`) ; le **mode 2D** du
  sélecteur reste un placeholder (icône + texte « Simulation à venir »), câblé dans
  `setPrincipeMode()` en attendant son contenu — il n'affecte ni « Ondes de surface » ni
  « Ondes lumineuses ».
- Formes d'ouverture limitées à fente verticale et trou circulaire (pas de fente horizontale,
  trou carré ou fil, contrairement à `diffraction/`) — limitation assumée, cf. §Périmètre
  physique.
