// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

/* ui.js — contrôles UI, onglets et boucle d'animation. Chargé en dernier. */

/* ══════════════════════════════════════════════════
   Redimensionnement
══════════════════════════════════════════════════ */

/* Toute la géométrie (cristal, positions, tailles) raisonne en unités de
   scène fixes (STAGE_W/STAGE_H, cf. sim.js), jamais en pixels réels du
   conteneur DOM : resize() adapte cette scène fixe à l'écran par une simple
   mise à l'échelle uniforme en mode « cover » (remplit l'espace disponible,
   rogne l'excédent si les proportions ne correspondent pas), comme une vidéo
   dans un lecteur — la composition ne change donc jamais selon la
   machine/fenêtre, seule l'échelle d'affichage varie. devicePixelRatio
   sur-échantillonne en plus la surface mémoire du canvas pour un rendu net
   sur écrans haute densité, sans influencer la géométrie. */
function resize() {
  const canvas = document.getElementById('anim-canvas');
  const wrap = canvas.parentElement;
  const wrapW = wrap.clientWidth || STAGE_W, wrapH = wrap.clientHeight || STAGE_H;
  const scale = Math.max(wrapW / STAGE_W, wrapH / STAGE_H);   // « cover » : remplit, rogne l'excédent
  const cssW = STAGE_W * scale, cssH = STAGE_H * scale;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(cssW * dpr / STAGE_W, 0, 0, cssH * dpr / STAGE_H, 0, 0);   // dessin exprimé en unités de scène fixes
  computeCrystalGeometry();
  drawScene();
}
window.addEventListener('resize', resize);

/* Convertit un événement souris sur le canvas (e.offsetX/offsetY, en pixels
   CSS réellement affichés) en unités de scène (0..STAGE_W / 0..STAGE_H) —
   utilisé par le tooltip de coordonnées et le panneau de réglage (édition du
   cristal/scénario par clic). offsetX/Y sont déjà relatifs à la boîte du
   canvas lui-même (pas au conteneur), donc aucun décalage supplémentaire à
   gérer même quand le canvas déborde visuellement du conteneur (mode « cover »). */
function toStageXY(e) {
  const canvas = document.getElementById('anim-canvas');
  const scale = canvas.clientWidth / STAGE_W;
  return { x: e.offsetX / scale, y: e.offsetY / scale };
}

/* ══════════════════════════════════════════════════
   Rendu de la scène
══════════════════════════════════════════════════ */
function drawScene() {
  const canvas = document.getElementById('anim-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, STAGE_W, STAGE_H);
  drawCristal(ctx);
  drawProcesses(ctx);
  drawTextBoxes(ctx);
  const timer = document.getElementById('sim-timer');
  if (timer) {
    timer.textContent = Math.round(state.animT) + ' ms' + (state.pauseHoldRemaining > 0 ? ' ⏸' : '');
  }
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
    if (state.pauseHoldRemaining > 0) {
      /* Point de pause en cours : le temps réel s'écoule mais rien ne
         progresse dans le scénario (animT figé) — l'animation est visuellement
         à l'arrêt le temps que les élèves lisent l'explication affichée. */
      state.pauseHoldRemaining = Math.max(0, state.pauseHoldRemaining - dt);
    } else {
      const pp = PAUSE_POINTS.find(p => !p.fired && state.animT >= p.atMs);
      if (pp) {
        pp.fired = true;
        state.pauseHoldRemaining = pp.holdMs;
      } else {
        state.animT += dt;
        if (state.animT >= DURATION_MS) {
          state.animT = DURATION_MS;
          state.ended = true;
          _updatePlayBtn();
        }
        advanceFadeIns(dt);
        updateProcesses(dt);
        if (!state.ended) runScript();
      }
    }
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
  state.pauseHoldRemaining = 0;
  state.nextProcessId = 0;
  state.spawnCounter = 0;
  state.processes = [];
  DISSOLUTION_SCRIPT.forEach(e => { e.fired = false; });
  PAUSE_POINTS.forEach(p => { p.fired = false; });
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
   Tooltip de coordonnées (TEMPORAIRE — aide au positionnement pendant le
   développement ; à retirer avec #coord-tooltip une fois le calage terminé).
══════════════════════════════════════════════════ */
function initCoordTooltip() {
  const canvas = document.getElementById('anim-canvas');
  const tooltip = document.getElementById('coord-tooltip');
  if (!canvas || !tooltip) return;
  canvas.addEventListener('mousemove', e => {
    const { x: sx, y: sy } = toStageXY(e);
    const x = Math.round(sx), y = Math.round(sy);
    tooltip.textContent = x + ', ' + y;
    tooltip.style.left = (e.offsetX + 14) + 'px';
    tooltip.style.top = (e.offsetY + 14) + 'px';
    tooltip.style.display = 'block';
  });
  canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
}

/* ══════════════════════════════════════════════════
   Initialisation
══════════════════════════════════════════════════ */
function init() {
  resize();
  buildCristal();
  initFreeWater();
  _updatePlayBtn();
  initCoordTooltip();
  requestAnimationFrame(loop);
}
window.addEventListener('DOMContentLoaded', init);
