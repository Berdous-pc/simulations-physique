// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  tf-cycles.js — Onglet Transformations : cycles tout faits (PLAN §10.13)
//  Un cycle choisi règle le point de départ A (brouillon de l'État
//  initial), trace en gris sur les diagrammes le cycle idéal à suivre et
//  liste ses étapes. Chaque étape se fait d'un clic, en le nombre de pas
//  choisi ; « Tout le cycle » les enchaîne avec ce même nombre de pas. Les
//  commandes habituelles restent libres : la progression se lit sur l'état
//  du gaz (conditions de l'étape réunies, volume visé atteint, équilibre).
//  Chargé après tf-ui.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// Volumes possibles : ceux du point de départ (hauteur 10 à 45 cm) ;
// pressions : celles de l'air de l'enceinte
var TF_CY_VMIN = 0.10 * TF_S, TF_CY_VMAX = 0.45 * TF_S;   // m³
var TF_CY_PMIN = 20e3, TF_CY_PMAX = 5e5;                  // Pa
var TF_CY_ATTEINT = 0.005;                                // écart relatif sur P
// Cycles réglés en pressions : leur plus grand volume (place laissée à une
// détente brutale, qui finit plus chaude donc plus loin)
var TF_CY_VGRAND = 0.75e-3;                               // m³

// Champs de réglage : libellé, unité et son facteur (SI × f), décimales,
// pas des boutons − et +, bornes (SI)
var TF_CY_CHAMPS = {
  Vmin : { nom: 'V<sub>min</sub>', unite: 'L',   f: 1e3,  dec: 3, pas: 0.05e-3, min: TF_CY_VMIN, max: TF_CY_VMAX },
  Vmax : { nom: 'V<sub>max</sub>', unite: 'L',   f: 1e3,  dec: 3, pas: 0.05e-3, min: TF_CY_VMIN, max: TF_CY_VMAX },
  Pmin : { nom: 'P<sub>min</sub>', unite: 'kPa', f: 1e-3, dec: 1, pas: 10e3,    min: TF_CY_PMIN, max: TF_CY_PMAX },
  Pmax : { nom: 'P<sub>max</sub>', unite: 'kPa', f: 1e-3, dec: 1, pas: 10e3,    min: TF_CY_PMIN, max: TF_CY_PMAX },
  PA   : { nom: 'P<sub>A</sub>',   unite: 'kPa', f: 1e-3, dec: 1, pas: 10e3,    min: TF_CY_PMIN, max: TF_CY_PMAX }
};

// Chaque cycle se règle par les grandeurs que ses étapes imposent :
// pressions quand le piston est libre (Carnot, aller-retour), volumes des
// isochores (Stirling), volume de l'isochore et pression de l'isobare
// (Lenoir, les deux coordonnées de A)
var TF_CYCLES = {
  allerretour : { nom: 'Aller-retour', champs: ['Pmin', 'Pmax'], defaut: { Pmin: 100e3, Pmax: 250e3 } },
  carnot      : { nom: 'Carnot',       champs: ['Pmin', 'Pmax'], defaut: { Pmin: 20e3, Pmax: 100e3 } },
  stirling    : { nom: 'Stirling',     champs: ['Vmin', 'Vmax'], defaut: { Vmin: 0.3e-3, Vmax: 0.6e-3 } },
  lenoir      : { nom: 'Lenoir',       champs: ['Vmin', 'PA'],   defaut: { Vmin: 0.3e-3, PA: 100e3 } }
};

// cle : cycle choisi (null : aucun) ; iN : cran du nombre de pas
// (TF_NB_PAS) ; k : étape à faire ; faits : manière ({man, nPas}) de
// chaque étape faite, etatsFaits : rang dans la frise de l'état qu'elle a
// atteint (Annuler la dernière y revient) ; tour : le dernier tour est complet ; run : étapes
// enchaînées {N (nombre de pas), seul (une seule étape)} ; Tnom : températures des sources au lancement (une étape de contact
// lente fait varier celle de sa source) ; v : valeurs des réglages ; def :
// cycle calculé ; sigA : réglages qui ont fixé A
var tfCycle = { cle: null, iN: 3, v: {}, k: 0, faits: [], etatsFaits: [], tour: false, run: null, Tnom: null,
                def: null, sigA: '', sigF: '' };

