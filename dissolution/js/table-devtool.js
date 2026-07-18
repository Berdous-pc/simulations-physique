// ═══════════════════════════════════════════════════
//  ÉDITEUR DU TABLEAU D'AVANCEMENT — TEMPORAIRE (outil dev)
//  Distinct de devpanel.js (panneau de réglage de l'onglet Mécanisme) :
//  celui-ci édite en direct la mise en page du #diss-table (onglet
//  Dissolution) — largeur des colonnes, hauteur des lignes, ajout de
//  lignes/colonnes, texte des cellules — puis exporte cette mise en page
//  en JSON pour la figer en dur dans le code une fois le calage terminé.
//  À retirer avec #diss-table-dev-toggle/#diss-table-dev-panel
//  (index.html), son style (style.css) et ce fichier une fois le
//  calage terminé.
// ═══════════════════════════════════════════════════

let DISS_TABLE_DEV_ACTIVE = false;

/* Consultée par renderDissTable() (diss.js) : tant que l'éditeur est actif,
   la régénération dynamique du tableau (changement de soluté/volume) ne
   doit pas écraser la mise en page en cours d'édition. */
function isDissTableDevActive() {
  return DISS_TABLE_DEV_ACTIVE;
}

function toggleDissTableDevMode() {
  DISS_TABLE_DEV_ACTIVE = !DISS_TABLE_DEV_ACTIVE;
  document.getElementById('diss-table-dev-panel').classList.toggle('collapsed', !DISS_TABLE_DEV_ACTIVE);
  document.getElementById('diss-table').classList.toggle('diss-table-dev-mode', DISS_TABLE_DEV_ACTIVE);

  if (DISS_TABLE_DEV_ACTIVE) {
    enterDissTableDesignMode();
  } else {
    exitDissTableDesignMode();
  }
}

/* ══════════════════════════════════════════════════
   Entrée / sortie du mode édition
══════════════════════════════════════════════════ */

/* Fige la mise en page courante (celle rendue par renderDissTable()) dans
   un <colgroup> explicite (largeurs en %, calculées depuis le rendu actuel)
   et rend chaque cellule éditable — c'est ce <colgroup> + ces hauteurs de
   ligne (posées au fil du glisser-déposer) qui constituent la mise en page
   exportée, pas une structure de données parallèle. */
function enterDissTableDesignMode() {
  const table = document.getElementById('diss-table');
  const headRow = table.tHead.rows[0];

  if (!table.querySelector('colgroup')) {
    const tableW = table.getBoundingClientRect().width || 1;
    const colgroup = document.createElement('colgroup');
    Array.from(headRow.children).forEach(th => {
      const col = document.createElement('col');
      const w = (th.getBoundingClientRect().width / tableW) * 100;
      col.style.width = w.toFixed(2) + '%';
      colgroup.appendChild(col);
    });
    table.insertBefore(colgroup, table.firstChild);
  }
  table.style.tableLayout = 'fixed';

  /* Fige aussi la largeur totale (et sa position) en px, sans quoi elle
     resterait collée à 100% de #diss-table-wrap (cf. #diss-table dans
     style.css) et les poignées de bordure gauche/droite n'auraient rien à
     modifier. */
  if (!table.style.width) {
    table.style.width = table.getBoundingClientRect().width + 'px';
    table.style.marginLeft = '0px';
  }

  table.querySelectorAll('th, td').forEach(cell => {
    cell.contentEditable = 'true';
  });

  renderDissTableDevOverlay();
  window.addEventListener('resize', renderDissTableDevOverlay);
}

/* Quitte le mode édition : redonne la main à renderDissTable() (diss.js),
   qui régénère le tableau depuis SOLUTES — les éditions non exportées sont
   donc perdues, ce qui est attendu (l'export est le seul moyen de les
   conserver, cf. exportDissTableDesign()). */
function exitDissTableDesignMode() {
  window.removeEventListener('resize', renderDissTableDevOverlay);
  document.getElementById('diss-table-resize-overlay').innerHTML = '';
  if (typeof renderDissTable === 'function') renderDissTable();
}

function resetDissTableDesign() {
  const table = document.getElementById('diss-table');
  const colgroup = table.querySelector('colgroup');
  if (colgroup) colgroup.remove();
  table.style.tableLayout = '';
  table.style.width = '';
  table.style.marginLeft = '';
  table.querySelectorAll('tr').forEach(tr => { tr.style.height = ''; });
  if (typeof renderDissTable === 'function') renderDissTable();
  enterDissTableDesignMode();
}

