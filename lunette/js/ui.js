'use strict';

// ═══════════════════════════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════════════════════════

/* ═══════════════════════════════════════════════════
   ui.js — Contrôles UI et boucle d'animation — Lunette astronomique
   ─────────────────────────────────────────────────
   Dépend de : sim.js, draw.js
   Chargé en dernier — démarre l'initialisation.
════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════
   BOUCLE D'ANIMATION
════════════════════════════════════════════════════ */
function animLoop(ts) {
  if (!sim.animRunning) return;
  if (sim.lastTs === 0) { sim.lastTs = ts; requestAnimationFrame(animLoop); return; }
  const dt = (ts - sim.lastTs) / 1000;
  sim.lastTs = ts;

  if (sim.animRewind) {
    sim.animT = Math.max(0, sim.animT - dt * sim.animSpeed * sim.animRewindMult);
    draw();
    if (sim.animT > 0) requestAnimationFrame(animLoop);
    else { sim.animRunning = false; draw(); }
    return;
  }

  if (sim.animPaused) { sim.animRunning = false; draw(); return; }

  sim.animT = Math.min(sim.animT + dt * sim.animSpeed * sim.animSpeedMult * 2, 1.0);
  draw();
  if (sim.animT < 1.0) {
    requestAnimationFrame(animLoop);
  } else {
    sim.animRunning = false; sim.animPaused = true;
    const btn = document.getElementById('btn-pause-play');
    if (btn) { btn.textContent = '▶ Play'; btn.classList.remove('active'); }
    draw();
  }
}

function startAnim() {
  sim.animT = 0; sim.lastTs = 0;
  if (!sim.animPaused) {
    sim.animRunning = true;
    requestAnimationFrame(animLoop);
  } else {
    sim.animRunning = false; draw();
  }
}

function restartAnim() {
  if (sim.rayMode === 'anim') { sim.animRunning = false; startAnim(); }
}

/* ═══════════════════════════════════════════════════
   DRAG & DROP
════════════════════════════════════════════════════ */
let drag    = null;
let panDrag = null;
const DRAG_R = 18;

function hitTest(mx, my) {
  const { lensX1, lensX2, axisY, scale, LENS_RADIUS_CM, oeilX, EYE_IRIS_TO_LENS, view } = sim;
  const vs = view.scale;
  const effectiveRadius = vs < 1 ? LENS_RADIUS_CM / vs : LENS_RADIUS_CM;
  const lensHpx = effectiveRadius * scale;

  if (Math.abs(mx - lensX1) < DRAG_R &&
      my >= axisY - lensHpx - DRAG_R && my <= axisY + lensHpx + DRAG_R) return 'L1';

  if (Math.abs(mx - lensX2) < DRAG_R &&
      my >= axisY - lensHpx - DRAG_R && my <= axisY + lensHpx + DRAG_R) return 'L2';

  if (sim.oeilActif && sim.systemMode === 'lunette') {
    const crystalXpx = oeilX + EYE_IRIS_TO_LENS * scale;
    const eyeHpx = effectiveRadius * scale;
    if (Math.abs(mx - crystalXpx) < DRAG_R &&
        my >= axisY - eyeHpx - DRAG_R && my <= axisY + eyeHpx + DRAG_R) return 'oeil';
  }

  return null;
}

cv.addEventListener('mousedown', e => {
  const { x: mx, y: my } = clientToSim(e.clientX, e.clientY);

  const rect = cv.getBoundingClientRect();
  const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
  if (_defaultBtnRect && cx >= _defaultBtnRect.x && cx <= _defaultBtnRect.x + _defaultBtnRect.w &&
      cy >= _defaultBtnRect.y && cy <= _defaultBtnRect.y + _defaultBtnRect.h) {
    resetView(); return;
  }

  const target = hitTest(mx, my);
  if (!target) {
    if (sim.rayMode === 'anim') return;
    panDrag = { startClientX: e.clientX, startClientY: e.clientY,
                startTx: sim.view.tx, startTy: sim.view.ty };
    cv.style.cursor = 'grab';
    return;
  }
  drag = { target, startX: mx, startL1: sim.lensX1, startL2: sim.lensX2, startOeil: sim.oeilX };
  cv.style.cursor = 'grabbing';
  document.getElementById('drag-hint').classList.add('hidden');
});

