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

Son et Corde partagent la même mécanique d'historique (`_srcPush`, `_srcDAtS`,
etc., en tête de `sim.js`), au détail près de l'unité enregistrée. **Vagues n'a
pas encore été porté dessus**, mais son enveloppe causale (`sourceResetTime`)
lui évite déjà le défaut le plus visible.

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
  mécanique d'historique de source, décrite plus bas, partagée par Son et
  Corde. Chaque fonction prend l'objet d'état en premier argument.
  `SRC_DT` = 1/600 s, `SRC_CAP` = 40 s d'historique.

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

  Le plafond ne dépendant **que de la géométrie du tube**, il est aussi ce qui
  dimensionne les zones virtuelles de `initCols` : le domaine des particules
  est devenu insensible à f, K et ρ.
- **`waveDeltaP`** — la normalisation `K·aEff·kEff` et le pas `h` de la
  différence finie utilisent eux aussi le k local.

Chaque portion de l'onde conserve donc son propre gain : après un changement de
f, les deux longueurs d'onde qui cohabitent s'affichent chacune avec un contraste
lisible, au lieu que l'ensemble du tube se dilate ou se contracte.

#### Le facteur de forme doit entrer dans le budget d'amplitude

Le Son n'affiche pas le déplacement mais sa **dérivée** : la densité des
particules comme le graphe ΔP valent tous deux `∂u/∂x`. Or dériver multiplie
chaque harmonique par son rang, et le motif Périodique a de ce fait une pente
maximale **2,32 fois** celle d'une sinusoïde de même amplitude
(`PERIODIC_DP_FACTOR`).

`_sonDisplayGain` calibrait l'amplitude sur `A·k` du seul fondamental. En
Périodique la pente réelle valait donc `A·k × 2,32`, soit jusqu'à 1,74 — or
**`|∂u/∂x| > 1` signifie que `x₀ ↦ x₀ + u` n'est plus monotone** : les
particules se replient les unes sur les autres. Les trois lobes du motif
(3,5 / 0,95 / 0,95) saturaient alors en trois bandes d'aspect identique, et la
période apparente devenait λ/3 — alors que la vraie période est bien λ = c/f.

C'était donc un artefact de rendu, et non une erreur sur λ : il n'y avait rien
à corriger côté longueur d'onde. Le facteur de forme est simplement entré dans
le budget de `_sonDisplayGain`, via le `q` déjà rangé par échantillon (`srcQ`,
même mécanique que `k`). La pente reste bornée par `AK_CAP`, les trois lobes
retrouvent leurs amplitudes relatives réelles, et la période lue à l'écran
redevient λ.

> Une autre piste avait été suivie d'abord : faire émettre au Son la
> *primitive* du motif de la Corde, pour que ΔP en porte exactement le profil.
> Mathématiquement élégant — `max|u′|` retombait pile sur la constante 1,507097
> de la Corde — mais le motif devenait trop proche d'une sinusoïde à l'écran.
> Écarté : le défaut n'était pas dans le choix du signal.

#### Harmoniques renforcées côté Son

Le repliement corrigé, les lobes secondaires apparaissaient à 27 % du lobe
principal — trop discrets pour qu'on lise la structure du motif. Les
harmoniques sont donc renforcées **pour le Son uniquement** (la Corde garde
`PERIODIC_NORM` et ses poids) :

```
u(p)  = sin p + 1,000·sin 3p + 0,500·sin 2p     (max|u| = 2,016026)
ΔP ∝   cos p + 3,000·cos 3p + 1,000·cos 2p     (max = 5,000000)
```

Le lobe secondaire passe à 40 % du principal, soit un contraste de densité de
×1,43 contre ×1,26. C'est un **compromis assumé** : plus `PERIODIC_B3_SON`
monte, plus les lobes s'égalisent — et plus le motif finit par se lire comme
une onde de longueur d'onde λ/3, ce qui est précisément le défaut qu'on
cherche à éviter. Le principal doit rester dominant pour que la période lue
soit λ.

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
est plafonné par la hauteur du tube, donc `ak_disp = min(clamp(A·k, AK_MIN,
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
les deux axes**, fixée par un budget de flou explicite — `σ ≤ λ/20`, soit
`wAmp ≤ λ/26` puisque `σ ≈ 1,3 × wAmp` (`WANDER_LAM`). Aux réglages par défaut
(λ ≈ 367 px) la borne vaut 14 px et coïncide avec l'amplitude naturelle tirée
de `H` : l'errance est exactement isotrope. Elle ne se resserre qu'en haut de
la plage de fréquence, où λ devient petite — et le nuage s'y calme sur les
**deux** axes, ce qui est cohérent à l'œil et profite en prime à la lecture
des bandes, devenues fines. `WANDER_MIN` empêche le gaz de figer tout à fait.
L'errance n'entre pas dans la sélection, qui travaille sur `x0`.

L'errance est ramenée dans la bande **à l'affichage** et non en lui réservant
sa place dans la bande utile : lui réserver l'excursion maximale laissait le
gaz flotter entre deux marges vides, alors qu'une particule a le droit d'aller
toucher la paroi.

**Rebond, pas écrasement** (`_foldY`). L'errance a un écart-type
stationnaire de `1,3 × wAmp`, jusqu'à 18 px : sur une bande utile de 200 px,
une particule sur cinq environ en sort à un instant donné. Un simple *clamp*
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
  voisin de gauche. En mode Libre, le point d'indice 0 n'est pas dessiné : il
  est remplacé au même endroit par la poignée attrapable.
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
y(r, t) = A · sin(2π f (t − r/c))   pour r ≤ c·(t − sourceResetTime), sinon 0
```

avec `c = √(g·h)`. La condition sur `r` forme l'**enveloppe causale** : déplacer
la source remet `sourceResetTime` à l'instant courant, si bien que les vagues
déjà émises ne bougent pas.

Deux atténuations distinctes : `attenuation` (exponentielle) et
`geoAttenuation` (en 1/√r, désactivée par défaut).

Spécificités de l'onglet : source draggable dans le canvas, balises draggables
dans le plan (et non sur un axe), et une **vue en coupe** (`viewMode`,
avec animation de transition `transAnim`).

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

- **Vagues utilise encore le modèle analytique rétroactif.** Bouger g ou h
  réécrit rétroactivement toute l'onde présente, et le tampon y(t) n'est pas
  vidé au déplacement d'une balise. Le portage sur l'historique de source est
  mécanique, désormais que la mécanique est factorisée — mais la source y est
  continue et déplaçable dans le plan, ce qui demande un S par direction ou une
  approximation à documenter.
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
