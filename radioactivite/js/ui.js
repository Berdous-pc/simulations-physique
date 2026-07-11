'use strict';

// ═══════════════════════════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════════════════════════

/* ═══════════════════════════════════════════════════
   ui.js — Initialisation, contrôles, interactions
   ─────────────────────────────────────────────────
   Dépend de : sim.js, draw.js (chargés avant)
   Expose (appelés depuis HTML) :
     lancerTous, lancerGris, razLibre,
     simulerEtRemplacer, simulerEtAjouter,
     supprimerSerie, toggleIndiv, masquerSerie, razAuto,
     adapterEchelleAuto, autoscale,
     toggleZoomAuto, prevViewAuto, toggleReticuleAuto,
     toggleTangenteAuto,
     continuerEtRemplacer, continuerEtAjouter, pauseContinu,
     razContinu, autoscaleContinu, adapterEchelleContinu,
     masquerSerieContinu, supprimerSerieContinu,
     setContinuGraphMode,
     toggleZoomContinu, prevViewContinu,
     toggleReticuleContinu, toggleTangenteContinu,
     expandRecipient, collapseRecipient,
     setMode, setModePrincipal, toggleHint,
     onNdiceChange, onNdiceChangeAuto, onNsimChange,
     onPipChange, onPipAutoChange,
     onLambdaInput, onLambdaBlur, onNoyauSelect,
     onMolesChange, onNthalfChange, onSpeedContinuChange
════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════
   ÉTAT RÉCIPIENT (partagé avec draw.js)
══════════════════════════════════════════════════ */

let recipientExpanded = false;

/* ══════════════════════════════════════════════════
   INITIALISATION
══════════════════════════════════════════════════ */

function initDice() {
  state.dice = [];
  for (let i = 0; i < state.nDiceLibre; i++) state.dice.push({ face: 1, active: true });
  state.lancerNum = 0;
  state.tableRows = [];
}

function init() {
  initCanvases();
  resizeCanvases();
  initDice();
  initGraphHoverDiscret();
  initGraphHoverContinu();
  initSplitter();
  updateReadouts();
  renderTable();
  setMode('libre');
  updateContinuReadouts();
  document.getElementById('hint-lambda').textContent = 'entre 10⁻¹⁹ et 10⁴ s⁻¹';
  document.getElementById('hint-lambda').style.color = '#7a8a96';
  drawGraphContinu();
  drawRecipient();

  // ── Deep link depuis la page d'accueil (?tab=discret|continu) ──────────
  const _tab = new URLSearchParams(location.search).get('tab');
  if (_tab === 'continu') setModePrincipal('continu');
  else if (_tab === 'discret') setModePrincipal('discret');
}

window.addEventListener('load', init);
window.addEventListener('resize', () => {
  resizeCanvases();
  drawDice(); drawGraphLibre(); drawGraphAuto(); drawGraphContinu(); drawRecipient();
});
document.addEventListener('fullscreenchange',        () => { resizeCanvases(); drawDice(); drawGraphLibre(); drawGraphAuto(); drawGraphContinu(); drawRecipient(); });
document.addEventListener('webkitfullscreenchange',  () => { resizeCanvases(); drawDice(); drawGraphLibre(); drawGraphAuto(); drawGraphContinu(); drawRecipient(); });

/* ══════════════════════════════════════════════════
   SPLITTER VERTICAL (#left-col)
══════════════════════════════════════════════════ */

