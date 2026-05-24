'use strict';

// ═══════════════════════════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════════════════════════

/* ═══════════════════════════════════════════════════
   ui.js — Interactions utilisateur de la simulation Lentille mince
   ─────────────────────────────────────────────────
   Dépend de : sim.js  (sim, compute, updatePanel, updateConjugaison, updateTableHeight, xToCm, cmToX, cmToY)
               draw.js (cv, draw, resize)
   Expose : restartAnim (appelé depuis draw.js via scope global)
════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════
   BOUCLE D'ANIMATION (mode Propagation)
════════════════════════════════════════════════════ */
function animLoop(ts) {
  if (!sim.animRunning) return;
  if (sim.lastTs === 0) sim.lastTs = ts;
  const dt = (ts - sim.lastTs) / 1000;
  sim.lastTs = ts;

  if (sim.animRewind) {
    sim.animT = Math.max(0, sim.animT - dt * sim.animSpeed * sim.animRewindMult);
    draw();
    if (sim.animT > 0) requestAnimationFrame(animLoop);
    else { sim.animRunning = false; draw(); }
    return;
  }

  if (sim.animPaused) {
    sim.animRunning = false;
    draw();
    return;
  }

  sim.animT = Math.min(sim.animT + dt * sim.animSpeed * sim.animSpeedMult, 1.0);
  draw();
  if (sim.animT < 1.0) {
    requestAnimationFrame(animLoop);
  } else {
    sim.animRunning = false;
    sim.animPaused  = true;
    const btn = document.getElementById('btn-pause-play');
    if (btn) { btn.textContent = '▶ Play'; btn.classList.remove('active'); }
    draw();
  }
}

/* ── Démarre l'animation depuis t=0 (respecte l'état pause) ── */
function startAnim() {
  sim.animT = 0; sim.lastTs = 0;
  if (!sim.animPaused) {
    sim.animRunning = true;
    requestAnimationFrame(animLoop);
  } else {
    sim.animRunning = false;
    draw();
  }
}

/* ── Redémarre l'animation depuis le début (changement de paramètre) ── */
function restartAnim() {
  if (sim.mode === 'anim') { sim.animRunning = false; startAnim(); }
}

/* ═══════════════════════════════════════════════════
   DRAG & DROP
════════════════════════════════════════════════════ */
let drag = null;
const DRAG_RADIUS = 18;

function hitTest(mx, my) {
  const { OA, OE, lensX, axisY } = sim;

  if (!sim.infini) {
    const objX = cmToX(OA);
    const yA   = sim.axisY;
    const yB   = cmToY(sim.h);
    const yMin = Math.min(yA, yB) - DRAG_RADIUS;
    const yMax = Math.max(yA, yB) + DRAG_RADIUS;
    if (Math.abs(mx - objX) < DRAG_RADIUS && my >= yMin && my <= yMax) return 'obj';
  }

  const lensHpx = sim.LENS_RADIUS_CM * sim.scale;
  if (Math.abs(mx - lensX) < DRAG_RADIUS + 5 &&
      my >= axisY - lensHpx - DRAG_RADIUS &&
      my <= axisY + lensHpx + DRAG_RADIUS) return 'lens';

  const scrX   = cmToX(OE);
  const scrHpx = sim.H * 0.3;
  if (Math.abs(mx - scrX) < DRAG_RADIUS &&
      my >= sim.axisY - scrHpx - DRAG_RADIUS &&
      my <= sim.axisY + scrHpx + DRAG_RADIUS) return 'screen';

  return null;
}

cv.addEventListener('mousedown', e => {
  const rect = cv.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;

  function hitBtn(b) { return b && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h; }
  if (hitBtn(sim._objBtnRect))  { sim.objCollapsed = !sim.objCollapsed; draw(); return; }
  if (hitBtn(sim._imgBtnRect))  { sim.imgCollapsed = !sim.imgCollapsed; draw(); return; }
  if (hitBtn(sim._autoBtnRect)) { sim.autoScreen   = !sim.autoScreen;   compute(); draw(); return; }

  const target = hitTest(mx, my);
  if (!target) return;
  if (target === 'screen' && sim.autoScreen) sim.autoScreen = false;
  drag = { target, startX: mx, startOA: sim.OA, startLens: sim.lensX, startOE: sim.OE };
  cv.style.cursor = 'grabbing';
  document.getElementById('drag-hint').classList.add('hidden');
});

