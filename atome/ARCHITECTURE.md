# Architecture — `atome/` (Structure électronique des atomes)

> Simulation « Structure de la matière » (Seconde) : les 3 premières lignes du
> tableau périodique (H → Ar). Un clic sur un élément affiche le schéma de son
> atome : noyau (protons/neutrons de l'isotope le plus abondant), cercles des
> sous-couches électroniques (1s, 2s, 2p, 3s, 3p) avec électrons équirépartis,
> et configuration électronique écrite sous le schéma.

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
- `state` : `{ Z, showEmpty, showLegend }`.

## Rendu (`draw.js`)

Rendu **statique hors interaction** : `render()` est appelé à chaque
changement d'état ou de taille ; une boucle `requestAnimationFrame` ne tourne
que pendant l'animation d'éclatement (et un `rAF` ponctuel pendant le drag).

- **Noyau 3D** : empilement compact obtenu par **relaxation** — les A billes
  partent de positions aléatoires (seedées par Z via `mulberry32`, cache
  `_nucleusCache` → disposition stable), puis 250 itérations « attraction
  vers le centre (×0,96) + séparation des paires plus proches que 1,85 rayon
  de bille ». Converge vers les vraies formes compactes : haltère pour A = 2,
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
- Canvas dimensionné avec `devicePixelRatio` (cf. CONTEXTE_PROJET §7).

## UI (`ui.js`)

- `buildTP()` : construit le tableau périodique réduit en CSS grid 18 colonnes.
  `colonneTP(Z)` place chaque élément dans sa vraie colonne (H col 1, He col 18,
  blocs s en colonnes 1-2, bloc p en colonnes 13-18). Chaque case affiche
  A (haut gauche), Z (bas gauche) et le symbole (centre) — notation AZX.
- `selectElement(Z)` : met à jour la sélection, le schéma, la légende texte
  (`#atom-caption`), la configuration colorée (`#config-line`, exposants en
  `<sup>`) et les afficheurs du panneau.
- Options : `toggleEmpty()` (sous-couches vides), `toggleLegend()` (légende).
- Élément par défaut au chargement : oxygène (Z = 8).

## Extensions prévues (discutées avec l'auteur, non implémentées)

La page est en « un seul écran + modes » : la section **Mode** du panneau
contient déjà les boutons Explorer / Comparer / Ioniser / Test (les trois
derniers `disabled`).

- **Comparer** : 2 éléments côte à côte (2 schémas se partageant la zone).
- **Ioniser** : retirer/ajouter des électrons, affichage de l'ion formé.
- **Test** : s'entraîner à écrire la configuration électronique et/ou prédire
  l'ion stable — reprendre la mécanique de `reaction/` (score, popup, 2 essais).
- Deep-linking `#hash` à ajouter quand les modes existeront.
