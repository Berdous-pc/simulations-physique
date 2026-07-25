// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  graph.js — Graphe canvas de l'évolution des quantités A/B/C/D(t)
//  Dépend de : sim.js (sim.history, SPECIES_COLORS)
//  Expose   : resizeChart(), drawChart(), buildChartLegend()
// ══════════════════════════════════════════════════════════════════════

'use strict';

var _chartVisible = { A: true, B: true, C: true, D: true };
var _chartCanvas = document.getElementById('cinetique-chart');
var _chartCtx = null;

// Position souris courante sur le canvas (coordonnées CSS, {mx,my}), ou null
// hors survol — utilisée pour afficher les coordonnées du point le plus
// proche (cf. pattern _chartHover de titrage/js/graph.js).
var _chartHover = null;

// ── Utilitaire : pas d'axe "joli" (1/2/5 × 10ⁿ) ─────────────────────────
function _niceStep(range, targetN) {
  if (range <= 0) return 1;
  var raw  = range / targetN;
  var mag  = Math.pow(10, Math.floor(Math.log10(raw)));
  var frac = raw / mag;
  var step = frac < 1.5 ? 1 : frac < 3.5 ? 2 : frac < 7.5 ? 5 : 10;
  return step * mag;
}

// ══════════════════════════════════════════════════════════════════════
//  Légende overlay à checkboxes
// ══════════════════════════════════════════════════════════════════════

function buildChartLegend() {
  var container = document.getElementById('cinetique-legende');
  if (!container) return;
  container.innerHTML = '';

  var order = [
    { key: 'A', label: 'A (réactif)' },
    { key: 'B', label: 'B (réactif)' },
    { key: 'C', label: 'C (produit)' },
    { key: 'D', label: 'D (produit)' }
  ];

  order.forEach(function (item) {
    var lbl = document.createElement('label');
    lbl.className = 'chart-legend-item' + (_chartVisible[item.key] ? '' : ' unchecked');

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = _chartVisible[item.key];
    cb.addEventListener('change', function () {
      _chartVisible[item.key] = cb.checked;
      lbl.classList.toggle('unchecked', !cb.checked);
      drawChart();
    });

    var swatch = document.createElement('span');
    swatch.className = 'chart-legend-swatch';
    swatch.style.background = SPECIES_COLORS[item.key].fill;

    var txt = document.createElement('span');
    txt.className = 'chart-legend-text';
    txt.textContent = item.label;

    lbl.appendChild(cb);
    lbl.appendChild(swatch);
    lbl.appendChild(txt);
    container.appendChild(lbl);
  });
}

// ══════════════════════════════════════════════════════════════════════
//  Resize (DPR + anti-rebond RAF) — cf. pression/js/recipient.js
// ══════════════════════════════════════════════════════════════════════

var _chartResizeRafPending = false;

function resizeChart() {
  if (_chartResizeRafPending) return;
  _chartResizeRafPending = true;
  requestAnimationFrame(function () {
    _chartResizeRafPending = false;
    _doResizeChart();
  });
}

function _doResizeChart() {
  if (!_chartCanvas) return;
  var w = _chartCanvas.clientWidth;
  var h = _chartCanvas.clientHeight;
  if (w < 1 || h < 1) return;
  var dpr = window.devicePixelRatio || 1;
  _chartCanvas.width  = Math.round(w * dpr);
  _chartCanvas.height = Math.round(h * dpr);
  _chartCtx = _chartCanvas.getContext('2d');
  _chartCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawChart();
}

// ══════════════════════════════════════════════════════════════════════
//  Dessin du graphe
// ══════════════════════════════════════════════════════════════════════