cv.addEventListener('mousemove', e => {
  const rect = cv.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;

  if (!drag) {
    cv.style.cursor = hitTest(mx, my) ? 'ew-resize' : 'default';

    if (sim.multiPoints && sim._lastRays) {
      const HIT_DIST = 6;
      let found = -1;
      outer: for (const ray of sim._lastRays) {
        if (ray.groupId === -1) continue;
        for (const seg of ray.segs) {
          const pts = seg.pts;
          for (let i = 1; i < pts.length; i++) {
            const ax = pts[i-1].x, ay = pts[i-1].y;
            const bx = pts[i].x,   by = pts[i].y;
            const dx = bx - ax, dy = by - ay;
            const lenSq = dx*dx + dy*dy;
            let t = lenSq > 0 ? ((mx-ax)*dx + (my-ay)*dy) / lenSq : 0;
            t = Math.max(0, Math.min(1, t));
            const px = ax + t*dx, py = ay + t*dy;
            if (Math.sqrt((mx-px)**2 + (my-py)**2) < HIT_DIST) {
              found = ray.groupId; break outer;
            }
          }
        }
      }
      if (found !== sim.hoveredGroup) { sim.hoveredGroup = found; draw(); }
    }
    return;
  }

  const dx = mx - drag.startX;
  if (drag.target === 'obj') {
    sim.OA = Math.min(drag.startOA + dx / sim.scale, -0.5);
    sim.OA = Math.max(sim.OA, xToCm(10));
  } else if (drag.target === 'lens') {
    sim.lensX = Math.max(sim.W * 0.1, Math.min(sim.W * 0.9, drag.startLens + dx));
  } else if (drag.target === 'screen') {
    sim.OE = Math.max(0.5, drag.startOE + dx / sim.scale);
  }

  compute();
  if (sim.mode === 'instant') draw();
  else if (drag.target === 'screen') draw();
  else { sim.animT = 0; draw(); }
});

cv.addEventListener('mouseup',    () => { drag = null; cv.style.cursor = 'default'; });
cv.addEventListener('mouseleave', () => {
  if (drag) { drag = null; cv.style.cursor = 'default'; }
  if (sim.hoveredGroup !== -1) { sim.hoveredGroup = -1; draw(); }
});

cv.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.touches[0], rect = cv.getBoundingClientRect();
  const mx = t.clientX - rect.left, my = t.clientY - rect.top;
  const target = hitTest(mx, my);
  if (!target) return;
  drag = { target, startX: mx, startOA: sim.OA, startLens: sim.lensX, startOE: sim.OE };
  document.getElementById('drag-hint').classList.add('hidden');
}, { passive: false });

cv.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!drag) return;
  const t = e.touches[0], rect = cv.getBoundingClientRect();
  const dx = t.clientX - rect.left - drag.startX;
  if (drag.target === 'obj')    { sim.OA = Math.max(Math.min(drag.startOA + dx/sim.scale, -0.5), xToCm(10)); }
  else if (drag.target === 'lens')   { sim.lensX = Math.max(sim.W*0.1, Math.min(sim.W*0.9, drag.startLens+dx)); }
  else if (drag.target === 'screen') { sim.OE = Math.max(0.5, drag.startOE + dx/sim.scale); }
  compute(); draw();
}, { passive: false });

cv.addEventListener('touchend', () => { drag = null; });

/* ═══════════════════════════════════════════════════
   CONTRÔLES DU PANNEAU
════════════════════════════════════════════════════ */

