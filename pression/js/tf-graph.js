// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  tf-graph.js — Onglet Transformations : graphes temporels T, P, V(t),
//  diagramme de Clapeyron (chemin, états d'équilibre, nuage des tranches,
//  courbes théoriques), zoom, réticule et splitters de la colonne gauche.
//  Chargé après tf-scene.js (couleurs selon T), avant tf-ui.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// Fenêtre glissante des graphes temporels (s), alignée sur TF_VITESSES :
// une même durée réelle à l'écran (~20 s) quel que soit le cran
var TF_G_FENETRES    = [0.005, 0.02, 0.2, 2, 20, 100, 400];
var TF_G_PAR_FENETRE = 500;     // échantillons par fenêtre
var TF_G_MAX         = 20000;   // au-delà, l'historique est éclairci de moitié

// Couleurs : encre et grille du site ; une teinte par grandeur
var TF_G_ENCRE  = '#2c3e50';
var TF_G_MUET   = '#7a8a96';
var TF_G_GRILLE = '#ebe5db';
var TF_G_CADRE  = '#b0a898';
var TF_G_FOND   = '#fffdf9';
var TF_G_ND     = '#b04020';     // « non défini », comme dans le tableau
var TF_G_CHEMIN = '#2a5080';
var TF_G_PISTON = '#c08020';
var TF_G_ISOT   = '#4a8a9a';
var TF_G_ADIA   = '#a0603a';

// Grandeurs des graphes temporels : clé de la moyenne, des extrêmes des
// tranches et du critère « définie » dans un échantillon ; facteur d'unité ;
// étendue minimale de l'axe (évite de grossir le bruit numérique au repos)
var TF_G_SERIES = [
  { titre: 'T (K)',   coul: '#c0503a', m: 'Tm', min: 'Tmin', max: 'Tmax', def: 'Tdef', f: 1,    span: 2 },
  { titre: 'P (kPa)', coul: '#2a6aaa', m: 'Pm', min: 'Pmin', max: 'Pmax', def: 'Pdef', f: 1e-3, span: 2 },
  { titre: 'V (L)',   coul: '#2a8a50', m: 'V',  min: 'V',    max: 'V',    def: null,   f: 1e3,  span: 0.02 }
];

// Options du diagramme PV (section Affichage)
var tfGraphAff = {
  nuage       : true,    // un point (N·V_tranche, P_tranche) par tranche
  piston      : false,   // pression exercée sur le gaz par le piston
  isotherme   : false,
  adiabatique : false
};

var tfGraph = {
  ech       : [],      // historique : un objet par échantillon
  ref       : null,    // état de départ de la transformation en cours
  dernierEq : null,
  etaitEq   : true,
  env       : null,    // étendue du nuage depuis le départ (cadrage PV)
  vueT      : null,    // null : fenêtre glissante ; sinon {t1, t2}
  pileT     : [],
  vuePV     : null,    // null : cadrage automatique ; sinon {V1, V2, P1, P2}
  pilePV    : [],
  geoT      : null,    // géométrie du dernier tracé (souris)
  geoPV     : null,
  reticule  : false,
  souris    : null,    // {cible, x, y}
  glisse    : null,    // zoom rectangle en cours {cible, x0, y0, x1, y1}
  cv        : null,    // {pv, t} : canvas, contexte, taille
  sale      : true
};

// ══════════════════════════════════════════════════════════════════════
//  Enregistrement
// ══════════════════════════════════════════════════════════════════════

function _tfgFenetre() {
  var i = TF_VITESSES.indexOf(tf.vitesse);
  return TF_G_FENETRES[i >= 0 ? i : 4];
}

// Appelé par tfAvancer dès que tf.t atteint tf.tEchant. Le pas suit la
// fenêtre affichée, et se resserre pendant un mouvement du vérin pour que
// les compressions brèves soient décrites même aux crans rapides.
function _tfgPasEchant() {
  var dt = _tfgFenetre() / TF_G_PAR_FENETRE;
  return tf.verin.actif ? Math.min(dt, tf.verin.tau / 200) : dt;
}

// Après un changement de cran ou un départ du vérin : l'échéance suivante
// ne doit pas attendre l'ancien pas, plus long
function tfGraphReprogrammer() {
  tf.tEchant = Math.min(tf.tEchant, tf.t + _tfgPasEchant());
}

// avantMarche : échantillon forcé juste avant une marche d'escalier (il clôt
// le séjour à l'équilibre en cours, cf. _tfgDessinerPV)
function _tfgEchantillon(avantMarche) {
  tf.tEchant = tf.t + _tfgPasEchant();

  var m = tfMesures();
  var s = {
    t: tf.t, V: m.V,
    Pm: m.Pmoy, Pmin: m.Pmin, Pmax: m.Pmax, Pdef: m.Pdef,
    Tm: m.Tmoy, Tmin: m.Tmin, Tmax: m.Tmax, Tdef: m.Tdef,
    eq: m.equilibre,
    // Pression exercée par le piston : P_ext piston libre, celle que
    // mesure le vérin piston tenu
    Pp: tf.tenu ? m.Pface : m.Pext,
    Text: tf.Text,
    marche: avantMarche === true
  };
  var g = tfGraph;
  g.ech.push(s);
  if (g.ech.length > TF_G_MAX) {
    var e = g.ech, garde = [];
    for (var k = 0; k < e.length; k++) if (k % 2 === 0 || e[k].marche || k === e.length - 1) garde.push(e[k]);
    g.ech = garde;
  }

  // Les courbes théoriques partent du dernier état d'équilibre avant que le
  // gaz n'en sorte ; elles restent en place après l'arrivée, pour comparer
  if (!g.ref) g.ref = s;
  if (s.eq) g.dernierEq = s;
  else if (g.etaitEq && g.dernierEq) { g.ref = g.dernierEq; g.env = null; }
  g.etaitEq = s.eq;
  _tfgEnveloppe();
  g.sale = true;
}

