// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  sim.js — État global et physique de la simulation
//  Chargé en PREMIER. Expose l'objet `sim` et toutes les fonctions
//  physiques utilisées par fil.js (rendu) et ui.js (contrôles + boucle).
//
//  Modèle retenu : modèle de Drude « lycée ».
//    - Le réseau de cations est FIXE (le cristal du métal).
//    - Chaque électron vole en ligne droite entre deux chocs ; sous tension
//      il est accéléré par le champ pendant ce vol.
//    - À chaque choc sur un cation, sa vitesse est remise à la vitesse
//      d'agitation thermique dans une direction aléatoire : toute la
//      mémoire de l'accélération est perdue.
//  Conséquence, et c'est tout l'intérêt : la vitesse de dérive n'augmente
//  pas indéfiniment, elle se stabilise à v = a·τ, donc proportionnelle à U
//  (loi d'Ohm) et d'autant plus faible que les chocs sont fréquents.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ══════════════════════════════════════════════════════════════════════
//  Constantes de modèle
// ══════════════════════════════════════════════════════════════════════

// ── Réseau de cations ──────────────────────────────────────────────────
// Colonnes alternées de 3 puis 2 ions, décalées d'un demi-pas : c'est un
// empilement compact, celui d'un vrai cristal métallique, et non une
// grille carrée. Trois rangées suffisent à rendre le zigzag lisible sans
// transformer le fil en mur d'obstacles, et laissent chaque ion assez gros
// à l'écran.
//
// Le pas VERTICAL vaut hauteur intérieure / 3 ; le pas HORIZONTAL en
// découle (√3/2 du pas vertical, l'écartement d'un empilement compact).
// Tout le reste — rayons, vitesses, accélération — s'exprime par rapport à
// eux : la simulation est donc identique à toute taille de canvas.
var ROWS      = 3;
var COL_RATIO = 0.866;   // √3/2 : pas horizontal / pas vertical

// Rayon d'un électron, en fraction du pas du réseau.
var RE_FRAC = 0.11;

// ── Curseur « gêne au déplacement » ────────────────────────────────────
// Il règle l'encombrement des ions du réseau, donc la fréquence des chocs,
// donc le temps de vol moyen τ : c'est la mobilité des porteurs. Avec la
// densité n, ce sont les deux causes de la conductivité (σ = n·e²·τ/m).
// Le rayon de collision vaut rCation + rElectron ; il reste inférieur à un
// demi-pas sur toute la plage, sinon le réseau fermerait complètement les
// couloirs et plus aucun électron ne passerait.
var GENE_STEPS   = [0.105, 0.155, 0.21, 0.26, 0.30]; // rayon cation / pas
var GENE_LABELS  = ['Très faible', 'Faible', 'Moyenne', 'Forte', 'Très forte'];
var GENE_DEFAULT = 2;

// ── Désordre du réseau ─────────────────────────────────────────────────
// Un réseau PARFAITEMENT régulier laisse entre ses rangées des couloirs
// horizontaux entièrement libres : dès que le champ couche les
// trajectoires sur l'axe du fil, une partie des électrons les enfile et
// traverse tout le fil sans jamais heurter un ion. C'est un artefact de la
// périodicité (l'effet de canalisation), pas de la physique visée : il
// ferait croire que les chocs sont accessoires, et il rend la vitesse de
// dérive plus que proportionnelle à U.
// L'empilement compact en quinconce y répond déjà presque seul : les ions
// des colonnes à 2 se logent dans les creux des colonnes à 3, si bien que
// les rangées se succèdent tous les DEMI-pas verticaux. Aucune ligne
// horizontale ne passe entre elles dès que le rayon de collision dépasse
// un quart du pas — c'est le cas sur presque toute la plage du curseur de
// gêne. Il ne reste qu'au cran le plus faible une fente étroite, que
// referme un décalage minime de chaque ion autour de son site.
// Ce décalage est volontairement PETIT : au-delà, l'œil cesse de lire le
// quinconce et ne voit plus qu'un semis d'ions. Il est tiré une fois pour
// toutes, pas à chaque image — le réseau reste strictement immobile.
var LAT_JITTER = 0.045;

