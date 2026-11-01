// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  tf-etapes.js — Onglet Transformations : journal des étapes
//  Chargé après tf-graph.js, avant tf-ui.js.
//
//  Chaque Lancer (ou bascule du piston) ouvre une étape. Elle part de
//  l'état d'équilibre courant (lettre A, B…) et arrive au premier équilibre
//  atteint une fois l'action finie : cet état reçoit la lettre suivante.
//  Tant qu'aucune étape n'est lancée, la lettre suit l'état d'équilibre (la
//  fin du séjour est l'état le plus reposé, cf. tf-graph.js). Chaque lettre
//  garde un instantané du système pour y revenir (PLAN §10.4, R2).
// ══════════════════════════════════════════════════════════════════════

'use strict';

// Une couleur par étape (la première dessine le chemin avant toute étape)
var TF_COUL_ETAPES = ['#2a5080', '#c0503a', '#2a8a50', '#8a4aa0', '#c08020', '#1a8a9a', '#a03060', '#6a7a20'];
var TF_COUL_SANS_ETAPE = '#7a8a96';

var tfEtapes = {
  // Étapes : titre (nature), detail, man (manière : 'brutal', 'qs', 'rev',
  // 'main' ou null), couleur, depart et arrivee (indices de lettres ou
  // null), statut, nonDef (le gaz est passé par un état où P ou T n'est pas
  // définie : trait pointillé dans la frise, comme sur le diagramme), bilan0
  // et bilan1 (compteurs au départ et à l'arrivée)
  liste   : [],
  // Lettres : {lettre, V, P, T, S, snap, retour} ; retour : indice de la
  // lettre déjà vue dont l'état est retrouvé (même lettre), sinon absent
  etats   : [],
  suivie  : null,   // lettre mise à jour tant que dure l'équilibre
  sel     : -1,     // étape mise en évidence sur le diagramme et au bilan (-1 : aucune)
  selEtat : -1,     // état par lequel passent les courbes de référence (-1 : aucun)
  bilanA  : null,   // compteurs du bilan à l'état initial A (tfBilan)
  version : 0       // incrémentée à chaque changement du journal (panneau)
};

// Étape en cours de tracé (1 = première ; 0 avant toute étape) : les
// échantillons des graphes la portent
function tfEtapeCourante() { return tfEtapes.liste.length; }

function tfCouleurEtape(n) {
  return n > 0 && tfEtapes.liste[n - 1] ? tfEtapes.liste[n - 1].couleur : TF_COUL_SANS_ETAPE;
}

function _tfLettre(i) {
  var s = '';
  do { s = String.fromCharCode(65 + i % 26) + s; i = Math.floor(i / 26) - 1; } while (i >= 0);
  return s;
}

// ── Instantané du système, et retour à un instantané ──
var _TF_SNAP_TABLEAUX = ['z', 'u', 'E', 'P', 'q'];
// Le fond (isolant ou source, et la température des sources) fait partie
// de l'état : revenir à un état remet le cylindre où il était
var _TF_SNAP_SCALAIRES = ['tenu', 'masse', 'blocs', 'sable', 'sableMain', 'Pair', 'Text', 'Wop', 'Wair',
                          'Qrecu', 'QsurT', 'Qabs', 'Wgaz', 'eDecal', 't', 'fond', 'T1', 'T2', 'G', 'tReposMin', 'tThMin'];

function _tfInstantane(snap) {
  snap = snap || {};
  _TF_SNAP_TABLEAUX.forEach(function (k) {
    if (!snap[k]) snap[k] = new Float64Array(tf[k].length);
    snap[k].set(tf[k]);
  });
  _TF_SNAP_SCALAIRES.forEach(function (k) { snap[k] = tf[k]; });
  return snap;
}

function _tfRestaurerInstantane(snap) {
  _TF_SNAP_TABLEAUX.forEach(function (k) { tf[k].set(snap[k]); });
  _TF_SNAP_SCALAIRES.forEach(function (k) { tf[k] = snap[k]; });
  tf.verin.actif = false;
  for (var cle in tf.rampes) tf.rampes[cle].actif = false;
  tf.qs = false;     // réessayé au premier pas
  tf.dtCfl = 1e-6;
  tf.limite = false;
  _tfMajAmortissement();
  tf.needsRedraw = true;
}

function _tfMajLettre(L, m) {
  L.V = m.V; L.P = m.Pmoy; L.T = m.Tmoy; L.S = tfEntropie();
  L.snap = _tfInstantane(L.snap);
}

// ── Journal ──

