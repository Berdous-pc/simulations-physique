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
// Le récipient ne prend pas tout le canvas — on laisse des marges
// pour afficher les étiquettes de chocs/s à l'extérieur.
var MARGIN_TOP    = 60;  // px — espace au-dessus du récipient (pour piston + étiquette)
var MARGIN_BOTTOM = 40;  // px
var MARGIN_LEFT   = 60;  // px — espace pour l'étiquette gauche
var MARGIN_RIGHT  = 60;  // px
var WALL_THICK    = 6;   // épaisseur des parois (px)

// ── Hauteur réservée à la tige du piston (visible au-dessus du récipient) ──
var PISTON_ROD_H    = 30;   // px
var PISTON_ROD_W    = 14;   // px
var PISTON_BODY_H   = 16;   // px  (hauteur du rectangle du piston)
var HATCH_SPACING   = 8;    // px  (espacement des hachures sur le piston)

// ── Dimensions dynamiques ──────────────────────────────────────────────
// Ces valeurs sont calculées dans resize() et utilisées par drawScene()
var _cw = 0;  // largeur canvas en px
var _ch = 0;  // hauteur canvas en px

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
  var dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(_cw * dpr);
  canvas.height = Math.round(_ch * dpr);
  canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);

  // ── Récipient carré : plus grand carré tenant dans la zone utile ──
  // Zone utile = canvas moins les marges (pour les étiquettes chocs/s)
  var availW = _cw - MARGIN_LEFT - MARGIN_RIGHT;
  var availH = _ch - MARGIN_TOP  - MARGIN_BOTTOM;
  var side   = Math.max(40, Math.min(availW, availH));  // côté du carré

  // Centre de la zone utile
  var cx = MARGIN_LEFT + availW / 2;
  var cy = MARGIN_TOP  + availH / 2;

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

  // ── Vitesse de base proportionnelle à la taille du récipient ──
  // Rescale les vitesses existantes si V0_PX change (redimensionnement fenêtre)
  var V0_PX_old = V0_PX;
  V0_PX = innerW * 0.18;
  G_PX  = V0_PX * G_FRAC;   // pesanteur recalibrée avec V0_PX
  if (V0_PX_old > 0 && sim.molecules.length > 0 && Math.abs(V0_PX - V0_PX_old) > 0.5) {
    var ratio = V0_PX / V0_PX_old;
    for (var i = 0; i < sim.molecules.length; i++) {
      sim.molecules[i].vx *= ratio;
      sim.molecules[i].vy *= ratio;
    }
  }

  // ── Recalcul du piston cible selon V courant ──
  var frac = (sim.V_L - 1.0) / (10.0 - 1.0);
  sim.pistonTargetY = sim.boxTopMin + frac * (sim.boxTopMax - sim.boxTopMin);

  // Recaler la position courante si c'est le premier redimensionnement
  if (sim.pistonY === 0) {
    sim.pistonY = sim.pistonTargetY;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Rendu complet d'une frame
// ══════════════════════════════════════════════════════════════════════

function drawScene() {
  if (_cw === 0 || _ch === 0) return;

  ctx.clearRect(0, 0, _cw, _ch);

  // Fond de la zone hors récipient
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
function _drawMolecules() {
  var mols = sim.molecules;
  var r    = MOL_RADIUS;

  for (var i = 0; i < mols.length; i++) {
    var m = mols[i];
    ctx.beginPath();
    ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#2a6aaa';
    ctx.fill();
    // Reflet pour le relief
    ctx.beginPath();
    ctx.arc(m.x - r * 0.28, m.y - r * 0.28, r * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.fill();
  }
}

// ── Overlays chocs/s ───────────────────────────────────────────────────
// Utilitaire : chemin rectangle arrondi
function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Attacher l'événement resize ────────────────────────────────────────
window.addEventListener('resize', resize);
