// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  sim.js — État global, catalogue de fonctions et utilitaires
//  Chargé en PREMIER. Ne dépend de rien.
//
//  Principe de la page : sur la courbe d'une fonction f, l'élève choisit
//  un point M d'abscisse t₀, puis encadre ce point par deux points
//  A(t₀ − Δt/2) et B(t₀ + Δt/2). La pente de la sécante (AB) vaut le
//  taux de variation Δf/Δt. Quand Δt → 0, la sécante bascule sur la
//  TANGENTE en M et le taux de variation devient le nombre dérivé f′(t₀).
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ══════════════════════════════════════════════════════════════════════
//  Catalogue des fonctions étudiées
//  Chaque entrée fournit : la fonction f, sa dérivée EXACTE f′ (calcul
//  analytique, pas d'approximation numérique — c'est la valeur de
//  référence à laquelle on compare le taux de variation), le domaine
//  d'étude par défaut et la liste des paramètres réglables.
// ══════════════════════════════════════════════════════════════════════

var FONCTIONS = [

  // ── 1. Trajectoire verticale (lancer vers le haut) ─────────────────
  //    z(t) = a·t² + b·t + c — le sommet de la parabole est le point où
  //    la vitesse (donc la dérivée) s'annule : cas d'école le plus parlant.
  {
    id: 'trajectoire',
    nom: 'Trajectoire verticale',
    sousTitre: 'z(t) = a·t² + b·t + c',
    varNom: 't',  varUnite: 's',
    funNom: 'z',  funUnite: 'm',
    derivUnite: 'm/s',
    derivSens: 'vitesse',
    tMin: 0, tMax: 3,
    t0: 1.6,
    dtMax: 3,
    dt0: 0.8, // écart Δt affiché par défaut (au chargement et après « Réinitialiser »)
    zMin: 0, zMax: 55, // fenêtre verticale par défaut fixe (n'est pas recalculée sur la courbe)
    params: [
      { id: 'a', label: 'a', unite: 'm·s⁻²', min: -20, max: 20, step: 0.1, val: 3.5, dec: 1 },
      { id: 'b', label: 'b', unite: 'm·s⁻¹', min: -20, max: 20, step: 0.5, val: 0,   dec: 1 },
      { id: 'c', label: 'c', unite: 'm',     min: -50, max: 50, step: 1,   val: 30,  dec: 0 }
    ],
    f:  function (t, p) { return p.a * t * t + p.b * t + p.c; },
    df: function (t, p) { return 2 * p.a * t + p.b; }
  },

  // ── 2. Oscillateur ─────────────────────────────────────────────────
  //    x(t) = A·cos(2πt/T) — la dérivée s'annule à chaque extrémum et
  //    change de signe : lecture directe du sens de variation.
  {
    id: 'oscillateur',
    nom: 'Oscillateur',
    sousTitre: 'x(t) = A·cos(2πt / T)',
    varNom: 't',  varUnite: 's',
    funNom: 'x',  funUnite: 'cm',
    derivUnite: 'cm/s',
    derivSens: 'vitesse',
    tMin: 0, tMax: 4,
    t0: 0.5,
    dtMax: 3,
    dt0: 0.6,
    params: [
      { id: 'A', label: 'A', unite: 'cm', min: 1,   max: 6, step: 0.5,  val: 4, dec: 1 },
      { id: 'T', label: 'T', unite: 's',  min: 0.5, max: 4, step: 0.25, val: 2, dec: 2 }
    ],
    f:  function (t, p) { return p.A * Math.cos(2 * Math.PI * t / p.T); },
    df: function (t, p) {
      return -p.A * (2 * Math.PI / p.T) * Math.sin(2 * Math.PI * t / p.T);
    }
  },

  // ── 3. Décharge d'un condensateur ──────────────────────────────────
  //    u(t) = E·e^(−t/τ) — la tangente à l'origine coupe l'asymptote en
  //    t = τ : la dérivée sert ici à MESURER une grandeur physique.
  {
    id: 'condensateur',
    nom: 'Décharge d\'un condensateur',
    sousTitre: 'u(t) = E·e^(−t / τ)',
    varNom: 't',  varUnite: 's',
    funNom: 'u',  funUnite: 'V',
    derivUnite: 'V/s',
    derivSens: '',
    tMin: 0, tMax: 3,
    t0: 0.3,
    dtMax: 3,
    dt0: 0.48,
    params: [
      { id: 'E',   label: 'E', unite: 'V', min: 1,    max: 12, step: 0.5,  val: 6,   dec: 1 },
      { id: 'tau', label: 'τ', unite: 's', min: 0.15, max: 2,  step: 0.05, val: 0.5, dec: 2 }
    ],
    f:  function (t, p) { return p.E * Math.exp(-t / p.tau); },
    df: function (t, p) { return -(p.E / p.tau) * Math.exp(-t / p.tau); }
  },

  // ── 4. Fonction cube (cas purement mathématique) ───────────────────
  //    f(x) = x³ + p·x — deux extrémums quand p < 0, aucun quand p > 0 :
  //    le lien « signe de f′ ↔ sens de variation de f » est immédiat.
  {
    id: 'cube',
    nom: 'Fonction cube',
    sousTitre: 'f(x) = x³ + p·x',
    varNom: 'x',  varUnite: '',
    funNom: 'f',  funUnite: '',
    derivUnite: '',
    derivSens: '',
    tMin: -2.5, tMax: 2.5,
    t0: -0.6,
    dtMax: 3,
    dt0: 0.8,
    params: [
      { id: 'p', label: 'p', unite: '', min: -6, max: 4, step: 0.25, val: -3, dec: 2 }
    ],
    f:  function (x, p) { return x * x * x + p.p * x; },
    df: function (x, p) { return 3 * x * x + p.p; }
  }
];

