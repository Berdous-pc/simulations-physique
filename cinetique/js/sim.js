// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  sim.js — État et physique de la simulation
//  Chargé en PREMIER. Expose la fabrique `createSim()`, le tableau `sims`
//  (une entrée par simulation) et toutes les fonctions physiques utilisées
//  par recipient.js, graph.js et ui.js.
//
//  La page peut afficher 1 ou 2 simulations (bouton « Nombre de
//  simulation(s) ») pour comparer en direct deux jeux de paramètres. Toutes
//  les fonctions physiques prennent donc en PREMIER ARGUMENT l'instance `s`
//  sur laquelle elles travaillent : il n'y a plus d'état global unique.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Constantes physiques et de simulation ──────────────────────────────
var T_REF = 300;   // K, température de référence pour calibrage visuel
// Vitesse de base en px/s à T_REF (recalibrée par instance dans resize())
var V0_PX_DEFAULT = 180;

// ── Correspondance slider (°C) → température de simulation (K) ─────────
// Le slider affiche des températures réalistes (1 °C à 90 °C) mais l'échelle
// des vitesses reste celle, exagérée, qui rendait la simulation lisible :
// - à 90 °C on retrouve la vitesse moyenne maximale d'avant (celle de 1000 K) ;
// - à 1 °C la vitesse moyenne vaut le QUART de l'ancien minimum (100 K), soit
//   V0·sqrt(100/300)/4 → T_SIM_MIN = 300·(sqrt(1/3)/4)² = 6,25 K.
// L'interpolation est linéaire en température, donc la vitesse moyenne varie
// bien comme sqrt(T) sur toute la course du slider.
var T_C_MIN = 1;
var T_C_MAX = 90;
var T_SIM_MIN = 6.25;    // K, atteint à 1 °C
var T_SIM_MAX = 1000;    // K, atteint à 90 °C

// Température de simulation (K) correspondant à une consigne en °C
function simTempFromCelsius(T_C) {
  var f = (T_C - T_C_MIN) / (T_C_MAX - T_C_MIN);
  if (f < 0) f = 0; else if (f > 1) f = 1;
  return T_SIM_MIN + f * (T_SIM_MAX - T_SIM_MIN);
}

// Rayon des molécules en fraction de la largeur intérieure du récipient
var MOL_RADIUS_FRAC = 0.007;  // le rayon en px est recalculé par recipient.js

// ── Sous-pas d'intégration par frame (anti-tunneling) ──────────────────
// Le nombre de sous-pas est calculé à chaque frame (cf. _requiredSubsteps) :
// une valeur fixe ne tient pas quand le slider de vitesse multiplie dt par 4
// et que la température maximale du slider (90 °C, soit T_SIM_MAX) multiplie
// les vitesses par ~1,8. Dans ce cas la molécule
// la plus rapide parcourt plusieurs diamètres par sous-pas, traverse ses
// voisines sans être détectée, et des chocs A+B efficaces sont manqués :
// la réaction paraît alors artificiellement lente à haute température, ce
// qui est précisément l'inverse de ce que la simulation doit montrer.
var SUBSTEPS_MIN = 4;
// Plafond de sécurité : au-delà on préfère dégrader la précision plutôt que
// de faire chuter le nombre d'images par seconde.
var SUBSTEPS_MAX = 32;
// Déplacement maximal toléré par sous-pas, en fraction du RAYON. Deux
// molécules qui se croisent de front se rapprochent de 2·v·subDt ; ne pas
// tunneler impose 2·v·subDt < 2·r, soit v·subDt < r. On prend la moitié,
// ce qui laisse un facteur 2 de marge.
var MAX_STEP_FRAC = 0.5;

// Période d'échantillonnage de l'historique (ms simulés)
var HISTORY_PERIOD = 200;

// ── Couleurs des espèces (réutilisées par recipient.js et graph.js) ────
// Réactifs A/B : teintes VIVES et saturées, pour repérer d'un coup d'œil
// les réactifs restants au milieu des produits accumulés.
// Produits C/D : teintes TERNES (désaturées), volontairement en retrait.
var SPECIES_COLORS = {
  A: { fill: '#0f7fe0', border: '#0a5498', label: 'A' },
  B: { fill: '#f04a10', border: '#a8300a', label: 'B' },
  C: { fill: '#8fa896', border: '#6a8271', label: 'C' },
  D: { fill: '#a89ab0', border: '#82748a', label: 'D' }
};

