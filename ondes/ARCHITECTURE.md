# Architecture — Simulations de propagation d'ondes

Page à **trois onglets** partageant un même squelette : *Corde* (onde
transversale sur une corde), *Son* (onde longitudinale dans un tube) et
*Vagues* (ondes de surface circulaires).

## Arborescence

```
ondes/
├── index.html
├── ARCHITECTURE.md         ← ce fichier
├── css/
│   └── style.css
└── js/
    ├── sim.js       état + physique — Son et Corde
    ├── tube.js      rendu canvas + interactions — Son et Corde
    ├── graph.js     graphes — Son et Corde, + chrome commun aux 3 onglets
    ├── vagues.js    état + physique + rendu + graphes — Vagues (autonome)
    └── ui.js        boucle d'animation, contrôles, onglets
```

> Tous les fichiers travaillent dans le scope global (`var`, pas de modules ES).
> **L'ordre de chargement est critique** : `sim → tube → graph → vagues → ui`.

---

## Vue d'ensemble

Les trois onglets se partagent **deux canvas uniques** (`#tube-canvas` pour
l'animation, `#graph-canvas` pour les graphes) et un panneau de contrôle dont
seule la section correspondante est affichée.

Le routage se fait par la variable globale **`activeTab`** (`'son' | 'corde' |
'vagues'`), définie dans `ui.js` et lue par `tube.js`, `graph.js` et
`vagues.js`. Chaque onglet possède son propre objet d'état — `sim`, `simCorde`,
`simVagues` — jamais mélangés ; `_activeSv()` dans `graph.js` renvoie celui de
l'onglet courant.

Changer d'onglet (`setMainTab`) bascule les sections du panneau, la box source,
les boutons au-dessus du canvas, resynchronise les boutons Balise et mode
graphe, puis provoque un resize du canvas concerné.

Le temps de simulation n'avance que pour l'onglet visible : `loop()` ne traite
que la branche correspondant à `activeTab`. Un onglet quitté se fige et reprend
là où il en était.

---

## Les trois modèles physiques

C'est le point le plus important à comprendre avant de toucher au code : les
onglets **ne suivent pas la même stratégie** de calcul du champ.

| | Vagues | Son et Corde |
|---|---|---|
| Modèle | analytique, recalculé à chaque frame | historique de la source enregistré |
| Formule | `y = f(t − r/c)` évaluée avec les paramètres **courants** | on relit ce qui a réellement été émis |
| Changer f, c en cours de route | réécrit **rétroactivement** toute l'onde présente | n'affecte que la suite de l'émission |
| Relancer la source | efface l'onde encore en vol | l'onde en vol poursuit sa route |
| Superposer deux impulsions | — (source continue) | oui |

Les trois onglets partagent la même mécanique d'historique (`_srcPush`,
`_srcDAtS`, etc., en tête de `sim.js`), au détail près de l'unité enregistrée :
centimètres pour le Son, mètres pour la Corde, pixels CSS pour les Vagues. Ce
dernier est un cas plus simple qu'il n'y paraît : sa source est **fixe** et le
milieu **isotrope**, si bien que la distance parcourue ne dépend que de `r` —
un seul historique 1D décrit tout le plan.

---

## `index.html`

Structure HTML pure, aucune logique. En CSS Grid :

- `#left-col` : `#anim-area` (box source + canvas) → `#left-splitter`
  draggable → `#graph-area` (barre de contrôle + canvas graphe)
- `#panel` : onglets Corde/Son/Vagues, sections `#section-*`, et un bandeau
  Instructions repliable par onglet (`#panel-hint-*`)

Les boutons au-dessus du canvas portent des classes `.son-only` / `.vagues-only`
qui pilotent leur visibilité selon l'onglet ; les boutons Balise sont communs
aux trois.

---

## `css/style.css`

Tout le CSS. Sections : reset et grille principale, `#anim-area`, `#source-box`,
`#tube-container`, `#left-splitter`, `#graph-area`, panneau droit
(`.panel-main-tabs`, `.btn`, `.param-row`, `.readout`), bandeau `.panel-hint`
repliable (même motif que les pages titrage et radioactivité).

**Colonne source en Vagues : overlay, pas colonne.** En `.vagues-layout` la
grille de `#anim-area` se réduit à une cellule ; `#source-col` y est **empilé
avec le canvas** (`grid-column: 1; grid-row: 1; justify-self: start;
z-index: 12`) plutôt que masqué. Il garde donc la place qu'il occupe à l'écran
dans les deux autres onglets — bord gauche, centré verticalement — pendant que
le canvas reste en pleine largeur.

Ce qui disparaît ainsi, c'est la négociation de **largeur** : la colonne ne
prend plus rien au canvas. La contrainte de **hauteur** reste entière —
`.src-hidden #source-col { display: none }` s'applique toujours, et
`_applySourceScale` rapetisse puis escamote la colonne comme ailleurs. C'est
d'ailleurs le seul endroit où `.src-hidden` et `.vagues-layout` peuvent
coexister sur le même élément : `.src-hidden` est déclaré **avant**
`.vagues-layout` pour que celle-ci garde la priorité à spécificité égale sur
`grid-template-columns`.

En vue de coupe, c'est le **contenu du canvas** qui s'écarte, pas la colonne :
`_syncCoupeLeftMargin` (vagues.js) élargit `COUPE_LEFT_MARGIN` d'après la
largeur peinte de la colonne. Rien n'est donc à animer pendant la transition.

**Échelle de la colonne source** : `#source-col` porte un
`transform: scale(var(--src-s))` et une **largeur de mise en page fixe**
(`clamp(132px, 14vw, 177px) − 12px`, indépendante du facteur), avec
`transform-origin: left center` pour que la boîte réduite occupe exactement la
colonne de grille — elle-même multipliée par le facteur, d'où la largeur rendue
au canvas. La hauteur de layout, elle, ne diminue pas : le débordement qui
subsiste n'est jamais rogné, puisque ce qui est peint est plus petit et centré.

Le facteur est posé par `_applySourceScale` (`tube.js`) d'après la hauteur
**mesurée** de `#anim-area`, pas celle du viewport, puisque le splitter la
change sans que la fenêtre bouge. Comme la mise en page interne ne dépend pas
du facteur, la hauteur naturelle de la colonne est invariante : `_srcFitFor`
calcule donc, sans rien mesurer d'autre que les hauteurs relevées une fois par
`_sourceNatural` (mémoïsées par largeur, onglet et largeur de fenêtre) :

1. **l'échelle voulue** — proportionnée à la place (`SRC_MAX_FILL` borne la part
   de la row 2 que la box peut occuper, contre l'effet de disproportion), jamais
   au-dessus de 1, jamais en dessous de `SRC_S_MIN` ;
2. **tient-elle ?** Si la box dépasse la row 2, ou si le chrono n'a plus la
   place au-dessus d'elle, `gone`.

**Le point important** : `gone` n'est **pas** ce qui décide de retirer la
colonne (`.src-hidden`) — c'est un filet de sécurité. La vraie décision est
prise en amont, par `_animHideThreshold`, qui combine en **un seul seuil** le
besoin de la colonne source (`_srcMinAnimH`, résolution analytique des mêmes
contraintes à `s = SRC_S_MIN`) et celui du tube (`_minUsefulAnimHeight`). Ce
seuil unique pilote à la fois `_snapAnimHeight` (qui escamote toute la zone
d'animation d'un coup en dessous) et `_applySourceScale` (qui retire la
colonne dans le même mouvement). Avant cette unification, les deux avaient
chacun leur propre seuil, avec une bande intermédiaire où l'un avait disparu
et pas l'autre — colonne source absente mais canvas encore visible, ou
l'inverse. `_srcFitFor` n'entre plus en jeu qu'au-dessus du seuil, où elle ne
peut par construction plus renvoyer `gone` (sinon indication d'un cas où
`#anim-area` a atteint sa hauteur par un chemin qui ne passe pas par le snap
— cf. plus bas, `clearSplitSizes`).

`_sourceNatural` retire `.src-hidden` le temps de mesurer : masquée, la colonne
mesurerait 0, serait jugée « tient partout », donc réaffichée puis remasquée
indéfiniment.

Sur grand écran la box occupe environ 35 % de la row : le facteur vaut 1 et
l'aspect d'origine est conservé au pixel près. Seule exception à l'homothétie,
le titre « Source » est masqué (`.src-tiny`) sous `SRC_S_NOTITLE`, ou dès que
récupérer sa hauteur suffit à éviter le retrait complet.

> Deux approches ont été essayées avant, et écartées. Une loi fonction de la
> seule hauteur de fenêtre : elle réduisait trop peu, trop tard, et ne
> garantissait rien — la répartition par défaut (`#anim-area` `flex: 3`) peut
> donner à la zone d'animation moins que la hauteur naturelle des boîtes, et le
> plancher du splitter ne s'applique qu'au drag. Puis un facteur multipliant une
> à une les tailles de police, marges et hauteurs : la colonne rétrécissant, les
> textes finissaient par passer à la ligne et la boîte grandissait quand on
> cherchait à la réduire — il fallait une recherche par essais mesurés pour
> compenser, et le moindre `font-size` oublié ressortait comme un élément
> refusant de rapetisser. Le `scale()` supprime les deux problèmes par
> construction.

---

## `js/sim.js` — état et physique (Son + Corde)

Chargé en premier. Contient aussi deux utilitaires partagés par tous les
fichiers :

- **`fmtFR(v, decimals)`** — séparateur décimal virgule. À utiliser pour **tout**
  nombre affiché à l'élève, DOM comme canvas.
- **`fmtSciHTML(v, decimals)`** — écriture scientifique, renvoie du HTML
  (exposant en `<sup>`) : à injecter via `innerHTML`.
- **`_cbufMake / _cbufPush / _cbufClear / _cbufIdx`** — tampon circulaire sur
  `Float32Array`, utilisé par les séries temporelles des trois onglets. Il
  remplace `push()` + `shift()`, dont le décalage en O(n) à 300 échantillons/s
  pesait lourd sur la durée.
