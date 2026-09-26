// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  sim.js — État global, modèle des voitures et utilitaires
//  Chargé en PREMIER. Ne dépend de rien.
//
//  Principe de la page : une à trois voitures roulent en ligne droite
//  sur une piste vue du dessus, chacune avec une accélération CONSTANTE.
//  Leur mouvement est entièrement fixé par les conditions initiales
//  (x₀, vₓ₀, aₓ) : x(t) = ½·aₓ·t² + vₓ₀·t + x₀. Le graphe x(t) s'écrit
//  pendant la course, chaque voiture tenue à la hauteur de son point de
//  courbe — c'est le principe du décollage de fusée de la page Dérivée.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ══════════════════════════════════════════════════════════════════════
//  Voitures : couleurs, valeurs par défaut, bornes des saisies
// ══════════════════════════════════════════════════════════════════════

var NB_VOITURES_MAX = 3;

// Une couleur par emplacement : la voiture, sa courbe et sa carte dans le
// panneau la partagent. `fonce` sert aux contours et aux vitres, `clair`
// aux reflets de la carrosserie.
var COUL_VOITURES = [
  { coul: '#2a6aaa', fonce: '#17416c', clair: '#6d9fd2' },   // bleu
  { coul: '#c05020', fonce: '#7a2e0e', clair: '#e08a5c' },   // terracotta
  { coul: '#2a8a50', fonce: '#15532e', clair: '#6cbf8c' }    // vert
];

// Conditions initiales proposées pour chaque emplacement : la première
// voiture roule à vitesse constante, la deuxième démarre arrêtée et
// accélère, la troisième part vite et freine. Trois allures de courbe
// différentes dès qu'on ajoute les voitures.
var VOITURES_DEFAUT = [
  { x0: 9, v0: 2, a: 0 },
  { x0: 0, v0: 0, a: 0.5 },
  { x0: 0, v0: 5, a: -0.1 }
];

// Bornes des saisies. x₀ est borné par la longueur de piste (cf. bornes()).
var BORNES = {
  v0: { min: -20, max: 20 },
  a:  { min: -5,  max: 5 },
  L:  { min: 20,  max: 200 }
};

// Dimensions réelles d'une voiture (m) : elle est dessinée à l'échelle de
// la piste — plafonnée seulement à la largeur de sa file (cf. piste.js).
var VOITURE_LONGUEUR = 4;
var VOITURE_LARGEUR  = 1.8;

// ══════════════════════════════════════════════════════════════════════
//  État global
// ══════════════════════════════════════════════════════════════════════

var sim = {
  L: 100,                 // longueur de piste : position de la ligne d'arrivée (m)
  voitures: [],           // [{x0, v0, a}] — rempli par chargeDefaut()
  mode: 'x',              // graphe affiché : 'x' | 'v' | 'a'

  t: 0,                   // date courante de la course (s)
  play: false,
  fini: false,
  speed: 1,

  tangente: false,        // mode tangente (clic sur une courbe)
  reticule: false,        // réticule libre
  tangentesFig: []        // tangentes figées : [{idx, t}]
};

var needsDraw = true;
function requestDraw() { needsDraw = true; }

function chargeDefaut() {
  sim.L = 100;
  sim.voitures = [clone(VOITURES_DEFAUT[0])];
}

function clone(o) { return { x0: o.x0, v0: o.v0, a: o.a }; }

// ══════════════════════════════════════════════════════════════════════
//  Mouvement uniformément varié
// ══════════════════════════════════════════════════════════════════════

function posX(v, t) { return v.x0 + v.v0 * t + 0.5 * v.a * t * t; }
function vitX(v, t) { return v.v0 + v.a * t; }
function accX(v)    { return v.a; }

// Grandeur portée par le graphe courant.
function valeurMode(v, t, mode) {
  mode = mode || sim.mode;
  if (mode === 'v') return vitX(v, t);
  if (mode === 'a') return accX(v);
  return posX(v, t);
}

// Pente de la tangente à la courbe du graphe courant : la dérivée
// ANALYTIQUE, pas une différence finie — c'est précisément ce que l'élève
// doit retrouver (pente de x(t) = vₓ, pente de vₓ(t) = aₓ).
function penteMode(v, t, mode) {
  mode = mode || sim.mode;
  if (mode === 'x') return vitX(v, t);
  if (mode === 'v') return accX(v);
  return 0;
}

// ══════════════════════════════════════════════════════════════════════
//  Piste : étendue, arrivée, sortie
// ══════════════════════════════════════════════════════════════════════

// Marge visible sous la ligne de départ et au-delà de l'arrivée. Elle doit
// au moins contenir une voiture posée en x = 0 : repérée par son centre,
// elle dépasse de 2 m en arrière de la ligne.
function margePiste() { return Math.max(5, 0.07 * sim.L); }
function xMinPiste()  { return -margePiste(); }
function xMaxPiste()  { return sim.L + margePiste(); }

