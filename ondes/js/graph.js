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

// ── Tailles de police dynamiques ───────────────────────────────────────
// Calculées depuis la hauteur disponible du canvas (H) et mises à jour
// au début de chaque appel _drawDpxGraph / _drawDptGraph.
// FONT_TICK  : graduations des axes (tick labels)
// FONT_TITLE : titres des axes (ex : "Temps (s)", "ΔP (u.a.)")
// FONT_HOVER : étiquette du hover snappé
var _gFontTick  = 14;
var _gFontTitle = 14;
var _gFontHover = 14;

// Met à jour les tailles de police dynamiques et les marges GM dépendantes.
// W = largeur effective du graphe (demi-largeur en mode both)
// H = hauteur totale du canvas (partagée entre les deux moitiés)
function _updateFontSizes(ctx, W, H, yMin, yMax) {
    // Taille tick : 3,5 % de la hauteur, bornes min/max selon usage
    _gFontTick  = Math.max(10, Math.min(18, Math.round(H * 0.038)));
    // Taille titre : légèrement plus grand que le tick
    _gFontTitle = Math.max(11, Math.min(20, Math.round(H * 0.046)));
    // Taille hover : proche du tick
    _gFontHover = Math.max(10, Math.min(18, Math.round(H * 0.038)));

    // Marge haute : espace pour éviter que le premier tick Y soit rogné
    GM.top    = Math.max(10, Math.round(_gFontTick * 0.8));
    // Marge droite : fixe
    GM.right  = 16;
    // Marge basse : espace pour tick X + titre X
    GM.bottom = Math.max(28, Math.round(_gFontTick * 1.6 + _gFontTitle * 1.5 + 4));
}

