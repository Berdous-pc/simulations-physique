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

- **Pas de `<header>`** : aucune page ne comporte de balise `<header>`. Le `<body>` contient directement le `<main>`, qui occupe 100 % de la hauteur disponible.
- **`height: 100vh` + `overflow: hidden` sur `body`** : l'interface tient dans la fenêtre sans scroll de page.
- **Grille CSS fluide** : `grid-template-columns: 1fr clamp(200px, 280–300px, 22vw)` — le panneau droit se rétrécit sur petite fenêtre.
- **`clamp()` systématique** pour les tailles de police, paddings et dimensions : garantit un minimum lisible sur petit écran et un maximum raisonnable sur grand écran.
  - Exemple panneau : `font-size: clamp(11px, 1.1vw, 14px)`
  - Exemple formules chimiques (`reaction.html`) : `font-size: clamp(28px, 4vw, 52px)`
- **Canvas redimensionné dynamiquement** via `resizeCanvases()` appelé à chaque `resize` (avec anti-rebond `requestAnimationFrame`), pour que la zone de simulation occupe toujours tout l'espace disponible.
- **Splitter draggable** (condensateur, radioactivité) : l'élève peut ajuster la proportion simulation / graphe selon la taille de son écran.
- **Panneau droit scrollable** (`overflow-y: auto`) quand le contenu est plus long que la fenêtre (petits écrans).
- **Textes des zones de simulation** (canvas) dessinés proportionnellement à la taille du canvas, pas en px fixes.

---

## 4. Charte graphique

### Couleurs

| Rôle | Valeur |
|---|---|
| Fond simulation | `#fdf8f0` (ivoire chaud) |
| Fond page / panneau | `#e8e4de` |
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
| Corps UI | `'Segoe UI', Arial, sans-serif` | `clamp(11px, 1.1vw, 14px)` dans le panneau |
| Labels composants (circuit, canvas) | `bold monospace` | `28–36px` (calculé en JS selon taille canvas) |
| Valeurs instantanées | `bold tabular-nums` | `14–20px` |
| Labels / graduations graphes | `monospace` | `12–13px` |
| Titres de section panneau | `uppercase, letter-spacing: 1px` | `11px` (ou `0.78em` relatif) |
| Polices graphe (axes, valeurs) | — | ×2 par rapport à base canvas |
| Légende séries | — | ×1,5 par rapport à base canvas |
| Formules chimiques (`reaction.html`) | idem | `clamp(28px, 4vw, 52px)` |

### Layout

- **Grille principale** : `grid-template-columns: 1fr clamp(200px, 280–300px, 22vw)`
  - Colonne gauche : simulation + graphes (flex column avec splitter draggable si applicable)
  - Colonne droite : panneau de contrôle, scrollable, hauteur 100 %
- `overflow: hidden` sur `body` et `main` — pas de scroll page, conçu pour `100vh`
- **Pas de `<header>`** — le `<main>` occupe toute la hauteur du `body`
- Sur très petit écran, la zone simulation peut autoriser `overflow-y: auto` localement (cf. `reaction.html`)

---

## 5. Panneau de contrôle — charte (référence : radioactivité & reaction)

Les deux dernières pages conçues (`radioactivite.html` et `reaction.html`) font référence pour le panneau droit.

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
| `font-size` | `14–15px`, `font-weight: 700` |
| `padding` | `9px 4px` |
| Fond inactif | `#d4d0c8`, couleur `#8a9aaa` |
| Fond actif | `#e8e4de`, couleur `#2a6aaa` |
| Bordure active | `1.5px solid #b0a898`, bord bas fusionné avec `#panel-body` |

### Sous-onglets (`.mode-tab`)

| Propriété | Valeur |
|---|---|
| `font-size` | `15px`, `font-weight: 700` |
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
| `.btn-raz` | `#dedad2` | `#5a6a78` | `15px` | `9px 6px` | Remise à zéro |
| `.btn-primary` | `#2a6aaa` | `#fff` | `16px` | `11px 6px` | Action principale (bleu) |
| `.btn-green` | `#2a8a50` | `#fff` | `16px` | `11px 6px` | Action positive (vert) |
| `.btn-auto-run` / `.btn-lancer-gris` | `#2a6aaa` | `#fff` | `18px` | `12px 6px` | Lancer simulation (bleu, grand) |
| `.btn-play` | `#2a8a50` | `#fff` | `18px` | `12px 6px` | Play animation |
| `.btn-pause` | `#c08020` | `#fff` | `18px` | `12px 6px` | Pause animation |
| `.btn-ajouter` | `#d0e8d8` | `#1a4a2a` | `16px` | `9px 6px` | Ajouter une série |
| `.btn-toggle-one` | `#ece8e0` | `#5a6a78` | `13–15px` | `7–9px 6px` | Bascule option (actif : fond orangé `#fde8c8`) |
| `.btn-test-mode` | `#4a2a8a` | `#fff` | `15px` | `10px 6px` | Mode test (violet) |
| Désactivé (`:disabled`) | `#a0b8c8` | — | — | — | `cursor: not-allowed` |

