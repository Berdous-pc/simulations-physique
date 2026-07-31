# Architecture — `atome/` (Structure électronique des atomes)

> Simulation « Structure de la matière » (Seconde) : les 3 premières lignes du
> tableau périodique (H → Ar). Un clic sur un élément affiche le schéma de son
> atome : noyau (protons/neutrons de l'isotope le plus abondant), cercles des
> sous-couches électroniques (1s, 2s, 2p, 3s, 3p) avec électrons équirépartis.
> Le nom de l'élément s'affiche en gros au-dessus du schéma ; un bandeau sous
> le schéma rappelle Z, A et la configuration électronique écrite. Un mode
> **Comparer** coupe la zone en deux pour afficher côte à côte l'atome
> sélectionné et un second choisi dans une liste.

## Fichiers

```
atome/
├── index.html       ← structure HTML uniquement
├── ARCHITECTURE.md  ← ce fichier
├── css/
│   └── style.css    ← tout le CSS (charte du site)
└── js/
    ├── sim.js       ← données (ELEMENTS, SUBSHELLS) + état global (chargé en premier)
    ├── draw.js      ← rendu canvas du schéma de l'atome
    ├── ui.js        ← tableau périodique cliquable, panneau, resize, init
    └── test.js      ← mode test (quiz) — chargé en dernier
```

Scope global (pas de modules ES) — l'ordre de chargement `sim → draw → ui → test`
est critique (`ui.js` fait l'init au chargement ; `test.js` n'expose que des
gestionnaires appelés plus tard, il peut donc venir après).

## Données (`sim.js`)

- `ELEMENTS[Z-1]` : `{ Z, sym, nom, art, A }` pour Z = 1 à 18.
  `A` = nombre de nucléons de **l'isotope le plus abondant** (choix acté avec
  l'auteur, ex. Cl-35, Ar-40). `art` = article pour les légendes (« d’ » / « de »).
- `SUBSHELLS` : les 5 sous-couches du programme de Seconde (`1s 2s 2p 3s 3p`),
  chacune avec sa capacité et **sa couleur** (utilisée pour le cercle,
  l'étiquette et le terme correspondant de la configuration écrite).
- `getConfig(Z)` : remplissage dans l'ordre de `SUBSHELLS` → `[{ sub, count }]`.
- `getMaxNAffiche(Z)` : quand l'option « sous-couches vides » est active, on
  montre les sous-couches vides **jusqu'à la période suivante** (plafonné à
  n = 3). Ex. : O (période 2) → 3s⁰ 3p⁰ affichés en pointillés atténués.
- `GAZ_NOBLES` / `estGazNoble(Z)` : He, Ne, Ar — mis **en gras** dans le
  sélecteur « Comparer avec » du panneau.
- `state` : `{ Z, showEmpty, showLegend, eclate, charge, compare, Zcmp }`
  (`compare` = zone de schéma coupée en deux, `Zcmp` = élément comparé).
  `showEmpty` s'applique aussi bien aux cercles du schéma (`getShellsAffichees`)
  qu'à la configuration écrite du bandeau d'informations (`drawConfigLigne`).

## Rendu (`draw.js`)

Rendu **statique hors interaction** : `render()` est appelé à chaque
changement d'état ou de taille ; une boucle `requestAnimationFrame` ne tourne
que pendant l'animation d'éclatement (et un `rAF` ponctuel pendant le drag).

- **Noyau 3D** : empilement compact obtenu par **relaxation** — les A billes
  partent de positions aléatoires (seedées par Z via `mulberry32`, cache
  `_nucleusCache` → disposition stable), puis 250 itérations « attraction
  vers le centre (×0,96) + séparation des paires plus proches que 1,96 rayon
  de bille ». Cet écart, volontairement proche de 2 (billes qui se touchent
  quasiment) plutôt que franchement inférieur, limite l'interpénétration 3D
  réelle des billes — donc les zones où le tri par profondeur (`z`) devient
  instable et fait « sauter » le contour d'une bille au-dessus de l'autre au
  moindre changement d'angle de vue (le contour lui-même est aussi tracé
  discret, `rgba(60,40,30,0.16)`, pour la même raison). Converge vers les
  vraies formes compactes : haltère pour A = 2,
  tétraèdre pour l'hélium, boule quasi sphérique au-delà. Recentrage sur le
  barycentre, tri par distance au centre, protons (rouge) et neutrons (blanc)
  **entrelacés régulièrement** le long de l'ordre radial (pas de paquets
  d'une même couleur), billes en dégradé radial.
  **Rotation trackball** : drag n'importe où sur le canvas (pointer events) ;
  une matrice de rotation cumulée (`_rotM`, `rotateBy()` prémultiplie des
  rotations autour des axes de l'écran) fait rouler le noyau sous le curseur
  quelle que soit l'orientation déjà atteinte — pas de cumul lacet/tangage,
  donc pas de geste « inversé » aux grandes rotations. Projection 3D → écran
  dans `projectPt()`, billes triées d'arrière en avant, réduites et
  assombries au fond (effet perspective).
- **Vue éclatée** (`state.eclate`, bouton « 💥 Éclater le noyau » du panneau,
  fonction `startNucAnim(dir)`) : les nucléons quittent le noyau **un par un,
  de l'extérieur vers le centre** (`rank` calculé dans le layout), cadence
  accélérée (`departDelay` : suite géométrique `NUC_G0`/`NUC_RATIO`, vol
  `NUC_FLIGHT` ms, trajectoire Bézier quadratique passant au-dessus) et se
  rangent dans un **cadre de comptage** à gauche : protons puis neutrons,
  **lignes de 5**, avec compteurs « A = … nucléons / Z = … protons /
  N = … neutrons ». Le **fantôme** du noyau reste affiché (billes parties en
  `alpha 0.20`) et reste rotatif. `dir = -1` rejoue l'animation en sens
  inverse (« ↺ Rassembler »). Les positions de départ sont figées en unités
  de rayon de bille (`_freeze`) → insensibles au redimensionnement. Fin
  d'animation signalée à `ui.js` par le hook `onNucAnimEnd()` (réactive le
  bouton) ; changement d'élément → `resetNucVue()`.
