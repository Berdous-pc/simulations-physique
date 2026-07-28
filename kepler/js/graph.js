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
  var xRange, yRange;
  if (sys.zoomMax && sys3.graphZoomLinked) {
    // Système Solaire (zoom lié) : le graphe SUIT le zoom du canvas — il
    // cadre les astres dont l'orbite est encore visible à l'écran (a ≤
    // aVis). Les deux axes se resserrent chacun selon leur exposant, en
    // passant par la 3ᵉ loi elle-même (T = a^1,5 autour du Soleil, en an
    // et ua).
    var aMaxSys = 0;
    sys.corps.forEach(function (cps) { aMaxSys = Math.max(aMaxSys, cps.a); });
    var aVis = aMaxSys / sys3.zoom;
    var tVis = Math.pow(aVis, 1.5);
    xRange = Math.min(xRangeFull, Math.pow(aVis, p) * 1.15);
    yRange = Math.min(yRangeFull, Math.pow(tVis, q) * 1.15);
  } else {
    xRange = xRangeFull / _graph3Zoom;
    yRange = yRangeFull / _graph3Zoom;
  }

  // ── Cadre de tracé (marges pour les sélecteurs d'axes et graduations) ──
  var padL = Math.min(118, Math.max(96, W * 0.18));
  var padR = 24, padT = 42, padB = 82;
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
  ctx.font = '15px monospace';
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
  ctx.font = '700 17px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#2c3e50';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(yLab + ' (' + _puissanceTxt(expY) + yUnit + ')', Math.max(8, x0 - 50), padT - 16);
  ctx.textAlign = 'right';
  ctx.fillText(xLab + ' (' + _puissanceTxt(expX) + xUnit + ')', W - padR, y0 + 50);

  // ── Ajustement proportionnel y = k·x : les points sont-ils alignés
  //    avec l'origine ? Uniquement affiché à la demande (bouton
  //    « Modélisation linéaire ») : aux élèves de juger si ça correspond. ──
  var sxy = 0, sxx = 0;
  pts.forEach(function (pt) { sxy += pt.x * pt.y; sxx += pt.x * pt.x; });
  var k = sxy / sxx;

  // Au-delà de zoom = 1, des points (et la droite modèle) peuvent sortir du
  // cadre : on les découpe proprement plutôt que de laisser déborder sur
  // les graduations ou les sélecteurs d'axes.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, padT, plotW, plotH);
  ctx.clip();

  if (sys3.modelLin) {
    // Droite modèle en pointillés, de l'origine au bord du cadre — tracée
    // qu'elle « colle » ou non aux points : c'est justement ce que l'élève
    // doit observer.
    var xFin = Math.min(xRange, yRange / k);
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = '#5a6a78';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx(0), gy(0));
    ctx.lineTo(gx(xFin), gy(k * xFin));
    ctx.stroke();
    ctx.setLineDash([]);

    // Encart : relation testée + valeur de k. Ton neutre (ni rouge ni
    // vert) : le message ne doit pas révéler si le modèle est pertinent.
    var kUnit = yUnit + '/' + xUnit;
    var l1 = yLab + ' = k × ' + xLab;
    var l2 = 'k = ' + fmtSmart(k) + ' ' + kUnit;
    ctx.font = '700 20px "Segoe UI", Arial, sans-serif';
    var bw = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 32;
    var bx = x0 + 10, by = padT + 8, bh = 72;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = '#7a8a96';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 8);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#2c3e50';
    ctx.fillText(l1, bx + 16, by + 23);
    ctx.fillText(l2, bx + 16, by + 51);
  }

  // ── Points + noms des corps ──
  _pts3 = [];
  ctx.font = '700 15px "Segoe UI", Arial, sans-serif';
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
}

// ══════════════════════════════════════════════════════════════════════
//  Sélecteurs d'axes (appelés depuis index.html)
// ══════════════════════════════════════════════════════════════════════

function _resetModelLin3() {
  sys3.modelLin = false;
  document.getElementById('btn-model-lin-3').classList.remove('active');
}

function setAxeX(pow) {
  if (sys3.axeX === pow) return;
  sys3.axeX = pow;
  for (var n = 1; n <= 3; n++) {
    document.getElementById('axeX-' + n).classList.toggle('active', n === pow);
  }
  resetGraph3Zoom();     // l'étendue des données change du tout au tout
  _resetModelLin3();      // relation testée différente : à revalider
  drawGraph3();
}

function setAxeY(pow) {
  if (sys3.axeY === pow) return;
  sys3.axeY = pow;
  for (var n = 1; n <= 3; n++) {
    document.getElementById('axeY-' + n).classList.toggle('active', n === pow);
  }
  resetGraph3Zoom();
  _resetModelLin3();
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
    // Système Solaire, zoom lié : le graphe étant asservi au zoom du
    // canvas, la molette pilote directement ce dernier (une seule notion
    // de zoom). Zoom délié : le graphe zoome indépendamment, comme les
    // autres systèmes.
    if (SYSTEMES[sys3.sysIdx].zoomMax && sys3.graphZoomLinked) {
      setZoom3(sys3.zoom * facteur);
      return;
    }
    var zMax = SYSTEMES[sys3.sysIdx].zoomMax || GRAPH3_ZOOM_MAX;
    _graph3Zoom = Math.min(zMax, Math.max(1, _graph3Zoom * facteur));
    drawGraph3();
  }, { passive: false });

  // Double-clic : retour rapide au cadre complet.
  canvas.addEventListener('dblclick', function () {
    if (SYSTEMES[sys3.sysIdx].zoomMax && sys3.graphZoomLinked) {
      sys3.zoomCible = 1;                    // dézoom animé vers la vue complète
      return;
    }
    resetGraph3Zoom();
    drawGraph3();
  });
}
