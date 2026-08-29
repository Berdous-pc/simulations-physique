# `derivee/` — Architecture

> Simulation : **la dérivée d'une fonction** — taux de variation, passage à la
> limite, sécante qui devient tangente.
> Niveau : Première / Terminale (maths et physique-chimie).

---

## 1. Intention pédagogique

Un point **M** est posé sur la courbe d'une fonction `f`, à l'abscisse `t₀`.
Deux points **A** et **B** définissent le taux de variation. Le sélecteur
« Définition du taux » choisit l'intervalle : **symétrique** (`t₀ − Δt/2` et
`t₀ + Δt/2`, M au milieu) ou **non symétrique** (`t₀` et `t₀ + Δt`, A confondu
avec M — c'est alors la définition `(z(t₀+Δt) − z(t₀))/Δt`). Les deux tendent
vers le même nombre dérivé. Seules `tGauche()/tDroite()` en dépendent.

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
├── fusée.png          ← image de la fusée (mode décollage)
├── css/
│   └── style.css
└── js/
    ├── sim.js         ← état, catalogue de fonctions, vue, utilitaires (1er)
    ├── courbe.js      ← graphe principal + interactions souris
    ├── graph.js       ← graphe de la fonction dérivée
    ├── fusee.js       ← panneau du décollage (fusée, sol, alignement)
    └── ui.js          ← contrôles du panneau, animation, boucle (dernier)
```

Ordre de chargement critique (scope global, pas de modules ES) :
`sim.js` → `courbe.js` → `graph.js` → `fusee.js` → `ui.js`.
`fusee.js` lit `geoCourbe`, posé par `courbe.js` : il doit donc être tracé
APRÈS `drawCourbe()` à chaque image.

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

`fonIdx`, `params`, `t0`, `dt`, `encadrement` (`'sym'` | `'avant'`), `zoom`, `panT`/`panZ`, les bascules d'affichage
(`showTangente`, `showCotes`, `showDeriv`) et `animDt`.

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

### Chronophotographie

Réservée à la trajectoire `z(t)` (`chronoDispo()` teste `id === 'trajectoire'`).
Le point d'étude cesse d'être libre : il se choisit parmi les positions
relevées à intervalle de temps constant, `M₀` à `t = 0`, un point tous les
`chronoPas()` — **Δt/2** en encadrement symétrique, **Δt** en non symétrique.
Les indices sont des entiers relatifs : `M₋₁`, `M₋₂`… avant l'origine.

L'état tient en `sim.chrono` (bascule) et `sim.chronoIdx` (indice choisi) ;
`majT0Chrono()` recale `sim.t0 = chronoIdx · chronoPas()` et doit être rappelée
partout où Δt ou l'encadrement changent (slider Δ, animation, `setEncadrement`).
Ce choix de pas fait tomber `tGauche()`/`tDroite()` **exactement** sur les
relevés voisins : le calcul du taux de variation n'a pas eu à changer — il se
lit de `Mᵢ₋₁` à `Mᵢ₊₁` (symétrique) ou de `Mᵢ` à `Mᵢ₊₁` (non symétrique).

`chronoActif()` exige en plus un pas non nul : à Δt = 0 tous les relevés se
confondraient, la page revient au point M seul.

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

`dessineCoords()` (optionnel, case « Afficher les coordonnées du point
courant ») rabat le point courant sur les deux axes : deux pointillés, deux
marques et les deux valeurs écrites du côté où l'axe porte ses graduations.
Le même tracé sert aux **deux graphes** — le graphe du bas y lit l'abscisse
de M et le nombre dérivé. Il s'appuie sur `xAxeY`, `yAxeX`, `labSousX` et
`labGaucheY` renvoyés par `dessineRepere()` : les valeurs se posent donc là
où l'axe se trouve réellement, y compris quand il est plaqué contre un bord.

Un **bandeau** en haut à droite affiche en grand la grandeur lue
(`Δz/Δt` ou `dz/dt`), pour la projection en classe.

### Interactions souris

| Geste | Effet |
|---|---|
| clic/glissé à moins de 40 px de la courbe | déplace le point M (en chronophotographie : saute sur le relevé Mᵢ le plus proche, `_poseM()`) |
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

---

## 8. Décollage de fusée (`fusee.js`)

Bascule depuis la section **Options** du panneau (réservée, comme la
chronophotographie, à la trajectoire `z(t)` : `fuseeDispo()`). Une section
**Décollage** apparaît alors entre *Paramètres* et *Encadrement*, avec les
mêmes commandes que la section *Contrôles* de la page champ uniforme :
Lancer/Pause, RAZ, curseur de vitesse (`FUSEE_VITESSES`) et bouton de
rembobinage à maintenir appuyé.

### Ce que le mode change

- **Le graphe n'est plus donné d'avance.** `sim.fuseeT` court de 0 à
  `fuseeDuree()` ; la courbe n'est tracée que jusqu'à cette date. En
  chronophotographie, seuls les **relevés** se posent pendant le vol — la
  courbe continue n'apparaît qu'à l'arrivée, dans l'ordre où on l'obtient
  au laboratoire.
- **Aucune figure de lecture pendant le vol** : ni point M, ni A/B, ni
  cotes, ni sécante, ni tangente, ni coordonnées. `drawCourbe()` sort tôt
  (`fuseeAnimEnCours()`), et le bandeau du taux de variation cède la place
  à un **chronomètre** (`dessineChronometre()`), au même endroit et à la
  même taille. Tout revient d'un coup à `sim.fuseeFini`, le point d'étude
  étant posé au milieu du vol pour que la sécante soit encadrée des deux
  côtés.
- **Les paramètres sont bornés autrement** : `a ∈ [0 ; 10]`, `b = 0`
  (figé), `c ∈ [15 ; 45]`. Tout le panneau passe par `bornesParam()`, qui
  consulte `FUSEE_BORNES` quand le mode est actif. Entrer dans le mode
  remet `a`, `b`, `c` à leurs valeurs par défaut.
- **Le vol s'arrête à une ALTITUDE, pas à une date** : `fuseeDuree()`
  résout `z(t) = 1000 m`, soit `t = √((1000 − c) / a)`. Doubler `a`
  raccourcit le vol au lieu de le faire sortir du cadre — le graphe garde
  la même altitude d'arrivée, seule l'abscisse se resserre. À `a = 0` la
  fusée ne décolle pas : `FUSEE_DUREE_MAX` (60 s) sert de garde-fou.
- **Le cadrage** est recalculé par `calcVueBase()` sur le VOL et non sur le
  domaine d'étude de la fonction : l'abscisse court jusqu'à `fuseeDuree()`,
  et l'ordonnée doit contenir le sol (`z = 0`) *et* le sommet de la fusée à
  l'arrivée, soit `z(durée) + c`. Ce dézoom se fait **par paliers** (cf.
  ci-dessous).
- **Le plafond de Δ** suit la durée du vol (`dtMaxCourant()`) : avec un Δt
  bloqué à 3 s, un vol de 40 s ne s'explorerait qu'à la loupe et la
  chronophotographie manquerait d'écart entre relevés.

### L'invariant du mode

`z(0) = c` est l'altitude du **centre de masse** quand la fusée est posée
au sol : c'est donc sa **demi-hauteur**. La fusée mesure `2c` mètres, et
changer `c` change la taille de l'image — sans quoi elle flotterait ou
s'enfoncerait. Trois conséquences en découlent d'elles-mêmes :

- le bas de la fusée affleure exactement `z = 0` à l'instant zéro ;
- le jet de gaz, situé **sous** la fusée dans l'image, est donc enterré au
  départ : la fusée a l'air posée, moteurs éteints. Le sol est peint
  **après** l'image, aucun cas particulier n'est écrit ;
- les flammes sortent d'elles-mêmes dès que le vol commence.

Les repères dans l'image (`FUSEE_HAUT`, `FUSEE_BAS`) ont été relevés sur le
fichier : la fusée occupe le haut, le jet de gaz le bas. Le centre de masse
est à mi-hauteur de la **fusée**, pas de l'image — le placer au milieu de
l'image le ferait descendre dans les flammes, qui ne sont pas de la matière
embarquée.

### Voir l'accélération : dézoom par paliers

Un dézoom qui colle à `z(t)` est un piège. La fenêtre grandit exactement au
rythme de la trajectoire, la fusée reste à la même hauteur relative, et son
**accélération devient invisible** — le mouvement paraît uniforme. Deux
dispositifs la rendent lisible.

**1. Le cadre avance par paliers** (`fuseeCadre()`). Entre deux sauts
d'échelle la fenêtre est *figée* : la fusée y grimpe, de plus en plus vite,
et c'est là que l'accélération se voit.

Trois règles font tout le comportement :

- **C'est le NOMBRE de sauts qui est fixé** (`FUSEE_NB_PALIERS = 2`, soit
  **trois** fenêtres successives : celle de départ et deux ensuite), pas le
  rapport d'un palier au suivant. Ce rapport s'en déduit, par axe, de façon
  que le dernier palier tombe exactement sur le cadre du vol entier. Un
  rapport fixe (×2) donnait un nombre de sauts variable selon `a` et `c` —
  jusqu'à sept, ce qui hachait l'animation.
- **Les deux axes sautent en même temps.** Le palier est commandé par l'axe
  le plus en avance (`fuseeAvancement()` mesure, pour chacun, la progression
  *géométrique* de son échelle de départ vers celle du vol entier ; on
  retient le maximum). Un saut se lit alors comme un seul événement — « on a
  changé d'échelle » — et non comme deux secousses successives.
- **La fin du vol est le plafond.** Comme le dernier palier *est* le cadre du
  vol entier, l'axe des z s'arrête à ~1090 m pour un vol qui monte à 1000 —
  là où un rapport ×2 arrondi au palier supérieur le poussait à 3840 m.

> Attention au vocabulaire quand on règle `FUSEE_NB_PALIERS` : il compte les
> **sauts**, et il y a donc un cadrage de plus que de sauts.

Le palier est une **fonction pure de `sim.fuseeT`** : le palier en service
est l'entier immédiatement supérieur à l'avancement. Aucune hystérésis, aucun
état mémorisé — sans quoi le **rembobinage** ne repasserait pas par les mêmes
cadrages que l'aller.

À chaque palier la fusée repart vers 50 % de la hauteur du cadre et remonte
vers 90 % ; sur le dernier, que rien ne repousse plus, elle monte d'un trait
jusqu'à 94 %. C'est la fin du vol qui est le moment le plus démonstratif.

Le saut est adouci sur `FUSEE_TRANSITION` de palier (25 %), par une
interpolation **lissée** (`lissage()`, dérivée nulle aux deux bouts). Une
rampe linéaire laissait un coin au départ *et* à l'arrivée de la transition,
et ces deux cassures de vitesse se lisaient comme un à-coup. C'est le seul
réglage du mode : trop court, c'est saccadé ; trop long, on retombe sur un
dézoom continu et l'accélération redevient invisible. Le lissage démarre plus
mou qu'une rampe et mettrait donc l'échelle en retard de 0,4 % au pire sur son
contenu ; chaque axe est borné par en dessous à ce qu'il doit contenir, si
bien que rien ne sort jamais du cadre.

**2. La traînée des relevés** (`dessineTraineeChrono()`, dans `fusee.js`),
active **uniquement en chronophotographie**. Le panneau partageant l'échelle
verticale du graphe, chaque relevé déjà enregistré pose une pastille dans le
ciel, sur l'axe de la fusée, à l'ordonnée `geoCourbe.gy(z(tᵢ))`. L'écartement
croissant des pastilles *est* l'accélération, lue directement à côté de la
fusée ; à l'arrivée, on a la bande chronophoto complète, resserrée en bas et
étalée en haut. Le parcours part du relevé le plus récent et descend : les
plus anciens, tassés, sont écartés d'eux-mêmes par le critère d'écartement
minimal (3 px), et deux garde-fous bornent le coût quand Δ est minuscule.

### Alignement des deux canevas

`drawFusee()` ne recalcule aucune échelle : il lit `geoCourbe.gy(z)` — donc
l'ordonnée que le **graphe** donne à `z` — et la translate dans son propre
canevas par la différence des `getBoundingClientRect()` des deux. Relue à
chaque tracé, elle suit le splitter et les redimensionnements. L'élève peut
alors aller à l'horizontale du point de la courbe jusqu'à la fusée : c'est
tout l'objet du mode.