var _tfCyEl = {};
var _tfCyHtml = '';

function _tfCyFmtV(V) { return _tfFmt(V * 1e3, 3) + ' L'; }
function _tfCyFmtP(P) { return _tfFmt(P / 1e3, 1) + ' kPa'; }

// Température d'une source pour le cycle : celle du lancement tant que des
// étapes s'enchaînent
function _tfCyTSource(f) { return tfCycle.run && tfCycle.Tnom ? tfCycle.Tnom[f] : tfTSource(f); }

// ── Cycle idéal : point A et étapes ──
// Chaque étape : titre, type ('P' : piston libre, la pression de l'air de
// l'enceinte vise celle de l'arrivée ; 'fond' : la source sous le cylindre
// amène le gaz à sa température), conditions (piston tenu, contact :
// 'isolant' ou la source sous le fond, champ fond),
// loi suivie (tracé gris), volume, température et pression d'arrivée.
// Moteurs : les cycles sont parcourus dans le sens horaire du diagramme PV.
// Le piston est mené par la pression, comme dans les énoncés (brutalement,
// la pression extérieure passe d'un coup à sa valeur finale) ; il n'est
// tenu que pour les isochores.
function _tfCyCalculer() {
  var C = tfCycle, v = C.v, g = tfDepart.gamma;
  var T1 = _tfCyTSource('1'), T2 = _tfCyTSource('2');
  var ch = T1 >= T2 ? '1' : '2', fr = ch === '1' ? '2' : '1';
  var Th = Math.max(T1, T2), Tc = Math.min(T1, T2), n, k;
  var d = { A: null, etapes: [], erreur: null, ch: ch, fr: fr, Th: Th, Tc: Tc };
  // Étape d'arrivée (V, T) ; la pression en découle (n fixé par A)
  var et = function (titre, type, tenu, fond, loi, V, T) {
    d.etapes.push({ titre: titre, type: type, tenu: tenu, fond: fond, loi: loi, V: V, T: T });
  };
  if (C.cle !== 'allerretour' && Th - Tc < 1) {
    d.erreur = 'Il faut deux sources à des températures différentes (Montage, flèche ▾).';
    return d;
  }
  if (C.cle === 'allerretour') {
    // A : plus grand volume, à P min ; compression jusqu'à P max
    var T0 = tfDepart.T0, VB = TF_CY_VGRAND * Math.pow(v.Pmin / v.Pmax, 1 / g);
    if (v.Pmax < 1.2 * v.Pmin) d.erreur = 'P max doit dépasser ' + _tfCyFmtP(1.2 * v.Pmin) + '.';
    d.A = { V: TF_CY_VGRAND, T: T0, P: v.Pmin };
    et('Compression adiabatique', 'P', false, 'isolant', 'adia', VB, T0 * Math.pow(TF_CY_VGRAND / VB, g - 1));
    et('Détente adiabatique', 'P', false, 'isolant', 'adia', TF_CY_VGRAND, T0);
  } else if (C.cle === 'carnot') {
    // A à P max et T chaude, C à P min et T froide (plus grand volume) ;
    // adiabatiques entre Th et Tc : P·T^(−γ/(γ−1)) constant
    var rP = Math.pow(Th / Tc, g / (g - 1));
    if (v.Pmax < 1.05 * rP * v.Pmin) d.erreur = 'Pour ces deux sources, P max doit dépasser ' + _tfCyFmtP(1.05 * rP * v.Pmin) + '.';
    n = v.Pmin * TF_CY_VGRAND / (TF_R * Tc);
    d.A = { V: n * TF_R * Th / v.Pmax, T: Th, P: v.Pmax };
    et('Détente isotherme', 'P', false, ch, 'isoT', n * TF_R * Th / (v.Pmin * rP), Th);
    et('Détente adiabatique', 'P', false, 'isolant', 'adia', TF_CY_VGRAND, Tc);
    et('Compression isotherme', 'P', false, fr, 'isoT', n * TF_R * Tc / (v.Pmax / rP), Tc);
    et('Compression adiabatique', 'P', false, 'isolant', 'adia', d.A.V, Th);
  } else if (C.cle === 'stirling') {
    // Pression de A : celle du point de départ
    if (v.Vmax < 1.2 * v.Vmin) d.erreur = 'V max doit dépasser ' + _tfCyFmtV(1.2 * v.Vmin) + '.';
    d.A = { V: v.Vmin, T: Th, P: tfDepart.P0 };
    et('Détente isotherme', 'P', false, ch, 'isoT', v.Vmax, Th);
    et('Refroidissement isochore', 'fond', true, fr, 'isoV', v.Vmax, Tc);
    et('Compression isotherme', 'P', false, fr, 'isoT', v.Vmin, Tc);
    et('Chauffage isochore', 'fond', true, ch, 'isoV', v.Vmin, Th);
  } else {
    // Lenoir : chauffage à volume constant, détente adiabatique jusqu'à la
    // pression de A, refroidissement à pression constante (piston libre)
    var Vc = v.Vmin * Math.pow(Th / Tc, 1 / g);
    d.A = { V: v.Vmin, T: Tc, P: v.PA };
    et('Chauffage isochore', 'fond', true, ch, 'isoV', v.Vmin, Th);
    et('Détente adiabatique', 'P', false, 'isolant', 'adia', Vc, Th * Math.pow(v.Vmin / Vc, g - 1));
    et('Refroidissement isobare', 'fond', false, fr, 'isoP', v.Vmin, Tc);
  }
  n = d.A.P * d.A.V / (TF_R * d.A.T);
  d.etapes.forEach(function (s) { s.P = n * TF_R * s.T / s.V; });
  // Le cycle doit tenir dans le cylindre et dans la plage de l'enceinte
  var pts = [d.A].concat(d.etapes);
  for (k = 0; k < pts.length && !d.erreur; k++) {
    if (pts[k].V > TF_CY_VMAX * (1 + 1e-9) || pts[k].V < TF_CY_VMIN * (1 - 1e-9)) {
      d.erreur = 'Le cycle sortirait du cylindre (' + _tfCyFmtV(TF_CY_VMIN) + ' à ' + _tfCyFmtV(TF_CY_VMAX)
               + ') : rapprochez les réglages.';
    } else if (pts[k].P > TF_CY_PMAX * (1 + 1e-9)) {
      d.erreur = 'La pression dépasserait ' + _tfCyFmtP(TF_CY_PMAX) + ' : baissez les réglages.';
    }
  }
  return d;
}

