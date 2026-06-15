// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  graph.js — Graphes ΔP(x) et ΔP(t) avec zoom / pan / réticule
//  Dépend de : sim.js
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Références canvas ─────────────────────────────────────────────────
var graphCanvas = null;
var graphCtx    = null;

// ── État de l'interaction souris ──────────────────────────────────────
var graphHoverPos  = null;   // {x, y} en coordonnées canvas
var graphPan       = { dragging: false, startX: 0, startY: 0, startView: null };
var graphZoomRect  = null;   // {x1,y1,x2,y2} en coordonnées canvas pendant le drag

// ── Anti-rebond resize ─────────────────────────────────────────────────
var graphResizeRAF = false;

// ── Marges internes du graphe ──────────────────────────────────────────
var GM = { top: 14, right: 16, bottom: 60, left: 62 };

// Calcule GM.left de sorte que l'axe Y (x=0 du graphe) soit aligné
// avec la position de repos de la membrane dans la fenêtre.
// On utilise getBoundingClientRect pour comparer les positions viewport
// des deux canvas, indépendamment de la mise en page autour d'eux.
function _syncLeftMarginWithTube(ctx, W, yMin, yMax) {
    var minForLabels = _calcLeftMarginRaw(ctx, yMin, yMax);

    if (tubeCanvas && tubeCanvas.width > 0 && sim.tubeLeft > 0 && graphCanvas) {
        var tubeRect  = tubeCanvas.getBoundingClientRect();
        var graphRect = graphCanvas.getBoundingClientRect();

        // Position viewport de la membrane (bord gauche du tube dans le canvas tube)
        var memViewportX = tubeRect.left + (sim.tubeLeft / tubeCanvas.width) * tubeRect.width;

        // Distance depuis le bord gauche du canvas graphe
        var marginFromViewport = memViewportX - graphRect.left;

        // Convertir en coordonnées canvas (DPR éventuel)
        var marginCanvas = Math.round(marginFromViewport * (W / graphRect.width));

        GM.left = Math.max(minForLabels, marginCanvas);
    } else {
        GM.left = minForLabels;
    }
}

// Calcule la marge minimale pour afficher les labels Y
function _calcLeftMarginRaw(ctx, yMin, yMax) {
    ctx.font = '24px monospace';
    var wMin = ctx.measureText(_fmtLabel(yMin)).width;
    var wMax = ctx.measureText(_fmtLabel(yMax)).width;
    return Math.round(Math.max(wMin, wMax) + 18);
}

// ══════════════════════════════════════════════════════════════════════
//  resize
// ══════════════════════════════════════════════════════════════════════

function resizeGraph() {
    graphCanvas = graphCanvas || document.getElementById('graph-canvas');
    if (!graphCanvas) return;
    graphCtx = graphCtx || graphCanvas.getContext('2d');

    var wrap = document.getElementById('graph-canvas-wrap');
    var w    = wrap.clientWidth;
    var h    = wrap.clientHeight;
    if (w < 10 || h < 10) return;

    graphCanvas.width  = w;
    graphCanvas.height = h;
}

// ══════════════════════════════════════════════════════════════════════
//  Dessin du graphe — point d'entrée appelé à chaque frame
// ══════════════════════════════════════════════════════════════════════

