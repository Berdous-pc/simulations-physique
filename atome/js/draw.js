'use strict';
// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

/* ══════════════════════════════════════════════════
   DRAW.JS — Rendu canvas du schéma de l'atome :
   noyau 3D rotatif (drag), vue éclatée animée (cadre
   de comptage des nucléons), cercles des sous-couches,
   électrons équirépartis, étiquettes.
   Rendu statique hors interaction : render() est appelé
   à chaque changement d'état ou de taille ; une boucle
   rAF ne tourne que pendant l'animation d'éclatement.
══════════════════════════════════════════════════ */

var _canvas = null, _ctx = null;
var _w = 0, _h = 0;   /* dimensions logiques (px CSS) */

/* Vue courante (bande verticale du canvas dans laquelle un atome est dessiné) :
   toute la largeur en mode normal, une moitié pour chacun des deux atomes en
   mode comparaison. Posées par renderAtome(). */
var _vx = 0, _vw = 0;

/* Rayon extérieur réel du schéma (cercle 3p compris), mis à jour à chaque
   render() — ce rayon dépend de min(largeur, hauteur) de la zone et peut
   donc être petit même sur une fenêtre très large (fenêtre large et peu
   haute). */
var _schemaRmax = 0;

/* ── Rotation du noyau (drag) ─────────────────────
   Trackball : une matrice de rotation cumulée, chaque
   mouvement de souris tourne autour des axes de l'ÉCRAN
   (le noyau roule comme un globe sous le curseur, quelle
   que soit l'orientation déjà atteinte). ── */
