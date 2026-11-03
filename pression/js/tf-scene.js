// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  tf-scene.js — Onglet Transformations : rendu du cylindre
//  Chargé après tf-sim.js. Dessine, de bas en haut : isolant du fond,
//  gaz et tranches, parois et graduations, piston, tige, plateau et charge,
//  vérin et sa pince, enceinte.
//
//  Échelle verticale réelle (graduations en cm). Le cylindre, lui, est
//  ÉLARGI sur le dessin : à l'échelle, ses 5 cm de diamètre pour 50 cm de
//  haut en feraient un simple trait.
// ══════════════════════════════════════════════════════════════════════

'use strict';

var tfCanvas = document.getElementById('tf-canvas');
var tfCtx    = tfCanvas.getContext('2d');

// Police des textes dessinés (scène et graphes) ; style : '', 'bold',
// '600', 'italic'
var TF_POLICE = '"Segoe UI", Arial, sans-serif';
function _tfPolice(style, px) { return (style ? style + ' ' : '') + px + 'px ' + TF_POLICE; }

// ── Habillage (m, repère du gaz : z = 0 au fond intérieur) ──
var TF_EP_PISTON  = 0.010;   // épaisseur dessinée du piston-membrane (1 g)
var TF_H_TIGE     = 0.045;   // tige entre piston et plateau
var TF_H_TIGE_HAUT = 0.075;  // tige au-dessus du plateau (charge enfilée, pince)
var TF_EP_PLATEAU = 0.008;
var TF_EP_FOND    = 0.010;   // paroi du fond
var TF_EP_ISOLANT = 0.045;   // isolant du fond, au plus épais (calorifugé)
var TF_EP_SOURCE  = 0.030;   // source thermique sous le fond (four ou bain)
var TF_Z_CLOCHE = TF_H_CYL - 0.07;   // bas de l'enceinte, scellée sur le cylindre

// Largeur intérieure dessinée, au plus, en fraction de la hauteur dessinée
// du cylindre : au-delà, le cylindre deviendrait une boîte trapue.
var TF_LARG_MAX = 0.75;

// Hauteur dessinée d'une masse (m d'échelle) : croît avec la masse
function _tfHauteurMasse(kg) { return 0.022 + kg * 0.0008; }

// Étendue verticale à loger : sous le fond (paroi + isolant + source),
// au-dessus du cylindre (piston en butée haute + tige, puis vérin suspendu
// au plafond de l'enceinte).
var TF_Z_BAS  = -(TF_EP_FOND + TF_EP_ISOLANT + TF_EP_SOURCE + 0.005);
// Haut de la tige du piston en butée haute ; le vérin et le plafond de
// l'enceinte se placent au-dessus
var TF_Z_TIGE_MAX = TF_H_CYL + TF_EP_PISTON + TF_H_TIGE + TF_EP_PLATEAU + TF_H_TIGE_HAUT;
var TF_Z_HAUT = TF_Z_TIGE_MAX + 0.072;

// ── Options d'affichage (section Options du panneau) ──
var tfAff = {
  molecules : true,    // molécules pilotées par le modèle
  couleurT  : true,    // gaz et molécules colorés selon la température
  sondes    : false,   // trois sondes T et P sur le flanc du cylindre
  profil    : false,   // profil de pression P(z) à droite du cylindre
  profilT   : false,   // profil de température T(z), à droite du précédent
  amplifie  : false    // profils en écart à la moyenne (case sous les profils)
};

// Repère de la hauteur visée (tf.hVisee), affiché quand l'action choisie
// porte sur le volume
var tfRepereVisee = false;

// Tranches lues par les sondes (haut, milieu, bas)
var TF_SONDES = [TF_N - 2, Math.floor(TF_N / 2), 1];

// ══════════════════════════════════════════════════════════════════════
//  Géométrie (px CSS)
// ══════════════════════════════════════════════════════════════════════

var _tfCw = 0, _tfCh = 0, _tfDpr = 1;
var _tfEch = 1;           // px par m
var _tfYBas = 0;          // ordonnée px de z = TF_Z_BAS
var _tfX1 = 0, _tfX2 = 0; // bords intérieurs du cylindre
var _tfParoi = 6;         // épaisseur des parois (px)
var _tfProfils = [];      // profils affichés : { g: 'P' ou 'T', x1, x2 } (px)

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
  // loger de part et d'autre les parois et une marge (l'enceinte l'occupe)
  // (0,16·w + 2 parois ≈ 0,23·w chacune), plus à gauche les graduations
  // (~60 px) et à droite ~15 px, et les profils de
  // pression et de température s'ils sont affichés.
  var grandeurs = [];
  if (tfAff.profil)  grandeurs.push('P');
  if (tfAff.profilT) grandeurs.push('T');
  var lProf = grandeurs.length === 2 ? Math.max(100, Math.min(170, _tfCw * 0.19))
                                     : Math.max(110, Math.min(190, _tfCw * 0.24));
  var profil = grandeurs.length * lProf;
  var hCyl = TF_H_CYL * _tfEch;
  var larg = Math.min(TF_LARG_MAX * hCyl, (_tfCw - 2 * marge - 75 - profil) / 1.46);
  larg = Math.max(40, larg);
  _tfParoi = Math.max(4, Math.round(larg * 0.035));
  var cote = _tfCote(larg);
  var libre = _tfCw - 2 * marge - (larg + 2 * cote + 75 + profil);
  _tfX1 = marge + Math.max(0, libre) / 2 + 60 + cote;
  _tfX2 = _tfX1 + larg;
  _tfProfils = grandeurs.map(function (g, i) {
    var x1 = _tfX2 + cote + 15 + 8 + i * lProf;
    return { g: g, x1: x1, x2: x1 + lProf - 8 };
  });
  _tfPlacerCaseAmplifie();

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

  // Fond crème dans les deux montages : seul l'air de la cloche est teinté
  c.fillStyle = '#fdf8f0';
  c.fillRect(0, 0, _tfCw, _tfCh);

  _tfDessinerFond();
  _tfDessinerGaz();
  if (tfAff.molecules) _tfDessinerMolecules();
  _tfDessinerAirEnceinte();
  _tfDessinerParois();
  _tfDessinerGraduations();
  if (tfRepereVisee) _tfDessinerVisee();
  _tfDessinerPiston();
  _tfDessinerEnceinte();
  _tfDessinerButee();
  if (tfAff.sondes) _tfDessinerSondes();
  for (var i = 0; i < _tfProfils.length; i++) _tfDessinerProfil(_tfProfils[i]);
  _tfDessinerChrono();
}

// Largeur intérieure dessinée, en m d'échelle verticale (pour les molécules)
function tfLargeurDessinee() { return (_tfX2 - _tfX1) / _tfEch; }

