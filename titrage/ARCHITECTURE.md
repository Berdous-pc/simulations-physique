# Architecture — page Titrage

> Simulation de titrage — physique-chimie lycée (Seconde / Première / Terminale)
> Modes : **Principe** (table stœchiométrique + canvas molécules) et **Titrage** (dispositif SVG interactif)

---

## Fichiers

```
titrage/
├── index.html       ← HTML + SVG inline du dispositif
├── ARCHITECTURE.md  ← ce fichier
├── css/
│   └── style.css
└── js/
    ├── sim.js       ← state global, calculs pH/σ, canvas molécules (chargé en premier)
    ├── data.js      ← réactions, couleurs, indicateurs colorés
    ├── graph.js     ← graphes n=f(V), pH=f(V), σ=f(V), hover, points expérimentaux
    └── ui.js        ← interface complète : modes Principe & Titrage, mode test (chargé en dernier)
```

Ordre de chargement critique (scope global, pas de modules ES) :
`sim.js` → `data.js` → `graph.js` → `ui.js`

---

## Modes de la page

### Mode Principe
Interface pédagogique de stœchiométrie. Accessible via l'onglet **"Principe"**.

- Équation de réaction colorée (`buildEquationUI`) avec coefficients ajustables (`showCoeffOne`).
- Table stœchiométrique (`buildTable`, `buildThead`, `buildTbody`, `buildTfoot`) affichant l'état initial, l'avancement et l'état final.
- Canvas 2D (`#mol-canvas`) animé (`requestAnimationFrame`) montrant la progression molécule par molécule.
- Modes **comparaison** (0 = Non / 1 = brute / 2 = avec coefficients stœchiométriques) via `cycleComparaison`.
- Mode **prédiction** : masque la quantité du réactif titré, l'élève saisit sa prédiction (`togglePrediction`).
- Masque `#titre-mask` : cache la ligne "titré" du tableau en mode prédiction.
- Quantité de réactif titré réglable (1–30, widget `#qty-titre-wrap`) avec valeur aléatoire (`randomQteTitre`).

### Mode Titrage
Interface de simulation du dispositif de titrage. Accessible via l'onglet **"Titrage"**.

- SVG inline `#svg-dispositif` : burette + bécher + agitateur magnétique + potence.
- Trois sous-modes : `colorimetrique` | `phmetrique` | `conductimetrique`.
- Robinet interactif (`ouvrirRobinet` / `fermerRobinet`), maintien = versement continu, slider débit 1–5×.
- Vidage automatique jusqu'à Veq (colorimétrique) ou Veq+10 mL (pH/conducti).
- Graphes en temps réel dans `#titrage-charts-zone`.
- Mode test (quiz) intégré.

---

## `data.js` — Exports

### `TITRAGE_REACTIONS` (indices 0–10, mode Principe)

| Index | Label | Équation |
|---|---|---|
| 0–2 | Génériques A/B/C/D | — |
| 3 | Diiode / thiosulfate | I₂ + 2 S₂O₃²⁻ → 2 I⁻ + S₄O₆²⁻ |
| 4 | Ion fer(II) / permanganate | 5 Fe²⁺ + MnO₄⁻ + 8 H⁺ → 5 Fe³⁺ + Mn²⁺ + 4 H₂O |
| 5 | Eau oxygénée / permanganate | 5 H₂O₂ + 2 MnO₄⁻ + 6 H⁺ → 5 O₂ + 2 Mn²⁺ + 8 H₂O |
| 6 | Acide oxalique / permanganate | 5 C₂H₂O₄ + 2 MnO₄⁻ + 6 H⁺ → 10 CO₂ + 2 Mn²⁺ + 8 H₂O |
| 7 | Dioxyde de soufre / diiode | SO₂ + I₂ + 2 H₂O → SO₄²⁻ + 2 I⁻ + 4 H⁺ |
| 8 | Ion nitrite / permanganate | 5 NO₂⁻ + 2 MnO₄⁻ + 6 H⁺ → 5 NO₃⁻ + 2 Mn²⁺ + 3 H₂O |
| 9 | Ion permanganate / fer(II) | MnO₄⁻ + 5 Fe²⁺ + 8 H⁺ → Mn²⁺ + 5 Fe³⁺ + 4 H₂O |
| 10 | Acide ascorbique / diiode | C₆H₈O₆ + I₂ → C₆H₆O₆ + 2 I⁻ + 2 H⁺ |

### `TITRAGE_MODE_REACTIONS` (8 entrées — mode Titrage colorimétrique)

| Index | Espèce titrée | Titrant | rxnIdx |
|---|---|---|---|
| 0 | Diiode (I₂) | Thiosulfate de sodium (S₂O₃²⁻ ; 2 Na⁺) | 3 |
| 1 | Sulfate de fer(II) (Fe²⁺) | Permanganate de potassium (MnO₄⁻) | 4 |
| 2 | Eau oxygénée (H₂O₂) | Permanganate de potassium (MnO₄⁻) | 5 |
| 3 | Acide oxalique (C₂H₂O₄) | Permanganate de potassium (MnO₄⁻) | 6 |
| 4 | Dioxyde de soufre (SO₂) | Diiode (I₂) | 7 |
| 5 | Nitrite de sodium (NO₂⁻) | Permanganate de potassium (MnO₄⁻) | 8 |
| 6 | Permanganate de potassium (MnO₄⁻) | Sulfate de fer(II) (Fe²⁺) | 9 |
| 7 | Acide ascorbique (C₆H₈O₆) | Diiode (I₂) | 10 |