// Tracé gris du cycle idéal, étape par étape : [{V, P, T, S}], S comptée
// depuis l'état initial de l'expérience (comme tfEntropie)
function _tfCyFantome(d) {
  var g = tfDepart.gamma, Cv = TF_R / (g - 1);
  var n = d.A.P * d.A.V / (TF_R * d.A.T), N = 32, segs = [], de = d.A;
  d.etapes.forEach(function (e) {
    var pts = [];
    for (var i = 0; i <= N; i++) {
      var u = i / N, V = de.V + u * (e.V - de.V), T;
      if (e.loi === 'isoT') T = de.T;
      else if (e.loi === 'adia') T = de.T * Math.pow(de.V / V, g - 1);
      else if (e.loi === 'isoV') { V = de.V; T = de.T + u * (e.T - de.T); }
      else T = de.T * V / de.V;
      pts.push({ V: V, T: T, P: n * TF_R * T / V,
                 S: n * Cv * Math.log(T / tf.T0) + n * TF_R * Math.log(V / tf.V0) });
    }
    segs.push(pts);
    de = { V: e.V, T: pts[N].T };
  });
  return segs;
}

// Réglages qui fixent A : le cycle, ses réglages, les sources
function _tfCySigA() {
  var C = tfCycle;
  if (!C.cle) return '';
  return [C.cle, JSON.stringify(C.v), _tfCyTSource('1').toFixed(3), _tfCyTSource('2').toFixed(3)].join('|');
}