// ══════════════════════════════════════════════════════════════════════
//  État global
// ══════════════════════════════════════════════════════════════════════

var sim = {
  fonIdx: 0,          // index dans FONCTIONS
  params: {},         // valeurs courantes des paramètres de la fonction

  t0: 0,              // abscisse du point d'étude M
  dt: 0.8,            // écart Δt entre les points A et B

  // Définition du taux de variation :
  //   'sym'   → [t₀ − Δt/2 ; t₀ + Δt/2], M au milieu de [AB]
  //   'avant' → [t₀ ; t₀ + Δt], A confondu avec M
  encadrement: 'sym',

  zoom: 1,            // facteur de zoom (≥ 1), centré sur M
  panT: 0, panZ: 0,   // décalage manuel de la vue (unités de la fonction)

  showTangente: false, // tangente exacte en M (en plus de la sécante)
  showCotes: true,    // cotes Δt et Δf sur le graphe
  showDeriv: false,   // graphe de la fonction dérivée (bas)
  showCoords: false,  // coordonnées du point courant rabattues sur les axes

  // Chronophotographie : le point d'étude ne se pose plus librement sur la
  // courbe, il se choisit parmi les points M₀, M₁, M₂… relevés à intervalle
  // de temps constant (cf. plus bas).
  chrono: false,
  chronoIdx: 0,       // indice du point Mᵢ sélectionné
  // Abscisse visée par l'utilisateur en chronophotographie. Distincte de
  // t0, qui est rabattu sur le relevé le plus proche : c'est elle qui sert
  // de référence quand le pas change, sinon les recalages successifs
  // feraient dériver le point (cf. chronoRecale).
  chronoAncre: 0,

  animDt: false,      // animation « Δt → 0 » en cours

  // Décollage de fusée : le graphe z(t) se construit au rythme d'une
  // animation, une image de fusée montant à côté du graphe, son centre de
  // masse aligné sur l'ordonnée z(t) lue sur la courbe.
  fusee: false,       // mode actif
  fuseeT: 0,          // date courante de l'animation (s)
  fuseePlay: false,   // animation en marche
  fuseeFini: false,   // animation arrivée au bout : la lecture reprend ses droits
  fuseeSpeed: 1       // facteur de vitesse de l'animation
};

// Vue affichée du graphe principal : centre + dimensions, en unités de la
// fonction. `vueBase` est la vue « pleine » (zoom 1, sans décalage) ;
// `vue` en est la version zoomée/décalée réellement tracée.
var vueBase = { cT: 0, cZ: 0, w: 1, h: 1 };
var vue     = { cT: 0, cZ: 0, w: 1, h: 1 };

// Le tracé n'est refait que lorsque quelque chose a changé.
var needsDraw = true;
function requestDraw() { needsDraw = true; }

// ══════════════════════════════════════════════════════════════════════
//  Accès à la fonction courante
// ══════════════════════════════════════════════════════════════════════

function fonCourante() { return FONCTIONS[sim.fonIdx]; }

