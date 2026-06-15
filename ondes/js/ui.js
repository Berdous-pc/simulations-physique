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

// ── Compteur de temps pour l'enregistrement DeltaP(t) ─────────────────
var lastDptUpdate = 0;
var DPT_SAMPLE_DT = 1 / 300;  // 300 enregistrements par seconde simulée (courbes lisses jusqu'à 5 Hz)

// ══════════════════════════════════════════════════════════════════════
//  Boucle d'animation principale
// ══════════════════════════════════════════════════════════════════════

function loop(ts) {
    requestAnimationFrame(loop);

    var dtReal = (ts - (loop.lastTs || ts)) / 1000;   // s
    loop.lastTs = ts;
    dtReal = Math.min(dtReal, 0.05);   // plafond 50 ms (évite les sauts)

    if (!sim.paused) {
        var dtSim = dtReal;
        sim.simTime += dtSim;

        // Nettoyer les anciennes impulsions
        pruneImpulses();

        // ── Détection fin d'impulsion ─────────────────────────────────
        // Quand toutes les impulsions ont quitté le tube : désactiver le
        // bouton Impulsion, mais la simulation CONTINUE de tourner.
        if (sim.impulsePropagating && sim.impulses.length === 0) {
            sim.impulsePropagating = false;
            sim.sourceMode         = null;
            _syncSourceButtons();
        }

        // Enregistrer ΔP(t) aux balises — rattrapage de tous les intervalles
        // manqués depuis la dernière frame, avec le timestamp interpolé exact
        while (sim.simTime - lastDptUpdate >= DPT_SAMPLE_DT) {
            lastDptUpdate += DPT_SAMPLE_DT;
            updateDptData(lastDptUpdate);
        }

        // ── Fenêtre cyclique 0–10 s en mode sinusoïdal ───────────────
        // En mode impulsion, dptTimeOrigin n'avance pas automatiquement
        // (la courbe reste figée après 10 s jusqu'à la prochaine impulsion)
        if (sim.sourceMode === 'sinus' &&
                sim.simTime - sim.dptTimeOrigin >= 10) {
            sim.dptTimeOrigin += 10;
            sim.dptData1 = [];
            sim.dptData2 = [];
        }
    }

    // Snapshot ΔP(x) (toujours mis à jour pour le graphe live)
    updateDpxData();

    // Rendu
    drawTube();
    drawGraph();

    // Mise à jour de l'afficheur de célérité
    if (!sim.paused) {
        _updateCReadout();
    }
}

// ── Afficheur c en temps réel ─────────────────────────────────────────

function _updateCReadout() {
    var el = document.getElementById('ro-c');
    if (el) el.textContent = sim.c_cms.toFixed(1).replace('.', ',');
}

// ══════════════════════════════════════════════════════════════════════
//  Actions source (boutons de la box source)
// ══════════════════════════════════════════════════════════════════════

// ── Utilitaire : arrête tous les modes source et met les boutons à l'état neutre
function _clearSourceModes() {
    // Arrêter la sinusoïdale
    if (sim.sinusoidalActive) {
        sim.sinusoidalActive = false;
        sim.sinStopTime      = sim.simTime;
    }
    // Annuler les impulsions en cours
    sim.impulses           = [];
    sim.impulsePropagating = false;
    sim.sourceMode         = null;
    _syncSourceButtons();
}

// ── Utilitaire : synchronise l'état visuel des deux boutons source
function _syncSourceButtons() {
    var btnImp = document.getElementById('btn-mode-impulse');
    var btnSin = document.getElementById('btn-mode-sinus');

    if (btnImp) btnImp.classList.toggle('active', sim.sourceMode === 'impulse');
    if (btnSin) btnSin.classList.toggle('active', sim.sourceMode === 'sinus');
}

// ── Bouton Impulsion ──────────────────────────────────────────────────
function sendImpulse() {
    // S'assurer que la sim tourne (reprendre si en pause)
    if (sim.paused) _setPaused(false);

    // Reset des modes en cours (sinusoïdale, impulsion précédente)
    _clearSourceModes();

    // Lancer l'impulsion
    sim.impulses.push({ startTime: sim.simTime });
    sim.impulsePropagating = true;
    sim.sourceMode         = 'impulse';
    // Reset du graphe ΔP(t) : nouvelle impulsion → nouvelle fenêtre 0–10 s
    sim.dptTimeOrigin = sim.simTime;
    sim.dptData1      = [];
    sim.dptData2      = [];
    _syncSourceButtons();
}

