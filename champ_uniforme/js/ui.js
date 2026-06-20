/* ══════════════════════════════════════════════════
   Simulation pédagogique — Physique-Chimie Lycée
   Auteur  : Mathieu Berdous
   Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
══════════════════════════════════════════════════ */

/* ui.js — boucle principale + bindings UI */

var activeTab = 'champ-pesanteur';
var validTabs = ['champ-pesanteur', 'champ-electrique'];

/* ─────────────────────────────────────────────────
   Boucle d'animation
───────────────────────────────────────────────── */
var _lastTs = null;

function loop(ts) {
    requestAnimationFrame(loop);

    if (_lastTs === null) { _lastTs = ts; return; }
    var dtReal = Math.min((ts - _lastTs) / 1000, 0.05);  // plafond 50 ms
    _lastTs = ts;

    if (activeTab === 'champ-pesanteur') {
        var _wasEnded = sim.ended;
        advanceSim(dtReal);
        if (!_wasEnded && sim.ended) _updatePlayBtn();

        if (_replayPlaying) {
            _replayT += dtReal * sim.speedFactor;
            if (_replayT >= _replayMaxT) {
                _replayT = _replayMaxT;
                _replayPlaying = false;
                var btnR = document.getElementById('btn-tout-rejouer');
                if (btnR) btnR.classList.remove('active');
            }
        }

        drawAnim();
        drawGraph();
    }
}

/* ─────────────────────────────────────────────────
   Initialisation
───────────────────────────────────────────────── */
function init() {
    /* Deep-linking hash */
    var hash = window.location.hash.replace('#', '');
    if (validTabs.indexOf(hash) !== -1) activeTab = hash;

    setMainTab(activeTab);
    initAnimCanvas();
    initGraphCanvas();
    resetSim();
    _syncAllUI();
    renderSavedRuns();
    requestAnimationFrame(loop);

    var tabsEl = document.getElementById('saved-runs-tabs');
    if (tabsEl) tabsEl.addEventListener('scroll', _updateTabsScrollBtns);
    _lockAxisBtnWidth();
}

window.addEventListener('DOMContentLoaded', init);

/* ─────────────────────────────────────────────────
   Dropdowns toolbar (Vue, Vecteurs…)
───────────────────────────────────────────────── */
var _openToolbarDropdown = null;

function toggleToolbarDropdown(name) {
    var opening = _openToolbarDropdown !== name;
    _closeAllToolbarDropdowns();
    if (opening) {
        var dd = document.getElementById('toolbar-drop-' + name);
        var btn = dd && dd.previousElementSibling;
        if (dd) dd.classList.add('open');
        if (btn) btn.classList.add('active');
        _openToolbarDropdown = name;
    }
}

function _closeAllToolbarDropdowns() {
    document.querySelectorAll('.toolbar-dropdown.open').forEach(function(d) { d.classList.remove('open'); });
    document.querySelectorAll('.toolbar-dropdown-btn.active').forEach(function(b) { b.classList.remove('active'); });
    _openToolbarDropdown = null;
}

function setVecDisplayMode(mode) {
    vecDisplayMode = mode;
    document.querySelectorAll('#toolbar-drop-vecteurs .toolbar-drop-item').forEach(function(btn) {
        btn.classList.toggle('selected', btn.dataset.mode === mode);
    });
    _closeAllToolbarDropdowns();
}
function setViewMode(mode) { _closeAllToolbarDropdowns(); }

/* Ferme les dropdowns toolbar si on clique en dehors */
document.addEventListener('click', function(e) {
    if (_openToolbarDropdown && !e.target.closest('.toolbar-dropdown-wrap')) {
        _closeAllToolbarDropdowns();
    }
    /* Ferme le dropdown run si on clique en dehors */
    if (_openDropdownId === null) return;
    if (!e.target.closest('#run-tab-dropdown') && !e.target.closest('#saved-runs-tabs')) {
        closeRunDropdown();
    }
});

