// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  tf-sim.js — Onglet Transformations : état et moteur physique
//  Chargé après sim.js et recipient.js (onglet Pression), avant tf-scene.js.
//
//  Modèle : gaz parfait découpé en TF_N tranches horizontales de même masse
//  (description lagrangienne 1D), sous un piston. Chaque tranche porte son
//  énergie interne, donc sa pression et sa température : hors équilibre, le
//  gaz n'a pas UNE pression ni UNE température.
//
//  Le piston est tenu ou libre, et passe de l'un à l'autre à tout moment
//  (PLAN_TRANSFORMATIONS.md §10.2) :
//    - libre : piston pesant, chargé de masses, sous l'air de l'enceinte ;
//    - tenu : la pince du vérin le maintient, ou le mène à une hauteur visée
//      en une durée τ ; le poids et l'air de l'enceinte sont repris par elle.
//
//  Tout est en unités SI (m, kg, s, Pa, J, K) ; le temps est le temps
//  simulé. Tous les noms globaux portent le préfixe tf / TF_ : les scripts
//  du site partagent le scope global, et l'onglet Pression occupe déjà
//  sim, canvas, resize, loop, init…
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ══════════════════════════════════════════════════════════════════════
//  Constantes
// ══════════════════════════════════════════════════════════════════════

var TF_R     = 8.314;      // J·K⁻¹·mol⁻¹
var TF_P_ATM = 101325;     // Pa
var TF_G     = 9.81;       // m·s⁻²
var TF_M_AIR = 0.029;      // kg·mol⁻¹ — fixe l'inertie du gaz, donc la célérité du son

// ── Dispositif (cf. PLAN_TRANSFORMATIONS.md §1) ──
// Petite section : quelques dizaines de kg suffisent à doubler ou tripler la
// pression, sans quoi les états finaux brutal / réversible seraient confondus.
var TF_S          = 20e-4;   // m² (Ø ≈ 5 cm)
var TF_M_PISTON   = 1;       // kg
var TF_T0         = 293.15;  // K
var TF_V0         = 0.6e-3;  // m³ (hauteur initiale 30 cm)
var TF_H_CYL      = 0.50;    // m — hauteur intérieure du cylindre (butée haute)
var TF_Z_BUTEE    = 0.02;    // m — butée basse du piston

// ── Discrétisation ──
// 80 tranches : un front de compression (épais de ~3 tranches) reste net
// devant la hauteur du gaz.
var TF_N   = 80;     // nombre de tranches
var TF_CFL = 0.4;    // fraction du pas de temps limite dz/c

// Plafond de sous-pas par appel de tfAvancer() (une image) : au-delà, le
// temps simulé prend du retard sur la vitesse demandée (tf.limite) plutôt
// que de figer la page. 80 tranches × 12 000 sous-pas ≈ 10 ms de calcul.
var TF_SOUS_PAS_MAX = 12000;

// ── Dissipation ──
// Viscosité des tranches, q = −cl·ρ·c·Δu + cq·ρ·Δu² (le terme quadratique
// n'agit qu'en compression, Δu < 0) : amortit les ondes et donne aux fronts
// raides (vérin rapide) une épaisseur de quelques tranches au lieu
// d'oscillations numériques. cl = 0,5 plutôt que 0,15 : énergie mieux
// conservée sur les chocs forts (2·10⁻³ contre 4·10⁻³ à 400 m/s).
var TF_CL = 0.5;
var TF_CQ = 2;
// Amortissement du piston, en fraction de l'amortissement critique. Il
// représente les pertes réelles (échanges thermiques avec les parois pendant
// les oscillations, frottements) : ~5 oscillations visibles. La chaleur
// dissipée est rendue au gaz, si bien que l'état final est celui du cours,
// n·Cv·(Tf − Ti) = −P_ext·(Vf − Vi), quel que soit ce coefficient.
var TF_AMORT = 0.08;

// ── Thermique ──
// Conductivité effective du gaz (englobe la convection, non modélisée) :
// mise en équilibre en ~15 s au lieu d'une demi-heure par conduction pure.
var TF_LAMBDA = 2.2;   // W·m⁻¹·K⁻¹
// Crans du curseur Isolation : conductance du fond, en W·K⁻¹
// (0 = calorifugé ; au dernier cran, le fond ne limite plus les échanges).
var TF_ISOLATIONS = [0, 0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1];

// ── Commandes ──
var TF_MASSE_MAX = 40;                                      // kg, masse totale posée
var TF_VITESSES  = [1 / 5000, 1 / 1000, 1 / 100, 0.1, 1, 5, 20];
// Durées d'un escalier (s) : 0 = échelon (brutal)
var TF_DUREES_ESC = [0, 1, 2, 5, 10, 20, 50, 100, 200, 500];

// ── Vérin (piston tenu, PLAN §2.7) ──
// Durées τ proposées (s), à pas à peu près logarithmiques. Les plus courtes
// donnent un piston plus rapide que le son (choc) ; la limite de la
// modélisation est sa vitesse de pointe, TF_V_VERIN_MAX, qui allonge au
// besoin la durée des longues courses.
var TF_DUREES      = [0.0005, 0.001, 0.002, 0.003, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5,
                      1, 2, 5, 10, 20, 60];
