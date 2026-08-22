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
//  APPARENTE de 1 m/s (le front traverse les 4 m de l'axe en 4 s au
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
var PRIN_RALENTI      = 340;   // facteur de ralenti (cf. bandeau de doc ci-dessus)
var PRIN_MARGE_M      = 0.10;  // écart minimal imposé entre deux éléments voisins (m)
var PRIN_BORD_M       = 0.10;  // marge minimale aux deux extrémités de l'axe (m)

// Crans du curseur de vitesse d'animation — identiques au reste du site
// (cf. ondes/js/ui.js → SPEED_STEPS, surfaces.js → SURF_SPEED_STEPS).
var PRIN_SPEED_STEPS = [0.10, 0.25, 0.50, 1.00];

// Valeurs par défaut des réglages et des positions
var PRIN_LAMBDA_DEF = 0.60, PRIN_A1_DEF = 0.80, PRIN_A2_DEF = 0.80;
var PRIN_X1_DEF = 0.30, PRIN_X2_DEF = 3.70, PRIN_XM_DEF = 2.00;

// ── Couleurs ──────────────────────────────────────────────────────────
// Fond clair (#fdf8f0, "fond simulation" de la charte) : cet onglet trace des
// COURBES et non un champ, contrairement aux deux autres onglets de la page.
var PRIN_COL_BG      = '#fdf8f0';
var PRIN_COL_AXE     = '#b0a898';
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

    // ── Glisser-déposer ─────────────────────────────────────────────
    drag : null    // 'S1' | 'S2' | 'M' | null
};

// ══════════════════════════════════════════════════════════════════════
//  PHYSIQUE
// ══════════════════════════════════════════════════════════════════════

// Pulsation ω = 2π·c/λ (rad/s)
function _prinOmega() { return 2 * Math.PI * PRIN_C / simPrin.lambda; }

// Onde issue de S₁, qui se propage vers la DROITE. Nulle avant la source, au
// delà de S₂ (un haut-parleur ne rayonne pas à travers l'autre — on ne
// représente que la zone S₁→S₂, pas la moitié arrière de S₁) et tant que le
// front n'est pas arrivé (t < d/c) : c'est ce qui rend la propagation visible
// au lancement. Déplacer la source pendant l'animation re-cale son front sur
// la nouvelle position (approximation assumée : pas d'historique causal comme
// _surfSourceContrib, inutile ici).
function _prinY1(x, t) {
    if (x > simPrin.x2) return 0;
    var d = x - simPrin.x1;
    if (d < 0) return 0;
    var tr = t - d / PRIN_C;
    if (tr < 0) return 0;
    return simPrin.a1 * Math.sin(_prinOmega() * tr);
}

// Onde issue de S₂, qui se propage vers la GAUCHE (mêmes remarques, symétriques).
function _prinY2(x, t) {
    if (x < simPrin.x1) return 0;
    var d = simPrin.x2 - x;
    if (d < 0) return 0;
    var tr = t - d / PRIN_C;
    if (tr < 0) return 0;
    return simPrin.a2 * Math.sin(_prinOmega() * tr);
}

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
function _prinFont() {
    return Math.max(10, Math.min(17, simPrin.canvasW / 62));
}

