'use strict';

// ═══════════════════════════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════════════════════════

/* ═══════════════════════════════════════════════════
   draw.js — Rendu canvas de la simulation Lentille mince
   ─────────────────────────────────────────────────
   Dépend de : sim.js (sim, RAY_COLORS, cmToX, cmToY, p, xToCm, compute, updateTableHeight)
   Expose : cv, ctx, resize, draw, computeRays,
            drawRaysInstant, drawRaysAnim,
            drawSegment, drawSegmentToX, drawArrowHead,
            segLength
════════════════════════════════════════════════════ */

const cv  = document.getElementById('cv');
const ctx = cv.getContext('2d');

/* ─────────────────────────────────────────────────
   resize() — Adapte le canvas à la taille de la fenêtre.
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
  sim.axisY  = H / 2;
  sim.scale  = W / 120;
  sim.lensX  = W / 2;
  compute();
  updateTableHeight();
  draw();
}

/* ═══════════════════════════════════════════════════
   DESSIN PRINCIPAL
════════════════════════════════════════════════════ */
function draw() {
  const { W, H, mode, animT, animTImage } = sim;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fdf8f0';
  ctx.fillRect(0, 0, W, H);

  drawGrid();
  drawAxis();
  drawFocalPoints();

  const rays = computeRays();
  sim._lastRays = rays;
  if (mode === 'instant') {
    drawRaysInstant(rays);
  } else {
    drawRaysAnim(rays, animT);
  }

  drawScreen();
  drawLens();
  if (!sim.infini) drawObject();

  if (mode === 'instant') {
    drawImage(1.0);
  } else {
    drawImage(animT >= animTImage ? 1.0 : 0.0);
  }

  drawViewfinders();
}

/* ── Quadrillage 1 cm × 1 cm ── */
function drawGrid() {
  const { W, H, scale, lensX, axisY } = sim;
  const step = scale;

  ctx.save();
  ctx.strokeStyle = 'rgba(180, 160, 130, 0.25)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();

  for (let x = lensX % step; x <= W; x += step) {
    ctx.moveTo(x, 0); ctx.lineTo(x, H);
  }
  for (let y = axisY % step; y <= H; y += step) {
    ctx.moveTo(0, y); ctx.lineTo(W, y);
  }

  ctx.stroke();
  ctx.restore();
}

/* ── Axe optique ── */
function drawAxis() {
  const { W, axisY } = sim;
  ctx.save();
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 6]);
  ctx.beginPath(); ctx.moveTo(0, axisY); ctx.lineTo(W, axisY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/* ── Foyers F et F' ── */
function drawFocalPoints() {
  const { f, axisY, infini, lensType } = sim;
  const fEff = lensType === 'div' ? -f : f;
  const points = [[-fEff, "F"]];
  if (!infini) points.push([fEff, "F'"]);

  for (const [cm, label] of points) {
    const x = cmToX(cm);
    ctx.save();
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(x - 7, axisY); ctx.lineTo(x + 7, axisY);
    ctx.moveTo(x, axisY - 7); ctx.lineTo(x, axisY + 7);
    ctx.stroke();
    ctx.fillStyle = '#555';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = cm < 0 ? 'right' : 'left';
    ctx.fillText(label, x + (cm < 0 ? -10 : 10), axisY - 10);
    ctx.restore();
  }
}

/* ── Lentille (double flèche verticale) ── */
function drawLens() {
  const { lensX, axisY, scale, LENS_RADIUS_CM, lensType } = sim;
  const lensHpx = LENS_RADIUS_CM * scale;
  const top = axisY - lensHpx;
  const bot = axisY + lensHpx;
  const aw = 10, ah = 14;

  ctx.save();
  ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 2.5;

  ctx.beginPath(); ctx.moveTo(lensX, top); ctx.lineTo(lensX, bot); ctx.stroke();

  if (lensType === 'conv') {
    ctx.beginPath();
    ctx.moveTo(lensX - aw, top + ah); ctx.lineTo(lensX, top); ctx.lineTo(lensX + aw, top + ah);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lensX - aw, bot - ah); ctx.lineTo(lensX, bot); ctx.lineTo(lensX + aw, bot - ah);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(lensX - aw, top); ctx.lineTo(lensX, top + ah); ctx.lineTo(lensX + aw, top);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lensX - aw, bot); ctx.lineTo(lensX, bot - ah); ctx.lineTo(lensX + aw, bot);
    ctx.stroke();
  }

  ctx.fillStyle = '#2c3e50'; ctx.font = 'bold 32px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('O', lensX + 8, axisY - 8);

  // Arc d'angle alpha (mode infini, alpha ≠ 0)
  if (sim.infini && sim.alpha !== 0) {
    const alphaRad = sim.alpha * Math.PI / 180;
    const arcR = 38;
    const angleAxis = Math.PI;
    const angleRay  = Math.PI - alphaRad;

    const aStart = alphaRad >= 0 ? angleRay  : angleAxis;
    const aEnd   = alphaRad >= 0 ? angleAxis : angleRay;

    ctx.save();
    ctx.strokeStyle = '#2a6aaa'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(lensX, axisY, arcR, aStart, aEnd); ctx.stroke();

    const aMid = (aStart + aEnd) / 2;
    const lx = lensX + (arcR + 14) * Math.cos(aMid);
    const ly = axisY  + (arcR + 14) * Math.sin(aMid);
    ctx.fillStyle = '#2a6aaa';
    ctx.font = 'bold 18px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('α', lx, ly);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  ctx.restore();
}

