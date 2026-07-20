# Pistes d'évolution — au-delà de la fente simple

> Notes de conception, pas de la documentation d'architecture actuelle (voir `ARCHITECTURE.md`
> pour ça). Objectif : garder la trace du plan discuté avant de généraliser à d'autres formes
> d'ouverture (carré, cercle) et à une fente inclinée, pour ne pas avoir à redériver tout ça
> plus tard.

---

## 1. Rappel de l'architecture actuelle

Deux sources d'intensité **volontairement indépendantes**, à ne jamais faire dépendre l'une de
l'autre :

| Source | Utilisée par | Fichier |
|---|---|---|
| `intensiteFente()` — formule fermée exacte (sinc²) | Graphe I(x), encarts de valeurs (θ, position des minima) | `js/sim.js` |
| `construireChampOuverture()` → FFT 2D, `echantillonnerChamp()` | Texture d'écran, enveloppe 3D du faisceau | `js/sim.js`, appelé depuis `js/scene.js` |

Le pipeline FFT calcule `|FFT2D(masque(x,y) × champ_incident_gaussien(x,y))|²` — le masque
d'ouverture est multiplié par le **profil réel du faisceau incident** (pas une onde plane
infinie), ce qui permet de ne mailler qu'une petite fenêtre autour de l'ouverture (proportionnelle
à `a`, cf. `FFT_FENETRE_FACTEUR`), indépendamment de la taille réelle de la fente. Voir les
commentaires de `construireChampOuverture` et `FFT_FENETRE_FACTEUR` dans `sim.js` pour le détail
des compromis de résolution.

La fente est aujourd'hui un simple test rectangulaire dans la boucle de remplissage du masque
(`Math.abs(x) < a_m/2 && Math.abs(y) < h_m/2`, cf. `construireChampOuverture`).

---

## 2. Ce qui s'adapte presque sans effort

### Carré
Séparable (sinc²(x)·sinc²(y)) — mais ça ne change même rien à l'implémentation : il suffit de
donner au masque une largeur ET une hauteur réglables toutes les deux (au lieu de largeur
réglable / hauteur fixe `FENTE_HAUTEUR_CM`). Aucun changement à la FFT elle-même.

### Cercle
Non séparable, mais comme le pipeline actuel fait déjà une **vraie FFT 2D** (pas le raccourci
« deux FFT 1D » un temps envisagé), le changement se limite à la condition du masque :
```js
// remplace le test rectangulaire par :
if (x*x + y*y >= (diametre_m/2)**2) continue;
```
Pas d'autre changement dans `fft1D`/`fft2D`/`echantillonnerChamp`. C'est le point le plus simple
de toute la liste, malgré ce qu'on pensait au début de la discussion (formule de Bessel *évitée*
grâce à la FFT).

### Inclinaison dans le plan (autour de l'axe du faisceau)
Une simple rotation des coordonnées avant le test du masque :
```js
const xr = x*Math.cos(phi) + y*Math.sin(phi);
const yr = -x*Math.sin(phi) + y*Math.cos(phi);
// puis tester xr, yr au lieu de x, y
```
Physique inchangée, aucun nouvel effet à modéliser.

---

## 3. Ce qui demande un vrai travail

### Hauteur de l'enveloppe 3D par colonne (`construireGeometrieEnveloppe`, `js/scene.js`)
Aujourd'hui, `halfHFar[i] = wMax * ixGeomCol[i]` : la demi-hauteur de l'enveloppe à l'écran est
`wMax` (un **scalaire unique**, `largeurFaisceauGaussien`, indépendant de x) multiplié par le
facteur de diffraction horizontal. Cette factorisation `hauteur(x) = wMax × f(x)` n'est valable
que parce que fente et carré sont séparables — pour le cercle, l'extension verticale réelle à
une abscisse x donnée dépend de x d'une façon non triviale (les anneaux d'Airy).

**À faire alors** : remplacer le calcul de `halfHFar[i]` par un vrai balayage de la grille FFT en
y, pour CHAQUE colonne i, cherchant jusqu'où `echantillonnerChamp(champ, x_m, y)` reste non
négligeable — au lieu de dériver la hauteur d'un facteur global.

### Plancher d'opacité borné à la tache centrale (shader dans `construireObjets`, `js/scene.js`)
Aujourd'hui borné par `aXFar` comparé à `uXLimite` (un intervalle 1D en x). Pour un cercle, « la
tache centrale » est un disque, pas un intervalle — il faudra :
- ajouter un attribut `aYFar` (même principe que `aXFar`, cf. `construireGeometrieEnveloppe`) ;
- comparer `sqrt(aXFar² + aYFar²)` à un rayon plutôt que `abs(aXFar)` à une largeur, dans le
  fragment shader.

### Inclinaison — géométrie 3D et rendu (pas juste la physique)
La rotation du masque (§2) suffit pour la figure de diffraction elle-même, mais :
- la lame porte-fente 3D (`wallLeft`/`wallRight`/`topBand`/`bottomBand`, `js/scene.js`) devrait
  visuellement tourner en cohérence ;
- `raysLine` (rayons pointillés vers les minima) ne varie aujourd'hui qu'en x — à généraliser en
  une vraie direction 2D si on veut que les pointillés suivent l'inclinaison.

### UI et lisibilité pédagogique
- Nouveau(x) réglage(s) à ajouter au panneau (forme, éventuellement 2 dimensions pour le carré,
  diamètre pour le cercle, angle d'inclinaison).
- Les encarts de valeurs (θ, position des minima) sont écrits pour une fente 1D — il faudra soit
  les adapter par forme (formule du carré assez proche, cercle nécessite l'angle d'Airy
  θ₁≈1,22λ/D), soit les masquer/reformuler selon la forme active.

---

## 4. Pièges déjà rencontrés à ne pas refaire

- **Ne jamais figer une hauteur/largeur « infinie » arbitraire pour une dimension qu'on veut
  négliger** : utiliser la vraie valeur physique à l'échelle (`FENTE_HAUTEUR_CM`) plutôt qu'un
  nombre inventé « assez grand ». Une vraie fente TP est déjà bien plus haute que le faisceau —
  pas besoin de bricoler pour que ce soit vrai.
- **La fenêtre FFT doit être dimensionnée par rapport au faisceau et à l'ouverture, pas par
  rapport à l'écran** — mais attention : le rapport (portée couverte à l'écran)/(position du 1er
  minimum) ne dépend que de la dimension de l'ouverture concernée (largeur de fente, diamètre du
  cercle...), **pas** de λ ni D (ils s'annulent). Toujours vérifier ce rapport au réglage le
  plus exigeant de chaque nouvelle dimension ajoutée (le plus petit `a`/diamètre réglable), pas
  seulement au réglage par défaut — c'est précisément ce qui avait été raté la première fois
  (fenêtre à 6 mm, correcte en apparence aux réglages par défaut, mais insuffisante dès que la
  largeur de fente était réduite au minimum, quels que soient λ/D).
- **Le graphe I(x) et les encarts ne doivent jamais lire le résultat de la FFT** — seulement des
  formules fermées exactes, propres à chaque forme. Le pipeline FFT est réservé à la texture et
  à l'enveloppe 3D (rendu visuel), jamais aux valeurs affichées.