window.addEventListener('resize', function () {
    /* Si le splitter avait fixé des hauteurs px, on les réinitialise
       pour que le flex CSS reprenne le contrôle au nouveau viewport. */
    var animArea  = document.getElementById('anim-area');
    var graphArea = document.getElementById('graph-area');
    if (animArea)  { animArea.style.flex  = ''; animArea.style.height  = ''; }
    if (graphArea) { graphArea.style.flex = ''; graphArea.style.height = ''; }
    resizeAnimCanvas();
    resizeGraphCanvas();
    _updateTabsScrollBtns();
    computeScale(_animW, _animH);
});

/* ─────────────────────────────────────────────────
   Changement de tab principal
───────────────────────────────────────────────── */
function setMainTab(tab) {
    activeTab = tab;
    validTabs.forEach(function (t) {
        var sec = document.getElementById('section-' + t);
        var btn = document.getElementById('tab-' + t);
        if (sec) sec.style.display = (t === tab) ? '' : 'none';
        if (btn) btn.classList.toggle('active', t === tab);
    });
    window.location.hash = '#' + tab;
}

/* ─────────────────────────────────────────────────
   Contrôles play / pause / reset
───────────────────────────────────────────────── */
function togglePause() {
    if (sim.ended) {
        /* Remettre à zéro automatiquement si la simulation est terminée */
        resetSimAnim();
        sim.paused = false;
    } else {
        sim.paused = !sim.paused;
    }
    _updatePlayBtn();
}

function expandBoundsGlobal() {
    sim.xMax        = sim._ownXMax || sim.xMax;
    sim.yMax        = sim._ownYMax || sim.yMax;
    sim.maxT        = sim._ownMaxT || sim.maxT;
    var gb = JSON.parse(JSON.stringify(sim._ownGraphBounds || sim.graphBounds));
    for (var i = 0; i < savedRuns.length; i++) {
        var r = savedRuns[i];
        if (r.hidden) continue;
        if (r.xMax > sim.xMax) sim.xMax = r.xMax;
        if (r.yMax > sim.yMax) sim.yMax = r.yMax;
        if (r.maxT > sim.maxT) sim.maxT = r.maxT;
        if (r.graphBounds && gb) {
            var keys = Object.keys(gb);
            for (var k = 0; k < keys.length; k++) {
                var key = keys[k];
                if (r.graphBounds[key]) {
                    if (r.graphBounds[key].min < gb[key].min) gb[key].min = r.graphBounds[key].min;
                    if (r.graphBounds[key].max > gb[key].max) gb[key].max = r.graphBounds[key].max;
                }
            }
        }
    }
    sim.graphBounds = gb;
    computeScale(_animW, _animH);
}

function resetSimAnim() {
    sim.paused = true;
    resetSim();
    expandBoundsGlobal();
    _updateCurrentRunColor();
    _updatePlayBtn();
}

function _updatePlayBtn() {
    var btn = document.getElementById('btn-playpause');
    if (!btn) return;
    if (sim.paused || sim.ended) {
        btn.textContent = '▶ Lancer';
        btn.className = 'btn btn-play';
    } else {
        btn.textContent = '⏸ Pause';
        btn.className = 'btn btn-pause';
    }
    var btnSave = document.getElementById('btn-save');
    if (btnSave) btnSave.disabled = !sim.ended;
}

/* ─────────────────────────────────────────────────
   Slider vitesse (crans 0-3 → ×0.1 / ×0.25 / ×0.5 / ×1)
───────────────────────────────────────────────── */
function onSliderSpeed(v) {
    sim.speedFactor = SPEED_VALUES[parseInt(v)];
    document.getElementById('lbl-speed').textContent =
        '×' + sim.speedFactor.toFixed(2).replace('.', ',');
}

/* ─────────────────────────────────────────────────
   Mode affichage trajectoire
───────────────────────────────────────────────── */
function setDisplayMode(mode) {
    sim.displayMode = mode;
    ['trajectory', 'chrono', 'both'].forEach(function (m) {
        var btn = document.getElementById('btn-disp-' + m);
        if (btn) btn.classList.toggle('active', m === mode);
    });
    var dtRow = document.getElementById('deltat-row');
    if (dtRow) dtRow.style.display = (mode === 'chrono' || mode === 'both') ? '' : 'none';
    if (mode === 'chrono' || mode === 'both') {
        _regenerateChronoSnaps();
    }
}