// Étendue du nuage des tranches depuis le départ de la transformation : le
// cadrage automatique ne fait que s'élargir pendant un choc, au lieu de
// pomper à chaque image
function _tfgEnveloppe() {
  var g = tfGraph;
  if (!g.env) g.env = { V1: Infinity, V2: -Infinity, P1: Infinity, P2: -Infinity };
  _tfgNuage(function (V, P) {
    if (V < g.env.V1) g.env.V1 = V;
    if (V > g.env.V2) g.env.V2 = V;
    if (P < g.env.P1) g.env.P1 = P;
    if (P > g.env.P2) g.env.P2 = P;
  });
}

// Parcourt les tranches : volume qu'aurait le gaz entier s'il était partout
// comme la tranche (L), pression (kPa), température (K)
function _tfgNuage(fn) {
  var k = TF_N * TF_S * 1e3;
  for (var j = 0; j < TF_N; j++) {
    fn(k * (tf.z[j + 1] - tf.z[j]), tf.P[j] * 1e-3, tfTTranche(j));
  }
}

// Efface l'historique (Réinitialiser) et enregistre
// l'état initial
function tfGraphEffacer() {
  var g = tfGraph;
  g.ech = [];
  g.ref = g.dernierEq = g.env = null;
  g.etaitEq = true;
  g.vueT = g.vuePV = null;
  g.pileT = [];
  g.pilePV = [];
  _tfgEchantillon();
}

// ══════════════════════════════════════════════════════════════════════
//  Outils de tracé
// ══════════════════════════════════════════════════════════════════════

