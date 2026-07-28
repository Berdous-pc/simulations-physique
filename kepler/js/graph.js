// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  graph.js — Graphe de la 3ᵉ loi (onglet 3)
//  Dépend de sim.js. Trace les points (a^p, T^q) des corps du système
//  sélectionné ; p et q sont choisis par l'utilisateur via les sélecteurs
//  posés contre chaque axe. Quand les points sont alignés avec l'origine
//  (T² en fonction de a³ !), une droite modèle et la valeur de k
//  s'affichent automatiquement.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// Positions écran des points tracés, mémorisées pour la bulle de survol.
var _pts3 = [];

// ── Zoom molette ────────────────────────────────────────────────────────
// Facteur appliqué aux étendues xRange/yRange : l'origine (0,0) reste au
// même endroit à l'écran (coin bas-gauche du cadre), donc zoomer resserre
// la vue AUTOUR de l'origine — exactement ce qu'il faut pour distinguer des
// astres tassés près de 0. Le dézoom est plafonné à 1 : c'est le cadre
// complet (calculé sur les données) déjà implémenté avant l'ajout du zoom.
var _graph3Zoom = 1;
var GRAPH3_ZOOM_MAX = 40;

function resetGraph3Zoom() { _graph3Zoom = 1; }

// ── Formatage d'une graduation (groupement des milliers, virgule décimale) ──
function fmtTick(v, step) {
  var dec = step >= 1 ? 0 : Math.min(3, -Math.floor(Math.log10(step)));
  var s = v.toFixed(dec);
  var parts = s.split('.');
  // Espace fine insécable tous les 3 chiffres (4 500 000)
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return parts.join(',');
}

// Pas « rond » pour ~5 graduations sur l'étendue donnée.
function tickStep(range) {
  var brut = range / 5;
  var pow10 = Math.pow(10, Math.floor(Math.log10(brut)));
  var m = brut / pow10;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7 ? 5 : 10) * pow10;
}

// Facteur d'échelle d'axe : au-delà de 4 chiffres, les graduations sont
// divisées par 10³ (ou 10⁶) et le titre d'axe l'indique — sinon T³ pour
// Jupiter → Neptune (~4,5 millions d'an³) donne des graduations à 9
// chiffres qui débordent sur le sélecteur d'axe.
function _axisExp(range) {
  var exp = 0;
  while (range / Math.pow(10, exp) >= 10000) exp += 3;
  return exp;
}

function _puissanceTxt(exp) {
  var sup = { 3: '³', 6: '⁶', 9: '⁹' };
  return exp ? '10' + sup[exp] + ' ' : '';
}

// ══════════════════════════════════════════════════════════════════════
//  Tracé du graphe
// ══════════════════════════════════════════════════════════════════════