// Plus petite racine STRICTEMENT positive de A·t² + B·t + C = 0, ou
// Infinity s'il n'y en a pas.
function premiereRacine(A, B, C) {
  var eps = 1e-12, r = [];
  if (Math.abs(A) < eps) {
    if (Math.abs(B) > eps) r.push(-C / B);
  } else {
    var d = B * B - 4 * A * C;
    if (d >= 0) {
      var sd = Math.sqrt(d);
      // Forme stable (pas de soustraction de deux nombres voisins).
      var q = -0.5 * (B + (B >= 0 ? sd : -sd));
      r.push(q / A);
      if (Math.abs(q) > eps) r.push(C / q);
    }
  }
  var best = Infinity;
  r.forEach(function (t) { if (t > eps && t < best) best = t; });
  return best;
}

// Date à laquelle le centre de la voiture franchit la ligne d'arrivée.
function tArrivee(v) {
  if (v.x0 >= sim.L) return 0;
  return premiereRacine(0.5 * v.a, v.v0, v.x0 - sim.L);
}

// Date à laquelle la voiture, en reculant, atteint le bas de la piste :
// elle y est déclarée sortie et s'immobilise, sa courbe s'arrête.
function tSortie(v) {
  return premiereRacine(0.5 * v.a, v.v0, v.x0 - xMinPiste());
}

// Garde-fous de la durée de course : une voiture arrêtée n'arrive jamais,
// et toutes les voitures peuvent partir de la ligne d'arrivée.
var DUREE_MIN = 2;
var DUREE_MAX = 90;

// La course s'arrête quand la DERNIÈRE voiture a fini : arrivée, ou sortie
// de piste pour celle qui recule.
function dureeCourse() {
  var d = 0;
  sim.voitures.forEach(function (v) {
    d = Math.max(d, Math.min(tArrivee(v), tSortie(v)));
  });
  return Math.max(DUREE_MIN, Math.min(DUREE_MAX, d));
}

// Date à laquelle la voiture cesse de bouger (sortie), bornée à la course.
function tFinVoiture(v) { return Math.min(tSortie(v), dureeCourse()); }

// Date effective d'une voiture à l'instant t : figée à sa sortie de piste.
function tEffectif(v, t) { return Math.min(t, tSortie(v)); }

function estSortie(v, t) { return t >= tSortie(v); }

// ══════════════════════════════════════════════════════════════════════
//  Cadrage du graphe
//  L'axe des temps couvre la course ENTIÈRE dès la première image : la
//  fenêtre ne bouge pas pendant l'animation, c'est ce qui rend visible
//  la différence entre mouvement uniforme et accéléré.
// ══════════════════════════════════════════════════════════════════════

function vueGraphe() {
  var D = dureeCourse();
  var o = { tMin: -0.03 * D, tMax: 1.08 * D };

  // En x(t), l'ordonnée est EXACTEMENT l'étendue de la piste : c'est ce qui
  // aligne chaque voiture sur son point de courbe.
  if (sim.mode === 'x') {
    o.zMin = xMinPiste();
    o.zMax = xMaxPiste();
    return o;
  }

  // En vₓ(t) et aₓ(t) : on englobe les valeurs prises pendant la course,
  // et zéro, pour que l'axe des temps reste dans la fenêtre.
  var lo = 0, hi = 0;
  sim.voitures.forEach(function (v) {
    var tf = tFinVoiture(v);
    [0, tf].forEach(function (t) {
      var y = valeurMode(v, t);
      if (isFinite(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
    });
  });
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  var m = (hi - lo) * 0.12;
  o.zMin = lo - m;
  o.zMax = hi + m;
  return o;
}

// Nom et unité de la grandeur du graphe courant.
function nomMode(mode) {
  mode = mode || sim.mode;
  return mode === 'v' ? 'vₓ' : mode === 'a' ? 'aₓ' : 'x';
}
function uniteMode(mode) {
  mode = mode || sim.mode;
  return mode === 'v' ? 'm/s' : mode === 'a' ? 'm/s²' : 'm';
}

// ══════════════════════════════════════════════════════════════════════
//  Équation horaire
// ══════════════════════════════════════════════════════════════════════

// x(t) = ½·aₓ·t² + vₓ₀·t + x₀, coefficients CALCULÉS : on n'écrit pas un
// terme nul, ni un coefficient égal à 1. Exemple : aₓ = 0, vₓ₀ = 2, x₀ = 9
// donne « x(t) = 2t + 9 ».
function equationHoraire(v) {
  var termes = [
    { c: 0.5 * v.a, s: 't²' },
    { c: v.v0,      s: 't'  },
    { c: v.x0,      s: ''   }
  ];
  var txt = '';
  termes.forEach(function (T) {
    var c = arrondi(T.c);
    if (c === 0) return;
    var a = Math.abs(c);
    var corps = (a === 1 && T.s) ? T.s : fmtNombre(a) + T.s;
    if (!txt) txt = (c < 0 ? '−' : '') + corps;
    else      txt += (c < 0 ? ' − ' : ' + ') + corps;
  });
  return 'x(t) = ' + (txt || '0');
}

// ══════════════════════════════════════════════════════════════════════
//  Utilitaires de formatage
// ══════════════════════════════════════════════════════════════════════

// Arrondi à 3 décimales : suffisant pour des saisies au centième, et
// débarrassé des résidus flottants (½ × 0,1 = 0,05000000000000001).
function arrondi(x) { return Math.round(x * 1000) / 1000; }

// Nombre « court » à la française : décimales inutiles retirées.
// 9 → « 9 », 0,5 → « 0,5 », 0.125 → « 0,125 ».
function fmtNombre(x) {
  var s = String(arrondi(x));
  if (s.indexOf('e') >= 0) s = x.toFixed(3);
  return s.replace('.', ',');
}

// Saisie clavier : virgule ou point, signe moins typographique accepté.
function parseSaisie(txt) {
  return parseFloat(String(txt).replace(',', '.').replace('−', '-').replace(/\s/g, ''));
}

// Pas « rond » donnant environ `cible` graduations sur l'étendue donnée.
function tickStep(range, cible) {
  var brut = range / (cible || 6);
  if (!(brut > 0)) return 1;
  var pow10 = Math.pow(10, Math.floor(Math.log10(brut)));
  var m = brut / pow10;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7 ? 5 : 10) * pow10;
}

// Graduation formatée à la française, avec juste les décimales du pas.
function fmtTick(v, step) {
  var dec = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step) - 1e-9));
  var s = v.toFixed(dec);
  if (parseFloat(s) === 0) s = (0).toFixed(dec);   // évite « -0 »
  return s.replace('.', ',');
}