/* ══════════════════════════════════════════════════
   Poignées de redimensionnement (survolent #diss-table-wrap, ne modifient
   jamais le DOM du tableau lui-même — seulement colgroup/style.height)
══════════════════════════════════════════════════ */
function renderDissTableDevOverlay() {
  if (!DISS_TABLE_DEV_ACTIVE) return;
  const overlay = document.getElementById('diss-table-resize-overlay');
  const wrap = document.getElementById('diss-table-wrap');
  const table = document.getElementById('diss-table');
  overlay.innerHTML = '';

  const wrapRect = wrap.getBoundingClientRect();
  const tableRect = table.getBoundingClientRect();
  const headRow = table.tHead.rows[0];
  const allRows = Array.from(table.rows);

  // Poignées verticales (entre colonnes), une de moins que de colonnes.
  Array.from(headRow.children).forEach((th, i) => {
    if (i === headRow.children.length - 1) return;
    const r = th.getBoundingClientRect();
    const handle = document.createElement('div');
    handle.className = 'diss-col-handle';
    handle.style.left = (r.right - wrapRect.left - 3) + 'px';
    handle.style.top = (tableRect.top - wrapRect.top) + 'px';
    handle.style.height = tableRect.height + 'px';
    handle.dataset.colIndex = i;
    handle.addEventListener('mousedown', onDissColHandleDown);
    overlay.appendChild(handle);
  });

  // Poignées horizontales (entre lignes), une de moins que de lignes.
  allRows.forEach((tr, i) => {
    if (i === allRows.length - 1) return;
    const r = tr.getBoundingClientRect();
    const handle = document.createElement('div');
    handle.className = 'diss-row-handle';
    handle.style.top = (r.bottom - wrapRect.top - 3) + 'px';
    handle.style.left = (tableRect.left - wrapRect.left) + 'px';
    handle.style.width = tableRect.width + 'px';
    handle.dataset.rowIndex = i;
    handle.addEventListener('mousedown', onDissRowHandleDown);
    overlay.appendChild(handle);
  });

  // Poignées des 4 bordures externes du tableau (largeur totale + hauteur
  // de la première/dernière ligne) — distinctes des poignées internes
  // ci-dessus, qui ne touchent qu'aux frontières entre colonnes/lignes.
  const outer = [
    { edge: 'left',   style: { left: (tableRect.left - wrapRect.left - 3) + 'px', top: (tableRect.top - wrapRect.top) + 'px', height: tableRect.height + 'px' }, cls: 'diss-col-handle' },
    { edge: 'right',  style: { left: (tableRect.right - wrapRect.left - 3) + 'px', top: (tableRect.top - wrapRect.top) + 'px', height: tableRect.height + 'px' }, cls: 'diss-col-handle' },
    { edge: 'top',    style: { top: (tableRect.top - wrapRect.top - 3) + 'px', left: (tableRect.left - wrapRect.left) + 'px', width: tableRect.width + 'px' }, cls: 'diss-row-handle' },
    { edge: 'bottom', style: { top: (tableRect.bottom - wrapRect.top - 3) + 'px', left: (tableRect.left - wrapRect.left) + 'px', width: tableRect.width + 'px' }, cls: 'diss-row-handle' },
  ];
  outer.forEach(o => {
    const handle = document.createElement('div');
    handle.className = o.cls + ' diss-outer-handle';
    Object.assign(handle.style, o.style);
    handle.dataset.edge = o.edge;
    handle.addEventListener('mousedown', onDissOuterHandleDown);
    overlay.appendChild(handle);
  });
}

const DISS_COL_MIN_PCT = 6;
const DISS_ROW_MIN_PX = 18;

