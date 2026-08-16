'use strict';

// ═══════════════════════════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════════════════════════

/* ═══════════════════════════════════════════════════
   draw.js — Rendu canvas de la simulation Lunette astronomique
   ─────────────────────────────────────────────────
   Dépend de : sim.js (sim, RAY_COLORS, xToPx, hToPx, getLensDistCm…)
   Expose : cv, ctx, resize, draw, computeRays,
            drawRaysInstant, drawRaysAnim,
            drawSegment, drawSegmentToX, drawArrowHead,
            segLength, resetView, clientToCanvas

   Le canvas n'est jamais transformé : le zoom agit sur la conversion
   cm → px (sim.scale), le panoramique sur l'origine (sim.originXpx).
   Les traits, les textes et la hauteur des lentilles restent donc en
   pixels réels, sans division correctrice.
════════════════════════════════════════════════════ */

const cv  = document.getElementById('cv');
const ctx = cv.getContext('2d');

/* ═══════════════════════════════════════════════════
   ÉCHELLE DE L'INTERFACE
   ─────────────────────────────────────────────────
   Polices, épaisseurs de trait et géométries décoratives sont posées
   pour un canvas de référence 1200 × 700 px, puis remises à l'échelle.
   L'homothétie est bornée : sous FS_MIN le texte devient illisible,
   au-dessus de FS_MAX il écrase le schéma.

   À ne pas confondre avec sim.scale, qui convertit les centimètres en
   pixels : ce qui passe par fs() ne dépend ni du zoom ni de la physique.
════════════════════════════════════════════════════ */
const FS_REF_W = 1200, FS_REF_H = 700;
const FS_MIN   = 0.55, FS_MAX   = 1.25;

function uiScale() {
  const k = Math.min(sim.W / FS_REF_W, sim.H / FS_REF_H);
  return Math.max(FS_MIN, Math.min(FS_MAX, k));
}
function fs(base) { return base * uiScale(); }

/* ─────────────────────────────────────────────────
   resize() — Adapte le canvas à la taille de la fenêtre.
   Ne détruit plus l'état : les positions sont en cm. Seul le cadrage
   est recalculé, en gardant immobile le point de scène qui occupait
   le centre du canvas.
───────────────────────────────────────────────────── */
function resize() {
  const area = document.getElementById('canvas-area');
  const W = area.clientWidth;
  const H = area.clientHeight;
  cv.width  = W * devicePixelRatio;
  cv.height = H * devicePixelRatio;
  cv.style.width  = W + 'px';
  cv.style.height = H + 'px';
  // setTransform et non scale : ctx.scale() se compose avec la transformation
  // déjà en place, et se multipliait donc à chaque redimensionnement.
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

  const first       = sim.W === 0;
  const cmAtCenter  = first ? 0 : pxToX(sim.W / 2);

  sim.W = W;
  sim.H = H;
  sim.axisY = H / 2;

  // Largeur de scène visible au zoom 1 : VIEW_SPAN_CM sur un canvas large,
  // resserrée sur les canvas étroits pour conserver au moins MIN_PX_PER_CM.
  const spanCm = Math.min(VIEW_SPAN_CM,
                          Math.max(MIN_SPAN_CM, W / MIN_PX_PER_CM));
  sim.baseScale = W / spanCm;

  // Demi-hauteur des lentilles, en PIXELS : fixe une fois la fenêtre
  // dimensionnée. La borne sur H évite que leurs pointes ou le faisceau de
  // rayons soient rognés en écran bas. applyScale() en déduit l'ouverture
  // en cm selon le zoom.
  sim.lensHpx = Math.min(LENS_RADIUS_MAX_CM * sim.baseScale, H * 0.42);
  applyScale();

  if (first) {
    sim.x1 = spanCm * 0.30;
    if (sim.systemMode === 'libre') sim.x2 = sim.x1 + sim.f1 + sim.f2 + 10;
    sim.xOeil = sim.x2 + 30;
    enforceLensDistance();
    centerScene();
  } else {
    sim.originXpx = W / 2 - cmAtCenter * sim.scale;
    clampPan();
  }

  compute();
  sim.rayMode === 'instant' ? draw() : restartAnim();
}

