// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  principe.js — Onglet "Principe" : interférences de deux ondes qui se
//  propagent EN SENS INVERSE sur un même axe (mode 1D).
//
//  Mise en situation : deux haut-parleurs S₁ (à gauche) et S₂ (à droite)
//  se font face et émettent chacun un signal sinusoïdal vers l'autre ; un
//  micro M, placé entre les deux, reçoit la somme des deux signaux.
//
//  Physique — célérité c fixe (son dans l'air), ω = 2π·c/λ :
//      y₁(x,t) = A₁·sin(ω·(t − (x−x₁)/c))   pour x ≥ x₁ et t ≥ (x−x₁)/c
//      y₂(x,t) = A₂·sin(ω·(t − (x₂−x)/c))   pour x ≤ x₂ et t ≥ (x₂−x)/c
//  (nul ailleurs : c'est le FRONT d'onde, qui rend la propagation visible
//   au démarrage — cf. _prinY1/_prinY2).
//
//  Là où les deux fronts sont passés, avec d₁ = x−x₁, d₂ = x₂−x et
//  δ = d₂ − d₁, la superposition a pour amplitude
//      A(x) = √(A₁² + A₂² + 2·A₁·A₂·cos(2π·δ/λ))
//  soit une ONDE STATIONNAIRE : nœuds et ventres sont fixes, espacés de
//  λ/2. Comme d₁ + d₂ = x₂ − x₁ est constant, δ(x) = x₁ + x₂ − 2x varie
//  linéairement en x — d'où les positions remarquables analytiques
//  (cf. _prinDrawReperes) :
//      constructif  x = (x₁ + x₂ − k·λ)/2
//      destructif   x = (x₁ + x₂ − (k+½)·λ)/2
//
//  ── Ce que représente y : la SURPRESSION ─────────────────────────────
//  y₁, y₂ et leur somme sont des surpressions acoustiques, pas des
//  déplacements de matière. Ce choix n'est pas cosmétique, il commande tout
//  le mode « Particules » (cf. §GAZ DE PARTICULES, plus bas) :
//
//   • un micro est un capteur de PRESSION : ce que trace la ligne somme est
//     donc littéralement ce que le micro mesure, et « δ = k·λ → constructif »
//     veut alors dire « le micro entend fort » ;
//   • l'excès de densité d'un gaz vaut −∂u/∂x à un facteur près, soit
//     exactement ΔP : pression et densité sont RIGOUREUSEMENT EN PHASE. La
//     courbe tracée est donc aussi la courbe de densité, et en mode « Les
//     deux » un sommet de courbe tombe pile sur un paquet de particules.
//     Avec y = déplacement, la compression se serait située là où la courbe
//     a sa PENTE maximale — courbe et paquets décalés de λ/4 à l'écran ;
//   • les deux membranes sources se déplacent alors EN MIROIR (elles
//     poussent vers l'intérieur ensemble), ce qu'on obtient en branchant
//     deux haut-parleurs identiques sur la même sortie d'ampli.
//
//  Contrepartie à connaître : le champ de DÉPLACEMENT du gaz est en
//  quadrature avec la courbe (cf. _prinU1/_prinU2). Aux ventres de pression
//  les particules sont quasi immobiles et la densité pulse au maximum ; aux
//  nœuds c'est l'inverse — les particules oscillent largement et la densité
//  ne varie pas. C'est correct, c'est même le contenu, mais la légende des
//  repères le dit explicitement (cf. _prinDrawReperesLegende).
//
//  Ralenti : à λ = 0,60 m, T = λ/c ≈ 1,8 ms — inobservable en temps réel.
//  simTime avance de dtRéel / PRIN_RALENTI, ce qui donne une célérité
//  APPARENTE de 0,5 m/s (le front traverse les 4 m de l'axe en 8 s au
//  facteur de vitesse ×1,00).
//
//  Autonome (état `simPrin`), sur le modèle de js/surfaces.js. N'utilise
//  du reste de la page que formatFr() (js/scene.js). Chargé après
//  surfaces.js, avant ui.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Constantes physiques ──────────────────────────────────────────────
var PRIN_C            = 340;   // célérité du son dans l'air (m/s), fixe
var PRIN_VIEW_WIDTH_M = 4.0;   // largeur physique de l'axe (m) — calibre pxPerM au resize
// Facteur de ralenti (cf. bandeau de doc ci-dessus) — doublé (680, au lieu de
// 340) pour diviser par 2 toutes les vitesses d'animation SANS toucher aux
// crans affichés (×0,10/0,25/0,50/1,00 restent les mêmes libellés) : le
// nouveau ×1,00 se déplace comme l'ancien ×0,50, etc.
var PRIN_RALENTI      = 680;
var PRIN_MARGE_M      = 0.10;  // écart minimal imposé entre deux éléments voisins (m)
// Lignes du couloir de cotes sous la bande "somme" : 0 = S₁M, 1 = S₂M.
// Réservées EN PERMANENCE — cf. _prinLayout : la scène ne doit pas bouger
// quand on active « Coter S₁M et S₂M ».
// Il y avait une troisième ligne, en tête, pour une cote λ/2 tracée avec les
// repères d'interférences : elle éloignait les deux cotes utiles du bas de la
// scène pour une information déjà lisible dans l'espacement des marqueurs V/N.
var PRIN_N_COTES      = 2;
var PRIN_BORD_M       = 0;     // marge minimale aux deux extrémités de l'axe (m) — 0 : les sources peuvent aller jusqu'aux bords (x = 0 et x = 4 m)

// Crans du curseur de vitesse d'animation — identiques au reste du site
// (cf. ondes/js/ui.js → SPEED_STEPS, surfaces.js → SURF_SPEED_STEPS).
var PRIN_SPEED_STEPS = [0.10, 0.25, 0.50, 1.00];

// Valeurs par défaut des réglages et des positions
var PRIN_LAMBDA_DEF = 0.60, PRIN_A1_DEF = 0.80, PRIN_A2_DEF = 0.80;
var PRIN_X1_DEF = 0, PRIN_X2_DEF = PRIN_VIEW_WIDTH_M, PRIN_XM_DEF = 2.00;

// ── Couleurs ──────────────────────────────────────────────────────────
// Fond clair (#fdf8f0, "fond simulation" de la charte) : cet onglet trace des
// COURBES et non un champ, contrairement aux deux autres onglets de la page.
var PRIN_COL_BG      = '#fdf8f0';
var PRIN_COL_AXE     = '#b0a898';
// Graduations et valeurs chiffrées : franchement plus foncées que l'axe, sans
// quoi elles se noient dedans et l'axe n'est plus lisible comme une règle.
var PRIN_COL_TICK    = '#8a7f6b';
var PRIN_COL_LABEL   = '#7a8a96';
// S₁ / S₂ : mêmes teintes que les flèches de distance de l'onglet Ondes de
// surface (SURF_COL_DIST_S1/S2), pour qu'une source garde sa couleur d'un
// onglet à l'autre. M en bleu accent de la charte.
var PRIN_COL_S1      = '#e07020';
var PRIN_COL_S2      = '#e0397a';
var PRIN_COL_M       = '#2a6aaa';
var PRIN_COL_SOMME   = '#2c3e50';
var PRIN_COL_ENV     = '#8a9aaa';
// Contreparties "fond clair" de SURF_COL_INTERF_CONSTRUCTIVE (#ffe14d) et
// SURF_COL_INTERF_DESTRUCTIVE (#8a3fd6) : le jaune vif du bassin sombre est
// illisible sur ivoire, on le fonce en ocre en gardant le couple jaune/violet.
var PRIN_COL_CONSTR  = '#b58600';
var PRIN_COL_DESTR   = '#7a3fd6';
// Bandes de tracé : un aplat très légèrement plus clair que le fond, cerné
// d'un filet, pour que les trois lignes se lisent comme trois PANNEAUX et non
// comme un seul aplat ivoire continu. La grille verticale (tous les 0,5 m,
// sur toute la hauteur de la bande) remplace la lecture au tick : on repère
// une abscisse sur les trois lignes d'un seul coup d'œil.
var PRIN_COL_BAND    = '#fffdf8';
var PRIN_COL_BAND_BD = '#e6ddcd';
var PRIN_COL_GRILLE     = '#e7dcc7';   // demi-mètres
var PRIN_COL_GRILLE_MAJ = '#d3c4a6';   // mètres entiers, nettement plus marqués

// ── Couleurs de l'ÉCRAN D'OSCILLOSCOPE des fenêtres de graphes ────────
// Les fenêtres temporelles ne sont pas des graphes de plus posés sur la
// scène : ce sont les ÉCRANS d'un oscilloscope branché sur le micro, et
// c'est délibéré. Les courbes y(M, t) et les courbes y(x, t) du tracé ont
// forcément le même aspect — même sinusoïde, même couleur d'identité — et
// l'élève confond alors représentation spatiale et représentation
// temporelle (la confusion λ ↔ T, classique). On ne casse pas la
// ressemblance des COURBES, qui est justement ce qui rend la superposition
// lisible d'un coup d'œil : on rend impossible la confusion des CADRES. Un
// écran d'appareil ne se lit pas comme la scène — et c'est en plus l'écran
// que l'on branche vraiment sur un micro en TP.
var PRIN_COL_SCOPE_BG       = '#0f1720';   // verre de l'écran
var PRIN_COL_SCOPE_GRID     = '#22323e';
var PRIN_COL_SCOPE_GRID_MAJ = '#2e4352';
var PRIN_COL_SCOPE_AXE      = '#5a7484';
var PRIN_COL_SCOPE_TICK     = '#9db4c2';
// Point de lecture de l'instant courant : contrepartie claire de PRIN_COL_M,
// donc le même bleu de micro que sur la scène.
var PRIN_COL_SCOPE_CURSEUR  = '#6fc3ff';
// Contreparties « phosphore » de S₁/S₂/somme : les tons du tracé sont
// calibrés pour l'ivoire de la scène, illisibles sur du verre sombre — et le
// bleu nuit de la somme y disparaîtrait tout à fait. Elle passe donc en BLEU
// vif, qui reste sa couleur d'identité (PRIN_COL_SOMME est un bleu nuit) tout
// en se détachant nettement de l'orange et du rose des deux sources.
var PRIN_COL_SCOPE_S1    = '#ffa64d';
var PRIN_COL_SCOPE_S2    = '#ff6fa8';
var PRIN_COL_SCOPE_SOMME = '#4fb8ff';

// ── Graphes temporels y(M, t) ─────────────────────────────────────────
// Largeur de la fenêtre temporelle affichée, en PÉRIODES (et non en secondes
// fixes) : T = λ/c varie de 0,6 à 4,4 ms sur la plage de λ, un axe en durée
// fixe montrerait tantôt une demi-oscillation, tantôt vingt.
var PRIN_GRAPH_PERIODES = 4;
// Descripteurs des trois graphes — source unique pour les boutons du panneau,
// les fenêtres volantes, la couleur (celle de la ligne du tracé : c'est elle
// qui relie la fenêtre à sa ligne, sur le cadre, la barre de titre et la
// flèche), sa contrepartie « phosphore » pour le tracé sur verre sombre, et la
// ligne d'où part la flèche.
var PRIN_GRAPHS = [
    { cle : 'y1',  idx : 0, row : 0, couleur : PRIN_COL_S1,    scope : PRIN_COL_SCOPE_S1,
      btn : 'btn-graph-y1-prin',  win : 'prin-win-y1' },
    { cle : 'y2',  idx : 1, row : 1, couleur : PRIN_COL_S2,    scope : PRIN_COL_SCOPE_S2,
      btn : 'btn-graph-y2-prin',  win : 'prin-win-y2' },
    { cle : 'som', idx : 2, row : 2, couleur : PRIN_COL_SOMME, scope : PRIN_COL_SCOPE_SOMME,
      btn : 'btn-graph-som-prin', win : 'prin-win-som' }
];
// Demi-étendue de l'axe vertical, en unités d'amplitude — ±2, la valeur que
// peut atteindre A₁ + A₂, et la MÊME pour les trois graphes. C'est tout
// l'enjeu : les trois fenêtres ont la même taille, donc une échelle commune
// vaut un nombre de pixels par unité d'amplitude commun, et le doublement de
// y₁ + y₂ devant y₁ ou y₂ SE VOIT. Un axe auto-ajusté par graphe (±1 pour
// y₁/y₂, ±2 pour la somme) donnait trois courbes de même hauteur à l'écran :
// exactement l'illusion que cette simulation doit détruire. Même doctrine que
// simPrin.ampPx, identique sur les trois bandes du tracé principal.
var PRIN_GRAPH_MAXU = 2;

// ── État global ───────────────────────────────────────────────────────
var simPrin = {

    // ── Mode de l'onglet ────────────────────────────────────────────
    mode : '1d',            // '1d' | '2d' (2d : placeholder pour l'instant)

    // ── Représentation de l'onde ────────────────────────────────────
    // 'signal'     : les trois courbes de surpression (comportement d'origine)
    // 'particules' : le gaz seul, comme dans l'onglet Son de la page Ondes
    // 'lesdeux'    : le gaz, avec la courbe par-dessus
    repr : 'signal',

    // ── Contrôle de l'animation ─────────────────────────────────────
    // Départ EN PAUSE à t = 0 : le bouton affiche "▶ Lancer" et les trois
    // lignes sont plates tant qu'on ne l'a pas pressé (cf. _prinSyncPlayBtn).
    paused      : true,
    simTime     : 0,
    speedFactor : 1.0,

    // ── Paramètres réglables ────────────────────────────────────────
    lambda : PRIN_LAMBDA_DEF,   // m
    a1     : PRIN_A1_DEF,       // amplitude de S₁ (u.a.)
    a2     : PRIN_A2_DEF,       // amplitude de S₂ (u.a.)

    // ── Positions PHYSIQUES (m) — jamais en pixels, pour que le resize
    //    ne déplace rien (même doctrine que simSurf.point.cmX).
    x1 : PRIN_X1_DEF,
    x2 : PRIN_X2_DEF,
    xM : PRIN_XM_DEF,

    // ── Options d'affichage (toutes OFF au départ) ──────────────────
    showEnv     : false,   // enveloppe ±A(x) sur la ligne "somme"
    showReperes : false,   // positions constructives / destructives
    showCotes   : false,   // doubles flèches cotées S₁M et S₂M
    showDelta   : false,   // étiquette δ = |S₁M − S₂M| sous le micro
    showValeurs : false,   // encarts du panneau
    // Masque, sur les lignes 1 (y₁ seule) et 2 (y₂ seule), la portion du signal
    // au-delà de la position du micro — la ligne 3 (somme) n'est jamais
    // affectée. cf. _prinRowBoundsM.
    hideBeyondMic : false,

    // ── Géométrie canvas (px CSS), recalculée au resize ─────────────
    canvasW   : 0,
    canvasH   : 0,
    plotX0    : 0,   // abscisse écran de x = 0
    plotW     : 0,
    pxPerM    : 100,
    unitH     : 0,   // hauteur d'une "unité" verticale (cf. _prinLayout)
    ampPx     : 0,   // px par unité d'amplitude — IDENTIQUE sur les 3 lignes
    rows      : [],  // [{y0, half, titre}] — y0 = ligne de base (y = 0)
    axeLabelY : 0,   // ordonnée des valeurs chiffrées de l'axe (cf. _prinDrawAxe)
    srcH      : 0,   // hauteur du pictogramme de haut-parleur (px)
    micH      : 0,   // hauteur du pictogramme de micro (px) — PLUS PETIT que srcH
    coteYs    : [],  // ordonnées du couloir de cotes, sous la bande "somme"

    // ── Graphes temporels y(M, t) en fenêtres volantes ──────────────
    // Une entrée par graphe (cf. PRIN_GRAPHS) : ouverte ou non, et position
    // de la fenêtre. x/y sont en px CSS dans #prin-scene-area — fx/fy sont la
    // MÊME position en fraction de la place disponible, et c'est elle qui
    // survit au redimensionnement : une fenêtre calée en haut à droite doit
    // le rester quand on passe de la fenêtre du navigateur au plein écran du
    // vidéoprojecteur (cf. _prinSetGraphWinPos / _prinRelayoutGraphWins).
    graphs : {
        y1  : { open : false, x : 0, y : 0, fx : null, fy : null },
        y2  : { open : false, x : 0, y : 0, fx : null, fy : null },
        som : { open : false, x : 0, y : 0, fx : null, fy : null }
    },
    // Légende cliquable de la fenêtre « y₁ + y₂ » : superposition de chaque
    // terme à leur somme. DÉCOCHÉES au départ — la somme seule est le sujet.
    graphSomY1 : false,
    graphSomY2 : false,

    // ── Gaz de particules (mode 'particules' / 'lesdeux') ───────────
    // Un nuage par bande — les trois montrent le MÊME gaz, la ligne somme en
    // contient simplement deux fois plus puisqu'elle est deux fois plus haute.
    // Construit paresseusement au premier rendu (cf. _prinGazInit).
    gaz    : [null, null, null],
    gazSig : '',
    // Mode « Sélectionner des particules » (cf. _prinGazSelect). Ne vit que
    // dans les représentations qui montrent le gaz.
    selMode : false,
    // Gaz enfermé dans la cavité du micro — cf. _prinDrawMembraneMicro.
    // Coordonnées propres à la cavité : fx ∈ [0,1] le long de la membrane,
    // ry ∈ [0,1] entre la membrane et le fond.
    gazMic : null,

    // ── Glisser-déposer ─────────────────────────────────────────────
    drag      : null,  // 'S1' | 'S2' | 'M' | null — élément en cours de déplacement
    dragOff   : 0,     // écart (m) entre le point saisi et la position de l'élément :
                       // sans lui, un clic à 10 px à côté téléporte l'objet sous le pointeur
    hover     : null,  // élément survolé — sert au halo d'affordance
    sel       : 'M',   // élément piloté au clavier (flèches ← →)
    snapped   : false  // true quand la position vient d'être aimantée (cf. _prinSnap)
};

// ══════════════════════════════════════════════════════════════════════
//  PHYSIQUE
// ══════════════════════════════════════════════════════════════════════

// Pulsation ω = 2π·c/λ (rad/s)
function _prinOmega() { return 2 * Math.PI * PRIN_C / simPrin.lambda; }

// Onde issue de S₁, qui se propage vers la DROITE, tant que le front n'est
// pas arrivé (t < d/c) : c'est ce qui rend la propagation visible au
// lancement. Déplacer la source pendant l'animation re-cale son front sur la
// nouvelle position (approximation assumée : pas d'historique causal comme
// _surfSourceContrib, inutile ici). Non bornée en x = x₂ : c'est
// _prinY1(), plus bas, qui impose cette limite pour le calcul de la somme —
// cf. _prinY1Libre() pour le tracé de la ligne "S₁ seule", qui va jusqu'au
// bord de la fenêtre.
function _prinY1Libre(x, t) {
    var d = x - simPrin.x1;
    if (d < 0) return 0;
    var tr = t - d / PRIN_C;
    if (tr < 0) return 0;
    return simPrin.a1 * Math.sin(_prinOmega() * tr);
}

// Onde issue de S₂, qui se propage vers la GAUCHE (mêmes remarques, symétriques).
function _prinY2Libre(x, t) {
    var d = simPrin.x2 - x;
    if (d < 0) return 0;
    var tr = t - d / PRIN_C;
    if (tr < 0) return 0;
    return simPrin.a2 * Math.sin(_prinOmega() * tr);
}

// Versions bornées à [x₁, x₂] — un haut-parleur ne rayonne pas à travers
// l'autre — utilisées pour la SOMME (ligne 3), qui doit rester nulle hors de
// la zone de recouvrement (cf. bandeau de doc en tête de fichier).
function _prinY1(x, t) { return (x > simPrin.x2) ? 0 : _prinY1Libre(x, t); }
function _prinY2(x, t) { return (x < simPrin.x1) ? 0 : _prinY2Libre(x, t); }

// Amplitude de la résultante en x, une fois les fronts passés :
//   A(x) = √(a₁² + a₂² + 2·a₁·a₂·cos(2π·δ/λ))
// a₁/a₂ valent 0 tant que le front correspondant n'est pas arrivé, ce qui
// donne la bonne enveloppe aussi PENDANT le transitoire (là où une seule des
// deux ondes est présente, l'enveloppe vaut simplement son amplitude). Nulle
// hors de [x₁, x₂], mêmes bornes que _prinY1/_prinY2.
function _prinEnveloppe(x, t) {
    if (x < simPrin.x1 || x > simPrin.x2) return 0;
    var d1 = x - simPrin.x1, d2 = simPrin.x2 - x;
    var a1 = (t >= d1 / PRIN_C) ? simPrin.a1 : 0;
    var a2 = (t >= d2 / PRIN_C) ? simPrin.a2 : 0;
    var k = 2 * Math.PI / simPrin.lambda;
    return Math.sqrt(Math.max(0, a1 * a1 + a2 * a2 + 2 * a1 * a2 * Math.cos(k * (d2 - d1))));
}

// ══════════════════════════════════════════════════════════════════════
//  DÉPLACEMENT LONGITUDINAL DU GAZ — u(x, t)
//
//  y est une surpression (cf. bandeau en tête de fichier) ; le déplacement
//  des particules s'en déduit par p = −K·∂u/∂x. Le calcul reste ANALYTIQUE,
//  donc sans surcoût par rapport au reste de l'onglet.
//
//  Pour S₁ (vers +x, d₁ = x − x₁, ∂d₁/∂x = +1) :
//      u₁ = +U₁·(1 − cos(ω·tr₁))   avec U₁ = A₁·c/(K·ω)
//      ⟹ ∂u₁/∂x = −U₁·ω/c·sin(ω·tr₁)  ⟹  p₁ = A₁·sin(ω·tr₁)   ✔
//  Pour S₂ (vers −x, d₂ = x₂ − x, ∂d₂/∂x = −1), le signe s'inverse :
//      u₂ = −U₂·(1 − cos(ω·tr₂))   ⟹  p₂ = A₂·sin(ω·tr₂)       ✔
//
//  Les deux redonnent donc EXACTEMENT _prinY1Libre / _prinY2Libre : la
//  courbe tracée et le gaz décrivent la même onde, pas deux modèles
//  parallèles qu'il faudrait tenir d'accord.
//
//  ── Pourquoi (1 − cos) et non (−cos) ─────────────────────────────────
//  Une source qui démarre AU REPOS et émet une pression sinusoïdale pure
//  impose cette constante d'intégration : u doit valoir 0 à l'arrivée du
//  front. Sans elle, u sauterait de 0 à −U au passage du front et toutes
//  les particules se décaleraient d'un coup.
//
//  Conséquence assumée : derrière le front le gaz est translaté en bloc de
//  U. C'est INVISIBLE dans le gaz (une translation uniforme ne change
//  aucune densité, ∂/∂x d'une constante étant nul), et si A₁ = A₂ les deux
//  décalages se compensent exactement entre les sources. Cela ne se voit
//  que sur les membranes, qui pompent vers l'intérieur au lieu de battre
//  autour de leur repos — ce qui est le comportement réel d'un haut-parleur
//  qu'on démarre brutalement sur une sinusoïde.
//
//  Unités : u est rendu en « unités d'amplitude » comme y, les constantes
//  c/(K·ω) étant absorbées dans le gain d'affichage (cf. _prinGazGain).
// ══════════════════════════════════════════════════════════════════════