// Cycle recalculé ; si les réglages qui fixent A ont changé, A passe dans
// le brouillon de l'État initial (appliqué aussitôt s'il n'y a aucune
// étape, sinon par « Recommencer depuis A »)
function _tfCyMettreAJour() {
  var C = tfCycle;
  if (!C.cle) { C.def = null; tfGraph.fantome = null; tfGraph.sale = true; return; }
  C.def = _tfCyCalculer();
  var sig = _tfCySigA();
  if (sig !== C.sigA && C.def.A && !C.def.erreur && !C.run && !tfEnCours()) {
    C.sigA = sig;
    var A = C.def.A;
    if (Math.abs(tfDepart.V0 - A.V) > 1e-12 || Math.abs(tfDepart.T0 - A.T) > 1e-9
        || Math.abs(tfDepart.P0 - A.P) > 1e-6 || tfDepart.montage !== 'Pair') {
      tfDepart.montage = 'Pair';   // les masses ne descendent pas sous P_atm
      tfDepart.P0 = A.P;
      tfDepart.V0 = A.V;
      tfDepart.T0 = _tfBorner(A.T, 250, 600);
      _tfDepartChange();
      C.def = _tfCyCalculer();
    }
  }
  tfGraph.fantome = C.def.A && !C.def.erreur ? { segs: _tfCyFantome(C.def), k: C.k } : null;
  tfGraph.sale = true;
}

// ── Gestionnaires (index.html) ──
function tfOnCycle(cle) {
  var C = tfCycle;
  tfCyArreter();
  C.cle = C.cle === cle ? null : cle;
  C.v = {};
  if (C.cle) for (var c in TF_CYCLES[cle].defaut) C.v[c] = TF_CYCLES[cle].defaut[c];
  C.k = 0; C.faits = []; C.etatsFaits = []; C.tour = false; C.sigA = C.sigF = '';
  _tfCyMettreAJour();
  _tfMajCycle(true);
  tfMajAfficheurs();
}

// Réglage i du cycle (0 ou 1) porté à x (SI), dans ses bornes ; un minimum
// reste sous le maximum
function _tfCyFixer(i, x) {
  var C = tfCycle, cle = TF_CYCLES[C.cle].champs[i], F = TF_CY_CHAMPS[cle], v = C.v;
  v[cle] = _tfBorner(x, F.min, F.max);
  ['V', 'P'].forEach(function (q) {
    if (!(q + 'min' in v) || !(q + 'max' in v) || v[q + 'min'] <= v[q + 'max'] - F.pas) return;
    if (cle === q + 'min') v[q + 'max'] = Math.min(F.max, v[q + 'min'] + F.pas);
    else v[q + 'min'] = Math.max(F.min, v[q + 'max'] - F.pas);
  });
  C.k = 0; C.faits = []; C.etatsFaits = []; C.tour = false;
  _tfCyMettreAJour();
  _tfMajCycle(true);
  tfMajAfficheurs();
}

function tfCySaisie(i, txt) {
  var x = _tfLireNombre(txt);
  if (!isNaN(x)) _tfCyFixer(i, x / TF_CY_CHAMPS[TF_CYCLES[tfCycle.cle].champs[i]].f);
  else _tfMajCycle(true);
}

// − et + : vers le multiple du pas voisin
function tfCyPas(i, sens) {
  var cle = TF_CYCLES[tfCycle.cle].champs[i], p = TF_CY_CHAMPS[cle].pas, v = tfCycle.v[cle] / p;
  _tfCyFixer(i, p * (sens > 0 ? Math.floor(v + 1e-6) + 1 : Math.ceil(v - 1e-6) - 1));
}

function _tfCyLancer(seul) {
  tfCycle.Tnom = { '1': tfTSource('1'), '2': tfTSource('2') };
  tfCycle.run = { N: TF_NB_PAS[tfCycle.iN], seul: seul };
}

// Étape à faire, en le nombre de pas choisi
function tfCyEtape() {
  if (tfCycle.run || !_tfCyPret()) return;
  _tfCyLancer(true);
  _tfCyTic();
  tfMajAfficheurs();
}

// Tout le cycle, avec le même nombre de pas, à partir de l'étape à faire
function tfCyTout() {
  if (tfCycle.run || !_tfCyPret()) return;
  _tfCyLancer(false);
  _tfCyTic();
  tfMajAfficheurs();
}

// Curseur du nombre de pas (1 : brutal ; ∞ : réversible)
function tfCyOnNbPas(val) {
  tfCycle.iN = parseInt(val, 10);
  _tfMajCycle(true);
}

function _tfCyLibN(N) {
  return N === 1 ? '1 pas : chaque étape brutale (échelon)'
       : isFinite(N) ? N + ' pas par étape, retour à l’équilibre entre deux pas'
       : 'pas infinitésimal : chaque étape réversible';
}

