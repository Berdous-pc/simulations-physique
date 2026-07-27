// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  orbites.js — Rendu canvas des trois zones d'animation
//  Dépend de sim.js. Chaque onglet a son propre <canvas> :
//  - #canvas-loi1 : ellipse et vocabulaire (1ʳᵉ loi) ;
//  - #canvas-loi2 : loi des aires (2ᵉ loi) ;
//  - #canvas-sys3 : systèmes réels (3ᵉ loi).
//
//  Convention de repère : monde héliocentrique (Soleil/attracteur au foyer,
//  périhélie vers +x, y vers le haut) → écran (y vers le bas, donc y inversé).
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ══════════════════════════════════════════════════════════════════════
//  Outils de dessin partagés
// ══════════════════════════════════════════════════════════════════════

// Dimensionne le canvas en pixels physiques (devicePixelRatio) et pose la
// transformation pour continuer à dessiner en pixels CSS.
// Renvoie false si le canvas est masqué (clientWidth nul) : rien à dessiner.
function sizeCanvas(canvas) {
  var dpr = window.devicePixelRatio || 1;
  var w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return false;
  var pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  return true;
}

// Texte avec halo sombre (assorti au fond « espace » de la zone
// d'animation) : reste lisible même posé sur un trait ou une aire.
function texteHalo(ctx, txt, x, y, fill, font, align, baseline) {
  ctx.font = font;
  ctx.textAlign = align || 'center';
  ctx.textBaseline = baseline || 'middle';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(10,15,26,0.85)';
  ctx.lineJoin = 'round';
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(txt, x, y);
}

// Flèche simple (segment + pointe).
function fleche(ctx, x0, y0, x1, y1, couleur, epaisseur) {
  var dx = x1 - x0, dy = y1 - y0;
  var len = Math.hypot(dx, dy);
  if (len < 2) return;
  var ux = dx / len, uy = dy / len;
  var head = Math.min(10, 3 + len * 0.08);
  ctx.strokeStyle = couleur;
  ctx.fillStyle = couleur;
  ctx.lineWidth = epaisseur;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - ux * head * 0.6, y1 - uy * head * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * head - uy * head * 0.45, y1 - uy * head + ux * head * 0.45);
  ctx.lineTo(x1 - ux * head + uy * head * 0.45, y1 - uy * head - ux * head * 0.45);
  ctx.closePath();
  ctx.fill();
}

