// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  graph.js — Graphe canvas de l'évolution des quantités A/B/C/D(t)
//  Dépend de : sim.js (sims, SPECIES_COLORS)
//  Expose   : attachChart(s), resizeChartAll(), resizeChart(s), drawChart(s),
//             buildChartLegend(s), drawAllCharts()
//
//  Un graphe par simulation (#equilibre-chart-1 / -2). En mode 2 simulations,
//  les DEUX graphes partagent les mêmes bornes d'axes (cf. _axisBounds) :
//  sans cela, deux courbes d'allures très différentes se ressembleraient une
//  fois chacune remise à l'échelle de son propre cadre, ce qui ruinerait la
//  comparaison visuelle qui est tout l'objet du mode double.
// ══════════════════════════════════════════════════════════════════════

'use strict';

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
//  Rattachement au DOM
// ══════════════════════════════════════════════════════════════════════

function attachChart(s) {
  s.chartCanvas = document.getElementById('equilibre-chart-' + s.index);
  s.chartCtx = null;
  if (!s.chartCanvas) return;

  // ── Survol souris (coordonnées du point le plus proche) ──
  s.chartCanvas.addEventListener('mousemove', function (e) {
    var r = s.chartCanvas.getBoundingClientRect();
    var scX = s.chartCanvas.clientWidth  / r.width;
    var scY = s.chartCanvas.clientHeight / r.height;
    s.chartHover = { mx: (e.clientX - r.left) * scX, my: (e.clientY - r.top) * scY };
    drawChart(s);
  });
  s.chartCanvas.addEventListener('mouseleave', function () {
    s.chartHover = null;
    drawChart(s);
  });
}

// ══════════════════════════════════════════════════════════════════════
//  Légende overlay à checkboxes
// ══════════════════════════════════════════════════════════════════════

