// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  recipient.js — Rendu canvas : récipient, molécules
//  Dépend de : sim.js (sim, MOL_RADIUS, V0_PX, SPECIES_COLORS)
//  Expose   : canvas, ctx, resize(), drawScene()
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Références canvas ──────────────────────────────────────────────────
var canvas = document.getElementById('recipient-canvas');
var ctx    = canvas.getContext('2d');

// ── Marges visuelles du récipient dans le canvas ──────────────────────
var MARGIN = 24;       // px — marge autour du récipient
var WALL_THICK = 6;    // épaisseur des parois (px)

// ── Dimensions dynamiques (calculées dans resize()) ────────────────────
var _cw = 0;
var _ch = 0;

// ── Anti-rebond resize ──────────────────────────────────────────────────
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

  // ── Récipient : occupe toute la zone utile, moins les marges ──
  var rx1 = MARGIN;
  var rx2 = _cw - MARGIN;
  var ry1 = MARGIN;
  var ry2 = _ch - MARGIN;

  sim._rx1 = rx1; sim._rx2 = rx2;
  sim._ry1 = ry1; sim._ry2 = ry2;

  // Ancienne zone intérieure, mémorisée avant écrasement : les positions des
  // molécules sont en pixels du canvas, elles doivent donc être transposées
  // dans le nouveau repère (sinon elles restent groupées là où était l'ancien
  // récipient, voire hors du nouveau cadre).
  var oldL = sim.boxLeft, oldR = sim.boxRight;
  var oldT = sim.boxTop,  oldB = sim.boxBottom;
  var oldW = oldR - oldL, oldH = oldB - oldT;

  // Bords intérieurs (zone eau)
  sim.boxLeft   = rx1 + WALL_THICK;
  sim.boxRight  = rx2 - WALL_THICK;
  sim.boxTop    = ry1 + WALL_THICK;
  sim.boxBottom = ry2 - WALL_THICK;

  // ── Rayon des molécules proportionnel à la largeur intérieure ──
  var innerW = sim.boxRight - sim.boxLeft;
  MOL_RADIUS = Math.max(1, Math.round(innerW * MOL_RADIUS_FRAC));

  // ── Transposition des positions : coordonnées relatives conservées ──
  if (oldW > 0 && oldH > 0 && sim.molecules.length > 0) {
    var newW = sim.boxRight - sim.boxLeft;
    var newH = sim.boxBottom - sim.boxTop;
    var xlo = sim.boxLeft   + MOL_RADIUS;
    var xhi = sim.boxRight  - MOL_RADIUS;
    var ylo = sim.boxTop    + MOL_RADIUS;
    var yhi = sim.boxBottom - MOL_RADIUS;
    for (var p = 0; p < sim.molecules.length; p++) {
      var m = sim.molecules[p];
      var nx = sim.boxLeft + ((m.x - oldL) / oldW) * newW;
      var ny = sim.boxTop  + ((m.y - oldT) / oldH) * newH;
      m.x = Math.min(xhi, Math.max(xlo, nx));
      m.y = Math.min(yhi, Math.max(ylo, ny));
    }
  }

  // ── Vitesse de base proportionnelle à la taille du récipient ──
  // Rescale les vitesses existantes si V0_PX change (redimensionnement fenêtre)
  var V0_PX_old = V0_PX;
  V0_PX = innerW * 0.16;
  if (V0_PX_old > 0 && sim.molecules.length > 0 && Math.abs(V0_PX - V0_PX_old) > 0.5) {
    var ratio = V0_PX / V0_PX_old;
    for (var i = 0; i < sim.molecules.length; i++) {
      sim.molecules[i].vx *= ratio;
      sim.molecules[i].vy *= ratio;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Rendu complet d'une frame
// ══════════════════════════════════════════════════════════════════════

function drawScene() {
  if (_cw === 0 || _ch === 0) return;

  ctx.clearRect(0, 0, _cw, _ch);

  ctx.fillStyle = '#fdf8f0';
  ctx.fillRect(0, 0, _cw, _ch);

  _drawRecipient();
  _drawMolecules();
}

// ── Dessin du récipient (grand bécher rempli d'eau) ────────────────────
function _drawRecipient() {
  var rx1 = sim._rx1, rx2 = sim._rx2;
  var ry1 = sim._ry1, ry2 = sim._ry2;

  // Eau
  ctx.fillStyle = '#dce8f0';
  ctx.fillRect(sim.boxLeft, sim.boxTop, sim.boxRight - sim.boxLeft, sim.boxBottom - sim.boxTop);

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

function _drawMolecules() {
  var mols = sim.molecules;
  var r    = MOL_RADIUS;

  for (var i = 0; i < mols.length; i++) {
    var m = mols[i];
    drawSphere(ctx, m.x, m.y, r, SPECIES_COLORS[m.type].fill);
  }
}

// ── Attacher l'événement resize ────────────────────────────────────────
window.addEventListener('resize', resize);
