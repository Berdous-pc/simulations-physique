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
//  (description lagrangienne 1D), sous un piston pesant sans frottement
//  solide, surmonté de l'atmosphère. Chaque tranche porte son énergie
//  interne, donc sa pression et sa température : hors équilibre, le gaz n'a
//  pas UNE pression ni UNE température.
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
var TF_N   = 30;     // nombre de tranches
var TF_CFL = 0.4;    // fraction du pas de temps limite dz/c

// Plafond de sous-pas par appel de tfAvancer() (une image) : au-delà, le
// temps simulé prend du retard sur la vitesse demandée (tf.limite) plutôt
// que de figer la page. 30 tranches × 30 000 sous-pas ≈ 10 ms de calcul.
var TF_SOUS_PAS_MAX = 30000;

// ── Dissipation ──
// Viscosité artificielle linéaire des tranches : amortit les ondes acoustiques
// (et le bruit de grille) en quelques dizaines d'allers-retours.
var TF_CL = 0.15;
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
var TF_MASSES   = [10, 20, 40];                             // kg
var TF_VITESSES = [1 / 5000, 1 / 1000, 1 / 100, 0.1, 1, 5, 20];

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
  mTr   : 0,      // kg par tranche (inertie)
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

  // Piston
  masse        : 0,      // kg posés sur le plateau
  masseChoisie : 20,     // kg, choix du sélecteur
  loquet       : true,   // piston bloqué
  bAmort       : 0,      // kg·s⁻¹, recalculé à chaque appel de tfAvancer()

  // Thermique
  G    : 0,              // W·K⁻¹, conductance du fond
  Text : TF_T0,          // K, température extérieure

  // Temps et bilans
  t      : 0,            // s simulées
  dtCfl  : 1e-6,         // s, pas limite calculé au sous-pas précédent
  Qrecu  : 0,            // J reçus par le fond
  limite : false,        // la dernière image a atteint TF_SOUS_PAS_MAX

  // Animation
  paused      : false,
  vitesse     : 1,
  needsRedraw : true
};

// ══════════════════════════════════════════════════════════════════════
//  Grandeurs dérivées
// ══════════════════════════════════════════════════════════════════════

// Pression extérieure exercée sur le gaz à l'équilibre : atmosphère + poids
function tfPext() {
  return TF_P_ATM + (TF_M_PISTON + tf.masse) * TF_G / TF_S;
}

function tfVolume() { return TF_S * tf.z[TF_N]; }

// Énergie interne totale (J)
function _tfU() {
  var s = 0;
  for (var j = 0; j < TF_N; j++) s += tf.E[j];
  return s;
}

// Énergie cinétique macroscopique : tranches + piston (J)
function _tfEc() {
  var s = 0;
  for (var i = 1; i < TF_N; i++) s += tf.u[i] * tf.u[i];
  s *= 0.5 * tf.mTr;
  var uN = tf.u[TF_N];
  return s + 0.5 * (TF_M_PISTON + tf.masse + tf.mTr / 2) * uN * uN;
}

// Énergie totale du système {gaz + piston + masse + atmosphère}, diminuée
// de la chaleur reçue : elle doit rester constante (tests de validation).
function tfEnergieTotale() {
  var zN = tf.z[TF_N];
  return _tfU() + _tfEc()
       + (TF_M_PISTON + tf.masse) * TF_G * zN
       + TF_P_ATM * TF_S * zN
       - tf.Qrecu;
}

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
  // Loquet verrouillé : c'est lui qui assure l'équilibre mécanique du piston
  var piston = tf.loquet || Math.abs(Pmoy - Pext) / Pext < TF_SEUIL_P;

  return {
    V: V, Pmoy: Pmoy, Pmin: Pmin, Pmax: Pmax,
    Tmoy: Tmoy, Tmin: Tmin, Tmax: Tmax, Pext: Pext,
    Pdef: Pdef, Tdef: Tdef,
    equilibre: Pdef && Tdef && repos && piston
  };
}

// ══════════════════════════════════════════════════════════════════════
//  Réinitialisation
// ══════════════════════════════════════════════════════════════════════

// Gaz au repos à T0 sous le piston seul, volume V0 ; loquet verrouillé,
// pas de masse. Les réglages (masse choisie, isolation, vitesse, γ) sont
// conservés.
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

  tf.masse  = 0;
  tf.loquet = true;
  tf.t      = 0;
  tf.Qrecu  = 0;
  tf.limite = false;
  tf.dtCfl  = 1e-6;
  _tfMajAmortissement();
  tf.needsRedraw = true;
}

