/* ══════════════════════════════════════════════════
   Simulation pédagogique — Physique-Chimie Lycée
   Auteur  : Mathieu Berdous
   Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
══════════════════════════════════════════════════ */

/* draw.js — rendu canvas animation (champ de pesanteur) */

/* ── Image du ballon ── */
var _ballonImg = new Image();
_ballonImg.src = 'ballon.png';

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

/* Vecteurs plus visibles en mode armatures perpendiculaires à l'axe x
   (trait plus épais, opacité 1 — couleur et longueur inchangées).
   Seule la vitesse change aussi de couleur (rouge plus vif). */
var COL_VEC_POS_PERP    = COL_VEC_POS;
var COL_VEC_VIT_PERP    = '#ff1a1a';
var COL_VEC_ACC_PERP    = COL_VEC_ACC;
var COL_VEC_FORCES_PERP = COL_VEC_FORCES;
var COL_VEC_SUMF_PERP   = COL_VEC_SUMF;
var VEC_LW_PERP         = 3.5;
var VEC_VIT_LW_PERP     = VEC_LW_PERP;

/* Échelle forces : px par Newton */
var VEC_SCALE_FORCE = 12;

/* Mode d'affichage des vecteurs : 'vecteur' | 'composantes' | 'vecteur-composantes' */
var vecDisplayMode = 'vecteur';

