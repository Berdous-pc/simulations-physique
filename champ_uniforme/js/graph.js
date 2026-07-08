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

/* Quand true, l'axe du temps est affiché en nanosecondes (mode champ électrique) */
var _graphTimeNs = false;

/* Marge intérieure des graphes — calculée dynamiquement dans _drawOneGraph */

/* Informations par onglet : clé → {label, unit, accessor} */
var GRAPH_TABS = [
    {key: 'x(t)',   xlabel: 't (s)', ylabel: 'x (m)',    yFn: function(d){return d.y_key==='x(t)';},  col: function(d){return d.x;},  xFn: function(d){return d.t;}},
    {key: 'y(t)',   xlabel: 't (s)', ylabel: 'y (m)',    col: function(d){return d.y;},  xFn: function(d){return d.t;}},
    {key: 'vx(t)',  xlabel: 't (s)', ylabel: 'vx (m/s)', col: function(d){return d.vx;}, xFn: function(d){return d.t;}},
    {key: 'vy(t)',  xlabel: 't (s)', ylabel: 'vy (m/s)', col: function(d){return d.vy;}, xFn: function(d){return d.t;}},
    {key: 'ax(t)',  xlabel: 't (s)', ylabel: 'ax (m/s²)',col: function(d){return d.ax;}, xFn: function(d){return d.t;}},
    {key: 'ay(t)',  xlabel: 't (s)', ylabel: 'ay (m/s²)',col: function(d){return d.ay;}, xFn: function(d){return d.t;}},
    {key: 'y(x)',   xlabel: 'x (m)', ylabel: 'y (m)',    col: function(d){return d.y;},  xFn: function(d){return d.x;}},
    /* Champ de pesanteur uniquement : rendu entièrement spécifique (voir _drawEnergiesGraph) */
    {key: 'energies', label: 'Energies', xlabel: 't (s)', ylabel: 'E (J)', modes: ['pesanteur']},
    /* Champ électrique uniquement : Ec = 1/2 m v² (Epp électrique hors programme) */
    {key: 'ec(t)', label: 'Ec(t)', xlabel: 't (s)', ylabel: 'Ec (J)',
     col: function(d){ return 0.5 * d.mass * (d.vx * d.vx + d.vy * d.vy); },
     xFn: function(d){ return d.t; }, modes: ['electrique']}
];

function _tabInfo(key) {
    for (var i = 0; i < GRAPH_TABS.length; i++) {
        if (GRAPH_TABS[i].key === key) return GRAPH_TABS[i];
    }
    return GRAPH_TABS[0];
}

/* Options de graphe disponibles pour le mode courant (pesanteur ou électrique) */
function _availableGraphTabs() {
    var mode = (typeof activeTab !== 'undefined' && activeTab === 'champ-electrique') ? 'electrique' : 'pesanteur';
    return GRAPH_TABS.filter(function(t) { return !t.modes || t.modes.indexOf(mode) !== -1; });
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
    var _s = (typeof activeTab !== 'undefined' && activeTab === 'champ-electrique') ? simE : sim;

    if (_s.graphMode === 'single') {
        ctrl.style.cssText = '';
        if (sep) sep.style.display = 'none';

        ctrl.appendChild(_makeDualBtn(_s));
        ctrl.appendChild(_makeSelect('sel-tab1', _s.graphTab1, function(key) {
            _s.graphTab1 = key;
            _buildGraphCtrl();
        }));
        if (_s.graphTab1 === 'energies') ctrl.appendChild(_makeEnergyControls(1));

    } else {
        /* Mode dual : le séparateur DOM (#graph-dual-sep) couvre toute la hauteur.
           Les deux moitiés du ctrl s'alignent sur 50% sans border CSS. */
        ctrl.style.cssText = 'display:flex;align-items:stretch;padding:0;gap:0';
        if (sep) sep.style.display = 'block';

        var leftHalf = document.createElement('div');
        leftHalf.style.cssText = 'flex:1;display:flex;align-items:center;gap:6px;' +
            'padding:3px 8px;min-width:0;overflow-x:auto';
        leftHalf.appendChild(_makeDualBtn(_s));
        leftHalf.appendChild(_makeSelect('sel-tab1', _s.graphTab1, function(key) {
            _s.graphTab1 = key;
            _buildGraphCtrl();
        }));
        if (_s.graphTab1 === 'energies') leftHalf.appendChild(_makeEnergyControls(1));
        ctrl.appendChild(leftHalf);

        var rightHalf = document.createElement('div');
        rightHalf.style.cssText = 'flex:1;display:flex;align-items:center;gap:6px;' +
            'padding:3px 8px;min-width:0;overflow-x:auto';
        rightHalf.appendChild(_makeSelect('sel-tab2', _s.graphTab2, function(key) {
            _s.graphTab2 = key;
            _buildGraphCtrl();
        }));
        if (_s.graphTab2 === 'energies') rightHalf.appendChild(_makeEnergyControls(2));
        ctrl.appendChild(rightHalf);
    }
}

