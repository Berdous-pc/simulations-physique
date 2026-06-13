// ═══════════════════════════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
//  graph.js — Graphes Uc(t)/q(t) et i(t) avec zoom/pan/réticule
//  Dépend de : sim.js (sim, setTimeWindow, autoTimeWindow)
// ═══════════════════════════════════════════════════════════════════════

// Position courante de la souris dans chaque canvas (null si hors zone)
const graphHover = { 'graph-Uc': null, 'graph-i': null };

// État du pan cliqué-glissé
const graphPan = { dragging: false, startX: 0, startOffset: 0 };

// Mode réticule libre
let graphCursorActive = false;

// Mode zoom (sélection rectangulaire)
let graphZoomMode = false;
let graphZoomRect = null;

// Historique de vues pour "Précédent"
const graphViewHistory = [];

// ─────────────────────────────────────────────────────────────────────
//  Sauvegarde la vue courante dans l'historique.
// ─────────────────────────────────────────────────────────────────────
function pushGraphView() {
  graphViewHistory.push({ windowMs: sim.graphWindowMs, offsetMs: sim.viewOffsetMs });
  document.getElementById('btn-graph-prev').disabled = false;
}

// ─────────────────────────────────────────────────────────────────────
//  Revenir à la vue précédente.
// ─────────────────────────────────────────────────────────────────────
function prevGraphView() {
  if (graphViewHistory.length === 0) return;
  const v = graphViewHistory.pop();
  sim.graphWindowMs = v.windowMs;
  sim.viewOffsetMs  = v.offsetMs;
  sim.userPanned    = true;
  document.getElementById('btn-graph-prev').disabled = graphViewHistory.length === 0;
}

// ─────────────────────────────────────────────────────────────────────
//  Bascule le mode zoom.
// ─────────────────────────────────────────────────────────────────────
function toggleGraphZoom() {
  graphZoomMode = !graphZoomMode;
  graphZoomRect = null;
  document.getElementById('btn-graph-zoom').classList.toggle('active', graphZoomMode);
}