function initSplitter() {
  const splitter = document.getElementById('left-splitter');
  const topEl    = document.getElementById('left-top');
  const botEl    = document.getElementById('left-bottom');
  const leftCol  = document.getElementById('left-col');
  if (!splitter || !topEl || !botEl || !leftCol) return;

  const minH = 60;
  let startY = 0, startTopH = 0, ratio = null;

  function redraw() {
    resizeCanvases();
    drawDice(); drawGraphLibre(); drawGraphAuto(); drawGraphContinu(); drawRecipient();
  }

  function applyRatio(r) {
    const colH  = leftCol.getBoundingClientRect().height;
    const splH  = splitter.getBoundingClientRect().height;
    const avail = colH - splH;
    const newTop = Math.max(minH, Math.min(avail - minH, Math.round(r * avail)));
    const newBot = avail - newTop;
    topEl.style.flex = '0 0 ' + newTop + 'px';
    botEl.style.flex = '0 0 ' + newBot + 'px';
    redraw();
  }

  splitter.addEventListener('mousedown', e => {
    e.preventDefault();
    startY    = e.clientY;
    startTopH = topEl.getBoundingClientRect().height;
    splitter.classList.add('dragging');
    document.body.style.cursor = 'row-resize';

    const onMove = ev => {
      const dy     = ev.clientY - startY;
      const colH   = leftCol.getBoundingClientRect().height;
      const splH   = splitter.getBoundingClientRect().height;
      const avail  = colH - splH;
      const newTop = Math.max(minH, Math.min(avail - minH, startTopH + dy));
      const newBot = avail - newTop;
      ratio = newTop / avail;
      topEl.style.flex = '0 0 ' + newTop + 'px';
      botEl.style.flex = '0 0 ' + newBot + 'px';
      redraw();
    };

    const onUp = () => {
      splitter.classList.remove('dragging');
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });

  window.addEventListener('resize', () => { if (ratio !== null) applyRatio(ratio); });
}

/* ══════════════════════════════════════════════════
   HOVER — MODE DISCRET
══════════════════════════════════════════════════ */

function initGraphHoverDiscret() {
  /* Graphe libre */
  graphCanvas.addEventListener('mousemove', e => {
    const r = graphCanvas.getBoundingClientRect();
    graphHoverLibre = {
      x: (e.clientX - r.left) * (graphCanvas.clientWidth  / r.width),
      y: (e.clientY - r.top)  * (graphCanvas.clientHeight / r.height),
    };
    drawGraphLibre();
  });
  graphCanvas.addEventListener('mouseleave', () => { graphHoverLibre = null; drawGraphLibre(); });

  /* Graphe auto */
  autoGraphCanvas.addEventListener('mousemove', e => {
    const r = autoGraphCanvas.getBoundingClientRect();
    graphHoverAuto = {
      x: (e.clientX - r.left) * (autoGraphCanvas.clientWidth  / r.width),
      y: (e.clientY - r.top)  * (autoGraphCanvas.clientHeight / r.height),
    };
    const prevHover = hoverCrossIdxAuto;
    hoverCrossIdxAuto = -1;
    for (let i = 0; i < tangenteCrossZonesAuto.length; i++) {
      const cz = tangenteCrossZonesAuto[i];
      if (Math.hypot(graphHoverAuto.x - cz.x, graphHoverAuto.y - cz.y) < cz.r) {
        hoverCrossIdxAuto = i; break;
      }
    }
    autoGraphCanvas.style.cursor = hoverCrossIdxAuto >= 0 ? 'pointer' : (autoPan.dragging ? 'grabbing' : 'crosshair');
    if (!state.zoomModeAuto && autoPan.dragging && autoPan.startView) {
      const v  = autoPan.startView;
      const ax = getAxDims(autoGraphCanvas.clientWidth, autoGraphCanvas.clientHeight);
      const dx = (graphHoverAuto.x - autoPan.startX) / ax.gW * (v.xMax - v.xMin);
      const dy = (graphHoverAuto.y - autoPan.startY) / ax.gH * (v.yMax - v.yMin);
      state.view = { xMin: v.xMin - dx, xMax: v.xMax - dx, yMin: v.yMin + dy, yMax: v.yMax + dy };
    }
    if (state.zoomModeAuto && state.zoomRectAuto) {
      state.zoomRectAuto.x1 = graphHoverAuto.x;
      state.zoomRectAuto.y1 = graphHoverAuto.y;
    }
    drawGraphAuto();
  });
  autoGraphCanvas.addEventListener('mouseleave', () => {
    graphHoverAuto = null; autoPan.dragging = false; hoverCrossIdxAuto = -1;
    if (state.zoomRectAuto) state.zoomRectAuto = null;
    document.getElementById('reticule-tooltip-auto').style.display = 'none';
    drawGraphAuto();
  });
  autoGraphCanvas.addEventListener('mousedown', e => {
    if (state.zoomModeAuto) {
      const r  = autoGraphCanvas.getBoundingClientRect();
      const cx = (e.clientX - r.left) * (autoGraphCanvas.clientWidth  / r.width);
      const cy = (e.clientY - r.top)  * (autoGraphCanvas.clientHeight / r.height);
      state.zoomRectAuto = { x0: cx, y0: cy, x1: cx, y1: cy };
      e.preventDefault();
    } else {
      if (state.series.length === 0) return;
      autoPan.dragging  = true;
      autoPan.startX    = graphHoverAuto ? graphHoverAuto.x : 0;
      autoPan.startY    = graphHoverAuto ? graphHoverAuto.y : 0;
      autoPan.startView = state.view ? { ...state.view } : computeFullView();
      if (!state.view) state.view = { ...autoPan.startView };
      e.preventDefault();
    }
  });
  autoGraphCanvas.addEventListener('mouseup', e => {
    if (state.zoomModeAuto && state.zoomRectAuto) {
      const ax   = getAxDims(autoGraphCanvas.clientWidth, autoGraphCanvas.clientHeight);
      const view = state.view || computeFullView();
      const { ml, mt, gW, gH } = ax;
      const rx0 = Math.min(state.zoomRectAuto.x0, state.zoomRectAuto.x1);
      const rx1 = Math.max(state.zoomRectAuto.x0, state.zoomRectAuto.x1);
      const ry0 = Math.min(state.zoomRectAuto.y0, state.zoomRectAuto.y1);
      const ry1 = Math.max(state.zoomRectAuto.y0, state.zoomRectAuto.y1);
      if (rx1 - rx0 > 5 && ry1 - ry0 > 5) {
        const newXmin = view.xMin + (rx0 - ml) / gW * (view.xMax - view.xMin);
        const newXmax = view.xMin + (rx1 - ml) / gW * (view.xMax - view.xMin);
        const newYmax = view.yMin + (1 - (ry0 - mt) / gH) * (view.yMax - view.yMin);
        const newYmin = view.yMin + (1 - (ry1 - mt) / gH) * (view.yMax - view.yMin);
        state.viewHistoryAuto.push(state.view || computeFullView());
        document.getElementById('btn-prev-auto').disabled = false;
        state.view = { xMin: newXmin, xMax: newXmax,
                       yMin: Math.max(0, newYmin), yMax: Math.max(newYmax, newYmin + 1) };
      }
      state.zoomRectAuto = null;
      drawGraphAuto();
    } else {
      autoPan.dragging = false;
    }
  });
  autoGraphCanvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (state.zoomModeAuto || state.series.length === 0 || !graphHoverAuto) return;
    const ax    = getAxDims(autoGraphCanvas.clientWidth, autoGraphCanvas.clientHeight);
    const view  = state.view || computeFullView();
    const mx = view.xMin + (graphHoverAuto.x - ax.ml) / ax.gW * (view.xMax - view.xMin);
    const my = view.yMin + (1 - (graphHoverAuto.y - ax.mt) / ax.gH) * (view.yMax - view.yMin);
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    state.view = {
      xMin: mx + (view.xMin - mx) * factor, xMax: mx + (view.xMax - mx) * factor,
      yMin: my + (view.yMin - my) * factor, yMax: my + (view.yMax - my) * factor,
    };
    drawGraphAuto();
  }, { passive: false });

  autoGraphCanvas.addEventListener('click', e => {
    const r2 = autoGraphCanvas.getBoundingClientRect();
    const cx = (e.clientX - r2.left) * (autoGraphCanvas.clientWidth  / r2.width);
    const cy = (e.clientY - r2.top)  * (autoGraphCanvas.clientHeight / r2.height);
    for (const cz of tangenteCrossZonesAuto) {
      if (Math.hypot(cx - cz.x, cy - cz.y) < cz.r) {
        state.tangentesFigAuto.splice(cz.idx, 1);
        hoverCrossIdxAuto = -1;
        drawGraphAuto();
        return;
      }
    }
    if (!state.tangenteAuto || state.series.length === 0 || !graphHoverAuto) return;
    const v  = state.view || computeFullView();
    const ax = getAxDims(autoGraphCanvas.clientWidth, autoGraphCanvas.clientHeight);
    const { ml, mt, gW, gH } = ax;
    const toX = i  => ml + (i  - v.xMin) / (v.xMax - v.xMin) * gW;
    const toY = vv => mt + gH - (vv - v.yMin) / (v.yMax - v.yMin) * gH;
    const hx = graphHoverAuto.x, hy = graphHoverAuto.y;
    if (hx < ml || hx > ml + gW || hy < mt || hy > mt + gH) return;
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
      state.tangentesFigAuto.push({ i0, slope, serie: bestSerie });
      drawGraphAuto();
    }
  });
}

