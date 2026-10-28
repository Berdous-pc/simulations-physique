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

// ── Options d'affichage (section Affichage du panneau) ──
var tfAff = {
  molecules : true,    // molécules pilotées par le modèle
  trainees  : false,   // traînée derrière chaque molécule, longueur ∝ vitesse
  couleurT  : true,    // gaz et molécules colorés selon la température
  sondes    : false,   // trois sondes T et P sur le flanc du cylindre
  profil    : false    // profil de pression P(z) − P̄ à droite du cylindre
};

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
var _tfProfX1 = 0, _tfProfX2 = 0;   // cadre du profil de pression (px)

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
  // (~60 px) et à droite la tête des goupilles (~15 px), et le profil de
  // pression s'il est affiché.
  var profil = tfAff.profil ? Math.max(110, Math.min(190, _tfCw * 0.24)) : 0;
  var hCyl = TF_H_CYL * _tfEch;
  var larg = Math.min(TF_LARG_MAX * hCyl, (_tfCw - 2 * marge - 75 - profil) / 1.46);
  larg = Math.max(40, larg);
  _tfParoi = Math.max(4, Math.round(larg * 0.035));
  var cote = 0.16 * larg + 2 * _tfParoi;           // paroi + goupille
  var libre = _tfCw - 2 * marge - (larg + 2 * cote + 75 + profil);
  _tfX1 = marge + Math.max(0, libre) / 2 + 60 + cote;
  _tfX2 = _tfX1 + larg;
  _tfProfX1 = _tfX2 + cote + 15 + 8;
  _tfProfX2 = _tfProfX1 + profil - 8;

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
  if (tfAff.molecules) _tfDessinerMolecules();
  _tfDessinerParois();
  _tfDessinerGraduations();
  _tfDessinerPiston();
  if (tfAff.sondes) _tfDessinerSondes();
  if (tfAff.profil) _tfDessinerProfil();
  if (tf.ondesExagerees) _tfDessinerMentionOndes();
}

// Largeur intérieure dessinée, en m d'échelle verticale (pour les molécules)
function tfLargeurDessinee() { return (_tfX2 - _tfX1) / _tfEch; }

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

  // Limites des tranches (même masse de gaz dans chacune) : elles se
  // resserrent dans une compression et rendent les ondes visibles au ralenti.
  c.strokeStyle = 'rgba(42,106,170,0.16)';
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
//  Mise en évidence du hors-équilibre
// ══════════════════════════════════════════════════════════════════════

// Couleurs selon la température : bleu plus froid que T0, rouge plus chaud.
// Échelle en racine (saturée à ±150 K) pour que quelques kelvins d'écart se
// voient. Les molécules prennent une palette plus soutenue que le fond.
var TF_COUL_FOND = { neutre: [236, 240, 242], chaud: [238, 128, 88], froid: [96, 150, 214] };
var TF_COUL_MOL  = { neutre: [74, 98, 124],   chaud: [200, 52, 28],  froid: [24, 88, 196] };

function _tfMelangeT(T, pal, intensite) {
  var d = (T - TF_T0) / 150;
  if (d > 1) d = 1; else if (d < -1) d = -1;
  var f = Math.sqrt(Math.abs(d)) * intensite;
  var n = pal.neutre, cible = d > 0 ? pal.chaud : pal.froid;
  return 'rgb(' + Math.round(n[0] + (cible[0] - n[0]) * f) + ','
                + Math.round(n[1] + (cible[1] - n[1]) * f) + ','
                + Math.round(n[2] + (cible[2] - n[2]) * f) + ')';
}

function _tfCouleurT(T, intensite) { return _tfMelangeT(T, TF_COUL_FOND, intensite); }

// ── Molécules ──
// Petites et nombreuses : dessinées par tranche, d'une seule couleur par
// tranche (celle de sa température), en un seul chemin chacune.
var TF_MOL_TRAINEE = 0.09;   // s : longueur de la traînée = vitesse × durée

function tfRayonMolecule() {
  return Math.max(1.8, (_tfX2 - _tfX1) * TF_MOL_RAYON);
}

var _tfMolParTranche = [];

