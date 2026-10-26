// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  becher.js — Onglet Oxydoréduction : scène macroscopique
//  Dépend de sim.js.
//  Disposition du canvas (bécher à gauche, loupe à droite), lame métallique
//  déplaçable à la souris, couleur de la solution, dépôt et usure de la
//  lame, poudre tombée au fond du bécher. L'avancement macroscopique tend vers 1 puis se stabilise ; la
//  loupe (loupe.js) montre en continu le mécanisme à l'échelle des ions.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ══════════════════════════════════════════════════════════════════════
//  Géométrie de la scène, en unités logiques
//  La scène macroscopique est dessinée dans un repère fixe de 100 × 102
//  unités, mis à l'échelle de la zone disponible : toutes les cotes
//  ci-dessous restent valables à toute taille de fenêtre.
//  Contrainte : la lame levée juste au-dessus du bord du bécher (HAUT_YB)
//  doit rester entière dans le cadre, étiquette comprise.
// ══════════════════════════════════════════════════════════════════════

var SCENE_W = 100, SCENE_H = 102;

var TABLE_Y   = 90;                // plan de travail
var BECHER_CX = 64, BECHER_W = 34, BECHER_H = 36;
var BECHER_L  = BECHER_CX - BECHER_W / 2;
var BECHER_R  = BECHER_CX + BECHER_W / 2;
var BECHER_TOP = TABLE_Y - BECHER_H;
var SOL_TOP   = 62;                // surface libre de la solution

var LAME_W = 5, LAME_H = 40;       // lame (vue de face)
var REPOS_X = 22, REPOS_YB = 88;   // lame posée dans son support
var SLOT_X  = 58, IMM_YB = 86;     // lame plongée (bas de la lame)
var HAUT_YB = 52;                  // passage au-dessus du bord du bécher
var SUPPORT_W = 12, SUPPORT_H = 3.4;

// Point visé par la loupe : face droite de la lame plongée, mi-profondeur
var LOUPE_PX = SLOT_X + LAME_W / 2, LOUPE_PY = 74;

// Constante de temps de l'avancement macroscopique (s de temps simulé)
var TAU_AVANCEMENT = 30;

// Aspect de la lame (usure, dépôt) et poudre au fond : 0 → 1, plus lent que
// l'avancement. Avec 1 − (1 − avancement)^EXPOSANT_ASPECT, l'aspect suit la
// même exponentielle qu'avec une constante de temps TAU_AVANCEMENT /
// EXPOSANT_ASPECT (75 s au lieu de 30 s) : la lame continue de changer
// après que la couleur de la solution s'est presque stabilisée.
var EXPOSANT_ASPECT = 0.4;

// Déplacement automatique de la lame (temps réel) : vitesse de croisière
// VITESSE_LAME (unités/s), départ et arrivée en douceur (accélération
// ACCEL_LAME, unités/s²), vitesse minimale V_MIN_LAME pour ne pas traîner
// sur les derniers dixièmes ; les angles du trajet sont arrondis
// (rayon RAYON_VIRAGE au plus).
var VITESSE_LAME = 70;
var ACCEL_LAME = 260;
var V_MIN_LAME = 5;
var RAYON_VIRAGE = 5;

// ══════════════════════════════════════════════════════════════════════
//  Disposition du canvas (calculée à chaque redimensionnement)
// ══════════════════════════════════════════════════════════════════════

var disp = {
  W: 0, H: 0,
  mx: 0, my: 0, k: 1,          // repère de la scène : px = mx + k·x
  lx: 0, ly: 0, lr: 0          // loupe : centre et rayon (px)
};

function calculerDisposition(W, H) {
  disp.W = W; disp.H = H;
  var rx, ry, rw, rh;
  if (W >= 1.15 * H) {
    // Paysage : scène à gauche, loupe à droite
    rw = W * 0.5; rh = H; rx = 0; ry = 0;
    disp.lx = W * 0.5 + W * 0.25;
    disp.ly = H * 0.52;
    disp.lr = Math.min(W * 0.25, H * 0.5) * 0.84;
  } else {
    // Portrait : scène en haut, loupe en bas
    rw = W; rh = H * 0.5; rx = 0; ry = 0;
    disp.lx = W * 0.5;
    disp.ly = H * 0.76;
    disp.lr = Math.min(W * 0.5, H * 0.25) * 0.84;
  }
  disp.k  = Math.min(rw / SCENE_W, rh / SCENE_H) * 0.96;
  disp.mx = rx + (rw - SCENE_W * disp.k) / 2;
  disp.my = ry + (rh - SCENE_H * disp.k) / 2;
}

// Conversions repère logique ↔ pixels CSS
function sceneVersPx(x, y) { return { x: disp.mx + disp.k * x, y: disp.my + disp.k * y }; }
function pxVersScene(px, py) { return { x: (px - disp.mx) / disp.k, y: (py - disp.my) / disp.k }; }

// ══════════════════════════════════════════════════════════════════════
//  État de la scène
// ══════════════════════════════════════════════════════════════════════

var lame = {
  x: REPOS_X, yb: REPOS_YB,
  dansBecher: false,    // vrai entre l'entrée par le haut du bécher et la sortie
  cible: 'repos',       // 'repos' | 'becher' : destination du dernier geste
  chemin: null,         // déplacement automatique : liste de points {x, yb, entre, sort}
  parcouru: 0,          // distance déjà parcourue sur ce chemin (accélération)
  mouillee: 0           // hauteur (depuis le bas) déjà mouillée par la solution
};

