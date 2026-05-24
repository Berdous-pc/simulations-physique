# Architecture — reaction/

> Module de simulation des réactions chimiques (stœchiométrie & réactif limitant).
> Référence source : `reaction.html` (fichier monolithique d'origine).

---

## Arborescence

```
reaction/
├── index.html          HTML pur — structure de la page, 0 JS inline
├── css/
│   └── style.css       Tout le CSS (reset, layout, tableau, canvas, mode test…)
└── js/
    ├── data.js         Données statiques + constantes de layout
    ├── sim.js          État global, canvas, géométrie, layout, rendu
    └── ui.js           Tableau HTML, onglets, animations, mode test, init
```

---

## Ordre de chargement (critique)

```html
<script src="js/data.js"></script>   <!-- 1. constantes, REACTIONS, MOL_MODELS -->
<script src="js/sim.js"></script>    <!-- 2. state, canvas, layout, drawXxx -->
<script src="js/ui.js"></script>     <!-- 3. tableau, onglets, animations, init() -->
```

Tout est en scope global (pas de modules ES). L'ordre est impératif.

---

## data.js

Expose uniquement des **données et constantes** — aucune fonction DOM, aucun effet de bord.

| Export | Type | Description |
|---|---|---|
| `REACTIONS` | `Array` | 30 réactions (label, difficulty, reactifs, produits, coefficients, atomes) |
| `MOL_MODELS` | `Object` | Modèles 2D de chaque molécule : `{atoms, bonds, radius}` |
| `ATOM_COLORS` | `Object` | Couleur de remplissage par symbole chimique |
| `ATOM_BORDER` | `Object` | Couleur de bordure par symbole chimique |
| `N_COLS` | `4` | Nombre de colonnes du tableau (2 réactifs + 2 produits) |
| `N_REACTIFS` | `2` | Colonnes réactifs |
| `N_PRODUITS` | `2` | Colonnes produits |
| `FRAC_MID_W` | `0.55` | Largeur de la zone de transition (fraction du canvas) |
| `FRAC_MID_H_EQ` | `0.28` | Hauteur de la zone de transition (fraction du canvas) |
| `MIN_MOL_SC` | `0.12` | Scale minimal des molécules |
| `COL_BG_*` | `String` | Couleurs de fond des colonnes |

---

## sim.js

Dépend de `data.js`. Expose l'**état global**, la gestion du **canvas** et toutes les
fonctions de **rendu** et de **géométrie**.

### État global

```js
const state = {
  onglet,          // 'equilibrage' | 'limitant'
  reactionEqIdx,   // index réaction mode équilibrage
  coeffsUser,      // coefficients saisis par l'utilisateur
  animEq,          // objet animation équilibrage en cours (null si aucune)
  lastFrameEq,     // dernier frame figé (après animation eq)
  reactionLimIdx,  // index réaction mode limitant
  qtesLimInit,     // quantités initiales saisies
  qtesR, qtesP,    // quantités courantes réactifs / produits
  animLim,         // objet animation limitant en cours
  lastFrameLim,    // dernier frame figé (après animation lim)
  stepCache,       // cache pour le mode step-by-step
  showProductsEq,  // afficher les produits en mode eq
  showCoeffOneEq,  // afficher les coefficients 1 en mode eq
  showCoeffOneLim, // afficher les coefficients 1 en mode lim
  avancement,      // x courant (mol)
  xmax,            // xmax calculé (null si pas encore atteint)
  predictionMode,  // bool
  predictions,     // valeurs prédites {key: val}
  comparaisonMode, // 0 | 1 | 2
}
```

### Canvas

```js
const molCanvas   // <canvas id="mol-canvas">
const molCtx      // CanvasRenderingContext2D
resizeCanvas()    // synchronise résolution interne avec taille CSS
resizeCanvasDuringAnim()
fixAndRedraw(mode)
```

### Cache géométrie DOM

Évite de relire le DOM à chaque frame. Invalidé à chaque rebuild de tableau ou resize.

```js
invalidateGeomCache()
getColRects(skipFirst)    // rects colonnes en coordonnées canvas
getCanvasCellRect()       // rect de la cellule canvas (y0, h)
getTableBottomY()         // bas du tableau en coordonnées canvas
getSepX()                 // x du séparateur réactifs/produits
```

### Layout

```js
computeLayout(rxn, coeffs4)                        // mode équilibrage
computeLayoutLim(qtesR, qtesP)                     // mode limitant, scales auto
computeLayoutLimFixed(qtesR, qtesP, scalesFixed)   // mode limitant, scales figés
calcScalesFixed(rxn, qtesRInit, nMax)              // calcule les scales fixes
```

### Rendu

```js
drawBackground(layout, skipTransition)
drawMolecule(ctx, formula, cx, cy, sc, alpha)
drawBonds(ctx, formula, cx, cy, sc, alpha)
drawAtom(ctx, el, x, y, r, alpha)
drawStatic()       // dessin de l'état courant (hors animation)
drawLastFrameEq(frame)
redraw(retryCount)
roundRect(ctx, x, y, w, h, r)
```

### Géométrie

```js
getBoundingRadius(formula)
scaleFor(formula, count, w, h, pad)
scaleForMulti(items, w, h, pad)
gridPositions(formula, count, x0, y0, w, h, sc, pad)
```

### Hauteur tableau

```js
fixCanvasRowHeight(mode)   // ajuste canvas-cell + canvas-and-table
relayoutLimAfterResize()   // recalcule layouts après resize (mode lim)
```

### Utilitaires

```js
lerp(a, b, t)
easeInOut(t)
```

---

## ui.js

Dépend de `data.js` et `sim.js`. Gère tout ce qui touche au **DOM** et au **flux utilisateur**.

### Tableau HTML

```js
buildThead(mode)          // construit le <thead>
buildTbody(mode)          // construit le <tbody> + <tfoot>
buildTfoot(rxn)           // pied de tableau avancement/quantités
makeQtyWidget(i, mol)     // widget +/− quantité initiale
updateTableFoot(...)      // met à jour les cellules tfoot
updateQtyWidgets()        // resynchronise les inputs quantité
```

### Onglets & sélecteur

```js
setOnglet(o)              // bascule entre 'equilibrage' et 'limitant'
onReactionChange(mode, val)
```

### Coefficients / quantités

```js
initCoeffsUser()
initQtesLim()
getCoeffEq(idx)
displayCoeffValue(v, mode)
buildEquationUI(mode)     // construit la ligne équation avec widgets
onCoeffInput(e)
stepCoeff(idx, delta, inp)
```

### Mode équilibrage

```js
testerEquilibrage()
testerEquilibrageInstantane(rxn, coeffsR, coeffsP)
lancerAnimEquilibrage(coeffsR, coeffsP)
tickAnimEq(ts)            // boucle RAF
relayoutAnimEq()          // recalcule positions après resize mid-anim
finirAnimEq()             // termine l'animation, met à jour lastFrameEq
```

### Mode réactif limitant

```js
prepareTourLim(anim)      // prépare les passes d'un tour
tickAnimLim(ts)           // boucle RAF
finirAnimLim()            // termine l'animation, met à jour lastFrameLim
lancerReactionMax()
lancerReactionStep()
razLimitant()
setQteLimDirect(i, val)
changeQteLim(i, delta)
```

### Prédiction & comparaison

```js
togglePrediction()
makePredWidget(key, labelText, unitText, colorClass)
lockPrediction() / unlockPrediction()
predictionComplete()
predictionEstCorrecte(qtesRFin, qtesPFin, xmaxFin)
afficherResultatPrediction(qtesRFin, qtesPFin, xmaxFin)
cycleComparaison()
buildCmpText(rxn, mode)
rebuildExtraRows(resize)
```

### Vitesse

```js
getSpeedMult()     // mode limitant
getSpeedMultEq()   // mode équilibrage
T_LIM(key)
T_EQ(baseMs)
updateSpeedLabels()
updateSpeedLabelsEq()
```

### Mode test

```js
const testState = { actif, mode, reactions, questionIdx, score, essais, repondreVu }
ouvrirConfirmTest(mode)
lancerTest(mode)
chargerReactionTest()
prochainQuestionTest()
afficherScoreFinal()
relancerTest()
quitterModeTest()
voirReponseTest()        // mode équilibrage uniquement
setTestUI(actif, mode)
tirerReactionsTest()     // 1×diff1 + 3×diff2 + 1×diff3
majBarreProgression()
afficherOverlay(html) / fermerOverlay()
afficherPopupTest(msg, cssClass, btnsHtml) / fermerPopupTest()
```

### Utilitaires UI

```js
setStatus(msg, cls) / clearStatus()
stopAnimations()
clearSnapshots()
updatePopupSpacer()
toggleShowCoeffOneEq() / toggleShowProductsEq() / resetShowProductsEq()
toggleShowCoeffOneLim()
razEquilibrage()
```

### Init

```js
init()    // peuple les selects, appelle buildXxx, lance fixAndRedraw
          // — appelé automatiquement en fin de ui.js
```

---

## Conventions respectées

- Même charte graphique et conventions CSS que `condensateur/` (clamp, 100vh, overflow hidden, CSS Grid).
- Zéro dépendance externe.
- Tout en scope global, chargement synchrone dans l'ordre `data → sim → ui`.
- Code commenté en français avec bandeaux `══════`.
- Le canvas (`#mol-canvas`, `position:absolute`, `z-index:0`) est superposé derrière le tableau (`#reaction-table`, `z-index:1`), tous deux dans `#canvas-and-table` (`position:relative`).
- `#sim-area` a `overflow-y: auto` pour scroller sur très petit écran.