/* ── Cache des angles de vue + origine animée (mis à jour une fois par frame dans drawAnim) ── */
var _viewAngles = { tx: 0, ty: 0, ox: 65, oy: 50 };

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
        if (activeTab === 'champ-electrique') { _updateAnimHoverE(cx, cy); }
        else { _updateAnimHover(cx, cy); }
    });
    _animCanvas.addEventListener('pointerleave', function() {
        _animHoverSnap = null;
        _animHoverSnapE = null;
    });

    _animCanvas.addEventListener('click', function() {
        if (activeTab === 'champ-electrique') { _handleClickE(); return; }
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

/* ── Angles de vue : interpolation ease-in-out entre les modes ── */
var _VIEW_TARGETS = {
    'oxy':    { tx: 0,             ty: 0 },
    'proj-x': { tx: Math.PI / 2,  ty: 0 },
    'proj-y': { tx: 0,             ty: Math.PI / 2 }
};
var _DUR_VIEW = 0.7; // secondes

/* Origine canvas cible pour chaque mode (dépend de la taille du canvas) */
function _targetOrigin(mode) {
    switch (mode) {
        case 'proj-x': return { ox: sim.originX,    oy: _animH / 2   };
        case 'proj-y': return { ox: _animW  / 2,    oy: sim.originY  };
        default:       return { ox: sim.originX,    oy: sim.originY  };
    }
}

function _updateViewAngles() {
    var tr = sim.viewTrans;
    if (!tr) {
        var tgt = _VIEW_TARGETS[sim.viewMode] || _VIEW_TARGETS['oxy'];
        var org = _targetOrigin(sim.viewMode);
        _viewAngles.tx = tgt.tx;
        _viewAngles.ty = tgt.ty;
        _viewAngles.ox = org.ox;
        _viewAngles.oy = org.oy;
        return;
    }
    var elapsed = Date.now() / 1000 - tr.startT;
    var t01 = Math.min(elapsed / _DUR_VIEW, 1);
    var ease = t01 < 0.5 ? 2 * t01 * t01 : -1 + (4 - 2 * t01) * t01;
    var from    = _VIEW_TARGETS[tr.fromMode] || _VIEW_TARGETS['oxy'];
    var to      = _VIEW_TARGETS[tr.toMode]   || _VIEW_TARGETS['oxy'];
    var fromOrg = _targetOrigin(tr.fromMode);
    var toOrg   = _targetOrigin(tr.toMode);
    _viewAngles.tx = from.tx + (to.tx - from.tx) * ease;
    _viewAngles.ty = from.ty + (to.ty - from.ty) * ease;
    _viewAngles.ox = fromOrg.ox + (toOrg.ox - fromOrg.ox) * ease;
    _viewAngles.oy = fromOrg.oy + (toOrg.oy - fromOrg.oy) * ease;
    if (t01 >= 1) {
        sim.viewTrans = null;
        sim.viewMode  = tr.toMode;
    }
}

/* Facteurs de projection pour les composantes de vecteurs en pixels */
function _viewProjFactors() {
    return { cx: Math.cos(_viewAngles.ty), cy: Math.cos(_viewAngles.tx) };
}

/* Déplacement canvas (px) d'un vecteur physique (vx, vy) pour le champ de
   pesanteur : la direction tient compte de la déformation des axes (repère
   "Adapté", sim.scaleX ≠ sim.scaleY) et de la vue courante (_viewProjFactors),
   pour rester tangent à la trajectoire ; la longueur reste schématique
   (indépendante de sim.scale), fixée par vecScale px par unité physique. */
function _vecCanvasDelta(vx, vy, vecScale) {
    var p = _viewProjFactors();
    var cvx = vx * p.cx * sim.scaleX, cvy = -vy * p.cy * sim.scaleY;
    var cm  = Math.hypot(cvx, cvy) || 1;
    var len = Math.hypot(vx, vy) * vecScale;
    return { dx: cvx * len / cm, dy: cvy * len / cm };
}

/* ── Conversion coordonnées physiques → canvas ── */
function toCanvas(px, py) {
    return {
        cx: _viewAngles.ox + px * Math.cos(_viewAngles.ty) * sim.scaleX,
        cy: _animH - _viewAngles.oy - py * Math.cos(_viewAngles.tx) * sim.scaleY
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

/* ── Position sol en pixels canvas (animée avec l'origine de vue) ── */
function groundY() {
    return _animH - _viewAngles.oy;
}

/* ─────────────────────────────────────────────────
   drawAnim — point d'entrée du rendu animation
───────────────────────────────────────────────── */
function drawAnim() {
    if (!_animCtx) return;
    var ctx = _animCtx;
    _updateViewAngles();
    ctx.clearRect(0, 0, _animW, _animH);

    _drawBackground(ctx);
    _drawGrid(ctx);
    _drawAxes(ctx);
    if (sim.showFieldG) _drawFieldG(ctx);

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
        if (_replaySessionActive) {
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
    _drawViewLabel(ctx);
    _drawAnalysisPoints(ctx);
    if (_animHoverSnap) _drawAnimHover(ctx, _animHoverSnap);
}

/* ─────────────────────────────────────────────────
   Fond : ciel + sol, avec horizon mobile pour la
   rotation caméra (proj-x = vue du dessus).
   L'horizon monte de groundY() vers 0 quand tx
   passe de 0 à π/2, révélant un sol en perspective.
───────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────
   Champ de pesanteur g — grille de vecteurs orange
───────────────────────────────────────────────── */
function _drawFieldG(ctx) {
    var gndY   = groundY();
    var topY   = 20;
    /* Même échelle que les vecteurs accélération (VEC_SCALE_ACC px par m/s²) */
    var vecLen = Math.max(8, sim.g * VEC_SCALE_ACC * _viewProjFactors().cy);
    vecLen = Math.min(vecLen, (gndY - topY - 28) * 0.45);
    var safeGndY = gndY - vecLen - 8;
    if (safeGndY <= topY) return;

    var rows = 2;
    var xLeft  = sim.originX + 15;
    var xRight = _animW - 15;
    var cols   = Math.max(3, Math.round((xRight - xLeft) / 75));
    var xStep  = (xRight - xLeft) / (cols - 1);

    var rowFracs = [0.28, 0.68];
    var COL = '#e67e22';
    var OPACITY = 0.55;

    ctx.save();
    ctx.globalAlpha = OPACITY;
    ctx.strokeStyle = COL;
    ctx.fillStyle   = COL;
    ctx.lineWidth   = 1.8;
    ctx.lineCap     = 'round';

    for (var r = 0; r < rows; r++) {
        var cy = topY + (safeGndY - topY) * rowFracs[r];
        for (var c = 0; c < cols; c++) {
            var cx = xLeft + c * xStep;
            /* Tige */
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx, cy + vecLen);
            ctx.stroke();
            /* Pointe de flèche */
            var ah = Math.max(6, vecLen * 0.22);
            ctx.beginPath();
            ctx.moveTo(cx - ah * 0.45, cy + vecLen - ah);
            ctx.lineTo(cx,             cy + vecLen);
            ctx.lineTo(cx + ah * 0.45, cy + vecLen - ah);
            ctx.stroke();
        }
    }
    ctx.restore();
}

function _drawBackground(ctx) {
    var gy = groundY();
    var tx = _viewAngles.tx;

    /* Ligne d'horizon réelle (monte quand la caméra se penche en avant) */
    var horizon_y = gy * Math.cos(tx);

    /* ── Sol (du haut du sol jusqu'en bas du canvas) ── */
    var floorTop = Math.min(horizon_y, gy);
    var floorGrad = ctx.createLinearGradient(0, floorTop, 0, _animH);
    floorGrad.addColorStop(0,   '#7aaa50');  // clair près de l'horizon (brume de sol)
    floorGrad.addColorStop(0.3, '#5a8a3a');
    floorGrad.addColorStop(1,   '#3a5a1a');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, floorTop, _animW, _animH - floorTop);

    /* ── Ciel (de 0 à l'horizon) — disparaît quand tx → π/2 ── */
    if (horizon_y > 2) {
        var skyGrad = ctx.createLinearGradient(0, 0, 0, horizon_y);
        skyGrad.addColorStop(0,   '#6aaad8');
        skyGrad.addColorStop(0.5, '#a8ccea');
        skyGrad.addColorStop(1,   '#cce0f4');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, _animW, horizon_y);
    }

    /* ── Ligne d'horizon / sol ── */
    ctx.strokeStyle = '#3a6a20';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, horizon_y);
    ctx.lineTo(_animW, horizon_y);
    ctx.stroke();

    /* ── Grille perspective sur le sol (pendant la rotation proj-x) ── */
    if (tx > 0.04) {
        _drawPerspectiveFloor(ctx, horizon_y, tx);
    }
}

/* Grille perspective convergeant vers le point de fuite à l'horizon */
function _drawPerspectiveFloor(ctx, horizon_y, tx) {
    var intensity = Math.sin(tx);          // 0→1 quand tx: 0→π/2
    var floor_h   = _animH - horizon_y;
    if (floor_h < 4) return;

    /* Point de fuite : centre de la zone de rendu, à l'horizon */
    var vp_x = _viewAngles.ox + (_animW - _viewAngles.ox) * 0.5;
    var vp_y = horizon_y;

    ctx.save();
    ctx.setLineDash([3, 7]);

    /* Lignes de profondeur (rayonnent depuis le point de fuite) */
    var nDepth = 14;
    for (var i = 0; i <= nDepth; i++) {
        var xBot = (i / nDepth) * _animW;
        ctx.globalAlpha = 0.28 * intensity;
        ctx.strokeStyle = '#4a7030';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(vp_x, vp_y);
        ctx.lineTo(xBot, _animH);
        ctx.stroke();
    }

    /* Lignes de largeur (horizontales, espacement en perspective) */
    var nWidth = 8;
    for (var j = 1; j <= nWidth; j++) {
        /* Espacement exponentiel : plus serré près de l'horizon */
        var t = 1 - Math.pow(1 - j / nWidth, 1.8);
        var y = vp_y + floor_h * t;
        ctx.globalAlpha = 0.22 * intensity;
        ctx.strokeStyle = '#4a7030';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(_animW, y);
        ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.restore();
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

    /* ── Facteurs de projection (grille comprimée pendant les transitions) ── */
    var _gcos_tx = Math.cos(_viewAngles.tx);  // comprime y
    var _gcos_ty = Math.cos(_viewAngles.ty);  // comprime x
    var _PROJ_THRESH = 0.08;

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
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 4]);

    /* Lignes verticales (axe x) — masquées si x comprimé */
    if (_gcos_ty >= _PROJ_THRESH) {
        /* En proj-x, les lignes passent en dessous de l'axe avec une coupure autour des labels */
        var _sinTx    = Math.sin(_viewAngles.tx);
        var _labelMid = gy0 + tickMajor + fontSize * 0.9;   // baseline du label
        var _gapTop   = _labelMid - fontSize * 0.85;         // début de la coupure
        var _gapBot   = _labelMid + fontSize * 0.25;         // fin de la coupure
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.38 * _gcos_ty).toFixed(2) + ')';
        for (var ix = 1; ix * xMinor <= xMaxPhy * 1.05; ix++) {
            var gxv = ix * xMinor;
            if (!isMultiple(gxv, xMajor)) continue;
            var p = toCanvas(gxv, 0);
            if (p.cx > xAxisCutoff) break;
            /* Segment principal : du haut jusqu'avant le label */
            var _lineBot = _sinTx > 0.02 ? _gapTop : gy0;
            ctx.beginPath(); ctx.moveTo(p.cx, 0); ctx.lineTo(p.cx, _lineBot); ctx.stroke();
            /* Segment inférieur : après le label jusqu'au bas du canvas */
            if (_sinTx > 0.02) {
                ctx.beginPath(); ctx.moveTo(p.cx, _gapBot); ctx.lineTo(p.cx, _animH); ctx.stroke();
            }
        }
    }
    /* Lignes horizontales (axe y) — masquées si y comprimé */
    if (_gcos_tx >= _PROJ_THRESH) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.38 * _gcos_tx).toFixed(2) + ')';
        for (var iy = 1; iy * yMinor <= yMaxPhy * 1.05; iy++) {
            var gyv = iy * yMinor;
            if (!isMultiple(gyv, yMajor)) continue;
            var p2 = toCanvas(0, gyv);
            if (p2.cy < yAxisEnd) break;
            ctx.beginPath(); ctx.moveTo(0, p2.cy); ctx.lineTo(_animW, p2.cy); ctx.stroke();
        }
    }
    ctx.setLineDash([]);

    /* ── Marques sur l'axe X (masquées si x comprimé) ── */
    if (_gcos_ty >= _PROJ_THRESH) {
        var _opX = Math.min(_gcos_ty, 1);
        for (var jx = 1; jx * xMinor <= xMaxPhy * 1.05; jx++) {
            var xv     = jx * xMinor;
            var isMajX = isMultiple(xv, xMajor);
            var pcx    = toCanvas(xv, 0);
            if (pcx.cx > xAxisCutoff) break;
            var tLen   = isMajX ? tickMajor : tickMinor;

            ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
            ctx.strokeStyle = 'rgba(255,255,255,' + ((isMajX ? 0.95 : 0.75) * _opX).toFixed(2) + ')';
            ctx.lineWidth   = isMajX ? 2 : 1.5;
            ctx.beginPath(); ctx.moveTo(pcx.cx, gy0 - tLen); ctx.lineTo(pcx.cx, gy0); ctx.stroke();

            if (isMajX) {
                ctx.font = 'bold ' + fontSize + 'px Segoe UI, Arial';
                ctx.textAlign = 'center';
                ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 4;
                ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
                ctx.fillStyle = 'rgba(255,255,255,' + (0.95 * _opX).toFixed(2) + ')';
                ctx.fillText(fmt(xv, xDec), pcx.cx, gy0 + tickMajor + fontSize * 0.9);
                ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
            }
        }
    }

    /* ── Marques sur l'axe Y (masquées si y comprimé) ── */
    if (_gcos_tx >= _PROJ_THRESH) {
        var _opY = Math.min(_gcos_tx, 1);
        var _yAxes = _splitActive()
            ? [{ ox: _phaseOx(1), side: 1 }, { ox: _phaseOx(-1), side: -1 }]
            : [{ ox: _viewAngles.ox, side: 1 }];

        for (var jy = 1; jy * yMinor <= yMaxPhy * 1.05; jy++) {
            var yv     = jy * yMinor;
            var isMajY = isMultiple(yv, yMajor);
            var pcy    = toCanvas(0, yv);
            if (pcy.cy < yAxisEnd) break;
            var tLenY  = isMajY ? tickMajor : tickMinor;

            ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
            ctx.strokeStyle = 'rgba(255,255,255,' + ((isMajY ? 0.95 : 0.75) * _opY).toFixed(2) + ')';
            ctx.lineWidth   = isMajY ? 2 : 1.5;

            for (var _ai = 0; _ai < _yAxes.length; _ai++) {
                var _ax = _yAxes[_ai];
                /* Tick : vers l'intérieur du graphe (droite pour axe gauche, gauche pour axe droit) */
                var _tDir = _ax.side; // +1 → tick vers la droite, -1 → tick vers la gauche
                ctx.beginPath();
                ctx.moveTo(_ax.ox, pcy.cy);
                ctx.lineTo(_ax.ox + tLenY * _tDir, pcy.cy);
                ctx.stroke();

                if (isMajY) {
                    ctx.font = 'bold ' + fontSize + 'px Segoe UI, Arial';
                    /* Label : à l'extérieur de l'axe (opposé au tick) */
                    ctx.textAlign = _tDir > 0 ? 'right' : 'left';
                    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 4;
                    ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
                    ctx.fillStyle = 'rgba(255,255,255,' + (0.95 * _opY).toFixed(2) + ')';
                    var _labelX = _tDir > 0
                        ? _ax.ox - tickMajor - 3
                        : _ax.ox + tickMajor + 3;
                    ctx.fillText(fmt(yv, yDec), _labelX, pcy.cy + fontSize * 0.35);
                    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
                }
            }
        }
    }

    ctx.restore();
}

/* ─────────────────────────────────────────────────
   Axes x et y avec flèches + contour noir
───────────────────────────────────────────────── */