### `TITRAGE_PH_REACTIONS` (mode pH-métrique)

| Index | Espèce titrée | Type | pKa | Titrant |
|---|---|---|---|---|
| 0 | HCl (H₃O⁺ ; Cl⁻) | acide_fort | — | NaOH (Na⁺ ; HO⁻) |
| 1 | CH₃COOH | acide_faible | 4,76 | NaOH (Na⁺ ; HO⁻) |

### `TITRAGE_COND_REACTIONS` (mode conductimétrique)

Réactions avec ions conducteurs suivis. Structure similaire à `TITRAGE_MODE_REACTIONS`.
Index courant : `state.titrageCondRxnIdx`.

### `INDICATEURS_COLORES`

Tableau d'indicateurs pH (ex. : rouge de méthyle, bleu de bromothymol, phénolphtaléine…).
Chaque entrée : `{ nom, pHmin, pHmax, couleurAcide, couleurBasique }`.
Sélectionné par `state.titrageIndicateur` (index ou `null`).

### Couleurs molécules (mode Principe)

- `MOL_COLORS` : `{ id → couleur_fond }` pour le canvas molécules.
- `MOL_BORDER_COLORS` : `{ id → couleur_bordure }`.
- `COL_BG_TITRANT`, `COL_BG_TITRE`, `COL_BG_PRODUIT`, `COL_BG_EXCES` : couleurs de fond des colonnes du tableau stœchiométrique.

---

## `sim.js` — État global & fonctions

### Objet `state` (scope global)

#### Mode Principe

| Variable | Défaut | Rôle |
|---|---|---|
| `onglet` | `'principe'` | Mode actif : `'principe'` \| `'titrage'` |
| `rxnIdx` | `0` | Index dans `TITRAGE_REACTIONS` |
| `niTitre` | `10` | Quantité initiale du réactif titré (mol) |
| `avancement` | `0` | Avancement courant (mol) |
| `nTitrant` | `30` | Molécules titrant dans la case titrant |
| `nTitreRestant` | `10` | Réactif titré restant |
| `nProdC` | `0` | Produit C formé |
| `nProdD` | `0` | Produit D formé |
| `nExces` | `0` | Titrant en excès (après équivalence) |
| `nTitrantInjecte` | `0` | Total injecté depuis le début |
| `anim` | `null` | Objet animation RAF courant |
| `lastFrame` | `null` | Timestamp dernier frame RAF |
| `showCoeffOne` | `false` | Afficher/masquer les coefficients valant 1 |
| `comparaisonMode` | `0` | 0 = Non / 1 = brute / 2 = avec coefficients stœch. |
| `predictionMode` | `false` | Masque la quantité du réactif titré |

#### Mode Titrage — général

| Variable | Défaut | Rôle |
|---|---|---|
| `titrageType` | `'colorimetrique'` | `'colorimetrique'` \| `'phmetrique'` \| `'conductimetrique'` |
| `titrageRxnModeIdx` | `0` | Index dans `TITRAGE_MODE_REACTIONS` (indépendant de `rxnIdx`) |
| `titrageV1` | `20` | Volume solution titrée (mL) |
| `titrageVeau` | `0` | Volume eau ajoutée (mL) |
| `titrageConcTitrante` | `0.1` | Concentration solution titrante (mol/L) |
| `titrageConcTitree` | `0.1` | Concentration solution titrée (mol/L) |
| `titrageVverse` | `0` | Volume titrant versé depuis le début (mL) |
| `titrageBecherNominal` | `100` | Volume nominal bécher (mL), recalculé au reinit |
| `titrageAmidon` | `false` | Empois d'amidon actif (one-way, reset au reinit) |
| `titrageIndicateur` | `null` | Index dans `INDICATEURS_COLORES`, ou `null` |
| `titragePasAcquisition` | `1.0` | Pas entre deux points du graphe n=f(V) (mL) |

#### Mode Titrage — pH-métrique

| Variable | Défaut | Rôle |
|---|---|---|
| `titragePhRxnIdx` | `0` | Index dans `TITRAGE_PH_REACTIONS` |
| `titrageShowGraphPH` | `true` | Graphe pH=f(V) actif |
| `titrageShowGraphN` | `false` | Graphe n=f(V) actif |

#### Mode Titrage — conductimétrique

| Variable | Défaut | Rôle |
|---|---|---|
| `titrageCondRxnIdx` | `0` | Index dans `TITRAGE_COND_REACTIONS` |
| `titrageShowGraphSigma` | `true` | Graphe σ=f(V) actif |

#### Mode Titrage — représentation des espèces chimiques

| Variable | Défaut | Rôle |
|---|---|---|
| `titrageShowEspeces` | `false` | Mode "Représenter les espèces chimiques" actif |
| `titrageEspecesVisible` | `{}` | Map `{ id: bool }` — visibilité par espèce (légende) ; spectateurs décochés par défaut |

### Fonctions `sim.js`

#### Calculs chimiques

