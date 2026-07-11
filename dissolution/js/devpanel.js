// ═══════════════════════════════════════════════════
//  PANNEAU DE RÉGLAGE — TEMPORAIRE (aide au calage de l'animation)
//  À retirer avec #dev-panel (index.html), son style (style.css) et ce
//  fichier une fois le calage terminé. Chargé en tout dernier.
// ═══════════════════════════════════════════════════

/* Constantes exposées au panneau : chacune expose un getter/setter vers la
   variable réelle (déclarée en `let` dans sim.js/cristal.js). */
const DEV_CONTROLS = [
  { key: 'migrationSpeed',  label: 'Vitesse migration (×cellule/s)',  min: 0.5, max: 5,    step: 0.1,
    get: () => MIGRATION_SPEED,      set: v => { MIGRATION_SPEED = v; } },
  { key: 'waterSize',       label: "Taille eau — rayon O (×cellule)", min: 0.1, max: 0.5,  step: 0.01,
    get: () => WATER_SIZE_FACTOR,    set: v => { WATER_SIZE_FACTOR = v; } },
  { key: 'waterSpeed',      label: 'Vitesse eau (×cellule/s)',        min: 0.5, max: 6,    step: 0.1,
    get: () => WATER_TRAVEL_SPEED,   set: v => { WATER_TRAVEL_SPEED = v; } },
  { key: 'waterMinDur',     label: 'Durée min. trajet eau (ms)',      min: 100, max: 800,  step: 50,
    get: () => WATER_TRAVEL_MIN_DUR, set: v => { WATER_TRAVEL_MIN_DUR = v; } },
  { key: 'approcheDur',     label: 'Durée approche (ms)',             min: 300, max: 3000, step: 50,
    get: () => PHASE_DUR.approche,      set: v => { PHASE_DUR.approche = v; } },
  { key: 'dissociationDur', label: 'Durée dissociation (ms)',         min: 300, max: 3000, step: 50,
    get: () => PHASE_DUR.dissociation,  set: v => { PHASE_DUR.dissociation = v; } },
  { key: 'approachSpread',  label: 'Écart angle approche (rad)',      min: 0,   max: 1.5,  step: 0.05,
    get: () => APPROACH_ANGLE_SPREAD, set: v => { APPROACH_ANGLE_SPREAD = v; } },
  { key: 'approachDistNa',  label: 'Distance accostage — Na+ (×cellule)', min: 0.5, max: 3, step: 0.05,
    get: () => APPROACH_DIST_FACTOR.Na, set: v => { APPROACH_DIST_FACTOR.Na = v; } },
  { key: 'approachDistCl',  label: 'Distance accostage — Cl- (×cellule)', min: 0.5, max: 3, step: 0.05,
    get: () => APPROACH_DIST_FACTOR.Cl, set: v => { APPROACH_DIST_FACTOR.Cl = v; } },
  { key: 'detachDist',      label: 'Distance détachement (×cellule)', min: 0.3, max: 2,    step: 0.05,
    get: () => DETACH_DIST_FACTOR,   set: v => { DETACH_DIST_FACTOR = v; } },
  { key: 'cageRadiusNa',    label: 'Rayon cage — Na+ (×cellule)',     min: 0.5, max: 2.5,  step: 0.05,
    get: () => CAGE_RADIUS_FACTOR.Na, set: v => { CAGE_RADIUS_FACTOR.Na = v; } },
  { key: 'cageRadiusCl',    label: 'Rayon cage — Cl- (×cellule)',     min: 0.5, max: 2.5,  step: 0.05,
    get: () => CAGE_RADIUS_FACTOR.Cl, set: v => { CAGE_RADIUS_FACTOR.Cl = v; } },
  { key: 'cageClearance',   label: 'Marge fermeture cage (×cellule)', min: 0,   max: 1.5,  step: 0.05,
    get: () => CAGE_CLEARANCE_EXTRA, set: v => { CAGE_CLEARANCE_EXTRA = v; } },
  { key: 'cageSize',        label: 'Nombre de molécules (cage)',     min: 2,   max: 8,    step: 1,
    get: () => CAGE_SIZE,            set: v => { CAGE_SIZE = v; } },
  { key: 'waitYExtra',      label: "Marge ligne d'attente (×cellule)", min: 0,  max: 1.5,  step: 0.05,
    get: () => WAIT_Y_EXTRA,         set: v => { WAIT_Y_EXTRA = v; } },
  { key: 'spawnExtra',      label: 'Distance apparition (×cellule)',  min: 0.3, max: 3,    step: 0.05,
    get: () => SPAWN_EXTRA_FACTOR,   set: v => { SPAWN_EXTRA_FACTOR = v; } },
  { key: 'fadeInDur',       label: "Durée fondu d'apparition (ms)",   min: 100, max: 2000, step: 50,
    get: () => FADE_IN_DURATION,     set: v => { FADE_IN_DURATION = v; } },
];