// Découpe verticale : 4 "unités" de hauteur — 1 pour y₁, 1 pour y₂, 2 pour la
// somme. La ligne somme reçoit le double PRÉCISÉMENT parce que y₁+y₂ peut
// atteindre A₁+A₂ = 2 : l'échelle verticale (ampPx) reste ainsi IDENTIQUE et
// FIXE sur les trois lignes, donc un doublement d'amplitude se voit vraiment.
function _prinLayout() {
    var s = simPrin;
    var fs = _prinFont();
    var padTop = fs * 1.6;
    var padBot = fs * 2.8;                   // graduations sous l'axe du bas
    var padL   = Math.max(38, s.canvasW * 0.045);
    var padR   = Math.max(24, s.canvasW * 0.030);

    s.plotX0 = padL;
    s.plotW  = Math.max(10, s.canvasW - padL - padR);
    s.pxPerM = s.plotW / PRIN_VIEW_WIDTH_M;

    var utile = Math.max(40, s.canvasH - padTop - padBot);
    s.unitH = utile / 4;
    s.ampPx = s.unitH * 0.5 * 0.82;          // ±1 tient dans une unité
    // Ligne de base des valeurs chiffrées de l'axe : SOUS la dernière bande
    // (padBot leur est réservé), cf. _prinDrawAxe.
    s.axeLabelY = padTop + s.unitH * 4 + fs * 0.35;

    s.rows = [
        { y0: padTop + s.unitH * 0.5, half: s.unitH * 0.5, titre: 'S₁ seule — y₁(x, t)' },
        { y0: padTop + s.unitH * 1.5, half: s.unitH * 0.5, titre: 'S₂ seule — y₂(x, t)' },
        { y0: padTop + s.unitH * 3.0, half: s.unitH * 1.0, titre: 'Superposition — y₁ + y₂' }
    ];
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
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    simPrin.canvasW = w;
    simPrin.canvasH = h;
    _prinLayout();
}

// ══════════════════════════════════════════════════════════════════════
//  RENDU
// ══════════════════════════════════════════════════════════════════════

// Texte cerné d'un halo couleur fond : indispensable ici, tous les libellés
// (sources, cotes, repères) se superposent aux courbes.
function _prinText(ctx, txt, x, y, color, font, align, baseline) {
    ctx.font = font;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = baseline || 'middle';
    ctx.lineWidth = Math.max(3, _prinFont() * 0.28);
    ctx.strokeStyle = PRIN_COL_BG;
    ctx.lineJoin = 'round';
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = color;
    ctx.fillText(txt, x, y);
}

// ── Axe horizontal d'une ligne, gradué en mètres ──────────────────────
// Graduations tous les 0,5 m sur les trois lignes ; valeurs chiffrées une seule
// fois, SOUS la dernière ligne (les trois axes partagent la même échelle) et
// hors des bandes de tracé, pour ne pas se superposer aux courbes.
function _prinDrawAxe(ctx, row, avecValeurs) {
    var s = simPrin, fs = _prinFont();

    // Axe + graduations d'un seul trait : _prinText() écrase strokeStyle
    // (halo couleur fond), on ne l'appelle donc jamais au milieu d'un tracé.
    ctx.save();
    ctx.strokeStyle = PRIN_COL_AXE;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(s.plotX0, row.y0);
    ctx.lineTo(s.plotX0 + s.plotW, row.y0);
    for (var i = 0; i * 0.5 <= PRIN_VIEW_WIDTH_M + 1e-9; i++) {
        var px = _prinXpx(i * 0.5);
        ctx.moveTo(px, row.y0);
        ctx.lineTo(px, row.y0 + ((i % 2 === 0) ? 6 : 3.5));
    }
    ctx.stroke();
    ctx.restore();

    if (!avecValeurs) return;
    for (var j = 0; j <= PRIN_VIEW_WIDTH_M + 1e-9; j++) {
        _prinText(ctx, formatFr(j, 0), _prinXpx(j), s.axeLabelY,
                  PRIN_COL_LABEL, (fs * 0.9) + 'px monospace', 'center', 'top');
    }
    _prinText(ctx, 'x (m)', s.plotX0 + s.plotW, s.axeLabelY + fs * 1.15,
              PRIN_COL_LABEL, 'bold ' + (fs * 0.9) + 'px monospace', 'right', 'top');
}

// ── Courbe y(x) échantillonnée une valeur par colonne de pixels ───────
function _prinDrawCourbe(ctx, row, fy, color, largeur) {
    var s = simPrin;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = largeur;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var i = 0; i <= s.plotW; i++) {
        var y = row.y0 - fy(i / s.pxPerM) * s.ampPx;
        if (i === 0) ctx.moveTo(s.plotX0, y); else ctx.lineTo(s.plotX0 + i, y);
    }
    ctx.stroke();
    ctx.restore();
}

