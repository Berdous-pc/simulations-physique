/* ══════════════════════════════════════════════════
   Simulation pédagogique — Physique-Chimie Lycée
   Auteur  : Mathieu Berdous
   Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
══════════════════════════════════════════════════ */

/* graph.js — rendu canvas graphes */

var _gCanvas   = null;
var _gCtx      = null;
var _gW = 0, _gH = 0;
var _gHoverPos = null;   // {x, y} en coordonnées canvas

/* Marge intérieure des graphes — calculée dynamiquement dans _drawOneGraph */

/* Informations par onglet : clé → {label, unit, accessor} */
var GRAPH_TABS = [
    {key: 'x(t)',   xlabel: 't (s)', ylabel: 'x (m)',    yFn: function(d){return d.y_key==='x(t)';},  col: function(d){return d.x;},  xFn: function(d){return d.t;}},
    {key: 'y(t)',   xlabel: 't (s)', ylabel: 'y (m)',    col: function(d){return d.y;},  xFn: function(d){return d.t;}},
    {key: 'vx(t)',  xlabel: 't (s)', ylabel: 'vx (m/s)', col: function(d){return d.vx;}, xFn: function(d){return d.t;}},
    {key: 'vy(t)',  xlabel: 't (s)', ylabel: 'vy (m/s)', col: function(d){return d.vy;}, xFn: function(d){return d.t;}},
    {key: 'ax(t)',  xlabel: 't (s)', ylabel: 'ax (m/s²)',col: function(d){return d.ax;}, xFn: function(d){return d.t;}},
    {key: 'ay(t)',  xlabel: 't (s)', ylabel: 'ay (m/s²)',col: function(d){return d.ay;}, xFn: function(d){return d.t;}},
    {key: 'y(x)',   xlabel: 'x (m)', ylabel: 'y (m)',    col: function(d){return d.y;},  xFn: function(d){return d.x;}}
];

function _tabInfo(key) {
    for (var i = 0; i < GRAPH_TABS.length; i++) {
        if (GRAPH_TABS[i].key === key) return GRAPH_TABS[i];
    }
    return GRAPH_TABS[0];
}

/* ─────────────────────────────────────────────────
   initGraphCanvas
───────────────────────────────────────────────── */
function initGraphCanvas() {
    _gCanvas = document.getElementById('graph-canvas');
    _gCtx    = _gCanvas.getContext('2d');
    resizeGraphCanvas();
    _buildGraphCtrl();

    _gCanvas.addEventListener('pointermove', function(e) {
        var rect = _gCanvas.getBoundingClientRect();
        _gHoverPos = {
            x: (e.clientX - rect.left) * (_gCanvas.width  / rect.width),
            y: (e.clientY - rect.top)  * (_gCanvas.height / rect.height)
        };
    });
    _gCanvas.addEventListener('pointerleave', function() {
        _gHoverPos = null;
    });
}

function resizeGraphCanvas() {
    if (!_gCanvas) return;
    var wrap = _gCanvas.parentElement;
    _gW = wrap.clientWidth  || 600;
    _gH = wrap.clientHeight || 200;
    _gCanvas.width  = _gW;
    _gCanvas.height = _gH;
}

/* ─────────────────────────────────────────────────
   _buildGraphCtrl — construit la barre d'onglets
───────────────────────────────────────────────── */
function _buildGraphCtrl() {
    var ctrl = document.getElementById('graph-ctrl');
    var sep  = document.getElementById('graph-dual-sep');
    if (!ctrl) return;
    ctrl.innerHTML = '';

    if (sim.graphMode === 'single') {
        ctrl.style.cssText = '';
        if (sep) sep.style.display = 'none';

        ctrl.appendChild(_makeDualBtn());
        ctrl.appendChild(_makeSelect('sel-tab1', sim.graphTab1, function(key) {
            sim.graphTab1 = key;
        }));

    } else {
        /* Mode dual : le séparateur DOM (#graph-dual-sep) couvre toute la hauteur.
           Les deux moitiés du ctrl s'alignent sur 50% sans border CSS. */
        ctrl.style.cssText = 'display:flex;align-items:stretch;padding:0;gap:0';
        if (sep) sep.style.display = 'block';

        var leftHalf = document.createElement('div');
        leftHalf.style.cssText = 'flex:1;display:flex;align-items:center;gap:6px;' +
            'padding:3px 8px;min-width:0';
        leftHalf.appendChild(_makeDualBtn());
        leftHalf.appendChild(_makeSelect('sel-tab1', sim.graphTab1, function(key) {
            sim.graphTab1 = key;
        }));
        ctrl.appendChild(leftHalf);

        var rightHalf = document.createElement('div');
        rightHalf.style.cssText = 'flex:1;display:flex;align-items:center;gap:6px;' +
            'padding:3px 8px;min-width:0';
        rightHalf.appendChild(_makeSelect('sel-tab2', sim.graphTab2, function(key) {
            sim.graphTab2 = key;
        }));
        ctrl.appendChild(rightHalf);
    }
}

