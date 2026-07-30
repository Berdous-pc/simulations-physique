'use strict';
// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

/* ══════════════════════════════════════════════════
   UI.JS — Tableau périodique cliquable, panneau de
   contrôle, légendes HTML, redimensionnement, init.
   (chargé en dernier — cf. index.html)
══════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────
   Tableau périodique réduit (3 premières lignes)
───────────────────────────────────────────────── */

/* Colonne (1-18) d'un élément dans le tableau périodique classique */
function colonneTPReelle(Z) {
  if (Z === 1) return 1;
  if (Z === 2) return 18;
  var rang = (Z <= 10) ? Z - 2 : Z - 10;   /* rang dans sa période      */
  return rang <= 2 ? rang : rang + 10;     /* blocs s (col 1-2) et p (13-18) */
}

/* Colonne CSS (grille resserrée) : les colonnes 1-2 et 13-18 gardent leur
   largeur, les colonnes 3-12 (bloc d — absent de H à Ar) sont recollées en
   une seule bande étroite hachurée, repérée « 3-12 ». Décalage de +1 pour
   la colonne d'étiquettes de période à gauche. */
function colonneTP(Z) {
  var c = colonneTPReelle(Z);
  return c <= 2 ? c + 1 : c - 8;
}

/* Positions CSS des en-têtes de colonnes affichées (avec la bande 3-12) */
var TP_COL_HEADERS = [1, 2, '3-12', 13, 14, 15, 16, 17, 18];

function buildTP() {
  var grid = document.getElementById('tp-grid');

  /* Étiquettes de colonnes (rangée d'en-tête) */
  TP_COL_HEADERS.forEach(function (c, i) {
    var cell = document.createElement('div');
    cell.className = (c === '3-12') ? 'tp-colnum tp-colnum-gap' : 'tp-colnum';
    cell.textContent = c;
    cell.style.gridRow = 1;
    cell.style.gridColumn = i + 2;
    grid.appendChild(cell);
  });

  /* Bande hachurée signalant le recollement artificiel des colonnes 3-12 */
  var gapStrip = document.createElement('div');
  gapStrip.className = 'tp-gap-strip';
  gapStrip.style.gridRow = '2 / 5';
  gapStrip.style.gridColumn = 4;
  grid.appendChild(gapStrip);

  /* Étiquettes de périodes (colonne d'en-tête) */
  for (var p = 1; p <= 3; p++) {
    var rcell = document.createElement('div');
    rcell.className = 'tp-rownum';
    rcell.textContent = p;
    rcell.style.gridRow = p + 1;
    rcell.style.gridColumn = 1;
    grid.appendChild(rcell);
  }

  ELEMENTS.forEach(function (el) {
    var btn = document.createElement('button');
    btn.className = 'tp-cell';
    btn.id = 'tp-cell-' + el.Z;
    btn.title = el.nom;
    btn.style.gridRow = getPeriode(el.Z) + 1;
    btn.style.gridColumn = colonneTP(el.Z);
    btn.innerHTML =
      '<span class="tp-a">' + el.A + '</span>' +
      '<span class="tp-z">' + el.Z + '</span>' +
      '<span class="tp-sym">' + el.sym + '</span>';
    btn.onclick = function () { selectElement(el.Z); };
    grid.appendChild(btn);
  });
}

/* ─────────────────────────────────────────────────
   Sélection d'un élément
───────────────────────────────────────────────── */
function selectElement(Z) {
  state.Z = Z;
  state.ionQ = 0;
  /* Changement d'élément : on revient à la vue assemblée du noyau */
  resetNucVue();
  resetChargeVue();
  resetIonVue();
  majBtnEclate();
  majBtnCharge();
  majBtnIon();
  var cells = document.querySelectorAll('.tp-cell');
  for (var i = 0; i < cells.length; i++) cells[i].classList.remove('selected');
  var cell = document.getElementById('tp-cell-' + Z);
  if (cell) cell.classList.add('selected');
  render();
  majInfos();
}

