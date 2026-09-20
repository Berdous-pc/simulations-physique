# Architecture — Simulation Courant électrique

## Arborescence

```
courant/
├── index.html
├── ARCHITECTURE.md         ← ce fichier
├── css/
│   └── style.css
└── js/
    ├── sim.js              ← état global + physique (chargé en premier)
    ├── fil.js              ← rendu canvas
    └── ui.js               ← contrôles + boucle d'animation (chargé en dernier)
```

Page **sans onglets**, donc sans deep-linking : une seule vue, un seul canvas,
pas de graphe ni de splitter.

---

## Intention pédagogique

Rendre visible ce qu'est le courant électrique à l'échelle microscopique, pour
la **Seconde** (qualitatif : agitation désordonnée → déplacement d'ensemble,
sens conventionnel opposé au sens des électrons) comme pour la **Terminale**
(quantitatif : U, I, vitesse de dérive, et les deux causes de la conductivité).

Deux contresens sont visés explicitement :

1. **« Les électrons filent dans le fil. »** La vitesse de dérive réelle est de
   l'ordre de 0,1 mm/s, contre 10⁵ m/s pour l'agitation thermique — un facteur
   10⁹. La simulation exagère énormément la dérive, sinon rien ne serait
   visible ; l'électron suivi à la trace (bouton « Suivre un électron ») rétablit
   la proportion perçue en montrant l'énorme zigzag et le faible déplacement net,
   et le bandeau Informations l'énonce.
2. **« Plus de tension, plus de vitesse, indéfiniment. »** Les chocs sur les ions
   du réseau bornent la vitesse de dérive : c'est le modèle de Drude, et c'est
   de là que vient la loi d'Ohm.

---

## Modèle physique (`sim.js`)

Modèle de Drude « lycée » :

