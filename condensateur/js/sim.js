// ═══════════════════════════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
//  sim.js — État global de la simulation + utilitaires physiques
//  Chargé en premier ; toutes les autres variables JS en dépendent.
// ═══════════════════════════════════════════════════════════════════════

// ── État global ──
const sim = {
  // Phase courante
  phase: 'idle',      // 'idle' | 'charge' | 'discharge'
  t: 0,               // ms simulées écoulées dans la phase courante
  tTotal: 0,          // ms simulées totales depuis le dernier reset
  Uc: 0,              // tension aux bornes du condensateur (V)
  U0_dis: 0,          // Uc au début de la dernière décharge (condition initiale)
  U0_chg: 0,          // Uc au début de la dernière charge  (condition initiale)

  // Paramètres physiques
  U: 5, C: 300e-6, R1: 10000, R2: 10000,

  // Données des graphes
  // graphUc stocke toujours Uc en volts ; la conversion en µC se fait à l'affichage.
  graphUc: [], graphI: [],

  // Fenêtre d'affichage (zoom X des graphes)
  // Valeur posée juste après la déclaration de sim, par autoTimeWindow(),
  // pour ne pas dupliquer ici le calcul 20τ × marge.
  graphWindowMs: 0,

  // Décalage de vue (pan horizontal des graphes)
  viewOffsetMs: 0,     // bord gauche de la fenêtre visible (ms absolues)
  userPanned: false,   // true si l'utilisateur a pané manuellement

  // Mode d'enregistrement des graphes
  graphMode: 'sync',   // 'sync' | 'continuous'

  // Grandeur affichée sur chaque graphe : 'Uc' | 'i' | 'q'
  graphTab1: 'q',
  graphTab2: 'i',

  // Mode synchronisé
  syncFrozen: false,   // true quand le tracé est figé (6τ atteint)

  // Contrôle de la vitesse de simulation
  paused: false,       // true = simulation suspendue
  timeScale: 1,        // facteur d'accélération (0.1 / 0.5 / 1 / 2 / 5)
};

// ─────────────────────────────────────────────────────────────────────
//  Formatage générique des nombres affichés dans l'interface.
//  - 0,01 ≤ |v| < 1000 → écriture normale, 3 chiffres significatifs
//  - au-delà des deux bornes → écriture scientifique, mantisse à 2 décimales
//  Virgule décimale française dans tous les cas.
//
//  Les DEUX bornes comptent : seule la borne haute existait, si bien que les
//  valeurs très petites restaient en décimal avec autant de décimales qu'il
//  le fallait — Uc décroissant exponentiellement finissait affiché
//  « 0,000000100 ». Toujours 3 chiffres significatifs, mais illisible.
// ─────────────────────────────────────────────────────────────────────
const SUPERSCRIPT_DIGITS = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
                              '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

function toSuperscript(n) {
  return String(n).split('').map(c => SUPERSCRIPT_DIGITS[c] || c).join('');
}

function fmtSig3(value) {
  if (!isFinite(value) || value === 0) return '0';
  const neg = value < 0;
  const av  = Math.abs(value);
  // Garde-fou purement numérique (aucune décision d'affichage ici, cf.
  // quantizeToScale) : en dessous, Math.pow(10, exp) sous-déborde à 0 et la
  // mantisse partirait à l'infini. Uc et i, qui décroissent exponentiellement
  // sans jamais s'annuler, atteignent bel et bien ces valeurs si on laisse le
  // mode Continu tourner longtemps.
  if (av < 1e-300) return '0';
  let out;
  if (av >= 0.01 && av < 1000) {
    const magnitude = Math.floor(Math.log10(av));
    const decimals  = Math.max(0, 2 - magnitude);
    out = av.toFixed(decimals);
  } else {
    let exp = Math.floor(Math.log10(av));
    let mantissa = av / Math.pow(10, exp);
    let mStr = mantissa.toFixed(2);
    if (parseFloat(mStr) >= 10) { exp += 1; mStr = (av / Math.pow(10, exp)).toFixed(2); }
    out = mStr + '×10' + toSuperscript(exp);
  }
  out = out.replace('.', ',');
  return neg ? '-' + out : out;
}