- **`_srcPush / _srcSAtTime / _srcDAtS / _srcClear / _srcIsQuiet`** — la
  mécanique d'historique de source, décrite plus bas, partagée par les trois
  onglets. Chaque fonction prend l'objet d'état en premier argument.
  `SRC_DT` = 1/600 s, `SRC_CAP` = 40 s d'historique — largement de quoi couvrir
  la traversée du canvas en Vagues, où l'onde met ~6 s à parcourir la largeur
  quels que soient les réglages (`C_BASE_VAGUES` est recalibré au resize).

### Onglet Son — objet `sim`

Modèle à historique de source (cf. Corde plus bas pour le principe) :
`u(x,t) = d_émis(S(t) − x) · memAmplitude · exp(−α·x/L)`, la surpression étant
obtenue par différence finie `ΔP = K·(u(x−h) − u(x+h))/(2h)`.

`srcD` est enregistré **normalisé** (sans dimension) et non en pixels :
`memAmplitude` est recalibrée à chaque resize, et une amplitude figée en pixels
ne suivrait pas le redimensionnement. `srcS` progresse en centimètres
(`TUBE_LENGTH_CM` = 40).

#### Le nombre d'onde figé à l'émission

Le champ seul ne suffit pas : deux normalisations dépendent de **k**, et si on
les recalcule à partir de la fréquence courante, bouger le curseur f
redimensionne d'un coup tout ce qui est affiché — y compris la partie déjà
propagée. C'est pourquoi `stepSourceSon` range le nombre d'onde de l'instant
d'émission dans le champ auxiliaire `srcA` (en rad/cm, donc insensible aux
redimensionnements), relu ensuite avec le déplacement.

Deux consommateurs :

- **`_sonDisplayGain(k, q)`** — gain de lisibilité des colonnes. La modulation de
  densité `A·k` couvre trois décades sur les plages de curseurs : en dessous de
  `AK_MIN` (0,45) la compression serait invisible, au-dessus de `AK_CAP` (0,75)
  les colonnes se chevaucheraient. Le gain est appliqué par
  `waveDisplacementDisplay()`, réservée au rendu ; `waveDisplacement()` reste la
  grandeur physique, non pondérée.

  Ces bornes restent en retrait des valeurs d'origine (0,55 / 0,90) : le cas
  qui les rendait disgracieuses — les grandes longueurs d'onde — est pris en
  charge par le plafond absolu ci-dessous, et non plus par un serrage de la
  bande.

  **Plafond absolu.** Maintenir `A·k` dans une bande impose que l'amplitude
  affichée soit *proportionnelle à λ* : à `f = 0,5 Hz` (λ = tube entier) elle
  atteignait le tiers de la hauteur du tube et la membrane pompait de façon
  disgracieuse. `_sonDisplayGain` la borne donc en dur à `sonMaxDisplayPx()`
  = `SON_A_MAX_FRAC` (0,13) × hauteur du tube. Le contraste de densité passe
  alors sous `AK_MIN` : c'est le prix à payer, mais il ne se paie qu'aux très
  basses fréquences, où la compression s'étale sur tout le tube et reste
  lisible malgré un contraste plus doux.

  **Plancher d'aspect (`SON_H_REF_FRAC`).** Adossé à la seule hauteur, ce
  plafond faisait dépendre la physique visible d'un réglage de mise en page :
  `k` ne dépend que de la LARGEUR (`λ_px ∝ tubeLength`), donc écraser le volet
  — splitter, petite fenêtre, ouverture du graphe — divisait `ak_disp` d'autant.
  Aux réglages par défaut il tombait de 0,73 à 0,20, très en dessous d'`AK_MIN`,
  et les compressions cessaient d'être lisibles. Le mouvement de la membrane
  étant *horizontal*, ce qui doit le borner est la longueur : la hauteur retenue
  est donc `max(H, SON_H_REF_FRAC × L)`, avec `SON_H_REF_FRAC = 0,35` — le
  rapport d'aspect d'un volet non écrasé. Au-dessus de ce rapport, comportement
  inchangé au pixel près ; en dessous, l'amplitude se fige à ≈ 4,5 % de `L` et
  le contraste cesse de se dégrader.

  Le plafond ne dépendant **que de la géométrie du tube**, il est aussi ce qui
  dimensionne les zones virtuelles de `initCols` : le domaine des particules
  est devenu insensible à f, K et ρ.
- **`waveDeltaP`** — la normalisation `K·aEff·kEff` et le pas `h` de la
  différence finie utilisent eux aussi le k local.

Chaque portion de l'onde conserve donc son propre gain : après un changement de
f, les deux longueurs d'onde qui cohabitent s'affichent chacune avec un contraste
lisible, au lieu que l'ensemble du tube se dilate ou se contracte.

#### Retiré : la source « Périodique » du Son

Le Son a longtemps proposé un troisième mode de source, « Périodique » — un
signal non sinusoïdal destiné à donner des zones de compression plus
marquées. Il a été **retiré** ; la Corde conserve le sien.

Le motif y était structurellement désavantagé, parce que le Son n'affiche pas
le déplacement mais sa **dérivée** (densité des particules et graphe ΔP valent
tous deux `∂u/∂x`) :

- La pente affichée est bornée par `AK_CAP` — au-delà de 1, `x₀ ↦ x₀ + u`
  cesse d'être monotone et les particules se replient. Rendre les pics plus
  fins augmentait la pente maximale du motif, que le gain divisait aussitôt
  d'autant : **le contraste au sommet des pics ne dépendait pas de la forme
  du motif**, seulement du plafond.
- Conservation de la matière : sur une période, `∫(∂u/∂x)dx = 0`. Des
  compressions étroites ne peuvent donc déplacer que peu de gaz, et la
  détente — étalée sur tout le reste — restait pâle. Compressions marquées et
  détente creusée sont **mutuellement exclusives** à pente bornée.
- Deux calibrations du rendu, toutes deux établies sur une sinusoïde, se
  retournaient contre un motif à structure fine : le budget d'errance
  thermique (`WANDER_LAM`, indexé sur λ) valait ~40 % de la largeur d'un pic
  et le floutait, et le nombre de color-stops du voile de fond
  (14 par λ) n'échantillonnait qu'environ 1,7 point par pic.

Le retrait a permis de supprimer la mécanique du **facteur de forme** (`srcQ`,
`PERIODIC_DP_FACTOR`), qui n'existait que pour ce mode : `q` valait 1 partout
ailleurs. `_srcPush` ne range donc plus qu'une seule grandeur auxiliaire par
échantillon — le nombre d'onde `k`.

#### L'enveloppe de démarrage et d'arrêt

Une sinusoïde démarrée brutalement est continue en `u`, mais **pas en
`∂u/∂x`** — or c'est `∂u/∂x` que l'élève voit (densité des particules) et que
trace le graphe ΔP. Le tout premier lobe de compression arrivait donc avec un
bord franc et ne mesurait qu'un **quart** de longueur d'onde au lieu d'une
demie ; l'arrêt produisait la même coupure nette à l'arrière du train.

`stepSourceSon` module donc l'amplitude par une enveloppe demi-cosinus étalée
sur **exactement une période** : la source démarre et s'arrête comme un vrai
haut-parleur, dont la membrane ne peut pas accélérer instantanément. Passé
cette période, le signal est une sinusoïde pure — λ reste mesurable partout
ailleurs.

L'arrêt étant progressif, l'émission survit à `sinusoidalActive` /
`periodicActive` : c'est **`sonEmitMode`** (avec `sonEnv`, la progression de
l'enveloppe) qui dit ce qui sort réellement de la membrane, et c'est lui que
consultent la génération du signal et le facteur `dpFactor`. Rallumer pendant
l'extinction ne remet pas la phase à zéro (cf. `toggleSinusoidalSon`), sans
quoi on recréerait le saut que l'enveloppe est censée supprimer.

> Le défaut n'existait pas sur Corde — qui affiche `y`, pas sa dérivée — ni en
> mode Impulsion, dont l'enveloppe `(1 − cos)/2` démarre déjà à dérivée nulle.

| Propriété | Rôle |
|---|---|
| `simTime`, `paused`, `speedFactor` | contrôle de l'animation |
| `sourceMode` | `null` \| `'impulse'` \| `'sinus'` |
| `sinusoidalActive`, `sinPhase` | source sinusoïdale, phase accumulée |
| `impulses[]` | impulsions actives `{startTime}`, superposables |
| `srcD/srcS/srcA/srcN/srcHead/srcTNew/srcSCur/srcSeq` | historique de la membrane |
| `srcKMin` | plus petit k émis — dimensionne les zones virtuelles |
| `freq`, `rho`, `K`, `attenuation` | paramètres du milieu |
| `c_sim`, `c_cms` | célérité (px/s et cm/s) |
| `cols[]` | colonnes de particules `{x0, selected, ry}` |
| `selectionMode`, `selectionRadius` | sélection par proximité |
| `beacon1/2` | balises `{active, x, frac}` |
| `pressureColorMode` | coloriage des particules selon ΔP |
| `graphMode`, `dpxX/dpxY/dpxN/dpxSig`, `dptBuf1/2` | données graphes |

Fonctions : `updateCelerite`, `stepSourceSon`, `waveDisplacement`,
`waveDisplacementDisplay`, `waveDeltaP`, `sonIsQuiet`, `_sonDisplayGain`,
`sonMaxDisplayPx`, `particleRadius`, `initCols`, `updateDpxData`,

**`particleRadius` compense partiellement ρ.** Le rayon était volontairement
indépendant de ρ, la densité visuelle étant censée être portée par `N ∝ ρ`.
Mais l'aire occupée vaut `N·πr²`, elle aussi `∝ ρ` : le taux de remplissage
passait de ~25 % à ρ = 1 à **100 % à ρ = 4**. Le tube devenait un aplat, et
une compression n'est plus lisible dans ce qui est déjà plein — c'est ce qui
faisait disparaître les fronts d'onde aux fortes masses volumiques.

Le rayon ne dépend **que de la hauteur du tube, jamais de ρ**. Deux tentatives
ont échoué avant d'en arriver là, pour la même raison : une loi en `ρ^(−1/4)`,
puis un plafond `πr² ≤ PARTICLE_FILL_MAX × COL_SLOT_PX2/ρ`. Toute dépendance
en ρ, même à sens unique, est le même défaut vu à l'envers — un rayon qui
rétrécit quand ρ monte est un rayon qui *grossit* quand ρ descend, et voir une
parcelle de fluide enfler parce que le milieu se raréfie n'a aucun sens.

