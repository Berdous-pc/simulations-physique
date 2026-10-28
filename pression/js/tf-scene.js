// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  tf-scene.js — Onglet Transformations : rendu du cylindre
//  Chargé après tf-sim.js. Dessine, de bas en haut : isolant du fond,
//  gaz et tranches, parois et graduations, piston, loquet, plateau et masse.
//
//  Échelle verticale réelle (graduations en cm). Le cylindre, lui, est
//  ÉLARGI sur le dessin : à l'échelle, ses 5 cm de diamètre pour 50 cm de
//  haut en feraient un simple trait.
// ══════════════════════════════════════════════════════════════════════

'use strict';

var tfCanvas = document.getElementById('tf-canvas');
var tfCtx    = tfCanvas.getContext('2d');

// ── Habillage (m, repère du gaz : z = 0 au fond intérieur) ──
var TF_EP_PISTON  = 0.022;   // épaisseur dessinée du corps du piston
var TF_H_TIGE     = 0.045;   // tige entre piston et plateau
var TF_EP_PLATEAU = 0.008;
var TF_EP_FOND    = 0.010;   // paroi du fond
var TF_EP_ISOLANT = 0.045;   // isolant du fond, au plus épais (calorifugé)

// Largeur intérieure dessinée, au plus, en fraction de la hauteur dessinée
// du cylindre : au-delà, le cylindre deviendrait une boîte trapue.
var TF_LARG_MAX = 0.75;

// Hauteur dessinée d'une masse (m d'échelle) : croît avec la masse
function _tfHauteurMasse(kg) { return 0.022 + kg * 0.0008; }

// Étendue verticale à loger : sous le fond (paroi + isolant), au-dessus du
// cylindre (piston en butée haute + tige + plateau + plus grosse masse).
var TF_Z_BAS  = -(TF_EP_FOND + TF_EP_ISOLANT + 0.005);
var TF_Z_HAUT = TF_H_CYL + TF_EP_PISTON + TF_H_TIGE + TF_EP_PLATEAU
              + _tfHauteurMasse(TF_MASSES[TF_MASSES.length - 1]);

// ══════════════════════════════════════════════════════════════════════
//  Géométrie (px CSS)
// ══════════════════════════════════════════════════════════════════════

var _tfCw = 0, _tfCh = 0, _tfDpr = 1;
var _tfEch = 1;           // px par m
var _tfYBas = 0;          // ordonnée px de z = TF_Z_BAS
var _tfX1 = 0, _tfX2 = 0; // bords intérieurs du cylindre
var _tfParoi = 6;         // épaisseur des parois (px)

function _tfY(z) { return _tfYBas - (z - TF_Z_BAS) * _tfEch; }

var _tfResizeEnAttente = false;
function tfResize() {
  if (_tfResizeEnAttente) return;
  _tfResizeEnAttente = true;
  requestAnimationFrame(function () {
    _tfResizeEnAttente = false;
    _tfDoResize();
  });
}

function _tfDoResize() {
  var zone = tfCanvas.parentElement;
  _tfCw = zone.clientWidth;
  _tfCh = zone.clientHeight;
  if (_tfCw === 0 || _tfCh === 0) return;   // onglet masqué

  _tfDpr = window.devicePixelRatio || 1;
  tfCanvas.width  = Math.round(_tfCw * _tfDpr);
  tfCanvas.height = Math.round(_tfCh * _tfDpr);
  tfCtx.setTransform(_tfDpr, 0, 0, _tfDpr, 0, 0);

  var marge = Math.max(8, Math.round(Math.min(_tfCw, _tfCh) * 0.03));
  _tfEch  = (_tfCh - 2 * marge) / (TF_Z_HAUT - TF_Z_BAS);
  _tfYBas = _tfCh - marge;

  // Largeur : la plus grande possible, dans la limite de TF_LARG_MAX. Il faut
  // loger de part et d'autre les parois et les goupilles du loquet
  // (0,16·w + 2 parois ≈ 0,23·w chacune), plus à gauche les graduations
  // (~60 px) et à droite la tête des goupilles (~15 px).
  var hCyl = TF_H_CYL * _tfEch;
  var larg = Math.min(TF_LARG_MAX * hCyl, (_tfCw - 2 * marge - 75) / 1.46);
  larg = Math.max(40, larg);
  _tfParoi = Math.max(4, Math.round(larg * 0.035));
  var cote = 0.16 * larg + 2 * _tfParoi;           // paroi + goupille
  var libre = _tfCw - 2 * marge - (larg + 2 * cote + 75);
  _tfX1 = marge + Math.max(0, libre) / 2 + 60 + cote;
  _tfX2 = _tfX1 + larg;

  // Redimensionner le canvas l'a effacé : redessiner tout de suite plutôt
  // qu'à l'image suivante (pas de clignotement, et rien d'effacé en pause).
  tfDessiner();
}

