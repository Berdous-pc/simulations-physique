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
  // E : force électromotrice du générateur (V) — même notation que sur le
  // schéma du circuit. À ne pas confondre avec Uc, la tension aux bornes du
  // condensateur.
  E: 5, C: 300e-6, R1: 10000, R2: 10000,

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
  syncFrozen: false,   // true quand le tracé est figé (intensité affichée nulle)

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
  // fmtScale) : en dessous, Math.pow(10, exp) sous-déborde à 0 et la
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
//  Affichage d'une mesure sur un CALIBRE donné — le modèle du multimètre.
//
//  Le nombre de décimales est fixé par la pleine échelle, pas par la valeur :
//  3 chiffres significatifs à pleine échelle, moins en dessous, jamais plus.
//  C'est ce que fait un appareil réel, et c'est ce qui évite les absurdités
//  du formatage à chiffres significatifs constants — sur un calibre en mA,
//  « 1,23×10⁻³ mA » désigne en réalité 1,23 µA et n'a aucun sens tel quel.
//  Sur un calibre 0,5 mA on lit « 0,123 mA », puis « 0,001 », puis 0.
//
//  Sous la résolution, l'arrondi donne un zéro AVEC les décimales du calibre
//  — « 0,000 » sur un calibre 0,5 mA, « 0,00 » sur un calibre 5 V — et non un
//  « 0 » nu qui trancherait avec le reste de l'encart. C'est encore le
//  comportement de l'appareil : Uc et i décroissent exponentiellement sans
//  jamais s'annuler, ils afficheraient sinon indéfiniment des valeurs exactes
//  et inutiles.
//
//  La résolution n'a pas besoin d'être testée : le nombre de décimales étant
//  calé sur la pleine échelle, toFixed() ramène lui-même à zéro tout ce qui
//  passe sous le dernier rang affichable.
// ─────────────────────────────────────────────────────────────────────
function fmtScale(value, fullScale) {
  const scale = Math.abs(fullScale);
  if (!isFinite(value) || !isFinite(scale) || scale === 0) return fmtSig3(value);

  const dec = 2 - Math.floor(Math.log10(scale));

  // Pleine échelle ≥ 1000 : il n'y a pas de décimale à ajouter, et c'est le
  // domaine où l'écriture scientifique de fmtSig3 est le bon rendu. Le seuil
  // de résolution redevient nécessaire ici, faute d'arrondi qui le porte.
  if (dec <= 0) return Math.abs(value) < scaleResolution(scale) ? '0' : fmtSig3(value);

  const d = Math.min(10, dec);
  let out = value.toFixed(d);
  // Une valeur négative sous la résolution rendrait « -0,000 ».
  if (parseFloat(out) === 0) out = (0).toFixed(d);
  return out.replace('.', ',');
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
//  Pleine échelle de l'intensité (mA) — le « calibre » de l'ampèremètre.
//  Source unique de l'encart du panneau et du critère d'arrêt du mode
//  Synchronisé : sinon le tracé se figerait alors que l'encart affiche
//  encore une valeur non nulle, ou l'inverse.
//
//  Calibre de la PHASE COURANTE (comme tau()), et non U/min(R1,R2) : cette
//  dernière est la borne du graphe i(t), qui doit cadrer charge ET décharge
//  sur un même axe. L'employer ici serait faux dès que R1 et R2 diffèrent
//  nettement — avec R1 = 50 kΩ et R2 = 100 Ω, le courant de charge vaut 1/500
//  de cette pleine échelle et passerait sous la résolution presque aussitôt.
// ─────────────────────────────────────────────────────────────────────
function iFullScale_mA() {
  return sim.E / (sim.phase === 'discharge' ? sim.R2 : sim.R1) * 1000;
}

// ─────────────────────────────────────────────────────────────────────
//  Seuil sous lequel une mesure s'affiche comme un zéro sur ce calibre.
//  Défini à part de fmtScale() pour être testable sans passer par le
//  formatage : le critère d'arrêt tourne dans la boucle d'échantillonnage,
//  où l'on ne veut pas construire une chaîne par point.
// ─────────────────────────────────────────────────────────────────────
function scaleResolution(fullScale) {
  const scale = Math.abs(fullScale);
  if (!isFinite(scale) || scale === 0) return 0;
  const dec = 2 - Math.floor(Math.log10(scale));
  // dec ≤ 0 : fmtScale délègue à fmtSig3, qui n'arrondit pas à zéro tout seul
  return dec <= 0 ? scale / 1000 : 0.5 * Math.pow(10, -dec);
}

// ─────────────────────────────────────────────────────────────────────
//  Instant (ms depuis le début de la phase) où les DEUX appareils sont
//  arrivés au repos : l'ampèremètre affiche zéro et le voltmètre affiche
//  la valeur finale, chacun à la résolution de son calibre.
//
//  C'est le critère d'arrêt du mode Synchronisé, mais résolu analytiquement :
//  i et Uc décroissent tous deux en e^(−t/τ) depuis une amplitude initiale
//  connue, donc chaque échéance vaut τ·ln(amplitude / résolution) et l'on
//  retient la plus tardive.
//
//  Forme fermée, et non un test par pas comme dans la boucle
//  d'échantillonnage, parce que l'animation du circuit a besoin de cette
//  échéance AVANT de l'atteindre : c'est elle qui règle le plancher de
//  vitesse des électrons, de sorte que le dernier arrive sur sa plaque pile
//  quand le tracé se fige. Le 6τ conventionnel qui tenait ce rôle les
//  désynchronisait de ±1,5τ selon la position de E dans sa décade — les
//  seuils de résolution étant des paliers, pas une fraction fixe.
// ─────────────────────────────────────────────────────────────────────
function settleTimeMs() {
  // Amplitude de l'exponentielle : l'écart initial à la valeur finale.
  const ampU = sim.phase === 'discharge'
    ? Math.abs(sim.U0_dis)
    : Math.abs(sim.E - sim.U0_chg);
  const R    = sim.phase === 'discharge' ? sim.R2 : sim.R1;
  const ampI = ampU / R * 1000;   // mA — même décroissance que Uc

  const ratios = [ampU / scaleResolution(sim.E),
                  ampI / scaleResolution(iFullScale_mA())];
  // Un rapport ≤ 1 (ou non fini) signifie que la grandeur part déjà sous la
  // résolution de son calibre : cette échéance-là est immédiate.
  const nTau = ratios.reduce((m, r) => isFinite(r) && r > 1
    ? Math.max(m, Math.log(r)) : m, 0);

  return nTau * tau() * 1000;
}

// ─────────────────────────────────────────────────────────────────────
//  Intensité instantanée du courant (A).
//  Charge   : i = (U − Uc) / R1
//  Décharge : i = −Uc / R2
//  Idle     : i = 0
// ─────────────────────────────────────────────────────────────────────
function currentI() {
  if (sim.phase === 'charge')    return (sim.E - sim.Uc) / sim.R1;
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
