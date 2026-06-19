/* ══════════════════════════════════════════════════
   Simulation pédagogique — Physique-Chimie Lycée
   Auteur  : Mathieu Berdous
   Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
══════════════════════════════════════════════════ */

/* draw.js — rendu canvas animation (champ de pesanteur) */

/* ── Échelles visuelles des vecteurs ── */
var VEC_SCALE_POS = 0.22;   // fraction de l'échelle physique
var VEC_SCALE_VIT = 5;      // px par m/s
var VEC_SCALE_ACC = 10;     // px par m/s²

/* Couleurs vecteurs */
var COL_VEC_POS = '#2a6aaa';
var COL_VEC_VIT = '#c03030';
var COL_VEC_ACC = '#2a8a50';

var _animCanvas = null;
var _animCtx    = null;
var _animW = 0, _animH = 0;

/* ─────────────────────────────────────────────────
   initAnimCanvas — lie le canvas et redimensionne
───────────────────────────────────────────────── */
function initAnimCanvas() {
    _animCanvas = document.getElementById('anim-canvas');
    _animCtx    = _animCanvas.getContext('2d');
    resizeAnimCanvas();
}

function resizeAnimCanvas() {
    if (!_animCanvas) return;
    var wrap = _animCanvas.parentElement;
    _animW = wrap.clientWidth  || 600;
    _animH = wrap.clientHeight || 400;
    _animCanvas.width  = _animW;
    _animCanvas.height = _animH;
    computeScale(_animW, _animH);
}

/* ── Conversion coordonnées physiques → canvas ── */
function toCanvas(px, py) {
    return {
        cx: sim.originX + px * sim.scale,
        cy: _animH - sim.originY - py * sim.scale
    };
}

/* ── Position sol en pixels canvas ── */
function groundY() {
    return _animH - sim.originY;
}

/* ─────────────────────────────────────────────────
   drawAnim — point d'entrée du rendu animation
───────────────────────────────────────────────── */
function drawAnim() {
    if (!_animCtx) return;
    var ctx = _animCtx;
    ctx.clearRect(0, 0, _animW, _animH);

    _drawBackground(ctx);
    _drawGrid(ctx);
    _drawAxes(ctx);

    if (sim.displayMode === 'trajectory' || sim.displayMode === 'both') {
        _drawTrajectory(ctx);
    }
    if (sim.displayMode === 'chrono' || sim.displayMode === 'both') {
        _drawChronoSnaps(ctx);
    }

    _drawBall(ctx);
    _drawVectorLegend(ctx);
}

/* ─────────────────────────────────────────────────
   Fond : ciel + sol
───────────────────────────────────────────────── */
function _drawBackground(ctx) {
    var gy = groundY();

    /* Ciel */
    var skyGrad = ctx.createLinearGradient(0, 0, 0, gy);
    skyGrad.addColorStop(0,   '#6aaad8');
    skyGrad.addColorStop(0.5, '#a8ccea');
    skyGrad.addColorStop(1,   '#cce0f4');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, _animW, gy);

    /* Sol */
    var groundGrad = ctx.createLinearGradient(0, gy, 0, _animH);
    groundGrad.addColorStop(0,   '#5a8a3a');
    groundGrad.addColorStop(0.4, '#4a7a2a');
    groundGrad.addColorStop(1,   '#3a5a1a');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, gy, _animW, _animH - gy);

    /* Ligne de sol (épaisseur) */
    ctx.strokeStyle = '#3a6a20';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(_animW, gy);
    ctx.stroke();
}