/* Régénère les chronoSnaps de la run courante depuis graphData */
function _regenerateChronoSnaps() {
    sim.chronoSnaps = [];
    var nextT = 0;
    for (var i = 0; i < sim.graphData.length; i++) {
        var d = sim.graphData[i];
        if (d.t >= nextT) {
            sim.chronoSnaps.push({ x: d.x, y: d.y, vx: d.vx, vy: d.vy, ax: d.ax, ay: d.ay, t: d.t });
            nextT += sim.deltaT;
        }
    }
    sim.nextChronoTime = nextT;
}

/* ─────────────────────────────────────────────────
   Vecteurs
───────────────────────────────────────────────── */
function toggleVecPos() {
    sim.showVecPos = !sim.showVecPos;
    document.getElementById('btn-vec-pos').classList.toggle('active', sim.showVecPos);
}
function toggleVecVit() {
    sim.showVecVit = !sim.showVecVit;
    document.getElementById('btn-vec-vit').classList.toggle('active', sim.showVecVit);
}
function toggleVecAcc() {
    sim.showVecAcc = !sim.showVecAcc;
    document.getElementById('btn-vec-acc').classList.toggle('active', sim.showVecAcc);
}
function toggleVecForces() {
    sim.showVecForces = !sim.showVecForces;
    document.getElementById('btn-vec-forces').classList.toggle('active', sim.showVecForces);
}
function toggleVecSumF() {
    sim.showVecSumF = !sim.showVecSumF;
    document.getElementById('btn-vec-sumf').classList.toggle('active', sim.showVecSumF);
}


/* ─────────────────────────────────────────────────
   Conditions initiales
───────────────────────────────────────────────── */
function onSliderMass(v) {
    sim.mass = parseFloat(v);
    document.getElementById('lbl-mass').textContent = fmt(sim.mass, 2);
    resetSimAnim();
}
function onSliderH(v) {
    sim.h = parseFloat(v);
    document.getElementById('lbl-h').textContent = fmt(sim.h, 0);
    resetSimAnim();
}
function onSliderV0(v) {
    sim.v0 = parseFloat(v);
    document.getElementById('lbl-v0').textContent = fmt(sim.v0, 0);
    resetSimAnim();
}
function onSliderAlpha(v) {
    sim.alpha = parseFloat(v);
    document.getElementById('lbl-alpha').textContent = fmt(sim.alpha, 0);
    resetSimAnim();
}

/* ─────────────────────────────────────────────────
   Pesanteur
───────────────────────────────────────────────── */
function onSliderG(v) {
    var val = parseFloat(v);
    if (Math.abs(val - 9.81) < 0.2) { val = 9.81; document.getElementById('sl-g').value = 9.81; }
    sim.g = val;
    document.getElementById('lbl-g').textContent = fmt(sim.g, 2);
    resetSimAnim();
}

/* ─────────────────────────────────────────────────
   Frottements
───────────────────────────────────────────────── */
function toggleFriction() {
    sim.useFriction = !sim.useFriction;
    var btn = document.getElementById('btn-friction');
    if (btn) btn.classList.toggle('active', sim.useFriction);
    resetSimAnim();
}

/* ─────────────────────────────────────────────────
   Vent
───────────────────────────────────────────────── */
function onSliderWind(v) {
    var val = parseFloat(v);
    if (Math.abs(val) < 0.15) { val = 0; document.getElementById('sl-wind').value = 0; }
    sim.windForce = val;
    var lbl = document.getElementById('lbl-wind');
    if (lbl) {
        var sign = val > 0 ? '+' : '';
        lbl.textContent = sign + fmt(val, 1);
    }
    _updateWindTrack(val);
    resetSimAnim();
}

