/* ══════════════════════════════════════════════════════════════════════════
   Simulation pédagogique — Physique-Chimie Lycée
   Auteur  : Mathieu Berdous
   Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   SIM.JS — État global, canvas, géométrie, layout et rendu molécules
   Dépend de : data.js
   Expose : state, molCanvas, molCtx, invalidateGeomCache, getColRects,
            getCanvasCellRect, getTableBottomY, getSepX,
            resizeCanvas, resizeCanvasDuringAnim, fixCanvasRowHeight,
            fixAndRedraw, relayoutLimAfterResize,
            computeLayout, computeLayoutLim, computeLayoutLimFixed,
            getBoundingRadius, scaleFor, scaleForMulti, gridPositions,
            drawBackground, drawMolecule, drawBonds, drawAtom,
            drawStatic, drawLastFrameEq, redraw,
            lerp, easeInOut, roundRect,
            calcScalesFixed
══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   ÉTAT GLOBAL
══════════════════════════════════════════════════════════════════════════ */
const state = {
  onglet: 'equilibrage',
  reactionEqIdx: 0,
  coeffsUser: [],
  animEq: null,
  lastFrameEq: null,
  reactionLimIdx: 0,
  qtesLimInit: [],
  qtesR: [],
  qtesP: [],
  animLim: null,
  lastFrameLim: null,
  stepCache: null,
  showProductsEq: false,
  showCoeffOneEq: false,
  showCoeffOneLim: false,
  avancement: 0,
  xmax: null,
  predictionMode: false,
  predictions: {},
  comparaisonMode: 0,
};

/* ══════════════════════════════════════════════════════════════════════════
   CANVAS
══════════════════════════════════════════════════════════════════════════ */
const molCanvas = document.getElementById('mol-canvas');
const molCtx    = molCanvas.getContext('2d');

function resizeCanvas() {
  const dpr  = window.devicePixelRatio || 1;
  const wrap = document.getElementById('canvas-and-table');
  const newW = wrap.clientWidth;
  const h    = parseInt(wrap.style.height, 10);
  const newH = (h > 0 ? h : wrap.offsetHeight) || wrap.clientHeight;
  let changed = false;
  if (molCanvas.width  !== Math.round(newW * dpr)) { molCanvas.width  = Math.round(newW * dpr); changed = true; }
  if (molCanvas.height !== Math.round(newH * dpr)) { molCanvas.height = Math.round(newH * dpr); changed = true; }
  if (changed) molCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (changed) invalidateGeomCache();
  if (changed && !state.animEq && !state.animLim && !state._skipAutoRedraw) redraw();
}

