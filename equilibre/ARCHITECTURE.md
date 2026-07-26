# Architecture — Simulation Équilibre chimique

## Arborescence

```
equilibre/
├── index.html
├── ARCHITECTURE.md         ← ce fichier
├── css/
│   └── style.css
└── js/
    ├── sim.js
    ├── recipient.js
    ├── graph.js
    ├── frise.js            ← propre à cette page (axe Qr)
    └── ui.js
```

Cette page est dérivée de `cinetique/` (même structure générale : récipient +
graphe à gauche, panneau de contrôle à droite, mode 1 ou 2 simulations). Se
reporter à `cinetique/ARCHITECTURE.md` pour tout ce qui n'est pas listé
ci-dessous ; ce document ne détaille que ce qui diffère.

---

## Différences avec `cinetique/`

| | `cinetique/` | `equilibre/` |
|---|---|---|
| Sens de la réaction | unique, A + B → C + D | réversible, A + B ⇌ C + D |
| Température | slider 1–90 °C | absente (σ des vitesses constant) |
| Catalyseur | slider 0–10 | absent |
| Quantités initiales réglables | A, B | A, B, C, D |
| Efficacité des chocs | 1 slider (implicite via T) + catalyseur | 2 sliders **Probabilité** (%), un par sens |
| Fin de réaction | `s.finished` fige tout quand A ou B = 0 | aucune — la réaction reste possible dans un sens tant qu'il reste de la matière (équilibre dynamique) |
| Lecture pédagogique | vitesse de réaction | quotient de réaction Q<sub>r</sub>, équilibre dynamique |
| Visualisation | graphe N(t) seul | graphe N(t) **+ frise Qr** (`js/frise.js`) |
| Rayon des molécules | constante fixe | dépend de N (cf. section dédiée) |

---

## `js/sim.js` — Ce qui change

### Probabilité de choc efficace (remplace l'énergie d'activation)

Les sliders **« Probabilité A + B »** et **« Probabilité C + D »** (0 à
100 %, 50 % par défaut) affichent directement un pourcentage de chocs
efficaces, sans jamais mentionner d'énergie d'activation — contrainte
explicite de cette page.