/* ─────────────────────────────────────────────────
   Mode comparaison — sélecteur + bascule
───────────────────────────────────────────────── */

/* Liste des 18 éléments par numéro atomique croissant, gaz nobles en gras */
function buildCompareSelect() {
  var sel = document.getElementById('cmp-select');
  ELEMENTS.forEach(function (el) {
    var opt = document.createElement('option');
    opt.value = el.Z;
    opt.textContent = el.Z + ' - ' + el.nom + ' (' + el.sym + ')';
    if (estGazNoble(el.Z)) opt.className = 'opt-noble';
    sel.appendChild(opt);
  });
  sel.value = String(state.Zcmp);
  majSelectNoble();
}

/* Le libellé refermé du sélecteur reprend le gras quand c'est un gaz noble */
function majSelectNoble() {
  var sel = document.getElementById('cmp-select');
  sel.classList.toggle('noble', estGazNoble(state.Zcmp));
}

function toggleCompare() {
  state.compare = !state.compare;
  document.body.classList.toggle('compare', state.compare);

  majBtnEclate();
  majBtnCharge();
  majBtnIon();

  var btn = document.getElementById('btn-comparer');
  btn.classList.toggle('active', state.compare);
  btn.setAttribute('aria-pressed', String(state.compare));

  majCompareTP();
  majInfos();
  render();
}

function setCompareZ(v) {
  state.Zcmp = parseInt(v, 10);
  state.ionQCmp = 0;
  /* Changement de l'élément comparé : on revient à la vue assemblée du
     noyau (le figé de la vue éclatée ne correspondrait plus au nouvel
     élément). */
  resetNucVue();
  resetChargeVue();
  resetIonVue();
  majBtnEclate();
  majBtnCharge();
  majBtnIon();
  majSelectNoble();
  majCompareTP();
  majInfos();
  render();
}

/* Liseré sur la case du tableau périodique de l'élément comparé */
function majCompareTP() {
  var cells = document.querySelectorAll('.tp-cell');
  for (var i = 0; i < cells.length; i++) cells[i].classList.remove('compared');
  if (!state.compare) return;
  var cell = document.getElementById('tp-cell-' + state.Zcmp);
  if (cell) cell.classList.add('compared');
}

/* ─────────────────────────────────────────────────
   Vue éclatée du noyau
───────────────────────────────────────────────── */
function toggleEclate() {
  /* Vues mutuellement exclusives : si la vue charge était affichée, on la
     referme instantanément (pas de contre-animation) avant de basculer. */
  if (state.charge) { state.charge = false; _chargeAnim.running = false; }
  state.eclate = !state.eclate;
  startNucAnim(state.eclate ? 1 : -1);
  majBtnEclate();   /* après startNucAnim : désactive le bouton pendant l'anim */
  majBtnCharge();
  majBtnIon();
}

function majBtnEclate() {
  var btn = document.getElementById('btn-eclater');
  btn.textContent = state.eclate ? '↺ Rassembler le noyau' : 'Disperser le noyau';
  /* Désactivé pendant l'animation (réactivé par onNucAnimEnd). */
  btn.disabled = _nucAnim.running || _chargeAnim.running;
  btn.title = 'Faire sortir les nucléons un par un pour les compter';
}

/* Hook appelé par draw.js à la fin de l'animation d'éclatement */
function onNucAnimEnd() {
  majBtnEclate();
  majBtnCharge();
  majBtnIon();
}

/* ─────────────────────────────────────────────────
   Vue charge (protons/électrons)
───────────────────────────────────────────────── */
function toggleCharge() {
  /* Vues mutuellement exclusives : si le noyau était éclaté, on referme
     instantanément cette vue avant de basculer sur la charge. */
  if (state.eclate) { state.eclate = false; _nucAnim.running = false; }
  state.charge = !state.charge;
  startChargeAnim(state.charge ? 1 : -1);
  majBtnCharge();   /* après startChargeAnim : désactive le bouton pendant l'anim */
  majBtnEclate();
  majBtnIon();
}