function onDissColHandleDown(e) {
  e.preventDefault();
  const i = Number(e.currentTarget.dataset.colIndex);
  const table = document.getElementById('diss-table');
  const cols = table.querySelectorAll('colgroup col');
  const colA = cols[i], colB = cols[i + 1];
  const wA0 = parseFloat(colA.style.width), wB0 = parseFloat(colB.style.width);
  const tableW = table.getBoundingClientRect().width;
  const startX = e.clientX;

  function onMove(ev) {
    const dPct = ((ev.clientX - startX) / tableW) * 100;
    const newA = Math.max(DISS_COL_MIN_PCT, Math.min(wA0 + dPct, wA0 + wB0 - DISS_COL_MIN_PCT));
    colA.style.width = newA.toFixed(2) + '%';
    colB.style.width = (wA0 + wB0 - newA).toFixed(2) + '%';
    renderDissTableDevOverlay();
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function onDissRowHandleDown(e) {
  e.preventDefault();
  const i = Number(e.currentTarget.dataset.rowIndex);
  const table = document.getElementById('diss-table');
  const tr = table.rows[i];
  const h0 = tr.getBoundingClientRect().height;
  const startY = e.clientY;

  function onMove(ev) {
    const h = Math.max(DISS_ROW_MIN_PX, h0 + (ev.clientY - startY));
    tr.style.height = h + 'px';
    renderDissTableDevOverlay();
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

const DISS_TABLE_MIN_W = 100;

/* Bordures externes : gauche/droite ajustent la largeur totale du tableau
   (et sa position via marginLeft pour la bordure gauche) ; haut/bas
   ajustent la hauteur de la première/dernière ligne, symétriquement aux
   poignées internes entre lignes (qui ne peuvent pas, elles, agir sur le
   bord extérieur d'une ligne d'extrémité). */
function onDissOuterHandleDown(e) {
  e.preventDefault();
  const edge = e.currentTarget.dataset.edge;
  const table = document.getElementById('diss-table');
  const wrap = document.getElementById('diss-table-wrap');
  const w0 = table.getBoundingClientRect().width;
  const marginLeft0 = parseFloat(table.style.marginLeft) || 0;
  const wrapW = wrap.getBoundingClientRect().width;
  const startX = e.clientX, startY = e.clientY;

  const firstRow = table.rows[0];
  const lastRow = table.rows[table.rows.length - 1];
  const hFirst0 = firstRow.getBoundingClientRect().height;
  const hLast0 = lastRow.getBoundingClientRect().height;

  function onMove(ev) {
    if (edge === 'left') {
      const dx = ev.clientX - startX;
      const newMargin = Math.min(Math.max(marginLeft0 + dx, 0), marginLeft0 + w0 - DISS_TABLE_MIN_W);
      const newW = Math.max(DISS_TABLE_MIN_W, w0 + (marginLeft0 - newMargin));
      table.style.marginLeft = newMargin + 'px';
      table.style.width = newW + 'px';
    } else if (edge === 'right') {
      const dx = ev.clientX - startX;
      const newW = Math.max(DISS_TABLE_MIN_W, Math.min(w0 + dx, wrapW - marginLeft0));
      table.style.width = newW + 'px';
    } else if (edge === 'top') {
      const dy = ev.clientY - startY;
      firstRow.style.height = Math.max(DISS_ROW_MIN_PX, hFirst0 - dy) + 'px';
    } else if (edge === 'bottom') {
      const dy = ev.clientY - startY;
      lastRow.style.height = Math.max(DISS_ROW_MIN_PX, hLast0 + dy) + 'px';
    }
    renderDissTableDevOverlay();
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

/* ══════════════════════════════════════════════════
   Ajout de lignes / colonnes
══════════════════════════════════════════════════ */
function addDissTableColumn() {
  const table = document.getElementById('diss-table');
  const headRow = table.tHead.rows[0];

  const newTh = document.createElement('th');
  newTh.textContent = 'Nouvelle colonne';
  newTh.contentEditable = 'true';
  headRow.appendChild(newTh);

  Array.from(table.tBodies[0].rows).forEach(tr => {
    const td = document.createElement('td');
    td.textContent = '';
    td.contentEditable = 'true';
    tr.appendChild(td);
  });

  const colgroup = table.querySelector('colgroup');
  if (colgroup) {
    const col = document.createElement('col');
    col.style.width = '15%';
    colgroup.appendChild(col);
  }
  renderDissTableDevOverlay();
}

function addDissTableRow() {
  const table = document.getElementById('diss-table');
  const tbody = table.tBodies[0];
  const nCols = table.tHead.rows[0].children.length;

  const tr = document.createElement('tr');
  for (let c = 0; c < nCols; c++) {
    const td = document.createElement('td');
    td.textContent = '';
    td.contentEditable = 'true';
    if (c === 0) td.className = 'diss-label';
    tr.appendChild(td);
  }
  tbody.appendChild(tr);
  renderDissTableDevOverlay();
}

/* ══════════════════════════════════════════════════
   Export — lit le DOM du tableau tel qu'édité (colonnes, lignes, cellules)
   et produit un JSON prêt à transmettre pour figer la mise en page en dur.
══════════════════════════════════════════════════ */
function exportDissTableDesign() {
  const table = document.getElementById('diss-table');
  const colgroup = table.querySelector('colgroup');
  const colWidths = colgroup ? Array.from(colgroup.children).map(c => c.style.width) : null;

  const rows = Array.from(table.rows).map(tr => ({
    height: tr.style.height || null,
    cells: Array.from(tr.children).map(cell => ({
      tag: cell.tagName.toLowerCase(),
      className: cell.className || null,
      text: cell.textContent.trim(),
    })),
  }));

  const outerBounds = {
    width: table.style.width || null,
    marginLeft: table.style.marginLeft || null,
  };

  const out = document.getElementById('diss-table-export-output');
  out.value = JSON.stringify({ outerBounds, colWidths, rows }, null, 2);
  out.style.display = 'block';
  out.focus();
  out.select();
}