Piège corrigé après coup (cf. historique ci-dessous) : la distribution des
vitesses d'approche PARMI LES CHOCS QUI SE PRODUISENT n'est pas la même que
la distribution des vitesses en général — une paire qui se rapproche vite
« balaie » plus d'espace par seconde et se heurte donc plus souvent qu'une
paire lente. Les chocs sont pondérés par la vitesse d'approche elle-même
(même principe que la distribution de FLUX à travers une surface, qui
diffère de la distribution de vitesse d'où elle dérive). En intégrant cette
pondération (vrel_n gaussien centré, d'écart-type `σ√2`, `σ` = écart-type
d'une composante de vitesse d'une molécule seule, cf. `randomVelocity`), la
fraction de chocs avec `vrel_n ⩾ vAct` se simplifie en une exponentielle
(forme d'Arrhenius) :

```
P(efficace) = exp(−vAct² / (4σ²))
```

`_activationFactorFromProbability(p)` inverse cette relation :
`vAct = 2σ·√(−ln p)`, sans fonction spéciale — remplaçant la constante fixe
`ACTIVATION_SPEED_FACTOR` de `cinetique/`. Recalculé à chaque passe de
`_collidePairs` (deux valeurs, `vActAB` et `vActCD`), car les sliders
peuvent être bougés pendant que la simulation tourne.

**Historique** : une première version utilisait
`P(efficace) = 2·(1 − Φ(vAct/(σ√2)))` (loi normale, sans pondération par le
flux), en ne conditionnant que sur « vrel_n > 0 ». C'est le piège classique
en théorie cinétique — confondre distribution de vitesse et distribution de
flux de collision — et il produisait un Qr d'équilibre très éloigné du
rapport `probAB / probCD` annoncé (dérive vers le côté au seuil le plus
bas). La formule actuelle, dérivée avec la pondération par le flux, fait
coïncider exactement K = probAB / probCD à l'équilibre (aux fluctuations
statistiques près, inévitables avec un nombre fini de molécules).

Contrairement au changement de quantité initiale, changer une probabilité
**ne remet pas la simulation à zéro** (`setReactionProbability`) : c'est un
réglage du système en cours, pas une redéfinition des conditions initiales.
L'élève peut ainsi observer en direct l'effet d'un changement de probabilité
sur un système déjà à l'équilibre — typiquement, pour illustrer qu'un
nouveau point d'équilibre est atteint sans changer les quantités totales de
matière.

### Réaction bidirectionnelle — toujours un choc élastique

`_resolvePair()` teste deux cas symétriques : une paire {A,B} peut réagir en
{C,D} (seuil `vActAB`), une paire {C,D} peut réagir en {A,B} (seuil
`vActCD`). **Contrairement à `cinetique/`, la réaction ne change QUE le
type** des deux molécules ; leur nouvelle vitesse est celle, ordinaire, d'un
choc élastique standard entre sphères dures de même masse (échange de la
composante normale de la vitesse relative — la même formule que pour un
choc non réactif). Un tel choc conserve exactement la quantité de mouvement
**et** l'énergie cinétique du couple, par construction.

Ce n'est pas qu'un détail : `cinetique/` calcule les vitesses des produits
via la vitesse du centre de masse `vG` plus un `kick` tangentiel aléatoire
dérivé de la composante *normale* de la vitesse relative
(`vX = vG + kick`, `vY = vG − kick`). Cette formule conserve bien la
quantité de mouvement (elle ne fixe que la SOMME `vX + vY`), mais PAS
l'énergie cinétique : le `kick` ignore systématiquement la composante
*tangentielle* de la vitesse relative entre les deux réactifs, qui est donc
perdue à chaque réaction, dans les deux sens. Sur `cinetique/`, la réaction
s'arrêtait dès qu'un réactif s'épuisait, donc cette fuite d'énergie ne se
voyait jamais. Ici, avec un équilibre dynamique qui tourne indéfiniment,
elle aurait refroidi le système en continu — et les seuils `vAct`, calibrés
une fois pour toutes par rapport à `v0px` en supposant une température
CONSTANTE, auraient alors franchi de moins en moins souvent le seuil le
plus élevé des deux (probabilité réglée la plus basse) tout en continuant à
franchir presque toujours le seuil quasi nul (probabilité proche de
100 %) : l'équilibre observé aurait dérivé bien au-delà du rapport
`probAB / probCD` (mesuré avec cette version fautive : Qr ≈ 30-40 pour un
rapport théorique de 1,98, avant correction).

En traitant la réaction comme un simple choc élastique, l'énergie totale du
système ne varie **jamais**, quel que soit le nombre de réactions déjà
survenues : le système reste à température constante indéfiniment — c'est
la condition nécessaire pour que Qr converge vers K = probAB / probCD (cf.
« Probabilité de choc efficace » ci-dessus), tout en restant des chocs
physiquement élastiques de bout en bout.

### Simplifications (suppressions par rapport à `cinetique/`)

- Pas de température : `randomVelocity` utilise directement `σ = v0px`
  (équivalent à figer `T_K = T_REF` dans `cinetique/`) — `T_C`, `T_K`,
  `simTempFromCelsius`, `T_REF` et consorts disparaissent.
- Pas de catalyseur : tout le mécanisme de capture/désorption/sites
  (`_updateCatalystInteractions`, `_syncAttachedPositions`, `_bodyOf`,
  `CATA_*`) disparaît. `_resolvePair` et `_collidePairs` en sortent
  nettement plus courts (chaque molécule est son propre « corps », masse 1).
- Pas de `s.finished` : la réaction restant réversible, il n'y a plus de
  condition d'arrêt définitive (un système à N_A = N_B = 0 avec du C et du D
  peut toujours réagir en sens inverse).

### Quotient de réaction, constante d'équilibre et moyenne glissante

Quatre fonctions, toutes dans `sim.js` :

| Fonction | Rôle |
|---|---|
| `reactionQuotient(c)` | Q<sub>r</sub> = (N<sub>C</sub>×N<sub>D</sub>)/(N<sub>A</sub>×N<sub>B</sub>) **instantané**, depuis un comptage `countSpecies(s)`. En nombre de molécules — proportionnel aux concentrations à volume constant. `null` si indéterminé (0/0), `Infinity` si seul le dénominateur est nul |
| `equilibriumConstant(s)` | K = `probAB / probCD` (cf. démonstration ci-dessous). `null` si les deux probabilités sont nulles, `Infinity` si seul le sens indirect est bloqué |
| `averagedReactionQuotient(s)` | Q<sub>r</sub> **moyenné** sur `QR_AVG_WINDOW_MS` = 40 s de temps simulé, soit `QR_AVG_SAMPLES` = 200 points à `HISTORY_PERIOD` = 200 ms. Lecture en O(1) d'un tampon circulaire à sommes courantes (cf. plus bas), indépendant de `s.history` |
| `theoreticalEquilibrium(s)` | quantités **N_A/B/C/D théoriques à l'équilibre** (cf. section dédiée), affichées en pointillés sur le graphe |

