// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  ui.js — Contrôles UI et boucle d'animation
//  Chargé en DERNIER. Dépend de sim.js et recipient.js.
//  Orchestre la boucle RAF, les événements des sliders/boutons,
//  la mise à jour des readouts, et l'initialisation générale.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Horodatage de la frame précédente ─────────────────────────────────
var _lastTs = null;

// ── Compteur pour les mises à jour à 10 Hz ────────────────────────────
var _readoutTimer  = 0;   // ms cumulés depuis la dernière mise à jour readout
var _rateTimer     = 0;   // ms cumulés depuis la dernière mise à jour wallRate
var READOUT_PERIOD = 100; // ms (10 Hz)
var RATE_PERIOD    = 100; // ms (10 Hz)

// ══════════════════════════════════════════════════════════════════════
//  Boucle d'animation (RAF)
// ══════════════════════════════════════════════════════════════════════

// ── Bandeau instructions ───────────────────────────────────────────────
function toggleHint() {
  var hint = document.getElementById('panel-hint');
  if (hint) hint.classList.toggle('collapsed');
}

function loop(ts) {
  requestAnimationFrame(loop);

  if (_lastTs === null) { _lastTs = ts; return; }

  var dtReal = Math.min(ts - _lastTs, 50);  // plafonné à 50 ms
  _lastTs = ts;

  var dt = sim.paused ? 0 : dtReal;

  // ── Intégration physique ──
  if (dt > 0) {
    stepPhysics(dt);
  }

  // ── Lissage du piston ──
  var prevPistonY = sim.pistonY;
  sim.pistonY += (sim.pistonTargetY - sim.pistonY) * 0.15;
  // Si le piston a bougé, repousser les molécules en dehors
  if (Math.abs(sim.pistonY - prevPistonY) > 0.1) {
    pushMoleculesDownFromPiston();
  }

  // ── Taux de chocs et readouts (10 Hz) ──
  if (dt > 0) {
    _rateTimer    += dtReal;
    _readoutTimer += dtReal;

    if (_rateTimer >= RATE_PERIOD) {
      updateWallRates();
      _rateTimer = 0;
    }

    if (_readoutTimer >= READOUT_PERIOD) {
      updateReadouts();
      _readoutTimer = 0;
    }
  }

  // ── Rendu ──
  drawScene();
}

// ══════════════════════════════════════════════════════════════════════
//  Mise à jour des readouts
// ══════════════════════════════════════════════════════════════════════

function updateReadouts() {
  updatePressure();

  document.getElementById('it-T').textContent  = sim.T_K + ' K';
  document.getElementById('it-n').textContent  = sim.n_mol.toFixed(3).replace('.', ',') + ' mol';
  document.getElementById('it-V').textContent  = _fmtVolume(sim.V_L);

  var top  = Math.round(sim.wallRate.top);
  var bot  = Math.round(sim.wallRate.bottom);
  var lft  = Math.round(sim.wallRate.left);
  var rgt  = Math.round(sim.wallRate.right);
  var mean = ((sim.wallRate.top + sim.wallRate.bottom + sim.wallRate.left + sim.wallRate.right) / 4).toFixed(1).replace('.', ',');

  document.getElementById('it-top').textContent  = top  + ' /s';
  document.getElementById('it-bot').textContent  = bot  + ' /s';
  document.getElementById('it-lft').textContent  = lft  + ' /s';
  document.getElementById('it-rgt').textContent  = rgt  + ' /s';
  document.getElementById('it-mean').textContent = mean + ' /s';
}

// ── Formatage du volume en m³ avec notation scientifique ──
function _fmtVolume(V_L) {
  var V_m3 = V_L * 1e-3;
  var exp  = Math.floor(Math.log10(V_m3));
  var mant = V_m3 / Math.pow(10, exp);
  var supDigits = ['\u2070','\u00b9','\u00b2','\u00b3','\u2074','\u2075','\u2076','\u2077','\u2078','\u2079'];
  var expStr = String(Math.abs(exp)).split('').map(function(c){ return supDigits[+c]; }).join('');
  var sign   = exp < 0 ? '\u207b' : '';
  return mant.toFixed(2).replace('.', ',') + '\u00d710' + sign + expStr + ' m\u00b3';
}

// ══════════════════════════════════════════════════════════════════════
//  Synchronisation UI → état sim (utilisé à l'init et au reset)
// ══════════════════════════════════════════════════════════════════════

function syncUIToSim() {
  // Sliders
  document.getElementById('sl-T').value = sim.T_K;
  document.getElementById('sl-n').value = sim.Nmol;
  document.getElementById('sl-V').value = Math.round(sim.V_L * 10);

  // Labels
  document.getElementById('lbl-T').textContent = sim.T_K;
  _updateLabelN(sim.Nmol);
  _updateLabelV(Math.round(sim.V_L * 10));

  // Slider pesanteur
  document.getElementById('sl-gravity').value = 0;
  document.getElementById('lbl-gravity').textContent = '0 g';

  // Bouton Play/Pause
  _updatePlayPauseBtn();

  // Pression
  updatePressure();
}

