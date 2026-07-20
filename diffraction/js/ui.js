// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
//  ui.js — Contrôles UI, boucle d'animation, initialisation
//  Dépend de : sim.js, scene.js, graph.js
//  Chargé en dernier.
// ═══════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────
//  Met à jour un paramètre physique depuis un slider.
// ─────────────────────────────────────────────────────────────────────
function updateParam(name, val) {
  const v = parseFloat(val);
  if (name === 'lambda') { sim.lambda = v; document.getElementById('lbl-lambda').textContent = v.toFixed(0); }
  if (name === 'a')      { sim.a      = v; document.getElementById('lbl-a').textContent      = v.toFixed(0); }
  if (name === 'D')      { sim.D      = v; document.getElementById('lbl-D').textContent      = v.toFixed(1); }
  updateSceneParams();
  updateReadouts();
}

// ─────────────────────────────────────────────────────────────────────
//  Bascule l'affichage des rayons pointillés vers les 1ers minima.
// ─────────────────────────────────────────────────────────────────────
function toggleRays() {
  sim.showRays = !sim.showRays;
  document.getElementById('btn-rays').classList.toggle('active', sim.showRays);
  updateSceneParams();
}

// ─────────────────────────────────────────────────────────────────────
//  Bascule cyclique du mode de représentation du faisceau lumineux :
//  visible (laser + faisceau diffracté) → laser uniquement (comme avant
//  la fente) → non visible (seule la tache sur l'écran, avec un point de
//  couleur en sortie du laser pour identifier λ sans dessiner de faisceau).
// ─────────────────────────────────────────────────────────────────────
const BEAM_MODES = ['visible', 'laserOnly', 'off'];
const BEAM_MODE_LABELS = {
  visible: 'Faisceau lumineux : Visible',
  laserOnly: 'Faisceau lumineux : Laser uniquement',
  off: 'Faisceau lumineux : Non visibles'
};
function cycleBeamMode() {
  const i = BEAM_MODES.indexOf(sim.beamMode);
  sim.beamMode = BEAM_MODES[(i + 1) % BEAM_MODES.length];
  document.getElementById('btn-beam-mode').textContent = BEAM_MODE_LABELS[sim.beamMode];
  updateSceneParams();
}

// ─────────────────────────────────────────────────────────────────────
//  Bascule la vue caméra (3D / Dessus / Profil / Écran).
// ─────────────────────────────────────────────────────────────────────
function setView(view) {
  setSceneView(view);
  document.querySelectorAll('.btn-view').forEach(b => b.classList.toggle('active', b.dataset.view === view));
}

// ─────────────────────────────────────────────────────────────────────
//  Met à jour les encarts de valeurs instantanées.
// ─────────────────────────────────────────────────────────────────────
function updateReadouts() {
  const theta = thetaPremierMinimum(sim.lambda, sim.a);
  const x1 = xPremierMinimum(sim.lambda, sim.a, sim.D);
  document.getElementById('ro-theta').textContent = (theta * 180 / Math.PI).toFixed(2);
  document.getElementById('ro-largeur').textContent = (2 * x1 * 100).toFixed(2);
  document.getElementById('lambda-swatch').style.background = longueurOndeVersCss(sim.lambda);
}

// ─────────────────────────────────────────────────────────────────────
//  Réinitialise complètement la simulation.
// ─────────────────────────────────────────────────────────────────────
function resetSim() {
  resetParams();
  document.getElementById('sl-lambda').value = sim.lambda;
  document.getElementById('sl-a').value = sim.a;
  document.getElementById('sl-D').value = sim.D;
  document.getElementById('lbl-lambda').textContent = sim.lambda.toFixed(0);
  document.getElementById('lbl-a').textContent = sim.a.toFixed(0);
  document.getElementById('lbl-D').textContent = sim.D.toFixed(1);
  document.getElementById('btn-rays').classList.add('active');
  document.getElementById('btn-beam-mode').textContent = BEAM_MODE_LABELS.visible;

  tangentesFig.length = 0;
  graphViewHistory.length = 0;
  document.getElementById('btn-graph-prev').disabled = true;
  gview.xMin = -sim.screenHalfWidth;
  gview.xMax = sim.screenHalfWidth;
  gview.yMin = 0;
  gview.yMax = 1.05;

  setView('3d');
  reset3DCamera();
  updateSceneParams();
  updateReadouts();
}

