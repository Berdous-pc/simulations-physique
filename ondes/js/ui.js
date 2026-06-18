// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  ui.js — Boucle d'animation et contrôles UI
//  Chargé en DERNIER. Orchestre la simulation.
//  Dépend de : sim.js, tube.js, graph.js
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Tab actif : 'son' | 'corde' | 'vagues' ───────────────────────────
// Utilisé par tube.js et graph.js pour brancher sur la bonne simulation.
var activeTab = 'son';

// ── Compteurs de temps pour l'enregistrement ─────────────────────────
var lastDptUpdate    = 0;          // Son
var lastYtUpdate     = 0;          // Corde
var lastYtUpdateV    = 0;          // Vagues
var DPT_SAMPLE_DT    = 1 / 300;   // 300 enregistrements/s simulée

// ── Paliers de vitesse ────────────────────────────────────────────────
var SPEED_STEPS = [0.10, 0.25, 0.50, 1.00];

// ══════════════════════════════════════════════════════════════════════
//  Boucle d'animation principale
// ══════════════════════════════════════════════════════════════════════

function loop(ts) {
    requestAnimationFrame(loop);

    var dtReal = (ts - (loop.lastTs || ts)) / 1000;
    loop.lastTs = ts;
    dtReal = Math.min(dtReal, 0.05);

    if (activeTab === 'son') {
        // ── Avancement temps Son ──────────────────────────────────────
        if (!sim.paused) {
            var dtSim = dtReal * (sim.speedFactor !== undefined ? sim.speedFactor : 1.0);
            sim.simTime += dtSim;

            pruneImpulses();

            if (sim.impulsePropagating && sim.impulses.length === 0) {
                sim.impulsePropagating = false;
                sim.sourceMode         = null;
                _syncSourceButtons();
                _syncWavePropsBtnState();
            }

            while (sim.simTime - lastDptUpdate >= DPT_SAMPLE_DT) {
                lastDptUpdate += DPT_SAMPLE_DT;
                updateDptData(lastDptUpdate);
            }

            if (sim.sourceMode === 'sinus' && sim.simTime - sim.dptTimeOrigin >= 5) {
                sim.dptTimeOrigin += 5;
            }
        }

        updateDpxData();
        drawTube();
        drawGraph();

        if (!sim.paused) {
            _updateCReadout();
            _updateWaveProps();
        }

    } else if (activeTab === 'corde') {
        // ── Avancement temps Corde ────────────────────────────────────
        if (!simCorde.paused) {
            var dtSimC = dtReal * (simCorde.speedFactor !== undefined ? simCorde.speedFactor : 1.0);
            simCorde.simTime += dtSimC;

            pruneImpulsesCorde();

            if (simCorde.impulsePropagating && simCorde.impulses.length === 0) {
                simCorde.impulsePropagating = false;
                simCorde.sourceMode         = null;
                _syncSourceButtonsCorde();
                _syncWavePropsBtnStateCorde();
            }

            while (simCorde.simTime - lastYtUpdate >= DPT_SAMPLE_DT) {
                lastYtUpdate += DPT_SAMPLE_DT;
                updateYtData(lastYtUpdate);
            }

            if (simCorde.sourceMode === 'sinus' &&
                    simCorde.simTime - simCorde.ytTimeOrigin >= 5) {
                simCorde.ytTimeOrigin += 5;
            }
        }

        updateYxData();
        drawCorde();
        drawGraph();

        if (!simCorde.paused) {
            _updateCReadoutCorde();
            _updateWavePropsCorde();
        }
    } else {
        // ── Avancement temps Vagues ───────────────────────────────────
        if (!simVagues.paused) {
            var dtSimV = dtReal * (simVagues.speedFactor || 1.0);
            simVagues.simTime += dtSimV;
            addSourceSampleVagues(simVagues.simTime);

            var DPT_SAMPLE_DT_V = DPT_SAMPLE_DT;
            while (simVagues.simTime - lastYtUpdateV >= DPT_SAMPLE_DT_V) {
                lastYtUpdateV += DPT_SAMPLE_DT_V;
                updateYtDataVagues(lastYtUpdateV);
            }

            if (simVagues.simTime - simVagues.ytTimeOrigin >= 5) {
                simVagues.ytTimeOrigin += 5;
            }
        }

        updateYxDataVagues();
        drawVagues();
        drawGraph();

        if (!simVagues.paused) {
            _updateCReadoutVagues();
            _updateWavePropsVagues();
        }
    }
}