// Valeur de la fonction courante.
function fVal(t) { return fonCourante().f(t, sim.params); }

// Nombre dérivé EXACT de la fonction courante.
function fDeriv(t) { return fonCourante().df(t, sim.params); }

// Abscisses des points A (gauche) et B (droite) encadrant M.
// En mode 'avant', A est confondu avec M : l'intervalle part de t₀.
function tGauche() { return sim.encadrement === 'avant' ? sim.t0 : sim.t0 - sim.dt / 2; }
function tDroite() { return sim.encadrement === 'avant' ? sim.t0 + sim.dt
                                                       : sim.t0 + sim.dt / 2; }

// Taux de variation Δf/Δt entre A et B. Quand Δt = 0, la sécante n'existe
// plus : on renvoie directement le nombre dérivé (position limite).
function tauxVariation() {
  if (sim.dt <= 0) return fDeriv(sim.t0);
  return (fVal(tDroite()) - fVal(tGauche())) / sim.dt;
}

// Étiquettes construites à partir des noms de la fonction courante :
// « Δz/Δt », « dz/dt »… — pas de chaîne codée en dur ailleurs.
function labelTaux()  { var F = fonCourante(); return 'Δ' + F.funNom + '/Δ' + F.varNom; }
function labelDeriv() { var F = fonCourante(); return 'd' + F.funNom + '/d' + F.varNom; }

// Charge les valeurs par défaut des paramètres de la fonction courante.
function chargeParamsDefaut() {
  var F = fonCourante();
  sim.params = {};
  F.params.forEach(function (p) { sim.params[p.id] = p.val; });
  sim.t0 = F.t0;
  sim.chronoAncre = F.t0;
  sim.dt = (F.dt0 !== undefined) ? F.dt0 : Math.min(sim.dt, F.dtMax);
}

// ══════════════════════════════════════════════════════════════════════
//  Vue : cadrage, zoom, décalage
// ══════════════════════════════════════════════════════════════════════

// Cadre « pleine vue » : balayage de la fonction sur son domaine d'étude
// pour englober la courbe entière avec une marge de 12 %.
function calcVueBase() {
  var F = fonCourante();
  vueBase.cT = (F.tMin + F.tMax) / 2;
  vueBase.w  = (F.tMax - F.tMin) * 1.06;

  // En décollage, la fenêtre ne se calcule plus sur les paramètres mais
  // sur ce qui est DÉJÀ ENREGISTRÉ : au départ un cadre fixe de 4 s, puis
  // un dézoom progressif à mesure que la courbe monte, jusqu'à contenir
  // tout le vol. Changer a ou b ne redimensionne donc plus rien — la
  // courbe change de pente dans une fenêtre inchangée ; seul c, qui est
  // la demi-hauteur de la fusée, modifie la taille de son image.
  if (fuseeActif()) {
    fuseeCadre();
    return;
  }

  // Fenêtre verticale fixe si la fonction en définit une (zMin/zMax) :
  // pas de recalcul sur la courbe, la vue par défaut ne bouge pas quand
  // on change les paramètres.
  if (F.zMin !== undefined && F.zMax !== undefined) {
    vueBase.cZ = (F.zMin + F.zMax) / 2;
    vueBase.h  = F.zMax - F.zMin;
    return;
  }

  var zMin = Infinity, zMax = -Infinity;
  var N = 400;
  for (var i = 0; i <= N; i++) {
    var t = F.tMin + (F.tMax - F.tMin) * i / N;
    var z = fVal(t);
    if (!isFinite(z)) continue;
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  if (!isFinite(zMin) || !isFinite(zMax)) { zMin = -1; zMax = 1; }
  var marge = (zMax - zMin) * 0.12 || 1;
  vueBase.cZ = (zMin + zMax) / 2;
  vueBase.h  = (zMax - zMin) + 2 * marge;
}

// Applique zoom et décalage à la vue de base.
// Le centre glisse progressivement du centre du cadre vers le point M :
// à zoom 1 la vue est le cadre complet, à fort zoom M est au centre —
// c'est ce recentrage qui permet de « plonger » sur le point et de voir
// la courbe se confondre avec sa tangente.
function appliqueVue() {
  // En dézoom (zoom < 1) on garde le cadrage de base : inutile de fuir M.
  var k = Math.max(0, 1 - 1 / sim.zoom);
  vue.w  = vueBase.w / sim.zoom;
  vue.h  = vueBase.h / sim.zoom;
  vue.cT = vueBase.cT + (sim.t0 - vueBase.cT) * k + sim.panT;
  vue.cZ = vueBase.cZ + (fVal(sim.t0) - vueBase.cZ) * k + sim.panZ;
  requestDraw();
}

// Recalcule tout le cadrage (après changement de fonction ou de paramètre).
function recadre() {
  calcVueBase();
  appliqueVue();
}

// Le zoom avant reste modeste (×4,00 au maximum) ; en revanche on peut
// s'éloigner nettement pour reprendre l'allure générale de la courbe.
var ZOOM_MIN = 0.1, ZOOM_MAX = 4;

function setZoom(z) {
  sim.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  appliqueVue();
}

// Remise à zéro de la vue seule (zoom et décalage).
function razVue() {
  sim.zoom = 1;
  sim.panT = 0;
  sim.panZ = 0;
  appliqueVue();
}

// Bornes de la vue courante, dans l'ordre où les tracés en ont besoin.
function vueTMin() { return vue.cT - vue.w / 2; }
function vueTMax() { return vue.cT + vue.w / 2; }
function vueZMin() { return vue.cZ - vue.h / 2; }
function vueZMax() { return vue.cZ + vue.h / 2; }

// ══════════════════════════════════════════════════════════════════════
//  Utilitaires de dessin et de formatage
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
// grossissent avec la zone de tracé (lisibilité en projection) tout en
// restant lisibles sur petite fenêtre.
function echelleTexte(W, H) {
  // Les deux graphes sont larges et peu hauts : se caler sur la plus petite
  // dimension écrasait les textes dès qu'on partageait la fenêtre en deux.
  // La moyenne géométrique suit la surface réellement disponible.
  return Math.max(0.85, Math.min(1.75, Math.sqrt(W * H) / 560));
}

// Pas « rond » donnant environ `cible` graduations sur l'étendue donnée.
function tickStep(range, cible) {
  var brut = range / (cible || 6);
  if (!(brut > 0)) return 1;
  var pow10 = Math.pow(10, Math.floor(Math.log10(brut)));
  var m = brut / pow10;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7 ? 5 : 10) * pow10;
}

