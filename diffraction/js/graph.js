// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
//  graph.js — Graphe I(x) interactif (zoom/pan/réticule/tangente)
//  Dépend de : sim.js (sim, echantillonnerIntensite)
//  Chargé après scene.js.
// ═══════════════════════════════════════════════════

const N_ECHANTILLONS = 600;

// Fenêtre de vue courante (en mètres, sur x) et sur y (intensité normalisée)
const gview = {
  xMin: -sim.screenHalfWidth,
  xMax:  sim.screenHalfWidth,
  yMin: 0,
  yMax: 1.05
};
const graphViewHistory = [];

// Survol souris (position canvas)
let graphHover = null;

// Mode zoom (sélection rectangulaire)
let graphZoomMode = false;
let graphZoomRect = null;

// Mode réticule libre
let graphCursorActive = false;

// Mode tangente
let graphTangenteMode = false;
const tangentesFig = [];      // { x0, I0, slope }
let tangenteCrossZones = [];  // zones de clic (×) pour supprimer, recalculées à chaque dessin

// Pan (clic-glissé)
const graphPan = { dragging: false, startX: 0, startXMin: 0, startXMax: 0 };

// ─────────────────────────────────────────────────────────────────────
function pushGraphView() {
  graphViewHistory.push({ xMin: gview.xMin, xMax: gview.xMax, yMin: gview.yMin, yMax: gview.yMax });
  document.getElementById('btn-graph-prev').disabled = false;
}
function prevGraphView() {
  if (graphViewHistory.length === 0) return;
  const v = graphViewHistory.pop();
  Object.assign(gview, v);
  document.getElementById('btn-graph-prev').disabled = graphViewHistory.length === 0;
  drawIntensityGraph();
}
function autoScaleGraph() {
  pushGraphView();
  gview.xMin = -sim.screenHalfWidth;
  gview.xMax =  sim.screenHalfWidth;
  gview.yMin = 0;
  gview.yMax = 1.05;
  drawIntensityGraph();
}

function toggleGraphZoom() {
  graphZoomMode = !graphZoomMode;
  graphZoomRect = null;
  if (graphZoomMode) { graphCursorActive = false; graphTangenteMode = false; }
  syncGraphButtons();
}
function toggleGraphCursor() {
  graphCursorActive = !graphCursorActive;
  if (graphCursorActive) { graphZoomMode = false; graphTangenteMode = false; }
  if (!graphCursorActive) graphHover = null;
  syncGraphButtons();
}
function toggleGraphTangente() {
  graphTangenteMode = !graphTangenteMode;
  if (graphTangenteMode) { graphZoomMode = false; graphCursorActive = false; }
  syncGraphButtons();
  drawIntensityGraph();
}
function syncGraphButtons() {
  document.getElementById('btn-graph-zoom').classList.toggle('active', graphZoomMode);
  document.getElementById('btn-graph-cursor').classList.toggle('active', graphCursorActive);
  document.getElementById('btn-graph-tangente').classList.toggle('active', graphTangenteMode);
}

// ─────────────────────────────────────────────────────────────────────
//  Pas de graduation "joli" (1, 2, 5 × 10^n).
// ─────────────────────────────────────────────────────────────────────
function niceStep(range, targetN) {
  const raw  = range / targetN;
  const mag  = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return nice * mag;
}