// ── Paroi du fond (tf.paroi), posée sur la source tf.fond ──
// Couche entre le fond et la source : isolante, ou deux fois plus mince si
// la paroi est peu conductrice ; aucune si elle est conductrice
var TF_EP_COUCHE = { isolant: 1, peu: 0.5, cond: 0 };   // en fraction de TF_EP_ISOLANT

function _tfDessinerFond() {
  var c = tfCtx, p = _tfParoi;
  var x1 = _tfX1 - p, x2 = _tfX2 + p;
  var ep = TF_EP_ISOLANT * TF_EP_COUCHE[tf.paroi];
  var police;
  if (ep > 0.002) {
    var yH = _tfY(-TF_EP_FOND), yB = _tfY(-TF_EP_FOND - ep);
    var m  = (x2 - x1) * 0.08;
    c.fillStyle = '#e8dcc4';
    c.fillRect(x1 - m, yH, x2 - x1 + 2 * m, yB - yH);
    _tfHachures(x1 - m, yH, x2 - x1 + 2 * m, yB - yH, 'rgba(150,120,80,0.45)', 7);
    c.strokeStyle = '#b0a080';
    c.lineWidth = 1;
    c.strokeRect(x1 - m, yH, x2 - x1 + 2 * m, yB - yH);
    var iso = tf.paroi === 'isolant';
    police = Math.max(9, Math.min(14, Math.round((yB - yH) * (iso ? 0.5 : 0.75))));
    c.font = _tfPolice('600', police);
    c.fillStyle = '#6a5030';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(iso ? 'isolant' : 'peu conductrice', (x1 + x2) / 2, (yH + yB) / 2);
  }

  // Paroi du fond : métal clair si conductrice, sombre sinon
  var y1 = _tfY(0), y2 = _tfY(-TF_EP_FOND);
  c.fillStyle = tf.paroi === 'cond' ? '#7a8a96' : '#2c3e50';
  c.fillRect(x1, y1, x2 - x1, y2 - y1);

  // Source thermique, contre le fond : rouge plus chaude que T0, bleue plus
  // froide, neutre à T0 ; son nom (source 1, source 2) et sa température
  // sont écrits
  var zS = -TF_EP_FOND - (ep > 0.002 ? ep : 0);
  var mS = (x2 - x1) * 0.08;
  var yS1 = _tfY(zS), yS2 = _tfY(zS - TF_EP_SOURCE);
  c.fillStyle = _tfMelangeT(tf.Text, TF_COUL_SOURCE, 1);
  _tfRectArrondi(x1 - mS, yS1, x2 - x1 + 2 * mS, yS2 - yS1, 3);
  c.fill();
  c.strokeStyle = 'rgba(44,62,80,0.5)';
  c.lineWidth = 1;
  c.stroke();
  var nom = 'source ' + tf.fond;
  police = Math.max(10, Math.min(14, Math.round((yS2 - yS1) * 0.62)));
  c.font = _tfPolice('600', police);
  c.fillStyle = Math.abs(tf.Text - TF_T0) > 40 ? '#fff' : '#2c3e50';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(nom + ' · ' + Math.round(tf.Text) + ' K', (x1 + x2) / 2, (yS1 + yS2) / 2);
}

// Couleurs de la source, de la même famille que celles du gaz
var TF_COUL_SOURCE = { neutre: [196, 188, 176], chaud: [206, 64, 36], froid: [52, 112, 196] };

// ── Enceinte : cloche scellée sur le haut du cylindre, dans les deux
//    montages, reliée à un manomètre. Un robinet la met en communication
//    avec l'air de la salle (masses : P_air = P_atm) ou, fermé sur l'air,
//    avec une pompe (air de l'enceinte : P_air réglée). Son air, comme celui
//    qui surmonte le piston, est teinté d'autant plus que P_air est forte. ──
// Largeur de chaque côté du cylindre jusqu'à la cloche : paroi, marge des
// graduations, paroi
function _tfCote(larg) { return 0.16 * larg + 2 * _tfParoi; }

function _tfClocheX() {
  var cote = _tfCote(_tfX2 - _tfX1);
  return [_tfX1 - cote - 3, _tfX2 + cote + 3];
}

function _tfDessinerAirEnceinte() {
  var c = tfCtx, p = _tfParoi, xs = _tfClocheX();
  var a = 0.02 + 0.22 * Math.min(1, tf.Pair / TF_PAIR_MAX);
  var yH = _tfY(TF_Z_HAUT), yB = _tfY(TF_Z_CLOCHE), yRebord = _tfY(TF_H_CYL) - p;
  var yPiston = _tfY(tf.z[TF_N] + TF_EP_PISTON);
  c.fillStyle = 'rgba(90,130,175,' + a.toFixed(3) + ')';
  c.fillRect(xs[0], yH, _tfX1 - p - xs[0], yB - yH);              // à gauche du cylindre
  c.fillRect(_tfX2 + p, yH, xs[1] - _tfX2 - p, yB - yH);          // à droite
  c.fillRect(_tfX1 - p, yH, _tfX2 - _tfX1 + 2 * p, yRebord - yH); // au-dessus du rebord
  if (yPiston > yRebord) c.fillRect(_tfX1, yRebord, _tfX2 - _tfX1, yPiston - yRebord);
}

function _tfDessinerEnceinte() {
  var c = tfCtx, p = _tfParoi, xs = _tfClocheX();
  var yH = _tfY(TF_Z_HAUT), yB = _tfY(TF_Z_CLOCHE);
  // Paroi de verre, puis collerette qui la scelle sur le cylindre
  c.strokeStyle = 'rgba(70,100,130,0.75)';
  c.lineWidth = 2;
  _tfRectArrondiOuvert(xs[0], yH, xs[1] - xs[0], yB - yH, Math.min(18, (xs[1] - xs[0]) * 0.08));
  c.stroke();
  _tfCollerette(xs, yB);

  var masses = tf.montage === 'masse';
  var police = Math.max(10, Math.min(14, Math.round(_tfEch * 0.02)));
  var mention = masses ? 'ouverte sur l’air' : tf.Pair < 500 ? 'vide' : '';
  if (mention) {
    c.font = _tfPolice('italic', police);
    c.fillStyle = '#5a6a78';
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillText(mention, xs[0] + 8, yH + 6);   // le coin droit est au compteur de temps
  }

  // Manomètre, à gauche, au-dessus des graduations, relié à la cloche
  var R = Math.max(19, Math.min(28, _tfEch * 0.04));
  var yM = yH + R + 4;
  var xM = Math.max(R + 4, xs[0] - R - 18);
  _tfRobinet(xs[0], yM + R + Math.max(36, R * 1.6), xM - R, masses, police);
  c.fillStyle = '#6a7a88';
  c.fillRect(xM + R - 1, yM - 2, xs[0] - xM - R + 1, 4);
  c.beginPath();
  c.arc(xM, yM, R, 0, 2 * Math.PI);
  c.fillStyle = '#fffdf9';
  c.fill();
  c.strokeStyle = '#2c3e50';
  c.lineWidth = 2;
  c.stroke();
  // Cadran de 0 à 500 kPa sur 270°, aiguille
  var a0 = 0.75 * Math.PI, a1 = 2.25 * Math.PI;
  c.lineWidth = 1;
  c.beginPath();
  for (var k = 0; k <= 5; k++) {
    var ak = a0 + (a1 - a0) * k / 5;
    c.moveTo(xM + Math.cos(ak) * R * 0.78, yM + Math.sin(ak) * R * 0.78);
    c.lineTo(xM + Math.cos(ak) * R * 0.95, yM + Math.sin(ak) * R * 0.95);
  }
  c.stroke();
  var an = a0 + (a1 - a0) * Math.min(1, tf.Pair / TF_PAIR_MAX);
  c.strokeStyle = '#b04020';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(xM, yM);
  c.lineTo(xM + Math.cos(an) * R * 0.8, yM + Math.sin(an) * R * 0.8);
  c.stroke();
  c.fillStyle = '#2c3e50';
  c.beginPath();
  c.arc(xM, yM, 2.5, 0, 2 * Math.PI);
  c.fill();
  c.font = _tfPolice('600', Math.max(8, Math.round(R * 0.34)));
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(Math.round(tf.Pair / 1000) + ' kPa', xM, yM + R * 0.55);
}

