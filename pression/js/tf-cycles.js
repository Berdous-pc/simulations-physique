// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  tf-cycles.js — Onglet Transformations : cycles tout faits (PLAN §10.13)
//  Un cycle choisi règle le point de départ A (brouillon de l'État
//  initial), trace en gris sur les diagrammes le cycle idéal à suivre et
//  liste ses étapes. Chaque étape se fait d'un clic, avec la manière
//  choisie ; « Tout le cycle » les enchaîne d'une même manière. Les
//  commandes habituelles restent libres : la progression se lit sur l'état
//  du gaz (conditions de l'étape réunies, volume visé atteint, équilibre).
//  Chargé après tf-ui.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// Volumes réglables : ceux du point de départ (hauteur 10 à 45 cm)
var TF_CY_VMIN = 0.10 * TF_S, TF_CY_VMAX = 0.45 * TF_S;   // m³
var TF_CY_PAS  = 0.05e-3;                                 // m³, boutons − et +
var TF_CY_ATTEINT = 0.005;                                // écart relatif sur P et V

var TF_CYCLES = {
  allerretour : { nom: 'Aller-retour', Vmin: 0.3e-3, Vmax: 0.6e-3 },   // place pour le retour, plus chaud
  carnot      : { nom: 'Carnot',       Vmin: 0.2e-3, Vmax: 0.9e-3 },
  stirling    : { nom: 'Stirling',     Vmin: 0.3e-3, Vmax: 0.6e-3 },
  lenoir      : { nom: 'Lenoir',       Vmin: 0.3e-3, Vmax: null }   // V max déduit
};

// cle : cycle choisi (null : aucun) ; k : étape à faire ; faits : manière de
// chaque étape faite, etatsFaits : rang dans la frise de l'état qu'elle a
// atteint (Annuler la dernière y revient) ; tour : le dernier tour est complet ; run : étapes
// enchaînées {man, seul (une seule étape), fermer (retour aux conditions de
// A)} ; Tnom : températures des sources au lancement (une étape de contact
// lente fait varier celle de sa source) ; def : cycle calculé ; sigA :
// réglages qui ont fixé A
var tfCycle = { cle: null, Vmin: 0, Vmax: 0, k: 0, faits: [], etatsFaits: [], tour: false, run: null, Tnom: null,
                def: null, sigA: '', sigF: '' };

var _tfCyEl = {};
var _tfCyHtml = '';

function _tfCyFmtV(V) { return _tfFmt(V * 1e3, 3) + ' L'; }

// Température d'une source pour le cycle : celle du lancement tant que des
// étapes s'enchaînent
function _tfCyTSource(f) { return tfCycle.run && tfCycle.Tnom ? tfCycle.Tnom[f] : tfTSource(f); }

