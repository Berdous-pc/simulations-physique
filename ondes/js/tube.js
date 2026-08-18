// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  tube.js — Rendu du canvas d'animation
//  Responsabilités : tube, membrane, particules, balises, sélection,
//  splitter draggable, resize.
//  Dépend de : sim.js (sim, waveDisplacement, particleRadius, initCols,
//               updateCelerite, C_BASE, K_DEFAULT, RHO_DEFAULT)
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Références canvas ─────────────────────────────────────────────────
var tubeCanvas = null;
var tubeCtx    = null;

// Épaisseur visuelle de la membrane dans le canvas (px)
var MEM_THICKNESS = 14;

// ── État de l'interaction souris sur le canvas tube ───────────────────
var tubeInter = {
    mode      : null,   // null | 'beacon1-drag' | 'beacon2-drag'
};

// ── Anti-rebond resize ────────────────────────────────────────────────
var tubeResizeRAF = false;

// ══════════════════════════════════════════════════════════════════════
//  resize — adapte le canvas et recalibrise la physique
// ══════════════════════════════════════════════════════════════════════

function resizeTube() {
    tubeCanvas = tubeCanvas || document.getElementById('tube-canvas');
    tubeCtx    = tubeCtx    || tubeCanvas.getContext('2d');

    var wrap = document.getElementById('tube-canvas-wrap');
    var w    = wrap.clientWidth;
    var h    = wrap.clientHeight;
    if (w < 10 || h < 28) return;  // tubeH = h*0.88-4 ≥ 20 requiert h ≥ 28

    var dpr = window.devicePixelRatio || 1;
    tubeCanvas.width  = Math.round(w * dpr);
    tubeCanvas.height = Math.round(h * dpr);
    tubeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // ── Géométrie interne du tube ─────────────────────────────────────
    var marginH      = 13;   // 5 px de plus de chaque côté → labels règle non croppés
    var marginTop    = 4;
    var marginBottom = Math.round(h * 0.12);
    sim.tubeLeft   = marginH + MEM_THICKNESS;
    sim.tubeRight  = w - marginH;
    sim.tubeTop    = marginTop;
    sim.tubeBottom = Math.max(sim.tubeTop + 20, h - marginBottom);
    sim.tubeLength = sim.tubeRight - sim.tubeLeft;

    // ── Calibration de C_BASE ─────────────────────────────────────────
    // Cohérence physique : C_DISPLAY_FACTOR × L_px / L_physical_cm
    //   = 10 × L_px / 40 cm = L_px / 4
    // → à K_DEFAULT et RHO_DEFAULT, l'onde traverse le tube en ~2 s,
    //   et λ_graphique = c_cms / f (en cm) — unités cohérentes.
    var c_norm_default = Math.sqrt(K_DEFAULT / RHO_DEFAULT);   // = 2
    C_BASE = sim.tubeLength / (2.0 * c_norm_default);

    // ── Amplitude de la membrane ──────────────────────────────────────
    // Calibrée sur dx0 à ρ=1 pour un ratio A/dx0 ≈ 7.5 constant,
    // quelle que soit la taille de la fenêtre.
    var nColsRho1    = Math.max(15, Math.round(sim.tubeLength / 9));
    var dx0Rho1      = sim.tubeLength / nColsRho1;
    sim.memAmplitude = Math.max(27, Math.min(90, dx0Rho1 * 7.5));

    // ── Positions des balises ──────────────────────────────────────────
    // Recalculées depuis frac (position relative) pour rester à distance
    // constante de la membrane quelle que soit la largeur du canvas.
    sim.beacon1.x = sim.tubeLeft + sim.tubeLength * sim.beacon1.frac;
    sim.beacon2.x = sim.tubeLeft + sim.tubeLength * sim.beacon2.frac;

    updateCelerite();
    initCols();
}

function scheduleResizeTube() {
    if (tubeResizeRAF) return;
    tubeResizeRAF = true;
    requestAnimationFrame(function() {
        tubeResizeRAF = false;
        resizeTube();
        resizeCorde();
        if (typeof resizeVagues === 'function') resizeVagues();
        resizeGraph();
    });
}

// ══════════════════════════════════════════════════════════════════════
//  Splitter draggable (sépare #anim-area et #graph-area)
// ══════════════════════════════════════════════════════════════════════

