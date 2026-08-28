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
  var tTick = Math.round(15 * s);
  var fontTick = tTick + 'px monospace';
  var v, i, px, py, b;

  // ── Encombrement des noms d'axes, calculé AVANT les graduations ──
  //    Les titres sont posés au bout des flèches, là où passe justement la
  //    dernière graduation : on mesure leur place pour effacer l'étiquette
  //    de graduation qui viendrait s'écrire dessous.
  var tAxe = Math.round(17 * s);
  var fontAxe = '700 ' + tAxe + 'px "Segoe UI", Arial, sans-serif';
  ctx.font = fontAxe;
  var wX = ctx.measureText(o.xLabel).width, wY = ctx.measureText(o.yLabel).width;
  var xTitre = x0 + plotW + padR * 0.55, yTitre = padT - padT * 0.45;
  var boiteX = { x1: xTitre - wX - 4 * s, x2: xTitre + 4 * s,
                 y1: xAxeY + 6 * s, y2: xAxeY + 10 * s + tAxe * 1.3 };
  var boiteY = { x1: yAxeX + 4 * s, x2: yAxeX + 8 * s + wY + 4 * s,
                 y1: yTitre - 4 * s, y2: yTitre + tAxe * 1.3 };

  // ── Grille légère : aide à la lecture sans concurrencer les axes ──
  ctx.strokeStyle = COUL.grille;
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
  ctx.font = fontTick;
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

  // ── Noms des axes, posés au bout de chaque flèche ──
  texteCartouche(ctx, o.xLabel, xTitre, xAxeY + 10 * s,
                 COUL.texte, fontAxe, 'right', 'top');
  texteCartouche(ctx, o.yLabel, yAxeX + 8 * s, yTitre,
                 COUL.texte, fontAxe, 'left', 'top');

  // La position des deux axes et le côté de leurs graduations sont rendus
  // au tracé : les coordonnées du point courant s'y rabattent exactement.
  return { x0: x0, y0: y0, padT: padT, plotW: plotW, plotH: plotH,
           gx: gx, gy: gy, s: s,
           tMin: tMin, tMax: tMax, zMin: zMin, zMax: zMax,
           padL: padL, padR: padR,
           xAxeY: xAxeY, yAxeX: yAxeX,
           boiteTitreX: boiteX, boiteTitreY: boiteY,
           labSousX: labSousX, labGaucheY: labGaucheY };
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

  // ── Décollage de fusée : la figure se construit au fil du vol ──
  //    Tant que la fusée monte, le graphe n'est qu'un enregistrement en
  //    cours : ni point d'étude, ni sécante, ni cotes — il n'y a pas
  //    encore de courbe sur laquelle les poser. Tout revient à l'arrivée.
  var enVol = fuseeAnimEnCours();
  // En chronophotographie, seuls les relevés se posent pendant le vol :
  // la courbe continue n'apparaît qu'à la fin, une fois tous les points
  // obtenus. C'est l'ordre dans lequel on l'obtient au laboratoire.
  var courbeVisible = !enVol || !chronoActif();
  // Borne droite du tracé pendant le vol : le crayon suit la fusée.
  var tTrace = enVol ? Math.min(g.tMax, sim.fuseeT) : g.tMax;

  // ── Courbe f, échantillonnée sur toute la largeur visible ──
  ctx.strokeStyle = COUL.courbe;
  ctx.lineWidth = 2.6 * s;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  var N = Math.max(200, Math.round(g.plotW));
  var trace = false;
  for (var i = 0; courbeVisible && i <= N; i++) {
    var t = g.tMin + (g.tMax - g.tMin) * i / N;
    if (t > tTrace) break;
    // Le vol commence à t = 0 : rien n'a été enregistré avant.
    if (enVol && t < 0) { trace = false; continue; }
    var z = fVal(t);
    if (!isFinite(z)) { trace = false; continue; }
    var px = g.gx(t), py = g.gy(z);
    // Un point très loin du cadre est inutile à tracer, mais il ne doit pas
    // couper le trait : on le rapproche au lieu de lever le crayon.
    py = Math.max(-1e4, Math.min(1e4, py));
    if (trace) ctx.lineTo(px, py); else { ctx.moveTo(px, py); trace = true; }
  }
  ctx.stroke();

  // ── Points de la chronophotographie ──
  //    Pendant le vol, les relevés se posent l'un après l'autre et AUCUN
  //    n'est réservé aux pastilles A/M/B : celles-ci n'existent pas encore.
  if (chronoActif()) dessineChrono(ctx, g, enVol ? tTrace : null);

  if (enVol) {
    ctx.restore();
    dessineChronometre(ctx, g);
    return;
  }

  // ── Points A, M, B et pente courante ──
  var tA = tGauche(), tB = tDroite(), tM = sim.t0;
  var zA = fVal(tA),  zB = fVal(tB),  zM = fVal(tM);
  var pente = tauxVariation();
  var tangenteSeule = (sim.dt <= 0);
  // En mode non symétrique A est confondu avec M : la pastille et
  // l'étiquette « A » feraient double emploi sur le même point.
  var montreA = !tangenteSeule && sim.encadrement !== 'avant';
  // Sans A à gauche, le second point ne « borne » plus M : il est nommé N.
  // En chronophotographie, A/M/B sont trois points relevés successifs :
  // ils portent leur nom de chronophotographie plutôt que A, M et B.
  var chro = chronoActif();
  var nomA = chro ? nomPointM(sim.chronoIdx - 1) : 'A';
  var nomM = chro ? nomPointM(sim.chronoIdx)     : 'M';
  var nomB = chro ? nomPointM(sim.chronoIdx + 1)
                  : (sim.encadrement === 'avant' ? 'N' : 'B');

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
  if (montreA) pastille(ctx, g.gx(tA), g.gy(zA), 6 * s, COUL.pointAB);
  if (!tangenteSeule) {
    pastille(ctx, g.gx(tB), g.gy(zB), 6 * s, COUL.pointAB);
  }
  pastille(ctx, g.gx(tM), g.gy(zM), 7.5 * s, COUL.pointM);

  // ── Étiquettes des points ──
  var fontPt = '700 ' + Math.round(14 * s) + 'px "Segoe UI", Arial, sans-serif';
  if (montreA)
    texteCartouche(ctx, nomA, g.gx(tA) - 13 * s, g.gy(zA) - 13 * s, COUL.pointAB, fontPt);
  if (!tangenteSeule) {
    texteCartouche(ctx, nomB, g.gx(tB) + 13 * s, g.gy(zB) - 13 * s, COUL.pointAB, fontPt);
  }
  texteCartouche(ctx, nomM, g.gx(tM) + 15 * s, g.gy(zM) - 14 * s, COUL.pointM, fontPt);

  ctx.restore();

  // ── Coordonnées du point courant, rabattues sur les deux axes ──
  //    Tracées hors du clip : les valeurs s'écrivent SUR les axes, donc
  //    parfois juste au bord de la fenêtre graphique.
  if (sim.showCoords) dessineCoords(ctx, g, tM, zM, COUL.pointM, F.varUnite, F.funUnite);

  // ── Bandeau de lecture posé en haut du cadre ──
  dessineBandeau(ctx, g, pente, tangenteSeule);
}

