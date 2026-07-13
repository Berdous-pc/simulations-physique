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
  }, 2500);
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
  wrap.addEventListener('mousemove', () => {
    if (document.fullscreenElement !== wrap) return;
    _fsShowControls();
    _fsArmFadeTimer();
  });
});