cv.addEventListener('mousemove', e => {
  const { x: mx, y: my } = clientToSim(e.clientX, e.clientY);

  if (panDrag) {
    sim.view.tx = panDrag.startTx + (e.clientX - panDrag.startClientX);
    sim.view.ty = panDrag.startTy + (e.clientY - panDrag.startClientY);
    clampPan();
    sim.rayMode === 'instant' ? draw() : restartAnim();
    return;
  }

  if (!drag) {
    cv.style.cursor = hitTest(mx, my) ? 'ew-resize' : 'default';
    return;
  }

  const dx = mx - drag.startX;
  if (drag.target === 'L1') {
    sim.lensX1 = Math.max(sim.W * 0.05, Math.min(sim.W * 0.6, drag.startL1 + dx));
    enforceLensDistance();
    if (sim.systemMode === 'lunette' && sim.oeilActif) {
      const dOeil = drag.startOeil - drag.startL2;
      sim.oeilX = sim.lensX2 + dOeil;
    }
  } else if (drag.target === 'L2') {
    if (sim.systemMode === 'lunette') {
      const dist12 = drag.startL2 - drag.startL1;
      sim.lensX2 = Math.max(sim.W * 0.1, Math.min(sim.W * 0.95, drag.startL2 + dx));
      sim.lensX1 = sim.lensX2 - dist12;
      if (sim.oeilActif) {
        const dOeil = drag.startOeil - drag.startL2;
        sim.oeilX = sim.lensX2 + dOeil;
      }
    } else {
      sim.lensX2 = Math.max(sim.lensX1 + 5 * sim.scale, Math.min(sim.W * 0.92, drag.startL2 + dx));
    }
  } else if (drag.target === 'oeil') {
    sim.oeilX = Math.max(sim.lensX2 + 5 * sim.scale, drag.startOeil + dx);
  }

  compute();
  if (sim.rayMode === 'instant') draw();
  else { sim.animT = 0; draw(); }
});

cv.addEventListener('mouseup',    () => { drag = null; panDrag = null; cv.style.cursor = 'default'; });
cv.addEventListener('mouseleave', () => {
  if (drag)    { drag    = null; cv.style.cursor = 'default'; }
  if (panDrag) { panDrag = null; cv.style.cursor = 'default'; }
});

function clampPan() {
  const { W, H, view } = sim;
  const vs = view.scale;
  const marginX = W * 0.2;
  const marginY = H * 0.2;
  view.tx = Math.max(-(W * vs - marginX), Math.min(W - marginX, view.tx));
  view.ty = Math.max(-(H * vs - marginY), Math.min(H - marginY, view.ty));
}

cv.addEventListener('wheel', e => {
  e.preventDefault();
  if (sim.rayMode === 'anim') return;
  const rect   = cv.getBoundingClientRect();
  const cx     = e.clientX - rect.left;
  const cy     = e.clientY - rect.top;
  const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
  const newScale = Math.max(0.3, Math.min(8, sim.view.scale * factor));
  sim.view.tx = cx - (cx - sim.view.tx) * (newScale / sim.view.scale);
  sim.view.ty = cy - (cy - sim.view.ty) * (newScale / sim.view.scale);
  sim.view.scale = newScale;
  clampPan();
  sim.rayMode === 'instant' ? draw() : restartAnim();
}, { passive: false });

cv.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.touches[0];
  const { x: mx, y: my } = clientToSim(t.clientX, t.clientY);
  const target = hitTest(mx, my);
  if (!target) return;
  drag = { target, startX: mx, startL1: sim.lensX1, startL2: sim.lensX2, startOeil: sim.oeilX };
  document.getElementById('drag-hint').classList.add('hidden');
}, { passive: false });

cv.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!drag) return;
  const t = e.touches[0];
  const { x: mx } = clientToSim(t.clientX, t.clientY);
  const dx = mx - drag.startX;
  if (drag.target === 'L1') {
    sim.lensX1 = Math.max(sim.W*0.05, Math.min(sim.W*0.6, drag.startL1 + dx));
    enforceLensDistance();
    if (sim.systemMode === 'lunette' && sim.oeilActif) {
      sim.oeilX = sim.lensX2 + (drag.startOeil - drag.startL2);
    }
  } else if (drag.target === 'L2') {
    if (sim.systemMode === 'lunette') {
      const dist12 = drag.startL2 - drag.startL1;
      sim.lensX2 = Math.max(sim.W*0.1, Math.min(sim.W*0.95, drag.startL2 + dx));
      sim.lensX1 = sim.lensX2 - dist12;
      if (sim.oeilActif) sim.oeilX = sim.lensX2 + (drag.startOeil - drag.startL2);
    } else {
      sim.lensX2 = Math.max(sim.lensX1 + 5*sim.scale, Math.min(sim.W*0.92, drag.startL2 + dx));
    }
  } else if (drag.target === 'oeil') {
    sim.oeilX = Math.max(sim.lensX2 + 5*sim.scale, drag.startOeil + dx);
  }
  compute(); draw();
}, { passive: false });