#### Pourquoi K = probAB / probCD

Toutes les molécules ont le même rayon et la même distribution de vitesses
(ni température ni taille par espèce sur cette page) : la fréquence des
chocs A+B et celle des chocs C+D partagent donc le **même facteur
géométrique**, et ne diffèrent que par le produit des populations. Chaque
choc étant efficace avec la probabilité réglée par son slider, l'égalité des
deux vitesses à l'équilibre s'écrit :

```
N_A·N_B · p_AB = N_C·N_D · p_CD   ⟹   K = ⟨N_C·N_D⟩ / ⟨N_A·N_B⟩ = p_AB / p_CD
```

C'est la valeur que la frise matérialise, et la cible de la moyenne
glissante.

#### Pourquoi moyenner les PRODUITS et non Qr

`averagedReactionQuotient()` cumule `ΣN_C·N_D` et `ΣN_A·N_B` séparément puis
divise — jamais `Σ(N_C·N_D / N_A·N_B)`. Deux raisons, toutes deux
importantes :

1. c'est ⟨N_C·N_D⟩/⟨N_A·N_B⟩ qui vaut **exactement** K à l'équilibre (cf.
   ci-dessus). Moyenner Q<sub>r</sub> lui-même estimerait ⟨N_C·N_D /
   (N_A·N_B)⟩, une quantité différente et **biaisée vers le haut** (un
   rapport est convexe en son dénominateur — inégalité de Jensen), donc
   systématiquement au-dessus de K ;
2. un seul échantillon avec N_A·N_B = 0 donnerait un Q<sub>r</sub> infini qui
   contaminerait définitivement une moyenne de Q<sub>r</sub>, alors qu'ici il
   n'ajoute que 0 au dénominateur cumulé.

#### La fenêtre de moyennage se réinitialise avec K

Changer une probabilité change K, sans RAZ (cf. `setReactionProbability`
ci-dessus). Sans précaution, la fenêtre glissante de 40 s continuerait donc à
mélanger, pendant ces 40 s, des échantillons visant l'ANCIEN K et le
NOUVEAU — la moyenne affichée dériverait de façon trompeuse au lieu de
sauter proprement vers la nouvelle cible.

`setReactionProbability()` appelle donc `_resetQrWindow(s)` — qui vide
intégralement le tampon et remet ses sommes à zéro — dès qu'une probabilité
change **réellement** (comparée à l'ancienne valeur : un slider ramené à sa
position courante ne doit pas tronquer la fenêtre inutilement). Plus aucun
échantillon antérieur au dernier changement de K ne peut alors entrer dans
la moyenne, qui redémarre de zéro (au sens statistique) à chaque changement
de probabilité. `initMolecules()` fait le même appel à chaque RAZ.

(Le rapport des sommes égale le rapport des moyennes — même nombre de
termes — d'où l'absence de division par le compte dans le code.)

#### Le tampon circulaire

La fenêtre n'est pas relue dans `s.history` : `_pushQrSample(s, c)` entretient
un tampon circulaire de `QR_AVG_SAMPLES` = 200 cases (`s._qrAB` / `s._qrCD`,
tête `s._qrHead`) **et** les sommes courantes `s._qrSumAB` / `s._qrSumCD`, en
retranchant l'échantillon évincé et en ajoutant le nouveau.
`averagedReactionQuotient()` se réduit alors à une division. Les échantillons
étant des produits d'entiers très en deçà de 2⁵³, ce cumul incrémental reste
**exact** : aucune dérive de virgule flottante n'est possible.

Ce découplage a une seconde conséquence, essentielle : le tampon est alimenté
à **chaque** échantillon, y compris après que `s.history` a cessé de
s'allonger (cf. `HISTORY_MAX_MS` ci-dessous). La frise continue donc de vivre
indéfiniment alors que le graphe N(t) est figé.

#### L'historique du graphe est plafonné à 5 min

Au-delà de `HISTORY_MAX_MS` = 300 000 ms de temps simulé,
`recordHistoryPoint()` échantillonne toujours (comptage, tampon Q<sub>r</sub>,
`friseDirty`) mais **n'ajoute plus** de point à `s.history` : le graphe N(t)
garde le tracé de ses 5 premières minutes.

Deux motifs, l'un pédagogique et l'autre de performance :

