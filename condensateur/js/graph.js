// ═══════════════════════════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
//  graph.js — Graphes Uc(t)/q(t) et i(t) avec zoom/pan/réticule
//  Dépend de : sim.js (sim, setTimeWindow, autoTimeWindow)
// ═══════════════════════════════════════════════════════════════════════

// Position courante de la souris dans chaque canvas (null si hors zone)
const graphHover = { 'graph-Uc': null, 'graph-i': null };

// État du pan cliqué-glissé
const graphPan = { dragging: false, startX: 0, startOffset: 0 };

// Mode réticule libre
let graphCursorActive = false;

// Mode zoom (sélection rectangulaire)
let graphZoomMode = false;
let graphZoomRect = null;

// Historique de vues pour "Précédent"
const graphViewHistory = [];

// ─────────────────────────────────────────────────────────────────────
//  Sauvegarde la vue courante dans l'historique.
// ─────────────────────────────────────────────────────────────────────
function pushGraphView() {
  graphViewHistory.push({ windowMs: sim.graphWindowMs, offsetMs: sim.viewOffsetMs });
  document.getElementById('btn-graph-prev').disabled = false;
}

// ─────────────────────────────────────────────────────────────────────
//  Revenir à la vue précédente.
// ─────────────────────────────────────────────────────────────────────
function prevGraphView() {
  if (graphViewHistory.length === 0) return;
  const v = graphViewHistory.pop();
  sim.graphWindowMs = v.windowMs;
  sim.viewOffsetMs  = v.offsetMs;
  sim.userPanned    = true;
  document.getElementById('btn-graph-prev').disabled = graphViewHistory.length === 0;
}

// ─────────────────────────────────────────────────────────────────────
//  Bascule le mode zoom.
// ─────────────────────────────────────────────────────────────────────
function toggleGraphZoom() {
  graphZoomMode = !graphZoomMode;
  graphZoomRect = null;
  document.getElementById('btn-graph-zoom').classList.toggle('active', graphZoomMode);
}