/* ── Objet AB (flèche terracotta, draggable) ── */
function drawObject() {
  const { OA, h, axisY } = sim;
  const x  = cmToX(OA);
  const yA = axisY;
  const yB = cmToY(h);
  const arrowDir = h > 0 ? 1 : -1;

  ctx.save();
  ctx.strokeStyle = '#c05020'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, yA); ctx.lineTo(x, yB); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 8, yB + arrowDir * 14);
  ctx.lineTo(x, yB);
  ctx.lineTo(x + 8, yB + arrowDir * 14);
  ctx.stroke();
  ctx.fillStyle = '#c05020'; ctx.font = 'bold 32px monospace'; ctx.textAlign = 'right';
  ctx.fillText('A', x - 8, yA + (h > 0 ? 26 : -10));
  ctx.fillText('B', x - 8, yB + (h > 0 ? -10 : 28));
  ctx.restore();
}

/* ── Image A'B' ── */
function drawImage(alphaVal) {
  const { OA2, h2, infini } = sim;
  if (!isFinite(OA2) || Math.abs(OA2) > 800 || alphaVal <= 0) return;

  const x  = cmToX(OA2);
  const yA = sim.axisY;
  const yB = cmToY(h2);

  const isReal   = OA2 > 0;
  const col      = isReal ? '#2a6aaa' : '#b04020';
  const dash     = isReal ? [] : [5, 4];
  const arrowDir = h2 >= 0 ? 1 : -1;

  ctx.save();
  ctx.globalAlpha = alphaVal;
  ctx.strokeStyle = col; ctx.lineWidth = 3;
  ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x, yA); ctx.lineTo(x, yB); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 7, yB + arrowDir * 12);
  ctx.lineTo(x, yB);
  ctx.lineTo(x + 7, yB + arrowDir * 12);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = col; ctx.font = 'bold 32px monospace'; ctx.textAlign = 'left';

  const aOffsetY = h2 >= 0 ? 38 : -14;
  if (infini) {
    ctx.textAlign = 'center';
    ctx.fillText("F'= A'", x, yA + aOffsetY);
    ctx.textAlign = 'left';
  } else {
    ctx.fillText("A'", x + 8, yA + aOffsetY);
  }
  ctx.fillText("B'", x + 8, yB + (h2 >= 0 ? -10 : 38));

  if (infini) {
    ctx.strokeStyle = col; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(x - 7, yA); ctx.lineTo(x + 7, yA);
    ctx.moveTo(x, yA - 7); ctx.lineTo(x, yA + 7);
    ctx.stroke();
  }

  ctx.restore();
}