function _drawAxes(ctx) {
    var origin   = toCanvas(0, 0);
    var fontSize = Math.max(14, Math.min(20, _animH * 0.041));
    var ag   = _axisGeom();
    var aLen = ag.aLen;
    var xEnd = ag.xEnd;
    var yEnd = ag.yEnd;

    var cos_tx = Math.cos(_viewAngles.tx);  // 1 = y visible, 0 = y dans l'écran
    var cos_ty = Math.cos(_viewAngles.ty);  // 1 = x visible, 0 = x dans l'écran
    var THRESH = 0.08;

    ctx.save();

    ctx.shadowColor   = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur    = 3;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.lineWidth     = 2;

    /* ── Axe X (visible tant que cos_ty > THRESH) ── */
    if (cos_ty >= THRESH) {
        var opX = Math.min(cos_ty, 1);
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.92 * opX).toFixed(2) + ')';
        ctx.fillStyle   = 'rgba(255,255,255,' + (0.92 * opX).toFixed(2) + ')';
        ctx.beginPath(); ctx.moveTo(_viewAngles.ox - 5, origin.cy); ctx.lineTo(xEnd, origin.cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xEnd, origin.cy); ctx.lineTo(xEnd - aLen, origin.cy - 4); ctx.lineTo(xEnd - aLen, origin.cy + 4); ctx.closePath(); ctx.fill();
    }

    /* ── Axe Y (visible tant que cos_tx > THRESH) ── */
    if (cos_tx >= THRESH) {
        var opY = Math.min(cos_tx, 1);
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.92 * opY).toFixed(2) + ')';
        ctx.fillStyle   = 'rgba(255,255,255,' + (0.92 * opY).toFixed(2) + ')';
        if (_splitActive()) {
            /* Deux axes Y : montée (gauche) + descente (droite) */
            var oxL = _phaseOx(1), oxR = _phaseOx(-1);
            var gy  = groundY();
            [oxL, oxR].forEach(function(ox) {
                ctx.beginPath(); ctx.moveTo(ox, gy + 5); ctx.lineTo(ox, yEnd); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(ox, yEnd); ctx.lineTo(ox - 4, yEnd + aLen); ctx.lineTo(ox + 4, yEnd + aLen); ctx.closePath(); ctx.fill();
            });
        } else {
            ctx.beginPath(); ctx.moveTo(origin.cx, groundY() + 5); ctx.lineTo(origin.cx, yEnd); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(origin.cx, yEnd); ctx.lineTo(origin.cx - 4, yEnd + aLen); ctx.lineTo(origin.cx + 4, yEnd + aLen); ctx.closePath(); ctx.fill();
        }
    }

    /* ── Labels ── */
    var tickMajorRef = Math.max(6,  _animH * 0.014);
    var fontSizeGrid = Math.max(11, Math.min(16, _animH * 0.032));
    ctx.font          = 'bold ' + fontSize + 'px Segoe UI, Arial';
    ctx.shadowColor   = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur    = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    /* Label x */
    if (cos_ty >= THRESH) {
        ctx.fillStyle    = 'rgba(255,255,255,' + (0.95 * Math.min(cos_ty, 1)).toFixed(2) + ')';
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('x (m)', xEnd, origin.cy + tickMajorRef + fontSizeGrid * 0.9);
    }

    /* Label O */
    ctx.fillStyle    = 'rgba(255,255,255,0.95)';
    if (_splitActive()) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillText('O', _phaseOx(1),  origin.cy + fontSize + 2);
        ctx.fillText('O', _phaseOx(-1), origin.cy + fontSize + 2);
    } else {
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('O', origin.cx - 6, origin.cy + fontSize + 2);
    }

    /* Label y / labels "Montée" "Descente" */
    if (cos_tx >= THRESH) {
        ctx.fillStyle    = 'rgba(255,255,255,' + (0.95 * Math.min(cos_tx, 1)).toFixed(2) + ')';
        ctx.textBaseline = 'top';
        if (_splitActive()) {
            var smallFs = Math.max(10, Math.min(13, _animH * 0.027));
            ctx.font      = 'bold ' + smallFs + 'px Segoe UI, Arial';
            ctx.textAlign = 'center';
            ctx.fillText('↑ Montée',   _phaseOx(1),  yEnd + aLen + 3);
            ctx.fillText('↓ Descente', _phaseOx(-1), yEnd + aLen + 3);
        } else {
            ctx.textAlign = 'right';
            ctx.fillText('y (m)', origin.cx - 6, yEnd + aLen + 3);
        }
    }

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

    /* Points à parcourir (graphData en replay, trajPoints sinon) */
    var usePts   = _replaySessionActive || _splitActive();
    var pts      = usePts ? run.graphData : null;
    var cutIdx   = pts ? pts.length : 0;
    if (_replaySessionActive && pts) {
        for (var k = 0; k < pts.length; k++) { if (pts[k].t > _replayT) { cutIdx = k; break; } }
        if (cutIdx < 2) { ctx.restore(); return; }
    }

    if (_splitActive() && pts) {
        /* Trouver le sommet dans graphData */
        var peakIdx = 0;
        var lim = _replaySessionActive ? cutIdx : pts.length;
        for (var k = 1; k < lim; k++) { if (pts[k].y > pts[peakIdx].y) peakIdx = k; }
        /* Montée */
        var oxUp = _phaseOx(1);
        ctx.beginPath();
        for (var i = 0; i <= peakIdx; i++) {
            var q = toCanvas(pts[i].x, pts[i].y);
            i === 0 ? ctx.moveTo(oxUp, q.cy) : ctx.lineTo(oxUp, q.cy);
        }
        ctx.stroke();
        /* Descente */
        if (peakIdx < lim - 1) {
            var oxDn = _phaseOx(-1);
            ctx.beginPath();
            for (var j = peakIdx; j < lim; j++) {
                var q2 = toCanvas(pts[j].x, pts[j].y);
                j === peakIdx ? ctx.moveTo(oxDn, q2.cy) : ctx.lineTo(oxDn, q2.cy);
            }
            ctx.stroke();
        }
    } else {
        ctx.beginPath();
        if (_replaySessionActive) {
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
    }

    ctx.restore();
}

function _drawSavedChronoSnaps(ctx, run) {
    var snaps = run.chronoSnaps;
    if (snaps.length === 0) return;
    for (var i = 0; i < snaps.length; i++) {
        var s = snaps[i];
        if (_replaySessionActive && s.t > _replayT) break;
        var p = _toCanvasSplit(s.x, s.y, s.vy);
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
        if (run.showVecVit) {
            var _dV = _vecCanvasDelta(s.vx, s.vy, VEC_SCALE_VIT);
            _drawVecDispVA(ctx, p.cx, p.cy, _dV.dx, _dV.dy, COL_VEC_VIT, null, 0.42);
        }
        if (run.showVecAcc) {
            var _dA = _vecCanvasDelta(s.ax, s.ay, VEC_SCALE_ACC);
            _drawVecDispVA(ctx, p.cx, p.cy, _dA.dx, _dA.dy, COL_VEC_ACC, null, 0.42);
        }
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
        var vyInterp = d0.vy + alpha * (d1.vy - d0.vy);
    } else {
        x = d0.x; y = d0.y;
        var vyInterp = d0.vy;
    }

    var p = _toCanvasSplit(x, y, vyInterp);
    var r = Math.max(7, Math.min(13, Math.min(sim.scaleX, sim.scaleY) * 0.55));

    ctx.save();

    if (_ballonImg.complete && _ballonImg.naturalWidth > 0) {
        var d = r * 2;
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur  = 5;
        ctx.drawImage(_ballonImg, p.cx - r, p.cy - r, d, d);
        ctx.shadowBlur  = 0;
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, r, 0, 2 * Math.PI);
        ctx.strokeStyle = run.color;
        ctx.lineWidth   = 1.8;
        ctx.stroke();
    } else {
        /* Corps blanc (repli tant que l'image charge) */
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, r, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur  = 5;
        ctx.fill();
        ctx.shadowBlur  = 0;
        ctx.strokeStyle = run.color;
        ctx.lineWidth   = 1.8;
        ctx.stroke();
    }

    ctx.restore();
}

