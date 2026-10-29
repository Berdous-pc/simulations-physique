// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  tf-ui.js — Onglet Transformations : commandes du panneau et boucle
//  Chargé après tf-sim.js, tf-scene.js et tf-graph.js, avant ui.js (qui gère les
//  onglets et appelle tfInit()).
// ══════════════════════════════════════════════════════════════════════

'use strict';

var _tfEl = {};
var _TF_EL_IDS = [
  'tf-it-t', 'tf-it-P', 'tf-it-T', 'tf-it-V', 'tf-it-Pext', 'tf-it-Pext-lbl', 'tf-it-etat',
  'tf-btn-playpause', 'tf-sl-vitesse', 'tf-lbl-vitesse', 'tf-vitesse-limite',
  'tf-tab-pression', 'tf-tab-volume', 'tf-bloc-pression', 'tf-bloc-volume',
  'tf-sel-masse', 'tf-btn-masse', 'tf-btn-loquet',
  'tf-sl-visee', 'tf-lbl-visee', 'tf-sl-duree', 'tf-lbl-duree',
  'tf-ro-traversee', 'tf-ro-thermique', 'tf-ro-regime', 'tf-ro-travail',
  'tf-btn-lancer', 'tf-btn-retour', 'tf-duree-allongee',
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
  // Volume imposé : pas de pression extérieure qui fixe l'équilibre ; le
  // vérin mesure la pression du gaz sur le piston
  var volume = tf.famille === 'volume';
  _tfEl['tf-it-Pext-lbl'].textContent = volume ? 'Pression sur le piston' : 'Pression extérieure';
  _tfEl['tf-it-Pext'].textContent = _tfFmtPression(volume ? m.Pface : m.Pext);

  var etat = _tfEl['tf-it-etat'];
  etat.textContent = m.equilibre ? 'À l’équilibre' : 'Hors équilibre';
  etat.className = 'it-val ' + (m.equilibre ? 'tf-etat-eq' : 'tf-etat-hors');

  _tfEl['tf-vitesse-limite'].style.display = tf.limite ? '' : 'none';

  _tfMajConsignes();

  if (volume) {
    var d = tfDurees();
    _tfEl['tf-ro-traversee'].textContent = _tfFmtDuree(d.traversee);
    _tfEl['tf-ro-thermique'].textContent = isFinite(d.thermique)
      ? _tfFmtDuree(d.thermique) : 'aucune (calorifugé)';
    _tfEl['tf-ro-regime'].textContent  = _tfRegime(d, _tfTauProchain());
    _tfEl['tf-ro-travail'].textContent = _tfFmt(tf.Wop, 2) + ' J';
    _tfMajBoutonsVerin();
    _tfMajDureeAllongee();
  }
}

// Durée du mouvement en cours, ou de celui que lancerait le bouton Lancer
// (durée choisie, allongée si la course l'exige : tfTauEffectif)
function _tfTauProchain() {
  return tf.verin.actif ? tf.verin.tau : tfTauEffectif(tf.z[TF_N], tf.hVisee);
}

