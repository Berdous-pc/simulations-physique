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
  /* Changement d'élément : on revient à la vue assemblée du noyau */
  resetNucVue();
  majBtnEclate();
  var cells = document.querySelectorAll('.tp-cell');
  for (var i = 0; i < cells.length; i++) cells[i].classList.remove('selected');
  var cell = document.getElementById('tp-cell-' + Z);
  if (cell) cell.classList.add('selected');
  render();
  majInfos();
}

/* ─────────────────────────────────────────────────
   Vue éclatée du noyau
───────────────────────────────────────────────── */
function toggleEclate() {
  state.eclate = !state.eclate;
  startNucAnim(state.eclate ? 1 : -1);
  majBtnEclate();   /* après startNucAnim : désactive le bouton pendant l'anim */
}

function majBtnEclate() {
  var btn = document.getElementById('btn-eclater');
  btn.textContent = state.eclate ? '↺ Rassembler le noyau' : '💥 Éclater le noyau';
  /* Désactivé pendant l'animation (réactivé par onNucAnimEnd) */
  btn.disabled = _nucAnim.running;
}

/* Hook appelé par draw.js à la fin de l'animation d'éclatement */
function onNucAnimEnd() {
  majBtnEclate();
}

/* ─────────────────────────────────────────────────
   Légende du schéma, configuration écrite, panneau
───────────────────────────────────────────────── */

/* Exposant HTML d'un nombre d'électrons */
function supHTML(n) { return '<sup>' + n + '</sup>'; }

/* Configuration électronique colorée (ex. : O : 1s² 2s² 2p⁴ (3s⁰ 3p⁰)) */
function configHTML() {
  var el = getElement(state.Z);
  var conf = getConfig(state.Z);
  var occ = {};
  conf.forEach(function (c) { occ[c.sub.id] = true; });

  var html = '<span class="cfg-sym">' + el.sym + '&nbsp;:</span> ';
  conf.forEach(function (c) {
    html += '<span class="cfg-term" style="color:' + c.sub.color + '">' +
            c.sub.id + supHTML(c.count) + '</span> ';
  });

  if (state.showEmpty) {
    var maxN = getMaxNAffiche(state.Z);
    var vides = SUBSHELLS.filter(function (s) { return !occ[s.id] && s.n <= maxN; });
    if (vides.length) {
      html += '<span class="cfg-paren">(</span>';
      vides.forEach(function (s, i) {
        html += '<span class="cfg-term cfg-vide" style="color:' + s.color + '">' +
                s.id + supHTML(0) + '</span>' + (i < vides.length - 1 ? ' ' : '');
      });
      html += '<span class="cfg-paren">)</span>';
    }
  }
  return html;
}

function majInfos() {
  var el = getElement(state.Z);
  var N = el.A - el.Z;

  /* Titre : nom de l'élément sélectionné */
  document.getElementById('atom-title').textContent = el.nom;

  /* Box Propriétés */
  document.getElementById('props-az-a').textContent = el.A;
  document.getElementById('props-az-z').textContent = el.Z;
  document.getElementById('props-sym').textContent = el.sym;
  document.getElementById('props-a').innerHTML =
    'A&nbsp;= <b>' + el.A + '</b> nucléon' + (el.A > 1 ? 's' : '');
  document.getElementById('props-p').innerHTML =
    'Z&nbsp;= <b>' + el.Z + '</b> proton' + (el.Z > 1 ? 's' : '');
  document.getElementById('props-n').innerHTML =
    'N&nbsp;= <b>' + N + '</b> neutron' + (N > 1 ? 's' : '');
  document.getElementById('props-e').innerHTML =
    '<b>' + el.Z + '</b> électron' + (el.Z > 1 ? 's' : '');
  document.getElementById('props-config').innerHTML = configHTML();
}

/* ─────────────────────────────────────────────────
   Options d'affichage
───────────────────────────────────────────────── */
function toggleEmpty(checked) {
  state.showEmpty = checked;
  render();
  majInfos();
}

function toggleLegend(checked) {
  state.showLegend = checked;
  document.getElementById('atom-legend').style.display = checked ? '' : 'none';
}

/* ─────────────────────────────────────────────────
   Box Propriétés — position horizontale
   Ancrée dynamiquement au bord réel du cercle du schéma (plutôt qu'à
   une largeur de conteneur arbitraire) : le schéma est limité par
   min(_w, _h) et peut donc être petit même sur une fenêtre très large
   (fenêtre large et peu haute) — seule une position calculée à partir
   de sa taille réelle reste juste dans tous les cas. Appelée par
   render() (draw.js) à chaque rendu.
───────────────────────────────────────────────── */
var PROPS_GAP  = 22;   /* espace entre la box et le cercle du schéma   */
var PROPS_EDGE = 10;   /* marge mini avec le bord gauche de la fenêtre */

function positionPropsBox() {
  var box = document.getElementById('props-box');
  if (!box || !_w) return;
  var schemaLeft = _w / 2 - _schemaRmax;   /* bord gauche du cercle 3p */
  var left = schemaLeft - PROPS_GAP - box.offsetWidth;
  box.style.left = Math.max(PROPS_EDGE, left) + 'px';
}

/* ─────────────────────────────────────────────────
   Box Propriétés (repli en bandeau vertical)
───────────────────────────────────────────────── */
function togglePropsBox() {
  var box = document.getElementById('props-box');
  var body = document.getElementById('props-body');
  var collapsed = box.classList.toggle('collapsed');
  var btn = document.getElementById('props-toggle');
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.title = collapsed ? 'Afficher les propriétés' : 'Réduire en bandeau';

  /* La scrollbar (overflow-y: auto) n'est réactivée qu'une fois la
     transition d'ouverture terminée, sinon elle clignote tant que
     max-height anime en dessous de la hauteur du contenu (cf. CSS). */
  body.classList.remove('settled');
  if (!collapsed) {
    body.addEventListener('transitionend', function onEnd(e) {
      if (e.propertyName !== 'max-height') return;
      body.removeEventListener('transitionend', onEnd);
      if (!box.classList.contains('collapsed')) body.classList.add('settled');
    });
  }
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
/* Pas d'appel synchrone à resizeAtomCanvas() ici : le ResizeObserver
   ci-dessus se déclenche de lui-même dès l'observation avec la taille
   déjà stabilisée, et fait le premier dessin correct directement — on
   évite ainsi un premier rendu distordu (canvas mesuré trop tôt) suivi
   d'une correction visible juste après. */
selectElement(state.Z);