// ── Valence : neutralité du milieu ─────────────────────────────────────
// Le fil doit rester NEUTRE. Faire varier librement le nombre d'électrons
// à réseau fixe le chargerait en permanence ; faire varier le nombre
// d'ions changerait du même coup la fréquence des chocs, et le curseur de
// densité se confondrait avec celui de gêne.
// La sortie est celle de la physique réelle : un atome du réseau libère
// k électrons et devient un ion k+. Le réseau ne bouge pas, le nombre
// d'électrons vaut k × (nombre d'ions), et la compensation des charges est
// exacte quel que soit k — elle est portée par la CHARGE des ions, pas par
// leur nombre. k = 1 (cuivre), 2 (zinc), 3 (aluminium).
var VALENCE_MIN     = 1;
var VALENCE_MAX     = 3;
var VALENCE_DEFAULT = 1;

// ── Vitesse d'agitation thermique ──────────────────────────────────────
// Exprimée en fraction de la hauteur intérieure du fil parcourue par
// seconde. Constante : le modèle est à température fixe, donc à énergie
// cinétique d'agitation constante (un choc redistribue la direction, pas
// le module).
var VTH_FRAC = 0.90;

// ── Accélération imposée par le champ ──────────────────────────────────
// a = ACC_FRAC × hauteur intérieure × U  (px·s⁻²).
// Calibrée pour qu'à U = 12 V et gêne « Moyenne » la vitesse de dérive
// atteigne environ la moitié de la vitesse d'agitation : le mouvement
// d'ensemble devient alors franchement visible sans que le fourmillement
// disparaisse.
var ACC_FRAC = 0.239;

// Plafond de vitesse, en multiples de la vitesse d'agitation. Sert de
// garde-fou numérique (gêne très faible + tension maximale) et borne le
// nombre de sous-pas nécessaires contre le tunneling à travers un cation.
var VMAX_FACTOR = 3.0;

// ── Étalonnage des grandeurs affichées ─────────────────────────────────
// La simulation mesure une dérive en pixels ; on la ramène d'abord à une
// grandeur sans dimension (fraction de la vitesse d'agitation), ce qui la
// rend indépendante de la taille du canvas, puis on l'étalonne sur des
// ordres de grandeur réels.
// Les réglages par défaut (U = 6 V, gêne « Moyenne ») donnent en régime
// établi vdNorm ≈ 0,28 ; les deux constantes ci-dessous y calent 0,10 mm/s
// — valeur typique de la vitesse de dérive dans un fil de cuivre d'un
// circuit de TP — et 150 mA. Les deux affichages étant proportionnels à la
// même mesure, ils restent toujours cohérents entre eux (I = n·e·S·v).
// I est proportionnelle à la DENSITÉ de porteurs, pas au nombre
// d'électrons affichés : une fenêtre plus large montre un plus long morceau
// de fil, donc plus d'électrons, sans que l'intensité change. La densité
// d'ions étant fixée par la géométrie du réseau, elle vaut k × (densité
// d'ions) — donc I ∝ k × vdNorm, indépendamment de la taille du canvas.
var VD_MM_PER_NORM = 0.36;   // mm/s pour vdNorm = 1
var K_I            = 535;    // mA par unité de valence et de vdNorm

// Constante de temps du lissage des mesures, en régime établi (ms).
// Longue à dessein : la moyenne instantanée des vitesses de quelques
// dizaines d'électrons fluctue de près de 10 %, et il faut une fenêtre de
// plusieurs secondes pour ramener ce bruit à quelques pour cent.
// Un lissage exponentiel à cette constante mettrait toutefois une bonne
// dizaine de secondes à monter après la fermeture du circuit. La parade,
// dans updateMeasures(), est de repartir d'une MOYENNE COURANTE depuis le
// dernier changement de régime : son coefficient 1/n décroît d'image en
// image, elle converge donc tout de suite, puis l'exponentielle prend le
// relais dès qu'elle devient la plus lente des deux. On a la réactivité au
// début et la stabilité ensuite, sans arbitrer entre les deux.
var MEASURE_TAU = 6000;

