'use strict';

// ═══════════════════════════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════════════════════════

/* ═══════════════════════════════════════════════════
   draw.js — Canvases, dessin, graphes
   ─────────────────────────────────────────────────
   Dépend de : sim.js (chargé avant)
   Expose : resizeCanvases, drawDice, drawGraphLibre,
            drawGraphAuto, drawGraphContinu, drawRecipient,
            getAxDims, niceStep, computeFullView,
            computeFullViewContinu, computeCurrentSerieView,
            renderTable, renderLegend, renderLegendContinu,
            updateSeriesCount, updateContinuSeriesCount,
            drawTangenteAuto, drawTangenteContinu,
            pickTimeUnit
════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════
   RÉFÉRENCES CANVAS (initialisées après DOM)
══════════════════════════════════════════════════ */

let diceCanvas, diceCtx;
let graphCanvas, graphCtx;
let autoGraphCanvas, autoGraphCtx;
let continugraphCanvas, continugraphCtx;
let recipientCanvas, recipientCtx;
let recipientCanvasBig, recipientCtxBig;

/* Indicateurs de survol partagés avec ui.js */
let graphHoverLibre   = null;
let graphHoverAuto    = null;
let graphHoverContinu = null;

/* Zones de croix tangentes figées (détection clic) */
let tangenteCrossZonesAuto    = [];
let tangenteCrossZonesContinu = [];
let hoverCrossIdxAuto    = -1;
let hoverCrossIdxContinu = -1;

/* États de pan */
const autoPan    = { dragging: false, startX: 0, startY: 0, startView: null };
const continupan = { dragging: false, startX: 0, startY: 0, startView: null };

/* recipientExpanded est déclaré dans ui.js et utilisé ici */

function initCanvases() {
  diceCanvas          = document.getElementById('dice-canvas');
  diceCtx             = diceCanvas.getContext('2d');
  graphCanvas         = document.getElementById('graph-canvas');
  graphCtx            = graphCanvas.getContext('2d');
  autoGraphCanvas     = document.getElementById('auto-graph-canvas');
  autoGraphCtx        = autoGraphCanvas.getContext('2d');
  continugraphCanvas  = document.getElementById('continu-graph-canvas');
  continugraphCtx     = continugraphCanvas.getContext('2d');
  recipientCanvas     = document.getElementById('recipient-canvas');
  recipientCtx        = recipientCanvas.getContext('2d');
  recipientCanvasBig  = document.getElementById('recipient-canvas-big');
  recipientCtxBig     = recipientCanvasBig.getContext('2d');
}

/* ══════════════════════════════════════════════════
   DIMENSIONNEMENT DES CANVASES
══════════════════════════════════════════════════ */

function resizeCanvases() {
  const simArea = document.getElementById('sim-area');
  diceCanvas.width  = simArea.clientWidth;
  diceCanvas.height = simArea.clientHeight;

  const gw = document.getElementById('graph-wrap');
  graphCanvas.width  = gw.clientWidth  - 16;
  graphCanvas.height = gw.clientHeight - 30;

  const agArea = document.getElementById('auto-graph-area');
  autoGraphCanvas.width  = agArea.clientWidth  - 16;
  autoGraphCanvas.height = agArea.clientHeight - 16;

  const cgArea = document.getElementById('continu-graph-area');
  continugraphCanvas.width  = cgArea.clientWidth  - 16;
  continugraphCanvas.height = cgArea.clientHeight - 16;

  const rw       = document.getElementById('recipient-wrap');
  const rlabel   = document.getElementById('recipient-label');
  const rinforow = document.getElementById('recipient-info-row');
  const otherH = (rlabel   ? rlabel.offsetHeight  : 0)
               + (rinforow ? rinforow.offsetHeight : 0)
               + 32;
  recipientCanvas.width  = rw.clientWidth  - 20;
  recipientCanvas.height = Math.max(40, rw.clientHeight - otherH);

  const ov = document.getElementById('recipient-overlay');
  if (recipientExpanded) {
    const ovLabel   = document.getElementById('recipient-overlay-label');
    const ovInfoRow = document.getElementById('recipient-overlay-info-row');
    const ovOtherH  = (ovLabel   ? ovLabel.offsetHeight   : 0)
                    + (ovInfoRow ? ovInfoRow.offsetHeight  : 0)
                    + 56;
    recipientCanvasBig.width  = ov.clientWidth  - 24;
    recipientCanvasBig.height = Math.max(40, ov.clientHeight - ovOtherH);
  }
}

/* ══════════════════════════════════════════════════
   UTILITAIRES GRAPHE
══════════════════════════════════════════════════ */

function getAxDims(W, H) {
  const ml = 80, mr = 16, mt = 20, mb = 56;
  return { ml, mr, mt, mb, gW: W - ml - mr, gH: H - mt - mb };
}