| Fonction | Rôle |
|---|---|
| `calcPH({ typeTitre, pKa, Ca, Va, Cb, Vb, Veau })` | Bisection rigoureuse sur log₁₀[H⁺] (80 itérations), couvre acide fort (HCl) et acide faible (CH₃COOH/NaOH). Précision ~10⁻²⁴ sur [H⁺]. |
| `calcCurrentPH()` | Enrobe `calcPH` avec l'état courant. Renvoie `null` hors-mode pH. |
| `calcSigma(params, entry)` | Calcule la conductivité σ (mS/cm) selon les concentrations ioniques et les conductivités molaires de l'entrée. |
| `calcCurrentSigma()` | Enrobe `calcSigma` avec l'état courant. Renvoie `null` hors-mode conducti. |
| `calcSigmaAtVolume(vVerse)` | Calcule σ à un volume donné (pour le graphe et le hover). |

#### Canvas molécules (mode Principe)

| Fonction | Rôle |
|---|---|
| `computeLayout()` | Calcule la disposition des colonnes et cellules du canvas selon la réaction courante. |
| `drawBackground(layout)` | Dessine les fonds de colonnes colorés. |
| `drawMolCircle(ctx, formula, cx, cy, r, alpha)` | Dessine un cercle molécule avec formule, couleur et opacité. |
| `redraw(retryCount)` | Redessine le canvas complet (layout + molécules + table). |
| `drawStatic()` | Version sans animation (état figé). |
| `scaleForCircles(count, w, h, pad)` | Calcule le rayon optimal pour placer `count` cercles dans une zone. |
| `gridPositionsCircles(count, x0, y0, w, h, r, pad, alignTop)` | Retourne les positions en grille pour `count` cercles. |
| `initFixedPositions()` | Pré-calcule les positions fixes des molécules (évite le recalcul à chaque frame). |
| `resizeCanvas()` / `resizeCanvasDuringAnim()` | Redimensionne le canvas selon le layout courant. |
| `fixAndRedraw()` | Corrige la taille canvas puis redessine. |
| `getColRects()` / `getCanvasCellRect()` | Accesseurs du cache géométrique. |
| `fixCanvasRowHeight()` | Ajuste la hauteur de la ligne canvas dans le tableau. |

#### Utilitaires

| Fonction | Rôle |
|---|---|
| `lerp(a, b, t)` | Interpolation linéaire. |
| `easeInOut(t)` | Fonction d'accélération/décélération pour les animations. |
| `roundRect(ctx, x, y, w, h, r)` | Dessine un rectangle arrondi sur un contexte 2D. |
| `invalidateGeomCache()` | Invalide le cache géométrique (`_geomCache = null`). |

---

## `ui.js` — Fonctions principales

### Mode Principe

| Fonction | Rôle |
|---|---|
| `buildTable()` | Construit la table stœchiométrique complète. |
| `buildThead()` / `buildTbody()` / `buildTfoot()` | Parties individuelles du tableau. |
| `updateTableFoot()` | Met à jour les valeurs du pied de tableau. |
| `rebuildCmpRow()` | Reconstruit la ligne de comparaison stœchiométrique. |
| `cycleComparaison()` | Fait défiler les modes comparaison (0→1→2). |
| `buildEquationUI()` | Construit le rendu HTML coloré de l'équation. |
| `setOnglet(o)` | Bascule entre les onglets `'principe'` et `'titrage'`. |
| `onReactionChange(val)` | Changement de réaction en mode Principe : met à jour state, équation, table. |
| `toggleShowCoeffOne()` | Affiche/masque les coefficients valant 1. |
| `togglePrediction()` | Active/désactive le mode prédiction (masque le réactif titré). |
| `updateTitreMask()` | Pilote l'affichage du masque `#titre-mask` et sous-composants. |
| `avancerStep()` | Avance d'un pas d'animation (mode Principe). |
| `_lancerAnimStep(rxn, a, b)` | Lance l'animation RAF d'un pas. |
| `tickAnim(ts)` | Callback RAF : interpole l'avancement et redessine. |
| `_drawStaticMolecules(layout, rxn, ...)` | Rendu statique des molécules pour l'état courant. |
| `stopAnim()` | Arrête l'animation en cours. |
| `resetState()` / `razPrincipe()` | Remet à zéro l'état du mode Principe. |
| `updatePanelQtyLabel()` | Met à jour l'étiquette de quantité dans le panneau. |
| `changeQteTitre(delta)` / `randomQteTitre()` | Modifie la quantité de réactif titré. |

### Mode Titrage

| Fonction | Rôle |
|---|---|
| `onTypeTitrageChange(val)` | Bascule colorimétrique / pH-métrique / conductimétrique : classe CSS `body.titrage-ph`, viewBox SVG, resync overlays. |
| `onTitrageRxnChange(val)` | Changement de réaction : state, équation, reinit, légende, amidon. |
| `populateTitrageRxnSelect()` | Repeuple `#sel-rxn-titrage` selon le type de titrage courant. |
| `onPasAcquisitionChange(val)` | Met à jour le pas d'acquisition du graphe n=f(V). |
| `titrageConcAlea()` | Tire des concentrations aléatoires avec Veq ∈ [7,23] mL, C_titrante ∈ [1e-5, 0.95]. |
| `reinitialiserTitrage()` | Remet à zéro volume, amidon, graphe, liquides, filet. |
| `ajouterTitrant(mL)` | Ajoute du volume, met à jour graphe et liquides. |
| `ouvrirRobinet()` / `fermerRobinet()` | Ouvre/ferme le robinet (déclenche `_startFilet` / `_stopVersement`). |
| `toggleCacherTitreTitrage()` | Masque/affiche la concentration de la solution titrée. |
| `renderTitrageEquation()` / `_fitTitrageEquation()` | Rendu et ajustement dichotomique de l'équation en mode Titrage. |

