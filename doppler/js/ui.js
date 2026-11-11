// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  ui.js — Onglets, commandes du panneau, boucle d'animation,
//  démonstration écrite, redimensionnement.
//  Chargé en DERNIER. Dépend de sim.js, profil.js et dessus.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

var VALID_TABS = ['demonstration', 'vue-de-dessus'];
var activeTab = 'demonstration';

function _setText(id, txt) {
  var el = document.getElementById(id);
  if (el) el.textContent = txt;
}

// ══════════════════════════════════════════════════════════════════════
//  Onglets principaux + deep-linking (#demonstration / #vue-de-dessus)
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

  // Les animations ne tournent que pour l'onglet visible
  if (tab !== 'demonstration') arreterLecture();
  if (tab !== 'vue-de-dessus') vdArreter();

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
//  Temps : lecture, étapes, curseur
// ══════════════════════════════════════════════════════════════════════

var _raf = null;
var _dernierTs = 0;

function _boucle(ts) {
  _raf = null;
  if (!simD.lecture) return;
  var dt = Math.min((ts - _dernierTs) / 1000, 0.05);   // onglet resté en arrière-plan : pas de saut
  _dernierTs = ts;
  avancerTemps(dt);
  if (simD.lecture) _raf = requestAnimationFrame(_boucle);
}

// Avance la date de dt secondes réelles ; s'arrête sur l'instant visé.
function avancerTemps(dt) {
  var arret = simD.cible >= 0 ? dopCles()[simD.cible] : dopTFin();
  simD.t += dt * simD.vitesse;
  if (simD.t >= arret) {
    simD.t = arret;
    arreterLecture();
  }
  majTemps();
}

function demarrerLecture(cible) {
  simD.cible = cible;
  simD.lecture = true;
  _majBoutonLecture();
  if (_raf === null) {
    _dernierTs = performance.now();
    _raf = requestAnimationFrame(_boucle);
  }
}

function arreterLecture() {
  simD.lecture = false;
  _majBoutonLecture();
}

function _majBoutonLecture() {
  var b = document.getElementById('btn-lecture');
  b.textContent = simD.lecture ? '⏸ Pause' : '▶ Lecture';
  b.classList.toggle('btn-pause', simD.lecture);
  b.classList.toggle('btn-play', !simD.lecture);
}

// Bouton Lecture / Pause : déroule l'animation jusqu'au bout (repart de 0 si elle est finie)
function basculerLecture() {
  if (simD.lecture) { arreterLecture(); return; }
  if (simD.t >= dopTFin() - 1e-6) simD.t = 0;
  demarrerLecture(-1);
}

function razDemo() { allerA(0); }

// Place la date à la main (curseur, frise, étape précédente) : met en pause.
function allerA(t) {
  arreterLecture();
  simD.t = borner(t, 0, dopTFin());
  majTemps();
}

// Étape ▶ : joue l'animation jusqu'à l'instant clé suivant
function etapeSuivante() {
  var c = dopCles();
  for (var i = 0; i < c.length; i++) {
    if (c[i] > simD.t + 1e-6) { demarrerLecture(i); return; }
  }
}

// ◀ Étape : revient directement à l'instant clé précédent
function etapePrecedente() {
  var c = dopCles();
  for (var i = c.length - 1; i >= 0; i--) {
    if (c[i] < simD.t - 1e-6) { allerA(c[i]); return; }
  }
  allerA(0);
}

function onSliderTemps(v) { allerA(parseFloat(v) / 1000 * dopTFin()); }

function onSliderVitesse(v) {
  simD.vitesse = parseFloat(v);
  _setText('lbl-vitesse', '×' + fmtFR(simD.vitesse, 2));
}

// Met à jour tout ce qui dépend de la date : curseur, démonstration, scène
function majTemps() {
  var tFin = dopTFin(), c = dopCles();
  document.getElementById('sl-temps').value = Math.round(simD.t / tFin * 1000);
  _setText('lbl-temps', fmtFR(simD.t, 2) + ' s');
  document.getElementById('btn-etape-prec').disabled = simD.t <= 1e-6;
  document.getElementById('btn-etape-suiv').disabled = simD.t >= c[3] - 1e-6;
  _majDemo();
  dessinerProfil();
}

// ══════════════════════════════════════════════════════════════════════
//  Démonstration écrite : lignes allumées selon la date
// ══════════════════════════════════════════════════════════════════════