Le rayon est donc dimensionné une fois pour toutes sur le cas le plus
défavorable, `ρ = RHO_MAX_UI` (à tenir synchronisé avec le max du curseur dans
`index.html`).

**`particleSlotPx2` : la grille suit le rayon.** `COL_SLOT_PX2` est une
constante en pixels, alors que le rayon, lui, suit la hauteur du tube : le
remplissage `φ = πr²ρ/slot` dépendait donc de `H` comme `r²`. Un tube écrasé
(petite fenêtre, ou graphe affiché) contenait le même nombre de points par px²
mais des points bien plus petits, d'où un gaz visuellement beaucoup trop
raréfié. L'aire de case allouée à une particule suit donc `πr²` : la grille se
resserre exactement dans le rapport où le rayon diminue, et `φ` ne dépend plus
que de `ρ`. Au rayon de saturation la formule redonne `COL_SLOT_PX2` — le
calibrage historique des tubes hauts est intact.

**Le rayon varie en `√H`, pas en `H`.** La case suivant `πr²`, on a
`N = domaine × H × ρ / (πr²ρ_max/φ_max)`. Une loi `r ∝ H` — ou un simple
plancher, qui revient à figer `r` — laisse `N ∝ H` : le taux de remplissage
est bon, mais le tube écrasé contient réellement **moins de molécules**, il
semble s'être vidé. Avec `r = rSat·√(H/H_ref)`, la case vaut
`COL_SLOT_PX2·H/H_ref`, le facteur `H` se simplifie et
`N = domaine × ρ × H_ref / COL_SLOT_PX2` : **ni la densité ni l'effectif ne
dépendent plus de la hauteur du tube**, seule l'échelle du dessin change.
`H_ref ≈ 192 px` est la hauteur où l'ancienne loi `H × 0,018` atteignait
`rSat` — au-delà, rendu strictement inchangé. `N` étant plafonné par sa valeur
à `H_ref`, aplatir le tube ne peut pas faire exploser le compte : le plafond
de 8000 de `initCols` joue exactement au même moment qu'avant. Le plancher
résiduel de 1,6 px est purement une garantie de lisibilité (tube < 41 px).

**Où placer `PARTICLE_FILL_MAX` ?** « Ne pas saturer » ne dit pas *où* se
placer, et la valeur d'origine (0,50) plaçait le nuage beaucoup trop bas. Dans
un semis aléatoire de taux de remplissage `φ`, la couverture perçue vaut
`C = 1 − e^(−φ)` ; une compression de taux `ak` porte localement `φ` à
`φ/(1−ak)`, une détente à `φ/(1+ak)`, et ce qui se **voit** est l'écart
`ΔC(φ) = e^(−φ/(1+ak)) − e^(−φ/(1−ak))`. Nul aux deux bouts — nuage vide,
nuage saturé — il est maximal vers `φ ≈ 0,9` à `ak = 0,45` (le régime courant,
cf. `AK_MIN`). Or l'ancien réglage donnait `φ = 0,167` à ρ = 1 : on travaillait
à un cinquième de l'optimum, et le contraste perdu là ne se rattrape par aucun
fond ni aucune couleur.

`PARTICLE_FILL_MAX = 1,00` porte le remplissage de 0,17 (ρ = 0,5) à 1,00
(ρ = 3), et l'écart de couverture compression/détente de 0,15 à 0,25 aux
réglages par défaut — il double, à géométrie et à physique inchangées. La
crainte de l'aplat ne se vérifie pas à cette valeur : à ρ = 3 la couverture
vaut 50 % en détente contre 84 % en compression. Le nuage est dense mais reste
modulé — c'est `φ = 2` ou 3 qui aplatirait.

La fenêtre de `base` (le rayon « esthétique » tiré de la hauteur du tube) suit
`PARTICLE_FILL_MAX` : la laisser à son ancien calibrage `1,5 … 3,0 px` en
aurait fait la borne active, le rayon aurait plafonné à 3,0 px au lieu des
3,46 px visés, et les deux tiers du gain seraient restés sur la table.

`updateDptData`, `pruneImpulses`, `resetAnim`, `selectNearbyParticles`.

**`initCols` ne reconstruit qu'en cas de nécessité.** Reconstruire, c'est
retirer aux particules leur position de repos, donc effacer la sélection de
l'élève — ce qui arrivait à chaque `input` des curseurs f, ρ et K, et à chaque
resize. Une signature `L|H|N` court-circuite désormais l'appel quand rien de
géométrique n'a bougé (cas de f et K, le domaine ne dépendant plus d'eux) ; et
quand la reconstruction est inévitable (ρ, resize), la sélection est relevée
sous forme d'intervalles de `x0` **en fraction de `colsL`** puis réappliquée,
si bien qu'elle se transpose à la nouvelle largeur.

> `stepParticles` et `rescaleThermalVelocities` sont des **no-op** conservés
> pour compatibilité : le modèle en colonnes n'intègre pas de vitesses.

### Onglet Corde — objet `simCorde`

**Toute la physique est en unités réelles** : mètres, m/s, centimètres. Aucune
grandeur physique n'est exprimée en pixels, si bien qu'un redimensionnement de
la fenêtre ne déforme pas l'onde en vol. `cordeDisplacement()` **retourne des
centimètres** ; la conversion à l'écran n'a lieu qu'au tracé, via
`simCorde.pxPerCmAmpl`.

