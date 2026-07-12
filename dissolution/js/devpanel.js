// ═══════════════════════════════════════════════════
//  PANNEAU DE RÉGLAGE — TEMPORAIRE (aide au calage de l'animation)
//  À retirer avec #dev-panel (index.html), son style (style.css) et ce
//  fichier une fois le calage terminé. Chargé en tout dernier.
// ═══════════════════════════════════════════════════

/* Désactivé pour la mise en ligne : repasser à `true` pour réactiver le
   panneau (aucun autre changement nécessaire — rien n'est supprimé). Quand
   c'est `false`, buildDevPanel() masque #dev-panel et n'attache ni contrôles
   ni écouteur de clic sur le canvas : le panneau reste totalement inaccessible. */
const DEV_PANEL_ENABLED = false;

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
  { key: 'spawnExtra',      label: 'Distance apparition (×cellule)',  min: 0.3, max: 3,    step: 0.05,
    get: () => SPAWN_EXTRA_FACTOR,   set: v => { SPAWN_EXTRA_FACTOR = v; } },
  { key: 'fadeInDur',       label: "Durée fondu d'apparition (ms)",   min: 100, max: 2000, step: 50,
    get: () => FADE_IN_DURATION,     set: v => { FADE_IN_DURATION = v; } },
];

/* seekTo() a déménagé dans ui.js (fonctionnalité désormais aussi utilisée par
   la barre de progression destinée aux élèves, cf. onProgressBarInput) — ce
   panneau se contente de l'appeler. */

function toggleDevPanel() {
  const panel = document.getElementById('dev-panel');
  if (panel) panel.classList.toggle('collapsed');
}

/* ══════════════════════════════════════════════════
   Édition du cristal et du scénario
══════════════════════════════════════════════════ */
let EDIT_MODE = 'none';   // 'none' | 'crystal' | 'script' | 'text'
let nextTextBoxId = 0;

function pixelToCell(x, y) {
  const c = state.crystal;
  return { row: Math.floor((y - c.y0) / c.cellSize), col: Math.floor((x - c.x0) / c.cellSize) };
}

function setEditMode(mode) {
  EDIT_MODE = mode;
  ['none', 'crystal', 'script', 'text'].forEach(m => {
    const btn = document.getElementById('dev-mode-' + m);
    if (btn) btn.classList.toggle('active', m === mode);
  });
  const canvas = document.getElementById('anim-canvas');
  if (canvas) canvas.style.cursor = mode === 'none' ? 'default' : 'crosshair';
}

