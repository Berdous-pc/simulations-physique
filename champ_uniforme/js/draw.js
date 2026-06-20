/* ══════════════════════════════════════════════════
   Simulation pédagogique — Physique-Chimie Lycée
   Auteur  : Mathieu Berdous
   Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
══════════════════════════════════════════════════ */

/* draw.js — rendu canvas animation (champ de pesanteur) */

/* ── Échelles visuelles des vecteurs ── */
var VEC_SCALE_POS = 0.22;   // fraction de l'échelle physique
var VEC_SCALE_VIT = 7.5;    // px par m/s
var VEC_SCALE_ACC = 10;     // px par m/s²

/* Couleurs vecteurs */
var COL_VEC_POS    = '#2a6aaa';
var COL_VEC_VIT    = '#c03030';
var COL_VEC_ACC    = '#2a8a50';
var COL_VEC_FORCES = '#8e44ad';
var COL_VEC_SUMF   = '#8d4e20';

/* Échelle forces : px par Newton */
var VEC_SCALE_FORCE = 12;

/* Mode d'affichage des vecteurs : 'vecteur' | 'composantes' | 'vecteur-composantes' */
var vecDisplayMode = 'vecteur';

var _animCanvas = null;
var _animCtx    = null;
var _animW = 0, _animH = 0;
var _animHoverSnap = null;

/* ── Géométrie des axes (recalculée à chaque frame) ─────────────
   Centralisé ici pour que _drawGrid et _drawAxes soient cohérents.
─────────────────────────────────────────────────────────────── */
function _axisGeom() {
    var aLen = Math.max(8,  Math.min(14, _animH * 0.030));
    var yEnd = Math.max(16, Math.min(28, _animH * 0.050));
    var xEnd = _animW - Math.max(18, _animW * 0.030);
    return { aLen: aLen, yEnd: yEnd, xEnd: xEnd };
}

/* ─────────────────────────────────────────────────
   initAnimCanvas — lie le canvas et redimensionne
───────────────────────────────────────────────── */
function initAnimCanvas() {
    _animCanvas = document.getElementById('anim-canvas');
    _animCtx    = _animCanvas.getContext('2d');
    resizeAnimCanvas();

    _animCanvas.addEventListener('pointermove', function(e) {
        var rect = _animCanvas.getBoundingClientRect();
        var cx = (e.clientX - rect.left) * (_animW / rect.width);
        var cy = (e.clientY - rect.top)  * (_animH / rect.height);
        _updateAnimHover(cx, cy);
    });
    _animCanvas.addEventListener('pointerleave', function() {
        _animHoverSnap = null;
    });

    _animCanvas.addEventListener('click', function() {
        if (!_pinModeActive || !_animHoverSnap) return;
        var snap = _animHoverSnap;
        var targetList = (snap.runId === null) ? sim.analysisPoints
                         : savedRuns[snap.runId].analysisPoints;

        /* Supprime si clic sur un pin existant (tolérance 12 px) */
        for (var i = 0; i < targetList.length; i++) {
            var pp = toCanvas(targetList[i].x, targetList[i].y);
            if (Math.hypot(pp.cx - snap._cx, pp.cy - snap._cy) < 12) {
                targetList.splice(i, 1);
                return;
            }
        }
        if (targetList.length >= 10) return;

        var physCtx = (snap.runId === null)
            ? { mass: sim.mass, g: sim.g, windForce: sim.windForce, useFriction: sim.useFriction, k: sim.k }
            : (function(r){ return { mass: r.mass, g: r.g, windForce: r.windForce, useFriction: r.useFriction, k: 0.15 }; })(savedRuns[snap.runId]);
        targetList.push({
            x: snap.x, y: snap.y,
            vx: snap.vx, vy: snap.vy,
            ax: snap.ax, ay: snap.ay,
            t: snap.t,
            color: snap.color,
            phys: physCtx
        });
    });
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
        cx: sim.originX + px * sim.scaleX,
        cy: _animH - sim.originY - py * sim.scaleY
    };
}

/* ── Pas de grille "joli" pour une plage et un nombre cible de graduations ── */
function _niceGridStep(range, targetMajor) {
    var rough = range / targetMajor;
    var mag   = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1e-9))));
    var mant  = rough / mag;
    var major;
    if      (mant < 1.5) major = mag;
    else if (mant < 3.5) major = 2 * mag;
    else if (mant < 7.5) major = 5 * mag;
    else                  major = 10 * mag;
    var minor = major / 5;
    if (minor < 0.1) minor = major;  // éviter trop de micro-marques
    return { major: major, minor: minor };
}

