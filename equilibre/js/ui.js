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
//  - PROPRES à une simulation : quantités initiales A/B/C/D, probabilités
//    A+B et C+D, readouts — dupliqués et suffixés par l'index (-1 / -2).
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
  // seconde de temps simulé) : inutile de le redessiner à 60 fps. La frise
  // suit la même cadence — son aiguille instantanée n'a rien à gagner à
  // s'agiter à 60 fps.
  //
  // Deux drapeaux distincts et non un seul : passé HISTORY_MAX_MS (5 min de
  // temps simulé), le graphe cesse de s'allonger et n'a donc plus rien à
  // redessiner, alors que la frise continue de suivre Qr indéfiniment.
  var chartDirty = false, friseDirty = false;
  for (var k = 0; k < list.length; k++) {
    if (list[k].historyDirty) { list[k].historyDirty = false; chartDirty = true; }
    if (list[k].friseDirty)   { list[k].friseDirty   = false; friseDirty = true; }
  }
  if (chartDirty) drawAllCharts();
  if (friseDirty) drawAllFrises();
}

// ══════════════════════════════════════════════════════════════════════
//  Mise à jour des readouts
// ══════════════════════════════════════════════════════════════════════

// Formate le quotient de réaction Qr = (N_C·N_D)/(N_A·N_B) ou la constante K.
function _formatQr(qr) {
  if (qr === null) return '—';
  if (qr === Infinity) return '∞';
  return qr.toFixed(2).replace('.', ',');
}

function updateReadouts() {
  activeSims().forEach(function (s) {
    var c = countSpecies(s);
    ['A', 'B', 'C', 'D'].forEach(function (key) {
      var el = document.getElementById('ro-' + key + '-' + s.index);
      if (el) el.textContent = c[key];
    });

    // Qr instantané et moyenné ne sont plus dupliqués dans le panneau
    // (readout « Quantités actuelles ») : ils vivent uniquement sur la
    // frise, cf. frise.js.

    // Valeur de K dans la formule affichée au-dessus de la frise : elle ne
    // dépend que des deux sliders de probabilité, mais on la rafraîchit ici
    // pour n'avoir qu'un seul point de vérité.
    var kEl = document.getElementById('frise-K-val-' + s.index);
    if (kEl) kEl.textContent = _formatQr(equilibriumConstant(s));
  });
}

// ══════════════════════════════════════════════════════════════════════
//  Synchronisation UI → état sim (utilisé à l'init et au reset)
// ══════════════════════════════════════════════════════════════════════