function _updateWindTrack(v) {
    var sl = document.getElementById('sl-wind');
    if (!sl) return;
    var min = parseFloat(sl.min);
    var max = parseFloat(sl.max);
    var pct = (v - min) / (max - min) * 100;
    var center = (-min) / (max - min) * 100;
    var left  = Math.min(pct, center);
    var right = 100 - Math.max(pct, center);
    sl.style.background =
        'linear-gradient(to right,' +
        ' #e0dcd8 0%, #e0dcd8 ' + left + '%,' +
        ' #4a7aaa ' + left + '%, #4a7aaa ' + (100 - right) + '%,' +
        ' #e0dcd8 ' + (100 - right) + '%, #e0dcd8 100%)';
}

/* ─────────────────────────────────────────────────
   Slider Δt
───────────────────────────────────────────────── */
function onSliderDeltaT(v) {
    sim.deltaT = parseFloat(v);
    document.getElementById('lbl-deltat').textContent = fmt(sim.deltaT, 2);
    if (sim.displayMode === 'chrono' || sim.displayMode === 'both') {
        _regenerateChronoSnaps();
    }
}

/* ─────────────────────────────────────────────────
   Synchronisation complète de l'UI sur sim.*
───────────────────────────────────────────────── */
function _syncAllUI() {
    /* Vitesse */
    var speedIdx = SPEED_VALUES.indexOf(sim.speedFactor);
    if (speedIdx === -1) speedIdx = 3;
    var slSpeed = document.getElementById('sl-speed');
    if (slSpeed) slSpeed.value = speedIdx;
    document.getElementById('lbl-speed').textContent =
        '×' + sim.speedFactor.toFixed(2).replace('.', ',');

    /* Conditions initiales */
    _setSl('sl-mass',  sim.mass);    _setTxt('lbl-mass',  fmt(sim.mass, 2));
    _setSl('sl-h',     sim.h);       _setTxt('lbl-h',     fmt(sim.h, 0));
    _setSl('sl-v0',    sim.v0);      _setTxt('lbl-v0',    fmt(sim.v0, 0));
    _setSl('sl-alpha', sim.alpha);   _setTxt('lbl-alpha', fmt(sim.alpha, 0));
    _setSl('sl-g',     sim.g);       _setTxt('lbl-g',     fmt(sim.g, 2));
    _setSl('sl-wind',  sim.windForce);
    onSliderWind(sim.windForce);     /* met à jour label + track */
    _setSl('sl-deltat', sim.deltaT); _setTxt('lbl-deltat', fmt(sim.deltaT, 2));

    /* Modes */
    setDisplayMode(sim.displayMode);
    document.getElementById('btn-vec-pos').classList.toggle('active', sim.showVecPos);
    document.getElementById('btn-vec-vit').classList.toggle('active', sim.showVecVit);
    document.getElementById('btn-vec-acc').classList.toggle('active', sim.showVecAcc);
    document.getElementById('btn-vec-forces').classList.toggle('active', sim.showVecForces);
    document.getElementById('btn-vec-sumf').classList.toggle('active', sim.showVecSumF);

    _updatePlayBtn();
}

function _setTxt(id, v) {
    var el = document.getElementById(id);
    if (el) el.textContent = v;
}

function _setSl(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val;
}

/* ─────────────────────────────────────────────────
   Mode repère (orthonormé / adapté)
───────────────────────────────────────────────── */
function toggleAxisMode() {
    sim.axisMode = (sim.axisMode === 'ortho') ? 'adapted' : 'ortho';
    computeScale(_animW, _animH);
    var btn = document.getElementById('btn-axis-mode');
    if (btn) {
        btn.textContent = 'Repère : ' + (sim.axisMode === 'ortho' ? 'Orthonormé' : 'Adapté');
        btn.classList.toggle('active', sim.axisMode === 'adapted');
    }
}

function _lockAxisBtnWidth() {
    var btn = document.getElementById('btn-axis-mode');
    if (btn && !btn.style.width) btn.style.width = btn.offsetWidth + 'px';
}

function togglePinMode() {
    _pinModeActive = !_pinModeActive;
    var btn = document.getElementById('btn-pin-mode');
    if (btn) btn.classList.toggle('active', _pinModeActive);
    if (_animCanvas) _animCanvas.style.cursor = _pinModeActive ? 'crosshair' : '';
}

