// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  tf-graph.js — Onglet Transformations : graphes temporels T, P, V(t),
//  diagrammes d'état de Clapeyron (P, V) et entropique (T, S) (chemin,
//  états d'équilibre, tranches, courbes de référence), zoom, réticule et
//  splitters de la colonne gauche.
//  Chargé après tf-scene.js (couleurs selon T), avant tf-ui.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// Durée simulée que montrent ~20 s d'écran à chaque cran de TF_VITESSES :
// elle ne règle plus que le pas d'échantillonnage (l'axe des temps suit
// l'étape, cf. tfGraph.axeT)
var TF_G_FENETRES    = [0.005, 0.02, 0.2, 2, 20, 100, 400, 2000, 10000, 40000, 200000];
var TF_G_PAR_FENETRE = 500;     // échantillons par fenêtre
// Crans de l'étendue de départ en ΔS (1, 1,5, 2, 3, 5, 7,5 × 10ⁿ) et de la
// durée de l'axe des temps (1, 2, 5 × 10ⁿ) ; durée des transitions quand
// un champ ou un axe change d'un coup (ms)
var TF_G_CRANS   = [1, 1.5, 2, 3, 5, 7.5];
var TF_G_CRANS_T = [1, 2, 5];
var TF_G_ANIM    = 350;
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
var TF_G_ISOC   = '#6a5aa0';
var TF_G_ISOB   = '#5a8a30';
var TF_G_ACTUEL = '#e06020';     // état actuel du gaz (diagrammes d'état)

// Grandeurs des graphes temporels : clés, dans un échantillon, de la valeur
// instantanée (m), de sa moyenne sur l'intervalle et de ses extrêmes (t, lo,
// hi), des extrêmes des tranches et du critère « définie » ; facteur
// d'unité ; étendue minimale de l'axe (évite de grossir le bruit numérique
// au repos)
var TF_G_SERIES = [
  { titre: 'T (K)',   coul: '#c0503a', m: 'Tm', t: 'Tt', lo: 'Tlo', hi: 'Thi',
    min: 'Tmin', max: 'Tmax', def: 'Tdef', f: 1,    span: 10 },
  { titre: 'P (kPa)', coul: '#2a6aaa', m: 'Pm', t: 'Pt', lo: 'Plo', hi: 'Phi',
    min: 'Pmin', max: 'Pmax', def: 'Pdef', f: 1e-3, span: 10 },
  { titre: 'V (L)',   coul: '#2a8a50', m: 'V',  t: 'Vt', lo: 'Vlo', hi: 'Vhi',
    min: 'Vlo',  max: 'Vhi',  def: null,   f: 1e3,  span: 0.05 }
];

// Options des graphes (menu Options de la barre des encarts)
var tfGraphAff = {
  tranches    : true,    // un point par tranche, à l'abscisse du gaz
  piston      : false,   // pression exercée sur le gaz par le piston (Clapeyron)
  isotherme   : false,   // courbes de référence, dans les deux diagrammes
  adiabatique : false,
  isochore    : false,
  isobare     : false,
  gel         : true,    // chrono figé à l'équilibre
  // Convention de tracé des diagrammes d'état : faux, un point dès que la
  // grandeur en ordonnée est uniforme dans le gaz ; vrai, seulement quand
  // le gaz est en équilibre avec l'extérieur (tfMesures().ext)
  ext         : false
};

// Chrono figé : après une action, le gel attend que le gaz ait quitté
// l'équilibre, ou au plus ce nombre d'échantillons (action sans effet) ; il
// demande aussi quelques échantillons d'équilibre de suite, un échantillon
// pris à l'extrémité d'une oscillation du piston passant le critère
var TF_G_BLOCAGE_GEL = 20;
var TF_G_EQ_GEL      = 5;

var tfGraph = {
  ech       : [],      // historique : un objet par échantillon
  ref       : null,    // état de départ de l'étape en cours (courbes de référence)
  // Arrivées prévues de l'action préparée dans la carte Transformation
  // (tf-ui.js) : [{V, P, T, S, nom}], cercles pointillés
  prevu     : [],
  env       : null,    // étendue des tranches depuis le départ, par diagramme (cadrage)
  // Encarts affichés dans la colonne gauche (barre de boutons activables,
  // de 0 à 4)
  vues      : { pv: true, ts: false, temps: true, tableau: true },
  // Chrono des graphes : temps des graphes = temps simulé − decal (s), les
  // attentes à l'équilibre étant retirées quand l'option gel est cochée
  decal     : 0,
  gele      : false,   // chrono figé (aucun échantillon enregistré)
  tGel      : 0,       // temps simulé au début du gel
  blocage   : 0,       // échantillons avant qu'un gel soit permis
  eqSuite   : 0,       // échantillons d'équilibre consécutifs
  repos     : true,    // aucune action depuis Réinitialiser ou un retour à un état
  coupure   : false,   // le prochain échantillon suit une attente retirée
  // Axe des temps de l'étape en cours : départ t0 (temps des graphes),
  // durée L, plages des trois cases ; L et les plages ne font que
  // s'agrandir au fil de l'étape
  axeT      : { t0: 0, L: 1, y: [null, null, null] },
  vueT      : null,    // null : étape en cours ; sinon {t1, t2, o (origine), lt (lettre)}
  pileT     : [],
  // Champ fixe de chaque diagramme d'état : il ne fait que s'agrandir, par
  // crans (null : à recalculer)
  champ     : { pv: null, ts: null },
  anim      : {},      // transitions d'un champ ou d'un axe qui s'agrandit
  vue       : { pv: null, ts: null },   // null : champ fixe ; sinon zoom {x1, x2, y1, y2}
  pileD     : { pv: [], ts: [] },   // vues précédentes de chaque diagramme d'état
  geoT      : null,    // géométrie du dernier tracé (souris)
  geoD      : { pv: null, ts: null },
  reticule  : false,
  souris    : null,    // {cible, x, y}
  glisse    : null,    // déplacement en cours {cible, x0, y0, vue0, bouge}
  empile    : {},      // date du dernier empilement de vue, par graphe (molette)
  cv        : null,    // {pv, t} : canvas, contexte, taille
  sale      : true
};

// ══════════════════════════════════════════════════════════════════════
//  Enregistrement
// ══════════════════════════════════════════════════════════════════════

function _tfgFenetre() {
  return TF_G_FENETRES[tfCranVitesse(tf.vitesse)];
}

// Appelé par tfAvancer dès que tf.t atteint tf.tEchant. Le pas suit la
// fenêtre affichée, et se resserre pendant un mouvement du vérin pour que
// les compressions brèves soient décrites même aux crans rapides.
function _tfgPasEchant() {
  var dt = Math.min(_tfgFenetre(), tfGraph.axeT.L) / TF_G_PAR_FENETRE;
  return tf.verin.actif ? Math.min(dt, tf.verin.tau / 200) : dt;
}

// Après un changement de cran ou un départ du vérin : l'échéance suivante
// ne doit pas attendre l'ancien pas, plus long
function tfGraphReprogrammer() {
  tf.tEchant = Math.min(tf.tEchant, tf.t + _tfgPasEchant());
}

// Temps des graphes (s) : temps simulé, attentes à l'équilibre retirées
function tfGraphTemps() {
  return (tfGraph.gele ? tfGraph.tGel : tf.t) - tfGraph.decal;
}

// Compteur de temps de la scène (tf-scene.js) : temps écoulé depuis le
// départ de l'étape, lu comme sur l'axe des graphes au cours du temps
function tfGraphChrono() {
  return { dt: tfGraphTemps() - tfGraph.axeT.t0, gele: tfGraph.gele };
}

