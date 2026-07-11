// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

/* sim.js — état global, constantes, modèle géométrique de l'eau, utilitaires */

/* ══════════════════════════════════════════════════
   Scène de rendu — résolution logique fixe
══════════════════════════════════════════════════ */
/* Toute la géométrie du cristal (cellSize, positions, tailles des ions/eau)
   est calculée à partir de cette résolution fixe, jamais depuis la taille
   réelle du conteneur DOM : la composition de l'animation (un scénario
   entièrement scripté, DISSOLUTION_SCRIPT) doit être rigoureusement la même
   quelle que soit la machine/fenêtre — comme une vidéo. resize() (ui.js)
   adapte ensuite cette scène fixe à l'écran par une simple mise à l'échelle
   uniforme en mode « cover » (remplit l'espace, rogne l'excédent). Ratio
   ≈ 1,833, proche de la fenêtre « typique » sur laquelle l'animation a été
   calée visuellement à l'origine. */
const STAGE_W = 1320;
const STAGE_H = 720;

/* ══════════════════════════════════════════════════
   Constantes de la maille cristalline
══════════════════════════════════════════════════ */
const NCOLS = 24;  // volontairement surdimensionné : déborde de la largeur du canvas, rogné aux bords
const NROWS = 3;      // lignes garanties (présentes sur toutes les colonnes)
const NROWS_MAX = NROWS + 1;   // + 1 ligne du dessus, présente une colonne sur deux environ (surface irrégulière)

/* ══════════════════════════════════════════════════
   Constantes temporelles de l'animation
══════════════════════════════════════════════════ */
let DURATION_MS = 40000;   // réglable via le panneau dev
const MAX_DISSOLVED = Math.floor(NCOLS * NROWS_MAX * 0.35);   // filet de sécurité (dissolution partielle garantie)

/* Cycle de déplacement — entièrement déterministe (aucun Math.random) :
   approche (depuis la gauche, par le dessus) → dissociation (détachement vers
   le haut) → migration continue vers le haut, avec cage de solvatation qui se
   referme peu après le détachement, jusqu'à sortie complète par le haut —
   l'ion et ses molécules sont alors définitivement perdus. Tout est ralenti
   par rapport à la version précédente (quitte à allonger DURATION_MS). */
/* `let` (pas `const`) pour ces constantes : le panneau de réglage temporaire
   (devpanel.js) les modifie en direct. */
const PHASE_DUR = { approche: 3000, dissociation: 1600 };   // objet : ses propriétés restent mutables même déclaré en const
/* Exprimées en ×cellule/s (et non en px/s absolus) : le scénario est
   chronométré en ms fixes (DISSOLUTION_SCRIPT), donc le rythme perçu (nombre
   de mailles parcourues par seconde) doit rester identique quelle que soit la
   taille de la fenêtre — une vitesse en px/s fixe ferait paraître l'animation
   beaucoup plus lente sur un grand écran (cellSize grand) que sur un petit. */
let MIGRATION_SPEED = 2;            // ×cellule/s, montée rectiligne et constante
let WATER_TRAVEL_SPEED = 2;         // ×cellule/s, vitesse constante des molécules d'eau (au lieu d'une durée fixe) — évite les vitesses incohérentes selon la distance à parcourir
let WATER_TRAVEL_MIN_DUR = 800;     // ms, plancher pour éviter un trajet instantané si la molécule est déjà très proche
let FADE_IN_DURATION = 2000;        // ms, fondu d'apparition d'une molécule nouvellement créée (renouvellement du stock)

/* Scénario fixe (pas de choix runtime) : on scripte la vidéo. Chaque entrée
   cible un site précis (row, col) — modifiable via le panneau de réglage
   (mode « Scénario » : clic sur un ion pour l'ajouter à l'instant courant du
   curseur "Temps"). Le tableau reste un `const` mais son contenu est modifié
   en place (push/splice) par devpanel.js ; chaque entrée reçoit un drapeau
   `fired` remis à zéro par resetSimAnim(). */
const DISSOLUTION_SCRIPT = [
  { atMs: 200,   row: 0, col: 12 },
  { atMs: 1000,  row: 0, col: 17 },
  { atMs: 11100, row: 0, col: 8  },
  { atMs: 12600, row: 0, col: 13 },
  { atMs: 14000, row: 0, col: 16 },
  { atMs: 16700, row: 1, col: 11 },
  { atMs: 17100, row: 1, col: 18 },
  { atMs: 20000, row: 0, col: 7  },
  { atMs: 20400, row: 0, col: 3  },
  { atMs: 21000, row: 1, col: 14 },
  { atMs: 21700, row: 1, col: 9  },
  { atMs: 26300, row: 0, col: 6  },
  { atMs: 29000, row: 1, col: 8  },
  { atMs: 29400, row: 1, col: 16 },
  { atMs: 29900, row: 1, col: 13 },
  { atMs: 32000, row: 1, col: 3  },
  { atMs: 33200, row: 1, col: 17 },
  { atMs: 33900, row: 1, col: 12 },
  { atMs: 36000, row: 1, col: 7  },
  { atMs: 37600, row: 1, col: 4  },
  { atMs: 38000, row: 2, col: 14 },
];

/* Dérogations à l'occupation par défaut du cristal (TOP_ROW_PATTERN, cf.
   cristal.js), au format { "row,col": true|false }. Modifiable via le panneau
   de réglage (mode « Cristal » : clic sur une case pour basculer sa présence). */
let CRYSTAL_OVERRIDES = {
  "0,15": false, "1,16": true,  "1,15": false, "0,10": false,
  "1,10": false, "1,4": true,   "0,12": true,  "0,20": false,
  "0,17": true,  "0,16": true,  "0,19": false, "0,18": false,
  "1,20": true,  "1,21": false,
};

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
  nextProcessId: 0,
  spawnCounter: 0,
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