/* Sélecteur de run + checkboxes Ec/Epp/Em pour le graphe "Energies" (pesanteur) */
function _makeEnergyControls(slot) {
    var cfg = (slot === 2) ? sim.energyCfg2 : sim.energyCfg1;
    var wrap = document.createElement('span');
    wrap.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0';

    var runSel = document.createElement('select');
    runSel.className = 'graph-select';
    runSel.style.cssText = 'min-width:130px;flex-shrink:0';
    var optCur = document.createElement('option');
    optCur.value = 'current';
    optCur.textContent = 'Simulation actuelle';
    if (cfg.runId === null) optCur.selected = true;
    runSel.appendChild(optCur);
    savedRuns.forEach(function(r, idx) {
        var opt = document.createElement('option');
        opt.value = String(r.id);
        opt.textContent = 'Simulation n°' + (idx + 1);
        if (cfg.runId === r.id) opt.selected = true;
        runSel.appendChild(opt);
    });
    runSel.onchange = function() {
        cfg.runId = (runSel.value === 'current') ? null : parseInt(runSel.value);
    };
    wrap.appendChild(runSel);

    function makeCheckbox(label, color, key) {
        var lab = document.createElement('label');
        lab.style.cssText = 'display:flex;align-items:center;gap:3px;' +
            'font-size:clamp(10px,0.95vw,12px);color:' + color + ';font-weight:700;white-space:nowrap;';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = cfg[key];
        cb.onchange = function() { cfg[key] = cb.checked; };
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(label));
        return lab;
    }
    wrap.appendChild(makeCheckbox('Ec',  COL_ENERGY_EC,  'ec'));
    wrap.appendChild(makeCheckbox('Epp', COL_ENERGY_EPP, 'epp'));
    wrap.appendChild(makeCheckbox('Em',  COL_ENERGY_EM,  'em'));

    return wrap;
}

function _makeDualBtn(_s) {
    if (!_s) _s = sim;
    var btn = document.createElement('button');
    btn.className = 'graph-mode-btn' + (_s.graphMode === 'dual' ? ' active' : '');
    btn.id = 'btn-graph-dual';
    btn.textContent = _s.graphMode === 'dual' ? '2 graphes' : '1 graphe';
    btn.style.cssText = 'flex-shrink:0';
    btn.onclick = function () { toggleDualGraph(); };
    return btn;
}

function _makeSelect(id, activeKey, onChange) {
    var sel = document.createElement('select');
    sel.id = id;
    sel.className = 'graph-select';
    _availableGraphTabs().forEach(function(tab) {
        var opt = document.createElement('option');
        opt.value = tab.key;
        opt.textContent = tab.label || tab.key;
        if (tab.key === activeKey) opt.selected = true;
        sel.appendChild(opt);
    });
    sel.onchange = function() { onChange(sel.value); };
    return sel;
}

