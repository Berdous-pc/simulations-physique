// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  ui.js — Contrôles du panneau et boucle d'animation
//  Chargé en DERNIER. Dépend de sim.js et fil.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Horodatage de l'image précédente ───────────────────────────────────
var _lastTs = null;

// ── Rafraîchissement des afficheurs à 10 Hz ────────────────────────────
var _readoutTimer  = 0;
var READOUT_PERIOD = 100;   // ms

// ══════════════════════════════════════════════════════════════════════
//  Cache des éléments du DOM
//  La boucle et les curseurs y puisent plusieurs fois par image : autant
//  ne faire les getElementById qu'une seule fois.
// ══════════════════════════════════════════════════════════════════════

var _el = {};

var _EL_IDS = [
  'btn-circuit', 'btn-playpause', 'btn-trace', 'btn-arrows', 'btn-measures',
  'sl-U', 'sl-valence', 'sl-gene', 'sl-speed',
  'lbl-U', 'lbl-valence', 'lbl-gene', 'lbl-speed', 'hint-valence',
  'measures', 'ro-U', 'ro-I', 'ro-v', 'legend-ion',
  'panel-hint'
];

function _cacheElements() {
  for (var i = 0; i < _EL_IDS.length; i++) {
    _el[_EL_IDS[i]] = document.getElementById(_EL_IDS[i]);
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Boucle d'animation
// ══════════════════════════════════════════════════════════════════════

function loop(ts) {
  requestAnimationFrame(loop);

  if (_lastTs === null) { _lastTs = ts; return; }

  var dtReal = Math.min(ts - _lastTs, 50);   // plafonné : onglet en arrière-plan
  _lastTs = ts;

  // Le facteur de vitesse ne s'applique qu'au temps SIMULÉ. Le lissage des
  // mesures, lui, reste calé sur le temps réel : au ralenti l'affichage ne
  // se met pas à réagir au ralenti lui aussi.
  var dt = sim.paused ? 0 : dtReal * sim.speedFactor;

  if (dt > 0) {
    stepPhysics(dt);
    updateMeasures(dtReal);

    _readoutTimer += dtReal;
    if (_readoutTimer >= READOUT_PERIOD) {
      updateReadouts();
      _readoutTimer = 0;
    }
  }

  // En pause, l'image ne change que si une commande l'a modifiée.
  if (dt > 0 || sim.needsRedraw) {
    drawScene();
    sim.needsRedraw = false;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Afficheurs
// ══════════════════════════════════════════════════════════════════════

function updateReadouts() {
  // Circuit ouvert ou tension nulle : aucune force ne s'exerce sur les
  // électrons, la dérive est nulle par construction. On l'affiche donc
  // exactement, sans laisser transparaître le bruit résiduel de la mesure.
  var on = sim.circuitOn && sim.U_V !== 0;

  _el['ro-U'].textContent = sim.circuitOn ? _fmtNum(sim.U_V, 1) + ' V' : '0,0 V';

  var I = on ? sim.I_mA : 0;
  _el['ro-I'].textContent = (Math.abs(I) < 5)
    ? '≈ 0 mA'
    : _fmtNum(I, 0) + ' mA';

  var v = on ? sim.vd_mm : 0;
  if (Math.abs(v) < 0.005) {
    _el['ro-v'].textContent = '≈ 0 mm/s';
  } else {
    // Le signe est porté par une flèche, plus parlante qu'un « − » devant
    // une vitesse : les électrons remontent le courant.
    _el['ro-v'].textContent = (v < 0 ? '← ' : '→ ') + _fmtNum(Math.abs(v), 2) + ' mm/s';
  }
}

// Nombre à la française : virgule décimale et signe explicite conservé.
function _fmtNum(x, dec) {
  return x.toFixed(dec).replace('.', ',');
}

// ══════════════════════════════════════════════════════════════════════
//  Synchronisation UI ← état (init et réinitialisation)
// ══════════════════════════════════════════════════════════════════════

function syncUIToSim() {
  _el['sl-U'].value       = sim.U_V;
  _el['sl-valence'].value = sim.valence;
  _el['sl-gene'].value    = sim.geneIdx;
  _el['sl-speed'].value = SPEED_STEPS.indexOf(sim.speedFactor);

  _updateLabelU();
  _updateLabelValence();
  _updateLabelGene();
  _el['lbl-speed'].textContent = sim.speedFactor.toFixed(2).replace('.', ',');

  _updateCircuitBtn();
  _updatePlayPauseBtn();
  _updateTraceBtn();
  _updateArrowsBtn();
  _updateMeasuresBtn();
  updateReadouts();
}

function _updateLabelU() {
  _el['lbl-U'].textContent = _fmtNum(sim.U_V, 1) + ' V';
}

// L'aide sous le curseur énonce explicitement la compensation des charges :
// c'est là que se lit la neutralité du fil.
function _updateLabelValence() {
  _el['lbl-valence'].textContent = sim.valence;
  // La légende affiche la charge réelle des ions, pas un « + » générique :
  // c'est elle qui doit correspondre à ce qu'on lit dans les disques.
  _el['legend-ion'].textContent = (sim.valence > 1 ? sim.valence : '') + '+';
  _el['hint-valence'].textContent =
    sim.nSites + ' ion' + (sim.nSites > 1 ? 's' : '') + ' '
    + (sim.valence > 1 ? sim.valence : '') + '+ et '
    + sim.nElec + ' électrons libres : le fil est neutre.';
}

function _updateLabelGene() {
  _el['lbl-gene'].textContent = GENE_LABELS[sim.geneIdx];
}

function _updateCircuitBtn() {
  var b = _el['btn-circuit'];
  if (sim.circuitOn) {
    b.textContent = 'Ouvrir le circuit';
    b.className   = 'btn btn-pause';
  } else {
    b.textContent = 'Fermer le circuit';
    b.className   = 'btn btn-green';
  }
}

function _updatePlayPauseBtn() {
  var b = _el['btn-playpause'];
  if (sim.paused) {
    b.textContent = '▶ Reprendre';
    b.className   = 'btn btn-play';
  } else {
    b.textContent = '⏸ Pause';
    b.className   = 'btn btn-pause';
  }
}

function _updateTraceBtn() {
  var b = _el['btn-trace'];
  var on = (sim.tracedIdx >= 0);
  b.textContent = on ? 'Ne plus suivre' : 'Suivre un électron';
  b.classList.toggle('active', on);
}

function _updateArrowsBtn() {
  var b = _el['btn-arrows'];
  b.textContent = sim.showArrows ? 'Masquer les flèches' : 'Afficher les flèches';
  b.classList.toggle('active', sim.showArrows);
}

function _updateMeasuresBtn() {
  var b = _el['btn-measures'];
  b.textContent = sim.showMeasures ? 'Masquer les mesures' : 'Afficher les mesures';
  b.classList.toggle('active', !sim.showMeasures);
  _el['measures'].classList.toggle('hidden', !sim.showMeasures);
}

// ══════════════════════════════════════════════════════════════════════
//  Gestionnaires de commandes (appelés depuis index.html)
// ══════════════════════════════════════════════════════════════════════

// ── Interrupteur du circuit ──
function toggleCircuit() {
  sim.circuitOn = !sim.circuitOn;
  sim.snapMeasure = true;
  _updateCircuitBtn();
  updateReadouts();
  sim.needsRedraw = true;
}

// ── Tension imposée ──
function onSliderU(val) {
  sim.U_V = parseFloat(val);
  sim.snapMeasure = true;
  _updateLabelU();
  updateReadouts();
  sim.needsRedraw = true;
}

// ── Valence : électrons libérés par atome ──
function onSliderValence(val) {
  sim.valence = parseInt(val, 10);
  sim.nElec   = sim.valence * sim.nSites;
  syncElectronCount();
  sim.snapMeasure = true;
  _updateLabelValence();
  updateReadouts();
  sim.needsRedraw = true;
}

// ── Gêne au déplacement (encombrement des ions du réseau) ──
function onSliderGene(val) {
  sim.geneIdx = parseInt(val, 10);
  sim.snapMeasure = true;
  _updateLabelGene();
  updateGeometry();
  sim.needsRedraw = true;
}

// ── Vitesse d'animation ──
function onSliderSpeed(val) {
  sim.speedFactor = SPEED_STEPS[parseInt(val, 10)];
  _el['lbl-speed'].textContent = sim.speedFactor.toFixed(2).replace('.', ',');
}

// ── Pause ──
function togglePause() {
  sim.paused = !sim.paused;
  _updatePlayPauseBtn();
}

// ── Suivi d'un électron ──
function toggleTrace() {
  if (sim.tracedIdx >= 0) clearTrace();
  else                    traceCentralElectron();
  _updateTraceBtn();
  sim.needsRedraw = true;
}

// ── Flèches de vitesse ──
// Une flèche par électron, orientée selon sa vitesse instantanée.
function toggleArrows() {
  sim.showArrows = !sim.showArrows;
  _updateArrowsBtn();
  sim.needsRedraw = true;
}

// ── Affichage des mesures ──
// Masque à la fois les afficheurs du panneau et les valeurs chiffrées
// portées par le schéma : en projection pour une classe de Seconde, la
// page doit pouvoir rester entièrement qualitative.
function toggleMeasures() {
  sim.showMeasures = !sim.showMeasures;
  _updateMeasuresBtn();
  sim.needsRedraw = true;
}

// ── Bandeau d'informations ──
function toggleHint() {
  var hint = _el['panel-hint'];
  if (hint) hint.classList.toggle('collapsed');
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation
// ══════════════════════════════════════════════════════════════════════

function init() {
  _cacheElements();

  // La géométrie doit être connue avant toute chose : _doResize() la
  // calcule ET crée les électrons au premier appel.
  _doResize();
  if (_cw === 0 || _ch === 0) { requestAnimationFrame(init); return; }

  syncUIToSim();
  requestAnimationFrame(loop);
}

window.addEventListener('resize', resize);

// ── Raccourcis clavier ─────────────────────────────────────────────────
// Utiles en projection : viser un bouton du panneau à la souris depuis le
// fond de la classe n'est pas praticable.
document.addEventListener('keydown', function (e) {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  // Ne pas doubler l'action d'un curseur ou d'un bouton qui a le focus.
  var tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;

  if (e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();          // sinon le navigateur tente de faire défiler
    togglePause();
  } else if (e.key === 'r' || e.key === 'R') {
    resetSim();
  } else if (e.key === 'g' || e.key === 'G') {
    toggleCircuit();
  } else if (e.key === 'e' || e.key === 'E') {
    toggleTrace();
  } else if (e.key === 'f' || e.key === 'F') {
    toggleArrows();
  }
});

// ── Démarrage ──────────────────────────────────────────────────────────
// DOMContentLoaded et non load : `load` attend toutes les ressources, y
// compris le script de statistiques distant. Hors ligne (usage en classe),
// la simulation resterait figée jusqu'au délai d'expiration réseau.
document.addEventListener('DOMContentLoaded', init);