/* ══════════════════════════════════════════════════
   HOVER — MODE CONTINU
══════════════════════════════════════════════════ */

function initGraphHoverContinu() {
  continugraphCanvas.addEventListener('mousemove', e => {
    const r = continugraphCanvas.getBoundingClientRect();
    graphHoverContinu = {
      x: (e.clientX - r.left) * (continugraphCanvas.clientWidth  / r.width),
      y: (e.clientY - r.top)  * (continugraphCanvas.clientHeight / r.height),
    };
    hoverCrossIdxContinu = -1;
    for (let i = 0; i < tangenteCrossZonesContinu.length; i++) {
      const cz = tangenteCrossZonesContinu[i];
      if (Math.hypot(graphHoverContinu.x - cz.x, graphHoverContinu.y - cz.y) < cz.r) {
        hoverCrossIdxContinu = i; break;
      }
    }
    continugraphCanvas.style.cursor = hoverCrossIdxContinu >= 0 ? 'pointer' : (continupan.dragging ? 'grabbing' : 'crosshair');
    if (!state.zoomModeContinu && continupan.dragging && continupan.startView) {
      const v  = continupan.startView;
      const ax = getAxDims(continugraphCanvas.clientWidth, continugraphCanvas.clientHeight);
      const dx = (graphHoverContinu.x - continupan.startX) / ax.gW * (v.xMax - v.xMin);
      const dy = (graphHoverContinu.y - continupan.startY) / ax.gH * (v.yMax - v.yMin);
      state.viewContinu = { xMin: v.xMin - dx, xMax: v.xMax - dx, yMin: v.yMin + dy, yMax: v.yMax + dy };
    }
    if (state.zoomModeContinu && state.zoomRect) {
      state.zoomRect.x1 = graphHoverContinu.x;
      state.zoomRect.y1 = graphHoverContinu.y;
    }
    drawGraphContinu();
  });
  continugraphCanvas.addEventListener('mouseleave', () => {
    graphHoverContinu = null; continupan.dragging = false; hoverCrossIdxContinu = -1;
    if (state.zoomRect) state.zoomRect = null;
    document.getElementById('reticule-tooltip').style.display = 'none';
    drawGraphContinu();
  });
  continugraphCanvas.addEventListener('mousedown', e => {
    const allSeries = getAllContinuSeries();
    if (state.zoomModeContinu) {
      const r  = continugraphCanvas.getBoundingClientRect();
      const cx = (e.clientX - r.left) * (continugraphCanvas.clientWidth  / r.width);
      const cy = (e.clientY - r.top)  * (continugraphCanvas.clientHeight / r.height);
      state.zoomRect = { x0: cx, y0: cy, x1: cx, y1: cy };
      e.preventDefault();
    } else {
      if (allSeries.length === 0) return;
      continupan.dragging  = true;
      continupan.startX    = graphHoverContinu ? graphHoverContinu.x : 0;
      continupan.startY    = graphHoverContinu ? graphHoverContinu.y : 0;
      continupan.startView = state.viewContinu ? { ...state.viewContinu } : computeFullViewContinu();
      if (!state.viewContinu) state.viewContinu = { ...continupan.startView };
      e.preventDefault();
    }
  });
  continugraphCanvas.addEventListener('mouseup', e => {
    if (state.zoomModeContinu && state.zoomRect) {
      const ax   = getAxDims(continugraphCanvas.clientWidth, continugraphCanvas.clientHeight);
      const view = state.viewContinu || computeFullViewContinu();
      const { factor: tFactor } = pickTimeUnit(view.xMax);
      const xMinU = view.xMin / tFactor, xMaxU = view.xMax / tFactor;
      const { ml, mt, gW, gH } = ax;
      const rx0 = Math.min(state.zoomRect.x0, state.zoomRect.x1);
      const rx1 = Math.max(state.zoomRect.x0, state.zoomRect.x1);
      const ry0 = Math.min(state.zoomRect.y0, state.zoomRect.y1);
      const ry1 = Math.max(state.zoomRect.y0, state.zoomRect.y1);
      if (rx1 - rx0 > 5 && ry1 - ry0 > 5) {
        const newXminU = xMinU + (rx0 - ml) / gW * (xMaxU - xMinU);
        const newXmaxU = xMinU + (rx1 - ml) / gW * (xMaxU - xMinU);
        const newYmax  = view.yMin + (1 - (ry0 - mt) / gH) * (view.yMax - view.yMin);
        const newYmin  = view.yMin + (1 - (ry1 - mt) / gH) * (view.yMax - view.yMin);
        state.viewHistoryContinu.push(state.viewContinu || computeFullViewContinu());
        document.getElementById('btn-prev-continu').disabled = false;
        state.viewContinu = {
          xMin: newXminU * tFactor, xMax: newXmaxU * tFactor,
          yMin: Math.max(0, newYmin), yMax: Math.max(newYmax, newYmin + 1),
        };
      }
      state.zoomRect = null;
      drawGraphContinu();
    } else {
      continupan.dragging = false;
    }
  });
  continugraphCanvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (state.zoomModeContinu) return;
    const allSeries = getAllContinuSeries();
    if (allSeries.length === 0 || !graphHoverContinu) return;
    const ax   = getAxDims(continugraphCanvas.clientWidth, continugraphCanvas.clientHeight);
    const view = state.viewContinu || computeFullViewContinu();
    const { factor: tFactor } = pickTimeUnit(view.xMax);
    const xMinU = view.xMin / tFactor, xMaxU = view.xMax / tFactor;
    const { ml, mt, gW, gH } = ax;
    const mx = (xMinU + (graphHoverContinu.x - ml) / gW * (xMaxU - xMinU)) * tFactor;
    const my = view.yMin + (1 - (graphHoverContinu.y - mt) / gH) * (view.yMax - view.yMin);
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    state.viewContinu = {
      xMin: mx + (view.xMin - mx) * factor, xMax: mx + (view.xMax - mx) * factor,
      yMin: my + (view.yMin - my) * factor, yMax: my + (view.yMax - my) * factor,
    };
    drawGraphContinu();
  }, { passive: false });

  continugraphCanvas.addEventListener('click', e => {
    const r2 = continugraphCanvas.getBoundingClientRect();
    const cx = (e.clientX - r2.left) * (continugraphCanvas.clientWidth  / r2.width);
    const cy = (e.clientY - r2.top)  * (continugraphCanvas.clientHeight / r2.height);
    for (const cz of tangenteCrossZonesContinu) {
      if (Math.hypot(cx - cz.x, cy - cz.y) < cz.r) {
        state.tangentesFigContinu.splice(cz.idx, 1);
        hoverCrossIdxContinu = -1;
        drawGraphContinu();
        return;
      }
    }
    if (!state.tangenteContinu) return;
    const allSeries = getAllContinuSeries();
    if (allSeries.length === 0 || !graphHoverContinu) return;
    const view = state.viewContinu || computeFullViewContinu();
    const { factor: tFactor } = pickTimeUnit(view.xMax);
    const xMinU = view.xMin / tFactor, xMaxU = view.xMax / tFactor;
    const W  = continugraphCanvas.clientWidth, H = continugraphCanvas.clientHeight;
    const ax = getAxDims(W, H);
    const { ml, mt, gW, gH } = ax;
    let yFactor = 1e23;
    if (state.graphModeContinu === 'A') {
      let aMax = 0;
      for (const s of allSeries) { if (!s.hidden && s.pts.length > 0) aMax = Math.max(aMax, s.pts[0].v); }
      if (aMax === 0) aMax = 1;
      yFactor = Math.pow(10, Math.floor(Math.log10(aMax)));
    }
    const yMinU2 = view.yMin / yFactor, yMaxU2 = view.yMax / yFactor;
    const toX2 = t  => ml + (t  / tFactor - xMinU) / (xMaxU - xMinU) * gW;
    const toY2 = vv => mt + gH - (vv / yFactor - yMinU2) / (yMaxU2 - yMinU2) * gH;
    const hx = graphHoverContinu.x, hy = graphHoverContinu.y;
    if (hx < ml || hx > ml + gW || hy < mt || hy > mt + gH) return;
    let bestSerie = null, bestPt = null, bestIdx = 0, bestDist = Infinity;
    for (const s of allSeries) {
      if (s.hidden) continue;
      for (let i = 0; i < s.pts.length; i++) {
        const p = s.pts[i];
        const d = Math.hypot(toX2(p.t) - hx, toY2(p.v) - hy);
        if (d < bestDist) { bestDist = d; bestSerie = s; bestPt = p; bestIdx = i; }
      }
    }
    if (bestSerie && bestPt && bestDist < 50) {
      const pts = bestSerie.pts, i0 = bestIdx;
      const iPrev = Math.max(0, i0 - 1), iNext = Math.min(pts.length - 1, i0 + 1);
      const dt = pts[iNext].t - pts[iPrev].t;
      const slope = dt !== 0 ? (pts[iNext].v - pts[iPrev].v) / dt : 0;
      state.tangentesFigContinu.push({ t0: bestPt.t, v0: bestPt.v, slope, serie: bestSerie });
      drawGraphContinu();
    }
  });
}