// ─────────────────────────────────────────────────────────────────────
//  Bascule le mode réticule libre.
// ─────────────────────────────────────────────────────────────────────
function toggleGraphCursor() {
  graphCursorActive = !graphCursorActive;
  document.getElementById('btn-graph-cursor').classList.toggle('active', graphCursorActive);
  if (!graphCursorActive) {
    graphHover['graph-Uc'] = null;
    graphHover['graph-i']  = null;
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Change la grandeur affichée sur le graphe 1 ou 2 (Uc/i/q).
// ─────────────────────────────────────────────────────────────────────
function onGraphTabChange(slot, key) {
  if (slot === 1) sim.graphTab1 = key;
  else             sim.graphTab2 = key;
}

// ─────────────────────────────────────────────────────────────────────
//  Données + apparence du graphe pour une grandeur donnée ('Uc'|'i'|'q').
// ─────────────────────────────────────────────────────────────────────
//  Bornes et apparence seules, SANS construire la série de points : les
//  handlers souris n'ont besoin que de yMin/yMax (pour retrouver la marge
//  gauche), et recopier tout l'historique à chaque mousemove — ce que fait
//  la branche 'q' de graphDefFor — coûterait une allocation par événement.
function graphStyleFor(key) {
  const Imax = sim.U / Math.min(sim.R1, sim.R2) * 1000;
  if (key === 'i') {
    return { color: '#b04020', yMin: -Imax * 1.1, yMax: Imax * 1.1, unit: 'mA', name: 'i' };
  }
  if (key === 'q') {
    const C_uF = sim.C * 1e6;
    return { color: '#2a8a55', yMin: 0, yMax: Math.max(sim.U * C_uF, 0.001) * 1.05, unit: 'µC', name: 'q' };
  }
  // 'Uc' par défaut
  return { color: '#2a6aaa', yMin: 0, yMax: Math.max(sim.U, 0.1), unit: 'V', name: 'Uc' };
}

function graphDefFor(key) {
  const st = graphStyleFor(key);
  if (key === 'i') return { ...st, data: sim.graphI };
  if (key === 'q') {
    const C_uF = sim.C * 1e6;
    return { ...st, data: sim.graphUc.map(p => ({ t: p.t, v: p.v * C_uF })) };
  }
  return { ...st, data: sim.graphUc };
}

// ─────────────────────────────────────────────────────────────────────
//  Bascule entre les modes Synchronisé et Continu.
// ─────────────────────────────────────────────────────────────────────
function toggleGraphMode() {
  sim.graphMode = sim.graphMode === 'continuous' ? 'sync' : 'continuous';
  const btn = document.getElementById('btn-graph-mode');
  btn.textContent = sim.graphMode === 'sync' ? 'Mode : Synchronisé' : 'Mode : Continu';
  btn.classList.toggle('active', sim.graphMode === 'sync');
}

// ─────────────────────────────────────────────────────────────────────
//  Initialise les écouteurs souris sur les deux canvas.
// ─────────────────────────────────────────────────────────────────────
function initGraphHover() {
  ['graph-Uc', 'graph-i'].forEach(id => {
    const cv = document.getElementById(id);

    cv.addEventListener('mousemove', e => {
      const r  = cv.getBoundingClientRect();
      const mx = (e.clientX - r.left) * (cv.clientWidth  / r.width);
      const my = (e.clientY - r.top)  * (cv.clientHeight / r.height);

      graphHover[id] = { x: mx, y: my, free: graphCursorActive };

      if (graphZoomMode && graphZoomRect) {
        graphZoomRect.x1 = mx;
        graphZoomRect.y1 = my;
      }

      if (!graphZoomMode && graphPan.dragging) {
        const pad = graphPadsFor(id);
        const gw  = cv.clientWidth - pad.l - pad.r;
        const dx  = (e.clientX - graphPan.startX) * (cv.clientWidth / r.width);
        const dMs = -(dx / gw) * sim.graphWindowMs;
        const maxOffset = Math.max(0, sim.tTotal - sim.graphWindowMs);
        sim.viewOffsetMs = Math.max(0, Math.min(maxOffset, graphPan.startOffset + dMs));
        sim.userPanned   = true;
      }
    });

    cv.addEventListener('mouseleave', () => {
      graphHover[id] = null;
      if (graphPan.dragging) graphPan.dragging = false;
      if (graphZoomMode && graphZoomRect) graphZoomRect = null;
    });

    cv.addEventListener('mousedown', e => {
      if (graphZoomMode) {
        const r  = cv.getBoundingClientRect();
        const mx = (e.clientX - r.left) * (cv.clientWidth  / r.width);
        const my = (e.clientY - r.top)  * (cv.clientHeight / r.height);
        graphZoomRect = { x0: mx, y0: my, x1: mx, y1: my };
      } else {
        graphPan.dragging    = true;
        graphPan.startX      = e.clientX;
        graphPan.startOffset = sim.viewOffsetMs;
      }
      e.preventDefault();
    });

    cv.addEventListener('mouseup', e => {
      if (graphZoomMode && graphZoomRect) {
        const pad = graphPadsFor(id);
        const gw  = cv.clientWidth - pad.l - pad.r;
        const x0c = Math.min(graphZoomRect.x0, graphZoomRect.x1);
        const x1c = Math.max(graphZoomRect.x0, graphZoomRect.x1);
        if (x1c - x0c > 5) {
          const f0 = (x0c - pad.l) / gw;
          const f1 = (x1c - pad.l) / gw;
          const t0 = sim.viewOffsetMs + f0 * sim.graphWindowMs;
          const t1 = sim.viewOffsetMs + f1 * sim.graphWindowMs;
          pushGraphView();
          sim.viewOffsetMs  = Math.max(0, t0);
          sim.graphWindowMs = Math.max(minTimeWindowMs(), t1 - t0);
          sim.userPanned    = true;
        }
        graphZoomRect = null;
      } else {
        graphPan.dragging = false;
      }
    });

    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const r   = cv.getBoundingClientRect();
      const pad = graphPadsFor(id);
      const gw  = cv.clientWidth - pad.l - pad.r;
      const mx  = (e.clientX - r.left) * (cv.clientWidth / r.width);
      const frac = Math.max(0, Math.min(1, (mx - pad.l) / gw));
      const tUnderCursor = sim.viewOffsetMs + frac * sim.graphWindowMs;
      const factor = e.deltaY > 0 ? 1.25 : 0.8;
      const newWindow = Math.max(minTimeWindowMs(), sim.graphWindowMs * factor);
      // Déjà au cap de zoom : on sort sans rien empiler, sinon chaque cran de
      // molette supplémentaire ajoutait une vue identique à l'historique et il
      // fallait autant de clics sur « ← » pour en ressortir.
      if (newWindow === sim.graphWindowMs) return;
      const newOffset = tUnderCursor - frac * newWindow;
      const maxOffset = Math.max(0, sim.tTotal - newWindow);
      pushGraphView();
      sim.graphWindowMs = newWindow;
      sim.viewOffsetMs  = Math.max(0, Math.min(maxOffset, newOffset));
      sim.userPanned    = true;
    }, { passive: false });
  });
}