// ══════════════════════════════════════════════════════════════════════
//  Instances de simulation
// ══════════════════════════════════════════════════════════════════════

// Fabrique une instance complète. `index` vaut 1 ou 2 et sert à retrouver
// les éléments du DOM correspondants (suffixe des id : -1 / -2).
function createSim(index) {
  return {
    index: index,

    // ── Molécules : { type:'A'|'B'|'C'|'D', x, y, vx, vy } ──
    molecules: [],

    // ── Quantités initiales pilotées par les sliders (état courant) ──
    N0_A: 50,
    N0_B: 50,

    // ── Température ──
    T_C: 20,                              // °C, valeur affichée par le slider
    T_K: simTempFromCelsius(20),          // K, température de simulation associée

    // ── Géométrie du récipient (mise à jour par recipient.js) ──
    boxLeft: 0,
    boxRight: 0,
    boxTop: 0,
    boxBottom: 0,
    _rx1: 0, _rx2: 0, _ry1: 0, _ry2: 0,

    // ── Échelles dépendant de la taille du canvas (cf. recipient.js) ──
    molRadius: 3,             // px
    v0px: V0_PX_DEFAULT,      // px/s à T_REF

    // ── Rendu (renseigné par recipient.js / graph.js) ──
    canvas: null, ctx: null, cw: 0, ch: 0,
    chartCanvas: null, chartCtx: null,
    chartVisible: { A: true, B: true, C: true, D: true },
    chartHover: null,

    // ── Temps simulé cumulé (ms) ──
    simTime: 0,

    // Passe à true dès que A ou B tombe à 0 : la réaction A + B → C + D ne
    // peut plus avoir lieu, l'animation et le tracé de CETTE simulation se
    // figent — indépendamment de l'autre en mode 2 simulations, et même si
    // l'utilisateur laisse le bouton Lancer/Pause sur "Pause" partagé actif.
    finished: false,

    // ── Historique temporel des quantités (fenêtre glissante) ──
    // t en secondes, A/B/C/D en nombre de molécules
    history: { t: [], A: [], B: [], C: [], D: [] },

    // Passe à true quand un point d'historique vient d'être ajouté : le graphe
    // ne se redessine que dans ce cas (5 redraws/s au lieu de 60), cf. ui.js.
    historyDirty: true,

    // Accumulateur interne pour l'échantillonnage de l'historique
    _historyTimer: 0,

    // Grille spatiale de détection des collisions (cf. _collidePairs)
    _grid: [], _gridCols: 0, _gridRows: 0
  };
}

// Les deux instances existent toujours ; seules les `simCount` premières
// sont animées et affichées (cf. activeSims() et setSimCount() dans ui.js).
var sims = [createSim(1), createSim(2)];

// Nombre de simulations affichées (1 par défaut)
var simCount = 1;

// ── Contrôle de l'animation — COMMUN aux deux simulations ──────────────
// Lancer/mettre en pause et la vitesse d'animation agissent sur les deux :
// c'est ce qui permet de comparer deux évolutions « en direct », au même
// temps simulé.
// En pause au chargement de la page : l'élève lance lui-même la réaction.
var paused = true;
var speedFactor = 1;   // multiplie dt avant stepPhysics (×0,10 à ×2,00)

function activeSims() {
  return sims.slice(0, simCount);
}

// ══════════════════════════════════════════════════════════════════════
//  Génération de vitesses — distribution de Maxwell-Boltzmann 2D
// ══════════════════════════════════════════════════════════════════════

// ── Générateur de nombre gaussien (Box-Muller) ────────────────────────
function _gaussRandom(sigma) {
  var u, v, s;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  var factor = sigma * Math.sqrt(-2 * Math.log(s) / s);
  return u * factor;
}

// Vitesse selon Maxwell-Boltzmann 2D (deux gaussiennes indépendantes sur vx/vy)
function randomVelocity(s) {
  var sigma = s.v0px * Math.sqrt(s.T_K / T_REF);
  return { vx: _gaussRandom(sigma), vy: _gaussRandom(sigma) };
}