// Vitesse de pointe du vérin (2·Δz/τ), au plus : le piston peut dépasser la
// célérité du son (choc), mais au-delà l'erreur sur l'énergie grandit
// (7·10⁻³ à 700 m/s). Une durée trop courte pour la course est allongée.
var TF_V_VERIN_MAX = 400;    // m/s
var TF_H_VISEE_MIN = 0.05;   // m
var TF_H_VISEE_MAX = 0.50;   // m

// ── Critère « grandeurs définies » (PLAN §2.4) ──
var TF_SEUIL_P  = 1e-3;   // écart relatif de P entre tranches
var TF_SEUIL_T  = 0.5;    // K, écart de T entre tranches
var TF_SEUIL_EC = 1e-4;   // énergie cinétique macroscopique / énergie interne

// ══════════════════════════════════════════════════════════════════════
//  État
// ══════════════════════════════════════════════════════════════════════

var tf = {
  // Gaz
  gamma : 1.4,
  n     : 0,      // mol (calculée au reset)
  nTr   : 0,      // mol par tranche
  mTr   : 0,      // kg par tranche
  Cv    : 0,      // J·K⁻¹·mol⁻¹

  // Tranches : interfaces z[0..N] (z[0] = fond, z[N] = face du piston) et
  // leurs vitesses u (décalées d'un demi-pas, schéma saute-mouton) ; énergie
  // interne E, pression P et viscosité q de chaque tranche.
  z  : new Float64Array(TF_N + 1),
  u  : new Float64Array(TF_N + 1),
  E  : new Float64Array(TF_N),
  P  : new Float64Array(TF_N),
  q  : new Float64Array(TF_N),
  _dz: new Float64Array(TF_N),     // épaisseurs avant déplacement (calcul de dV)
  _T : new Float64Array(TF_N),     // températures (conduction)

  // Piston : tenu par la pince du vérin, ou libre (§10.2)
  tenu   : true,
  // Charge posée sur le plateau : blocs (posés d'un coup) et sable (versé
  // grain à grain) ; masse = blocs + sable
  masse  : 0,            // kg
  blocs  : 0,            // kg
  sable  : 0,            // kg
  bAmort : 0,            // kg·s⁻¹, recalculé à chaque sous-pas

  // Vérin (piston tenu) : mouvement de zDep à zArr, commencé à t0, de durée tau
  verin  : { actif: false, zDep: 0, zArr: 0, t0: 0, tau: 0.1 },
  hVisee : 0.15,         // m, hauteur visée (repère de la scène)
  Wop    : 0,            // J, travail reçu par le gaz de la part du vérin

  // Contraintes extérieures : pression de l'air de l'enceinte au-dessus du
  // piston, température de la source sous le fond, masse posée. Chacune
  // change d'un coup (échelon) ou par un escalier de marches égales jusqu'à
  // la cible (§10.3).
  Pair   : TF_P_ATM,     // Pa
  Wair   : 0,            // J, travail reçu par le système de la part de l'enceinte
  rampes : {
    Pair  : { actif: false, cible: 0, pas: 0, periode: 1, tProchain: 0 },
    Text  : { actif: false, cible: 0, pas: 0, periode: 1, tProchain: 0 },
    masse : { actif: false, cible: 0, pas: 0, periode: 1, tProchain: 0 }
  },
  // Mode quasi statique (cf. tfAvancer) : pression uniforme, conduction seule
  qs     : false,
  // Recalage du bilan d'énergie aux changements discontinus de commande
  // (tenir, libérer, poser une masse), pour que tfEnergieTotale reste continue
  eDecal : 0,            // J

  // Thermique
  G    : 0,              // W·K⁻¹, conductance du fond
  Text : TF_T0,          // K, température de la source sous le fond

  // Temps et bilans
  t      : 0,            // s simulées
  dtCfl  : 1e-6,         // s, pas limite calculé au sous-pas précédent
  Qrecu  : 0,            // J reçus par le fond
  limite : false,        // la dernière image a atteint TF_SOUS_PAS_MAX

  // Enregistrement des graphes : fonction appelée dès que tf.t atteint
  // tEchant (tf-graph.js la fournit et fixe l'échéance suivante)
  echantillon : null,
  tEchant     : 0,

  // Animation
  paused      : false,
  vitesse     : 1,
  needsRedraw : true
};

// ══════════════════════════════════════════════════════════════════════
//  Grandeurs dérivées
// ══════════════════════════════════════════════════════════════════════

// Pression extérieure exercée sur le gaz à l'équilibre : air de l'enceinte
// + poids (ce qui agit sur le piston libre)
function tfPext() {
  return tf.Pair + (TF_M_PISTON + tf.masse) * TF_G / TF_S;
}

// Pression exercée par le gaz sur la face du piston (Pa), viscosité
// comprise : c'est celle que mesure le vérin. Elle reste définie quand celle
// du gaz ne l'est pas.
function tfPFace() { return tf.P[TF_N - 1] + tf.q[TF_N - 1]; }

function tfVolume() { return TF_S * tf.z[TF_N]; }

// Énergie interne totale (J)
function _tfU() {
  var s = 0;
  for (var j = 0; j < TF_N; j++) s += tf.E[j];
  return s;
}

