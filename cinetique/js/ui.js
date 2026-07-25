// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  ui.js — Contrôles UI et boucle d'animation
//  Chargé en DERNIER. Dépend de sim.js, recipient.js et graph.js.
//  Orchestre la boucle RAF, les événements des sliders/boutons,
//  la mise à jour des readouts, et l'initialisation générale.
//
//  Les contrôles se répartissent en deux familles :
//  - COMMUNS aux simulations : Lancer/Pause, RAZ, vitesse d'animation,
//    nombre de simulations affichées ;
//  - PROPRES à une simulation : température, molécules A, molécules B,
//    readouts — dupliqués et suffixés par l'index (-1 / -2).
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Horodatage de la frame précédente ─────────────────────────────────
var _lastTs = null;

// ── Cadence de rafraîchissement des afficheurs du panneau ──────────────
var _readoutTimer  = 0;    // ms cumulés depuis la dernière mise à jour
var READOUT_PERIOD = 100;  // ms (10 Hz)

// ── Crans du slider "Vitesse d'animation" ──────────────────────────────
var SPEED_STEPS  = [0.10, 0.50, 1.00, 2.00];
var SPEED_LABELS = ['0,10', '0,50', '1,00', '2,00'];

// ══════════════════════════════════════════════════════════════════════
//  Boucle d'animation (RAF)
// ══════════════════════════════════════════════════════════════════════

function toggleHint() {
  var hint = document.getElementById('panel-hint');
  if (hint) hint.classList.toggle('collapsed');
}

function loop(ts) {
  requestAnimationFrame(loop);

  if (_lastTs === null) { _lastTs = ts; return; }

  var dtReal = Math.min(ts - _lastTs, 50);  // plafonné à 50 ms
  _lastTs = ts;

  // Même dt pour toutes les simulations : elles avancent au même temps
  // simulé, seule condition pour que la comparaison ait un sens.
  var dt = paused ? 0 : dtReal * speedFactor;
  var list = activeSims();

  if (dt > 0) {
    for (var i = 0; i < list.length; i++) stepPhysics(list[i], dt);

    // Readouts à ~10 Hz : 4 écritures DOM par frame ne servent à rien et
    // forcent le navigateur à recalculer la mise en page du panneau.
    _readoutTimer += dtReal;
    if (_readoutTimer >= READOUT_PERIOD) {
      _readoutTimer = 0;
      updateReadouts();
    }
  }

  for (var j = 0; j < list.length; j++) drawScene(list[j]);

  // Le graphe ne change qu'à chaque nouveau point d'historique (5 fois par
  // seconde de temps simulé) : inutile de le redessiner à 60 fps.
  // Les bornes des axes étant communes, dès qu'une simulation a un nouveau
  // point on redessine tous les graphes affichés.
  var dirty = false;
  for (var k = 0; k < list.length; k++) {
    if (list[k].historyDirty) { list[k].historyDirty = false; dirty = true; }
  }
  if (dirty) drawAllCharts();
}

// ══════════════════════════════════════════════════════════════════════
//  Mise à jour des readouts
// ══════════════════════════════════════════════════════════════════════