/* ── Écran ── */
function drawScreen() {
  const { OE, H, axisY } = sim;
  const x = cmToX(OE);

  ctx.save();
  ctx.strokeStyle = '#7a4010';
  ctx.lineWidth   = 4;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(x, axisY - H * 0.3); ctx.lineTo(x, axisY + H * 0.3);
  ctx.stroke();
  ctx.fillStyle = '#7a4010';
  ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Écran', x, axisY - H * 0.3 - 6);
  ctx.restore();
}

/* ═══════════════════════════════════════════════════
   CADRES DE VISUALISATION (Objet / Image sur écran)
════════════════════════════════════════════════════ */
function drawViewfinders() {
  const { W, scale } = sim;

  const frameH  = 18 * scale;
  const frameW  = frameH * (4 / 3);
  const barH    = 26;
  const margin  = 12;
  const frameY  = margin;
  const leftX   = margin;
  const rightX  = W - margin - frameW;

  function drawCollapseBtn(fx, fy, fw, collapsed) {
    const bw = 16, bh = 16, br = 3;
    const bx = fx + fw - bw - 5, by = fy + 5;
    ctx.save();
    ctx.fillStyle = '#c8c0b4'; ctx.strokeStyle = '#a8a098'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, br); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2c3e50'; ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(collapsed ? '+' : '−', bx + bw / 2, by + bh / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
    return { x: bx, y: by, w: bw, h: bh };
  }

  function drawBar(fx, fy, fw, label) {
    ctx.save();
    ctx.fillStyle = '#e8e4de'; ctx.fillRect(fx, fy, fw, barH);
    ctx.strokeStyle = '#c8c0b4'; ctx.lineWidth = 1; ctx.strokeRect(fx, fy, fw, barH);
    ctx.fillStyle = '#2c3e50'; ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, fx + fw / 2, fy + barH / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  function drawInner(fx, fy, fw, fh) {
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(fx + 1, fy + barH, fw - 2, fh - barH - 1);
    ctx.beginPath();
    ctx.rect(fx + 1, fy + barH, fw - 2, fh - barH - 1);
    ctx.clip();
  }

  function drawGlowLetter(cx, cy, hPx, flipH, flipV, blurPx) {
    const sw    = Math.max(2, hPx * 0.10);
    const yTop  = cy - hPx / 2;
    const yBot  = cy + hPx / 2;
    const bumpR = hPx * 0.225;
    const bumpH = bumpR * 2;
    const xRc   = hPx * 0.22;
    const futX  = flipH ? cx + hPx * 0.18 : cx - hPx * 0.18;
    const arcCX = flipH ? futX - xRc       : futX + xRc;
    const arcCCW = flipH;
    const bumpy1   = flipV ? yBot - bumpH : yTop;
    const bumpy2   = flipV ? yBot         : yTop + bumpH;
    const arcCyVal = flipV ? yBot - bumpR : yTop + bumpR;

    function strokeLetter() {
      ctx.beginPath();
      ctx.moveTo(futX, yTop); ctx.lineTo(futX, yBot); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(futX, bumpy1); ctx.lineTo(arcCX, bumpy1);
      ctx.arc(arcCX, arcCyVal, bumpR, -Math.PI / 2, Math.PI / 2, arcCCW);
      ctx.lineTo(futX, bumpy2); ctx.stroke();
    }

    ctx.save();
    if (blurPx > 0.5) {
      ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
      const s = 1 + (blurPx / (hPx * 0.8)) * 1.6;
      ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
    }
    const glowR = hPx * 0.9;
    const glow  = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    glow.addColorStop(0,   'rgba(255, 220, 120, 0.18)');
    glow.addColorStop(0.5, 'rgba(255, 180,  60, 0.08)');
    glow.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2);
    ctx.save();
    ctx.shadowColor = 'rgba(255, 200, 80, 0.9)'; ctx.shadowBlur = sw * 2.5;
    ctx.strokeStyle = '#ffe090'; ctx.lineWidth = sw;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    strokeLetter(); ctx.restore();
    ctx.save();
    ctx.shadowColor = 'rgba(255, 255, 200, 1)'; ctx.shadowBlur = sw * 1.2;
    ctx.strokeStyle = 'rgba(255, 255, 220, 0.7)'; ctx.lineWidth = sw * 0.35;
    ctx.lineCap = 'round';
    strokeLetter(); ctx.restore();
    ctx.filter = 'none';
    ctx.restore();
  }

  function drawBlurSpot(ix, iy, iw, ih, intensity) {
    const cx = ix + iw / 2, cy = iy + ih / 2;
    const r  = Math.min(iw, ih) * 0.65 * intensity;
    const g  = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0,   `rgba(255, 220, 100, ${0.85 * intensity})`);
    g.addColorStop(0.3, `rgba(255, 160,  40, ${0.55 * intensity})`);
    g.addColorStop(0.7, `rgba(200,  80,   0, ${0.15 * intensity})`);
    g.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(ix, iy, iw, ih);
    ctx.fillRect(ix, iy, iw, ih);
  }

  function drawNoImageMsg(fx, fy, fw, fh, msg) {
    ctx.fillStyle = 'rgba(180,160,120,0.85)';
    ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(msg, fx + fw / 2, fy + fh - 6);
    ctx.textBaseline = 'alphabetic';
  }

  // ══ CADRE OBJET ══
  drawBar(leftX, frameY, frameW, 'Objet');
  if (!sim.objCollapsed) {
    drawInner(leftX, frameY, frameW, frameH);
    const ix = leftX + 1, iy = frameY + barH;
    const iw = frameW - 2, ih = frameH - barH - 1;
    const hPx = Math.abs(sim.h) * scale;
    drawGlowLetter(ix + iw / 2, iy + ih / 2, hPx, false, sim.h < 0, 0);
    ctx.restore();
  }
  sim._objBtnRect = drawCollapseBtn(leftX, frameY, frameW, sim.objCollapsed);

  // ══ CADRE IMAGE ══
  drawBar(rightX, frameY, frameW, 'Image sur écran');
  if (!sim.imgCollapsed) {
    drawInner(rightX, frameY, frameW, frameH);
    const ix = rightX + 1, iy = frameY + barH;
    const iw = frameW - 2, ih = frameH - barH - 1;
    const { OA2, h2, OE, f } = sim;
    const isReal    = isFinite(OA2) && Math.abs(OA2) < 800 && OA2 > 0;
    const isVirtual = isFinite(OA2) && Math.abs(OA2) < 800 && OA2 < 0;

    if (sim.infini) {
      const distCm   = Math.abs(OE - OA2);
      const seuil    = Math.max(2, Math.abs(f) * 0.5);
      const t        = Math.min(1, distCm / seuil);
      const cx = ix + iw / 2, cy = iy + ih / 2;
      const rMax = Math.min(iw, ih) * 0.62;
      const r    = rMax * t + 6;
      const alpha0 = 1.0 - 0.65 * t;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0,   `rgba(255, 240, 180, ${alpha0})`);
      g.addColorStop(0.25, `rgba(255, 200,  80, ${alpha0 * 0.75})`);
      g.addColorStop(0.6,  `rgba(255, 120,  20, ${alpha0 * 0.35})`);
      g.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      if (t < 0.15) {
        const rCore = r * 0.4;
        const gc = ctx.createRadialGradient(cx, cy, 0, cx, cy, rCore);
        gc.addColorStop(0,   `rgba(255, 255, 240, ${(1 - t / 0.15) * 0.9})`);
        gc.addColorStop(1,   'rgba(255,255,255,0)');
        ctx.fillStyle = gc;
        ctx.beginPath(); ctx.arc(cx, cy, rCore, 0, Math.PI * 2); ctx.fill();
      }
      if (OA2 <= 0) {
        drawNoImageMsg(rightX, frameY, frameW, frameH, "Pas d'image réelle");
      }
    } else if (!isReal && !isVirtual) {
      drawBlurSpot(ix, iy, iw, ih, 1.0);
      drawNoImageMsg(rightX, frameY, frameW, frameH, "Image à l'infini");
    } else if (isVirtual) {
      drawBlurSpot(ix, iy, iw, ih, 1.0);
      drawNoImageMsg(rightX, frameY, frameW, frameH, "Pas d'image réelle");
    } else {
      const distCm    = Math.abs(OE - OA2);
      const blurSeuil = Math.max(3, Math.abs(f) * 0.4);
      const blurFrac  = Math.min(1, distCm / blurSeuil);
      const h2Px      = Math.abs(h2) * scale;
      const blurPx    = blurFrac * blurFrac * h2Px * 0.8;
      drawGlowLetter(ix + iw / 2, iy + ih / 2, h2Px, true, sim.h > 0, blurPx);
    }
    ctx.restore();
  }
  sim._imgBtnRect = drawCollapseBtn(rightX, frameY, frameW, sim.imgCollapsed);

  // Bouton Auto
  const btnW = 64, btnH = 22, btnR = 4;
  const btnX = rightX + (frameW - btnW) / 2;
  const btnY = frameY + (sim.imgCollapsed ? barH : frameH) + 6;
  ctx.save();
  ctx.fillStyle   = sim.autoScreen ? '#2a6aaa' : '#e8e4de';
  ctx.strokeStyle = sim.autoScreen ? '#1a4a8a' : '#c8c0b4';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, btnR); ctx.fill(); ctx.stroke();
  ctx.fillStyle = sim.autoScreen ? '#fff' : '#7a8a96';
  ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Auto', btnX + btnW / 2, btnY + btnH / 2);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
  sim._autoBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
}

