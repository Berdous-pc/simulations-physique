# `cinematique/` — Architecture

> Simulation : **cinématique en 1 dimension** — liens entre position,
> vitesse et accélération, sur une course de voitures en ligne droite.
> Niveau : Terminale.

---

## 1. Intention pédagogique

Une à trois voitures roulent en ligne droite, chacune avec une
**accélération constante**. Leur mouvement est fixé par les conditions
initiales `x₀`, `vₓ₀`, `aₓ`, et l'équation horaire
`x(t) = ½·aₓ·t² + vₓ₀·t + x₀` est affichée sous chaque voiture.

Le graphe choisi (`x(t)`, `vₓ(t)` ou `aₓ(t)`) **s'écrit pendant la course**.
En `x(t)`, chaque voiture est tenue à la hauteur de son point de courbe,
exactement comme la fusée du mode décollage de `derivee/` : la courbe
n'est pas une image du mouvement, elle en est le relevé.

---

## 2. Arborescence

```
cinematique/
├── index.html
├── ARCHITECTURE.md
├── css/style.css
└── js/
    ├── sim.js    ← état, modèle des voitures, cadrage, utilitaires (1er)
    ├── graph.js  ← graphe, chronomètre, tangentes, réticule
    ├── piste.js  ← piste vue du dessus et voitures
    └── ui.js     ← panneau, animation, boucle (dernier)
```

Ordre de chargement critique (scope global) : `sim.js` → `graph.js` →
`piste.js` → `ui.js`. `piste.js` lit `geoGraph`, posé par `drawGraph()` :
la piste est donc tracée **après** le graphe à chaque image.

Page **sans onglets** : pas de deep-linking `#hash`.

---

## 3. `sim.js`

- **État `sim`** : longueur `L`, tableau `voitures` (`{x0, v0, a}`),
  graphe affiché `mode` (`'x' | 'v' | 'a'`), date `t`, `play`/`fini`,
  vitesse d'animation, outils (`tangente`, `reticule`, `tangentesFig`).
- **Couleurs** : `COUL_VOITURES[i]` est partagée par la voiture, sa courbe
  et sa carte dans le panneau. Couleur et file suivent l'**emplacement** :
  retirer la voiture 2 fait de la 3 la nouvelle « Voiture 2 », en orange.
- **Valeurs par défaut** par emplacement (`VOITURES_DEFAUT`) : uniforme,
  départ arrêté puis accéléré, départ lancé puis freiné.
- **Bornes** : `x₀ ∈ [0 ; L]`, `vₓ₀ ∈ [−20 ; 20] m/s`,
  `aₓ ∈ [−5 ; 5] m/s²`, `L ∈ [20 ; 200] m`.

### Piste, arrivée, sortie

- La position est celle du **centre** de la voiture ; l'origine O est la
  ligne de départ.
- `margePiste()` : espace visible sous O et au-delà de l'arrivée
  (`max(5 m ; 7 % de L)`). Il contient au moins une voiture posée en
  `x = 0`, qui dépasse de 2 m en arrière de la ligne.
- `tArrivee(v)` : premier passage du centre en `x = L`.
  `tSortie(v)` : premier passage en `x = −marge` (voiture qui recule).
  Toutes deux par `premiereRacine()`, racine exacte du trinôme.
- Une voiture sortie **s'immobilise** (`tEffectif()` fige sa date) et sa
  courbe s'arrête. Une voiture arrivée, elle, **continue** : l'équation
  horaire reste valable, elle sort par le haut de la piste et sa courbe
  par le haut du graphe.
- `dureeCourse()` : la course s'arrête quand la **dernière** voiture a fini
  (arrivée ou sortie), bornée à `[DUREE_MIN ; DUREE_MAX] = [2 ; 90] s` (une
  voiture à l'arrêt n'arrive jamais).

### Cadrage (`vueGraphe()`)

- L'axe des temps couvre la **course entière** dès la première image : la
  fenêtre ne bouge pas pendant l'animation.
- En `x(t)`, l'ordonnée est **exactement** l'étendue de la piste
  `[−marge ; L + marge]` : c'est ce qui aligne les voitures.
- En `vₓ(t)` / `aₓ(t)`, elle englobe les valeurs prises pendant la course
  et zéro, avec 12 % de marge.

### Équation horaire

`equationHoraire(v)` calcule les coefficients (`½·aₓ`, `vₓ₀`, `x₀`), omet
les termes nuls et les coefficients égaux à 1 : `aₓ = 0, vₓ₀ = 2, x₀ = 9`
donne `x(t) = 2t + 9`.

---

## 4. `graph.js`

- `dessineRepere()` : repris de `derivee/courbe.js` (axes fléchés dans la
  fenêtre, graduations portées par les axes). Les marges ne dépendent que
  de la taille du canevas, quel que soit le graphe affiché.
- `drawGraph()` : courbes écrites de 0 à `tEffectif(v, sim.t)`, bout de
  crayon (pastille) et, en `x(t)`, pointillé jusqu'au bord droit du
  canevas, repris par la piste jusqu'au centre de la voiture.
- **Chronomètre** : même cartouche que le décollage, mais en haut à
  **gauche** (les courbes `x(t)` montent vers la droite, et le coin droit
  porte les boutons d'outils).
- **Tangente** (charte `radioactivite/`) : aperçu qui suit le curseur,
  clic pour figer, croix pour supprimer. La pente est la **dérivée
  analytique** (`penteMode()`) : `vₓ` sur `x(t)`, `aₓ` sur `vₓ(t)`. Une
  tangente figée est masquée tant que le rembobinage a effacé sa portion de
  courbe ; elle est supprimée à tout changement de paramètre, de graphe ou
  au RAZ.
- **Réticule** : lignes croisées et bulle `#reticule-tooltip`. Exclusif
  avec la tangente.

---

## 5. `piste.js`

- Échelle verticale lue sur `geoGraph` (`padT`, `plotH`) et étendue de la
  piste, translatée par la différence des `getBoundingClientRect()` des
  deux canevas (même principe que `derivee/fusee.js`).
- Décor : herbe à bandes de tonte (repère de défilement), asphalte en
  **trois files fixes**, ligne de départ blanche en `x = 0`, damier en
  `x = L`, barrière rouge et blanche en `x = −marge`, règle graduée à
  gauche (indispensable en `vₓ(t)`/`aₓ(t)` où le graphe ne porte plus x).
- Voitures **à l'échelle** (4 m × 1,8 m), plafonnées à 72 % de la largeur
  de file : sur une piste courte, elles déborderaient sinon sur la file
  voisine. Voiture sortie : estompée.
- `dessineVoiture()` : voiture **provisoire** dessinée au canvas (vue du
  dessus, capot vers le haut), à remplacer par les images définitives.

---

## 6. `ui.js`

- Cartes des voitures construites par `construitVoitures()` ; saisies
  texte (virgule acceptée) bornées par `onSaisie()`.
- **Toute modification** (conditions initiales, longueur de piste, ajout ou
  retrait de voiture) appelle `apresModif()` : la course revient à `t = 0`
  et se met en pause. La course affichée est toujours celle des valeurs du
  panneau.
- Section « Contrôles » (en tête du panneau), commandes reprises du décollage : Lancer/Pause (« Rejouer » à
  l'arrivée), RAZ, curseur de vitesse `VITESSES = [0,1 ; 0,5 ; 1 ; 2 ; 5]`
  (×5 en plus : une course dure bien plus longtemps qu'un vol) et
  rembobinage à maintenir appuyé.
- Boucle `requestAnimationFrame` permanente, redessin seulement si
  `needsDraw`.