function tfCyArreter() {
  if (!tfCycle.run) return;
  tfCycle.run = null;
  if (tfEnCours() || _tfEnAttente) tfOnInterrompre();
  _tfMajCycle(true);
}

// Recommencer depuis A, ou revenir à un état (i : son rang dans la frise ;
// 0 = A) : les étapes du cycle qui avaient mené au-delà ne sont plus
// faites. Le tracé gris sera recalculé (entropie comptée depuis le nouvel
// état initial, étape à faire)
function tfCyclesRaz(i) {
  var C = tfCycle, m = 0;
  C.run = null;
  if (i === 0) { C.k = 0; C.faits = []; C.etatsFaits = []; C.tour = false; }
  else {
    while (m < C.etatsFaits.length && C.etatsFaits[m] <= i) m++;
    if (m < C.etatsFaits.length) {
      C.faits.length = C.etatsFaits.length = m;
      C.k = m;
      C.tour = false;
    }
  }
  C.sigF = '';
}

// ── Progression ──
function _tfCyPret() {
  var d = tfCycle.def;
  return !!(tfCycle.cle && d && d.A && !d.erreur && !_tfDepartModifie());
}

// Gaz au repos : aucune action ni étape en cours, équilibre atteint
function _tfCyRepos() {
  var der = tfEtapes.liste[tfEtapes.liste.length - 1];
  return !tfEnCours() && !_tfEnAttente && !(der && der.statut === 'en cours') && tfMesures().equilibre;
}

// Cycle commencé : au moins sa première étape faite, le tour pas fini (les
// graphes gardent alors l'origine des temps, tfGraphDepartEtape)
function tfCyEnCours() {
  var d = tfCycle.def;
  return !!(tfCycle.cle && d && !d.erreur && tfCycle.k > 0);
}

function _tfCyConditions(s) { return tf.tenu === s.tenu && tfContact() === s.fond; }

// Étape faite : conditions réunies, et température ou pression d'arrivée
// atteinte ; ou piston en butée (une détente brutale peut demander plus de
// place que le cylindre n'en a : l'étape s'arrête là)
function _tfCyAtteinte(s) {
  var m = tfMesures();
  return _tfCyConditions(s) && (s.type === 'fond' ? Math.abs(m.Tmoy - s.T) < 0.5
    : Math.abs(m.Pmoy - s.P) < TF_CY_ATTEINT * s.P || m.butee !== null);
}

// Tenir ou libérer le piston ; libéré, l'air de l'enceinte est d'abord mis
// à la pression du gaz (au repos, rien ne bouge : pas d'étape)
function _tfCyPiston(tenir) {
  if (!tenir) tf.Pair = Math.max(0, tfMesures().Pmoy - (TF_M_PISTON + tf.masse) * TF_G / TF_S);
  tfOnPiston(tenir);
}

// Une seule condition changée à la fois (piston, puis fond), le gaz
// revenant au repos entre deux : chaque changement qui agit sur le gaz est
// une étape de la frise
function _tfCyPreparer(s) {
  tfCarte.mode = 'viser';
  tfCarte.organe = 'piston';
  if (tf.tenu !== s.tenu) _tfCyPiston(s.tenu);
  else if (tfContact() !== s.fond) tfPoserContact(s.fond);
}

// Étape de contact : en un pas, le cylindre est posé sur la source telle
// qu'elle est ; en plusieurs pas, la source est d'abord mise à la
// température du gaz (y poser le cylindre ne change rien), puis sa
// température va jusqu'à celle visée, en N pas (Agir sur la source) : elle
// retrouve ainsi son réglage
function _tfCyContact(s, N) {
  if (tf.tenu !== s.tenu) { _tfCyPiston(s.tenu); return; }
  if (tfContact() !== s.fond) {
    if (N !== 1) tfFixerTSource(s.fond, _tfBorner(tfMesures().Tmoy, TF_T_SOURCE_MIN, TF_T_SOURCE_MAX));
    tfPoserContact(s.fond);
    return;
  }
  tfCarte.mode = 'viser';
  tfCarte.organe = 'source';
  tfCarte.Text.vise = s.T;
  tfCarte.Text.suit = false;
  _tfMajBoutons();
  tfLancerPas(N);
}