var macro = {
  avancement: 0,        // 0 → 1 : avancement de la transformation
  motif: null,          // aiguilles du dépôt et grains de la poudre (tirés une fois par RAZ)
  texture: null         // texture du dépôt sur la lame (tirée une fois par RAZ)
};

function resetBecher() {
  lame.x = REPOS_X; lame.yb = REPOS_YB;
  lame.dansBecher = false;
  lame.cible = 'repos';
  lame.chemin = null;
  lame.parcouru = 0;
  lame.mouillee = 0;
  macro.avancement = 0;
  macro.motif = _tirerMotifDepot();
  macro.texture = _tirerTextureDepot();
  _drag = null;
  _signalerEtatLame();
}

// Aiguilles (cristaux d'argent, de plomb) : positions relatives à la zone
// mouillée, seuil d'apparition dans [0, 1] comparé à l'aspect.
// Grains de la poudre tombée au fond : u position horizontale relative à la
// demi-largeur du tas (au-delà de ±1 : grains épars sur le fond), v hauteur
// relative dans le tas, seuil comparé à la quantité de poudre.
function _tirerMotifDepot() {
  var alea = creerAlea(20261025);
  var aiguilles = [], grains = [];
  for (var j = 0; j < 26; j++) {
    var gauche = alea() < 0.5;
    aiguilles.push({
      gauche: gauche,
      v: 0.04 + alea() * 0.92,
      angle: (gauche ? Math.PI : 0) + (alea() - 0.5) * 1.6,
      long: 2.2 + alea() * 3.4,
      seuil: alea() * 0.6,
      branches: 1 + Math.floor(alea() * 3)
    });
  }
  for (var i = 0; i < 170; i++) {
    var epars = i % 4 === 0;           // un grain sur quatre roule autour du tas
    grains.push({
      u: epars ? (alea() < 0.5 ? -1 : 1) * (0.8 + alea() * 0.7) : alea() * 2 - 1,
      v: epars ? 0 : alea(),
      r: 0.16 + alea() * 0.2,
      seuil: alea() * 0.9,
      teinte: alea() * 0.4 - 0.2
    });
  }
  return { aiguilles: aiguilles, grains: grains };
}

// ── Texture du dépôt sur la lame ──────────────────────────────────────
// Une image de toute la hauteur de la lame, un peu plus large qu'elle (le
// dépôt déborde des bords). Chaque pixel a son propre seuil d'apparition :
// le dépôt envahit la surface point par point, de façon continue, au lieu
// de taches qui poussent. Les seuils suivent un bruit en grumeaux (le dépôt
// se forme par îlots qui grossissent et se rejoignent) plus un grain fin.
// Sur la lame, ils sont ramenés à une répartition uniforme sur [0, 1] : la
// fraction couverte vaut exactement l'aspect. Hors de la lame, ils sont
// plus élevés, d'autant plus loin du bord (seul un dépôt épais déborde, en
// bord déchiqueté ; certains n'apparaissent jamais).
var PX_TEXTURE = 12;      // pixels de texture par unité de scène
var DEBORD = 0.08;        // débord de chaque côté, en largeur de lame
var FONDU_GRAIN = 0.05;   // chaque pixel apparaît en fondu sur cette plage d'aspect

function _tirerTextureDepot() {
  var alea = creerAlea(20261026);
  var w = Math.round(LAME_W * (1 + 2 * DEBORD) * PX_TEXTURE);
  var h = Math.round(LAME_H * PX_TEXTURE);
  var n = w * h;
  var grumeaux = _bruitValeur(alea, w, h, 1.4 * PX_TEXTURE);
  var grain = _bruitValeur(alea, w, h, 0.4 * PX_TEXTURE);
  var val = new Float32Array(n), seuils = new Float32Array(n), teintes = new Float32Array(n);
  var surLame = [];
  for (var i = 0; i < n; i++) {
    var u = (i % w + 0.5) / w * (1 + 2 * DEBORD) - DEBORD;   // 0 → 1 sur la lame
    var b = 0.6 * grumeaux[i] + 0.3 * grain[i] + 0.1 * alea();
    var dehors = Math.max(-u, u - 1);
    if (dehors > 0) seuils[i] = 0.55 + 0.7 * dehors / DEBORD + 0.5 * (b - 0.5);
    else { val[i] = b; surLame.push(i); }
    teintes[i] = (grain[i] - 0.5) * 0.35 + (alea() - 0.5) * 0.12;
  }
  // Rang → seuil uniforme
  surLame.sort(function (p, q) { return val[p] - val[q]; });
  for (var k = 0; k < surLame.length; k++) seuils[surLame[k]] = k / surLame.length;

  var canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  return { w: w, h: h, seuils: seuils, teintes: teintes, canvas: canvas, cle: '' };
}