function setMode(mode) {
  sim.mode = mode;
  document.getElementById('btn-instant').classList.toggle('active', mode === 'instant');
  document.getElementById('btn-anim').classList.toggle('active',    mode === 'anim');
  document.getElementById('row-speed').style.display = mode === 'anim' ? '' : 'none';

  const inPropag = (mode === 'anim');
  document.getElementById('btn-infini-anim').disabled = inPropag || sim.infini;
  document.getElementById('btn-infini-play').disabled = inPropag || !sim.infiniAnim;

  if (mode === 'instant') {
    sim.animRunning = false;
    draw();
  } else {
    sim.animPaused = true;
    const btn = document.getElementById('btn-pause-play');
    if (btn) { btn.textContent = '▶ Play'; btn.classList.remove('active'); }
    startAnim();
  }
}

function setLensType(type) {
  sim.lensType = type;
  document.getElementById('btn-conv').classList.toggle('active', type === 'conv');
  document.getElementById('btn-div').classList.toggle('active',  type === 'div');
  document.getElementById('header-title').textContent =
    type === 'conv' ? 'Lentille mince convergente' : 'Lentille mince divergente';
  const sign = type === 'conv' ? '+' : '−';
  document.getElementById('lbl-f').textContent = sign + sim.f.toFixed(1) + ' cm';
  compute();
  sim.mode === 'instant' ? draw() : restartAnim();
}

function onSliderF(val) {
  sim.f = parseFloat(val);
  const sign = sim.lensType === 'conv' ? '+' : '−';
  document.getElementById('lbl-f').textContent = sign + sim.f.toFixed(1) + ' cm';
  compute();
  sim.mode === 'instant' ? draw() : restartAnim();
}

function onSliderAB(rawVal) {
  let raw = parseInt(rawVal);
  if (raw === 0) raw = 2;
  sim.h = raw / 2;
  const sign = sim.h > 0 ? '+' : '';
  document.getElementById('lbl-h').textContent = sign + sim.h.toFixed(1) + ' cm';
  compute();
  sim.mode === 'instant' ? draw() : restartAnim();
}

function onSliderNRays(val) {
  sim.nRays = parseInt(val);
  document.getElementById('lbl-nrays').textContent = sim.nRays;
  sim.mode === 'instant' ? draw() : restartAnim();
}

function onSliderAlpha(val) {
  sim.alpha = -parseInt(val);
  const displayAlpha = -sim.alpha;
  const sign = displayAlpha >= 0 ? '+' : '';
  document.getElementById('lbl-alpha').textContent = sign + displayAlpha + '°';
  compute();
  sim.mode === 'instant' ? draw() : restartAnim();
}

function togglePausePlay() {
  sim.animPaused = !sim.animPaused;
  const btn = document.getElementById('btn-pause-play');
  if (sim.animPaused) {
    btn.textContent = '▶ Play'; btn.classList.remove('active');
    sim.animRunning = false;
  } else {
    btn.textContent = '⏸ Pause'; btn.classList.add('active');
    if (sim.mode === 'anim' && !sim.animRunning && sim.animT < 1.0) {
      sim.animRunning = true; sim.lastTs = 0;
      requestAnimationFrame(animLoop);
    }
  }
}

function resetAnim() {
  sim.animRewind = false;
  sim.animT      = 0;
  sim.animRunning = false;
  document.getElementById('speed-rewind').style.opacity = '0.5';
  if (!sim.animPaused && sim.mode === 'anim') {
    sim.animRunning = true; sim.lastTs = 0;
    requestAnimationFrame(animLoop);
  } else {
    draw();
  }
}

function toggleMultiPoints() {
  sim.multiPoints = !sim.multiPoints;
  const btn = document.getElementById('btn-multipoints');
  btn.textContent = 'Points sources sur tout l\'objet : ' + (sim.multiPoints ? 'OUI' : 'NON');
  if (sim.multiPoints) btn.classList.add('active'); else btn.classList.remove('active');
  sim.mode === 'instant' ? draw() : restartAnim();
}

