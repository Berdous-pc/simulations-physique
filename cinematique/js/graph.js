// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  graph.js — Graphe x(t), vₓ(t) ou aₓ(t) : courbes des voitures écrites
//  au fil de la course, chronomètre, tangentes et réticule.
//  Dépend de sim.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// Géométrie du dernier tracé : piste.js la lit pour aligner les voitures
// sur leur point de courbe, et les interactions souris pour convertir
// pixels → unités.
var geoGraph = null;

// ══════════════════════════════════════════════════════════════════════
//  Repère (repris de la page Dérivée) : deux axes fléchés tracés DANS la
//  fenêtre graphique, qui portent eux-mêmes graduations et noms.
//  Renvoie la géométrie du tracé + les deux fonctions de conversion.
// ══════════════════════════════════════════════════════════════════════

function dessineRepere(ctx, W, H, o) {
  var s = echelleTexte(W, H);
  var padL = Math.max(14, Math.min(24, W * 0.02));
  var padR = Math.max(30, Math.min(60, W * 0.07));
  var padT = Math.max(26, Math.min(48, H * 0.09));
  var padB = Math.max(26, Math.min(46, H * 0.09));

  var x0 = padL, y0 = H - padB;
  var plotW = W - padL - padR, plotH = H - padT - padB;
  if (plotW < 40 || plotH < 40) return null;

  var tMin = o.tMin, tMax = o.tMax, zMin = o.zMin, zMax = o.zMax;
  var dT = tMax - tMin, dZ = zMax - zMin;

  function gx(t) { return x0 + (t - tMin) / dT * plotW; }
  function gy(z) { return y0 - (z - zMin) / dZ * plotH; }

  // ── Fond de la fenêtre graphique ──
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x0, padT, plotW, plotH);

  // ── Position des deux axes (plaqués au bord si zéro est hors cadre) ──
  var xAxeY = Math.max(padT, Math.min(y0, gy(0)));
  var yAxeX = Math.max(x0, Math.min(x0 + plotW, gx(0)));

  // Côté des graduations : sous l'axe horizontal et à gauche de l'axe
  // vertical, sauf si l'axe est collé au bord.
  var labSousX = (xAxeY < y0 - 20 * s);
  var labGaucheY = (yAxeX > x0 + 40 * s);

  var stepX = tickStep(dT, Math.max(3, Math.round(plotW / (110 * s))));
  var stepY = tickStep(dZ, Math.max(3, Math.round(plotH / (60 * s))));
  var tTick = Math.round(15 * s);
  var fontTick = tTick + 'px monospace';
  var v, i, px, py, b;

  // ── Encombrement des noms d'axes, calculé AVANT les graduations ──
  var tAxe = Math.round(17 * s);
  var fontAxe = '700 ' + tAxe + 'px "Segoe UI", Arial, sans-serif';
  ctx.font = fontAxe;
  var wX = ctx.measureText(o.xLabel).width, wY = ctx.measureText(o.yLabel).width;
  var xTitre = x0 + plotW + padR * 0.55, yTitre = padT - padT * 0.45;
  var boiteX = { x1: xTitre - wX - 4 * s, x2: xTitre + 4 * s,
                 y1: xAxeY + 6 * s, y2: xAxeY + 10 * s + tAxe * 1.3 };
  var boiteY = { x1: yAxeX + 4 * s, x2: yAxeX + 8 * s + wY + 4 * s,
                 y1: yTitre - 4 * s, y2: yTitre + tAxe * 1.3 };

  // ── Grille légère ──
  ctx.strokeStyle = COUL.grille;
  ctx.lineWidth = 1;
  for (i = Math.ceil(tMin / stepX); i * stepX <= tMax; i++) {
    px = gx(i * stepX);
    ctx.beginPath(); ctx.moveTo(px, padT); ctx.lineTo(px, y0); ctx.stroke();
  }
  for (i = Math.ceil(zMin / stepY); i * stepY <= zMax; i++) {
    py = gy(i * stepY);
    ctx.beginPath(); ctx.moveTo(x0, py); ctx.lineTo(x0 + plotW, py); ctx.stroke();
  }

  // ── Les deux axes, fléchés ──
  ctx.strokeStyle = COUL.axe;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(x0, xAxeY);        ctx.lineTo(x0 + plotW + padR * 0.55, xAxeY);
  ctx.moveTo(yAxeX, y0);        ctx.lineTo(yAxeX, padT - padT * 0.45);
  ctx.stroke();
  pointeFleche(ctx, x0 + plotW + padR * 0.55, xAxeY, 1, 0, 9 * s, COUL.axe);
  pointeFleche(ctx, yAxeX, padT - padT * 0.45, 0, -1, 9 * s, COUL.axe);

  // ── Graduations portées par les axes ──
  // texteCartouche() repose son propre trait (halo blanc) : couleur et
  // épaisseur du trait sont réarmées à CHAQUE tour de boucle.
  for (i = Math.ceil(tMin / stepX); i * stepX <= tMax; i++) {
    v = i * stepX;
    px = gx(v);
    ctx.strokeStyle = COUL.axe;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(px, xAxeY - 4 * s); ctx.lineTo(px, xAxeY + 4 * s);
    ctx.stroke();
    ctx.font = fontTick;
    b = boiteT({ xAxeY: xAxeY }, px, ctx.measureText(fmtTick(v, stepX)).width,
               tTick * 1.2, labSousX, s);
    if (chevauche(b, boiteX) || chevauche(b, boiteY)) continue;
    texteCartouche(ctx, fmtTick(v, stepX), px,
                   labSousX ? xAxeY + 7 * s : xAxeY - 7 * s,
                   COUL.label, fontTick, 'center', labSousX ? 'top' : 'bottom');
  }
  for (i = Math.ceil(zMin / stepY); i * stepY <= zMax; i++) {
    v = i * stepY;
    // Le zéro est déjà écrit par l'axe des abscisses : ne pas le doubler.
    if (Math.abs(v) < stepY * 1e-6 && tMin < 0 && tMax > 0) continue;
    py = gy(v);
    ctx.strokeStyle = COUL.axe;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(yAxeX - 4 * s, py); ctx.lineTo(yAxeX + 4 * s, py);
    ctx.stroke();
    ctx.font = fontTick;
    b = boiteV({ yAxeX: yAxeX }, py, ctx.measureText(fmtTick(v, stepY)).width,
               tTick * 1.2, s, labGaucheY);
    if (chevauche(b, boiteX) || chevauche(b, boiteY)) continue;
    texteCartouche(ctx, fmtTick(v, stepY),
                   labGaucheY ? yAxeX - 7 * s : yAxeX + 7 * s, py,
                   COUL.label, fontTick, labGaucheY ? 'right' : 'left', 'middle');
  }

  // ── Noms des axes, au bout de chaque flèche ──
  texteCartouche(ctx, o.xLabel, xTitre, xAxeY + 10 * s,
                 COUL.texte, fontAxe, 'right', 'top');
  texteCartouche(ctx, o.yLabel, yAxeX + 8 * s, yTitre,
                 COUL.texte, fontAxe, 'left', 'top');

  return { x0: x0, y0: y0, padT: padT, plotW: plotW, plotH: plotH,
           gx: gx, gy: gy, s: s,
           tMin: tMin, tMax: tMax, zMin: zMin, zMax: zMax,
           padL: padL, padR: padR,
           xAxeY: xAxeY, yAxeX: yAxeX,
           boiteTitreX: boiteX, boiteTitreY: boiteY,
           labSousX: labSousX, labGaucheY: labGaucheY };
}