/* ─────────────────────────────────────────────────
   Grille légère
───────────────────────────────────────────────── */
function _drawGrid(ctx) {
    if (sim.scale < 8) return;  // grille invisible si trop petite

    /* Choisir un pas de grille "propre" en mètres */
    var rawStep = 50 / sim.scale;  // viser ~50px entre les lignes
    var mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    var norm = rawStep / mag;
    var gridStep = norm < 1.5 ? mag : norm < 3.5 ? 2 * mag : norm < 7 ? 5 * mag : 10 * mag;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);

    /* Lignes verticales */
    var startX = Math.ceil(0 / gridStep) * gridStep;
    var xMaxPx = (_animW - sim.originX) / sim.scale;
    for (var gx = startX; gx <= xMaxPx + gridStep; gx += gridStep) {
        var p = toCanvas(gx, 0);
        ctx.beginPath();
        ctx.moveTo(p.cx, 0);
        ctx.lineTo(p.cx, groundY());
        ctx.stroke();
        /* Label */
        if (gx > 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.font = Math.max(9, Math.min(12, _animH * 0.025)) + 'px Segoe UI, Arial';
            ctx.textAlign = 'center';
            ctx.fillText(fmt(gx, 0) + ' m', p.cx, groundY() + 14);
        }
    }

    /* Lignes horizontales */
    var yMaxPx = (_animH - sim.originY) / sim.scale;
    for (var gy = gridStep; gy <= yMaxPx + gridStep; gy += gridStep) {
        var p2 = toCanvas(0, gy);
        if (p2.cy < 0) break;
        ctx.beginPath();
        ctx.moveTo(sim.originX, p2.cy);
        ctx.lineTo(_animW, p2.cy);
        ctx.stroke();
        /* Label */
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = Math.max(9, Math.min(12, _animH * 0.025)) + 'px Segoe UI, Arial';
        ctx.textAlign = 'right';
        ctx.fillText(fmt(gy, 0) + ' m', sim.originX - 4, p2.cy + 3);
    }

    ctx.setLineDash([]);
    ctx.restore();
}

/* ─────────────────────────────────────────────────
   Axes x et y avec flèches
───────────────────────────────────────────────── */
function _drawAxes(ctx) {
    var origin = toCanvas(0, 0);
    var fontSize = Math.max(11, Math.min(14, _animH * 0.03));
    var aLen = 10;  // longueur pointe de flèche

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.fillStyle   = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;

    /* Axe x */
    var xEnd = _animW - 14;
    ctx.beginPath();
    ctx.moveTo(sim.originX - 5, origin.cy);
    ctx.lineTo(xEnd, origin.cy);
    ctx.stroke();
    /* Flèche x */
    ctx.beginPath();
    ctx.moveTo(xEnd, origin.cy);
    ctx.lineTo(xEnd - aLen, origin.cy - 4);
    ctx.lineTo(xEnd - aLen, origin.cy + 4);
    ctx.closePath();
    ctx.fill();

    /* Axe y */
    var yEnd = 14;
    ctx.beginPath();
    ctx.moveTo(origin.cx, groundY() + 5);
    ctx.lineTo(origin.cx, yEnd);
    ctx.stroke();
    /* Flèche y */
    ctx.beginPath();
    ctx.moveTo(origin.cx, yEnd);
    ctx.lineTo(origin.cx - 4, yEnd + aLen);
    ctx.lineTo(origin.cx + 4, yEnd + aLen);
    ctx.closePath();
    ctx.fill();

    /* Labels */
    ctx.font = 'bold ' + fontSize + 'px Segoe UI, Arial';
    ctx.textAlign = 'left';
    ctx.fillText('x (m)', xEnd - aLen - 2, origin.cy - 7);
    ctx.textAlign = 'center';
    ctx.fillText('y (m)', origin.cx, yEnd - 4);

    /* Origine O */
    ctx.font = 'bold ' + fontSize + 'px Segoe UI, Arial';
    ctx.textAlign = 'right';
    ctx.fillText('O', origin.cx - 5, origin.cy + fontSize + 2);

    ctx.restore();
}