Constantes : `CORDE_LENGTH_M` (5 m), `CORDE_AMPL_CM_MAX` (5 cm) et
`CORDE_Y_AXIS_CM` (demi-étendue **fixe** de l'axe y des graphes). `SRC_DT` et
`SRC_CAP` sont partagés avec l'onglet Son.

#### Le modèle à historique de source

Deux tampons circulaires parallèles, remplis à pas fixe par `stepSourceCorde()` :

- **`srcD`** — déplacement émis par le pot vibrant (cm)
- **`srcS`** — abscisse curviligne cumulée `S(t) = ∫ c dt` (m), soit la distance
  totale parcourue depuis `t = 0` par un front parti à `t = 0`

La lecture inverse cette relation : un point situé à la distance `x` lit
l'échantillon dont le `S` vaut `S(t) − x`.

```
y(x, t) = d_émis( S(t) − x ) × exp(−α·x/L)
```

`_srcSAtTime(s, t, c)` interpole `S` (et l'extrapole au-delà du dernier échantillon,
pour le point « vivant » des graphes) ; `_srcDAtS(s, sT)` inverse `S` par
dichotomie, puisqu'elle est croissante. Un `sT` antérieur au plus ancien
échantillon renvoie 0 : c'est ce qui produit naturellement le front d'onde et
le comportement « corde semi-infinie, aucune réflexion ».

**Ce que ce modèle garantit** — et que l'ancien `d(t − x/c)` ne garantissait pas :

- une onde déjà émise ne peut plus être ni modifiée ni effacée ;
- changer T ou μ accélère l'onde présente **sans déformer sa longueur d'onde**,
  et le vibreur émet ensuite `λ′ = c′/f` : deux longueurs d'onde cohabitent
  alors sur la corde, ce qui est la physique correcte d'un changement de milieu
  *temporel* (à l'inverse d'un changement *spatial*, où c'est f qui se conserve) ;
- la phase du sinus est **accumulée** (`sinPhase += 2π·f·dt`), donc changer f ne
  crée aucun saut de phase ;
- les impulsions se **superposent**.

`cordeIsQuiet()` indique que plus rien n'est émis et que la dernière
perturbation a eu le temps de traverser la corde — sert à décider si la fenêtre
du graphe y(t) peut être réinitialisée sans tronquer une courbe en cours.

Autres fonctions : `updateCeleriteCorde` (`c = √(T/μ)`), `updateYxData`
(snapshot y(x), en cm, avec signature anti-recalcul), `updateYtData`
(enregistrement aux balises), `pruneImpulsesCorde`, `resetAnimCorde`.

---

## `js/tube.js` — rendu canvas et interactions (Son + Corde)

### Son

`resizeTube()` recalibre `C_BASE` puis réinitialise les colonnes. `drawTube()`
dessine fond, membrane, colonnes, balises, règle graduée.

**La bande basse se réserve la place de ses textes.** Elle valait `h × 0,12`,
alors que la police de la règle et des positions de balises a un plancher de
lisibilité (13 px) qui, lui, ne rapetisse pas : en dessous de `h ≈ 145 px` —
splitter tiré vers le haut pour agrandir le graphe — les étiquettes
réclamaient plus que la bande et le bord du canvas les coupait net. La bande
vaut donc `clamp(h × 0,12, RULER_BAND_MIN_PX, h × 0,34)` : identique au pixel
près sur grand écran, plancher égal au besoin réel (`tick + 1 + police`),
plafond au tiers de la hauteur pour que le tube reste le sujet. Symétriquement,
`_drawTubeRuler` et `_drawOneBeacon` calent leur police sur la place
*restante* sous les ticks et **taisent** les étiquettes en dessous de
`RULER_FONT_MIN` — une règle réduite à ses ticks vaut mieux qu'une rangée de
chiffres tronqués. Le seuil de dessinabilité du tube passe de 28 à
`MIN_TUBE_CANVAS_H` = 37 px (`0,66 h − 4 ≥ 20`), et remonte jusqu'au splitter
via `_minUsefulAnimHeight`. Le tab **Corde** partageant le canvas, la bande et
les plancher de police, il avait le défaut à l'identique : `resizeCorde`,
`_drawCordeRuler` et les positions de balises corde appliquent exactement les
mêmes constantes.

**`C_BASE` ne doit dépendre d'aucune valeur par défaut.** `c_sim` (px/s) est
tenu d'être *exactement* la conversion en pixels de `c_cms`, sans quoi tout ce
qui exprime une longueur d'onde en pixels — au premier rang la flèche λ — est
faux d'un facteur constant :

```
c_sim = c_cms × (L_px / L_cm) = c_norm × C_DISPLAY_FACTOR × L_px / TUBE_LENGTH_CM
⟹ C_BASE = C_DISPLAY_FACTOR × L_px / TUBE_LENGTH_CM = L_px / 4
```

La formule employée auparavant, `L_px / (2 × √(K_DEFAULT/RHO_DEFAULT))`, ne
donnait cette valeur **que par coïncidence** : elle suppose
`√(K_DEFAULT/RHO_DEFAULT) = 2`, vrai avec `K_DEFAULT = 4` seulement. Relever
`K_DEFAULT` à 6 a donc raccourci la flèche λ d'un facteur `√6/2 ≈ 1,22`, dans
tous les modes de source. La propagation, elle, n'était pas touchée : elle se
calcule en centimètres, via `c_cms` — d'où un défaut purement d'affichage, et
d'autant plus déroutant.

> Piège à retenir : une constante calibrée sur une valeur par défaut est une
> bombe à retardement dès que cette valeur bouge. Le temps de traversée du
> tube est maintenant une *conséquence* (4/c_norm, ~1,6 s par défaut) et non
> une contrainte imposée.

**Deux fonds intérieurs, jamais superposés.** Le bouton « Colorier selon la
pression » donne la palette pastel signée de `_drawTubePressureBg`, qui code
ΔP dans les deux sens. Sinon, `_drawTubeDensityBg` pose un **voile bleu de
densité**, dans la couleur même des particules (`#2a6aaa`), sous les seules
zones de forte compression.

Ce voile ne code pas une grandeur de plus : il redit ce que les particules
disent déjà — « il y a du monde ici » — mais en aplat, donc lisible d'un coup
d'œil et sans légende. D'où son caractère **unilatéral** : ne teinter que les
compressions laisse les détentes se lire d'elles-mêmes comme les zones restées
claires, au lieu d'introduire un second code couleur concurrent.

**Le dosage suit le pire de DEUX manques.** « Discret » ne vaut que tant que
les particules font le travail, et elles échouent pour deux raisons
indépendantes, aux deux **bouts** de la plage de réglages.

*Manque de résolution*, aux petites λ (`_densTightLam`) : à λ = 45 px une
bande de compression fait 22 px, soit deux espacements à peine — aucun réglage
d'amplitude n'y changera rien. Le voile, lui, est un champ **continu** : il
résout parfaitement ces échelles. Il s'appuie donc à mesure que λ rétrécit
(teinte 0,14 → 0,22).

Ses bornes sont exprimées **en espacements et non en pixels**
(`DENS_LAM_*_SP`, converties par `_densGrainPx`). Elles ont d'abord été des
pixels absolus — 140 px et 45 px — calés sur ce que le nuage savait montrer à
ρ = 1 : sans le dire, c'était déjà une mesure du grain, mais figée à une seule
valeur de ρ. Or le grain suit ρ, l'aire par particule valant
`COL_SLOT_PX2/ρ` : l'espacement moyen vaut 10,6 px à ρ = 1, mais **15,0 px à
ρ = 0,5 et 6,1 px à ρ = 3**. Un nuage dense résout des bandes deux fois plus
fines qu'un nuage clairsemé, et des bornes en pixels absolus l'ignoraient — le
voile s'appuyait autant sur un nuage qui n'en avait pas besoin qu'il
s'abstenait sur un nuage incapable de suivre. Les valeurs (13,2 et 4,2)
reprennent exactement les anciennes à ρ = 1 : rien ne change au réglage par
défaut, seule la réponse au curseur ρ apparaît.

*Manque de contraste*, aux grandes λ (`_densTightAk`) : le déplacement affiché
est plafonné par `sonMaxDisplayPx()`, donc `ak_disp = min(clamp(A·k, AK_MIN,
AK_CAP), sonMaxDisplayPx()·k)` s'écrase quand λ grandit. À f = 0,5 Hz le
rapport de densité tombe à 1,17 — les particules sont parfaitement résolues et
ne montrent rien. Ce cas n'était **pas traité** : le voile s'y allumait (ΔP
atteint bien ±1, cf. plus bas) mais à sa teinte *minimale*, précisément là où
il aurait dû porter le plus. Se déclencher n'est pas se doser, et la nuance a
longtemps masqué le défaut.

**Chaque arm sa variable : le contraste porte `H`, la résolution porte `ρ`.**
Le critère de résolution complet serait le comptage — une bande `λ/2 × H`
contient `n = (λ/2)·H·ρ/COL_SLOT_PX2` particules, de bruit relatif `1/√n` —
ce qui ferait aussi dépendre l'arm de la hauteur du tube. On s'en garde
délibérément : la hauteur est déjà l'affaire de l'autre arm, puisque
`ak_disp ≤ 0,817·H/λ`. Écraser le volet d'animation avec le splitter fait donc
déjà monter le renfort par la voie du contraste ; le faire monter une seconde
fois par la voie de la résolution le compterait deux fois — même écueil que
l'atténuation, écartée de `sonDisplayAkAt` pour la même raison.

Le dosage retenu est le **maximum** des deux manques. L'arm de contraste est
ancrée sur `AK_MIN` — la valeur en dessous de laquelle le code considère déjà
le contraste comme insuffisant — donc elle ne contribue rien aux réglages par
défaut et au-dessus (`ak_disp` ≈ 0,445 ≈ `AK_MIN`), et plafonne au même
`DENS_TINT_HI`. **L'intensité maximale du voile est inchangée** : il devient
seulement atteignable dans un cas où il ne l'était pas.

Les deux transitions sont lissées (smoothstep), sans quoi le fond changerait
visiblement d'aspect au franchissement d'un seuil du curseur f.

**La mesure de contraste est locale.** `sonDisplayAkAt` lit `ak_disp` dans
l'**historique**, à l'abscisse du color-stop — comme le gain d'affichage
lui-même. Si f a bougé en cours de route, le tube contient des portions d'onde
de nombres d'onde différents : chacune reçoit alors le renfort qui lui manque,
au lieu d'un dosage global calé sur ce que la source émet en ce moment.
L'atténuation n'entre volontairement pas dans `sonDisplayAkAt` : elle réduit
déjà ΔP dans les mêmes proportions, et la compter deux fois surdoserait.

**Le renfort reste volontairement modeste.** Un réglage plus appuyé a été
essayé (teinte 0,42, genou abaissé à 0,22 pour élargir les bandes) : il se
dénonçait immédiatement comme un **artefact**. Un aplat de couleur uniforme ne
ressemble pas à « beaucoup de particules au même endroit », il ressemble à un
rectangle peint — d'autant plus qu'on l'appuie. La limite est structurelle et
non affaire de dosage : c'est pourquoi le genou reste **haut** même en régime
serré (0,55 → 0,45 seulement). Ne marquer que les cœurs de compression donne
des taches douces et isolées, un halo qui se lit comme un effet du milieu ;
un genou bas donnait des bandes régulières, qui se lisent comme un décor.

> Aller plus loin sur les très petites λ demanderait de faire porter
> l'information par **les particules elles-mêmes** plutôt que par le fond —
> par exemple en les dessinant semi-transparentes, l'accumulation dans les
> zones comprimées devenant alors émergente au lieu d'être codée. Cela
> impose un `fill()` par particule au lieu des deux passes groupées
> actuelles, d'où un coût sensiblement plus élevé aux fortes densités.

Le **nombre de color-stops suit λ** lui aussi (~14 par λ, borné à
[`N_PRESSURE_BANDS`, 1400]) : à 300 stops sur 900 px, une λ de 55 px n'en
recevrait que 3 par alternance et le dégradé rendrait un moiré au lieu des
bandes.

> C'est aussi pourquoi le curseur **K démarre à 2,0 et non 0,5** : en dessous,
> combiné à ρ maximal et f maximale, λ tombait sous le centimètre sur un tube
> de 40 cm — 56 longueurs d'onde à l'écran, sous la résolution du nuage comme
> du voile.

Deux détails qui comptent :

- le genou est **adouci par un smoothstep** et non appliqué
  comme un seuil franc — un seuil net sur un champ continu crée des bords qui
  glissent le long du tube au passage de l'onde, et cela se voit comme un
  artefact ;
- `waveDeltaP` étant normalisée sur l'amplitude **physique** et non sur le
  gain d'affichage, le voile se déclenche à pleine force même aux basses
  fréquences — là où le plafond de `sonMaxDisplayPx()` bride le mouvement
  visible et où le regroupement des particules est le moins net. C'est le
  dosage, et non le déclenchement, qui manquait là : cf. `_densTightAk`.

**Le fond part de la face réelle de la membrane** (`_sonTubeFillLeft` =
`tubeLeft + min(0, disp)`) et non de `tubeLeft`, dans les deux fonds comme
dans le remplissage à plat. Quand la membrane recule, elle découvre entre sa face et
`tubeLeft` une bande qui appartient bel et bien à l'intérieur du tube :
peindre à partir de `tubeLeft` y laissait apparaître le fond général du canvas
— c'était la bande blanche visible en mode pression (invisible en mode normal,
les deux crèmes étant presque identiques).

Dans cette bande, `x_px` devient négatif, et **`waveDeltaP` ne peut pas y être
appelée telle quelle** : c'est une différence finie, et pour un `x` négatif ses
deux points de calcul `u(x−h)` et `u(x+h)` tombent tous deux au-delà du dernier
échantillon émis. `_srcSampleAtS` les écrête à la *même* valeur, dont la
différence vaut exactement zéro. Ce zéro produisait une bande neutre large de
`|disp| − h` (près de 20 px) plaquée contre la membrane, d'autant plus visible
que l'excursion était grande — donc précisément aux très grandes longueurs
d'onde. `_sonBgDeltaP` écrête donc `x` à 0, ce qui y met la pression de la face
de la membrane : c'est aussi la valeur juste, ce fluide étant celui que la
membrane vient d'emmener avec elle, dans son état de compression.

**La membrane suit exactement les particules** : `_sonMembraneDisp()` renvoie
`waveDisplacementDisplay(0, t)`, ni plus ni moins — c'est la particule en
`x0 = 0`. L'ancien `min(|uDisp|, |uPhys|)` la bridait pour éviter le « boost »
basse fréquence, mais les particules, elles, suivaient `uDisp` : quand le gain
amplifiait, elles partaient à droite plus loin que la membrane et ouvraient
devant sa face un vide que rien ne peignait. L'amplitude excessive qui motivait
ce bridage est traitée à sa source, par le plafond de `sonMaxDisplayPx()` —
lequel s'applique au gain d'affichage, donc au fluide **et** à la membrane
ensemble.

**Agitation thermique** : chaque particule garde SA hauteur, tirée une fois
pour toutes à la création (`ry`) ; l'agitation est une errance **2D** autour
d'elle (`wx`, `wy` — marche aléatoire bornée avec rappel, cf. `_wander`).
L'ancien code réaffectait `ry = Math.random()` à chaque frame : ce n'était pas
une agitation thermique mais un ré-échantillonnage complet du nuage, un
scintillement à 60 Hz qui brouillait la lecture des compressions et rendait
impossible le suivi d'une particule — donc l'essentiel de l'intérêt de la
sélection.

La calibration est le point délicat : une marche de pas σ parcourt σ√n en n
frames, on déduit donc le pas de l'excursion voulue (`_wanderAmp`, ~4,5 % de
la hauteur du tube) et du temps qu'on veut y mettre (~25 frames). Le premier
réglage essayé, dix fois plus discret, donnait un gaz visuellement figé. À
l'inverse, le pas doit rester inférieur au rayon d'une particule, faute de
quoi on retombe sur du scintillement.