// ── Enveloppe ±A(x) de la résultante (ligne somme) ────────────────────
function _prinDrawEnveloppe(ctx, row, t) {
    var s = simPrin;
    ctx.save();
    ctx.strokeStyle = PRIN_COL_ENV;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 4]);
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
function _prinDrawReperes(ctx) {
    var s = simPrin;
    var row = s.rows[2];
    var somme = s.x1 + s.x2;
    var kMax = Math.floor((s.x2 - s.x1) / s.lambda) + 1;
    ctx.save();
    ctx.lineWidth = 2;
    for (var k = -kMax; k <= kMax; k++) {
        for (var type = 0; type < 2; type++) {
            var x = (somme - (k + (type === 1 ? 0.5 : 0)) * s.lambda) / 2;
            if (x <= s.x1 || x >= s.x2) continue;   // hors zone de recouvrement
            var px = _prinXpx(x);
            ctx.strokeStyle = (type === 0) ? PRIN_COL_CONSTR : PRIN_COL_DESTR;
            ctx.setLineDash(type === 0 ? [] : [3, 3]);
            ctx.beginPath();
            ctx.moveTo(px, row.y0 - row.half * 0.92);
            ctx.lineTo(px, row.y0 + row.half * 0.92);
            ctx.stroke();
        }
    }
    ctx.restore();
}

// Une entrée de légende "trait + libellé", alignée à DROITE de xDroite ; renvoie
// l'abscisse gauche atteinte, pour enchaîner l'entrée suivante. Le trait est
// tracé plutôt qu'écrit avec un caractère semi-graphique : ces glyphes ne sont
// pas garantis dans toutes les polices système.
function _prinLegendeEntree(ctx, xDroite, y, couleur, tirets, texte, police) {
    ctx.font = police;
    var largeur = ctx.measureText(texte).width;
    _prinText(ctx, texte, xDroite, y, couleur, police, 'right', 'middle');
    var xt = xDroite - largeur - 6;
    ctx.save();
    ctx.strokeStyle = couleur;
    ctx.lineWidth = 2;
    ctx.setLineDash(tirets);
    ctx.beginPath();
    ctx.moveTo(xt, y - 6);
    ctx.lineTo(xt, y + 6);
    ctx.stroke();
    ctx.restore();
    return xt - 10;
}

// Légende des repères — dessinée APRÈS les courbes, sinon le tracé de la
// superposition passerait par-dessus.
function _prinDrawReperesLegende(ctx) {
    var s = simPrin, fs = _prinFont();
    var row = s.rows[2];
    var y = row.y0 - row.half * 0.88;
    var police = 'bold ' + (fs * 0.85) + 'px "Segoe UI", Arial, sans-serif';
    var x = _prinLegendeEntree(ctx, s.plotX0 + s.plotW, y, PRIN_COL_DESTR, [3, 3], 'destructif', police);
    _prinLegendeEntree(ctx, x, y, PRIN_COL_CONSTR, [], 'constructif', police);
}

// ── Haut-parleur schématique posé sur l'axe ───────────────────────────
// `sens` = +1 émet vers la droite (S₁), −1 vers la gauche (S₂).
function _prinDrawHautParleur(ctx, xpx, y0, h, color, label, sens) {
    var w = h * 0.42;
    ctx.save();
    ctx.translate(xpx, y0);
    ctx.scale(sens, 1);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    // Caisse
    ctx.beginPath();
    ctx.rect(-w * 1.15, -h / 2, w, h);
    ctx.fill();
    // Pavillon
    ctx.beginPath();
    ctx.moveTo(-w * 0.15, -h / 2);
    ctx.lineTo(w * 0.55, -h * 0.82);
    ctx.lineTo(w * 0.55, h * 0.82);
    ctx.lineTo(-w * 0.15, h / 2);
    ctx.closePath();
    ctx.fill();
    // Ondes émises
    ctx.lineWidth = 1.8;
    for (var i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(w * 0.55, 0, w * (0.35 + 0.45 * i), -Math.PI / 3, Math.PI / 3);
        ctx.stroke();
    }
    ctx.restore();
    // Libellé SOUS l'axe : au-dessus, il chevaucherait le titre de la ligne
    // (coin haut-gauche de la bande), la source la plus à gauche étant proche.
    _prinText(ctx, label, xpx, y0 + h * 0.72, color,
              'bold ' + (_prinFont() * 1.05) + 'px "Segoe UI", Arial, sans-serif',
              'center', 'top');
}