// ══════════════════════════════════════════════════════════════════════
//  ─────────────── TAB SON ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

// ── Afficheur c (Son) ─────────────────────────────────────────────────
function _updateCReadout() {
    var el = document.getElementById('ro-c');
    if (el) el.textContent = sim.c_cms.toFixed(1).replace('.', ',');
}

// ── Utilitaires source Son ────────────────────────────────────────────
function _clearSourceModes() {
    if (sim.sinusoidalActive) {
        sim.sinusoidalActive = false;
        sim.sinStopTime      = sim.simTime;
    }
    sim.impulses           = [];
    sim.impulsePropagating = false;
    sim.sourceMode         = null;
    _syncSourceButtons();
    _syncWavePropsBtnState();
}

function _syncSourceButtons() {
    var btnImp = document.getElementById('btn-mode-impulse');
    var btnSin = document.getElementById('btn-mode-sinus');
    if (btnImp) btnImp.classList.toggle('active', sim.sourceMode === 'impulse');
    if (btnSin) btnSin.classList.toggle('active', sim.sourceMode === 'sinus');
}

function sendImpulse() {
    if (sim.paused) _setPaused(false);
    _clearSourceModes();
    sim.impulses.push({ startTime: sim.simTime });
    sim.impulsePropagating = true;
    sim.sourceMode         = 'impulse';
    sim.dptTimeOrigin = sim.simTime;
    sim.dptData1      = [];
    sim.dptData2      = [];
    _syncSourceButtons();
    _syncWavePropsBtnState();
}

function toggleSinusoidal() {
    if (sim.sinusoidalActive) {
        _clearSourceModes();
    } else {
        if (sim.paused) _setPaused(false);
        _clearSourceModes();
        sim.sinusoidalActive = true;
        sim.sinStartTime     = sim.simTime;
        sim.sinStopTime      = -1;
        sim.sourceMode       = 'sinus';
        sim.dptTimeOrigin = sim.simTime;
        sim.dptData1      = [];
        sim.dptData2      = [];
        _syncSourceButtons();
        _syncWavePropsBtnState();
    }
}

// ── Pause / Reset Son ─────────────────────────────────────────────────
function _setPaused(paused) {
    sim.paused = paused;
    var btn = document.getElementById('btn-playpause');
    if (!btn) return;
    if (paused) { btn.textContent = '▶ Reprendre'; btn.className = 'btn btn-play'; }
    else        { btn.textContent = '⏸ Pause';     btn.className = 'btn btn-pause'; }
}

function togglePause() { _setPaused(!sim.paused); }

function resetSimAnim() {
    resetAnim();
    lastDptUpdate = 0;
    _syncSourceButtons();
    var btn = document.getElementById('btn-playpause');
    if (btn) { btn.textContent = '⏸ Pause'; btn.className = 'btn btn-pause'; }
    sim.pressureColorMode = false;
    var btnPc = document.getElementById('btn-pressure-color');
    if (btnPc) btnPc.classList.remove('active');
}

// ── Sliders Son ───────────────────────────────────────────────────────
function onSliderFreq(v) {
    sim.freq = parseFloat(v);
    var lbl = document.getElementById('lbl-freq');
    if (lbl) lbl.textContent = sim.freq.toFixed(1).replace('.', ',');
    initCols();
}

function onSliderRho(v) {
    sim.rho = parseFloat(v);
    var lbl = document.getElementById('lbl-rho');
    if (lbl) lbl.textContent = sim.rho.toFixed(1).replace('.', ',');
    updateCelerite();
    _updateCReadout();
    initCols();
}

function onSliderK(v) {
    sim.K = parseFloat(v);
    var lbl = document.getElementById('lbl-K');
    if (lbl) lbl.textContent = sim.K.toFixed(1).replace('.', ',');
    updateCelerite();
    _updateCReadout();
    initCols();
}

function onSliderAtten(v) {
    sim.attenuation = parseFloat(v);
    var lbl = document.getElementById('lbl-atten');
    if (lbl) lbl.textContent = sim.attenuation.toFixed(2).replace('.', ',');
}