// Soleil : disque orangé avec halo dégradé.
function drawSoleil(ctx, x, y, rayon) {
  var g = ctx.createRadialGradient(x, y, rayon * 0.3, x, y, rayon * 2.6);
  g.addColorStop(0, 'rgba(240,168,40,0.85)');
  g.addColorStop(1, 'rgba(240,168,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rayon * 2.6, 0, 2 * Math.PI);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, rayon, 0, 2 * Math.PI);
  ctx.fillStyle = '#e89020';
  ctx.fill();
  ctx.strokeStyle = '#b06010';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// Jupiter (attracteur des lunes) : disque brun-orangé à bandes.
function drawJupiter(ctx, x, y, rayon) {
  ctx.beginPath();
  ctx.arc(x, y, rayon, 0, 2 * Math.PI);
  ctx.fillStyle = '#b07040';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(230,200,160,0.55)';
  ctx.fillRect(x - rayon, y - rayon * 0.45, 2 * rayon, rayon * 0.28);
  ctx.fillRect(x - rayon, y + rayon * 0.15, 2 * rayon, rayon * 0.24);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, rayon, 0, 2 * Math.PI);
  ctx.strokeStyle = '#7a4a20';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// Barre d'échelle en bas à gauche : longueur « ronde » choisie pour occuper
// 60 à 160 px à l'écran, quel que soit le zoom.
function drawEchelle(ctx, H, scale, unite) {
  var candidats = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20];
  var lUnite = candidats[0];
  for (var i = 0; i < candidats.length; i++) {
    if (candidats[i] * scale <= 160) lUnite = candidats[i];
  }
  var lPx = lUnite * scale;
  if (lPx < 30) return;                       // fenêtre vraiment minuscule
  var x0 = 16, y0 = H - 18;
  ctx.strokeStyle = '#a8b8c8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(x0 + lPx, y0);
  ctx.moveTo(x0, y0 - 5); ctx.lineTo(x0, y0 + 5);
  ctx.moveTo(x0 + lPx, y0 - 5); ctx.lineTo(x0 + lPx, y0 + 5);
  ctx.stroke();
  texteHalo(ctx, fmtSmart(lUnite) + ' ' + unite, x0 + lPx / 2, y0 - 12,
            '#a8b8c8', '600 12px monospace');
}

// ══════════════════════════════════════════════════════════════════════
//  Onglet 1 — Ellipse et vocabulaire
// ══════════════════════════════════════════════════════════════════════

function drawLoi1() {
  var canvas = document.getElementById('canvas-loi1');
  if (!sizeCanvas(canvas)) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);

  var a = sim1.a, e = sim1.e;
  var b = demiPetitAxe(a, e), c = a * e;

  // Échelle FIXE (cf. A1_MAX dans sim.js) : la zone loge le plus grand
  // cercle possible (a = A1_MAX, e = 0). Ainsi le slider a change
  // réellement la taille de l'ellipse à l'écran, et le slider e l'aplatit
  // sans toucher au grand axe.
  var padX = Math.max(56, W * 0.08), padY = Math.max(48, H * 0.10);
  var s = Math.min((W - 2 * padX) / (2 * A1_MAX), (H - 2 * padY) / (2 * A1_MAX));

  // Centre O de l'ellipse au centre du canvas ; Soleil au foyer F (droite).
  var ox = W / 2, oy = H / 2;
  var fx = ox + c * s, fy = oy;                 // foyer F (Soleil)
  var f2x = ox - c * s, f2y = oy;               // foyer F′

  // Conversion monde (origine au Soleil) → écran.
  function sx(x) { return fx + x * s; }
  function sy(y) { return fy - y * s; }

  var fsBase = Math.max(13, Math.min(18, Math.min(W, H) * 0.033));
  var fontMath  = 'italic 700 ' + fsBase + 'px "Segoe UI", Arial, sans-serif';
  var fontTexte = 'italic ' + Math.round(fsBase * 0.82) + 'px "Segoe UI", Arial, sans-serif';

  // ── Trajectoire elliptique ──
  ctx.strokeStyle = '#90a8c4';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(ox, oy, a * s, b * s, 0, 0, 2 * Math.PI);
  ctx.stroke();

  // ── Grand axe ──
  if (sim1.showGrandAxe) {
    ctx.strokeStyle = 'rgba(122,170,232,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ox - a * s, oy);
    ctx.lineTo(ox + a * s, oy);
    ctx.stroke();
    // Demi-grand axe a : flèche O → périhélie
    fleche(ctx, ox, oy, ox + a * s, oy, '#6aa2e0', 2.5);
    texteHalo(ctx, 'a', ox + a * s / 2, oy - fsBase * 0.75, '#6aa2e0', fontMath);
    // Sommets : périhélie / aphélie (sans objet pour un cercle)
    if (e >= 0.05) {
      texteHalo(ctx, 'périhélie', ox + a * s, oy + fsBase * 1.15, '#98a8b8', fontTexte);
      texteHalo(ctx, 'aphélie',   ox - a * s, oy + fsBase * 1.15, '#98a8b8', fontTexte);
    }
  }

  // ── Petit axe ──
  if (sim1.showPetitAxe) {
    ctx.strokeStyle = 'rgba(88,192,136,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ox, oy - b * s);
    ctx.lineTo(ox, oy + b * s);
    ctx.stroke();
    // Demi-petit axe b : flèche O → sommet haut
    fleche(ctx, ox, oy, ox, oy - b * s, '#58c088', 2.5);
    texteHalo(ctx, 'b', ox - fsBase * 0.7, oy - b * s / 2, '#58c088', fontMath);
  }

  // ── Foyers, centre et distance c ──
  if (sim1.showFoyers) {
    // Distance c = OF (uniquement si elle est visible à l'écran)
    if (c * s > 14) {
      fleche(ctx, ox, oy, fx, fy, '#e87850', 2.5);
      texteHalo(ctx, 'c', ox + c * s / 2, oy + fsBase * 0.8, '#e87850', fontMath);
    }
    // Centre O
    ctx.strokeStyle = '#a8b8c8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ox - 5, oy); ctx.lineTo(ox + 5, oy);
    ctx.moveTo(ox, oy - 5); ctx.lineTo(ox, oy + 5);
    ctx.stroke();
    texteHalo(ctx, 'O', ox - fsBase * 0.55, oy - fsBase * 0.6, '#a8b8c8', fontMath);
    // Foyer F′ (croix)
    ctx.strokeStyle = '#e87850';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(f2x - 5, f2y - 5); ctx.lineTo(f2x + 5, f2y + 5);
    ctx.moveTo(f2x - 5, f2y + 5); ctx.lineTo(f2x + 5, f2y - 5);
    ctx.stroke();
    texteHalo(ctx, 'F′', f2x - fsBase * 0.7, f2y - fsBase * 0.7, '#e87850', fontMath);
  }

  // ── Position de la planète (mouvement képlérien réel) ──
  var p = posKepler(a, e, sim1.M);
  var px = sx(p.x), py = sy(p.y);

  // ── Distances r et r′ aux deux foyers ──
  if (sim1.showDistances) {
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = '#e08050';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.strokeStyle = '#c088e8';
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(f2x, f2y); ctx.stroke();
    ctx.setLineDash([]);
    texteHalo(ctx, 'r',  (px + fx) / 2,  (py + fy) / 2 - fsBase * 0.6,  '#e08050', fontMath);
    texteHalo(ctx, 'r′', (px + f2x) / 2, (py + f2y) / 2 - fsBase * 0.6, '#c088e8', fontMath);
  }

  // ── Soleil au foyer F ──
  drawSoleil(ctx, fx, fy, Math.max(8, Math.min(13, s * 0.055)));
  if (sim1.showFoyers) {
    texteHalo(ctx, 'F', fx + fsBase * 0.75, fy + fsBase * 0.75, '#e87850', fontMath);
    texteHalo(ctx, 'Soleil', fx, fy + fsBase * 1.9, '#98a8b8', fontTexte);
  }

  // ── Planète ──
  ctx.beginPath();
  ctx.arc(px, py, 7, 0, 2 * Math.PI);
  ctx.fillStyle = '#4a8ad8';
  ctx.fill();
  ctx.strokeStyle = '#a8c8e8';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  drawEchelle(ctx, H, s, 'ua');
}

