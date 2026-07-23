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
//  Regroupe les reconstructions coûteuses (texture d'écran + enveloppe 3D via
//  updateSceneParams, encarts via updateReadouts, graphe via drawIntensityGraph) déclenchées
//  par un glissement de slider : l'évènement `oninput` peut se déclencher plus vite que
//  l'affichage (plusieurs fois entre deux frames réellement rendues par le navigateur) — sans
//  ce regroupement, chaque frappe relançait sa propre reconstruction complète alors que seul
//  le DERNIER état compte visuellement, empilant du travail pour rien pendant un glissement
//  rapide. Même principe que resize()/resizeScheduled plus bas : au plus un rebuild par frame,
//  quel que soit le nombre d'évènements oninput reçus entre-temps. sim.a/b/D/λ/d sont déjà à
//  jour (affectés de façon synchrone dans updateParam, AVANT l'appel à scheduleSceneUpdate)
//  au moment où le rebuild planifié s'exécute : aucune valeur intermédiaire n'est perdue,
//  seule sa reconstruction visuelle est coalescée.
// ─────────────────────────────────────────────────────────────────────
let sceneUpdateScheduled = false;
function scheduleSceneUpdate() {
  if (sceneUpdateScheduled) return;
  sceneUpdateScheduled = true;
  requestAnimationFrame(() => {
    sceneUpdateScheduled = false;
    updateSceneParams();
    updateReadouts();
    drawIntensityGraph();
  });
}

// ─────────────────────────────────────────────────────────────────────
//  Met à jour un paramètre physique depuis un slider.
// ─────────────────────────────────────────────────────────────────────
function updateParam(name, val) {
  const v = parseFloat(val);
  if (name === 'lambda') { sim.lambda = v; document.getElementById('lbl-lambda').textContent = v.toFixed(0); }
  if (name === 'a')      { sim.a      = v; document.getElementById('lbl-a').textContent      = v.toFixed(0); }
  // b : slider en mm (précision utile à ce réglage, 0,10–1,00), sim.b stocké en µm (même
  // convention que sim.a, consommée telle quelle par les formules physiques de sim.js).
  if (name === 'b')      { sim.b      = v * 1000; document.getElementById('lbl-b').textContent = formatFr(v, 2); }
  if (name === 'D')      { sim.D      = v; document.getElementById('lbl-D').textContent      = formatFr(v, 1); }
  if (name === 'd')      { sim.d      = v; document.getElementById('lbl-d').textContent      = formatFr(v, 2); appliquerBorneD(); }
  // Invalide le cache du graphe (cf. graph.js → invaliderCourbe) : λ/a/b/D affectent I(x)
  // directement ; `d` seul n'y intervient pas, MAIS appliquerBorneD() ci-dessus peut, en
  // cascade, capper sim.D (banc trop court) — donc invalider dans tous les cas plutôt que de
  // supposer que seuls certains noms de paramètre comptent.
  invaliderCourbe();
  scheduleSceneUpdate();
}

// ─────────────────────────────────────────────────────────────────────
//  Change la forme des 2 ouvertures de la diapositive (cf. sim.js → MASK_SHAPES). Le sens
//  physique du slider `a` change avec la forme (largeur de chaque fente / rayon de chaque
//  trou) — son label est mis à jour en conséquence, pas ses bornes (schématiques, cf.
//  MASK_SHAPES).
// ─────────────────────────────────────────────────────────────────────
function updateMaskShape(shape) {
  sim.maskShape = shape;
  syncMaskShapeUI();
  invaliderCourbe(); // la forme change intensiteOuverture (cf. sim.js), donc I(x)
  updateSceneParams();
  updateReadouts();
  drawIntensityGraph();
  if (typeof syncGraphLienDisponibilite === 'function') syncGraphLienDisponibilite();
}