// avantMarche : échantillon forcé juste avant une marche d'escalier (il clôt
// le séjour à l'équilibre en cours, cf. _tfgDessinerDiag).
// Chrono figé : à l'équilibre, sans action en cours, l'échantillon n'est pas
// enregistré et l'attente est retirée du temps des graphes ; le chrono
// repart dès que le gaz quitte l'équilibre ou qu'une action est lancée
// (tfGraphDegeler).
function _tfgEchantillon(avantMarche) {
  tf.tEchant = tf.t + _tfgPasEchant();
  // Suivi depuis l'échantillon précédent (tf-sim.js, _tfAccumuler) : vidé
  // même si cet échantillon n'est pas gardé (chrono figé)
  var a = tf.acc;
  tf.acc = null;

  var m = tfMesures(), g = tfGraph;
  tfEtapesSuivre(m);
  if (!m.equilibre) g.blocage = g.eqSuite = 0;
  else { g.eqSuite++; if (g.blocage > 0) g.blocage--; }
  // Au repos (aucune action depuis Réinitialiser ou un retour à un état),
  // le gaz est à l'équilibre d'emblée : le chrono se fige dès le premier
  // échantillon, sans attendre les TF_G_EQ_GEL échantillons qui écartent
  // l'extrémité d'une oscillation du piston
  var figer = tfGraphAff.gel && m.equilibre && !tfEnCours() && g.blocage === 0
           && (g.repos || (g.eqSuite >= TF_G_EQ_GEL && g.ech.length > 0));
  if (g.gele) {
    if (figer) return;
    g.decal += tf.t - g.tGel;
    g.gele = false;
    g.coupure = true;
  }

  // Graphes temporels : moyennes sur l'intervalle écoulé depuis
  // l'échantillon précédent, et extrêmes atteints pendant cet intervalle
  // (l'instant de l'échantillon compris). Les diagrammes d'état gardent les
  // valeurs instantanées : un état est un point, pas une moyenne.
  var Pp = tf.tenu ? m.Pface : m.Pext;
  var moy = function (cle, v) { return a ? a[cle] / a.dt : v; };
  var bas = function (cle, v) { return a ? Math.min(a[cle], v) : v; };
  var haut = function (cle, v) { return a ? Math.max(a[cle], v) : v; };
  var s = {
    t: tf.t - g.decal, ts: tf.t, V: m.V,
    Pm: m.Pmoy, Pdef: m.Pdef,
    Tm: m.Tmoy, Tdef: m.Tdef, ext: m.ext,
    Pt: moy('P', m.Pmoy), Plo: bas('P1', m.Pmoy), Phi: haut('P2', m.Pmoy),
    Tt: moy('T', m.Tmoy), Tlo: bas('T1', m.Tmoy), Thi: haut('T2', m.Tmoy),
    Vt: moy('V', m.V),    Vlo: bas('V1', m.V),    Vhi: haut('V2', m.V),
    Pmin: bas('Pmin', m.Pmin), Pmax: haut('Pmax', m.Pmax),
    Tmin: bas('Tmin', m.Tmin), Tmax: haut('Tmax', m.Tmax),
    Ppt: moy('Pp', Pp),
    S: tfEntropie(),
    eq: m.equilibre,
    // Pression exercée par le piston : P_ext piston libre, celle que
    // mesure le vérin piston tenu
    Pp: Pp,
    Text: tf.Text,
    marche: avantMarche === true,
    coupure: g.coupure,
    etape: tfEtapeCourante()
  };
  g.coupure = false;
  g.ech.push(s);
  if (g.ech.length > TF_G_MAX) {
    var e = g.ech, garde = [];
    for (var k = 0; k < e.length; k++) {
      if (k % 2 === 0 || e[k].marche || e[k].coupure || k === e.length - 1) garde.push(e[k]);
    }
    g.ech = garde;
  }
  if (!g.ref) g.ref = s;
  if (figer) { g.gele = true; g.tGel = tf.t; }
  // La marche qui suit cet échantillon dérange le gaz : l'équilibre se
  // recompte après elle
  if (avantMarche) g.eqSuite = 0;
  _tfgEnveloppe(m, s.S);
  g.sale = true;
}

// Avant une action (Lancer, bascule du piston, isolation) : le chrono
// repart, l'état d'avant l'action est enregistré, et le gel attend que le
// gaz ait quitté l'équilibre
function tfGraphDegeler() {
  var g = tfGraph;
  if (g.gele) {
    g.decal += tf.t - g.tGel;
    g.gele = false;
    g.coupure = true;
  }
  g.blocage = TF_G_BLOCAGE_GEL;
  g.repos = false;
  _tfgEchantillon();
  g.eqSuite = 0;
}

// Départ d'une étape : les courbes théoriques et le cadrage des tranches
// repartent de l'état actuel (dernier échantillon) ; l'axe des temps aussi,
// pour une durée provisoire (précisée par tfGraphDureeAttendue au lancement
// de l'action)
function tfGraphDepartEtape() {
  var g = tfGraph;
  if (g.ech.length) g.ref = g.ech[g.ech.length - 1];
  g.env = null;
  _tfgAxeT(g.ref ? g.ref.t : 0, 1);
  g.vueT = null;
  g.pileT = [];
  g.sale = true;
}

// Durée attendue de l'action qui vient d'être lancée (s) : premier cran de
// l'axe des temps ; il s'agrandit ensuite si le retour à l'équilibre dure
function tfGraphDureeAttendue(D) {
  if (!isFinite(D) || D <= 0) return;
  tfGraph.axeT.L = _tfgCran(1.2 * D, TF_G_CRANS_T);
  delete tfGraph.anim.t;
  tfGraphReprogrammer();
  tfGraph.sale = true;
}

function _tfgAxeT(t0, L) {
  var g = tfGraph;
  g.axeT = { t0: t0, L: L, y: [null, null, null] };
  ['t', 't0', 't1', 't2'].forEach(function (k) { delete g.anim[k]; });
}

// Étape retirée du journal (sans effet) : ses échantillons reviennent à la
// précédente
function tfGraphRetirerEtape(n) {
  var e = tfGraph.ech;
  for (var k = e.length - 1; k >= 0 && e[k].etape >= n; k--) e[k].etape = n - 1;
  tfGraph.sale = true;
}

// Retour à un état (instantané de date ts) : l'historique postérieur est
// effacé, le chrono reprend au dernier échantillon gardé
function tfGraphRevenir(ts, n) {
  var g = tfGraph, e = g.ech;
  while (e.length > 1 && e[e.length - 1].ts > ts + 1e-12) e.pop();
  for (var k = 0; k < e.length; k++) if (e[k].etape > n) e[k].etape = n;
  g.gele = false;
  g.decal = tf.t - e[e.length - 1].t;
  g.blocage = 0;
  g.repos = true;
  g.coupure = false;
  g.ref = e[e.length - 1];
  g.env = null;
  _tfgAxeT(g.ref.t, 1);
  g.champ = { pv: null, ts: null };
  g.vueT = null;
  g.vue = { pv: null, ts: null };
  g.pileT = [];
  g.pileD = { pv: [], ts: [] };
  tf.tEchant = tf.t;
  tf.acc = null;
  g.sale = true;
}

// Étendue des tranches depuis le départ de l'étape, dans chaque diagramme
// d'état : le cadrage automatique ne fait que s'élargir pendant un choc, au
// lieu de pomper à chaque image
function _tfgEnveloppe(m, S) {
  var g = tfGraph;
  if (!g.env) g.env = {};
  m.S = S;
  for (var d in TF_G_DIAGS) {
    var D = TF_G_DIAGS[d], x = D.x(m), e = g.env[d];
    if (!e) e = g.env[d] = { x1: Infinity, x2: -Infinity, y1: Infinity, y2: -Infinity };
    if (x < e.x1) e.x1 = x;
    if (x > e.x2) e.x2 = x;
    if (D.yMin(m) < e.y1) e.y1 = D.yMin(m);
    if (D.yMax(m) > e.y2) e.y2 = D.yMax(m);
  }
}

// Efface l'historique (Réinitialiser) et enregistre
// l'état initial
function tfGraphEffacer() {
  var g = tfGraph;
  g.ech = [];
  g.ref = g.env = null;
  g.decal = g.tGel = g.blocage = g.eqSuite = 0;
  g.repos = true;
  g.gele = g.coupure = false;
  _tfgAxeT(0, 1);
  g.champ = { pv: null, ts: null };
  g.vueT = null;
  g.vue = { pv: null, ts: null };
  g.pileT = [];
  g.pileD = { pv: [], ts: [] };
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

// Plus petit cran ≥ v (v > 0), crans pris dans la suite c × 10ⁿ
function _tfgCran(v, crans) {
  var p = Math.pow(10, Math.floor(Math.log10(v)));
  for (var i = 0; i < crans.length; i++) if (crans[i] * p >= v * (1 - 1e-9)) return crans[i] * p;
  return 10 * p;
}

// Borne haute d'un champ : elle suit v quand v approche du bord (marge de
// 8 %) et ne descend jamais
function _tfgBorneSup(hi, v) {
  return v > hi * 0.92 ? v / 0.92 : hi;
}

// Transition d'un champ (ou d'un axe) vers sa nouvelle étendue : renvoie les
// bornes à dessiner maintenant, et redemande un tracé tant qu'elle dure
function _tfgAnimer(cle, cible) {
  var g = tfGraph, a = g.anim[cle], now = performance.now(), k;
  var meme = function (u, v) { for (var q in v) if (u[q] !== v[q]) return false; return true; };
  var actuel = function () {
    var f = Math.min(1, (now - a.t0) / TF_G_ANIM), r = {};
    f = 1 - Math.pow(1 - f, 3);
    for (var q in a.vers) r[q] = a.de[q] + (a.vers[q] - a.de[q]) * f;
    return r;
  };
  if (!a) a = g.anim[cle] = { de: cible, vers: cible, t0: 0 };
  else if (!meme(a.vers, cible)) { a.de = actuel(); a.vers = cible; a.t0 = now; }
  if (now - a.t0 < TF_G_ANIM) g.sale = true;
  var r = actuel();
  for (k in cible) if (!isFinite(r[k])) return cible;
  return r;
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
    if (!tf.tenu) return { cle: 'Ppt', nom: 'P_ext' };
    return tfGraphAff.piston ? { cle: 'Ppt', nom: 'sur le piston' } : null;
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

  // Étape en cours (sans zoom) : de son départ t0 à t0 + L, un peu de
  // l'état d'avant à gauche ; L passe au cran suivant quand le temps des
  // graphes approche du bord droit. Les temps se lisent depuis t0 (origine
  // org), marquée de la lettre de départ.
  var t1, t2, org, lt, vT = tfGraph.vueT, A = tfGraph.axeT;
  if (vT) { t1 = vT.t1; t2 = vT.t2; org = vT.o; lt = vT.lt; }
  else {
    var ecoule = tfGraphTemps() - A.t0;
    if (ecoule > 0.95 * A.L) A.L = _tfgCran(ecoule / 0.95, TF_G_CRANS_T);
    var L = _tfgAnimer('t', { L: A.L }).L;
    org = A.t0; lt = _tfgLettreDepart();
    t1 = org - L / 25; t2 = org + L;
  }
  var i1 = Math.max(0, _tfgIndice(e, t1) - 1);
  var i2 = Math.min(e.length - 1, _tfgIndice(e, t2));
  var xDe = function (t) { return ML + (t - t1) / (t2 - t1) * pw; };

  var unite = (t2 - t1) < 1 ? 1000 : 1;
  var pasT = _tfgPas((t2 - t1) * unite, Math.max(2, Math.floor(pw / (fs * 5.5))));
  var gradT = _tfgGraduations((t1 - org) * unite, (t2 - org) * unite, pasT);
  var xGrad = function (gt) { return xDe(org + gt / unite); };

  var geo = { x0: ML, pw: pw, t1: t1, t2: t2, o: org, lt: lt, boites: [] };
  for (var b = 0; b < 3; b++) {
    var y0 = MT + b * (bh + GAP);
    geo.boites.push(_tfgBoite(o, TF_G_SERIES[b], b, ML, y0, pw, bh, i1, i2, xDe, gradT, xGrad, fs));
  }
  tfGraph.geoT = geo;

  // Axe des temps, sous la dernière case
  var yAxe = MT + 3 * bh + 2 * GAP;
  c.fillStyle = TF_G_ENCRE;
  c.font = _tfgPolice(fs, false);
  c.textAlign = 'center';
  c.textBaseline = 'top';
  for (var k = 0; k < gradT.length; k++) {
    c.fillText(_tfgNb(gradT[k], pasT), xGrad(gradT[k]), yAxe + 3);
  }
  c.textAlign = 'right';
  c.font = _tfgPolice(fs, true);
  c.fillText((unite === 1000 ? 't (ms)' : 't (s)') + (lt ? ' depuis ' + lt : ''), ML + pw, yAxe + fs * 1.45);
  c.textAlign = 'left';
  c.font = _tfgPolice(fs, false);
  c.fillStyle = TF_G_MUET;
  if (vT) c.fillText('vue figée (« Étape » pour revenir)', ML, yAxe + fs * 1.45);
  else if (tfGraph.gele) c.fillText('chrono figé (équilibre)', ML, yAxe + fs * 1.45);

  var gl = tfGraph.glisse;

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
    var lignes = ['t = ' + _tfgNbLu((s.t - org) * unite) + (unite === 1000 ? ' ms' : ' s')
                  + (lt ? ' depuis ' + lt : '')];
    for (b = 0; b < 3; b++) {
      var ser = TF_G_SERIES[b], nom = ser.titre.split(' ')[0];
      var uni = ser.titre.replace(/^.*\((.*)\)$/, '$1');
      // Valeur moyenne sur l'intervalle ; s'il y a oscillation, son étendue
      var osc = (s[ser.hi] - s[ser.lo]) * ser.f > ser.span / 100;
      lignes.push(_tfgDef(s, ser)
        ? nom + ' = ' + _tfgNbLu(s[ser.t] * ser.f) + ' ' + uni
          + (osc ? ' (oscille de ' + _tfgNbLu(s[ser.lo] * ser.f) + ' à '
                   + _tfgNbLu(s[ser.hi] * ser.f) + ')' : '')
        : nom + ' non définie (' + _tfgNbLu(s[ser.min] * ser.f) + ' à '
          + _tfgNbLu(s[ser.max] * ser.f) + ' ' + uni + ')');
    }
    _tfgBulle(c, lignes, so.x, so.y, W, H, fs);
  }
}

