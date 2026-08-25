// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  courbe.js — Graphe principal : courbe f, points A/M/B, sécante,
//  tangente, cotes Δt et Δf. Gère aussi les interactions souris
//  (déplacement du point M, zoom molette, décalage de la vue).
//  Dépend de sim.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// Géométrie du dernier tracé du graphe principal : conservée pour
// convertir les coordonnées souris en coordonnées de la fonction.
var geoCourbe = null;

// ══════════════════════════════════════════════════════════════════════
//  Repère commun aux deux graphes (grille, graduations, cadre, titres)
//  Renvoie la géométrie du tracé + les deux fonctions de conversion.
// ══════════════════════════════════════════════════════════════════════

// Petite pointe de flèche triangulaire au bout d'un axe.
// (dx, dy) est le vecteur unitaire donnant le sens de l'axe.
function pointeFleche(ctx, x, y, dx, dy, t, couleur) {
  ctx.fillStyle = couleur;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - dx * t - dy * t * 0.38, y - dy * t + dx * t * 0.38);
  ctx.lineTo(x - dx * t + dy * t * 0.38, y - dy * t - dx * t * 0.38);
  ctx.closePath();
  ctx.fill();
}

function dessineRepere(ctx, W, H, o) {
  var s = echelleTexte(W, H);
  // Marges réduites : les graduations sont désormais portées par les axes,
  // À L'INTÉRIEUR de la fenêtre. Il ne reste à réserver que la place des
  // pointes de flèches et des noms d'axes.
  var padL = Math.max(26, Math.min(46, W * 0.05));
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

  // ── Position des deux axes ──
  // L'axe est placé à la valeur nulle correspondante ; si zéro n'est pas
  // dans la fenêtre (zoom loin de l'origine), l'axe se plaque contre le
  // bord — comme on décale un axe au bord de la feuille en cours.
  var xAxeY = Math.max(padT, Math.min(y0, gy(0)));          // ordonnée de l'axe des abscisses
  var yAxeX = Math.max(x0, Math.min(x0 + plotW, gx(0)));    // abscisse de l'axe des ordonnées

  // Côté où écrire les graduations : normalement sous l'axe horizontal et à
  // gauche de l'axe vertical ; on bascule de l'autre côté si l'axe est
  // collé au bord, sinon les nombres sortiraient de la fenêtre.
  var labSousX = (xAxeY < y0 - 20 * s);
  var labGaucheY = (yAxeX > x0 + 40 * s);

  var stepX = tickStep(dT, Math.max(3, Math.round(plotW / (110 * s))));
  var stepY = tickStep(dZ, Math.max(3, Math.round(plotH / (60 * s))));
  var fontTick = Math.round(13 * s) + 'px monospace';
  var v, i, px, py;

  // ── Grille légère : aide à la lecture sans concurrencer les axes ──
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

  // ── Les deux axes, tracés DANS la fenêtre et fléchés ──
  ctx.strokeStyle = COUL.axe;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(x0, xAxeY);        ctx.lineTo(x0 + plotW + padR * 0.55, xAxeY);
  ctx.moveTo(yAxeX, y0);        ctx.lineTo(yAxeX, padT - padT * 0.45);
  ctx.stroke();
  pointeFleche(ctx, x0 + plotW + padR * 0.55, xAxeY, 1, 0, 9 * s, COUL.axe);
  pointeFleche(ctx, yAxeX, padT - padT * 0.45, 0, -1, 9 * s, COUL.axe);

  // ── Graduations portées par les axes ──
  // texteCartouche() repose son propre trait (halo blanc) : la couleur et
  // l'épaisseur du trait doivent être réarmées à CHAQUE tour de boucle,
  // sinon les graduations suivantes seraient tracées en blanc.
  for (i = Math.ceil(tMin / stepX); i * stepX <= tMax; i++) {
    v = i * stepX;
    px = gx(v);
    ctx.strokeStyle = COUL.axe;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(px, xAxeY - 4 * s); ctx.lineTo(px, xAxeY + 4 * s);
    ctx.stroke();
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
    texteCartouche(ctx, fmtTick(v, stepY),
                   labGaucheY ? yAxeX - 7 * s : yAxeX + 7 * s, py,
                   COUL.label, fontTick, labGaucheY ? 'right' : 'left', 'middle');
  }

  // ── Noms des axes, posés au bout de chaque flèche ──
  var fontAxe = '700 ' + Math.round(15 * s) + 'px "Segoe UI", Arial, sans-serif';
  texteCartouche(ctx, o.xLabel, x0 + plotW + padR * 0.55, xAxeY + 10 * s,
                 COUL.texte, fontAxe, 'right', 'top');
  texteCartouche(ctx, o.yLabel, yAxeX + 8 * s, padT - padT * 0.45,
                 COUL.texte, fontAxe, 'left', 'top');

  return { x0: x0, y0: y0, padT: padT, plotW: plotW, plotH: plotH,
           gx: gx, gy: gy, s: s,
           tMin: tMin, tMax: tMax, zMin: zMin, zMax: zMax,
           padL: padL, padR: padR };
}