### Paramètres (`.param-row`)

- `display: flex; flex-direction: column; gap: 3px; margin-bottom: 6px`
- `label` : `font-size: 15px`, `color: #2c3e50` ; valeur actuelle en `span` : `color: #2a5080; font-weight: 600`
- `input[type=range]` : `width: 100%; accent-color: #4a7aaa`
- `input[type=number/text]` : `width: 100%; padding: 5px 8px; font-size: 16px; border: 1px solid #c8c0b4; border-radius: 4px`
- `.input-hint` : `font-size: 14px; color: #7a8a96`

### Afficheurs valeur (`.readout`)

- Fond blanc, bordure `#c8c0b4`, `border-radius: 6px`, `padding: 7px 9px`
- `.ro-label` : `font-size: 14px; color: #7a8a96`
- `.ro-value` : `font-size: 20px; font-weight: 700; color: #2a5080; font-variant-numeric: tabular-nums`

### Hint bas de panneau (`.panel-hint`)

- Hors scroll, collé en bas de `#panel`
- `font-size: 14–16px; color: #5a6a78; background: #fff; border: 1.5px solid #b0a898; padding: 8px 10px`

---

## 6. Options graphiques avancées (condensateur & radioactivité)

Les pages `condensateur.html` et `radioactivite.html` implémentent un ensemble d'outils interactifs sur les graphes tracés sur `<canvas>`. Ces fonctionnalités constituent la **référence** pour toute nouvelle page comportant un graphe.

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

> **Référence d'architecture** : le dossier `condensateur/` est la référence pour toute nouvelle simulation. Consulter son `ARCHITECTURE.md` avant de créer une nouvelle page.

Les anciennes simulations en fichier unique (`reaction.html`) conservent leur format d'origine. Toute **nouvelle** simulation adopte l'arborescence ci-dessus.

> **Simulations déjà migrées en arborescence** : `lentille/`, `lunette/`, `radioactivite/`, `reaction/`, `titrage/`, `condensateur/`, `pression/`.

### Règles générales

- **Ordre de chargement JS** : `sim.js` → fichiers métier → `ui.js`. Tous les fichiers utilisent le scope global (pas de modules ES) — l'ordre est donc critique.
- Zéro dépendance externe (CDN toléré si vraiment nécessaire).
- **`requestAnimationFrame`** pour la boucle d'animation (~60 fps).
- Objet **`sim`** (ou `state`) central pour tout l'état de la simulation.
- **Redimensionnement** : fonction `resize()` appelée sur l'événement `resize` avec anti-rebond `requestAnimationFrame`.
- Code entièrement **commenté en français** avec bandeaux de section `══════`.
- **Responsivité** : utiliser `clamp()` pour toutes les tailles qui doivent s'adapter, ne jamais fixer une dimension critique en `px` sans prévoir une valeur fluide.
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

---

## 8. Simulations réalisées