function onSliderSpeed(v) {
    var idx = parseInt(v, 10);
    sim.speedFactor = SPEED_STEPS[idx];
    var lbl = document.getElementById('lbl-speed');
    if (lbl) lbl.textContent = sim.speedFactor.toFixed(2).replace('.', ',');
}

// ── Propriétés de l'onde Son ──────────────────────────────────────────
function toggleWaveProps() {
    sim.wavePropsVisible = !sim.wavePropsVisible;
    _applyWavePropsState();
}

function _applyWavePropsState() {
    var btn      = document.getElementById('btn-wave-props');
    var simple   = document.getElementById('readout-simple');
    var extended = document.getElementById('readout-props');
    if (sim.wavePropsVisible) {
        if (btn)      btn.classList.add('active');
        if (simple)   simple.style.display = 'none';
        if (extended) extended.style.display = '';
        _updateWaveProps();
    } else {
        if (btn)      btn.classList.remove('active');
        if (simple)   simple.style.display = '';
        if (extended) extended.style.display = 'none';
    }
}

function _updateWaveProps() {
    if (!sim.wavePropsVisible) return;
    var elC = document.getElementById('ro-c-ext');
    if (elC) elC.textContent = sim.c_cms.toFixed(1).replace('.', ',');
    var f   = sim.freq;
    var T   = (f > 0) ? 1 / f : 0;
    var elF = document.getElementById('ro-f');
    var elT = document.getElementById('ro-T');
    if (elF) elF.textContent = f.toFixed(2).replace('.', ',');
    if (elT) elT.textContent = T.toFixed(3).replace('.', ',');
    var lambda = sim.c_cms * T;
    var elL    = document.getElementById('ro-lambda');
    if (elL) elL.textContent = lambda.toFixed(1).replace('.', ',');
}

function _syncWavePropsBtnState() {
    var btn = document.getElementById('btn-wave-props');
    if (!btn) return;
    var isImpulse = (sim.sourceMode === 'impulse');
    btn.disabled = isImpulse;
    if (isImpulse && sim.wavePropsVisible) {
        sim.wavePropsVisible = false;
        _applyWavePropsState();
    }
}

// ── Boutons au-dessus du tube — Son ───────────────────────────────────
function toggleSelect() {
    if (sim.pressureColorMode) return;
    sim.selectionMode = !sim.selectionMode;
    var btn = document.getElementById('btn-select');
    if (btn) btn.classList.toggle('active', sim.selectionMode);
    if (!sim.selectionMode) clearSelection();
}

function togglePressureColor() {
    sim.pressureColorMode = !sim.pressureColorMode;
    var btn       = document.getElementById('btn-pressure-color');
    var btnSelect = document.getElementById('btn-select');
    if (btn) btn.classList.toggle('active', sim.pressureColorMode);
    if (sim.pressureColorMode) {
        sim.selectionMode = false;
        if (btnSelect) { btnSelect.disabled = true; btnSelect.classList.remove('active'); }
        clearSelection();
    } else {
        if (btnSelect) btnSelect.disabled = false;
    }
}

// ══════════════════════════════════════════════════════════════════════
//  ─────────────── TAB CORDE ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

// ── Afficheur c (Corde) ───────────────────────────────────────────────
function _updateCReadoutCorde() {
    var el = document.getElementById('ro-c-corde');
    if (el) el.textContent = simCorde.c_cms.toFixed(1).replace('.', ',');
}

// ── Utilitaires source Corde ──────────────────────────────────────────
function _clearSourceModesCorde() {
    if (simCorde.sinusoidalActive) {
        simCorde.sinusoidalActive = false;
        simCorde.sinStopTime      = simCorde.simTime;
    }
    simCorde.impulses           = [];
    simCorde.impulsePropagating = false;
    simCorde.sourceMode         = null;
    _syncSourceButtonsCorde();
    _syncWavePropsBtnStateCorde();
}

function _syncSourceButtonsCorde() {
    var btnImp = document.getElementById('btn-mode-impulse-corde');
    var btnSin = document.getElementById('btn-mode-sinus-corde');
    if (btnImp) btnImp.classList.toggle('active', simCorde.sourceMode === 'impulse');
    if (btnSin) btnSin.classList.toggle('active', simCorde.sourceMode === 'sinus');
}