function drawGraph() {
    graphCanvas = graphCanvas || document.getElementById('graph-canvas');
    if (!graphCanvas) return;
    graphCtx = graphCtx || graphCanvas.getContext('2d');

    var ctx = graphCtx;
    var W   = graphCanvas.width;
    var H   = graphCanvas.height;
    if (!W || !H) return;

    // Fond
    ctx.fillStyle = '#faf9f6';
    ctx.fillRect(0, 0, W, H);

    if (sim.graphMode === 'both') {
        // ── Mode simultané : ΔP(x) à gauche, ΔP(t) à droite ─────────
        var sep   = 3;                        // séparateur vertical en px
        var half  = Math.floor((W - sep) / 2);

        // Graphe ΔP(x) — moitié gauche
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, half, H);
        ctx.clip();
        _drawDpxGraph(ctx, half, H);
        ctx.restore();

        // Ligne séparatrice verticale
        ctx.fillStyle = '#c8c0b4';
        ctx.fillRect(half, 0, sep, H);

        // Graphe ΔP(t) — moitié droite
        ctx.save();
        ctx.translate(half + sep, 0);
        ctx.beginPath();
        ctx.rect(0, 0, half, H);
        ctx.clip();
        _drawDptGraph(ctx, half, H);
        ctx.restore();

        // ── Liaisons horizontales balise → point temporel ─────────────
        // Pour chaque balise active : ΔP instantané → même ordonnée Y
        // sur les deux graphes → ligne pointillée horizontale parfaite.
        _drawBothLinks(ctx, W, H, half, sep);

    } else if (sim.graphMode === 'dpx') {
        _drawDpxGraph(ctx, W, H);
    } else {
        _drawDptGraph(ctx, W, H);
    }

    // Hover snappé et réticule — désactivés en mode both (trop complexe à gérer sur deux zones)
    if (sim.graphMode !== 'both') {
        if (graphHoverPos && !sim.graphCursorMode) {
            _drawSnappedHover(ctx, W, H);
        }
        if (sim.graphCursorMode && graphHoverPos) {
            _drawCrosshair(ctx, W, H);
        }
    }

    // Rectangle de zoom en cours
    if (sim.graphZoomMode && graphZoomRect) {
        _drawZoomRect(ctx);
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Mode simultané — liaisons horizontales balise ↔ point temporel
//
//  Pour chaque balise active, on trace une ligne pointillée horizontale
//  à la hauteur canvas correspondant à la valeur ΔP instantanée de la
//  balise. Les deux graphes partagent les mêmes bornes Y et les mêmes
//  marges GM → py(dp) est identique dans les deux moitiés → ligne
//  parfaitement horizontale sur toute la largeur W du canvas.
//
//  En plus de la ligne, on dessine :
//   • un disque sur le point de la courbe ΔP(x) à la position de la balise
//   • un disque sur le front de la courbe ΔP(t) (point courant)
// ══════════════════════════════════════════════════════════════════════

function _drawBothLinks(ctx, W, H, half, sep) {
    var yMin = -1.12;
    var yMax =  1.12;
    var pH   = H - GM.top - GM.bottom;
    if (pH <= 0) return;

    function py(dp) {
        return GM.top + (1 - (dp - yMin) / (yMax - yMin)) * pH;
    }

    var tOrigin = sim.dptTimeOrigin || 0;
    var WINDOW  = 5;

    var beacons = [];
    if (sim.beacon1.active) beacons.push({ beacon: sim.beacon1, color: '#e07020' });
    if (sim.beacon2.active) beacons.push({ beacon: sim.beacon2, color: '#2a8a50' });

    for (var b = 0; b < beacons.length; b++) {
        var bc    = beacons[b];
        var color = bc.color;
        var xb    = bc.beacon.x - sim.tubeLeft;
        var dp    = waveDeltaP(xb, sim.simTime);
        var yc    = py(dp);

        // Bornes Y clampées à la zone de tracé
        if (yc < GM.top || yc > GM.top + pH) continue;

        // ── Point sur ΔP(x) : position X de la balise dans la moitié gauche ──
        var pW_left = half - GM.left - GM.right;
        if (pW_left <= 0) continue;
        var L    = sim.tubeLength > 0 ? sim.tubeLength : 1;
        var xDpx = GM.left + (xb / L) * pW_left;   // coordonnée X dans la moitié gauche

        // ── Point sur ΔP(t) : bord droit de la courbe = t_local actuel ──
        var tLocal   = sim.simTime - tOrigin;
        tLocal       = Math.max(0, Math.min(WINDOW, tLocal));
        var pW_right = half - GM.left - GM.right;
        var xDpt     = (half + sep) + GM.left + (tLocal / WINDOW) * pW_right;

        // ── Ligne pointillée horizontale sur toute la largeur ────────
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(xDpx, yc);
        ctx.lineTo(xDpt, yc);
        ctx.stroke();
        ctx.setLineDash([]);

        // ── Disque sur la courbe ΔP(x) ───────────────────────────────
        ctx.globalAlpha = 1.0;
        ctx.fillStyle   = color;
        ctx.beginPath();
        ctx.arc(xDpx, yc, 4, 0, Math.PI * 2);
        ctx.fill();

        // ── Disque sur le front de la courbe ΔP(t) ───────────────────
        ctx.beginPath();
        ctx.arc(xDpt, yc, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}


function _drawDpxGraph(ctx, W, H) {
    var data = sim.dpxData;
    var L    = sim.tubeLength;

    // Bornes X : toujours 0 → L (fixe)
    var xMin = 0;
    var xMax = L > 0 ? L : 1;

    // Bornes Y : fixées à [-1, +1] normalisé avec marge 12 %
    var yMin = -1.12;
    var yMax =  1.12;
    sim.graphDpxYMin = yMin;
    sim.graphDpxYMax = yMax;

    // Marge gauche synchronisée avec la position de la membrane dans le tube
    _syncLeftMarginWithTube(ctx, W, yMin, yMax);

    var pW = W - GM.left - GM.right;
    var pH = H - GM.top  - GM.bottom;
    if (pW < 20 || pH < 20) return;

    // Fonctions de projection
    function px(x_data) { return GM.left + (x_data - xMin) / (xMax - xMin) * pW; }
    function py(y_data) { return GM.top  + (1 - (y_data - yMin) / (yMax - yMin)) * pH; }

    // ── Fond de la zone de tracé ──────────────────────────────────────
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(GM.left, GM.top, pW, pH);

    // ── Grille Y ──────────────────────────────────────────────────────
    _drawGridY(ctx, yMin, yMax, px, py, pW, pH);

    // ── Grille X (ticks de distance) ─────────────────────────────────
    _drawGridX_dpx(ctx, xMin, xMax, px, py, pW, pH, L);

    // ── Ligne zéro ────────────────────────────────────────────────────
    _drawZeroLine(ctx, yMin, yMax, px, py, pW);

    // ── Courbe ΔP(x) ─────────────────────────────────────────────────
    // On échantillonne directement en espace canvas (1 colonne de pixels = 1 échantillon).
    // Pour chaque colonne cx on calcule le x_data correspondant, puis ΔP.
    // Quand λ est petite (K faible / f haute), plusieurs périodes tiennent
    // dans quelques pixels → on sur-échantillonne à 4 sous-colonnes par pixel
    // pour capturer les extrema même quand λ < largeur d'un pixel.
    {
        var freqEff_g = (sim.sourceMode === 'impulse') ? 1.0 / T_IMPULSE : sim.freq;
        var lambda_g  = (sim.c_sim > 0) ? sim.c_sim / freqEff_g : L;  // px de tube
        // ratio : pixels canvas par longueur d'onde
        var pxPerLambda = (lambda_g > 0) ? pW * lambda_g / L : pW;
        // sous-pas : si λ couvre < 8 px canvas on sur-échantillonne
        var subSteps = (pxPerLambda < 8) ? Math.ceil(8 / Math.max(0.5, pxPerLambda)) : 1;
        subSteps = Math.min(subSteps, 16);   // cap à 16 sous-pas

        var totalSteps = pW * subSteps;
        ctx.save();
        ctx.beginPath();
        var firstPt = true;
        for (var s = 0; s <= totalSteps; s++) {
            var frac   = s / totalSteps;
            var x_data = xMin + frac * (xMax - xMin);
            var dp_val = waveDeltaP(x_data, sim.simTime);
            var cx     = GM.left + frac * pW;
            var cy     = py(dp_val);
            if (firstPt) { ctx.moveTo(cx, cy); firstPt = false; }
            else          { ctx.lineTo(cx, cy); }
        }
        ctx.strokeStyle = '#2a6aaa';
        ctx.lineWidth   = 2;
        ctx.stroke();
        ctx.restore();
    }

    // ── Marqueurs de balises ──────────────────────────────────────────
    if (sim.beacon1.active) {
        var xb1 = sim.beacon1.x - sim.tubeLeft;
        _drawBeaconMarker(ctx, px(xb1), py, yMin, yMax, '#e07020', 'B1', pH);
    }
    if (sim.beacon2.active) {
        var xb2 = sim.beacon2.x - sim.tubeLeft;
        _drawBeaconMarker(ctx, px(xb2), py, yMin, yMax, '#2a8a50', 'B2', pH);
    }

    // ── Bordure zone tracé ────────────────────────────────────────────
    ctx.strokeStyle = '#c8c0b4';
    ctx.lineWidth   = 1;
    ctx.strokeRect(GM.left, GM.top, pW, pH);

    // ── Labels axes ───────────────────────────────────────────────────
    _drawAxisLabels_dpx(ctx, W, H, GM, pW, pH, xMin, xMax, yMin, yMax, px, py, L);
}

// ══════════════════════════════════════════════════════════════════════
//  Graphe ΔP(t) — séries temporelles aux balises
// ══════════════════════════════════════════════════════════════════════

function _drawDptGraph(ctx, W, H) {
    var d1 = sim.dptData1;
    var d2 = sim.dptData2;
    var hasData = (sim.beacon1.active && d1.length > 1) ||
                  (sim.beacon2.active && d2.length > 1);

    if (!hasData) {
        // Message d'aide
        ctx.fillStyle = '#7a8a96';
        ctx.font      = 'italic ' + Math.round(W * 0.025 + 10) + 'px "Segoe UI", Arial, sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Activez une balise pour afficher le graphe', W / 2, H / 2);
        return;
    }

    // ── Fenêtre fixe 0–5 s (cyclique, type oscilloscope) ─────────────
    var xMin = 0;
    var xMax = 5;
    sim.graphView.xMin = xMin;   // mis à jour pour le réticule et le hover snappé
    sim.graphView.xMax = xMax;
    var yMin = -1.12;
    var yMax =  1.12;
    sim.graphView.yMin = yMin;
    sim.graphView.yMax = yMax;

    // Marge gauche synchronisée avec la position de la membrane (même axe Y que ΔP(x))
    _syncLeftMarginWithTube(ctx, W, yMin, yMax);

    var pW = W - GM.left - GM.right;
    var pH = H - GM.top  - GM.bottom;
    if (pW < 20 || pH < 20) return;

    function px(x_data) { return GM.left + (x_data - xMin) / (xMax - xMin) * pW; }
    function py(y_data) { return GM.top  + (1 - (y_data - yMin) / (yMax - yMin)) * pH; }

    // Fond
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(GM.left, GM.top, pW, pH);

    // Grilles
    _drawGridY(ctx, yMin, yMax, px, py, pW, pH);
    _drawGridX_dpt(ctx, xMin, xMax, px, py, pW, pH);

    // Ligne zéro
    _drawZeroLine(ctx, yMin, yMax, px, py, pW);

    // ── Tracé des séries ──────────────────────────────────────────────
    // Clip dans la zone de tracé
    ctx.save();
    ctx.beginPath();
    ctx.rect(GM.left, GM.top, pW, pH);
    ctx.clip();

    if (sim.beacon1.active && d1.length > 1) {
        _drawSeries(ctx, d1, xMin, xMax, px, py, '#e07020', 2, sim.simTime);
    }
    if (sim.beacon2.active && d2.length > 1) {
        _drawSeries(ctx, d2, xMin, xMax, px, py, '#2a8a50', 2, sim.simTime);
    }

    ctx.restore();

    // Bordure
    ctx.strokeStyle = '#c8c0b4';
    ctx.lineWidth   = 1;
    ctx.strokeRect(GM.left, GM.top, pW, pH);

    // Labels axes
    _drawAxisLabels_dpt(ctx, W, H, GM, pW, pH, xMin, xMax, yMin, yMax, px, py);

    // Légende
    _drawLegend(ctx, W, pH);
}

// ── Tracé d'une série dans la fenêtre visible ─────────────────────────

// ── Tracé d'une série dans la fenêtre visible ─────────────────────────
// cycleTime : sim.simTime — utilisé pour n'afficher que le cycle courant
// (fenêtre fixe 0–10 s : t affiché = pt.t % 10, cycle = floor(pt.t / 10))

function _drawSeries(ctx, data, xMin, xMax, px, py, color, lw, cycleTime) {
    var WINDOW = 5;
    // Utiliser dptTimeOrigin si disponible, sinon fallback sur cycleTime
    var tOrigin = (sim.dptTimeOrigin !== undefined) ? sim.dptTimeOrigin : 0;

    ctx.beginPath();
    var started = false;
    for (var i = 0; i < data.length; i++) {
        var pt = data[i];

        // ── Mode cyclique (cycleTime fourni) ──────────────────────────
        if (cycleTime !== undefined) {
            var tLocal = pt.t - tOrigin;
            // N'afficher que les points dans la fenêtre courante [0, WINDOW]
            if (tLocal < 0 || tLocal > WINDOW) {
                started = false;
                continue;
            }
            // Couper si le point précédent était hors fenêtre
            if (i > 0) {
                var prevLocal = data[i - 1].t - tOrigin;
                if (prevLocal < 0 || prevLocal > WINDOW) started = false;
            }
            var cx = px(tLocal);
            var cy = py(pt.dp);
            if (!started) { ctx.moveTo(cx, cy); started = true; }
            else           { ctx.lineTo(cx, cy); }

        // ── Mode normal (pas de cycleTime) ───────────────────────────
        } else {
            if (pt.t < xMin - 0.5 || pt.t > xMax + 0.5) {
                started = false;
                continue;
            }
            var cx2 = px(pt.t);
            var cy2 = py(pt.dp);
            if (!started) { ctx.moveTo(cx2, cy2); started = true; }
            else           { ctx.lineTo(cx2, cy2); }
        }
    }
    ctx.strokeStyle = color;
    ctx.lineWidth   = lw;
    ctx.stroke();
}

// ── Légende (balise 1 et 2) ───────────────────────────────────────────

function _drawLegend(ctx, W, pH) {
    var x  = GM.left + 8;
    var y  = GM.top  + 10;
    var fs = 12;
    ctx.font      = 'bold ' + fs + 'px monospace';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    if (sim.beacon1.active) {
        ctx.fillStyle = '#e07020';
        ctx.fillRect(x, y - fs * 0.4, 16, 3);
        ctx.fillStyle = '#e07020';
        ctx.fillText('Balise 1', x + 20, y);
        y += fs + 6;
    }
    if (sim.beacon2.active) {
        ctx.fillStyle = '#2a8a50';
        ctx.fillRect(x, y - fs * 0.4, 16, 3);
        ctx.fillStyle = '#2a8a50';
        ctx.fillText('Balise 2', x + 20, y);
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Hover snappé — point le plus proche + étiquette
//  Actif quand le réticule libre est désactivé (graphHoverPos.free === false)
// ══════════════════════════════════════════════════════════════════════

function _drawSnappedHover(ctx, W, H) {
    if (!graphHoverPos) return;
    var mx = graphHoverPos.x;
    var my = graphHoverPos.y;
    var pW = W - GM.left - GM.right;
    var pH = H - GM.top  - GM.bottom;
    if (pW < 10 || pH < 10) return;

    ctx.save();

    if (sim.graphMode === 'dpt') {
        _drawSnappedHover_dpt(ctx, W, H, mx, my, pW, pH);
    } else {
        _drawSnappedHover_dpx(ctx, W, H, mx, my, pW, pH);
    }

    ctx.restore();
}

// ── Hover snappé pour ΔP(t) ───────────────────────────────────────────

function _drawSnappedHover_dpt(ctx, W, H, mx, my, pW, pH) {
    var xMin = sim.graphView.xMin;   // 0
    var xMax = sim.graphView.xMax;   // 10
    var yMin = sim.graphView.yMin;
    var yMax = sim.graphView.yMax;

    function px(v) { return GM.left + (v - xMin) / (xMax - xMin) * pW; }
    function py(v) { return GM.top  + (1 - (v - yMin) / (yMax - yMin)) * pH; }

    var WINDOW  = 5;
    var tOrigin = sim.dptTimeOrigin || 0;

    // Temps local (0–5) correspondant à la position X du curseur
    var tCursor = xMin + (mx - GM.left) / pW * (xMax - xMin);

    // Candidats pour chaque série active
    var series = [];
    if (sim.beacon1.active && sim.dptData1.length > 1)
        series.push({ data: sim.dptData1, color: '#e07020' });
    if (sim.beacon2.active && sim.dptData2.length > 1)
        series.push({ data: sim.dptData2, color: '#2a8a50' });

    // Chercher le meilleur point toutes séries confondues (distance euclidienne canvas)
    var winner = null, winnerColor = null, winnerDist = Infinity;

    for (var s = 0; s < series.length; s++) {
        var sr = series[s];
        for (var i = 0; i < sr.data.length; i++) {
            var pt = sr.data[i];
            var tLocal = pt.t - tOrigin;
            if (tLocal < 0 || tLocal > WINDOW) continue;
            var bx  = px(tLocal);
            var by  = py(pt.dp);
            var byc = Math.max(GM.top, Math.min(GM.top + pH, by));
            var dist = Math.sqrt((bx - mx) * (bx - mx) + (byc - my) * (byc - my));
            if (dist < winnerDist) { winnerDist = dist; winner = pt; winnerColor = sr.color; }
        }
    }
    if (!winner) return;

    var tLocal = winner.t - tOrigin;
    var bx  = px(tLocal);
    var by  = py(winner.dp);
    var byc = Math.max(GM.top, Math.min(GM.top + pH, by));

    // Lignes tiretées vers les axes
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(60,60,60,0.45)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(bx, GM.top + pH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(GM.left, byc);    ctx.stroke();
    ctx.setLineDash([]);

    // Disque sur la courbe
    ctx.fillStyle = winnerColor;
    ctx.beginPath();
    ctx.arc(bx, byc, 5, 0, Math.PI * 2);
    ctx.fill();

    // Étiquette
    var tLbl  = tLocal.toFixed(2) + ' s';
    var vLbl  = 'ΔP = ' + winner.dp.toFixed(3);
    var label = '(' + tLbl + ', ' + vLbl + ')';
    ctx.font         = '22px monospace';
    ctx.fillStyle    = winnerColor;
    ctx.textBaseline = 'bottom';
    ctx.textAlign    = 'left';
    var lw2 = ctx.measureText(label).width;
    var lx  = (bx + 10 + lw2 > GM.left + pW) ? bx - 10 - lw2 : bx + 10;
    var ly  = (byc - 8 < GM.top + 28)         ? byc + 32       : byc - 8;
    ctx.fillText(label, lx, ly);
}

// ── Hover snappé pour ΔP(x) ───────────────────────────────────────────

function _drawSnappedHover_dpx(ctx, W, H, mx, my, pW, pH) {
    var data = sim.dpxData;
    if (!data || data.length < 2) return;

    var L    = sim.tubeLength;
    var xMin = 0;
    var xMax = L > 0 ? L : 1;
    var yMin = sim.graphDpxYMin;
    var yMax = sim.graphDpxYMax;

    function px(v) { return GM.left + (v - xMin) / (xMax - xMin) * pW; }
    function py(v) { return GM.top  + (1 - (v - yMin) / (yMax - yMin)) * pH; }

    // Position X en coordonnées données (pixels tube)
    var xCursor = xMin + (mx - GM.left) / pW * (xMax - xMin);

    var best = null, bestDist = Infinity;
    for (var i = 0; i < data.length; i++) {
        var pt  = data[i];
        var bx_ = px(pt.x);
        var by_ = py(pt.dp);
        var byc_ = Math.max(GM.top, Math.min(GM.top + pH, by_));
        var d = Math.sqrt((bx_ - mx) * (bx_ - mx) + (byc_ - my) * (byc_ - my));
        if (d < bestDist) { bestDist = d; best = pt; }
    }
    if (!best) return;

    var bx  = px(best.x);
    var by  = py(best.dp);
    var byc = Math.max(GM.top, Math.min(GM.top + pH, by));

    // Lignes tiretées vers les axes
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(60,60,60,0.45)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(bx, GM.top + pH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(GM.left, byc);    ctx.stroke();
    ctx.setLineDash([]);

    // Disque sur la courbe
    ctx.fillStyle = '#2a6aaa';
    ctx.beginPath();
    ctx.arc(bx, byc, 5, 0, Math.PI * 2);
    ctx.fill();

    // Étiquette : distance en cm
    var cmPerPx = (L > 0) ? 40 / L : 1;
    var dCm     = (best.x * cmPerPx).toFixed(1);
    var label   = '(' + dCm + ' cm, ΔP = ' + best.dp.toFixed(3) + ')';
    ctx.font         = '22px monospace';
    ctx.fillStyle    = '#2a6aaa';
    ctx.textBaseline = 'bottom';
    ctx.textAlign    = 'left';
    var lw2 = ctx.measureText(label).width;
    var lx  = (bx + 10 + lw2 > GM.left + pW) ? bx - 10 - lw2 : bx + 10;
    var ly  = (byc - 8 < GM.top + 28)         ? byc + 32       : byc - 8;
    ctx.fillText(label, lx, ly);
}

// ══════════════════════════════════════════════════════════════════════
//  Utilitaires de dessin communs
// ══════════════════════════════════════════════════════════════════════

// Formate un label numérique (2 chiffres significatifs)
function _fmtLabel(v) {
    if (v === 0) return '0';
    var av = Math.abs(v);
    if (av >= 100)  return v.toFixed(0);
    if (av >= 10)   return v.toFixed(1);
    if (av >= 1)    return v.toFixed(2);
    return v.toFixed(3);
}

// Pas "joli" pour les graduations
function _niceStep(range, targetTicks) {
    var rough = range / targetTicks;
    var mag   = Math.pow(10, Math.floor(Math.log10(rough)));
    var mant  = rough / mag;
    if (mant < 1.5) return mag;
    if (mant < 3.5) return 2 * mag;
    if (mant < 7.5) return 5 * mag;
    return 10 * mag;
}

// Grille et labels Y
function _drawGridY(ctx, yMin, yMax, px, py, pW, pH) {
    var step  = _niceStep(yMax - yMin, 5);
    var start = Math.ceil(yMin / step) * step;

    ctx.font         = '24px monospace';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';

    for (var v = start; v <= yMax + step * 0.01; v += step) {
        var yc = py(v);
        if (yc < GM.top - 2 || yc > GM.top + pH + 2) continue;

        ctx.strokeStyle = v === 0 ? 'rgba(44,62,80,0.20)' : 'rgba(200,192,180,0.55)';
        ctx.lineWidth   = v === 0 ? 1.2 : 0.8;
        ctx.beginPath();
        ctx.moveTo(GM.left, yc);
        ctx.lineTo(GM.left + pW, yc);
        ctx.stroke();

        ctx.fillStyle = '#7a8a96';
        ctx.fillText(_fmtLabel(v), GM.left - 5, yc);
    }
}

// Grille X pour ΔP(x) : distance en cm
function _drawGridX_dpx(ctx, xMin, xMax, px, py, pW, pH, L) {
    var cmPerPx  = (L > 0) ? 40 / L : 1;   // 40 cm de simulation sur L px
    var xMaxCm   = 40;
    var step     = _niceStep(xMaxCm, 6);
    var startCm  = Math.ceil(0 / step) * step;

    ctx.font         = '24px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    for (var cm = startCm; cm <= xMaxCm + step * 0.01; cm += step) {
        var xData = cm / cmPerPx;   // px dans les données
        var xc    = px(xData);
        if (xc < GM.left - 2 || xc > GM.left + pW + 2) continue;

        ctx.strokeStyle = 'rgba(200,192,180,0.55)';
        ctx.lineWidth   = 0.8;
        ctx.beginPath();
        ctx.moveTo(xc, GM.top);
        ctx.lineTo(xc, GM.top + pH);
        ctx.stroke();

        ctx.fillStyle = '#7a8a96';
        ctx.fillText(cm.toFixed(0), xc, GM.top + pH + 4);
    }
}

// Grille X pour ΔP(t) : temps en secondes
function _drawGridX_dpt(ctx, xMin, xMax, px, py, pW, pH) {
    var step  = _niceStep(xMax - xMin, 6);
    var start = Math.ceil(xMin / step) * step;

    ctx.font         = '24px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    for (var t = start; t <= xMax + step * 0.01; t += step) {
        var xc = px(t);
        if (xc < GM.left - 2 || xc > GM.left + pW + 2) continue;

        ctx.strokeStyle = 'rgba(200,192,180,0.55)';
        ctx.lineWidth   = 0.8;
        ctx.beginPath();
        ctx.moveTo(xc, GM.top);
        ctx.lineTo(xc, GM.top + pH);
        ctx.stroke();

        ctx.fillStyle = '#7a8a96';
        ctx.fillText(_fmtLabel(t) + ' s', xc, GM.top + pH + 4);
    }
}

// Ligne zéro
function _drawZeroLine(ctx, yMin, yMax, px, py, pW) {
    if (0 < yMin || 0 > yMax) return;
    var yc = py(0);
    ctx.save();
    ctx.strokeStyle = 'rgba(44,62,80,0.30)';
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    ctx.moveTo(GM.left, yc);
    ctx.lineTo(GM.left + pW, yc);
    ctx.stroke();
    ctx.restore();
}

// Marqueur de balise sur le graphe ΔP(x)
function _drawBeaconMarker(ctx, xc, py, yMin, yMax, color, label, pH) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(xc, GM.top);
    ctx.lineTo(xc, GM.top + pH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle    = color;
    ctx.globalAlpha  = 0.9;
    ctx.font         = 'bold 11px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, xc, GM.top + 2);
    ctx.restore();
}

// Labels des axes pour ΔP(x)
function _drawAxisLabels_dpx(ctx, W, H, GM, pW, pH, xMin, xMax, yMin, yMax, px, py, L) {
    // Label axe X
    ctx.fillStyle    = '#5a6a78';
    ctx.font         = '24px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Distance depuis la membrane (cm)', GM.left + pW / 2, H - 2);

    // Label axe Y (vertical)
    ctx.save();
    ctx.translate(10, GM.top + pH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font         = '24px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('ΔP (u.a.)', 0, 0);
    ctx.restore();
}

// Labels des axes pour ΔP(t)
function _drawAxisLabels_dpt(ctx, W, H, GM, pW, pH, xMin, xMax, yMin, yMax, px, py) {
    ctx.fillStyle    = '#5a6a78';
    ctx.font         = '24px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Temps (s)', GM.left + pW / 2, H - 2);

    ctx.save();
    ctx.translate(10, GM.top + pH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font         = '24px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('ΔP (u.a.)', 0, 0);
    ctx.restore();
}

// Réticule
function _drawCrosshair(ctx, W, H) {
    if (!graphHoverPos) return;
    var mx = graphHoverPos.x;
    var my = graphHoverPos.y;
    var pW = W - GM.left - GM.right;
    var pH = H - GM.top  - GM.bottom;

    ctx.save();
    ctx.strokeStyle = '#2a6aaa';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 3]);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(mx, GM.top);
    ctx.lineTo(mx, GM.top + pH);
    ctx.moveTo(GM.left, my);
    ctx.lineTo(GM.left + pW, my);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Tooltip coordonnées
    var xVal, yVal;
    if (pW > 0 && pH > 0) {
        if (sim.graphMode === 'dpx') {
            var xData = (mx - GM.left) / pW * sim.tubeLength;
            var cmPerPx = sim.tubeLength > 0 ? 40 / sim.tubeLength : 1;
            xVal = (xData * cmPerPx).toFixed(1) + ' cm';
        } else {
            var tData = sim.graphView.xMin +
                (mx - GM.left) / pW * (sim.graphView.xMax - sim.graphView.xMin);
            xVal = tData.toFixed(2) + ' s';
        }
        var yRange = sim.graphMode === 'dpx'
            ? (sim.graphDpxYMax - sim.graphDpxYMin)
            : (sim.graphView.yMax - sim.graphView.yMin);
        var yMin   = sim.graphMode === 'dpx' ? sim.graphDpxYMin : sim.graphView.yMin;
        yVal = (yMin + (1 - (my - GM.top) / pH) * yRange).toFixed(3);
    }

    var tip = document.getElementById('graph-hover-tooltip');
    if (tip && xVal !== undefined) {
        tip.textContent = xVal + '  |  ΔP = ' + yVal;
        tip.style.display = 'block';
        // Coordonnées viewport (tooltip en position:fixed)
        var gRect  = graphCanvas.getBoundingClientRect();
        var scaleX = graphCanvas.width  / gRect.width;
        var scaleY = graphCanvas.height / gRect.height;
        var vpX    = gRect.left + mx / scaleX;
        var vpY    = gRect.top  + my / scaleY;
        var offX   = vpX + 12;
        var offY   = vpY - 10;
        if (offX + 190 > window.innerWidth) offX = vpX - 190;
        if (offY < 4) offY = vpY + 14;
        tip.style.left = offX + 'px';
        tip.style.top  = offY + 'px';
    }
}

// Rectangle de zoom
function _drawZoomRect(ctx) {
    if (!graphZoomRect) return;
    var r = graphZoomRect;
    ctx.save();
    ctx.strokeStyle = '#2a6aaa';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.fillStyle   = 'rgba(42,106,170,0.08)';
    var x1 = Math.min(r.x1, r.x2);
    var y1 = Math.min(r.y1, r.y2);
    ctx.fillRect  (x1, y1, Math.abs(r.x2 - r.x1), Math.abs(r.y2 - r.y1));
    ctx.strokeRect(x1, y1, Math.abs(r.x2 - r.x1), Math.abs(r.y2 - r.y1));
    ctx.setLineDash([]);
    ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════
//  Historique de vues (zoom / précédent)
// ══════════════════════════════════════════════════════════════════════

function pushGraphView() {
    var v = {
        xMin: sim.graphView.xMin, xMax: sim.graphView.xMax,
        yMin: sim.graphView.yMin, yMax: sim.graphView.yMax
    };
    sim.graphViewHistory.push(v);
    var btn = document.getElementById('btn-graph-prev');
    if (btn) btn.disabled = false;
}

function prevGraphView() {
    if (sim.graphViewHistory.length === 0) return;
    var v = sim.graphViewHistory.pop();
    sim.graphView.xMin = v.xMin; sim.graphView.xMax = v.xMax;
    sim.graphView.yMin = v.yMin; sim.graphView.yMax = v.yMax;
    sim.graphUserPanned = true;
    var btn = document.getElementById('btn-graph-prev');
    if (btn) btn.disabled = sim.graphViewHistory.length === 0;
}

// ══════════════════════════════════════════════════════════════════════
//  Basculement des modes graphe / outils
// ══════════════════════════════════════════════════════════════════════

function setGraphMode(mode) {
    sim.graphMode = mode;
    var btnDpx  = document.getElementById('btn-graph-dpx');
    var btnDpt  = document.getElementById('btn-graph-dpt');
    var btnBoth = document.getElementById('btn-graph-both');
    if (btnDpx)  btnDpx.classList.toggle ('active', mode === 'dpx');
    if (btnDpt)  btnDpt.classList.toggle ('active', mode === 'dpt');
    if (btnBoth) btnBoth.classList.toggle('active', mode === 'both');
    // Masquer tooltip
    var tip = document.getElementById('graph-hover-tooltip');
    if (tip) tip.style.display = 'none';
    // Masquer les boutons zoom/adapter/précédent (inutiles dans les deux modes)
    ['btn-graph-prev', 'btn-graph-zoom', 'btn-graph-auto'].forEach(function(id) {
        var btn = document.getElementById(id);
        if (btn) btn.style.display = 'none';
    });
}

function toggleGraphZoom() {
    sim.graphZoomMode = !sim.graphZoomMode;
    graphZoomRect = null;
    if (sim.graphZoomMode) sim.graphCursorMode = false;
    var z = document.getElementById('btn-graph-zoom');
    var c = document.getElementById('btn-graph-cursor');
    if (z) z.classList.toggle('active', sim.graphZoomMode);
    if (c) c.classList.toggle('active', sim.graphCursorMode);
}

function toggleGraphCursor() {
    sim.graphCursorMode = !sim.graphCursorMode;
    if (sim.graphCursorMode) sim.graphZoomMode = false;
    var tip = document.getElementById('graph-hover-tooltip');
    if (!sim.graphCursorMode && tip) tip.style.display = 'none';
    var z = document.getElementById('btn-graph-zoom');
    var c = document.getElementById('btn-graph-cursor');
    if (z) z.classList.toggle('active', sim.graphZoomMode);
    if (c) c.classList.toggle('active', sim.graphCursorMode);
}

function autoScaleGraph() {
    sim.graphUserPanned  = false;
    sim.graphViewHistory = [];
    // L'axe Y est normalisé [-1, +1] : on remet la vue Y par défaut
    sim.graphView.yMin = -1.12;
    sim.graphView.yMax =  1.12;
    var btn = document.getElementById('btn-graph-prev');
    if (btn) btn.disabled = true;
}

// ══════════════════════════════════════════════════════════════════════
//  Interactions souris sur le canvas graphe
// ══════════════════════════════════════════════════════════════════════

(function initGraphHover() {
    function setup() {
        graphCanvas = document.getElementById('graph-canvas');
        if (!graphCanvas) return;

        graphCanvas.addEventListener('pointermove', function(e) {
            var rect = graphCanvas.getBoundingClientRect();
            var mx   = (e.clientX - rect.left) * (graphCanvas.width  / rect.width);
            var my   = (e.clientY - rect.top)  * (graphCanvas.height / rect.height);
            graphHoverPos = { x: mx, y: my, free: !!sim.graphCursorMode };

            if (graphPan.dragging) {
                // Pan — uniquement en mode DeltaP(t) et hors zoom
                if (sim.graphMode === 'dpt') {
                    var W  = graphCanvas.width;
                    var pW = W - GM.left - GM.right;
                    var dx = mx - graphPan.startX;
                    var dataDx = dx / pW * (graphPan.startView.xMax - graphPan.startView.xMin);
                    sim.graphView.xMin = graphPan.startView.xMin - dataDx;
                    sim.graphView.xMax = graphPan.startView.xMax - dataDx;
                    sim.graphUserPanned = true;
                }
            }

            if (sim.graphZoomMode && graphZoomRect) {
                graphZoomRect.x2 = mx;
                graphZoomRect.y2 = my;
            }
        });

        graphCanvas.addEventListener('pointerdown', function(e) {
            var rect = graphCanvas.getBoundingClientRect();
            var mx   = (e.clientX - rect.left) * (graphCanvas.width  / rect.width);
            var my   = (e.clientY - rect.top)  * (graphCanvas.height / rect.height);

            if (sim.graphZoomMode) {
                graphZoomRect = { x1: mx, y1: my, x2: mx, y2: my };
                graphCanvas.setPointerCapture(e.pointerId);
                return;
            }

            graphPan.dragging  = true;
            graphPan.startX    = mx;
            graphPan.startY    = my;
            graphPan.startView = {
                xMin: sim.graphView.xMin, xMax: sim.graphView.xMax,
                yMin: sim.graphView.yMin, yMax: sim.graphView.yMax
            };
            graphCanvas.setPointerCapture(e.pointerId);
            graphCanvas.style.cursor = 'default';
        });

        graphCanvas.addEventListener('pointerup', function() {
            if (sim.graphZoomMode && graphZoomRect) {
                _applyZoom();
                graphZoomRect = null;
            }
            graphPan.dragging = false;
            graphCanvas.style.cursor = sim.graphZoomMode ? 'crosshair' : 'default';
        });

        graphCanvas.addEventListener('pointerleave', function() {
            graphHoverPos = null;
            graphPan.dragging = false;
            var tip = document.getElementById('graph-hover-tooltip');
            if (tip) tip.style.display = 'none';
        });

        // Zoom molette (DeltaP(t) uniquement)
        graphCanvas.addEventListener('wheel', function(e) {
            if (sim.graphMode !== 'dpt') return;
            e.preventDefault();
            var rect = graphCanvas.getBoundingClientRect();
            var mx   = (e.clientX - rect.left) * (graphCanvas.width  / rect.width);
            var W    = graphCanvas.width;
            var pW   = W - GM.left - GM.right;
            var tCur = sim.graphView.xMin +
                (mx - GM.left) / pW * (sim.graphView.xMax - sim.graphView.xMin);
            var factor = e.deltaY > 0 ? 1.2 : 0.8;
            pushGraphView();
            sim.graphView.xMin = tCur + (sim.graphView.xMin - tCur) * factor;
            sim.graphView.xMax = tCur + (sim.graphView.xMax - tCur) * factor;
            sim.graphUserPanned = true;
        }, { passive: false });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setup();
            _hideUnusedGraphBtns();
        });
    } else {
        setup();
        _hideUnusedGraphBtns();
    }
})();

// Masque les boutons zoom/adapter/précédent dès le chargement
function _hideUnusedGraphBtns() {
    ['btn-graph-prev', 'btn-graph-zoom', 'btn-graph-auto'].forEach(function(id) {
        var btn = document.getElementById(id);
        if (btn) btn.style.display = 'none';
    });
}

// ── Applique le zoom par rectangle ────────────────────────────────────

function _applyZoom() {
    var r  = graphZoomRect;
    if (!r) return;
    var dx = Math.abs(r.x2 - r.x1);
    var dy = Math.abs(r.y2 - r.y1);
    if (dx < 6 || dy < 6) return;

    var W  = graphCanvas.width;
    var H  = graphCanvas.height;
    var pW = W - GM.left - GM.right;
    var pH = H - GM.top  - GM.bottom;

    function canvasToDataX(cx) {
        if (sim.graphMode === 'dpx') return 0;  // X fixe
        return sim.graphView.xMin + (cx - GM.left) / pW * (sim.graphView.xMax - sim.graphView.xMin);
    }
    function canvasToDataY(cy) {
        var yMin = sim.graphMode === 'dpx' ? sim.graphDpxYMin : sim.graphView.yMin;
        var yMax = sim.graphMode === 'dpx' ? sim.graphDpxYMax : sim.graphView.yMax;
        return yMin + (1 - (cy - GM.top) / pH) * (yMax - yMin);
    }

    pushGraphView();

    var x1 = Math.min(r.x1, r.x2);
    var x2 = Math.max(r.x1, r.x2);
    var y1 = Math.min(r.y1, r.y2);
    var y2 = Math.max(r.y1, r.y2);

    if (sim.graphMode === 'dpt') {
        sim.graphView.xMin = canvasToDataX(x1);
        sim.graphView.xMax = canvasToDataX(x2);
    }
    sim.graphView.yMin = canvasToDataY(y2);
    sim.graphView.yMax = canvasToDataY(y1);
    sim.graphUserPanned = true;

    var btn = document.getElementById('btn-graph-prev');
    if (btn) btn.disabled = false;
}