// ══════════════════════════════════════════════════════════════════════
//  Commandes
// ══════════════════════════════════════════════════════════════════════

// Pose (kg > 0) ou retire (kg = 0) la masse. Loquet libéré, l'effet est
// brutal : le poids change d'un coup, le piston est encore immobile.
function tfSetMasse(kg) {
  tf.masse = kg;
  _tfMajAmortissement();
  tf.needsRedraw = true;
}

function tfSetLoquet(verrouille) {
  tf.loquet = verrouille;
  if (verrouille) tf.u[TF_N] = 0;
  tf.needsRedraw = true;
}

function tfSetIsolation(G) {
  tf.G = G;
  tf.needsRedraw = true;
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

// Avance le temps simulé de dt secondes, en sous-pas limités par la
// condition CFL. Renvoie le temps effectivement simulé (inférieur à dt si
// le plafond de sous-pas est atteint).
function tfAvancer(dt) {
  var reste = dt, n = 0;
  while (reste > 1e-12 && n < TF_SOUS_PAS_MAX) {
    var h = Math.min(reste, tf.dtCfl);
    _tfSousPas(h);
    reste -= h;
    n++;
  }
  tf.limite = reste > 1e-12;
  tf.needsRedraw = true;
  return dt - reste;
}

// ── Un sous-pas (saute-mouton : vitesses, positions, puis énergies) ──
function _tfSousPas(dt) {
  var N = TF_N, S = TF_S;
  var z = tf.z, u = tf.u, E = tf.E, P = tf.P, q = tf.q, dzA = tf._dz;
  var g = tf.gamma, g1 = g - 1, mTr = tf.mTr;
  var j, i;

  // 1. Viscosité artificielle q = −cl·ρ·c·Δu (dissipative dans les deux
  //    sens), et pas limite pour le sous-pas suivant.
  var invDtMin = 0;
  for (j = 0; j < N; j++) {
    var dz  = z[j + 1] - z[j];
    var rho = mTr / (S * dz);
    var c   = Math.sqrt(g * P[j] / rho);
    q[j]   = -TF_CL * rho * c * (u[j + 1] - u[j]);
    dzA[j] = dz;
    var inv = c / dz;
    if (inv > invDtMin) invDtMin = inv;
  }
  tf.dtCfl = TF_CFL / invDtMin;

  // 2. Vitesses des interfaces internes (le fond, u[0], reste immobile)
  var k = dt * S / mTr;
  for (i = 1; i < N; i++) {
    u[i] += k * ((P[i - 1] + q[i - 1]) - (P[i] + q[i]));
  }

  // Piston : pression de la tranche du haut, atmosphère, poids, amortissement
  var chaleur = 0;   // J dissipés à rendre au gaz
  if (tf.loquet) {
    u[N] = 0;
  } else {
    var M = TF_M_PISTON + tf.masse;
    var F = S * (P[N - 1] + q[N - 1] - TF_P_ATM) - M * TF_G - tf.bAmort * u[N];
    u[N] += dt * F / (M + mTr / 2);
    chaleur += tf.bAmort * u[N] * u[N] * dt;
  }

  // 3. Positions
  for (i = 1; i <= N; i++) z[i] += u[i] * dt;

  // Butées du piston : choc mou, l'énergie cinétique perdue passe au gaz
  if ((z[N] > TF_H_CYL && u[N] > 0) || (z[N] < TF_Z_BUTEE && u[N] < 0)) {
    chaleur += 0.5 * (TF_M_PISTON + tf.masse + mTr / 2) * u[N] * u[N];
    u[N] = 0;
    z[N] = Math.min(TF_H_CYL, Math.max(TF_Z_BUTEE, z[N]));
  }

  // 4. Énergies : dE = −(P̄ + q)·dV, avec P̄ moyenne de P avant et après
  //    (résolue exactement, P_après étant proportionnelle à E_après) : le
  //    travail échangé entre tranches est conservé au second ordre.
  for (j = 0; j < N; j++) {
    var dzN = z[j + 1] - z[j];
    var dV  = S * (dzN - dzA[j]);
    var Vn  = S * dzN;
    E[j] = (E[j] - (0.5 * P[j] + q[j]) * dV) / (1 + 0.5 * g1 * dV / Vn);
  }

  // 5. Chaleur : dissipation rendue au gaz (répartie, pour ne pas créer de
  //    gradient artificiel), conduction entre tranches, échange par le fond.
  if (chaleur > 0) {
    var parTr = chaleur / N;
    for (j = 0; j < N; j++) E[j] += parTr;
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
}