// ══════════════════════════════════════════════════════════════════════
//  Rendu
// ══════════════════════════════════════════════════════════════════════

function tfDessiner() {
  if (_tfCw === 0 || _tfCh === 0) return;
  var c = tfCtx;

  c.fillStyle = '#fdf8f0';
  c.fillRect(0, 0, _tfCw, _tfCh);

  _tfDessinerFond();
  _tfDessinerGaz();
  _tfDessinerParois();
  _tfDessinerGraduations();
  _tfDessinerPiston();
}

// ── Paroi du fond et isolant (plus épais quand l'isolation est forte) ──
function _tfDessinerFond() {
  var c = tfCtx, p = _tfParoi;
  var x1 = _tfX1 - p, x2 = _tfX2 + p;

  // Isolant : épaisseur décroissante avec la conductance du fond
  var idx = TF_ISOLATIONS.indexOf(tf.G);
  var f   = idx < 0 ? 0 : idx / (TF_ISOLATIONS.length - 1);   // 0 calorifugé → 1 diathermane
  var ep  = TF_EP_ISOLANT * (1 - f);
  if (ep > 0.002) {
    var yH = _tfY(-TF_EP_FOND), yB = _tfY(-TF_EP_FOND - ep);
    var m  = (x2 - x1) * 0.08;
    c.fillStyle = '#e8dcc4';
    c.fillRect(x1 - m, yH, x2 - x1 + 2 * m, yB - yH);
    _tfHachures(x1 - m, yH, x2 - x1 + 2 * m, yB - yH, 'rgba(150,120,80,0.45)', 7);
    c.strokeStyle = '#b0a080';
    c.lineWidth = 1;
    c.strokeRect(x1 - m, yH, x2 - x1 + 2 * m, yB - yH);
  }

  // Paroi du fond : métal clair si conductrice, sombre sinon
  var y1 = _tfY(0), y2 = _tfY(-TF_EP_FOND);
  c.fillStyle = f > 0 ? '#7a8a96' : '#2c3e50';
  c.fillRect(x1, y1, x2 - x1, y2 - y1);
}

// ── Gaz et limites des tranches ──
function _tfDessinerGaz() {
  var c = tfCtx;
  var yP = _tfY(tf.z[TF_N]), y0 = _tfY(0);
  c.fillStyle = '#e6eef6';
  c.fillRect(_tfX1, yP, _tfX2 - _tfX1, y0 - yP);

  // Limites des tranches (même masse de gaz dans chacune) : elles se
  // resserrent dans une compression et rendent les ondes visibles au ralenti.
  c.strokeStyle = 'rgba(42,106,170,0.22)';
  c.lineWidth = 1;
  c.beginPath();
  for (var i = 1; i < TF_N; i++) {
    var y = Math.round(_tfY(tf.z[i])) + 0.5;
    c.moveTo(_tfX1, y);
    c.lineTo(_tfX2, y);
  }
  c.stroke();
}

// ── Parois latérales ──
function _tfDessinerParois() {
  var c = tfCtx, p = _tfParoi;
  var yH = _tfY(TF_H_CYL) - p, yB = _tfY(-TF_EP_FOND);
  c.fillStyle = '#2c3e50';
  c.fillRect(_tfX1 - p, yH, p, yB - yH);
  c.fillRect(_tfX2, yH, p, yB - yH);
  // Rebords du haut : la butée haute du piston
  c.fillRect(_tfX1 - p, yH, 2 * p, p);
  c.fillRect(_tfX2 - p, yH, 2 * p, p);
}

// ── Graduations (cm) à gauche du cylindre, au-delà des goupilles ──
function _tfDessinerGraduations() {
  var c = tfCtx;
  var x = _tfX1 - _tfParoi - _tfLongGoupille() - 8;
  var police = Math.max(10, Math.round(_tfEch * 0.022));
  c.strokeStyle = '#7a8a96';
  c.fillStyle   = '#5a6a78';
  c.lineWidth   = 1;
  c.font        = police + 'px monospace';
  c.textAlign   = 'right';
  c.textBaseline = 'middle';
  c.beginPath();
  for (var cm = 0; cm <= Math.round(TF_H_CYL * 100); cm++) {
    var y = Math.round(_tfY(cm / 100)) + 0.5;
    var l = cm % 10 === 0 ? 10 : (cm % 5 === 0 ? 7 : 4);
    c.moveTo(x - l, y);
    c.lineTo(x, y);
  }
  c.stroke();
  for (var d = 0; d <= Math.round(TF_H_CYL * 10); d++) {
    c.fillText(String(d * 10), x - 13, _tfY(d / 10));
  }
  c.textAlign = 'center';
  c.textBaseline = 'bottom';
  c.fillText('cm', x - 13, _tfY(TF_H_CYL) - police * 0.9);
}

