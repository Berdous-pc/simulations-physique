// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  ui.js — Onglets, contrôles du panneau, afficheurs, redimensionnement
//  Chargé en DERNIER. Dépend de sim.js, dioptre.js et prisme.js.
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
//  Onglet Prisme
// ══════════════════════════════════════════════════════════════════════

// Point d'entrée unique après toute modification (panneau ou souris)
function surChangementPrisme() {
  _syncPrismeUI();
  updateReadoutsPrisme();
  demanderRenduPrisme();
}

function _construireSelecteurPrisme() {
  var sel = document.getElementById('sel-prisme');
  sel.innerHTML = '';
  PR_MATERIAUX.forEach(function (id) {
    var m = milieuParId(id);
    var o = document.createElement('option');
    o.value = m.id;
    o.textContent = m.nom + ' (' + fmtFr(m.n, 2) + ')';
    sel.appendChild(o);
  });
}

function setSourcePrisme(type) {
  simPR.source = type;
  document.getElementById('src-blanche').classList.toggle('active', type === 'blanche');
  document.getElementById('src-mono').classList.toggle('active', type === 'mono');
  document.getElementById('ctrl-mono').style.display = type === 'mono' ? '' : 'none';
  // Le choix continu / discret ne concerne que la lumière blanche
  document.getElementById('choix-spectre').classList.toggle('inactif', type === 'mono');
  document.getElementById('hint-spectre').style.display = type === 'mono' ? 'none' : '';
  surChangementPrisme();
}

// Spectre continu / discret (boutons de la rubrique Affichage)
function setSpectrePR(mode) {
  if (simPR.source === 'mono') return;
  affichagePR.spectre = mode;
  document.getElementById('spec-continu').classList.toggle('active', mode === 'continu');
  document.getElementById('spec-discret').classList.toggle('active', mode === 'discret');
  surChangementPrisme();
}

function onSliderLambda(val) {
  simPR.lambda = Math.round(parseFloat(val));
  surChangementPrisme();
}

function onSelectPrisme(id) {
  simPR.milieu = id;
  surChangementPrisme();
}

function onSliderAnglePrisme(val) {
  simPR.A = Math.round(parseFloat(val));
  surChangementPrisme();
}

function onSliderRotPrisme(val) {
  simPR.rot = auDixieme(parseFloat(val));
  surChangementPrisme();
}

// Tracé en unités m (relatives à G), sans écran : indépendant de la
// taille du canvas. Sert aux mesures et au curseur d'incidence.
function _sommetsMonde() {
  return sommetsPrisme({ x: 0, y: 0 }, PR_COTE, simPR.A, simPR.rot);
}
function _traceMonde(l) {
  var mat = milieuParId(simPR.milieu);
  return tracerRayon({ x: simPR.sx, y: simPR.sy }, vDir(simPR.dir),
                     indiceCauchy(mat, l), _sommetsMonde(), { x: 1e9, y0: 0, y1: 0 }, 10);
}

// Côté de la normale où se trouve la source (+1 / −1), mémorisé pour
// i = 0
var _coteIncPR = 1;

// Angle d'incidence imposé : la source tourne autour du point d'incidence
// sur la face d'entrée (même distance), le faisceau frappe donc toujours
// le même point.
function onSliderIncidencePR(val) {
  var tr = _traceMonde(589);
  if (tr.i === null) return;
  var I = tr.pts[1], s = _sommetsMonde(), f = +tr.cle[0];
  var a = s[f], b = s[(f + 1) % 3];
  var nOut = vNorm({ x: b.y - a.y, y: a.x - b.x });
  var S = { x: simPR.sx, y: simPR.sy };
  var u = vNorm({ x: S.x - I.x, y: S.y - I.y });
  var cr = nOut.x * u.y - nOut.y * u.x;
  if (Math.abs(cr) > 1e-9) _coteIncPR = cr > 0 ? 1 : -1;
  var i = _clamp(parseFloat(val), 0, 89.9);
  var ang = Math.atan2(nOut.y, nOut.x) + _coteIncPR * i * DEG;
  var D = Math.hypot(S.x - I.x, S.y - I.y);
  simPR.sx = I.x + Math.cos(ang) * D;
  simPR.sy = I.y + Math.sin(ang) * D;
  simPR.dir = normDeg(ang / DEG + 180);
  surChangementPrisme();
}

// Source, orientation et angle au sommet par défaut (le matériau et le
// type de source sont conservés)
function reinitialiserPrisme() {
  simPR.A   = PR_DEFAUT.A;
  simPR.rot = PR_DEFAUT.rot;
  simPR.sx  = PR_DEFAUT.sx;
  simPR.sy  = PR_DEFAUT.sy;
  simPR.dir = PR_DEFAUT.dir;
  vueEnsemble();
  surChangementPrisme();
}

function toggleAffichagePR(cle, val) {
  affichagePR[cle] = val;
  demanderRenduPrisme();
}