// Encombrement des étiquettes de graduation, et test de recouvrement.
function boiteT(g, xc, w, h, sous, s) {
  var yh = sous ? g.xAxeY + 8 * s : g.xAxeY - 8 * s - h;
  return { x1: xc - w / 2, x2: xc + w / 2, y1: yh, y2: yh + h };
}
function boiteV(g, y, w, h, s, aGauche) {
  var xg = aGauche ? g.yAxeX - 8 * s - w : g.yAxeX + 8 * s;
  return { x1: xg, x2: xg + w, y1: y - h / 2, y2: y + h / 2 };
}
function chevauche(a, b) {
  if (!a || !b) return false;
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

// ══════════════════════════════════════════════════════════════════════
//  Tracé du graphe
// ══════════════════════════════════════════════════════════════════════

// Survol souris (pixels CSS du canevas) et croix de fermeture des
// tangentes figées, remplies à chaque tracé.
var graphHover = null;
var tangenteCrossZones = [];
var hoverCrossIdx = -1;

// Date jusqu'à laquelle la courbe d'une voiture est écrite : la date de la
// course, arrêtée à la sortie de piste pour une voiture qui recule.
function tTraceVoiture(v) { return Math.max(0, tEffectif(v, sim.t)); }

function drawGraph() {
  var canvas = document.getElementById('canvas-graph');
  if (!sizeCanvas(canvas)) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);

  var o = vueGraphe();
  o.xLabel = 't (s)';
  o.yLabel = nomMode() + ' (' + uniteMode() + ')';
  var g = dessineRepere(ctx, W, H, o);
  geoGraph = g;
  if (!g) return;
  var s = g.s;

  // ── Courbes, découpées au cadre ──
  ctx.save();
  ctx.beginPath();
  ctx.rect(g.x0, g.padT, g.plotW, g.plotH);
  ctx.clip();

  sim.voitures.forEach(function (v, i) {
    var tEnd = tTraceVoiture(v);
    if (tEnd <= 0) return;
    // Un point par pixel environ sur la portion écrite.
    var N = Math.max(2, Math.ceil(g.plotW * tEnd / (g.tMax - g.tMin)));
    ctx.strokeStyle = COUL_VOITURES[i].coul;
    ctx.lineWidth = 2.6 * s;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var k = 0; k <= N; k++) {
      var t = tEnd * k / N;
      var px = g.gx(t);
      var py = Math.max(-1e4, Math.min(1e4, g.gy(valeurMode(v, t))));
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  });

  // ── Tangentes : figées, puis celle qui suit le curseur ──
  var etiquettes = [];
  tangenteCrossZones = [];
  sim.tangentesFig.forEach(function (f, fi) {
    var v = sim.voitures[f.idx];
    // Rembobiner efface la courbe : la tangente attend qu'elle revienne.
    if (!v || f.t > tTraceVoiture(v) + 1e-9) return;
    etiquettes.push({ f: f, fi: fi });
    traceTangente(ctx, g, f.idx, f.t, true);
  });
  // Course entamée (lecture, pause ou rembobinage) : la tangente suit le
  // point courant de chaque voiture (bout de crayon). Avant le départ et
  // course terminée, elle suit le curseur. _rewind est posé par ui.js.
  var enCours = sim.play || _rewind || (sim.t > 0 && !sim.fini);
  var courantes = [];
  if (sim.tangente && enCours) {
    sim.voitures.forEach(function (v, i) {
      var tc = tTraceVoiture(v);
      if (tc <= 0) return;
      courantes.push({ idx: i, t: tc });
      traceTangente(ctx, g, i, tc, false);
    });
  }
  var apercu = null;
  if (sim.tangente && !enCours && graphHover && hoverCrossIdx < 0) {
    apercu = pointCourbeProche(g, graphHover.x, graphHover.y);
    if (apercu) traceTangente(ctx, g, apercu.idx, apercu.t, false);
  }
  // Sans outil actif : le survol d'une courbe lit les coordonnées du point.
  var lecture = null;
  if (!sim.tangente && !sim.reticule && graphHover && hoverCrossIdx < 0) {
    lecture = pointCourbeProche(g, graphHover.x, graphHover.y);
    if (lecture) projectionsPoint(ctx, g, lecture.idx, lecture.t);
  }

  ctx.restore();

  // ── Bouts de crayon, et report horizontal vers la piste en x(t) ──
  sim.voitures.forEach(function (v, i) {
    var tEnd = tTraceVoiture(v);
    var x = g.gx(tEnd), y = g.gy(valeurMode(v, tEnd));
    if (y < g.padT - 1 || y > g.y0 + 1) return;
    if (sim.mode === 'x') traitVersPiste(ctx, g, W, x, y, COUL_VOITURES[i].coul);
    pastille(ctx, x, y, 6 * s, COUL_VOITURES[i].coul);
  });

  // ── Étiquettes des tangentes, par-dessus tout ──
  etiquettes.forEach(function (e) {
    var cz = etiquetteTangente(ctx, g, e.f.idx, e.f.t, hoverCrossIdx === e.fi);
    if (cz) tangenteCrossZones.push({ idx: e.fi, x: cz.x, y: cz.y, r: cz.r });
  });
  courantes.forEach(function (c) {
    etiquetteTangente(ctx, g, c.idx, c.t, false, true);
  });
  if (apercu) etiquetteTangente(ctx, g, apercu.idx, apercu.t, false, true);
  if (lecture) etiquetteTangente(ctx, g, lecture.idx, lecture.t, false, true, true);

  dessineChronometre(ctx, g);
  dessineReticule(ctx, g, canvas);
}

