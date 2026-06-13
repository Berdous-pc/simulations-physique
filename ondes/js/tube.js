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

// Canvas offscreen pour le rendu 2D des vagues
var offscreenCanvas = null;
var offscreenCtx    = null;

// Épaisseur visuelle de la membrane dans le canvas (px)
var MEM_THICKNESS = 14;

// Facteur de cap du déplacement visuel (recalculé chaque frame dans drawTube).
// Garantit A×k ≤ 0.7 pour éviter les colonnes de largeur négative (bandes blanches).
var tubeDispCap = 1.0;

// ── État de l'interaction souris sur le canvas tube ───────────────────
var tubeInter = {
    mode      : null,   // null | 'select-rect' | 'beacon1-drag' | 'beacon2-drag' | 'sourceS-drag' | 'pointM-drag'
    rectStart : { x: 0, y: 0 },
    rectEnd   : { x: 0, y: 0 },
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

    // ── Canvas offscreen pour le rendu 2D des vagues ──────────────────
    if (!offscreenCanvas) {
        offscreenCanvas = document.createElement('canvas');
    }
    offscreenCanvas.width  = Math.ceil(w / 4);
    offscreenCanvas.height = Math.ceil(h / 4);
    offscreenCtx = offscreenCanvas.getContext('2d');

    // ── Géométrie interne du tube ─────────────────────────────────────
    var marginH      = 8;
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
    // Calibrée sur dx0 à ρ=1 pour un ratio A/dx0 ≈ 2.5 constant,
    // quelle que soit la taille de la fenêtre.
    var nColsRho1    = Math.max(15, Math.round(sim.tubeLength / 9));
    var dx0Rho1      = sim.tubeLength / nColsRho1;
    sim.memAmplitude = Math.max(9, Math.min(30, dx0Rho1 * 2.5));

    // ── Positions par défaut des balises ─────────────────────────────
    if (!sim.beacon1.active)
        sim.beacon1.x = sim.tubeLeft + sim.tubeLength * 0.30;
    if (!sim.beacon2.active)
        sim.beacon2.x = sim.tubeLeft + sim.tubeLength * 0.65;

    // ── Positions par défaut des points S et M (Vagues) ──────────────
    if (sim.sourceS.x === 0 && sim.sourceS.y === 0) {
        sim.sourceS.x = Math.round(sim.tubeLeft + sim.tubeLength * 0.25);
        sim.sourceS.y = Math.round((sim.tubeTop + sim.tubeBottom) / 2);
    }
    if (sim.pointM.x === 0 && sim.pointM.y === 0) {
        sim.pointM.x = Math.round(sim.tubeLeft + sim.tubeLength * 0.65);
        sim.pointM.y = Math.round((sim.tubeTop + sim.tubeBottom) / 2);
    }

    updateCelerite();
    initCols();
}