// Lettre de l'état de départ de l'étape en cours ('' avant toute étape)
function _tfgLettreDepart() {
  var L = tfEtapes.liste, dep = L.length ? L[L.length - 1].depart : null;
  return dep !== null && tfEtapes.etats[dep] ? tfEtapes.etats[dep].lettre : '';
}

// Plage verticale d'une case pendant l'étape : elle ne change pas tant que
// les données y tiennent (marge de 4 %) ; sinon elle s'agrandit, avec une
// réserve d'un cinquième de son étendue du côté qui déborde, pour ne pas
// recommencer à chaque image. Transition animée vers la nouvelle plage.
function _tfgPlageEtape(b, lo, hi, span, n) {
  var A = tfGraph.axeT, r = A.y[b];
  if (!isFinite(lo) || !isFinite(hi)) return r || _tfgBornes(lo, hi, span, n);
  var m = r ? (r.hi - r.lo) * 0.04 : 0;
  if (!r || lo < r.lo + m || hi > r.hi - m) {
    if (r) {
      var e = Math.max(hi, r.hi) - Math.min(lo, r.lo);
      lo = lo < r.lo + m ? lo - e * 0.2 : r.lo;
      hi = hi > r.hi - m ? hi + e * 0.2 : r.hi;
    } else {
      var e0 = (hi - lo) * 0.1;
      lo -= e0; hi += e0;
    }
    if (hi - lo < span) { var c = (lo + hi) / 2; lo = c - span / 2; hi = c + span / 2; }
    var pas = _tfgPas(hi - lo, n);
    r = A.y[b] = { lo: Math.floor(lo / pas) * pas, hi: Math.ceil(hi / pas) * pas };
  }
  return _tfgAnimer('t' + b, r);
}