// Repart de l'état actuel, lettre A (Réinitialiser)
function tfEtapesEffacer() {
  var A = { lettre: 'A' };
  _tfMajLettre(A, tfMesures());
  tfEtapes.liste = [];
  tfEtapes.etats = [A];
  tfEtapes.bilanA = tfBilan();
  tfEtapes.suivie = 0;
  tfEtapes.sel = -1;
  tfEtapes.selEtat = -1;
  tfEtapes.version++;
}

// Ouvre une étape (desc : texte du journal). Une étape encore sans arrivée
// est close comme interrompue ; la nouvelle part alors d'un état hors
// équilibre.
function tfEtapeNouvelle(desc) {
  var E = tfEtapes, prec = E.liste[E.liste.length - 1];
  var depart = E.suivie;
  if (prec && prec.statut === 'en cours') { prec.statut = 'interrompue'; depart = null; }
  E.liste.push({
    titre: desc.titre, detail: desc.detail, man: desc.man || null, nonDef: false,
    couleur: TF_COUL_ETAPES[E.liste.length % TF_COUL_ETAPES.length],
    depart: depart, arrivee: null, statut: 'en cours',
    bilan0: tfBilan()     // compteurs au départ (section Bilan)
  });
  E.suivie = null;
  E.version++;
}

// Retour à un état déjà vu : à 0,5 % près sur V et P, 0,5 K près sur T
// (assez large pour fermer un cycle à la main)
var TF_RETOUR_VP = 0.005, TF_RETOUR_T = 0.5;

// Lettre déjà vue (pas un retour) dont l'état est celui des mesures, la
// plus proche ; -1 sinon. Le départ de l'étape est exclu : y revenir en une
// étape, c'est n'avoir rien fait (ou si peu qu'on veut une lettre).
function _tfEtatDejaVu(m, depart) {
  var E = tfEtapes, exclu = depart === null ? -1 : E.etats[depart].retour !== undefined ? E.etats[depart].retour : depart;
  var best = -1, dBest = Infinity;
  for (var i = 0; i < E.etats.length; i++) {
    var L = E.etats[i];
    if (L.retour !== undefined || i === exclu) continue;
    var dV = Math.abs(m.V - L.V) / L.V, dP = Math.abs(m.Pmoy - L.P) / L.P, dT = Math.abs(m.Tmoy - L.T);
    if (dV > TF_RETOUR_VP || dP > TF_RETOUR_VP || dT > TF_RETOUR_T) continue;
    var d = dV / TF_RETOUR_VP + dP / TF_RETOUR_VP + dT / TF_RETOUR_T;
    if (d < dBest) { dBest = d; best = i; }
  }
  return best;
}

// Lettre d'un nouvel état : la suivante, sans compter les retours
function _tfLettreSuivante() {
  var n = 0;
  tfEtapes.etats.forEach(function (L) { if (L.retour === undefined) n++; });
  return _tfLettre(n);
}

// Étape k arrivée sur un état déjà vu : le cycle commence à la dernière
// étape partie de cette lettre ({debut, fin} : indices d'étapes), null sinon
function _tfCycleFerme(k) {
  var E = tfEtapes, et = E.liste[k], L = E.etats[et.arrivee];
  if (L.retour === undefined) return null;
  for (var s = k; s >= 0; s--) {
    var d = E.liste[s].depart;
    if (d !== null && E.etats[d].lettre === L.lettre) return { debut: s, fin: k };
  }
  return null;
}

// Lettres d'un cycle : A → B → C → A (✕ : étape interrompue)
function tfEtapesLettresCycle(c) {
  var E = tfEtapes, t = [E.etats[E.liste[c.debut].depart].lettre];
  for (var k = c.debut; k <= c.fin; k++) {
    var a = E.liste[k].arrivee;
    t.push(a !== null ? E.etats[a].lettre : '✕');
  }
  return t.join(' → ');
}

// Cycle dont fait le bilan la section Bilan : le dernier qui contient
// l'étape sélectionnée, ou le dernier fermé ; null sinon
function tfEtapesCycle() {
  var E = tfEtapes, c = null;
  for (var k = 0; k < E.liste.length; k++) {
    var ck = E.liste[k].cycle;
    if (!ck) continue;
    if (E.sel < 0 || (E.sel >= ck.debut && E.sel <= ck.fin)) c = ck;
  }
  return c;
}