// ══════════════════════════════════════════════════════════════════════
//  Cotes Δt (horizontale) et Δf (verticale) formant le triangle de pente
// ══════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  Coordonnées du point courant : les deux pointillés qu'on trace au
//  tableau pour lire une valeur sur les axes, et les deux nombres lus.
//  Le même tracé sert aux deux graphes (courbe f et courbe dérivée) :
//  seuls le point, sa couleur et les unités changent.
// ══════════════════════════════════════════════════════════════════════

function dessineCoords(ctx, g, t, v, couleur, uniteT, uniteV) {
  if (!isFinite(t) || !isFinite(v)) return;
  var s = g.s;
  var x = g.gx(t), y = g.gy(v);
  // Un point hors de la fenêtre n'a pas de coordonnées à rabattre.
  if (x < g.x0 || x > g.x0 + g.plotW || y < g.padT || y > g.y0) return;

  // Les deux pointillés vont du point jusqu'à SON axe, pas jusqu'au bord :
  // c'est le geste du rabattement sur les axes.
  ctx.save();
  ctx.strokeStyle = couleur;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1.6 * s;
  ctx.setLineDash([5 * s, 4 * s]);
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(g.yAxeX, y);
  ctx.moveTo(x, y); ctx.lineTo(x, g.xAxeY);
  ctx.stroke();
  ctx.restore();

  // Marques pleines à l'endroit exact où la lecture se fait sur les axes.
  ctx.strokeStyle = couleur;
  ctx.lineWidth = 2.6 * s;
  ctx.beginPath();
  ctx.moveTo(x, g.xAxeY - 5 * s); ctx.lineTo(x, g.xAxeY + 5 * s);
  ctx.moveTo(g.yAxeX - 5 * s, y); ctx.lineTo(g.yAxeX + 5 * s, y);
  ctx.stroke();
  ctx.lineWidth = 1;

  // Les deux valeurs, du côté où l'axe porte déjà ses graduations : elles
  // recouvrent les graduations (halo blanc) plutôt que de s'écrire par-dessus.
  // Elles doivent en revanche s'écarter des NOMS des axes, qui occupent le
  // bout de chaque flèche : on bascule alors la valeur de l'autre côté.
  var tf = Math.round(16 * s);
  var font = '700 ' + tf + 'px "Segoe UI", Arial, sans-serif';

  var txtT = avecUnite(fmtSmart(t), uniteT);
  var txtV = avecUnite(fmtSmart(v), uniteV);
  ctx.font = font;
  var wT = ctx.measureText(txtT).width, wV = ctx.measureText(txtV).width;
  var h = tf * 1.2;
  var xDroite = g.x0 + g.plotW + g.padR;

  // ── Ordonnée : à gauche ou à droite de l'axe vertical ──
  var aGauche = g.labGaucheY;
  if (aGauche && g.yAxeX - wV - 8 * s < 2) aGauche = false;
  else if (!aGauche && g.yAxeX + wV + 8 * s > xDroite - 2) aGauche = true;
  if (!aGauche && chevauche(boiteV(g, y, wV, h, s, false), g.boiteTitreY)
      && g.yAxeX - wV - 8 * s >= 2) aGauche = true;

  // ── Abscisse : sous ou au-dessus de l'axe horizontal ──
  // Recentrée d'abord pour ne pas sortir du canevas.
  var xTxt = Math.max(wT / 2 + 2, Math.min(xDroite - wT / 2 - 2, x));
  var sousX = g.labSousX;
  if (sousX && chevauche(boiteT(g, xTxt, wT, h, sousX, s), g.boiteTitreX)
      && g.xAxeY - 8 * s - h > g.padT) sousX = false;

  // Les valeurs lues se posent PAR-DESSUS les graduations de l'axe : on
  // efface d'abord le fond sous chacune, sinon les deux nombres se mêlent.
  efface(ctx, boiteT(g, xTxt, wT, h, sousX, s), 2 * s);
  efface(ctx, boiteV(g, y, wV, h, s, aGauche), 2 * s);

  texteCartouche(ctx, txtT, xTxt,
                 sousX ? g.xAxeY + 8 * s : g.xAxeY - 8 * s,
                 couleur, font, 'center', sousX ? 'top' : 'bottom');
  texteCartouche(ctx, txtV,
                 aGauche ? g.yAxeX - 8 * s : g.yAxeX + 8 * s, y,
                 couleur, font, aGauche ? 'right' : 'left', 'middle');
}