function niceStep(range, targetN) {
  if (range <= 0) return 1;
  const raw  = range / targetN;
  const mag  = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  return (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
}

function formatAxisVal(v) {
  if (Math.abs(v) < 1e4) return String(Math.round(v * 100) / 100);
  const exp = Math.floor(Math.log10(Math.abs(v)));
  return (v / Math.pow(10, exp)).toFixed(1) + 'e' + exp;
}

function pickTimeUnit(tMax) {
  if (tMax < 1e-6)    return { factor: 1e-9,       label: 't (ns)'  };
  if (tMax < 1e-3)    return { factor: 1e-6,       label: 't (µs)'  };
  if (tMax < 1)       return { factor: 1e-3,       label: 't (ms)'  };
  if (tMax < 120)     return { factor: 1,          label: 't (s)'   };
  if (tMax < 7200)    return { factor: 60,         label: 't (min)' };
  if (tMax < 172800)  return { factor: 3600,       label: 't (h)'   };
  if (tMax < 3.15e7)  return { factor: 86400,      label: 't (j)'   };
  if (tMax < 3.15e9)  return { factor: 3.1536e7,  label: 't (ans)' };
  if (tMax < 3.15e12) return { factor: 3.1536e10, label: 't (ka)'  };
  if (tMax < 3.15e15) return { factor: 3.1536e13, label: 't (Ma)'  };
  return                     { factor: 3.1536e16, label: 't (Ga)'  };
}

/* Dessine axes + grille avec bornes explicites */
function drawAxesView(ctx, W, H, xMin, xMax, yMin, yMax, xLabel, yLabel) {
  const ml = 80, mr = 16, mt = 20, mb = 56;
  const gW = W - ml - mr, gH = H - mt - mb;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ml, mt, gW, gH);
  ctx.strokeStyle = '#c8c0b4'; ctx.lineWidth = 1;
  ctx.strokeRect(ml, mt, gW, gH);

  /* Graduations Y */
  const yStep  = niceStep(yMax - yMin, 5);
  const yFirst = Math.ceil(yMin / yStep) * yStep;
  ctx.font = '26px monospace';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let v = yFirst; v <= yMax + yStep * 0.01; v += yStep) {
    const yp = mt + gH - (v - yMin) / (yMax - yMin) * gH;
    if (yp < mt - 1 || yp > mt + gH + 1) continue;
    ctx.strokeStyle = '#e8e4de'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ml, yp); ctx.lineTo(ml + gW, yp); ctx.stroke();
    ctx.fillStyle = '#7a8a96';
    ctx.fillText(formatAxisVal(v), ml - 6, yp);
  }

  /* Graduations X */
  const xStep  = niceStep(xMax - xMin, 8);
  const xFirst = Math.ceil(xMin / xStep) * xStep;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let i = xFirst; i <= xMax + xStep * 0.01; i += xStep) {
    const xp = ml + (i - xMin) / (xMax - xMin) * gW;
    if (xp < ml - 1 || xp > ml + gW + 1) continue;
    ctx.strokeStyle = '#e8e4de'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xp, mt); ctx.lineTo(xp, mt + gH); ctx.stroke();
    ctx.fillStyle = '#7a8a96';
    ctx.fillText(formatAxisVal(i), xp, mt + gH + 6);
  }

  /* Labels axes */
  ctx.fillStyle = '#2c3e50';
  ctx.font = 'bold 26px Segoe UI, Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(xLabel, ml + gW / 2, H - 2);
  ctx.save();
  ctx.translate(18, mt + gH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();

  return { ml, mr, mt, mb, gW, gH };
}

function drawAxes(ctx, W, H, maxI, maxN, yLabel) {
  return drawAxesView(ctx, W, H, 0, maxI, 0, maxN, 'Lancer i', yLabel);
}

/* ══════════════════════════════════════════════════
   DESSIN DES DÉS
══════════════════════════════════════════════════ */

function drawDots(ctx, x, y, size, face, color) {
  const r   = size * 0.1;
  const off = size * 0.27;
  ctx.fillStyle = color;
  const positions = {
    1: [[0,0]],
    2: [[-off,-off],[off,off]],
    3: [[-off,-off],[0,0],[off,off]],
    4: [[-off,-off],[off,-off],[-off,off],[off,off]],
    5: [[-off,-off],[off,-off],[0,0],[-off,off],[off,off]],
    6: [[-off,-off],[off,-off],[-off,0],[off,0],[-off,off],[off,off]],
  };
  for (const [dx, dy] of (positions[face] || [])) {
    ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill();
  }
}

function drawOneDie(ctx, x, y, size, face, active) {
  const radius = size * 0.12;
  ctx.fillStyle = active ? '#f5f0e8' : '#c05020';
  ctx.beginPath(); ctx.roundRect(x, y, size, size, radius); ctx.fill();
  ctx.strokeStyle = active ? '#8a8070' : '#8a3010';
  ctx.lineWidth = 1; ctx.stroke();
  drawDots(ctx, x + size / 2, y + size / 2, size, face, active ? '#2c3e50' : '#fff');
}

function drawDice() {
  const W = diceCanvas.width, H = diceCanvas.height;
  diceCtx.clearRect(0, 0, W, H);
  const n = state.dice.length;
  if (n === 0) return;
  const PAD = 8, GAP = 3;
  let bestSize = 10;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const s = Math.min(
      (W - 2*PAD - (cols-1)*GAP) / cols,
      (H - 2*PAD - (rows-1)*GAP) / rows
    );
    if (s > bestSize) bestSize = s;
  }
  const size = Math.max(8, Math.min(60, bestSize));
  const cols = Math.floor((W - 2*PAD + GAP) / (size + GAP));
  const rows = Math.ceil(n / cols);
  const gridW = cols * size + (cols-1) * GAP;
  const gridH = rows * size + (rows-1) * GAP;
  const startX = PAD + (W - 2*PAD - gridW) / 2;
  const startY = PAD + (H - 2*PAD - gridH) / 2;
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    drawOneDie(diceCtx,
      startX + col*(size+GAP), startY + row*(size+GAP),
      size, state.dice[i].face, state.dice[i].active);
  }
}

/* ══════════════════════════════════════════════════
   RÉCIPIENT — NOYAUX RADIOACTIFS
══════════════════════════════════════════════════ */

function drawRecipient() {
  _drawRecipientOnCanvas(recipientCanvas, recipientCtx);
  if (recipientExpanded) _drawRecipientOnCanvas(recipientCanvasBig, recipientCtxBig);
}

