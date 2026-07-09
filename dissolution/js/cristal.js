// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

/* cristal.js — grille du cristal (coupe 2D en damier Na/Cl) + machine à états
   des processus de dissolution. Chargé après sim.js, avant eau.js. */

/* ══════════════════════════════════════════════════
   Géométrie de la grille
══════════════════════════════════════════════════ */
function computeCrystalGeometry() {
  const canvas = document.getElementById('anim-canvas');
  const W = canvas.width, H = canvas.height;
  /* La taille des cellules est pilotée uniquement par la hauteur (tiers
     inférieur de la zone d'animation) : NCOLS est volontairement surdimensionné
     pour que la grille déborde toujours de la largeur du canvas, des deux
     côtés, plutôt que de risquer de ne pas la remplir sur un écran large. Le
     débordement est simplement rogné par le canvas (et #anim-canvas-wrap). */
  const cellSize = (H / 3) / NROWS;
  const c = state.crystal;
  c.cellSize = cellSize;
  c.x0 = (W - NCOLS * cellSize) / 2;
  c.y0 = H - Math.max(6, H * 0.02) - NROWS * cellSize;
  /* rNa + rCl = cellSize donnerait un contact géométrique exact entre plus
     proches voisins (toujours de charge opposée sur cette grille) ; on retire
     5% pour laisser un léger espace visuel, le trait de contour (lineWidth)
     faisant sinon paraître les bords superposés. */
  c.rNa = cellSize * 4 / 9 * 0.95;
  c.rCl = cellSize * 5 / 9 * 0.95;
}

function getSiteXY(row, col) {
  const c = state.crystal;
  return { x: c.x0 + col * c.cellSize + c.cellSize / 2, y: c.y0 + row * c.cellSize + c.cellSize / 2 };
}

/* Fragment de cristal en coupe (100) : alternance simple Na/Cl (damier).
   Chaque site a 4 plus proches voisins de charge opposée dans le plan. */
function buildCristal() {
  const sites = [];
  for (let row = 0; row < NROWS; row++) {
    for (let col = 0; col < NCOLS; col++) {
      sites.push({ row, col, type: (row + col) % 2 === 0 ? 'Na' : 'Cl', occupied: true, engaged: false });
    }
  }
  state.crystal.sites = sites;
  state.crystal.nDissolved = 0;
}

/* Seule la face supérieure du fragment est chimiquement exposée à l'eau :
   la ligne 0, ou un site dont le voisin du dessus s'est déjà dissous (puits). */
function isExposed(site) {
  if (!site.occupied) return false;
  if (site.row === 0) return true;
  const above = state.crystal.sites[(site.row - 1) * NCOLS + site.col];
  return !above.occupied;
}

