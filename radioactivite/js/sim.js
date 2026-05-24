'use strict';

// ═══════════════════════════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════════════════════════

/* ═══════════════════════════════════════════════════
   sim.js — État global et utilitaires physiques
   ─────────────────────────────────────────────────
   Expose : PIP_PROBS, PIP_LABELS, SERIE_COLORS, MAX_SERIES,
            SPEED_LEVELS, SPEED_LABELS, N_DISQUES_BASE,
            MOLES_REF_INDEX, AVOGADRO, MOLES_VALUES, NOYAUX,
            state,
            getNDisques, rollOneDie, computeNmoy, runSims,
            pickColor, buildSerie, getContinuValue,
            getTotalDureeContinu, pickColorContinu,
            getAllContinuSeries, buildSerieContinu,
            formatSci, formatTime, formatTimeInUnit, unitSuffix,
            parseLambda
════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════
   CONSTANTES — MODE DISCRET
══════════════════════════════════════════════════ */

const PIP_PROBS  = [1/24, 1/12, 1/6, 1/4, 1/3, 1/2];
const PIP_LABELS = ['1/24 ≈ 4,2 %', '1/12 ≈ 8,3 %', '1/6 ≈ 16,7 %',
                    '1/4 = 25,0 %',  '1/3 ≈ 33,3 %', '1/2 = 50,0 %'];

const SERIE_COLORS = [
  '#2a6aaa', '#b04020', '#2a8a50', '#8a50b0', '#c08020',
  '#c03070', '#5a7020', '#a06040', '#1a7a60', '#d04000',
];

const MAX_SERIES = 10;

/* ══════════════════════════════════════════════════
   CONSTANTES — MODE CONTINU
══════════════════════════════════════════════════ */

const SPEED_LEVELS = [0.5, 1, 5, 10, 30];
const SPEED_LABELS = ['0,5 s', '1 s', '5 s', '10 s', '30 s'];

const N_DISQUES_BASE  = 200;
const MOLES_REF_INDEX = 2;
const AVOGADRO        = 6.022e23;