// Déplacement dû à S₁, compté positivement vers +x. Non borné en x₂ —
// contrepartie de _prinY1Libre, pour la ligne « S₁ seule ».
function _prinU1(x, t) {
    var d = x - simPrin.x1;
    if (d < 0) return 0;
    var tr = t - d / PRIN_C;
    if (tr < 0) return 0;
    return simPrin.a1 * (1 - Math.cos(_prinOmega() * tr));
}

// Déplacement dû à S₂ — négatif : S₂ pousse le gaz vers −x.
function _prinU2(x, t) {
    var d = simPrin.x2 - x;
    if (d < 0) return 0;
    var tr = t - d / PRIN_C;
    if (tr < 0) return 0;
    return -simPrin.a2 * (1 - Math.cos(_prinOmega() * tr));
}

// Versions bornées à [x₁, x₂], pour la ligne « superposition » — mêmes
// bornes que _prinY1/_prinY2, un haut-parleur ne rayonne pas à travers l'autre.
function _prinU1B(x, t) { return (x > simPrin.x2) ? 0 : _prinU1(x, t); }
function _prinU2B(x, t) { return (x < simPrin.x1) ? 0 : _prinU2(x, t); }

// ══════════════════════════════════════════════════════════════════════
//  GÉOMÉTRIE / REDIMENSIONNEMENT
// ══════════════════════════════════════════════════════════════════════

// Conversions position physique (m) ↔ abscisse écran (px CSS)
function _prinXpx(xm) { return simPrin.plotX0 + xm * simPrin.pxPerM; }
function _prinXm(xpx) { return (xpx - simPrin.plotX0) / simPrin.pxPerM; }

// Taille de police proportionnelle au canvas (charte : jamais de px fixe
// pour un texte dessiné dans une zone de simulation).
//
// Deux calibrages, dont on prend le PLUS GRAND :
//
//  • `base` — calibrage historique, conservé comme PLANCHER : ce qui était
//    lisible sur une petite fenêtre doit le rester à l'identique. Aucune
//    taille de fenêtre ne peut perdre en taille de texte.
//
//  • `grand` — calibrage « grande image ». L'ancien plafond de 17 px était
//    atteint dès 1054 px de canvas : en plein écran (canvas ≈ 1615 px), le
//    texte ne faisait plus que 1 % de la largeur projetée, donc illisible au
//    fond d'une salle de classe au vidéoprojecteur. Le texte doit grandir
//    AVEC l'image. Le terme en canvasH n'est pas décoratif : _prinLayout
//    consomme ≈ 7,6·fs de hauteur hors bandes (padTop + gouttières + couloir
//    de cotes), donc laisser fs suivre la seule largeur écraserait les bandes
//    sur une fenêtre large et basse. Le plafond à 24 px est la limite au-delà
//    de laquelle la pastille de titre (1,45·fs) mange une demi-bande.
function _prinFont() {
    var base  = Math.min(simPrin.canvasW / 62, 17);
    var grand = Math.min(simPrin.canvasW / 52, simPrin.canvasH / 30, 24);
    return Math.max(10, base, grand);
}

// Facteur d'épaisseur des traits, indexé sur la police (17 = ancienne taille
// maximale, d'où la valeur 1 quand rien n'a changé).
//
// Les épaisseurs et les longueurs de graduation étaient en pixels FIXES :
// à 24 px de police sur un vidéoprojecteur, un trait de 1 px se noie dans le
// voile lumineux et on obtient de gros textes posés sur des traits fantômes.
// Plancher à 1 : les fenêtres où fs < 17 gardent EXACTEMENT le rendu d'avant.
function _prinLW() {
    return Math.max(1, _prinFont() / 17);
}

// Découpe verticale : 4 "unités" de hauteur — 1 pour y₁, 1 pour y₂, 2 pour la
// somme. La ligne somme reçoit le double PRÉCISÉMENT parce que y₁+y₂ peut
// atteindre A₁+A₂ = 2 : l'échelle verticale (ampPx) reste ainsi IDENTIQUE et
// FIXE sur les trois lignes, donc un doublement d'amplitude se voit vraiment.
function _prinLayout(ctx) {
    var s = simPrin;
    var fs = _prinFont();
    // Simple respiration entre le bord du cadre et la première bande. Elle
    // valait 1,6·fs pour loger l'horloge « t / T / f », supprimée : cette
    // hauteur retourne désormais aux bandes.
    var padTop = fs * 0.55;

    // Sous la dernière bande, dans cet ordre : les valeurs chiffrées de l'axe
    // COLLÉES à la bande (elles graduent son axe, elles doivent lui rester
    // attachées), puis le couloir de cotes S₁M / S₂M.
    //
    // Ce couloir garde une hauteur CONSTANTE : ses lignes sont réservées en
    // permanence, occupées ou non. Un couloir dimensionné sur les options
    // actives faisait se comprimer et se translater toute la scène à chaque
    // bascule de « Coter S₁M et S₂M ».
    // Les cotes sont hors de la bande parce qu'à l'ancienne ordonnée
    // (y0 + half·0,82) elles tombaient exactement sur l'amplitude 2, donc dans
    // la courbe dès que A₁ + A₂ approchait son maximum.
    //
    // Trois termes : la descente jusqu'à la DERNIÈRE ligne de cote, la place
    // des pointes de flèche sous elle (cf. `t` dans _prinDrawCote, plafonné à
    // 7·lw), puis une marge de respiration avec le bord bas du cadre — sans
    // elle, supprimer la ligne λ/2 collait la cote S₂M au bas de la zone.
    //
    // coteY0/coteDY (en unités de fs) servent ICI et au calcul de s.coteYs
    // plus bas : les deux doivent rester d'accord, d'où les variables. Elles
    // tiennent compte du cartouche plein des libellés (1,20·fs de haut, cf.
    // _prinDrawCote) : coteY0 le dégage des valeurs chiffrées de l'axe qui le
    // précèdent, coteDY empêche deux cartouches consécutifs de se toucher.
    var coteY0 = 2.10, coteDY = 1.60;
    var basH = fs * (coteY0 + coteDY * (PRIN_N_COTES - 1))   // jusqu'à la dernière ligne
             + 10 * _prinLW()                                // pointes de flèche
             + fs * 0.55;                                    // marge avec le bas du cadre

    // unitH/ampPx ne dépendent que de canvasH : on les calcule AVANT padL/padR
    // pour en tirer la taille des haut-parleurs (srcH) et réserver la marge
    // horizontale qu'ils débordent derrière leur caisse — sans cela, une
    // source glissée jusqu'au bord de l'axe se retrouve avec sa caisse coupée
    // par le cadre.
    // Gouttière entre deux bandes : les trois panneaux étaient jointifs, donc
    // lus comme un seul bloc. Deux intervalles pour trois bandes.
    var gap = Math.max(8, fs * 1.15);
    var utile = Math.max(40, s.canvasH - padTop - basH - 2 * gap);
    s.unitH = utile / 4;
    s.ampPx = s.unitH * 0.5 * 0.82;          // ±1 tient dans une unité

    // Hiérarchie de taille RÉALISTE : un haut-parleur est un gros objet, un
    // micro un petit. L'ancien code faisait exactement l'inverse (le micro
    // valait le double d'une source).
    // Le haut-parleur garde sensiblement la taille qu'il avait (au-delà, son
    // libellé sous l'axe déborde de la bande sur les petites fenêtres) ; c'est
    // le micro qui rétrécit.
    s.srcH = Math.min(s.unitH * 0.30, s.ampPx * 0.72);
    s.micH = s.srcH / 1.25;
    var margeCaisse = s.srcH * 0.42 * 1.15;  // w * 1.15, cf. _prinDrawHautParleur

    // Le libellé "S₁ (x,xx m)" / "S₂ (x,xx m)" est centré sur la position de
    // la source (cf. _prinText dans _prinDrawHautParleur) : quand celle-ci est
    // proche du bord de l'axe, sa MOITIÉ de largeur peut déborder du canvas —
    // débordement souvent plus grand que celui de la caisse. On mesure donc
    // ce libellé (police identique à _prinDrawHautParleur) pour dimensionner
    // la marge en conséquence plutôt que de le laisser se faire tronquer.
    var margeLabel = margeCaisse;
    if (ctx) {
        ctx.save();
        ctx.font = 'bold ' + (fs * 1.05) + 'px "Segoe UI", Arial, sans-serif';
        var wLbl1 = ctx.measureText('S₁ (' + formatFr(0, 2) + ' m)').width;
        var wLbl2 = ctx.measureText('S₂ (' + formatFr(PRIN_VIEW_WIDTH_M, 2) + ' m)').width;
        ctx.restore();
        margeLabel = Math.max(margeCaisse, wLbl1 / 2, wLbl2 / 2) + 4;
    }

    // Gouttière gauche : elle porte désormais l'ÉCHELLE VERTICALE (±1 sur les
    // deux premières bandes, ±2 sur la somme). C'est ce qui rend visible le
    // fait — capital ici — que ampPx est identique sur les trois lignes : sans
    // graduation, rien ne dit à l'élève que les bandes ne sont pas
    // auto-normalisées, et le doublement d'amplitude ne prouve plus rien.
    var margeEch = 0, margeXm = 0;
    if (ctx) {
        ctx.save();
        ctx.font = 'bold ' + (fs * 0.88) + 'px monospace';
        margeEch = ctx.measureText('−2').width + 16 * _prinLW();   // + tick + respiration
        // "x (m)" est désormais posé APRÈS la dernière graduation, sur la même
        // ligne que les chiffres : padR doit lui faire place (cf. _prinDrawAxe).
        ctx.font = 'bold ' + (fs * 0.9) + 'px monospace';
        margeXm = fs * 0.8 + ctx.measureText('x (m)').width + 4;
        ctx.restore();
    }

    var padL = Math.max(38, s.canvasW * 0.045, margeLabel, margeEch);
    var padR = Math.max(24, s.canvasW * 0.030, margeLabel, margeXm);

    s.plotX0 = padL;
    s.plotW  = Math.max(10, s.canvasW - padL - padR);
    s.pxPerM = s.plotW / PRIN_VIEW_WIDTH_M;

    s.rows = [
        { y0: padTop + s.unitH * 0.5,             half: s.unitH * 0.5, maxU: 1, titre: 'S₁ seule — y₁' },
        { y0: padTop + s.unitH * 1.5 + gap,       half: s.unitH * 0.5, maxU: 1, titre: 'S₂ seule — y₂' },
        { y0: padTop + s.unitH * 3.0 + gap * 2,   half: s.unitH * 1.0, maxU: 2, titre: 'Superposition — y₁ + y₂' }
    ];

    // Valeurs chiffrées collées au bas de la bande, puis le couloir de cotes.
    // Slots FIXES : 0 = S₁M, 1 = S₂M (cf. drawPrincipe) ; une cote masquée
    // laisse sa ligne vide, elle ne décale pas l'autre.
    var basBandes = padTop + s.unitH * 4 + gap * 2;
    s.axeLabelY = basBandes + fs * 0.30;
    var yc = basBandes + fs * coteY0;
    s.coteYs = [];
    for (var c = 0; c < PRIN_N_COTES; c++) { s.coteYs.push(yc); yc += fs * coteDY; }
}

function resizePrincipe() {
    var canvas = document.getElementById('principe-canvas');
    if (!canvas) return;
    var wrap = document.getElementById('prin-scene-area');
    var w = wrap ? wrap.clientWidth  : canvas.clientWidth;
    var h = wrap ? wrap.clientHeight : canvas.clientHeight;
    if (w < 10 || h < 10) return;            // onglet ou mode masqué : rien à calibrer

    var dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    simPrin.canvasW = w;
    simPrin.canvasH = h;
    _prinLayout(ctx);
    // Les fenêtres volantes des graphes se recalent sur la nouvelle taille
    // de la zone (positions mémorisées en fraction, cf. simPrin.graphs).
    _prinRelayoutGraphWins();
}

// ══════════════════════════════════════════════════════════════════════
//  RENDU
// ══════════════════════════════════════════════════════════════════════

// Texte cerné d'un halo couleur fond : indispensable ici, tous les libellés
// (sources, cotes, repères) se superposent aux courbes.
// `halo` (optionnel) : couleur du cerne — à préciser pour un texte posé sur
// une bande de tracé, dont le fond n'est plus PRIN_COL_BG.
function _prinText(ctx, txt, x, y, color, font, align, baseline, halo) {
    ctx.font = font;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = baseline || 'middle';
    ctx.lineWidth = Math.max(3, _prinFont() * 0.28);
    ctx.strokeStyle = halo || PRIN_COL_BG;
    ctx.lineJoin = 'round';
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = color;
    ctx.fillText(txt, x, y);
}

// ── Rectangle à coins arrondis (compatibilité : ctx.roundRect n'existe pas
//    sur les navigateurs un peu anciens des salles informatiques).
function _prinRoundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// ── Bornes horizontales (m) d'une ligne — [0, largeur totale] normalement,
// réduites à la position du micro pour les lignes 1 et 2 quand l'option
// « Masquer l'onde au-delà du microphone » est active (la ligne 3, somme,
// n'est jamais concernée). Source unique, utilisée par le fond de bande,
// l'axe et le tracé de la courbe : ils doivent s'arrêter au même endroit.
function _prinRowBoundsM(r) {
    var s = simPrin;
    if (s.hideBeyondMic) {
        if (r === 0) return [0, s.xM];
        if (r === 1) return [s.xM, PRIN_VIEW_WIDTH_M];
    }
    return [0, PRIN_VIEW_WIDTH_M];
}

// ── Fond d'une bande de tracé + grille verticale tous les 0,5 m ───────
// La grille traverse toute la hauteur de la bande : une abscisse se repère
// ainsi sur les trois lignes d'un seul coup d'œil, ce qu'un tick de 6 px posé
// sur l'axe ne permettait pas.
// `boundsM` (optionnel) : [mMin, mMax] — restreint le cadre lui-même (et sa
// grille) à cet intervalle, cf. _prinRowBoundsM.
function _prinDrawBande(ctx, row, boundsM) {
    var s = simPrin, lw = _prinLW();
    var bMin = boundsM ? boundsM[0] : 0, bMax = boundsM ? boundsM[1] : PRIN_VIEW_WIDTH_M;
    var x = _prinXpx(bMin) - 6 * lw, w = _prinXpx(bMax) - _prinXpx(bMin) + 12 * lw;
    var y = row.y0 - row.half, h = row.half * 2;

    ctx.save();
    ctx.fillStyle = PRIN_COL_BAND;
    _prinRoundRect(ctx, x, y, w, h, Math.min(8, h * 0.15));
    ctx.fill();
    ctx.strokeStyle = PRIN_COL_BAND_BD;
    ctx.lineWidth = 1 * lw;
    ctx.stroke();

    // Grille en DEUX niveaux : le mètre entier bien marqué, le demi-mètre plus
    // discret. Un seul ton, trop pâle, ne donnait aucun repère chiffrable.
    for (var niveau = 0; niveau < 2; niveau++) {
        ctx.strokeStyle = niveau ? PRIN_COL_GRILLE_MAJ : PRIN_COL_GRILLE;
        ctx.lineWidth = (niveau ? 1.3 : 1) * lw;
        ctx.beginPath();
        for (var i = 0; i * 0.5 <= PRIN_VIEW_WIDTH_M + 1e-9; i++) {
            if ((i % 2 === 0) !== (niveau === 1)) continue;
            if (i * 0.5 < bMin - 1e-9 || i * 0.5 > bMax + 1e-9) continue;
            var px = Math.round(_prinXpx(i * 0.5)) + 0.5;   // trait net, non anti-aliasé
            ctx.moveTo(px, y + 2);
            ctx.lineTo(px, y + h - 2);
        }
        ctx.stroke();
    }
    ctx.restore();
}

// ── Échelle verticale, dans la gouttière gauche ───────────────────────
// Graduations ±1 (bandes "seule") ou ±2 (bande "somme"), toutes à la MÊME
// échelle ampPx : c'est la preuve visuelle que les trois lignes sont
// comparables — et donc que la somme peut vraiment valoir le double.
function _prinDrawEchelleY(ctx, row) {
    var s = simPrin, fs = _prinFont(), lw = _prinLW();
    var police = 'bold ' + (fs * 0.88) + 'px monospace';
    // Bande écrasée (petite fenêtre) : les graduations intermédiaires se
    // chevaucheraient — on ne garde alors que 0 et les extrêmes.
    var pas = (s.ampPx < fs * 1.05) ? row.maxU : 1;
    ctx.save();
    ctx.strokeStyle = PRIN_COL_TICK;
    ctx.lineWidth = 1.3 * lw;
    ctx.beginPath();
    for (var u = -row.maxU; u <= row.maxU; u += pas) {
        var y = row.y0 - u * s.ampPx;
        ctx.moveTo(s.plotX0 - 6 * lw, y);
        ctx.lineTo(s.plotX0 - (u === 0 ? 11 : 9) * lw, y);
    }
    ctx.stroke();
    ctx.restore();
    for (var v = -row.maxU; v <= row.maxU; v += pas) {
        var yv = row.y0 - v * s.ampPx;
        var txt = (v > 0 ? '+' : (v < 0 ? '−' : '')) + Math.abs(v);
        _prinText(ctx, txt, s.plotX0 - 12 * lw, yv, PRIN_COL_TICK, police, 'right', 'middle');
    }
}

// ── Axe horizontal d'une ligne, gradué en mètres ──────────────────────
// Graduations dessinées sur les TROIS axes (de part et d'autre de la ligne,
// comme sur un axe de graphe) : ne les mettre que sur la bande du bas laissait
// les deux autres sans repère chiffrable. Valeurs chiffrées une seule fois,
// SOUS la dernière ligne, les trois axes partageant la même échelle.
// `boundsM` (optionnel) : [mMin, mMax] — restreint l'axe et ses graduations
// à cet intervalle, sur le modèle de _prinDrawBande (cf. _prinRowBoundsM).
function _prinDrawAxe(ctx, row, avecValeurs, boundsM) {
    var s = simPrin, fs = _prinFont(), lw = _prinLW();
    var bMin = boundsM ? boundsM[0] : 0, bMax = boundsM ? boundsM[1] : PRIN_VIEW_WIDTH_M;

    // Axe + graduations d'un seul trait : _prinText() écrase strokeStyle
    // (halo couleur fond), on ne l'appelle donc jamais au milieu d'un tracé.
    ctx.save();
    ctx.strokeStyle = PRIN_COL_AXE;
    ctx.lineWidth = 1.4 * lw;
    ctx.beginPath();
    ctx.moveTo(_prinXpx(bMin), row.y0);
    ctx.lineTo(_prinXpx(bMax), row.y0);
    ctx.stroke();
    // Graduations à part, plus foncées que l'axe : c'est ce qui les rendait
    // invisibles à 1,2 px dans le gris de l'axe.
    ctx.strokeStyle = PRIN_COL_TICK;
    ctx.lineWidth = 1.4 * lw;
    ctx.beginPath();
    for (var i = 0; i * 0.5 <= PRIN_VIEW_WIDTH_M + 1e-9; i++) {
        if (i * 0.5 < bMin - 1e-9 || i * 0.5 > bMax + 1e-9) continue;
        var px = Math.round(_prinXpx(i * 0.5)) + 0.5;
        var t = ((i % 2 === 0) ? 7 : 4) * lw;
        ctx.moveTo(px, row.y0 - t);
        ctx.lineTo(px, row.y0 + t);
    }
    ctx.stroke();
    ctx.restore();

    if (!avecValeurs) return;
    for (var j = 0; j <= PRIN_VIEW_WIDTH_M + 1e-9; j++) {
        _prinText(ctx, formatFr(j, 0), _prinXpx(j), s.axeLabelY,
                  PRIN_COL_TICK, 'bold ' + (fs * 0.95) + 'px monospace', 'center', 'top');
    }
    // "x (m)" sur la MÊME ligne que les chiffres, juste après la dernière
    // graduation (usage des graphes) : la seconde ligne d'autrefois grignotait
    // la marge basse. padR est dimensionné pour l'accueillir, cf. _prinLayout.
    _prinText(ctx, 'x (m)', s.plotX0 + s.plotW + fs * 0.8, s.axeLabelY,
              PRIN_COL_TICK, 'bold ' + (fs * 0.9) + 'px monospace', 'left', 'top');
}

