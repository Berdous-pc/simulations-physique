# `derivee/` — Architecture

> Simulation : **la dérivée d'une fonction** — taux de variation, passage à la
> limite, sécante qui devient tangente.
> Niveau : Première / Terminale (maths et physique-chimie).

---

## 1. Intention pédagogique

Un point **M** est posé sur la courbe d'une fonction `f`, à l'abscisse `t₀`.
Deux points **A** et **B** l'encadrent symétriquement, à `t₀ − Δt/2` et
`t₀ + Δt/2`.

- La pente de la **sécante (AB)** est le **taux de variation** `Δf/Δt`.
- Quand **Δt → 0**, la sécante bascule sur la **tangente** en M, et le taux de
  variation tend vers le **nombre dérivé** `f′(t₀)`.
- En **zoomant** fortement autour de M, la courbe se confond avec sa tangente :
  c'est la lecture géométrique de la dérivabilité.
- Le **graphe du bas** (optionnel) porte la fonction dérivée `f′` sur le même
  axe des abscisses que le graphe du haut : on passe du *nombre* dérivé en un
  point à la *fonction* dérivée.

Page inspirée d'un script Python matplotlib de l'auteur (sliders `Delta t` et
`Zoom`, sélection du point par clic sur la courbe), réécrite pour le web avec
plusieurs fonctions au choix, une animation `Δt → 0` et le graphe de `f′`.

---

## 2. Arborescence

```
derivee/
├── index.html         ← structure HTML uniquement
├── ARCHITECTURE.md    ← ce fichier
├── css/
│   └── style.css
└── js/
    ├── sim.js         ← état, catalogue de fonctions, vue, utilitaires (1er)
    ├── courbe.js      ← graphe principal + interactions souris
    ├── graph.js       ← graphe de la fonction dérivée
    └── ui.js          ← contrôles du panneau, animation, boucle (dernier)
```

Ordre de chargement critique (scope global, pas de modules ES) :
`sim.js` → `courbe.js` → `graph.js` → `ui.js`.

Page **sans onglets** : pas de deep-linking `#hash`.

---

## 3. `sim.js`

### Catalogue `FONCTIONS`

Tableau de définitions, une par fonction proposée. Chaque entrée porte :

| Champ | Rôle |
|---|---|
| `id`, `nom`, `sousTitre` | identité et formule affichée dans le sélecteur |
| `varNom`, `varUnite` | nom et unité de la variable (`t` en `s`, `x` sans unité…) |
| `funNom`, `funUnite` | nom et unité de la fonction (`z` en `m`…) |
| `derivUnite`, `derivSens` | unité du nombre dérivé et son sens physique (« vitesse ») |
| `tMin`, `tMax` | domaine d'étude (bornes du slider de `t₀` et du cadrage initial) |
| `t0`, `dtMax` | point d'étude par défaut, valeur maximale de Δ |
| `params[]` | paramètres réglables (`{id,label,unite,min,max,step,val,dec}`) |
| `f(t, p)` | la fonction |
| `df(t, p)` | sa dérivée **exacte** (analytique) |

Fonctions fournies : trajectoire verticale `a·t²+b·t+c`, oscillateur
`A·cos(2πt/T)`, décharge de condensateur `E·e^(−t/τ)`, fonction cube `x³+p·x`.

> Ajouter une fonction = ajouter une entrée dans `FONCTIONS`. Le panneau
> (sélecteur, sliders de paramètres, bornes de `t₀`, étiquettes `Δz/Δt` et
> `dz/dt`, unités des afficheurs) se construit intégralement à partir de la
> définition — aucun autre fichier à toucher.

La dérivée est **analytique**, jamais approchée numériquement : c'est la valeur
de référence à laquelle le taux de variation est comparé, elle ne doit pas
elle-même être une approximation.

### État `sim`

`fonIdx`, `params`, `t0`, `dt`, `zoom`, `panT`/`panZ`, les bascules d'affichage
(`showTangente`, `showCotes`, `showDeriv`, `showCourbeDeriv`) et `animDt`.

### Vue (`vueBase`, `vue`)

Le cadrage est décrit par un **centre + des dimensions**, en unités de la
fonction : `{cT, cZ, w, h}`.

- `calcVueBase()` balaie `f` sur `[tMin, tMax]` et en déduit le cadre complet
  (marge 12 %). Recalculé à chaque changement de fonction ou de paramètre.
- `appliqueVue()` en dérive la vue affichée :
  `w = wBase / zoom`, et le centre glisse du centre du cadre vers le point M
  selon `k = 1 − 1/zoom`. À zoom 1 la vue est le cadre complet ; à fort zoom, M
  est au centre — c'est ce recentrage qui permet de « plonger » sur le point.
  Le décalage manuel `panT`/`panZ` s'ajoute par-dessus.

**Point d'attention** : pendant un glissé du point M à la souris, `appliqueVue()`
n'est *pas* rappelée. Sinon la vue se recentrerait à chaque frame sur le point
qu'on déplace, et le point fuirait sous le curseur. Le recentrage n'a lieu que
via le slider `t₀`, le zoom, ou un changement de fonction.

### Utilitaires

`sizeCanvas()` (gestion du `devicePixelRatio`), `echelleTexte()`, `tickStep()`,
`fmtTick()`, `fmtFr()`, `fmtSci()`, `fmtSmart()`, `avecUnite()`,
`texteCartouche()`, `flecheDouble()`, `pastille()`, palette `COUL`.

---

## 4. `courbe.js`

### `dessineRepere(ctx, W, H, opts)`

