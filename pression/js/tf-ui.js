// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  tf-ui.js — Onglet Transformations : commandes du panneau et boucle
//  Chargé après tf-sim.js et tf-scene.js, avant ui.js (qui gère les
//  onglets et appelle tfInit()).
// ══════════════════════════════════════════════════════════════════════

'use strict';

var _tfEl = {};
var _TF_EL_IDS = [
  'tf-it-t', 'tf-it-P', 'tf-it-T', 'tf-it-V', 'tf-it-Pext',
  'tf-btn-playpause', 'tf-sl-vitesse', 'tf-lbl-vitesse', 'tf-vitesse-limite',
  'tf-sel-masse', 'tf-btn-masse', 'tf-btn-loquet',
  'tf-sl-isolation', 'tf-lbl-isolation'
];

// ══════════════════════════════════════════════════════════════════════
//  Formatage (virgule décimale)
// ══════════════════════════════════════════════════════════════════════

function _tfFmt(x, d) { return x.toFixed(d).replace('.', ','); }

// Temps : en ms aux crans de ralenti extrême, où l'on suit des
// phénomènes de l'ordre de la milliseconde ; en s sinon.
function _tfFmtTemps(t) {
  if (tf.vitesse < 0.01) return _tfFmt(t * 1000, 3) + ' ms';
  if (tf.vitesse < 0.1)  return _tfFmt(t * 1000, 1) + ' ms';
  return _tfFmt(t, 2) + ' s';
}

function _tfFmtPression(P) { return _tfFmt(P / 1000, 2) + ' kPa'; }

// Libellé d'un cran de vitesse : ×1/5000, ×0,1, ×20…
function _tfLibelleVitesse(v) {
  if (v < 0.1) return '1/' + Math.round(1 / v);
  return String(v).replace('.', ',');
}

// ══════════════════════════════════════════════════════════════════════
//  Afficheurs
// ══════════════════════════════════════════════════════════════════════

var _tfAffTimer = 0;
var TF_AFF_PERIODE = 100;   // ms réelles (10 Hz)

function tfMajAfficheurs() {
  var m = tfMesures();
  _tfEl['tf-it-t'].textContent    = _tfFmtTemps(tf.t);
  _tfEl['tf-it-P'].textContent    = _tfFmtPression(m.Pmoy);
  _tfEl['tf-it-T'].textContent    = _tfFmt(m.Tmoy, 1) + ' K';
  _tfEl['tf-it-V'].textContent    = _tfFmt(m.V * 1000, 3) + ' L';
  _tfEl['tf-it-Pext'].textContent = _tfFmtPression(m.Pext);
  _tfEl['tf-vitesse-limite'].style.display = tf.limite ? '' : 'none';
}

// ── État des boutons ──
function _tfMajBoutons() {
  var bp = _tfEl['tf-btn-playpause'];
  if (tf.paused) { bp.textContent = '▶ Reprendre'; bp.className = 'btn btn-play'; }
  else           { bp.textContent = '⏸ Pause';     bp.className = 'btn btn-pause'; }

  var bm = _tfEl['tf-btn-masse'];
  bm.textContent = tf.masse > 0 ? 'Retirer la masse' : 'Poser la masse';
  _tfEl['tf-sel-masse'].disabled = tf.masse > 0;

  var bl = _tfEl['tf-btn-loquet'];
  bl.textContent = tf.loquet ? '🔒 Loquet verrouillé' : '🔓 Loquet libéré';
  bl.classList.toggle('active', tf.loquet);
}

// ══════════════════════════════════════════════════════════════════════
//  Gestionnaires (appelés depuis index.html)
// ══════════════════════════════════════════════════════════════════════

function tfBasculerPause() {
  tf.paused = !tf.paused;
  _tfMajBoutons();
}

function tfReinitialiser() {
  tfReset();
  _tfMajBoutons();
  tfMajAfficheurs();
}

function tfOnVitesse(val) {
  tf.vitesse = TF_VITESSES[parseInt(val, 10)];
  _tfEl['tf-lbl-vitesse'].textContent = _tfLibelleVitesse(tf.vitesse);
  tfMajAfficheurs();
}

function tfOnMasse(val) {
  tf.masseChoisie = parseInt(val, 10);
}

function tfBasculerMasse() {
  tfSetMasse(tf.masse > 0 ? 0 : tf.masseChoisie);
  _tfMajBoutons();
  tfMajAfficheurs();
}

function tfBasculerLoquet() {
  tfSetLoquet(!tf.loquet);
  _tfMajBoutons();
}

function tfOnIsolation(val) {
  var idx = parseInt(val, 10);
  tfSetIsolation(TF_ISOLATIONS[idx]);
  var G = TF_ISOLATIONS[idx];
  _tfEl['tf-lbl-isolation'].textContent =
    idx === 0 ? 'calorifugé'
    : idx === TF_ISOLATIONS.length - 1 ? 'diathermane'
    : 'G = ' + String(G).replace('.', ',') + ' W/K';
}

// ══════════════════════════════════════════════════════════════════════
//  Boucle d'animation
//  Ne calcule que si l'onglet est affiché (ongletPrincipal, défini par
//  ui.js) : l'autre onglet garde son état figé.
// ══════════════════════════════════════════════════════════════════════

var _tfLastTs = null;

function _tfLoop(ts) {
  requestAnimationFrame(_tfLoop);
  if (ongletPrincipal !== 'transformations') { _tfLastTs = null; return; }
  if (_tfLastTs === null) { _tfLastTs = ts; return; }

  var dtReel = Math.min(ts - _tfLastTs, 50);   // ms, plafonné
  _tfLastTs = ts;

  if (!tf.paused) tfAvancer(dtReel / 1000 * tf.vitesse);

  _tfAffTimer += dtReel;
  if (_tfAffTimer >= TF_AFF_PERIODE) {
    _tfAffTimer = 0;
    tfMajAfficheurs();
  }

  if (tf.needsRedraw) {
    tfDessiner();
    tf.needsRedraw = false;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation (appelée par ui.js)
// ══════════════════════════════════════════════════════════════════════

function tfInit() {
  for (var i = 0; i < _TF_EL_IDS.length; i++) {
    _tfEl[_TF_EL_IDS[i]] = document.getElementById(_TF_EL_IDS[i]);
  }
  // Réglages initiaux du panneau (un rechargement peut avoir conservé
  // d'anciennes positions des curseurs)
  _tfEl['tf-sl-vitesse'].value = TF_VITESSES.indexOf(1);
  tfOnVitesse(_tfEl['tf-sl-vitesse'].value);
  _tfEl['tf-sel-masse'].value = String(tf.masseChoisie);
  _tfEl['tf-sl-isolation'].value = 0;
  tfOnIsolation(0);

  tfReset();
  _tfDoResize();
  _tfMajBoutons();
  tfMajAfficheurs();
  requestAnimationFrame(_tfLoop);
}