function _syncPrismeUI() {
  var sl = document.getElementById('sl-rot-prisme');
  if (parseFloat(sl.value) !== simPR.rot) sl.value = simPR.rot;
  _setText('lbl-rot-prisme', fmtFr(simPR.rot, 1) + '°');
  document.getElementById('sl-angle-prisme').value = simPR.A;
  _setText('lbl-angle-prisme', fmtFr(simPR.A, 0) + '°');
  document.getElementById('sl-lambda').value = simPR.lambda;
  _setText('lbl-lambda', simPR.lambda + ' nm');
  document.getElementById('sw-lambda').style.background = couleurLambda(simPR.lambda);
  document.getElementById('sel-prisme').value = simPR.milieu;

  // Angle d'incidence actuel (curseur inactif si le prisme est manqué)
  var tr = _traceMonde(589);
  var sli = document.getElementById('sl-inc-prisme');
  sli.disabled = tr.i === null;
  if (tr.i !== null) sli.value = auDixieme(tr.i);
  _setText('lbl-inc-prisme', tr.i === null ? '—' : fmtFr(tr.i, 1) + '°');
}

function _afficherLigne(id, oui) {
  document.getElementById(id).style.display = oui ? '' : 'none';
}

// Les mesures ne dépendent pas de la taille du canvas : le tracé se fait
// ici en unités m, sans écran (il ne sert qu'au dessin).
function updateReadoutsPrisme() {
  var mat = milieuParId(simPR.milieu);
  function fmtA(a) { return a === null ? '—' : fmtFr(a, 1) + '°'; }

  var mono = simPR.source === 'mono';
  var lambdas = lambdasSource();
  var trs = lambdas.map(function (l) { return _traceMonde(l); });
  var tir = trs.some(function (t) { return t.tir; });
  var prison = trs.some(function (t) { return t.cle.slice(-1) === 'P'; });

  _setText('ro-pr-mat', mat.nom);
  _afficherLigne('ligne-pr-n2', !mono);
  _afficherLigne('ligne-pr-d2', !mono);
  _afficherLigne('ligne-pr-ecart', !mono);

  // Extrêmes du spectre affiché : rouge (dernier), violet (premier)
  var trR = trs[trs.length - 1], trV = trs[0];
  var lR = lambdas[lambdas.length - 1], lV = lambdas[0];
  if (mono) {
    _setText('lab-pr-n1', 'Indice n (' + simPR.lambda + ' nm)');
    _setText('ro-pr-n1', fmtFr(indiceCauchy(mat, simPR.lambda), 3));
    _setText('lab-pr-d1', 'Déviation D');
    _setText('ro-pr-d1', fmtA(trs[0].D));
  } else {
    _setText('lab-pr-n1', 'Indice n (rouge, ' + Math.round(lR) + ' nm)');
    _setText('lab-pr-n2', 'Indice n (violet, ' + Math.round(lV) + ' nm)');
    _setText('ro-pr-n1', fmtFr(indiceCauchy(mat, lR), 3));
    _setText('ro-pr-n2', fmtFr(indiceCauchy(mat, lV), 3));
    _setText('lab-pr-d1', 'Déviation D (rouge)');
    _setText('ro-pr-d1', fmtA(trR.D));
    _setText('ro-pr-d2', fmtA(trV.D));
    _setText('ro-pr-ecart', (trR.D === null || trV.D === null) ? '—'
             : fmtFr(trV.D - trR.D, 1) + '°');
  }
  _setText('ro-pr-i', fmtA(trs[0].i));

  // Message : prisme manqué, ou réflexion totale à l'intérieur
  var msg = '';
  if (trs[0].i === null) msg = 'Le faisceau ne rencontre pas le prisme.';
  else if (prison) msg = 'Réflexion totale : la lumière reste piégée dans le prisme.';
  else if (tir) msg = 'Réflexion totale sur une face : la lumière ressort par une autre face.';
  var el = document.getElementById('ro-pr-msg');
  el.textContent = msg;
  el.style.display = msg ? '' : 'none';
}

// ══════════════════════════════════════════════════════════════════════
//  Redimensionnement (anti-rebond requestAnimationFrame)
// ══════════════════════════════════════════════════════════════════════

function resizeAll() {
  if (sizeCanvas(cvSnell)) dessinerSnell();
  if (sizeCanvas(cvPrisme)) dessinerPrisme();
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

  cvPrisme = document.getElementById('canvas-prisme');
  ctxPrisme = cvPrisme.getContext('2d');
  _construireSelecteurPrisme();
  initInteractionsPrisme();
  setSourcePrisme(simPR.source);

  var hash = window.location.hash.replace('#', '');
  if (VALID_TABS.indexOf(hash) !== -1) activeTab = hash;

  setModeSnell(modeSnell);
  setMainTab(activeTab);
}

window.addEventListener('load', init);