/* Rejoue une particule (pas le ballon de pesanteur) pour une run électrique sauvegardée */
function _drawSavedBallE(ctx, run) {
    var pts = run.graphData;
    if (pts.length === 0) return;

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
    var r = Math.max(5, Math.min(10, 6));
    var charge = run.q < 0 ? '−' : '+';
    var color  = run.q < 0 ? '#4a90d9' : '#e06060';

    ctx.save();
    ctx.beginPath(); ctx.arc(p.cx, p.cy, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.30)'; ctx.shadowBlur = 5;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.max(10, r * 1.3) + 'px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(charge, p.cx, p.cy);
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

    if (_splitActive()) {
        /* Trouver l'index du sommet (y max) */
        var peakIdx = 0;
        for (var k = 1; k < sim.trajPoints.length; k++) {
            if (sim.trajPoints[k].y > sim.trajPoints[peakIdx].y) peakIdx = k;
        }
        /* Segment montée */
        var oxUp = _phaseOx(1);
        ctx.beginPath();
        for (var i = 0; i <= peakIdx; i++) {
            var q = toCanvas(sim.trajPoints[i].x, sim.trajPoints[i].y);
            i === 0 ? ctx.moveTo(oxUp, q.cy) : ctx.lineTo(oxUp, q.cy);
        }
        ctx.stroke();
        /* Segment descente */
        if (peakIdx < sim.trajPoints.length - 1) {
            var oxDn = _phaseOx(-1);
            ctx.beginPath();
            for (var j = peakIdx; j < sim.trajPoints.length; j++) {
                var q2 = toCanvas(sim.trajPoints[j].x, sim.trajPoints[j].y);
                j === peakIdx ? ctx.moveTo(oxDn, q2.cy) : ctx.lineTo(oxDn, q2.cy);
            }
            ctx.stroke();
        }
    } else {
        ctx.beginPath();
        var p0 = toCanvas(sim.trajPoints[0].x, sim.trajPoints[0].y);
        ctx.moveTo(p0.cx, p0.cy);
        for (var i = 1; i < sim.trajPoints.length; i++) {
            var p = toCanvas(sim.trajPoints[i].x, sim.trajPoints[i].y);
            ctx.lineTo(p.cx, p.cy);
        }
        ctx.stroke();
    }
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
        var p = _toCanvasSplit(s.x, s.y, s.vy);

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
            var _dV = _vecCanvasDelta(s.vx, s.vy, VEC_SCALE_VIT);
            _drawVecDispVA(ctx, p.cx, p.cy, _dV.dx, _dV.dy, COL_VEC_VIT, null, 0.6);
        }
        if (sim.showVecAcc) {
            var _dA = _vecCanvasDelta(s.ax, s.ay, VEC_SCALE_ACC);
            _drawVecDispVA(ctx, p.cx, p.cy, _dA.dx, _dA.dy, COL_VEC_ACC, null, 0.6);
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
    var p = _toCanvasSplit(sim.x, sim.y, sim.vy);
    var r = Math.max(7, Math.min(13, Math.min(sim.scaleX, sim.scaleY) * 0.55));

    ctx.save();

    if (_ballonImg.complete && _ballonImg.naturalWidth > 0) {
        var d = r * 2;
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur  = 5;
        ctx.drawImage(_ballonImg, p.cx - r, p.cy - r, d, d);
        ctx.shadowBlur  = 0;
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, r, 0, 2 * Math.PI);
        ctx.strokeStyle = _currentRunColor || '#000';
        ctx.lineWidth   = 1.8;
        ctx.stroke();
    } else {
        /* Corps blanc (repli tant que l'image charge) */
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, r, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur  = 5;
        ctx.fill();
        ctx.shadowBlur  = 0;
        ctx.strokeStyle = _currentRunColor || '#333';
        ctx.lineWidth   = 1.8;
        ctx.stroke();
    }

    ctx.restore();

    /* Vecteurs sur la balle courante */
    if (sim.showVecPos) _drawVectorPos(ctx, sim.x, sim.y, 1.0);
    if (sim.showVecVit) {
        var _dV = _vecCanvasDelta(sim.vx, sim.vy, VEC_SCALE_VIT);
        _drawVecDispVA(ctx, p.cx, p.cy, _dV.dx, _dV.dy, COL_VEC_VIT, null, 1.0);
    }
    if (sim.showVecAcc) {
        var _dA = _vecCanvasDelta(sim.ax, sim.ay, VEC_SCALE_ACC);
        _drawVecDispVA(ctx, p.cx, p.cy, _dA.dx, _dA.dy, COL_VEC_ACC, null, 1.0);
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
    var _posPerp = sim.armatureMode === 'perp-x';
    var _col     = _posPerp ? COL_VEC_POS_PERP : COL_VEC_POS;
    var _a       = _posPerp ? 1.0 : alpha;
    var _lw      = _posPerp ? VEC_LW_PERP : 3.5;
    /* Ordre : composantes → pointillés → vecteur (le vecteur est toujours au premier plan) */
    /* Composantes de OM plus épaisses (lw=3.5, plus en mode perp-x) pour rester visibles */
    if (showComp) _drawVecComponents(ctx, origin.cx, origin.cy, dx, dy, _col, _a, _lw);
    if (showBoth) _drawCompDashes(ctx, origin.cx, origin.cy, dx, dy, _col, _a);
    if (showVec)  _drawVecArrow(ctx, origin.cx, origin.cy, dx, dy, _col, '', _a, _posPerp ? VEC_LW_PERP : undefined);
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
function _drawVecDispVA(ctx, cx, cy, dxPx, dyPx, color, label, opacity, lw) {
    var showVec  = (vecDisplayMode === 'vecteur'     || vecDisplayMode === 'vecteur-composantes');
    var showComp = (vecDisplayMode === 'composantes' || vecDisplayMode === 'vecteur-composantes');
    var showBoth = (vecDisplayMode === 'vecteur-composantes');
    if (showComp) _drawVecComponents(ctx, cx, cy, dxPx, dyPx, color, opacity);
    if (showBoth) _drawCompDashes(ctx, cx, cy, dxPx, dyPx, color, opacity);
    if (showVec)  _drawVecArrow(ctx, cx, cy, dxPx, dyPx, color, label, opacity, lw);
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
    var aLen  = Math.min(12, len * 0.4);
    var angle = Math.atan2(dy, dx);

    /* Corps : s'arrête à la base de la pointe pour que le bout épais du trait
       ne dépasse pas de la pointe (visible surtout avec un lineWidth élevé) */
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex - aLen * 0.85 * Math.cos(angle), ey - aLen * 0.85 * Math.sin(angle));
    ctx.stroke();

    /* Pointe */
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
    if (activeTab === 'champ-electrique') { _updateAnimHoverE(mouseX, mouseY); return; }
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
            var p = _toCanvasSplit(pts[k].x, pts[k].y, pts[k].vy || 0);
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
var _labelMaxY = null; // null = auto (ground), number = override

function _bestLabelPos(anchorX, anchorY, totalW, totalH, preferOrder, placedRects) {
    var GAP  = 14;
    var M    = 5;
    var maxY = (_labelMaxY !== null) ? _labelMaxY : toCanvas(0, 0).cy - M;
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
    var p = _toCanvasSplit(snap.x, snap.y, snap.vy || 0);
    /* Un point épinglé qui sort du cadre (zoom) ne doit plus être affiché,
       ni lui ni ses étiquettes. */
    if (isPinned && (p.cx < 0 || p.cx > _animW || p.cy < 0 || p.cy > _animH)) return;

    var showPos    = isPinned ? pinShowVecPos    : sim.showVecPos;
    var showVit    = isPinned ? pinShowVecVit    : sim.showVecVit;
    var showAcc    = isPinned ? pinShowVecAcc    : sim.showVecAcc;
    var showForces = isPinned ? pinShowVecForces : sim.showVecForces;
    var showSumF   = isPinned ? pinShowVecSumF   : sim.showVecSumF;
    var showCoords = isPinned ? pinShowCoords    : hoverShowCoords;

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
            color:  sim.armatureMode === 'perp-x' ? COL_VEC_POS_PERP : COL_VEC_POS,
            prefer: ['lower-right', 'right', 'upper-right', 'lower-left', 'left', 'upper-left', 'above', 'below'],
            showCoords: showCoords
        });
    }
    if (showVit) {
        var _vscV = _vecScaleVitOverride !== null ? _vecScaleVitOverride : VEC_SCALE_VIT;
        var dvx, dvy;
        if (_vecScaleVitOverride !== null) {
            /* Mode électrique : direction alignée sur le canvas pour la tangence */
            var _cvxV = snap.vx * sim.scaleX, _cvyV = -snap.vy * sim.scaleY;
            var _cmV = Math.hypot(_cvxV, _cvyV) || 1;
            var _lenV = Math.hypot(snap.vx, snap.vy) * _vscV;
            dvx = _cvxV * _lenV / _cmV; dvy = _cvyV * _lenV / _cmV;
        } else {
            var _dV = _vecCanvasDelta(snap.vx, snap.vy, _vscV);
            dvx = _dV.dx; dvy = _dV.dy;
        }
        var _vitPerp = _vecScaleVitOverride !== null && sim.armatureMode === 'perp-x';
        var _colVit  = _vitPerp ? COL_VEC_VIT_PERP : COL_VEC_VIT;
        _drawVecDispVA(ctx, p.cx, p.cy, dvx, dvy, _colVit, '', 1.0, _vitPerp ? VEC_VIT_LW_PERP : undefined);
        var vPrefer = dvy <= 0
            ? ['above', 'upper-right', 'upper-left', 'right', 'left', 'lower-right', 'lower-left', 'below']
            : ['upper-right', 'upper-left', 'above', 'right', 'left', 'lower-right', 'lower-left', 'below'];
        toPlace.push({
            anchorX: p.cx + dvx / 2,
            anchorY: p.cy + dvy / 2,
            vecName: 'v',
            line1: 'vx = ' + (_vecScaleVitOverride !== null ? fmtSci(snap.vx, 3) : fmt(snap.vx, 2)) + ' m/s',
            line2: 'vy = ' + (_vecScaleVitOverride !== null ? fmtSci(snap.vy, 3) : fmt(snap.vy, 2)) + ' m/s',
            color:  _colVit,
            prefer: vPrefer,
            showCoords: showCoords
        });
    }
    if (showAcc) {
        var _vscA = _vecScaleAccOverride !== null ? _vecScaleAccOverride : VEC_SCALE_ACC;
        var dax, day;
        if (_vecScaleAccOverride !== null) {
            var _cvxA = snap.ax * sim.scaleX, _cvyA = -snap.ay * sim.scaleY;
            var _cmA = Math.hypot(_cvxA, _cvyA) || 1;
            var _lenA = Math.hypot(snap.ax, snap.ay) * _vscA;
            dax = _cvxA * _lenA / _cmA; day = _cvyA * _lenA / _cmA;
        } else {
            var _dA = _vecCanvasDelta(snap.ax, snap.ay, _vscA);
            dax = _dA.dx; day = _dA.dy;
        }
        var _accPerp = _vecScaleAccOverride !== null && sim.armatureMode === 'perp-x';
        var _colAcc  = _accPerp ? COL_VEC_ACC_PERP : COL_VEC_ACC;
        if (snap.ax !== 0 || snap.ay !== 0) {
            _drawVecDispVA(ctx, p.cx, p.cy, dax, day, _colAcc, '', 1.0, _accPerp ? VEC_LW_PERP : undefined);
            toPlace.push({
                anchorX: p.cx + dax / 2,
                anchorY: p.cy + day / 2,
                vecName: 'a',
                line1: 'ax = ' + (_vecScaleAccOverride !== null ? fmtSci(snap.ax, 3) : fmt(snap.ax, 2)) + ' m/s²',
                line2: 'ay = ' + (_vecScaleAccOverride !== null ? fmtSci(snap.ay, 3) : fmt(snap.ay, 2)) + ' m/s²',
                color:  _colAcc,
                prefer: ['right', 'upper-right', 'left', 'upper-left', 'above', 'lower-right', 'lower-left', 'below'],
                showCoords: showCoords
            });
        }
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
        if (_vecScaleVitOverride !== null) {
            /* Mode électrique : force électrique FE, pas le poids */
            var phE = snap.phys || _getEPhys(snap.x, snap.y);
            if (showForces) _drawForcesAtE(ctx, p.cx, p.cy, snap.vx, snap.vy, 1.0, phE, placedRects);
            if (showSumF)   _drawSumFAtE(ctx,   p.cx, p.cy, snap.vx, snap.vy, 1.0, phE, placedRects);
        } else {
            var ph = snap.phys || { mass: sim.mass, g: sim.g, windForce: sim.windForce, useFriction: sim.useFriction, k: sim.k };
            if (showForces) _drawForcesAt(ctx, p.cx, p.cy, snap.vx, snap.vy, 1.0, ph, placedRects);
            if (showSumF)   _drawSumFAt(ctx,   p.cx, p.cy, snap.vx, snap.vy, 1.0, ph, placedRects);
        }
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

    var _fvp = _viewProjFactors();
    forces.push({ dx: 0, dy: phys.mass * phys.g * VEC_SCALE_FORCE * _fvp.cy, name: 'P' });

    if (Math.abs(phys.windForce) > 0.01) {
        forces.push({ dx: phys.windForce * VEC_SCALE_FORCE * _fvp.cx, dy: 0, name: 'Fv' });
    }

    if (phys.useFriction && (Math.abs(vx) > 0.01 || Math.abs(vy) > 0.01)) {
        forces.push({
            dx:  -phys.k * vx * VEC_SCALE_FORCE * _fvp.cx,
            dy:   phys.k * vy * VEC_SCALE_FORCE * _fvp.cy,
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
    var _sfvp = _viewProjFactors();
    var SFx = phys.windForce - (phys.useFriction ? phys.k * vx : 0);
    var SFy = -phys.mass * phys.g - (phys.useFriction ? phys.k * vy : 0);
    var dxPx = SFx * VEC_SCALE_FORCE * _sfvp.cx;
    var dyPx = -SFy * VEC_SCALE_FORCE * _sfvp.cy;

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
/* ── Helpers split montée/descente (proj-y) ── */
function _splitActive() {
    return sim.splitPhase && _viewAngles.ty > Math.PI / 2 - 0.15;
}
function _splitOffset() {
    return Math.min(110, (_animW - sim.originX) * 0.35);
}
/* cx selon la phase : vy >= 0 → montée (gauche), vy < 0 → descente (droite) */
function _phaseOx(vy) {
    if (!_splitActive()) return _viewAngles.ox;
    var off = _splitOffset();
    return vy >= 0 ? _viewAngles.ox - off : _viewAngles.ox + off;
}
/* toCanvas adapté phase */
function _toCanvasSplit(px, py, vy) {
    var p = toCanvas(px, py);
    if (_splitActive()) p.cx = _phaseOx(vy);
    return p;
}

/* ── Label de vue projection (haut-gauche du canvas) ── */
function _drawViewLabel(ctx) {
    var tx = _viewAngles.tx, ty = _viewAngles.ty;
    var maxAngle = Math.max(tx, ty);
    if (maxAngle < 0.01) {
        var btn0 = document.getElementById('btn-split-phase');
        if (btn0) btn0.style.display = 'none';
        return;
    }
    var opacity   = maxAngle / (Math.PI / 2);
    var isProj_y  = ty > tx;
    var label     = isProj_y ? 'Vue de face' : 'Vue du dessus';
    var fontSize  = Math.max(12, Math.min(16, _animH * 0.033));

    ctx.save();
    ctx.globalAlpha   = opacity * 0.9;
    ctx.font          = 'bold ' + fontSize + 'px Segoe UI, Arial';
    ctx.textAlign     = 'left';
    ctx.textBaseline  = 'top';
    ctx.shadowColor   = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur    = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, _viewAngles.ox + 4, 6);

    /* Mesure la largeur du label ICI (avant restore) pour positionner le bouton */
    var labelW = ctx.measureText(label).width;
    ctx.restore();

    /* Bouton "Séparer la phase de descente" — uniquement en proj-y */
    var btn = document.getElementById('btn-split-phase');
    if (btn) {
        if (isProj_y && ty > Math.PI / 4) {
            var canvas = document.getElementById('anim-canvas');
            var scaleX = canvas ? (canvas.offsetWidth / _animW) : 1;
            var leftPx = (_viewAngles.ox + 4 + labelW + 10) * scaleX;
            btn.style.display = 'block';
            btn.style.opacity = Math.min(1, (ty - Math.PI / 4) / (Math.PI / 4)).toFixed(2);
            btn.style.left    = Math.round(leftPx) + 'px';
        } else {
            btn.style.display = 'none';
        }
    }
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
            computeScaleE(_animW, _animH);
        }

        splitter.addEventListener('pointerup', endDrag);
        splitter.addEventListener('pointercancel', endDrag);
    });
})();

