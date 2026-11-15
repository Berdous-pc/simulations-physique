# Architecture — Effet Doppler

Page à **deux onglets** : *Principe* (vue de profil, 1D : démonstration
animée de la formule, onde à la surface de l'eau) et *Effet Doppler* (vue de dessus, 2D : onde
sonore, émetteur et récepteur mobiles, crêtes circulaires, écrans
d'oscilloscope). Les deux onglets sont **autonomes** : états distincts (`simD`,
`simV`), unités distinctes (cm et s / m et s), ils ne partagent que des
utilitaires.

## Arborescence

```
doppler/
├── index.html
├── ARCHITECTURE.md         ← ce fichier
├── css/
│   └── style.css           dérivé de refraction/ (panneau canonique)
└── js/
    ├── sim.js       état simD + modèle analytique de l'onglet Principe
    ├── profil.js    rendu canvas de la scène, frise des instants, glisser sur la frise
    ├── dessus.js    onglet Effet Doppler : état simV, modèle, rendu, oscilloscopes, interactions
    ├── ui.js        onglets, lecture / étapes, curseurs, démonstration écrite, resize
    └── sections-repliables.js  copie de titrage/ (chargé en dernier)
```

Scope global, pas de modules ES. Ordre de chargement : `sim → profil → dessus → ui`.
Deep-linking : `#demonstration` (Principe) / `#vue-de-dessus` (Effet Doppler) ;
les identifiants internes gardent les anciens noms d'onglet.

---

## Onglet Principe

### Parti pris pédagogique

La démonstration du cours tient en deux temps, que l'animation sépare :

1. **de t = 0 à t = T_E** : le front de l'onde parcourt λ_E = c·T_E, l'émetteur
   avance de v_E·T_E puis commence le motif 2 ; d'où λ_R = λ_E ∓ v_E·T_E. Le
   récepteur n'y joue aucun rôle ;
2. **après T_E** : le front et le début du motif 2 avancent à la même célérité,
   λ_R ne change plus, le récepteur les reçoit séparés de T_R = λ_R/c.

**Notations** (demandées par l'auteur) : indice E pour ce qui tient à
l'émetteur (T_E, f_E, v_E, λ_E), indice R pour le récepteur (T_R, f_R, λ_R —
pas de prime), **c** pour la célérité de l'onde. Dans le code, les noms
`V_ONDE` et `dopLambdaP()` sont restés.

Pour que la contraction **se voie** et ne se lise pas seulement sur une cote :

- **bande témoin** : au-dessus, le même émetteur *immobile* émet en même temps.
  Les deux fronts restent alignés (une seule barre « front » traverse les deux
  bandes) ; seul le début du motif 2 diffère, de v_E·T_E ;
- **barre empilée** entre les deux bandes : λ_E sur une ligne, λ_R sur l'autre,
  le segment vert v_E·T_E complétant la plus courte (λ_R si l'émetteur se
  rapproche, λ_E s'il s'éloigne). Elle voyage avec le premier motif et sort
  de la scène avec lui : son rôle s'arrête à l'étape 3 ;
- **débuts de motif** : un gros point sur l'onde à chaque début de motif
  (émis à 0, T_E, 2T_E…), et une **marque au sol** verte là où était l'émetteur
  à cet instant. Un sinus discrétisé (8 points par période, graduations au sol
  à chaque dépôt) a été essayé puis écarté par l'auteur : ne pas le remettre ;
- **motifs de couleur alternée** (bleu, ocre) côté récepteur.

L'onde est une **vague vue de côté**, pas un son en particules : la formule est
la même, la lecture est immédiate. Choix arrêtés avec l'auteur :

- **l'eau est plate à t = 0** ; l'émetteur part de l'altitude 0 en montant, et
  l'onde n'existe que là où son front est passé ;
