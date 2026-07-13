// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

/* fullscreen.js — mode plein écran de la zone d'animation (#anim-canvas-wrap
   uniquement, sans l'image du verre ni le panneau de droite) et sa barre de
   contrôle inférieure (lecture/pause, timing, sortie), qui s'estompe après
   quelques secondes d'inactivité de la souris comme dans un lecteur vidéo. */

function toggleFullscreen() {
  const wrap = document.getElementById('anim-canvas-wrap');
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    wrap.requestFullscreen();
  }
}

function exitFullscreenAnim() {
  if (document.fullscreenElement) document.exitFullscreen();
}

let _fsFadeTimer = null;
function _fsShowControls() {
  document.getElementById('anim-canvas-wrap').classList.remove('fs-controls-hidden');
}
function _fsArmFadeTimer() {
  clearTimeout(_fsFadeTimer);
  _fsFadeTimer = setTimeout(() => {
    document.getElementById('anim-canvas-wrap').classList.add('fs-controls-hidden');
  }, 1000);
}

document.addEventListener('fullscreenchange', () => {
  const wrap = document.getElementById('anim-canvas-wrap');
  const isFs = document.fullscreenElement === wrap;
  wrap.classList.toggle('is-fullscreen', isFs);
  if (isFs) {
    _fsShowControls();
    _fsArmFadeTimer();
  } else {
    clearTimeout(_fsFadeTimer);
    wrap.classList.remove('fs-controls-hidden');
  }
  /* La scène raisonne en unités fixes mises à l'échelle par resize() (ui.js) :
     le changement de taille du conteneur en plein écran doit redéclencher
     cette mise à l'échelle, comme un simple redimensionnement de fenêtre. */
  resize();
});

window.addEventListener('DOMContentLoaded', () => {
  const wrap = document.getElementById('anim-canvas-wrap');
  const controls = document.getElementById('fs-controls');
  const canvas = document.getElementById('anim-canvas');

  wrap.addEventListener('mousemove', () => {
    if (document.fullscreenElement !== wrap) return;
    _fsShowControls();
    _fsArmFadeTimer();
  });

  /* Tant que la souris survole la barre elle-même, elle reste affichée —
     seul le déplacement hors de la barre relance le compte à rebours. */
  controls.addEventListener('mouseenter', () => clearTimeout(_fsFadeTimer));
  controls.addEventListener('mouseleave', () => {
    if (document.fullscreenElement === wrap) _fsArmFadeTimer();
  });

  /* Clic dans la zone d'animation (hors barre de contrôle) : joue/pause,
     comme la plupart des lecteurs vidéo en plein écran. */
  canvas.addEventListener('click', () => {
    if (document.fullscreenElement !== wrap) return;
    togglePause();
    _fsFlashCenterIcon(state.paused ? '⏸' : '▶');
  });
});

/* Symbole play/pause affiché brièvement au centre de l'écran au clic — même
   principe que YouTube/lecteurs média : icône de l'action qui vient d'être
   effectuée, apparition instantanée puis fondu. */
let _fsIconFadeTimer = null;
function _fsFlashCenterIcon(symbol) {
  const icon = document.getElementById('fs-center-icon');
  if (!icon) return;
  icon.textContent = symbol;
  icon.classList.remove('show', 'icon-play', 'icon-pause');
  icon.classList.add(symbol === '▶' ? 'icon-play' : 'icon-pause');
  void icon.offsetWidth;   // force le redémarrage de la transition CSS
  icon.classList.add('show');
  clearTimeout(_fsIconFadeTimer);
  _fsIconFadeTimer = setTimeout(() => icon.classList.remove('show'), 500);
}
