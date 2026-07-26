// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  frise.js — Axe (« frise ») du quotient de réaction Qr
//  Dépend de : sim.js (sims, countSpecies, reactionQuotient,
//              averagedReactionQuotient, equilibriumConstant)
//  Expose   : attachFrise(s), resizeFriseAll(), resizeFrise(s),
//             drawFrise(s), drawAllFrises()
//
//  Une frise par simulation (#frise-canvas-1 / -2). Elle matérialise sur un
//  seul axe horizontal la position de Qr par rapport à la constante
//  d'équilibre K : c'est la lecture qui manque au graphe N(t), où l'on voit
//  bien les quantités se stabiliser mais pas VERS QUOI elles tendent.
//
//  Trois repères, hiérarchisés visuellement :
//  - K          : trait vertical pointillé sombre + libellé en haut. C'est
//                 la RÉFÉRENCE FIXE (elle ne bouge que si l'utilisateur
//                 change une probabilité).
//  - Qr moyenné : pastille pleine posée SUR l'axe, comme une perle qui
//                 glisse le long de la frise jusqu'à venir se coller au
//                 trait de K. C'est le marqueur qui porte le propos.
//  - Qr instantané : fine aiguille pâle, qui s'agite en permanence. Montre
//                 que le bruit est réel (et pourquoi il faut moyenner),
//                 masquable par la case à cocher sous la frise.
//
//  Les deux marqueurs Qr partagent la même teinte (même grandeur physique),
//  K est en gris ardoise neutre : l'œil sépare « la cible » de « la mesure »
//  avant même de lire les libellés. Ce choix évite aussi de piocher dans les
//  couleurs des espèces A/B/C/D, déjà toutes prises.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Bornes de l'axe — ÉCHELLE LOGARITHMIQUE ────────────────────────────
// K = p(A+B)/p(C+D) avec deux sliders entiers de 0 à 100 % : les valeurs
// finies non nulles vont donc de 1/100 à 100/1. Deux décades de chaque côté
// de 1 couvrent exactement cette plage.
//
// Le log est ici le seul choix praticable : sur un axe linéaire, K = 100
// écraserait toute la région Qr < 10 en une poignée de pixels, et K = 0,01
// serait indiscernable de 0. Il place en outre K = 1 pile au centre —
// position de repos naturelle quand les deux probabilités sont égales — et
// rend la lecture « Qr à gauche de K / à droite de K » valable quels que
// soient les réglages.
var FRISE_QR_MIN = 0.01;
var FRISE_QR_MAX = 100;

// ── Couleurs ───────────────────────────────────────────────────────────
var FRISE_K_COLOR       = '#2c3e50';               // référence : gris ardoise
var FRISE_QR_COLOR      = '#c08020';               // mesure : ambre
var FRISE_QR_INST_COLOR = 'rgba(192,128,32,0.45)'; // mesure instantanée, pâle

// ══════════════════════════════════════════════════════════════════════
//  Rattachement au DOM et resize (DPR + anti-rebond RAF)
// ══════════════════════════════════════════════════════════════════════

function attachFrise(s) {
  s.friseCanvas = document.getElementById('frise-canvas-' + s.index);
  s.friseCtx = null;
}

var _friseResizeRafPending = false;

function resizeFriseAll() {
  if (_friseResizeRafPending) return;
  _friseResizeRafPending = true;
  requestAnimationFrame(function () {
    _friseResizeRafPending = false;
    activeSims().forEach(function (s) { resizeFrise(s); });
  });
}

function resizeFrise(s) {
  var cv = s.friseCanvas;
  if (!cv) return;
  var w = cv.clientWidth;
  var h = cv.clientHeight;
  // 0 quand la frise est masquée (mode 2 simulations, onglet « Graphe »
  // actif) : on ne peut pas dimensionner un canvas invisible, ce sera fait
  // au moment où l'onglet devient actif (cf. setView dans ui.js).
  if (w < 1 || h < 1) return;
  var dpr = window.devicePixelRatio || 1;
  cv.width  = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  s.friseCtx = cv.getContext('2d');
  s.friseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawFrise(s);
}

function drawAllFrises() {
  activeSims().forEach(function (s) { drawFrise(s); });
}

// ══════════════════════════════════════════════════════════════════════
//  Utilitaires d'échelle et de formatage
// ══════════════════════════════════════════════════════════════════════

// Abscisse (px) d'une valeur de Qr sur l'axe logarithmique.
function _friseX(v, padL, gw) {
  var lo = Math.log10(FRISE_QR_MIN);
  var hi = Math.log10(FRISE_QR_MAX);
  var f = (Math.log10(v) - lo) / (hi - lo);
  if (f < 0) f = 0; else if (f > 1) f = 1;
  return padL + f * gw;
}

