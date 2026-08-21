// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  recipient.js — Rendu canvas : récipient, piston, molécules, overlays
//  Dépend de : sim.js (sim, MOL_RADIUS, V0_PX)
//  Expose   : canvas, ctx, resize(), drawScene()
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Références canvas ──────────────────────────────────────────────────
var canvas = document.getElementById('recipient-canvas');
var ctx    = canvas.getContext('2d');

// ── Marges visuelles du récipient dans le canvas ──────────────────────
// Marge proportionnelle à la plus petite dimension du canvas : le récipient
// reste aéré sur grand écran sans se faire amputer sur petit écran.
var MARGIN_FRAC = 0.03;  // fraction de min(largeur, hauteur) du canvas
var MARGIN_MIN  = 8;     // px — plancher pour les très petits canvas
var WALL_THICK  = 6;     // épaisseur des parois (px)

// ── Piston ─────────────────────────────────────────────────────────────
var PISTON_ROD_W    = 14;   // px  (largeur de la tige)
var PISTON_BODY_H   = 16;   // px  (hauteur du rectangle du piston)
var HATCH_SPACING   = 8;    // px  (espacement des hachures sur le piston)

// ── Dimensions dynamiques ──────────────────────────────────────────────
// Ces valeurs sont calculées dans _doResize() et utilisées par drawScene()
var _cw  = 0;  // largeur canvas en px
var _ch  = 0;  // hauteur canvas en px
var _dpr = 1;  // densité de pixels de l'écran (window.devicePixelRatio)

// ── Anti-rebond resize ─────────────────────────────────────────────────
var _resizeRafPending = false;

function resize() {
  if (_resizeRafPending) return;
  _resizeRafPending = true;
  requestAnimationFrame(function () {
    _resizeRafPending = false;
    _doResize();
  });
}

