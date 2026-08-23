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
// Repères d'interférences en BANDES translucides plutôt qu'en traits : ils
// deviennent un fond, et ne concurrencent plus les guides verticaux de S₁,
// S₂ et M (qui, eux, sont des traits).
var PRIN_COL_CONSTR_BG = 'rgba(181, 134, 0, 0.13)';
var PRIN_COL_DESTR_BG  = 'rgba(122, 63, 214, 0.11)';

// ── État global ───────────────────────────────────────────────────────
var simPrin = {

    // ── Mode de l'onglet ────────────────────────────────────────────
    mode : '1d',            // '1d' | '2d' (2d : placeholder pour l'instant)

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
        { y0: padTop + s.unitH * 0.5,             half: s.unitH * 0.5, maxU: 1, titre: 'S₁ seule — y₁(x, t)' },
        { y0: padTop + s.unitH * 1.5 + gap,       half: s.unitH * 0.5, maxU: 1, titre: 'S₂ seule — y₂(x, t)' },
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

// ── Fond d'une bande de tracé + grille verticale tous les 0,5 m ───────
// La grille traverse toute la hauteur de la bande : une abscisse se repère
// ainsi sur les trois lignes d'un seul coup d'œil, ce qu'un tick de 6 px posé
// sur l'axe ne permettait pas.
function _prinDrawBande(ctx, row) {
    var s = simPrin, lw = _prinLW();
    var x = s.plotX0 - 6 * lw, w = s.plotW + 12 * lw;
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
function _prinDrawAxe(ctx, row, avecValeurs) {
    var s = simPrin, fs = _prinFont(), lw = _prinLW();

    // Axe + graduations d'un seul trait : _prinText() écrase strokeStyle
    // (halo couleur fond), on ne l'appelle donc jamais au milieu d'un tracé.
    ctx.save();
    ctx.strokeStyle = PRIN_COL_AXE;
    ctx.lineWidth = 1.4 * lw;
    ctx.beginPath();
    ctx.moveTo(s.plotX0, row.y0);
    ctx.lineTo(s.plotX0 + s.plotW, row.y0);
    ctx.stroke();
    // Graduations à part, plus foncées que l'axe : c'est ce qui les rendait
    // invisibles à 1,2 px dans le gris de l'axe.
    ctx.strokeStyle = PRIN_COL_TICK;
    ctx.lineWidth = 1.4 * lw;
    ctx.beginPath();
    for (var i = 0; i * 0.5 <= PRIN_VIEW_WIDTH_M + 1e-9; i++) {
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

// ── Repères des interférences : bandes de fond + lettres V / N ────────
// Bandes translucides (et non plus traits verticaux) : elles passent au FOND
// et ne concurrencent plus les guides de S₁, S₂ et M, qui sont des traits.
// Les positions sont nommées V (ventre) et N (nœud), les mots du programme,
// plutôt que renvoyées à une légende « constructif / destructif » lointaine.
// Appelé AVANT les axes et les courbes : c'est un repère de fond.
function _prinDrawReperes(ctx, positions) {
    var s = simPrin;
    var row = s.rows[2];
    var y = row.y0 - row.half, h = row.half * 2;
    var largeur = Math.max(6, Math.min(16, s.lambda * s.pxPerM * 0.14));
    ctx.save();
    for (var i = 0; i < positions.length; i++) {
        var px = _prinXpx(positions[i].x);
        ctx.fillStyle = (positions[i].type === 'V') ? PRIN_COL_CONSTR_BG : PRIN_COL_DESTR_BG;
        ctx.fillRect(px - largeur / 2, y + 1, largeur, h - 2);
    }
    ctx.restore();
}

// Lettres V / N posées sur l'axe de la bande somme — dessinées APRÈS les
// courbes, dans une pastille pleine, sinon le tracé passerait dessus.
function _prinDrawReperesLettres(ctx, positions) {
    var s = simPrin, fs = _prinFont();
    var row = s.rows[2];
    var r = Math.max(6, fs * 0.54);
    // Juste AU-DESSUS de l'axe : la moitié basse de la bande est occupée par
    // le micro suspendu et son badge, et le haut par la légende.
    var y = row.y0 - r - 3 * _prinLW();
    ctx.save();
    for (var i = 0; i < positions.length; i++) {
        var px = _prinXpx(positions[i].x);
        var estV = (positions[i].type === 'V');
        ctx.fillStyle = estV ? PRIN_COL_CONSTR : PRIN_COL_DESTR;
        ctx.beginPath();
        ctx.arc(px, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold ' + (fs * 0.85) + 'px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(estV ? 'V' : 'N', px, y + 0.5);
    }
    ctx.restore();
}

// Une entrée de légende "trait + libellé", alignée à DROITE de xDroite ; renvoie
// l'abscisse gauche atteinte, pour enchaîner l'entrée suivante. Le trait est
// tracé plutôt qu'écrit avec un caractère semi-graphique : ces glyphes ne sont
// pas garantis dans toutes les polices système.
// Une entrée de légende « pastille + libellé », alignée à DROITE de xDroite ;
// renvoie l'abscisse gauche atteinte, pour enchaîner l'entrée suivante. La
// pastille reprend exactement le marqueur posé sur l'axe (cf.
// _prinDrawReperesLettres), lettre blanche comprise.
function _prinLegendeEntree(ctx, xDroite, y, couleur, lettre, texte, police) {
    ctx.font = police;
    var largeur = ctx.measureText(texte).width;
    _prinText(ctx, texte, xDroite, y, couleur, police, 'right', 'middle', PRIN_COL_BAND);
    var r = Math.max(6, _prinFont() * 0.54);
    var xp = xDroite - largeur - 6 - r;
    ctx.save();
    ctx.fillStyle = couleur;
    ctx.beginPath();
    ctx.arc(xp, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + (_prinFont() * 0.85) + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lettre, xp, y + 0.5);
    ctx.restore();
    return xp - r - 12;
}

// Légende des repères — dessinée APRÈS les courbes, sinon le tracé de la
// superposition passerait par-dessus.
function _prinDrawReperesLegende(ctx) {
    var s = simPrin, fs = _prinFont();
    var row = s.rows[2];
    var y = row.y0 - row.half * 0.86;
    var police = 'bold ' + (fs * 0.92) + 'px "Segoe UI", Arial, sans-serif';
    var x = _prinLegendeEntree(ctx, s.plotX0 + s.plotW, y, PRIN_COL_DESTR, 'N', 'nœud (destructif)', police);
    _prinLegendeEntree(ctx, x, y, PRIN_COL_CONSTR, 'V', 'ventre (constructif)', police);
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
function _prinDrawTitre(ctx, row, couleur) {
    var s = simPrin, fs = _prinFont();
    if (row.half < fs * 1.4) return;      // bande trop basse : le titre nuirait
    var police = 'bold ' + (fs * 0.92) + 'px "Segoe UI", Arial, sans-serif';
    ctx.save();
    ctx.font = police;
    var r = fs * 0.28;
    var w = ctx.measureText(row.titre).width + fs * 1.5 + r * 2;
    var h = fs * 1.45;
    var x = s.plotX0 - 2, y = row.y0 - row.half + 3 * _prinLW();
    ctx.fillStyle = PRIN_COL_BG;
    ctx.globalAlpha = 0.92;
    _prinRoundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = couleur;
    ctx.beginPath();
    ctx.arc(x + fs * 0.55, y + h / 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PRIN_COL_LABEL;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(row.titre, x + fs * 0.55 + r + fs * 0.35, y + h / 2 + 0.5);
    ctx.restore();
}

// ── Dessin complet ────────────────────────────────────────────────────
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

    // Fonds de bande + grille : tout au fond, avant le moindre repère
    for (var b = 0; b < 3; b++) _prinDrawBande(ctx, s.rows[b]);

    // Repères d'interférences : bandes translucides, ligne somme uniquement
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
        _prinDrawAxe(ctx, row, r === 2);
        _prinDrawEchelleY(ctx, row);

        if (r === 2 && s.showEnv) _prinDrawEnveloppe(ctx, row, t);

        var fy, col, xMin, xMax;
        if (r === 0) {
            // "S₁ seule" : tracée du haut-parleur jusqu'au bord de la fenêtre
            // (elle ne s'arrête plus à l'abscisse de S₂), jamais avant S₁.
            fy = function (x) { return _prinY1Libre(x, t); };
            col = PRIN_COL_S1; xMin = s.x1; xMax = PRIN_VIEW_WIDTH_M;
        } else if (r === 1) {
            fy = function (x) { return _prinY2Libre(x, t); };
            col = PRIN_COL_S2; xMin = 0; xMax = s.x2;
        } else {
            // Superposition : affichée seulement entre S₁ et S₂ (comportement
            // inchangé), mais domaine de tracé explicitement borné à [x₁, x₂] —
            // sans cela, le tracé démarrait en x = 0 avec une valeur nulle
            // (hors zone), créant le même faux « trait vertical » au niveau de
            // chaque source que sur les lignes 1 et 2 avant leur correctif.
            fy = function (x) { return _prinY1(x, t) + _prinY2(x, t); };
            col = PRIN_COL_SOMME; xMin = s.x1; xMax = s.x2;
        }
        _prinDrawCourbe(ctx, row, fy, col, (r === 2 ? 2.6 : 2) * lw, xMin, xMax, r === 2);

        // Point de lecture du micro sur la courbe de la bande
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

        // Valeur lue en M — sans elle, le point bleu oscille sans que rien ne
        // dise ce qu'il vaut, et le lien entre les trois bandes reste implicite.
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

        _prinDrawTitre(ctx, row, col);

        // Poignées déplaçables : S₁ sur les lignes 1 et 3, S₂ sur les lignes 2 et 3.
        // Le repère de position (ergot + point) est dessiné APRÈS, par-dessus la
        // courbe et le pictogramme, pour rester net à l'endroit exact x₁/x₂.
        if (r === 0 || r === 2) {
            _prinDrawHautParleur(ctx, xS1, row.y0, srcH, PRIN_COL_S1,
                                  'S₁ (' + formatFr(s.x1, 2) + ' m)', 1, phase);
            _prinDrawSourceMark(ctx, xS1 + srcH * PRIN_SRC_TIP_RATIO, row.y0, PRIN_COL_S1);
        }
        if (r === 1 || r === 2) {
            _prinDrawHautParleur(ctx, xS2, row.y0, srcH, PRIN_COL_S2,
                                  'S₂ (' + formatFr(s.x2, 2) + ' m)', -1, phase);
            _prinDrawSourceMark(ctx, xS2 - srcH * PRIN_SRC_TIP_RATIO, row.y0, PRIN_COL_S2);
        }
    }

    // Marqueurs V / N + légende : après les courbes, sinon le tracé passerait
    // par-dessus.
    if (s.showReperes) {
        _prinDrawReperesLettres(ctx, positions);
        _prinDrawReperesLegende(ctx);
    }

    // Micro M — poignée sur l'axe de la ligne somme uniquement
    var row3 = s.rows[2];
    _prinDrawMicro(ctx, xM, row3.y0, micH, 'M (' + formatFr(s.xM, 2) + ' m)');
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
// que la zone saisissable soit exactement celle que l'élève voit.
function _prinHit(px, py) {
    var s = simPrin;
    if (!s.rows.length) return null;
    for (var r = 0; r < 3; r++) {
        var row = s.rows[r];
        if (py < row.y0 - row.half || py > row.y0 + row.half) continue;
        var cand = [];
        if (r === 2) cand.push(['M', _prinXpx(s.xM)]);   // prioritaire : toujours entre les 2 sources
        if (r === 0 || r === 2) cand.push(['S1', _prinXpx(s.x1)]);
        if (r === 1 || r === 2) cand.push(['S2', _prinXpx(s.x2)]);
        for (var i = 0; i < cand.length; i++) {
            if (Math.abs(px - cand[i][1]) <= _prinGrabTol()) return cand[i][0];
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

    canvas.addEventListener('pointerdown', function (e) {
        var p = _prinPointerPos(canvas, e);
        var hit = _prinHit(p.x, p.y);
        if (!hit) return;
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
        canvas.style.cursor = simPrin.hover ? 'grab' : 'default';
    });

    function fin(e) {
        if (!simPrin.drag) return;
        simPrin.drag = null;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        var p = _prinPointerPos(canvas, e);
        simPrin.hover = _prinHit(p.x, p.y);
        canvas.style.cursor = simPrin.hover ? 'grab' : 'default';
    }
    canvas.addEventListener('pointerup', fin);
    canvas.addEventListener('pointercancel', fin);
    canvas.addEventListener('pointerleave', function () {
        if (!simPrin.drag) { simPrin.hover = null; canvas.style.cursor = 'default'; }
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
    _prinSyncSliders();
    _prinSyncPlayBtn();
    setPrincipeMode(simPrin.mode);
    _prinUpdateValeurs();
}