// ── Cycle idéal : point A et étapes ──
// Chaque étape : titre, type ('P' : piston libre, la pression de l'air de
// l'enceinte vise celle de l'arrivée ; 'fond' : la source sous le cylindre
// amène le gaz à sa température), conditions (piston tenu, fond),
// loi suivie (tracé gris), volume, température et pression d'arrivée.
// Moteurs : les cycles sont parcourus dans le sens horaire du diagramme PV.
// Le piston est mené par la pression, comme dans les énoncés (brutalement,
// la pression extérieure passe d'un coup à sa valeur finale) ; il n'est
// tenu que pour les isochores.
function _tfCyCalculer() {
  var C = tfCycle, g = tfDepart.gamma;
  var T1 = _tfCyTSource('1'), T2 = _tfCyTSource('2');
  var ch = T1 >= T2 ? '1' : '2', fr = ch === '1' ? '2' : '1';
  var Th = Math.max(T1, T2), Tc = Math.min(T1, T2), Vmin = C.Vmin, Vmax = C.Vmax;
  var d = { A: null, etapes: [], erreur: null, ch: ch, fr: fr, Th: Th, Tc: Tc };
  var et = function (titre, type, tenu, fond, loi, V, T) {
    d.etapes.push({ titre: titre, type: type, tenu: tenu, fond: fond, loi: loi, V: V, T: T });
  };
  if (C.cle !== 'allerretour' && Th - Tc < 1) {
    d.erreur = 'Il faut deux sources à des températures différentes (Conditions, flèche ▾).';
    return d;
  }
  if (C.cle === 'allerretour') {
    var T0 = tfDepart.T0;
    if (Vmax < 1.2 * Vmin) d.erreur = 'V max doit dépasser ' + _tfCyFmtV(1.2 * Vmin) + '.';
    d.A = { V: Vmax, T: T0 };
    et('Compression adiabatique', 'P', false, 'isolant', 'adia', Vmin, T0 * Math.pow(Vmax / Vmin, g - 1));
    et('Détente adiabatique', 'P', false, 'isolant', 'adia', Vmax, T0);
  } else if (C.cle === 'carnot') {
    // Adiabatiques entre Th et Tc : V·T^(1/(γ−1)) constant
    var r = Math.pow(Th / Tc, 1 / (g - 1));
    if (Vmax < 1.05 * r * Vmin) d.erreur = 'Pour ces deux sources, V max doit dépasser ' + _tfCyFmtV(1.05 * r * Vmin) + '.';
    d.A = { V: Vmin, T: Th };
    et('Détente isotherme', 'P', false, ch, 'isoT', Vmax / r, Th);
    et('Détente adiabatique', 'P', false, 'isolant', 'adia', Vmax, Tc);
    et('Compression isotherme', 'P', false, fr, 'isoT', Vmin * r, Tc);
    et('Compression adiabatique', 'P', false, 'isolant', 'adia', Vmin, Th);
  } else if (C.cle === 'stirling') {
    if (Vmax < 1.2 * Vmin) d.erreur = 'V max doit dépasser ' + _tfCyFmtV(1.2 * Vmin) + '.';
    d.A = { V: Vmin, T: Th };
    et('Détente isotherme', 'P', false, ch, 'isoT', Vmax, Th);
    et('Refroidissement isochore', 'fond', true, fr, 'isoV', Vmax, Tc);
    et('Compression isotherme', 'P', false, fr, 'isoT', Vmin, Tc);
    et('Chauffage isochore', 'fond', true, ch, 'isoV', Vmin, Th);
  } else {
    // Lenoir : chauffage à volume constant, détente adiabatique jusqu'à la
    // pression de départ, refroidissement à pression constante (piston libre)
    var Vc = Vmin * Math.pow(Th / Tc, 1 / g);
    if (Vc > TF_CY_VMAX) d.erreur = 'Le gaz sortirait du cylindre : baissez V min ou la source chaude.';
    d.A = { V: Vmin, T: Tc };
    et('Chauffage isochore', 'fond', true, ch, 'isoV', Vmin, Th);
    et('Détente adiabatique', 'P', false, 'isolant', 'adia', Vc, Th * Math.pow(Vmin / Vc, g - 1));
    et('Refroidissement isobare', 'fond', false, fr, 'isoP', Vmin, Tc);
  }
  var n = tfDepart.P0 * d.A.V / (TF_R * d.A.T);
  d.etapes.forEach(function (s) { s.P = n * TF_R * s.T / s.V; });
  return d;
}