// Calcule GM.left de sorte que l'axe Y (x=0 du graphe) soit aligné
// avec la position de repos de la membrane dans la fenêtre.
// On utilise getBoundingClientRect pour comparer les positions viewport
// des deux canvas, indépendamment de la mise en page autour d'eux.
function _syncLeftMarginWithTube(ctx, W, yMin, yMax) {
    // + place pour le titre d'axe Y pivoté (cf. _yAxisTitleX), pour qu'il
    // ne se retrouve jamais collé au bord gauche du canvas, loin des chiffres.
    var minForLabels = _calcLeftMarginRaw(ctx, yMin, yMax) + _gFontTitle + 8;

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

// Calcule la marge minimale pour afficher les labels Y (chiffres seulement)
// Utilise la taille de police dynamique courante (_gFontTick)
function _calcLeftMarginRaw(ctx, yMin, yMax) {
    ctx.font = _gFontTick + 'px monospace';
    var wMin = ctx.measureText(_fmtLabel(yMin)).width;
    var wMax = ctx.measureText(_fmtLabel(yMax)).width;
    return Math.round(Math.max(wMin, wMax) + 14);
}

// Position X (translate) du titre d'axe Y pivoté, juste à gauche de la
// zone des chiffres — quelle que soit la valeur de GM.left (y compris
// quand elle est étendue pour aligner l'axe sur la membrane/le pot).
function _yAxisTitleX(ctx, GM, yMin, yMax) {
    var numbersZone = _calcLeftMarginRaw(ctx, yMin, yMax);
    return Math.max(4, GM.left - numbersZone - _gFontTitle - 4);
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

    _updateBothSepCSS(w);
}

// Met à jour la CSS variable --both-sep-x sur #graph-area pour que
// le pseudo-élément ::after de #graph-ctrl prolonge le séparateur canvas
function _updateBothSepCSS(canvasW) {
    var graphArea = document.getElementById('graph-area');
    if (!graphArea) return;
    var sep  = 3;
    var half = Math.floor((canvasW - sep) / 2);
    // La ligne CSS doit être positionnée par rapport à #graph-area.
    // Le canvas commence à x=0 dans #graph-canvas-wrap, lui-même dans #graph-area.
    // #graph-canvas-wrap et #graph-area ont la même largeur → half est correct.
    graphArea.style.setProperty('--both-sep-x', half + 'px');
    graphArea.style.setProperty('--both-sep-w', sep + 'px');
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

    // ── Branchement selon le tab actif ────────────────────────────────
    var isCorde  = (typeof activeTab !== 'undefined' && activeTab === 'corde');
    var isVagues = (typeof activeTab !== 'undefined' && activeTab === 'vagues');

    if (isVagues) {
        drawGraphVagues(ctx, W, H);
        if (simVagues.graphZoomMode && graphZoomRect) _drawZoomRect(ctx);
        return;
    }

    if (isCorde) {
        // ── Mode corde ─────────────────────────────────────────────
        var mode = simCorde.graphMode;
        if (mode === 'both') {
            var sep   = 3;
            var half  = Math.floor((W - sep) / 2);

            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, half, H);
            ctx.clip();
            _drawYxGraph(ctx, half, H);
            ctx.restore();

            ctx.save();
            ctx.translate(half + sep, 0);
            ctx.beginPath();
            ctx.rect(0, 0, half, H);
            ctx.clip();
            _drawYtGraph(ctx, half, H);
            ctx.restore();

            ctx.fillStyle = '#c8c0b4';
            ctx.fillRect(half, 0, sep, H);

            _drawBothLinksYt(ctx, W, H, half, sep);

        } else if (mode === 'dpx') {
            _drawYxGraph(ctx, W, H);
        } else {
            _drawYtGraph(ctx, W, H);
        }

        if (mode !== 'both') {
            if (graphHoverPos && !simCorde.graphCursorMode) {
                _drawSnappedHoverCorde(ctx, W, H);
            }
            if (simCorde.graphCursorMode && graphHoverPos) {
                _drawCrosshairCorde(ctx, W, H);
            }
        }

    } else {
        // ── Mode son (comportement original) ──────────────────────
        if (sim.graphMode === 'both') {
            var sep   = 3;
            var half  = Math.floor((W - sep) / 2);

            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, half, H);
            ctx.clip();
            _drawDpxGraph(ctx, half, H);
            ctx.restore();

            ctx.save();
            ctx.translate(half + sep, 0);
            ctx.beginPath();
            ctx.rect(0, 0, half, H);
            ctx.clip();
            _drawDptGraph(ctx, half, H);
            ctx.restore();

            ctx.fillStyle = '#c8c0b4';
            ctx.fillRect(half, 0, sep, H);

            _drawBothLinks(ctx, W, H, half, sep);

        } else if (sim.graphMode === 'dpx') {
            _drawDpxGraph(ctx, W, H);
        } else {
            _drawDptGraph(ctx, W, H);
        }

        if (sim.graphMode !== 'both') {
            if (graphHoverPos && !sim.graphCursorMode) {
                _drawSnappedHover(ctx, W, H);
            }
            if (sim.graphCursorMode && graphHoverPos) {
                _drawCrosshair(ctx, W, H);
            }
        }
    }

    // Rectangle de zoom en cours
    var _activeZoom = isCorde ? simCorde.graphZoomMode : sim.graphZoomMode;
    if (_activeZoom && graphZoomRect) {
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

    // ── Tailles de police et marges dynamiques ────────────────────────
    _updateFontSizes(ctx, W, H, yMin, yMax);

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

    // ── Tailles de police et marges dynamiques ────────────────────────
    _updateFontSizes(ctx, W, H, yMin, yMax);

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
    ctx.font         = _gFontHover + 'px monospace';
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
    ctx.font         = _gFontHover + 'px monospace';
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

    ctx.font         = _gFontTick + 'px monospace';
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

// Grille X pour ΔP(x) / y(x) : distance en unité physique (cm par défaut,
// utilisé par le tube ; la corde passe xMaxUnit=CORDE_LENGTH_M, unit='m').
function _drawGridX_dpx(ctx, xMin, xMax, px, py, pW, pH, L, xMaxUnit, unit) {
    xMaxUnit = (xMaxUnit !== undefined) ? xMaxUnit : 40;
    unit     = unit || 'cm';
    var unitPerPx = (L > 0) ? xMaxUnit / L : 1;
    var step      = _niceStep(xMaxUnit, 6);
    var start     = Math.ceil(0 / step) * step;
    var decimals  = step < 1 ? 1 : 0;

    ctx.font         = _gFontTick + 'px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    for (var u = start; u <= xMaxUnit + step * 0.01; u += step) {
        var xData = u / unitPerPx;   // px dans les données
        var xc    = px(xData);
        if (xc < GM.left - 2 || xc > GM.left + pW + 2) continue;

        ctx.strokeStyle = 'rgba(200,192,180,0.55)';
        ctx.lineWidth   = 0.8;
        ctx.beginPath();
        ctx.moveTo(xc, GM.top);
        ctx.lineTo(xc, GM.top + pH);
        ctx.stroke();

        ctx.fillStyle = '#7a8a96';
        ctx.fillText(u.toFixed(decimals), xc, GM.top + pH + 4);
    }
}