// Collerette qui scelle la cloche sur le haut du cylindre
function _tfCollerette(xs, yB) {
  var c = tfCtx, p = _tfParoi, hc = Math.max(4, p * 0.8);
  c.fillStyle = '#4a5a68';
  c.fillRect(xs[0] - 2, yB - hc / 2, _tfX1 - p - xs[0] + 2, hc);
  c.fillRect(_tfX2 + p, yB - hc / 2, xs[1] - _tfX2 - p + 2, hc);
}

// Robinet de la cloche, sur un tube qui part de sa paroi gauche (xC) vers
// la gauche jusqu'à xG, à la hauteur y. Ouvert (masses) : poignée le long du
// tube, bout ouvert sur l'air de la salle. Fermé (air de l'enceinte) :
// poignée en travers, le tube va à la pompe qui règle P_air.
function _tfRobinet(xC, y, xG, ouvert, police) {
  var c = tfCtx;
  xG = Math.max(4, xG);
  var e = 4, xV = xC - Math.max(16, (xC - xG) * 0.4), r = 6;
  c.fillStyle = '#6a7a88';
  c.fillRect(xG, y - e / 2, xC - xG, e);
  // Corps : deux triangles opposés par la pointe
  c.beginPath();
  c.moveTo(xV - r, y - r); c.lineTo(xV - r, y + r); c.lineTo(xV + r, y - r);
  c.lineTo(xV + r, y + r); c.closePath();
  c.fillStyle = ouvert ? '#fffdf9' : '#2c3e50';
  c.fill();
  c.strokeStyle = '#2c3e50';
  c.lineWidth = 1.5;
  c.stroke();
  // Poignée, sur une courte tige au-dessus du corps
  c.beginPath();
  c.moveTo(xV, y);
  c.lineTo(xV, y - r - 4);
  if (ouvert) { c.moveTo(xV - r - 2, y - r - 4); c.lineTo(xV + r + 2, y - r - 4); }
  else        { c.moveTo(xV, y - r - 4); c.lineTo(xV, y - r - 14); }
  c.lineWidth = 2.5;
  c.lineCap = 'round';
  c.stroke();
  c.lineCap = 'butt';
  c.font = _tfPolice('italic', Math.max(9, police - 2));
  c.fillStyle = '#5a6a78';
  c.textAlign = 'left';
  c.textBaseline = 'top';
  c.fillText(ouvert ? 'air' : 'pompe', xG, y + e / 2 + 3);
}

// Rectangle aux coins du haut arrondis, ouvert en bas (la cloche)
function _tfRectArrondiOuvert(x, y, w, h, r) {
  var c = tfCtx;
  c.beginPath();
  c.moveTo(x, y + h);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h);
}

// ── Piston libre retenu par une butée ──
function _tfDessinerButee() {
  var b = tfButee((tf.gamma - 1) * _tfU() / tfVolume());
  if (!b) return;
  var c = tfCtx;
  var police = Math.max(11, Math.min(15, Math.round(_tfEch * 0.02)));
  var y = _tfY(tf.z[TF_N]) + police * 1.3;
  var txt = b === 'haute' ? 'Piston en butée haute' : 'Piston en butée basse';
  c.font = _tfPolice('bold', police);
  var w = c.measureText(txt).width + 12;
  var cx = (_tfX1 + _tfX2) / 2;
  c.fillStyle = 'rgba(253,232,200,0.92)';
  _tfRectArrondi(cx - w / 2, y - police * 0.75, w, police * 1.5, 4);
  c.fill();
  c.fillStyle = '#7a3a10';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(txt, cx, y);
}

// ── Gaz et limites des tranches ──
function _tfDessinerGaz() {
  var c = tfCtx;
  var yP = _tfY(tf.z[TF_N]), y0 = _tfY(0);
  c.fillStyle = '#e6eef6';
  c.fillRect(_tfX1, yP, _tfX2 - _tfX1, y0 - yP);

  // Couleur de chaque tranche selon sa température ; atténuée quand les
  // molécules, colorées elles aussi, doivent ressortir sur le fond.
  if (tfAff.couleurT) {
    var intensite = tfAff.molecules ? 0.45 : 1;
    for (var j = 0; j < TF_N; j++) {
      var yh = _tfY(tf.z[j + 1]), yb = _tfY(tf.z[j]);
      c.fillStyle = _tfCouleurT(tfTTranche(j), intensite);
      // +1 px : pas de liseré clair entre deux tranches
      c.fillRect(_tfX1, yh, _tfX2 - _tfX1, yb - yh + 1);
    }
  }

  // Limites des 10 bandes de repère (même masse de gaz dans chacune), en
  // pointillé léger : elles se resserrent dans une compression. Elles
  // restent quand les molécules sont regroupées en moins de bandes.
  c.strokeStyle = 'rgba(44,62,80,0.28)';
  c.lineWidth = 1;
  c.setLineDash([4, 4]);
  c.beginPath();
  for (var b = 1; b < TF_BANDES; b++) {
    var y = Math.round(_tfY(tf.z[b * TF_TR_PAR_BANDE])) + 0.5;
    c.moveTo(_tfX1, y);
    c.lineTo(_tfX2, y);
  }
  c.stroke();
  c.setLineDash([]);
}