// Tracé gris du cycle idéal, étape par étape : [{V, P, T, S}], S comptée
// depuis l'état initial de l'expérience (comme tfEntropie)
function _tfCyFantome(d) {
  var g = tfDepart.gamma, Cv = TF_R / (g - 1);
  var n = tfDepart.P0 * d.A.V / (TF_R * d.A.T), N = 32, segs = [], de = d.A;
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

// Réglages qui fixent A : le cycle, ses volumes, les sources
function _tfCySigA() {
  var C = tfCycle;
  if (!C.cle) return '';
  return [C.cle, C.Vmin, C.Vmax, _tfCyTSource('1').toFixed(3), _tfCyTSource('2').toFixed(3)].join('|');
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
    if (Math.abs(tfDepart.V0 - A.V) > 1e-12 || Math.abs(tfDepart.T0 - A.T) > 1e-9 || tfDepart.montage !== 'Pair') {
      tfDepart.montage = 'Pair';   // les masses ne descendent pas sous P_atm
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
  if (C.cle) {
    C.Vmin = TF_CYCLES[cle].Vmin;
    C.Vmax = TF_CYCLES[cle].Vmax || 0;
  }
  C.k = 0; C.faits = []; C.etatsFaits = []; C.tour = false; C.sigA = C.sigF = '';
  _tfCyMettreAJour();
  _tfMajCycle(true);
  tfMajAfficheurs();
}

function _tfCyFixerV(cle, V) {
  var C = tfCycle;
  C[cle] = _tfBorner(V, TF_CY_VMIN, TF_CY_VMAX);
  if (C.Vmax && C.Vmin > C.Vmax - TF_CY_PAS) {
    if (cle === 'Vmin') C.Vmax = Math.min(TF_CY_VMAX, C.Vmin + TF_CY_PAS);
    else C.Vmin = Math.max(TF_CY_VMIN, C.Vmax - TF_CY_PAS);
  }
  C.k = 0; C.faits = []; C.etatsFaits = []; C.tour = false;
  _tfCyMettreAJour();
  _tfMajCycle(true);
  tfMajAfficheurs();
}

function tfCySaisie(cle, txt) {
  var v = _tfLireNombre(txt);
  if (!isNaN(v)) _tfCyFixerV(cle, v * 1e-3);
  else _tfMajCycle(true);
}

// − et + : vers le multiple du pas voisin
function tfCyPas(cle, sens) {
  var v = tfCycle[cle] / TF_CY_PAS;
  _tfCyFixerV(cle, TF_CY_PAS * (sens > 0 ? Math.floor(v + 1e-6) + 1 : Math.ceil(v - 1e-6) - 1));
}

function _tfCyLancer(man, seul) {
  tfCycle.Tnom = { '1': tfTSource('1'), '2': tfTSource('2') };
  tfCycle.run = { man: man, seul: seul };
}

// Étape à faire, d'une manière
function tfCyEtape(man) {
  if (tfCycle.run || !_tfCyPret()) return;
  _tfCyLancer(man, true);
  _tfCyTic();
  tfMajAfficheurs();
}

// Tout le cycle, d'une même manière, à partir de l'étape à faire
function tfCyTout(man) {
  if (tfCycle.run || !_tfCyPret()) return;
  _tfCyLancer(man, false);
  _tfCyTic();
  tfMajAfficheurs();
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

function _tfCyConditions(s) { return tf.tenu === s.tenu && tf.fond === s.fond; }

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
  else if (tf.fond !== s.fond) tfOnFond(s.fond);
}

// Étape de contact : brutalement, le cylindre est posé sur la source telle
// qu'elle est ; lentement, la source est d'abord mise à la température du
// gaz (y poser le cylindre ne change rien), puis sa température va jusqu'à
// celle visée, de la manière choisie (Agir sur la source) : elle retrouve
// ainsi son réglage
function _tfCyContact(s, man) {
  if (tf.tenu !== s.tenu) { _tfCyPiston(s.tenu); return; }
  if (tf.fond !== s.fond) {
    if (man !== 'brutal') tf['T' + s.fond] = _tfBorner(tfMesures().Tmoy, TF_T_SOURCE_MIN, TF_T_SOURCE_MAX);
    tfOnFond(s.fond);
    return;
  }
  tfCarte.mode = 'viser';
  tfCarte.organe = 'source';
  tfCarte.Text.vise = s.T;
  tfCarte.Text.suit = false;
  _tfMajBoutons();
  tfLancerManiere(man);
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
    C.faits[C.k] = der && der.man ? der.man : s.type === 'fond' ? 'brutal' : 'main';
    C.etatsFaits[C.k] = tfEtapes.etats.length - 1;
    C.k++;
    if (C.k === d.etapes.length) {
      C.k = 0;
      C.tour = true;
      // Pas revenu en A (étape brutale) : le cylindre retrouve les
      // conditions de la première étape, si elles ne la font pas déjà
      var m = tfMesures();
      if (C.run && !C.run.seul && d.etapes[0].type === 'P'
          && (Math.abs(m.V - d.A.V) > TF_CY_ATTEINT * d.A.V || Math.abs(m.Tmoy - d.A.T) > 0.5)) C.run.fermer = true;
      else if (C.run && !C.run.seul) C.run = null;
    }
    if (C.run && C.run.seul) C.run = null;
    if (tfGraph.fantome) tfGraph.fantome.k = C.k;
    tfGraph.sale = true;
    return;
  }
  if (!C.run) return;
  // Tour fini : le cylindre retrouve les conditions de la première étape
  // (le gaz revient en A s'il en a été écarté), puis l'enchaînement s'arrête
  if (C.run.fermer) {
    if (_tfCyConditions(d.etapes[0])) C.run = null;
    else _tfCyPreparer(d.etapes[0]);
    return;
  }
  if (s.type === 'fond') { _tfCyContact(s, C.run.man); return; }
  if (!_tfCyConditions(s)) { _tfCyPreparer(s); return; }
  // Pression de l'air visée : celle de l'arrivée, moins le poids du piston
  tfCarte.mode = 'viser';
  tfCarte.organe = 'piston';
  tfCarte.Pair.vise = Math.max(0, s.P - (TF_M_PISTON + tf.masse) * TF_G / TF_S);
  tfCarte.Pair.suit = false;
  _tfMajBoutons();
  tfLancerManiere(C.run.man);
}

// ── Affichage ──
function _tfCyDetail(d, s) {
  var src = function (f) { return 'source ' + f + ' (' + Math.round(_tfCyTSource(f)) + ' K)'; };
  if (s.type === 'P') return '→ ' + _tfFmt(s.P / 1e3, 1) + ' kPa (' + _tfCyFmtV(s.V) + ') · '
                           + (s.fond === 'isolant' ? 'isolant' : src(s.fond));
  return '→ ' + Math.round(s.T) + ' K · ' + (s.tenu ? 'piston tenu, ' : 'piston libre, ') + src(s.fond);
}

function _tfCyBouton() {
  return ['brutal', 'qs', 'rev'].map(function (man) {
    return '<button class="tf-cy-m tf-m-' + man + '" onclick="tfCyEtape(\'' + man + '\')">'
         + TF_NOM_MANIERE[man] + '</button>';
  }).join('');
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

  // Volumes
  E.ligneVmax.style.display = C.cle === 'lenoir' ? 'none' : '';
  ['Vmin', 'Vmax'].forEach(function (c) {
    var inp = E['in-' + c];
    if (force || document.activeElement !== inp) inp.value = _tfFmtChamp(C[c] * 1e3, 3);
    E['moins-' + c].disabled = C[c] <= TF_CY_VMIN + 1e-12;
    E['plus-' + c].disabled = C[c] >= TF_CY_VMAX - 1e-12;
  });

  var info = d.erreur ? d.erreur
    : C.cle === 'allerretour' ? 'Sur l’isolant, piston libre.'
    : 'Source chaude : ' + d.ch + ' (' + Math.round(d.Th) + ' K) · froide : ' + d.fr + ' (' + Math.round(d.Tc) + ' K)';
  var attente = !d.erreur && _tfDepartModifie();

  // Étapes : faites (manière), à faire (boutons), à venir
  var h = '<div class="tf-cy-et tf-cy-a"><span class="tf-cy-num">A</span><span class="tf-f-detail">'
        + (d.A ? _tfCyFmtV(d.A.V) + ' · ' + Math.round(d.A.T) + ' K · ' + _tfFmt(tfDepart.P0 / 1e3, 0) + ' kPa' : '')
        + '</span></div>';
  d.etapes.forEach(function (s, i) {
    var fait = C.faits[i], courant = i === C.k && !d.erreur;
    h += '<div class="tf-cy-et' + (courant ? ' courant' : '') + (fait ? ' fait' : '') + '">'
       + '<span class="tf-cy-num">' + (fait && !courant ? '✓' : i + 1) + '</span>'
       + '<div class="tf-cy-txt"><span class="tf-f-titre">' + s.titre + '</span> '
       + (fait ? '<span class="tf-f-puce tf-f-' + fait + '">' + TF_PUCE_MANIERE[fait] + '</span>' : '')
       + '<br><span class="tf-f-detail">' + _tfCyDetail(d, s) + '</span>'
       + (courant && pret && repos ? '<div class="tf-cy-btns">' + _tfCyBouton() + '</div>' : '')
       + '</div></div>';
  });
  if (C.tour) {
    h += '<div class="tf-cy-fin">' + (tfEtapesCycle() ? '⟳ Revenu en A : bilan du cycle dans Bilan.'
         : 'Tour fini, mais le gaz n’est pas revenu en A.') + '</div>';
  }

  var sig = [h, info, attente, pret, repos, !!C.run, C.k].join('#');
  if (!force && sig === _tfCyHtml) { _tfCyMajEnCours(); return; }
  _tfCyHtml = sig;
  E.info.textContent = info;
  E.info.classList.toggle('tf-cy-erreur', !!d.erreur);
  E.attente.style.display = attente ? '' : 'none';
  E.liste.innerHTML = h;
  E.tout.style.display = C.run ? 'none' : '';
  ['brutal', 'qs', 'rev'].forEach(function (man) { E['tout-' + man].disabled = !pret || !repos; });
  _tfCyMajEnCours();
}

function _tfCyMajEnCours() {
  var C = tfCycle, E = _tfCyEl;
  E.encours.style.display = C.run ? '' : 'none';
  if (!C.run) return;
  var n = C.def.etapes.length;
  E.encoursTxt.textContent = C.run.fermer ? 'Retour aux conditions de A…'
    : (C.run.seul ? 'Étape ' : TF_NOM_MANIERE[C.run.man] + ' · étape ') + (C.k + 1) + ' / ' + n + '…';
}

function tfCyclesInit() {
  ['allerretour', 'carnot', 'stirling', 'lenoir'].forEach(function (c) {
    _tfCyEl['ong-' + c] = document.getElementById('tf-cy-' + c);
  });
  ['Vmin', 'Vmax'].forEach(function (c) {
    _tfCyEl['in-' + c] = document.getElementById('tf-cy-in-' + c);
    _tfCyEl['moins-' + c] = document.getElementById('tf-cy-moins-' + c);
    _tfCyEl['plus-' + c] = document.getElementById('tf-cy-plus-' + c);
  });
  ['brutal', 'qs', 'rev'].forEach(function (man) {
    _tfCyEl['tout-' + man] = document.getElementById('tf-cy-tout-' + man);
  });
  _tfCyEl.corps = document.getElementById('tf-cy-corps');
  _tfCyEl.ligneVmax = document.getElementById('tf-cy-ligne-Vmax');
  _tfCyEl.info = document.getElementById('tf-cy-info');
  _tfCyEl.attente = document.getElementById('tf-cy-attente');
  _tfCyEl.liste = document.getElementById('tf-cy-liste');
  _tfCyEl.tout = document.getElementById('tf-cy-tout');
  _tfCyEl.encours = document.getElementById('tf-cy-encours');
  _tfCyEl.encoursTxt = document.getElementById('tf-cy-encours-txt');
  _tfMajCycle(true);
}