function resizeCanvasDuringAnim() {
  const dpr  = window.devicePixelRatio || 1;
  const wrap = document.getElementById('canvas-and-table');
  const newW = wrap.clientWidth;
  const h    = parseInt(wrap.style.height, 10);
  const newH = (h > 0 ? h : wrap.offsetHeight) || wrap.clientHeight;
  let changed = false;
  if (molCanvas.width  !== Math.round(newW * dpr)) { molCanvas.width  = Math.round(newW * dpr); changed = true; }
  if (molCanvas.height !== Math.round(newH * dpr)) { molCanvas.height = Math.round(newH * dpr); changed = true; }
  if (changed) molCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function fixAndRedraw(mode) {
  fixCanvasRowHeight(mode);
  const before = { w: molCanvas.width, h: molCanvas.height };
  resizeCanvas();
  if (molCanvas.width === before.w && molCanvas.height === before.h) redraw();
}

window.addEventListener('resize', () => {
  const mode = state.onglet === 'equilibrage' ? 'eq' : 'lim';
  if (state.animEq || state.animLim) {
    fixCanvasRowHeight(mode);
    resizeCanvasDuringAnim();
    state._needRelayoutAfterAnim = true;
    return;
  }
  requestAnimationFrame(() => {
    fixCanvasRowHeight(mode);
    resizeCanvas();
    relayoutLimAfterResize();
  });
});

function relayoutLimAfterResize() {
  const lf = state.lastFrameLim;
  if (!lf || !lf.layoutSrc || !lf.layoutDst) return;
  const scalesFixed = lf.layoutSrc.cols.map(c => c.sc);
  const newSrc = computeLayoutLimFixed(lf.qtesRInit, REACTIONS[state.reactionLimIdx].produits.map(()=>0), scalesFixed);
  const newDst = computeLayoutLimFixed(lf.qtesR, lf.qtesP, scalesFixed);
  if (newSrc && newDst) {
    lf.layoutSrc = newSrc;
    lf.layoutDst = newDst;
    redraw();
  }
}

if (typeof ResizeObserver !== 'undefined') {
  const wrap = document.getElementById('canvas-and-table');
  if (wrap) {
    let lastW = 0;
    const ro = new ResizeObserver(() => {
      if (state.animEq || state.animLim) {
        const mode = state.onglet === 'equilibrage' ? 'eq' : 'lim';
        fixCanvasRowHeight(mode);
        resizeCanvasDuringAnim();
        state._needRelayoutAfterAnim = true;
        return;
      }
      const w = wrap.clientWidth;
      if (w === lastW) return;
      lastW = w;
      resizeCanvas();
      relayoutLimAfterResize();
    });
    ro.observe(wrap);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   CACHE DE GÉOMÉTRIE
══════════════════════════════════════════════════════════════════════════ */
let _geomCache = null;

function invalidateGeomCache() { _geomCache = null; }

function _computeGeomCache() {
  const cr   = molCanvas.getBoundingClientRect();
  const ths  = Array.from(document.querySelectorAll('#thead-row th'));
  if (ths.length === 0) return null;

  const buildRects = (skipFirst) => {
    const rects = [];
    let chainedRight = null;
    ths.forEach((th, i) => {
      if (skipFirst && i === 0) return;
      const r = th.getBoundingClientRect();
      const realLeft  = r.left  - cr.left;
      const realRight = r.right - cr.left;
      const x0 = chainedRight !== null ? chainedRight : Math.round(realLeft);
      const x1 = Math.round(realRight);
      chainedRight = x1;
      rects.push({ x0, w: x1 - x0 });
    });
    return rects;
  };

  const colRects     = buildRects(false);
  const colRectsSkip = buildRects(true);

  const cell = document.getElementById('canvas-cell');
  let cellRect = null;
  if (cell) {
    const r = cell.getBoundingClientRect();
    cellRect = {
      x0: Math.round(r.left - cr.left),
      y0: Math.round(r.top  - cr.top),
      w:  Math.round(r.width),
      h:  Math.round(r.height),
    };
  }

  const tableEl = document.getElementById('reaction-table');
  const tableBottomY = tableEl ? Math.round(tableEl.getBoundingClientRect().bottom - cr.top)
                               : (cellRect ? cellRect.y0 + cellRect.h : null);

  const thSep = document.querySelector('#thead-row th.sep-rp');
  const sepX  = thSep ? Math.round(thSep.getBoundingClientRect().right - cr.left) : null;

  return {
    colRects, colRectsSkip, cellRect, tableBottomY, sepX,
    canvasW: molCanvas.clientWidth, canvasH: molCanvas.clientHeight,
  };
}

function _ensureGeomCache() {
  if (_geomCache && _geomCache.canvasW === molCanvas.clientWidth
                 && _geomCache.canvasH === molCanvas.clientHeight) return _geomCache;
  _geomCache = _computeGeomCache();
  return _geomCache;
}

function getColRects(skipFirst) {
  const g = _ensureGeomCache();
  if (!g) return [];
  return skipFirst ? g.colRectsSkip : g.colRects;
}

function getCanvasCellRect() {
  const g = _ensureGeomCache();
  return g ? g.cellRect : null;
}

function getTableBottomY() {
  const g = _ensureGeomCache();
  return g ? g.tableBottomY : null;
}

function getSepX() {
  const g = _ensureGeomCache();
  return g ? g.sepX : null;
}

/* ══════════════════════════════════════════════════════════════════════════
   LAYOUT TABLEAU + CANVAS
══════════════════════════════════════════════════════════════════════════ */
function fixCanvasRowHeight(mode) {
  const wrap  = document.getElementById('canvas-and-table');
  const cell  = document.getElementById('canvas-cell');
  const thead = document.getElementById('table-thead');
  const tfoot = document.getElementById('table-tfoot');
  if (!wrap || !cell) return;

  const _invalidateAfter = () => invalidateGeomCache();

  let tableTargetH = Math.round(window.innerHeight * 0.55);

  const theadH = thead ? thead.getBoundingClientRect().height : 0;
  const rowQtyEl = document.querySelector('#table-tbody tr.row-qty');
  const rowQtyH  = rowQtyEl ? rowQtyEl.getBoundingClientRect().height : 0;
  let tfootH = 0;
  if (tfoot && tfoot.style.display !== 'none') {
    tfootH = tfoot.getBoundingClientRect().height;
  }
  const fixedH = theadH + rowQtyH + tfootH;

  let MIN_CANVAS_CELL = Math.max(120, Math.round(window.innerHeight * 0.15));

  if (mode === 'lim') {
    const colRects = getColRects(true);
    const rxn = REACTIONS[state.reactionLimIdx];
    const counts = [
      state.qtesLimInit[0] !== undefined ? state.qtesLimInit[0] : 1,
      state.qtesLimInit[1] !== undefined ? state.qtesLimInit[1] : 0,
      rxn.produits[0] ? rxn.produits[0].coeff * Math.floor(Math.min(...rxn.reactifs.map((m,i)=>(state.qtesLimInit[i]??1)/m.coeff))) : 0,
      rxn.produits[1] ? rxn.produits[1].coeff * Math.floor(Math.min(...rxn.reactifs.map((m,i)=>(state.qtesLimInit[i]??1)/m.coeff))) : 0,
    ];
    const formulas = [
      rxn.reactifs[0] ? rxn.reactifs[0].formula : null,
      rxn.reactifs[1] ? rxn.reactifs[1].formula : null,
      rxn.produits[0]  ? rxn.produits[0].formula  : null,
      rxn.produits[1]  ? rxn.produits[1].formula  : null,
    ];
    const pad = 10;
    colRects.forEach((rect, i) => {
      const formula = formulas[i];
      const count   = counts[i] || 0;
      if (!formula || count <= 0 || rect.w <= 0) return;
      const r0 = getBoundingRadius(formula);
      const cell_size = r0 * MIN_MOL_SC * 2 + pad;
      const cols_n    = Math.max(1, Math.floor(rect.w / cell_size));
      const rows_n    = Math.ceil(count / cols_n);
      const needH     = rows_n * cell_size + pad * 2;
      if (needH > MIN_CANVAS_CELL) MIN_CANVAS_CELL = Math.ceil(needH);
    });
  }

  if (fixedH + MIN_CANVAS_CELL > tableTargetH) {
    tableTargetH = fixedH + MIN_CANVAS_CELL;
  }

  const canvasCellH = Math.max(MIN_CANVAS_CELL, tableTargetH - fixedH);
  cell.style.height = canvasCellH + 'px';

  let totalH;
  if (mode === 'lim') {
    totalH = tableTargetH + 18 + 20;
  } else {
    const estMidH = Math.round(window.innerHeight * FRAC_MID_H_EQ);
    totalH = tableTargetH + 18 + 30 + estMidH + 20;
  }
  wrap.style.height = totalH + 'px';
  _invalidateAfter();
}

/* ══════════════════════════════════════════════════════════════════════════
   CALCUL DU LAYOUT depuis le DOM
══════════════════════════════════════════════════════════════════════════ */
function computeLayoutFromDOM(rxn, coeffs4, skipFirst) {
  const W = molCanvas.clientWidth;
  const H = molCanvas.clientHeight;
  const colRects = getColRects(skipFirst);
  const cellRect = getCanvasCellRect();
  if (!cellRect || colRects.length < N_COLS) return null;
  if (cellRect.h < 10) return null;

  const colW  = colRects[0] ? colRects[0].w : W / N_COLS;
  const pad   = Math.max(3, Math.min(8, Math.round(colW * 0.05)));
  const cols = [];

  for (let i = 0; i < N_COLS; i++) {
    const isR = i < N_REACTIFS;
    const idx = isR ? i : i - N_REACTIFS;
    const isActive = isR ? idx < rxn.reactifs.length : idx < rxn.produits.length;
    const formula  = isActive ? (isR ? rxn.reactifs[idx].formula : rxn.produits[idx].formula) : null;
    const count    = isActive ? (coeffs4[i] || 0) : 0;
    const type     = isActive ? (isR ? 'reactif' : 'produit') : 'inactive';

    const rect = colRects[i];
    if (!rect) { cols.push({ type:'inactive', idx, formula:null, count:0, x0:0, y0:cellRect.y0, w:0, h:cellRect.h, sc:1, positions:[] }); continue; }

    const x0 = rect.x0;
    const y0 = cellRect.y0;
    const w  = rect.w;
    const h  = cellRect.h;

    let sc = 1, positions = [];
    if (formula) {
      const displayCount = count > 0 ? count : 1;
      sc = scaleFor(formula, displayCount, w - pad*2, h - pad*2, 10);
      if (count > 0)
        positions = gridPositions(formula, count, x0 + pad, y0 + pad, w - pad*2, h - pad*2, sc, 10);
    }
    cols.push({ type, idx, formula, count, x0, y0, w, h, sc, positions });
  }

  let midX, midY, midW, midH;
  if (!skipFirst) {
    midW = Math.round(W * FRAC_MID_W);
    midH = Math.round(H * FRAC_MID_H_EQ);
    midX = Math.round((W - midW) / 2);
    const tb = getTableBottomY();
    const tableBottomPx = (tb !== null && tb !== undefined) ? tb : (cellRect.y0 + cellRect.h);
    const gap = Math.max(20, Math.round(H * 0.02));
    midY = tableBottomPx + gap;
  }

  return { cols, W, H, midX, midY, midW, midH };
}

function computeLayout(rxn, coeffs4) {
  return computeLayoutFromDOM(rxn, coeffs4, false);
}

function computeLayoutLim(qtesR, qtesP) {
  const rxn = REACTIONS[state.reactionLimIdx];
  const coeffs4 = [
    qtesR[0] !== undefined ? qtesR[0] : 0,
    qtesR[1] !== undefined ? qtesR[1] : 0,
    qtesP[0] !== undefined ? qtesP[0] : 0,
    qtesP[1] !== undefined ? qtesP[1] : 0,
  ];
  return computeLayoutFromDOM(rxn, coeffs4, true);
}

function computeLayoutLimFixed(qtesR, qtesP, scalesFixed) {
  const rxn = REACTIONS[state.reactionLimIdx];
  const W = molCanvas.clientWidth;
  const H = molCanvas.clientHeight;
  const colRects = getColRects(true);
  const cellRect = getCanvasCellRect();
  if (!cellRect || colRects.length < N_COLS) return null;
  if (cellRect.h < 10) return null;

  const pad = Math.max(3, Math.min(8, Math.round((colRects[0]?.w || W/N_COLS) * 0.05)));
  const cols = [];

  const formulas = [
    rxn.reactifs[0]?.formula ?? null,
    rxn.reactifs[1]?.formula ?? null,
    rxn.produits[0]?.formula  ?? null,
    rxn.produits[1]?.formula  ?? null,
  ];
  const counts4 = [
    qtesR[0] ?? 0,
    qtesR[1] ?? 0,
    qtesP[0] ?? 0,
    qtesP[1] ?? 0,
  ];

  for (let i = 0; i < N_COLS; i++) {
    const isR = i < N_REACTIFS;
    const idx = isR ? i : i - N_REACTIFS;
    const isActive = isR ? idx < rxn.reactifs.length : idx < rxn.produits.length;
    const formula  = formulas[i];
    const count    = counts4[i];
    const type     = isActive ? (isR ? 'reactif' : 'produit') : 'inactive';

    const rect = colRects[i];
    if (!rect) { cols.push({ type:'inactive', idx, formula:null, count:0, x0:0, y0:cellRect.y0, w:0, h:cellRect.h, sc:1, positions:[] }); continue; }

    const x0 = rect.x0;
    const y0 = cellRect.y0;
    const w  = rect.w;
    const h  = cellRect.h;

    const sc = (scalesFixed && scalesFixed[i] !== undefined) ? scalesFixed[i] : 1;
    let positions = [];
    if (formula && count > 0) {
      positions = gridPositions(formula, count, x0 + pad, y0 + pad, w - pad*2, h - pad*2, sc, 10);
    }
    cols.push({ type, idx, formula, count, x0, y0, w, h, sc, positions });
  }

  return { cols, W, H };
}

/* ══════════════════════════════════════════════════════════════════════════
   RENDU CANVAS — fond colonnes + séparateurs + zone transition
══════════════════════════════════════════════════════════════════════════ */
function drawBackground(layout, skipTransition) {
  if (!layout) return;
  const ctx = molCtx;
  const { cols, W, H, midX, midY, midW, midH } = layout;

  cols.forEach(col => {
    if (col.w <= 0) return;
    ctx.fillStyle = col.type === 'reactif' ? COL_BG_REACTIF
                  : col.type === 'produit' ? COL_BG_PRODUIT
                  : COL_BG_INACTIVE;
    ctx.fillRect(col.x0, col.y0, col.w, col.h);
  });

  ctx.strokeStyle = '#d0c8be'; ctx.lineWidth = 1;
  for (let i = 1; i < N_COLS; i++) {
    if (i === N_REACTIFS) continue;
    const col = cols[i];
    if (!col || col.w <= 0) continue;
    ctx.beginPath();
    ctx.moveTo(col.x0, col.y0 + 2);
    ctx.lineTo(col.x0, col.y0 + col.h - 2);
    ctx.stroke();
  }

  const sepCol = cols[N_REACTIFS];
  if (sepCol && sepCol.w > 0) {
    const sx = getSepX();
    const sepX = (sx !== null && sx !== undefined) ? sx : sepCol.x0;
    ctx.strokeStyle = '#b0a898'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sepX, sepCol.y0 + 2);
    ctx.lineTo(sepX, sepCol.y0 + sepCol.h - 2);
    ctx.stroke();
  }

  if (!skipTransition && midX !== undefined && midY !== undefined && midW > 0 && midH > 0) {
    ctx.save();
    ctx.shadowColor = 'rgba(44,40,32,0.12)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    ctx.fillStyle = COL_BG_MID;
    roundRect(ctx, midX, midY, midW, midH, 10);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = COL_BORDER_MID; ctx.lineWidth = 2;
    ctx.save(); roundRect(ctx, midX, midY, midW, midH, 10); ctx.stroke(); ctx.restore();

    ctx.fillStyle = '#9a8a7a';
    ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('Zone de transition', midX + 10, midY + 6);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y);
  ctx.arcTo(x+w, y,   x+w, y+r,   r);
  ctx.lineTo(x+w, y+h-r);
  ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h);
  ctx.arcTo(x, y+h,   x, y+h-r,   r);
  ctx.lineTo(x, y+r);
  ctx.arcTo(x, y,     x+r, y,      r);
  ctx.closePath();
}

/* ── Rendu molécule ── */
function drawMolecule(ctx, formula, cx, cy, sc, alpha) {
  const m = MOL_MODELS[formula]; if (!m) return;
  ctx.save(); ctx.globalAlpha = alpha ?? 1; ctx.translate(cx, cy);
  m.bonds.forEach(b => drawBondLine(ctx, b, sc));
  m.atoms.forEach(a => {
    const r = (a.el === 'H' ? m.radius * 0.65 : m.radius) * sc;
    ctx.beginPath(); ctx.arc(a.x*sc, a.y*sc, r, 0, Math.PI*2);
    ctx.fillStyle = ATOM_COLORS[a.el] || '#aaa'; ctx.fill();
    ctx.strokeStyle = ATOM_BORDER[a.el] || '#555';
    ctx.lineWidth = Math.max(1, 1.5*sc); ctx.stroke();
    ctx.fillStyle = a.el === 'H' ? '#444' : '#fff';
    ctx.font = `bold ${Math.max(7, Math.round(10*sc))}px 'Segoe UI', Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(a.el, a.x*sc, a.y*sc);
  });
  ctx.restore();
}

function drawBondLine(ctx, b, sc) {
  const x1=b.a.x*sc, y1=b.a.y*sc, x2=b.b.x*sc, y2=b.b.y*sc;
  const lw = Math.max(1, 1.8*sc);
  ctx.strokeStyle='#555'; ctx.lineWidth=lw;
  if (b.triple) {
    const dx=x2-x1, dy=y2-y1, len=Math.sqrt(dx*dx+dy*dy)||1, off=5*sc;
    const px=-dy/len*off, py=dx/len*off;
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1+px,y1+py); ctx.lineTo(x2+px,y2+py); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1-px,y1-py); ctx.lineTo(x2-px,y2-py); ctx.stroke();
  } else if (b.double) {
    const dx=x2-x1, dy=y2-y1, len=Math.sqrt(dx*dx+dy*dy)||1, off=3;
    const px=-dy/len*off, py=dx/len*off;
    ctx.beginPath(); ctx.moveTo(x1+px,y1+py); ctx.lineTo(x2+px,y2+py); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1-px,y1-py); ctx.lineTo(x2-px,y2-py); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  }
}

function drawBonds(ctx, formula, cx, cy, sc, alpha) {
  const m = MOL_MODELS[formula]; if (!m || alpha<=0) return;
  ctx.save(); ctx.globalAlpha=alpha; ctx.translate(cx,cy);
  m.bonds.forEach(b => drawBondLine(ctx, b, sc));
  ctx.restore();
}

function drawAtom(ctx, el, x, y, r, alpha) {
  ctx.save(); ctx.globalAlpha=alpha??1;
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fillStyle=ATOM_COLORS[el]||'#aaa'; ctx.fill();
  ctx.strokeStyle=ATOM_BORDER[el]||'#555'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle=el==='H'?'#444':'#fff';
  ctx.font=`bold ${Math.max(7,Math.round(r*0.78))}px 'Segoe UI', Arial, sans-serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(el,x,y); ctx.restore();
}

/* ══════════════════════════════════════════════════════════════════════════
   GÉOMÉTRIE MOLÉCULES
══════════════════════════════════════════════════════════════════════════ */
function getBoundingRadius(formula) {
  const m = MOL_MODELS[formula]; if (!m) return 20;
  let r = m.radius;
  m.atoms.forEach(a => { r = Math.max(r, Math.sqrt(a.x*a.x+a.y*a.y)+m.radius); });
  return r;
}

function scaleFor(formula, count, w, h, pad) {
  pad = pad || 12;
  const r0 = getBoundingRadius(formula);
  for (let sc = 2.5; sc >= 0.08; sc -= 0.04) {
    const r    = r0 * sc;
    const cell = r * 2 + pad;
    if (cell > w) continue;
    const cols = Math.max(1, Math.floor(w / cell));
    if (Math.ceil(count / cols) * cell <= h) return sc;
  }
  let scMax = (w - pad) / (2 * r0);
  if (scMax <= 0) scMax = 0.05;
  const scH1 = (h / count - pad) / (2 * r0);
  const sc = Math.min(scMax, Math.max(0.05, scH1));
  return Math.max(0.05, sc);
}

function scaleForMulti(items, w, h, pad) {
  pad = pad || 12;
  const total = items.reduce((s, m) => s + m.count, 0);
  if (total === 0) return 1;
  const maxR0 = Math.max(...items.map(m => getBoundingRadius(m.formula)));
  for (let sc = 2.5; sc >= 0.08; sc -= 0.04) {
    const cell = maxR0 * sc * 2 + pad;
    if (cell > w) continue;
    const cols = Math.max(1, Math.floor(w / cell));
    if (Math.ceil(total / cols) * cell <= h) return sc;
  }
  const scW = (w - pad) / (2 * maxR0);
  const scH = (h - pad) / (2 * maxR0);
  return Math.max(0.05, Math.min(scW, scH));
}

function gridPositions(formula, count, x0, y0, w, h, sc, pad) {
  pad=pad||12;
  if (count<=0) return [];
  const r=getBoundingRadius(formula)*sc;
  let cell = r*2 + pad;
  if (cell > w) cell = Math.max(1, w);
  const cols=Math.max(1,Math.floor(w/cell)), rows=Math.ceil(count/cols);
  const gw=Math.min(cols,count)*cell, gh=rows*cell;
  const ox=x0+(w-gw)/2+cell/2;
  const oy=Math.max(y0+cell/2, y0+(h-gh)/2+cell/2);
  const pos=[];
  for (let k=0; k<count; k++)
    pos.push({ cx:ox+(k%cols)*cell, cy:oy+Math.floor(k/cols)*cell });
  return pos;
}

/* ══════════════════════════════════════════════════════════════════════════
   DESSIN STATIQUE
══════════════════════════════════════════════════════════════════════════ */
function drawStatic() {
  const W=molCanvas.clientWidth, H=molCanvas.clientHeight;
  molCtx.clearRect(0,0,W,H);

  if (state.onglet==='equilibrage') {
    if (state.lastFrameEq) { drawLastFrameEq(state.lastFrameEq); return; }
    const rxn=REACTIONS[state.reactionEqIdx];
    const coeffsR=[getCoeffEq(0), rxn.reactifs.length>1?getCoeffEq(1):0];
    const coeffsP4=state.showProductsEq
      ? [rxn.produits[0]?getCoeffEq(rxn.reactifs.length):0, rxn.produits[1]?getCoeffEq(rxn.reactifs.length+1):0]
      : [0, 0];
    const coeffs4=[coeffsR[0]||0, coeffsR[1]||0, coeffsP4[0], coeffsP4[1]];
    const layout=computeLayout(rxn, coeffs4);
    if (!layout) return;
    drawBackground(layout);
    layout.cols.filter(c=>c.type==='reactif').forEach(col=>
      col.positions.forEach(p=>drawMolecule(molCtx,col.formula,p.cx,p.cy,col.sc,1))
    );
    if (state.showProductsEq) {
      layout.cols.filter(c=>c.type==='produit').forEach(col=>
        col.positions.forEach(p=>drawMolecule(molCtx,col.formula,p.cx,p.cy,col.sc,0.55))
      );
    }
  } else {
    if (state.lastFrameLim) {
      const f=state.lastFrameLim;
      const layoutSrc = f.layoutSrc;
      const layoutDst = f.layoutDst;
      if (layoutSrc && layoutDst) {
        drawBackground(layoutSrc, true);
        layoutSrc.cols.forEach(col => {
          if (col.type !== 'reactif') return;
          col.positions.forEach((p, k) => {
            if (f.qtesRInit && k >= f.qtesRInit[col.idx]) return;
            if (k >= f.qtesR[col.idx]) return;
            const alpha = f.reactifsOpaques
              ? (f.reactifsOpaques.has(`${col.idx}_${k}`) ? 1 : 0.25)
              : 1;
            drawMolecule(molCtx, col.formula, p.cx, p.cy, col.sc, alpha);
          });
        });
        layoutDst.cols.forEach(col => {
          if (col.type !== 'produit') return;
          const nDraw = f.qtesP[col.idx] ?? 0;
          col.positions.slice(0, nDraw).forEach(p =>
            drawMolecule(molCtx, col.formula, p.cx, p.cy, col.sc, 1)
          );
        });
      }
      updateTableFoot(f.avancement,f.qtesR,f.qtesP,f.xmax);
      return;
    }
    const layout=computeLayoutLim(state.qtesR.slice(),state.qtesP.slice());
    if (!layout) return;
    drawBackground(layout, true);
    layout.cols.forEach(col=>col.positions.forEach(p=>drawMolecule(molCtx,col.formula,p.cx,p.cy,col.sc,1)));
    updateTableFoot(state.avancement,state.qtesR.slice(),state.qtesP.slice(),state.xmax);
  }
}

function drawLastFrameEq(frame) {
  const rxn = REACTIONS[state.reactionEqIdx];
  const layout = computeLayout(rxn, [
    frame.coeffsR[0]||0, frame.coeffsR[1]||0,
    frame.countsPossible[0]||0, frame.countsPossible[1]||0
  ]);
  if (!layout) return;
  drawBackground(layout);

  const layoutGhost = frame.ghostCounts && frame.ghostCounts.some(v=>v>0)
    ? computeLayout(rxn, [frame.coeffsR[0]||0, frame.coeffsR[1]||0, frame.ghostCounts[0]||0, frame.ghostCounts[1]||0])
    : null;

  if (layoutGhost) {
    layoutGhost.cols.filter(c=>c.type==='produit').forEach(col=>{
      const total = frame.ghostCounts[col.idx] ?? 0;
      for(let k=0;k<total;k++){const p=col.positions[k];if(!p)continue;drawMolecule(molCtx,col.formula,p.cx,p.cy,col.sc,0.35);}
    });
    layoutGhost.cols.filter(c=>c.type==='produit').forEach(col=>{
      const count = frame.doneCount[col.idx] ?? 0;
      for(let k=0;k<count;k++){const p=col.positions[k];if(!p)continue;drawMolecule(molCtx,col.formula,p.cx,p.cy,col.sc,1);}
    });
  } else {
    layout.cols.filter(c=>c.type==='produit').forEach(col=>{
      const count = frame.doneCount[col.idx] ?? col.positions.length;
      for(let k=0;k<count;k++){const p=col.positions[k];if(!p)continue;drawMolecule(molCtx,col.formula,p.cx,p.cy,col.sc,1);}
    });
  }

  if (frame.orphans && frame.orphans.length > 0) {
    const sx = molCanvas.clientWidth  / frame.canvasW;
    const sy = molCanvas.clientHeight / frame.canvasH;
    frame.orphans.forEach(a => drawAtom(molCtx, a.el, (a.ex??a.tx)*sx, (a.ey??a.ty)*sy, a.r, 1));
  }
}

function redraw(retryCount) {
  if(state.animEq||state.animLim) return;
  const cell = getCanvasCellRect();
  if(!cell || cell.h < 10) {
    const n = (retryCount|0) + 1;
    if (n > 10) return;
    requestAnimationFrame(() => redraw(n));
    return;
  }
  drawStatic();
}

/* ══════════════════════════════════════════════════════════════════════════
   CALCUL DES SCALES FIXES (mode limitant)
══════════════════════════════════════════════════════════════════════════ */
function calcScalesFixed(rxn, qtesRInit, nMax) {
  const colRects = getColRects(true);
  const cellRect = getCanvasCellRect();
  if (!cellRect || colRects.length < N_COLS) return [1,1,1,1];

  const pad = Math.max(3, Math.min(8, Math.round((colRects[0]?.w || 100) * 0.05)));
  const maxCounts = [
    qtesRInit[0] ?? 0,
    qtesRInit[1] ?? 0,
    rxn.produits[0] ? rxn.produits[0].coeff * nMax : 0,
    rxn.produits[1] ? rxn.produits[1].coeff * nMax : 0,
  ];
  const formulas = [
    rxn.reactifs[0]?.formula ?? null,
    rxn.reactifs[1]?.formula ?? null,
    rxn.produits[0]?.formula  ?? null,
    rxn.produits[1]?.formula  ?? null,
  ];

  return colRects.map((rect, i) => {
    const formula = formulas[i];
    const count   = maxCounts[i] || 0;
    if (!formula || count <= 0 || rect.w <= 0) return 1;
    const w = rect.w - pad * 2;
    const h = cellRect.h - pad * 2;
    const sc = scaleFor(formula, count, w, h, 10);
    return Math.max(MIN_MOL_SC, sc);
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   UTILITAIRES
══════════════════════════════════════════════════════════════════════════ */
function lerp(a,b,t){return a+(b-a)*t;}
function easeInOut(t){return t<0.5?2*t*t:-1+(4-2*t)*t;}