function sendImpulseCorde() {
    if (simCorde.paused) _setPausedCorde(false);
    _clearSourceModesCorde();
    simCorde.impulses.push({ startTime: simCorde.simTime });
    simCorde.impulsePropagating = true;
    simCorde.sourceMode         = 'impulse';
    simCorde.ytTimeOrigin = simCorde.simTime;
    simCorde.ytData1      = [];
    simCorde.ytData2      = [];
    lastYtUpdate = 0;
    _syncSourceButtonsCorde();
    _syncWavePropsBtnStateCorde();
}

function toggleSinusoidalCorde() {
    if (simCorde.sinusoidalActive) {
        _clearSourceModesCorde();
    } else {
        if (simCorde.paused) _setPausedCorde(false);
        _clearSourceModesCorde();
        simCorde.sinusoidalActive = true;
        simCorde.sinStartTime     = simCorde.simTime;
        simCorde.sinStopTime      = -1;
        simCorde.sourceMode       = 'sinus';
        simCorde.ytTimeOrigin = simCorde.simTime;
        simCorde.ytData1      = [];
        simCorde.ytData2      = [];
        lastYtUpdate = 0;
        _syncSourceButtonsCorde();
        _syncWavePropsBtnStateCorde();
    }
}

// ── Pause / Reset Corde ───────────────────────────────────────────────
function _setPausedCorde(paused) {
    simCorde.paused = paused;
    var btn = document.getElementById('btn-playpause-corde');
    if (!btn) return;
    if (paused) { btn.textContent = '▶ Reprendre'; btn.className = 'btn btn-play'; }
    else        { btn.textContent = '⏸ Pause';     btn.className = 'btn btn-pause'; }
}

function togglePauseCorde() { _setPausedCorde(!simCorde.paused); }

function resetSimAnimCorde() {
    resetAnimCorde();
    lastYtUpdate = 0;
    _syncSourceButtonsCorde();
    var btn = document.getElementById('btn-playpause-corde');
    if (btn) { btn.textContent = '⏸ Pause'; btn.className = 'btn btn-pause'; }
}

// ── Sliders Corde ─────────────────────────────────────────────────────
function onSliderFreqCorde(v) {
    simCorde.freq = parseFloat(v);
    var lbl = document.getElementById('lbl-freq-corde');
    if (lbl) lbl.textContent = simCorde.freq.toFixed(1).replace('.', ',');
}

function onSliderAmplCorde(v) {
    simCorde.amplitudeCm = parseFloat(v);
    var lbl = document.getElementById('lbl-ampl-corde');
    if (lbl) lbl.textContent = simCorde.amplitudeCm.toFixed(1).replace('.', ',');
    // Recalculer memAmplitude en px depuis la nouvelle valeur cm
    _recalcMemAmplitudeCorde();
}

function onSliderMu(v) {
    simCorde.mu = parseFloat(v);
    var lbl = document.getElementById('lbl-mu');
    if (lbl) lbl.textContent = simCorde.mu.toFixed(1).replace('.', ',');
    updateCeleriteCorde();
    _updateCReadoutCorde();
}

function onSliderTension(v) {
    simCorde.T_tension = parseFloat(v);
    var lbl = document.getElementById('lbl-T-tension');
    if (lbl) lbl.textContent = simCorde.T_tension.toFixed(1).replace('.', ',');
    updateCeleriteCorde();
    _updateCReadoutCorde();
}

function onSliderAttenCorde(v) {
    simCorde.attenuation = parseFloat(v);
    var lbl = document.getElementById('lbl-atten-corde');
    if (lbl) lbl.textContent = simCorde.attenuation.toFixed(2).replace('.', ',');
}

function onSliderSpeedCorde(v) {
    var idx = parseInt(v, 10);
    simCorde.speedFactor = SPEED_STEPS[idx];
    var lbl = document.getElementById('lbl-speed-corde');
    if (lbl) lbl.textContent = simCorde.speedFactor.toFixed(2).replace('.', ',');
}

// ── Propriétés de l'onde Corde ────────────────────────────────────────
function toggleWavePropsCorde() {
    simCorde.wavePropsVisible = !simCorde.wavePropsVisible;
    _applyWavePropsCorde();
}