// ── Parois latérales : toujours adiabatiques, dessinées dans la matière
//    hachurée de l'isolant du fond (seul le fond échange de la chaleur) ──
function _tfDessinerParois() {
  var c = tfCtx, p = _tfParoi;
  var yH = _tfY(TF_H_CYL) - p, yB = _tfY(-TF_EP_FOND);
  [_tfX1 - p, _tfX2].forEach(function (x) {
    c.fillStyle = '#e8dcc4';
    c.fillRect(x, yH, p, yB - yH);
    _tfHachures(x, yH, p, yB - yH, 'rgba(150,120,80,0.7)', Math.max(4, Math.min(7, p * 0.6)));
    c.strokeStyle = '#2c3e50';
    c.lineWidth = 1.5;
    c.strokeRect(x + 0.75, yH + 0.75, p - 1.5, yB - yH - 1.5);
  });
  // Rebords du haut : la butée haute du piston
  c.fillStyle = '#2c3e50';
  c.fillRect(_tfX1 - p, yH, 2 * p, p);
  c.fillRect(_tfX2 - p, yH, 2 * p, p);
}

// ── Graduations (cm) à gauche du cylindre, au-delà de la marge ──
function _tfDessinerGraduations() {
  var c = tfCtx;
  var x = _tfX1 - _tfParoi - _tfMargeCote() - 8;
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
  // Unité au-dessus des nombres, alignée sur eux à droite : loin de la
  // paroi de l'enceinte, qui descend juste à droite des graduations
  c.textAlign = 'right';
  c.textBaseline = 'bottom';
  c.fillText('cm', x - 13, _tfY(TF_H_CYL) - police * 0.9);
}

// ── Piston, tige, plateau et charge (blocs, puis sable), vérin ──
// La tige traverse le plateau et la charge ; le vérin, suspendu au plafond
// de l'enceinte, la saisit par le haut quand le piston est tenu.
function _tfDessinerPiston() {
  var c = tfCtx;
  var zP = tf.z[TF_N];
  var w = _tfX2 - _tfX1, cx = (_tfX1 + _tfX2) / 2;
  var lt = Math.max(6, w * 0.10);

  _tfDessinerVerin(zP);

  // Tige, du piston jusqu'au-dessus de la charge
  var yTigeB = _tfY(zP + TF_EP_PISTON);
  var yTigeH = _tfY(_tfZHautTige(zP));
  c.fillStyle = '#6a7a88';
  c.fillRect(cx - lt / 2, yTigeH, lt, yTigeB - yTigeH);

  // Plateau, qui porte la charge : seulement dans le montage à masses
  var zPl = zP + TF_EP_PISTON + TF_H_TIGE;
  var yPlB = _tfY(zPl), yPlH = _tfY(zPl + TF_EP_PLATEAU);
  if (tf.montage === 'masse') {
    var lp = w * 0.95, ep = 2 * (yPlB - yPlH);
    yPlH = yPlB - ep;
    c.fillStyle = '#3a4a58';
    _tfRectArrondi(cx - lp / 2, yPlH, lp, ep, 3);
    c.fill();
  }

  // Blocs : disque fendu enfilé sur la tige, masse écrite à droite de la tige
  var y = yPlH;
  if (tf.blocs > 0) {
    var hm = _tfHauteurMasse(tf.blocs) * _tfEch;
    var lm = w * 0.78;
    c.fillStyle = '#3a4a58';
    _tfRectArrondi(cx - lm / 2, y - hm, lm, hm, Math.min(6, hm * 0.2));
    c.fill();
    c.fillStyle = '#6a7a88';
    c.fillRect(cx - lt / 2, y - hm, lt, hm);
    c.fillStyle = '#fff';
    c.font = _tfPolice('bold', Math.max(10, Math.round(Math.min(hm * 0.45, lm * 0.15))));
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(_tfVirguleCourte(tf.blocs) + ' kg', cx + lt / 2 + (lm / 2 - lt / 2) / 2, y - hm / 2);
    y -= hm;
  }

  // Sable : tas de grains devant la tige, un grain dessiné par
  // TF_GRAIN_MAIN de sable posé à la main (chaque pas se voit), par
  // TF_GRAIN_DESSIN de sable versé ; un grain apparaît ou disparaît d'un
  // coup. Au-delà de TF_GRAINS_MAX, la masse croît, le tas non.
  if (tf.sable > 0) {
    var nb = Math.min(TF_GRAINS_MAX,
      Math.ceil(tf.sableMain / TF_GRAIN_MAIN - 1e-6)
      + Math.ceil((tf.sable - tf.sableMain) / TF_GRAIN_DESSIN - 1e-6));
    var g = w * TF_GRAIN_LARG, rangs = 0;
    for (var i = 0; i < nb; i++) {
      var gr = _tfGrains[i];
      c.fillStyle = TF_GRAIN_TEINTES[gr.t];
      c.fillRect(cx + (gr.col + gr.dx) * g, y - (gr.rang + 1 + gr.dy) * g, g, g);
      if (gr.rang + 1 > rangs) rangs = gr.rang + 1;
    }
    var hs = rangs * g;
    // Masse écrite sur une étiquette claire, lisible sur les grains
    if (hs > 11) {
      var fsS = Math.max(10, Math.min(13, Math.round(hs * 0.6)));
      var txtS = _tfFmt(tf.sable, tf.sable < 10 ? 2 : 1) + ' kg';
      c.font = _tfPolice('', fsS);
      var lS = c.measureText(txtS).width + 8, xS = cx + lt / 2 + 3;
      c.fillStyle = 'rgba(255, 250, 238, 0.85)';
      _tfRectArrondi(xS, y - hs / 2 - fsS * 0.7, lS, fsS * 1.4, 3);
      c.fill();
      c.fillStyle = '#5a4010';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(txtS, xS + 4, y - hs / 2);
    }
  }

  _tfDessinerCorpsPiston(zP);
}

// Haut de la tige du piston (m)
function _tfZHautTige(zP) {
  return zP + TF_EP_PISTON + TF_H_TIGE + TF_EP_PLATEAU + TF_H_TIGE_HAUT;
}

// ── Grains du tas de sable ──
// Cases d'une grille (colonne, rang ; en largeurs de grain, colonne 0 à
// droite de l'axe), rangées dans l'ordre où le tas se remplit : la clé
// rang + pente·(écart au plateau central) fait croître un tas à sommet plat
// et à flancs inclinés, qui garde sa forme ; le bruit de la clé (moins d'un
// rang) rend la surface irrégulière sans laisser de grain en l'air. Le
// dernier grain versé, à la surface, est le premier retiré.
var TF_GRAIN_DESSIN = 0.05;    // kg de sable versé par grain dessiné (40 kg : 800 grains)
var TF_GRAIN_MAIN   = 0.01;    // kg de sable posé à la main par grain dessiné (8 kg : 800)
var TF_GRAINS_MAX   = 800;     // tas plein : le haut de la tige reste visible
var TF_GRAIN_LARG   = 0.016;   // côté d'un grain, en fraction de la largeur du cylindre ;
                               // 40 kg de sable laissent voir le haut de la tige
