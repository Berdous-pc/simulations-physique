// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  ui.js — Contrôles UI et boucle d'animation
//  Chargé en DERNIER. Dépend de sim.js, recipient.js et graph.js.
//  Orchestre la boucle RAF, les événements des sliders/boutons,
//  la mise à jour des readouts, et l'initialisation générale.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Horodatage de la frame précédente ─────────────────────────────────
var _lastTs = null;

// ── Cadence de rafraîchissement des afficheurs du panneau ──────────────
var _readoutTimer  = 0;    // ms cumulés depuis la dernière mise à jour
var READOUT_PERIOD = 100;  // ms (10 Hz)

// ── Crans du slider "Vitesse d'animation" ──────────────────────────────
var SPEED_STEPS  = [0.10, 0.50, 1.00, 2.00];
var SPEED_LABELS = ['0,10', '0,50', '1,00', '2,00'];

// ══════════════════════════════════════════════════════════════════════
//  Boucle d'animation (RAF)
// ══════════════════════════════════════════════════════════════════════

function toggleHint() {
  var hint = document.getElementById('panel-hint');
  if (hint) hint.classList.toggle('collapsed');
}

function loop(ts) {
  requestAnimationFrame(loop);

  if (_lastTs === null) { _lastTs = ts; return; }

  var dtReal = Math.min(ts - _lastTs, 50);  // plafonné à 50 ms
  _lastTs = ts;

  var dt = sim.paused ? 0 : dtReal * sim.speedFactor;

  if (dt > 0) {
    stepPhysics(dt);

    // Readouts à ~10 Hz : 4 écritures DOM par frame ne servent à rien et
    // forcent le navigateur à recalculer la mise en page du panneau.
    _readoutTimer += dtReal;
    if (_readoutTimer >= READOUT_PERIOD) {
      _readoutTimer = 0;
      updateReadouts();
    }
  }

  drawScene();

  // Le graphe ne change qu'à chaque nouveau point d'historique (5 fois par
  // seconde de temps simulé) : inutile de le redessiner à 60 fps.
  if (sim.historyDirty) {
    sim.historyDirty = false;
    drawChart();
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Mise à jour des readouts
// ══════════════════════════════════════════════════════════════════════

function updateReadouts() {
  var c = countSpecies();
  document.getElementById('ro-A').textContent = c.A;
  document.getElementById('ro-B').textContent = c.B;
  document.getElementById('ro-C').textContent = c.C;
  document.getElementById('ro-D').textContent = c.D;
}

// ══════════════════════════════════════════════════════════════════════
//  Synchronisation UI → état sim (utilisé à l'init et au reset)
// ══════════════════════════════════════════════════════════════════════

function syncUIToSim() {
  document.getElementById('sl-T').value = sim.T_C;
  document.getElementById('lbl-T').textContent = sim.T_C;

  document.getElementById('sl-NA').value = sim.N0_A;
  document.getElementById('lbl-NA').textContent = sim.N0_A;

  document.getElementById('sl-NB').value = sim.N0_B;
  document.getElementById('lbl-NB').textContent = sim.N0_B;

  _updatePlayPauseBtn();
  updateReadouts();
}

function _updatePlayPauseBtn() {
  var btn = document.getElementById('btn-playpause');
  if (sim.paused) {
    btn.textContent = '▶ Lancer';
    btn.className   = 'btn btn-play';
  } else {
    btn.textContent = '⏸ Pause';
    btn.className   = 'btn btn-pause';
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Gestionnaires des contrôles (appelés depuis index.html)
// ══════════════════════════════════════════════════════════════════════

// ── Play / Pause ──
function togglePause() {
  sim.paused = !sim.paused;
  _updatePlayPauseBtn();
}

// ── Slider Vitesse d'animation ──
function onSliderSpeed(val) {
  var idx = parseInt(val, 10);
  sim.speedFactor = SPEED_STEPS[idx];
  document.getElementById('lbl-speed').textContent = SPEED_LABELS[idx];
}

// ── Slider Température ──
function onSliderT(val) {
  var T_C_new = parseInt(val, 10);
  document.getElementById('lbl-T').textContent = T_C_new;
  setTemperature(T_C_new);
}

// ── Slider Nombre de molécules A ──
function onSliderNA(val) {
  var n = parseInt(val, 10);
  document.getElementById('lbl-NA').textContent = n;
  setSpeciesCount('A', n);
}

// ── Slider Nombre de molécules B ──
function onSliderNB(val) {
  var n = parseInt(val, 10);
  document.getElementById('lbl-NB').textContent = n;
  setSpeciesCount('B', n);
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation
// ══════════════════════════════════════════════════════════════════════

function init() {
  // 1. Dimensionner le canvas récipient (synchrone — besoin de la géométrie
  //    pour placer les molécules avant le premier rendu)
  var area = canvas.parentElement;
  _cw = area.clientWidth;
  _ch = area.clientHeight;
  var dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(_cw * dpr);
  canvas.height = Math.round(_ch * dpr);
  canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);

  // Géométrie — doit rester synchronisée avec _doResize() de recipient.js
  var rx1 = MARGIN, rx2 = _cw - MARGIN;
  var ry1 = MARGIN, ry2 = _ch - MARGIN;
  sim._rx1 = rx1; sim._rx2 = rx2;
  sim._ry1 = ry1; sim._ry2 = ry2;
  sim.boxLeft   = rx1 + WALL_THICK;
  sim.boxRight  = rx2 - WALL_THICK;
  sim.boxTop    = ry1 + WALL_THICK;
  sim.boxBottom = ry2 - WALL_THICK;

  var innerW = sim.boxRight - sim.boxLeft;
  MOL_RADIUS = Math.max(1, Math.round(innerW * MOL_RADIUS_FRAC));
  V0_PX      = innerW * 0.16;

  // 2. Initialiser les molécules (50 A + 50 B par défaut)
  initMolecules();

  // 3. Préparer le graphe (légende + premier redimensionnement)
  buildChartLegend();
  resizeChart();

  // 3 bis. Couleurs des pastilles du readout et des lettres de l'équation,
  // toutes deux posées depuis SPECIES_COLORS (source unique)
  ['A', 'B', 'C', 'D'].forEach(function (k) {
    var ro = document.getElementById('ro-lbl-' + k);
    if (ro) ro.style.color = SPECIES_COLORS[k].fill;
    var eq = document.getElementById('eq-' + k);
    if (eq) eq.style.color = SPECIES_COLORS[k].fill;
  });

  // 4. Synchroniser l'UI
  syncUIToSim();

  // 5. Lancer la boucle RAF
  requestAnimationFrame(loop);
}

// ── Démarrage au chargement de la page ────────────────────────────────
window.addEventListener('load', init);