/* ─────────────────────────────────────────────────
   Bandeau instructions
───────────────────────────────────────────────── */
function toggleHint(tab) {
    var hint = document.getElementById('panel-hint-' + tab);
    if (hint) hint.classList.toggle('collapsed');
}

/* ─────────────────────────────────────────────────
   Replay & adapter
───────────────────────────────────────────────── */
var _replayPlaying = false;
var _replayT       = 0;
var _replayMaxT    = 0;

function toutRejouer() {
    if (savedRuns.length === 0) return;
    _replayMaxT = 0;
    for (var i = 0; i < savedRuns.length; i++) {
        var data = savedRuns[i].graphData;
        if (data.length > 0) {
            var last = data[data.length - 1].t;
            if (last > _replayMaxT) _replayMaxT = last;
        }
    }
    _replayT = 0;
    _replayPlaying = true;
    sim.paused = true;
    resetSim();
    _updatePlayBtn();
    var btn = document.getElementById('btn-tout-rejouer');
    if (btn) btn.classList.add('active');
}

function adapterVueRun(id) {
    var run = savedRuns.find(function(r) { return r.id === id; });
    if (!run) return;

    /* ── Animation ── */
    var xMax = 1, yMax = 1;
    for (var j = 0; j < run.trajPoints.length; j++) {
        if (run.trajPoints[j].x > xMax) xMax = run.trajPoints[j].x;
        if (run.trajPoints[j].y > yMax) yMax = run.trajPoints[j].y;
    }
    sim.xMax = Math.max(xMax, 5);
    sim.yMax = Math.max(yMax, run.h + 1, 1);
    computeScale(_animW, _animH);

    /* ── Graphes : recalcul des bornes depuis les données de cette run ── */
    var data = run.graphData;
    if (data.length === 0) return;
    var d0 = data[0];
    var gb = {
        t:  { min: 0, max: 0 },
        x:  { min: 0, max: Math.max(d0.x, 0.01) },
        y:  { min: 0, max: Math.max(d0.y, 0.01) },
        vx: { min: d0.vx, max: d0.vx },
        vy: { min: d0.vy, max: d0.vy },
        ax: { min: d0.ax, max: d0.ax },
        ay: { min: d0.ay, max: d0.ay }
    };
    for (var j = 1; j < data.length; j++) {
        var d = data[j];
        if (d.t  > gb.t.max)  gb.t.max  = d.t;
        if (d.x  > gb.x.max)  gb.x.max  = d.x;
        if (d.vx > gb.vx.max) gb.vx.max = d.vx;
        if (d.vx < gb.vx.min) gb.vx.min = d.vx;
        if (d.vy > gb.vy.max) gb.vy.max = d.vy;
        if (d.vy < gb.vy.min) gb.vy.min = d.vy;
        if (d.ax > gb.ax.max) gb.ax.max = d.ax;
        if (d.ax < gb.ax.min) gb.ax.min = d.ax;
        if (d.ay > gb.ay.max) gb.ay.max = d.ay;
        if (d.ay < gb.ay.min) gb.ay.min = d.ay;
        if (d.y  > gb.y.max)  gb.y.max  = d.y;
    }
    gb.x.max = Math.max(gb.x.max, 1);
    gb.y.max = Math.max(gb.y.max, run.h + 1, 1);
    gb.y.min = 0;
    sim.graphBounds = gb;
}

