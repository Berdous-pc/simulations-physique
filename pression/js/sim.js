// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  sim.js — État global et physique de la simulation
//  Chargé en PREMIER. Expose l'objet `sim` et toutes les fonctions
//  physiques utilisées par recipient.js et ui.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Constantes physiques et de simulation ──────────────────────────────
var R_GAS   = 8.314;   // J·K⁻¹·mol⁻¹
var N_SCALE = 1000;    // 1 mol = 1000 molécules à l'écran
var T_REF   = 300;     // K, température de référence pour calibrage visuel
// Vitesse de base en px/s à T_REF (calibrée pour lisibilité visuelle)
// Ajustée dynamiquement dans recipient.js selon la taille du canvas
var V0_PX   = 180;     // px/s à T_REF (recalibré dans resize() de recipient.js)

// Rayon des molécules en fraction de la largeur intérieure du récipient
var MOL_RADIUS_FRAC = 0.006;  // constante ; MOL_RADIUS (px) en découle, cf. recipient.js
var MOL_RADIUS = 3;           // px effectif (mis à jour par recipient.js)

// Nombre de sous-pas par frame pour l'intégration (anti-tunneling)
var SUBSTEPS = 4;

// G_PX = accélération visuelle correspondant à 1g terrestre (px/s²)
// Calibrée proportionnellement à V0_PX pour rester visible à toute taille d'écran.
// G_FRAC = rapport G_PX / V0_PX (ajusté empiriquement)
var G_FRAC = 1.2;
var G_PX   = 0;     // valeur effective en px/s², mise à jour avec V0_PX

// Fenêtre temporelle pour le comptage des chocs/s (ms simulé)
var WALL_RATE_WINDOW = 1000;

// Facteur de lissage EMA pour les chocs/s (0 < α ≤ 1)
// α = 0.15 : lissage doux, réponse ~5-6 mises à jour (~0.5 s à 10 Hz)
var WALL_RATE_ALPHA = 0.15;

// ── État global de la simulation ───────────────────────────────────────
var sim = {
  // ── Paramètres macroscopiques (unités réelles) ──
  T_K   : 300,   // Température (K)
  n_mol : 0.10,  // Quantité de matière (mol)
  V_L   : 7.0,   // Volume (L)

  // ── Paramètres de la simulation visuelle ──
  Nmol  : 100,   // Nombre de molécules affichées = round(n_mol * N_SCALE)

  // ── Position du piston ──
  pistonY       : 0,    // position visuelle courante (px, depuis le haut du canvas)
  pistonTargetY : 0,    // position cible (mise à jour par setVolume)

  // ── Molécules ──
  // Tableau d'objets {x, y, vx, vy}
  molecules : [],

  // ── Contrôle de l'animation ──
  paused : false,

  // ── Pesanteur ──
  gravityFactor : 0,   // 0 = désactivée, 1 = 1g, 2 = 2g

  // ── Comptage des chocs (horodatages en ms simulé) ──
  wallHits : { top: [], bottom: [], left: [], right: [] },

  // ── Taux de chocs brut (fenêtre glissante 1 s) ──
  wallRawRate : { top: 0, bottom: 0, left: 0, right: 0 },

  // ── Taux de chocs lissé EMA (affiché) ──
  wallRate : { top: 0, bottom: 0, left: 0, right: 0 },

  // ── Pression calculée (Pa) ──
  P_Pa : 0,

  // ── Géométrie de la boîte (mise à jour par recipient.js) ──
  boxLeft   : 0,
  boxRight  : 0,
  boxTop    : 0,
  boxBottom : 0,
  boxTopMax : 0,
  boxTopMin : 0,

  // ── Temps simulé cumulé (ms) — pour la fenêtre glissante ──
  simTime : 0,
};

// ══════════════════════════════════════════════════════════════════════
//  Fonctions de calcul macroscopique
// ══════════════════════════════════════════════════════════════════════