/* ═══════════════════════════════════════════════════
   DESSIN PRINCIPAL
════════════════════════════════════════════════════ */
function draw() {
  const { W, H } = sim;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fdf8f0';
  ctx.fillRect(0, 0, W, H);

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

  drawLens(sim.x1, 'L₁', true);
  drawLens(sim.x2, 'L₂', false);
  drawAlphaArrows();
  drawOutputArrows();

  if (sim.oeilActif && sim.systemMode === 'lunette') {
    drawEye();
  }

  drawScaleBar();
  drawDefaultBtn();
}

/* ═══════════════════════════════════════════════════
   BARRE D'ÉCHELLE
   ─────────────────────────────────────────────────
   Puisque la molette change l'échelle, le schéma n'est plus lisible sans
   repère métrique explicite. On choisit dans la série 1-2-5 la plus grande
   longueur ronde qui tient sous BAR_MAX_PX, et on la dessine graduée en
   cinq intervalles, en bas à gauche du canvas.
════════════════════════════════════════════════════ */
const BAR_MAX_PX = 170;
const BAR_STEPS  = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];

function drawScaleBar() {
  const { H, scale } = sim;

  // Plus grande graduation ronde dont la longueur reste sous le plafond.
  let stepCm = BAR_STEPS[0];
  for (const s of BAR_STEPS) {
    if (s * scale <= fs(BAR_MAX_PX)) stepCm = s; else break;
  }
  const lenPx = stepCm * scale;

  const x0    = fs(16);
  const y     = H - fs(20);
  const tickH = fs(6);

  const label = (stepCm < 1 ? stepCm.toFixed(1).replace('.', ',') : String(stepCm)) + ' cm';

  ctx.save();
  ctx.strokeStyle = '#7a6a52';
  ctx.fillStyle   = '#7a6a52';
  ctx.lineWidth   = fs(1.6);
  ctx.lineCap     = 'butt';
  ctx.textBaseline = 'alphabetic';

  // Trait principal + montants d'extrémité
  ctx.beginPath();
  ctx.moveTo(x0, y); ctx.lineTo(x0 + lenPx, y);
  ctx.moveTo(x0, y - tickH); ctx.lineTo(x0, y + tickH);
  ctx.moveTo(x0 + lenPx, y - tickH); ctx.lineTo(x0 + lenPx, y + tickH);
  ctx.stroke();

  // Graduations intermédiaires (cinquièmes), plus courtes
  ctx.lineWidth = fs(1);
  ctx.beginPath();
  for (let k = 1; k < 5; k++) {
    const xk = x0 + lenPx * k / 5;
    ctx.moveTo(xk, y); ctx.lineTo(xk, y - tickH * 0.6);
  }
  ctx.stroke();

  ctx.font = `${fs(12).toFixed(1)}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(label, x0, y - tickH - fs(4));

  // Facteur de zoom, en retrait, seulement s'il diffère de 1.
  if (Math.abs(sim.zoom - 1) > 0.02) {
    ctx.fillStyle = 'rgba(122,106,82,0.65)';
    ctx.font = `${fs(11).toFixed(1)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText('×' + sim.zoom.toFixed(2).replace('.', ','), x0, y + tickH + fs(12));
  }
  ctx.restore();
}

/* ─────────────────────────────────────────────────
   Bouton "Défaut" affiché en surimpression.
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

/* ── Retour au cadrage nominal : zoom 1, système centré ── */
function resetView() {
  centerScene();
  sim.rayMode === 'instant' ? draw() : restartAnim();
}

