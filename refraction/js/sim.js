// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  sim.js — État global, milieux et lois de l'optique (réflexion,
//  réfraction, coefficients de Fresnel, dispersion et tracé dans le prisme)
//  Chargé en PREMIER : ne dépend d'aucun autre fichier.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ══════════════════════════════════════════════════════════════════════
//  Milieux prédéfinis
// ══════════════════════════════════════════════════════════════════════
// n : indice affiché et utilisé dans l'onglet Snell-Descartes (raie jaune
//     du sodium, 589 nm — valeurs usuelles des manuels).
// A, B : coefficients de la loi de Cauchy n(λ) = A + B / λ² (λ en µm),
//     réservés à l'onglet Prisme (dispersion). Choisis pour que
//     n(0,589 µm) retombe sur n à 0,01 près.
var MILIEUX = [
  { id: 'vide',      nom: 'Vide',          n: 1.00, A: 1.0000, B: 0       },
  { id: 'air',       nom: 'Air',           n: 1.00, A: 1.0000, B: 0       },
  { id: 'eau',       nom: 'Eau',           n: 1.33, A: 1.3199, B: 0.00405 },
  { id: 'ethanol',   nom: 'Éthanol',       n: 1.36, A: 1.3500, B: 0.00350 },
  { id: 'huile',     nom: 'Huile',         n: 1.47, A: 1.4580, B: 0.00450 },
  { id: 'plexiglas', nom: 'Plexiglas',     n: 1.49, A: 1.4780, B: 0.00400 },
  { id: 'verre',     nom: 'Verre',         n: 1.52, A: 1.5046, B: 0.00420 },
  { id: 'flint',     nom: 'Verre flint',   n: 1.62, A: 1.5960, B: 0.00900 },
  { id: 'diamant',   nom: 'Diamant',       n: 2.42, A: 2.3780, B: 0.01370 }
];

// Identifiant de l'entrée « Personnalisé » du sélecteur (indice saisi)
var MILIEU_PERSO = 'perso';

// Bornes de l'indice saisi librement
var N_MIN = 1.00;
var N_MAX = 3.00;