- tout ce qui porte le propos — la montée puis le plateau d'équilibre — se
  joue très en amont de cette limite ; laisser l'axe des temps s'étirer
  indéfiniment ne ferait qu'écraser cette partie-là ;
- le coût de tracé du graphe est d'un `lineTo` par point et par courbe
  visible : sans borne, il croît linéairement avec la durée de la séance.
  5 min = 1500 points, soit ~4 points par pixel de large — la borne tombe
  bien après que la courbe a cessé d'apporter de l'information.

La simulation elle-même n'est jamais interrompue : molécules, readouts,
frise et moyenne glissante restent vivants.

#### Amplitude attendue des fluctuations

L'écart-type relatif de Q<sub>r</sub> instantané vaut
√(1/N_A + 1/N_B + 1/N_C + 1/N_D) (approximation de bruit linéaire sur le
processus de naissance-mort de l'avancement ξ, avec
Var(ξ) ≈ 1/Σ(1/N_i) — l'analogue à 4 termes du résultat binomial classique
d'un équilibre A ⇌ B). Soit **±40 % à N_total = 100**, ±17 % à 600, ±12 % à
1200. Moyenner sur 100 points divise ce bruit par ~10.

Ce bruit n'est pas un défaut à cacher : c'est précisément parce que
N ~ 10²³ en chimie réelle que K se présente comme une constante bien
définie. À l'échelle visible de quelques centaines de molécules, l'élève voit
*pourquoi* il faut un très grand nombre de particules pour qu'un équilibre
statistique se lise comme une valeur stable — d'où le choix d'afficher
simultanément l'instantané (qui s'agite) et la moyenne (qui converge).

Ces deux valeurs (instantanée et moyennée) ne sont affichées que sur la
frise — elles ont été retirées du bloc `.readout` du panneau (« Quantités
actuelles »), qui ne montre plus que le décompte brut A/B/C/D : la frise est
le seul endroit dédié à la lecture de Qr, la duplication n'apportait rien.

### Quantités théoriques à l'équilibre — `theoreticalEquilibrium(s)`

Bouton **« Quantités finales théoriques »** (`.btn-toggle-one`, repris de
`diffraction/`), juste après les 2 sliders de probabilité — un par
simulation, état porté par `s.showTheoretical`. Affiche sur le graphe, en
pointillés horizontaux, les 4 valeurs N_A/B/C/D vers lesquelles le système
devrait converger.

Toute la réaction se résume à un seul degré de liberté, l'**avancement ξ**
(chaque événement, dans un sens ou dans l'autre, échange exactement 1 A + 1
B contre 1 C + 1 D) : N_A = N0_A−ξ, N_B = N0_B−ξ, N_C = N0_C+ξ, N_D = N0_D+ξ.
Résoudre Qr(ξ) = K donne l'équation du second degré

```
(K−1)·ξ² − [K·(N0_A+N0_B) + (N0_C+N0_D)]·ξ + (K·N0_A·N0_B − N0_C·N0_D) = 0
```

