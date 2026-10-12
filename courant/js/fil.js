// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  fil.js — Rendu canvas
//  Dépend de : sim.js.  Expose : canvas, ctx, resize(), drawScene().
//
//  La scène est découpée en cinq bandes horizontales, toutes exprimées en
//  fraction de la hauteur du canvas — rien n'est fixé en pixels, la page
//  se projette donc aussi bien sur un vidéoprojecteur que sur un portable :
//
//    1. schéma du circuit fermé (générateur + interrupteur)
//    2. traits de loupe reliant la portion étudiée au fil agrandi
//    3. flèche du sens conventionnel du courant
//    4. le fil lui-même : réseau de cations + électrons libres
//    5. cote de la tension U et repères des bornes
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Références canvas ──────────────────────────────────────────────────
var canvas = document.getElementById('scene-canvas');
var ctx    = canvas.getContext('2d');

// ── Palette (charte du site) ───────────────────────────────────────────
var C_BG        = '#fdf8f0';
var C_TUBE_IN   = '#f7efe2';
var C_WALL      = '#b0a898';
var C_WALL_EDGE = '#8a8478';
var C_WIRE      = '#5a6a78';
var C_WIRE_HL   = '#2c3e50';
var C_TEXT      = '#2c3e50';
var C_TEXT_SOFT = '#7a8a96';
var C_CURRENT   = '#cc2200';
var C_PLUS      = 'rgba(210,100,20,1)';
var C_MINUS     = 'rgba(40,80,180,1)';
var C_TRACE     = 'rgba(122,58,208,0.72)';
var C_TRACED    = '#7a3ad0';
var C_TRACED_ED = '#4d1f8c';
var C_HOLE_TRACE = 'rgba(194,87,12,0.85)';   // trace d'une lacune : teinte orange, celle des charges +
var C_ARROW     = 'rgba(28,76,125,0.95)';   // flèche de vitesse

// ── Espèces de particules : un seul code couleur pour tous les modes ───
// Deux axes indépendants :
//  - la TEINTE donne le signe : orange = positif, bleu = négatif (c'est
//    aussi la convention des repères de bornes + et –) ;
//  - la SATURATION donne le statut de la charge : plein = charge libre ou
//    non compensée ; pâle = charge liée ou compensée par sa voisine.
// Le signe est blanc sur un fond plein, de la couleur foncée de l'espèce
// sur un fond pâle (sinon il disparaît). Le rouge reste réservé au courant,
// le gris à la structure (parois, orbites).
// Scène et légende dessinent toutes deux avec drawParticle : elles ne
// peuvent pas diverger.
var SPECIES = {
  elecFree   : { plus: false, fill: '#2a6aaa', edge: '#1c4c7d', sign: '#fff' },
  elecBound  : { plus: false, fill: '#a9c9e8', edge: '#2a6aaa', sign: '#1c4c7d' },
  ion        : { plus: true,  fill: 'rgba(180,80,40,0.75)', edge: 'rgba(140,55,25,0.90)', sign: '#fff' },
  nucleus    : { plus: true,  fill: '#f2cdb0', edge: 'rgba(140,55,25,0.90)', sign: '#8c3719' },
  elecTraced : { plus: false, fill: C_TRACED, edge: C_TRACED_ED, sign: '#fff' }
};

// ── Dimensions courantes ───────────────────────────────────────────────
var _cw = 0, _ch = 0, _dpr = 1;

// ── Géométrie calculée à chaque redimensionnement ──────────────────────
var _L = {
  F        : 12,   // taille de police de référence (px)
  wall     : 6,    // épaisseur des parois du fil
  tubeX1   : 0, tubeX2 : 0,   // bords EXTÉRIEURS du fil
  tubeY1   : 0, tubeY2 : 0,
  arrowCY  : 0,    // ordonnée de la flèche du courant
  coteCY   : 0,    // ordonnée de la cote de tension
  sx1 : 0, sx2 : 0, sy1 : 0, sy2 : 0,   // rectangle du circuit schématique
  sLw : 2,         // épaisseur du trait du schéma
  hl1 : 0, hl2 : 0 // portion étudiée sur la branche basse du schéma
};

