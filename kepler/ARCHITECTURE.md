# Architecture — Simulation « Les lois de Kepler »

> Page à 3 onglets (un par loi de Kepler), niveau Terminale.
> Conventions générales : voir `CONTEXTE_PROJET.md` à la racine du site.

---

## Structure des fichiers

```
kepler/
├── index.html       ← structure HTML uniquement
├── ARCHITECTURE.md  ← ce fichier
├── css/
│   └── style.css    ← tout le CSS (charte du site)
└── js/               (scope global, ordre de chargement critique)
    ├── sim.js       ← état global + données astronomiques + maths képlériennes
    ├── orbites.js   ← rendu canvas des 3 zones d'animation
    ├── graph.js     ← graphe T/a de la 3ᵉ loi (sélecteurs d'axes, tooltip)
    └── ui.js        ← onglets, contrôles, boucle RAF (chargé en dernier)
```

## Les trois onglets

Deep-linking par `#hash` : `#premiere-loi` · `#deuxieme-loi` · `#troisieme-loi`
(mis à jour via `history.replaceState` à chaque bascule, cf. convention du site).
Chaque onglet a **son propre canvas** et **son propre état** (`sim1`, `sim2`,
`sys3` dans `sim.js`) ; seule la vue active avance et se redessine dans la
boucle RAF (`loop()` de `ui.js`), les autres restent figées.

### 1ʳᵉ loi — Ellipse (`sim1`, `drawLoi1`)

- Planète fictive : `a` (0,5 → 4 ua) et `e` (0 → 0,99) réglables.
  e est plafonné à 0,99 : à e = 1 la trajectoire s'ouvre (parabole), ce
  n'est plus une ellipse — et le solveur de Newton n'y convergerait plus.
- Mouvement képlérien réel (résolution de M = E − e·sin E par Newton,
  `solveKepler` dans `sim.js`) — la variation de vitesse annonce la 2ᵉ loi.
- Éléments géométriques activables : foyers F/F′ + centre O + distance c,
  grand axe (flèche a), petit axe (flèche b), distances r et r′ aux foyers
  (avec readout « r + r′ = 2a constant »).
- **Échelle FIXE**, calibrée sur `A1_MAX` (le max du slider a, cf. `sim.js`) :
  agrandir a agrandit réellement l'ellipse à l'écran, et augmenter e
  l'aplatit à grand axe constant (le centre O reste au centre, le Soleil
  glisse le long du grand axe). Une vue auto-échelle annulerait
  visuellement l'effet des deux sliders — c'est pour ça que la plage du
  slider a reste bornée (0,5 → 4 ua) : en échelle fixe, la plus petite
  ellipse doit rester lisible à l'écran.

### 2ᵉ loi — Loi des aires (`sim2`, `drawLoi2`)

- `a = 1 ua` fixé (T = 1 an), `e` réglable ; temps simulé en jours.
- Échelle fixe calée sur 2a (même logique que l'onglet 1) : e aplatit
  l'ellipse sans changer le grand axe à l'écran.
- Bouton « Balayer l'aire pendant Δt » : enregistre `Mstart`/`Mend`
  (`Mend = Mstart + 2π·Δt/T`), remplit le secteur progressivement pendant
  l'animation, puis fige l'aire aux bornes **exactes** même si la frame a
  dépassé `tEnd`. Jusqu'à 6 aires comparables (couleurs `AIRE_COULEURS`),
  valeur exacte `π·a·b·Δt/T` en ua² listée dans le panneau.
- Secteurs tracés par échantillonnage de l'anomalie excentrique E (E n'est
  pas ramené modulo 2π : il reste « déroulé » comme M, ce qui rend le tracé
  des secteurs trivial même à cheval sur le périhélie).