/* Nombre de décimales à afficher pour un pas donné */
function _gridDec(step) {
    if (step >= 10)  return 0;
    if (step >= 1)   return 0;
    if (step >= 0.1) return 1;
    return 2;
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

    /* Runs sauvegardées (en dessous de la run courante) */
    for (var _sri = 0; _sri < savedRuns.length; _sri++) {
        var _sr = savedRuns[_sri];
        if (_sr.hidden) continue;
        if (sim.displayMode === 'trajectory' || sim.displayMode === 'both') {
            _drawSavedTrajectory(ctx, _sr);
        }
        if (sim.displayMode === 'chrono' || sim.displayMode === 'both') {
            _drawSavedChronoSnaps(ctx, _sr);
        }
        if (_replayPlaying) {
            _drawSavedBall(ctx, _sr);
        }
    }

    if (sim.displayMode === 'trajectory' || sim.displayMode === 'both') {
        _drawTrajectory(ctx);
    }
    if (sim.displayMode === 'chrono' || sim.displayMode === 'both') {
        _drawChronoSnaps(ctx);
    }

    _drawBall(ctx);
    _drawVectorLegend(ctx);
    _drawAnalysisPoints(ctx);
    if (_animHoverSnap) _drawAnimHover(ctx, _animHoverSnap);
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
   Grille légère + graduations sur les axes
   • Grandes lignes + labels tous les 5 m
   • Petites marques sans label tous les 1 m
───────────────────────────────────────────────── */
function _drawGrid(ctx) {
    if (sim.scaleX < 2 && sim.scaleY < 2) return;

    var xMaxPhy  = (_animW - sim.originX) / sim.scaleX;
    var yMaxPhy  = (_animH - sim.originY) / sim.scaleY;
    var gy0      = groundY();
    var fontSize = Math.max(11, Math.min(16, _animH * 0.032));

    /* Pas adaptatifs pour chaque axe */
    var xGrid    = _niceGridStep(xMaxPhy, 6);
    var yGrid    = _niceGridStep(yMaxPhy, 5);
    var xMajor   = xGrid.major,  xMinor = xGrid.minor;
    var yMajor   = yGrid.major,  yMinor = yGrid.minor;
    var xDec     = _gridDec(xMajor);
    var yDec     = _gridDec(yMajor);

    ctx.save();

    /* ── Bornes de non-superposition ── */
    var _ag        = _axisGeom();
    var tickMajor  = Math.max(6, _animH * 0.014);
    var tickMinor  = Math.max(3, _animH * 0.007);
    var axesFontSz = Math.max(14, Math.min(20, _animH * 0.041));
    var yAxisEnd   = _ag.yEnd + _ag.aLen + axesFontSz + 12;
    var xAxisCutoff = _ag.xEnd - axesFontSz * 3 - 20;

    /* Tolérance pour distinguer major vs minor (floating point) */
    function isMultiple(v, step) {
        return Math.abs(v / step - Math.round(v / step)) < 0.001;
    }

    /* ── Grandes lignes de grille ── */
    ctx.strokeStyle = 'rgba(255,255,255,0.38)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 4]);

    for (var ix = 1; ix * xMinor <= xMaxPhy * 1.05; ix++) {
        var gxv = ix * xMinor;
        if (!isMultiple(gxv, xMajor)) continue;
        var p = toCanvas(gxv, 0);
        if (p.cx > xAxisCutoff) break;
        ctx.beginPath(); ctx.moveTo(p.cx, 0); ctx.lineTo(p.cx, gy0); ctx.stroke();
    }
    for (var iy = 1; iy * yMinor <= yMaxPhy * 1.05; iy++) {
        var gyv = iy * yMinor;
        if (!isMultiple(gyv, yMajor)) continue;
        var p2 = toCanvas(0, gyv);
        if (p2.cy < yAxisEnd) break;
        ctx.beginPath(); ctx.moveTo(0, p2.cy); ctx.lineTo(_animW, p2.cy); ctx.stroke();
    }
    ctx.setLineDash([]);

    /* ── Marques sur l'axe X ── */
    for (var jx = 1; jx * xMinor <= xMaxPhy * 1.05; jx++) {
        var xv     = jx * xMinor;
        var isMajX = isMultiple(xv, xMajor);
        var pcx    = toCanvas(xv, 0);
        if (pcx.cx > xAxisCutoff) break;
        var tLen   = isMajX ? tickMajor : tickMinor;

        ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        ctx.strokeStyle = 'rgba(255,255,255,' + (isMajX ? '0.95' : '0.75') + ')';
        ctx.lineWidth   = isMajX ? 2 : 1.5;
        ctx.beginPath(); ctx.moveTo(pcx.cx, gy0 - tLen); ctx.lineTo(pcx.cx, gy0); ctx.stroke();

        if (isMajX) {
            ctx.font = 'bold ' + fontSize + 'px Segoe UI, Arial';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.fillText(fmt(xv, xDec), pcx.cx, gy0 + tickMajor + fontSize * 0.9);
            ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        }
    }

    /* ── Marques sur l'axe Y ── */
    for (var jy = 1; jy * yMinor <= yMaxPhy * 1.05; jy++) {
        var yv     = jy * yMinor;
        var isMajY = isMultiple(yv, yMajor);
        var pcy    = toCanvas(0, yv);
        if (pcy.cy < yAxisEnd) break;
        var tLenY  = isMajY ? tickMajor : tickMinor;

        ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        ctx.strokeStyle = 'rgba(255,255,255,' + (isMajY ? '0.95' : '0.75') + ')';
        ctx.lineWidth   = isMajY ? 2 : 1.5;
        ctx.beginPath(); ctx.moveTo(sim.originX, pcy.cy); ctx.lineTo(sim.originX + tLenY, pcy.cy); ctx.stroke();

        if (isMajY) {
            ctx.font = 'bold ' + fontSize + 'px Segoe UI, Arial';
            ctx.textAlign = 'right';
            ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.fillText(fmt(yv, yDec), sim.originX - tickMajor - 3, pcy.cy + fontSize * 0.35);
            ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        }
    }

    ctx.restore();
}

/* ─────────────────────────────────────────────────
   Axes x et y avec flèches + contour noir
───────────────────────────────────────────────── */
function _drawAxes(ctx) {
    var origin  = toCanvas(0, 0);
    var fontSize = Math.max(14, Math.min(20, _animH * 0.041));
    var ag   = _axisGeom();
    var aLen = ag.aLen;
    var xEnd = ag.xEnd;
    var yEnd = ag.yEnd;

    ctx.save();

    /* ── Axes avec ombre douce ── */
    ctx.shadowColor  = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur   = 3;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.fillStyle   = 'rgba(255,255,255,0.92)';
    ctx.lineWidth   = 2;

    ctx.beginPath(); ctx.moveTo(sim.originX - 5, origin.cy); ctx.lineTo(xEnd, origin.cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xEnd, origin.cy); ctx.lineTo(xEnd - aLen, origin.cy - 4); ctx.lineTo(xEnd - aLen, origin.cy + 4); ctx.closePath(); ctx.fill();

    ctx.beginPath(); ctx.moveTo(origin.cx, groundY() + 5); ctx.lineTo(origin.cx, yEnd); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(origin.cx, yEnd); ctx.lineTo(origin.cx - 4, yEnd + aLen); ctx.lineTo(origin.cx + 4, yEnd + aLen); ctx.closePath(); ctx.fill();

    /* ── Labels avec ombre douce ── */
    ctx.font          = 'bold ' + fontSize + 'px Segoe UI, Arial';
    ctx.fillStyle     = 'rgba(255,255,255,0.95)';
    ctx.shadowColor   = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur    = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    /* x (m) — aligné avec les labels de graduation, à droite de l'axe */
    var tickMajorRef  = Math.max(6,  _animH * 0.014);
    var fontSizeGrid  = Math.max(11, Math.min(16, _animH * 0.032));
    ctx.textAlign     = 'right';
    ctx.textBaseline  = 'alphabetic';
    ctx.fillText('x (m)', xEnd, origin.cy + tickMajorRef + fontSizeGrid * 0.9);

    /* O */
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('O', origin.cx - 6, origin.cy + fontSize + 2);

    /* y (m) — horizontal, à gauche de l'axe, juste sous la pointe de flèche */
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('y (m)', origin.cx - 6, yEnd + aLen + 3);

    ctx.restore();
}

/* ─────────────────────────────────────────────────
   Trajectoire & chronophotographie — runs sauvegardées
───────────────────────────────────────────────── */
function _drawSavedTrajectory(ctx, run) {
    ctx.save();
    ctx.strokeStyle = run.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.82;
    ctx.beginPath();

    if (_replayPlaying) {
        /* En mode replay : utilise graphData filtré par _replayT */
        var pts = run.graphData;
        var cutIdx = pts.length;
        for (var k = 0; k < pts.length; k++) {
            if (pts[k].t > _replayT) { cutIdx = k; break; }
        }
        if (cutIdx < 2) { ctx.restore(); return; }
        var p0 = toCanvas(pts[0].x, pts[0].y);
        ctx.moveTo(p0.cx, p0.cy);
        for (var i = 1; i < cutIdx; i++) {
            var p = toCanvas(pts[i].x, pts[i].y);
            ctx.lineTo(p.cx, p.cy);
        }
    } else {
        if (run.trajPoints.length < 2) { ctx.restore(); return; }
        var p0 = toCanvas(run.trajPoints[0].x, run.trajPoints[0].y);
        ctx.moveTo(p0.cx, p0.cy);
        for (var i = 1; i < run.trajPoints.length; i++) {
            var p = toCanvas(run.trajPoints[i].x, run.trajPoints[i].y);
            ctx.lineTo(p.cx, p.cy);
        }
    }

    ctx.stroke();
    ctx.restore();
}

function _drawSavedChronoSnaps(ctx, run) {
    var snaps = run.chronoSnaps;
    if (snaps.length === 0) return;
    for (var i = 0; i < snaps.length; i++) {
        var s = snaps[i];
        if (_replayPlaying && s.t > _replayT) break;
        var p = toCanvas(s.x, s.y);
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = run.color;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        if (run.showVecPos) _drawVectorPos(ctx, s.x, s.y, 0.42);
        if (run.showVecVit) _drawVecDispVA(ctx, p.cx, p.cy,
            s.vx * VEC_SCALE_VIT, -s.vy * VEC_SCALE_VIT, COL_VEC_VIT, null, 0.42);
        if (run.showVecAcc) _drawVecDispVA(ctx, p.cx, p.cy,
            s.ax * VEC_SCALE_ACC, -s.ay * VEC_SCALE_ACC, COL_VEC_ACC, null, 0.42);
        if (run.showVecForces || run.showVecSumF) {
            var _rp = { mass: run.mass, g: run.g, windForce: run.windForce, useFriction: run.useFriction, k: 0.15 };
            var _rr = [];
            if (run.showVecForces) _drawForcesAt(ctx, p.cx, p.cy, s.vx, s.vy, 0.42, _rp, _rr);
            if (run.showVecSumF)   _drawSumFAt(ctx,   p.cx, p.cy, s.vx, s.vy, 0.42, _rp, _rr);
        }
    }
}

/* ─────────────────────────────────────────────────
   Ballon pour une run sauvegardée (replay)
───────────────────────────────────────────────── */
function _drawSavedBall(ctx, run) {
    var pts = run.graphData;
    if (pts.length === 0) return;

    /* Interpolation linéaire de la position à _replayT */
    var idx = pts.length - 1;
    for (var k = 0; k < pts.length - 1; k++) {
        if (pts[k + 1].t > _replayT) { idx = k; break; }
    }
    var d0 = pts[idx];
    var x, y;
    if (idx < pts.length - 1 && pts[idx + 1].t > pts[idx].t) {
        var d1 = pts[idx + 1];
        var alpha = (_replayT - d0.t) / (d1.t - d0.t);
        x = d0.x + alpha * (d1.x - d0.x);
        y = d0.y + alpha * (d1.y - d0.y);
    } else {
        x = d0.x; y = d0.y;
    }

    var p = toCanvas(x, y);
    var r = Math.max(7, Math.min(13, Math.min(sim.scaleX, sim.scaleY) * 0.55));

    ctx.save();

    /* Halo coloré */
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, r + 3, 0, 2 * Math.PI);
    ctx.strokeStyle = run.color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    /* Corps blanc */
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, r, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur  = 5;
    ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.strokeStyle = run.color;
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    /* Pentagone central simplifié */
    ctx.fillStyle = '#333';
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
}

