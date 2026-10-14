// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  prisme.js — Rendu canvas de l'onglet Prisme (dispersion de la lumière
//  blanche, salle noire, écran et loupe, zoom à la molette) et
//  interactions à la souris
//  Dépend de sim.js et dioptre.js (sizeCanvas, _clamp, _rectArrondi,
//  _distSegment). Appelle surChangementPrisme() défini dans ui.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

var cvPrisme = null;
var ctxPrisme = null;

// Nombre de longueurs d'onde suivies pour la lumière blanche (spectre
// continu), et pas entre deux rayons aussi tracés en trait (les autres ne
// servent qu'à remplir l'éventail coloré)
var PR_NB_LAMBDA = 121;
var PR_PAS_TRAIT = 10;

// Spectre « discret » : quelques couleurs seulement, du violet au rouge
var PR_DISCRET = [
  { l: 420, nom: 'Violet' },
  { l: 460, nom: 'Bleu' },
  { l: 520, nom: 'Vert' },
  { l: 580, nom: 'Jaune' },
  { l: 610, nom: 'Orange' },
  { l: 650, nom: 'Rouge' }
];

// Agrandissement de la loupe sur l'écran
var PR_ZOOM = 10;

// Zoom de la vue (molette) : écran = monde × z + o, en pixels CSS
// (au point d'entrée, l'éventail part d'un point : son ouverture ne change
// pas avec le zoom ; c'est à la sortie que le zoom montre la séparation)
var PR_ZOOM_MAX = 50;
var vuePR = { z: 1, ox: 0, oy: 0 };
var _tailleVue = { W: 0, H: 0 };   // taille du canvas lors du dernier rendu

// ══════════════════════════════════════════════════════════════════════
//  Couleur d'une longueur d'onde
// ══════════════════════════════════════════════════════════════════════

// Composantes (0 à 1) de la couleur perçue pour lambda (nm) — approximation
// usuelle par morceaux (D. Bruton), atténuée aux bords du visible.
function rgbLambda(l) {
  var r = 0, g = 0, b = 0;
  if (l < 440)      { r = (440 - l) / 60; b = 1; }
  else if (l < 490) { g = (l - 440) / 50; b = 1; }
  else if (l < 510) { g = 1; b = (510 - l) / 20; }
  else if (l < 580) { r = (l - 510) / 70; g = 1; }
  else if (l < 645) { r = 1; g = (645 - l) / 65; }
  else              { r = 1; }
  var f = l < 420 ? 0.3 + 0.7 * (l - 380) / 40
        : l > 700 ? 0.3 + 0.7 * (780 - l) / 80 : 1;
  function c(x) { return x > 0 ? Math.pow(x * f, 0.8) : 0; }
  return [c(r), c(g), c(b)];
}

// Même teinte, portée à la luminosité maximale
function rgbSature(l) {
  var c = rgbLambda(l);
  var k = 1 / Math.max(c[0], c[1], c[2], 1e-6);
  return [c[0] * k, c[1] * k, c[2] * k];
}

// Couleur CSS la plus lumineuse possible pour lambda (laser, pastille)
function couleurLambda(l, alpha) {
  var c = rgbSature(l);
  return 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' +
         Math.round(c[2] * 255) + ',' + (alpha === undefined ? 1 : alpha) + ')';
}

function _spectreDiscret() {
  return simPR.source === 'blanche' && affichagePR.spectre === 'discret';
}

// Longueurs d'onde suivies pour la source courante (ordre croissant)
function lambdasSource() {
  if (simPR.source === 'mono') return [simPR.lambda];
  if (affichagePR.spectre === 'discret') return PR_DISCRET.map(function (c) { return c.l; });
  var t = [];
  for (var k = 0; k < PR_NB_LAMBDA; k++) {
    t.push(LAMBDA_MIN + (LAMBDA_MAX - LAMBDA_MIN) * k / (PR_NB_LAMBDA - 1));
  }
  return t;
}

// Poids qui rendent blanche la somme de toutes les couleurs du spectre
// continu (« balance des blancs »), calculés une fois pour toutes
var _poidsBlanc = (function () {
  var s = [0, 0, 0];
  for (var k = 0; k < PR_NB_LAMBDA; k++) {
    var c = rgbLambda(LAMBDA_MIN + (LAMBDA_MAX - LAMBDA_MIN) * k / (PR_NB_LAMBDA - 1));
    s[0] += c[0]; s[1] += c[1]; s[2] += c[2];
  }
  return [1 / s[0], 1 / s[1], 1 / s[2]];
})();

// ══════════════════════════════════════════════════════════════════════
//  Mise en page (coordonnées « monde » = pixels de la vue d'ensemble)
// ══════════════════════════════════════════════════════════════════════
// De gauche à droite : source, prisme (centre de gravité G), écran
// vertical, puis la loupe, encart fixe qui montre l'écran agrandi.