function _drawRecipientOnCanvas(canvas, ctx) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (W <= 0 || H <= 0) return;

  const serie = state.animCurrentSerie ||
    (state.seriesContinu.length > 0 ? state.seriesContinu[state.seriesContinu.length - 1] : null);

  let frac = 1.0;
  if (serie) {
    const tRef = state.animCurrentSerie ? state.animSimTime : serie.duree;
    const N    = serie.n0 * Math.exp(-serie.lambda * tRef);
    frac = Math.max(0, Math.min(1, N / serie.n0));
  }

  if (serie && !serie.disqueOrder) {
    const nD    = getNDisques();
    const order = Array.from({ length: nD }, (_, i) => i);
    for (let i = nD - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    serie.disqueOrder = order;
  }

  const nDisques = serie ? serie.disqueOrder.length : getNDisques();
  const rankOf   = serie ? new Uint16Array(nDisques) : null;
  if (serie) for (let k = 0; k < nDisques; k++) rankOf[serie.disqueOrder[k]] = k;

  const PAD = 8, GAP = 3, n = nDisques;
  let cols = Math.max(1, Math.ceil(Math.sqrt(n * W / H)));
  const rows = Math.ceil(n / cols);
  const diam = Math.min(
    (W - 2*PAD - (cols-1)*GAP) / cols,
    (H - 2*PAD - (rows-1)*GAP) / rows
  );
  const r = Math.max(2, diam / 2);
  const actualCols = Math.floor((W - 2*PAD + GAP) / (diam + GAP));
  const gridW = actualCols * diam + (actualCols - 1) * GAP;
  const actualRows = Math.ceil(n / actualCols);
  const gridH = actualRows * diam + (actualRows - 1) * GAP;
  const startX = PAD + (W - 2*PAD - gridW) / 2;
  const startY = PAD + (H - 2*PAD - gridH) / 2;

  const nDisint = Math.round((1 - frac) * n);

  for (let i = 0; i < n; i++) {
    const col = i % actualCols;
    const row = Math.floor(i / actualCols);
    const cx  = startX + col * (diam + GAP) + r;
    const cy  = startY + row * (diam + GAP) + r;
    const desintegre = serie ? (rankOf[i] < nDisint) : false;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle   = desintegre ? '#c05020' : '#c8c4bc';
    ctx.fill();
    ctx.strokeStyle = desintegre ? '#8a3010' : '#8a8070';
    ctx.lineWidth   = 0.5;
    ctx.stroke();
  }
}

/* ══════════════════════════════════════════════════
   TABLEAU DES RÉSULTATS (mode libre discret)
══════════════════════════════════════════════════ */

