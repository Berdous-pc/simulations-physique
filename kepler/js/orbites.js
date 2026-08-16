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

// Étiquette d'une flèche, centrée sur le MILIEU du trait et décalée
// perpendiculairement pour ne jamais le chevaucher : le décalage minimal tient
// compte de l'inclinaison (un texte horizontal « déborde » d'autant plus que la
// flèche est oblique). La position finale est recadrée dans le canvas.
//
// Choix du côté, deux modes :
//  - `cote` = ±1 : côté SOLIDAIRE de la flèche (normale obtenue par rotation
//    constante de sa direction). L'étiquette suit alors la flèche sans jamais
//    basculer, ce qu'il faut pour les flèches radiales r et a qui tournent avec
//    la planète — et comme a est l'opposée de r, leurs étiquettes se placent
//    automatiquement de part et d'autre de l'axe Soleil–planète.
//  - `cote` = 0 : côté opposé au point (refx, refy). À réserver aux flèches non
//    radiales (v) : sur une flèche pointant vers ce point, le critère serait
//    dégénéré et l'étiquette sauterait d'un côté à l'autre à chaque image.
function etiquetteFleche(ctx, x0, y0, x1, y1, txt, couleur, font, fs, W, H, cote, refx, refy) {
  var dx = x1 - x0, dy = y1 - y0;
  var len = Math.hypot(dx, dy);
  if (len < 2) return;
  var ux = dx / len, uy = dy / len;
  ctx.font = font;
  var w = ctx.measureText(txt).width, h = fs * 1.15;
  var mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  var nx = -uy, ny = ux;
  if (cote) {
    if (cote < 0) { nx = -nx; ny = -ny; }
  } else if (nx * (mx - refx) + ny * (my - refy) < 0) {
    nx = -nx; ny = -ny;
  }
  var d = Math.abs(uy) * w / 2 + Math.abs(ux) * h / 2 + 6;
  var lx = mx + nx * d, ly = my + ny * d;
  var marge = 6;
  lx = Math.max(marge + w / 2, Math.min(lx, W - marge - w / 2));
  ly = Math.max(marge + h / 2, Math.min(ly, H - marge - h / 2));
  texteHalo(ctx, txt, lx, ly, couleur, font);
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

// Double flèche (pointe à chaque extrémité) : pour représenter une longueur
// entre deux points précis (a, b, c…), par opposition à un vecteur (r, r′).
function flecheDouble(ctx, x0, y0, x1, y1, couleur, epaisseur) {
  var dx = x1 - x0, dy = y1 - y0;
  var len = Math.hypot(dx, dy);
  if (len < 2) return;
  var ux = dx / len, uy = dy / len;
  var head = Math.min(10, 3 + len * 0.08);
  ctx.strokeStyle = couleur;
  ctx.fillStyle = couleur;
  ctx.lineWidth = epaisseur;
  ctx.beginPath();
  ctx.moveTo(x0 + ux * head * 0.6, y0 + uy * head * 0.6);
  ctx.lineTo(x1 - ux * head * 0.6, y1 - uy * head * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * head - uy * head * 0.45, y1 - uy * head + ux * head * 0.45);
  ctx.lineTo(x1 - ux * head + uy * head * 0.45, y1 - uy * head - ux * head * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0 + ux * head + uy * head * 0.45, y0 + uy * head - ux * head * 0.45);
  ctx.lineTo(x0 + ux * head - uy * head * 0.45, y0 + uy * head + ux * head * 0.45);
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

// Saturne (attracteur de ses lunes) : disque doré + anneaux inclinés.
// Stylisation assumée : l'anneau est tracé entièrement par-dessus le disque.
function drawSaturne(ctx, x, y, rayon) {
  ctx.beginPath();
  ctx.arc(x, y, rayon, 0, 2 * Math.PI);
  ctx.fillStyle = '#d8b070';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(240,220,180,0.55)';
  ctx.fillRect(x - rayon, y - rayon * 0.4, 2 * rayon, rayon * 0.25);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, rayon, 0, 2 * Math.PI);
  ctx.strokeStyle = '#a07830';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y, rayon * 1.9, rayon * 0.65, -0.30, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(216,192,144,0.9)';
  ctx.lineWidth = Math.max(2, rayon * 0.3);
  ctx.stroke();
}

// Illustration réelle de la Terre (uniquement pour le système « Satellites
// terrestres » — les autres attracteurs restent des disques stylisés
// dessinés au canvas). Chargée une fois ; tant qu'elle ne l'est pas,
// drawTerreImg retombe sur le disque stylisé drawTerre ci-dessous.
var _imgTerre = new Image();
var _imgTerreReady = false;
_imgTerre.onload = function () { _imgTerreReady = true; drawSys3(); };
_imgTerre.src = 'terre.png';

// Rotation propre de la Terre sur elle-même : jour SIDÉRAL (23 h 56 min 04 s
// = 0,99727 j), pas le jour solaire de 24 h — même durée exacte que la
// période du satellite géostationnaire (SYSTEMES[1], cf. sim.js), ce n'est
// pas une coïncidence : c'est cette rotation qui définit son orbite.
var JOUR_SIDERAL = 0.99727;

function drawTerreImg(ctx, x, y, rayon, t) {
  if (!_imgTerreReady) { drawTerre(ctx, x, y, rayon); return; }
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, rayon, 0, 2 * Math.PI);
  ctx.clip();
  ctx.translate(x, y);
  // Signe négatif : ctx.rotate() tourne dans le sens horaire à l'écran (y
  // inversé), alors que les orbites de la scène (posKepler + sy()) sont
  // dessinées dans le sens antihoraire pour un mouvement direct — la Terre
  // doit tourner dans le même sens que ses satellites (rotation directe,
  // vue du pôle Nord).
  ctx.rotate(-2 * Math.PI * (t / JOUR_SIDERAL));
  ctx.drawImage(_imgTerre, -rayon, -rayon, 2 * rayon, 2 * rayon);
  ctx.restore();
}