function _updateLabelN(Nmol) {
  var n_mol = Nmol / N_SCALE;
  document.getElementById('lbl-n').textContent = n_mol.toFixed(2).replace('.', ',');
  document.getElementById('lbl-n-molecules').innerHTML =
    '\u2248 ' + Nmol + ' mol\u00e9cules \u00e0 l\u2019\u00e9cran'
    + ' <span class="input-hint-sub">(100 mol\u00e9cules dessin\u00e9es pour 0,10&nbsp;mol)</span>';
}

function _updateLabelV(sliderVal) {
  var V_L = sliderVal / 10;
  document.getElementById('lbl-V').textContent = V_L.toFixed(1).replace('.', ',');
}

function _updatePlayPauseBtn() {
  var btn = document.getElementById('btn-playpause');
  if (sim.paused) {
    btn.textContent = '▶ Reprendre';
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

// ── Slider Température ──
function onSliderT(val) {
  var T_new = parseInt(val, 10);
  document.getElementById('lbl-T').textContent = T_new;
  setTemperature(T_new);
  updatePressure();
  updateReadouts();
}

// ── Slider Quantité de matière ──
function onSliderN(val) {
  var Nmol = parseInt(val, 10);
  _updateLabelN(Nmol);
  sim.n_mol = Nmol / N_SCALE;
  setMoleculeCount(Nmol);
  updatePressure();
  updateReadouts();
}

// ── Slider Volume ──
// Le slider va de 10 (= 1,0 L) à 100 (= 10,0 L), pas 5
function onSliderV(val) {
  var sliderVal = parseInt(val, 10);
  _updateLabelV(sliderVal);
  var V_L = sliderVal / 10;
  sim.n_mol = sim.Nmol / N_SCALE;  // cohérence
  setVolume(V_L);
  updatePressure();
  updateReadouts();
}


// ── Toggle pesanteur ──
var GRAVITY_STEPS = [0, 0.5, 1, 2, 3];
var GRAVITY_LABELS = ['0', '0,5', '1', '2', '3'];

function onSliderGravity(val) {
  var idx = parseInt(val);
  sim.gravityFactor = GRAVITY_STEPS[idx];
  document.getElementById('lbl-gravity').textContent = GRAVITY_LABELS[idx] + ' g';
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation
// ══════════════════════════════════════════════════════════════════════

function init() {
  // 1. Dimensionner le canvas (synchrone — besoin de la géométrie pour init molécules)
  var area = canvas.parentElement;
  _cw = area.clientWidth;
  _ch = area.clientHeight;
  canvas.width  = _cw;
  canvas.height = _ch;

  // Recalculer géométrie — doit rester synchronisée avec _doResize() de recipient.js
  var MARGIN_TOP_L    = 60;
  var MARGIN_BOTTOM_L = 40;
  var MARGIN_LEFT_L   = 60;
  var MARGIN_RIGHT_L  = 60;
  var WALL_THICK_L    = 6;

  var availW = _cw - MARGIN_LEFT_L - MARGIN_RIGHT_L;
  var availH = _ch - MARGIN_TOP_L  - MARGIN_BOTTOM_L;
  var side   = Math.max(40, Math.min(availW, availH));
  var cx     = MARGIN_LEFT_L + availW / 2;
  var cy     = MARGIN_TOP_L  + availH / 2;

  var rx1 = cx - side / 2;
  var rx2 = cx + side / 2;
  var ry1 = cy - side / 2;
  var ry2 = cy + side / 2;

  sim.boxLeft   = rx1 + WALL_THICK_L;
  sim.boxRight  = rx2 - WALL_THICK_L;
  sim.boxTop    = ry1 + WALL_THICK_L;
  sim.boxBottom = ry2 - WALL_THICK_L;
  sim._rx1 = rx1; sim._rx2 = rx2;
  sim._ry1 = ry1; sim._ry2 = ry2;

  var totalH = sim.boxBottom - sim.boxTop;
  sim.boxTopMax = sim.boxTop;
  sim.boxTopMin = sim.boxBottom - totalH / 10;

  var innerW = sim.boxRight - sim.boxLeft;
  MOL_RADIUS = Math.max(1, Math.round(innerW * MOL_RADIUS_FRAC));
  V0_PX      = innerW * 0.18;
  G_PX       = V0_PX * G_FRAC;

  // 2. Position initiale du piston
  var frac = (sim.V_L - 1.0) / (10.0 - 1.0);
  sim.pistonTargetY = sim.boxTopMin + frac * (sim.boxTopMax - sim.boxTopMin);
  sim.pistonY       = sim.pistonTargetY;

  // 3. Initialiser les molécules
  initMolecules();

  // 4. Calculer la pression initiale
  updatePressure();

  // 5. Synchroniser l'UI
  syncUIToSim();

  // 6. Lancer la boucle RAF
  requestAnimationFrame(loop);
}

// ── Démarrage au chargement de la page ────────────────────────────────
window.addEventListener('load', init);