// ── Anti-rebond du redimensionnement ───────────────────────────────────
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

  // Pixels physiques pour la netteté sur écran haute densité, puis retour
  // au repère en pixels CSS pour tout le dessin.
  _dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(_cw * _dpr);
  canvas.height = Math.round(_ch * _dpr);
  ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);

  // Ancienne géométrie intérieure : elle sert à reporter les électrons à
  // la même position relative dans le fil redimensionné.
  var hadGeom = (sim.tx2 > sim.tx1) && (sim.ty2 > sim.ty1);
  var ox1 = sim.tx1, oy1 = sim.ty1;
  var ow  = sim.tx2 - sim.tx1, oh = sim.ty2 - sim.ty1;

  var pad     = Math.max(8, Math.min(_cw, _ch) * 0.025);
  var usableH = _ch - 2 * pad;

  _L.F    = Math.max(9, Math.min(_cw * 0.016, _ch * 0.030));
  _L.wall = Math.max(3, usableH * 0.38 * 0.075);

  // ── Découpe verticale (fractions de la hauteur utile) ──
  var hSchem = usableH * 0.30;
  var hGap   = usableH * 0.09;
  var hArrow = usableH * 0.11;
  var hTube  = usableH * 0.38;

  var yTop = pad;
  _L.sy1 = yTop + hSchem * 0.28;
  _L.sy2 = yTop + hSchem * 0.94;

  _L.arrowCY = yTop + hSchem + hGap + hArrow * 0.52;
  _L.tubeY1  = yTop + hSchem + hGap + hArrow;
  _L.tubeY2  = _L.tubeY1 + hTube;
  _L.coteCY  = _L.tubeY2 + (_ch - pad - _L.tubeY2) * 0.46;

  // ── Fil : le plus large possible, marges latérales aérées ──
  var sideM = Math.max(pad, _cw * 0.045);
  _L.tubeX1 = sideM;
  _L.tubeX2 = _cw - sideM;

  // Les côtés gauche et droit n'ont PAS de paroi : le fil se prolonge
  // hors du cadre, et l'intérieur va donc jusqu'aux bords extérieurs.
  sim.tx1 = _L.tubeX1;
  sim.tx2 = _L.tubeX2;
  sim.ty1 = _L.tubeY1 + _L.wall;
  sim.ty2 = _L.tubeY2 - _L.wall;

  // ── Schéma du circuit : rectangle centré, nettement plus étroit que le
  //    fil agrandi pour que les traits de loupe s'ouvrent vers l'extérieur.
  var sW = Math.min(_cw * 0.46, hSchem * 2.8);
  var scx = _cw / 2;
  _L.sx1 = scx - sW / 2;
  _L.sx2 = scx + sW / 2;
  _L.sLw = Math.max(2, hSchem * 0.035);
  _L.hl1 = scx - sW * 0.30;
  _L.hl2 = scx + sW * 0.30;

  updateGeometry();

  if (hadGeom) {
    remapElectrons(ox1, oy1, ow, oh);
    // Une fenêtre plus large montre un plus long morceau de fil, donc plus
    // de sites de réseau : l'effectif d'électrons suit, pour que le fil
    // reste neutre.
    syncElectronCount();
  } else {
    initElectrons();
  }

  // Semi-conducteur : le nombre d'atomes a changé, donc le cristal a été
  // reconstruit sans ion. On repart de l'équilibre thermique, une fois les
  // électrons reportés (seedSemi les crée à leur place définitive).
  if (sim.reseed) {
    sim.reseed = false;
    if (sim.material === 'semi') seedSemi();
  }

  paintLegend();
  sim.needsRedraw = true;
}

// ══════════════════════════════════════════════════════════════════════
//  Utilitaires de dessin
// ══════════════════════════════════════════════════════════════════════

function _roundRect(x, y, w, h, r) {
  if (r > w / 2) r = w / 2;
  if (r > h / 2) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// Flèche horizontale pleine, de x1 vers x2, à l'ordonnée y.
function _arrowH(x1, x2, y, thick, color) {
  var dir  = (x2 >= x1) ? 1 : -1;
  var head = Math.min(Math.abs(x2 - x1) * 0.35, thick * 3.2);
  var xb   = x2 - dir * head;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y - thick / 2);
  ctx.lineTo(xb, y - thick / 2);
  ctx.lineTo(xb, y - thick * 1.5);
  ctx.lineTo(x2, y);
  ctx.lineTo(xb, y + thick * 1.5);
  ctx.lineTo(xb, y + thick / 2);
  ctx.lineTo(x1, y + thick / 2);
  ctx.closePath();
  ctx.fill();
}