// Graduation formatée à la française (virgule décimale), avec juste le
// nombre de décimales imposé par le pas.
function fmtTick(v, step) {
  // Deux décimales au maximum : en zoom fort, les graduations passent en
  // notation scientifique au lieu d'allonger la partie décimale.
  if (step < 0.01) return v === 0 ? '0' : fmtSci(v, 2);
  var dec = step >= 1 ? 0 : Math.min(2, Math.ceil(-Math.log10(step) - 1e-9));
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

// Notation scientifique avec exposant en chiffres supérieurs (3,2·10⁻⁵) :
// en zoom fort, Δt descend sous le millième et doit rester lisible en
// projection sans afficher une file de zéros.
var _EXP_SUP = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵',
                 '6':'⁶','7':'⁷','8':'⁸','9':'⁹','-':'⁻' };

function fmtSci(x, dec) {
  var s = x.toExponential(dec);         // « 3.20e-5 »
  var parts = s.split('e');
  var mant = parts[0].replace('.', ',');
  var exp = parts[1].replace('+', '').split('').map(function (c) {
    return _EXP_SUP[c] || c;
  }).join('');
  return mant + '·10' + exp;
}

// Nombre de décimales adapté à l'ordre de grandeur — utilisé pour tous
// les afficheurs de valeur du panneau.
// Jamais plus de deux décimales : sous 0,01 on bascule en notation
// scientifique plutôt que d'aligner des zéros.
function fmtSmart(x) {
  if (!isFinite(x)) return '—';
  var a = Math.abs(x);
  if (a === 0)      return '0';
  if (a >= 1e5)     return fmtSci(x, 2);
  if (a >= 1000)    return fmtFr(x, 0);
  if (a >= 100)     return fmtFr(x, 1);
  if (a >= 0.01)    return fmtFr(x, 2);
  return fmtSci(x, 2);
}

// Assemble une valeur et son unité (l'unité peut être vide : fonction cube).
function avecUnite(txt, unite) { return unite ? txt + ' ' + unite : txt; }

// Texte cerné d'un halo blanc épais, sans cartouche : les lettres restent
// lisibles par-dessus la courbe, la grille ou une droite, sans poser de
// rectangle de couleur qui se détacherait du fond du graphe.
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