dont la racine physiquement valide est celle tombant dans
[ξ_min, ξ_max] = [−min(N0_C,N0_D), min(N0_A,N0_B)] — l'intervalle sur lequel
les 4 quantités restent positives ou nulles. Un argument des valeurs
intermédiaires garantit qu'il en existe exactement une dans cet intervalle
pour tout K fini non nul (aux deux bornes, un des deux membres de
Qr(ξ)=K s'annule, avec un signe opposé) ; les cas K = 0, K = ∞ et K = null
(un slider de probabilité à 0 %, ou les deux) sont traités à part, la
réaction n'étant alors possible que dans un seul sens ou dans aucun.

`_axisBounds()` (dans `graph.js`) inclut ces valeurs théoriques dans le
calcul du yMax des DEUX graphes affichés (mode 2 simulations) quand
`s.showTheoretical` est actif : sans ça, les pointillés resteraient hors
cadre tant que la courbe pleine correspondante n'a pas encore rejoint cette
hauteur. `drawChart()` les trace après les courbes pleines (par-dessus,
lignes fines discontinues, une par espèce visible), dans la couleur
`SPECIES_COLORS` de l'espèce concernée.

**Redessin en direct** : `toggleTheoretical(i)` (dans `ui.js`) et les
handlers `onSliderProbAB/CD()` appellent `drawAllCharts()` (pas seulement
`drawChart(s)`) après tout changement de K ou de bascule du bouton — sans
quoi les pointillés resteraient figés jusqu'au prochain point d'historique
(~200 ms plus tard) au lieu de suivre le réglage en direct, et une bascule
sur une seule simulation ne mettrait pas à jour l'échelle commune de
l'autre.

---

## `js/frise.js` — Axe du quotient de réaction

Fichier **propre à cette page**, chargé après `graph.js` et avant `ui.js`.
Un canvas par simulation (`#frise-canvas-1 / -2`), API calquée sur
`graph.js` : `attachFrise(s)`, `resizeFrise(s)`, `resizeFriseAll()`,
`drawFrise(s)`, `drawAllFrises()`.

La frise apporte la lecture qui manque au graphe N(t) : on y voit bien les
quantités se stabiliser, mais pas **vers quoi** elles tendent. Trois repères
sur un axe horizontal unique :

| Repère | Rendu | Rôle |
|---|---|---|
| **K** | trait vertical pointillé gris ardoise (`#2c3e50`) + libellé sur la ligne du haut | référence fixe (ne bouge qu'avec les sliders de probabilité) |
| **Q<sub>r</sub> moyenné** | pastille pleine ambre (`#c08020`) posée **sur** l'axe + libellé sur la 2ᵉ ligne | la mesure qui porte le propos : une perle qui glisse jusqu'à se coller au trait de K |
| **Q<sub>r</sub> instantané** | aiguille fine et pâle, sans libellé | montre que le bruit est réel ; masquable (`s.showQrInstant`, case sous la frise) |

Les deux marqueurs Q<sub>r</sub> partagent la même teinte (même grandeur
physique) et K est neutre : l'œil sépare « la cible » de « la mesure » avant
de lire les libellés. Ce choix évite aussi de piocher dans les couleurs
A/B/C/D, déjà toutes prises.

**Les deux libellés sont à des hauteurs différentes** (`rowK` puis `rowQr`) :
ils se chevauchent horizontalement précisément dans le cas intéressant
(Q<sub>r</sub> → K), il faut donc qu'ils ne se disputent pas la même ligne.
`_friseText()` recentre par ailleurs chaque libellé en le maintenant dans le
cadre, sinon un marqueur près d'un bord aurait son texte tronqué.

### Échelle logarithmique

`FRISE_QR_MIN` = 0,01 à `FRISE_QR_MAX` = 100, soit deux décades de chaque
côté de 1 — exactement la plage des K finis non nuls atteignables avec deux
sliders entiers de 0 à 100 % (1/100 à 100/1).

Le log est ici le seul choix praticable : sur un axe linéaire, K = 100
écraserait toute la région Q<sub>r</sub> < 10 en une poignée de pixels, et
K = 0,01 serait indiscernable de 0. Il place en outre K = 1 pile au centre
(position de repos quand les deux probabilités sont égales) et rend la
lecture « Q<sub>r</sub> à gauche / à droite de K » valable quels que soient
les réglages. Les graduations mineures (2×10ⁿ … 9×10ⁿ) sont indispensables :
sans elles une échelle log se lit comme une échelle linéaire.

`_friseClamp()` ramène 0 et l'infini (tous deux atteignables : N_C = 0 →
Q<sub>r</sub> = 0, N_A = 0 → Q<sub>r</sub> infini) dans les bornes, et
`_friseOffScale()` fait ajouter « (hors échelle) » au libellé — sans quoi un
marqueur plaqué contre un bord se lirait comme une mesure exacte.

### Cadence de rafraîchissement

`drawAllFrises()` est appelé depuis `loop()` sur le drapeau `friseDirty`,
donc à la cadence des échantillons (~5 Hz de temps simulé). Les graphes ont
leur propre drapeau `historyDirty`, levé seulement quand un point a
effectivement été **ajouté** à `s.history` : passé `HISTORY_MAX_MS`, les
graphes cessent d'être redessinés alors que les frises continuent. Trois
appels explicites complètent ce flux, chacun pour un cas où aucun
échantillon n'est produit :

- `syncUIToSim()` → couvre l'init et toutes les RAZ (y compris celles
  déclenchées par un slider de quantité) ;
- `onSliderProbAB/CD()` → K vient de bouger alors que la simulation peut
  être en pause ;
- `onToggleQrInstant()` → l'aiguille apparaît ou disparaît.

---

## `index.html` / `css/style.css` — Ce qui change

