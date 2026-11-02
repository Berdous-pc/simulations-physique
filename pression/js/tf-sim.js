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
var TF_P_ATM = 1e5;        // Pa (1 bar : pression de départ ronde, même à l'air libre)
var TF_G     = 9.81;       // m·s⁻²
var TF_M_AIR = 0.029;      // kg·mol⁻¹ — fixe l'inertie du gaz, donc la célérité du son

// ── Dispositif (cf. PLAN_TRANSFORMATIONS.md §1) ──
// Petite section : quelques dizaines de kg suffisent à doubler ou tripler la
// pression, sans quoi les états finaux brutal / réversible seraient confondus.
var TF_S          = 20e-4;   // m² (Ø ≈ 5 cm)
// Piston-membrane, plus léger que le gaz (0,76 g) : un échelon de P_air
// lance un vrai front de compression (avec 1 kg, l'écart de pression dans le
// gaz restait sous 0,1 % : PLAN §10.5). Son poids ne compte plus (5 Pa).
var TF_M_PISTON   = 0.001;   // kg
var TF_T0         = 293;     // K (aussi la source 2 au départ)
var TF_V0         = 0.6e-3;  // m³ (hauteur initiale 30 cm)
var TF_P_LIBRE    = TF_P_ATM + TF_M_PISTON * TF_G / TF_S;   // Pa, piston seul à l'air libre
var TF_P0         = TF_P_LIBRE;   // Pa, pression de départ par défaut (≈ 100 kPa)
var TF_H_CYL      = 0.50;    // m — hauteur intérieure du cylindre (butée haute)
var TF_Z_BUTEE    = 0.02;    // m — butée basse du piston

// ── Discrétisation ──
// 80 tranches : un front de compression (épais de ~3 tranches) reste net
// devant la hauteur du gaz.
var TF_N   = 80;     // nombre de tranches
var TF_CFL = 0.4;    // fraction du pas de temps limite dz/c

// Budget de calcul par appel de tfAvancer() (une image) : au-delà, le temps
// simulé prend du retard sur la vitesse demandée (tf.limite) plutôt que de
// figer la page. Un budget en temps, et non en nombre de sous-pas : une
// machine lente garde ses images, une rapide va plus vite (~1 µs le
// sous-pas ici, 8 ms ≈ 7 000 sous-pas). L'horloge est lue tous les
// TF_BUDGET_LOT sous-pas.
var TF_BUDGET_MS  = 8;
var TF_BUDGET_LOT = 64;
var TF_SEQ_LOT    = 16;

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
// Paroi du fond, entre le gaz et la source : isolante (aucun échange),
// conductrice (le gaz seul limite les échanges, ~15 s) ou peu conductrice. Peu conductrice, un échelon de
// 100 K de la source laisse moins de 0,25 K entre tranches (R_int ≈ 77 K/W
// à 30 cm) : le gaz suit la source quasi statiquement, l'écart de
// température se loge dans la paroi (transformation irréversible), en
// n·Cv/G ≈ 3 h
var TF_G_PAROI = { isolant: 0, peu: 3e-5, cond: 1 };   // W·K⁻¹

// ── Commandes ──
var TF_MASSE_MAX = 40;                                      // kg, masse totale posée
// ×100 à ×10 000 : transformations quasi statiques et réversibles avec un
// fond conducteur (de l'heure à la journée simulées), calculées en mode
// quasi statique, conduction implicite
var TF_VITESSES  = [1 / 5000, 1 / 1000, 1 / 100, 0.1, 1, 5, 20, 100, 500, 2000, 10000];

// Cran le plus proche (en rapport) de la vitesse v. La vitesse adaptée passe
// progressivement d'un cran à l'autre : tf.vitesse prend alors des valeurs
// intermédiaires.
function tfCranVitesse(v) {
  var iMieux = 0;
  for (var i = 1; i < TF_VITESSES.length; i++) {
    if (Math.abs(Math.log(TF_VITESSES[i] / v)) < Math.abs(Math.log(TF_VITESSES[iMieux] / v))) iMieux = i;
  }
  return iMieux;
}