// Flèche à double pointe : sert aux cotes Δt (horizontale) et Δf (verticale).
function flecheDouble(ctx, x1, y1, x2, y2, couleur, lw, tete) {
  var dx = x2 - x1, dy = y2 - y1;
  var L = Math.hypot(dx, dy);
  if (L < 1) return;
  var ux = dx / L, uy = dy / L;
  var t = Math.min(tete, L / 2.5);

  ctx.strokeStyle = couleur;
  ctx.fillStyle = couleur;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Pointes : un triangle à chaque extrémité, orienté selon le segment.
  [[x1, y1, 1], [x2, y2, -1]].forEach(function (p) {
    var s = p[2];
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(p[0] + s * (ux * t - uy * t * 0.42), p[1] + s * (uy * t + ux * t * 0.42));
    ctx.lineTo(p[0] + s * (ux * t + uy * t * 0.42), p[1] + s * (uy * t - ux * t * 0.42));
    ctx.closePath();
    ctx.fill();
  });
}

// Disque plein cerclé de blanc puis d'un liseré sombre : les points
// restent visibles quelle que soit la couleur du fond derrière eux.
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

// ══════════════════════════════════════════════════════════════════════
//  Palette (charte graphique du site)
// ══════════════════════════════════════════════════════════════════════

var COUL = {
  courbe:   '#2a5080',   // courbe f
  pointM:   '#2a8a50',   // point d'étude M
  pointAB:  '#2a6aaa',   // points A et B encadrant M
  secante:  '#b04020',   // sécante (AB) et cote Δf
  tangente: '#2a8a50',   // tangente exacte en M
  coteT:    '#2a6aaa',   // cote Δt
  grille:   '#e4e0d8',
  axe:      '#8a9098',
  texte:    '#2c3e50',
  label:    '#5a6a78'
};

// ══════════════════════════════════════════════════════════════════════
//  Chronophotographie
//  Sur la trajectoire z(t), les positions ne sont plus lues n'importe où :
//  elles sont relevées à intervalle de temps constant, comme sur une
//  chronophotographie réelle. Le point d'étude devient l'un des points
//  M₀, M₁, M₂… (M₀ à t = 0), et le taux de variation se calcule entre
//  deux points relevés — c'est exactement la vitesse qu'on calcule en
//  physique à partir d'un enregistrement.
//
//  Le pas de temps est celui de l'encadrement choisi :
//    'sym'   → un point tous les Δt/2, le taux se lit de Mᵢ₋₁ à Mᵢ₊₁
//    'avant' → un point tous les Δt,   le taux se lit de Mᵢ à Mᵢ₊₁
//  Dans les deux cas tGauche()/tDroite() tombent déjà sur des points
//  voisins : rien d'autre à changer dans le calcul du taux.
// ══════════════════════════════════════════════════════════════════════

// La chronophotographie n'a de sens que pour la trajectoire z(t) : ailleurs
// (oscillateur en cm, tension, fonction cube) il n'y a pas de mobile filmé.
function chronoDispo() { return fonCourante().id === 'trajectoire'; }

// Pas de temps entre deux points relevés.
function chronoPas() {
  return sim.encadrement === 'avant' ? sim.dt : sim.dt / 2;
}

// La chronophotographie est réellement en service (activée, disponible, et
// avec un pas non nul : à Δt = 0 tous les points se confondraient).
function chronoActif() {
  return sim.chrono && chronoDispo() && chronoPas() > 0;
}

// Abscisse du point Mᵢ. M₀ est à t = 0, les indices négatifs remontent
// avant l'origine des temps.
function chronoT(i) { return i * chronoPas(); }

// Choix du point d'étude à la souris : on SAUTE sur le relevé le plus proche
// de l'abscisse visée. Le pas de prise de vue ne bouge pas — changer de point
// ne doit pas changer Δt, et le point ne doit pas glisser continûment sur
// l'axe : sur une chronophotographie il n'existe que les positions relevées.
// L'ancre devient ce relevé, c'est lui que chronoRecale() conservera si Δt
// change ensuite.
function chronoChoisirPres(t) {
  var pas = chronoPas();
  if (pas <= 0) return;
  sim.chronoIdx = Math.round(t / pas);
  sim.t0 = chronoT(sim.chronoIdx);
  sim.chronoAncre = sim.t0;
}