// Vitesse d'animation — mêmes crans et même étiquetage que ondes/ et
// pression/, qui portent déjà ce curseur.
var SPEED_STEPS = [0.10, 0.25, 0.50, 1.00];

// Longueur maximale de la trace de l'électron suivi (points).
var TRACE_MAX = 2200;

// ══════════════════════════════════════════════════════════════════════
//  État global
// ══════════════════════════════════════════════════════════════════════

var sim = {

  // ── Commandes ──
  U_V       : 6,      // tension imposée aux bornes du fil (V), signée
  circuitOn : false,  // interrupteur du circuit (false = ouvert)
  valence   : VALENCE_DEFAULT,   // électrons libérés par atome du réseau
  geneIdx   : GENE_DEFAULT,

  // Déduits de la valence et de la géométrie (cf. updateGeometry) :
  nSites : 0,   // nombre d'ions du réseau
  nElec  : 0,   // nombre d'électrons = valence × nSites

  paused       : false,
  speedFactor  : 1,
  showMeasures : true,

  // ── Électrons ──
  // Tableau d'objets {x, y, vx, vy} en pixels / pixels par seconde.
  electrons : [],

  // Électron suivi (indice dans `electrons`, -1 si aucun) et sa trace.
  // La trace est une suite de points {x, y, b} ; `b` marque une rupture
  // de tracé (l'électron vient d'être réinjecté à l'autre extrémité).
  tracedIdx : -1,
  trace     : [],

  // ── Géométrie du fil, en pixels (calculée par fil.js) ──
  tx1 : 0, tx2 : 0,   // bords intérieurs gauche / droit
  ty1 : 0, ty2 : 0,   // bords intérieurs haut / bas
  ax  : 0, ay  : 0,   // pas du réseau selon x et y
  cols : 0,           // nombre de colonnes d'ions (alternance 3 / 2)

  // Positions des ions : `latCols` les groupe par colonne (c'est ainsi que
  // nearestCation les interroge), `lattice` est la même liste à plat pour
  // le rendu. `latOff` garde les décalages normalisés, conservés d'un
  // redimensionnement à l'autre — le réseau ne doit pas se retirer au sort
  // à chaque changement de taille de fenêtre.
  latCols : [],
  lattice : [],
  latOff  : [],

  // ── Grandeurs dérivées de la géométrie ──
  vth     : 0,   // vitesse d'agitation (px/s)
  rElec   : 0,   // rayon d'un électron (px)
  rCation : 0,   // rayon d'un cation (px)
  accPerV : 0,   // accélération par volt (px/s²)

  // ── Mesures lissées ──
  vdNorm : 0,   // vitesse de dérive / vitesse d'agitation (signée)
  I_mA   : 0,   // intensité affichée (mA, signée)
  vd_mm  : 0,   // vitesse de dérive affichée (mm/s, signée)

  // Demande de recalage de la mesure : toute commande qui change le régime
  // la pose, pour que l'afficheur reparte d'une moyenne neuve au lieu de
  // traîner l'ancien régime derrière lui.
  snapMeasure : true,
  measN       : 0,   // images accumulées depuis le dernier recalage

  needsRedraw : true
};

// ══════════════════════════════════════════════════════════════════════
//  Géométrie dérivée
//  Appelée par fil.js après chaque redimensionnement, une fois tx1…ty2
//  connus. Tout ce qui suit se déduit du pas du réseau.
// ══════════════════════════════════════════════════════════════════════