// Efface (fond blanc) le rectangle qu'occupera une étiquette, marge comprise.
function efface(ctx, b, m) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(b.x1 - m, b.y1 - m, b.x2 - b.x1 + 2 * m, b.y2 - b.y1 + 2 * m);
}

// Encombrement des deux étiquettes de coordonnées, et test de recouvrement.
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
//  Chronophotographie : les positions relevées à intervalle constant
//  Les trois points servant au taux (Mᵢ₋₁, Mᵢ, Mᵢ₊₁) sont tracés plus loin
//  avec leurs pastilles A/M/B : ici on ne pose que les AUTRES relevés.
// ══════════════════════════════════════════════════════════════════════

// Indices des points relevés visibles dans la fenêtre, du premier au
// dernier, en bornant le nombre de points (zoom arrière + Δt minuscule).
var CHRONO_MAX_PTS = 400;

function chronoIndicesVisibles(g) {
  var pas = chronoPas();
  var i0 = Math.ceil(g.tMin / pas), i1 = Math.floor(g.tMax / pas);
  if (i1 - i0 > CHRONO_MAX_PTS) return null;
  return { i0: i0, i1: i1 };
}

// `tMaxVol` non nul : on est en plein décollage. Les relevés se posent
// alors jusqu'à la date atteinte, et tous portent leur pastille — aucun
// n'est mis de côté pour A/M/B, qui n'apparaîtront qu'à l'arrivée.
function dessineChrono(ctx, g, tMaxVol) {
  var lim = chronoIndicesVisibles(g);
  if (!lim) return;
  var s = g.s;
  var idx = (tMaxVol === null || tMaxVol === undefined) ? sim.chronoIdx : NaN;
  if (tMaxVol !== null && tMaxVol !== undefined) {
    lim = { i0: Math.max(lim.i0, 0), i1: Math.min(lim.i1, Math.floor(tMaxVol / chronoPas() + 1e-9)) };
  }
  var font = '600 ' + Math.round(11.5 * s) + 'px "Segoe UI", Arial, sans-serif';
  // Les étiquettes se serrent vite : on ne les écrit que si les points sont
  // assez espacés à l'écran pour qu'elles restent lisibles.
  var ecartPx = chronoPas() / (g.tMax - g.tMin) * g.plotW;
  var libelles = ecartPx > 26 * s;

  for (var i = lim.i0; i <= lim.i1; i++) {
    // Les points voisins portent déjà les pastilles A/M/B.
    if (i === idx || i === idx + 1 || (sim.encadrement !== 'avant' && i === idx - 1)) continue;
    var t = chronoT(i), z = fVal(t);
    if (!isFinite(z)) continue;
    var x = g.gx(t), y = g.gy(z);
    ctx.beginPath();
    ctx.arc(x, y, 4 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = COUL.label;
    ctx.stroke();
    if (libelles)
      texteCartouche(ctx, 'M' + indiceSub(i), x, y - 13 * s, COUL.label, font);
  }
  ctx.lineWidth = 1;
}

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

  var font = '700 ' + Math.round(16.5 * s) + 'px "Segoe UI", Arial, sans-serif';
  texteCartouche(ctx, 'Δ' + F.varNom + ' = ' + avecUnite(fmtSmart(sim.dt), F.varUnite),
                 (xA + xB) / 2, yA + 16 * s, COUL.coteT, font);
  texteCartouche(ctx, 'Δ' + F.funNom + ' = ' + avecUnite(fmtSmart(zB - zA), F.funUnite),
                 xB + 10 * s, (yA + yB) / 2, COUL.secante, font, 'left');
}