// Appelée à chaque mise à jour des afficheurs : note l'étape atteinte,
// puis fait avancer les étapes enchaînées
function _tfCyTic() {
  var C = tfCycle, d = C.def;
  if (!C.cle || !d || !d.A || d.erreur || !_tfCyRepos()) return;
  var s = d.etapes[C.k];
  if (_tfCyAtteinte(s)) {
    var der = tfEtapes.liste[tfEtapes.liste.length - 1];
    if (C.k === 0) { C.faits = []; C.etatsFaits = []; C.tour = false; }
    // Contact direct avec la source (pas de manière notée) : brutal
    C.faits[C.k] = der && der.man ? { man: der.man, nPas: der.nPas }
                 : { man: s.type === 'fond' ? 'brutal' : 'main' };
    C.etatsFaits[C.k] = tfEtapes.etats.length - 1;
    C.k++;
    // Tour fini : l'enchaînement s'arrête là, comme étape par étape (pas
    // revenu en A après une étape irréversible : c'est la leçon)
    if (C.k === d.etapes.length) {
      C.k = 0;
      C.tour = true;
      C.run = null;
    }
    if (C.run && C.run.seul) C.run = null;
    if (tfGraph.fantome) tfGraph.fantome.k = C.k;
    tfGraph.sale = true;
    return;
  }
  if (!C.run) return;
  if (s.type === 'fond') { _tfCyContact(s, C.run.N); return; }
  if (!_tfCyConditions(s)) { _tfCyPreparer(s); return; }
  // Pression de l'air visée : celle de l'arrivée, moins le poids du piston
  tfCarte.mode = 'viser';
  tfCarte.organe = 'piston';
  tfCarte.Pair.vise = Math.max(0, s.P - (TF_M_PISTON + tf.masse) * TF_G / TF_S);
  tfCarte.Pair.suit = false;
  _tfMajBoutons();
  tfLancerPas(C.run.N);
}

// ── Affichage ──
function _tfCyDetail(d, s) {
  var src = function (f) { return 'source ' + f + ' (' + Math.round(_tfCyTSource(f)) + ' K)'; };
  if (s.type === 'P') return '→ ' + _tfFmt(s.P / 1e3, 1) + ' kPa (' + _tfCyFmtV(s.V) + ') · '
                           + (s.fond === 'isolant' ? 'paroi isolante' : src(s.fond));
  return '→ ' + Math.round(s.T) + ' K · ' + (s.tenu ? 'piston tenu, ' : 'piston libre, ') + src(s.fond);
}