/* Reconstruit déterministiquement l'état de la simulation à l'instant
   `targetMs` : repart de zéro (resetSimAnim) puis rejoue toutes les étapes
   par petits pas de temps fixes, sans dessiner ni attendre — la simulation
   étant entièrement déterministe, le résultat est identique à une lecture
   en temps réel jusqu'à cet instant. Permet un curseur de navigation
   instantané, y compris après avoir changé un réglage. */
function seekTo(targetMs) {
  resetSimAnim();
  const STEP = 16;
  let t = 0;
  while (t < targetMs) {
    const dt = Math.min(STEP, targetMs - t);
    t += dt;
    state.animT = t;
    if (state.animT >= DURATION_MS) { state.animT = DURATION_MS; state.ended = true; }
    advanceFadeIns(dt);
    updateProcesses(dt);
    if (!state.ended) runScript();
    if (state.ended) break;
  }
  state.paused = true;
  _updatePlayBtn();
  drawScene();
}

function toggleDevPanel() {
  const panel = document.getElementById('dev-panel');
  if (panel) panel.classList.toggle('collapsed');
}

/* ══════════════════════════════════════════════════
   Édition du cristal et du scénario
══════════════════════════════════════════════════ */
let EDIT_MODE = 'none';   // 'none' | 'crystal' | 'script'

function pixelToCell(x, y) {
  const c = state.crystal;
  return { row: Math.floor((y - c.y0) / c.cellSize), col: Math.floor((x - c.x0) / c.cellSize) };
}

function setEditMode(mode) {
  EDIT_MODE = mode;
  ['none', 'crystal', 'script'].forEach(m => {
    const btn = document.getElementById('dev-mode-' + m);
    if (btn) btn.classList.toggle('active', m === mode);
  });
  const canvas = document.getElementById('anim-canvas');
  if (canvas) canvas.style.cursor = mode === 'none' ? 'default' : 'crosshair';
}

function onEditorCanvasClick(e) {
  if (EDIT_MODE === 'none') return;
  const { x, y } = toStageXY(e);
  const { row, col } = pixelToCell(x, y);
  if (row < 0 || row >= NROWS_MAX || col < 0 || col >= NCOLS) return;

  if (EDIT_MODE === 'crystal') {
    toggleCrystalSite(row, col);
    seekTo(Number(document.getElementById('dev-scrub').value));
  } else if (EDIT_MODE === 'script') {
    const site = state.crystal.sites[row * NCOLS + col];
    if (!site || !site.occupied) return;   // rien à ajouter sur une case vide
    const atMs = Number(document.getElementById('dev-scrub').value) || 0;
    DISSOLUTION_SCRIPT.push({ atMs, row, col });
    renderScriptList();
    seekTo(atMs);
  }
}

/* Liste éditable du scénario : temps modifiable, réordonnancement, suppression. */
function renderScriptList() {
  const list = document.getElementById('dev-script-list');
  if (!list) return;
  list.innerHTML = '';

  DISSOLUTION_SCRIPT.forEach((entry, i) => {
    const site = state.crystal.sites && state.crystal.sites[entry.row * NCOLS + entry.col];
    const ionLabel = site ? (site.type === 'Na' ? 'Na+' : 'Cl-') : '?';
    const row = document.createElement('div');
    row.className = 'dev-script-row';
    row.innerHTML =
      '<span class="dev-script-cell">' + ionLabel + ' L' + (entry.row + 1) + ' C' + entry.col + '</span>' +
      '<input type="number" step="100" value="' + entry.atMs + '" class="dev-script-time">' +
      '<button class="dev-script-btn" title="Monter">↑</button>' +
      '<button class="dev-script-btn" title="Descendre">↓</button>' +
      '<button class="dev-script-btn" title="Supprimer">✕</button>';
    const [, timeInput, upBtn, downBtn, delBtn] = row.children;

    timeInput.addEventListener('change', () => {
      entry.atMs = Number(timeInput.value) || 0;
      seekTo(Number(document.getElementById('dev-scrub').value));
    });
    upBtn.addEventListener('click', () => {
      if (i === 0) return;
      [DISSOLUTION_SCRIPT[i - 1], DISSOLUTION_SCRIPT[i]] = [DISSOLUTION_SCRIPT[i], DISSOLUTION_SCRIPT[i - 1]];
      renderScriptList();
    });
    downBtn.addEventListener('click', () => {
      if (i === DISSOLUTION_SCRIPT.length - 1) return;
      [DISSOLUTION_SCRIPT[i + 1], DISSOLUTION_SCRIPT[i]] = [DISSOLUTION_SCRIPT[i], DISSOLUTION_SCRIPT[i + 1]];
      renderScriptList();
    });
    delBtn.addEventListener('click', () => {
      DISSOLUTION_SCRIPT.splice(i, 1);
      renderScriptList();
      seekTo(Number(document.getElementById('dev-scrub').value));
    });

    list.appendChild(row);
  });
}