/* ─────────────────────────────────────────────────
   Trajectoire courante
───────────────────────────────────────────────── */
function _drawTrajectory(ctx) {
    if (sim.trajPoints.length < 2) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,100,0.75)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    var p0 = toCanvas(sim.trajPoints[0].x, sim.trajPoints[0].y);
    ctx.moveTo(p0.cx, p0.cy);
    for (var i = 1; i < sim.trajPoints.length; i++) {
        var p = toCanvas(sim.trajPoints[i].x, sim.trajPoints[i].y);
        ctx.lineTo(p.cx, p.cy);
    }
    ctx.stroke();
    ctx.restore();
}

/* ─────────────────────────────────────────────────
   Chronophotographie
───────────────────────────────────────────────── */
function _drawChronoSnaps(ctx) {
    var snaps = sim.chronoSnaps;
    if (snaps.length === 0) return;

    for (var i = 0; i < snaps.length; i++) {
        var s = snaps[i];
        var p = toCanvas(s.x, s.y);

        /* Disque de position */
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        /* Vecteurs aux positions figées */
        if (sim.showVecPos) {
            _drawVectorPos(ctx, s.x, s.y, 0.6);
        }
        if (sim.showVecVit) {
            _drawVecArrow(ctx, p.cx, p.cy,
                s.vx * VEC_SCALE_VIT, -s.vy * VEC_SCALE_VIT,
                COL_VEC_VIT, null, 0.6);
        }
        if (sim.showVecAcc) {
            _drawVecArrow(ctx, p.cx, p.cy,
                s.ax * VEC_SCALE_ACC, -s.ay * VEC_SCALE_ACC,
                COL_VEC_ACC, null, 0.6);
        }
    }
}

/* ─────────────────────────────────────────────────
   Ballon de foot
───────────────────────────────────────────────── */
function _drawBall(ctx) {
    var p = toCanvas(sim.x, sim.y);
    var r = Math.max(7, Math.min(13, sim.scale * 0.55));

    ctx.save();

    /* Corps blanc */
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, r, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur  = 5;
    ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.strokeStyle = '#333';
    ctx.lineWidth   = 1.2;
    ctx.stroke();

    /* Pentagone central simplifié */
    ctx.fillStyle = '#222';
    ctx.beginPath();
    for (var i = 0; i < 5; i++) {
        var angle = (i / 5) * 2 * Math.PI - Math.PI / 2;
        var rx = p.cx + Math.cos(angle) * r * 0.38;
        var ry = p.cy + Math.sin(angle) * r * 0.38;
        if (i === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
    }
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    /* Vecteurs sur la balle courante */
    if (sim.showVecPos) _drawVectorPos(ctx, sim.x, sim.y, 1.0);
    if (sim.showVecVit) {
        _drawVecArrow(ctx, p.cx, p.cy,
            sim.vx * VEC_SCALE_VIT, -sim.vy * VEC_SCALE_VIT,
            COL_VEC_VIT, 'v', 1.0);
    }
    if (sim.showVecAcc) {
        _drawVecArrow(ctx, p.cx, p.cy,
            sim.ax * VEC_SCALE_ACC, -sim.ay * VEC_SCALE_ACC,
            COL_VEC_ACC, 'a', 1.0);
    }
}

/* ── Vecteur position (de O vers la balle) ── */
function _drawVectorPos(ctx, px, py, alpha) {
    var origin = toCanvas(0, 0);
    var p      = toCanvas(px, py);
    var dx = (p.cx - origin.cx) * VEC_SCALE_POS;
    var dy = (p.cy - origin.cy) * VEC_SCALE_POS;
    var ex = origin.cx + dx;
    var ey = origin.cy + dy;
    _drawVecArrow(ctx, origin.cx, origin.cy, dx, dy, COL_VEC_POS, 'OM', alpha);
}

/* ─────────────────────────────────────────────────
   _drawVecArrow — flèche générique
   (cx,cy) = base, (dx,dy) = composantes en pixels
───────────────────────────────────────────────── */
function _drawVecArrow(ctx, cx, cy, dx, dy, color, label, opacity) {
    var len = Math.hypot(dx, dy);
    if (len < 3) return;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.lineWidth   = 2;

    var ex = cx + dx, ey = cy + dy;

    /* Corps */
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    /* Pointe */
    var aLen  = Math.min(12, len * 0.4);
    var angle = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - aLen * Math.cos(angle - 0.38),
               ey - aLen * Math.sin(angle - 0.38));
    ctx.lineTo(ex - aLen * Math.cos(angle + 0.38),
               ey - aLen * Math.sin(angle + 0.38));
    ctx.closePath();
    ctx.fill();

    /* Label */
    if (label) {
        ctx.font = 'bold ' + Math.max(11, Math.min(13, _animH * 0.028)) + 'px Segoe UI, Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var lx = ex + Math.cos(angle + Math.PI / 2) * 10;
        var ly = ey + Math.sin(angle + Math.PI / 2) * 10;
        ctx.fillText(label, lx, ly);
    }

    ctx.restore();
}

