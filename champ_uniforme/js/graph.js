/* ══════════════════════════════════════════════════
   Simulation pédagogique — Physique-Chimie Lycée
   Auteur  : Mathieu Berdous
   Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
══════════════════════════════════════════════════ */

/* graph.js — rendu canvas graphes */

var _gCanvas = null;
var _gCtx    = null;
var _gW = 0, _gH = 0;

/* Marge intérieure des graphes */
var GM = {t: 28, b: 36, l: 52, r: 16};

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
    if (!ctrl) return;
    ctrl.innerHTML = '';

    /* Bouton 1/2 graphes */
    var btnDual = document.createElement('button');
    btnDual.className = 'graph-mode-btn' + (sim.graphMode === 'dual' ? ' active' : '');
    btnDual.id = 'btn-graph-dual';
    btnDual.textContent = sim.graphMode === 'dual' ? '2 graphes' : '1 graphe';
    btnDual.onclick = function () { toggleDualGraph(); };
    ctrl.appendChild(btnDual);

    /* Séparateur */
    var sep = document.createElement('div');
    sep.style.cssText = 'flex:1';
    ctrl.appendChild(sep);

    if (sim.graphMode === 'single') {
        /* Rangée unique d'onglets */
        var row = _makeTabRow('tab1', sim.graphTab1, function(key){
            sim.graphTab1 = key;
            _buildGraphCtrl();
        });
        ctrl.appendChild(row);
    } else {
        /* Deux rangées */
        var sep1 = document.createElement('div');
        sep1.style.cssText = 'display:flex;flex-direction:column;gap:2px;align-items:flex-end';

        var lbl1 = document.createElement('span');
        lbl1.style.cssText = 'font-size:10px;color:#7a8a96;font-weight:700;letter-spacing:0.5px;margin-right:4px';
        lbl1.textContent = 'GAUCHE';
        sep1.appendChild(lbl1);
        sep1.appendChild(_makeTabRow('tab1', sim.graphTab1, function(key){
            sim.graphTab1 = key;
            _buildGraphCtrl();
        }));

        var lbl2 = document.createElement('span');
        lbl2.style.cssText = 'font-size:10px;color:#7a8a96;font-weight:700;letter-spacing:0.5px;margin-right:4px';
        lbl2.textContent = 'DROITE';
        sep1.appendChild(lbl2);
        sep1.appendChild(_makeTabRow('tab2', sim.graphTab2, function(key){
            sim.graphTab2 = key;
            _buildGraphCtrl();
        }));

        ctrl.appendChild(sep1);
    }
}

function _makeTabRow(rowId, activeKey, onSelect) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end';

    GRAPH_TABS.forEach(function(tab) {
        var btn = document.createElement('button');
        btn.className = 'graph-mode-btn' + (tab.key === activeKey ? ' active' : '');
        btn.textContent = tab.key;
        btn.onclick = function () { onSelect(tab.key); };
        row.appendChild(btn);
    });

    return row;
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
        var halfW = Math.floor(_gW / 2);
        /* Panneau gauche */
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, halfW - 1, _gH);
        ctx.clip();
        _drawOneGraph(ctx, 0, 0, halfW - 1, _gH, sim.graphTab1);
        ctx.restore();

        /* Séparateur */
        ctx.fillStyle = '#c8c0b4';
        ctx.fillRect(halfW - 1, 0, 2, _gH);

        /* Panneau droit */
        ctx.save();
        ctx.translate(halfW + 1, 0);
        ctx.beginPath();
        ctx.rect(0, 0, _gW - halfW - 1, _gH);
        ctx.clip();
        _drawOneGraph(ctx, 0, 0, _gW - halfW - 1, _gH, sim.graphTab2);
        ctx.restore();
    } else {
        _drawOneGraph(ctx, 0, 0, _gW, _gH, sim.graphTab1);
    }
}

