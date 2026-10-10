/* ══════════════════════════════════════════════════════════════════════════
   Simulation pédagogique — Physique-Chimie Lycée
   Auteur  : Mathieu Berdous
   Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   zoom.js — Caméra 2D des graphes du mode Titrage (pH=f(V), σ=f(V), n=f(V)) :
   zoom molette / pincement + déplacement au glisser, comme sur une carte.

   • Axe X (V, mL) : une fenêtre `_zoomX` PARTAGÉE par tous les graphes.
   • Axe Y : une fenêtre `_zoomY[clé]` PROPRE à chaque graphe ('ph' | 'sigma' | 'n'),
     en coordonnées de données. Elle ne dépend JAMAIS des données affichées (pas
     d'autoscale en zoom) : seul l'utilisateur la change, la vue est stable.
     Les graduations, elles, s'adaptent à l'échelle affichée.
   • Molette / pincement : X et Y zoomés ensemble, même facteur, centrés sur le
     curseur (le point visé reste en place). Maj + molette : Y seul.
   • Glisser : déplacement 2D, borné à la plage complète de chaque axe.
   • `null` / absence d'état = pas de zoom sur l'axe : plage complète, avec
     l'autoscale historique (qui suit le volume versé).
   • Largeur X minimale : ZOOM_MIN_SPAN mL ; hauteur Y minimale : 1/ZOOM_Y_MAX_FACTOR
     de la plage complète.
   • Chargé APRÈS sim.js et AVANT graph.js.
══════════════════════════════════════════════════════════════════════════ */

const ZOOM_MIN_SPAN     = 1;      // mL — zoom X maximal (≈ 1 mL entre bord gauche et bord droit)
const ZOOM_Y_MAX_FACTOR = 1000;   // zoom Y maximal (plage complète / 1000)
let _zoomX = null;                // { min, max } en mL, ou null (pas de zoom)
let _zoomY = {};                  // clé → { lo, hi } en unités du graphe (absent = plage complète)
let _zoomPanning = false;         // glisser en cours (curseur « grabbing »)

/* ── Fenêtres de vue ────────────────────────────────────────────────────── */

/** Fenêtre X effective pour un axe complet [0, xFull]. */
function _zoomView(xFull) {
  if (_zoomX) {
    const w = Math.min(_zoomX.max - _zoomX.min, xFull);
    if (w < xFull - 1e-9) {
      const x0 = Math.max(0, Math.min(_zoomX.min, xFull - w));
      return { x0, x1: x0 + w, zoomed: true };
    }
  }
  return { x0: 0, x1: xFull, zoomed: false };
}

/**
 * Fenêtre Y effective du graphe `key` pour la plage complète `yFull` {lo, hi}.
 * `factor` = plage complète / plage affichée (1 sans zoom).
 */
function _zoomYView(key, yFull) {
  const full = yFull.hi - yFull.lo;
  const st = _zoomY[key];
  if (st && full > 0) {
    const span = Math.min(st.hi - st.lo, full);
    if (span < full * (1 - 1e-9)) {
      const lo = Math.max(yFull.lo, Math.min(st.lo, yFull.hi - span));
      return { lo, hi: lo + span, zoomed: true, factor: full / span };
    }
    delete _zoomY[key];
  }
  return { lo: yFull.lo, hi: yFull.hi, zoomed: false, factor: 1 };
}

/**
 * Fixe la fenêtre X : largeur `width`, avec le point de données `anchorData`
 * placé à la fraction `anchorFrac` ∈ [0,1] de la largeur du tracé.
 * (Zoom centré sur le curseur et déplacement sont le même calcul.)
 */
function _zoomSetRange(width, anchorData, anchorFrac, xFull) {
  width = Math.max(ZOOM_MIN_SPAN, Math.min(xFull, width));
  if (width >= xFull - 1e-9) { _zoomX = null; return; }
  const min = Math.max(0, Math.min(anchorData - anchorFrac * width, xFull - width));
  _zoomX = { min, max: min + width };
}