// Petit triangle de sens, posé sur un fil du schéma.
// (dx, dy) est le vecteur unitaire du sens du courant.
function _currentTip(x, y, dx, dy, size) {
  var px = -dy, py = dx;   // normale
  ctx.fillStyle = C_CURRENT;
  ctx.beginPath();
  ctx.moveTo(x + dx * size, y + dy * size);
  ctx.lineTo(x - dx * size * 0.55 + px * size * 0.75, y - dy * size * 0.55 + py * size * 0.75);
  ctx.lineTo(x - dx * size * 0.55 - px * size * 0.75, y - dy * size * 0.55 - py * size * 0.75);
  ctx.closePath();
  ctx.fill();
}

// Signe « − » ou « + » centré, dimensionné sur le rayon du disque.
// `g` : contexte de dessin (celui de la scène par défaut).
function _drawSign(x, y, r, plus, color, g) {
  g = g || ctx;
  var w = r * 1.15, t = Math.max(1.4, r * 0.28);
  g.fillStyle = color || '#fff';
  g.fillRect(x - w / 2, y - t / 2, w, t);
  if (plus) g.fillRect(x - t / 2, y - w / 2, t, w);
}

// Une particule : disque, contour et signe, selon son espèce (cf. SPECIES).
// Remplissage et contour sont posés à chaque appel : le signe change la
// couleur de remplissage, et les disques suivants ne doivent pas en hériter.
function drawParticle(sp, x, y, r, g) {
  g = g || ctx;
  g.lineWidth   = Math.max(1, r * (sp.plus ? 0.11 : 0.18));
  g.fillStyle   = sp.fill;
  g.strokeStyle = sp.edge;
  g.beginPath();
  g.arc(x, y, r, 0, 2 * Math.PI);
  g.fill();
  g.stroke();
  _drawSign(x, y, r, sp.plus, sp.sign, g);
}

// ── Légende, propre à chaque matériau ──────────────────────────────────
// [espèce, texte, taille] — « big » : pastille de la taille d'un noyau ou
// d'un ion, « small » : pastille d'électron.
var LEGEND = {
  conducteur : [['ion',       'ion du réseau, fixe',        'big'],
                ['elecFree',  'électron libre',             'small']],
  isolant    : [['nucleus',   'noyau, fixe',                'big'],
                ['elecBound', 'électron lié à son atome',   'small']],
  semi       : [['nucleus',   'noyau (atome neutre)',       'big'],
                ['ion',       'ion (atome sans électron)',  'big'],
                ['elecBound', 'électron lié à son atome',   'small'],
                ['elecFree',  'électron libre',             'small']]
};

function renderLegend() {
  var box = document.getElementById('legend');
  var items = LEGEND[sim.material];
  box.textContent = '';
  for (var i = 0; i < items.length; i++) {
    var row = document.createElement('div');
    row.className = 'legend-item';
    var cv = document.createElement('canvas');
    cv.className = 'legend-dot lg-' + items[i][2];
    cv.setAttribute('data-sp', items[i][0]);
    var tx = document.createElement('span');
    tx.textContent = items[i][1];
    row.appendChild(cv);
    row.appendChild(tx);
    box.appendChild(row);
  }
  paintLegend();
}

// Les pastilles sont de petits canvas : elles se redessinent après chaque
// redimensionnement, leur taille suivant celle de la zone de simulation.
function paintLegend() {
  var cvs = document.querySelectorAll('#legend canvas');
  var dpr = window.devicePixelRatio || 1;
  for (var i = 0; i < cvs.length; i++) {
    var cv = cvs[i];
    var w = cv.clientWidth;
    if (w === 0) continue;   // légende masquée (fenêtre étroite)
    cv.width = cv.height = Math.round(w * dpr);
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawParticle(SPECIES[cv.getAttribute('data-sp')], w / 2, w / 2, w / 2 - 1, g);
  }
}

// Charge d'un ion : « + », « 2+ » ou « 3+ ». Le chiffre rend visible la
// compensation exacte des charges — c'est lui qui porte la neutralité du
// fil quand un atome libère plus d'un électron.
// Sous un certain rayon, deux caractères ne sont plus lisibles : on
// retombe alors sur le seul « + », tracé géométriquement.
var CHARGE_TEXT_MIN_R = 9;   // px

function _drawCharge(x, y, r, z) {
  if (z <= 1 || r < CHARGE_TEXT_MIN_R) { _drawSign(x, y, r, true); return; }

  ctx.fillStyle    = '#fff';
  ctx.font         = '700 ' + (r * 1.05).toFixed(1) + 'px "Segoe UI", Arial, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(z + '+', x, y + r * 0.04);
}

// ══════════════════════════════════════════════════════════════════════
//  Sens du courant
//  +1 : courant conventionnel vers la droite dans le fil étudié.
//   0 : circuit ouvert ou tension nulle.
// ══════════════════════════════════════════════════════════════════════