// ── Vérin (piston tenu, PLAN §2.7) ──
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
  // Gaz, et état initial (section Gaz : le changer réinitialise)
  gamma : 1.4,
  T0    : TF_T0,  // K
  V0    : TF_V0,  // m³
  P0    : TF_P0,  // Pa
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
  tenu   : false,
  // Charge posée sur le plateau : blocs (posés d'un coup) et sable (versé
  // grain à grain) ; masse = blocs + sable
  masse  : 0,            // kg
  blocs  : 0,            // kg
  sable  : 0,            // kg
  sableMain : 0,         // kg, part du sable posée à la main (dessin seulement)
  tReposMin : 0,         // s, piston pas au repos avant (tfPasPiston)
  tThMin : 0,            // s, pas d'équilibre thermique avant (tfPasSource)
  bAmort : 0,            // kg·s⁻¹, recalculé à chaque sous-pas

  // Vérin (piston tenu) : mouvement de zDep à zArr, commencé à t0, de durée tau
  verin  : { actif: false, zDep: 0, zArr: 0, t0: 0, tau: 0.1 },
  hVisee : 0.15,         // m, hauteur visée (repère de la scène)
  // Pas à pas automatique (tf-ui.js) : { suivant } ; suivant() fait le pas
  // suivant dès que le gaz est revenu à l'équilibre (tfAvancer)
  seq    : null,
  Wop    : 0,            // J, travail reçu par le gaz de la part du vérin

  // Contraintes extérieures : pression de l'air de l'enceinte au-dessus du
  // piston, température de la source sous le fond, masse posée. Chacune
  // change d'un coup (échelon) ou par un escalier de marches égales jusqu'à
  // la cible (§10.3).
  Pair   : TF_P_ATM,     // Pa
  // Montage : pression par l'air de l'enceinte ('Pair') ou par les masses
  // posées, à l'air libre ('masse') ; en changer réinitialise (tf-ui.js)
  montage: 'Pair',
  Wair   : 0,            // J, travail reçu par le système de la part de l'enceinte
  rampes : {
    Pair  : { actif: false, cible: 0, pas: 0, periode: 1, tProchain: 0, continu: false, lente: false },
    Text  : { actif: false, cible: 0, pas: 0, periode: 1, tProchain: 0, continu: false, lente: false },
    masse : { actif: false, cible: 0, pas: 0, periode: 1, tProchain: 0, continu: false, lente: false }
  },
  // Mode quasi statique (cf. tfAvancer) : pression uniforme, conduction seule
  qs     : false,
  _PairQS: null,         // P_air au sous-pas quasi statique précédent
  // Recalage du bilan d'énergie aux changements discontinus de commande
  // (tenir, libérer, poser une masse), pour que tfEnergieTotale reste continue
  eDecal : 0,            // J

  // Thermique : le cylindre est toujours posé sur l'une des deux sources ;
  // la paroi du fond, isolante ou non, règle les échanges. Text est la
  // température de la source sous le fond ; T1 et T2 gardent celles des
  // deux sources (celle de la source sous le fond suit Text quand on la
  // quitte).
  G      : 0,            // W·K⁻¹, conductance du fond (TF_G_PAROI[paroi])
  paroi  : 'isolant',    // 'isolant', 'cond' ou 'peu' (TF_G_PAROI)
  Text   : 400,          // K, température de la source sous le fond
  fond   : '1',          // source sous le fond : '1' ou '2'
  T1     : 400,          // K
  T2     : TF_T0,        // K

  // Temps et bilans
  t      : 0,            // s simulées
  dtCfl  : 1e-6,         // s, pas limite calculé au sous-pas précédent
  Qrecu  : 0,            // J reçus par le fond
  QsurT  : 0,            // J/K, entropie reçue avec cette chaleur, Σ δQ / T_ext
  Qabs   : 0,            // J, chaleur absorbée : somme des seuls apports positifs (rendement d'un cycle)
  Wgaz   : 0,            // J, travail reçu par le gaz par la face du piston
  limite : false,        // la dernière image a épuisé TF_BUDGET_MS

  // Enregistrement des graphes : fonction appelée dès que tf.t atteint
  // tEchant (tf-graph.js la fournit et fixe l'échéance suivante)
  echantillon : null,
  tEchant     : 0,
  // Suivi entre deux échantillons (moyennes dans le temps, extrêmes) : cf.
  // _tfAccumuler ; null = rien depuis le dernier échantillon
  acc         : null,

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

// Entropie du gaz depuis l'état initial (J/K). Chaque tranche est localement
// à l'équilibre : s_j = n_j·[Cv·ln(T_j/T0) + R·ln(V_j/V_j0)] ; leur somme
// est définie même quand T et P du gaz ne le sont pas (PLAN §10.6).
function tfEntropie() {
  var s = 0, cTr = tf.nTr * tf.Cv, V0Tr = tf.V0 / (TF_S * TF_N);
  for (var j = 0; j < TF_N; j++) {
    s += tf.Cv * Math.log(tf.E[j] / (cTr * tf.T0))
       + TF_R * Math.log((tf.z[j + 1] - tf.z[j]) / V0Tr);
  }
  return tf.nTr * s;
}