// ─────────────────────────────────────────────────────────────────────
//  Choisit un pas de graduation "joli" (1, 2, 5 × 10^n).
// ─────────────────────────────────────────────────────────────────────
function niceStep(range, targetN) {
  const raw  = range / targetN;
  const mag  = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return nice * mag;
}

// ─────────────────────────────────────────────────────────────────────
//  Formate une valeur d'axe Y.
// ─────────────────────────────────────────────────────────────────────
//  Un format est choisi UNE FOIS pour tout l'axe, à partir du pas et de la
//  plus grande graduation — et non valeur par valeur comme le faisait
//  fmtSig3(), qui pouvait porter « 500 » puis « 1,00×10³ » sur un même axe.
//  Deux conséquences : la lecture est homogène, et la largeur des étiquettes
//  devient prévisible (elle servait à estimer le nombre de graduations, que
//  l'écriture scientifique faisait s'effondrer à 2).
//
//  Les valeurs restent en écriture décimale tant qu'elles tiennent dans
//  [10⁻³, 10⁴[ — ce qui couvre tous les cadrages atteignables ici. Au-delà,
//  un facteur ×10ⁿ commun est sorti dans le titre de l'axe plutôt que répété
//  sur chaque graduation.
//
//  Le nombre de décimales est imposé par le PAS seul (des graduations
//  espacées de 0,5 s s'écrivent avec un chiffre après la virgule).
//
//  Il n'est volontairement pas plafonné à 3 chiffres significatifs : sur un
//  axe zoomé loin de l'origine, les graduations partagent leurs chiffres de
//  poids fort (50,00 s / 50,02 s / 50,04 s…) et un tel plafond les écrasait
//  toutes sur la même chaîne. Le pas venant de niceStep() — donc toujours de
//  la forme 1/2/5 × 10ⁿ — on retombe naturellement sur 3 chiffres
//  significatifs ou moins dès que l'axe part de zéro, c'est-à-dire dans tous
//  les cadrages courants.
function axisFormat(step, maxAbs) {
  let exp = 0;
  if (maxAbs >= 1e4 || (maxAbs > 0 && maxAbs < 1e-3)) {
    exp = Math.floor(Math.log10(maxAbs));
  }
  const scale = Math.pow(10, exp);

  const sStep = step / scale;
  const dec   = Math.max(0, Math.min(6, -Math.floor(Math.log10(sStep))));

  return {
    // Suffixe à insérer dans le titre de l'axe, devant l'unité
    suffix: exp === 0 ? '' : '×10' + toSuperscript(exp) + ' ',
    fmt(v) {
      let out = (v / scale).toFixed(dec);
      // toFixed(-0.0001) rend « -0,0 » : une graduation zéro affichée
      // négative sur l'axe de i(t) sauterait aux yeux.
      if (parseFloat(out) === 0) out = (0).toFixed(dec);
      return out.replace('.', ',');
    }
  };
}

// ─────────────────────────────────────────────────────────────────────
//  Unité UNIQUE de l'axe des temps, choisie pour toute la fenêtre.
//  fmtMs() décide ms ou s valeur par valeur : sur une fenêtre à cheval sur
//  1 s, l'axe affichait « 500 ms » puis « 1,00 s » — deux unités sur un même
//  axe, exactement ce qu'on interdit aux élèves. L'unité part donc dans le
//  titre de l'axe et les graduations ne portent plus que des nombres.
//  (fmtMs reste utilisé pour les étiquettes de survol, qui se lisent seules.)
// ─────────────────────────────────────────────────────────────────────
function graphTimeAxis(endMs) {
  return endMs < 1000 ? { div: 1, unit: 'ms' } : { div: 1000, unit: 's' };
}