function _applyWavePropsCorde() {
    var btn      = document.getElementById('btn-wave-props-corde');
    var simple   = document.getElementById('readout-simple-corde');
    var extended = document.getElementById('readout-props-corde');
    if (simCorde.wavePropsVisible) {
        if (btn)      btn.classList.add('active');
        if (simple)   simple.style.display = 'none';
        if (extended) extended.style.display = '';
        _updateWavePropsCorde();
    } else {
        if (btn)      btn.classList.remove('active');
        if (simple)   simple.style.display = '';
        if (extended) extended.style.display = 'none';
    }
}

function _updateWavePropsCorde() {
    if (!simCorde.wavePropsVisible) return;
    var elC = document.getElementById('ro-c-ext-corde');
    if (elC) elC.textContent = simCorde.c_cms.toFixed(1).replace('.', ',');
    var f   = simCorde.freq;
    var T   = (f > 0) ? 1 / f : 0;
    var elF = document.getElementById('ro-f-corde');
    var elT = document.getElementById('ro-T-corde');
    if (elF) elF.textContent = f.toFixed(2).replace('.', ',');
    if (elT) elT.textContent = T.toFixed(3).replace('.', ',');
    var lambda = simCorde.c_cms * T;   // m (c en m/s × T en s)
    var elL    = document.getElementById('ro-lambda-corde');
    if (elL) elL.textContent = lambda.toFixed(2).replace('.', ',');
}

