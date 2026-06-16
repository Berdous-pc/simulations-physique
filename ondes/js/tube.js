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

// Facteur de cap du déplacement visuel (recalculé chaque frame dans drawTube).
// Garantit A×k ≤ 0.7 pour éviter les colonnes de largeur négative (bandes blanches).
var tubeDispCap = 1.0;

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

    tubeCanvas.width  = w;
    tubeCanvas.height = h;

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

    // ── Positions par défaut des balises ─────────────────────────────
    if (!sim.beacon1.active)
        sim.beacon1.x = sim.tubeLeft + sim.tubeLength * 0.30;
    if (!sim.beacon2.active)
        sim.beacon2.x = sim.tubeLeft + sim.tubeLength * 0.65;

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
    var W      = tubeCanvas.width;
    var H      = tubeCanvas.height;

    if (!W || !H) return;

    // ── Normalisation visuelle ───────────────────────────────────────────
    // tubeDispCap cible A×k ∈ [AK_MIN, AK_CAP] :
    //   • AK_MIN (0.55) : boost si A×k trop petit (K élevé / f faible)
    //     → compression/raréfaction toujours bien perceptible (densité ±2×).
    //   • AK_CAP (0.90) : cap si A×k trop grand (K faible / ρ élevé / f élevée)
    //     → évite que les particules se chevauchent trop.
    //   • Entre les deux : tubeDispCap = 1.0, physique naturelle.
    // En mode impulsion, on utilise la fréquence effective 1/T_IMPULSE et
    // l'amplitude effective aEff = memAmplitude/2 (déplacement (1−cos)/2).
    // La physique (graphe ΔP, waveDisplacement) n'est PAS affectée.
    {
        var freqEff_ = (sim.sourceMode === 'impulse') ? 1.0 / T_IMPULSE : sim.freq;
        var aEff_    = (sim.sourceMode === 'impulse') ? sim.memAmplitude / 2 : sim.memAmplitude;
        var kEff_    = (sim.c_sim > 0) ? 2 * Math.PI * freqEff_ / sim.c_sim : 0;
        var akEff_   = aEff_ * kEff_;
        var AK_MIN   = 0.55;
        var AK_CAP   = 0.90;
        tubeDispCap = (akEff_ > 0)
            ? Math.max(AK_MIN, Math.min(AK_CAP, akEff_)) / akEff_
            : 1.0;
    }

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

    var W        = tubeCanvas.width;
    var H        = tubeCanvas.height;
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
    // Déplacement visuel de la membrane : même cap que les colonnes mais plafonné à 1.0.
    // → La membrane bénéficie de la réduction du cap à haute fréquence (évite le chevauchement),
    //   mais n'est jamais "boostée" au-delà de l'amplitude physique réelle à basse fréquence.
    var memCap = Math.min(1.0, tubeDispCap);
    var disp = waveDisplacement(0, sim.simTime) * memCap;

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
//  Position affichée : px = tubeLeft + x0 + u(x0, t) × tubeDispCap
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
            var u  = waveDisplacement(x0, sim.simTime) * tubeDispCap;
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
                var u  = waveDisplacement(x0, sim.simTime) * tubeDispCap;
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
    var W        = tubeCanvas.width;
    var H        = tubeCanvas.height;
    var yRoom    = H - y2;
    if (yRoom < 6) return;

    var fontSize  = Math.max(13, Math.min(18, Math.round(yRoom * 0.75)));
    var tickMaj   = Math.min(yRoom * 0.40, 6);

    ctx.save();
    ctx.fillStyle    = color;
    ctx.font         = 'bold ' + fontSize + 'px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(xCm.toFixed(1), x, y2 + tickMaj + 1);
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

    function onDown(e) {
        var rect = tubeCanvas.getBoundingClientRect();
        var mx   = (e.clientX - rect.left) * (tubeCanvas.width  / rect.width);
        var my   = (e.clientY - rect.top)  * (tubeCanvas.height / rect.height);

        // Choisir les balises selon le tab actif
        var b1 = (typeof activeTab !== 'undefined' && activeTab === 'corde')
                    ? simCorde.beacon1 : sim.beacon1;
        var b2 = (typeof activeTab !== 'undefined' && activeTab === 'corde')
                    ? simCorde.beacon2 : sim.beacon2;

        // Priorité : drag d'une balise
        if (nearBeacon(mx, b1)) {
            tubeInter.mode = 'beacon1-drag';
            tubeCanvas.setPointerCapture(e.pointerId);
            return;
        }
        if (nearBeacon(mx, b2)) {
            tubeInter.mode = 'beacon2-drag';
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
            var mx   = (e.clientX - rect.left) * (tubeCanvas.width  / rect.width);

            var b1 = (typeof activeTab !== 'undefined' && activeTab === 'corde')
                        ? simCorde.beacon1 : sim.beacon1;
            var b2 = (typeof activeTab !== 'undefined' && activeTab === 'corde')
                        ? simCorde.beacon2 : sim.beacon2;

            if (nearBeacon(mx, b1) || nearBeacon(mx, b2)) {
                tubeCanvas.style.cursor = 'ew-resize';
            } else if (sim.selectionMode && !(typeof activeTab !== 'undefined' && activeTab === 'corde')) {
                tubeCanvas.style.cursor = 'crosshair';
            } else {
                tubeCanvas.style.cursor = 'default';
            }
            return;
        }

        var rect = tubeCanvas.getBoundingClientRect();
        var mx   = (e.clientX - rect.left) * (tubeCanvas.width  / rect.width);
        var my   = (e.clientY - rect.top)  * (tubeCanvas.height / rect.height);

        // Bornes de déplacement selon le tab
        var isCorde = (typeof activeTab !== 'undefined' && activeTab === 'corde');
        var left    = isCorde ? simCorde.cordeLeft  : sim.tubeLeft;
        var right   = isCorde ? simCorde.cordeRight : sim.tubeRight;
        var b1      = isCorde ? simCorde.beacon1    : sim.beacon1;
        var b2      = isCorde ? simCorde.beacon2    : sim.beacon2;

        if (tubeInter.mode === 'beacon1-drag') {
            b1.x = Math.max(left, Math.min(right, mx));
        } else if (tubeInter.mode === 'beacon2-drag') {
            b2.x = Math.max(left, Math.min(right, mx));
        }
    }

    function onUp() {
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

// ── Recalcul de memAmplitude depuis amplitudeCm ───────────────────────
//  amplitudeCm (cm) → px via l'échelle 40 cm sur cordeLength px.
//  Borné pour ne pas dépasser la demi-hauteur utile de la zone.

function _recalcMemAmplitudeCorde() {
    var pxPerCm = simCorde.cordeLength > 0 ? simCorde.cordeLength / 40 : 10;
    var halfH   = (simCorde.cordeBottom - simCorde.cordeTop) / 2;
    var ampPx   = simCorde.amplitudeCm * pxPerCm;
    // Borner : au minimum 5 px, au maximum 90 % de la demi-hauteur
    simCorde.memAmplitude = Math.max(5, Math.min(halfH * 0.90, ampPx));
}

// ── Resize corde ──────────────────────────────────────────────────────

function resizeCorde() {
    tubeCanvas = tubeCanvas || document.getElementById('tube-canvas');
    tubeCtx    = tubeCtx    || tubeCanvas.getContext('2d');

    var wrap = document.getElementById('tube-canvas-wrap');
    var w    = wrap.clientWidth;
    var h    = wrap.clientHeight;
    if (w < 10 || h < 28) return;

    tubeCanvas.width  = w;
    tubeCanvas.height = h;

    // ── Géométrie de la zone corde ────────────────────────────────────
    // Même logique que le tube son : marge horizontale + verticale
    var marginH      = 13;
    var marginTop    = 4;
    var marginBottom = Math.round(h * 0.12);

    simCorde.cordeLeft   = marginH + SHAKER_BASE_W;
    simCorde.cordeRight  = w - marginH;
    simCorde.cordeLength = simCorde.cordeRight - simCorde.cordeLeft;
    simCorde.cordeTop    = marginTop;
    simCorde.cordeBottom = Math.max(marginTop + 20, h - marginBottom);
    simCorde.cordeMiddleY = Math.round((simCorde.cordeTop + simCorde.cordeBottom) / 2);

    // ── Calibration C_BASE_CORDE ──────────────────────────────────────
    var c_norm_default_corde = Math.sqrt(T_DEFAULT / MU_DEFAULT);  // = 2
    C_BASE_CORDE = simCorde.cordeLength / (2.0 * c_norm_default_corde);

    // ── Amplitude du pot vibrant ──────────────────────────────────────
    // Convertie depuis amplitudeCm (cm) vers px via l'échelle 40 cm = cordeLength px.
    // Bornée pour ne pas déborder de la demi-hauteur disponible.
    _recalcMemAmplitudeCorde();

    // ── Positions par défaut des balises ─────────────────────────────
    if (!simCorde.beacon1.active)
        simCorde.beacon1.x = simCorde.cordeLeft + simCorde.cordeLength * 0.30;
    if (!simCorde.beacon2.active)
        simCorde.beacon2.x = simCorde.cordeLeft + simCorde.cordeLength * 0.65;

    updateCeleriteCorde();
}

// ── Dessin de la scène corde ──────────────────────────────────────────

function drawCorde() {
    tubeCanvas = tubeCanvas || document.getElementById('tube-canvas');
    tubeCtx    = tubeCtx    || tubeCanvas.getContext('2d');
    var ctx    = tubeCtx;
    var W      = tubeCanvas.width;
    var H      = tubeCanvas.height;
    if (!W || !H) return;

    // Recalculer le cap de déplacement visuel
    updateCordeDispCap();

    // ── Fond général ──────────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fdf8f0';
    ctx.fillRect(0, 0, W, H);

    // ── Zone de la corde (fond légèrement teinté) ─────────────────────
    var zoneH   = simCorde.cordeBottom - simCorde.cordeTop;
    ctx.fillStyle = '#f0ece4';
    ctx.fillRect(simCorde.cordeLeft, simCorde.cordeTop, simCorde.cordeLength, zoneH);

    // ── Pot vibrant (à gauche) ────────────────────────────────────────
    // Dessiné EN PREMIER : son masque efface le fond de zone, puis la
    // corde est tracée par-dessus en partant exactement du point d'accroche.
    _drawShaker(ctx);

    // ── Fil de la corde ───────────────────────────────────────────────
    // Dessiné APRÈS le shaker pour partir visuellement du sommet du tube.
    _drawCordeWire(ctx);

    // ── Balises ───────────────────────────────────────────────────────
    _drawCordeBeacons(ctx);

    // ── Règle graduée ─────────────────────────────────────────────────
    _drawCordeRuler(ctx);
}

// ── Fil de la corde ───────────────────────────────────────────────────
//
//  La corde est tracée comme un chemin sinueux depuis x=cordeLeft jusqu'à
//  x=cordeRight. Pour chaque colonne x (pixels), le déplacement vertical
//  y(x,t) = cordeDisplacement(x − cordeLeft, simTime) × cordeDispCap
//  est calculé et ajouté à cordeMiddleY.
//
//  Épaisseur du trait = f(μ) : de 1.5 px (μ=0.5) à 5 px (μ=4)
//  Couleur : bordeaux #7a2510

function _drawCordeWire(ctx) {
    var L  = simCorde.cordeLength;
    if (L <= 0) return;

    // Déplacement au point d'accroche (x=0 de la corde = cordeLeft)
    var disp0 = cordeDisplacement(0, simCorde.simTime) * cordeDispCap;
    var startX = simCorde.cordeLeft;
    var startY = simCorde.cordeMiddleY + disp0;

    // Épaisseur selon μ : linéaire de 1.5 (μ=0.5) à 5 (μ=4)
    var muRange    = 4.0 - 0.5;
    var lwRange    = 5.0 - 1.5;
    var cordeLineW = 1.5 + ((simCorde.mu - 0.5) / muRange) * lwRange;

    // Tracé pixel par pixel — sous-pas si λ < 8 px canvas
    var freqEff_  = (simCorde.sourceMode === 'impulse') ? 1.0 / T_IMPULSE : simCorde.freq;
    var lambda_px = (simCorde.c_sim > 0) ? simCorde.c_sim / freqEff_ : L;
    var subSteps  = (lambda_px < L / 50) ? Math.ceil(8 * L / Math.max(0.5, lambda_px)) : Math.ceil(L / 1);
    subSteps      = Math.max(200, Math.min(6000, subSteps));

    // Clipping dans la zone corde uniquement
    ctx.save();
    ctx.beginPath();
    ctx.rect(simCorde.cordeLeft, simCorde.cordeTop, L, simCorde.cordeBottom - simCorde.cordeTop);
    ctx.clip();

    ctx.beginPath();
    ctx.moveTo(startX, startY);   // premier point = point d'accroche
    for (var s = 1; s <= subSteps; s++) {
        var frac = s / subSteps;
        var x_px = frac * L;
        var disp = cordeDisplacement(x_px, simCorde.simTime) * cordeDispCap;
        var cx   = simCorde.cordeLeft + x_px;
        var cy   = simCorde.cordeMiddleY + disp;
        ctx.lineTo(cx, cy);
    }

    ctx.shadowColor = 'rgba(80,20,0,0.25)';
    ctx.shadowBlur  = cordeLineW;
    ctx.strokeStyle = '#7a2510';
    ctx.lineWidth   = cordeLineW;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.stroke();
    ctx.shadowBlur  = 0;

    ctx.restore();
}

// ── Pot vibrant ───────────────────────────────────────────────────────
//
//  Géométrie (vue de face, vertical) :
//
//    ┌──────┐   ← sommet du tube animé (y = midY + disp)
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
//    part du dessus de la base et monte jusqu'à midY + disp
//  - Point d'accroche : petit disque coloré au sommet du tube
//    → c'est d'ici que part le fil de la corde

function _drawShaker(ctx) {
    var cordeTop    = simCorde.cordeTop;
    var cordeBottom = simCorde.cordeBottom;
    var midY        = simCorde.cordeMiddleY;
    var zoneH       = cordeBottom - cordeTop;
    var marginLeft  = simCorde.cordeLeft;   // largeur totale de la zone pot

    // Déplacement actuel de l'extrémité gauche de la corde (x=0)
    var disp = cordeDisplacement(0, simCorde.simTime) * Math.min(1.0, cordeDispCap);

    // ── Dimensions ────────────────────────────────────────────────────
    var baseH  = Math.max(12, Math.round(zoneH * 0.18));   // hauteur base fixe
    var baseW  = Math.max(18, Math.round(marginLeft * 0.80)); // largeur base
    var baseX  = Math.round((marginLeft - baseW) / 2);     // centré horizontalement
    var baseY  = cordeBottom - baseH;                       // ancré en bas de zone

    var tubeW  = Math.max(6, Math.round(baseW * 0.28));    // largeur tube fin
    var tubeX  = Math.round(marginLeft / 2 - tubeW / 2);  // centré

    // Sommet du tube = position animée (midY + disp), plancher = dessus de la base
    var tubeTop_anim = Math.min(baseY - 1, midY + disp);   // sommet animé (borné)
    var tubeBot      = baseY;                               // pied du tube = dessus base

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

    // ── Point d'accroche de la corde (sommet du tube) ─────────────────
    var attachX = marginLeft;           // extrémité droite = bord de la zone corde
    var attachY = tubeTop_anim;         // hauteur animée
    var dotR    = Math.max(3, tubeW * 0.45);

    // Petite encoche : trait horizontal reliant sommet tube au bord de zone
    ctx.strokeStyle = '#5a3a20';
    ctx.lineWidth   = Math.max(1.5, tubeW * 0.3);
    ctx.beginPath();
    ctx.moveTo(tubeX + tubeW, attachY);
    ctx.lineTo(attachX, attachY);
    ctx.stroke();

    // Disque d'accroche
    ctx.fillStyle   = '#7a2510';
    ctx.beginPath();
    ctx.arc(tubeX + tubeW / 2, attachY, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a1008';
    ctx.lineWidth   = 1;
    ctx.stroke();
}

// ── Balises corde ─────────────────────────────────────────────────────

function _drawCordeBeacons(ctx) {
    if (simCorde.beacon1.active) _drawOneCordeBeacon(ctx, simCorde.beacon1.x, '#e07020', 'B1');
    if (simCorde.beacon2.active) _drawOneCordeBeacon(ctx, simCorde.beacon2.x, '#2a8a50', 'B2');
}

function _drawOneCordeBeacon(ctx, x, color, label) {
    var y1    = simCorde.cordeTop;
    var y2    = simCorde.cordeBottom;
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

    // Étiquette au-dessus
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

    // Label de position sur la règle graduée
    var L = simCorde.cordeLength;
    if (L <= 0) return;
    var cmPerPx  = 40 / L;
    var xCm      = (x - simCorde.cordeLeft) * cmPerPx;
    var H        = tubeCanvas.height;
    var yRoom    = H - y2;
    if (yRoom < 6) return;

    var fontSize = Math.max(13, Math.min(18, Math.round(yRoom * 0.75)));
    var tickMaj  = Math.min(yRoom * 0.40, 6);

    ctx.save();
    ctx.fillStyle    = color;
    ctx.font         = 'bold ' + fontSize + 'px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(xCm.toFixed(1), x, y2 + tickMaj + 1);
    ctx.restore();
}

// ── Règle graduée corde ───────────────────────────────────────────────

function _drawCordeRuler(ctx) {
    var L = simCorde.cordeLength;
    if (L <= 0) return;

    var H        = tubeCanvas.height;
    var yBase    = simCorde.cordeBottom;
    var yRoom    = H - yBase;
    if (yRoom < 6) return;

    var cmPerPx  = 40 / L;
    var xMaxCm   = 40;

    var range    = xMaxCm;
    var rough    = range / 6;
    var mag      = Math.pow(10, Math.floor(Math.log10(rough)));
    var mant     = rough / mag;
    var step     = mant < 1.5 ? mag : mant < 3.5 ? 2 * mag : mant < 7.5 ? 5 * mag : 10 * mag;

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

    for (var cm = 0; cm <= xMaxCm + step * 0.01; cm += step) {
        var xc = simCorde.cordeLeft + cm / cmPerPx;
        if (xc > simCorde.cordeRight + 0.5) break;
        ctx.beginPath();
        ctx.moveTo(xc, yBase);
        ctx.lineTo(xc, yBase + tickMaj);
        ctx.stroke();
        ctx.fillText(cm === 0 ? '0' : cm.toFixed(0), xc, yBase + tickMaj + 1);
    }

    // Ticks secondaires
    ctx.strokeStyle = '#a0b0bc';
    ctx.lineWidth   = 0.8;
    var halfStep = step / 2;
    for (var cm2 = halfStep; cm2 <= xMaxCm + halfStep * 0.01; cm2 += step) {
        var xc2 = simCorde.cordeLeft + cm2 / cmPerPx;
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
        ctx.fillText('cm', simCorde.cordeLeft - 8, yBase + tickMaj + 1);
    }

    ctx.restore();
}

// ── Interactions souris pour les balises corde ────────────────────────
// Injecté dans initTubeInteractions via le flag activeTab défini dans ui.js

function _nearCordeBeacon(x, beacon) {
    return beacon.active && Math.abs(x - beacon.x) < 10;
}