// Grille X pour ΔP(t) : temps en secondes
function _drawGridX_dpt(ctx, xMin, xMax, px, py, pW, pH) {
    var step  = _niceStep(xMax - xMin, 6);
    var start = Math.ceil(xMin / step) * step;

    ctx.font         = _gFontTick + 'px monospace';
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
    ctx.fillStyle    = '#5a6a78';
    ctx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';

    // Titre X : version courte si le canvas est trop étroit pour le texte long
    var labelX = pW < 260 ? 'Distance (cm)' : 'Distance depuis la membrane (cm)';
    ctx.fillText(labelX, GM.left + pW / 2, H - 2);

    // Label axe Y (vertical)
    ctx.save();
    ctx.translate(_yAxisTitleX(ctx, GM, yMin, yMax), GM.top + pH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('ΔP (u.a.)', 0, 0);
    ctx.restore();
}

// Labels des axes pour ΔP(t)
function _drawAxisLabels_dpt(ctx, W, H, GM, pW, pH, xMin, xMax, yMin, yMax, px, py) {
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
    var sv = _activeSv();
    var v = {
        xMin: sv.graphView.xMin, xMax: sv.graphView.xMax,
        yMin: sv.graphView.yMin, yMax: sv.graphView.yMax
    };
    sv.graphViewHistory.push(v);
    var btn = document.getElementById('btn-graph-prev');
    if (btn) btn.disabled = false;
}

// ══════════════════════════════════════════════════════════════════════
//  ██████╗ ██████╗ ██████╗ ██████╗ ███████╗
//  Graphes — mode CORDE  (y(x) et y(t))
// ══════════════════════════════════════════════════════════════════════

// ── Graphe y(x) ───────────────────────────────────────────────────────
//  Analogue à _drawDpxGraph mais :
//    • données : simCorde.yxData  [{x, y}]
//    • courbe tracée pixel par pixel depuis cordeDisplacement
//    • axe Y : y (cm), valeur physique réelle, bornes ±amplitudeCm×1.12
//    • axe X : Distance depuis le pot (m), 0–CORDE_LENGTH_M

function _drawYxGraph(ctx, W, H) {
    var L      = simCorde.cordeLength;
    var xMin   = 0;
    var xMax   = L > 0 ? L : 1;
    var ampCm  = simCorde.amplitudeCm > 0 ? simCorde.amplitudeCm : 1;
    var yMin   = -1.12 * ampCm;
    var yMax   =  1.12 * ampCm;
    simCorde.graphYxYMin = yMin;
    simCorde.graphYxYMax = yMax;

    _updateFontSizes(ctx, W, H, yMin, yMax);
    _syncLeftMarginWithCorde(ctx, W, yMin, yMax);

    var pW = W - GM.left - GM.right;
    var pH = H - GM.top  - GM.bottom;
    if (pW < 20 || pH < 20) return;

    function px(x_data) { return GM.left + (x_data - xMin) / (xMax - xMin) * pW; }
    function py(y_data) { return GM.top  + (1 - (y_data - yMin) / (yMax - yMin)) * pH; }

    // Fond zone tracé
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(GM.left, GM.top, pW, pH);

    // Grilles
    _drawGridY(ctx, yMin, yMax, px, py, pW, pH);
    _drawGridX_dpx(ctx, xMin, xMax, px, py, pW, pH, L, CORDE_LENGTH_M, 'm');
    _drawZeroLine(ctx, yMin, yMax, px, py, pW);

    // ── Courbe y(x) ───────────────────────────────────────────────────
    // Conversion px → cm via pxPerCmAmpl pour afficher la vraie valeur de y
    var amp = simCorde.pxPerCmAmpl > 0 ? simCorde.pxPerCmAmpl : 1;
    {
        var freqEff_g = (simCorde.sourceMode === 'impulse') ? 1.0 / T_IMPULSE : simCorde.freq;
        var lambda_g  = (simCorde.c_sim > 0) ? simCorde.c_sim / freqEff_g : L;
        var pxPerLambda = (lambda_g > 0) ? pW * lambda_g / L : pW;
        var subSteps = (pxPerLambda < 8) ? Math.ceil(8 / Math.max(0.5, pxPerLambda)) : 1;
        subSteps = Math.min(subSteps, 16);

        var totalSteps = pW * subSteps;
        ctx.save();
        ctx.beginPath();
        var firstPt = true;
        for (var s = 0; s <= totalSteps; s++) {
            var frac   = s / totalSteps;
            var x_data = xMin + frac * (xMax - xMin);
            var y_raw  = cordeDisplacement(x_data, simCorde.simTime);
            var y_cm   = y_raw / amp;   // px → cm (valeur réelle)
            var cx     = GM.left + frac * pW;
            var cy     = py(y_cm);
            if (firstPt) { ctx.moveTo(cx, cy); firstPt = false; }
            else          { ctx.lineTo(cx, cy); }
        }
        ctx.strokeStyle = '#7a2510';
        ctx.lineWidth   = 2;
        ctx.stroke();
        ctx.restore();
    }

    // Marqueurs de balises
    if (simCorde.beacon1.active) {
        var xb1 = simCorde.beacon1.x - simCorde.cordeLeft;
        _drawBeaconMarker(ctx, px(xb1), py, yMin, yMax, '#e07020', 'B1', pH);
    }
    if (simCorde.beacon2.active) {
        var xb2 = simCorde.beacon2.x - simCorde.cordeLeft;
        _drawBeaconMarker(ctx, px(xb2), py, yMin, yMax, '#2a8a50', 'B2', pH);
    }

    // Bordure
    ctx.strokeStyle = '#c8c0b4';
    ctx.lineWidth   = 1;
    ctx.strokeRect(GM.left, GM.top, pW, pH);

    // Labels axes
    _drawAxisLabels_yx(ctx, W, H, GM, pW, pH, yMin, yMax);
}

// ── Graphe y(t) ───────────────────────────────────────────────────────

function _drawYtGraph(ctx, W, H) {
    var d1 = simCorde.ytData1;
    var d2 = simCorde.ytData2;
    var hasData = (simCorde.beacon1.active && d1.length > 1) ||
                  (simCorde.beacon2.active && d2.length > 1);

    if (!hasData) {
        ctx.fillStyle = '#7a8a96';
        ctx.font      = 'italic ' + Math.round(W * 0.025 + 10) + 'px "Segoe UI", Arial, sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Activez une balise pour afficher le graphe', W / 2, H / 2);
        return;
    }

    var xMin  = 0;
    var xMax  = 5;
    simCorde.graphView.xMin = xMin;
    simCorde.graphView.xMax = xMax;
    var ampCm = simCorde.amplitudeCm > 0 ? simCorde.amplitudeCm : 1;
    var yMin  = -1.12 * ampCm;
    var yMax  =  1.12 * ampCm;
    simCorde.graphView.yMin = yMin;
    simCorde.graphView.yMax = yMax;

    _updateFontSizes(ctx, W, H, yMin, yMax);
    _syncLeftMarginWithCorde(ctx, W, yMin, yMax);

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

    // Clip
    ctx.save();
    ctx.beginPath();
    ctx.rect(GM.left, GM.top, pW, pH);
    ctx.clip();

    var amp = simCorde.pxPerCmAmpl > 0 ? simCorde.pxPerCmAmpl : 1;

    if (simCorde.beacon1.active && d1.length > 1) {
        _drawSeriesCorde(ctx, d1, xMin, xMax, px, py, '#e07020', 2, simCorde.simTime, amp);
    }
    if (simCorde.beacon2.active && d2.length > 1) {
        _drawSeriesCorde(ctx, d2, xMin, xMax, px, py, '#2a8a50', 2, simCorde.simTime, amp);
    }

    ctx.restore();

    ctx.strokeStyle = '#c8c0b4';
    ctx.lineWidth   = 1;
    ctx.strokeRect(GM.left, GM.top, pW, pH);

    _drawAxisLabels_yt(ctx, W, H, GM, pW, pH, yMin, yMax);
    _drawLegendCorde(ctx, W, pH);
}