// Ramène une valeur dans les bornes de l'axe (0 et l'infini sont des cas
// atteignables : N_C = 0 donne Qr = 0, N_A = 0 donne Qr infini).
function _friseClamp(v) {
  if (v === Infinity) return FRISE_QR_MAX;
  if (!(v > 0)) return FRISE_QR_MIN;
  if (v < FRISE_QR_MIN) return FRISE_QR_MIN;
  if (v > FRISE_QR_MAX) return FRISE_QR_MAX;
  return v;
}

// Une valeur sort-elle de l'échelle ? (sert à signaler le marqueur plaqué
// contre un bord, qui sinon se lirait comme une mesure exacte)
function _friseOffScale(v) {
  return v === Infinity || v > FRISE_QR_MAX || (v >= 0 && v < FRISE_QR_MIN);
}

function _friseFmt(v) {
  if (v === null) return '—';
  if (v === Infinity) return '∞';
  if (v === 0) return '0';
  var txt;
  if (v >= 10)      txt = v.toFixed(1);
  else if (v >= 1)  txt = v.toFixed(2);
  else if (v >= 0.1) txt = v.toFixed(2);
  else              txt = v.toFixed(3);
  return txt.replace('.', ',');
}

// Texte centré sur `xCenter`, mais toujours maintenu dans le cadre : un
// marqueur près d'un bord aurait sinon son libellé tronqué.
function _friseText(ctx, txt, xCenter, yTop, fs, color, W) {
  ctx.font = 'bold ' + fs + 'px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  var w = ctx.measureText(txt).width;
  var x = xCenter - w / 2;
  if (x < 3) x = 3;
  if (x + w > W - 3) x = W - 3 - w;
  ctx.fillStyle = color;
  ctx.fillText(txt, x, yTop);
}

// ══════════════════════════════════════════════════════════════════════
//  Dessin de la frise
// ══════════════════════════════════════════════════════════════════════

