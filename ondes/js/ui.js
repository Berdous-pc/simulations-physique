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
var DPT_SAMPLE_DT = 1 / 30;   // 30 enregistrements par seconde simulée

// ══════════════════════════════════════════════════════════════════════
//  Boucle d'animation principale
// ══════════════════════════════════════════════════════════════════════

function loop(ts) {
    requestAnimationFrame(loop);

    var dtReal = (ts - (loop.lastTs || ts)) / 1000;   // s
    loop.lastTs = ts;
    dtReal = Math.min(dtReal, 0.05);   // plafond 50 ms (évite les sauts)

    if (!sim.paused) {
        var dtSim = dtReal;   // temps réel = temps simulé (pas d'accélération)
        sim.simTime += dtSim;

        if (sim.activeTab === 'vagues') {
            // Enregistrer l'amplitude des vagues au point M (rate-limited à 30 Hz simulé)
            if (sim.simTime - lastDptUpdate >= DPT_SAMPLE_DT) {
                lastDptUpdate = sim.simTime;
                updateVaguesDataM();
            }
        } else {
            // Nettoyer les anciennes impulsions (Son)
            pruneImpulses();

            // Enregistrer ΔP(t) aux balises (rate-limited à 30 Hz simulé)
            if (sim.simTime - lastDptUpdate >= DPT_SAMPLE_DT) {
                lastDptUpdate = sim.simTime;
                updateDptData();
            }
        }
    }

    if (sim.activeTab !== 'vagues') {
        // Snapshot ΔP(x) (uniquement pour le mode Son)
        updateDpxData();
    }

    // Rendu
    drawTube();
    drawGraph();

    // Mise à jour de l'afficheur de célérité (uniquement pour Son)
    if (!sim.paused && sim.activeTab !== 'vagues') {
        _updateCReadout();
    }
}

// ── Afficheur c en temps réel ─────────────────────────────────────────

function _updateCReadout() {
    var el = document.getElementById('ro-c');
    if (el) el.textContent = sim.c_cms.toFixed(1).replace('.', ',');
}

// ══════════════════════════════════════════════════════════════════════
//  Actions source (boîtier gauche)
// ══════════════════════════════════════════════════════════════════════

// Envoi d'une impulsion (aller-retour membrane)
function sendImpulse() {
    sim.impulses.push({ startTime: sim.simTime });
    // Flash visuel sur le bouton
    var btn = document.getElementById('btn-impulse');
    if (btn) {
        btn.classList.add('impulse-flash');
        setTimeout(function() { btn.classList.remove('impulse-flash'); }, 300);
    }
}

