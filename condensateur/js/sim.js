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
  graphWindowMs: 60000,

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
//  - 0 ≤ |v| < 1000  → écriture normale, 3 chiffres significatifs max
//  - |v| ≥ 1000       → écriture scientifique, mantisse à 2 décimales
//  Virgule décimale française dans tous les cas.
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
  let out;
  if (av < 1000) {
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
//  Mise à jour de la fenêtre d'affichage (zoom X uniquement).
// ─────────────────────────────────────────────────────────────────────
function setTimeWindow(ms) {
  sim.graphWindowMs = Math.max(100, ms);
}

// ─────────────────────────────────────────────────────────────────────
//  Bouton "Adapter" : cale la fenêtre sur 20τ (τ de la phase courante),
//  remet la vue à t=0 et réactive l'auto-scroll.
// ─────────────────────────────────────────────────────────────────────
function autoTimeWindow() {
  setTimeWindow(20 * tau() * 1000);
  sim.viewOffsetMs = 0;
  sim.userPanned   = false;
}

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