// Énergie cinétique macroscopique du gaz (J) ; la face du piston porte une
// demi-tranche
function _tfEcGaz() {
  var s = 0;
  for (var i = 1; i < TF_N; i++) s += tf.u[i] * tf.u[i];
  var uN = tf.u[TF_N];
  return 0.5 * tf.mTr * (s + uN * uN / 2);
}

// Énergie cinétique macroscopique : gaz, plus le piston et sa masse quand il
// est libre (J). Tenu, le piston n'en fait pas partie : c'est le vérin qui
// fournit son énergie.
function _tfEc() {
  var uN = tf.u[TF_N];
  var piston = tf.tenu ? 0 : TF_M_PISTON + tf.masse;
  return _tfEcGaz() + 0.5 * piston * uN * uN;
}

// Énergie totale, diminuée de la chaleur reçue et du travail reçu de
// l'extérieur : elle doit rester constante (tests de validation). Piston
// libre : système {gaz + piston + masse}, qui reçoit le travail de l'air de
// l'enceinte ; tenu : le gaz seul, qui reçoit celui du vérin. W_air ne
// varie que piston libre, W_op que piston tenu ; eDecal recale le compte à
// chaque bascule.
function tfEnergieTotale() {
  var e = _tfU() + _tfEc() - tf.Qrecu - tf.Wop - tf.Wair + tf.eDecal;
  if (!tf.tenu) e += (TF_M_PISTON + tf.masse) * TF_G * tf.z[TF_N];
  return e;
}

// Applique un changement discontinu de commande (fn) en gardant le bilan
// d'énergie continu : l'écart est le travail de l'opérateur (masse posée à
// une certaine hauteur, énergie cinétique perdue dans la pince…)
function _tfRecaler(fn) {
  var avant = tfEnergieTotale();
  fn();
  tf.eDecal += avant - tfEnergieTotale();
}

// Piston libre arrêté par une butée qui le retient (gaz trop chaud ou trop
// peu chargé pour la butée haute, l'inverse pour la basse) : 'haute',
// 'basse' ou null
function tfButee(Pmoy) {
  if (tf.tenu) return null;
  var zN = tf.z[TF_N], Pext = tfPext();
  if (zN >= TF_H_CYL - 1e-9 && Pmoy >= Pext) return 'haute';
  if (zN <= TF_Z_BUTEE + 1e-9 && Pmoy <= Pext) return 'basse';
  return null;
}

// Température d'une tranche (K)
function tfTTranche(j) { return tf.E[j] / (tf.nTr * tf.Cv); }

// Mesures : moyennes, extrêmes des tranches et critère d'équilibre (§2.4)
function tfMesures() {
  var g1 = tf.gamma - 1;
  var Pmin = Infinity, Pmax = -Infinity, Tmin = Infinity, Tmax = -Infinity;
  for (var j = 0; j < TF_N; j++) {
    var P = tf.P[j];
    var T = tf.E[j] / (tf.nTr * tf.Cv);
    if (P < Pmin) Pmin = P;
    if (P > Pmax) Pmax = P;
    if (T < Tmin) Tmin = T;
    if (T > Tmax) Tmax = T;
  }
  var U = _tfU();
  var V = tfVolume();
  var Pmoy = g1 * U / V;                // moyenne en volume
  var Tmoy = U / (tf.n * tf.Cv);        // moyenne en masse
  var Pext = tfPext();

  var Pdef = (Pmax - Pmin) / Pmoy < TF_SEUIL_P;
  var Tdef = (Tmax - Tmin) < TF_SEUIL_T;
  var repos = _tfEc() < TF_SEUIL_EC * U;
  // Vérin arrêté ou butée : c'est lui qui assure l'équilibre mécanique du
  // piston
  var butee = tfButee(Pmoy);
  var piston = tf.tenu ? !tf.verin.actif
             : butee !== null || Math.abs(Pmoy - Pext) / Pext < TF_SEUIL_P;

  return {
    V: V, Pmoy: Pmoy, Pmin: Pmin, Pmax: Pmax,
    Tmoy: Tmoy, Tmin: Tmin, Tmax: Tmax, Pext: Pext, Pface: tfPFace(),
    Pdef: Pdef, Tdef: Tdef, butee: butee,
    equilibre: Pdef && Tdef && repos && piston
  };
}

// ══════════════════════════════════════════════════════════════════════
//  Réinitialisation
// ══════════════════════════════════════════════════════════════════════

