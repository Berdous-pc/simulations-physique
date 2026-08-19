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
var lastSrcUpdateSon = 0;          // Son   — échantillonnage de la membrane
var _srcTickSon      = 0;          // Son   — 1 enregistrement ΔP(t) sur 2
var lastSrcUpdate    = 0;          // Corde — échantillonnage de la source
var _srcTickCorde    = 0;          // Corde — 1 enregistrement y(t) sur 2
var lastYtUpdateV    = 0;          // Vagues

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

            // Échantillonnage de la membrane à pas fixe : c'est lui qui
            // « grave » l'onde émise. L'enregistrement ΔP(t) des balises se
            // fait un pas sur deux (600 Hz → 300 Hz), en phase avec les
            // échantillons pour que les deux lectures soient cohérentes.
            while (sim.simTime - lastSrcUpdateSon >= SRC_DT) {
                lastSrcUpdateSon += SRC_DT;
                stepSourceSon(lastSrcUpdateSon);
                _srcTickSon = 1 - _srcTickSon;
                if (_srcTickSon === 0) updateDptData(lastSrcUpdateSon);
            }

            if (sim.sourceMode === 'sinus' && sim.simTime - sim.dptTimeOrigin >= 5) {
                sim.dptTimeOrigin += 5;
            }
        }

        // Inutile de reconstruire la courbe ΔP(x) quand seul ΔP(t) est
        // affiché (updateDpxData se court-circuite par ailleurs tant que
        // rien n'a changé, ex. en pause).
        if (sim.graphMode !== 'dpt') updateDpxData();
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

            if (chronoCorde.running) chronoCorde.elapsed += dtSimC;

            pruneImpulsesCorde();

            if (simCorde.impulsePropagating && simCorde.impulses.length === 0) {
                simCorde.impulsePropagating = false;
                simCorde.sourceMode         = null;
                _syncWavePropsBtnStateCorde();
                _syncLambdaBtnStateCorde();
            }

            // Le bouton Activer/Désactiver dépend de simTime (source encore
            // en mouvement ou non) : on le réévalue à chaque frame plutôt
            // qu'aux seuls changements d'état ci-dessus.
            _syncSourceButtonsCorde();

            // Mode Libre : répartir le déplacement de la souris sur les
            // échantillons de la frame. Le curseur ne donne qu'un point tous
            // les ~16 ms là où la source en consomme dix : sans cette rampe,
            // chaque position serait recopiée à l'identique et graverait un
            // escalier de paliers au lieu d'un geste continu. On compte donc
            // les pas à venir pour en déduire l'incrément par pas.
            var freeInc = 0;
            if (simCorde.freeActive) {
                var nSteps = Math.floor((simCorde.simTime - lastSrcUpdate) / SRC_DT);
                freeInc = (nSteps > 0)
                    ? (simCorde.freeTargetY - simCorde.freeY) / nSteps : 0;
            }

            // Échantillonnage de la source à pas fixe : c'est lui qui
            // « grave » l'onde émise. L'enregistrement y(t) des balises se
            // fait un pas sur deux (600 Hz → 300 Hz), en phase avec les
            // échantillons pour que les deux lectures soient cohérentes.
            while (simCorde.simTime - lastSrcUpdate >= SRC_DT) {
                lastSrcUpdate += SRC_DT;
                if (freeInc !== 0) simCorde.freeY += freeInc;
                stepSourceCorde(lastSrcUpdate);
                _srcTickCorde = 1 - _srcTickCorde;
                if (_srcTickCorde === 0) updateYtData(lastSrcUpdate);
            }
            // Recale exactement sur la cible : les additions successives de
            // freeInc laissent sinon une dérive d'arrondi qui ferait diverger
            // la boule du curseur au fil des frames.
            if (freeInc !== 0) simCorde.freeY = simCorde.freeTargetY;

            if ((simCorde.sourceMode === 'sinus' || simCorde.sourceMode === 'periodic') &&
                    simCorde.simTime - simCorde.ytTimeOrigin >= 5) {
                simCorde.ytTimeOrigin += 5;
            }
        }

        // Inutile de reconstruire la courbe y(x) quand seul y(t) est affiché
        // (updateYxData se court-circuite par ailleurs tant que rien n'a
        // changé, ex. en pause — cf. commentaire équivalent pour Vagues).
        if (simCorde.graphMode !== 'dpt') updateYxData();
        drawCorde();
        drawGraph();

        if (!simCorde.paused) {
            _updateCReadoutCorde();
            _updateWavePropsCorde();
            _updateChronoCorde();
        }
    } else {
        // ── Avancement temps Vagues ───────────────────────────────────
        if (!simVagues.paused) {
            var dtSimV = dtReal * (simVagues.speedFactor || 1.0);
            simVagues.simTime += dtSimV;
            addSourceSampleVagues(simVagues.simTime);

            while (simVagues.simTime - lastYtUpdateV >= VAGUES_YT_SAMPLE_DT) {
                lastYtUpdateV += VAGUES_YT_SAMPLE_DT;
                updateYtDataVagues(lastYtUpdateV);
            }

            if (simVagues.simTime - simVagues.ytTimeOrigin >= 5) {
                simVagues.ytTimeOrigin += 5;
            }
        }

        // Inutile de reconstruire la courbe y(x) quand seul le graphe y(t) est
        // affiché : elle n'est alors jamais dessinée. (updateYxDataVagues se
        // court-circuite par ailleurs tant que rien n'a changé, ex. en pause.)
        if (simVagues.graphMode !== 'dpt') updateYxDataVagues();
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
    if (el) el.innerHTML = fmtSciHTML(sim.c_cms, 2);
}