function updateReadouts() {
  activeSims().forEach(function (s) {
    var c = countSpecies(s);
    ['A', 'B', 'C', 'D'].forEach(function (key) {
      var el = document.getElementById('ro-' + key + '-' + s.index);
      if (el) el.textContent = c[key];
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
//  Synchronisation UI → état sim (utilisé à l'init et au reset)
// ══════════════════════════════════════════════════════════════════════

function syncUIToSim() {
  sims.forEach(function (s) {
    var i = s.index;
    document.getElementById('sl-T-' + i).value = s.T_C;
    document.getElementById('lbl-T-' + i).textContent = s.T_C;

    document.getElementById('sl-NA-' + i).value = s.N0_A;
    document.getElementById('lbl-NA-' + i).textContent = s.N0_A;

    document.getElementById('sl-NB-' + i).value = s.N0_B;
    document.getElementById('lbl-NB-' + i).textContent = s.N0_B;

    document.getElementById('sl-CATA-' + i).value = s.N_CATA;
    document.getElementById('lbl-CATA-' + i).textContent = s.N_CATA;

    // Le halo n'a d'objet que s'il y a au moins un catalyseur. L'état coché
    // est conservé pendant que la case est grisée : remettre un catalyseur
    // retrouve le réglage précédent de l'utilisateur.
    var ck = document.getElementById('ck-radius-' + i);
    ck.disabled = (s.N_CATA === 0);
    ck.checked  = s.showActionRadius;
  });

  _updatePlayPauseBtn();
  updateReadouts();
}

function _updatePlayPauseBtn() {
  var btn = document.getElementById('btn-playpause');
  if (paused) {
    btn.textContent = '▶ Lancer';
    btn.className   = 'btn btn-play';
  } else {
    btn.textContent = '⏸ Pause';
    btn.className   = 'btn btn-pause';
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Gestionnaires des contrôles (appelés depuis index.html)
// ══════════════════════════════════════════════════════════════════════

// ── Play / Pause (commun aux deux simulations) ──
function togglePause() {
  paused = !paused;
  _updatePlayPauseBtn();
}

// ── Slider Vitesse d'animation (commun) ──
function onSliderSpeed(val) {
  var idx = parseInt(val, 10);
  speedFactor = SPEED_STEPS[idx];
  document.getElementById('lbl-speed').textContent = SPEED_LABELS[idx];
}

// ── Bouton "Nombre de simulation(s)" : 1 ou 2 ──
// Passer de 1 à 2 (ou l'inverse) redimensionne les zones d'animation : les
// molécules doivent être replacées dans les nouveaux récipients, et les deux
// simulations doivent repartir du même instant. On fait donc une RAZ.
function setSimCount(n) {
  if (n === simCount) return;
  simCount = n;

  document.body.classList.toggle('duo', n === 2);
  document.getElementById('btn-nsim-1').classList.toggle('active', n === 1);
  document.getElementById('btn-nsim-2').classList.toggle('active', n === 2);

  // La lecture de clientWidth/clientHeight force le navigateur à appliquer la
  // nouvelle mise en page : les canvas sont donc redimensionnés d'après leur
  // taille définitive, pas celle d'avant le basculement.
  activeSims().forEach(function (s) {
    resizeRecipient(s);
    resizeChart(s);
  });

  resetSim();      // repose les molécules dans les récipients redimensionnés
  drawAllCharts();
}

// ── Slider Température (par simulation) ──
function onSliderT(i, val) {
  var T_C_new = parseInt(val, 10);
  document.getElementById('lbl-T-' + i).textContent = T_C_new;
  setTemperature(sims[i - 1], T_C_new);
}

// ── Slider Nombre de molécules A (par simulation) ──
function onSliderNA(i, val) {
  var n = parseInt(val, 10);
  document.getElementById('lbl-NA-' + i).textContent = n;
  setSpeciesCount(sims[i - 1], 'A', n);
}

// ── Slider Nombre de molécules B (par simulation) ──
function onSliderNB(i, val) {
  var n = parseInt(val, 10);
  document.getElementById('lbl-NB-' + i).textContent = n;
  setSpeciesCount(sims[i - 1], 'B', n);
}

// ── Slider Nombre de catalyseurs (par simulation) ──
function onSliderCata(i, val) {
  var n = parseInt(val, 10);
  document.getElementById('lbl-CATA-' + i).textContent = n;
  setCatalystCount(sims[i - 1], n);
}

// ── Case « Afficher le rayon d'action » (par simulation) ──
function onToggleRadius(i, checked) {
  sims[i - 1].showActionRadius = checked;
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation
// ══════════════════════════════════════════════════════════════════════

function init() {
  // 1. Rattacher chaque simulation à ses canvas (récipient + graphe)
  sims.forEach(function (s) {
    attachCanvas(s);
    attachChart(s);
  });

  // 2. Dimensionner les canvas et initialiser les molécules des simulations
  //    affichées (resizeRecipient est synchrone : la géométrie est disponible
  //    avant le placement des molécules et le premier rendu).
  activeSims().forEach(function (s) {
    resizeRecipient(s);
    initMolecules(s);
    buildChartLegend(s);
    resizeChart(s);
  });

  // 3. Légende des graphes non affichés : construite une fois pour toutes,
  //    elle sera prête si l'utilisateur passe à 2 simulations.
  sims.slice(simCount).forEach(buildChartLegend);

  // 4. Couleurs des pastilles des readouts et des lettres de l'équation,
  //    toutes posées depuis SPECIES_COLORS (source unique)
  ['A', 'B', 'C', 'D'].forEach(function (k) {
    sims.forEach(function (s) {
      var ro = document.getElementById('ro-lbl-' + k + '-' + s.index);
      if (ro) ro.style.color = SPECIES_COLORS[k].fill;
    });
    var eq = document.getElementById('eq-' + k);
    if (eq) eq.style.color = SPECIES_COLORS[k].fill;
  });

  // 4bis. Pastilles devant les titres des sliders Molécules A/B et
  //       Catalyseurs — mêmes sources uniques (SPECIES_COLORS / CATA_COLOR).
  sims.forEach(function (s) {
    var swA = document.getElementById('swatch-NA-' + s.index);
    if (swA) swA.style.background = SPECIES_COLORS.A.fill;
    var swB = document.getElementById('swatch-NB-' + s.index);
    if (swB) swB.style.background = SPECIES_COLORS.B.fill;
    var swC = document.getElementById('swatch-CATA-' + s.index);
    if (swC) swC.style.background = CATA_COLOR.fill;
  });

  // 5. Synchroniser l'UI
  syncUIToSim();

  // 6. Lancer la boucle RAF
  requestAnimationFrame(loop);
}

// ── Démarrage au chargement de la page ────────────────────────────────
window.addEventListener('load', init);