function syncUIToSim() {
  sims.forEach(function (s) {
    var i = s.index;

    document.getElementById('sl-NA-' + i).value = s.N0_A;
    document.getElementById('lbl-NA-' + i).textContent = s.N0_A;

    document.getElementById('sl-NB-' + i).value = s.N0_B;
    document.getElementById('lbl-NB-' + i).textContent = s.N0_B;

    document.getElementById('sl-NC-' + i).value = s.N0_C;
    document.getElementById('lbl-NC-' + i).textContent = s.N0_C;

    document.getElementById('sl-ND-' + i).value = s.N0_D;
    document.getElementById('lbl-ND-' + i).textContent = s.N0_D;

    document.getElementById('sl-probAB-' + i).value = s.probAB;
    document.getElementById('lbl-probAB-' + i).textContent = s.probAB;

    document.getElementById('sl-probCD-' + i).value = s.probCD;
    document.getElementById('lbl-probCD-' + i).textContent = s.probCD;

    var ck = document.getElementById('ck-qr-inst-' + i);
    if (ck) ck.checked = s.showQrInstant;

    var btnTheo = document.getElementById('btn-theo-' + i);
    if (btnTheo) btnTheo.classList.toggle('active', s.showTheoretical);
  });

  _updatePlayPauseBtn();
  updateReadouts();
  // La frise dépend des mêmes données que les readouts : la redessiner ici
  // couvre l'init et toutes les RAZ (y compris celles déclenchées par un
  // slider de quantité), qui n'ont pas de nouveau point d'historique et ne
  // passeraient donc pas par la branche `dirty` de loop().
  drawAllFrises();
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
function setSimCount(n) {
  if (n === simCount) return;
  simCount = n;

  document.body.classList.toggle('duo', n === 2);
  document.getElementById('btn-nsim-1').classList.toggle('active', n === 1);
  document.getElementById('btn-nsim-2').classList.toggle('active', n === 2);

  activeSims().forEach(function (s) {
    resizeRecipient(s);
    resizeChart(s);
    resizeFrise(s);
  });

  resetSim();      // repose les molécules dans les récipients redimensionnés
  drawAllCharts();
  drawAllFrises();
}

// ── Onglets « Graphe » / « Frise Qr » (mode 2 simulations, par simulation) ──
// En mode 1 simulation les deux vues sont affichées ensemble et les onglets
// sont masqués : cette fonction ne sert donc qu'en mode double, où la
// hauteur disponible par ligne ne permet d'en afficher qu'une.
// Le canvas qui redevient visible avait une taille nulle tant qu'il était en
// `display:none` : il faut le redimensionner MAINTENANT, sinon il reste vide.
function setView(i, view) {
  var s = sims[i - 1];
  if (s.view === view) return;
  s.view = view;

  var area = document.getElementById('graph-area-' + i);
  if (area) area.classList.toggle('view-frise', view === 'frise');

  var tabG = document.getElementById('tab-graphe-' + i);
  var tabF = document.getElementById('tab-frise-' + i);
  if (tabG) tabG.classList.toggle('active', view === 'graphe');
  if (tabF) tabF.classList.toggle('active', view === 'frise');

  if (view === 'frise') { resizeFrise(s); } else { resizeChart(s); }
}

// ── Case « Afficher Qr instantané » (sous la frise, par simulation) ──
function onToggleQrInstant(i, checked) {
  sims[i - 1].showQrInstant = checked;
  drawFrise(sims[i - 1]);
}

// ── Bouton « Quantités finales théoriques » (par simulation) ──
// Même motif que .btn-toggle-one de diffraction/ : état porté par la
// simulation, classe .active synchronisée à la main (pas de <input> caché
// dessous). drawAllCharts() et non drawChart(s) seul : les bornes de l'axe
// Y sont communes aux deux graphes affichés (cf. _axisBounds dans
// graph.js), donc ce réglage sur UNE simulation peut changer l'échelle de
// l'autre.
function toggleTheoretical(i) {
  var s = sims[i - 1];
  s.showTheoretical = !s.showTheoretical;
  var btn = document.getElementById('btn-theo-' + i);
  if (btn) btn.classList.toggle('active', s.showTheoretical);
  drawAllCharts();
}

// ── Sliders Nombre de molécules A/B/C/D (par simulation) ──
function onSliderNA(i, val) {
  var n = parseInt(val, 10);
  document.getElementById('lbl-NA-' + i).textContent = n;
  setSpeciesCount(sims[i - 1], 'A', n);
}

function onSliderNB(i, val) {
  var n = parseInt(val, 10);
  document.getElementById('lbl-NB-' + i).textContent = n;
  setSpeciesCount(sims[i - 1], 'B', n);
}

function onSliderNC(i, val) {
  var n = parseInt(val, 10);
  document.getElementById('lbl-NC-' + i).textContent = n;
  setSpeciesCount(sims[i - 1], 'C', n);
}

function onSliderND(i, val) {
  var n = parseInt(val, 10);
  document.getElementById('lbl-ND-' + i).textContent = n;
  setSpeciesCount(sims[i - 1], 'D', n);
}

// ── Sliders Probabilité A+B / C+D (par simulation) ──
// Ces réglages ne provoquent PAS de RAZ (cf. setReactionProbability) : rien
// ne redessinerait donc la frise si la simulation est en pause, alors que K
// vient de bouger. D'où les appels explicites.
function onSliderProbAB(i, val) {
  var n = parseInt(val, 10);
  document.getElementById('lbl-probAB-' + i).textContent = n;
  setReactionProbability(sims[i - 1], 'AB', n);
  updateReadouts();
  drawFrise(sims[i - 1]);
  // K vient de changer : les pointillés « Quantités finales théoriques »
  // (théoriquement dépendants de K) doivent suivre en direct, pas
  // seulement au prochain point d'historique. drawAllCharts() et non
  // drawChart(s) seul : les bornes de l'axe Y sont communes aux deux
  // graphes affichés (cf. _axisBounds dans graph.js).
  drawAllCharts();
}

function onSliderProbCD(i, val) {
  var n = parseInt(val, 10);
  document.getElementById('lbl-probCD-' + i).textContent = n;
  setReactionProbability(sims[i - 1], 'CD', n);
  updateReadouts();
  drawFrise(sims[i - 1]);
  drawAllCharts();
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation
// ══════════════════════════════════════════════════════════════════════

function init() {
  // 1. Rattacher chaque simulation à ses canvas (récipient + graphe + frise)
  sims.forEach(function (s) {
    attachCanvas(s);
    attachChart(s);
    attachFrise(s);
  });

  // 2. Dimensionner les canvas et initialiser les molécules des simulations
  //    affichées (resizeRecipient est synchrone : la géométrie est disponible
  //    avant le placement des molécules et le premier rendu).
  activeSims().forEach(function (s) {
    resizeRecipient(s);
    initMolecules(s);
    buildChartLegend(s);
    resizeChart(s);
    resizeFrise(s);
  });

  // 3. Légende des graphes non affichés : construite une fois pour toutes,
  //    elle sera prête si l'utilisateur passe à 2 simulations.
  sims.slice(simCount).forEach(buildChartLegend);

  // 4. Couleurs des pastilles des readouts, des lettres de l'équation et des
  //    lettres d'espèce dans les formules de la frise (`.sp-A` … `.sp-D`) —
  //    toutes posées depuis SPECIES_COLORS (source unique)
  ['A', 'B', 'C', 'D'].forEach(function (k) {
    sims.forEach(function (s) {
      var ro = document.getElementById('ro-lbl-' + k + '-' + s.index);
      if (ro) ro.style.color = SPECIES_COLORS[k].fill;
    });
    var eq = document.getElementById('eq-' + k);
    if (eq) eq.style.color = SPECIES_COLORS[k].fill;

    var sp = document.querySelectorAll('.sp-' + k);
    for (var i = 0; i < sp.length; i++) sp[i].style.color = SPECIES_COLORS[k].fill;
  });

  // 4bis. Pastilles devant les titres des sliders Molécules A/B/C/D —
  //       même source unique (SPECIES_COLORS).
  sims.forEach(function (s) {
    ['A', 'B', 'C', 'D'].forEach(function (k) {
      var sw = document.getElementById('swatch-N' + k + '-' + s.index);
      if (sw) sw.style.background = SPECIES_COLORS[k].fill;
    });
  });

  // 5. Synchroniser l'UI
  syncUIToSim();

  // 6. Lancer la boucle RAF
  requestAnimationFrame(loop);
}

// ── Démarrage au chargement de la page ────────────────────────────────
window.addEventListener('load', init);