function updateGeometry() {
  var innerW = sim.tx2 - sim.tx1;
  var innerH = sim.ty2 - sim.ty1;
  if (innerW <= 0 || innerH <= 0) return;

  sim.ay = innerH / ROWS;

  // Nombre IMPAIR de colonnes : le réseau commence et finit alors par une
  // colonne à 3 ions, et reste symétrique d'un bout à l'autre du fil.
  sim.cols = Math.max(3, Math.round(innerW / (sim.ay * COL_RATIO)));
  if (sim.cols % 2 === 0) sim.cols += 1;
  sim.ax = innerW / sim.cols;

  var a = Math.min(sim.ax, sim.ay);   // pas de référence pour les rayons
  sim.rElec   = Math.max(1.5, a * RE_FRAC);
  sim.rCation = Math.max(2.5, a * GENE_STEPS[sim.geneIdx]);

  sim.vth     = VTH_FRAC * innerH;
  sim.accPerV = ACC_FRAC * innerH;

  buildLattice();

  // Le nombre d'électrons découle du réseau : autant de charges négatives
  // que le réseau porte de charges positives. Le fil est neutre par
  // construction, à toute valence et à toute taille de fenêtre.
  sim.nElec = sim.valence * sim.nSites;
}

// ── Positions des ions ─────────────────────────────────────────────────
// Colonnes alternées 3 / 2, décalées d'un demi-pas vertical : les ions
// d'une colonne à 2 se logent dans les creux de ses voisines à 3.
// Les décalages aléatoires ne sont retirés au sort que si le nombre de
// sites change ; un simple redimensionnement conserve donc le même réseau.
function buildLattice() {
  sim.nSites = Math.ceil(sim.cols / 2) * ROWS + Math.floor(sim.cols / 2) * (ROWS - 1);

  if (sim.latOff.length !== sim.nSites) {
    sim.latOff = [];
    for (var k = 0; k < sim.nSites; k++) {
      sim.latOff.push({
        ox : (Math.random() * 2 - 1) * LAT_JITTER,
        oy : (Math.random() * 2 - 1) * LAT_JITTER
      });
    }
  }

  sim.latCols = [];
  sim.lattice = [];
  var n = 0;

  for (var i = 0; i < sim.cols; i++) {
    var full = (i % 2 === 0);              // colonne à 3 ions
    var count = full ? ROWS : ROWS - 1;
    var col = [];

    for (var j = 0; j < count; j++) {
      // Colonne pleine : ions au milieu des trois rangées.
      // Colonne creuse : ions aux frontières entre rangées, donc décalés
      // d'un demi-pas — c'est le quinconce.
      var yBase = full ? (j + 0.5) : (j + 1);
      var o = sim.latOff[n++];
      var ion = {
        x : sim.tx1 + (i + 0.5 + o.ox) * sim.ax,
        y : sim.ty1 + (yBase + o.oy) * sim.ay
      };
      col.push(ion);
      sim.lattice.push(ion);
    }
    sim.latCols.push(col);
  }
}

// ── Ion le plus proche d'un point ──────────────────────────────────────
// Le réseau n'est ni une grille carrée ni parfaitement régulier : on
// balaie la colonne qui contient le point et ses deux voisines, soit au
// plus neuf ions. L'ion le plus proche ne peut pas être plus loin —
// chaque colonne couvre toute la hauteur du fil. Le coût reste constant,
// aucune grille spatiale n'est nécessaire.
function nearestCation(x, y) {
  var i0 = Math.floor((x - sim.tx1) / sim.ax);
  var best = null, bestD = Infinity;

  for (var di = -1; di <= 1; di++) {
    var i = i0 + di;
    if (i < 0 || i >= sim.cols) continue;
    var col = sim.latCols[i];
    for (var k = 0; k < col.length; k++) {
      var c = col[k];
      var dx = x - c.x, dy = y - c.y;
      var d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = c; }
    }
  }

  // Point hors réseau (l'électron sort par une extrémité dans le même pas
  // de temps) : on rend un ion de la colonne de bord, pour que l'appelant
  // ait toujours une référence.
  if (best === null) {
    var ci = Math.min(Math.max(i0, 0), sim.cols - 1);
    best = sim.latCols[ci][0];
  }
  return best;
}