// ─────────────────────────────────────────────────────────────────────
//  Résolution d'affichage : 3 chiffres significatifs par rapport à la PLEINE
//  ÉCHELLE de la grandeur, ce qui revient à modéliser un appareil de mesure
//  réel. En dessous, on renvoie 0 franc.
//
//  Sans ce seuil, Uc et i — qui décroissent exponentiellement et ne
//  s'annulent jamais — continuaient d'afficher indéfiniment des valeurs de
//  plus en plus petites, désormais en écriture scientifique : « 3,17×10⁻⁹ V »
//  est exact et parfaitement inutile. Un voltmètre affiche 0.
//
//  Le seuil est relatif et non absolu : la pleine échelle varie ici d'un
//  facteur 500 entre les réglages extrêmes de R et C, un seuil fixe serait
//  soit trop grossier soit sans effet selon les paramètres choisis.
// ─────────────────────────────────────────────────────────────────────
function quantizeToScale(value, fullScale) {
  return Math.abs(value) < Math.abs(fullScale) / 1000 ? 0 : value;
}

// ─────────────────────────────────────────────────────────────────────
//  Formate une durée en ms en "X ms" ou "X s" selon la valeur.
// ─────────────────────────────────────────────────────────────────────
function fmtMs(ms) {
  return ms < 1000 ? fmtSig3(ms) + ' ms' : fmtSig3(ms / 1000) + ' s';
}

// ─────────────────────────────────────────────────────────────────────
//  Formate une constante de temps (en ms) avec bascule à 1 s.
// ─────────────────────────────────────────────────────────────────────
function fmtTau(ms) {
  return ms < 1000 ? fmtSig3(ms) + ' ms' : fmtSig3(ms / 1000) + ' s';
}

// ─────────────────────────────────────────────────────────────────────
//  Constante de temps de la phase courante (s).
//  τ_charge = R1·C  |  τ_décharge = R2·C
// ─────────────────────────────────────────────────────────────────────
function tau() {
  return sim.phase === 'discharge' ? sim.R2 * sim.C : sim.R1 * sim.C;
}

// ─────────────────────────────────────────────────────────────────────
//  Intensité instantanée du courant (A).
//  Charge   : i = (U − Uc) / R1
//  Décharge : i = −Uc / R2
//  Idle     : i = 0
// ─────────────────────────────────────────────────────────────────────
function currentI() {
  if (sim.phase === 'charge')    return (sim.U - sim.Uc) / sim.R1;
  if (sim.phase === 'discharge') return -sim.Uc / sim.R2;
  return 0;
}

// ─────────────────────────────────────────────────────────────────────
//  Fenêtre d'affichage minimale — cap du zoom avant.
//  Sans cap, on pouvait descendre à quelques millisecondes : les graduations
//  finissaient par partager tous leurs chiffres de poids fort et le zoom
//  n'apprenait plus rien. Le cap est calé sur τ (et non sur une durée fixe)
//  parce que c'est τ qui donne l'échelle du phénomène : τ/20 laisse un
//  facteur ~400 entre la vue « Adapter » (20τ) et le zoom maximal, ce qui
//  couvre largement la lecture de la tangente à l'origine.
// ─────────────────────────────────────────────────────────────────────
function minTimeWindowMs() {
  return Math.max(1, tau() * 1000 / 20);
}

// ─────────────────────────────────────────────────────────────────────
//  Mise à jour de la fenêtre d'affichage (zoom X uniquement).
// ─────────────────────────────────────────────────────────────────────
function setTimeWindow(ms) {
  sim.graphWindowMs = Math.max(minTimeWindowMs(), ms);
}

// Marge ajoutée à droite des 20τ visés. Sans elle, la fenêtre valait
// exactement 20τ : la dernière graduation tombait pile sur le bord droit du
// repère et son étiquette, centrée sur ce bord, était coupée en deux
// (« 60, » au lieu de « 60,0 »). 6 % suffisent à la faire tenir en entier
// sans décaler visiblement le cadrage.
const GRAPH_WINDOW_MARGIN = 1.06;

// ─────────────────────────────────────────────────────────────────────
//  Bouton "Adapter" : cale la fenêtre sur 20τ (τ de la phase courante),
//  remet la vue à t=0 et réactive l'auto-scroll.
// ─────────────────────────────────────────────────────────────────────
function autoTimeWindow() {
  setTimeWindow(20 * tau() * 1000 * GRAPH_WINDOW_MARGIN);
  sim.viewOffsetMs = 0;
  sim.userPanned   = false;
}

// Cadrage initial, identique à celui du bouton "Adapter".
autoTimeWindow();

// ─────────────────────────────────────────────────────────────────────
//  Efface les données des graphes et remet la vue à t=0.
// ─────────────────────────────────────────────────────────────────────
function resetGraphs() {
  sim.graphUc      = [];
  sim.graphI       = [];
  sim.viewOffsetMs = 0;
  sim.userPanned   = false;
  sim.syncFrozen   = false;
}