**L'errance est isotrope.** Elle a longtemps été franchement **anisotrope** :
amplitude pleine en vertical, bridée à une fraction de λ en horizontal, au
motif que le vertical est « gratuit » (déplacer une particule de haut en bas
ne change rien à la densité lue le long du tube) alors que l'horizontal
« floute » la structure. Le rapport atteignait **3:1** aux réglages par défaut
et 5:1 en haut de la plage de fréquence — et ça se voit : une agitation trois
fois plus ample en hauteur qu'en largeur n'est pas lue comme de l'agitation
thermique, elle est lue comme de la **pluie**. L'œil est très sensible à
l'anisotropie d'un mouvement brownien.

Le motif ne tenait pas, pour deux raisons superposées :

- *« l'errance fabrique des amas parasites »* — non : chaque particule erre
  **indépendamment** de ses voisines, une telle marche ne peut pas créer
  d'amas, elle ne fait que flouter (un déplacement indépendant laisse
  d'ailleurs un processus de Poisson inchangé) ;
- *« le flou horizontal dissout les bandes »* — beaucoup moins qu'estimé : sur
  une sinusoïde de longueur d'onde λ, une errance d'écart-type σ réduit le
  contraste d'un facteur `exp(−2π²σ²/λ²)`, soit **2 % à σ = λ/30** et 5 % à
  σ = λ/20. Le budget horizontal était bien plus large que ce qu'on lui
  accordait.

Le réglage se pose donc à l'envers de l'ancien : **une seule amplitude pour
les deux axes**, fixée par un budget de flou explicite — `σ ≤ λ/52`
(`WANDER_LAM`), l'écart-type stationnaire étant visé directement et le pas par
frame déduit de `σ_pas = σ_stat·√(2·pull)` (`_wanderSigma`, `_wanderStep`).
C'est **exactement le réglage du gaz de l'onglet Principe des interférences**
(`_prinGazWander`) : mêmes constantes, même calibration. Ce qui masque le
mouvement d'ensemble du gaz n'est pas l'amplitude de l'errance mais son **pas
par frame**, à comparer à la vitesse de l'onde ; on baisse donc à la fois
l'amplitude et le rappel (`WANDER_PULL = 0,014`, relaxation ≈ 71 frames), et
le gaz reste vivant sans scintiller. L'errance est exactement isotrope ; elle
ne se resserre qu'en haut de la plage de fréquence, où λ devient petite — et
le nuage s'y calme sur les **deux** axes, ce qui est cohérent à l'œil et
profite en prime à la lecture des bandes, devenues fines. `WANDER_MIN` empêche
le gaz de figer tout à fait.
L'errance n'entre pas dans la sélection, qui travaille sur `x0`.

L'errance est ramenée dans la bande **à l'affichage** et non en lui réservant
sa place dans la bande utile : lui réserver l'excursion maximale laissait le
gaz flotter entre deux marges vides, alors qu'une particule a le droit d'aller
toucher la paroi.

**Rebond, pas écrasement** (`_foldY`). L'errance a un écart-type stationnaire
σ de quelques px, avec des excursions bornées à 3σ : une particule proche
d'une paroi en sort régulièrement. Un simple *clamp*
sur `yMin`/`yMax` ne les faisait pas disparaître, il les **empilait** sur deux
droites — le tube se bordait de deux liserés sombres, permanents et
insensibles à ΔP, qui consommaient une part appréciable de l'encre disponible
sans rien dire de l'onde. Le repliement (triangle itéré, pour tenir même quand
la bande est plus courte que l'excursion) rend la position à l'intérieur de la
bande, ce qui est aussi la bonne image physique : une molécule qui atteint la
paroi rebondit, elle ne s'y colle pas.

**Sélection de particules par proximité** : clic simple = remplace la sélection,
Ctrl+clic = ajoute, Maj+clic = retire, dans un rayon `selectionRadius`
proportionnel à la densité des colonnes (recalculé dans `initCols`). Le mode est
exclusif du coloriage par pression : activer l'un désactive et grise l'autre.

Le clic désigne une particule **telle qu'elle est affichée** :
`selectNearbyParticles` reçoit l'abscisse écran, balaie les colonnes pour
trouver l'affichée la plus proche (O(N), une fois par clic), et sélectionne
ensuite le paquet autour de **son `x0`**. Comparer directement le clic à `x0`,
comme on le faisait, revenait à ignorer le déplacement de l'onde : on cliquait
sur un paquet et on en sélectionnait un autre, décalé de `u(x0)` — précisément
quand l'onde est la plus ample. Le paquet reste défini sur `x0` et non sur la
position affichée, pour que ses membres restent solidaires quand l'onde les
déplace.

### Corde

- `resizeCorde()` — géométrie de la zone, échelle verticale, positions des
  balises depuis leur `frac`, `C_BASE_CORDE = cordeLength / CORDE_LENGTH_M`
  (ce facteur ne sert plus qu'à exprimer λ en pixels pour calibrer la finesse
  du tracé — la propagation, elle, se calcule en mètres).
- `_recalcCordeScale()` — échelle cm → px. L'amplitude maximale du curseur
  occupe `CORDE_AMPL_FRAC` (45 %) de la demi-hauteur. Ce plafond laisse de la
  marge : deux impulsions émises à moins de `T_IMPULSE` d'intervalle se
  superposent et atteignent le double, soit 90 %. Le facteur **ne dépend pas**
  de l'amplitude courante, sans quoi toutes les amplitudes s'afficheraient à
  la même taille.
- `_cordeAttachY()` — **source de vérité unique** du point d'accroche de la
  corde sur le pot vibrant, partagée par `_drawCordeWire` et `_drawShaker`.
  Tant que chacun calculait son y avec ses propres bornes, une excursion ample
  pouvait les désolidariser visuellement.
- `_drawCordeWire()` — le chemin est construit dans un **`Path2D`** (avec repli
  si indisponible) : contrairement au chemin courant du contexte, figé dès sa
  construction, un `Path2D` est transformé au moment du tracé, ce qui permet de
  le réutiliser tel quel pour le passage d'ombre décalé, sans recalculer un
  seul point. Pas de `shadowBlur` : sur un chemin de plusieurs milliers de
  points, le flou coûte bien plus cher que le tracé lui-même.
- `_drawCordeBeads()` — aspect **Discret** (`simCorde.aspect`, réglé par
  `setCordeAspect` dans `ui.js`) : la corde devient un chapelet de points
  matériels espacés de `CORDE_BEAD_STEP_M` (10 cm, soit 51 points sur 5 m),
  reliés par de petits liens. Rien ne change côté physique ni côté graphes —
  c'est un pur choix de rendu, destiné à faire voir que chaque point ne fait
  qu'osciller verticalement en reproduisant, avec retard, le mouvement de son
  voisin de gauche. Le rayon des sphères vient de `cordeBeadR()`,
  indexé sur μ et sur l'espacement entre points.
  Le point d'indice 0 n'est jamais dessiné dans cette fonction (le clip de
  zone le couperait en deux) : il est tracé en fin de scène, hors clip, par
  `_drawCordeFreeHandle()` en mode Libre (la poignée attrapable le remplace)
  et par `_drawCordeFirstBead()` sinon.
- `snapCordeBeaconX()` / `snapCordeBeacon()` — en aspect Discret, une balise
  se cale sur le point matériel le plus proche (elle ne peut pas se poser sur
  un lien). Appelés au drag, au resize, à l'activation d'une balise et au
  passage Continu → Discret. En aspect Continu, sans effet.

### Interactions communes

`initTubeInteractions` gère le drag des balises (Son et Corde, hit-test sur x à
±10 px) et la sélection de particules (Son). Sur Corde, prendre ou lâcher une
balise vide son tampon y(t) : les points antérieurs ne décrivent plus le même
point de la corde.

`initSplitter` gère le drag ; les bornes viennent de `_splitBounds`. Il n'y a
**pas de plancher** : la zone d'animation peut être réduite à zéro et le graphe
occuper toute la colonne. `hideBelow` (`_animHideThreshold`, cf. plus haut)
n'est pas une borne mais un seuil de bascule, en dessous duquel
`_snapAnimHeight` escamote toute la zone d'un coup — boîte source et canvas
ensemble, jamais l'un avant l'autre, puisque c'est le même seuil qui pilote
les deux. Le drag et `applySplitFrac` passent tous deux par ce même
escamotage, et une fraction de 0 est une valeur mémorisable comme une autre.

**Réapparition depuis l'état escamoté** : suivre le pointeur au pixel près
depuis une hauteur de 0 obligerait à glisser sur toute la valeur de
`hideBelow` (potentiellement 100-200 px) avant que quoi que ce soit ne bouge à
l'écran — le splitter paraît alors ne pas répondre. `REVEAL_GRAB_PX` (24 px)
introduit une exception dans le `pointermove` : depuis 0, un petit geste suffit
à faire réapparaître la zone d'un coup à `hideBelow`, après quoi le pointeur
reprend le contrôle au pixel près, sans discontinuité (c'est exactement ce que
`_snapAnimHeight` aurait donné à cette position). `_setAnimCollapsed` pose en
parallèle `.anim-collapsed` sur `#left-col`, qui élargit vers le bas la zone
cliquable du splitter (`::after` en position absolue, sans repousser
`#graph-area`) — collé au bord supérieur sans rien pour le distinguer, il
serait sinon difficile à attraper précisément sur ses seuls 6 px de haut.