// ── Courbe y(x) échantillonnée une valeur par colonne de pixels ───────
// xMin/xMax (m, optionnels) restreignent le TRACÉ à ce domaine : en dehors,
// rien n'est dessiné (pas de segment plat sur l'axe) — évite que le signal
// paraisse "relié" à l'axe y = 0 juste au niveau de la source (cf. appelants).
// `remplissage` (optionnel) : aplat dégradé très pâle entre la courbe et
// l'axe — réservé à la superposition, qu'il distingue au premier regard des
// deux courbes sources.
function _prinDrawCourbe(ctx, row, fy, color, largeur, xMin, xMax, remplissage) {
    var s = simPrin;
    // Arrondis dissymétriques (ceil / floor), jamais Math.round : round() peut
    // tomber d'un demi-pixel à l'INTÉRIEUR de la borne interdite (x < xMin par
    // ex.), où fy() vaut 0 par définition — un seul pixel à 0 juste à côté de
    // la vraie valeur suffit à dessiner un faux trait vertical à l'origine.
    var iMin = (xMin === undefined) ? 0        : Math.max(0, Math.ceil(xMin * s.pxPerM));
    var iMax = (xMax === undefined) ? s.plotW  : Math.min(s.plotW, Math.floor(xMax * s.pxPerM));
    if (iMax < iMin) return;

    if (remplissage) {
        var grd = ctx.createLinearGradient(0, row.y0 - row.half, 0, row.y0 + row.half);
        grd.addColorStop(0,   'rgba(44, 62, 80, 0.13)');
        grd.addColorStop(0.5, 'rgba(44, 62, 80, 0.02)');
        grd.addColorStop(1,   'rgba(44, 62, 80, 0.13)');
        ctx.save();
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(s.plotX0 + iMin, row.y0);
        for (var k = iMin; k <= iMax; k++) {
            ctx.lineTo(s.plotX0 + k, row.y0 - fy(k / s.pxPerM) * s.ampPx);
        }
        ctx.lineTo(s.plotX0 + iMax, row.y0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = largeur;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var i = iMin; i <= iMax; i++) {
        var y = row.y0 - fy(i / s.pxPerM) * s.ampPx;
        if (i === iMin) ctx.moveTo(s.plotX0 + i, y); else ctx.lineTo(s.plotX0 + i, y);
    }
    ctx.stroke();
    ctx.restore();
}

// ── Enveloppe ±A(x) de la résultante (ligne somme) ────────────────────
function _prinDrawEnveloppe(ctx, row, t) {
    var s = simPrin;
    ctx.save();
    ctx.strokeStyle = PRIN_COL_ENV;
    ctx.lineWidth = 1.6 * _prinLW();
    ctx.setLineDash([6 * _prinLW(), 4 * _prinLW()]);
    for (var signe = -1; signe <= 1; signe += 2) {
        ctx.beginPath();
        for (var i = 0; i <= s.plotW; i++) {
            var y = row.y0 - signe * _prinEnveloppe(i / s.pxPerM, t) * s.ampPx;
            if (i === 0) ctx.moveTo(s.plotX0, y); else ctx.lineTo(s.plotX0 + i, y);
        }
        ctx.stroke();
    }
    ctx.restore();
}

// ── Repères des interférences constructives / destructives ────────────
// δ(x) = x₁ + x₂ − 2x varie LINÉAIREMENT : les positions cherchées s'écrivent
// en clair (pas de balayage numérique), cf. bandeau de doc en tête de fichier.
// Dessinés SOUS les axes et les courbes (appelés avant elles) : ce sont des
// repères de fond, ils ne doivent pas masquer le tracé.
// Liste ordonnée des positions remarquables entre S₁ et S₂ :
//   type 'V' — ventre  (interférence constructive, δ = k·λ)
//   type 'N' — nœud    (interférence destructive,  δ = (k + ½)·λ)
// Utilisée pour le fond, les lettres V/N et l'aimantation du glisser-déposer :
// une seule source de vérité.
function _prinPositionsRemarquables() {
    var s = simPrin;
    var somme = s.x1 + s.x2;
    var kMax = Math.floor((s.x2 - s.x1) / s.lambda) + 1;
    var out = [];
    for (var k = -kMax; k <= kMax; k++) {
        for (var type = 0; type < 2; type++) {
            var x = (somme - (k + (type === 1 ? 0.5 : 0)) * s.lambda) / 2;
            if (x <= s.x1 || x >= s.x2) continue;   // hors zone de recouvrement
            out.push({ x: x, type: (type === 0) ? 'V' : 'N' });
        }
    }
    out.sort(function (a, b) { return a.x - b.x; });
    return out;
}

// ── Repères des interférences : marqueurs PONCTUELS (ocre / violet) ───
// Les interférences constructives et destructives se produisent en des
// POSITIONS PRÉCISES (x = (x₁ + x₂ − k·λ)/2 et x = (x₁ + x₂ − (k+½)·λ)/2),
// pas sur des intervalles : l'ancienne trame de points, large de λ·0,14, en
// faisait des bandes floues dont on ne pouvait pas lire le centre — et deux
// colonnes de points sur fond ivoire, ce n'est pas un repère, c'est du bruit.
// Chaque position est donc marquée par UN trait vertical fin, calé au pixel
// sur x, encadré de deux pointes de repère (haut et bas de la bande) dont
// l'apex tombe exactement sur ce même x.
//
// Deux niveaux de lecture, redondants pour le vidéoprojecteur : la COULEUR
// (ocre / violet, cf. PRIN_COL_CONSTR / PRIN_COL_DESTR) et le TRAIT (continu
// pour le constructif, tireté pour le destructif) — lisible même reprojeté
// délavé.
//
// Appelé AVANT les axes et les courbes : c'est un repère de fond, il ne doit
// pas masquer le tracé. Les pointes se logent aux deux bords de la bande, là
// où la courbe ne passe jamais (l'amplitude maximale, 2, n'occupe que 82 %
// de la demi-hauteur — cf. s.ampPx dans _prinLayout).

// Pointe de repère : triangle PLEIN dont l'APEX est exactement en
// (x, y + sens·h). Pleine sur les deux types : une pointe creuse en violet
// se lisait mal au vidéoprojecteur (le cerne se délave et il ne reste qu'un
// contour fantôme) — la distinction se joue sur la couleur et sur le trait,
// continu ou tireté.
function _prinDrawPointeRepere(ctx, x, y, h, sens, couleur) {
    var demi = h * 0.72;
    ctx.beginPath();
    ctx.moveTo(x, y + sens * h);
    ctx.lineTo(x - demi, y);
    ctx.lineTo(x + demi, y);
    ctx.closePath();
    ctx.fillStyle = couleur;
    ctx.fill();
}

function _prinDrawReperes(ctx, positions) {
    var s = simPrin, lw = _prinLW(), fs = _prinFont();
    var row = s.rows[2];
    var yTop = row.y0 - row.half + 1, yBas = row.y0 + row.half - 1;
    var h = Math.max(4, fs * 0.34);           // hauteur des pointes de repère
    ctx.save();
    for (var i = 0; i < positions.length; i++) {
        var constructif = (positions[i].type === 'V');
        var couleur = constructif ? PRIN_COL_CONSTR : PRIN_COL_DESTR;
        // +0,5 px : un trait de 1 px centré sur une abscisse entière bave sur
        // deux colonnes de pixels et paraît deux fois plus épais qu'il n'est.
        var px = Math.round(_prinXpx(positions[i].x)) + 0.5;

        // Trait de position — continu (constructif) ou tireté (destructif)
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = couleur;
        ctx.lineWidth = 1.3 * lw;
        ctx.setLineDash(constructif ? [] : [4 * lw, 3.5 * lw]);
        ctx.beginPath();
        ctx.moveTo(px, yTop + h);
        ctx.lineTo(px, yBas - h);
        ctx.stroke();
        ctx.setLineDash([]);

        // Pointes : pleine opacité, ce sont elles qui DÉSIGNENT la position
        ctx.globalAlpha = 1;
        _prinDrawPointeRepere(ctx, px, yTop, h,  1, couleur);
        _prinDrawPointeRepere(ctx, px, yBas, h, -1, couleur);
    }
    ctx.restore();
}

// ── Légende des repères d'interférences ───────────────────────────────
// Dessinée APRÈS les courbes (contrairement aux repères eux-mêmes) : un
// cartouche opaque calé dans le coin haut-droit de la bande « somme », en
// vis-à-vis de la pastille de titre qui en occupe le coin haut-gauche. Sans
// elle, les deux couleurs ne disent rien : rien à l'écran ne nomme ce que
// marquent l'ocre et le violet. Elle NOMME seulement les deux natures — la
// condition sur δ qui les produit est le contenu du cours et de l'encart
// « Valeurs » du panneau ; l'écrire ici donnait la réponse d'avance.
// La police se réduit si la place laissée par la pastille de titre l'exige :
// mieux vaut une légende petite qu'une légende qui chevauche le titre.
function _prinDrawReperesLegende(ctx) {
    var s = simPrin, lw = _prinLW(), fs = _prinFont();
    var row = s.rows[2];
    // En mode Particules, la légende dit AUSSI ce qu'on voit du gaz à ces
    // endroits : la pression et la densité étant en phase, un ventre de
    // pression est un cœur de compression — mais c'est aussi un nœud de
    // DÉPLACEMENT, donc l'endroit où les particules bougent le moins. Sans
    // cette précision, l'élève lit « constructif » sur des particules
    // immobiles et en conclut le contraire de ce qu'il faut.
    var lignes = (s.repr === 'signal')
        ? [ { txt : 'interférences constructives', col : PRIN_COL_CONSTR },
            { txt : 'interférences destructives',  col : PRIN_COL_DESTR  } ]
        : [ { txt : 'constructives — le gaz se comprime', col : PRIN_COL_CONSTR },
            { txt : 'destructives — densité constante',   col : PRIN_COL_DESTR  } ];

    ctx.save();
    // Largeur disponible : la moitié droite de la bande — la pastille de
    // titre s'arrête bien avant, sur toutes les tailles de fenêtre.
    var dispo = s.plotW * 0.62 - 6;
    var f = fs * 0.82;
    ctx.font = f + 'px "Segoe UI", Arial, sans-serif';
    var wTxt = Math.max(ctx.measureText(lignes[0].txt).width,
                        ctx.measureText(lignes[1].txt).width);
    var marge = f * 0.7, wSym = f * 1.1;
    var w = marge * 2 + wSym + f * 0.45 + wTxt;
    if (w > dispo) {                          // fenêtre étroite : on rétrécit
        f = Math.max(fs * 0.55, f * dispo / w);
        ctx.font = f + 'px "Segoe UI", Arial, sans-serif';
        wTxt = Math.max(ctx.measureText(lignes[0].txt).width,
                        ctx.measureText(lignes[1].txt).width);
        marge = f * 0.7; wSym = f * 1.1;
        w = marge * 2 + wSym + f * 0.45 + wTxt;
    }
    var hPointe = f * 0.40;
    var dy = f * 1.30;
    var h = marge * 0.9 + dy * lignes.length;
    var x = s.plotX0 + s.plotW - 2 - w;
    var y = row.y0 - row.half + 3 * lw;

    ctx.globalAlpha = 0.94;
    ctx.fillStyle = PRIN_COL_BG;
    _prinRoundRect(ctx, x, y, w, h, Math.min(8, f * 0.5));
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = PRIN_COL_BAND_BD;
    ctx.lineWidth = 1.2 * lw;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < lignes.length; i++) {
        var yl = y + marge * 0.45 + dy * (i + 0.5);
        // Même pointe que sur la scène : la légende montre le symbole exact,
        // et non une pastille ronde qui n'existe nulle part sur le tracé.
        _prinDrawPointeRepere(ctx, x + marge + wSym / 2, yl - hPointe / 2,
                              hPointe, 1, lignes[i].col);
        ctx.fillStyle = lignes[i].col;
        ctx.fillText(lignes[i].txt, x + marge + wSym + f * 0.45, yl);
    }
    ctx.restore();
}

// ── Guide vertical pointillé, sur toute la hauteur d'une bande ────────
// Factorisé depuis l'ancien guide de M (seul élément qui en bénéficiait) et
// réutilisé pour S₁/S₂ : leur pictogramme de haut-parleur, plus large que le
// point de M, rendait l'abscisse exacte de la source moins évidente à situer.
// `actif` : élément survolé ou en cours de déplacement. Le retour visuel passe
// par le guide — appuyé, plein — et non plus par un halo autour du
// pictogramme : celui-ci empâtait l'objet au lieu de le désigner.
// Pseudo-bande couvrant les bandes iA à iB incluses, gouttières comprises —
// permet de tracer un guide d'une seule pièce sur plusieurs bandes.
function _prinSpan(iA, iB) {
    var a = simPrin.rows[iA], b = simPrin.rows[iB];
    var haut = a.y0 - a.half, bas = b.y0 + b.half;
    return { y0: (haut + bas) / 2, half: (bas - haut) / 2 };
}

function _prinDrawGuide(ctx, row, xpx, color, actif) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = actif ? 0.95 : 0.45;
    ctx.lineWidth = (actif ? 2 : 1.2) * _prinLW();
    ctx.setLineDash(actif ? [] : [4 * _prinLW(), 4 * _prinLW()]);
    ctx.beginPath();
    ctx.moveTo(xpx, row.y0 - row.half);
    ctx.lineTo(xpx, row.y0 + row.half);
    ctx.stroke();
    ctx.restore();
}