/* ══════════════════════════════════════════════════
   ACTIONS MODE LIBRE DISCRET
══════════════════════════════════════════════════ */

function razLibre() {
  initDice();
  updateReadouts();
  renderTable();
  drawDice();
  drawGraphLibre();
  document.getElementById('btn-lancer-gris').disabled = false;
}

function lancerTous() {
  const counts = [0, 0, 0, 0, 0, 0];
  let grises = 0;
  for (const d of state.dice) {
    d.face = rollOneDie(state.pipIndexLibre);
    if (d.face === 6) { d.active = false; }
    else              { d.active = true; grises++; }
    counts[d.face - 1]++;
  }
  state.lancerNum++;
  state.tableRows.push({ lancer: state.lancerNum, counts, grises });
  document.getElementById('btn-lancer-gris').disabled = (grises === 0);
  updateReadouts(); renderTable(); drawDice(); drawGraphLibre();
}

function lancerGris() {
  const grey = state.dice.filter(d => d.active);
  if (grey.length === 0) return;
  const counts = [0, 0, 0, 0, 0, 0];
  let grises = 0;
  for (const d of grey) {
    d.face = rollOneDie(state.pipIndexLibre);
    if (d.face === 6) { d.active = false; }
    else              { grises++; }
    counts[d.face - 1]++;
  }
  state.lancerNum++;
  state.tableRows.push({ lancer: state.lancerNum, counts, grises });
  updateReadouts(); renderTable(); drawDice(); drawGraphLibre();
  if (grises === 0) document.getElementById('btn-lancer-gris').disabled = true;
}

function updateReadouts() {
  const grey = state.dice.filter(d => d.active).length;
  document.getElementById('ro-grey').textContent   = grey;
  document.getElementById('ro-lancer').textContent = state.lancerNum;
}

/* ══════════════════════════════════════════════════
   ACTIONS MODE AUTO DISCRET
══════════════════════════════════════════════════ */

function simulerEtRemplacer() {
  const results = runSims();
  if (state.series.length === 0) {
    state.series.push(buildSerie(results, pickColor()));
  } else {
    const last     = state.series[state.series.length - 1];
    const newSerie = buildSerie(results, last.color);
    newSerie.id    = last.id;
    state.series[state.series.length - 1] = newSerie;
  }
  document.getElementById('auto-progress').textContent = 'Série remplacée.';
  updateSeriesCount(); renderLegend(); drawGraphAuto();
}