// ── Utilitaires source Son ────────────────────────────────────────────
//  Arrête l'ÉMISSION sans toucher à ce qui est déjà parti : la liste des
//  impulsions est conservée (une impulsion encore en cours d'émission doit
//  aller à son terme, et l'historique de la source est de toute façon figé).
function _stopEmissionSon() {
    sim.sinusoidalActive = false;
    sim.sourceMode       = null;
    _syncSourceButtons();
    _syncWavePropsBtnState();
}

//  Réinitialise la fenêtre du graphe ΔP(t) — uniquement si le tube est au
//  repos, pour ne pas tronquer une courbe en cours d'enregistrement quand on
//  superpose une nouvelle perturbation.
function _resetDptWindowSonIfQuiet() {
    if (!sonIsQuiet()) return;
    sim.dptTimeOrigin = sim.simTime;
    _dptClear(1);
    _dptClear(2);
}

function _syncSourceButtons() {
    var btnImp = document.getElementById('btn-mode-impulse');
    var btnSin = document.getElementById('btn-mode-sinus');
    if (btnImp) btnImp.classList.toggle('active', sim.sourceMode === 'impulse');
    if (btnSin) btnSin.classList.toggle('active', sim.sourceMode === 'sinus');
}

//  Chaque appui envoie une NOUVELLE impulsion : celles qui sont déjà dans le
//  tube poursuivent leur route et se superposent, au lieu d'être effacées.
function sendImpulse() {
    if (sim.paused) _setPaused(false);
    _resetDptWindowSonIfQuiet();

    sim.sinusoidalActive   = false;   // les deux modes restent exclusifs
    sim.impulses.push({ startTime: sim.simTime });
    sim.impulsePropagating = true;
    sim.sourceMode         = 'impulse';

    _syncSourceButtons();
    _syncWavePropsBtnState();
}