// ══════════════════════════════════════════════════════════════════════
//  Création et placement des électrons
// ══════════════════════════════════════════════════════════════════════

// Vitesse d'agitation : module fixé, direction aléatoire.
function _thermalVelocity(e) {
  var th = Math.random() * 2 * Math.PI;
  e.vx = sim.vth * Math.cos(th);
  e.vy = sim.vth * Math.sin(th);
}

// Position libre : tirée au hasard dans le fil, hors de tout cation.
function _freePosition(e) {
  var rColl = sim.rCation + sim.rElec;
  for (var k = 0; k < 60; k++) {
    var x = sim.tx1 + sim.rElec + Math.random() * (sim.tx2 - sim.tx1 - 2 * sim.rElec);
    var y = sim.ty1 + sim.rElec + Math.random() * (sim.ty2 - sim.ty1 - 2 * sim.rElec);
    var c = nearestCation(x, y);
    var dx = x - c.x, dy = y - c.y;
    if (dx * dx + dy * dy > rColl * rColl) { e.x = x; e.y = y; return; }
  }
  // Repli (réseau très encombrant) : on pose l'électron au coin d'une
  // cellule, le point le plus éloigné des cations voisins.
  e.x = sim.tx1 + sim.ax;
  e.y = sim.ty1 + sim.ay;
}

function initElectrons() {
  sim.electrons = [];
  for (var i = 0; i < sim.nElec; i++) {
    var e = { x: 0, y: 0, vx: 0, vy: 0 };
    _freePosition(e);
    _thermalVelocity(e);
    sim.electrons.push(e);
  }
  clearTrace();
}

// Ajuste l'effectif sur sim.nElec sans réinitialiser les électrons déjà
// présents : la valence se change pendant l'animation, et un simple
// redimensionnement de la fenêtre fait varier le nombre de sites du
// réseau, donc le nombre d'électrons.
function syncElectronCount() {
  var n = sim.nElec;
  var list = sim.electrons;
  while (list.length > n) {
    list.pop();
    if (sim.tracedIdx >= list.length) clearTrace();
  }
  while (list.length < n) {
    var e = { x: 0, y: 0, vx: 0, vy: 0 };
    _freePosition(e);
    _thermalVelocity(e);
    list.push(e);
  }
  sim.needsRedraw = true;
}