// Signale une durée allongée pour que le piston reste sous TF_V_VERIN_MAX
function _tfMajDureeAllongee() {
  var el = _tfEl['tf-duree-allongee'];
  var tau = tfTauEffectif(tf.z[TF_N], tf.hVisee);
  if (tau > tf.tau * 1.0001) {
    el.textContent = 'Course trop longue pour cette durée : portée à ' + _tfFmtDuree(tau)
                   + ' (piston limité à ' + TF_V_VERIN_MAX + ' m/s)';
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}

// Régime attendu pour la durée tau (PLAN §2.7) : comparée à la traversée
// du gaz par le son (mécanique), puis à la mise en équilibre thermique avec
// l'extérieur
function _tfRegime(d, tau) {
  // Vitesse de pointe du piston plus grande que la célérité du son : choc
  var v = 2 * Math.abs(tf.hVisee - tf.z[TF_N]) / tau;
  if (!tf.verin.actif && v > d.c) return 'Brutale : piston plus rapide que le son, onde de choc';
  if (tau < 5 * d.traversee)  return 'Brutale : un front traverse le gaz';
  if (!isFinite(d.thermique)) return 'Quasi statique et réversible (adiabatique)';
  // Seuil large : à 4·τ_th (60 s diathermane), l'entropie créée vaut encore
  // le tiers de celle d'une compression rapide
  if (tau < 10 * d.thermique) return 'Quasi statique mais irréversible : échanges thermiques avec un gaz non uniforme en température';
  return 'Quasi statique et presque réversible (presque isotherme)';
}

// Libellé d'une durée τ : 0,5 ms, 2 ms, 500 ms, 1 s, 60 s
function _tfLibelleDuree(t) {
  if (t < 0.001) return _tfFmt(t * 1000, 1) + ' ms';
  return t < 1 ? Math.round(t * 1000) + ' ms' : String(t) + ' s';
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

  var volume = tf.famille === 'volume';
  _tfEl['tf-tab-pression'].classList.toggle('active', !volume);
  _tfEl['tf-tab-volume'].classList.toggle('active', volume);
  _tfEl['tf-bloc-pression'].style.display = volume ? 'none' : '';
  _tfEl['tf-bloc-volume'].style.display   = volume ? '' : 'none';
  _tfMajBoutonsVerin();
}

// Lancer et Retour : indisponibles pendant le mouvement, et quand le piston
// est déjà à la position visée
function _tfMajBoutonsVerin() {
  var v = tf.verin, zN = tf.z[TF_N];
  _tfEl['tf-btn-lancer'].disabled = v.actif || Math.abs(zN - tf.hVisee) < 1e-6;
  _tfEl['tf-btn-retour'].disabled = v.actif || Math.abs(zN - v.zAller) < 1e-6;
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
  tfGraphEffacer();
  _tfMajBoutons();
  tfMajAfficheurs();
}

function tfOnVitesse(val) {
  tf.vitesse = TF_VITESSES[parseInt(val, 10)];
  _tfEl['tf-lbl-vitesse'].textContent = _tfLibelleVitesse(tf.vitesse);
  tfGraph.sale = true;   // la fenêtre des graphes temporels suit le cran
  tfGraphReprogrammer();
  tfMajAfficheurs();
}

// ── Contrainte : famille de transformations (réinitialise l'expérience) ──
function tfOnFamille(f) {
  if (f === tf.famille) return;
  tfSetFamille(f);
  tfMolInit();
  tfGraphEffacer();
  _tfMajBoutons();
  tfMajAfficheurs();
}

// ── Volume imposé : hauteur visée (cm), durée τ (cran), Lancer, Retour ──
function tfOnVisee(val) {
  var cm = parseInt(val, 10);
  tf.hVisee = cm / 100;
  _tfEl['tf-lbl-visee'].textContent = cm + ' cm (' + _tfFmt(TF_S * tf.hVisee * 1000, 2) + ' L)';
  _tfMajBoutonsVerin();
  if (tf.famille === 'volume') tfMajAfficheurs();
  tf.needsRedraw = true;
}

function tfOnDuree(val) {
  tf.tau = TF_DUREES[parseInt(val, 10)];
  _tfEl['tf-lbl-duree'].textContent = _tfLibelleDuree(tf.tau);
  if (tf.famille === 'volume') tfMajAfficheurs();
}

function tfLancer() {
  tfLancerVerin();
  tfGraphReprogrammer();
  _tfMajBoutonsVerin();
}

function tfRetour() {
  tfRetourVerin();
  tfGraphReprogrammer();
  _tfMajBoutonsVerin();
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

// ── Contraintes extérieures : consignes de P_air et de T_ext (§2.6) ──
// Le curseur règle une consigne ; elle ne s'applique qu'au bouton
// Appliquer, d'un coup (échelon) ou pas à pas (rampe). Les afficheurs
// donnent la valeur en vigueur.
var TF_PAS_CONSIGNE = { Pair: [500, 1000, 2000, 5000, 10000], Text: [0.5, 1, 2, 5, 10] };
var TF_PERIODES     = [0.1, 0.2, 0.5, 1, 2, 5, 10];   // s
var tfConsignes = {
  Pair: { cible: TF_P_ATM, rampe: false, iPas: 2, iPeriode: 3 },
  Text: { cible: TF_T0,    rampe: false, iPas: 1, iPeriode: 3 }
};

// Valeur d'un curseur (kPa ou K entiers) ; la graduation la plus proche de
// l'atmosphère ou de T0 redonne la valeur exacte de l'état initial
function _tfValeurConsigne(cle, v) {
  v = parseFloat(v);
  if (cle === 'Pair') return Math.abs(v - TF_P_ATM / 1000) < 0.5 ? TF_P_ATM : v * 1000;
  return Math.abs(v - TF_T0) < 0.5 ? TF_T0 : v;
}

function _tfFmtConsigne(cle, x) {
  if (cle === 'Pair') {
    if (x < 500) return 'vide';
    return x === TF_P_ATM ? '101,3 kPa (atmosphère)' : _tfFmt(x / 1000, x % 1000 ? 1 : 0) + ' kPa';
  }
  return _tfFmt(x, x % 1 ? 1 : 0) + ' K (' + Math.round(x - 273.15) + ' °C)';
}

function _tfFmtPas(cle, x) {
  return cle === 'Pair' ? _tfFmt(x / 1000, x < 1000 ? 1 : 0) + ' kPa' : _tfFmt(x, x < 1 ? 1 : 0) + ' K';
}

function tfOnConsigne(cle, val) {
  tfConsignes[cle].cible = _tfValeurConsigne(cle, val);
  document.getElementById('tf-lbl-' + cle).textContent = _tfFmtConsigne(cle, tfConsignes[cle].cible);
  _tfMajConsignes();
}

function tfOnModeConsigne(cle, rampe) {
  tfConsignes[cle].rampe = rampe;
  document.getElementById('tf-tab-' + cle + '-echelon').classList.toggle('active', !rampe);
  document.getElementById('tf-tab-' + cle + '-rampe').classList.toggle('active', rampe);
  document.getElementById('tf-rampe-' + cle).style.display = rampe ? '' : 'none';
  _tfMajConsignes();
}

function tfOnPasConsigne(cle, i) {
  tfConsignes[cle].iPas = parseInt(i, 10);
  document.getElementById('tf-lbl-' + cle + '-pas').textContent =
    _tfFmtPas(cle, TF_PAS_CONSIGNE[cle][tfConsignes[cle].iPas]);
  _tfMajConsignes();
}

function tfOnPeriodeConsigne(cle, i) {
  tfConsignes[cle].iPeriode = parseInt(i, 10);
  var T = TF_PERIODES[tfConsignes[cle].iPeriode];
  document.getElementById('tf-lbl-' + cle + '-periode').textContent = _tfFmt(T, T < 1 ? 1 : 0) + ' s';
  _tfMajConsignes();
}

function tfAppliquerConsigne(cle) {
  var k = tfConsignes[cle];
  tfAppliquer(cle, k.cible, k.rampe, TF_PAS_CONSIGNE[cle][k.iPas], TF_PERIODES[k.iPeriode]);
  tfGraph.sale = true;
  tfMajAfficheurs();
}

// Valeurs en vigueur, rampe en cours, durée d'une rampe depuis maintenant
function _tfMajConsignes() {
  ['Pair', 'Text'].forEach(function (cle) {
    var k = tfConsignes[cle], r = tf.rampes[cle];
    document.getElementById('tf-ro-' + cle).textContent = cle === 'Pair'
      ? (tf.Pair < 500 ? 'vide (' + _tfFmt(tf.Pair / 1000, 2) + ' kPa)' : _tfFmt(tf.Pair / 1000, 1) + ' kPa')
      : _tfFmt(tf.Text, 1) + ' K';
    var enCours = document.getElementById('tf-ro-' + cle + '-rampe');
    enCours.style.display = r.actif ? '' : 'none';
    if (r.actif) enCours.textContent = 'Rampe en cours vers ' + _tfFmtConsigne(cle, r.cible);
    var pas = TF_PAS_CONSIGNE[cle][k.iPas], T = TF_PERIODES[k.iPeriode];
    var n = Math.ceil(Math.abs(k.cible - tf[cle]) / pas - 1e-9);
    document.getElementById('tf-hint-' + cle + '-duree').textContent = n > 0
      ? 'Durée de la rampe : ' + n + ' pas, ' + _tfFmtDuree(Math.max(0, n - 1) * T) : 'Déjà à la consigne';
  });
}

// ── Section Affichage ──
function tfOnAffichage(cle, coche) {
  tfAff[cle] = coche;
  // Le profil de pression prend de la place à droite du cylindre
  if (cle === 'profil') _tfDoResize();
  tf.needsRedraw = true;
  tfGraph.sale = true;   // couleur du nuage des tranches
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
    var dtSim = tfAvancer(dtReel / 1000 * tf.vitesse);
    // Agitation des molécules en temps d'affichage, freinée au ralenti
    // (racine cubique du cran) et jamais accélérée au-delà de ×1, où elle
    // deviendrait illisible ; au cran le plus lent, elle suit le temps
    // simulé, à l'échelle réelle (tfMolReel).
    if (tfAff.molecules) {
      var f = Math.pow(Math.min(1, tf.vitesse), 1 / 3);
      tfMolAvancer(dtReel / 1000, dtReel / 1000 * f, dtSim, tfLargeurDessinee(),
                   tfRayonMolecule() / (_tfX2 - _tfX1), tfAff.chocs);
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
  tfGraphDessiner();
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
  _tfEl['tf-sl-visee'].value = Math.round(tf.hVisee * 100);
  tfOnVisee(_tfEl['tf-sl-visee'].value);
  _tfEl['tf-sl-duree'].value = TF_DUREES.indexOf(tf.tau);
  tfOnDuree(_tfEl['tf-sl-duree'].value);
  ['Pair', 'Text'].forEach(function (cle) {
    var k = tfConsignes[cle];
    document.getElementById('tf-sl-' + cle).value = cle === 'Pair' ? Math.round(k.cible / 1000) : Math.round(k.cible);
    document.getElementById('tf-sl-' + cle + '-pas').value = k.iPas;
    document.getElementById('tf-sl-' + cle + '-periode').value = k.iPeriode;
    tfOnModeConsigne(cle, k.rampe);
    tfOnPasConsigne(cle, k.iPas);
    tfOnPeriodeConsigne(cle, k.iPeriode);
    tfOnConsigne(cle, document.getElementById('tf-sl-' + cle).value);
  });

  tfReset();
  tfMolInit();
  tfGraphInit();
  _tfDoResize();
  _tfMajBoutons();
  tfMajAfficheurs();
  requestAnimationFrame(_tfLoop);
}