/* ─────────────────────────────────────────────────
   _drawOneGraph — dessine un graphe dans (x0,y0,W,H)
───────────────────────────────────────────────── */
function _drawOneGraph(ctx, x0, y0, W, H, tabKey) {
    var info = _tabInfo(tabKey);
    var data = sim.graphData;

    if (data.length < 2) {
        /* Message vide */
        ctx.fillStyle = '#b0a898';
        ctx.font = 'italic ' + Math.max(11, Math.min(14, H * 0.06)) + 'px Segoe UI, Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Lancez la simulation pour afficher le graphe', x0 + W/2, y0 + H/2);
        return;
    }

    /* Extraction des données */
    var xVals = data.map(info.xFn);
    var yVals = data.map(info.col);

    /* Bornes */
    var xMin = xVals[0], xMax = xVals[xVals.length - 1];
    if (xMin === xMax) xMax = xMin + 1;

    var yMin = Infinity, yMax = -Infinity;
    for (var i = 0; i < yVals.length; i++) {
        if (yVals[i] < yMin) yMin = yVals[i];
        if (yVals[i] > yMax) yMax = yVals[i];
    }
    if (yMin === yMax) { yMin -= 1; yMax += 1; }

    var yPad = (yMax - yMin) * 0.12;
    yMin -= yPad; yMax += yPad;

    var ml = GM.l, mr = GM.r, mt = GM.t, mb = GM.b;
    var plotW = W - ml - mr;
    var plotH = H - mt - mb;

    function toGX(v) { return x0 + ml + (v - xMin) / (xMax - xMin) * plotW; }
    function toGY(v) { return y0 + mt + plotH - (v - yMin) / (yMax - yMin) * plotH; }

    /* Grille Y */
    var ticksY = _niceTicks(yMin, yMax, Math.max(3, Math.floor(plotH / 35)));
    ctx.strokeStyle = '#e0dcd8';
    ctx.lineWidth = 1;
    var fTick = Math.max(9, Math.min(12, H * 0.05));
    ctx.font = fTick + 'px Segoe UI, Arial';
    ctx.fillStyle = '#7a8a96';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ticksY.forEach(function(v) {
        var gy = toGY(v);
        if (gy < y0 + mt - 2 || gy > y0 + mt + plotH + 2) return;
        ctx.beginPath();
        ctx.moveTo(x0 + ml, gy);
        ctx.lineTo(x0 + ml + plotW, gy);
        ctx.stroke();
        ctx.fillText(_fmtTick(v), x0 + ml - 4, gy);
    });

    /* Grille X */
    var ticksX = _niceTicks(xMin, xMax, Math.max(3, Math.floor(plotW / 50)));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ticksX.forEach(function(v) {
        var gx = toGX(v);
        if (gx < x0 + ml - 2 || gx > x0 + ml + plotW + 2) return;
        ctx.strokeStyle = '#e0dcd8';
        ctx.beginPath();
        ctx.moveTo(gx, y0 + mt);
        ctx.lineTo(gx, y0 + mt + plotH);
        ctx.stroke();
        ctx.fillStyle = '#7a8a96';
        ctx.fillText(_fmtTick(v), gx, y0 + mt + plotH + 4);
    });

    /* Ligne zéro */
    if (yMin < 0 && yMax > 0) {
        var zy = toGY(0);
        ctx.strokeStyle = '#b0a898';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(x0 + ml, zy);
        ctx.lineTo(x0 + ml + plotW, zy);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    /* Bordure zone de tracé */
    ctx.strokeStyle = '#c8c0b4';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + ml, y0 + mt, plotW, plotH);

    /* Courbe */
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 + ml, y0 + mt, plotW, plotH);
    ctx.clip();
    ctx.strokeStyle = '#2a5080';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(toGX(xVals[0]), toGY(yVals[0]));
    for (var j = 1; j < xVals.length; j++) {
        ctx.lineTo(toGX(xVals[j]), toGY(yVals[j]));
    }
    ctx.stroke();
    ctx.restore();

    /* Curseur temporel (uniquement graphes en t) */
    if (tabKey !== 'y(x)' && !sim.ended && !sim.paused) {
        var cx = toGX(sim.t);
        if (cx >= x0 + ml && cx <= x0 + ml + plotW) {
            ctx.strokeStyle = 'rgba(180,80,20,0.6)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(cx, y0 + mt);
            ctx.lineTo(cx, y0 + mt + plotH);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    /* Labels axes */
    var fLabel = Math.max(10, Math.min(13, H * 0.055));
    ctx.font = 'bold ' + fLabel + 'px Segoe UI, Arial';
    ctx.fillStyle = '#5a6a78';

    /* Axe x */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(info.xlabel, x0 + ml + plotW / 2, y0 + H - 2);

    /* Axe y (rotation) */
    ctx.save();
    ctx.translate(x0 + 11, y0 + mt + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(info.ylabel, 0, 0);
    ctx.restore();
}

/* ─────────────────────────────────────────────────
   Helpers ticks
───────────────────────────────────────────────── */
function _niceTicks(min, max, count) {
    var range = max - min;
    var rawStep = range / count;
    var mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    var norm = rawStep / mag;
    var step = norm < 1.5 ? mag : norm < 3.5 ? 2 * mag : norm < 7 ? 5 * mag : 10 * mag;
    var start = Math.ceil(min / step) * step;
    var ticks = [];
    for (var v = start; v <= max + step * 0.01; v += step) {
        ticks.push(Math.round(v / step) * step);
        if (ticks.length > 20) break;
    }
    return ticks;
}

function _fmtTick(v) {
    if (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)) {
        return v.toExponential(1).replace('.', ',');
    }
    var dec = Math.abs(v) < 10 ? 2 : Math.abs(v) < 100 ? 1 : 0;
    return v.toFixed(dec).replace('.', ',');
}