function layoutPrisme(W, H) {
  var m = Math.min(W, H) / 2;
  var pad = _clamp(0.02 * W, 8, 20);
  var zw = _clamp(0.075 * W, 44, 90);              // largeur de la loupe
  var zx = W - pad - zw;
  var gap = _clamp(0.06 * W, 24, 70);              // écran ↔ loupe
  var xE = zx - gap;
  var wid = _clamp(0.075 * m, 14, 34);
  return {
    W: W, H: H, m: m, pad: pad,
    G:     { x: Math.max(pad + 1.08 * m, 0.40 * xE), y: 0.47 * H },
    ecran: { x: xE, y0: 0.05 * H, y1: 0.95 * H },
    loupe: { x: zx, y: 0.14 * H, w: zw, h: 0.74 * H },
    len: 0.25 * m,                                 // boîtier de la source
    wid: wid,
    rb:  Math.max(8, wid * 0.45),                  // poignée de rotation
    fs:  _clamp(0.05 * m, 11, 17),
    w:   _clamp(0.006 * m, 1.6, 3)                 // épaisseur d'un rayon
  };
}

// Passage monde → écran et écran → monde (zoom de la vue)
function _versEcran(p) { return { x: p.x * vuePR.z + vuePR.ox, y: p.y * vuePR.z + vuePR.oy }; }
function _versMonde(p) { return { x: (p.x - vuePR.ox) / vuePR.z, y: (p.y - vuePR.oy) / vuePR.z }; }

// Point d'émission de la source (monde)
function _sourcePx(L) {
  return { x: L.G.x + simPR.sx * L.m, y: L.G.y + simPR.sy * L.m };
}

// Source À L'ÉCRAN : elle garde sa taille quel que soit le zoom (c'est
// une icône), seul son point d'émission suit la vue.
// S : point d'émission, B : arrière du boîtier, K : centre de la poignée
function _geoSource(L) {
  var S = _versEcran(_sourcePx(L)), d = vDir(simPR.dir);
  var dk = L.len + L.rb * 1.6;
  return {
    S: S, d: d,
    B: { x: S.x - d.x * L.len, y: S.y - d.y * L.len },
    K: { x: S.x - d.x * dk,    y: S.y - d.y * dk }
  };
}

// ══════════════════════════════════════════════════════════════════════
//  Scène : tous les rayons (coordonnées monde)
// ══════════════════════════════════════════════════════════════════════

function scenePrisme(L) {
  var mat = milieuParId(simPR.milieu);
  var sommets = sommetsPrisme(L.G, PR_COTE * L.m, simPR.A, simPR.rot);
  var S = _sourcePx(L), d = vDir(simPR.dir);
  var loin = 2 * (L.W + L.H);
  var rayons = lambdasSource().map(function (l) {
    var tr = tracerRayon(S, d, indiceCauchy(mat, l), sommets, L.ecran, loin);
    tr.l = l;
    return tr;
  });
  // Rayon de référence (normales) : celui du laser, ou la raie jaune
  var ref = simPR.source === 'mono' ? rayons[0]
    : tracerRayon(S, d, indiceCauchy(mat, 589), sommets, L.ecran, loin);
  return { sommets: sommets, rayons: rayons, ref: ref };
}

// ══════════════════════════════════════════════════════════════════════
//  Rendu
// ══════════════════════════════════════════════════════════════════════

var _renduPrismeDemande = false;
function demanderRenduPrisme() {
  if (_renduPrismeDemande) return;
  _renduPrismeDemande = true;
  requestAnimationFrame(function () {
    _renduPrismeDemande = false;
    dessinerPrisme();
  });
}

function dessinerPrisme() {
  if (!cvPrisme || !cvPrisme.clientWidth) return;
  var W = cvPrisme.clientWidth, H = cvPrisme.clientHeight;
  var ctx = ctxPrisme;
  ctx.clearRect(0, 0, W, H);
  var L = layoutPrisme(W, H);
  // Canvas redimensionné : la scène est recalculée, on revient à la vue
  // d'ensemble plutôt que de garder un zoom décalé
  if (W !== _tailleVue.W || H !== _tailleVue.H) {
    _tailleVue = { W: W, H: H };
    vuePR.z = 1;
  }
  _bornerVue(W, H);
  var sc = scenePrisme(L);

  // Tout ce qui suit est dessiné en coordonnées écran : les épaisseurs de
  // trait et les textes ne grossissent pas avec le zoom. Aux forts zooms,
  // les coordonnées écran deviendraient énormes (millions de pixels) et le
  // canvas les tracerait mal : chaque segment est d'abord découpé à la
  // zone visible élargie (calcul en coordonnées monde, en double
  // précision), seule sa partie utile est convertie.
  var R = _rectVue(W, H);
  sc.rayons.forEach(function (r) {
    r.segs = [];
    for (var j = 0; j + 1 < r.pts.length; j++) r.segs.push(_decouper(r.pts[j], r.pts[j + 1], R));
  });

  _dessinerCorpsPrisme(ctx, sc.sommets, R, L);
  if (affichagePR.normales) _dessinerNormalesPR(ctx, sc.ref, sc.sommets, R, L);
  if (simPR.source === 'mono') _dessinerRayonMono(ctx, sc.rayons[0], L);
  else if (_spectreDiscret()) _dessinerSpectreDiscret(ctx, sc.rayons, L);
  else _dessinerLumiereBlanche(ctx, sc.rayons, L);
  _dessinerEcran(ctx, sc.rayons, L);
  if (_dansRect(_sourcePx(L), R)) _dessinerSource(ctx, L);
  _dessinerIndicZoom(ctx, L);
}