/* ═══════════════════════════════════════════════════
   CALCUL DES RAYONS
════════════════════════════════════════════════════ */
function computeRays() {
  const { f, h, OA, OA2, infini, alpha, nRays, LENS_RADIUS_CM, lensType } = sim;
  const fEff = lensType === 'div' ? -f : f;
  const fObj = -fEff;

  const xRight = xToCm(sim.W + 80);
  const xLeft  = xToCm(-80);

  const imgAtInfinity = !isFinite(OA2) || Math.abs(OA2) > 800;
  const alphaRad = alpha * Math.PI / 180;

  const xLeftPx  = cmToX(xLeft);
  const xRightPx = cmToX(xRight);
  sim._animXLeft  = xLeftPx;
  sim._animXRight = xRightPx;

  let fracImage = 1.0;
  if (!imgAtInfinity && OA2 > 0) {
    const imgXpx = cmToX(OA2);
    fracImage = Math.min(1.0, Math.max(0, (imgXpx - xLeftPx) / (xRightPx - xLeftPx)));
  }
  sim.animTImage = fracImage;

  function raysForSource(srcH, overrideColors, groupId = -1) {
    let yiList = [], colorList = [], isMainList = [];

    const R  = LENS_RADIUS_CM;
    const Rc = R / 5;

    if (infini) {
      const canonical = [Rc, 0, -Rc];
      const GRIS = '#7a8a96';

      if (nRays === 3) {
        yiList     = [...canonical];
        colorList  = [GRIS, GRIS, GRIS];
        isMainList = [true, true, true];
      } else {
        const nExtra = nRays - 3;
        const allExtra = [];
        const nLevels = 4;
        for (let k = 1; k <= nLevels; k++) {
          const yAbs = Rc + (R - Rc) * k / nLevels;
          allExtra.push(yAbs); allExtra.push(-yAbs);
        }
        allExtra.sort((a, b) => Math.abs(a) - Math.abs(b));
        const extraYi = allExtra.slice(0, nExtra);
        yiList     = [...canonical, ...extraYi];
        colorList  = yiList.map(() => GRIS);
        isMainList = [true, true, true, ...extraYi.map(() => false)];
      }

    } else {
      const slopeFo = (0 - srcH) / (fObj - OA);
      const yLens3  = srcH + slopeFo * (0 - OA);

      if (sim.infiniAnim) {
        const canonical = [Rc, 0, -Rc];
        const GRIS = '#7a8a96';
        if (nRays === 3) {
          yiList     = [...canonical];
          colorList  = [GRIS, GRIS, GRIS];
          isMainList = [true, true, true];
        } else {
          const nExtra = nRays - 3;
          const allExtra = [];
          const nLevels = 4;
          for (let k = 1; k <= nLevels; k++) {
            const yAbs = Rc + (R - Rc) * k / nLevels;
            allExtra.push(yAbs); allExtra.push(-yAbs);
          }
          allExtra.sort((a, b) => Math.abs(a) - Math.abs(b));
          const extraYi = allExtra.slice(0, nExtra);
          yiList     = [...canonical, ...extraYi];
          colorList  = yiList.map(() => GRIS);
          isMainList = [true, true, true, ...extraYi.map(() => false)];
        }
      } else {
        const canonical = [srcH, 0, yLens3];
        if (nRays === 3) {
          yiList     = [...canonical];
          colorList  = overrideColors ? [...overrideColors] : [...RAY_COLORS];
          isMainList = [true, true, true];
        } else {
          const nExtra = nRays - 3;
          const allExtra = [];
          const nLevels = 7;
          for (let k = 1; k <= nLevels; k++) {
            const yAbs = R * k / nLevels;
            allExtra.push(yAbs); allExtra.push(-yAbs);
          }
          allExtra.sort((a, b) => Math.abs(a) - Math.abs(b));
          const extraYi = allExtra.slice(0, nExtra).map(y => {
            for (const cy of canonical) {
              if (Math.abs(y - cy) < R * 0.06) y += (y >= cy ? 1 : -1) * R * 0.06;
            }
            return y;
          });
          yiList     = [...canonical, ...extraYi];
          colorList  = overrideColors
            ? [...overrideColors, ...extraYi.map(() => overrideColors[1])]
            : [...RAY_COLORS, ...extraYi.map(() => '#7a8a96')];
          isMainList = [true, true, true, ...extraYi.map(() => false)];
        }
      }
    }

    const rays = [];
    for (let ri = 0; ri < yiList.length; ri++) {
      const yi     = yiList[ri];
      const color  = colorList[ri];
      const isMain = isMainList[ri];
      const segs   = [];

      let slopeIn;
      if (infini) {
        slopeIn = Math.tan(alphaRad);
      } else {
        slopeIn = (yi - srcH) / (0 - OA);
      }
      const slopeOut = slopeIn - yi / fEff;

      if (infini) {
        const yAtLeft = yi + slopeIn * xLeft;
        segs.push({ pts: [p(xLeft, yAtLeft), p(0, yi)], virtual: false });
      } else {
        segs.push({ pts: [p(OA, srcH), p(0, yi)], virtual: false });
      }

      if (imgAtInfinity) {
        segs.push({ pts: [p(0, yi), p(xRight, yi + slopeOut * xRight)], virtual: false });
      } else if (OA2 > 0) {
        const yAtImg = yi + slopeOut * OA2;
        segs.push({ pts: [p(0, yi), p(OA2, yAtImg)],                          virtual: false });
        segs.push({ pts: [p(OA2, yAtImg), p(xRight, yi + slopeOut * xRight)], virtual: false });
      } else {
        segs.push({ pts: [p(0, yi), p(xRight, yi + slopeOut * xRight)], virtual: false });
        const yAtImg = yi + slopeOut * OA2;
        segs.push({ pts: [p(0, yi), p(OA2, yAtImg)], virtual: true });
      }

      rays.push({ color, segs, isMain, groupId });
    }
    return rays;
  }

  if (!infini && sim.multiPoints) {
    const srcList = [0];
    const step = h >= 0 ? 1 : -1;
    for (let y = step; Math.abs(y) < Math.abs(h) - 0.01; y += step) srcList.push(y);
    if (Math.abs(h) > 0.01) srcList.push(h);

    const allRays = [];
    srcList.forEach((srcH, i) => {
      const mainColor = '#b0b8c4';
      const dimColor  = '#c8cfd8';
      allRays.push(...raysForSource(srcH, [mainColor, dimColor, mainColor], i));
    });
    return allRays;
  }

  return raysForSource(h, null);
}