function _doResize() {
  var area = canvas.parentElement;
  _cw = area.clientWidth;
  _ch = area.clientHeight;
  if (_cw === 0 || _ch === 0) return;   // conteneur pas encore mis en page

  _dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(_cw * _dpr);
  canvas.height = Math.round(_ch * _dpr);
  ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);

  // ── Mémorisation de l'ancienne géométrie ──
  // Elle sert à reporter le piston et les molécules à la même position
  // RELATIVE dans le nouveau récipient (cf. remapMoleculesToBox).
  var hadGeom   = (sim.boxRight > sim.boxLeft) && (sim.boxBottom > sim.pistonY);
  var oldGas    = { left  : sim.boxLeft,  right  : sim.boxRight,
                    top   : sim.pistonY,  bottom : sim.boxBottom };
  var oldTopMin = sim.boxTopMin;
  var oldTopMax = sim.boxTopMax;
  var V0_PX_old = V0_PX;

  // ── Récipient carré : plus grand carré tenant dans la zone utile ──
  // Marges proportionnelles au canvas (et non plus 60 px fixes, qui
  // amputaient le récipient de 120 px de large sur toutes les tailles
  // d'écran). En haut, il faut au minimum de quoi loger le corps du piston,
  // qui dépasse le sommet du récipient quand V est au maximum.
  var base   = Math.max(MARGIN_MIN, Math.round(Math.min(_cw, _ch) * MARGIN_FRAC));
  var mTop   = Math.max(base, PISTON_BODY_H + 6);
  var availW = _cw - 2 * base;
  var availH = _ch - mTop - base;
  var side   = Math.max(40, Math.min(availW, availH));  // côté du carré

  // Centre de la zone utile
  var cx = base + availW / 2;
  var cy = mTop + availH / 2;

  // Coins extérieurs du récipient (parois incluses)
  var rx1 = cx - side / 2;
  var rx2 = cx + side / 2;
  var ry1 = cy - side / 2;
  var ry2 = cy + side / 2;

  // Bords intérieurs (zone gaz)
  sim.boxLeft   = rx1 + WALL_THICK;
  sim.boxRight  = rx2 - WALL_THICK;
  sim.boxTop    = ry1 + WALL_THICK;   // haut fixe du récipient
  sim.boxBottom = ry2 - WALL_THICK;

  // Stocker les coins extérieurs pour le dessin des parois
  sim._rx1 = rx1;
  sim._rx2 = rx2;
  sim._ry1 = ry1;
  sim._ry2 = ry2;

  // ── Plage du piston ──
  // V = 10 L → piston tout en haut (= sim.boxTop)
  // V = 1 L  → piston à 1/10 de la hauteur intérieure depuis le bas
  var totalH    = sim.boxBottom - sim.boxTop;
  sim.boxTopMax = sim.boxTop;
  sim.boxTopMin = sim.boxBottom - totalH / 10;

  // ── Rayon des molécules proportionnel à la largeur intérieure ──
  var innerW = sim.boxRight - sim.boxLeft;
  MOL_RADIUS = Math.max(1, Math.round(innerW * MOL_RADIUS_FRAC));

  // ── Piston : cible depuis V, position courante depuis sa fraction de course ──
  // Reprendre la fraction (et non recaler sur la cible) préserve une
  // animation de piston en cours pendant le redimensionnement.
  var frac = (sim.V_L - 1.0) / (10.0 - 1.0);
  sim.pistonTargetY = sim.boxTopMin + frac * (sim.boxTopMax - sim.boxTopMin);

  var oldRange = oldTopMax - oldTopMin;
  if (!hadGeom || oldRange === 0) {
    sim.pistonY = sim.pistonTargetY;
  } else {
    var fCur = (sim.pistonY - oldTopMin) / oldRange;
    sim.pistonY = sim.boxTopMin + fCur * (sim.boxTopMax - sim.boxTopMin);
  }

  // ── Molécules : même position relative dans la nouvelle zone gaz ──
  if (hadGeom) remapMoleculesToBox(oldGas);

  // ── Vitesse de base proportionnelle à la taille du récipient ──
  // Les vitesses existantes sont rescalées dans le même rapport que les
  // positions : la trajectoire visible est identique après redimensionnement.
  V0_PX = innerW * 0.18;
  G_PX  = V0_PX * G_FRAC;   // pesanteur recalibrée avec V0_PX
  if (V0_PX_old > 0 && sim.molecules.length > 0 && Math.abs(V0_PX - V0_PX_old) > 0.5) {
    var ratio = V0_PX / V0_PX_old;
    for (var i = 0; i < sim.molecules.length; i++) {
      sim.molecules[i].vx *= ratio;
      sim.molecules[i].vy *= ratio;
    }
  }

  // La géométrie a changé : l'image doit être refaite, même en pause.
  sim.needsRedraw = true;
}

// ══════════════════════════════════════════════════════════════════════
//  Rendu complet d'une frame
// ══════════════════════════════════════════════════════════════════════

function drawScene() {
  if (_cw === 0 || _ch === 0) return;

  // Fond opaque de tout le canvas (couvre la frame précédente : pas besoin
  // d'un clearRect préalable)
  ctx.fillStyle = '#fdf8f0';
  ctx.fillRect(0, 0, _cw, _ch);

  _drawRecipient();
  _drawMolecules();
}

// ── Dessin du récipient ────────────────────────────────────────────────
function _drawRecipient() {
  var x1 = sim.boxLeft;
  var x2 = sim.boxRight;
  var yb = sim.boxBottom;
  var yt = sim.boxTop;
  var py = sim.pistonY;

  // Coins extérieurs (parois incluses)
  var rx1 = sim._rx1;
  var rx2 = sim._rx2;
  var ry1 = sim._ry1;
  var ry2 = sim._ry2;

  // ── Zone au-dessus du piston (fond neutre — hors gaz) ──
  ctx.fillStyle = '#dedad2';
  ctx.fillRect(x1, yt, x2 - x1, py - yt);

  // ── Zone gaz (sous le piston) ──
  ctx.fillStyle = '#f5f0e8';
  ctx.fillRect(x1, py, x2 - x1, yb - py);

  // ── Parois : gauche, droite, bas (pas de toit — piston libre vers le haut) ──
  ctx.fillStyle = '#2c3e50';
  ctx.fillRect(rx1, ry1, WALL_THICK, ry2 - ry1);              // gauche
  ctx.fillRect(rx2 - WALL_THICK, ry1, WALL_THICK, ry2 - ry1); // droite
  ctx.fillRect(rx1, ry2 - WALL_THICK, rx2 - rx1, WALL_THICK); // bas

  // ── Piston ──
  _drawPiston(x1, x2, py, yt);
}