function _tfDessinerMolecules() {
  var c = tfCtx, r = tfRayonMolecule();
  var w = _tfX2 - _tfX1, j, k, m, x, y;

  // Regroupement par tranche (une couleur par tranche)
  for (j = 0; j < TF_N; j++) {
    if (!_tfMolParTranche[j]) _tfMolParTranche[j] = [];
    _tfMolParTranche[j].length = 0;
  }
  for (k = 0; k < tfMol.length; k++) _tfMolParTranche[tfMol[k].j].push(tfMol[k]);

  // Les molécules collées au piston ou au fond ne débordent pas du gaz
  c.save();
  c.beginPath();
  c.rect(_tfX1, _tfY(tf.z[TF_N]), w, _tfY(0) - _tfY(tf.z[TF_N]));
  c.clip();
  c.lineCap = 'round';
  for (j = 0; j < TF_N; j++) {
    var liste = _tfMolParTranche[j];
    if (!liste.length) continue;
    var coul = tfAff.couleurT ? _tfMelangeT(tfTTranche(j), TF_COUL_MOL, 1) : '#2a6aaa';

    // Traînées : segment derrière la molécule, longueur ∝ vitesse
    if (tfAff.trainees) {
      var l = tfMolVitesse(j) * TF_MOL_TRAINEE * _tfEch;
      c.strokeStyle = coul;
      c.globalAlpha = 0.45;
      c.lineWidth = r;
      c.beginPath();
      for (k = 0; k < liste.length; k++) {
        m = liste[k];
        x = _tfX1 + m.x * w; y = _tfY(tfMolZ(m));
        c.moveTo(x, y);
        c.lineTo(x - m.ux * l, y + m.uz * l);
      }
      c.stroke();
      c.globalAlpha = 1;
    }

    c.fillStyle = coul;
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
  c.font = 'bold ' + police + 'px "Segoe UI", Arial, sans-serif';
  c.textBaseline = 'middle';
  c.textAlign = 'right';
  var dernierY = -Infinity;
  for (var k = 0; k < TF_SONDES.length; k++) {
    var j = TF_SONDES[k];
    var y = _tfY((tf.z[j] + tf.z[j + 1]) / 2);
    if (Math.abs(y - dernierY) < hBoite + 2) continue;   // gaz trop écrasé
    dernierY = y;
    var txt = _tfVirgule(tfTTranche(j), 1) + ' K   ' + _tfVirgule(tf.P[j] / 1000, 3) + ' kPa';
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

function _tfVirgule(x, d) { return x.toFixed(d).replace('.', ','); }

// ── Profil de pression P(z) − P̄ à droite du cylindre ──
// Échelle automatique en Pa (1, 2, 5 × 10ⁿ), agrandie aussitôt, mais
// resserrée seulement après ~1 s de petits écarts : pas de va-et-vient.
var _tfProfEch = 1, _tfProfPetit = 0;
var TF_PROF_ECH_MIN = 1;   // Pa : en deçà, ce n'est que du bruit numérique

function _tfDessinerProfil() {
  var c = tfCtx;
  var x1 = _tfProfX1, x2 = _tfProfX2;
  if (x2 - x1 < 40) return;
  var xc = (x1 + x2) / 2, demi = (x2 - x1) / 2 - 6;
  var yH = _tfY(tf.z[TF_N]), yB = _tfY(0);

  // Pression moyenne (en volume) et plus grand écart
  var Pm = tfMesures().Pmoy, ecart = 0, j;
  for (j = 0; j < TF_N; j++) ecart = Math.max(ecart, Math.abs(tf.P[j] - Pm));

  if (ecart > _tfProfEch) {
    _tfProfEch = _tfEchelleRonde(ecart);
    _tfProfPetit = 0;
  } else if (ecart < _tfProfEch / 10 && _tfProfEch > TF_PROF_ECH_MIN) {
    if (++_tfProfPetit > 60) {
      _tfProfEch = Math.max(TF_PROF_ECH_MIN, _tfEchelleRonde(ecart));
      _tfProfPetit = 0;
    }
  } else {
    _tfProfPetit = 0;
  }

  // Cadre et axe du zéro
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.fillRect(x1, yH, x2 - x1, yB - yH);
  c.strokeStyle = '#c8c0b4';
  c.lineWidth = 1;
  c.strokeRect(x1 + 0.5, yH + 0.5, x2 - x1 - 1, yB - yH - 1);
  c.strokeStyle = '#7a8a96';
  c.setLineDash([3, 3]);
  c.beginPath(); c.moveTo(xc, yH); c.lineTo(xc, yB); c.stroke();
  c.setLineDash([]);

  // Courbe, au centre de chaque tranche
  c.strokeStyle = '#b04020';
  c.lineWidth = 2;
  c.beginPath();
  for (j = 0; j < TF_N; j++) {
    var x = xc + (tf.P[j] - Pm) / _tfProfEch * demi;
    var y = _tfY((tf.z[j] + tf.z[j + 1]) / 2);
    if (j === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.stroke();

  // Titre et graduations
  var police = Math.max(10, Math.min(14, Math.round((x2 - x1) * 0.085)));
  c.fillStyle = '#2c3e50';
  c.font = 'bold ' + police + 'px "Segoe UI", Arial, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'bottom';
  c.fillText('P − P̄ (Pa)', xc, yH - 4);
  c.font = police + 'px "Segoe UI", Arial, sans-serif';
  c.fillStyle = '#5a6a78';
  c.textBaseline = 'top';
  var lib = _tfFmtPa(_tfProfEch);
  c.textAlign = 'left';   c.fillText('−' + lib, x1 + 2, yB + 3);
  c.textAlign = 'right';  c.fillText('+' + lib, x2 - 2, yB + 3);
  c.textAlign = 'center'; c.fillText('0', xc, yB + 3);
}

// Plus petite valeur 1, 2 ou 5 × 10ⁿ supérieure ou égale à x
function _tfEchelleRonde(x) {
  if (x <= 0) return TF_PROF_ECH_MIN;
  var p = Math.pow(10, Math.floor(Math.log(x) / Math.LN10));
  var f = x / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

// Écriture d'une échelle en Pa avec espace des milliers : 5, 20, 1 000…
function _tfFmtPa(x) {
  return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// ── Mention permanente quand les ondes sont exagérées ──
function _tfDessinerMentionOndes() {
  var c = tfCtx;
  var police = Math.max(12, Math.round(_tfEch * 0.024));
  c.font = 'bold ' + police + 'px "Segoe UI", Arial, sans-serif';
  c.textAlign = 'left';
  c.textBaseline = 'top';
  var txt = 'Ondes exagérées';
  var lw = c.measureText(txt).width + 14;
  c.fillStyle = '#fde8c8';
  c.strokeStyle = '#d0a060';
  c.lineWidth = 1.5;
  _tfRectArrondi(8, 8, lw, police + 10, 5);
  c.fill(); c.stroke();
  c.fillStyle = '#7a3a10';
  c.fillText(txt, 15, 13);
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