function _tfgTaille(o) {
  var z = o.c.parentElement, w = z.clientWidth, h = z.clientHeight;
  if (w === 0 || h === 0) { o.w = 0; return; }
  var dpr = window.devicePixelRatio || 1;
  if (w !== o.w || h !== o.h || dpr !== o.dpr) {
    o.c.width  = Math.round(w * dpr);
    o.c.height = Math.round(h * dpr);
    o.w = w; o.h = h; o.dpr = dpr;
  }
  o.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Pas de graduation 1, 2 ou 5 × 10ⁿ pour environ n intervalles
function _tfgPas(etendue, n) {
  var brut = etendue / Math.max(1, n);
  var p = Math.pow(10, Math.floor(Math.log10(brut)));
  var r = brut / p;
  return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * p;
}

// Bornes rondes d'un axe automatique, avec une étendue minimale
function _tfgBornes(lo, hi, span, n) {
  if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
  if (hi - lo < span) { var c = (lo + hi) / 2; lo = c - span / 2; hi = c + span / 2; }
  var marge = (hi - lo) * 0.06;
  lo -= marge; hi += marge;
  var pas = _tfgPas(hi - lo, n);
  return { lo: Math.floor(lo / pas) * pas, hi: Math.ceil(hi / pas) * pas };
}

// Nombre au format français, avec les décimales qu'appelle le pas
function _tfgNb(v, pas) {
  if (Math.abs(v) < pas * 1e-6) v = 0;
  var d = Math.max(0, Math.ceil(-Math.log10(pas) - 1e-9));
  return v.toFixed(Math.min(d, 6)).replace('.', ',').replace('-', '−');
}

// Valeur lue au réticule : trois chiffres significatifs au moins
function _tfgNbLu(v) {
  var a = Math.abs(v);
  var d = a >= 100 ? 1 : a >= 10 ? 2 : 3;
  return v.toFixed(d).replace('.', ',').replace('-', '−');
}

// Graduations comprises dans [lo, hi]
function _tfgGraduations(lo, hi, pas) {
  var g = [];
  for (var v = Math.ceil(lo / pas - 1e-9) * pas; v <= hi + pas * 1e-9; v += pas) g.push(v);
  return g;
}

// Hachures d'une bande « non définie », dans la teinte de la grandeur
function _tfgHachure(o, coul) {
  o.hachures = o.hachures || {};
  if (o.hachures[coul]) return o.hachures[coul];
  var m = document.createElement('canvas');
  m.width = m.height = 8;
  var c = m.getContext('2d');
  c.fillStyle = coul;
  c.globalAlpha = 0.10;
  c.fillRect(0, 0, 8, 8);
  c.globalAlpha = 0.55;
  c.strokeStyle = coul;
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(-2, 10); c.lineTo(10, -2);
  c.moveTo(-2, 2);  c.lineTo(2, -2);
  c.moveTo(6, 10);  c.lineTo(10, 6);
  c.stroke();
  return (o.hachures[coul] = o.ctx.createPattern(m, 'repeat'));
}

// Indice du premier échantillon de date ≥ t
function _tfgIndice(e, t) {
  var a = 0, b = e.length;
  while (a < b) { var m = (a + b) >> 1; if (e[m].t < t) a = m + 1; else b = m; }
  return a;
}

function _tfgPolice(fs, gras) {
  return (gras ? '600 ' : '') + fs + "px 'Segoe UI', Arial, sans-serif";
}

// Étiquette sur fond clair (lisible par-dessus les courbes)
function _tfgEtiquette(c, txt, x, y, fs, coul, align) {
  c.font = _tfgPolice(fs, false);
  var w = c.measureText(txt).width;
  var x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  c.fillStyle = 'rgba(255,253,249,0.85)';
  c.fillRect(x0 - 3, y - fs * 0.62, w + 6, fs * 1.24);
  c.fillStyle = coul;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText(txt, x0, y);
}

// Bulle du réticule : lignes de texte près du curseur, dans le canvas
function _tfgBulle(c, lignes, x, y, W, H, fs) {
  c.font = _tfgPolice(fs, false);
  var w = 0;
  for (var i = 0; i < lignes.length; i++) w = Math.max(w, c.measureText(lignes[i]).width);
  var lh = fs * 1.3, bw = w + 12, bh = lignes.length * lh + 8;
  var bx = x + 12, by = y - bh - 8;
  if (bx + bw > W - 2) bx = x - 12 - bw;
  if (by < 2) by = y + 12;
  if (by + bh > H - 2) by = H - 2 - bh;
  c.fillStyle = 'rgba(44,62,80,0.92)';
  c.beginPath();
  if (c.roundRect) c.roundRect(bx, by, bw, bh, 4); else c.rect(bx, by, bw, bh);
  c.fill();
  c.fillStyle = '#fff';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  for (i = 0; i < lignes.length; i++) c.fillText(lignes[i], bx + 6, by + 4 + lh * (i + 0.5));
}

function _tfgDef(s, ser) { return !ser.def || s[ser.def]; }

// Repère en pointillé d'une grandeur temporelle : T_ext quand le fond
// échange de la chaleur ; P_ext piston libre ; pression mesurée par
// le vérin piston tenu, si l'option est cochée
function _tfgRepere(ser) {
  if (ser.m === 'Tm') return tf.G > 0 ? { cle: 'Text', nom: 'T_ext' } : null;
  if (ser.m === 'Pm') {
    if (!tf.tenu) return { cle: 'Pp', nom: 'P_ext' };
    return tfGraphAff.piston ? { cle: 'Pp', nom: 'sur le piston' } : null;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════
//  Graphes temporels : T(t), P(t), V(t)
// ══════════════════════════════════════════════════════════════════════

function _tfgDessinerTemps() {
  var o = tfGraph.cv.t;
  _tfgTaille(o);
  if (!o.w) return;
  var c = o.ctx, W = o.w, H = o.h, e = tfGraph.ech;
  c.fillStyle = '#fdf8f0';
  c.fillRect(0, 0, W, H);

  var fs = Math.max(10, Math.min(14, Math.round(Math.min(H * 0.042, W * 0.03))));
  var ML = Math.round(fs * 4.4), MR = 10, MT = 4, MB = Math.round(fs * 2.9);
  var GAP = Math.round(fs * 0.6);
  var pw = W - ML - MR, bh = (H - MT - MB - 2 * GAP) / 3;
  if (pw < 40 || bh < 18 || e.length === 0) { tfGraph.geoT = null; return; }

  var t1, t2;
  if (tfGraph.vueT) { t1 = tfGraph.vueT.t1; t2 = tfGraph.vueT.t2; }
  else { var fen = _tfgFenetre(); t2 = Math.max(tf.t, fen); t1 = t2 - fen; }
  var i1 = Math.max(0, _tfgIndice(e, t1) - 1);
  var i2 = Math.min(e.length - 1, _tfgIndice(e, t2));
  var xDe = function (t) { return ML + (t - t1) / (t2 - t1) * pw; };

  var unite = (t2 - t1) < 1 ? 1000 : 1;
  var pasT = _tfgPas((t2 - t1) * unite, Math.max(2, Math.floor(pw / (fs * 5.5))));
  var gradT = _tfgGraduations(t1 * unite, t2 * unite, pasT);

  var geo = { x0: ML, pw: pw, t1: t1, t2: t2, boites: [] };
  for (var b = 0; b < 3; b++) {
    var y0 = MT + b * (bh + GAP);
    geo.boites.push(_tfgBoite(o, TF_G_SERIES[b], ML, y0, pw, bh, i1, i2, xDe, gradT, unite, fs));
  }
  tfGraph.geoT = geo;

  // Axe des temps, sous la dernière case
  var yAxe = MT + 3 * bh + 2 * GAP;
  c.fillStyle = TF_G_ENCRE;
  c.font = _tfgPolice(fs, false);
  c.textAlign = 'center';
  c.textBaseline = 'top';
  for (var k = 0; k < gradT.length; k++) {
    c.fillText(_tfgNb(gradT[k], pasT), ML + (gradT[k] / unite - t1) / (t2 - t1) * pw, yAxe + 3);
  }
  c.textAlign = 'right';
  c.font = _tfgPolice(fs, true);
  c.fillText(unite === 1000 ? 't (ms)' : 't (s)', ML + pw, yAxe + fs * 1.45);
  if (tfGraph.vueT) {
    c.textAlign = 'left';
    c.font = _tfgPolice(fs, false);
    c.fillStyle = TF_G_MUET;
    c.fillText('vue figée (« Suivre » pour revenir)', ML, yAxe + fs * 1.45);
  }

  // Zoom en cours : bande sur toute la hauteur
  var gl = tfGraph.glisse;
  if (gl && gl.cible === 't') {
    c.fillStyle = 'rgba(42,106,170,0.12)';
    c.strokeStyle = '#2a6aaa';
    c.lineWidth = 1;
    var xa = Math.min(gl.x0, gl.x1), xb = Math.max(gl.x0, gl.x1);
    c.fillRect(xa, MT, xb - xa, yAxe - MT);
    c.strokeRect(xa + 0.5, MT + 0.5, xb - xa, yAxe - MT);
  }

  // Réticule : temps et valeurs au point le plus proche
  var so = tfGraph.souris;
  if (tfGraph.reticule && so && so.cible === 't' && so.x >= ML && so.x <= ML + pw && !gl) {
    var t = t1 + (so.x - ML) / pw * (t2 - t1);
    var j = Math.min(e.length - 1, Math.max(0, _tfgIndice(e, t)));
    if (j > 0 && Math.abs(e[j - 1].t - t) < Math.abs(e[j].t - t)) j--;
    var s = e[j];
    c.strokeStyle = '#2a6aaa';
    c.lineWidth = 1;
    c.setLineDash([4, 3]);
    c.beginPath();
    c.moveTo(so.x, MT);
    c.lineTo(so.x, yAxe);
    c.stroke();
    c.setLineDash([]);
    var lignes = ['t = ' + _tfgNbLu(s.t * unite) + (unite === 1000 ? ' ms' : ' s')];
    for (b = 0; b < 3; b++) {
      var ser = TF_G_SERIES[b], nom = ser.titre.split(' ')[0];
      var uni = ser.titre.replace(/^.*\((.*)\)$/, '$1');
      lignes.push(_tfgDef(s, ser)
        ? nom + ' = ' + _tfgNbLu(s[ser.m] * ser.f) + ' ' + uni
        : nom + ' non définie (' + _tfgNbLu(s[ser.min] * ser.f) + ' à '
          + _tfgNbLu(s[ser.max] * ser.f) + ' ' + uni + ')');
    }
    _tfgBulle(c, lignes, so.x, so.y, W, H, fs);
  }
}

// Une case : courbe pleine quand la grandeur est définie ; hors équilibre,
// bande hachurée entre les extrêmes des tranches (la moyenne n'est pas
// tracée : ce serait lui prêter un sens)
function _tfgBoite(o, ser, x0, y0, w, h, i1, i2, xDe, gradT, unite, fs) {
  var c = o.ctx, e = tfGraph.ech;
  var rep = _tfgRepere(ser);

  var lo = Infinity, hi = -Infinity, nd = false, k, s, v;
  for (k = i1; k <= i2; k++) {
    s = e[k];
    if (_tfgDef(s, ser)) {
      v = s[ser.m] * ser.f;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    } else {
      nd = true;
      if (s[ser.min] * ser.f < lo) lo = s[ser.min] * ser.f;
      if (s[ser.max] * ser.f > hi) hi = s[ser.max] * ser.f;
    }
    if (rep) {
      v = s[rep.cle] * ser.f;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  // Les données laissent en haut une bande au titre de la case
  var hD = h - fs * 1.5;
  var nY = Math.max(2, Math.floor(hD / (fs * 1.8)));
  var bo = _tfgBornes(lo, hi, ser.span, nY);
  var pasY = _tfgPas(bo.hi - bo.lo, nY);
  var yDe = function (val) { return y0 + h - (val - bo.lo) / (bo.hi - bo.lo) * hD; };

  // Fond, grille, graduations
  c.fillStyle = TF_G_FOND;
  c.fillRect(x0, y0, w, h);
  c.strokeStyle = TF_G_GRILLE;
  c.lineWidth = 1;
  c.beginPath();
  var gy = _tfgGraduations(bo.lo, bo.hi, pasY);
  for (k = 0; k < gy.length; k++) {
    var yy = Math.round(yDe(gy[k])) + 0.5;
    c.moveTo(x0, yy); c.lineTo(x0 + w, yy);
  }
  for (k = 0; k < gradT.length; k++) {
    var xx = Math.round(xDe(gradT[k] / unite)) + 0.5;
    c.moveTo(xx, y0); c.lineTo(xx, y0 + h);
  }
  c.stroke();
  c.fillStyle = TF_G_ENCRE;
  c.font = _tfgPolice(fs, false);
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  for (k = 0; k < gy.length; k++) {
    var yt = yDe(gy[k]);
    if (yt > y0 + fs * 1.6 && yt < y0 + h - fs * 0.45) {
      c.fillText(_tfgNb(gy[k], pasY), x0 - 4, yt);
    }
  }

  c.save();
  c.beginPath();
  c.rect(x0, y0, w, h);
  c.clip();

  // Repère en pointillé
  if (rep) {
    c.strokeStyle = TF_G_MUET;
    c.lineWidth = 1.5;
    c.setLineDash([5, 4]);
    c.beginPath();
    for (k = i1; k <= i2; k++) {
      var px = xDe(e[k].t), py = yDe(e[k][rep.cle] * ser.f);
      if (k === i1) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.stroke();
    c.setLineDash([]);
  }

  // Tronçons définis / non définis
  k = i1;
  while (k <= i2) {
    var def = _tfgDef(e[k], ser), j = k, q;
    while (j < i2 && _tfgDef(e[j + 1], ser) === def) j++;
    if (def) {
      c.strokeStyle = ser.coul;
      c.lineWidth = 2;
      c.lineJoin = 'round';
      c.beginPath();
      for (q = k; q <= j; q++) {
        if (q === k) c.moveTo(xDe(e[q].t), yDe(e[q][ser.m] * ser.f));
        else c.lineTo(xDe(e[q].t), yDe(e[q][ser.m] * ser.f));
      }
      if (j === k) c.lineTo(xDe(e[k].t) + 1, yDe(e[k][ser.m] * ser.f));
      c.stroke();
    } else {
      // La bande déborde d'un échantillon de chaque côté pour se raccorder
      // aux tronçons définis voisins
      var a = Math.max(i1, k - 1), z = Math.min(i2, j + 1);
      c.beginPath();
      for (q = a; q <= z; q++) {
        if (q === a) c.moveTo(xDe(e[q].t), yDe(e[q][ser.max] * ser.f));
        else c.lineTo(xDe(e[q].t), yDe(e[q][ser.max] * ser.f));
      }
      for (q = z; q >= a; q--) c.lineTo(xDe(e[q].t), yDe(e[q][ser.min] * ser.f));
      c.closePath();
      c.fillStyle = _tfgHachure(o, ser.coul);
      c.fill();
      c.strokeStyle = ser.coul;
      c.globalAlpha = 0.7;
      c.lineWidth = 1;
      c.stroke();
      c.globalAlpha = 1;
    }
    k = j + 1;
  }
  c.restore();

  c.strokeStyle = TF_G_CADRE;
  c.lineWidth = 1;
  c.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);

  // Titre, mention « non définie », nom du repère
  c.font = _tfgPolice(fs, true);
  var tw = c.measureText(ser.titre).width;
  c.fillStyle = 'rgba(255,253,249,0.85)';
  c.fillRect(x0 + 2, y0 + 2, tw + 8, fs * 1.3);
  c.fillStyle = ser.coul;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText(ser.titre, x0 + 6, y0 + 2 + fs * 0.65);
  if (nd) _tfgEtiquette(c, 'hachures : non définie (étendue des tranches)',
                        x0 + w - 6, y0 + 2 + fs * 0.65, fs - 1, TF_G_ND, 'right');
  if (rep && i2 >= i1) {
    var yr = yDe(e[i2][rep.cle] * ser.f);
    _tfgEtiquette(c, rep.nom, x0 + w - 6, Math.max(y0 + fs * 2, Math.min(y0 + h - fs, yr - fs * 0.8)),
                  fs - 1, TF_G_MUET, 'right');
  }

  return { y0: y0, h: h };
}

// ══════════════════════════════════════════════════════════════════════
//  Diagramme de Clapeyron
// ══════════════════════════════════════════════════════════════════════

function _tfgSDef(s) { return s.Pdef && s.Tdef; }

// Cadrage automatique : chemin défini, état de départ, nuage depuis le
// départ, pression sur le piston si elle est tracée
function _tfgCadragePV() {
  var e = tfGraph.ech, g = tfGraph;
  var V1 = Infinity, V2 = -Infinity, P1 = Infinity, P2 = -Infinity;
  function ajoute(V, P) {
    if (V < V1) V1 = V;
    if (V > V2) V2 = V;
    if (P < P1) P1 = P;
    if (P > P2) P2 = P;
  }
  for (var k = 0; k < e.length; k++) {
    var s = e[k];
    if (_tfgSDef(s)) ajoute(s.V * 1e3, s.Pm * 1e-3);
    if (tfGraphAff.piston) ajoute(s.V * 1e3, s.Pp * 1e-3);
  }
  if (g.ref) ajoute(g.ref.V * 1e3, g.ref.Pm * 1e-3);
  if (tfGraphAff.nuage && g.env) { ajoute(g.env.V1, g.env.P1); ajoute(g.env.V2, g.env.P2); }
  return { V1: V1, V2: V2, P1: P1, P2: P2 };
}

function _tfgDessinerPV() {
  var o = tfGraph.cv.pv;
  _tfgTaille(o);
  if (!o.w) return;
  var c = o.ctx, W = o.w, H = o.h, e = tfGraph.ech, g = tfGraph;
  c.fillStyle = '#fdf8f0';
  c.fillRect(0, 0, W, H);

  var fs = Math.max(10, Math.min(14, Math.round(Math.min(H * 0.045, W * 0.03))));
  var ML = Math.round(fs * 4.4), MR = 12, MT = Math.round(fs * 0.7), MB = Math.round(fs * 2.9);
  var pw = W - ML - MR, ph = H - MT - MB;
  if (pw < 60 || ph < 40 || e.length === 0) { g.geoPV = null; return; }

  var nX = Math.max(2, Math.floor(pw / (fs * 6))), nY = Math.max(2, Math.floor(ph / (fs * 2.6)));
  var vue = g.vuePV;
  if (!vue) {
    var cad = _tfgCadragePV();
    var bx = _tfgBornes(cad.V1, cad.V2, 0.05, nX), by = _tfgBornes(cad.P1, cad.P2, 5, nY);
    vue = { V1: bx.lo, V2: bx.hi, P1: by.lo, P2: by.hi };
  }
  var pasV = _tfgPas(vue.V2 - vue.V1, nX), pasP = _tfgPas(vue.P2 - vue.P1, nY);
  var xDe = function (V) { return ML + (V - vue.V1) / (vue.V2 - vue.V1) * pw; };
  var yDe = function (P) { return MT + ph - (P - vue.P1) / (vue.P2 - vue.P1) * ph; };
  g.geoPV = { x0: ML, y0: MT, pw: pw, ph: ph, V1: vue.V1, V2: vue.V2, P1: vue.P1, P2: vue.P2 };

  // Fond, grille, graduations, titres d'axes
  c.fillStyle = TF_G_FOND;
  c.fillRect(ML, MT, pw, ph);
  var gx = _tfgGraduations(vue.V1, vue.V2, pasV), gy = _tfgGraduations(vue.P1, vue.P2, pasP), k;
  c.strokeStyle = TF_G_GRILLE;
  c.lineWidth = 1;
  c.beginPath();
  for (k = 0; k < gx.length; k++) { var xx = Math.round(xDe(gx[k])) + 0.5; c.moveTo(xx, MT); c.lineTo(xx, MT + ph); }
  for (k = 0; k < gy.length; k++) { var yy = Math.round(yDe(gy[k])) + 0.5; c.moveTo(ML, yy); c.lineTo(ML + pw, yy); }
  c.stroke();
  c.fillStyle = TF_G_ENCRE;
  c.font = _tfgPolice(fs, false);
  c.textAlign = 'center';
  c.textBaseline = 'top';
  for (k = 0; k < gx.length; k++) c.fillText(_tfgNb(gx[k], pasV), xDe(gx[k]), MT + ph + 3);
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  for (k = 0; k < gy.length; k++) c.fillText(_tfgNb(gy[k], pasP), ML - 4, yDe(gy[k]));
  c.font = _tfgPolice(fs, true);
  c.textBaseline = 'top';
  c.fillText('V (L)', ML + pw, MT + ph + fs * 1.45);
  c.save();
  c.translate(fs * 0.2, MT);
  c.rotate(-Math.PI / 2);
  c.textAlign = 'right';
  c.textBaseline = 'top';
  c.fillText('P (kPa)', 0, 0);
  c.restore();

  c.save();
  c.beginPath();
  c.rect(ML, MT, pw, ph);
  c.clip();

  // Courbes théoriques par l'état de départ de la transformation en cours
  var ref = g.ref, etiq = [];
  if (ref && (tfGraphAff.isotherme || tfGraphAff.adiabatique)) {
    var Vr = ref.V * 1e3, Pr = ref.Pm * 1e-3;
    if (tfGraphAff.isotherme)   etiq.push(_tfgCourbe(c, xDe, yDe, vue, function (V) { return Pr * Vr / V; },
                                                     TF_G_ISOT, 'isotherme'));
    if (tfGraphAff.adiabatique) etiq.push(_tfgCourbe(c, xDe, yDe, vue, function (V) { return Pr * Math.pow(Vr / V, tf.gamma); },
                                                     TF_G_ADIA, 'adiabatique réversible'));
  }

  // Pression exercée par le piston : l'aire sous ce tracé est le travail
  // reçu par le gaz, juste même hors équilibre
  if (tfGraphAff.piston) {
    c.strokeStyle = TF_G_PISTON;
    c.lineWidth = 1.5;
    c.setLineDash([6, 4]);
    c.beginPath();
    for (k = 0; k < e.length; k++) {
      if (k === 0) c.moveTo(xDe(e[k].V * 1e3), yDe(e[k].Pp * 1e-3));
      else c.lineTo(xDe(e[k].V * 1e3), yDe(e[k].Pp * 1e-3));
    }
    c.stroke();
    c.setLineDash([]);
  }

  // Chemin : plein tant que le gaz a un état ; d'un tronçon défini au
  // suivant, pointillé gris « chemin non défini »
  var sans = [], prec = null;
  c.strokeStyle = TF_G_CHEMIN;
  c.lineWidth = 2;
  c.lineJoin = 'round';
  k = 0;
  while (k < e.length) {
    var j = k;
    if (!_tfgSDef(e[k])) {
      while (j + 1 < e.length && !_tfgSDef(e[j + 1])) j++;
      k = j + 1;
      continue;
    }
    while (j + 1 < e.length && _tfgSDef(e[j + 1])) j++;
    if (prec) sans.push([prec, e[k]]);
    c.beginPath();
    c.moveTo(xDe(e[k].V * 1e3), yDe(e[k].Pm * 1e-3));
    for (var q = k + 1; q <= j; q++) c.lineTo(xDe(e[q].V * 1e3), yDe(e[q].Pm * 1e-3));
    c.stroke();
    prec = e[j];
    k = j + 1;
  }
  c.strokeStyle = '#9aa4ac';
  c.lineWidth = 1.5;
  c.setLineDash([3, 4]);
  for (k = 0; k < sans.length; k++) {
    c.beginPath();
    c.moveTo(xDe(sans[k][0].V * 1e3), yDe(sans[k][0].Pm * 1e-3));
    c.lineTo(xDe(sans[k][1].V * 1e3), yDe(sans[k][1].Pm * 1e-3));
    c.stroke();
  }
  c.setLineDash([]);

  // États d'équilibre : fin de chaque séjour à l'équilibre. Son début n'est
  // pas fiable : un échantillon pris à l'extrémité d'une oscillation du
  // piston (vitesse nulle, écart de pression sous le seuil) passe le critère
  // avant le retour au repos. Une marche d'escalier clôt le séjour
  // (échantillon `marche`), même si le gaz n'a pas été vu hors équilibre
  // ensuite : un point par marche.
  var etats = [];
  k = 0;
  while (k < e.length) {
    if (!e[k].eq) { k++; continue; }
    var f = k;
    while (f + 1 < e.length && e[f + 1].eq && !e[f].marche) f++;
    etats.push(e[f]);
    k = f + 1;
  }
  for (k = 0; k < etats.length; k++) {
    c.beginPath();
    c.arc(xDe(etats[k].V * 1e3), yDe(etats[k].Pm * 1e-3), 4.5, 0, 2 * Math.PI);
    c.fillStyle = TF_G_CHEMIN;
    c.fill();
    c.strokeStyle = TF_G_FOND;
    c.lineWidth = 1.5;
    c.stroke();
  }

  // Nuage des tranches, coloré selon T comme les molécules
  if (tfGraphAff.nuage) {
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(255,253,249,0.9)';
    _tfgNuage(function (V, P, T) {
      c.beginPath();
      c.arc(xDe(V), yDe(P), 3, 0, 2 * Math.PI);
      c.fillStyle = tfAff.couleurT ? _tfMelangeT(T, TF_COUL_MOL, 1) : '#4a627c';
      c.fill();
      c.stroke();
    });
  }

  // État actuel, s'il est défini
  var mes = tfMesures();
  if (mes.Pdef && mes.Tdef) {
    c.beginPath();
    c.arc(xDe(mes.V * 1e3), yDe(mes.Pmoy * 1e-3), 7, 0, 2 * Math.PI);
    c.strokeStyle = TF_G_ENCRE;
    c.lineWidth = 2;
    c.stroke();
  }
  c.restore();

  c.strokeStyle = TF_G_CADRE;
  c.lineWidth = 1;
  c.strokeRect(ML + 0.5, MT + 0.5, pw - 1, ph - 1);

  // Étiquettes directes
  for (k = 0; k < etiq.length; k++) {
    if (!etiq[k]) continue;
    var ye = etiq[k].y + (k === 0 ? -fs * 0.8 : fs * 0.8);
    ye = Math.max(MT + fs * 0.8, Math.min(MT + ph - fs * 0.8, ye));
    _tfgEtiquette(c, etiq[k].nom, etiq[k].x, ye, fs - 1, etiq[k].coul, 'right');
  }
  for (k = 0; k < sans.length; k++) {
    var xa = xDe(sans[k][0].V * 1e3), ya = yDe(sans[k][0].Pm * 1e-3);
    var xb = xDe(sans[k][1].V * 1e3), yb = yDe(sans[k][1].Pm * 1e-3);
    if (Math.hypot(xb - xa, yb - ya) > fs * 9) {
      _tfgEtiquette(c, 'chemin non défini', (xa + xb) / 2, (ya + yb) / 2, fs - 1, TF_G_MUET, 'center');
    }
  }
  if (!(mes.Pdef && mes.Tdef)) {
    _tfgEtiquette(c, 'État du gaz non défini', ML + 8, MT + ph - fs, fs, TF_G_ND, 'left');
  }
  _tfgLegendePV(c, ML + pw - 6, MT + 6, fs - 1, sans.length > 0);

  // Zoom en cours
  var gl = g.glisse;
  if (gl && gl.cible === 'pv') {
    c.fillStyle = 'rgba(42,106,170,0.12)';
    c.strokeStyle = '#2a6aaa';
    c.lineWidth = 1;
    c.fillRect(Math.min(gl.x0, gl.x1), Math.min(gl.y0, gl.y1), Math.abs(gl.x1 - gl.x0), Math.abs(gl.y1 - gl.y0));
    c.strokeRect(Math.min(gl.x0, gl.x1) + 0.5, Math.min(gl.y0, gl.y1) + 0.5,
                 Math.abs(gl.x1 - gl.x0), Math.abs(gl.y1 - gl.y0));
  }

  // Réticule
  var so = g.souris;
  if (g.reticule && so && so.cible === 'pv' && !gl
      && so.x >= ML && so.x <= ML + pw && so.y >= MT && so.y <= MT + ph) {
    c.strokeStyle = '#2a6aaa';
    c.lineWidth = 1;
    c.setLineDash([4, 3]);
    c.beginPath();
    c.moveTo(so.x, MT); c.lineTo(so.x, MT + ph);
    c.moveTo(ML, so.y); c.lineTo(ML + pw, so.y);
    c.stroke();
    c.setLineDash([]);
    var V = vue.V1 + (so.x - ML) / pw * (vue.V2 - vue.V1);
    var P = vue.P1 + (MT + ph - so.y) / ph * (vue.P2 - vue.P1);
    _tfgBulle(c, ['V = ' + _tfgNbLu(V) + ' L', 'P = ' + _tfgNbLu(P) + ' kPa'], so.x, so.y, W, H, fs);
  }
}

// Trace P(V) sur la largeur de la vue ; renvoie où poser son étiquette (le
// point visible le plus à droite)
function _tfgCourbe(c, xDe, yDe, vue, Pde, coul, nom) {
  var n = 160, dern = null;
  c.strokeStyle = coul;
  c.lineWidth = 1.5;
  c.beginPath();
  for (var i = 0; i <= n; i++) {
    var V = vue.V1 + (vue.V2 - vue.V1) * i / n, P = Pde(V);
    var x = xDe(V), y = yDe(P);
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    if (P >= vue.P1 && P <= vue.P2 && i < n * 0.97) dern = { x: x, y: y };
  }
  c.stroke();
  return dern ? { x: dern.x, y: dern.y, nom: nom, coul: coul } : null;
}

// Légende en haut à droite (zone vide pour les transformations usuelles,
// où P décroît quand V croît)
function _tfgLegendePV(c, xd, y, fs, avecSans) {
  var items = [{ type: 'ligne', coul: TF_G_CHEMIN, nom: 'gaz à l’état défini' },
               { type: 'point', coul: TF_G_CHEMIN, nom: 'état d’équilibre' }];
  if (avecSans) items.push({ type: 'tirets', coul: '#9aa4ac', nom: 'chemin non défini' });
  if (tfGraphAff.nuage) items.push({ type: 'nuage', nom: 'tranches (N·V_tranche, P_tranche)' });
  if (tfGraphAff.piston) items.push({ type: 'tirets', coul: TF_G_PISTON, nom: 'pression sur le piston' });

  c.font = _tfgPolice(fs, false);
  var w = 0;
  for (var i = 0; i < items.length; i++) w = Math.max(w, c.measureText(items[i].nom).width);
  var lh = fs * 1.35, sw = fs * 1.8, bw = w + sw + 14, bh = items.length * lh + 6;
  var x0 = xd - bw;
  c.fillStyle = 'rgba(255,253,249,0.9)';
  c.fillRect(x0, y, bw, bh);
  c.strokeStyle = TF_G_GRILLE;
  c.lineWidth = 1;
  c.strokeRect(x0 + 0.5, y + 0.5, bw - 1, bh - 1);
  for (i = 0; i < items.length; i++) {
    var it = items[i], yc = y + 3 + lh * (i + 0.5), xs = x0 + 5;
    if (it.type === 'point') {
      c.beginPath();
      c.arc(xs + sw / 2, yc, 4, 0, 2 * Math.PI);
      c.fillStyle = it.coul;
      c.fill();
    } else if (it.type === 'nuage') {
      var cl = [[24, 88, 196], [74, 98, 124], [200, 52, 28]];
      for (var p = 0; p < 3; p++) {
        c.beginPath();
        c.arc(xs + sw * (0.2 + 0.3 * p), yc, 2.6, 0, 2 * Math.PI);
        c.fillStyle = 'rgb(' + cl[p].join(',') + ')';
        c.fill();
      }
    } else {
      c.strokeStyle = it.coul;
      c.lineWidth = it.type === 'ligne' ? 2 : 1.5;
      if (it.type === 'tirets') c.setLineDash([4, 3]);
      c.beginPath();
      c.moveTo(xs, yc); c.lineTo(xs + sw, yc);
      c.stroke();
      c.setLineDash([]);
    }
    c.fillStyle = TF_G_ENCRE;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(it.nom, xs + sw + 5, yc);
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Rendu (appelé par la boucle de tf-ui.js)
// ══════════════════════════════════════════════════════════════════════

function tfGraphDessiner() {
  if (!tfGraph.cv || !tfGraph.sale) return;
  tfGraph.sale = false;
  _tfgDessinerPV();
  _tfgDessinerTemps();
}

// ══════════════════════════════════════════════════════════════════════
//  Outils : vue précédente, suivre, tout voir, cadrage automatique, réticule
// ══════════════════════════════════════════════════════════════════════

function tfGraphPrecedente(cible) {
  var g = tfGraph;
  if (cible === 'pv') g.vuePV = g.pilePV.length ? g.pilePV.pop() : null;
  else                g.vueT  = g.pileT.length  ? g.pileT.pop()  : null;
  g.sale = true;
}

function tfGraphSuivre() {
  tfGraph.vueT = null;
  tfGraph.pileT = [];
  tfGraph.sale = true;
}

function tfGraphToutVoir() {
  var g = tfGraph, e = g.ech;
  if (e.length < 2) return;
  g.pileT.push(g.vueT);
  g.vueT = { t1: e[0].t, t2: Math.max(e[e.length - 1].t, e[0].t + 1e-4) };
  g.sale = true;
}

function tfGraphAutoPV() {
  tfGraph.vuePV = null;
  tfGraph.pilePV = [];
  tfGraph.sale = true;
}

function tfGraphReticule() {
  tfGraph.reticule = !tfGraph.reticule;
  var b = document.querySelectorAll('.tf-btn-reticule');
  for (var i = 0; i < b.length; i++) b[i].classList.toggle('active', tfGraph.reticule);
  tfGraph.sale = true;
}

function tfOnAffGraphe(cle, coche) {
  tfGraphAff[cle] = coche;
  tfGraph.sale = true;
}

// ── Souris : zoom rectangle (glisser), réticule ──
function _tfgPos(o, ev) {
  var r = o.c.getBoundingClientRect();
  return { x: (ev.clientX - r.left) * o.w / r.width, y: (ev.clientY - r.top) * o.h / r.height };
}

function _tfgSouris(o, cible) {
  var g = tfGraph;
  o.c.addEventListener('pointerdown', function (ev) {
    var geo = cible === 'pv' ? g.geoPV : g.geoT;
    if (!geo) return;
    var p = _tfgPos(o, ev);
    if (p.x < geo.x0 || p.x > geo.x0 + geo.pw) return;
    g.glisse = { cible: cible, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    try { o.c.setPointerCapture(ev.pointerId); } catch (x) { /* pointeur déjà relâché */ }
    ev.preventDefault();
  });
  o.c.addEventListener('pointermove', function (ev) {
    var p = _tfgPos(o, ev);
    g.souris = { cible: cible, x: p.x, y: p.y };
    if (g.glisse && g.glisse.cible === cible) { g.glisse.x1 = p.x; g.glisse.y1 = p.y; }
    if (g.reticule || g.glisse) g.sale = true;
  });
  o.c.addEventListener('pointerup', function () {
    var gl = g.glisse;
    g.glisse = null;
    g.sale = true;
    if (!gl || gl.cible !== cible) return;
    var dx = Math.abs(gl.x1 - gl.x0), dy = Math.abs(gl.y1 - gl.y0);
    if (cible === 't') {
      var gt = g.geoT;
      if (!gt || dx < 6) return;
      var tDe = function (x) { return gt.t1 + (x - gt.x0) / gt.pw * (gt.t2 - gt.t1); };
      g.pileT.push(g.vueT);
      g.vueT = { t1: tDe(Math.min(gl.x0, gl.x1)), t2: tDe(Math.max(gl.x0, gl.x1)) };
    } else {
      var gp = g.geoPV;
      if (!gp || dx < 6 || dy < 6) return;
      var VDe = function (x) { return gp.V1 + (x - gp.x0) / gp.pw * (gp.V2 - gp.V1); };
      var PDe = function (y) { return gp.P1 + (gp.y0 + gp.ph - y) / gp.ph * (gp.P2 - gp.P1); };
      g.pilePV.push(g.vuePV);
      g.vuePV = { V1: VDe(Math.min(gl.x0, gl.x1)), V2: VDe(Math.max(gl.x0, gl.x1)),
                  P1: PDe(Math.max(gl.y0, gl.y1)), P2: PDe(Math.min(gl.y0, gl.y1)) };
    }
  });
  o.c.addEventListener('pointerleave', function () {
    g.souris = null;
    g.sale = true;
  });
}

// ══════════════════════════════════════════════════════════════════════
//  Splitters de la colonne gauche
//  Les partages sont des pourcentages (variables CSS) : ils tiennent d'eux-
//  mêmes au redimensionnement, et la disposition étroite peut les ignorer.
// ══════════════════════════════════════════════════════════════════════

function _tfgSplitter(id, conteneur, cible, variable, axe, fMin, fMax) {
  var sp = document.getElementById(id);
  sp.addEventListener('pointerdown', function (ev) {
    ev.preventDefault();
    try { sp.setPointerCapture(ev.pointerId); } catch (x) { /* pointeur déjà relâché */ }
    sp.classList.add('dragging');
    var bouge = function (e2) {
      var r = conteneur.getBoundingClientRect();
      var f = axe === 'x' ? (e2.clientX - r.left) / r.width : (e2.clientY - r.top) / r.height;
      f = Math.max(fMin, Math.min(fMax, f));
      cible.style.setProperty(variable, (f * 100).toFixed(1) + '%');
    };
    var fin = function () {
      sp.classList.remove('dragging');
      sp.removeEventListener('pointermove', bouge);
      sp.removeEventListener('pointerup', fin);
      sp.removeEventListener('pointercancel', fin);
    };
    sp.addEventListener('pointermove', bouge);
    sp.addEventListener('pointerup', fin);
    sp.addEventListener('pointercancel', fin);
  });
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation (appelée par tfInit)
// ══════════════════════════════════════════════════════════════════════

function tfGraphInit() {
  function cv(id) {
    var c = document.getElementById(id);
    return { c: c, ctx: c.getContext('2d'), w: 0, h: 0, dpr: 0 };
  }
  tfGraph.cv = { pv: cv('tf-canvas-pv'), t: cv('tf-canvas-temps') };
  _tfgSouris(tfGraph.cv.pv, 'pv');
  _tfgSouris(tfGraph.cv.t, 't');

  var col = document.getElementById('tf-left-col');
  var gcol = document.getElementById('tf-graph-col');
  _tfgSplitter('tf-vsplit', col, col, '--tf-larg-graphes', 'x', 0.25, 0.7);
  _tfgSplitter('tf-hsplit', gcol, gcol, '--tf-haut-pv', 'y', 0.2, 0.7);

  // Toute zone qui change de taille (fenêtre, splitters, bascule d'onglet)
  // est redessinée ; la scène garde sa propre mise à l'échelle
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function () { tfGraph.sale = true; tfResize(); });
    ro.observe(tfGraph.cv.pv.c.parentElement);
    ro.observe(tfGraph.cv.t.c.parentElement);
    ro.observe(document.getElementById('tf-sim-area'));
  }
  window.addEventListener('resize', function () { tfGraph.sale = true; });

  for (var cle in tfGraphAff) {
    document.getElementById('tf-ckg-' + cle).checked = tfGraphAff[cle];
  }
  tf.echantillon = _tfgEchantillon;
  tfGraphEffacer();
}