// Gaz au repos à T0 sous le piston seul, volume V0 ; piston tenu, pas de
// masse, vérin arrêté. Les réglages (isolation, vitesse, γ) sont conservés.
function tfReset() {
  tf.Cv  = TF_R / (tf.gamma - 1);
  var P0 = TF_P_ATM + TF_M_PISTON * TF_G / TF_S;
  tf.n   = P0 * TF_V0 / (TF_R * TF_T0);
  tf.nTr = tf.n / TF_N;
  tf.mTr = tf.n * TF_M_AIR / TF_N;

  var h0 = TF_V0 / TF_S;
  for (var i = 0; i <= TF_N; i++) {
    tf.z[i] = h0 * i / TF_N;
    tf.u[i] = 0;
  }
  for (var j = 0; j < TF_N; j++) {
    tf.E[j] = tf.nTr * tf.Cv * TF_T0;
    tf.P[j] = P0;
    tf.q[j] = 0;
  }

  tf.masse  = tf.blocs = tf.sable = 0;
  tf.tenu   = true;
  tf.verin.actif = false;
  tf.Wop    = 0;
  tf.Pair   = TF_P_ATM;
  tf.Wair   = 0;
  tf.Text   = TF_T0;
  for (var cle in tf.rampes) tf.rampes[cle].actif = false;
  tf.eDecal = 0;
  tf.qs     = false;
  tf.t      = 0;
  tf.Qrecu  = 0;
  tf.limite = false;
  tf.dtCfl  = 1e-6;
  tf.tEchant = 0;
  _tfMajAmortissement();
  tf.needsRedraw = true;
}

// ══════════════════════════════════════════════════════════════════════
//  Commandes
// ══════════════════════════════════════════════════════════════════════

// Tenir (la pince saisit la tige et arrête net le piston) ou libérer le
// piston. Libérer arrête le vérin.
function tfSetTenu(tenir) {
  if (tenir === tf.tenu) return;
  _tfRecaler(function () {
    tf.tenu = tenir;
    if (tenir) tf.u[TF_N] = 0;
    else { tf.verin.actif = false; _tfQuitterQS(); }
  });
  tf.needsRedraw = true;
}

function tfSetIsolation(G) {
  tf.G = G;
  tf.needsRedraw = true;
}

// Masse posée portée à `cible` (kg). Ajoutée d'un coup, la différence est un
// bloc ; ajoutée lentement (marche d'un escalier), du sable. Le retrait
// brutal prend d'abord sur les blocs, le retrait lent d'abord sur le sable.
function _tfChangerMasse(cible, lent) {
  cible = Math.max(0, Math.min(TF_MASSE_MAX, cible));
  var d = cible - tf.masse;
  _tfRecaler(function () {
    if (d > 0) {
      if (lent) tf.sable += d; else tf.blocs += d;
    } else {
      var reste = -d;
      var prem = lent ? 'sable' : 'blocs', sec = lent ? 'blocs' : 'sable';
      var a = Math.min(reste, tf[prem]);
      tf[prem] -= a;
      tf[sec] = Math.max(0, tf[sec] - (reste - a));
    }
    // Au milligramme près : pas de reliquat d'arrondi dessiné comme du sable
    tf.blocs = Math.round(tf.blocs * 1e6) / 1e6;
    tf.sable = Math.round(tf.sable * 1e6) / 1e6;
    tf.masse = tf.blocs + tf.sable;
  });
  _tfMajAmortissement();
}

// Fixe une contrainte extérieure : P_air ('Pair'), T_ext ('Text') ou masse
// posée ('masse')
function _tfFixer(cle, valeur, lent) {
  // Pression ou masse sur le piston libre : le piston va bouger, retour au
  // calcul complet (la température de la source, elle, n'agit que par le fond)
  if (cle !== 'Text' && !tf.tenu) _tfQuitterQS();
  if (cle === 'masse') _tfChangerMasse(valeur, lent);
  else tf[cle] = valeur;
  tf.needsRedraw = true;
}

// ── Contraintes extérieures (§10.3) ──
// Durée nulle : échelon, la grandeur prend la cible d'un coup. Sinon,
// escalier de n marches égales, n = ⌈|Δ| / pasMax⌉ : une première marche
// tout de suite, puis une toutes les duree / n secondes.
function tfAppliquer(cle, cible, duree, pasMax) {
  var r = tf.rampes[cle];
  var d = cible - tf[cle];
  r.actif = false;
  if (duree <= 0 || Math.abs(d) < 1e-9) {
    _tfFixer(cle, cible, false);
    return;
  }
  var n = tfNbMarches(cle, cible, pasMax);
  r.cible     = cible;
  r.pas       = Math.abs(d) / n;
  r.periode   = duree / n;
  r.tProchain = tf.t;
  r.actif     = true;
}

// Nombre de marches d'un escalier vers cible, de hauteur au plus pasMax
function tfNbMarches(cle, cible, pasMax) {
  return Math.max(1, Math.ceil(Math.abs(cible - tf[cle]) / pasMax - 1e-9));
}

// Avant chaque marche, un échantillon des graphes enregistre l'état atteint
// à la fin du palier : un état d'équilibre par marche sur le diagramme PV,
// même si le bref retour hors équilibre tombe entre deux échantillons
// ordinaires (ou n'existe pas, marches plus petites que le seuil).
function _tfAvancerRampes() {
  for (var cle in tf.rampes) {
    var r = tf.rampes[cle];
    if (!r.actif || tf.t < r.tProchain) continue;
    if (tf.echantillon) tf.echantillon(true);
    var d = r.cible - tf[cle];
    if (Math.abs(d) <= r.pas * (1 + 1e-9)) {
      _tfFixer(cle, r.cible, true);
      r.actif = false;
    } else {
      _tfFixer(cle, tf[cle] + (d > 0 ? r.pas : -r.pas), true);
      r.tProchain += r.periode;
    }
  }
}