// Une case : courbe pleine quand la grandeur est définie ; hors équilibre,
// bande hachurée entre les extrêmes des tranches (la moyenne n'est pas
// tracée : ce serait lui prêter un sens)
function _tfgBoite(o, ser, b, x0, y0, w, h, i1, i2, xDe, gradT, xGrad, fs) {
  var c = o.ctx, e = tfGraph.ech;
  var rep = _tfgRepere(ser);

  var lo = Infinity, hi = -Infinity, nd = false, k, s, v;
  for (k = i1; k <= i2; k++) {
    s = e[k];
    if (_tfgDef(s, ser)) {
      if (s[ser.lo] * ser.f < lo) lo = s[ser.lo] * ser.f;
      if (s[ser.hi] * ser.f > hi) hi = s[ser.hi] * ser.f;
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
  var bo = tfGraph.vueT ? _tfgBornes(lo, hi, ser.span, nY) : _tfgPlageEtape(b, lo, hi, ser.span, nY);
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
    var xx = Math.round(xGrad(gradT[k])) + 0.5;
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

  // Attentes à l'équilibre retirées (chrono figé) : trait vertical discret
  c.strokeStyle = TF_G_CADRE;
  c.lineWidth = 1;
  c.setLineDash([2, 3]);
  c.beginPath();
  for (k = i1; k <= i2; k++) {
    if (!e[k].coupure) continue;
    var xc = Math.round(xDe(e[k].t)) + 0.5;
    c.moveTo(xc, y0); c.lineTo(xc, y0 + h);
  }
  c.stroke();
  c.setLineDash([]);

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

  // Tronçons définis / non définis. Près du seuil, la grandeur passe d'un
  // échantillon à l'autre de définie à non définie : un tronçon défini de
  // moins de 2 px entre deux tronçons non définis rejoint la bande (jamais
  // l'inverse : rien n'est montré défini qui ne l'est pas), sinon des bouts
  // de courbe pleine s'intercalent dans la bande et l'épaississent.
  var tr = [], r, j, q, oscil = false;
  for (k = i1; k <= i2; k++) {
    var dk = _tfgDef(e[k], ser);
    r = tr[tr.length - 1];
    if (r && r.def === dk) r.j = k; else tr.push({ def: dk, k: k, j: k });
  }
  for (q = 1; q < tr.length - 1; q++) {
    if (tr[q].def && xDe(e[tr[q].j].t) - xDe(e[tr[q].k].t) < 2) tr[q].def = false;
  }
  for (q = tr.length - 1; q > 0; q--) {
    if (tr[q].def === tr[q - 1].def) { tr[q - 1].j = tr[q].j; tr.splice(q, 1); }
  }
  for (var it = 0; it < tr.length; it++) {
    var def = tr[it].def;
    k = tr[it].k; j = tr[it].j;
    if (def) {
      // Oscillation plus rapide que les échantillons : bande pleine et
      // claire entre les extrêmes atteints (regroupés par pixel), sous la
      // courbe des moyennes. Un extrême n'est gardé que s'il dépasse de plus
      // de 2 px ce que la courbe couvre déjà autour de l'échantillon (une
      // pente raide mais bien échantillonnée ne fait pas de bande).
      var bpts = [], bp, large = false;
      for (q = k; q <= j; q++) {
        var cMin = Infinity, cMax = -Infinity;
        for (var qq = Math.max(k, q - 1); qq <= Math.min(j, q + 1); qq++) {
          var yc = yDe(e[qq][ser.t] * ser.f);
          if (yc < cMin) cMin = yc;
          if (yc > cMax) cMax = yc;
        }
        var xb = xDe(e[q].t), yhb = yDe(e[q][ser.hi] * ser.f), ybb = yDe(e[q][ser.lo] * ser.f);
        if (yhb > cMin - 2) yhb = cMin;
        if (ybb < cMax + 2) ybb = cMax;
        bp = bpts[bpts.length - 1];
        if (bp && xb - bp.x < 1) { bp.h = Math.min(bp.h, yhb); bp.b = Math.max(bp.b, ybb); }
        else bpts.push(bp = { x: xb, h: yhb, b: ybb });
        // Mention en titre seulement pour une bande bien visible
        if (yhb < cMin - 4 || ybb > cMax + 4) large = true;
      }
      if (large) oscil = true;
      // Un polygone par suite de pixels voisins (écart de 2 px au plus) :
      // d'un pixel au suivant éloigné, la bande s'interrompt au lieu de
      // s'étirer. Sinon, juste avant un saut (vérin brutal) groupé dans un
      // seul pixel, la bande de ce pixel était reliée à l'échantillon
      // précédent, lointain (chrono figé à l'équilibre) : un triangle là où
      // rien n'a bougé.
      c.fillStyle = ser.coul;
      c.globalAlpha = 0.25;
      for (q = 0; q < bpts.length; q++) {
        var q1 = q, u;
        while (q1 + 1 < bpts.length && bpts[q1 + 1].x - bpts[q1].x <= 2) q1++;
        var seul = q1 === q;
        c.beginPath();
        for (u = q; u <= q1; u++) {
          if (u === q) c.moveTo(bpts[u].x, bpts[u].h); else c.lineTo(bpts[u].x, bpts[u].h);
        }
        if (seul) c.lineTo(bpts[q].x + 1, bpts[q].h);
        for (u = q1; u >= q; u--) c.lineTo(bpts[u].x + (seul ? 1 : 0), bpts[u].b);
        c.closePath();
        c.fill();
        q = q1;
      }
      c.globalAlpha = 1;
      c.strokeStyle = ser.coul;
      c.lineWidth = 2;
      c.lineJoin = 'round';
      c.beginPath();
      for (q = k; q <= j; q++) {
        if (q === k) c.moveTo(xDe(e[q].t), yDe(e[q][ser.t] * ser.f));
        else c.lineTo(xDe(e[q].t), yDe(e[q][ser.t] * ser.f));
      }
      if (j === k) c.lineTo(xDe(e[k].t) + 1, yDe(e[k][ser.t] * ser.f));
      c.stroke();
    } else {
      // La bande déborde d'un échantillon de chaque côté pour se raccorder
      // aux tronçons définis voisins. Les échantillons d'un même pixel sont
      // regroupés (enveloppe des extrêmes) : sinon, les extrêmes qui
      // oscillent d'un échantillon à l'autre font un contour en zigzag
      // serré, une tache sombre plus épaisse que la courbe pleine. Les bords
      // restent écartés d'au moins 1 px : avec leur trait de 1 px, la bande
      // n'est jamais plus fine que la courbe pleine (2 px), qui la prolonge
      // sans bourrelet quand l'écart entre tranches s'éteint.
      var a = Math.max(i1, k - 1), z = Math.min(i2, j + 1), pts = [], pt;
      for (q = a; q <= z; q++) {
        var xq = xDe(e[q].t), yh = yDe(e[q][ser.max] * ser.f), yb = yDe(e[q][ser.min] * ser.f);
        pt = pts[pts.length - 1];
        if (pt && xq - pt.x < 1 && q < z) { pt.h = Math.min(pt.h, yh); pt.b = Math.max(pt.b, yb); }
        else pts.push({ x: xq, h: yh, b: yb });
      }
      c.beginPath();
      for (q = 0; q < pts.length; q++) {
        pt = pts[q];
        if (pt.b - pt.h < 1) { var ym = (pt.h + pt.b) / 2; pt.h = ym - 0.5; pt.b = ym + 0.5; }
        if (q === 0) c.moveTo(pt.x, pt.h); else c.lineTo(pt.x, pt.h);
      }
      for (q = pts.length - 1; q >= 0; q--) c.lineTo(pts[q].x, pts[q].b);
      c.closePath();
      c.fillStyle = _tfgHachure(o, ser.coul);
      c.fill();
      c.strokeStyle = ser.coul;
      c.globalAlpha = 0.7;
      c.lineWidth = 1;
      c.stroke();
      c.globalAlpha = 1;
    }
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
  if (oscil) _tfgEtiquette(c, 'bande claire : oscillation trop rapide pour l\'échelle',
                           x0 + w - 6, y0 + 2 + fs * (nd ? 1.95 : 0.65), fs - 1, TF_G_MUET, 'right');
  if (rep && i2 >= i1) {
    var yr = yDe(e[i2][rep.cle] * ser.f);
    _tfgEtiquette(c, rep.nom, x0 + w - 6, Math.max(y0 + fs * 2, Math.min(y0 + h - fs, yr - fs * 0.8)),
                  fs - 1, TF_G_MUET, 'right');
  }

  return { y0: y0, h: h };
}

// ══════════════════════════════════════════════════════════════════════
//  Diagrammes d'état : Clapeyron (P, V) et entropique (T, S)
//  Un état d'équilibre d'un gaz parfait est un point dans tous les
//  diagrammes ; si l'un ne peut pas le placer, le système n'est pas à
//  l'équilibre, même si l'autre le peut (PLAN §10.6). Le gaz garde toujours
//  un volume et une entropie : hors équilibre, ses tranches s'étalent sur une
//  verticale (plusieurs pressions, plusieurs températures).
// ══════════════════════════════════════════════════════════════════════

// Chaque diagramme lit ses deux axes dans un échantillon (s), une lettre du
// journal (L) ou les mesures actuelles (m, entropie comprise) ; l'ordonnée
// n'est définie que si la grandeur est uniforme dans le gaz. Unités
// d'affichage : L, kPa ; mJ/K (S = 0 à l'état initial), K.
var TF_G_DIAGS = {
  pv: {
    titreX: 'V (L)', titreY: 'P (kPa)', spanX: 0.05, spanY: 5,
    x: function (o) { return o.V * 1e3; },
    y: function (s) { return s.Pm * 1e-3; },
    def: function (s) { return tfGraphAff.ext ? s.ext : s.Pdef; },
    yL: function (L) { return L.P * 1e-3; },
    yM: function (m) { return m.Pmoy * 1e-3; },
    defM: function (m) { return tfGraphAff.ext ? m.ext : m.Pdef; },
    yMin: function (m) { return m.Pmin * 1e-3; },
    yMax: function (m) { return m.Pmax * 1e-3; },
    tranche: function (j) { return tf.P[j] * 1e-3; },
    nd: 'Pression du gaz non définie',
    lu: function (x, y) { return ['V = ' + _tfgNbLu(x) + ' L', 'P = ' + _tfgNbLu(y) + ' kPa']; }
  },
  ts: {
    titreX: 'ΔS (mJ/K)', titreY: 'T (K)', spanX: 2, spanY: 5,
    x: function (o) { return o.S * 1e3; },
    y: function (s) { return s.Tm; },
    def: function (s) { return tfGraphAff.ext ? s.ext : s.Tdef; },
    yL: function (L) { return L.T; },
    yM: function (m) { return m.Tmoy; },
    defM: function (m) { return tfGraphAff.ext ? m.ext : m.Tdef; },
    yMin: function (m) { return m.Tmin; },
    yMax: function (m) { return m.Tmax; },
    tranche: function (j) { return tfTTranche(j); },
    nd: 'Température du gaz non définie',
    lu: function (x, y) { return ['ΔS = ' + _tfgNbLu(x) + ' mJ/K', 'T = ' + _tfgNbLu(y) + ' K']; }
  }
};

// Courbes de référence par l'état de départ de la transformation en cours
// (ref, échantillon), dans les unités du diagramme. Une courbe est une
// fonction y(x), une verticale (vert) ou une horizontale (horiz).
//   Clapeyron : isotherme P = Pr·Vr/V, adiabatique réversible
//   P = Pr·(Vr/V)^γ, isochore verticale, isobare horizontale.
//   Entropique : isotherme horizontale, adiabatique réversible verticale,
//   isochore T = Tr·e^(ΔS/(n·Cv)), isobare T = Tr·e^(ΔS/(n·Cp)).
function _tfgCourbesRef(d, ref) {
  var c = [], A = tfGraphAff, n = tf.n, Cv = tf.Cv, g = tf.gamma;
  if (d === 'pv') {
    var Vr = ref.V * 1e3, Pr = ref.Pm * 1e-3;
    if (A.isotherme)   c.push({ f: function (V) { return Pr * Vr / V; }, coul: TF_G_ISOT, nom: 'isotherme' });
    if (A.adiabatique) c.push({ f: function (V) { return Pr * Math.pow(Vr / V, g); }, coul: TF_G_ADIA, nom: 'adiabatique réversible' });
    if (A.isochore)    c.push({ vert: Vr, coul: TF_G_ISOC, nom: 'isochore' });
    if (A.isobare)     c.push({ horiz: Pr, coul: TF_G_ISOB, nom: 'isobare' });
  } else {
    var Sr = ref.S * 1e3, Tr = ref.Tm;
    if (A.isotherme)   c.push({ horiz: Tr, coul: TF_G_ISOT, nom: 'isotherme' });
    if (A.adiabatique) c.push({ vert: Sr, coul: TF_G_ADIA, nom: 'adiabatique réversible' });
    if (A.isochore)    c.push({ f: function (S) { return Tr * Math.exp((S - Sr) * 1e-3 / (n * Cv)); }, coul: TF_G_ISOC, nom: 'isochore' });
    if (A.isobare)     c.push({ f: function (S) { return Tr * Math.exp((S - Sr) * 1e-3 / (n * Cv * g)); }, coul: TF_G_ISOB, nom: 'isobare' });
  }
  return c;
}

// Champ de départ : cylindre plein et 0 à 300 kPa en P(V) ; en T(S), ΔS de
// part et d'autre de 0 sur une étendue suivant n·R, et 0 à 500 K. Les
// origines à zéro font lire les aires : travail sous P(V), chaleur sous
// T(S).
function _tfgChampBase(d) {
  if (d === 'pv') return { x1: 0, x2: TF_S * TF_H_CYL * 1e3, y1: 0, y2: 300 };
  var a = _tfgCran(1.5 * tf.n * TF_R * 1e3, TF_G_CRANS);
  return { x1: -a, x2: a, y1: 0, y2: 500 };
}

// Champ fixe d'un diagramme : il ne fait que s'agrandir, en suivant l'état
// actuel dès qu'il approche du bord (fenêtre glissante, pendant la
// transformation et non à son arrivée), pour contenir le chemin défini, les
// états repérés et l'état actuel (son abscisse toujours, son ordonnée si
// elle est tracée : un état non défini n'est pas sur le diagramme, et ses
// oscillations feraient dézoomer pour rien). Les tranches et la pression
// sur le piston n'agrandissent pas
// le champ : un choc le ferait dézoomer pour quelques images (marque au
// bord à la place).
function _tfgChamp(d, mes) {
  var g = tfGraph, D = TF_G_DIAGS[d], e = g.ech, k;
  var b = g.champ[d] || _tfgChampBase(d);
  var ch = { x1: b.x1, x2: b.x2, y1: b.y1, y2: b.y2 };
  function ajoute(x, y) {
    ch.x2 = _tfgBorneSup(ch.x2, x);
    ch.x1 = -_tfgBorneSup(-ch.x1, -x);
    if (y === null) return;
    ch.y2 = _tfgBorneSup(ch.y2, y);
    ch.y1 = -_tfgBorneSup(-ch.y1, -y);
  }
  for (k = 0; k < e.length; k++) ajoute(D.x(e[k]), D.def(e[k]) ? D.y(e[k]) : null);
  for (k = 0; k < tfEtapes.etats.length; k++) ajoute(D.x(tfEtapes.etats[k]), D.yL(tfEtapes.etats[k]));
  ajoute(D.x(mes), D.defM(mes) ? D.yM(mes) : null);
  return (g.champ[d] = ch);
}

// Transition vers le champ : animée pour un saut (retour à un état,
// changement d'option), immédiate pour un suivi continu (moins d'un
// dixième de l'étendue d'une image à l'autre)
function _tfgAnimerChamp(d, ch) {
  var a = tfGraph.anim[d];
  if (a && performance.now() - a.t0 >= TF_G_ANIM) {
    var v = a.vers, sx = (ch.x2 - ch.x1) * 0.1, sy = (ch.y2 - ch.y1) * 0.1;
    if (Math.abs(ch.x1 - v.x1) <= sx && Math.abs(ch.x2 - v.x2) <= sx
        && Math.abs(ch.y1 - v.y1) <= sy && Math.abs(ch.y2 - v.y2) <= sy) a.de = a.vers = ch;
  }
  return _tfgAnimer(d, ch);
}

// Cadrage au plus près (bouton Ajuster) : chemin défini, état de départ,
// tranches depuis le départ, pression sur le piston si elle est tracée
function _tfgCadrage(d) {
  var D = TF_G_DIAGS[d], e = tfGraph.ech, g = tfGraph;
  var x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity;
  function ajoute(x, y) {
    if (x < x1) x1 = x;
    if (x > x2) x2 = x;
    if (y < y1) y1 = y;
    if (y > y2) y2 = y;
  }
  for (var k = 0; k < e.length; k++) {
    var s = e[k];
    if (D.def(s)) ajoute(D.x(s), D.y(s));
    if (d === 'pv' && tfGraphAff.piston) ajoute(s.V * 1e3, s.Pp * 1e-3);
  }
  if (g.ref) ajoute(D.x(g.ref), D.y(g.ref));
  var env = g.env && g.env[d];
  if (tfGraphAff.tranches && env) { ajoute(env.x1, env.y1); ajoute(env.x2, env.y2); }
  return { x1: x1, x2: x2, y1: y1, y2: y2 };
}

// Chaque diagramme d'état dans son encart (rien si l'encart est masqué)
function _tfgDessinerDiagrammes() {
  var mes = tfMesures();
  mes.S = tfEntropie();
  ['pv', 'ts'].forEach(function (d) {
    var o = tfGraph.cv[d];
    tfGraph.geoD[d] = null;
    _tfgTaille(o);
    if (!o.w) return;
    o.ctx.fillStyle = '#fdf8f0';
    o.ctx.fillRect(0, 0, o.w, o.h);
    _tfgDessinerDiag(o, { d: d, x: 0, y: 0, w: o.w, h: o.h }, mes);
  });
}

function _tfgDessinerDiag(o, cs, mes) {
  var d = cs.d, D = TF_G_DIAGS[d];
  var c = o.ctx, W = cs.w, H = cs.h, X = cs.x, Y = cs.y, e = tfGraph.ech, g = tfGraph;

  // La légende occupe une bande au-dessus du tracé (une ou deux lignes)
  var fs = Math.max(10, Math.min(14, Math.round(Math.min(H * 0.045, W * 0.03))));
  var ML = Math.round(fs * 4.4), MR = 12, MB = Math.round(fs * 2.9);
  var hLeg = _tfgLegende(c, d, X + ML, Y + 4, W - ML - MR, fs - 1, false);
  var MT = Math.round(hLeg + 8);
  var pw = W - ML - MR, ph = H - MT - MB;
  if (pw < 60 || ph < 40 || e.length === 0) return;
  var x0 = X + ML, y0 = Y + MT;

  var nX = Math.max(2, Math.floor(pw / (fs * 6))), nY = Math.max(2, Math.floor(ph / (fs * 2.6)));
  var vue = g.vue[d] || _tfgAnimerChamp(d, _tfgChamp(d, mes));
  var pasX = _tfgPas(vue.x2 - vue.x1, nX), pasY = _tfgPas(vue.y2 - vue.y1, nY);
  var xDe = function (x) { return x0 + (x - vue.x1) / (vue.x2 - vue.x1) * pw; };
  var yDe = function (y) { return y0 + ph - (y - vue.y1) / (vue.y2 - vue.y1) * ph; };
  g.geoD[d] = { x0: x0, y0: y0, pw: pw, ph: ph, x1: vue.x1, x2: vue.x2, y1: vue.y1, y2: vue.y2 };
  var px = function (s) { return xDe(D.x(s)); };
  var py = function (s) { return yDe(D.y(s)); };

  // Fond, grille, graduations, titres d'axes
  c.fillStyle = TF_G_FOND;
  c.fillRect(x0, y0, pw, ph);
  var gx = _tfgGraduations(vue.x1, vue.x2, pasX), gy = _tfgGraduations(vue.y1, vue.y2, pasY), k;
  c.strokeStyle = TF_G_GRILLE;
  c.lineWidth = 1;
  c.beginPath();
  for (k = 0; k < gx.length; k++) { var xx = Math.round(xDe(gx[k])) + 0.5; c.moveTo(xx, y0); c.lineTo(xx, y0 + ph); }
  for (k = 0; k < gy.length; k++) { var yy = Math.round(yDe(gy[k])) + 0.5; c.moveTo(x0, yy); c.lineTo(x0 + pw, yy); }
  c.stroke();
  c.fillStyle = TF_G_ENCRE;
  c.font = _tfgPolice(fs, false);
  c.textAlign = 'center';
  c.textBaseline = 'top';
  for (k = 0; k < gx.length; k++) c.fillText(_tfgNb(gx[k], pasX), xDe(gx[k]), y0 + ph + 3);
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  for (k = 0; k < gy.length; k++) c.fillText(_tfgNb(gy[k], pasY), x0 - 4, yDe(gy[k]));
  c.font = _tfgPolice(fs, true);
  c.textBaseline = 'top';
  c.fillText(D.titreX, x0 + pw, y0 + ph + fs * 1.45);
  c.save();
  c.translate(X + fs * 0.2, y0);
  c.rotate(-Math.PI / 2);
  c.textAlign = 'right';
  c.textBaseline = 'top';
  c.fillText(D.titreY, 0, 0);
  c.restore();

  c.save();
  c.beginPath();
  c.rect(x0, y0, pw, ph);
  c.clip();

  // Courbes de référence par l'état de départ de la transformation en cours,
  // ou par l'état de la ligne sélectionnée dans le journal
  var etiq = [], Lr = tfEtapesEtatRef();
  var ref = Lr ? { V: Lr.V, Pm: Lr.P, Tm: Lr.T, S: Lr.S } : g.ref;
  if (ref) {
    var cr = _tfgCourbesRef(d, ref);
    for (k = 0; k < cr.length; k++) etiq.push(_tfgCourbe(c, xDe, yDe, vue, cr[k]));
  }

  // Pression exercée par le piston : l'aire sous ce tracé est le travail
  // reçu par le gaz, juste même hors équilibre
  if (d === 'pv' && tfGraphAff.piston) {
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

  // Chemin : plein tant que la grandeur en ordonnée est définie ; ailleurs,
  // corde pointillée d'un point du squelette au suivant. Le squelette est
  // fait des échantillons définis et, à chaque changement d'étape, du
  // dernier échantillon de l'étape finie, pris à l'état moyen du gaz s'il
  // n'est pas défini (P = (γ − 1)·U/V, T = U/(n·Cv), toujours connus) : une
  // corde ne traverse donc jamais une frontière d'étape. Sans ce point
  // d'ancrage, après une étape interrompue avant l'équilibre, la corde de
  // l'étape suivante partait du dernier état défini, bien antérieur, et la
  // géométrie dépendait de la convention de tracé. Une couleur par étape
  // (celle du point d'arrivée de chaque segment) ; une étape mise en
  // évidence dans le journal laisse les autres en retrait.
  var sel = tfEtapes.sel >= 0 ? tfEtapes.sel + 1 : -1;
  var alpha = function (n) { return sel < 0 || n === sel ? 1 : 0.22; };
  var sq = _tfgSquelette(e, D), q;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  k = 1;
  while (k < sq.length) {
    // Suite de segments de même style et de même étape : un seul tracé
    // (les tirets restent continus). Plein : deux échantillons définis
    // consécutifs.
    var plein = sq[k] === sq[k - 1] + 1 && D.def(e[sq[k - 1]]) && D.def(e[sq[k]]);
    var n = e[sq[k]].etape, j = k;
    while (j + 1 < sq.length && e[sq[j + 1]].etape === n
           && (sq[j + 1] === sq[j] + 1 && D.def(e[sq[j]]) && D.def(e[sq[j + 1]])) === plein) j++;
    c.globalAlpha = alpha(n) * (plein ? 1 : 0.8);
    c.strokeStyle = tfCouleurEtape(n);
    c.lineWidth = plein ? 2.2 : 1.6;
    c.setLineDash(plein ? [] : [3, 4]);
    c.beginPath();
    c.moveTo(px(e[sq[k - 1]]), py(e[sq[k - 1]]));
    for (q = k; q <= j; q++) c.lineTo(px(e[sq[q]]), py(e[sq[q]]));
    c.stroke();
    k = j + 1;
  }
  c.globalAlpha = 1;
  c.setLineDash([]);
  c.lineCap = 'butt';

  // Sens de parcours : une flèche au milieu (en longueur) du chemin de
  // chaque étape, cordes comprises
  _tfgFleches(c, e, sq, px, py, alpha);

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
  c.lineWidth = 1.2;
  c.strokeStyle = TF_G_FOND;
  for (k = 0; k < etats.length; k++) {
    c.globalAlpha = alpha(etats[k].etape);
    c.beginPath();
    c.arc(px(etats[k]), py(etats[k]), 3.5, 0, 2 * Math.PI);
    c.fillStyle = tfCouleurEtape(etats[k].etape);
    c.fill();
    c.stroke();
  }
  c.globalAlpha = 1;

  // Chaque tranche, à l'abscisse du gaz (son volume, son entropie) : trait
  // vertical de la plus basse à la plus haute, puis un point par tranche
  // coloré selon T comme les molécules
  if (tfGraphAff.tranches) {
    var xt = xDe(D.x(mes));
    c.strokeStyle = TF_G_ND;
    c.globalAlpha = 0.5;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(xt, yDe(D.yMin(mes)));
    c.lineTo(xt, yDe(D.yMax(mes)));
    c.stroke();
    c.globalAlpha = 1;
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(255,253,249,0.9)';
    for (var jt = 0; jt < TF_N; jt++) {
      c.beginPath();
      c.arc(xt, yDe(D.tranche(jt)), 3, 0, 2 * Math.PI);
      c.fillStyle = tfAff.couleurT ? _tfMelangeT(tfTTranche(jt), TF_COUL_MOL, 1) : '#4a627c';
      c.fill();
      c.stroke();
    }
    // Tranches hors du champ : un triangle au bord, pointé vers elles
    c.fillStyle = TF_G_ND;
    if (D.yMax(mes) > vue.y2) _tfgMarqueBord(c, xt, y0 + 1, 1);
    if (D.yMin(mes) < vue.y1) _tfgMarqueBord(c, xt, y0 + ph - 1, -1);
  }

  // États repérés par une lettre (départs et arrivées des étapes)
  _tfgLettres(c, D, xDe, yDe, fs, alpha);

  // Arrivées prévues de l'action préparée : cercle pointillé, nom à côté
  _tfgPrevus(c, D, xDe, yDe, fs);

  // État actuel, s'il est défini : halo et anneau d'une couleur réservée,
  // par-dessus tout le reste
  var defM = D.defM(mes);
  if (defM) {
    var xa0 = xDe(D.x(mes)), ya0 = yDe(D.yM(mes));
    c.beginPath();
    c.arc(xa0, ya0, 13, 0, 2 * Math.PI);
    c.fillStyle = 'rgba(232,96,32,0.18)';
    c.fill();
    c.beginPath();
    c.arc(xa0, ya0, 7.5, 0, 2 * Math.PI);
    c.fillStyle = '#fff';
    c.fill();
    c.strokeStyle = TF_G_ACTUEL;
    c.lineWidth = 3;
    c.stroke();
    c.beginPath();
    c.arc(xa0, ya0, 2.5, 0, 2 * Math.PI);
    c.fillStyle = TF_G_ACTUEL;
    c.fill();
  }
  c.restore();

  c.strokeStyle = TF_G_CADRE;
  c.lineWidth = 1;
  c.strokeRect(x0 + 0.5, y0 + 0.5, pw - 1, ph - 1);

  // Étiquettes directes, en quinconce au-dessus et au-dessous des courbes
  for (k = 0; k < etiq.length; k++) {
    if (!etiq[k]) continue;
    var ye = etiq[k].y + (k % 2 === 0 ? -fs * 0.8 : fs * 0.8);
    ye = Math.max(y0 + fs * 0.8, Math.min(y0 + ph - fs * 0.8, ye));
    _tfgEtiquette(c, etiq[k].nom, etiq[k].x, ye, fs - 1, etiq[k].coul, 'right');
  }
  // Mention « non définie » en bas à gauche, coin vide pour les
  // transformations usuelles (basse pression à petit volume, basse
  // température), et légende fixe au-dessus du tracé
  if (!defM) _tfgEtiquette(c, tfGraphAff.ext ? 'Gaz hors d’équilibre avec l’extérieur' : D.nd,
                           x0 + 8, y0 + ph - fs, fs, TF_G_ND, 'left');
  _tfgLegende(c, d, x0, Y + 4, pw, fs - 1, true);

  var gl = g.glisse;

  // Réticule
  var so = g.souris;
  if (g.reticule && so && so.cible === d && !gl
      && so.x >= x0 && so.x <= x0 + pw && so.y >= y0 && so.y <= y0 + ph) {
    c.strokeStyle = '#2a6aaa';
    c.lineWidth = 1;
    c.setLineDash([4, 3]);
    c.beginPath();
    c.moveTo(so.x, y0); c.lineTo(so.x, y0 + ph);
    c.moveTo(x0, so.y); c.lineTo(x0 + pw, so.y);
    c.stroke();
    c.setLineDash([]);
    var xv = vue.x1 + (so.x - x0) / pw * (vue.x2 - vue.x1);
    var yv = vue.y1 + (y0 + ph - so.y) / ph * (vue.y2 - vue.y1);
    _tfgBulle(c, D.lu(xv, yv), so.x, so.y, X + W, Y + H, fs);
  }
}

function _tfgPrevus(c, D, xDe, yDe, fs) {
  var P = tfGraph.prevu;
  for (var k = 0; k < P.length; k++) {
    var x = xDe(D.x(P[k])), y = yDe(D.yL(P[k]));
    c.beginPath();
    c.arc(x, y, 7, 0, 2 * Math.PI);
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fill();
    c.strokeStyle = TF_G_ACTUEL;
    c.lineWidth = 2;
    c.setLineDash([3, 3]);
    c.stroke();
    c.setLineDash([]);
    if (P[k].nom) _tfgEtiquette(c, P[k].nom, x + 11, y, fs - 1, TF_G_ACTUEL, 'left');
  }
}

// Squelette du chemin (indices dans e) : échantillons définis, plus le
// premier et, à chaque changement d'étape, le dernier de l'étape finie,
// définis ou non (état moyen du gaz). L'étape en cours n'a pas d'ancrage
// final : sa corde s'arrête au dernier état défini.
function _tfgSquelette(e, D) {
  var sq = [], k;
  for (k = 0; k < e.length; k++) {
    if (k === 0 || D.def(e[k]) || (k + 1 < e.length && e[k + 1].etape !== e[k].etape)) sq.push(k);
  }
  return sq;
}

// Flèche de sens au milieu de chaque étape : le chemin d'une étape est la
// suite de ses points du squelette, précédée du dernier point d'avant
// (départ). Rien si l'étape est trop courte à l'écran.
function _tfgFleches(c, e, sq, px, py, alpha) {
  var pts = {}, dernier = null, k, n;
  for (k = 0; k < sq.length; k++) {
    n = e[sq[k]].etape;
    if (!pts[n]) pts[n] = dernier ? [dernier] : [];
    pts[n].push([px(e[sq[k]]), py(e[sq[k]])]);
    dernier = pts[n][pts[n].length - 1];
  }
  for (n in pts) {
    var p = pts[n], L = 0, i;
    for (i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    if (L < 24) continue;
    var cible = L / 2, cumul = 0;
    for (i = 1; i < p.length; i++) {
      var dd = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (cumul + dd >= cible && dd > 0) {
        var f = (cible - cumul) / dd;
        var x = p[i - 1][0] + f * (p[i][0] - p[i - 1][0]);
        var y = p[i - 1][1] + f * (p[i][1] - p[i - 1][1]);
        var a = Math.atan2(p[i][1] - p[i - 1][1], p[i][0] - p[i - 1][0]);
        c.globalAlpha = alpha(+n);
        c.fillStyle = tfCouleurEtape(+n);
        c.strokeStyle = TF_G_FOND;
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(x + 9 * Math.cos(a), y + 9 * Math.sin(a));
        c.lineTo(x + 7 * Math.cos(a + 2.5), y + 7 * Math.sin(a + 2.5));
        c.lineTo(x + 7 * Math.cos(a - 2.5), y + 7 * Math.sin(a - 2.5));
        c.closePath();
        c.fill();
        c.stroke();
        break;
      }
      cumul += dd;
    }
  }
  c.globalAlpha = 1;
}

// Lettres des états d'équilibre du journal : pastille blanche cerclée de la
// couleur de l'étape qui y arrive, lettre à côté
function _tfgLettres(c, D, xDe, yDe, fs, alpha) {
  var E = tfEtapes, arrivee = {};
  for (var k = 0; k < E.liste.length; k++) {
    if (E.liste[k].arrivee !== null) arrivee[E.liste[k].arrivee] = k + 1;
  }
  c.font = _tfgPolice(fs + 1, true);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (var i = 0; i < E.etats.length; i++) {
    var L = E.etats[i], n = arrivee[i] || 0;
    if (L.retour !== undefined) continue;   // état retrouvé : sa lettre y est déjà
    var x = xDe(D.x(L)), y = yDe(D.yL(L));
    c.globalAlpha = alpha(n) < 1 && !(E.sel >= 0 && E.liste[E.sel].depart === i) ? 0.35 : 1;
    c.beginPath();
    c.arc(x, y, 5, 0, 2 * Math.PI);
    c.fillStyle = '#fff';
    c.fill();
    c.strokeStyle = tfCouleurEtape(n);
    c.lineWidth = 2.5;
    c.stroke();
    var tx = x - fs * 0.9, ty = y - fs * 0.9;
    var w = c.measureText(L.lettre).width + 6;
    c.fillStyle = 'rgba(255,253,249,0.9)';
    c.fillRect(tx - w / 2, ty - fs * 0.65, w, fs * 1.3);
    c.fillStyle = tfCouleurEtape(n);
    c.fillText(L.lettre, tx, ty + 0.5);
  }
  c.globalAlpha = 1;
}

// Trace une courbe de référence sur la vue ; renvoie où poser son
// étiquette : point visible le plus à droite d'une courbe y(x), haut d'une
// verticale, droite d'une horizontale
function _tfgCourbe(c, xDe, yDe, vue, cr) {
  var dern = null;
  c.strokeStyle = cr.coul;
  c.lineWidth = 1.5;
  c.beginPath();
  if (cr.vert !== undefined) {
    var xv = xDe(cr.vert);
    c.moveTo(xv, yDe(vue.y1));
    c.lineTo(xv, yDe(vue.y2));
    if (cr.vert >= vue.x1 && cr.vert <= vue.x2) dern = { x: xv - 4, y: yDe(vue.y2) + 20 };
  } else if (cr.horiz !== undefined) {
    var yh = yDe(cr.horiz);
    c.moveTo(xDe(vue.x1), yh);
    c.lineTo(xDe(vue.x2), yh);
    if (cr.horiz >= vue.y1 && cr.horiz <= vue.y2) dern = { x: xDe(vue.x2) - 6, y: yh };
  } else {
    var n = 160;
    for (var i = 0; i <= n; i++) {
      var X = vue.x1 + (vue.x2 - vue.x1) * i / n, Yc = cr.f(X);
      var x = xDe(X), y = yDe(Yc);
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      if (Yc >= vue.y1 && Yc <= vue.y2 && i < n * 0.97) dern = { x: x, y: y };
    }
  }
  c.stroke();
  return dern ? { x: dern.x, y: dern.y, nom: cr.nom, coul: cr.coul } : null;
}

// Légende fixe, en bande au-dessus du tracé : toujours les mêmes éléments
// (seules les options du menu en ajoutent), sur une ligne, ou deux si la
// largeur manque. dessiner faux : renvoie seulement la hauteur de la bande.
function _tfgLegende(c, d, x0, y0, largeur, fs, dessiner) {
  var items = [{ type: 'ligne', coul: TF_G_CHEMIN, nom: 'chemin' },
               { type: 'tirets', coul: '#9aa4ac', nom: 'non défini' },
               { type: 'point', coul: TF_G_CHEMIN, nom: 'équilibre' },
               { type: 'actuel', nom: 'actuel' }];
  if (tfGraphAff.tranches) items.push({ type: 'tranches', nom: 'tranches' });
  if (d === 'pv' && tfGraphAff.piston) items.push({ type: 'tirets', coul: TF_G_PISTON, nom: 'P piston' });

  c.font = _tfgPolice(fs, false);
  var sw = fs * 1.5, lh = fs * 1.35, ecart = fs * 1.1;
  var x = x0, y = y0, lignes = 1, i, it, wi;
  for (i = 0; i < items.length; i++) {
    it = items[i];
    wi = sw + 4 + c.measureText(it.nom).width;
    if (x > x0 && x + wi > x0 + largeur) { x = x0; y += lh; lignes++; }
    it.x = x; it.y = y + lh / 2;
    x += wi + ecart;
  }
  if (!dessiner) return lignes * lh;

  for (i = 0; i < items.length; i++) {
    it = items[i];
    var xs = it.x, yc = it.y;
    if (it.type === 'point') {
      c.beginPath();
      c.arc(xs + sw / 2, yc, 3.5, 0, 2 * Math.PI);
      c.fillStyle = it.coul;
      c.fill();
    } else if (it.type === 'actuel') {
      c.beginPath();
      c.arc(xs + sw / 2, yc, 4.5, 0, 2 * Math.PI);
      c.fillStyle = '#fff';
      c.fill();
      c.strokeStyle = TF_G_ACTUEL;
      c.lineWidth = 2.5;
      c.stroke();
    } else if (it.type === 'tranches') {
      var cl = [[24, 88, 196], [74, 98, 124], [200, 52, 28]];
      for (var p = 0; p < 3; p++) {
        c.beginPath();
        c.arc(xs + sw / 2, yc + (p - 1) * fs * 0.36, 2.2, 0, 2 * Math.PI);
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
    c.fillText(it.nom, xs + sw + 4, yc);
  }
  return lignes * lh;
}

// Triangle au bord du tracé, pointé vers le haut (sens 1) ou le bas (−1)
function _tfgMarqueBord(c, x, y, sens) {
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x - 5, y + sens * 8);
  c.lineTo(x + 5, y + sens * 8);
  c.closePath();
  c.fill();
}

// ══════════════════════════════════════════════════════════════════════
//  Rendu (appelé par la boucle de tf-ui.js)
// ══════════════════════════════════════════════════════════════════════

function tfGraphDessiner() {
  if (!tfGraph.cv || !tfGraph.sale) return;
  tfGraph.sale = false;
  _tfgDessinerDiagrammes();
  _tfgDessinerTemps();
}

// ══════════════════════════════════════════════════════════════════════
//  Outils : vue précédente, étape, tout voir, ajuster, champ, réticule
// ══════════════════════════════════════════════════════════════════════

function tfGraphPrecedente(cible) {
  var g = tfGraph;
  if (cible === 't') g.vueT = g.pileT.length ? g.pileT.pop() : null;
  else if (g.pileD[cible].length) g.vue[cible] = g.pileD[cible].pop();
  g.sale = true;
}

// Retour à l'étape en cours (bouton Étape)
function tfGraphSuivre() {
  tfGraph.vueT = null;
  tfGraph.pileT = [];
  tfGraph.sale = true;
}

function tfGraphToutVoir() {
  var g = tfGraph, e = g.ech;
  if (e.length < 2) return;
  g.pileT.push(g.vueT);
  g.vueT = { t1: e[0].t, t2: Math.max(e[e.length - 1].t, e[0].t + 1e-4), o: 0, lt: '' };
  g.sale = true;
}

// Diagramme d'état ('pv' ou 'ts') cadré au plus près du chemin : une vue
// figée, comme un zoom (↶ pour revenir)
function tfGraphAjuster(d) {
  var g = tfGraph, D = TF_G_DIAGS[d], cad = _tfgCadrage(d);
  if (!isFinite(cad.x1) || !isFinite(cad.y1)) return;
  var bx = _tfgBornes(cad.x1, cad.x2, D.spanX, 5), by = _tfgBornes(cad.y1, cad.y2, D.spanY, 4);
  g.pileD[d].push(g.vue[d]);
  g.vue[d] = { x1: bx.lo, x2: bx.hi, y1: by.lo, y2: by.hi };
  g.sale = true;
}

// Retour au champ fixe
function tfGraphChamp(d) {
  tfGraph.vue[d] = null;
  tfGraph.pileD[d] = [];
  tfGraph.sale = true;
}

// Menu Options des graphes : s'ouvre sous son bouton, se ferme par un
// second clic, un clic ailleurs ou Échap
function tfGraphMenu(ouvrir) {
  var m = document.getElementById('tf-options-menu');
  if (ouvrir === undefined) ouvrir = m.hidden;
  m.hidden = !ouvrir;
  document.getElementById('tf-btn-options').classList.toggle('active', ouvrir);
  document.getElementById('tf-btn-options').setAttribute('aria-expanded', ouvrir ? 'true' : 'false');
}

// ── Encarts de la colonne gauche ──
// Barre de quatre boutons activables : P = f(V), T = f(S), graphes au cours
// du temps, tableau ; de 0 à 4 encarts. Les encarts de graphe affichés se
// partagent la hauteur selon leurs poids (variables CSS --tf-poids-…,
// réglées par les splitters) ; sans aucun encart, la colonne se réduit à la
// barre, et le cylindre prend la place.
var TF_G_VUES = ['pv', 'ts', 'temps', 'tableau'];

function tfGraphBasculerVue(v) {
  tfGraph.vues[v] = !tfGraph.vues[v];
  _tfgMajVues();
}

function _tfgMajVues() {
  var V = tfGraph.vues, aucun = true;
  TF_G_VUES.forEach(function (v) {
    document.getElementById('tf-vue-' + v).classList.toggle('active', V[v]);
    document.getElementById(v === 'tableau' ? 'tf-info' : 'tf-' + v + '-zone').style.display = V[v] ? '' : 'none';
    if (V[v]) aucun = false;
  });
  // Splitter entre deux encarts de graphe affichés : celui qui suit pv
  // (vers ts ou, ts masqué, vers temps), celui qui suit ts
  document.getElementById('tf-hsplit-pv').style.display = V.pv && (V.ts || V.temps) ? '' : 'none';
  document.getElementById('tf-hsplit-ts').style.display = V.ts && V.temps ? '' : 'none';
  // Le tableau seul se range en haut de la colonne
  document.getElementById('tf-graph-col').classList.toggle('tf-sans-graphe', !V.pv && !V.ts && !V.temps);
  document.getElementById('tf-left-col').classList.toggle('tf-sans-encart', aucun);
  tfGraph.sale = true;
  if (typeof tfResize === 'function') tfResize();
}

function tfGraphReticule() {
  tfGraph.reticule = !tfGraph.reticule;
  var b = document.querySelectorAll('.tf-btn-reticule');
  for (var i = 0; i < b.length; i++) b[i].classList.toggle('active', tfGraph.reticule);
  tfGraph.sale = true;
}

function tfOnAffGraphe(cle, coche) {
  tfGraphAff[cle] = coche;
  if (cle === 'gel' && !coche && tfGraph.gele) tfGraphDegeler();
  tfGraph.sale = true;
}

// ── Souris : glisser = déplacer la vue, molette = zoomer autour du
// curseur, réticule. Chaque graphe a sa vue : déplacer ou zoomer la fige
// (↶ revient à la précédente ; Champ ou Étape, à la vue automatique).
function _tfgPos(o, ev) {
  var r = o.c.getBoundingClientRect();
  return { x: (ev.clientX - r.left) * o.w / r.width, y: (ev.clientY - r.top) * o.h / r.height };
}

// Vue affichée d'un graphe, telle que tracée à la dernière image
function _tfgVueAffichee(cible) {
  var g = tfGraph;
  if (cible === 't') return g.geoT && { t1: g.geoT.t1, t2: g.geoT.t2, o: g.geoT.o, lt: g.geoT.lt };
  var gp = g.geoD[cible];
  return gp && { x1: gp.x1, x2: gp.x2, y1: gp.y1, y2: gp.y2 };
}

// Garde la vue actuelle pour ↶, une fois par geste (les crans d'une même
// rotation de molette ne s'empilent pas un à un)
function _tfgEmpiler(cible) {
  var g = tfGraph, now = performance.now();
  if (g.empile[cible] && now - g.empile[cible] < 600) { g.empile[cible] = now; return; }
  g.empile[cible] = now;
  if (cible === 't') g.pileT.push(g.vueT);
  else g.pileD[cible].push(g.vue[cible]);
}

function _tfgSouris(o, cible) {
  var g = tfGraph;
  o.c.style.cursor = 'grab';
  o.c.addEventListener('pointerdown', function (ev) {
    var p = _tfgPos(o, ev);
    var geo = cible === 't' ? g.geoT : g.geoD[cible];
    if (!geo || p.x < geo.x0 || p.x > geo.x0 + geo.pw) return;
    g.glisse = { cible: cible, x0: p.x, y0: p.y, vue0: _tfgVueAffichee(cible), bouge: false };
    try { o.c.setPointerCapture(ev.pointerId); } catch (x) { /* pointeur déjà relâché */ }
    o.c.style.cursor = 'grabbing';
    ev.preventDefault();
  });
  o.c.addEventListener('pointermove', function (ev) {
    var p = _tfgPos(o, ev), gl = g.glisse;
    g.souris = { cible: cible, x: p.x, y: p.y };
    if (gl && gl.cible === cible && gl.vue0) {
      var dx = p.x - gl.x0, dy = p.y - gl.y0;
      if (!gl.bouge && Math.abs(dx) + Math.abs(dy) > 3) { gl.bouge = true; _tfgEmpiler(cible); }
      if (gl.bouge) {
        var v = gl.vue0;
        if (cible === 't') {
          var dt = -dx / g.geoT.pw * (v.t2 - v.t1);
          g.vueT = { t1: v.t1 + dt, t2: v.t2 + dt, o: v.o, lt: v.lt };
        } else {
          var gp = g.geoD[cible];
          var ddx = -dx / gp.pw * (v.x2 - v.x1), ddy = dy / gp.ph * (v.y2 - v.y1);
          g.vue[cible] = { x1: v.x1 + ddx, x2: v.x2 + ddx, y1: v.y1 + ddy, y2: v.y2 + ddy };
        }
      }
    }
    g.sale = true;
  });
  var fin = function () {
    g.glisse = null;
    o.c.style.cursor = 'grab';
    g.sale = true;
  };
  o.c.addEventListener('pointerup', fin);
  o.c.addEventListener('pointercancel', fin);
  o.c.addEventListener('pointerleave', function () {
    g.souris = null;
    g.sale = true;
  });
  // Molette : facteur exponentiel du défilement (×1,16 par cran usuel de
  // 100), le point sous le curseur reste en place ; en temps, seul l'axe
  // des temps change
  o.c.addEventListener('wheel', function (ev) {
    var p = _tfgPos(o, ev), v = _tfgVueAffichee(cible);
    var geo = cible === 't' ? g.geoT : g.geoD[cible];
    if (!v || p.x < geo.x0 || p.x > geo.x0 + geo.pw) return;
    ev.preventDefault();
    var dy = ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaY;
    var f = Math.exp(Math.max(-300, Math.min(300, dy)) * 0.0015);
    _tfgEmpiler(cible);
    var fx = (p.x - geo.x0) / geo.pw;
    if (cible === 't') {
      var tc = v.t1 + fx * (v.t2 - v.t1);
      g.vueT = { t1: tc + (v.t1 - tc) * f, t2: tc + (v.t2 - tc) * f, o: v.o, lt: v.lt };
    } else {
      var xc = v.x1 + fx * (v.x2 - v.x1);
      var yc = v.y1 + (geo.y0 + geo.ph - p.y) / geo.ph * (v.y2 - v.y1);
      g.vue[cible] = { x1: xc + (v.x1 - xc) * f, x2: xc + (v.x2 - xc) * f,
                       y1: yc + (v.y1 - yc) * f, y2: yc + (v.y2 - yc) * f };
    }
    g.sale = true;
  }, { passive: false });
}

// ══════════════════════════════════════════════════════════════════════
//  Splitters de la colonne gauche
//  Les partages sont des pourcentages (variables CSS) : ils tiennent d'eux-
//  mêmes au redimensionnement, et la disposition étroite peut les ignorer.
//  Entre deux encarts de graphe, le splitter partage la hauteur des deux
//  encarts affichés qui l'entourent (poids --tf-poids-…, leur somme gardée).
// ══════════════════════════════════════════════════════════════════════

function _tfgSplitterH(sp) {
  function voisin(el, sens) {
    for (el = el[sens]; el; el = el[sens]) {
      if (el.classList.contains('tf-graphe') && el.style.display !== 'none') return el;
    }
    return null;
  }
  sp.addEventListener('pointerdown', function (ev) {
    var a = voisin(sp, 'previousElementSibling'), b = voisin(sp, 'nextElementSibling');
    if (!a || !b) return;
    ev.preventDefault();
    try { sp.setPointerCapture(ev.pointerId); } catch (x) { /* pointeur déjà relâché */ }
    sp.classList.add('dragging');
    var col = sp.parentElement.style;
    var pa = parseFloat(getComputedStyle(a).flexGrow) || 1, pb = parseFloat(getComputedStyle(b).flexGrow) || 1;
    var bouge = function (e2) {
      var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      var f = (e2.clientY - ra.top) / (rb.bottom - ra.top);
      f = Math.max(0.15, Math.min(0.85, f));
      col.setProperty('--tf-poids-' + a.dataset.vue, ((pa + pb) * f).toFixed(3));
      col.setProperty('--tf-poids-' + b.dataset.vue, ((pa + pb) * (1 - f)).toFixed(3));
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
  tfGraph.cv = { pv: cv('tf-canvas-pv'), ts: cv('tf-canvas-ts'), t: cv('tf-canvas-temps') };
  _tfgSouris(tfGraph.cv.pv, 'pv');
  _tfgSouris(tfGraph.cv.ts, 'ts');
  _tfgSouris(tfGraph.cv.t, 't');

  var col = document.getElementById('tf-left-col');
  _tfgSplitter('tf-vsplit', col, col, '--tf-larg-graphes', 'x', 0.25, 0.7);
  _tfgSplitterH(document.getElementById('tf-hsplit-pv'));
  _tfgSplitterH(document.getElementById('tf-hsplit-ts'));
  _tfgMajVues();

  // Toute zone qui change de taille (fenêtre, splitters, bascule d'onglet)
  // est redessinée ; la scène garde sa propre mise à l'échelle
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function () { tfGraph.sale = true; tfResize(); });
    ro.observe(tfGraph.cv.pv.c.parentElement);
    ro.observe(tfGraph.cv.ts.c.parentElement);
    ro.observe(tfGraph.cv.t.c.parentElement);
    ro.observe(document.getElementById('tf-sim-area'));
  }
  window.addEventListener('resize', function () { tfGraph.sale = true; });

  for (var cle in tfGraphAff) {
    document.getElementById('tf-ckg-' + cle).checked = tfGraphAff[cle];
  }
  document.getElementById('tf-ckg-gaz').checked = !tfGraphAff.ext;
  var opt = document.getElementById('tf-options');
  document.addEventListener('pointerdown', function (ev) {
    if (!opt.contains(ev.target)) tfGraphMenu(false);
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') tfGraphMenu(false);
  });
  tf.echantillon = _tfgEchantillon;
  tfGraphEffacer();
}
