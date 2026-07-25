// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  recipient.js — Rendu canvas : récipient, molécules
//  Dépend de : sim.js (sims, MOL_RADIUS_FRAC, SPECIES_COLORS)
//  Expose   : attachCanvas(s), resizeAll(), resizeRecipient(s), drawScene(s)
//  Chaque simulation a son propre canvas (#recipient-canvas-1 / -2) ;
//  toutes les fonctions prennent donc l'instance `s` en argument.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Marges visuelles du récipient dans le canvas ──────────────────────
var MARGIN = 24;       // px — marge autour du récipient
var WALL_THICK = 6;    // épaisseur des parois (px)

// Associe à l'instance son canvas et son contexte 2D.
function attachCanvas(s) {
  s.canvas = document.getElementById('recipient-canvas-' + s.index);
  s.ctx    = s.canvas ? s.canvas.getContext('2d') : null;
}

// ── Anti-rebond resize ──────────────────────────────────────────────────
var _resizeRafPending = false;

// Redimensionne les canvas de toutes les simulations affichées.
function resizeAll() {
  if (_resizeRafPending) return;
  _resizeRafPending = true;
  requestAnimationFrame(function () {
    _resizeRafPending = false;
    activeSims().forEach(function (s) { resizeRecipient(s); });
  });
}

function resizeRecipient(s) {
  if (!s.canvas) return;
  var area = s.canvas.parentElement;
  s.cw = area.clientWidth;
  s.ch = area.clientHeight;
  if (s.cw < 1 || s.ch < 1) return;
  var dpr = window.devicePixelRatio || 1;
  s.canvas.width  = Math.round(s.cw * dpr);
  s.canvas.height = Math.round(s.ch * dpr);
  s.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // ── Récipient : occupe toute la zone utile, moins les marges ──
  var rx1 = MARGIN;
  var rx2 = s.cw - MARGIN;
  var ry1 = MARGIN;
  var ry2 = s.ch - MARGIN;

  // Ancienne zone intérieure, mémorisée avant écrasement : les positions des
  // molécules sont en pixels du canvas, elles doivent donc être transposées
  // dans le nouveau repère (sinon elles restent groupées là où était l'ancien
  // récipient, voire hors du nouveau cadre).
  var oldL = s.boxLeft, oldR = s.boxRight;
  var oldT = s.boxTop,  oldB = s.boxBottom;
  var oldW = oldR - oldL, oldH = oldB - oldT;

  s._rx1 = rx1; s._rx2 = rx2;
  s._ry1 = ry1; s._ry2 = ry2;

  // Bords intérieurs (zone eau)
  s.boxLeft   = rx1 + WALL_THICK;
  s.boxRight  = rx2 - WALL_THICK;
  s.boxTop    = ry1 + WALL_THICK;
  s.boxBottom = ry2 - WALL_THICK;

  // ── Rayon des molécules proportionnel à la largeur intérieure ──
  var innerW = s.boxRight - s.boxLeft;
  s.molRadius = Math.max(1, Math.round(innerW * MOL_RADIUS_FRAC));

  // ── Transposition des positions : coordonnées relatives conservées ──
  if (oldW > 0 && oldH > 0 && s.molecules.length > 0) {
    var newW = s.boxRight - s.boxLeft;
    var newH = s.boxBottom - s.boxTop;
    var xlo = s.boxLeft   + s.molRadius;
    var xhi = s.boxRight  - s.molRadius;
    var ylo = s.boxTop    + s.molRadius;
    var yhi = s.boxBottom - s.molRadius;
    for (var p = 0; p < s.molecules.length; p++) {
      var m = s.molecules[p];
      var nx = s.boxLeft + ((m.x - oldL) / oldW) * newW;
      var ny = s.boxTop  + ((m.y - oldT) / oldH) * newH;
      m.x = Math.min(xhi, Math.max(xlo, nx));
      m.y = Math.min(yhi, Math.max(ylo, ny));
    }
  }

  // ── Vitesse de base proportionnelle à la taille du récipient ──
  // Rescale les vitesses existantes si v0px change (redimensionnement fenêtre)
  var v0old = s.v0px;
  s.v0px = innerW * 0.16;
  if (v0old > 0 && s.molecules.length > 0 && Math.abs(s.v0px - v0old) > 0.5) {
    var ratio = s.v0px / v0old;
    for (var i = 0; i < s.molecules.length; i++) {
      s.molecules[i].vx *= ratio;
      s.molecules[i].vy *= ratio;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Rendu complet d'une frame
// ══════════════════════════════════════════════════════════════════════

function drawScene(s) {
  if (!s.ctx || s.cw === 0 || s.ch === 0) return;
  var ctx = s.ctx;

  ctx.clearRect(0, 0, s.cw, s.ch);

  ctx.fillStyle = '#fdf8f0';
  ctx.fillRect(0, 0, s.cw, s.ch);

  _drawRecipient(s);
  _drawMolecules(s);
}

// ── Dessin du récipient (grand bécher rempli d'eau) ────────────────────
function _drawRecipient(s) {
  var ctx = s.ctx;
  var rx1 = s._rx1, rx2 = s._rx2;
  var ry1 = s._ry1, ry2 = s._ry2;

  // Eau
  ctx.fillStyle = '#dce8f0';
  ctx.fillRect(s.boxLeft, s.boxTop, s.boxRight - s.boxLeft, s.boxBottom - s.boxTop);

  // Parois (4 côtés — récipient fermé)
  ctx.fillStyle = '#2c3e50';
  ctx.fillRect(rx1, ry1, rx2 - rx1, WALL_THICK);                    // haut
  ctx.fillRect(rx1, ry2 - WALL_THICK, rx2 - rx1, WALL_THICK);       // bas
  ctx.fillRect(rx1, ry1, WALL_THICK, ry2 - ry1);                    // gauche
  ctx.fillRect(rx2 - WALL_THICK, ry1, WALL_THICK, ry2 - ry1);       // droite
}

// ── Dessin d'une molécule (disque uni + fine bordure noire) ─────────────
// La bordure est noire (et non la couleur `border` de SPECIES_COLORS, qui
// reste utilisée ailleurs — ex. pastilles de légende) pour bien détacher
// chaque molécule du fond et des molécules voisines de couleur proche.
function drawSphere(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(0.75, r * 0.18);
  ctx.strokeStyle = '#1a1a1a';
  ctx.stroke();
}

function _drawMolecules(s) {
  var mols = s.molecules;
  var r    = s.molRadius;

  for (var i = 0; i < mols.length; i++) {
    var m = mols[i];
    drawSphere(s.ctx, m.x, m.y, r, SPECIES_COLORS[m.type].fill);
  }
}

// ── Attacher l'événement resize ────────────────────────────────────────
window.addEventListener('resize', resizeAll);