/* ─────────────────────────────────────────────────
   Trajectoire courante
───────────────────────────────────────────────── */
function _drawTrajectory(ctx) {
    if (sim.trajPoints.length < 2) return;
    ctx.save();
    ctx.strokeStyle = _currentRunColor || 'rgba(255,255,100,0.75)';
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
        ctx.fillStyle = _currentRunColor || 'rgba(255,255,255,0.85)';
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
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
            _drawVecDispVA(ctx, p.cx, p.cy,
                s.vx * VEC_SCALE_VIT, -s.vy * VEC_SCALE_VIT,
                COL_VEC_VIT, null, 0.6);
        }
        if (sim.showVecAcc) {
            _drawVecDispVA(ctx, p.cx, p.cy,
                s.ax * VEC_SCALE_ACC, -s.ay * VEC_SCALE_ACC,
                COL_VEC_ACC, null, 0.6);
        }
        if (sim.showVecForces || sim.showVecSumF) {
            var _sp = { mass: sim.mass, g: sim.g, windForce: sim.windForce, useFriction: sim.useFriction, k: sim.k };
            var _sr = [];
            if (sim.showVecForces) _drawForcesAt(ctx, p.cx, p.cy, s.vx, s.vy, 0.6, _sp, _sr);
            if (sim.showVecSumF)   _drawSumFAt(ctx,   p.cx, p.cy, s.vx, s.vy, 0.6, _sp, _sr);
        }
    }
}

