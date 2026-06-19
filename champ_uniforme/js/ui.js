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
        advanceSim(dtReal);
        drawAnim();
        drawGraph();
        _updateReadouts();
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
    requestAnimationFrame(loop);
}

window.addEventListener('DOMContentLoaded', init);

window.addEventListener('resize', function () {
    /* Si le splitter avait fixé des hauteurs px, on les réinitialise
       pour que le flex CSS reprenne le contrôle au nouveau viewport. */
    var animArea  = document.getElementById('anim-area');
    var graphArea = document.getElementById('graph-area');
    if (animArea)  { animArea.style.flex  = ''; animArea.style.height  = ''; }
    if (graphArea) { graphArea.style.flex = ''; graphArea.style.height = ''; }
    resizeAnimCanvas();
    resizeGraphCanvas();
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

function resetSimAnim() {
    sim.paused = true;
    resetSim();
    computeScale(_animW, _animH);
    _updatePlayBtn();
    _updateReadouts();
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
    resetSimAnim();
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

/* ─────────────────────────────────────────────────
   Conditions initiales
───────────────────────────────────────────────── */
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
    sim.g = parseFloat(v);
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
    sim.windForce = parseFloat(v);
    var lbl = document.getElementById('lbl-wind');
    if (lbl) {
        var sign = sim.windForce > 0 ? '+' : '';
        lbl.textContent = sign + fmt(sim.windForce, 1) + ' N';
    }
    _updateWindTrack(parseFloat(v));
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
    resetSimAnim();
}

/* ─────────────────────────────────────────────────
   Afficheurs valeurs en bas du panel
───────────────────────────────────────────────── */
function _updateReadouts() {
    _setTxt('ro-t',  fmt(sim.t, 2));
    _setTxt('ro-x',  fmt(sim.x, 2));
    _setTxt('ro-y',  fmt(sim.y, 2));
    _setTxt('ro-vx', fmt(sim.vx, 2));
    _setTxt('ro-vy', fmt(sim.vy, 2));
    _setTxt('ro-v',  fmt(Math.hypot(sim.vx, sim.vy), 2));
}

function _setTxt(id, v) {
    var el = document.getElementById(id);
    if (el) el.textContent = v;
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

    _updatePlayBtn();
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

/* ─────────────────────────────────────────────────
   Bandeau instructions
───────────────────────────────────────────────── */
function toggleHint(tab) {
    var hint = document.getElementById('panel-hint-' + tab);
    if (hint) hint.classList.toggle('collapsed');
}
