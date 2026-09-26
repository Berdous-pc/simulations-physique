// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  piste.js — Piste de course vue du dessus, à droite du graphe
//  Dépend de sim.js et de graph.js (il lit `geoPiste`).
//
//  Tout l'enjeu tient en une ligne, comme pour la fusée de la page
//  Dérivée : une voiture en x est posée à l'ordonnée écran que le graphe
//  x(t) donne à x. Les deux canevas sont voisins : on convertit par la
//  différence de leurs rectangles à l'écran.
//
//  L'échelle de la piste est celle d'un x(t) seul occupant tout le
//  canevas du graphe (`geoPiste`), quels que soient les graphes affichés.
//  Quand x(t) est effectivement seul, elle coïncide avec ses ordonnées ;
//  sinon la piste ne bouge pas, seule la lecture horizontale disparaît.
// ══════════════════════════════════════════════════════════════════════

'use strict';

var COUL_PISTE = {
  herbe:    '#9cb98a',
  herbeF:   '#8aab78',
  asphalte: '#6e7378',
  asphalteF:'#62676c',
  ligne:    'rgba(255,255,255,0.9)',
  regle:    '#2c3e50'
};

// Part de la largeur réservée à la règle graduée (à gauche) et à
// l'accotement (à droite) ; la piste occupe le reste, en trois files.
var PISTE_REGLE = 0.25;
var PISTE_BORD  = 0.07;
var NB_FILES    = 3;

// ══════════════════════════════════════════════════════════════════════
//  Tracé
// ══════════════════════════════════════════════════════════════════════

function drawPiste() {
  var canvas = document.getElementById('canvas-piste');
  if (!sizeCanvas(canvas)) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);

  var g = geoPiste;
  if (!g) return;

  // ── Passage des positions x aux ordonnées de ce canevas ──
  //    Même échelle verticale que la fenêtre du graphe, translatée de
  //    l'écart entre les deux canevas (relu à chaque tracé).
  var cv = document.getElementById('canvas-graph');
  var dy = cv.getBoundingClientRect().top - canvas.getBoundingClientRect().top;
  var xLo = xMinPiste(), xHi = xMaxPiste();
  var pxParM = g.plotH / (xHi - xLo);
  function y(x) { return g.padT + (xHi - x) * pxParM + dy; }

  var s = g.s;
  var tx0 = W * PISTE_REGLE, tx1 = W * (1 - PISTE_BORD);
  var laneW = (tx1 - tx0) / NB_FILES;
  var yBas = y(xLo);               // fin de la piste, sous la ligne de départ

  // ── Herbe ──
  ctx.fillStyle = COUL_PISTE.herbe;
  ctx.fillRect(0, 0, W, H);
  // Bandes de tonte : un repère visuel de défilement, à pas fixe en mètres.
  var pasTonte = tickStep(xHi - xLo, 10);
  ctx.fillStyle = COUL_PISTE.herbeF;
  for (var k = Math.floor(xLo / pasTonte) - 1; k * pasTonte < xHi + pasTonte * 2; k++) {
    if (k % 2) continue;
    var ya = y((k + 1) * pasTonte), yb = y(k * pasTonte);
    ctx.fillRect(0, ya, tx0, yb - ya);
    ctx.fillRect(tx1, ya, W - tx1, yb - ya);
  }

  // ── Asphalte, du haut du canevas jusqu'à la fin de piste ──
  ctx.fillStyle = COUL_PISTE.asphalte;
  ctx.fillRect(tx0, 0, tx1 - tx0, yBas);

  // Bordures et séparations de files.
  ctx.strokeStyle = COUL_PISTE.ligne;
  ctx.lineWidth = Math.max(1.5, 2 * s);
  ctx.beginPath();
  ctx.moveTo(tx0, 0); ctx.lineTo(tx0, yBas);
  ctx.moveTo(tx1, 0); ctx.lineTo(tx1, yBas);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, 1.4 * s);
  ctx.setLineDash([10 * s, 10 * s]);
  ctx.beginPath();
  for (var f = 1; f < NB_FILES; f++) {
    ctx.moveTo(tx0 + f * laneW, 0); ctx.lineTo(tx0 + f * laneW, yBas);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // ── Fin de piste : barrière rouge et blanche ──
  barriere(ctx, tx0, tx1, yBas, s);

  // ── Ligne de départ (x = 0) et ligne d'arrivée (x = L) ──
  var yDep = y(0);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, 3 * s);
  ctx.beginPath(); ctx.moveTo(tx0, yDep); ctx.lineTo(tx1, yDep); ctx.stroke();
  damier(ctx, tx0, tx1, y(sim.L), Math.max(5, Math.min(12, laneW / 5)));

  // ── Règle graduée ──
  dessineRegle(ctx, g, W, tx0, y, xLo, xHi, s);

  // ── Reports horizontaux (x(t) seulement), puis les voitures ──
  sim.voitures.forEach(function (v, i) {
    var te = tEffectif(v, Math.max(0, sim.t));
    var yc = y(posX(v, te));
    var xc = tx0 + laneW * (i + 0.5);
    if (xSeul() && yc > -20 && yc < H + 20) {
      ctx.save();
      ctx.strokeStyle = COUL_VOITURES[i].coul;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1.6 * s;
      ctx.setLineDash([6 * s, 4 * s]);
      ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(xc, yc); ctx.stroke();
      ctx.restore();
    }
  });

  sim.voitures.forEach(function (v, i) {
    var te = tEffectif(v, Math.max(0, sim.t));
    var yc = y(posX(v, te));
    var xc = tx0 + laneW * (i + 0.5);
    // À l'échelle de la piste, plafonnée à la largeur de la file : à courte
    // piste, une voiture de 1,8 m déborderait sinon sur la file voisine.
    var h = VOITURE_LONGUEUR * pxParM, w = VOITURE_LARGEUR * pxParM;
    var cap = 0.72 * laneW;
    if (w > cap) { h *= cap / w; w = cap; }
    if (yc < -h || yc > H + h) return;
    ctx.save();
    // Voiture sortie de piste : immobilisée, estompée.
    if (estSortie(v, sim.t)) ctx.globalAlpha = 0.45;
    dessineVoiture(ctx, xc, yc, w, h, COUL_VOITURES[i], i + 1);
    ctx.restore();
  });
}

