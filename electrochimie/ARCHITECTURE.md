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

Choix de l'utilisateur : un **cycle guidé**, toujours le même trajet ; pas de texte qui décrit l'étape ; l'atome formé reste là où l'ion s'est collé. Option E retenue (2026-10-25) : le **dépôt croît sur lui-même** (l'ion peut se réduire contre un grain de Cu, les électrons traversent le métal), à la place de l'ancien choix « jamais d'ion sur le dépôt », qui produisait une couche continue sur toute la lame.

Coordonnées en **cases** (côté d'un atome), carré de 11 × 11 circonscrit à la loupe. Réseau de la lame `loupe.grille[r][c]` : `''` vide, `'M'` atome de la lame, `'O'` atome engagé dans un cycle. À gauche de la grille, la lame continue (métal massif). Le **dépôt est hors grille** : `loupe.depots` garde la position exacte (coordonnées du réseau) de chaque atome déposé ; les ions de fond le contournent (`_sortirDuSolide`).

Un cycle = l'équation de la réaction (coefficients de `stoechiometrie()`), une **zone** de la lame et des **sites** pour les ions (`_choisirZone`). Zone (`_zonesAtomes`) : `nA` atomes de surface d'une courte fenêtre de `nA` à `nA + 2` lignes, plutôt saillants. **Érosion irrégulière mais bornée** : la zone peut puiser jusqu'à `TOL_RUGO` (2) couches sous la couche la plus externe, une de plus seulement si c'est impossible autrement ; les atomes saillants restent favorisés (poids réduit, tirage plus large), d'où de petits creux ; le zinc au contact du dépôt est favorisé (`BONUS_GALVA`, pile locale), ce qui déchausse les grains ; les lignes du bord du cercle ont une légère pénalité. Toutes les lignes (0 à 10) peuvent réagir. **Sites** (`_choisirSites`, `_ajouterSite`) : contre l'atome de surface de chaque ligne de la lame (germe, `MALUS_GERME` dès qu'il existe un dépôt) ou contre un atome du dépôt (`D_SITE_DEPOT`, 7 directions tournées vers la solution, croissance vers l'extérieur un peu favorisée, `MALUS_GROS_AMAS` au-delà de `TAILLE_ILOT_MAX` atomes) ; préférence pour un trajet d'électrons court (`POIDS_SAUTS` × nombre de sauts dans le réseau conducteur depuis la zone). Un site est refusé s'il chevauche la lame ou le dépôt, sort du cercle ou dépasse `U_MAX_DEPOT` (le couloir reste libre), ou si l'ion, arrivant le long de la normale, devrait traverser la lame ; s'il traverse le dépôt (poreux), il est dessiné **derrière** lui (`derriere`). Les sites d'un cycle sont écartés d'au moins `ESPACE_IONS`. Sans réaction, l'ion vient seulement toucher un atome de la zone. **Réseau conducteur** (`_reseauMetal`) : atomes de la lame (cases voisines liées), dépôt accroché (`ANCRAGE`) et soudé (`D_VOISINS`) ; `_parcours` (largeur d'abord), `_trajetElectron`.

