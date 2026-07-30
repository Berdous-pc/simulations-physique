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

/* Rayon extérieur réel du schéma (cercle 3p compris), mis à jour à chaque
   render() — lu par ui.js (positionPropsBox()) pour ancrer la box
   Propriétés au bord réel du schéma plutôt qu'à une largeur arbitraire :
   ce rayon dépend de min(_w, _h) et peut donc être petit même sur une
   fenêtre très large (fenêtre large et peu haute). */
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

var _rotM = matMul(rotX(-0.40), rotY(0.55));   /* légère inclinaison initiale */
var _drag = { active: false, lastX: 0, lastY: 0 };

/* Rotation incrémentale en espace écran (prémultiplication) */
function rotateBy(ax, ay) {
  _rotM = matMul(matMul(rotX(ax), rotY(ay)), _rotM);
}

/* ── Animation d'éclatement ───────────────────── */
var _nucAnim = { running: false, dir: 1, t0: 0, dur: 0 };
var _freeze  = null;   /* positions projetées (unités rb) au déclenchement */

/* Cadence de sortie : premiers nucléons lents, puis accélération */
var NUC_G0 = 260, NUC_RATIO = 0.90, NUC_FLIGHT = 380;   /* ms */

function initDraw() {
  _canvas = document.getElementById('atom-canvas');
  _ctx = _canvas.getContext('2d');
  _canvas.style.cursor = 'grab';

  /* Rotation du noyau au drag, N'IMPORTE OÙ sur le canvas
     (pointer events : souris + tactile) */
  _canvas.addEventListener('pointerdown', function (e) {
    if (_nucAnim.running) return;
    _drag.active = true;
    _drag.lastX = e.clientX;
    _drag.lastY = e.clientY;
    _canvas.setPointerCapture(e.pointerId);
    _canvas.style.cursor = 'grabbing';
  });
  _canvas.addEventListener('pointermove', function (e) {
    if (!_drag.active) return;
    /* Axe X écran ← mouvement vertical ; axe Y écran ← mouvement
       horizontal. Signes choisis pour que le noyau roule sous le
       curseur (drag vers la droite → la face avant part à droite). */
    rotateBy(-(e.clientY - _drag.lastY) * 0.01, (e.clientX - _drag.lastX) * 0.01);
    _drag.lastX = e.clientX;
    _drag.lastY = e.clientY;
    requestAnimationFrame(render);
  });
  _canvas.addEventListener('pointerup', function () {
    _drag.active = false;
    _canvas.style.cursor = 'grab';
  });
  _canvas.addEventListener('pointercancel', function () { _drag.active = false; });
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
  var m = _rotM;
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
function drawElectron(x, y, r) {
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
}

/* ─────────────────────────────────────────────────
   Liste des sous-couches à dessiner pour l'état courant :
   les occupées + (option) les vides jusqu'à la période suivante.
   → [{ sub, count }] dans l'ordre de remplissage.
───────────────────────────────────────────────── */
function getShellsAffichees() {
  var occ = {};
  getConfig(state.Z).forEach(function (c) { occ[c.sub.id] = c.count; });
  var maxN = getMaxNAffiche(state.Z);
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
     rester valables après un redimensionnement. */
  _freeze = layout.pts.map(function (p) { return projectPt(p); });

  _nucAnim = { running: true, dir: dir, t0: performance.now(), dur: nucTotalDur(A) };
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
  _freeze = null;
  state.eclate = false;
}

/* ─────────────────────────────────────────────────
   Cadre de comptage (vue éclatée) — géométrie
   Simplifié : seul le titre « A = … nucléons », puis les
   nucléons rangés par paquets de 5 (protons, puis neutrons).
   La largeur du cadre est celle de la grille (5 sphères) ;
   la police du titre est réduite si besoin pour ne pas
   dépasser cette largeur.
───────────────────────────────────────────────── */
/* Rayon plancher des billes du cadre : en dessous, sur petite fenêtre,
   le cadre devient minuscule et le texte flou (police trop réduite pour
   rester nette). Indépendant du rb du noyau (qui, lui, doit suivre
   l'échelle commune du schéma) — seul le cadre de comptage garde une
   taille lisible quelle que soit la fenêtre. */
var FRAME_RB_MIN = 5.5;
var FRAME_FS_MIN = 9;   /* police mini lisible (px) */

function getFrameGeom(el, rb, minDim, cx) {
  var rbF = Math.max(rb, FRAME_RB_MIN);
  var step = rbF * 2.6;
  var nP = el.Z, nN = el.A - el.Z;
  var rowsP = Math.ceil(nP / 5);
  var rowsN = Math.ceil(nN / 5);
  var gridW = 5 * step;
  var w = gridW;

  var titre = 'A = ' + el.A + (el.A > 1 ? ' nucléons' : ' nucléon');
  var fsF = Math.max(FRAME_FS_MIN, minDim * 0.028);
  _ctx.font = '700 ' + fsF + 'px monospace';
  while (fsF > FRAME_FS_MIN && _ctx.measureText(titre).width > gridW) {
    fsF -= 0.5;
    _ctx.font = '700 ' + fsF + 'px monospace';
  }
  var lineH = fsF * 1.55;

  var h = lineH;                          /* titre                 */
  var yP = h;                             /* haut grille protons   */
  h = yP + rowsP * step;
  var yN = 0;
  if (nN > 0) {
    yN = h + fsF * 0.6;                   /* haut grille neutrons  */
    h = yN + rowsN * step;
  }

  /* Écart avec le schéma : comme pour la box Propriétés, un écart fixe
     colle le cadre au cortège électronique sur grand écran (le schéma,
     limité par min(largeur, hauteur), laisse alors beaucoup de place à
     droite) — on étire donc l'écart avec une partie de cette place
     libre, plafonné. Le minimum garantit qu'il ne chevauche jamais les
     sous-couches, y compris pour les gros atomes (cadre plus haut). */
  var rightSpace = Math.max(0, _w - (cx + _schemaRmax) - w - 16);
  var gap = Math.min(90, Math.max(36, rightSpace * 0.3 + 36));
  var x0 = cx + _schemaRmax + gap;
  x0 = Math.min(x0, _w - w - 16);
  x0 = Math.max(x0, 16);
  var y0 = Math.max(12, _h / 2 - h / 2);
  return { x0: x0, y0: y0, w: w, h: h, step: step, fsF: fsF, rbF: rbF,
           lineH: lineH, yP: yP, yN: yN, nP: nP, nN: nN, titre: titre };
}

/* Centre du slot idx (lignes de 5) d'un groupe commençant à yTop */
function slotPos(g, idx, yTop) {
  return {
    x: g.x0 + (idx % 5) * g.step + g.step / 2,
    y: g.y0 + yTop + Math.floor(idx / 5) * g.step + g.step / 2
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
    if (!groups[sh.sub.n]) { groups[sh.sub.n] = { min: R, max: R, colors: [] }; order.push(sh.sub.n); }
    var grp = groups[sh.sub.n];
    grp.min = Math.min(grp.min, R);
    grp.max = Math.max(grp.max, R);
    grp.colors.push(sh.sub.color);
  });

  var pad = rStep * 0.32;
  _ctx.save();
  order.forEach(function (n) {
    var grp = groups[n];
    var inner = Math.max(0, grp.min - pad);
    var outer = grp.max + pad;
    var col = blendHexColors(grp.colors);
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

  var el = getElement(state.Z);
  var shells = getShellsAffichees();

  var cx = _w / 2, cy = _h / 2;
  var minDim = Math.min(_w, _h);
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
  var layout = getNucleusLayout(state.Z);
  var A = layout.pts.length;
  var RU = layout.radiusUnits;
  var rb = rStep * 0.075 * 1.25 * 1.5;
  rb *= Math.min(1, (rStep * 0.68) / (RU * rb));

  var anim = _nucAnim.running || state.eclate;

  /* Billes triées d'arrière en avant ; alpha réduit (fantôme) pour
     celles qui ont quitté le noyau. */
  var proj = layout.pts.map(function (p, i) {
    var q = projectPt(p);
    q.t = p.t; q.rank = p.rank; q.slot = p.slot; q.i = i;
    return q;
  });
  proj.sort(function (a, b) { return a.z - b.z; });
  proj.forEach(function (q) {
    var prog = anim ? nucProgress(q.rank, A) : 0;
    var scale = 1 + 0.22 * q.z / RU;                     /* effet perspective   */
    var shade = 0.5 * (1 - (q.z / RU + 1) / 2);          /* fond assombri       */
    drawNucleon(cx + q.x * rb, cy + q.y * rb, rb * scale, q.t,
                shade, prog > 0 ? 0.20 : 1);
  });

  /* ── Cercles des sous-couches + électrons + étiquettes ── */
  var shellRadii = computeShellRadii(rStep);
  drawShellHalos(cx, cy, shells, shellRadii, rStep);

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
        drawElectron(cx + R * Math.cos(a), cy + R * Math.sin(a), re);
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
  if (anim) drawVueEclatee(el, layout, cx, cy, rb, minDim);

  if (typeof positionPropsBox === 'function') positionPropsBox();
}

/* ─────────────────────────────────────────────────
   Vue éclatée — cadre, nucléons rangés, nucléons en vol.
   Dessinée APRÈS les sous-couches : le cadre et les billes
   en vol passent devant les cercles.
───────────────────────────────────────────────── */
function drawVueEclatee(el, layout, cx, cy, rb, minDim) {
  var A = layout.pts.length;
  var g = getFrameGeom(el, rb, minDim, cx);

  /* Cadre */
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

  /* Titre — seule mention textuelle, les paquets de billes ci-dessous
     (protons puis neutrons) se passent d'étiquette Z/N. */
  _ctx.textAlign = 'left';
  _ctx.textBaseline = 'top';
  _ctx.font = '700 ' + g.fsF + 'px monospace';
  _ctx.fillStyle = '#2c3e50';
  _ctx.fillText(g.titre, g.x0, g.y0);

  /* Nucléons rangés / en vol (ordre de sortie pour un empilement propre) */
  var enVol = [];
  layout.pts.forEach(function (p, idx) {
    var prog = nucProgress(p.rank, A);
    if (prog <= 0) return;                        /* encore dans le noyau */
    var dest = slotPos(g, p.slot, p.t === 'p' ? g.yP : g.yN);
    if (prog >= 1) {
      drawNucleon(dest.x, dest.y, g.rbF, p.t, 0, 1);
      return;
    }
    /* Trajectoire courbe : Bézier quadratique passant au-dessus */
    var f = _freeze ? _freeze[idx] : projectPt(p);
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
