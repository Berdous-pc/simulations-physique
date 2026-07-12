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
  /* Chrono lié au panneau dev (DEV_PANEL_ENABLED, devpanel.js) : masqué et
     non mis à jour quand le panneau est désactivé, comme le veut le fait que
     ce n'est qu'un outil de calage, pas un élément destiné aux élèves. */
  const timer = document.getElementById('sim-timer');
  if (timer && DEV_PANEL_ENABLED) {
    timer.textContent = Math.round(state.animT) + ' ms' + (isPauseActive(state.animT) ? ' ⏸' : '');
  }

  /* Barre de progression + temps courant / durée totale (destinées aux
     élèves, contrairement au chrono ci-dessus) : arrondies à la seconde
     indépendamment l'une de l'autre (38100 ms → "38 s", pas de troncature). */
  const bar = document.getElementById('progress-bar');
  if (bar) bar.value = state.animT;
  const timeLabel = document.getElementById('progress-time');
  if (timeLabel) {
    timeLabel.textContent = Math.round(state.animT / 1000) + ' s / ' + Math.round(DURATION_MS / 1000) + ' s';
  }
}

/* Vitesse de lecture globale (sélecteur « Vitesse » du panneau de commande) :
   multiplie le dt réel de la boucle, donc toute la timeline (animT, pauses,
   boîtes de texte) — distincte du multiplicateur individuel DISSOLUTION_SCRIPT[i].speed
   qui, lui, ne ralentit/accélère qu'un seul ion (cf. cristal.js). Les deux se
   combinent multiplicativement (updateProcesses reçoit un dt déjà mis à
   l'échelle par PLAYBACK_SPEED, puis l'affine encore par p.speed). */
let PLAYBACK_SPEED = 1;
function setPlaybackSpeed(v) {
  PLAYBACK_SPEED = Number(v) || 1;
}

/* Reconstruit déterministiquement l'état de la simulation à l'instant
   `targetMs` : repart de zéro (resetSimAnim) puis rejoue toutes les étapes
   par petits pas de temps fixes, sans dessiner ni attendre — la simulation
   étant entièrement déterministe, le résultat est identique à une lecture en
   temps réel jusqu'à cet instant. Utilisé par la barre de progression
   (onProgressBarInput) et par le panneau dev (curseur "Temps", devpanel.js). */
function seekTo(targetMs) {
  resetSimAnim();
  const STEP = 16;
  let t = 0;
  while (t < targetMs) {
    const dt = Math.min(STEP, targetMs - t);
    t += dt;
    state.animT = t;
    if (state.animT >= DURATION_MS) { state.animT = DURATION_MS; state.ended = true; }
    /* Même règle de gel qu'en lecture temps réel (loop(), ci-dessous) : animT
       avance normalement, seule la simulation est gelée dans la fenêtre d'un
       point de pause. */
    if (!isPauseActive(state.animT)) {
      advanceFadeIns(dt);
      updateProcesses(dt);
      if (!state.ended) runScript();
    }
    if (state.ended) break;
  }
  state.paused = true;
  _updatePlayBtn();
  drawScene();
}

/* Glisser la barre de progression met en pause (comme la plupart des
   lecteurs vidéo) et saute directement à l'instant visé. */
function onProgressBarInput(v) {
  seekTo(Number(v) || 0);
}

/* ══════════════════════════════════════════════════
   Boucle d'animation
══════════════════════════════════════════════════ */
let _lastTs = null;
function loop(ts) {
  if (_lastTs == null) _lastTs = ts;
  const dt = (state.paused || state.ended) ? 0 : Math.min(50, ts - _lastTs) * PLAYBACK_SPEED;
  _lastTs = ts;

  if (dt > 0) {
    /* animT est l'horloge unique de la timeline (temps réel écoulé depuis le
       début) : les points de pause en font partie intégrante, ils ne sont pas
       mis à part. Seule la simulation (fondus, processus, scénario) est gelée
       tant qu'on est dans la fenêtre d'un point de pause — l'animation reste
       visuellement figée pour laisser le temps de lire l'explication affichée. */
    state.animT += dt;
    if (state.animT >= DURATION_MS) {
      state.animT = DURATION_MS;
      state.ended = true;
      _updatePlayBtn();
    }
    if (!isPauseActive(state.animT)) {
      advanceFadeIns(dt);
      updateProcesses(dt);
      if (!state.ended) runScript();
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
  state.nextProcessId = 0;
  state.spawnCounter = 0;
  state.processes = [];
  DISSOLUTION_SCRIPT.forEach(e => { e.fired = false; });
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
  /* Tooltip de coordonnées : outil de calage, comme le panneau dev et le
     chrono — pas d'écouteur du tout quand DEV_PANEL_ENABLED est à false. */
  if (DEV_PANEL_ENABLED) initCoordTooltip();
  const bar = document.getElementById('progress-bar');
  if (bar) bar.max = DURATION_MS;
  requestAnimationFrame(loop);
}
window.addEventListener('DOMContentLoaded', init);