function toggleHint(tab) {
  const hint = document.getElementById('panel-hint-' + tab);
  if (hint) hint.classList.toggle('collapsed');
}

// ─────────────────────────────────────────────────────────────────────
//  Onglets principaux du panneau : Ondes de surfaces / Ondes lumineuses.
// ─────────────────────────────────────────────────────────────────────
function setMainTab(tab) {
  history.replaceState(null, '', location.pathname + '#' + tab);
  ['surfaces', 'lumineuses'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
    document.getElementById('section-' + t).style.display = (t === tab) ? '' : 'none';
    document.getElementById('panel-hint-' + t).style.display = (t === tab) ? '' : 'none';
  });
  document.getElementById('lumineuses-area').style.display = (tab === 'lumineuses') ? '' : 'none';
  document.getElementById('surfaces-area').style.display = (tab === 'surfaces') ? '' : 'none';

  // #lumineuses-area est display:none pendant l'onglet Surfaces : la scène 3D
  // et le canvas du graphe n'ont des dimensions exploitables qu'une fois
  // réaffichés — on relance donc le resize ici, pas seulement une fois à init().
  if (tab === 'lumineuses') resize();
}

// ═══════════════════════════════════════════════════
//  SPLITTER DRAGGABLE (entre scène 3D et graphe)
// ═══════════════════════════════════════════════════
(function initSplitter() {
  const splitter = document.getElementById('left-splitter');
  const sceneEl  = document.getElementById('scene-area');
  const graphEl  = document.getElementById('graph-area');
  const leftCol  = document.getElementById('left-col');
  const minH     = 80;
  let dragging   = false;
  let startY     = 0;
  let startSceneH = 0;
  let ratio      = null;

  function applyRatio(r) {
    const colH  = leftCol.getBoundingClientRect().height;
    const splH  = splitter.getBoundingClientRect().height;
    const avail = colH - splH;
    const newSceneH = Math.max(minH, Math.min(avail - minH, Math.round(r * avail)));
    sceneEl.style.flex = 'none';
    sceneEl.style.height = newSceneH + 'px';
    graphEl.style.flex = 'none';
    graphEl.style.height = (avail - newSceneH) + 'px';
    resize();
  }

  splitter.addEventListener('mousedown', e => {
    dragging = true;
    startY = e.clientY;
    startSceneH = sceneEl.getBoundingClientRect().height;
    splitter.classList.add('dragging');
    document.body.style.cursor = 'row-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    const colH = leftCol.getBoundingClientRect().height;
    const splH = splitter.getBoundingClientRect().height;
    const avail = colH - splH;
    const newSceneH = Math.max(minH, Math.min(avail - minH, startSceneH + dy));
    ratio = newSceneH / avail;
    sceneEl.style.flex = 'none';
    sceneEl.style.height = newSceneH + 'px';
    graphEl.style.flex = 'none';
    graphEl.style.height = (avail - newSceneH) + 'px';
    resize();
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove('dragging');
    document.body.style.cursor = '';
  });

  window.addEventListener('resize', () => {
    if (ratio === null) return;
    applyRatio(ratio);
  });
})();

// ═══════════════════════════════════════════════════
//  REDIMENSIONNEMENT (anti-rebond via requestAnimationFrame)
// ═══════════════════════════════════════════════════
let resizeScheduled = false;
function resize() {
  if (resizeScheduled) return;
  resizeScheduled = true;
  requestAnimationFrame(() => {
    resizeScheduled = false;
    resizeScene();
    resizeGraphCanvas();
  });
}
window.addEventListener('resize', resize);
document.addEventListener('fullscreenchange', resize);
document.addEventListener('webkitfullscreenchange', resize);

// ═══════════════════════════════════════════════════
//  BOUCLE D'ANIMATION (~60 fps) — rendu 3D en continu (damping caméra)
// ═══════════════════════════════════════════════════
function loop() {
  renderScene();
  drawIntensityGraph();
  requestAnimationFrame(loop);
}

// ═══════════════════════════════════════════════════
//  INITIALISATION
// ═══════════════════════════════════════════════════
function init() {
  const hash = (location.hash || '').replace('#', '');
  const tab = (hash === 'surfaces' || hash === 'lumineuses') ? hash : 'lumineuses';
  setMainTab(tab);

  initScene();
  initGraphInteractions();
  resize();
  updateReadouts();
  requestAnimationFrame(loop);
}

init();