// ══════════════════════════════════════════════════════════════════════
//  Comptage des espèces et historique
// ══════════════════════════════════════════════════════════════════════

function countSpecies(s) {
  var c = { A: 0, B: 0, C: 0, D: 0 };
  var mols = s.molecules;
  for (var i = 0; i < mols.length; i++) c[mols[i].type]++;
  return c;
}

function recordHistoryPoint(s) {
  var c = countSpecies(s);
  var h = s.history;
  h.t.push(s.simTime / 1000);
  h.A.push(c.A); h.B.push(c.B); h.C.push(c.C); h.D.push(c.D);
  s.historyDirty = true;
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation des molécules
// ══════════════════════════════════════════════════════════════════════

// Place N0_A molécules A + N0_B molécules B sans chevauchement dans la boîte.
// Stratégie : grille dimensionnée pour contenir EXACTEMENT les N molécules et
// couvrir toute la zone d'animation (cols × rows ≥ N, proportions du récipient),
// puis mélange Fisher-Yates pour répartir aléatoirement les types A/B.
function initMolecules(s) {
  s.molecules = [];
  var NA = s.N0_A, NB = s.N0_B;
  var N  = NA + NB;
  var r   = s.molRadius;
  var xlo = s.boxLeft   + r + 1;
  var xhi = s.boxRight  - r - 1;
  var ylo = s.boxTop    + r + 1;
  var yhi = s.boxBottom - r - 1;

  if (xhi > xlo && yhi > ylo && N > 0) {
    var w = xhi - xlo;
    var h = yhi - ylo;

    // Grille couvrant tout le récipient : on choisit cols pour que les cellules
    // soient à peu près carrées (cols/rows ≈ w/h) tout en ayant cols×rows ≥ N.
    var cols = Math.max(1, Math.ceil(Math.sqrt(N * w / h)));
    var rows = Math.max(1, Math.ceil(N / cols));
    var cellW = w / cols;
    var cellH = h / rows;

    var positions = [];
    for (var i = 0; i < cols * rows; i++) {
      positions.push({
        x: xlo + (i % cols + 0.5) * cellW,
        y: ylo + (Math.floor(i / cols) + 0.5) * cellH
      });
    }

    // Mélange Fisher-Yates
    for (var k = positions.length - 1; k > 0; k--) {
      var j = Math.floor(Math.random() * (k + 1));
      var tmp = positions[k]; positions[k] = positions[j]; positions[j] = tmp;
    }

    var types = [];
    for (var a = 0; a < NA; a++) types.push('A');
    for (var b = 0; b < NB; b++) types.push('B');

    // Jitter maximal : reste dans la cellule sans chevaucher la voisine
    var jitX = Math.max(0, (cellW - 2 * r - 1) / 2);
    var jitY = Math.max(0, (cellH - 2 * r - 1) / 2);

    for (var m = 0; m < N; m++) {
      var pos = positions[m];
      var vel = randomVelocity(s);
      s.molecules.push({
        type: types[m],
        x: pos.x + (Math.random() * 2 - 1) * jitX,
        y: pos.y + (Math.random() * 2 - 1) * jitY,
        vx: vel.vx, vy: vel.vy
      });
    }
  }

  s.simTime = 0;
  s._historyTimer = 0;
  s.history = { t: [], A: [], B: [], C: [], D: [] };
  // Un réactif à 0 dès le départ (ex. N_A = 0) fige tout de suite : la
  // réaction ne peut pas avoir lieu, inutile d'attendre un premier choc.
  s.finished = (s.N0_A === 0 || s.N0_B === 0);
  recordHistoryPoint(s);
}

// ══════════════════════════════════════════════════════════════════════
//  Modification dynamique des paramètres
// ══════════════════════════════════════════════════════════════════════

// Rescale instantané des vitesses quand T change (consigne en °C)
function setTemperature(s, T_C_new) {
  var T_new = simTempFromCelsius(T_C_new);
  if (T_new <= 0) return;
  var ratio = Math.sqrt(T_new / s.T_K);
  for (var i = 0; i < s.molecules.length; i++) {
    s.molecules[i].vx *= ratio;
    s.molecules[i].vy *= ratio;
  }
  s.T_C = T_C_new;
  s.T_K = T_new;
}

// Change la quantité initiale d'une espèce réactive (A ou B).
// Un tel changement redéfinit les conditions initiales de la réaction :
// on remet donc l'animation à zéro (et en pause) plutôt que d'injecter des
// molécules en cours de route, pour que la courbe affichée corresponde
// toujours à une seule et même expérience.
//
// En mode 2 simulations, deux cas :
// - si l'une des simulations affichées a déjà commencé à évoluer (simTime > 0,
//   donc a été lancée au moins une fois depuis la dernière RAZ), on ne peut pas
//   ne repositionner QUE celle qu'on modifie : les deux courbes doivent redémarrer
//   ensemble pour rester comparables sur le même axe des temps → RAZ complète ;
// - si aucune n'a encore été lancée (t=0 des deux côtés, réglage des paramètres
//   avant le premier "Lancer"), repositionner l'autre simulation n'aurait aucun
//   effet utile — elle est déjà à t=0 — mais lui ferait perdre son placement
//   aléatoire initial sans raison. On ne touche donc qu'à `s`.
function setSpeciesCount(s, type, target) {
  if (type === 'A') s.N0_A = target; else s.N0_B = target;

  var anyStarted = activeSims().some(function (sim) { return sim.simTime > 0; });
  if (anyStarted) {
    resetSim();
  } else {
    paused = true;
    initMolecules(s);
    if (typeof syncUIToSim === 'function') syncUIToSim();
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Intégration physique — un pas de temps
// ══════════════════════════════════════════════════════════════════════

function stepPhysics(s, dt_ms) {
  if (dt_ms <= 0 || s.finished) return;
  var dt_s = dt_ms / 1000;

  s.simTime += dt_ms;

  var nSub  = _requiredSubsteps(s, dt_s);
  var subDt = dt_s / nSub;
  for (var sub = 0; sub < nSub; sub++) {
    _moveAll(s, subDt);
    _collidePairs(s);
    _collideWalls(s);
  }

  s._historyTimer += dt_ms;
  if (s._historyTimer >= HISTORY_PERIOD) {
    s._historyTimer = 0;
    recordHistoryPoint(s);
  }

  // Réactif épuisé : la réaction A + B → C + D ne peut plus avoir lieu.
  // On fige immédiatement (animation ET graphe) plutôt que d'attendre la
  // prochaine RAZ — un point d'historique final est enregistré tout de
  // suite si ce n'était pas déjà fait, pour que la courbe s'arrête pile
  // sur l'instant de l'épuisement plutôt que de laisser un plat jusqu'au
  // prochain échantillon prévu 200 ms plus tard.
  var c = countSpecies(s);
  if (c.A === 0 || c.B === 0) {
    s.finished = true;
    if (s._historyTimer !== 0) {
      s._historyTimer = 0;
      recordHistoryPoint(s);
    }
  }
}

// ── Nombre de sous-pas nécessaires pour cette frame ────────────────────
// On dimensionne sur la molécule la PLUS rapide : c'est elle qui tunnelle
// en premier. Le balayage est en O(N) (≤ 300 itérations), soit un coût
// négligeable devant celui des sous-pas qu'il permet d'économiser quand
// les vitesses sont faibles.
function _requiredSubsteps(s, dt_s) {
  var mols  = s.molecules;
  var v2max = 0;
  for (var i = 0; i < mols.length; i++) {
    var v2 = mols[i].vx * mols[i].vx + mols[i].vy * mols[i].vy;
    if (v2 > v2max) v2max = v2;
  }
  if (v2max === 0) return SUBSTEPS_MIN;

  var travel = Math.sqrt(v2max) * dt_s;      // px parcourus sur la frame
  var budget = s.molRadius * MAX_STEP_FRAC;  // px tolérés par sous-pas
  var n = Math.ceil(travel / budget);
  if (n < SUBSTEPS_MIN) return SUBSTEPS_MIN;
  if (n > SUBSTEPS_MAX) return SUBSTEPS_MAX;
  return n;
}

// ── Avance toutes les positions (mouvement rectiligne uniforme) ────────
function _moveAll(s, dt) {
  var mols = s.molecules;
  for (var i = 0; i < mols.length; i++) {
    mols[i].x += mols[i].vx * dt;
    mols[i].y += mols[i].vy * dt;
  }
}

// ── Collisions avec les 4 parois du récipient ──────────────────────────
function _collideWalls(s) {
  var mols = s.molecules;
  var r    = s.molRadius;
  var xlo  = s.boxLeft   + r;
  var xhi  = s.boxRight  - r;
  var ylo  = s.boxTop    + r;
  var yhi  = s.boxBottom - r;

  for (var i = 0; i < mols.length; i++) {
    var m = mols[i];
    if (m.x < xlo) { m.x = 2 * xlo - m.x; if (m.vx < 0) m.vx = -m.vx; }
    if (m.x > xhi) { m.x = 2 * xhi - m.x; if (m.vx > 0) m.vx = -m.vx; }
    if (m.y < ylo) { m.y = 2 * ylo - m.y; if (m.vy < 0) m.vy = -m.vy; }
    if (m.y > yhi) { m.y = 2 * yhi - m.y; if (m.vy > 0) m.vy = -m.vy; }
  }
}

// Une paire est réactive uniquement si elle associe une molécule A et une
// molécule B (dans n'importe quel ordre).
function _isReactive(t1, t2) {
  return (t1 === 'A' && t2 === 'B') || (t1 === 'B' && t2 === 'A');
}

// ── Résolution d'une paire en contact : choc élastique, ou réaction ────
//
// Réaction A + B → C + D (choc efficace) : la quantité de mouvement totale
// du couple est conservée. On part de la vitesse du centre de masse
// vG = (vA+vB)/2, puis on ajoute à C et on retranche à D un même vecteur
// perpendiculaire à la normale de choc (± vrel_n/2, sens tiré au hasard) :
//   vC = vG + kick,  vD = vG - kick
// La somme vC + vD = 2·vG = vA + vB est conservée EXACTEMENT quel que soit
// ce vecteur, puisqu'il s'annule dans la somme — c'est ce qui autorise à
// faire diverger C et D (au lieu de leur donner la même vitesse) sans jamais
// rompre la conservation de la quantité de mouvement. Sans ce kick, C et D
// repartiraient à l'identique, collés, en translation parallèle : un résultat
// certes conservatif mais qui ne ressemble à aucune collision réelle.
// L'énergie cinétique du système, elle, n'est volontairement PAS conservée
// lors d'une réaction (comportement assumé, analogue à une transformation
// chimique exo/endothermique simplifiée — ce n'est pas un choc élastique).
function _resolvePair(mi, mj, diam, diam2) {
  var dx = mj.x - mi.x;
  var dy = mj.y - mi.y;
  var dist2 = dx * dx + dy * dy;
  if (dist2 >= diam2 || dist2 === 0) return;

  var dist = Math.sqrt(dist2);
  var nx = dx / dist;
  var ny = dy / dist;

  var vrel_n = (mi.vx - mj.vx) * nx + (mi.vy - mj.vy) * ny;
  if (vrel_n <= 0) return;   // elles s'éloignent déjà

  if (_isReactive(mi.type, mj.type)) {
    var vgx = (mi.vx + mj.vx) / 2;
    var vgy = (mi.vy + mj.vy) / 2;
    // Vecteur perpendiculaire à la normale de choc, tangent au contact.
    var tx = -ny, ty = nx;
    var sign = Math.random() < 0.5 ? 1 : -1;
    var kick = sign * 0.5 * vrel_n;
    mi.type = 'C'; mi.vx = vgx + kick * tx; mi.vy = vgy + kick * ty;
    mj.type = 'D'; mj.vx = vgx - kick * tx; mj.vy = vgy - kick * ty;
  } else {
    // Choc élastique standard (échange de la composante normale)
    mi.vx -= vrel_n * nx;
    mi.vy -= vrel_n * ny;
    mj.vx += vrel_n * nx;
    mj.vy += vrel_n * ny;
  }

  // ── Séparation positionnelle anti-sticking ──
  var overlap = diam - dist;
  var half = (overlap / 2) + 0.5;
  mi.x -= nx * half; mi.y -= ny * half;
  mj.x += nx * half; mj.y += ny * half;
}

// ── Détection des collisions par grille spatiale ───────────────────────
// Un balayage naïf de toutes les paires est en O(N²) : à N = 300 molécules
// et 4 sous-pas, cela fait ~180 000 tests par frame, soit ~11 M/s — d'où des
// à-coups sur des machines modestes. Comme deux molécules ne peuvent se
// toucher qu'à une distance ≤ diamètre, on range les molécules dans une
// grille de cellules de côté ≥ diamètre : chaque molécule n'est alors testée
// que contre celles de sa cellule et des 8 cellules voisines, ce qui ramène
// le coût à O(N) (le nombre de voisins par cellule ne dépend pas de N mais
// de la densité).
// La grille est stockée SUR l'instance (s._grid) : deux simulations animées
// dans la même frame ne doivent pas se partager les buckets.

// Décalages couvrant les 8 voisines sans traiter deux fois la même paire :
// la cellule elle-même (avec j > i), puis droite, bas-gauche, bas, bas-droite.
var _GRID_NEIGHBOURS = [[1, 0], [-1, 1], [0, 1], [1, 1]];

function _collidePairs(s) {
  var mols = s.molecules;
  var n = mols.length;
  if (n < 2) return;

  var diam  = 2 * s.molRadius;
  var diam2 = diam * diam;

  // Côté de cellule = 2 diamètres : assez grand pour garder peu de cellules
  // à vider, assez petit pour que peu de molécules tombent dans chacune.
  var cell = Math.max(1, diam * 2);
  var x0 = s.boxLeft, y0 = s.boxTop;
  var cols = Math.max(1, Math.ceil((s.boxRight - x0) / cell));
  var rows = Math.max(1, Math.ceil((s.boxBottom - y0) / cell));

  if (cols !== s._gridCols || rows !== s._gridRows) {
    s._grid = new Array(cols * rows);
    for (var g = 0; g < s._grid.length; g++) s._grid[g] = [];
    s._gridCols = cols; s._gridRows = rows;
  } else {
    for (var g2 = 0; g2 < s._grid.length; g2++) s._grid[g2].length = 0;
  }

  var grid = s._grid;

  // ── Remplissage ──
  for (var i = 0; i < n; i++) {
    var cx = Math.floor((mols[i].x - x0) / cell);
    var cy = Math.floor((mols[i].y - y0) / cell);
    if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
    if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
    grid[cy * cols + cx].push(i);
  }

  // ── Parcours cellule par cellule ──
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var bucket = grid[r * cols + c];
      var bl = bucket.length;
      if (bl === 0) continue;

      // Paires internes à la cellule
      for (var a = 0; a < bl - 1; a++) {
        for (var b = a + 1; b < bl; b++) {
          _resolvePair(mols[bucket[a]], mols[bucket[b]], diam, diam2);
        }
      }

      // Paires avec les cellules voisines "en avant"
      for (var k = 0; k < _GRID_NEIGHBOURS.length; k++) {
        var nc = c + _GRID_NEIGHBOURS[k][0];
        var nr = r + _GRID_NEIGHBOURS[k][1];
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        var other = grid[nr * cols + nc];
        var ol = other.length;
        for (var p = 0; p < bl; p++) {
          for (var q = 0; q < ol; q++) {
            _resolvePair(mols[bucket[p]], mols[other[q]], diam, diam2);
          }
        }
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Réinitialisation
// ══════════════════════════════════════════════════════════════════════
// Conserve la température et les quantités N0_A/N0_B actuellement réglées
// par l'utilisateur (RAZ = relancer la simulation avec les paramètres en
// cours, pas revenir aux valeurs par défaut). L'animation repart en pause :
// l'élève relance lui-même la réaction.
// La RAZ porte toujours sur TOUTES les simulations affichées, pour qu'elles
// démarrent au même instant et restent comparables.
function resetSim() {
  paused = true;
  activeSims().forEach(initMolecules);
  if (typeof syncUIToSim === 'function') syncUIToSim();
}
