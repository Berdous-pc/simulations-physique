# Architecture — Effet Doppler

Page à **deux onglets** : *Démonstration* (vue de profil, 1D : démonstration
animée de la formule, onde à la surface de l'eau) et *Vue de dessus* (2D : onde
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
    ├── sim.js       état simD + modèle analytique de l'onglet Démonstration
    ├── profil.js    rendu canvas de la scène, frise des instants, glisser sur la frise
    ├── dessus.js    onglet Vue de dessus : état simV, modèle, rendu, oscilloscopes, interactions
    ├── ui.js        onglets, lecture / étapes, curseurs, démonstration écrite, resize
    └── sections-repliables.js  copie de titrage/ (chargé en dernier)
```

Scope global, pas de modules ES. Ordre de chargement : `sim → profil → dessus → ui`.
Deep-linking : `#demonstration` / `#vue-de-dessus`.

---

## Onglet Démonstration

### Parti pris pédagogique

La démonstration du cours tient en deux temps, que l'animation sépare :

1. **de t = 0 à t = T_E** : le front de l'onde parcourt λ = v·T_E, l'émetteur
   avance de v_E·T_E puis commence le motif 2 ; d'où λ′ = λ ∓ v_E·T_E. Le
   récepteur n'y joue aucun rôle ;
2. **après T_E** : le front et le début du motif 2 avancent à la même célérité,
   λ′ ne change plus, le récepteur les reçoit séparés de T_R = λ′/v.

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
  120 cm, récepteur en `X_RECEPTEUR` = 90 cm, émetteur au départ en
  `X_E0_BASE` = 40 cm (place laissée à l'onde émise vers l'arrière).
- `simD.vE` est toujours positive ; `simD.sens` (+1 se rapproche, −1 s'éloigne)
  donne la vitesse algébrique `dopVEs()`. Le récepteur reste à droite dans les
  deux cas : c'est l'émetteur qui part vers la gauche quand il s'éloigne.
- `dopXE0()` : abscisse de départ. Quand l'émetteur s'éloigne, il part d'autant
  plus près du récepteur qu'il va vite, pour rester dans la scène jusqu'à la
  fin (aux bornes des curseurs, il ne descend pas sous x ≈ 27 cm).
- **Eau plate à t = 0.** `dopDateEmission(x, t)` renvoie la date d'émission de
  ce qui se trouve en x (formule différente devant et derrière l'émetteur,
  continue à sa position) ; elle est négative là où l'onde n'est pas arrivée.
  L'élongation `dopElongation` vaut `sin(2π·f_E·te)` si te > 0, zéro sinon.
- `dopXRepere(n, t)` : abscisse du point émis vers le récepteur à n·T_E (n = 0 :
  front, n = 1 : début du motif 2).
- **Instants clés** `dopCles()` : `[0, T_E, t₁, t₂]` — départ du front, début du
  motif 2, réception du front, réception du début du motif 2.
  L'animation se termine `T_FIN_MARGE`·T_E après t₂ (`dopTFin()`).

Contraintes à respecter si l'on change les bornes des curseurs
(`VE_MAX`, plage de f_E, à tenir synchronisées avec `index.html`) :
`T_E < t₁` (le motif 2 commence avant que le front n'atteigne R), l'émetteur
reste dans la scène et avant le récepteur jusqu'à `dopTFin()`, et
`X_RECEPTEUR + λ′ ≤ SCENE_L` pour que la cote λ′ reste entière quand le début
du motif 2 arrive.

### Rendu (`profil.js`)

`dessinerProfil()` redessine tout à partir de `simD`. La mise en page verticale
se déduit d'une **taille de police `f`** proportionnelle au canvas (bornée à
12–24 px), de haut en bas :

| Zone | Contenu |
|---|---|
| cote λ (tirets) | « v·t » qui s'allonge, puis « λ = v·T_E » figée |
| cote λ′ (rouge) | apparaît à T_E entre le début du motif 2 et le front, puis **voyage avec eux** |
| eau | surface en trait fin ; le **premier motif émis vers le récepteur** (dates 0 à min(t, T_E)) en bleu épais ; barres « front » / « motif 2 » ; flotteurs E et R centrés sur la surface, moitié basse voilée (`_immerger`) ; vecteur v_E solidaire de E, étiquette à liseré clair |
| cote v_E·T_E (vert) | « v_E·t » puis « v_E·T_E », positions « E à t = 0 » / « E à t = T_E » |
| règle | graduée en cm |
| frise | axe du temps, repères d'émission (vert, au-dessus) et de réception (terracotta, au-dessous), durées T_E et T_R, curseur |

Après T_E, les cotes λ et v_E·T_E restent à leur place, estompées.

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
  l'on change v_E, f_E ou le sens, elle est replacée sur le même instant clé
  après le changement — on reste « sur la même étape » et la scène s'ajuste.
- `majTemps()` met à jour curseur, boutons d'étape, démonstration et scène.
- **Démonstration écrite** (`#demo-bloc`, HTML sous la scène) : cinq lignes,
  classes `.atteinte` (étape passée) et `.active` (étape en cours) posées par
  `_majDemo()` ; les signes, le comparateur et les verbes qui dépendent du sens
  sont dans des `<span class="dp-…">` remplis par `_majTextesSens()`.
- La boucle `requestAnimationFrame` ne tourne que pendant la lecture ; à
  l'arrêt, le rendu se fait à la demande.

---

## Onglet Vue de dessus (`dessus.js`)

Onde **sonore** vue de dessus, fortement **ralentie** (`simV.ralenti` : ms
simulées par seconde réelle). Unités : m, s, Hz. Scène de `VD_LARGEUR` = 12 m
de large, hauteur déduite du canvas, y = 0 au milieu.

### Modèle

- **Objets** `simV.E` et `simV.R` : position, vitesse `v` (curseur), direction
  `dir`, et `cible` (point visé pendant qu'on les tire à la souris).
  `_vdDeplacer()` : mouvement rectiligne uniforme avec **rebond** sur les bords ;
  un objet tiré à la souris pendant la lecture **rejoint le pointeur à sa
  vitesse réglée** (0,4 c s'il est immobile) au lieu de s'y téléporter — avec le
  ralenti, un geste de la main serait sinon largement supersonique. À l'arrêt,
  le déplacement est direct.
- **Historique de l'émetteur** `_vdH` (date, position, phase), un échantillon
  par pas de calcul, élagué au-delà de la traversée de la scène (E et R y
  restent, donc c·(t − τ) ≤ diagonale). Un déplacement à l'arrêt y pose un
  échantillon `saut` : le segment correspondant n'est pas un trajet.
- **Crêtes** `_vdCretes` : une par passage de la phase à π/2 + 2kπ, cercle de
  rayon c·(t − t_k) centré là où se trouvait l'émetteur. Le rayon est recalculé
  avec le c courant (changer c redessine tout, approximation assumée).
- **Signal reçu** `_vdSignalRecu()` : recherche dans l'historique des dates
  retardées τ telles que c·(t − τ) = distance au point d'émission ; somme des
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
  Les deux écrans ont **la même base de temps** (`VD_FENETRE_T` = 5 périodes
  d'émission, défilante) et la même échelle verticale : c'est ce qui rend
  lisible l'écart de période. Les signaux sont enregistrés dans `_vdTrace`.

### Commandes

Lecture / Pause, RAZ (efface l'onde, replace E et R), ralenti, célérité c,
fréquence f_E, vitesses v_E et v_R, boutons des deux écrans, lecture de f_E,
f_R et de leur écart. Fonctions du panneau préfixées `vd` ; `ui.js` n'appelle
que `initDessus()`, `resizeDessus()` et `vdArreter()` (changement d'onglet).

---

Restent à faire : carte(s) sur la page d'accueil avec aperçu, entrée dans
`sitemap.xml`.