/* ── Tracé instantané ── */
function drawRaysInstant(rays) {
  const normal  = rays.filter(r => !(sim.multiPoints && sim.hoveredGroup !== -1 && r.groupId === sim.hoveredGroup));
  const hovered = rays.filter(r =>   sim.multiPoints && sim.hoveredGroup !== -1 && r.groupId === sim.hoveredGroup);
  for (const ray of [...normal, ...hovered]) {
    const isHov = hovered.includes(ray);
    const color = isHov ? '#cc2200' : ray.color;
    for (const seg of ray.segs) {
      drawSegment(seg.pts, color, seg.virtual, 1.0, ray.isMain, isHov);
    }
  }
}

/* ── Tracé animé ── */
function drawRaysAnim(rays, t) {
  const xLeft    = sim._animXLeft  ?? -80;
  const xRight   = sim._animXRight ?? (sim.W + 80);
  const currentX = xLeft + t * (xRight - xLeft);

  const normal  = rays.filter(r => !(sim.multiPoints && sim.hoveredGroup !== -1 && r.groupId === sim.hoveredGroup));
  const hovered = rays.filter(r =>   sim.multiPoints && sim.hoveredGroup !== -1 && r.groupId === sim.hoveredGroup);

  for (const ray of [...normal, ...hovered]) {
    const { segs, isMain } = ray;
    const isHov = hovered.includes(ray);
    const color = isHov ? '#cc2200' : ray.color;
    const realSegs = segs.filter(s => !s.virtual);

    for (const seg of realSegs) {
      const x0 = seg.pts[0].x;
      const x1 = seg.pts[seg.pts.length - 1].x;
      if (currentX <= x0) continue;
      if (currentX >= x1) {
        drawSegment(seg.pts, color, false, 1.0, isMain, isHov);
      } else {
        drawSegmentToX(seg.pts, color, isMain, isHov, currentX);
      }
    }

    if (t >= 1.0) {
      for (const seg of segs.filter(s => s.virtual)) {
        drawSegment(seg.pts, color, true, 1.0, isMain, isHov);
      }
    }
  }
}