// ── Tracé d'une série y(t) ────────────────────────────────────────────

function _drawSeriesCorde(ctx, data, xMin, xMax, px, py, color, lw, cycleTime, amp) {
    var WINDOW  = 5;
    var tOrigin = simCorde.ytTimeOrigin || 0;

    ctx.beginPath();
    var started = false;
    for (var i = 0; i < data.length; i++) {
        var pt     = data[i];
        var tLocal = pt.t - tOrigin;
        if (tLocal < 0 || tLocal > WINDOW) { started = false; continue; }
        if (i > 0) {
            var prevLocal = data[i - 1].t - tOrigin;
            if (prevLocal < 0 || prevLocal > WINDOW) started = false;
        }
        var y_cm = pt.y / amp;   // px → cm (valeur réelle)
        var cx = px(tLocal);
        var cy = py(y_cm);
        if (!started) { ctx.moveTo(cx, cy); started = true; }
        else           { ctx.lineTo(cx, cy); }
    }
    ctx.strokeStyle = color;
    ctx.lineWidth   = lw;
    ctx.stroke();
}

// ── Légende y(t) ──────────────────────────────────────────────────────

function _drawLegendCorde(ctx, W, pH) {
    var x  = GM.left + 8;
    var y  = GM.top  + 10;
    var fs = 12;
    ctx.font         = 'bold ' + fs + 'px monospace';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    if (simCorde.beacon1.active) {
        ctx.fillStyle = '#e07020';
        ctx.fillRect(x, y - fs * 0.4, 16, 3);
        ctx.fillStyle = '#e07020';
        ctx.fillText('Balise 1', x + 20, y);
        y += fs + 6;
    }
    if (simCorde.beacon2.active) {
        ctx.fillStyle = '#2a8a50';
        ctx.fillRect(x, y - fs * 0.4, 16, 3);
        ctx.fillStyle = '#2a8a50';
        ctx.fillText('Balise 2', x + 20, y);
    }
}

// ── Labels axes y(x) ──────────────────────────────────────────────────