function pickDissolutionCandidate() {
  const candidates = state.crystal.sites.filter(s => s.occupied && !s.engaged && isExposed(s));
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/* ══════════════════════════════════════════════════
   Machine à états d'un processus de dissolution
   Phases : approche → dissociation → solvatation → dispersion → disparition
══════════════════════════════════════════════════ */
function startDissolutionProcess(site) {
  if (state.crystal.nDissolved >= MAX_DISSOLVED) return false;
  const w1 = recruitFreeWaterMolecule();
  const w2 = recruitFreeWaterMolecule();
  if (!w1 || !w2) {
    if (w1) releaseAndRecycleMolecule(w1);
    if (w2) releaseAndRecycleMolecule(w2);
    return false;
  }
  site.engaged = true;
  const pos = getSiteXY(site.row, site.col);
  const dir = -Math.PI / 2 + (Math.random() - 0.5) * 0.5;   // vers le haut, jitter ± ~14°
  const dockDist = state.crystal.cellSize * 1.6;
  const detachedDist = state.crystal.cellSize * 1.3;

  const proc = {
    id: state.nextProcessId++, site, ionType: site.type,
    phase: 'approche', phaseT: 0,
    latticeX: pos.x, latticeY: pos.y,
    ionX: pos.x, ionY: pos.y,
    detachedX: pos.x + Math.cos(dir) * detachedDist,
    detachedY: pos.y + Math.sin(dir) * detachedDist,
    dir,
    driftSpeed: 24 + Math.random() * 12,
    approachWater: [w1, w2],
    cageWater: [],
    detached: false,
    alpha: 1,
  };

  [[w1, dir - 0.6], [w2, dir + 0.6]].forEach(([w, ang]) => {
    w.alpha = 1;
    w._relStartX = w.x - proc.ionX; w._relStartY = w.y - proc.ionY;
    w._relTargetX = Math.cos(ang) * dockDist; w._relTargetY = Math.sin(ang) * dockDist;
  });

  state.processes.push(proc);
  return true;
}

function updateProcesses(dt) {
  state.processes = state.processes.filter(p => {
    p.phaseT += dt;
    const dur = PHASE_DUR[p.phase];

    if (p.phase === 'approche') {
      const t = easeInOut(clamp01(p.phaseT / dur));
      p.approachWater.forEach(w => {
        w.x = p.ionX + lerp(w._relStartX, w._relTargetX, t);
        w.y = p.ionY + lerp(w._relStartY, w._relTargetY, t);
        w.orient = computeWaterOrientation(w.x, w.y, p.ionX, p.ionY, p.ionType);
      });
    } else if (p.phase === 'dissociation') {
      if (!p.detached) { state.crystal.nDissolved++; p.site.occupied = false; p.detached = true; }
      const t = easeInOut(clamp01(p.phaseT / dur));
      p.ionX = lerp(p.latticeX, p.detachedX, t);
      p.ionY = lerp(p.latticeY, p.detachedY, t);
      p.approachWater.forEach(w => {
        w.x = p.ionX + w._relTargetX; w.y = p.ionY + w._relTargetY;
        w.orient = computeWaterOrientation(w.x, w.y, p.ionX, p.ionY, p.ionType);
      });
    } else if (p.phase === 'solvatation') {
      const t = easeInOut(clamp01(p.phaseT / dur));
      p.cageWater.forEach(w => {
        w.x = p.ionX + lerp(w._relStartX, w._relTargetX, t);
        w.y = p.ionY + lerp(w._relStartY, w._relTargetY, t);
        w.orient = computeWaterOrientation(w.x, w.y, p.ionX, p.ionY, p.ionType);
      });
    } else if (p.phase === 'dispersion') {
      const dtS = dt / 1000;
      p.ionX += Math.cos(p.dir) * p.driftSpeed * dtS;
      p.ionY += Math.sin(p.dir) * p.driftSpeed * dtS;
      p.alpha = 1 - clamp01(p.phaseT / dur) * 0.85;   // 1 → 0.15
      p.cageWater.forEach(w => {
        w.x = p.ionX + w._relTargetX; w.y = p.ionY + w._relTargetY;
        w.alpha = p.alpha;
        w.orient = computeWaterOrientation(w.x, w.y, p.ionX, p.ionY, p.ionType);
      });
    } else if (p.phase === 'disparition') {
      const dtS = dt / 1000;
      p.ionX += Math.cos(p.dir) * p.driftSpeed * dtS;
      p.ionY += Math.sin(p.dir) * p.driftSpeed * dtS;
      p.alpha = 0.15 * (1 - clamp01(p.phaseT / dur));
      p.cageWater.forEach(w => {
        w.x = p.ionX + w._relTargetX; w.y = p.ionY + w._relTargetY;
        w.alpha = p.alpha;
      });
    }

    if (p.phaseT >= dur) {
      p.phaseT = 0;
      const order = ['approche', 'dissociation', 'solvatation', 'dispersion', 'disparition'];
      const next = order[order.indexOf(p.phase) + 1];

      if (!next) {
        p.cageWater.forEach(releaseAndRecycleMolecule);
        return false;
      }
      if (next === 'dissociation') {
        p.approachWater.forEach(w => { w._relTargetX = w.x - p.ionX; w._relTargetY = w.y - p.ionY; });
      }
      if (next === 'solvatation') {
        const more = [recruitFreeWaterMolecule(), recruitFreeWaterMolecule()].filter(Boolean);
        p.cageWater = p.approachWater.concat(more);
        const baseRot = Math.random() * Math.PI * 2;
        const radius = state.crystal.cellSize * 1.3;
        const n = p.cageWater.length;
        p.cageWater.forEach((w, i) => {
          const ang = baseRot + i * (2 * Math.PI / n);
          w.alpha = 1;
          w._relStartX = w.x - p.ionX; w._relStartY = w.y - p.ionY;
          w._relTargetX = Math.cos(ang) * radius; w._relTargetY = Math.sin(ang) * radius;
        });
      }
      if (next === 'dispersion') {
        p.cageWater.forEach(w => { w._relTargetX = w.x - p.ionX; w._relTargetY = w.y - p.ionY; });
      }
      p.phase = next;
    }
    return true;
  });
}

function tryStartNewProcess() {
  if (state.animT >= SPAWN_HARD_STOP) return;
  if (state.processes.length >= MAX_CONCURRENT) { state.nextSpawnAt = state.animT + 300; return; }
  const site = pickDissolutionCandidate();
  if (!site || !startDissolutionProcess(site)) { state.nextSpawnAt = state.animT + 500; return; }
  state.nextSpawnAt = state.animT + 1300 + Math.random() * 700;
}

/* ══════════════════════════════════════════════════
   Rendu
══════════════════════════════════════════════════ */
function drawIon(ctx, type, cx, cy, r, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  const label = type === 'Na' ? 'Na⁺' : 'Cl⁻';
  drawSphere(ctx, cx, cy, r, ATOM_COLORS[type], ATOM_BORDER[type], label, ATOM_LABEL_COLOR[type]);
  ctx.restore();
}

function drawCristal(ctx) {
  const c = state.crystal;
  c.sites.forEach(s => {
    if (!s.occupied || s.engaged) return;
    const pos = getSiteXY(s.row, s.col);
    const r = s.type === 'Na' ? c.rNa : c.rCl;
    drawIon(ctx, s.type, pos.x, pos.y, r, 1);
  });
}

function drawProcesses(ctx) {
  const sc = waterScale();
  state.processes.forEach(p => {
    const waters = p.cageWater.length ? p.cageWater : p.approachWater;
    waters.forEach(w => drawWaterMolecule(ctx, w.x, w.y, w.orient, sc, w.alpha));
    const r = p.ionType === 'Na' ? state.crystal.rNa : state.crystal.rCl;
    drawIon(ctx, p.ionType, p.ionX, p.ionY, r, p.alpha);
  });
}