- Vecteur vitesse (vis-viva : v = 29,78·√(2/r − 1/a) km/s) activable.
- Changer `e` efface les aires (les secteurs ne correspondent plus à l'ellipse).

### 3ᵉ loi — Loi des périodes (`sys3`, `drawSys3` + `graph.js`)

- Quatre systèmes (données réelles dans `SYSTEMES`, `sim.js`) :
  - Mercure → Mars (a en ua, T en an),
  - Jupiter → Neptune (a en ua, T en an),
  - Lunes galiléennes de Jupiter (a en **Gm**, T en jours),
  - Lunes de Saturne : Encelade, Téthys, Dioné, Rhéa, Titan (a en Gm, T en
    jours — Mimas et Japet écartées, Japet orbitant 15× plus loin
    qu'Encelade l'échelle linéaire écraserait les orbites internes).
  Les deux groupes de planètes sont séparés pour éviter l'écrasement
  d'échelle (Mercure serait invisible à l'échelle de Neptune).
- Orbites tracées avec leur **excentricité réelle** (attracteur au foyer),
  périhélies alignés vers +x par simplification ; tous les astres partent
  alignés à t = 0.
- Crans de vitesse **propres à chaque système** (labels des ticks réécrits
  par `_syncSpeedUI3`).
- Graphe : points (a^p, T^q), p et q choisis via les sélecteurs overlay
  posés contre chaque axe (`.axis-sel-y` / `.axis-sel-x`). Un ajustement
  proportionnel y = k·x est calculé à chaque tracé : si le résidu relatif
  max est < 2 % (vrai uniquement pour T² vs a³), la droite modèle et la
  valeur de k s'affichent automatiquement (encart vert).
  k ≈ 1,00 an²/ua³ pour les deux systèmes planétaires (même attracteur),
  ≈ 41,7 j²/Gm³ pour les lunes de Jupiter et ≈ 139 j²/Gm³ pour celles de
  Saturne — de quoi discuter du rôle de la masse centrale.
- Bulle de survol des points (`#graph3-tooltip`).
- **Zoom molette** (`_graph3Zoom`, `initGraph3Wheel`) : resserre les
  étendues `xRange`/`yRange` autour de l'origine (qui reste ancrée au coin
  bas-gauche du cadre, donc le zoom la recadre naturellement) — utile pour
  distinguer des astres tassés près de 0 (ex. les lunes de Jupiter/Saturne
  sur l'axe a). Dézoom plafonné à 1 = le cadre complet calculé sur les
  données ; pas de zoom-out au-delà. Réinitialisé à 1 sur changement de
  système ou d'axe (l'étendue change du tout au tout). Double-clic = reset
  rapide. Points/droite modèle découpés proprement au cadre de tracé
  (`ctx.clip`) au-delà de zoom = 1.

## Points techniques

- **Fond « espace »** : exception assumée à la charte (fond ivoire) — la
  zone d'animation a un dégradé sombre (CSS, `.sim-area`), sans étoiles.
  Conséquences : halo de texte sombre (`texteHalo`), couleurs des tracés
  éclaircies, et **double teinte** pour les astres de la 3ᵉ loi
  (`couleurClair` sur le canvas sombre, `couleur` sur le graphe et le
  tableau qui restent sur fond clair). Le graphe, le panneau et le reste
  de la page gardent la charte claire.

- **Canvas & devicePixelRatio** : `sizeCanvas()` (dans `orbites.js`) pose les
  pixels physiques + `setTransform(dpr)` ; tout le dessin travaille ensuite
  en pixels CSS (`clientWidth`/`clientHeight`). Renvoie `false` si le canvas
  est masqué (`display:none` ⇒ taille nulle) — d'où le `resizeAll()` à
  chaque bascule d'onglet.
- **Échelles** : onglets 1 et 2 en échelle fixe (calée sur `A1_MAX` / sur
  2a) pour que les sliders a et e aient un effet visible ; onglet 3 en
  auto-échelle par système (l'orbite la plus externe + marge). Dans tous
  les cas la barre d'échelle choisit une longueur « ronde » de 60–160 px.
- Le graphe de la 3ᵉ loi n'est **pas** redessiné par la boucle RAF (il est
  statique) : uniquement sur changement de système, d'axes ou de fenêtre.