function toggleConjugaison() {
  sim.conjugaison = !sim.conjugaison;
  const btn = document.getElementById('btn-conjugaison');
  btn.textContent = 'Relation de conjugaison : ' + (sim.conjugaison ? 'OUI' : 'NON');
  if (sim.conjugaison) btn.classList.add('active'); else btn.classList.remove('active');
  const tbl = document.getElementById('conjugaison-table');
  if (sim.conjugaison) {
    tbl.classList.add('visible');
    updateConjugaison();
    updateTableHeight();
  } else {
    tbl.classList.remove('visible');
  }
}

/* ═══════════════════════════════════════════════════
   ANIMATION "OBJET VERS L'INFINI"
════════════════════════════════════════════════════ */

function infiniAnimSetControls(animRunning) {
  const disabled = animRunning;
  document.getElementById('sl-h').disabled     = disabled;
  document.getElementById('sl-f').disabled     = disabled;
  document.getElementById('sl-nrays').disabled = disabled;
  document.getElementById('btn-conv').disabled = disabled;
  document.getElementById('btn-div').disabled  = disabled;

  const btnAnim = document.getElementById('btn-infini-anim');
  btnAnim.textContent = animRunning ? '⏹ Arrêter' : '▶ Animation';
  if (animRunning) btnAnim.classList.add('active'); else btnAnim.classList.remove('active');

  const btnPlay = document.getElementById('btn-infini-play');
  btnPlay.disabled    = !animRunning;
  btnPlay.textContent = '⏸ Pause';
  btnPlay.classList.remove('active');
}

function animerVersInfini() {
  const btnInfini = document.getElementById('btn-infini');
  const rowH      = document.getElementById('row-h');
  const rowAlpha  = document.getElementById('row-alpha');
  const slAlpha   = document.getElementById('sl-alpha');

  const OA_INFINI = -2000;
  const T_HOLD    = 0.5;
  const T_MOVE    = 10.0;
  const T_TOTAL   = T_HOLD + T_MOVE;

  const OA_START = sim.OA;
  btnInfini.textContent = 'Objet à l\'infini : OUI';
  btnInfini.classList.add('active');
  btnInfini.disabled    = true;
  rowH.classList.add('disabled');
  sim.infiniAnim        = true;
  sim.infiniAnimPaused  = false;
  infiniAnimSetControls(true);
  compute(); draw();

  const invStart = 1 / OA_START;
  const invEnd   = 1 / OA_INFINI;
  let elapsed = 0, lastTs = 0;

  function step(ts) {
    if (!sim.infiniAnim) return;
    if (sim.infiniAnimPaused) { lastTs = 0; requestAnimationFrame(step); return; }
    if (lastTs === 0) lastTs = ts;
    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    elapsed = Math.min(elapsed + dt, T_TOTAL);

    if (elapsed > T_HOLD) {
      const u = (elapsed - T_HOLD) / T_MOVE;
      sim.OA  = 1 / (invStart + (invEnd - invStart) * Math.min(u, 1));
    }
    compute(); draw();

    if (elapsed < T_TOTAL) {
      requestAnimationFrame(step);
    } else {
      sim.infiniAnim       = false;
      sim.infiniAnimPaused = false;
      sim.infini           = true;
      sim.alpha            = 0;

      btnInfini.textContent = 'Objet à l\'infini : OUI';
      btnInfini.classList.add('active');
      btnInfini.disabled    = false;
      rowAlpha.classList.remove('disabled');
      slAlpha.disabled = false;

      infiniAnimSetControls(false);
      document.getElementById('btn-infini-play').disabled = true;
      document.getElementById('btn-infini-anim').disabled = (sim.mode === 'anim') || sim.infini;

      compute();
      sim.mode === 'instant' ? draw() : restartAnim();
    }
  }
  requestAnimationFrame(step);
}

function toggleInfiniAnim() {
  if (sim.infiniAnim) {
    sim.infiniAnim       = false;
    sim.infiniAnimPaused = false;
    sim.infini           = false;
    sim.OA               = sim.OA_DEFAULT;

    const btnInfini = document.getElementById('btn-infini');
    btnInfini.textContent = 'Objet à l\'infini : NON';
    btnInfini.classList.remove('active');
    btnInfini.disabled    = false;
    document.getElementById('row-h').classList.remove('disabled');
    document.getElementById('sl-h').disabled = false;
    document.getElementById('row-alpha').classList.add('disabled');
    document.getElementById('sl-alpha').disabled = true;

    infiniAnimSetControls(false);
    document.getElementById('btn-infini-play').disabled = true;

    compute();
    sim.mode === 'instant' ? draw() : restartAnim();
  } else {
    if (sim.infini) return;
    animerVersInfini();
  }
}

