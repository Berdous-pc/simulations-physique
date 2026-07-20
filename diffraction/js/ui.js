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
  if (name === 'D')      { sim.D      = v; document.getElementById('lbl-D').textContent      = formatFr(v, 1); }
  if (name === 'd')      { sim.d      = v; document.getElementById('lbl-d').textContent      = formatFr(v, 2); appliquerBorneD(); }
  updateSceneParams();
  updateReadouts();
}

// ─────────────────────────────────────────────────────────────────────
//  Recalcule la borne max de D (dépend de d, cf. sim.js → dMaxPourPetitD)
//  et l'applique au slider D ; si D dépasse la nouvelle borne, le cappe.
// ─────────────────────────────────────────────────────────────────────
function appliquerBorneD() {
  const dMax = dMaxPourPetitD(sim.d);
  const slD = document.getElementById('sl-D');
  slD.max = dMax;
  if (sim.D > dMax) {
    sim.D = dMax;
    slD.value = sim.D;
    document.getElementById('lbl-D').textContent = formatFr(sim.D, 1);
  }
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
//  Bascule l'affichage des doubles flèches de mesure (d, D, L).
// ─────────────────────────────────────────────────────────────────────
function toggleLengths() {
  sim.showLengths = !sim.showLengths;
  document.getElementById('btn-lengths').classList.toggle('active', sim.showLengths);
  updateSceneParams();
}

// ─────────────────────────────────────────────────────────────────────
//  Bascule entre source monochromatique (réglable via λ) et lumière blanche : la texture
//  d'écran devient une somme de 6 couleurs de référence (cf. sim.js → intensiteBlancheRGB),
//  le graphe trace une courbe par couleur cochée dans sa légende (cf. graph.js →
//  syncGraphModeBlanche). Le slider λ, l'angle de diffraction et les encarts θ/largeur
//  n'ont de sens que pour une seule longueur d'onde : désactivés/masqués en mode blanc
//  (cf. syncModeBlancheUI ci-dessous).
// ─────────────────────────────────────────────────────────────────────
const LIGHT_SOURCE_LABELS = { mono: 'Monochromatique', blanche: 'Lumière blanche' };
function renderLightSourceLabel() {
  const btn = document.getElementById('btn-light-source');
  btn.innerHTML = 'Source lumineuse :<br>' + LIGHT_SOURCE_LABELS[sim.lightSource];
  btn.classList.toggle('active', sim.lightSource === 'blanche');
  const rowLambda = document.getElementById('row-lambda');
  const slLambda = document.getElementById('sl-lambda');
  const estMono = sim.lightSource === 'mono';
  rowLambda.classList.toggle('disabled', !estMono);
  slLambda.disabled = !estMono;
}

// ─────────────────────────────────────────────────────────────────────
//  (Dés)active tout ce qui n'a de sens que pour une seule longueur d'onde : bouton "Tracer
//  l'angle de diffraction" et encarts θ/largeur tache centrale (section Valeurs), masqués en
//  lumière blanche — coupe aussi sim.showRays s'il était actif, pour ne pas laisser les rayons
//  affichés dans la scène 3D une fois le bouton qui les pilote masqué. Appelée par
//  cycleLightSource(), resetSim() et init().
// ─────────────────────────────────────────────────────────────────────
function syncModeBlancheUI() {
  const estBlanche = sim.lightSource === 'blanche';
  document.getElementById('btn-rays').style.display = estBlanche ? 'none' : '';
  document.getElementById('section-valeurs').style.display = estBlanche ? 'none' : '';
  if (estBlanche && sim.showRays) {
    sim.showRays = false;
    document.getElementById('btn-rays').classList.remove('active');
  }
  // Le bouton "Décomposer" n'a de sens qu'en lumière blanche (+ vue Écran, cf.
  // syncBoutonDecompose) : revenir en monochromatique annule toute décomposition en cours,
  // instantanément (pas d'animation), cf. sa docstring.
  if (!estBlanche) annulerDecompose();
  syncBoutonDecompose();
  syncGraphModeBlanche();
}

function cycleLightSource() {
  sim.lightSource = (sim.lightSource === 'mono') ? 'blanche' : 'mono';
  renderLightSourceLabel();
  syncModeBlancheUI();
  updateSceneParams();
  updateReadouts();
}

// ─────────────────────────────────────────────────────────────────────
//  Bascule cyclique du mode de représentation du faisceau lumineux :
//  visible (laser + faisceau diffracté) → laser uniquement (comme avant
//  la fente) → non visible (seule la tache sur l'écran, avec un point de
//  couleur en sortie du laser pour identifier λ sans dessiner de faisceau).
// ─────────────────────────────────────────────────────────────────────
const BEAM_MODES = ['off', 'laserOnly', 'visible'];
const BEAM_MODE_LABELS = {
  off: 'Non visible',
  laserOnly: 'Laser uniquement',
  visible: 'Visible'
};
function renderBeamModeLabel() {
  const btn = document.getElementById('btn-beam-mode');
  btn.innerHTML = 'Faisceau lumineux :<br>' + BEAM_MODE_LABELS[sim.beamMode];
  btn.classList.toggle('active', sim.beamMode !== 'off');
}
function cycleBeamMode() {
  const i = BEAM_MODES.indexOf(sim.beamMode);
  sim.beamMode = BEAM_MODES[(i + 1) % BEAM_MODES.length];
  renderBeamModeLabel();
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
  document.getElementById('ro-theta').textContent = formatFr(theta * 180 / Math.PI, 2);
  document.getElementById('ro-largeur').textContent = formatFr(2 * x1 * 100, 2);
  document.getElementById('lambda-swatch').style.background = longueurOndeVersCss(sim.lambda);
}

// ─────────────────────────────────────────────────────────────────────
//  Réinitialise complètement la simulation.
// ─────────────────────────────────────────────────────────────────────
function resetSim() {
  resetParams();
  appliquerBorneD();
  document.getElementById('sl-lambda').value = sim.lambda;
  document.getElementById('sl-a').value = sim.a;
  document.getElementById('sl-D').value = sim.D;
  document.getElementById('sl-d').value = sim.d;
  document.getElementById('lbl-lambda').textContent = sim.lambda.toFixed(0);
  document.getElementById('lbl-a').textContent = sim.a.toFixed(0);
  document.getElementById('lbl-D').textContent = formatFr(sim.D, 1);
  document.getElementById('lbl-d').textContent = formatFr(sim.d, 2);
  document.getElementById('btn-rays').classList.remove('active');
  document.getElementById('btn-lengths').classList.remove('active');
  renderBeamModeLabel();
  renderLightSourceLabel();
  syncModeBlancheUI();

  gview.xMin = -sim.screenHalfWidth;
  gview.xMax = sim.screenHalfWidth;
  gview.yMin = 0;
  gview.yMax = 1.05;
  graphPins.length = 0;
  if (graphPinMode) toggleGraphPin();

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
  tickDecompose();
  drawIntensityGraph();
  dessinerLienFigure();
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
  initLegendeBlanche();
  appliquerBorneD();
  renderBeamModeLabel();
  renderLightSourceLabel();
  syncModeBlancheUI();
  resize();
  updateReadouts();
  requestAnimationFrame(loop);
}

init();
