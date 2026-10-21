# Architecture — Réfraction : lois de Snell-Descartes et prisme

Page à **deux onglets** : *Snell-Descartes* (réflexion et réfraction d'un
rayon laser) et *Prisme* (dispersion de la lumière blanche).

## Arborescence

```
refraction/
├── index.html
├── ARCHITECTURE.md      ← ce fichier
├── css/
│   └── style.css
└── js/
    ├── sim.js       milieux, état, lois de l'optique, géométrie des rayons
    ├── dioptre.js   rendu canvas de l'onglet Snell-Descartes + glisser-déposer
    ├── prisme.js    rendu canvas de l'onglet Prisme + glisser-déposer
    ├── ui.js        onglets, panneau, afficheurs, resize, init
    └── sections-repliables.js  copie de titrage/ : sections Affichage et Mesures repliables (chargé en dernier)
```

> Scope global (`var`, pas de modules ES). **Ordre de chargement critique** :
> `sim → dioptre → prisme → ui` (prisme.js réutilise `sizeCanvas`, `_clamp`,
> `_rectArrondi` et `_distSegment` de dioptre.js).

---

## Onglet Snell-Descartes : deux modes

Sous-onglets `.mode-tabs` : **Deux milieux** / **Demi-disque**
(`modeSnell = 'milieux' | 'disque'`). Un seul canvas, `#canvas-snell`, sert
aux deux modes ; `dessinerSnell()` aiguille vers `dessinerMilieux()` ou
`dessinerDisque()`.

Pas de boucle d'animation : la scène est statique. Toute modification
(panneau ou souris) passe par **`surChangementScene()`** (ui.js), qui
resynchronise le curseur d'angle, les afficheurs, et demande un rendu
(`demanderRendu()`, regroupé par `requestAnimationFrame`).

### Mode « Deux milieux » (`simDM`)

- Milieu 1 en haut, milieu 2 en bas, dioptre horizontal au centre du canvas.
- Le laser est toujours dans le milieu 1 ; `simDM.cote` (±1) dit de quel côté
  de la normale. Le bouton « Inverser les milieux » échange `m1` et `m2`.
- Chaque milieu est `{ id, n }`. Choisir dans la liste recopie l'indice de
  `MILIEUX` ; saisir un indice (`onSaisieIndice`) met `id = 'perso'` et le
  sélecteur affiche « Personnalisé ». Saisie hors de [1,00 ; 3,00] : case
  rouge, rien n'est appliqué tant qu'elle est invalide.
- Angle d'incidence : curseur au dixième de degré, ou glissé n'importe où
  dans le milieu 1.

### Mode « Demi-disque » (`simDD`)

Trois objets **indépendants**, qui tournent tous autour du même centre C
(milieu de la face plane), chacun repéré par un angle en degrés dans le
repère du canvas (y vers le bas) :

| Champ | Direction repérée | Glissé |
|---|---|---|
| `laser` | C → laser | boîtier du laser, ou n'importe où hors du rapporteur |
| `disque` | normale entrant dans le plexiglas (vers la face courbe) | intérieur du demi-disque |
| `rappo` | axe 0° du rapporteur | couronne du rapporteur |

Le rapporteur ne suit **pas** le disque : son 0° peut ne pas être sur la
normale. Les angles affichés (arcs, valeurs, panneau) sont **toujours**
mesurés par rapport à la vraie normale, calculée à partir de `disque`.
« Aligner le rapporteur sur la normale » fait `rappo = disque`.

**Physique** (`sceneDisque()`) : le laser vise toujours C, donc tout se
joue en ce point.
- Laser côté air : passage air → plexiglas sur la face plane ; le rayon
  réfracté ressort par la face courbe selon un rayon du disque, donc sans
  déviation.
- Laser côté face courbe : entrée selon un rayon du disque, sans déviation,
  puis passage plexiglas → air sur la face plane, d'où la réflexion totale
  possible.
- Les réflexions partielles sur la face courbe sont ignorées.

Tous les rayons sont donc des demi-droites issues de C, comme dans le mode
« Deux milieux » : le même code de dessin (`dessinerRayons`,
`dessinerAngles`) sert aux deux modes.

### Calage des glissés

Tous les angles sont arrondis au dixième de degré (`auDixieme`). En plus,
`aimanter(a, 5, 0.5)` colle l'angle sur un multiple de 5° quand on passe à
moins de 0,5° :
- laser : c'est l'**angle d'incidence** qui est aimanté (pas l'orientation
  absolue du laser) ;
- disque : son orientation absolue (face plane horizontale, verticale…) ;
- rapporteur : aimantation **prioritaire** à ±1° sur la normale (axe 0°
  confondu avec la normale), sinon multiples de 5°.

