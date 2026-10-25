// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  becher.js — Onglet Oxydoréduction : scène macroscopique
//  Dépend de sim.js.
//  Disposition du canvas (bécher à gauche, loupe à droite), lame métallique
//  déplaçable à la souris, couleur de la solution, dépôt et usure de la
//  lame. L'avancement macroscopique tend vers 1 puis se stabilise ; la
//  loupe (loupe.js) montre en continu le mécanisme à l'échelle des ions.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ══════════════════════════════════════════════════════════════════════
//  Géométrie de la scène, en unités logiques
//  La scène macroscopique est dessinée dans un repère fixe de 100 × 102
//  unités, mis à l'échelle de la zone disponible : toutes les cotes
//  ci-dessous restent valables à toute taille de fenêtre.
//  Contrainte : la lame levée juste au-dessus du bord du bécher (HAUT_YB)
//  doit rester entière dans le cadre, étiquette comprise.
// ══════════════════════════════════════════════════════════════════════

var SCENE_W = 100, SCENE_H = 102;

var TABLE_Y   = 90;                // plan de travail
var BECHER_CX = 64, BECHER_W = 34, BECHER_H = 36;
var BECHER_L  = BECHER_CX - BECHER_W / 2;
var BECHER_R  = BECHER_CX + BECHER_W / 2;
var BECHER_TOP = TABLE_Y - BECHER_H;
var SOL_TOP   = 62;                // surface libre de la solution

var LAME_W = 5, LAME_H = 40;       // lame (vue de face)
var REPOS_X = 22, REPOS_YB = 88;   // lame posée dans son support
var SLOT_X  = 58, IMM_YB = 86;     // lame plongée (bas de la lame)
var HAUT_YB = 52;                  // passage au-dessus du bord du bécher

// Point visé par la loupe : face droite de la lame plongée, mi-profondeur
var LOUPE_PX = SLOT_X + LAME_W / 2, LOUPE_PY = 74;

// Constante de temps de l'avancement macroscopique (s de temps simulé)
var TAU_AVANCEMENT = 30;

// Vitesse de déplacement automatique de la lame (unités/s, temps réel)
var VITESSE_LAME = 70;

// ══════════════════════════════════════════════════════════════════════
//  Disposition du canvas (calculée à chaque redimensionnement)
// ══════════════════════════════════════════════════════════════════════

var disp = {
  W: 0, H: 0,
  mx: 0, my: 0, k: 1,          // repère de la scène : px = mx + k·x
  lx: 0, ly: 0, lr: 0          // loupe : centre et rayon (px)
};

function calculerDisposition(W, H) {
  disp.W = W; disp.H = H;
  var rx, ry, rw, rh;
  if (W >= 1.15 * H) {
    // Paysage : scène à gauche, loupe à droite
    rw = W * 0.5; rh = H; rx = 0; ry = 0;
    disp.lx = W * 0.5 + W * 0.25;
    disp.ly = H * 0.52;
    disp.lr = Math.min(W * 0.25, H * 0.5) * 0.84;
  } else {
    // Portrait : scène en haut, loupe en bas
    rw = W; rh = H * 0.5; rx = 0; ry = 0;
    disp.lx = W * 0.5;
    disp.ly = H * 0.76;
    disp.lr = Math.min(W * 0.5, H * 0.25) * 0.84;
  }
  disp.k  = Math.min(rw / SCENE_W, rh / SCENE_H) * 0.96;
  disp.mx = rx + (rw - SCENE_W * disp.k) / 2;
  disp.my = ry + (rh - SCENE_H * disp.k) / 2;
}

// Conversions repère logique ↔ pixels CSS
function sceneVersPx(x, y) { return { x: disp.mx + disp.k * x, y: disp.my + disp.k * y }; }
function pxVersScene(px, py) { return { x: (px - disp.mx) / disp.k, y: (py - disp.my) / disp.k }; }

// ══════════════════════════════════════════════════════════════════════
//  État de la scène
// ══════════════════════════════════════════════════════════════════════