// Calcule et met à jour sim.P_Pa depuis n, R, T, V
function updatePressure() {
  var V_m3 = sim.V_L * 1e-3;
  sim.P_Pa = (sim.n_mol * R_GAS * sim.T_K) / V_m3;
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation des molécules
// ══════════════════════════════════════════════════════════════════════

// ── Générateur de nombre gaussien (Box-Muller) ────────────────────────
// Retourne une valeur tirée selon N(0, sigma²)
function _gaussRandom(sigma) {
  // Box-Muller transform
  var u, v, s;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  var factor = sigma * Math.sqrt(-2 * Math.log(s) / s);
  return u * factor;
}

// Génère une vitesse selon la distribution de Maxwell-Boltzmann 2D
// (distribution de Rayleigh sur le module, obtenue par deux gaussiennes
//  indépendantes N(0, σ²) sur vx et vy, avec σ = V0_PX·√(T/T_REF))
function randomVelocity() {
  var sigma = V0_PX * Math.sqrt(sim.T_K / T_REF);
  return { vx: _gaussRandom(sigma), vy: _gaussRandom(sigma) };
}

// Place N molécules réparties dans toute la boîte, sans chevauchement.
// Stratégie : grille virtuelle de pas 2,5·r → on tire N cellules DISTINCTES
// au hasard dans toute la grille, puis on décentre chaque molécule à
// l'intérieur de sa cellule (jitter) pour casser l'aspect « cristal ».
//
// Historique : la version précédente construisait la liste des cellules en
// s'arrêtant à 4·N cellules AVANT de mélanger. Les cellules étant énumérées
// ligne par ligne depuis le haut, seules les premières rangées entraient dans
// le tirage : toutes les molécules naissaient collées sous le piston.
function initMolecules() {
  sim.molecules = [];
  var N   = sim.Nmol;
  var r   = MOL_RADIUS;
  var xlo = sim.boxLeft   + r + 1;
  var xhi = sim.boxRight  - r - 1;
  var ylo = sim.pistonY   + r + 1;
  var yhi = sim.boxBottom - r - 1;

  if (xhi <= xlo || yhi <= ylo) return;

  var w = xhi - xlo;
  var h = yhi - ylo;

  // Grille couvrant TOUTE la zone gaz
  var cols  = Math.max(1, Math.floor(w / (r * 2.5)));
  var rows  = Math.max(1, Math.floor(h / (r * 2.5)));
  var total = cols * rows;

  var cellW = w / cols;
  var cellH = h / rows;

  // Amplitude du jitter : la molécule doit rester dans sa cellule, sinon deux
  // voisines pourraient se chevaucher dès la première image.
  var jx = Math.max(0, (cellW / 2 - r) * 0.9);
  var jy = Math.max(0, (cellH / 2 - r) * 0.9);

  // Tirage de min(N, total) cellules distinctes : Fisher-Yates PARTIEL sur le
  // tableau d'indices — on ne mélange que les N premières positions, ce qui
  // suffit et évite de brasser plusieurs milliers de cellules.
  var nGrid = Math.min(N, total);
  var idx   = new Int32Array(total);
  for (var i = 0; i < total; i++) idx[i] = i;
  for (var k = 0; k < nGrid; k++) {
    var j = k + Math.floor(Math.random() * (total - k));
    var tmp = idx[k]; idx[k] = idx[j]; idx[j] = tmp;
  }

  for (var m = 0; m < N; m++) {
    var x, y;
    if (m < nGrid) {
      // Centre de la cellule tirée + jitter
      var cell = idx[m];
      x = xlo + (cell % cols + 0.5) * cellW + (Math.random() * 2 - 1) * jx;
      y = ylo + (Math.floor(cell / cols) + 0.5) * cellH + (Math.random() * 2 - 1) * jy;
    } else {
      // Plus de molécules que de cellules : repli aléatoire uniforme
      x = xlo + Math.random() * w;
      y = ylo + Math.random() * h;
    }
    var vel = randomVelocity();
    sim.molecules.push({ x: x, y: y, vx: vel.vx, vy: vel.vy });
  }

  // Ré-initialiser les compteurs de chocs
  resetWallHits();
}

// ══════════════════════════════════════════════════════════════════════
//  Transposition des molécules après un redimensionnement
// ══════════════════════════════════════════════════════════════════════

// Reporte chaque molécule à la MÊME position relative dans la nouvelle zone
// gaz. Sans cela, un redimensionnement de la fenêtre laisse les molécules à
// leurs coordonnées px absolues : elles se retrouvent hors du récipient, et
// comme la physique ne tourne pas en pause, elles y restent affichées.
// `o` = ancienne géométrie {left, right, top, bottom} de la zone gaz
// (top = ancienne position du piston).
function remapMoleculesToBox(o) {
  var mols = sim.molecules;
  if (!mols.length) return;

  var oldW = o.right  - o.left;
  var oldH = o.bottom - o.top;
  if (oldW <= 0 || oldH <= 0) return;

  var r    = MOL_RADIUS;
  var xlo  = sim.boxLeft   + r;
  var xhi  = sim.boxRight  - r;
  var ylo  = sim.pistonY   + r;
  var yhi  = sim.boxBottom - r;
  var newW = xhi - xlo;
  var newH = yhi - ylo;
  if (newW <= 0 || newH <= 0) return;

  for (var i = 0; i < mols.length; i++) {
    var fx = (mols[i].x - o.left) / oldW;
    var fy = (mols[i].y - o.top)  / oldH;
    // Clamp : une molécule en cours de rebond peut être très légèrement
    // hors de l'ancienne boîte ; on la ramène dans la nouvelle.
    if (fx < 0) fx = 0; else if (fx > 1) fx = 1;
    if (fy < 0) fy = 0; else if (fy > 1) fy = 1;
    mols[i].x = xlo + fx * newW;
    mols[i].y = ylo + fy * newH;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Modification dynamique des paramètres
// ══════════════════════════════════════════════════════════════════════

// Rescale instantané des vitesses quand T change
function setTemperature(T_new) {
  if (T_new <= 0) return;
  var ratio = Math.sqrt(T_new / sim.T_K);
  for (var i = 0; i < sim.molecules.length; i++) {
    sim.molecules[i].vx *= ratio;
    sim.molecules[i].vy *= ratio;
  }
  sim.T_K = T_new;
  updatePressure();
}

// Modifie le nombre de molécules (ajoute ou retire incrémentalement)
function setMoleculeCount(Ntarget) {
  sim.Nmol = Ntarget;
  var current = sim.molecules.length;

  if (Ntarget > current) {
    // Ajouter des molécules
    var r   = MOL_RADIUS;
    var xlo = sim.boxLeft   + r + 1;
    var xhi = sim.boxRight  - r - 1;
    var ylo = sim.pistonY   + r + 1;
    var yhi = sim.boxBottom - r - 1;
    for (var i = current; i < Ntarget; i++) {
      var vel = randomVelocity();
      // Placer sans chevauchement (tentatives)
      var placed = false;
      for (var attempt = 0; attempt < 50; attempt++) {
        var x = xlo + Math.random() * (xhi - xlo);
        var y = ylo + Math.random() * (yhi - ylo);
        if (!hasOverlap(x, y, -1)) {
          sim.molecules.push({ x: x, y: y, vx: vel.vx, vy: vel.vy });
          placed = true;
          break;
        }
      }
      if (!placed) {
        // Forcer la position (acceptable pour quelques molécules)
        var x2 = xlo + Math.random() * (xhi - xlo);
        var y2 = ylo + Math.random() * (yhi - ylo);
        sim.molecules.push({ x: x2, y: y2, vx: vel.vx, vy: vel.vy });
      }
    }
  } else if (Ntarget < current) {
    // Retirer des molécules (on supprime les dernières)
    sim.molecules.splice(Ntarget);
  }

  updatePressure();
}

// Teste si la position (x,y) est en collision avec une molécule existante
// excludeIdx : index à exclure (-1 = aucun)
function hasOverlap(x, y, excludeIdx) {
  var diam2 = (2 * MOL_RADIUS) * (2 * MOL_RADIUS);
  for (var i = 0; i < sim.molecules.length; i++) {
    if (i === excludeIdx) continue;
    var dx = sim.molecules[i].x - x;
    var dy = sim.molecules[i].y - y;
    if (dx * dx + dy * dy < diam2) return true;
  }
  return false;
}

// Met à jour pistonTargetY selon le volume V_L
// pistonY est calculé de façon à ce que la hauteur intérieure de la boîte
// corresponde proportionnellement à V_L entre V_min (1 L) et V_max (10 L).
function setVolume(V_L_new) {
  sim.V_L = V_L_new;
  var frac = (V_L_new - 1.0) / (10.0 - 1.0);  // 0 = 1 L, 1 = 10 L
  // boxTopMin = position du piston à volume minimum (piston le plus bas)
  // boxTopMax = position du piston à volume maximum (piston le plus haut)
  sim.pistonTargetY = sim.boxTopMin + frac * (sim.boxTopMax - sim.boxTopMin);
  updatePressure();
}

// ══════════════════════════════════════════════════════════════════════
//  Comptage des chocs sur les parois
// ══════════════════════════════════════════════════════════════════════

function resetWallHits() {
  sim.wallHits.top    = [];
  sim.wallHits.bottom = [];
  sim.wallHits.left   = [];
  sim.wallHits.right  = [];
  sim.wallRawRate.top    = 0; sim.wallRate.top    = 0;
  sim.wallRawRate.bottom = 0; sim.wallRate.bottom = 0;
  sim.wallRawRate.left   = 0; sim.wallRate.left   = 0;
  sim.wallRawRate.right  = 0; sim.wallRate.right  = 0;
}

function recordWallHit(wall) {
  sim.wallHits[wall].push(sim.simTime);
}

// Purge les horodatages > 1 s, calcule le brut, applique l'EMA (à appeler à 10 Hz)
function updateWallRates() {
  var cutoff = sim.simTime - WALL_RATE_WINDOW;
  var walls = ['top', 'bottom', 'left', 'right'];
  for (var w = 0; w < walls.length; w++) {
    var wall = walls[w];
    var hits = sim.wallHits[wall];
    // Purge
    var start = 0;
    while (start < hits.length && hits[start] < cutoff) start++;
    if (start > 0) sim.wallHits[wall] = hits.slice(start);
    // Brut
    var raw = sim.wallHits[wall].length;
    sim.wallRawRate[wall] = raw;
    // EMA
    sim.wallRate[wall] = WALL_RATE_ALPHA * raw + (1 - WALL_RATE_ALPHA) * sim.wallRate[wall];
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Intégration physique — un pas de temps
// ══════════════════════════════════════════════════════════════════════

function stepPhysics(dt_ms) {
  if (dt_ms <= 0) return;
  var dt_s = dt_ms / 1000;  // conversion en secondes

  sim.simTime += dt_ms;

  var subDt = dt_s / SUBSTEPS;

  for (var sub = 0; sub < SUBSTEPS; sub++) {
    _moveAll(subDt);
    _collidePairs();
    _collideWalls();
  }
}

// ── Avance toutes les positions (+ pesanteur si activée) ──────────────
function _moveAll(dt) {
  var mols = sim.molecules;
  var g    = G_PX * sim.gravityFactor;
  for (var i = 0; i < mols.length; i++) {
    mols[i].vy  += g * dt;          // pesanteur vers le bas (y croissant)
    mols[i].x   += mols[i].vx * dt;
    mols[i].y   += mols[i].vy * dt;
  }
}

// ── Collisions avec les parois ─────────────────────────────────────────
function _collideWalls() {
  var mols   = sim.molecules;
  var r      = MOL_RADIUS;
  var xlo    = sim.boxLeft   + r;
  var xhi    = sim.boxRight  - r;
  var ylo    = sim.pistonY   + r;  // piston = paroi haute
  var yhi    = sim.boxBottom - r;

  for (var i = 0; i < mols.length; i++) {
    var m = mols[i];

    // Paroi gauche
    if (m.x < xlo) {
      m.x  = 2 * xlo - m.x;
      if (m.vx < 0) { m.vx = -m.vx; recordWallHit('left'); }
    }
    // Paroi droite
    if (m.x > xhi) {
      m.x  = 2 * xhi - m.x;
      if (m.vx > 0) { m.vx = -m.vx; recordWallHit('right'); }
    }
    // Piston (paroi haute)
    if (m.y < ylo) {
      m.y  = 2 * ylo - m.y;
      if (m.vy < 0) { m.vy = -m.vy; recordWallHit('top'); }
    }
    // Paroi basse
    if (m.y > yhi) {
      m.y  = 2 * yhi - m.y;
      if (m.vy > 0) { m.vy = -m.vy; recordWallHit('bottom'); }
    }
  }
}

// ── Collisions élastiques paire-à-paire ────────────────────────────────
// Formule : choc élastique 2D, masses égales.
// Les vitesses échangent leurs composantes le long de la normale au contact.
function _collidePairs() {
  var mols = sim.molecules;
  var diam = 2 * MOL_RADIUS;
  var diam2 = diam * diam;

  for (var i = 0; i < mols.length - 1; i++) {
    for (var j = i + 1; j < mols.length; j++) {
      var mi = mols[i];
      var mj = mols[j];

      var dx = mj.x - mi.x;
      var dy = mj.y - mi.y;
      var dist2 = dx * dx + dy * dy;

      if (dist2 >= diam2 || dist2 === 0) continue;

      var dist = Math.sqrt(dist2);
      // Normale unitaire i→j
      var nx = dx / dist;
      var ny = dy / dist;

      // Vitesse relative le long de la normale
      var dvx = mi.vx - mj.vx;
      var dvy = mi.vy - mj.vy;
      var vrel_n = dvx * nx + dvy * ny;

      // Ne traiter que si les molécules se rapprochent
      if (vrel_n <= 0) continue;

      // Échange des composantes normales (masses égales → transfert total)
      mi.vx -= vrel_n * nx;
      mi.vy -= vrel_n * ny;
      mj.vx += vrel_n * nx;
      mj.vy += vrel_n * ny;

      // ── Séparation positionnelle anti-sticking ──
      var overlap = diam - dist;
      var half = (overlap / 2) + 0.5;  // +0.5 px marge
      mi.x -= nx * half;
      mi.y -= ny * half;
      mj.x += nx * half;
      mj.y += ny * half;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Push des molécules quand le piston descend
//  Appelé par ui.js après la mise à jour du lissage de pistonY
// ══════════════════════════════════════════════════════════════════════
function pushMoleculesDownFromPiston() {
  var r      = MOL_RADIUS;
  var limit  = sim.pistonY + r + 1;
  var mols   = sim.molecules;
  var floor  = sim.boxBottom - r - 1;

  for (var i = 0; i < mols.length; i++) {
    if (mols[i].y < limit) {
      mols[i].y = limit;
      if (mols[i].vy < 0) mols[i].vy = -mols[i].vy;
    }
    // S'assurer qu'aucune molécule ne dépasse le bas
    if (mols[i].y > floor) {
      mols[i].y = floor;
      if (mols[i].vy > 0) mols[i].vy = -mols[i].vy;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Réinitialisation complète
// ══════════════════════════════════════════════════════════════════════
function resetSim() {
  sim.T_K      = 300;
  sim.n_mol    = 0.10;
  sim.V_L      = 7.0;
  sim.Nmol     = 100;
  sim.simTime  = 0;
  sim.paused   = false;
  sim.gravityFactor = 0;

  // Recalcul du piston et des molécules (recipient.js doit avoir défini la géométrie)
  setVolume(sim.V_L);
  sim.pistonY = sim.pistonTargetY;
  initMolecules();
  updatePressure();

  // Mise à jour de l'UI (définie dans ui.js)
  if (typeof syncUIToSim === 'function') syncUIToSim();
}