function milieuParId(id) {
  for (var k = 0; k < MILIEUX.length; k++) {
    if (MILIEUX[k].id === id) return MILIEUX[k];
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════
//  État de la simulation
// ══════════════════════════════════════════════════════════════════════

// Mode de l'onglet Snell-Descartes : 'milieux' (deux demi-plans) ou
// 'disque' (demi-disque posé sur un rapporteur)
var modeSnell = 'milieux';

// ── Mode « Deux milieux » ─────────────────────────────────────────────
// Le laser est toujours dans le milieu 1 (moitié haute).
// i    : angle d'incidence en degrés (0 à 90, au dixième)
// cote : +1 laser à gauche de la normale, −1 à droite
var simDM = {
  m1: { id: 'air', n: 1.00 },
  m2: { id: 'eau', n: 1.33 },
  i: 30,
  cote: 1
};

// ── Mode « Demi-disque » ──────────────────────────────────────────────
// Trois objets indépendants qui tournent autour du même centre C (milieu
// de la face plane). Angles en degrés, repère du canvas (y vers le bas :
// 90° pointe vers le BAS de l'écran, −90° vers le haut).
// laser : direction C → laser
// disque : direction de la normale qui entre dans le plexiglas (vers la
//          face courbe) — 90° : face plane horizontale, disque en dessous
// rappo  : direction de l'axe 0° du rapporteur
var DD_DEFAUT = { laser: -120, disque: 90, rappo: 90, n: 1.49 };
var simDD = {
  laser:  DD_DEFAUT.laser,
  disque: DD_DEFAUT.disque,
  rappo:  DD_DEFAUT.rappo,
  n:      DD_DEFAUT.n
};

// ── Options d'affichage (communes aux deux modes) ─────────────────────
// Masquer le rayon incident masque aussi le laser ; l'angle d'un rayon
// masqué n'est pas tracé.
var affichage = {
  normale:   true,
  rayonInc:  true,
  rayonRefl: true,
  rayonRefr: true,
  angles:    true,
  valeurs:   true
};

// ── Onglet Prisme ─────────────────────────────────────────────────────
// Positions en unités « m » (moitié du plus petit côté du canvas),
// relatives au centre de gravité G du prisme ; angles en degrés, repère du
// canvas (y vers le bas).
// source : 'blanche' ou 'mono' ; lambda : longueur d'onde (nm) en mono
// milieu : matériau du prisme (id de MILIEUX) ; A : angle au sommet
// rot    : rotation du prisme autour de G (0 : sommet en haut)
// sx, sy : point d'émission de la source ; dir : direction du faisceau
// Par défaut, le faisceau frappe le milieu de la face gauche à peu près au
// minimum de déviation du flint (sortie symétrique de l'entrée).
var PR_DEFAUT = { A: 60, rot: 0, sx: -0.77, sy: 0.14, dir: -24 };
var simPR = {
  source: 'blanche',
  lambda: 589,
  milieu: 'flint',
  A:   PR_DEFAUT.A,
  rot: PR_DEFAUT.rot,
  sx:  PR_DEFAUT.sx,
  sy:  PR_DEFAUT.sy,
  dir: PR_DEFAUT.dir
};

// Matériaux proposés pour le prisme (l'air et le vide ne dispersent pas)
var PR_MATERIAUX = ['eau', 'ethanol', 'huile', 'plexiglas', 'verre', 'flint', 'diamant'];

// Longueur des deux côtés égaux du prisme (unités m)
var PR_COTE = 0.8;

// Domaine visible retenu (nm)
var LAMBDA_MIN = 400;
var LAMBDA_MAX = 700;

// Options d'affichage de l'onglet Prisme
// spectre : 'continu' (toutes les couleurs) ou 'discret' (rouge, orange,
// jaune, vert, bleu, violet) — pour la lumière blanche seulement
var affichagePR = {
  normales: false,
  spectre:  'continu'
};

// ══════════════════════════════════════════════════════════════════════
//  Outils angulaires
// ══════════════════════════════════════════════════════════════════════

var DEG = Math.PI / 180;

// Ramène un angle (degrés) dans ]−180 ; 180]
function normDeg(a) {
  a = a % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

// Arrondi au dixième de degré (précision de tous les réglages)
function auDixieme(a) {
  return Math.round(a * 10) / 10;
}

// Calage « magnétique » : si a est à moins de `tol` degrés d'un multiple
// de `pas`, il s'y colle ; sinon il est arrondi au dixième.
function aimanter(a, pas, tol) {
  var cible = Math.round(a / pas) * pas;
  if (Math.abs(a - cible) <= tol) return cible;
  return auDixieme(a);
}

// ══════════════════════════════════════════════════════════════════════
//  Lois de l'optique
// ══════════════════════════════════════════════════════════════════════

// Loi de la réfraction n1·sin i = n2·sin r.
// Renvoie { tir: true } en cas de réflexion totale, sinon { tir: false, r }
// (angles en degrés).
function refracter(n1, n2, iDeg) {
  var s = n1 / n2 * Math.sin(iDeg * DEG);
  if (s > 1 + 1e-12) return { tir: true, r: null };
  return { tir: false, r: Math.asin(Math.min(1, s)) / DEG };
}

// Angle limite (degrés) pour un passage de n1 vers n2, null si n1 ≤ n2
function angleLimite(n1, n2) {
  if (n1 <= n2) return null;
  return Math.asin(n2 / n1) / DEG;
}

// Part de l'énergie lumineuse réfléchie (formules de Fresnel, lumière non
// polarisée). Vaut 1 en réflexion totale, 0 si n1 = n2.
function fresnelR(n1, n2, iDeg) {
  var ci = Math.cos(iDeg * DEG);
  var s  = n1 / n2 * Math.sin(iDeg * DEG);
  if (s >= 1) return 1;
  var ct = Math.sqrt(1 - s * s);
  var rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct);
  var rp = (n1 * ct - n2 * ci) / (n1 * ct + n2 * ci);
  return (rs * rs + rp * rp) / 2;
}

// ══════════════════════════════════════════════════════════════════════
//  Géométrie des rayons (vecteurs unitaires, repère du canvas)
// ══════════════════════════════════════════════════════════════════════
// Tous les rayons partent du point d'incidence : le rayon incident y
// arrive, les rayons réfléchi et réfracté en repartent. Les directions sont
// donc toutes exprimées DEPUIS ce point.

function vDir(aDeg) { return { x: Math.cos(aDeg * DEG), y: Math.sin(aDeg * DEG) }; }
function vDot(a, b) { return a.x * b.x + a.y * b.y; }
function vNorm(a) {
  var l = Math.hypot(a.x, a.y);
  return l > 1e-12 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

// nInc : normale unitaire dirigée vers le milieu d'incidence (milieu 1)
// u    : direction unitaire point d'incidence → laser (côté milieu 1)
// Renvoie les angles (degrés), les directions des rayons réfléchi et
// réfracté, la part d'énergie réfléchie R et le vecteur tangent tHat
// (côté du rayon incident par rapport à la normale).
function construireRayons(nInc, u, n1, n2) {
  var cosI = Math.max(-1, Math.min(1, vDot(u, nInc)));
  var i = Math.acos(cosI) / DEG;
  var tHat = vNorm({ x: u.x - nInc.x * cosI, y: u.y - nInc.y * cosI });
  if (tHat.x === 0 && tHat.y === 0) tHat = { x: -nInc.y, y: nInc.x };

  // Réflexion : symétrique du rayon incident par rapport à la normale
  var uRefl = { x: 2 * cosI * nInc.x - u.x, y: 2 * cosI * nInc.y - u.y };

  // Réfraction : le rayon traverse le dioptre et passe de l'autre côté de
  // la normale, avec n1·sin i = n2·sin r
  var res = refracter(n1, n2, i);
  var uRefr = null;
  if (!res.tir) {
    var cr = Math.cos(res.r * DEG), sr = Math.sin(res.r * DEG);
    uRefr = { x: -nInc.x * cr - tHat.x * sr, y: -nInc.y * cr - tHat.y * sr };
  }

  return {
    n1: n1, n2: n2,
    i: i, tir: res.tir, r: res.r,
    R: fresnelR(n1, n2, i),
    nInc: nInc, u: u, uRefl: uRefl, uRefr: uRefr, tHat: tHat
  };
}

// Scène du mode « Deux milieux » : dioptre horizontal, milieu 1 en haut
function sceneMilieux() {
  var s = simDM.i * DEG;
  var nInc = { x: 0, y: -1 };
  var u = { x: -simDM.cote * Math.sin(s), y: -Math.cos(s) };
  return construireRayons(nInc, u, simDM.m1.n, simDM.m2.n);
}

// Scène du mode « Demi-disque ». Le laser vise toujours le centre de la
// face plane, si bien que tout se joue en ce point :
//  · laser côté air : le rayon arrive sur la face plane (air → plexiglas),
//    le rayon réfracté ressort par la face courbe selon un rayon du disque,
//    donc sans déviation ;
//  · laser côté face courbe : le rayon entre selon un rayon du disque, sans
//    déviation, et atteint la face plane depuis le plexiglas
//    (plexiglas → air), d'où la réflexion totale possible.
// Les réflexions partielles sur la face courbe sont ignorées.
function sceneDisque() {
  var nIn = vDir(simDD.disque);   // normale vers l'intérieur du plexiglas
  var u = vDir(simDD.laser);
  var cotePlexi = vDot(u, nIn) > 1e-9;
  var sc = cotePlexi
    ? construireRayons(nIn, u, simDD.n, 1.00)
    : construireRayons({ x: -nIn.x, y: -nIn.y }, u, 1.00, simDD.n);
  sc.cotePlexi = cotePlexi;
  return sc;
}

// ══════════════════════════════════════════════════════════════════════
//  Onglet Prisme : dispersion et tracé des rayons
// ══════════════════════════════════════════════════════════════════════

// Indice d'un milieu pour la longueur d'onde lambda (nm), loi de Cauchy
function indiceCauchy(m, lambdaNm) {
  var l = lambdaNm / 1000;
  return m.A + m.B / (l * l);
}

// Sommets du prisme : sommet principal, puis base droite, puis base gauche
// (avant rotation) — sens horaire à l'écran, y vers le bas.
function sommetsPrisme(G, cote, Adeg, rotDeg) {
  var a = Adeg * DEG / 2;
  var h = cote * Math.cos(a), demiBase = cote * Math.sin(a);
  // Centre de gravité aux 2/3 de la hauteur issue du sommet
  var loc = [
    { x: 0,         y: -2 * h / 3 },
    { x:  demiBase, y:  h / 3 },
    { x: -demiBase, y:  h / 3 }
  ];
  var c = Math.cos(rotDeg * DEG), s = Math.sin(rotDeg * DEG);
  return loc.map(function (p) {
    return { x: G.x + p.x * c - p.y * s, y: G.y + p.x * s + p.y * c };
  });
}

// Intersection de la demi-droite S + t·d (t > 0) avec le segment [a, b] :
// renvoie t, ou null
function _interSegment(S, d, a, b) {
  var ex = b.x - a.x, ey = b.y - a.y;
  var den = d.x * ey - d.y * ex;
  if (Math.abs(den) < 1e-12) return null;
  var wx = a.x - S.x, wy = a.y - S.y;
  var t = (wx * ey - wy * ex) / den;
  var v = (wx * d.y - wy * d.x) / den;
  if (t <= 1e-7 || v < 0 || v > 1) return null;
  return t;
}

function _deviation(d0, d) {
  return Math.acos(Math.max(-1, Math.min(1, vDot(d0, d)))) / DEG;
}

// Suit un rayon depuis la source S (direction unitaire d) à travers le
// prisme d'indice n, jusqu'à l'écran ou jusqu'au loin.
// sommets : triangle (sens horaire à l'écran) ; ecran : { x, y0, y1 },
// segment vertical qui arrête la lumière ; loin : longueur du dernier
// segment quand il n'atteint pas l'écran.
// Les réflexions partielles sont ignorées ; la réflexion totale est
// suivie (le rayon peut rebondir plusieurs fois dans le prisme).
// Renvoie { pts, cle, i, D, tir, yEcran } :
//  · cle : suite des faces rencontrées (+ 'r' à chaque réflexion totale,
//    puis 'E' écran, 'X' au loin, 'P' prisonnier) — deux rayons de même
//    clé suivent le même chemin, on peut remplir l'éventail entre eux ;
//  · i : incidence sur la face d'entrée (null si le prisme est manqué) ;
//  · D : déviation totale, angle entre rayons incident et émergent.
function tracerRayon(S, d, n, sommets, ecran, loin) {
  var pts = [{ x: S.x, y: S.y }];
  var cle = '', dedans = false, i = null, tir = false;
  var P = { x: S.x, y: S.y }, dir = { x: d.x, y: d.y };

  for (var rebond = 0; rebond < 12; rebond++) {
    // Face la plus proche
    var tMin = Infinity, face = -1;
    for (var k = 0; k < 3; k++) {
      var t = _interSegment(P, dir, sommets[k], sommets[(k + 1) % 3]);
      if (t !== null && t < tMin) { tMin = t; face = k; }
    }
    // L'écran (toujours hors du prisme) arrête la lumière s'il est avant
    var tE = dedans ? null
      : _interSegment(P, dir, { x: ecran.x, y: ecran.y0 }, { x: ecran.x, y: ecran.y1 });
    if (tE !== null && tE < tMin) {
      pts.push({ x: P.x + dir.x * tE, y: P.y + dir.y * tE });
      return { pts: pts, cle: cle + 'E', i: i, tir: tir, yEcran: P.y + dir.y * tE,
               D: i === null ? null : _deviation(d, dir) };
    }
    if (face < 0) break;

    P = { x: P.x + dir.x * tMin, y: P.y + dir.y * tMin };
    pts.push(P);
    cle += face;

    // Normale sortante de la face (sommets en sens horaire à l'écran)
    var a = sommets[face], b = sommets[(face + 1) % 3];
    var nOut = vNorm({ x: b.y - a.y, y: a.x - b.x });
    var u = { x: -dir.x, y: -dir.y };       // vers le milieu d'incidence
    var sc;
    if (!dedans) {
      sc = construireRayons(nOut, u, 1.00, n);
      if (i === null) i = sc.i;
      dir = sc.uRefr;
      dedans = true;
    } else {
      sc = construireRayons({ x: -nOut.x, y: -nOut.y }, u, n, 1.00);
      if (sc.tir) { dir = sc.uRefl; cle += 'r'; tir = true; }
      else { dir = sc.uRefr; dedans = false; }
    }
  }

  // Rayon prisonnier du prisme (rebonds en série) : on s'arrête là
  if (dedans) return { pts: pts, cle: cle + 'P', i: i, tir: tir, yEcran: null, D: null };

  pts.push({ x: P.x + dir.x * loin, y: P.y + dir.y * loin });
  return { pts: pts, cle: cle + 'X', i: i, tir: tir, yEcran: null,
           D: i === null ? null : _deviation(d, dir) };
}

// ══════════════════════════════════════════════════════════════════════
//  Formatage
// ══════════════════════════════════════════════════════════════════════

// Nombre à la française (virgule décimale)
function fmtFr(x, d) {
  var s = x.toFixed(d);
  if (parseFloat(s) === 0) s = s.replace('-', '');   // pas de « −0,0 »
  return s.replace('.', ',').replace('-', '−');
}

// Lecture d'un indice saisi au clavier (accepte la virgule)
function lireIndice(txt) {
  var v = parseFloat(String(txt).replace(',', '.'));
  return isFinite(v) ? v : NaN;
}