var TF_GRAIN_TEINTES = ['#e2c084', '#c49a52', '#edd3a0', '#a97f3c'];
var _tfGrains = (function () {
  var demi = Math.floor(0.47 / TF_GRAIN_LARG);   // base : 0,94 de la largeur
  var plat = Math.floor(0.30 / TF_GRAIN_LARG);   // demi-sommet plat
  var pente = 2.5;                               // colonnes par rang sur les flancs
  var graine = 12345;
  function hasard() {                            // déterministe : même tas à chaque fois
    graine = (graine * 1103515245 + 12345) % 2147483648;
    return graine / 2147483648;
  }
  var cases = [];
  for (var rang = 0; rang < 60; rang++) {
    for (var col = -demi; col < demi; col++) {
      var ecart = Math.max(0, Math.abs(col + 0.5) - plat);
      cases.push({
        col: col, rang: rang,
        cle: rang + ecart / pente + 0.9 * hasard(),
        dx: 0.3 * (hasard() - 0.5), dy: 0.2 * hasard(),
        t: Math.floor(hasard() * TF_GRAIN_TEINTES.length)
      });
    }
  }
  cases.sort(function (a, b) { return a.cle - b.cle; });
  return cases.slice(0, TF_GRAINS_MAX);
})();

// Masse sans décimale inutile : 20, 12,5
function _tfVirguleCourte(x) {
  return Math.abs(x - Math.round(x)) < 1e-6 ? String(Math.round(x)) : _tfFmt(x, 1);
}

// Corps du piston (hachuré, comme l'onglet Pression)
function _tfDessinerCorpsPiston(zP) {
  var c = tfCtx, w = _tfX2 - _tfX1;
  var yH = _tfY(zP + TF_EP_PISTON), yB = _tfY(zP);
  c.fillStyle = '#8a9aaa';
  c.fillRect(_tfX1, yH, w, yB - yH);
  _tfHachures(_tfX1, yH, w, yB - yH, 'rgba(44,62,80,0.35)', 8);
  c.strokeStyle = '#2c3e50';
  c.lineWidth = 2;
  c.strokeRect(_tfX1, yH, w, yB - yH);
}

// ── Vérin ──
// Corps suspendu au plafond de l'enceinte. Piston tenu : sa tige descend et
// sa pince, fermée, saisit le haut de la tige du piston ; libre : tige
// rétractée, pince ouverte. Corps teinté pendant un mouvement.
var TF_Z_VERIN_BAS = TF_Z_TIGE_MAX + 0.022;
var TF_H_PINCE     = 0.014;

// Bâti du vérin sous le plafond de l'enceinte : haut et hauteur (px)
function _tfBati() {
  var y = _tfY(TF_Z_HAUT) + 2;
  return { y: y, h: Math.max(5, (_tfY(TF_Z_VERIN_BAS) - y) * 0.16) };
}

function _tfDessinerVerin(zP) {
  var c = tfCtx;
  var w = _tfX2 - _tfX1, cx = (_tfX1 + _tfX2) / 2;
  var B = _tfBati(), yBati = B.y, hBati = B.h;
  var yCorpsB = _tfY(TF_Z_VERIN_BAS);

  // Tige du vérin, jusqu'à la pince
  var zPince = tf.tenu ? _tfZHautTige(zP) - TF_H_PINCE * 0.7 : TF_Z_VERIN_BAS - TF_H_PINCE - 0.004;
  var yPinceH = _tfY(zPince + TF_H_PINCE), yPinceB = _tfY(zPince);
  var lv = Math.max(4, w * 0.06);
  c.fillStyle = '#4a5a68';
  c.fillRect(cx - lv / 2, yCorpsB, lv, yPinceH - yCorpsB);

  // Pince : une traverse et deux mâchoires, serrées sur la tige du piston
  // ou écartées
  var lt = Math.max(6, w * 0.10);
  var ecart = tf.tenu ? lt / 2 : lt / 2 + Math.max(4, w * 0.04);
  var lj = Math.max(4, w * 0.045);
  var ht = Math.max(3, (yPinceB - yPinceH) * 0.3);
  c.fillStyle   = tf.tenu ? '#c08020' : '#a0a8b0';
  c.strokeStyle = tf.tenu ? '#7a4a10' : '#6a7a88';
  c.lineWidth = 1;
  c.fillRect(cx - ecart - lj, yPinceH, 2 * (ecart + lj), ht);
  c.strokeRect(cx - ecart - lj + 0.5, yPinceH + 0.5, 2 * (ecart + lj) - 1, ht - 1);
  [-1, 1].forEach(function (s) {
    var x = s < 0 ? cx - ecart - lj : cx + ecart;
    c.fillRect(x, yPinceH, lj, yPinceB - yPinceH);
    c.strokeRect(x + 0.5, yPinceH + 0.5, lj - 1, yPinceB - yPinceH - 1);
  });

  // Corps du vérin
  var lc = w * 0.42;
  var yCorpsH = yBati + hBati;
  c.fillStyle = tf.verin.actif ? '#c08020' : '#5a6a78';
  _tfRectArrondi(cx - lc / 2, yCorpsH, lc, yCorpsB - yCorpsH, 4);
  c.fill();
  c.strokeStyle = '#2c3e50';
  c.lineWidth = 1.5;
  c.stroke();
  c.fillStyle = '#2c3e50';
  c.fillRect(cx - lv * 0.9, yCorpsB - 3, lv * 1.8, 4);
  var police = Math.max(9, Math.min(13, Math.round(Math.min(lc * 0.16, (yCorpsB - yCorpsH) * 0.5))));
  c.fillStyle = '#fff';
  c.font = _tfPolice('bold', police);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('vérin', cx, (yCorpsH + yCorpsB) / 2);

  // Bâti (fixé au plafond de l'enceinte, hachuré)
  var lb = w * 0.7;
  c.fillStyle = '#7a8a96';
  c.fillRect(cx - lb / 2, yBati, lb, hBati);
  _tfHachures(cx - lb / 2, yBati, lb, hBati, 'rgba(44,62,80,0.45)', 6);
}

// ── Hauteur visée (action sur le volume) : trait pointillé dans le cylindre et
//    repère sur les graduations ──
function _tfDessinerVisee() {
  var c = tfCtx;
  var y = Math.round(_tfY(tf.hVisee)) + 0.5;
  c.strokeStyle = 'rgba(192,128,32,0.9)';
  c.lineWidth = 1.5;
  c.setLineDash([6, 4]);
  c.beginPath();
  c.moveTo(_tfX1, y);
  c.lineTo(_tfX2, y);
  c.stroke();
  c.setLineDash([]);
  // Triangle contre les graduations
  var x = _tfX1 - _tfParoi - _tfMargeCote() - 8;
  c.fillStyle = '#c08020';
  c.beginPath();
  c.moveTo(x + 2, y);
  c.lineTo(x + 11, y - 6);
  c.lineTo(x + 11, y + 6);
  c.closePath();
  c.fill();
}

