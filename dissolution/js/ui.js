// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

/* ui.js — contrôles UI, onglets et boucle d'animation. Chargé en dernier. */

/* ══════════════════════════════════════════════════
   Redimensionnement
══════════════════════════════════════════════════ */
function resize() {
  const canvas = document.getElementById('anim-canvas');
  const wrap = canvas.parentElement;
  canvas.width = wrap.clientWidth || 600;
  canvas.height = wrap.clientHeight || 400;
  computeCrystalGeometry();
  /* Repositionne immédiatement les molécules libres sur la nouvelle zone
     solution, même en pause : sans cet appel, updateFreeWater() (qui lit la
     zone solution courante à chaque frame) n'est jamais invoqué tant que
     l'animation ne tourne pas, et les molécules restent figées à leurs
     anciennes positions (calculées pour l'ancienne taille de fenêtre) —
     ce qui les fait apparaître mal placées, voire superposées au cristal. */
  updateFreeWater(0);
  drawScene();
}
window.addEventListener('resize', resize);

/* ══════════════════════════════════════════════════
   Rendu de la scène
══════════════════════════════════════════════════ */
function drawScene() {
  const canvas = document.getElementById('anim-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawCristal(ctx);
  drawFreeWater(ctx);
  drawProcesses(ctx);
}

/* ══════════════════════════════════════════════════
   Boucle d'animation
══════════════════════════════════════════════════ */
let _lastTs = null;
function loop(ts) {
  if (_lastTs == null) _lastTs = ts;
  const dt = (state.paused || state.ended) ? 0 : Math.min(50, ts - _lastTs);
  _lastTs = ts;

  if (dt > 0) {
    state.animT += dt;
    if (state.animT >= DURATION_MS) {
      state.animT = DURATION_MS;
      state.ended = true;
      _updatePlayBtn();
    }
    updateFreeWater(dt);
    updateProcesses(dt);
    if (!state.ended && state.animT >= state.nextSpawnAt) tryStartNewProcess();
  }

  drawScene();
  requestAnimationFrame(loop);
}

/* ══════════════════════════════════════════════════
   Contrôles Lancer / Pause / Remettre à zéro
══════════════════════════════════════════════════ */
function togglePause() {
  if (state.ended) resetSimAnim();
  state.paused = !state.paused;
  _updatePlayBtn();
}

function resetSimAnim() {
  state.paused = true;
  state.ended = false;
  state.animT = 0;
  state.nextSpawnAt = 300;
  state.nextProcessId = 0;
  state.processes = [];
  buildCristal();
  initFreeWater();
  _updatePlayBtn();
  drawScene();
}

function _updatePlayBtn() {
  const btn = document.getElementById('btn-playpause');
  if (!btn) return;
  if (state.paused || state.ended) {
    btn.textContent = '▶ Lancer';
    btn.className = 'btn btn-play';
  } else {
    btn.textContent = '⏸ Pause';
    btn.className = 'btn btn-pause';
  }
}

/* ══════════════════════════════════════════════════
   Onglets principaux et bandeau d'instructions
══════════════════════════════════════════════════ */
function setMainTab(tab) {
  state.onglet = tab;
  ['mecanisme', 'dissolution'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
    document.getElementById('section-' + t).style.display = (t === tab) ? '' : 'none';
  });
  document.getElementById('panel-hint-mecanisme').style.display = (tab === 'mecanisme') ? '' : 'none';
}

function toggleHint(tab) {
  const hint = document.getElementById('panel-hint-' + tab);
  if (hint) hint.classList.toggle('collapsed');
}

/* ══════════════════════════════════════════════════
   Image décorative (verre d'eau + sel) — fournie plus tard
══════════════════════════════════════════════════ */
function onVerreLoad() {
  document.getElementById('img-verre').style.display = 'block';
  document.getElementById('verre-placeholder').style.display = 'none';
}
function onVerreError() {
  document.getElementById('img-verre').style.display = 'none';
}

/* ══════════════════════════════════════════════════
   Initialisation
══════════════════════════════════════════════════ */
function init() {
  resize();
  buildCristal();
  initFreeWater();
  _updatePlayBtn();
  requestAnimationFrame(loop);
}
window.addEventListener('DOMContentLoaded', init);