/* ─────────────────────────────────────────────────
   Ballon de foot
───────────────────────────────────────────────── */
function _drawBall(ctx) {
    var p = toCanvas(sim.x, sim.y);
    var r = Math.max(7, Math.min(13, Math.min(sim.scaleX, sim.scaleY) * 0.55));

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
        _drawVecDispVA(ctx, p.cx, p.cy,
            sim.vx * VEC_SCALE_VIT, -sim.vy * VEC_SCALE_VIT,
            COL_VEC_VIT, null, 1.0);
    }
    if (sim.showVecAcc) {
        _drawVecDispVA(ctx, p.cx, p.cy,
            sim.ax * VEC_SCALE_ACC, -sim.ay * VEC_SCALE_ACC,
            COL_VEC_ACC, null, 1.0);
    }
    if (sim.showVecForces || sim.showVecSumF) {
        var _bp = { mass: sim.mass, g: sim.g, windForce: sim.windForce, useFriction: sim.useFriction, k: sim.k };
        var _br = [];
        if (sim.showVecForces) _drawForcesAt(ctx, p.cx, p.cy, sim.vx, sim.vy, 1.0, _bp, _br);
        if (sim.showVecSumF)   _drawSumFAt(ctx,   p.cx, p.cy, sim.vx, sim.vy, 1.0, _bp, _br);
    }
}

/* ── Vecteur position (de O vers la balle) ── */
function _drawVectorPos(ctx, px, py, alpha) {
    var origin = toCanvas(0, 0);
    var p      = toCanvas(px, py);
    var dx = p.cx - origin.cx;
    var dy = p.cy - origin.cy;
    var showVec  = (vecDisplayMode === 'vecteur'     || vecDisplayMode === 'vecteur-composantes');
    var showComp = (vecDisplayMode === 'composantes' || vecDisplayMode === 'vecteur-composantes');
    var showBoth = (vecDisplayMode === 'vecteur-composantes');
    /* Ordre : composantes → pointillés → vecteur (le vecteur est toujours au premier plan) */
    /* Composantes de OM plus épaisses (lw=3.5) pour rester visibles par-dessus axes et sol */
    if (showComp) _drawVecComponents(ctx, origin.cx, origin.cy, dx, dy, COL_VEC_POS, alpha, 3.5);
    if (showBoth) _drawCompDashes(ctx, origin.cx, origin.cy, dx, dy, COL_VEC_POS, alpha);
    if (showVec)  _drawVecArrow(ctx, origin.cx, origin.cy, dx, dy, COL_VEC_POS, '', alpha);
}

/* ─────────────────────────────────────────────────
   _drawVecArrow — flèche générique
   (cx,cy) = base, (dx,dy) = composantes en pixels
───────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────
   Composantes d'un vecteur : deux flèches orthogonales
   (une horizontale, une verticale) partant du même point.
   lw = épaisseur du trait (défaut 2, plus épais pour OM qui chevauche les axes)
───────────────────────────────────────────────── */
/* Composantes visuellement atténuées (opacité réduite + trait fin) pour se distinguer du vecteur. */
function _drawVecComponents(ctx, cx, cy, dxPx, dyPx, color, opacity, lw) {
    lw = lw || 2;
    var compOpacity = opacity * 0.55;
    var compLw      = Math.max(1.2, lw * 0.72);
    if (Math.abs(dxPx) > 2) _drawVecArrow(ctx, cx, cy, dxPx, 0, color, null, compOpacity, compLw);
    if (Math.abs(dyPx) > 2) _drawVecArrow(ctx, cx, cy, 0, dyPx, color, null, compOpacity, compLw);
}

