// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

/* eau.js — pool de molécules d'eau libres (agitation idle, recrutement,
   orientation électrostatique). Chargé après cristal.js, avant ui.js. */

/* Zone solution : les deux tiers hauts de la zone d'animation, au-dessus du cristal. */
function computeSolutionRect() {
  const canvas = document.getElementById('anim-canvas');
  const margin = 6;
  return {
    x: margin,
    y: margin,
    w: canvas.width - margin * 2,
    h: Math.max(10, state.crystal.y0 - margin * 2),
  };
}

function waterScale() {
  /* Rayon de l'oxygène nettement inférieur à celui des ions (rNa ≈ cellSize×0,42,
     rCl ≈ cellSize×0,53) et sans plancher élevé, pour bien rétrécir sur petite
     fenêtre au lieu de rester figé et finir plus gros que les ions du cristal. */
  const waterR = Math.max(4, Math.min(20, state.crystal.cellSize * 0.32));
  return waterR / WATER_MODEL.radius;
}

/* Chaque molécule libre occupe une case fixe (fx,fy) d'une grille lâche et oscille
   autour, avec une amplitude bornée à 70% du demi-côté de case : aucun chevauchement
   possible entre molécules idle, sans avoir besoin de détection de collision. */
function initFreeWater() {
  const rect = computeSolutionRect();
  const n = Math.max(18, Math.min(32, Math.round((rect.w * rect.h) / 24000)));
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * rect.w / rect.h)));
  const rows = Math.max(1, Math.ceil(n / cols));

  state.freeWater = [];
  let count = 0;
  for (let r = 0; r < rows && count < n; r++) {
    for (let c = 0; c < cols && count < n; c++) {
      const fx = (c + 0.5) / cols;
      const fy = (r + 0.5) / rows;
      state.freeWater.push({
        fx, fy,
        x: rect.x + fx * rect.w, y: rect.y + fy * rect.h,
        role: 'idle', alpha: 1, fadeIn: false,
        ampFx: 0.35 / cols, ampFy: 0.35 / rows,
        idleFreqX: 0.15 + Math.random() * 0.2,
        idleFreqY: 0.15 + Math.random() * 0.2,
        idlePhase: Math.random() * Math.PI * 2,
        orient: Math.random() * Math.PI * 2,
      });
      count++;
    }
  }
}

function updateFreeWater(dt) {
  const rect = computeSolutionRect();
  const tS = state.animT / 1000;
  state.freeWater.forEach(w => {
    if (w.role !== 'idle') return;
    const baseX = rect.x + w.fx * rect.w;
    const baseY = rect.y + w.fy * rect.h;
    w.x = baseX + Math.sin(tS * w.idleFreqX + w.idlePhase) * (w.ampFx * rect.w);
    w.y = baseY + Math.cos(tS * w.idleFreqY + w.idlePhase * 1.3) * (w.ampFy * rect.h);
    if (w.fadeIn) {
      w.alpha = Math.min(1, w.alpha + dt / 400);
      if (w.alpha >= 1) w.fadeIn = false;
    }
  });
}

function drawFreeWater(ctx) {
  const sc = waterScale();
  state.freeWater.forEach(w => {
    if (w.role !== 'idle' || w.alpha <= 0) return;
    drawWaterMolecule(ctx, w.x, w.y, w.orient, sc, w.alpha);
  });
}

/* ══════════════════════════════════════════════════
   Recrutement / recyclage
══════════════════════════════════════════════════ */
function recruitFreeWaterMolecule() {
  const idleList = state.freeWater.filter(w => w.role === 'idle');
  if (!idleList.length) return null;
  const w = idleList[Math.floor(Math.random() * idleList.length)];
  w.role = 'engaged';
  w.alpha = 1;
  return w;
}

/* Recyclée : la molécule revient en fondu à sa position d'origine (fx,fy) — pas de
   téléportation visible puisque alpha=0 pendant le "saut". */
function releaseAndRecycleMolecule(w) {
  w.role = 'idle';
  w.alpha = 0;
  w.fadeIn = true;
}

/* ══════════════════════════════════════════════════
   Orientation électrostatique et rendu
══════════════════════════════════════════════════ */

/* O vers Na+ (attire l'oxygène, côté -Y), H vers Cl- (attire l'hydrogène, côté +Y). */
function computeWaterOrientation(mx, my, ix, iy, ionType) {
  const dirAngle = Math.atan2(iy - my, ix - mx);
  return ionType === 'Na' ? dirAngle + Math.PI : dirAngle;
}

function drawWaterMolecule(ctx, x, y, orientAngle, sc, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.translate(x, y);
  ctx.rotate(orientAngle - Math.PI / 2);
  ctx.strokeStyle = '#8a9aaa';
  ctx.lineWidth = Math.max(1, 1.6 * sc);
  WATER_MODEL.bonds.forEach(b => {
    ctx.beginPath(); ctx.moveTo(b.a.x * sc, b.a.y * sc); ctx.lineTo(b.b.x * sc, b.b.y * sc); ctx.stroke();
  });
  WATER_MODEL.atoms.forEach(a => {
    const r = (a.el === 'H' ? WATER_MODEL.radius * 0.65 : WATER_MODEL.radius) * sc;
    drawSphere(ctx, a.x * sc, a.y * sc, r, ATOM_COLORS[a.el], ATOM_BORDER[a.el], null, null);
  });
  ctx.restore();
}