- Équation affichée : **A + B ⇌ C + D** (flèche d'équilibre) au lieu de
  A + B → C + D.
- 4 sliders de quantité initiale (A, B, C, D) au lieu de 2, plus 2 sliders
  de probabilité, au lieu du slider Température et du slider Catalyseurs
  (+ case « Afficher le rayon d'action », qui disparaît avec lui).
- Bouton **« Quantités finales théoriques »** (`.btn-toggle-one`, repris de
  `diffraction/`) juste après les sliders de probabilité — cf. section
  dédiée plus haut.
- Le bloc `.readout` (« Quantités actuelles ») ne montre plus que le
  décompte A/B/C/D : Q<sub>r</sub> instantané et moyenné, qui y vivaient
  d'abord, ont été retirés au profit de la frise, seul endroit dédié à leur
  lecture.
- Identifiants renommés `cinetique-*` → `equilibre-*` (équation, légende,
  graphe) pour éviter toute ambiguïté entre les deux pages.

### Disposition graphe / frise

Hiérarchie dans `.graph-area` : équation (simulation 1 seulement), onglets
`.view-tabs`, puis `.view-body` qui contient `.chart-wrap` et
`.frise-block` (encart des formules, `.frise-wrap` avec le canvas, case à
cocher).

- **mode 1 simulation** : les deux vues sont affichées, l'une sous l'autre.
  La frise est en `flex: 0 0 auto` (son contenu n'a aucune marge verticale)
  et c'est le graphe, en `flex: 0 1 auto`, qui cède de la hauteur si la
  fenêtre est courte ;
- **mode 2 simulations** : la place manque pour les deux. Les onglets
  `.view-tabs` (porteurs de `.duo-only`, donc invisibles en mode simple)
  laissent choisir **par simulation**. `setView(i, view)` écrit `s.view` et
  bascule la classe `.view-frise` sur `#graph-area-<i>` ; deux règles CSS
  sous `body.duo` masquent alors l'une ou l'autre vue.

**Pourquoi `.view-body` existe** : ce conteneur intermédiaire est en
`flex: 1 1 auto`, donc il absorbe tout l'espace libre de la colonne. Cela
annule l'effet du `justify-content: center` de `.graph-area` et **ancre les
onglets à une hauteur fixe**. Sans lui, les deux vues n'ayant pas la même
hauteur, l'ensemble se recentrait à chaque bascule et les onglets se
déplaçaient verticalement — un bouton qui bouge sous le curseur à l'instant
où on le clique.

**Piège du canvas masqué** : un canvas en `display:none` a une taille nulle,
donc `resizeFrise()`/`resizeChart()` sortent sans rien faire. `setView()`
redimensionne donc explicitement la vue qui **redevient** visible, sinon
elle resterait vide.

### Encart des formules

Q<sub>r</sub> = (N<sub>C</sub>×N<sub>D</sub>)/(N<sub>A</sub>×N<sub>B</sub>)
puis K = p(A+B)/p(C+D), cette dernière suivie de sa **valeur numérique**
(`#frise-K-val-<i>`) : c'est le seul endroit où K est chiffré hors de la
frise, et cela rend le bloc non redondant entre les deux simulations, qui
peuvent avoir des probabilités différentes.

Trois partis pris de présentation, tous dictés par la **vidéoprojection** —
ce contenu doit se lire depuis le fond de la classe :

- **carte blanche bordée** (`.frise-formulas`), sur le modèle de `.readout`
  du panneau, et police jusqu'à 25 px : ce sont des formules de cours, pas
  une annotation technique ;
- **vraies fractions à deux étages** (`.ff-frac` / `.ff-num` / `.ff-den`,
  barre en `border-bottom: currentColor`) plutôt qu'une écriture en ligne
  avec parenthèses : l'œil n'a pas à reconstituer les priorités ;
- **lettres d'espèce colorées** (classes `.sp-A` … `.sp-D`, couleurs posées
  par `ui.js` depuis `SPECIES_COLORS`, toujours la même source unique) :
  relie visuellement la formule aux molécules du bécher et aux courbes.

La taille de police de l'encart est calée sur la **largeur**, pas sur la
hauteur : les deux fractions côte à côte occupent ~16,2 × la taille de
police (plus ~72 px de filet, gaps et rembourrage), et la colonne graphe
vaut 40 % de ce qui reste après le panneau. D'où
`clamp(12px, calc(2,1vw − 9px), 30px)`, vérifié sous la limite de 1024 px à
2560 px de large avec ~10 % de marge. `overflow: hidden` sur l'encart reste
le garde-fou si une police système large déjouait l'estimation.

---

## Responsivité — les trois points de rupture

Les `clamp()` suffisent pour une réduction progressive, mais trois
situations demandaient un changement de **mise en page**, pas seulement
d'échelle. Chacune correspondait à un défaut constaté.

### 1. Le débordement qui recouvrait les onglets

`.frise-block` était en `flex: 0 0 auto` (incompressible) : sur une fenêtre
courte, son contenu dépassait de `.view-body`, et comme celui-ci est en
`justify-content: center`, le débordement se répartissait **des deux côtés**
— la moitié haute remontait donc par-dessus les onglets, qui se retrouvaient
recouverts par le cadre du graphe ou de la frise.

Trois correctifs cumulés :

- `.frise-block` passe en `flex: 0 1 auto` + `min-height: 0`, et
  `.frise-wrap` en `flex: 0 1 auto` avec `min-height: 56px` : la frise peut
  désormais céder de la hauteur (sa hauteur `clamp()` devient une hauteur
  *souhaitée*). `resizeFrise()` lisant `clientHeight`, le canvas suit la
  hauteur réellement obtenue ;
- `overflow: hidden` sur `.view-body` : garantie dure que rien ne peut plus
  peindre par-dessus les onglets ;
- `justify-content: safe center` sous `@supports` (repli `center`) : en cas
  de débordement résiduel, le contenu s'aligne en haut au lieu d'être rogné
  symétriquement, ce qui préserverait sinon… le bas plutôt que le haut de
  l'encart.

### 2. Les deux formules qui ne tiennent plus sur une ligne

Sous ~1100 px de large, la colonne graphe ne loge plus les deux fractions
côte à côte, même à la taille de police minimale. `@media (max-width:
1100px)` les fait alors s'empiler (`flex-wrap: wrap`) et **masque le filet
séparateur**, qui ne sépare plus rien horizontalement.

### 3. Les hauteurs

`@media (max-height: 760px)` puis `560px` réduisent progressivement les
marges, l'encart, les onglets et la hauteur de la frise — dans cet ordre de
priorité, l'axe et ses marqueurs étant le contenu porteur de sens.

### ⚠ L'ordre des blocs `@media` est significatif

Une `@media` **n'ajoute aucune spécificité**. Les blocs de hauteur et celui
de largeur visent les mêmes sélecteurs (`.view-tab`, `.frise-wrap`) avec la
même spécificité : sur une fenêtre à la fois basse *et* étroite, c'est le
**dernier déclaré** qui gagne. D'où l'ordre retenu — hauteurs d'abord,
largeur en dernier : le débordement horizontal des onglets est le symptôme
le plus visible, la contrainte de largeur doit donc avoir le dernier mot sur
leur rembourrage.

Corollaire : tout bloc qui touche `.frise-wrap` doit **redéclarer**
`body.duo .frise-wrap`, sinon la règle de base (spécificité 0-2-1) écrase le
`.frise-wrap` (0-1-0) de la requête.

### Régime « compact » du canvas de la frise

Police interne = `H × 0,17` bornée à 31 px, la répartition verticale (deux
lignes de libellés, zone des marqueurs, ligne des graduations) consommant
~5,1 × la police. En dessous de 13 px de police — soit ~77 px de hauteur de
canvas — respecter ce budget donnerait un rendu illisible : `drawFrise()`
bascule alors en **compact** (`FRISE_FS_FULL_MIN`), c'est-à-dire police
`H × 0,30` bornée à [9, 15] px et **libellés chiffrés supprimés**. Toute la
hauteur va à l'axe, ses graduations et les marqueurs, dont les *positions*
portent déjà l'essentiel du message (Q<sub>r</sub> à gauche ou à droite de K,
et à quelle distance) ; les valeurs chiffrées, elles, restent visibles dans
le panneau et dans l'encart des formules.

Vérifié sans débordement de 56 px (le plancher `min-height`) à 280 px de
hauteur de canvas, avec une zone de marqueurs qui ne descend jamais sous
21 px.

---

## Rayon des molécules — dépendant de N, pas une constante

`cinetique/` utilise un `MOL_RADIUS_FRAC` fixe. Ici, les quantités
réglables vont jusqu'à 300 par espèce (1200 au total par simulation, 2400
en mode 2 simulations) : un rayon fixe assez petit pour loger ce maximum
rendrait le libre parcours moyen ridiculement long aux réglages par défaut
(quelques dizaines de molécules), et inversement un rayon confortable à
faible N ne laisserait pas la place à 1200 molécules.