// Appelé à chaque échantillon des graphes (même chrono figé), avec les
// mesures : arrivée de l'étape en cours, suivi de la dernière lettre
function tfEtapesSuivre(m) {
  var E = tfEtapes, et = E.liste[E.liste.length - 1];
  if (et && et.statut === 'en cours' && !(m.Pdef && m.Tdef) && !et.nonDef) { et.nonDef = true; E.version++; }
  // Températures des sources au contact pendant l'étape (borne de Carnot
  // d'un cycle)
  if (et && et.statut === 'en cours' && tf.fond !== 'isolant') {
    et.TsMin = Math.min(et.TsMin === undefined ? Infinity : et.TsMin, tf.Text);
    et.TsMax = Math.max(et.TsMax === undefined ? -Infinity : et.TsMax, tf.Text);
  }
  if (!m.equilibre || !E.etats.length) return;
  if (et && et.statut === 'en cours' && !tfEnCours()) {
    var D = et.depart !== null ? E.etats[et.depart] : null;
    // Rien n'a changé (piston tenu alors qu'il était immobile, libéré alors
    // que le gaz l'équilibrait…) : l'étape est retirée du journal. Une
    // charge ou une pression de l'air changée la garde : un grain de sable
    // peut déplacer l'état de moins que ces seuils.
    if (D && Math.abs(m.V - D.V) < 1e-4 * D.V && Math.abs(m.Pmoy - D.P) < 1e-4 * D.P
          && Math.abs(m.Tmoy - D.T) < 0.01
          && Math.abs(tf.masse - D.snap.masse) < 1e-9 && Math.abs(tf.Pair - D.snap.Pair) < 1e-6) {
      E.liste.pop();
      tfGraphRetirerEtape(E.liste.length + 1);
      E.suivie = et.depart;
      E.version++;
      return;
    }
    var L = {}, j = _tfEtatDejaVu(m, et.depart);
    if (j >= 0) { L.lettre = E.etats[j].lettre; L.retour = j; }
    else L.lettre = _tfLettreSuivante();
    E.etats.push(L);
    et.arrivee = E.etats.length - 1;
    et.statut = 'arrivee';
    et.bilan1 = tfBilan();
    et.cycle = _tfCycleFerme(E.liste.length - 1);
    E.suivie = et.arrivee;
    E.version++;
  }
  if (E.suivie !== null) _tfMajLettre(E.etats[E.suivie], m);
}

// Revient à l'état d'une lettre : le système, les graphes et le journal
// reprennent tels qu'ils étaient alors (les étapes suivantes sont oubliées)
function tfEtapesRevenir(i) {
  var E = tfEtapes, L = E.etats[i];
  if (!L) return;
  _tfRestaurerInstantane(L.snap);
  var n = 0;
  for (var k = 0; k < E.liste.length; k++) if (E.liste[k].arrivee === i) n = k + 1;
  E.liste.length = n;
  E.etats.length = i + 1;
  E.suivie = i;
  if (E.sel >= n) E.sel = -1;
  if (E.selEtat > i) E.selEtat = -1;
  E.version++;
  tfGraphRevenir(L.snap.t, n);
}

// Trait de la frise : l'étape mise en évidence sur le diagramme, et dont la
// section Bilan fait le bilan (un second clic la désélectionne)
function tfEtapesSelectionner(k) {
  tfEtapes.sel = tfEtapes.sel === k ? -1 : k;
  tfEtapes.version++;
  tfGraph.sale = true;
}

// Point de la frise : les courbes de référence passent par cet état
function tfEtapesSelectionnerEtat(i) {
  tfEtapes.selEtat = tfEtapes.selEtat === i ? -1 : i;
  tfEtapes.version++;
  tfGraph.sale = true;
}

// État par lequel passent les courbes de référence : le point sélectionné ;
// null : départ de l'étape en cours
function tfEtapesEtatRef() {
  var E = tfEtapes;
  return E.selEtat >= 0 && E.etats[E.selEtat] ? E.etats[E.selEtat] : null;
}

// Rouvre la dernière étape, arrivée (pas à pas : les clics successifs
// forment une seule étape, même si le gaz a atteint l'équilibre entre deux)
// : sa lettre d'arrivée est retirée, elle sera reposée au prochain
// équilibre
function tfEtapeRouvrir() {
  var E = tfEtapes, et = E.liste[E.liste.length - 1];
  if (!et || et.statut !== 'arrivee') return;
  if (et.arrivee === E.etats.length - 1) E.etats.pop();
  if (E.selEtat >= E.etats.length) E.selEtat = -1;
  et.arrivee = null;
  et.bilan1 = null;
  et.cycle = null;
  et.statut = 'en cours';
  E.suivie = null;
  E.version++;
}

// État auquel ramène « Annuler la dernière étape » (null : rien à annuler) :
// départ de la dernière étape, ou, si elle partait d'un état hors
// équilibre, la dernière lettre qui la précède
function tfEtapesEtatAnnuler() {
  var E = tfEtapes, et = E.liste[E.liste.length - 1];
  if (!et) return null;
  if (et.depart !== null) return et.depart;
  return et.arrivee !== null ? et.arrivee - 1 : E.etats.length - 1;
}