// Mémorise l'abscisse visée par l'utilisateur, puis cale la grille dessus.
function chronoAncrer(t) {
  sim.chronoAncre = t;
  chronoRecale();
}

// Réaccroche la chronophotographie sur l'abscisse ancrée, dès que le pas
// change (Δt, ou définition du taux). Trois exigences se disputent ici :
// le point d'étude doit être un vrai relevé, M₀ doit rester à t = 0, et le
// point ne doit pas bouger quand on resserre Δt. Rabattre le point sur la
// grille tient les deux premières mais pas la troisième : le rabattement
// vaut jusqu'à un demi-pas, il change à chaque cran du slider (le point
// sautille) et l'ancre n'est atteinte qu'à la limite.
//
// On ajuste donc la GRILLE au point, et non l'inverse : le pas ne prend
// que les valeurs t_M / n, n entier. Le point d'étude tombe alors pile sur
// le relevé Mₙ tout en gardant exactement son abscisse, et n se lit comme
// le nombre d'intervalles entre l'origine et M. Δt devient discret en
// chronophotographie — ce qu'est une cadence de prise de vue.
function chronoRecale() {
  if (!chronoActif()) return;
  var a = sim.chronoAncre;
  var A = Math.abs(a);
  var pas = chronoPas();

  // Ancre à l'origine : aucun découpage à faire, le pas reste libre.
  if (A === 0 || pas <= 0) {
    sim.chronoIdx = 0;
    sim.t0 = 0;
    return;
  }

  var n = Math.max(1, Math.round(A / pas));
  pas = A / n;
  // Le pas vaut Δt/2 en symétrique, Δt sinon : on remonte à Δt.
  sim.dt = (sim.encadrement === 'avant') ? pas : 2 * pas;
  sim.chronoIdx = (a < 0) ? -n : n;
  // Pas n × pas : l'ancre elle-même, pour que le point ne bouge d'aucun
  // pixel malgré les arrondis flottants accumulés sur le pas.
  sim.t0 = a;
}

// Indices en chiffres inférieurs : M₀, M₁, M₋₂…
var _EXP_INF = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅',
                 '6':'₆','7':'₇','8':'₈','9':'₉' };

function indiceSub(n) {
  var s = String(Math.abs(n)).split('').map(function (c) {
    return _EXP_INF[c] || c;
  }).join('');
  return (n < 0 ? '₋' : '') + s;
}

// Nom affiché du point Mᵢ (« M₃ »), ou « M » hors chronophotographie.
function nomPointM(i) { return chronoActif() ? 'M' + indiceSub(i) : 'M'; }

// ══════════════════════════════════════════════════════════════════════
//  Décollage de fusée
//  Le graphe z(t) cesse d'être une figure déjà faite : il se construit
//  sous les yeux de l'élève, au rythme d'une fusée qui monte à côté de
//  lui. Le centre de masse M de la fusée est tenu à la MÊME ordonnée que
//  le point de la courbe — c'est tout l'intérêt du mode : la courbe n'est
//  pas une image du mouvement, elle en est le relevé.
//
//  Le décor impose ses valeurs aux paramètres :
//    a ∈ [0 ; 10] m·s⁻²   (la fusée monte, elle ne retombe pas)
//    b = 0                (elle part du repos)
//    c ∈ [15 ; 45] m      z(0) = c est l'altitude du centre de masse au
//                         sol, donc la DEMI-HAUTEUR de la fusée : changer
//                         c change la taille de l'image, sans quoi la
//                         fusée flotterait ou s'enfoncerait dans le sol.
// ══════════════════════════════════════════════════════════════════════

// Comme la chronophotographie, le décollage n'a de sens que sur z(t).
function fuseeDispo() { return fonCourante().id === 'trajectoire'; }
function fuseeActif() { return sim.fusee && fuseeDispo(); }

// Vrai tant que l'animation n'est pas arrivée à son terme : c'est cette
// phase qui masque le point M, les cotes et la sécante, et qui remplace
// le cadre du taux de variation par un chronomètre.
function fuseeAnimEnCours() { return fuseeActif() && !sim.fuseeFini; }

// Altitude à laquelle le vol s'arrête. Ce n'est pas une durée qui borne
// l'animation mais une HAUTEUR : la fusée monte jusqu'à 1000 m, et c'est
// l'accélération qui décide du temps qu'elle y met. Doubler a raccourcit
// le vol au lieu de le faire sortir du cadre — le graphe garde la même
// altitude d'arrivée, seule l'abscisse se resserre.
var FUSEE_ALTITUDE = 1000;