// ══════════════════════════════════════════════════════════════════════
//  Mise en évidence du hors-équilibre
// ══════════════════════════════════════════════════════════════════════

// Couleurs selon la température : bleu plus froid que T0, rouge plus chaud.
// Échelle en racine (saturée à ±150 K) pour que quelques kelvins d'écart se
// voient. Les molécules prennent une palette plus soutenue que le fond.
var TF_COUL_FOND = { neutre: [236, 240, 242], chaud: [238, 128, 88], froid: [96, 150, 214] };
var TF_COUL_MOL  = { neutre: [74, 98, 124],   chaud: [200, 52, 28],  froid: [24, 88, 196] };

// Écart à T0 ramené à [−1, 1] en racine (teinte plus vive près de T0) ;
// ±1 au-delà de TF_ECART_COUL_T
var TF_ECART_COUL_T = 150;   // K
function _tfEcartCoulT(T) {
  var d = (T - TF_T0) / TF_ECART_COUL_T;
  if (d > 1) d = 1; else if (d < -1) d = -1;
  return (d < 0 ? -1 : 1) * Math.sqrt(Math.abs(d));
}

function _tfMelangeT(T, pal, intensite) {
  var s = _tfEcartCoulT(T), f = Math.abs(s) * intensite;
  var n = pal.neutre, cible = s > 0 ? pal.chaud : pal.froid;
  return 'rgb(' + Math.round(n[0] + (cible[0] - n[0]) * f) + ','
                + Math.round(n[1] + (cible[1] - n[1]) * f) + ','
                + Math.round(n[2] + (cible[2] - n[2]) * f) + ')';
}

function _tfCouleurT(T, intensite) { return _tfMelangeT(T, TF_COUL_FOND, intensite); }

// ── Molécules ──
// Couleur de chaque molécule selon la température à son altitude (tranche
// locale), arrondie à TF_MOL_NUANCES nuances de chaque côté de T0 : les
// molécules d'une même nuance sont dessinées en un seul chemin.
var TF_MOL_NUANCES = 16;

function tfRayonMolecule() {
  return Math.max(1.3, (_tfX2 - _tfX1) * TF_MOL_RAYON);
}

var _tfMolParNuance = [];

function _tfDessinerMolecules() {
  var c = tfCtx, r = tfRayonMolecule();
  var w = _tfX2 - _tfX1, n, k, m, x, y;
  var nb = 2 * TF_MOL_NUANCES + 1;

  // Regroupement par nuance : indice 0 → 2·NUANCES, T0 au milieu, même
  // échelle en racine que _tfMelangeT
  for (n = 0; n < nb; n++) {
    if (!_tfMolParNuance[n]) _tfMolParNuance[n] = [];
    _tfMolParNuance[n].length = 0;
  }
  for (k = 0; k < tfMol.length; k++) {
    n = TF_MOL_NUANCES;
    if (tfAff.couleurT) n += Math.round(_tfEcartCoulT(tfMolT(tfMol[k])) * TF_MOL_NUANCES);
    _tfMolParNuance[n].push(tfMol[k]);
  }

  // Les molécules collées au piston ou au fond ne débordent pas du gaz
  c.save();
  c.beginPath();
  c.rect(_tfX1, _tfY(tf.z[TF_N]), w, _tfY(0) - _tfY(tf.z[TF_N]));
  c.clip();
  for (n = 0; n < nb; n++) {
    var liste = _tfMolParNuance[n];
    if (!liste.length) continue;
    if (tfAff.couleurT) {
      // Température qui redonne exactement cette nuance
      var f = (n - TF_MOL_NUANCES) / TF_MOL_NUANCES;
      c.fillStyle = _tfMelangeT(TF_T0 + (f < 0 ? -1 : 1) * f * f * TF_ECART_COUL_T, TF_COUL_MOL, 1);
    } else {
      c.fillStyle = '#2a6aaa';
    }
    c.beginPath();
    for (k = 0; k < liste.length; k++) {
      m = liste[k];
      x = _tfX1 + m.x * w; y = _tfY(tfMolZ(m));
      c.moveTo(x + r, y);
      c.arc(x, y, r, 0, 2 * Math.PI);
    }
    c.fill();
  }
  c.restore();
}

// ── Sondes : T et P de trois tranches, lues sur le flanc droit ──
function _tfDessinerSondes() {
  var c = tfCtx;
  var police = Math.max(11, Math.min(15, Math.round((_tfX2 - _tfX1) * 0.05)));
  var hBoite = police + 8;
  c.font = _tfPolice('bold', police);
  c.textBaseline = 'middle';
  c.textAlign = 'right';
  var dernierY = -Infinity;
  for (var k = 0; k < TF_SONDES.length; k++) {
    var j = TF_SONDES[k];
    var y = _tfY((tf.z[j] + tf.z[j + 1]) / 2);
    if (Math.abs(y - dernierY) < hBoite + 2) continue;   // gaz trop écrasé
    dernierY = y;
    var txt = _tfFmt(tfTTranche(j), 1) + ' K   ' + _tfFmt(tf.P[j] / 1000, 3) + ' kPa';
    var lw = c.measureText(txt).width + 12;
    var xD = _tfX2 - 6;
    c.fillStyle = 'rgba(255,255,255,0.88)';
    c.strokeStyle = '#c08020';
    c.lineWidth = 1.5;
    _tfRectArrondi(xD - lw, y - hBoite / 2, lw, hBoite, 4);
    c.fill(); c.stroke();
    // Capteur dans la paroi
    c.fillStyle = '#c08020';
    c.fillRect(_tfX2, y - 3, _tfParoi, 6);
    c.fillStyle = '#2c3e50';
    c.fillText(txt, xD - 6, y + 0.5);
  }
}

// toFixed garde le signe d'un négatif arrondi à zéro (« -0.00 ») : retiré
function _tfFixe(x, d) {
  var s = x.toFixed(d);
  return /^-[0.]+$/.test(s) ? s.slice(1) : s;
}

// Nombre à d décimales, virgule décimale (toutes les cartes de l'onglet)
function _tfFmt(x, d) { return _tfFixe(x, d).replace('.', ','); }

