'use strict';

// ═══════════════════════════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════════════════════════

/* ═══════════════════════════════════════════════════
   draw.js — Rendu canvas de la simulation Lunette astronomique
   ─────────────────────────────────────────────────
   Dépend de : sim.js (sim, RAY_COLORS, cmToX, cmToY, getLensDistCm)
   Expose : cv, ctx, resize, draw, computeRays,
            drawRaysInstant, drawRaysAnim,
            drawSegment, drawSegmentToX, drawArrowHead,
            segLength
════════════════════════════════════════════════════ */

const cv  = document.getElementById('cv');
const ctx = cv.getContext('2d');

/* ─────────────────────────────────────────────────
   resize() — Adapte le canvas à la taille de la fenêtre.
   Recalcule scale, axisY, et repositionne les lentilles.
───────────────────────────────────────────────────── */
function resize() {
  const area = document.getElementById('canvas-area');
  const W = area.clientWidth;
  const H = area.clientHeight;
  cv.width  = W * devicePixelRatio;
  cv.height = H * devicePixelRatio;
  cv.style.width  = W + 'px';
  cv.style.height = H + 'px';
  ctx.scale(devicePixelRatio, devicePixelRatio);
  sim.W = W;
  sim.H = H;
  sim.axisY = H / 2;
  sim.scale = W / 200; // 200 cm de large

  const cx1 = W * 0.35;
  sim.lensX1 = cx1;
  if (sim.systemMode === 'libre') {
    sim.lensX2 = cx1 + (sim.f1 + sim.f2 + 10) * sim.scale;
  }
  enforceLensDistance();
  sim.oeilX = sim.lensX2 + 30 * sim.scale;

  compute();
  sim.rayMode === 'instant' ? draw() : restartAnim();
}

/* ═══════════════════════════════════════════════════
   DESSIN PRINCIPAL
════════════════════════════════════════════════════ */
function draw() {
  const { W, H, view } = sim;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fdf8f0';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(view.tx, view.ty);
  ctx.scale(view.scale, view.scale);

  drawGrid();
  drawAxis();
  drawFocalPoints();

  const rays = computeRays();
  sim._lastRays = rays;

  if (sim.rayMode === 'instant') {
    drawRaysInstant(rays);
  } else {
    drawRaysAnim(rays, sim.animT);
  }

  drawIntermediateImage();
  drawFinalImage();
  drawDirectionLine();
  drawOutputAngle();

  drawLens(sim.lensX1, 'L₁', sim.f1, true);
  drawLens(sim.lensX2, 'L₂', sim.f2, false);
  drawAlphaArrows();
  drawOutputArrows();

  if (sim.oeilActif && sim.systemMode === 'lunette') {
    drawEye();
  }

  ctx.restore();
  drawDefaultBtn();
}

/* ─────────────────────────────────────────────────
   Bouton "Défaut" affiché en surimpression (hors zoom).
───────────────────────────────────────────────────── */
let _defaultBtnRect = null;

function drawDefaultBtn() {
  const txt   = 'Défaut';
  const pad   = 6;
  ctx.font    = 'bold 13px "Segoe UI", Arial, sans-serif';
  const tw    = ctx.measureText(txt).width;
  const bw    = tw + pad * 2;
  const bh    = 24;
  const bx    = sim.W - bw - 10;
  const by    = 10;
  _defaultBtnRect = { x: bx, y: by, w: bw, h: bh };

  ctx.save();
  ctx.fillStyle   = '#e8e4de';
  ctx.strokeStyle = '#b0a898';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle    = '#2c3e50';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(txt, bx + pad, by + bh / 2);
  ctx.restore();
}

function resetView() {
  sim.view.scale = 1;
  sim.view.tx    = 0;
  sim.view.ty    = 0;
  sim.rayMode === 'instant' ? draw() : restartAnim();
}

/* ─────────────────────────────────────────────────
   clientToSim() — Coordonnées CSS → coordonnées logiques canvas
───────────────────────────────────────────────────── */
function clientToSim(clientX, clientY) {
  const rect = cv.getBoundingClientRect();
  const cx   = clientX - rect.left;
  const cy   = clientY - rect.top;
  const { tx, ty, scale } = sim.view;
  return {
    x: (cx - tx) / scale,
    y: (cy - ty) / scale,
  };
}