// ── Micro M : poignée FIXE sur l'axe (le point de lecture, lui, oscille avec
//    la courbe — cf. drawPrincipe). Une poignée qui suivrait la courbe serait
//    beaucoup plus difficile à attraper pendant l'animation.
function _prinDrawMicro(ctx, xpx, y0, h) {
    ctx.save();
    ctx.fillStyle = PRIN_COL_M;
    ctx.strokeStyle = PRIN_COL_M;
    ctx.lineWidth = 2.2;
    ctx.beginPath();                                    // pied
    ctx.moveTo(xpx, y0 + h * 0.62);
    ctx.lineTo(xpx, y0 + h * 0.16);
    ctx.stroke();
    ctx.beginPath();                                    // socle
    ctx.moveTo(xpx - h * 0.24, y0 + h * 0.62);
    ctx.lineTo(xpx + h * 0.24, y0 + h * 0.62);
    ctx.stroke();
    ctx.beginPath();                                    // capsule
    ctx.ellipse(xpx, y0 - h * 0.06, h * 0.17, h * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    _prinText(ctx, 'M', xpx, y0 + h * 0.76, PRIN_COL_M,
              'bold ' + (_prinFont() * 1.05) + 'px "Segoe UI", Arial, sans-serif',
              'center', 'top');
}

// ── Double flèche cotée horizontale (cotes S₁M / S₂M) ─────────────────
function _prinDrawCote(ctx, xa, xb, y, label, color) {
    var fs = _prinFont();
    var t = Math.min(7, Math.max(4, fs * 0.45));   // demi-hauteur des pointes
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.8;
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
    ctx.lineWidth = 1.2;                           // traits d'attache
    ctx.beginPath();
    ctx.moveTo(xa, y - t); ctx.lineTo(xa, y + t);
    ctx.moveTo(xb, y - t); ctx.lineTo(xb, y + t);
    ctx.stroke();
    ctx.restore();
    _prinText(ctx, label, (xa + xb) / 2, y - t * 1.3, color,
              'bold ' + (fs * 0.95) + 'px "Segoe UI", Arial, sans-serif', 'center', 'bottom');
}

// ── Dessin complet ────────────────────────────────────────────────────
function drawPrincipe() {
    var canvas = document.getElementById('principe-canvas');
    if (!canvas || simPrin.canvasW < 10) return;
    var ctx = canvas.getContext('2d');
    var s = simPrin, t = s.simTime, fs = _prinFont();

    ctx.clearRect(0, 0, s.canvasW, s.canvasH);
    ctx.fillStyle = PRIN_COL_BG;
    ctx.fillRect(0, 0, s.canvasW, s.canvasH);

    var hpH = Math.min(s.unitH * 0.55, s.ampPx * 1.25);   // taille du micro
    var srcH = hpH * 0.5;                                 // taille des haut-parleurs — moitié du micro
    var xS1 = _prinXpx(s.x1), xS2 = _prinXpx(s.x2), xM = _prinXpx(s.xM);

    // Repères d'interférences : sous tout le reste, ligne somme uniquement
    if (s.showReperes) _prinDrawReperes(ctx);

    for (var r = 0; r < 3; r++) {
        var row = s.rows[r];
        _prinDrawAxe(ctx, row, r === 2);

        if (r === 2 && s.showEnv) _prinDrawEnveloppe(ctx, row, t);

        var fy, col;
        if (r === 0)      { fy = function (x) { return _prinY1(x, t); };                 col = PRIN_COL_S1; }
        else if (r === 1) { fy = function (x) { return _prinY2(x, t); };                 col = PRIN_COL_S2; }
        else              { fy = function (x) { return _prinY1(x, t) + _prinY2(x, t); }; col = PRIN_COL_SOMME; }
        _prinDrawCourbe(ctx, row, fy, col, r === 2 ? 2.6 : 2);

        // Guide vertical au niveau de M + point de lecture sur la courbe : les
        // trois lignes se lisent ainsi sur une même verticale (y₁ en M, y₂ en M,
        // et leur somme).
        ctx.save();
        ctx.strokeStyle = PRIN_COL_M;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(xM, row.y0 - row.half);
        ctx.lineTo(xM, row.y0 + row.half);
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.fillStyle = PRIN_COL_M;
        ctx.beginPath();
        ctx.arc(xM, row.y0 - fy(s.xM) * s.ampPx, Math.max(3.5, fs * 0.3), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Titre de la ligne (coin haut-gauche de sa bande)
        _prinText(ctx, row.titre, s.plotX0, row.y0 - row.half + fs * 0.1,
                  PRIN_COL_LABEL, 'bold ' + (fs * 0.9) + 'px "Segoe UI", Arial, sans-serif',
                  'left', 'top');

        // Poignées déplaçables : S₁ sur les lignes 1 et 3, S₂ sur les lignes 2 et 3
        if (r === 0 || r === 2) _prinDrawHautParleur(ctx, xS1, row.y0, srcH, PRIN_COL_S1, 'S₁', 1);
        if (r === 1 || r === 2) _prinDrawHautParleur(ctx, xS2, row.y0, srcH, PRIN_COL_S2, 'S₂', -1);
    }

    if (s.showReperes) _prinDrawReperesLegende(ctx);

    // Micro M — poignée sur l'axe de la ligne somme uniquement
    _prinDrawMicro(ctx, xM, s.rows[2].y0, hpH);

    // Cotes S₁M / S₂M
    if (s.showCotes) {
        var row3 = s.rows[2];
        _prinDrawCote(ctx, xS1, xM, row3.y0 + row3.half * 0.55,
                      'S₁M = ' + formatFr(s.xM - s.x1, 2) + ' m', PRIN_COL_S1);
        _prinDrawCote(ctx, xM, xS2, row3.y0 + row3.half * 0.82,
                      'S₂M = ' + formatFr(s.x2 - s.xM, 2) + ' m', PRIN_COL_S2);
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

var PRIN_GRAB_TOL = 16;   // px CSS

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
            if (Math.abs(px - cand[i][1]) <= PRIN_GRAB_TOL) return cand[i][0];
        }
    }
    return null;
}

// Applique une position glissée en respectant l'ordre S₁ < M < S₂ et les
// marges. Pas de "poussée" : chaque élément est simplement borné par ses
// voisins, ce qui évite qu'un glissement rapide n'emmène tout le montage.
function _prinSetDragPos(quoi, xm) {
    var s = simPrin;
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

    canvas.addEventListener('pointerdown', function (e) {
        var p = _prinPointerPos(canvas, e);
        var hit = _prinHit(p.x, p.y);
        if (!hit) return;
        simPrin.drag = hit;
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
        _prinSetDragPos(hit, _prinXm(p.x));
    });

    canvas.addEventListener('pointermove', function (e) {
        var p = _prinPointerPos(canvas, e);
        if (simPrin.drag) {
            _prinSetDragPos(simPrin.drag, _prinXm(p.x));
            return;
        }
        canvas.style.cursor = _prinHit(p.x, p.y) ? 'grab' : 'default';
    });

    function fin(e) {
        if (!simPrin.drag) return;
        simPrin.drag = null;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        var p = _prinPointerPos(canvas, e);
        canvas.style.cursor = _prinHit(p.x, p.y) ? 'grab' : 'default';
    }
    canvas.addEventListener('pointerup', fin);
    canvas.addEventListener('pointercancel', fin);
    canvas.addEventListener('pointerleave', function () {
        if (!simPrin.drag) canvas.style.cursor = 'default';
    });
}

// ══════════════════════════════════════════════════════════════════════
//  CONTRÔLES DU PANNEAU
// ══════════════════════════════════════════════════════════════════════

// ── Mode 1D / 2D ──────────────────────────────────────────────────────
// Le mode 2D est un placeholder : il masque la zone de tracé ET les blocs de
// réglages propres au 1D, sans toucher à l'état de l'animation (revenir en 1D
// retrouve la scène telle qu'on l'avait laissée).
function setPrincipeMode(mode) {
    if (mode !== '2d') mode = '1d';
    simPrin.mode = mode;
    var un = (mode === '1d');
    document.getElementById('btn-mode-1d').classList.toggle('active', un);
    document.getElementById('btn-mode-2d').classList.toggle('active', !un);
    document.getElementById('prin-scene-area').style.display = un ? '' : 'none';
    document.getElementById('prin-2d-placeholder').style.display = un ? 'none' : '';
    document.getElementById('prin-1d-blocks').style.display = un ? '' : 'none';
    // Le canvas n'a des dimensions exploitables qu'une fois réaffiché.
    if (un) resizePrincipe();
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

// RAZ : remet l'ANIMATION à zéro (temps, pause, positions des trois éléments).
// Les réglages λ / A₁ / A₂ ne sont pas touchés — ils relèvent du bouton
// "Par défaut" de la section Paramètres.
function resetPrincipe() {
    simPrin.simTime = 0;
    simPrin.paused = true;
    simPrin.x1 = PRIN_X1_DEF;
    simPrin.x2 = PRIN_X2_DEF;
    simPrin.xM = PRIN_XM_DEF;
    simPrin.drag = null;
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

// Remet les seuls PARAMÈTRES (λ, A₁, A₂) à leurs valeurs par défaut.
function resetParamsPrincipe() {
    simPrin.lambda = PRIN_LAMBDA_DEF;
    simPrin.a1 = PRIN_A1_DEF;
    simPrin.a2 = PRIN_A2_DEF;
    _prinSyncSliders();
    _prinUpdateValeurs();
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
function togglePrinReperes()   { _prinToggleOption('showReperes', 'btn-reperes-prin'); }
function togglePrinCotes()     { _prinToggleOption('showCotes', 'btn-cotes-prin'); }

function togglePrinValeurs() {
    _prinToggleOption('showValeurs', 'btn-toggle-valeurs-prin');
    var box = document.getElementById('readouts-prin');
    if (box) box.style.display = simPrin.showValeurs ? '' : 'none';
    _prinUpdateValeurs();
}

// ── Section "Valeurs" ─────────────────────────────────────────────────
// Tolérance sur δ/λ pour conclure : au-delà, l'interférence est dite
// "intermédiaire" (ni tout à fait constructive, ni tout à fait destructive).
var PRIN_TOL_RATIO = 0.03;

function _prinUpdateValeurs() {
    if (!simPrin.showValeurs) return;
    var s = simPrin;
    var d1 = s.xM - s.x1, d2 = s.x2 - s.xM;
    var delta = Math.abs(d1 - d2);
    var ratio = delta / s.lambda;

    var elS1 = document.getElementById('ro-prin-s1m');
    var elS2 = document.getElementById('ro-prin-s2m');
    if (elS1) elS1.textContent = formatFr(d1, 2);
    if (elS2) elS2.textContent = formatFr(d2, 2);

    var det = document.getElementById('ro-prin-delta-detail');
    if (det) {
        det.innerHTML =
            '<span class="rvd-lhs">δ</span><span class="rvd-eq">= |' + formatFr(d1, 2) +
            ' − ' + formatFr(d2, 2) + '|</span>' +
            '<span class="rvd-lhs"></span><span class="rvd-eq">= ' + formatFr(delta, 2) + ' m</span>';
    }
    var elR = document.getElementById('ro-prin-ratio');
    if (elR) elR.textContent = formatFr(ratio, 2);

    // Constructif si δ/λ est (presque) entier, destructif s'il est (presque)
    // demi-entier — l'écart au demi-entier se mesure en décalant de ½.
    var ecartEntier = Math.abs(ratio - Math.round(ratio));
    var ecartDemi   = Math.abs((ratio + 0.5) - Math.round(ratio + 0.5));
    var texte, couleur;
    if (ecartEntier < PRIN_TOL_RATIO) {
        texte = 'δ ≈ k·λ → interférence constructive';
        couleur = PRIN_COL_CONSTR;
    } else if (ecartDemi < PRIN_TOL_RATIO) {
        texte = 'δ ≈ (k + ½)·λ → interférence destructive';
        couleur = PRIN_COL_DESTR;
    } else {
        texte = 'Cas intermédiaire';
        couleur = '#5a6a78';
    }
    var elN = document.getElementById('ro-prin-nature');
    if (elN) { elN.textContent = texte; elN.style.color = couleur; }
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