// ─────────────────────────────────────────────────────────────────────
//  Resynchronise le sélecteur de forme et le label du slider `a` sur sim.maskShape — appelée
//  après un changement de forme, un reset ou à l'initialisation.
// ─────────────────────────────────────────────────────────────────────
function syncMaskShapeUI() {
  document.getElementById('sl-mask-shape').value = sim.maskShape;
  document.getElementById('lbl-a-titre').textContent = MASK_SHAPES[sim.maskShape].aLabel;
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
function renderLightSourceLabel() {
  document.getElementById('btn-light-mono').classList.toggle('active', sim.lightSource === 'mono');
  document.getElementById('btn-light-blanche').classList.toggle('active', sim.lightSource === 'blanche');
  const rowLambda = document.getElementById('row-lambda');
  const slLambda = document.getElementById('sl-lambda');
  const estMono = sim.lightSource === 'mono';
  rowLambda.classList.toggle('disabled', !estMono);
  slLambda.disabled = !estMono;
}

// ─────────────────────────────────────────────────────────────────────
//  (Dés)active tout ce qui n'a de sens que pour une seule longueur d'onde : bouton "Tracer
//  l'angle de diffraction", masqué en lumière blanche — coupe aussi sim.showRays s'il était
//  actif, pour ne pas laisser les rayons affichés dans la scène 3D une fois le bouton qui les
//  pilote masqué. La section Valeurs reste affichée dans les deux modes : cadre θ/largeur
//  unique en monochromatique, tableau à 6 lignes (une par couleur de référence, cf. sim.js →
//  BLANCHE_COULEURS) en lumière blanche, cf. updateReadouts(). Appelée par setLightSource(),
//  resetSim() et init().
// ─────────────────────────────────────────────────────────────────────
function syncModeBlancheUI() {
  const estBlanche = sim.lightSource === 'blanche';
  document.getElementById('btn-rays').style.display = estBlanche ? 'none' : '';
  if (estBlanche && sim.showRays) {
    sim.showRays = false;
    document.getElementById('btn-rays').classList.remove('active');
  }
  // Le bouton "Décomposer" n'a de sens qu'en lumière blanche (+ vue Écran, cf.
  // syncBoutonDecompose) : revenir en monochromatique annule toute décomposition en cours,
  // instantanément (pas d'animation), cf. sa docstring. Idem pour une reconstruction des 6
  // enveloppes couleur qui serait en attente (anti-rebond), inutile en quittant ce mode.
  if (!estBlanche) {
    annulerDecompose();
    annulerEnveloppesBlancheEnAttente();
    annulerChampsTextureBlancheEnAttente();
  }
  syncBoutonDecompose();
  syncGraphModeBlanche();
}

function setLightSource(source) {
  if (sim.lightSource === source) return;
  sim.lightSource = source;
  renderLightSourceLabel();
  syncModeBlancheUI();
  syncValeursExpUI();
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
//  (Dés)active l'affichage du graphe I(x) sous la scène 3D. Désactivé : le splitter et le
//  graphe sont masqués, la scène 3D occupe toute la zone centrale. Activé : comportement
//  d'origine (scène + splitter draggable + graphe), sans reprendre un éventuel ratio de
//  partage glissé manuellement avant la désactivation (repart du partage par défaut,
//  cf. flex:3/flex:2 en CSS).
// ─────────────────────────────────────────────────────────────────────
function syncGraphIntensiteUI() {
  const visible = sim.showGraphIntensite;
  const splitter = document.getElementById('left-splitter');
  const graphEl = document.getElementById('graph-area');
  const sceneEl = document.getElementById('scene-area');
  splitter.style.display = visible ? '' : 'none';
  graphEl.style.display = visible ? '' : 'none';
  sceneEl.style.flex = visible ? '' : '1';
  sceneEl.style.height = '';
  graphEl.style.flex = '';
  graphEl.style.height = '';
  document.getElementById('btn-graph-intensite').classList.toggle('active', visible);
  resize();
}
function toggleGraphIntensite() {
  sim.showGraphIntensite = !sim.showGraphIntensite;
  syncGraphIntensiteUI();
}

// ─────────────────────────────────────────────────────────────────────
//  (Dés)active l'affichage des valeurs expérimentales (angle de diffraction, largeur de la
//  tache centrale) sous la section Valeurs — désactivé par défaut. Bascule aussi entre le
//  cadre unique (monochromatique) et le tableau à 6 lignes (lumière blanche), cf.
//  updateReadouts().
// ─────────────────────────────────────────────────────────────────────
function syncValeursExpUI() {
  const visible = sim.showValeursExp;
  const estBlanche = sim.lightSource === 'blanche';
  document.getElementById('readouts-exp').style.display = (visible && !estBlanche) ? '' : 'none';
  document.getElementById('readouts-exp-blanche').style.display = (visible && estBlanche) ? '' : 'none';
  document.getElementById('btn-toggle-valeurs-exp').classList.toggle('active', visible);
}
function toggleValeursExp() {
  sim.showValeursExp = !sim.showValeursExp;
  syncValeursExpUI();
}

// ─────────────────────────────────────────────────────────────────────
//  Bascule la vue caméra (3D / Dessus / Profil / Écran).
// ─────────────────────────────────────────────────────────────────────
function setView(view) {
  setSceneView(view);
  document.querySelectorAll('.btn-view').forEach(b => b.classList.toggle('active', b.dataset.view === view));
}

// ─────────────────────────────────────────────────────────────────────
//  Bascule le grossissement de l'angle de diffraction (vue Dessus uniquement). La caméra se
//  recale toute seule dès la prochaine frame (renderScene() → updateOrthoCamera()), mais
//  l'écran/l'enveloppe/les rayons (cf. scene.js → zEcranAffiche) doivent, eux, être
//  repositionnés explicitement (updateSceneParams() n'est pas rappelée à chaque frame).
//  Se désactive automatiquement en cas de changement de vue, cf. scene.js →
//  syncBoutonEchelleAngle.
// ─────────────────────────────────────────────────────────────────────
function toggleEchelleAngle() {
  sim.echelleAngleTop = !sim.echelleAngleTop;
  document.getElementById('btn-echelle-angle').classList.toggle('active', sim.echelleAngleTop);
  updateSceneParams();
}

// ─────────────────────────────────────────────────────────────────────
//  Met à jour les encarts de valeurs instantanées.
// ─────────────────────────────────────────────────────────────────────
const THETA_LABEL_FORMULE = {
  fente:  'Angle de l\'enveloppe de diffraction<br>sin θ ≈ θ = λ / a :',
  cercle: 'Angle de l\'enveloppe de diffraction<br>sin θ ≈ θ = 1,22 · λ / 2a :'
};
function updateReadouts() {
  if (sim.lightSource === 'blanche') {
    updateReadoutsBlanche();
    return;
  }
  const theta = thetaPremierMinimum(sim.lambda, sim.a);
  const x1 = xPremierMinimum(sim.lambda, sim.a, sim.D);
  const i_mm = interfrangeI(sim.lambda, sim.b, sim.D) * 1000;
  document.getElementById('ro-interfrange').textContent = formatFr(i_mm, 2);
  document.getElementById('ro-theta-label').innerHTML = THETA_LABEL_FORMULE[sim.maskShape];
  document.getElementById('ro-theta-rad').textContent = formatFr(theta, 4);
  document.getElementById('ro-theta-deg').textContent = formatFr(theta * 180 / Math.PI, 2);
  document.getElementById('ro-largeur').textContent = formatFr(2 * x1 * 100, 2);
  document.getElementById('lambda-swatch').style.background = longueurOndeVersCss(sim.lambda);
}

// ─────────────────────────────────────────────────────────────────────
//  Remplit la section Valeurs en lumière blanche : TROIS cadres au total (comme en
//  monochromatique — interfrange, θ, largeur), chacun contenant une ligne par couleur
//  de référence (cf. sim.js → BLANCHE_COULEURS : point de couleur + λ en regard de la valeur),
//  plutôt qu'un cadre par couleur. a, b et D restent ceux du panneau (communs aux 6 λ), seule λ
//  change d'une ligne à l'autre.
// ─────────────────────────────────────────────────────────────────────
function updateReadoutsBlanche() {
  const cont = document.getElementById('readouts-exp-blanche');
  let rowsInterfrange = '', rowsTheta = '', rowsLargeur = '';
  for (const c of BLANCHE_COULEURS) {
    const i_mm = interfrangeI(c.lambda, sim.b, sim.D) * 1000;
    const theta = thetaPremierMinimum(c.lambda, sim.a);
    const x1 = xPremierMinimum(c.lambda, sim.a, sim.D);
    const css = longueurOndeVersCss(c.lambda);
    const nom = `<span class="swatch-blanche" style="background:${css}"></span>${c.nom} (${formatFr(c.lambda, 0)} nm)`;
    rowsInterfrange += `<div class="ro-row">
      <span class="ro-row-nom">${nom}</span>
      <span class="ro-row-value">${formatFr(i_mm, 2)} <span class="ro-unit">mm</span></span>
    </div>`;
    rowsTheta += `<div class="ro-row">
      <span class="ro-row-nom ro-row-nom-theta">${nom}</span>
      <span class="ro-row-value">
        <span>${formatFr(theta, 4)} <span class="ro-unit">rad</span></span>
        <span>${formatFr(theta * 180 / Math.PI, 2)} <span class="ro-unit">°</span></span>
      </span>
    </div>`;
    rowsLargeur += `<div class="ro-row">
      <span class="ro-row-nom">${nom}</span>
      <span class="ro-row-value">${formatFr(2 * x1 * 100, 2)} <span class="ro-unit">cm</span></span>
    </div>`;
  }
  cont.innerHTML = `
    <div class="readout full-width">
      <div class="ro-label">Interfrange<br>i = λ·D / b :</div>
      ${rowsInterfrange}
    </div>
    <div class="readout full-width">
      <div class="ro-label">Angle de l'enveloppe de diffraction<br>sin θ ≈ θ = λ / a :</div>
      ${rowsTheta}
    </div>
    <div class="readout full-width">
      <div class="ro-label">Largeur de l'enveloppe centrale</div>
      ${rowsLargeur}
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────
//  Réinitialise complètement la simulation.
// ─────────────────────────────────────────────────────────────────────
function resetSim() {
  resetParams();
  invaliderCourbe(); // tous les paramètres dont dépend I(x) sont remis à zéro
  appliquerBorneD();
  document.getElementById('sl-lambda').value = sim.lambda;
  document.getElementById('sl-a').value = sim.a;
  document.getElementById('sl-b').value = sim.b / 1000;
  document.getElementById('sl-D').value = sim.D;
  document.getElementById('sl-d').value = sim.d;
  document.getElementById('lbl-lambda').textContent = sim.lambda.toFixed(0);
  document.getElementById('lbl-a').textContent = sim.a.toFixed(0);
  document.getElementById('lbl-b').textContent = formatFr(sim.b / 1000, 2);
  document.getElementById('lbl-D').textContent = formatFr(sim.D, 1);
  document.getElementById('lbl-d').textContent = formatFr(sim.d, 2);
  document.getElementById('btn-rays').classList.remove('active');
  document.getElementById('btn-lengths').classList.remove('active');
  renderBeamModeLabel();
  renderLightSourceLabel();
  syncModeBlancheUI();
  syncMaskShapeUI();
  syncGraphIntensiteUI();
  syncValeursExpUI();

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
  drawIntensityGraph();
}

function toggleHint(tab) {
  const hint = document.getElementById('panel-hint-' + tab);
  if (hint) hint.classList.toggle('collapsed');
}

// ─────────────────────────────────────────────────────────────────────
//  Onglets principaux du panneau : Principe / Ondes de surface / Ondes lumineuses.
// ─────────────────────────────────────────────────────────────────────
const MAIN_TABS = ['principe', 'surfaces', 'lumineuses'];
function setMainTab(tab) {
  history.replaceState(null, '', location.pathname + '#' + tab);
  MAIN_TABS.forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
    document.getElementById('section-' + t).style.display = (t === tab) ? '' : 'none';
    document.getElementById('panel-hint-' + t).style.display = (t === tab) ? '' : 'none';
    document.getElementById(t + '-area').style.display = (t === tab) ? '' : 'none';
  });

  // #lumineuses-area est display:none pendant les autres onglets : la scène 3D
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
    resizeSurfaces();
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
  if (document.getElementById('surfaces-area').style.display !== 'none') tickSurfaces();
  // drawIntensityGraph() n'est plus appelée ici : chaque déclencheur qui affecte réellement le
  // graphe (slider, forme, mode lumineux, reset, zoom, survol, épinglage, redimensionnement)
  // l'appelle désormais explicitement (cf. ui.js → updateParam/updateMaskShape/resetSim,
  // graph.js → syncGraphPixelParfait/syncGraphModeBlanche/la légende/les écouteurs souris,
  // resizeGraphCanvas). Redessiner 60×/s sans raison coûtait un tracé complet de la courbe
  // (jusqu'à 6000×6 points en lumière blanche) pour rien la plupart du temps.
  dessinerLienFigure();
  requestAnimationFrame(loop);
}

// ═══════════════════════════════════════════════════
//  INITIALISATION
// ═══════════════════════════════════════════════════
function init() {
  const hash = (location.hash || '').replace('#', '');
  const tab = MAIN_TABS.includes(hash) ? hash : 'lumineuses';
  setMainTab(tab);

  initScene();
  initSurfaces();
  initGraphInteractions();
  initLegendeBlanche();
  appliquerBorneD();
  renderBeamModeLabel();
  renderLightSourceLabel();
  syncModeBlancheUI();
  syncMaskShapeUI();
  syncGraphIntensiteUI();
  syncValeursExpUI();
  resize();
  updateReadouts();
  requestAnimationFrame(loop);
}

init();