// ══════════════════════════════════════════════════════════════════════
//  Bandeau : la grandeur lue sur le graphe, en grand, pour la projection
// ══════════════════════════════════════════════════════════════════════

// Chronomètre du décollage : il occupe exactement la place du bandeau du
// taux de variation, et lui rend la place à l'arrivée. Pendant le vol il
// n'y a rien à calculer — il n'y a qu'une date qui court.
function dessineChronometre(ctx, g) {
  var s = g.s;
  var txt = fmtFr(sim.fuseeT, 2) + ' s';
  var sous = 'décollage en cours';

  ctx.font = '700 ' + Math.round(24 * s) + 'px "Segoe UI", Arial, sans-serif';
  var w = ctx.measureText(txt).width;
  ctx.font = Math.round(12 * s) + 'px "Segoe UI", Arial, sans-serif';
  w = Math.max(w, ctx.measureText(sous).width) + 20 * s;
  var h = 46 * s;
  var bx = g.x0 + g.plotW - w - 8 * s, by = g.padT + 8 * s;

  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.strokeStyle = COUL.coteT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(bx, by, w, h);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COUL.coteT;
  ctx.font = '700 ' + Math.round(24 * s) + 'px "Segoe UI", Arial, sans-serif';
  ctx.fillText(txt, bx + w / 2, by + 16 * s);
  ctx.fillStyle = COUL.label;
  ctx.font = Math.round(12 * s) + 'px "Segoe UI", Arial, sans-serif';
  ctx.fillText(sous, bx + w / 2, by + 34 * s);
}