function onEditorCanvasClick(e) {
  if (EDIT_MODE === 'none') return;
  const { x, y } = toStageXY(e);

  /* Mode texte : pas de contrainte de case du cristal, la boîte peut être
     placée n'importe où sur la scène (le clic fixe son coin haut-gauche). */
  if (EDIT_MODE === 'text') {
    addTextBox(x, y);
    return;
  }

  const { row, col } = pixelToCell(x, y);
  if (row < 0 || row >= NROWS_MAX || col < 0 || col >= NCOLS) return;

  if (EDIT_MODE === 'crystal') {
    toggleCrystalSite(row, col);
    seekTo(Number(document.getElementById('dev-scrub').value));
  } else if (EDIT_MODE === 'script') {
    const site = state.crystal.sites[row * NCOLS + col];
    if (!site || !site.occupied) return;   // rien à ajouter sur une case vide
    const atMs = Number(document.getElementById('dev-scrub').value) || 0;
    DISSOLUTION_SCRIPT.push({ atMs, row, col, speed: 1 });
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
      '<input type="number" step="100" value="' + entry.atMs + '" class="dev-script-time" title="Instant (ms)">' +
      '<input type="number" step="0.1" min="0.1" max="3" value="' + (entry.speed || 1) + '" class="dev-script-speed" title="Vitesse (×)">' +
      '<button class="dev-script-btn" title="Monter">↑</button>' +
      '<button class="dev-script-btn" title="Descendre">↓</button>' +
      '<button class="dev-script-btn" title="Supprimer">✕</button>';
    const [, timeInput, speedInput, upBtn, downBtn, delBtn] = row.children;

    timeInput.addEventListener('change', () => {
      entry.atMs = Number(timeInput.value) || 0;
      seekTo(Number(document.getElementById('dev-scrub').value));
    });
    speedInput.addEventListener('change', () => {
      entry.speed = Number(speedInput.value) || 1;
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

/* Ajoute une boîte de dialogue par défaut, coin haut-gauche au point cliqué
   (x, y en unités de scène), à l'instant courant du curseur "Temps". */
function addTextBox(x, y) {
  const atMs = Number(document.getElementById('dev-scrub').value) || 0;
  TEXT_BOXES.push({
    id: nextTextBoxId++,
    atMs, durationMs: 3000,
    x: Math.round(x), y: Math.round(y), w: 400, h: 150,
    fontSize: 22, bold: false, align: 'left',
    title: '', text: 'Nouveau texte',
  });
  renderTextBoxList();
  drawScene();
}

/* Liste éditable des boîtes de texte : tous les champs (temps, position,
   dimensions, police, mise en forme, contenu) modifiables en direct. Les
   boîtes ne dépendant pas de l'état simulé, un simple drawScene() suffit
   après édition (pas besoin de rejouer la simulation via seekTo). */
function renderTextBoxList() {
  const list = document.getElementById('dev-textbox-list');
  if (!list) return;
  list.innerHTML = '';

  TEXT_BOXES.forEach((box, i) => {
    const row = document.createElement('div');
    row.className = 'dev-textbox-row';

    const numField = (label, key, step) =>
      '<label class="dev-textbox-field">' + label +
      '<input type="number" step="' + step + '" value="' + box[key] + '" data-key="' + key + '"></label>';

    row.innerHTML =
      '<div class="dev-textbox-grid">' +
      numField('Début (ms)', 'atMs', 100) +
      numField('Durée (ms)', 'durationMs', 100) +
      numField('X', 'x', 5) +
      numField('Y', 'y', 5) +
      numField('Largeur', 'w', 5) +
      numField('Hauteur', 'h', 5) +
      numField('Police (px)', 'fontSize', 1) +
      '</div>' +
      '<div class="dev-textbox-grid">' +
      '<label class="dev-textbox-field">Alignement' +
      '<select data-key="align">' +
      ['left', 'center', 'right'].map(a => '<option value="' + a + '"' + (box.align === a ? ' selected' : '') + '>' + a + '</option>').join('') +
      '</select></label>' +
      '<label class="dev-textbox-field dev-textbox-checkbox"><input type="checkbox" data-key="bold"' + (box.bold ? ' checked' : '') + '> Gras</label>' +
      '<button class="dev-script-btn dev-textbox-del" title="Supprimer">✕</button>' +
      '</div>' +
      '<input type="text" class="dev-textbox-title" placeholder="Titre (optionnel — mis en gras, plus grand)" value="' + (box.title || '') + '">' +
      '<textarea class="dev-textbox-text" rows="3">' + box.text + '</textarea>';

    row.querySelectorAll('input[type="number"], select').forEach(input => {
      input.addEventListener('change', () => {
        const key = input.dataset.key;
        box[key] = input.type === 'number' ? Number(input.value) || 0 : input.value;
        drawScene();
      });
    });
    row.querySelector('input[type="checkbox"]').addEventListener('change', e => {
      box.bold = e.target.checked;
      drawScene();
    });
    row.querySelector('.dev-textbox-title').addEventListener('input', e => {
      box.title = e.target.value;
      drawScene();
    });
    row.querySelector('.dev-textbox-text').addEventListener('input', e => {
      box.text = e.target.value;
      drawScene();
    });
    row.querySelector('.dev-textbox-del').addEventListener('click', () => {
      TEXT_BOXES.splice(i, 1);
      renderTextBoxList();
      drawScene();
    });

    list.appendChild(row);
  });
}

/* Ajoute un point de pause à l'instant courant du curseur "Temps" (2000 ms de
   figeage par défaut) et garde la liste triée par instant croissant. */
function addPausePoint() {
  const atMs = Number(document.getElementById('dev-scrub').value) || 0;
  PAUSE_POINTS.push({ atMs, holdMs: 2000 });
  PAUSE_POINTS.sort((a, b) => a.atMs - b.atMs);
  renderPauseList();
}

/* Liste éditable des points de pause : temps de déclenchement et durée de
   figeage modifiables, suppression. Comme pour les boîtes de texte, aucun
   effet sur l'état simulé tant qu'on ne relance pas la lecture — pas besoin
   de seekTo() après édition. */
function renderPauseList() {
  const list = document.getElementById('dev-pause-list');
  if (!list) return;
  list.innerHTML = '';

  PAUSE_POINTS.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'dev-script-row';
    row.innerHTML =
      '<span class="dev-script-cell">Pause</span>' +
      '<input type="number" step="100" value="' + entry.atMs + '" class="dev-script-time" title="Instant (ms)">' +
      '<input type="number" step="100" value="' + entry.holdMs + '" class="dev-script-time" title="Durée du figeage (ms)">' +
      '<button class="dev-script-btn" title="Supprimer">✕</button>';
    const [, atInput, holdInput, delBtn] = row.children;

    atInput.addEventListener('change', () => {
      entry.atMs = Number(atInput.value) || 0;
      PAUSE_POINTS.sort((a, b) => a.atMs - b.atMs);
      renderPauseList();
    });
    holdInput.addEventListener('change', () => {
      entry.holdMs = Number(holdInput.value) || 0;
    });
    delBtn.addEventListener('click', () => {
      PAUSE_POINTS.splice(i, 1);
      renderPauseList();
    });

    list.appendChild(row);
  });
}

/* Génère le texte des quatre structures (scénario, dérogations cristal,
   boîtes de texte, points de pause), prêt à copier-coller pour les figer
   dans sim.js. */
function exportConfig() {
  const scriptText = 'const DISSOLUTION_SCRIPT = [\n' +
    DISSOLUTION_SCRIPT.map(e =>
      '  { atMs: ' + e.atMs + ', row: ' + e.row + ', col: ' + e.col +
      (e.speed && e.speed !== 1 ? ', speed: ' + e.speed : '') + ' },'
    ).join('\n') +
    '\n];';
  const overridesText = 'let CRYSTAL_OVERRIDES = ' + JSON.stringify(CRYSTAL_OVERRIDES) + ';';
  const textBoxesText = 'let TEXT_BOXES = [\n' +
    TEXT_BOXES.map(b =>
      '  { atMs: ' + b.atMs + ', durationMs: ' + b.durationMs +
      ', x: ' + b.x + ', y: ' + b.y + ', w: ' + b.w + ', h: ' + b.h +
      ', fontSize: ' + b.fontSize + ', bold: ' + b.bold + ', align: ' + JSON.stringify(b.align) +
      (b.title ? ', title: ' + JSON.stringify(b.title) : '') +
      ', text: ' + JSON.stringify(b.text) + ' },'
    ).join('\n') +
    '\n];';
  const pausePointsText = 'let PAUSE_POINTS = [\n' +
    PAUSE_POINTS.map(p => '  { atMs: ' + p.atMs + ', holdMs: ' + p.holdMs + ' },').join('\n') +
    '\n];';
  const out = document.getElementById('dev-export-output');
  out.value = scriptText + '\n\n' + overridesText + '\n\n' + textBoxesText + '\n\n' + pausePointsText;
  out.style.display = 'block';
  out.focus();
  out.select();
}

function buildDevPanel() {
  if (!DEV_PANEL_ENABLED) {
    /* Masque et neutralise entièrement le panneau : aucun contrôle n'est
       construit, aucun écouteur de clic n'est attaché au canvas (le mode
       édition ne peut donc pas non plus être activé au clavier/JS externe).
       Le chrono (#sim-timer) fait partie du même outil de calage : il se
       masque avec lui (drawScene() dans ui.js arrête aussi de le mettre à
       jour, cf. sa garde sur DEV_PANEL_ENABLED). */
    const panel = document.getElementById('dev-panel');
    if (panel) panel.style.display = 'none';
    const timer = document.getElementById('sim-timer');
    if (timer) timer.style.display = 'none';
    return;
  }

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
    const bar = document.getElementById('progress-bar');
    if (bar) bar.max = DURATION_MS;
    if (Number(scrub.value) > DURATION_MS) {
      scrub.value = DURATION_MS;
      document.getElementById('dev-scrub-val').textContent = DURATION_MS + ' ms';
    }
    seekTo(Number(scrub.value));
  });

  const editRow = document.createElement('div');
  editRow.className = 'dev-row';
  editRow.innerHTML =
    '<div class="dev-row-label">Mode édition (clic sur le cristal/la scène)</div>' +
    '<div id="dev-mode-buttons">' +
    '<button id="dev-mode-none" class="dev-mode-btn active">Aucun</button>' +
    '<button id="dev-mode-crystal" class="dev-mode-btn">Cristal</button>' +
    '<button id="dev-mode-script" class="dev-mode-btn">Scénario</button>' +
    '<button id="dev-mode-text" class="dev-mode-btn">Texte</button>' +
    '</div>' +
    '<div id="dev-script-list"></div>' +
    '<div id="dev-textbox-list"></div>' +
    '<div class="dev-row-label" style="margin-top:6px;">Pauses (figent l\'animation)</div>' +
    '<button id="dev-pause-add-btn" class="dev-mode-btn" style="width:100%;">+ Pause à ce temps</button>' +
    '<div id="dev-pause-list"></div>' +
    '<button id="dev-export-btn" class="dev-mode-btn" style="width:100%;margin-top:4px;">Exporter</button>' +
    '<textarea id="dev-export-output" readonly rows="6" style="display:none;width:100%;margin-top:4px;font-family:monospace;font-size:10px;"></textarea>';
  body.appendChild(editRow);
  ['none', 'crystal', 'script', 'text'].forEach(m => {
    document.getElementById('dev-mode-' + m).addEventListener('click', () => setEditMode(m));
  });
  document.getElementById('dev-export-btn').addEventListener('click', exportConfig);
  document.getElementById('dev-pause-add-btn').addEventListener('click', addPausePoint);

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
  renderTextBoxList();
  renderPauseList();
}

window.addEventListener('DOMContentLoaded', buildDevPanel);
