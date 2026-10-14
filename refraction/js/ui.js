// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  ui.js — Onglets, contrôles du panneau, afficheurs, redimensionnement
//  Chargé en DERNIER. Dépend de sim.js et dioptre.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

var VALID_TABS = ['snell-descartes', 'prisme'];
var activeTab = 'snell-descartes';

// ══════════════════════════════════════════════════════════════════════
//  Onglets principaux + deep-linking (#snell-descartes / #prisme)
// ══════════════════════════════════════════════════════════════════════

function setMainTab(tab) {
  activeTab = tab;
  VALID_TABS.forEach(function (t) {
    var actif = (t === tab);
    var view = document.getElementById('view-' + t);
    var sec  = document.getElementById('section-' + t);
    var btn  = document.getElementById('tab-' + t);
    var hint = document.getElementById('panel-hint-' + t);
    if (view) view.style.display = actif ? '' : 'none';
    if (sec)  sec.style.display  = actif ? '' : 'none';
    if (btn)  btn.classList.toggle('active', actif);
    if (hint) hint.style.display = actif ? '' : 'none';
  });

  // Le canvas qui était en display:none avait une taille nulle :
  // le redimensionner maintenant qu'il est visible.
  resizeAll();

  // Mise à jour de l'URL sans empiler d'entrée d'historique.
  history.replaceState(null, '', location.pathname + '#' + tab);
}

function toggleHint(tab) {
  var hint = document.getElementById('panel-hint-' + tab);
  if (hint) hint.classList.toggle('collapsed');
}

// ══════════════════════════════════════════════════════════════════════
//  Sous-onglets de Snell-Descartes : Deux milieux / Demi-disque
// ══════════════════════════════════════════════════════════════════════

function setModeSnell(mode) {
  modeSnell = mode;
  document.getElementById('mode-milieux').classList.toggle('active', mode === 'milieux');
  document.getElementById('mode-disque').classList.toggle('active', mode === 'disque');
  document.getElementById('ctrl-milieux').style.display = mode === 'milieux' ? '' : 'none';
  document.getElementById('ctrl-disque').style.display  = mode === 'disque'  ? '' : 'none';
  surChangementScene();
}

// ══════════════════════════════════════════════════════════════════════
//  Point d'entrée unique après toute modification de la scène
//  (panneau ou glisser-déposer sur le canvas)
// ══════════════════════════════════════════════════════════════════════

function surChangementScene() {
  _syncAngleUI();
  updateReadouts();
  demanderRendu();
}

// ══════════════════════════════════════════════════════════════════════
//  Mode « Deux milieux » : choix des milieux
// ══════════════════════════════════════════════════════════════════════

// Remplit les deux sélecteurs à partir de MILIEUX (+ « Personnalisé »)
function _construireSelecteurs() {
  [1, 2].forEach(function (k) {
    var sel = document.getElementById('sel-milieu-' + k);
    sel.innerHTML = '';
    MILIEUX.forEach(function (m) {
      var o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.nom + ' (' + fmtFr(m.n, 2) + ')';
      sel.appendChild(o);
    });
    var p = document.createElement('option');
    p.value = MILIEU_PERSO;
    p.textContent = 'Personnalisé';
    sel.appendChild(p);
  });
}

function _milieu(k) { return k === 1 ? simDM.m1 : simDM.m2; }

// Choix d'un milieu dans la liste
function onSelectMilieu(k, id) {
  var m = _milieu(k);
  m.id = id;
  var def = milieuParId(id);
  if (def) m.n = def.n;
  _syncMilieuxUI();
  surChangementScene();
}

// Saisie libre d'un indice : appliquée dès qu'elle est valide, le
// sélecteur bascule alors sur « Personnalisé »
function onSaisieIndice(k, txt) {
  var v = lireIndice(txt);
  var inp = document.getElementById('inp-n-' + k);
  var ok = isFinite(v) && v >= N_MIN && v <= N_MAX;
  inp.classList.toggle('invalide', !ok);
  if (!ok) return;
  var m = _milieu(k);
  m.n = Math.round(v * 100) / 100;
  m.id = MILIEU_PERSO;
  document.getElementById('sel-milieu-' + k).value = MILIEU_PERSO;
  surChangementScene();
}

// Fin de saisie : valeur bornée et réécrite proprement
function onFinSaisieIndice(k) {
  var inp = document.getElementById('inp-n-' + k);
  var v = lireIndice(inp.value);
  if (isFinite(v) && (v < N_MIN || v > N_MAX)) {
    onSaisieIndice(k, String(_clampUI(v, N_MIN, N_MAX)));
  }
  inp.classList.remove('invalide');
  _syncMilieuxUI();
}