function majBtnCharge() {
  var btn = document.getElementById('btn-charge');
  btn.textContent = state.charge ? '↺ Rassembler l’atome' : 'Visualiser la charge';
  /* Désactivé pendant l'animation (réactivé par onChargeAnimEnd). */
  btn.disabled = _nucAnim.running || _chargeAnim.running;
  btn.title = 'Faire sortir les protons et les électrons pour les compter';
}

/* Hook appelé par draw.js à la fin de l'animation de charge */
function onChargeAnimEnd() {
  majBtnCharge();
  majBtnEclate();
  majBtnIon();
}

/* ─────────────────────────────────────────────────
   Ionisation — ajout/retrait d'électrons (± ION_MAX)
   `which` = 'main' (atome sélectionné) ou 'cmp' (atome comparé).
───────────────────────────────────────────────── */
function ionOf(which)      { return which === 'cmp' ? state.ionQCmp : state.ionQ; }
function ZOf(which)        { return which === 'cmp' ? state.Zcmp    : state.Z; }
function setIonOf(which, v) { if (which === 'cmp') state.ionQCmp = v; else state.ionQ = v; }

/* Jamais bloquant : des clics rapprochés (même sens ou sens opposé)
   déclenchent chacun leur propre vol d'électron, superposés/enchaînés
   sans attendre la fin des précédents (cf. addIonFlight() dans draw.js,
   qui gère aussi le demi-tour en vol si le clic inverse un vol en
   cours). Seules les animations de noyau/charge (positions en cours de
   figeage) bloquent temporairement l'ionisation. */
function addElectron(which) {
  if (_nucAnim.running || _chargeAnim.running) return;
  var Z = ZOf(which), ionQ = ionOf(which);
  var newIon = clampIon(Z, ionQ - 1);
  if (newIon === ionQ) return;   /* déjà à la limite (± ION_MAX ou capacité) */
  var oldNE = nElectronsIon(Z, ionQ), newNE = nElectronsIon(Z, newIon);
  setIonOf(which, newIon);
  if (state.charge) {
    /* Vue « charge » déjà ouverte : la colonne d'électrons s'ajuste
       instantanément, sans animation supplémentaire. */
    render();
  } else {
    addIonFlight(which, Z, oldNE, newNE);
  }
  majBtnIon();
  majInfos();
}

function removeElectron(which) {
  if (_nucAnim.running || _chargeAnim.running) return;
  var Z = ZOf(which), ionQ = ionOf(which);
  var newIon = clampIon(Z, ionQ + 1);
  if (newIon === ionQ) return;
  var oldNE = nElectronsIon(Z, ionQ), newNE = nElectronsIon(Z, newIon);
  setIonOf(which, newIon);
  if (state.charge) {
    render();
  } else {
    addIonFlight(which, Z, oldNE, newNE);
  }
  majBtnIon();
  majInfos();
}

/* Libellé de la charge affiché dans le panneau (ex. « Ion Na⁺ », « Atome neutre ») */
function ionLabel(which) {
  var Z = ZOf(which), el = getElement(Z), ionQ = ionOf(which);
  if (ionQ === 0) return 'Atome neutre';
  return 'Ion ' + el.sym + ionExposant(ionQ);
}

/* Valeur affichée dans le widget (ex. « 0 », « +1 », « −2 ») — ionQ > 0 :
   électrons retirés, ionQ < 0 : électrons ajoutés. */
function ionCountLabel(which) {
  var ionQ = ionOf(which);
  if (ionQ === 0) return '0';
  return (ionQ < 0 ? '+' : '−') + Math.abs(ionQ);
}

