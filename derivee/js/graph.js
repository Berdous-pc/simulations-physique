// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  graph.js — Graphe du bas : la fonction dérivée f′
//  Dépend de sim.js et courbe.js (repère commun).
//
//  Il partage exactement l'axe des abscisses du graphe principal, placé
//  juste au-dessus : une même abscisse tombe à la même position à
//  l'écran sur les deux graphes. On lit donc directement, à la verticale
//  du point M, la valeur de la pente de la tangente — c'est le passage
//  du « nombre dérivé en un point » à la « fonction dérivée ».
// ══════════════════════════════════════════════════════════════════════

'use strict';

function drawDeriv() {
  var canvas = document.getElementById('canvas-deriv');
  if (!sizeCanvas(canvas)) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);

  var F = fonCourante();
  var tMin = vueTMin(), tMax = vueTMax();

  // ── Cadrage vertical : balayage de f′ sur la plage visible, en
  //    englobant aussi le taux de variation courant (qui peut sortir de
  //    l'intervalle des valeurs de f′ quand Δt est grand). ──
  var dMin = Infinity, dMax = -Infinity, i, d;
  var N = 300;
  for (i = 0; i <= N; i++) {
    d = fDeriv(tMin + (tMax - tMin) * i / N);
    if (!isFinite(d)) continue;
    if (d < dMin) dMin = d;
    if (d > dMax) dMax = d;
  }
  var taux = tauxVariation();
  if (isFinite(taux)) { dMin = Math.min(dMin, taux); dMax = Math.max(dMax, taux); }
  if (!isFinite(dMin) || !isFinite(dMax)) { dMin = -1; dMax = 1; }
  if (dMax - dMin < 1e-9) { dMin -= 1; dMax += 1; }
  var marge = (dMax - dMin) * 0.14;

  var g = dessineRepere(ctx, W, H, {
    tMin: tMin, tMax: tMax,
    zMin: dMin - marge, zMax: dMax + marge,
    xLabel: titreAxe(F.varNom, F.varUnite),
    yLabel: titreAxe(labelDeriv(), F.derivUnite)
  });
  if (!g) return;
  var s = g.s;

  ctx.save();
  ctx.beginPath();
  ctx.rect(g.x0, g.padT, g.plotW, g.plotH);
  ctx.clip();

  // ── Courbe de la fonction dérivée ──
  ctx.strokeStyle = COUL.tangente;
  ctx.lineWidth = 2.4 * s;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  var trace = false;
  var NP = Math.max(200, Math.round(g.plotW));
  for (i = 0; i <= NP; i++) {
    var t = g.tMin + (g.tMax - g.tMin) * i / NP;
    d = fDeriv(t);
    if (!isFinite(d)) { trace = false; continue; }
    var py = Math.max(-1e4, Math.min(1e4, g.gy(d)));
    if (trace) ctx.lineTo(g.gx(t), py); else { ctx.moveTo(g.gx(t), py); trace = true; }
  }
  ctx.stroke();

  // ── Repère vertical à l'abscisse du point M ──
  ctx.strokeStyle = 'rgba(42,138,80,0.45)';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(g.gx(sim.t0), g.padT);
  ctx.lineTo(g.gx(sim.t0), g.y0);
  ctx.stroke();

  // ── Niveau du taux de variation courant (pente de la sécante) ──
  if (sim.dt > 0 && isFinite(taux)) {
    ctx.strokeStyle = COUL.secante;
    ctx.setLineDash([7 * s, 5 * s]);
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(g.x0, g.gy(taux));
    ctx.lineTo(g.x0 + g.plotW, g.gy(taux));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // ── Coordonnées du point courant sur la courbe dérivée ──
  //    Même lecture que sur le graphe du haut : on rabat sur les axes, ici
  //    l'abscisse du point M et la valeur du nombre dérivé. Hors du clip :
  //    les valeurs s'écrivent SUR les axes, donc parfois au bord du cadre.
  var dM = fDeriv(sim.t0);

  // ── Points : pente de la sécante (terracotta) et nombre dérivé (vert) ──
  if (sim.dt > 0 && isFinite(taux)) {
    pastille(ctx, g.gx(sim.t0), g.gy(taux), 6 * s, COUL.secante);
  }
  if (isFinite(dM)) {
    pastille(ctx, g.gx(sim.t0), g.gy(dM), 7 * s, COUL.tangente);
  }

  ctx.restore();

  if (sim.showCoords)
    dessineCoords(ctx, g, sim.t0, dM, COUL.tangente, F.varUnite, F.derivUnite);
}
