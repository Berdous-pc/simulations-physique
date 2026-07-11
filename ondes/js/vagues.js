// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  vagues.js — Simulation d'ondes de surface (vue de dessus)
//  Dépend de : sim.js (T_IMPULSE, DP_MAX_POINTS), tube.js (tubeCanvas)
//              graph.js (_updateFontSizes, _calcLeftMarginRaw, etc.)
//  Chargé après graph.js, avant ui.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Constantes ────────────────────────────────────────────────────────
var BLOCK_V               = 2;     // taille des blocs de rendu (px) — 2 pour meilleure résolution
var VAGUES_AMP_GAIN       = 1.6;   // gain visuel appliqué au champ calculé
var VAGUES_VIS_AMP_SCALE  = 5/6;   // réduit l'amplitude visuelle animation (3→équivalent 2.5)
var C_BASE_VAGUES         = 150;   // px/s par m/s — recalibré au resize
var COUPE_LEFT_MARGIN     = 70;    // px réservés à gauche pour la source en vue coupe

// Couleurs de l'onde (crêtes ↔ creux)
var COL_CREST_R = 200, COL_CREST_G = 240, COL_CREST_B = 255; // bleu très clair
var COL_TROUGH_R = 0,  COL_TROUGH_G = 10, COL_TROUGH_B = 55; // bleu nuit
// COL_BG = midpoint crête/creux → pas de cassure au front d'onde
var COL_BG_R = 100,    COL_BG_G = 125,    COL_BG_B = 155;

// ── État global ───────────────────────────────────────────────────────
var simVagues = {

    // ── Contrôle de l'animation ─────────────────────────────────────
    paused      : false,
    simTime     : 0,
    speedFactor : 1.0,

    // ── Source ──────────────────────────────────────────────────────
    sourceX   : 0,   // position canvas (px)
    sourceY   : 0,
    freq      : 1.5, // Hz
    amplitude : 1.0, // relative

    // ── Milieu ──────────────────────────────────────────────────────
    g              : 9.81,  // m/s²
    h              : 0.005, // m (profondeur) — bornes 1mm–10mm pour λ_max=1m
    attenuation    : 0.0,
    geoAttenuation : false, // atténuation en 1/√r (désactivée par défaut)

    // ── Propriétés dérivées ──────────────────────────────────────────
    c_sim : 0,   // px/s
    c_ms  : 0,   // m/s (affiché)

    // ── Enveloppe causale ────────────────────────────────────────────
    // Remis à zéro (= simTime courant) quand la source est déplacée.
    // Les ondes s'étendent depuis cette position jusqu'à r = c*(t-resetTime).
    sourceResetTime : 0,

    // ── Balises (points draggables dans le canvas 2D) ────────────────
    beacon1 : { active: false, x: 0, y: 0, snapped: false },
    beacon2 : { active: false, x: 0, y: 0, snapped: false },

    // ── Données graphes ──────────────────────────────────────────────
    graphMode     : 'dpx',   // 'dpx' (y(x)) | 'dpt' (y(t)) | 'both'
    yxData        : [],      // [{x, y}] snapshot courant
    ytData1       : [],      // [{t, y}] série temporelle balise 1
    ytData2       : [],      // [{t, y}] série temporelle balise 2
    ytTimeOrigin  : 0,

    // ── Vue graphe ───────────────────────────────────────────────────
    graphView        : { xMin: 0, xMax: 5, yMin: -1, yMax: 1 },
    graphViewHistory : [],
    graphZoomMode    : false,
    graphCursorMode  : false,
    graphUserPanned  : false,
    graphYxYMin      : -1,
    graphYxYMax      :  1,
    peakAmpCm        :  0.1,  // amplitude max observée (cm), pour l'échelle Y

    // ── Propriétés de l'onde (readout étendu) ────────────────────────
    wavePropsVisible : false,

    // ── Géométrie canvas ─────────────────────────────────────────────
    canvasW     : 0,
    canvasH     : 0,
    firstResize : true,

    // ── Vue en coupe ─────────────────────────────────────────────────
    viewMode  : 'top',   // 'top' | 'coupe'
    transAnim : null,    // null | { startT, direction }  (transition en cours)
    coupeSrcX : 0,       // x canvas de la source en vue coupe (px)
};


// ══════════════════════════════════════════════════════════════════════
//  Physique : c = √(g × h)
// ══════════════════════════════════════════════════════════════════════

function updateCeleriteVagues() {
    var c_ms = Math.sqrt(Math.max(0.001, simVagues.g * simVagues.h));
    simVagues.c_ms  = c_ms;
    simVagues.c_sim = c_ms * C_BASE_VAGUES;
}

// ══════════════════════════════════════════════════════════════════════
//  Resize — calibration et placement initial
// ══════════════════════════════════════════════════════════════════════

function resizeVagues() {
    var canvas = document.getElementById('tube-canvas');
    if (!canvas) return;
    var wrap = document.getElementById('tube-canvas-wrap');
    var w = wrap ? wrap.clientWidth  : canvas.clientWidth;
    var h = wrap ? wrap.clientHeight : canvas.clientHeight;
    if (w < 10 || h < 10) return;

    var dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    simVagues.canvasW = w;
    simVagues.canvasH = h;

    // Calibration : λ_px ≈ W/6 à défaut (g=9.81, h=0.005, f=1.5 Hz)
    var c_ms_def = Math.sqrt(9.81 * 0.005);         // ≈ 0,221 m/s
    C_BASE_VAGUES = (w / 6.0 * 1.5) / c_ms_def;    // ≈ 679 px/(m/s) pour 600px

    // Source fixe au centre
    simVagues.sourceX = Math.round(w / 2);
    simVagues.sourceY = Math.round(h / 2);

    if (simVagues.firstResize) {
        // Positions relatives initiales des balises
        simVagues.beacon1.rx = 0.5 + 0.22;
        simVagues.beacon1.ry = 0.5;
        simVagues.beacon2.rx = 0.5 + 0.40;
        simVagues.beacon2.ry = 0.5;
        simVagues.firstResize = false;
    }
    // Recalcul pixel des balises depuis leurs coordonnées relatives
    simVagues.beacon1.x = Math.round(simVagues.beacon1.rx * w);
    simVagues.beacon1.y = Math.round(simVagues.beacon1.ry * h);
    simVagues.beacon2.x = Math.round(simVagues.beacon2.rx * w);
    simVagues.beacon2.y = Math.round(simVagues.beacon2.ry * h);

    if (simVagues.viewMode === 'coupe') {
        simVagues.coupeSrcX = COUPE_LEFT_MARGIN;
    }

    updateCeleriteVagues();
}

function addSourceSampleVagues(t) { /* no-op — historique supprimé */ }

// ══════════════════════════════════════════════════════════════════════
//  Champ d'onde en un point (px, py) du canvas
//  Retourne une valeur normalisée ∈ [-1, 1].
// ══════════════════════════════════════════════════════════════════════

// Retourne le champ normalisé ∈ [-1,1] avec gain visuel (pour le rendu couleur).
function _waveFieldAt(px, py) {
    var raw = _waveFieldRaw(px, py);
    return Math.max(-1, Math.min(1, raw * VAGUES_AMP_GAIN));
}

// Retourne le champ physique brut (sin × atténuation, sans gain visuel).
// Valeurs ∈ [-1,1] en conditions normales ; peut dépasser si géo désactivée près de la source.
function _waveFieldRaw(px, py) {
    var c = simVagues.c_sim;
    if (c <= 0) return 0;

    var t    = simVagues.simTime;
    var f    = simVagues.freq;
    var maxR = Math.sqrt(simVagues.canvasW * simVagues.canvasW + simVagues.canvasH * simVagues.canvasH);
    var a5   = simVagues.attenuation * 5;
    var geo  = simVagues.geoAttenuation;

    var dx = px - simVagues.sourceX;
    var dy = py - simVagues.sourceY;
    var r  = Math.sqrt(dx * dx + dy * dy);

    if (r > c * (t - simVagues.sourceResetTime)) return 0;

    var field = Math.sin(2 * Math.PI * f * (t - r / c));
    if (geo) field *= Math.sqrt(40 / (40 + r));
    if (a5 > 0) field *= Math.exp(-a5 * r / maxR);
    return field * simVagues.amplitude;
}

// ══════════════════════════════════════════════════════════════════════
//  Rendu principal du canvas (vue de dessus)
// ══════════════════════════════════════════════════════════════════════

