// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  fusee.js — Panneau du décollage, à droite du graphe
//  Dépend de sim.js et de courbe.js (il lit `geoCourbe`).
//
//  Tout l'enjeu tient en une ligne : le centre de masse M de la fusée est
//  posé à l'ordonnée écran que le GRAPHE donne à z(t). Les deux canevas
//  n'ont ni la même largeur ni la même origine, mais ils sont voisins :
//  on convertit par la différence de leurs rectangles à l'écran. L'élève
//  peut alors suivre à l'horizontale le point de la courbe jusqu'à la
//  fusée — c'est le geste que le mode cherche à provoquer.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// Repères verticaux DANS l'image, en fraction de sa hauteur totale.
// Ils ont été relevés sur le fichier : la fusée proprement dite occupe le
// haut de l'image, le jet de gaz le bas. Le centre de masse se place à
// mi-hauteur de la FUSÉE, pas de l'image — sinon il descendrait dans les
// flammes, qui ne sont pas de la matière embarquée.
var FUSEE_HAUT = 0.008;                              // pointe de la coiffe
var FUSEE_BAS  = 0.588;                              // sortie des tuyères
var FUSEE_CM   = (FUSEE_HAUT + FUSEE_BAS) / 2;       // centre de masse
var FUSEE_CORPS = FUSEE_BAS - FUSEE_HAUT;            // part utile de l'image

var IMG_FUSEE = new Image();
var _fuseePrete = false;
IMG_FUSEE.onload = function () { _fuseePrete = true; requestDraw(); };
// Le nom du fichier porte un accent : on l'encode plutôt que de compter
// sur la tolérance du serveur.
IMG_FUSEE.src = 'fus%C3%A9e.png';

var COUL_FUSEE = {
  ciel:   '#eef4fb',
  cielH:  '#dce8f6',
  sol:    '#c9b99a',
  solBas: '#a8987a',
  ligne:  '#2a8a50'
};

// ══════════════════════════════════════════════════════════════════════
//  Tracé
// ══════════════════════════════════════════════════════════════════════

function drawFusee() {
  var canvas = document.getElementById('canvas-fusee');
  if (!sizeCanvas(canvas)) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);

  var g = geoCourbe;
  if (!g) return;

  // ── Passage des ordonnées du graphe à celles de ce canevas ──
  //    Les deux canevas sont côte à côte dans la page : la translation
  //    verticale entre eux suffit, et elle se relit à chaque tracé (le
  //    splitter et le redimensionnement la font changer).
  var cv = document.getElementById('canvas-courbe');
  if (!cv) return;
  var dy = cv.getBoundingClientRect().top - canvas.getBoundingClientRect().top;
  function y(z) { return g.gy(z) + dy; }

  var ySol = y(0);

  // ── Ciel, puis sol : le sol est peint APRÈS la fusée (cf. plus bas) ──
  var grad = ctx.createLinearGradient(0, 0, 0, Math.max(1, ySol));
  grad.addColorStop(0, COUL_FUSEE.cielH);
  grad.addColorStop(1, COUL_FUSEE.ciel);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // ── La fusée ──
  //    z(0) = c est l'altitude du centre de masse quand la fusée est
  //    posée : c'est donc sa demi-hauteur. La fusée mesure 2c mètres, et
  //    l'image entière (flammes comprises) 2c / FUSEE_CORPS.
  var c = sim.params.c;
  // Pendant le vol la fusée suit l'horloge ; une fois posée la dernière
  // valeur, elle suit le point d'étude — déplacer M sur la courbe fait
  // remonter ou redescendre la fusée d'autant.
  var zM = fVal(fuseeAnimEnCours() ? sim.fuseeT : sim.t0);

  if (_fuseePrete && isFinite(zM) && c > 0) {
    var pxParUnite = Math.abs(g.gy(0) - g.gy(1));
    var hPx = (2 * c / FUSEE_CORPS) * pxParUnite;
    var wPx = hPx * (IMG_FUSEE.width / IMG_FUSEE.height);
    var yCM = y(zM);
    var xC = W / 2;
    // Un dessin démesuré (zoom fort) coûte cher pour rien : le canevas
    // découpe de toute façon ce qui déborde.
    if (hPx < 40000) {
      ctx.drawImage(IMG_FUSEE, xC - wPx / 2, yCM - FUSEE_CM * hPx, wPx, hPx);
    }
  }

  // ── Le sol, par-dessus ──
  //    Au repos, le bas de la fusée affleure exactement z = 0 : le jet de
  //    gaz, qui est sous elle dans l'image, se trouve enterré. La fusée a
  //    l'air posée, moteurs éteints — et les flammes sortent d'elles-mêmes
  //    dès que le décollage commence. Aucun cas particulier à écrire.
  if (ySol < H) {
    var gs = ctx.createLinearGradient(0, ySol, 0, H);
    gs.addColorStop(0, COUL_FUSEE.sol);
    gs.addColorStop(1, COUL_FUSEE.solBas);
    ctx.fillStyle = gs;
    ctx.fillRect(0, ySol, W, H - ySol);
    ctx.strokeStyle = '#8a7a5c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, ySol); ctx.lineTo(W, ySol);
    ctx.stroke();
  }

  // ── Le trait de lecture : l'altitude de M, à l'horizontale du graphe ──
  if (isFinite(zM)) {
    var s = g.s;
    var yM = y(zM);
    if (yM > -20 && yM < H + 20) {
      ctx.save();
      ctx.strokeStyle = COUL_FUSEE.ligne;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.8 * s;
      ctx.setLineDash([6 * s, 4 * s]);
      ctx.beginPath();
      ctx.moveTo(0, yM); ctx.lineTo(W, yM);
      ctx.stroke();
      ctx.restore();
      texteCartouche(ctx, 'M', 11 * s, yM - 11 * s, COUL.pointM,
                     '700 ' + Math.round(15 * s) + 'px "Segoe UI", Arial, sans-serif');
    }
  }
}