var lame = {
  x: REPOS_X, yb: REPOS_YB,
  dansBecher: false,    // vrai entre l'entrée par le haut du bécher et la sortie
  cible: 'repos',       // 'repos' | 'becher' : destination du dernier geste
  chemin: null,         // déplacement automatique : liste de points {x, yb, entre}
  mouillee: 0           // hauteur (depuis le bas) déjà mouillée par la solution
};

var macro = {
  avancement: 0,        // 0 → 1 : avancement de la transformation
  motif: null           // taches et aiguilles du dépôt (tirées une fois par RAZ)
};

function resetBecher() {
  lame.x = REPOS_X; lame.yb = REPOS_YB;
  lame.dansBecher = false;
  lame.cible = 'repos';
  lame.chemin = null;
  lame.mouillee = 0;
  macro.avancement = 0;
  macro.motif = _tirerMotifDepot();
  _drag = null;
  _signalerEtatLame();
}

// Taches (dépôt spongieux ou poudreux) et aiguilles (cristaux d'argent, de
// plomb) : positions relatives à la zone mouillée, seuil d'apparition dans
// [0, 1] comparé à l'avancement.
function _tirerMotifDepot() {
  var alea = creerAlea(20261025);
  var taches = [], aiguilles = [];
  for (var i = 0; i < 90; i++) {
    taches.push({
      u: alea() * 1.16 - 0.08,       // un peu au-delà des bords : le dépôt déborde
      v: alea(),
      r: 0.35 + alea() * 0.75,
      seuil: alea() * 0.75,
      teinte: alea() * 0.3 - 0.15
    });
  }
  for (var j = 0; j < 26; j++) {
    var gauche = alea() < 0.5;
    aiguilles.push({
      gauche: gauche,
      v: 0.04 + alea() * 0.92,
      angle: (gauche ? Math.PI : 0) + (alea() - 0.5) * 1.6,
      long: 2.2 + alea() * 3.4,
      seuil: alea() * 0.6,
      branches: 1 + Math.floor(alea() * 3)
    });
  }
  return { taches: taches, aiguilles: aiguilles };
}

// ══════════════════════════════════════════════════════════════════════
//  Interrogations (utilisées par loupe.js et ui.js)
// ══════════════════════════════════════════════════════════════════════

// Fraction immergée de la hauteur de travail (0 hors bécher, 1 en place)
function fractionImmergee() {
  if (!lame.dansBecher) return 0;
  return Math.max(0, Math.min(1, (lame.yb - SOL_TOP) / (IMM_YB - SOL_TOP)));
}

// Position du bas de la lame vue dans la loupe, en rayons de loupe depuis
// le haut du cercle : 0 = bord haut, 2 = bord bas. Un grossissement fictif
// fait correspondre 3 unités de scène à un rayon de loupe, pour que la lame
// « descende » dans la loupe au lieu d'y apparaître d'un coup.
// Renvoie -1 si la lame n'est pas dans le bécher.
function basLameDansLoupe() {
  if (!lame.dansBecher) return -1;
  return Math.max(-1, Math.min(3, 1 + (lame.yb - LOUPE_PY) / 3));
}

// ══════════════════════════════════════════════════════════════════════
//  Déplacements automatiques (bouton Plonger / Retirer)
// ══════════════════════════════════════════════════════════════════════

function plongerLame() {
  if (lame.dansBecher) {
    lame.chemin = [{ x: SLOT_X, yb: IMM_YB }];
  } else {
    lame.chemin = [
      { x: lame.x,  yb: Math.min(lame.yb, HAUT_YB) },
      { x: SLOT_X,  yb: HAUT_YB },
      { x: SLOT_X,  yb: IMM_YB, entre: true }   // `entre` : franchit le bord du bécher
    ];
  }
  lame.cible = 'becher';
  _signalerEtatLame();
}

function retirerLame() {
  var ch = [];
  if (lame.dansBecher) ch.push({ x: SLOT_X, yb: HAUT_YB, sort: true });
  else ch.push({ x: lame.x, yb: Math.min(lame.yb, HAUT_YB) });
  ch.push({ x: REPOS_X, yb: HAUT_YB });
  ch.push({ x: REPOS_X, yb: REPOS_YB });
  lame.chemin = ch;
  lame.cible = 'repos';
  _signalerEtatLame();
}