function scheduleResizeTube() {
    if (tubeResizeRAF) return;
    tubeResizeRAF = true;
    requestAnimationFrame(function() {
        tubeResizeRAF = false;
        resizeTube();
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
//  Dessin et Rendu des Vagues 2D (Offscreen Canvas + Bilinear Zoom)
// ══════════════════════════════════════════════════════════════════════

function drawWaves(ctx) {
    var W = tubeCanvas.width;
    var H = tubeCanvas.height;
    if (!W || !H || !offscreenCanvas || !offscreenCtx) return;

    var oW = offscreenCanvas.width;
    var oH = offscreenCanvas.height;
    var imgData = offscreenCtx.createImageData(oW, oH);
    var data = imgData.data;

    var t = sim.simTime;
    var f = sim.vaguesFreq;
    var v_px = sim.vaguesCelerite * (W / 40);
    var alpha = sim.vaguesAttenuation * 0.005;

    var sx = sim.sourceS.x;
    var sy = sim.sourceS.y;

    // Couleurs du gradient continu (Trough -> Rest -> Peak)
    // Trough (Creux): Bleu marine profond (#0a1c36) -> RGB(10, 28, 54)
    var r1 = 10, g1 = 28, b1 = 54;
    // Equilibrium (Repos): Bleu ardoise (#23415f) -> RGB(35, 65, 95)
    var r0 = 35, g0 = 65, b0 = 95;
    // Peak (Crête): Bleu glacé / Blanc (#d2eeff) -> RGB(210, 238, 255)
    var r2 = 210, g2 = 238, b2 = 255;

    var idx = 0;
    for (var py = 0; py < oH; py++) {
        var y = py * 4 + 2; // Échantillonne au centre du bloc 4x4
        for (var px = 0; px < oW; px++) {
            var x = px * 4 + 2;
            var dx = x - sx;
            var dy = y - sy;
            var d = Math.sqrt(dx * dx + dy * dy);
            
            var amp = 0;
            var t_ret = t - d / v_px;
            if (t_ret >= 0) {
                // Modèle d'onde circulaire amortie se propageant
                amp = Math.sin(2 * Math.PI * f * t_ret) * Math.exp(-alpha * d);
            }

            var r = 0, g = 0, b = 0;
            if (amp < 0) {
                // Interpolation Trough (-1) -> Equilibrium (0)
                var k = amp + 1; // 0 à 1
                r = r1 + k * (r0 - r1);
                g = g1 + k * (g0 - g1);
                b = b1 + k * (b0 - b1);
            } else {
                // Interpolation Equilibrium (0) -> Peak (1)
                var k = amp; // 0 à 1
                r = r0 + k * (r2 - r0);
                g = g0 + k * (g2 - g0);
                b = b0 + k * (b2 - b0);
            }

            data[idx]     = Math.round(r);
            data[idx + 1] = Math.round(g);
            data[idx + 2] = Math.round(b);
            data[idx + 3] = 255;
            idx += 4;
        }
    }

    offscreenCtx.putImageData(imgData, 0, 0);

    // Zoom bilinéaire pour étirer le canvas offscreen sur le canvas principal
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(offscreenCanvas, 0, 0, W, H);
    ctx.restore();

    // Rendu des points interactifs S et M
    _drawInteractivePoint(ctx, sim.sourceS, 'S', '#e67e22'); // Orange/Or
    _drawInteractivePoint(ctx, sim.pointM, 'M', '#10b981');  // Vert émeraude
}

function _drawInteractivePoint(ctx, pt, label, color) {
    ctx.save();
    // Halo lumineux extérieur (glow)
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.fillStyle = color;
    
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Pas de halo pour le point blanc interne et le texte
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Étiquette au-dessus du point
    ctx.fillStyle = color;
    ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, pt.x, pt.y - 12);
    ctx.restore();
}

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

    if (sim.activeTab === 'vagues') {
        drawWaves(ctx);
        return;
    }

    // ── Normalisation visuelle ───────────────────────────────────────────
    // tubeDispCap cible A×k ∈ [AK_MIN, AK_CAP] :
    //   • AK_MIN (0.55) : boost si A×k trop petit (K élevé / f faible)
    //     → compression/raréfaction toujours bien perceptible (densité ±2×).
    //   • AK_CAP (0.90) : cap si A×k trop grand (K faible / ρ élevé / f élevée)
    //     → évite que les particules se chevauchent trop.
    //   • Entre les deux : tubeDispCap = 1.0, physique naturelle.
    // La physique (graphe ΔP, waveDisplacement) n'est PAS affectée.
    {
        var kEff_  = (sim.c_sim > 0) ? 2 * Math.PI * sim.freq / sim.c_sim : 0;
        var akEff_ = sim.memAmplitude * kEff_;
        var AK_MIN = 0.55;
        var AK_CAP = 0.90;
        tubeDispCap = (akEff_ > 0)
            ? Math.max(AK_MIN, Math.min(AK_CAP, akEff_)) / akEff_
            : 1.0;
    }

    // ── Fond général ─────────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fdf8f0';
    ctx.fillRect(0, 0, W, H);

    // ── Fond intérieur du tube ────────────────────────────────────────
    ctx.fillStyle = '#f7f3ec';
    ctx.fillRect(sim.tubeLeft, sim.tubeTop,
                 sim.tubeLength, sim.tubeBottom - sim.tubeTop);

    // ── Parois du tube (haut, bas, droite ouverte) ────────────────────
    ctx.strokeStyle = '#3a4a5a';
    ctx.lineWidth   = 1.8;
    ctx.beginPath();
    // Paroi haute
    ctx.moveTo(sim.tubeLeft,  sim.tubeTop);
    ctx.lineTo(sim.tubeRight, sim.tubeTop);
    // Paroi basse
    ctx.moveTo(sim.tubeLeft,  sim.tubeBottom);
    ctx.lineTo(sim.tubeRight, sim.tubeBottom);
    ctx.stroke();

    // Extrémité droite : pas de fermeture — le tube est infini à droite.
    // Le fondu est appliqué après les particules (voir ci-dessous).

    // ── Membrane (haut-parleur) ───────────────────────────────────────
    _drawMembrane(ctx);

    // ── Particules ────────────────────────────────────────────────────
    _drawParticles(ctx);

    // ── Balises ───────────────────────────────────────────────────────
    _drawBeacons(ctx);

    // ── Règle graduée sous le tube ────────────────────────────────────
    _drawTubeRuler(ctx);

    // ── Rectangle de sélection en cours ──────────────────────────────
    if (tubeInter.mode === 'select-rect') {
        _drawSelectionRect(ctx);
    }
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

    var fontSize  = Math.max(10, Math.min(13, Math.round(yRoom * 0.55)));
    var tickMaj   = Math.min(yRoom * 0.45, 7);   // hauteur tick principal
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

    // Unité (en cm) à l'extrémité droite si la place le permet
    if (yRoom >= 14) {
        ctx.fillStyle    = '#7a8a96';
        ctx.font         = Math.max(9, fontSize - 1) + 'px monospace';
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('cm', sim.tubeRight, yBase + tickMaj + 1);
    }

    ctx.restore();
}

// ── Membrane mobile ───────────────────────────────────────────────────

function _drawMembrane(ctx) {
    // Déplacement visuel de la membrane au temps courant (capé pour cohérence avec les colonnes)
    var disp = waveDisplacement(0, sim.simTime) * tubeDispCap;

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
//    • x0  : position de repos (px depuis tubeLeft), domaine [0, L+extraRight]
//    • ry  : position y mémorisée (0..1), gelée en pause
//  Position affichée : px = tubeLeft + x0 + u(x0, t) × tubeDispCap
//
//  Les particules de la zone virtuelle droite (x0 > tubeLength) entrent
//  naturellement dans le tube quand l'onde crée une raréfaction à droite.
//  Le clip [tubeLeft, tubeRight] × [tubeTop, tubeBottom] les masque sinon.
//
//  Deux passes (non-sélectionnées puis sélectionnées) pour minimiser
//  les changements de fillStyle.

function _drawParticles(ctx) {
    var N = sim.cols.length;
    if (N === 0) return;

    var H = sim.tubeBottom - sim.tubeTop;
    var r = particleRadius();

    // Clipping au rectangle intérieur du tube
    ctx.save();
    ctx.beginPath();
    ctx.rect(sim.tubeLeft, sim.tubeTop, sim.tubeLength, H);
    ctx.clip();

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

    ctx.restore();
}

// ── Balises ───────────────────────────────────────────────────────────

function _drawBeacons(ctx) {
    if (sim.beacon1.active) _drawOneBeacon(ctx, sim.beacon1.x, '#e07020', 'B1');
    if (sim.beacon2.active) _drawOneBeacon(ctx, sim.beacon2.x, '#2a8a50', 'B2');
}

function _drawOneBeacon(ctx, x, color, label) {
    var y1   = sim.tubeTop;
    var y2   = sim.tubeBottom;
    var fSize = Math.max(11, Math.round((y2 - y1) * 0.13));

    // Ligne verticale en pointillés
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.setLineDash([5, 4]);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Étiquette au-dessus du tube
    ctx.fillStyle = color;
    ctx.font      = 'bold ' + fSize + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
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
}

// ── Rectangle de sélection ────────────────────────────────────────────

function _drawSelectionRect(ctx) {
    var x1 = Math.min(tubeInter.rectStart.x, tubeInter.rectEnd.x);
    var y1 = Math.min(tubeInter.rectStart.y, tubeInter.rectEnd.y);
    var x2 = Math.max(tubeInter.rectStart.x, tubeInter.rectEnd.x);
    var y2 = Math.max(tubeInter.rectStart.y, tubeInter.rectEnd.y);

    ctx.save();
    ctx.strokeStyle = '#2a6aaa';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.fillStyle   = 'rgba(42,106,170,0.10)';
    ctx.fillRect  (x1, y1, x2 - x1, y2 - y1);
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    ctx.setLineDash([]);
    ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════
//  Interactions souris sur le canvas tube
// ══════════════════════════════════════════════════════════════════════

(function initTubeInteractions() {
    // Hit-test : est-on proche d'une balise ?
    function nearBeacon(x, beacon) {
        return beacon.active && Math.abs(x - beacon.x) < 10;
    }

    // Hit-test : est-on proche d'un point interactif 2D (S ou M) ?
    function nearPoint(mx, my, pt) {
        var dx = mx - pt.x;
        var dy = my - pt.y;
        return (dx * dx + dy * dy) < 15 * 15; // Rayon de détection de 15px
    }

    function onDown(e) {
        var rect = tubeCanvas.getBoundingClientRect();
        var mx   = (e.clientX - rect.left) * (tubeCanvas.width  / rect.width);
        var my   = (e.clientY - rect.top)  * (tubeCanvas.height / rect.height);

        // --- Mode Vagues ---
        if (sim.activeTab === 'vagues') {
            if (nearPoint(mx, my, sim.sourceS)) {
                tubeInter.mode = 'sourceS-drag';
                tubeCanvas.setPointerCapture(e.pointerId);
                return;
            }
            if (nearPoint(mx, my, sim.pointM)) {
                tubeInter.mode = 'pointM-drag';
                tubeCanvas.setPointerCapture(e.pointerId);
                return;
            }
            return;
        }

        // --- Mode Son ---
        // Priorité : drag d'une balise
        if (nearBeacon(mx, sim.beacon1)) {
            tubeInter.mode = 'beacon1-drag';
            tubeCanvas.setPointerCapture(e.pointerId);
            return;
        }
        if (nearBeacon(mx, sim.beacon2)) {
            tubeInter.mode = 'beacon2-drag';
            tubeCanvas.setPointerCapture(e.pointerId);
            return;
        }

        // Sélection rectangulaire (si mode actif)
        if (sim.selectionMode) {
            tubeInter.mode         = 'select-rect';
            tubeInter.rectStart    = { x: mx, y: my };
            tubeInter.rectEnd      = { x: mx, y: my };
            tubeCanvas.setPointerCapture(e.pointerId);
        }
    }

    function onMove(e) {
        var rect = tubeCanvas.getBoundingClientRect();
        var mx   = (e.clientX - rect.left) * (tubeCanvas.width  / rect.width);
        var my   = (e.clientY - rect.top)  * (tubeCanvas.height / rect.height);

        if (!tubeInter.mode) {
            // Curseur adaptatif au survol
            if (sim.activeTab === 'vagues') {
                if (nearPoint(mx, my, sim.sourceS) || nearPoint(mx, my, sim.pointM)) {
                    tubeCanvas.style.cursor = 'move';
                } else {
                    tubeCanvas.style.cursor = 'default';
                }
            } else {
                if (nearBeacon(mx, sim.beacon1) || nearBeacon(mx, sim.beacon2)) {
                    tubeCanvas.style.cursor = 'ew-resize';
                } else if (sim.selectionMode) {
                    tubeCanvas.style.cursor = 'crosshair';
                } else {
                    tubeCanvas.style.cursor = 'default';
                }
            }
            return;
        }

        // Pendant le drag
        if (sim.activeTab === 'vagues') {
            // Limiter les points S et M aux limites du canvas avec une marge de protection
            var clampX = Math.max(10, Math.min(tubeCanvas.width - 10, mx));
            var clampY = Math.max(10, Math.min(tubeCanvas.height - 10, my));

            if (tubeInter.mode === 'sourceS-drag') {
                sim.sourceS.x = Math.round(clampX);
                sim.sourceS.y = Math.round(clampY);
            } else if (tubeInter.mode === 'pointM-drag') {
                sim.pointM.x = Math.round(clampX);
                sim.pointM.y = Math.round(clampY);
            }
        } else {
            if (tubeInter.mode === 'beacon1-drag') {
                sim.beacon1.x = Math.max(sim.tubeLeft, Math.min(sim.tubeRight, mx));
            } else if (tubeInter.mode === 'beacon2-drag') {
                sim.beacon2.x = Math.max(sim.tubeLeft, Math.min(sim.tubeRight, mx));
            } else if (tubeInter.mode === 'select-rect') {
                tubeInter.rectEnd = { x: mx, y: my };
            }
        }
    }

    function onUp() {
        if (sim.activeTab !== 'vagues' && tubeInter.mode === 'select-rect') {
            // Appliquer la sélection
            _applySelection();
        }
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

// ── Applique la sélection rectangulaire aux particules ───────────────
//  Une particule est sélectionnée si sa position déplacée par l'onde
//  se trouve dans le rectangle tracé par l'utilisateur.

function _applySelection() {
    var x1 = Math.min(tubeInter.rectStart.x, tubeInter.rectEnd.x);
    var x2 = Math.max(tubeInter.rectStart.x, tubeInter.rectEnd.x);
    var y1 = Math.min(tubeInter.rectStart.y, tubeInter.rectEnd.y);
    var y2 = Math.max(tubeInter.rectStart.y, tubeInter.rectEnd.y);

    // Rectangle trop petit → clic accidentel, on ignore
    if (x2 - x1 < 4 && y2 - y1 < 4) return;

    var N = sim.cols.length;
    if (N === 0) return;
    var H = sim.tubeBottom - sim.tubeTop;

    for (var i = 0; i < N; i++) {
        var x0 = sim.cols[i].x0;
        var u  = waveDisplacement(x0, sim.simTime) * tubeDispCap;
        var px = sim.tubeLeft + x0 + u;
        var py = sim.tubeTop  + sim.cols[i].ry * H;
        sim.cols[i].selected = (px >= x1 && px <= x2 && py >= y1 && py <= y2);
    }
}

// ── Désélectionner toutes les colonnes ───────────────────────────────

function clearSelection() {
    for (var i = 0; i < sim.cols.length; i++) {
        sim.cols[i].selected = false;
    }
}