function toggleDualGraph() {
    var _s = (typeof activeTab !== 'undefined' && activeTab === 'champ-electrique') ? simE : sim;
    _s.graphMode = (_s.graphMode === 'dual') ? 'single' : 'dual';
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
        _drawOneGraph(ctx, 0, 0, leftW, _gH, sim.graphTab1, _gHoverPos, 1);
        ctx.restore();

        ctx.save();
        ctx.translate(halfW + 1, 0);
        ctx.beginPath(); ctx.rect(0, 0, rightW, _gH); ctx.clip();
        _drawOneGraph(ctx, 0, 0, rightW, _gH, sim.graphTab2, hoverRight, 2);
        ctx.restore();
    } else {
        _drawOneGraph(ctx, 0, 0, _gW, _gH, sim.graphTab1, _gHoverPos, 1);
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
function _calcGraphLeftMarginRaw(ctx, yMin, yMax, fmtFn) {
    fmtFn = fmtFn || _fmtLabel;
    ctx.font = _gFontTick + 'px monospace';
    var step  = _niceStep(yMax - yMin, 5);
    var start = Math.ceil(yMin / step) * step;
    var wMax  = 0;
    for (var v = start; v <= yMax + step * 0.01; v += step) {
        var w = ctx.measureText(fmtFn(Math.round(v / step) * step)).width;
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

var COL_ENERGY_EC  = '#c0392b';
var COL_ENERGY_EPP = '#2a6aaa';
var COL_ENERGY_EM  = '#27ae60';

/* ─────────────────────────────────────────────────
   _drawEnergiesGraph — graphe "Energies" (champ de pesanteur uniquement)
   Rendu dédié : une seule run affichée (sélecteur), Ec/Epp/Em au choix
   (checkboxes), cadrage indépendant du graphBounds partagé/du bouton loupe.
───────────────────────────────────────────────── */
function _drawEnergiesGraph(ctx, x0, y0, W, H, hoverPos, slot) {
    var cfg = (slot === 2) ? sim.energyCfg2 : sim.energyCfg1;
    var run = (cfg.runId === null) ? null : savedRuns.find(function(r) { return r.id === cfg.runId; });
    var data = run ? run.graphData : sim.graphData;
    var mass = run ? run.mass : sim.mass;
    var g    = run ? run.g    : sim.g;
    /* Bornes figées au dernier Lancer, propres à la run sélectionnée dans le
       sélecteur — jamais recalculées à chaque changement de paramètre, et
       jamais affectées par "Adapter" (🔍) sur une autre run ou par la fusion
       multi-runs utilisée pour les autres graphes. */
    var gb = run ? run.graphBounds : sim.committedOwnGraphBounds;

    _updateGraphFontSizes(H);

    var displayMode = run ? run.displayMode : sim.displayMode;
    var isChrono = (displayMode === 'chrono');
    var isBoth   = (displayMode === 'both');

    var tArr = [], ecArr = [], eppArr = [], emArr = [];
    if (data) {
        for (var i = 0; i < data.length; i++) {
            var d = data[i];
            var ec  = 0.5 * mass * (d.vx * d.vx + d.vy * d.vy);
            var epp = mass * g * d.y;
            tArr.push(d.t); ecArr.push(ec); eppArr.push(epp); emArr.push(ec + epp);
        }
    }

    /* Chronophotographie : mêmes grandeurs calculées sur les instants figés */
    var tArrC = [], ecArrC = [], eppArrC = [], emArrC = [];
    if (isChrono || isBoth) {
        var snaps = run ? run.chronoSnaps : sim.chronoSnaps;
        if (snaps) {
            for (var si = 0; si < snaps.length; si++) {
                var s = snaps[si];
                var ecs  = 0.5 * mass * (s.vx * s.vx + s.vy * s.vy);
                var epps = mass * g * s.y;
                tArrC.push(s.t); ecArrC.push(ecs); eppArrC.push(epps); emArrC.push(ecs + epps);
            }
        }
    }

    var xMin, xMax, yMin, yMax;
    if (gb && gb.t && gb.energy) {
        xMin = 0; xMax = gb.t.max;
        yMin = gb.energy.min; yMax = gb.energy.max;
        if (xMin === xMax) { xMax += 0.5; }
        if (yMin === yMax) { yMin -= 1; yMax += 1; }
        var yPad = (yMax - yMin) * 0.12; yMin -= yPad; yMax += yPad;
        var xPad = (xMax - xMin) * 0.04; xMax += xPad;
    } else {
        xMin = 0; xMax = 10; yMin = -1; yMax = 10;
    }

    var mlRaw = _calcGraphLeftMarginRaw(ctx, yMin, yMax, _fmtLabel);
    var ml = mlRaw + _gFontTitle + 8;
    var mr = Math.max(10, Math.min(20, W * 0.04));
    var mt = Math.max(10, Math.round(_gFontTick * 0.8));
    var mb = Math.max(28, Math.round(_gFontTick * 1.6 + _gFontTitle * 1.5 + 4));
    var plotW = W - ml - mr, plotH = H - mt - mb;
    if (plotW < 20 || plotH < 20) return;

    function toGX(v) { return x0 + ml + (v - xMin) / (xMax - xMin) * plotW; }
    function toGY(v) { return y0 + mt + plotH - (v - yMin) / (yMax - yMin) * plotH; }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x0 + ml, y0 + mt, plotW, plotH);

    /* Grille Y */
    var stepY = _niceStep(yMax - yMin, Math.max(3, Math.floor(plotH / 55)));
    var startY = Math.ceil(yMin / stepY) * stepY;
    ctx.font = _gFontTick + 'px monospace';
    ctx.fillStyle = '#7a8a96';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var vy = startY; vy <= yMax + stepY * 0.01; vy += stepY) {
        var vyr = Math.round(vy / stepY) * stepY;
        var gy = toGY(vyr);
        if (gy < y0 + mt - 2 || gy > y0 + mt + plotH + 2) continue;
        ctx.strokeStyle = (vyr === 0) ? 'rgba(44,62,80,0.20)' : 'rgba(200,192,180,0.55)';
        ctx.lineWidth = (vyr === 0) ? 1.2 : 0.8;
        ctx.beginPath(); ctx.moveTo(x0 + ml, gy); ctx.lineTo(x0 + ml + plotW, gy); ctx.stroke();
        ctx.fillText(_fmtLabel(vyr), x0 + ml - 6, gy);
    }

    /* Grille X */
    var stepX = _niceStep(xMax - xMin, Math.max(3, Math.floor(plotW / 80)));
    var startX = Math.ceil(xMin / stepX) * stepX;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (var vx = startX; vx <= xMax + stepX * 0.01; vx += stepX) {
        var vxr = Math.round(vx / stepX) * stepX;
        var gx = toGX(vxr);
        if (gx < x0 + ml - 2 || gx > x0 + ml + plotW + 2) continue;
        ctx.strokeStyle = 'rgba(200,192,180,0.55)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(gx, y0 + mt); ctx.lineTo(gx, y0 + mt + plotH); ctx.stroke();
        ctx.fillText(_fmtLabel(vxr), gx, y0 + mt + plotH + 4);
    }

    if (yMin < 0 && yMax > 0) {
        var zy = toGY(0);
        ctx.save();
        ctx.strokeStyle = 'rgba(44,62,80,0.30)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x0 + ml, zy); ctx.lineTo(x0 + ml + plotW, zy); ctx.stroke();
        ctx.restore();
    }

    ctx.strokeStyle = '#c8c0b4'; ctx.lineWidth = 1;
    ctx.strokeRect(x0 + ml, y0 + mt, plotW, plotH);

    function drawCurve(vals, color) {
        ctx.save();
        ctx.beginPath(); ctx.rect(x0 + ml, y0 + mt, plotW, plotH); ctx.clip();
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
        var yRange = yMax - yMin;
        ctx.beginPath();
        ctx.moveTo(toGX(tArr[0]), toGY(vals[0]));
        for (var j = 1; j < tArr.length; j++) {
            /* Discontinuité (ex : Em qui chute au contact du sol) : lever le
               stylo au lieu de tracer un trait vertical artificiel */
            if (Math.abs(vals[j] - vals[j - 1]) > yRange * 0.25) {
                ctx.moveTo(toGX(tArr[j]), toGY(vals[j]));
            } else {
                ctx.lineTo(toGX(tArr[j]), toGY(vals[j]));
            }
        }
        ctx.stroke();
        ctx.restore();
    }
    function drawCrosses(vals, color) {
        if (tArrC.length === 0) return;
        ctx.save();
        ctx.beginPath(); ctx.rect(x0 + ml, y0 + mt, plotW, plotH); ctx.clip();
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        var S = 5;
        for (var ci2 = 0; ci2 < tArrC.length; ci2++) {
            var cgx = toGX(tArrC[ci2]), cgy = toGY(vals[ci2]);
            ctx.beginPath();
            ctx.moveTo(cgx - S, cgy - S); ctx.lineTo(cgx + S, cgy + S);
            ctx.moveTo(cgx + S, cgy - S); ctx.lineTo(cgx - S, cgy + S);
            ctx.stroke();
        }
        ctx.restore();
    }
    if (!isChrono && tArr.length >= 2) {
        if (cfg.ec)  drawCurve(ecArr,  COL_ENERGY_EC);
        if (cfg.epp) drawCurve(eppArr, COL_ENERGY_EPP);
        if (cfg.em)  drawCurve(emArr,  COL_ENERGY_EM);
    }
    if (isChrono || isBoth) {
        if (cfg.ec)  drawCrosses(ecArrC,  COL_ENERGY_EC);
        if (cfg.epp) drawCrosses(eppArrC, COL_ENERGY_EPP);
        if (cfg.em)  drawCrosses(emArrC,  COL_ENERGY_EM);
    }

    /* Hover : point le plus proche parmi les courbes affichées
       (mêmes données que celles tracées : graphData en trajectoire/both, chronoSnaps en chrono) */
    var hoverT = isChrono ? tArrC : tArr;
    if (hoverPos && hoverT.length >= 2) {
        var mx = hoverPos.x, my = hoverPos.y;
        if (mx >= x0 + ml && mx <= x0 + ml + plotW && my >= y0 + mt && my <= y0 + mt + plotH) {
            var cands = [];
            if (cfg.ec)  cands.push({ vals: isChrono ? ecArrC  : ecArr,  color: COL_ENERGY_EC,  name: 'Ec' });
            if (cfg.epp) cands.push({ vals: isChrono ? eppArrC : eppArr, color: COL_ENERGY_EPP, name: 'Epp' });
            if (cfg.em)  cands.push({ vals: isChrono ? emArrC  : emArr,  color: COL_ENERGY_EM,  name: 'Em' });
            var bestDist = Infinity, bestX = 0, bestY = 0, bestColor = '#333', bestName = '', bestXVal = 0, bestYVal = 0;
            for (var ci = 0; ci < cands.length; ci++) {
                for (var k = 0; k < hoverT.length; k++) {
                    var bx = toGX(hoverT[k]), by = toGY(cands[ci].vals[k]);
                    var byc = Math.max(y0 + mt, Math.min(y0 + mt + plotH, by));
                    var dd = Math.hypot(bx - mx, byc - my);
                    if (dd < bestDist) {
                        bestDist = dd; bestX = bx; bestY = byc;
                        bestColor = cands[ci].color; bestName = cands[ci].name;
                        bestXVal = hoverT[k]; bestYVal = cands[ci].vals[k];
                    }
                }
            }
            if (bestDist < Infinity) {
                ctx.save();
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = 'rgba(60,60,60,0.45)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(bestX, bestY); ctx.lineTo(bestX, y0 + mt + plotH); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(bestX, bestY); ctx.lineTo(x0 + ml, bestY); ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = bestColor;
                ctx.beginPath(); ctx.arc(bestX, bestY, 5, 0, Math.PI * 2); ctx.fill();

                var lbl = 't = ' + _fmtLabel(bestXVal) + ' s    ' + bestName + ' = ' + _fmtLabel(bestYVal) + ' J';
                ctx.font = _gFontTick + 'px monospace';
                var lblW = ctx.measureText(lbl).width, lblH = _gFontTick, PAD = 5;
                var lx = bestX + 12;
                if (lx + lblW + 8 > x0 + W) lx = bestX - 12 - lblW;
                lx = Math.max(x0 + PAD, Math.min(x0 + W - lblW - PAD, lx));
                var ly = bestY - lblH - 12;
                if (ly < y0 + PAD) ly = bestY + 10;
                ly = Math.max(y0 + PAD, Math.min(y0 + H - lblH - PAD, ly));
                ctx.fillStyle = 'rgba(255,255,255,0.88)';
                ctx.fillRect(lx - PAD, ly - 2, lblW + PAD * 2, lblH + 6);
                ctx.fillStyle = bestColor;
                ctx.textBaseline = 'top'; ctx.textAlign = 'left';
                ctx.fillText(lbl, lx, ly + 1);
                ctx.restore();
            }
        }
    }

    /* Labels axes */
    ctx.fillStyle = '#5a6a78';
    ctx.font = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('t (s)', x0 + ml + plotW / 2, y0 + H - 2);
    ctx.save();
    ctx.translate(x0 + Math.max(4, ml - mlRaw - _gFontTitle - 4), y0 + mt + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('E (J)', 0, 0);
    ctx.restore();
}

/* ─────────────────────────────────────────────────
   _drawOneGraph — dessine un graphe dans (x0,y0,W,H)
───────────────────────────────────────────────── */
function _drawOneGraph(ctx, x0, y0, W, H, tabKey, hoverPos, slot) {
    if (tabKey === 'energies') { _drawEnergiesGraph(ctx, x0, y0, W, H, hoverPos, slot || 1); return; }
    var info = _tabInfo(tabKey);
    var data = sim.graphData;

    /* Mode nanoseconde : scale temporel pour x quand tabKey ≠ 'y(x)' */
    var _isTimeTab = (tabKey !== 'y(x)');
    var _xScale    = (_graphTimeNs && _isTimeTab) ? 1e9 : 1;
    var _xFn       = _xScale === 1 ? info.xFn : function(d) { return info.xFn(d) * 1e9; };
    var _xlabel    = (_graphTimeNs && _isTimeTab) ? info.xlabel.replace('(s)', '(ns)') : info.xlabel;

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
        'y(x)':  { xb: gb && gb.x,  yb: gb && gb.y  },
        'ec(t)': { xb: gb && gb.t,  yb: gb && gb.ec }
    };
    var bnd = keyMap[tabKey];
    if (gb && bnd && bnd.xb && bnd.yb) {
        xMin = bnd.xb.min * _xScale; xMax = bnd.xb.max * _xScale;
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

    /* Zoom (armatures parallèles à l'axe x, champ électrique) : tous les graphes
       suivent la même fenêtre que l'animation zoomée — position, vitesse et
       accélération inclus. */
    if (typeof activeTab !== 'undefined' && activeTab === 'champ-electrique' &&
        sim.armatureMode === 'parallel-x' && sim.zoomLevel !== 0) {
        var _effX = _effXMaxE(sim);
        var _effY = _effYMaxE(sim);
        /* vx constante en mode parallel-x (le champ ne dévie que selon y) :
           le temps pour atteindre _effX se déduit directement de v0·cos(alpha). */
        var _vxConst = sim.v0 * Math.cos(sim.alpha * Math.PI / 180);
        var _effT    = Math.abs(_vxConst) > 1e-9 ? _effX / Math.abs(_vxConst) * _xScale : xMax;

        if (tabKey === 'x(t)') { xMax = _effT; yMax = _effX; yMin = Math.max(yMin, 0); }
        else if (tabKey === 'y(t)') { xMax = _effT; yMax = _effY; yMin = -_effY; }
        else if (tabKey === 'y(x)') { xMax = _effX; yMax = _effY; yMin = -_effY; }
        else if (_isTimeTab) { xMax = _effT; } /* vx(t), vy(t), ax(t), ay(t) */
    }

    /* Vitesses/accélérations/énergie en champ électrique : écriture scientifique (3 c.s.) */
    var _isVelAccTab = (tabKey === 'vx(t)' || tabKey === 'vy(t)' || tabKey === 'ax(t)' || tabKey === 'ay(t)' || tabKey === 'ec(t)');
    var _useSciY = _isVelAccTab && typeof activeTab !== 'undefined' && activeTab === 'champ-electrique';
    var _yFmtFn  = _useSciY ? function(v) { return fmtSci(v, 3); } : _fmtLabel;

    /* ── Polices et marges dynamiques ── */
    _updateGraphFontSizes(H);
    var mlRaw = _calcGraphLeftMarginRaw(ctx, yMin, yMax, _yFmtFn);
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

        ctx.fillText(_yFmtFn(vyr), x0 + ml - 6, gy);
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
            var _gx = toGX(_xFn(pts[_ci2]));
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
                var _srX = _srData.map(_xFn);
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
        var xVals = data.map(_xFn);
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
            var xl = _parseAxisLabel(_xlabel);
            var yl = _parseAxisLabel(info.ylabel);
            var bestXVal = 0, bestYVal = 0;

            for (var _ci = 0; _ci < _candidates.length; _ci++) {
                var _cpts  = _candidates[_ci].pts;
                var _cXV   = _cpts.map(_xFn);
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
                           yl.name + ' = ' + _yFmtFn(bestYVal) + (yl.unit ? ' ' + yl.unit : '');

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
        var snapGX  = toGX(_xFn(_animHoverSnap));
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
        var cx = toGX(sim.t * _xScale);
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
    ctx.fillText(_xlabel, x0 + ml + plotW / 2, y0 + H - 2);

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

/* ══════════════════════════════════════════════════
   CHAMP ÉLECTRIQUE — graphe (sim-swap)
══════════════════════════════════════════════════ */
function drawGraphE() {
    if (!_gCtx) return;
    var _simOrig   = sim;
    var _runsOrig  = savedRuns;
    var _colOrig   = _currentRunColor;
    var _hOrig     = _animHoverSnap;
    sim              = simE;
    savedRuns        = _visibleSavedRunsE();
    _currentRunColor = _currentRunColorE;
    _animHoverSnap   = _animHoverSnapE;
    _graphTimeNs     = true;

    drawGraph();

    _graphTimeNs     = false;
    sim              = _simOrig;
    savedRuns        = _runsOrig;
    _currentRunColor = _colOrig;
    _animHoverSnap   = _hOrig;
}