// Terre stylisée (repli si l'image ne charge pas) : disque bleu + continents,
// même esprit que drawJupiter/drawSaturne — pas à l'échelle réelle
// (voir commentaire dans drawSys3 : le rayon terrestre est comparable à
// celui de l'orbite de l'ISS, aucune taille fixe ne conviendrait aux deux
// niveaux de zoom).
function drawTerre(ctx, x, y, rayon) {
  ctx.beginPath();
  ctx.arc(x, y, rayon, 0, 2 * Math.PI);
  ctx.fillStyle = '#2a6aaa';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(58,150,88,0.9)';
  ctx.beginPath(); ctx.arc(x - rayon * 0.3, y - rayon * 0.05, rayon * 0.42, 0, 2 * Math.PI); ctx.fill();
  ctx.beginPath(); ctx.arc(x + rayon * 0.4, y + rayon * 0.35, rayon * 0.3,  0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath(); ctx.arc(x, y - rayon * 0.95, rayon * 0.32, 0, 2 * Math.PI); ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, rayon, 0, 2 * Math.PI);
  ctx.strokeStyle = '#1a4a80';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// Planète stylisée (3ᵉ loi) : disque de base + détails « identité » selon
// le type (calotte de Mars, continents de la Terre, bandes de Jupiter,
// anneaux de Saturne…), dans l'esprit de drawJupiter/drawSaturne. Les
// détails ne sont dessinés que si le disque est assez grand (r ≥ 3 px) :
// en dessous — planètes internes vues dézoomées — un disque uni reste
// plus lisible qu'une bouillie de pixels.
function drawCorps(ctx, x, y, r, cps) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = cps.couleurClair;
  ctx.fill();

  if (r >= 3 && cps.type) {
    ctx.save();
    ctx.clip();                                  // les détails restent dans le disque
    switch (cps.type) {
      case 'mercure':                            // gris criblé de cratères
        ctx.fillStyle = 'rgba(70,80,90,0.5)';
        ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.2, r * 0.24, 0, 2 * Math.PI); ctx.fill();
        ctx.beginPath(); ctx.arc(x + r * 0.3,  y + r * 0.35, r * 0.2,  0, 2 * Math.PI); ctx.fill();
        ctx.beginPath(); ctx.arc(x + r * 0.2,  y - r * 0.45, r * 0.14, 0, 2 * Math.PI); ctx.fill();
        break;
      case 'venus':                              // voiles nuageux crème
        ctx.fillStyle = 'rgba(255,240,205,0.5)';
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-0.35);
        ctx.fillRect(-r, -r * 0.45, 2 * r, r * 0.3);
        ctx.fillRect(-r, r * 0.15,  2 * r, r * 0.26);
        ctx.restore();
        break;
      case 'terre':                              // continents + calotte polaire
        ctx.fillStyle = 'rgba(58,150,88,0.9)';
        ctx.beginPath(); ctx.arc(x - r * 0.3,  y - r * 0.05, r * 0.42, 0, 2 * Math.PI); ctx.fill();
        ctx.beginPath(); ctx.arc(x + r * 0.4,  y + r * 0.35, r * 0.3,  0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.arc(x, y - r * 0.95, r * 0.32, 0, 2 * Math.PI); ctx.fill();
        break;
      case 'mars':                               // calotte polaire + plaine sombre
        ctx.fillStyle = 'rgba(110,45,25,0.55)';
        ctx.beginPath(); ctx.arc(x + r * 0.25, y + r * 0.3, r * 0.4, 0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(x, y - r * 0.95, r * 0.3, 0, 2 * Math.PI); ctx.fill();
        break;
      case 'jupiter':                            // bandes + Grande Tache rouge
        ctx.fillStyle = 'rgba(230,200,160,0.55)';
        ctx.fillRect(x - r, y - r * 0.45, 2 * r, r * 0.28);
        ctx.fillRect(x - r, y + r * 0.15, 2 * r, r * 0.24);
        ctx.fillStyle = 'rgba(200,90,60,0.85)';
        ctx.beginPath();
        ctx.ellipse(x + r * 0.35, y + r * 0.27, r * 0.22, r * 0.13, 0, 0, 2 * Math.PI);
        ctx.fill();
        break;
      case 'saturne':                            // bande claire (anneaux après le clip)
        ctx.fillStyle = 'rgba(240,220,180,0.55)';
        ctx.fillRect(x - r, y - r * 0.4, 2 * r, r * 0.25);
        break;
      case 'uranus':                             // bande subtile (axe très incliné)
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(1.35);
        ctx.fillRect(-r, -r * 0.35, 2 * r, r * 0.25);
        ctx.restore();
        break;
      case 'neptune':                            // Grande Tache sombre
        ctx.fillStyle = 'rgba(26,50,120,0.75)';
        ctx.beginPath();
        ctx.ellipse(x - r * 0.25, y - r * 0.2, r * 0.32, r * 0.2, -0.3, 0, 2 * Math.PI);
        ctx.fill();
        break;
    }
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Anneaux hors du disque : Saturne (francs) et Uranus (fins, quasi
  // verticaux — l'axe de la planète est presque couché sur son orbite).
  if (r >= 3) {
    if (cps.type === 'saturne') {
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.9, r * 0.65, -0.30, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(216,192,144,0.9)';
      ctx.lineWidth = Math.max(1.5, r * 0.28);
      ctx.stroke();
    } else if (cps.type === 'uranus') {
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.5, r * 1.6, 0.2, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(200,235,245,0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
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
  var s = 1.2 * Math.min((W - 2 * padX) / (2 * A1_MAX), (H - 2 * padY) / (2 * A1_MAX));

  // Centre O de l'ellipse au centre du canvas ; Soleil au foyer F (droite).
  var ox = W / 2, oy = H / 2;
  var fx = ox + c * s, fy = oy;                 // foyer F (Soleil)
  var f2x = ox - c * s, f2y = oy;               // foyer F′

  // Conversion monde (origine au Soleil) → écran.
  function sx(x) { return fx + x * s; }
  function sy(y) { return fy - y * s; }

  var fsBase = Math.max(17, Math.min(23, Math.min(W, H) * 0.042));
  var fontMath  = 'italic 700 ' + fsBase + 'px "Segoe UI", Arial, sans-serif';
  var fontTexte = 'italic 600 ' + Math.round(fsBase * 0.86) + 'px "Segoe UI", Arial, sans-serif';

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
    // Demi-grand axe a : flèche O → aphélie (côté gauche)
    flecheDouble(ctx, ox, oy, ox - a * s, oy, '#6aa2e0', 2.5);
    texteHalo(ctx, 'a', ox - a * s / 2, oy - fsBase * 0.75, '#6aa2e0', fontMath);
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
    flecheDouble(ctx, ox, oy, ox, oy - b * s, '#58c088', 2.5);
    texteHalo(ctx, 'b', ox - fsBase * 0.7, oy - b * s / 2, '#58c088', fontMath);
  }

  // ── Foyers, centre et distance c ──
  if (sim1.showFoyers) {
    // Distance c = OF (uniquement si elle est visible à l'écran)
    if (c * s > 14) {
      flecheDouble(ctx, ox, oy, fx, fy, '#e87850', 2.5);
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
    texteHalo(ctx, 'F′', f2x - fsBase * 0.7, f2y + fsBase * 1.1, '#e87850', fontMath);
  }

  // ── Position de la planète (mouvement képlérien réel) ──
  var p = posKepler(a, e, sim1.M);
  var px = sx(p.x), py = sy(p.y);

  // ── Distances r et r′ aux deux foyers ──
  // r′ (et sa flèche) sont masqués quand e = 0 : les deux foyers sont alors
  // confondus et les deux tracés se superposeraient exactement.
  if (sim1.showDistances) {
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = '#e08050';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(fx, fy); ctx.stroke();
    if (e >= 0.01) {
      ctx.strokeStyle = '#c088e8';
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(f2x, f2y); ctx.stroke();
    }
    ctx.setLineDash([]);
    texteHalo(ctx, 'r',  (px + fx) / 2,  (py + fy) / 2 - fsBase * 0.6,  '#e08050', fontMath);
    if (e >= 0.01) {
      texteHalo(ctx, 'r′', (px + f2x) / 2, (py + f2y) / 2 - fsBase * 0.6, '#c088e8', fontMath);
    }
  }

  // ── Soleil au foyer F ──
  drawSoleil(ctx, fx, fy, Math.max(8, Math.min(13, s * 0.055)));
  if (sim1.showFoyers) {
    texteHalo(ctx, 'F', fx + fsBase * 0.75, fy + fsBase * 1.1, '#e87850', fontMath);
    texteHalo(ctx, 'Soleil', fx, fy - fsBase * 1.9, '#98a8b8', fontTexte);
  }

  // ── Planète ──
  ctx.beginPath();
  ctx.arc(px, py, 7, 0, 2 * Math.PI);
  ctx.fillStyle = '#4a8ad8';
  ctx.fill();
  ctx.strokeStyle = '#a8c8e8';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  texteHalo(ctx, 'planète', px, py - fsBase * 1.15, '#a8c8e8', fontTexte);

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
  var s = 1.1 * Math.min((W - 2 * padX) / (2 * a), (H - 2 * padY) / (2 * a));

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

  var fsVec = Math.round(fsBase * 1.05);
  var fontVec = '700 ' + fsVec + 'px "Segoe UI", Arial, sans-serif';

  // ── Vecteur position r (Soleil → planète) ──
  // Dessiné en premier : c'est le trait de construction, vitesse et
  // accélération doivent passer au-dessus.
  if (sim2.showRayon) {
    fleche(ctx, fx, fy, px, py, '#e0a850', 2.2);
    etiquetteFleche(ctx, fx, fy, px, py, 'r = ' + fmtFr(p.r, 2) + ' ua',
                    '#e0a850', fontVec, fsVec, W, H, +1);
  }

  // ── Vecteur accélération (gravitation : dirigé vers le Soleil, en 1/r²) ──
  if (sim2.showAccel) {
    var acc = A_TERRE_MMS2 / (p.r * p.r);                 // mm/s²
    var dxA = fx - px, dyA = fy - py;                      // direction planète → Soleil
    var distSol = Math.hypot(dxA, dyA) || 1;
    // Longueur ∝ acc (calée pour que a à 1 ua fasse ~0,22·a·s px), mais jamais
    // au-delà du Soleil : sans ce plafond, l'accélération explose en 1/r² près
    // du périhélie et la flèche traverse tout le dessin.
    var lenA = (acc / A_TERRE_MMS2) * 0.22 * a * s;
    lenA = Math.max(16, Math.min(lenA, 0.75 * distSol, 0.5 * a * s));
    var ax = px + (dxA / distSol) * lenA;
    var ay = py + (dyA / distSol) * lenA;
    fleche(ctx, px, py, ax, ay, '#58c088', 2.5);
    // Même signe que r : a étant l'opposée de r, l'étiquette se place d'elle-même
    // de l'autre côté de l'axe Soleil–planète.
    etiquetteFleche(ctx, px, py, ax, ay, 'a = ' + fmtFr(acc, 2) + ' mm/s²',
                    '#58c088', fontVec, fsVec, W, H, +1);
  }

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
    // v est ~perpendiculaire au rayon : le critère « à l'opposé du Soleil » est
    // ici bien défini, et il éloigne l'étiquette de celles de r et a.
    etiquetteFleche(ctx, px, py, vx, vy, 'v = ' + fmtFr(v, 1) + ' km/s',
                    '#e86060', fontVec, fsVec, W, H, 0, fx, fy);
  }

  // ── Temps simulé ──
  var fsT = Math.round(fsBase * 1.5);
  texteHalo(ctx, 't = ' + fmtFr(sim2.t, 0) + ' j', 16, fsT * 0.85 + 6, '#a8b8c8',
            '700 ' + fsT + 'px monospace', 'left');

  drawEchelle(ctx, H, s, 'ua');
}

// ══════════════════════════════════════════════════════════════════════
//  Onglet 3 — Systèmes réels
// ══════════════════════════════════════════════════════════════════════

// ── Ceinture d'astéroïdes (décor du Système Solaire) ──────────────────
// Champ de points entre Mars et Jupiter (2,1 → 3,3 ua). Orbites circulaires
// (approximation suffisante pour un décor) mais périodes képlériennes
// VRAIES (T = a^1,5) : les astéroïdes internes doublent visiblement les
// externes, la 3ᵉ loi continue de s'appliquer sous les yeux de l'élève.
// Générée une fois avec un petit LCG déterministe : la ceinture est
// identique à chaque chargement.
var _asteroides = null;

function _initAsteroides() {
  _asteroides = [];
  var graine = 42;
  function alea() {                              // LCG (Numerical Recipes)
    graine = (graine * 1664525 + 1013904223) >>> 0;
    return graine / 4294967296;
  }
  for (var i = 0; i < 350; i++) {
    var a = 2.1 + 1.2 * Math.pow(alea(), 0.7);   // densité un peu plus forte côté interne
    _asteroides.push({
      a: a,
      T: Math.pow(a, 1.5),                       // an (3ᵉ loi, attracteur = Soleil)
      phase: alea() * 2 * Math.PI,
      alpha: 0.25 + alea() * 0.5,
      taille: alea() < 0.85 ? 1 : 1.6            // quelques « gros » astéroïdes
    });
  }
}

function drawCeinture(ctx, sx, sy, W, H) {
  if (!_asteroides) _initAsteroides();
  ctx.fillStyle = '#c8d0d8';
  _asteroides.forEach(function (ast) {
    var ang = ast.phase + 2 * Math.PI * sys3.t / ast.T;
    var px = sx(ast.a * Math.cos(ang)), py = sy(ast.a * Math.sin(ang));
    if (px < -4 || px > W + 4 || py < -4 || py > H + 4) return;
    ctx.globalAlpha = ast.alpha;
    ctx.fillRect(px, py, ast.taille, ast.taille);
  });
  ctx.globalAlpha = 1;
}

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
  // Zoom (systèmes avec zoomMax uniquement, sinon sys3.zoom vaut 1) :
  // à zoom = 1 l'orbite la plus externe tient dans la zone, zoomer
  // agrandit l'échelle autour de l'attracteur, resté au centre.
  var s = (Math.min(W, H) / 2 - pad) / rMax * sys3.zoom;

  var fx = W / 2, fy = H / 2;                  // attracteur au foyer
  function sx(x) { return fx + x * s; }
  function sy(y) { return fy - y * s; }

  var fsNom = Math.max(14, Math.min(19, Math.min(W, H) * 0.034));
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

  // ── Ceinture d'astéroïdes (Système Solaire uniquement) ──
  if (sys.ceinture) drawCeinture(ctx, sx, sy, W, H);

  // ── Attracteur ──
  // Rayon symbolique par défaut (clamp indépendant de l'échelle réelle,
  // cf. commentaire de drawTerre) — sauf si `attracteur.rayonReel` est
  // fourni (en unité uniteA) : test demandé pour la Terre, dessinée alors à
  // sa vraie taille relative à l'échelle du canvas.
  var rAttracteur = sys.attracteur.rayonReel
    ? Math.max(1.5, sys.attracteur.rayonReel * s)
    : Math.max(8, Math.min(13, s * rMax * 0.035));
  if (sys.attracteur.type === 'soleil') {
    drawSoleil(ctx, fx, fy, rAttracteur);
  } else if (sys.attracteur.type === 'saturne') {
    drawSaturne(ctx, fx, fy, rAttracteur);
  } else if (sys.attracteur.type === 'terre') {
    drawTerreImg(ctx, fx, fy, rAttracteur, sys3.t);
  } else {
    drawJupiter(ctx, fx, fy, rAttracteur);
  }
  if (sys3.showNoms) {
    texteHalo(ctx, sys.attracteur.nom, fx, fy + fsNom * 1.9, '#98a8b8',
              'italic ' + fsNom + 'px "Segoe UI", Arial, sans-serif');
  }

  // ── Pointillés Terre → satellite géostationnaire ──
  // Segment du CENTRE de la Terre jusqu'au satellite (même direction radiale
  // que le point survolé, à la distance rAttracteur — le rayon RÉELLEMENT
  // dessiné pour la Terre, symbolique ou à l'échelle) ; le repère au sol
  // reste posé exactement sur ce point survolé.
  if (sys3.showGeoLigne && sys.geoNom) {
    var geoCps = sys.corps.filter(function (c) { return c.nom === sys.geoNom; })[0];
    if (geoCps) {
      var Mg = (geoCps.M0 || 0) + 2 * Math.PI * sys3.t / geoCps.T;
      var pg = posKepler(geoCps.a, geoCps.e, Mg);
      var pgx = sx(pg.x), pgy = sy(pg.y);
      var dxg = pgx - fx, dyg = pgy - fy;
      var distg = Math.hypot(dxg, dyg) || 1;
      var sxg = fx + (dxg / distg) * rAttracteur;
      var syg = fy + (dyg / distg) * rAttracteur;
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = geoCps.couleurClair;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(pgx, pgy);
      ctx.stroke();
      ctx.restore();
      // Repère au sol (point survolé)
      ctx.beginPath();
      ctx.arc(sxg, syg, 3, 0, 2 * Math.PI);
      ctx.fillStyle = geoCps.couleurClair;
      ctx.fill();
    }
  }

  // ── Corps en orbite (teintes couleurClair : fond sombre) ──
  sys.corps.forEach(function (cps) {
    // Tous alignés à t = 0, sauf phase M0 explicite (ex. ISS/Hubble : sans
    // décalage, deux orbites aussi proches se superposeraient exactement au
    // démarrage — impossible à distinguer visuellement).
    var M = (cps.M0 || 0) + 2 * Math.PI * sys3.t / cps.T;
    var p = posKepler(cps.a, cps.e, M);
    var px = sx(p.x), py = sy(p.y);
    // Orbite devenue minuscule à l'écran (dézoom du Système Solaire) : le
    // point rétrécit avec elle et son nom disparaît — c'est le message,
    // les planètes internes se réduisent à des poussières près du Soleil.
    var rDot = Math.min(cps.rayon, Math.max(1.5, cps.a * s * 0.25));
    drawCorps(ctx, px, py, rDot, cps);
    if (sys3.showNoms && cps.a * s > 26) {
      texteHalo(ctx, cps.nom, px + rDot + 4, py - rDot - 4,
                cps.couleurClair, fontNom, 'left');
    }
  });

  // ── Temps simulé ── (même taille que l'onglet 2ᵉ loi : fsBase*1.5)
  var dec = (sys.uniteT === 'an' && sys3.t < 10) ? 2 : 1;
  var fsBaseT = Math.max(13, Math.min(18, Math.min(W, H) * 0.033));
  var fsT3 = Math.round(fsBaseT * 1.5);
  texteHalo(ctx, 't = ' + fmtFr(sys3.t, dec) + ' ' + sys.uniteT, 16, fsT3 * 0.85 + 6,
            '#a8b8c8', '700 ' + fsT3 + 'px monospace', 'left');

  drawEchelle(ctx, H, s, sys.uniteA);
}
