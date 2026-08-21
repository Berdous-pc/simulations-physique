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

// ── Constante de temps du lissage du piston (ms) ───────────────────────
// 110 ms reproduit le facteur 0,15 par image d'un écran 60 Hz, mais sans
// dépendre du taux de rafraîchissement (cf. loop()).
var PISTON_TAU = 110;

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
  // Constante de temps exprimée en ms, et non en « 0,15 par image » : sans
  // cela le piston se déplace ~2,4 fois plus vite sur un écran 144 Hz que
  // sur un 60 Hz. exp(-dt/TAU) donne le même mouvement à tout framerate.
  var prevPistonY = sim.pistonY;
  sim.pistonY += (sim.pistonTargetY - sim.pistonY) * (1 - Math.exp(-dtReal / PISTON_TAU));
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
  document.getElementById('it-n').textContent  = sim.n_mol.toFixed(2).replace('.', ',') + ' mol';
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
  // 1. Dimensionner le canvas et calculer la géométrie.
  //    On appelle directement _doResize() (variante synchrone de resize(),
  //    qui elle diffère d'une image) : la géométrie doit être connue AVANT
  //    initMolecules(). L'ancienne version recopiait ici les ~50 lignes de
  //    calcul de recipient.js, avec ses propres constantes de marge — les
  //    deux blocs avaient fini par diverger.
  _doResize();

  // Mise en page pas encore effectuée (conteneur de largeur nulle) :
  // réessayer à l'image suivante plutôt que de démarrer sur une boîte vide.
  if (_cw === 0 || _ch === 0) { requestAnimationFrame(init); return; }

  // 2. Initialiser les molécules (le piston est placé par _doResize())
  initMolecules();

  // 3. Calculer la pression initiale
  updatePressure();

  // 4. Synchroniser l'UI
  syncUIToSim();

  // 5. Lancer la boucle RAF
  requestAnimationFrame(loop);
}

// ── Raccourcis clavier ─────────────────────────────────────────────────
// Espace met en pause / reprend, R réinitialise — utile en projection, où
// viser un bouton du panneau à la souris depuis le fond de la classe n'est
// pas praticable.
document.addEventListener('keydown', function (e) {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  // Ne pas doubler l'activation d'un curseur ou d'un bouton qui a le focus :
  // Espace et Entrée les actionnent déjà, et les flèches déplacent les sliders.
  var tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;

  if (e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();   // sinon le navigateur tente de faire défiler
    togglePause();
  } else if (e.key === 'r' || e.key === 'R') {
    resetSim();
  }
});

// ── Démarrage ──────────────────────────────────────────────────────────
// DOMContentLoaded et non load : `load` attend TOUTES les ressources, y
// compris le script de statistiques distant. Hors ligne (usage en classe),
// la simulation restait figée jusqu'au timeout réseau.
document.addEventListener('DOMContentLoaded', init);