function buildChartLegend(s) {
  var container = document.getElementById('equilibre-legende-' + s.index);
  if (!container) return;
  container.innerHTML = '';

  var order = [
    { key: 'A', label: 'A' },
    { key: 'B', label: 'B' },
    { key: 'C', label: 'C' },
    { key: 'D', label: 'D' }
  ];

  order.forEach(function (item) {
    var lbl = document.createElement('label');
    lbl.className = 'chart-legend-item' + (s.chartVisible[item.key] ? '' : ' unchecked');

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = s.chartVisible[item.key];
    cb.addEventListener('change', function () {
      s.chartVisible[item.key] = cb.checked;
      lbl.classList.toggle('unchecked', !cb.checked);
      // Les bornes des axes sont communes aux deux graphes : masquer une
      // courbe ici peut donc changer l'échelle de l'autre.
      drawAllCharts();
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

function resizeChartAll() {
  if (_chartResizeRafPending) return;
  _chartResizeRafPending = true;
  requestAnimationFrame(function () {
    _chartResizeRafPending = false;
    activeSims().forEach(function (s) { resizeChart(s); });
  });
}

function resizeChart(s) {
  var cv = s.chartCanvas;
  if (!cv) return;
  var w = cv.clientWidth;
  var h = cv.clientHeight;
  if (w < 1 || h < 1) return;
  var dpr = window.devicePixelRatio || 1;
  cv.width  = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  s.chartCtx = cv.getContext('2d');
  s.chartCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawChart(s);
}

function drawAllCharts() {
  activeSims().forEach(function (s) { drawChart(s); });
}

// ══════════════════════════════════════════════════════════════════════
//  Bornes des axes — COMMUNES à toutes les simulations affichées
// ══════════════════════════════════════════════════════════════════════

function _axisBounds() {
  var keys = ['A', 'B', 'C', 'D'];
  var xMax = 15;
  var yMaxRaw = 1;

  activeSims().forEach(function (s) {
    var h = s.history;
    var n = h.t.length;
    if (n > 0 && h.t[n - 1] > xMax) xMax = h.t[n - 1];
    for (var i = 0; i < n; i++) {
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        if (!s.chartVisible[key]) continue;
        if (h[key][i] > yMaxRaw) yMaxRaw = h[key][i];
      }
    }
    // Les pointillés de quantités théoriques doivent rester visibles dès
    // l'affichage, sans attendre que la courbe rejoigne cette hauteur.
    if (s.showTheoretical) {
      var eq = theoreticalEquilibrium(s);
      if (eq) {
        for (var k2 = 0; k2 < keys.length; k2++) {
          var key2 = keys[k2];
          if (!s.chartVisible[key2]) continue;
          if (eq[key2] > yMaxRaw) yMaxRaw = eq[key2];
        }
      }
    }
  });

  var xStep = _niceStep(xMax, 5);
  var yStep = _niceStep(yMaxRaw * 1.1, 5);
  return {
    xStep: xStep,
    xTop: Math.ceil(xMax / xStep) * xStep,
    yStep: yStep,
    yTop: Math.ceil((yMaxRaw * 1.1) / yStep) * yStep
  };
}

// ══════════════════════════════════════════════════════════════════════
//  Dessin du graphe
// ══════════════════════════════════════════════════════════════════════

function drawChart(s) {
  if (!s.chartCanvas || !s.chartCtx) return;
  var ctx = s.chartCtx;
  var W = s.chartCanvas.clientWidth;
  var H = s.chartCanvas.clientHeight;
  if (W < 1 || H < 1) return;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#faf9f6';
  ctx.fillRect(0, 0, W, H);

  var h = s.history;
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

  // ── Bornes des axes (partagées entre les simulations affichées) ──
  var bounds = _axisBounds();
  var xStep = bounds.xStep, xTop = bounds.xTop;
  var yStep = bounds.yStep, yTop = bounds.yTop;

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

  // ── Repère de la simulation (mode 2 simulations uniquement) ──
  if (simCount > 1) {
    ctx.fillStyle = '#5a6a78';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold ' + baseFont + 'px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Simulation ' + s.index, padL + baseFont * 0.4, padT + baseFont * 0.3);
  }

  // ── Courbes ──
  // Ordre de tracé : B, C, D puis A en dernier — A passe donc devant les
  // autres (peint par-dessus) là où les courbes se superposent, ce qui
  // importe surtout au départ (N0_A = N0_B par défaut : A et B coïncident).
  var drawOrder = ['B', 'C', 'D', 'A'];
  if (n > 1) {
    for (var kk = 0; kk < drawOrder.length; kk++) {
      var key2 = drawOrder[kk];
      if (!s.chartVisible[key2]) continue;
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

  // ── Quantités finales théoriques (pointillés horizontaux) ──
  // Une ligne par espèce visible, à la hauteur N_eq calculée par
  // theoreticalEquilibrium() (cf. sim.js) — la valeur vers laquelle la
  // courbe pleine correspondante devrait converger.
  if (s.showTheoretical) {
    var eqVals = theoreticalEquilibrium(s);
    if (eqVals) {
      ctx.save();
      ctx.setLineDash([Math.max(4, baseFont * 0.5), Math.max(3, baseFont * 0.35)]);
      ctx.lineWidth = Math.max(1.3, baseFont * 0.14);
      for (var tk = 0; tk < drawOrder.length; tk++) {
        var tKey = drawOrder[tk];
        if (!s.chartVisible[tKey]) continue;
        var yEq = py(eqVals[tKey]);
        ctx.strokeStyle = SPECIES_COLORS[tKey].fill;
        ctx.beginPath();
        ctx.moveTo(padL, yEq);
        ctx.lineTo(padL + gw, yEq);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── Survol : coordonnées du point de courbe le plus proche du curseur ──
  _drawChartHover(s, ctx, padL, padT, gw, gh, px, py, xTop, W, H, baseFont, n);
}

// Cherche, parmi les courbes visibles, le point le plus proche du curseur.
// L'historique n'est échantillonné que toutes les 200 ms : on interpole
// linéairement le long du segment tracé pour que le repère suive le curseur
// en continu au lieu de sauter d'un échantillon à l'autre.
// Si deux courbes sont superposées à cet instant, seule la plus proche du
// curseur en pixels est retenue (cf. pattern de titrage/js/graph.js).
function _drawChartHover(s, ctx, padL, padT, gw, gh, px, py, xTop, W, H, baseFont, n) {
  if (!s.chartHover || n === 0) return;
  var mx = s.chartHover.mx, my = s.chartHover.my;
  if (mx < padL - 10 || mx > padL + gw + 10 || my < padT - 10 || my > padT + gh + 10) return;

  var h = s.history;

  // Pour chaque courbe visible, on cherche sur TOUS les segments du tracé
  // (pas seulement celui à l'abscisse de la souris) le point projeté le plus
  // proche du curseur en pixels (x ET y). Une restriction à l'abscisse de la
  // souris ratait le vrai point le plus proche sur une portion pentue, car
  // celui-ci peut se trouver sur un segment voisin décalé en x.
  var keys = ['A', 'B', 'C', 'D'];
  var bestKey = null, bestDist2 = Infinity, bestPx = 0, bestPy = 0, bestVal = 0, bestT = 0;
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    if (!s.chartVisible[key]) continue;
    for (var i = 0; i < n - 1; i++) {
      var x0 = px(h.t[i]),     y0 = py(h[key][i]);
      var x1 = px(h.t[i + 1]), y1 = py(h[key][i + 1]);
      var dx = x1 - x0, dy = y1 - y0;
      var segLenSq = dx * dx + dy * dy;
      var frac = segLenSq > 0 ? ((mx - x0) * dx + (my - y0) * dy) / segLenSq : 0;
      frac = Math.max(0, Math.min(1, frac));
      var bx = x0 + frac * dx;
      var by = y0 + frac * dy;
      var ddx = bx - mx, ddy = by - my;
      var dist2 = ddx * ddx + ddy * ddy;
      if (dist2 < bestDist2) {
        bestDist2 = dist2; bestKey = key; bestPx = bx; bestPy = by;
        bestVal = h[key][i] + frac * (h[key][i + 1] - h[key][i]);
        bestT   = h.t[i] + frac * (h.t[i + 1] - h.t[i]);
      }
    }
  }
  var maxDist = Math.max(30, baseFont * 3);
  if (!bestKey || bestDist2 > maxDist * maxDist) return;
  var tHover = bestT;

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

// ── Attacher l'événement resize ────────────────────────────────────────
window.addEventListener('resize', resizeChartAll);