`molRadiusFrac(nTotal)` (dans `sim.js`) interpole donc la fraction de rayon
en fonction du total N_A+N_B+N_C+N_D de la simulation concernée :
- **taille pleine** (`MOL_RADIUS_FRAC_FULL` = 0,007, identique à
  `cinetique/`) tant que `nTotal ⩽ 600` ;
- **décroissance linéaire** jusqu'à `MOL_RADIUS_FRAC_MIN` (0,007 × 0,45) à
  `nTotal = 1200` ;
- plafonnée à `MOL_RADIUS_FRAC_MIN` au-delà.

Un rayon plus petit à fort N n'est pas qu'une question de place : il
augmente aussi le libre parcours moyen à densité égale (ℓ ∝ 1/diamètre en
2D, donc le coefficient de diffusion D ∝ v·ℓ), ce qui limite la
**ségrégation spatiale** des réactifs — un phénomène réel de cinétique en
dimension basse où, à réaction rapide, des poches locales appauvries en un
réactif peuvent apparaître et persister faute d'un mélange par diffusion
suffisamment rapide pour les réapprovisionner.

`resizeRecipient(s)` (dans `recipient.js`) calcule `s.molRadius` à partir de
`molRadiusFrac(s.N0_A + s.N0_B + s.N0_C + s.N0_D)` — il faut donc l'appeler
à chaque fois que ces quantités changent, PAS seulement au redimensionnement
de la fenêtre : `setSpeciesCount()` et `resetSim()` (dans `sim.js`)
l'appellent explicitement avant `initMolecules()`, sans quoi les molécules
seraient placées avec un rayon périmé.