// ── Vérin ──
// Durée effective d'une course de zDep à zArr : la durée tau, allongée si
// besoin pour que la vitesse de pointe 2·|Δz|/τ reste sous TF_V_VERIN_MAX
function tfTauEffectif(zDep, zArr, tau) {
  return Math.max(tau, 2 * Math.abs(zArr - zDep) / TF_V_VERIN_MAX);
}

// Tient le piston et le mène de sa position actuelle à zArr, en
// tfTauEffectif secondes
function tfLancerVerin(zArr, tau) {
  tfSetTenu(true);
  var v = tf.verin;
  v.zDep  = tf.z[TF_N];
  v.zArr  = zArr;
  v.t0    = tf.t;
  v.tau   = tfTauEffectif(v.zDep, zArr, tau);
  v.actif = Math.abs(zArr - v.zDep) > 1e-6;
  if (v.actif && !_tfVerinLent()) _tfQuitterQS();
  tf.needsRedraw = true;
}

// Une action est-elle en cours (vérin en marche, escalier inachevé) ?
function tfEnCours() {
  if (tf.verin.actif) return true;
  for (var cle in tf.rampes) if (tf.rampes[cle].actif) return true;
  return false;
}

// Interrompt l'action en cours : l'escalier s'arrête sur sa marche, le
// vérin là où il est (le piston reste tenu)
function tfInterrompre() {
  tf.verin.actif = false;
  for (var cle in tf.rampes) tf.rampes[cle].actif = false;
  tf.needsRedraw = true;
}

// Position imposée du piston à l'instant t : profil de vitesse
// u = (Δz/τ)·(1 − cos 2πs), s = (t − t0)/τ, nulle au départ et à l'arrivée.
// La position est calculée exactement (et non en intégrant u) : le piston
// s'arrête pile sur la cible.
function _tfZVerin(t) {
  var v = tf.verin;
  var s = (t - v.t0) / v.tau;
  if (s >= 1) return v.zArr;
  if (s <= 0) return v.zDep;
  return v.zDep + (v.zArr - v.zDep) * (s - Math.sin(2 * Math.PI * s) / (2 * Math.PI));
}

// Durées caractéristiques (s), à la température moyenne :
//   - traversee : traversée du gaz par le son, L/c ;
//   - thermique : mise en équilibre thermique avec l'extérieur, conduction
//     dans le gaz (mode le plus lent d'une couche de hauteur L chauffée par
//     le fond, 4L²/(π²·D)) puis passage par le fond (n·Cv/G) ; infinie si
//     le fond est calorifugé ;
//   - piston : mise en mouvement du piston pesant (quart de période de son
//     oscillation sur le « ressort à gaz »), évaluée au voisinage de
//     l'équilibre visé pour ne pas varier pendant les oscillations.
function tfDurees() {
  var m  = tfMesures();
  var L  = tf.z[TF_N];
  var c  = Math.sqrt(tf.gamma * TF_R * m.Tmoy / TF_M_AIR);
  var D  = TF_LAMBDA * m.V / (tf.n * tf.Cv);   // diffusivité thermique, m²/s
  var th = tf.G > 0 ? 4 * L * L / (Math.PI * Math.PI * D) + tf.n * tf.Cv / tf.G
                    : Infinity;
  var Pe = m.Pext;
  var Ve = tf.n * TF_R * m.Tmoy / Pe;
  var k  = tf.gamma * Pe * TF_S * TF_S / Ve;
  var M  = TF_M_PISTON + tf.masse + TF_N * tf.mTr / 3;
  return { traversee: L / c, thermique: th, piston: Math.PI / 2 * Math.sqrt(M / k), c: c };
}

// ══════════════════════════════════════════════════════════════════════
//  Moteur
// ══════════════════════════════════════════════════════════════════════

// Coefficient d'amortissement du piston : fraction fixe de l'amortissement
// critique 2·√(k·M), où k = γ·P·S²/V est la raideur du « ressort à gaz ».
// Recalculé à chaque sous-pas (U est fourni par le calcul des énergies) :
// le recalculer à chaque image rendait la trajectoire dépendante de la
// durée des images, donc du cran de vitesse.
function _tfMajAmortissement(U) {
  var V = tfVolume();
  if (V <= 0) return;
  if (U === undefined) U = _tfU();
  var Pmoy = (tf.gamma - 1) * U / V;
  var k = tf.gamma * Pmoy * TF_S * TF_S / V;
  var M = TF_M_PISTON + tf.masse;
  tf.bAmort = 2 * TF_AMORT * Math.sqrt(k * M);
}