// ─────────────────────────────────────────────────────────────────────
//  Bascule le mode réticule libre.
// ─────────────────────────────────────────────────────────────────────
function toggleGraphCursor() {
  graphCursorActive = !graphCursorActive;
  document.getElementById('btn-graph-cursor').classList.toggle('active', graphCursorActive);
  if (!graphCursorActive) {
    graphHover['graph-Uc'] = null;
    graphHover['graph-i']  = null;
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Bascule le mode d'affichage du graphe gauche : q(t) ↔ Uc(t).
// ─────────────────────────────────────────────────────────────────────
function toggleGraphMode1() {
  sim.graphMode1 = sim.graphMode1 === 'Uc' ? 'q' : 'Uc';
  const btn = document.getElementById('btn-graph-mode1');
  if (sim.graphMode1 === 'q') {
    btn.textContent = 'Affichage : Charge q(t)';
    btn.classList.add('active');
    document.getElementById('graph-Uc-title').textContent = 'q(t) — Charge de l\'armature positive (µC)';
  } else {
    btn.textContent = 'Affichage : Tension Uc(t)';
    btn.classList.remove('active');
    document.getElementById('graph-Uc-title').textContent = 'Uc(t) — Tension aux bornes du condensateur (V)';
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Bascule entre les modes Synchronisé et Continu.
// ─────────────────────────────────────────────────────────────────────
function toggleGraphMode() {
  sim.graphMode = sim.graphMode === 'continuous' ? 'sync' : 'continuous';
  const btn = document.getElementById('btn-graph-mode');
  btn.textContent = sim.graphMode === 'sync' ? 'Mode : Synchronisé' : 'Mode : Continu';
  btn.classList.toggle('active', sim.graphMode === 'sync');
}

// ─────────────────────────────────────────────────────────────────────
//  Initialise les écouteurs souris sur les deux canvas.
// ─────────────────────────────────────────────────────────────────────
function initGraphHover() {
  ['graph-Uc', 'graph-i'].forEach(id => {
    const cv = document.getElementById(id);

    cv.addEventListener('mousemove', e => {
      const r  = cv.getBoundingClientRect();
      const mx = (e.clientX - r.left) * (cv.width  / r.width);
      const my = (e.clientY - r.top)  * (cv.height / r.height);

      graphHover[id] = { x: mx, y: my, free: graphCursorActive };

      if (graphZoomMode && graphZoomRect) {
        graphZoomRect.x1 = mx;
        graphZoomRect.y1 = my;
      }

      if (!graphZoomMode && graphPan.dragging) {
        const gw  = cv.width - 82 - 12;
        const dx  = (e.clientX - graphPan.startX) * (cv.width / r.width);
        const dMs = -(dx / gw) * sim.graphWindowMs;
        const maxOffset = Math.max(0, sim.tAcq - sim.graphWindowMs);
        sim.viewOffsetMs = Math.max(0, Math.min(maxOffset, graphPan.startOffset + dMs));
        sim.userPanned   = true;
      }
    });

    cv.addEventListener('mouseleave', () => {
      graphHover[id] = null;
      if (graphPan.dragging) graphPan.dragging = false;
      if (graphZoomMode && graphZoomRect) graphZoomRect = null;
    });

    cv.addEventListener('mousedown', e => {
      if (graphZoomMode) {
        const r  = cv.getBoundingClientRect();
        const mx = (e.clientX - r.left) * (cv.width  / r.width);
        const my = (e.clientY - r.top)  * (cv.height / r.height);
        graphZoomRect = { x0: mx, y0: my, x1: mx, y1: my };
      } else {
        graphPan.dragging    = true;
        graphPan.startX      = e.clientX;
        graphPan.startOffset = sim.viewOffsetMs;
      }
      e.preventDefault();
    });

    cv.addEventListener('mouseup', e => {
      if (graphZoomMode && graphZoomRect) {
        const pad = { l: 52, r: 10 };
        const gw  = cv.width - pad.l - pad.r;
        const x0c = Math.min(graphZoomRect.x0, graphZoomRect.x1);
        const x1c = Math.max(graphZoomRect.x0, graphZoomRect.x1);
        if (x1c - x0c > 5) {
          const f0 = (x0c - pad.l) / gw;
          const f1 = (x1c - pad.l) / gw;
          const t0 = sim.viewOffsetMs + f0 * sim.graphWindowMs;
          const t1 = sim.viewOffsetMs + f1 * sim.graphWindowMs;
          pushGraphView();
          sim.viewOffsetMs  = Math.max(0, t0);
          sim.graphWindowMs = Math.max(200, t1 - t0);
          sim.userPanned    = true;
        }
        graphZoomRect = null;
      } else {
        graphPan.dragging = false;
      }
    });

    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const r   = cv.getBoundingClientRect();
      const pad = { l: 82, r: 12 };
      const gw  = cv.width - pad.l - pad.r;
      const mx  = (e.clientX - r.left) * (cv.width / r.width);
      const frac = Math.max(0, Math.min(1, (mx - pad.l) / gw));
      const tUnderCursor = sim.viewOffsetMs + frac * sim.graphWindowMs;
      const factor = e.deltaY > 0 ? 1.25 : 0.8;
      const newWindow = Math.max(200, Math.min(sim.tAcq * 2, sim.graphWindowMs * factor));
      const newOffset = tUnderCursor - frac * newWindow;
      const maxOffset = Math.max(0, sim.tAcq - newWindow);
      pushGraphView();
      sim.graphWindowMs = newWindow;
      sim.viewOffsetMs  = Math.max(0, Math.min(maxOffset, newOffset));
      sim.userPanned    = true;
    }, { passive: false });
  });
}

// Note : niceStep(range, targetN) et fmtAxisY(v) ont été factorisés et
// sont désormais chargés de manière centralisée depuis assets/js/graph-renderer.js.

// ─────────────────────────────────────────────────────────────────────
//  Dessine un graphe sur le canvas identifié par canvasId.
// ─────────────────────────────────────────────────────────────────────
function drawGraph(canvasId, data, color, yMin, yMax, yUnit) {
  const cv  = document.getElementById(canvasId);
  const gc  = cv.getContext('2d');
  const w   = cv.width, h = cv.height;

  // Marge gauche dynamique selon largeur des labels Y
  gc.font = '22px monospace';
  const yStep0  = niceStep(yMax - yMin, 4);
  const yFirst0 = Math.ceil(yMin / yStep0) * yStep0;
  let maxLabelW = 0;
  for (let v = yFirst0; v <= yMax + yStep0 * 0.01; v += yStep0) {
    const lw = gc.measureText(fmtAxisY(v)).width;
    if (lw > maxLabelW) maxLabelW = lw;
  }
  const pad = { t: 10, r: 12, b: 44, l: Math.ceil(maxLabelW) + 14 };

  const gw  = w - pad.l - pad.r;
  const gh  = h - pad.t - pad.b;

  gc.clearRect(0, 0, w, h);
  gc.fillStyle = '#ffffff';
  gc.fillRect(0, 0, w, h);

  const winMs  = sim.graphWindowMs;
  const startT = sim.viewOffsetMs;
  const endT   = startT + winMs;

  // ── Grille et graduations X (temps) ──
  const xStep  = niceStep(winMs, 5);
  const xFirst = Math.ceil(startT / xStep) * xStep;
  gc.strokeStyle  = '#e0dcd6';
  gc.lineWidth    = 1;
  gc.fillStyle    = '#7a8a96';
  gc.font         = '22px monospace';
  gc.textAlign    = 'center';
  gc.textBaseline = 'top';
  for (let t = xFirst; t <= endT + xStep * 0.01; t += xStep) {
    const x = pad.l + ((t - startT) / winMs) * gw;
    if (x < pad.l - 1 || x > pad.l + gw + 1) continue;
    gc.beginPath(); gc.moveTo(x, pad.t); gc.lineTo(x, pad.t + gh); gc.stroke();
    const lbl = t < 1000 ? t.toFixed(0) + 'ms' : (t / 1000).toFixed(t < 10000 ? 1 : 0) + 's';
    gc.fillText(lbl, x, pad.t + gh + 4);
  }

  // ── Grille et graduations Y ──
  const yStep  = niceStep(yMax - yMin, 4);
  const yFirst = Math.ceil(yMin / yStep) * yStep;
  gc.textAlign    = 'right';
  gc.textBaseline = 'middle';
  gc.fillStyle    = '#7a8a96';
  for (let v = yFirst; v <= yMax + yStep * 0.01; v += yStep) {
    const y = pad.t + gh - ((v - yMin) / (yMax - yMin)) * gh;
    if (y < pad.t - 1 || y > pad.t + gh + 1) continue;
    gc.beginPath(); gc.moveTo(pad.l, y); gc.lineTo(pad.l + gw, y); gc.stroke();
    gc.fillText(fmtAxisY(v), pad.l - 5, y);
  }

  if (data.length >= 2) {
    // ── Courbe ──
    gc.save();
    gc.strokeStyle = color;
    gc.lineWidth   = 2;
    gc.shadowColor = color;
    gc.shadowBlur  = 4;
    gc.beginPath();
    let first = true;
    for (const dp of data) {
      if (dp.t < startT || dp.t > endT) { first = true; continue; }
      const x  = pad.l + ((dp.t - startT) / winMs) * gw;
      const y  = pad.t + gh - ((dp.v - yMin) / (yMax - yMin)) * gh;
      const yc = Math.max(pad.t, Math.min(pad.t + gh, y));
      if (first) { gc.moveTo(x, yc); first = false; }
      else        { gc.lineTo(x, yc); }
    }
    gc.stroke();
    gc.restore();
  }

  // ── Rectangle de zoom en cours ──
  if (graphZoomMode && graphZoomRect && graphHover[canvasId]) {
    const zr = graphZoomRect;
    const x0 = Math.min(zr.x0, zr.x1);
    const x1 = Math.max(zr.x0, zr.x1);
    gc.save();
    gc.fillStyle   = 'rgba(42, 106, 170, 0.12)';
    gc.strokeStyle = '#2a6aaa';
    gc.lineWidth   = 1.5;
    gc.fillRect(x0, pad.t, x1 - x0, gh);
    gc.strokeRect(x0, pad.t, x1 - x0, gh);
    gc.restore();
  }

  // ── Hover ──
  const hover = graphHover[canvasId];
  if (hover) {
    if (hover.free) {
      // Réticule libre
      const hx = hover.x;
      const hy = hover.y;
      gc.save();
      gc.strokeStyle = 'rgba(42, 106, 170, 0.75)';
      gc.lineWidth   = 1;
      gc.setLineDash([4, 4]);
      gc.beginPath(); gc.moveTo(hx, pad.t); gc.lineTo(hx, pad.t + gh); gc.stroke();
      gc.beginPath(); gc.moveTo(pad.l, hy); gc.lineTo(pad.l + gw, hy); gc.stroke();
      gc.setLineDash([]);
      gc.fillStyle = 'rgba(42, 106, 170, 0.9)';
      gc.fillRect(hx - 3, hy - 3, 6, 6);
      if (data.length >= 2) {
        const mouseT = startT + ((hx - pad.l) / gw) * winMs;
        const mouseV = yMin + (1 - (hy - pad.t) / gh) * (yMax - yMin);
        const tLbl  = mouseT < 1000 ? mouseT.toFixed(0) + ' ms' : (mouseT / 1000).toFixed(2) + ' s';
        const vLbl  = mouseV.toFixed(3) + ' ' + (yUnit || '');
        const label = `(${tLbl}, ${vLbl})`;
        gc.font         = '22px monospace';
        gc.fillStyle    = '#2c3e50';
        gc.textBaseline = 'bottom';
        gc.textAlign    = 'left';
        const lw = gc.measureText(label).width;
        const lx = hx + 10 + lw > pad.l + gw ? hx - 10 - lw : hx + 10;
        const ly = hy - 8 < pad.t + 28        ? hy + 32      : hy - 8;
        gc.fillText(label, lx, ly);
      }
      gc.restore();
    } else if (data.length >= 2) {
      // Hover snappé
      const mouseT = startT + ((hover.x - pad.l) / gw) * winMs;
      let best = null, bestDist = Infinity;
      for (const dp of data) {
        if (dp.t < startT || dp.t > endT) continue;
        const d = Math.abs(dp.t - mouseT);
        if (d < bestDist) { bestDist = d; best = dp; }
      }
      if (best) {
        const bx  = pad.l + ((best.t - startT) / winMs) * gw;
        const by  = pad.t + gh - ((best.v - yMin) / (yMax - yMin)) * gh;
        const byc = Math.max(pad.t, Math.min(pad.t + gh, by));

        gc.save();
        gc.setLineDash([4, 4]);
        gc.strokeStyle = 'rgba(60, 60, 60, 0.55)';
        gc.lineWidth   = 1;
        gc.beginPath(); gc.moveTo(bx, byc); gc.lineTo(bx, pad.t + gh); gc.stroke();
        gc.beginPath(); gc.moveTo(bx, byc); gc.lineTo(pad.l, byc);     gc.stroke();
        gc.setLineDash([]);

        gc.fillStyle   = color;
        gc.shadowColor = color;
        gc.shadowBlur  = 8;
        gc.beginPath(); gc.arc(bx, byc, 5, 0, Math.PI * 2); gc.fill();
        gc.shadowBlur  = 0;

        const tLbl  = best.t < 1000 ? best.t.toFixed(0) + ' ms' : (best.t / 1000).toFixed(2) + ' s';
        const vLbl  = best.v.toFixed(3) + ' ' + (yUnit || '');
        const label = `(${tLbl}, ${vLbl})`;
        gc.font         = '22px monospace';
        gc.fillStyle    = color;
        gc.textBaseline = 'bottom';
        gc.textAlign    = 'left';
        const lw = gc.measureText(label).width;
        const lx = bx + 10 + lw > pad.l + gw ? bx - 10 - lw : bx + 10;
        const ly = byc - 8 < pad.t + 28       ? byc + 32     : byc - 8;
        gc.fillText(label, lx, ly);
        gc.restore();
      }
    }
  }
}