// Prévient ui.js (libellé du bouton Plonger / Retirer)
function _signalerEtatLame() {
  if (typeof majBoutonPlonger === 'function') majBoutonPlonger();
}

// ══════════════════════════════════════════════════════════════════════
//  Mise à jour
//  dtSim  : temps simulé (s), nul en pause — fait avancer la transformation.
//  dtReel : temps réel (s) — la lame suit la main même en pause.
// ══════════════════════════════════════════════════════════════════════

function majBecher(dtSim, dtReel) {
  // ── Déplacement automatique de la lame ──
  if (lame.chemin && !_drag) {
    var reste = VITESSE_LAME * dtReel;
    while (reste > 0 && lame.chemin.length) {
      var pt = lame.chemin[0];
      if (pt.entre && !lame.dansBecher && lame.x === pt.x) lame.dansBecher = true;
      var dx = pt.x - lame.x, dy = pt.yb - lame.yb;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d <= reste) {
        lame.x = pt.x; lame.yb = pt.yb; reste -= d;
        if (pt.sort) lame.dansBecher = false;
        lame.chemin.shift();
      } else {
        lame.x += dx / d * reste; lame.yb += dy / d * reste; reste = 0;
      }
    }
    if (!lame.chemin.length) lame.chemin = null;
    sim.needsRedraw = true;
  }

  // ── Zone mouillée (le dépôt ne se forme que là) ──
  if (lame.dansBecher) {
    lame.mouillee = Math.max(lame.mouillee, lame.yb - SOL_TOP);
  }

  // ── Avancement : tend vers 1 et se stabilise (cf. choix de l'utilisateur) ──
  if (dtSim > 0 && reactionPossible(sim.metal, sim.solution)) {
    var f = fractionImmergee();
    if (f > 0) {
      macro.avancement += (1 - macro.avancement) * (1 - Math.exp(-dtSim * f / TAU_AVANCEMENT));
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Couleur de la solution
//  L'oxydant disparaît (1 − avancement) ; les ions du métal apparaissent
//  dans le rapport des coefficients stœchiométriques (Cu + 2 Ag⁺ : la
//  solution devient bleue, mais moitié moins concentrée en Cu²⁺ qu'elle ne
//  l'était en Ag⁺).
// ══════════════════════════════════════════════════════════════════════

var _EAU = [206, 226, 240];

function couleurSolution() {
  var c = _EAU.slice(), intensite = 0;
  var p = macro.avancement;
  var especes = [{ sym: sim.solution, conc: 1 - p }];
  if (reactionPossible(sim.metal, sim.solution)) {
    var st = stoechiometrie(sim.metal, sim.solution);
    especes.push({ sym: sim.metal, conc: p * st.coefMetal / st.coefIon });
  }
  for (var i = 0; i < especes.length; i++) {
    var col = METAUX[especes[i].sym].solution;
    if (!col || especes[i].conc <= 0) continue;
    var t = Math.min(1, especes[i].conc * 0.8);
    c = melange(c, couleurRGB(col), t);
    intensite = Math.max(intensite, t);
  }
  return { rgb: c, alpha: 0.42 + 0.33 * intensite };
}

// ══════════════════════════════════════════════════════════════════════
//  Rendu
// ══════════════════════════════════════════════════════════════════════

function dessinerBecher(ctx) {
  ctx.save();
  ctx.translate(disp.mx, disp.my);
  ctx.scale(disp.k, disp.k);
  ctx.lineJoin = 'round';

  _dessinerTable(ctx);
  _dessinerSupport(ctx);

  // Fond du bécher (verre), puis la lame, puis la solution semi-transparente
  // par-dessus : la partie immergée de la lame paraît vue à travers le liquide.
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(BECHER_L, BECHER_TOP, BECHER_W, BECHER_H);

  _dessinerLame(ctx);
  _dessinerSolution(ctx);
  _dessinerVerre(ctx);
  _dessinerEtiquettes(ctx);

  ctx.restore();
}

function _dessinerTable(ctx) {
  ctx.fillStyle = '#e6dccb';
  ctx.fillRect(0, TABLE_Y, SCENE_W, 3.2);
  ctx.strokeStyle = '#b0a898';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(0, TABLE_Y); ctx.lineTo(SCENE_W, TABLE_Y);
  ctx.stroke();
}

// Socle en bois dans lequel la lame est posée au repos
function _dessinerSupport(ctx) {
  var w = 12, h = 3.4;
  ctx.fillStyle = '#c9a77c';
  ctx.strokeStyle = '#8a6a44';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.rect(REPOS_X - w / 2, TABLE_Y - h, w, h);
  ctx.fill(); ctx.stroke();
  // Fente
  ctx.fillStyle = '#6a4e30';
  ctx.fillRect(REPOS_X - LAME_W / 2 - 0.4, TABLE_Y - h, LAME_W + 0.8, 0.8);
}

function _dessinerSolution(ctx) {
  var sol = couleurSolution();
  var ep = 0.6;                         // épaisseur du verre
  ctx.fillStyle = rgbCss(sol.rgb, sol.alpha);
  ctx.fillRect(BECHER_L + ep, SOL_TOP, BECHER_W - 2 * ep, TABLE_Y - ep - SOL_TOP);
  // Surface libre
  ctx.strokeStyle = rgbCss(nuance(sol.rgb, -0.25), 0.8);
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(BECHER_L + ep, SOL_TOP); ctx.lineTo(BECHER_R - ep, SOL_TOP);
  ctx.stroke();
}

function _dessinerVerre(ctx) {
  ctx.strokeStyle = '#6f7f8c';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  // Bord à bec verseur à gauche
  ctx.moveTo(BECHER_L - 1.6, BECHER_TOP - 0.8);
  ctx.quadraticCurveTo(BECHER_L, BECHER_TOP, BECHER_L, BECHER_TOP + 2);
  ctx.lineTo(BECHER_L, TABLE_Y - 1);
  ctx.quadraticCurveTo(BECHER_L, TABLE_Y, BECHER_L + 1, TABLE_Y);
  ctx.lineTo(BECHER_R - 1, TABLE_Y);
  ctx.quadraticCurveTo(BECHER_R, TABLE_Y, BECHER_R, TABLE_Y - 1);
  ctx.lineTo(BECHER_R, BECHER_TOP);
  ctx.stroke();
  // Reflet
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(BECHER_R - 2.2, BECHER_TOP + 4);
  ctx.lineTo(BECHER_R - 2.2, TABLE_Y - 6);
  ctx.stroke();
  // Graduations
  ctx.strokeStyle = 'rgba(111,127,140,0.7)';
  ctx.lineWidth = 0.25;
  for (var i = 1; i <= 4; i++) {
    var y = TABLE_Y - i * 7.5;
    ctx.beginPath();
    ctx.moveTo(BECHER_L + 1, y); ctx.lineTo(BECHER_L + (i % 2 ? 3 : 4.5), y);
    ctx.stroke();
  }
}

// ── Lame métallique ───────────────────────────────────────────────────
function _dessinerLame(ctx) {
  var M = METAUX[sim.metal];
  var base = couleurRGB(M.atome);
  var x0 = lame.x - LAME_W / 2;
  var top = lame.yb - LAME_H;
  var reagit = reactionPossible(sim.metal, sim.solution);
  var p = reagit ? macro.avancement : 0;
  var hMouillee = Math.min(lame.mouillee, LAME_H - 6);
  var yMouillee = lame.yb - hMouillee;

  // Partie sèche : reflet métallique vertical
  ctx.fillStyle = _degradeMetal(ctx, x0, LAME_W, base, 0);
  ctx.fillRect(x0, top, LAME_W, LAME_H - hMouillee);

  // Partie mouillée : rongée (plus étroite) et ternie à mesure que le
  // métal s'oxyde. Bas légèrement arrondi par l'attaque.
  if (hMouillee > 0) {
    var ins = LAME_W * 0.12 * p;
    ctx.fillStyle = _degradeMetal(ctx, x0, LAME_W, base, -0.22 * p);
    ctx.beginPath();
    ctx.moveTo(x0 + ins, yMouillee);
    ctx.lineTo(x0 + LAME_W - ins, yMouillee);
    ctx.lineTo(x0 + LAME_W - ins, lame.yb - ins);
    ctx.quadraticCurveTo(x0 + LAME_W - ins, lame.yb, x0 + LAME_W - 2 * ins, lame.yb);
    ctx.lineTo(x0 + 2 * ins, lame.yb);
    ctx.quadraticCurveTo(x0 + ins, lame.yb, x0 + ins, lame.yb - ins);
    ctx.closePath();
    ctx.fill();
  }

  // Contour
  ctx.strokeStyle = rgbCss(nuance(base, -0.45));
  ctx.lineWidth = 0.25;
  ctx.strokeRect(x0, top, LAME_W, LAME_H - hMouillee);

  if (hMouillee > 0 && p > 0) _dessinerDepot(ctx, x0, yMouillee, hMouillee, p);

  // Pince (prise en main) en haut de la lame
  ctx.fillStyle = '#4a525c';
  ctx.strokeStyle = '#2c3238';
  ctx.lineWidth = 0.25;
  ctx.beginPath();
  ctx.rect(lame.x - LAME_W / 2 - 0.7, top - 1.2, LAME_W + 1.4, 4.2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#8a929c';
  ctx.fillRect(lame.x - LAME_W / 2 - 0.2, top - 0.6, LAME_W + 0.4, 0.7);
}

function _degradeMetal(ctx, x0, w, base, assomb) {
  var c = nuance(base, assomb);
  var g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
  g.addColorStop(0,    rgbCss(nuance(c, -0.18)));
  g.addColorStop(0.35, rgbCss(nuance(c, 0.35)));
  g.addColorStop(0.6,  rgbCss(c));
  g.addColorStop(1,    rgbCss(nuance(c, -0.25)));
  return g;
}

// ── Dépôt du métal formé (celui des ions de la solution) ──────────────
function _dessinerDepot(ctx, x0, yHaut, h, p) {
  var D = METAUX[sim.solution];
  var col = couleurRGB(D.atome);
  var motif = macro.motif;
  var i, t;

  // Teinte du dépôt : poudre plus sombre que le métal massif (le cuivre
  // déposé est rouge-brun, le fer noir…)
  var foncee = D.depot === 'eponge' ? nuance([150, 72, 36], 0)
             : D.depot === 'noir'   ? nuance(col, -0.5)
             : nuance(col, -0.28);

  for (i = 0; i < motif.taches.length; i++) {
    t = motif.taches[i];
    var a = (p - t.seuil) / 0.25;
    if (a <= 0) continue;
    a = Math.min(1, a);
    var r = t.r * (0.5 + 0.5 * a) * (D.depot === 'aiguilles' ? 0.7 : 1);
    var x = x0 + t.u * LAME_W;
    var y = yHaut + 0.6 + t.v * (h - 1.2);
    ctx.fillStyle = rgbCss(nuance(foncee, t.teinte), 0.9 * a);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cristaux en aiguilles (« arbre de Diane » pour l'argent, « arbre de
  // Saturne » pour le plomb) qui poussent depuis les bords de la lame
  if (D.depot === 'aiguilles') {
    ctx.strokeStyle = rgbCss(D.sym === 'Ag' ? nuance(col, -0.1) : nuance(col, -0.15));
    ctx.lineCap = 'round';
    for (i = 0; i < motif.aiguilles.length; i++) {
      t = motif.aiguilles[i];
      var g = (p - t.seuil) / (1 - t.seuil);
      if (g <= 0) continue;
      var L = t.long * g;
      var xa = t.gauche ? x0 : x0 + LAME_W;
      var ya = yHaut + t.v * h;
      var xb = xa + Math.cos(t.angle) * L, yb = ya + Math.sin(t.angle) * L;
      ctx.lineWidth = 0.32;
      ctx.beginPath();
      ctx.moveTo(xa, ya); ctx.lineTo(xb, yb);
      ctx.stroke();
      // Ramifications
      ctx.lineWidth = 0.22;
      for (var b = 1; b <= t.branches; b++) {
        var f = b / (t.branches + 1);
        var xm = xa + (xb - xa) * f, ym = ya + (yb - ya) * f;
        var ang = t.angle + (b % 2 ? 0.7 : -0.7);
        var lb = L * 0.35 * (1 - f * 0.5);
        ctx.beginPath();
        ctx.moveTo(xm, ym);
        ctx.lineTo(xm + Math.cos(ang) * lb, ym + Math.sin(ang) * lb);
        ctx.stroke();
      }
    }
  }
}

// ── Étiquettes ────────────────────────────────────────────────────────
function _dessinerEtiquettes(ctx) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#2c3e50';
  // Lame : étiquette au-dessus de la pince, elle suit la lame
  texteEchelle(ctx, 'Lame ' + METAUX[sim.metal].de, lame.x, lame.yb - LAME_H - 2.4, 3.1, '600', disp.k);

  // Solution : sous le bécher
  var S = METAUX[sim.solution];
  texteEchelle(ctx, 'Solution de ' + S.nomSolution, BECHER_CX, TABLE_Y + 6.8, 3.1, '600', disp.k);
  ctx.fillStyle = '#7a8a96';
  texteEchelle(ctx, '(' + ionTexte(S.sym) + ' + ' + anionTexte(S.anion) + ')',
               BECHER_CX, TABLE_Y + 10.2, 2.7, '400', disp.k);
}

// ══════════════════════════════════════════════════════════════════════
//  Glisser-déposer de la lame
//  La lame ne traverse pas les parois du bécher : elle n'y entre que par
//  le haut, où elle est alors guidée verticalement à sa place.
// ══════════════════════════════════════════════════════════════════════

var _drag = null;   // { dx, dy, x0, y0, bouge }

function _surLame(x, y) {
  var m = 1.2;
  return x >= lame.x - LAME_W / 2 - m && x <= lame.x + LAME_W / 2 + m &&
         y >= lame.yb - LAME_H - 1.5 - m && y <= lame.yb + m;
}

// Renvoient true si l'événement concerne la lame
function becherPointerDown(px, py) {
  var p = pxVersScene(px, py);
  if (!_surLame(p.x, p.y)) return false;
  lame.chemin = null;
  _drag = { dx: p.x - lame.x, dy: p.y - lame.yb, x0: p.x, y0: p.y, bouge: false };
  return true;
}

function becherPointerMove(px, py) {
  var p = pxVersScene(px, py);
  if (!_drag) return _surLame(p.x, p.y);
  if (Math.abs(p.x - _drag.x0) + Math.abs(p.y - _drag.y0) > 0.8) _drag.bouge = true;
  if (!_drag.bouge) return true;

  var x  = Math.max(LAME_W / 2 + 1, Math.min(SCENE_W - LAME_W / 2 - 1, p.x - _drag.dx));
  var yb = Math.max(LAME_H + 6, Math.min(REPOS_YB, p.y - _drag.dy));

  var ouverture = Math.abs(x - SLOT_X) < BECHER_W * 0.42;
  if (lame.dansBecher) {
    if (yb <= BECHER_TOP - 0.5) {
      lame.dansBecher = false;                  // ressortie par le haut
    } else {
      x = SLOT_X;
      yb = Math.min(yb, IMM_YB);
    }
  } else {
    var auDessus = x + LAME_W / 2 > BECHER_L - 0.6 && x - LAME_W / 2 < BECHER_R + 0.6;
    if (auDessus && yb > BECHER_TOP - 0.5) {
      if (ouverture && lame.yb <= BECHER_TOP) {
        lame.dansBecher = true;                 // entrée par le haut
        x = SLOT_X;
        yb = Math.min(yb, IMM_YB);
      } else {
        yb = BECHER_TOP - 0.5;                  // bloquée par le bord
      }
    }
  }
  lame.x = x; lame.yb = yb;
  sim.needsRedraw = true;
  return true;
}

function becherPointerUp() {
  if (!_drag) return false;
  var clic = !_drag.bouge;
  _drag = null;
  if (clic) {
    // Simple clic sur la lame : même effet que le bouton
    if (lame.cible === 'becher') retirerLame(); else plongerLame();
  } else if (lame.dansBecher) {
    plongerLame();              // lâchée dans le bécher : descend à sa place
  } else {
    retirerLame();              // lâchée ailleurs : retourne dans son support
  }
  return true;
}

function becherEnGlissement() { return _drag !== null && _drag.bouge; }