cv.addEventListener('touchend', () => { drag = null; });

/* ═══════════════════════════════════════════════════
   CONTRÔLES DU PANNEAU
════════════════════════════════════════════════════ */
function onSliderAlpha(val) {
  sim.alpha = parseInt(val);
  const sign = sim.alpha >= 0 ? '+' : '';
  document.getElementById('lbl-alpha').textContent = sign + sim.alpha + '°';
  compute();
  sim.rayMode === 'instant' ? draw() : restartAnim();
}

function onSliderF1(val) {
  sim.f1 = parseFloat(val);
  document.getElementById('lbl-f1').textContent = '+' + sim.f1.toFixed(1) + ' cm';
  if (sim.systemMode === 'lunette') enforceLensDistance();
  compute();
  sim.rayMode === 'instant' ? draw() : restartAnim();
}

function onSliderF2(val) {
  sim.f2 = parseFloat(val);
  document.getElementById('lbl-f2').textContent = '+' + sim.f2.toFixed(1) + ' cm';
  if (sim.systemMode === 'lunette') enforceLensDistance();
  compute();
  sim.rayMode === 'instant' ? draw() : restartAnim();
}

function onSliderNRays(val) {
  sim.nRays = parseInt(val);
  document.getElementById('lbl-nrays').textContent = sim.nRays;
  sim.rayMode === 'instant' ? draw() : restartAnim();
}

function setSystemMode(mode) {
  sim.systemMode = mode;
  document.getElementById('btn-libre').classList.toggle('active', mode === 'libre');
  document.getElementById('btn-lunette').classList.toggle('active', mode === 'lunette');
  document.getElementById('section-oeil').style.display = mode === 'lunette' ? '' : 'none';

  if (mode === 'lunette') {
    enforceLensDistance();
  } else {
    if (sim.oeilActif) toggleOeil(true);
    if (sim.legendeActif) toggleLegende();
  }

  compute();
  sim.rayMode === 'instant' ? draw() : restartAnim();
}

function setRayMode(mode) {
  sim.rayMode = mode;
  document.getElementById('btn-instant').classList.toggle('active', mode === 'instant');
  document.getElementById('btn-anim').classList.toggle('active', mode === 'anim');
  document.getElementById('row-speed').style.display = mode === 'anim' ? '' : 'none';
  if (mode === 'instant') {
    sim.animRunning = false; draw();
  } else {
    sim.view.scale = 1; sim.view.tx = 0; sim.view.ty = 0;
    sim.animPaused = true;
    const btn = document.getElementById('btn-pause-play');
    if (btn) { btn.textContent = '▶ Play'; btn.classList.remove('active'); }
    startAnim();
  }
}

function toggleOeil(forceOff) {
  sim.oeilActif = forceOff ? false : !sim.oeilActif;
  const btn = document.getElementById('btn-oeil');
  if (sim.oeilActif) {
    btn.textContent = 'Ajouter un œil : OUI';
    btn.classList.add('active');
    sim.oeilX = sim.lensX2 + 20 * sim.scale;
  } else {
    btn.textContent = 'Ajouter un œil : NON';
    btn.classList.remove('active');
  }
  compute();
  sim.rayMode === 'instant' ? draw() : restartAnim();
}

function toggleLegende() {
  sim.legendeActif = !sim.legendeActif;
  const btn = document.getElementById('btn-legende');
  if (sim.legendeActif) {
    btn.textContent = 'Légende : OUI';
    btn.classList.add('active');
  } else {
    btn.textContent = 'Légende : NON';
    btn.classList.remove('active');
  }
  sim.rayMode === 'instant' ? draw() : restartAnim();
}

function togglePausePlay() {
  sim.animPaused = !sim.animPaused;
  const btn = document.getElementById('btn-pause-play');
  if (sim.animPaused) {
    btn.textContent = '▶ Play'; btn.classList.remove('active');
    sim.animRunning = false;
  } else {
    btn.textContent = '⏸ Pause'; btn.classList.add('active');
    if (sim.rayMode === 'anim' && !sim.animRunning && sim.animT < 1.0) {
      sim.animRunning = true; sim.lastTs = 0;
      requestAnimationFrame(animLoop);
    }
  }
}

function resetAnim() {
  sim.animRewind = false; sim.animT = 0; sim.animRunning = false;
  document.getElementById('speed-rewind').style.opacity = '0.5';
  if (!sim.animPaused && sim.rayMode === 'anim') {
    sim.animRunning = true; sim.lastTs = 0;
    requestAnimationFrame(animLoop);
  } else { draw(); }
}

