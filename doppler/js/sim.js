// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  sim.js — État et modèle de l'onglet Principe (vue de profil, 1D)
//  Chargé en PREMIER. Tout est analytique : la scène entière se déduit
//  de la date t, ce qui permet de parcourir le temps dans les deux sens.
//  L'eau est plate à t = 0 : l'émetteur se met alors à osciller, et l'on suit
//  le front de l'onde (émis à t = 0) et le début du motif 2 (émis à t = T_E).
//  Unités : centimètres, secondes, hertz.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Constantes de la scène ────────────────────────────────────────────
var V_ONDE      = 20;    // célérité de l'onde (cm/s), fixe
var SCENE_L     = 120;   // largeur de la scène (cm)
var X_RECEPTEUR = 108;   // abscisse du récepteur fixe (cm)
var X_E0_APPROCHE = 14; // abscisse de l'émetteur à t = 0 quand il se rapproche : tout à gauche
var D_ELOIGNE  = 1.5;   // quand il s'éloigne, il part à 1,5 λ_E du récepteur (T_E < t₁ : l'ordre des étapes tient)
var MARGE_BORD = 5;     // l'émetteur s'arrête à 5 cm du bord gauche (cm)
var MARGE_R    = 8;     // … ou à 8 cm du récepteur (cm)
var N_RECEP    = 6;     // débuts de motif reçus avant la fin de l'animation (au plus)
var VE_MAX      = 10;    // vitesse maximale de l'émetteur (cm/s) — synchronisé avec index.html
var T_FIN_MARGE = 0.3;   // l'animation se poursuit 0,3 T_E après la dernière réception
// ── État ──────────────────────────────────────────────────────────────
var simD = {
  t: 0,              // date courante (s)
  lecture: false,    // animation en cours
  cible: -1,         // indice de l'instant clé où s'arrêter (-1 : fin de l'animation)
  vitesse: 0.5,      // facteur de vitesse de l'animation
  sens: 1,           // +1 : l'émetteur se rapproche du récepteur ; -1 : il s'éloigne
  vE: 8,             // vitesse de l'émetteur (cm/s), toujours positive
  fE: 1,             // fréquence d'émission (Hz)
  showCotes: true,   // cotes λ_E, λ_R et v_E·T_E sur la scène
  showFrise: true,   // frise du temps sous la scène
  showLiens: false,  // frise : trait reliant chaque émission à sa réception
  showDemo: false    // démonstration écrite sous la scène
};

// ══════════════════════════════════════════════════════════════════════
//  Grandeurs dérivées
// ══════════════════════════════════════════════════════════════════════

function dopTE()      { return 1 / simD.fE; }                        // période d'émission
function dopVEs()     { return simD.sens * simD.vE; }                // vitesse algébrique (+ vers R)
function dopLambda()  { return V_ONDE * dopTE(); }                   // λ_E = c·T_E
function dopLambdaP() { return (V_ONDE - dopVEs()) * dopTE(); }      // λ_R = (c ∓ v_E)·T_E
function dopTR()      { return dopLambdaP() / V_ONDE; }              // période reçue
function dopFR()      { return 1 / dopTR(); }                        // fréquence reçue

// Abscisse de l'émetteur à t = 0 : loin du récepteur quand il s'en rapproche,
// près de lui quand il s'en éloigne, pour que plusieurs motifs soient reçus.
function dopXE0() {
  return simD.sens > 0 ? X_E0_APPROCHE : X_RECEPTEUR - D_ELOIGNE * dopLambda();
}
function dopXE(t) { return dopXE0() + dopVEs() * t; }

// Instants clés : émission du front, émission du début du motif 2, réception du front,
// réception du début du motif 2, fin de l'animation (dernière étape : la lecture va au bout)
function dopT1()   { return (X_RECEPTEUR - dopXE0()) / V_ONDE; }
function dopT2()   { return dopT1() + dopTR(); }
// Date à laquelle l'émetteur atteint sa butée (bord gauche ou abords du récepteur)
function dopTLimite() {
  if (simD.vE <= 0) return Infinity;
  return (simD.sens > 0 ? X_RECEPTEUR - MARGE_R - dopXE0() : dopXE0() - MARGE_BORD) / simD.vE;
}
// Nombre de débuts de motif reçus pendant l'animation : N_RECEP, moins si
// l'émetteur atteint sa butée avant (jamais moins de 2 : la démonstration en demande deux)
function dopNRecep() {
  var lim = dopTLimite() - T_FIN_MARGE * dopTE();
  var n = Math.floor((lim - dopT1()) / dopTR() + 1e-9) + 1;
  return Math.max(2, Math.min(N_RECEP, n));
}
function dopTFin() { return dopT1() + (dopNRecep() - 1) * dopTR() + T_FIN_MARGE * dopTE(); }
function dopCles() { return [0, dopTE(), dopT1(), dopT2(), dopTFin()]; }

// Indice de l'instant clé égal à t (à 1e-6 près), ou -1
function dopIndiceCle(t) {
  var c = dopCles();
  for (var i = 0; i < c.length; i++) if (Math.abs(t - c[i]) < 1e-6) return i;
  return -1;
}

// ══════════════════════════════════════════════════════════════════════
//  Champ de l'onde (eau plate à t = 0, puis l'émetteur oscille)
// ══════════════════════════════════════════════════════════════════════

// Date d'émission de ce qui se trouve en x à la date t (négative : l'onde
// n'y est pas encore arrivée).
// Devant l'émetteur (côté R) : x − x_E(te) = v·(t − te) ;
// derrière : x_E(te) − x = v·(t − te).
function dopDateEmission(x, t) { return dopDateEmissionV(x, t, dopVEs()); }

// La même pour un émetteur parti de x_E0 à la vitesse algébrique vE
// (vE = 0 : émetteur immobile de la bande témoin).
function dopDateEmissionV(x, t, vE) {
  var x0 = dopXE0();
  if (x >= x0 + vE * t) return (V_ONDE * t - (x - x0)) / (V_ONDE - vE);
  return (V_ONDE * t + (x - x0)) / (V_ONDE + vE);
}

// Élongation normalisée (entre −1 et 1) : nulle tant que le front n'est pas passé.
// L'émetteur part de l'altitude 0 en montant ; il y repasse en montant à T_E, 2T_E…
function dopElongation(x, t) {
  var te = dopDateEmission(x, t);
  return te > 0 ? Math.sin(2 * Math.PI * simD.fE * te) : 0;
}

// Abscisse à la date t du début du motif n + 1 émis vers le récepteur (n = 0 :
// front de l'onde, n = 1 : début du motif 2) ; null tant qu'il n'est pas émis.
function dopXRepere(n, t) {
  var te = n * dopTE();
  if (t < te - 1e-9) return null;
  return dopXE(te) + V_ONDE * (t - te);
}

// ══════════════════════════════════════════════════════════════════════
//  Utilitaires
// ══════════════════════════════════════════════════════════════════════

// Nombre à la française (virgule décimale) : pour tout nombre affiché à l'élève
function fmtFR(v, decimales) {
  return v.toFixed(decimales).replace('.', ',').replace('-', '−');
}

function borner(v, a, b) { return v < a ? a : (v > b ? b : v); }