// Garde-fou : à très faible accélération les 1000 m ne sont jamais
// atteints (a = 0 : la fusée ne décolle pas). Le vol s'arrête quand même.
var FUSEE_DUREE_MAX = 60;

// Durée du vol : la date à laquelle z(t) = 1000 m.
// Avec b = 0, z(t) = a·t² + c, donc t = √((1000 − c) / a).
function fuseeDuree() {
  var a = sim.params.a, c = sim.params.c;
  if (!(a > 0)) return FUSEE_DUREE_MAX;
  return Math.min(Math.sqrt(Math.max(0, (FUSEE_ALTITUDE - c) / a)), FUSEE_DUREE_MAX);
}

// Écart Δ maximal proposé par le slider. En décollage il suit la durée du
// vol : avec un Δt plafonné à 3 s, un vol de 40 s ne s'explorerait qu'à la
// loupe, et la chronophotographie n'aurait plus assez d'écart entre relevés.
function dtMaxCourant() {
  return fuseeActif() ? fuseeDuree() : fonCourante().dtMax;
}

// Ramène la date courante dans le vol quand a ou c viennent de changer :
// la durée est calculée sur eux, elle a pu se raccourcir sous l'animation.
function fuseeClampT() {
  var d = fuseeDuree();
  if (sim.fuseeT <= d) return false;
  sim.fuseeT = d;
  sim.fuseePlay = false;
  sim.fuseeFini = true;
  return true;
}

// Bornes imposées aux paramètres en mode décollage. `fixe` marque un
// paramètre qui n'est plus réglable du tout (b = 0 : départ du repos).
var FUSEE_BORNES = {
  a: { min: 0,  max: 10, step: 0.1 },
  b: { min: 0,  max: 0,  step: 0.1, fixe: true },
  c: { min: 15, max: 45, step: 1 }
};

// Bornes effectives d'un paramètre : celles de sa définition, ou celles
// que le mode décollage lui impose. Tout le panneau passe par ici.
function bornesParam(p) {
  var o = fuseeActif() ? FUSEE_BORNES[p.id] : null;
  return o ? { min: o.min, max: o.max, step: o.step, fixe: !!o.fixe }
           : { min: p.min, max: p.max, step: p.step, fixe: false };
}

// Ramène les paramètres dans les bornes du mode courant.
function borneParamsAuMode() {
  fonCourante().params.forEach(function (p) {
    var b = bornesParam(p);
    sim.params[p.id] = Math.max(b.min, Math.min(b.max, sim.params[p.id]));
  });
}

// ══════════════════════════════════════════════════════════════════════
//  Cadrage du décollage
// ══════════════════════════════════════════════════════════════════════

// Fenêtre de départ, fusée au sol : 4 s en abscisse, 120 m en ordonnée.
// Les deux vont ensemble — avec les valeurs par défaut, la fusée atteint
// justement le haut du cadre au bout de ces 4 s, et le dézoom prend le
// relais sans à-coup.
var FUSEE_VUE_T = 4;
var FUSEE_VUE_Z = 120;

// Nombre de SAUTS d'échelle sur tout le vol — soit un cadrage de départ et
// FUSEE_NB_PALIERS cadrages ensuite, donc trois fenêtres successives en
// tout. C'est ce nombre qui est fixé, pas le rapport d'un palier au
// suivant : celui-ci s'en déduit, par axe, de façon que le dernier palier
// tombe exactement sur le cadre du vol entier. Un rapport fixe (×2) donnait
// un nombre de sauts variable selon a et c — jusqu'à sept, ce qui hachait
// l'animation.
var FUSEE_NB_PALIERS = 2;

// Fraction de palier sur laquelle le saut d'échelle est adouci. Tout le
// réglage du mode tient là : trop court, le saut est saccadé ; trop long,
// on retombe sur un dézoom continu et l'accélération redevient invisible.
// Le reste du palier — les trois quarts — est à échelle FIGÉE, et c'est
// pendant ce temps-là que la fusée accélère visiblement.
var FUSEE_TRANSITION = 0.25;

// Interpolation lissée : dérivée nulle aux deux bouts. Une rampe linéaire
// laisserait un coin au départ ET à l'arrivée de la transition, et ce sont
// ces deux cassures de vitesse que l'œil lit comme un à-coup.
function lissage(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * (3 - 2 * x);
}