function _syncWavePropsBtnStateCorde() {
    var btn = document.getElementById('btn-wave-props-corde');
    if (!btn) return;
    var isImpulse = (simCorde.sourceMode === 'impulse');
    btn.disabled = isImpulse;
    if (isImpulse && simCorde.wavePropsVisible) {
        simCorde.wavePropsVisible = false;
        _applyWavePropsCorde();
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Balises — communes (routées selon activeTab)
// ══════════════════════════════════════════════════════════════════════

function toggleBeaconActive(n) {
    if (activeTab === 'corde') {
        _toggleBeaconCorde(n);
    } else if (activeTab === 'vagues') {
        _toggleBeaconVagues(n);
    } else {
        _toggleBeaconSon(n);
    }
}

function _toggleBeaconSon(n) {
    var beacon = (n === 1) ? sim.beacon1 : sim.beacon2;
    var btn    = document.getElementById('btn-beacon' + n);
    beacon.active = !beacon.active;
    if (beacon.active) {
        beacon.frac = (n === 1) ? 0.30 : 0.65;
        beacon.x    = sim.tubeLeft + sim.tubeLength * beacon.frac;
        if (btn) btn.classList.add('active');
    } else {
        if (btn) btn.classList.remove('active');
        if (n === 1) sim.dptData1 = [];
        else         sim.dptData2 = [];
    }
}

function _toggleBeaconCorde(n) {
    var beacon = (n === 1) ? simCorde.beacon1 : simCorde.beacon2;
    var btn    = document.getElementById('btn-beacon' + n);
    beacon.active = !beacon.active;
    if (beacon.active) {
        beacon.frac = (n === 1) ? 0.30 : 0.65;
        beacon.x    = simCorde.cordeLeft + simCorde.cordeLength * beacon.frac;
        if (btn) btn.classList.add('active');
    } else {
        if (btn) btn.classList.remove('active');
        if (n === 1) simCorde.ytData1 = [];
        else         simCorde.ytData2 = [];
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Onglets principaux (Corde | Son | Vagues)
// ══════════════════════════════════════════════════════════════════════

function setMainTab(tab) {
    activeTab = tab;

    var tabs     = ['corde', 'son', 'vagues'];
    var sections = tabs.map(function(t) { return document.getElementById('section-' + t); });
    var buttons  = tabs.map(function(t) { return document.getElementById('tab-' + t); });

    tabs.forEach(function(t, idx) {
        if (sections[idx]) sections[idx].style.display = (t === tab) ? '' : 'none';
        if (buttons[idx])  buttons[idx].classList.toggle('active', t === tab);
    });

    // ── Bandeau Instructions ──────────────────────────────────────────
    var allHints = document.querySelectorAll('.panel-hint');
    allHints.forEach(function(h) { h.style.display = 'none'; });
    var hint = document.getElementById('panel-hint-' + tab);
    if (hint) hint.style.display = '';

    // ── Box source : afficher la bonne version ────────────────────────
    var srcSon    = document.getElementById('source-son');
    var srcCorde  = document.getElementById('source-corde');
    var srcVagues = document.getElementById('source-vagues');
    if (srcSon)    srcSon.style.display    = (tab === 'son')   ? '' : 'none';
    if (srcCorde)  srcCorde.style.display  = (tab === 'corde') ? '' : 'none';
    if (srcVagues) srcVagues.style.display = (tab === 'vagues') ? '' : 'none';

    // ── Boutons son-only / vagues-only au-dessus du canvas ───────────
    var sonOnlyBtns = document.querySelectorAll('.son-only');
    sonOnlyBtns.forEach(function(b) {
        b.style.display = (tab === 'son') ? '' : 'none';
    });
    var vaguesOnlyBtns = document.querySelectorAll('.vagues-only');
    vaguesOnlyBtns.forEach(function(b) {
        b.style.display = (tab === 'vagues') ? '' : 'none';
    });

    // ── Remise à zéro des états de balises dans les boutons ───────────
    // Resynchronise l'état visuel des boutons Balise selon le tab
    var b1 = (tab === 'corde') ? simCorde.beacon1 : (tab === 'vagues') ? simVagues.beacon1 : sim.beacon1;
    var b2 = (tab === 'corde') ? simCorde.beacon2 : (tab === 'vagues') ? simVagues.beacon2 : sim.beacon2;
    var btnB1 = document.getElementById('btn-beacon1');
    var btnB2 = document.getElementById('btn-beacon2');
    if (btnB1) btnB1.classList.toggle('active', b1.active);
    if (btnB2) btnB2.classList.toggle('active', b2.active);

    // ── Labels des boutons graphe ─────────────────────────────────────
    _updateGraphBtnLabels(tab);

    // ── Mode graphe actif : resynchroniser les boutons ────────────────
    var mode = (tab === 'corde') ? simCorde.graphMode : (tab === 'vagues') ? simVagues.graphMode : sim.graphMode;
    var btnDpx  = document.getElementById('btn-graph-dpx');
    var btnDpt  = document.getElementById('btn-graph-dpt');
    var btnBoth = document.getElementById('btn-graph-both');
    if (btnDpx)  btnDpx.classList.toggle ('active', mode === 'dpx');
    if (btnDpt)  btnDpt.classList.toggle ('active', mode === 'dpt');
    if (btnBoth) btnBoth.classList.toggle('active', mode === 'both');
    var graphArea = document.getElementById('graph-area');
    if (graphArea) graphArea.classList.toggle('mode-both', mode === 'both');

    // ── Layout vagues : canvas plein espace ──────────────────────────
    var animArea = document.getElementById('anim-area');
    if (animArea) animArea.classList.toggle('vagues-layout', tab === 'vagues');

    // ── Resize pour adapter les canvas au tab ─────────────────────────
    if (tab === 'corde') {
        resizeCorde();
    } else if (tab === 'son') {
        resizeTube();
    } else if (tab === 'vagues') {
        resizeVagues();
    }
    resizeGraph();
}

// ══════════════════════════════════════════════════════════════════════
//  Bandeau Instructions (collapsible)
// ══════════════════════════════════════════════════════════════════════

function toggleHint(id) {
    var hint = document.getElementById('panel-hint-' + id);
    if (!hint) return;
    hint.classList.toggle('collapsed');
    var btn = document.getElementById('btn-hint-' + id);
    if (btn) {
        btn.title = hint.classList.contains('collapsed')
            ? 'Afficher les instructions'
            : 'Masquer les instructions';
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation
// ══════════════════════════════════════════════════════════════════════

function init() {
    resizeTube();
    resizeCorde();
    resizeVagues();
    resizeGraph();

    window.addEventListener('resize', function() {
        var animArea  = document.getElementById('anim-area');
        var graphArea = document.getElementById('graph-area');
        if (animArea)  { animArea.style.flex  = ''; animArea.style.height  = ''; }
        if (graphArea) { graphArea.style.flex = ''; graphArea.style.height = ''; }
        scheduleResizeTube();
    });

    requestAnimationFrame(loop);
    _syncUIToSim();
}

// Synchronise les valeurs initiales de l'UI avec les états de sim et simCorde
function _syncUIToSim() {
    // ── Son ────────────────────────────────────────────────────────────
    _setSlider('sl-freq',  sim.freq,        'lbl-freq',  1);
    _setSlider('sl-rho',   sim.rho,         'lbl-rho',   1);
    _setSlider('sl-K',     sim.K,           'lbl-K',     1);
    _setSlider('sl-atten', sim.attenuation, 'lbl-atten', 2);
    sim.speedFactor = 1.00;
    var slSpeed = document.getElementById('sl-speed');
    if (slSpeed) slSpeed.value = 3;
    var lblSpeed = document.getElementById('lbl-speed');
    if (lblSpeed) lblSpeed.textContent = '1,00';
    sim.wavePropsVisible = false;
    _applyWavePropsState();
    _syncWavePropsBtnState();
    updateCelerite();
    _updateCReadout();
    _syncSourceButtons();
    var btn = document.getElementById('btn-playpause');
    if (btn) { btn.textContent = '⏸ Pause'; btn.className = 'btn btn-pause'; }

    // ── Corde ──────────────────────────────────────────────────────────
    _setSlider('sl-freq-corde',  simCorde.freq,        'lbl-freq-corde',  1);
    _setSlider('sl-ampl-corde',  simCorde.amplitudeCm, 'lbl-ampl-corde',  1);
    _setSlider('sl-mu',          simCorde.mu,          'lbl-mu',          1);
    _setSlider('sl-T-tension',   simCorde.T_tension,   'lbl-T-tension',   1);
    _setSlider('sl-atten-corde', simCorde.attenuation, 'lbl-atten-corde', 2);
    simCorde.speedFactor = 1.00;
    var slSpeedC = document.getElementById('sl-speed-corde');
    if (slSpeedC) slSpeedC.value = 3;
    var lblSpeedC = document.getElementById('lbl-speed-corde');
    if (lblSpeedC) lblSpeedC.textContent = '1,00';
    simCorde.wavePropsVisible = false;
    _applyWavePropsCorde();
    _syncWavePropsBtnStateCorde();
    updateCeleriteCorde();
    _updateCReadoutCorde();
    _syncSourceButtonsCorde();
    var btnC = document.getElementById('btn-playpause-corde');
    if (btnC) { btnC.textContent = '⏸ Pause'; btnC.className = 'btn btn-pause'; }

    // ── Vagues ─────────────────────────────────────────────────────────
    _setSlider('sl-freq-vagues',  simVagues.freq,        'lbl-freq-vagues',  1);
    _setSlider('sl-ampl-vagues',  simVagues.amplitude,   'lbl-ampl-vagues',  1);
    _setSlider('sl-h-vagues',     simVagues.h,           'lbl-h-vagues',     3);
    var lblHV = document.getElementById('lbl-h-vagues');
    if (lblHV) lblHV.textContent = (simVagues.h * 1000).toFixed(1).replace('.', ',');
    _setSlider('sl-g-vagues',     simVagues.g,           'lbl-g-vagues',     2);
    _setSlider('sl-atten-vagues', simVagues.attenuation, 'lbl-atten-vagues', 2);
    simVagues.speedFactor = 1.00;
    var slSpeedV = document.getElementById('sl-speed-vagues');
    if (slSpeedV) slSpeedV.value = 3;
    var lblSpeedV = document.getElementById('lbl-speed-vagues');
    if (lblSpeedV) lblSpeedV.textContent = '1,00';
    simVagues.wavePropsVisible = false;
    _applyWavePropsVagues();
    updateCeleriteVagues();
    _updateCReadoutVagues();
    var btnV = document.getElementById('btn-playpause-vagues');
    if (btnV) { btnV.textContent = '⏸ Pause'; btnV.className = 'btn btn-pause'; }

    // ── Onglet actif : depuis le hash URL ou Son par défaut ───────────
    var hash = window.location.hash.replace('#', '');
    var validTabs = ['corde', 'son', 'vagues'];
    setMainTab(validTabs.indexOf(hash) !== -1 ? hash : 'son');
}

function _setSlider(sliderId, value, lblId, decimals) {
    var sl  = document.getElementById(sliderId);
    var lbl = document.getElementById(lblId);
    if (sl)  sl.value = value;
    if (lbl) lbl.textContent = value.toFixed(decimals).replace('.', ',');
}

// ── Démarrage ──────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);
