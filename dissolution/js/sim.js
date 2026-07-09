// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

/* sim.js — état global, constantes, modèle géométrique de l'eau, utilitaires */

/* ══════════════════════════════════════════════════
   Constantes de la maille cristalline
══════════════════════════════════════════════════ */
const NCOLS = 24;  // volontairement surdimensionné : déborde de la largeur du canvas, rogné aux bords
const NROWS = 3;

/* ══════════════════════════════════════════════════
   Constantes temporelles de l'animation
══════════════════════════════════════════════════ */
const DURATION_MS = 20000;
const MAX_CONCURRENT = 4;
const MAX_DISSOLVED = Math.floor(NCOLS * NROWS * 0.35);   // 17 — filet de sécurité (dissolution partielle garantie)

const PHASE_DUR = { approche: 1100, dissociation: 900, solvatation: 1300, dispersion: 3200, disparition: 500 };
const PROCESS_TOTAL = PHASE_DUR.approche + PHASE_DUR.dissociation + PHASE_DUR.solvatation
                     + PHASE_DUR.dispersion + PHASE_DUR.disparition;         // 7000 ms
const SPAWN_HARD_STOP = DURATION_MS - PROCESS_TOTAL;                        // 13000 ms

/* ══════════════════════════════════════════════════
   Couleurs des ions et des atomes d'eau (charte du site)
══════════════════════════════════════════════════ */
const ATOM_COLORS = { O: '#cc2200', H: '#ffffff', Na: '#e8c020', Cl: '#1a7a1a' };
const ATOM_BORDER = { O: '#881500', H: '#999999', Na: '#a87810', Cl: '#0d4d0d' };
const ATOM_LABEL_COLOR = { Na: '#6b4a00', Cl: '#ffffff' };

/* ══════════════════════════════════════════════════
   Modèle géométrique de la molécule d'eau (coudée, 104,5°)
══════════════════════════════════════════════════ */
const HOH_HALF = 52.25 * Math.PI / 180;
const WATER_L = 17;
const _wO  = { el: 'O', x: 0, y: 0 };
const _wH1 = { el: 'H', x: -WATER_L * Math.sin(HOH_HALF), y: WATER_L * Math.cos(HOH_HALF) };
const _wH2 = { el: 'H', x:  WATER_L * Math.sin(HOH_HALF), y: WATER_L * Math.cos(HOH_HALF) };
const WATER_MODEL = {
  atoms: [_wO, _wH1, _wH2],
  bonds: [ { a: _wO, b: _wH1 }, { a: _wO, b: _wH2 } ],
  radius: 13,
};

/* ══════════════════════════════════════════════════
   État global de la simulation
══════════════════════════════════════════════════ */
const state = {
  onglet: 'mecanisme',
  paused: true,
  ended: false,
  animT: 0,
  nextSpawnAt: 300,
  nextProcessId: 0,
  crystal: { cellSize: 0, x0: 0, y0: 0, rNa: 0, rCl: 0, sites: [], nDissolved: 0 },
  freeWater: [],
  processes: [],
};

/* ══════════════════════════════════════════════════
   Utilitaires
══════════════════════════════════════════════════ */
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(t) { return Math.max(0, Math.min(1, t)); }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

/* Sphère générique (ion ou atome d'eau) — l'appelant gère save/restore/alpha */
function drawSphere(ctx, x, y, r, fill, border, label, labelColor) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = border; ctx.lineWidth = Math.max(1, r * 0.12); ctx.stroke();
  if (label) {
    ctx.fillStyle = labelColor;
    ctx.font = `bold ${Math.max(7, Math.round(r * 0.62))}px 'Segoe UI', Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
  }
}
