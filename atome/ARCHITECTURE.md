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
    └── ui.js        ← tableau périodique cliquable, panneau, resize, init (chargé en dernier)
```

Scope global (pas de modules ES) — l'ordre de chargement `sim → draw → ui` est critique.

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
- `state` : `{ Z, showEmpty, showLegend, eclate, compare, Zcmp }`
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
- Options : `toggleEmpty()` (sous-couches vides), `toggleLegend()` (légende).
- Élément par défaut au chargement : oxygène (Z = 8), comparé à l'argon (Z = 18).

## Extensions prévues (discutées avec l'auteur, non implémentées)

- **Ioniser** : retirer/ajouter des électrons, affichage de l'ion formé.
- **Test** : s'entraîner à écrire la configuration électronique et/ou prédire
  l'ion stable — reprendre la mécanique de `reaction/` (score, popup, 2 essais).
- Deep-linking `#hash` (élément sélectionné, élément comparé).