// ── Profils de pression et de température à droite du cylindre ──
// Échelle absolue par défaut (axe de 0 à Pmax arrondi, en kPa ; de 0 à Tmax,
// en K) : les écarts d'une compression rapide se lisent tels quels. Échelle
// amplifiée en option (case sous les profils), P(z) − P̄ en Pa, T(z) − T̄
// en K, pour voir les très petits écarts de la masse posée. Échelle ronde
// (1, 2, 5 × 10ⁿ), agrandie aussitôt, resserrée seulement au départ de
// l'étape suivante : resserrée en cours de route (ou au retour à
// l'équilibre), elle faisait sauter la courbe et masquait l'amortissement. Couleurs des graphes au cours du temps
// (tf-graph.js).
var TF_PROF = {
  P: { min: 1,    coul: '#2a6aaa', titre: 'P (kPa)', titreAmp: 'P − P̄ (Pa)', unite: 1000 },
  T: { min: 0.01, coul: '#c0503a', titre: 'T (K)',   titreAmp: 'T − T̄ (K)',  unite: 1 }
};
// min : échelle la plus fine (en deçà, ce n'est que du bruit numérique) ;
// unite : diviseur de l'échelle absolue pour ses graduations
// ech : échelle ; amp : amplification à l'image précédente (null :
// échelle à réajuster)
var _tfProfEtat = { P: { ech: 1, amp: null }, T: { ech: 1, amp: null } };

// Départ d'une étape (tf-ui.js, _tfOuvrirEtape) ou réinitialisation :
// échelles des profils réajustées à l'image suivante
function tfProfilsRepartir() {
  _tfProfEtat.P.amp = _tfProfEtat.T.amp = null;
}

// Case « Profils amplifiés », sous les cadres des profils, sous leurs
// graduations
function _tfPlacerCaseAmplifie() {
  var el = document.getElementById('tf-prof-amp');
  if (!el) return;
  var n = _tfProfils.length;
  if (!n || _tfProfils[0].x2 - _tfProfils[0].x1 < 40) { el.style.display = 'none'; return; }
  var x1 = _tfProfils[0].x1, x2 = _tfProfils[n - 1].x2;
  var police = _tfPoliceProfil(_tfProfils[0]);
  el.style.display = '';
  el.style.left  = x1 + 'px';
  el.style.width = (x2 - x1) + 'px';
  el.style.top   = (_tfY(0) + police + 8) + 'px';
  el.style.fontSize = police + 'px';
  var txt = el.querySelector('span');
  if (txt) txt.textContent = n === 2 ? 'Profils amplifiés (écart à la moyenne)'
                                     : 'Profil amplifié (écart à la moyenne)';
}

function _tfPoliceProfil(p) {
  return Math.max(10, Math.min(14, Math.round((p.x2 - p.x1) * 0.085)));
}