// Avance le temps simulé de dt secondes, en sous-pas : limités par la
// condition CFL en calcul complet, par la conduction en mode quasi statique.
// Une marche d'escalier tombe toujours au début d'un sous-pas. Renvoie le
// temps effectivement simulé (inférieur à dt si le plafond de sous-pas est
// atteint).
function tfAvancer(dt) {
  var reste = dt, n = 0, nEssai = 0;
  if (!tf.qs) _tfEssayerQS();
  while (reste > 1e-12 && n < TF_SOUS_PAS_MAX) {
    _tfAvancerRampes();   // peut faire quitter le mode quasi statique
    var h = Math.min(reste, tf.qs ? _tfDtQS() : tf.dtCfl);
    // Vérin en marche : profil de vitesse suivi finement, et arrivée sur
    // une fin de sous-pas
    if (tf.verin.actif) {
      h = Math.min(h, tf.verin.tau / 400);
      var fin = tf.verin.t0 + tf.verin.tau - tf.t;
      if (fin > 1e-12 && fin < h) h = fin;
    }
    for (var cle in tf.rampes) {
      var r = tf.rampes[cle], av = r.tProchain - tf.t;
      if (r.actif && av > 1e-12 && av < h) h = av;
    }
    if (tf.qs) {
      // Piston libre arrivé en butée : retour au calcul complet, sans
      // avancer le temps
      if (!_tfSousPasQS(h)) { _tfQuitterQS(); continue; }
    } else {
      _tfSousPas(h);
      if (++nEssai >= TF_QS_ESSAI) { nEssai = 0; _tfEssayerQS(); }
    }
    if (tf.echantillon && tf.t >= tf.tEchant) tf.echantillon();
    reste -= h;
    n++;
  }
  tf.limite = reste > 1e-12;
  tf.needsRedraw = true;
  return dt - reste;
}

// ══════════════════════════════════════════════════════════════════════
//  Mode quasi statique
//  Quand le gaz est au repos mécanique (aucune onde, pression uniforme,
//  piston immobile ou mené lentement par le vérin), le son n'a plus rien à
//  montrer : la pression est tenue uniforme et seule la conduction est
//  suivie, tranche par tranche. Le pas n'est plus limité que par la
//  conduction (~0,7 ms au lieu de ~1 µs) : un échauffement lent tient enfin
//  le cran ×20. Toute action qui dérange la mécanique (marche de pression ou
//  de masse sur le piston libre, piston libéré, vérin rapide, butée) ramène
//  au calcul complet ; il est réessayé tous les TF_QS_ESSAI sous-pas.
// ══════════════════════════════════════════════════════════════════════

// Repos mécanique exigé pour entrer : énergie cinétique macroscopique
// rapportée à l'énergie interne, écarts relatifs de pression entre tranches
// et avec la pression extérieure (piston libre). Le vérin doit être lent :
// τ ≥ TF_QS_VERIN fois la traversée du gaz par le son.
var TF_QS        = true;
var TF_QS_EC     = 1e-7;
var TF_QS_P      = 2e-5;
var TF_QS_VERIN  = 200;
var TF_QS_ESSAI  = 2000;
var TF_QS_DT_MAX = 0.02;    // s

function _tfVerinLent() {
  var v = tf.verin;
  var Tm = _tfU() / (tf.n * tf.Cv);
  var c = Math.sqrt(tf.gamma * TF_R * Tm / TF_M_AIR);
  return v.tau / (Math.max(v.zDep, v.zArr) / c) >= TF_QS_VERIN;
}

function _tfEssayerQS() {
  if (!TF_QS || tf.qs) return;
  if (tf.verin.actif && !_tfVerinLent()) return;
  var U = _tfU();
  if (_tfEc() > TF_QS_EC * U) return;
  var Pmin = Infinity, Pmax = -Infinity;
  for (var j = 0; j < TF_N; j++) {
    if (tf.P[j] < Pmin) Pmin = tf.P[j];
    if (tf.P[j] > Pmax) Pmax = tf.P[j];
  }
  var Pmoy = (tf.gamma - 1) * U / tfVolume();
  if ((Pmax - Pmin) / Pmoy > TF_QS_P) return;
  if (!tf.tenu) {
    if (tfButee(Pmoy)) return;
    var Pext = tfPext();
    if (Math.abs(Pmoy - Pext) / Pext > TF_QS_P) return;
  }
  _tfEntrerQS();
}

// Entrée : l'énergie cinétique résiduelle passe en chaleur, la pression est
// rendue uniforme (et égale à P_ext, piston libre), puis l'écart d'énergie
// de cette mise au repos est rendu au gaz : le bilan reste exact.
function _tfEntrerQS() {
  var e0 = tfEnergieTotale(), j;
  tf.u.fill(0);
  tf.q.fill(0);
  var Q = tf._T;   // tableau de travail
  Q.fill(0);
  tf.qs = true;
  if (!_tfQSAppliquer(Q, tf.tenu ? tfVolume() : null)) { tf.qs = false; return; }
  var d = (e0 - tfEnergieTotale()) / TF_N;
  for (j = 0; j < TF_N; j++) Q[j] = d;
  if (!_tfQSAppliquer(Q, tf.tenu ? tfVolume() : null)) tf.qs = false;
  tf.needsRedraw = true;
}

function _tfQuitterQS() {
  if (!tf.qs) return;
  tf.qs = false;
  tf.dtCfl = 1e-7;   // recalculé au premier sous-pas complet
  _tfMajAmortissement();
}