// Cadre du mode décollage à la date enregistrée `sim.fuseeT`.
//
// Le cadre ne suivait autrefois la trajectoire qu'en collant à elle : la
// fenêtre grandissait exactement au rythme de z(t), si bien que la fusée
// restait à la même hauteur relative et que son ACCÉLÉRATION devenait
// invisible. Le dézoom se fait donc maintenant par PALIERS : entre deux
// sauts d'échelle la fenêtre est figée, et la fusée y grimpe de plus en
// plus vite — c'est là que l'accélération se voit. Chaque palier vaut ×2
// en ordonnée et ×√2 en abscisse.
//
// Le numéro de palier reste une **fonction pure de `sim.fuseeT`** : aucune
// hystérésis, aucun état mémorisé. C'est indispensable, sinon le
// rembobinage ne repasserait pas par les mêmes cadrages que l'aller.
//
// Avancement d'un axe, de 0 (cadre de départ) à 1 (cadre du vol entier),
// mesuré en progression GÉOMÉTRIQUE : c'est le rapport des échelles qui
// compte à l'œil, pas leur différence.
function fuseeAvancement(besoin, depart, fin) {
  if (!(fin > depart)) return 0;               // l'axe n'a pas à s'élargir
  var p = Math.log(Math.max(1e-9, besoin / depart)) / Math.log(fin / depart);
  return Math.max(0, Math.min(1, p));
}

// Échelle d'un axe au palier `j` (réel, pour laisser passer l'adoucissement
// du saut). Les paliers se répartissent géométriquement entre le cadre de
// départ et celui du vol entier.
function fuseeEchelleAu(j, depart, fin) {
  if (!(fin > depart)) return depart;
  return depart * Math.pow(fin / depart, j / FUSEE_NB_PALIERS);
}

function fuseeCadre() {
  var tv = sim.fuseeT;
  var c  = sim.params.c;
  var duree = fuseeDuree();

  var zHaut = fVal(tv) + c;
  if (!isFinite(zHaut)) zHaut = FUSEE_VUE_Z;
  var zFin = fVal(duree) + c;
  if (!isFinite(zFin)) zFin = FUSEE_VUE_Z;

  var zBesoin = zHaut * 1.06, zDep = FUSEE_VUE_Z;
  var tBesoin = tv * 1.08,    tDep = FUSEE_VUE_T;
  var zFinM = Math.max(zDep, zFin * 1.06);
  var tFinM = Math.max(tDep, duree * 1.08);

  // Les deux axes changent d'échelle EN MÊME TEMPS : un saut se lit comme
  // un seul événement, « on a changé d'échelle », et non comme deux
  // secousses successives. Le palier est commandé par l'axe le plus en
  // avance — celui qui est sur le point de déborder.
  var x = FUSEE_NB_PALIERS * Math.max(
            fuseeAvancement(zBesoin, zDep, zFinM),
            fuseeAvancement(tBesoin, tDep, tFinM));

  // `m` est le palier en service, `u` vaut 1 juste après le saut et tend
  // vers 0 juste avant le suivant ; `w` passe du palier précédent au
  // palier courant sur les premiers FUSEE_TRANSITION, en douceur.
  var m = Math.ceil(x - 1e-9);
  var u = m - x;
  var j = Math.max(0, (m - 1) + lissage((1 - u) / FUSEE_TRANSITION));

  // Le lissage démarre plus mou qu'une rampe : au tout début d'une
  // transition l'échelle serait en retard de 0,4 % au pire sur ce qu'elle
  // doit contenir. Le plancher `besoin` l'en empêche, le plafond `finM`
  // interdit de dépasser le cadre du vol entier.
  var zSom  = Math.min(zFinM, Math.max(fuseeEchelleAu(j, zDep, zFinM), zBesoin));
  var tHaut = Math.min(tFinM, Math.max(fuseeEchelleAu(j, tDep, tFinM), tBesoin));
  var zBas  = -0.05 * zSom;

  vueBase.cT = tHaut / 2;
  vueBase.w  = tHaut * 1.06;
  vueBase.cZ = (zBas + zSom) / 2;
  vueBase.h  = zSom - zBas;
}

// Remet l'animation à l'instant zéro : fusée au sol, courbe effacée.
function fuseeRaz() {
  sim.fuseeT = 0;
  sim.fuseePlay = false;
  sim.fuseeFini = false;
}