// Pointillé du bout de la courbe jusqu'au bord droit du canevas, où la
// piste le reprend jusqu'au centre de la voiture : c'est la même position
// x, lue une fois sur le graphe et une fois sur la piste.
function traitVersPiste(ctx, g, W, x, y, couleur) {
  var s = g.s;
  ctx.save();
  ctx.strokeStyle = couleur;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 1.6 * s;
  ctx.setLineDash([6 * s, 4 * s]);
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(W, y);
  ctx.stroke();
  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════
//  Chronomètre (même cartouche que le décollage de la page Dérivée)
//  Posé en haut à GAUCHE : en x(t) les courbes montent vers la droite, et
//  le coin droit porte déjà les boutons Tangente / réticule.
// ══════════════════════════════════════════════════════════════════════

function dessineChronometre(ctx, g) {
  var s = g.s;
  var txt = fmtFr(sim.t, 2) + ' s';
  var sous = sim.fini ? 'course terminée'
           : sim.play ? 'course en cours'
           : sim.t > 0 ? 'en pause' : 'prêt au départ';

  var fBig = '700 ' + Math.round(24 * s) + 'px "Segoe UI", Arial, sans-serif';
  var fSm  = Math.round(12 * s) + 'px "Segoe UI", Arial, sans-serif';
  ctx.font = fBig;
  var w = ctx.measureText('000,00 s').width;
  ctx.font = fSm;
  w = Math.max(w, ctx.measureText(sous).width) + 20 * s;
  var h = 46 * s;
  // Décalé de l'axe vertical : ses graduations s'écrivent à sa droite.
  var bx = g.yAxeX + 58 * s;
  var by = Math.max(g.padT + 8 * s, g.boiteTitreY.y2 + 6 * s);

  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.strokeStyle = COUL.accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(bx, by, w, h);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COUL.accent;
  ctx.font = fBig;
  ctx.fillText(txt, bx + w / 2, by + 16 * s);
  ctx.fillStyle = COUL.label;
  ctx.font = fSm;
  ctx.fillText(sous, bx + w / 2, by + 34 * s);
}

// ══════════════════════════════════════════════════════════════════════
//  Tangente (charte : radioactivité)
//  Un clic sur une courbe fige la tangente au point visé ; sa pente est
//  la DÉRIVÉE exacte — vₓ sur x(t), aₓ sur vₓ(t).
// ══════════════════════════════════════════════════════════════════════

// Point écrit de courbe le plus proche du curseur (moins de 45 px), ou null.
function pointCourbeProche(g, hx, hy) {
  if (hx < g.x0 || hx > g.x0 + g.plotW || hy < g.padT || hy > g.y0) return null;
  var best = null, bestD = 45;
  sim.voitures.forEach(function (v, i) {
    var tEnd = tTraceVoiture(v);
    if (tEnd <= 0) return;
    var N = Math.max(40, Math.ceil(g.plotW * tEnd / (g.tMax - g.tMin)));
    for (var k = 0; k <= N; k++) {
      var t = tEnd * k / N;
      var d = Math.hypot(g.gx(t) - hx, g.gy(valeurMode(v, t)) - hy);
      if (d < bestD) { bestD = d; best = { idx: i, t: t }; }
    }
  });
  return best;
}

// Demi-longueur de la tangente, en fraction de l'axe des temps.
var DEMI_TANGENTE = 0.15;

function traceTangente(ctx, g, idx, t, figee) {
  var v = sim.voitures[idx];
  var y0 = valeurMode(v, t), p = penteMode(v, t);
  var demi = (g.tMax - g.tMin) * DEMI_TANGENTE;
  var ax = g.gx(t - demi), ay = g.gy(y0 - p * demi);
  var bx = g.gx(t + demi), by = g.gy(y0 + p * demi);
  var ep = (figee ? 3 : 2.6) * g.s;
  // Tirets sombres : la tangente se distingue de sa courbe même quand elle
  // se confond avec (mouvement uniforme en x(t)).
  // La couleur de la voiture reste sur la pastille et l'étiquette.
  ctx.save();
  ctx.strokeStyle = figee ? '#2c3e50' : 'rgba(44,62,80,0.8)';
  ctx.lineWidth = ep;
  ctx.setLineDash([9 * g.s, 5 * g.s]);
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.restore();
}

// Lecture d'un point de courbe : pointillés jusqu'aux deux axes, comme
// on lit une coordonnée sur un graphe papier.
function projectionsPoint(ctx, g, idx, t) {
  var px = g.gx(t), py = g.gy(valeurMode(sim.voitures[idx], t));
  ctx.save();
  ctx.strokeStyle = COUL_VOITURES[idx].coul;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 1.4 * g.s;
  ctx.setLineDash([5 * g.s, 4 * g.s]);
  ctx.beginPath();
  ctx.moveTo(px, py); ctx.lineTo(px, g.xAxeY);
  ctx.moveTo(px, py); ctx.lineTo(g.yAxeX, py);
  ctx.stroke();
  ctx.restore();
}

function tanFontSize(gW) {
  return Math.max(11, Math.min(26, Math.round(26 * gW / 1500)));
}

// Position de l'étiquette qui recouvre le moins de courbe : on essaie les
// quatre coins autour du point, de plus en plus loin, et on compte les
// points des courbes écrites (et de la tangente) tombant dans la boîte.
function placeEtiquette(g, idx, t, px, py, w, h, avecTangente) {
  var pts = [];
  sim.voitures.forEach(function (v) {
    var tEnd = tTraceVoiture(v);
    if (tEnd <= 0) return;
    var N = Math.max(40, Math.ceil(g.plotW * tEnd / (g.tMax - g.tMin) / 3));
    for (var k = 0; k <= N; k++) {
      var tk = tEnd * k / N;
      pts.push([g.gx(tk), g.gy(valeurMode(v, tk))]);
    }
  });
  if (avecTangente) {
    var v = sim.voitures[idx], y0 = valeurMode(v, t), p = penteMode(v, t);
    var demi = (g.tMax - g.tMin) * DEMI_TANGENTE;
    for (var j = -40; j <= 40; j++) {
      var dt = demi * j / 40;
      pts.push([g.gx(t + dt), g.gy(y0 + p * dt)]);
    }
  }
  var M = 4;
  function score(x, y) {
    var n = 0;
    for (var i = 0; i < pts.length; i++) {
      var q = pts[i];
      if (q[0] > x - M && q[0] < x + w + M && q[1] > y - M && q[1] < y + h + M) n++;
    }
    return n;
  }
  var xMin = g.x0 + 2, xMax = g.x0 + g.plotW - w - 2;
  var yMin = g.padT + 2, yMax = g.y0 - h - 2;
  var best = null;
  [12, 40, 80, 130].forEach(function (d) {
    [[1, -1], [-1, -1], [1, 1], [-1, 1]].forEach(function (c) {
      var x = c[0] > 0 ? px + d : px - d - w;
      var y = c[1] < 0 ? py - d - h : py + d;
      x = Math.max(xMin, Math.min(xMax, x));
      y = Math.max(yMin, Math.min(yMax, y));
      // À score égal, on préfère la position la plus proche du point.
      var sc = score(x, y) * 1000 + d;
      if (!best || sc < best.sc) best = { x: x, y: y, sc: sc };
    });
  });
  return best;
}

// Étiquette : coordonnées du point et pente. Renvoie la zone de la croix
// de fermeture (tangente figée uniquement).
function etiquetteTangente(ctx, g, idx, t, survol, apercu, sansPente) {
  var v = sim.voitures[idx];
  var coul = COUL_VOITURES[idx].coul;
  var px = g.gx(t), py = g.gy(valeurMode(v, t));
  var unitePente = sim.mode === 'x' ? 'm/s' : sim.mode === 'v' ? 'm/s²' : 'm/s³';
  var line1 = 't = ' + fmtSmart(t) + ' s ; ' + nomMode() + ' = ' +
              fmtSmart(valeurMode(v, t)) + ' ' + uniteMode();
  var line2 = 'Pente : ' + fmtSmart(penteMode(v, t)) + ' ' + unitePente;

  ctx.save();
  ctx.fillStyle = coul;
  ctx.shadowColor = coul;
  ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  var fs = tanFontSize(g.plotW);
  ctx.font = fs + 'px monospace';
  var lw = sansPente ? ctx.measureText(line1).width
                     : Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width);
  var PAD = Math.round(fs * 0.3), LINE_H = Math.round(fs * 1.25);
  var CROSS_W = apercu ? 0 : Math.round(fs * 0.9);
  var boxW = lw + PAD * 2 + CROSS_W, boxH = LINE_H * (sansPente ? 1 : 2) + PAD * 2;

  var pos = placeEtiquette(g, idx, t, px, py, boxW, boxH, !sansPente);
  var lx = pos.x, ly = pos.y;

  ctx.fillStyle = 'rgba(44,62,80,0.88)';
  ctx.beginPath(); ctx.roundRect(lx, ly, boxW, boxH, 4); ctx.fill();
  ctx.strokeStyle = coul; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(lx, ly, boxW, boxH, 4); ctx.stroke();

  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(line1, lx + PAD, ly + PAD + LINE_H / 2);
  if (!sansPente) {
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.fillText(line2, lx + PAD, ly + PAD + LINE_H * 1.5);
  }

  var zone = null;
  if (!apercu) {
    var cx = lx + boxW - CROSS_W / 2, cy = ly + LINE_H / 2;
    if (survol) {
      ctx.fillStyle = 'rgba(220,60,60,0.85)';
      ctx.beginPath(); ctx.arc(cx, cy, CROSS_W * 0.52, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.60)';
    }
    ctx.font = 'bold ' + Math.round(fs * 0.72) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✕', cx, cy);
    zone = { x: cx, y: cy, r: Math.max(10, CROSS_W) };
  }
  ctx.restore();
  return zone;
}