- **Vue charge** (`state.charge`, bouton « ⚡ Visualiser la charge » du
  panneau, fonction `startChargeAnim(dir)`) : même mécanique que la vue
  éclatée, mais deux colonnes **protons/électrons** (réutilise
  `getFrameGeom()`/`slotPos()` avec un élément fictif `{ Z, A: 2Z }` pour que
  `nP = nN = Z`). Les protons partent du noyau (position 3D figée dans
  `_freezeCharge`, comme `_freeze`) ; les électrons partent de leur position
  fixe sur leur cercle de sous-couche (`getElectronLayout()`, pas besoin de
  figeage). Protons et électrons sortent **en alternance un par un**
  (proton 0, électron 0, proton 1, électron 1, … — `chargeProgressP`/
  `chargeProgressE`, rangs entrelacés 2s/2s+1 sur une échelle totale de 2Z),
  même cadence accélérée que `nucProgress`. **Mutuellement exclusive** avec la vue
  éclatée du noyau (`toggleEclate()`/`toggleCharge()` dans `ui.js`) : activer
  l'une referme l'autre **instantanément** (pas de contre-animation) avant de
  lancer sa propre animation. Fin d'animation → hook `onChargeAnimEnd()` ;
  changement d'élément → `resetChargeVue()`.
- **Sous-couches** : cercles concentriques à **échelle commune à tous les
  atomes** (`rStep = Rmax / 5`, le nombre total de sous-couches de la page) :
  une sous-couche donnée a le même rayon quel que soit l'élément, et le rayon
  des billes du noyau est lui aussi constant (l'amas grossit avec A).
  Tirets pour `s`, pointillés pour `p` (repris dans la légende HTML).
  Sous-couche vide : trait et étiquette en `globalAlpha 0.55`.
- **Électrons** : équirépartis sur leur cercle (choix acté), angle de départ
  décalé par sous-couche pour éviter les alignements. Disque bleu charte
  `#2a6aaa` + signe − blanc, halo couleur fond pour se détacher du trait.
- **Étiquettes** (`1s`, `2s`…) : posées sur le cercle à des angles alternés
  (`LABEL_ANGLES`), halo `#fdf8f0` pour rester lisibles.
- **Bandeau d'informations** (`drawInfosAtome`, sous chaque schéma, mode
  normal comme comparaison — pas de box HTML séparée) : rappel `Z = … A = …`
  puis la configuration électronique colorée, préfixée du symbole
  (`drawConfigLigne`, ex. « O : 1s² 2s² 2p⁴ »), exposants surélevés à la main
  (pas de `<sup>`, tout est dessiné au canvas). Si `state.showEmpty` est actif,
  les sous-couches vides jusqu'à la période suivante sont ajoutées entre
  parenthèses en `globalAlpha 0.55`, même règle que `getMaxNAffiche()`.
  `renderAtome()` réserve une bande basse `infoH = max(34, _h*0.16)` pour ce
  bandeau, en plus de la place du schéma.
