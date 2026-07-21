# Contexte du projet — Simulations pédagogiques lycée

> Lire ce fichier en début de session avant de créer ou modifier une page.

---

## 1. Contexte

- **Auteur** : Professeur de physique-chimie au lycée
- **Usage** : Projection vidéoprojecteur en classe + utilisation élèves sur PC personnel
- **Public** : Élèves lycée (Seconde, Première, Terminale)
- **Env. technique** : Windows 11, Chrome/Firefox, Anaconda/Spyder pour Python

---

## 2. Objectif

Collection de **simulations interactives** de physique-chimie. Chaque simulation est un **fichier HTML unique autonome** (pas de dépendance externe, pas d'Internet requis en principe — une référence externe CDN est tolérée si vraiment nécessaire).

---

## 3. Responsivité — exigence prioritaire

**Toutes les pages doivent être pleinement responsives**, afin de s'adapter sans perte de lisibilité à deux contextes d'usage très différents :

| Contexte | Écran typique | Priorités |
|---|---|---|
| Projection en classe (vidéoprojecteur) | 1280–1920 px, distance > 3 m | Textes et chiffres grands, contrastes forts, pas de scroll |
| Utilisation élève sur PC personnel | 1024–1440 px, parfois 768 px | Interface complète visible, panneau scrollable si besoin |

### Principes appliqués dans toutes les pages

- **Pas de `<header>`** : aucune page de **simulation** ne comporte de balise `<header>`. Le `<body>` contient directement le `<main>`, qui occupe 100 % de la hauteur disponible. (Exception assumée : la page d'accueil a un `<header class="page-header">` pour son titre.)
- **`height: 100vh` + repli `100dvh` + `overflow: hidden` sur `body`** : l'interface tient dans la fenêtre sans scroll de page. Le pattern complet (à recopier tel quel) :
  ```css
  /* dvh : suit la hauteur réellement visible (barres dynamiques du navigateur) ;
     vh reste le repli pour les navigateurs sans support dvh. */
  height: 100vh;
  max-height: 100vh;
  height: 100dvh;
  max-height: 100dvh;
  ```
- **Grille CSS fluide** : `grid-template-columns: 1fr clamp(200px, 22vw, 300px)` — écriture unique sur tout le site (min, **valeur préférée fluide**, max) ; le panneau droit se rétrécit sur petite fenêtre. Toute valeur qui doit « coller » au panneau (overlay en `position: absolute/fixed`, `right:` …) réutilise la même formule `clamp(200px, 22vw, 300px)`.
- **`clamp()` systématique** pour les tailles de police, paddings et dimensions : garantit un minimum lisible sur petit écran et un maximum raisonnable sur grand écran.
  - Exemple panneau : `font-size: clamp(11px, 1.1vw, 14px)`
  - Exemple formules chimiques (`reaction.html`) : `font-size: clamp(28px, 4vw, 52px)`
- **Canvas redimensionné dynamiquement** via `resizeCanvases()` appelé à chaque `resize` (avec anti-rebond `requestAnimationFrame`), pour que la zone de simulation occupe toujours tout l'espace disponible.
- **Container queries (`cqmin`/`cqw`) pour un overlay HTML posé sur un conteneur qui n'a pas la taille de la fenêtre** (ex. légende de `dissolution/`, posée sur `#diss-scene-wrap`, plus petit que le viewport à cause de la grille de l'onglet) : un `clamp(…, Nvw, …)` classique suit la largeur de la FENÊTRE, pas celle du conteneur réel, et ignore totalement sa hauteur. Poser `container-type: size` sur le conteneur, puis dimensionner l'overlay en `cqmin` (le plus petit des deux axes du conteneur) fait suivre les DEUX dimensions réelles. Distinguer largeur/hauteur si besoin : une propriété qui ne doit être contrainte que par la largeur disponible (ex. `max-width` d'une boîte qui doit s'aplatir plutôt que se resserrer quand seule la hauteur diminue) doit rester en `cqw`, pas `cqmin`.
- **Splitter draggable** (condensateur, radioactivité) : l'élève peut ajuster la proportion simulation / graphe selon la taille de son écran.
- **Panneau droit scrollable** (`overflow-y: auto`) quand le contenu est plus long que la fenêtre (petits écrans).
- **Textes des zones de simulation** (canvas) dessinés proportionnellement à la taille du canvas, pas en px fixes.

---

## 4. Charte graphique

> **Référence graphique : les pages les plus récentes** — `dissolution/`, `champ_uniforme/`, `ondes/` (et `pression/`). En cas de doute ou de contradiction entre ce document et une page, ce sont ces pages qui font foi ; les anciennes pages ont été alignées sur elles.

### Couleurs

| Rôle | Valeur |
|---|---|
| Fond simulation | `#fdf8f0` (ivoire chaud) |
| Fond page (`body`) / panneau | `#e8e4de` (partout, comme fond de `body` et de `#panel` — l'ancien `#f0ede8` ne subsiste plus qu'en accent ponctuel dans certaines pages, ex. ligne alternée de tableau) |
| Fond graphes | `#faf9f6` |
| Bordures | `#c8c0b4` |
| Texte principal | `#2c3e50` |
| Texte secondaire / labels | `#7a8a96` |
| Accent bleu (charge, actif) | `#2a6aaa` |
| Accent terracotta (décharge, alerte) | `#b04020` / `#c05020` |
| Flèches de courant | `#cc2200` |
| Électrons | `#2a6aaa` (disque bleu, `−` blanc) |
| Ions positifs | `rgba(180,80,40,0.75)` (terracotta, `+` blanc) |
| Borne `+` | `rgba(210,100,20,1)` (orange) |
| Borne `−` | `rgba(40,80,180,1)` (bleu) |

### Typographie

Les tailles sont **volontairement grandes** pour la lisibilité en projection. Les valeurs `clamp()` assurent la responsivité.

| Rôle | Police | Taille / règle |
|---|---|---|
| Corps UI | `'Segoe UI', Arial, sans-serif` | `clamp(11px, 1.1vw, 14px)` sur `#panel` (toutes pages) |
| Labels composants (circuit, canvas) | `bold monospace` | `28–36px` (calculé en JS selon taille canvas) |
| Valeurs instantanées | `bold tabular-nums` | `14–20px` |
| Labels / graduations graphes | `monospace` | `12–13px` |
| Titres de section panneau | `uppercase, letter-spacing: 1px` | `11px` (ou `0.78em` relatif) |
| Polices graphe (axes, valeurs) | — | ×2 par rapport à base canvas |
| Légende séries | — | ×1,5 par rapport à base canvas |
| Formules chimiques (`reaction.html`) | idem | `clamp(28px, 4vw, 52px)` |

### Layout

- **Grille principale** : `grid-template-columns: 1fr clamp(200px, 22vw, 300px)` (écriture unique)
  - Colonne gauche : simulation + graphes (flex column avec splitter draggable si applicable)
  - Colonne droite : panneau de contrôle, scrollable, hauteur 100 %
- `overflow: hidden` sur `body` et `main` — pas de scroll page, conçu pour `100vh`
- **Pas de `<header>`** — le `<main>` occupe toute la hauteur du `body`
- Sur très petit écran, la zone simulation peut autoriser `overflow-y: auto` localement (cf. `reaction.html`)

---

## 5. Panneau de contrôle — charte (référence : ondes, champ_uniforme & dissolution)

Les pages les plus récentes (`ondes/`, `champ_uniforme/`, `dissolution/`) font référence pour le panneau droit. Toutes les tailles de police du panneau utilisent `clamp()` (jamais de px fixe pour un texte du panneau).

### Structure du panneau

```
#panel
  ├── .panel-main-tabs          ← onglets principaux (Discret/Continu, Équilibrage/Limitant…)
  └── #panel-body               ← corps scrollable
        ├── .panel-main-section ← sections associées aux onglets
        │     ├── .section-title
        │     ├── .mode-tabs    ← sous-onglets (Libre/Auto…) si applicable
        │     ├── .param-row    ← rangée paramètre (label + slider ou input)
        │     ├── .readout      ← afficheur valeur instantanée
        │     ├── .btn          ← bouton action
        │     └── .sep          ← séparateur horizontal
        └── (fin section)
  └── .panel-hint               ← hint collé en bas, hors scroll
```

### Onglets principaux (`.panel-main-tab`)

| Propriété | Valeur |
|---|---|
| `font-size` | `clamp(12px, 1.2vw, 15px)`, `font-weight: 700` |
| `padding` | `9px 4px` |
| Fond inactif | `#d4d0c8`, couleur `#8a9aaa` |
| Fond actif | `#e8e4de`, couleur `#2a6aaa` |
| Bordure active | `1.5px solid #b0a898`, bord bas fusionné avec `#panel-body` |

### Sous-onglets (`.mode-tab`)

| Propriété | Valeur |
|---|---|
| `font-size` | `clamp(12px, 1.2vw, 15px)`, `font-weight: 700` |
| `padding` | `8px 4px` |
| Fond inactif | `#dedad2`, couleur `#5a6a78` |
| Fond actif | `#2a6aaa`, couleur `#fff` |
| Bordure ensemble | `1px solid #c8c0b4`, `border-radius: 6px` |

### Titres de section (`.section-title`)

| Propriété | Valeur |
|---|---|
| `font-size` | `11px` (ou `0.78em`) |
| `font-weight` | `700` |
| `text-transform` | `uppercase` |
| `letter-spacing` | `1px` |
| Couleur | `#7a8a96` |

### Boutons (`.btn`)

Tous les boutons partagent : `width: 100%`, `border-radius: 6px`, `font-weight: 700`, `font-family: inherit`, `transition: transform 0.1s`, `:active { transform: scale(0.97) }`.

| Variante | Fond | Couleur texte | `font-size` | `padding` | Usage |
|---|---|---|---|---|---|
| `.btn-raz` | `#dedad2` | `#5a6a78` | `clamp(12px, 1.2vw, 15px)` | `9px 6px` | Remise à zéro |
| `.btn-primary` | `#2a6aaa` | `#fff` | `clamp(13px, 1.3vw, 16px)` | `11px 6px` | Action principale (bleu) |
| `.btn-green` | `#2a8a50` | `#fff` | `clamp(13px, 1.3vw, 16px)` | `11px 6px` | Action positive (vert) |
| `.btn-auto-run` / `.btn-lancer-gris` | `#2a6aaa` | `#fff` | `clamp(14px, 1.4vw, 18px)` | `12px 6px` | Lancer simulation (bleu, grand) |
| `.btn-play` | `#2a8a50` | `#fff` | `clamp(14px, 1.4vw, 18px)` | `10–12px 6px` | Play animation |
| `.btn-pause` | `#c08020` | `#fff` | `clamp(14px, 1.4vw, 18px)` | `10–12px 6px` | Pause animation |
| `.btn-ajouter` | `#d0e8d8` | `#1a4a2a` | `clamp(13px, 1.3vw, 16px)` | `9px 6px` | Ajouter une série |
| `.btn-toggle-one` | `#ece8e0` | `#5a6a78` | `clamp(12px, 1.2vw, 15px)` | `7–9px 6px` | Bascule option (actif : fond orangé `#fde8c8`, texte `#7a3a10`, bordure `#d0a060`) |
| `.btn-test-mode` | `#4a2a8a` | `#fff` | `15px` | `10px 6px` | Mode test (violet) |
| Désactivé (`:disabled`) | `#a0b8c8` | — | — | — | `cursor: not-allowed` |

### Paramètres (`.param-row`)

- `display: flex; flex-direction: column; gap: 3px; margin-bottom: 6px`
- `label` : `font-size: clamp(12px, 1.15vw, 15px)`, `color: #2c3e50` ; valeur actuelle en `span` : `color: #2a5080; font-weight: 600`
- `input[type=range]` : `width: 100%; accent-color: #4a7aaa`
- `input[type=number/text]` : `width: 100%; padding: 5px 8px; font-size: clamp(13px, 1.3vw, 16px); border: 1px solid #c8c0b4; border-radius: 4px`
- `.input-hint` : `font-size: clamp(10px, 0.9vw, 13px); color: #7a8a96`

### Afficheurs valeur (`.readout`)

- Fond blanc, bordure `#c8c0b4`, `border-radius: 6px`, `padding: 7px 9px`
- `.ro-label` : `font-size: clamp(11px, 1vw, 13px); color: #7a8a96`
- `.ro-value` : `font-size: clamp(15px, 1.6vw, 20px); font-weight: 700; color: #2a5080; font-variant-numeric: tabular-nums`

### Hint bas de panneau (`.panel-hint`)

- Hors scroll, collé en bas de `#panel`
- `.panel-hint-body` : `font-size: clamp(12px, 1.15vw, 15px); color: #5a6a78; background: #fff; border: 1.5px solid #b0a898`
- `.panel-hint-title` : `11px`, uppercase, `letter-spacing: 1px`, et **doit pouvoir rétrécir** : `min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 6px` (sinon le bouton ▲ déborde du panneau sur petite fenêtre)
- **Si `#panel` a sa propre `border-left`** (cas de `dissolution/`, `champ_uniforme/`, `ondes/`, `pression/` — `#panel-body`, lui, n'a pas de bordure) : mettre `border-left: none` sur `.panel-hint`. Sinon les deux bordures gauches (celle de `#panel` et celle de `.panel-hint`) se superposent sur une largeur fractionnaire (`clamp()`), et l'arrondi sous-pixel du navigateur les désaligne d'~1px — visible uniquement sur `.panel-hint` car c'est le seul élément à porter sa propre bordure à cet endroit.

---

## 6. Options graphiques avancées (ondes, champ_uniforme & radioactivité)

Les pages `ondes/`, `champ_uniforme/` et `radioactivite/` implémentent un ensemble d'outils interactifs sur les graphes tracés sur `<canvas>`. Ces fonctionnalités constituent la **référence** pour toute nouvelle page comportant un graphe.

### Zoom par sélection rectangulaire

- **Activation** : bouton `🔍` (overlay en haut à droite du canvas), `font-size: 16px`, hauteur `30px`.
- **Comportement** : clic-glissé sur le canvas dessine un rectangle de sélection (contour `#2a6aaa`, fond semi-transparent). Au relâchement, la vue est recadrée sur la zone sélectionnée.
- **État actif** : le bouton passe en `background: #2a6aaa; color: #fff` (classe `.active`).
- **Mode exclusif** avec le réticule et la tangente : activer l'un désactive les autres.
- La vue courante est sauvegardée dans `state.viewHistory` avant chaque zoom.

### Bouton "Adapter" (autoscale)

- Bouton `🔍 Adapter` dans l'overlay graphe.
- Recalcule automatiquement les bornes d'axes pour englober toutes les données visibles.
- Préserve une marge de 5–10 % autour des données.
- `font-size: 13px`, même style que les autres boutons overlay.

### Vue précédente

- Bouton `←` dans l'overlay, désactivé (`opacity: 0.35; cursor: not-allowed`) s'il n'y a pas d'historique.
- Dépile `state.viewHistory` et restaure la vue précédente (utile après un zoom pour "reculer").

### Pan (déplacement) de la vue

- Hors mode zoom, **clic-glissé** sur le canvas déplace la vue (pan).
- Le curseur passe en `grab` / `grabbing`.
- L'état du pan (`dragging`, `startX/Y`, `startView`) est stocké dans un objet dédié (`autoPan` / `continupan`).

### Réticule libre

- **Activation** : bouton `+` (icône réticule, `font-size: 20px`) dans l'overlay.
- Affiche deux lignes croisées (horizontale + verticale) suivant le curseur sur le canvas.
- Une **bulle flottante** (`#reticule-tooltip`) affiche les coordonnées `(x, y)` en temps réel :
  - `font-size: 13px; font-family: monospace; background: #2c3e50; color: #fff; border-radius: 5px; padding: 5px 10px`
  - Position décalée pour rester dans le canvas.
- État actif : bouton en `background: #2a6aaa; color: #fff`.

### Tangente

- **Activation** : bouton `Tangente` dans l'overlay.
- En mode actif, un clic sur la courbe fige une tangente au point cliqué :
  - Calcul de la pente locale par interpolation des points voisins.
  - Tracé d'une droite de couleur contrastée.
  - **Étiquette figée** (`.tangente-label`) avec pente et ordonnée à l'origine, `font-size: 12px; font-family: monospace`, fond `rgba(44,62,80,0.85)`.
  - Bouton `×` dans l'étiquette pour supprimer la tangente individuelle.
- Plusieurs tangentes peuvent coexister (`state.tangentesFig[]`).
- Zones de détection des croix de fermeture stockées dans `tangenteCrossZones[]`.

### Splitter draggable (séparation simulation / graphe)

- Barre de `6px` entre la zone simulation (haut) et la zone graphes (bas), `cursor: row-resize`.
- Fond `#c8c0b4`, passe en `#2a6aaa` au survol et pendant le drag.
- Redimensionnement piloté par `pointermove` (pas `mousemove`), mis à jour via `requestAnimationFrame`.
- Permet à l'élève d'agrandir la zone qui l'intéresse selon la taille de son écran.

### Overlay "agrandir" le récipient (radioactivité — mode continu)

- Bouton `⛶` (position absolute, coin haut-droite du récipient) ouvre un **overlay pleine largeur gauche** (`#recipient-overlay`), masquant temporairement le graphe.
- L'overlay affiche le canvas des noyaux en grand avec les compteurs en grande police (`font-size: 64px` pour le temps, `56px` pour les stats).
- Bouton `✕ Réduire` pour fermer l'overlay.
- Utile en projection : l'enseignant peut zoomer sur l'échantillon pendant l'animation.

---

## 7. Conventions de développement

### Architecture des fichiers

Chaque simulation est désormais organisée en **dossier autonome** avec une arborescence classique :

```
nom-simulation/
├── index.html       ← structure HTML uniquement
├── ARCHITECTURE.md  ← documentation de l'architecture
├── css/
│   └── style.css    ← tout le CSS
└── js/
    ├── sim.js       ← état global + utilitaires physiques (chargé en premier)
    ├── circuit.js   ← rendu canvas principal + interactions
    ├── graph.js     ← graphes interactifs (zoom/pan/réticule)
    └── ui.js        ← contrôles UI + boucle d'animation (chargé en dernier)
```

> **Référence d'architecture** : les dossiers `ondes/` et `champ_uniforme/` sont la référence pour toute nouvelle simulation (patterns les plus à jour : deep-linking par `#hash`, graphes interactifs, splitters). Consulter `ondes/ARCHITECTURE.md` avant de créer une nouvelle page.

Les anciennes simulations en fichier unique (`reaction.html`) conservent leur format d'origine. Toute **nouvelle** simulation adopte l'arborescence ci-dessus.

> **Simulations déjà migrées en arborescence** : `lentille/`, `lunette/`, `radioactivite/`, `reaction/`, `titrage/`, `condensateur/`, `pression/`, `champ_uniforme/`, `ondes/`, `dissolution/`, `diffraction/`.

### Règles générales

- **Ordre de chargement JS** : `sim.js` → fichiers métier → `ui.js`. Tous les fichiers utilisent le scope global (pas de modules ES) — l'ordre est donc critique.
- Zéro dépendance externe (CDN toléré si vraiment nécessaire).
- **`requestAnimationFrame`** pour la boucle d'animation (~60 fps).
- Objet **`sim`** (ou `state`) central pour tout l'état de la simulation.
- **Redimensionnement** : fonction `resize()` appelée sur l'événement `resize` avec anti-rebond `requestAnimationFrame`.
- **Canvas et écrans haute densité (`devicePixelRatio`)** : dans toute fonction `resize()` qui pose `canvas.width`/`canvas.height`, multiplier ces deux valeurs par `window.devicePixelRatio || 1` (`canvas.width = Math.round(cssW * dpr)`) puis réappliquer `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` juste après — sinon le rendu est flou sur écran Retina/haute densité. Attention : l'attribut `canvas.width/height` devient alors des pixels **physiques**, donc toute lecture ailleurs dans le code qui l'utilisait comme taille logique (axes de graphe, conversion de coordonnées souris, `getAxDims(canvas.width, ...)`, etc.) doit être remplacée par `canvas.clientWidth`/`canvas.clientHeight` (toujours en pixels CSS, insensibles au dpr). Cas particulier : si le rendu manipule des pixels bruts (`createImageData`/`putImageData`, cf. `ondes/js/vagues.js`), cette API ignore `ctx.setTransform` et travaille toujours en pixels physiques — il faut alors dimensionner le buffer sur `canvas.width/height` (physique) tout en reconvertissant les coordonnées de la boucle en pixels CSS (`/ dpr`) pour les calculs physiques, et garder l'overlay vectoriel (source, balises, axes) en pixels CSS.
- Code entièrement **commenté en français** avec bandeaux de section `══════`.
- **Responsivité** : utiliser `clamp()` pour toutes les tailles qui doivent s'adapter, ne jamais fixer une dimension critique en `px` sans prévoir une valeur fluide. Hauteur de page : pattern `100vh` + repli `100dvh` (cf. §3).
- **Favicon commun** : toute page HTML inclut dans le `<head>` le favicon ⚛️ inline (aucun fichier externe) :
  ```html
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>⚛️</text></svg>">
  ```
- **Signature obligatoire** : tout fichier créé ou modifié doit porter la signature de l'auteur (voir ci-dessous).

### Signature des fichiers

Tout nouveau fichier **HTML**, **CSS** et **JS** doit inclure une signature d'auteur dès sa création.

**HTML** — commentaire juste après `<!DOCTYPE html>` + balises `<meta>` dans le `<head>` :

```html
<!DOCTYPE html>
<!-- ════════════════════════════════════════════════════
     Simulation pédagogique — Physique-Chimie Lycée
     Auteur  : Mathieu Berdous
     Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
════════════════════════════════════════════════════ -->
<html lang="fr">
<head>
  ...
  <meta name="author" content="Mathieu Berdous">
  <meta name="copyright" content="Mathieu Berdous — CC BY-NC 4.0">
  ...
</head>
```

**CSS** — bloc en tout début de fichier :

```css
/* ══════════════════════════════════════════════════
   Simulation pédagogique — Physique-Chimie Lycée
   Auteur  : Mathieu Berdous
   Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
══════════════════════════════════════════════════ */
```

**JS** — bloc en tout début de fichier (après `'use strict';` s'il est présent) :

```js
// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════
```

### Référencement (SEO)

Toute page **HTML autonome** destinée à être publiée (page d'accueil et chaque `index.html` de simulation) doit inclure, en plus du `<title>` :

- **Une `<meta name="description">`** dans le `<head>`, juste après `<meta name="copyright">` : une phrase courte et spécifique au contenu réel de la page (sujet + niveau), pas une reformulation générique du titre.
  ```html
  <meta name="description" content="Simulation interactive (Terminale) : ...">
  ```
- **Un `<h1>` juste après `<body>`**, reprenant le sujet de la page en une phrase. Comme les pages de simulation n'ont pas de `<header>` visible (cf. §3), ce `<h1>` est **masqué visuellement** via la classe `.sr-only` (reste lisible par les moteurs de recherche et les lecteurs d'écran, sans impact sur le layout) :
  ```html
  <body>
  <h1 class="sr-only">Simulation de ... — sujet complet de la page</h1>

  <main>
  ```
  La classe `.sr-only` doit être présente dans le `css/style.css` de la page (juste après la règle de reset) :
  ```css
  .sr-only {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0,0,0,0);
    white-space: nowrap;
    border: 0;
  }
  ```

### Suivi d'audience (GoatCounter)

Toute page **HTML autonome** destinée à être publiée (page d'accueil `index.html` et chaque `index.html` de simulation) doit intégrer le script de tracking **GoatCounter**, juste avant la fermeture de `</body>` (après tous les `<script>` métier) :

```html
<script data-goatcounter="https://berdous-pc.goatcounter.com/count"
        async src="https://gc.zgo.at/count.js"></script>
</body>
</html>
```

- Ne pas modifier l'URL (`berdous-pc.goatcounter.com`) ni ajouter d'attributs supplémentaires.
- Doit être présent sur **toute nouvelle page créée**, en plus des pages existantes qui l'ont déjà (voir section 8).

---

## 8. Simulations réalisées

| Dossier / Fichier | Sujet | Niveau | Format | Particularités |
|---|---|---|---|---|
| `condensateur/` | Circuit RC — charge/décharge condensateur plan | Terminale | **Arborescence** | Splitter draggable, zoom/pan/réticule sur graphes, animation courant et électrons |
| `lentille/` | Lentille mince convergente/divergente — construction géométrique | Seconde/Première | **Arborescence** | `sim.js` + `draw.js` + `ui.js` ; drag objet/lentille/écran, mode infini avec animation, multi-points, tableau conjugaison, cadres viewfinder avec `drawGlowLetter` |
| `lunette/` | Lunette astronomique — deux lentilles, mode afocal | Terminale | **Arborescence** | `sim.js` + `draw.js` + `ui.js` ; drag/pan/zoom molette, animation propagation, réglage oculaire interactif |
| `radioactivite/` | Décroissance radioactive — modèle des dés | Terminale | **Arborescence** | `sim.js` + `draw.js` + `ui.js` ; Mode Discret (Libre + Auto) et Mode Continu, zoom/pan/réticule/tangente/autoscale sur graphes, splitter draggable, overlay récipient agrandi, multi-séries avec légende |
| `reaction/` | Réactions chimiques — stœchiométrie & réactif limitant | Seconde/Première | **Arborescence** | Mode Équilibrage + Mode Réactif limitant, modèles moléculaires 2D animés, mode test avec score, découpée en `css/style.css` + `js/data.js` + `js/sim.js` + `js/ui.js` + `index.html` |
| `titrage/` | Titrage colorimétrique, pH-métrique, conductimétrique | Première/Terminale | **Arborescence** | Voir `titrage/ARCHITECTURE.md` |
| `pression/` | Pression d'un gaz parfait — modèle cinétique | Terminale | **Arborescence** | Piston animé, collisions élastiques 2D, PV=nRT, chocs/s sur 4 parois |
| `champ_uniforme/` | Mécanique : vecteurs cinématiques — champ de pesanteur & champ électrique uniforme | Terminale | **Arborescence** | Référence d'architecture ; `sim.js` + `draw.js` + `ui.js` ; onglets Champ de pesanteur / Champ électrique, repères Orthonormé/Adapté, modes vue (Oxy, projections x/y), vecteurs vitesse/accélération, mode perpendiculaire (champ E), graphes d'énergie, deep-linking via `#champ-pesanteur` / `#champ-electrique` |
| `ondes/` | Propagation d'ondes — corde, onde sonore (tube), ondes de surface | Première/Terminale | **Arborescence** | Référence d'architecture ; `sim.js` + `tube.js` + `graph.js` + `ui.js` ; onglets Corde/Son/Vagues, sélection de particules par proximité (Ctrl/Maj+clic), mode pression colorée, graphes ΔP(x)/ΔP(t) avec zoom/pan/tangente, deep-linking via `#corde` / `#son` / `#vagues` — voir `ondes/ARCHITECTURE.md` |
| `dissolution/` | Solutions aqueuses — mécanisme de dissolution (NaCl) & quantités de matière | Première | **Arborescence** | Onglets Mécanisme/Dissolution ; animation microscopique scriptée (coupelle, verre, zoom), plein écran type lecteur vidéo, tableau d'avancement ; deep-linking via `#mecanisme` / `#dissolution`. Onglet Dissolution : mouvement brownien + répulsion locale entre espèces dissoutes, légende overlay HTML, libellés coupelle/verre dynamiques selon le soluté |
| `diffraction/` | Diffraction de la lumière — modélisation 3D par une ouverture (fente/carré/cercle/fil) | Terminale | **Arborescence** | `sim.js` + `scene.js` (rendu 3D Three.js) + `graph.js` + `ui.js` ; onglets Ondes de surface / Ondes lumineuses, calcul de la figure de diffraction via FFT, enveloppe 3D du faisceau, mode lumière blanche avec décomposition spectrale, formes d'ouverture multiples, mesures d/D/L, graphe I(x) lié à la vue Écran, deep-linking via `#lumineuses` — voir `diffraction/ARCHITECTURE.md` et `diffraction/PISTES_EVOLUTION.md` |

---

## 9. Page d'accueil (`index.html`)

Le fichier `site/index.html` est la **page d'accueil** du site. C'est un fichier HTML autonome (pas de dépendances externes).

### Structure

- **Layout** : `flex-column` sur `body` (`min-height: 100vh`, repli `min-height: 100dvh`) — scroll autorisé (contrairement aux simulations).
- **Deux zones** côte à côte : panel de filtres à gauche (`<aside>`) + grille de cartes à droite (`<main>`).
- **Footer fixe en bas** de page (Mathieu Berdous · CC BY-NC 4.0).

### Cartes (`<a class="card">`)

Chaque simulation est représentée par une ou plusieurs cartes. Les simulations avec plusieurs onglets principaux ont **une carte par onglet**.

Structure d'une carte :
```
.card                         ← <a> cliquable, fond coloré selon discipline
  .card-meta                  ← ligne du haut
    .card-theme               ← thème en majuscules (ex: "Électricité")
    .card-level               ← badge(s) de niveau (Seconde / Première / Terminale)
  .card-title                 ← titre de la carte (ex: "Circuit RC")
  .card-preview               ← image de prévisualisation (screenshot 800 px de large max recommandé)
    img                       ← src dans assets/previews/<nom>.jpg, avec width/height et loading="lazy"
  .card-desc                  ← description courte
```

**Couleurs par discipline :**
- Physique : fond `#fdf4ee` (terracotta), `card-theme` `#b04020`
- Chimie : fond `#f2f7fd` (bleu), `card-theme` `#2a6aaa`

**Attributs `data-*`** sur chaque `.card` pour le filtrage JS :
- `data-discipline` : `"physique"` ou `"chimie"`
- `data-theme` : `"electricite"` | `"optique"` | `"radioactivite"` | `"reaction"` | `"titrage"` | `"dissolution"` | `"thermodynamique"` | `"ondes"` | `"mecanique"`
- `data-levels` : niveaux séparés par espace, ex: `"seconde premiere"`

### Panel de filtres

Trois groupes de checkboxes (toutes cochées par défaut) :
- **Niveau** : Seconde, Première, Terminale
- **Discipline** : Physique, Chimie
- **Thème** : Électricité, Optique, Radioactivité, Réaction chimique, Titrage, Solutions aqueuses (`data-value="dissolution"`), Thermodynamique, Ondes, Mécanique

Logique : **OU au sein d'une catégorie**, **ET entre catégories**.

Bouton "Réinitialiser" remet toutes les cases à coché.

### Images de prévisualisation

Stockées dans `assets/previews/` au format **`.jpg`** (converties depuis les screenshots PNG d'origine — redimensionnées à 800 px de large max, qualité JPEG ~82) :

| Fichier | Carte |
|---|---|
| `condensateur.jpg` | Circuit RC |
| `lentille.jpg` | Lentille mince |
| `lunette.jpg` | Lunette astronomique |
| `radioactivite-continu.jpg` | Décroissance radioactive |
| `radioactivite-discret.jpg` | Lancers de dés |
| `reaction-equilibrage.jpg` | Équilibrage |
| `reaction-limitant.jpg` | Réactif limitant |
| `titrage-principe.jpg` | Principe du titrage |
| `titrage-titrage.jpg` | Titrage |
| `pression.jpg` | Pression d'un gaz |
| `mecanique_pesanteur.jpg` | Champ de pesanteur |
| `champ_electrique.jpg` | Champ électrique |
| `onde_corde.jpg` | Onde dans une corde |
| `onde_sonore.jpg` | Propagation d'une onde sonore |
| `onde_vagues.jpg` | Ondes de surface |
| `mecanisme_dissolution.jpg` | Mécanisme de dissolution |
| `dissolution-dissolution.jpg` | Dissolution |
| `diffraction-lumiere.jpg` | Diffraction de la lumière |

**Optimisation poids/performance (juillet 2026)** : les screenshots d'origine (PNG plein format, jusqu'à 2273×1268 px et 300+ Ko chacun) alourdissaient inutilement le chargement de la page d'accueil et pénalisaient les Core Web Vitals (LCP, CLS), donc le référencement. Conversion en `.jpg` redimensionné (800 px de large max, qualité ~82) : dossier `assets/previews/` passé de ~1,4 Mo à ~630 Ko. Toute **nouvelle** image de preview doit suivre ce format (JPEG, 800 px de large max) plutôt que déposer un screenshot PNG brut.

Sur chaque `<img>` de preview dans `index.html` :
- `width` et `height` (dimensions réelles du fichier) pour éviter le layout shift (CLS) au chargement.
- `loading="lazy"` pour ne charger l'image qu'à l'approche du scroll (aucune preview n'est au-dessus de la ligne de flottaison sur cette page).

### Deep linking (`?tab=` ou `#hash`)

Les simulations avec plusieurs onglets lisent un paramètre au chargement pour ouvrir directement le bon onglet. Deux conventions coexistent : les pages les plus anciennes utilisent le paramètre de requête `?tab=`, les plus récentes (`champ_uniforme`, `ondes`, `dissolution`) utilisent le fragment d'URL `#hash` (lu via `window.location.hash`). Implémenté dans :

| Fichier | Paramètre | Valeurs |
|---|---|---|
| `radioactivite/js/ui.js` | `?tab=` | `discret` · `continu` |
| `reaction/js/ui.js` | `?tab=` | `equilibrage` · `limitant` |
| `titrage/js/ui.js` | `?tab=` | `principe` · `titrage` |
| `champ_uniforme/js/ui.js` | `#hash` | `champ-pesanteur` · `champ-electrique` |
| `ondes/js/ui.js` | `#hash` | `corde` · `son` · `vagues` |
| `dissolution/js/ui.js` | `#hash` (repli `?tab=`) | `mecanisme` · `dissolution` |
| `diffraction/js/ui.js` | `#hash` | `surfaces` · `lumineuses` |

Toute **nouvelle** page à onglets utilise la convention `#hash`.

Chaque fonction de bascule d'onglet (`setOnglet`/`setMainTab`/`setModePrincipal`) met aussi à jour l'URL via `history.replaceState(null, '', ...)` dès qu'on change d'onglet — pas seulement à la lecture initiale. Sans ça, un reload après un changement de tab ramènerait l'utilisateur à l'onglet d'entrée (celui de la card d'accueil) au lieu de rester sur l'onglet affiché. `replaceState` est utilisé plutôt que `pushState`/`location.hash=` pour ne pas empiler d'entrées d'historique ni provoquer de saut de scroll. Toute **nouvelle** fonction de bascule d'onglet doit faire de même.

### Ajouter une nouvelle simulation

1. Créer la(les) carte(s) dans `index.html` avec les bons attributs `data-*`
2. Ajouter le screenshot dans `assets/previews/<nom>.jpg` (redimensionné à 800 px de large max, qualité JPEG ~82 — pas de PNG plein format), et sur la balise `<img>` : `width`/`height` réels + `loading="lazy"`
3. Si la simulation a des onglets : ajouter le deep linking dans son `ui.js`
4. Mettre à jour le panel de filtres si un nouveau thème ou niveau apparaît
5. Ajouter la `<meta name="description">`, le `<h1 class="sr-only">` et la règle CSS `.sr-only` (voir §7 « Référencement (SEO) »)

---

## 10. Environnement

| Élément | Valeur |
|---|---|
| OS | Windows 11 |
| Dossier de travail | `C:\Users\mathi\Desktop\projet-site\` |
| Python | `C:\Users\mathi\anaconda3\python.exe` |
| IDE Python | Spyder |
| Navigateurs | Chrome, Firefox |