function drawChart() {
  if (!_chartCanvas || !_chartCtx) return;
  var ctx = _chartCtx;
  var W = _chartCanvas.clientWidth;
  var H = _chartCanvas.clientHeight;
  if (W < 1 || H < 1) return;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#faf9f6';
  ctx.fillRect(0, 0, W, H);

  var keys = ['A', 'B', 'C', 'D'];
  var h = sim.history;
  var n = h.t.length;

  var baseFont = Math.max(9, Math.min(W, H) * 0.05);
  // Marges généreuses : la graduation Y (jusqu'à 3 chiffres) + le titre
  // d'axe pivoté à gauche, et la graduation X + le titre d'axe en bas,
  // ont chacun besoin de leur propre ligne sans se chevaucher.
  var padL = baseFont * 4.6;
  var padR = baseFont * 1.2;
  var padT = baseFont * 1.4;
  var padB = baseFont * 3.4;
  var gw = W - padL - padR;
  var gh = H - padT - padB;
  if (gw <= 10 || gh <= 10) return;

  // ── Bornes des axes ──
  var xMax = n > 0 ? Math.max(15, h.t[n - 1]) : 15;
  var yMaxRaw = 1;
  for (var i = 0; i < n; i++) {
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (!_chartVisible[key]) continue;
      if (h[key][i] > yMaxRaw) yMaxRaw = h[key][i];
    }
  }
  var xStep = _niceStep(xMax, 5);
  var xTop  = Math.ceil(xMax / xStep) * xStep;
  var yStep = _niceStep(yMaxRaw * 1.1, 5);
  var yTop  = Math.ceil((yMaxRaw * 1.1) / yStep) * yStep;

  function px(t) { return padL + (t / xTop) * gw; }
  function py(v) { return padT + gh - (v / yTop) * gh; }

  // ── Grille ──
  ctx.strokeStyle = '#e4e0d8';
  ctx.lineWidth = 1;
  ctx.font = baseFont + 'px monospace';
  ctx.fillStyle = '#7a8a96';

  ctx.beginPath();
  for (var xv = 0; xv <= xTop + 1e-9; xv += xStep) {
    var xp = px(xv);
    ctx.moveTo(xp, padT);
    ctx.lineTo(xp, padT + gh);
  }
  for (var yv = 0; yv <= yTop + 1e-9; yv += yStep) {
    var yp = py(yv);
    ctx.moveTo(padL, yp);
    ctx.lineTo(padL + gw, yp);
  }
  ctx.stroke();

  // ── Graduations et labels ──
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (var xv2 = 0; xv2 <= xTop + 1e-9; xv2 += xStep) {
    ctx.fillText(xv2.toFixed(xStep < 1 ? 1 : 0).replace('.', ','), px(xv2), padT + gh + baseFont * 0.5);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (var yv2 = 0; yv2 <= yTop + 1e-9; yv2 += yStep) {
    ctx.fillText(Math.round(yv2), padL - baseFont * 0.6, py(yv2));
  }

  // ── Axes ──
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + gh);
  ctx.lineTo(padL + gw, padT + gh);
  ctx.stroke();

  // ── Titres d'axes (sous la ligne des graduations, avec leur propre marge) ──
  ctx.fillStyle = '#5a6a78';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('t (s)', padL + gw / 2, H - baseFont * 0.3);
  ctx.save();
  ctx.translate(baseFont * 1.1, padT + gh / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('N (molécules)', 0, 0);
  ctx.restore();

  // ── Courbes ──
  // Ordre de tracé : B, C, D puis A en dernier — A passe donc devant les
  // autres (peint par-dessus) là où les courbes se superposent, ce qui
  // importe surtout au départ (N0_A = N0_B par défaut : A et B coïncident).
  var drawOrder = ['B', 'C', 'D', 'A'];
  if (n > 1) {
    for (var kk = 0; kk < drawOrder.length; kk++) {
      var key2 = drawOrder[kk];
      if (!_chartVisible[key2]) continue;
      ctx.beginPath();
      for (var ii = 0; ii < n; ii++) {
        var xp2 = px(h.t[ii]);
        var yp2 = py(h[key2][ii]);
        if (ii === 0) ctx.moveTo(xp2, yp2); else ctx.lineTo(xp2, yp2);
      }
      ctx.strokeStyle = SPECIES_COLORS[key2].fill;
      ctx.lineWidth = Math.max(1.5, baseFont * 0.16);
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  // ── Survol : coordonnées du point de courbe le plus proche du curseur ──
  _drawChartHover(ctx, padL, padT, gw, gh, px, py, xTop, W, H, baseFont, n);
}

// Cherche, parmi les courbes visibles, le point le plus proche du curseur.
// L'historique n'est échantillonné que toutes les 200 ms : on interpole
// linéairement le long du segment tracé pour que le repère suive le curseur
// en continu au lieu de sauter d'un échantillon à l'autre.
// Si deux courbes sont superposées à cet instant, seule la plus proche du
// curseur en pixels est retenue (cf. pattern de titrage/js/graph.js).
function _drawChartHover(ctx, padL, padT, gw, gh, px, py, xTop, W, H, baseFont, n) {
  if (!_chartHover || n === 0) return;
  var mx = _chartHover.mx, my = _chartHover.my;
  if (mx < padL - 10 || mx > padL + gw + 10 || my < padT - 10 || my > padT + gh + 10) return;

  var h = sim.history;
  var tMouse = ((mx - padL) / gw) * xTop;

  // Segment [i0, i1] de l'historique encadrant l'instant survolé, et position
  // fractionnaire du curseur à l'intérieur de ce segment.
  var tClamp = Math.max(h.t[0], Math.min(h.t[n - 1], tMouse));
  var i0 = 0;
  for (var i = 0; i < n - 1; i++) {
    if (h.t[i] <= tClamp) i0 = i; else break;
  }
  var i1 = Math.min(i0 + 1, n - 1);
  var dt = h.t[i1] - h.t[i0];
  var frac = dt > 0 ? (tClamp - h.t[i0]) / dt : 0;
  var tHover = h.t[i0] + frac * dt;

  var keys = ['A', 'B', 'C', 'D'];
  var bestKey = null, bestDist = Infinity, bestPx = 0, bestPy = 0, bestVal = 0;
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    if (!_chartVisible[key]) continue;
    var val = h[key][i0] + frac * (h[key][i1] - h[key][i0]);
    var bx = px(tHover);
    var by = py(val);
    var dist = Math.hypot(bx - mx, by - my);
    if (dist < bestDist) { bestDist = dist; bestKey = key; bestPx = bx; bestPy = by; bestVal = val; }
  }
  if (!bestKey || bestDist > Math.max(30, baseFont * 3)) return;

  var color = SPECIES_COLORS[bestKey].fill;

  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(60,60,60,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(bestPx, bestPy); ctx.lineTo(bestPx, padT + gh); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bestPx, bestPy); ctx.lineTo(padL, bestPy); ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(bestPx, bestPy, 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(bestPx, bestPy, 5, 0, Math.PI * 2); ctx.stroke();

  var label = bestKey + '  |  t = ' + tHover.toFixed(2).replace('.', ',') +
              ' s  |  N = ' + Math.round(bestVal);
  var ttFs  = Math.max(11, Math.round(Math.min(W, H) * 0.038));
  ctx.font  = 'bold ' + ttFs + 'px "Segoe UI", Arial, sans-serif';
  var lw    = ctx.measureText(label).width;
  var pad2  = 6;
  var ttW   = lw + pad2 * 2;
  var ttH   = ttFs + pad2 * 2;

  var spaceRight = padL + gw - (bestPx + 12);
  var spaceLeft  = bestPx - 12 - padL;
  var lx = (spaceRight >= ttW || spaceRight >= spaceLeft) ? bestPx + 12 : bestPx - 12 - ttW;
  lx = Math.max(padL, Math.min(padL + gw - ttW, lx));
  var ly = bestPy - ttFs - 8;
  if (ly - pad2 < padT) ly = bestPy + 10;

  ctx.fillStyle = 'rgba(255,255,255,0.93)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(lx - pad2, ly - pad2, ttW, ttH, 4); }
  else { ctx.rect(lx - pad2, ly - pad2, ttW, ttH); }
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = '#1a2535';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(label, lx, ly);
  ctx.restore();
}

// ── Survol souris (coordonnées du point le plus proche) ─────────────────
if (_chartCanvas) {
  _chartCanvas.addEventListener('mousemove', function (e) {
    var r = _chartCanvas.getBoundingClientRect();
    var scX = _chartCanvas.clientWidth  / r.width;
    var scY = _chartCanvas.clientHeight / r.height;
    _chartHover = { mx: (e.clientX - r.left) * scX, my: (e.clientY - r.top) * scY };
    drawChart();
  });
  _chartCanvas.addEventListener('mouseleave', function () {
    _chartHover = null;
    drawChart();
  });
}

// ── Attacher l'événement resize ────────────────────────────────────────
window.addEventListener('resize', resizeChart);