/* ══════════════════════════════════════════════════
   CHAMP ÉLECTRIQUE — fonctions de rendu
══════════════════════════════════════════════════ */

var _animHoverSnapE = null;
var _replayPlayingE       = false;
var _replaySessionActiveE = false;
var _replayTE       = 0;
var _replayMaxTE    = 0;

/* Overrides d'échelle pour le mode électrique (null = utiliser constantes globales) */
var _vecScaleVitOverride = null;
var _vecScaleAccOverride = null;

function _drawBackgroundE(ctx) {
    var grad = ctx.createLinearGradient(0, 0, 0, _animH);
    grad.addColorStop(0,   '#eef2f7');
    grad.addColorStop(0.5, '#e4eaf2');
    grad.addColorStop(1,   '#eef2f7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, _animW, _animH);
}

function _drawGridE(ctx) {
    if (sim.scaleX < 1 && sim.scaleY < 1) return;
    /* Bornes des graduations x/y fixées sur la plage logique (écran de détection / ±yMax),
       pas sur la marge visuelle du canvas */
    var xGridMax = _effXMaxE(sim);
    var yGridMax = _effYMaxE(sim);
    var xGrid = _niceGridStep(xGridMax, 6);
    var yGrid = _niceGridStep(yGridMax, 4);
    var xDec  = _gridDec(xGrid.major);
    var yDec  = _gridDec(yGrid.major);
    var fontSize = Math.max(11, Math.min(15, _animH * 0.030));
    var tickLen = Math.max(5, _animH * 0.012);
    var orig = toCanvas(0, 0);

    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    for (var ix = 1; ix * xGrid.minor <= xGridMax * 1.001; ix++) {
        var gx = toCanvas(ix * xGrid.minor, 0).cx;
        if (gx > _animW - 5) break;
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, _animH); ctx.stroke();
    }
    for (var iy = 1; iy * yGrid.minor <= yGridMax * 1.001; iy++) {
        var gyP = toCanvas(0,  iy * yGrid.minor).cy;
        var gyN = toCanvas(0, -iy * yGrid.minor).cy;
        if (gyP >= 5)          { ctx.beginPath(); ctx.moveTo(0, gyP); ctx.lineTo(_animW, gyP); ctx.stroke(); }
        if (gyN <= _animH - 5) { ctx.beginPath(); ctx.moveTo(0, gyN); ctx.lineTo(_animW, gyN); ctx.stroke(); }
    }

    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(60,60,60,0.72)';
    ctx.font = fontSize + 'px Segoe UI, Arial';

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (var jx = 1; jx * xGrid.minor <= xGridMax * 1.001; jx++) {
        var xv = jx * xGrid.minor;
        var isMaj = Math.abs(xv / xGrid.major - Math.round(xv / xGrid.major)) < 0.001;
        var gx2 = toCanvas(xv, 0).cx;
        if (gx2 > _animW - 5) break;
        ctx.strokeStyle = 'rgba(60,60,60,' + (isMaj ? '0.45' : '0.22') + ')';
        ctx.lineWidth = isMaj ? 1.4 : 0.8;
        ctx.beginPath(); ctx.moveTo(gx2, orig.cy - tickLen); ctx.lineTo(gx2, orig.cy + tickLen); ctx.stroke();
        if (isMaj) ctx.fillText(fmt(xv, xDec), gx2, orig.cy + tickLen + 2);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var jy = 1; jy * yGrid.minor <= yGridMax * 1.001; jy++) {
        var yv = jy * yGrid.minor;
        var isMaj2 = Math.abs(yv / yGrid.major - Math.round(yv / yGrid.major)) < 0.001;
        var pcyP = toCanvas(0,  yv).cy;
        var pcyN = toCanvas(0, -yv).cy;
        var ck = 'rgba(60,60,60,' + (isMaj2 ? '0.45' : '0.22') + ')';
        ctx.strokeStyle = ck; ctx.lineWidth = isMaj2 ? 1.4 : 0.8;
        if (pcyP >= 5)          { ctx.beginPath(); ctx.moveTo(orig.cx - tickLen, pcyP); ctx.lineTo(orig.cx + tickLen, pcyP); ctx.stroke(); if (isMaj2) ctx.fillText(fmt(yv, yDec), orig.cx - tickLen - 4, pcyP); }
        if (pcyN <= _animH - 5) { ctx.beginPath(); ctx.moveTo(orig.cx - tickLen, pcyN); ctx.lineTo(orig.cx + tickLen, pcyN); ctx.stroke(); if (isMaj2) ctx.fillText(fmt(-yv, yDec), orig.cx - tickLen - 4, pcyN); }
    }
    ctx.restore();
}