function drawVagues() {
    var canvas = document.getElementById('tube-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = canvas.clientWidth, H = canvas.clientHeight;   // pixels CSS — repère de sourceX/Y, dessin vectoriel
    if (!W || !H) return;
    var dpr = window.devicePixelRatio || 1;
    var PW  = canvas.width, PH = canvas.height;            // pixels physiques — repère de putImageData

    if (simVagues.transAnim) { _drawVaguesTransition(ctx, W, H, PW, PH, dpr); return; }
    if (simVagues.viewMode === 'coupe') { _drawVaguesCoupe(ctx, W, H); return; }

    if (simVagues.c_sim <= 0) {
        ctx.fillStyle = 'rgb(' + COL_BG_R + ',' + COL_BG_G + ',' + COL_BG_B + ')';
        ctx.fillRect(0, 0, W, H);
        _drawAxisVagues(ctx, W, H);
        _drawBeaconsVagues(ctx);
        _drawSourceVagues(ctx);
        return;
    }

    // ── Rendu par blocs (grille en pixels physiques, sur-échantillonnée selon le dpr) ──
    var imgData = ctx.createImageData(PW, PH);
    var data    = imgData.data;
    var B       = BLOCK_V;
    var BH      = B >> 1;

    var t        = simVagues.simTime;
    var c        = simVagues.c_sim;
    var f        = simVagues.freq;
    var TWO_PI_F = 2 * Math.PI * f;
    var maxR     = Math.sqrt(W * W + H * H);   // pixels CSS, comme _waveFieldRaw
    var a5       = simVagues.attenuation * 5;
    var geo      = simVagues.geoAttenuation;
    var sx       = simVagues.sourceX;          // pixels CSS
    var sy       = simVagues.sourceY;
    var r_front  = c * (t - simVagues.sourceResetTime); // enveloppe causale

    for (var bj = 0; bj < PH; bj += B) {
        var cy = (bj + BH) / dpr;   // position physique → repère CSS pour la physique
        for (var bi = 0; bi < PW; bi += B) {
            var cx = (bi + BH) / dpr;
            var rc, gc, bc;

            var dx = cx - sx, dy = cy - sy;
            var r = Math.sqrt(dx * dx + dy * dy);

            if (r > r_front) {
                rc = COL_BG_R; gc = COL_BG_G; bc = COL_BG_B;
            } else {
                var raw_sin = Math.sin(TWO_PI_F * (t - r / c));
                // Enveloppe d'amplitude (atténuation géo + exp)
                var env = 1.0;
                if (geo) env = Math.min(1, Math.sqrt(50 / Math.max(1, r)));
                if (a5 > 0) env *= Math.exp(-a5 * r / maxR);
                env = Math.min(1, env * VAGUES_AMP_GAIN);
                // Dégradé linéaire continu creux→crête, modulé par l'enveloppe
                var t01 = (raw_sin * env + 1) * 0.5;
                rc = Math.round(COL_TROUGH_R + t01 * (COL_CREST_R - COL_TROUGH_R));
                gc = Math.round(COL_TROUGH_G + t01 * (COL_CREST_G - COL_TROUGH_G));
                bc = Math.round(COL_TROUGH_B + t01 * (COL_CREST_B - COL_TROUGH_B));
            }

            // Remplissage du bloc (indices en pixels physiques)
            for (var dj = 0; dj < B && bj + dj < PH; dj++) {
                for (var di = 0; di < B && bi + di < PW; di++) {
                    var idx = ((bj + dj) * PW + (bi + di)) * 4;
                    data[idx]     = rc;
                    data[idx + 1] = gc;
                    data[idx + 2] = bc;
                    data[idx + 3] = 255;
                }
            }
        }
    }
    ctx.putImageData(imgData, 0, 0);

    _drawAxisVagues(ctx, W, H);
    _drawBeaconsVagues(ctx);
    _drawSourceVagues(ctx);
}

// ── Axe horizontal en pointillés ─────────────────────────────────────

function _drawAxisVagues(ctx, W, H) {
    var sy = simVagues.sourceY;
    var sx = simVagues.sourceX;
    ctx.save();

    // Ligne en pointillés
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth   = 1.2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(W, sy);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Graduations en mètres ─────────────────────────────────────────
    if (C_BASE_VAGUES > 0) {
        var m_per_px  = 1.0 / C_BASE_VAGUES;
        var total_m   = W * m_per_px;
        // Pas agréable ciblant ~6 graduations sur la largeur
        var step_raw  = total_m / 6;
        var mag       = Math.pow(10, Math.floor(Math.log10(step_raw)));
        var step;
        if      (step_raw / mag < 2) step = mag;
        else if (step_raw / mag < 5) step = 2 * mag;
        else                         step = 5 * mag;
        var decimals = Math.max(0, -Math.floor(Math.log10(step)));

        ctx.lineWidth   = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.fillStyle   = 'rgba(255,255,255,0.85)';
        ctx.font        = '10px sans-serif';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur  = 3;
        var TICK = 5;

        // Droite (x > 0)
        for (var d = step; sx + d * C_BASE_VAGUES < W + 1; d += step) {
            var px = Math.round(sx + d * C_BASE_VAGUES);
            ctx.beginPath(); ctx.moveTo(px, sy - TICK); ctx.lineTo(px, sy + TICK); ctx.stroke();
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(d.toFixed(decimals).replace('.', ','), px, sy + TICK + 2);
        }
        // Gauche (x < 0) — ticks sans labels
        for (var d2 = step; sx - d2 * C_BASE_VAGUES > -1; d2 += step) {
            var px2 = Math.round(sx - d2 * C_BASE_VAGUES);
            ctx.beginPath(); ctx.moveTo(px2, sy - TICK); ctx.lineTo(px2, sy + TICK); ctx.stroke();
        }
        ctx.shadowBlur = 0;
    }

    // Label "x (m) →" au bord droit
    ctx.fillStyle    = 'rgba(255,255,255,0.6)';
    ctx.font         = '11px sans-serif';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('x (m) →', W - 4, sy - 3);
    ctx.restore();
}

// ── Source S ──────────────────────────────────────────────────────────

function _drawSourceVagues(ctx) {
    var sx = simVagues.sourceX, sy = simVagues.sourceY;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffdd44';
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle    = '#ffffff';
    ctx.font         = 'bold 13px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('S', sx, sy - 11);
    ctx.restore();
}

// ── Balises ───────────────────────────────────────────────────────────

function _drawBeaconsVagues(ctx) {
    if (simVagues.viewMode === 'coupe') return;
    var specs = [
        { b: simVagues.beacon1, color: '#e07020', label: 'B1' },
        { b: simVagues.beacon2, color: '#2a8a50', label: 'B2' }
    ];
    for (var i = 0; i < specs.length; i++) {
        var s = specs[i];
        if (!s.b.active) continue;
        ctx.save();
        ctx.strokeStyle = s.color;
        ctx.lineWidth   = 2.5;
        ctx.beginPath();
        ctx.arc(s.b.x, s.b.y, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.b.x, s.b.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.font         = 'bold 22px monospace';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(s.label, s.b.x, s.b.y - 10);
        ctx.restore();
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Données graphe — y(x) le long de l'axe horizontal
// ══════════════════════════════════════════════════════════════════════

var VAGUES_AMP_CM = 1.0;  // 1 unité normalisée = 1 cm (référence pédagogique)

function updateYxDataVagues() {
    simVagues.yxData = [];
    if (simVagues.c_sim <= 0 || simVagues.canvasW <= 0) return;

    var lambda_px = (simVagues.freq > 0 && simVagues.c_sim > 0)
        ? simVagues.c_sim / simVagues.freq : 100;
    var sx       = simVagues.sourceX;
    var sy       = simVagues.sourceY;
    var max_r_top   = simVagues.canvasW - sx;
    var max_r_coupe = simVagues.canvasW - COUPE_LEFT_MARGIN;
    if (max_r_top   <= 0) max_r_top   = simVagues.canvasW;
    if (max_r_coupe <= 0) max_r_coupe = simVagues.canvasW;

    // Plage de données selon l'état :
    //  - transition : couvre la totalité du parcours (-max_r_top → +max_r_coupe)
    //  - top stable : symétrique (-max_r_top → +max_r_top)
    //  - coupe stable : 0 → max_r_coupe
    var xStart, xEnd;
    if (simVagues.transAnim) {
        xStart = -max_r_top;   xEnd = max_r_coupe;
    } else if (simVagues.viewMode === 'coupe') {
        xStart = 0;            xEnd = max_r_coupe;
    } else {
        xStart = -max_r_top;   xEnd = max_r_top;
    }

    var range_px = xEnd - xStart;
    var N_PTS    = Math.min(6000, Math.max(400, Math.ceil(50 * range_px / lambda_px)));

    var peakCm = 0;
    for (var i = 0; i <= N_PTS; i++) {
        var x_px = xStart + (i / N_PTS) * (xEnd - xStart);
        var yCm  = _waveFieldRaw(sx + x_px, sy) * VAGUES_AMP_CM;
        simVagues.yxData.push({ x: x_px, y: yCm });
        var a = yCm < 0 ? -yCm : yCm;
        if (a > peakCm) peakCm = a;
    }
    if (peakCm > simVagues.peakAmpCm) simVagues.peakAmpCm = peakCm;
}

// ══════════════════════════════════════════════════════════════════════
//  Données graphe — y(t) aux balises
// ══════════════════════════════════════════════════════════════════════

function updateYtDataVagues(t) {
    var b1 = simVagues.beacon1.active && simVagues.beacon1.snapped;
    var b2 = simVagues.beacon2.active && simVagues.beacon2.snapped;
    if (!b1 && !b2) return;

    // _waveFieldRaw lit simVagues.simTime en interne : on l'évalue au temps
    // d'échantillonnage t (identique à cordeDisplacement(x, t) dans sim.js).
    var savedT = simVagues.simTime;
    simVagues.simTime = t;

    if (b1) {
        var y1 = _waveFieldRaw(simVagues.beacon1.x, simVagues.beacon1.y) * VAGUES_AMP_CM;
        simVagues.ytData1.push({ t: t, y: y1 });
        if (simVagues.ytData1.length > DP_MAX_POINTS) simVagues.ytData1.shift();
    }
    if (b2) {
        var y2 = _waveFieldRaw(simVagues.beacon2.x, simVagues.beacon2.y) * VAGUES_AMP_CM;
        simVagues.ytData2.push({ t: t, y: y2 });
        if (simVagues.ytData2.length > DP_MAX_POINTS) simVagues.ytData2.shift();
    }

    simVagues.simTime = savedT;
}

// ══════════════════════════════════════════════════════════════════════
//  Dessin des graphes vagues — point d'entrée appelé par drawGraph()
// ══════════════════════════════════════════════════════════════════════

function drawGraphVagues(ctx, W, H) {
    ctx.fillStyle = '#faf9f6';
    ctx.fillRect(0, 0, W, H);
    var mode = simVagues.graphMode;

    if (mode === 'both') {
        var sep  = 3;
        var half = Math.floor((W - sep) / 2);
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, half, H); ctx.clip();
        _drawYxGraphVagues(ctx, half, H);
        ctx.restore();

        ctx.save();
        ctx.translate(half + sep, 0);
        ctx.beginPath(); ctx.rect(0, 0, half, H); ctx.clip();
        _drawYtGraphVagues(ctx, half, H);
        ctx.restore();

        ctx.fillStyle = '#c8c0b4';
        ctx.fillRect(half, 0, sep, H);

        _drawBothLinksVagues(ctx, W, H, half, sep);

    } else if (mode === 'dpx') {
        _drawYxGraphVagues(ctx, W, H);
        if (graphHoverPos && !simVagues.graphCursorMode) _drawSnappedHoverVagues_yx(ctx, W, H);
        if (simVagues.graphCursorMode && graphHoverPos)  _drawCrosshairVagues(ctx, W, H);
    } else {
        _drawYtGraphVagues(ctx, W, H);
        if (graphHoverPos && !simVagues.graphCursorMode) _drawSnappedHoverVagues_yt(ctx, W, H);
        if (simVagues.graphCursorMode && graphHoverPos)  _drawCrosshairVagues(ctx, W, H);
    }
}

// ── y(x) ──────────────────────────────────────────────────────────────

function _drawYxGraphVagues(ctx, W, H) {
    var data = simVagues.yxData;

    var max_r_top   = simVagues.canvasW - simVagues.sourceX;
    var max_r_coupe = simVagues.canvasW - COUPE_LEFT_MARGIN;
    if (max_r_top   <= 0) max_r_top   = simVagues.canvasW;
    if (max_r_coupe <= 0) max_r_coupe = simVagues.canvasW;

    var xMin, xMax;
    var tr = simVagues.transAnim;
    if (tr) {
        // Pendant la transition : anime xMin/xMax selon la progression du panoramique
        var elapsed = tr._pausedAt
            ? (tr._pausedAt - tr.startT) / 1000
            : (performance.now() - tr.startT) / 1000;
        var DUR_ROT = 0.90, DUR_SLIDE = 0.90, DUR_BLEND = 0.90;
        var panFrac;
        if (tr.direction === 'toCoupe') {
            if (elapsed < DUR_ROT) {
                panFrac = 0;
            } else if (elapsed < DUR_ROT + DUR_SLIDE) {
                var t01 = (elapsed - DUR_ROT) / DUR_SLIDE;
                panFrac = t01 < 0.5 ? 2*t01*t01 : -1+(4-2*t01)*t01;
            } else {
                panFrac = 1;
            }
        } else { // toTop
            if (elapsed < DUR_BLEND) {
                panFrac = 1;
            } else if (elapsed < DUR_BLEND + DUR_SLIDE) {
                var t01 = (elapsed - DUR_BLEND) / DUR_SLIDE;
                var ep  = t01 < 0.5 ? 2*t01*t01 : -1+(4-2*t01)*t01;
                panFrac = 1 - ep;
            } else {
                panFrac = 0;
            }
        }
        xMin = -max_r_top * (1 - panFrac);
        xMax = max_r_top + (max_r_coupe - max_r_top) * panFrac;
    } else {
        var max_r_px = (simVagues.viewMode === 'coupe') ? max_r_coupe : max_r_top;
        xMin = (simVagues.viewMode !== 'coupe') ? -max_r_px : 0;
        xMax = max_r_px;
    }
    var yMax = 3 * 1.12;  // échelle fixe : amplitude max slider × marge
    var yMin = -yMax;
    simVagues.graphYxYMin = yMin;
    simVagues.graphYxYMax = yMax;
    simVagues.graphYxXMin = xMin;
    simVagues.graphYxXMax = xMax;

    _updateFontSizes(ctx, W, H, yMin, yMax);
    GM.left = _calcLeftMarginRaw(ctx, yMin, yMax) + _gFontTitle + 8;

    var pW = W - GM.left - GM.right;
    var pH = H - GM.top  - GM.bottom;
    if (pW < 20 || pH < 20) return;

    function px(x_data) { return GM.left + (x_data - xMin) / (xMax - xMin) * pW; }
    function py(y_data) { return GM.top  + (1 - (y_data - yMin) / (yMax - yMin)) * pH; }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(GM.left, GM.top, pW, pH);

    _drawGridY(ctx, yMin, yMax, px, py, pW, pH);
    // Grille X en mètres — max_r_px = xMax pour que les labels correspondent à la plage affichée
    _drawGridX_vagues(ctx, xMin, xMax, px, py, pW, pH, xMax);
    _drawZeroLine(ctx, yMin, yMax, px, py, pW);

    // Courbe y(x) — clippée sur la zone de tracé pour éviter les débordements
    if (data && data.length > 1) {
        ctx.save();
        ctx.beginPath(); ctx.rect(GM.left, GM.top, pW, pH); ctx.clip();
        ctx.beginPath();
        ctx.moveTo(px(data[0].x), py(data[0].y));
        for (var i = 1; i < data.length; i++) {
            ctx.lineTo(px(data[i].x), py(data[i].y));
        }
        ctx.strokeStyle = '#1a6abf';
        ctx.lineWidth   = 2;
        ctx.stroke();
        ctx.restore();
    }

    // Marqueurs de balises (sur l'axe x, à leur distance depuis la source)
    _drawBeaconMarkerVagues(ctx, px, py, pW, pH, yMin, yMax);

    ctx.strokeStyle = '#c8c0b4';
    ctx.lineWidth   = 1;
    ctx.strokeRect(GM.left, GM.top, pW, pH);

    // Labels axes
    ctx.fillStyle    = '#5a6a78';
    ctx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Distance depuis S (m)', GM.left + pW / 2, H - 2);

    ctx.save();
    ctx.translate(_yAxisTitleX(ctx, GM, yMin, yMax), GM.top + pH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('y (cm)', 0, 0);
    ctx.restore();
}

// Grille X pour vagues : distance en mètres
function _drawGridX_vagues(ctx, xMin_px, xMax_px, px, py, pW, pH, max_r_px) {
    if (C_BASE_VAGUES <= 0 || max_r_px <= 0) return;
    var m_per_px  = 1 / C_BASE_VAGUES;
    var xMin_m    = xMin_px * m_per_px;   // peut être négatif
    var xMax_m    = max_r_px * m_per_px;
    var step      = _niceStep(xMax_m, 6);
    var decimals  = step < 0.1 ? 2 : (step < 1 ? 1 : 0);

    ctx.font         = _gFontTick + 'px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    var uStart = xMin_m < 0 ? Math.ceil(xMin_m / step - 0.01) * step : 0;
    for (var u = uStart; u <= xMax_m + step * 0.01; u += step) {
        var xData = u / m_per_px;
        var xc    = px(xData);
        if (xc < GM.left - 2 || xc > GM.left + pW + 2) continue;

        ctx.strokeStyle = 'rgba(200,192,180,0.55)';
        ctx.lineWidth   = 0.8;
        ctx.beginPath();
        ctx.moveTo(xc, GM.top);
        ctx.lineTo(xc, GM.top + pH);
        ctx.stroke();

        ctx.fillStyle = '#7a8a96';
        ctx.fillText(u.toFixed(decimals) + ' m', xc, GM.top + pH + 4);
    }
}

// Marqueurs de balises sur le graphe y(x)
function _drawBeaconMarkerVagues(ctx, px, py, pW, pH, yMin, yMax) {
    var sx = simVagues.sourceX, sy = simVagues.sourceY;
    var specs = [
        { b: simVagues.beacon1, color: '#e07020', label: 'B1', data: simVagues.ytData1 },
        { b: simVagues.beacon2, color: '#2a8a50', label: 'B2', data: simVagues.ytData2 }
    ];
    for (var i = 0; i < specs.length; i++) {
        var s = specs[i];
        if (!s.b.active || !s.b.snapped) continue;
        // distance du beacon à la source projetée sur l'axe horizontal
        var bx_dist = s.b.x - sx; // peut être négatif
        // En vue du dessus, les balises à gauche de la source sont valides
        if (bx_dist < 0 && simVagues.viewMode !== 'top') continue;
        var xBeacon = px(bx_dist);
        if (xBeacon < GM.left - 1 || xBeacon > GM.left + pW + 1) continue;
        _drawBeaconMarker(ctx, xBeacon, py, yMin, yMax, s.color, s.label, pH);
    }
}

// ── y(t) ──────────────────────────────────────────────────────────────

function _drawYtGraphVagues(ctx, W, H) {
    var d1   = simVagues.ytData1;
    var d2   = simVagues.ytData2;
    var b1ok = simVagues.beacon1.active && simVagues.beacon1.snapped;
    var b2ok = simVagues.beacon2.active && simVagues.beacon2.snapped;
    var hasData = (b1ok && d1.length > 1) || (b2ok && d2.length > 1);

    if (!hasData) {
        var msg    = 'Activer une balise et la positionner sur l\'axe x pour visualiser le graphe';
        var fSize  = Math.round(W * 0.025 + 10);
        ctx.fillStyle    = '#7a8a96';
        ctx.font         = 'italic ' + fSize + 'px "Segoe UI", Arial, sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        if (ctx.measureText(msg).width <= W - 16) {
            ctx.fillText(msg, W / 2, H / 2);
        } else {
            // Coupe au mot le plus proche du milieu pour tenir sur 2 lignes
            var words  = msg.split(' ');
            var line1  = '', line2  = '', mid = Math.floor(words.length / 2);
            // Cherche la coupure qui équilibre les deux lignes
            for (var cut = mid; cut < words.length; cut++) {
                var l1 = words.slice(0, cut).join(' ');
                var l2 = words.slice(cut).join(' ');
                if (ctx.measureText(l1).width <= W - 16) { line1 = l1; line2 = l2; break; }
            }
            if (!line1) { line1 = words.slice(0, mid).join(' '); line2 = words.slice(mid).join(' '); }
            var gap = fSize * 1.4;
            ctx.fillText(line1, W / 2, H / 2 - gap / 2);
            ctx.fillText(line2, W / 2, H / 2 + gap / 2);
        }
        return;
    }

    var xMin = 0, xMax = 5;
    simVagues.graphView.xMin = xMin;
    simVagues.graphView.xMax = xMax;
    var yMax = 3 * 1.12;
    var yMin = -yMax;
    simVagues.graphView.yMin = yMin;
    simVagues.graphView.yMax = yMax;

    _updateFontSizes(ctx, W, H, yMin, yMax);
    GM.left = _calcLeftMarginRaw(ctx, yMin, yMax) + _gFontTitle + 8;

    var pW = W - GM.left - GM.right;
    var pH = H - GM.top  - GM.bottom;
    if (pW < 20 || pH < 20) return;

    function px(x_data) { return GM.left + (x_data - xMin) / (xMax - xMin) * pW; }
    function py(y_data) { return GM.top  + (1 - (y_data - yMin) / (yMax - yMin)) * pH; }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(GM.left, GM.top, pW, pH);

    _drawGridY(ctx, yMin, yMax, px, py, pW, pH);
    _drawGridX_dpt(ctx, xMin, xMax, px, py, pW, pH);
    _drawZeroLine(ctx, yMin, yMax, px, py, pW);

    ctx.save();
    ctx.beginPath();
    ctx.rect(GM.left, GM.top, pW, pH);
    ctx.clip();

    var tOrigin = simVagues.ytTimeOrigin || 0;
    if (b1ok && d1.length > 1)
        _drawSeriesVagues(ctx, d1, xMin, xMax, px, py, '#e07020', 2, tOrigin);
    if (b2ok && d2.length > 1)
        _drawSeriesVagues(ctx, d2, xMin, xMax, px, py, '#2a8a50', 2, tOrigin);

    ctx.restore();

    ctx.strokeStyle = '#c8c0b4';
    ctx.lineWidth   = 1;
    ctx.strokeRect(GM.left, GM.top, pW, pH);

    ctx.fillStyle    = '#5a6a78';
    ctx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Temps (s)', GM.left + pW / 2, H - 2);

    ctx.save();
    ctx.translate(_yAxisTitleX(ctx, GM, yMin, yMax), GM.top + pH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('y (cm)', 0, 0);
    ctx.restore();

    _drawLegendVagues(ctx, W, pH);
}

function _drawSeriesVagues(ctx, data, xMin, xMax, px, py, color, lw, tOrigin) {
    var WINDOW = 5;
    ctx.beginPath();
    var started = false;
    for (var i = 0; i < data.length; i++) {
        var pt     = data[i];
        var tLocal = pt.t - tOrigin;
        if (tLocal < 0 || tLocal > WINDOW) { started = false; continue; }
        if (i > 0) {
            var prevL = data[i - 1].t - tOrigin;
            if (prevL < 0 || prevL > WINDOW) started = false;
        }
        var cx = px(tLocal);
        var cy = py(pt.y);
        if (!started) { ctx.moveTo(cx, cy); started = true; }
        else           { ctx.lineTo(cx, cy); }
    }
    ctx.strokeStyle = color;
    ctx.lineWidth   = lw;
    ctx.stroke();
}

function _drawLegendVagues(ctx, W, pH) {
    var x = GM.left + 8, y = GM.top + 10, fs = 12;
    ctx.font         = 'bold ' + fs + 'px monospace';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    if (simVagues.beacon1.active && simVagues.beacon1.snapped) {
        ctx.fillStyle = '#e07020';
        ctx.fillRect(x, y - fs * 0.4, 16, 3);
        ctx.fillText('Balise 1', x + 20, y);
        y += fs + 6;
    }
    if (simVagues.beacon2.active && simVagues.beacon2.snapped) {
        ctx.fillStyle = '#2a8a50';
        ctx.fillRect(x, y - fs * 0.4, 16, 3);
        ctx.fillText('Balise 2', x + 20, y);
    }
}

// ── Mode simultané — liaisons ─────────────────────────────────────────

function _drawBothLinksVagues(ctx, W, H, half, sep) {
    // Échelle Y identique aux deux graphes
    var yMax = 3 * 1.12, yMin = -yMax;
    var pH   = H - GM.top - GM.bottom;
    var pW_l = half - GM.left - GM.right;
    var pW_r = half - GM.left - GM.right;
    if (pH <= 0 || pW_l <= 0 || pW_r <= 0) return;

    function py(v) { return GM.top + (1 - (v - yMin) / (yMax - yMin)) * pH; }

    // Plage X du graphe y(x) — même logique que _drawYxGraphVagues
    var max_r_top   = simVagues.canvasW - simVagues.sourceX;
    var max_r_coupe = simVagues.canvasW - COUPE_LEFT_MARGIN;
    if (max_r_top   <= 0) max_r_top   = simVagues.canvasW;
    if (max_r_coupe <= 0) max_r_coupe = simVagues.canvasW;
    var xMin_yx, xMax_yx;
    if (simVagues.viewMode === 'coupe') {
        xMin_yx = 0; xMax_yx = max_r_coupe;
    } else {
        xMin_yx = -max_r_top; xMax_yx = max_r_top;
    }

    var specs = [
        { b: simVagues.beacon1, color: '#e07020' },
        { b: simVagues.beacon2, color: '#2a8a50' }
    ];
    for (var i = 0; i < specs.length; i++) {
        var s = specs[i];
        if (!s.b.active || !s.b.snapped) continue;

        // Valeur y courante — même formule que les courbes des deux graphes
        var yVal = _waveFieldRaw(s.b.x, s.b.y) * VAGUES_AMP_CM;
        var yc   = py(yVal);
        if (yc < GM.top || yc > GM.top + pH) continue;

        // Point sur y(x) : position de la balise le long de l'axe x
        var bx_dist = s.b.x - simVagues.sourceX;
        var xDpx = GM.left + (bx_dist - xMin_yx) / (xMax_yx - xMin_yx) * pW_l;
        if (xDpx < GM.left || xDpx > GM.left + pW_l) continue;

        // Point sur y(t) : position du curseur temporel dans la fenêtre 0–5 s
        var WINDOW   = 5;
        var tOrigin  = simVagues.ytTimeOrigin || 0;
        var tLocal   = Math.max(0, Math.min(WINDOW, simVagues.simTime - tOrigin));
        var xDpt     = (half + sep) + GM.left + (tLocal / WINDOW) * pW_r;

        ctx.save();
        ctx.strokeStyle = s.color;
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(xDpx, yc);
        ctx.lineTo(xDpt, yc);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;
        ctx.fillStyle   = s.color;
        ctx.beginPath();
        ctx.arc(xDpx, yc, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(xDpt, yc, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ── Hover snappé y(x) ────────────────────────────────────────────────

function _drawSnappedHoverVagues_yx(ctx, W, H) {
    if (!graphHoverPos) return;
    var data = simVagues.yxData;
    if (!data || data.length < 2) return;

    ctx.save();
    _updateFontSizes(ctx, W, H, simVagues.graphYxYMin, simVagues.graphYxYMax);
    GM.left = _calcLeftMarginRaw(ctx, simVagues.graphYxYMin, simVagues.graphYxYMax) + _gFontTitle + 8;
    var pW = W - GM.left - GM.right, pH = H - GM.top - GM.bottom;
    if (pW < 10 || pH < 10) { ctx.restore(); return; }

    var yMin = simVagues.graphYxYMin, yMax = simVagues.graphYxYMax;
    var xMin = simVagues.graphYxXMin || 0, xMax = simVagues.graphYxXMax || 1;
    function px(v) { return GM.left + (v - xMin) / (xMax - xMin) * pW; }
    function py(v) { return GM.top  + (1 - (v - yMin) / (yMax - yMin)) * pH; }

    var mx = graphHoverPos.x, my = graphHoverPos.y;
    var best = null, bestDist = Infinity;
    for (var i = 0; i < data.length; i++) {
        var pt = data[i];
        var bx = px(pt.x), by = py(pt.y);
        var byc = Math.max(GM.top, Math.min(GM.top + pH, by));
        var d   = Math.sqrt((bx - mx) * (bx - mx) + (byc - my) * (byc - my));
        if (d < bestDist) { bestDist = d; best = pt; }
    }
    if (!best) { ctx.restore(); return; }

    var bxc  = px(best.x);
    var byc2 = Math.max(GM.top, Math.min(GM.top + pH, py(best.y)));
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(60,60,60,0.45)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(bxc, byc2); ctx.lineTo(bxc, GM.top + pH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bxc, byc2); ctx.lineTo(GM.left, byc2);    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#1a6abf';
    ctx.beginPath();
    ctx.arc(bxc, byc2, 5, 0, Math.PI * 2);
    ctx.fill();

    var m_per_px = 1 / C_BASE_VAGUES;
    var dM = (best.x * m_per_px).toFixed(2);
    var label = '(' + dM + ' m, y = ' + best.y.toFixed(3) + ')';
    ctx.font         = _gFontHover + 'px monospace';
    ctx.fillStyle    = '#1a6abf';
    ctx.textBaseline = 'bottom';
    ctx.textAlign    = 'left';
    var lw = ctx.measureText(label).width;
    var lx = (bxc + 10 + lw > GM.left + pW) ? bxc - 10 - lw : bxc + 10;
    var ly = (byc2 - 8 < GM.top + 28)        ? byc2 + 32      : byc2 - 8;
    ctx.fillText(label, lx, ly);
    ctx.restore();
}

// ── Hover snappé y(t) ────────────────────────────────────────────────

function _drawSnappedHoverVagues_yt(ctx, W, H) {
    if (!graphHoverPos) return;
    ctx.save();
    var WINDOW  = 5;
    var tOrigin = simVagues.ytTimeOrigin || 0;
    var yMax = 3 * 1.12, yMin = -yMax;
    _updateFontSizes(ctx, W, H, yMin, yMax);
    GM.left = _calcLeftMarginRaw(ctx, yMin, yMax) + _gFontTitle + 8;
    var pW = W - GM.left - GM.right, pH = H - GM.top - GM.bottom;
    if (pW < 10 || pH < 10) { ctx.restore(); return; }

    var xMin = 0, xMax = 5;
    function px(v) { return GM.left + (v - xMin) / (xMax - xMin) * pW; }
    function py(v) { return GM.top  + (1 - (v - yMin) / (yMax - yMin)) * pH; }

    var mx = graphHoverPos.x, my = graphHoverPos.y;
    var series = [];
    if (simVagues.beacon1.active && simVagues.beacon1.snapped && simVagues.ytData1.length > 1)
        series.push({ data: simVagues.ytData1, color: '#e07020' });
    if (simVagues.beacon2.active && simVagues.beacon2.snapped && simVagues.ytData2.length > 1)
        series.push({ data: simVagues.ytData2, color: '#2a8a50' });

    var winner = null, winnerColor = null, winnerDist = Infinity;
    for (var s = 0; s < series.length; s++) {
        var sr = series[s];
        for (var i = 0; i < sr.data.length; i++) {
            var pt     = sr.data[i];
            var tLocal = pt.t - tOrigin;
            if (tLocal < 0 || tLocal > WINDOW) continue;
            var bx  = px(tLocal), by = py(pt.y);
            var byc = Math.max(GM.top, Math.min(GM.top + pH, by));
            var d   = Math.sqrt((bx - mx) * (bx - mx) + (byc - my) * (byc - my));
            if (d < winnerDist) { winnerDist = d; winner = { tLocal: tLocal, y: pt.y }; winnerColor = sr.color; }
        }
    }
    if (!winner) { ctx.restore(); return; }

    var bx2  = px(winner.tLocal);
    var byc2 = Math.max(GM.top, Math.min(GM.top + pH, py(winner.y)));
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(60,60,60,0.45)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(bx2, byc2); ctx.lineTo(bx2, GM.top + pH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx2, byc2); ctx.lineTo(GM.left, byc2);    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = winnerColor;
    ctx.beginPath();
    ctx.arc(bx2, byc2, 5, 0, Math.PI * 2);
    ctx.fill();
    var label = '(' + winner.tLocal.toFixed(2) + ' s, y = ' + winner.y.toFixed(3) + ')';
    ctx.font         = _gFontHover + 'px monospace';
    ctx.fillStyle    = winnerColor;
    ctx.textBaseline = 'bottom';
    ctx.textAlign    = 'left';
    var lw2 = ctx.measureText(label).width;
    var lx  = (bx2 + 10 + lw2 > GM.left + pW) ? bx2 - 10 - lw2 : bx2 + 10;
    var ly  = (byc2 - 8 < GM.top + 28) ? byc2 + 32 : byc2 - 8;
    ctx.fillText(label, lx, ly);
    ctx.restore();
}

// ── Réticule ──────────────────────────────────────────────────────────

function _drawCrosshairVagues(ctx, W, H) {
    if (!graphHoverPos) return;
    var mx = graphHoverPos.x, my = graphHoverPos.y;
    var pW = W - GM.left - GM.right, pH = H - GM.top - GM.bottom;
    ctx.save();
    ctx.strokeStyle = '#1a6abf';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 3]);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(mx, GM.top); ctx.lineTo(mx, GM.top + pH);
    ctx.moveTo(GM.left, my); ctx.lineTo(GM.left + pW, my);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════
//  Remise à zéro
// ══════════════════════════════════════════════════════════════════════

function resetVagues() {
    simVagues.simTime         = 0;
    simVagues.paused          = false;
    simVagues.sourceResetTime = 0;
    simVagues.transAnim       = null;
    simVagues.ytData1        = [];
    simVagues.ytData2        = [];
    simVagues.ytTimeOrigin   = 0;
    simVagues.yxData         = [];
    simVagues.graphView      = { xMin: 0, xMax: 5, yMin: -1, yMax: 1 };
    simVagues.graphViewHistory = [];
    simVagues.graphUserPanned  = false;
    simVagues.graphYxYMin = -0.1;
    simVagues.graphYxYMax =  0.1;
    simVagues.peakAmpCm   =  0.1;
    updateCeleriteVagues();
}

// ══════════════════════════════════════════════════════════════════════
//  Balises vagues
// ══════════════════════════════════════════════════════════════════════

function _toggleBeaconVagues(n) {
    var beacon = (n === 1) ? simVagues.beacon1 : simVagues.beacon2;
    var btn    = document.getElementById('btn-beacon' + n);
    beacon.active = !beacon.active;
    if (beacon.active) {
        // Position initiale sur l'axe horizontal
        var sx = simVagues.sourceX, sy = simVagues.sourceY;
        var W  = simVagues.canvasW;
        beacon.x = Math.round(sx + (W - sx) * (n === 1 ? 0.30 : 0.55));
        beacon.y = sy;
        beacon.rx = beacon.x / W;
        beacon.ry = beacon.y / simVagues.canvasH;
        beacon.snapped = true;
        if (btn) btn.classList.add('active');
    } else {
        beacon.snapped = false;
        if (btn) btn.classList.remove('active');
        if (n === 1) simVagues.ytData1 = [];
        else         simVagues.ytData2 = [];
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Handlers UI (sliders, boutons)
// ══════════════════════════════════════════════════════════════════════

function togglePauseVagues() {
    simVagues.paused = !simVagues.paused;
    var btn = document.getElementById('btn-playpause-vagues');
    if (!btn) return;
    if (simVagues.paused) { btn.textContent = '▶ Reprendre'; btn.className = 'btn btn-play'; }
    else                  { btn.textContent = '⏸ Pause';     btn.className = 'btn btn-pause'; }
}

function resetSimAnimVagues() {
    resetVagues();
    var btn = document.getElementById('btn-playpause-vagues');
    if (btn) { btn.textContent = '⏸ Pause'; btn.className = 'btn btn-pause'; }
}

function onSliderFreqVagues(v) {
    simVagues.freq = parseFloat(v);
    var lbl = document.getElementById('lbl-freq-vagues');
    if (lbl) lbl.textContent = simVagues.freq.toFixed(1).replace('.', ',');
}

function onSliderAmplVagues(v) {
    simVagues.amplitude = parseFloat(v);
    var lbl = document.getElementById('lbl-ampl-vagues');
    if (lbl) lbl.textContent = simVagues.amplitude.toFixed(1).replace('.', ',');
    simVagues.peakAmpCm = 0.1;  // reset auto-scale pour recaler l'axe Y
}

function onSliderGVagues(v) {
    simVagues.g = parseFloat(v);
    var lbl = document.getElementById('lbl-g-vagues');
    if (lbl) lbl.textContent = simVagues.g.toFixed(2).replace('.', ',');
    updateCeleriteVagues();
    _updateCReadoutVagues();
}

function onSliderHVagues(v) {
    simVagues.h = parseFloat(v);
    var lbl = document.getElementById('lbl-h-vagues');
    if (lbl) lbl.textContent = (simVagues.h * 1000).toFixed(1).replace('.', ',');
    updateCeleriteVagues();
    _updateCReadoutVagues();
}

function onSliderAttenVagues(v) {
    simVagues.attenuation = parseFloat(v);
    var lbl = document.getElementById('lbl-atten-vagues');
    if (lbl) lbl.textContent = simVagues.attenuation.toFixed(2).replace('.', ',');
}

function onSliderSpeedVagues(v) {
    var idx = parseInt(v, 10);
    simVagues.speedFactor = [0.10, 0.25, 0.50, 1.00][idx] || 1.0;
    var lbl = document.getElementById('lbl-speed-vagues');
    if (lbl) lbl.textContent = simVagues.speedFactor.toFixed(2).replace('.', ',');
}

function toggleGeoAttenVagues() {
    simVagues.geoAttenuation = !simVagues.geoAttenuation;
    var btn = document.getElementById('btn-geo-atten-vagues');
    if (btn) btn.classList.toggle('active', simVagues.geoAttenuation);
}

function toggleWavePropsVagues() {
    simVagues.wavePropsVisible = !simVagues.wavePropsVisible;
    _applyWavePropsVagues();
}

function _applyWavePropsVagues() {
    var btn      = document.getElementById('btn-wave-props-vagues');
    var simple   = document.getElementById('readout-simple-vagues');
    var extended = document.getElementById('readout-props-vagues');
    if (simVagues.wavePropsVisible) {
        if (btn)      btn.classList.add('active');
        if (simple)   simple.style.display = 'none';
        if (extended) extended.style.display = '';
        _updateWavePropsVagues();
    } else {
        if (btn)      btn.classList.remove('active');
        if (simple)   simple.style.display = '';
        if (extended) extended.style.display = 'none';
    }
}

function _updateCReadoutVagues() {
    var el = document.getElementById('ro-c-vagues');
    if (el) el.textContent = simVagues.c_ms.toFixed(2).replace('.', ',');
}

function _updateWavePropsVagues() {
    if (!simVagues.wavePropsVisible) return;
    var elC = document.getElementById('ro-c-ext-vagues');
    if (elC) elC.textContent = simVagues.c_ms.toFixed(2).replace('.', ',');
    var f = simVagues.freq;
    var T = (f > 0) ? 1 / f : 0;
    var elF = document.getElementById('ro-f-vagues');
    var elT = document.getElementById('ro-T-vagues');
    if (elF) elF.textContent = f.toFixed(2).replace('.', ',');
    if (elT) elT.textContent = T.toFixed(3).replace('.', ',');
    var lambda = simVagues.c_ms * T;
    var elL    = document.getElementById('ro-lambda-vagues');
    if (elL) elL.textContent = lambda.toFixed(2).replace('.', ',');
}

// ══════════════════════════════════════════════════════════════════════
//  Toggle vue en coupe
// ══════════════════════════════════════════════════════════════════════

function toggleViewVagues() {
    if (simVagues.transAnim) return;
    var toCoupe   = (simVagues.viewMode === 'top');
    if (toCoupe) {
        simVagues.coupeSrcX = simVagues.canvasW / 2;
        // Désactiver les balises qui ne seront pas visibles en vue coupe (hors axe x>0)
        var sx = simVagues.sourceX;
        var bSpecs = [
            { b: simVagues.beacon1, n: 1 },
            { b: simVagues.beacon2, n: 2 }
        ];
        for (var bi = 0; bi < bSpecs.length; bi++) {
            var bs = bSpecs[bi];
            if (bs.b.active && !(bs.b.snapped && bs.b.x > sx)) {
                bs.b.active  = false;
                bs.b.snapped = false;
                var bBtn = document.getElementById('btn-beacon' + bs.n);
                if (bBtn) bBtn.classList.remove('active');
                if (bs.n === 1) { simVagues.ytData1 = []; }
                else            { simVagues.ytData2 = []; }
                    }
        }
    }
    var wasPaused = simVagues.paused;
    simVagues.paused = true; // gel de la simulation pendant la transition
    simVagues.transAnim = {
        startT    : performance.now(),
        direction : toCoupe ? 'toCoupe' : 'toTop',
        wasPaused : wasPaused
    };
    var btn = document.getElementById('btn-view-coupe-vagues');
    if (btn) {
        btn.classList.toggle('active', toCoupe);
        btn.textContent = toCoupe ? 'Vue du dessus' : 'Vue en coupe';
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Animation de transition — 3 phases
//
//  toCoupe (total = DUR_ROT + DUR_SLIDE + DUR_BLEND) :
//    Phase 1 — Rotation 3D (theta 0 → π/2), panOffset = 0
//    Phase 2 — Panoramique horizontal (theta = π/2, pan 0 → MAX_PAN)
//              Toute la scène glisse vers la gauche ; les vagues à gauche
//              de la source sortent progressivement de l'écran.
//    Phase 3 — Fondu croisé 3D → coupe finale (opacité 0 → 1)
//
//  toTop (total = DUR_BLEND + DUR_SLIDE + DUR_ROT) :
//    Phase 1 — Fondu croisé coupe → 3D (opacité 1 → 0)
//    Phase 2 — Panoramique inverse (pan MAX_PAN → 0)
//    Phase 3 — Rotation 3D inverse (theta π/2 → 0)
// ══════════════════════════════════════════════════════════════════════

function _drawVaguesTransition(ctx, W, H, PW, PH, dpr) {
    var tr      = simVagues.transAnim;
    var elapsed = tr._pausedAt
        ? (tr._pausedAt - tr.startT) / 1000
        : (performance.now() - tr.startT) / 1000;

    var DUR_ROT   = 0.90;
    var DUR_SLIDE = 0.90;
    var DUR_BLEND = 0.90;
    var MAX_PAN   = simVagues.sourceX - COUPE_LEFT_MARGIN;

    var TOTAL = (tr.direction === 'toCoupe')
                ? DUR_ROT + DUR_SLIDE + DUR_BLEND
                : DUR_BLEND + DUR_SLIDE + DUR_ROT;

    // Nettoyage CSS résiduel
    var canvas = document.getElementById('tube-canvas');
    var wrap   = document.getElementById('tube-canvas-wrap');
    canvas.style.transform       = '';
    canvas.style.transformOrigin = '';
    wrap.style.perspective       = '';
    wrap.style.background        = '';

    if (elapsed >= TOTAL) {
        simVagues.transAnim = null;
        simVagues.viewMode  = (tr.direction === 'toCoupe') ? 'coupe' : 'top';
        if (simVagues.viewMode === 'coupe') simVagues.coupeSrcX = COUPE_LEFT_MARGIN;
        if (!tr.wasPaused) simVagues.paused = false;
        return;
    }

    if (tr.direction === 'toCoupe') {

        if (elapsed < DUR_ROT) {
            // ── Phase 1 : rotation 3D (top → vue de profil) ──────────
            var t01  = elapsed / DUR_ROT;
            var ease = (1 - Math.cos(t01 * Math.PI)) / 2;
            _render3DWaveView(ctx, W, H, ease * Math.PI / 2, 0, PW, PH, dpr);

        } else if (elapsed < DUR_ROT + DUR_SLIDE) {
            // ── Phase 2 : panoramique horizontal (caméra → droite) ───
            var t01   = (elapsed - DUR_ROT) / DUR_SLIDE;
            var easeP = t01 < 0.5 ? 2*t01*t01 : -1+(4-2*t01)*t01;
            _render3DWaveView(ctx, W, H, Math.PI / 2, MAX_PAN * easeP, PW, PH, dpr);

        } else {
            // ── Phase 3 : fondu croisé 3D → coupe ────────────────────
            var alpha = (elapsed - DUR_ROT - DUR_SLIDE) / DUR_BLEND;
            simVagues.coupeSrcX = COUPE_LEFT_MARGIN;
            _render3DWaveView(ctx, W, H, Math.PI / 2, MAX_PAN, PW, PH, dpr);
            _overlayViewCoupe(ctx, W, H, tr, Math.min(1, alpha), PW, PH, dpr);
        }

    } else { // toTop

        if (elapsed < DUR_BLEND) {
            // ── Phase 1 : fondu croisé coupe → 3D ────────────────────
            var alpha = 1 - elapsed / DUR_BLEND;
            simVagues.coupeSrcX = COUPE_LEFT_MARGIN;
            _render3DWaveView(ctx, W, H, Math.PI / 2, MAX_PAN, PW, PH, dpr);
            _overlayViewCoupe(ctx, W, H, tr, Math.max(0, alpha), PW, PH, dpr);

        } else if (elapsed < DUR_BLEND + DUR_SLIDE) {
            // ── Phase 2 : panoramique inverse ────────────────────────
            var t01   = (elapsed - DUR_BLEND) / DUR_SLIDE;
            var easeP = t01 < 0.5 ? 2*t01*t01 : -1+(4-2*t01)*t01;
            _render3DWaveView(ctx, W, H, Math.PI / 2, MAX_PAN * (1 - easeP), PW, PH, dpr);

        } else {
            // ── Phase 3 : rotation 3D inverse (profil → top) ─────────
            var t01  = (elapsed - DUR_BLEND - DUR_SLIDE) / DUR_ROT;
            var ease = (1 - Math.cos(t01 * Math.PI)) / 2;
            _render3DWaveView(ctx, W, H, (1 - ease) * Math.PI / 2, 0, PW, PH, dpr);
        }
    }
}

// Superpose la vue en coupe sur ctx avec opacité alpha (0 = transparent, 1 = opaque).
// Utilise un canvas offscreen stocké dans tr pour éviter une allocation à chaque frame.
function _overlayViewCoupe(ctx, W, H, tr, alpha, PW, PH, dpr) {
    if (!tr._offscreen) {
        tr._offscreen        = document.createElement('canvas');
        tr._offscreen.width  = PW;
        tr._offscreen.height = PH;
    } else if (tr._offscreen.width !== PW || tr._offscreen.height !== PH) {
        tr._offscreen.width  = PW;
        tr._offscreen.height = PH;
    }
    var offCtx = tr._offscreen.getContext('2d');
    offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    _drawVaguesCoupe(offCtx, W, H);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);   // l'offscreen est déjà en pixels physiques
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.drawImage(tr._offscreen, 0, 0);
    ctx.restore();
}

// ── Rendu perspectif orthographique de la surface d'eau ───────────────
//   theta = 0   → vue de dessus (identique au rendu normal)
//   theta = π/2 → vue de profil (côté) : équivalent à la coupe
//
// Algorithme du peintre : on itère les bandes z de l'arrière vers l'avant.
// Projection : screen_y = H/2 + (wz − srcY)·cos(θ) − wy·sin(θ)
//   À θ=0 : screen_y = wz  (la profondeur z devient la coordonnée y écran)
//   À θ=π/2 : screen_y = H/2 − wy  (la hauteur de l'onde devient y écran)
function _render3DWaveView(ctx, W, H, theta, panOffset, PW, PH, dpr) {
    panOffset = (panOffset | 0) || 0;
    var cosT = Math.cos(theta);
    var sinT = Math.sin(theta);

    var srcX     = simVagues.sourceX;
    var srcY     = simVagues.sourceY;  // ≈ H/2
    var c        = simVagues.c_sim;
    var t        = simVagues.simTime;
    var f        = simVagues.freq;
    var ampPx    = Math.min(H * 0.18, 55) * VAGUES_VIS_AMP_SCALE;
    var TWO_PI_F = 2 * Math.PI * f;
    var maxR     = Math.sqrt(W * W + H * H);
    var a5       = simVagues.attenuation * 5;
    var geo      = simVagues.geoAttenuation;
    var r_front  = (c > 0) ? c * (t - simVagues.sourceResetTime) : 0;
    var rfSq     = r_front * r_front;

    var imgData = ctx.createImageData(PW, PH);
    var data    = imgData.data;

    // Fond : interpolé entre COL_BG (vue dessus) et ciel clair (vue coupe)
    var bgR = (COL_BG_R + (176 - COL_BG_R) * sinT) | 0;
    var bgG = (COL_BG_G + (216 - COL_BG_G) * sinT) | 0;
    var bgB = (COL_BG_B + (240 - COL_BG_B) * sinT) | 0;
    for (var i = 0; i < data.length; i += 4) {
        data[i] = bgR; data[i + 1] = bgG; data[i + 2] = bgB; data[i + 3] = 255;
    }

    if (c <= 0) { ctx.putImageData(imgData, 0, 0); return; }

    // Position écran (physique) de la première bande (wz = 0, wy = 0)
    var sy0 = Math.round((H / 2 + (0 - srcY) * cosT) * dpr);

    var prevSyArr = new Int16Array(PW);
    for (var px = 0; px < PW; px++) prevSyArr[px] = sy0;

    var N_Z = 110; // bandes z — ~27 échantillons par longueur d'onde à λ≈100 px

    for (var zi = 0; zi < N_Z; zi++) {
        var wz = (zi / (N_Z - 1)) * H;
        var dz = wz - srcY;
        var screenYbase = H / 2 + dz * cosT; // y écran (CSS) sans hauteur d'onde

        for (var px = 0; px < PW; px++) {
            var wx          = px / dpr;   // colonne physique → position CSS pour la physique
            var dx          = (wx + panOffset) - srcX;
            var effectiveDz = dz * cosT;
            var rSq         = dx * dx + effectiveDz * effectiveDz;
            var raw = 0, env = 1.0;

            if (rfSq > 0 && rSq <= rfSq) {
                var r  = Math.sqrt(rSq);
                raw    = Math.sin(TWO_PI_F * (t - r / c));
                if (geo) env = Math.min(1, Math.sqrt(50 / Math.max(1, r)));
                if (a5 > 0) env *= Math.exp(-a5 * r / maxR);
            } else {
                env = 0;
            }

            // Déplacement vertical de la surface (en pixels CSS), converti en pixels physiques
            var wy  = raw * env * simVagues.amplitude * ampPx;
            var sy  = Math.round((screenYbase - wy * sinT) * dpr);
            var syP = prevSyArr[px];

            // Couleur de l'eau — même formule que la vue de dessus
            var envC = Math.min(1, env * VAGUES_AMP_GAIN);
            var t01  = (raw * envC + 1) * 0.5;
            var wr   = (COL_TROUGH_R + t01 * (COL_CREST_R - COL_TROUGH_R)) | 0;
            var wg   = (COL_TROUGH_G + t01 * (COL_CREST_G - COL_TROUGH_G)) | 0;
            var wb   = (COL_TROUGH_B + t01 * (COL_CREST_B - COL_TROUGH_B)) | 0;

            // Remplir la bande entre syP et sy (back-to-front overwrite)
            var yLo = (syP < sy ? syP : sy);
            var yHi = (syP < sy ? sy  : syP);
            if (yLo < 0)  yLo = 0;
            if (yHi >= PH) yHi = PH - 1;
            for (var py = yLo; py <= yHi; py++) {
                var idx = (py * PW + px) * 4;
                data[idx]     = wr;
                data[idx + 1] = wg;
                data[idx + 2] = wb;
                data[idx + 3] = 255;
            }

            prevSyArr[px] = sy;
        }
    }

    // Fond marin : remplir en dessous de la dernière bande avec un dégradé profond
    for (var px2 = 0; px2 < PW; px2++) {
        var syLast = prevSyArr[px2];
        var yStart = syLast < 0 ? 0 : syLast;
        for (var py = yStart; py < PH; py++) {
            var depth = (py - syLast) / Math.max(1, PH - syLast);
            var idx   = (py * PW + px2) * 4;
            data[idx]     = (COL_TROUGH_R * (1 - depth * 0.6)) | 0;
            data[idx + 1] = (COL_TROUGH_G * (1 - depth * 0.3)) | 0;
            data[idx + 2] = (COL_TROUGH_B + (90 - COL_TROUGH_B) * depth * 0.25) | 0;
            data[idx + 3] = 255;
        }
    }

    ctx.putImageData(imgData, 0, 0);

    // Source projetée en 3D — position écran décalée du pan (pixels CSS, dessin vectoriel)
    var osc_raw = Math.sin(TWO_PI_F * t) * simVagues.amplitude;
    var sy_src  = Math.round(H / 2 - osc_raw * ampPx * sinT);
    var sx_src  = Math.round(srcX - panOffset);

    if (sx_src >= -10 && sx_src <= W + 10) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth   = 2;
        ctx.beginPath(); ctx.arc(sx_src, sy_src, 7, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffdd44';
        ctx.beginPath(); ctx.arc(sx_src, sy_src, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle    = '#ffffff';
        ctx.font         = 'bold 13px monospace';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.shadowColor  = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur   = 3;
        ctx.fillText('S', sx_src, sy_src - 10);
        ctx.restore();
    }
}

// Rendu top-down dans un contexte 2D (ctx du canvas principal ou offscreen)
function _renderTopDown(ctx, W, H) {
    if (simVagues.c_sim <= 0) {
        ctx.fillStyle = 'rgb(' + COL_BG_R + ',' + COL_BG_G + ',' + COL_BG_B + ')';
        ctx.fillRect(0, 0, W, H);
        _drawAxisVagues(ctx, W, H);
        _drawBeaconsVagues(ctx);
        _drawSourceVagues(ctx);
        return;
    }
    var imgData = ctx.createImageData(W, H);
    var data    = imgData.data;
    var B = BLOCK_V, BH = B >> 1;
    var t = simVagues.simTime, c = simVagues.c_sim, f = simVagues.freq;
    var TWO_PI_F = 2 * Math.PI * f;
    var maxR = Math.sqrt(W * W + H * H);
    var a5   = simVagues.attenuation * 5;
    var geo  = simVagues.geoAttenuation;
    var sx   = simVagues.sourceX, sy = simVagues.sourceY;
    var r_front = c * (t - simVagues.sourceResetTime);

    for (var bj = 0; bj < H; bj += B) {
        var cy = bj + BH;
        for (var bi = 0; bi < W; bi += B) {
            var cx = bi + BH;
            var rc, gc, bc;
            var dx = cx - sx, dy = cy - sy;
            var r  = Math.sqrt(dx * dx + dy * dy);
            if (r > r_front) {
                rc = COL_BG_R; gc = COL_BG_G; bc = COL_BG_B;
            } else {
                var raw = Math.sin(TWO_PI_F * (t - r / c));
                var env = 1.0;
                if (geo) env = Math.min(1, Math.sqrt(50 / Math.max(1, r)));
                if (a5 > 0) env *= Math.exp(-a5 * r / maxR);
                env = Math.min(1, env * VAGUES_AMP_GAIN);
                var t01 = (raw * env + 1) * 0.5;
                rc = Math.round(COL_TROUGH_R + t01 * (COL_CREST_R - COL_TROUGH_R));
                gc = Math.round(COL_TROUGH_G + t01 * (COL_CREST_G - COL_TROUGH_G));
                bc = Math.round(COL_TROUGH_B + t01 * (COL_CREST_B - COL_TROUGH_B));
            }
            for (var dj = 0; dj < B && bj + dj < H; dj++) {
                for (var di = 0; di < B && bi + di < W; di++) {
                    var idx = ((bj + dj) * W + (bi + di)) * 4;
                    data[idx] = rc; data[idx+1] = gc; data[idx+2] = bc; data[idx+3] = 255;
                }
            }
        }
    }
    ctx.putImageData(imgData, 0, 0);
    _drawAxisVagues(ctx, W, H);
    _drawBeaconsVagues(ctx);
    _drawSourceVagues(ctx);
}

// ══════════════════════════════════════════════════════════════════════
//  Vue en coupe (plan Sxy)
// ══════════════════════════════════════════════════════════════════════

// Champ d'onde 1D le long de l'axe x, depuis la source en srcX
function _waveFieldCoupeAt(x_canvas, srcX) {
    var r_px = x_canvas - srcX;
    if (r_px < 0) return 0;
    var c = simVagues.c_sim;
    if (c <= 0) return 0;
    if (r_px > c * (simVagues.simTime - simVagues.sourceResetTime)) return 0;
    var field = Math.sin(2 * Math.PI * simVagues.freq * (simVagues.simTime - r_px / c));
    if (simVagues.geoAttenuation) field *= Math.sqrt(40 / (40 + r_px));
    if (simVagues.attenuation > 0)
        field *= Math.exp(-simVagues.attenuation * 5 * r_px / simVagues.canvasW);
    return field * simVagues.amplitude;
}

function _drawVaguesCoupe(ctx, W, H) {
    var srcX   = simVagues.coupeSrcX;
    var yLevel = Math.round(H / 2);
    var ampPx  = Math.min(H * 0.18, 55) * VAGUES_VIS_AMP_SCALE;

    // ── 1. Fond ciel (air) ────────────────────────────────────────────
    var skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, '#b0d8f0');
    skyGrad.addColorStop(0.5, '#d4ecf8');
    skyGrad.addColorStop(1, '#d4ecf8');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // ── 2. Polygone eau (surface ondulée + fond) ──────────────────────
    var srcField = _waveFieldCoupeAt(srcX, srcX);
    ctx.beginPath();
    ctx.moveTo(srcX, yLevel - srcField * ampPx);
    for (var x = srcX + 1; x <= W; x++) {
        ctx.lineTo(x, yLevel - _waveFieldCoupeAt(x, srcX) * ampPx);
    }
    ctx.lineTo(W, H);
    ctx.lineTo(srcX, H);
    ctx.closePath();

    var waterGrad = ctx.createLinearGradient(0, yLevel - ampPx, 0, H);
    waterGrad.addColorStop(0,   'rgb(10, 110, 200)');
    waterGrad.addColorStop(0.3, 'rgb(0, 60, 140)');
    waterGrad.addColorStop(1,   'rgb(0, 15, 65)');
    ctx.fillStyle = waterGrad;
    ctx.fill();

    // ── 3. Ligne de surface (écume) ───────────────────────────────────
    ctx.beginPath();
    for (var x = srcX; x <= W; x++) {
        var sy = yLevel - _waveFieldCoupeAt(x, srcX) * ampPx;
        if (x === srcX) ctx.moveTo(x, sy);
        else             ctx.lineTo(x, sy);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth   = 2;
    ctx.stroke();

    // ── 4. Zone source ────────────────────────────────────────────────
    _drawSourceCoupeVagues(ctx, W, H, srcX, yLevel, ampPx);

    // ── 5. Labels Air / Eau ───────────────────────────────────────────
    ctx.save();
    ctx.font      = 'italic 12px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(30, 80, 130, 0.65)';
    ctx.textBaseline = 'top';
    ctx.fillText('Air', srcX + 10, 8);
    ctx.fillStyle = 'rgba(200, 235, 255, 0.70)';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Eau', srcX + 10, H - 8);
    ctx.restore();

    // ── 6. Axe x et graduations ───────────────────────────────────────
    _drawAxisCoupeVagues(ctx, W, H, srcX, yLevel);

    // ── 7. Balises (bouées flottantes) ────────────────────────────────
    _drawBeaconsCoupeVagues(ctx, W, H, srcX, yLevel, ampPx);
}

function _drawSourceCoupeVagues(ctx, W, H, srcX, yLevel, ampPx) {
    var t    = simVagues.simTime;
    var osc  = Math.sin(2 * Math.PI * simVagues.freq * t) * simVagues.amplitude;
    var dotY = yLevel - osc * ampPx;

    ctx.save();

    // ── Fond sombre de la zone source (toute la hauteur) ─────────────
    var grd = ctx.createLinearGradient(0, 0, srcX, 0);
    grd.addColorStop(0, 'rgba(30, 35, 50, 0.95)');
    grd.addColorStop(1, 'rgba(50, 55, 75, 0.90)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, srcX, H);

    // Séparation verticale légère à droite de la zone source
    ctx.strokeStyle = 'rgba(140, 180, 220, 0.40)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(srcX, 0); ctx.lineTo(srcX, H); ctx.stroke();

    // ── Tige du vibreur ───────────────────────────────────────────────
    ctx.fillStyle = '#8aa4c0';
    ctx.fillRect(srcX - 3, 0, 6, H);

    // ── Petite flèche indiquant le sens d'oscillation ─────────────────
    var arrowDir = osc >= 0 ? -1 : 1;
    var ax = srcX - 22, ay1 = dotY, ay2 = dotY + arrowDir * 14;
    ctx.strokeStyle = 'rgba(255, 215, 80, 0.80)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath(); ctx.moveTo(ax, ay1); ctx.lineTo(ax, ay2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ax - 4, ay2 - arrowDir * 6);
    ctx.lineTo(ax,     ay2);
    ctx.lineTo(ax + 4, ay2 - arrowDir * 6);
    ctx.stroke();

    ctx.restore();

    // ── Point oscillant S sur la surface ─────────────────────────────
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.arc(srcX, dotY, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffdd44';
    ctx.beginPath(); ctx.arc(srcX, dotY, 4, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle    = '#ffffff';
    ctx.font         = 'bold 13px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor  = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur   = 3;
    ctx.fillText('S', srcX, dotY - 10);
    ctx.restore();
}

function _drawAxisCoupeVagues(ctx, W, H, srcX, yLevel) {
    ctx.save();

    // Ligne pointillée à l'équilibre (y=0)
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth   = 1.2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(srcX, yLevel);
    ctx.lineTo(W, yLevel);
    ctx.stroke();
    ctx.setLineDash([]);

    // Graduations en mètres depuis la source
    if (C_BASE_VAGUES > 0) {
        var m_per_px = 1.0 / C_BASE_VAGUES;
        var total_m  = (W - srcX) * m_per_px;
        var step_raw = total_m / 6;
        var mag      = Math.pow(10, Math.floor(Math.log10(Math.max(step_raw, 1e-9))));
        var step;
        if      (step_raw / mag < 2) step = mag;
        else if (step_raw / mag < 5) step = 2 * mag;
        else                         step = 5 * mag;
        var decimals = Math.max(0, -Math.floor(Math.log10(step)));

        ctx.lineWidth   = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.fillStyle   = 'rgba(255,255,255,0.85)';
        ctx.font        = '10px sans-serif';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur  = 3;
        var TICK = 5;

        for (var d = step; srcX + d * C_BASE_VAGUES < W + 1; d += step) {
            var px = Math.round(srcX + d * C_BASE_VAGUES);
            ctx.beginPath(); ctx.moveTo(px, yLevel - TICK); ctx.lineTo(px, yLevel + TICK); ctx.stroke();
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(d.toFixed(decimals).replace('.', ','), px, yLevel + TICK + 2);
        }
        ctx.shadowBlur = 0;
    }

    // Label axe x
    ctx.fillStyle    = 'rgba(255,255,255,0.6)';
    ctx.font         = '11px sans-serif';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('x (m) →', W - 4, yLevel - 3);

    ctx.restore();
}

// Balises en vue coupe — même style que le tab corde :
// point coloré sur la surface + pointillé vertical vers l'axe d'équilibre + label
function _drawBeaconsCoupeVagues(ctx, W, H, srcX, yLevel, ampPx) {
    var specs = [
        { b: simVagues.beacon1, color: '#e07020', label: 'B1' },
        { b: simVagues.beacon2, color: '#2a8a50', label: 'B2' }
    ];
    for (var i = 0; i < specs.length; i++) {
        var s = specs[i];
        if (!s.b.active || !s.b.snapped) continue;
        var dist = s.b.x - simVagues.sourceX;
        if (dist <= 0) continue;
        var bx = srcX + dist;
        if (bx < srcX || bx > W) continue;

        var surfY = yLevel - _waveFieldCoupeAt(bx, srcX) * ampPx;
        var dotR  = 10;

        // Pointillé vertical du point jusqu'à l'axe d'équilibre
        ctx.save();
        ctx.strokeStyle = s.color;
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(bx, surfY);
        ctx.lineTo(bx, yLevel);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.restore();

        // Point sur la surface
        ctx.save();
        ctx.fillStyle   = s.color;
        ctx.beginPath();
        ctx.arc(bx, surfY, dotR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 1.5;
        ctx.stroke();
        ctx.restore();

        // Label au-dessus du point
        ctx.fillStyle    = s.color;
        ctx.font         = 'bold 24px "Segoe UI", Arial, sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.shadowColor  = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur   = 3;
        ctx.fillText(s.label, bx, surfY - dotR - 3);
        ctx.shadowBlur   = 0;
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Interactions souris sur le canvas tube (drag source + balises)
// ══════════════════════════════════════════════════════════════════════

(function initVaguesMouse() {
    var dragTarget = null; // null | 'beacon1' | 'beacon2'
    var DRAG_RADIUS_B  = 14;  // px autour d'une balise pour le drag

    function canvasCoords(e, canvas) {
        var rect   = canvas.getBoundingClientRect();
        var scaleX = canvas.clientWidth  / rect.width;
        var scaleY = canvas.clientHeight / rect.height;
        return {
            x : (e.clientX - rect.left) * scaleX,
            y : (e.clientY - rect.top)  * scaleY
        };
    }

    function setup() {
        var canvas = document.getElementById('tube-canvas');
        if (!canvas) return;

        canvas.addEventListener('pointerdown', function(e) {
            if (typeof activeTab === 'undefined' || activeTab !== 'vagues') return;

            var pos = canvasCoords(e, canvas);
            var mx = pos.x, my = pos.y;

            // Drag des balises uniquement (source fixe au centre)
            if (simVagues.beacon1.active) {
                var db1 = Math.sqrt(
                    (mx - simVagues.beacon1.x) * (mx - simVagues.beacon1.x) +
                    (my - simVagues.beacon1.y) * (my - simVagues.beacon1.y));
                if (db1 <= DRAG_RADIUS_B) {
                    dragTarget = 'beacon1';
                    canvas.setPointerCapture(e.pointerId);
                    return;
                }
            }
            if (simVagues.beacon2.active) {
                var db2 = Math.sqrt(
                    (mx - simVagues.beacon2.x) * (mx - simVagues.beacon2.x) +
                    (my - simVagues.beacon2.y) * (my - simVagues.beacon2.y));
                if (db2 <= DRAG_RADIUS_B) {
                    dragTarget = 'beacon2';
                    canvas.setPointerCapture(e.pointerId);
                    return;
                }
            }
        });

        canvas.addEventListener('pointermove', function(e) {
            if (!dragTarget) return;
            if (typeof activeTab === 'undefined' || activeTab !== 'vagues') { dragTarget = null; return; }

            var pos = canvasCoords(e, canvas);
            var mx  = Math.max(0, Math.min(simVagues.canvasW, pos.x));
            var my  = Math.max(0, Math.min(simVagues.canvasH, pos.y));

            // Snap à l'axe x avec hystérésis :
            //   entrée : ≤12 px de l'axe   |   sortie : >25 px de l'axe
            var axisY    = simVagues.sourceY;
            var SNAP_IN  = 12, SNAP_OUT = 25;
            var beacon   = (dragTarget === 'beacon1') ? simVagues.beacon1 : simVagues.beacon2;
            var dist2ax  = Math.abs(my - axisY);
            var snapped  = beacon.snapped ? (dist2ax <= SNAP_OUT) : (dist2ax <= SNAP_IN);
            if (snapped) my = axisY;

            if (dragTarget === 'beacon1') {
                simVagues.beacon1.x = mx;
                simVagues.beacon1.y = my;
                simVagues.beacon1.rx = mx / simVagues.canvasW;
                simVagues.beacon1.ry = my / simVagues.canvasH;
                simVagues.beacon1.snapped = snapped;
                if (!snapped) { simVagues.ytData1 = []; }
            } else if (dragTarget === 'beacon2') {
                simVagues.beacon2.x = mx;
                simVagues.beacon2.y = my;
                simVagues.beacon2.rx = mx / simVagues.canvasW;
                simVagues.beacon2.ry = my / simVagues.canvasH;
                simVagues.beacon2.snapped = snapped;
                if (!snapped) { simVagues.ytData2 = []; }
            }
        });

        canvas.addEventListener('pointerup', function() {
            dragTarget = null;
        });

        canvas.addEventListener('pointerleave', function() {
            dragTarget = null;
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();