---

## Fichiers inchangés dans leur logique

- `js/recipient.js` : identique à `cinetique/` pour le rendu et la
  géométrie, minus le rendu du catalyseur et du halo de rayon d'action
  (`_drawActionRadii` supprimée) — voir cependant la section précédente
  pour le calcul du rayon, propre à cette page.
- `js/graph.js` : identique à `cinetique/` (bornes d'axes communes, survol,
  légende à checkboxes) — seuls les id DOM et les libellés de légende (A/B/C/D
  simples, sans distinction réactif/produit, la réaction étant réversible)
  changent.
- `js/ui.js` : même boucle RAF et même logique de synchronisation. S'y
  ajoutent les handlers propres à cette page (`setView`,
  `onToggleQrInstant`, les 4 quantités et les 2 probabilités au lieu de
  température/N_A/N_B/catalyseurs) et les appels de rendu de la frise.

---

## Ordre de chargement et dépendances

```
index.html
  └── js/sim.js         expose : createSim, sims, simCount, activeSims, paused,
  │                              speedFactor, SPECIES_COLORS, molRadiusFrac,
  │                              randomVelocity, countSpecies, initMolecules,
  │                              setSpeciesCount, setReactionProbability,
  │                              reactionQuotient, averagedReactionQuotient,
  │                              equilibriumConstant, theoreticalEquilibrium,
  │                              stepPhysics, resetSim
  │
  └── js/recipient.js    dépend de : sims, molRadiusFrac, SPECIES_COLORS
  │                       expose : attachCanvas, resizeAll, resizeRecipient,
  │                                drawScene
  │
  └── js/graph.js        dépend de : sims (history, _histMax, chartVisible),
  │                                 SPECIES_COLORS
  │                       expose : attachChart, resizeChartAll, resizeChart,
  │                                drawChart, drawAllCharts, buildChartLegend
  │
  └── js/frise.js        dépend de : sims (history, probAB/probCD, showQrInstant),
  │                                 countSpecies, reactionQuotient,
  │                                 averagedReactionQuotient, equilibriumConstant
  │                       expose : attachFrise, resizeFriseAll, resizeFrise,
  │                                drawFrise, drawAllFrises
  │
  └── js/ui.js            dépend de : tous les fichiers précédents
                          expose : togglePause, onSliderSpeed, setSimCount,
                                   setView, onToggleQrInstant, toggleTheoretical,
                                   onSliderNA/NB/NC/ND, onSliderProbAB/ProbCD,
                                   syncUIToSim, updateReadouts
                          démarre : init() → requestAnimationFrame(loop)
```

`sim.js` appelle `resizeRecipient()` (défini dans `recipient.js`, chargé
*après* lui) et `syncUIToSim()` (dans `ui.js`) derrière des gardes
`typeof … === 'function'` : ces appels n'ont lieu qu'à l'exécution, jamais au
chargement, mais la garde évite tout piège si l'ordre des `<script>` change.