function dessineBandeau(ctx, g, pente, tangenteSeule) {
  var F = fonCourante();
  var s = g.s;
  var txt = tangenteSeule
    ? labelDeriv() + ' = ' + avecUnite(fmtSmart(pente), F.derivUnite)
    : labelTaux()  + ' = ' + avecUnite(fmtSmart(pente), F.derivUnite);
  // En chronophotographie, le taux se lit entre deux relevés nommés.
  var entre;
  if (chronoActif()) {
    var i = sim.chronoIdx;
    entre = nomPointM(sim.encadrement === 'avant' ? i : i - 1) + ' et ' + nomPointM(i + 1);
  } else {
    entre = (sim.encadrement === 'avant') ? 'M et N' : 'A et B';
  }
  var sous = tangenteSeule ? 'nombre dérivé en ' + nomPointM(sim.chronoIdx) +
                             ' (Δ' + F.varNom + ' = 0)'
                           : 'taux de variation entre ' + entre;

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

// Aucune borne : n'importe quel point visible de la courbe peut être choisi.
function _tSousCurseur(g, px) {
  return g.tMin + (px - g.x0) / g.plotW * (g.tMax - g.tMin);
}

// Pose le point d'étude à l'abscisse visée. En chronophotographie, le point
// reste libre de se poser où l'on veut : c'est la grille des relevés qui se
// recale sur lui, en découpant [0 ; t_M] en un nombre entier d'intervalles.
function _poseM(g, px) {
  var t = _tSousCurseur(g, px);
  if (chronoActif()) {
    // L'abscisse visée par le geste devient la nouvelle ancre : c'est elle
    // que la chronophotographie conservera si le pas change ensuite.
    chronoAncrer(t);
  } else {
    sim.t0 = t;
    sim.chronoAncre = t;
  }
  onPointDeplace();
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
    // Pendant le décollage il n'y a pas encore de point d'étude à saisir :
    // le geste ne peut que décaler la vue.
    if (!fuseeAnimEnCours() && _distCourbePx(geoCourbe, px, py) < 40) {
      dragCourbe.mode = 'point';
      _poseM(geoCourbe, px);
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
      _poseM(geoCourbe, px);
    } else if (dragCourbe.mode === 'pan') {
      var g = geoCourbe;
      sim.panT = dragCourbe.panT - (px - dragCourbe.x) / g.plotW * (g.tMax - g.tMin);
      sim.panZ = dragCourbe.panZ + (py - dragCourbe.y) / g.plotH * (g.zMax - g.zMin);
      appliqueVue();
    } else {
      canvas.style.cursor = (!fuseeAnimEnCours() && _distCourbePx(geoCourbe, px, py) < 40)
                            ? 'ew-resize' : 'grab';
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
  }, { passive: false });

  // Double-clic gauche : retour à la vue initiale (zoom et décalage).
  canvas.addEventListener('dblclick', function (e) {
    e.preventDefault();
    razVueUI();
  });

  canvas.style.cursor = 'grab';
}