function inverserMilieux() {
  var tmp = simDM.m1;
  simDM.m1 = simDM.m2;
  simDM.m2 = tmp;
  _syncMilieuxUI();
  surChangementScene();
}

function _syncMilieuxUI() {
  [1, 2].forEach(function (k) {
    var m = _milieu(k);
    document.getElementById('sel-milieu-' + k).value = m.id;
    document.getElementById('inp-n-' + k).value = fmtFr(m.n, 2);
  });
}

function _clampUI(x, a, b) { return Math.max(a, Math.min(b, x)); }

// ── Angle d'incidence (curseur, au dixième de degré) ──
function onSliderIncidence(val) {
  simDM.i = auDixieme(parseFloat(val));
  surChangementScene();
}

function _syncAngleUI() {
  var sl = document.getElementById('sl-incidence');
  if (parseFloat(sl.value) !== simDM.i) sl.value = simDM.i;
  _setText('lbl-incidence', fmtFr(simDM.i, 1) + '°');
}

// ══════════════════════════════════════════════════════════════════════
//  Mode « Demi-disque »
// ══════════════════════════════════════════════════════════════════════

function onSliderIndiceDisque(val) {
  simDD.n = Math.round(parseFloat(val) * 100) / 100;
  _setText('lbl-n-disque', fmtFr(simDD.n, 2));
  surChangementScene();
}

// L'axe 0° du rapporteur est amené sur la normale à la face plane
function alignerRapporteur() {
  simDD.rappo = simDD.disque;
  surChangementScene();
}

function reinitialiserDisque() {
  simDD.laser  = DD_DEFAUT.laser;
  simDD.disque = DD_DEFAUT.disque;
  simDD.rappo  = DD_DEFAUT.rappo;
  surChangementScene();
}

// ══════════════════════════════════════════════════════════════════════
//  Options d'affichage
// ══════════════════════════════════════════════════════════════════════

function toggleAffichage(cle, val) {
  affichage[cle] = val;
  demanderRendu();
}

// Bloc « Mesures » : masqué au chargement, affiché à la demande
function toggleMesures() {
  var bloc = document.getElementById('mesures-snell');
  bloc.hidden = !bloc.hidden;
  document.getElementById('btn-mesures').textContent =
    bloc.hidden ? 'Afficher les mesures' : 'Masquer les mesures';
}

// ══════════════════════════════════════════════════════════════════════
//  Afficheurs du panneau
// ══════════════════════════════════════════════════════════════════════

function _setText(id, txt) {
  var el = document.getElementById(id);
  if (el) el.textContent = txt;
}

function updateReadouts() {
  var sc = modeSnell === 'milieux' ? sceneMilieux() : sceneDisque();

  // Sens de passage de la lumière
  var sens;
  if (modeSnell === 'milieux') {
    sens = nomMilieu(simDM.m1) + ' → ' + nomMilieu(simDM.m2);
  } else {
    sens = sc.cotePlexi ? 'Plexiglas → air' : 'Air → plexiglas';
  }
  _setText('ro-sens', sens);

  _setText('ro-i',  fmtFr(sc.i, 1) + '°');
  _setText('ro-ip', fmtFr(sc.i, 1) + '°');
  _setText('ro-r',  sc.tir ? '—' : fmtFr(sc.r, 1) + '°');

  // Angle limite (seulement si n1 > n2)
  var lim = angleLimite(sc.n1, sc.n2);
  _setText('ro-lim', lim === null ? 'aucun (n₁ ≤ n₂)' : fmtFr(lim, 1) + '°');

  document.getElementById('ro-tir').style.display = sc.tir ? '' : 'none';
}

// ══════════════════════════════════════════════════════════════════════
//  Redimensionnement (anti-rebond requestAnimationFrame)
// ══════════════════════════════════════════════════════════════════════

function resizeAll() {
  if (sizeCanvas(cvSnell)) dessinerSnell();
}

var _resizePending = false;
window.addEventListener('resize', function () {
  if (_resizePending) return;
  _resizePending = true;
  requestAnimationFrame(function () {
    _resizePending = false;
    resizeAll();
  });
});

// ══════════════════════════════════════════════════════════════════════
//  Initialisation
// ══════════════════════════════════════════════════════════════════════

function init() {
  cvSnell = document.getElementById('canvas-snell');
  ctxSnell = cvSnell.getContext('2d');

  _construireSelecteurs();
  _syncMilieuxUI();
  document.getElementById('sl-n-disque').value = simDD.n;
  _setText('lbl-n-disque', fmtFr(simDD.n, 2));
  initInteractionsSnell();

  var hash = window.location.hash.replace('#', '');
  if (VALID_TABS.indexOf(hash) !== -1) activeTab = hash;

  setModeSnell(modeSnell);
  setMainTab(activeTab);
}

window.addEventListener('load', init);
