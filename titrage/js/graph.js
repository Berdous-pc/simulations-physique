/* ══════════════════════════════════════════════════════════════════════════
   Simulation pédagogique — Physique-Chimie Lycée
   Auteur  : Mathieu Berdous
   Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   graph.js — Graphique quantités de matière vs volume versé (mode Titrage)
   Canvas 2D, pas de bibliothèque externe.
══════════════════════════════════════════════════════════════════════════ */

/* ── État ───────────────────────────────────────────────────────────────── */
let _chartPoints   = {};
let _chartVisible  = {};
let _chartEspeces  = [];
let _chartRxnEntry = null;
let _chartHover    = null;  // { mx, my } coords canvas device pixels

/* ── Utilitaires ────────────────────────────────────────────────────────── */

function _niceStep(range, targetN) {
  if (range <= 0) return 1;
  const raw  = range / targetN;
  const mag  = Math.pow(10, Math.floor(Math.log10(raw)));
  const frac = raw / mag;
  let   step = frac < 1.5 ? 1 : frac < 3.5 ? 2 : frac < 7.5 ? 5 : 10;
  return step * mag;
}

/**
 * Calcule le facteur d'échelle de l'axe Y (ex: 1e-3 → afficher "×10⁻³ mol").
 * Renvoie { scale, label } où toutes les valeurs sont divisées par scale avant affichage.
 */
function _yScale(yMax) {
  if (yMax <= 0) return { scale: 1, label: 'mol' };
  const exp = Math.floor(Math.log10(yMax));
  // On choisit l'exposant de la décade juste en dessous de yMax
  // ex: yMax=0.004 → exp=-3 → scale=1e-3, label="×10⁻³ mol"
  if (exp >= 0)  return { scale: 1,    label: 'mol' };
  const sup = ['\u2070','\u00b9','\u00b2','\u00b3','\u2074','\u2075','\u2076','\u2077','\u2078','\u2079'];
  const absExp = Math.abs(exp);
  const expStr = '\u207b' + (absExp < 10 ? sup[absExp] : absExp.toString().split('').map(d=>sup[+d]).join(''));
  return { scale: Math.pow(10, exp), label: `\u00d710${expStr} mol` };
}

function _fmtY(v, scale) {
  const val = v / scale;
  if (val === 0) return '0';
  if (val >= 100) return val.toFixed(0);
  if (val >= 10)  return val.toFixed(1);
  if (val >= 1)   return val.toFixed(2);
  return val.toFixed(2);
}

/**
 * Convertit une couleur CSS (hex #rrggbb, #rgb, ou rgb()/rgba()) en
 * chaîne `rgba(r,g,b,alpha)` avec l'alpha fourni.
 */