- **Mode comparaison** (`state.compare`) : `render()` n'est qu'un aiguillage,
  tout le dessin d'un atome (schéma + bandeau d'informations) est dans
  `renderAtome(Z, x0, w)` qui travaille dans la bande verticale `[x0, x0 + w]`
  du canvas (variables de vue `_vx` / `_vw`, à la place de `_w` — cf. aussi
  `getFrameGeom()`). En comparaison, `renderAtome()` est appelée deux fois
  (élément sélectionné à gauche, `state.Zcmp` à droite) avec un trait
  pointillé de séparation (`drawSeparateurCompare`). La rotation du noyau
  (drag) est commune aux deux atomes ; la **vue éclatée est désactivée** en
  comparaison (le cadre de comptage ne tient pas dans une demi-zone).
- Canvas dimensionné avec `devicePixelRatio` (cf. CONTEXTE_PROJET §7).

## UI (`ui.js`)

- `buildTP()` : construit le tableau périodique réduit en CSS grid 18 colonnes.
  `colonneTP(Z)` place chaque élément dans sa vraie colonne (H col 1, He col 18,
  blocs s en colonnes 1-2, bloc p en colonnes 13-18). Chaque case affiche
  A (haut gauche), Z (bas gauche) et le symbole (centre) — notation AZX.
- `selectElement(Z)` : met à jour la sélection, le schéma, le titre
  (`#atom-title-a`, nom de l'élément) et relance le rendu — `majInfos()` ne
  gère plus que les titres HTML, le reste (Z, A, configuration) est dessiné
  au canvas par `drawInfosAtome()` (draw.js).
- **Comparaison** : le panneau porte un titre (`.panel-title`, même charte que
  `cinetique/`), puis le bouton bascule `#btn-comparer` (`toggleCompare()`) et,
  juste dessous, le sélecteur `#cmp-select` des 18 éléments par Z croissant
  (`buildCompareSelect()`, gaz nobles en gras via `.opt-noble` ; `majSelectNoble()`
  reporte le gras sur le libellé refermé). `setCompareZ()` change l'élément
  comparé. Entrer en comparaison pose `body.compare` (réduit le titre, affiche
  le second nom d'élément `#atom-title-b`), referme la vue éclatée et
  désactive son bouton. `majCompareTP()` pose un liseré orangé
  (`.tp-cell.compared`) sur la case de l'élément comparé.
- Options : `toggleEmpty()` (sous-couches vides), `toggleStable()` (pastille de
  stabilité), `toggleLegend()` (légende).
- Élément par défaut au chargement : oxygène (Z = 8), comparé à l'argon (Z = 18).

## Ionisation (`state.ionQ` / `state.ionQCmp`)

- **Données (`sim.js`)** : `getConfigForN(n)` calcule la configuration pour
  un nombre d'électrons quelconque (`getConfig(Z)` en est le cas neutre).
  `ION_MAX = 3` ; `clampIon(Z, ionQ)` borne la charge à ± ION_MAX et à la
  capacité totale des sous-couches de la page (18, 1s→3p) — un anion ne
  peut donc pas dépasser 18 électrons. `nElectronsIon(Z, ionQ)` = Z - ionQ.
  `ionExposant(ionQ)` → notation classique (`'+'`, `'2+'`, `'-'`, `'2-'`…).
- **Schéma (`draw.js`)** : `getShellsAffichees(Z, nE)` / `getElectronLayout(Z, nE)`
  acceptent un nombre d'électrons distinct de Z (défaut = Z). `renderAtome()`
  calcule `nE` à partir de `state.ionQ`/`state.ionQCmp` (selon `freezeKey`)
  et l'utilise pour le schéma, la vue charge (`drawVueCharge`, colonne
  électrons = nE) et le bandeau d'informations (`drawConfigLigne`, qui
  préfixe aussi le symbole de la charge en exposant).