function simulerEtAjouter() {
  if (state.series.length >= MAX_SERIES) {
    document.getElementById('auto-progress').textContent = 'Maximum de ' + MAX_SERIES + ' séries atteint.';
    return;
  }
  const results = runSims();
  state.series.push(buildSerie(results, pickColor()));
  document.getElementById('auto-progress').textContent = 'Série ajoutée.';
  updateSeriesCount(); renderLegend(); drawGraphAuto();
}

function supprimerSerie(id) {
  state.series = state.series.filter(s => s.id !== id);
  renderLegend(); drawGraphAuto(); updateSeriesCount();
}

function toggleIndiv(id) {
  const s = state.series.find(s => s.id === id);
  if (s) s.showIndiv = !s.showIndiv;
  renderLegend(); drawGraphAuto();
}

function masquerSerie(id) {
  const s = state.series.find(s => s.id === id);
  if (s) s.hidden = !s.hidden;
  renderLegend(); drawGraphAuto();
}

function razAuto() {
  state.series = [];
  state.view = null; state.viewHistoryAuto = [];
  state.zoomModeAuto = false; state.reticuleModeAuto = false;
  state.zoomRectAuto = null; state.tangentesFigAuto = [];
  document.getElementById('btn-zoom-auto').classList.remove('active');
  document.getElementById('btn-reticule-auto').classList.remove('active');
  document.getElementById('btn-prev-auto').disabled = true;
  document.getElementById('auto-progress').textContent = '';
  updateSeriesCount(); renderLegend(); drawGraphAuto();
}

function autoscale() { state.view = null; drawGraphAuto(); }

function adapterEchelleAuto(id) {
  const s = state.series.find(s => s.id === id);
  if (!s || s.nmoy.length === 0) return;
  const xMax = s.nmoy.length - 1;
  const yMax = Math.max(...s.nmoy);
  state.view = { xMin: 0, xMax: Math.max(xMax, 1), yMin: 0, yMax: Math.max(yMax, 1) };
  drawGraphAuto();
}

function toggleZoomAuto() {
  state.zoomModeAuto = !state.zoomModeAuto;
  state.zoomRectAuto = null; autoPan.dragging = false;
  document.getElementById('btn-zoom-auto').classList.toggle('active', state.zoomModeAuto);
  autoGraphCanvas.style.cursor = state.zoomModeAuto ? 'crosshair' : 'default';
  drawGraphAuto();
}

function prevViewAuto() {
  if (state.viewHistoryAuto.length === 0) return;
  state.view = state.viewHistoryAuto.pop();
  document.getElementById('btn-prev-auto').disabled = state.viewHistoryAuto.length === 0;
  drawGraphAuto();
}

function toggleReticuleAuto() {
  state.reticuleModeAuto = !state.reticuleModeAuto;
  document.getElementById('btn-reticule-auto').classList.toggle('active', state.reticuleModeAuto);
  if (!state.reticuleModeAuto)
    document.getElementById('reticule-tooltip-auto').style.display = 'none';
  if (state.reticuleModeAuto && state.tangenteAuto) {
    state.tangenteAuto = false;
    document.getElementById('btn-tangente-auto').classList.remove('active');
  }
  drawGraphAuto();
}

function toggleTangenteAuto() {
  state.tangenteAuto = !state.tangenteAuto;
  document.getElementById('btn-tangente-auto').classList.toggle('active', state.tangenteAuto);
  if (state.tangenteAuto && state.reticuleModeAuto) {
    state.reticuleModeAuto = false;
    document.getElementById('btn-reticule-auto').classList.remove('active');
    document.getElementById('reticule-tooltip-auto').style.display = 'none';
  }
  drawGraphAuto();
}

/* ══════════════════════════════════════════════════
   ANIMATION CONTINU
══════════════════════════════════════════════════ */

function animStepContinu(now) {
  if (!state.animPlaying) return;
  const animDureeReelle = SPEED_LEVELS[state.speedIndexContinu];
  const totalDuree      = getTotalDureeContinu();
  const speed           = totalDuree / animDureeReelle;
  const elapsed         = (now - state.animStartTime) / 1000;
  let tSim = state.animSimTimeAtStart + elapsed * speed;

  if (tSim >= totalDuree) {
    tSim = totalDuree;
    state.animPlaying = false;
    document.getElementById('btn-pause').textContent = '⏸ Pause';
    document.getElementById('btn-pause').disabled = true;
    if (state.animCurrentSerie) {
      const s = state.animCurrentSerie;
      s.complete  = true;
      s.livePoint = null;
      if (s.pts.length < 600) {
        const nPts = 600; s.pts = [];
        for (let k = 0; k <= nPts; k++) {
          const t = (k / nPts) * s.duree;
          s.pts.push({ t, v: getContinuValue(s.n0, s.lambda, t) });
        }
      }
      state.seriesContinu.push(state.animCurrentSerie);
      state.animCurrentSerie = null;
      state.viewContinu = computeFullViewContinu();
      document.getElementById('continu-progress').textContent = 'Animation terminée.';
      updateContinuSeriesCount(); renderLegendContinu();
    }
  }
  state.animSimTime = tSim;

  const serie = state.animCurrentSerie;
  if (serie) {
    const N_PTS = 600;
    const nPts  = Math.floor(tSim / totalDuree * N_PTS) + 1;
    const nHave = serie.pts.length;
    if (nPts > nHave) {
      for (let k = nHave; k < nPts; k++) {
        const t = (k / N_PTS) * totalDuree;
        if (t > tSim) break;
        serie.pts.push({ t, v: getContinuValue(serie.n0, serie.lambda, t) });
      }
    }
    serie.livePoint = { t: tSim, v: getContinuValue(serie.n0, serie.lambda, tSim) };
  }

  updateContinuTimeDisplay(tSim);
  drawGraphContinu();
  drawRecipient();
  if (state.animPlaying) requestAnimationFrame(animStepContinu);
}

function pauseContinu() {
  if (state.animPlaying) {
    state.animPlaying = false;
    document.getElementById('btn-pause').textContent = '▶ Reprendre';
  } else {
    if (!state.animCurrentSerie) return;
    const totalDuree = getTotalDureeContinu();
    if (state.animSimTime >= totalDuree) return;
    state.animPlaying        = true;
    state.animStartTime      = performance.now();
    state.animSimTimeAtStart = state.animSimTime;
    document.getElementById('btn-pause').textContent = '⏸ Pause';
    requestAnimationFrame(animStepContinu);
  }
}