/* ═══════════════════════════════════════════════════
   SLIDER VITESSE CUSTOM
════════════════════════════════════════════════════ */
const SPEED_VALS   = [0.05, 0.125, 0.25, 0.375, 0.5];
const SPEED_LABELS = ['×0.1', '×0.25', '×0.5', '×0.75', '×1'];

(function() {
  let isDragging = false, isRewind = false;

  function setSpeedIdx(idx) {
    sim.animSpeedMult = SPEED_VALS[idx];
    document.getElementById('lbl-speed').textContent = SPEED_LABELS[idx];
    updateThumb(idx / (SPEED_VALS.length - 1) * 100);
    if (sim.rayMode === 'anim' && !sim.animRunning && !sim.animPaused) {
      sim.animRunning = true; sim.lastTs = 0;
      requestAnimationFrame(animLoop);
    }
  }

  function updateThumb(pct) {
    const track = document.getElementById('speed-track');
    const thumb = document.getElementById('speed-thumb');
    const fill  = document.getElementById('speed-fill');
    if (!track) return;
    thumb.style.left = pct + '%';
    fill.style.width  = Math.max(0, Math.min(100, pct)) + '%';
  }

  function pctFromEvent(e, track) {
    const rect = track.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return (clientX - rect.left) / rect.width * 100;
  }

  function pctToIdx(pct) {
    const idx = Math.round(pct / 100 * (SPEED_VALS.length - 1));
    return Math.max(0, Math.min(SPEED_VALS.length - 1, idx));
  }

  function startRewind(mult) {
    isRewind = true; sim.animRewind = true; sim.animRewindMult = mult || 1.0;
    document.getElementById('lbl-speed').textContent = '⏪';
    document.getElementById('speed-rewind').style.opacity = '1';
    if (sim.rayMode === 'anim' && !sim.animRunning) {
      sim.animRunning = true; sim.lastTs = 0;
      requestAnimationFrame(animLoop);
    }
  }

  function stopRewind() {
    if (!isRewind) return;
    isRewind = false; sim.animRewind = false;
    document.getElementById('speed-rewind').style.opacity = '0.5';
    setSpeedIdx(0);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const track = document.getElementById('speed-track');
    const thumb = document.getElementById('speed-thumb');
    if (!track) return;

    function onDown(e) {
      isDragging = true; thumb.style.cursor = 'grabbing';
      const pct = pctFromEvent(e, track);
      if (pct < -5) { startRewind(); return; }
      stopRewind();
      setSpeedIdx(pctToIdx(Math.max(0, pct)));
      e.preventDefault();
    }
    track.addEventListener('mousedown', onDown);
    thumb.addEventListener('mousedown', onDown);

    document.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const pct = pctFromEvent(e, track);
      if (pct < 0) {
        const rewindRect = document.getElementById('speed-rewind').getBoundingClientRect();
        const trackRect  = track.getBoundingClientRect();
        const minPct = (rewindRect.left - trackRect.left) / trackRect.width * 100;
        const clampedPct = Math.max(minPct, pct);
        updateThumb(clampedPct);
        const frac = minPct < 0 ? Math.min(1, clampedPct / minPct) : 0;
        startRewind(0.025 + frac * 0.225);
      } else {
        stopRewind();
        const idx = pctToIdx(pct);
        updateThumb(idx / (SPEED_VALS.length - 1) * 100);
        setSpeedIdx(idx);
      }
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false; thumb.style.cursor = 'grab';
      stopRewind();
    });
  });
})();

/* ═══════════════════════════════════════════════════
   RESIZE
════════════════════════════════════════════════════ */
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resize, 60);
});

/* ═══════════════════════════════════════════════════
   INITIALISATION
════════════════════════════════════════════════════ */
document.getElementById('lbl-f1').textContent = '+' + sim.f1.toFixed(1) + ' cm';
document.getElementById('lbl-f2').textContent = '+' + sim.f2.toFixed(1) + ' cm';
document.getElementById('lbl-alpha').textContent = '+15°';
document.getElementById('lbl-nrays').textContent = '3';

resize();
document.getElementById('row-speed').style.display = 'none';

document.addEventListener('DOMContentLoaded', () => {
  const thumb = document.getElementById('speed-thumb');
  if (thumb) thumb.style.left = '100%';
});

setTimeout(() => { document.getElementById('drag-hint').classList.add('hidden'); }, 5000);

function toggleHint() {
  var hint = document.getElementById('panel-hint');
  if (hint) hint.classList.toggle('collapsed');
}