// ── Dessin du piston ────────────────────────────────────────────────────
function _drawPiston(x1, x2, pistonY, boxTop) {
  var cx = (x1 + x2) / 2;
  var w  = x2 - x1;

  // Tige : depuis le haut du canvas (y=0) jusqu'au dessus du corps du piston
  var rodTop = 0;
  var rodH   = pistonY - PISTON_BODY_H - rodTop;
  if (rodH > 0) {
    ctx.fillStyle = '#6a7a88';
    ctx.fillRect(cx - PISTON_ROD_W / 2, rodTop, PISTON_ROD_W, rodH);
  }

  // Corps du piston (rectangle hachuré)
  var px = x1;
  var py = pistonY - PISTON_BODY_H;
  var pw = w;
  var ph = PISTON_BODY_H;

  // Fond du piston
  ctx.fillStyle = '#8a9aaa';
  ctx.fillRect(px, py, pw, ph);

  // Hachures sur le piston
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();
  ctx.strokeStyle = 'rgba(44,62,80,0.35)';
  ctx.lineWidth = 1.5;
  for (var hx = px - ph; hx < px + pw + ph; hx += HATCH_SPACING) {
    ctx.beginPath();
    ctx.moveTo(hx, py);
    ctx.lineTo(hx + ph, py + ph);
    ctx.stroke();
  }
  ctx.restore();

  // Contour du piston
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, pw, ph);
}

// ── Dessin des molécules ───────────────────────────────────────────────
// Les molécules sont toutes identiques : on les dessine une seule fois dans
// un canvas hors écran (le « sprite »), puis on se contente de le recopier.
// Le tracé direct coûtait deux chemins et deux changements de fillStyle par
// molécule, soit 600 chemins par image à N = 300.
var _molSprite     = null;   // canvas hors écran
var _molSpriteR    = -1;     // rayon pour lequel il a été rendu
var _molSpriteDpr  = 0;      // densité de pixels pour laquelle il a été rendu
var _molSpriteSize = 0;      // côté du sprite en px CSS

function _buildMolSprite() {
  var r   = MOL_RADIUS;
  var pad = 1;                    // marge pour l'anticrénelage du bord
  var size = 2 * r + 2 * pad;

  var c = document.createElement('canvas');
  c.width  = Math.ceil(size * _dpr);
  c.height = Math.ceil(size * _dpr);

  var g = c.getContext('2d');
  g.setTransform(_dpr, 0, 0, _dpr, 0, 0);

  var cx = size / 2;
  var cy = size / 2;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = '#2a6aaa';
  g.fill();
  // Reflet pour le relief
  g.beginPath();
  g.arc(cx - r * 0.28, cy - r * 0.28, r * 0.38, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.30)';
  g.fill();

  _molSprite     = c;
  _molSpriteR    = r;
  _molSpriteDpr  = _dpr;
  _molSpriteSize = size;
}

function _drawMolecules() {
  var mols = sim.molecules;
  if (!mols.length) return;

  if (!_molSprite || _molSpriteR !== MOL_RADIUS || _molSpriteDpr !== _dpr) {
    _buildMolSprite();
  }

  var s = _molSpriteSize;
  var o = s / 2;
  for (var i = 0; i < mols.length; i++) {
    ctx.drawImage(_molSprite, mols[i].x - o, mols[i].y - o, s, s);
  }
}

// ── Attacher l'événement resize ────────────────────────────────────────
window.addEventListener('resize', resize);