function majOneIonBlock(which) {
  var running = _nucAnim.running || _chargeAnim.running;
  var Z = ZOf(which), ionQ = ionOf(which);

  var sym = document.getElementById('ion-sym-' + which);
  if (sym) sym.textContent = getElement(Z).sym + ' :';

  var count = document.getElementById('ion-count-' + which);
  if (count) {
    count.textContent = ionCountLabel(which);
    count.title = ionLabel(which);
    count.classList.toggle('ion-count-cation', ionQ > 0);
    count.classList.toggle('ion-count-anion', ionQ < 0);
  }

  var addBtn = document.getElementById('btn-ion-add-' + which);
  var subBtn = document.getElementById('btn-ion-sub-' + which);
  /* Pas de blocage pendant un vol d'électron (plusieurs peuvent se
     superposer) : seule une animation de noyau/charge désactive
     temporairement les boutons. */
  if (addBtn) addBtn.disabled = running || clampIon(Z, ionQ - 1) === ionQ;
  if (subBtn) subBtn.disabled = running || clampIon(Z, ionQ + 1) === ionQ;
}

function majBtnIon() {
  majOneIonBlock('main');

  var blockCmp = document.getElementById('ion-atom-cmp');
  var sep = document.getElementById('ion-sep');
  if (blockCmp) blockCmp.style.display = state.compare ? '' : 'none';
  if (sep) sep.style.display = state.compare ? '' : 'none';
  if (state.compare) majOneIonBlock('cmp');
}

/* ─────────────────────────────────────────────────
   Légende du schéma, configuration écrite, panneau
───────────────────────────────────────────────── */

function majInfos() {
  /* Titre : nom de l'élément sélectionné — et, en comparaison, nom de
     l'élément comparé au-dessus de la demi-zone de droite. Le reste des
     informations (Z, A, configuration) est dessiné sous le schéma par
     drawInfosAtome() (draw.js), plus de box HTML séparée. */
  document.getElementById('atom-title-a').textContent = getElement(state.Z).nom;
  document.getElementById('atom-title-b').textContent = getElement(state.Zcmp).nom;
}

/* ─────────────────────────────────────────────────
   Options d'affichage
───────────────────────────────────────────────── */
function toggleEmpty() {
  state.showEmpty = !state.showEmpty;
  var btn = document.getElementById('btn-empty');
  btn.classList.toggle('active', state.showEmpty);
  btn.setAttribute('aria-pressed', String(state.showEmpty));
  render();
  majInfos();
}

function toggleStable() {
  state.showStable = !state.showStable;
  var btn = document.getElementById('btn-stable');
  btn.classList.toggle('active', state.showStable);
  btn.setAttribute('aria-pressed', String(state.showStable));
  render();
}

/* ─────────────────────────────────────────────────
   Bandeau informations
───────────────────────────────────────────────── */
function toggleHint() {
  var hint = document.getElementById('panel-hint-atome');
  if (hint) hint.classList.toggle('collapsed');
}

/* ─────────────────────────────────────────────────
   Redimensionnement (anti-rebond requestAnimationFrame)
   ResizeObserver sur le wrapper du canvas plutôt que
   window.resize : capte aussi les changements de taille
   qui ne viennent pas d'un resize de fenêtre (polices qui
   finissent de charger, mise en page qui se stabilise…),
   sans quoi le canvas garde sa résolution interne d'origine
   alors que sa taille CSS a changé → rendu étiré/déformé
   jusqu'au prochain resize de fenêtre. */
var _resizePending = false;
function scheduleResize() {
  if (_resizePending) return;
  _resizePending = true;
  requestAnimationFrame(function () {
    _resizePending = false;
    resizeAtomCanvas();
    render();
  });
}
window.addEventListener('resize', scheduleResize);
new ResizeObserver(scheduleResize).observe(document.getElementById('atom-canvas-wrap'));

/* ─────────────────────────────────────────────────
   Initialisation
───────────────────────────────────────────────── */
initDraw();
buildTP();
buildCompareSelect();
/* Pas d'appel synchrone à resizeAtomCanvas() ici : le ResizeObserver
   ci-dessus se déclenche de lui-même dès l'observation avec la taille
   déjà stabilisée, et fait le premier dessin correct directement — on
   évite ainsi un premier rendu distordu (canvas mesuré trop tôt) suivi
   d'une correction visible juste après. */
selectElement(state.Z);