function _drawAxesE(ctx) {
    var orig = toCanvas(0, 0);
    var ag   = _axisGeom();
    var fontSize = Math.max(13, Math.min(18, _animH * 0.038));
    ctx.save();
    ctx.strokeStyle = 'rgba(40,40,40,0.70)';
    ctx.fillStyle   = 'rgba(40,40,40,0.70)';
    ctx.lineWidth   = 2;

    /* Axe X */
    ctx.beginPath(); ctx.moveTo(orig.cx - 5, orig.cy); ctx.lineTo(ag.xEnd, orig.cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ag.xEnd, orig.cy);
    ctx.lineTo(ag.xEnd - ag.aLen, orig.cy - 4); ctx.lineTo(ag.xEnd - ag.aLen, orig.cy + 4);
    ctx.closePath(); ctx.fill();

    /* Axe Y symétrique */
    ctx.beginPath(); ctx.moveTo(orig.cx, _animH - ag.yEnd); ctx.lineTo(orig.cx, ag.yEnd); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(orig.cx, ag.yEnd);
    ctx.lineTo(orig.cx - 4, ag.yEnd + ag.aLen); ctx.lineTo(orig.cx + 4, ag.yEnd + ag.aLen);
    ctx.closePath(); ctx.fill();

    ctx.font = 'bold ' + fontSize + 'px Segoe UI, Arial';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('x (m)', ag.xEnd - ag.aLen - 2, orig.cy + fontSize + 4);
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('y (m)', orig.cx - 6, ag.yEnd + ag.aLen + 2);
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('O', orig.cx - 4, orig.cy + 2);
    ctx.restore();
}

