// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  sim.js — État global, milieux et lois de l'optique (réflexion,
//  réfraction, coefficients de Fresnel)
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
//  Formatage
// ══════════════════════════════════════════════════════════════════════

// Nombre à la française (virgule décimale)
function fmtFr(x, d) {
  return x.toFixed(d).replace('.', ',').replace('-', '−');
}

// Lecture d'un indice saisi au clavier (accepte la virgule)
function lireIndice(txt) {
  var v = parseFloat(String(txt).replace(',', '.'));
  return isFinite(v) ? v : NaN;
}