// Pas de la conduction explicite : stabilité entre tranches voisines (à
// volume constant, le cas le plus contraignant) et par le fond
function _tfDtQS() {
  var cTr = tf.nTr * tf.Cv, dmin = Infinity, z = tf.z;
  for (var j = 0; j < TF_N - 1; j++) {
    var d = (z[j + 2] - z[j]) / 2;
    if (d < dmin) dmin = d;
  }
  var dt = 0.4 * cTr * dmin / (2 * TF_LAMBDA * TF_S);
  if (tf.G > 0) dt = Math.min(dt, 0.4 * cTr / tf.G);
  return Math.min(dt, TF_QS_DT_MAX);
}

// Un sous-pas quasi statique : chaleur échangée (conduction entre tranches,
// fond), puis volumes à pression uniforme. Renvoie false, sans rien
// changer, si le piston libre sortirait de sa course.
function _tfSousPasQS(dt) {
  var N = TF_N, E = tf.E, z = tf.z, T = tf._T, j;
  var cTr = tf.nTr * tf.Cv;
  var Q = _tfQS_Q || (_tfQS_Q = new Float64Array(TF_N));
  for (j = 0; j < N; j++) { T[j] = E[j] / cTr; Q[j] = 0; }
  var kc = TF_LAMBDA * TF_S * dt * 2;
  for (j = 0; j < N - 1; j++) {
    var flux = kc * (T[j] - T[j + 1]) / (z[j + 2] - z[j]);
    Q[j]     -= flux;
    Q[j + 1] += flux;
  }
  var Qfond = tf.G > 0 ? tf.G * (tf.Text - T[0]) * dt : 0;
  Q[0] += Qfond;
  var Vc = tf.tenu ? TF_S * (tf.verin.actif ? _tfZVerin(tf.t + dt) : z[N]) : null;
  if (!_tfQSAppliquer(Q, Vc)) return false;
  tf.Qrecu += Qfond;
  tf.t += dt;
  if (tf.verin.actif && tf.t >= tf.verin.t0 + tf.verin.tau - 1e-12) tf.verin.actif = false;
  return true;
}
var _tfQS_Q = null;

// Ajoute la chaleur Q[j] à chaque tranche et place les interfaces à
// pression uniforme.
//   - Piston libre (Vc null) : pression P_ext. Chaque tranche reçoit sa
//     chaleur à pression constante (dE = dQ/γ, le reste pousse le piston) ;
//     travail de l'air de l'enceinte compté. Exact pour le bilan.
//   - Piston tenu (Vc : volume imposé) : chaleur à volume constant, puis
//     détente ou compression adiabatique de chaque tranche jusqu'à la
//     pression commune P' qui donne le volume total Vc,
//     P'^(1/γ) = Σ V_j·P_j^(1/γ) / Vc ; la variation d'énergie de cette
//     étape est le travail reçu du vérin.
function _tfQSAppliquer(Q, Vc) {
  var N = TF_N, E = tf.E, z = tf.z, P = tf.P, S = TF_S;
  var g = tf.gamma, g1 = g - 1, j;
  var V = _tfQS_V || (_tfQS_V = new Float64Array(TF_N));
  var Pc, Ef = _tfQS_E || (_tfQS_E = new Float64Array(TF_N));
  if (Vc === null) {
    Pc = tfPext();
    var tot = 0;
    for (j = 0; j < N; j++) {
      Ef[j] = E[j] + Q[j] / g;
      V[j] = g1 * Ef[j] / Pc;
      tot += V[j];
    }
    var zN = tot / S;
    if (zN > TF_H_CYL || zN < TF_Z_BUTEE) return false;
    tf.Wair -= tf.Pair * S * (zN - z[N]);
  } else {
    var somme = 0, Eavant = 0, Eapres = 0;
    for (j = 0; j < N; j++) {
      Ef[j] = E[j] + Q[j];
      V[j] = S * (z[j + 1] - z[j]);
      somme += V[j] * Math.pow(g1 * Ef[j] / V[j], 1 / g);
      Eavant += Ef[j];
    }
    Pc = Math.pow(somme / Vc, g);
    for (j = 0; j < N; j++) {
      V[j] *= Math.pow(g1 * Ef[j] / V[j] / Pc, 1 / g);
      Ef[j] = Pc * V[j] / g1;
      Eapres += Ef[j];
    }
    tf.Wop += Eapres - Eavant;
  }
  var zc = 0;
  for (j = 0; j < N; j++) {
    E[j] = Ef[j];
    P[j] = Pc;
    zc += V[j] / S;
    z[j + 1] = zc;
  }
  return true;
}
var _tfQS_V = null, _tfQS_E = null;