/* ── Quadrillage 5 cm × 5 cm ── */
function drawGrid() {
  const { W, H, scale, axisY, view } = sim;
  const step = scale * 5;

  ctx.save();
  ctx.strokeStyle = 'rgba(180, 160, 130, 0.25)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();

  const vs = view.scale;
  const xMin = -view.tx / vs;
  const xMax = (W - view.tx) / vs;
  const yMin = -view.ty / vs;
  const yMax = (H - view.ty) / vs;

  const originX = W / 2;
  const xStart = Math.floor((xMin - originX) / step) * step + originX;
  for (let x = xStart; x <= xMax; x += step) { ctx.moveTo(x, yMin); ctx.lineTo(x, yMax); }

  const yStart = Math.floor((yMin - axisY) / step) * step + axisY;
  for (let y = yStart; y <= yMax; y += step)    { ctx.moveTo(xMin, y); ctx.lineTo(xMax, y); }

  ctx.stroke();
  ctx.restore();
}

/* ── Axe optique ── */
function drawAxis() {
  const { W, H, axisY, view } = sim;
  const vs   = view.scale;
  const xMin = -view.tx / vs;
  const xMax = (W - view.tx) / vs;
  ctx.save();
  ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1.5 / vs;
  ctx.setLineDash([8 / vs, 6 / vs]);
  ctx.beginPath(); ctx.moveTo(xMin, axisY); ctx.lineTo(xMax, axisY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/* ── Foyers F1, F'1, F2, F'2 ── */
function drawFocalPoints() {
  const { f1, f2, lensX1, lensX2, axisY } = sim;
  const focalPts = [
    { cm: -f1, lensX: lensX1, label: 'F₁'  },
    { cm:  f1, lensX: lensX1, label: "F'₁" },
    { cm: -f2, lensX: lensX2, label: 'F₂'  },
    { cm:  f2, lensX: lensX2, label: "F'₂" },
  ];

  for (const { cm, lensX, label } of focalPts) {
    const x = lensX + cm * sim.scale;
    if (x < 0 || x > sim.W) continue;
    const vs = sim.view.scale;
    ctx.save();
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2.5 / vs;
    ctx.beginPath();
    ctx.moveTo(x - 9 / vs, axisY); ctx.lineTo(x + 9 / vs, axisY);
    ctx.moveTo(x, axisY - 9 / vs); ctx.lineTo(x, axisY + 9 / vs);
    ctx.stroke();
    ctx.fillStyle = '#1a1a1a'; ctx.font = `bold ${31 / vs}px monospace`;
    ctx.textAlign = cm < 0 ? 'right' : 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, x + (cm < 0 ? -8 / vs : 8 / vs), axisY - 8 / vs);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
}

/* ── Lentille (double flèche verticale) ── */
function drawLens(lensX, label, f, isFirst) {
  const { axisY, scale, LENS_RADIUS_CM, view } = sim;
  const vs  = view.scale;
  const effectiveRadius = vs < 1 ? LENS_RADIUS_CM / vs : LENS_RADIUS_CM;
  const lensHpx = effectiveRadius * scale;
  const top = axisY - lensHpx;
  const bot = axisY + lensHpx;
  const aw  = 9 / vs;
  const ah  = 12 / vs;
  const col = isFirst ? '#8b2800' : '#1a4a8a';

  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 2.5 / vs;

  ctx.beginPath(); ctx.moveTo(lensX, top); ctx.lineTo(lensX, bot); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(lensX - aw, top + ah); ctx.lineTo(lensX, top); ctx.lineTo(lensX + aw, top + ah);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(lensX - aw, bot - ah); ctx.lineTo(lensX, bot); ctx.lineTo(lensX + aw, bot - ah);
  ctx.stroke();

  ctx.fillStyle = col; ctx.font = `bold ${31 / vs}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(label, lensX, top - 4 / vs);
  ctx.textBaseline = 'alphabetic';

  ctx.font = `bold ${31 / vs}px monospace`;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = isFirst ? 'left' : 'right';
  ctx.fillText(isFirst ? 'O₁' : 'O₂', lensX + (isFirst ? 10 / vs : -10 / vs), axisY - 6 / vs);
  ctx.textBaseline = 'alphabetic';

  if (sim.legendeActif && sim.systemMode === 'lunette') {
    ctx.font = `bold ${20 / vs}px "Segoe UI", Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(isFirst ? 'Objectif' : 'Oculaire', lensX, bot + 6 / vs);
    ctx.textBaseline = 'alphabetic';
  }

  ctx.restore();
}

/* ── Flèches A∞ et B∞ côté entrée ── */
function drawAlphaArrows() {
  const { alpha, lensX1, axisY, scale } = sim;
  const vs         = sim.view.scale;
  const alphaRad   = alpha * Math.PI / 180;
  const arrowLen   = 36;
  const margin     = 18;
  const col        = '#7a8a96';

  const aY   = axisY - 28;
  const aX1  = margin + arrowLen;
  const aX2  = margin;

  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(aX1, aY); ctx.lineTo(aX2, aY); ctx.stroke();
  drawArrowHead({ x: aX1, y: aY }, { x: aX2, y: aY }, col, true);
  ctx.fillStyle = col; ctx.font = `bold ${22 / vs}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('A∞', (aX1 + aX2) / 2, aY + 4 / vs);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();

  const cos_a  = Math.cos(alphaRad);
  const sin_a  = Math.sin(alphaRad);
  const bX2    = margin;
  const bY2    = axisY - 80;
  const bX1    = bX2 + arrowLen * cos_a;
  const bY1    = bY2 + arrowLen * sin_a;

  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bX1, bY1); ctx.lineTo(bX2, bY2); ctx.stroke();
  drawArrowHead({ x: bX1, y: bY1 }, { x: bX2, y: bY2 }, col, true);
  const bLx = (bX1 + bX2) / 2;
  const bLy = Math.max(bY1, bY2) + 4;
  ctx.fillStyle = col; ctx.font = `bold ${22 / vs}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('B∞', bLx, bLy + 4 / vs);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();

  if (alpha !== 0) {
    if (sim.rayMode === 'anim' && sim.animT < (sim._fracL1 ?? 1.0)) return;
    const arcR      = 30;
    const angleAxis = Math.PI;
    const angleRay  = Math.PI + alphaRad;
    const aStart    = alphaRad >= 0 ? angleAxis : angleRay;
    const aEnd      = alphaRad >= 0 ? angleRay  : angleAxis;
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(lensX1, axisY, arcR, aStart, aEnd); ctx.stroke();
    const aMid = (aStart + aEnd) / 2;
    const lx = lensX1 + (arcR + 12) * Math.cos(aMid);
    const ly = axisY  + (arcR + 12) * Math.sin(aMid);
    ctx.fillStyle = col; ctx.font = `bold ${25 / vs}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('α', lx, ly);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
}

/* ── Flèches A'∞ et B'∞ côté sortie (mode afocal) ── */
function drawOutputArrows() {
  if (!sim.isAfocal) return;
  if (sim.rayMode === 'anim' && sim.animT < 1.0) return;

  const { alpha, lensX2, axisY, W, H, f1, f2, scale } = sim;
  const vs        = sim.view.scale;
  const alphaRad  = alpha * Math.PI / 180;
  const alpha2Rad = Math.atan(-f1 / f2 * Math.tan(alphaRad));
  const arrowLen  = 36;
  const margin    = 18;
  const col       = '#7a8a96';

  const aY  = axisY + 28;
  const aX1 = margin + arrowLen;
  const aX2 = margin;

  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(aX1, aY); ctx.lineTo(aX2, aY); ctx.stroke();
  drawArrowHead({ x: aX1, y: aY }, { x: aX2, y: aY }, col, true);
  ctx.fillStyle = col; ctx.font = `bold ${22 / vs}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText("A'∞", (aX1 + aX2) / 2, aY + 4 / vs);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();

  const bTargetX = 300;
  let bRefY = axisY - 80;
  if (sim._lastRays) {
    const mainRay = sim._lastRays.find(r => r.isMain);
    if (mainRay) {
      const vSeg = mainRay.segs.find(s => s.virtual && s.pts[1] && s.pts[1].x < lensX2);
      if (vSeg) {
        const p0 = vSeg.pts[0], p1 = vSeg.pts[1];
        const t  = (bTargetX - p0.x) / (p1.x - p0.x);
        bRefY    = p0.y + t * (p1.y - p0.y);
      }
    }
  }
  bRefY = Math.max(30, Math.min(H - 30, bRefY));

  const cos_a2 = Math.cos(alpha2Rad);
  const sin_a2 = Math.sin(alpha2Rad);
  const bX2 = bTargetX;
  const bY2 = bRefY;
  const bX1 = bX2 + arrowLen * cos_a2;
  const bY1 = bY2 + arrowLen * sin_a2;

  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bX1, bY1); ctx.lineTo(bX2, bY2); ctx.stroke();
  drawArrowHead({ x: bX1, y: bY1 }, { x: bX2, y: bY2 }, col, true);
  const bLx = (bX1 + bX2) / 2;
  const bLy = Math.min(bY1, bY2) - 4;
  ctx.fillStyle = col; ctx.font = `bold ${22 / vs}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText("B'∞", bLx, bLy - 4 / vs);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

/* ── Image intermédiaire A1B1 ── */
function drawIntermediateImage() {
  const { O1A1, h1, lensX1, axisY, rayMode, animT } = sim;
  if (!isFinite(O1A1) || Math.abs(O1A1) > 800) return;
  if (rayMode === 'anim' && animT < (sim._fracA1 ?? 1.0)) return;

  const vs = sim.view.scale;
  const x  = lensX1 + O1A1 * sim.scale;
  const yA = axisY;
  const yB = cmToY(h1);

  const isReal  = O1A1 > 0;
  const col     = isReal ? '#2a8060' : '#b04020';
  const dash    = isReal ? [] : [5, 4];
  const arrowDir = h1 >= 0 ? 1 : -1;

  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x, yA); ctx.lineTo(x, yB); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 7, yB + arrowDir * 12);
  ctx.lineTo(x, yB);
  ctx.lineTo(x + 7, yB + arrowDir * 12);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = col; ctx.font = `bold ${31 / vs}px monospace`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('A₁', x + 6, yA + 6 / vs);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('B₁', x + 6, yB + (h1 >= 0 ? -8 / vs : 28 / vs));
  ctx.restore();
}

/* ── Image finale A2B2 (mode non afocal) ── */
function drawFinalImage() {
  const { O2A2, h2, lensX2, isAfocal, rayMode, animT } = sim;
  if (isAfocal) return;
  if (!isFinite(O2A2) || Math.abs(O2A2) > 800) return;
  if (rayMode === 'anim' && animT < (sim._fracA2 ?? 1.0)) return;

  const vs = sim.view.scale;
  const x  = lensX2 + O2A2 * sim.scale;
  const yA = sim.axisY;
  const yB = cmToY(h2);

  const isReal = O2A2 > 0;
  const col    = isReal ? '#2a6aaa' : '#b04020';
  const dash   = isReal ? [] : [5, 4];
  const arrowDir = h2 >= 0 ? 1 : -1;

  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x, yA); ctx.lineTo(x, yB); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 7, yB + arrowDir * 12);
  ctx.lineTo(x, yB);
  ctx.lineTo(x + 7, yB + arrowDir * 12);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = col; ctx.font = `bold ${31 / vs}px monospace`;
  ctx.textAlign = 'left';
  ctx.fillText('A₂', x + 6, yA + (h2 >= 0 ? 28 / vs : -10 / vs));
  ctx.fillText('B₂', x + 6, yB + (h2 >= 0 ? -8 / vs : 28 / vs));
  ctx.restore();
}

/* ── Trait de direction B1 → O2 ── */
function drawDirectionLine() {
  const { O1A1, h1, lensX1, lensX2, axisY, W, rayMode, animT } = sim;
  if (!isFinite(O1A1) || Math.abs(O1A1) > 800) return;
  if (Math.abs(h1) < 0.05) return;
  if (rayMode === 'anim' && animT < (sim._fracA1 ?? 1.0)) return;

  const xB1 = lensX1 + O1A1 * sim.scale;
  const yB1 = cmToY(h1);
  const xO2 = lensX2;
  const yO2 = axisY;

  const dx = xO2 - xB1;
  const dy = yO2 - yB1;
  if (Math.abs(dx) < 0.1) return;

  const t_right = (W - xO2) / dx;
  const xEnd = xO2 + dx * t_right;
  const yEnd = yO2 + dy * t_right;

  ctx.save();
  ctx.strokeStyle = 'rgba(160,160,160,0.55)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(xB1, yB1);
  ctx.lineTo(xEnd, yEnd);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/* ── Arc d'angle de sortie (mode afocal) ── */
function drawOutputAngle() {
  if (!sim.isAfocal) return;
  if (sim.rayMode === 'anim' && sim.animT < (sim._fracA1 ?? 1.0)) return;

  const { f1, f2, alpha, lensX2, axisY } = sim;
  const alphaRad  = alpha * Math.PI / 180;
  const alphaSortie    = -f1/f2 * Math.tan(alphaRad);
  const alphaSortieRad = Math.atan(alphaSortie);

  if (Math.abs(alphaSortieRad) > 0.005) {
    const vs     = sim.view.scale;
    const arcR   = 32;
    const aStart = 0;
    const aEnd   = alphaSortieRad;

    ctx.save();
    ctx.strokeStyle = '#2a6aaa'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(lensX2, axisY, arcR, aStart, aEnd, alphaSortieRad < 0); ctx.stroke();

    const aMid = (aStart + aEnd) / 2;
    const lx = lensX2 + (arcR + 12) * Math.cos(aMid);
    const ly = axisY  + (arcR + 12) * Math.sin(aMid);
    ctx.fillStyle = '#2a6aaa'; ctx.font = `bold ${25 / vs}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText("α'", lx, ly);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
}

/* ── Œil : cristallin, rétine et image sur rétine ── */
function drawEye() {
  const { oeilX, axisY, scale, EYE_IRIS_TO_LENS, EYE_FLENS, view } = sim;
  const crystalX  = oeilX + EYE_IRIS_TO_LENS * scale;
  const retinaX   = crystalX + EYE_FLENS * scale;
  const vs = view.scale;
  const effectiveRadius = vs < 1 ? sim.LENS_RADIUS_CM / vs : sim.LENS_RADIUS_CM;
  const eyeR = effectiveRadius * scale;

  ctx.save();

  // ── Cristallin ──
  const lensH = eyeR;
  const aw = 10, ah = 14;
  ctx.strokeStyle = '#5a3a8a'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(crystalX, axisY - lensH); ctx.lineTo(crystalX, axisY + lensH); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(crystalX - aw, axisY - lensH + ah); ctx.lineTo(crystalX, axisY - lensH); ctx.lineTo(crystalX + aw, axisY - lensH + ah);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(crystalX - aw, axisY + lensH - ah); ctx.lineTo(crystalX, axisY + lensH); ctx.lineTo(crystalX + aw, axisY + lensH - ah);
  ctx.stroke();
  ctx.fillStyle = '#5a3a8a'; ctx.font = `bold ${20 / vs}px "Segoe UI", Arial`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText('Cristallin', crystalX - 6 / vs, axisY - lensH - 5 / vs);
  ctx.textBaseline = 'alphabetic';

  ctx.strokeStyle = '#888'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(retinaX - 5, axisY); ctx.lineTo(retinaX + 5, axisY);
  ctx.moveTo(retinaX, axisY - 5); ctx.lineTo(retinaX, axisY + 5);
  ctx.stroke();

  // ── Rétine ──
  ctx.strokeStyle = '#c05020'; ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(retinaX, axisY - eyeR); ctx.lineTo(retinaX, axisY + eyeR);
  ctx.stroke();
  ctx.fillStyle = '#c05020'; ctx.font = `bold ${20 / vs}px "Segoe UI", Arial`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText('Rétine', retinaX + 6 / vs, axisY - eyeR - 5 / vs);
  ctx.textBaseline = 'alphabetic';

  // ── Image A₃B₃ sur la rétine ──
  const { OeyeA3, h3, rayMode, animT } = sim;
  if (isFinite(OeyeA3) && Math.abs(OeyeA3) < 800 && isFinite(h3) && Math.abs(h3) > 0.001) {
    const showImg = (rayMode === 'instant') || (animT >= (sim._fracA3 ?? 1.0));
    if (showImg) {
      const imgX      = crystalX + OeyeA3 * scale;
      const imgYA     = axisY;
      const imgYB     = cmToY(h3);
      const arrowDir  = h3 >= 0 ? 1 : -1;
      const imgIsReal = OeyeA3 > 0;
      const imgCol    = imgIsReal ? '#2a6aaa' : '#b04020';
      const imgDash   = imgIsReal ? [] : [4, 3];

      ctx.save();
      ctx.strokeStyle = imgCol; ctx.lineWidth = 2; ctx.setLineDash(imgDash);
      ctx.beginPath(); ctx.moveTo(imgX, imgYA); ctx.lineTo(imgX, imgYB); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(imgX - 6, imgYB + arrowDir * 10);
      ctx.lineTo(imgX, imgYB);
      ctx.lineTo(imgX + 6, imgYB + arrowDir * 10);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = imgCol; ctx.font = `bold ${26 / vs}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText("A'", imgX + 5, imgYA + (h3 >= 0 ? 22 / vs : -8 / vs));
      ctx.fillText("B'", imgX + 5, imgYB + (h3 >= 0 ? -6 / vs : 22 / vs));
      ctx.restore();
    }
  }

  ctx.restore();
}

/* ═══════════════════════════════════════════════════
   CALCUL DES RAYONS
════════════════════════════════════════════════════ */
function computeRays() {
  const { f1, f2, alpha, nRays, LENS_RADIUS_CM, lensX1, lensX2, axisY, W, scale,
          oeilActif, systemMode, oeilX, EYE_IRIS_TO_LENS, EYE_FLENS } = sim;
  const alphaRad = alpha * Math.PI / 180;
  const tanAlpha = Math.tan(alphaRad);
  const d = getLensDistCm();

  const withEye   = oeilActif && systemMode === 'lunette';
  const crystalXpx = oeilX + EYE_IRIS_TO_LENS * scale;
  const retinaXpx  = crystalXpx + EYE_FLENS * scale;
  const fEye       = EYE_FLENS;

  const vs = sim.view.scale;
  const MAX_ZONE = W / 0.3 + W * 0.8;
  const xLeftPx  = sim.rayMode === 'anim' ? -80      : -MAX_ZONE;
  const xRightPx = sim.rayMode === 'anim' ?  W + 80  :  MAX_ZONE;

  // ── Hauteurs yi des rayons sur L1 ──
  const R  = LENS_RADIUS_CM;
  const Rc = R / 2;
  let yiList = [], colorList = [], isMainList = [];

  if (nRays === 3) {
    yiList    = [Rc, 0, -Rc];
    colorList = [...RAY_COLORS];
    isMainList = [true, true, true];
  } else {
    const positions = [];
    for (let k = 0; k < nRays; k++) {
      positions.push(-R + k * (2 * R) / (nRays - 1));
    }
    const canonical = [Rc, 0, -Rc];
    for (const c of canonical) {
      let bestIdx = 0, bestDist = Infinity;
      for (let i = 0; i < positions.length; i++) {
        const dd = Math.abs(positions[i] - c);
        if (dd < bestDist) { bestDist = dd; bestIdx = i; }
      }
      positions[bestIdx] = c;
    }
    positions.sort((a, b) => b - a);
    yiList = []; colorList = []; isMainList = [];
    for (const y of positions) {
      const idx = canonical.indexOf(y);
      if (idx >= 0) {
        yiList.push(y); colorList.push(RAY_COLORS[idx]); isMainList.push(true);
      } else {
        yiList.push(y); colorList.push('#7a8a96'); isMainList.push(false);
      }
    }
  }

  const O2A1 = sim.O1A1 - d;

  const rays = [];
  for (let ri = 0; ri < yiList.length; ri++) {
    const yi1    = yiList[ri];
    const color  = colorList[ri];
    const isMain = isMainList[ri];

    const slopeIn   = -tanAlpha;
    const slopeOut1 = slopeIn - yi1 / f1;
    const yi2       = yi1 + slopeOut1 * d;
    const slopeOut2 = slopeOut1 - yi2 / f2;

    const segs = [];

    segs.push({ pts: [
      { x: xLeftPx, y: cmToY(yi1 + slopeIn * ((xLeftPx - lensX1) / scale)) },
      { x: lensX1,  y: cmToY(yi1) }
    ], virtual: false });

    segs.push({ pts: [
      { x: lensX1, y: cmToY(yi1) },
      { x: lensX2, y: cmToY(yi2) }
    ], virtual: false });

    if (O2A1 > 0 && !sim.isAfocal && isFinite(O2A1) && Math.abs(O2A1) < 800) {
      const yAtA1 = yi2 + slopeOut1 * O2A1;
      segs.push({ pts: [
        { x: lensX2,                    y: cmToY(yi2) },
        { x: lensX2 + O2A1 * scale,     y: cmToY(yAtA1) }
      ], virtual: true });
    }

    if (withEye) {
      const O2toCrystalCm = (crystalXpx - lensX2) / scale;
      const yCrystal      = yi2 + slopeOut2 * O2toCrystalCm;
      const slopeEyeOut   = slopeOut2 - yCrystal / fEye;
      const yRetina       = yCrystal + slopeEyeOut * fEye;

      segs.push({ pts: [
        { x: lensX2,     y: cmToY(yi2) },
        { x: crystalXpx, y: cmToY(yCrystal) }
      ], virtual: false });

      segs.push({ pts: [
        { x: crystalXpx, y: cmToY(yCrystal) },
        { x: retinaXpx,  y: cmToY(yRetina) }
      ], virtual: false });

      if (sim.isAfocal) {
        segs.push({ pts: [
          { x: lensX2,  y: cmToY(yi2) },
          { x: xLeftPx, y: cmToY(yi2 + slopeOut2 * ((xLeftPx - lensX2) / scale)) }
        ], virtual: true });
      }

    } else if (sim.isAfocal || !isFinite(sim.O2A2) || Math.abs(sim.O2A2) > 800) {
      segs.push({ pts: [
        { x: lensX2,   y: cmToY(yi2) },
        { x: xRightPx, y: cmToY(yi2 + slopeOut2 * ((xRightPx - lensX2) / scale)) }
      ], virtual: false });
      segs.push({ pts: [
        { x: lensX2,  y: cmToY(yi2) },
        { x: xLeftPx, y: cmToY(yi2 + slopeOut2 * ((xLeftPx - lensX2) / scale)) }
      ], virtual: true });
    } else if (sim.O2A2 > 0) {
      const yAtA2 = yi2 + slopeOut2 * sim.O2A2;
      segs.push({ pts: [
        { x: lensX2,                      y: cmToY(yi2) },
        { x: lensX2 + sim.O2A2 * scale,   y: cmToY(yAtA2) }
      ], virtual: false });
      segs.push({ pts: [
        { x: lensX2 + sim.O2A2 * scale,   y: cmToY(yAtA2) },
        { x: xRightPx,                     y: cmToY(yi2 + slopeOut2 * ((xRightPx - lensX2) / scale)) }
      ], virtual: false });
    } else {
      segs.push({ pts: [
        { x: lensX2,   y: cmToY(yi2) },
        { x: xRightPx, y: cmToY(yi2 + slopeOut2 * ((xRightPx - lensX2) / scale)) }
      ], virtual: false });
      const yAtImg = yi2 + slopeOut2 * sim.O2A2;
      segs.push({ pts: [
        { x: lensX2,                    y: cmToY(yi2) },
        { x: lensX2 + sim.O2A2 * scale, y: cmToY(yAtImg) }
      ], virtual: true });
    }

    rays.push({ color, segs, isMain, dTotal: 0 });
  }

  const dTotal = rays.length > 0
    ? Math.max(...rays.map(r => r.segs.filter(s => !s.virtual).reduce((acc, s) => acc + segLength(s.pts), 0)))
    : 1;
  sim._animDTotal = dTotal;
  for (const ray of rays) ray.dTotal = dTotal;
  sim._animXLeft  = xLeftPx;
  sim._animXRight = xRightPx;

  function fracAtX(targetXpx) {
    const range = xRightPx - xLeftPx;
    return Math.min(1.0, Math.max(0, (targetXpx - xLeftPx) / range));
  }

  sim._fracL1 = fracAtX(lensX1);
  sim._fracA1 = fracAtX(lensX1 + sim.O1A1 * scale);

  if (!sim.isAfocal && isFinite(sim.O2A2) && Math.abs(sim.O2A2) < 800) {
    sim._fracA2 = fracAtX(lensX2 + sim.O2A2 * scale);
  } else {
    sim._fracA2 = 1.0;
  }

  if (sim.oeilActif && sim.systemMode === 'lunette') {
    const cxPx = sim.oeilX + sim.EYE_IRIS_TO_LENS * scale;
    sim._fracA3 = fracAtX(cxPx + sim.OeyeA3 * scale);
  } else {
    sim._fracA3 = 1.0;
  }

  return rays;
}

/* ── Tracé instantané ── */
function drawRaysInstant(rays) {
  for (const ray of rays) {
    for (const seg of ray.segs) {
      drawSegment(seg.pts, ray.color, seg.virtual, 1.0, ray.isMain);
    }
  }
}

/* ── Tracé animé — front d'onde horizontal ── */
function drawRaysAnim(rays, t) {
  const xLeft  = sim._animXLeft  ?? -80;
  const xRight = sim._animXRight ?? (sim.W + 80);
  const currentX = xLeft + t * (xRight - xLeft);

  for (const ray of rays) {
    const realSegs = ray.segs.filter(s => !s.virtual);
    for (const seg of realSegs) {
      const x0 = seg.pts[0].x;
      const x1 = seg.pts[seg.pts.length - 1].x;
      if (currentX <= x0) continue;
      if (currentX >= x1) {
        drawSegment(seg.pts, ray.color, false, 1.0, ray.isMain);
      } else {
        drawSegmentToX(seg.pts, ray.color, ray.isMain, currentX);
      }
    }
    if (t >= 1.0) {
      for (const seg of ray.segs.filter(s => s.virtual)) {
        drawSegment(seg.pts, ray.color, true, 1.0, ray.isMain);
      }
    }
  }
}

/* ── Longueur d'une polyligne ── */
function segLength(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
    l += Math.sqrt(dx*dx + dy*dy);
  }
  return l;
}

/* ── Dessine un segment avec progression frac ── */
function drawSegment(pts, color, virtual, frac, isMain = true) {
  if (pts.length < 2) return;
  const targetLen = frac * segLength(pts);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = virtual ? 1.4 : (isMain ? 2.0 : 1.3);
  ctx.globalAlpha = virtual ? 0.5 : (isMain ? 1.0 : 0.65);
  ctx.lineCap = 'round';
  if (virtual) ctx.setLineDash([6, 5]);

  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  let covered = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
    const sLen = Math.sqrt(dx*dx + dy*dy);
    const rem  = targetLen - covered;
    if (rem >= sLen) { ctx.lineTo(pts[i].x, pts[i].y); covered += sLen; }
    else { const t = rem / sLen; ctx.lineTo(pts[i-1].x + dx*t, pts[i-1].y + dy*t); break; }
  }
  ctx.stroke();

  if (frac >= 1.0 && !virtual) drawArrowHead(pts[pts.length-2], pts[pts.length-1], color, isMain);
  ctx.restore();
}

/* ── Tracé d'un segment jusqu'à un X donné ── */
function drawSegmentToX(pts, color, isMain, targetX) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = isMain ? 2.0 : 1.3;
  ctx.globalAlpha = isMain ? 1.0 : 0.65;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const x0 = pts[i-1].x, y0 = pts[i-1].y;
    const x1 = pts[i].x,   y1 = pts[i].y;
    if (targetX >= x1) {
      ctx.lineTo(x1, y1);
    } else {
      const t = (targetX - x0) / (x1 - x0);
      ctx.lineTo(x0 + t * (x1 - x0), y0 + t * (y1 - y0));
      break;
    }
  }
  ctx.stroke();
  ctx.restore();
}

/* ── Petite flèche directionnelle ── */
function drawArrowHead(from, to, color, isMain = true) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.sqrt(dx*dx + dy*dy);
  if (len < 2) return;
  const ux = dx/len, uy = dy/len;
  const mx = (from.x + to.x)/2, my = (from.y + to.y)/2;
  const aLen = isMain ? 9 : 7, aHalf = isMain ? 5 : 3.5;
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = isMain ? 1.0 : 0.65;
  ctx.beginPath();
  ctx.moveTo(mx + ux*aLen/2, my + uy*aLen/2);
  ctx.lineTo(mx - ux*aLen/2 - uy*aHalf, my - uy*aLen/2 + ux*aHalf);
  ctx.lineTo(mx - ux*aLen/2 + uy*aHalf, my - uy*aLen/2 - ux*aHalf);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