function _hexToRgba(css, alpha) {
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return `rgba(${m[1]},${m[2]},${m[3]},${alpha})`;
  const hex = css.replace('#', '');
  let r, g, b;
  if (hex.length === 3) {
    r = parseInt(hex[0]+hex[0], 16);
    g = parseInt(hex[1]+hex[1], 16);
    b = parseInt(hex[2]+hex[2], 16);
  } else {
    r = parseInt(hex.slice(0,2), 16);
    g = parseInt(hex.slice(2,4), 16);
    b = parseInt(hex.slice(4,6), 16);
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Parse une couleur CSS → [r,g,b] (0-255). */

function _getRxnEntry() {
  if (state.titrageType === 'phmetrique') {
    const idx = state.titragePhRxnIdx || 0;
    return TITRAGE_PH_REACTIONS[idx] || TITRAGE_PH_REACTIONS[0] || null;
  }
  if (state.titrageType === 'conductimetrique') {
    const idx = state.titrageCondRxnIdx || 0;
    return TITRAGE_COND_REACTIONS[idx] || TITRAGE_COND_REACTIONS[0] || null;
  }
  const idx = state.titrageRxnModeIdx || 0;
  return TITRAGE_MODE_REACTIONS[idx] || TITRAGE_MODE_REACTIONS[0] || null;
}

/* ── Calcul ─────────────────────────────────────────────────────────────── */

function _calcPointAt(vVerse) {
  if (!_chartRxnEntry) return {};
  // Récupération des coefficients stœchiométriques :
  //  - mode colorimétrique : via TITRAGE_REACTIONS[rxnIdx]
  //  - mode pH-métrique    : à partir des espèces (1:1 pour HCl/NaOH, CH₃COOH/NaOH)
  let coeffTitre, coeffTitrant;
  if (_chartRxnEntry.rxnIdx != null) {
    const rxn    = TITRAGE_REACTIONS[_chartRxnEntry.rxnIdx];
    coeffTitre   = rxn.titre.coeff;
    coeffTitrant = rxn.titrant.coeff;
  } else {
    const eT = _chartEspeces.find(e => e.role === 'titree');
    const eB = _chartEspeces.find(e => e.role === 'titrante');
    coeffTitre   = eT ? eT.coeff : 1;
    coeffTitrant = eB ? eB.coeff : 1;
  }
  const nTitreeInit  = state.titrageConcTitree   * (state.titrageV1 / 1000);
  const nTitrantV    = state.titrageConcTitrante * (vVerse          / 1000);
  const xi           = Math.min(nTitrantV / coeffTitrant, nTitreeInit / coeffTitre);
  const result       = {};
  _chartEspeces.forEach(e => {
    if      (e.role === 'titree')     result[e.id] = Math.max(0, nTitreeInit - xi * e.coeff);
    else if (e.role === 'titrante')   result[e.id] = Math.max(0, nTitrantV   - xi * e.coeff);
    else if (e.role === 'produit' || e.role === 'precipite') result[e.id] = xi * e.coeff;
    else if (e.role === 'reactif') {
      // Réactif auxiliaire (ex: H⁺) : quantité initiale calée sur stœchio du titré
      const nInit = nTitreeInit * (e.coeff / coeffTitre);
      result[e.id] = Math.max(0, nInit - xi * e.coeff);
    }
    else if (e.role === 'spectateur') {
      // Apporté par le titrant (coeffTitrant) ou par la solution titrée initiale (coeffTitree)
      const nDuTitrant = e.coeffTitrant != null
        ? state.titrageConcTitrante * (vVerse / 1000) * e.coeffTitrant
        : 0;
      const nDuTitree = e.coeffTitree != null
        ? nTitreeInit * e.coeffTitree
        : 0;
      result[e.id] = nDuTitrant + nDuTitree;
    }
    else result[e.id] = 0;
  });
  return result;
}

/* ── Données ────────────────────────────────────────────────────────────── */

function initChartData() {
  _chartRxnEntry = _getRxnEntry();
  _chartEspeces  = _chartRxnEntry ? (_chartRxnEntry.especes || []) : [];
  _chartPoints   = {};
  // Réinitialiser _chartVisible pour la nouvelle réaction (ne pas hériter de l'ancienne)
  _chartVisible  = {};
  _chartEspeces.forEach(e => {
    _chartPoints[e.id] = [];
    _chartVisible[e.id] = (e.role !== 'spectateur');
  });
  _pushChartPoint(0);
  // Réinitialiser les points expérimentaux pH/σ (un point initial à V=0)
  if (typeof _resetExpPoints === 'function') _resetExpPoints();
}

function _pushChartPoint(vVerse) {
  const vals = _calcPointAt(vVerse);
  _chartEspeces.forEach(e => {
    if (_chartPoints[e.id]) _chartPoints[e.id].push({ x: vVerse, n: vals[e.id] ?? 0 });
  });
}

/** Version publique : pousse un point à un volume arbitraire (utilisée par le vidage auto). */
function _pushChartPointAt(vVerse) {
  _pushChartPoint(vVerse);
}

function pushChartPoint() {
  _pushChartPoint(state.titrageVverse);
  drawTitrageGraph();
  // Les graphes pH=f(V) et σ=f(V) sont échantillonnés à la volée à chaque
  // dessin (cf. _samplePhCurve / _sampleSigmaCurve), donc il suffit de redessiner.
  if (state.titrageType === 'phmetrique') {
    drawTitragePhGraph();
  } else if (state.titrageType === 'conductimetrique') {
    drawTitrageSigmaGraph();
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   GRAPHE σ = f(V) — mode conductimétrique
   Comme le graphe pH, la courbe n'est pas stockée : on échantillonne
   `calcSigmaAtVolume(v)` à chaque redraw sur [0, state.titrageVverse] avec
   une densité adaptative renforcée autour de l'équivalence (où la pente
   change brutalement).

   Particularité conductimétrique : la courbe est constituée de **deux
   segments quasi-linéaires** raccordés au point d'équivalence. Pas de
   "saut" comme en pH-métrique, mais un changement brusque de pente.

   Réutilise le même canvas que le graphe pH (#titrage-chart-ph) car
   les deux ne peuvent jamais coexister (modes mutuellement exclusifs).
══════════════════════════════════════════════════════════════════════════ */

function _sampleSigmaCurve(vMax) {
  if (vMax <= 0) return [{ v: 0, sigma: calcSigmaAtVolume(0) }];

  // Volume équivalent théorique (mL) — densifier autour pour bien capturer
  // le changement de pente, et au tout début (zone non-linéaire pour les
  // basses concentrations).
  const Ca = state.titrageConcTitree;
  const Cb = state.titrageConcTitrante;
  const V1 = state.titrageV1;
  const vEq = (Cb > 0) ? (Ca * V1 / Cb) : null;

  const dvBase = 25 / 400;        // ~16 points/mL hors zone fine
  const dvFine = dvBase / 20;     // grille fine
  const wFine  = Math.max(0.5, vMax * 0.05);

  const vols = new Set();
  vols.add(0);
  vols.add(vMax);
  for (let v = dvBase; v < vMax; v += dvBase) vols.add(+v.toFixed(6));
  if (vEq != null && vEq > 0 && vEq < vMax + wFine) {
    const lo = Math.max(0, vEq - wFine);
    const hi = Math.min(vMax, vEq + wFine);
    for (let v = lo; v <= hi + 1e-9; v += dvFine) vols.add(+v.toFixed(6));
  }
  const wStart = Math.min(vMax, Math.max(0.2, vMax * 0.02));
  for (let v = 0; v <= wStart + 1e-9; v += dvFine) vols.add(+v.toFixed(6));

  const sorted = Array.from(vols).filter(v => v >= 0 && v <= vMax).sort((a, b) => a - b);
  return sorted.map(v => ({ v, sigma: calcSigmaAtVolume(v) }));
}

/**
 * Calcule l'échelle "jolie" pour l'axe Y (graduations rondes).
 * Renvoie { step, max } où step est le pas et max ≥ ymax.
 */
function _niceYRange(yMax) {
  if (yMax <= 0) return { step: 1, max: 5 };
  const nTicks = 5;
  const step = _niceStep(yMax, nTicks);
  const max  = Math.ceil(yMax / step) * step;
  return { step, max };
}

function drawTitrageSigmaGraph() {
  const canvas = document.getElementById('titrage-chart-ph'); // canvas réutilisé
  if (!canvas) return;
  if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return;
  const ctx = canvas.getContext('2d');
  const W   = canvas.clientWidth;
  const H   = canvas.clientHeight;

  // ── Court-circuit : électrode non immergée ──
  if (typeof _electrodeImmergee === 'function' && !_electrodeImmergee()) {
    ctx.clearRect(0, 0, W, H);
    const dim = Math.min(W, H);
    const fsMsg = Math.max(12, Math.round(dim * 0.055));
    ctx.fillStyle    = '#666';
    ctx.font         = `600 ${fsMsg}px system-ui, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("L'électrode n'est pas dans la solution.", W / 2, H / 2);
    return;
  }

  // ── Plages ──
  const vVerse = state.titrageVverse ?? 0;
  let xMax = BURETTE.MAX_ML;
  if (vVerse > xMax) xMax = vVerse;
  xMax = Math.ceil(xMax / 5) * 5;

  // Échantillonnage de la courbe + détermination de yMax pour autoscale.
  // On échantillonne aussi sur toute la burette (pas seulement [0, vVerse])
  // pour que l'axe Y soit stable et ne saute pas à chaque mL versé.
  const pts = _sampleSigmaCurve(vVerse);
  // Pour stabiliser yMax, on prend le max de la courbe complète sur [0, xMax]
  // (sans la dessiner) au début, puis on agrandit si nécessaire avec les
  // points effectivement tracés. La conductivité étant monotone par morceaux,
  // le max sur [0, xMax] est atteint soit à 0, soit à xMax.
  const sigma0  = calcSigmaAtVolume(0);
  const sigmaXM = calcSigmaAtVolume(xMax);
  let yMaxRaw = Math.max(sigma0, sigmaXM, 0.01);
  pts.forEach(p => { if (p.sigma > yMaxRaw) yMaxRaw = p.sigma; });
  yMaxRaw *= 1.10;  // marge 10 % en haut
  const { step: yStep, max: yMax } = _niceYRange(yMaxRaw);
  const yMin = 0;

  // ── Tailles de police ──
  const dim = Math.min(W, H);
  const fs  = Math.max(9,  Math.round(dim * 0.040));
  const fst = Math.max(10, Math.round(dim * 0.044));

  const tickLabelW = Math.round(fs * 2.8);  // un peu plus large pour σ (décimales)
  const padL = tickLabelW + 4 + 7 + Math.round(fst * 0.3);
  const padR = padL;
  const padB = 4 + 6 + fs + 6 + fst + 4;
  const padT = 2 + fst + 2 + fs + 4;
  const pad  = { t: padT, r: padR, b: padB, l: padL };
  const gw = W - pad.l - pad.r;
  const gh = H - pad.t - pad.b;
  if (gw < 40 || gh < 40) return;

  // Stocker le layout pour les handlers souris (clic, drag, mousemove)
  _sigmaLayout = { pad, gw, gh, xMax, yMin, yMax, W, H };
  // Partager pad.l avec _updateGraphBtnsSize (même panel que pH)
  _phLayout = { pad, gw, gh, W, H };
  _updateGraphBtnsSize();

  const nTicksX = Math.max(3, Math.min(6, Math.round(gw / 80)));
  const xStep   = _niceStep(xMax, nTicksX);

  // ── Effacement + fond ──
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fdf8f0';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(pad.l, pad.t, gw, gh);

  // ── Grille ──
  ctx.save();
  ctx.strokeStyle = '#ece8e2';
  ctx.lineWidth   = 1;
  for (let x = xStep; x <= xMax + xStep * 0.01; x += xStep) {
    const px = pad.l + (x / xMax) * gw;
    ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, pad.t + gh); ctx.stroke();
  }
  for (let y = yStep; y <= yMax - 0.01; y += yStep) {
    const py = pad.t + gh - ((y - yMin) / (yMax - yMin)) * gh;
    ctx.beginPath(); ctx.moveTo(pad.l, py); ctx.lineTo(pad.l + gw, py); ctx.stroke();
  }
  ctx.restore();

  // ── Axes ──
  ctx.save();
  ctx.strokeStyle = '#2d3748';
  ctx.lineWidth   = 1.8;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, pad.t + gh);
  ctx.lineTo(pad.l + gw, pad.t + gh);
  ctx.stroke();
  ctx.restore();

  // ── Ticks + labels axe X ──
  ctx.save();
  ctx.fillStyle    = '#4a5568';
  ctx.font         = `${fs}px 'Segoe UI', Arial, sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.strokeStyle  = '#4a5568';
  ctx.lineWidth    = 1;
  for (let x = 0; x <= xMax + xStep * 0.01; x += xStep) {
    const px = pad.l + (x / xMax) * gw;
    ctx.beginPath(); ctx.moveTo(px, pad.t + gh); ctx.lineTo(px, pad.t + gh + 4); ctx.stroke();
    ctx.fillText(x % 1 === 0 ? x.toFixed(0) : x.toFixed(1), px, pad.t + gh + 6);
  }
  ctx.font      = `bold ${fst}px 'Segoe UI', Arial, sans-serif`;
  ctx.fillStyle = '#2d3748';
  const titleXY = pad.t + gh + 4 + 6 + fs + 6;
  ctx.fillText('V versé (mL)', pad.l + gw / 2, titleXY);
  ctx.restore();

  // ── Ticks + labels axe Y ──
  ctx.save();
  ctx.fillStyle    = '#4a5568';
  ctx.font         = `${fs}px 'Segoe UI', Arial, sans-serif`;
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle  = '#4a5568';
  ctx.lineWidth    = 1;
  // Format des labels Y : nombre de décimales adapté au pas
  const decY = yStep >= 1 ? 0 : yStep >= 0.1 ? 1 : 2;
  for (let y = 0; y <= yMax + 0.01; y += yStep) {
    const py = pad.t + gh - ((y - yMin) / (yMax - yMin)) * gh;
    ctx.beginPath(); ctx.moveTo(pad.l, py); ctx.lineTo(pad.l - 4, py); ctx.stroke();
    ctx.fillText(y.toFixed(decY), pad.l - 7, py);
  }
  ctx.restore();

  // ── Label axe Y : "σ" + unité ──
  ctx.save();
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.font         = `bold ${fst}px 'Segoe UI', Arial, sans-serif`;
  ctx.fillStyle    = '#2d3748';
  ctx.fillText('σ', pad.l, 2);
  ctx.font      = `${fs}px 'Segoe UI', Arial, sans-serif`;
  ctx.fillStyle = '#4a5568';
  ctx.fillText('(mS/cm)', pad.l, 2 + fst + 2);
  ctx.restore();

  // ── Courbe modélisée σ (optionnelle) ──
  if (_phShowModelCourbe && pts.length >= 2) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, gw, gh);
    ctx.clip();
    ctx.strokeStyle = 'rgba(42,138,80,0.45)';
    ctx.lineWidth   = Math.max(1.2, W * 0.003);
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.beginPath();
    let firstM = true;
    for (const p of pts) {
      const px = pad.l + (p.v / xMax) * gw;
      const py = pad.t + gh - ((p.sigma - yMin) / (yMax - yMin)) * gh;
      if (firstM) { ctx.moveTo(px, py); firstM = false; }
      else         { ctx.lineTo(px, py); }
    }
    ctx.stroke();
    ctx.restore();
  }

  // ── Points expérimentaux σ (croix) ──
  // On ne trace que les points créés à chaque multiple exact du pas
  // d'acquisition (cf. _recordExpPointIfNeeded). Aucune courbe continue
  // n'est dessinée : c'est conforme à un TP réel où l'élève reporte ses
  // mesures point par point.
  if (_sigmaExpPoints && _sigmaExpPoints.length > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, gw, gh);
    ctx.clip();
    const color = '#2a8a50';
    const r     = Math.max(2, Math.round(Math.min(W, H) * 0.008));   // demi-longueur
    const lw    = Math.max(1.0, Math.min(W, H) * 0.0025);
    for (const p of _sigmaExpPoints) {
      if (p.v < 0 || p.v > xMax) continue;
      const px = pad.l + (p.v / xMax) * gw;
      const py = pad.t + gh - ((p.sigma - yMin) / (yMax - yMin)) * gh;
      _drawExpCross(ctx, px, py, r, color, lw);
    }
    ctx.restore();
  }

  // ── Hover : snap sur point expérimental ou sur courbe modélisée ──
  // Désactivé pendant les phases de tracé des droites (1-4).
  const _condPlacementActive = _condLinesActive && _condLinesCtx.phase >= 1 && _condLinesCtx.phase <= 4;
  if (_phChartHover && !_condPlacementActive) {
    const { mx, my } = _phChartHover;
    if (mx >= pad.l - 10 && mx <= pad.l + gw + 10 &&
        my >= pad.t  - 10 && my <= pad.t  + gh + 10) {

      if (_phShowModelCourbe) {
        // Mode courbe modélisée : snap sur la courbe théorique à 0,10 mL
        const vMouse = ((mx - pad.l) / gw) * xMax;
        const vSnap  = Math.max(0, Math.min(state.titrageVverse ?? 0,
                         Math.round(vMouse / 0.10) * 0.10));
        const sigmaSnap = calcSigmaAtVolume(vSnap);
        const bx    = pad.l + (vSnap / xMax) * gw;
        const by    = pad.t + gh - ((sigmaSnap - yMin) / (yMax - yMin)) * gh;
        const label = `${vSnap.toFixed(2)} mL  |  σ = ${sigmaSnap.toFixed(2)} mS/cm`;
        _drawHoverTooltip(ctx, pad, gw, gh, bx, by, label, '#2a8a50', W, H);
      } else if (_sigmaExpPoints && _sigmaExpPoints.length > 0) {
        // Mode points expérimentaux : point le plus proche (≤ 24 px)
        let best = null, bestDist = Infinity;
        for (const p of _sigmaExpPoints) {
          if (p.v < 0 || p.v > xMax) continue;
          const px = pad.l + (p.v / xMax) * gw;
          const py = pad.t + gh - ((p.sigma - yMin) / (yMax - yMin)) * gh;
          const d  = Math.hypot(mx - px, my - py);
          if (d < bestDist) { bestDist = d; best = { px, py, p }; }
        }
        if (best && bestDist <= 24) {
          const bx    = best.px;
          const by    = best.py;
          const label = `${best.p.v.toFixed(2)} mL  |  σ = ${best.p.sigma.toFixed(2)} mS/cm`;
          _drawHoverTooltip(ctx, pad, gw, gh, bx, by, label, '#2a8a50', W, H);
        }
      }
    }
  }

  // ── Réticule libre ──
  _drawReticule(ctx, pad, gw, gh, xMax, yMin, yMax, W, H, 'σ (mS/cm)');

  // ── Droites (outil "Tracer des droites") ──
  if (_condLinesActive) {
    _drawCondLines(ctx, pad, gw, gh, xMax, yMin, yMax, W, H);
  }

  // ── Bordure ──
  ctx.save();
  ctx.strokeStyle = '#b0a898';
  ctx.lineWidth   = 1;
  ctx.strokeRect(pad.l, pad.t, gw, gh);
  ctx.restore();
}

/* ══════════════════════════════════════════════════════════════════════════
   GRAPHE pH=f(V) — mode pH-métrique
   La courbe n'est pas stockée : on échantillonne `calcPHAtVolume(v)` à chaque
   redraw sur [0, state.titrageVverse] avec une densité adaptative renforcée
   autour de l'équivalence (où la dérivée est maximale).
══════════════════════════════════════════════════════════════════════════ */

let _phChartHover    = null;
let _phShowDerivee   = false;   // état bouton "Courbe dérivée"
let _phShowTangentes = false;   // état bouton "Méthode des tangentes"
let _phCursorActive  = false;   // état bouton "Réticule libre"
let _phShowModelCourbe = false; // état bouton "Modéliser la courbe"
let _phShowIndicateur  = false; // état bouton "Indicateur coloré"
let _phSampledPts    = [];      // derniers points échantillonnés par _samplePhCurve (pour le hover)

// Dernière position souris connue sur le canvas (px canvas), indépendante
// de _phChartHover (qui est remis à null au mouseleave). Utilisée par
// _drawCondLines pour animer la droite en cours même quand la souris est
// immobile entre deux événements mousemove.
let _condMousePx  = null;
let _sigmaLayout  = null;  // layout courant du graphe σ (pad, gw, gh, xMax, …)
let _phLayout     = null;  // layout courant du graphe pH (pad, gw, gh, …)

/* ── Points expérimentaux ─────────────────────────────────────────────────
   Liste des points "mesurés" par l'élève, créés à chaque multiple exact du
   pas d'acquisition (state.titragePasAcquisition) franchi par le volume
   versé. Tracés sous forme de croix `+` sur le graphe principal — plus
   aucune courbe continue n'est dessinée (cf. critique pédagogique :
   en TP réel on n'a qu'une série de points).

   La courbe théorique (calcPHAtVolume / calcSigmaAtVolume) reste utilisée
   *en interne* par les outils dérivée, tangentes et réticule (qui ont
   besoin de la fonction continue), mais n'apparaît plus à l'écran.

   Format : [{ v: <mL>, ph: <pH> }]  ou  [{ v: <mL>, sigma: <mS/cm> }]
   Renseignés via `_recordExpPointIfNeeded(vPrec, vNew)` appelé à chaque
   ajout de titrant ; régénérés intégralement si l'utilisateur change le pas
   en cours de manipulation (cf. `onPasAcquisitionChange`).
   ───────────────────────────────────────────────────────────────────── */
let _phExpPoints    = [];   // mode pH-métrique
let _sigmaExpPoints = [];   // mode conductimétrique

/* ══════════════════════════════════════════════════════════════════════════
   OUTIL "TRACER DES DROITES" — mode conductimétrique uniquement.

   Deux droites définies chacune par deux points de contrôle (en coordonnées
   data : { v, sigma }). Chaque droite est tracée en trait plein s'étendant
   sur toute la largeur du graphe.

   Machine à états (_condLinesCtx.phase) :
     0  inactif (outil désactivé ou reset)
     1  placement du 1er pivot de la droite 1
          → un point fixe au centre, la droite pivote vers la souris
          → clic gauche : fige le pivot, passe à la phase 2
     2  placement du 2e point de la droite 1
          → même principe : le 2e point suit la souris
          → clic gauche : fige le 2e point, passe à la phase 3
     3  placement du 1er pivot de la droite 2  (identique phase 1)
     4  placement du 2e point de la droite 2   (identique phase 2)
     5  toutes les droites tracées — seul le drag & drop est actif

   Chaque droite stocke deux points de contrôle (data) + la couleur :
     { p1: {v, sigma}, p2: {v, sigma}, color }

   Drag & drop : mousedown sur un point de contrôle (< DRAG_RADIUS px) →
   drag → mouseup. Actif en phase 5 uniquement.
══════════════════════════════════════════════════════════════════════════ */

let _condLinesActive = false;   // bouton actif
const _COND_LINE_COLORS = ['#c0392b', '#1a5276'];  // rouge D1, bleu foncé D2
const _CTRL_PT_RADIUS   = 7;    // rayon des cercles de contrôle (px)
const _DRAG_HIT_RADIUS  = 14;   // zone de détection drag (px)

function _condLinesInitCtx() {
  return {
    phase: 0,
    lines: [
      { p1: null, p2: null, color: _COND_LINE_COLORS[0] },
      { p1: null, p2: null, color: _COND_LINE_COLORS[1] },
    ],
    drag: null,   // { lineIdx, ptKey ('p1'|'p2') } pendant le drag
  };
}
let _condLinesCtx = _condLinesInitCtx();

/** Convertit des coordonnées data {v, sigma} en pixels canvas. */
function _condDataToPx(v, sigma, pad, gw, gh, xMax, yMin, yMax) {
  return {
    x: pad.l + (v / xMax) * gw,
    y: pad.t + gh - ((sigma - yMin) / (yMax - yMin)) * gh,
  };
}

/** Convertit des pixels canvas en coordonnées data {v, sigma}. */
function _condPxToData(px, py, pad, gw, gh, xMax, yMin, yMax) {
  return {
    v:     ((px - pad.l) / gw) * xMax,
    sigma: yMin + (1 - (py - pad.t) / gh) * (yMax - yMin),
  };
}

/**
 * Retourne les deux coordonnées pixel aux bords du graphe pour une droite
 * passant par (x1,y1) et (x2,y2) — ou par (x1,y1) avec direction vers (mx,my)
 * si x2/y2 non fournis.
 * Clip sur le rectangle [pad.l, pad.l+gw] × [pad.t, pad.t+gh].
 */
function _condLineClip(ax, ay, bx, by, pad, gw, gh) {
  // Paramétrisation de la droite : P(t) = A + t*(B-A)
  // On cherche les t d'entrée/sortie dans la bbox.
  const dx = bx - ax, dy = by - ay;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;
  const xl = pad.l, xr = pad.l + gw, yt = pad.t, yb = pad.t + gh;
  const ts = [];
  if (Math.abs(dx) > 1e-9) {
    ts.push((xl - ax) / dx);
    ts.push((xr - ax) / dx);
  } else {
    ts.push(-Infinity); ts.push(Infinity);
  }
  if (Math.abs(dy) > 1e-9) {
    ts.push((yt - ay) / dy);
    ts.push((yb - ay) / dy);
  } else {
    ts.push(-Infinity); ts.push(Infinity);
  }
  ts.sort((a, b) => a - b);
  // Les deux t "intérieurs" sont ts[1] et ts[2]
  const t0 = ts[1], t1 = ts[2];
  if (t0 >= t1) return null;
  return {
    x1: ax + t0 * dx, y1: ay + t0 * dy,
    x2: ax + t1 * dx, y2: ay + t1 * dy,
  };
}

/**
 * Dessine les droites et les points de contrôle par-dessus le graphe σ.
 * Appelé à la fin de drawTitrageSigmaGraph.
 */
function _drawCondLines(ctx, pad, gw, gh, xMax, yMin, yMax, W, H) {
  const ctx2 = ctx;
  const phase = _condLinesCtx.phase;
  if (phase === 0) return;

  const lines = _condLinesCtx.lines;

  // ── Droite 1 complète ──
  if (phase >= 3 && lines[0].p1 && lines[0].p2) {
    _renderCondLine(ctx2, lines[0], pad, gw, gh, xMax, yMin, yMax, false);
  }
  // ── Droite 2 complète ──
  if (phase >= 5 && lines[1].p1 && lines[1].p2) {
    _renderCondLine(ctx2, lines[1], pad, gw, gh, xMax, yMin, yMax, false);
  }

  // ── Droite en cours de placement (pointillés) ──
  // On utilise _condMousePx (position brute en px canvas, conservée entre
  // les mousemove) plutôt que _phChartHover (remis à null au mouseleave).
  // Cela permet à la droite de rester visible même quand la souris est
  // immobile ou sort brièvement du canvas.
  const mousePx = _condMousePx;   // { mx, my } ou null

  if (phase === 1) {
    const vCenter = xMax / 2, sCenter = (yMin + yMax) / 2;
    const pivot   = _condDataToPx(vCenter, sCenter, pad, gw, gh, xMax, yMin, yMax);
    const target  = mousePx ? { x: mousePx.mx, y: mousePx.my }
                             : { x: pivot.x + 60, y: pivot.y - 30 };
    const clip = _condLineClip(pivot.x, pivot.y, target.x, target.y, pad, gw, gh);
    if (clip) _renderClippedLine(ctx2, clip, lines[0].color, true);
    _renderCtrlPt(ctx2, pivot.x, pivot.y, lines[0].color, false);

  } else if (phase === 2 && lines[0].p1) {
    const pivot  = _condDataToPx(lines[0].p1.v, lines[0].p1.sigma, pad, gw, gh, xMax, yMin, yMax);
    const target = mousePx ? { x: mousePx.mx, y: mousePx.my }
                            : { x: pivot.x + 60, y: pivot.y - 30 };
    const clip = _condLineClip(pivot.x, pivot.y, target.x, target.y, pad, gw, gh);
    if (clip) _renderClippedLine(ctx2, clip, lines[0].color, true);
    _renderCtrlPt(ctx2, pivot.x, pivot.y, lines[0].color, true);

  } else if (phase === 3) {
    _renderCondLine(ctx2, lines[0], pad, gw, gh, xMax, yMin, yMax, true);
    const vCenter = xMax / 2, sCenter = (yMin + yMax) / 2;
    const pivot   = _condDataToPx(vCenter, sCenter, pad, gw, gh, xMax, yMin, yMax);
    const target  = mousePx ? { x: mousePx.mx, y: mousePx.my }
                             : { x: pivot.x + 60, y: pivot.y + 30 };
    const clip = _condLineClip(pivot.x, pivot.y, target.x, target.y, pad, gw, gh);
    if (clip) _renderClippedLine(ctx2, clip, lines[1].color, true);
    _renderCtrlPt(ctx2, pivot.x, pivot.y, lines[1].color, false);

  } else if (phase === 4 && lines[1].p1) {
    _renderCondLine(ctx2, lines[0], pad, gw, gh, xMax, yMin, yMax, true);
    const pivot  = _condDataToPx(lines[1].p1.v, lines[1].p1.sigma, pad, gw, gh, xMax, yMin, yMax);
    const target = mousePx ? { x: mousePx.mx, y: mousePx.my }
                            : { x: pivot.x + 60, y: pivot.y + 30 };
    const clip = _condLineClip(pivot.x, pivot.y, target.x, target.y, pad, gw, gh);
    if (clip) _renderClippedLine(ctx2, clip, lines[1].color, true);
    _renderCtrlPt(ctx2, pivot.x, pivot.y, lines[1].color, true);

  } else if (phase === 5) {
    _renderCondLine(ctx2, lines[0], pad, gw, gh, xMax, yMin, yMax, true);
    _renderCondLine(ctx2, lines[1], pad, gw, gh, xMax, yMin, yMax, true);
  }
}

function _renderCondLine(ctx, line, pad, gw, gh, xMax, yMin, yMax, withPts) {
  if (!line.p1 || !line.p2) return;
  const a = _condDataToPx(line.p1.v, line.p1.sigma, pad, gw, gh, xMax, yMin, yMax);
  const b = _condDataToPx(line.p2.v, line.p2.sigma, pad, gw, gh, xMax, yMin, yMax);
  const clip = _condLineClip(a.x, a.y, b.x, b.y, pad, gw, gh);
  if (clip) _renderClippedLine(ctx, clip, line.color, false);
  if (withPts) {
    _renderCtrlPt(ctx, a.x, a.y, line.color, true);
    _renderCtrlPt(ctx, b.x, b.y, line.color, true);
  }
}

function _renderClippedLine(ctx, clip, color, dashed) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  if (dashed) ctx.setLineDash([6, 5]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(clip.x1, clip.y1);
  ctx.lineTo(clip.x2, clip.y2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function _renderCtrlPt(ctx, cx, cy, color, fixed) {
  ctx.save();
  ctx.fillStyle   = fixed ? color : 'rgba(255,255,255,0.85)';
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, _CTRL_PT_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Gère un clic gauche dans le graphe σ en mode "Tracer des droites". */
function _condLinesHandleClick(mx, my, pad, gw, gh, xMax, yMin, yMax) {
  const phase = _condLinesCtx.phase;
  const lines  = _condLinesCtx.lines;
  if (phase === 0 || phase === 5) return;

  const data = _condPxToData(mx, my, pad, gw, gh, xMax, yMin, yMax);

  if (phase === 1) {
    // Fige le 1er pivot de la droite 1 à la position courante de la souris
    lines[0].p1 = data;
    _condLinesCtx.phase = 2;
  } else if (phase === 2) {
    lines[0].p2 = data;
    _condLinesCtx.phase = 3;
  } else if (phase === 3) {
    lines[1].p1 = data;
    _condLinesCtx.phase = 4;
  } else if (phase === 4) {
    lines[1].p2 = data;
    _condLinesCtx.phase = 5;
  }
  drawTitrageSigmaGraph();
}

/** Tente de démarrer un drag sur un point de contrôle (phase 5). */
function _condLinesHandleMousedown(mx, my, pad, gw, gh, xMax, yMin, yMax) {
  if (_condLinesCtx.phase !== 5) return false;
  const lines = _condLinesCtx.lines;
  for (let li = 0; li < 2; li++) {
    for (const key of ['p1', 'p2']) {
      const pt = lines[li][key];
      if (!pt) continue;
      const px = _condDataToPx(pt.v, pt.sigma, pad, gw, gh, xMax, yMin, yMax);
      if (Math.hypot(mx - px.x, my - px.y) <= _DRAG_HIT_RADIUS) {
        _condLinesCtx.drag = { lineIdx: li, ptKey: key };
        return true;
      }
    }
  }
  return false;
}

function _condLinesHandleMousemove(mx, my, pad, gw, gh, xMax, yMin, yMax) {
  if (!_condLinesCtx.drag) return;
  const { lineIdx, ptKey } = _condLinesCtx.drag;
  // Contraindre mx/my aux bornes de la zone graphique pour empêcher
  // le point de sortir hors du canvas lors d'un drag rapide
  const mxC = Math.max(pad.l, Math.min(pad.l + gw, mx));
  const myC = Math.max(pad.t, Math.min(pad.t + gh, my));
  _condLinesCtx.lines[lineIdx][ptKey] = _condPxToData(mxC, myC, pad, gw, gh, xMax, yMin, yMax);
  drawTitrageSigmaGraph();
}

function _condLinesHandleMouseup() {
  _condLinesCtx.drag = null;
  document.removeEventListener('mousemove', _condLinesDragMove);
  document.removeEventListener('mouseup',   _condLinesHandleMouseup);
}

// Handlers document-level pour capturer le drag hors du canvas
function _condLinesDragMove(e) {
  if (!_condLinesCtx.drag || !_sigmaLayout) return;
  const canvas = document.getElementById('titrage-chart-ph');
  if (!canvas) return;
  const r   = canvas.getBoundingClientRect();
  const scX = canvas.clientWidth  / r.width;
  const scY = canvas.clientHeight / r.height;
  const mx  = (e.clientX - r.left) * scX;
  const my  = (e.clientY - r.top)  * scY;
  const l   = _sigmaLayout;
  _condLinesHandleMousemove(mx, my, l.pad, l.gw, l.gh, l.xMax, l.yMin, l.yMax);
}

/** Active/désactive le mode "Tracer des droites". Reset si réactivation. */
// RAF loop pour animer la droite en cours de placement (phases 1-4)
// sans dépendre du mousemove.
let _condLinesRafId = null;
function _condLinesStartRaf() {
  if (_condLinesRafId) return;
  function loop() {
    const phase = _condLinesCtx.phase;
    if (_condLinesActive && phase >= 1 && phase <= 4) {
      drawTitrageSigmaGraph();
      _condLinesRafId = requestAnimationFrame(loop);
    } else {
      _condLinesRafId = null;
      drawTitrageSigmaGraph(); // dernier draw pour afficher l'état final
    }
  }
  _condLinesRafId = requestAnimationFrame(loop);
}
function _condLinesStopRaf() {
  if (_condLinesRafId) { cancelAnimationFrame(_condLinesRafId); _condLinesRafId = null; }
}

function toggleTracerDroites() {
  const btn = document.getElementById('btn-tracer-droites');
  if (!btn) return;
  if (_condLinesActive) {
    _condLinesStopRaf();
    _condLinesActive = false;
    _condLinesCtx    = _condLinesInitCtx();
    btn.classList.remove('active');
    drawTitrageSigmaGraph();
  } else {
    _condLinesActive    = true;
    _condLinesCtx       = _condLinesInitCtx();
    _condLinesCtx.phase = 1;
    btn.classList.add('active');
    _condLinesStartRaf();
  }
}

/**
 * Pousse les points expérimentaux dont le volume tombe dans ]vPrec, vNew].
 * Garantit qu'il existe un point à V=0 et un point à chaque multiple exact du
 * pas d'acquisition. Robuste à toutes les sources d'ajout (boutons +0,1/+1/+5,
 * robinet à 50 ms, vidage automatique).
 *
 * Logique :
 *   - On laisse `initChartData` créer le point initial à V=0.
 *   - Soit `pas = state.titragePasAcquisition`.
 *   - On itère k de `floor(vPrec/pas) + 1` à `floor(vNew/pas)` (inclus) et on
 *     pousse un point à `v = k·pas` calculé via `calcPHAtVolume(v)` (resp. σ).
 *     Le pH/σ est donc évalué *exactement* au multiple du pas (cf. choix
 *     utilisateur "honnête mais propre").
 */
function _recordExpPointIfNeeded(vPrec, vNew) {
  const mode = state.titrageType;
  if (mode !== 'phmetrique' && mode !== 'conductimetrique') return;
  const pas = state.titragePasAcquisition || 1.0;
  if (pas <= 0) return;
  // Tolérance numérique pour ne pas dupliquer un point exactement sur un multiple
  const EPS = 1e-9;
  const kPrec = Math.floor((vPrec + EPS) / pas);
  const kNew  = Math.floor((vNew  + EPS) / pas);
  if (kNew <= kPrec) return;
  const arr = (mode === 'phmetrique') ? _phExpPoints : _sigmaExpPoints;
  for (let k = kPrec + 1; k <= kNew; k++) {
    const v = +(k * pas).toFixed(6);
    if (mode === 'phmetrique') {
      arr.push({ v, ph: calcPHAtVolume(v) });
    } else {
      arr.push({ v, sigma: calcSigmaAtVolume(v) });
    }
  }
}

/**
 * Réinitialise les listes de points expérimentaux et y place le point V=0
 * (état initial avant tout ajout de titrant — mesuré à la solution titrée
 * éventuellement diluée par l'eau). Appelé par `initChartData` et
 * `reinitialiserTitrage`.
 */
function _resetExpPoints() {
  _phExpPoints    = [{ v: 0, ph:    calcPHAtVolume(0)    }];
  _sigmaExpPoints = [{ v: 0, sigma: calcSigmaAtVolume(0) }];
  _phSampledPts   = [];
}

/**
 * Pousse un point expérimental à un volume précis (API publique).
 * Utilisé par _verserVolume (ui.js) pour placer le point exact à la fin
 * d'un versement déclenché par bouton (+0,5 / +1 mL).
 */
function pushExpPoint(v) {
  const mode = state.titrageType;
  if (mode === 'phmetrique') {
    _phExpPoints.push({ v, ph: calcPHAtVolume(v) });
  } else if (mode === 'conductimetrique') {
    _sigmaExpPoints.push({ v, sigma: calcSigmaAtVolume(v) });
  }
}

/**
 * Régénère intégralement les points expérimentaux depuis V=0 jusqu'à `vMax`
 * selon le pas courant (state.titragePasAcquisition). Appelé lorsque
 * l'utilisateur change le pas d'acquisition en cours de manipulation : le
 * graphe reflète immédiatement la nouvelle grille de mesures, sans laisser
 * d'anciens points incohérents.
 */
function _rebuildExpPoints() {
  _resetExpPoints();
  const vMax = state.titrageVverse || 0;
  if (vMax > 0) _recordExpPointIfNeeded(0, vMax);
}

/**
 * Dessine une croix `+` centrée en (cx, cy), de demi-longueur `r`.
 * Style "point expérimental" : deux segments orthogonaux fins.
 */
function _drawExpCross(ctx, cx, cy, r, color, lw) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = lw;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
  ctx.stroke();
  ctx.restore();
}

/**
 * État de la construction interactive de la méthode des tangentes.
 *   phase : 0 = inactif, 1 = tracé tangente 1, 2 = tracé tangente 2, 3 = terminé
 *   slope : pente commune en pH/mL (figée à la phase 1, conservée parallèle)
 *   t1    : { v, ph } point où la tangente 1 a été figée (sur la courbe)
 *   t2    : { v, ph } point libre où la tangente 2 a été figée
 */
let _phTanCtx = { phase: 0, slope: 0, t1: null, t2: null };

/** Calcule le pH à un volume versé (mL) sans modifier state.titrageVverse. */
function calcPHAtVolume(vVerse) {
  const entry = TITRAGE_PH_REACTIONS[state.titragePhRxnIdx || 0];
  if (!entry) return 7;
  const type = entry.titre.type;
  const isBase = (type === 'base_forte' || type === 'base_faible');
  if (isBase) {
    // Base dans le bécher, HCl versé depuis la burette
    return calcPH({
      typeTitre: type,
      pKa:       entry.titre.pKa,
      Ca:        state.titrageConcTitrante,  // HCl concentr. titrante
      Va:        vVerse,                      // volume HCl versé
      Cb:        state.titrageConcTitree,     // base concentr. titrée
      Vb:        state.titrageV1,             // volume base initial
      Veau:      state.titrageVeau,
    });
  }
  return calcPH({
    typeTitre: type,
    pKa:       entry.titre.pKa,
    Ca:        state.titrageConcTitree,
    Va:        state.titrageV1,
    Cb:        state.titrageConcTitrante,
    Vb:        vVerse,
    Veau:      state.titrageVeau,
  });
}

/**
 * Échantillonne pH=f(V) sur [0, vMax] (mL) avec une densité adaptative :
 *  - grille uniforme de base à `dvBase` mL,
 *  - autour de l'équivalence estimée (Veq = Ca·V1/Cb), grille fine à `dvFine` mL.
 * Renvoie un tableau ordonné { v, ph }.
 */
function _samplePhCurve(vMax) {
  if (vMax <= 0) return [{ v: 0, ph: calcPHAtVolume(0) }];

  // Volume équivalent théorique (mL) — utilisé pour densifier la zone du saut.
  // Pour les bases titrées par HCl : Ca = [HCl] titrante, Cb = [base] titrée,
  // Veq = Cb·V1/Ca (volume de HCl versé à l'équivalence).
  const entry = TITRAGE_PH_REACTIONS[state.titragePhRxnIdx || 0];
  const typeT = entry ? entry.titre.type : '';
  const isBase = (typeT === 'base_forte' || typeT === 'base_faible');
  const Ca = state.titrageConcTitree;
  const Cb = state.titrageConcTitrante;
  const V1 = state.titrageV1;
  const vEq = isBase
    ? ((Cb > 0) ? (Ca * V1 / Cb) : null)   // Veq = C_titrée·V1 / C_titrante
    : ((Cb > 0) ? (Ca * V1 / Cb) : null);   // même formule (Ca/Cb·V1)

  // Pas de base : ~400 points sur tout le domaine de la burette pleine (25 mL).
  // Soit ~16 points/mL — largement suffisant hors saut.
  const dvBase = 25 / 400;        // 0,0625 mL

  // Pas ultra-fin autour de l'équivalence.
  // dvFine = dvBase / 50 ≈ 0,00125 mL → ~1600 points sur ±1 mL.
  // C'est nécessaire pour que le hover trouve un point proche en pixels
  // même dans la zone quasi verticale du saut (surtout acides/bases forts).
  const dvFine = dvBase / 50;     // ~0,00125 mL

  // Demi-largeur de la fenêtre fine.
  // On prend le max entre 1 mL fixe et 8 % du domaine,
  // pour couvrir les sauts larges (acide faible très dilué) comme les sauts étroits.
  const wFine  = Math.max(1.0, vMax * 0.08);

  // Construire la liste des volumes à échantillonner (croissants, sans doublons).
  const vols = new Set();
  vols.add(0);
  vols.add(vMax);
  // Grille uniforme
  for (let v = dvBase; v < vMax; v += dvBase) vols.add(+v.toFixed(6));
  // Grille fine autour de Veq si elle tombe dans le domaine tracé
  if (vEq != null && vEq > 0 && vEq < vMax + wFine) {
    const lo = Math.max(0, vEq - wFine);
    const hi = Math.min(vMax, vEq + wFine);
    for (let v = lo; v <= hi + 1e-9; v += dvFine) vols.add(+v.toFixed(6));
  }
  // Grille fine au tout début pour la remontée rapide d'un acide faible
  // (où la dérivée est aussi importante : on titre les H₃O⁺ libres).
  // On couvre les 4 premiers % du domaine avec le même dvFine.
  const wStart = Math.min(vMax, Math.max(0.3, vMax * 0.04));
  for (let v = 0; v <= wStart + 1e-9; v += dvFine) vols.add(+v.toFixed(6));

  const sorted = Array.from(vols).filter(v => v >= 0 && v <= vMax).sort((a, b) => a - b);
  return sorted.map(v => ({ v, ph: calcPHAtVolume(v) }));
}

/**
 * Dessine le tooltip de hover (lignes en tirets, point, bulle de texte).
 * Utilisé par les deux graphes (pH et σ).
 */
function _drawHoverTooltip(ctx, pad, gw, gh, bx, by, label, color, W, H) {
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(60,60,60,0.45)';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, pad.t + gh); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(pad.l, by);      ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.stroke();

  const ttFs = Math.max(11, Math.round(Math.min(W, H) * 0.038));
  ctx.font = `bold ${ttFs}px 'Segoe UI', Arial, sans-serif`;
  const lw2  = ctx.measureText(label).width;
  const pad2 = 6;
  const ttW  = lw2 + pad2 * 2;
  const ttH  = ttFs + pad2 * 2;
  const spaceRight = pad.l + gw - (bx + 12);
  const spaceLeft  = bx - 12 - pad.l;
  let lx = (spaceRight >= ttW || spaceRight >= spaceLeft) ? bx + 12 : bx - 12 - ttW;
  lx = Math.max(pad.l, Math.min(pad.l + gw - ttW, lx));
  let ly = by - ttFs - 8;
  if (ly - pad2 < pad.t) ly = by + 10;

  ctx.fillStyle   = 'rgba(255,255,255,0.93)';
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.5;
  ctx.beginPath(); ctx.roundRect(lx - pad2, ly - pad2, ttW, ttH, 4);
  ctx.fill(); ctx.stroke();

  ctx.fillStyle    = '#1a2535';
  ctx.textBaseline = 'top';
  ctx.textAlign    = 'left';
  ctx.fillText(label, lx, ly);
  ctx.restore();
}

/**
 * Dessine le réticule libre sur le canvas pH/σ (partagé par les deux modes).
 * @param {string} unitLabel  - "pH" ou "σ (mS/cm)" selon le mode
 */
function _drawReticule(ctx, pad, gw, gh, xMax, yMin, yMax, W, H, unitLabel) {
  const tooltip = document.getElementById('ph-reticule-tooltip');
  if (_phCursorActive && _phChartHover && tooltip) {
    const { mx, my } = _phChartHover;
    if (mx >= pad.l && mx <= pad.l + gw && my >= pad.t && my <= pad.t + gh) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(44, 62, 80, 0.55)';
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(mx, pad.t);  ctx.lineTo(mx, pad.t + gh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad.l, my);  ctx.lineTo(pad.l + gw, my); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#2c3e50';
      ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      const vCur   = ((mx - pad.l) / gw) * xMax;
      const yCur   = yMin + (1 - (my - pad.t) / gh) * (yMax - yMin);
      const ttFs   = Math.max(11, Math.round(Math.min(W, H) * 0.038));
      const decY   = unitLabel === 'pH' ? 2 : 2;
      tooltip.style.fontSize = ttFs + 'px';
      tooltip.innerHTML = `V = ${vCur.toFixed(2)} mL<br>${unitLabel} = ${yCur.toFixed(decY)}`;
      tooltip.style.display = 'block';
      const canvas   = document.getElementById('titrage-chart-ph');
      const canvRect = canvas.getBoundingClientRect();
      const scX = canvRect.width  / canvas.clientWidth;
      const scY = canvRect.height / canvas.clientHeight;
      tooltip.style.left = (canvRect.left + mx * scX + 14) + 'px';
      tooltip.style.top  = (canvRect.top  + my * scY - 10) + 'px';
    } else {
      tooltip.style.display = 'none';
    }
  } else if (tooltip) {
    tooltip.style.display = 'none';
  }
}

/**
 * Distribue la largeur disponible entre les boutons visibles de #ph-analysis-btns.
 * - Les boutons dont la largeur naturelle < perBtn gardent leur largeur naturelle.
 * - Le reste est distribué équitablement entre les boutons larges.
 * - Sur grand écran : tous les boutons tiennent → aucun crop.
 * - Sur petit écran : texte croppé avec ellipsis, title natif au hover.
 */
function _updateGraphBtnsSize() {
  const btnsEl = document.getElementById('ph-analysis-btns');
  if (!btnsEl) return;
  const panel = document.getElementById('titrage-chart-ph-panel');
  if (!panel) return;

  // Réinitialiser les largeurs pour mesurer la taille naturelle
  const btns = Array.from(btnsEl.querySelectorAll('button'))
    .filter(b => b.style.display !== 'none');
  btns.forEach(b => { b.style.width = ''; });
  if (!btns.length) return;

  // Largeur disponible :
  // panelW (hors padding CSS 12×2) − padL (axe Y gauche) − padR (marge droite) − right:20px
  const panelW = panel.clientWidth - 24;
  const padL = (_phLayout && _phLayout.pad) ? _phLayout.pad.l : 55;
  const padR = (_phLayout && _phLayout.pad) ? _phLayout.pad.r : 20;
  const availW = Math.max(40, panelW - padL - padR - 20);

  const n = btns.length;
  const gap = 6 * (n - 1);

  // Mesure largeur naturelle de chaque bouton
  const naturalWidths = btns.map(b => b.offsetWidth);
  const naturalTotal  = naturalWidths.reduce((s, w) => s + w, 0) + gap;

  if (naturalTotal <= availW) {
    // Assez de place — taille naturelle, aucun crop
    return;
  }

  // Pas assez de place : les "petits" boutons (< moyenne) gardent leur taille,
  // on distribue le reste entre les "grands".
  const avgW = (availW - gap) / n;
  const smallBtns = btns.filter((b, i) => naturalWidths[i] <= avgW);
  const largeBtns = btns.filter((b, i) => naturalWidths[i] >  avgW);

  const smallTotal = smallBtns.reduce((s, b, i) => {
    const idx = btns.indexOf(b);
    return s + naturalWidths[idx];
  }, 0);

  const perLarge = largeBtns.length
    ? Math.max(20, Math.floor((availW - gap - smallTotal) / largeBtns.length))
    : 20;

  btns.forEach((b, i) => {
    if (naturalWidths[i] <= avgW) {
      b.style.width = naturalWidths[i] + 'px';  // garde sa taille naturelle
    } else {
      b.style.width = perLarge + 'px';           // contraint + ellipsis
    }
  });
}

function drawTitragePhGraph() {
  const canvas = document.getElementById('titrage-chart-ph');
  if (!canvas) return;
  if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return;
  const ctx = canvas.getContext('2d');
  const W   = canvas.clientWidth;
  const H   = canvas.clientHeight;

  // ── Court-circuit : électrode non immergée ──
  // Le pH-mètre affiche `--` (cf. _updatePhDisplay) ; le graphe affiche un
  // message centré et n'est pas tracé tant que le bulbe n'est pas dans le liquide.
  if (typeof _electrodeImmergee === 'function' && !_electrodeImmergee()) {
    ctx.clearRect(0, 0, W, H);
    const dim = Math.min(W, H);
    const fsMsg = Math.max(12, Math.round(dim * 0.055));
    ctx.fillStyle    = '#666';
    ctx.font         = `600 ${fsMsg}px system-ui, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("L'électrode n'est pas dans la solution.", W / 2, H / 2);
    return;
  }

  // ── Plages ──
  const vVerse = state.titrageVverse ?? 0;
  let xMax = BURETTE.MAX_ML;
  if (vVerse > xMax) xMax = vVerse;
  xMax = Math.ceil(xMax / 5) * 5;
  // Axe Y fixe : 0 à 14 (échelle pédagogique standard)
  const yMin = 0, yMax = 14;

  // Échantillonnage dense de la courbe (à la volée, non stocké) :
  // grille de base + grille fine autour de l'équivalence et au tout début.
  const pts = _samplePhCurve(vVerse);
  _phSampledPts = pts;  // mémoriser pour le hover (recherche du point le plus proche)

  // ── Tailles de police adaptées ──
  const dim = Math.min(W, H);
  const fs  = Math.max(9,  Math.round(dim * 0.040));
  const fst = Math.max(10, Math.round(dim * 0.044));

  const tickLabelW = Math.round(fs * 2.2);
  const padL = tickLabelW + 4 + 7 + Math.round(fst * 0.3);
  const padR = padL;
  const padB = 4 + 6 + fs + 6 + fst + 4;
  // padT : réserve de la place pour les boutons overlay.
  // On lit la hauteur réelle du div boutons (peut dépasser 30px si wrap),
  // on y ajoute la distance top (20px depuis panel = ~8px depuis bord canvas)
  // et une marge de sécurité de 8px.
  const padTBase = 2 + fst + 2 + 4;
  const btnsEl = document.getElementById('ph-analysis-btns');
  const btnsH  = btnsEl ? btnsEl.offsetHeight : 30;
  const BTN_OFFSET_IN_CANVAS = 8;   // top:20px panel - padding:12px = 8px dans canvas
  const padT = Math.max(padTBase, BTN_OFFSET_IN_CANVAS + btnsH + 8);
  const pad  = { t: padT, r: padR, b: padB, l: padL };
  const gw = W - pad.l - pad.r;
  const gh = H - pad.t - pad.b;
  if (gw < 40 || gh < 40) return;
  _phLayout = { pad, gw, gh, W, H };
  _updateGraphBtnsSize();

  const nTicksX = Math.max(3, Math.min(6, Math.round(gw / 80)));
  const xStep   = _niceStep(xMax, nTicksX);
  // Axe Y : graduations entières par pas de 2 (0, 2, 4, …, 14)
  const yStep = 2;

  // ── Effacement + fond ──
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fdf8f0';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(pad.l, pad.t, gw, gh);

  // ── Fond indicateur coloré (optionnel) ──
  // 3 rectangles plats : zone acide, zone de virage (intermédiaire), zone basique.
  if (_phShowIndicateur && state.titrageIndicateur !== null) {
    const indic = INDICATEURS_COLORES[state.titrageIndicateur];
    if (indic) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(pad.l, pad.t, gw, gh);
      ctx.clip();

      // Positions Y canvas des bornes de la zone de virage
      const pyTop = pad.t + gh - ((indic.pHmax - yMin) / (yMax - yMin)) * gh;
      const pyBot = pad.t + gh - ((indic.pHmin - yMin) / (yMax - yMin)) * gh;

      const ALPHA = 0.22;
      const cAcide = indic.acideIncolore
        ? `rgba(184,212,240,${(ALPHA * 0.35).toFixed(3)})`
        : _hexToRgba(indic.coulAcide, ALPHA);
      const cInter   = _hexToRgba(indic.coulInter,   ALPHA);
      const cBasique = _hexToRgba(indic.coulBasique, ALPHA);

      // Zone acide : du bas du graphe jusqu'à pHmin
      ctx.fillStyle = cAcide;
      ctx.fillRect(pad.l, pyBot, gw, pad.t + gh - pyBot);

      // Zone de virage : de pHmin à pHmax
      ctx.fillStyle = cInter;
      ctx.fillRect(pad.l, pyTop, gw, pyBot - pyTop);

      // Zone basique : de pHmax jusqu'au haut du graphe
      ctx.fillStyle = cBasique;
      ctx.fillRect(pad.l, pad.t, gw, pyTop - pad.t);

      // Traits et labels dessinés après la grille (voir plus bas)

      ctx.restore();
    }
  }

  // ── Grille ──
  ctx.save();
  ctx.strokeStyle = '#ece8e2';
  ctx.lineWidth   = 1;
  for (let x = xStep; x <= xMax + xStep * 0.01; x += xStep) {
    const px = pad.l + (x / xMax) * gw;
    ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, pad.t + gh); ctx.stroke();
  }
  for (let y = yStep; y <= yMax - 0.01; y += yStep) {
    const py = pad.t + gh - ((y - yMin) / (yMax - yMin)) * gh;
    ctx.beginPath(); ctx.moveTo(pad.l, py); ctx.lineTo(pad.l + gw, py); ctx.stroke();
  }
  // Ligne pH=7 en pointillé léger pour la neutralité
  const py7 = pad.t + gh - ((7 - yMin) / (yMax - yMin)) * gh;
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(120,140,160,0.45)';
  ctx.beginPath(); ctx.moveTo(pad.l, py7); ctx.lineTo(pad.l + gw, py7); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // ── Traits + labels indicateur (par-dessus la grille) ──
  if (_phShowIndicateur && state.titrageIndicateur !== null) {
    const indic = INDICATEURS_COLORES[state.titrageIndicateur];
    if (indic) {
      const pyTop2 = pad.t + gh - ((indic.pHmax - yMin) / (yMax - yMin)) * gh;
      const pyBot2 = pad.t + gh - ((indic.pHmin - yMin) / (yMax - yMin)) * gh;
      ctx.save();
      ctx.beginPath();
      ctx.rect(pad.l, pad.t, gw, gh);
      ctx.clip();

      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      [pyBot2, pyTop2].forEach(py => {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(pad.l, py); ctx.lineTo(pad.l + gw, py); ctx.stroke();
        ctx.strokeStyle = 'rgba(60,60,60,0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(pad.l, py); ctx.lineTo(pad.l + gw, py); ctx.stroke();
      });
      ctx.setLineDash([]);

      const fsI = Math.max(8, Math.round(fs * 0.88));
      ctx.font         = `600 ${fsI}px 'Segoe UI', Arial, sans-serif`;
      ctx.fillStyle    = 'rgba(60,60,60,0.75)';
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(indic.pHmin.toFixed(1).replace('.', ','), pad.l - 2, pyBot2);
      ctx.fillText(indic.pHmax.toFixed(1).replace('.', ','), pad.l - 2, pyTop2);

      ctx.restore();
    }
  }

  // ── Axes ──
  ctx.save();
  ctx.strokeStyle = '#2d3748';
  ctx.lineWidth   = 1.8;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, pad.t + gh);
  ctx.lineTo(pad.l + gw, pad.t + gh);
  ctx.stroke();
  ctx.restore();

  // ── Ticks + labels axe X ──
  ctx.save();
  ctx.fillStyle    = '#4a5568';
  ctx.font         = `${fs}px 'Segoe UI', Arial, sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.strokeStyle  = '#4a5568';
  ctx.lineWidth    = 1;
  for (let x = 0; x <= xMax + xStep * 0.01; x += xStep) {
    const px = pad.l + (x / xMax) * gw;
    ctx.beginPath(); ctx.moveTo(px, pad.t + gh); ctx.lineTo(px, pad.t + gh + 4); ctx.stroke();
    ctx.fillText(x % 1 === 0 ? x.toFixed(0) : x.toFixed(1), px, pad.t + gh + 6);
  }
  ctx.font      = `bold ${fst}px 'Segoe UI', Arial, sans-serif`;
  ctx.fillStyle = '#2d3748';
  const titleXY = pad.t + gh + 4 + 6 + fs + 6;
  ctx.fillText('V versé (mL)', pad.l + gw / 2, titleXY);
  ctx.restore();

  // ── Ticks + labels axe Y ──
  ctx.save();
  ctx.fillStyle    = '#4a5568';
  ctx.font         = `${fs}px 'Segoe UI', Arial, sans-serif`;
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle  = '#4a5568';
  ctx.lineWidth    = 1;
  for (let y = 0; y <= yMax + 0.01; y += yStep) {
    const py = pad.t + gh - ((y - yMin) / (yMax - yMin)) * gh;
    ctx.beginPath(); ctx.moveTo(pad.l, py); ctx.lineTo(pad.l - 4, py); ctx.stroke();
    ctx.fillText(y.toFixed(0), pad.l - 7, py);
  }
  ctx.restore();

  // ── Label axe Y : "pH" ──
  ctx.save();
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.font         = `bold ${fst}px 'Segoe UI', Arial, sans-serif`;
  ctx.fillStyle    = '#2d3748';
  ctx.fillText('pH', pad.l, 2);
  ctx.restore();

  // ── Courbe modélisée (optionnelle, activée par "Modéliser la courbe") ──
  // Tracée sous les croix expérimentales pour ne pas les masquer.
  if (_phShowModelCourbe && pts.length >= 2) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, gw, gh);
    ctx.clip();
    ctx.strokeStyle = 'rgba(42,106,170,0.45)';
    ctx.lineWidth   = Math.max(1.2, W * 0.003);
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.beginPath();
    let firstM = true;
    for (const p of pts) {
      const px = pad.l + (p.v / xMax) * gw;
      const py = pad.t + gh - ((p.ph - yMin) / (yMax - yMin)) * gh;
      if (firstM) { ctx.moveTo(px, py); firstM = false; }
      else         { ctx.lineTo(px, py); }
    }
    ctx.stroke();
    ctx.restore();
  }

  // ── Points expérimentaux pH (croix) ──
  // Plus de courbe continue à l'écran : on n'affiche que les points créés à
  // chaque multiple exact du pas d'acquisition (cf. _recordExpPointIfNeeded).
  // La courbe théorique reste utilisée *en interne* par dérivée / tangentes
  // / réticule via `pts` (issu de _samplePhCurve) — d'où on conserve `pts`
  // pour ces outils plus bas dans la fonction.
  if (_phExpPoints && _phExpPoints.length > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, gw, gh);
    ctx.clip();
    const color = '#2a6aaa';
    const r     = Math.max(2, Math.round(Math.min(W, H) * 0.008));
    const lw    = Math.max(1.0, Math.min(W, H) * 0.0025);
    for (const p of _phExpPoints) {
      if (p.v < 0 || p.v > xMax) continue;
      const px = pad.l + (p.v / xMax) * gw;
      const py = pad.t + gh - ((p.ph - yMin) / (yMax - yMin)) * gh;
      _drawExpCross(ctx, px, py, r, color, lw);
    }
    ctx.restore();
  }

  // ── Hover : snap sur point expérimental ou sur courbe modélisée ──
  //   Désactivé pendant les phases 1/2 de la méthode des tangentes.
  if (_phChartHover && !_phCursorActive && !(_phShowTangentes && _phTanCtx.phase >= 1 && _phTanCtx.phase <= 2)) {
    const { mx, my } = _phChartHover;
    if (mx >= pad.l - 10 && mx <= pad.l + gw + 10 &&
        my >= pad.t  - 10 && my <= pad.t  + gh + 10) {

      if (_phShowModelCourbe) {
        // Mode courbe modélisée : point de la courbe échantillonnée le plus proche en pixels.
        // On utilise _phSampledPts (dense autour de Veq) plutôt qu'un snap à 0.10 mL fixe,
        // ce qui assure un comportement correct dans la zone du saut de pH (courbe quasi verticale).
        let best = null, bestDist = Infinity;
        for (const p of _phSampledPts) {
          if (p.v < 0 || p.v > xMax) continue;
          const px = pad.l + (p.v / xMax) * gw;
          const py = pad.t + gh - ((p.ph - yMin) / (yMax - yMin)) * gh;
          const d  = Math.hypot(mx - px, my - py);
          if (d < bestDist) { bestDist = d; best = { px, py, p }; }
        }
        if (best && bestDist <= 24) {
          const label = `${best.p.v.toFixed(2)} mL  |  pH = ${best.p.ph.toFixed(2)}`;
          _drawHoverTooltip(ctx, pad, gw, gh, best.px, best.py, label, '#2a6aaa', W, H);
        }
      } else if (_phExpPoints && _phExpPoints.length > 0) {
        // Mode points expérimentaux : point le plus proche (≤ 24 px)
        let best = null, bestDist = Infinity;
        for (const p of _phExpPoints) {
          if (p.v < 0 || p.v > xMax) continue;
          const px = pad.l + (p.v / xMax) * gw;
          const py = pad.t + gh - ((p.ph - yMin) / (yMax - yMin)) * gh;
          const d  = Math.hypot(mx - px, my - py);
          if (d < bestDist) { bestDist = d; best = { px, py, p }; }
        }
        if (best && bestDist <= 24) {
          const bx    = best.px;
          const by    = best.py;
          const label = `${best.p.v.toFixed(2)} mL  |  pH = ${best.p.ph.toFixed(2)}`;
          _drawHoverTooltip(ctx, pad, gw, gh, bx, by, label, '#2a6aaa', W, H);
        }
      }
    }
  }

  // ── Courbe dérivée dpH/dV superposée ──
  if (_phShowDerivee && pts.length >= 3) {
    const dpts = _computeDerivee(pts);
    // On travaille sur |dpH/dV| pour gérer les deux sens (acide→base et base→acide)
    const vSeuil = xMax * 0.04;
    let maxD = 0;
    dpts.forEach(p => { const a = Math.abs(p.dphdv); if (p.v >= vSeuil && a > maxD) maxD = a; });
    if (maxD === 0) dpts.forEach(p => { const a = Math.abs(p.dphdv); if (a > maxD) maxD = a; });
    if (maxD > 0) {
      // Pic normalisé à 12 unités pH (laisse 0-1 libre en bas)
      const dScale = 12 / maxD;
      ctx.save();
      ctx.strokeStyle = '#cc4400';
      ctx.lineWidth   = Math.max(1.0, W * 0.0025);
      ctx.lineJoin    = 'round';
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.rect(pad.l, pad.t, gw, gh);
      ctx.clip();
      ctx.beginPath();
      let firstD = true;
      for (const p of dpts) {
        const phNorm = Math.min(Math.abs(p.dphdv), maxD) * dScale;  // écrêtage + valeur absolue
        const px = pad.l + (p.v / xMax) * gw;
        const py = pad.t + gh - ((phNorm - yMin) / (yMax - yMin)) * gh;
        if (firstD) { ctx.moveTo(px, py); firstD = false; }
        else        { ctx.lineTo(px, py); }
      }
      ctx.stroke();
      ctx.restore();
      // Légende dérivée
      const fsLg = Math.max(9, Math.round(Math.min(W, H) * 0.033));
      ctx.save();
      ctx.font         = `bold ${fsLg}px 'Segoe UI', Arial, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.textAlign    = 'right';
      ctx.fillStyle    = '#cc4400';
      ctx.fillText('|dpH/dV|', pad.l + gw - 4, pad.t + 4);
      ctx.restore();
    }
  }

  // ── Méthode des tangentes ──
  if (_phShowTangentes && pts.length >= 3) {
    _drawTangentesMethode(ctx, pad, gw, gh, xMax, yMin, yMax, pts);
  }

  // ── Réticule libre ──
  _drawReticule(ctx, pad, gw, gh, xMax, yMin, yMax, W, H, 'pH');

  // ── Bordure ──
  ctx.save();
  ctx.strokeStyle = '#b0a898';
  ctx.lineWidth   = 1;
  ctx.strokeRect(pad.l, pad.t, gw, gh);
  ctx.restore();
}

/** Synchronise la taille du canvas pH avec son CSS et redessine. */
function _syncPhCanvasSize() {
  const canvas = document.getElementById('titrage-chart-ph');
  if (!canvas) return;
  const w = Math.round(canvas.clientWidth);
  const h = Math.round(canvas.clientHeight);
  if (w < 1 || h < 1) return;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  _drawMainGraph();
}

/** Aiguille vers le bon draw pour le canvas principal selon le mode. */
function _drawMainGraph() {
  if (state.titrageType === 'conductimetrique') drawTitrageSigmaGraph();
  else                                          drawTitragePhGraph();
}

/** Initialise le canvas pH (hover + click + ResizeObserver) — appelé une seule fois. */
let _phResizeObserver = null;
let _phCanvasInited   = false;   // garde contre les enregistrements multiples de listeners
function initPhChartCanvas() {
  const canvas = document.getElementById('titrage-chart-ph');
  const panel  = document.getElementById('titrage-chart-ph-panel');
  if (!canvas) return;
  // Les listeners souris ne doivent être attachés qu'une seule fois : sinon
  // un clic déclencherait autant de callbacks que d'appels à initPhChartCanvas,
  // ce qui fait placer plusieurs tangentes d'un coup (bug "2 tangentes au 1er clic").
  if (_phCanvasInited) {
    // ResizeObserver seulement (peut changer si panel est recréé)
    if (!_phResizeObserver && panel) {
      _phResizeObserver = new ResizeObserver(() => requestAnimationFrame(() => {
        _syncPhCanvasSize();
        _updateGraphBtnsSize();
      }));
      _phResizeObserver.observe(panel);
    }
    return;
  }
  _phCanvasInited = true;

  canvas.addEventListener('mousemove', e => {
    const r   = canvas.getBoundingClientRect();
    const scX = canvas.clientWidth  / r.width;
    const scY = canvas.clientHeight / r.height;
    const mx  = (e.clientX - r.left) * scX;
    const my  = (e.clientY - r.top)  * scY;
    _phChartHover = { mx, my };
    _condMousePx  = { mx, my };   // toujours conservé même après mouseleave
    // Le drag conducti est géré par le listener document-level (_condLinesDragMove)
    if (_condLinesCtx.drag) return;
    _drawMainGraph();
  });

  canvas.addEventListener('mouseleave', () => {
    _phChartHover = null;
    _condLinesHandleMouseup();
    _drawMainGraph();
  });

  canvas.addEventListener('mousedown', e => {
    if (state.titrageType !== 'conductimetrique') return;
    if (!_condLinesActive || !_sigmaLayout) return;
    const r   = canvas.getBoundingClientRect();
    const scX = canvas.clientWidth  / r.width;
    const scY = canvas.clientHeight / r.height;
    const mx  = (e.clientX - r.left) * scX;
    const my  = (e.clientY - r.top)  * scY;
    const l   = _sigmaLayout;
    const started = _condLinesHandleMousedown(mx, my, l.pad, l.gw, l.gh, l.xMax, l.yMin, l.yMax);
    if (started) {
      // Capturer le drag même hors du canvas
      document.addEventListener('mousemove', _condLinesDragMove);
      document.addEventListener('mouseup',   _condLinesHandleMouseup);
    }
  });

  canvas.addEventListener('mouseup', () => {
    _condLinesHandleMouseup();
  });

  canvas.addEventListener('click', e => {
    const r   = canvas.getBoundingClientRect();
    const scX = canvas.clientWidth  / r.width;
    const scY = canvas.clientHeight / r.height;
    const mx  = (e.clientX - r.left) * scX;
    const my  = (e.clientY - r.top)  * scY;

    // Mode "Tracer des droites" (conducti) — prioritaire
    if (state.titrageType === 'conductimetrique' && _condLinesActive && _sigmaLayout) {
      if (_condLinesCtx.phase >= 1 && _condLinesCtx.phase <= 4) {
        const l = _sigmaLayout;
        _condLinesHandleClick(mx, my, l.pad, l.gw, l.gh, l.xMax, l.yMin, l.yMax);
        return;
      }
    }
    // Mode "Méthode des tangentes" (pH)
    if (!_phShowTangentes) return;
    if (_phTanCtx.phase !== 1 && _phTanCtx.phase !== 2) return;
    _phHandleTangenteClick(mx, my);
    drawTitragePhGraph();
  });

  if (!_phResizeObserver && panel) {
    _phResizeObserver = new ResizeObserver(() => requestAnimationFrame(() => {
      _syncPhCanvasSize();
      _updateGraphBtnsSize();
    }));
    _phResizeObserver.observe(panel);
  }
}

/**
 * Convertit la position canvas (mx, my) en coordonnées (V, pH) du graphe.
 * Renvoie null si en dehors de la zone de tracé.
 */
function _phPxToVPh(mx, my) {
  const canvas = document.getElementById('titrage-chart-ph');
  if (!canvas) return null;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const dim   = Math.min(W, H);
  const pad   = { l: Math.round(dim * 0.10), r: Math.round(dim * 0.04),
                  t: Math.round(dim * 0.08), b: Math.round(dim * 0.12) };
  const gw = W - pad.l - pad.r;
  const gh = H - pad.t - pad.b;
  if (gw <= 0 || gh <= 0) return null;
  if (mx < pad.l || mx > pad.l + gw || my < pad.t || my > pad.t + gh) return null;

  const vVerse = state.titrageVverse ?? 0;
  let xMax = BURETTE.MAX_ML;
  if (vVerse > xMax) xMax = vVerse;
  xMax = Math.ceil(xMax / 5) * 5;
  const yMin = 0, yMax = 14;

  const v  = ((mx - pad.l) / gw) * xMax;
  const ph = yMin + (1 - (my - pad.t) / gh) * (yMax - yMin);
  return { v, ph };
}

/**
 * Gère un clic dans le canvas pendant les phases 1 ou 2 de la méthode des
 * tangentes.
 *   Phase 1 → fige la tangente 1 sur la courbe au volume sous le curseur
 *             (pente = dpH/dV évaluée numériquement).
 *   Phase 2 → fige la tangente 2 à la position libre du curseur (V, pH)
 *             avec la même pente que la tangente 1.
 */
function _phHandleTangenteClick(mx, my) {
  if (_phTanCtx.phase === 1) {
    // Utiliser le V mémorisé par l'aperçu hover (point le plus proche du
    // curseur sur la courbe au sens distance pixels). Si pas dispo, fallback
    // sur la projection verticale.
    let v = _phTanCtx._previewV;
    if (v === undefined || v === null) {
      const pos = _phPxToVPh(mx, my);
      if (!pos) return;
      v = pos.v;
    }
    const ph = calcPHAtVolume(v);
    const dv = 0.02;
    const slope = (calcPHAtVolume(v + dv) - calcPHAtVolume(v - dv)) / (2 * dv);
    _phTanCtx.t1    = { v, ph };
    _phTanCtx.slope = slope;
    _phTanCtx.phase = 2;
    delete _phTanCtx._previewV;
  } else if (_phTanCtx.phase === 2) {
    const pos = _phPxToVPh(mx, my);
    if (!pos) return;
    _phTanCtx.t2    = { v: pos.v, ph: pos.ph };
    _phTanCtx.phase = 3;
  }
}

/* ── Dessin ─────────────────────────────────────────────────────────────── */

function drawTitrageGraph() {
  const canvas = document.getElementById('titrage-chart');
  if (!canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0) return;
  const ctx = canvas.getContext('2d');
  const W   = canvas.clientWidth;
  const H   = canvas.clientHeight;

  // ── Plages ──
  let xMax = BURETTE.MAX_ML; // 25 mL fixe par défaut
  _chartEspeces.forEach(e => {
    const pts = _chartPoints[e.id];
    if (pts && pts.length) xMax = Math.max(xMax, pts[pts.length - 1].x);
  });
  xMax = Math.ceil(xMax / 5) * 5;

  const nTitreeInit = state.titrageConcTitree * (state.titrageV1 / 1000);
  let yMax = nTitreeInit * 2 || 0.002;
  _chartEspeces.forEach(e => {
    if (!_chartVisible[e.id]) return;
    (_chartPoints[e.id] || []).forEach(p => { yMax = Math.max(yMax, p.n); });
  });
  yMax *= 1.08;

  const { scale: yScale, label: yUnit } = _yScale(yMax);

  // ── Taille de police : basée sur la plus petite dimension ──
  const dim = Math.min(W, H);
  const fs  = Math.max(9,  Math.round(dim * 0.040));  // labels ticks
  const fst = Math.max(10, Math.round(dim * 0.044));  // titre axe

  // ── Padding calculé depuis les besoins réels ──
  //
  // pad.l : largeur max label Y + tick (4) + gap (7)
  // pad.r : symétrique de pad.l
  // pad.b : tick (4) + gap (6) + hauteur label X (fs) + gap (6) + titre X (fst) + marge (4)
  // pad.t : symétrique de pad.b  →  "n" + unité tiennent dans cet espace
  const tickLabelW = Math.round(fs * 3.2);
  const padL = tickLabelW + 4 + 7 + Math.round(fst * 0.3);
  const padR = padL;
  const padB = 4 + 6 + fs + 6 + fst + 4;   // tick + gap + label + gap + titre + marge
  const padT = 2 + fst + 2 + fs + 4;        // top marge + "n" + gap + unité + marge bas
  const pad  = { t: padT, r: padR, b: padB, l: padL };
  const gw = W - pad.l - pad.r;
  const gh = H - pad.t - pad.b;
  if (gw < 40 || gh < 40) return;

  // ── Nombre de graduations (peu !) ──
  const nTicksX = Math.max(3, Math.min(6, Math.round(gw / 80)));
  const nTicksY = Math.max(3, Math.min(5, Math.round(gh / 70)));
  const xStep   = _niceStep(xMax, nTicksX);
  const yStep   = _niceStep(yMax / yScale, nTicksY) * yScale;

  // ── Effacement ──
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fdf8f0';
  ctx.fillRect(0, 0, W, H);

  // ── Fond zone graphique ──
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(pad.l, pad.t, gw, gh);

  // ── Grille légère ──
  ctx.save();
  ctx.strokeStyle = '#ece8e2';
  ctx.lineWidth   = 1;
  for (let x = xStep; x <= xMax + xStep * 0.01; x += xStep) {
    const px = pad.l + (x / xMax) * gw;
    ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, pad.t + gh); ctx.stroke();
  }
  for (let y = yStep; y <= yMax + yStep * 0.01; y += yStep) {
    const py = pad.t + gh - (y / yMax) * gh;
    ctx.beginPath(); ctx.moveTo(pad.l, py); ctx.lineTo(pad.l + gw, py); ctx.stroke();
  }
  ctx.restore();

  // ── Axes ──
  ctx.save();
  ctx.strokeStyle = '#2d3748';
  ctx.lineWidth   = 1.8;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, pad.t + gh);
  ctx.lineTo(pad.l + gw, pad.t + gh);
  ctx.stroke();
  ctx.restore();

  // ── Ticks + labels axe X ──
  ctx.save();
  ctx.fillStyle    = '#4a5568';
  ctx.font         = `${fs}px 'Segoe UI', Arial, sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.strokeStyle  = '#4a5568';
  ctx.lineWidth    = 1;
  for (let x = 0; x <= xMax + xStep * 0.01; x += xStep) {
    const px = pad.l + (x / xMax) * gw;
    ctx.beginPath(); ctx.moveTo(px, pad.t + gh); ctx.lineTo(px, pad.t + gh + 4); ctx.stroke();
    ctx.fillText(x % 1 === 0 ? x.toFixed(0) : x.toFixed(1), px, pad.t + gh + 6);
  }
  // Titre axe X : tick(4) + gap(6) + label(fs) + gap(6) + centré sur fst
  ctx.font      = `bold ${fst}px 'Segoe UI', Arial, sans-serif`;
  ctx.fillStyle = '#2d3748';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  const titleXY = pad.t + gh + 4 + 6 + fs + 6;
  ctx.fillText('V versé (mL)', pad.l + gw / 2, titleXY);
  ctx.restore();

  // ── Ticks + labels axe Y ──
  ctx.save();
  ctx.fillStyle    = '#4a5568';
  ctx.font         = `${fs}px 'Segoe UI', Arial, sans-serif`;
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle  = '#4a5568';
  ctx.lineWidth    = 1;
  for (let y = 0; y <= yMax + yStep * 0.01; y += yStep) {
    const py = pad.t + gh - (y / yMax) * gh;
    ctx.beginPath(); ctx.moveTo(pad.l, py); ctx.lineTo(pad.l - 4, py); ctx.stroke();
    ctx.fillText(_fmtY(y, yScale), pad.l - 7, py);
  }
  ctx.restore();

  // ── Label axe Y : "n" + unité dans pad.t, alignés à gauche sur l'axe Y ──
  ctx.save();
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.font         = `bold ${fst}px 'Segoe UI', Arial, sans-serif`;
  ctx.fillStyle    = '#2d3748';
  ctx.fillText('n', pad.l, 2);
  ctx.font      = `${fs}px 'Segoe UI', Arial, sans-serif`;
  ctx.fillStyle = '#4a5568';
  ctx.fillText(yUnit, pad.l, 2 + fst + 2);
  ctx.restore();

  // ── Courbes ──
  _chartEspeces.forEach(e => {
    if (!_chartVisible[e.id]) return;
    const pts = _chartPoints[e.id];
    if (!pts || pts.length < 1) return;
    const color = MOL_COLORS[e.id] || '#888';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = Math.max(1.2, W * 0.003);
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.shadowBlur  = 0;
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, gw, gh);
    ctx.clip();
    ctx.beginPath();
    let first = true;
    for (const p of pts) {
      const px = pad.l + (p.x / xMax) * gw;
      const py = pad.t + gh - (p.n  / yMax) * gh;
      if (first) { ctx.moveTo(px, py); first = false; }
      else        { ctx.lineTo(px, py); }
    }
    ctx.stroke();
    ctx.restore();
  });

  // ── Hover : snap sur grille dense 0.10 mL (indépendant de la granularité versée) ──
  if (_chartHover) {
    const { mx, my } = _chartHover;
    if (mx >= pad.l - 10 && mx <= pad.l + gw + 10 &&
        my >= pad.t  - 10 && my <= pad.t  + gh + 10) {

      // Convertir la position souris en volume (coordonnée X)
      const vMouse = ((mx - pad.l) / gw) * xMax;

      // Snap au multiple de 0.10 mL le plus proche dans [0, xMax]
      const STEP  = 0.10;
      const vSnap = Math.max(0, Math.min(xMax, Math.round(vMouse / STEP) * STEP));

      // Calculer les valeurs de toutes les espèces à ce volume
      const vals = _calcPointAt(vSnap);

      let bestColor = '#2a6aaa';
      let bestDist  = Infinity;
      let bestEsp   = null;
      let bestN     = 0;

      // Volume max effectivement tracé (ne pas détecter au-delà)
      const vTracé = state.titrageVverse ?? 0;
      if (vSnap > vTracé + 1e-9) {
        // Aucune courbe tracée à ce point — pas de tooltip
      } else {

      _chartEspeces.forEach(e => {
        if (!_chartVisible[e.id]) return;
        const n  = vals[e.id] ?? 0;
        const px = pad.l + (vSnap / xMax) * gw;
        const py = pad.t + gh - (n / yMax) * gh;
        const d  = Math.hypot(px - mx, py - my);
        if (d < bestDist) {
          bestDist  = d;
          bestColor = MOL_COLORS[e.id] || '#888';
          bestEsp   = e;
          bestN     = n;
        }
      });

      if (bestEsp && bestDist < 40) {
        const bx = pad.l + (vSnap / xMax) * gw;
        const by = Math.max(pad.t, Math.min(pad.t + gh, pad.t + gh - (bestN / yMax) * gh));

        // Lignes pointillées vers axes
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(60,60,60,0.45)';
        ctx.lineWidth   = 1;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, pad.t + gh); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(pad.l, by);      ctx.stroke();
        ctx.setLineDash([]);

        // Point snappé
        ctx.fillStyle = bestColor;
        ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.stroke();

        // Tooltip
        const xLbl = vSnap.toFixed(2) + ' mL';
        const yLbl = (bestN / yScale).toFixed(2) + ' ' + yUnit;
        const label = `${xLbl}  |  ${yLbl}`;
        const ttFs  = Math.max(11, Math.round(Math.min(W, H) * 0.038));
        ctx.font = `bold ${ttFs}px 'Segoe UI', Arial, sans-serif`;
        const lw   = ctx.measureText(label).width;
        const pad2 = 6;
        const ttW  = lw + pad2 * 2;
        const ttH  = ttFs + pad2 * 2;

        // Choisir le côté : droite si assez de place, sinon gauche, en garantissant
        // que le tooltip reste dans [pad.l … pad.l+gw]
        const spaceRight = pad.l + gw - (bx + 12);
        const spaceLeft  = bx - 12 - pad.l;
        let lx = (spaceRight >= ttW || spaceRight >= spaceLeft)
                   ? bx + 12
                   : bx - 12 - ttW;
        // Clamp final pour ne jamais déborder
        lx = Math.max(pad.l, Math.min(pad.l + gw - ttW, lx));

        let ly = by - ttFs - 8;
        if (ly - pad2 < pad.t) ly = by + 10;

        // Fond tooltip
        ctx.fillStyle = 'rgba(255,255,255,0.93)';
        ctx.strokeStyle = bestColor;
        ctx.lineWidth = 1.5;
        const rr = 4;
        const tx = lx - pad2, ty = ly - pad2;
        ctx.beginPath();
        ctx.roundRect(tx, ty, ttW, ttH, rr);
        ctx.fill(); ctx.stroke();

        // Texte tooltip
        ctx.fillStyle    = '#1a2535';
        ctx.textBaseline = 'top';
        ctx.textAlign    = 'left';
        ctx.fillText(label, lx, ly);

        ctx.restore();
      }
      } // fin else (vSnap <= vTracé)
    }
  }

  // ── Bordure ──
  ctx.save();
  ctx.strokeStyle = '#b0a898';
  ctx.lineWidth   = 1;
  ctx.strokeRect(pad.l, pad.t, gw, gh);
  ctx.restore();
}

/* ── Légende ────────────────────────────────────────────────────────────── */

function buildChartLegende() {
  const container = document.getElementById('titrage-legende');
  if (!container) return;
  container.innerHTML = '';

  const groupes = [
    { label: 'Réactifs',             roles: ['titree', 'titrante', 'reactif'] },
    { label: 'Produits',             roles: ['produit', 'precipite'] },
    { label: 'Espèces spectatrices', roles: ['spectateur'] },
  ];

  groupes.forEach(groupe => {
    const especes = _chartEspeces.filter(e => groupe.roles.includes(e.role));
    if (especes.length === 0) return;

    const row = document.createElement('div');
    row.className = 'chart-legend-row';

    // Colonne gauche : nom de la section
    const cellLabel = document.createElement('div');
    cellLabel.className   = 'chart-legend-cell-label';
    cellLabel.textContent = groupe.label;

    // Colonne droite : items
    const cellItems = document.createElement('div');
    cellItems.className = 'chart-legend-cell-items';

    const itemsWrap = document.createElement('div');
    itemsWrap.className = 'chart-legend-items';

    especes.forEach(e => {
      const color   = MOL_COLORS[e.id] || '#888';
      const checked = _chartVisible[e.id] !== false;

      const lbl = document.createElement('label');
      lbl.className = 'chart-legend-item' + (checked ? '' : ' unchecked');

      const cb = document.createElement('input');
      cb.type    = 'checkbox';
      cb.checked = checked;
      cb.addEventListener('change', () => {
        _chartVisible[e.id] = cb.checked;
        lbl.classList.toggle('unchecked', !cb.checked);
        drawTitrageGraph();
        _chartAdjustCanvasToLegend();
      });

      const swatch = document.createElement('span');
      swatch.className        = 'chart-legend-swatch';
      swatch.style.background = color;

      const txt = document.createElement('span');
      txt.className   = 'chart-legend-text';
      txt.style.color = color;
      txt.textContent = e.label;

      lbl.appendChild(cb);
      lbl.appendChild(swatch);
      lbl.appendChild(txt);
      itemsWrap.appendChild(lbl);
    });

    cellItems.appendChild(itemsWrap);
    row.appendChild(cellLabel);
    row.appendChild(cellItems);
    container.appendChild(row);
  });

  requestAnimationFrame(_syncCanvasSize);
}


/* ── Resize ─────────────────────────────────────────────────────────────── */

let _chartResizeObserver = null;

/**
 * Synchronise les attributs width/height du canvas avec sa taille CSS réelle.
 * Le canvas est non-carré : il remplit clientWidth × clientHeight du panel
 * (la légende est en dessous avec sa propre hauteur fixe).
 */
function _syncCanvasSize() {
  const canvas = document.getElementById('titrage-chart');
  if (!canvas) return;
  const w = Math.round(canvas.clientWidth);
  const h = Math.round(canvas.clientHeight);
  if (w < 1 || h < 1) return;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  drawTitrageGraph();
}

let _chartCanvasInited = false;
function initChartCanvas() {
  const canvas = document.getElementById('titrage-chart');
  const panel  = document.getElementById('titrage-chart-panel');
  if (!canvas) return;
  if (_chartCanvasInited) {
    if (!_chartResizeObserver && panel) {
      _chartResizeObserver = new ResizeObserver(() => requestAnimationFrame(_syncCanvasSize));
      _chartResizeObserver.observe(panel);
    }
    return;
  }
  _chartCanvasInited = true;

  // ── Hover souris ──
  canvas.addEventListener('mousemove', e => {
    const r   = canvas.getBoundingClientRect();
    const scX = canvas.clientWidth  / r.width;
    const scY = canvas.clientHeight / r.height;
    _chartHover = { mx: (e.clientX - r.left) * scX, my: (e.clientY - r.top) * scY };
    drawTitrageGraph();
  });
  canvas.addEventListener('mouseleave', () => { _chartHover = null; drawTitrageGraph(); });

  // ── ResizeObserver sur le panel ──
  if (!_chartResizeObserver && panel) {
    _chartResizeObserver = new ResizeObserver(() => requestAnimationFrame(_syncCanvasSize));
    _chartResizeObserver.observe(panel);
  }
}

/** Appelé par reinitialiserTitrage — rien à faire, le canvas suit le CSS. */
function resetChartSize() {
  requestAnimationFrame(_syncCanvasSize);
}

/* ══════════════════════════════════════════════════════════════════════════
   BOUTONS ANALYTIQUES pH — Courbe dérivée & Méthode des tangentes
   Activables uniquement quand V versé >= Veq + 5 mL.
══════════════════════════════════════════════════════════════════════════ */

/** Bascule l'affichage de la courbe modélisée (pH ou σ selon le mode). */
function toggleModelCourbe() {
  const btn = document.getElementById('btn-modeliser-courbe');
  if (!btn) return;
  _phShowModelCourbe = !_phShowModelCourbe;
  btn.classList.toggle('active', _phShowModelCourbe);
  _drawMainGraph();
}

/** Bascule la coloration du fond du graphe pH selon l'indicateur coloré actif. */
function togglePhIndicateur() {
  const btn = document.getElementById('btn-ph-indicateur');
  if (!btn || btn.disabled) return;
  _phShowIndicateur = !_phShowIndicateur;
  btn.classList.toggle('active', _phShowIndicateur);
  drawTitragePhGraph();
}

/**
 * Met à jour l'état enabled/disabled des boutons analytiques.
 * Appelé à chaque ajout de titrant et à la réinitialisation.
 */
function updatePhAnalysisBtns() {
  const btnD = document.getElementById('btn-courbe-derivee');
  const btnT = document.getElementById('btn-methode-tangentes');
  const btnM = document.getElementById('btn-modeliser-courbe');
  if (!btnD || !btnT) return;

  const Ca  = state.titrageConcTitree;
  const Cb  = state.titrageConcTitrante;
  const V1  = state.titrageV1;
  const vEq = (Cb > 0) ? (Ca * V1 / Cb) : null;
  const vVerse = state.titrageVverse ?? 0;
  const canActivate = (vEq !== null) && (vVerse >= vEq + 5);

  btnD.disabled = !canActivate;
  btnT.disabled = !canActivate;

  // Si on désactive alors que les modes étaient actifs, on les coupe
  if (!canActivate) {
    if (_phShowDerivee)   { _phShowDerivee   = false; btnD.classList.remove('active'); }
    if (_phShowTangentes) { _phShowTangentes = false; btnT.classList.remove('active'); }
  }

  // "Modéliser la courbe" : toujours actif, mais on le remet à off à la
  // réinitialisation (vVerse == 0 après reinitialiserTitrage).
  if (vVerse === 0 && _phShowModelCourbe) {
    _phShowModelCourbe = false;
    if (btnM) btnM.classList.remove('active');
  }

  // "Indicateur coloré" : activable uniquement si un indicateur est sélectionné.
  // Désactivé (et coupé) à la réinitialisation ou si l'indicateur est retiré.
  const btnI = document.getElementById('btn-ph-indicateur');
  if (btnI) {
    const hasIndic = state.titrageIndicateur !== null;
    btnI.disabled = !hasIndic;
    if (!hasIndic && _phShowIndicateur) {
      _phShowIndicateur = false;
      btnI.classList.remove('active');
    }
  }

  // "Tracer des droites" : reset à la réinitialisation
  if (vVerse === 0 && _condLinesActive) {
    _condLinesActive = false;
    _condLinesCtx    = _condLinesInitCtx();
    const btnTD = document.getElementById('btn-tracer-droites');
    if (btnTD) btnTD.classList.remove('active');
  }
}

/** Bascule l'affichage de la courbe dérivée dpH/dV. */
function toggleCourbeDerivee() {
  const btn = document.getElementById('btn-courbe-derivee');
  if (!btn || btn.disabled) return;
  _phShowDerivee = !_phShowDerivee;
  btn.classList.toggle('active', _phShowDerivee);
  drawTitragePhGraph();
}

/**
 * Bascule l'affichage de la méthode des tangentes.
 * À chaque clic : reset complet → phase 1 (l'utilisateur recommence la
 * construction depuis le début). Recliquer alors qu'une construction est
 * affichée la supprime et la recommence.
 */
function toggleMethodeTangentes() {
  const btn = document.getElementById('btn-methode-tangentes');
  if (!btn || btn.disabled) return;
  if (_phShowTangentes) {
    _phShowTangentes = false;
    _phTanCtx = { phase: 0, slope: 0, t1: null, t2: null };
    btn.classList.remove('active');
  } else {
    _phShowTangentes = true;
    _phTanCtx = { phase: 1, slope: 0, t1: null, t2: null };
    btn.classList.add('active');
  }
  drawTitragePhGraph();
}

/** Bascule le mode réticule libre (curseur libre sur le graphe pH). */
function togglePhCursor() {
  const btn = document.getElementById('btn-ph-cursor');
  if (!btn) return;
  _phCursorActive = !_phCursorActive;
  btn.classList.toggle('active', _phCursorActive);
  if (!_phCursorActive) {
    const tooltip = document.getElementById('ph-reticule-tooltip');
    if (tooltip) tooltip.style.display = 'none';
  }
  _drawMainGraph();
}

/**
 * Calcule la dérivée numérique dpH/dV à partir d'un tableau de points { v, ph }.
 * Utilise les différences centrales sauf aux extrémités (différences unilatérales).
 * Renvoie un tableau { v, dphdv }.
 */
function _computeDerivee(pts) {
  if (pts.length < 2) return [];
  const result = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    let dphdv;
    if (i === 0) {
      dphdv = (pts[1].ph - pts[0].ph) / (pts[1].v - pts[0].v || 1e-9);
    } else if (i === n - 1) {
      dphdv = (pts[n-1].ph - pts[n-2].ph) / (pts[n-1].v - pts[n-2].v || 1e-9);
    } else {
      dphdv = (pts[i+1].ph - pts[i-1].ph) / (pts[i+1].v - pts[i-1].v || 1e-9);
    }
    result.push({ v: pts[i].v, dphdv });
  }
  return result;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Méthode des tangentes — construction INTERACTIVE en 3 phases.
 *
 *   Phase 1 : l'utilisateur survole la courbe, voit la tangente locale en
 *             pointillés et clique pour la figer.
 *   Phase 2 : la 1ʳᵉ tangente reste fixe ; on affiche une 2ᵉ droite parallèle
 *             passant par le curseur (n''importe où dans la zone graphique).
 *             Clic pour figer.
 *   Phase 3 : tracé automatique du segment perpendiculaire commun [AB] aux
 *             deux tangentes et de la médiatrice de [AB] (parallèle aux
 *             tangentes), avec marques d''angle droit et de longueurs égales.
 *             Aucune étiquette : c''est à l''élève de hover l''intersection
 *             médiatrice/courbe pour lire Veq via le tooltip de point courant.
 * ───────────────────────────────────────────────────────────────────────── */

function _drawTangentesMethode(ctx, pad, gw, gh, xMax, yMin, yMax, pts) {
  if (!_phShowTangentes) return;
  const phase = _phTanCtx.phase;
  if (phase < 1) return;

  // Helpers de conversion (V, pH) ↔ pixels canvas
  const toX = v  => pad.l + (v  / xMax) * gw;
  const toY = ph => pad.t + gh - ((ph - yMin) / (yMax - yMin)) * gh;

  // Échelles pixel pour la "perpendicularité visuelle"
  const sx = gw / xMax;                 // px / mL
  const sy = gh / (yMax - yMin);        // px / unité pH

  // ── Tracé d''une droite math y = slope·V + b, clippée à la zone graphe ──
  function drawLineMath(slope, b, color, dash, lineWidth) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, gw, gh);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth   = lineWidth;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(toX(0),    toY(slope * 0    + b));
    ctx.lineTo(toX(xMax), toY(slope * xMax + b));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Tangente 1 figée
  if (_phTanCtx.t1) {
    const { v, ph } = _phTanCtx.t1;
    const b1 = ph - _phTanCtx.slope * v;
    drawLineMath(_phTanCtx.slope, b1, '#c05020', [7, 4], 2);
    // Petit marqueur du point de tangence sur la courbe
    ctx.save();
    ctx.fillStyle = '#c05020';
    ctx.beginPath(); ctx.arc(toX(v), toY(ph), 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(toX(v), toY(ph), 4, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ── Phase 1 : aperçu hover de la tangente locale ──
  //   On cherche le point de la courbe le plus proche du curseur AU SENS
  //   DISTANCE PIXELS (pas en V), pour que l'aperçu corresponde vraiment au
  //   point que l'utilisateur vise visuellement. Sans cela, dans la zone du
  //   saut quasi-vertical, projeter verticalement (V du curseur) tomberait
  //   au milieu du saut quel que soit le pH visé par l'utilisateur.
  if (phase === 1 && _phChartHover) {
    const { mx, my } = _phChartHover;
    // Échantillonner la courbe finement et chercher le point le plus proche
    let bestV = null, bestD2 = Infinity;
    const xMaxLoc = xMax;
    const NSTEP = 600;
    for (let i = 0; i <= NSTEP; i++) {
      const v  = (i / NSTEP) * xMaxLoc;
      const ph = calcPHAtVolume(v);
      const dx = toX(v) - mx;
      const dy = toY(ph) - my;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; bestV = v; }
    }
    // Affinage : recherche locale autour du meilleur point
    if (bestV !== null) {
      const dvFine = xMaxLoc / NSTEP;
      for (let k = 0; k < 4; k++) {
        const step = dvFine / Math.pow(5, k);
        for (let s = -5; s <= 5; s++) {
          const v = bestV + s * step;
          if (v < 0 || v > xMaxLoc) continue;
          const ph = calcPHAtVolume(v);
          const dx = toX(v) - mx;
          const dy = toY(ph) - my;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) { bestD2 = d2; bestV = v; }
        }
      }
      const vH  = bestV;
      const phH = calcPHAtVolume(vH);
      const dv  = 0.02;
      const sl  = (calcPHAtVolume(vH + dv) - calcPHAtVolume(vH - dv)) / (2 * dv);
      const bH  = phH - sl * vH;
      drawLineMath(sl, bH, 'rgba(192, 80, 32, 0.55)', [5, 4], 1.5);
      // Marqueur du point sur la courbe
      ctx.save();
      ctx.fillStyle = 'rgba(192, 80, 32, 0.85)';
      ctx.beginPath(); ctx.arc(toX(vH), toY(phH), 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // Mémoriser pour qu'un clic utilise ce même point
      _phTanCtx._previewV = vH;
    }
    return;
  }

  // ── Phase 2 : aperçu hover de la droite parallèle ──
  if (phase === 2 && _phChartHover) {
    const pos = _phPxToVPh(_phChartHover.mx, _phChartHover.my);
    if (pos) {
      const b2H = pos.ph - _phTanCtx.slope * pos.v;
      drawLineMath(_phTanCtx.slope, b2H, 'rgba(192, 80, 32, 0.55)', [5, 4], 1.5);
    }
    return;
  }

  // Tangente 2 figée (phase 3)
  if (_phTanCtx.t2) {
    const { v, ph } = _phTanCtx.t2;
    const b2 = ph - _phTanCtx.slope * v;
    drawLineMath(_phTanCtx.slope, b2, '#c05020', [7, 4], 2);
  }

  // ── Phase 3 : segment perpendiculaire commun + médiatrice parallèle ──
  if (phase !== 3 || !_phTanCtx.t1 || !_phTanCtx.t2) return;

  const slope = _phTanCtx.slope;
  const b1 = _phTanCtx.t1.ph - slope * _phTanCtx.t1.v;
  const b2 = _phTanCtx.t2.ph - slope * _phTanCtx.t2.v;

  // Vecteur directeur des tangentes en pixels
  const dirX = sx;
  const dirY = -slope * sy;       // (axe Y inversé en canvas)
  const dirLen = Math.hypot(dirX, dirY) || 1;
  // Vecteur perpendiculaire (rotation +90° en repère pixels)
  const perpX = -dirY / dirLen;
  const perpY =  dirX / dirLen;

  // Point de référence A = projection du curseur sur la tangente 1 ?
  //   On choisit un point central : V = (v1 + v2) / 2, sur la tangente 1.
  const vMid = (_phTanCtx.t1.v + _phTanCtx.t2.v) / 2;
  const Ax = toX(vMid);
  const Ay = toY(slope * vMid + b1);

  // B = intersection de la perpendiculaire issue de A avec la tangente 2.
  //   La perpendiculaire est paramétrée P(t) = A + t * (perpX, perpY).
  //   Elle doit satisfaire (en repère math) : phB = slope * vB + b2.
  //   Or vB = (Ax + t*perpX - pad.l) / sx · ... → plus simple : on résout
  //   directement en pixels la condition "P est sur la tangente 2".
  //
  //   Tangente 2 en pixels : son vecteur directeur est (dirX, dirY) issu d''un
  //   point connu, ex. (toX(t2.v), toY(t2.ph)) = T2px. Un point P est sur la
  //   tangente 2 ssi (P − T2px) est colinéaire à (dirX, dirY), i.e.
  //   (P.x − T2x) * dirY − (P.y − T2y) * dirX = 0.
  const T2x = toX(_phTanCtx.t2.v);
  const T2y = toY(_phTanCtx.t2.ph);
  //   Pour P = A + t*perp :
  //     (Ax + t*perpX − T2x) * dirY − (Ay + t*perpY − T2y) * dirX = 0
  //   ⇒ t = [(T2x − Ax)*dirY − (T2y − Ay)*dirX] / (perpX*dirY − perpY*dirX)
  const denom = perpX * dirY - perpY * dirX;
  if (Math.abs(denom) < 1e-6) return;
  const tB = ((T2x - Ax) * dirY - (T2y - Ay) * dirX) / denom;
  const Bx = Ax + tB * perpX;
  const By = Ay + tB * perpY;

  // Milieu M de [AB] et médiatrice (parallèle aux tangentes)
  const Mx = (Ax + Bx) / 2;
  const My = (Ay + By) / 2;

  // ── 1. Segment perpendiculaire [AB] ──
  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.l, pad.t, gw, gh);
  ctx.clip();
  ctx.strokeStyle = '#7733bb';
  ctx.lineWidth   = 1.6;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(Ax, Ay);
  ctx.lineTo(Bx, By);
  ctx.stroke();
  ctx.restore();

  // ── 2. Médiatrice : longue droite passant par M, parallèle aux tangentes ──
  const L = Math.hypot(gw, gh) * 2;
  // Vecteur directeur unitaire des tangentes en pixels
  const uX = dirX / dirLen;
  const uY = dirY / dirLen;
  const med1x = Mx - uX * L, med1y = My - uY * L;
  const med2x = Mx + uX * L, med2y = My + uY * L;
  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.l, pad.t, gw, gh);
  ctx.clip();
  ctx.strokeStyle = '#7733bb';
  ctx.lineWidth   = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(med1x, med1y);
  ctx.lineTo(med2x, med2y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // ── 3. Symboles d''angle droit aux extrémités A et B ──
  //   On dessine un petit carré formé des vecteurs perpendiculaire (vers M)
  //   et parallèle aux tangentes, taille = ~9 px.
  function drawRightAngle(px, py, perpDirX, perpDirY) {
    const s = 9;
    // Vecteur "le long de la tangente" unitaire = (uX, uY)
    // Vecteur "vers M" unitaire = (perpDirX, perpDirY)
    const p1x = px + perpDirX * s, p1y = py + perpDirY * s;
    const p2x = p1x + uX * s,      p2y = p1y + uY * s;
    const p3x = px + uX * s,       p3y = py + uY * s;
    ctx.save();
    ctx.strokeStyle = '#7733bb';
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.lineTo(p3x, p3y);
    ctx.stroke();
    ctx.restore();
  }
  // Direction "de A vers M" et "de B vers M" (en repère pixels)
  {
    const dAMx = Mx - Ax, dAMy = My - Ay;
    const lAM  = Math.hypot(dAMx, dAMy) || 1;
    drawRightAngle(Ax, Ay, dAMx / lAM, dAMy / lAM);
    const dBMx = Mx - Bx, dBMy = My - By;
    const lBM  = Math.hypot(dBMx, dBMy) || 1;
    drawRightAngle(Bx, By, dBMx / lBM, dBMy / lBM);
  }

  // ── 4. Marques de longueurs égales sur [AM] et [MB] ──
  //   Petit tiret perpendiculaire au segment, centré au milieu de chaque
  //   demi-segment.
  function drawEqualMark(cx, cy, segUx, segUy) {
    const len = 6;
    // Perpendiculaire au segment (rotation +90° pixels)
    const nx = -segUy, ny = segUx;
    ctx.save();
    ctx.strokeStyle = '#7733bb';
    ctx.lineWidth   = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - nx * len, cy - ny * len);
    ctx.lineTo(cx + nx * len, cy + ny * len);
    ctx.stroke();
    ctx.restore();
  }
  // Vecteur unitaire le long de [AB]
  {
    const ABx = Bx - Ax, ABy = By - Ay;
    const lAB = Math.hypot(ABx, ABy) || 1;
    const ux  = ABx / lAB, uy = ABy / lAB;
    // Milieux de [AM] et [MB]
    const cAMx = (Ax + Mx) / 2, cAMy = (Ay + My) / 2;
    const cBMx = (Bx + Mx) / 2, cBMy = (By + My) / 2;
    drawEqualMark(cAMx, cAMy, ux, uy);
    drawEqualMark(cBMx, cBMy, ux, uy);
  }
}