- **Animation (`addIonFlight`/`_ionFlights`)** : jamais bloquante — chaque
  clic ajoute (ou relance) un vol dans une liste par atome, sans attendre
  les précédents ; des clics rapprochés font donc voler plusieurs électrons
  en même temps. L'électron concerné est toujours celui de la sous-couche
  la plus externe (dernier de l'ordre de remplissage à cet instant) ; il
  file en ligne droite vers le haut hors du cadre (retrait) ou en arrive
  symétriquement (ajout). Chaque vol suit une coordonnée `s ∈ [0,1]`
  (0 = sur son cercle, 1 = hors cadre) et un sens `vel` (±1) ; un clic dans
  le sens opposé sur le **même** slot (électron encore en vol) inverse
  simplement `vel` depuis la position courante → demi-tour continu en vol,
  sans saut. Indépendant de la vue charge : si celle-ci est déjà ouverte,
  aucun vol n'est déclenché, la colonne d'électrons s'ajuste directement
  (cf. `addElectron`/`removeElectron` dans `ui.js`).
- **Panneau (`ui.js`)** : section « Ioniser », boutons `+ e⁻`/`− e⁻` par atome
  (`'main'`/`'cmp'`, ce dernier visible seulement en mode Comparer), libellé
  de charge (`ionLabel`), désactivation pendant toute animation en cours.
  Réinitialisée à 0 par `selectElement()`/`setCompareZ()`.

## Stabilité (`state.showStable`)

- **Donnée (`sim.js`)** : `getStabilite(Z, ionQ)` → `{ stable, n, count, cap, vide }`.
  La **couche de valence** est la couche `n` la plus élevée qui porte des
  électrons ; elle est saturée à `capCouche(n)` (2 pour n = 1 — duet ;
  8 pour n = 2 et n = 3 — octet, dans la portée 1s→3p de la page). Cas
  `vide` : plus aucun électron (H⁺), compté comme stable.
- **Rendu (`draw.js`, `drawBadgeStabilite`)** : pastille « ✓ Stable » (vert)
  ou « ✗ Instable » (rouge) + détail « Couche n saturée./incomplète. ».
  **Placement adaptatif** : la place libre autour du schéma change de côté
  selon la forme de la zone (fenêtre large, étroite, mode comparaison) —
  collée à un coin fixe, la pastille se perdrait dans le vide sur grand
  écran et mordrait sur les sous-couches sur petite fenêtre. Une liste
  d'emplacements candidats est donc évaluée dans l'ordre (diagonale du
  coin haut-gauche du schéma, au-dessus aligné à gauche puis centré, à
  gauche à mi-hauteur, en dessous, coin de la zone) et on retient le
  premier qui tient dans la zone **sans mordre** sur le cercle extérieur
  du cortège (`_ecartRectCercle()`, dépassement de zone compté double), à
  défaut le moins mauvais. La police, calée sur `minDim`, est réduite si
  la pastille ne tient pas dans la largeur de la zone.
  Taille calée sur `minDim` (comme les étiquettes de sous-couches). Suit
  l'ionisation en cours (elle reçoit `ionQ` de `renderAtome()`).

## Mode test (`test.js`)

Même mécanique que `reaction/` et `titrage/` : overlay de choix, 5 questions,
pop-up de correction, score final, 2 essais (1 pt puis 0,5 pt).
`testState = { actif, mode, atomes, idx, score, essais, clos }`.

- **Choix du thème** (`ouvrirConfirmTest()`) — même disposition de fenêtre et
  mêmes zones de saisie dans les deux cas, seule la 3ᵉ ligne de la barre
  change (`.mode-constit` / `.mode-stab`, pilotées par les classes
  `body.test-constit` / `body.test-stab`) :
  - **Constitution des atomes** : 5 atomes tirés **sans remise** parmi les 18
    (`tirerAtomesTest()`). L'élève dispose du nom, de Z et de A ; il renseigne
    le nombre de protons, de neutrons et d'électrons, complète la
    configuration électronique et décrit la couche de valence (numéro +
    nombre d'électrons).
  - **Stabilité des éléments** : 5 éléments tirés sans remise parmi **16** —
    carbone et silicium exclus, ils ne donnent pas d'ion monoatomique
    (`ION_STABLE`, table explicite des charges). Les mêmes questions, mais
    portant sur l'**ion stable** : particules, configuration électronique, et
    **symbole de l'ion** (le symbole de l'élément est donné, la charge
    s'écrit dans une zone posée en exposant). Une **consigne** est dessinée
    sous le rappel Z/A (`state.testConsigne`, `drawConsigneTest()` — texte
    découpé sur `|`, un segment sur deux en gras). Le bouton **Comparer**
    reste actif (`TEST_CTRLS_STAB_ON`) : se repérer par rapport au gaz noble
    voisin est la méthode attendue. Les **gaz nobles** font partie du tirage
    et n'ont pas d'ion : la zone « charge » doit alors rester vide (ou porter
    un 0).

  Réponses attendues : `reponsesAttenduesTest(Z)`, à partir de
  `getConfigForN(nElectronsIon(Z, ionQ))` et `ionExposant(ionQ)` — `ionQ` vaut
  0 en « constitution », `ION_STABLE[Z]` en « stabilité ».
- **Où sont les saisies** — toutes dans `#test-bar`, une barre HTML intercalée
  entre le schéma et le tableau périodique (`#left-col`). Elle n'apparaît
  qu'en mode test : la place vient du schéma, seul élément élastique de la
  colonne (`#atom-zone` est en `flex: 1`), d'où une barre volontairement
  compacte. Pour que le schéma ne rapetisse pas indéfiniment sur une fenêtre
  courte, il reçoit en mode test une hauteur plancher
  (`min-height: clamp(200px, 70vh, 475px)`) et le bas de la colonne défile :
  la barre et le tableau périodique sont réunis dans `#left-bottom` pour
  partager **une seule** barre de défilement (conteneur neutre hors test).
  Le trait de séparation sous le schéma est porté par `#left-bottom` et non
  par `#test-bar`, pour rester visible quand ce bloc a défilé.
  Trois lignes (`.test-bar-row`) :
  1. comptage des particules : protons / neutrons / électrons ;
  2. configuration électronique `1s□ 2s□ 2p□ 3s□ 3p□` (`buildTestBar()`),
     chaque zone de saisie tenant la place de l'exposant, aux couleurs de sa
     sous-couche ;
  3. selon le thème : couche de valence (numéro + nombre d'électrons) ou
     symbole de l'ion (`Cl` + charge en exposant), puis **Valider**.

  Le nom de l'élément (`#atom-title`) et le rappel `Z = … A = …` dessiné sous
  le schéma restent **inchangés** en mode test : `drawInfosAtome()` sort
  simplement avant `drawConfigLigne()` puisque la configuration est à écrire
  en bas. HTML plutôt qu'un overlay au-dessus du canvas : rien à
  resynchroniser au redimensionnement. Le panneau de droite ne porte que le
  bouton d'entrée/sortie du mode test.
- **Le schéma suit la saisie** : `onCfgInput()` écrit dans
  `state.testShells` (un compteur par sous-couche) et relance `render()`.
  Avec `state.testConsigne`, ce sont les **seuls aiguillages du mode test
  dans `sim.js`/`draw.js`** : `getShellsAffichees()` renvoie alors les 5
  sous-couches avec les effectifs saisis (vides comprises), et
  `drawInfosAtome()` remplace la configuration écrite par la consigne. Les
  deux ne valent que pour l'atome **de gauche** (`_curRotKey === 'main'`) :
  en mode Comparer, celui de droite reste dessiné normalement. **Aucun
  garde-fou de capacité** (choix acté) : écrire 1s³ dessine bien 3 électrons
  sur le cercle 1s — c'est à l'élève de savoir.
- **Ce qui est neutralisé** (`setTestUI()`, `TEST_CTRLS_OFF`, classe
  `body.test`) : « Disperser le noyau », « Visualiser la charge »,
  l'ionisation, les options d'affichage et — hors thème « stabilité » — la
  comparaison sont désactivés. `ui.js` reteste `testBloqueControles()` dans
  `majBtnEclate()`/`majBtnCharge()`/`majOneIonBlock()`, sans quoi un simple
  `toggleCompare()` en cours de test réactiverait ces boutons ;
  le tableau périodique reste **consultable mais non cliquable**
  (`pointer-events: none` sur `#tp-grid` — l'atome est imposé par le test) et
  **aucune case n'y est surlignée**, la période trahirait le nombre de
  couches ; la capacité des sous-couches rappelée dans la légende
  (`.leg-cap`, « 2 électrons max ») disparaît aussi.
- **Correction** (`validerTest()`) : les zones fausses passent en rouge
  (`.ko`), tout est vert (`.ok`) et verrouillé en cas de réussite. La zone
  « couche de valence » n'est pas filtrée en numérique, justement pour qu'une
  **sous-couche** écrite à la place du numéro de couche (« 3p ») puisse être
  saisie — elle est comptée **fausse** même quand le chiffre est bon
  (`champCorrect()`), et le message de correction ajoute alors « Attention à
  ne pas confondre couche et sous-couche. » (`estSousCouche()`). Même principe
  pour la **charge** de l'ion (`chargeCorrecte()`) : seule la notation
  classique est acceptée (`2+`, `-`, avec le « 1 » redondant toléré) — `+2`
  est faux et ajoute la remarque sur l'ordre nombre/signe
  (`estChargeInversee()`). Après deux essais, « Voir la réponse »
  (`voirReponseTest()`) remplit les zones et affiche la configuration correcte
  sur le schéma. Entrée = Valider.

## Extensions prévues (discutées avec l'auteur, non implémentées)

- Deep-linking `#hash` (élément sélectionné, élément comparé).
