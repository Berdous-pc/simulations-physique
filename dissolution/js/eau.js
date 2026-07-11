// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

/* eau.js — molécules d'eau : apparition en fondu au plus près de l'endroit où
   elles sont nécessaires (aucune eau ambiante affichée avant d'être utile),
   orientation électrostatique, disparition définitive. Chargé après
   cristal.js, avant ui.js. */

function waterScale() {
  /* Rayon de l'oxygène nettement inférieur à celui des ions (rNa ≈ cellSize×0,42,
     rCl ≈ cellSize×0,53) et sans plancher élevé, pour bien rétrécir sur petite
     fenêtre au lieu de rester figé et finir plus gros que les ions du cristal. */
  const waterR = Math.max(4, Math.min(20, state.crystal.cellSize * 0.32));
  return waterR / WATER_MODEL.radius;
}

/* Remet le registre des molécules d'eau actives à zéro (aucune molécule
   affichée tant qu'aucune dissolution n'a démarré). */
function initFreeWater() {
  state.freeWater = [];
}

/* Fait progresser le fondu d'apparition d'une molécule tout juste créée. */
function advanceFadeIns(dt) {
  state.freeWater.forEach(w => {
    if (!w.fadeIn) return;
    w.alpha = Math.min(1, w.alpha + dt / FADE_IN_DURATION);
    if (w.alpha >= 1) w.fadeIn = false;
  });
}

/* Crée une molécule directement à la position donnée (aucune position idle,
   aucun tirage dans un bassin) : elle apparaît en fondu à cet endroit précis,
   choisi par l'appelant (cristal.js) au plus près de l'ion concerné. */
function spawnWaterMolecule(x, y, orient) {
  const w = { x, y, orient, alpha: 0, fadeIn: true };
  state.freeWater.push(w);
  return w;
}

/* Perdue pour de bon : retirée définitivement du registre (aucun fondu de
   sortie — l'ion et ses molécules ont déjà quitté l'écran à ce moment-là). */
function removeWaterMolecule(w) {
  const idx = state.freeWater.indexOf(w);
  if (idx !== -1) state.freeWater.splice(idx, 1);
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