// ── Bouton Sinusoïdale ────────────────────────────────────────────────
function toggleSinusoidal() {
    if (sim.sinusoidalActive) {
        // Déjà active → l'arrêter
        _clearSourceModes();
    } else {
        // S'assurer que la sim tourne
        if (sim.paused) _setPaused(false);

        // Reset des modes en cours
        _clearSourceModes();

        // Démarrer la sinusoïdale
        sim.sinusoidalActive = true;
        sim.sinStartTime     = sim.simTime;
        sim.sinStopTime      = -1;
        sim.sourceMode       = 'sinus';
        // Reset du graphe ΔP(t) : nouvelle sinusoïdale → nouvelle fenêtre 0–10 s
        sim.dptTimeOrigin = sim.simTime;
        sim.dptData1      = [];
        sim.dptData2      = [];
        _syncSourceButtons();
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Contrôles du panneau droit
// ══════════════════════════════════════════════════════════════════════

// ── Utilitaire : applique l'état paused et met à jour le bouton Play/Pause
function _setPaused(paused) {
    sim.paused = paused;
    var btn = document.getElementById('btn-playpause');
    if (!btn) return;
    if (paused) {
        btn.textContent = '▶ Reprendre';
        btn.className   = 'btn btn-play';
    } else {
        btn.textContent = '⏸ Pause';
        btn.className   = 'btn btn-pause';
    }
}

// ── Bouton Play/Pause : fige ou reprend l'animation globale ──────────
function togglePause() {
    _setPaused(!sim.paused);
}

// ── Remise à zéro ────────────────────────────────────────────────────
function resetSimAnim() {
    resetAnim();          // remet sim à l'état initial (sourceMode=null, paused=false)
    lastDptUpdate = 0;
    _syncSourceButtons(); // aucun mode actif
    // Bouton Play/Pause : simulation qui tourne → afficher Pause
    var btn = document.getElementById('btn-playpause');
    if (btn) { btn.textContent = '⏸ Pause'; btn.className = 'btn btn-pause'; }
    // Réinitialiser le mode pression
    sim.pressureColorMode = false;
    var btnPc = document.getElementById('btn-pressure-color');
    if (btnPc) btnPc.classList.remove('active');
}

// ══════════════════════════════════════════════════════════════════════
//  Onglets principaux (Corde | Son | Vagues)
// ══════════════════════════════════════════════════════════════════════

function setMainTab(tab) {
    var tabs     = ['corde', 'son', 'vagues'];
    var sections = tabs.map(function(t) { return document.getElementById('section-' + t); });
    var buttons  = tabs.map(function(t) { return document.getElementById('tab-' + t); });

    tabs.forEach(function(t, idx) {
        if (sections[idx]) sections[idx].style.display = (t === tab) ? '' : 'none';
        if (buttons[idx])  buttons[idx].classList.toggle('active', t === tab);
    });

    // Mettre à jour le bandeau Instructions
    var allHints = document.querySelectorAll('.panel-hint');
    allHints.forEach(function(h) { h.style.display = 'none'; });
    var hint = document.getElementById('panel-hint-' + tab);
    if (hint) hint.style.display = '';
}

// ══════════════════════════════════════════════════════════════════════
//  Sliders du panneau
// ══════════════════════════════════════════════════════════════════════

function onSliderFreq(v) {
    sim.freq = parseFloat(v);
    var lbl = document.getElementById('lbl-freq');
    if (lbl) lbl.textContent = sim.freq.toFixed(1).replace('.', ',');
    // Recalculer extraLeft (zone spawn gauche dépend du boost tubeDispCap ∝ 1/f)
    initCols();
}

function onSliderRho(v) {
    var newRho = parseFloat(v);
    sim.rho = newRho;
    var lbl = document.getElementById('lbl-rho');
    if (lbl) lbl.textContent = newRho.toFixed(1).replace('.', ',');
    updateCelerite();
    _updateCReadout();
    // Réinitialiser les particules avec la nouvelle densité (N ∝ ρ linéaire)
    initCols();
}

function onSliderK(v) {
    var newK   = parseFloat(v);
    sim.K      = newK;
    var lbl = document.getElementById('lbl-K');
    if (lbl) lbl.textContent = newK.toFixed(1).replace('.', ',');
    updateCelerite();
    _updateCReadout();
    // Avec le modèle colonnes, K n'affecte que la célérité (pas l'agitation thermique)
}

function onSliderAtten(v) {
    sim.attenuation = parseFloat(v);
    var lbl = document.getElementById('lbl-atten');
    if (lbl) lbl.textContent = sim.attenuation.toFixed(2).replace('.', ',');
}

// ══════════════════════════════════════════════════════════════════════
//  Boutons au-dessus du tube
// ══════════════════════════════════════════════════════════════════════

function toggleSelect() {
    // Ne pas permettre la sélection si le mode pression est actif
    if (sim.pressureColorMode) return;
    
    sim.selectionMode = !sim.selectionMode;
    var btn = document.getElementById('btn-select');
    if (btn) btn.classList.toggle('active', sim.selectionMode);
    if (!sim.selectionMode) clearSelection();
}

// ── Bouton Colorier selon la pression ────────────────────────────────
function togglePressureColor() {
    sim.pressureColorMode = !sim.pressureColorMode;
    var btn = document.getElementById('btn-pressure-color');
    var btnSelect = document.getElementById('btn-select');
    
    if (btn) btn.classList.toggle('active', sim.pressureColorMode);
    
    // Désactiver le bouton "Sélectionner" et annuler la sélection
    if (sim.pressureColorMode) {
        sim.selectionMode = false;
        if (btnSelect) {
            btnSelect.disabled = true;
            btnSelect.classList.remove('active');
        }
        clearSelection();
    } else {
        // Réactiver le bouton "Sélectionner" quand on désactive le mode pression
        if (btnSelect) btnSelect.disabled = false;
    }
}

function toggleBeacon(n) {
    var beacon = (n === 1) ? sim.beacon1 : sim.beacon2;
    var btn    = document.getElementById('btn-beacon' + n);
    beacon.active = !beacon.active;

    if (beacon.active) {
        // Positionner par défaut au centre du tube si première activation
        if (n === 1) beacon.x = sim.tubeLeft + sim.tubeLength * 0.30;
        else         beacon.x = sim.tubeLeft + sim.tubeLength * 0.65;
        if (btn) btn.classList.add('active');
    } else {
        if (btn) btn.classList.remove('active');
        // Vider les données si la balise est désactivée
        if (n === 1) sim.dptData1 = [];
        else         sim.dptData2 = [];
    }
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
    // Resize initial
    resizeTube();
    resizeGraph();

    // Écouteur resize fenêtre — efface les hauteurs absolues du splitter
    // pour que le flex CSS reprenne la main, puis recalibre les canvas
    window.addEventListener('resize', function() {
        var animArea  = document.getElementById('anim-area');
        var graphArea = document.getElementById('graph-area');
        if (animArea)  { animArea.style.flex  = ''; animArea.style.height  = ''; }
        if (graphArea) { graphArea.style.flex = ''; graphArea.style.height = ''; }
        scheduleResizeTube();
    });

    // Démarrage de la boucle d'animation
    requestAnimationFrame(loop);

    // État initial de l'UI
    _syncUIToSim();
}

// Synchronise les valeurs de l'UI avec l'état initial de sim
function _syncUIToSim() {
    // Sliders
    _setSlider('sl-freq',  sim.freq,        'lbl-freq',  1);
    _setSlider('sl-rho',   sim.rho,         'lbl-rho',   1);
    _setSlider('sl-K',     sim.K,           'lbl-K',     1);
    _setSlider('sl-atten', sim.attenuation, 'lbl-atten', 2);
    // Célérité
    updateCelerite();
    _updateCReadout();
    // Aucun mode source actif au départ — boutons neutres, slider freq désactivé
    _syncSourceButtons();
    // Bouton Play/Pause : simulation qui tourne dès le départ → afficher Pause
    var btn = document.getElementById('btn-playpause');
    if (btn) { btn.textContent = '⏸ Pause'; btn.className = 'btn btn-pause'; }
    // Onglet Son actif au départ
    setMainTab('son');
}

function _setSlider(sliderId, value, lblId, decimals) {
    var sl  = document.getElementById(sliderId);
    var lbl = document.getElementById(lblId);
    if (sl)  sl.value = value;
    if (lbl) lbl.textContent = value.toFixed(decimals).replace('.', ',');
}

// ── Démarrage ─────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);