function renderTable() {
  const tbody = document.getElementById('results-tbody');
  tbody.innerHTML = '';
  const tr0 = document.createElement('tr');
  tr0.innerHTML = `
    <td>Démarrage</td>
    <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
    <td>${state.nDiceLibre}</td>`;
  tbody.appendChild(tr0);
  for (const row of state.tableRows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>Lancer n° ${row.lancer}</td>
      ${row.counts.map(c => `<td>${c}</td>`).join('')}
      <td>${row.grises}</td>`;
    tbody.appendChild(tr);
  }
  const wrap = document.getElementById('table-wrap');
  wrap.scrollTop = wrap.scrollHeight;
}

/* ══════════════════════════════════════════════════
   GRAPHE MODE LIBRE DISCRET
══════════════════════════════════════════════════ */

function drawCurve(ctx, pts, maxI, maxN, ax, color, lineWidth) {
  const { ml, mt, gW, gH } = ax;
  ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const xp = ml + (i / maxI) * gW;
    const yp = mt + gH - (pts[i] / maxN) * gH;
    i === 0 ? ctx.moveTo(xp, yp) : ctx.lineTo(xp, yp);
  }
  ctx.stroke();
}

function drawPoints(ctx, pts, maxI, maxN, ax, color, r) {
  const { ml, mt, gW, gH } = ax;
  ctx.fillStyle = color;
  for (let i = 0; i < pts.length; i++) {
    const xp = ml + (i / maxI) * gW;
    const yp = mt + gH - (pts[i] / maxN) * gH;
    ctx.beginPath(); ctx.arc(xp, yp, r, 0, Math.PI * 2); ctx.fill();
  }
}

function drawHoverInfo(ctx, hover, pts, maxI, maxN, ax, color, yLabelPrefix) {
  if (!hover) return;
  const { ml, mt, gW, gH } = ax;
  if (hover.x < ml || hover.x > ml + gW || hover.y < mt || hover.y > mt + gH) return;
  const mouseI = (hover.x - ml) / gW * maxI;
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.abs(i - mouseI);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  const bx  = ml + (bestIdx / maxI) * gW;
  const by  = mt + gH - (pts[bestIdx] / maxN) * gH;
  const byc = Math.max(mt, Math.min(mt + gH, by));
  ctx.save();
  ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(60,60,60,0.45)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(bx, mt + gH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(ml, byc); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(bx, byc, 5, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  const label = `i = ${bestIdx},  ${yLabelPrefix} = ${pts[bestIdx].toFixed(1)}`;
  ctx.font = '26px monospace'; ctx.fillStyle = color; ctx.textBaseline = 'bottom';
  const lw = ctx.measureText(label).width;
  const lx = bx + 10 + lw > ml + gW ? bx - 10 - lw : bx + 10;
  const ly = byc - 6 < mt + 14       ? byc + 18      : byc - 6;
  ctx.fillText(label, lx, ly);
  ctx.restore();
}

function drawGraphLibre() {
  const W = graphCanvas.width, H = graphCanvas.height;
  const ctx = graphCtx;
  ctx.clearRect(0, 0, W, H);
  if (state.tableRows.length === 0) return;
  const pts  = [state.nDiceLibre, ...state.tableRows.map(r => r.grises)];
  const maxI = pts.length - 1;
  const maxN = Math.max(...pts, 1);
  if (maxI === 0) return;
  const ax = drawAxes(ctx, W, H, maxI, maxN, 'N (dés gris)');
  drawCurve(ctx, pts, maxI, maxN, ax, '#2a6aaa', 2);
  drawPoints(ctx, pts, maxI, maxN, ax, '#2a6aaa', 3);
  drawHoverInfo(ctx, graphHoverLibre, pts, maxI, maxN, ax, '#2a6aaa', 'N');
}

/* ══════════════════════════════════════════════════
   GRAPHE MODE AUTO DISCRET (multi-séries)
══════════════════════════════════════════════════ */

function computeFullView() {
  let maxI = 0, maxN = 0;
  for (const s of state.series) {
    if (s.hidden) continue;
    maxI = Math.max(maxI, s.nmoy.length - 1);
    maxN = Math.max(maxN, ...s.nmoy, ...(s.showIndiv ? s.sims.flat() : []));
  }
  return { xMin: 0, xMax: Math.max(maxI, 1), yMin: 0, yMax: Math.max(maxN, 1) };
}

/* Taille de police adaptée à la largeur de la zone graphique */
function tanFontSize(gW) {
  return Math.max(11, Math.min(26, Math.round(26 * gW / 1500)));
}

/* Dessine l'étiquette d'une tangente (label + croix ✕) */
function drawTangetteLabel(ctx, px, py, line1, line2, color, ml, mt, gW, gH, isHovered) {
  ctx.save();
  const fs = tanFontSize(gW);
  ctx.font = fs + 'px monospace';
  const lw1 = ctx.measureText(line1).width;
  const lw2 = ctx.measureText(line2).width;
  const PAD    = Math.round(fs * 0.3);
  const LINE_H = Math.round(fs * 1.25);
  const CROSS_W = Math.round(fs * 0.9);
  const boxW = Math.max(lw1, lw2) + PAD * 2 + CROSS_W;
  const boxH = LINE_H * 2 + PAD * 2;

  let lx = px + 12;
  if (lx + boxW > ml + gW) lx = px - 12 - boxW;
  let ly = py - boxH - 6;
  if (ly < mt) ly = py + 8;

  ctx.fillStyle = 'rgba(44,62,80,0.88)';
  ctx.beginPath(); ctx.roundRect(lx, ly, boxW, boxH, 4); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(lx, ly, boxW, boxH, 4); ctx.stroke();

  ctx.font = fs + 'px monospace';
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(line1, lx + PAD, ly + PAD + LINE_H / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fillText(line2, lx + PAD, ly + PAD + LINE_H + LINE_H / 2);

  const cx2 = lx + boxW - CROSS_W / 2;
  const cy2 = ly + LINE_H / 2;
  if (isHovered) {
    ctx.fillStyle = 'rgba(220,60,60,0.85)';
    ctx.beginPath(); ctx.arc(cx2, cy2, CROSS_W * 0.52, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.60)';
  }
  ctx.font = 'bold ' + Math.round(fs * 0.72) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('✕', cx2, cy2);
  ctx.restore();
  return { x: cx2, y: cy2, r: Math.max(10, CROSS_W) };
}

/* Tangente sur graphe auto discret */
function drawTangenteAuto(ctx, fig, toX, toY, xMin, xMax, ml, mt, gW, gH, isFig, isHovered) {
  const n = fig.serie.nmoy;
  const i0 = fig.i0, slope = fig.slope;
  const tanLen = (xMax - xMin) * 0.3;
  const xi1 = i0 - tanLen, xi2 = i0 + tanLen;
  const yi1 = slope * (xi1 - i0) + n[i0];
  const yi2 = slope * (xi2 - i0) + n[i0];
  ctx.save();
  ctx.beginPath(); ctx.rect(ml, mt, gW, gH); ctx.clip();
  ctx.strokeStyle = fig.serie.color; ctx.lineWidth = isFig ? 2 : 1.8;
  ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.moveTo(toX(xi1), toY(yi1)); ctx.lineTo(toX(xi2), toY(yi2)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  const px = toX(i0), py = toY(n[i0]);
  ctx.save();
  ctx.fillStyle = fig.serie.color; ctx.shadowColor = fig.serie.color; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  const line1 = `i = ${i0},  N_moy = ${n[i0].toFixed(1)}`;
  const line2 = `Pente : ${slope.toFixed(3)} Dés rouges par lancer`;
  const crossZone = drawTangetteLabel(ctx, px, py, line1, line2, fig.serie.color, ml, mt, gW, gH, isHovered);
  ctx.restore();
  return isFig ? crossZone : null;
}

/* Tangente sur graphe continu */
function drawTangenteContinu(ctx, fig, toX, toY, xMinV, xMaxV, ml, mt, gW, gH, isFig, isHovered) {
  const halfSpan = (xMaxV - xMinV) * 0.25;
  const tx1 = fig.t0 - halfSpan, tx2 = fig.t0 + halfSpan;
  const ty1 = fig.v0 + fig.slope * (tx1 - fig.t0);
  const ty2 = fig.v0 + fig.slope * (tx2 - fig.t0);
  ctx.save();
  ctx.beginPath(); ctx.rect(ml, mt, gW, gH); ctx.clip();
  ctx.strokeStyle = fig.serie.color; ctx.lineWidth = isFig ? 2 : 1.8;
  ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.moveTo(toX(tx1), toY(ty1)); ctx.lineTo(toX(tx2), toY(ty2)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  const px = toX(fig.t0), py = toY(fig.v0);
  ctx.save();
  ctx.fillStyle = fig.serie.color; ctx.shadowColor = fig.serie.color; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  const { factor: tFacSerie } = pickTimeUnit(fig.serie.duree);
  const tUnitSerie = unitSuffix(tFacSerie);
  const isN = state.graphModeContinu === 'N';
  const yStr    = isN ? (fig.v0 / 1e23).toFixed(3) + ' ×10²³' : formatSci(fig.v0);
  const yPrefix = isN ? 'N' : 'A';
  const tStr    = formatTimeInUnit(fig.t0, tFacSerie);
  const line1   = `t = ${tStr},  ${yPrefix} = ${yStr}`;
  const slopeInUnit = fig.slope * tFacSerie;
  const line2 = `Pente : ${formatSci(slopeInUnit)} Désintégrations par ${tUnitSerie}`;
  const crossZone = drawTangetteLabel(ctx, px, py, line1, line2, fig.serie.color, ml, mt, gW, gH, isHovered);
  ctx.restore();
  return isFig ? crossZone : null;
}

function drawGraphAuto() {
  const W = autoGraphCanvas.width, H = autoGraphCanvas.height;
  const ctx = autoGraphCtx;
  ctx.clearRect(0, 0, W, H);

  if (state.series.length === 0) {
    ctx.fillStyle = '#c8c0b4';
    ctx.font = '13px Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Lancez des simulations puis ajoutez-les au graphe.', W / 2, H / 2);
    return;
  }

  const v = state.view || computeFullView();
  const { xMin, xMax, yMin, yMax } = v;
  if (xMax <= xMin || yMax <= yMin) return;

  const ax = drawAxesView(ctx, W, H, xMin, xMax, yMin, yMax, 'Lancer i', 'N_moy');
  const { ml, mt, gW, gH } = ax;
  const toX = i  => ml + (i  - xMin) / (xMax - xMin) * gW;
  const toY = vv => mt + gH - (vv - yMin) / (yMax - yMin) * gH;

  ctx.save();
  ctx.beginPath(); ctx.rect(ml, mt, gW, gH); ctx.clip();

  /* Courbes individuelles */
  for (const s of state.series) {
    if (s.hidden || !s.showIndiv) continue;
    ctx.save(); ctx.globalAlpha = 0.25;
    for (const sim of s.sims) {
      ctx.strokeStyle = s.color; ctx.lineWidth = 1; ctx.beginPath();
      let first = true;
      for (let i = 0; i < sim.length; i++) {
        const px = toX(i), py = toY(sim[i]);
        first ? ctx.moveTo(px, py) : ctx.lineTo(px, py); first = false;
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /* Courbes moyennes */
  for (const s of state.series) {
    if (s.hidden) continue;
    ctx.strokeStyle = s.color; ctx.lineWidth = 2.5; ctx.beginPath();
    let first = true;
    for (let i = 0; i < s.nmoy.length; i++) {
      const px = toX(i), py = toY(s.nmoy[i]);
      first ? ctx.moveTo(px, py) : ctx.lineTo(px, py); first = false;
    }
    ctx.stroke();
    ctx.fillStyle = s.color;
    for (let i = 0; i < s.nmoy.length; i++) {
      const px = toX(i), py = toY(s.nmoy[i]);
      ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.restore();

  /* Hover multi-courbes */
  if (!state.reticuleModeAuto && !state.tangenteAuto && graphHoverAuto) {
    const hx = graphHoverAuto.x, hy = graphHoverAuto.y;
    if (hx >= ml && hx <= ml + gW && hy >= mt && hy <= mt + gH) {
      let bestSerie = null, bestIdx = 0, bestDist = Infinity;
      for (const s of state.series) {
        if (s.hidden) continue;
        for (let i = 0; i < s.nmoy.length; i++) {
          const d = Math.hypot(toX(i) - hx, toY(s.nmoy[i]) - hy);
          if (d < bestDist) { bestDist = d; bestSerie = s; bestIdx = i; }
        }
      }
      if (bestSerie) {
        const bx  = toX(bestIdx), by = toY(bestSerie.nmoy[bestIdx]);
        const byc = Math.max(mt, Math.min(mt + gH, by));
        ctx.save();
        ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(60,60,60,0.45)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(bx, mt + gH); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(ml, byc); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = bestSerie.color; ctx.shadowColor = bestSerie.color; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(bx, byc, 5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        const label = `i = ${bestIdx},  N_moy = ${bestSerie.nmoy[bestIdx].toFixed(1)}`;
        ctx.font = '26px monospace'; ctx.fillStyle = bestSerie.color; ctx.textBaseline = 'bottom';
        const lw = ctx.measureText(label).width;
        const lx = bx + 10 + lw > ml + gW ? bx - 10 - lw : bx + 10;
        const ly = byc - 6 < mt + 30       ? byc + 32      : byc - 6;
        ctx.fillText(label, lx, ly);
        ctx.restore();
      }
    }
  }

  /* Tangentes figées */
  tangenteCrossZonesAuto = [];
  for (let fi = 0; fi < state.tangentesFigAuto.length; fi++) {
    const fig = state.tangentesFigAuto[fi];
    if (!state.series.find(s => s.id === fig.serie.id) || fig.serie.hidden) continue;
    const cz = drawTangenteAuto(ctx, fig, toX, toY, xMin, xMax, ml, mt, gW, gH, true, hoverCrossIdxAuto === fi);
    if (cz) tangenteCrossZonesAuto.push({ idx: fi, ...cz });
  }

  /* Tangente hover */
  if (state.tangenteAuto && state.series.length > 0 && graphHoverAuto) {
    const hx = graphHoverAuto.x, hy = graphHoverAuto.y;
    if (hx >= ml && hx <= ml + gW && hy >= mt && hy <= mt + gH) {
      let bestSerie = null, bestIdx = 0, bestDist = Infinity;
      for (const s of state.series) {
        if (s.hidden) continue;
        for (let i = 0; i < s.nmoy.length; i++) {
          const d = Math.hypot(toX(i) - hx, toY(s.nmoy[i]) - hy);
          if (d < bestDist) { bestDist = d; bestSerie = s; bestIdx = i; }
        }
      }
      if (bestSerie && bestDist < 40) {
        const n = bestSerie.nmoy, i0 = bestIdx;
        const iPrev = Math.max(0, i0 - 1), iNext = Math.min(n.length - 1, i0 + 1);
        const slope = (n[iNext] - n[iPrev]) / (iNext - iPrev);
        drawTangenteAuto(ctx, { i0, slope, serie: bestSerie }, toX, toY, xMin, xMax, ml, mt, gW, gH, false);
      }
    }
  }

  /* Réticule libre */
  if (state.reticuleModeAuto && graphHoverAuto) {
    const hx = graphHoverAuto.x, hy = graphHoverAuto.y;
    if (hx >= ml && hx <= ml + gW && hy >= mt && hy <= mt + gH) {
      const view = state.view || computeFullView();
      const xVal = view.xMin + (hx - ml) / gW * (view.xMax - view.xMin);
      const yVal = view.yMin + (1 - (hy - mt) / gH) * (view.yMax - view.yMin);
      ctx.save();
      ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(44,62,80,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx, mt); ctx.lineTo(hx, mt + gH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ml, hy); ctx.lineTo(ml + gW, hy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#2c3e50';
      ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      const canvasRect = autoGraphCanvas.getBoundingClientRect();
      const scaleX = canvasRect.width / autoGraphCanvas.width;
      const scaleY = canvasRect.height / autoGraphCanvas.height;
      const tooltip = document.getElementById('reticule-tooltip-auto');
      tooltip.innerHTML = `i = ${xVal.toFixed(1)}<br>N = ${yVal.toFixed(1)}`;
      tooltip.style.display = 'block';
      tooltip.style.position = 'fixed';
      tooltip.style.left = (canvasRect.left + hx * scaleX + 14) + 'px';
      tooltip.style.top  = (canvasRect.top  + hy * scaleY - 10) + 'px';
    } else {
      document.getElementById('reticule-tooltip-auto').style.display = 'none';
    }
  } else if (!state.reticuleModeAuto) {
    document.getElementById('reticule-tooltip-auto').style.display = 'none';
  }

  /* Rectangle de sélection zoom */
  if (state.zoomModeAuto && state.zoomRectAuto) {
    const { x0, y0, x1, y1 } = state.zoomRectAuto;
    const rx = Math.min(x0, x1), ry = Math.min(y0, y1);
    const rw = Math.abs(x1 - x0), rh = Math.abs(y1 - y0);
    ctx.save();
    ctx.strokeStyle = '#2a6aaa'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.fillStyle = 'rgba(42,106,170,0.08)'; ctx.fillRect(rx, ry, rw, rh);
    ctx.restore();
  }
}

/* ══════════════════════════════════════════════════
   GRAPHE MODE CONTINU
══════════════════════════════════════════════════ */

function computeCurrentSerieView() {
  const s = state.animCurrentSerie;
  if (!s || s.pts.length === 0) return null;
  return { xMin: 0, xMax: s.duree > 0 ? s.duree : 1e-30, yMin: 0, yMax: s.pts[0].v > 0 ? s.pts[0].v : 1 };
}

function computeFullViewContinu() {
  let xMax = 0, yMax = 0;
  for (const s of getAllContinuSeries()) {
    if (s.hidden || s.pts.length === 0) continue;
    xMax = Math.max(xMax, s.pts[s.pts.length - 1].t);
    yMax = Math.max(yMax, ...s.pts.map(p => p.v));
  }
  return { xMin: 0, xMax: xMax > 0 ? xMax : 1, yMin: 0, yMax: yMax > 0 ? yMax : 1 };
}

function drawGraphContinu() {
  const W = continugraphCanvas.width, H = continugraphCanvas.height;
  const ctx = continugraphCtx;
  ctx.clearRect(0, 0, W, H);

  const allSeries = getAllContinuSeries();

  if (allSeries.length === 0) {
    ctx.fillStyle = '#c8c0b4';
    ctx.font = '13px Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Lancer une simulation', W / 2, H / 2);
    return;
  }

  const v = state.viewContinu || computeCurrentSerieView() || computeFullViewContinu();
  const { xMin, xMax, yMin, yMax } = v;
  if (xMax <= xMin || yMax <= yMin) return;

  const { factor: tFactor, label: tLabel } = pickTimeUnit(xMax);
  const xMinU = xMin / tFactor, xMaxU = xMax / tFactor;

  const isN = state.graphModeContinu === 'N';
  let yFactor, yLabelText;
  if (isN) {
    yFactor = 1e23; yLabelText = 'N(t) (×10²³)';
  } else {
    let aMax = 0;
    for (const s of allSeries) {
      if (s.hidden || s.pts.length === 0) continue;
      aMax = Math.max(aMax, s.pts[0].v);
    }
    if (aMax === 0) aMax = 1;
    const aExp = Math.floor(Math.log10(aMax));
    const aMag = Math.pow(10, aExp);
    const supMap = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','-':'⁻'};
    const expStr = String(aExp).split('').map(c => supMap[c] || c).join('');
    yFactor = aMag; yLabelText = 'A(t) (×10' + expStr + ' s⁻¹)';
  }
  const yMinU = yMin / yFactor, yMaxU = yMax / yFactor;

  const ax = drawAxesView(ctx, W, H, xMinU, xMaxU, yMinU, yMaxU, tLabel, yLabelText);
  const { ml, mt, gW, gH } = ax;
  const toX = t  => ml + (t  / tFactor - xMinU) / (xMaxU - xMinU) * gW;
  const toY = vv => mt + gH - (vv / yFactor - yMinU) / (yMaxU - yMinU) * gH;

  ctx.save();
  ctx.beginPath(); ctx.rect(ml, mt, gW, gH); ctx.clip();

  for (const s of allSeries) {
    if (s.hidden || s.pts.length < 1) continue;
    ctx.strokeStyle = s.color;
    ctx.lineWidth   = s._running ? 2 : 2.5;
    if (s._running) ctx.setLineDash([6, 3]);
    ctx.beginPath();
    let first = true;
    for (const p of s.pts) {
      const px = toX(p.t), py = toY(p.v);
      first ? ctx.moveTo(px, py) : ctx.lineTo(px, py); first = false;
    }
    if (s.livePoint) {
      const px = toX(s.livePoint.t), py = toY(s.livePoint.v);
      first ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();

  /* Hover multi-courbes */
  if (!state.reticuleMode && !state.tangenteContinu && graphHoverContinu) {
    const hx = graphHoverContinu.x, hy = graphHoverContinu.y;
    if (hx >= ml && hx <= ml + gW && hy >= mt && hy <= mt + gH) {
      let bestSerie = null, bestPt = null, bestDist = Infinity;
      for (const s of allSeries) {
        if (s.hidden) continue;
        for (const p of s.pts) {
          const d = Math.hypot(toX(p.t) - hx, toY(p.v) - hy);
          if (d < bestDist) { bestDist = d; bestSerie = s; bestPt = p; }
        }
      }
      if (bestSerie && bestPt) {
        const bx  = toX(bestPt.t), by = toY(bestPt.v);
        const byc = Math.max(mt, Math.min(mt + gH, by));
        ctx.save();
        ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(60,60,60,0.45)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(bx, mt + gH); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(ml, byc); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = bestSerie.color; ctx.shadowColor = bestSerie.color; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(bx, byc, 5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        const yStr    = isN ? (bestPt.v / 1e23).toFixed(3) + ' ×10²³' : formatSci(bestPt.v);
        const tStr    = formatTimeInUnit(bestPt.t, tFactor);
        const yPrefix = isN ? 'N' : 'A';
        const label   = `t = ${tStr},  ${yPrefix} = ${yStr}`;
        ctx.font = '26px monospace'; ctx.fillStyle = bestSerie.color; ctx.textBaseline = 'bottom';
        const lw = ctx.measureText(label).width;
        const lx = bx + 10 + lw > ml + gW ? bx - 10 - lw : bx + 10;
        const ly = byc - 6 < mt + 30       ? byc + 32      : byc - 6;
        ctx.fillText(label, lx, ly);
        ctx.restore();
      }
    }
  }

  /* Tangentes figées */
  tangenteCrossZonesContinu = [];
  {
    const { xMin: xMinV, xMax: xMaxV } = state.viewContinu || computeFullViewContinu();
    for (let fi = 0; fi < state.tangentesFigContinu.length; fi++) {
      const fig = state.tangentesFigContinu[fi];
      if (!getAllContinuSeries().find(s => s.id === fig.serie.id) || fig.serie.hidden) continue;
      const cz = drawTangenteContinu(ctx, fig, toX, toY, xMinV, xMaxV, ml, mt, gW, gH, true, hoverCrossIdxContinu === fi);
      if (cz) tangenteCrossZonesContinu.push({ idx: fi, ...cz });
    }
  }

  /* Tangente hover */
  if (state.tangenteContinu && allSeries.length > 0 && graphHoverContinu) {
    const { xMin: xMinV, xMax: xMaxV } = state.viewContinu || computeFullViewContinu();
    const hx = graphHoverContinu.x, hy = graphHoverContinu.y;
    if (hx >= ml && hx <= ml + gW && hy >= mt && hy <= mt + gH) {
      let bestSerie = null, bestPt = null, bestIdx = 0, bestDist = Infinity;
      for (const s of allSeries) {
        if (s.hidden) continue;
        for (let i = 0; i < s.pts.length; i++) {
          const p = s.pts[i];
          const d = Math.hypot(toX(p.t) - hx, toY(p.v) - hy);
          if (d < bestDist) { bestDist = d; bestSerie = s; bestPt = p; bestIdx = i; }
        }
      }
      if (bestSerie && bestPt && bestDist < 50) {
        const pts = bestSerie.pts;
        const i0 = bestIdx;
        const iPrev = Math.max(0, i0 - 1), iNext = Math.min(pts.length - 1, i0 + 1);
        const dt = pts[iNext].t - pts[iPrev].t;
        const slope = dt !== 0 ? (pts[iNext].v - pts[iPrev].v) / dt : 0;
        drawTangenteContinu(ctx, { t0: bestPt.t, v0: bestPt.v, slope, serie: bestSerie },
          toX, toY, xMinV, xMaxV, ml, mt, gW, gH, false);
      }
    }
  }

  /* Réticule libre */
  if (state.reticuleMode && graphHoverContinu) {
    const hx = graphHoverContinu.x, hy = graphHoverContinu.y;
    if (hx >= ml && hx <= ml + gW && hy >= mt && hy <= mt + gH) {
      const view = state.viewContinu || computeFullViewContinu();
      const { factor: tFactor2 } = pickTimeUnit(view.xMax);
      const xMinU2 = view.xMin / tFactor2, xMaxU2 = view.xMax / tFactor2;
      const tVal    = (xMinU2 + (hx - ml) / gW * (xMaxU2 - xMinU2)) * tFactor2;
      const yValRaw = view.yMin + (1 - (hy - mt) / gH) * (view.yMax - view.yMin);
      const yPrefix = isN ? 'N' : 'A';
      const yStr    = isN ? (yValRaw / 1e23).toFixed(3) + ' ×10²³' : formatSci(yValRaw);
      ctx.save();
      ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(44,62,80,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx, mt); ctx.lineTo(hx, mt + gH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ml, hy); ctx.lineTo(ml + gW, hy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#2c3e50';
      ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      const canvasRect = continugraphCanvas.getBoundingClientRect();
      const scaleX = canvasRect.width / W, scaleY = canvasRect.height / H;
      const tooltip = document.getElementById('reticule-tooltip');
      tooltip.innerHTML = `t = ${formatTimeInUnit(tVal, tFactor2)}<br>${yPrefix} = ${yStr}`;
      tooltip.style.display = 'block';
      tooltip.style.position = 'fixed';
      tooltip.style.left = (canvasRect.left + hx * scaleX + 14) + 'px';
      tooltip.style.top  = (canvasRect.top  + hy * scaleY - 10) + 'px';
    } else {
      document.getElementById('reticule-tooltip').style.display = 'none';
    }
  } else if (!state.reticuleMode) {
    document.getElementById('reticule-tooltip').style.display = 'none';
  }

  /* Rectangle de sélection zoom */
  if (state.zoomModeContinu && state.zoomRect) {
    const { x0, y0, x1, y1 } = state.zoomRect;
    const rx = Math.min(x0, x1), ry = Math.min(y0, y1);
    const rw = Math.abs(x1 - x0), rh = Math.abs(y1 - y0);
    ctx.save();
    ctx.strokeStyle = '#2a6aaa'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.fillStyle = 'rgba(42,106,170,0.08)'; ctx.fillRect(rx, ry, rw, rh);
    ctx.restore();
  }
}

/* ══════════════════════════════════════════════════
   LÉGENDES
══════════════════════════════════════════════════ */

function renderLegend() {
  const container = document.getElementById('legend-rows');
  container.innerHTML = '';
  if (state.series.length === 0) {
    container.innerHTML = '<span style="font-size:11px;color:#7a8a96;font-style:italic;">Aucune série ajoutée.</span>';
    return;
  }
  for (const s of state.series) {
    const row = document.createElement('div');
    row.className = 'legend-row';
    row.innerHTML = `
      <div class="legend-swatch" style="background:${s.color};opacity:${s.hidden ? 0.3 : 1};"></div>
      <span class="legend-label" style="opacity:${s.hidden ? 0.4 : 1};">
        <span class="legend-item">N₀ = ${s.n0}</span>
        <span class="legend-item">p(6) = ${s.pip}</span>
        <span class="legend-item">n = ${s.nSim} simulations</span>
      </span>
      <button class="legend-toggle" style="white-space:nowrap;"
              onclick="adapterEchelleAuto(${s.id})">🔍 Adapter</button>
      <button class="legend-hide ${s.hidden ? 'hidden' : ''}"
              onclick="masquerSerie(${s.id})">${s.hidden ? '👁 Afficher' : '👁 Masquer'}</button>
      <button class="legend-toggle ${s.showIndiv ? 'on' : ''}"
              onclick="toggleIndiv(${s.id})">
        ${s.showIndiv ? 'Courbes indiv. ✓' : 'Courbes indiv.'}
      </button>
      <button class="legend-del" onclick="supprimerSerie(${s.id})">✕</button>
    `;
    container.appendChild(row);
  }
}

function renderLegendContinu() {
  const container = document.getElementById('continu-legend-rows');
  container.innerHTML = '';
  if (state.seriesContinu.length === 0 && !state.animCurrentSerie) {
    container.innerHTML = '<span style="font-size:11px;color:#7a8a96;font-style:italic;">Aucune série. Appuyez sur Simuler.</span>';
    return;
  }
  const toRender = [...state.seriesContinu];
  if (state.animCurrentSerie) toRender.push({ ...state.animCurrentSerie, _running: true });
  for (const s of toRender) {
    const row = document.createElement('div');
    row.className = 'legend-row';
    const statusTag = s._running
      ? '<span style="font-size:13px;color:#2a8a50;font-weight:700;">▶ en cours</span>'
      : '';
    row.innerHTML = `
      <div class="legend-swatch" style="background:${s.color};opacity:${s.hidden ? 0.3 : 1};"></div>
      <span class="legend-label" style="opacity:${s.hidden ? 0.4 : 1};">
        <span class="legend-item">N₀ = ${formatSci(s.n0)}</span>
        <span class="legend-item">λ = ${formatSci(s.lambda)} s⁻¹</span>
        ${statusTag}
      </span>
      <button class="legend-toggle" style="white-space:nowrap;"
              onclick="adapterEchelleContinu(${s.id})">🔍 Adapter</button>
      ${!s._running ? `
      <button class="legend-hide ${s.hidden ? 'hidden' : ''}"
              onclick="masquerSerieContinu(${s.id})">${s.hidden ? '👁 Afficher' : '👁 Masquer'}</button>
      <button class="legend-del" onclick="supprimerSerieContinu(${s.id})">✕</button>
      ` : ''}
    `;
    container.appendChild(row);
  }
}

function updateSeriesCount() {
  const n = state.series.length;
  document.getElementById('auto-series-count').textContent =
    n === 0 ? '' : `${n} / ${MAX_SERIES} série(s) affichée(s)`;
}

function updateContinuSeriesCount() {
  const n = state.seriesContinu.length;
  document.getElementById('continu-series-count').textContent =
    n === 0 ? '' : `${n} / ${MAX_SERIES} série(s) affichée(s)`;
}