/* ─────────────────────────────────────────────────
   clientToCanvas() — Coordonnées écran → pixels canvas.
───────────────────────────────────────────────────── */
function clientToCanvas(clientX, clientY) {
  const rect = cv.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

/* ── Quadrillage à pas adaptatif (série 1-2-5) ──
   Un pas fixe de 5 cm produit des lignes à 8 px d'écart sur un canvas
   étroit — le quadrillage vire au moiré — et des cases immenses en zoom
   avant. On monte donc dans la série jusqu'à obtenir au moins GRID_MIN_PX
   entre deux lignes, et on renforce une ligne sur cinq pour garder un
   repère de lecture. */
const GRID_MIN_PX = 9;
const GRID_STEPS  = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

function drawGrid() {
  const { W, H, scale, axisY, originXpx } = sim;

  let stepCm = GRID_STEPS[GRID_STEPS.length - 1];
  for (const s of GRID_STEPS) {
    if (s * scale >= GRID_MIN_PX) { stepCm = s; break; }
  }
  const minor = stepCm * scale;

  ctx.save();
  ctx.lineWidth = 0.5;
  for (const [period, color] of [[minor,     'rgba(180, 160, 130, 0.22)'],
                                 [minor * 5, 'rgba(180, 160, 130, 0.45)']]) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    // Le quadrillage est calé sur le zéro de l'axe des cm et sur l'axe optique.
    const x0 = ((originXpx % period) + period) % period;
    for (let x = x0; x <= W; x += period) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    const y0 = ((axisY % period) + period) % period;
    for (let y = y0; y <= H; y += period) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }
  ctx.restore();
}