// ─────────────────────────────────────────────────────────────────────
//  Taille de police du graphe, dérivée de la hauteur réelle du canvas
//  (cf. cinetique/js/graph.js et champ_uniforme/js/graph.js, où tout le
//  rendu se dimensionne ainsi).
//  Calibrage : la zone graphes vaut 2/5 de la colonne gauche, soit ~385 px
//  de haut sur un écran 1080p — 385 × 0,057 ≈ 22 px, la valeur qui était
//  écrite en dur. Le rendu au repos est donc inchangé ; il se réduit
//  seulement quand la place manque, au lieu de rogner le tracé.
// ─────────────────────────────────────────────────────────────────────
function graphFont(h) {
  return Math.max(11, Math.min(26, Math.round(h * 0.057)));
}

// ─────────────────────────────────────────────────────────────────────
//  Marges du repère pour un canvas donné — SOURCE UNIQUE, utilisée par le
//  rendu comme par les handlers souris (pan, molette, rectangle de zoom).
//  Chacun codait auparavant sa propre marge gauche (82, 82 et 52 px) alors
//  que le rendu la mesurait sur les labels : la fenêtre obtenue après un
//  zoom ne correspondait pas au rectangle tracé.
// ─────────────────────────────────────────────────────────────────────
function graphPads(cv, yMin, yMax) {
  const gc = cv.getContext('2d');
  const fs = graphFont(cv.clientHeight);
  gc.font = fs + 'px monospace';

  // Ligne réservée au titre d'axe, en plus de celle des graduations : les
  // deux ont besoin de leur propre bande sans se chevaucher (cf. la marge
  // `mlRaw + _gFontTitle + 8` de champ_uniforme).
  const titleGap = Math.round(fs * 1.15);
  const t = Math.round(fs * 0.5);
  const b = Math.round(fs * 2) + titleGap;

  // Nombre de graduations Y ajusté à la hauteur disponible : une étiquette
  // occupe fs en hauteur et il lui faut ~2,5 fs pour respirer. À nombre fixe,
  // elles se chevauchaient dès que le graphe devenait court.
  const gh       = Math.max(1, cv.clientHeight - t - b);
  const yTargetN = Math.max(2, Math.min(6, Math.floor(gh / (fs * 2.5))));

  // Pas et format sont renvoyés, pas seulement utilisés ici : drawGraph doit
  // tracer EXACTEMENT les graduations sur lesquelles la marge gauche a été
  // mesurée, et avec le même format.
  const yStep = niceStep(yMax - yMin, yTargetN);
  const yFmt  = axisFormat(yStep, Math.max(Math.abs(yMin), Math.abs(yMax)));

  const yFirst = Math.ceil(yMin / yStep) * yStep;
  let maxLabelW = 0;
  for (let v = yFirst; v <= yMax + yStep * 0.01; v += yStep) {
    const lw = gc.measureText(yFmt.fmt(v)).width;
    if (lw > maxLabelW) maxLabelW = lw;
  }

  return {
    fs, yStep, yFmt, t, b,
    r: Math.round(fs * 0.6),
    l: Math.ceil(maxLabelW) + Math.round(fs * 0.7) + titleGap
  };
}

// Idem, mais pour la grandeur actuellement affichée par ce canvas
// (#graph-Uc = emplacement 1, #graph-i = emplacement 2).
function graphPadsFor(canvasId) {
  const cv = document.getElementById(canvasId);
  const st = graphStyleFor(canvasId === 'graph-Uc' ? sim.graphTab1 : sim.graphTab2);
  return graphPads(cv, st.yMin, st.yMax);
}

