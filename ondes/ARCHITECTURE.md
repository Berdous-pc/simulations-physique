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

- **`_sonDisplayGain(k)`** — gain de lisibilité des colonnes. La modulation de
  densité `A·k` couvre trois décades sur les plages de curseurs : en dessous de
  `AK_MIN` (0,55) la compression serait invisible, au-dessus de `AK_CAP` (0,90)
  les colonnes se chevaucheraient. Le gain est appliqué par
  `waveDisplacementDisplay()`, réservée au rendu ; `waveDisplacement()` reste la
  grandeur physique, non pondérée.
- **`waveDeltaP`** — la normalisation `K·aEff·kEff` et le pas `h` de la
  différence finie utilisent eux aussi le k local.

Chaque portion de l'onde conserve donc son propre gain : après un changement de
f, les deux longueurs d'onde qui cohabitent s'affichent chacune avec un contraste
lisible, au lieu que l'ensemble du tube se dilate ou se contracte.

`sim.srcKMin` mémorise le plus petit k émis ; `sonMaxDisplayGain()` s'en sert
pour dimensionner les zones virtuelles de particules dans `initCols`, une
portion ancienne pouvant réclamer plus de marge que les réglages courants.

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
`sonMaxDisplayGain`, `particleRadius`, `initCols`, `updateDpxData`,
`updateDptData`, `pruneImpulses`, `resetAnim`, `selectNearbyParticles`.

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

`resizeTube()` recalibre `C_BASE = tubeLength / (2·c_norm_défaut)` — l'onde
traverse alors le tube en ~2 s aux réglages par défaut — puis réinitialise les
colonnes. `drawTube()` dessine fond, membrane, colonnes, balises, règle graduée.

**Sélection de particules par proximité** : clic simple = remplace la sélection,
Ctrl+clic = ajoute, Maj+clic = retire, dans un rayon `selectionRadius`
proportionnel à la densité des colonnes (recalculé dans `initCols`). Le mode est
exclusif du coloriage par pression : activer l'un désactive et grise l'autre.

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