/* ── Axe optique ── */
function drawAxis() {
  const { W, axisY } = sim;
  ctx.save();
  ctx.strokeStyle = '#aaa'; ctx.lineWidth = fs(1.5);
  ctx.setLineDash([fs(8), fs(6)]);
  ctx.beginPath(); ctx.moveTo(0, axisY); ctx.lineTo(W, axisY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/* ── Foyers F1, F'1, F2, F'2 ──
   Les quatre foyers se resserrent dès que les focales sont courtes ou les
   lentilles proches, et F'₁ se confond avec F₂ dans le réglage afocal —
   c'est-à-dire précisément dans la configuration étudiée. Les étiquettes
   sont donc placées en deux rangs : celle qui empiéterait sur la
   précédente bascule sous l'axe. */
function drawFocalPoints() {
  const { f1, f2, x1, x2, axisY } = sim;

  const font = fs(31);
  const arm  = fs(9);
  const gap  = fs(8);
  ctx.font = `bold ${font.toFixed(1)}px monospace`;

  const marks = [
    { cm: -f1, xLens: x1, label: 'F₁'  },
    { cm:  f1, xLens: x1, label: "F'₁" },
    { cm: -f2, xLens: x2, label: 'F₂'  },
    { cm:  f2, xLens: x2, label: "F'₂" },
  ]
    .map(m => {
      const x = xToPx(m.xLens + m.cm);
      const w = ctx.measureText(m.label).width;
      // L'étiquette s'écarte du foyer du côté opposé à sa lentille.
      const left = m.cm < 0 ? x - gap - w : x + gap;
      return { ...m, x, left, right: left + w };
    })
    .filter(m => m.right > 0 && m.left < sim.W)
    .sort((a, b) => a.left - b.left);

  let occupiedRight = -Infinity;   // bord droit de la dernière étiquette du rang haut

  for (const m of marks) {
    const below = m.left < occupiedRight;
    if (!below) occupiedRight = m.right;

    ctx.save();
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = fs(2.5);
    ctx.beginPath();
    ctx.moveTo(m.x - arm, axisY); ctx.lineTo(m.x + arm, axisY);
    ctx.moveTo(m.x, axisY - arm); ctx.lineTo(m.x, axisY + arm);
    ctx.stroke();
    ctx.fillStyle = '#1a1a1a';
    ctx.font = `bold ${font.toFixed(1)}px monospace`;
    ctx.textAlign = m.cm < 0 ? 'right' : 'left';
    ctx.fillText(m.label,
                 m.x + (m.cm < 0 ? -gap : gap),
                 below ? axisY + font * 0.95 : axisY - gap);
    ctx.restore();
  }
}

/* ── Lentille (double flèche verticale) ── */
function drawLens(xCm, label, isFirst) {
  const { axisY, lensHpx } = sim;
  const lensX = xToPx(xCm);
  const top = axisY - lensHpx;
  const bot = axisY + lensHpx;
  const aw  = fs(9);
  const ah  = fs(12);
  const col = isFirst ? '#8b2800' : '#1a4a8a';

  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = fs(2.5);

  ctx.beginPath(); ctx.moveTo(lensX, top); ctx.lineTo(lensX, bot); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(lensX - aw, top + ah); ctx.lineTo(lensX, top); ctx.lineTo(lensX + aw, top + ah);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(lensX - aw, bot - ah); ctx.lineTo(lensX, bot); ctx.lineTo(lensX + aw, bot - ah);
  ctx.stroke();

  ctx.fillStyle = col; ctx.font = `bold ${fs(31).toFixed(1)}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(label, lensX, top - fs(4));
  ctx.textBaseline = 'alphabetic';

  ctx.textBaseline = 'bottom';
  ctx.textAlign = isFirst ? 'left' : 'right';
  ctx.fillText(isFirst ? 'O₁' : 'O₂', lensX + (isFirst ? fs(10) : -fs(10)), axisY - fs(6));
  ctx.textBaseline = 'alphabetic';

  if (sim.legendeActif && sim.systemMode === 'lunette') {
    ctx.font = `bold ${fs(20).toFixed(1)}px "Segoe UI", Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(isFirst ? 'Objectif' : 'Oculaire', lensX, bot + fs(6));
    ctx.textBaseline = 'alphabetic';
  }

  ctx.restore();
}

/* ── Flèches A∞ et B∞ côté entrée ── */
function drawAlphaArrows() {
  const { alpha, axisY } = sim;
  const lensX1     = xToPx(sim.x1);
  const alphaRad   = alpha * Math.PI / 180;
  const arrowLen   = fs(36);
  const margin     = fs(18);
  const col        = '#7a8a96';

  const aY   = axisY - fs(28);
  const aX1  = margin + arrowLen;
  const aX2  = margin;

  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = fs(1.8); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(aX1, aY); ctx.lineTo(aX2, aY); ctx.stroke();
  drawArrowHead({ x: aX1, y: aY }, { x: aX2, y: aY }, col, true);
  ctx.fillStyle = col; ctx.font = `bold ${fs(22).toFixed(1)}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('A∞', (aX1 + aX2) / 2, aY + fs(4));
  ctx.textBaseline = 'alphabetic';
  ctx.restore();

  const cos_a  = Math.cos(alphaRad);
  const sin_a  = Math.sin(alphaRad);
  const bX2    = margin;
  const bY2    = axisY - fs(80);
  const bX1    = bX2 + arrowLen * cos_a;
  const bY1    = bY2 + arrowLen * sin_a;

  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = fs(1.8); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bX1, bY1); ctx.lineTo(bX2, bY2); ctx.stroke();
  drawArrowHead({ x: bX1, y: bY1 }, { x: bX2, y: bY2 }, col, true);
  const bLx = (bX1 + bX2) / 2;
  const bLy = Math.max(bY1, bY2) + fs(4);
  ctx.fillStyle = col; ctx.font = `bold ${fs(22).toFixed(1)}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('B∞', bLx, bLy + fs(4));
  ctx.textBaseline = 'alphabetic';
  ctx.restore();

  if (alpha !== 0) {
    if (sim.rayMode === 'anim' && sim.animT < (sim._fracL1 ?? 1.0)) return;
    const arcR      = fs(30);
    const angleAxis = Math.PI;
    const angleRay  = Math.PI + alphaRad;
    const aStart    = alphaRad >= 0 ? angleAxis : angleRay;
    const aEnd      = alphaRad >= 0 ? angleRay  : angleAxis;
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = fs(1.5);
    ctx.beginPath(); ctx.arc(lensX1, axisY, arcR, aStart, aEnd); ctx.stroke();
    const aMid = (aStart + aEnd) / 2;
    const lx = lensX1 + (arcR + fs(12)) * Math.cos(aMid);
    const ly = axisY  + (arcR + fs(12)) * Math.sin(aMid);
    ctx.fillStyle = col; ctx.font = `bold ${fs(25).toFixed(1)}px serif`;
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

  const { alpha, axisY, H, f1, f2 } = sim;
  const lensX2    = xToPx(sim.x2);
  const alphaRad  = alpha * Math.PI / 180;
  const alpha2Rad = Math.atan(-f1 / f2 * Math.tan(alphaRad));
  const arrowLen  = fs(36);
  const margin    = fs(18);
  const col       = '#7a8a96';

  const aY  = axisY + fs(28);
  const aX1 = margin + arrowLen;
  const aX2 = margin;

  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = fs(1.8); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(aX1, aY); ctx.lineTo(aX2, aY); ctx.stroke();
  drawArrowHead({ x: aX1, y: aY }, { x: aX2, y: aY }, col, true);
  ctx.fillStyle = col; ctx.font = `bold ${fs(22).toFixed(1)}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText("A'∞", (aX1 + aX2) / 2, aY + fs(4));
  ctx.textBaseline = 'alphabetic';
  ctx.restore();

  // Abscisse où l'on échantillonne le rayon virtuel pour poser B'∞ : à un
  // quart du canvas, mais toujours en amont de l'oculaire et jamais collée
  // au bord — l'ancienne valeur de 300 px tombait derrière L₂ sur un canvas
  // étroit, et contre le bord gauche sur un canvas large.
  const bTargetX = Math.max(fs(70), Math.min(sim.W * 0.25, lensX2 - fs(70)));
  let bRefY = axisY - fs(80);
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
  bRefY = Math.max(fs(30), Math.min(H - fs(30), bRefY));

  const cos_a2 = Math.cos(alpha2Rad);
  const sin_a2 = Math.sin(alpha2Rad);
  const bX2 = bTargetX;
  const bY2 = bRefY;
  const bX1 = bX2 + arrowLen * cos_a2;
  const bY1 = bY2 + arrowLen * sin_a2;

  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = fs(1.8); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bX1, bY1); ctx.lineTo(bX2, bY2); ctx.stroke();
  drawArrowHead({ x: bX1, y: bY1 }, { x: bX2, y: bY2 }, col, true);
  const bLx = (bX1 + bX2) / 2;
  const bLy = Math.min(bY1, bY2) - fs(4);
  ctx.fillStyle = col; ctx.font = `bold ${fs(22).toFixed(1)}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText("B'∞", bLx, bLy - fs(4));
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

/* ── Image intermédiaire A1B1 ── */
function drawIntermediateImage() {
  const { O1A1, h1, x1, axisY, rayMode, animT } = sim;
  if (!isFinite(O1A1) || Math.abs(O1A1) > 800) return;
  if (rayMode === 'anim' && animT < (sim._fracA1 ?? 1.0)) return;

  const x  = xToPx(x1 + O1A1);
  const yA = axisY;
  const yB = hToPx(h1);

  const isReal  = O1A1 > 0;
  const col     = isReal ? '#2a8060' : '#b04020';
  const dash    = isReal ? [] : [5, 4];
  const arrowDir = h1 >= 0 ? 1 : -1;

  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = fs(2); ctx.setLineDash(dash.map(fs));
  ctx.beginPath(); ctx.moveTo(x, yA); ctx.lineTo(x, yB); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - fs(7), yB + arrowDir * fs(12));
  ctx.lineTo(x, yB);
  ctx.lineTo(x + fs(7), yB + arrowDir * fs(12));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = col; ctx.font = `bold ${fs(31).toFixed(1)}px monospace`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('A₁', x + fs(6), yA + fs(6));
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('B₁', x + fs(6), yB + (h1 >= 0 ? -fs(8) : fs(28)));
  ctx.restore();
}

/* ── Image finale A2B2 (mode non afocal) ── */
function drawFinalImage() {
  const { O2A2, h2, x2, isAfocal, rayMode, animT } = sim;
  if (isAfocal) return;
  if (!isFinite(O2A2) || Math.abs(O2A2) > 800) return;
  if (rayMode === 'anim' && animT < (sim._fracA2 ?? 1.0)) return;

  const x  = xToPx(x2 + O2A2);
  const yA = sim.axisY;
  const yB = hToPx(h2);

  const isReal = O2A2 > 0;
  const col    = isReal ? '#2a6aaa' : '#b04020';
  const dash   = isReal ? [] : [5, 4];
  const arrowDir = h2 >= 0 ? 1 : -1;

  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = fs(2); ctx.setLineDash(dash.map(fs));
  ctx.beginPath(); ctx.moveTo(x, yA); ctx.lineTo(x, yB); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - fs(7), yB + arrowDir * fs(12));
  ctx.lineTo(x, yB);
  ctx.lineTo(x + fs(7), yB + arrowDir * fs(12));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = col; ctx.font = `bold ${fs(31).toFixed(1)}px monospace`;
  ctx.textAlign = 'left';
  ctx.fillText('A₂', x + fs(6), yA + (h2 >= 0 ? fs(28) : -fs(10)));
  ctx.fillText('B₂', x + fs(6), yB + (h2 >= 0 ? -fs(8) : fs(28)));
  ctx.restore();
}

/* ── Trait de direction B1 → O2 ── */
function drawDirectionLine() {
  const { O1A1, h1, x1, x2, axisY, W, rayMode, animT } = sim;
  if (!isFinite(O1A1) || Math.abs(O1A1) > 800) return;
  if (Math.abs(h1) < 0.05) return;
  if (rayMode === 'anim' && animT < (sim._fracA1 ?? 1.0)) return;

  const xB1 = xToPx(x1 + O1A1);
  const yB1 = hToPx(h1);
  const xO2 = xToPx(x2);
  const yO2 = axisY;

  const dx = xO2 - xB1;
  const dy = yO2 - yB1;
  if (Math.abs(dx) < 0.1) return;

  const t_right = (W - xO2) / dx;
  const xEnd = xO2 + dx * t_right;
  const yEnd = yO2 + dy * t_right;

  ctx.save();
  ctx.strokeStyle = 'rgba(160,160,160,0.55)';
  ctx.lineWidth = fs(1.2);
  ctx.setLineDash([fs(5), fs(5)]);
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

  const { f1, f2, alpha, axisY } = sim;
  const lensX2         = xToPx(sim.x2);
  const alphaRad       = alpha * Math.PI / 180;
  const alphaSortie    = -f1/f2 * Math.tan(alphaRad);
  const alphaSortieRad = Math.atan(alphaSortie);

  if (Math.abs(alphaSortieRad) > 0.005) {
    const arcR   = fs(32);
    const aStart = 0;
    const aEnd   = alphaSortieRad;

    ctx.save();
    ctx.strokeStyle = '#2a6aaa'; ctx.lineWidth = fs(1.5);
    ctx.beginPath(); ctx.arc(lensX2, axisY, arcR, aStart, aEnd, alphaSortieRad < 0); ctx.stroke();

    const aMid = (aStart + aEnd) / 2;
    const lx = lensX2 + (arcR + fs(12)) * Math.cos(aMid);
    const ly = axisY  + (arcR + fs(12)) * Math.sin(aMid);
    ctx.fillStyle = '#2a6aaa'; ctx.font = `bold ${fs(25).toFixed(1)}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText("α'", lx, ly);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
}

/* ── Œil : cristallin, rétine et image sur rétine ── */
function drawEye() {
  const { xOeil, axisY, EYE_IRIS_TO_LENS, EYE_FLENS, lensHpx } = sim;
  const crystalX = xToPx(xOeil + EYE_IRIS_TO_LENS);
  const retinaX  = xToPx(xOeil + EYE_IRIS_TO_LENS + EYE_FLENS);
  const eyeR     = lensHpx;

  ctx.save();

  // ── Cristallin ──
  const lensH = eyeR;
  const aw = fs(10), ah = fs(14);
  ctx.strokeStyle = '#5a3a8a'; ctx.lineWidth = fs(2.5);
  ctx.beginPath(); ctx.moveTo(crystalX, axisY - lensH); ctx.lineTo(crystalX, axisY + lensH); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(crystalX - aw, axisY - lensH + ah); ctx.lineTo(crystalX, axisY - lensH); ctx.lineTo(crystalX + aw, axisY - lensH + ah);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(crystalX - aw, axisY + lensH - ah); ctx.lineTo(crystalX, axisY + lensH); ctx.lineTo(crystalX + aw, axisY + lensH - ah);
  ctx.stroke();
  ctx.fillStyle = '#5a3a8a'; ctx.font = `bold ${fs(20).toFixed(1)}px "Segoe UI", Arial`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText('Cristallin', crystalX - fs(6), axisY - lensH - fs(5));
  ctx.textBaseline = 'alphabetic';

  ctx.strokeStyle = '#888'; ctx.lineWidth = fs(1.2);
  ctx.beginPath();
  ctx.moveTo(retinaX - fs(5), axisY); ctx.lineTo(retinaX + fs(5), axisY);
  ctx.moveTo(retinaX, axisY - fs(5)); ctx.lineTo(retinaX, axisY + fs(5));
  ctx.stroke();

  // ── Rétine ──
  ctx.strokeStyle = '#c05020'; ctx.lineWidth = fs(4);
  ctx.beginPath();
  ctx.moveTo(retinaX, axisY - eyeR); ctx.lineTo(retinaX, axisY + eyeR);
  ctx.stroke();
  ctx.fillStyle = '#c05020'; ctx.font = `bold ${fs(20).toFixed(1)}px "Segoe UI", Arial`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText('Rétine', retinaX + fs(6), axisY - eyeR - fs(5));
  ctx.textBaseline = 'alphabetic';

  // ── Image A₃B₃ sur la rétine ──
  const { OeyeA3, h3, rayMode, animT } = sim;
  if (isFinite(OeyeA3) && Math.abs(OeyeA3) < 800 && isFinite(h3) && Math.abs(h3) > 0.001) {
    const showImg = (rayMode === 'instant') || (animT >= (sim._fracA3 ?? 1.0));
    if (showImg) {
      const imgX      = xToPx(xOeil + EYE_IRIS_TO_LENS + OeyeA3);
      const imgYA     = axisY;
      const imgYB     = hToPx(h3);
      const arrowDir  = h3 >= 0 ? 1 : -1;
      const imgIsReal = OeyeA3 > 0;
      const imgCol    = imgIsReal ? '#2a6aaa' : '#b04020';
      const imgDash   = imgIsReal ? [] : [4, 3];

      ctx.save();
      ctx.strokeStyle = imgCol; ctx.lineWidth = fs(2); ctx.setLineDash(imgDash.map(fs));
      ctx.beginPath(); ctx.moveTo(imgX, imgYA); ctx.lineTo(imgX, imgYB); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(imgX - fs(6), imgYB + arrowDir * fs(10));
      ctx.lineTo(imgX, imgYB);
      ctx.lineTo(imgX + fs(6), imgYB + arrowDir * fs(10));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = imgCol; ctx.font = `bold ${fs(26).toFixed(1)}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText("A'", imgX + fs(5), imgYA + (h3 >= 0 ? fs(22) : -fs(8)));
      ctx.fillText("B'", imgX + fs(5), imgYB + (h3 >= 0 ? -fs(6) : fs(22)));
      ctx.restore();
    }
  }

  ctx.restore();
}