Le chronomètre, posé en absolu au-dessus de la box source, a le droit de
déborder dans la rangée 1, vide côté colonne 1 (`#anim-source-spacer`) — sa
hauteur n'est donc réservée qu'une fois, et non des deux côtés de la box
centrée.

La position réglée est mémorisée en **fraction** de l'espace partageable
(`splitFrac`, persistée en `localStorage` sous `ondes.splitFrac`) et appliquée
par `applySplitFrac` en **flex-grow** sur les deux zones : elle survit alors au
resize de la fenêtre sans recalcul. Les hauteurs en pixels ne servent que
pendant le drag. `applySplitFrac` est rappelée au resize, au changement
d'onglet et à la bascule du graphe ; quand le graphe est masqué (`.graph-hidden`,
onglet Corde) elle efface les styles inline via `clearSplitSizes` — sans quoi
une hauteur héritée d'un drag figerait `#anim-area` et laisserait une bande vide
sous l'animation.

---

## `js/graph.js` — graphes

Trois modes par onglet : `'dpx'` (spatial), `'dpt'` (temporel), `'both'`
(simultané, deux demi-largeurs séparées par un filet).

`drawGraph()` aiguille vers Vagues, Corde ou Son. Le décor (fond, grilles,
axes, étiquettes) est **mis en cache dans un canvas hors écran** par
`_drawGraphChrome`, réinvalidé par une clé qui résume la géométrie ; seules les
courbes sont redessinées à chaque frame.

**`graphView` est une sortie, pas une entrée** : chaque fonction de tracé y
inscrit les bornes qu'elle vient d'appliquer, à l'usage du réticule et du
survol snappé. Les bornes elles-mêmes sont recalculées à chaque frame.

- Corde : axe y **fixe** à `±CORDE_Y_AXIS_CM`, jamais calé sur l'amplitude
  courante — sinon l'axe se redimensionnerait exactement comme la courbe et le
  curseur Amplitude semblerait sans effet. Axe x en mètres pour y(x), fenêtre
  cyclique de 5 s pour y(t).
- Son : axe y `±1,12`, axe x en cm (40 cm de tube).
- La marge gauche est alignée sur la position de la membrane / du pot, pour
  que l'origine du graphe tombe sous la source (`_syncLeftMarginWithTube`,
  `_syncLeftMarginWithCorde`). En mode simultané cet alignement n'a plus de
  sens, les deux graphes n'occupant pas la pleine largeur.

Outils : `toggleGraphCursor()` (réticule libre) et le survol snappé, qui
accroche le point de courbe le plus proche du curseur.

---

## `js/vagues.js` — onglet Vagues (autonome)

Champ scalaire 2D échantillonné sur une grille, rendu par blocs de `BLOCK_V`
pixels, avec cache reconstruit à la demande (`_rebuildVaguesFieldCache`).

```
y(r, t) = A · d_émis(S(t) − r) × enveloppe(r)
```

avec `c = √(g·h)`, `S(t)` la distance cumulée par le front et `d_émis` le
déplacement lu dans l'historique de la source (cf. `stepSourceVagues`). La
source est **fixe au centre du canvas** (`resizeVagues`) et n'est pas
déplaçable ; le champ ne dépend donc que de `r`.