function drawFrise(s) {
  if (!s.friseCanvas || !s.friseCtx) return;
  var ctx = s.friseCtx;
  var W = s.friseCanvas.clientWidth;
  var H = s.friseCanvas.clientHeight;
  if (W < 1 || H < 1) return;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#faf9f6';
  ctx.fillRect(0, 0, W, H);

  // ── Deux régimes de rendu selon la hauteur disponible ────────────────
  // Régime NORMAL : deux lignes de libellés chiffrés en haut, zone des
  // marqueurs, axe et graduations en bas — soit ~5,1 × fs au total. La
  // police est dimensionnée pour la VIDÉOPROJECTION (lisible du fond de la
  // classe), donc aussi grande que la hauteur le permet.
  //
  // Régime COMPACT : sur une fenêtre courte, respecter ce budget imposerait
  // une police illisible. On supprime alors les libellés chiffrés — leurs
  // valeurs restent affichées dans le panneau (Qr instantané, Qr moyenné,
  // et K dans l'encart des formules) — et toute la hauteur va à l'axe, ses
  // graduations et les marqueurs, dont les POSITIONS portent déjà
  // l'essentiel du message : Qr à gauche ou à droite de K, et à quelle
  // distance.
  var FRISE_FS_FULL_MIN = 13;   // police en dessous de laquelle on compacte
  var compact = (H * 0.17) < FRISE_FS_FULL_MIN;
  var fs = compact ? Math.max(9, Math.min(15, H * 0.30))
                   : Math.min(31, H * 0.17);

  // Marges latérales : de quoi loger la moitié du libellé « 0,01 » / « 100 »
  // qui dépasse de part et d'autre des graduations extrêmes. Bornées à 13 %
  // de la largeur pour ne pas dévorer l'axe dans une colonne étroite.
  var pad = Math.min(fs * 1.9, W * 0.13);
  var padL = pad, padR = pad;
  var gw = W - padL - padR;
  if (gw <= 20) return;

  // Les deux lignes de libellés sont à des hauteurs DIFFÉRENTES pour ne pas
  // se chevaucher quand Qr rejoint K — c'est justement le cas intéressant.
  var rowK  = fs * 0.12;
  var rowQr = fs * 1.32;
  var markTop = compact ? fs * 0.3 : fs * 2.55;
  var axisY = H - fs * 1.7;
  if (axisY <= markTop + 4) { markTop = Math.max(1, (axisY + fs * 0.5) / 2); }

  _friseDrawAxis(ctx, padL, gw, axisY, fs);

  // ── Valeurs à représenter ──
  var c = countSpecies(s);
  var qrInst = reactionQuotient(c);
  var qrAvg  = averagedReactionQuotient(s);
  var K      = equilibriumConstant(s);

  // ── K : trait pointillé + libellé ──
  if (K !== null) {
    var xK = _friseX(_friseClamp(K), padL, gw);
    ctx.save();
    ctx.strokeStyle = FRISE_K_COLOR;
    ctx.lineWidth = Math.max(2.5, fs * 0.17);
    ctx.setLineDash([Math.max(4, fs * 0.4), Math.max(3, fs * 0.3)]);
    ctx.beginPath();
    ctx.moveTo(xK, markTop);
    ctx.lineTo(xK, axisY);
    ctx.stroke();
    ctx.restore();
    if (!compact) {
      _friseText(ctx, 'K = ' + _friseFmt(K) + (_friseOffScale(K) ? ' (hors échelle)' : ''),
                 xK, rowK, fs, FRISE_K_COLOR, W);
    }
  }

  // ── Qr instantané : aiguille fine et pâle, sans libellé ──
  if (s.showQrInstant && qrInst !== null) {
    var xI = _friseX(_friseClamp(qrInst), padL, gw);
    ctx.strokeStyle = FRISE_QR_INST_COLOR;
    ctx.lineWidth = Math.max(1.5, fs * 0.12);
    ctx.beginPath();
    ctx.moveTo(xI, markTop + fs * 0.45);
    ctx.lineTo(xI, axisY);
    ctx.stroke();
  }

  // ── Qr moyenné : pastille pleine posée sur l'axe + libellé ──
  if (qrAvg !== null) {
    var xA = _friseX(_friseClamp(qrAvg), padL, gw);
    var rr = Math.max(6, fs * 0.46);

    // Tige, pour rattacher la pastille à son libellé
    ctx.strokeStyle = FRISE_QR_COLOR;
    ctx.lineWidth = Math.max(2, fs * 0.13);
    ctx.beginPath();
    ctx.moveTo(xA, markTop + fs * 0.45);
    ctx.lineTo(xA, axisY - rr);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(xA, axisY, rr, 0, Math.PI * 2);
    ctx.fillStyle = FRISE_QR_COLOR;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1.5, fs * 0.14);
    ctx.stroke();

    if (!compact) {
      _friseText(ctx, 'Qr = ' + _friseFmt(qrAvg) + (_friseOffScale(qrAvg) ? ' (hors échelle)' : ''),
                 xA, rowQr, fs, FRISE_QR_COLOR, W);
    }
  }
}

// ── Axe horizontal, graduations principales (décades) et mineures ───────
function _friseDrawAxis(ctx, padL, gw, axisY, fs) {
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = Math.max(2, fs * 0.11);
  ctx.beginPath();
  ctx.moveTo(padL, axisY);
  ctx.lineTo(padL + gw, axisY);
  ctx.stroke();

  // Graduations mineures (2×10ⁿ à 9×10ⁿ) : sans elles, une échelle log se
  // lit comme une échelle linéaire et l'élève surestime les écarts près du
  // bord droit de chaque décade.
  ctx.strokeStyle = 'rgba(44,62,80,0.35)';
  ctx.lineWidth = Math.max(1, fs * 0.07);
  ctx.beginPath();
  for (var d = -2; d < 2; d++) {
    for (var m = 2; m < 10; m++) {
      var v = m * Math.pow(10, d);
      if (v < FRISE_QR_MIN || v > FRISE_QR_MAX) continue;
      var xm = _friseX(v, padL, gw);
      ctx.moveTo(xm, axisY);
      ctx.lineTo(xm, axisY + fs * 0.26);
    }
  }
  ctx.stroke();

  // Graduations principales + libellés
  var decades = [0.01, 0.1, 1, 10, 100];
  var labels  = ['0,01', '0,1', '1', '10', '100'];
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = Math.max(1.5, fs * 0.09);
  ctx.font = 'bold ' + (fs * 0.88) + 'px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#5a6a78';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (var i = 0; i < decades.length; i++) {
    var x = _friseX(decades[i], padL, gw);
    ctx.beginPath();
    ctx.moveTo(x, axisY);
    ctx.lineTo(x, axisY + fs * 0.52);
    ctx.stroke();
    ctx.fillText(labels[i], x, axisY + fs * 0.66);
  }
}

// ── Attacher l'événement resize ────────────────────────────────────────
window.addEventListener('resize', resizeFriseAll);