Le curseur et le clavier permettent toujours d'atteindre un dixième proche
d'un multiple de 5.

---

## Onglet Prisme (`simPR`)

**Salle noire** (`.sim-area-sombre`, fond #14171c) : sur le noir, les couleurs
s'additionnent (composition `'lighter'`), si bien que le faisceau est
réellement blanc avant le prisme et se décompose ensuite.

De gauche à droite : la source, le prisme (centre de gravité G), un écran
vertical, puis la **loupe**, encart (vue d'ensemble seulement) qui montre l'écran agrandi ×10 autour
de la tache (cadre pointillé et lignes de rappel sur l'écran).

| Champ | Rôle | Réglage |
|---|---|---|
| `source` | `'blanche'` ou `'mono'` | sous-onglets du panneau |
| `lambda` | longueur d'onde du laser (nm, 400–700) | curseur |
| `milieu` | matériau (id de `MILIEUX`, liste `PR_MATERIAUX`) | sélecteur |
| `A` | angle au sommet (10–90°) | curseur |
| `rot` | rotation du prisme autour de G | curseur, ou glisser le prisme |
| `sx`, `sy` | point d'émission, en unités m relatives à G | glisser le boîtier |
| `dir` | direction du faisceau | glisser la poignée ronde |

Positions en unités `m = min(W, H)/2` relatives à G : la scène se
redimensionne avec le canvas. Le bouton Réinitialiser remet source,
rotation et angle au sommet (pas le matériau ni le type de source).

**Physique** : l'indice suit la loi de Cauchy `n(λ) = A + B/λ²`.
`tracerRayon()` (sim.js) suit un rayon de face en face avec
`construireRayons()` : réfraction à l'entrée, puis à la sortie, ou
**réflexion totale** suivie (jusqu'à 12 rebonds ; au-delà le rayon est
« prisonnier »). Les réflexions partielles sont ignorées. L'écran arrête
la lumière.

**Rendu de la lumière blanche, spectre continu** (`_dessinerLumiereBlanche`) :
- 121 longueurs d'onde de 400 à 700 nm sont tracées ;
- entre deux voisines qui suivent le même chemin (même `cle`), l'éventail
  est rempli de leur couleur : c'est lui qui montre le spectre ;
- 1 rayon sur 10 est aussi tracé en trait, avec des couleurs dont la
  somme fait du blanc : il montre le faisceau tant que les couleurs sont
  superposées. Chaque trait s'estompe selon l'**écart à l'écran** entre
  les rayons extrêmes de son groupe (nul à 2,5 épaisseurs de faisceau),
  segment par segment : en vue zoomée, la séparation apparaît donc aussi
  dans le prisme ; sans dispersion, les traits restent blancs.

**Spectre discret** (boutons Spectre continu / Spectre discret, rubrique Affichage,
`affichagePR.spectre`) : la lumière blanche est réduite à six couleurs
(`PR_DISCRET` : violet 420, bleu 460, vert 520, jaune 580, orange 610,
rouge 650 nm), tracées en couleurs franches qui s'additionnent. Les
mesures portent alors sur 650 et 420 nm. Ces boutons sont grisés avec
une source monochromatique.

**Écran** (`_lumiereEcran` puis `_profilEcran`) : la lumière reçue est une
liste d'intervalles portant chacun la même quantité de lumière. En
spectre continu, la lumière comprise entre deux longueurs d'onde voisines
est étalée uniformément de l'une à l'autre (élargie de l'épaisseur du
faisceau) : le spectre reste continu, sans bandes sombres, même très
dispersé. Laser, spectre discret ou rayon isolé : une tache de la hauteur
du faisceau. Les couleurs s'additionnent ligne par ligne (balance des
blancs en continu : tout le spectre superposé fait du blanc), puis
exposition automatique et relèvement des faibles luminosités (puissance
0,45, teinte conservée). La loupe utilise le même
profil, ×10.

**Mesures** (section repliable, pliée par défaut) : calculées dans `ui.js` en unités m
(`_traceMonde`), sans écran, donc indépendantes de la taille du canvas —
indices et déviations pour les extrémités rouge et violette du spectre
affiché, ou pour λ en monochromatique, incidence sur la face d'entrée,
message si le prisme est manqué ou en cas de réflexion totale.

**Curseur d'incidence** (`onSliderIncidencePR`) : la source tourne autour
du point d'incidence sur la face d'entrée, à distance constante, du côté
de la normale où elle se trouve ; le faisceau frappe donc toujours le même
point. Le curseur se resynchronise après chaque glissé et se grise si le
prisme est manqué.

**Zoom** (`vuePR`, molette, jusqu'à ×50) : écran = monde × z + o. Le zoom
se fait autour du pointeur ; la vue reste dans le cadre de la vue
d'ensemble (`_bornerVue`). Les points sont transformés avant le dessin
(`_versEcran`) : épaisseurs, textes et source gardent leur taille. Chaque
segment est d'abord découpé à la zone visible élargie (`_decouper`,
`_decouperPolygone`, en coordonnées monde) pour ne jamais envoyer au
canvas des coordonnées démesurées. La loupe est masquée en vue zoomée.
Double-clic, Réinitialiser ou
redimensionnement du canvas ramènent à z = 1.

Le faisceau étant infiniment fin, l'éventail part d'un point au premier
dioptre : son ouverture (0,75° pour le flint) ne change pas avec le zoom.
C'est au second dioptre que le zoom montre la séparation des couleurs
(choix de l'auteur : pas d'exagération de la dispersion).

**Glisser-déposer** (`_cibleSousPR`) :
- vue d'ensemble : poignée ronde → orientation de la source (aimantée à
  5°), boîtier → déplacement (borné au canvas, à gauche de l'écran),
  prisme → rotation autour de G (relative, aimantée à 5°) ;
- vue zoomée : tout glisser **déplace la vue** ; la source et le prisme ne
  bougent plus.

---

## `sim.js`

- `MILIEUX` : `{ id, nom, n, A, B }`. `n` est l'indice utilisé dans l'onglet
  Snell-Descartes. `A` et `B` (loi de Cauchy `n(λ) = A + B/λ²`, λ en µm,
  `indiceCauchy()`) servent à l'onglet Prisme, et sont calés pour que
  `n(0,589 µm) ≈ n`.
- `sommetsPrisme()`, `tracerRayon()` : géométrie de l'onglet Prisme, dans
  n'importe quelle unité (pixels pour le dessin, unités m pour les mesures).
- `refracter(n1, n2, i)` : loi de la réfraction, `{ tir, r }`.
- `angleLimite(n1, n2)` : `null` si n1 ≤ n2.
- `fresnelR(n1, n2, i)` : part d'énergie réfléchie (lumière non polarisée).
- `construireRayons(nInc, u, n1, n2)` : à partir de la normale côté milieu
  d'incidence et de la direction vers le laser, renvoie i, r, R et les
  directions unitaires des rayons réfléchi et réfracté. `sceneMilieux()` et
  `sceneDisque()` l'appellent ; ce sont les **seules sources de vérité**
  pour le dessin et pour les afficheurs.

## `dioptre.js`

- `layoutMilieux` / `layoutDisque` : toutes les dimensions (laser, arcs,
  polices, rapporteur) sont proportionnelles à `min(W, H)`.
- **Luminosité des rayons** : `alphaEnergie(E) = E^0,4`, où E est la part
  d'énergie (R pour le réfléchi, 1 − R pour le réfracté). La puissance 0,4
  garde visible le faible rayon réfléchi (≈ 4 % de l'énergie pour air/verre)
  et fait s'éteindre progressivement le rayon réfracté à l'approche de
  l'angle limite.
- Faisceau : trait fin et net, **sans halo** (essayé puis retiré à la
  demande de l'auteur : jugé laid).
- Affichage : chaque rayon (incident, réfléchi, réfracté) est masquable
  séparément ; masquer l'incident masque aussi le laser. Une seule case pour
  les trois angles, et l'angle d'un rayon masqué n'est jamais tracé.
- **Étiquettes d'angle** (`dessinerEtiquetteAngle`) : on essaie d'abord des
  positions à l'intérieur de l'angle, sur la bissectrice, de plus en plus
  loin ; on garde la première dont la boîte de texte ne coupe ni la normale,
  ni le rayon, ni le dioptre. À défaut (angle étroit), l'étiquette est
  collée à l'extérieur du rayon, du côté opposé à la normale.
- Interactions : Pointer Events + `setPointerCapture`, `touch-action: none`
  sur le canvas. `_cibleSous(p)` détermine l'objet saisi ; disque et
  rapporteur tournent de l'angle balayé par le pointeur autour de C (rotation
  relative), le laser va directement sous le pointeur.

## `ui.js`

- Onglets principaux + deep-linking `#snell-descartes` / `#prisme`, mis à jour
  par `history.replaceState`.
- La case « Valeurs des angles » masque les valeurs sur le canvas (les arcs
  ne portent plus que i, i′, r) : utile pour faire mesurer les angles aux
  élèves.
- Le bloc « Mesures » (i, i′, r, angle limite) est dans une **section repliable,
  pliée au chargement** (`js/sections-repliables.js`, copie de `titrage/`) ;
  plus de bouton « Afficher les mesures ». Une grandeur par ligne (`.ro-line`) : la valeur passe sous son
  libellé plutôt que de déborder quand le panneau est étroit.