/* ─────────────────────────────────────────────────
   Légende des échelles vecteurs (coin bas-droite du ciel)
───────────────────────────────────────────────── */
function _drawVectorLegend(ctx) {
    var anyVec = sim.showVecPos || sim.showVecVit || sim.showVecAcc;
    if (!anyVec) return;

    var fontSize = Math.max(9, Math.min(11, _animH * 0.024));
    var x0 = _animW - 12;
    var y0 = 20;
    var lineH = fontSize + 8;
    var items = [];

    if (sim.showVecPos) items.push({color: COL_VEC_POS, label: 'Position (×' + fmt(VEC_SCALE_POS, 2) + ')'});
    if (sim.showVecVit) items.push({color: COL_VEC_VIT, label: 'Vitesse (1 m/s = ' + VEC_SCALE_VIT + ' px)'});
    if (sim.showVecAcc) items.push({color: COL_VEC_ACC, label: 'Accel. (1 m/s² = ' + VEC_SCALE_ACC + ' px)'});

    ctx.save();
    ctx.font = fontSize + 'px Segoe UI, Arial';

    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var ty = y0 + i * lineH;

        /* Trait couleur */
        ctx.strokeStyle = it.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x0 - 22, ty);
        ctx.lineTo(x0 - 5, ty);
        ctx.stroke();

        /* Texte */
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(it.label, x0 - 26, ty);
    }

    ctx.restore();
}

/* ── Splitter draggable ── */
(function initSplitter() {
    document.addEventListener('DOMContentLoaded', function () {
        var splitter = document.getElementById('left-splitter');
        var animArea = document.getElementById('anim-area');
        var graphArea = document.getElementById('graph-area');
        if (!splitter) return;

        var dragging = false;
        var startY = 0, startAnimH = 0, startGraphH = 0;

        splitter.addEventListener('pointerdown', function (e) {
            dragging = true;
            startY      = e.clientY;
            startAnimH  = animArea.getBoundingClientRect().height;
            startGraphH = graphArea.getBoundingClientRect().height;
            splitter.classList.add('dragging');
            splitter.setPointerCapture(e.pointerId);
        });

        splitter.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            var dy     = e.clientY - startY;
            var newAH  = Math.max(60,  startAnimH  + dy);
            var newGH  = Math.max(60,  startGraphH - dy);
            animArea.style.flex  = 'none';
            graphArea.style.flex = 'none';
            animArea.style.height  = newAH + 'px';
            graphArea.style.height = newGH + 'px';
        });

        function endDrag() {
            if (!dragging) return;
            dragging = false;
            splitter.classList.remove('dragging');
            resizeAnimCanvas();
            resizeGraphCanvas();
        }

        splitter.addEventListener('pointerup', endDrag);
        splitter.addEventListener('pointercancel', endDrag);
    });
})();