// ── Report des électrons dans un fil redimensionné ─────────────────────
// On conserve leur position RELATIVE : le redimensionnement de la fenêtre
// ne doit pas rebattre les cartes de la simulation en cours.
function remapElectrons(ox1, oy1, ow, oh) {
  if (ow <= 0 || oh <= 0) return;
  var sx = (sim.tx2 - sim.tx1) / ow;
  var sy = (sim.ty2 - sim.ty1) / oh;
  for (var i = 0; i < sim.electrons.length; i++) {
    var e = sim.electrons[i];
    e.x = sim.tx1 + (e.x - ox1) * sx;
    e.y = sim.ty1 + (e.y - oy1) * sy;
    e.vx *= sx;
    e.vy *= sy;
  }
  for (var k = 0; k < sim.trace.length; k++) {
    var p = sim.trace[k];
    p.x = sim.tx1 + (p.x - ox1) * sx;
    p.y = sim.ty1 + (p.y - oy1) * sy;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Électron suivi à la trace
// ══════════════════════════════════════════════════════════════════════

function clearTrace() {
  sim.tracedIdx = -1;
  sim.trace = [];
}

// Marque l'électron le plus proche du centre du fil : c'est celui qui
// restera le plus longtemps visible avant d'être réinjecté.
function traceCentralElectron() {
  var cx = (sim.tx1 + sim.tx2) / 2, cy = (sim.ty1 + sim.ty2) / 2;
  var best = -1, bestD = Infinity;
  for (var i = 0; i < sim.electrons.length; i++) {
    var e = sim.electrons[i];
    var d = (e.x - cx) * (e.x - cx) + (e.y - cy) * (e.y - cy);
    if (d < bestD) { bestD = d; best = i; }
  }
  sim.tracedIdx = best;
  sim.trace = [];
  if (best >= 0) {
    sim.trace.push({ x: sim.electrons[best].x, y: sim.electrons[best].y, b: true });
  }
  sim.needsRedraw = true;
}

function _pushTracePoint(e, isBreak) {
  sim.trace.push({ x: e.x, y: e.y, b: !!isBreak });
  if (sim.trace.length > TRACE_MAX) sim.trace.shift();
}

// ══════════════════════════════════════════════════════════════════════
//  Intégration physique
// ══════════════════════════════════════════════════════════════════════

// Accélération imposée aux électrons (px/s², selon x).
// Signe : une tension U > 0 crée un champ orienté vers la droite ; la
// charge de l'électron étant négative, la force qu'il subit est orientée
// vers la GAUCHE. Le courant conventionnel, lui, va vers la droite.
function fieldAcceleration() {
  if (!sim.circuitOn) return 0;
  return -sim.accPerV * sim.U_V;
}

// dtMs : pas de temps simulé, en millisecondes.
function stepPhysics(dtMs) {
  var dt = dtMs / 1000;
  if (dt <= 0) return;

  var acc   = fieldAcceleration();
  var rColl = sim.rCation + sim.rElec;
  var vmax  = VMAX_FACTOR * sim.vth;

  // ── Sous-pas : un électron ne doit jamais franchir un cation en une
  //    seule avance, sinon il le traverserait sans choc.
  var nsub = Math.ceil((vmax * dt) / (0.35 * rColl));
  if (nsub < 1)  nsub = 1;
  if (nsub > 12) nsub = 12;
  var h = dt / nsub;

  var yMin = sim.ty1 + sim.rElec, yMax = sim.ty2 - sim.rElec;

  for (var s = 0; s < nsub; s++) {
    for (var i = 0; i < sim.electrons.length; i++) {
      var e = sim.electrons[i];

      // ── Accélération par le champ, puis avance ──
      e.vx += acc * h;

      // Garde-fou : les chocs bornent déjà la vitesse, mais à gêne très
      // faible un vol libre peut durer longtemps.
      var v2 = e.vx * e.vx + e.vy * e.vy;
      if (v2 > vmax * vmax) {
        var f = vmax / Math.sqrt(v2);
        e.vx *= f; e.vy *= f;
      }

      e.x += e.vx * h;
      e.y += e.vy * h;

      // ── Parois haute et basse du fil : rebond élastique ──
      if (e.y < yMin)      { e.y = yMin; e.vy =  Math.abs(e.vy); }
      else if (e.y > yMax) { e.y = yMax; e.vy = -Math.abs(e.vy); }

      // ── Choc sur un cation du réseau ──
      var c  = nearestCation(e.x, e.y);
      var dx = e.x - c.x, dy = e.y - c.y;
      var d2 = dx * dx + dy * dy;
      if (d2 < rColl * rColl) {
        var d = Math.sqrt(d2);
        var nx, ny;
        if (d < 1e-6) { nx = 1; ny = 0; }        // pile au centre : direction arbitraire
        else          { nx = dx / d; ny = dy / d; }

        // Remise à la surface du cation
        e.x = c.x + nx * rColl;
        e.y = c.y + ny * rColl;

        // Redistribution complète de la direction, module ramené à la
        // vitesse d'agitation : c'est ici que l'énergie gagnée sur le
        // champ est cédée au réseau (effet Joule).
        _thermalVelocity(e);
        // …mais la nouvelle direction doit s'éloigner du cation, sinon
        // l'électron y replonge et reste collé.
        if (e.vx * nx + e.vy * ny < 0) { e.vx = -e.vx; e.vy = -e.vy; }
      }

      // ── Extrémités du fil : sortie et réinjection ──
      // L'électron qui sort est remplacé à l'instant même par un autre qui
      // entre par l'extrémité opposée : le nombre de charges négatives
      // dans le fil ne varie jamais, le milieu reste neutre.
      var isTraced = (i === sim.tracedIdx);
      if (e.x > sim.tx2 - sim.rElec) {
        e.x = sim.tx1 + sim.rElec;
        e.y = yMin + Math.random() * (yMax - yMin);
        if (isTraced) _pushTracePoint(e, true);
      } else if (e.x < sim.tx1 + sim.rElec) {
        e.x = sim.tx2 - sim.rElec;
        e.y = yMin + Math.random() * (yMax - yMin);
        if (isTraced) _pushTracePoint(e, true);
      }
    }
  }

  // ── Trace de l'électron suivi (un point par image) ──
  if (sim.tracedIdx >= 0 && sim.tracedIdx < sim.electrons.length) {
    _pushTracePoint(sim.electrons[sim.tracedIdx], false);
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Mesures
//  La vitesse de dérive est la moyenne des vitesses selon x. Sans
//  générateur elle oscille autour de zéro : c'est exactement le point de
//  cours que la page doit rendre visible.
// ══════════════════════════════════════════════════════════════════════

function updateMeasures(dtRealMs) {
  var n = sim.electrons.length;
  var raw = 0;
  if (n > 0 && sim.vth > 0) {
    var sum = 0;
    for (var i = 0; i < n; i++) sum += sim.electrons[i].vx;
    raw = (sum / n) / sim.vth;
  }

  if (sim.snapMeasure) {
    sim.measN = 0;
    sim.vdNorm = 0;
    sim.snapMeasure = false;
  }
  sim.measN++;

  // Coefficient exponentiel : constante de temps fixe, donc indépendante du
  // taux de rafraîchissement de l'écran.
  var alphaEma = 1 - Math.exp(-dtRealMs / MEASURE_TAU);
  // Coefficient de la moyenne courante depuis le dernier recalage. Il vaut
  // 1 à la première image (l'afficheur prend aussitôt la valeur mesurée),
  // puis décroît en 1/n. On garde le plus GRAND des deux : la moyenne
  // courante mène la danse au début, l'exponentielle prend le relais dès
  // qu'elle devient la plus lente — c'est-à-dire au bout de MEASURE_TAU.
  var alpha = Math.max(1 / sim.measN, alphaEma);
  sim.vdNorm += (raw - sim.vdNorm) * alpha;

  sim.vd_mm = sim.vdNorm * VD_MM_PER_NORM;
  // L'intensité est comptée positive dans le sens conventionnel, donc à
  // l'opposé du déplacement des électrons. Elle suit la valence — la
  // densité de porteurs — et non l'effectif affiché, qui ne dépend que de
  // la longueur de fil montrée à l'écran.
  sim.I_mA  = -K_I * sim.valence * sim.vdNorm;
}

// ══════════════════════════════════════════════════════════════════════
//  Réinitialisation
// ══════════════════════════════════════════════════════════════════════

function resetSim() {
  sim.U_V         = 6;
  sim.circuitOn   = false;
  sim.valence     = VALENCE_DEFAULT;
  sim.geneIdx     = GENE_DEFAULT;
  sim.paused      = false;
  sim.speedFactor = 1;
  sim.vdNorm      = 0;
  sim.I_mA        = 0;
  sim.vd_mm       = 0;
  sim.snapMeasure = true;
  sim.measN       = 0;

  updateGeometry();
  initElectrons();
  if (typeof syncUIToSim === 'function') syncUIToSim();
  sim.needsRedraw = true;
}