// Bascule de la source sinusoïdale
function toggleSinusoidal() {
    var btn = document.getElementById('btn-sinus');
    var sl  = document.getElementById('sl-freq');

    if (sim.sinusoidalActive) {
        // Arrêt
        sim.sinusoidalActive = false;
        sim.sinStopTime      = sim.simTime;
        if (btn) { btn.classList.remove('active'); btn.textContent = '▶ Sinusoïdale'; }
        if (sl)  sl.disabled = true;
    } else {
        // Démarrage
        sim.sinusoidalActive = true;
        sim.sinStartTime     = sim.simTime;
        sim.sinStopTime      = -1;
        if (btn) { btn.classList.add('active'); btn.textContent = '⏹ Sinusoïdale'; }
        if (sl)  sl.disabled = false;
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Contrôles du panneau droit
// ══════════════════════════════════════════════════════════════════════

function togglePause() {
    sim.paused = !sim.paused;
    var btnSon = document.getElementById('btn-playpause');
    var btnVagues = document.getElementById('btn-playpause-vagues');
    
    [btnSon, btnVagues].forEach(function(btn) {
        if (!btn) return;
        if (sim.paused) {
            btn.textContent = '▶ Reprendre';
            btn.className   = 'btn btn-play';
        } else {
            btn.textContent = '⏸ Pause';
            btn.className   = 'btn btn-pause';
        }
    });
}

// Remise à zéro des graphes et de l'animation (conserve les paramètres)
function resetSimAnim() {
    // Arrêter la sinusoïdale
    if (sim.sinusoidalActive) {
        sim.sinusoidalActive = false;
        sim.sinStopTime      = 0;
        var btnSin = document.getElementById('btn-sinus');
        if (btnSin) { btnSin.classList.remove('active'); btnSin.textContent = '▶ Sinusoïdale'; }
        var slFreq = document.getElementById('sl-freq');
        if (slFreq) slFreq.disabled = true;
    }
    resetAnim();
    lastDptUpdate = 0;
    // Reprendre si en pause
    if (sim.paused) togglePause();
}

// ══════════════════════════════════════════════════════════════════════
//  Onglets principaux (Corde | Son | Vagues)
// ══════════════════════════════════════════════════════════════════════

function setMainTab(tab) {
    sim.activeTab = tab;
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

    // Gérer l'état du graphique
    var graphLeftBtns = document.getElementById('graph-btns-left');
    if (graphLeftBtns) {
        if (tab === 'vagues') {
            graphLeftBtns.style.display = 'none';
            sim.graphMode = 'dpt'; // Force le mode temporel pour les vagues
        } else {
            graphLeftBtns.style.display = '';
        }
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Sliders du panneau
// ══════════════════════════════════════════════════════════════════════

function onSliderFreq(v) {
    sim.freq = parseFloat(v);
    var lbl = document.getElementById('lbl-freq');
    if (lbl) lbl.textContent = sim.freq.toFixed(1).replace('.', ',');
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
    sim.selectionMode = !sim.selectionMode;
    var btn = document.getElementById('btn-select');
    if (btn) btn.classList.toggle('active', sim.selectionMode);
    if (!sim.selectionMode) clearSelection();
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
    // Sliders Son
    _setSlider('sl-freq',  sim.freq,        'lbl-freq',  1);
    _setSlider('sl-rho',   sim.rho,         'lbl-rho',   1);
    _setSlider('sl-K',     sim.K,           'lbl-K',     1);
    _setSlider('sl-atten', sim.attenuation, 'lbl-atten', 2);

    // Sliders Vagues
    _setSlider('sl-freq-vagues',  sim.vaguesFreq,        'lbl-freq-vagues',  1);
    _setSlider('sl-atten-vagues', sim.vaguesAttenuation, 'lbl-atten-vagues', 2);
    _setSlider('sl-celer-vagues', sim.vaguesCelerite,    'lbl-celer-vagues', 1);

    // Célérité
    updateCelerite();
    _updateCReadout();
    // Freq slider désactivé au départ (sinusoïdale inactive)
    var slFreq = document.getElementById('sl-freq');
    if (slFreq) slFreq.disabled = true;
    // Onglet Son actif au départ
    setMainTab('son');
}

function _setSlider(sliderId, value, lblId, decimals) {
    var sl  = document.getElementById(sliderId);
    var lbl = document.getElementById(lblId);
    if (sl)  sl.value = value;
    if (lbl) lbl.textContent = value.toFixed(decimals).replace('.', ',');
}

// ── Fonctions spécifiques à la simulation de Vagues ─────────────────────

function updateVaguesDataM() {
    var t = sim.simTime;
    var sx = sim.sourceS.x;
    var sy = sim.sourceS.y;
    var mx = sim.pointM.x;
    var my = sim.pointM.y;
    var dx = mx - sx;
    var dy = my - sy;
    var d = Math.sqrt(dx * dx + dy * dy);
    
    // Échelle physique (la largeur du tube représente 40 cm)
    var canvasW = (tubeCanvas && tubeCanvas.width > 0) ? tubeCanvas.width : 800;
    var v_px = sim.vaguesCelerite * (canvasW / 40);
    var alpha = sim.vaguesAttenuation * 0.005;
    
    var amp = 0;
    var t_ret = t - d / v_px;
    if (t_ret >= 0) {
        amp = Math.sin(2 * Math.PI * sim.vaguesFreq * t_ret) * Math.exp(-alpha * d);
    }
    
    sim.vaguesDataM.push({ t: t, dp: amp });
    if (sim.vaguesDataM.length > DP_MAX_POINTS) {
        sim.vaguesDataM.shift();
    }
}

function onSliderFreqVagues(v) {
    sim.vaguesFreq = parseFloat(v);
    var lbl = document.getElementById('lbl-freq-vagues');
    if (lbl) lbl.textContent = sim.vaguesFreq.toFixed(1).replace('.', ',');
}

function onSliderAttenVagues(v) {
    sim.vaguesAttenuation = parseFloat(v);
    var lbl = document.getElementById('lbl-atten-vagues');
    if (lbl) lbl.textContent = sim.vaguesAttenuation.toFixed(2).replace('.', ',');
}

function onSliderCelerVagues(v) {
    sim.vaguesCelerite = parseFloat(v);
    var lbl = document.getElementById('lbl-celer-vagues');
    if (lbl) lbl.textContent = sim.vaguesCelerite.toFixed(1).replace('.', ',');
}

// ── Démarrage ─────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);