/* ═══════════════════════════════════════════════════
   CALCUL DES RAYONS
   ─────────────────────────────────────────────────
   Toute la géométrie est menée en centimètres (abscisse le long de
   l'axe, hauteur, pente sans dimension), et n'est convertie en pixels
   qu'au moment de fabriquer les points des segments.

   La marge MARGIN_PX suffit désormais de part et d'autre du canvas :
   la scène n'étant plus mise à l'échelle par une transformation, ce
   qui sort du cadre n'a aucune raison d'être tracé.
════════════════════════════════════════════════════ */
const MARGIN_PX = 80;

function computeRays() {
  const { f1, f2, alpha, nRays, x1, x2, W,
          oeilActif, systemMode, xOeil, EYE_IRIS_TO_LENS, EYE_FLENS } = sim;
  const alphaRad = alpha * Math.PI / 180;
  const tanAlpha = Math.tan(alphaRad);
  const d = getLensDistCm();

  const withEye   = oeilActif && systemMode === 'lunette';
  const crystalCm = xOeil + EYE_IRIS_TO_LENS;
  const retinaCm  = crystalCm + EYE_FLENS;
  const fEye      = EYE_FLENS;

  const xLeftPx  = -MARGIN_PX;
  const xRightPx = W + MARGIN_PX;
  const xLeftCm  = pxToX(xLeftPx);
  const xRightCm = pxToX(xRightPx);

  // Point (cm, cm) → point (px, px)
  const P = (xCm, hCm) => ({ x: xToPx(xCm), y: hToPx(hCm) });

  // ── Hauteurs yi des rayons sur L1, en cm ──
  // R suit le zoom : les lentilles gardent une hauteur fixe en pixels,
  // donc leur ouverture exprimée en centimètres varie.
  const R  = sim.lensRadiusCm;
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

    // Rayon incident, venant de l'infini
    segs.push({ pts: [
      P(xLeftCm, yi1 + slopeIn * (xLeftCm - x1)),
      P(x1,      yi1)
    ], virtual: false });

    // L1 → L2
    segs.push({ pts: [ P(x1, yi1), P(x2, yi2) ], virtual: false });

    // Prolongement vers A1 quand l'image intermédiaire est au-delà de L2
    if (O2A1 > 0 && !sim.isAfocal && isFinite(O2A1) && Math.abs(O2A1) < 800) {
      segs.push({ pts: [
        P(x2,        yi2),
        P(x2 + O2A1, yi2 + slopeOut1 * O2A1)
      ], virtual: true });
    }

    if (withEye) {
      const O2toCrystalCm = crystalCm - x2;
      const yCrystal      = yi2 + slopeOut2 * O2toCrystalCm;
      const slopeEyeOut   = slopeOut2 - yCrystal / fEye;
      const yRetina       = yCrystal + slopeEyeOut * fEye;

      segs.push({ pts: [ P(x2, yi2), P(crystalCm, yCrystal) ], virtual: false });
      segs.push({ pts: [ P(crystalCm, yCrystal), P(retinaCm, yRetina) ], virtual: false });

      if (sim.isAfocal) {
        segs.push({ pts: [
          P(x2,      yi2),
          P(xLeftCm, yi2 + slopeOut2 * (xLeftCm - x2))
        ], virtual: true });
      }

    } else if (sim.isAfocal || !isFinite(sim.O2A2) || Math.abs(sim.O2A2) > 800) {
      segs.push({ pts: [
        P(x2,       yi2),
        P(xRightCm, yi2 + slopeOut2 * (xRightCm - x2))
      ], virtual: false });
      segs.push({ pts: [
        P(x2,      yi2),
        P(xLeftCm, yi2 + slopeOut2 * (xLeftCm - x2))
      ], virtual: true });
    } else if (sim.O2A2 > 0) {
      segs.push({ pts: [
        P(x2,            yi2),
        P(x2 + sim.O2A2, yi2 + slopeOut2 * sim.O2A2)
      ], virtual: false });
      segs.push({ pts: [
        P(x2 + sim.O2A2, yi2 + slopeOut2 * sim.O2A2),
        P(xRightCm,      yi2 + slopeOut2 * (xRightCm - x2))
      ], virtual: false });
    } else {
      segs.push({ pts: [
        P(x2,       yi2),
        P(xRightCm, yi2 + slopeOut2 * (xRightCm - x2))
      ], virtual: false });
      segs.push({ pts: [
        P(x2,            yi2),
        P(x2 + sim.O2A2, yi2 + slopeOut2 * sim.O2A2)
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

  sim._fracL1 = fracAtX(xToPx(x1));
  sim._fracA1 = fracAtX(xToPx(x1 + sim.O1A1));

  if (!sim.isAfocal && isFinite(sim.O2A2) && Math.abs(sim.O2A2) < 800) {
    sim._fracA2 = fracAtX(xToPx(x2 + sim.O2A2));
  } else {
    sim._fracA2 = 1.0;
  }

  if (withEye) {
    sim._fracA3 = fracAtX(xToPx(crystalCm + sim.OeyeA3));
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
  const xLeft  = sim._animXLeft  ?? -MARGIN_PX;
  const xRight = sim._animXRight ?? (sim.W + MARGIN_PX);
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
  ctx.lineWidth   = fs(virtual ? 1.4 : (isMain ? 2.0 : 1.3));
  ctx.globalAlpha = virtual ? 0.5 : (isMain ? 1.0 : 0.65);
  ctx.lineCap = 'round';
  if (virtual) ctx.setLineDash([fs(6), fs(5)]);

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
  ctx.lineWidth   = fs(isMain ? 2.0 : 1.3);
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
  const aLen = fs(isMain ? 9 : 7), aHalf = fs(isMain ? 5 : 3.5);
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
