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
  'tf-it-t', 'tf-it-P', 'tf-it-T', 'tf-it-V', 'tf-it-Pext', 'tf-it-etat',
  'tf-btn-playpause', 'tf-sl-vitesse', 'tf-lbl-vitesse', 'tf-vitesse-limite',
  'tf-sel-masse', 'tf-btn-masse', 'tf-btn-loquet',
  'tf-sl-isolation', 'tf-lbl-isolation',
  'tf-sl-son', 'tf-lbl-son', 'tf-ro-traversee', 'tf-ro-piston'
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

// Hors équilibre, P et T du gaz ne sont pas définies : « ? », suivi de
// l'intervalle couvert par les tranches. Afficher la moyenne laisserait
// croire qu'elle a un sens.
function tfMajAfficheurs() {
  var m = tfMesures();
  _tfEl['tf-it-t'].textContent    = _tfFmtTemps(tf.t);
  _tfEl['tf-it-P'].innerHTML      = m.Pdef ? _tfFmtPression(m.Pmoy)
    : _tfNonDefini(_tfFmt(m.Pmin / 1000, 2) + ' à ' + _tfFmtPression(m.Pmax));
  _tfEl['tf-it-T'].innerHTML      = m.Tdef ? _tfFmt(m.Tmoy, 1) + ' K'
    : _tfNonDefini(_tfFmt(m.Tmin, 1) + ' à ' + _tfFmt(m.Tmax, 1) + ' K');
  _tfEl['tf-it-V'].textContent    = _tfFmt(m.V * 1000, 3) + ' L';
  _tfEl['tf-it-Pext'].textContent = _tfFmtPression(m.Pext);

  var etat = _tfEl['tf-it-etat'];
  etat.textContent = m.equilibre ? 'À l’équilibre' : 'Hors équilibre';
  etat.className = 'it-val ' + (m.equilibre ? 'tf-etat-eq' : 'tf-etat-hors');

  _tfEl['tf-vitesse-limite'].style.display = tf.limite ? '' : 'none';

  var d = tfDurees();
  _tfEl['tf-ro-traversee'].textContent = _tfFmtDuree(d.traversee);
  _tfEl['tf-ro-piston'].textContent    = _tfFmtDuree(d.piston);
}

// Durée à deux ou trois chiffres significatifs, en ms ou en s
function _tfFmtDuree(t) {
  if (t < 0.01) return _tfFmt(t * 1000, 1) + ' ms';
  if (t < 1)    return Math.round(t * 1000) + ' ms';
  return _tfFmt(t, 2) + ' s';
}

function _tfNonDefini(plage) {
  return '<span class="tf-nd">?</span> <span class="tf-plage">(' + plage + ')</span>';
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
  tfMolInit();
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

// ── Section Affichage ──
function tfOnAffichage(cle, coche) {
  tfAff[cle] = coche;
  // Le profil de pression prend de la place à droite du cylindre
  if (cle === 'profil') _tfDoResize();
  tf.needsRedraw = true;
}

// ── Vitesse du son (réinitialise l'expérience) ──
function tfOnRalentiSon(val) {
  var r = TF_RALENTIS[parseInt(val, 10)];
  _tfEl['tf-lbl-son'].textContent = r === 1 ? 'réelle' : r + ' fois plus lente';
  tfSetRalentiSon(r);
  tfMolInit();
  _tfMajBoutons();
  tfMajAfficheurs();
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

  if (!tf.paused) {
    tfAvancer(dtReel / 1000 * tf.vitesse);
    // Agitation des molécules en temps d'affichage, freinée au ralenti
    // (racine cubique du cran : à ×1/5000 elles dérivent lentement, sans se
    // figer) et jamais accélérée au-delà de ×1, où elle deviendrait illisible.
    if (tfAff.molecules) {
      var f = Math.pow(Math.min(1, tf.vitesse), 1 / 3);
      tfMolAvancer(dtReel / 1000 * f, tfLargeurDessinee(), tfRayonMolecule() / (_tfX2 - _tfX1));
    }
  }

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
  for (var cle in tfAff) {
    document.getElementById('tf-ck-' + cle).checked = tfAff[cle];
  }
  _tfEl['tf-sl-son'].value = TF_RALENTIS.indexOf(tf.ralentiSon);
  _tfEl['tf-lbl-son'].textContent = 'réelle';

  tfReset();
  tfMolInit();
  _tfDoResize();
  _tfMajBoutons();
  tfMajAfficheurs();
  requestAnimationFrame(_tfLoop);
}