function rotX(a) { var c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; }
function rotY(a) { var c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; }
function matMul(A, B) {
  var M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (var i = 0; i < 3; i++)
    for (var j = 0; j < 3; j++)
      M[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  return M;
}

/* Une matrice de rotation par atome affiché ('main' / 'cmp') : en mode
   comparaison, chaque noyau se manipule indépendamment de l'autre. */
var _rotM = {
  main: matMul(rotX(-0.40), rotY(0.55)),
  cmp:  matMul(rotX(-0.40), rotY(0.55))
};
var _curRotKey = 'main';   /* posée par renderAtome() avant toute projection */
var _drag = { active: false, key: null, lastX: 0, lastY: 0 };

/* Zone de saisie du noyau (cercle englobant à l'écran), une par atome
   affiché — recalculée à chaque renderAtome() pour permettre de restreindre
   le déclenchement du drag au noyau plutôt qu'à tout le canvas. */
var _nucleusHit = { main: null, cmp: null };

/* Rotation incrémentale en espace écran (prémultiplication) */
function rotateBy(ax, ay, key) {
  _rotM[key] = matMul(matMul(rotX(ax), rotY(ay)), _rotM[key]);
}

/* ── Animation d'éclatement ───────────────────── */
var _nucAnim = { running: false, dir: 1, t0: 0, dur: 0 };
/* Positions projetées (unités rb) au déclenchement, une par atome affiché
   (« main » = state.Z, « cmp » = state.Zcmp en mode comparaison) : chaque
   moitié anime son propre noyau indépendamment mais sur le même minuteur. */
var _freeze  = { main: null, cmp: null };

/* ── Animation « visualiser la charge » (protons/électrons) ──
   Même mécanique que l'éclatement du noyau, mais deux colonnes protons/
   électrons au lieu de protons/neutrons. Les deux vues sont mutuellement
   exclusives (cf. toggleEclate()/toggleCharge() dans ui.js). */
var _chargeAnim = { running: false, dir: 1, t0: 0, dur: 0 };
/* Seuls les protons ont besoin d'être figés (position 3D tournante) : les
   électrons sont statiques (angle fixe sur leur cercle), calculables à la
   volée sans figeage. Indexé par slot de proton (0..Z-1), comme _freeze. */
var _freezeCharge = { main: null, cmp: null };

/* ── Animation d'ionisation (ajout/retrait d'électrons) ──
   Plusieurs électrons peuvent voler en même temps (clics rapprochés :
   chacun part/arrive à son propre slot, sans attendre les précédents) —
   liste de « vols » par atome. Chaque vol suit une coordonnée s ∈ [0,1]
   indépendante du sens (0 = sur son cercle de sous-couche, 1 = hors
   cadre) ; `vel` = +1 (s croît : départ) ou -1 (s décroît : arrivée). Un
   clic dans le sens opposé À UN VOL EN COURS SUR LE MÊME SLOT inverse
   simplement `vel` et repart de la position courante — l'électron fait
   demi-tour en vol au lieu de recommencer une nouvelle trajectoire. */
var _ionFlights = { main: [], cmp: [] };
var _ionLoopRunning = false;
var ION_FLIGHT = 480;   /* ms — durée d'un aller simple complet (s : 0↔1) */

/* ── Animation de la réorganisation électronique ──
   Un ajout/retrait d'électron peut changer la répartition par sous-couche
   (ex. un p passe de 6 à 5 électrons) : TOUS les électrons restants de
   cette sous-couche changent alors d'angle d'un coup. On anime ce
   glissement (Runit, angle) en parallèle du vol de l'électron
   ajouté/retiré, sur la même durée. Indexé par slot (0..nE-1 courant),
   comme getElectronLayout(). */
var _configAnim = { main: null, cmp: null };

function lerpElecPos(a, b, t) {
  return { Runit: a.Runit + (b.Runit - a.Runit) * t, angle: a.angle + (b.angle - a.angle) * t };
}

/* Progression [0..1] (adoucie) de la transition de config en cours pour
   `which`, ou null si aucune transition n'est active. */
function configEase(which) {
  var ca = _configAnim[which];
  if (!ca) return null;
  var t = (performance.now() - ca.t0) / ca.dur;
  if (t >= 1) { _configAnim[which] = null; return null; }
  return easeInOut(Math.max(0, t));
}

/* Cadence de sortie : premiers nucléons lents, puis accélération */
var NUC_G0 = 260, NUC_RATIO = 0.90, NUC_FLIGHT = 380;   /* ms */

function initDraw() {
  _canvas = document.getElementById('atom-canvas');
  _ctx = _canvas.getContext('2d');
  _canvas.style.cursor = 'default';

  /* Rotation du noyau au drag, SAISIE RESTREINTE à la zone du noyau
     (pointer events : souris + tactile). Une fois le noyau saisi, le
     drag continue partout tant que le bouton reste enfoncé. */
  _canvas.addEventListener('pointerdown', function (e) {
    if (_nucAnim.running || _chargeAnim.running) return;
    var rect = _canvas.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    var key = hitNucleus(px, py);
    if (!key) return;
    _drag.active = true;
    _drag.key = key;
    _drag.lastX = e.clientX;
    _drag.lastY = e.clientY;
    _canvas.setPointerCapture(e.pointerId);
    _canvas.style.cursor = 'grabbing';
  });
  _canvas.addEventListener('pointermove', function (e) {
    if (!_drag.active) {
      var rect = _canvas.getBoundingClientRect();
      _canvas.style.cursor = hitNucleus(e.clientX - rect.left, e.clientY - rect.top) ? 'grab' : 'default';
      return;
    }
    /* Axe X écran ← mouvement vertical ; axe Y écran ← mouvement
       horizontal. Signes choisis pour que le noyau roule sous le
       curseur (drag vers la droite → la face avant part à droite). */
    rotateBy(-(e.clientY - _drag.lastY) * 0.01, (e.clientX - _drag.lastX) * 0.01, _drag.key);
    _drag.lastX = e.clientX;
    _drag.lastY = e.clientY;
    requestAnimationFrame(render);
  });
  _canvas.addEventListener('pointerup', function () {
    _drag.active = false;
    _drag.key = null;
    _canvas.style.cursor = 'grab';
  });
  _canvas.addEventListener('pointercancel', function () { _drag.active = false; _drag.key = null; });
}

/* Détermine si le point (px, py), en coordonnées canvas (px CSS), tombe
   dans la zone de saisie d'un des noyaux affichés. Retourne 'main', 'cmp'
   ou null. */
function hitNucleus(px, py) {
  var keys = state.compare ? ['main', 'cmp'] : ['main'];
  for (var i = 0; i < keys.length; i++) {
    var hz = _nucleusHit[keys[i]];
    if (!hz) continue;
    var dx = px - hz.cx, dy = py - hz.cy;
    if (dx * dx + dy * dy <= hz.r * hz.r) return keys[i];
  }
  return null;
}

/* ── Redimensionnement (écrans haute densité gérés) ── */
function resizeAtomCanvas() {
  if (!_canvas) return;
  var wrap = _canvas.parentElement;
  _w = wrap.clientWidth  || 600;
  _h = wrap.clientHeight || 400;
  var dpr = window.devicePixelRatio || 1;
  _canvas.width  = Math.round(_w * dpr);
  _canvas.height = Math.round(_h * dpr);
  _ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ─────────────────────────────────────────────────
   Générateur pseudo-aléatoire déterministe (seedé par Z) :
   la disposition des nucléons est stable d'un affichage à l'autre.
───────────────────────────────────────────────── */
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ─────────────────────────────────────────────────
   Disposition 3D des nucléons — empilement compact par
   relaxation : les A billes partent de positions aléatoires
   (seedées par Z, donc stables), puis on itère « attraction
   vers le centre + séparation des chevauchements ». Converge
   vers les vraies formes compactes : haltère pour A = 2,
   tétraèdre pour l'hélium, boule quasi sphérique au-delà.
   Coordonnées en unités de rayon de bille.
───────────────────────────────────────────────── */
var _nucleusCache = {};

function getNucleusLayout(Z) {
  if (_nucleusCache[Z]) return _nucleusCache[Z];

  var el = getElement(Z);
  var A = el.A;
  var rng = mulberry32(Z * 7919 + 13);

  /* Espacement entre billes voisines en rayons de bille : légèrement < 2
     pour un amas visuellement compact, mais proche de 2 pour limiter
     l'interpénétration réelle des billes en 3D — plus l'écart avec 2 est
     grand, plus l'ordre d'affichage (tri par profondeur) devient instable
     dans les zones de recouvrement, ce qui fait « sauter » le contour d'une
     bille au-dessus de l'autre au moindre changement d'angle de vue. */
  var ESP = 1.96;

  /* Positions initiales : aléatoires dans une sphère ~taille finale */
  var pts = [];
  var R0 = Math.cbrt(A) * ESP * 0.7;
  for (var i = 0; i < A; i++) {
    var th = Math.acos(2 * rng() - 1), ph = 2 * Math.PI * rng();
    var rr = Math.cbrt(rng()) * R0;
    pts.push({
      x: rr * Math.sin(th) * Math.cos(ph),
      y: rr * Math.sin(th) * Math.sin(ph),
      z: rr * Math.cos(th)
    });
  }

  /* Relaxation : attraction douce vers le centre, puis résolution des
     chevauchements (paires ramenées à la distance ESP). L'équilibre des
     deux donne un amas compact et rond. */
  for (var it = 0; it < 250; it++) {
    for (var a = 0; a < A; a++) {
      pts[a].x *= 0.96; pts[a].y *= 0.96; pts[a].z *= 0.96;
    }
    for (var p1 = 0; p1 < A; p1++) {
      for (var p2 = p1 + 1; p2 < A; p2++) {
        var dx = pts[p2].x - pts[p1].x;
        var dy = pts[p2].y - pts[p1].y;
        var dz = pts[p2].z - pts[p1].z;
        var d = Math.hypot(dx, dy, dz);
        if (d >= ESP) continue;
        if (d < 1e-6) {   /* confondues : axe aléatoire déterministe */
          dx = rng() - 0.5; dy = rng() - 0.5; dz = rng() - 0.5;
          d = Math.hypot(dx, dy, dz);
        }
        var push = (ESP - d) / (2 * d);
        pts[p1].x -= dx * push; pts[p1].y -= dy * push; pts[p1].z -= dz * push;
        pts[p2].x += dx * push; pts[p2].y += dy * push; pts[p2].z += dz * push;
      }
    }
  }

  /* Recentrage sur le barycentre */
  var gx = 0, gy = 0, gz = 0;
  pts.forEach(function (p) { gx += p.x; gy += p.y; gz += p.z; });
  gx /= A; gy /= A; gz /= A;
  pts.forEach(function (p) { p.x -= gx; p.y -= gy; p.z -= gz; });

  /* Tri par distance au centre (ordre radial), puis types entrelacés
     régulièrement le long de cet ordre (répartition uniforme des
     couleurs, sans paquets) */
  pts.forEach(function (p) { p.d = Math.hypot(p.x, p.y, p.z); });
  pts.sort(function (a, b) { return a.d - b.d; });

  var maxD = 0;
  for (var m = 0; m < A; m++) {
    pts[m].t = Math.round((m + 1) * Z / A) - Math.round(m * Z / A) >= 1 ? 'p' : 'n';
    maxD = Math.max(maxD, pts[m].d);
  }

  /* Ordre de sortie lors de l'éclatement : de l'extérieur vers le centre
     (on « épluche » le noyau). rank = rang de sortie ; slot = position
     dans la grille de comptage de son groupe (protons ou neutrons). */
  var pc = 0, nc = 0;
  for (var r = A - 1; r >= 0; r--) {
    var pt = pts[r];
    pt.rank = A - 1 - r;
    pt.slot = (pt.t === 'p') ? pc++ : nc++;
  }

  var layout = { pts: pts, radiusUnits: maxD + 1 };
  _nucleusCache[Z] = layout;
  return layout;
}

/* ─────────────────────────────────────────────────
   Projection 3D → écran via la matrice trackball.
   Retour en unités de rayon de bille, z = profondeur (+ = devant).
───────────────────────────────────────────────── */
function projectPt(p) {
  var m = _rotM[_curRotKey];
  return {
    x: m[0][0] * p.x + m[0][1] * p.y + m[0][2] * p.z,
    y: m[1][0] * p.x + m[1][1] * p.y + m[1][2] * p.z,
    z: m[2][0] * p.x + m[2][1] * p.y + m[2][2] * p.z
  };
}

/* ─────────────────────────────────────────────────
   Nucléon : bille avec dégradé radial (effet volume).
   shade ∈ [0,1] : assombrissement des billes du fond.
───────────────────────────────────────────────── */
function drawNucleon(x, y, r, type, shade, alpha) {
  var grad = _ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
  if (type === 'p') {          /* proton : rouge */
    grad.addColorStop(0, '#e8705c');
    grad.addColorStop(1, '#b02818');
  } else {                     /* neutron : blanc */
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#d8d4cc');
  }
  _ctx.globalAlpha = (alpha === undefined) ? 1 : alpha;
  _ctx.beginPath();
  _ctx.arc(x, y, r, 0, 2 * Math.PI);
  _ctx.fillStyle = grad;
  _ctx.fill();
  /* Contour volontairement discret : un trait marqué rendrait très visible
     la bascule d'ordre d'affichage entre deux billes qui se touchent presque
     (tri par profondeur instable pile à leur tangence). */
  _ctx.lineWidth = Math.max(0.5, r * 0.06);
  _ctx.strokeStyle = 'rgba(60,40,30,0.16)';
  _ctx.stroke();
  if (shade) {
    _ctx.fillStyle = 'rgba(60,45,35,' + (shade * 0.35).toFixed(3) + ')';
    _ctx.fill();
  }
  _ctx.globalAlpha = 1;
}

/* ─────────────────────────────────────────────────
   Électron : disque bleu (charte) avec signe − blanc,
   halo couleur fond pour se détacher du trait du cercle.
───────────────────────────────────────────────── */
function drawElectron(x, y, r, alpha) {
  _ctx.globalAlpha = (alpha === undefined) ? 1 : alpha;
  _ctx.beginPath();
  _ctx.arc(x, y, r, 0, 2 * Math.PI);
  _ctx.fillStyle = '#2a6aaa';
  _ctx.fill();

  _ctx.beginPath();
  _ctx.moveTo(x - r * 0.38, y);
  _ctx.lineTo(x + r * 0.38, y);
  _ctx.lineWidth = Math.max(1, r * 0.16);
  _ctx.lineCap = 'round';
  _ctx.strokeStyle = '#fff';
  _ctx.stroke();
  _ctx.globalAlpha = 1;
}

/* ─────────────────────────────────────────────────
   Liste des sous-couches à dessiner pour l'état courant :
   les occupées + (option) les vides jusqu'à la période suivante.
   → [{ sub, count }] dans l'ordre de remplissage.
───────────────────────────────────────────────── */
function getShellsAffichees(Z, nE) {
  /* Mode test « constitution » : la répartition dessinée est celle saisie par
     l'élève (state.testShells), pas le remplissage réel — et les 5
     sous-couches sont toujours tracées, y compris vides, puisque c'est à lui
     de les remplir. Volontairement sans garde-fou sur les capacités : si
     l'élève écrit 1s³, on dessine 3 électrons sur le cercle 1s. */
  if (state.testShells && _curRotKey === 'main') {
    /* `_curRotKey` est posé par renderAtome() avant tout appel : en mode
       Comparer (accessible dans le test « stabilité »), seul l'atome de
       gauche — celui du test — suit la saisie de l'élève ; celui de droite
       reste dessiné normalement. */
    return SUBSHELLS.map(function (s, i) {
      return { sub: s, count: state.testShells[i] || 0 };
    });
  }
  if (nE === undefined) nE = Z;
  var occ = {};
  getConfigForN(nE).forEach(function (c) { occ[c.sub.id] = c.count; });
  var maxN = getMaxNAffiche(Z);
  var out = [];
  SUBSHELLS.forEach(function (s) {
    var count = occ[s.id] || 0;
    if (count > 0 || (state.showEmpty && s.n <= maxN)) out.push({ sub: s, count: count });
  });
  return out;
}

/* ─────────────────────────────────────────────────
   Animation d'éclatement — planning temporel
───────────────────────────────────────────────── */

/* Instant de départ du rank-ième nucléon (cadence accélérée) */
function departDelay(rank) {
  return NUC_G0 * (1 - Math.pow(NUC_RATIO, rank)) / (1 - NUC_RATIO);
}

function nucTotalDur(A) { return departDelay(A - 1) + NUC_FLIGHT; }

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/* Progression de sortie [0..1] du nucléon de rang `rank` à l'instant
   courant de l'animation (0 = dans le noyau, 1 = rangé dans le cadre) */
function nucProgress(rank, A) {
  if (!_nucAnim.running) return state.eclate ? 1 : 0;
  var elapsed = performance.now() - _nucAnim.t0;
  if (_nucAnim.dir === 1) {
    return Math.max(0, Math.min(1, (elapsed - departDelay(rank)) / NUC_FLIGHT));
  }
  /* Retour : les derniers sortis rentrent en premier */
  return 1 - Math.max(0, Math.min(1, (elapsed - departDelay(A - 1 - rank)) / NUC_FLIGHT));
}

/* Déclenchement (appelé par ui.js) — dir 1 : éclater, -1 : rassembler */
function startNucAnim(dir) {
  var layout = getNucleusLayout(state.Z);
  var A = layout.pts.length;

  /* On fige les positions projetées courantes : points de départ (éclater)
     ou d'arrivée (rassembler) des trajectoires, en unités de rb pour
     rester valables après un redimensionnement. Les deux noyaux (mode
     comparaison) sont figés ensemble et animés sur le même minuteur. */
  _freeze.main = layout.pts.map(function (p) { return projectPt(p); });

  var dur = nucTotalDur(A);
  if (state.compare) {
    var layoutCmp = getNucleusLayout(state.Zcmp);
    _freeze.cmp = layoutCmp.pts.map(function (p) { return projectPt(p); });
    dur = Math.max(dur, nucTotalDur(layoutCmp.pts.length));
  } else {
    _freeze.cmp = null;
  }

  _nucAnim = { running: true, dir: dir, t0: performance.now(), dur: dur };
  requestAnimationFrame(nucTick);
}

function nucTick() {
  render();
  if (!_nucAnim.running) return;
  if (performance.now() - _nucAnim.t0 >= _nucAnim.dur) {
    _nucAnim.running = false;
    render();
    if (typeof onNucAnimEnd === 'function') onNucAnimEnd();
    return;
  }
  requestAnimationFrame(nucTick);
}

/* Réinitialisation immédiate (changement d'élément) */
function resetNucVue() {
  _nucAnim.running = false;
  _freeze = { main: null, cmp: null };
  state.eclate = false;
}

/* ─────────────────────────────────────────────────
   Animation « visualiser la charge » — planning temporel
   Même cadence accélérée que le noyau (departDelay/NUC_FLIGHT), mais sur
   une échelle de 2Z rangs : protons et électrons alternent un par un
   (proton 0, électron 0, proton 1, électron 1, …) au lieu de sortir par
   paires simultanées.
───────────────────────────────────────────────── */
function chargeProgress(idx, N) {
  if (!_chargeAnim.running) return state.charge ? 1 : 0;
  var elapsed = performance.now() - _chargeAnim.t0;
  if (_chargeAnim.dir === 1) {
    return Math.max(0, Math.min(1, (elapsed - departDelay(idx)) / NUC_FLIGHT));
  }
  return 1 - Math.max(0, Math.min(1, (elapsed - departDelay(N - 1 - idx)) / NUC_FLIGHT));
}

/* Rangs entrelacés : proton de slot s sort au rang 2s, électron de slot s
   sort au rang 2s+1 — sur une échelle totale de 2Z rangs. */
function chargeProgressP(slot, Z) { return chargeProgress(2 * slot, 2 * Z); }
function chargeProgressE(slot, nE) { return chargeProgress(2 * slot + 1, 2 * nE); }

/* Position (en unités de rStep, indépendante du redimensionnement) des Z
   électrons d'un atome sur leurs cercles de sous-couches, dans l'ordre de
   remplissage (slot 0..Z-1) — même géométrie que le tracé normal des
   électrons dans renderAtome() (angle de départ décalé par sous-couche). */
function getElectronLayout(Z, nE) {
  if (nE === undefined) nE = Z;
  var shells = getShellsAffichees(Z, nE);
  var radiiUnit = computeShellRadii(1);
  var list = [], slot = 0;
  shells.forEach(function (sh, k) {
    if (sh.count <= 0) return;
    var Runit = radiiUnit[SUBSHELLS.indexOf(sh.sub)];
    var start = -Math.PI / 2 + k * 0.7;
    for (var i = 0; i < sh.count; i++) {
      list.push({ slot: slot++, Runit: Runit, angle: start + i * 2 * Math.PI / sh.count });
    }
  });
  return list;
}

/* Déclenchement (appelé par ui.js) — dir 1 : éclater, -1 : rassembler.
   Seuls les protons sont figés (position 3D rotative) ; les électrons se
   recalculent à la volée (position fixe, indépendante de la rotation). */
function startChargeAnim(dir) {
  var layout = getNucleusLayout(state.Z);
  _freezeCharge.main = {};
  layout.pts.forEach(function (p) {
    if (p.t === 'p') _freezeCharge.main[p.slot] = projectPt(p);
  });

  var nEmain = nElectronsIon(getElement(state.Z).Z, state.ionQ);
  var dur = Math.max(nucTotalDur(2 * getElement(state.Z).Z), nucTotalDur(2 * nEmain));
  if (state.compare) {
    var layoutCmp = getNucleusLayout(state.Zcmp);
    _freezeCharge.cmp = {};
    layoutCmp.pts.forEach(function (p) {
      if (p.t === 'p') _freezeCharge.cmp[p.slot] = projectPt(p);
    });
    var nEcmp = nElectronsIon(getElement(state.Zcmp).Z, state.ionQCmp);
    dur = Math.max(dur, nucTotalDur(2 * getElement(state.Zcmp).Z), nucTotalDur(2 * nEcmp));
  } else {
    _freezeCharge.cmp = null;
  }

  _chargeAnim = { running: true, dir: dir, t0: performance.now(), dur: dur };
  requestAnimationFrame(chargeTick);
}

function chargeTick() {
  render();
  if (!_chargeAnim.running) return;
  if (performance.now() - _chargeAnim.t0 >= _chargeAnim.dur) {
    _chargeAnim.running = false;
    render();
    if (typeof onChargeAnimEnd === 'function') onChargeAnimEnd();
    return;
  }
  requestAnimationFrame(chargeTick);
}

/* Réinitialisation immédiate (changement d'élément) */
function resetChargeVue() {
  _chargeAnim.running = false;
  _freezeCharge = { main: null, cmp: null };
  state.charge = false;
}

/* ─────────────────────────────────────────────────
   Ajoute (ou relance) le vol d'un électron. `which` = 'main' ou 'cmp'.
   `oldNE`/`newNE` = nombre d'électrons avant/après le clic — l'électron
   concerné est toujours le dernier de l'ordre de remplissage (sous-couche
   la plus externe), cohérent avec la règle « la plus externe part/arrive
   en premier ». Appelée par ui.js APRÈS avoir mis à jour state.ionQ(Cmp),
   jamais bloquante : plusieurs vols peuvent coexister sur un même atome.
───────────────────────────────────────────────── */
function addIonFlight(which, Z, oldNE, newNE) {
  var vel = newNE > oldNE ? -1 : 1;             /* -1 : arrivée (s décroît), 1 : départ (s croît) */
  var nE = (vel === 1) ? oldNE : newNE;         /* électron concerné = le dernier de cette config */
  var layout = getElectronLayout(Z, nE);
  var e = layout[layout.length - 1];
  if (!e) return;

  var now = performance.now();
  var list = _ionFlights[which];
  var existing = null;
  for (var i = 0; i < list.length; i++) {
    if (list[i].slot === e.slot) { existing = list[i]; break; }
  }
  if (existing) {
    /* Même électron déjà en vol dans l'autre sens : demi-tour immédiat
       depuis sa position actuelle (pas de saut, pas de redémarrage). */
    var s = Math.max(0, Math.min(1, existing.s0 + existing.vel * (now - existing.t0) / ION_FLIGHT));
    existing.s0 = s;
    existing.t0 = now;
    existing.vel = vel;
    existing.Runit = e.Runit;
    existing.angle = e.angle;
  } else {
    list.push({ slot: e.slot, Runit: e.Runit, angle: e.angle,
                vel: vel, s0: (vel === 1) ? 0 : 1, t0: now });
  }

  /* Transition de configuration : les électrons restants (communs aux
     deux configs) glissent de leur ancienne à leur nouvelle position sur
     la même durée qu'un vol simple. On repart de l'état courant si une
     transition était déjà en cours (continuité, pas de saut). */
  var toLayout = getElectronLayout(Z, newNE);
  var prevCa = _configAnim[which];
  var fromLayout;
  if (prevCa) {
    var pt = configEase(which);
    if (pt === null) pt = 1;
    fromLayout = toLayout.map(function (tgt, i) {
      var a = prevCa.from[i], b = prevCa.to[i];
      if (!a || !b) return b || a || tgt;
      return lerpElecPos(a, b, pt);
    });
  } else {
    fromLayout = getElectronLayout(Z, oldNE);
  }
  _configAnim[which] = { from: fromLayout, to: toLayout, t0: now, dur: ION_FLIGHT };

  if (!_ionLoopRunning) { _ionLoopRunning = true; requestAnimationFrame(ionTick); }
}

/* Retire de la liste les vols arrivés à leur terme (s = 0 pour une
   arrivée, s = 1 pour un départ), en fixant `_s` (position figée pour ce
   frame) sur les vols encore actifs — évite un décalage entre le test de
   fin et le tracé au même instant. */
function pruneIonFlights(which) {
  var now = performance.now();
  _ionFlights[which] = _ionFlights[which].filter(function (f) {
    var s = Math.max(0, Math.min(1, f.s0 + f.vel * (now - f.t0) / ION_FLIGHT));
    if (f.vel === 1 && s >= 1) return false;    /* départ terminé : électron sorti du cadre */
    if (f.vel === -1 && s <= 0) return false;   /* arrivée terminée : rejoint le tracé normal */
    f._s = s;
    return true;
  });
}

function ionTick() {
  pruneIonFlights('main');
  pruneIonFlights('cmp');
  render();
  var caRunning = false;
  if (configEase('main') !== null) caRunning = true;
  if (configEase('cmp') !== null) caRunning = true;
  if (_ionFlights.main.length || _ionFlights.cmp.length || caRunning) {
    requestAnimationFrame(ionTick);
  } else {
    _ionLoopRunning = false;
  }
}

/* Réinitialisation immédiate (changement d'élément) */
function resetIonVue() {
  _ionFlights = { main: [], cmp: [] };
  _configAnim = { main: null, cmp: null };
  _ionLoopRunning = false;
}

/* ─────────────────────────────────────────────────
   Cadre de comptage (vue éclatée) — géométrie
   Les nucléons sont rangés en 2 colonnes côte à côte,
   une colonne protons et une colonne neutrons, chacune
   empilée verticalement (pas de titre, pas de paquets de 5).
───────────────────────────────────────────────── */
/* Marge verticale/horizontale minimale entre le cadre et les bords de la
   zone de schéma (évite qu'il chevauche une zone voisine — ex. tableau
   périodique replié sous le schéma sur petite fenêtre). */
var FRAME_MARGIN = 12;

function getFrameGeom(el, rb, minDim, cx) {
  /* Les billes du cadre ont la même taille que les nucléons du noyau
     (rb) : pas de taille plancher indépendante, pour que l'échelle soit
     cohérente quelle que soit la fenêtre. */
  var rbF = rb;
  var step = rbF * 2.6;
  var nP = el.Z, nN = el.A - el.Z;
  var groupGap = step * 0.35;             /* interligne supplémentaire tous les 5 */
  var nMax = Math.max(nP, nN, 1);

  function dims(s, g) {
    return { w: 2 * s, h: nMax * s + Math.floor((nMax - 1) / 5) * g };
  }
  var d = dims(step, groupGap);

  /* Si le cadre ne tient pas dans la hauteur disponible (petite fenêtre,
     gros atome), on réduit billes/écarts pour qu'il tienne toujours
     entièrement dans la zone de schéma. */
  var maxH = Math.max(20, _h - 2 * FRAME_MARGIN);
  if (d.h > maxH) {
    var scale = maxH / d.h;
    rbF *= scale; step *= scale; groupGap *= scale;
    d = dims(step, groupGap);
  }
  var w = d.w, h = d.h;

  /* Écart avec le schéma : comme pour la box Propriétés, un écart fixe
     colle le cadre au cortège électronique sur grand écran (le schéma,
     limité par min(largeur, hauteur), laisse alors beaucoup de place à
     droite) — on étire donc l'écart avec une partie de cette place
     libre, plafonné. Le minimum garantit qu'il ne chevauche jamais les
     sous-couches, y compris pour les gros atomes (cadre plus haut). */
  var rightSpace = Math.max(0, (_vx + _vw) - (cx + _schemaRmax) - w - 16);
  var gap = Math.min(90, Math.max(36, rightSpace * 0.3 + 36));
  var x0 = cx + _schemaRmax + gap;
  x0 = Math.min(x0, _vx + _vw - w - FRAME_MARGIN);
  x0 = Math.max(x0, _vx + FRAME_MARGIN);
  var y0 = Math.max(FRAME_MARGIN, Math.min(_h / 2 - h / 2, _h - h - FRAME_MARGIN));
  return { x0: x0, y0: y0, w: w, h: h, step: step, rbF: rbF, groupGap: groupGap,
           yP: 0, yN: 0, nP: nP, nN: nN };
}

/* Centre du slot idx (empilé verticalement) dans sa colonne (0 = protons,
   1 = neutrons) — interligne élargi tous les 5 nucléons */
function slotPos(g, idx, col) {
  return {
    x: g.x0 + col * g.step + g.step / 2,
    y: g.y0 + idx * g.step + Math.floor(idx / 5) * g.groupGap + g.step / 2
  };
}

/* ─────────────────────────────────────────────────
   Rayons des cercles de sous-couches — les sous-couches
   d'une même couche (n) sont resserrées entre elles ; l'écart
   est plus grand entre deux couches différentes. Dépend
   uniquement de rStep (donc identique pour tous les atomes).
───────────────────────────────────────────────── */
var SHELL_STEP_INNER = 0.45;   /* même couche (n identique)   */
var SHELL_STEP_OUTER = 1.35;   /* changement de couche        */

function computeShellRadii(rStep) {
  var radii = [];
  var r = 0;
  for (var i = 0; i < SUBSHELLS.length; i++) {
    var sameGroup = i > 0 && SUBSHELLS[i].n === SUBSHELLS[i - 1].n;
    r += rStep * (sameGroup ? SHELL_STEP_INNER : SHELL_STEP_OUTER);
    radii.push(r);
  }
  return radii;
}

/* Couleur de halo d'une couche : moyenne des couleurs de TOUTES les
   sous-couches de cette couche (affichées ou non), pour que le fond
   d'une couche ne change pas selon les sous-couches visibles. */
var _shellHaloColors = {};
function shellHaloColor(n) {
  if (!_shellHaloColors[n]) {
    var cols = [];
    SUBSHELLS.forEach(function (s) { if (s.n === Number(n)) cols.push(s.color); });
    _shellHaloColors[n] = blendHexColors(cols);
  }
  return _shellHaloColors[n];
}

/* Mélange de couleurs hex (moyenne RGB) pour le halo d'une couche
   regroupant plusieurs sous-couches de couleurs différentes. */
function blendHexColors(colors) {
  var r = 0, g = 0, b = 0;
  colors.forEach(function (c) {
    r += parseInt(c.slice(1, 3), 16);
    g += parseInt(c.slice(3, 5), 16);
    b += parseInt(c.slice(5, 7), 16);
  });
  var n = colors.length;
  r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

/* Halos diffus englobant chaque couche (regroupe les sous-couches de
   même n), dessinés avant les cercles pour rester en arrière-plan. */
function drawShellHalos(cx, cy, shells, radii, rStep) {
  var groups = {};
  var order = [];
  shells.forEach(function (sh) {
    var idx = SUBSHELLS.indexOf(sh.sub);
    var R = radii[idx];
    if (!groups[sh.sub.n]) { groups[sh.sub.n] = { min: R, max: R }; order.push(sh.sub.n); }
    var grp = groups[sh.sub.n];
    grp.min = Math.min(grp.min, R);
    grp.max = Math.max(grp.max, R);
  });

  var pad = rStep * 0.32;
  _ctx.save();
  order.forEach(function (n) {
    var grp = groups[n];
    var inner = Math.max(0, grp.min - pad);
    var outer = grp.max + pad;
    var col = shellHaloColor(n);
    _ctx.filter = 'blur(6px)';
    _ctx.globalAlpha = 0.16;
    _ctx.fillStyle = col;
    _ctx.beginPath();
    _ctx.arc(cx, cy, outer, 0, 2 * Math.PI);
    _ctx.arc(cx, cy, inner, 0, 2 * Math.PI, true);
    _ctx.fill('evenodd');
  });
  _ctx.restore();
}

/* ─────────────────────────────────────────────────
   RENDER — dessin complet du schéma
───────────────────────────────────────────────── */

/* Angle (en degrés, 0° = droite, sens horaire écran) de l'étiquette
   du k-ième cercle affiché : alternance gauche/droite du haut du
   schéma pour éviter les chevauchements (façon image de référence). */
var LABEL_ANGLES = [-68, -112, -38, -132, -14];

function render() {
  if (!_ctx) return;
  _ctx.clearRect(0, 0, _w, _h);

  if (state.compare) {
    /* Zone coupée en deux : à gauche l'élément sélectionné dans le tableau
       périodique, à droite celui du sélecteur « Comparer » du panneau. */
    var half = _w / 2;
    renderAtome(state.Z,    0,    half, 'main');
    renderAtome(state.Zcmp, half, half, 'cmp');
    drawSeparateurCompare(half);
  } else {
    renderAtome(state.Z, 0, _w, 'main');
  }
}

/* Trait de séparation entre les deux demi-zones (mode comparaison) */
function drawSeparateurCompare(x) {
  _ctx.save();
  _ctx.setLineDash([7, 6]);
  _ctx.lineWidth = 1.5;
  _ctx.strokeStyle = '#c8c0b4';
  _ctx.beginPath();
  _ctx.moveTo(x, _h * 0.03);
  _ctx.lineTo(x, _h * 0.97);
  _ctx.stroke();
  _ctx.restore();
}

/* Dessin d'un atome dans la bande verticale [x0, x0 + w] du canvas.
   freezeKey ('main' ou 'cmp') identifie le noyau figé (_freeze) qui lui
   correspond pendant l'animation d'éclatement. */
function renderAtome(Z, x0, w, freezeKey) {
  _vx = x0;
  _vw = w;
  _curRotKey = freezeKey;

  var el = getElement(Z);
  var ionQ = (freezeKey === 'cmp') ? state.ionQCmp : state.ionQ;
  var nE = nElectronsIon(Z, ionQ);
  var shells = getShellsAffichees(Z, nE);
  var ionFlights = _ionFlights[freezeKey];

  /* Une bande est réservée en bas de la zone (de chaque demi-zone en
     comparaison) pour le rappel Z/A et la configuration électronique. */
  var infoH = Math.max(34, _h * 0.16);

  var cx = x0 + w / 2, cy = (_h - infoH) / 2;
  var minDim = Math.min(w, _h - infoH);
  if (minDim < 60) return;

  /* Rayon extérieur : on réserve la place des étiquettes + électrons */
  var fs = Math.max(11, minDim * 0.034);          /* police étiquettes  */
  var Rmax = minDim / 2 - fs * 1.4;
  _schemaRmax = Rmax;

  /* Échelle COMMUNE à tous les atomes : l'écart entre sous-couches est
     toujours Rmax / 5 (nombre total de sous-couches de la page), si bien
     qu'une sous-couche donnée a le même rayon quel que soit l'élément.
     Un atome de la période 1 occupe donc moins de place qu'un de la
     période 3 — c'est voulu (comparaison visuelle des tailles). */
  var rStep = Rmax / SUBSHELLS.length;

  /* Rayon d'un électron : à peine plus gros qu'un nucléon (rb = 0.075 rStep) */
  var re = Math.max(3.5, rStep * 0.10);

  /* ── Noyau 3D ─────────────────────────────────── */
  /* Même échelle pour tous : rayon de bille constant, l'amas grossit
     avec le nombre de nucléons A (garde-fou : l'amas ne doit pas
     toucher le cercle 1s). */
  var layout = getNucleusLayout(Z);
  var A = layout.pts.length;
  var RU = layout.radiusUnits;
  var rb = rStep * 0.075 * 1.25 * 1.5;
  rb *= Math.min(1, (rStep * 0.68) / (RU * rb));

  /* Zone de saisie du noyau (drag) : cercle englobant, avec une marge pour
     rester facilement cliquable même sur un petit noyau (H, He). */
  _nucleusHit[freezeKey] = { cx: cx, cy: cy, r: Math.max(RU * rb * 1.3, rStep * 0.55) };

  var anim = _nucAnim.running || state.eclate;
  var animCharge = _chargeAnim.running || state.charge;

  /* Billes triées d'arrière en avant ; alpha réduit (fantôme) pour
     celles qui ont quitté le noyau (éclatement) ou l'atome (charge). */
  var proj = layout.pts.map(function (p, i) {
    var q = projectPt(p);
    q.t = p.t; q.rank = p.rank; q.slot = p.slot; q.i = i;
    return q;
  });
  proj.sort(function (a, b) { return a.z - b.z; });
  proj.forEach(function (q) {
    var prog = anim ? nucProgress(q.rank, A) : 0;
    if (q.t === 'p' && animCharge) prog = Math.max(prog, chargeProgressP(q.slot, el.Z));
    var scale = 1 + 0.22 * q.z / RU;                     /* effet perspective   */
    var shade = 0.5 * (1 - (q.z / RU + 1) / 2);          /* fond assombri       */
    drawNucleon(cx + q.x * rb, cy + q.y * rb, rb * scale, q.t,
                shade, prog > 0 ? 0.20 : 1);
  });

  /* ── Cercles des sous-couches + électrons + étiquettes ── */
  var shellRadii = computeShellRadii(rStep);
  drawShellHalos(cx, cy, shells, shellRadii, rStep);

  var eSlot = 0;
  shells.forEach(function (sh, k) {
    var R = shellRadii[SUBSHELLS.indexOf(sh.sub)];
    var col = sh.sub.color;

    /* cercle : tirets pour s, pointillés pour p (comme la légende) */
    _ctx.beginPath();
    _ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    _ctx.setLineDash(sh.sub.l === 's' ? [8, 6] : [2.5, 4.5]);
    _ctx.lineWidth = 1.6;
    _ctx.strokeStyle = col;
    _ctx.globalAlpha = sh.count > 0 ? 1 : 0.55;   /* sous-couche vide atténuée */
    _ctx.stroke();
    _ctx.setLineDash([]);

    /* électrons équirépartis, angle de départ décalé par sous-couche
       pour éviter les alignements entre cercles */
    if (sh.count > 0) {
      var start = -Math.PI / 2 + k * 0.7;
      for (var i = 0; i < sh.count; i++) {
        var a = start + i * 2 * Math.PI / sh.count;
        var thisSlot = eSlot;
        var progE = animCharge ? chargeProgressE(eSlot, nE) : 0;
        eSlot++;
        /* L'électron en cours d'animation d'ionisation (arrivée) n'est pas
           encore dessiné à sa place normale — il apparaît via l'overlay
           ci-dessous, en vol. */
        var arriving = ionFlights.some(function (f) { return f.vel === -1 && f.slot === thisSlot; });
        if (arriving) continue;
        var ex = cx + R * Math.cos(a), ey = cy + R * Math.sin(a);
        var ct = configEase(freezeKey);
        if (ct !== null) {
          var ca = _configAnim[freezeKey];
          var fromE = ca.from[thisSlot], toE = ca.to[thisSlot];
          if (fromE && toE) {
            var pos = lerpElecPos(fromE, toE, ct);
            ex = cx + pos.Runit * rStep * Math.cos(pos.angle);
            ey = cy + pos.Runit * rStep * Math.sin(pos.angle);
          }
        }
        drawElectron(ex, ey, re, progE > 0 ? 0.20 : 1);
      }
    }

    /* étiquette de la sous-couche : décalée par rapport au cercle pour ne
       pas se superposer aux pointillés — vers l'intérieur pour s, vers
       l'extérieur pour p. */
    var la = LABEL_ANGLES[k % LABEL_ANGLES.length] * Math.PI / 180;
    var Rlab = R + (sh.sub.l === 's' ? -1 : 1) * fs * 0.75;
    var lx = cx + Rlab * Math.cos(la);
    var ly = cy + Rlab * Math.sin(la);
    _ctx.font = '700 ' + fs + 'px monospace';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillStyle = col;
    _ctx.fillText(sh.sub.id, lx, ly);
    _ctx.globalAlpha = 1;
  });

  /* ── Vue éclatée : cadre de comptage + nucléons en vol ── */
  if (anim) drawVueEclatee(el, layout, cx, cy, rb, minDim, _freeze[freezeKey]);

  /* ── Vue charge : cadre protons/électrons + particules en vol ── */
  if (animCharge) drawVueCharge(el, layout, cx, cy, rb, minDim, rStep, _freezeCharge[freezeKey], nE);

  /* ── Vols d'ionisation en cours : chaque électron file tout droit vers
     le haut hors du cadre (départ) ou en arrive symétriquement (arrivée).
     `f._s` (figé par pruneIonFlights()) ∈ [0,1] : 0 = sur son cercle de
     sous-couche, 1 = hors cadre — même formule quel que soit le sens en
     cours, ce qui permet un demi-tour continu sans discontinuité. ── */
  var eyOut = -re * 4;   /* au-dessus du canvas */
  ionFlights.forEach(function (f) {
    var ex = cx + f.Runit * rStep * Math.cos(f.angle);
    var eyShell = cy + f.Runit * rStep * Math.sin(f.angle);
    var ey = eyShell + (eyOut - eyShell) * easeInOut(f._s);
    drawElectron(ex, ey, re);
  });

  /* ── Rappel Z/A + configuration sous le schéma ── */
  drawInfosAtome(el, cx, infoH, nE, ionQ);

  /* ── Pastille de stabilité (option) ── */
  if (state.showStable && !state.testShells) drawBadgeStabilite(Z, ionQ, cx, cy, minDim, infoH);
}

/* Écart (px) entre le bord d'un rectangle et un cercle : > 0 = dégagé,
   < 0 = le rectangle mord dans le cercle (profondeur de la pénétration). */
function _ecartRectCercle(r, cx, cy, R) {
  var nx = Math.max(r.x, Math.min(cx, r.x + r.w));
  var ny = Math.max(r.y, Math.min(cy, r.y + r.h));
  return Math.sqrt((cx - nx) * (cx - nx) + (cy - ny) * (cy - ny)) - R;
}

/* ─────────────────────────────────────────────────
   Pastille « Stable / Instable ». Sa position n'est pas fixe : selon la
   forme de la zone (fenêtre large, étroite, mode comparaison), la place
   libre autour du schéma n'est pas au même endroit — collée à un coin de
   la zone elle se perdrait dans le vide sur grand écran, collée au schéma
   elle mordrait sur les sous-couches sur petite fenêtre. On essaie donc
   plusieurs emplacements (coin en diagonale, au-dessus, à gauche…) et on
   garde le premier qui tient dans la zone **sans toucher** le cercle
   extérieur du cortège électronique ; à défaut, le moins mauvais.
   Deuxième ligne : l'état de la couche de valence.
───────────────────────────────────────────────── */
function drawBadgeStabilite(Z, ionQ, cx, cy, minDim, infoH) {
  var st = getStabilite(Z, ionQ);
  /* Taille calée sur celle du schéma (comme les étiquettes de sous-couches),
     pas sur la largeur de la zone : lisible de loin au vidéoprojecteur. */
  var fs = Math.max(13, Math.min(26, minDim * 0.058));

  var l1 = (st.stable ? '✓ Stable' : '✗ Instable');
  var l2 = st.vide ? 'aucune couche de valence'
                   : 'Couche ' + st.n + (st.stable ? ' saturée.' : ' incomplète.');

  _ctx.save();

  /* Dimensions de la pastille ; si elle ne tient pas dans la largeur de la
     zone, on réduit la police et on remesure une fois. */
  var fs2, pad, bw, bh;
  function mesure() {
    fs2 = fs * 0.72;
    pad = fs * 0.6;
    _ctx.font = '700 ' + fs + 'px system-ui, sans-serif';
    var w1 = _ctx.measureText(l1).width;
    _ctx.font = '500 ' + fs2 + 'px system-ui, sans-serif';
    var w2 = _ctx.measureText(l2).width;
    bw = Math.max(w1, w2) + 2 * pad;
    bh = fs * 1.2 + fs2 * 1.25 + 2 * pad * 0.7;
  }
  mesure();
  var dispoW = _vw - 2 * FRAME_MARGIN;
  if (bw > dispoW) { fs = Math.max(9, fs * dispoW / bw); mesure(); }

  /* ── Choix de l'emplacement ──
     Bande utile : toute la zone au-dessus du bandeau d'informations.
     Le cercle à éviter est celui du cortège (_schemaRmax) + une marge. */
  var xMin = _vx + FRAME_MARGIN, xMax = _vx + _vw - bw - FRAME_MARGIN;
  var yMin = FRAME_MARGIN,       yMax = _h - infoH - bh - FRAME_MARGIN;
  var g = pad * 0.6;                       /* respiration autour du schéma */
  var R = _schemaRmax + g;

  var cands = [
    /* diagonale du coin haut-gauche du schéma (cas grand écran) */
    { x: cx - _schemaRmax * 0.707 - g - bw, y: cy - _schemaRmax * 0.707 - g - bh },
    /* au-dessus du schéma, aligné à gauche de la zone puis centré */
    { x: xMin,          y: cy - R - bh },
    { x: cx - bw / 2,   y: cy - R - bh },
    /* à gauche du schéma, à mi-hauteur */
    { x: cx - R - bw,   y: cy - bh / 2 },
    /* sous le schéma, au-dessus du bandeau d'informations */
    { x: xMin,          y: cy + R },
    /* dernier recours : coin haut-gauche de la zone */
    { x: xMin,          y: yMin }
  ];

  var best = null, bestCost = Infinity;
  cands.forEach(function (c) {
    var r = { x: c.x, y: c.y, w: bw, h: bh };
    /* dépassement de la zone (compté double : sortir du cadre est pire
       qu'effleurer un cercle) */
    var hors = Math.max(0, xMin - r.x) + Math.max(0, r.x - xMax)
             + Math.max(0, yMin - r.y) + Math.max(0, r.y - yMax);
    var cost = 2 * hors + Math.max(0, -_ecartRectCercle(r, cx, cy, R));
    if (cost < bestCost - 0.5) { bestCost = cost; best = r; }
  });

  var x = Math.max(xMin, Math.min(best.x, Math.max(xMin, xMax)));
  var y = Math.max(yMin, Math.min(best.y, Math.max(yMin, yMax)));

  var col    = st.stable ? '#2a8a50' : '#c0392b';
  var fondOk = st.stable ? 'rgba(226,245,232,0.94)' : 'rgba(252,232,228,0.94)';

  _ctx.beginPath();
  if (_ctx.roundRect) _ctx.roundRect(x, y, bw, bh, 8);
  else                _ctx.rect(x, y, bw, bh);
  _ctx.fillStyle = fondOk;
  _ctx.fill();
  _ctx.lineWidth = 1.5;
  _ctx.strokeStyle = col;
  _ctx.stroke();

  _ctx.textAlign = 'center';
  _ctx.textBaseline = 'middle';
  _ctx.fillStyle = col;
  _ctx.font = '700 ' + fs + 'px system-ui, sans-serif';
  _ctx.fillText(l1, x + bw / 2, y + pad * 0.7 + fs * 0.6);
  _ctx.font = '500 ' + fs2 + 'px system-ui, sans-serif';
  _ctx.globalAlpha = 0.85;
  _ctx.fillText(l2, x + bw / 2, y + pad * 0.7 + fs * 1.2 + fs2 * 0.62);
  _ctx.restore();
}

/* ─────────────────────────────────────────────────
   Bandeau d'informations sous chaque schéma (mode normal comme
   comparaison) : Z et A, puis la configuration électronique
   aux couleurs des sous-couches, préfixée du symbole.
───────────────────────────────────────────────── */
function drawInfosAtome(el, cx, infoH, nE, ionQ) {
  if (nE === undefined) nE = el.Z;
  if (ionQ === undefined) ionQ = 0;
  var fs = Math.max(11, Math.min(_vw * 0.05, infoH * 0.32));
  var yCfg = _h - infoH * 0.20;
  var yZA  = yCfg - fs * 1.75;

  _ctx.textAlign = 'center';
  _ctx.textBaseline = 'alphabetic';
  _ctx.font = '700 ' + (fs * 0.82) + 'px monospace';
  _ctx.fillStyle = '#7a8a96';
  _ctx.fillText('Z = ' + el.Z + '   A = ' + el.A, cx, yZA);

  /* Mode test : la configuration électronique est à écrire par l'élève dans
     la barre du bas — seul le rappel Z/A est dessiné ici, à sa place
     habituelle, suivi de la consigne posée par test.js. La place libérée par
     la configuration suffit largement. */
  if (state.testShells && _curRotKey === 'main') {
    if (state.testConsigne) drawConsigneTest(state.testConsigne, cx, yCfg, fs);
    return;
  }

  drawConfigLigne(el, cx, yCfg, fs, nE, ionQ);
}

/* Consigne du mode test, sur une ligne centrée sous le rappel Z/A. Le texte
   est découpé sur « | » : un segment sur deux (indices impairs) est mis en
   gras — c'est ainsi que test.js met « ion stable » en évidence. La police
   est réduite tant que la ligne déborde de la zone. */
function drawConsigneTest(txt, cx, y, fsBase) {
  var segs = txt.split('|');

  function police(i, fs) {
    return (i % 2 ? '700 ' : '400 ') + fs + 'px "Segoe UI", Arial, sans-serif';
  }
  function largeur(fs) {
    var w = 0;
    segs.forEach(function (s, i) { _ctx.font = police(i, fs); w += _ctx.measureText(s).width; });
    return w;
  }

  var fs = fsBase * 0.74;
  var w = largeur(fs);
  var wMax = _vw * 0.94;
  while (w > wMax && fs > 9) { fs *= 0.92; w = largeur(fs); }

  var x = cx - w / 2;
  _ctx.textAlign = 'left';
  _ctx.fillStyle = '#5a6a78';
  segs.forEach(function (s, i) {
    _ctx.font = police(i, fs);
    _ctx.fillText(s, x, y);
    x += _ctx.measureText(s).width;
  });
  _ctx.textAlign = 'center';
}

/* Configuration électronique sur une ligne, centrée en cx, précédée du
   symbole de l'élément (ex. « O : 1s² 2s² 2p⁴ »), exposants surélevés —
   équivalent canvas de l'ancien configHTML() (ui.js). Si l'option
   « sous-couches vides » est active (state.showEmpty), les sous-couches
   suivantes jusqu'à la période suivante sont ajoutées entre parenthèses,
   atténuées — même règle que getShellsAffichees()/getMaxNAffiche(). */
function drawConfigLigne(el, cx, y, fs, nE, ionQ) {
  if (nE === undefined) nE = el.Z;
  if (ionQ === undefined) ionQ = 0;
  var conf = getConfigForN(nE);
  var fsSup = fs * 0.68;
  var space = fs * 0.5;

  var occ = {};
  conf.forEach(function (c) { occ[c.sub.id] = true; });
  var vides = [];
  if (state.showEmpty) {
    var maxN = getMaxNAffiche(el.Z);
    vides = SUBSHELLS.filter(function (s) { return !occ[s.id] && s.n <= maxN; });
  }

  /* Symbole suivi, pour un ion, de la charge en exposant (nomenclature
     classique, ex. « Na⁺ », « O²⁻ ») avant le « : ». */
  var chg = ionExposant(ionQ);
  _ctx.font = '700 ' + fs + 'px monospace';
  var symW = _ctx.measureText(el.sym).width;
  var chgW = 0;
  if (chg) {
    _ctx.font = '700 ' + fsSup + 'px monospace';
    chgW = _ctx.measureText(chg).width;
  }
  _ctx.font = '700 ' + fs + 'px monospace';
  var colonW = _ctx.measureText(' :').width;
  var symTxt = el.sym;

  function termWidth(id, count) {
    _ctx.font = '700 ' + fs + 'px monospace';
    var wId = _ctx.measureText(id).width;
    _ctx.font = '700 ' + fsSup + 'px monospace';
    return { wId: wId, w: wId + _ctx.measureText(String(count)).width };
  }

  var parts = conf.map(function (c) {
    var m = termWidth(c.sub.id, c.count);
    return { id: c.sub.id, count: c.count, color: c.sub.color, alpha: 1, wId: m.wId, w: m.w };
  });

  var parenW = 0, videParts = [];
  if (vides.length) {
    _ctx.font = '700 ' + fs + 'px monospace';
    parenW = _ctx.measureText('(').width;
    videParts = vides.map(function (s) {
      var m = termWidth(s.id, 0);
      return { id: s.id, count: 0, color: s.color, alpha: 0.55, wId: m.wId, w: m.w };
    });
  }

  var total = symW + chgW + colonW + space +
              parts.reduce(function (s, p) { return s + p.w; }, 0) +
              space * Math.max(0, parts.length - 1);
  if (vides.length) {
    total += space + parenW +
             videParts.reduce(function (s, p) { return s + p.w; }, 0) +
             space * (videParts.length - 1) + parenW;
  }
  var x = cx - total / 2;

  _ctx.textAlign = 'left';
  _ctx.font = '700 ' + fs + 'px monospace';
  _ctx.fillStyle = '#2c3e50';
  _ctx.fillText(symTxt, x, y);
  x += symW;
  if (chg) {
    _ctx.font = '700 ' + fsSup + 'px monospace';
    _ctx.fillText(chg, x, y - fs * 0.42);
    x += chgW;
  }
  _ctx.font = '700 ' + fs + 'px monospace';
  _ctx.fillText(' :', x, y);
  x += colonW + space;

  function drawTerm(p) {
    _ctx.globalAlpha = p.alpha;
    _ctx.fillStyle = p.color;
    _ctx.font = '700 ' + fs + 'px monospace';
    _ctx.fillText(p.id, x, y);
    _ctx.font = '700 ' + fsSup + 'px monospace';
    _ctx.fillText(String(p.count), x + p.wId, y - fs * 0.42);
    _ctx.globalAlpha = 1;
    x += p.w + space;
  }

  parts.forEach(drawTerm);

  if (vides.length) {
    _ctx.fillStyle = '#7a8a96';
    _ctx.font = '700 ' + fs + 'px monospace';
    _ctx.fillText('(', x, y);
    x += parenW + space;
    videParts.forEach(drawTerm);
    x -= space;
    _ctx.fillStyle = '#7a8a96';
    _ctx.font = '700 ' + fs + 'px monospace';
    _ctx.fillText(')', x, y);
  }

  _ctx.textAlign = 'center';
}

/* ─────────────────────────────────────────────────
   Vue éclatée — cadre, nucléons rangés, nucléons en vol.
   Dessinée APRÈS les sous-couches : le cadre et les billes
   en vol passent devant les cercles.
───────────────────────────────────────────────── */
/* Cadre blanc arrondi commun aux deux vues éclatées (éclatement / charge) */
function drawCountFrame(g) {
  var pad = 10;
  _ctx.beginPath();
  if (_ctx.roundRect) {
    _ctx.roundRect(g.x0 - pad, g.y0 - pad, g.w + 2 * pad, g.h + 2 * pad, 8);
  } else {
    _ctx.rect(g.x0 - pad, g.y0 - pad, g.w + 2 * pad, g.h + 2 * pad);
  }
  _ctx.fillStyle = 'rgba(255,255,255,0.88)';
  _ctx.fill();
  _ctx.lineWidth = 1.5;
  _ctx.strokeStyle = '#c8c0b4';
  _ctx.stroke();
}

function drawVueEclatee(el, layout, cx, cy, rb, minDim, freeze) {
  var A = layout.pts.length;
  var g = getFrameGeom(el, rb, minDim, cx);
  drawCountFrame(g);

  /* Nucléons rangés / en vol (ordre de sortie pour un empilement propre) */
  var enVol = [];
  layout.pts.forEach(function (p, idx) {
    var prog = nucProgress(p.rank, A);
    if (prog <= 0) return;                        /* encore dans le noyau */
    var dest = slotPos(g, p.slot, p.t === 'p' ? 0 : 1);
    if (prog >= 1) {
      drawNucleon(dest.x, dest.y, g.rbF, p.t, 0, 1);
      return;
    }
    /* Trajectoire courbe : Bézier quadratique passant au-dessus */
    var f = freeze ? freeze[idx] : projectPt(p);
    var x0 = cx + f.x * rb, y0 = cy + f.y * rb;
    var mx = (x0 + dest.x) / 2;
    var my = Math.min(y0, dest.y) - minDim * 0.13;
    var e = easeInOut(prog);
    var u = 1 - e;
    enVol.push({
      x: u * u * x0 + 2 * u * e * mx + e * e * dest.x,
      y: u * u * y0 + 2 * u * e * my + e * e * dest.y,
      t: p.t
    });
  });
  /* Les billes en vol par-dessus tout */
  enVol.forEach(function (b) { drawNucleon(b.x, b.y, g.rbF, b.t, 0, 1); });
}

/* ─────────────────────────────────────────────────
   Vue « visualiser la charge » — cadre, protons/électrons rangés en vol.
   Réutilise getFrameGeom()/slotPos() avec un élément fictif { Z, A: 2Z }
   (nP = Z protons, nN = Z électrons) : même géométrie de cadre que la vue
   éclatée du noyau, colonne 0 = protons (rouge), colonne 1 = électrons
   (bleu). Dessinée APRÈS les sous-couches, comme drawVueEclatee().
───────────────────────────────────────────────── */
function drawVueCharge(el, layout, cx, cy, rb, minDim, rStep, freeze, nE) {
  var Z = el.Z;
  if (nE === undefined) nE = Z;
  var elFake = { Z: Z, A: Z + nE };
  var g = getFrameGeom(elFake, rb, minDim, cx);
  drawCountFrame(g);

  var enVol = [];

  /* Protons : partent du noyau (position 3D figée, comme l'éclatement) */
  layout.pts.forEach(function (p) {
    if (p.t !== 'p') return;
    var prog = chargeProgressP(p.slot, Z);
    if (prog <= 0) return;
    var dest = slotPos(g, p.slot, 0);
    if (prog >= 1) { drawNucleon(dest.x, dest.y, g.rbF, 'p', 0, 1); return; }
    var f = freeze ? freeze[p.slot] : projectPt(p);
    var x0 = cx + f.x * rb, y0 = cy + f.y * rb;
    var mx = (x0 + dest.x) / 2;
    var my = Math.min(y0, dest.y) - minDim * 0.13;
    var e = easeInOut(prog), u = 1 - e;
    enVol.push({
      x: u * u * x0 + 2 * u * e * mx + e * e * dest.x,
      y: u * u * y0 + 2 * u * e * my + e * e * dest.y,
      kind: 'p'
    });
  });

  /* Électrons : partent de leur position fixe sur leur cercle de sous-couche */
  getElectronLayout(Z, nE).forEach(function (el2) {
    var prog = chargeProgressE(el2.slot, nE);
    if (prog <= 0) return;
    var dest = slotPos(g, el2.slot, 1);
    if (prog >= 1) { drawElectron(dest.x, dest.y, g.rbF); return; }
    var x0 = cx + el2.Runit * rStep * Math.cos(el2.angle);
    var y0 = cy + el2.Runit * rStep * Math.sin(el2.angle);
    var mx = (x0 + dest.x) / 2;
    var my = Math.min(y0, dest.y) - minDim * 0.13;
    var e = easeInOut(prog), u = 1 - e;
    enVol.push({
      x: u * u * x0 + 2 * u * e * mx + e * e * dest.x,
      y: u * u * y0 + 2 * u * e * my + e * e * dest.y,
      kind: 'e'
    });
  });

  /* Particules en vol par-dessus tout */
  enVol.forEach(function (b) {
    if (b.kind === 'p') drawNucleon(b.x, b.y, g.rbF, 'p', 0, 1);
    else drawElectron(b.x, b.y, g.rbF);
  });
}