// ══════════════════════════════════════════════════════════════════════
//  Décor
// ══════════════════════════════════════════════════════════════════════

// Bandeau à damier noir et blanc, centré sur la ligne d'arrivée.
function damier(ctx, x0, x1, yc, c) {
  var n = Math.max(2, Math.round((x1 - x0) / c));
  var cw = (x1 - x0) / n;
  for (var r = 0; r < 2; r++) {
    for (var i = 0; i < n; i++) {
      ctx.fillStyle = (i + r) % 2 ? '#1e2226' : '#ffffff';
      ctx.fillRect(x0 + i * cw, yc - c + r * c, cw + 0.5, c);
    }
  }
}

// Barrière à rayures rouges et blanches fermant le bas de la piste.
function barriere(ctx, x0, x1, yc, s) {
  var h = Math.max(4, 6 * s), c = Math.max(8, 12 * s);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, yc, x1 - x0, h);
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x0, yc, x1 - x0, h);
  ctx.fillStyle = '#c03020';
  for (var x = x0 - h; x < x1 + h; x += 2 * c) {
    ctx.beginPath();
    ctx.moveTo(x, yc + h);
    ctx.lineTo(x + h, yc);
    ctx.lineTo(x + h + c, yc);
    ctx.lineTo(x + c, yc + h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Règle verticale sur l'herbe, graduée en mètres : en vₓ(t) et aₓ(t) le
// graphe ne porte plus les positions, c'est elle qui les donne.
function dessineRegle(ctx, g, W, tx0, y, xLo, xHi, s) {
  var xr = tx0 - Math.max(5, 6 * s);
  var step = tickStep(xHi - xLo, Math.max(3, Math.round(g.plotH / (60 * s))));
  var fs = Math.max(10, Math.min(Math.round(14 * s), Math.floor(tx0 / 2.8)));
  var font = fs + 'px monospace';

  ctx.strokeStyle = COUL_PISTE.regle;
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(xr, y(xHi)); ctx.lineTo(xr, y(xLo)); ctx.stroke();

  for (var i = Math.ceil(xLo / step); i * step <= xHi; i++) {
    var v = i * step, py = y(v);
    ctx.strokeStyle = COUL_PISTE.regle;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(xr - 5 * s, py); ctx.lineTo(xr, py); ctx.stroke();
    ctx.font = font;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COUL_PISTE.regle;
    ctx.fillText(fmtTick(v, step), xr - 7 * s, py);
  }

  // Nom de l'axe en tête de règle. Il est calé contre le bord GAUCHE du
  // canevas et réduit s'il le faut pour tenir dans la bande de la règle :
  // aligné sur la règle, il débordait à gauche et se faisait rogner par
  // le bord du canevas, contre la zone graphique.
  var marge = 4, place = tx0 - 2 * marge;
  var ft = fs;
  ctx.font = '700 ' + ft + 'px "Segoe UI", Arial, sans-serif';
  var wt = ctx.measureText('x (m)').width;
  if (wt > place && place > 0) {
    ft = Math.max(8, Math.floor(ft * place / wt));
    ctx.font = '700 ' + ft + 'px "Segoe UI", Arial, sans-serif';
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = COUL_PISTE.regle;
  ctx.fillText('x (m)', marge, marge);
}

// ══════════════════════════════════════════════════════════════════════
//  Voiture provisoire, vue du dessus, capot vers le haut
//  (sera remplacée par les images définitives)
// ══════════════════════════════════════════════════════════════════════

function dessineVoiture(ctx, xc, yc, w, h, pal, numero) {
  ctx.translate(xc, yc);

  // Ombre portée légère.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.roundRect(-w / 2 + w * 0.06, -h / 2 + h * 0.04, w, h, w * 0.32);
  ctx.fill();

  // Roues : elles dépassent un peu de la caisse.
  ctx.fillStyle = '#1e2226';
  var rw = w * 0.2, rh = h * 0.19;
  [-0.3, 0.3].forEach(function (fy) {
    [-1, 1].forEach(function (sx) {
      ctx.beginPath();
      ctx.roundRect(sx * (w / 2) - rw / 2, fy * h - rh / 2, rw, rh, rw * 0.3);
      ctx.fill();
    });
  });

  // Caisse : dégradé latéral pour le volume.
  var gr = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  gr.addColorStop(0, pal.clair);
  gr.addColorStop(0.45, pal.coul);
  gr.addColorStop(1, pal.fonce);
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, w * 0.32);
  ctx.fill();
  ctx.strokeStyle = pal.fonce;
  ctx.lineWidth = Math.max(0.8, w * 0.04);
  ctx.stroke();

  // Pare-brise (vers l'avant, donc en haut), toit, lunette arrière.
  ctx.fillStyle = '#c4d8ea';
  ctx.strokeStyle = pal.fonce;
  ctx.lineWidth = Math.max(0.6, w * 0.03);
  ctx.beginPath();
  ctx.moveTo(-w * 0.30, -h * 0.18);
  ctx.lineTo( w * 0.30, -h * 0.18);
  ctx.lineTo( w * 0.38, -h * 0.02);
  ctx.lineTo(-w * 0.38, -h * 0.02);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = pal.coul;
  ctx.beginPath();
  ctx.roundRect(-w * 0.36, -h * 0.02, w * 0.72, h * 0.24, w * 0.06);
  ctx.fill();

  ctx.fillStyle = '#c4d8ea';
  ctx.beginPath();
  ctx.moveTo(-w * 0.36, h * 0.22);
  ctx.lineTo( w * 0.36, h * 0.22);
  ctx.lineTo( w * 0.28, h * 0.32);
  ctx.lineTo(-w * 0.28, h * 0.32);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // Phares (avant) et feux (arrière).
  ctx.fillStyle = '#fff4c0';
  ctx.fillRect(-w * 0.40, -h * 0.49, w * 0.2, h * 0.035);
  ctx.fillRect( w * 0.20, -h * 0.49, w * 0.2, h * 0.035);
  ctx.fillStyle = '#e03020';
  ctx.fillRect(-w * 0.40, h * 0.455, w * 0.2, h * 0.035);
  ctx.fillRect( w * 0.20, h * 0.455, w * 0.2, h * 0.035);

  // Numéro sur le toit, si la voiture est assez grande pour le porter.
  if (h > 34) {
    ctx.font = '700 ' + Math.round(h * 0.17) + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(numero), 0, h * 0.1);
  }
}