// Compteurs du bilan (section Bilan) : énergie interne, travail reçu par le
// gaz, chaleur reçue, entropie échangée avec la source (Σ δQ / T_ext),
// entropie du gaz. Entre deux instants : ΔU = W + Q, et l'entropie créée
// S_c = ΔS − Σ δQ / T_ext.
function tfBilan() {
  return { U: _tfU(), W: tf.Wgaz, Q: tf.Qrecu, Qabs: tf.Qabs, Se: tf.QsurT, S: tfEntropie() };
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
  // Après un pas à la main sur le piston libre, l'oscillation qu'il lance
  // peut rester sous les seuils (grain de 10 g : 0,05 %) : le piston n'est
  // au repos qu'une fois amortie (tfPasPiston)
  var repos = _tfEc() < TF_SEUIL_EC * U && tf.t >= tf.tReposMin;
  // Vérin arrêté ou butée : c'est lui qui assure l'équilibre mécanique du
  // piston
  var butee = tfButee(Pmoy);
  var piston = tf.tenu ? !tf.verin.actif
             : butee !== null || Math.abs(Pmoy - Pext) / Pext < TF_SEUIL_P;
  // Fond conducteur : plus d'échange avec la source. Sans cette condition,
  // un gaz uniforme qui chauffe lentement à travers un fond peu conducteur
  // passait pour « à l'équilibre » (chrono figé, lettre posée trop tôt)
  // Après un pas de la source, l'écart peut rester sous le seuil (0,1 K
  // sous 0,5 K) : équilibre attendu jusqu'à tf.tThMin (tfPasSource)
  var thermique = (tf.G === 0 || Math.abs(Tmoy - tf.Text) < TF_SEUIL_T) && tf.t >= tf.tThMin;
  // Équilibre avec l'extérieur (convention de tracé des diagrammes d'état) :
  // gaz uniforme, pression égale à celle qu'exerce le piston libre (le
  // vérin, lui, exerce celle du gaz), température égale à celle de la
  // source si le fond conduit ; le piston peut bouger (quasi statique)
  var mecaExt = tf.tenu || butee !== null || Math.abs(Pmoy - Pext) / Pext < TF_SEUIL_P;

  return {
    V: V, Pmoy: Pmoy, Pmin: Pmin, Pmax: Pmax,
    Tmoy: Tmoy, Tmin: Tmin, Tmax: Tmax, Pext: Pext, Pface: tfPFace(),
    Pdef: Pdef, Tdef: Tdef, butee: butee,
    ext: Pdef && Tdef && mecaExt && thermique,
    // Équilibre mécanique seul : pression uniforme, gaz et piston au repos
    // (la température peut encore évoluer)
    meca: Pdef && repos && piston,
    equilibre: Pdef && Tdef && repos && piston && thermique
  };
}

// ══════════════════════════════════════════════════════════════════════
//  Réinitialisation
// ══════════════════════════════════════════════════════════════════════

// Bornes de la pression de départ P0 selon le montage : l'air de l'enceinte
// de 20 à 500 kPa ; avec les masses, à l'air libre, du piston seul à
// TF_MASSE_MAX posées
function tfBornesP0(montage) {
  return montage === 'masse' ? [TF_P_LIBRE, TF_P_LIBRE + TF_MASSE_MAX * TF_G / TF_S] : [20e3, 5e5];
}

// Masse posée (kg) qui équilibre P0 à l'air libre, au milligramme près
function tfMasseDepart(P0) {
  return Math.max(0, Math.round((P0 - TF_P_LIBRE) * TF_S / TF_G * 1e6) / 1e6);
}