(function initSplitter() {
    var splitter   = null;
    var animArea   = null;
    var graphArea  = null;
    var leftCol    = null;
    var dragging   = false;
    var startY     = 0;
    var startAnim  = 0;
    var minAnim    = 0;
    var maxAnim    = 0;

    function init() {
        splitter  = document.getElementById('left-splitter');
        animArea  = document.getElementById('anim-area');
        graphArea = document.getElementById('graph-area');
        leftCol   = document.getElementById('left-col');
        if (!splitter) return;

        splitter.addEventListener('pointerdown', function(e) {
            dragging  = true;
            startY    = e.clientY;
            startAnim = animArea.getBoundingClientRect().height;
            // Pause la transition vagues si elle est en cours
            if (typeof simVagues !== 'undefined' && simVagues.transAnim && !simVagues.transAnim._pausedAt) {
                simVagues.transAnim._pausedAt = performance.now();
            }

            var totalH    = leftCol.getBoundingClientRect().height;
            var splitterH = 6;
            var minGraph  = 60;

            // Hauteurs intrinsèques (indépendantes du layout en cours)
            var topBtns   = document.getElementById('tube-top-btns');
            var sourceBox = document.getElementById('source-box');
            var btnH      = topBtns   ? topBtns.scrollHeight   : 36;
            var srcH      = sourceBox ? sourceBox.scrollHeight  : 80;

            // La grid de #anim-area a deux rows :
            //   row1 = minmax(min-content, 10%) → hauteur effective = max(btnH, animH * 0.10)
            //   row2 = 1fr = minmax(auto, 1fr)  → plancher = min-content de la colonne
            //          Le plancher de row2 est imposé par #source-box : au moins srcH.
            //          Pour le tube : tubeH = row2H * 0.88 - 4 ≥ 20 → row2H ≥ 28.
            //          Donc row2H ≥ max(srcH, 28).
            //
            // Pour trouver minAnim on cherche le plus petit animH tel que :
            //   row1H  = max(btnH, animH * 0.10)
            //   row2H  = animH - row1H  ≥  max(srcH, 28)
            //
            //   Cas A — 0.10*animH ≥ btnH (row1 = 10%) :
            //     animH - 0.10*animH ≥ row2min  →  animH ≥ row2min / 0.90
            //     Valide si animH ≥ btnH / 0.10
            //
            //   Cas B — 0.10*animH < btnH (row1 = btnH) :
            //     animH - btnH ≥ row2min  →  animH ≥ btnH + row2min
            //     Valide si animH < btnH / 0.10
            //
            var row2min = Math.max(srcH, 28);
            var minA    = Math.ceil(row2min / 0.90);   // Cas A
            var minB    = btnH + row2min;               // Cas B
            minAnim = Math.max(minA, minB);
            maxAnim = totalH - splitterH - minGraph;

            splitter.setPointerCapture(e.pointerId);
            splitter.classList.add('dragging');
            e.preventDefault();
        });

        window.addEventListener('pointermove', function(e) {
            if (!dragging) return;
            requestAnimationFrame(function() {
                var dy       = e.clientY - startY;
                var totalH   = leftCol.getBoundingClientRect().height;
                var newAnim  = Math.min(maxAnim, Math.max(minAnim, startAnim + dy));
                var newGraph = totalH - 6 - newAnim;

                animArea.style.flex    = 'none';
                animArea.style.height  = newAnim  + 'px';
                graphArea.style.flex   = 'none';
                graphArea.style.height = newGraph + 'px';
                scheduleResizeTube();
            });
        });

        window.addEventListener('pointerup', function() {
            if (!dragging) return;
            dragging = false;
            splitter.classList.remove('dragging');
            // Reprend la transition vagues en décalant startT de la durée de pause
            if (typeof simVagues !== 'undefined' && simVagues.transAnim && simVagues.transAnim._pausedAt) {
                simVagues.transAnim.startT += performance.now() - simVagues.transAnim._pausedAt;
                simVagues.transAnim._pausedAt = 0;
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// ══════════════════════════════════════════════════════════════════════
//  Dessin de la scène complète
// ══════════════════════════════════════════════════════════════════════

function drawTube() {
    tubeCanvas = tubeCanvas || document.getElementById('tube-canvas');
    tubeCtx    = tubeCtx    || tubeCanvas.getContext('2d');
    var ctx    = tubeCtx;
    var W      = tubeCanvas.clientWidth;
    var H      = tubeCanvas.clientHeight;

    if (!W || !H) return;

    // La normalisation visuelle (gain de lisibilité des colonnes) n'est plus
    // calculée ici : elle est propre à chaque échantillon émis et appliquée à
    // la lecture par waveDisplacementDisplay (cf. _sonDisplayGain dans sim.js).

    // ── Fond général ─────────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fdf8f0';
    ctx.fillRect(0, 0, W, H);

    // ── Fond intérieur du tube ────────────────────────────────────────
    if (sim.pressureColorMode) {
        _drawTubePressureBg(ctx);
    } else {
        ctx.fillStyle = '#f7f3ec';
        ctx.fillRect(sim.tubeLeft, sim.tubeTop,
                     sim.tubeLength, sim.tubeBottom - sim.tubeTop);
    }

    // ── Parois du tube (haut et bas) ─────────────────────────────────
    // Les bordures partent du bord gauche du canvas (x=0) pour couvrir
    // toute la plage de recul de la membrane. Le boîtier du haut-parleur
    // et la membrane sont dessinés par-dessus et masquent la partie gauche.
    ctx.strokeStyle = '#3a4a5a';
    ctx.lineWidth   = 1.8;
    ctx.beginPath();
    // Paroi haute
    ctx.moveTo(0,              sim.tubeTop);
    ctx.lineTo(sim.tubeRight,  sim.tubeTop);
    // Paroi basse
    ctx.moveTo(0,              sim.tubeBottom);
    ctx.lineTo(sim.tubeRight,  sim.tubeBottom);
    ctx.stroke();

    // Extrémité droite : pas de fermeture — le tube est infini à droite.

    // ── Particules ────────────────────────────────────────────────────
    // Dessinées AVANT la membrane pour qu'elle les recouvre
    _drawParticles(ctx);

    // ── Membrane (haut-parleur) ───────────────────────────────────────
    // Dessinée APRÈS les particules pour les masquer derrière elle
    _drawMembrane(ctx);

    // ── Balises ───────────────────────────────────────────────────────
    _drawBeacons(ctx);

    // ── Règle graduée sous le tube ────────────────────────────────────
    _drawTubeRuler(ctx);
}

// ── Fond du tube colorié selon la pression ────────────────────────────
//
//  Dégradé continu via createLinearGradient : on calcule N points de ΔP,
//  on les convertit en couleur, puis on construit un gradient avec autant
//  de color-stops. Rendu nativement interpolé → parfaitement smooth, sans
//  bandes visibles même à haute fréquence.
//
//  Palette (teintes pastels d'origine) :
//    dp = 0  → orange pâle  rgb(252,220,180)  (pression normale)
//    dp = +1 → rose pâle    rgb(250,185,180)  (surpression / compression)
//    dp = −1 → jaune pâle   rgb(252,245,185)  (dépression / raréfaction)

var N_PRESSURE_BANDS = 300;

function _drawTubePressureBg(ctx) {
    var L    = sim.tubeLength;
    var yTop = sim.tubeTop;
    var h    = sim.tubeBottom - yTop;
    if (L <= 0 || h <= 0) return;

    // Couleur neutre (dp = 0) : orange pâle
    var r0 = 252, g0 = 220, b0 = 180;
    // Compression (dp = +1) : rose pâle
    var rP = 250, gP = 185, bP = 180;
    // Dépression (dp = −1) : jaune pâle
    var rN = 252, gN = 245, bN = 185;

    // Construire le gradient linéaire horizontal
    var grad = ctx.createLinearGradient(sim.tubeLeft, 0, sim.tubeLeft + L, 0);

    for (var i = 0; i <= N_PRESSURE_BANDS; i++) {
        var frac = i / N_PRESSURE_BANDS;
        var x_px = frac * L;
        var dp   = Math.max(-1, Math.min(1, waveDeltaP(x_px, sim.simTime)));

        var r, g, b;
        if (dp >= 0) {
            r = Math.round(r0 + dp * (rP - r0));
            g = Math.round(g0 + dp * (gP - g0));
            b = Math.round(b0 + dp * (bP - b0));
        } else {
            var t = -dp;
            r = Math.round(r0 + t * (rN - r0));
            g = Math.round(g0 + t * (gN - g0));
            b = Math.round(b0 + t * (bN - b0));
        }

        grad.addColorStop(frac, 'rgb(' + r + ',' + g + ',' + b + ')');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(sim.tubeLeft, yTop, L, h);
}

// ── Conversion ΔP → couleur RGB pour les particules ──────────────────
//
//  dp dans [-1, +1]
//  dp = 0  → orange foncé   rgb(200,100,20)   (pression normale)
//  dp = +1 → rouge foncé    rgb(170,30,15)    (compression)
//  dp = -1 → ocre/doré      rgb(190,150,10)   (dépression)
//  Couleurs sombres/saturées bien contrastées sur les fonds pastels.

function _dpToColor(dp) {
    var r0 = 200, g0 = 100, b0 =  20;   // orange foncé neutre
    var r, g, b;
    if (dp >= 0) {
        // → rouge foncé (compression)
        var t = Math.min(1, dp);
        r = Math.round(r0 + t * (170 - r0));
        g = Math.round(g0 + t * ( 30 - g0));
        b = Math.round(b0 + t * ( 15 - b0));
    } else {
        // → ocre doré (dépression)
        var t = Math.min(1, -dp);
        r = Math.round(r0 + t * (190 - r0));
        g = Math.round(g0 + t * (150 - g0));
        b = Math.round(b0 + t * ( 10 - b0));
    }
    return 'rgb(' + r + ',' + g + ',' + b + ')';
}

// ── Extrémité droite ouverte ──────────────────────────────────────────

function _drawOpenEnd(ctx) {
    var x  = sim.tubeRight;
    var y1 = sim.tubeTop;
    var y2 = sim.tubeBottom;
    var tick = 6;
    ctx.strokeStyle = '#3a4a5a';
    ctx.lineWidth   = 1.5;
    // Petites encoches symbolisant l'ouverture
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x + tick, y1 - tick * 0.5);
    ctx.moveTo(x, y2);
    ctx.lineTo(x + tick, y2 + tick * 0.5);
    ctx.stroke();
}

// ── Règle graduée sous le tube ────────────────────────────────────────
//
//  Dessinée dans la bande marginBottom (sim.tubeBottom → canvas bas).
//  x = 0 cm correspond à sim.tubeLeft (position de repos de la membrane).
//  Graduation identique au graphe ΔP(x) : même cmPerPx, même niceStep.
//  Ticks principaux (labels) + ticks secondaires à mi-pas.

function _drawTubeRuler(ctx) {
    var L = sim.tubeLength;
    if (L <= 0) return;

    var W        = tubeCanvas.clientWidth;
    var H        = tubeCanvas.clientHeight;
    var yBase    = sim.tubeBottom;           // ligne de base de la règle
    var yRoom    = H - yBase;               // hauteur disponible sous le tube
    if (yRoom < 6) return;

    var cmPerPx  = 40 / L;                  // 40 cm simulés sur L pixels
    var xMaxCm   = 40;

    // Même pas que le graphe : niceStep(40, 6) → 10 cm en général
    var range     = xMaxCm;
    var rough     = range / 6;
    var mag       = Math.pow(10, Math.floor(Math.log10(rough)));
    var mant      = rough / mag;
    var step      = mant < 1.5 ? mag : mant < 3.5 ? 2 * mag : mant < 7.5 ? 5 * mag : 10 * mag;

    var fontSize  = Math.max(13, Math.min(18, Math.round(yRoom * 0.75)));
    var tickMaj   = Math.min(yRoom * 0.40, 6);   // hauteur tick principal
    var tickMin   = tickMaj * 0.55;               // hauteur tick secondaire

    ctx.save();
    ctx.font         = fontSize + 'px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    // Ligne de base horizontale (depuis la membrane jusqu'à la fin du tube)
    ctx.strokeStyle = '#8a9aaa';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(sim.tubeLeft, yBase);
    ctx.lineTo(sim.tubeRight, yBase);
    ctx.stroke();

    // Ticks principaux et labels
    ctx.strokeStyle = '#5a6a78';
    ctx.lineWidth   = 1;
    ctx.fillStyle   = '#5a6a78';

    for (var cm = 0; cm <= xMaxCm + step * 0.01; cm += step) {
        var xc = sim.tubeLeft + cm / cmPerPx;
        if (xc > sim.tubeRight + 0.5) break;

        ctx.beginPath();
        ctx.moveTo(xc, yBase);
        ctx.lineTo(xc, yBase + tickMaj);
        ctx.stroke();

        // Label : "0" à l'origine, sinon valeur en cm
        var lbl = cm === 0 ? '0' : cm.toFixed(0);
        ctx.fillText(lbl, xc, yBase + tickMaj + 1);
    }

    // Ticks secondaires (mi-pas)
    ctx.strokeStyle = '#a0b0bc';
    ctx.lineWidth   = 0.8;
    var halfStep = step / 2;
    for (var cm2 = halfStep; cm2 <= xMaxCm + halfStep * 0.01; cm2 += step) {
        var xc2 = sim.tubeLeft + cm2 / cmPerPx;
        if (xc2 > sim.tubeRight + 0.5) break;
        ctx.beginPath();
        ctx.moveTo(xc2, yBase);
        ctx.lineTo(xc2, yBase + tickMin);
        ctx.stroke();
    }

    // Unité (en cm) à gauche de l'origine, avant la graduation 0
    if (yRoom >= 14) {
        ctx.fillStyle    = '#7a8a96';
        ctx.font         = Math.max(12, fontSize - 1) + 'px monospace';
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('cm', sim.tubeLeft - 8, yBase + tickMaj + 1);
    }

    ctx.restore();
}

// ── Membrane mobile ───────────────────────────────────────────────────

function _drawMembrane(ctx) {
    // Déplacement visuel de la membrane : même gain de lisibilité que les
    // colonnes, mais jamais amplifié au-delà de l'amplitude physique réelle.
    // → La membrane bénéficie de la réduction à haute fréquence (qui évite le
    //   chevauchement) sans être « boostée » à basse fréquence.
    //   Aucun trou ne résulte de ce plafonnement : la zone virtuelle gauche
    //   (extraLeft, cf. initCols) couvre largement la marge nécessaire grâce au
    //   réservoir de particules à x0 < 0 qui glissent vers la zone visible.
    var uPhys = waveDisplacement(0, sim.simTime);
    var uDisp = waveDisplacementDisplay(0, sim.simTime);
    var disp  = (Math.abs(uDisp) < Math.abs(uPhys)) ? uDisp : uPhys;

    // Corps de la membrane
    var mx    = sim.tubeLeft - MEM_THICKNESS + disp;
    var mh    = sim.tubeBottom - sim.tubeTop;
    var r     = 3;

    // Fond gradient membrane
    var grd   = ctx.createLinearGradient(mx, 0, mx + MEM_THICKNESS, 0);
    grd.addColorStop(0, '#6a7a8a');
    grd.addColorStop(0.6, '#4a5a6a');
    grd.addColorStop(1, '#3a4a5a');
    ctx.fillStyle = grd;

    ctx.beginPath();
    ctx.roundRect
        ? ctx.roundRect(mx, sim.tubeTop, MEM_THICKNESS, mh, [0, r, r, 0])
        : ctx.rect(mx, sim.tubeTop, MEM_THICKNESS, mh);
    ctx.fill();

    // Ligne de contact membrane / tube (face active)
    ctx.strokeStyle = '#90a0b0';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx + MEM_THICKNESS, sim.tubeTop);
    ctx.lineTo(mx + MEM_THICKNESS, sim.tubeBottom);
    ctx.stroke();

    // ── Boîtier du haut-parleur (zone à gauche de la membrane) ────────
    ctx.fillStyle = '#d4d0c8';
    ctx.fillRect(0, sim.tubeTop, mx, mh);
    ctx.strokeStyle = '#b0a898';
    ctx.lineWidth   = 1;
    ctx.strokeRect(0, sim.tubeTop, mx, mh);

    // Symbole "haut-parleur" stylisé
    var cx = mx * 0.5;
    var cy = sim.tubeTop + mh * 0.5;
    var s  = Math.min(mx * 0.3, mh * 0.18, 12);
    if (s > 3) {
        ctx.fillStyle = '#5a6a78';
        // Corps rectangulaire
        ctx.fillRect(cx - s * 0.5, cy - s * 0.4, s * 0.4, s * 0.8);
        // Cône
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.1, cy - s * 0.4);
        ctx.lineTo(cx + s * 0.6, cy - s * 0.8);
        ctx.lineTo(cx + s * 0.6, cy + s * 0.8);
        ctx.lineTo(cx - s * 0.1, cy + s * 0.4);
        ctx.closePath();
        ctx.fill();
    }
}

// ── Particules — modèle lagrangien continu ────────────────────────────
//
//  Chaque entrée de sim.cols est une parcelle de fluide avec :
//    • x0  : position de repos (px depuis tubeLeft), domaine [-extraLeft, L+extraRight]
//    • ry  : position y mémorisée (0..1), gelée en pause
//  Position affichée : px = tubeLeft + x0 + waveDisplacementDisplay(x0, t)
//
//  Les particules de la zone virtuelle droite (x0 > tubeLength) entrent
//  naturellement dans le tube quand l'onde crée une raréfaction à droite.
//  extraRight est dimensionné pour couvrir l'amplitude de déplacement max
//  (y compris le boost basse fréquence) — pas de zone blanche en bout de tube.
//  Le clip [memFace, tubeRight] × [tubeTop, tubeBottom] les masque sinon.
//
//  Deux passes (non-sélectionnées puis sélectionnées) pour minimiser
//  les changements de fillStyle.

function _drawParticles(ctx) {
    var N = sim.cols.length;
    if (N === 0) return;

    var H = sim.tubeBottom - sim.tubeTop;
    var r = particleRadius();

    // Clipping : on laisse les particules déborder légèrement à gauche de tubeLeft
    // (zone virtuelle gauche). La membrane, dessinée par-dessus, masque proprement
    // tout ce qui est derrière elle — pas besoin d'un clip serré sur sa face.
    var memFace  = sim.tubeLeft - sim.memAmplitude;
    var clipWidth = sim.tubeRight - memFace;
    ctx.save();
    ctx.beginPath();
    ctx.rect(memFace, sim.tubeTop, clipWidth, H);
    ctx.clip();

    if (sim.pressureColorMode) {
        // ── Mode pression : chaque particule colorée selon ΔP ────────
        // Une seule passe : affichage couleur ΔP uniquement,
        // pas de contour blanc pour les sélectionnées (trop visuellement chargé).
        for (var i = 0; i < N; i++) {
            var x0 = sim.cols[i].x0;
            var u  = waveDisplacementDisplay(x0, sim.simTime);
            var px = sim.tubeLeft + x0 + u;

            if (!sim.paused) sim.cols[i].ry = Math.random();
            var py = sim.tubeTop + sim.cols[i].ry * H;

            // Remplissage couleur ΔP
            var dp = waveDeltaP(x0, sim.simTime);
            ctx.fillStyle = _dpToColor(dp);
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
        }
    } else {
        // ── Mode normal : deux passes groupées (bleu / rouge) ────────
        var COLORS = ['#2a6aaa', '#b04020'];

        for (var pass = 0; pass < 2; pass++) {
            var wantSelected = (pass === 1);
            ctx.fillStyle = COLORS[pass];
            ctx.beginPath();

            for (var i = 0; i < N; i++) {
                if (sim.cols[i].selected !== wantSelected) continue;

                var x0 = sim.cols[i].x0;
                var u  = waveDisplacementDisplay(x0, sim.simTime);
                var px = sim.tubeLeft + x0 + u;

                // Agitation thermique : nouvelle position y hors pause, figée en pause
                if (!sim.paused) sim.cols[i].ry = Math.random();
                var py = sim.tubeTop + sim.cols[i].ry * H;

                ctx.moveTo(px + r, py);     // moveTo évite les lignes parasites entre arcs
                ctx.arc(px, py, r, 0, Math.PI * 2);
            }
            ctx.fill();
        }
    }

    ctx.restore();
}

// ── Balises ───────────────────────────────────────────────────────────

function _drawBeacons(ctx) {
    if (sim.beacon1.active) _drawOneBeacon(ctx, sim.beacon1.x, '#e07020', 'B1');
    if (sim.beacon2.active) _drawOneBeacon(ctx, sim.beacon2.x, '#2a8a50', 'B2');
}

function _drawOneBeacon(ctx, x, color, label) {
    var y1    = sim.tubeTop;
    var y2    = sim.tubeBottom;
    var fSize = Math.max(11, Math.round((y2 - y1) * 0.13));

    // Ligne verticale en pointillés
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 3;
    ctx.setLineDash([6, 4]);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Étiquette au-dessus du tube
    ctx.fillStyle    = color;
    ctx.font         = 'bold ' + fSize + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, x, y1 - 2);

    // Poignée de drag (losange)
    ctx.save();
    ctx.fillStyle   = color;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(x,       y1 - fSize * 0.3);
    ctx.lineTo(x + 6,   y1 + 4);
    ctx.lineTo(x,       y1 + 8);
    ctx.lineTo(x - 6,   y1 + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ── Label de position sur la règle graduée ────────────────────────
    // Converti en cm (même échelle que la règle : 40 cm sur tubeLength px)
    var L = sim.tubeLength;
    if (L <= 0) return;
    var cmPerPx  = 40 / L;
    var xCm      = (x - sim.tubeLeft) * cmPerPx;
    var W        = tubeCanvas.clientWidth;
    var H        = tubeCanvas.clientHeight;
    var yRoom    = H - y2;
    if (yRoom < 6) return;

    var fontSize  = Math.max(13, Math.min(18, Math.round(yRoom * 0.75)));
    var tickMaj   = Math.min(yRoom * 0.40, 6);

    ctx.save();
    ctx.fillStyle    = color;
    ctx.font         = 'bold ' + fontSize + 'px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(fmtFR(xCm, 1), x, y2 + tickMaj + 1);
    ctx.restore();
}

// ── Rectangle de sélection ────────────────────────────────────────────
// [SUPPRIMÉ] Cette fonction n'est plus utilisée avec le système de sélection
// par proximité.

// ── Applique la sélection rectangulaire aux particules ───────────────
//  [SUPPRIMÉ] Cette fonction n'est plus utilisée avec le système de sélection
// par proximité.

// ══════════════════════════════════════════════════════════════════════
//  Interactions souris sur le canvas tube
// ══════════════════════════════════════════════════════════════════════

(function initTubeInteractions() {
    // Hit-test : est-on proche d'une balise ?
    function nearBeacon(x, beacon) {
        return beacon.active && Math.abs(x - beacon.x) < 10;
    }

    // Le graphe temporel enregistre la valeur mesurée À une position donnée :
    // dès que la balise bouge, les points antérieurs ne décrivent plus le
    // même point du milieu. On repart donc d'un tampon vide, au début et à
    // la fin du glissement (les points intermédiaires du drag sont eux aussi
    // écartés de cette façon).
    function _clearBeaconRecord(n) {
        if (typeof activeTab !== 'undefined' && activeTab === 'corde') {
            _ytClearCorde(n);
        } else {
            _dptClear(n);
        }
    }

    // Hit-test : est-on sur la boule du mode Libre ? Zone de saisie élargie
    // (×2) pour rester attrapable même quand la corde vibre.
    function nearFreeHandle(x, y) {
        if (typeof activeTab === 'undefined' || activeTab !== 'corde') return false;
        if (!simCorde.freeActive) return false;
        var dx = x - simCorde.cordeLeft;
        var dy = y - _cordeAttachY();
        var r  = _cordeFreeHandleR() * 2;
        return dx * dx + dy * dy <= r * r;
    }

    function onDown(e) {
        var rect = tubeCanvas.getBoundingClientRect();
        var mx   = (e.clientX - rect.left) * (tubeCanvas.clientWidth  / rect.width);
        var my   = (e.clientY - rect.top)  * (tubeCanvas.clientHeight / rect.height);

        // Priorité absolue : saisie de la boule du mode Libre. Elle est au
        // bord gauche, là où aucune balise ne peut se trouver.
        if (nearFreeHandle(mx, my)) {
            tubeInter.mode        = 'corde-free-drag';
            simCorde.freeDragging = true;
            // Sans temps qui s'écoule, le geste ne graverait rien.
            if (simCorde.paused && typeof _setPausedCorde === 'function') _setPausedCorde(false);
            if (typeof _resetYtWindowCordeIfQuiet === 'function') _resetYtWindowCordeIfQuiet();
            tubeCanvas.setPointerCapture(e.pointerId);
            return;
        }

        // Choisir les balises selon le tab actif
        var b1 = (typeof activeTab !== 'undefined' && activeTab === 'corde')
                    ? simCorde.beacon1 : sim.beacon1;
        var b2 = (typeof activeTab !== 'undefined' && activeTab === 'corde')
                    ? simCorde.beacon2 : sim.beacon2;

        // Priorité : drag d'une balise
        if (nearBeacon(mx, b1)) {
            tubeInter.mode = 'beacon1-drag';
            _clearBeaconRecord(1);
            tubeCanvas.setPointerCapture(e.pointerId);
            return;
        }
        if (nearBeacon(mx, b2)) {
            tubeInter.mode = 'beacon2-drag';
            _clearBeaconRecord(2);
            tubeCanvas.setPointerCapture(e.pointerId);
            return;
        }

        // Sélection par proximité (si mode actif — Son uniquement)
        if (sim.selectionMode && !(typeof activeTab !== 'undefined' && activeTab === 'corde')) {
            var x0_click = mx - sim.tubeLeft;
            selectNearbyParticles(x0_click, {
                ctrl  : e.ctrlKey,
                shift : e.shiftKey
            });
        }
    }

    function onMove(e) {
        if (!tubeInter.mode) {
            // Curseur adaptatif
            var rect = tubeCanvas.getBoundingClientRect();
            var mx   = (e.clientX - rect.left) * (tubeCanvas.clientWidth  / rect.width);
            var my   = (e.clientY - rect.top)  * (tubeCanvas.clientHeight / rect.height);

            var b1 = (typeof activeTab !== 'undefined' && activeTab === 'corde')
                        ? simCorde.beacon1 : sim.beacon1;
            var b2 = (typeof activeTab !== 'undefined' && activeTab === 'corde')
                        ? simCorde.beacon2 : sim.beacon2;

            if (nearFreeHandle(mx, my)) {
                tubeCanvas.style.cursor = 'ns-resize';
            } else if (nearBeacon(mx, b1) || nearBeacon(mx, b2)) {
                tubeCanvas.style.cursor = 'ew-resize';
            } else if (sim.selectionMode && !(typeof activeTab !== 'undefined' && activeTab === 'corde')) {
                tubeCanvas.style.cursor = 'crosshair';
            } else {
                tubeCanvas.style.cursor = 'default';
            }
            return;
        }

        var rect = tubeCanvas.getBoundingClientRect();
        var mx   = (e.clientX - rect.left) * (tubeCanvas.clientWidth  / rect.width);
        var my   = (e.clientY - rect.top)  * (tubeCanvas.clientHeight / rect.height);

        // Bornes de déplacement selon le tab
        var isCorde = (typeof activeTab !== 'undefined' && activeTab === 'corde');
        var left    = isCorde ? simCorde.cordeLeft  : sim.tubeLeft;
        var right   = isCorde ? simCorde.cordeRight : sim.tubeRight;
        var length  = isCorde ? simCorde.cordeLength : sim.tubeLength;
        var b1      = isCorde ? simCorde.beacon1    : sim.beacon1;
        var b2      = isCorde ? simCorde.beacon2    : sim.beacon2;

        if (tubeInter.mode === 'corde-free-drag') {
            // La hauteur de la souris DEVIENT le signal émis : on convertit
            // les pixels en cm (même échelle que le tracé) et on borne à toute
            // la hauteur de la zone corde (cf. cordeFreeLimitCm).
            // On n'écrit ici que la CIBLE : la boucle d'animation l'atteint
            // en interpolant sur les échantillons de la frame, sans quoi le
            // geste se graverait en escalier (cf. freeTargetY dans sim.js).
            var cmToPx = simCorde.pxPerCmAmpl;
            var yCm    = (cmToPx > 0) ? (simCorde.cordeMiddleY - my) / cmToPx : 0;
            var lim = cordeFreeLimitCm();
            simCorde.freeTargetY = Math.max(-lim.down,
                                            Math.min(lim.up, yCm));
            return;
        }

        // Sur la corde en aspect Discret, la balise se cale sur le point
        // matériel le plus proche (cf. snapCordeBeaconX) : elle ne peut pas
        // se poser sur un lien entre deux points.
        if (tubeInter.mode === 'beacon1-drag') {
            b1.x = Math.max(left, Math.min(right, mx));
            if (isCorde) b1.x = snapCordeBeaconX(b1.x);
            if (length > 0) b1.frac = (b1.x - left) / length;
        } else if (tubeInter.mode === 'beacon2-drag') {
            b2.x = Math.max(left, Math.min(right, mx));
            if (isCorde) b2.x = snapCordeBeaconX(b2.x);
            if (length > 0) b2.frac = (b2.x - left) / length;
        }
    }

    function onUp() {
        if (tubeInter.mode === 'beacon1-drag') _clearBeaconRecord(1);
        if (tubeInter.mode === 'beacon2-drag') _clearBeaconRecord(2);
        // La boule reste où on l'a lâchée (cf. simCorde.freeY) : la corde
        // garde le déplacement imposé, comme une main qui la tiendrait.
        if (tubeInter.mode === 'corde-free-drag') simCorde.freeDragging = false;
        tubeInter.mode = null;
    }

    function setup() {
        tubeCanvas = document.getElementById('tube-canvas');
        if (!tubeCanvas) return;
        tubeCanvas.addEventListener('pointerdown', onDown);
        tubeCanvas.addEventListener('pointermove', onMove);
        tubeCanvas.addEventListener('pointerup',   onUp);
        tubeCanvas.addEventListener('pointerleave', function() {
            if (tubeInter.mode) onUp();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();

// ── Désélectionner toutes les colonnes ───────────────────────────────

function clearSelection() {
    for (var i = 0; i < sim.cols.length; i++) {
        sim.cols[i].selected = false;
    }
}

// ══════════════════════════════════════════════════════════════════════
//  ██████╗ ██████╗ ██████╗ ██████╗ ███████╗
//  Rendu du canvas — mode CORDE
//  Fonctions : resizeCorde, drawCorde, _drawShaker, _drawCordeWire,
//              _drawCordeBeacons, _drawCordeRuler
// ══════════════════════════════════════════════════════════════════════

// Épaisseur visuelle du corps du pot vibrant (px)
var SHAKER_BASE_W = 28;

// ── Échelle verticale de la corde (cm → px) ───────────────────────────
//  L'échelle verticale (y) est volontairement DÉCOUPLÉE de l'échelle
//  spatiale réelle (x, en m) : une amplitude réaliste de quelques cm serait
//  invisible sur une corde de 5 m affichée à l'écran. On fixe donc un
//  facteur cm → px tel que l'amplitude maximale du curseur occupe 55 % de la
//  demi-hauteur disponible ; il reste responsive puisque halfH suit le
//  redimensionnement.

// Fraction de la demi-hauteur occupée par l'amplitude maximale du curseur.
// Plafonnée à 45 % (et non 55 %) pour garder de la marge : deux impulsions
// émises à moins de T_IMPULSE d'intervalle se superposent et atteignent le
// double, soit 90 % — ça rentre encore, sans rognage ni décrochage du pot.
var CORDE_AMPL_FRAC = 0.45;

function _recalcCordeScale() {
    var halfH = (simCorde.cordeBottom - simCorde.cordeTop) / 2;

    // Échelle unique cm → px. Le facteur ne dépend PAS de l'amplitude
    // courante, sans quoi toutes les amplitudes s'afficheraient à la même
    // taille (c'était le cas avant : le curseur semblait sans effet).
    simCorde.pxPerCmAmpl = (halfH * CORDE_AMPL_FRAC) / CORDE_AMPL_CM_MAX;
}

// ── Point d'accroche de la corde sur le pot vibrant ───────────────────
//  Source de vérité UNIQUE, partagée par le fil et par le pot : tant qu'ils
//  calculaient chacun leur y avec des bornes différentes, une excursion
//  ample pouvait les désolidariser visuellement.

function _cordeAttachY() {
    var disp = cordeDisplacement(0, simCorde.simTime) * simCorde.pxPerCmAmpl;
    return Math.max(simCorde.cordeTop + 1,
                    Math.min(simCorde.cordeBottom - 1, simCorde.cordeMiddleY - disp));
}

// ── Sommet du vérin du pot vibrant ────────────────────────────────────
//  Normalement confondu avec le point d'accroche de la corde. En mode
//  Libre le pot est débrayé : le vérin ne suit plus la corde et reste
//  immobile au repos (le zéro), c'est la petite tige horizontale qui
//  pivote pour lâcher la corde (cf. _drawShaker).

function _shakerTopY() {
    return simCorde.freeActive ? simCorde.cordeMiddleY : _cordeAttachY();
}

// ── Boule du bout de corde (mode Libre) ───────────────────────────────
//  Rayon de la poignée, et sa position courante — partagés par le tracé
//  (_drawCordeFreeHandle) et le hit-test de la souris (initTubeInteractions).

function _cordeFreeHandleR() {
    return Math.max(4, Math.round((simCorde.cordeBottom - simCorde.cordeTop) * 0.025));
}

// ── Débattement de la boule du mode Libre ─────────────────────────────
//  La boule se traîne dans TOUTE la hauteur de la zone corde, et non plus
//  dans la seule plage du curseur Amplitude : le geste de l'utilisateur
//  n'a pas de raison d'être bridé par un réglage qui ne le concerne pas.
//  Le rayon de la boule est retranché pour qu'elle reste entièrement
//  visible quand on la pousse contre un bord. Bornes séparées haut/bas :
//  cordeMiddleY étant arrondi, les deux moitiés de la zone ne sont pas
//  exactement égales.
function cordeFreeLimitCm() {
    var cmToPx = simCorde.pxPerCmAmpl;
    if (!(cmToPx > 0)) return { up: CORDE_AMPL_CM_MAX, down: CORDE_AMPL_CM_MAX };
    var r = _cordeFreeHandleR();
    return {
        up  : Math.max(0, simCorde.cordeMiddleY - simCorde.cordeTop     - r) / cmToPx,
        down: Math.max(0, simCorde.cordeBottom  - simCorde.cordeMiddleY - r) / cmToPx
    };
}

// ── Demi-étendue de l'axe y des graphes corde ─────────────────────────
//  Fixe en temps normal (cf. CORDE_Y_AXIS_CM). En mode Libre elle s'ouvre
//  au débattement réel de la boule, sinon le geste sortirait du cadre dès
//  qu'il dépasse l'amplitude max du curseur. Les graduations, elles, se
//  recalculent seules (cf. _niceStep dans graph.js).
function cordeYAxisCm() {
    if (!simCorde.freeActive) return CORDE_Y_AXIS_CM;
    var lim = cordeFreeLimitCm();
    return Math.max(CORDE_Y_AXIS_CM, 1.06 * Math.max(lim.up, lim.down));
}

// ── Resize corde ──────────────────────────────────────────────────────

function resizeCorde() {
    tubeCanvas = tubeCanvas || document.getElementById('tube-canvas');
    tubeCtx    = tubeCtx    || tubeCanvas.getContext('2d');

    var wrap = document.getElementById('tube-canvas-wrap');
    var w    = wrap.clientWidth;
    var h    = wrap.clientHeight;
    if (w < 10 || h < 28) return;

    var dpr = window.devicePixelRatio || 1;
    tubeCanvas.width  = Math.round(w * dpr);
    tubeCanvas.height = Math.round(h * dpr);
    tubeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // ── Géométrie de la zone corde ────────────────────────────────────
    // Même logique que le tube son : marge horizontale + verticale
    var marginH      = 13;
    var marginTop    = 10;
    var marginBottom = Math.round(h * 0.12);

    simCorde.cordeLeft   = marginH + SHAKER_BASE_W;
    simCorde.cordeRight  = w - marginH;
    simCorde.cordeLength = simCorde.cordeRight - simCorde.cordeLeft;
    simCorde.cordeTop    = marginTop;
    simCorde.cordeBottom = Math.max(marginTop + 20, h - marginBottom);
    simCorde.cordeMiddleY = Math.round((simCorde.cordeTop + simCorde.cordeBottom) / 2);

    // ── Échelle spatiale : px par mètre réel ──────────────────────────
    // La propagation elle-même se calcule en mètres (cf. cordeDisplacement),
    // donc ce facteur ne sert plus qu'à exprimer c et λ en pixels pour
    // dimensionner la finesse d'échantillonnage du tracé.
    C_BASE_CORDE = simCorde.cordeLength / CORDE_LENGTH_M;

    // ── Amplitude du pot vibrant ──────────────────────────────────────
    // Échelle visuelle dédiée (indépendante de l'échelle spatiale x),
    // mappée sur une fraction lisible de la demi-hauteur disponible
    // (cf. _recalcCordeScale).
    _recalcCordeScale();

    // ── Positions des balises ──────────────────────────────────────────
    // Recalculées depuis frac (position relative) pour rester à distance
    // constante du vibreur quelle que soit la largeur du canvas.
    simCorde.beacon1.x = simCorde.cordeLeft + simCorde.cordeLength * simCorde.beacon1.frac;
    simCorde.beacon2.x = simCorde.cordeLeft + simCorde.cordeLength * simCorde.beacon2.frac;
    // En aspect Discret, une balise ne peut vivre que sur un point matériel.
    snapCordeBeacon(simCorde.beacon1);
    snapCordeBeacon(simCorde.beacon2);

    updateCeleriteCorde();
}

// ── Dessin de la scène corde ──────────────────────────────────────────

function drawCorde() {
    tubeCanvas = tubeCanvas || document.getElementById('tube-canvas');
    tubeCtx    = tubeCtx    || tubeCanvas.getContext('2d');
    var ctx    = tubeCtx;
    var W      = tubeCanvas.clientWidth;
    var H      = tubeCanvas.clientHeight;
    if (!W || !H) return;

    // ── Fond général ──────────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fdf8f0';
    ctx.fillRect(0, 0, W, H);

    // ── Zone de la corde (fond légèrement teinté) ─────────────────────
    var zoneH   = simCorde.cordeBottom - simCorde.cordeTop;
    ctx.fillStyle = '#f0ece4';
    ctx.fillRect(simCorde.cordeLeft, simCorde.cordeTop, simCorde.cordeLength, zoneH);

    // ── Grille (lignes verticales tous les mètres + ligne du zéro) ────
    _drawCordeGrid(ctx);

    // ── Pot vibrant (à gauche) ────────────────────────────────────────
    // Dessiné EN PREMIER : son masque efface le fond de zone, puis la
    // corde est tracée par-dessus en partant exactement du point d'accroche.
    _drawShaker(ctx);

    // ── Corde elle-même ───────────────────────────────────────────────
    // Dessinée APRÈS le shaker pour partir visuellement du sommet du tube.
    // Deux aspects possibles, même physique (cf. simCorde.aspect).
    if (simCorde.aspect === 'discret') _drawCordeBeads(ctx);
    else                               _drawCordeWire(ctx);

    // ── Balises ───────────────────────────────────────────────────────
    _drawCordeBeacons(ctx);

    // ── Règle graduée (distance en bas) ────────────────────────────────
    _drawCordeRuler(ctx);

    // ── Bordure de la zone (dessinée avant la poignée pour que celle-ci,
    //    posée sur le bord gauche du cadre en mode Libre, ne soit pas
    //    coupée par le trait de bordure) ────────────────────────────────
    ctx.strokeStyle = '#b0a89c';
    ctx.lineWidth   = 1;
    ctx.strokeRect(
        simCorde.cordeLeft + 0.5, simCorde.cordeTop + 0.5,
        simCorde.cordeLength - 1, zoneH - 1
    );

    // ── Poignée du mode Libre (au bout du fil) ────────────────────────
    // Dessinée en dernier pour rester au-dessus du cadre.
    _drawCordeFreeHandle(ctx);
}

// ── Grille de la corde : repères verticaux (mètres) + ligne du zéro ───

function _drawCordeGrid(ctx) {
    var L = simCorde.cordeLength;
    if (L <= 0) return;
    var top    = simCorde.cordeTop;
    var bottom = simCorde.cordeBottom;
    var midY   = simCorde.cordeMiddleY;

    ctx.save();

    // Lignes verticales tous les mètres
    ctx.strokeStyle = 'rgba(140,150,160,0.35)';
    ctx.lineWidth   = 1;
    var nMarks = Math.round(CORDE_LENGTH_M);
    for (var m = 0; m <= nMarks; m++) {
        var x = simCorde.cordeLeft + (m / CORDE_LENGTH_M) * L;
        if (x > simCorde.cordeRight + 0.5) break;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
    }

    // Ligne horizontale du zéro (position d'équilibre)
    ctx.strokeStyle = 'rgba(110,120,130,0.55)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(simCorde.cordeLeft,  midY);
    ctx.lineTo(simCorde.cordeRight, midY);
    ctx.stroke();

    ctx.restore();
}

// ── Fil de la corde ───────────────────────────────────────────────────
//
//  La corde est tracée comme un chemin sinueux depuis x=cordeLeft jusqu'à
//  x=cordeRight. Pour chaque colonne x (pixels), le déplacement physique
//  y(x,t) = cordeDisplacement(x − cordeLeft, simTime) (en cm) est converti
//  en pixels par pxPerCmAmpl, puis retranché à cordeMiddleY.
//
//  Épaisseur du trait = f(μ) : de 1.5 px (μ=0.5) à 5 px (μ=4)
//  Couleur : bordeaux #7a2510

function _drawCordeWire(ctx) {
    var L  = simCorde.cordeLength;
    if (L <= 0) return;

    // Point de départ = accroche sur le pot (cf. _cordeAttachY, partagé avec
    // _drawShaker). Partout le déplacement est RETRANCHÉ à cordeMiddleY, pour
    // que y positif aille vers le haut comme sur les graphes y(x) et y(t)
    // (convention mathématique standard).
    var cmToPx = simCorde.pxPerCmAmpl;
    var startX = simCorde.cordeLeft;
    var startY = _cordeAttachY();

    // Épaisseur selon μ : linéaire de 1.5 (μ=0.1) à 5 (μ=4)
    var muRange    = 4.0 - 0.1;
    var lwRange    = 5.0 - 1.5;
    var cordeLineW = 1.5 + ((simCorde.mu - 0.1) / muRange) * lwRange;

    // Finesse d'échantillonnage : ~24 points par longueur d'onde suffisent
    // pour un tracé lisse une fois joint en 'round' (on en calculait 50, soit
    // deux fois plus de points que ce que l'écran peut distinguer).
    var freqEff_  = (simCorde.sourceMode === 'impulse') ? 1.0 / T_IMPULSE : simCorde.freq;
    var lambda_px = (simCorde.c_sim > 0) ? simCorde.c_sim / freqEff_ : L;
    var subSteps  = Math.max(400, Math.min(3000, Math.ceil(24 * L / Math.max(0.5, lambda_px))));

    // Clipping dans la zone corde uniquement
    ctx.save();
    ctx.beginPath();
    ctx.rect(simCorde.cordeLeft, simCorde.cordeTop, L, simCorde.cordeBottom - simCorde.cordeTop);
    ctx.clip();

    // Le chemin est construit dans un Path2D quand c'est possible : contrairement
    // au chemin courant du contexte (figé dès sa construction), un Path2D est
    // transformé au moment du tracé, ce qui permet de le réutiliser tel quel
    // pour le passage d'ombre décalé — sans recalculer un seul point.
    var path = (typeof Path2D === 'function') ? new Path2D() : null;
    var sink = path || ctx;
    if (!path) ctx.beginPath();

    sink.moveTo(startX, startY);   // premier point = point d'accroche
    for (var s = 1; s <= subSteps; s++) {
        var x_px = (s / subSteps) * L;
        var disp = cordeDisplacement(x_px, simCorde.simTime) * cmToPx;
        sink.lineTo(simCorde.cordeLeft + x_px, simCorde.cordeMiddleY - disp);
    }

    // Pas de shadowBlur : sur un chemin de plusieurs milliers de points, le
    // flou coûte bien plus cher que le tracé lui-même, à chaque frame, pour
    // un halo à peine perceptible. Un second passage décalé d'un pixel et
    // demi donne le même relief pour le prix d'un stroke.
    ctx.lineJoin  = 'round';
    ctx.lineCap   = 'round';
    ctx.lineWidth = cordeLineW;

    if (path) {
        ctx.save();
        ctx.translate(0, 1.5);
        ctx.strokeStyle = 'rgba(80,20,0,0.20)';
        ctx.stroke(path);
        ctx.restore();

        ctx.strokeStyle = '#7a2510';
        ctx.stroke(path);
    } else {
        ctx.strokeStyle = '#7a2510';
        ctx.stroke();
    }

    ctx.restore();
}

// ── Corde en aspect « Discret » : chapelet de points matériels ────────
//
//  Même déplacement y(x,t) que le tracé continu, échantillonné cette fois
//  à pas fixe : un point tous les CORDE_BEAD_STEP_M (10 cm), soit 51 points
//  sur 5 m. Chacun est relié à son voisin par un petit lien.
//
//  Intérêt pédagogique : on suit un point donné et on constate qu'il ne se
//  déplace jamais horizontalement — il ne fait que reproduire, avec un
//  retard, le mouvement du point qui le précède.

// Nombre de points (bornes incluses) — 51 pour 5 m au pas de 10 cm.
function cordeBeadCount() {
    return Math.round(CORDE_LENGTH_M / CORDE_BEAD_STEP_M) + 1;
}

// Abscisse écran (px) du point d'indice i.
function cordeBeadX(i) {
    var n = cordeBeadCount() - 1;
    return simCorde.cordeLeft + (i / n) * simCorde.cordeLength;
}

function _drawCordeBeads(ctx) {
    var L = simCorde.cordeLength;
    if (L <= 0) return;

    var cmToPx = simCorde.pxPerCmAmpl;
    var zoneH  = simCorde.cordeBottom - simCorde.cordeTop;
    var nBeads = cordeBeadCount();

    // Rayon des points et épaisseur des liens : indexés sur μ, comme
    // l'épaisseur du fil en aspect continu, pour que la corde reste
    // visuellement « plus lourde » quand μ augmente. Interpolation linéaire
    // sur toute la plage du curseur : rayon minimal à μ = 0,1, maximal à
    // μ = 4 — ce maximum est volontairement modeste, des sphères plus
    // grosses se toucheraient et la corde redeviendrait un trait plein.
    // Base = espacement entre points (proportionnel à L, la largeur de la
    // zone), pas zoneH (hauteur) : sinon les sphères grossissent
    // artificiellement dans une fenêtre haute et étroite alors que rien
    // n'a changé horizontalement.
    var spacing = L / (nBeads - 1);
    var muFrac  = (simCorde.mu - 0.1) / (4.0 - 0.1);
    var beadR   = Math.max(2.5, spacing * (0.26 + 0.11 * muFrac));
    var linkW   = Math.max(1.0, beadR * 0.45);

    // Positions calculées une seule fois : elles servent aux liens puis aux
    // points. Le premier point est le point d'accroche sur le pot vibrant
    // (cf. _cordeAttachY), exactement comme le départ du fil continu.
    var xs = new Float32Array(nBeads);
    var ys = new Float32Array(nBeads);
    for (var i = 0; i < nBeads; i++) {
        var xPx = (i / (nBeads - 1)) * L;
        xs[i] = simCorde.cordeLeft + xPx;
        ys[i] = (i === 0)
                    ? _cordeAttachY()
                    : simCorde.cordeMiddleY - cordeDisplacement(xPx, simCorde.simTime) * cmToPx;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(simCorde.cordeLeft, simCorde.cordeTop, L, zoneH);
    ctx.clip();

    // ── Liens ─────────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(122,37,16,0.55)';
    ctx.lineWidth   = linkW;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(xs[0], ys[0]);
    for (var k = 1; k < nBeads; k++) ctx.lineTo(xs[k], ys[k]);
    ctx.stroke();

    // ── Points ────────────────────────────────────────────────────────
    // En mode Libre le point d'indice 0 est remplacé par la poignée
    // attrapable, dessinée juste après au même endroit (_drawCordeFreeHandle).
    //
    //  Anti-scintillement : une sphère de quelques pixels dont le bord n'est
    //  qu'un dégradé adouci par l'antialiasing change d'aspect à chaque frame
    //  quand elle traverse la hauteur de l'écran en quelques images — d'où
    //  l'impression de clignotement. Deux parades :
    //   - un contour net d'un pixel, qui donne à la sphère une silhouette
    //     stable quelle que soit sa position sub-pixel ;
    //   - un dégradé qui s'arrête avant le bord, pour que la couleur y soit
    //     franche au lieu de s'y éteindre.
    var first = simCorde.freeActive ? 1 : 0;
    ctx.strokeStyle = '#4a1008';
    ctx.lineWidth   = 1;
    for (var j = first; j < nBeads; j++) {
        var grd = ctx.createRadialGradient(
            xs[j] - beadR * 0.35, ys[j] - beadR * 0.35, beadR * 0.15,
            xs[j], ys[j], beadR
        );
        grd.addColorStop(0,    '#c05030');
        grd.addColorStop(0.75, '#7a2510');
        grd.addColorStop(1,    '#7a2510');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(xs[j], ys[j], beadR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    ctx.restore();
}

// ── Calage des balises sur les points (aspect Discret) ────────────────
//
//  En aspect Discret la corde n'existe qu'aux points matériels : une balise
//  posée entre deux d'entre eux ne suivrait aucun point réel. On l'aligne
//  donc sur le point le plus proche. En aspect Continu, x est renvoyé tel
//  quel — la balise reste librement positionnable.

function snapCordeBeaconX(x) {
    if (simCorde.aspect !== 'discret') return x;
    var L = simCorde.cordeLength;
    if (L <= 0) return x;
    var n = cordeBeadCount() - 1;
    var i = Math.round(((x - simCorde.cordeLeft) / L) * n);
    i = Math.max(0, Math.min(n, i));
    return cordeBeadX(i);
}

// Cale une balise corde et resynchronise sa position relative.
function snapCordeBeacon(beacon) {
    if (simCorde.aspect !== 'discret') return;
    beacon.x = snapCordeBeaconX(beacon.x);
    if (simCorde.cordeLength > 0) {
        beacon.frac = (beacon.x - simCorde.cordeLeft) / simCorde.cordeLength;
    }
}

// ── Pot vibrant ───────────────────────────────────────────────────────
//
//  Géométrie (vue de face, vertical) :
//
//    ┌──────┐   ← sommet du tube animé (y = midY − disp)
//    │ tube │     → extrémité de la corde accrochée ici
//    │      │
//    │      │
//    └──────┘
//    ┌──────────┐  ← base fixe (rectangle centré, en bas de zone)
//    └──────────┘
//
//  - Base (fixe) : rectangle gris, centré dans la marge gauche,
//    ancré juste au-dessus de cordeBottom, hauteur ≈ 18 % de zoneH
//  - Tube (animé) : rectangle fin centré sur la base,
//    part du dessus de la base et monte jusqu'à midY − disp
//  - Point d'accroche : petit disque coloré au sommet du tube
//    → c'est d'ici que part le fil de la corde

function _drawShaker(ctx) {
    var cordeTop    = simCorde.cordeTop;
    var cordeBottom = simCorde.cordeBottom;
    var zoneH       = cordeBottom - cordeTop;
    var marginLeft  = simCorde.cordeLeft;   // largeur totale de la zone pot

    // Hauteur actuelle du sommet du pot. En mode Libre il est débrayé et
    // reste en position haute, indépendamment de la corde (cf. _shakerTopY).
    var attachY = _shakerTopY();

    // ── Dimensions ────────────────────────────────────────────────────
    var baseH  = Math.max(12, Math.round(zoneH * 0.18));   // hauteur base fixe
    var baseW  = Math.max(18, Math.round(marginLeft * 0.80)); // largeur base
    var baseX  = Math.round((marginLeft - baseW) / 2);     // centré horizontalement
    var baseY  = cordeBottom - baseH;                       // ancré en bas de zone

    var tubeW  = Math.max(6, Math.round(baseW * 0.28));    // largeur tube fin
    var tubeX  = Math.round(marginLeft / 2 - tubeW / 2);  // centré

    // Sommet du tube = point d'accroche exact de la corde — AUCUNE borne
    // propre ici, sinon le tube pourrait s'arrêter alors que le fil, lui,
    // continue de descendre (c'était la cause du décrochage visuel).
    // Si l'accroche passe sous le dessus de la base, le tube n'est plus
    // dessiné : la base, tracée ensuite, le recouvre — le vérin donne alors
    // l'impression de rentrer dans le corps du pot, ce qui est réaliste.
    var tubeTop_anim = attachY;
    var tubeBot      = baseY;      // pied du tube = dessus de la base

    // ── Fond : masque la zone du pot (couleur de fond de zone) ────────
    ctx.fillStyle = '#f0ece4';
    ctx.fillRect(0, cordeTop, marginLeft, zoneH);

    // ── Tube animé ────────────────────────────────────────────────────
    var tubeH = tubeBot - tubeTop_anim;
    if (tubeH > 0) {
        var tGrd = ctx.createLinearGradient(tubeX, 0, tubeX + tubeW, 0);
        tGrd.addColorStop(0,   '#9aabb8');
        tGrd.addColorStop(0.5, '#c0d0da');
        tGrd.addColorStop(1,   '#7a8a98');
        ctx.fillStyle = tGrd;
        ctx.fillRect(tubeX, tubeTop_anim, tubeW, tubeH);

        // Contour tube
        ctx.strokeStyle = '#6a7a88';
        ctx.lineWidth   = 1;
        ctx.strokeRect(tubeX, tubeTop_anim, tubeW, tubeH);
    }

    // ── Base fixe ─────────────────────────────────────────────────────
    var bGrd = ctx.createLinearGradient(baseX, baseY, baseX, baseY + baseH);
    bGrd.addColorStop(0,   '#8a9aaa');
    bGrd.addColorStop(0.4, '#6a7a8a');
    bGrd.addColorStop(1,   '#4a5a6a');
    ctx.fillStyle = bGrd;
    if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(baseX, baseY, baseW, baseH, 3);
        ctx.fill();
    } else {
        ctx.fillRect(baseX, baseY, baseW, baseH);
    }

    // Contour base
    ctx.strokeStyle = '#3a4a58';
    ctx.lineWidth   = 1.2;
    ctx.strokeRect(baseX, baseY, baseW, baseH);

    // Traits horizontaux décoratifs sur la base (effet métal)
    ctx.strokeStyle = 'rgba(180,200,210,0.4)';
    ctx.lineWidth   = 0.8;
    var nLines = 2;
    for (var li = 1; li <= nLines; li++) {
        var ly = baseY + Math.round(baseH * li / (nLines + 1));
        ctx.beginPath();
        ctx.moveTo(baseX + 3, ly);
        ctx.lineTo(baseX + baseW - 3, ly);
        ctx.stroke();
    }

    // ── Tige d'accroche de la corde (sommet du vérin) ─────────────────
    // Petite tige reliant le sommet du vérin au bord de la zone corde.
    // Son point d'attache au vérin sert de pivot : en mode Libre elle
    // bascule d'un quart de tour dans le sens antihoraire et se dresse à la
    // verticale, ce qui la déconnecte de la corde. (À l'écran l'axe y est
    // orienté vers le bas : « vers le haut » = y décroissant.)
    var pivotX = tubeX + tubeW / 2;   // centre du disque = pivot de la tige
    var rodLen = simCorde.cordeLeft - pivotX;
    var dotR   = Math.max(3, tubeW * 0.45);   // attachY : calculé plus haut

    ctx.strokeStyle = '#5a3a20';
    ctx.lineWidth   = Math.max(1.5, tubeW * 0.3);
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(pivotX, attachY);
    if (simCorde.freeActive) ctx.lineTo(pivotX, attachY - rodLen);
    else                     ctx.lineTo(pivotX + rodLen, attachY);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Disque d'accroche (sommet du vérin, également pivot de la tige)
    ctx.fillStyle   = '#7a2510';
    ctx.beginPath();
    ctx.arc(tubeX + tubeW / 2, attachY, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a1008';
    ctx.lineWidth   = 1;
    ctx.stroke();
}

// ── Poignée du mode Libre : boule au bout de la corde ─────────────────
//  Dessinée après le fil, à son extrémité gauche exacte : c'est le point
//  que l'utilisateur attrape pour imposer lui-même le déplacement.

function _drawCordeFreeHandle(ctx) {
    if (!simCorde.freeActive) return;

    var x = simCorde.cordeLeft;
    var y = _cordeAttachY();
    var r = _cordeFreeHandleR();

    ctx.save();

    // Halo quand la boule est saisie — retour visuel du glissement en cours
    if (simCorde.freeDragging) {
        ctx.fillStyle = 'rgba(122,37,16,0.20)';
        ctx.beginPath();
        ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
        ctx.fill();
    }

    var grd = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.15, x, y, r);
    grd.addColorStop(0, '#c05030');
    grd.addColorStop(1, '#7a2510');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#4a1008';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    ctx.restore();
}

// ── Balises corde ─────────────────────────────────────────────────────

function _drawCordeBeacons(ctx) {
    if (simCorde.beacon1.active) _drawOneCordeBeacon(ctx, simCorde.beacon1.x, '#e07020', 'B1');
    if (simCorde.beacon2.active) _drawOneCordeBeacon(ctx, simCorde.beacon2.x, '#2a8a50', 'B2');
}

function _drawOneCordeBeacon(ctx, x, color, label) {
    var top    = simCorde.cordeTop;
    var bottom = simCorde.cordeBottom;
    // Indexé sur la largeur de la zone (cordeLength), pas sur sa hauteur :
    // sinon l'étiquette grossit artificiellement dans une fenêtre haute et
    // étroite alors que rien n'a changé horizontalement.
    var fSize  = Math.max(11, Math.round(simCorde.cordeLength * 0.045));

    // Position verticale actuelle du point d'attache : suit le déplacement
    // transversal de la corde à cette abscisse (comme un point matériel posé
    // sur le fil). Signe inversé, cf. _drawCordeWire (y positif vers le haut).
    var xRel = x - simCorde.cordeLeft;
    var disp = cordeDisplacement(xRel, simCorde.simTime) * simCorde.pxPerCmAmpl;
    var y    = Math.max(top, Math.min(bottom, simCorde.cordeMiddleY - disp));

    // Ligne pointillée vers le bas uniquement, jusqu'à la règle graduée
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Point matérialisant la balise (toujours dragable horizontalement,
    // cf. nearBeacon() dans initTubeInteractions — basé uniquement sur x)
    var dotR = Math.max(2, fSize * 0.16);
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.restore();

    // Étiquette juste au-dessus du point. Quand l'amplitude est très grande,
    // le point est plaqué contre le haut de la zone (clampé ci-dessus) et
    // l'étiquette voudrait sortir du canvas : on la retient à une hauteur
    // minimale pour qu'elle reste toujours visible, quitte à empiéter sur
    // la marge au-dessus de la zone plutôt que d'être coupée.
    var labelY = Math.max(fSize + 2, y - dotR - 3);
    ctx.fillStyle    = color;
    ctx.font         = 'bold ' + fSize + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, x, labelY);

    // Label de position sur la règle graduée
    var L = simCorde.cordeLength;
    if (L <= 0) return;
    var mPerPx   = CORDE_LENGTH_M / L;
    var xM       = (x - simCorde.cordeLeft) * mPerPx;
    var H        = tubeCanvas.clientHeight;
    var yRoom    = H - bottom;
    if (yRoom < 6) return;

    var fontSize = Math.max(13, Math.min(18, Math.round(yRoom * 0.75)));
    var tickMaj  = Math.min(yRoom * 0.40, 6);

    ctx.save();
    ctx.fillStyle    = color;
    ctx.font         = 'bold ' + fontSize + 'px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(fmtFR(xM, 2), x, bottom + tickMaj + 1);
    ctx.restore();
}

// ── Règle graduée corde ───────────────────────────────────────────────

function _drawCordeRuler(ctx) {
    var L = simCorde.cordeLength;
    if (L <= 0) return;

    var H        = tubeCanvas.clientHeight;
    var yBase    = simCorde.cordeBottom;
    var yRoom    = H - yBase;
    if (yRoom < 6) return;

    var mPerPx   = CORDE_LENGTH_M / L;
    var xMaxM    = CORDE_LENGTH_M;

    var range    = xMaxM;
    var rough    = range / 6;
    var mag      = Math.pow(10, Math.floor(Math.log10(rough)));
    var mant     = rough / mag;
    var step     = mant < 1.5 ? mag : mant < 3.5 ? 2 * mag : mant < 7.5 ? 5 * mag : 10 * mag;
    var decimals = step < 1 ? 1 : 0;

    var fontSize = Math.max(13, Math.min(18, Math.round(yRoom * 0.75)));
    var tickMaj  = Math.min(yRoom * 0.40, 6);
    var tickMin  = tickMaj * 0.55;

    ctx.save();
    ctx.font         = fontSize + 'px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    // Ligne de base
    ctx.strokeStyle = '#8a9aaa';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(simCorde.cordeLeft, yBase);
    ctx.lineTo(simCorde.cordeRight, yBase);
    ctx.stroke();

    // Ticks principaux
    ctx.strokeStyle = '#5a6a78';
    ctx.lineWidth   = 1;
    ctx.fillStyle   = '#5a6a78';

    for (var m_ = 0; m_ <= xMaxM + step * 0.01; m_ += step) {
        var xc = simCorde.cordeLeft + m_ / mPerPx;
        if (xc > simCorde.cordeRight + 0.5) break;
        ctx.beginPath();
        ctx.moveTo(xc, yBase);
        ctx.lineTo(xc, yBase + tickMaj);
        ctx.stroke();
        ctx.fillText(m_ === 0 ? '0' : fmtFR(m_, decimals), xc, yBase + tickMaj + 1);
    }

    // Ticks secondaires
    ctx.strokeStyle = '#a0b0bc';
    ctx.lineWidth   = 0.8;
    var halfStep = step / 2;
    for (var m2 = halfStep; m2 <= xMaxM + halfStep * 0.01; m2 += step) {
        var xc2 = simCorde.cordeLeft + m2 / mPerPx;
        if (xc2 > simCorde.cordeRight + 0.5) break;
        ctx.beginPath();
        ctx.moveTo(xc2, yBase);
        ctx.lineTo(xc2, yBase + tickMin);
        ctx.stroke();
    }

    // Unité
    if (yRoom >= 14) {
        ctx.fillStyle    = '#7a8a96';
        ctx.font         = Math.max(12, fontSize - 1) + 'px monospace';
        ctx.textAlign    = 'right';
        ctx.fillText('m', simCorde.cordeLeft - 8, yBase + tickMaj + 1);
    }

    ctx.restore();
}