/**
 * Fixe la fenêtre Y du graphe `key` : hauteur `span`, avec la valeur `anchorData`
 * placée à la fraction `anchorFrac` ∈ [0,1] de la hauteur du tracé (0 = bas).
 */
function _zoomYSet(key, span, anchorData, anchorFrac, yFull) {
  const full = yFull.hi - yFull.lo;
  if (!(full > 0)) return;
  span = Math.max(full / ZOOM_Y_MAX_FACTOR, Math.min(full, span));
  if (span >= full * (1 - 1e-9)) { delete _zoomY[key]; return; }
  const lo = Math.max(yFull.lo, Math.min(anchorData - anchorFrac * span, yFull.hi - span));
  _zoomY[key] = { lo, hi: lo + span };
}

/** Retour au dézoom maximal des deux axes (autoscale historique, suivi du volume versé). */
function _zoomReset() { _zoomX = null; _zoomY = {}; }

let _zoomRafPending = false;
/** Redessine tous les graphes (au plus une fois par frame). */
function _zoomRedrawAll() {
  if (_zoomRafPending) return;
  _zoomRafPending = true;
  requestAnimationFrame(() => {
    _zoomRafPending = false;
    drawTitrageGraph();
    _drawMainGraph();
  });
}

/* ── Utilitaires d'axes ─────────────────────────────────────────────────── */

/** Nombre de décimales nécessaires pour afficher des multiples de `step`. */
function _decForStep(step) {
  if (step >= 1) return 0;
  return Math.min(6, Math.max(1, Math.ceil(-Math.log10(step) - 1e-9)));
}

/** Multiples de `step` dans [lo, hi] (calculés par k·step : pas de dérive). */
function _tickValues(lo, hi, step) {
  const out = [];
  const eps = step * 1e-6;
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + eps; k++) out.push(+(k * step).toFixed(12));
  return out;
}

/** Pas d'accrochage du survol (mL) adapté à la largeur de la fenêtre. */
function _hoverStep(span) {
  return span <= 2.5 ? 0.01 : span <= 8 ? 0.05 : 0.10;
}

/** Étiquette de graduation X : décimales déduites du pas. */
function _fmtXTick(x, step) { return x.toFixed(_decForStep(step)); }

/* ── Badge « zoom » (indice + bouton de réinitialisation) ───────────────── */

const _zoomBadges = new Map();   // canvas.id → <button>

function _zoomBadgeFor(canvas) {
  let b = _zoomBadges.get(canvas.id);
  if (b && b.isConnected) return b;
  const host = canvas.parentElement;
  if (!host) return null;
  b = document.createElement('button');
  b.type = 'button';
  b.className = 'zoom-badge';
  b.addEventListener('click', e => {
    e.stopPropagation();
    _zoomReset();
    _zoomRedrawAll();
  });
  host.appendChild(b);
  _zoomBadges.set(canvas.id, b);
  return b;
}

function _fmtFactor(f) { return f >= 10 ? f.toFixed(0) : f.toFixed(1).replace('.', ','); }

/**
 * À appeler en fin de chaque dessin : curseur, geste tactile autorisé et badge
 * (aligné à droite de la ligne du titre de l'axe X).
 * @param {number} rowY     ordonnée (px canvas) du centre de la ligne du titre X
 * @param {number} yFactor  facteur de zoom Y du graphe (1 = pas de zoom)
 */