/* Pointillés reliant les pointes des composantes à la pointe du vecteur (rectangle de décomposition). */
function _drawCompDashes(ctx, cx, cy, dxPx, dyPx, color, opacity) {
    if (Math.abs(dxPx) < 3 || Math.abs(dyPx) < 3) return;
    ctx.save();
    ctx.globalAlpha  = opacity * 0.40;
    ctx.strokeStyle  = color;
    ctx.lineWidth    = 1.2;
    ctx.setLineDash([4, 5]);
    ctx.lineCap      = 'round';
    /* Pointe x-comp → pointe vecteur (vertical) */
    ctx.beginPath();
    ctx.moveTo(cx + dxPx, cy);
    ctx.lineTo(cx + dxPx, cy + dyPx);
    ctx.stroke();
    /* Pointe y-comp → pointe vecteur (horizontal) */
    ctx.beginPath();
    ctx.moveTo(cx, cy + dyPx);
    ctx.lineTo(cx + dxPx, cy + dyPx);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

/* Dessine vecteur et/ou composantes selon vecDisplayMode pour v et a (base = point M). */
function _drawVecDispVA(ctx, cx, cy, dxPx, dyPx, color, label, opacity) {
    var showVec  = (vecDisplayMode === 'vecteur'     || vecDisplayMode === 'vecteur-composantes');
    var showComp = (vecDisplayMode === 'composantes' || vecDisplayMode === 'vecteur-composantes');
    var showBoth = (vecDisplayMode === 'vecteur-composantes');
    if (showComp) _drawVecComponents(ctx, cx, cy, dxPx, dyPx, color, opacity);
    if (showBoth) _drawCompDashes(ctx, cx, cy, dxPx, dyPx, color, opacity);
    if (showVec)  _drawVecArrow(ctx, cx, cy, dxPx, dyPx, color, label, opacity);
}

function _drawVecArrow(ctx, cx, cy, dx, dy, color, label, opacity, lw) {
    var len = Math.hypot(dx, dy);
    if (len < 3) return;
    lw = lw || 2;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.lineWidth   = lw;

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
   Points d'analyse épinglés — hover figé
───────────────────────────────────────────────── */
function _drawAnalysisPoints(ctx) {
    var allPins = sim.analysisPoints.slice();
    for (var ri = 0; ri < savedRuns.length; ri++) {
        if (!savedRuns[ri].hidden) {
            allPins = allPins.concat(savedRuns[ri].analysisPoints);
        }
    }
    for (var pi = 0; pi < allPins.length; pi++) {
        _drawAnimHover(ctx, allPins[pi], true);
    }
}

/* ─────────────────────────────────────────────────
   Hover animation canvas
───────────────────────────────────────────────── */
function _updateAnimHover(mouseX, mouseY) {
    var isChrono = (sim.displayMode === 'chrono');
    var datasets = [];

    if (isChrono) {
        if (sim.chronoSnaps.length > 0) {
            datasets.push({ data: sim.chronoSnaps, color: _currentRunColor || '#2a5080', runId: null });
        }
        for (var i = 0; i < savedRuns.length; i++) {
            if (!savedRuns[i].hidden && savedRuns[i].chronoSnaps.length > 0) {
                datasets.push({ data: savedRuns[i].chronoSnaps, color: savedRuns[i].color, runId: i });
            }
        }
    } else {
        if (sim.graphData.length >= 2) {
            datasets.push({ data: sim.graphData, color: _currentRunColor || '#2a5080', runId: null });
        }
        for (var i = 0; i < savedRuns.length; i++) {
            if (!savedRuns[i].hidden) datasets.push({ data: savedRuns[i].graphData, color: savedRuns[i].color, runId: i });
        }
    }

    var bestDist = Infinity, bestSnap = null;
    for (var di = 0; di < datasets.length; di++) {
        var pts = datasets[di].data;
        for (var k = 0; k < pts.length; k++) {
            var p = toCanvas(pts[k].x, pts[k].y);
            /* ignorer les points sous le sol (hors zone visible) */
            if (p.cy > groundY() + 10) continue;
            var d = Math.hypot(p.cx - mouseX, p.cy - mouseY);
            if (d < bestDist) {
                bestDist = d;
                bestSnap = { x: pts[k].x, y: pts[k].y,
                             vx: pts[k].vx, vy: pts[k].vy,
                             ax: pts[k].ax, ay: pts[k].ay,
                             t: pts[k].t, color: datasets[di].color,
                             runId: datasets[di].runId,
                             _cx: p.cx, _cy: p.cy };
            }
        }
    }
    _animHoverSnap = bestSnap;
}

/* Affiche les coordonnées d'un vecteur en notation mathématique :
   grande parenthèse avec deux lignes (ligne1 / ligne2)  */
/* Calcule les dimensions d'un label coordonnées (sans dessiner). */
function _measureVecLabel(ctx, vecName, line1, line2) {
    var fontSize = Math.max(15, Math.min(22, _animH * 0.045));
    var nameSize = Math.max(14, Math.min(20, _animH * 0.042));

    ctx.font = 'bold ' + fontSize + 'px "Segoe UI", Arial';
    var w1    = ctx.measureText(line1).width;
    var w2    = ctx.measureText(line2).width;
    var textW = Math.max(w1, w2);
    var lineH = fontSize * 1.45;
    var parenH = lineH * 2;
    var parenW = Math.max(7, fontSize * 0.38);
    var iPad   = 7;
    var blockW = parenW * 2 + iPad * 2 + textW;

    ctx.font = 'bold ' + nameSize + 'px "Segoe UI", Arial';
    var nameW      = ctx.measureText(vecName).width;
    var arrowExtra = Math.max(5, nameSize * 0.55);
    var nameColW   = nameW + 10;
    var nameColH   = arrowExtra + nameSize;

    return {
        fontSize: fontSize, nameSize: nameSize,
        textW: textW, lineH: lineH, parenH: parenH, parenW: parenW, iPad: iPad, blockW: blockW,
        nameW: nameW, arrowExtra: arrowExtra, nameColW: nameColW, nameColH: nameColH,
        totalW: nameColW + blockW,
        totalH: Math.max(parenH, nameColH)
    };
}

/* Retourne {lx, ly} : première position dans preferOrder qui :
   - tient dans le canvas (marge M),
   - est au-dessus du sol,
   - ne chevauche aucun rect dans placedRects [{lx,ly,w,h}]. */
function _bestLabelPos(anchorX, anchorY, totalW, totalH, preferOrder, placedRects) {
    var GAP  = 14;
    var M    = 5;
    var maxY = toCanvas(0, 0).cy - M;
    var maxX = _animW - M;

    var slots = {
        'right':       { lx: anchorX + GAP,           ly: anchorY - totalH / 2 },
        'left':        { lx: anchorX - totalW - GAP,  ly: anchorY - totalH / 2 },
        'above':       { lx: anchorX - totalW / 2,    ly: anchorY - totalH - GAP },
        'below':       { lx: anchorX - totalW / 2,    ly: anchorY + GAP },
        'upper-right': { lx: anchorX + GAP,           ly: anchorY - totalH - GAP },
        'upper-left':  { lx: anchorX - totalW - GAP,  ly: anchorY - totalH - GAP },
        'lower-right': { lx: anchorX + GAP,           ly: anchorY + GAP },
        'lower-left':  { lx: anchorX - totalW - GAP,  ly: anchorY + GAP }
    };

    function overlaps(lx, ly) {
        for (var j = 0; j < placedRects.length; j++) {
            var r = placedRects[j];
            if (lx < r.lx + r.w && lx + totalW > r.lx &&
                ly < r.ly + r.h && ly + totalH > r.ly) return true;
        }
        return false;
    }

    function fits(s) {
        return s.lx >= M && s.ly >= M &&
               s.lx + totalW <= maxX &&
               s.ly + totalH <= maxY &&
               !overlaps(s.lx, s.ly);
    }

    for (var i = 0; i < preferOrder.length; i++) {
        var s = slots[preferOrder[i]];
        if (s && fits(s)) return { lx: s.lx, ly: s.ly };
    }

    /* Repli : empilage vertical ancré sur la position du vecteur courant.
       On essaie d'abord à droite de l'ancre, puis à gauche.
       Pour chaque colonne x, on collecte les y candidats (au-dessus/en-dessous
       de chaque rect déjà placé qui chevauche cette colonne) et on prend le plus
       proche de l'ancre qui ne chevauche rien et reste dans les bornes. */
    var STACK_GAP  = 5;
    var xTries     = [anchorX + GAP, anchorX - totalW - GAP];

    for (var xi = 0; xi < xTries.length; xi++) {
        var stackLx = Math.max(M, Math.min(maxX - totalW, xTries[xi]));

        /* Positions y candidates : centrée sur l'ancre + au-dessus/en-dessous
           de chaque rect existant qui chevauche cette colonne x */
        var yTries = [anchorY - totalH / 2, anchorY - totalH - GAP, anchorY + GAP];
        for (var j = 0; j < placedRects.length; j++) {
            var r = placedRects[j];
            if (r.lx < stackLx + totalW && r.lx + r.w > stackLx) {
                yTries.push(r.ly + r.h + STACK_GAP);
                yTries.push(r.ly - totalH - STACK_GAP);
            }
        }
        /* Trier par proximité au centre de l'ancre */
        yTries.sort(function(a, b) {
            return Math.abs(a + totalH / 2 - anchorY) - Math.abs(b + totalH / 2 - anchorY);
        });

        for (var yi = 0; yi < yTries.length; yi++) {
            var stackLy = yTries[yi];
            if (stackLy >= M && stackLy + totalH <= maxY && !overlaps(stackLx, stackLy)) {
                return { lx: stackLx, ly: stackLy };
            }
        }
    }

    /* Dernier recours : clamp dur sans vérification de collision */
    var fb = slots[preferOrder[0]];
    return {
        lx: Math.max(M, Math.min(maxX - totalW, fb.lx)),
        ly: Math.max(M, Math.min(maxY - totalH, fb.ly))
    };
}

/* Dessine le label à la position (lx, ly) déjà calculée. */
function _renderVecLabel(ctx, lx, ly, m, vecName, line1, line2, color) {
    var nameCenterY = ly + m.totalH / 2;
    var nameTopY    = nameCenterY - m.nameColH / 2;
    var arrowMidY   = nameTopY + m.arrowExtra * 0.5;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.8;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    /* Flèche au-dessus du nom */
    ctx.beginPath();
    ctx.moveTo(lx,               arrowMidY);
    ctx.lineTo(lx + m.nameW,     arrowMidY);
    ctx.moveTo(lx + m.nameW - 5, arrowMidY - 3);
    ctx.lineTo(lx + m.nameW,     arrowMidY);
    ctx.lineTo(lx + m.nameW - 5, arrowMidY + 3);
    ctx.stroke();

    /* Nom */
    ctx.fillStyle    = color;
    ctx.font         = 'bold ' + m.nameSize + 'px "Segoe UI", Arial';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(vecName, lx, nameTopY + m.arrowExtra);

    /* Parenthèses */
    var bx  = lx + m.nameColW;
    var bly = ly + (m.totalH - m.parenH) / 2;

    ctx.lineWidth   = 2.5;
    ctx.strokeStyle = color;

    var lPx = bx + m.parenW;
    ctx.beginPath();
    ctx.moveTo(lPx, bly);
    ctx.bezierCurveTo(lPx - m.parenW * 1.3, bly + m.parenH * 0.18,
                      lPx - m.parenW * 1.3, bly + m.parenH * 0.82,
                      lPx, bly + m.parenH);
    ctx.stroke();

    var rPx = bx + m.parenW + m.iPad + m.textW + m.iPad;
    ctx.beginPath();
    ctx.moveTo(rPx, bly);
    ctx.bezierCurveTo(rPx + m.parenW * 1.3, bly + m.parenH * 0.18,
                      rPx + m.parenW * 1.3, bly + m.parenH * 0.82,
                      rPx, bly + m.parenH);
    ctx.stroke();

    /* Texte */
    ctx.fillStyle    = color;
    ctx.font         = 'bold ' + m.fontSize + 'px "Segoe UI", Arial';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(line1, bx + m.parenW + m.iPad, bly + m.lineH * 0.5);
    ctx.fillText(line2, bx + m.parenW + m.iPad, bly + m.lineH * 1.5);

    ctx.restore();
}

function _drawAnimHover(ctx, snap, isPinned) {
    var showPos    = isPinned ? pinShowVecPos    : sim.showVecPos;
    var showVit    = isPinned ? pinShowVecVit    : sim.showVecVit;
    var showAcc    = isPinned ? pinShowVecAcc    : sim.showVecAcc;
    var showForces = isPinned ? pinShowVecForces : sim.showVecForces;
    var showSumF   = isPinned ? pinShowVecSumF   : sim.showVecSumF;
    var showCoords = isPinned ? pinShowCoords    : hoverShowCoords;
    var p = toCanvas(snap.x, snap.y);

    /* ── Point survolé ── */
    ctx.save();
    ctx.fillStyle   = snap.color;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth   = 2;
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur  = 5;
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, 7, 0, 2 * Math.PI);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();
    ctx.restore();

    /* ── Prépare les labels à placer ── */
    var toPlace  = [];   /* { anchorX, anchorY, vecName, line1, line2, color, prefer } */
    var origin   = toCanvas(0, 0);

    if (showPos) {
        _drawVectorPos(ctx, snap.x, snap.y, 1.0);
        toPlace.push({
            anchorX: (origin.cx + p.cx) / 2,
            anchorY: (origin.cy + p.cy) / 2,
            vecName: 'OM',
            line1: 'x = ' + fmt(snap.x, 2) + ' m',
            line2: 'y = ' + fmt(snap.y, 2) + ' m',
            color:  COL_VEC_POS,
            prefer: ['lower-right', 'right', 'upper-right', 'lower-left', 'left', 'upper-left', 'above', 'below'],
            showCoords: showCoords
        });
    }
    if (showVit) {
        var dvx = snap.vx * VEC_SCALE_VIT;
        var dvy = -snap.vy * VEC_SCALE_VIT;
        _drawVecDispVA(ctx, p.cx, p.cy, dvx, dvy, COL_VEC_VIT, '', 1.0);
        var vPrefer = dvy <= 0
            ? ['above', 'upper-right', 'upper-left', 'right', 'left', 'lower-right', 'lower-left', 'below']
            : ['upper-right', 'upper-left', 'above', 'right', 'left', 'lower-right', 'lower-left', 'below'];
        toPlace.push({
            anchorX: p.cx + dvx / 2,
            anchorY: p.cy + dvy / 2,
            vecName: 'v',
            line1: 'vx = ' + fmt(snap.vx, 2) + ' m/s',
            line2: 'vy = ' + fmt(snap.vy, 2) + ' m/s',
            color:  COL_VEC_VIT,
            prefer: vPrefer,
            showCoords: showCoords
        });
    }
    if (showAcc) {
        var dax = snap.ax * VEC_SCALE_ACC;
        var day = -snap.ay * VEC_SCALE_ACC;
        _drawVecDispVA(ctx, p.cx, p.cy, dax, day, COL_VEC_ACC, '', 1.0);
        toPlace.push({
            anchorX: p.cx + dax / 2,
            anchorY: p.cy + day / 2,
            vecName: 'a',
            line1: 'ax = ' + fmt(snap.ax, 2) + ' m/s²',
            line2: 'ay = ' + fmt(snap.ay, 2) + ' m/s²',
            color:  COL_VEC_ACC,
            prefer: ['right', 'upper-right', 'left', 'upper-left', 'above', 'lower-right', 'lower-left', 'below'],
            showCoords: showCoords
        });
    }

    /* ── Place et dessine chaque label cinématique en évitant les collisions ── */
    var placedRects = [];
    for (var i = 0; i < toPlace.length; i++) {
        var lbl = toPlace[i];
        if (lbl.showCoords === false) {
            /* Juste la flèche + nom, sans bloc coordonnées */
            var fm = _measureForceName(ctx, lbl.vecName);
            var fpos = _bestLabelPos(lbl.anchorX, lbl.anchorY, fm.w, fm.h,
                lbl.prefer, placedRects);
            placedRects.push({ lx: fpos.lx, ly: fpos.ly, w: fm.w, h: fm.h });
            _renderForceName(ctx, fpos.lx, fpos.ly, lbl.vecName, lbl.color, 1.0, fm);
        } else {
            var m   = _measureVecLabel(ctx, lbl.vecName, lbl.line1, lbl.line2);
            var pos = _bestLabelPos(lbl.anchorX, lbl.anchorY, m.totalW, m.totalH, lbl.prefer, placedRects);
            placedRects.push({ lx: pos.lx, ly: pos.ly, w: m.totalW, h: m.totalH });
            _renderVecLabel(ctx, pos.lx, pos.ly, m, lbl.vecName, lbl.line1, lbl.line2, lbl.color);
        }
    }

    /* ── Forces (utilisent le contexte physique du point épinglé) ── */
    if (showForces || showSumF) {
        var ph = snap.phys || { mass: sim.mass, g: sim.g, windForce: sim.windForce, useFriction: sim.useFriction, k: sim.k };
        if (showForces) _drawForcesAt(ctx, p.cx, p.cy, snap.vx, snap.vy, 1.0, ph, placedRects);
        if (showSumF)   _drawSumFAt(ctx,   p.cx, p.cy, snap.vx, snap.vy, 1.0, ph, placedRects);
    }
}

/* ─────────────────────────────────────────────────
   Label nom de vecteur avec flèche au-dessus
   (version allégée sans bloc coordonnées)
───────────────────────────────────────────────── */
function _measureForceName(ctx, name) {
    var sz = Math.max(11, Math.min(14, _animH * 0.028));
    ctx.font = 'bold ' + sz + 'px "Segoe UI", Arial';
    var tw = ctx.measureText(name).width;
    var arrowH = Math.max(5, sz * 0.48);
    return { sz: sz, tw: tw, arrowH: arrowH, w: tw + 6, h: arrowH + 3 + sz };
}

function _renderForceName(ctx, lx, ly, name, color, opacity, m) {
    ctx.save();
    ctx.globalAlpha  = opacity * 0.92;
    ctx.strokeStyle  = color;
    ctx.fillStyle    = color;
    ctx.lineWidth    = 1.6;
    ctx.lineCap      = 'round';
    ctx.lineJoin     = 'round';

    var arrowY = ly + m.arrowH * 0.5;
    /* Flèche au-dessus */
    ctx.beginPath();
    ctx.moveTo(lx,           arrowY);
    ctx.lineTo(lx + m.tw,    arrowY);
    ctx.moveTo(lx + m.tw - 5, arrowY - 3);
    ctx.lineTo(lx + m.tw,    arrowY);
    ctx.lineTo(lx + m.tw - 5, arrowY + 3);
    ctx.stroke();

    /* Nom */
    ctx.font = 'bold ' + m.sz + 'px "Segoe UI", Arial';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(name, lx, ly + m.arrowH + 3);
    ctx.restore();
}

/* ─────────────────────────────────────────────────
   Forces : poids, vent, frottement, ΣF
   phys = {mass, g, windForce, useFriction, k}
   placedRects : tableau partagé anti-chevauchement
───────────────────────────────────────────────── */
function _drawForcesAt(ctx, cx, cy, vx, vy, opacity, phys, placedRects) {
    var forces = [];

    forces.push({ dx: 0, dy: phys.mass * phys.g * VEC_SCALE_FORCE, name: 'P' });

    if (Math.abs(phys.windForce) > 0.01) {
        forces.push({ dx: phys.windForce * VEC_SCALE_FORCE, dy: 0, name: 'Fv' });
    }

    if (phys.useFriction && (Math.abs(vx) > 0.01 || Math.abs(vy) > 0.01)) {
        forces.push({
            dx:  -phys.k * vx * VEC_SCALE_FORCE,
            dy:   phys.k * vy * VEC_SCALE_FORCE,
            name: 'f'
        });
    }

    /* Flèches d'abord */
    for (var i = 0; i < forces.length; i++) {
        _drawVecArrow(ctx, cx, cy, forces[i].dx, forces[i].dy, COL_VEC_FORCES, null, opacity);
    }

    /* Labels avec anti-chevauchement */
    var pref = ['right', 'upper-right', 'lower-right', 'left', 'upper-left', 'lower-left', 'above', 'below'];
    for (var i = 0; i < forces.length; i++) {
        var f = forces[i];
        var lm = _measureForceName(ctx, f.name);
        var pos = _bestLabelPos(cx + f.dx, cy + f.dy, lm.w, lm.h, pref, placedRects);
        placedRects.push({ lx: pos.lx, ly: pos.ly, w: lm.w, h: lm.h });
        _renderForceName(ctx, pos.lx, pos.ly, f.name, COL_VEC_FORCES, opacity, lm);
    }
}

function _drawSumFAt(ctx, cx, cy, vx, vy, opacity, phys, placedRects) {
    var SFx = phys.windForce - (phys.useFriction ? phys.k * vx : 0);
    var SFy = -phys.mass * phys.g - (phys.useFriction ? phys.k * vy : 0);
    var dxPx = SFx * VEC_SCALE_FORCE;
    var dyPx = -SFy * VEC_SCALE_FORCE;

    _drawVecArrow(ctx, cx, cy, dxPx, dyPx, COL_VEC_SUMF, null, opacity);

    var lm  = _measureForceName(ctx, 'ΣF');
    var pref = ['right', 'upper-right', 'lower-right', 'left', 'upper-left', 'lower-left', 'above', 'below'];
    var pos = _bestLabelPos(cx + dxPx, cy + dyPx, lm.w, lm.h, pref, placedRects);
    placedRects.push({ lx: pos.lx, ly: pos.ly, w: lm.w, h: lm.h });
    _renderForceName(ctx, pos.lx, pos.ly, 'ΣF', COL_VEC_SUMF, opacity, lm);
}

/* ─────────────────────────────────────────────────
   Légende des échelles vecteurs (coin bas-droite du ciel)
───────────────────────────────────────────────── */
function _drawVectorLegend(ctx) {
    var anyVec = sim.showVecPos || sim.showVecVit || sim.showVecAcc || sim.showVecForces || sim.showVecSumF;
    if (!anyVec) return;

    var fontSize = Math.max(9, Math.min(11, _animH * 0.024));
    var x0 = _animW - 12;
    var y0 = 20;
    var lineH = fontSize + 8;
    var items = [];

    if (sim.showVecPos)    items.push({color: COL_VEC_POS,    label: 'Position OM'});
    if (sim.showVecVit)    items.push({color: COL_VEC_VIT,    label: 'Vitesse (1 m/s = ' + VEC_SCALE_VIT + ' px)'});
    if (sim.showVecAcc)    items.push({color: COL_VEC_ACC,    label: 'Accel. (1 m/s² = ' + VEC_SCALE_ACC + ' px)'});
    if (sim.showVecForces) items.push({color: COL_VEC_FORCES, label: 'Forces (1 N = ' + VEC_SCALE_FORCE + ' px)'});
    if (sim.showVecSumF)   items.push({color: COL_VEC_SUMF,   label: 'ΣF (1 N = ' + VEC_SCALE_FORCE + ' px)'});

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
            var minAH = 80, minGH = 80;
            var dy = e.clientY - startY;
            /* Clamp dy pour que ni l'animation ni le graphe ne descende sous son minimum */
            dy = Math.max(dy, -(startAnimH - minAH));
            dy = Math.min(dy,   startGraphH - minGH);
            var newAH = startAnimH + dy;
            var newGH = startGraphH - dy;
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
            computeScale(_animW, _animH);
        }

        splitter.addEventListener('pointerup', endDrag);
        splitter.addEventListener('pointercancel', endDrag);
    });
})();