function drawGraph3() {
  var canvas = document.getElementById('canvas-graph3');
  if (!sizeCanvas(canvas)) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);

  var sys = SYSTEMES[sys3.sysIdx];
  var p = sys3.axeX, q = sys3.axeY;

  // ── Données : (a^p, T^q) pour chaque corps ──
  var pts = sys.corps.map(function (cps) {
    return { corps: cps, x: Math.pow(cps.a, p), y: Math.pow(cps.T, q) };
  });
  var xMax = 0, yMax = 0;
  pts.forEach(function (pt) {
    xMax = Math.max(xMax, pt.x);
    yMax = Math.max(yMax, pt.y);
  });
  // Étendue du cadre COMPLET (zoom = 1), puis vue réellement affichée après
  // application du zoom molette — tout le reste du tracé (grille, axes,
  // points, droite modèle) travaille sur cette vue.
  var xRangeFull = xMax * 1.15, yRangeFull = yMax * 1.15;
  var xRange = xRangeFull / _graph3Zoom, yRange = yRangeFull / _graph3Zoom;

  // ── Cadre de tracé (marges pour les sélecteurs d'axes et graduations) ──
  var padL = Math.min(104, Math.max(84, W * 0.16));
  var padR = 24, padT = 38, padB = 58;
  var x0 = padL, y0 = H - padB;                       // origine
  var plotW = W - padL - padR, plotH = H - padT - padB;
  if (plotW < 60 || plotH < 60) return;

  function gx(x) { return x0 + (x / xRange) * plotW; }
  function gy(y) { return y0 - (y / yRange) * plotH; }

  var xLab = labelPow('a', p), yLab = labelPow('T', q);
  var xUnit = labelPow(sys.uniteA, p), yUnit = labelPow(sys.uniteT, q);
  var expX = _axisExp(xRange), expY = _axisExp(yRange);
  var divX = Math.pow(10, expX), divY = Math.pow(10, expY);

  // ── Grille + graduations ──
  ctx.font = '12px monospace';
  ctx.fillStyle = '#5a6a78';
  var stepX = tickStep(xRange);
  var stepY = tickStep(yRange);
  ctx.strokeStyle = '#e8e5de';
  ctx.lineWidth = 1;
  var v;
  for (v = stepX; v <= xRange; v += stepX) {
    ctx.beginPath();
    ctx.moveTo(gx(v), y0);
    ctx.lineTo(gx(v), padT);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(fmtTick(v / divX, stepX / divX), gx(v), y0 + 6);
  }
  for (v = stepY; v <= yRange; v += stepY) {
    ctx.beginPath();
    ctx.moveTo(x0, gy(v));
    ctx.lineTo(W - padR, gy(v));
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmtTick(v / divY, stepY / divY), x0 - 6, gy(v));
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('0', x0 - 6, y0 + 6);

  // ── Axes fléchés ──
  ctx.strokeStyle = '#5a6a78';
  ctx.fillStyle = '#5a6a78';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(W - padR + 6, y0);
  ctx.moveTo(x0, y0); ctx.lineTo(x0, padT - 6);
  ctx.stroke();
  ctx.beginPath();                                    // pointe axe x
  ctx.moveTo(W - padR + 6, y0);
  ctx.lineTo(W - padR - 2, y0 - 4);
  ctx.lineTo(W - padR - 2, y0 + 4);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();                                    // pointe axe y
  ctx.moveTo(x0, padT - 6);
  ctx.lineTo(x0 - 4, padT + 2);
  ctx.lineTo(x0 + 4, padT + 2);
  ctx.closePath(); ctx.fill();

  // ── Titres d'axes ──
  ctx.font = '700 14px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#2c3e50';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(yLab + ' (' + _puissanceTxt(expY) + yUnit + ')', Math.max(8, x0 - 44), padT - 14);
  ctx.textAlign = 'right';
  ctx.fillText(xLab + ' (' + _puissanceTxt(expX) + xUnit + ')', W - padR, y0 + 44);

  // ── Ajustement proportionnel y = k·x : les points sont-ils alignés
  //    avec l'origine ? (vrai uniquement pour T² en fonction de a³) ──
  var sxy = 0, sxx = 0;
  pts.forEach(function (pt) { sxy += pt.x * pt.y; sxx += pt.x * pt.x; });
  var k = sxy / sxx;
  var residuMax = 0;
  pts.forEach(function (pt) {
    residuMax = Math.max(residuMax, Math.abs(pt.y - k * pt.x) / yMax);
  });
  var alignes = residuMax < 0.02;

  // Au-delà de zoom = 1, des points (et la droite modèle) peuvent sortir du
  // cadre : on les découpe proprement plutôt que de laisser déborder sur
  // les graduations ou les sélecteurs d'axes.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, padT, plotW, plotH);
  ctx.clip();

  if (alignes) {
    // Droite modèle en pointillés, de l'origine au bord du cadre
    var xFin = Math.min(xRange, yRange / k);
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = '#2a6aaa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx(0), gy(0));
    ctx.lineTo(gx(xFin), gy(k * xFin));
    ctx.stroke();
    ctx.setLineDash([]);

    // Encart : loi mise en évidence + valeur de k. Posé en haut à gauche
    // du cadre : la droite y = kx laisse cette zone libre.
    var kUnit = yUnit + '/' + xUnit;
    var l1 = '✓ Les points sont alignés avec l’origine !';
    var l2 = yLab + ' = k × ' + xLab;
    var l3 = 'k = ' + fmtSmart(k) + ' ' + kUnit;
    ctx.font = '700 13px "Segoe UI", Arial, sans-serif';
    var bw = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width,
                      ctx.measureText(l3).width) + 22;
    var bx = x0 + 10, by = padT + 8, bh = 66;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = '#2a8a50';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 6);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#2a8a50';
    ctx.fillText(l1, bx + 11, by + 14);
    ctx.fillStyle = '#2c3e50';
    ctx.fillText(l2, bx + 11, by + 33);
    ctx.fillText(l3, bx + 11, by + 52);
  }

  // ── Points + noms des corps ──
  _pts3 = [];
  ctx.font = '700 12px "Segoe UI", Arial, sans-serif';
  pts.forEach(function (pt) {
    var px = gx(pt.x), py = gy(pt.y);
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, 2 * Math.PI);
    ctx.fillStyle = pt.corps.couleur;
    ctx.fill();
    ctx.strokeStyle = 'rgba(44,62,80,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Étiquette : à droite du point, sauf près du bord droit ou du haut
    var alignDroite = px > W - padR - 80;
    var dy = py < padT + 22 ? 17 : -10;
    ctx.textAlign = alignDroite ? 'right' : 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pt.corps.couleur;
    ctx.fillText(pt.corps.nom, px + (alignDroite ? -10 : 10), py + dy);
    _pts3.push({ px: px, py: py, pt: pt, visible: px >= x0 && px <= W - padR && py >= padT && py <= y0 });
  });
  ctx.restore();

  // ── Indicateur de zoom (visible dès qu'on s'écarte du cadre complet) ──
  if (_graph3Zoom > 1.01) {
    ctx.font = '700 12px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#7a8a96';
    ctx.fillText('🔍 × ' + fmtSmart(_graph3Zoom), W - padR, 6);
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Sélecteurs d'axes (appelés depuis index.html)
// ══════════════════════════════════════════════════════════════════════

function setAxeX(pow) {
  if (sys3.axeX === pow) return;
  sys3.axeX = pow;
  for (var n = 1; n <= 3; n++) {
    document.getElementById('axeX-' + n).classList.toggle('active', n === pow);
  }
  resetGraph3Zoom();     // l'étendue des données change du tout au tout
  drawGraph3();
}

function setAxeY(pow) {
  if (sys3.axeY === pow) return;
  sys3.axeY = pow;
  for (var n = 1; n <= 3; n++) {
    document.getElementById('axeY-' + n).classList.toggle('active', n === pow);
  }
  resetGraph3Zoom();
  drawGraph3();
}

// ══════════════════════════════════════════════════════════════════════
//  Bulle de survol des points
// ══════════════════════════════════════════════════════════════════════

function initGraph3Tooltip() {
  var canvas = document.getElementById('canvas-graph3');
  var tip = document.getElementById('graph3-tooltip');

  canvas.addEventListener('mousemove', function (ev) {
    var mx = ev.offsetX, my = ev.offsetY;
    var best = null, bestD = 20;                     // rayon de capture : 20 px
    _pts3.forEach(function (e) {
      if (!e.visible) return;                        // point découpé par le zoom
      var d = Math.hypot(e.px - mx, e.py - my);
      if (d < bestD) { bestD = d; best = e; }
    });
    if (!best) { tip.style.display = 'none'; return; }

    var sys = SYSTEMES[sys3.sysIdx];
    var xLab = labelPow('a', sys3.axeX), yLab = labelPow('T', sys3.axeY);
    tip.textContent = best.pt.corps.nom + ' : ' +
      xLab + ' = ' + fmtSmart(best.pt.x) + ' ' + labelPow(sys.uniteA, sys3.axeX) + ' ; ' +
      yLab + ' = ' + fmtSmart(best.pt.y) + ' ' + labelPow(sys.uniteT, sys3.axeY);
    tip.style.display = 'block';
    // Position : au-dessus du curseur, rabattue si elle sort du cadre
    var wrap = canvas.parentElement;
    var left = mx + 14, top = my - 34;
    if (left + tip.offsetWidth > wrap.clientWidth - 6) {
      left = mx - tip.offsetWidth - 14;
    }
    if (top < 4) top = my + 18;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  });

  canvas.addEventListener('mouseleave', function () {
    tip.style.display = 'none';
  });
}

// ══════════════════════════════════════════════════════════════════════
//  Zoom molette (recadre autour de l'origine, dézoom max = cadre complet)
// ══════════════════════════════════════════════════════════════════════

function initGraph3Wheel() {
  var canvas = document.getElementById('canvas-graph3');
  canvas.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    // Facteur exponentiel : lisse aussi bien à la molette (pas fixe, gros
    // deltaY) qu'au trackpad (deltaY continu, petits pas).
    var facteur = Math.exp(-ev.deltaY * 0.0015);
    _graph3Zoom = Math.min(GRAPH3_ZOOM_MAX, Math.max(1, _graph3Zoom * facteur));
    drawGraph3();
  }, { passive: false });

  // Double-clic : retour rapide au cadre complet.
  canvas.addEventListener('dblclick', function () {
    resetGraph3Zoom();
    drawGraph3();
  });
}