const MOLES_VALUES = [0.1, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const NOYAUX = {
  U238:  { nom: '²³⁸U — Uranium 238',    lambda: 4.916e-18 },
  Pu239: { nom: '²³⁹Pu — Plutonium 239', lambda: 9.110e-13 },
  C14:   { nom: '¹⁴C — Carbone 14',      lambda: 3.836e-12 },
  Ra226: { nom: '²²⁶Ra — Radium 226',    lambda: 1.374e-11 },
  H3:    { nom: '³H — Tritium',           lambda: 1.782e-9  },
  I131:  { nom: '¹³¹I — Iode 131',       lambda: 1.000e-6  },
  Fr223: { nom: '²²³Fr — Francium 223',  lambda: 5.247e-4  },
  Po214: { nom: '²¹⁴Po — Polonium 214',  lambda: 4.228e3   },
};

/* ══════════════════════════════════════════════════
   ÉTAT GLOBAL
══════════════════════════════════════════════════ */

const state = {
  modePrincipal: 'discret',

  /* Discret — Libre */
  mode: 'libre',
  nDiceLibre: 100,
  pipIndexLibre: 2,
  dice: [],
  lancerNum: 0,
  tableRows: [],

  /* Discret — Auto */
  nDiceAuto: 100,
  pipIndexAuto: 2,
  nSim: 10,
  series: [],
  nextId: 0,
  view: null,
  zoomModeAuto: false,
  reticuleModeAuto: false,
  tangenteAuto: false,
  tangentesFigAuto: [],
  viewHistoryAuto: [],
  zoomRectAuto: null,

  /* Continu */
  lambda: 1e-3,
  n0Continu: 1 * 6.022e23,
  molesIndex: 2,
  graphModeContinu: 'N',
  speedIndexContinu: 3,
  nThalfContinu: 10,
  seriesContinu: [],
  nextIdContinu: 0,
  viewContinu: null,
  animPlaying: false,
  animStartTime: null,
  animSimTimeAtStart: 0,
  animSimTime: 0,
  animCurrentSerie: null,
  zoomModeContinu: false,
  reticuleMode: false,
  tangenteContinu: false,
  tangentesFigContinu: [],
  viewHistoryContinu: [],
  zoomRect: null,
};

/* ══════════════════════════════════════════════════
   UTILITAIRES PHYSIQUES
══════════════════════════════════════════════════ */

/* Nombre de disques affichés dans le récipient */
function getNDisques() {
  const moles    = MOLES_VALUES[state.molesIndex];
  const molesRef = MOLES_VALUES[MOLES_REF_INDEX];
  return Math.max(20, Math.min(2000, Math.round(N_DISQUES_BASE * moles / molesRef)));
}

/* Tirage d'un dé : renvoie 6 avec probabilité PIP_PROBS[pipIndex], sinon 1-5 */
function rollOneDie(pipIndex) {
  const p6 = PIP_PROBS[pipIndex];
  if (Math.random() < p6) return 6;
  return Math.floor(Math.random() * 5) + 1;
}

/* Calcule N_moy à partir d'un tableau de simulations */
function computeNmoy(sims) {
  const maxLen = Math.max(...sims.map(s => s.length));
  const nmoy = [];
  for (let i = 0; i < maxLen; i++) {
    let sum = 0;
    for (const sim of sims) sum += (sim[i] !== undefined ? sim[i] : 0);
    nmoy.push(sum / sims.length);
  }
  return nmoy;
}

/* Lance nSim simulations de dés et renvoie les résultats bruts */
function runSims() {
  const nSim  = state.nSim;
  const nDice = state.nDiceAuto;
  const results = [];
  for (let s = 0; s < nSim; s++) {
    const serie = [nDice];
    let actifs = nDice;
    while (actifs > 0) {
      let grises = 0;
      for (let i = 0; i < actifs; i++) { if (rollOneDie(state.pipIndexAuto) !== 6) grises++; }
      serie.push(grises);
      actifs = grises;
    }
    results.push(serie);
  }
  return results;
}

/* Choisit une couleur inutilisée parmi SERIE_COLORS */
function pickColor() {
  const used = new Set(state.series.map(s => s.color));
  return SERIE_COLORS.find(c => !used.has(c)) || SERIE_COLORS[0];
}

/* Construit un objet série discret auto à partir des résultats bruts */
function buildSerie(results, color) {
  const nmoy = computeNmoy(results);
  const pip  = PIP_LABELS[state.pipIndexAuto];
  return {
    id: state.nextId++, color,
    n0: state.nDiceAuto, pip, nSim: state.nSim,
    nmoy, sims: results, showIndiv: false, hidden: false,
  };
}

/* ── Mode continu ── */

function getTotalDureeContinu() {
  return (Math.LN2 / state.lambda) * state.nThalfContinu;
}

function getContinuValue(n0, lambda, t) {
  const N = n0 * Math.exp(-lambda * t);
  return state.graphModeContinu === 'A' ? lambda * N : N;
}

function pickColorContinu() {
  const usedD = new Set(state.series.map(s => s.color));
  const usedC = new Set(state.seriesContinu.map(s => s.color));
  const cur   = state.animCurrentSerie ? state.animCurrentSerie.color : null;
  const used  = new Set([...usedD, ...usedC, cur].filter(Boolean));
  return SERIE_COLORS.find(c => !used.has(c)) || SERIE_COLORS[0];
}

function getAllContinuSeries() {
  const all = [...state.seriesContinu];
  if (state.animCurrentSerie) all.push(state.animCurrentSerie);
  return all;
}

/* Construit une série complète (instantané, sans animation) */
function buildSerieContinu(color) {
  const totalDuree = getTotalDureeContinu();
  const pts = [];
  const nPts = 600;
  for (let k = 0; k <= nPts; k++) {
    const t = (k / nPts) * totalDuree;
    pts.push({ t, v: getContinuValue(state.n0Continu, state.lambda, t) });
  }
  return {
    id: state.nextIdContinu++,
    color,
    lambda: state.lambda,
    n0: state.n0Continu,
    duree: totalDuree,
    pts,
    livePoint: null,
    hidden: false,
    complete: true,
  };
}

/* ══════════════════════════════════════════════════
   UTILITAIRES FORMAT
══════════════════════════════════════════════════ */

function formatSci(n) {
  if (n === 0) return '0';
  const exp    = Math.floor(Math.log10(Math.abs(n)));
  const man    = n / Math.pow(10, exp);
  const manStr = man.toFixed(2).replace(/\.?0+$/, '');
  if (exp === 0) return manStr;
  const supMap = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','-':'⁻'};
  const expStr = String(exp).split('').map(c => supMap[c] || c).join('');
  return `${manStr}×10${expStr}`;
}

function formatTime(t) {
  if (t < 60)    return t.toFixed(2) + ' s';
  if (t < 3600)  return (t / 60).toFixed(2)   + ' min';
  if (t < 86400) return (t / 3600).toFixed(2)  + ' h';
  return (t / 86400).toFixed(2) + ' j';
}

function formatTimeInUnit(t, factor) {
  const val = t / factor;
  const decimals = Math.abs(val) < 10 ? 3 : Math.abs(val) < 100 ? 2 : 1;
  return val.toFixed(decimals).replace(/\.?0+$/, '') + ' ' + unitSuffix(factor);
}

function unitSuffix(factor) {
  if (factor === 1e-9)      return 'ns';
  if (factor === 1e-6)      return 'µs';
  if (factor === 1e-3)      return 'ms';
  if (factor === 1)         return 's';
  if (factor === 60)        return 'min';
  if (factor === 3600)      return 'h';
  if (factor === 86400)     return 'j';
  if (factor === 3.1536e7)  return 'ans';
  if (factor === 3.1536e10) return 'ka';
  if (factor === 3.1536e13) return 'Ma';
  if (factor === 3.1536e16) return 'Ga';
  return 's';
}

function parseLambda(raw) {
  const s = raw.trim().replace(',', '.');
  const v = parseFloat(s);
  if (isNaN(v) || v <= 0) return null;
  if (v < 1e-19 || v > 1e4) return null;
  return v;
}