// ── Un sous-pas (saute-mouton : vitesses, positions, puis énergies) ──
function _tfSousPas(dt) {
  var N = TF_N, S = TF_S;
  var z = tf.z, u = tf.u, E = tf.E, P = tf.P, q = tf.q, dzA = tf._dz;
  var g = tf.gamma, g1 = g - 1, mTr = tf.mTr;
  var tenu = tf.tenu;
  var j, i;

  // 1. Viscosité artificielle q = −cl·ρ·c·Δu (dissipative dans les deux
  //    sens), et pas limite pour le sous-pas suivant.
  var invDtMin = 0;
  for (j = 0; j < N; j++) {
    var dz  = z[j + 1] - z[j];
    var rho = mTr / (S * dz);
    var c   = Math.sqrt(g * P[j] / rho);
    var du  = u[j + 1] - u[j];
    q[j]   = -TF_CL * rho * c * du + (du < 0 ? TF_CQ * rho * du * du : 0);
    dzA[j] = dz;
    // La viscosité raccourcit aussi le pas stable : vitesse effective
    var inv = (c * (1 + 2 * TF_CL) + 2 * TF_CQ * Math.abs(du)) / dz;
    if (inv > invDtMin) invDtMin = inv;
  }
  tf.dtCfl = TF_CFL / invDtMin;

  // 2. Vitesses des interfaces internes (le fond, u[0], reste immobile)
  var k = dt * S / mTr;
  for (i = 1; i < N; i++) {
    u[i] += k * ((P[i - 1] + q[i - 1]) - (P[i] + q[i]));
  }

  // Piston : tenu (mené par le vérin, ou immobile), ou libre, soumis à la
  // pression de la tranche du haut, à l'air de l'enceinte, à son poids et à
  // l'amortissement
  var chaleur = 0;   // J dissipés à rendre au gaz
  var uAvant = u[N];
  if (tenu) {
    u[N] = tf.verin.actif ? (_tfZVerin(tf.t + dt) - z[N]) / dt : 0;
  } else {
    var M = TF_M_PISTON + tf.masse;
    var F = S * (P[N - 1] + q[N - 1] - tf.Pair) - M * TF_G - tf.bAmort * u[N];
    u[N] += dt * F / (M + mTr / 2);
    chaleur += tf.bAmort * u[N] * u[N] * dt;
  }

  // 3. Positions
  var zAvant = z[N];
  for (i = 1; i <= N; i++) z[i] += u[i] * dt;

  // Butées du piston libre : choc mou, l'énergie cinétique perdue passe au
  // gaz (le vérin, lui, reste dans la course permise)
  if (!tenu && ((z[N] > TF_H_CYL && u[N] > 0) || (z[N] < TF_Z_BUTEE && u[N] < 0))) {
    chaleur += 0.5 * (TF_M_PISTON + tf.masse + mTr / 2) * uAvant * uAvant;
    u[N] = 0;
    z[N] = Math.min(TF_H_CYL, Math.max(TF_Z_BUTEE, z[N]));
  }
  // Travail reçu de l'air de l'enceinte (pression constante sur le sous-pas)
  if (!tenu) tf.Wair -= tf.Pair * S * (z[N] - zAvant);

  // 4. Énergies : dE = −(P̄ + q)·dV, avec P̄ moyenne de P avant et après
  //    (résolue exactement, P_après étant proportionnelle à E_après) : le
  //    travail échangé entre tranches est conservé au second ordre.
  for (j = 0; j < N; j++) {
    var dzN = z[j + 1] - z[j];
    var dV  = S * (dzN - dzA[j]);
    var Vn  = S * dzN;
    E[j] = (E[j] - (0.5 * P[j] + q[j]) * dV) / (1 + 0.5 * g1 * dV / Vn);
  }
  // Travail du vérin : celui que la tranche du haut reçoit par la face du
  // piston, avec la même pression moyenne qu'à l'étape 4, plus la variation
  // d'énergie cinétique de la demi-tranche portée par la face
  if (tenu) {
    var Ptop = 0.5 * P[N - 1] + q[N - 1]
             + 0.5 * g1 * E[N - 1] / (S * (z[N] - z[N - 1]));
    tf.Wop += -Ptop * S * u[N] * dt + 0.25 * mTr * (u[N] * u[N] - uAvant * uAvant);
  }

  // 5. Chaleur : dissipation rendue au gaz, conduction entre tranches,
  //    échange par le fond. La dissipation liée au mouvement du piston est
  //    déposée près de lui (poids ∝ j + 1 : du double de la moyenne sous le
  //    piston à presque rien au fond) : c'est là que le gaz est brassé. Une
  //    compression brutale laisse ainsi une couche chaude sous le piston, qui
  //    s'uniformise ensuite par conduction.
  if (chaleur > 0) {
    var parPoids = chaleur * 2 / (N * (N + 1));
    for (j = 0; j < N; j++) E[j] += parPoids * (j + 1);
  }
  var T = tf._T, cTr = tf.nTr * tf.Cv;
  for (j = 0; j < N; j++) T[j] = E[j] / cTr;
  var kc = TF_LAMBDA * S * dt * 2;
  for (j = 0; j < N - 1; j++) {
    var flux = kc * (T[j] - T[j + 1]) / (z[j + 2] - z[j]);   // distance entre centres
    E[j]     -= flux;
    E[j + 1] += flux;
  }
  if (tf.G > 0) {
    var Q = tf.G * (tf.Text - T[0]) * dt;
    E[0]     += Q;
    tf.Qrecu += Q;
  }

  // 6. Pressions, et amortissement du sous-pas suivant
  var U = 0;
  for (j = 0; j < N; j++) {
    P[j] = g1 * E[j] / (S * (z[j + 1] - z[j]));
    U += E[j];
  }
  _tfMajAmortissement(U);

  tf.t += dt;
  if (tf.verin.actif && tf.t >= tf.verin.t0 + tf.verin.tau - 1e-12) {
    tf.verin.actif = false;
    tf.needsRedraw = true;
  }
}