function _finalizeCurrent() {
  if (state.animCurrentSerie) {
    const serie = state.animCurrentSerie;
    if (!serie.complete) {
      const totalDuree = serie.duree, nPts = 600;
      serie.pts = [];
      for (let k = 0; k <= nPts; k++) {
        const t = (k / nPts) * totalDuree;
        serie.pts.push({ t, v: getContinuValue(serie.n0, serie.lambda, t) });
      }
      serie.complete = true;
    }
    serie.livePoint = null;
    state.seriesContinu.push(serie);
  }
}

function continuerEtRemplacer() {
  state.animPlaying = false;
  document.getElementById('btn-pause').disabled = true;
  document.getElementById('btn-pause').textContent = '⏸ Pause';

  const color = state.seriesContinu.length > 0
    ? state.seriesContinu[state.seriesContinu.length - 1].color
    : (state.animCurrentSerie ? state.animCurrentSerie.color : pickColorContinu());

  if (state.seriesContinu.length > 0) state.seriesContinu.pop();

  const totalDuree = getTotalDureeContinu();
  const newSerie = {
    id: state.nextIdContinu++, color,
    lambda: state.lambda, n0: state.n0Continu, duree: totalDuree,
    pts: [], hidden: false, complete: false,
  };
  state.animCurrentSerie   = newSerie;
  state.animSimTime        = 0;
  state.animSimTimeAtStart = 0;
  state.viewContinu        = null;

  document.getElementById('continu-progress').textContent = 'Animation en cours…';
  updateContinuSeriesCount(); renderLegendContinu();
  updateContinuTimeDisplay(0);

  state.animPlaying   = true;
  state.animStartTime = performance.now();
  document.getElementById('btn-pause').disabled = false;
  document.getElementById('btn-pause').textContent = '⏸ Pause';
  requestAnimationFrame(animStepContinu);
}

function continuerEtAjouter() {
  if (state.seriesContinu.length >= MAX_SERIES) {
    document.getElementById('continu-progress').textContent = 'Maximum de ' + MAX_SERIES + ' séries atteint.';
    return;
  }
  state.animPlaying = false;
  document.getElementById('btn-pause').disabled = true;
  document.getElementById('btn-pause').textContent = '⏸ Pause';

  if (state.animCurrentSerie) { _finalizeCurrent(); state.animCurrentSerie = null; }

  const totalDuree = getTotalDureeContinu();
  const newSerie = {
    id: state.nextIdContinu++, color: pickColorContinu(),
    lambda: state.lambda, n0: state.n0Continu, duree: totalDuree,
    pts: [], hidden: false, complete: false,
  };
  state.animCurrentSerie   = newSerie;
  state.animSimTime        = 0;
  state.animSimTimeAtStart = 0;
  state.viewContinu        = null;

  document.getElementById('continu-progress').textContent = 'Animation en cours…';
  updateContinuSeriesCount(); renderLegendContinu();
  updateContinuTimeDisplay(0);

  state.animPlaying   = true;
  state.animStartTime = performance.now();
  document.getElementById('btn-pause').disabled = false;
  document.getElementById('btn-pause').textContent = '⏸ Pause';
  requestAnimationFrame(animStepContinu);
}

function supprimerSerieContinu(id) {
  state.seriesContinu = state.seriesContinu.filter(s => s.id !== id);
  renderLegendContinu(); drawGraphContinu(); updateContinuSeriesCount();
}

function masquerSerieContinu(id) {
  const s = state.seriesContinu.find(s => s.id === id);
  if (s) s.hidden = !s.hidden;
  renderLegendContinu(); drawGraphContinu();
}

function razContinu() {
  state.animPlaying = false;
  state.animCurrentSerie = null;
  state.animSimTime = 0;
  state.seriesContinu = [];
  state.viewContinu = null;
  state.tangentesFigContinu = [];
  document.getElementById('btn-pause').disabled = true;
  document.getElementById('btn-pause').textContent = '⏸ Pause';
  document.getElementById('continu-progress').textContent = '';
  updateContinuSeriesCount(); renderLegendContinu(); drawGraphContinu(); drawRecipient();
  updateContinuTimeDisplay(0);
}

function autoscaleContinu() { state.viewContinu = computeFullViewContinu(); drawGraphContinu(); }

function adapterEchelleContinu(id) {
  const allSeries = getAllContinuSeries();
  const s = allSeries.find(s => s.id === id);
  if (!s || s.pts.length === 0) return;
  const xMax = s.pts[s.pts.length - 1].t;
  const yMax = Math.max(...s.pts.map(p => p.v));
  state.viewContinu = { xMin: 0, xMax: xMax > 0 ? xMax : 1, yMin: 0, yMax: yMax > 0 ? yMax : 1 };
  drawGraphContinu();
}

function toggleZoomContinu() {
  state.zoomModeContinu = !state.zoomModeContinu;
  state.zoomRect = null; continupan.dragging = false;
  document.getElementById('btn-zoom-continu').classList.toggle('active', state.zoomModeContinu);
  continugraphCanvas.style.cursor = state.zoomModeContinu ? 'crosshair' : 'default';
  drawGraphContinu();
}

function prevViewContinu() {
  if (state.viewHistoryContinu.length === 0) return;
  state.viewContinu = state.viewHistoryContinu.pop();
  document.getElementById('btn-prev-continu').disabled = state.viewHistoryContinu.length === 0;
  drawGraphContinu();
}

function toggleReticuleContinu() {
  state.reticuleMode = !state.reticuleMode;
  document.getElementById('btn-reticule-continu').classList.toggle('active', state.reticuleMode);
  if (!state.reticuleMode) document.getElementById('reticule-tooltip').style.display = 'none';
  if (state.reticuleMode && state.tangenteContinu) {
    state.tangenteContinu = false;
    document.getElementById('btn-tangente-continu').classList.remove('active');
  }
  drawGraphContinu();
}