// Bruit de valeur : grille de valeurs aléatoires au pas `pas` (pixels),
// interpolées en douceur. Valeurs dans [0, 1].
function _bruitValeur(alea, w, h, pas) {
  var gw = Math.ceil(w / pas) + 2, gh = Math.ceil(h / pas) + 2;
  var g = new Float32Array(gw * gh);
  for (var i = 0; i < g.length; i++) g[i] = alea();
  var out = new Float32Array(w * h);
  for (var y = 0; y < h; y++) {
    var fy = y / pas, iy = Math.floor(fy), ty = fy - iy;
    ty = ty * ty * (3 - 2 * ty);
    for (var x = 0; x < w; x++) {
      var fx = x / pas, ix = Math.floor(fx), tx = fx - ix;
      tx = tx * tx * (3 - 2 * tx);
      var a = g[iy * gw + ix], b = g[iy * gw + ix + 1];
      var c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
      out[y * w + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

// Redessine la texture pour l'aspect a (seulement s'il a assez changé, ou
// si la solution, donc la couleur du dépôt, a changé)
function _majTextureDepot(a) {
  var T = macro.texture;
  var cle = Math.round(a * 400) + '|' + sim.solution;
  if (T.cle === cle) return;
  T.cle = cle;
  var col = _couleurDepot();
  var cT = T.canvas.getContext('2d');
  var img = cT.createImageData(T.w, T.h);
  var d = img.data;
  for (var i = 0; i < T.seuils.length; i++) {
    var al = (a - T.seuils[i]) / FONDU_GRAIN;
    if (al <= 0) continue;              // pixel transparent (déjà à 0)
    var t = T.teintes[i];
    for (var k = 0; k < 3; k++) {
      d[4 * i + k] = t >= 0 ? col[k] + (255 - col[k]) * t : col[k] * (1 + t);
    }
    d[4 * i + 3] = 235 * Math.min(1, al);
  }
  cT.putImageData(img, 0, 0);
}

// Couleur du dépôt et de la poudre : plus sombre que le métal massif (le
// cuivre déposé est rouge-brun, le fer noir…)
function _couleurDepot() {
  var D = METAUX[sim.solution];
  var col = couleurRGB(D.atome);
  return D.depot === 'eponge' ? [150, 72, 36]
       : D.depot === 'noir'   ? nuance(col, -0.5)
       : nuance(col, -0.28);
}

// Aspect de la lame et quantité de poudre (cf. EXPOSANT_ASPECT)
function aspectDepot() {
  if (!reactionPossible(sim.metal, sim.solution)) return 0;
  return 1 - Math.pow(1 - macro.avancement, EXPOSANT_ASPECT);
}

// ══════════════════════════════════════════════════════════════════════
//  Interrogations (utilisées par loupe.js et ui.js)
// ══════════════════════════════════════════════════════════════════════

// Fraction immergée de la hauteur de travail (0 hors bécher, 1 en place)
function fractionImmergee() {
  if (!lame.dansBecher) return 0;
  return Math.max(0, Math.min(1, (lame.yb - SOL_TOP) / (IMM_YB - SOL_TOP)));
}

// Position du bas de la lame vue dans la loupe, en rayons de loupe depuis
// le haut du cercle : 0 = bord haut, 2 = bord bas. Un grossissement fictif
// fait correspondre 3 unités de scène à un rayon de loupe, pour que la lame
// « descende » dans la loupe au lieu d'y apparaître d'un coup.
// Renvoie -1 si la lame n'est pas dans le bécher.
function basLameDansLoupe() {
  if (!lame.dansBecher) return -1;
  return Math.max(-1, Math.min(3, 1 + (lame.yb - LOUPE_PY) / 3));
}

// ══════════════════════════════════════════════════════════════════════
//  Déplacements automatiques (bouton Plonger / Retirer)
// ══════════════════════════════════════════════════════════════════════

// Drapeaux d'un point : `entre` (la lame est alors au-dessus de l'ouverture
// et entre dans le bécher), `sort` (elle en est sortie), appliqués quand la
// lame atteint ce point.

function plongerLame() {
  if (lame.dansBecher) {
    _lancerChemin([{ x: SLOT_X, yb: IMM_YB }]);
  } else {
    _lancerChemin([
      { x: lame.x,  yb: Math.min(lame.yb, HAUT_YB) },
      { x: SLOT_X,  yb: HAUT_YB, entre: true },
      { x: SLOT_X,  yb: IMM_YB }
    ]);
  }
  lame.cible = 'becher';
  _signalerEtatLame();
}

function retirerLame() {
  var dep = { x: lame.x, yb: lame.yb };
  var ch = [];
  if (lame.dansBecher) {
    dep = { x: SLOT_X, yb: HAUT_YB, sort: true };
    ch.push(dep);
  }
  _lancerChemin(ch.concat(_cheminVersSupport(dep)));
  lame.cible = 'repos';
  _signalerEtatLame();
}

// Trajet de dep jusqu'au support : en ligne droite si le bécher n'est pas
// sur le chemin, sinon en passant juste au-dessus de son bord (et non plus
// toujours à la hauteur HAUT_YB : lâchée près du support, la lame y glisse
// au lieu de remonter d'abord). Elle s'arrête un peu au-dessus de la fente
// puis s'y enfonce verticalement.
function _cheminVersSupport(dep) {
  var yApproche = TABLE_Y - SUPPORT_H - 1.5;
  var arrivee = { x: REPOS_X, yb: yApproche };
  // À gauche de xLibre, la lame ne surplombe plus le bécher (bec verseur
  // compris) ; au-dessus de yPassage, elle passe au-dessus de son bord.
  // Marges élargies de RAYON_VIRAGE / 4 : l'arrondi d'un angle droit rogne
  // le coin d'autant.
  var xLibre = BECHER_L - 2.2 - RAYON_VIRAGE / 4 - LAME_W / 2;
  var yPassage = BECHER_TOP - 1.3 - RAYON_VIRAGE / 4;
  var ch = [];
  var p = dep;
  if (p.x > xLibre) {
    if (p.yb > yPassage) {             // à droite du bécher, plus bas que son bord
      p = { x: p.x, yb: yPassage };
      ch.push(p);
    }
    // Hauteur du bas de la lame en xLibre sur la ligne droite p → arrivée
    var ybLibre = p.yb + (arrivee.yb - p.yb) * (p.x - xLibre) / (p.x - arrivee.x);
    if (ybLibre > yPassage) ch.push({ x: xLibre, yb: yPassage });
  } else if (p.yb > yApproche) {
    ch.push({ x: p.x, yb: yApproche }); // plus basse que la fente : petit soulèvement
  }
  ch.push(arrivee);
  ch.push({ x: REPOS_X, yb: REPOS_YB });
  return ch;
}

// Prépare le déplacement automatique vers la suite de points `points` :
// points confondus fusionnés, angles arrondis (arc de parabole tangent aux
// deux segments, de rayon RAYON_VIRAGE au plus), le tout en une suite dense
// de points parcourue par majBecher.
function _lancerChemin(points) {
  var pts = [{ x: lame.x, yb: lame.yb }];
  var i, k;
  for (i = 0; i < points.length; i++) {
    var q = pts[pts.length - 1], s = points[i];
    if (Math.abs(s.x - q.x) + Math.abs(s.yb - q.yb) < 1e-3) {
      q.entre = q.entre || s.entre; q.sort = q.sort || s.sort;
    } else {
      pts.push({ x: s.x, yb: s.yb, entre: s.entre, sort: s.sort });
    }
  }
  // Drapeaux du point de départ : la lame y est déjà
  if (pts[0].entre) lame.dansBecher = true;
  if (pts[0].sort) lame.dansBecher = false;

  var dense = [];
  for (i = 1; i < pts.length; i++) {
    var c = pts[i];
    if (i === pts.length - 1) { dense.push(c); break; }
    var a = pts[i - 1], b = pts[i + 1];
    var la = Math.hypot(c.x - a.x, c.yb - a.yb), lb = Math.hypot(b.x - c.x, b.yb - c.yb);
    var uax = (c.x - a.x) / la, uay = (c.yb - a.yb) / la;
    var ubx = (b.x - c.x) / lb, uby = (b.yb - c.yb) / lb;
    var r = Math.min(RAYON_VIRAGE, 0.45 * la, 0.45 * lb);
    if (uax * ubx + uay * uby > 0.999 || r < 0.05) { dense.push(c); continue; }   // pas d'angle
    var p0x = c.x - uax * r, p0y = c.yb - uay * r;
    var p2x = c.x + ubx * r, p2y = c.yb + uby * r;
    var N = 8;
    for (k = 0; k <= N; k++) {
      var t = k / N, m0 = (1 - t) * (1 - t), m1 = 2 * t * (1 - t), m2 = t * t;
      dense.push({
        x:  m0 * p0x + m1 * c.x  + m2 * p2x,
        yb: m0 * p0y + m1 * c.yb + m2 * p2y,
        sort:  k === 0 && c.sort,      // sortie dès le début du virage
        entre: k === N && c.entre      // entrée à la fin du virage, à la verticale de la place
      });
    }
  }
  lame.chemin = dense.length ? dense : null;
  lame.parcouru = 0;
}

// Longueur du chemin qui reste à parcourir
function _longueurRestante() {
  var L = 0, x = lame.x, y = lame.yb;
  for (var i = 0; i < lame.chemin.length; i++) {
    var p = lame.chemin[i];
    L += Math.hypot(p.x - x, p.yb - y);
    x = p.x; y = p.yb;
  }
  return L;
}

// Prévient ui.js (libellé du bouton Plonger / Retirer)
function _signalerEtatLame() {
  if (typeof majBoutonPlonger === 'function') majBoutonPlonger();
}

// ══════════════════════════════════════════════════════════════════════
//  Mise à jour
//  dtSim  : temps simulé (s), nul en pause — fait avancer la transformation.
//  dtReel : temps réel (s) — la lame suit la main même en pause.
// ══════════════════════════════════════════════════════════════════════

function majBecher(dtSim, dtReel) {
  // ── Déplacement automatique de la lame ──
  // Vitesse limitée au départ et à l'arrivée (v² = 2·a·distance) : la lame
  // accélère puis ralentit au lieu de démarrer et de s'arrêter d'un coup.
  if (lame.chemin && !_drag) {
    var v = Math.min(VITESSE_LAME,
                     V_MIN_LAME + Math.sqrt(2 * ACCEL_LAME * lame.parcouru),
                     V_MIN_LAME + Math.sqrt(2 * ACCEL_LAME * _longueurRestante()));
    var reste = v * dtReel;
    lame.parcouru += reste;
    while (reste > 0 && lame.chemin.length) {
      var pt = lame.chemin[0];
      var dx = pt.x - lame.x, dy = pt.yb - lame.yb;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d <= reste) {
        lame.x = pt.x; lame.yb = pt.yb; reste -= d;
        if (pt.entre) lame.dansBecher = true;
        if (pt.sort) lame.dansBecher = false;
        lame.chemin.shift();
      } else {
        lame.x += dx / d * reste; lame.yb += dy / d * reste; reste = 0;
      }
    }
    if (!lame.chemin.length) lame.chemin = null;
    sim.needsRedraw = true;
  }

  // ── Zone mouillée (le dépôt ne se forme que là) ──
  if (lame.dansBecher) {
    lame.mouillee = Math.max(lame.mouillee, lame.yb - SOL_TOP);
  }

  // ── Avancement : tend vers 1 et se stabilise (cf. choix de l'utilisateur) ──
  if (dtSim > 0 && reactionPossible(sim.metal, sim.solution)) {
    var f = fractionImmergee();
    if (f > 0) {
      macro.avancement += (1 - macro.avancement) * (1 - Math.exp(-dtSim * f / TAU_AVANCEMENT));
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Couleur de la solution
//  L'oxydant disparaît (1 − avancement) ; les ions du métal apparaissent
//  dans le rapport des coefficients stœchiométriques (Cu + 2 Ag⁺ : la
//  solution devient bleue, mais moitié moins concentrée en Cu²⁺ qu'elle ne
//  l'était en Ag⁺).
//  Seules les espèces colorées (METAUX[…].solution non nul) teintent la
//  solution, avec les mêmes teintes que la page Dissolution : la couleur
//  d'une espèce suit sa suite de teintes selon sa concentration c
//  (rapportée à la concentration initiale de l'oxydant : c = 1 → dernière
//  teinte). Aux très faibles concentrations (c < C_RAMPE), elle se fond
//  dans l'eau au lieu d'y apparaître d'un coup. Deux espèces colorées
//  (Fe + Cu²⁺) : moyenne de leurs teintes, pondérée par ces mêmes poids ;
//  la solution passe du bleu au vert en transitant par le bleu-vert.
//  Solution incolore : même bleu pâle plat #b8d4f0 que l'eau des pages
//  Dissolution et Titrage (charte du site).
// ══════════════════════════════════════════════════════════════════════

var _EAU = [184, 212, 240];          // #b8d4f0, eau « neutre » du site
var C_RAMPE = 0.1;
var ALPHA_VOILE = 0.4;               // solution vue devant la partie immergée de la lame

function couleurSolution() {
  var p = macro.avancement;
  var especes = [{ sym: sim.solution, conc: 1 - p }];
  if (reactionPossible(sim.metal, sim.solution)) {
    var st = stoechiometrie(sim.metal, sim.solution);
    especes.push({ sym: sim.metal, conc: p * st.coefMetal / st.coefIon });
  }
  var somme = [0, 0, 0], poids = 0;
  for (var i = 0; i < especes.length; i++) {
    var stops = METAUX[especes[i].sym].solution;
    if (!stops || especes[i].conc <= 0) continue;
    var w = Math.min(1, especes[i].conc / C_RAMPE);
    var rgb = couleurSuite(stops, especes[i].conc);
    for (var k = 0; k < 3; k++) somme[k] += w * rgb[k];
    poids += w;
  }
  var intensite = Math.min(1, poids);
  var eau = Math.max(0, 1 - poids);
  var c = [];
  for (k = 0; k < 3; k++) c.push(Math.round((somme[k] + eau * _EAU[k]) / (poids + eau)));
  return { rgb: c, intensite: intensite };
}

// ══════════════════════════════════════════════════════════════════════
//  Rendu
// ══════════════════════════════════════════════════════════════════════

function dessinerBecher(ctx) {
  ctx.save();
  ctx.translate(disp.mx, disp.my);
  ctx.scale(disp.k, disp.k);
  ctx.lineJoin = 'round';

  _dessinerTable(ctx);
  _dessinerSupport(ctx);

  // Solution opaque (couleur plate, comme la page Dissolution), puis la
  // lame, puis un voile de la même couleur par-dessus : la partie immergée
  // de la lame paraît vue à travers le liquide.
  var sol = couleurSolution();
  _cheminInterieur(ctx, SOL_TOP);
  ctx.fillStyle = rgbCss(sol.rgb);
  ctx.fill();
  _dessinerVolume(ctx);
  _dessinerPoudre(ctx);

  _dessinerLame(ctx);
  _dessinerSolution(ctx, sol);
  _dessinerVerre(ctx);
  _dessinerEtiquettes(ctx);

  ctx.restore();
}

function _dessinerTable(ctx) {
  ctx.fillStyle = '#e6dccb';
  ctx.fillRect(0, TABLE_Y, SCENE_W, 3.2);
  ctx.strokeStyle = '#b0a898';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(0, TABLE_Y); ctx.lineTo(SCENE_W, TABLE_Y);
  ctx.stroke();
}

// Socle en bois dans lequel la lame est posée au repos
function _dessinerSupport(ctx) {
  var w = SUPPORT_W, h = SUPPORT_H;
  ctx.fillStyle = '#c9a77c';
  ctx.strokeStyle = '#8a6a44';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.rect(REPOS_X - w / 2, TABLE_Y - h, w, h);
  ctx.fill(); ctx.stroke();
  // Fente
  ctx.fillStyle = '#6a4e30';
  ctx.fillRect(REPOS_X - LAME_W / 2 - 0.4, TABLE_Y - h, LAME_W + 0.8, 0.8);
}

// La solution remplit tout l'intérieur du bécher, jusqu'aux parois et aux
// coins arrondis du fond (le trait du verre, dessiné ensuite, la recouvre
// à moitié) : aucun vide entre le liquide et le verre. Ici, le voile
// dessiné devant la lame (le fond opaque est déjà en place).
function _dessinerSolution(ctx, sol) {
  _cheminInterieur(ctx, SOL_TOP);
  ctx.fillStyle = rgbCss(sol.rgb, ALPHA_VOILE);
  ctx.fill();
  // Surface libre
  ctx.strokeStyle = rgbCss(nuance(sol.rgb, -0.3), 0.8);
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(BECHER_L, SOL_TOP); ctx.lineTo(BECHER_R, SOL_TOP);
  ctx.stroke();
}

// Modelé du liquide (bécher cylindrique) : la lumière traverse moins de
// liquide près des parois, qui paraissent plus claires ; le fond est un
// peu plus soutenu, la surface éclairée. Sans ce modelé, une couleur plate
// donne un aplat de peinture plutôt qu'un liquide.
function _dessinerVolume(ctx) {
  _cheminInterieur(ctx, SOL_TOP);
  var g = ctx.createLinearGradient(BECHER_L, 0, BECHER_R, 0);
  g.addColorStop(0,    'rgba(255,255,255,0.38)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.10)');
  g.addColorStop(0.5,  'rgba(255,255,255,0)');
  g.addColorStop(0.82, 'rgba(255,255,255,0.10)');
  g.addColorStop(1,    'rgba(255,255,255,0.38)');
  ctx.fillStyle = g;
  ctx.fill();
  var h = ctx.createLinearGradient(0, SOL_TOP, 0, TABLE_Y);
  h.addColorStop(0,    'rgba(255,255,255,0.22)');
  h.addColorStop(0.15, 'rgba(255,255,255,0)');
  h.addColorStop(0.7,  'rgba(0,30,60,0)');
  h.addColorStop(1,    'rgba(0,30,60,0.12)');
  ctx.fillStyle = h;
  ctx.fill();
}

// Intérieur du bécher, de la hauteur yHaut jusqu'au fond (coins arrondis
// comme le trait du verre)
function _cheminInterieur(ctx, yHaut) {
  ctx.beginPath();
  ctx.moveTo(BECHER_L, yHaut);
  ctx.lineTo(BECHER_L, TABLE_Y - 1);
  ctx.quadraticCurveTo(BECHER_L, TABLE_Y, BECHER_L + 1, TABLE_Y);
  ctx.lineTo(BECHER_R - 1, TABLE_Y);
  ctx.quadraticCurveTo(BECHER_R, TABLE_Y, BECHER_R, TABLE_Y - 1);
  ctx.lineTo(BECHER_R, yHaut);
  ctx.closePath();
}

function _dessinerVerre(ctx) {
  ctx.strokeStyle = '#6f7f8c';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  // Bord à bec verseur à gauche
  ctx.moveTo(BECHER_L - 1.6, BECHER_TOP - 0.8);
  ctx.quadraticCurveTo(BECHER_L, BECHER_TOP, BECHER_L, BECHER_TOP + 2);
  ctx.lineTo(BECHER_L, TABLE_Y - 1);
  ctx.quadraticCurveTo(BECHER_L, TABLE_Y, BECHER_L + 1, TABLE_Y);
  ctx.lineTo(BECHER_R - 1, TABLE_Y);
  ctx.quadraticCurveTo(BECHER_R, TABLE_Y, BECHER_R, TABLE_Y - 1);
  ctx.lineTo(BECHER_R, BECHER_TOP);
  ctx.stroke();
  // Graduations
  ctx.strokeStyle = 'rgba(111,127,140,0.7)';
  ctx.lineWidth = 0.25;
  for (var i = 1; i <= 4; i++) {
    var y = TABLE_Y - i * 7.5;
    ctx.beginPath();
    ctx.moveTo(BECHER_L + 1, y); ctx.lineTo(BECHER_L + (i % 2 ? 3 : 4.5), y);
    ctx.stroke();
  }
}

// ── Lame métallique ───────────────────────────────────────────────────
function _dessinerLame(ctx) {
  var M = METAUX[sim.metal];
  var base = couleurRGB(M.atome);
  var x0 = lame.x - LAME_W / 2;
  var top = lame.yb - LAME_H;
  var p = aspectDepot();
  var hMouillee = Math.min(lame.mouillee, LAME_H - 6);
  var yMouillee = lame.yb - hMouillee;

  // Partie sèche : reflet métallique vertical
  ctx.fillStyle = _degradeMetal(ctx, x0, LAME_W, base, 0);
  ctx.fillRect(x0, top, LAME_W, LAME_H - hMouillee);

  // Partie mouillée : rongée (plus étroite) et ternie à mesure que le
  // métal s'oxyde. Bas légèrement arrondi par l'attaque.
  if (hMouillee > 0) {
    var ins = LAME_W * 0.12 * p;
    ctx.fillStyle = _degradeMetal(ctx, x0, LAME_W, base, -0.22 * p);
    ctx.beginPath();
    ctx.moveTo(x0 + ins, yMouillee);
    ctx.lineTo(x0 + LAME_W - ins, yMouillee);
    ctx.lineTo(x0 + LAME_W - ins, lame.yb - ins);
    ctx.quadraticCurveTo(x0 + LAME_W - ins, lame.yb, x0 + LAME_W - 2 * ins, lame.yb);
    ctx.lineTo(x0 + 2 * ins, lame.yb);
    ctx.quadraticCurveTo(x0 + ins, lame.yb, x0 + ins, lame.yb - ins);
    ctx.closePath();
    ctx.fill();
  }

  // Contour
  ctx.strokeStyle = rgbCss(nuance(base, -0.45));
  ctx.lineWidth = 0.25;
  ctx.strokeRect(x0, top, LAME_W, LAME_H - hMouillee);

  if (hMouillee > 0 && p > 0) _dessinerDepot(ctx, x0, top, yMouillee, hMouillee, p);

  // Pince (prise en main) en haut de la lame
  ctx.fillStyle = '#4a525c';
  ctx.strokeStyle = '#2c3238';
  ctx.lineWidth = 0.25;
  ctx.beginPath();
  ctx.rect(lame.x - LAME_W / 2 - 0.7, top - 1.2, LAME_W + 1.4, 4.2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#8a929c';
  ctx.fillRect(lame.x - LAME_W / 2 - 0.2, top - 0.6, LAME_W + 0.4, 0.7);
}

function _degradeMetal(ctx, x0, w, base, assomb) {
  var c = nuance(base, assomb);
  var g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
  g.addColorStop(0,    rgbCss(nuance(c, -0.18)));
  g.addColorStop(0.35, rgbCss(nuance(c, 0.35)));
  g.addColorStop(0.6,  rgbCss(c));
  g.addColorStop(1,    rgbCss(nuance(c, -0.25)));
  return g;
}

// ── Dépôt du métal formé (celui des ions de la solution) ──────────────
// p : aspect (aspectDepot). La texture couvre toute la hauteur de la lame ;
// seule la partie mouillée est montrée.
function _dessinerDepot(ctx, x0, top, yHaut, h, p) {
  var D = METAUX[sim.solution];
  var col = couleurRGB(D.atome);
  var motif = macro.motif;
  var i, t;

  _majTextureDepot(p);
  var xT = x0 - LAME_W * DEBORD, wT = LAME_W * (1 + 2 * DEBORD);
  ctx.save();
  ctx.beginPath();
  ctx.rect(xT, yHaut, wT, h);
  ctx.clip();
  ctx.drawImage(macro.texture.canvas, xT, top, wT, LAME_H);
  ctx.restore();

  // Cristaux en aiguilles (« arbre de Diane » pour l'argent, « arbre de
  // Saturne » pour le plomb) qui poussent depuis les bords de la lame
  if (D.depot === 'aiguilles') {
    ctx.strokeStyle = rgbCss(D.sym === 'Ag' ? nuance(col, -0.1) : nuance(col, -0.15));
    ctx.lineCap = 'round';
    for (i = 0; i < motif.aiguilles.length; i++) {
      t = motif.aiguilles[i];
      var g = (p - t.seuil) / (1 - t.seuil);
      if (g <= 0) continue;
      var L = t.long * g;
      var xa = t.gauche ? x0 : x0 + LAME_W;
      var ya = yHaut + t.v * h;
      var xb = xa + Math.cos(t.angle) * L, yb = ya + Math.sin(t.angle) * L;
      ctx.lineWidth = 0.32;
      ctx.beginPath();
      ctx.moveTo(xa, ya); ctx.lineTo(xb, yb);
      ctx.stroke();
      // Ramifications
      ctx.lineWidth = 0.22;
      for (var b = 1; b <= t.branches; b++) {
        var f = b / (t.branches + 1);
        var xm = xa + (xb - xa) * f, ym = ya + (yb - ya) * f;
        var ang = t.angle + (b % 2 ? 0.7 : -0.7);
        var lb = L * 0.35 * (1 - f * 0.5);
        ctx.beginPath();
        ctx.moveTo(xm, ym);
        ctx.lineTo(xm + Math.cos(ang) * lb, ym + Math.sin(ang) * lb);
        ctx.stroke();
      }
    }
  }
}

// ── Poudre tombée au fond du bécher ───────────────────────────────────
// Le dépôt peu adhérent se détache (comme les amas qui tombent dans la
// loupe) et s'accumule sous la lame en un petit tas de la couleur du métal
// formé. Il apparaît une fois que la lame porte du dépôt, grossit avec
// l'aspect et reste quand la lame est retirée. Dessiné avant le voile : on
// le voit à travers la solution.
var POUDRE_DEBUT = 0.15;          // aspect à partir duquel de la poudre tombe
var POUDRE_H = 2.2;               // hauteur du tas complet
var POUDRE_L0 = 2.5, POUDRE_L1 = 6.5;   // demi-largeur du tas, au début et à la fin

function _dessinerPoudre(ctx) {
  var q = (aspectDepot() - POUDRE_DEBUT) / (1 - POUDRE_DEBUT);
  if (q <= 0) return;
  var col = _couleurDepot();
  var xc = SLOT_X, base = TABLE_Y - 0.3;
  var L = POUDRE_L0 + (POUDRE_L1 - POUDRE_L0) * q;
  var H = POUDRE_H * Math.sqrt(q);
  // Profil en cloche aplatie : y = base − H·(1 − u²)², u = (x − xc) / L
  function haut(u) { var s = 1 - u * u; return s > 0 ? H * s * s : 0; }

  if (H > 0.05) {
    ctx.beginPath();
    ctx.moveTo(xc - L, base);
    for (var k = 1; k < 24; k++) {
      var u = -1 + 2 * k / 24;
      ctx.lineTo(xc + u * L, base - haut(u));
    }
    ctx.lineTo(xc + L, base);
    ctx.closePath();
    var g = ctx.createLinearGradient(0, base - H, 0, base);
    g.addColorStop(0, rgbCss(nuance(col, 0.08)));
    g.addColorStop(1, rgbCss(nuance(col, -0.18)));
    ctx.fillStyle = g;
    ctx.fill();
  }

  // Grains : dans le tas (relief) et épars autour
  var grains = macro.motif.grains;
  for (var i = 0; i < grains.length; i++) {
    var t = grains[i];
    var a = (q - t.seuil) / 0.1;
    if (a <= 0) continue;
    var y = base - t.v * haut(t.u) - t.r * 0.5;
    ctx.fillStyle = rgbCss(nuance(col, t.teinte), Math.min(1, a));
    ctx.beginPath();
    ctx.arc(xc + t.u * L, y, t.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Étiquettes ────────────────────────────────────────────────────────
function _dessinerEtiquettes(ctx) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#2c3e50';
  // Lame : étiquette au-dessus de la pince, elle suit la lame
  texteEchelle(ctx, 'Lame ' + METAUX[sim.metal].de, lame.x, lame.yb - LAME_H - 2.4, 3.1, '600', disp.k);

  // Solution : sous le bécher
  var S = METAUX[sim.solution];
  texteEchelle(ctx, 'Solution de ' + S.nomSolution, BECHER_CX, TABLE_Y + 6.8, 3.1, '600', disp.k);
  ctx.fillStyle = '#7a8a96';
  texteEchelle(ctx, '(' + ionTexte(S.sym) + ' + ' + anionTexte(S.anion) + ')',
               BECHER_CX, TABLE_Y + 10.2, 2.7, '400', disp.k);
}

// ══════════════════════════════════════════════════════════════════════
//  Glisser-déposer de la lame
//  La lame ne traverse pas les parois du bécher : elle n'y entre que par
//  le haut, où elle est alors guidée verticalement à sa place.
// ══════════════════════════════════════════════════════════════════════

var _drag = null;   // { dx, dy, x0, y0, bouge }

function _surLame(x, y) {
  var m = 1.2;
  return x >= lame.x - LAME_W / 2 - m && x <= lame.x + LAME_W / 2 + m &&
         y >= lame.yb - LAME_H - 1.5 - m && y <= lame.yb + m;
}

// Renvoient true si l'événement concerne la lame
function becherPointerDown(px, py) {
  var p = pxVersScene(px, py);
  if (!_surLame(p.x, p.y)) return false;
  lame.chemin = null;
  _drag = { dx: p.x - lame.x, dy: p.y - lame.yb, x0: p.x, y0: p.y, bouge: false };
  return true;
}

function becherPointerMove(px, py) {
  var p = pxVersScene(px, py);
  if (!_drag) return _surLame(p.x, p.y);
  if (Math.abs(p.x - _drag.x0) + Math.abs(p.y - _drag.y0) > 0.8) _drag.bouge = true;
  if (!_drag.bouge) return true;

  var x  = Math.max(LAME_W / 2 + 1, Math.min(SCENE_W - LAME_W / 2 - 1, p.x - _drag.dx));
  var yb = Math.max(LAME_H + 6, Math.min(REPOS_YB, p.y - _drag.dy));

  var ouverture = Math.abs(x - SLOT_X) < BECHER_W * 0.42;
  if (lame.dansBecher) {
    if (yb <= BECHER_TOP - 0.5) {
      lame.dansBecher = false;                  // ressortie par le haut
    } else {
      x = SLOT_X;
      yb = Math.min(yb, IMM_YB);
    }
  } else {
    var auDessus = x + LAME_W / 2 > BECHER_L - 0.6 && x - LAME_W / 2 < BECHER_R + 0.6;
    if (auDessus && yb > BECHER_TOP - 0.5) {
      if (ouverture && lame.yb <= BECHER_TOP) {
        lame.dansBecher = true;                 // entrée par le haut
        x = SLOT_X;
        yb = Math.min(yb, IMM_YB);
      } else {
        yb = BECHER_TOP - 0.5;                  // bloquée par le bord
      }
    }
  }
  lame.x = x; lame.yb = yb;
  sim.needsRedraw = true;
  return true;
}

function becherPointerUp() {
  if (!_drag) return false;
  var clic = !_drag.bouge;
  _drag = null;
  if (clic) {
    // Simple clic sur la lame : même effet que le bouton
    if (lame.cible === 'becher') retirerLame(); else plongerLame();
  } else if (lame.dansBecher) {
    plongerLame();              // lâchée dans le bécher : descend à sa place
  } else {
    retirerLame();              // lâchée ailleurs : retourne dans son support
  }
  return true;
}

function becherEnGlissement() { return _drag !== null && _drag.bouge; }