function currentSign() {
  // Isolant et semi-conducteur : le courant est une grandeur mesurée, qui
  // peut être nulle (isolant, ou semi-conducteur très froid) ou transitoire.
  if (sim.material !== 'conducteur') {
    if (Math.abs(sim.I_mA) < ISO_I_SHOW) return 0;
    return sim.I_mA > 0 ? 1 : -1;
  }
  return biasSign();
}

// Sens du champ imposé par le générateur (circuit fermé, tension non nulle),
// indépendamment de tout courant : il fixe les repères de bornes du fil.
function biasSign() {
  if (!sim.circuitOn || sim.U_V === 0) return 0;
  return sim.U_V > 0 ? 1 : -1;
}

// Polarité du générateur : elle ne dépend que du signe de la tension
// imposée, pas de l'interrupteur — ouvrir le circuit n'échange pas les
// bornes. 0 : tension nulle, aucune borne n'est marquée.
function polaritySign() {
  if (sim.U_V === 0) return 0;
  return sim.U_V > 0 ? 1 : -1;
}

// ══════════════════════════════════════════════════════════════════════
//  1. Schéma du circuit fermé
// ══════════════════════════════════════════════════════════════════════

function _drawSchematic() {
  var x1 = _L.sx1, x2 = _L.sx2, y1 = _L.sy1, y2 = _L.sy2;
  var lw = _L.sLw, F = _L.F;
  var cx = (x1 + x2) / 2;
  var s  = currentSign();

  // ── Coupure du fil là où se placent le générateur et l'interrupteur ──
  var genR    = Math.max((x2 - x1) * 0.055, (y2 - y1) * 0.11);  // rayon du générateur
  var genHalf = genR;                       // demi-largeur de la coupure haute
  var swHalf  = (y2 - y1) * 0.14;           // demi-hauteur de la coupure droite
  var swCY    = (y1 + y2) / 2;

  ctx.strokeStyle = C_WIRE;
  ctx.lineWidth   = lw;
  ctx.lineCap     = 'round';

  // Branche haute, coupée au centre par le générateur
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(cx - genHalf, y1);
  ctx.moveTo(cx + genHalf, y1); ctx.lineTo(x2, y1);
  // Branche gauche
  ctx.moveTo(x1, y1); ctx.lineTo(x1, y2);
  // Branche droite, coupée par l'interrupteur
  ctx.moveTo(x2, y1); ctx.lineTo(x2, swCY - swHalf);
  ctx.moveTo(x2, swCY + swHalf); ctx.lineTo(x2, y2);
  // Branche basse, de part et d'autre de la portion étudiée
  ctx.moveTo(x1, y2); ctx.lineTo(_L.hl1, y2);
  ctx.moveTo(_L.hl2, y2); ctx.lineTo(x2, y2);
  ctx.stroke();

  // ── Portion de fil étudiée, en gras ──
  ctx.strokeStyle = C_WIRE_HL;
  ctx.lineWidth   = lw * 2.6;
  ctx.beginPath();
  ctx.moveTo(_L.hl1, y2);
  ctx.lineTo(_L.hl2, y2);
  ctx.stroke();

  ctx.fillStyle    = C_TEXT_SOFT;
  ctx.font         = '600 ' + (F * 0.82).toFixed(1) + 'px "Segoe UI", Arial, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(sim.material === 'isolant' ? 'portion d’isolant étudiée'
             : sim.material === 'semi'    ? 'portion de semi-conducteur étudiée'
                                          : 'portion de fil étudiée',
               cx, y2 - lw * 2.6);

  // ── Générateur : un cercle marqué G ──
  // Le courant sort par la borne + : pour un courant orienté vers la
  // droite dans le fil étudié, il remonte la branche droite et parcourt la
  // branche haute vers la gauche — la borne + est donc à gauche du symbole.
  var plusLeft = (polaritySign() >= 0);

  ctx.fillStyle = C_BG;
  ctx.beginPath();
  ctx.arc(cx, y1, genR, 0, 2 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = C_WIRE_HL;
  ctx.lineWidth   = Math.max(1.6, lw * 0.9);
  ctx.stroke();

  ctx.fillStyle    = C_WIRE_HL;
  ctx.font         = '700 ' + (genR * 1.15).toFixed(1) + 'px "Segoe UI", Arial, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('G', cx, y1 + genR * 0.04);

  // Étiquettes des bornes, sous la branche haute : posées à hauteur du fil
  // elles se superposaient au trait.
  ctx.font         = '700 ' + (F * 1.7).toFixed(1) + 'px "Segoe UI", Arial, sans-serif';
  ctx.textBaseline = 'top';
  var lblX = genR + F * 0.9;
  var lblY = y1 + lw;
  ctx.fillStyle    = C_PLUS;
  ctx.fillText('+', cx + (plusLeft ? -lblX : lblX), lblY);
  ctx.fillStyle    = C_MINUS;
  ctx.fillText('–', cx + (plusLeft ? lblX : -lblX), lblY);

  ctx.fillStyle    = C_TEXT_SOFT;
  ctx.font         = '600 ' + (F * 0.82).toFixed(1) + 'px "Segoe UI", Arial, sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.fillText('générateur', cx, y1 - genR * 1.35);

  // ── Interrupteur ──
  var swY = swCY + swHalf;                    // pivot, en bas de la coupure
  ctx.strokeStyle = C_WIRE_HL;
  ctx.lineWidth   = lw * 1.4;
  ctx.beginPath();
  ctx.moveTo(x2, swY);
  if (sim.circuitOn) {
    ctx.lineTo(x2, swCY - swHalf);            // levier rabattu : circuit fermé
  } else {
    // Levier relevé vers l'extérieur du circuit, pour ne pas empiéter sur
    // le schéma.
    var len = swHalf * 2;
    var th  = -Math.PI / 2 + 0.62;
    ctx.lineTo(x2 + len * Math.cos(th), swY + len * Math.sin(th));
  }
  ctx.stroke();

  // Plots de l'interrupteur
  ctx.fillStyle = C_WIRE_HL;
  ctx.beginPath(); ctx.arc(x2, swY, lw * 0.9, 0, 2 * Math.PI); ctx.fill();
  ctx.beginPath(); ctx.arc(x2, swCY - swHalf, lw * 0.9, 0, 2 * Math.PI); ctx.fill();

  // ── Sens du courant le long du circuit ──
  if (s !== 0) {
    var tip = Math.max(4, lw * 2.4);
    // Branche haute : deux repères symétriques de part et d'autre du
    // générateur. La branche droite n'en porte pas : le repère y tombait
    // juste sous l'interrupteur.
    _currentTip(cx - (x2 - x1) * 0.30, y1, -s, 0, tip);              // branche haute, gauche
    _currentTip(cx + (x2 - x1) * 0.30, y1, -s, 0, tip);              // branche haute, droite
    _currentTip(x1, (y1 + y2) / 2,      0,  s, tip);                 // branche gauche
    _currentTip(cx + (x2 - x1) * 0.38, y2, s, 0, tip);               // branche basse
  }
}