### Couleurs verrerie

| Fonction | Rôle |
|---|---|
| `updateLiquides()` | Recalcule et applique fill/opacity burette + bécher selon espèces et concentrations. |
| `couleurPermanganate_burette(concMnO4)` | Interpolation log rose pâle → violet intense pour KMnO₄. |
| `couleurFerPermanganate_becher(concFe2, concMnO4_exces)` | Vert-jaune (Fe²⁺ restant) → rose/violet (excès MnO₄⁻). |
| `couleurDiiode(concI2)` | Jaune-orange → brun foncé ; bleu nuit si empois d'amidon actif. |
| `couleurSO2Diiode_becher(concSO2, concI2_exces)` | Incolore avant équivalence, puis délègue à `couleurDiiode`. |
| `couleurKMnO4_becher(concMnO4, concFe2_exces)` | Violet (KMnO₄ restant) → incolore → vert-jaune (excès Fe²⁺). |
| `activerAmidon()` | Active l'empois d'amidon (one-way, `disabled` jusqu'au reinit). |

Couleur "incolore" (eau distillée) = `fill: #b8d4f0, opacity: 0.65`.

### Vidage automatique

| Fonction | Rôle |
|---|---|
| `toggleVidageAuto()` | Démarre ou arrête le vidage automatique. |
| `_demarrerVidageAuto()` | Lance un `setInterval` à 50 ms qui ajoute 0,05 mL × débit par pas jusqu'à la cible. |
| `_arreterVidageAuto()` | Arrête l'intervalle et remet le bouton à l'état initial. |
| `_calcVeq()` | Calcule Veq (mL) selon le type de titrage et la stœchiométrie courante. |

Cible du vidage : Veq (colorimétrique) ou Veq + 10 mL (pH-métrique / conductimétrique).

### Indicateurs colorés

| Fonction | Rôle |
|---|---|
| `ouvrirModalIndicateur()` | Ouvre la modale de sélection d'indicateur coloré. |
| `choisirIndicateur(idx)` | Sélectionne un indicateur et met à jour `state.titrageIndicateur`. |
| `retirerIndicateur()` | Retire l'indicateur courant. |
| `fermerModalIndicateur()` | Ferme la modale. |
| `_couleurIndicateur(indic)` | Calcule la couleur de l'indicateur selon le pH courant (interpolation sur la zone de virage). |
| `_lerpColor(c1, c2, t)` | Interpolation linéaire entre deux couleurs hex. |
| `_updateIndicateurBtn()` | Met à jour l'apparence du bouton indicateur selon l'état courant. |

### Barreau aimanté

Constante `BARREAU` (`CX=96.14, CY=265.5, L_MAX=6.0, R=2.0, OMEGA=2π×2.5`).
Simulation de la rotation vue de face : largeur du rect = `2 × max(R, L_MAX × |cos(θ)|)`.

| Fonction | Rôle |
|---|---|
| `startBarreau()` | Démarre l'animation RAF du barreau. |
| `stopBarreau()` | Arrête l'animation. |
| `_animBarreau(ts)` | Callback RAF : incrémente θ, met à jour `width` et `x` du `<rect id="barreau-rect">`. |

### Mode test (quiz)

Objet `testState` : `{ actif, niveau, rxnList, rxnListIdx, score, reponduCette }`.
Constante `TEST_REACTIONS` : `{ 1: [indices niveau 1], 2: [indices niveau 2] }`.

| Fonction | Rôle |
|---|---|
| `ouvrirConfirmTest()` | Affiche la modale de choix de niveau. |
| `lancerTest(niveau)` | Initialise `testState` et démarre le quiz. |
| `chargerReactionTest()` | Charge la réaction courante du quiz dans l'interface. |
| `_afficherPopupSaisie(rxn)` | Affiche le popup de saisie des quantités à l'équivalence. |
| `validerReponseTest()` | Vérifie la saisie de l'élève et met à jour le score. |
| `prochainQuestionTest()` | Passe à la question suivante ou affiche le score final. |
| `afficherScoreFinal()` | Affiche le bilan du quiz. |
| `relancerTest()` | Relance le quiz au même niveau. |
| `quitterModeTest()` | Quitte le mode test et restaure l'interface normale. |
| `setTestUI(actif)` | Active/désactive les contrôles bloqués pendant le test. |
| `majBarreProgression()` | Met à jour `#test-progress-bar` (réaction n/total + score). |
| `afficherOverlay(html)` / `fermerOverlay()` | Modale plein-écran (choix niveau, bilan). |
| `afficherPopupTest(...)` / `fermerPopupTest()` | Popup bas d'écran (feedback réponse). |
| `updatePopupSpacer()` | Ajuste `#popup-spacer` pour éviter que le popup masque le contenu. |

### Layout & positions

| Fonction | Rôle |
|---|---|
| `svgYtoPx(svgY)` / `svgXtoPx(svgX)` | Convertit des coordonnées SVG en pixels écran (via `getBoundingClientRect`). |
| `_updateBtnsPosition()` | Repositionne les boutons flottants (robinet, amidon, indicateur, vidage auto). |
| `_updateBuretteBoxPosition()` | Positionne `#burette-box` à droite de la zone schéma, anti-overlap avec `#btn-indicateur-colore`. |
| `_updateLabelVolume()` | Met à jour l'étiquette de volume versé positionnée sur le SVG. |
| `_updateRobinetPosition()` | Positionne `#robinet-cliquable` sur le robinet SVG. |
| `_updateAmidonPosition()` | Affiche/masque et positionne `#btn-amidon` à droite du bécher. |
| `_updatePhDisplay()` | Met à jour l'affichage du pH-mètre (`#ph-metre-display`). |
| `_applyChartsLayout()` | Redimensionne et affiche les panneaux de graphes selon les toggles actifs. |
| `_initSchemaResizeObserver()` | Observe `#schema-wrapper` et resync les overlays au redimensionnement. |
| `_syncPanelToState()` | Synchronise les contrôles du panneau avec `state`. |
| `toggleGraphN()` / `toggleGraphPH()` | Bascule les graphes n=f(V) et pH=f(V). |

### Constantes géométriques (`ui.js`)

| Constante | Valeur | Rôle |
|---|---|---|
| `BURETTE.CLIP_TOP` | 12.98 | Haut du clip burette (coords root SVG) |
| `BURETTE.GRAD0_Y` | 14.793 | y du ménisque à 0 mL versé |
| `BURETTE.SCALE_Y` | 6.282 | Unités SVG par mL versé |
| `BURETTE.CLIP_BOT` | 209.98 | Bas du clip burette (pointe) |
| `BURETTE.TUBE_X` | 84.5 | Bord gauche du tube |
| `BURETTE.TUBE_W` | 9.3 | Largeur du tube |
| `BURETTE.MAX_ML` | 25 | Capacité max burette (mL) |
| `BECHER.CLIP_TOP` | 225.0 | Haut du clip bécher |
| `BECHER.CLIP_BOT` | 268.5 | Bas du clip bécher |
| `BECHER.CLIP_H` | 43.5 | Hauteur utile bécher |
| `BECHER.CLIP_X` | 77.279 | Bord gauche intérieur bécher |
| `BECHER.CLIP_W` | 37.721 | Largeur intérieure bécher |
| `BECHER.MAX_ML` | 300 | Capacité max bécher (mL) |
| `BARREAU.CX` | 96.14 | Centre horizontal barreau |
| `BARREAU.CY` | 265.5 | Centre vertical barreau (fond bécher) |
| `BARREAU.L_MAX` | 6.0 | Demi-longueur max barreau |
| `BARREAU.R` | 2.0 | Demi-hauteur / rayon bouts arrondis |
| `BARREAU.OMEGA` | 2π × 2.5 | Vitesse angulaire (2,5 tours/s en rad/s) |
| `FILET_X` | 88.668 − FILET_W/2 | Position x du filet de liquide |
| `FILET_W` | 2.0 | Largeur du filet |

---

## `graph.js` — Fonctions principales

### Graphe n = f(V) (mode colorimétrique)

| Fonction | Rôle |
|---|---|
| `initChartCanvas()` / `_syncCanvasSize()` | Initialise et redimensionne le canvas `#titrage-chart`. |
| `initChartData()` | Réinitialise `_chartEspeces` et `_chartVisible`. |
| `drawTitrageGraph()` | Redessine le graphe n=f(V) complet. |
| `_pushChartPoint(vVerse)` | Ajoute un point au graphe à `vVerse` courant. |
| `_pushChartPointAt(vVerse)` | Idem à un volume précis (utilisé par le vidage auto). |
| `pushChartPoint()` | Point public appelé depuis `ajouterTitrant`. |
| `buildChartLegende()` | Construit la légende des courbes. |
| `_getRxnEntry()` | Lit `TITRAGE_MODE_REACTIONS[state.titrageRxnModeIdx]`. |
| `_calcPointAt(v)` | Calcule les quantités de matière (mol) de chaque espèce à volume v. |
| `toggleModelCourbe()` | Affiche/masque la courbe théorique modèle. |
| `resetChartSize()` | Force le recalcul de la taille du canvas. |

### Graphe pH = f(V) (mode pH-métrique)

| Fonction | Rôle |
|---|---|
| `initPhChartCanvas()` / `_syncPhCanvasSize()` | Initialise et redimensionne le canvas `#titrage-chart-ph`. |
| `drawTitragePhGraph()` | Redessine le graphe pH=f(V) complet. |
| `_drawMainGraph()` | Tracé interne : courbe pH + zones indicateurs + axe. |
| `_samplePhCurve(vMax)` | Échantillonnage adaptatif : ~16 pts/mL en base + ~300 pts autour de Veq = Ca·Va/Cb. |
| `calcPHAtVolume(vVerse)` | Calcule le pH à un volume précis (pour hover). |
| `toggleCourbeDerivee()` | Affiche/masque la courbe dérivée dpH/dV. |
| `toggleMethodeTangentes()` | Active/désactive la méthode des tangentes. |
| `togglePhCursor()` | Active/désactive le curseur interactif sur le graphe pH. |
| `updatePhAnalysisBtns()` | Met à jour l'état des boutons d'analyse du graphe pH. |
| `_computeDerivee(pts)` | Calcule la dérivée numérique dpH/dV sur un tableau de points. |
| `_drawTangentesMethode(...)` | Dessine les tangentes et leur intersection sur le canvas. |
| `_phPxToVPh(mx, my)` | Convertit des coordonnées pixel en volume (hover graphe pH). |
| `_phHandleTangenteClick(mx, my)` | Gestion du clic pour placer une tangente. |
| `togglePhIndicateur()` | Affiche/masque les zones de virage des indicateurs sur le graphe pH. |

### Graphe σ = f(V) (mode conductimétrique)

| Fonction | Rôle |
|---|---|
| `drawTitrageSigmaGraph()` | Redessine le graphe σ=f(V). |
| `_sampleSigmaCurve(vMax)` | Échantillonnage de la courbe de conductivité. |
| `toggleTracerDroites()` | Active/désactive le mode tracé de droites interactif. |
| `_condLinesInitCtx()` | Initialise le contexte de tracé des droites. |
| `_condDataToPx(...)` / `_condPxToData(...)` | Conversions données ↔ pixels. |
| `_condLineClip(...)` | Clip une droite aux bornes du graphe. |
| `_drawCondLines(...)` | Dessine les droites tracées. |
| `_renderCondLine(...)` / `_renderCtrlPt(...)` | Rendu d'une droite et de ses points de contrôle. |
| `_condLinesHandleClick/Mousedown/Mousemove/Mouseup(...)` | Gestion des interactions souris pour déplacer les droites. |
| `_condLinesStartRaf()` / `_condLinesStopRaf()` | RAF dédié au rendu des droites interactives. |

### Hover & réticule

| Fonction | Rôle |
|---|---|
| `_drawHoverTooltip(ctx, ...)` | Dessine un tooltip avec valeur et ligne de référence. |
| `_drawReticule(ctx, ...)` | Dessine le réticule (croix) au point hover. |
| `_niceStep(range, targetN)` | Calcule un pas d'axe "joli" (1, 2, 5 × puissance de 10). |
| `_yScale(yMax)` | Détermine l'échelle Y adaptée. |
| `_fmtY(v, scale)` | Formate une valeur Y pour l'affichage sur l'axe. |
| `_niceYRange(yMax)` | Calcule une plage Y arrondie. |
| `_updateGraphBtnsSize()` | Redimensionne les boutons superposés aux graphes. |

### Points expérimentaux

| Fonction | Rôle |
|---|---|
| `pushExpPoint(v)` | Enregistre un point expérimental à volume v. |
| `_rebuildExpPoints()` | Reconstruit la liste des points expérimentaux depuis l'historique. |
| `_recordExpPointIfNeeded(vPrec, vNew)` | Enregistre automatiquement un point si le pas d'acquisition est franchi. |
| `_resetExpPoints()` | Efface tous les points expérimentaux. |
| `_drawExpCross(ctx, cx, cy, r, color, lw)` | Dessine une croix de point expérimental sur le canvas. |

---

## Éléments DOM notables

### Mode Principe

| Sélecteur | Rôle |
|---|---|
| `#mol-canvas` | Canvas 2D des molécules |
| `#titrage-table` | Table stœchiométrique |
| `#titre-mask` | Masque du réactif titré (mode prédiction) |
| `#titre-mask-inner` | Contenu du masque |
| `#titre-mask-qmark` | Point d'interrogation du masque |
| `#popup-spacer` | Espace réservé sous le popup de test |
| `#sel-reaction` | Sélecteur de réaction (mode Principe) |
| `#qty-titre-val` | Input quantité de réactif titré |
| `#btn-prediction` | Bouton mode prédiction |
| `#btn-comparaison` | Bouton cycle comparaison |
| `#test-progress-bar` | Barre de progression du quiz |
| `#test-overlay` | Modale plein-écran (quiz) |
| `#test-modal-content` | Contenu de la modale |
| `#test-popup` | Popup bas d'écran (feedback réponse) |
| `#test-popup-msg` | Message du popup |
| `#test-popup-btns` | Boutons du popup |
| `#btn-test-mode` | Bouton entrée/sortie mode test |

### Mode Titrage

| Sélecteur | Rôle |
|---|---|
| `#sim-area-titrage` | Zone principale mode Titrage |
| `#titrage-schema-zone` | Zone SVG + overlays positionnés |
| `#schema-wrapper` | Wrapper observé par `ResizeObserver` |
| `#svg-dispositif` | SVG inline du dispositif |
| `#liquide-burette` | Rect SVG liquide burette |
| `#liquide-becher` | Rect SVG liquide bécher |
| `#barreau-rect` | Rect SVG barreau aimanté |
| `#robinet-cliquable` | Div overlay robinet |
| `#burette-box` | Boîte de contrôle burette (positionnée en absolu) |
| `#btn-amidon` | Bouton empois d'amidon |
| `#btn-indicateur-colore` | Bouton sélection indicateur coloré |
| `#btn-vidage-auto` | Bouton vidage automatique |
| `#titrage-equation-zone` | Zone équation de réaction |
| `#sel-rxn-titrage` | Sélecteur de réaction (mode Titrage) |
| `#sel-type-titrage` | Sélecteur type de titrage |
| `#ph-metre-display` | Affichage valeur pH dans le SVG |

### Graphes

| Sélecteur | Rôle |
|---|---|
| `#titrage-charts-zone` | Conteneur principal des graphes |
| `#titrage-chart` | Canvas graphe n=f(V) |
| `#titrage-chart-ph` | Canvas graphe pH=f(V) |
| `#titrage-chart-ph-panel` | Panneau contenant le graphe pH |

---

## Mode pH-métrique — détails

### Éléments SVG additionnels

| Groupe | Rôle |
|---|---|
| `<g id="potence-ph">` | Barre horizontale + crochets tenant l'électrode pH |
| `<g id="electrode-ph">` | Électrode pH plongée dans le bécher |
| `<g id="ph-metre">` | Boîtier pH-mètre + écran + fil de connexion |
| `<text id="ph-metre-display">` | Valeur pH affichée dynamiquement par `_updatePhDisplay()` |

### ViewBox conditionnel

| Mode | viewBox |
|---|---|
| Colorimétrique / Conductimétrique | `42.02 -1.37 89.97 303.5` |
| pH-métrique | `42.02 -1.37 157.98 303.5` (élargi à droite) |

Après chaque changement, les overlays positionnés en px sont resynchronisés (`_updateRobinetPosition`, `_updateLabelVolume`, `_updateBtnsPosition`, `_updateAmidonPosition`).

### Calcul du pH

`calcPH({ typeTitre, pKa, Ca, Va, Cb, Vb, Veau })` dans `sim.js` :

- Bisection sur log₁₀[H⁺] ∈ [-14, 0], 80 itérations.
- Acide fort : `[H⁺] − [OH⁻] + [Na⁺] − Ca₀ = 0` (Ca₀ = Ca·Va/Vtot).
- Acide faible : `[H⁺] − [OH⁻] + [Na⁺] − Ca₀·Ka/(Ka+[H⁺]) = 0`.
- [Na⁺] = Cb·Vb/Vtot, [OH⁻] = Ke/[H⁺], Ke = 10⁻¹⁴.

### Graphe pH = f(V) — échantillonnage

`_samplePhCurve(vMax)` : grille de base ~16 pts/mL + grille fine ~300 pts autour de Veq = Ca·Va/Cb. Hover snap à 0,10 mL recalcule `calcPHAtVolume(vSnap)` à la volée.

### Layout des graphes (`_applyChartsLayout`)

| Mode | Toggle pH | Toggle n | Affichage |
|---|---|---|---|
| colorimétrique / conductimétrique | (masqué) | off | zone vide |
| colorimétrique / conductimétrique | (masqué) | on  | n=f(V) plein écran |
| pH-métrique | on  | off | pH=f(V) plein écran |
| pH-métrique | off | on  | n=f(V) plein écran |
| pH-métrique | on  | on  | pH (haut) + n (bas), 50/50 |
| pH-métrique | off | off | zone vide |

---

## Indicateurs colorés pH — détails

Chaque indicateur a une zone de virage `[pHmin, pHmax]` avec une couleur acide et une couleur basique.
`_couleurIndicateur(indic)` : retourne la couleur interpolée selon le pH courant.
La zone de virage est affichée sur le graphe pH=f(V) comme un bandeau de couleur semi-transparent (activé par `togglePhIndicateur()`).

---

## Mode "représentation des espèces chimiques" — détails

Mode commun aux trois sous-modes du mode Titrage (colorimétrique, pH-métrique, conductimétrique). Activable via le bouton `#btn-toggle-especes` dans la section Options du panneau droit.

### Principe

- Sphères colorées (rayon fixe `1.2` unités SVG) animées d'un mouvement brownien dans la burette (`#especes-burette`) et le bécher (`#especes-becher`), réutilisant les `clipPath` existants `#burette-interieur` et `#becher-interieur`.
- Couleurs depuis `MOL_COLORS` et `MOL_BORDER_COLORS` (`data.js`), partagées avec le mode Principe.
- Calibration : `N_TITRE_INIT = 20` sphères de titré au départ ; nombre de sphères de titrant à l'équivalence = `N_TITRE_INIT × coeffTitrant/coeffTitre`. D'où `V_par_sphère_titrant = Veq / N_titrant_eq` (mL).
- À chaque versement, comparaison entre `state.titrageVverse` et `_especesVverseRef` : pour chaque quantum franchi, une sphère de titrant (et ses spectateurs au prorata de `coeffTitrant`) est mise en file d'éjection (cap `MAX_EJECT_PER_FRAME = 3` par frame).
- Une sphère éjectée descend verticalement le long du filet (`x = 88.668`, vitesse `85` SVG/s) jusqu'à la surface du liquide bécher.
- Une fois dans le bécher, une sphère de **titrant** cherche la sphère de **titré** la plus proche : les deux passent en `state='migration'` (easing `easeInOut`, durée `0.45 s`). Au contact (distance < 2R), suppression des deux et création des sphères-produits (`round(e.coeff / coeffTitre)` par produit) à la position de contact, avec `state='flash'` pendant `0.25 s` (opacité modulée).
- Une sphère de titrant qui n'a pas de titré disponible (excès) reste en brownien dans le bécher.
- Les **spectateurs** (Na⁺, K⁺, SO₄²⁻, Cl⁻…) sont représentés mais leur checkbox est **décochée par défaut** dans la légende (filtrage côté rendu).

### Légende

Section repliable `#especes-legende-section` intégrée à `#burette-box` (apparaît seulement quand le mode est actif). Pour chaque espèce : `[checkbox] [pastille colorée] [formule]`. Reconstruite à chaque changement de réaction ou de type de titrage.

### État

| Variable JS (module ui.js) | Rôle |
|---|---|
| `_especesRAF` | Handle du `requestAnimationFrame` actif |
| `_especesLastTime` | Timestamp dernière frame (calcul de `dt`) |
| `_especesSpheres` | Tableau plat des sphères vivantes |
| `_especesVparSphere` | mL de titrant par sphère (recalculé à chaque init) |
| `_especesVverseRef` | Dernier V_versé pris en compte pour la sync |
| `_especesEjectQueue` | File d'attente des sphères à éjecter |
| `_especesNextId` | Compteur d'uid pour les `<circle>` |

### Constantes

```js
const ESPECES = {
  R: 1.2, N_TITRE_INIT: 20,
  V_BROWN: 3.5, V_BROWN_BURETTE: 2.0, DAMPING: 0.88,
  MIG_DURATION: 0.45, FLASH_DURATION: 0.25,
  DESCENTE_VITESSE: 85, MAX_EJECT_PER_FRAME: 3,
};
```

### Fonctions (`ui.js`)

| Fonction | Rôle |
|---|---|
| `toggleEspeces()` | Bascule `state.titrageShowEspeces`, montre/cache groupes SVG + légende, démarre/arrête la boucle RAF |
| `toggleEspeceVisible(id, checked)` | Handler des checkboxes de la légende |
| `_especesGetRxnEntry()` | Récupère l'entrée réaction courante (wrapper sur `_getRxnEntry()` de graph.js) |
| `_especesCoeffs(entry)` | Lit `{ coeffTitre, coeffTitrant }` pour l'entrée |
| `_especesZoneBurette()` | Bornes courantes (lit `yTop` du ménisque depuis `state.titrageVverse`) |
| `_especesZoneBecher()` | Bornes courantes (lit `y` et `height` de `#liquide-becher`) |
| `_especesRandn()` | Approximation `N(0, 1)` (somme de 3 uniformes) |
| `_especesCreerSphere(id, role, zone, opts)` | Construit un objet sphère |
| `_initEspeces()` | (Re)init `titrageEspecesVisible`, recalcule `_especesVparSphere`, vide les sphères |
| `_genererSpheres()` | Génère titré + spectateurs initiaux dans le bécher et titrant + spectateurs dans la burette |
| `_syncSpheresAvecVerse()` | Compare `titrageVverse` à `_especesVverseRef` et enfile les éjections |
| `_especesEjecterSphere(item)` | Sélectionne la sphère la plus basse en burette et l'amorce en `state='descente'` |
| `_especesChercherTitre(sT, id)` | Sphère de titré la plus proche en `state='brownien'` |
| `_especesReaction(sT, sR)` | Supprime titrant+titré, crée les produits (état flash) |
| `_animEspeces(ts)` | Boucle RAF principale : dispatch selon `state` |
| `_especesBrownienStep(s, dt, zone, scaleFactor)` | Random walk + damping + rebonds élastiques |
| `_renderSpheres()` | Sync DOM SVG : création/maj/suppression de `<circle data-uid="...">` |
| `_construireLegendeEspeces()` | Reconstruit le HTML de `#especes-legende-list` |
| `_especesRebuild()` | Réinit + régén + redraw (appelée par `reinitialiserTitrage`) |

### Hooks dans les fonctions existantes

| Fonction existante | Modification |
|---|---|
| `setOnglet('titrage')` | Relance la boucle RAF si `titrageShowEspeces` |
| `reinitialiserTitrage()` | Appelle `_especesRebuild()` (recalcul Veq, nouvelles concentrations) |
| `ajouterTitrant(mL)` | Appelle `_syncSpheresAvecVerse()` |

(`onTitrageRxnChange` et `onTypeTitrageChange` héritent indirectement via leur appel à `reinitialiserTitrage`.)

### Éléments DOM

| Sélecteur | Rôle |
|---|---|
| `#especes-burette` | Groupe SVG des sphères de la burette (clippé) |
| `#especes-becher` | Groupe SVG des sphères du bécher (clippé) |
| `#btn-toggle-especes` | Bouton toggle dans la section Options |
| `#especes-legende-section` | Conteneur de la légende dans `#burette-box` |
| `#especes-legende-list` | Liste des espèces avec checkboxes |

---

## Hors-scope

- Polyacides / acides faibles avec plusieurs pKa.
- Titrage d'une base par un acide.
- Export des données graphes (CSV / image).
- Historique des mesures (tableau de points).