// Texte clair sur fond sombre
function _textePR(ctx, txt, x, y, fs, couleur, align, baseline) {
  ctx.font = '600 ' + fs + 'px sans-serif';
  ctx.textAlign = align || 'center';
  ctx.textBaseline = baseline || 'middle';
  ctx.fillStyle = couleur || '#c8ced6';
  ctx.fillText(txt, x, y);
}

// ── Découpage à la zone visible ───────────────────────────────────────

// Zone visible en coordonnées monde, élargie d'une largeur de vue de
// chaque côté : ce qui est découpé sur son bord reste hors de l'écran.
function _rectVue(W, H) {
  var z = vuePR.z, x0 = -vuePR.ox / z, y0 = -vuePR.oy / z, w = W / z, h = H / z;
  var mg = Math.max(w, h);
  return { x0: x0 - mg, y0: y0 - mg, x1: x0 + w + mg, y1: y0 + h + mg };
}

function _dansRect(p, R) {
  return p.x >= R.x0 && p.x <= R.x1 && p.y >= R.y0 && p.y <= R.y1;
}

// Partie du segment monde [A, B] dans le rectangle R (Liang-Barsky),
// convertie en coordonnées écran : { a, b }, ou null si elle est vide
function _decouper(A, B, R) {
  var dx = B.x - A.x, dy = B.y - A.y, t0 = 0, t1 = 1;
  var p = [-dx, dx, -dy, dy];
  var q = [A.x - R.x0, R.x1 - A.x, A.y - R.y0, R.y1 - A.y];
  for (var k = 0; k < 4; k++) {
    if (p[k] === 0) { if (q[k] < 0) return null; continue; }
    var t = q[k] / p[k];
    if (p[k] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
    else          { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return {
    a: _versEcran({ x: A.x + dx * t0, y: A.y + dy * t0 }),
    b: _versEcran({ x: A.x + dx * t1, y: A.y + dy * t1 })
  };
}

// Polygone monde découpé par le rectangle R (Sutherland-Hodgman)
function _decouperPolygone(pts, R) {
  var dedans = [
    function (p) { return p.x >= R.x0; }, function (p) { return p.x <= R.x1; },
    function (p) { return p.y >= R.y0; }, function (p) { return p.y <= R.y1; }
  ];
  var coupe = [
    function (a, b) { return (R.x0 - a.x) / (b.x - a.x); },
    function (a, b) { return (R.x1 - a.x) / (b.x - a.x); },
    function (a, b) { return (R.y0 - a.y) / (b.y - a.y); },
    function (a, b) { return (R.y1 - a.y) / (b.y - a.y); }
  ];
  for (var k = 0; k < 4 && pts.length; k++) {
    var res = [];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      var ia = dedans[k](a), ib = dedans[k](b);
      if (ia) res.push(a);
      if (ia !== ib) {
        var t = coupe[k](a, b);
        res.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    pts = res;
  }
  return pts;
}

// ── Prisme : verre translucide + angle au sommet (sm : sommets monde) ─
function _dessinerCorpsPrisme(ctx, sm, R, L) {
  var s = sm.map(_versEcran);
  var poly = _decouperPolygone(sm, R).map(_versEcran);
  ctx.save();
  if (poly.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (var k = 1; k < poly.length; k++) ctx.lineTo(poly[k].x, poly[k].y);
    ctx.closePath();
  }
  // Dégradé sur le polygone découpé (les sommets peuvent être très loin)
  var g0 = poly.length ? poly[0] : s[2], g1 = poly.length ? poly[poly.length - 1] : s[1];
  var g = ctx.createLinearGradient(g0.x, g0.y, g1.x + 1, g1.y);
  g.addColorStop(0, 'rgba(150, 190, 230, 0.16)');
  g.addColorStop(1, 'rgba(150, 190, 230, 0.08)');
  if (poly.length >= 3) {
    ctx.fillStyle = g;
    ctx.fill();
  }
  // Contour : chaque face découpée séparément
  ctx.strokeStyle = 'rgba(190, 215, 240, 0.75)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (var f = 0; f < 3; f++) {
    var c = _decouper(sm[f], sm[(f + 1) % 3], R);
    if (c) { ctx.moveTo(c.a.x, c.a.y); ctx.lineTo(c.b.x, c.b.y); }
  }
  ctx.stroke();

  // Sommet hors de vue : ni arc ni étiquette
  if (!_dansRect(sm[0], R)) { ctx.restore(); return; }

  // Arc de l'angle au sommet A et sa valeur, à l'extérieur du sommet
  var a1 = Math.atan2(s[1].y - s[0].y, s[1].x - s[0].x);
  var a2 = Math.atan2(s[2].y - s[0].y, s[2].x - s[0].x);
  ctx.beginPath();
  ctx.arc(s[0].x, s[0].y, 0.1 * L.m, a1, a2, false);
  ctx.strokeStyle = 'rgba(220, 226, 236, 0.8)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  var G = _versEcran(L.G), v = vNorm({ x: s[0].x - G.x, y: s[0].y - G.y });
  var dist = L.fs * 1.5;
  _textePR(ctx, 'A = ' + fmtFr(simPR.A, 0) + '°',
           s[0].x + v.x * dist, s[0].y + v.y * dist, L.fs, '#d8dde4');
  ctx.restore();
}

// ── Normales aux points où le rayon de référence rencontre une face ───
function _dessinerNormalesPR(ctx, ref, s, R, L) {
  var faces = ref.cle.replace(/[^0-9]/g, '');
  var demi = 0.16 * L.m;
  ctx.save();
  ctx.setLineDash([7, 6]);
  ctx.strokeStyle = 'rgba(200, 210, 222, 0.75)';
  ctx.lineWidth = 1.4;
  for (var j = 0; j < faces.length; j++) {
    if (!_dansRect(ref.pts[j + 1], R)) continue;
    var f = +faces[j], P = _versEcran(ref.pts[j + 1]);
    var a = s[f], b = s[(f + 1) % 3];
    var n = vNorm({ x: b.y - a.y, y: a.x - b.x });
    ctx.beginPath();
    ctx.moveTo(P.x - n.x * demi, P.y - n.y * demi);
    ctx.lineTo(P.x + n.x * demi, P.y + n.y * demi);
    ctx.stroke();
  }
  ctx.restore();
}

// Trace les segments découpés j0 à j1 d'un rayon (un seul chemin)
function _segments(ctx, r, j0, j1) {
  ctx.beginPath();
  for (var j = j0; j <= j1 && j < r.segs.length; j++) {
    var sg = r.segs[j];
    if (sg) { ctx.moveTo(sg.a.x, sg.a.y); ctx.lineTo(sg.b.x, sg.b.y); }
  }
}

function _rgbCss(c, a) {
  return 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' +
         Math.round(c[2] * 255) + ',' + (a === undefined ? 1 : a) + ')';
}

// ── Laser monochromatique : un seul rayon de sa couleur ───────────────
function _dessinerRayonMono(ctx, r, L) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = couleurLambda(r.l);
  ctx.lineWidth = L.w;
  _segments(ctx, r, 0, r.segs.length - 1);
  ctx.stroke();
  ctx.restore();
}

// ── Spectre discret : quelques rayons de couleurs franches ────────────
// Ils s'additionnent ('lighter') : superposés, ils redonnent du blanc.
function _dessinerSpectreDiscret(ctx, rayons, L) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = L.w;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  _segments(ctx, rayons[0], 0, 0);
  ctx.stroke();
  rayons.forEach(function (r) {
    if (r.segs.length < 2) return;
    ctx.strokeStyle = couleurLambda(r.l);
    _segments(ctx, r, 1, r.segs.length - 1);
    ctx.stroke();
  });
  ctx.restore();
}

// ── Lumière blanche, spectre continu ──────────────────────────────────
// Les couleurs s'ADDITIONNENT (composition 'lighter', fond noir) :
//  · l'éventail entre deux longueurs d'onde voisines de même chemin est
//    rempli de la couleur correspondante : c'est lui qui montre le spectre ;
//  · quelques rayons tracés en trait, dont les couleurs se somment en
//    blanc, montrent le faisceau là où les couleurs sont encore
//    superposées ; ils s'estompent à mesure que l'éventail s'ouvre (à
//    l'écran, donc aussi dans le prisme quand on zoome) pour ne pas le
//    strier.
function _dessinerLumiereBlanche(ctx, rayons, L) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Éventail coloré (segment 0 commun à tous les rayons : ignoré)
  for (var k = 0; k + 1 < rayons.length; k++) {
    var r1 = rayons[k], r2 = rayons[k + 1];
    if (r1.cle !== r2.cle || r1.segs.length < 2) continue;
    ctx.fillStyle = _rgbCss(rgbLambda((r1.l + r2.l) / 2), 0.6);
    ctx.beginPath();
    for (var j = 1; j < r1.segs.length; j++) {
      var s1 = r1.segs[j], s2 = r2.segs[j];
      if (!s1 || !s2) continue;
      ctx.moveTo(s1.a.x, s1.a.y);
      ctx.lineTo(s1.b.x, s1.b.y);
      ctx.lineTo(s2.b.x, s2.b.y);
      ctx.lineTo(s2.a.x, s2.a.y);
      ctx.closePath();
    }
    ctx.fill();
  }

  // Faisceau incident, commun à toutes les longueurs d'onde : blanc
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.lineWidth = L.w;
  _segments(ctx, rayons[0], 0, 0);
  ctx.stroke();

  // Groupes de rayons de même chemin : [premier, dernier] par clé
  var groupes = {};
  rayons.forEach(function (r, k) {
    var g = groupes[r.cle];
    if (!g) groupes[r.cle] = [k, k];
    else g[1] = k;
  });

  // Rayons en trait (sous-échantillon dont la somme fait du blanc)
  var sel = rayons.filter(function (r, k) { return k % PR_PAS_TRAIT === 0; });
  var somme = [0, 0, 0];
  sel.forEach(function (r) {
    var c = rgbLambda(r.l);
    somme[0] += c[0]; somme[1] += c[1]; somme[2] += c[2];
  });
  // Écart (px écran) entre les rayons extrêmes au-delà duquel le trait
  // a disparu
  var s0 = 2.5 * L.w;
  function alphaEcart(e) { return _clamp(1 - e / s0, 0, 1); }

  sel.forEach(function (r) {
    var n = r.segs.length;
    if (n < 2) return;
    var c = rgbLambda(r.l);
    var rgb = Math.round(255 * 1.1 * c[0] / somme[0]) + ',' +
              Math.round(255 * 1.1 * c[1] / somme[1]) + ',' +
              Math.round(255 * 1.1 * c[2] / somme[2]);
    var g = groupes[r.cle], ra = rayons[g[0]], rb = rayons[g[1]];
    for (var j = 1; j < n; j++) {
      var sg = r.segs[j], sa = ra.segs[j], sb = rb.segs[j];
      if (!sg || !sa || !sb) continue;
      var A = sg.a, B = sg.b;
      var eA = Math.hypot(sa.a.x - sb.a.x, sa.a.y - sb.a.y);
      var eB = Math.hypot(sa.b.x - sb.b.x, sa.b.y - sb.b.y);
      var aA = alphaEcart(eA), aB = alphaEcart(eB);
      if (aA === 0 && aB === 0) continue;
      // L'écart varie linéairement le long du segment : dégradé linéaire,
      // avec un arrêt là où il atteint s0
      var gr = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
      gr.addColorStop(0, 'rgba(' + rgb + ',' + aA + ')');
      if ((eA - s0) * (eB - s0) < 0) {
        var t = (s0 - eA) / (eB - eA);
        gr.addColorStop(t, 'rgba(' + rgb + ',0)');
      }
      gr.addColorStop(1, 'rgba(' + rgb + ',' + aB + ')');
      ctx.strokeStyle = gr;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    }
  });
  ctx.restore();
}