// ══════════════════════════════════════════════════════════════════════
//  Onglet 2 — Loi des aires
// ══════════════════════════════════════════════════════════════════════

// Contour d'un secteur balayé : foyer → arc d'ellipse (E0 → E1) → foyer.
// sx/sy : conversion monde → écran (fermetures fournies par drawLoi2).
function traceSecteur(ctx, a, e, E0, E1, sx, sy) {
  var b = demiPetitAxe(a, e);
  var n = Math.max(12, Math.min(400, Math.ceil((E1 - E0) / 0.03)));
  ctx.beginPath();
  ctx.moveTo(sx(0), sy(0));                    // foyer (Soleil)
  for (var i = 0; i <= n; i++) {
    var E = E0 + (E1 - E0) * i / n;
    ctx.lineTo(sx(a * (Math.cos(E) - e)), sy(b * Math.sin(E)));
  }
  ctx.closePath();
}

function drawLoi2() {
  var canvas = document.getElementById('canvas-loi2');
  if (!sizeCanvas(canvas)) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);

  var a = sim2.a, e = sim2.e;
  var b = demiPetitAxe(a, e), c = a * e;

  // Échelle fixe ici aussi (calée sur 2a, avec a constant = 1 ua) : quand e
  // augmente, l'ellipse s'aplatit à grand axe constant — une échelle calée
  // sur 2b la ferait au contraire s'élargir à l'écran.
  var padX = Math.max(50, W * 0.07), padY = Math.max(44, H * 0.09);
  var s = Math.min((W - 2 * padX) / (2 * a), (H - 2 * padY) / (2 * a));

  var ox = W / 2, oy = H / 2;
  var fx = ox + c * s, fy = oy;

  function sx(x) { return fx + x * s; }
  function sy(y) { return fy - y * s; }

  var fsBase = Math.max(13, Math.min(18, Math.min(W, H) * 0.033));
  var fontMath = 'italic 700 ' + fsBase + 'px "Segoe UI", Arial, sans-serif';

  // ── Trajectoire ──
  ctx.strokeStyle = '#90a8c4';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(ox, oy, a * s, b * s, 0, 0, 2 * Math.PI);
  ctx.stroke();

  // ── Aires terminées ──
  sim2.aires.forEach(function (aire, i) {
    var coul = AIRE_COULEURS[aire.colorIdx];
    traceSecteur(ctx, a, e, aire.E0, aire.E1, sx, sy);
    ctx.fillStyle = coul.fill;
    ctx.fill();
    ctx.strokeStyle = coul.stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Étiquette A₁, A₂… posée vers le milieu du secteur
    var Emid = (aire.E0 + aire.E1) / 2;
    var pm = { x: a * (Math.cos(Emid) - e), y: demiPetitAxe(a, e) * Math.sin(Emid) };
    texteHalo(ctx, 'A' + SUB_CHARS[i], sx(pm.x * 0.55), sy(pm.y * 0.55),
              coul.stroke, fontMath);
  });

  // ── Balayage en cours (secteur partiel, du départ à la position actuelle) ──
  if (sim2.sweep) {
    var sw = sim2.sweep;
    var E0 = solveKepler(sw.Mstart, e);
    var Ecur = solveKepler(Math.min(sim2.M, sw.Mend), e);
    if (Ecur > E0 + 0.005) {
      var coulS = AIRE_COULEURS[sw.colorIdx];
      traceSecteur(ctx, a, e, E0, Ecur, sx, sy);
      ctx.fillStyle = coulS.fill;
      ctx.fill();
      ctx.strokeStyle = coulS.stroke;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  // ── Soleil ──
  drawSoleil(ctx, fx, fy, Math.max(8, Math.min(13, s * 0.055)));

  // ── Planète ──
  var p = posKepler(a, e, sim2.M);
  var px = sx(p.x), py = sy(p.y);
  ctx.beginPath();
  ctx.arc(px, py, 7, 0, 2 * Math.PI);
  ctx.fillStyle = '#4a8ad8';
  ctx.fill();
  ctx.strokeStyle = '#a8c8e8';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // ── Vecteur vitesse (vis-viva, tangent à la trajectoire) ──
  if (sim2.showVitesse) {
    var v = V_TERRE_KMS * Math.sqrt(Math.max(0, 2 / p.r - 1 / a));
    // Direction : dérivée de la position par rapport à E (sens de parcours)
    var dxE = -a * Math.sin(p.E), dyE = b * Math.cos(p.E);
    var norm = Math.hypot(dxE, dyE);
    var lenPx = Math.max(16, Math.min(0.5 * a * s, (v / 30) * 0.30 * a * s));
    var vx = px + (dxE / norm) * lenPx;
    var vy = py - (dyE / norm) * lenPx;      // y écran inversé
    fleche(ctx, px, py, vx, vy, '#e86060', 2.5);
    texteHalo(ctx, 'v = ' + fmtFr(v, 1) + ' km/s',
              vx + (vx - px) * 0.18, vy + (vy - py) * 0.18 - fsBase * 0.7,
              '#e86060', '700 ' + Math.round(fsBase * 0.8) + 'px "Segoe UI", Arial, sans-serif');
  }

  // ── Temps simulé ──
  texteHalo(ctx, 't = ' + fmtFr(sim2.t, 0) + ' j', 16, 22, '#a8b8c8',
            '700 ' + (fsBase + 1) + 'px monospace', 'left');

  drawEchelle(ctx, H, s, 'ua');
}

// ══════════════════════════════════════════════════════════════════════
//  Onglet 3 — Systèmes réels
// ══════════════════════════════════════════════════════════════════════

function drawSys3() {
  var canvas = document.getElementById('canvas-sys3');
  if (!sizeCanvas(canvas)) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);

  var sys = SYSTEMES[sys3.sysIdx];

  // Échelle : l'orbite la plus externe (aphélie) tient dans la zone.
  var rMax = 0;
  sys.corps.forEach(function (cps) { rMax = Math.max(rMax, cps.a * (1 + cps.e)); });
  var pad = Math.max(34, Math.min(W, H) * 0.07);
  var s = (Math.min(W, H) / 2 - pad) / rMax;

  var fx = W / 2, fy = H / 2;                  // attracteur au foyer
  function sx(x) { return fx + x * s; }
  function sy(y) { return fy - y * s; }

  var fsNom = Math.max(11, Math.min(14, Math.min(W, H) * 0.026));
  var fontNom = '700 ' + fsNom + 'px "Segoe UI", Arial, sans-serif';

  // ── Orbites ──
  if (sys3.showOrbites) {
    ctx.strokeStyle = 'rgba(160,176,192,0.45)';
    ctx.lineWidth = 1.5;
    sys.corps.forEach(function (cps) {
      var bC = demiPetitAxe(cps.a, cps.e), cC = cps.a * cps.e;
      ctx.beginPath();
      ctx.ellipse(fx - cC * s, fy, cps.a * s, bC * s, 0, 0, 2 * Math.PI);
      ctx.stroke();
    });
  }

  // ── Attracteur ──
  if (sys.attracteur.type === 'soleil') {
    drawSoleil(ctx, fx, fy, Math.max(7, Math.min(12, s * rMax * 0.03)));
  } else {
    drawJupiter(ctx, fx, fy, Math.max(8, Math.min(13, s * rMax * 0.035)));
  }
  if (sys3.showNoms) {
    texteHalo(ctx, sys.attracteur.nom, fx, fy + fsNom * 1.9, '#98a8b8',
              'italic ' + fsNom + 'px "Segoe UI", Arial, sans-serif');
  }

  // ── Corps en orbite (teintes couleurClair : fond sombre) ──
  sys.corps.forEach(function (cps) {
    var M = 2 * Math.PI * sys3.t / cps.T;      // tous alignés à t = 0
    var p = posKepler(cps.a, cps.e, M);
    var px = sx(p.x), py = sy(p.y);
    ctx.beginPath();
    ctx.arc(px, py, cps.rayon, 0, 2 * Math.PI);
    ctx.fillStyle = cps.couleurClair;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (sys3.showNoms) {
      texteHalo(ctx, cps.nom, px + cps.rayon + 4, py - cps.rayon - 4,
                cps.couleurClair, fontNom, 'left');
    }
  });

  // ── Temps simulé ──
  var dec = (sys.uniteT === 'an' && sys3.t < 10) ? 2 : 1;
  texteHalo(ctx, 't = ' + fmtFr(sys3.t, dec) + ' ' + sys.uniteT, 16, 22,
            '#a8b8c8', '700 15px monospace', 'left');

  drawEchelle(ctx, H, s, sys.uniteA);
}
