# electrochimie/ — Architecture

Simulation « Oxydoréduction, piles et électrolyse ». Deux onglets principaux, deep-linking par `#hash` :

| Onglet | Hash | État |
|---|---|---|
| Oxydoréduction | `#oxydoreduction` | ✅ première version |
| Pile et électrolyse | `#pile-electrolyse` | ⏳ en préparation (panneau et canvas provisoires) |

## Fichiers

```
electrochimie/
├── index.html               ← structure ; panneau canonique à onglets (CONTEXTE_PROJET.md §5)
├── css/style.css            ← tout le CSS (repris de pression/ + onglets, listes, bloc #equations)
└── js/
    ├── sim.js               ← table METAUX (couples Mⁿ⁺/M), ANIONS, écriture chimique, réactivité, état `sim`
    ├── becher.js            ← scène macroscopique : disposition du canvas, lame déplaçable, solution, dépôt
    ├── loupe.js             ← modèle microscopique : réseau du métal, ions, électrons
    ├── ui.js                ← onglets, panneau, équations, redimensionnement, boucle RAF
    └── sections-repliables.js  ← copie conforme (pression/)
```

Ordre de chargement : `sim.js` → `becher.js` → `loupe.js` → `ui.js` → `sections-repliables.js`.

## sim.js — données chimiques