// Nombre à décimales fixées, virgule française.
function fmtFr(x, dec) {
  if (!isFinite(x)) return '—';
  var s = x.toFixed(dec);
  if (parseFloat(s) === 0) s = (0).toFixed(dec);
  return s.replace('.', ',');
}

// Nombre de décimales adapté à l'ordre de grandeur (afficheurs, étiquettes).
function fmtSmart(x) {
  if (!isFinite(x)) return '—';
  var a = Math.abs(x);
  if (a < 0.005)  return '0';
  if (a >= 1000)  return fmtFr(x, 0);
  if (a >= 100)   return fmtFr(x, 1);
  return fmtFr(x, 2);
}

// ══════════════════════════════════════════════════════════════════════
//  Utilitaires de dessin
// ══════════════════════════════════════════════════════════════════════

// Dimensionne le canvas en pixels physiques (devicePixelRatio) et pose la
// transformation pour continuer à dessiner en pixels CSS.
// Renvoie false si le canvas est masqué (clientWidth nul) : rien à dessiner.
function sizeCanvas(canvas) {
  if (!canvas) return false;
  var dpr = window.devicePixelRatio || 1;
  var w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return false;
  var pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  return true;
}

// Facteur d'échelle des polices tracées sur un canvas : les textes
// grossissent avec la zone de tracé (lisibilité en projection).
function echelleTexte(W, H) {
  return Math.max(0.85, Math.min(1.75, Math.sqrt(W * H) / 560));
}

// Texte cerné d'un halo blanc épais : lisible par-dessus courbe et grille.
function texteCartouche(ctx, txt, x, y, couleur, font, align, baseline) {
  ctx.font = font;
  ctx.textAlign = align || 'center';
  ctx.textBaseline = baseline || 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeText(txt, x, y);
  ctx.lineWidth = 1;
  ctx.fillStyle = couleur;
  ctx.fillText(txt, x, y);
}

// Disque plein cerclé de blanc puis d'un liseré sombre.
function pastille(ctx, x, y, r, couleur) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = couleur;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(44,62,80,0.55)';
  ctx.beginPath();
  ctx.arc(x, y, r + 1, 0, Math.PI * 2);
  ctx.stroke();
}

// Petite pointe de flèche triangulaire au bout d'un axe.
// (dx, dy) est le vecteur unitaire donnant le sens de l'axe.
function pointeFleche(ctx, x, y, dx, dy, t, couleur) {
  ctx.fillStyle = couleur;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - dx * t - dy * t * 0.38, y - dy * t + dx * t * 0.38);
  ctx.lineTo(x - dx * t + dy * t * 0.38, y - dy * t - dx * t * 0.38);
  ctx.closePath();
  ctx.fill();
}

// ══════════════════════════════════════════════════════════════════════
//  Palette (charte graphique du site)
// ══════════════════════════════════════════════════════════════════════

var COUL = {
  grille:   '#e4e0d8',
  axe:      '#8a9098',
  texte:    '#2c3e50',
  label:    '#5a6a78',
  accent:   '#2a6aaa'
};