function toggleTangenteContinu() {
  state.tangenteContinu = !state.tangenteContinu;
  document.getElementById('btn-tangente-continu').classList.toggle('active', state.tangenteContinu);
  if (state.tangenteContinu && state.reticuleMode) {
    state.reticuleMode = false;
    document.getElementById('btn-reticule-continu').classList.remove('active');
    document.getElementById('reticule-tooltip').style.display = 'none';
  }
  drawGraphContinu();
}

function updateContinuTimeDisplay(t) {
  const serie = state.animCurrentSerie ||
    (state.seriesContinu.length > 0 ? state.seriesContinu[state.seriesContinu.length - 1] : null);
  const tMax   = serie ? serie.duree : (Math.LN2 / state.lambda) * state.nThalfContinu;
  const { factor: tFactor } = pickTimeUnit(tMax);
  const tStr = formatTimeInUnit(t, tFactor);

  let nVal = '—';
  if (serie) {
    const N = serie.n0 * Math.exp(-serie.lambda * t);
    nVal = state.graphModeContinu === 'N'
      ? (N / 1e23).toFixed(3) + ' ×10²³'
      : formatSci(serie.lambda * N) + ' s⁻¹';
  }
  const prefix = state.graphModeContinu === 'N' ? 'N' : 'A';
  document.getElementById('continu-time-display').textContent = 't = ' + tStr + '  |  ' + prefix + ' = ' + nVal;
  document.getElementById('recipient-time').textContent = 't = ' + tStr;
  document.getElementById('recipient-overlay-time').textContent = 't = ' + tStr;

  const nSpheres = getNDisques();
  let nIntactSph = nSpheres, nDesintSph = 0;
  if (serie) {
    const N    = serie.n0 * Math.exp(-serie.lambda * t);
    const frac = Math.max(0, Math.min(1, N / serie.n0));
    nDesintSph  = Math.round((1 - frac) * nSpheres);
    nIntactSph  = nSpheres - nDesintSph;
  }
  const intactStr = nIntactSph + ' intacts';
  const desintStr = nDesintSph + ' désintégrés';
  document.getElementById('stat-intact').textContent    = '● ' + intactStr;
  document.getElementById('stat-desint').textContent    = '● ' + desintStr;
  document.getElementById('stat-intact-ov').textContent = '● ' + intactStr;
  document.getElementById('stat-desint-ov').textContent = '● ' + desintStr;
}

/* ══════════════════════════════════════════════════
   CONTRÔLES PANNEAU — DISCRET
══════════════════════════════════════════════════ */

function setContinuGraphMode(mode) {
  state.graphModeContinu = mode;
  document.getElementById('btn-show-nt').classList.toggle('active', mode === 'N');
  document.getElementById('btn-show-at').classList.toggle('active', mode === 'A');
  state.viewContinu = null;

  for (const s of state.seriesContinu) {
    const nPts2 = s.pts.length > 1 ? s.pts.length - 1 : 600;
    s.pts = [];
    for (let k = 0; k <= nPts2; k++) {
      const t = (k / nPts2) * s.duree;
      const N = s.n0 * Math.exp(-s.lambda * t);
      s.pts.push({ t, v: mode === 'A' ? s.lambda * N : N });
    }
  }
  if (state.animCurrentSerie) {
    const s = state.animCurrentSerie;
    const tSim = state.animSimTime;
    const totalDuree = s.duree;
    const N_PTS = 600;
    const nPts3 = Math.floor(tSim / totalDuree * N_PTS) + 1;
    s.pts = [];
    for (let k = 0; k < nPts3; k++) {
      const t = (k / N_PTS) * totalDuree;
      if (t > tSim) break;
      const N = s.n0 * Math.exp(-s.lambda * t);
      s.pts.push({ t, v: mode === 'A' ? s.lambda * N : N });
    }
    if (s.livePoint) {
      const N = s.n0 * Math.exp(-s.lambda * tSim);
      s.livePoint = { t: tSim, v: mode === 'A' ? s.lambda * N : N };
    }
  }
  drawGraphContinu();
}

function setMode(mode) {
  state.mode = mode;
  document.getElementById('tab-libre').classList.toggle('active', mode === 'libre');
  document.getElementById('tab-auto').classList.toggle('active',  mode === 'auto');
  document.getElementById('sec-libre').classList.toggle('visible', mode === 'libre');
  document.getElementById('sec-auto').classList.toggle('visible',  mode === 'auto');
  document.getElementById('params-libre').classList.toggle('visible', mode === 'libre');
  document.getElementById('params-auto').classList.toggle('visible',  mode === 'auto');
  document.getElementById('sim-area').classList.toggle('visible',       mode === 'libre');
  document.getElementById('graph-area').classList.toggle('visible',      mode === 'libre');
  document.getElementById('auto-graph-area').classList.toggle('visible', mode === 'auto');
  document.getElementById('legend-area').classList.toggle('visible',     mode === 'auto');

  const hintBody = document.getElementById('panel-hint-body');
  if (mode === 'libre') {
    hintBody.innerHTML = '<strong>Mode Libre :</strong> lancez tous les dés ou uniquement les dés dont la face est encore grise. Un dé qui tombe sur 6 se colore en rouge et ne participe plus aux lancers suivants.';
  } else {
    hintBody.innerHTML = '<strong>Mode Automatique :</strong> paramétrez des simulations de lancers de dés, puis ajoutez-les au graphe pour comparer différents paramètres. Jusqu\'à 10 séries superposables. Le graphe affiché correspond à une moyenne sur le nombre de simulations sélectionné.';
  }
  resizeCanvases();
  drawDice(); drawGraphLibre(); drawGraphAuto();
}