// ── Repère de position réelle sur l'axe ────────────────────────────────
// Petit ergot + point plein exactement sur la ligne y = 0 : le haut-parleur
// (ci-dessous) est un pictogramme, pas toujours lisible au pixel près, alors
// que S₁M / S₂M se mesurent depuis cette position précise — d'où ce repère
// dédié, dessiné PAR-DESSUS l'axe et la courbe pour rester visible.
function _prinDrawSourceMark(ctx, xpx, y0, color) {
    var lw = _prinLW();
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * lw;
    ctx.beginPath();
    ctx.moveTo(xpx, y0 - 7 * lw);
    ctx.lineTo(xpx, y0 + 7 * lw);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(xpx, y0, 3.2 * lw, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// Décalage (en unités de h) entre le centre géométrique du haut-parleur
// (xpx, position physique x₁/x₂) et la pointe de son pavillon — c'est cette
// pointe qui émet visuellement le signal. Doit rester cohérent avec les
// facteurs w = h*0.42 et w*0.55 du pavillon dans _prinDrawHautParleur
// ci-dessous ; utilisé par drawPrincipe() pour caler le repère de position
// (cf. _prinDrawSourceMark) exactement sur cette pointe plutôt que sur le
// centre de la caisse.
var PRIN_SRC_TIP_RATIO = 0.42 * 0.55;

// ── Haut-parleur schématique posé sur l'axe ───────────────────────────
// `sens` = +1 émet vers la droite (S₁), −1 vers la gauche (S₂). Caisse en
// gris métallique (même famille de teintes que le pot vibrant de la page
// Ondes, cf. ondes/js/tube.js → _drawShaker) ; seul le pavillon reste dans la
// couleur de la source, pour garder l'identification S₁ orange / S₂ rose.
// `phase` : phase d'émission en radians — la membrane respire et les arcs
// s'éloignent au rythme de l'onde. Les arcs étaient auparavant FIGÉS, même en
// pleine animation ; les voir défiler rend l'émission évidente.
function _prinDrawHautParleur(ctx, xpx, y0, h, color, label, sens, phase) {
    var w = h * 0.42;
    ctx.save();
    ctx.translate(xpx, y0);
    ctx.scale(sens, 1);

    // Caisse — dégradé métallique clair/foncé, indépendant de la couleur source
    var caisseGrd = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    caisseGrd.addColorStop(0,   '#c8d2da');
    caisseGrd.addColorStop(0.5, '#eef3f6');
    caisseGrd.addColorStop(1,   '#8a99a6');
    ctx.fillStyle = caisseGrd;
    ctx.beginPath();
    ctx.rect(-w * 1.15, -h / 2, w, h);
    ctx.fill();
    ctx.strokeStyle = '#5a6a78';
    ctx.lineWidth = 1 * _prinLW();
    ctx.strokeRect(-w * 1.15, -h / 2, w, h);
    // Membrane (petit disque au centre de la caisse), dans la couleur source ;
    // son rayon oscille de ±12 % au rythme de l'onde émise.
    var vib = 1 + 0.12 * Math.sin(phase || 0);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(-w * 0.63, 0, w * 0.32 * vib, 0, Math.PI * 2);
    ctx.fill();

    // Pavillon — couleur de la source
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(-w * 0.15, -h / 2);
    ctx.lineTo(w * 0.55, -h * 0.82);
    ctx.lineTo(w * 0.55, h * 0.82);
    ctx.lineTo(-w * 0.15, h / 2);
    ctx.closePath();
    ctx.fill();
    // Ondes émises — trois arcs qui s'éloignent en boucle et s'effacent en
    // s'éloignant (la fraction avance avec la phase).
    ctx.lineWidth = 1.8 * _prinLW();
    var frac = (((phase || 0) / (2 * Math.PI)) % 1 + 1) % 1;
    for (var i = 0; i < 3; i++) {
        var u = (frac + i / 3) % 1;                    // 0 → sortie du pavillon, 1 → au loin
        ctx.globalAlpha = Math.min(1, 2.2 * u) * (1 - u) * 1.6;
        ctx.beginPath();
        ctx.arc(w * 0.55, 0, w * (0.35 + 1.5 * u), -Math.PI / 3, Math.PI / 3);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // Libellé SOUS l'axe : au-dessus, il chevaucherait le titre de la ligne
    // (coin haut-gauche de la bande), la source la plus à gauche étant proche.
    _prinText(ctx, label, xpx, y0 + h * 0.80, color,
              'bold ' + (_prinFont() * 1.05) + 'px "Segoe UI", Arial, sans-serif',
              'center', 'top', PRIN_COL_BAND);
}

// ── Micro M : poignée FIXE sur l'axe (le point de lecture, lui, oscille avec
//    la courbe — cf. drawPrincipe). Une poignée qui suivrait la courbe serait
//    beaucoup plus difficile à attraper pendant l'animation.
//
//  Micro de mesure DEBOUT, nettement DÉCALÉ sous l'axe : socle, pied fin,
//  corps cylindrique, tête grillagée. Le décalage est délibéré — collé à
//  l'axe, le pictogramme se mêle au tracé de la superposition, la courbe la
//  plus ample de la scène ; c'est le guide vertical pointillé à l'abscisse de
//  M qui fait le lien avec l'axe, pas le contact physique.
//
//  Couleurs : MÊME doctrine que _prinDrawHautParleur — corps en gris
//  métallique (l'objet), couleur d'identité (PRIN_COL_M) réservée au seul
//  organe actif, ici la tête grillagée. Le micro tout bleu lisait comme un
//  symbole, pas comme un instrument.
//
//  Rapport hauteur totale / h, socle compris mais libellé exclu — sert à
//  caler ce qui vient dessous (libellé, badge δ), cf. drawPrincipe.
var PRIN_MIC_BAS_RATIO = 1.82;

// ── Décalage de la membrane du micro sous l'axe (mode Particules) ─────
//
//  En unités de micH. Au repos, la membrane du micro tombait exactement sur
//  la ligne y = 0 et se confondait avec elle : on ne savait plus si le trait
//  horizontal était l'axe ou le capteur. Elle est donc posée franchement en
//  dessous, comme le pictogramme de micro du mode Signal l'était déjà.
//
//  La valeur est bornée par le haut d'un côté ET de l'autre :
//   • assez grande pour que la membrane reste sous l'axe même bombée au
//     maximum vers l'extérieur (cf. _prinMicGain, calibré avec elle) ;
//   • assez petite pour que le FOND de la cavité, lui, ne bouge pas : il
//     reste calé sur PRIN_MIC_BAS_RATIO, et avec lui le libellé « M (x,xx m) »
//     et le badge δ. Ce badge est déjà au ras de sa borne basse (il ne
//     dispose que d'un pixel de marge avant d'être rabattu dans la bande, cf.
//     drawPrincipe), donc descendre le fond de la cavité le ferait chevaucher
//     le libellé. C'est la cavité qui se raccourcit, pas la scène qui bouge.
var PRIN_MIC_DECALAGE = 0.50;

function _prinDrawMicro(ctx, xpx, y0, h, label) {
    var lw  = _prinLW();
    var w   = h * 0.58;                 // largeur du corps
    var hc  = h * 1.02;                 // hauteur du corps (tête comprise)
    var yT  = y0 + h * 0.45;            // sommet de la tête — décalé sous l'axe
    var yB  = yT + hc;                  // bas du corps
    var yP  = y0 + h * PRIN_MIC_BAS_RATIO;   // socle
    var xg  = xpx - w / 2;
    var rT  = w / 2, rB = w * 0.20;     // tête arrondie, bas presque droit

    // Silhouette du corps : capsule à sommet hémisphérique
    function corps() {
        ctx.beginPath();
        ctx.moveTo(xg + rT, yT);
        ctx.arcTo(xg + w, yT, xg + w, yB, rT);
        ctx.arcTo(xg + w, yB, xg, yB, rB);
        ctx.arcTo(xg, yB, xg, yT, rB);
        ctx.arcTo(xg, yT, xg + w, yT, rT);
        ctx.closePath();
    }

    ctx.save();
    ctx.lineCap = 'round';

    // 1. Liseré couleur bande sous TOUTE la silhouette : le micro reste net
    //    là où la courbe de superposition lui passe dessus.
    ctx.strokeStyle = PRIN_COL_BAND;
    ctx.lineWidth = 4 * lw;
    ctx.beginPath();
    ctx.moveTo(xpx, yB);
    ctx.lineTo(xpx, yP);
    ctx.stroke();
    corps();
    ctx.stroke();

    // 2. Pied + socle, en gris métallique sombre
    ctx.strokeStyle = '#5a6a78';
    ctx.lineWidth = Math.max(1.6 * lw, h * 0.09);
    ctx.beginPath();
    ctx.moveTo(xpx, yB);
    ctx.lineTo(xpx, yP);
    ctx.stroke();
    ctx.fillStyle = '#8a99a6';
    ctx.strokeStyle = '#5a6a78';
    ctx.lineWidth = 1 * lw;
    ctx.beginPath();
    ctx.ellipse(xpx, yP, w * 0.80, Math.max(1.6 * lw, h * 0.11), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 3. Corps — même dégradé métallique que la caisse des haut-parleurs,
    //    mais horizontal : c'est lui qui donne le cylindre.
    var grd = ctx.createLinearGradient(xg, 0, xg + w, 0);
    grd.addColorStop(0,    '#9fadb8');
    grd.addColorStop(0.34, '#eef3f6');
    grd.addColorStop(0.72, '#c8d2da');
    grd.addColorStop(1,    '#7d8c99');
    ctx.fillStyle = grd;
    corps();
    ctx.fill();

    // 4. Tête grillagée — SEUL élément en couleur d'identité de M, comme le
    //    pavillon l'est pour une source. Stries claires découpées à la
    //    silhouette : sans elles, on lit « gélule » et non « micro ».
    ctx.save();
    corps();
    ctx.clip();
    var hTete = hc * 0.52;
    var grdT = ctx.createLinearGradient(xg, 0, xg + w, 0);
    grdT.addColorStop(0,    '#4d8ecb');
    grdT.addColorStop(0.34, PRIN_COL_M);
    grdT.addColorStop(1,    '#173f66');
    ctx.fillStyle = grdT;
    ctx.fillRect(xg, yT, w, hTete);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
    ctx.lineWidth = Math.max(0.8 * lw, h * 0.045);
    var pas = Math.max(2.4, hTete / 4);
    ctx.beginPath();
    for (var y = yT + pas * 0.9; y < yT + hTete - pas * 0.2; y += pas) {
        ctx.moveTo(xg + 1, y);
        ctx.lineTo(xg + w - 1, y);
    }
    ctx.stroke();
    // Bague de séparation tête / corps
    ctx.strokeStyle = '#5a6a78';
    ctx.lineWidth = Math.max(1 * lw, h * 0.07);
    ctx.beginPath();
    ctx.moveTo(xg, yT + hTete);
    ctx.lineTo(xg + w, yT + hTete);
    ctx.stroke();
    ctx.restore();

    // 5. Contour
    ctx.strokeStyle = '#5a6a78';
    ctx.lineWidth = 1.1 * lw;
    corps();
    ctx.stroke();
    ctx.restore();

    _prinText(ctx, label, xpx, yP + h * 0.22, PRIN_COL_M,
              'bold ' + (_prinFont() * 1.05) + 'px "Segoe UI", Arial, sans-serif',
              'center', 'top', PRIN_COL_BAND);
}

// ── Double flèche cotée horizontale (cotes S₁M / S₂M) ─────────────────
function _prinDrawCote(ctx, xa, xb, y, label, color) {
    var fs = _prinFont(), lw = _prinLW();
    // Demi-hauteur des pointes. Le plafond suit lw, sinon les pointes restent
    // figées à 7 px sous une police de 24 px. Il reste cohérent avec le
    // « + 10·lw » que basH réserve pour elles dans _prinLayout.
    var t = Math.max(4, Math.min(7 * lw, fs * 0.45));
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.8 * lw;
    ctx.beginPath();
    ctx.moveTo(xa, y);
    ctx.lineTo(xb, y);
    ctx.stroke();
    var sens = (xb >= xa) ? 1 : -1;
    [[xa, sens], [xb, -sens]].forEach(function (p) {
        ctx.beginPath();
        ctx.moveTo(p[0], y);
        ctx.lineTo(p[0] + p[1] * t * 1.6, y - t * 0.7);
        ctx.lineTo(p[0] + p[1] * t * 1.6, y + t * 0.7);
        ctx.closePath();
        ctx.fill();
    });
    ctx.lineWidth = 1.2 * lw;                      // traits d'attache
    ctx.beginPath();
    ctx.moveTo(xa, y - t); ctx.lineTo(xa, y + t);
    ctx.moveTo(xb, y - t); ctx.lineTo(xb, y + t);
    ctx.stroke();
    ctx.restore();

    // Libellé posé SUR la ligne de cote (et non au-dessus) : les cotes sont
    // empilées dans un couloir serré sous la bande, un libellé en surplomb
    // heurterait la cote du dessus. Même corps que les libellés de S₁/S₂/M
    // (1,05·fs) : ce sont les mêmes grandeurs lues au tableau.
    //
    // Cartouche PLEIN sous le texte, et non le simple halo de _prinText() :
    // le halo laissait deviner le trait de cote derrière les lettres. Il est
    // dessiné ici, pas dans _prinText(), pour être ajusté à la hauteur du
    // couloir.
    var police = 'bold ' + (fs * 1.05) + 'px "Segoe UI", Arial, sans-serif';
    ctx.save();
    ctx.font = police;
    var wTxt = ctx.measureText(label).width;
    var padX = fs * 0.34, hPlaque = fs * 1.20;
    ctx.fillStyle = PRIN_COL_BG;
    _prinRoundRect(ctx, (xa + xb) / 2 - wTxt / 2 - padX, y - hPlaque / 2,
                   wTxt + padX * 2, hPlaque, hPlaque * 0.28);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, (xa + xb) / 2, y + 0.5);
    ctx.restore();
}

// ── Nature de l'interférence en M ─────────────────────────────────────
// Source unique, partagée par l'encart du panneau (_prinUpdateValeurs) et le
// badge dessiné sous le micro : les deux ne peuvent plus diverger.
var PRIN_TOL_RATIO = 0.03;   // tolérance sur δ/λ pour conclure

function _prinNature() {
    var s = simPrin;
    var d1 = s.xM - s.x1, d2 = s.x2 - s.xM;
    var delta = Math.abs(d1 - d2);
    var ratio = delta / s.lambda;
    // Constructif si δ/λ est (presque) entier, destructif s'il est (presque)
    // demi-entier — l'écart au demi-entier se mesure en décalant de ½.
    var ecartEntier = Math.abs(ratio - Math.round(ratio));
    var ecartDemi   = Math.abs((ratio + 0.5) - Math.round(ratio + 0.5));
    if (ecartEntier < PRIN_TOL_RATIO) {
        return { d1: d1, d2: d2, delta: delta, ratio: ratio, couleur: PRIN_COL_CONSTR,
                 court: 'constructive', texte: 'δ ≈ k·λ → interférence constructive' };
    }
    if (ecartDemi < PRIN_TOL_RATIO) {
        return { d1: d1, d2: d2, delta: delta, ratio: ratio, couleur: PRIN_COL_DESTR,
                 court: 'destructive', texte: 'δ ≈ (k + ½)·λ → interférence destructive' };
    }
    return { d1: d1, d2: d2, delta: delta, ratio: ratio, couleur: '#5a6a78',
             court: 'intermédiaire', texte: 'Cas intermédiaire' };
}

// ── Badge « δ = |S₁M − S₂M| = … · constructive » posé sous le micro ───
// Calcul détaillé (barres de valeur absolue comprises), sur le modèle de
// l'encart « Valeurs » du panneau (cf. _prinUpdateValeurs) : l'élève doit
// pouvoir suivre le calcul sans ouvrir cet encart. Option « Afficher la
// différence de marche », désactivée par défaut (cf. showDelta).
function _prinDrawBadgeDelta(ctx, xpx, y) {
    var s = simPrin, fs = _prinFont();
    var nat = _prinNature();
    var txt = 'δ = |' + formatFr(nat.d1, 2) + ' − ' + formatFr(nat.d2, 2) + '| = ' +
               formatFr(nat.delta, 2) + ' m · ' + nat.court;
    var police = 'bold ' + (fs * 0.92) + 'px "Segoe UI", Arial, sans-serif';
    ctx.save();
    ctx.font = police;
    var w = ctx.measureText(txt).width + fs * 0.9;
    var h = fs * 1.5;
    // Recentré puis rabattu dans le cadre : M peut être tout près d'un bord
    var x = Math.max(2, Math.min(s.canvasW - w - 2, xpx - w / 2));
    ctx.fillStyle = PRIN_COL_BAND;
    ctx.strokeStyle = nat.couleur;
    ctx.lineWidth = 1.4 * _prinLW();
    _prinRoundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = nat.couleur;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x + w / 2, y + h / 2 + 0.5);
    ctx.restore();
}

// ── Titre de bande, en pastille ───────────────────────────────────────
// Remplace le texte en halo posé dans le coin du tracé : une pilule opaque
// avec sa pastille de couleur se lit sans concurrencer la courbe.
// `boundsM` (optionnel) : [mMin, mMax] — la pastille se cale sur le début
// (ou la fin, cf. `align`) RÉEL du cadre plutôt que sur le bord de l'axe
// (cf. _prinRowBoundsM), sans quoi elle flotterait hors d'une bande réduite
// (ligne 2, micro masqué).
// `align` (optionnel, 'left' par défaut | 'right') : côté du cadre où la
// pilule s'ancre — « S₂ seule » se lit à droite, sa source étant du même
// côté, plutôt qu'à gauche comme les deux autres titres.
function _prinDrawTitre(ctx, row, couleur, boundsM, align) {
    var s = simPrin, fs = _prinFont();
    if (row.half < fs * 1.4) return;      // bande trop basse : le titre nuirait
    var police = 'bold ' + (fs * 0.92) + 'px "Segoe UI", Arial, sans-serif';
    ctx.save();
    ctx.font = police;
    var r = fs * 0.28;
    var w = ctx.measureText(row.titre).width + fs * 1.5 + r * 2;
    var h = fs * 1.45;
    var y = row.y0 - row.half + 3 * _prinLW();
    var droite = (align === 'right');
    var x = droite
        ? (boundsM ? _prinXpx(boundsM[1]) : s.plotX0 + s.plotW) + 2 - w
        : (boundsM ? _prinXpx(boundsM[0]) : s.plotX0) - 2;
    ctx.fillStyle = PRIN_COL_BG;
    ctx.globalAlpha = 0.92;
    _prinRoundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = PRIN_COL_LABEL;
    ctx.textBaseline = 'middle';
    if (droite) {
        // Pastille à droite de la pilule, texte aligné à droite juste avant elle.
        ctx.textAlign = 'right';
        ctx.fillText(row.titre, x + w - fs * 0.55 - r - fs * 0.35, y + h / 2 + 0.5);
        ctx.fillStyle = couleur;
        ctx.beginPath();
        ctx.arc(x + w - fs * 0.55, y + h / 2, r, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.fillStyle = couleur;
        ctx.beginPath();
        ctx.arc(x + fs * 0.55, y + h / 2, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PRIN_COL_LABEL;
        ctx.textAlign = 'left';
        ctx.fillText(row.titre, x + fs * 0.55 + r + fs * 0.35, y + h / 2 + 0.5);
    }
    ctx.restore();
}

// ── Dessin complet ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
//  ██████╗  █████╗ ███████╗
//  ██╔════╝ ██╔══██╗╚══███╔╝
//  ██║  ███╗███████║  ███╔╝
//  ██║   ██║██╔══██║ ███╔╝
//  ╚██████╔╝██║  ██║███████╗
//   ╚═════╝ ╚═╝  ╚═╝╚══════╝
//  GAZ DE PARTICULES — représentation 'particules' / 'lesdeux'
//
//  Chaque bande devient un TUBE DE GAZ horizontal : les haut-parleurs y sont
//  des membranes qui poussent le fluide, le micro une membrane mise en
//  mouvement par la pression, et les interférences se lisent en zones de
//  compression et de détente.
//
//  Physique : identique à celle de l'onglet Son de la page Ondes
//  (ondes/js/tube.js + ondes/js/sim.js) — modèle lagrangien continu, une
//  particule = une parcelle de fluide, position affichée = position de repos
//  + déplacement du champ. Le code en est adapté, non partagé : aucune page
//  du site n'a de fichier commun avec une autre (cf. ARCHITECTURE.md).
//
//  Deux différences avec l'onglet Son, toutes deux des simplifications :
//   • pas d'historique de source (_srcPush/_srcSampleAtS) — ici λ et A sont
//     appliquées instantanément, comme partout dans cet onglet, et u est
//     analytique (cf. _prinU1/_prinU2) ;
//   • pas de curseur ρ ni K — la densité du nuage est fixée par la
//     géométrie seule.
//
//  Le basculement de représentation NE DÉPLACE RIEN : _prinLayout est
//  inchangé, les trois bandes, le couloir de cotes, le micro et les sources
//  gardent leur place au pixel près.
// ══════════════════════════════════════════════════════════════════════

// ── Couleurs ──────────────────────────────────────────────────────────
// Les particules d'une bande portent la couleur d'identité de sa ligne :
// c'est ce qui relie la bande à sa pastille de titre, à son guide vertical
// et à sa fenêtre d'oscilloscope, exactement comme la courbe le faisait.
var PRIN_GAZ_COL = [PRIN_COL_S1, PRIN_COL_S2, PRIN_COL_SOMME];

// Particules marquées par « Sélectionner des particules ». L'onglet Son les
// passe en brique (#b04020) sur un nuage bleu ; ici le nuage prend trois
// teintes, dont un orange — il faut donc une couleur qui se détache des
// TROIS. Le vert profond est la seule famille encore libre de la page :
// l'ocre est pris par les repères constructifs, le violet par les destructifs.
// Les particules marquées gardent EXACTEMENT le rayon des autres : ce sont
// les mêmes parcelles de fluide, seulement repeintes pour être suivies du
// regard. Les grossir en faisait des objets à part, et surtout gonflait
// artificiellement le paquet — donc l'étendue qu'on croit observer.
var PRIN_GAZ_COL_SEL = '#0e7a45';

// ── Calibrage de l'amplitude affichée ─────────────────────────────────
//
//  Ce qui rend une compression visible n'est pas l'amplitude seule mais le
//  produit A·k : c'est lui qui fixe le rapport de densité entre un cœur de
//  compression et un cœur de détente. L'onglet Son maintient ce produit
//  entre AK_MIN = 0,45 et AK_CAP = 0,75 (cf. ondes/js/sim.js) ; on vise ici
//  le même ordre de grandeur.
//
//  Le gain est calé sur A = 1 et appliqué À L'IDENTIQUE sur les trois
//  bandes — même doctrine que simPrin.ampPx pour les courbes. C'est tout
//  l'enjeu de la page : un ventre où la pression atteint A₁ + A₂ = 2 doit
//  vraiment montrer deux fois plus de contraste qu'une source seule, et
//  A₁ = 0 ne doit plus rien montrer du tout. Un gain auto-ajusté par bande
//  détruirait la comparaison.
//
//  Pourquoi 0,55 et pas 0,75 : le gain est calé sur A = 1, mais la ligne
//  somme monte à A = 2, donc à 2·A·k. Au-delà de A·k = π/2 ≈ 1,57 les
//  trajectoires de particules voisines se croisent (le champ se replie sur
//  lui-même) et le nuage produit des caustiques absurdes. 0,55 laisse la
//  somme à 1,10, avec de la marge.
var PRIN_GAZ_AK = 0.55;

// Plafond absolu, en fraction de la largeur de l'axe — contrepartie de
// SON_A_MAX_FRAC. Sans lui, à λ = 1,50 m le gaz balaierait un quart de
// l'écran : le mouvement d'ensemble masquerait la structure de l'onde.
var PRIN_GAZ_G_MAX_FRAC = 0.045;

// Gain d'affichage : px de déplacement par unité d'amplitude de pression.
function _prinGazGain() {
    var s = simPrin;
    var lamPx = s.lambda * s.pxPerM;
    var g = PRIN_GAZ_AK * lamPx / (2 * Math.PI);
    return Math.max(1.2, Math.min(g, s.plotW * PRIN_GAZ_G_MAX_FRAC));
}

// ── Grain du nuage ────────────────────────────────────────────────────
// Le rayon est indexé sur unitH et NON sur la hauteur de la bande : les
// trois bandes montrent le même gaz, la ligne somme en contient simplement
// deux fois plus de particules parce qu'elle est deux fois plus haute. Des
// particules plus grosses sur la somme se liraient comme un autre fluide.
//
// Le coefficient a été abaissé de 0,032 à 0,0224 (−30 %) : à l'ancien grain,
// une bande de compression ne comptait qu'une quinzaine d'espacements et les
// paquets restaient mous. Ce qui compte n'est pas le rayon en soi mais le
// rapport λ / espacement, et c'est lui qui décide si l'œil lit un
// regroupement franc ou une vague variation de gris.
function _prinGazRayon() {
    return Math.max(1.2, Math.min(2.95, simPrin.unitH * 0.0224));
}

// Plafond d'effectif, toutes bandes confondues. Aligné sur celui de l'onglet
// Son (8000 dans initCols) : au-delà, le coût des arcs se voit sur les
// portables de salle.
var PRIN_GAZ_N_MAX = 8000;

// ── Aire de « case » allouée à une particule ──────────────────────────
//
// Le facteur 9 reprend le calibrage de l'onglet Son, où l'espacement moyen
// vaut ≈ 3 × le rayon des points (COL_SLOT_PX2 = 113 px² pour r ≈ 3,5 px) :
// c'est le grain qui donne un gaz franchement granuleux sans jamais saturer
// en aplat.
//
// Le plafond d'effectif est appliqué ICI, en élargissant la case, et non par
// un écrêtage bande par bande : les trois bandes montrent le MÊME gaz, leur
// densité doit rester identique. Un plafond par bande écrêterait d'abord la
// ligne somme, deux fois plus peuplée, et elle apparaîtrait deux fois moins
// dense que les lignes sources — exactement le contresens à éviter.
//
// Comme la case s'élargit proportionnellement à ce que le plafond retire,
// l'espacement reste indexé sur la taille du canvas : le rapport λ/espacement,
// qui est ce qui compte, ne dépend pas de la fenêtre.
function _prinGazSlot() {
    var s = simPrin;
    var r = _prinGazRayon();
    var brut = 9 * r * r;
    // Hauteur cumulée des trois bandes : 1 + 1 + 2 unités.
    var hTot = 4 * s.unitH;
    if (s.plotW <= 0 || hTot <= 0) return brut;
    var nTot = s.plotW * hTot / brut;
    if (nTot > PRIN_GAZ_N_MAX) brut *= nTot / PRIN_GAZ_N_MAX;
    return brut;
}

// Espacement moyen entre deux particules (px) — sert au dosage du voile.
// Dérivé de la case EFFECTIVE (plafond compris), pas de 3·r : sinon le voile
// se doserait sur un grain plus fin que celui réellement affiché.
function _prinGazEspacement() { return Math.sqrt(_prinGazSlot()); }

// ── Construction du nuage ─────────────────────────────────────────────
//
//  Les positions de repos sont stockées EN MÈTRES, jamais en pixels — même
//  doctrine que simPrin.x1/x2/xM. Un redimensionnement ne régénère alors le
//  nuage que si le grain change réellement, et jamais parce que la fenêtre
//  a bougé de quelques pixels : une animation en cours n'est pas interrompue.
//
//  Le nuage couvre TOUTE la largeur de l'axe [0 ; 4 m], indépendamment de la
//  position des sources : déplacer S₁ ou S₂ ne le reconstruit donc pas, c'est
//  le clip au dessin qui restreint la portion visible (cf. _prinDrawGazBande).
function _prinGazInit() {
    var s = simPrin;
    if (s.plotW < 10 || s.unitH < 5 || !s.rows.length) return;

    var r    = _prinGazRayon();
    var slot = _prinGazSlot();
    // Signature : le grain et la largeur du domaine. Arrondie au pixel, pour
    // qu'un resize d'un demi-pixel (devicePixelRatio) ne déclenche rien.
    var sig = Math.round(s.plotW) + '|' + Math.round(s.unitH) + '|' + r.toFixed(2);
    if (sig === s.gazSig && s.gaz[0] && s.gaz[1] && s.gaz[2]) return;
    s.gazSig = sig;
    // Reconstruire, c'est retirer aux particules leur position de repos, donc
    // effacer la sélection de l'élève. On la relève avant, on la repose après
    // (même précaution que _colsSelectionSnapshot dans ondes/js/sim.js) : le
    // passage en plein écran pour le vidéoprojecteur est précisément le moment
    // où l'on vient de préparer un paquet de particules.
    var garde = _prinGazSelSnapshot();

    for (var b = 0; b < 3; b++) {
        var h = s.rows[b].half * 2;
        // L'effectif suit l'AIRE de la bande : la ligne somme, deux fois plus
        // haute, en reçoit naturellement deux fois plus, à densité égale. Le
        // plafond global est déjà pris en compte dans `slot` (cf.
        // _prinGazSlot) ; les bornes ci-dessous ne sont qu'un garde-fou.
        var n = Math.max(40, Math.min(5000, Math.round(s.plotW * h / slot)));

        // Ordre des ordonnées mélangé, pour que ry ne suive pas l'ordre des
        // x0 : sans cela, le nuage se lit comme une diagonale (cf. initCols).
        var ordre = new Array(n);
        for (var j = 0; j < n; j++) ordre[j] = j;
        for (var j = n - 1; j > 0; j--) {
            var k = Math.floor(Math.random() * (j + 1));
            var tmp = ordre[j]; ordre[j] = ordre[k]; ordre[k] = tmp;
        }

        // Grille jitterée (case régulière + bruit uniforme dedans) plutôt que
        // Math.random() pur : borne la lacune maximale et supprime les bandes
        // verticales vides visibles au repos.
        var arr = new Array(n);
        for (var i = 0; i < n; i++) {
            arr[i] = {
                x0 : (i + Math.random()) / n * PRIN_VIEW_WIDTH_M,   // MÈTRES
                ry : (ordre[i] + Math.random()) / n,
                wx : 0,     // errance thermique, en px (cf. _prinGazWander)
                wy : 0,
                sel: false  // marquée par « Sélectionner des particules »
            };
        }
        s.gaz[b] = arr;
    }
    _prinGazSelRestore(garde);

    // ── Gaz enfermé dans la cavité du micro ───────────────────────────
    // MÊME densité que le gaz ambiant au repos (ΔP = 0) : c'est tout le
    // sens de la cavité, et le nombre s'en déduit donc de son aire divisée
    // par la même case que les bandes.
    var geo = _prinMicGeo();
    var nMic = Math.max(4, Math.min(400, Math.round(geo.gazW * geo.gazH / slot)));
    var arrM = new Array(nMic);
    for (var m = 0; m < nMic; m++) {
        arrM[m] = { fx : Math.random(), ry : Math.random(), wx : 0, wy : 0 };
    }
    s.gazMic = arrM;
}

// ══════════════════════════════════════════════════════════════════════
//  SÉLECTION DE PARTICULES
//
//  Même principe que « Sélectionner des particules » de l'onglet Son
//  (ondes/js/sim.js → selectNearbyParticles) : en mode sélection, un clic
//  marque le paquet de particules voisin de l'abscisse cliquée, Ctrl+clic
//  ajoute un paquet, Maj+clic en retire un. Quitter le mode efface tout.
//
//  Deux adaptations propres à cet onglet :
//
//   • trois bandes. Le paquet est marqué dans la SEULE bande cliquée, comme
//     l'onglet Son ne marque que son unique tube. Marquer la même abscisse
//     sur les trois d'un coup serait tentant — on comparerait la même
//     tranche de gaz sous y₁ seule, y₂ seule et la superposition — mais un
//     clic sur la ligne 1 qui fait apparaître des marques sur la ligne 3
//     surprend plus qu'il n'aide. Trois clics suffisent à l'obtenir.
//
//   • le gaz enfermé dans la cavité du micro n'est JAMAIS sélectionnable
//     (simPrin.gazMic n'est pas touché ici, et ses particules n'ont même pas
//     de champ `sel`). Il n'est pas là pour être suivi : il est la référence
//     de pression, il doit rester le même quoi qu'on fasse.
// ══════════════════════════════════════════════════════════════════════

// ── Largeur du paquet marqué ──────────────────────────────────────────
//
//  Indexée sur λ et NON sur la largeur du canvas comme _prinGrabTol().
//  L'étalon pertinent n'est pas la taille de l'écran mais celle de la
//  structure qu'on observe : un paquet doit tenir ENTIER dans une zone de
//  même comportement, sinon il en enjambe deux et ne montre plus rien.
//
//  Le premier réglage (25 px de rayon, donc 50 px de large) valait 38 % de λ
//  aux réglages par défaut : à cheval sur un cœur de compression ET sur le
//  nœud voisin, il empêchait justement de voir les endroits où les molécules
//  ne font que se translater sans jamais se comprimer. À λ/12 de rayon, le
//  paquet fait λ/6 et tient dans la zone de détente d'un ventre de
//  déplacement (large d'environ λ/4).
//
//  Bornes : 7 px pour qu'il reste attrapable au doigt et qu'il contienne
//  toujours quelques dizaines de particules ; 20 px pour qu'aux grandes λ il
//  ne redevienne pas un pavé.
function _prinGazSelRadius() {
    return Math.max(7, Math.min(20, simPrin.lambda * simPrin.pxPerM / 12));
}

function _prinGazClearSel() {
    for (var b = 0; b < 3; b++) {
        var arr = simPrin.gaz[b];
        if (!arr) continue;
        for (var i = 0; i < arr.length; i++) arr[i].sel = false;
    }
}

// Le clic sélectionne-t-il, en ce moment ? Le mode ne vaut que là où un gaz
// est affiché : le bouton cède sa place à l'enveloppe en mode Signal, mais
// simPrin.selMode pourrait rester vrai si l'ordre des bascules s'y prêtait.
function _prinSelActive() {
    return simPrin.selMode && simPrin.repr !== 'signal';
}

// Relevé de la sélection, en intervalles de x0 — donc EN MÈTRES, et
// directement transposables à un nuage reconstruit : contrairement à
// _colsSelectionSnapshot (ondes), il n'y a rien à rapporter à une longueur de
// référence, les positions de repos ne sont déjà pas en pixels.
// Les tableaux sont remplis par x0 croissant, un simple balayage regroupe les
// voisines en paquets.
function _prinGazSelSnapshot() {
    var out = [[], [], []];
    for (var b = 0; b < 3; b++) {
        var arr = simPrin.gaz[b];
        if (!arr) continue;
        var run = null;
        for (var i = 0; i < arr.length; i++) {
            if (!arr[i].sel) continue;
            var x = arr[i].x0;
            if (run && (x - run.b) < 0.05) run.b = x;      // même paquet (5 cm)
            else { run = { a : x, b : x }; out[b].push(run); }
        }
    }
    return out;
}

function _prinGazSelRestore(garde) {
    if (!garde) return;
    for (var b = 0; b < 3; b++) {
        var arr = simPrin.gaz[b], runs = garde[b];
        if (!arr || !runs || !runs.length) continue;
        for (var i = 0; i < arr.length; i++) {
            for (var k = 0; k < runs.length; k++) {
                if (arr[i].x0 >= runs[k].a && arr[i].x0 <= runs[k].b) {
                    arr[i].sel = true;
                    break;
                }
            }
        }
    }
}

// Marque (ou démarque) le paquet voisin du point cliqué.
function _prinGazSelect(pxEcran, pyEcran, mods) {
    var s = simPrin;
    if (!s.rows.length) return;

    // Quelle bande ? Un clic entre deux bandes (gouttière) ne marque rien.
    var r = -1;
    for (var i = 0; i < 3; i++) {
        var row = s.rows[i];
        if (pyEcran >= row.y0 - row.half && pyEcran <= row.y0 + row.half) { r = i; break; }
    }
    if (r < 0) return;
    var arr = s.gaz[r];
    if (!arr) return;

    var ctrl = mods && mods.ctrl, shift = mods && mods.shift;
    // Clic sans modifieur : on repart de zéro, sur les TROIS bandes.
    if (!ctrl && !shift) _prinGazClearSel();

    var g = _prinGazGain(), fu = _prinGazDepl(r, s.simTime);
    var bornes = _prinGazBoundsM(r);

    // Particule AFFICHÉE la plus proche du clic, et non conversion directe de
    // l'abscisse écran : l'onde a déplacé les particules, remonter par
    // _prinXm() désignerait la position de repos d'une autre parcelle.
    var best = -1, bestD = Infinity;
    for (var j = 0; j < arr.length; j++) {
        var x0 = arr[j].x0;
        if (x0 < bornes[0] || x0 > bornes[1]) continue;
        var d = Math.abs(_prinXpx(x0) + fu(x0) * g - pxEcran);
        if (d < bestD) { bestD = d; best = j; }
    }
    // Clic manifestement à côté de tout (derrière une membrane, hors du gaz) :
    // on ne marque rien — la remise à zéro éventuelle a déjà eu lieu.
    if (best < 0 || bestD > _prinGazSelRadius()) return;

    var x0Clic = arr[best].x0;
    var rayonM = _prinGazSelRadius() / s.pxPerM;
    for (var k = 0; k < arr.length; k++) {
        if (Math.abs(arr[k].x0 - x0Clic) <= rayonM) arr[k].sel = !shift;
    }
}

// ── Agitation thermique ───────────────────────────────────────────────
//
//  Marche aléatoire 2D rappelée autour de la position de repos, reprise de
//  ondes/js/tube.js (_wander) avec ses deux enseignements :
//
//   • elle est ISOTROPE — une errance plus ample en vertical qu'en
//     horizontal ne se lit pas comme de l'agitation thermique mais comme de
//     la pluie ;
//   • son amplitude est bornée par un budget de flou explicite, indexé sur λ.
//
//  Le facteur de vitesse est indispensable : la boucle tourne à ~60 fps quel
//  que soit le ralenti, seul simTime est ralenti. Sans lui, l'onde
//  ralentirait et le gaz non.
//
//  ── Ce qui masque le mouvement d'ensemble : le PAS, pas l'amplitude ──
//
//  Une onde stationnaire a des ventres de DÉPLACEMENT (les nœuds de
//  pression, donc les interférences destructives) où le gaz oscille en bloc
//  sans changer de densité. Le seul indice y est ce mouvement d'ensemble —
//  et l'œil sait très bien le voir dans un champ de points aléatoires, à
//  condition qu'il ressorte du bruit.
//
//  Le premier réglage (repris tel quel de l'onglet Son) ne le permettait
//  pas. Ce qui compte n'est pas l'amplitude de l'errance mais son INCRÉMENT
//  PAR FRAME, à comparer à la vitesse de l'onde :
//
//      mouvement cohérent au ventre  ≈ 1,12 px/frame (RMS, réglages défaut)
//      pas de l'errance              ≈ 1,30 px/frame (σ)
//
//  Le bruit était plus grand que le signal : le ballottement n'était pas
//  difficile à voir, il était noyé. (Le rapport ne dépend pas du ralenti :
//  speedFactor multiplie déjà les deux.)
//
//  Les deux grandeurs se règlent SÉPARÉMENT, puisque
//      σ_stationnaire = σ_pas / √(2·pull).
//  On baisse donc à la fois l'amplitude (×0,4) et le rappel : l'errance
//  devient plus lente et plus douce, le gaz reste vivant, et le pas tombe à
//  ≈ 0,42 px/frame — le mouvement cohérent passe devant, d'un facteur ~2,7.
//  Rétrécir la seule amplitude à rappel constant aurait gardé un
//  scintillement, simplement plus serré.

// Écart-type stationnaire visé, en fractions de λ (≈ 2,5 px aux réglages par
// défaut). Le contraste des bandes de compression perd alors exp(−2π²σ²/λ²),
// soit moins de 1 % : le budget de flou est très large, ce n'est pas lui qui
// contraint le réglage.
var PRIN_GAZ_W_SIG_LAM = 1 / 52;
// Rappel vers la position de repos. Temps de relaxation 1/pull ≈ 71 frames
// (~1,2 s) : assez lent pour que l'errance ne scintille pas, assez rapide
// pour qu'elle ne se lise pas comme une dérive d'ensemble.
var PRIN_GAZ_W_PULL  = 0.014;
// Borne dure des excursions, en multiples de σ.
var PRIN_GAZ_W_CLAMP = 3.0;

// Écart-type stationnaire de l'errance (px). Borné aussi par la hauteur de
// bande : sur un volet écrasé, une errance calée sur λ seule sortirait des
// parois en permanence et le repliement ferait tout le travail.
function _prinGazWanderSigma() {
    var s = simPrin;
    var parBande = Math.max(1.0, Math.min(4.5, s.unitH * 0.028));
    return Math.max(0.6, Math.min(parBande, s.lambda * s.pxPerM * PRIN_GAZ_W_SIG_LAM));
}

// Largeur du tirage uniforme par frame donnant l'écart-type stationnaire
// voulu : σ_pas = σ_stat·√(2·pull) et un tirage uniforme de largeur w a pour
// écart-type w/√12, d'où w = σ_stat·√(24·pull).
function _prinGazWanderStep(sigma) {
    return sigma * Math.sqrt(24 * PRIN_GAZ_W_PULL);
}

function _prinGazWander(c, step, max, spd) {
    var pull = PRIN_GAZ_W_PULL * spd;
    c.wy += (Math.random() - 0.5) * step * spd - c.wy * pull;
    if      (c.wy >  max) c.wy =  max;
    else if (c.wy < -max) c.wy = -max;
    c.wx += (Math.random() - 0.5) * step * spd - c.wx * pull;
    if      (c.wx >  max) c.wx =  max;
    else if (c.wx < -max) c.wx = -max;
}

// Rencontre d'une paroi : REBOND, pas écrasement. Un simple clamp empile les
// particules sur deux droites et borde la bande de deux liserés sombres qui
// ne disent rien de l'onde (cf. _foldY, ondes/js/tube.js). Repliement itéré
// (triangle) : une bande très basse peut être plus courte que l'excursion.
function _prinGazFold(py, yMin, yMax) {
    var span = yMax - yMin;
    if (span <= 0) return yMin;
    var t = (py - yMin) % (2 * span);
    if (t < 0) t += 2 * span;
    return yMin + (t <= span ? t : 2 * span - t);
}

// ── Champs par bande ──────────────────────────────────────────────────
// Déplacement du gaz (u.a.) — à multiplier par _prinGazGain() pour des px.
function _prinGazDepl(r, t) {
    if (r === 0) return function (x) { return _prinU1(x, t); };
    if (r === 1) return function (x) { return _prinU2(x, t); };
    return function (x) { return _prinU1B(x, t) + _prinU2B(x, t); };
}

// Surpression (u.a.) — ce sont EXACTEMENT les courbes déjà tracées : la
// densité et la pression étant en phase, le voile ci-dessous s'en sert
// directement, sans différence finie ni second modèle à tenir d'accord.
function _prinGazPres(r, t) {
    if (r === 0) return function (x) { return _prinY1Libre(x, t); };
    if (r === 1) return function (x) { return _prinY2Libre(x, t); };
    return function (x) { return _prinY1(x, t) + _prinY2(x, t); };
}

// Surpression maximale possible sur la bande — sert à normaliser le voile.
function _prinGazPresMax(r) {
    if (r === 0) return simPrin.a1;
    if (r === 1) return simPrin.a2;
    return simPrin.a1 + simPrin.a2;
}

// ── Étendue du gaz sur une bande, en mètres ───────────────────────────
// Le gaz est borné par ce qui le contient : la source de la bande d'un côté,
// le bord de l'axe (ou l'autre source, ligne somme) de l'autre. Reprend
// _prinRowBoundsM, donc l'option « Masquer l'onde au-delà du microphone »
// vide bien la portion masquée.
function _prinGazBoundsM(r) {
    var s = simPrin, b = _prinRowBoundsM(r);
    if (r === 0) return [s.x1, b[1]];
    if (r === 1) return [b[0], s.x2];
    return [s.x1, s.x2];
}

// ── Voile de densité ──────────────────────────────────────────────────
//
//  Un halo dans la couleur des particules sous les cœurs de compression. Il
//  ne code pas une grandeur de plus : il redit en aplat ce que le nuage dit
//  déjà — « il y a du monde ici » — mais lisible d'un coup d'œil.
//
//  Unilatéral (compressions seules) : ne teinter qu'un côté laisse les
//  détentes se lire d'elles-mêmes comme les zones restées claires, au lieu
//  d'introduire un second code couleur concurrent.
//
//  ── Pourquoi il est indispensable ici ────────────────────────────────
//  Le curseur λ descend à 0,20 m, soit à peine 5 % de la largeur de l'axe :
//  une bande de compression y fait λ/2 ≈ 22 px pour un grain de nuage de
//  ~8 px, c'est-à-dire deux à trois espacements. Le nuage est à sa limite de
//  résolution et aucun réglage d'amplitude n'y changera rien ; le voile, lui,
//  est un champ continu et résout parfaitement ces échelles.
//
//  Il est donc DOSÉ sur λ mesurée en espacements — inexistant au réglage par
//  défaut (λ ≈ 16 espacements, les particules suffisent), franc en bas de
//  plage. Le passage entre les deux régimes est lissé (smoothstep), sans quoi
//  le fond changerait visiblement d'aspect au franchissement d'un seuil.
//
//  Le genou reste HAUT même en régime serré : ne marquer que les cœurs de
//  compression donne des taches douces qui se lisent comme un effet du
//  milieu, là où un genou bas donne des bandes régulières qui se lisent
//  comme un décor peint.
var PRIN_GAZ_SP_COMFY = 13.2;   // λ en espacements : au-delà, le nuage suffit
var PRIN_GAZ_SP_TIGHT = 4.2;    // ... en deçà, le voile porte tout
var PRIN_GAZ_KNEE_LO  = 0.55;   // seuil de ΔP en régime confortable
var PRIN_GAZ_KNEE_HI  = 0.45;   // ... et en régime serré
var PRIN_GAZ_TINT_LO  = 0.14;   // teinte maximale en régime confortable
var PRIN_GAZ_TINT_HI  = 0.24;   // ... et en régime serré

function _prinSmoothstep01(u) {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    return u * u * (3 - 2 * u);
}

// Manque de résolution du nuage : 0 = confortable, 1 = aussi serré que possible.
function _prinGazSerre() {
    var lamSp = (simPrin.lambda * simPrin.pxPerM) / _prinGazEspacement();
    return _prinSmoothstep01((PRIN_GAZ_SP_COMFY - lamSp) /
                             (PRIN_GAZ_SP_COMFY - PRIN_GAZ_SP_TIGHT));
}

// Décomposition d'un '#rrggbb' — les couleurs d'identité sont écrites en hexa.
function _prinHexRGB(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function _prinDrawGazVoile(ctx, r, x0px, x1px, yTop, h, t) {
    var span = x1px - x0px;
    if (span <= 1 || h <= 0) return;

    var tight = _prinGazSerre();
    if (tight <= 0.001) return;          // le nuage se suffit : rien à peindre

    var knee = PRIN_GAZ_KNEE_LO + tight * (PRIN_GAZ_KNEE_HI - PRIN_GAZ_KNEE_LO);
    var tint = PRIN_GAZ_TINT_LO + tight * (PRIN_GAZ_TINT_HI - PRIN_GAZ_TINT_LO);

    var pMax = _prinGazPresMax(r);
    if (pMax <= 1e-6) return;            // amplitude nulle : aucune compression
    var fp = _prinGazPres(r, t);

    // Teinte posée en TRANSPARENCE et non en aplat opaque : la bande porte
    // déjà sa grille verticale (tous les 0,5 m, sur toute sa hauteur), et un
    // aplat, fût-il de la couleur exacte du fond, l'effacerait sous le voile.
    var teinte = _prinHexRGB(PRIN_GAZ_COL[r]);
    var rgb = teinte[0] + ',' + teinte[1] + ',' + teinte[2] + ',';

    // Finesse d'échantillonnage indexée sur λ : ~14 arrêts par longueur d'onde.
    // À nombre d'arrêts fixe, une petite λ ne recevrait que trois points par
    // alternance et le dégradé rendrait un moiré au lieu des bandes.
    var lamPx = simPrin.lambda * simPrin.pxPerM;
    var nb = (lamPx > 0) ? Math.round(span / lamPx * 14) : 200;
    nb = Math.max(120, Math.min(1200, nb));

    var grad = ctx.createLinearGradient(x0px, 0, x1px, 0);
    for (var i = 0; i <= nb; i++) {
        var frac = i / nb;
        var dp = fp(_prinXm(x0px + frac * span)) / pMax;
        var a = 0;
        if (dp > knee) {
            var u = Math.min(1, (dp - knee) / (1 - knee));
            a = u * u * (3 - 2 * u) * tint;
        }
        grad.addColorStop(frac, 'rgba(' + rgb + a.toFixed(3) + ')');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(x0px, yTop, span, h);
}

// ── Le gaz d'une bande ────────────────────────────────────────────────
// Voile de densité, puis le nuage. Tout est clippé à l'étendue du gaz : les
// particules ne débordent ni sur la gouttière ni au-delà des membranes, que
// l'on dessine ensuite par-dessus.
// Tampon plat [x, y, x, y, …] des particules marquées de la bande en cours.
// Réutilisé d'une frame à l'autre : à 60 fps, allouer un tableau par bande et
// par frame donnerait au ramasse-miettes de quoi hoqueter en pleine animation.
var _prinGazSelBuf = [];

function _prinDrawGazBande(ctx, r, t) {
    var s = simPrin, row = s.rows[r], arr = s.gaz[r];
    if (!arr) return;

    var bounds = _prinGazBoundsM(r);
    var rad  = _prinGazRayon();
    var yTop = row.y0 - row.half, hB = row.half * 2;
    var g    = _prinGazGain();
    var fu   = _prinGazDepl(r, t);

    // ── Bords du gaz ──────────────────────────────────────────────────
    // Là où une membrane borne la bande, le bord SUIT sa face : le clip doit
    // se déplacer avec elle, sinon le fluide qu'elle pousse se fait couper
    // (ou découvre une bande vide) de tout son débattement. Là où le gaz
    // s'arrête sur le bord de la vue — extrémité libre des lignes 1 et 2, ou
    // coupure du micro masqué — le bord reste fixe.
    var memG = (r === 0 || r === 2);      // S₁ borne la gauche
    var memD = (r === 1 || r === 2);      // S₂ borne la droite
    var x0px = _prinXpx(bounds[0]) + (memG ? fu(bounds[0]) * g : 0);
    var x1px = _prinXpx(bounds[1]) + (memD ? fu(bounds[1]) * g : 0);
    if (x1px - x0px < 2) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0px, yTop, x1px - x0px, hB);
    ctx.clip();

    _prinDrawGazVoile(ctx, r, x0px, x1px, yTop, hB, t);

    var wA  = _prinGazWanderSigma();
    var wSt = _prinGazWanderStep(wA), wMx = wA * PRIN_GAZ_W_CLAMP;
    var bouge = !s.paused;
    var spd   = s.speedFactor;

    // Bande utile : le rayon du point est gardé de chaque côté, et l'errance
    // y est ramenée par repliement (cf. _prinGazFold) plutôt qu'en lui
    // réservant une marge — une particule a le droit d'aller toucher la paroi.
    var yBand = Math.max(0, hB - 2 * rad);
    var yMin  = yTop + rad, yMax = yTop + hB - rad;

    // Un seul beginPath pour tout le nuage : le coût est dans les changements
    // d'état du contexte, pas dans les arcs. Les particules marquées sont
    // MISES DE CÔTÉ au passage plutôt que redessinées dans une seconde boucle
    // — l'errance doit être avancée exactement une fois par frame et par
    // particule, une seconde boucle la ferait courir deux fois plus vite.
    var nSel = 0;
    ctx.fillStyle = PRIN_GAZ_COL[r];
    ctx.beginPath();
    for (var i = 0; i < arr.length; i++) {
        var c = arr[i];
        // Hors de l'étendue du gaz : le nuage couvre tout l'axe pour ne pas
        // avoir à être reconstruit quand une source bouge (cf. _prinGazInit),
        // c'est ici qu'on écarte ce qui est derrière une membrane. Le clip
        // n'y suffirait pas : une particule au repos juste derrière S₁ tombe
        // du bon côté du bord dès que la membrane recule.
        if (c.x0 < bounds[0] || c.x0 > bounds[1]) continue;
        if (bouge) _prinGazWander(c, wSt, wMx, spd);
        var px = _prinXpx(c.x0) + fu(c.x0) * g + c.wx;
        var py = yTop + rad + c.ry * yBand + c.wy;
        if (py < yMin || py > yMax) py = _prinGazFold(py, yMin, yMax);
        if (c.sel) { _prinGazSelBuf[nSel++] = px; _prinGazSelBuf[nSel++] = py; continue; }
        ctx.moveTo(px + rad, py);        // évite les traits parasites entre arcs
        ctx.arc(px, py, rad, 0, Math.PI * 2);
    }
    ctx.fill();

    // Particules marquées, par-dessus le nuage — même rayon, autre couleur.
    if (nSel) {
        ctx.fillStyle = PRIN_GAZ_COL_SEL;
        ctx.beginPath();
        for (var k = 0; k < nSel; k += 2) {
            ctx.moveTo(_prinGazSelBuf[k] + rad, _prinGazSelBuf[k + 1]);
            ctx.arc(_prinGazSelBuf[k], _prinGazSelBuf[k + 1], rad, 0, Math.PI * 2);
        }
        ctx.fill();
    }
    ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════
//  MEMBRANES
// ══════════════════════════════════════════════════════════════════════

// Épaisseur d'une membrane de source, et largeur de la caisse derrière elle.
function _prinMemEp()     { return Math.max(3, simPrin.srcH * 0.30); }
function _prinCaisseW()   { return Math.max(10, simPrin.srcH * 0.95); }

// ── Membrane d'une source ─────────────────────────────────────────────
//
//  `sens` = +1 pour S₁ (elle pousse le gaz vers la droite, sa face active est
//  à droite), −1 pour S₂. `dispPx` est le déplacement de la membrane, donc
//  du même signe que u à l'abscisse de la source : positif vers +x.
//
//  La caisse SUIT la face de la membrane (elle n'est pas un rectangle fixe) :
//  sinon, quand la membrane avance, elle laisse derrière elle une bande de
//  fond nu large de tout son débattement.
//
//  Le libellé et l'ergot de position restent à l'abscisse EXACTE de la
//  source, jamais sur la membrane qui bouge — sans quoi la cote S₁M
//  paraîtrait respirer au rythme de l'onde.
function _prinDrawMembraneSrc(ctx, row, xpx, dispPx, sens, color, label) {
    var lw = _prinLW();
    var ep = _prinMemEp(), wc = _prinCaisseW();
    var yTop = row.y0 - row.half, h = row.half * 2;

    var face = xpx + dispPx;                       // face active
    var mx   = (sens > 0) ? face - ep : face;      // bord gauche de la membrane
    var cx0  = (sens > 0) ? xpx - wc : mx + ep;    // caisse : du fond à la membrane
    var cx1  = (sens > 0) ? mx : xpx + wc;

    ctx.save();

    // Caisse — même famille de gris métallique que _prinDrawHautParleur.
    if (cx1 - cx0 > 0.5) {
        var gc = ctx.createLinearGradient(0, yTop, 0, yTop + h);
        gc.addColorStop(0,   '#c8d2da');
        gc.addColorStop(0.5, '#eef3f6');
        gc.addColorStop(1,   '#8a99a6');
        ctx.fillStyle = gc;
        ctx.fillRect(cx0, yTop, cx1 - cx0, h);
        ctx.strokeStyle = '#5a6a78';
        ctx.lineWidth = 1 * lw;
        ctx.strokeRect(cx0, yTop, cx1 - cx0, h);

        // Pictogramme de haut-parleur au dos de la caisse — c'est lui qui dit
        // « source » : une membrane nue se lirait comme une simple paroi.
        var pw = Math.abs(cx1 - cx0);
        var sy = Math.min(pw * 0.34, h * 0.16, 13 * lw);
        if (sy > 3) {
            var pcx = (cx0 + cx1) / 2, pcy = yTop + h / 2;
            ctx.save();
            ctx.translate(pcx, pcy);
            ctx.scale(sens, 1);
            ctx.fillStyle = '#5a6a78';
            ctx.fillRect(-sy * 0.55, -sy * 0.40, sy * 0.4, sy * 0.8);
            ctx.beginPath();
            ctx.moveTo(-sy * 0.15, -sy * 0.40);
            ctx.lineTo( sy * 0.55, -sy * 0.85);
            ctx.lineTo( sy * 0.55,  sy * 0.85);
            ctx.lineTo(-sy * 0.15,  sy * 0.40);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    // Membrane — couleur d'identité de la source, comme le pavillon l'est
    // pour le haut-parleur du mode Signal : c'est l'organe actif.
    var gm = ctx.createLinearGradient(mx, 0, mx + ep, 0);
    if (sens > 0) { gm.addColorStop(0, '#7d8c99'); gm.addColorStop(1, color); }
    else          { gm.addColorStop(0, color);     gm.addColorStop(1, '#7d8c99'); }
    ctx.fillStyle = gm;
    ctx.fillRect(mx, yTop, ep, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2 * lw;
    ctx.beginPath();
    ctx.moveTo(face, yTop);
    ctx.lineTo(face, yTop + h);
    ctx.stroke();

    ctx.restore();

    _prinText(ctx, label, xpx, row.y0 + simPrin.srcH * 0.80, color,
              'bold ' + (_prinFont() * 1.05) + 'px "Segoe UI", Arial, sans-serif',
              'center', 'top', PRIN_COL_BAND);
}

// ── Membrane du micro ─────────────────────────────────────────────────
//
//  Une membrane HORIZONTALE encastrée sur une cavité rigide et scellée, dont
//  le centre est exactement le point M. Elle s'enfonce dans la cavité quand
//  le gaz se comprime au-dessus d'elle, et se bombe vers l'extérieur quand
//  il se raréfie.
//
//  ── Pourquoi la déformation est PERPENDICULAIRE au mouvement du gaz ──
//
//  Une première version faisait coulisser une membrane verticale selon x,
//  comme un piston. Deux défauts, tous deux sérieux :
//
//   • une barre mince avec du gaz DES DEUX CÔTÉS subit la même pression sur
//     ses deux faces et ne devrait pas bouger. L'objet dessiné était
//     mécaniquement incohérent, et l'élève avait raison de ne pas y croire.
//     D'où la cavité scellée : c'est elle, à pression de référence, qui fait
//     qu'une membrane répond à ΔP ;
//   • surtout, elle se déplaçait dans la MÊME direction que le ballottement
//     des particules. Cela ne brouillait pas seulement la lecture : cela
//     suggérait que le micro SUIT LE FLUX, c'est-à-dire précisément l'idée à
//     détruire. Une membrane qui se bombe dit « quelque chose appuie
//     dessus » ; une membrane qui glisse dit « quelque chose l'emporte ».
//
//  La pression étant un scalaire, presser perpendiculairement est tout aussi
//  juste — et les deux mouvements, désormais orthogonaux, se lisent sans se
//  gêner.
//
//  Effet de bord bienvenu : à la position par défaut (x_M = 2,00 m, δ = 0) le
//  micro est sur un ventre de pression, donc sur un nœud de DÉPLACEMENT — le
//  gaz y est rigoureusement immobile. Avec une membrane qui coulissait, la
//  toute première image montrait un objet qui glisse au milieu de particules
//  figées, le cas le plus déroutant possible. Avec une membrane qui se bombe,
//  il n'y a plus de paradoxe apparent : le gaz se comprime SUR elle.
//
//  ── Largeur et échantillonnage ───────────────────────────────────────
//  La flèche est calculée à partir de la pression au SEUL centre : la largeur
//  du dessin est picturale, elle ne moyenne rien. C'est le choix simple et
//  stable ; il suppose, comme pour tout micro réel, que le capteur reste
//  petit devant λ — ce qui cesse d'être vrai en bas de la plage (λ = 0,20 m
//  ne fait que ~45 px à l'écran).

// Flèche de la membrane, en px par unité de surpression. Indexée sur la
// taille du pictogramme et NON sur λ : la réponse d'un micro à une pression
// donnée ne dépend pas de la longueur d'onde.
//
// Abaissée de 0,30 à 0,20 en même temps que la membrane descendait sous
// l'axe (cf. PRIN_MIC_DECALAGE), pour deux raisons liées :
//  • le bombement vers l'extérieur doit rester sous l'axe — à 0,20·micH la
//    flèche maximale (p = 2) vaut 0,40·micH, sous les 0,50·micH du décalage ;
//  • la cavité s'est raccourcie d'autant, et une membrane qui s'enfonce de
//    la moitié de la profondeur disponible écraserait le gaz de référence
//    qu'elle est censée laisser tranquille.
// La lisibilité n'y perd rien : la corde s'est élargie de 25 % dans le même
// temps, et c'est le rapport flèche/corde qui fait la courbure perçue.
function _prinMicGain() { return simPrin.micH * 0.20; }

// ── Géométrie de la cavité ────────────────────────────────────────────
// Source unique, partagée par le rendu et par _prinGazInit, qui doit compter
// les particules à y enfermer. Tout est relatif à l'abscisse du micro, que
// l'appelant ajoute — la géométrie, elle, n'en dépend pas.
function _prinMicGeo() {
    var s = simPrin;
    var h  = s.micH;
    var yAxe = (s.rows.length > 2) ? s.rows[2].y0 : 0;
    var y0  = yAxe + h * PRIN_MIC_DECALAGE;     // repos de la membrane, SOUS l'axe
    var mur = Math.max(2, h * 0.16);
    var yP  = yAxe + h * PRIN_MIC_BAS_RATIO;    // fond extérieur — INCHANGÉ
    // Largeur élargie de 25 % : la courbure d'une membrane se lit d'autant
    // mieux que sa corde est longue, et l'élargissement rend aussi la cavité
    // assez large pour y montrer un gaz malgré son raccourcissement.
    var w   = Math.max(20, h * 1.5625);         // largeur utile de la membrane
    // Retrait des parois pour le gaz enfermé. Il est dans la géométrie, et non
    // dans le seul code de rendu, parce que c'est l'aire RÉELLEMENT occupée
    // qui doit servir à compter les particules : les compter sur l'aire brute
    // de la cavité puis les tasser dans une boîte plus petite les rendrait
    // une fois et demie plus denses que le gaz ambiant — l'exact contraire de
    // ce que la cavité doit montrer.
    var ins = _prinGazRayon() + mur * 0.25;
    return {
        h    : h,
        w    : w,
        mur  : mur,
        y0   : y0,                              // repos de la membrane : sur l'axe
        yP   : yP,
        yBas : yP - mur,                        // fond INTÉRIEUR de la cavité
        ins  : ins,
        // Boîte utile du gaz enfermé, au repos (membrane plate).
        gazW : Math.max(0, w - 2 * ins),
        gazH : Math.max(0, yP - mur - y0 - 2 * ins)
    };
}

// Ordonnée de la membrane à la fraction t ∈ [0,1] de sa largeur.
// La quadratique a son point de contrôle à l'abscisse MÉDIANE, donc x(t) est
// exactement linéaire et t se confond avec la fraction de largeur ; il reste
//     y(t) = y0 + 4·flèche·t·(1−t)
// dont le maximum, en t = ½, vaut bien y0 + flèche.
function _prinMicMembraneY(y0, flechePx, t) {
    return y0 + 4 * flechePx * t * (1 - t);
}

// ── Gaz enfermé dans la cavité ────────────────────────────────────────
//
//  La cavité est scellée : le gaz qu'elle contient reste à la pression de
//  REPOS, quoi qu'il arrive dehors. Ce n'est pas un ornement — c'est la
//  raison même pour laquelle la membrane bouge. Un capteur de pression ne
//  mesure pas « la pression », il mesure un ÉCART à une référence, et cette
//  référence est là, visible : un gaz dont la densité ne change jamais,
//  contre lequel se lit la compression du dehors.
//
//  Densité identique à celle du gaz ambiant au repos (même case, cf.
//  _prinGazInit) : c'est ce qui rend la comparaison lisible. Teinté en
//  PRIN_COL_M, la couleur d'identité du micro — il appartient à l'appareil,
//  pas à la bande.
//
//  Les ordonnées sont rapportées à la membrane COURANTE et non à l'axe : le
//  volume se réduit un peu quand elle s'enfonce, et le gaz s'y resserre
//  d'autant. C'est physiquement juste (une cavité fermée dont une paroi
//  avance se comprime), et surtout ça évite que des particules disparaissent
//  sous le couvercle à chaque compression.
function _prinDrawGazMic(ctx, geo, xpx, flechePx) {
    var arr = simPrin.gazMic;
    if (!arr || !arr.length) return;

    var rad = _prinGazRayon();
    var ins = geo.ins;
    var xL  = xpx - geo.w / 2 + ins, xR = xpx + geo.w / 2 - ins;
    var yBas = geo.yBas - ins;
    if (xR - xL < 2) return;

    var sig  = _prinGazWanderSigma();
    var step = _prinGazWanderStep(sig), max = sig * PRIN_GAZ_W_CLAMP;
    var bouge = !simPrin.paused;
    var spd   = simPrin.speedFactor;

    ctx.save();
    ctx.fillStyle = PRIN_COL_M;
    ctx.beginPath();
    for (var i = 0; i < arr.length; i++) {
        var c = arr[i];
        if (bouge) _prinGazWander(c, step, max, spd);
        var px = xL + c.fx * (xR - xL) + c.wx;
        var yHaut = _prinMicMembraneY(geo.y0, flechePx, c.fx) + ins;
        var py = yHaut + c.ry * Math.max(0, yBas - yHaut) + c.wy;
        // Repliement dans la cavité — un rebond sur la paroi, pas un
        // écrasement contre elle (cf. _prinGazFold).
        px = _prinGazFold(px, xL, xR);
        py = _prinGazFold(py, yHaut, Math.max(yHaut, yBas));
        ctx.moveTo(px + rad, py);
        ctx.arc(px, py, rad, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
}

function _prinDrawMembraneMicro(ctx, row, xpx, flechePx, h, label) {
    var lw = _prinLW();
    var geo = _prinMicGeo();
    var w    = geo.w;                           // largeur utile de la membrane
    var mur  = geo.mur;                         // épaisseur des parois
    var y0   = geo.y0;                          // repos de la membrane, sous l'axe
    var yP   = geo.yP;                          // fond de la cavité — INCHANGÉ
    var xL   = xpx - w / 2, xR = xpx + w / 2;
    var xLe  = xL - mur,    xRe = xR + mur;     // parois extérieures

    // Point de contrôle d'une quadratique : la flèche au milieu vaut la
    // moitié de son ordonnée, d'où le facteur 2. Positive vers le BAS (dans
    // la cavité) : c'est le sens d'une compression.
    var yc = y0 + 2 * flechePx;

    // Contour de la cavité, couvercle déformé compris. Tracé d'une pièce pour
    // que le volume reste fermé quand la membrane se bombe vers le haut : la
    // portion au-dessus de l'axe appartient alors à la cavité, pas au gaz.
    function cavite() {
        ctx.beginPath();
        ctx.moveTo(xLe, y0);
        ctx.lineTo(xL, y0);
        ctx.quadraticCurveTo(xpx, yc, xR, y0);
        ctx.lineTo(xRe, y0);
        ctx.lineTo(xRe, yP - mur);
        ctx.quadraticCurveTo(xRe, yP, xRe - mur, yP);
        ctx.lineTo(xLe + mur, yP);
        ctx.quadraticCurveTo(xLe, yP, xLe, yP - mur);
        ctx.closePath();
    }

    ctx.save();
    ctx.lineJoin = 'round';

    // 1. Liseré couleur bande sous tout le boîtier : il reste net là où le gaz
    //    et la courbe lui passent dessus.
    ctx.strokeStyle = PRIN_COL_BAND;
    ctx.lineWidth = 4 * lw;
    cavite();
    ctx.stroke();

    // 2. Corps de la cavité — gris métallique, opaque : c'est un volume
    //    SCELLÉ, aucune particule ne doit se voir au travers.
    var gc = ctx.createLinearGradient(xLe, 0, xRe, 0);
    gc.addColorStop(0,    '#9fadb8');
    gc.addColorStop(0.32, '#eef3f6');
    gc.addColorStop(0.75, '#c8d2da');
    gc.addColorStop(1,    '#7d8c99');
    ctx.fillStyle = gc;
    cavite();
    ctx.fill();
    ctx.strokeStyle = '#5a6a78';
    ctx.lineWidth = 1.2 * lw;
    ctx.stroke();

    // 3. Vide intérieur, en creux sombre : sans lui la cavité se lit comme un
    //    bloc plein, et une membrane posée sur du plein ne peut pas s'enfoncer.
    var mi = mur * 0.9;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xL + mi * 0.2, y0 + mi * 0.2);
    ctx.quadraticCurveTo(xpx, yc + mi * 0.2, xR - mi * 0.2, y0 + mi * 0.2);
    ctx.lineTo(xR - mi * 0.2, yP - mur - mi * 0.2);
    ctx.lineTo(xL + mi * 0.2, yP - mur - mi * 0.2);
    ctx.closePath();
    ctx.fillStyle = '#dfe6ea';
    ctx.fill();
    ctx.strokeStyle = 'rgba(90, 106, 120, 0.45)';
    ctx.lineWidth = 1 * lw;
    ctx.stroke();
    // Le gaz de référence, dessiné DANS ce creux : on garde le clip du vide
    // intérieur, si bien qu'aucune particule ne déborde sur les parois ni
    // au-dessus de la membrane, quelle que soit sa déformation.
    ctx.clip();
    _prinDrawGazMic(ctx, geo, xpx, flechePx);
    ctx.restore();

    // 4. Mors d'encastrement, aux deux extrémités de la membrane : ils disent
    //    qu'elle est TENUE là, donc qu'elle se déforme au lieu de se déplacer.
    ctx.fillStyle = '#5a6a78';
    var em = Math.max(2, h * 0.20);
    _prinRoundRect(ctx, xLe, y0 - em / 2, mur + em * 0.35, em, em * 0.35);
    ctx.fill();
    _prinRoundRect(ctx, xRe - mur - em * 0.35, y0 - em / 2, mur + em * 0.35, em, em * 0.35);
    ctx.fill();

    // 5. La membrane — seul élément en couleur d'identité de M, et seul
    //    élément qui bouge, comme le pavillon l'est pour une source.
    ctx.strokeStyle = PRIN_COL_M;
    ctx.lineWidth = Math.max(2, h * 0.17);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(xL, y0);
    ctx.quadraticCurveTo(xpx, yc, xR, y0);
    ctx.stroke();
    // Reflet, pour que la courbure se lise même quand la flèche est faible.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.lineWidth = Math.max(0.8 * lw, h * 0.05);
    ctx.beginPath();
    ctx.moveTo(xL + w * 0.12, y0 - h * 0.03);
    ctx.quadraticCurveTo(xpx, yc - h * 0.03, xR - w * 0.12, y0 - h * 0.03);
    ctx.stroke();

    // 6. Repère du point M : la mesure se rapporte au CENTRE de la membrane,
    //    à son abscisse de repos — pas au sommet de la bosse.
    ctx.fillStyle = PRIN_COL_M;
    ctx.beginPath();
    ctx.arc(xpx, y0 + flechePx, Math.max(1.8, h * 0.10), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    _prinText(ctx, label, xpx, yP + h * 0.22, PRIN_COL_M,
              'bold ' + (_prinFont() * 1.05) + 'px "Segoe UI", Arial, sans-serif',
              'center', 'top', PRIN_COL_BAND);
}

function drawPrincipe() {
    var canvas = document.getElementById('principe-canvas');
    if (!canvas || simPrin.canvasW < 10) return;
    var ctx = canvas.getContext('2d');
    var s = simPrin, t = s.simTime, fs = _prinFont(), lw = _prinLW();

    ctx.clearRect(0, 0, s.canvasW, s.canvasH);
    ctx.fillStyle = PRIN_COL_BG;
    ctx.fillRect(0, 0, s.canvasW, s.canvasH);

    var srcH = s.srcH, micH = s.micH;   // cf. _prinLayout — le micro est le PLUS PETIT
    var xS1 = _prinXpx(s.x1), xS2 = _prinXpx(s.x2), xM = _prinXpx(s.xM);
    // Phase d'émission commune aux deux sources — anime membranes et arcs
    var phase = _prinOmega() * t;
    var positions = s.showReperes ? _prinPositionsRemarquables() : [];
    // Élément désigné : celui qu'on déplace, sinon celui qu'on survole. Son
    // guide passe en trait plein appuyé — c'est tout le retour visuel.
    var vise = s.drag || s.hover;

    // Représentation courante (cf. setPrinRepresentation) : ce sont les deux
    // seuls interrupteurs de tout le rendu — la mise en page, elle, ne change
    // jamais, quelle que soit la représentation.
    var gaz    = (s.repr !== 'signal');
    var courbe = (s.repr !== 'particules');

    // Fonds de bande + grille : tout au fond, avant le moindre repère
    for (var b = 0; b < 3; b++) _prinDrawBande(ctx, s.rows[b], _prinRowBoundsM(b));

    // Gaz de particules : juste au-dessus du fond de bande, donc SOUS les
    // repères, les guides, les axes et la courbe — c'est le milieu dans
    // lequel tout le reste se lit, pas un calque de plus posé par-dessus.
    // Construction paresseuse : le nuage n'existe que si on l'affiche.
    var gGaz = 0;
    if (gaz) {
        _prinGazInit();
        gGaz = _prinGazGain();
        for (var bg = 0; bg < 3; bg++) _prinDrawGazBande(ctx, bg, t);
    }

    // Repères d'interférences : marqueurs ponctuels, ligne somme uniquement
    if (s.showReperes) _prinDrawReperes(ctx, positions);

    // Guides verticaux : UN SEUL trait continu par élément, du haut de sa
    // première bande au bas de sa dernière — S₁ sur les bandes 1→3, S₂ sur
    // 2→3, M sur 1→3. Tracés d'une pièce, ils traversent les gouttières au
    // lieu d'y être tronqués (les guides par bande donnaient des pointillés
    // hachés à chaque intervalle), et l'abscisse se suit d'un coup d'œil sur
    // toute la hauteur de la scène.
    _prinDrawGuide(ctx, _prinSpan(0, 2), xS1, PRIN_COL_S1, vise === 'S1');
    _prinDrawGuide(ctx, _prinSpan(1, 2), xS2, PRIN_COL_S2, vise === 'S2');
    _prinDrawGuide(ctx, _prinSpan(0, 2), xM,  PRIN_COL_M,  vise === 'M');

    for (var r = 0; r < 3; r++) {
        var row = s.rows[r];
        var boundsM = _prinRowBoundsM(r);
        _prinDrawAxe(ctx, row, r === 2, boundsM);
        // Échelle verticale : elle gradue une AMPLITUDE de courbe. Sans
        // courbe, elle graduerait le vide — en mode Particules la position
        // verticale d'un point ne veut rien dire, c'est un rang dans le gaz.
        if (courbe) _prinDrawEchelleY(ctx, row);

        // Enveloppe : mode Signal uniquement. En « Les deux » la courbe est
        // là, mais son bouton a cédé la place à la sélection de particules —
        // afficher une enveloppe que plus rien ne commande serait un piège.
        if (r === 2 && s.showEnv && s.repr === 'signal') _prinDrawEnveloppe(ctx, row, t);

        var fy, col, xMin, xMax;
        if (r === 0) {
            // "S₁ seule" : tracée du haut-parleur jusqu'au bord de la fenêtre
            // (elle ne s'arrête plus à l'abscisse de S₂), jamais avant S₁ —
            // ni au-delà du micro si l'option de masquage est active.
            fy = function (x) { return _prinY1Libre(x, t); };
            col = PRIN_COL_S1; xMin = s.x1; xMax = boundsM[1];
        } else if (r === 1) {
            fy = function (x) { return _prinY2Libre(x, t); };
            col = PRIN_COL_S2; xMin = boundsM[0]; xMax = s.x2;
        } else {
            // Superposition : affichée seulement entre S₁ et S₂ (comportement
            // inchangé), mais domaine de tracé explicitement borné à [x₁, x₂] —
            // sans cela, le tracé démarrait en x = 0 avec une valeur nulle
            // (hors zone), créant le même faux « trait vertical » au niveau de
            // chaque source que sur les lignes 1 et 2 avant leur correctif.
            fy = function (x) { return _prinY1(x, t) + _prinY2(x, t); };
            col = PRIN_COL_SOMME; xMin = s.x1; xMax = s.x2;
        }
        // En mode « Les deux », la courbe est tracée plus fine et SANS son
        // aplat de remplissage : posé sur le nuage, celui-ci le délaverait
        // sur toute la hauteur de la bande — l'aplat n'a de sens que sur un
        // fond nu, où il distingue la superposition des deux sources.
        if (courbe) {
            _prinDrawCourbe(ctx, row, fy, col,
                            (r === 2 ? 2.6 : 2) * lw * (gaz ? 0.72 : 1),
                            xMin, xMax, r === 2 && !gaz);
        }

        // Point de lecture du micro sur la courbe de la bande — remplacé, en
        // mode Particules, par la membrane du micro elle-même (cf. plus bas).
        if (courbe) {
            var yLec = fy(s.xM);
            ctx.save();
            ctx.fillStyle = PRIN_COL_M;
            ctx.strokeStyle = PRIN_COL_BAND;
            ctx.lineWidth = 1.6 * lw;
            ctx.beginPath();
            ctx.arc(xM, row.y0 - yLec * s.ampPx, Math.max(3.5, fs * 0.3), 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();

            // Valeur lue en M — sans elle, le point bleu oscille sans que rien
            // ne dise ce qu'il vaut, et le lien entre les trois bandes reste
            // implicite.
            if (s.showValeurs) {
                var nomLec = (r === 0) ? 'y₁(M)' : (r === 1) ? 'y₂(M)' : 'y₁+y₂';
                var cote = (s.xM > (s.x1 + s.x2) / 2) ? -1 : 1;   // du côté le plus dégagé
                // + 0 chasse le "-0,00" : à 2 décimales, une valeur infime mais
                // négative (creux d'interférence destructive) s'arrondissait en
                // "-0,00", qui oscillait moche avec "0,00" au fil de l'animation.
                var yAff = yLec.toFixed(2) === '-0.00' ? 0 : yLec;
                _prinText(ctx, nomLec + ' = ' + formatFr(yAff, 2),
                          xM + cote * fs * 0.9, row.y0 - yLec * s.ampPx - fs * 0.9,
                          PRIN_COL_M, 'bold ' + (fs * 0.88) + 'px "Segoe UI", Arial, sans-serif',
                          cote > 0 ? 'left' : 'right', 'middle', PRIN_COL_BAND);
            }
        }

        // Poignées déplaçables : S₁ sur les lignes 1 et 3, S₂ sur les lignes 2 et 3.
        // Le repère de position (ergot + point) est dessiné APRÈS, par-dessus la
        // courbe et le pictogramme, pour rester net à l'endroit exact x₁/x₂.
        // En mode Particules, l'ergot de position se cale sur l'abscisse
        // EXACTE de la source : la membrane est plaquée dessus, il n'y a plus
        // de pavillon dont la pointe serait décalée (cf. PRIN_SRC_TIP_RATIO).
        //
        // Le déplacement de la membrane est lu dans le champ DE LA BANDE, et
        // non dans la seule contribution de sa propre source. Sur les lignes 1
        // et 2 cela revient au même ; sur la ligne somme, non — et prendre u₁
        // seul y ferait glisser le gaz À TRAVERS la membrane de S₁, de tout ce
        // que vaut u₂ à cette abscisse (jusqu'à une trentaine de pixels).
        // Lire le champ de la bande garantit que la face de la membrane et le
        // fluide qu'elle touche ont, par construction, exactement le même
        // déplacement. La contrepartie est que sur la ligne somme la membrane
        // réagit aussi à l'onde qui lui arrive d'en face — ce qui est bien ce
        // que décrit le modèle affiché (superposition libre, sans réflexion
        // sur les sources).
        var fuBande = gaz ? _prinGazDepl(r, t) : null;
        if (r === 0 || r === 2) {
            if (gaz) {
                _prinDrawMembraneSrc(ctx, row, xS1, fuBande(s.x1) * gGaz, 1,
                                     PRIN_COL_S1, 'S₁ (' + formatFr(s.x1, 2) + ' m)');
                _prinDrawSourceMark(ctx, xS1, row.y0, PRIN_COL_S1);
            } else {
                _prinDrawHautParleur(ctx, xS1, row.y0, srcH, PRIN_COL_S1,
                                      'S₁ (' + formatFr(s.x1, 2) + ' m)', 1, phase);
                _prinDrawSourceMark(ctx, xS1 + srcH * PRIN_SRC_TIP_RATIO, row.y0, PRIN_COL_S1);
            }
        }
        if (r === 1 || r === 2) {
            if (gaz) {
                _prinDrawMembraneSrc(ctx, row, xS2, fuBande(s.x2) * gGaz, -1,
                                     PRIN_COL_S2, 'S₂ (' + formatFr(s.x2, 2) + ' m)');
                _prinDrawSourceMark(ctx, xS2, row.y0, PRIN_COL_S2);
            } else {
                _prinDrawHautParleur(ctx, xS2, row.y0, srcH, PRIN_COL_S2,
                                      'S₂ (' + formatFr(s.x2, 2) + ' m)', -1, phase);
                _prinDrawSourceMark(ctx, xS2 - srcH * PRIN_SRC_TIP_RATIO, row.y0, PRIN_COL_S2);
            }
        }

        // Titre de la bande : tracé APRÈS les pictogrammes (haut-parleurs en
        // mode Signal, membranes en mode Particules) pour rester lisible
        // devant eux — cf. correctif du recouvrement en mode Particules/Les deux.
        _prinDrawTitre(ctx, row, col, boundsM, r === 1 ? 'right' : 'left');
    }

    // Légende des repères — après les courbes : c'est un cartouche de
    // lecture, il doit rester lisible même si le tracé passe dessous.
    if (s.showReperes) _prinDrawReperesLegende(ctx);

    // Micro M — poignée sur l'axe de la ligne somme uniquement. En mode
    // Particules, la FLÈCHE de sa membrane suit la surpression qui s'exerce
    // sur elle, c'est-à-dire y₁(M) + y₂(M) : la même valeur que lit le point
    // bleu du mode Signal, et celle que tracent les fenêtres d'oscilloscope.
    // Positive = vers le bas = la membrane s'enfonce dans la cavité, ce qui
    // est bien le sens d'une compression.
    var row3 = s.rows[2];
    if (gaz) {
        _prinDrawMembraneMicro(ctx, row3, xM,
            (_prinY1(s.xM, t) + _prinY2(s.xM, t)) * _prinMicGain(),
            micH, 'M (' + formatFr(s.xM, 2) + ' m)');
    } else {
        _prinDrawMicro(ctx, xM, row3.y0, micH, 'M (' + formatFr(s.xM, 2) + ' m)');
    }
    // Badge δ : sous le socle du micro, puis sous son libellé « M » — rabattu
    // dans la bande si la fenêtre est trop basse pour tout empiler. N'apparaît
    // que si « Afficher la différence de marche » est activé (cf. showDelta).
    if (s.showDelta) {
        _prinDrawBadgeDelta(ctx, xM,
            Math.min(row3.y0 + micH * (PRIN_MIC_BAS_RATIO + 0.22) + fs * 1.15,
                     row3.y0 + row3.half - fs * 1.5 - 3));
    }

    // Couloir de cotes, sous la bande somme. Slots FIXES : 0 = S₁M, 1 = S₂M —
    // une cote masquée laisse sa ligne vide plutôt que de décaler l'autre, et
    // la scène ne bouge pas quand on bascule l'option.
    // Valeurs en valeur absolue : S₁M et S₂M sont des DISTANCES. L'ordre des
    // éléments est certes contraint (S₁ < M < S₂, cf. PRIN_MARGE_M), mais la
    // formule doit dire ce qu'elle mesure, pas s'appuyer sur cette contrainte.
    if (s.showCotes && s.coteYs.length >= 2) {
        _prinDrawCote(ctx, xS1, xM, s.coteYs[0],
                      'S₁M = ' + formatFr(Math.abs(s.xM - s.x1), 2) + ' m', PRIN_COL_S1);
        _prinDrawCote(ctx, xM, xS2, s.coteYs[1],
                      'S₂M = ' + formatFr(Math.abs(s.x2 - s.xM), 2) + ' m', PRIN_COL_S2);
    }

    // ── Graphes temporels y(M, t) ────────────────────────────────────
    // Flèches de rattachement (sur CE canvas, donc sous les fenêtres DOM qui
    // le recouvrent : la pointe s'arrête au boîtier), puis contenu des écrans.
    // En dernier : la flèche traverse la scène par construction, elle doit
    // passer par-dessus.
    _prinDrawGraphFleches(ctx);
    _prinRenderGraphWins();
}

// ══════════════════════════════════════════════════════════════════════
//  GRAPHES TEMPORELS y(M, t) — fenêtres volantes
//
//  Le tracé principal montre y(x) à un instant donné ; ces graphes montrent
//  la grandeur COMPLÉMENTAIRE — y(t) en un point fixe, celui du micro. C'est
//  ce que « voit » le micro, et c'est sur y(t) que se lit l'amplitude reçue.
//
//  Les valeurs sont recalculées ANALYTIQUEMENT à chaque frame sur toute la
//  fenêtre temporelle, sans historique enregistré : même approximation assumée
//  que le reste de l'onglet (déplacer une source re-cale son front, cf.
//  _prinY1Libre). Conséquence voulue : bouger M ou λ pendant l'animation
//  redessine tout le graphe cohérent avec les réglages COURANTS, au lieu de
//  laisser traîner un morceau de courbe obtenu avec les anciens.
// ══════════════════════════════════════════════════════════════════════

// Descripteur d'un graphe à partir de sa clé
function _prinGraphDef(cle) {
    for (var i = 0; i < PRIN_GRAPHS.length; i++) {
        if (PRIN_GRAPHS[i].cle === cle) return PRIN_GRAPHS[i];
    }
    return null;
}

// Valeur tracée en M à l'instant tau. Versions BORNÉES (_prinY1/_prinY2) :
// M est entre les deux sources, elles y coïncident avec les versions libres,
// mais la borne reste la règle physique (un haut-parleur ne rayonne pas à
// travers l'autre).
function _prinGraphVal(cle, tau) {
    var s = simPrin;
    if (cle === 'y1') return _prinY1(s.xM, tau);
    if (cle === 'y2') return _prinY2(s.xM, tau);
    return _prinY1(s.xM, tau) + _prinY2(s.xM, tau);
}

// Police et épaisseurs propres à une fenêtre de graphe : même doctrine que
// _prinFont/_prinLW pour le tracé principal (aucun px fixe), mais indexées sur
// la taille de CE canvas — une fenêtre volante fait le quart de la scène.
function _prinGraphFont(w, h) { return Math.max(9, Math.min(w / 17, h / 9.5, 22)); }
function _prinGraphLW(fs)     { return Math.max(1, fs / 14); }

// Pas de graduation « rond » immédiatement supérieur ou égal à `brut` :
// 1, 2 ou 5 fois une puissance de 10. Une échelle de temps doit tomber sur des
// nombres que l'élève lit d'un coup d'œil, quelle que soit la valeur de λ.
function _prinNicePas(brut) {
    if (!(brut > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log(brut) / Math.LN10));
    var r = brut / p;
    return ((r <= 1) ? 1 : (r <= 2) ? 2 : (r <= 5) ? 5 : 10) * p;
}

// Même service que _prinText, mais avec un halo calibré sur la police de CE
// canvas, et de la couleur du verre de l'écran. _prinText, lui, dimensionne son
// halo sur _prinFont() — celle du tracé principal, qui monte à 24 px — et le
// teinte en fond ivoire : sur une petite fenêtre d'oscilloscope, cela ferait
// une tache claire de 6 px là où il ne doit y avoir qu'un liseré.
function _prinGraphText(ctx, txt, x, y, color, font, align, baseline, fs) {
    ctx.font = font;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = baseline || 'middle';
    ctx.lineWidth = Math.max(2, fs * 0.28);
    ctx.strokeStyle = PRIN_COL_SCOPE_BG;
    ctx.lineJoin = 'round';
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = color;
    ctx.fillText(txt, x, y);
}

// ── Rendu d'une fenêtre ───────────────────────────────────────────────
function _prinRenderGraphWin(def) {
    var s = simPrin;
    if (!s.graphs[def.cle].open) return;
    var el = document.getElementById(def.win);
    if (!el) return;
    var cv = el.querySelector('.prin-graph-canvas');
    if (!cv) return;

    // Le canvas est dimensionné par le CSS (largeur en clamp() + aspect-ratio) :
    // on ne fait que suivre sa taille rendue, à chaque frame — pas de
    // ResizeObserver, la comparaison coûte moins qu'un écouteur de plus.
    var w = cv.clientWidth, h = cv.clientHeight;
    if (w < 20 || h < 20) return;
    var dpr = window.devicePixelRatio || 1;
    var pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var fs = _prinGraphFont(w, h), lw = _prinGraphLW(fs);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = PRIN_COL_SCOPE_BG;
    ctx.fillRect(0, 0, w, h);

    // Gouttières : à gauche les valeurs de l'échelle verticale, en bas les
    // durées et le libellé « t (ms) » — mesurées, jamais devinées.
    ctx.font = 'bold ' + (fs * 0.9) + 'px monospace';
    var padL = ctx.measureText('−2').width + 9 * lw;
    var padR = Math.max(fs * 0.5, ctx.measureText('0,0').width / 2);
    var padT = fs * 0.55;
    var padB = fs * 1.75;
    var px0 = padL, py0 = padT;
    var pw2 = Math.max(20, w - padL - padR), ph2 = Math.max(20, h - padT - padB);
    var yz = py0 + ph2 / 2;                       // ordonnée de y = 0
    var ampPx = (ph2 / 2) / (PRIN_GRAPH_MAXU * 1.10);    // 10 % de respiration au-dessus de ±2

    // Fenêtre temporelle : [0, W] tant que t < W (la courbe POUSSE vers la
    // droite, et le palier plat du début montre le temps de vol d/c du front),
    // puis défilement [t − W, t] comme sur un oscilloscope.
    var T  = simPrin.lambda / PRIN_C;
    var Wt = PRIN_GRAPH_PERIODES * T;
    var t1 = Math.max(simPrin.simTime, Wt), t0 = t1 - Wt;
    var xOf = function (tau) { return px0 + (tau - t0) / Wt * pw2; };

    // ── Graduation de l'axe des temps ────────────────────────────────
    // Pas ROND en millisecondes (1 / 2 / 5 ×10ⁿ, cf. _prinNicePas), et non un
    // pas d'une demi-période : la période vaut 1,76 ms à λ = 0,60 m, une
    // graduation à ce pas donne des nombres illisibles et une échelle qui
    // change de valeur dès qu'on touche λ. Ici les nombres restent ronds quel
    // que soit λ, seule leur DENSITÉ suit la largeur disponible — une petite
    // fenêtre ne se retrouve pas avec dix étiquettes qui se chevauchent.
    var msW   = Wt * 1000;
    var nVise = Math.max(2, Math.min(8, Math.round(pw2 / (fs * 4.2))));
    var pasMs = _prinNicePas(msW / nVise);
    var decMs = (pasMs >= 1) ? 0 : (pasMs >= 0.1 ? 1 : 2);
    var kt0   = Math.ceil(t0 * 1000 / pasMs - 1e-9);
    var kt1   = Math.floor(t1 * 1000 / pasMs + 1e-9);

    // Grille verticale : AUX GRADUATIONS, pas ailleurs — c'est elle qui relie
    // le nombre écrit sous le cadre au point de la courbe qui lui correspond.
    ctx.save();
    ctx.lineWidth = lw;
    ctx.strokeStyle = PRIN_COL_SCOPE_GRID;
    for (var kt = kt0; kt <= kt1; kt++) {
        var xg = xOf(kt * pasMs / 1000);
        ctx.beginPath(); ctx.moveTo(xg, py0); ctx.lineTo(xg, py0 + ph2); ctx.stroke();
    }
    // Horizontales aux amplitudes entières (0 exclu : c'est l'axe, tracé après)
    for (var u = -PRIN_GRAPH_MAXU; u <= PRIN_GRAPH_MAXU; u++) {
        if (u === 0) continue;
        var yg = yz - u * ampPx;
        ctx.beginPath(); ctx.moveTo(px0, yg); ctx.lineTo(px0 + pw2, yg); ctx.stroke();
    }
    ctx.restore();

    // ── Axes : l'axe des temps est la ligne y = 0, au milieu ; l'axe des
    //    ordonnées ferme la gouttière de gauche.
    ctx.save();
    ctx.strokeStyle = PRIN_COL_SCOPE_AXE;
    ctx.lineWidth = 1.4 * lw;
    ctx.beginPath();
    ctx.moveTo(px0, yz); ctx.lineTo(px0 + pw2, yz);
    ctx.moveTo(px0, py0); ctx.lineTo(px0, py0 + ph2);
    ctx.stroke();
    // Graduations portées PAR l'axe des temps, de part et d'autre de la ligne
    // (même doctrine que _prinDrawAxe sur le tracé principal) : sans elles,
    // les nombres du bas flottent sous un cadre et rien ne dit qu'ils
    // graduent cette ligne-là. Les mêmes marques sont répétées sur le bord
    // bas, là où sont écrits les nombres.
    ctx.strokeStyle = PRIN_COL_SCOPE_TICK;
    ctx.lineWidth = 1.2 * lw;
    for (var kg = kt0; kg <= kt1; kg++) {
        var xt = xOf(kg * pasMs / 1000);
        ctx.moveTo(xt, yz - 4 * lw);        ctx.lineTo(xt, yz + 4 * lw);
        ctx.moveTo(xt, py0 + ph2 - 4 * lw); ctx.lineTo(xt, py0 + ph2);
    }
    ctx.stroke();
    ctx.restore();

    // ── Échelle verticale : ±2 sur les TROIS graphes (PRIN_GRAPH_MAXU) —
    //    c'est elle qui rend visible que y₁ + y₂ peut valoir le double de y₁.
    for (var v = -PRIN_GRAPH_MAXU; v <= PRIN_GRAPH_MAXU; v++) {
        var yv = yz - v * ampPx;
        ctx.save();
        ctx.strokeStyle = PRIN_COL_SCOPE_TICK;
        ctx.lineWidth = 1.2 * lw;
        ctx.beginPath(); ctx.moveTo(px0 - 4 * lw, yv); ctx.lineTo(px0, yv); ctx.stroke();
        ctx.restore();
        _prinGraphText(ctx, (v < 0 ? '−' : '') + Math.abs(v), px0 - 6 * lw, yv,
                  PRIN_COL_SCOPE_TICK, 'bold ' + (fs * 0.9) + 'px monospace', 'right', 'middle',
                  fs);
    }

    // ── Valeurs des graduations, en MILLISECONDES : à λ = 0,60 m, T ≈ 1,8 ms
    //    — la seconde ne dirait rien ici. Le libellé « t (ms) » est posé au
    //    bout de la ligne, comme « x (m) » sur le tracé principal ; une valeur
    //    qui viendrait le heurter est simplement omise plutôt que superposée.
    var fT = 'bold ' + (fs * 0.82) + 'px monospace';
    var yT = py0 + ph2 + fs * 0.62;
    ctx.font = fT;
    var xLim = px0 + pw2 - ctx.measureText('t (ms)').width - 5 * lw;
    _prinGraphText(ctx, 't (ms)', px0 + pw2, yT, PRIN_COL_SCOPE_TICK, fT, 'right', 'middle', fs);
    for (var kl = kt0; kl <= kt1; kl++) {
        var txt = formatFr(kl * pasMs, decMs);
        var xl  = xOf(kl * pasMs / 1000);
        ctx.font = fT;
        if (xl + ctx.measureText(txt).width / 2 > xLim) continue;
        _prinGraphText(ctx, txt, xl, yT, PRIN_COL_SCOPE_TICK, fT, 'center', 'middle', fs);
    }

    // ── Courbes ───────────────────────────────────────────────────────
    // Un point par pixel environ : au-delà, on paie sans rien voir de plus.
    var nPts = Math.max(120, Math.min(900, Math.round(pw2 * 1.2)));
    var tFin = Math.min(simPrin.simTime, t1);

    var trace = function (couleur, epaisseur, alpha, valeurDe) {
        if (tFin <= t0) return;                  // rien d'émis dans la fenêtre
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = couleur;
        ctx.lineWidth = epaisseur;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        // Halo « phosphore » : c'est lui, avec le verre sombre, qui fait lire
        // la fenêtre comme l'ÉCRAN d'un appareil et non comme un morceau de
        // la scène — toute la parade à la confusion espace/temps tient là.
        ctx.shadowColor = couleur;
        ctx.shadowBlur  = 3 * lw;
        ctx.beginPath();
        for (var i = 0; i <= nPts; i++) {
            var tau = t0 + (tFin - t0) * i / nPts;
            var yy = yz - valeurDe(tau) * ampPx;
            if (i === 0) ctx.moveTo(xOf(tau), yy); else ctx.lineTo(xOf(tau), yy);
        }
        ctx.stroke();
        ctx.restore();
    };

    // Superpositions de la fenêtre « y₁ + y₂ » : tracées SOUS la somme et plus
    // fines, la somme doit rester la courbe principale du graphe. Teintes
    // phosphore de S₁/S₂ : sur le verre sombre, les tons de la scène
    // disparaissent.
    if (def.cle === 'som') {
        if (simPrin.graphSomY1) trace(PRIN_COL_SCOPE_S1, 1.6 * lw, 0.9,
                                      function (tau) { return _prinGraphVal('y1', tau); });
        if (simPrin.graphSomY2) trace(PRIN_COL_SCOPE_S2, 1.6 * lw, 0.9,
                                      function (tau) { return _prinGraphVal('y2', tau); });
    }
    trace(def.scope, 2.4 * lw, 1, function (tau) { return _prinGraphVal(def.cle, tau); });

    // ── Instant courant : le point de lecture du micro, jumeau de celui du
    //    tracé principal, dans la contrepartie CLAIRE de PRIN_COL_M (le bleu
    //    de la scène est illisible sur le verre).
    if (simPrin.simTime > t0 && simPrin.simTime <= t1) {
        var xNow = xOf(simPrin.simTime);
        var yNow = yz - _prinGraphVal(def.cle, simPrin.simTime) * ampPx;
        ctx.save();
        ctx.strokeStyle = PRIN_COL_SCOPE_CURSEUR;
        ctx.lineWidth = lw;
        ctx.setLineDash([3 * lw, 3 * lw]);
        ctx.beginPath(); ctx.moveTo(xNow, py0); ctx.lineTo(xNow, py0 + ph2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = PRIN_COL_SCOPE_CURSEUR;
        ctx.strokeStyle = PRIN_COL_SCOPE_BG;
        ctx.lineWidth = 1.4 * lw;
        ctx.beginPath(); ctx.arc(xNow, yNow, Math.max(3, fs * 0.28), 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.restore();
    }

    // ── Cadre du domaine tracé
    ctx.save();
    ctx.strokeStyle = PRIN_COL_SCOPE_GRID_MAJ;
    ctx.lineWidth = lw;
    ctx.strokeRect(px0, py0, pw2, ph2);
    ctx.restore();
}

// Rendu des fenêtres ouvertes — appelé par drawPrincipe, donc à chaque frame,
// même en pause (mêmes raisons : un redimensionnement ne doit pas laisser une
// image obsolète).
function _prinRenderGraphWins() {
    for (var i = 0; i < PRIN_GRAPHS.length; i++) _prinRenderGraphWin(PRIN_GRAPHS[i]);
}

// ── Flèche de rattachement ────────────────────────────────────────────
// Elle part de l'abscisse de M SUR LA LIGNE concernée (ligne 1 pour y₁, 2 pour
// y₂, 3 pour la somme) et rejoint le boîtier de la fenêtre : sans elle, trois
// fenêtres de plus flottent sans qu'on sache laquelle montre quoi. Sa couleur
// est celle de la ligne, comme le cadre et la barre de titre de la fenêtre.
// Rectiligne : le plus court chemin, donc le plus lisible au vidéoprojecteur.
// Ancrée sur l'AXE de la bande et non sur le point de lecture, qui oscille —
// la flèche battrait au rythme de l'onde.
function _prinFlecheVersFenetre(ctx, ax, ay, rect, color) {
    // Point du boîtier le plus proche de l'ancre (le clamp d'un point
    // extérieur sur un rectangle tombe toujours sur son bord).
    var cx = Math.max(rect.x, Math.min(ax, rect.x + rect.w));
    var cy = Math.max(rect.y, Math.min(ay, rect.y + rect.h));
    var dx = cx - ax, dy = cy - ay;
    var d  = Math.sqrt(dx * dx + dy * dy);
    if (d < 14) return;   // fenêtre posée sur son ancre : plus rien à relier
    var lw = _prinLW();
    var ux = dx / d, uy = dy / d;
    var tx = cx - ux * 3 * lw, ty = cy - uy * 3 * lw;   // recul : ne pas mordre le cadre

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = 2 * lw; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    // Pointe orientée par la direction du segment.
    var ang = Math.atan2(ty - ay, tx - ax), hl = 9 * lw;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - hl * Math.cos(ang - 0.42), ty - hl * Math.sin(ang - 0.42));
    ctx.lineTo(tx - hl * Math.cos(ang + 0.42), ty - hl * Math.sin(ang + 0.42));
    ctx.closePath();
    ctx.fill();
    // Petit disque à l'ancre : marque le point de la ligne dont on parle.
    ctx.beginPath(); ctx.arc(ax, ay, 2.8 * lw, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}
// Les fenêtres sont des éléments DOM positionnés dans #prin-scene-area, qui
// est aussi le conteneur du canvas : offsetLeft/offsetTop y sont donc DÉJÀ
// dans le repère du canvas en px CSS, aucune conversion à faire.
function _prinDrawGraphFleches(ctx) {
    var s = simPrin;
    for (var i = 0; i < PRIN_GRAPHS.length; i++) {
        var def = PRIN_GRAPHS[i];
        if (!s.graphs[def.cle].open) continue;
        var el = document.getElementById(def.win);
        if (!el || !el.offsetWidth) continue;
        var row = s.rows[def.row];
        if (!row) continue;
        _prinFlecheVersFenetre(ctx, _prinXpx(s.xM), row.y0,
            { x : el.offsetLeft, y : el.offsetTop, w : el.offsetWidth, h : el.offsetHeight },
            def.couleur);
    }
}

// ── Position des fenêtres ─────────────────────────────────────────────
// Position stockée à la fois en px (ce qu'on applique) et en fraction de la
// place disponible (ce qui survit au redimensionnement, cf. simPrin.graphs).
function _prinSetGraphWinPos(def, el, x, y) {
    var area = document.getElementById('prin-scene-area');
    if (!area) return;
    var maxX = Math.max(0, area.clientWidth  - el.offsetWidth);
    var maxY = Math.max(0, area.clientHeight - el.offsetHeight);
    var g = simPrin.graphs[def.cle];
    g.x = Math.max(0, Math.min(x, maxX));
    g.y = Math.max(0, Math.min(y, maxY));
    g.fx = maxX > 0 ? g.x / maxX : 0;
    g.fy = maxY > 0 ? g.y / maxY : 0;
    el.style.left = g.x + 'px';
    el.style.top  = g.y + 'px';
}

// Placement à l'ouverture : colonne de droite, réparties sur la hauteur en
// haut / milieu / bas — soit l'ordre même des trois lignes du tracé, et aucun
// recouvrement entre fenêtres au premier affichage.
function _prinPlaceGraphWin(def, el) {
    var area = document.getElementById('prin-scene-area');
    if (!area) return;
    var g = simPrin.graphs[def.cle];
    if (g.fx === null) {
        var marge = Math.max(8, area.clientWidth * 0.012);
        var libre = Math.max(0, area.clientHeight - 2 * marge - el.offsetHeight);
        _prinSetGraphWinPos(def, el,
            area.clientWidth - el.offsetWidth - marge,
            marge + def.idx * libre / 2);
    } else {
        _prinSetGraphWinPos(def, el, g.x, g.y);
    }
}

// Redimensionnement de la zone : on repart des FRACTIONS, pas des px — une
// fenêtre calée en haut à droite le reste au passage en plein écran.
function _prinRelayoutGraphWins() {
    var area = document.getElementById('prin-scene-area');
    if (!area) return;
    for (var i = 0; i < PRIN_GRAPHS.length; i++) {
        var def = PRIN_GRAPHS[i], g = simPrin.graphs[def.cle];
        if (!g.open) continue;
        var el = document.getElementById(def.win);
        if (!el || !el.offsetWidth) continue;
        if (g.fx === null) { _prinPlaceGraphWin(def, el); continue; }
        _prinSetGraphWinPos(def, el,
            g.fx * Math.max(0, area.clientWidth  - el.offsetWidth),
            g.fy * Math.max(0, area.clientHeight - el.offsetHeight));
    }
}

// ── Glisser-déposer des fenêtres ──────────────────────────────────────
// Pointer Events + capture, comme le glisser-déposer de S₁/M/S₂ : un seul jeu
// d'écouteurs pour la souris et le tactile. La saisie se fait par la barre de
// titre — le corps de la fenêtre reste libre pour les cases à cocher.
var _prinGraphZ = 20;   // empilement : la dernière fenêtre saisie passe devant

function initPrincipeGraphDrag() {
    for (var i = 0; i < PRIN_GRAPHS.length; i++) {
        (function (def) {
            var el = document.getElementById(def.win);
            if (!el) return;
            var head = el.querySelector('.prin-graph-head');
            if (!head) return;
            var off = null;

            // Passer devant dès qu'on touche la fenêtre, barre ou contenu.
            el.addEventListener('pointerdown', function () {
                el.style.zIndex = ++_prinGraphZ;
            });

            head.addEventListener('pointerdown', function (e) {
                // Bouton de fermeture et légende : ce sont des CONTRÔLES,
                // pas une poignée — un clic sur une case à cocher ne doit
                // pas embarquer la fenêtre.
                if (e.target.closest &&
                    e.target.closest('.prin-graph-close, .prin-graph-legend')) return;
                var area = document.getElementById('prin-scene-area');
                if (!area) return;
                var r = area.getBoundingClientRect();
                // Écart de saisie mémorisé : la fenêtre ne saute pas sous le
                // pointeur au premier pixel de mouvement.
                off = { x : e.clientX - r.left - el.offsetLeft,
                        y : e.clientY - r.top  - el.offsetTop };
                head.setPointerCapture(e.pointerId);
                head.classList.add('dragging');
                e.preventDefault();
            });

            head.addEventListener('pointermove', function (e) {
                if (!off) return;
                var area = document.getElementById('prin-scene-area');
                if (!area) return;
                var r = area.getBoundingClientRect();
                _prinSetGraphWinPos(def, el, e.clientX - r.left - off.x,
                                             e.clientY - r.top  - off.y);
            });

            var fin = function () { off = null; head.classList.remove('dragging'); };
            head.addEventListener('pointerup', fin);
            head.addEventListener('pointercancel', fin);
        })(PRIN_GRAPHS[i]);
    }
}

// ── Contrôles du panneau ──────────────────────────────────────────────
function togglePrinGraph(cle) {
    var def = _prinGraphDef(cle);
    if (!def) return;
    var g = simPrin.graphs[cle];
    g.open = !g.open;

    var btn = document.getElementById(def.btn);
    if (btn) btn.classList.toggle('active', g.open);

    var el = document.getElementById(def.win);
    if (!el) return;
    el.style.display = g.open ? '' : 'none';
    if (g.open) {
        el.style.zIndex = ++_prinGraphZ;
        // offsetWidth/Height ne valent quelque chose qu'une fois affichée.
        _prinPlaceGraphWin(def, el);
    }
}

// Légende cliquable de la fenêtre « y₁ + y₂ »
function setPrinGraphOverlay(quoi, actif) {
    if (quoi === 'y1') simPrin.graphSomY1 = !!actif;
    else               simPrin.graphSomY2 = !!actif;
}

// ══════════════════════════════════════════════════════════════════════
//  BOUCLE — appelée par ui.js → loop() quand l'onglet est visible
// ══════════════════════════════════════════════════════════════════════

// Horloge locale : la loop() de cette page ne transporte pas de timestamp
// (cf. ui.js), même solution que tickSurfaces().
var _prinLastFrameT = null;

function tickPrincipe() {
    var now = performance.now();
    if (_prinLastFrameT === null) _prinLastFrameT = now;
    var dt = (now - _prinLastFrameT) / 1000;
    _prinLastFrameT = now;
    if (dt > 0.1) dt = 0.1;

    // En mode 2D (placeholder), rien à faire : le temps ne doit pas avancer
    // dans le dos de l'élève et le canvas 1D est masqué.
    if (simPrin.mode !== '1d') return;

    if (!simPrin.paused) {
        simPrin.simTime += dt * simPrin.speedFactor / PRIN_RALENTI;
    }
    // Redessiné même en pause : sans cela, un redimensionnement ou un
    // glissement de source pendant la pause laisserait une image obsolète.
    drawPrincipe();
}

// ══════════════════════════════════════════════════════════════════════
//  GLISSER-DÉPOSER (Pointer Events + capture : souris et tactile d'un seul
//  jeu d'écouteurs, cf. pression/js/ui.js)
// ══════════════════════════════════════════════════════════════════════

// Rayon de saisie : 16 px fixes étaient trop serrés au doigt (cible tactile
// recommandée ≈ 24 px). Proportionnel à la largeur du canvas, avec plancher.
function _prinGrabTol() { return Math.max(22, simPrin.canvasW / 45); }

// Aimantation : à moins de PRIN_SNAP_PX d'une position remarquable (ventre ou
// nœud), l'élément déplacé s'y cale. « Trouver un nœud » cesse d'être un
// exercice de dextérité à la souris. Alt enfoncée désactive l'aimantation.
var PRIN_SNAP_PX = 5;

function _prinSnap(quoi, xm, sansSnap) {
    simPrin.snapped = false;
    if (sansSnap) return xm;
    // Seul le micro s'aimante : déplacer une SOURCE change les positions
    // remarquables elles-mêmes, l'aimantation y serait un piège (la cible
    // fuit sous le pointeur).
    if (quoi !== 'M') return xm;
    var pos = _prinPositionsRemarquables();
    var tol = PRIN_SNAP_PX / simPrin.pxPerM;
    var best = null, dBest = tol;
    for (var i = 0; i < pos.length; i++) {
        var d = Math.abs(pos[i].x - xm);
        if (d < dBest) { dBest = d; best = pos[i].x; }
    }
    if (best === null) return xm;
    simPrin.snapped = true;
    return best;
}

function _prinPointerPos(canvas, e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// Quel élément est sous le pointeur ? Une source n'est saisissable que sur les
// lignes où elle est DESSINÉE (S₁ : lignes 1 et 3 ; S₂ : lignes 2 et 3), pour
// que la zone saisissable soit exactement celle que l'élève voit. M, lui, est
// saisissable sur les TROIS lignes : son guide vertical les traverse toutes
// (cf. _prinDrawGuide → _prinSpan(0, 2)), donc on peut l'attraper là où ce
// guide passe même sur les lignes 1 et 2, où son pictogramme n'est pas dessiné.
//
// ── Zones de saisie RESSERRÉES en mode « Sélectionner des particules » ─
//
//  La générosité ci-dessus se retourne contre l'élève dès qu'un clic peut
//  vouloir dire autre chose que « déplacer ». M étant saisissable sur les
//  TROIS lignes et sur ±22 px, il stérilisait une colonne entière de gaz :
//  impossible de marquer les particules au voisinage du micro, c'est-à-dire
//  précisément là où l'on veut regarder.
//
//  En mode sélection, la saisie se réduit donc à ce que l'on VOIT :
//   • M n'est attrapable que sur son boîtier — ligne 3, et seulement sur la
//     hauteur de la cavité et de son libellé. Le gaz au-dessus de l'axe, à
//     la même abscisse, redevient sélectionnable, et les lignes 1 et 2 le
//     sont sur toute leur longueur ;
//   • S₁ et S₂ gardent leurs lignes (leur membrane y barre toute la hauteur)
//     mais avec la largeur de leur caisse, et non la tolérance tactile.
//
//  Le clavier reste inchangé : M se déplace toujours aux flèches, quel que
//  soit le mode, donc rien n'est perdu en accessibilité.
function _prinHit(px, py) {
    var s = simPrin;
    if (!s.rows.length) return null;
    var strict = _prinSelActive();
    var tolSrc = strict ? Math.max(8, _prinCaisseW()) : _prinGrabTol();
    var geo    = strict ? _prinMicGeo() : null;

    for (var r = 0; r < 3; r++) {
        var row = s.rows[r];
        if (py < row.y0 - row.half || py > row.y0 + row.half) continue;
        var cand = [];
        if (!strict) {
            cand.push(['M', _prinXpx(s.xM), tolSrc]);    // prioritaire, sur les 3 lignes
        } else if (r === 2 && py >= geo.y0 - geo.h * 0.6
                           && py <= geo.yP + geo.h * 1.0) {
            cand.push(['M', _prinXpx(s.xM), geo.w / 2 + geo.mur]);
        }
        if (r === 0 || r === 2) cand.push(['S1', _prinXpx(s.x1), tolSrc]);
        if (r === 1 || r === 2) cand.push(['S2', _prinXpx(s.x2), tolSrc]);
        for (var i = 0; i < cand.length; i++) {
            if (Math.abs(px - cand[i][1]) <= cand[i][2]) return cand[i][0];
        }
    }
    return null;
}

// Applique une position glissée en respectant l'ordre S₁ < M < S₂ et les
// marges. Pas de "poussée" : chaque élément est simplement borné par ses
// voisins, ce qui évite qu'un glissement rapide n'emmène tout le montage.
function _prinSetDragPos(quoi, xm, sansSnap) {
    var s = simPrin;
    xm = _prinSnap(quoi, xm, sansSnap);
    if (quoi === 'S1') {
        s.x1 = Math.max(PRIN_BORD_M, Math.min(s.xM - PRIN_MARGE_M, xm));
    } else if (quoi === 'S2') {
        s.x2 = Math.min(PRIN_VIEW_WIDTH_M - PRIN_BORD_M, Math.max(s.xM + PRIN_MARGE_M, xm));
    } else {
        s.xM = Math.max(s.x1 + PRIN_MARGE_M, Math.min(s.x2 - PRIN_MARGE_M, xm));
    }
    _prinUpdateValeurs();
}

function initPrincipeDrag() {
    var canvas = document.getElementById('principe-canvas');
    if (!canvas) return;

    // Position courante d'un élément, en mètres — pour l'écart de saisie
    function _pos(quoi) {
        return (quoi === 'S1') ? simPrin.x1 : (quoi === 'S2') ? simPrin.x2 : simPrin.xM;
    }

    // Curseur au repos : croix en mode sélection, flèche sinon. Le survol
    // d'un élément déplaçable reste prioritaire — on peut toujours attraper
    // S₁, S₂ ou M sans quitter le mode sélection.
    function _curseur() {
        if (simPrin.hover) return 'grab';
        return _prinSelActive() ? 'crosshair' : 'default';
    }

    canvas.addEventListener('pointerdown', function (e) {
        var p = _prinPointerPos(canvas, e);
        var hit = _prinHit(p.x, p.y);
        if (!hit) {
            // Rien à saisir ici : c'est un clic de sélection de particules.
            if (_prinSelActive()) {
                _prinGazSelect(p.x, p.y, { ctrl : e.ctrlKey, shift : e.shiftKey });
                canvas.focus();
                e.preventDefault();
                drawPrincipe();
            }
            return;
        }
        simPrin.drag = hit;
        simPrin.sel  = hit;                // devient la cible des flèches clavier
        // On MÉMORISE l'écart entre le point saisi et l'élément au lieu de le
        // recentrer sous le pointeur : un clic 10 px à côté ne le téléporte
        // plus avant même qu'on ait bougé.
        simPrin.dragOff = _pos(hit) - _prinXm(p.x);
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = 'grabbing';
        canvas.focus();
        e.preventDefault();
    });

    canvas.addEventListener('pointermove', function (e) {
        var p = _prinPointerPos(canvas, e);
        if (simPrin.drag) {
            _prinSetDragPos(simPrin.drag, _prinXm(p.x) + simPrin.dragOff, e.altKey);
            return;
        }
        simPrin.hover = _prinHit(p.x, p.y);
        canvas.style.cursor = _curseur();
    });

    function fin(e) {
        if (!simPrin.drag) return;
        simPrin.drag = null;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        var p = _prinPointerPos(canvas, e);
        simPrin.hover = _prinHit(p.x, p.y);
        canvas.style.cursor = _curseur();
    }
    canvas.addEventListener('pointerup', fin);
    canvas.addEventListener('pointercancel', fin);
    canvas.addEventListener('pointerleave', function () {
        if (!simPrin.drag) { simPrin.hover = null; canvas.style.cursor = _curseur(); }
    });

    // ── Clavier ───────────────────────────────────────────────────────
    // Les trois éléments n'étaient atteignables qu'à la souris. Tab donne le
    // focus au canvas, ← → déplacent l'élément sélectionné (le dernier saisi,
    // M par défaut) de 1 cm, 10 cm avec Maj ; 1/2/3 choisissent S₁, M ou S₂.
    canvas.addEventListener('keydown', function (e) {
        var pas = e.shiftKey ? 0.10 : 0.01;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            var sens = (e.key === 'ArrowRight') ? 1 : -1;
            var cur = (simPrin.sel === 'S1') ? simPrin.x1
                    : (simPrin.sel === 'S2') ? simPrin.x2 : simPrin.xM;
            // Arrondi au centimètre : après une aimantation, la position
            // courante n'est pas ronde, et le pas clavier doit rester lisible.
            _prinSetDragPos(simPrin.sel, Math.round((cur + sens * pas) * 100) / 100,
                            true);                                  // jamais d'aimant au clavier
            e.preventDefault();
        } else if (e.key === '1' || e.key === '2' || e.key === '3') {
            simPrin.sel = (e.key === '1') ? 'S1' : (e.key === '2') ? 'M' : 'S2';
            simPrin.hover = simPrin.sel;    // retour visuel de la sélection
            e.preventDefault();
        }
    });
    canvas.addEventListener('blur', function () {
        if (!simPrin.drag) simPrin.hover = null;
    });
}

// ══════════════════════════════════════════════════════════════════════
//  CONTRÔLES DU PANNEAU
// ══════════════════════════════════════════════════════════════════════

// ── Mode 1D ───────────────────────────────────────────────────────────
// Un seul mode existe pour l'instant (le sélecteur 1D/2D a été retiré du
// panneau) : cette fonction ne fait plus que révéler la scène au premier
// affichage de l'onglet.
function setPrincipeMode(mode) {
    simPrin.mode = '1d';
    document.getElementById('prin-scene-area').style.display = '';
    document.getElementById('prin-2d-placeholder').style.display = 'none';
    resizePrincipe();
}

// ── Représentation : 'signal' | 'particules' | 'lesdeux' ──────────────
//
//  Bascule purement visuelle : ni le temps, ni la pause, ni aucun réglage
//  n'en sont affectés — on peut passer de l'un à l'autre en pleine animation
//  pour comparer, c'est même tout l'intérêt du bouton.
//
//  La mise en page est rigoureusement identique dans les trois cas (cf.
//  _prinLayout, qui ne connaît pas simPrin.repr) : rien ne bouge d'un pixel.
function setPrinRepresentation(mode) {
    if (mode !== 'particules' && mode !== 'lesdeux') mode = 'signal';
    simPrin.repr = mode;
    // Retour au signal : plus de gaz, donc plus de sélection possible. On sort
    // du mode et on efface, comme le fait toggleSelect() de l'onglet Son quand
    // on le désactive — laisser des marques dormantes ferait réapparaître une
    // sélection oubliée au prochain passage en Particules.
    if (mode === 'signal' && simPrin.selMode) {
        simPrin.selMode = false;
        _prinGazClearSel();
    }
    _prinSyncReprUI();
    drawPrincipe();
}

// ── Le bouton partagé « enveloppe / sélection » ───────────────────────
//
//  Un seul bouton, deux fonctions selon la représentation : « Afficher
//  l'enveloppe » n'a d'objet que sur une courbe, « Sélectionner des
//  particules » que sur un gaz. Ils ne peuvent jamais servir en même temps,
//  et se partagent donc la même place — plutôt que d'en neutraliser un sur
//  deux, ce que faisait la première version.
//
//  Conséquence assumée en mode « Les deux » : la courbe est là, mais son
//  enveloppe n'est plus atteignable. L'état showEnv est CONSERVÉ et reprend
//  effet dès le retour au mode Signal (cf. le garde-fou de drawPrincipe, qui
//  ne trace l'enveloppe que dans ce mode).
function togglePrinEnvOuSel() {
    if (simPrin.repr === 'signal') togglePrinEnveloppe();
    else                           togglePrinSelection();
}

function togglePrinSelection() {
    simPrin.selMode = !simPrin.selMode;
    if (!simPrin.selMode) _prinGazClearSel();
    _prinSyncReprUI();
    drawPrincipe();
}

function _prinSyncReprUI() {
    var mode = simPrin.repr;
    var btns = [['btn-repr-signal-prin', 'signal'],
                ['btn-repr-part-prin',   'particules'],
                ['btn-repr-deux-prin',   'lesdeux']];
    for (var i = 0; i < btns.length; i++) {
        var b = document.getElementById(btns[i][0]);
        if (b) b.classList.toggle('active', mode === btns[i][1]);
    }
    // Bouton partagé : « Afficher l'enveloppe » en mode Signal, « Sélectionner
    // des particules » dès qu'un gaz est affiché (cf. togglePrinEnvOuSel).
    var btn = document.getElementById('btn-env-prin');
    if (btn) {
        var gaz = (mode !== 'signal');
        btn.textContent = gaz ? 'Sélectionner des particules' : "Afficher l'enveloppe";
        btn.classList.toggle('active', gaz ? simPrin.selMode : simPrin.showEnv);
    }
}

// ── Lancer / Pause / Reprendre ────────────────────────────────────────
// Trois libellés : "Lancer" tant que rien n'a jamais tourné (t = 0),
// "Reprendre" après une pause en cours de route.
function _prinSyncPlayBtn() {
    var btn = document.getElementById('btn-playpause-prin');
    if (!btn) return;
    if (!simPrin.paused) {
        btn.textContent = '⏸ Pause';
        btn.className = 'btn btn-pause';
    } else {
        btn.textContent = (simPrin.simTime <= 0) ? '▶ Lancer' : '▶ Reprendre';
        btn.className = 'btn btn-play';
    }
}

function togglePausePrincipe() {
    simPrin.paused = !simPrin.paused;
    _prinSyncPlayBtn();
}

// RAZ : remet l'ANIMATION à zéro (temps, pause). Les positions de S₁, S₂ et M
// ne sont PAS touchées — seul le glisser-déposer sur le canvas les déplace
// désormais (plus de bouton "Par défaut" ni de curseurs « Positions »), donc
// RAZ ne doit pas les réinitialiser dans le dos de l'élève.
function resetPrincipe() {
    simPrin.simTime = 0;
    simPrin.paused = true;
    simPrin.drag = null;
    simPrin.hover = null;
    // Sans cette remise à null, le premier dt après le reset vaudrait tout le
    // temps écoulé depuis la dernière frame (cf. surfaces.js → resetSurfaces).
    _prinLastFrameT = null;
    _prinSyncPlayBtn();
    _prinUpdateValeurs();
}

// ── Curseurs ──────────────────────────────────────────────────────────
// Les libellés sont rafraîchis DANS les gestionnaires (et pas seulement dans
// la boucle) : en pause, la boucle ne les mettrait pas à jour.
function onSliderSpeedPrin(v) {
    simPrin.speedFactor = PRIN_SPEED_STEPS[parseInt(v, 10)];
    var lbl = document.getElementById('lbl-speed-prin');
    if (lbl) lbl.textContent = formatFr(simPrin.speedFactor, 2);
}

function onSliderLambdaPrin(v) {
    simPrin.lambda = parseFloat(v);
    var lbl = document.getElementById('lbl-lambda-prin');
    if (lbl) lbl.textContent = formatFr(simPrin.lambda, 2);
    _prinUpdateValeurs();   // δ/λ et la conclusion dépendent de λ
}

function onSliderA1Prin(v) {
    simPrin.a1 = parseFloat(v);
    var lbl = document.getElementById('lbl-a1-prin');
    if (lbl) lbl.textContent = formatFr(simPrin.a1, 2);
}

function onSliderA2Prin(v) {
    simPrin.a2 = parseFloat(v);
    var lbl = document.getElementById('lbl-a2-prin');
    if (lbl) lbl.textContent = formatFr(simPrin.a2, 2);
}

function _prinSetSlider(id, value, lblId, dec) {
    var sl  = document.getElementById(id);
    var lbl = document.getElementById(lblId);
    if (sl)  sl.value = value;
    if (lbl) lbl.textContent = formatFr(value, dec);
}

function _prinSyncSliders() {
    _prinSetSlider('sl-lambda-prin', simPrin.lambda, 'lbl-lambda-prin', 2);
    _prinSetSlider('sl-a1-prin', simPrin.a1, 'lbl-a1-prin', 2);
    _prinSetSlider('sl-a2-prin', simPrin.a2, 'lbl-a2-prin', 2);
    var idx = PRIN_SPEED_STEPS.indexOf(simPrin.speedFactor);
    if (idx < 0) idx = PRIN_SPEED_STEPS.length - 1;
    var sl = document.getElementById('sl-speed-prin');
    if (sl) sl.value = idx;
    var lbl = document.getElementById('lbl-speed-prin');
    if (lbl) lbl.textContent = formatFr(simPrin.speedFactor, 2);
}

// ── Options d'affichage ───────────────────────────────────────────────
function _prinToggleOption(cle, btnId) {
    simPrin[cle] = !simPrin[cle];
    var btn = document.getElementById(btnId);
    if (btn) btn.classList.toggle('active', simPrin[cle]);
}

function togglePrinEnveloppe() { _prinToggleOption('showEnv', 'btn-env-prin'); }
// Aucune de ces options ne touche à la mise en page : le couloir de cotes est
// réservé en permanence (cf. _prinLayout), la scène ne bouge donc pas d'un
// pixel quand on les active.
function togglePrinReperes()   { _prinToggleOption('showReperes', 'btn-reperes-prin'); }
function togglePrinCotes()     { _prinToggleOption('showCotes', 'btn-cotes-prin'); }
function togglePrinDelta()     { _prinToggleOption('showDelta', 'btn-delta-prin'); }
function togglePrinHideBeyondMic() { _prinToggleOption('hideBeyondMic', 'btn-hide-beyond-mic-prin'); }

function togglePrinValeurs() {
    _prinToggleOption('showValeurs', 'btn-toggle-valeurs-prin');
    var box = document.getElementById('readouts-prin');
    if (box) box.style.display = simPrin.showValeurs ? '' : 'none';
    _prinUpdateValeurs();
}

// ── Section "Valeurs" ─────────────────────────────────────────────────
// La classification constructif / destructif / intermédiaire vit désormais
// dans _prinNature() (partagée avec le badge dessiné sous le micro).
function _prinUpdateValeurs() {
    if (!simPrin.showValeurs) return;
    var nat = _prinNature();

    var elS1 = document.getElementById('ro-prin-s1m');
    var elS2 = document.getElementById('ro-prin-s2m');
    if (elS1) elS1.textContent = formatFr(nat.d1, 2);
    if (elS2) elS2.textContent = formatFr(nat.d2, 2);

    var det = document.getElementById('ro-prin-delta-detail');
    if (det) {
        det.innerHTML =
            '<span class="rvd-lhs">δ</span><span class="rvd-eq">= |' + formatFr(nat.d1, 2) +
            ' − ' + formatFr(nat.d2, 2) + '|</span>' +
            '<span class="rvd-lhs"></span><span class="rvd-eq">= ' + formatFr(nat.delta, 2) + ' m</span>';
    }
    var elR = document.getElementById('ro-prin-ratio');
    if (elR) elR.textContent = formatFr(nat.ratio, 2);

    var elN = document.getElementById('ro-prin-nature');
    if (elN) { elN.textContent = nat.texte; elN.style.color = nat.couleur; }
}

// ══════════════════════════════════════════════════════════════════════
//  INITIALISATION — appelée par ui.js → init()
// ══════════════════════════════════════════════════════════════════════
function initPrincipe() {
    if (!document.getElementById('principe-canvas')) return;
    resizePrincipe();
    initPrincipeDrag();
    initPrincipeGraphDrag();
    _prinSyncSliders();
    _prinSyncPlayBtn();
    _prinSyncReprUI();
    setPrincipeMode(simPrin.mode);
    _prinUpdateValeurs();
}
