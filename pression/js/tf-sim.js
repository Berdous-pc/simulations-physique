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
//  Deux familles de transformations (PLAN_TRANSFORMATIONS.md §2.3) :
//    - pression imposée : piston pesant, libre, surmonté de l'atmosphère,
//      sur lequel on pose une masse ;
//    - volume imposé : un vérin mène le piston à une hauteur visée en une
//      durée τ ; le poids et l'atmosphère sont repris par le vérin.
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
var TF_MASSES   = [10, 20, 40];                             // kg
var TF_VITESSES = [1 / 5000, 1 / 1000, 1 / 100, 0.1, 1, 5, 20];

// ── Vérin (famille à volume imposé, PLAN §2.7) ──
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

  // Famille de transformations : 'pression' (masse posée) ou 'volume' (vérin)
  famille : 'pression',

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

  // Piston (pression imposée)
  masse        : 0,      // kg posés sur le plateau
  masseChoisie : 20,     // kg, choix du sélecteur
  loquet       : true,   // piston bloqué
  bAmort       : 0,      // kg·s⁻¹, recalculé à chaque sous-pas

  // Vérin (volume imposé) : mouvement de zDep à zArr, commencé à t0, de
  // durée tau. zAller garde le départ du dernier Lancer, pour Retour.
  verin  : { actif: false, zDep: 0, zArr: 0, t0: 0, tau: 0.1, zAller: 0 },
  hVisee : 0.15,         // m, choix du curseur Hauteur visée
  tau    : 0.1,          // s, choix du curseur Durée
  Wop    : 0,            // J, travail reçu par le gaz de la part du vérin

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
// (famille à pression imposée)
function tfPext() {
  return TF_P_ATM + (TF_M_PISTON + tf.masse) * TF_G / TF_S;
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
// est libre (J). Mené par le vérin, le piston n'en fait pas partie : c'est
// le vérin qui fournit son énergie.
function _tfEc() {
  var uN = tf.u[TF_N];
  var piston = tf.famille === 'pression' ? TF_M_PISTON + tf.masse : 0;
  return _tfEcGaz() + 0.5 * piston * uN * uN;
}

// Énergie totale, diminuée de la chaleur reçue (et du travail du vérin) :
// elle doit rester constante (tests de validation). Pression imposée :
// système {gaz + piston + masse + atmosphère} ; volume imposé : le gaz seul.
function tfEnergieTotale() {
  var zN = tf.z[TF_N];
  var e = _tfU() + _tfEc() - tf.Qrecu;
  if (tf.famille === 'volume') return e - tf.Wop;
  return e + (TF_M_PISTON + tf.masse) * TF_G * zN + TF_P_ATM * TF_S * zN;
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
  // Loquet verrouillé ou vérin arrêté : c'est lui qui assure l'équilibre
  // mécanique du piston
  var piston = tf.famille === 'volume' ? !tf.verin.actif
             : tf.loquet || Math.abs(Pmoy - Pext) / Pext < TF_SEUIL_P;

  return {
    V: V, Pmoy: Pmoy, Pmin: Pmin, Pmax: Pmax,
    Tmoy: Tmoy, Tmin: Tmin, Tmax: Tmax, Pext: Pext, Pface: tfPFace(),
    Pdef: Pdef, Tdef: Tdef,
    equilibre: Pdef && Tdef && repos && piston
  };
}

// ══════════════════════════════════════════════════════════════════════
//  Réinitialisation
// ══════════════════════════════════════════════════════════════════════

// Gaz au repos à T0 sous le piston seul, volume V0 ; loquet verrouillé,
// pas de masse, vérin arrêté. Les réglages (famille, masse choisie, hauteur
// visée, durée, isolation, vitesse, γ) sont conservés. Le gaz part du même
// état dans les deux familles.
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
  tf.verin.actif  = false;
  tf.verin.zAller = h0;
  tf.Wop    = 0;
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

// Famille de transformations : en changer réinitialise l'expérience (le
// piston passe de libre à tenu par le vérin, ou l'inverse).
function tfSetFamille(f) {
  tf.famille = f;
  tfReset();
}

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

// ── Vérin ──
// Durée effective d'une course de zDep à zArr : la durée choisie, allongée
// si besoin pour que la vitesse de pointe 2·|Δz|/τ reste sous TF_V_VERIN_MAX
function tfTauEffectif(zDep, zArr) {
  return Math.max(tf.tau, 2 * Math.abs(zArr - zDep) / TF_V_VERIN_MAX);
}

// Mène le piston de sa position actuelle à zArr, en tfTauEffectif secondes
function _tfLancerVerin(zArr) {
  var v = tf.verin;
  v.zDep  = tf.z[TF_N];
  v.zArr  = zArr;
  v.t0    = tf.t;
  v.tau   = tfTauEffectif(v.zDep, zArr);
  v.actif = Math.abs(zArr - v.zDep) > 1e-6;
  tf.needsRedraw = true;
}

// Lancer : vers la hauteur visée ; le départ est retenu pour Retour
function tfLancerVerin() {
  if (tf.famille !== 'volume' || tf.verin.actif) return;
  tf.verin.zAller = tf.z[TF_N];
  _tfLancerVerin(tf.hVisee);
}

// Retour : même durée, vers le départ du dernier Lancer
function tfRetourVerin() {
  if (tf.famille !== 'volume' || tf.verin.actif) return;
  _tfLancerVerin(tf.verin.zAller);
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

// Avance le temps simulé de dt secondes, en sous-pas limités par la
// condition CFL. Renvoie le temps effectivement simulé (inférieur à dt si
// le plafond de sous-pas est atteint).
function tfAvancer(dt) {
  var reste = dt, n = 0;
  while (reste > 1e-12 && n < TF_SOUS_PAS_MAX) {
    var h = Math.min(reste, tf.dtCfl);
    // Vérin en marche : profil de vitesse suivi finement, et arrivée sur
    // une fin de sous-pas
    if (tf.verin.actif && tf.famille === 'volume') {
      h = Math.min(h, tf.verin.tau / 400);
      var fin = tf.verin.t0 + tf.verin.tau - tf.t;
      if (fin > 1e-12 && fin < h) h = fin;
    }
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
  var volume = tf.famille === 'volume';
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

  // Piston : mené par le vérin (volume imposé), bloqué par le loquet, ou
  // soumis à la pression de la tranche du haut, à l'atmosphère, à son poids
  // et à l'amortissement (pression imposée)
  var chaleur = 0;   // J dissipés à rendre au gaz
  var uAvant = u[N];
  if (volume) {
    u[N] = tf.verin.actif ? (_tfZVerin(tf.t + dt) - z[N]) / dt : 0;
  } else if (tf.loquet) {
    u[N] = 0;
  } else {
    var M = TF_M_PISTON + tf.masse;
    var F = S * (P[N - 1] + q[N - 1] - TF_P_ATM) - M * TF_G - tf.bAmort * u[N];
    u[N] += dt * F / (M + mTr / 2);
    chaleur += tf.bAmort * u[N] * u[N] * dt;
  }

  // 3. Positions
  for (i = 1; i <= N; i++) z[i] += u[i] * dt;

  // Butées du piston libre : choc mou, l'énergie cinétique perdue passe au
  // gaz (le vérin, lui, reste dans la course permise)
  if (!volume && ((z[N] > TF_H_CYL && u[N] > 0) || (z[N] < TF_Z_BUTEE && u[N] < 0))) {
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
  // Travail du vérin : celui que la tranche du haut reçoit par la face du
  // piston, avec la même pression moyenne qu'à l'étape 4, plus la variation
  // d'énergie cinétique de la demi-tranche portée par la face
  if (volume) {
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