function setModePrincipal(mode) {
  state.modePrincipal = mode;
  document.getElementById('tab-discret').classList.toggle('active', mode === 'discret');
  document.getElementById('tab-continu').classList.toggle('active', mode === 'continu');
  document.getElementById('section-discret').classList.toggle('visible', mode === 'discret');
  document.getElementById('section-continu').classList.toggle('visible', mode === 'continu');
  document.getElementById('panel-hint').style.display         = (mode === 'discret') ? '' : 'none';
  document.getElementById('panel-hint-continu').style.display = (mode === 'continu') ? '' : 'none';

  if (mode === 'continu') {
    document.getElementById('sim-area').classList.remove('visible');
    document.getElementById('graph-area').classList.remove('visible');
    document.getElementById('auto-graph-area').classList.remove('visible');
    document.getElementById('legend-area').classList.remove('visible');
    document.getElementById('continu-graph-area').classList.add('visible');
    document.getElementById('continu-bottom-area').classList.add('visible');
  } else {
    document.getElementById('continu-graph-area').classList.remove('visible');
    document.getElementById('continu-bottom-area').classList.remove('visible');
    setMode(state.mode);
    return;
  }
  resizeCanvases();
  drawGraphContinu();
  drawRecipient();
}

function toggleHint(id) {
  const idMap = { discret: 'panel-hint', continu: 'panel-hint-continu' };
  const hint  = document.getElementById(idMap[id] || 'panel-hint-' + id);
  hint.classList.toggle('collapsed');
  const btn = document.getElementById('btn-hint-' + id);
  btn.title = hint.classList.contains('collapsed') ? 'Afficher les instructions' : 'Masquer les instructions';
}

/* ══════════════════════════════════════════════════
   CONTRÔLES PANNEAU — VALEURS
══════════════════════════════════════════════════ */

function onNdiceChange(val) {
  const n = Math.max(1, Math.min(1000, parseInt(val) || 1));
  state.nDiceLibre = n;
  const inp = document.getElementById('inp-ndice-libre');
  if (parseInt(inp.value) !== n) inp.value = n;
  razLibre();
}

function onNdiceChangeAuto(val) {
  const n = Math.max(1, Math.min(10000, parseInt(val) || 1));
  state.nDiceAuto = n;
  const inp = document.getElementById('inp-ndice-auto');
  if (parseInt(inp.value) !== n) inp.value = n;
}

function onNsimChange(val) {
  const n = Math.max(1, Math.min(100, parseInt(val) || 1));
  state.nSim = n;
  const inp = document.getElementById('inp-nsim');
  if (parseInt(inp.value) !== n) inp.value = n;
}

function onPipChange(val) {
  state.pipIndexLibre = parseInt(val);
  document.getElementById('lbl-pip').textContent = PIP_LABELS[state.pipIndexLibre];
}

function onPipAutoChange(val) {
  state.pipIndexAuto = parseInt(val);
  document.getElementById('lbl-pip-auto').textContent = PIP_LABELS[state.pipIndexAuto];
}

function onLambdaInput(val) {
  const inp = document.getElementById('inp-lambda');
  const v   = parseLambda(val);
  inp.style.borderColor = v ? '#c8c0b4' : '#c05020';
  if (v) {
    state.lambda = v;
    document.getElementById('sel-noyau').value = '';
    document.getElementById('hint-lambda').textContent = 'entre 10⁻¹⁹ et 10⁴ s⁻¹';
    document.getElementById('hint-lambda').style.color = '#7a8a96';
  } else {
    document.getElementById('hint-lambda').textContent = 'valeur invalide (entre 10⁻¹⁹ et 10⁴ s⁻¹)';
    document.getElementById('hint-lambda').style.color = '#c05020';
  }
}

function onLambdaBlur(val) {
  const v = parseLambda(val);
  if (!v) {
    const inp = document.getElementById('inp-lambda');
    inp.value = state.lambda.toExponential(2);
    inp.style.borderColor = '#c8c0b4';
    document.getElementById('hint-lambda').textContent = 'entre 10⁻¹⁹ et 10⁴ s⁻¹';
    document.getElementById('hint-lambda').style.color = '#7a8a96';
  }
}

function onNoyauSelect(key) {
  if (!key) return;
  const n = NOYAUX[key];
  if (!n) return;
  state.lambda = n.lambda;
  const inp = document.getElementById('inp-lambda');
  inp.value = n.lambda.toExponential(3);
  inp.style.borderColor = '#c8c0b4';
  document.getElementById('hint-lambda').textContent = 'entre 10⁻¹⁹ et 10⁴ s⁻¹';
  document.getElementById('hint-lambda').style.color = '#7a8a96';
  updateContinuReadouts();
}

function onMolesChange(val) {
  state.molesIndex  = parseInt(val);
  state.n0Continu   = MOLES_VALUES[state.molesIndex] * AVOGADRO;
  document.getElementById('sel-noyau').value = '';
  if (state.animCurrentSerie) state.animCurrentSerie.disqueOrder = null;
  for (const s of state.seriesContinu) s.disqueOrder = null;
  updateContinuReadouts();
  updateContinuTimeDisplay(state.animSimTime);
  drawRecipient();
}

function onNthalfChange(val) {
  state.nThalfContinu = parseInt(val);
  document.getElementById('lbl-nthalf').textContent = state.nThalfContinu + ' t½';
}

function onSpeedContinuChange(val) {
  state.speedIndexContinu = parseInt(val);
  document.getElementById('lbl-speed-continu').textContent = SPEED_LABELS[state.speedIndexContinu];
}

function updateContinuReadouts() {
  const moles = MOLES_VALUES[state.molesIndex];
  document.getElementById('lbl-n0-continu').textContent   = moles + ' mol';
  document.getElementById('lbl-speed-continu').textContent = SPEED_LABELS[state.speedIndexContinu];
  document.getElementById('lbl-nthalf').textContent        = state.nThalfContinu + ' t½';
}

/* ══════════════════════════════════════════════════
   AGRANDISSEMENT RÉCIPIENT
══════════════════════════════════════════════════ */

function expandRecipient() {
  recipientExpanded = true;
  const overlay = document.getElementById('recipient-overlay');
  overlay.classList.add('visible');
  const dpr = window.devicePixelRatio || 1;
  const rbCssW = overlay.clientWidth  - 24;
  const rbCssH = overlay.clientHeight - 64;
  recipientCanvasBig.width  = Math.round(rbCssW * dpr);
  recipientCanvasBig.height = Math.round(rbCssH * dpr);
  recipientCtxBig.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawRecipient();
}

function collapseRecipient() {
  recipientExpanded = false;
  document.getElementById('recipient-overlay').classList.remove('visible');
  drawRecipient();
}