/* Génère le texte des deux structures (scénario + dérogations cristal), prêt
   à copier-coller pour les figer dans sim.js. */
function exportConfig() {
  const scriptText = 'const DISSOLUTION_SCRIPT = [\n' +
    DISSOLUTION_SCRIPT.map(e => '  { atMs: ' + e.atMs + ', row: ' + e.row + ', col: ' + e.col + ' },').join('\n') +
    '\n];';
  const overridesText = 'let CRYSTAL_OVERRIDES = ' + JSON.stringify(CRYSTAL_OVERRIDES) + ';';
  const out = document.getElementById('dev-export-output');
  out.value = scriptText + '\n\n' + overridesText;
  out.style.display = 'block';
  out.focus();
  out.select();
}

function buildDevPanel() {
  const body = document.getElementById('dev-panel-body');
  if (!body) return;

  const durationRow = document.createElement('div');
  durationRow.className = 'dev-row';
  durationRow.innerHTML =
    '<div class="dev-row-label">Durée totale (ms) <span id="dev-val-duration">' + DURATION_MS + '</span></div>' +
    '<input type="range" id="dev-duration" min="5000" max="120000" step="1000" value="' + DURATION_MS + '">';
  body.appendChild(durationRow);

  const scrubRow = document.createElement('div');
  scrubRow.className = 'dev-row';
  scrubRow.innerHTML =
    '<div class="dev-row-label">Temps <span id="dev-scrub-val">0 ms</span></div>' +
    '<input type="range" id="dev-scrub" min="0" max="' + DURATION_MS + '" step="100" value="0">';
  body.appendChild(scrubRow);

  document.getElementById('dev-duration').addEventListener('input', e => {
    DURATION_MS = Number(e.target.value);
    document.getElementById('dev-val-duration').textContent = DURATION_MS;
    const scrub = document.getElementById('dev-scrub');
    scrub.max = DURATION_MS;
    if (Number(scrub.value) > DURATION_MS) {
      scrub.value = DURATION_MS;
      document.getElementById('dev-scrub-val').textContent = DURATION_MS + ' ms';
    }
    seekTo(Number(scrub.value));
  });

  const editRow = document.createElement('div');
  editRow.className = 'dev-row';
  editRow.innerHTML =
    '<div class="dev-row-label">Mode édition (clic sur le cristal)</div>' +
    '<div id="dev-mode-buttons">' +
    '<button id="dev-mode-none" class="dev-mode-btn active">Aucun</button>' +
    '<button id="dev-mode-crystal" class="dev-mode-btn">Cristal</button>' +
    '<button id="dev-mode-script" class="dev-mode-btn">Scénario</button>' +
    '</div>' +
    '<div id="dev-script-list"></div>' +
    '<button id="dev-export-btn" class="dev-mode-btn" style="width:100%;margin-top:4px;">Exporter</button>' +
    '<textarea id="dev-export-output" readonly rows="6" style="display:none;width:100%;margin-top:4px;font-family:monospace;font-size:10px;"></textarea>';
  body.appendChild(editRow);
  ['none', 'crystal', 'script'].forEach(m => {
    document.getElementById('dev-mode-' + m).addEventListener('click', () => setEditMode(m));
  });
  document.getElementById('dev-export-btn').addEventListener('click', exportConfig);

  const sep = document.createElement('hr');
  body.appendChild(sep);

  DEV_CONTROLS.forEach(ctrl => {
    const row = document.createElement('div');
    row.className = 'dev-row';
    row.innerHTML =
      '<div class="dev-row-label">' + ctrl.label + ' <span id="dev-val-' + ctrl.key + '">' + ctrl.get() + '</span></div>' +
      '<input type="range" id="dev-' + ctrl.key + '" min="' + ctrl.min + '" max="' + ctrl.max + '" step="' + ctrl.step + '" value="' + ctrl.get() + '">';
    body.appendChild(row);
  });

  document.getElementById('dev-scrub').addEventListener('input', e => {
    const v = Number(e.target.value);
    document.getElementById('dev-scrub-val').textContent = v + ' ms';
    seekTo(v);
  });

  DEV_CONTROLS.forEach(ctrl => {
    document.getElementById('dev-' + ctrl.key).addEventListener('input', e => {
      const v = Number(e.target.value);
      ctrl.set(v);
      document.getElementById('dev-val-' + ctrl.key).textContent = v;
      const scrub = document.getElementById('dev-scrub');
      seekTo(Number(scrub.value));
    });
  });

  const canvas = document.getElementById('anim-canvas');
  if (canvas) canvas.addEventListener('click', onEditorCanvasClick);

  renderScriptList();
}

window.addEventListener('DOMContentLoaded', buildDevPanel);