/* ── Tracé d'un segment jusqu'à un X donné ── */
function drawSegmentToX(pts, color, isMain, hovered, targetX) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = hovered ? 2.8 : (isMain ? 2.2 : 1.4);
  ctx.globalAlpha = hovered ? 1.0 : (isMain ? 1.0 : 0.65);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
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
function drawSegment(pts, color, virtual, frac, isMain = true, hovered = false) {
  if (pts.length < 2) return;
  const targetLen = frac * segLength(pts);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = virtual ? 1.5 : (hovered ? 2.8 : (isMain ? 2.2 : 1.4));
  ctx.globalAlpha = virtual ? 0.55 : (hovered ? 1.0 : (isMain ? 1.0 : 0.65));
  ctx.lineCap     = 'round';
  if (virtual) ctx.setLineDash([6, 5]);

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  let covered = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
    const segLen = Math.sqrt(dx*dx + dy*dy);
    const rem    = targetLen - covered;
    if (rem >= segLen) {
      ctx.lineTo(pts[i].x, pts[i].y); covered += segLen;
    } else {
      const t = rem / segLen;
      ctx.lineTo(pts[i-1].x + dx*t, pts[i-1].y + dy*t);
      break;
    }
  }
  ctx.stroke();

  if (frac >= 1.0 && !virtual) {
    drawArrowHead(pts[pts.length - 2], pts[pts.length - 1], color, isMain);
  }
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
  ctx.fillStyle   = color;
  ctx.globalAlpha = isMain ? 1.0 : 0.65;
  ctx.beginPath();
  ctx.moveTo(mx + ux*aLen/2,             my + uy*aLen/2);
  ctx.lineTo(mx - ux*aLen/2 - uy*aHalf, my - uy*aLen/2 + ux*aHalf);
  ctx.lineTo(mx - ux*aLen/2 + uy*aHalf, my - uy*aLen/2 - ux*aHalf);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