function toggleSinusoidal() {
    if (sim.sinusoidalActive) {
        _stopEmissionSon();
    } else {
        if (sim.paused) _setPaused(false);
        _resetDptWindowSonIfQuiet();

        sim.sinusoidalActive = true;
        sim.sinPhase         = 0;   // démarrage à u = 0, sans saut
        sim.sourceMode       = 'sinus';

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
    lastSrcUpdateSon = 0;
    _srcTickSon      = 0;
    _syncSourceButtons();
    var btn = document.getElementById('btn-playpause');
    if (btn) { btn.textContent = '⏸ Pause'; btn.className = 'btn btn-pause'; }
    sim.pressureColorMode = false;
    var btnPc = document.getElementById('btn-pressure-color');
    if (btnPc) btnPc.classList.remove('active');

    // Le réticule est un mode d'inspection : la remise à zéro le relâche aussi.
    sim.graphCursorMode = false;
    var btnCur = document.getElementById('btn-graph-cursor');
    if (btnCur) btnCur.classList.remove('active');
    var tip = document.getElementById('graph-hover-tooltip');
    if (tip) tip.style.display = 'none';
}

// ── Sliders Son ───────────────────────────────────────────────────────
//  Les readouts sont rafraîchis ICI et pas seulement dans la boucle : celle-ci
//  ne les met à jour que si l'animation tourne, si bien qu'en pause les valeurs
//  de T et λ restaient figées sur les anciens réglages.
function onSliderFreq(v) {
    sim.freq = parseFloat(v);
    var lbl = document.getElementById('lbl-freq');
    if (lbl) lbl.textContent = sim.freq.toFixed(1).replace('.', ',');
    initCols();
    _updateWaveProps();
}

function onSliderRho(v) {
    sim.rho = parseFloat(v);
    var lbl = document.getElementById('lbl-rho');
    if (lbl) lbl.textContent = sim.rho.toFixed(1).replace('.', ',');
    updateCelerite();
    _updateCReadout();
    initCols();
    _updateWaveProps();
}

function onSliderK(v) {
    sim.K = parseFloat(v);
    var lbl = document.getElementById('lbl-K');
    if (lbl) lbl.textContent = sim.K.toFixed(1).replace('.', ',');
    updateCelerite();
    _updateCReadout();
    initCols();
    _updateWaveProps();
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
    if (elC) elC.innerHTML = fmtSciHTML(sim.c_cms, 2);
    var f   = sim.freq;
    var T   = (f > 0) ? 1 / f : 0;
    var elF = document.getElementById('ro-f');
    var elT = document.getElementById('ro-T');
    if (elF) elF.textContent = f.toFixed(2).replace('.', ',');
    if (elT) elT.textContent = T.toFixed(3).replace('.', ',');
    var lambda = sim.c_cms * T;
    var elL    = document.getElementById('ro-lambda');
    if (elL) elL.innerHTML = fmtSciHTML(lambda, 2);
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
    if (el) el.textContent = fmtFRRound(simCorde.c_cms, 2);
}

// ── Utilitaires source Corde ──────────────────────────────────────────
//  Arrête l'ÉMISSION sans toucher à ce qui est déjà parti : la liste des
//  impulsions est conservée (une impulsion encore en cours d'émission doit
//  aller à son terme, et l'historique de la source est de toute façon figé).
function _stopEmissionCorde() {
    simCorde.sinusoidalActive = false;
    simCorde.periodicActive   = false;
    simCorde.sourceMode       = null;
    _syncSourceButtonsCorde();
    _syncWavePropsBtnStateCorde();
    _syncLambdaBtnStateCorde();
}

//  Réinitialise la fenêtre du graphe y(t) — uniquement si la corde est au
//  repos, pour ne pas tronquer une courbe en cours d'enregistrement quand
//  on superpose une nouvelle perturbation.
function _resetYtWindowCordeIfQuiet() {
    if (!cordeIsQuiet()) return;
    simCorde.ytTimeOrigin = simCorde.simTime;
    _ytClearCorde(1);
    _ytClearCorde(2);
}

//  Le bouton reflète l'état DE LA SOURCE elle-même (le pot vibrant), pas
//  celui de l'onde sur la corde : en impulsion, il s'éteint dès que le pot
//  a fini son mouvement (sourceActiveUntil), bien avant que l'impulsion
//  n'ait fini de traverser la corde.
function _syncSourceButtonsCorde() {
    var btn = document.getElementById('btn-source-active-corde');
    if (!btn) return;
    var active = (simCorde.sourceMode === 'impulse'  && simCorde.simTime < simCorde.sourceActiveUntil) ||
                 (simCorde.sourceMode === 'sinus'    && simCorde.sinusoidalActive) ||
                 (simCorde.sourceMode === 'periodic' && simCorde.periodicActive);
    btn.classList.toggle('active', active);
}

//  Applique le mode choisi dans le sélecteur : c'est le seul endroit qui
//  décide de l'état « Libre » et de l'activation des commandes qui n'ont
//  pas de sens dans ce mode (bouton Activer, curseurs f et A, propriétés
//  de l'onde — le geste de la souris n'a ni fréquence ni amplitude fixe).
function _applySourceModeCorde() {
    var sel  = document.getElementById('sel-mode-corde');
    var mode = sel ? sel.value : 'impulse';
    var free = (mode === 'free');

    simCorde.freeActive = free;
    if (free) {
        simCorde.sourceMode = 'free';
    } else if (simCorde.sourceMode === 'free') {
        simCorde.sourceMode   = null;
        simCorde.freeY        = 0;   // la corde relâchée revient au repos
        simCorde.freeTargetY  = 0;
        simCorde.freeDragging = false;
    }

    var btn = document.getElementById('btn-source-active-corde');
    if (btn) btn.disabled = free;

    var rowF = document.getElementById('freq-row-corde');
    var rowA = document.getElementById('ampl-row-corde');
    if (rowF) rowF.classList.toggle('disabled', free);
    if (rowA) rowA.classList.toggle('disabled', free);
    var slF = document.getElementById('sl-freq-corde');
    var slA = document.getElementById('sl-ampl-corde');
    if (slF) slF.disabled = free;
    if (slA) slA.disabled = free;

    _syncSourceButtonsCorde();
    _syncWavePropsBtnStateCorde();
    _syncLambdaBtnStateCorde();
    _syncChronoLinkCorde(mode);
    _syncChronoUnitsCorde();
    _updateChronoCorde();
}

//  Bouton unique Activer/Désactiver : son effet dépend du mode choisi dans
//  le sélecteur. En Impulsion, chaque appui relance une impulsion et le
//  bouton se rallume tout seul le temps qu'elle traverse la corde (cf.
//  animate() dans la boucle principale). En Sinusoïdale et Périodique, il
//  bascule l'émission continue on/off.
function toggleSourceActiveCorde() {
    var sel  = document.getElementById('sel-mode-corde');
    var mode = sel ? sel.value : 'impulse';
    if (mode === 'free')          return;   // bouton désactivé — cf. _applySourceModeCorde

    var wasOn = simCorde.sinusoidalActive || simCorde.periodicActive;

    if (mode === 'impulse')       sendImpulseCorde();
    else if (mode === 'sinus')    toggleSinusoidalCorde();
    else                          togglePeriodicCorde();

    // Chronomètre lié (case « Lier ») : activer la source le lance s'il est
    // à l'arrêt, sans toucher à la valeur affichée — la remise à zéro reste
    // la main de l'utilisateur (bouton ⟲). S'il tourne déjà, on n'y touche
    // pas : une mesure en cours n'est jamais interrompue, y compris quand on
    // envoie une nouvelle impulsion pendant qu'une autre voyage encore.
    // Désactiver la source ne l'arrête pas non plus : l'onde déjà émise
    // continue de se propager et reste chronométrable.
    var isOn = simCorde.sinusoidalActive || simCorde.periodicActive;
    if (mode === 'impulse' || (!wasOn && isOn)) _startChronoIfLinkedCorde();
}

//  Démarrage du chronomètre lié. Appelé à la mise en marche de la source :
//  par le bouton Activer, et par la saisie de la boule en mode Libre (cf.
//  onDown dans tube.js), où le geste EST la source.
function _startChronoIfLinkedCorde() {
    if (!_chronoLinkedCorde() || chronoCorde.running) return;
    chronoCorde.running = true;
    _syncChronoBtnCorde();
}

//  Changement de mode dans le sélecteur : basculer entre Sinusoïdale et
//  Périodique alors qu'une émission continue tourne ne l'arrête pas — la
//  source reste activée, juste dans le nouveau mode. Ce n'est que vers un
//  mode qui n'a pas d'émission continue (Impulsion, Libre) qu'elle est
//  coupée (une impulsion en cours de propagation, elle, va à son terme).
function onSourceModeChangeCorde() {
    var sel  = document.getElementById('sel-mode-corde');
    var mode = sel ? sel.value : 'impulse';
    var wasContinuous = simCorde.sinusoidalActive || simCorde.periodicActive;

    if (wasContinuous && mode === 'sinus') {
        simCorde.sinusoidalActive = true;
        simCorde.periodicActive   = false;
        simCorde.sinPhase         = 0;   // démarrage à y = 0, sans saut
        simCorde.sourceMode       = 'sinus';
    } else if (wasContinuous && mode === 'periodic') {
        simCorde.periodicActive   = true;
        simCorde.sinusoidalActive = false;
        simCorde.periodicPhase    = 0;   // démarrage à y = 0, sans saut
        simCorde.sourceMode       = 'periodic';
    } else if (wasContinuous) {
        _stopEmissionCorde();
    }

    _applySourceModeCorde();
}

//  Chaque appui envoie une NOUVELLE impulsion : celles qui sont déjà sur la
//  corde poursuivent leur route et se superposent, au lieu d'être effacées.
function sendImpulseCorde() {
    if (simCorde.paused) _setPausedCorde(false);
    _resetYtWindowCordeIfQuiet();

    simCorde.sinusoidalActive   = false;   // tous les modes restent exclusifs
    simCorde.periodicActive     = false;
    simCorde.impulses.push({ startTime: simCorde.simTime });
    simCorde.impulsePropagating = true;
    simCorde.sourceMode         = 'impulse';
    simCorde.sourceActiveUntil  = Math.max(simCorde.sourceActiveUntil, simCorde.simTime + T_IMPULSE);

    _syncSourceButtonsCorde();
    _syncWavePropsBtnStateCorde();
    _syncLambdaBtnStateCorde();
}

function toggleSinusoidalCorde() {
    if (simCorde.sinusoidalActive) {
        _stopEmissionCorde();
    } else {
        if (simCorde.paused) _setPausedCorde(false);
        _resetYtWindowCordeIfQuiet();

        simCorde.sinusoidalActive = true;
        simCorde.periodicActive   = false;   // tous les modes restent exclusifs
        simCorde.sinPhase         = 0;       // démarrage à y = 0, sans saut
        simCorde.sourceMode       = 'sinus';

        _syncSourceButtonsCorde();
        _syncWavePropsBtnStateCorde();
        _syncLambdaBtnStateCorde();
    }
}

//  Signal « Périodique » : somme fondamentale + harmonique 2 (cf.
//  stepSourceCorde), non sinusoïdale mais toujours lisse — même logique de
//  bascule on/off que le mode Sinusoïdale.
function togglePeriodicCorde() {
    if (simCorde.periodicActive) {
        _stopEmissionCorde();
    } else {
        if (simCorde.paused) _setPausedCorde(false);
        _resetYtWindowCordeIfQuiet();

        simCorde.periodicActive   = true;
        simCorde.sinusoidalActive = false;   // tous les modes restent exclusifs
        simCorde.periodicPhase    = 0;       // démarrage à y = 0, sans saut
        simCorde.sourceMode       = 'periodic';

        _syncSourceButtonsCorde();
        _syncWavePropsBtnStateCorde();
        _syncLambdaBtnStateCorde();
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
    lastSrcUpdate = 0;
    _srcTickCorde = 0;
    // Le chronomètre mesure le temps de simulation : remettre celle-ci à
    // zéro sans l'arrêter laisserait une durée qui ne correspond plus à rien.
    chronoCorde.running = false;
    chronoCorde.elapsed = 0;
    _syncChronoBtnCorde();
    _updateChronoCorde();
    // resetAnimCorde remet sourceMode à null : on réapplique la sélection
    // du menu déroulant, qui elle n'est pas remise à zéro.
    _applySourceModeCorde();
    var btn = document.getElementById('btn-playpause-corde');
    if (btn) { btn.textContent = '⏸ Pause'; btn.className = 'btn btn-pause'; }

    // Le réticule est un mode d'inspection : la remise à zéro le relâche
    // aussi, sans quoi le bouton restait allumé sur une scène vierge.
    simCorde.graphCursorMode = false;
    var btnCur = document.getElementById('btn-graph-cursor');
    if (btnCur) btnCur.classList.remove('active');
    var tip = document.getElementById('graph-hover-tooltip');
    if (tip) tip.style.display = 'none';
}

// ══════════════════════════════════════════════════════════════════════
//  Chronomètre (onglet Corde)
// ══════════════════════════════════════════════════════════════════════
//  Il compte le temps de SIMULATION et non le temps réel : il se fige donc
//  avec la pause et suit le facteur de vitesse, sans quoi les durées lues
//  ne correspondraient pas à celles des graphes.
//
//  Deux unités : la seconde, ou la période T de la source. Le comptage en
//  T n'a de sens que pour un signal périodique — le bouton reste donc
//  désactivé en mode Impulsion et Libre (cf. _cordeModeIsImpulseOrFree).
//  La conversion utilise la fréquence COURANTE : changer f en cours de
//  chronométrage réinterprète l'ensemble de la durée écoulée.
var chronoCorde = { running: false, elapsed: 0, unit: 's' };

//  Case « Lier » : quand elle est cochée, activer la source déclenche le
//  chronomètre. Elle est recochée/décochée à chaque changement de mode
//  (cf. _syncChronoLinkCorde), l'utilisateur restant libre de la modifier
//  ensuite pour le mode courant.
function _chronoLinkedCorde() {
    var chk = document.getElementById('chk-chrono-link');
    return !!(chk && chk.checked);
}

//  Par défaut : liée pour les émissions continues (Sinusoïdale, Périodique),
//  où le chrono sert à compter des périodes depuis le début de l'émission ;
//  déliée en Impulsion et Libre, où le déclenchement se fait plutôt à la
//  main, au passage devant un repère.
function _syncChronoLinkCorde(mode) {
    var chk = document.getElementById('chk-chrono-link');
    if (chk) chk.checked = (mode === 'sinus' || mode === 'periodic');
}

function toggleChronoCorde() {
    chronoCorde.running = !chronoCorde.running;
    _syncChronoBtnCorde();
}

//  Remise à zéro : arrête aussi le comptage, pour repartir d'un chronomètre
//  à l'arrêt sur 0 plutôt que de le voir redémarrer aussitôt.
function resetChronoCorde() {
    chronoCorde.elapsed = 0;
    chronoCorde.running = false;
    _syncChronoBtnCorde();
    _updateChronoCorde();
}

function setChronoUnitCorde(unit) {
    var btn = document.getElementById('btn-chrono-unit-' + unit);
    if (btn && btn.disabled) return;
    chronoCorde.unit = (unit === 'T') ? 'T' : 's';
    _syncChronoUnitsCorde();
    _updateChronoCorde();
}

//  Icônes marche/arrêt dessinées en SVG plutôt qu'avec les caractères ▶ et
//  ⏸ : ces glyphes sont rendus par la police emoji, dont les métriques
//  décalent visiblement le symbole dans le bouton.
var CHRONO_ICO_PLAY  = '<svg class="chrono-ico" viewBox="0 0 12 12" aria-hidden="true">' +
                       '<polygon points="3.5,2 10,6 3.5,10"/></svg>';
var CHRONO_ICO_PAUSE = '<svg class="chrono-ico" viewBox="0 0 12 12" aria-hidden="true">' +
                       '<rect x="3" y="2" width="2.5" height="8"/>' +
                       '<rect x="6.5" y="2" width="2.5" height="8"/></svg>';

function _syncChronoBtnCorde() {
    var btn = document.getElementById('btn-chrono-start');
    if (!btn) return;
    btn.innerHTML = chronoCorde.running ? CHRONO_ICO_PAUSE : CHRONO_ICO_PLAY;
    btn.title     = chronoCorde.running ? 'Arrêter le chronomètre'
                                        : 'Démarrer le chronomètre';
    btn.classList.toggle('running', chronoCorde.running);
}

//  Appelé aussi au changement de mode de source : repasser en Impulsion ou
//  Libre alors que l'affichage est en T le ramène aux secondes, faute de
//  période définie.
function _syncChronoUnitsCorde() {
    var noPeriod = _cordeModeIsImpulseOrFree();
    if (noPeriod && chronoCorde.unit === 'T') chronoCorde.unit = 's';

    var btnT = document.getElementById('btn-chrono-unit-T');
    if (btnT) {
        btnT.disabled = noPeriod;
        btnT.classList.toggle('active', chronoCorde.unit === 'T');
    }
    var btnS = document.getElementById('btn-chrono-unit-s');
    if (btnS) btnS.classList.toggle('active', chronoCorde.unit === 's');
}

function _updateChronoCorde() {
    var el = document.getElementById('chrono-value');
    if (!el) return;
    // En T, la durée est comptée en nombre de périodes : t x f.
    var inT = (chronoCorde.unit === 'T' && simCorde.freq > 0);
    var txt = inT ? fmtFR(chronoCorde.elapsed * simCorde.freq, 2)
                  : fmtFR(chronoCorde.elapsed, 2);
    // Écriture conditionnelle : la fonction est appelée à chaque frame.
    if (txt !== _chronoLastTxt) { el.textContent = txt; _chronoLastTxt = txt; }

    var lbl = document.getElementById('chrono-unit-lbl');
    if (lbl) lbl.textContent = inT ? 'T' : 's';
}
var _chronoLastTxt = '';

// ── Sliders Corde ─────────────────────────────────────────────────────
//  Les readouts sont rafraîchis ICI et pas seulement dans la boucle : celle-ci
//  ne les met à jour que si l'animation tourne, si bien qu'en pause les
//  valeurs de T et λ restaient figées sur les anciens réglages.
function onSliderFreqCorde(v) {
    simCorde.freq = parseFloat(v);
    var lbl = document.getElementById('lbl-freq-corde');
    if (lbl) lbl.textContent = simCorde.freq.toFixed(1).replace('.', ',');
    _updateWavePropsCorde();
    _updateChronoCorde();   // l'affichage en T dépend de f
}

function onSliderAmplCorde(v) {
    simCorde.amplitudeCm = parseFloat(v);
    var lbl = document.getElementById('lbl-ampl-corde');
    if (lbl) lbl.textContent = simCorde.amplitudeCm.toFixed(1).replace('.', ',');
}

function onSliderMu(v) {
    simCorde.mu = parseFloat(v);
    var lbl = document.getElementById('lbl-mu');
    if (lbl) lbl.textContent = simCorde.mu.toFixed(1).replace('.', ',');
    updateCeleriteCorde();
    _updateCReadoutCorde();
    _updateWavePropsCorde();
}

function onSliderTension(v) {
    simCorde.T_tension = parseFloat(v);
    var lbl = document.getElementById('lbl-T-tension');
    if (lbl) lbl.textContent = simCorde.T_tension.toFixed(1).replace('.', ',');
    updateCeleriteCorde();
    _updateCReadoutCorde();
    _updateWavePropsCorde();
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
// ── Aspect de la corde : 'continu' | 'discret' ────────────────────────
//  Purement visuel : rien n'est réinitialisé, l'onde en cours poursuit sa
//  route. Passer en Discret cale simplement les balises sur les points
//  matériels les plus proches (une balise ne peut pas être posée sur un
//  lien entre deux points).
function setCordeAspect(mode) {
    if (mode !== 'discret') mode = 'continu';
    simCorde.aspect = mode;

    var btnC = document.getElementById('btn-aspect-continu');
    var btnD = document.getElementById('btn-aspect-discret');
    if (btnC) btnC.classList.toggle('active', mode === 'continu');
    if (btnD) btnD.classList.toggle('active', mode === 'discret');

    if (mode === 'discret') {
        // Le graphe y(t) enregistré jusqu'ici décrit un point qui n'est plus
        // celui suivi : on repart d'une trace propre, comme après un drag
        // (cf. _clearBeaconRecord dans tube.js).
        var moved1 = simCorde.beacon1.x, moved2 = simCorde.beacon2.x;
        snapCordeBeacon(simCorde.beacon1);
        snapCordeBeacon(simCorde.beacon2);
        if (simCorde.beacon1.active && simCorde.beacon1.x !== moved1) _ytClearCorde(1);
        if (simCorde.beacon2.active && simCorde.beacon2.x !== moved2) _ytClearCorde(2);
    }
}

// ── Bouton "Afficher graphe" (Corde) ────────────────────────────────
// Masque entièrement #graph-area (+ le splitter) pour que la zone
// d'animation occupe tout l'espace disponible. Ne concerne que l'onglet
// Corde : les autres onglets n'ont pas ce bouton et gardent le graphe visible.
function toggleShowGraphCorde() {
    simCorde.graphVisible = !simCorde.graphVisible;
    _applyShowGraphCorde();
}

function _applyShowGraphCorde() {
    var btn = document.getElementById('btn-show-graph-corde');
    if (btn) btn.classList.toggle('active', simCorde.graphVisible);

    var leftCol = document.getElementById('left-col');
    if (leftCol) leftCol.classList.toggle('graph-hidden', activeTab === 'corde' && !simCorde.graphVisible);

    // La classe posée avant l'exécution de ce script (cf. script inline dans
    // <head>, pour éviter le flash au chargement direct sur #corde) n'est
    // plus utile dès que l'état réel est appliqué : sans ce retrait, elle
    // masquerait #graph-area en permanence, même sur les autres onglets et
    // même après avoir cliqué sur « Afficher graphe ».
    document.documentElement.classList.remove('init-corde-graph-hidden');

    // Rétablit la répartition réglée par l'utilisateur, ou la retire quand
    // le graphe est masqué : sans ça, une hauteur inline laissée par un drag
    // précédent figerait #anim-area et laisserait une bande vide sous
    // l'animation, là où le graphe se trouvait.
    applySplitFrac(splitFrac);

    scheduleResizeTube();
    resizeGraph();
}

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
    if (elC) elC.textContent = fmtFRRound(simCorde.c_cms, 2);
    var f   = simCorde.freq;
    var T   = (f > 0) ? 1 / f : 0;
    var elF = document.getElementById('ro-f-corde');
    var elT = document.getElementById('ro-T-corde');
    if (elF) elF.textContent = f.toFixed(2).replace('.', ',');
    if (elT) elT.textContent = T.toFixed(3).replace('.', ',');
    var lambda = simCorde.c_cms * T;   // m (c en m/s × T en s)
    var elL    = document.getElementById('ro-lambda-corde');
    if (elL) elL.textContent = fmtFRRound(lambda, 2);
}

//  Impulsion et Libre n'ont pas de fréquence définie : λ = c·T n'aurait
//  aucun sens. On se base sur le SÉLECTEUR de mode, pas sur sourceMode
//  (qui ne reflète que l'émission en cours) : le verrouillage doit
//  s'appliquer dès que le mode est choisi, même avant toute activation
//  de la source.
function _cordeModeIsImpulseOrFree() {
    var sel = document.getElementById('sel-mode-corde');
    var mode = sel ? sel.value : 'impulse';
    return (mode === 'impulse' || mode === 'free');
}

// ── Bouton "Afficher la longueur d'onde" (Corde) ─────────────────────
function toggleLambdaCorde() {
    var btn = document.getElementById('btn-lambda-corde');
    if (btn && btn.disabled) return;
    simCorde.lambdaVisible = !simCorde.lambdaVisible;
    _applyLambdaCorde();
}

function _applyLambdaCorde() {
    var btn = document.getElementById('btn-lambda-corde');
    if (btn) btn.classList.toggle('active', simCorde.lambdaVisible);
}

function _syncLambdaBtnStateCorde() {
    var btn = document.getElementById('btn-lambda-corde');
    if (!btn) return;
    var isImpulse = _cordeModeIsImpulseOrFree();
    btn.disabled = isImpulse;
    if (isImpulse && simCorde.lambdaVisible) {
        simCorde.lambdaVisible = false;
        _applyLambdaCorde();
    }
}

function _syncWavePropsBtnStateCorde() {
    var btn = document.getElementById('btn-wave-props-corde');
    if (!btn) return;
    var isImpulse = _cordeModeIsImpulseOrFree();
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
        // frac est CONSERVÉ d'une activation à l'autre : masquer une balise
        // pour dégager la vue ne doit pas faire perdre la position choisie.
        // (Le bouton « Remettre à zéro » restaure les positions par défaut.)
        beacon.x = sim.tubeLeft + sim.tubeLength * beacon.frac;
        if (btn) btn.classList.add('active');
    } else {
        if (btn) btn.classList.remove('active');
        _dptClear(n);
    }
}

function _toggleBeaconCorde(n) {
    var beacon = (n === 1) ? simCorde.beacon1 : simCorde.beacon2;
    var btn    = document.getElementById('btn-beacon' + n);
    beacon.active = !beacon.active;
    if (beacon.active) {
        // frac est CONSERVÉ d'une activation à l'autre : masquer une balise
        // pour dégager la vue ne doit pas faire perdre la position choisie.
        // (Le bouton « Remettre à zéro » restaure les positions par défaut.)
        beacon.x = simCorde.cordeLeft + simCorde.cordeLength * beacon.frac;
        snapCordeBeacon(beacon);   // aspect Discret : cale sur un point matériel
        if (btn) btn.classList.add('active');
    } else {
        if (btn) btn.classList.remove('active');
        _ytClearCorde(n);
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Onglets principaux (Corde | Son | Vagues)
// ══════════════════════════════════════════════════════════════════════

function setMainTab(tab) {
    activeTab = tab;
    history.replaceState(null, '', location.pathname + '#' + tab);

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

    // Chronomètre : propre à l'onglet Corde
    var chrono = document.getElementById('chrono-corde');
    if (chrono) chrono.style.display = (tab === 'corde') ? '' : 'none';

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

    // ── Zone graphe masquée (bouton "Afficher graphe", Corde uniquement) ─
    var leftCol = document.getElementById('left-col');
    if (leftCol) leftCol.classList.toggle('graph-hidden', tab === 'corde' && !simCorde.graphVisible);
    // cf. commentaire dans _applyShowGraphCorde : la classe de pré-masquage
    // posée dans <head> ne doit pas survivre au premier calcul de l'état réel.
    document.documentElement.classList.remove('init-corde-graph-hidden');

    // La box source n'a pas le même contenu d'un onglet à l'autre, donc pas la
    // même hauteur : il faut réajuster son échelle. Le ResizeObserver, lui, ne
    // verrait rien — la taille de #anim-area, elle, n'a pas changé.
    _applySourceScale();

    // La répartition réglée au splitter est posée ou retirée selon que le
    // graphe est visible dans ce nouvel onglet (cf. applySplitFrac).
    applySplitFrac(splitFrac);

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

    // La répartition mémorisée est en flex-grow : elle suit le
    // redimensionnement d'elle-même. On la réapplique tout de même pour la
    // reborner — un plancher qui tenait dans l'ancienne hauteur peut ne
    // plus tenir dans la nouvelle.
    window.addEventListener('resize', function() {
        applySplitFrac(splitFrac);
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
    simCorde.lambdaVisible = false;
    _applyLambdaCorde();
    _syncLambdaBtnStateCorde();
    simCorde.graphVisible = false;
    _applyShowGraphCorde();
    updateCeleriteCorde();
    _updateCReadoutCorde();
    _applySourceModeCorde();
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