L'**enveloppe causale** n'est plus une condition à part : au-delà du front,
l'historique n'a rien à donner et renvoie 0 de lui-même. `_vaguesFrontR()` en
lit le rayon (la distance couverte par l'historique) pour les rendus qui ont
besoin de savoir où s'arrête l'onde.

### Box source

Même gabarit que les deux autres onglets : bouton **Activer** et sélecteur de
mode (`#source-vagues`), avec les curseurs de fréquence et d'amplitude dans la
box — ce sont des réglages de la source, pas du milieu, et ils ont donc quitté
le panneau de droite, dont la section « Source » a disparu. Deux modes,
`Impulsion` et `Sinusoïdale`, cette dernière sélectionnée par défaut : c'est la
houle continue qui fait l'identité de l'onglet.

Comme au Son, `sourceMode` décrit l'**émission en cours** et non le mode choisi
dans le sélecteur — que lit `_vaguesSourceMode()`. Le bouton Activer reflète
l'état de la source elle-même : en impulsion il s'éteint dès qu'elle a fini son
mouvement (`sourceActiveUntil`, un `T_IMPULSE` après l'appui), bien avant que la
crête n'ait atteint le bord. Il est réévalué à chaque frame, comme côté Corde.

Chaque appui en mode Impulsion envoie une **nouvelle** crête : celles qui
parcourent déjà le bassin poursuivent leur route et se superposent dans
l'historique. `pruneImpulsesVagues` les oublie une fois qu'elles ont fini d'être
émises **et** de sortir du champ — la diagonale du canvas est la plus grande
distance qu'elles aient à parcourir.

#### Ce qui se verrouille en mode Impulsion

Une impulsion n'a **ni période ni longueur d'onde**. Tout ce qui en suppose une
se verrouille dès que le mode est choisi dans le sélecteur — donc sur
`_vaguesModeIsImpulse()` (jumeau de `_sonModeIsImpulse`), qui lit le sélecteur
et **non** `sourceMode`, lequel ne reflète que l'émission en cours :

| verrouillé | par |
|---|---|
| curseur f | `_applySourceModeVagues` |
| flèche λ (et son drag, gardé par `lambdaVisible`) | `_syncLambdaBtnStateVagues` |
| readout étendu (f, T, λ) | `_syncWavePropsBtnStateVagues` |
| trajectoires des molécules d'eau | `syncBtnOrbitesVagues` |
| unité T du chronomètre | `CHRONO_DEFS.vagues.noPeriod` |

Chacun *éteint* aussi l'option si elle était active, plutôt que de laisser un
affichage faux à l'écran. Les orbites méritent leur place ici pour une raison
propre : elles sortent de la théorie d'Airy, qui suppose une onde
monochromatique — un `k = 2πf/c` unique, que l'historique ne garantit plus.

#### Forme de l'impulsion — pourquoi un creux

`d(τ) = sin(2πτ/T) × (1 − cos(2πτ/T)) / 2`, normalisée par `IMPULSE_V_NORM`
(= 8/3√3, l'inverse de sa crête, atteinte en 2π/3). Elle part de 0 avec une
pente nulle, monte en crête, redescend en creux et revient à 0 — **de moyenne
nulle**.

Le creux n'est pas décoratif. La source monte puis **revient à sa position de
repos** : elle n'injecte aucun volume d'eau net, et une onde purement positive
ferait donc apparaître de l'eau venue de nulle part. Une vraie vague solitaire
— le soliton de Russell — *est* bien une bosse `sech²` sans creux, mais elle
suppose une source qui pousse l'eau et reste avancée, et une physique non
linéaire que ce modèle n'a pas.

C'est aussi l'analogue visuel de l'impulsion du Son : là-bas la membrane décrit
une bosse unipolaire, mais l'observable est ΔP, sa **dérivée** — compression
puis dépression. Ici l'observable est le déplacement lui-même : il doit porter
les deux.

La source est **en marche au chargement** : l'onglet s'ouvre sur le bassin déjà
animé, comme du temps où elle ne pouvait pas être coupée. L'arrêter ne fait pas
disparaître l'onde — elle vit dans l'historique et poursuit sa route jusqu'au
bord. C'est précisément ce que le bouton donne à voir.

À savoir sur le curseur d'**amplitude** : la vue du dessus code la phase en
couleur et non en relief, le champ n'y est donc pas multiplié par `amplitude`
(cf. `drawVagues`) — l'animation y est insensible au curseur. Les graphes
*y(x)* et *y(t)*, eux, sont gradués en centimètres et le suivent : le griser en
vue du dessus les figerait aussi, ce qui a fait renoncer à l'idée.

Comme au Son, le démarrage et l'arrêt sont adoucis par une **enveloppe
demi-cosinus étalée sur une période** (`vaguesEnv` / `vaguesEmitMode`) : une
sinusoïde allumée brutalement produirait un anneau franc se détachant du reste
de la houle. `stepSourceVagues` grave un échantillon **même quand la source se
tait** — c'est ce silence qui, en s'éloignant, dessine l'arrière du train
d'ondes.

### Le point S suit l'historique, pas l'horloge

`_vaguesSourceMotion()` donne la position et la vitesse réelles de la source,
**lues dans l'historique** (différence finie sur deux pas pour la vitesse) et
non recalculées en `sin(2πf·t)`. C'est la seule façon que le dessin décrive ce
que la source fait vraiment : elle est immobile entre deux impulsions, et une
fois désactivée — auparavant elle continuait de s'agiter dans le vide. La
flèche jaune suit la **vitesse** (la position seule la ferait pointer dans le
même sens une demi-période durant) et disparaît au repos. Les deux sites de
dessin, coupe stabilisée et transition 3D, lisent la même fonction.

### Une table radiale par frame

La vue du dessus lit le champ en ~120 000 points par frame : une recherche
dichotomique dans l'historique par point serait ruineuse. Comme le champ ne
dépend que de `r`, `_vaguesRadLUT(t)` tabule `d(r)` une seule fois par frame,
au quart de pixel, d'un seul balayage (r croissant ⇔ S décroissant : un curseur
descend l'historique sans jamais revenir). Chaque point interpole ensuite entre
deux entrées.

Le cache de `_rebuildVaguesFieldCache` survit mais s'allège : il ne garde plus
que ce qui ne dépend pas du temps — `gridR` (la distance à la source) et
`gridEnv` / `yxCacheEnv` (les enveloppes d'atténuation). Les tables `cos(k·r)` /
`sin(k·r)` ont disparu : elles supposaient un `k` unique, ce qu'une forme d'onde
quelconque n'a pas.

**Tous** les lecteurs du champ passent par là — `_waveFieldRaw`,
`_waveFieldCoupeAt`, le rendu de la vue du dessus, `_renderTopDown`,
`_render3DWaveView`, `updateYxDataVagues`, `rebuildYtDataVagues`. C'est la
condition pour que la vue du dessus, la coupe et la transition entre les deux
montrent la même onde. Seule exception assumée : la **quadrature** du couple
rendu par `_coupeFieldPairAt` (mouvement horizontal des molécules d'eau), qui
reste analytique — un signal quelconque n'a pas de quadrature locale, et la
théorie d'Airy dont sortent ces orbites suppose de toute façon une onde
monochromatique.

Le fondu du front (`frontFeather`, qui évite la coupure nette en anneau) se
fait désormais **vers l'intérieur** : l'ancien rendu prolongeait la sinusoïde
hors du cône causal pour l'y faire décroître, ce que l'historique ne permet
plus.

Deux atténuations distinctes : `attenuation` (exponentielle) et
`geoAttenuation` (en 1/√r, désactivée par défaut).

Spécificités de l'onglet : balises draggables dans le plan (et non sur un axe),
flèche λ draggable, et une **vue en coupe** (`viewMode`, avec animation de
transition `transAnim`).

### Largeur de la bande de gauche en vue de coupe

`COUPE_LEFT_MARGIN` n'est plus une constante : `_syncCoupeLeftMargin(w)`, en
tête de `resizeVagues`, la recalcule d'après la largeur **peinte** de
`#source-col` (donc déjà multipliée par `--src-s`), afin que la colonne source
posée en overlay ne recouvre pas l'onde en vue de profil.

Ce qu'il faut dégager n'est pas la position de la source mais **l'avancée de sa
flèche d'oscillation**, dessinée à sa gauche : `COUPE_SRC_ARROW_DX` (22 px) plus
la demi-pointe `COUPE_SRC_ARROW_HALF` (4 px). Les deux sites de dessin — la
coupe stabilisée et la transition — lisent ces constantes, pour qu'elles ne
puissent pas diverger du calcul de marge.

Le prix est direct : `max_r_coupe = canvasW − COUPE_LEFT_MARGIN` est la
distance de propagation exploitable, si bien qu'élargir la bande **raccourcit
l'onde visible** en coupe. `COUPE_LEFT_MAX_FRAC` (0,38) plafonne donc la part de
largeur concédée ; en dessous d'environ 660 px de canvas c'est lui qui décide,
et la flèche peut repasser sous la colonne. Le remède serait alors de faire
rapetisser la colonne, pas de rogner davantage la bande.

### Transition vue du dessus ↔ vue en coupe

Deux phases enchaînées (`VAGUES_TRANS_ROT` puis `VAGUES_TRANS_SLIDE`,
2,0 s au total) : rotation de la caméra θ : 0 → π/2, puis panoramique
horizontal amenant la source sur sa marge de gauche (`COUPE_LEFT_MARGIN`).
Le fondu croisé final d’origine ayant disparu, toute la durée est consacrée
au mouvement.

`_vaguesTransProgress()` est le **point d'entrée unique** de la progression :
le canvas (`_drawVaguesTransition`) et le graphe y(x) (`_drawYxGraphVagues`,
qui anime `xMin`/`xMax` en parallèle) le partagent, les durées ne sont donc
écrites qu'une fois.

Tout le rendu intermédiaire passe par `_render3DWaveView(θ, pan)`, qui
**converge exactement** vers `_drawVaguesCoupe` — mêmes formules
d'atténuation (interpolées en sin θ entre celle du cache de champ et celle
de `_waveFieldCoupeAt`), mêmes dégradés (reproduits ligne par ligne par
`_fillCoupeColorLUTs`), mêmes décors. Il n'y a donc **pas** de fondu croisé
final : la bascule de `viewMode` est invisible.

Trois paramètres de fondu pilotent le rendu intermédiaire :

| | piloté par | ce qui suit |
|---|---|---|
| `sinT` | rotation | ciel, dégradé d'eau, écume, labels Air/Eau, hauteur de la flèche λ, style des balises |
| `bandAlpha` | panoramique | bandeau et tige de source, repli de l'axe et des graduations sur le demi-axe x > 0 |
| `focus` = sin 2θ | mi-rotation | estompage des bandes z hors du plan de coupe (nul aux deux extrémités, maximum à θ = 45°) |

Aucun décor n'est masqué pendant la transition (`_draw3DAxis`,
`_draw3DLambdaArrow`, `_draw3DBeacons`, …) : les balises, posées sur l'axe,
montent sur la vague au fur et à mesure de la rotation, et la flèche λ garde
sa longueur — c'est ce qui relie les deux vues pour l'élève.

### Raideur maximale dessinée en coupe

`_coupeAmpPx(H)` est le **point d'entrée unique** de l'amplitude visuelle
de la vue de profil : la coupe, la transition 3D et le hit-test des
balises doivent partager la même valeur, sinon la transition n'arrive plus
exactement sur la coupe.

Au-delà du seuil `COUPE_STEEP_FRAC·λ`, elle **comprime** le déplacement
dessiné en loi de puissance (`COUPE_STEEP_EXP`). Sans ce garde-fou, à
λ = 75 px (réglages par défaut) la vue dessine une amplitude de 46 px,
soit une houle haute de **0,6 λ** — une raideur qu'aucune vague réelle
n'atteint, même sur le point de déferler, et qui rend le tracé des
trajectoires de molécules impossible (cf. la borne λ/π plus bas).

**Comprimer, et non plafonner** : c'est la leçon d'une première version
qui saturait en `tanh`. Le seuil est toujours très en dessous de la course
du curseur Amplitude (≈ 9 px pour une course de 23 à 138 px aux réglages
par défaut) ; toute saturation le rend donc parfaitement **inerte** en vue
de profil. Avec l'exposant, sa course de 1 à 6 se lit encore comme une
course de 1 à ~1,9 à l'écran. Les deux constantes se règlent
indépendamment : `FRAC` déplace le seuil (donc la platitude générale),
`EXP` dose ce qui reste de course au curseur au-delà (1 = aucune
compression, 0 = plafond dur).

En dessous du seuil la fonction est l'identité : la compression ne mord
que là où le dessin était invraisemblable, c'est-à-dire aux petites λ — à
f = 1 Hz et h = 10 mm (λ ≈ 410 px) la houle est rendue à l'identique.
L'amplitude reste par ailleurs lisible quantitativement sur le graphe
y(x), gradué en cm et auto-échelonné.

### Trajectoire des molécules d'eau (vue en coupe)

Option `simVagues.showOrbits`, rendue par `_drawOrbitesCoupeVagues()` en
étape 4 de `_drawVaguesCoupe` — après l'écume, pour que la molécule de la
rangée de surface se voie **sur** la ligne blanche qu'elle suit, et avant
la source, l'axe et les balises.

Objectif pédagogique : montrer qu'il n'y a **pas de transport de matière**
— la molécule décrit une boucle fermée pendant que la forme, elle, avance.

Le modèle est la **théorie d'Airy à profondeur finie**, celle qui
correspond au `c = √(gh)` de l'onglet — et non le cas eau profonde des
cercles en `e^(−kd)`. Une particule de position moyenne à la profondeur
*d* décrit une **ellipse** de demi-axes
`V(d) = a·sinh(k(h−d))/sinh(kh)` (vertical) et
`Hz(d) = a·cosh(k(h−d))/sinh(kh)` (horizontal) : en surface `V = a`, au
fond `V = 0` (va-et-vient purement horizontal). Le rapport
`Hz/V = coth(k(h−d))` couvre tout le spectre sur la plage des curseurs,
`kh = 2π·f·√(h/g)` allant de ≈ 0,02 à ≈ 3,1 : du segment quasi horizontal
jusqu'au quasi-cercle.

**La colonne d'eau dessinée représente h.** Le fond marin est posé à
`H − ORBIT_SEABED_PAD` et matérialisé par `_drawSeabedVagues()` (bande de
sable dégradée, ligne de crête, galets), sans quoi l'ellipse écrasée en
segment de la rangée du bas n'aurait pas de sens visible.

Deux détails de rendu à ne pas défaire :

- **Orbite et molécule sont doublées d'un halo sombre.** L'orbite de la
  rangée de surface monte jusqu'au niveau des crêtes : elle traverse donc
  des zones de ciel clair autant que d'eau profonde, et un trait d'une
  seule couleur y disparaît forcément d'un côté ou de l'autre. L'ellipse
  est tracée deux fois (halo large sombre, puis trait clair fin) et la
  bille porte un liseré sombre appuyé. Un essai antérieur avec un sillage
  en arcs dégressifs a été abandonné : segmenté, il rendait mal.
- **La molécule est un sprite mis en cache** (`_orbitBeadSprite`), pas un
  dégradé radial recréé à chaque frame — il y en aurait une trentaine par
  image. Les galets du fond ont des positions **déterministes** : un
  `Math.random` dans une boucle de rendu ferait grésiller le fond d'une
  frame à l'autre.

Le reste du cadrage découle d'un **conflit d'échelles** qu'il faut avoir
en tête avant de retoucher quoi que ce soit. La vue en coupe exagère
l'échelle **verticale** devant l'horizontale ; c'est `COUPE_STEEP_FRAC`
(section précédente) qui borne cette exagération, et sans lui rien de ce
qui suit ne tiendrait.

Même borné, il reste **impossible** d'avoir simultanément (a) la molécule
de surface collée à l'écume, (b) le rapport d'aplatissement exact et (c)
une orbite plus étroite que λ. L'objectif étant de montrer l'absence de
transport de matière, **on garde (a), on lâche (b)** :

- **Demi-axe vertical : échelle exacte de la surface.** La molécule du
  haut est rigoureusement sur l'écume, d'où la synchronisation visible
  avec l'avancement de la vague. L'ellipse de cette rangée couvre
  exactement la bande balayée par la houle — il est donc *normal* qu'une
  partie de son tracé soit momentanément au-dessus de la surface locale :
  c'est la trajectoire, pas de l'eau.
- **Demi-axe horizontal : comprimé par un `hScale` global**, calculé sur
  la rangée de surface et appliqué tel quel aux autres. La largeur reste
  ainsi quasi constante avec la profondeur — c'est la physique — pendant
  que la hauteur décroît jusqu'à s'annuler sur le fond. L'aplatissement
  affiché n'est pas mesurable.

**La borne λ/π est la contrainte dure du tracé.** La molécule est dessinée
en `px = x₀ − Hz·cos φ` alors que sa hauteur est celle de sa propre
trajectoire ; pour qu'elle reste sous la surface il faut
`sin(φ + β·cos φ) ≤ sin φ` pour tout φ, avec `β = k·Hz`. Le développement
au voisinage de `φ = π/2` (cas critique) donne `1 − (1 − β)² ≥ 0`, soit
**`β ≤ 2`, c'est-à-dire `Hz ≤ λ/π`**. Au-delà, la molécule double la forme
de la vague et se retrouve en l'air — invisible aux grandes λ, flagrant
aux petites. D'où le plafond `ORBIT_LAMBDA_FRAC·λ`, qui prime sur le
plafond par case. Corollaire à assumer : plus λ est petite devant
l'amplitude **dessinée**, plus la boucle est étroite et verticale. Une
boucle large et plate suppose une vague plate.

Le garde-fou du tracé compare la molécule à la surface prise **à
l'abscisse où elle est dessinée**, pas à celle de sa position moyenne —
confondre les deux était précisément le bug d'origine.
- **Le nombre de rangées s'adapte à l'amplitude** (2 à
  `ORBIT_MAX_ROWS`) : à échelle verticale exacte, une ellipse de surface
  haute de `2a` exige des rangées espacées de plus de `1,1·a`, faute de
  quoi elles s'interpénètrent — c'était le principal défaut de la
  première version.
- **Les colonnes sont espacées d'un multiple impair de λ/2**, donc en
  antiphase : à un instant donné une molécule est au sommet de sa boucle
  sous la crête pendant que sa voisine est au fond de la sienne sous le
  creux. Repli sur `ORBIT_TARGET_STEP` nu quand λ est trop grand ou trop
  petit pour que ce calage donne un nombre de colonnes exploitable.

Les rangées gardent leur profondeur moyenne **exacte** (une orbite ne
dérive pas avec la vague). Un garde-fou saute la molécule d'une rangée
intermédiaire qui se retrouverait au-dessus de la surface locale — cas
possible aux très fortes amplitudes seulement ; la rangée de surface, qui
*est* la surface, n'est jamais masquée.

La phase ne coûte rien : le champ de la coupe vaut `F = env·sin(φ)` et la
composante horizontale est sa **quadrature** `Q = env·cos(φ)`, les deux
renvoyées par `_coupeFieldPairAt()` — dont `out[0]` doit rester la copie
exacte de `_waveFieldCoupeAt`. `√(F² + Q²)` redonne l'amplitude locale
sans ré-évaluer les atténuations, si bien que les orbites rétrécissent
aussi avec la distance à S, gratuitement. `ζ = +(V/a)·F` et
`ξ = −(Hz/a)·Q` : la molécule avance sur la crête et recule dans le creux,
sens de rotation correct pour une onde allant vers +x.

Le bouton vit dans une **seconde bande** `#orbites-btns`, posée sous
`#tube-top-btns` — même dispositif que le bouton « Décomposer » de la page
diffraction. Elle n'existe à l'écran qu'en onglet Vagues, vue coupe,
transition terminée ; `syncBtnOrbitesVagues()` en est le point d'entrée
unique (appelé par `setMainTab`, `toggleViewVagues`, la fin de transition
et `resizeVagues`) et mesure la hauteur de la bande du dessus plutôt que
de coder son `top` en dur, celle-ci suivant les `clamp()` de
`.btn-tube-top`.

---

## `js/ui.js` — boucle et contrôles

Chargé en dernier, démarre tout via `init()` → `requestAnimationFrame(loop)`.

`loop(ts)` calcule `dtReal` (plafonné à 50 ms pour absorber les changements
d'onglet et les pauses navigateur), puis traite la branche de `activeTab` :
avancement du temps, échantillonnage, mise à jour des données graphes, tracé,
rafraîchissement des readouts.

Pour la Corde, une seule boucle à pas fixe pilote tout :

```javascript
while (simCorde.simTime - lastSrcUpdate >= SRC_DT) {
    lastSrcUpdate += SRC_DT;
    stepSourceCorde(lastSrcUpdate);          // grave l'onde émise (600 Hz)
    _srcTickCorde = 1 - _srcTickCorde;
    if (_srcTickCorde === 0) updateYtData(lastSrcUpdate);   // balises (300 Hz)
}
```

Contrôles : `sendImpulse*`, `toggleSinusoidal*`, `togglePause*`,
`resetSimAnim*`, `onSlider*`, `toggleWaveProps*`, `toggleBeaconActive`,
`toggleSelect`, `togglePressureColor`, `setMainTab`, `toggleHint`.

`_syncUIToSim()` recale au chargement tous les curseurs et readouts sur l'état
initial des trois objets, puis ouvre l'onglet indiqué par le hash de l'URL
(`#corde`, `#son`, `#vagues`), Son par défaut. `setMainTab` met le hash à jour
par `history.replaceState` : un onglet est donc partageable par lien.

### Chronomètre — un seul module pour tous les onglets

`chronos[tab]` porte l'état (`running`, `elapsed`, `periods`, `unit`), et un
seul jeu de fonctions le manipule : `chronoTick`, `toggleChrono`,
`resetChrono`, `setChronoUnit`, `_syncChronoBtn`, `_syncChronoUnits`,
`_updateChrono`, `_chronoLinked`, `_syncChronoLink`, `_startChronoIfLinked`.
Toutes prennent l'onglet en premier argument.

Ce qui distingue un onglet tient dans **`CHRONO_DEFS[tab]`**, et nulle part
ailleurs :

| | rôle |
|---|---|
| `sim()` | l'objet d'état d'où sort `freq` (conversion en T) |
| `noPeriod()` | le mode courant a-t-il une période définie ? |
| `linkDefault(mode)` | la case « Lier » est-elle cochée par défaut pour ce mode ? |

Côté HTML, **un seul gabarit** de box, au suffixe d'id près : tous les
éléments d'un onglet s'appellent `<base>-<tab>` (`chrono-value-son`,
`btn-chrono-start-corde`, …), ce que résout `_chronoEl(base, tab)`. Le style
passe par des **classes** (`.chrono-box`, `.chrono-display`, `.chrono-value`,
`.chrono-ctrl`, `.chrono-link`, `.chrono-units`) : elles se répètent d'une box
à l'autre, ce qu'un id ne peut pas faire — les deux premières versions
dupliquaient d'ailleurs `#chrono-display` et `#chrono-ctrl` en HTML invalide.

Deux points de comportement à ne pas défaire :

- Le chrono compte le temps de **simulation** : il se fige avec la pause et
  suit le facteur de vitesse, sinon les durées lues ne correspondraient plus à
  celles des graphes.
- Les périodes sont **cumulées pas à pas** dans `chronoTick`, jamais
  recalculées en `t × f` : changer la fréquence en cours de chronométrage
  requalifierait sinon rétroactivement tout le temps déjà écoulé.

Ajouter un onglet au chronomètre se réduit donc à trois gestes : recopier le
gabarit HTML avec le bon suffixe, ajouter une entrée à `CHRONO_DEFS` et une à
`chronos`, brancher `chronoTick` et `_updateChrono` dans sa branche de `loop`
(et `resetChrono` dans sa remise à zéro). C'est ce qu'a fait l'onglet Vagues,
en deux temps : la box d'abord, puis la case « Lier » une fois sa box source
pourvue d'un bouton Activer — avant quoi elle aurait été un contrôle mort.

### Conventions à respecter

- Les readouts sont rafraîchis **dans les gestionnaires de curseur** et pas
  seulement dans la boucle : celle-ci ne les met à jour que si l'animation
  tourne, si bien qu'en pause les valeurs resteraient figées.
- Les positions de balises (`frac`) sont **conservées** quand on masque puis
  réaffiche une balise ; seul « Remettre à zéro » restaure les valeurs par
  défaut.

---

## Ordre de chargement et dépendances

```
index.html
  └── sim.js      fmtFR, fmtSciHTML, tampons circulaires,
  │                sim + physique Son, simCorde + physique Corde
  └── tube.js     dépend de sim.js
  │                resizeTube/drawTube, resizeCorde/drawCorde,
  │                splitter, interactions canvas
  └── graph.js    dépend de sim.js
  │                resizeGraph, drawGraph, setGraphMode, toggleGraphCursor
  └── vagues.js   dépend de sim.js (tampons circulaires) et de graph.js (GM, chrome)
  │                simVagues + physique + rendu + graphes Vagues
  └── ui.js       dépend de tous les précédents
                   activeTab, loop, contrôles, onglets ; démarre init()
```

---

## Points ouverts

- **Vagues : la flèche λ et le readout λ restent calés sur la fréquence
  courante.** Depuis le portage sur l'historique, l'onde déjà émise garde la
  longueur d'onde qu'elle avait à l'émission : après un coup de curseur sur f,
  g ou h, ces repères ne décrivent plus que la portion la plus proche de la
  source. C'est le prix — assumé — de la fin de la réécriture rétroactive. (En
  mode Impulsion la question ne se pose pas : ils y sont verrouillés.)
- **Vagues : `_coupeFieldPairAt` garde une quadrature analytique** en `cos(φ)`
  calculée sur la fréquence courante, alors que sa composante en phase sort de
  l'historique. Sans effet visible tant que les orbites ne s'affichent qu'en
  sinusoïdal — mais après un changement de f en cours de route, le mouvement
  horizontal des billes ne suit plus exactement le vertical loin de la source.
- Reste calé sur les réglages courants côté Son : `aEff` dans `waveDeltaP`
  (facteur 1/2 en mode impulsion). Il ne change qu'au basculement de
  `sourceMode`, jamais au glissement d'un curseur, et ce basculement n'a lieu
  qu'une fois l'impulsion sortie du tube — donc sans effet visible.
- **Valeurs de μ peu réalistes** (jusqu'à 4 kg/m sur 5 m). C'est un compromis
  assumé : une corde de laboratoire (μ ≈ 1 g/m, T ≈ 5 N) donnerait c ≈ 70 m/s,
  soit une traversée en 0,07 s — inobservable. Les valeurs actuelles restent
  cohérentes entre elles (`c = √(T/μ)` exact).
- Le mode `'both'` ne peut pas aligner l'origine des graphes sur la source,
  les deux graphes n'occupant chacun qu'une demi-largeur.