function _majDemo() {
  var t = simD.t, c = dopCles(), e = 1e-6;
  // [atteinte, active] pour chacune des 5 lignes
  var etats = [
    [true,            t < c[1] - e],
    [t > e,           t > e && t < c[1] - e],
    [t >= c[1] - e,   t >= c[1] - e && t < c[2] - e],
    [t >= c[2] - e,   t >= c[2] - e && t < c[3] - e],
    [t >= c[3] - e,   t >= c[3] - e]
  ];
  for (var i = 0; i < 5; i++) {
    var el = document.getElementById('demo-l' + (i + 1));
    el.classList.toggle('atteinte', etats[i][0]);
    el.classList.toggle('active', etats[i][1]);
  }
}

// Textes de la démonstration qui dépendent du sens de déplacement
function _majTextesSens() {
  var rapproche = simD.sens > 0;
  var poser = function (cls, txt) {
    var els = document.querySelectorAll('.' + cls);
    for (var i = 0; i < els.length; i++) els[i].textContent = txt;
  };
  poser('dp-signe', rapproche ? '−' : '+');
  poser('dp-comp',  rapproche ? '>' : '<');
  poser('dp-verbe', rapproche ? 'avance' : 'recule');
  poser('dp-intro', rapproche ? 'se rapproche' : 's\'éloigne');
}

// ══════════════════════════════════════════════════════════════════════
//  Paramètres de l'émetteur
// ══════════════════════════════════════════════════════════════════════

// Applique un changement de paramètre en restant sur la même étape : si la
// date était exactement un instant clé (qui dépend des paramètres), elle le reste.
function _changerParam(appliquer) {
  var ancre = dopIndiceCle(simD.t);
  appliquer();
  simD.t = ancre >= 0 ? dopCles()[ancre] : Math.min(simD.t, dopTFin());
  _majValeurs();
  majTemps();
}

function setSens(sens) {
  _changerParam(function () { simD.sens = sens; });
  document.getElementById('sens-rapproche').classList.toggle('active', sens > 0);
  document.getElementById('sens-eloigne').classList.toggle('active', sens < 0);
  _majTextesSens();
}

function onSliderVE(v) {
  _changerParam(function () { simD.vE = parseFloat(v); });
  _setText('lbl-ve', fmtFR(simD.vE, 0) + ' cm/s');
}

function onSliderFE(v) {
  _changerParam(function () { simD.fE = parseFloat(v); });
  _setText('lbl-fe', fmtFR(simD.fE, 1) + ' Hz');
}

function toggleAffichage(cle, coche) {
  simD[cle] = coche;
  document.getElementById('demo-bloc').style.display = simD.showDemo ? '' : 'none';
  resizeAll();          // masquer la démonstration change la hauteur de la scène
}

function _majValeurs() {
  _setText('ro-te',      fmtFR(dopTE(), 2) + ' s');
  _setText('ro-lambda',  fmtFR(dopLambda(), 1) + ' cm');
  _setText('ro-vete',    fmtFR(simD.vE * dopTE(), 1) + ' cm');
  _setText('ro-lambdap', fmtFR(dopLambdaP(), 1) + ' cm');
  _setText('ro-tr',      fmtFR(dopTR(), 2) + ' s');
  _setText('ro-fr',      fmtFR(dopFR(), 2) + ' Hz');
}

// ══════════════════════════════════════════════════════════════════════
//  Redimensionnement (anti-rebond requestAnimationFrame)
// ══════════════════════════════════════════════════════════════════════

function resizeAll() {
  if (sizeCanvas(cvProfil)) dessinerProfil();
  resizeDessus();                     // dessus.js (sans effet si l'onglet est masqué)
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
  cvProfil = document.getElementById('canvas-profil');
  ctxProfil = cvProfil.getContext('2d');
  initInteractionsProfil();
  initDessus();                       // dessus.js

  // Les curseurs reprennent l'état (un rechargement peut restaurer d'anciennes valeurs)
  document.getElementById('sl-ve').value = simD.vE;
  document.getElementById('sl-fe').value = simD.fE;
  document.getElementById('sl-vitesse').value = simD.vitesse;

  var hash = window.location.hash.replace('#', '');
  if (VALID_TABS.indexOf(hash) !== -1) activeTab = hash;

  _majTextesSens();
  _majValeurs();
  setMainTab(activeTab);
  majTemps();
}

window.addEventListener('load', init);