function adapterVue() {
    if (savedRuns.length === 0) return;

    /* ── Animation : étendre xMax / yMax ── */
    var xMax = sim.xMax || 1;
    var yMax = sim.yMax || 1;
    for (var i = 0; i < savedRuns.length; i++) {
        var pts = savedRuns[i].trajPoints;
        for (var j = 0; j < pts.length; j++) {
            if (pts[j].x > xMax) xMax = pts[j].x;
            if (pts[j].y > yMax) yMax = pts[j].y;
        }
    }
    sim.xMax = xMax;
    sim.yMax = yMax;
    computeScale(_animW, _animH);

    /* ── Graphes : étendre graphBounds ── */
    if (!sim.graphBounds) return;
    var gb = sim.graphBounds;
    for (var i = 0; i < savedRuns.length; i++) {
        var data = savedRuns[i].graphData;
        for (var j = 0; j < data.length; j++) {
            var d = data[j];
            if (d.t  > gb.t.max)  gb.t.max  = d.t;
            if (d.x  > gb.x.max)  gb.x.max  = d.x;
            if (d.y  > gb.y.max)  gb.y.max  = d.y;
            if (d.y  < gb.y.min)  gb.y.min  = d.y;
            if (d.vx > gb.vx.max) gb.vx.max = d.vx;
            if (d.vx < gb.vx.min) gb.vx.min = d.vx;
            if (d.vy > gb.vy.max) gb.vy.max = d.vy;
            if (d.vy < gb.vy.min) gb.vy.min = d.vy;
            if (d.ax > gb.ax.max) gb.ax.max = d.ax;
            if (d.ax < gb.ax.min) gb.ax.min = d.ax;
            if (d.ay > gb.ay.max) gb.ay.max = d.ay;
            if (d.ay < gb.ay.min) gb.ay.min = d.ay;
        }
    }
}

/* ─────────────────────────────────────────────────
   Sauvegarde de runs
───────────────────────────────────────────────── */
var _currentRunColor = SAVE_COLORS[0];
var _pinModeActive   = false;
var _openDropdownId  = null;

/* ── Options d'affichage des points épinglés ── */
var pinShowVecPos    = false;
var pinShowVecVit    = true;
var pinShowVecAcc    = false;
var pinShowVecForces = false;
var pinShowVecSumF   = false;
var pinShowCoords    = true;

function togglePinVec(key) {
    switch(key) {
        case 'pos':    pinShowVecPos    = !pinShowVecPos;    break;
        case 'vit':    pinShowVecVit    = !pinShowVecVit;    break;
        case 'acc':    pinShowVecAcc    = !pinShowVecAcc;    break;
        case 'forces': pinShowVecForces = !pinShowVecForces; break;
        case 'sumf':   pinShowVecSumF   = !pinShowVecSumF;  break;
    }
    document.getElementById('pin-vec-btn-' + key).classList.toggle('active',
        key === 'pos'    ? pinShowVecPos    :
        key === 'vit'    ? pinShowVecVit    :
        key === 'acc'    ? pinShowVecAcc    :
        key === 'forces' ? pinShowVecForces : pinShowVecSumF);
}

function setPinShowCoords(val) {
    pinShowCoords = val;
}

var hoverShowCoords = false;
function setHoverShowCoords(val) {
    hoverShowCoords = val;
}

function _updateCurrentRunColor() {
    var used = savedRuns.map(function(r) { return r.color; });
    _currentRunColor = SAVE_COLORS.find(function(c) { return used.indexOf(c) === -1; }) || null;
}

function sauvegarderRun() {
    if (!sim.ended || savedRuns.length >= MAX_SAVED_RUNS) return;
    var color = _currentRunColor || SAVE_COLORS[0];
    savedRuns.push({
        id: _nextSaveId++,
        color: color,
        mass: sim.mass,
        h: sim.h,
        v0: sim.v0,
        alpha: sim.alpha,
        g: sim.g,
        useFriction: sim.useFriction,
        windForce: sim.windForce,
        displayMode: sim.displayMode,
        trajPoints:     sim.trajPoints.slice(),
        chronoSnaps:    sim.chronoSnaps.map(function(s) { return Object.assign({}, s); }),
        graphData:      sim.graphData.map(function(d) { return Object.assign({}, d); }),
        analysisPoints: sim.analysisPoints.map(function(p) { return Object.assign({}, p); }),
        xMax:         sim._ownXMax,
        yMax:         sim._ownYMax,
        maxT:         sim._ownMaxT,
        graphBounds:  JSON.parse(JSON.stringify(sim._ownGraphBounds || sim.graphBounds)),
        showVecPos:    sim.showVecPos,
        showVecVit:    sim.showVecVit,
        showVecAcc:    sim.showVecAcc,
        showVecForces: sim.showVecForces,
        showVecSumF:   sim.showVecSumF,
        hidden: false
    });
    renderSavedRuns();
    resetSimAnim();   /* efface la run courante — elle est désormais affichée via la couche sauvegardée */
}