// ── Piston, loquet, tige, plateau et masse ──
function _tfDessinerPiston() {
  var c = tfCtx;
  var zP = tf.z[TF_N];
  var x1 = _tfX1, x2 = _tfX2, w = x2 - x1, cx = (x1 + x2) / 2;

  // Tige
  var yTigeB = _tfY(zP + TF_EP_PISTON);
  var yTigeH = _tfY(zP + TF_EP_PISTON + TF_H_TIGE);
  var lt = Math.max(6, w * 0.10);
  c.fillStyle = '#6a7a88';
  c.fillRect(cx - lt / 2, yTigeH, lt, yTigeB - yTigeH);

  // Plateau
  var lp = w * 0.95;
  var yPlH = _tfY(zP + TF_EP_PISTON + TF_H_TIGE + TF_EP_PLATEAU);
  c.fillStyle = '#5a6a78';
  c.fillRect(cx - lp / 2, yPlH, lp, yTigeH - yPlH);

  // Masse posée
  if (tf.masse > 0) {
    var hm  = _tfHauteurMasse(tf.masse) * _tfEch;
    var lm  = w * 0.78;
    var yM  = yPlH - hm;
    c.fillStyle = '#3a4a58';
    _tfRectArrondi(cx - lm / 2, yM, lm, hm, Math.min(6, hm * 0.2));
    c.fill();
    c.fillStyle = '#fff';
    c.font = 'bold ' + Math.max(11, Math.round(Math.min(hm * 0.45, lm * 0.22))) + 'px "Segoe UI", Arial, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(tf.masse + ' kg', cx, yM + hm / 2);
  }

  // Corps du piston (hachuré, comme l'onglet Pression)
  var yH = _tfY(zP + TF_EP_PISTON), yB = _tfY(zP);
  c.fillStyle = '#8a9aaa';
  c.fillRect(x1, yH, w, yB - yH);
  _tfHachures(x1, yH, w, yB - yH, 'rgba(44,62,80,0.35)', 8);
  c.strokeStyle = '#2c3e50';
  c.lineWidth = 2;
  c.strokeRect(x1, yH, w, yB - yH);

  // Loquet : deux goupilles qui traversent la paroi et pénètrent dans le
  // piston (verrouillé), ou retirées à l'extérieur (libéré).
  // Libéré, chaque goupille recule juste assez pour dégager le cylindre.
  var hg = Math.max(4, (yB - yH) * 0.4);
  var yg = (yH + yB) / 2 - hg / 2;
  var lg = _tfLongGoupille();
  var sortie = tf.loquet ? 0 : lg - _tfParoi + 2;
  c.fillStyle   = tf.loquet ? '#c08020' : '#a0a8b0';
  c.strokeStyle = tf.loquet ? '#7a4a10' : '#6a7a88';
  c.lineWidth = 1;
  [[x1 - _tfParoi - sortie, 1], [x2 + _tfParoi + sortie, -1]].forEach(function (g) {
    var xg = g[1] > 0 ? g[0] : g[0] - lg;
    c.fillRect(xg, yg, lg, hg);
    c.strokeRect(xg + 0.5, yg + 0.5, lg - 1, hg - 1);
    // Tête de la goupille, côté extérieur
    var xt = g[1] > 0 ? xg - hg * 0.6 : xg + lg;
    c.fillRect(xt, yg - hg * 0.4, hg * 0.6, hg * 1.8);
  });
}

// ══════════════════════════════════════════════════════════════════════
//  Utilitaires de dessin
// ══════════════════════════════════════════════════════════════════════

// Longueur d'une goupille du loquet (px) : traverse la paroi et pénètre
// dans le piston
function _tfLongGoupille() { return (_tfX2 - _tfX1) * 0.16 + _tfParoi; }

function _tfHachures(x, y, w, h, couleur, pas) {
  var c = tfCtx;
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.strokeStyle = couleur;
  c.lineWidth = 1.5;
  c.beginPath();
  for (var hx = x - h; hx < x + w + h; hx += pas) {
    c.moveTo(hx, y);
    c.lineTo(hx + h, y + h);
  }
  c.stroke();
  c.restore();
}

function _tfRectArrondi(x, y, w, h, r) {
  var c = tfCtx;
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

window.addEventListener('resize', tfResize);
if (typeof ResizeObserver === 'function') {
  new ResizeObserver(tfResize).observe(tfCanvas.parentElement);
}
