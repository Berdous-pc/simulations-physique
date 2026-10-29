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
  liste   : [],     // {desc, couleur, depart, arrivee (indices de lettres ou null), statut}
  etats   : [],     // lettres : {lettre, V, P, T, S, snap}
  suivie  : null,   // lettre mise à jour tant que dure l'équilibre
  sel     : -1,     // étape mise en évidence sur le diagramme (-1 : aucune)
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
var _TF_SNAP_SCALAIRES = ['tenu', 'masse', 'blocs', 'sable', 'Pair', 'Text', 'Wop', 'Wair',
                          'Qrecu', 'QsurT', 'Wgaz', 'eDecal', 't'];

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
    desc: desc,
    couleur: TF_COUL_ETAPES[E.liste.length % TF_COUL_ETAPES.length],
    depart: depart, arrivee: null, statut: 'en cours',
    bilan0: tfBilan()     // compteurs au départ (section Bilan)
  });
  E.suivie = null;
  E.version++;
}

// Appelé à chaque échantillon des graphes (même chrono figé), avec les
// mesures : arrivée de l'étape en cours, suivi de la dernière lettre
function tfEtapesSuivre(m) {
  var E = tfEtapes, et = E.liste[E.liste.length - 1];
  if (!m.equilibre || !E.etats.length) return;
  if (et && et.statut === 'en cours' && !tfEnCours()) {
    var D = et.depart !== null ? E.etats[et.depart] : null;
    // Rien n'a changé (piston tenu alors qu'il était immobile, libéré alors
    // que le gaz l'équilibrait…) : l'étape est retirée du journal
    if (D && Math.abs(m.V - D.V) < 1e-4 * D.V && Math.abs(m.Pmoy - D.P) < 1e-4 * D.P
          && Math.abs(m.Tmoy - D.T) < 0.01) {
      E.liste.pop();
      tfGraphRetirerEtape(E.liste.length + 1);
      E.suivie = et.depart;
      E.version++;
      return;
    }
    var L = { lettre: _tfLettre(E.etats.length) };
    E.etats.push(L);
    et.arrivee = E.etats.length - 1;
    et.statut = 'arrivee';
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
  E.version++;
  tfGraphRevenir(L.snap.t, n);
}

function tfEtapesSelectionner(k) {
  tfEtapes.sel = tfEtapes.sel === k ? -1 : k;
  tfEtapes.version++;
  tfGraph.sale = true;
}