function _tfDessinerProfil(p) {
  var c = tfCtx, g = p.g, def = TF_PROF[g], etat = _tfProfEtat[g];
  var x1 = p.x1, x2 = p.x2;
  if (x2 - x1 < 40) return;
  var amp = tfAff.amplifie;
  var xc = (x1 + x2) / 2, demi = (x2 - x1) / 2 - 6;
  var x0 = x1 + 6, larg = x2 - x1 - 12;   // échelle absolue : axe de 0 à l'échelle
  var yH = _tfY(tf.z[TF_N]), yB = _tfY(0);

  // Valeurs des tranches et moyenne (P en volume, T en masse)
  var mes = tfMesures(), moy = g === 'P' ? mes.Pmoy : mes.Tmoy;
  var v = [], val = 0, j;
  for (j = 0; j < TF_N; j++) {
    v[j] = g === 'P' ? tf.P[j] : tfTTranche(j);
    // Valeur à loger : plus grand écart à la moyenne, ou plus grande valeur
    val = Math.max(val, amp ? Math.abs(v[j] - moy) : v[j]);
  }
  // Échelle ajustée au départ d'une étape et au changement d'échelle ;
  // pendant l'étape, elle ne fait que grandir : le retour à l'équilibre se
  // lit comme une courbe qui s'aplatit dans un cadre fixe
  if (etat.amp !== amp) {
    etat.ech = Math.max(def.min, _tfEchelleRonde(val));
  } else if (val > etat.ech) {
    etat.ech = _tfEchelleRonde(val);
  }
  etat.amp = amp;
  var ech = etat.ech;

  // Cadre, et axe du zéro (amplifié) ou de la moyenne (absolu)
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.fillRect(x1, yH, x2 - x1, yB - yH);
  c.strokeStyle = '#c8c0b4';
  c.lineWidth = 1;
  c.strokeRect(x1 + 0.5, yH + 0.5, x2 - x1 - 1, yB - yH - 1);
  var xRef = amp ? xc : x0 + moy / ech * larg;
  c.strokeStyle = '#7a8a96';
  c.setLineDash([3, 3]);
  c.beginPath(); c.moveTo(xRef, yH); c.lineTo(xRef, yB); c.stroke();
  c.setLineDash([]);

  // Courbe, au centre de chaque tranche
  c.strokeStyle = def.coul;
  c.lineWidth = 2;
  c.beginPath();
  for (j = 0; j < TF_N; j++) {
    var x = amp ? xc + (v[j] - moy) / ech * demi
                : x0 + v[j] / ech * larg;
    var y = _tfY((tf.z[j] + tf.z[j + 1]) / 2);
    if (j === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.stroke();

  // Titre et graduations
  var police = _tfPoliceProfil(p);
  c.fillStyle = '#2c3e50';
  c.font = _tfPolice('bold', police);
  c.textAlign = 'center';
  c.textBaseline = 'bottom';
  c.fillText(amp ? def.titreAmp : def.titre, xc, yH - 4);
  c.font = _tfPolice('', police);
  c.fillStyle = '#5a6a78';
  c.textBaseline = 'top';
  if (amp) {
    var lib = _tfFmtEchelle(ech);
    c.textAlign = 'left';   c.fillText('−' + lib, x1 + 2, yB + 3);
    c.textAlign = 'right';  c.fillText('+' + lib, x2 - 2, yB + 3);
    c.textAlign = 'center'; c.fillText('0', xc, yB + 3);
  } else {
    c.textAlign = 'left';   c.fillText('0', x0, yB + 3);
    c.textAlign = 'right';  c.fillText(_tfFmtEchelle(ech / def.unite), x0 + larg, yB + 3);
  }
}

// Plus petite valeur 1, 2 ou 5 × 10ⁿ supérieure ou égale à x
function _tfEchelleRonde(x) { return x > 0 ? _tfgCran(x, [1, 2, 5]) : 0; }

// Écriture d'une échelle ronde avec espace des milliers : 5, 20, 1 000… ;
// sous 1, avec les décimales utiles : 0,5, 0,02…
function _tfFmtEchelle(x) {
  if (x < 1 && x > 0) return _tfFmt(x, Math.ceil(-Math.log(x) / Math.LN10 - 1e-9));
  return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// ══════════════════════════════════════════════════════════════════════
//  Compteur de temps : Δt de l'étape et vitesse de son écoulement
//  Dans un cadre en haut de l'enceinte, à droite du vérin : le temps
//  écoulé depuis le départ de l'étape, celui des graphes au cours du temps
//  (arrêté avec eux quand le chrono est figé à l'équilibre), et la vitesse
//  (×1/100, ×500…). Pendant un passage progressif d'une vitesse à l'autre
//  (vitesse adaptée, tf-ui.js), la vitesse défile, précédée de ▲ ou ▼ ; un
//  changement d'un coup (gaz au repos) la surligne un instant. Avec Auto,
//  la phase suivie (pendant l'action, ondes et piston, équilibre
//  thermique) suit la vitesse.
// ══════════════════════════════════════════════════════════════════════

// sens : +1 le temps accélère, −1 il ralentit ; saut : date (ms) du dernier
// changement d'un coup (tf-ui.js)
var tfChrono = { sens: 0, saut: -Infinity };
var TF_CHRONO_SAUT = 1500;   // ms : durée du surlignage

// Δt avec assez de chiffres pour défiler : 1,84 ms, 712,9 ms, 12,35 s,
// 4 min 05 s, 2 h 05 min
function _tfFmtDeltaT(t) {
  if (t < 0.01) return _tfFmt(t * 1000, 2) + ' ms';
  if (t < 1)    return _tfFmt(t * 1000, 1) + ' ms';
  if (t < 60)   return _tfFmt(t, 2) + ' s';
  var deux = function (n) { return (n < 10 ? '0' : '') + n; };
  if (t < 3600) {
    var mn = Math.floor(t / 60);
    return mn + ' min ' + deux(Math.floor(t - 60 * mn)) + ' s';
  }
  var h = Math.floor(t / 3600);
  return h + ' h ' + deux(Math.floor((t - 3600 * h) / 60)) + ' min';
}

function _tfDessinerChrono() {
  var c = tfCtx, v = tf.vitesse, xs = _tfClocheX();
  var w = _tfX2 - _tfX1, cx = (_tfX1 + _tfX2) / 2;
  // Cadre entre le corps du vérin (0,42·w de large) et la paroi de la
  // cloche, à égale distance des deux, et à la même distance sous le bâti
  // (qui le surplombe en partie)
  var g = Math.max(8, Math.round(w * 0.03));
  var x0 = Math.round(cx + 0.21 * w + g) + 0.5, x1 = Math.round(xs[1] - 1 - g) - 0.5;
  var B = _tfBati();
  var y0 = Math.round(B.y + B.h + g) + 0.5;
  var pad = 6, dispo = x1 - x0 - 2 * pad;
  if (dispo < 40) return;
  var police = TF_POLICE;
  var d = tfGraphChrono();
  var txtT = 'Δt = ' + _tfFmtDeltaT(Math.max(0, d.dt));
  var fleche = tfChrono.sens > 0 ? '▲ ' : tfChrono.sens < 0 ? '▼ ' : '';
  var txtV = fleche + '×' + _tfLibelleVitesse(v);
  var mot = tfPhaseAuto() || (tfChrono.sens > 0 ? 'accélère' : tfChrono.sens < 0 ? 'ralentit'
          : v < 0.999 ? 'ralenti' : v > 1.001 ? 'accéléré' : 'temps réel');
  // Calcul plafonné (tf.limite) : la vitesse réellement tenue, en orange, à
  // la place du mot (ici plutôt que dans le panneau, où la ligne qui
  // apparaissait et disparaissait décalait tous les boutons)
  var limite = tf.limite ? 'atteint ×' + _tfLibelleVitesse(+_tfVitesseAtteinte.toPrecision(2)) : '';
  if (limite) mot = limite;

  // Police la plus grande (24 px au plus) qui tient dans le cadre ; largeur
  // mesurée sur un gabarit, pour ne pas varier quand les chiffres défilent
  c.save();
  c.font = '700 20px ' + police;
  var gabarit = Math.max(c.measureText('Δt = 000,0 ms').width, c.measureText(txtT).width);
  var f1 = Math.max(13, Math.min(24, Math.floor(20 * dispo / gabarit)));
  var f2 = Math.round(f1 * 0.8);
  c.font = '700 ' + f2 + 'px ' + police;
  var wV = c.measureText(txtV).width;
  c.font = f2 + 'px ' + police;
  var wMot = c.measureText(' ' + mot).width;
  if (wV + wMot > dispo) {   // trop étroit : la vitesse seule, celle atteinte si le calcul plafonne
    wMot = 0;
    if (limite) {
      txtV = limite.replace('atteint ', '');
      c.font = '700 ' + f2 + 'px ' + police;
      wV = c.measureText(txtV).width;
    }
  }

  // Cadre : fond clair (lisible sur l'air teinté de l'enceinte), bordure
  var h = Math.round(2 * pad + f1 * 1.2 + 4 + f2 * 1.2);
  _tfRectArrondi(x0, y0, x1 - x0, h, 6);
  c.fillStyle = '#fffdf9';
  c.fill();
  c.strokeStyle = 'rgba(70,100,130,0.75)';   // comme la paroi de la cloche
  c.lineWidth = 1.5;
  c.stroke();

  var xm = (x0 + x1) / 2;
  c.textBaseline = 'top';
  c.textAlign = 'center';
  c.font = '700 ' + f1 + 'px ' + police;
  // Grisé quand le chrono des graphes est figé (équilibre)
  c.fillStyle = d.gele ? '#8a96a0' : '#2c3e50';
  c.fillText(txtT, xm, y0 + pad);

  var coul = v < 0.999 ? '#2f6fb0' : v > 1.001 ? '#c0602a' : '#2c3e50';
  var coulLim = '#c05a00';
  var y2 = y0 + pad + f1 * 1.2 + 4, xV = xm - (wV + wMot) / 2;
  // Changement de vitesse d'un coup : la vitesse surlignée, qui s'efface
  var age = performance.now() - tfChrono.saut;
  if (age < TF_CHRONO_SAUT) {
    c.globalAlpha = 0.35 * (1 - age / TF_CHRONO_SAUT);
    c.fillStyle = coul;
    _tfRectArrondi(xV - 3, y2 - 2, wV + 6, f2 * 1.2 + 2, 3);
    c.fill();
    c.globalAlpha = 1;
  }
  c.textAlign = 'left';
  c.font = '700 ' + f2 + 'px ' + police;
  c.fillStyle = limite && !wMot ? coulLim : coul;
  c.fillText(txtV, xV, y2);
  if (wMot) {
    c.font = (limite ? '700 ' : '') + f2 + 'px ' + police;
    c.fillStyle = limite ? coulLim : tfChrono.sens ? coul : '#6a7a88';
    c.fillText(' ' + mot, xV + wV, y2);
  }
  c.restore();
}

// ══════════════════════════════════════════════════════════════════════
//  Utilitaires de dessin
// ══════════════════════════════════════════════════════════════════════

// Marge entre la paroi et les graduations (px), de part et d'autre du
// cylindre, sous l'enceinte
function _tfMargeCote() { return _tfCote(_tfX2 - _tfX1) - _tfParoi; }

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

// Zone de la scène (#tf-sim-area) : observée par tfGraphInit
window.addEventListener('resize', tfResize);