Repère **commun aux deux graphes**, tracé à la manière d'un repère de cours de
maths : pas de cadre, mais **deux axes fléchés dessinés dans la fenêtre
graphique**, qui portent eux-mêmes leurs graduations et leur nom.
Renvoie la géométrie `{x0, y0, padT, plotW, plotH, gx, gy, s, tMin…}`.

- L'axe des abscisses est placé à l'ordonnée `f = 0`, l'axe des ordonnées à
  l'abscisse `t = 0`. Si zéro n'est pas dans la fenêtre (zoom loin de
  l'origine), l'axe concerné est **plaqué contre le bord** plutôt que de
  disparaître.
- Les graduations s'écrivent sous l'axe horizontal et à gauche de l'axe
  vertical ; elles **basculent de l'autre côté** quand l'axe est collé au bord,
  sinon les nombres sortiraient de la fenêtre (`labSousX`, `labGaucheY`).
- Le `0` n'est écrit qu'une fois, par l'axe des abscisses, quand les deux axes
  se croisent réellement dans la fenêtre.
- Une grille légère subsiste en fond, sans concurrencer les axes.

> `texteCartouche()` pose son propre trait (halo blanc). Dans les boucles de
> graduations, `strokeStyle` et `lineWidth` doivent donc être réarmés **à chaque
> tour**, sinon les graduations suivantes seraient tracées en blanc.

Les marges dépendent uniquement de `W` pour `padL`/`padR` : les deux graphes
ayant la même largeur, **leurs axes des abscisses sont alignés au pixel près**,
ce qui est indispensable pour lire `f′(t₀)` à la verticale de M.

### `drawCourbe()`

Dans l'ordre : courbe `f` (échantillonnée sur toute la largeur visible),
droite (AB) tracée sur toute la largeur du cadre (tirets si sécante, trait plein
si `Δt = 0`, portion `[A ; B]` renforcée), tangente exacte optionnelle
(pointillés verts), cotes, pastilles A/M/B, étiquettes.
Tout est découpé au cadre (`ctx.clip`) : en zoom fort, les droites en sortent
largement.

Un **bandeau** en haut à droite affiche en grand la grandeur lue
(`Δz/Δt` ou `dz/dt`), pour la projection en classe.

### Interactions souris

| Geste | Effet |
|---|---|
| clic/glissé à moins de 40 px de la courbe | déplace le point M |
| clic/glissé ailleurs | décale la vue (pan) |
| molette | zoom autour de M |

Événements `pointer*` avec `setPointerCapture`, `touch-action: none` sur le
canvas. `geoCourbe` conserve la géométrie du dernier tracé pour convertir
pixels → unités.

---

## 5. `graph.js`

`drawDeriv()` trace la fonction dérivée sur **le même intervalle d'abscisses**
que le graphe principal. Le cadrage vertical est recalculé à chaque tracé sur la
plage visible, en englobant aussi le taux de variation courant (qui sort de
l'intervalle des valeurs de `f′` quand Δt est grand).

Y figurent : la courbe `f′` (verte, optionnelle), un repère vertical à `t₀`, le
**niveau du taux de variation** (horizontale terracotta en tirets) et les deux
points `(t₀, Δf/Δt)` et `(t₀, f′(t₀))` — leur écart *est* l'erreur commise en
remplaçant la dérivée par le taux de variation.

---

## 6. `ui.js`

### Correspondances slider ↔ grandeur

- **Δ** : progression **quadratique** (`dt = (v/1000)² · dtMax`). Les derniers
  crans avant zéro couvrent des valeurs de plus en plus petites — c'est
  précisément là que se joue le passage à la limite.
- **Zoom** : progression **logarithmique** (`zoom = ZOOM_MAX^(v/1000)`, jusqu'à
  ×2000), sinon la moitié haute du slider serait inutilisable.

### Panneau construit dynamiquement

`construitSelecteurFonctions()`, `construitParams()`, `construitSliderT0()` :
tout le panneau se régénère à partir de la définition de la fonction courante.

### Animation « Δt → 0 »

`lanceAnimDt()` / `avanceAnimDt()` : la position du slider Δ décroît
linéairement vers 0 en ~2,6 s, donc Δ décroît quadratiquement — la sécante
pivote et vient se coucher sur la tangente. Le bouton bascule en
`.btn-pause` (« ■ Arrêter ») pendant l'animation, et relance la démo depuis
`dtMax` si Δ est déjà nul.

### Boucle de rendu

`requestAnimationFrame` permanent, mais **redessin uniquement si `needsDraw`**
(posé par `requestDraw()`), ou pendant l'animation. Rien ne bouge tant que
l'utilisateur n'agit pas : inutile de retracer 60 fois par seconde une image
identique.

### Splitter

Barre de 6 px entre les deux graphes (`pointermove`), pilotant la variable CSS
`--frac-courbe` sur `#row-graphes`, bornée à `[0.25 ; 0.8]`. Visible seulement
quand la courbe dérivée est affichée.

---

## 7. Points de vigilance

- **`devicePixelRatio`** : `sizeCanvas()` pose `canvas.width/height` en pixels
  *physiques* et applique `setTransform(dpr,…)`. Partout ailleurs, les
  dimensions se lisent sur `clientWidth`/`clientHeight` (pixels CSS).
- Le canvas de la dérivée a une taille nulle tant qu'il est masqué :
  `toggleGraphDeriv()` appelle `resizeAll()` après l'avoir rendu visible.
- Les unités peuvent être **vides** (fonction cube) : passer par `avecUnite()`
  et `titreAxe()`, jamais concaténer une unité directement.
- Les étiquettes `Δz/Δt` et `dz/dt` sont construites par `labelTaux()` /
  `labelDeriv()` à partir des noms de la fonction — aucune chaîne codée en dur.