Étapes (`cy.phase`, durées `D_…` en temps simulé) :
1. `approche` : ions mis en avant (halo bleu), entrée par le haut à droite, descente le long d'un couloir libre (`U_COULOIR`), arrivée le long de la normale au site ;
2. `contact` : ions et atomes signalés (halo bleu / terracotta, couleurs des demi-équations) ;
3. `transfert` (0,4 s si l'ion touche l'atome, plus long sinon : vitesse `V_ELECTRON`, `cy.dTransfert`) : électrons (visibles sur option) de l'atome qui s'oxyde vers l'ion, en ligne droite dans la lame puis d'atome en atome dans le dépôt ; chaque atome en cède `b`, chaque ion en reçoit `a`, dans l'ordre ; départs échelonnés (file d'électrons sur les trajets longs) ;
4. `transfo` : sur place, ion → atome, atome → ion ;
5. `depart` : l'ion formé glisse **derrière** l'atome formé (dessiné sous le réseau : projection d'un volume) puis part en diagonale vers le bas à droite ; l'atome formé reste à son point de contact (`_deposer`), la place libérée dans la lame reste un creux.

Sans transformation possible : `approche` → `contact` → `rebond` (l'ion repart sans échange).

La lame se couvre ainsi de grumeaux de dépôt qui poussent vers la solution. **Détachement** (`_detacherAmas`, à chaque pas) : les atomes du dépôt soudés entre eux (`D_VOISINS`) forment un amas (`_amas`) ; il tient tant qu'un de ses atomes est à moins d'`ANCRAGE` d'un atome de la lame (`_accroches` ; un atome formé depuis moins de `D_ANCRAGE` compte comme accroché). **Déchaussement** : quand les atomes de la lame qui le retenaient se sont oxydés, il se détache. **Cassure** : un amas d'au moins `TAILLE_ILOT_MAX` atomes qui en a plus de `RAPPORT_POIDS` par accroche (dépôt spongieux, peu adhérent) perd son morceau le plus éloigné de la lame (`_morceauExterne`, `TAILLE_MORCEAU` atomes au plus, une cassure toutes les `D_ENTRE_CASSES` s au plus) ; indispensable pour Cu + 2 Ag⁺, où le dépôt pousse plus vite que la lame n'est rongée. Chute (`_lancerChutes`) : solide rigide en coordonnées de la loupe, bref décollement puis chute visqueuse (vitesse limite `V_LIM_CHUTE`, constante `TAU_CHUTE`), légère dérive oscillante, rotation lente ; il glisse le long de la lame et du dépôt sans les traverser (`_chuteHorsSolide`) et sort par le bas de la loupe. Secours si plus aucune zone n'est disponible : l'amas le moins accroché se détache (`_detacherPlusFaible`). Quand la couche externe est entièrement rongée (aucun cycle n'occupant la grille), le réseau est décalé et glisse en douceur (`_glisser`, `offX`). **Seul le dépôt tombe** : un atome de la lame ne quitte la grille qu'en s'oxydant.

Ordonnancement (`_ordonnancer`) : un seul cycle à la surface ; le suivant démarre dès que le précédent entre en `depart`, d'où au plus deux cycles visibles, légèrement décalés. Lame retirée en plein cycle (`_interrompre`) : un échange commencé est mené à son terme, un ion encore en approche s'efface.

Fond : ions estompés (`ALPHA_FOND`), mouvement brownien lent, hors cycles ; ions spectateurs sur option, en nombre constant. **Leur nombre suit `macro.avancement`** (`_ciblesFond`, `_majPopulation`) : au départ `N_FOND_OX` ions oxydants et aucun ion du métal ; un oxydant consommé s'efface en fondu (le plus proche de la lame d'abord) ; un ion du métal formé par un cycle reste dans la loupe et rejoint le fond (`at.garder`, `_versFond`) tant qu'il en manque, sinon il sort ; complément en fondu si les cycles prennent du retard ou ne tournent pas (lame à peine plongée). `etapeEquation()` : ligne du bloc des équations à surligner (`ox` puis `red` pendant le transfert, `bilan` pendant la transformation).

Vérifié hors navigateur (JScript, 2 min simulées pour Zn/Cu, Cu/Ag, Mg/Al, après le passage à l'option E) : aucun atome du dépôt n'en chevauche un autre ; jamais de blocage faute de zone (secours jamais sollicité) ; chutes de 1 à 7 atomes, 7 à 13 en 2 min ; dépôt de 4 à 10 atomes au plus ; relief moyen de 0,7 à 1,2 case. À ×1 : 10 à 12 cycles par minute.

## ui.js

- `setMainTab()` : sections, bandeaux Informations (un par onglet), bloc des équations, `history.replaceState`.
- `majEquations()` + `_majSurlignage()` (ligne de l'étape en cours surlignée) : couples, demi-équations (signe `=`, avec multiplicateurs), équation de la réaction (`→`), états physiques ; message explicatif si aucune transformation (même couple, ou sens non spontané avec rappel de la transformation inverse).
- Canvas redimensionné via `ResizeObserver` sur `#sim-area` (le bloc des équations change sa hauteur) + `resize` de la fenêtre, avec `devicePixelRatio`.
- Boucle RAF : `dtReel` (lame) et `dtSim = dtReel × vitesse` (transformation, loupe) ; en pause, rendu seulement si `sim.needsRedraw`.
- Raccourcis : Espace = pause, R = RAZ.