// ══════════════════════════════════════════════════════════════════════
//  2. Traits de loupe
// ══════════════════════════════════════════════════════════════════════

function _drawLoupe() {
  ctx.save();
  ctx.strokeStyle = 'rgba(122,138,150,0.75)';
  ctx.lineWidth   = Math.max(1, _L.sLw * 0.5);
  ctx.setLineDash([Math.max(3, _L.F * 0.35), Math.max(3, _L.F * 0.35)]);
  ctx.beginPath();
  ctx.moveTo(_L.hl1, _L.sy2); ctx.lineTo(_L.tubeX1, _L.tubeY1);
  ctx.moveTo(_L.hl2, _L.sy2); ctx.lineTo(_L.tubeX2, _L.tubeY1);
  ctx.stroke();
  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════
//  3. Flèche du sens conventionnel du courant
// ══════════════════════════════════════════════════════════════════════

function _drawCurrentArrow() {
  var F = _L.F;
  var s = currentSign();
  var cx = (_L.tubeX1 + _L.tubeX2) / 2;
  var half = (_L.tubeX2 - _L.tubeX1) * 0.20;
  var y = _L.arrowCY;

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  if (s === 0) {
    ctx.strokeStyle = 'rgba(122,138,150,0.55)';
    ctx.lineWidth   = Math.max(1.5, F * 0.14);
    ctx.save();
    ctx.setLineDash([F * 0.5, F * 0.5]);
    ctx.beginPath();
    ctx.moveTo(cx - half, y); ctx.lineTo(cx + half, y);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = C_TEXT_SOFT;
    ctx.font = '700 ' + (F * 0.95).toFixed(1) + 'px "Segoe UI", Arial, sans-serif';
    ctx.fillText('aucun courant', cx, y - F * 1.15);
    return;
  }

  _arrowH(cx - s * half, cx + s * half, y, Math.max(3, F * 0.36), C_CURRENT);

  ctx.fillStyle = C_CURRENT;
  ctx.font = '700 ' + (F * 1.55).toFixed(1) + 'px "Segoe UI", Arial, sans-serif';
  ctx.fillText('I', cx, y - F * 1.25);
}

// ══════════════════════════════════════════════════════════════════════
//  4. Le fil : parois, réseau de cations, électrons
// ══════════════════════════════════════════════════════════════════════

function _drawTube() {
  var w  = _L.wall;
  var x1 = _L.tubeX1, x2 = _L.tubeX2;

  // Seules les parois HAUTE et BASSE existent : ce sont elles qui arrêtent
  // les électrons. À gauche et à droite le fil est ouvert — il se prolonge
  // hors du cadre, et c'est par là que les électrons entrent et sortent.
  ctx.fillStyle = C_TUBE_IN;
  ctx.fillRect(x1, sim.ty1, x2 - x1, sim.ty2 - sim.ty1);

  ctx.fillStyle = C_WALL;
  ctx.fillRect(x1, _L.tubeY1, x2 - x1, w);
  ctx.fillRect(x1, sim.ty2,   x2 - x1, w);

  // Le liseré foncé souligne les deux parois, dessus et dessous ; aucun
  // trait vertical ne vient fermer les extrémités.
  ctx.strokeStyle = C_WALL_EDGE;
  ctx.lineWidth   = Math.max(1, w * 0.22);
  ctx.beginPath();
  ctx.moveTo(x1, _L.tubeY1); ctx.lineTo(x2, _L.tubeY1);
  ctx.moveTo(x1, sim.ty1);   ctx.lineTo(x2, sim.ty1);
  ctx.moveTo(x1, sim.ty2);   ctx.lineTo(x2, sim.ty2);
  ctx.moveTo(x1, _L.tubeY2); ctx.lineTo(x2, _L.tubeY2);
  ctx.stroke();

  // Tout ce qui suit est découpé aux bords intérieurs : un électron à
  // cheval sur une paroi, ou une trace qui déborde, serait dessiné
  // par-dessus le cadre.
  ctx.save();
  ctx.beginPath();
  ctx.rect(sim.tx1, sim.ty1, sim.tx2 - sim.tx1, sim.ty2 - sim.ty1);
  ctx.clip();

  if (sim.material !== 'conducteur') {
    _drawAtoms();
    if (sim.material === 'semi') {
      _drawTrace();
      _drawTracedBound();
      _drawHops();
      _drawFreeElectrons();
      if (sim.showArrows) _drawArrows(sim.free);
    }
  } else {
    _drawCations();
    _drawTrace();
    _drawElectrons();
    if (sim.showArrows) _drawArrows();
  }

  ctx.restore();
}

// Isolant : noyaux fixes, orbites déformées, un électron lié par atome.
// L'orbite est un cercle sans tension, une ellipse allongée vers la borne +
// sinon (cf. isoOrbit). Le noyau reste à l'intérieur.
function _drawAtoms() {
  var o = isoOrbit(), rN = sim.rNucleus, rE = sim.rElec;
  var N = 48;   // points par orbite
  var k, i, c;

  // Orbites en pointillés, sous les noyaux et les électrons. Un ion n'a plus
  // d'électron, donc plus d'orbite.
  ctx.lineWidth   = Math.max(1, rE * 0.35);
  ctx.strokeStyle = 'rgba(122,138,150,0.60)';
  ctx.setLineDash([Math.max(2, rE * 1.2), Math.max(2, rE * 1.2)]);
  ctx.beginPath();
  for (k = 0; k < sim.lattice.length; k++) {
    if (sim.atoms[k].ion) continue;
    c = sim.lattice[k];
    for (i = 0; i <= N; i++) {
      var t  = 2 * Math.PI * i / N;
      var px = c.x + o.ox + o.A * Math.cos(t), py = c.y + o.B * Math.sin(t);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);

  if (sim.material === 'semi') _drawHoleTrace();

  // Noyaux : pâles tant que l'atome est neutre, pleins pour un ion.
  for (k = 0; k < sim.lattice.length; k++) {
    c = sim.lattice[k];
    drawParticle(sim.atoms[k].ion ? SPECIES.ion : SPECIES.nucleus, c.x, c.y, rN);
  }

  // La lacune suivie est cerclée, pour se distinguer des autres ions.
  if (sim.tracedHole >= 0) {
    var th = sim.lattice[sim.tracedHole];
    ctx.strokeStyle = C_HOLE_TRACE;
    ctx.lineWidth   = Math.max(1.5, rN * 0.2);
    ctx.beginPath();
    ctx.arc(th.x, th.y, rN * 1.45, 0, 2 * Math.PI);
    ctx.stroke();
  }

  // Électrons liés, sur leur orbite (les ions n'en ont plus)
  for (k = 0; k < sim.lattice.length; k++) {
    if (sim.atoms[k].ion) continue;
    c = sim.lattice[k];
    var ph = sim.atoms[k].ph;
    if (k === sim.tracedBound) continue;   // l'électron suivi se dessine par-dessus la trace
    drawParticle(SPECIES.elecBound,
                 c.x + o.ox + o.A * Math.cos(ph), c.y + o.B * Math.sin(ph), rE);
  }
}

// Électron suivi, lié à son atome : dessiné par-dessus sa trace.
function _drawTracedBound() {
  if (sim.tracedBound < 0) return;
  var p = boundPosition(sim.tracedBound);
  drawParticle(SPECIES.elecTraced, p.x, p.y, sim.rElec * 1.25);
}

// Parcours de la lacune suivie : les noyaux successifs, reliés.
function _drawHoleTrace() {
  if (sim.holeTrace.length < 2) return;
  ctx.strokeStyle = C_HOLE_TRACE;
  ctx.lineWidth   = Math.max(1.8, sim.rElec * 0.45);
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';
  ctx.beginPath();
  var pen = false;
  for (var k = 0; k < sim.holeTrace.length; k++) {
    var p = sim.holeTrace[k];
    if (p.b || !pen) { ctx.moveTo(p.x, p.y); pen = true; }
    else             { ctx.lineTo(p.x, p.y); }
  }
  ctx.stroke();
}

// Semi-conducteur : électrons liés en vol d'un atome à l'autre (sauts de lacune).
function _drawHops() {
  for (var i = 0; i < sim.hops.length; i++) {
    var p = hopPosition(sim.hops[i]);
    var traced = (sim.hops[i] === sim.tracedHop);
    drawParticle(traced ? SPECIES.elecTraced : SPECIES.elecBound, p.x, p.y,
                 traced ? sim.rElec * 1.25 : sim.rElec);
  }
}

// Semi-conducteur : électrons libres, dessinés par-dessus tout le reste.
function _drawFreeElectrons() {
  for (var i = 0; i < sim.free.length; i++) {
    var e = sim.free[i];
    var traced = (e === sim.tracedE);
    drawParticle(traced ? SPECIES.elecTraced : SPECIES.elecFree,
                 e.x, e.y, traced ? sim.rElec * 1.25 : sim.rElec);
  }
}

function _drawCations() {
  for (var k = 0; k < sim.lattice.length; k++) {
    drawParticle(SPECIES.ion, sim.lattice[k].x, sim.lattice[k].y, sim.rCation);
  }
}

function _drawTrace() {
  if (sim.trace.length < 2) return;
  ctx.strokeStyle = C_TRACE;
  ctx.lineWidth   = Math.max(1.8, sim.rElec * 0.45);
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';
  ctx.beginPath();
  var pen = false;
  for (var k = 0; k < sim.trace.length; k++) {
    var p = sim.trace[k];
    if (p.b || !pen) { ctx.moveTo(p.x, p.y); pen = true; }
    else             { ctx.lineTo(p.x, p.y); }
  }
  ctx.stroke();
}

function _drawElectrons() {
  var r = sim.rElec;
  for (var i = 0; i < sim.electrons.length; i++) {
    var e = sim.electrons[i];
    var traced = (e === sim.tracedE);
    drawParticle(traced ? SPECIES.elecTraced : SPECIES.elecFree,
                 e.x, e.y, traced ? r * 1.25 : r);
  }
}

// Flèche de vitesse d'un électron.
// Elle montre le SENS, pas la valeur : sa longueur est fixe. Les modules
// individuels sont tous voisins de la vitesse d'agitation — la dérive n'en
// est qu'une petite fraction —, des flèches à l'échelle seraient donc
// toutes de même longueur à l'œil. Ce qui se lit ici, ce sont les
// DIRECTIONS : circuit ouvert, elles pointent en tous sens ; circuit
// fermé, elles penchent en moyenne du côté opposé au courant.
function _drawArrows(list) {
  list = list || sim.electrons;
  var r   = sim.rElec;
  var len = Math.max(6, r * 5.2);      // longueur totale, du bord du disque
  var hd  = Math.max(3, len * 0.34);   // longueur de la pointe
  var hw  = hd * 0.52;                 // demi-largeur de la pointe

  ctx.lineWidth = Math.max(1, r * 0.55);
  ctx.lineCap   = 'butt';

  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    var v = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
    if (v < 1e-6) continue;            // vitesse nulle : aucun sens à montrer
    var ux = e.vx / v, uy = e.vy / v;

    // La hampe part du BORD du disque et non de son centre : le signe
    // « − » porté par l'électron reste lisible.
    var x0 = e.x + ux * r,  y0 = e.y + uy * r;
    var x1 = x0 + ux * len, y1 = y0 + uy * len;
    var xb = x1 - ux * hd,  yb = y1 - uy * hd;   // base de la pointe
    var px = -uy, py = ux;                       // normale unitaire

    var col = (e === sim.tracedE) ? C_TRACED_ED : C_ARROW;
    ctx.strokeStyle = col;
    ctx.fillStyle   = col;

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(xb, yb);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(xb + px * hw, yb + py * hw);
    ctx.lineTo(xb - px * hw, yb - py * hw);
    ctx.closePath();
    ctx.fill();
  }
}

// ══════════════════════════════════════════════════════════════════════
//  5. Cote de tension et repères de bornes
// ══════════════════════════════════════════════════════════════════════

function _drawCote() {
  var F = _L.F;
  var y = _L.coteCY;
  var s = biasSign();   // repères de bornes : fixés par le champ, pas par le courant

  var chipR = Math.max(7, F * 0.62);

  // ── Cote U, sur TOUTE la longueur du fil ──
  // Tracée avant les repères de bornes : ceux-ci se posent par-dessus ses
  // extrémités, qu'ils masquent proprement.
  var x1 = _L.tubeX1, x2 = _L.tubeX2;

  ctx.strokeStyle = 'rgba(90,106,120,0.65)';
  ctx.lineWidth   = Math.max(1, F * 0.10);
  ctx.beginPath();
  ctx.moveTo(x1, y - F * 0.45); ctx.lineTo(x1, y + F * 0.45);
  ctx.moveTo(x2, y - F * 0.45); ctx.lineTo(x2, y + F * 0.45);
  ctx.moveTo(x1, y); ctx.lineTo(x2, y);
  ctx.stroke();

  var label = sim.showMeasures
    ? 'U = ' + (sim.circuitOn ? _fmtU(sim.U_V) : '0,0 V')
    : 'U';

  ctx.font = '700 ' + (F * 1.25).toFixed(1) + 'px "Segoe UI", Arial, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  // Le trait de cote est effacé derrière l'étiquette, pas barré par elle.
  var tw = ctx.measureText(label).width;
  ctx.fillStyle = C_BG;
  ctx.fillRect((x1 + x2) / 2 - tw / 2 - F * 0.5, y - F * 0.85, tw + F, F * 1.7);

  ctx.fillStyle = sim.circuitOn ? C_TEXT : C_TEXT_SOFT;
  ctx.fillText(label, (x1 + x2) / 2, y);

  // ── Repères des bornes aux deux extrémités du fil ──
  // Le courant entre dans le fil par l'extrémité reliée à la borne + du
  // générateur, qui est donc au potentiel le plus élevé.
  if (s !== 0) {
    _drawTerminalChip(x1 + chipR * 1.3, y, chipR, s > 0);
    _drawTerminalChip(x2 - chipR * 1.3, y, chipR, s < 0);
  }
}

function _drawTerminalChip(x, y, r, isPlus) {
  var F = _L.F;
  ctx.fillStyle = isPlus ? C_PLUS : C_MINUS;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fill();
  _drawSign(x, y, r, isPlus);

  ctx.fillStyle    = C_TEXT_SOFT;
  ctx.font         = '600 ' + (F * 0.72).toFixed(1) + 'px "Segoe UI", Arial, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('vers la borne ' + (isPlus ? '+' : '–'), x, y + r * 1.25);
}

// Tension affichée : une décimale, virgule décimale française.
function _fmtU(u) {
  return u.toFixed(1).replace('.', ',') + ' V';
}

// ══════════════════════════════════════════════════════════════════════
//  Rendu complet
// ══════════════════════════════════════════════════════════════════════

function drawScene() {
  if (_cw === 0 || _ch === 0) return;

  ctx.fillStyle = C_BG;
  ctx.fillRect(0, 0, _cw, _ch);

  _drawSchematic();
  _drawLoupe();
  _drawCurrentArrow();
  _drawTube();
  _drawCote();
}