- on suit donc **le front de l'onde** (émis à t = 0) et **le début du motif 2**
  (émis à T_E), et non deux crêtes : les dates restent 0 et T_E, comme sur la
  fiche de cours (suivre des crêtes les décalerait à T_E/4 et 5T_E/4) ;
- émetteur E et récepteur R sont des **flotteurs à cheval sur la surface** ;
- l'émission **continue après T_E et part des deux côtés** : on voit le train
  serré devant l'émetteur et étiré derrière, sur la même image.

### Modèle (`sim.js`)

Tout est **analytique** : la scène entière se déduit de la date `simD.t`. Il
n'y a ni intégration ni historique, ce qui permet de parcourir le temps dans
les deux sens (curseur, frise, étape précédente) et de changer un paramètre à
date fixée.

- Unités : cm, s, Hz. Célérité fixe `V_ONDE` = 20 cm/s, scène de `SCENE_L` =
  120 cm, récepteur en `X_RECEPTEUR` = 108 cm.
- `simD.vE` est toujours positive ; `simD.sens` (+1 se rapproche, −1 s'éloigne)
  donne la vitesse algébrique `dopVEs()`. Le récepteur reste à droite dans les
  deux cas : c'est l'émetteur qui part vers la gauche quand il s'éloigne.
- **Départ** `dopXE0()` : choisi pour que **plusieurs motifs soient reçus**
  (demande de l'auteur : on doit voir le rythme des réceptions, pas seulement
  deux événements). Il se rapproche : départ tout à gauche (`X_E0_APPROCHE` =
  14 cm). Il s'éloigne : départ à `D_ELOIGNE` = 1,5 λ_E du récepteur — pas plus
  près, sinon le front atteindrait R avant le début du motif 2 et les étapes de
  la démonstration seraient dans le désordre.
- **Eau plate à t = 0.** `dopDateEmission(x, t)` renvoie la date d'émission de
  ce qui se trouve en x (formule différente devant et derrière l'émetteur,
  continue à sa position) ; elle est négative là où l'onde n'est pas arrivée.
  `dopDateEmissionV(x, t, vE)` fait de même pour une vitesse donnée (0 : témoin).
  L'élongation `dopElongation` vaut `sin(2π·f_E·te)` si te > 0, zéro sinon.
- `dopXRepere(n, t)` : abscisse du point émis vers le récepteur à n·T_E (n = 0 :
  front, n = 1 : début du motif 2).
- **Instants clés** `dopCles()` : `[0, T_E, t₁, t₂, t_fin]` — départ du front,
  début du motif 2, réception du front, réception du début du motif 2, fin de
  l'animation. La dernière étape laisse simplement défiler le train de motifs
  jusqu'à `dopTFin()`.
- **Fin** `dopTFin()` : `T_FIN_MARGE`·T_E après la dernière réception. On
  reçoit `dopNRecep()` débuts de motif : `N_RECEP` = 6, moins si l'émetteur
  atteint avant sa butée `dopTLimite()` (à `MARGE_BORD` du bord gauche ou à
  `MARGE_R` du récepteur), jamais moins de 2. Exemple : 4 réceptions seulement
  à 1 Hz et 10 cm/s en s'éloignant.

Contraintes à respecter si l'on change ces constantes ou les bornes des
curseurs (`VE_MAX`, plage de f_E, à tenir synchronisées avec `index.html`) :
`T_E < t₁`, et l'émetteur reste dans la scène et avant le récepteur jusqu'à
`dopTFin()` (c'est le rôle de `dopNRecep()`).

### Rendu (`profil.js`)

`dessinerProfil()` redessine tout à partir de `simD`. La mise en page verticale
se déduit d'une **taille de police `f`** proportionnelle au canvas (bornée à
12–24 px), de haut en bas :

| Zone | Contenu |
|---|---|
| bande témoin | émetteur immobile (`dessinerBande(y0T, yFondT, 0)`) ; son récepteur clignote au rythme T_E |
| barre empilée | ligne 1 : « c·t » puis « λ_E = c·T_E » ; ligne 2 : λ_R (rouge) ; segment vert v_E·T_E sur la ligne la plus courte. Libellé long s'il tient dans la barre, court sinon (`libelle`) |
| bande mobile | `dessinerBande(y0, yFond, vEs)` : surface en trait fin, motifs colorés en trait épais, gros points et marques au sol des débuts de motif ; titre « Émetteur mobile » toujours à gauche (police réduite quand l'émetteur part de la gauche, pour tenir avant lui) ; étiquette « motif 2 » ; flotteurs E et R centrés sur la surface et tracés entièrement par-dessus l'eau (pas de voile sur la moitié basse : écarté par l'auteur) ; vecteur v_E solidaire de E |
| cote v_E·T_E (vert, au sol) | « v_E·t » puis « v_E·T_E », positions « E à t = 0 » / « E à t = T_E » ; estompée après T_E |
| échelle et chronomètre | sur la ligne de la cote au sol : segment « 10 cm » du côté opposé au départ de l'émetteur (il remplace l'ancienne règle graduée, supprimée pour gagner de la hauteur), chronomètre « t = 2,20 s » à droite (aiguille : un tour par T_E) |
| frise du temps (facultative, `simD.showFrise`) | fond teinté ; deux **lignes de vie** précédées des pastilles E et R ; **axe du temps** fléché « t (s) », gradué tous les 0,1 s, chiffré tous les 0,5 s ; **peigne** des débuts de motif, ronds de la couleur du motif (bleu, ocre), qui n'apparaissent qu'une fois atteints (aucune empreinte des événements à venir) : tous les T_E sur la ligne E, tous les T_R sur la ligne R ; en option (`simD.showLiens`, case décochée par défaut), un trait relie l'émission n° k à sa réception et **avance avec le motif** (éventail qui se resserre ou s'ouvre) ; durées T_E (au-dessus de la ligne E) et T_R (sous la ligne R), à la même échelle ; curseur portant une **bulle de date** |

La frise doit se lire comme du temps, pas comme un second axe d'espace : d'où
l'unité, la flèche, la bulle de date, le trait écoulé en couleur neutre (et non
celle de l'onde) et la suppression de la règle en cm qui la jouxtait. Frise
masquée, `hFrise` vaut 0, `_geo` est `null` (plus de glisser) et la hauteur
gagnée va à l'amplitude (plafonnée à 3 f) puis à la profondeur d'eau (`jeu`).

L'amplitude `A` se déduit de la hauteur restante (`(hs − 10,95 f) / 4`) ; `f`
vaut `min(w/52, h/26)`.

**Clignotements** (`_eclat`, halo plein + anneau) à chaque début de motif :
les deux émetteurs toutes les T_E, le récepteur du bas toutes les T_R, le
récepteur témoin toutes les T_E. Les deux récepteurs reçoivent le front au
même instant : c'est en les comparant qu'on voit f_R ≠ f_E. Le titre de la
bande mobile se place du côté opposé au départ de l'émetteur.

`texteIndices()` écrit un texte avec indices (`v_{E}·T_{E}`) et le ramène dans
le canvas s'il déborde. Les éclats (`_eclat`) qui signalent émissions et
réceptions dépendent de la date seule, donc fonctionnent aussi en parcourant le
temps à la main.

**Frise** : `_geo` mémorise sa géométrie à chaque image ; un glisser dans la
bande du bas appelle `allerA()` (ui.js), avec aimantation à 7 px sur les
instants clés.

### Commandes (`ui.js`)

- **Lecture** joue jusqu'à `dopTFin()` (`simD.cible = -1`) ; **Étape ▶** joue
  jusqu'à l'instant clé suivant (`simD.cible` = son indice) ; **◀ Étape**
  revient directement au précédent. `simD.cible` est un **indice** et non une
  date : les instants clés dépendent des paramètres.
- `_changerParam()` : si la date est exactement un instant clé au moment où
  l'on change v_E ou f_E, elle est replacée sur le même instant clé
  après le changement — on reste « sur la même étape » et la scène s'ajuste.
  Changer de **sens** (`setSens`) remet en revanche l'animation à t = 0.
- `majTemps()` met à jour curseur, boutons d'étape, démonstration et scène.
- **Démonstration écrite** (`#demo-bloc`, HTML sous la scène, masquée par
  défaut : `simD.showDemo = false`, cases d'*Affichage* resynchronisées sur
  `simD` à l'initialisation) : cinq lignes,
  classes `.atteinte` (étape passée) et `.active` (étape en cours) posées par
  `_majDemo()` ; les signes, le comparateur et les verbes qui dépendent du sens
  sont dans des `<span class="dp-…">` remplis par `_majTextesSens()`.
- La boucle `requestAnimationFrame` ne tourne que pendant la lecture ; à
  l'arrêt, le rendu se fait à la demande.

---

## Onglet Effet Doppler (`dessus.js`, vue de dessus)

Onde **sonore** vue de dessus, fortement **ralentie** (`simV.ralenti` : ms
simulées par seconde réelle). Unités : m, s, Hz. Scène de `VD_LARGEUR` = 12 m
de large, hauteur déduite du canvas, y = 0 au milieu.

### Modèle

- **Deux modes de mouvement** (`simV.mode`, onglets du panneau, section
  Mouvement placée avant Onde sonore) ; même ralenti dans les deux
  (`simV.ralenti`, 4 ms/s par défaut : l'auteur ne veut pas qu'il change) :
  - **Automatique** : vitesse `v` (curseur) et direction `dir` (poignée ronde
    à la pointe de la flèche) ; `_vdDeplacer()` : mouvement rectiligne uniforme
    avec **rebond** sur les bords. Pendant la lecture, on ne peut pas attraper
    E ou R (seulement les poignées).
  - **À la souris** : pas de curseur de vitesse ni de poignée. Pendant la
    lecture, l'objet saisi **poursuit** le pointeur (resté visible) : la cible
    `o.cible` (m) est le pointeur, décalé comme à la saisie (pas d'à-coup au
    clic). `_vdPoursuite()`, à chaque pas de calcul : distance d à la cible,
    **v = v_max·(d − 0,15 m)/(3 m − 0,15 m)** bornée à [0, v_max], dirigée vers
    la cible, v_max = 0,9 c (2 c si « Autoriser le supersonique ») ; le pas ne
    dépasse pas la cible. Main immobile : l'objet rattrape le pointeur en
    ralentissant (approche exponentielle, quelques secondes réelles vu le
    ralenti) et s'arrête dans la zone morte de 0,15 m. Lâcher : arrêt net.
    Bloqué par les bords, sans rebond. Élastique pointillé objet → cible ;
    vitesse `vm` au-dessus de l'objet et dans le panneau.
    Écartés par l'auteur : un suivi 1:1 du pointeur (avec le ralenti, c ne vaut
    que ~120 px/s à l'écran : les faibles vitesses sont inatteignables), un
    suivi lissé qui continue après le lâcher, et un pilotage par la vitesse de
    la main (pointeur verrouillé, v = c·(u / 700 px/s)²) : vecteur vitesse
    instable, faibles vitesses difficiles à tenir.
  - Dans les deux modes, à l'arrêt, faire glisser un objet le replace
    directement. En Automatique, pendant la lecture, un objet de vitesse nulle
    se replace de même ; tant que l'émetteur est tenu, `simV.coupe` coupe son
    signal (pas de crête, échantillons d'historique `saut`, trace émise à 0) ;
    l'émission reprend au lâcher.
  - Position initiale (et RAZ) : E en (3 m, 0), R en (9 m, 0), sur la même
    horizontale.
- **Historique de l'émetteur** `_vdH` (date, position, phase, **célérité c**), un échantillon
  par pas de calcul, élagué au-delà de la traversée de la scène (E et R y
  restent, donc c·(t − τ) ≤ diagonale). Un déplacement à l'arrêt y pose un
  échantillon `saut` : le segment correspondant n'est pas un trajet.
- **Crêtes** `_vdCretes` : une par passage de la phase à π/2 + 2kπ, cercle de
  rayon c_k·(t − t_k) centré là où se trouvait l'émetteur, où c_k est la
  célérité à l'émission : **changer c ou f ne modifie que l'onde émise
  ensuite** (choix de l'auteur). Si c augmente, les nouvelles crêtes rattrapent
  les anciennes et R reçoit un moment deux contributions (f_R « — »).
- **Signal reçu** `_vdSignalRecu()` : recherche dans l'historique des dates
  retardées τ telles que c_τ·(t − τ) = distance au point d'émission (un segment
  d'historique où c change n'est pas une émission continue : pas de racine) ; somme des
  contributions `_vdAmp(r)·sin(phase(τ))`. Une seule contribution en subsonique,
  zéro ou plusieurs en **supersonique** (autorisé : v_E jusqu'à 600 m/s, le cône
  de Mach se forme tout seul avec les cercles).
- **Fréquence reçue** `simV.fR` : dérivée de la phase retardée, lissée ; `NaN`
  (affiché « — ») tant que l'onde n'est pas arrivée ou s'il y a plusieurs
  contributions. Aucune formule n'est appliquée : c'est une mesure, valable quels
  que soient les mouvements de E et de R (vérifié : 701 Hz mesurés pour 500 Hz
  émis, v_E = 100 m/s presque en face de R, conforme à la formule).
- Pas de calcul : `VD_PAS_PAR_T` = 120 par période émise (f_R peut valoir
  10 f_E quand la source approche c), `VD_PAS_MAX` par image.

### Rendu et oscilloscopes

- Scène : cercles (opacité selon l'amplitude), points d'émission des crêtes
  (case *Affichage*), échelle 1 m, date simulée, pastilles E et R, vecteurs
  vitesse avec **poignée ronde à la pointe** (on la tire pour orienter).
- **Écrans d'oscilloscope** : fenêtres DOM `.scope-win` posées sur la scène,
  déplaçables par leur barre de titre, sur le modèle de `interferences/`
  (onglet 1D) : boîtier sombre, trace « phosphore », graduations rondes en ms.
  **Balayage déclenché** (le défilement continu a été écarté par l'auteur) :
  `_vdMajBalayages()` fait repartir le spot, une fois l'écran parcouru, au
  premier passage du signal par zéro en montant (sans signal pendant un
  balayage entier, départ libre) ; un signal périodique paraît immobile. Le
  balayage précédent reste en rémanence à droite du spot. Graticule 10 × 8
  divisions, base de temps `simV.calibre` (0,2 / 0,5 / 1 / 2 ms/div,
  indépendante de f_E) **commune aux deux écrans**, même échelle verticale.
  **Figer les écrans** (`_vdFige`) copie trace et balayages ; la simulation
  continue. Signaux enregistrés dans `_vdTrace` (70 ms).

### Commandes

Lecture / Pause, RAZ (efface l'onde, replace E et R), ralenti, célérité c,
fréquence f_E, mode de mouvement, vitesses v_E et v_R (Automatique) ou vitesses
mesurées et case supersonique (À la souris), boutons des deux écrans, base de
temps, Figer, lecture de f_E,
f_R et de leur écart. Fonctions du panneau préfixées `vd` ; `ui.js` n'appelle
que `initDessus()`, `resizeDessus()` et `vdArreter()` (changement d'onglet).

---

Restent à faire : carte(s) sur la page d'accueil avec aperçu, entrée dans
`sitemap.xml`.