function toggleInfiniPlay() {
  if (!sim.infiniAnim) return;
  sim.infiniAnimPaused = !sim.infiniAnimPaused;
  const btn = document.getElementById('btn-infini-play');
  btn.textContent = sim.infiniAnimPaused ? '▶ Play' : '⏸ Pause';
  if (sim.infiniAnimPaused) btn.classList.add('active'); else btn.classList.remove('active');
}

function toggleInfini() {
  const btn      = document.getElementById('btn-infini');
  const rowH     = document.getElementById('row-h');
  const rowAlpha = document.getElementById('row-alpha');
  const slAlpha  = document.getElementById('sl-alpha');

  if (!sim.infini) {
    sim.infini = true;
    btn.textContent = 'Objet à l\'infini : OUI';
    btn.classList.add('active');
    rowH.classList.add('disabled');
    document.getElementById('sl-h').disabled = false;
    rowAlpha.classList.remove('disabled');
    slAlpha.disabled = false;
  } else {
    sim.infini = false;
    btn.textContent = 'Objet à l\'infini : NON';
    btn.classList.remove('active');
    rowH.classList.remove('disabled');
    document.getElementById('sl-h').disabled = false;
    rowAlpha.classList.add('disabled');
    slAlpha.disabled = true;
    sim.OA = sim.OA_DEFAULT;
  }

  document.getElementById('btn-infini-anim').disabled = sim.infini;
  compute();
  sim.mode === 'instant' ? draw() : restartAnim();
}

/* ═══════════════════════════════════════════════════
   SLIDER VITESSE CUSTOM
════════════════════════════════════════════════════ */
const SPEED_VALS   = [0.05, 0.125, 0.25, 0.375, 0.5];
const SPEED_LABELS = ['×0.1', '×0.25', '×0.5', '×0.75', '×1'];

(function () {
  let isDragging = false;
  let isRewind   = false;

  function setSpeedIdx(idx) {
    sim.animSpeedMult = SPEED_VALS[idx];
    document.getElementById('lbl-speed').textContent = SPEED_LABELS[idx];
    updateThumb(idx / (SPEED_VALS.length - 1) * 100);
    if (sim.mode === 'anim' && !sim.animRunning && !sim.animPaused) {
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
    fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
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
    isRewind = true;
    sim.animRewind      = true;
    sim.animRewindMult  = mult || 1.0;
    document.getElementById('lbl-speed').textContent = '⏪';
    document.getElementById('speed-rewind').style.opacity = '1';
    if (sim.mode === 'anim' && !sim.animRunning) {
      sim.animRunning = true; sim.lastTs = 0;
      requestAnimationFrame(animLoop);
    }
  }

  function stopRewind() {
    if (!isRewind) return;
    isRewind = false;
    sim.animRewind = false;
    document.getElementById('speed-rewind').style.opacity = '0.5';
    setSpeedIdx(0);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const track = document.getElementById('speed-track');
    const thumb = document.getElementById('speed-thumb');
    if (!track) return;

    function onDown(e) {
      isDragging = true;
      thumb.style.cursor = 'grabbing';
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
        const minPx   = rewindRect.left - trackRect.left;
        const minPct  = minPx / trackRect.width * 100;
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
      isDragging = false;
      thumb.style.cursor = 'grab';
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
resize();
document.getElementById('row-speed').style.display = 'none';
document.addEventListener('DOMContentLoaded', () => {
  const thumb = document.getElementById('speed-thumb');
  if (thumb) thumb.style.left = '100%';
});
setTimeout(() => { document.getElementById('drag-hint').classList.add('hidden'); }, 5000);