// ─────────────────────────────────────────────────────────────────────
//  Point échantillonné le plus proche d'une abscisse x (m).
// ─────────────────────────────────────────────────────────────────────
function pointLePlusProche(pts, x) {
  let best = pts[0], bestD = Infinity;
  for (const p of pts) {
    const d = Math.abs(p.x - x);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────
//  Pente locale de I(x) au point d'indice i (différences finies centrées).
// ─────────────────────────────────────────────────────────────────────
function penteLocale(pts, i) {
  const i0 = Math.max(0, i - 1), i1 = Math.min(pts.length - 1, i + 1);
  return (pts[i1].I - pts[i0].I) / (pts[i1].x - pts[i0].x);
}

// ─────────────────────────────────────────────────────────────────────
//  Dessine le graphe I(x) complet dans #graph-intensity.
// ─────────────────────────────────────────────────────────────────────
function drawIntensityGraph() {
  const cv = document.getElementById('graph-intensity');
  if (!cv) return;
  const gc = cv.getContext('2d');
  const w = cv.clientWidth, h = cv.clientHeight;
  if (w === 0 || h === 0) return;

  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  gc.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pts = echantillonnerIntensite(N_ECHANTILLONS);

  gc.font = '13px monospace';
  const pad = { t: 10, r: 14, b: 30, l: 34 };
  const gw = w - pad.l - pad.r;
  const gh = h - pad.t - pad.b;

  gc.clearRect(0, 0, w, h);
  gc.fillStyle = '#ffffff';
  gc.fillRect(0, 0, w, h);

  const { xMin, xMax, yMin, yMax } = gview;
  const toX = x => pad.l + ((x - xMin) / (xMax - xMin)) * gw;
  const toY = I => pad.t + gh - ((I - yMin) / (yMax - yMin)) * gh;

  // ── Grille + graduations X (cm) ──
  const xStepM = niceStep((xMax - xMin) * 100, 6) / 100;
  const xFirst = Math.ceil(xMin / xStepM) * xStepM;
  gc.strokeStyle = '#e0dcd6';
  gc.lineWidth = 1;
  gc.fillStyle = '#7a8a96';
  gc.font = '12px monospace';
  gc.textAlign = 'center';
  gc.textBaseline = 'top';
  for (let x = xFirst; x <= xMax + xStepM * 0.01; x += xStepM) {
    const px = toX(x);
    if (px < pad.l - 1 || px > pad.l + gw + 1) continue;
    gc.beginPath(); gc.moveTo(px, pad.t); gc.lineTo(px, pad.t + gh); gc.stroke();
    gc.fillText((x * 100).toFixed(1) + ' cm', px, pad.t + gh + 4);
  }

  // ── Grille + graduations Y (intensité normalisée) ──
  const yStep = niceStep(yMax - yMin, 4);
  const yFirst = Math.ceil(yMin / yStep) * yStep;
  gc.textAlign = 'right';
  gc.textBaseline = 'middle';
  for (let v = yFirst; v <= yMax + yStep * 0.01; v += yStep) {
    const py = toY(v);
    if (py < pad.t - 1 || py > pad.t + gh + 1) continue;
    gc.beginPath(); gc.moveTo(pad.l, py); gc.lineTo(pad.l + gw, py); gc.stroke();
    gc.fillText(v.toFixed(2), pad.l - 5, py);
  }

  // ── Cadre ──
  gc.strokeStyle = '#c8c0b4';
  gc.strokeRect(pad.l, pad.t, gw, gh);

  // ── Courbe I(x) ──
  gc.save();
  gc.beginPath();
  gc.rect(pad.l, pad.t, gw, gh);
  gc.clip();
  const couleur = longueurOndeVersCss(sim.lambda);
  gc.strokeStyle = couleur;
  gc.lineWidth = 2;
  gc.shadowColor = couleur;
  gc.shadowBlur = 4;
  gc.beginPath();
  let first = true;
  for (const p of pts) {
    const px = toX(p.x), py = toY(p.I);
    if (first) { gc.moveTo(px, py); first = false; }
    else gc.lineTo(px, py);
  }
  gc.stroke();
  gc.restore();

  // ── Tangentes figées ──
  tangenteCrossZones = [];
  for (let i = 0; i < tangentesFig.length; i++) {
    const t = tangentesFig[i];
    const cz = dessinerTangente(gc, pad, gw, gh, toX, toY, xMin, xMax, t, i);
    if (cz) tangenteCrossZones.push(cz);
  }

  // ── Aperçu hover de la tangente (mode actif, avant clic) ──
  if (graphTangenteMode && graphHover) {
    const xHover = xMin + ((graphHover.x - pad.l) / gw) * (xMax - xMin);
    if (xHover >= xMin && xHover <= xMax) {
      const idx = pts.findIndex(p => p.x >= xHover);
      const i = idx === -1 ? pts.length - 1 : idx;
      const slope = penteLocale(pts, i);
      dessinerTangente(gc, pad, gw, gh, toX, toY, xMin, xMax,
        { x0: pts[i].x, I0: pts[i].I, slope }, -1, true);
    }
  }

  // ── Rectangle de zoom en cours ──
  if (graphZoomMode && graphZoomRect) {
    const zr = graphZoomRect;
    const x0 = Math.min(zr.x0, zr.x1), x1 = Math.max(zr.x0, zr.x1);
    const y0 = Math.min(zr.y0, zr.y1), y1 = Math.max(zr.y0, zr.y1);
    gc.save();
    gc.fillStyle = 'rgba(42,106,170,0.12)';
    gc.strokeStyle = '#2a6aaa';
    gc.lineWidth = 1.5;
    gc.fillRect(x0, y0, x1 - x0, y1 - y0);
    gc.strokeRect(x0, y0, x1 - x0, y1 - y0);
    gc.restore();
  }

  // ── Réticule libre ──
  if (graphCursorActive && graphHover) {
    const hx = graphHover.x, hy = graphHover.y;
    gc.save();
    gc.strokeStyle = 'rgba(42,106,170,0.75)';
    gc.lineWidth = 1;
    gc.setLineDash([4, 4]);
    gc.beginPath(); gc.moveTo(hx, pad.t); gc.lineTo(hx, pad.t + gh); gc.stroke();
    gc.beginPath(); gc.moveTo(pad.l, hy); gc.lineTo(pad.l + gw, hy); gc.stroke();
    gc.setLineDash([]);
    gc.fillStyle = 'rgba(42,106,170,0.9)';
    gc.fillRect(hx - 3, hy - 3, 6, 6);

    const xVal = xMin + ((hx - pad.l) / gw) * (xMax - xMin);
    const yVal = yMin + (1 - (hy - pad.t) / gh) * (yMax - yMin);
    const label = `(${(xVal * 100).toFixed(2)} cm, ${yVal.toFixed(3)})`;
    gc.font = '13px monospace';
    gc.fillStyle = '#2c3e50';
    gc.textBaseline = 'bottom';
    gc.textAlign = 'left';
    const lw = gc.measureText(label).width;
    const lx = hx + 10 + lw > pad.l + gw ? hx - 10 - lw : hx + 10;
    const ly = hy - 8 < pad.t + 16 ? hy + 24 : hy - 8;
    gc.fillText(label, lx, ly);
    gc.restore();
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Dessine une tangente (droite + étiquette pente, + croix de suppression
//  si figée). Renvoie la zone de clic de la croix (ou null si aperçu hover).
// ─────────────────────────────────────────────────────────────────────
function dessinerTangente(gc, pad, gw, gh, toX, toY, xMin, xMax, t, idx, isPreview) {
  const { x0, I0, slope } = t;
  const y0v = I0 - slope * x0;
  const px0 = toX(xMin), py0 = toY(yMinClip(slope * xMin + y0v));
  const px1 = toX(xMax), py1 = toY(yMinClip(slope * xMax + y0v));

  gc.save();
  gc.beginPath();
  gc.rect(pad.l, pad.t, gw, gh);
  gc.clip();
  gc.strokeStyle = isPreview ? 'rgba(180,64,32,0.55)' : '#b04020';
  gc.lineWidth = isPreview ? 1.3 : 1.8;
  gc.setLineDash(isPreview ? [3, 4] : [6, 4]);
  gc.beginPath(); gc.moveTo(px0, py0); gc.lineTo(px1, py1); gc.stroke();
  gc.setLineDash([]);

  // Point d'ancrage
  gc.fillStyle = isPreview ? 'rgba(180,64,32,0.6)' : '#b04020';
  gc.beginPath(); gc.arc(toX(x0), toY(I0), isPreview ? 3.5 : 4.5, 0, Math.PI * 2); gc.fill();
  gc.restore();

  if (isPreview) return null;

  // Étiquette pente + croix de suppression
  const lx = toX(x0), ly = toY(I0);
  const label = `pente ${slope.toExponential(2)} /m`;
  gc.font = '12px monospace';
  const lw = gc.measureText(label).width;
  const boxX = Math.min(Math.max(lx + 8, pad.l), pad.l + gw - lw - 26);
  const boxY = Math.max(ly - 22, pad.t + 2);

  gc.fillStyle = 'rgba(44,62,80,0.85)';
  gc.fillRect(boxX - 4, boxY - 2, lw + 26, 18);
  gc.fillStyle = '#fff';
  gc.textAlign = 'left';
  gc.textBaseline = 'middle';
  gc.fillText(label, boxX, boxY + 7);

  const crossX = boxX + lw + 10, crossY = boxY + 7;
  gc.strokeStyle = '#fff';
  gc.lineWidth = 1.3;
  gc.beginPath();
  gc.moveTo(crossX - 4, crossY - 4); gc.lineTo(crossX + 4, crossY + 4);
  gc.moveTo(crossX + 4, crossY - 4); gc.lineTo(crossX - 4, crossY + 4);
  gc.stroke();

  return { idx, x: crossX, y: crossY, r: 8 };
}
function yMinClip(v) { return Math.max(-0.3, Math.min(1.3, v)); }

// ─────────────────────────────────────────────────────────────────────
//  Écouteurs souris du canvas graphe.
// ─────────────────────────────────────────────────────────────────────
function initGraphInteractions() {
  const cv = document.getElementById('graph-intensity');

  cv.addEventListener('mousemove', e => {
    const r = cv.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (cv.clientWidth / r.width);
    const my = (e.clientY - r.top) * (cv.clientHeight / r.height);
    graphHover = { x: mx, y: my };

    if (graphZoomMode && graphZoomRect) {
      graphZoomRect.x1 = mx; graphZoomRect.y1 = my;
    }
    if (!graphZoomMode && graphPan.dragging) {
      const pad = { l: 34, r: 14 };
      const gw = cv.clientWidth - pad.l - pad.r;
      const dxPx = (e.clientX - graphPan.startX) * (cv.clientWidth / r.width);
      const span = graphPan.startXMax - graphPan.startXMin;
      const dx = -(dxPx / gw) * span;
      gview.xMin = graphPan.startXMin + dx;
      gview.xMax = graphPan.startXMax + dx;
    }
    drawIntensityGraph();
  });

  cv.addEventListener('mouseleave', () => {
    graphHover = null;
    graphPan.dragging = false;
    if (graphZoomMode && graphZoomRect) graphZoomRect = null;
    drawIntensityGraph();
  });

  cv.addEventListener('mousedown', e => {
    const r = cv.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (cv.clientWidth / r.width);
    const my = (e.clientY - r.top) * (cv.clientHeight / r.height);

    // Clic sur une croix de suppression de tangente ?
    for (const cz of tangenteCrossZones) {
      if (Math.hypot(mx - cz.x, my - cz.y) <= cz.r + 3) {
        tangentesFig.splice(cz.idx, 1);
        drawIntensityGraph();
        return;
      }
    }

    if (graphTangenteMode) {
      const pad = { l: 34, r: 14 };
      const gw = cv.clientWidth - pad.l - pad.r;
      const xClick = gview.xMin + ((mx - pad.l) / gw) * (gview.xMax - gview.xMin);
      const pts = echantillonnerIntensite(N_ECHANTILLONS);
      const idx = pts.findIndex(p => p.x >= xClick);
      const i = idx === -1 ? pts.length - 1 : idx;
      tangentesFig.push({ x0: pts[i].x, I0: pts[i].I, slope: penteLocale(pts, i) });
      drawIntensityGraph();
      return;
    }

    if (graphZoomMode) {
      graphZoomRect = { x0: mx, y0: my, x1: mx, y1: my };
    } else {
      graphPan.dragging = true;
      graphPan.startX = e.clientX;
      graphPan.startXMin = gview.xMin;
      graphPan.startXMax = gview.xMax;
    }
    e.preventDefault();
  });

  cv.addEventListener('mouseup', () => {
    if (graphZoomMode && graphZoomRect) {
      const pad = { l: 34, r: 14, t: 10, b: 30 };
      const gw = cv.clientWidth - pad.l - pad.r;
      const gh = cv.clientHeight - pad.t - pad.b;
      const x0c = Math.min(graphZoomRect.x0, graphZoomRect.x1);
      const x1c = Math.max(graphZoomRect.x0, graphZoomRect.x1);
      const y0c = Math.min(graphZoomRect.y0, graphZoomRect.y1);
      const y1c = Math.max(graphZoomRect.y0, graphZoomRect.y1);
      if (x1c - x0c > 5 && y1c - y0c > 5) {
        const span = gview.xMax - gview.xMin;
        const ySpan = gview.yMax - gview.yMin;
        const nx0 = gview.xMin + ((x0c - pad.l) / gw) * span;
        const nx1 = gview.xMin + ((x1c - pad.l) / gw) * span;
        const ny1 = gview.yMax - ((y0c - pad.t) / gh) * ySpan;
        const ny0 = gview.yMax - ((y1c - pad.t) / gh) * ySpan;
        pushGraphView();
        gview.xMin = nx0; gview.xMax = nx1;
        gview.yMin = ny0; gview.yMax = ny1;
      }
      graphZoomRect = null;
    } else {
      graphPan.dragging = false;
    }
    drawIntensityGraph();
  });

  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const pad = { l: 34, r: 14 };
    const gw = cv.clientWidth - pad.l - pad.r;
    const mx = (e.clientX - r.left) * (cv.clientWidth / r.width);
    const frac = Math.max(0, Math.min(1, (mx - pad.l) / gw));
    const span = gview.xMax - gview.xMin;
    const xUnderCursor = gview.xMin + frac * span;
    const factor = e.deltaY > 0 ? 1.2 : 0.83;
    const newSpan = Math.max(0.005, Math.min(sim.screenHalfWidth * 4, span * factor));
    pushGraphView();
    gview.xMin = xUnderCursor - frac * newSpan;
    gview.xMax = gview.xMin + newSpan;
    drawIntensityGraph();
  }, { passive: false });
}

// ─────────────────────────────────────────────────────────────────────
//  Redimensionnement du canvas graphe (anti-rebond via ui.js).
// ─────────────────────────────────────────────────────────────────────
function resizeGraphCanvas() {
  drawIntensityGraph();
}