// ── Écran et loupe ────────────────────────────────────────────────────

// Lumière reçue par l'écran : liste d'intervalles { a, b, c } (ordonnées
// monde, couleur), chacun portant la même quantité de lumière répartie
// uniformément.
//  · spectre continu : entre deux longueurs d'onde voisines qui atteignent
//    l'écran par le même chemin, la lumière est étalée de l'une à l'autre
//    (spectre continu, sans trous même très dispersé), élargie de
//    l'épaisseur hb du faisceau ;
//  · laser, spectre discret, ou rayon isolé : une tache de hauteur hb.
function _lumiereEcran(rayons, hb) {
  var tranches = [];
  var discret = simPR.source === 'mono' || _spectreDiscret();
  function coul(l) {
    if (discret) return rgbSature(l);
    var c = rgbLambda(l);
    return [c[0] * _poidsBlanc[0], c[1] * _poidsBlanc[1], c[2] * _poidsBlanc[2]];
  }
  var couvert = [];
  if (!discret) {
    for (var k = 0; k + 1 < rayons.length; k++) {
      var r1 = rayons[k], r2 = rayons[k + 1];
      if (r1.yEcran === null || r2.yEcran === null || r1.cle !== r2.cle) continue;
      var c1 = coul(r1.l), c2 = coul(r2.l);
      tranches.push({
        a: Math.min(r1.yEcran, r2.yEcran) - hb / 2,
        b: Math.max(r1.yEcran, r2.yEcran) + hb / 2,
        c: [(c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2, (c1[2] + c2[2]) / 2]
      });
      couvert[k] = couvert[k + 1] = true;
    }
  }
  rayons.forEach(function (r, k) {
    if (r.yEcran === null || couvert[k]) return;
    tranches.push({ a: r.yEcran - hb / 2, b: r.yEcran + hb / 2, c: coul(r.l) });
  });
  return tranches;
}

// Éclairement de l'écran ligne par ligne : les couleurs s'additionnent,
// puis le tout est ramené à la luminosité maximale (« exposition
// automatique »), avec un relèvement des faibles luminosités. Renvoie un
// tableau de [r, g, b] (0 à 1) pour nb lignes, la ligne j correspondant
// aux ordonnées monde [yA + j/echelle ; yA + (j+1)/echelle].
function _profilEcran(tranches, yA, nb, echelle) {
  var rows = new Float32Array(nb * 3);
  tranches.forEach(function (t) {
    var ja = (t.a - yA) * echelle, jb = (t.b - yA) * echelle;
    var dens = 1 / Math.max(jb - ja, 1e-6);
    var j0 = Math.max(0, Math.floor(ja)), j1 = Math.min(nb - 1, Math.ceil(jb));
    for (var j = j0; j <= j1; j++) {
      var cov = Math.min(j + 1, jb) - Math.max(j, ja);
      if (cov <= 0) continue;
      var f = cov * dens;
      rows[3 * j]     += t.c[0] * f;
      rows[3 * j + 1] += t.c[1] * f;
      rows[3 * j + 2] += t.c[2] * f;
    }
  });
  var max = 0;
  for (var k = 0; k < rows.length; k++) if (rows[k] > max) max = rows[k];
  if (max === 0) return rows;
  // Luminosité de chaque ligne relevée (puissance 0,45, teinte conservée) :
  // le bleu et le violet, très étalés par le prisme, restent bien visibles
  for (var j = 0; j < nb; j++) {
    var mx = Math.max(rows[3 * j], rows[3 * j + 1], rows[3 * j + 2]) / max;
    if (mx <= 0) continue;
    var f = Math.pow(mx, 0.45) / (mx * max);
    rows[3 * j] *= f; rows[3 * j + 1] *= f; rows[3 * j + 2] *= f;
  }
  return rows;
}

function _peindreProfil(ctx, rows, x, y, w) {
  for (var j = 0; j < rows.length / 3; j++) {
    var r = rows[3 * j], g = rows[3 * j + 1], b = rows[3 * j + 2];
    if (r + g + b < 0.004) continue;
    ctx.fillStyle = 'rgb(' + Math.round(255 * r) + ',' + Math.round(255 * g) + ',' +
                    Math.round(255 * b) + ')';
    ctx.fillRect(x, y + j, w, 1);
  }
}

function _dessinerEcran(ctx, rayons, L) {
  var E = L.ecran, Z = L.loupe, ep = 6, z = vuePR.z;
  var tranches = _lumiereEcran(rayons, Math.max(3, 1.6 * L.w));

  // Écran à l'écran : abscisse, et partie visible de sa hauteur
  var xs = _versEcran({ x: E.x, y: 0 }).x;
  var yv0 = Math.max(E.y0, _versMonde({ x: 0, y: 0 }).y);
  var yv1 = Math.min(E.y1, _versMonde({ x: 0, y: L.H }).y);

  ctx.save();
  if (yv1 > yv0 && xs > -ep && xs < L.W + ep) {
    // L'écran, faiblement visible dans la salle noire
    var ys0 = _versEcran({ x: 0, y: yv0 }).y;
    ctx.fillStyle = '#3c4148';
    ctx.fillRect(xs - ep / 2, ys0, ep, (yv1 - yv0) * z);
    if (z === 1) _textePR(ctx, 'Écran', xs, E.y0 - 2, L.fs * 0.85, '#9aa2ac', 'center', 'bottom');
    // Tache lumineuse sur l'écran, à l'échelle de la vue
    _peindreProfil(ctx, _profilEcran(tranches, yv0, Math.round((yv1 - yv0) * z), z),
                   xs - ep / 2, ys0, ep);
  }

  // Loupe (vue d'ensemble seulement) : zone agrandie, centrée sur la tache
  // (ou sur le milieu de l'écran)
  if (z !== 1) { ctx.restore(); return; }
  var yc = (E.y0 + E.y1) / 2;
  if (tranches.length) {
    var ymin = Infinity, ymax = -Infinity;
    tranches.forEach(function (t) { ymin = Math.min(ymin, t.a); ymax = Math.max(ymax, t.b); });
    yc = (ymin + ymax) / 2;
  }
  var hz = Z.h / (2 * PR_ZOOM);

  // Cadre sur l'écran et lignes de rappel vers l'encart
  ctx.strokeStyle = 'rgba(200, 206, 216, 0.55)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(E.x - 7, yc - hz, 14, 2 * hz);
  ctx.beginPath();
  ctx.moveTo(E.x + 7, yc - hz); ctx.lineTo(Z.x, Z.y);
  ctx.moveTo(E.x + 7, yc + hz); ctx.lineTo(Z.x, Z.y + Z.h);
  ctx.stroke();
  ctx.setLineDash([]);

  // Encart fixe : l'écran vu de face, agrandi
  _rectArrondi(ctx, Z.x, Z.y, Z.w, Z.h, 6);
  ctx.fillStyle = '#2a2e34';
  ctx.fill();
  ctx.save();
  ctx.clip();
  var pad = 4;
  _peindreProfil(ctx, _profilEcran(tranches, yc - hz, Math.round(Z.h), PR_ZOOM),
                 Z.x + pad, Z.y, Z.w - 2 * pad);
  ctx.restore();
  _rectArrondi(ctx, Z.x, Z.y, Z.w, Z.h, 6);
  ctx.strokeStyle = '#6a7078';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  _textePR(ctx, 'Écran ×' + PR_ZOOM, Z.x + Z.w / 2, Z.y - 5, L.fs * 0.85, '#9aa2ac',
           'center', 'bottom');
  ctx.restore();
}

// ── Source : boîtier, point d'émission et poignée de rotation ─────────
function _dessinerSource(ctx, L) {
  var g0 = _geoSource(L), S = g0.S, d = g0.d, K = g0.K;
  var len = L.len, wid = L.wid;
  var mono = simPR.source === 'mono';

  ctx.save();
  // Tige vers la poignée
  ctx.strokeStyle = '#8a949e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(g0.B.x, g0.B.y);
  ctx.lineTo(K.x + d.x * L.rb, K.y + d.y * L.rb);
  ctx.stroke();

  // Poignée : disque et flèche courbe
  ctx.beginPath();
  ctx.arc(K.x, K.y, L.rb, 0, 2 * Math.PI);
  ctx.fillStyle = '#4a535d';
  ctx.fill();
  ctx.strokeStyle = '#c8d0d8';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  var rf = L.rb * 0.55, a0 = -0.6, a1 = 3.6;
  ctx.beginPath();
  ctx.arc(K.x, K.y, rf, a0, a1);
  ctx.stroke();
  var px = K.x + rf * Math.cos(a1), py = K.y + rf * Math.sin(a1);
  var tx = -Math.sin(a1), ty = Math.cos(a1), tf = L.rb * 0.35;
  ctx.beginPath();
  ctx.moveTo(px + tx * tf, py + ty * tf);
  ctx.lineTo(px - ty * tf * 0.8, py + tx * tf * 0.8);
  ctx.lineTo(px + ty * tf * 0.8, py - tx * tf * 0.8);
  ctx.closePath();
  ctx.fillStyle = '#c8d0d8';
  ctx.fill();

  // Boîtier (repère local : x vers l'arrière)
  ctx.translate(S.x, S.y);
  var ang = Math.atan2(-d.y, -d.x);
  ctx.rotate(ang);
  var g = ctx.createLinearGradient(0, -wid / 2, 0, wid / 2);
  g.addColorStop(0, '#9aa6b2');
  g.addColorStop(0.45, '#5f6b77');
  g.addColorStop(1, '#3e4852');
  ctx.fillStyle = g;
  _rectArrondi(ctx, 0, -wid / 2, len, wid, wid * 0.22);
  ctx.fill();
  ctx.strokeStyle = '#c0c8d0';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = '#20262c';
  ctx.fillRect(-wid * 0.12, -wid * 0.3, wid * 0.22, wid * 0.6);

  // Inscription, remise à l'endroit si besoin
  var fsL = wid * 0.38;
  ctx.save();
  ctx.translate(len * 0.5, 0);
  if (Math.cos(ang) < 0) ctx.rotate(Math.PI);
  ctx.font = 'bold ' + fsL + 'px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(mono ? 'LASER' : 'BLANCHE', 0, fsL * 0.05);
  ctx.restore();

  // Point d'émission
  ctx.beginPath();
  ctx.arc(-wid * 0.12, 0, wid * 0.16, 0, 2 * Math.PI);
  ctx.fillStyle = mono ? couleurLambda(simPR.lambda) : '#ffffff';
  ctx.fill();
  ctx.restore();
}

// ── Indication du zoom en cours ───────────────────────────────────────
function _dessinerIndicZoom(ctx, L) {
  if (vuePR.z === 1) return;
  var z = vuePR.z < 10 ? fmtFr(vuePR.z, 1) : fmtFr(vuePR.z, 0);
  _textePR(ctx, 'Zoom ×' + z + '  ·  glisser : déplacer la vue  ·  double-clic : vue d\'ensemble',
           L.pad, L.pad, L.fs * 0.85, '#9aa2ac', 'left', 'top');
}

// ══════════════════════════════════════════════════════════════════════
//  Zoom de la vue (molette)
// ══════════════════════════════════════════════════════════════════════

// La vue zoomée ne sort jamais du cadre de la vue d'ensemble
function _bornerVue(W, H) {
  if (vuePR.z <= 1) { vuePR.z = 1; vuePR.ox = 0; vuePR.oy = 0; return; }
  vuePR.ox = _clamp(vuePR.ox, W * (1 - vuePR.z), 0);
  vuePR.oy = _clamp(vuePR.oy, H * (1 - vuePR.z), 0);
}

// Zoom d'un facteur f autour du point p (écran), qui reste immobile
function zoomerVue(f, p) {
  var w = _versMonde(p);
  vuePR.z = _clamp(vuePR.z * f, 1, PR_ZOOM_MAX);
  if (Math.abs(vuePR.z - 1) < 0.02) vuePR.z = 1;
  vuePR.ox = p.x - w.x * vuePR.z;
  vuePR.oy = p.y - w.y * vuePR.z;
  _bornerVue(cvPrisme.clientWidth, cvPrisme.clientHeight);
  demanderRenduPrisme();
}

function vueEnsemble() {
  vuePR.z = 1; vuePR.ox = 0; vuePR.oy = 0;
  demanderRenduPrisme();
}

// ══════════════════════════════════════════════════════════════════════
//  Interactions (Pointer Events)
// ══════════════════════════════════════════════════════════════════════
// Vue d'ensemble : on attrape la poignée de la source (rotation autour du
// point d'émission), son boîtier (déplacement) ou le prisme (rotation
// autour de son centre de gravité).
// Vue zoomée : tout glisser déplace la vue ; la source et le prisme ne
// bougent plus (on ne les dérègle pas en explorant).

var _dragPR = null;   // { cible, a0, v0, dx, dy, p0, o0 }

function _posPR(e) {
  var r = cvPrisme.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function _dansTriangle(p, s) {
  var signe = 0;
  for (var k = 0; k < 3; k++) {
    var a = s[k], b = s[(k + 1) % 3];
    var c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(c) < 1e-9) continue;
    var sg = c > 0 ? 1 : -1;
    if (signe && sg !== signe) return false;
    signe = sg;
  }
  return true;
}

// p : position écran
function _cibleSousPR(p) {
  if (vuePR.z > 1) return 'vue';
  var L = layoutPrisme(cvPrisme.clientWidth, cvPrisme.clientHeight);
  var g0 = _geoSource(L);
  if (Math.hypot(p.x - g0.K.x, p.y - g0.K.y) < L.rb + 6) return 'srcRot';
  if (_distSegment(p, g0.S, g0.B) < L.wid * 0.7 + 4) return 'srcMove';
  var s = sommetsPrisme(L.G, PR_COTE * L.m, simPR.A, simPR.rot).map(_versEcran);
  if (_dansTriangle(p, s)) return 'prisme';
  for (var k = 0; k < 3; k++) {
    if (_distSegment(p, s[k], s[(k + 1) % 3]) < 8) return 'prisme';
  }
  return null;
}

function _appliquerDragPR(p) {
  var L = layoutPrisme(cvPrisme.clientWidth, cvPrisme.clientHeight);
  var c = _dragPR.cible;
  if (c === 'srcMove') {
    var w = _versMonde({ x: p.x - _dragPR.dx, y: p.y - _dragPR.dy });
    var x = _clamp(w.x, L.pad, L.ecran.x - 24);
    var y = _clamp(w.y, L.pad, L.H - L.pad);
    simPR.sx = (x - L.G.x) / L.m;
    simPR.sy = (y - L.G.y) / L.m;

  } else if (c === 'srcRot') {
    // La source pointe à l'opposé de la poignée
    var S = _versEcran(_sourcePx(L));
    var a = Math.atan2(S.y - p.y, S.x - p.x) / DEG;
    simPR.dir = normDeg(aimanter(a, 5, 0.5));

  } else if (c === 'prisme') {
    var G = _versEcran(L.G);
    var ap = Math.atan2(p.y - G.y, p.x - G.x) / DEG;
    simPR.rot = normDeg(aimanter(normDeg(_dragPR.v0 + ap - _dragPR.a0), 5, 0.5));

  } else if (c === 'vue') {
    vuePR.ox = _dragPR.o0.x + p.x - _dragPR.p0.x;
    vuePR.oy = _dragPR.o0.y + p.y - _dragPR.p0.y;
    _bornerVue(L.W, L.H);
  }
}

function _curseurPR(c) {
  return c === 'srcMove' || c === 'vue' ? 'move' : c ? 'grab' : 'default';
}

function initInteractionsPrisme() {
  cvPrisme.addEventListener('pointerdown', function (e) {
    var p = _posPR(e);
    var cible = _cibleSousPR(p);
    if (!cible) return;
    var L = layoutPrisme(cvPrisme.clientWidth, cvPrisme.clientHeight);
    var S = _versEcran(_sourcePx(L)), G = _versEcran(L.G);
    _dragPR = {
      cible: cible,
      a0: Math.atan2(p.y - G.y, p.x - G.x) / DEG,
      v0: simPR.rot,
      dx: p.x - S.x, dy: p.y - S.y,
      p0: p, o0: { x: vuePR.ox, y: vuePR.oy }
    };
    try { cvPrisme.setPointerCapture(e.pointerId); } catch (err) { /* pointeur déjà relâché */ }
    cvPrisme.style.cursor = cible === 'vue' ? 'move' : 'grabbing';
    e.preventDefault();
  });

  cvPrisme.addEventListener('pointermove', function (e) {
    var p = _posPR(e);
    if (!_dragPR) {
      cvPrisme.style.cursor = _curseurPR(_cibleSousPR(p));
      return;
    }
    _appliquerDragPR(p);
    if (_dragPR.cible === 'vue') demanderRenduPrisme();
    else surChangementPrisme();
  });

  function fin(e) {
    if (!_dragPR) return;
    _dragPR = null;
    if (cvPrisme.hasPointerCapture(e.pointerId)) cvPrisme.releasePointerCapture(e.pointerId);
    cvPrisme.style.cursor = _curseurPR(_cibleSousPR(_posPR(e)));
  }
  cvPrisme.addEventListener('pointerup', fin);
  cvPrisme.addEventListener('pointercancel', fin);

  // Molette : zoom autour du pointeur (pour regarder un dioptre de près)
  cvPrisme.addEventListener('wheel', function (e) {
    e.preventDefault();
    var dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    zoomerVue(Math.exp(-dy * 0.0025), _posPR(e));
  }, { passive: false });

  cvPrisme.addEventListener('dblclick', vueEnsemble);
}