function supprimerSauvegardeRun(id) {
    if (_openDropdownId === id) closeRunDropdown();
    savedRuns = savedRuns.filter(function(r) { return r.id !== id; });
    _updateCurrentRunColor();
    expandBoundsGlobal();
    renderSavedRuns();
}

function masquerSauvegardeRun(id) {
    var run = savedRuns.find(function(r) { return r.id === id; });
    if (run) run.hidden = !run.hidden;
    expandBoundsGlobal();
    renderSavedRuns();
}

/* ─────────────────────────────────────────────────
   Onglets runs sauvegardées dans la toolbar
───────────────────────────────────────────────── */
function renderSavedRuns() {
    var tabs = document.getElementById('saved-runs-tabs');
    if (!tabs) return;
    tabs.innerHTML = '';

    if (savedRuns.length === 0) {
        var empty = document.createElement('span');
        empty.className = 'toolbar-empty';
        empty.textContent = 'Appuyer sur Sauvegarder à la fin d\'une simulation pour la conserver.';
        tabs.appendChild(empty);
        return;
    }

    for (var i = 0; i < savedRuns.length; i++) {
        (function(run, idx) {
            var tab = document.createElement('div');
            tab.className = 'run-tab' + (run.hidden ? ' masque' : '') + (_openDropdownId === run.id ? ' expanded' : '');
            tab.dataset.id = run.id;

            var swatch = document.createElement('span');
            swatch.className = 'run-tab-swatch';
            swatch.style.background = run.color;
            tab.appendChild(swatch);

            var num = document.createElement('span');
            num.className = 'run-tab-num';
            num.textContent = 'n°' + (idx + 1);
            tab.appendChild(num);

            var btnHide = document.createElement('button');
            btnHide.className = 'run-tab-btn';
            btnHide.title = run.hidden ? 'Afficher' : 'Masquer';
            btnHide.textContent = '👁';
            btnHide.onclick = function(e) { e.stopPropagation(); masquerSauvegardeRun(run.id); };
            tab.appendChild(btnHide);

            var btnAdapt = document.createElement('button');
            btnAdapt.className = 'run-tab-btn';
            btnAdapt.title = 'Adapter la vue à cette simulation';
            btnAdapt.textContent = '🔍';
            btnAdapt.onclick = function(e) { e.stopPropagation(); adapterVueRun(run.id); };
            tab.appendChild(btnAdapt);

            var btnExp = document.createElement('button');
            btnExp.className = 'run-tab-btn';
            btnExp.title = 'Détails';
            btnExp.textContent = _openDropdownId === run.id ? '▴' : '▾';
            btnExp.onclick = function(e) { e.stopPropagation(); toggleRunDropdown(run.id); };
            tab.appendChild(btnExp);

            var btnDel = document.createElement('button');
            btnDel.className = 'run-tab-btn run-tab-del';
            btnDel.title = 'Supprimer';
            btnDel.textContent = '✕';
            btnDel.onclick = function(e) { e.stopPropagation(); supprimerSauvegardeRun(run.id); };
            tab.appendChild(btnDel);

            tabs.appendChild(tab);
        })(savedRuns[i], i);
    }

    if (_openDropdownId !== null) {
        var openRun = savedRuns.find(function(r) { return r.id === _openDropdownId; });
        if (openRun) _renderDropdown(openRun);
        else closeRunDropdown();
    }

    /* Flèches de défilement — après que le DOM soit rendu */
    setTimeout(_updateTabsScrollBtns, 0);
}

function _updateTabsScrollBtns() {
    var el   = document.getElementById('saved-runs-tabs');
    var btnL = document.getElementById('tabs-scroll-left');
    var btnR = document.getElementById('tabs-scroll-right');
    if (!el || !btnL || !btnR) return;
    var overflows = el.scrollWidth > el.clientWidth + 2;
    var atLeft    = el.scrollLeft <= 2;
    var atRight   = el.scrollLeft >= el.scrollWidth - el.clientWidth - 2;
    btnL.classList.toggle('visible', overflows && !atLeft);
    btnR.classList.toggle('visible', overflows && !atRight);
}