// ─────────────────────────────────────────────────────────────────────
//  Dessine un graphe sur le canvas identifié par canvasId.
// ─────────────────────────────────────────────────────────────────────
function drawGraph(canvasId, data, color, yMin, yMax, yUnit, yName) {
  const cv  = document.getElementById(canvasId);
  const gc  = cv.getContext('2d');
  const w   = cv.clientWidth, h = cv.clientHeight;

  // Marges et police : mêmes valeurs que celles vues par les handlers souris
  const pad = graphPads(cv, yMin, yMax);
  const fs  = pad.fs;

  const gw  = w - pad.l - pad.r;
  const gh  = h - pad.t - pad.b;

  gc.clearRect(0, 0, w, h);
  gc.fillStyle = '#ffffff';
  gc.fillRect(0, 0, w, h);

  // Zone de tracé trop petite pour rien afficher de lisible : on s'arrête
  // au fond blanc plutôt que de dessiner une grille à coordonnées négatives.
  if (gw <= 10 || gh <= 10) return;

  const winMs  = sim.graphWindowMs;
  const startT = sim.viewOffsetMs;
  const endT   = startT + winMs;

  // ── Grille et graduations X (temps) ──
  const tAxis = graphTimeAxis(endT);
  gc.font     = fs + 'px monospace';

  // Nombre de graduations X ajusté à la largeur réelle des étiquettes.
  // Dépendance circulaire : la largeur dépend du format, qui dépend du pas,
  // qui dépend du nombre de graduations que cette largeur autorise. Deux
  // passes suffisent — on part du maximum et on redescend si ça ne tient pas.
  let xN = 6, xStep, xFmt;
  for (let pass = 0; pass < 2; pass++) {
    xStep = niceStep(winMs, xN);
    xFmt  = axisFormat(xStep / tAxis.div, Math.max(Math.abs(startT), Math.abs(endT)) / tAxis.div);

    let wMax = 0;
    for (let t = Math.ceil(startT / xStep) * xStep; t <= endT + xStep * 0.01; t += xStep) {
      const lw = gc.measureText(xFmt.fmt(t / tAxis.div)).width;
      if (lw > wMax) wMax = lw;
    }
    // 1,5 largeur d'étiquette par graduation : les étiquettes sont centrées
    // sur leur graduation, il faut de quoi séparer deux voisines.
    const fit = Math.max(2, Math.min(6, Math.floor(gw / (wMax * 1.5))));
    if (fit === xN) break;
    xN = fit;
  }

  const xFirst = Math.ceil(startT / xStep) * xStep;
  gc.strokeStyle  = '#e0dcd6';
  gc.lineWidth    = 1;
  gc.fillStyle    = '#7a8a96';
  gc.textAlign    = 'center';
  gc.textBaseline = 'top';
  for (let t = xFirst; t <= endT + xStep * 0.01; t += xStep) {
    const x = pad.l + ((t - startT) / winMs) * gw;
    if (x < pad.l - 1 || x > pad.l + gw + 1) continue;
    gc.beginPath(); gc.moveTo(x, pad.t); gc.lineTo(x, pad.t + gh); gc.stroke();
    // Filet de sécurité : une graduation quasiment sur un bord (après un
    // zoom molette, par exemple) verrait son étiquette centrée déborder du
    // canvas et se faire couper. Le trait reste à sa position exacte, seul
    // le texte est recadré — de quelques pixels tout au plus.
    const lbl  = xFmt.fmt(t / tAxis.div);
    const half = gc.measureText(lbl).width / 2;
    gc.fillText(lbl, Math.max(half + 1, Math.min(w - half - 1, x)), pad.t + gh + fs * 0.2);
  }

  // ── Grille et graduations Y ──
  // Pas repris de graphPads : c'est sur ces graduations-là qu'a été mesurée
  // la marge gauche.
  const yStep  = pad.yStep;
  const yFirst = Math.ceil(yMin / yStep) * yStep;
  gc.textAlign    = 'right';
  gc.textBaseline = 'middle';
  for (let v = yFirst; v <= yMax + yStep * 0.01; v += yStep) {
    const y = pad.t + gh - ((v - yMin) / (yMax - yMin)) * gh;
    if (y < pad.t - 1 || y > pad.t + gh + 1) continue;
    // Le zéro est appuyé : sur i(t), qui change de signe entre charge et
    // décharge, c'est LA ligne de lecture — sans elle rien ne distingue
    // l'axe du courant nul d'une graduation quelconque.
    const isZero = Math.abs(v) < yStep * 1e-6;
    gc.strokeStyle = isZero ? 'rgba(44, 62, 80, 0.38)' : '#e0dcd6';
    gc.lineWidth   = isZero ? 1.4 : 1;
    gc.beginPath(); gc.moveTo(pad.l, y); gc.lineTo(pad.l + gw, y); gc.stroke();
    gc.fillStyle = '#7a8a96';
    gc.fillText(pad.yFmt.fmt(v), pad.l - fs * 0.25, y);
  }

  // ── Axes ──
  gc.strokeStyle = '#2c3e50';
  gc.lineWidth   = 1.5;
  gc.beginPath();
  gc.moveTo(pad.l, pad.t);
  gc.lineTo(pad.l, pad.t + gh);
  gc.lineTo(pad.l + gw, pad.t + gh);
  gc.stroke();

  // ── Titres d'axes ──
  gc.fillStyle    = '#5a6a78';
  gc.font         = 'bold ' + Math.round(fs * 0.95) + 'px "Segoe UI", Arial, sans-serif';
  gc.textAlign    = 'center';
  gc.textBaseline = 'bottom';
  // Le facteur ×10ⁿ éventuel vit dans le titre, pas sur chaque graduation.
  gc.fillText('t (' + xFmt.suffix + tAxis.unit + ')', pad.l + gw / 2, h - fs * 0.25);
  gc.save();
  // Après rotate(-90°), l'axe +y du repère pointe vers la droite de l'écran :
  // une baseline 'top' fait donc occuper au texte la bande [tx, tx + fs],
  // qui tient dans le titleGap réservé par graphPads().
  gc.translate(fs * 0.15, pad.t + gh / 2);
  gc.rotate(-Math.PI / 2);
  gc.textBaseline = 'top';
  gc.fillText(yName + ' (' + pad.yFmt.suffix + (yUnit || '') + ')', 0, 0);
  gc.restore();

  if (data.length >= 2) {
    // ── Courbe ──
    gc.save();
    gc.strokeStyle = color;
    gc.lineWidth   = Math.max(2, fs * 0.13);
    gc.lineJoin    = 'round';
    gc.lineCap     = 'round';
    gc.beginPath();
    let first = true;
    for (const dp of data) {
      if (dp.t < startT || dp.t > endT) { first = true; continue; }
      const x  = pad.l + ((dp.t - startT) / winMs) * gw;
      const y  = pad.t + gh - ((dp.v - yMin) / (yMax - yMin)) * gh;
      const yc = Math.max(pad.t, Math.min(pad.t + gh, y));
      if (first) { gc.moveTo(x, yc); first = false; }
      else        { gc.lineTo(x, yc); }
    }
    gc.stroke();
    gc.restore();
  }

  // ── Rectangle de zoom en cours ──
  if (graphZoomMode && graphZoomRect && graphHover[canvasId]) {
    const zr = graphZoomRect;
    const x0 = Math.min(zr.x0, zr.x1);
    const x1 = Math.max(zr.x0, zr.x1);
    gc.save();
    gc.fillStyle   = 'rgba(42, 106, 170, 0.12)';
    gc.strokeStyle = '#2a6aaa';
    gc.lineWidth   = 1.5;
    gc.fillRect(x0, pad.t, x1 - x0, gh);
    gc.strokeRect(x0, pad.t, x1 - x0, gh);
    gc.restore();
  }

  // ── Hover ──
  const hover = graphHover[canvasId];
  if (hover) {
    if (hover.free) {
      // Réticule libre
      const hx = hover.x;
      const hy = hover.y;
      gc.save();
      gc.strokeStyle = 'rgba(42, 106, 170, 0.75)';
      gc.lineWidth   = 1;
      gc.setLineDash([4, 4]);
      gc.beginPath(); gc.moveTo(hx, pad.t); gc.lineTo(hx, pad.t + gh); gc.stroke();
      gc.beginPath(); gc.moveTo(pad.l, hy); gc.lineTo(pad.l + gw, hy); gc.stroke();
      gc.setLineDash([]);
      const mk = Math.max(2, fs * 0.14);
      gc.fillStyle = 'rgba(42, 106, 170, 0.9)';
      gc.fillRect(hx - mk, hy - mk, mk * 2, mk * 2);
      if (data.length >= 2) {
        const mouseT = startT + ((hx - pad.l) / gw) * winMs;
        const mouseV = yMin + (1 - (hy - pad.t) / gh) * (yMax - yMin);
        // Même résolution que les encarts du panneau : la pleine échelle est
        // ici l'étendue du cadrage vertical.
        const label  = `(${fmtMs(mouseT)}, ${fmtSig3(quantizeToScale(mouseV, yMax - yMin))} ${yUnit || ''})`;
        drawHoverPill(gc, label, hx, hy, '#2a6aaa', pad, gw, gh, fs);
      }
      gc.restore();
    } else if (data.length >= 2) {
      // Hover snappé
      const mouseT = startT + ((hover.x - pad.l) / gw) * winMs;
      let best = null, bestDist = Infinity;
      for (const dp of data) {
        if (dp.t < startT || dp.t > endT) continue;
        const d = Math.abs(dp.t - mouseT);
        if (d < bestDist) { bestDist = d; best = dp; }
      }
      if (best) {
        const bx  = pad.l + ((best.t - startT) / winMs) * gw;
        const by  = pad.t + gh - ((best.v - yMin) / (yMax - yMin)) * gh;
        const byc = Math.max(pad.t, Math.min(pad.t + gh, by));

        gc.save();
        gc.setLineDash([4, 4]);
        gc.strokeStyle = 'rgba(60, 60, 60, 0.55)';
        gc.lineWidth   = 1;
        gc.beginPath(); gc.moveTo(bx, byc); gc.lineTo(bx, pad.t + gh); gc.stroke();
        gc.beginPath(); gc.moveTo(bx, byc); gc.lineTo(pad.l, byc);     gc.stroke();
        gc.setLineDash([]);

        // Point de mesure cerclé de blanc : sans ce liseré il se confondait
        // avec la courbe, qui est de la même couleur.
        const rPt = Math.max(3, fs * 0.23);
        gc.fillStyle   = color;
        gc.beginPath(); gc.arc(bx, byc, rPt, 0, Math.PI * 2); gc.fill();
        gc.strokeStyle = '#fff';
        gc.lineWidth   = 1.5;
        gc.beginPath(); gc.arc(bx, byc, rPt, 0, Math.PI * 2); gc.stroke();

        const label = `(${fmtMs(best.t)}, ${fmtSig3(quantizeToScale(best.v, yMax - yMin))} ${yUnit || ''})`;
        drawHoverPill(gc, label, bx, byc, color, pad, gw, gh, fs);
        gc.restore();
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Étiquette de survol : cartouche arrondi blanc bordé de la couleur de la
//  courbe, placé près du point (ax, ay) sans jamais sortir du repère.
//  Le texte nu qui était tracé ici devenait illisible dès qu'il croisait la
//  grille ou la courbe (cf. le cartouche de cinetique/js/graph.js).
// ─────────────────────────────────────────────────────────────────────
function drawHoverPill(gc, label, ax, ay, color, pad, gw, gh, fs) {
  const ttFs = Math.round(fs * 0.95);
  gc.font = 'bold ' + ttFs + 'px "Segoe UI", Arial, sans-serif';

  const p2  = Math.round(fs * 0.3);
  const ttW = gc.measureText(label).width + p2 * 2;
  const ttH = ttFs + p2 * 2;
  const off = fs * 0.5;

  // À droite du point si la place y est, à gauche sinon ; puis recadrage
  // dur dans le repère pour les points collés à un bord.
  const spaceRight = pad.l + gw - (ax + off);
  let lx = spaceRight >= ttW ? ax + off : ax - off - ttW;
  lx = Math.max(pad.l, Math.min(pad.l + gw - ttW, lx));

  // Au-dessus du point par défaut, en dessous s'il touche le haut du repère.
  let ly = ay - off - ttH;
  if (ly < pad.t) ly = ay + off;
  ly = Math.max(pad.t, Math.min(pad.t + gh - ttH, ly));

  gc.fillStyle   = 'rgba(255, 255, 255, 0.93)';
  gc.strokeStyle = color;
  gc.lineWidth   = 1.5;
  gc.beginPath();
  if (gc.roundRect) gc.roundRect(lx, ly, ttW, ttH, 4);
  else              gc.rect(lx, ly, ttW, ttH);
  gc.fill();
  gc.stroke();

  gc.fillStyle    = '#1a2535';
  gc.textAlign    = 'left';
  gc.textBaseline = 'top';
  gc.fillText(label, lx + p2, ly + p2);
}