function _drawAxisLabels_yx(ctx, W, H, GM, pW, pH, yMin, yMax) {
    ctx.fillStyle    = '#5a6a78';
    ctx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    var labelX = pW < 260 ? 'Distance (m)' : 'Distance depuis le pot (m)';
    ctx.fillText(labelX, GM.left + pW / 2, H - 2);
    ctx.save();
    ctx.translate(_yAxisTitleX(ctx, GM, yMin, yMax), GM.top + pH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('y (cm)', 0, 0);
    ctx.restore();
}

// ── Labels axes y(t) ──────────────────────────────────────────────────

function _drawAxisLabels_yt(ctx, W, H, GM, pW, pH, yMin, yMax) {
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
}

// ── Synchronisation marge gauche avec la position du pot (corde) ──────
//  Analogue à _syncLeftMarginWithTube mais utilise cordeLeft

function _syncLeftMarginWithCorde(ctx, W, yMin, yMax) {
    // + place pour le titre d'axe Y pivoté (cf. _yAxisTitleX)
    var minForLabels = _calcLeftMarginRaw(ctx, yMin, yMax) + _gFontTitle + 8;

    if (tubeCanvas && tubeCanvas.width > 0 && simCorde.cordeLeft > 0 && graphCanvas) {
        var tubeRect  = tubeCanvas.getBoundingClientRect();
        var graphRect = graphCanvas.getBoundingClientRect();
        var potViewportX    = tubeRect.left + (simCorde.cordeLeft / tubeCanvas.width) * tubeRect.width;
        var marginFromVp    = potViewportX - graphRect.left;
        var marginCanvas    = Math.round(marginFromVp * (W / graphRect.width));
        GM.left = Math.max(minForLabels, marginCanvas);
    } else {
        GM.left = minForLabels;
    }
}

// ── Mode both corde : liaisons balise → point temporel ────────────────

function _drawBothLinksYt(ctx, W, H, half, sep) {
    var ampCm = simCorde.amplitudeCm > 0 ? simCorde.amplitudeCm : 1;
    var yMin  = -1.12 * ampCm;
    var yMax  =  1.12 * ampCm;
    var pH    = H - GM.top - GM.bottom;
    if (pH <= 0) return;

    var amp = simCorde.pxPerCmAmpl > 0 ? simCorde.pxPerCmAmpl : 1;

    function py(y_cm) {
        return GM.top + (1 - (y_cm - yMin) / (yMax - yMin)) * pH;
    }

    var tOrigin = simCorde.ytTimeOrigin || 0;
    var WINDOW  = 5;

    var beacons = [];
    if (simCorde.beacon1.active) beacons.push({ beacon: simCorde.beacon1, color: '#e07020' });
    if (simCorde.beacon2.active) beacons.push({ beacon: simCorde.beacon2, color: '#2a8a50' });

    for (var b = 0; b < beacons.length; b++) {
        var bc    = beacons[b];
        var color = bc.color;
        var xb    = bc.beacon.x - simCorde.cordeLeft;
        var y_raw = cordeDisplacement(xb, simCorde.simTime);
        var y_cm  = y_raw / amp;
        var yc    = py(y_cm);

        if (yc < GM.top || yc > GM.top + pH) continue;

        var pW_left = half - GM.left - GM.right;
        if (pW_left <= 0) continue;
        var L    = simCorde.cordeLength > 0 ? simCorde.cordeLength : 1;
        var xDpx = GM.left + (xb / L) * pW_left;

        var tLocal   = simCorde.simTime - tOrigin;
        tLocal       = Math.max(0, Math.min(WINDOW, tLocal));
        var pW_right = half - GM.left - GM.right;
        var xDpt     = (half + sep) + GM.left + (tLocal / WINDOW) * pW_right;

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

        ctx.globalAlpha = 1.0;
        ctx.fillStyle   = color;
        ctx.beginPath();
        ctx.arc(xDpx, yc, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(xDpt, yc, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ── Hover snappé corde ────────────────────────────────────────────────

function _drawSnappedHoverCorde(ctx, W, H) {
    if (!graphHoverPos) return;
    var mx = graphHoverPos.x;
    var my = graphHoverPos.y;
    var pW = W - GM.left - GM.right;
    var pH = H - GM.top  - GM.bottom;
    if (pW < 10 || pH < 10) return;

    ctx.save();
    if (simCorde.graphMode === 'dpt') {
        _drawSnappedHoverCorde_yt(ctx, W, H, mx, my, pW, pH);
    } else {
        _drawSnappedHoverCorde_yx(ctx, W, H, mx, my, pW, pH);
    }
    ctx.restore();
}

function _drawSnappedHoverCorde_yt(ctx, W, H, mx, my, pW, pH) {
    var xMin    = simCorde.graphView.xMin;
    var xMax    = simCorde.graphView.xMax;
    var yMin    = simCorde.graphView.yMin;
    var yMax    = simCorde.graphView.yMax;
    var WINDOW  = 5;
    var tOrigin = simCorde.ytTimeOrigin || 0;
    var amp     = simCorde.pxPerCmAmpl > 0 ? simCorde.pxPerCmAmpl : 1;

    function px(v) { return GM.left + (v - xMin) / (xMax - xMin) * pW; }
    function py(v) { return GM.top  + (1 - (v - yMin) / (yMax - yMin)) * pH; }

    var series = [];
    if (simCorde.beacon1.active && simCorde.ytData1.length > 1)
        series.push({ data: simCorde.ytData1, color: '#e07020' });
    if (simCorde.beacon2.active && simCorde.ytData2.length > 1)
        series.push({ data: simCorde.ytData2, color: '#2a8a50' });

    var winner = null, winnerColor = null, winnerDist = Infinity;
    for (var s = 0; s < series.length; s++) {
        var sr = series[s];
        for (var i = 0; i < sr.data.length; i++) {
            var pt     = sr.data[i];
            var tLocal = pt.t - tOrigin;
            if (tLocal < 0 || tLocal > WINDOW) continue;
            var y_cm = pt.y / amp;
            var bx   = px(tLocal);
            var by   = py(y_cm);
            var byc  = Math.max(GM.top, Math.min(GM.top + pH, by));
            var dist = Math.sqrt((bx - mx) * (bx - mx) + (byc - my) * (byc - my));
            if (dist < winnerDist) { winnerDist = dist; winner = pt; winnerColor = sr.color; }
        }
    }
    if (!winner) return;

    var tLocal = winner.t - tOrigin;
    var y_cm   = winner.y / amp;
    var bx  = px(tLocal);
    var by  = py(y_cm);
    var byc = Math.max(GM.top, Math.min(GM.top + pH, by));

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(60,60,60,0.45)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(bx, GM.top + pH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(GM.left, byc);    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = winnerColor;
    ctx.beginPath();
    ctx.arc(bx, byc, 5, 0, Math.PI * 2);
    ctx.fill();

    var tLbl  = tLocal.toFixed(2) + ' s';
    var vLbl  = 'y = ' + y_cm.toFixed(2) + ' cm';
    var label = '(' + tLbl + ', ' + vLbl + ')';
    ctx.font         = _gFontHover + 'px monospace';
    ctx.fillStyle    = winnerColor;
    ctx.textBaseline = 'bottom';
    ctx.textAlign    = 'left';
    var lw2 = ctx.measureText(label).width;
    var lx  = (bx + 10 + lw2 > GM.left + pW) ? bx - 10 - lw2 : bx + 10;
    var ly  = (byc - 8 < GM.top + 28)         ? byc + 32       : byc - 8;
    ctx.fillText(label, lx, ly);
}

function _drawSnappedHoverCorde_yx(ctx, W, H, mx, my, pW, pH) {
    var data = simCorde.yxData;
    if (!data || data.length < 2) return;

    var L    = simCorde.cordeLength;
    var xMin = 0;
    var xMax = L > 0 ? L : 1;
    var yMin = simCorde.graphYxYMin;
    var yMax = simCorde.graphYxYMax;
    var amp  = simCorde.pxPerCmAmpl > 0 ? simCorde.pxPerCmAmpl : 1;

    function px(v) { return GM.left + (v - xMin) / (xMax - xMin) * pW; }
    function py(v) { return GM.top  + (1 - (v - yMin) / (yMax - yMin)) * pH; }

    var best = null, bestDist = Infinity;
    for (var i = 0; i < data.length; i++) {
        var pt   = data[i];
        var y_cm = pt.y / amp;
        var bx_  = px(pt.x);
        var by_  = py(y_cm);
        var byc_ = Math.max(GM.top, Math.min(GM.top + pH, by_));
        var d    = Math.sqrt((bx_ - mx) * (bx_ - mx) + (byc_ - my) * (byc_ - my));
        if (d < bestDist) { bestDist = d; best = pt; }
    }
    if (!best) return;

    var y_cm = best.y / amp;
    var bx   = px(best.x);
    var by   = py(y_cm);
    var byc  = Math.max(GM.top, Math.min(GM.top + pH, by));

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(60,60,60,0.45)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(bx, GM.top + pH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(GM.left, byc);    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#7a2510';
    ctx.beginPath();
    ctx.arc(bx, byc, 5, 0, Math.PI * 2);
    ctx.fill();

    var mPerPx  = (L > 0) ? CORDE_LENGTH_M / L : 1;
    var dM      = (best.x * mPerPx).toFixed(2);
    var label   = '(' + dM + ' m, y = ' + y_cm.toFixed(2) + ' cm)';
    ctx.font         = _gFontHover + 'px monospace';
    ctx.fillStyle    = '#7a2510';
    ctx.textBaseline = 'bottom';
    ctx.textAlign    = 'left';
    var lw2 = ctx.measureText(label).width;
    var lx  = (bx + 10 + lw2 > GM.left + pW) ? bx - 10 - lw2 : bx + 10;
    var ly  = (byc - 8 < GM.top + 28)         ? byc + 32       : byc - 8;
    ctx.fillText(label, lx, ly);
}

// ── Réticule corde ────────────────────────────────────────────────────

function _drawCrosshairCorde(ctx, W, H) {
    if (!graphHoverPos) return;
    var mx = graphHoverPos.x;
    var my = graphHoverPos.y;
    var pW = W - GM.left - GM.right;
    var pH = H - GM.top  - GM.bottom;

    ctx.save();
    ctx.strokeStyle = '#7a2510';
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

    var xVal, yVal;
    if (pW > 0 && pH > 0) {
        if (simCorde.graphMode === 'dpx') {
            var xData  = (mx - GM.left) / pW * simCorde.cordeLength;
            var mPerPx = simCorde.cordeLength > 0 ? CORDE_LENGTH_M / simCorde.cordeLength : 1;
            xVal = (xData * mPerPx).toFixed(2) + ' m';
        } else {
            var tData = simCorde.graphView.xMin +
                (mx - GM.left) / pW * (simCorde.graphView.xMax - simCorde.graphView.xMin);
            xVal = tData.toFixed(2) + ' s';
        }
        var yRange = simCorde.graphMode === 'dpx'
            ? (simCorde.graphYxYMax - simCorde.graphYxYMin)
            : (simCorde.graphView.yMax - simCorde.graphView.yMin);
        var yMinV  = simCorde.graphMode === 'dpx' ? simCorde.graphYxYMin : simCorde.graphView.yMin;
        yVal = (yMinV + (1 - (my - GM.top) / pH) * yRange).toFixed(2) + ' cm';
    }

    var tip = document.getElementById('graph-hover-tooltip');
    if (tip && xVal !== undefined) {
        tip.textContent = xVal + '  |  y = ' + yVal;
        tip.style.display = 'block';
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

function prevGraphView() {
    var sv = _activeSv();
    if (sv.graphViewHistory.length === 0) return;
    var v = sv.graphViewHistory.pop();
    sv.graphView.xMin = v.xMin; sv.graphView.xMax = v.xMax;
    sv.graphView.yMin = v.yMin; sv.graphView.yMax = v.yMax;
    sv.graphUserPanned = true;
    var btn = document.getElementById('btn-graph-prev');
    if (btn) btn.disabled = sv.graphViewHistory.length === 0;
}

// ══════════════════════════════════════════════════════════════════════
//  Basculement des modes graphe / outils
// ══════════════════════════════════════════════════════════════════════

function setGraphMode(mode) {
    var isCorde  = (typeof activeTab !== 'undefined' && activeTab === 'corde');
    var isVagues = (typeof activeTab !== 'undefined' && activeTab === 'vagues');

    // Mettre à jour le graphMode dans l'objet approprié
    if (isCorde) {
        simCorde.graphMode = mode;
    } else if (isVagues) {
        simVagues.graphMode = mode;
    } else {
        sim.graphMode = mode;
    }

    var btnDpx  = document.getElementById('btn-graph-dpx');
    var btnDpt  = document.getElementById('btn-graph-dpt');
    var btnBoth = document.getElementById('btn-graph-both');
    if (btnDpx)  btnDpx.classList.toggle ('active', mode === 'dpx');
    if (btnDpt)  btnDpt.classList.toggle ('active', mode === 'dpt');
    if (btnBoth) btnBoth.classList.toggle('active', mode === 'both');

    // Classe sur #graph-area pour afficher/masquer la ligne de séparation
    var graphArea = document.getElementById('graph-area');
    if (graphArea) graphArea.classList.toggle('mode-both', mode === 'both');

    // Masquer tooltip
    var tip = document.getElementById('graph-hover-tooltip');
    if (tip) tip.style.display = 'none';
    // Masquer les boutons zoom/adapter/précédent
    ['btn-graph-prev', 'btn-graph-zoom', 'btn-graph-auto'].forEach(function(id) {
        var btn = document.getElementById(id);
        if (btn) btn.style.display = 'none';
    });
}

// Met à jour les labels des boutons graphe selon le tab actif
function _updateGraphBtnLabels(tab) {
    var btnDpx  = document.getElementById('btn-graph-dpx');
    var btnDpt  = document.getElementById('btn-graph-dpt');
    if (tab === 'corde' || tab === 'vagues') {
        if (btnDpx) btnDpx.textContent = 'y(x) — spatial';
        if (btnDpt) btnDpt.textContent = 'y(t) — temporel';
    } else {
        if (btnDpx) btnDpx.textContent = 'ΔP(x) — spatial';
        if (btnDpt) btnDpt.textContent = 'ΔP(t) — temporel';
    }
}

function _activeSv() {
    if (typeof activeTab === 'undefined') return sim;
    if (activeTab === 'corde')  return simCorde;
    if (activeTab === 'vagues') return simVagues;
    return sim;
}

function toggleGraphZoom() {
    var sv = _activeSv();
    sv.graphZoomMode = !sv.graphZoomMode;
    graphZoomRect = null;
    if (sv.graphZoomMode) sv.graphCursorMode = false;
    var z = document.getElementById('btn-graph-zoom');
    var c = document.getElementById('btn-graph-cursor');
    if (z) z.classList.toggle('active', sv.graphZoomMode);
    if (c) c.classList.toggle('active', sv.graphCursorMode);
}

function toggleGraphCursor() {
    var sv  = _activeSv();
    var tip = document.getElementById('graph-hover-tooltip');
    sv.graphCursorMode = !sv.graphCursorMode;
    if (sv.graphCursorMode) sv.graphZoomMode = false;
    if (!sv.graphCursorMode && tip) tip.style.display = 'none';
    var z = document.getElementById('btn-graph-zoom');
    var c = document.getElementById('btn-graph-cursor');
    if (z) z.classList.toggle('active', sv.graphZoomMode);
    if (c) c.classList.toggle('active', sv.graphCursorMode);
}

function autoScaleGraph() {
    var sv = _activeSv();
    sv.graphUserPanned  = false;
    sv.graphViewHistory = [];
    if (activeTab === 'corde') {
        var ampCm = simCorde.amplitudeCm > 0 ? simCorde.amplitudeCm : 1;
        sv.graphView.yMin = -1.12 * ampCm;
        sv.graphView.yMax =  1.12 * ampCm;
    } else {
        sv.graphView.yMin = -1.12;
        sv.graphView.yMax =  1.12;
    }
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

            var isCorde  = (typeof activeTab !== 'undefined' && activeTab === 'corde');
            var cursorMd = _activeSv().graphCursorMode;
            graphHoverPos = { x: mx, y: my, free: !!cursorMd };

            if (graphPan.dragging) {
                var sv   = _activeSv();
                var mode = sv.graphMode;
                if (mode === 'dpt') {
                    var W  = graphCanvas.width;
                    var pW = W - GM.left - GM.right;
                    var dx = mx - graphPan.startX;
                    var dataDx = dx / pW * (graphPan.startView.xMax - graphPan.startView.xMin);
                    sv.graphView.xMin = graphPan.startView.xMin - dataDx;
                    sv.graphView.xMax = graphPan.startView.xMax - dataDx;
                    sv.graphUserPanned = true;
                }
            }

            var zoomMode = _activeSv().graphZoomMode;
            if (zoomMode && graphZoomRect) {
                graphZoomRect.x2 = mx;
                graphZoomRect.y2 = my;
            }
        });

        graphCanvas.addEventListener('pointerdown', function(e) {
            var rect = graphCanvas.getBoundingClientRect();
            var mx   = (e.clientX - rect.left) * (graphCanvas.width  / rect.width);
            var my   = (e.clientY - rect.top)  * (graphCanvas.height / rect.height);

            var sv       = _activeSv();
            var zoomMode = sv.graphZoomMode;

            if (zoomMode) {
                graphZoomRect = { x1: mx, y1: my, x2: mx, y2: my };
                graphCanvas.setPointerCapture(e.pointerId);
                return;
            }

            graphPan.dragging  = true;
            graphPan.startX    = mx;
            graphPan.startY    = my;
            graphPan.startView = {
                xMin: sv.graphView.xMin, xMax: sv.graphView.xMax,
                yMin: sv.graphView.yMin, yMax: sv.graphView.yMax
            };
            graphCanvas.setPointerCapture(e.pointerId);
            graphCanvas.style.cursor = 'default';
        });

        graphCanvas.addEventListener('pointerup', function() {
            var zoomMode = _activeSv().graphZoomMode;
            if (zoomMode && graphZoomRect) {
                _applyZoom();
                graphZoomRect = null;
            }
            graphPan.dragging = false;
            graphCanvas.style.cursor = zoomMode ? 'crosshair' : 'default';
        });

        graphCanvas.addEventListener('pointerleave', function() {
            graphHoverPos = null;
            graphPan.dragging = false;
            var tip = document.getElementById('graph-hover-tooltip');
            if (tip) tip.style.display = 'none';
        });

        // Zoom molette (ΔP(t) / y(t) uniquement)
        graphCanvas.addEventListener('wheel', function(e) {
            var sv   = _activeSv();
            var mode = sv.graphMode;
            if (mode !== 'dpt') return;
            e.preventDefault();
            var rect = graphCanvas.getBoundingClientRect();
            var mx   = (e.clientX - rect.left) * (graphCanvas.width  / rect.width);
            var W    = graphCanvas.width;
            var pW   = W - GM.left - GM.right;
            var tCur = sv.graphView.xMin +
                (mx - GM.left) / pW * (sv.graphView.xMax - sv.graphView.xMin);
            var factor = e.deltaY > 0 ? 1.2 : 0.8;
            pushGraphView();
            sv.graphView.xMin = tCur + (sv.graphView.xMin - tCur) * factor;
            sv.graphView.xMax = tCur + (sv.graphView.xMax - tCur) * factor;
            sv.graphUserPanned = true;
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

    var sv = _activeSv();

    function canvasToDataX(cx) {
        var mode = sv.graphMode;
        if (mode === 'dpx') return 0;  // X fixe
        return sv.graphView.xMin + (cx - GM.left) / pW * (sv.graphView.xMax - sv.graphView.xMin);
    }
    function canvasToDataY(cy) {
        var yMin = sv.graphYxYMin !== undefined ? sv.graphYxYMin : sv.graphView.yMin;
        var yMax = sv.graphYxYMax !== undefined ? sv.graphYxYMax : sv.graphView.yMax;
        return yMin + (1 - (cy - GM.top) / pH) * (yMax - yMin);
    }

    pushGraphView();

    var x1 = Math.min(r.x1, r.x2);
    var x2 = Math.max(r.x1, r.x2);
    var y1 = Math.min(r.y1, r.y2);
    var y2 = Math.max(r.y1, r.y2);

    var mode = sv.graphMode;
    if (mode === 'dpt') {
        sv.graphView.xMin = canvasToDataX(x1);
        sv.graphView.xMax = canvasToDataX(x2);
    }
    sv.graphView.yMin = canvasToDataY(y2);
    sv.graphView.yMax = canvasToDataY(y1);
    sv.graphUserPanned = true;

    var btn = document.getElementById('btn-graph-prev');
    if (btn) btn.disabled = false;
}