function _makeDualBtn() {
    var btn = document.createElement('button');
    btn.className = 'graph-mode-btn' + (sim.graphMode === 'dual' ? ' active' : '');
    btn.id = 'btn-graph-dual';
    btn.textContent = sim.graphMode === 'dual' ? '2 graphes' : '1 graphe';
    btn.style.cssText = 'flex-shrink:0';
    btn.onclick = function () { toggleDualGraph(); };
    return btn;
}

function _makeSelect(id, activeKey, onChange) {
    var sel = document.createElement('select');
    sel.id = id;
    sel.className = 'graph-select';
    GRAPH_TABS.forEach(function(tab) {
        var opt = document.createElement('option');
        opt.value = tab.key;
        opt.textContent = tab.key;
        if (tab.key === activeKey) opt.selected = true;
        sel.appendChild(opt);
    });
    sel.onchange = function() { onChange(sel.value); };
    return sel;
}

function toggleDualGraph() {
    sim.graphMode = (sim.graphMode === 'dual') ? 'single' : 'dual';
    _buildGraphCtrl();
}

/* ─────────────────────────────────────────────────
   drawGraph — point d'entrée
───────────────────────────────────────────────── */
function drawGraph() {
    if (!_gCtx) return;
    var ctx = _gCtx;
    ctx.clearRect(0, 0, _gW, _gH);

    /* Fond */
    ctx.fillStyle = '#faf9f6';
    ctx.fillRect(0, 0, _gW, _gH);

    if (sim.graphMode === 'dual') {
        var halfW  = Math.floor(_gW / 2);
        var leftW  = halfW - 1;
        var rightW = _gW - halfW - 1;
        var hoverRight = _gHoverPos
            ? { x: _gHoverPos.x - (halfW + 1), y: _gHoverPos.y }
            : null;

        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, leftW, _gH); ctx.clip();
        _drawOneGraph(ctx, 0, 0, leftW, _gH, sim.graphTab1, _gHoverPos);
        ctx.restore();

        ctx.save();
        ctx.translate(halfW + 1, 0);
        ctx.beginPath(); ctx.rect(0, 0, rightW, _gH); ctx.clip();
        _drawOneGraph(ctx, 0, 0, rightW, _gH, sim.graphTab2, hoverRight);
        ctx.restore();
    } else {
        _drawOneGraph(ctx, 0, 0, _gW, _gH, sim.graphTab1, _gHoverPos);
    }
}

/* ─────────────────────────────────────────────────
   Helpers ticks / formatage
───────────────────────────────────────────────── */

/* Pas "joli" pour les graduations */
function _niceStep(range, targetTicks) {
    var rough = range / targetTicks;
    var mag   = Math.pow(10, Math.floor(Math.log10(rough)));
    var mant  = rough / mag;
    if (mant < 1.5) return mag;
    if (mant < 3.5) return 2 * mag;
    if (mant < 7.5) return 5 * mag;
    return 10 * mag;
}

function _fmtLabel(v) {
    if (v === 0) return '0';
    var av = Math.abs(v);
    if (av >= 1000) return v.toFixed(0);
    if (av >= 100)  return v.toFixed(0);
    if (av >= 10)   return v.toFixed(1);
    return v.toFixed(2);
}

/* Tailles de police dynamiques (recalculées par frame) */
var _gFontTick  = 12;
var _gFontTitle = 13;