function _zoomAfterDraw(canvas, pad, gw, rowY, view, xFull, yFactor) {
  const fx = xFull / (view.x1 - view.x0);
  const fy = yFactor || 1;
  const zoomed = view.zoomed || fy > 1 + 1e-9;
  canvas.style.cursor      = zoomed ? (_zoomPanning ? 'grabbing' : 'grab') : '';
  // Réticule libre actif : on masque le curseur de la souris au-dessus du tracé,
  // sinon il cache l'endroit visé (le réticule le remplace).
  if (canvas.id === 'titrage-chart-ph' && _phCursorActive && _phChartHover && _phLayout && !_zoomPanning) {
    const { mx, my } = _phChartHover;
    if (mx >= pad.l && mx <= pad.l + gw && my >= _phLayout.pad.t && my <= _phLayout.pad.t + _phLayout.gh) {
      canvas.style.cursor = 'none';
    }
  }
  // Hors zoom on laisse le défilement vertical de la page ; zoomé, le glisser est à nous.
  canvas.style.touchAction = zoomed ? 'none' : 'pan-y';
  canvas.title = 'Molette ou pincement : zoomer · Maj + molette : zoom vertical seul · Glisser : se déplacer';

  const b = _zoomBadgeFor(canvas);
  if (!b) return;
  const narrow = gw < 340;
  if (zoomed) {
    // Un seul facteur s'ils sont proches ; sinon « X ×a · Y ×b »
    const same = Math.abs(fx - fy) <= 0.1 * Math.max(fx, fy);
    const fTxt = same ? `×${_fmtFactor(fx)}` : `X ×${_fmtFactor(fx)} · Y ×${_fmtFactor(fy)}`;
    b.textContent = narrow ? `⟲ ${fTxt}` : `⟲ Réinitialiser le zoom (${fTxt})`;
    b.classList.remove('zoom-badge--hint');
  } else {
    b.textContent = narrow ? '' : 'Molette : zoom';
    b.classList.add('zoom-badge--hint');
  }
  b.style.display = (!zoomed && narrow) ? 'none' : '';
  b.style.left = (canvas.offsetLeft + pad.l + gw) + 'px';
  b.style.top  = (canvas.offsetTop + rowY) + 'px';
}

/* ── Interactions : molette, glisser, pincement ─────────────────────────── */

/**
 * Branche zoom/pan sur un canvas. À appeler AVANT les autres listeners du
 * canvas (le `click` en capture doit passer le premier pour pouvoir annuler
 * le faux clic qui suit un glisser).
 * @param {() => ({pad,gw,gh,xFull,yFull}|null)} getLayout  layout du dernier dessin
 * @param {(mx:number,my:number) => boolean} [grabbed] vrai si un autre outil
 *        (ex. point de contrôle d'une droite) doit recevoir le pointeur
 * @param {() => string} getYKey  clé de l'état Y du graphe affiché ('ph'|'sigma'|'n')
 */