// ══════════════════════════════════════════════════════════════════════
//  Réticule libre : lignes croisées et bulle de coordonnées
// ══════════════════════════════════════════════════════════════════════

function dessineReticule(ctx, g, canvas) {
  var tip = document.getElementById('reticule-tooltip');
  var h = graphHover;
  if (!sim.reticule || !h ||
      h.x < g.x0 || h.x > g.x0 + g.plotW || h.y < g.padT || h.y > g.y0) {
    tip.style.display = 'none';
    return;
  }
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = 'rgba(44,62,80,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(h.x, g.padT); ctx.lineTo(h.x, g.y0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(g.x0, h.y); ctx.lineTo(g.x0 + g.plotW, h.y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#2c3e50';
  ctx.beginPath(); ctx.arc(h.x, h.y, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  var t = g.tMin + (h.x - g.x0) / g.plotW * (g.tMax - g.tMin);
  var z = g.zMin + (g.y0 - h.y) / g.plotH * (g.zMax - g.zMin);
  var r = canvas.getBoundingClientRect();
  tip.innerHTML = 't = ' + fmtSmart(t) + ' s<br>' +
                  nomMode() + ' = ' + fmtSmart(z) + ' ' + uniteMode();
  tip.style.display = 'block';
  tip.style.left = (r.left + h.x + 14) + 'px';
  tip.style.top  = (r.top + h.y - 10) + 'px';
}

// ══════════════════════════════════════════════════════════════════════
//  Interactions souris sur le graphe
// ══════════════════════════════════════════════════════════════════════

function initGraphSouris() {
  var canvas = document.getElementById('canvas-graph');
  if (!canvas) return;

  function pos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener('pointermove', function (e) {
    graphHover = pos(e);
    hoverCrossIdx = -1;
    for (var i = 0; i < tangenteCrossZones.length; i++) {
      var cz = tangenteCrossZones[i];
      if (Math.hypot(graphHover.x - cz.x, graphHover.y - cz.y) < cz.r) {
        hoverCrossIdx = cz.idx; break;
      }
    }
    canvas.style.cursor = hoverCrossIdx >= 0 ? 'pointer'
                        : (sim.tangente || sim.reticule) ? 'crosshair' : 'default';
    requestDraw();
  });

  canvas.addEventListener('pointerleave', function () {
    graphHover = null;
    hoverCrossIdx = -1;
    requestDraw();
  });

  canvas.addEventListener('click', function (e) {
    var p = pos(e);
    // Croix d'une étiquette : supprime la tangente correspondante.
    for (var i = 0; i < tangenteCrossZones.length; i++) {
      var cz = tangenteCrossZones[i];
      if (Math.hypot(p.x - cz.x, p.y - cz.y) < cz.r) {
        sim.tangentesFig.splice(cz.idx, 1);
        hoverCrossIdx = -1;
        requestDraw();
        return;
      }
    }
    if (!sim.tangente || !geoGraph) return;
    var pt = pointCourbeProche(geoGraph, p.x, p.y);
    if (pt) {
      sim.tangentesFig.push({ idx: pt.idx, t: pt.t });
      requestDraw();
    }
  });
}