function _updateGraphFontSizes(H) {
    _gFontTick  = Math.max(10, Math.min(18, Math.round(H * 0.038)));
    _gFontTitle = Math.max(11, Math.min(20, Math.round(H * 0.046)));
}

/* Marge gauche minimale mesurée depuis la largeur réelle des labels Y */
function _calcGraphLeftMarginRaw(ctx, yMin, yMax) {
    ctx.font = _gFontTick + 'px monospace';
    var step  = _niceStep(yMax - yMin, 5);
    var start = Math.ceil(yMin / step) * step;
    var wMax  = 0;
    for (var v = start; v <= yMax + step * 0.01; v += step) {
        var w = ctx.measureText(_fmtLabel(Math.round(v / step) * step)).width;
        if (w > wMax) wMax = w;
    }
    return Math.round(wMax + 14);
}

/* Extrait nom et unité depuis un label d'axe du type "vx (m/s)" */
function _parseAxisLabel(label) {
    var m = label.match(/^(\S+)\s*\(([^)]+)\)/);
    if (m) return { name: m[1], unit: m[2] };
    return { name: label, unit: '' };
}

/* ─────────────────────────────────────────────────
   _drawOneGraph — dessine un graphe dans (x0,y0,W,H)
───────────────────────────────────────────────── */
function _drawOneGraph(ctx, x0, y0, W, H, tabKey, hoverPos) {
    var info = _tabInfo(tabKey);
    var data = sim.graphData;

    /* ── Bornes fixes pré-calculées depuis les conditions initiales ── */
    var xMin, xMax, yMin, yMax;
    var gb = sim.graphBounds;
    var keyMap = {
        'x(t)':  { xb: gb && gb.t,  yb: gb && gb.x  },
        'y(t)':  { xb: gb && gb.t,  yb: gb && gb.y  },
        'vx(t)': { xb: gb && gb.t,  yb: gb && gb.vx },
        'vy(t)': { xb: gb && gb.t,  yb: gb && gb.vy },
        'ax(t)': { xb: gb && gb.t,  yb: gb && gb.ax },
        'ay(t)': { xb: gb && gb.t,  yb: gb && gb.ay },
        'y(x)':  { xb: gb && gb.x,  yb: gb && gb.y  }
    };
    var bnd = keyMap[tabKey];
    if (gb && bnd && bnd.xb && bnd.yb) {
        xMin = bnd.xb.min; xMax = bnd.xb.max;
        yMin = bnd.yb.min; yMax = bnd.yb.max;
        if (xMin === xMax) { xMin -= 0.5; xMax += 0.5; }
        if (yMin === yMax) { yMin -= 1;   yMax += 1;   }
        var yPad = (yMax - yMin) * 0.12;
        yMin -= yPad; yMax += yPad;
        var xPad = (xMax - xMin) * 0.04;
        xMax += xPad;
    } else {
        xMin = 0; xMax = 10; yMin = -1; yMax = 10;
    }

    /* ── Polices et marges dynamiques ── */
    _updateGraphFontSizes(H);
    var mlRaw = _calcGraphLeftMarginRaw(ctx, yMin, yMax);
    var ml    = mlRaw + _gFontTitle + 8;
    var mr    = Math.max(10, Math.min(20, W * 0.04));
    var mt    = Math.max(10, Math.round(_gFontTick * 0.8));
    var mb    = Math.max(28, Math.round(_gFontTick * 1.6 + _gFontTitle * 1.5 + 4));

    var plotW = W - ml - mr;
    var plotH = H - mt - mb;
    if (plotW < 20 || plotH < 20) return;

    function toGX(v) { return x0 + ml + (v - xMin) / (xMax - xMin) * plotW; }
    function toGY(v) { return y0 + mt + plotH - (v - yMin) / (yMax - yMin) * plotH; }

    /* ── Fond zone de tracé ── */
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x0 + ml, y0 + mt, plotW, plotH);

    /* ── Grille Y ── */
    var stepY  = _niceStep(yMax - yMin, Math.max(3, Math.floor(plotH / 55)));
    var startY = Math.ceil(yMin / stepY) * stepY;

    ctx.font         = _gFontTick + 'px monospace';
    ctx.fillStyle    = '#7a8a96';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';

    for (var vy = startY; vy <= yMax + stepY * 0.01; vy += stepY) {
        var vyr = Math.round(vy / stepY) * stepY;
        var gy  = toGY(vyr);
        if (gy < y0 + mt - 2 || gy > y0 + mt + plotH + 2) continue;

        ctx.strokeStyle = (vyr === 0) ? 'rgba(44,62,80,0.20)' : 'rgba(200,192,180,0.55)';
        ctx.lineWidth   = (vyr === 0) ? 1.2 : 0.8;
        ctx.beginPath();
        ctx.moveTo(x0 + ml, gy);
        ctx.lineTo(x0 + ml + plotW, gy);
        ctx.stroke();

        ctx.fillText(_fmtLabel(vyr), x0 + ml - 6, gy);
    }

    /* ── Grille X ── */
    var stepX  = _niceStep(xMax - xMin, Math.max(3, Math.floor(plotW / 80)));
    var startX = Math.ceil(xMin / stepX) * stepX;

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    for (var vx = startX; vx <= xMax + stepX * 0.01; vx += stepX) {
        var vxr = Math.round(vx / stepX) * stepX;
        var gx  = toGX(vxr);
        if (gx < x0 + ml - 2 || gx > x0 + ml + plotW + 2) continue;

        ctx.strokeStyle = 'rgba(200,192,180,0.55)';
        ctx.lineWidth   = 0.8;
        ctx.beginPath();
        ctx.moveTo(gx, y0 + mt);
        ctx.lineTo(gx, y0 + mt + plotH);
        ctx.stroke();

        ctx.fillText(_fmtLabel(vxr), gx, y0 + mt + plotH + 4);
    }

    /* ── Ligne zéro Y ── */
    if (yMin < 0 && yMax > 0) {
        var zy = toGY(0);
        ctx.save();
        ctx.strokeStyle = 'rgba(44,62,80,0.30)';
        ctx.lineWidth   = 1.2;
        ctx.beginPath();
        ctx.moveTo(x0 + ml, zy);
        ctx.lineTo(x0 + ml + plotW, zy);
        ctx.stroke();
        ctx.restore();
    }

    /* ── Bordure zone de tracé ── */
    ctx.strokeStyle = '#c8c0b4';
    ctx.lineWidth   = 1;
    ctx.strokeRect(x0 + ml, y0 + mt, plotW, plotH);

    var _isChrono = (sim.displayMode === 'chrono');
    var _isBoth   = (sim.displayMode === 'both');

    /* ── Helper : dessine des croix discrètes pour un dataset ── */
    function _drawCrosses(pts, color, alpha) {
        if (pts.length === 0) return;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0 + ml, y0 + mt, plotW, plotH);
        ctx.clip();
        ctx.strokeStyle = color;
        ctx.lineWidth   = 2;
        ctx.globalAlpha = alpha || 0.85;
        var S = 5; /* demi-taille de la croix */
        for (var _ci2 = 0; _ci2 < pts.length; _ci2++) {
            var _gx = toGX(info.xFn(pts[_ci2]));
            var _gy = toGY(info.col(pts[_ci2]));
            ctx.beginPath();
            ctx.moveTo(_gx - S, _gy - S); ctx.lineTo(_gx + S, _gy + S);
            ctx.moveTo(_gx + S, _gy - S); ctx.lineTo(_gx - S, _gy + S);
            ctx.stroke();
        }
        ctx.restore();
    }

    /* ── Courbes des runs sauvegardées ── */
    for (var _si = 0; _si < savedRuns.length; _si++) {
        var _sr = savedRuns[_si];
        if (_sr.hidden) continue;

        if (_sr.graphData.length >= 2 && !_isChrono) {
            var _srData = _replayPlaying
                ? _sr.graphData.filter(function(d) { return d.t <= _replayT; })
                : _sr.graphData;
            if (_srData.length >= 2) {
                var _srX = _srData.map(info.xFn);
                var _srY = _srData.map(info.col);
                var _yRange = yMax - yMin;
                ctx.save();
                ctx.beginPath();
                ctx.rect(x0 + ml, y0 + mt, plotW, plotH);
                ctx.clip();
                ctx.strokeStyle = _sr.color;
                ctx.lineWidth   = 2;
                ctx.lineJoin    = 'round';
                ctx.globalAlpha = 0.85;
                ctx.beginPath();
                ctx.moveTo(toGX(_srX[0]), toGY(_srY[0]));
                for (var _sj = 1; _sj < _srX.length; _sj++) {
                    if (Math.abs(_srY[_sj] - _srY[_sj - 1]) > _yRange * 0.25) {
                        ctx.moveTo(toGX(_srX[_sj]), toGY(_srY[_sj]));
                    } else {
                        ctx.lineTo(toGX(_srX[_sj]), toGY(_srY[_sj]));
                    }
                }
                ctx.stroke();
                ctx.restore();
            }
        }
        if (_isChrono || _isBoth) {
            var _srSnaps = _replayPlaying
                ? _sr.chronoSnaps.filter(function(d) { return d.t <= _replayT; })
                : _sr.chronoSnaps;
            _drawCrosses(_srSnaps, _sr.color, 0.85);
        }
    }

    /* ── Courbe (et/ou croix chrono) courante ── */
    if (!_isChrono && data.length >= 2) {
        var xVals = data.map(info.xFn);
        var yVals = data.map(info.col);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0 + ml, y0 + mt, plotW, plotH);
        ctx.clip();
        ctx.strokeStyle = _currentRunColor || '#2a5080';
        ctx.lineWidth   = 2;
        ctx.lineJoin    = 'round';
        var yRange = yMax - yMin;
        ctx.beginPath();
        ctx.moveTo(toGX(xVals[0]), toGY(yVals[0]));
        for (var j = 1; j < xVals.length; j++) {
            if (Math.abs(yVals[j] - yVals[j - 1]) > yRange * 0.25) {
                ctx.moveTo(toGX(xVals[j]), toGY(yVals[j]));
            } else {
                ctx.lineTo(toGX(xVals[j]), toGY(yVals[j]));
            }
        }
        ctx.stroke();
        ctx.restore();
    }
    if (_isChrono || _isBoth) {
        _drawCrosses(sim.chronoSnaps, _currentRunColor || '#2a5080', 1.0);
    }

    /* ── Hover point le plus proche (toutes courbes visibles) ── */
    if (hoverPos) {
        var mx = hoverPos.x;
        var my = hoverPos.y;
        if (mx >= x0 + ml && mx <= x0 + ml + plotW &&
            my >= y0 + mt && my <= y0 + mt + plotH) {

            /* Construire la liste de tous les datasets visibles */
            var _candidates = [];
            if (_isChrono) {
                if (sim.chronoSnaps.length > 0) {
                    _candidates.push({ pts: sim.chronoSnaps, color: _currentRunColor || '#2a5080' });
                }
                for (var _hi = 0; _hi < savedRuns.length; _hi++) {
                    var _hsr = savedRuns[_hi];
                    if (!_hsr.hidden && _hsr.chronoSnaps.length > 0) {
                        _candidates.push({ pts: _hsr.chronoSnaps, color: _hsr.color });
                    }
                }
            } else {
                if (data.length >= 2) {
                    _candidates.push({ pts: data, color: _currentRunColor || '#2a5080' });
                }
                for (var _hi = 0; _hi < savedRuns.length; _hi++) {
                    var _hsr = savedRuns[_hi];
                    if (!_hsr.hidden && _hsr.graphData.length >= 2) {
                        _candidates.push({ pts: _hsr.graphData, color: _hsr.color });
                    }
                }
            }

            var bestX = 0, bestY = 0, bestColor = '#2a5080', bestDist = Infinity;
            var xl = _parseAxisLabel(info.xlabel);
            var yl = _parseAxisLabel(info.ylabel);
            var bestXVal = 0, bestYVal = 0;

            for (var _ci = 0; _ci < _candidates.length; _ci++) {
                var _cpts  = _candidates[_ci].pts;
                var _cXV   = _cpts.map(info.xFn);
                var _cYV   = _cpts.map(info.col);
                for (var k = 0; k < _cXV.length; k++) {
                    var bx  = toGX(_cXV[k]);
                    var by  = toGY(_cYV[k]);
                    var byc = Math.max(y0 + mt, Math.min(y0 + mt + plotH, by));
                    var dd  = Math.sqrt((bx - mx) * (bx - mx) + (byc - my) * (byc - my));
                    if (dd < bestDist) {
                        bestDist  = dd;
                        bestX     = bx;
                        bestY     = byc;
                        bestColor = _candidates[_ci].color;
                        bestXVal  = _cXV[k];
                        bestYVal  = _cYV[k];
                    }
                }
            }

            if (bestDist < Infinity) {
                ctx.save();
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = 'rgba(60,60,60,0.45)';
                ctx.lineWidth   = 1;
                ctx.beginPath(); ctx.moveTo(bestX, bestY); ctx.lineTo(bestX, y0 + mt + plotH); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(bestX, bestY); ctx.lineTo(x0 + ml, bestY);         ctx.stroke();
                ctx.setLineDash([]);

                ctx.fillStyle = bestColor;
                ctx.beginPath();
                ctx.arc(bestX, bestY, 5, 0, Math.PI * 2);
                ctx.fill();

                var lbl  = xl.name + ' = ' + _fmtLabel(bestXVal) + (xl.unit ? ' ' + xl.unit : '') +
                           '    ' +
                           yl.name + ' = ' + _fmtLabel(bestYVal) + (yl.unit ? ' ' + yl.unit : '');

                ctx.font = _gFontTick + 'px monospace';
                var lblW  = ctx.measureText(lbl).width;
                var lblH  = _gFontTick;
                var PAD   = 5;

                var lx = bestX + 12;
                if (lx + lblW + 8 > x0 + W) lx = bestX - 12 - lblW;
                lx = Math.max(x0 + PAD, Math.min(x0 + W - lblW - PAD, lx));

                var ly = bestY - lblH - 12;
                if (ly < y0 + PAD) ly = bestY + 10;
                ly = Math.max(y0 + PAD, Math.min(y0 + H - lblH - PAD, ly));

                ctx.fillStyle = 'rgba(255,255,255,0.88)';
                ctx.fillRect(lx - PAD, ly - 2, lblW + PAD * 2, lblH + 6);

                ctx.fillStyle    = bestColor;
                ctx.textBaseline = 'top';
                ctx.textAlign    = 'left';
                ctx.fillText(lbl, lx, ly + 1);
                ctx.restore();
            }
        }
    }

    /* ── Point correspondant au hover animation ── */
    if (_animHoverSnap) {
        var snapGX  = toGX(info.xFn(_animHoverSnap));
        var snapGY  = toGY(info.col(_animHoverSnap));
        var snapGYc = Math.max(y0 + mt, Math.min(y0 + mt + plotH, snapGY));
        if (snapGX >= x0 + ml && snapGX <= x0 + ml + plotW) {
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = 'rgba(60,60,60,0.35)';
            ctx.lineWidth   = 1;
            ctx.beginPath(); ctx.moveTo(snapGX, snapGYc); ctx.lineTo(snapGX, y0 + mt + plotH); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(snapGX, snapGYc); ctx.lineTo(x0 + ml, snapGYc);        ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle   = _animHoverSnap.color;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth   = 2;
            ctx.beginPath();
            ctx.arc(snapGX, snapGYc, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    }

    /* ── Curseur temporel ── */
    if (tabKey !== 'y(x)' && !sim.ended && !sim.paused) {
        var cx = toGX(sim.t);
        if (cx >= x0 + ml && cx <= x0 + ml + plotW) {
            ctx.save();
            ctx.strokeStyle = 'rgba(180,80,20,0.6)';
            ctx.lineWidth   = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(cx, y0 + mt);
            ctx.lineTo(cx, y0 + mt + plotH);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }
    }

    /* ── Labels axes ── */
    ctx.fillStyle = '#5a6a78';
    ctx.font      = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';

    /* Axe X (centré sous la zone de tracé) */
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(info.xlabel, x0 + ml + plotW / 2, y0 + H - 2);

    /* Axe Y (pivoté, placé à gauche des chiffres) */
    ctx.save();
    ctx.translate(x0 + Math.max(4, ml - mlRaw - _gFontTitle - 4), y0 + mt + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(info.ylabel, 0, 0);
    ctx.restore();
}