function _zoomAttach(canvas, getLayout, grabbed, getYKey) {
  const toCanvas = e => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.clientWidth  / r.width),
             y: (e.clientY - r.top)  * (canvas.clientHeight / r.height) };
  };
  const inPlot = (L, m) => m.x >= L.pad.l && m.x <= L.pad.l + L.gw &&
                           m.y >= L.pad.t && m.y <= L.pad.t + L.gh;
  const fracX = (L, m) => (m.x - L.pad.l) / L.gw;
  const fracY = (L, m) => 1 - (m.y - L.pad.t) / L.gh;       // 0 = bas du tracé

  // ── Molette (zoom centré sur le curseur, X et Y ; Maj : Y seul) ──
  canvas.addEventListener('wheel', e => {
    const L = getLayout();
    if (!L) return;
    const m = toCanvas(e);
    if (!inPlot(L, m)) return;                 // marges : la molette fait défiler la page
    // Maj + molette : certains navigateurs transposent le défilement en deltaX
    let dy = e.deltaY || (e.shiftKey ? e.deltaX : 0);
    if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= 100;
    if (dy === 0) return;
    const key = getYKey ? getYKey() : null;
    const vx  = _zoomView(L.xFull);
    const yv  = key ? _zoomYView(key, L.yFull) : null;
    if (dy > 0 && !vx.zoomed && !(yv && yv.zoomed)) return;   // déjà dézoomé au max : laisser défiler
    e.preventDefault();
    // Pincement du pavé tactile (ctrlKey) : deltas bien plus petits → plus sensible
    const f = Math.exp(dy * (e.ctrlKey ? 0.012 : 0.0022));
    if (!e.shiftKey) {
      const span = vx.x1 - vx.x0, fx = fracX(L, m);
      _zoomSetRange(span * f, vx.x0 + fx * span, fx, L.xFull);
    }
    if (yv) {
      const span = yv.hi - yv.lo, fy = fracY(L, m);
      _zoomYSet(key, span * f, yv.lo + fy * span, fy, L.yFull);
    }
    _zoomRedrawAll();
  }, { passive: false });

  // ── Glisser (1 pointeur) et pincement (2 pointeurs) ──
  const ptrs = new Map();            // pointerId → {x, y} (px canvas)
  let gesture = null;                // { type:'pan'|'pinch', … }
  let moved = false;                 // le geste a dépassé le seuil → annuler le clic suivant
  let suppressClick = false;

  // Photographie de la vue au début d'un geste, avec l'ancre (en données) sous (m.x, m.y)
  const snapshot = (m, L) => {
    const key = getYKey ? getYKey() : null;
    const vx = _zoomView(L.xFull);
    const yv = key ? _zoomYView(key, L.yFull) : null;
    return { key, wx: vx.x1 - vx.x0, ax: vx.x0 + fracX(L, m) * (vx.x1 - vx.x0),
             wy: yv ? yv.hi - yv.lo : 0, ay: yv ? yv.lo + fracY(L, m) * (yv.hi - yv.lo) : 0,
             zoomed: vx.zoomed || !!(yv && yv.zoomed) };
  };
  const startPan = (m, L) => {
    gesture = Object.assign({ type: 'pan', sx: m.x, sy: m.y }, snapshot(m, L));
  };
  const startPinch = L => {
    const [p, q] = [...ptrs.values()];
    const c = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    gesture = Object.assign({ type: 'pinch', d0: Math.max(1, Math.hypot(p.x - q.x, p.y - q.y)) },
                            snapshot(c, L));
  };
  // Applique la vue du geste : largeur/hauteur × k, ancre (ax, ay) placée sous le point c
  const applyGesture = (L, c, k) => {
    _zoomSetRange(gesture.wx * k, gesture.ax, fracX(L, c), L.xFull);
    if (gesture.key) _zoomYSet(gesture.key, gesture.wy * k, gesture.ay, fracY(L, c), L.yFull);
    _zoomRedrawAll();
  };

  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const L = getLayout();
    if (!L) return;
    const m = toCanvas(e);
    if (!inPlot(L, m)) return;
    if (ptrs.size === 0 && grabbed && grabbed(m.x, m.y)) return;
    ptrs.set(e.pointerId, m);
    if (ptrs.size === 1) { moved = false; startPan(m, L); }
    else if (ptrs.size === 2) { moved = true; startPinch(L); }
  });

  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId) || !gesture) return;
    const L = getLayout();
    if (!L) return;
    const m = toCanvas(e);
    ptrs.set(e.pointerId, m);
    if (gesture.type === 'pinch' && ptrs.size >= 2) {
      const [p, q] = [...ptrs.values()];
      const d = Math.max(1, Math.hypot(p.x - q.x, p.y - q.y));
      applyGesture(L, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, gesture.d0 / d);
    } else if (gesture.type === 'pan' && gesture.zoomed) {
      if (!moved && Math.hypot(m.x - gesture.sx, m.y - gesture.sy) > 4) {
        moved = true;
        _zoomPanning = true;
        canvas.style.cursor = 'grabbing';
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      }
      if (moved) applyGesture(L, m, 1);          // largeur/hauteur inchangées : déplacement pur
    }
  });

  const endPointer = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (moved) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 120);
    }
    gesture = null;
    if (ptrs.size === 0) {
      moved = false;
      if (_zoomPanning) { _zoomPanning = false; _zoomRedrawAll(); }
    } else {
      // Un doigt reste après un pincement : il reprend le déplacement
      const L = getLayout();
      const [m] = [...ptrs.values()];
      if (L && m) startPan(m, L);
    }
  };
  canvas.addEventListener('pointerup',     endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  // Un glisser ne doit jamais valoir clic (placement de tangente, de droite…)
  canvas.addEventListener('click', e => {
    if (suppressClick) { e.stopImmediatePropagation(); e.preventDefault(); suppressClick = false; }
  }, true);
}