`METAUX` est **commune aux deux onglets** (l'onglet Pile réutilisera les mêmes couples). Pour chaque métal : potentiel standard `E0` (sert uniquement au sens spontané, non affiché), charge de l'ion, couleurs (atome, ion dans la loupe, solution macroscopique ou `null` si incolore), noms et articles (`de`, `le`, `du`), anion spectateur usuel (nitrate pour Ag⁺ et Pb²⁺, dont les sulfates sont peu solubles ; sulfate sinon), aspect du dépôt (`eponge`, `aiguilles`, `noir`, `gris`).

- `reactionPossible(metal, ion)` : vrai si `E0(ion) > E0(metal)`.
- `stoechiometrie(metal, ion)` : nombre d'électrons échangés = PPCM des charges, coefficients du métal et de l'oxydant.
- `ionTexte` / `ionHTML`, `anionTexte` / `anionHTML` : écriture Unicode (canvas) ou HTML (panneau).
- `texteEchelle()` : écrit dans un repère `ctx.scale()` en repassant en pixels (une police de 0,3 px agrandie par la transformation est mal rendue par certains navigateurs).

## becher.js — scène macroscopique

- **Disposition** (`calculerDisposition`) : paysage → scène à gauche (moitié de la largeur), loupe à droite ; portrait → scène en haut, loupe en bas.
- **Repère logique** 100 × 102 unités, mis à l'échelle (`disp.k`) ; toutes les cotes (bécher, lame, support, point visé par la loupe) sont des constantes en tête de fichier.
- **Lame** : glisser-déposer. Elle ne traverse pas les parois : elle n'entre dans le bécher que par le haut (`lame.dansBecher`), où elle est guidée verticalement à sa place. Relâchée dans le bécher, elle descend ; ailleurs, elle retourne dans son support. Simple clic = bouton Plonger/Retirer. Déplacements automatiques : suite de points (`lame.chemin`) parcourue à vitesse constante, en temps réel (même en pause).
- **Avancement** `macro.avancement` : tend vers 1 (constante de temps `TAU_AVANCEMENT`, au prorata de la partie immergée) puis **se stabilise** (choix de l'utilisateur). Il pilote la couleur de la solution (oxydant qui disparaît, ions du métal qui apparaissent dans le rapport stœchiométrique ; seules les espèces colorées, Cu²⁺ et Fe²⁺, teintent : même suite de teintes que les `colorStops` de Dissolution, parcourue selon la concentration (`couleurSuite`), fondue dans l'eau sous `C_RAMPE`, moyenne pondérée complétée par l'eau neutre `#b8d4f0` comme dans Dissolution ; solution opaque, la partie immergée de la lame est vue à travers un voile `ALPHA_VOILE`), le nombre d'ions de fond de la loupe, l'usure de la partie mouillée et le dépôt (taches et aiguilles tirées une fois par RAZ, générateur reproductible).
- **Bécher** : sans reflet ; liquide modelé (`_dessinerVolume` : parois plus claires, fond un peu plus soutenu) pour éviter l'aplat ; la solution remplit l'intérieur jusqu'aux parois et aux coins arrondis (`_cheminInterieur`), sans vide apparent.
- `basLameDansLoupe()` : position du bas de la lame vue dans la loupe (grossissement fictif : 3 unités de scène = un rayon de loupe), pour que le réseau descende dans la loupe avec la lame.


## loupe.js — modèle microscopique scénarisé

Choix de l'utilisateur : un **cycle guidé**, toujours le même trajet ; pas de texte qui décrit l'étape ; l'ion se **colle contre l'atome** avec lequel il réagit ; jamais d'ion qui vient se poser sur le dépôt ; transfert d'électrons rapide et direct ; l'atome formé reste là où l'ion s'est collé.

Coordonnées en **cases** (côté d'un atome), carré de 11 × 11 circonscrit à la loupe. Réseau de la lame `loupe.grille[r][c]` : `''` vide, `'M'` atome de la lame, `'O'` atome engagé dans un cycle. À gauche de la grille, la lame continue (métal massif). Le **dépôt est hors grille** : `loupe.depots` garde la position exacte (coordonnées du réseau) de chaque atome déposé ; les ions de fond le contournent (`_sortirDuSolide`).

Un cycle = l'équation de la réaction (coefficients de `stoechiometrie()`) et une seule **zone** de la lame (`_choisirZone`) : les `nA` atomes de surface les plus saillants d'une courte fenêtre de `nA` à `nA + 2` lignes. **Érosion couche par couche** : la zone puise d'abord dans la couche la plus externe (`tol = 0`), puis, seulement si c'est impossible, une à trois couches plus bas ; les zones aux atomes les plus saillants passent en premier, les lignes du bord du cercle ont une légère pénalité. Toutes les lignes (0 à 10) peuvent réagir, sinon celles du bord ne seraient jamais rongées et la vue ne pourrait pas suivre la lame. Les `nI` ions se posent côte à côte contre eux (`_placerIons`, écart `ESPACE_IONS`, contact à `R_ATOME + R_ION`) : ex. 2 Ag⁺ de part et d'autre d'un atome Cu. Une zone est refusée si un ion ne touche pas l'un de ses atomes, chevaucherait un autre atome, frôlerait le dépôt ou aurait un atome du dépôt devant lui (il se glisserait dans le creux laissé derrière le dépôt) ; avant de la refuser, on essaie de décaler le groupe d'ions vers le haut ou le bas (`DECALAGES_IONS`).

Étapes (`cy.phase`, durées `D_…` en temps simulé) :
1. `approche` : ions mis en avant (halo bleu), entrée par le haut à droite, descente le long d'un couloir libre (`U_COULOIR`), arrivée horizontale contre la zone ;
2. `contact` : ions et atomes signalés (halo bleu / terracotta, couleurs des demi-équations) ;
3. `transfert` (0,4 s) : électrons (visibles sur option) en ligne droite de chaque atome vers l'ion collé ; chaque atome en cède `b`, chaque ion en reçoit `a`, dans l'ordre ;
4. `transfo` : sur place, ion → atome, atome → ion ;
5. `depart` : l'ion formé glisse **derrière** l'atome formé (dessiné sous le réseau : projection d'un volume) puis part en diagonale vers le bas à droite ; l'atome formé reste à son point de contact (`_deposer`), la place libérée dans la lame reste un creux.

Sans transformation possible : `approche` → `contact` → `rebond` (l'ion repart sans échange).

La surface de la lame se couvre ainsi peu à peu de dépôt, avec des creux derrière lui. Quand plus aucune zone n'est disponible, le dépôt se détache d'un bloc et tombe (`_lancerPlaque`) ; si la lame a reculé d'une colonne sur toute sa hauteur, le réseau est décalé et glisse en douceur (`_glisser`, `offX`). **Seul le dépôt tombe** : un atome de la lame ne quitte la grille qu'en s'oxydant (les anciens retraits — lignes du bord « alignées » et secours `_aplanir` — faisaient disparaître des atomes non consommés ; supprimés).

Ordonnancement (`_ordonnancer`) : un seul cycle à la surface ; le suivant démarre dès que le précédent entre en `depart`, d'où au plus deux cycles visibles, légèrement décalés. Lame retirée en plein cycle (`_interrompre`) : un échange commencé est mené à son terme, un ion encore en approche s'efface.

Fond : ions estompés (`ALPHA_FOND`), mouvement brownien lent, hors cycles ; ions spectateurs sur option, en nombre constant. **Leur nombre suit `macro.avancement`** (`_ciblesFond`, `_majPopulation`) : au départ `N_FOND_OX` ions oxydants et aucun ion du métal ; un oxydant consommé s'efface en fondu (le plus proche de la lame d'abord) ; un ion du métal formé par un cycle reste dans la loupe et rejoint le fond (`at.garder`, `_versFond`) tant qu'il en manque, sinon il sort ; complément en fondu si les cycles prennent du retard ou ne tournent pas (lame à peine plongée). `etapeEquation()` : ligne du bloc des équations à surligner (`ox` puis `red` pendant le transfert, `bilan` pendant la transformation).

Vérifié hors navigateur (JScript, jusqu'à 10 min simulées par couple) : stœchiométrie exacte ; chaque ion touche un atome de sa zone, aucun ne touche le dépôt ni ne chevauche un atome ; aucun atome du dépôt n'en chevauche un autre ; au plus 2 cycles simultanés ; aucun atome engagé orphelin ; aucun atome de la lame disparu sans oxydation ; jamais de blocage faute de zone ; relief de la surface (lignes 2 à 8) de 0,5 à 1 case en moyenne, 2 au plus. À ×1 : 8 à 11 cycles par minute selon le couple.

## ui.js

- `setMainTab()` : sections, bandeaux Informations (un par onglet), bloc des équations, `history.replaceState`.
- `majEquations()` + `_majSurlignage()` (ligne de l'étape en cours surlignée) : couples, demi-équations (signe `=`, avec multiplicateurs), équation de la réaction (`→`), états physiques ; message explicatif si aucune transformation (même couple, ou sens non spontané avec rappel de la transformation inverse).
- Canvas redimensionné via `ResizeObserver` sur `#sim-area` (le bloc des équations change sa hauteur) + `resize` de la fenêtre, avec `devicePixelRatio`.
- Boucle RAF : `dtReel` (lame) et `dtSim = dtReel × vitesse` (transformation, loupe) ; en pause, rendu seulement si `sim.needsRedraw`.
- Raccourcis : Espace = pause, R = RAZ.