function _tfMajCycle(force) {
  var C = tfCycle, E = _tfCyEl;
  if (!E.corps) return;
  // Réglages du cycle, des sources, du gaz ou du départ changés : recalcul
  var sf = [_tfCySigA(), tfDepart.gamma, tfDepart.P0, tfDepart.T0, tf.T0, tf.V0].join('|');
  if (sf !== C.sigF) { C.sigF = sf; _tfCyMettreAJour(); force = true; }
  ['allerretour', 'carnot', 'stirling', 'lenoir'].forEach(function (c) {
    E['ong-' + c].classList.toggle('active', C.cle === c);
  });
  E.corps.style.display = C.cle ? '' : 'none';
  if (!C.cle) return;
  var d = C.def, pret = _tfCyPret(), repos = !C.run && !tfEnCours() && !_tfEnAttente;

  // Réglages du cycle : libellé, unité, valeur, − et + dans les bornes
  TF_CYCLES[C.cle].champs.forEach(function (cle, i) {
    var F = TF_CY_CHAMPS[cle], x = C.v[cle], inp = E['in-' + i];
    if (force) { E['lbl-' + i].innerHTML = F.nom; E['unite-' + i].textContent = F.unite; }
    if (force || document.activeElement !== inp) inp.value = _tfFmtChamp(x * F.f, F.dec);
    E['moins-' + i].disabled = x <= F.min * (1 + 1e-9);
    E['plus-' + i].disabled = x >= F.max * (1 - 1e-9);
  });

  var info = d.erreur ? d.erreur
    : C.cle === 'allerretour' ? 'Sur l’isolant, piston libre.'
    : 'Source chaude : ' + d.ch + ' (' + Math.round(d.Th) + ' K) · froide : ' + d.fr + ' (' + Math.round(d.Tc) + ' K)';
  var attente = !d.erreur && _tfDepartModifie();

  // Étapes : faites (manière), à faire (boutons), à venir
  var h = '<div class="tf-cy-et tf-cy-a"><span class="tf-cy-num">A</span><span class="tf-f-detail">'
        + (d.A ? _tfCyFmtP(d.A.P) + ' · ' + _tfCyFmtV(d.A.V) + ' · ' + Math.round(d.A.T) + ' K' : '')
        + '</span></div>';
  d.etapes.forEach(function (s, i) {
    var fait = C.faits[i], courant = i === C.k && !d.erreur;
    h += '<div class="tf-cy-et' + (courant ? ' courant' : '') + (fait ? ' fait' : '') + '">'
       + '<span class="tf-cy-num">' + (fait && !courant ? '✓' : i + 1) + '</span>'
       + '<div class="tf-cy-txt"><span class="tf-f-titre">' + s.titre + '</span> '
       + (fait ? '<span class="tf-f-puce tf-f-' + fait.man + '">' + _tfPuce(fait.man, fait.nPas) + '</span>' : '')
       + '<br><span class="tf-f-detail">' + _tfCyDetail(d, s) + '</span>'
       + '</div></div>';
  });
  // Ligne de fin de tour toujours présente (vide pendant le tour) : la
  // suite du panneau ne bouge pas quand le tour finit
  h += '<div class="tf-cy-fin">' + (!C.tour ? '&nbsp;' : tfEtapesCycle() ? '⟳ Revenu en A : bilan du cycle dans Bilan.'
       : 'Tour fini, mais le gaz n’est pas revenu en A.') + '</div>';

  var sig = [h, info, attente, pret, repos, !!C.run, C.k].join('#');
  if (!force && sig === _tfCyHtml) { _tfCyMajEnCours(); return; }
  _tfCyHtml = sig;
  E.info.textContent = info;
  E.info.classList.toggle('tf-cy-erreur', !!d.erreur);
  E.attente.style.display = attente ? '' : 'none';
  E.liste.innerHTML = h;
  E.btns.classList.toggle('en-cours-cache', !!C.run);
  E.slN.disabled = !!C.run;
  E.toutBtn.disabled = E.etapeBtn.disabled = !pret || !repos;
  E.slN.value = C.iN;
  E.lblN.textContent = _tfCyLibN(TF_NB_PAS[C.iN]);
  _tfCyMajEnCours();
}

function _tfCyMajEnCours() {
  var C = tfCycle, E = _tfCyEl;
  E.encours.style.display = C.run ? '' : 'none';
  if (!C.run) return;
  var n = C.def.etapes.length;
  E.encoursTxt.textContent = (C.run.seul ? 'Étape ' : (isFinite(C.run.N) ? C.run.N + ' pas' : 'Pas infinitésimal') + ' · étape ')
    + (C.k + 1) + ' / ' + n + '…';
}

function tfCyclesInit() {
  ['allerretour', 'carnot', 'stirling', 'lenoir'].forEach(function (c) {
    _tfCyEl['ong-' + c] = document.getElementById('tf-cy-' + c);
  });
  [0, 1].forEach(function (i) {
    ['lbl', 'in', 'unite', 'moins', 'plus'].forEach(function (q) {
      _tfCyEl[q + '-' + i] = document.getElementById('tf-cy-' + q + '-' + i);
    });
  });
  _tfCyEl.toutBtn = document.getElementById('tf-cy-tout-btn');
  _tfCyEl.etapeBtn = document.getElementById('tf-cy-etape-btn');
  _tfCyEl.btns = _tfCyEl.toutBtn.parentNode;
  _tfCyEl.slN = document.getElementById('tf-cy-sl-nbpas');
  _tfCyEl.lblN = document.getElementById('tf-cy-lbl-nbpas');
  _tfCyEl.corps = document.getElementById('tf-cy-corps');
  _tfCyEl.info = document.getElementById('tf-cy-info');
  _tfCyEl.attente = document.getElementById('tf-cy-attente');
  _tfCyEl.liste = document.getElementById('tf-cy-liste');
  _tfCyEl.tout = document.getElementById('tf-cy-tout');
  _tfCyEl.encours = document.getElementById('tf-cy-encours');
  _tfCyEl.encoursTxt = document.getElementById('tf-cy-encours-txt');
  _tfMajCycle(true);
}