- le réseau de cations est **fixe** (le cristal du métal) ;
- entre deux chocs, un électron vole en ligne droite, accéléré par le champ ;
- à chaque choc sur un ion, sa vitesse est **remise à la vitesse d'agitation
  thermique dans une direction aléatoire** — toute la mémoire de l'accélération
  est perdue (c'est l'énergie cédée au réseau, l'effet Joule).

Il en résulte une vitesse de dérive stationnaire **v = a·τ**, proportionnelle à
U et d'autant plus faible que les chocs sont fréquents.

### Le réseau : colonnes alternées 3 / 2 en quinconce

Les ions ne forment pas une grille carrée mais un **empilement compact**, celui
d'un vrai cristal métallique : colonnes alternées de 3 puis 2 ions, celles à 2
se logeant dans les creux de leurs voisines. Le pas de **référence** vaut
`hauteur intérieure / 3` ; le pas horizontal en découle (`COL_RATIO = √3/2` du
pas de référence). Le nombre de colonnes est forcé **impair**, pour que le
réseau commence et finisse par une colonne à 3 et reste symétrique.

Les rangées ne sont pas posées sur ce pas de référence : c'est `EDGE_FRAC` qui
fixe la distance des ions extrêmes à la paroi, et le pas vertical réel
(`sim.ayLat`) se déduit de ce qui reste. Un réseau strictement régulier
donnerait `EDGE_FRAC = 1/(2·ROWS) = 1/6`, mais une paroi n'arrête que d'un côté
là où un ion arrête des deux : à marge égale, le passage le long du mur est deux
fois plus large que ceux du centre et forme **deux couloirs rectilignes** sur
toute la longueur du fil — la canalisation décrite plus bas, en pire. La marge
est donc resserrée d'un facteur 1,5 (`EDGE_FRAC = 1/9`) et la place gagnée
revient au centre du fil. La structure est inchangée : trois rangées
régulièrement espacées, colonnes à 2 au milieu des creux.

Rayons, vitesses et accélération s'expriment tous en fraction de ce pas : **la
simulation est identique à toute taille de canvas**, seule la longueur de fil
montrée change.

| Constante | Valeur | Rôle |
|---|---|---|
| `ROWS` | 3 | Rangées d'ions (colonnes pleines) |
| `COL_RATIO` | 0,866 | √3/2 : pas horizontal / pas de référence |
| `EDGE_FRAC` | 1/9 | Ions extrêmes ↔ paroi, en fraction de la hauteur |
| `RE_FRAC` | 0,11 | Rayon électron / pas du réseau |
| `GENE_STEPS` | 0,105 → 0,30 | Rayon ion / pas, les 5 crans du curseur de gêne |
| `LAT_JITTER` | 0,045 | Décalage résiduel des ions (cf. ci-dessous) |
| `VTH_FRAC` | 0,90 | Vitesse d'agitation / hauteur intérieure, par seconde |
| `ACC_FRAC` | 0,239 | Accélération par volt / hauteur intérieure |
| `VMAX_FACTOR` | 6,0 | Plafond de vitesse (garde-fou anti-tunneling) |
| `VD_MM_PER_NORM` | 0,290 | Étalonnage de la vitesse affichée (mm/s) |
| `K_I` | 435 | Étalonnage de l'intensité affichée (mA) |
| `MEASURE_TAU` | 6000 ms | Constante de temps du lissage en régime établi |

`nearestCation()` balaie la colonne qui contient le point et ses deux voisines,
soit au plus neuf ions : chaque colonne couvrant toute la hauteur du fil, l'ion
le plus proche ne peut pas être plus loin. Le coût reste constant, aucune grille
spatiale n'est nécessaire.

### Pourquoi le quinconce, et pourquoi un décalage résiduel

Un réseau en **grille carrée** laisse entre ses rangées des couloirs horizontaux
entièrement libres. Dès que le champ couche les trajectoires sur l'axe du fil,
une partie des électrons les enfilent et traversent tout le fil sans heurter un
seul ion (effet de canalisation). Mesuré sur la version en grille : des
électrons qui filent tout droit à l'écran — ce qui contredit exactement le
message de la page — et une vitesse de dérive **plus que** proportionnelle à U
(rapport 2,34 au lieu de 2,00 en doublant U).

Le quinconce y répond presque seul : les rangées se succédant tous les
**demi-pas** verticaux, aucune ligne horizontale ne passe entre elles dès que le
rayon de collision dépasse le quart du pas — c'est le cas sur presque toute la
plage du curseur de gêne. La marge aux parois resserrée écarte les rangées les
unes des autres et rogne cette marge de sécurité : au cran de gêne le plus
faible, le rayon de collision ne dépasse plus le quart du pas que de 10 %,
contre 28 % avec un réseau régulier. Il subsiste donc au cran le plus faible une
fente étroite, que referme `LAT_JITTER`, un décalage de ±4,5 % du pas tiré **une fois
pour toutes** (le réseau reste strictement immobile). Cette valeur est
volontairement petite : à ±10 %, l'œil cessait de lire le quinconce et ne voyait
plus qu'un semis d'ions.

### Neutralité du fil

Le fil doit rester **neutre**. La sortie retenue est celle de la physique réelle
du cuivre : chaque atome du réseau libère **un** électron et devient un ion
**+**. La compensation des charges est alors exacte, et le rendu l'affiche
littéralement dans les disques (`+`).

L'invariant `nElec === nSites` est maintenu par `updateGeometry()`,
qui le recalcule à chaque changement de géométrie, et par `syncElectronCount()`,
qui aligne le tableau sans réinitialiser les électrons déjà présents. Il tient
donc aussi au redimensionnement de la fenêtre, qui fait varier le nombre de
sites (mesuré : 28 ions en 1000×820, 43 en 1920×1080, toujours autant
d'électrons).

### Étalonnage des grandeurs affichées

La mesure brute est la moyenne des vitesses selon x, ramenée à une fraction de
la vitesse d'agitation (`vdNorm`) — donc indépendante de la taille du canvas.
Les réglages par défaut (U = 6 V, résistance « Moyenne ») donnent en régime
établi `vdNorm ≈ 0,345` — mesuré sur 150 s et sur huit réseaux tirés
indépendamment, dispersion ±4 % — calé sur **0,10 mm/s** et **150 mA**.

Ce rapport `vdNorm` est aussi ce qui **plafonne** la lisibilité du mouvement
d'ensemble. La fréquence des chocs est proportionnelle à la vitesse *totale* de
l'électron : dès que la dérive devient comparable à l'agitation, τ diminue quand
U augmente et `v = a·τ` cesse d'être proportionnelle à U. Mesuré à gêne
« Moyenne », `vd/U` est constant à 4 % près de 3 à 9 V et ne fléchit que de 13 %
à 12 V. Monter le rapport — en augmentant `ACC_FRAC`, en baissant `VTH_FRAC` ou
en rapetissant les ions — le rend **non monotone** : à `VTH_FRAC = 0,85`, passer
de 6 V à 9 V fait *baisser* la dérive affichée. La loi d'Ohm prime ; pour rendre
la dérive plus lisible, les bons outils sont la trace et les flèches de vitesse.

L'intensité suit la **densité** de porteurs et **non**
l'effectif affiché : une fenêtre plus large montre un plus long morceau de fil,
donc plus d'électrons, sans que l'intensité doive changer. Vérifié : 135 à
148 mA selon la taille de fenêtre, à réglages identiques.

### Bruit et convergence de la mesure

Moyennée sur quelques dizaines d'électrons seulement, la vitesse de dérive
fluctue de près de 10 %. Un lissage exponentiel assez long pour ramener ce bruit
à quelques pour cent mettrait une dizaine de secondes à monter après la
fermeture du circuit — un ampèremètre qui traîne.

`updateMeasures()` évite l'arbitrage en repartant d'une **moyenne courante**
depuis le dernier changement de régime : son coefficient `1/n` décroît d'image
en image, elle converge donc immédiatement, puis l'exponentielle
(`MEASURE_TAU`) prend le relais dès qu'elle devient la plus lente des deux.
Toute commande qui change le régime pose `sim.snapMeasure`, qui remet le
compteur à zéro. Mesuré : ~90 % de la valeur finale atteints en 4–5 s, puis un
résidu de ±8 % autour de 150 mA.

Circuit ouvert **ou tension nulle**, aucune force ne s'exerce sur les électrons :
la dérive est nulle par construction, et `updateReadouts()` affiche zéro
exactement plutôt que de laisser transparaître le bruit résiduel.

---

## Fichiers et responsabilités

### `index.html`

Structure HTML pure : la grille `<main>`, le `<canvas id="scene-canvas">`, la
légende en overlay, le panneau droit (Contrôles / Circuit / Mesures /
Options) et le bandeau Informations. Scripts dans l'ordre imposé.

### `css/style.css`

| Section | Contenu |
|---|---|
| Reset & base | `box-sizing`, `body` 100vh + repli 100dvh, `overflow: hidden` |
| Grille principale | `main` en CSS Grid : `1fr` + `clamp(200px, 22vw, 300px)` |
| Zone simulation `#sim-area` | Fond ivoire `#fdf8f0`, `container-type: size` — référentiel des unités `cq` de la légende |
| Légende `#legend` | Overlay en haut à gauche (le bas de la zone est pris par la cote de tension), dimensionnée en `cqmin` |
| Panneau droit `#panel` | Fond `#e8e4de`, scrollable |
| Boutons | `.btn-green`, `.btn-pause`, `.btn-play`, `.btn-raz`, `.btn-toggle-one` |
| Afficheurs `.readout` | Masqués en bloc par `#measures.hidden` |
| Hint bas `.panel-hint` | Collé en bas hors scroll, `border-left: none` |
| Fenêtre étroite / portrait | `@media (max-width: 720px), (max-aspect-ratio: 3/4)` : légende masquée |
| Animations réduites | `@media (prefers-reduced-motion: reduce)` |

### `js/fil.js` — Rendu

La scène est découpée en **cinq bandes horizontales**, toutes exprimées en
fraction de la hauteur du canvas (rien n'est fixé en pixels) :

| Bande | Part de la hauteur utile | Contenu |
|---|---|---|
| 1 | 0,30 | Schéma du circuit fermé : générateur — un cercle marqué **G** — sur la branche haute, interrupteur (branche droite), portion étudiée en gras (branche basse), triangles du sens du courant |
| 2 | 0,09 | Traits de loupe, en pointillés, de la portion étudiée vers les coins du fil |
| 3 | 0,11 | Flèche du sens conventionnel du courant (ou « aucun courant ») |
| 4 | 0,38 | Le fil : parois haute et basse **seules** (les côtés sont ouverts : le fil se prolonge hors du cadre, et rien ne doit suggérer que les électrons y buttent), réseau d'ions, trace, électrons |
| 5 | reste | Cote de la tension U, sur toute la longueur du fil, et repères des bornes posés par-dessus ses extrémités |

`currentSign()` centralise le sens du courant (+1 vers la droite, 0 si le
circuit est ouvert ou la tension nulle) : schéma, flèche et repères de bornes en
découlent tous, ils ne peuvent donc pas se contredire.

Le contenu du fil est tracé sous `ctx.clip()` aux bords intérieurs — sans quoi
un électron à cheval sur une paroi, ou une trace qui déborde, se dessinerait
par-dessus le cadre.

`_doResize()` applique le `devicePixelRatio` (pixels physiques sur le canvas,
`setTransform` pour redessiner en pixels CSS), recalcule la géométrie, puis
**reporte les électrons à la même position relative** (`remapElectrons`) : un
redimensionnement de la fenêtre ne rebat pas les cartes de la simulation.

### `js/ui.js` — Contrôles et boucle

Boucle `requestAnimationFrame` classique du site : `dtReal` plafonné à 50 ms,
facteur de vitesse appliqué au seul temps **simulé** (le lissage des mesures
reste calé sur le temps réel), afficheurs rafraîchis à 10 Hz, et pas de redessin
en pause tant que `sim.needsRedraw` n'est pas posé.

Raccourcis clavier (projection) : **Espace** pause, **G** interrupteur,
**E** suivre un électron, **R** réinitialiser.

---

## Commandes du panneau

| Commande | Effet |
|---|---|
| Fermer / ouvrir le circuit | Bascule l'interrupteur du schéma ; ouvert, l'accélération est nulle |
| Tension imposée (−12 → +12 V) | Accélération des électrons ; le signe inverse le sens du courant |
| Résistance (5 crans) | Encombrement des ions, donc fréquence des chocs, donc τ — la seconde cause de la conductivité (σ = n·e²·τ/m) |
| Suivre un électron | Marque l'électron le plus central et trace sa trajectoire |
| Sens des électrons | Une flèche par électron, dans le sens de son déplacement |
| Masquer les mesures | Masque les afficheurs **et** les valeurs chiffrées du schéma : la page redevient entièrement qualitative pour une projection en Seconde |
| Pause / Vitesse / RAZ | Contrôle de l'animation |

---

## Neutralité du milieu — les deux mécanismes

1. **En régime permanent** : un électron qui sort par une extrémité est remplacé
   **dans le même pas de temps** par un autre qui entre par l'extrémité opposée
   (position verticale retirée au sort, vitesse conservée). Le nombre de charges
   négatives dans le fil ne varie donc jamais.
2. **À tout réglage** : le nombre d'électrons vaut `nSites` et la charge de
   chaque ion vaut `+` (cf. « Neutralité du fil »). La somme des charges est
   nulle quelle que soit la taille de la fenêtre.