// Gaz au repos dans l'état A (P0, V0, T0, d'où n), équilibré par l'air de
// l'enceinte ou par des masses posées (un bloc) selon le montage ; piston
// tenu, vérin arrêté, source à T0. Les réglages (isolation, vitesse, γ, état
// A) sont conservés.
function tfReset() {
  tf.Cv  = TF_R / (tf.gamma - 1);
  var P0 = tf.P0;
  tf.n   = P0 * tf.V0 / (TF_R * tf.T0);
  tf.nTr = tf.n / TF_N;
  tf.mTr = tf.n * TF_M_AIR / TF_N;

  var h0 = tf.V0 / TF_S;
  for (var i = 0; i <= TF_N; i++) {
    tf.z[i] = h0 * i / TF_N;
    tf.u[i] = 0;
  }
  for (var j = 0; j < TF_N; j++) {
    tf.E[j] = tf.nTr * tf.Cv * tf.T0;
    tf.P[j] = P0;
    tf.q[j] = 0;
  }

  tf.sable  = tf.sableMain = 0;
  tf.masse  = tf.blocs = tf.montage === 'masse' ? tfMasseDepart(P0) : 0;
  tf.tenu   = false;   // piston libre, en équilibre sous P0 (Pair ou masse ci-dessous)
  tf.verin.actif = false;
  tf.Wop    = 0;
  tf.Pair   = tf.montage === 'masse' ? TF_P_ATM : P0 - TF_M_PISTON * TF_G / TF_S;
  tf.Wair   = 0;
  // L'état initial est un équilibre : sur une source qui n'est pas à T0,
  // la paroi du fond redevient isolante
  if (tf.paroi !== 'isolant' && Math.abs(tf.Text - tf.T0) > 0.01) tfSetParoi('isolant');
  for (var cle in tf.rampes) tf.rampes[cle].actif = false;
  tf.eDecal = 0;
  tf.qs     = false;
  tf.t      = 0;
  tf.Qrecu  = 0;
  tf.QsurT  = 0;
  tf.Qabs   = 0;
  tf.Wgaz   = 0;
  tf.limite = false;
  tf.tReposMin = tf.tThMin = 0;
  tf.seq    = null;
  tf.dtCfl  = 1e-6;
  tf.tEchant = 0;
  tf.acc    = null;
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

// Pose le cylindre sur une source ('1', '2'). La source quittée garde la
// température atteinte (rampe comprise) ; une rampe de la source s'arrête.
function tfSetFond(f) {
  tf['T' + tf.fond] = tf.Text;
  tf.fond = f;
  tf.Text = tf['T' + f];
  tf.rampes.Text.actif = false;
}

// Paroi du fond : isolante ('isolant'), conductrice ('cond') ou peu
// conductrice ('peu'). Isolante, la source n'agit plus : sa rampe s'arrête.
function tfSetParoi(p) {
  tf.paroi = p;
  if (p === 'isolant') tf.rampes.Text.actif = false;
  tfSetIsolation(TF_G_PAROI[p]);
}

// Contact thermique du gaz : 'isolant', ou la source sous le fond
function tfContact() { return tf.paroi === 'isolant' ? 'isolant' : tf.fond; }

// Règle la température d'une source, celle sous le fond comprise
function tfFixerTSource(f, T) {
  if (f === tf.fond) tf.Text = T; else tf['T' + f] = T;
}

// Pas à la main sur le piston libre (grain de sable, pas de P_air) : il
// lance une oscillation d'amplitude égale au saut de pression, qui peut
// rester sous les seuils d'équilibre. Le piston n'est déclaré au repos
// qu'après l'amortissement de cette oscillation au dixième, en
// ln 10 / (TF_AMORT·ω) avec ω = 2π / période, la période valant quatre
// fois le quart de période tfDurees().piston (~4,6 périodes).
function tfPasPiston() {
  var periode = 4 * tfDurees().piston;
  tf.tReposMin = tf.t + Math.log(10) * periode / (2 * Math.PI * TF_AMORT);
}

// Pas à la main de la source : le gaz suit la nouvelle température en
// exponentielle de constante tfDurees().thermique ; l'écart d'un pas de
// 0,1 K reste sous le seuil TF_SEUIL_T. Pas d'équilibre thermique avant
// que l'écart soit tombé au dixième, ln 10 constantes de temps.
function tfPasSource() {
  tf.tThMin = tf.t + Math.log(10) * tfDurees().thermique;
}

// Température d'une source ('1' ou '2')
function tfTSource(f) { return f === tf.fond ? tf.Text : tf['T' + f]; }

// Masse posée portée à `cible` (kg). Ajoutée d'un coup, la différence est un
// bloc ; ajoutée lentement (marche d'un escalier), du sable. Le retrait
// brutal prend d'abord sur les blocs, le retrait lent d'abord sur le sable.
// main : pas à la main ; la part du sable posée à la main (tf.sableMain) ne
// sert qu'au dessin, où ses grains sont plus fins. Un retrait à la main la
// prend d'abord sur elle, tout autre retrait d'abord sur le sable versé.
function _tfChangerMasse(cible, lent, main) {
  cible = Math.max(0, Math.min(TF_MASSE_MAX, cible));
  var d = cible - tf.masse;
  _tfRecaler(function () {
    var sable0 = tf.sable;
    if (d > 0) {
      if (lent) tf.sable += d; else tf.blocs += d;
      if (lent && main) tf.sableMain += d;
    } else {
      var reste = -d;
      var prem = lent ? 'sable' : 'blocs', sec = lent ? 'blocs' : 'sable';
      var a = Math.min(reste, tf[prem]);
      tf[prem] -= a;
      tf[sec] = Math.max(0, tf[sec] - (reste - a));
      var retire = sable0 - tf.sable, verse = sable0 - tf.sableMain;
      tf.sableMain -= main ? Math.min(retire, tf.sableMain) : Math.max(0, retire - verse);
    }
    // Au milligramme près : pas de reliquat d'arrondi dessiné comme du sable
    tf.blocs = Math.round(tf.blocs * 1e6) / 1e6;
    tf.sable = Math.round(tf.sable * 1e6) / 1e6;
    tf.sableMain = Math.min(tf.sable, Math.max(0, Math.round(tf.sableMain * 1e6) / 1e6));
    tf.masse = tf.blocs + tf.sable;
  });
  _tfMajAmortissement();
}

// Fixe une contrainte extérieure : P_air ('Pair'), T_ext ('Text') ou masse
// posée ('masse'). continu : pas d'une rampe continue ; main : pas à la main.
function _tfFixer(cle, valeur, lent, continu, main) {
  // Pression ou masse sur le piston libre : le piston va bouger, retour au
  // calcul complet (la température de la source, elle, n'agit que par le
  // fond) ; sauf rampe continue assez lente pour que le piston la suive sans
  // osciller, que le mode quasi statique sait suivre
  if (cle !== 'Text' && !tf.tenu && !(continu && tf.rampes[cle].lente)) _tfQuitterQS();
  if (cle === 'masse') _tfChangerMasse(valeur, lent, main);
  else tf[cle] = valeur;
  tf.needsRedraw = true;
}

// ── Contraintes extérieures (§10.3, §10.5) ──
// Durée nulle : échelon, la grandeur prend la cible d'un coup. Sinon,
// escalier de n marches égales, n = ⌈|Δ| / pasMax⌉ : une première marche
// tout de suite, puis une toutes les duree / n secondes ; ou, continu
// (boutons Quasi statiquement et Réversiblement), rampe linéaire en duree
// secondes (la masse est alors du sable versé en continu).
function tfAppliquer(cle, cible, duree, pasMax, continu) {
  var r = tf.rampes[cle];
  var d = cible - tf[cle];
  r.actif = false;
  r.continu = false;
  if (duree <= 0 || Math.abs(d) < 1e-9) {
    _tfFixer(cle, cible, false);
    return;
  }
  if (continu) {
    r.continu = true;
    r.depart  = tf[cle];
    r.cible   = cible;
    r.t0      = tf.t;
    r.duree   = duree;
    r.lente   = cle === 'Text' || duree >= TF_QS_RAMPE * _tfTempsMeca(cle, cible);
    r.actif   = true;
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
    if (r.actif && r.continu) {
      var f = Math.min(1, (tf.t - r.t0) / r.duree);
      _tfFixer(cle, r.depart + (r.cible - r.depart) * f, true, true);
      if (f >= 1) r.actif = false;
      continue;
    }
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
  if (tf.verin.actif || tf.seq) return true;
  for (var cle in tf.rampes) if (tf.rampes[cle].actif) return true;
  return false;
}

// Interrompt l'action en cours : l'escalier s'arrête sur sa marche, le
// vérin là où il est (le piston reste tenu)
function tfInterrompre() {
  tf.verin.actif = false;
  tf.seq = null;
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

// Temps mécanique le plus long pendant une rampe de pression ou de masse
// vers cible : période d'oscillation du piston libre (masse la plus grande
// et pression la plus forte de la rampe) ou traversée du gaz par le son. Une
// rampe continue d'au moins TF_QS_RAMPE fois ce temps est suivie sans
// oscillation : le mode quasi statique peut la calculer.
function _tfTempsMeca(cle, cible) {
  var m = tfMesures();
  var M = TF_M_PISTON + Math.max(tf.masse, cle === 'masse' ? cible : 0) + TF_N * tf.mTr / 3;
  var P = Math.max(m.Pext, cle === 'Pair' ? cible + (TF_M_PISTON + tf.masse) * TF_G / TF_S
                                          : tf.Pair + M * TF_G / TF_S);
  var k = tf.gamma * P * TF_S * TF_S / m.V;
  var c = Math.sqrt(tf.gamma * TF_R * m.Tmoy / TF_M_AIR);
  return Math.max(2 * Math.PI * Math.sqrt(M / k), tf.z[TF_N] / c);
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
  // Les deux étapes de la mise en équilibre thermique : conduction dans le
  // gaz (interne) et passage par le fond (paroi). L'écart de température,
  // donc l'entropie créée, se loge dans la plus lente (PLAN §10.5).
  var interne = 4 * L * L / (Math.PI * Math.PI * D);
  var paroi = tf.G > 0 ? tf.n * tf.Cv / tf.G : Infinity;
  return { traversee: L / c, thermique: th, piston: Math.PI / 2 * Math.sqrt(M / k), c: c,
           interne: interne, paroi: paroi };
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
  var tLimite = performance.now() + TF_BUDGET_MS;
  if (!tf.qs) _tfEssayerQS();
  while (reste > 1e-12 && (n % TF_BUDGET_LOT || n === 0 || performance.now() < tLimite)) {
    _tfAvancerRampes();   // peut faire quitter le mode quasi statique
    var h = Math.min(reste, tf.qs ? _tfDtQS() : tf.dtCfl);
    // Pas quasi statique long (gaz presque uniforme) : il s'arrête sur
    // l'échantillon suivant des graphes, qui garderont leur finesse
    if (tf.qs && tf.echantillon && tf.tEchant - tf.t > 1e-12 && tf.tEchant - tf.t < h) h = tf.tEchant - tf.t;
    // Vérin en marche : profil de vitesse suivi finement, et arrivée sur
    // une fin de sous-pas
    if (tf.verin.actif) {
      h = Math.min(h, tf.verin.tau / 400);
      var fin = tf.verin.t0 + tf.verin.tau - tf.t;
      if (fin > 1e-12 && fin < h) h = fin;
    }
    for (var cle in tf.rampes) {
      var r = tf.rampes[cle], av = r.tProchain - tf.t;
      if (r.actif && !r.continu && av > 1e-12 && av < h) h = av;
    }
    if (tf.qs) {
      // Piston libre arrivé en butée : retour au calcul complet, sans
      // avancer le temps
      if (!_tfSousPasQS(h)) { _tfQuitterQS(); continue; }
    } else {
      _tfSousPas(h);
      if (++nEssai >= TF_QS_ESSAI) { nEssai = 0; _tfEssayerQS(); }
    }
    if (tf.echantillon) {
      _tfAccumuler(h);
      if (tf.t >= tf.tEchant) tf.echantillon();
    }
    // Pas à pas automatique : le pas suivant part au retour à l'équilibre
    // (vérifié tous les TF_SEQ_LOT sous-pas, et à chaque sous-pas quasi
    // statique, long)
    if (tf.seq && !tf.verin.actif && (tf.qs || n % TF_SEQ_LOT === 0) && tfMesures().equilibre) tf.seq.suivant();
    reste -= h;
    n++;
  }
  tf.limite = reste > 1e-12;
  tf.needsRedraw = true;
  return dt - reste;
}

// Suivi des grandeurs entre deux échantillons des graphes, après chaque
// sous-pas de durée h : moyennes dans le temps de P, T, V et de la pression
// exercée par le piston, extrêmes de leurs valeurs et de celles des
// tranches. Une oscillation plus rapide que le pas d'échantillonnage (la
// colonne de gaz sous la membrane oscille en ~4 ms) se trace alors comme une
// bande autour de sa moyenne, et non comme une fausse courbe lente
// (repliement : à ×0,1, un point toutes les 4 ms).
function _tfAccumuler(h) {
  var E = tf.E, P = tf.P, cTr = tf.nTr * tf.Cv, j;
  var U = 0, Pmin = Infinity, Pmax = -Infinity, Emin = Infinity, Emax = -Infinity;
  for (j = 0; j < TF_N; j++) {
    U += E[j];
    if (P[j] < Pmin) Pmin = P[j];
    if (P[j] > Pmax) Pmax = P[j];
    if (E[j] < Emin) Emin = E[j];
    if (E[j] > Emax) Emax = E[j];
  }
  var V = tfVolume();
  var Pm = (tf.gamma - 1) * U / V, Tm = U / (tf.n * tf.Cv);
  var Pp = tf.tenu ? tfPFace() : tfPext();
  var a = tf.acc;
  if (!a) {
    a = tf.acc = { dt: 0, P: 0, T: 0, V: 0, Pp: 0,
                   P1: Pm, P2: Pm, T1: Tm, T2: Tm, V1: V, V2: V,
                   Pmin: Pmin, Pmax: Pmax, Tmin: Emin / cTr, Tmax: Emax / cTr,
                   ndP: false, ndT: false, ndExt: false };
  }
  // Critères de tfMesures franchis à un sous-pas de l'intervalle : un
  // échantillon n'est défini que s'ils ont tenu tout du long. Jugés aux
  // seuls instants des échantillons (7 à 9 par pas d'une suite de 50), les
  // pics de l'oscillation du piston (2,5 à 3,6 ‰ entre tranches, seuil
  // 1 ‰) étaient tantôt vus, tantôt manqués : des pas pleins, d'autres
  // pointillés, au gré de la période du piston
  var ndP = (Pmax - Pmin) / Pm >= TF_SEUIL_P;
  var ndT = (Emax - Emin) / cTr >= TF_SEUIL_T;
  if (ndP) a.ndP = true;
  if (ndT) a.ndT = true;
  if (!a.ndExt) {
    var Pext = tfPext();
    var mecaExt = tf.tenu || tfButee(Pm) !== null || Math.abs(Pm - Pext) / Pext < TF_SEUIL_P;
    var thermique = (tf.G === 0 || Math.abs(Tm - tf.Text) < TF_SEUIL_T) && tf.t >= tf.tThMin;
    if (ndP || ndT || !mecaExt || !thermique) a.ndExt = true;
  }
  a.dt += h;
  a.P  += Pm * h;
  a.T  += Tm * h;
  a.V  += V * h;
  a.Pp += Pp * h;
  if (Pm < a.P1) a.P1 = Pm;
  if (Pm > a.P2) a.P2 = Pm;
  if (Tm < a.T1) a.T1 = Tm;
  if (Tm > a.T2) a.T2 = Tm;
  if (V < a.V1) a.V1 = V;
  if (V > a.V2) a.V2 = V;
  if (Pmin < a.Pmin) a.Pmin = Pmin;
  if (Pmax > a.Pmax) a.Pmax = Pmax;
  if (Emin / cTr < a.Tmin) a.Tmin = Emin / cTr;
  if (Emax / cTr > a.Tmax) a.Tmax = Emax / cTr;
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
var TF_QS_RAMPE  = 20;      // rampe continue lente : ≥ 20 temps mécaniques
var TF_QS_DT_BASE = 0.1;    // s (implicite, pour un écart de TF_QS_ECART_REF)
var TF_QS_DT_MAX  = 60;     // s (implicite, gaz presque uniforme : _tfDtQS)
var TF_QS_DT_EXPL_MAX = 0.02;  // s (explicite)

function _tfVerinLent() {
  var v = tf.verin;
  var Tm = _tfU() / (tf.n * tf.Cv);
  var c = Math.sqrt(tf.gamma * TF_R * Tm / TF_M_AIR);
  return v.tau / (Math.max(v.zDep, v.zArr) / c) >= TF_QS_VERIN;
}

function _tfEssayerQS() {
  if (!TF_QS || tf.qs) return;
  if (tf.verin.actif && !_tfVerinLent()) return;
  // Après un pas à la main sur le piston (tfPasPiston), l'oscillation d'un
  // grain reste sous TF_QS_EC : sans cette attente, l'entrée l'arrêtait au
  // premier essai tombé près de la position d'équilibre, tantôt dès le
  // premier passage, tantôt après trois oscillations
  if (tf.t < tf.tReposMin) return;
  if (!tf.tenu) {
    for (var cle in tf.rampes) {
      var r = tf.rampes[cle];
      if (r.actif && cle !== 'Text' && !(r.continu && r.lente)) return;
    }
  }
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
  tf._PairQS = tf.Pair;
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

// Conduction en mode quasi statique : implicite (Euler rétrograde), stable
// quel que soit le pas ; celui-ci n'est plus limité que par la précision,
// une petite fraction de la conduction dans le gaz et du passage par le
// fond (~0,1 s au lieu de ~0,7 ms en explicite). TF_QS_IMPLICITE à false
// redonne le schéma explicite (tests de comparaison).
var TF_QS_IMPLICITE  = true;
var TF_QS_FRAC_INT   = 100;   // pas ≤ τ_int / 100
var TF_QS_FRAC_PAROI = 20;    // pas ≤ (n·Cv/G) / 20
var TF_QS_FRAC_RAMPE = 400;   // pas ≤ durée d'une rampe continue / 400
// Pas adaptatif : les fractions ci-dessus valent pour un écart de
// température de TF_QS_ECART_REF ; plus petit, le pas s'allonge comme
// √(TF_QS_ECART_REF / écart), l'erreur d'un pas (∝ écart·(pas/τ)²) restant
// celle d'un écart de 1 K. Gaz uniforme : le pas n'est plus borné que par
// les rampes, le vérin, les échantillons des graphes et TF_QS_DT_MAX (un
// gaz à l'équilibre ne coûte presque plus rien). Euler rétrograde suit
// exactement le retard d'une tranche sur une source qui varie linéairement :
// une transformation réversible n'y perd rien.
var TF_QS_ECART_REF  = 1;     // K
var TF_QS_ALLONGE    = 1000;  // allongement au plus

function _tfAllonge(ecart) {
  return ecart * TF_QS_ALLONGE * TF_QS_ALLONGE <= TF_QS_ECART_REF ? TF_QS_ALLONGE
       : Math.max(1, Math.sqrt(TF_QS_ECART_REF / ecart));
}

function _tfDtQS() {
  var cTr = tf.nTr * tf.Cv, z = tf.z, dt;
  if (TF_QS_IMPLICITE) {
    var E = tf.E, Emin = E[0], Emax = E[0];
    for (var j = 1; j < TF_N; j++) {
      if (E[j] < Emin) Emin = E[j];
      else if (E[j] > Emax) Emax = E[j];
    }
    // Conduction dans le gaz : 4L²/(π²D), D = λ·S·L/(n·Cv)
    var tInt = 4 * z[TF_N] * tf.n * tf.Cv / (Math.PI * Math.PI * TF_LAMBDA * TF_S);
    dt = Math.min(tInt / TF_QS_FRAC_INT, TF_QS_DT_BASE) * _tfAllonge((Emax - Emin) / cTr);
    if (tf.G > 0) {
      dt = Math.min(dt, tf.n * tf.Cv / tf.G / TF_QS_FRAC_PAROI
                        * _tfAllonge(Math.abs(E[0] / cTr - tf.Text)));
    }
    for (var cle in tf.rampes) {
      var r = tf.rampes[cle];
      if (r.actif && r.continu) dt = Math.min(dt, r.duree / TF_QS_FRAC_RAMPE);
    }
    return Math.min(dt, TF_QS_DT_MAX);
  }
  // Explicite : stabilité entre tranches voisines (à volume constant, le cas
  // le plus contraignant) et par le fond
  var dmin = Infinity;
  for (var j = 0; j < TF_N - 1; j++) {
    var d = (z[j + 2] - z[j]) / 2;
    if (d < dmin) dmin = d;
  }
  dt = 0.4 * cTr * dmin / (2 * TF_LAMBDA * TF_S);
  if (tf.G > 0) dt = Math.min(dt, 0.4 * cTr / tf.G);
  return Math.min(dt, TF_QS_DT_EXPL_MAX);
}

// Un sous-pas quasi statique : chaleur échangée (conduction entre tranches,
// fond), puis volumes à pression uniforme. Renvoie false, sans rien
// changer, si le piston libre sortirait de sa course.
function _tfSousPasQS(dt) {
  var N = TF_N, E = tf.E, z = tf.z, T = tf._T, j;
  var cTr = tf.nTr * tf.Cv;
  var Q = _tfQS_Q || (_tfQS_Q = new Float64Array(TF_N));
  var Qfond;
  for (j = 0; j < N; j++) T[j] = E[j] / cTr;
  if (TF_QS_IMPLICITE) {
    Qfond = _tfConductionImplicite(dt, Q);
  } else {
    for (j = 0; j < N; j++) Q[j] = 0;
    var kc = TF_LAMBDA * TF_S * dt * 2;
    for (j = 0; j < N - 1; j++) {
      var flux = kc * (T[j] - T[j + 1]) / (z[j + 2] - z[j]);
      Q[j]     -= flux;
      Q[j + 1] += flux;
    }
    Qfond = tf.G > 0 ? tf.G * (tf.Text - T[0]) * dt : 0;
    Q[0] += Qfond;
  }
  var Vc = tf.tenu ? TF_S * (tf.verin.actif ? _tfZVerin(tf.t + dt) : z[N]) : null;
  if (!_tfQSAppliquer(Q, Vc)) return false;
  tf.Qrecu += Qfond;
  if (Qfond > 0) tf.Qabs += Qfond;
  if (Qfond !== 0) tf.QsurT += Qfond / tf.Text;
  tf.t += dt;
  if (tf.verin.actif && tf.t >= tf.verin.t0 + tf.verin.tau - 1e-12) tf.verin.actif = false;
  return true;
}
var _tfQS_Q = null;

// Conduction implicite sur dt : températures finales T' solutions de
//   C·(T'_j − T_j) = dt·[k_{j−1}·(T'_{j−1} − T'_j) + k_j·(T'_{j+1} − T'_j)]
//                    (+ dt·G·(T_ext − T'_0) pour la tranche du fond),
// système tridiagonal résolu par l'algorithme de Thomas. C est la capacité
// d'une tranche à pression constante (n·Cp/N) piston libre, à volume
// constant piston tenu ; k_j = λ·S / (distance des centres). Écrit dans Q la
// chaleur reçue par chaque tranche (leur somme est exactement celle reçue
// par le fond) et renvoie cette dernière. tf._T contient les températures
// de départ.
function _tfConductionImplicite(dt, Q) {
  var N = TF_N, T = tf._T, z = tf.z, j;
  var C = tf.nTr * tf.Cv * (tf.tenu ? 1 : tf.gamma);
  var cp = _tfQS_cp || (_tfQS_cp = new Float64Array(TF_N));
  var dp = _tfQS_dp || (_tfQS_dp = new Float64Array(TF_N));
  var kPrec = 0, k, a, b, c, d, m;
  for (j = 0; j < N; j++) {
    k = j < N - 1 ? dt * TF_LAMBDA * TF_S * 2 / (z[j + 2] - z[j]) : 0;
    a = -kPrec; c = -k;
    b = C + kPrec + k;
    d = C * T[j];
    if (j === 0 && tf.G > 0) { b += dt * tf.G; d += dt * tf.G * tf.Text; }
    m = j > 0 ? b - a * cp[j - 1] : b;
    cp[j] = c / m;
    dp[j] = (j > 0 ? d - a * dp[j - 1] : d) / m;
    kPrec = k;
  }
  var Tn = dp[N - 1];
  Q[N - 1] = C * (Tn - T[N - 1]);
  var T0n = Tn;
  for (j = N - 2; j >= 0; j--) {
    Tn = dp[j] - cp[j] * Tn;
    Q[j] = C * (Tn - T[j]);
    T0n = Tn;
  }
  return tf.G > 0 ? dt * tf.G * (tf.Text - T0n) : 0;
}
var _tfQS_cp = null, _tfQS_dp = null;

// Ajoute la chaleur Q[j] à chaque tranche et place les interfaces à
// pression uniforme.
//   - Piston libre (Vc null) : pression P_ext. Si P_ext a changé depuis le
//     sous-pas précédent (rampe continue), chaque tranche est d'abord
//     comprimée ou détendue de façon adiabatique jusqu'à elle
//     (E ∝ P^((γ−1)/γ) à entropie fixée) ; puis elle reçoit sa chaleur à
//     pression constante (dE = dQ/γ, le reste pousse le piston). Travail de
//     l'air de l'enceinte compté avec la moyenne de P_air sur le sous-pas.
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
    var fad = P[0] > 0 && P[0] !== Pc ? Math.pow(Pc / P[0], g1 / g) : 1;
    var tot = 0;
    for (j = 0; j < N; j++) {
      Ef[j] = E[j] * fad + Q[j] / g;
      V[j] = g1 * Ef[j] / Pc;
      tot += V[j];
    }
    var zN = tot / S;
    if (zN > TF_H_CYL || zN < TF_Z_BUTEE) return false;
    var PairPrec = tf._PairQS === null ? tf.Pair : tf._PairQS;
    tf.Wair -= 0.5 * (tf.Pair + PairPrec) * S * (zN - z[N]);
    tf._PairQS = tf.Pair;
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
  // Travail reçu par le gaz : variation d'énergie interne moins la chaleur
  // apportée
  var dW = 0;
  for (j = 0; j < N; j++) dW += Ef[j] - E[j] - Q[j];
  tf.Wgaz += dW;
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
  // gaz (le vérin, lui, reste dans la course permise). Elle remplace la
  // chaleur d'amortissement du sous-pas, calculée avec une vitesse que le
  // piston n'a pas eue : en butée, celle-ci chauffait le gaz sans cause.
  if (!tenu && ((z[N] > TF_H_CYL && u[N] > 0) || (z[N] < TF_Z_BUTEE && u[N] < 0))) {
    chaleur = 0.5 * (TF_M_PISTON + tf.masse + mTr / 2) * uAvant * uAvant;
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
  // Travail reçu par le gaz : celui que la tranche du haut reçoit par la
  // face du piston, avec la même pression moyenne qu'à l'étape 4, plus la
  // variation d'énergie cinétique de la demi-tranche portée par la face ;
  // piston libre, la chaleur dissipée par son amortissement (frottement
  // rendu au gaz, étape 5) en fait partie. Piston tenu, c'est le travail du
  // vérin.
  var Ptop = 0.5 * P[N - 1] + q[N - 1]
           + 0.5 * g1 * E[N - 1] / (S * (z[N] - z[N - 1]));
  var dWface = -Ptop * S * u[N] * dt + 0.25 * mTr * (u[N] * u[N] - uAvant * uAvant);
  tf.Wgaz += dWface + chaleur;
  if (tenu) tf.Wop += dWface;

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
    if (Q > 0) tf.Qabs += Q;
    tf.QsurT += Q / tf.Text;
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