// Titre d'axe « nom (unité) », ou « nom » seul si la grandeur n'a pas d'unité.
function titreAxe(nom, unite) { return unite ? nom + ' (' + unite + ')' : nom; }

// ══════════════════════════════════════════════════════════════════════
//  Tracé du graphe principal
// ══════════════════════════════════════════════════════════════════════

function drawCourbe() {
  var canvas = document.getElementById('canvas-courbe');
  if (!sizeCanvas(canvas)) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);

  var F = fonCourante();
  var g = dessineRepere(ctx, W, H, {
    tMin: vueTMin(), tMax: vueTMax(),
    zMin: vueZMin(), zMax: vueZMax(),
    xLabel: titreAxe(F.varNom, F.varUnite),
    yLabel: titreAxe(F.funNom, F.funUnite)
  });
  if (!g) { geoCourbe = null; return; }
  geoCourbe = g;

  var s = g.s;

  // Tout ce qui suit est découpé au cadre : en zoom fort, la sécante et la
  // courbe sortent largement de la zone de tracé.
  ctx.save();
  ctx.beginPath();
  ctx.rect(g.x0, g.padT, g.plotW, g.plotH);
  ctx.clip();

  // ── Courbe f, échantillonnée sur toute la largeur visible ──
  ctx.strokeStyle = COUL.courbe;
  ctx.lineWidth = 2.6 * s;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  var N = Math.max(200, Math.round(g.plotW));
  var trace = false;
  for (var i = 0; i <= N; i++) {
    var t = g.tMin + (g.tMax - g.tMin) * i / N;
    var z = fVal(t);
    if (!isFinite(z)) { trace = false; continue; }
    var px = g.gx(t), py = g.gy(z);
    // Un point très loin du cadre est inutile à tracer, mais il ne doit pas
    // couper le trait : on le rapproche au lieu de lever le crayon.
    py = Math.max(-1e4, Math.min(1e4, py));
    if (trace) ctx.lineTo(px, py); else { ctx.moveTo(px, py); trace = true; }
  }
  ctx.stroke();

  // ── Points A, M, B et pente courante ──
  var tA = tGauche(), tB = tDroite(), tM = sim.t0;
  var zA = fVal(tA),  zB = fVal(tB),  zM = fVal(tM);
  var pente = tauxVariation();
  var tangenteSeule = (sim.dt <= 0);

  // ── Droite (AB) : sécante, ou tangente si Δt = 0 ──
  //    Tracée sur toute la largeur du cadre pour que sa direction se lise
  //    d'un coup d'œil, avec la portion [A ; B] renforcée.
  if (isFinite(pente)) {
    var zRef = tangenteSeule ? zM : zA;
    var tRef = tangenteSeule ? tM : tA;
    var yG = g.gy(zRef + pente * (g.tMin - tRef));
    var yD = g.gy(zRef + pente * (g.tMax - tRef));
    ctx.strokeStyle = COUL.secante;
    ctx.lineWidth = 2 * s;
    ctx.setLineDash(tangenteSeule ? [] : [7 * s, 5 * s]);
    ctx.beginPath();
    ctx.moveTo(g.gx(g.tMin), yG);
    ctx.lineTo(g.gx(g.tMax), yD);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!tangenteSeule) {
      ctx.lineWidth = 3.4 * s;
      ctx.beginPath();
      ctx.moveTo(g.gx(tA), g.gy(zA));
      ctx.lineTo(g.gx(tB), g.gy(zB));
      ctx.stroke();
    }
  }

  // ── Tangente exacte en M (référence vers laquelle tend la sécante) ──
  if (sim.showTangente && !tangenteSeule) {
    var d = fDeriv(tM);
    if (isFinite(d)) {
      ctx.strokeStyle = COUL.tangente;
      ctx.lineWidth = 2 * s;
      ctx.setLineDash([3 * s, 4 * s]);
      ctx.beginPath();
      ctx.moveTo(g.gx(g.tMin), g.gy(zM + d * (g.tMin - tM)));
      ctx.lineTo(g.gx(g.tMax), g.gy(zM + d * (g.tMax - tM)));
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ── Cotes Δt et Δf ──
  if (sim.showCotes && !tangenteSeule) dessineCotes(ctx, g, tA, zA, tB, zB);

  // ── Les trois points ──
  if (!tangenteSeule) {
    pastille(ctx, g.gx(tA), g.gy(zA), 6 * s, COUL.pointAB);
    pastille(ctx, g.gx(tB), g.gy(zB), 6 * s, COUL.pointAB);
  }
  pastille(ctx, g.gx(tM), g.gy(zM), 7.5 * s, COUL.pointM);

  // ── Étiquettes des points ──
  var fontPt = '700 ' + Math.round(14 * s) + 'px "Segoe UI", Arial, sans-serif';
  if (!tangenteSeule) {
    texteCartouche(ctx, 'A', g.gx(tA) - 13 * s, g.gy(zA) - 13 * s, COUL.pointAB, fontPt);
    texteCartouche(ctx, 'B', g.gx(tB) + 13 * s, g.gy(zB) - 13 * s, COUL.pointAB, fontPt);
  }
  texteCartouche(ctx, 'M', g.gx(tM) + 15 * s, g.gy(zM) - 14 * s, COUL.pointM, fontPt);

  ctx.restore();

  // ── Bandeau de lecture posé en haut du cadre ──
  dessineBandeau(ctx, g, pente, tangenteSeule);
}

// ══════════════════════════════════════════════════════════════════════
//  Cotes Δt (horizontale) et Δf (verticale) formant le triangle de pente
// ══════════════════════════════════════════════════════════════════════

function dessineCotes(ctx, g, tA, zA, tB, zB) {
  var F = fonCourante();
  var s = g.s;
  var xA = g.gx(tA), yA = g.gy(zA);
  var xB = g.gx(tB), yB = g.gy(zB);

  // Traits de rappel fermant le triangle rectangle A → (tB, zA) → B.
  ctx.strokeStyle = 'rgba(122,138,150,0.55)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(xA, yA); ctx.lineTo(xB, yA);
  ctx.moveTo(xB, yA); ctx.lineTo(xB, yB);
  ctx.stroke();
  ctx.setLineDash([]);

  // Cote Δt (horizontale, bleue) et cote Δf (verticale, terracotta).
  flecheDouble(ctx, xA, yA, xB, yA, COUL.coteT, 2.2 * s, 9 * s);
  flecheDouble(ctx, xB, yA, xB, yB, COUL.secante, 2.2 * s, 9 * s);

  var font = '700 ' + Math.round(14 * s) + 'px "Segoe UI", Arial, sans-serif';
  texteCartouche(ctx, 'Δ' + F.varNom + ' = ' + avecUnite(fmtSmart(sim.dt), F.varUnite),
                 (xA + xB) / 2, yA + 16 * s, COUL.coteT, font);
  texteCartouche(ctx, 'Δ' + F.funNom + ' = ' + avecUnite(fmtSmart(zB - zA), F.funUnite),
                 xB + 10 * s, (yA + yB) / 2, COUL.secante, font, 'left');
}

// ══════════════════════════════════════════════════════════════════════
//  Bandeau : la grandeur lue sur le graphe, en grand, pour la projection
// ══════════════════════════════════════════════════════════════════════

function dessineBandeau(ctx, g, pente, tangenteSeule) {
  var F = fonCourante();
  var s = g.s;
  var txt = tangenteSeule
    ? labelDeriv() + ' = ' + avecUnite(fmtSmart(pente), F.derivUnite)
    : labelTaux()  + ' = ' + avecUnite(fmtSmart(pente), F.derivUnite);
  var sous = tangenteSeule ? 'nombre dérivé en M (Δ' + F.varNom + ' = 0)'
                           : 'taux de variation entre A et B';

  ctx.font = '700 ' + Math.round(20 * s) + 'px "Segoe UI", Arial, sans-serif';
  var w = ctx.measureText(txt).width;
  ctx.font = Math.round(12 * s) + 'px "Segoe UI", Arial, sans-serif';
  w = Math.max(w, ctx.measureText(sous).width) + 20 * s;
  var h = 46 * s;
  var bx = g.x0 + g.plotW - w - 8 * s, by = g.padT + 8 * s;

  // Fond blanc comme la zone de tracé : seul le liseré coloré marque le
  // bandeau, il ne doit pas apparaître comme une tache d'une autre teinte.
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.strokeStyle = tangenteSeule ? COUL.tangente : COUL.secante;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(bx, by, w, h);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = tangenteSeule ? COUL.tangente : COUL.secante;
  ctx.font = '700 ' + Math.round(20 * s) + 'px "Segoe UI", Arial, sans-serif';
  ctx.fillText(txt, bx + w / 2, by + 16 * s);
  ctx.fillStyle = COUL.label;
  ctx.font = Math.round(12 * s) + 'px "Segoe UI", Arial, sans-serif';
  ctx.fillText(sous, bx + w / 2, by + 34 * s);
}

// ══════════════════════════════════════════════════════════════════════
//  Interactions souris sur le graphe principal
//  — clic/glissé près de la courbe : déplace le point d'étude M
//  — clic/glissé ailleurs        : décale la vue (pan)
//  — molette                     : zoom autour de M
// ══════════════════════════════════════════════════════════════════════

var dragCourbe = { mode: null, x: 0, y: 0, panT: 0, panZ: 0 };

// Distance verticale, en pixels, entre le curseur et la courbe.
function _distCourbePx(g, px, py) {
  var t = g.tMin + (px - g.x0) / g.plotW * (g.tMax - g.tMin);
  var z = fVal(t);
  if (!isFinite(z)) return Infinity;
  return Math.abs(py - g.gy(z));
}

function _tSousCurseur(g, px) {
  var t = g.tMin + (px - g.x0) / g.plotW * (g.tMax - g.tMin);
  var F = fonCourante();
  return Math.max(F.tMin, Math.min(F.tMax, t));
}

function initCourbeSouris() {
  var canvas = document.getElementById('canvas-courbe');
  if (!canvas) return;

  canvas.addEventListener('pointerdown', function (e) {
    if (!geoCourbe) return;
    var r = canvas.getBoundingClientRect();
    var px = e.clientX - r.left, py = e.clientY - r.top;
    // Zone d'accroche généreuse : en projection, viser la courbe à la
    // souris depuis le fond de la salle doit rester facile.
    if (_distCourbePx(geoCourbe, px, py) < 40) {
      dragCourbe.mode = 'point';
      sim.t0 = _tSousCurseur(geoCourbe, px);
      onPointDeplace();
    } else {
      dragCourbe.mode = 'pan';
      dragCourbe.x = px; dragCourbe.y = py;
      dragCourbe.panT = sim.panT; dragCourbe.panZ = sim.panZ;
    }
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = dragCourbe.mode === 'pan' ? 'grabbing' : 'ew-resize';
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!geoCourbe) return;
    var r = canvas.getBoundingClientRect();
    var px = e.clientX - r.left, py = e.clientY - r.top;

    if (dragCourbe.mode === 'point') {
      // Pendant le glissé, la vue reste figée : si elle se recentrait sur M
      // à chaque frame, le point fuirait sous le curseur.
      sim.t0 = _tSousCurseur(geoCourbe, px);
      onPointDeplace();
    } else if (dragCourbe.mode === 'pan') {
      var g = geoCourbe;
      sim.panT = dragCourbe.panT - (px - dragCourbe.x) / g.plotW * (g.tMax - g.tMin);
      sim.panZ = dragCourbe.panZ + (py - dragCourbe.y) / g.plotH * (g.zMax - g.zMin);
      appliqueVue();
    } else {
      canvas.style.cursor = _distCourbePx(geoCourbe, px, py) < 40 ? 'ew-resize' : 'grab';
    }
  });

  function fin(e) {
    if (dragCourbe.mode) {
      dragCourbe.mode = null;
      canvas.style.cursor = 'grab';
      if (e && canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    }
  }
  canvas.addEventListener('pointerup', fin);
  canvas.addEventListener('pointercancel', fin);

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    setZoom(sim.zoom * (e.deltaY < 0 ? 1.18 : 1 / 1.18));
    syncZoomUI();
  }, { passive: false });

  canvas.style.cursor = 'grab';
}