function scrollRunTabs(dir) {
    var el = document.getElementById('saved-runs-tabs');
    if (!el) return;
    el.scrollLeft += dir * 120;
    setTimeout(_updateTabsScrollBtns, 200);
}

function toggleRunDropdown(id) {
    if (_openDropdownId === id) {
        closeRunDropdown();
    } else {
        _openDropdownId = id;
        var run = savedRuns.find(function(r) { return r.id === id; });
        if (!run) return;
        _renderDropdown(run);
        renderSavedRuns();
    }
}

function closeRunDropdown() {
    _openDropdownId = null;
    var dd = document.getElementById('run-tab-dropdown');
    if (dd) dd.style.display = 'none';
    renderSavedRuns();
}

function _renderDropdown(run) {
    var dd = document.getElementById('run-tab-dropdown');
    if (!dd) return;

    var tab = document.querySelector('.run-tab[data-id="' + run.id + '"]');
    if (tab) {
        var toolbar = document.getElementById('anim-toolbar');
        var tabRect = tab.getBoundingClientRect();
        var tbRect  = toolbar.getBoundingClientRect();
        var left = tabRect.left - tbRect.left;
        left = Math.max(0, Math.min(left, tbRect.width - 220));
        dd.style.left = left + 'px';
    }
    dd.style.display = 'block';
    dd.innerHTML = '';

    var paramsDiv = document.createElement('div');
    paramsDiv.className = 'run-drop-params';
    var l1 = document.createElement('div'); l1.className = 'run-drop-line';
    var l2 = document.createElement('div'); l2.className = 'run-drop-line';
    ['m = ' + fmt(run.mass, 2) + ' kg',
     'h = ' + fmt(run.h, 0) + ' m',
     'v₀ = ' + fmt(run.v0, 0) + ' m/s',
     'α = ' + fmt(run.alpha, 0) + '°'
    ].forEach(function(txt) {
        var s = document.createElement('span'); s.className = 'run-drop-item';
        s.textContent = txt; l1.appendChild(s);
    });
    ['g = ' + fmt(run.g, 2) + ' m/s²',
     run.useFriction ? 'Frottements' : 'Sans frott.',
     'Vent : ' + fmt(run.windForce, 1) + ' N'
    ].forEach(function(txt) {
        var s = document.createElement('span'); s.className = 'run-drop-item';
        s.textContent = txt; l2.appendChild(s);
    });
    paramsDiv.appendChild(l1);
    paramsDiv.appendChild(l2);
    dd.appendChild(paramsDiv);

    var vecsDiv = document.createElement('div');
    vecsDiv.className = 'run-drop-vecs';

    [
        { key: 'showVecPos',    html: '<math><mover><mi>OM</mi><mo>&#x2192;</mo></mover></math>',                                                        color: '#2a6aaa' },
        { key: 'showVecVit',    html: '<math><mover><mi>v</mi><mo>&#x2192;</mo></mover></math>',                                                          color: '#c03030' },
        { key: 'showVecAcc',    html: '<math><mover><mi>a</mi><mo>&#x2192;</mo></mover></math>',                                                          color: '#2a8a50' },
        { key: 'showVecForces', html: '<math><mover><mi>F</mi><mo>&#x2192;</mo></mover></math>',                                                          color: '#8e44ad' },
        { key: 'showVecSumF',   html: '<math><mover><mrow><mi mathvariant="normal">&#x3A3;</mi><mi>F</mi></mrow><mo>&#x2192;</mo></mover></math>',        color: '#8d4e20' }
    ].forEach(function(def) {
        var b = document.createElement('button');
        b.className = 'run-drop-vec-btn' + (run[def.key] ? ' active' : '');
        b.style.color = def.color;
        b.innerHTML = def.html;
        b.onclick = function(e) { e.stopPropagation(); toggleSavedVec(run.id, def.key); };
        vecsDiv.appendChild(b);
    });
    dd.appendChild(vecsDiv);
}

function toggleSavedVec(id, key) {
    var run = savedRuns.find(function(r) { return r.id === id; });
    if (!run) return;
    run[key] = !run[key];
    _renderDropdown(run);
}