function _drawArmatures(ctx) {
    var isPos = sim.E >= 0;
    ctx.save();
    if (sim.armatureMode === 'parallel-x') {
        var halfE  = sim.e / 2;
        var topPt  = toCanvas(0, halfE);
        var botPt  = toCanvas(0, -halfE);
        var exitPt = toCanvas(sim.L, 0);
        var scrPt  = toCanvas(sim.xMax, 0);
        var platH  = Math.max(7, Math.min(18, Math.abs(toCanvas(0, halfE).cy - toCanvas(0, halfE * 0.8).cy)));
        var platW  = exitPt.cx - topPt.cx;
        var topColor  = isPos ? '#4a90d9' : '#e06060';
        var botColor  = isPos ? '#e06060' : '#4a90d9';
        var topCharge = isPos ? '−' : '+';
        var botCharge = isPos ? '+' : '−';
        var topY = topPt.cy - platH;
        var botY = botPt.cy;

        /* Zone champ */
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = isPos ? '#3060cc' : '#cc3030';
        ctx.fillRect(topPt.cx, topY + platH, platW, botY - topY - platH);
        ctx.globalAlpha = 1;

        function _drawPlate(y, color, charge, strokeCol) {
            ctx.fillStyle = color; ctx.globalAlpha = 0.82;
            ctx.fillRect(topPt.cx, y, platW, platH);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = strokeCol; ctx.lineWidth = 1.5;
            ctx.strokeRect(topPt.cx, y, platW, platH);
            var nSigns = Math.max(3, Math.floor(platW / 22));
            ctx.fillStyle = '#fff';
            ctx.font = 'bold ' + Math.max(9, Math.min(14, platH * 0.85)) + 'px Arial';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            for (var si = 0; si < nSigns; si++) {
                ctx.fillText(charge, topPt.cx + (si + 0.5) * platW / nSigns, y + platH / 2);
            }
        }
        _drawPlate(topY, topColor, topCharge, isPos ? '#2a6aaa' : '#aa3030');
        _drawPlate(botY, botColor, botCharge, isPos ? '#aa3030' : '#2a6aaa');

        /* Écran droit */
        ctx.strokeStyle = 'rgba(80,80,80,0.45)'; ctx.lineWidth = 1.8;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(scrPt.cx, 10); ctx.lineTo(scrPt.cx, _animH - 10); ctx.stroke();
        ctx.setLineDash([]);

    } else {
        /* perp-x */
        var halfE2   = PLATE_HALF_HEIGHT_PERP;
        var topL  = toCanvas(0,      halfE2);
        var botL  = toCanvas(0,     -halfE2);
        var topR  = toCanvas(sim.e,  halfE2);
        var botR  = toCanvas(sim.e, -halfE2);
        var scrP2 = toCanvas(sim.xMax, 0);
        var platW2  = Math.max(6, Math.min(14, sim.scaleX * sim.e * 0.06));
        var platH2  = botL.cy - topL.cy;
        var holeSz  = Math.max(6, Math.min(16, platH2 * 0.18));
        var holeCy  = topL.cy + platH2 / 2;
        var leftColor  = isPos ? '#e06060' : '#4a90d9';
        var rightColor = isPos ? '#4a90d9' : '#e06060';
        var leftCharge  = isPos ? '+' : '−';
        var rightCharge = isPos ? '−' : '+';

        /* Zone champ */
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = isPos ? '#3060cc' : '#cc3030';
        ctx.fillRect(topL.cx, topL.cy, topR.cx - topL.cx, platH2);
        ctx.globalAlpha = 1;

        function _drawSignsInSegment(bx, charge, yTop, yBot) {
            var segH = yBot - yTop;
            if (segH < 8) return;
            var nSigns = Math.max(1, Math.floor(segH / 22));
            for (var si = 0; si < nSigns; si++) {
                var sy = yTop + (si + 0.5) * segH / nSigns;
                ctx.fillText(charge, bx, sy);
            }
        }
        function _drawVPlate(bx, color, charge) {
            ctx.fillStyle = color; ctx.globalAlpha = 0.82;
            ctx.fillRect(bx - platW2 / 2, topL.cy, platW2, holeCy - holeSz - topL.cy);
            ctx.fillRect(bx - platW2 / 2, holeCy + holeSz, platW2, botL.cy - holeCy - holeSz);
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            _drawSignsInSegment(bx, charge, topL.cy, holeCy - holeSz);
            _drawSignsInSegment(bx, charge, holeCy + holeSz, botL.cy);
        }
        _drawVPlate(topL.cx, leftColor,  leftCharge);
        _drawVPlate(topR.cx, rightColor, rightCharge);

        /* Écran droit */
        ctx.strokeStyle = 'rgba(80,80,80,0.45)'; ctx.lineWidth = 1.8;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(scrP2.cx, 10); ctx.lineTo(scrP2.cx, _animH - 10); ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.restore();
}

function _drawFieldE(ctx) {
    var COL = '#e67e22';
    var E   = sim.E;
    var dir = E >= 0 ? -1 : 1;   /* -1 = flèche vers le haut (cy décroît) */
    ctx.save();
    ctx.strokeStyle = COL; ctx.fillStyle = COL;
    ctx.globalAlpha = 0.50; ctx.lineWidth = 1.8; ctx.lineCap = 'round';

    /* Échelle des flèches en fonction de l'intensité du champ (log, bornée) */
    var E_REF = 1.5e4;
    var eScale = 1 + 0.65 * Math.log10(Math.max(Math.abs(E), 1) / E_REF);
    eScale = Math.max(0.4, Math.min(2.2, eScale));

    if (sim.armatureMode === 'parallel-x') {
        var xL   = sim.originX + 12;
        var xR   = toCanvas(sim.L, 0).cx - 12;
        var cols = Math.max(3, Math.floor((xR - xL) / 50));
        var halfE  = sim.e / 2;
        var halfPx = Math.abs(toCanvas(0, halfE).cy - toCanvas(0, 0).cy);
        var vecLen = Math.min(Math.max(14, Math.min(36, halfPx * 0.75)) * eScale, halfPx * 0.9);
        var midCy  = toCanvas(0, 0).cy;
        var rowOffset = halfPx * 0.5; /* décale chaque rangée à mi-chemin entre l'axe x et une plaque */

        [-1, 1].forEach(function(side) {
            var rowCy = midCy - side * rowOffset;
            for (var c = 0; c < cols; c++) {
                var fx = xL + c * (xR - xL) / Math.max(1, cols - 1);
                var fy1 = rowCy - dir * vecLen / 2;
                var fy2 = rowCy + dir * vecLen / 2;
                ctx.beginPath(); ctx.moveTo(fx, fy1); ctx.lineTo(fx, fy2); ctx.stroke();
                var ah = vecLen * 0.22;
                ctx.beginPath();
                ctx.moveTo(fx - ah * 0.45, fy2 - dir * ah);
                ctx.lineTo(fx, fy2);
                ctx.lineTo(fx + ah * 0.45, fy2 - dir * ah);
                ctx.stroke();
            }
        });
    } else {
        /* perp-x : miroir du mode parallel-x (colonnes ↔ rangées, x ↔ y) */
        var yT   = toCanvas(0, PLATE_HALF_HEIGHT_PERP).cy + 12;
        var yB   = toCanvas(0, -PLATE_HALF_HEIGHT_PERP).cy - 12;
        var rows = Math.max(3, Math.floor((yB - yT) / 50));
        var halfPxH = Math.abs(toCanvas(sim.e, 0).cx - toCanvas(sim.e / 2, 0).cx);
        var vecLenH = Math.min(Math.max(14, Math.min(36, halfPxH * 0.75)) * eScale, halfPxH * 0.9);
        var midCx   = toCanvas(sim.e / 2, 0).cx;
        var colOffset = halfPxH * 0.5;
        var dxd = E >= 0 ? 1 : -1;

        [-1, 1].forEach(function(side) {
            var colCx = midCx - side * colOffset;
            for (var r = 0; r < rows; r++) {
                var fy  = yT + r * (yB - yT) / Math.max(1, rows - 1);
                var fx1 = colCx - dxd * vecLenH / 2;
                var fx2 = colCx + dxd * vecLenH / 2;
                ctx.beginPath(); ctx.moveTo(fx1, fy); ctx.lineTo(fx2, fy); ctx.stroke();
                var ah2 = vecLenH * 0.22;
                ctx.beginPath();
                ctx.moveTo(fx2 - dxd * ah2, fy - ah2 * 0.45);
                ctx.lineTo(fx2, fy);
                ctx.lineTo(fx2 - dxd * ah2, fy + ah2 * 0.45);
                ctx.stroke();
            }
        });
    }
    ctx.restore();
}

/* Force électrique au point (x,y) — nulle hors du condensateur.
   Sans arguments, utilise la position courante de la particule (sim = simE ici). */
function _getEPhys(x, y) {
    if (x === undefined) { x = sim.x; y = sim.y; }
    return _fieldForceAt(sim, x, y);
}

function _drawForcesAtE(ctx, cx, cy, vx, vy, opacity, phys, placedRects) {
    if (phys.FEx === 0 && phys.FEy === 0) return; /* hors du condensateur : rien à afficher */
    var _perp = sim.armatureMode === 'perp-x';
    var _col  = _perp ? COL_VEC_FORCES_PERP : COL_VEC_FORCES;
    var _op   = _perp ? 1.0 : opacity;
    var _vp = _viewProjFactors();
    var _sf = sim.vecScaleForce || VEC_SCALE_FORCE;
    var dxPx =  phys.FEx * _sf * _vp.cx;
    var dyPx = -phys.FEy * _sf * _vp.cy;
    _drawVecArrow(ctx, cx, cy, dxPx, dyPx, _col, null, _op, _perp ? VEC_LW_PERP : undefined);
    var lm  = _measureForceName(ctx, 'FE');
    var pos = _bestLabelPos(cx + dxPx, cy + dyPx, lm.w, lm.h,
                            ['right','upper-right','lower-right','left','above','below'], placedRects);
    placedRects.push({lx: pos.lx, ly: pos.ly, w: lm.w, h: lm.h});
    _renderForceName(ctx, pos.lx, pos.ly, 'FE', _col, _op, lm);
}

function _drawSumFAtE(ctx, cx, cy, vx, vy, opacity, phys, placedRects) {
    if (phys.FEx === 0 && phys.FEy === 0) return; /* hors du condensateur : rien à afficher */
    var _perp = sim.armatureMode === 'perp-x';
    var _col  = _perp ? COL_VEC_SUMF_PERP : COL_VEC_SUMF;
    var _op   = _perp ? 1.0 : opacity;
    var _vp = _viewProjFactors();
    var _sf = sim.vecScaleForce || VEC_SCALE_FORCE;
    var dxPx =  phys.FEx * _sf * _vp.cx;
    var dyPx = -phys.FEy * _sf * _vp.cy;
    _drawVecArrow(ctx, cx, cy, dxPx, dyPx, _col, null, _op, _perp ? VEC_LW_PERP : undefined);
    var lm  = _measureForceName(ctx, 'ΣF');
    var pos = _bestLabelPos(cx + dxPx, cy + dyPx, lm.w, lm.h,
                            ['right','upper-right','lower-right','left','above','below'], placedRects);
    placedRects.push({lx: pos.lx, ly: pos.ly, w: lm.w, h: lm.h});
    _renderForceName(ctx, pos.lx, pos.ly, 'ΣF', _col, _op, lm);
}

function _drawChronoSnapsE(ctx) {
    var snaps = sim.chronoSnaps;
    if (!snaps.length) return;
    var _vp = _viewProjFactors();
    for (var i = 0; i < snaps.length; i++) {
        var s = snaps[i];
        var ep = _getEPhys(s.x, s.y);
        var p = toCanvas(s.x, s.y);
        ctx.save();
        ctx.fillStyle = _currentRunColor || 'rgba(50,80,180,0.85)';
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.cx, p.cy, 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        ctx.restore();
        if (sim.showVecPos)    _drawVectorPos(ctx, s.x, s.y, 0.6);
        if (sim.showVecVit) {
            var _cvxS = s.vx * sim.scaleX, _cvyS = -s.vy * sim.scaleY;
            var _cmS = Math.hypot(_cvxS, _cvyS) || 1, _lS = Math.hypot(s.vx, s.vy) * sim.vecScaleVit;
            var _vitPerpS = sim.armatureMode === 'perp-x';
            _drawVecDispVA(ctx, p.cx, p.cy, _cvxS * _lS / _cmS, _cvyS * _lS / _cmS,
                _vitPerpS ? COL_VEC_VIT_PERP : COL_VEC_VIT, null, _vitPerpS ? 1.0 : 0.6,
                _vitPerpS ? VEC_VIT_LW_PERP : undefined);
        }
        if (sim.showVecAcc) {
            var _caxS = s.ax * sim.scaleX, _cayS = -s.ay * sim.scaleY;
            var _caS = Math.hypot(_caxS, _cayS) || 1, _laS = Math.hypot(s.ax, s.ay) * sim.vecScaleAcc;
            var _accPerpS = sim.armatureMode === 'perp-x';
            _drawVecDispVA(ctx, p.cx, p.cy, _caxS * _laS / _caS, _cayS * _laS / _caS,
                _accPerpS ? COL_VEC_ACC_PERP : COL_VEC_ACC, null, _accPerpS ? 1.0 : 0.6,
                _accPerpS ? VEC_LW_PERP : undefined);
        }
        if (sim.showVecForces || sim.showVecSumF) {
            var er = [];
            if (sim.showVecForces) _drawForcesAtE(ctx, p.cx, p.cy, s.vx, s.vy, 0.6, ep, er);
            if (sim.showVecSumF)   _drawSumFAtE  (ctx, p.cx, p.cy, s.vx, s.vy, 0.6, ep, er);
        }
    }
}

function _drawSavedChronoSnapsE(ctx, run) {
    var snaps = run.chronoSnaps;
    if (!snaps.length) return;
    var _vp = _viewProjFactors();
    var vsv = run.vecScaleVit   || sim.vecScaleVit;
    var vsa = run.vecScaleAcc   || sim.vecScaleAcc;
    for (var i = 0; i < snaps.length; i++) {
        var s = snaps[i];
        if (_replaySessionActive && s.t > _replayT) break;
        var ep = _fieldForceAt(run, s.x, s.y);
        var p = toCanvas(s.x, s.y);
        ctx.save();
        ctx.globalAlpha = 0.82;
        ctx.fillStyle = run.color; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.cx, p.cy, 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        ctx.restore();
        if (run.showVecPos)    _drawVectorPos(ctx, s.x, s.y, 0.42);
        if (run.showVecVit) {
            var _cvxR = s.vx * sim.scaleX, _cvyR = -s.vy * sim.scaleY;
            var _cmR = Math.hypot(_cvxR, _cvyR) || 1, _lR = Math.hypot(s.vx, s.vy) * vsv;
            var _vitPerpR = run.armatureMode === 'perp-x';
            _drawVecDispVA(ctx, p.cx, p.cy, _cvxR * _lR / _cmR, _cvyR * _lR / _cmR,
                _vitPerpR ? COL_VEC_VIT_PERP : COL_VEC_VIT, null, _vitPerpR ? 1.0 : 0.42,
                _vitPerpR ? VEC_VIT_LW_PERP : undefined);
        }
        if (run.showVecAcc) {
            var _caxR = s.ax * sim.scaleX, _cayR = -s.ay * sim.scaleY;
            var _caR = Math.hypot(_caxR, _cayR) || 1, _laR = Math.hypot(s.ax, s.ay) * vsa;
            var _accPerpR = run.armatureMode === 'perp-x';
            _drawVecDispVA(ctx, p.cx, p.cy, _caxR * _laR / _caR, _cayR * _laR / _caR,
                _accPerpR ? COL_VEC_ACC_PERP : COL_VEC_ACC, null, _accPerpR ? 1.0 : 0.42,
                _accPerpR ? VEC_LW_PERP : undefined);
        }
        if (run.showVecForces || run.showVecSumF) {
            var er2 = [];
            if (run.showVecForces) _drawForcesAtE(ctx, p.cx, p.cy, s.vx, s.vy, 0.42, ep, er2);
            if (run.showVecSumF)   _drawSumFAtE  (ctx, p.cx, p.cy, s.vx, s.vy, 0.42, ep, er2);
        }
    }
}

function _drawParticleE(ctx) {
    if (sim.ended && sim.trajPoints.length > 0) return;
    var p = toCanvas(sim.x, sim.y);
    var r = Math.max(5, Math.min(10, 6));
    var charge = sim.q < 0 ? '−' : '+';
    var color  = sim.q < 0 ? '#4a90d9' : '#e06060';
    ctx.save();
    ctx.beginPath(); ctx.arc(p.cx, p.cy, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.30)'; ctx.shadowBlur = 5;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.max(10, r * 1.3) + 'px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(charge, p.cx, p.cy);
    ctx.restore();

    var _vp = _viewProjFactors();
    if (sim.showVecPos)    _drawVectorPos(ctx, sim.x, sim.y, 1.0);
    if (sim.showVecVit) {
        var _cvxP = sim.vx * sim.scaleX, _cvyP = -sim.vy * sim.scaleY;
        var _cmP = Math.hypot(_cvxP, _cvyP) || 1, _lP = Math.hypot(sim.vx, sim.vy) * sim.vecScaleVit;
        var _vitPerpP = sim.armatureMode === 'perp-x';
        _drawVecDispVA(ctx, p.cx, p.cy, _cvxP * _lP / _cmP, _cvyP * _lP / _cmP,
            _vitPerpP ? COL_VEC_VIT_PERP : COL_VEC_VIT, null, 1.0, _vitPerpP ? VEC_VIT_LW_PERP : undefined);
    }
    if (sim.showVecAcc) {
        var _caxP = sim.ax * sim.scaleX, _cayP = -sim.ay * sim.scaleY;
        var _caP = Math.hypot(_caxP, _cayP) || 1, _laP = Math.hypot(sim.ax, sim.ay) * sim.vecScaleAcc;
        var _accPerpP = sim.armatureMode === 'perp-x';
        _drawVecDispVA(ctx, p.cx, p.cy, _caxP * _laP / _caP, _cayP * _laP / _caP,
            _accPerpP ? COL_VEC_ACC_PERP : COL_VEC_ACC, null, 1.0, _accPerpP ? VEC_LW_PERP : undefined);
    }
    if (sim.showVecForces || sim.showVecSumF) {
        var ep = _getEPhys(); var er = [];
        if (sim.showVecForces) _drawForcesAtE(ctx, p.cx, p.cy, sim.vx, sim.vy, 1.0, ep, er);
        if (sim.showVecSumF)   _drawSumFAtE  (ctx, p.cx, p.cy, sim.vx, sim.vy, 1.0, ep, er);
    }
}

function _updateAnimHoverE(mouseX, mouseY) {
    var isChrono = (simE.displayMode === 'chrono');
    var visible = _visibleSavedRunsE();
    var datasets = [];
    if (isChrono) {
        if (simE.chronoSnaps.length > 0) datasets.push({data: simE.chronoSnaps, color: _currentRunColorE || '#2050a0', runId: null});
        for (var i = 0; i < visible.length; i++) {
            if (!visible[i].hidden && visible[i].chronoSnaps.length > 0)
                datasets.push({data: visible[i].chronoSnaps, color: visible[i].color, runId: visible[i].id});
        }
    } else {
        if (simE.graphData.length >= 2) datasets.push({data: simE.graphData, color: _currentRunColorE || '#2050a0', runId: null});
        for (var i = 0; i < visible.length; i++) {
            if (!visible[i].hidden) datasets.push({data: visible[i].graphData, color: visible[i].color, runId: visible[i].id});
        }
    }
    var bestDist = Infinity, bestSnap = null;
    /* sim is swapped to simE during drawAnimE but not here; use simE directly for toCanvas */
    var _simBak = sim; sim = simE;
    for (var di = 0; di < datasets.length; di++) {
        var pts = datasets[di].data;
        for (var k = 0; k < pts.length; k++) {
            var p = toCanvas(pts[k].x, pts[k].y);
            var d = Math.hypot(p.cx - mouseX, p.cy - mouseY);
            if (d < bestDist) {
                bestDist = d;
                bestSnap = {x: pts[k].x, y: pts[k].y,
                            vx: pts[k].vx, vy: pts[k].vy,
                            ax: pts[k].ax, ay: pts[k].ay,
                            t: pts[k].t, color: datasets[di].color,
                            runId: datasets[di].runId, _cx: p.cx, _cy: p.cy};
            }
        }
    }
    sim = _simBak;
    _animHoverSnapE = bestSnap;
}

function _handleClickE() {
    if (!_pinModeActive || !_animHoverSnapE) return;
    var snap = _animHoverSnapE;
    var runRef = snap.runId === null ? null : savedRunsE.find(function(r) { return r.id === snap.runId; });
    if (snap.runId !== null && !runRef) return; /* run supprimée entre-temps */
    var targetList = runRef ? runRef.analysisPoints : simE.analysisPoints;
    var _simBak = sim; sim = simE;
    for (var i = 0; i < targetList.length; i++) {
        var pp = toCanvas(targetList[i].x, targetList[i].y);
        if (Math.hypot(pp.cx - snap._cx, pp.cy - snap._cy) < 12) {
            sim = _simBak; targetList.splice(i, 1); return;
        }
    }
    sim = _simBak;
    if (targetList.length >= 10) return;
    var ep = runRef
        ? _fieldForceAt(runRef, snap.x, snap.y)
        : _fieldForceAt(simE, snap.x, snap.y);
    targetList.push({x: snap.x, y: snap.y, vx: snap.vx, vy: snap.vy,
                     ax: snap.ax, ay: snap.ay, t: snap.t,
                     color: snap.color, phys: ep});
}

function drawAnimE() {
    if (!_animCtx) return;
    var ctx = _animCtx;

    /* Swap temporaire sim → simE */
    var _simOrig    = sim;
    var _runsOrig   = savedRuns;
    var _colorOrig  = _currentRunColor;
    var _repOrig    = _replayPlaying;
    var _repActiveOrig = _replaySessionActive;
    var _repTOrig   = _replayT;
    var _hoverOrig  = _animHoverSnap;
    sim              = simE;
    /* Runs sauvegardées indépendantes entre parallel-x et perp-x */
    savedRuns        = _visibleSavedRunsE();
    _currentRunColor = _currentRunColorE;
    _replayPlaying   = _replayPlayingE;
    _replaySessionActive = _replaySessionActiveE;
    _replayT         = _replayTE;
    _animHoverSnap   = _animHoverSnapE;
    _labelMaxY       = _animH - 5;
    /* Nécessaire pour que les points épinglés (_drawAnalysisPoints) utilisent les
       échelles vitesse/accélération électriques, pas celles du champ de pesanteur */
    _vecScaleVitOverride = simE.vecScaleVit;
    _vecScaleAccOverride = simE.vecScaleAcc;

    _updateViewAngles();
    ctx.clearRect(0, 0, _animW, _animH);

    _drawBackgroundE(ctx);
    _drawGridE(ctx);
    _drawAxesE(ctx);
    _drawArmatures(ctx);
    if (simE.showFieldE) _drawFieldE(ctx);

    for (var _sri = 0; _sri < savedRuns.length; _sri++) {
        var _sr = savedRuns[_sri];
        if (_sr.hidden) continue;
        if (simE.displayMode === 'trajectory' || simE.displayMode === 'both') _drawSavedTrajectory(ctx, _sr);
        if (simE.displayMode === 'chrono'     || simE.displayMode === 'both') _drawSavedChronoSnapsE(ctx, _sr);
        if (_replaySessionActive) _drawSavedBallE(ctx, _sr);
    }

    if (simE.displayMode === 'trajectory' || simE.displayMode === 'both') _drawTrajectory(ctx);
    if (simE.displayMode === 'chrono'     || simE.displayMode === 'both') _drawChronoSnapsE(ctx);

    _drawParticleE(ctx);
    _drawAnalysisPoints(ctx);
    _drawViewLabel(ctx);
    if (_animHoverSnapE) _drawAnimHoverE(ctx, _animHoverSnapE);

    /* Restore */
    sim              = _simOrig;
    savedRuns        = _runsOrig;
    _currentRunColor = _colorOrig;
    _replayPlaying   = _repOrig;
    _replaySessionActive = _repActiveOrig;
    _replayT         = _repTOrig;
    _animHoverSnap   = _hoverOrig;
    _labelMaxY       = null;
    _vecScaleVitOverride = null;
    _vecScaleAccOverride = null;
}

function _drawAnimHoverE(ctx, snap) {
    var _simBak = sim; var _runsBak = savedRuns; var _colBak = _currentRunColor;
    sim = simE; savedRuns = _visibleSavedRunsE(); _currentRunColor = _currentRunColorE;
    _vecScaleVitOverride = simE.vecScaleVit;
    _vecScaleAccOverride = simE.vecScaleAcc;
    _drawAnimHover(ctx, snap);
    _vecScaleVitOverride = null;
    _vecScaleAccOverride = null;
    sim = _simBak; savedRuns = _runsBak; _currentRunColor = _colBak;
}