| Dossier / Fichier | Sujet | Niveau | Format | Particularités |
|---|---|---|---|---|
| `condensateur/` | Circuit RC — charge/décharge condensateur plan | Terminale | **Arborescence** | Référence d'architecture ; splitter draggable, zoom/pan/réticule sur graphes, animation courant et électrons |
| `lentille/` | Lentille mince convergente/divergente — construction géométrique | Seconde/Première | **Arborescence** | `sim.js` + `draw.js` + `ui.js` ; drag objet/lentille/écran, mode infini avec animation, multi-points, tableau conjugaison, cadres viewfinder avec `drawGlowLetter` |
| `lunette/` | Lunette astronomique — deux lentilles, mode afocal | Terminale | **Arborescence** | `sim.js` + `draw.js` + `ui.js` ; drag/pan/zoom molette, animation propagation, réglage oculaire interactif |
| `radioactivite/` | Décroissance radioactive — modèle des dés | Terminale | **Arborescence** | `sim.js` + `draw.js` + `ui.js` ; Mode Discret (Libre + Auto) et Mode Continu, zoom/pan/réticule/tangente/autoscale sur graphes, splitter draggable, overlay récipient agrandi, multi-séries avec légende |
| `reaction.html` | Réactions chimiques — stœchiométrie & réactif limitant | Seconde/Première | Fichier unique | Mode Équilibrage + Mode Réactif limitant, modèles moléculaires 2D animés, mode test avec score, tous les éléments responsifs via `clamp()` |
| `reaction/` | Idem `reaction.html` — version découpée en arborescence | Seconde/Première | **Arborescence** | Mêmes fonctionnalités, découpée en `css/style.css` + `js/data.js` + `js/sim.js` + `js/ui.js` + `index.html` |
| `titrage/` | Titrage colorimétrique, pH-métrique, conductimétrique | Première/Terminale | **Arborescence** | Voir `titrage/ARCHITECTURE.md` |
| `pression/` | Pression d'un gaz parfait — modèle cinétique | Terminale | **Arborescence** | Piston animé, collisions élastiques 2D, PV=nRT, chocs/s sur 4 parois |

---

## 9. Page d'accueil (`index.html`)

Le fichier `site/index.html` est la **page d'accueil** du site. C'est un fichier HTML autonome (pas de dépendances externes).

### Structure

- **Layout** : `flex-column` sur `body` (`min-height: 100vh`) — scroll autorisé (contrairement aux simulations).
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
  .card-preview               ← image de prévisualisation (screenshot 800×450 px recommandé)
    img                       ← src dans assets/previews/<nom>.png
  .card-desc                  ← description courte
```

**Couleurs par discipline :**
- Physique : fond `#fdf4ee` (terracotta), `card-theme` `#b04020`
- Chimie : fond `#f2f7fd` (bleu), `card-theme` `#2a6aaa`

**Attributs `data-*`** sur chaque `.card` pour le filtrage JS :
- `data-discipline` : `"physique"` ou `"chimie"`
- `data-theme` : `"electricite"` | `"optique"` | `"radioactivite"` | `"reaction"` | `"titrage"`
- `data-levels` : niveaux séparés par espace, ex: `"seconde premiere"`

### Panel de filtres

Trois groupes de checkboxes (toutes cochées par défaut) :
- **Niveau** : Seconde, Première, Terminale
- **Discipline** : Physique, Chimie
- **Thème** : Électricité, Optique, Radioactivité, Réaction chimique, Titrage, Thermodynamique

Logique : **OU au sein d'une catégorie**, **ET entre catégories**.

Bouton "Réinitialiser" remet toutes les cases à coché.

### Images de prévisualisation

Stockées dans `assets/previews/` au format `.png` (800×450 px recommandé) :

| Fichier | Carte |
|---|---|
| `condensateur.png` | Circuit RC |
| `lentille.png` | Lentille mince |
| `lunette.png` | Lunette astronomique |
| `radioactivite-continu.png` | Décroissance radioactive |
| `radioactivite-discret.png` | Lancers de dés |
| `reaction-equilibrage.png` | Équilibrage |
| `reaction-limitant.png` | Réactif limitant |
| `titrage-principe.png` | Principe du titrage |
| `titrage-titrage.png` | Titrage |
| `pression.png` | Pression d'un gaz *(à venir)* |

### Deep linking (`?tab=`)

Les simulations avec plusieurs onglets lisent le paramètre `?tab=` au chargement pour ouvrir directement le bon onglet. Implémenté dans :

| Fichier | Paramètre | Valeurs |
|---|---|---|
| `radioactivite/js/ui.js` | `?tab=` | `discret` · `continu` |
| `reaction/js/ui.js` | `?tab=` | `equilibrage` · `limitant` |
| `titrage/js/ui.js` | `?tab=` | `principe` · `titrage` |

### Ajouter une nouvelle simulation

1. Créer la(les) carte(s) dans `index.html` avec les bons attributs `data-*`
2. Ajouter le screenshot dans `assets/previews/<nom>.png`
3. Si la simulation a des onglets : ajouter le deep linking dans son `ui.js`
4. Mettre à jour le panel de filtres si un nouveau thème ou niveau apparaît

---

## 10. Environnement

| Élément | Valeur |
|---|---|
| OS | Windows 11 |
| Dossier de travail | `C:\Users\mathi\Desktop\projet-site\` |
| Python | `C:\Users\mathi\anaconda3\python.exe` |
| IDE Python | Spyder |
| Navigateurs | Chrome, Firefox |
