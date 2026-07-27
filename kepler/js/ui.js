// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  ui.js — Contrôles UI, onglets et boucle d'animation
//  Chargé en DERNIER. Dépend de sim.js, orbites.js et graph.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

var VALID_TABS = ['premiere-loi', 'deuxieme-loi', 'troisieme-loi'];
var activeTab = 'premiere-loi';

// ── Horodatage de la frame précédente ─────────────────────────────────
var _lastTs = null;

// ── Cadence de rafraîchissement des afficheurs du panneau ─────────────
var _readoutTimer  = 0;    // ms cumulés depuis la dernière mise à jour
var READOUT_PERIOD = 100;  // ms (10 Hz)

// ══════════════════════════════════════════════════════════════════════
//  Onglets principaux + deep-linking (#premiere-loi / #deuxieme-loi / …)
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

  // Les canvas qui étaient en display:none avaient une taille nulle :
  // les redimensionner maintenant qu'ils sont visibles.
  resizeAll();

  // Mise à jour de l'URL sans empiler d'entrée d'historique.
  history.replaceState(null, '', location.pathname + '#' + tab);
}

function toggleHint(tab) {
  var hint = document.getElementById('panel-hint-' + tab);
  if (hint) hint.classList.toggle('collapsed');
}

// ══════════════════════════════════════════════════════════════════════
//  Boucle d'animation (RAF) — seul l'onglet actif avance et se redessine
// ══════════════════════════════════════════════════════════════════════

function loop(ts) {
  requestAnimationFrame(loop);
  if (_lastTs === null) { _lastTs = ts; return; }
  var dtReal = Math.min(ts - _lastTs, 50);   // ms, plafonné (onglet inactif…)
  _lastTs = ts;
  var dts = dtReal / 1000;

  if (activeTab === 'premiere-loi') {
    if (!sim1.paused) {
      sim1.M += 2 * Math.PI * (dts * SPEED12[sim1.speedIdx].v) / periodeJours(sim1.a);
    }
    drawLoi1();
    _tickReadouts(dtReal);

  } else if (activeTab === 'deuxieme-loi') {
    if (!sim2.paused) {
      var dj = dts * SPEED12[sim2.speedIdx].v;         // jours simulés
      sim2.t += dj;
      sim2.M += 2 * Math.PI * dj / periodeJours(sim2.a);
      if (sim2.sweep && sim2.t >= sim2.sweep.tEnd) _finaliserAire();
    }
    drawLoi2();
    _tickReadouts(dtReal);

  } else {
    var sys = SYSTEMES[sys3.sysIdx];
    if (!sys3.paused) {
      sys3.t += dts * sys.speeds[sys3.speedIdx].v;
    }
    drawSys3();
    // Le graphe de la 3ᵉ loi est statique : redessiné uniquement sur
    // changement de système, d'axes ou de taille de fenêtre.
  }
}

function _tickReadouts(dtReal) {
  _readoutTimer += dtReal;
  if (_readoutTimer >= READOUT_PERIOD) {
    _readoutTimer = 0;
    updateReadouts();
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Afficheurs du panneau (10 Hz + rafraîchis directement par les sliders)
// ══════════════════════════════════════════════════════════════════════

function _setText(id, txt) {
  var el = document.getElementById(id);
  if (el) el.textContent = txt;
}

function updateReadouts() {
  if (activeTab === 'premiere-loi') {
    var a = sim1.a, e = sim1.e;
    var b = demiPetitAxe(a, e), c = a * e;
    _setText('ro-b-1',    fmtFr(b, 2) + ' ua');
    _setText('ro-c-1',    fmtFr(c, 2) + ' ua');
    _setText('ro-peri-1', fmtFr(a * (1 - e), 2) + ' ua');
    _setText('ro-apo-1',  fmtFr(a * (1 + e), 2) + ' ua');
    var Tj = periodeJours(a);
    _setText('ro-T-1', Tj < 365 ? fmtFr(Tj, 0) + ' j' : fmtFr(Tj / JOURS_PAR_AN, 2) + ' an');
    var p = posKepler(a, e, sim1.M);
    _setText('ro-r-1',   fmtFr(p.r, 2) + ' ua');
    _setText('ro-rp-1',  fmtFr(2 * a - p.r, 2) + ' ua');
    _setText('ro-sum-1', fmtFr(2 * a, 2) + ' ua');

  } else if (activeTab === 'deuxieme-loi') {
    var p2 = posKepler(sim2.a, sim2.e, sim2.M);
    var v = V_TERRE_KMS * Math.sqrt(Math.max(0, 2 / p2.r - 1 / sim2.a));
    _setText('ro-r-2', fmtFr(p2.r, 2) + ' ua');
    _setText('ro-v-2', fmtFr(v, 1) + ' km/s');
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Play / Pause / RAZ (un jeu de contrôles par onglet)
// ══════════════════════════════════════════════════════════════════════

function _updatePlayBtn(n, paused) {
  var btn = document.getElementById('btn-pp-' + n);
  if (!btn) return;
  btn.textContent = paused ? '▶ Lancer' : '⏸ Pause';
  btn.className   = paused ? 'btn btn-play' : 'btn btn-pause';
}

function togglePause1() { sim1.paused = !sim1.paused; _updatePlayBtn(1, sim1.paused); }
function togglePause2() { sim2.paused = !sim2.paused; _updatePlayBtn(2, sim2.paused); }
function togglePause3() { sys3.paused = !sys3.paused; _updatePlayBtn(3, sys3.paused); }

function razLoi1() {
  sim1.M = 0;
  sim1.paused = true;
  _updatePlayBtn(1, true);
  updateReadouts();
}

function razLoi2() {
  sim2.M = 0;
  sim2.t = 0;
  sim2.paused = true;
  sim2.aires = [];
  sim2.sweep = null;
  _updatePlayBtn(2, true);
  _updateBtnBalayer();
  updateAiresList();
  updateReadouts();
}

function razLoi3() {
  sys3.t = 0;
  sys3.paused = true;
  _updatePlayBtn(3, true);
}

// ── Sliders « Vitesse d'animation » ──
function onSliderSpeed1(val) {
  sim1.speedIdx = parseInt(val, 10);
  _setText('lbl-speed-1', SPEED12[sim1.speedIdx].label);
}
function onSliderSpeed2(val) {
  sim2.speedIdx = parseInt(val, 10);
  _setText('lbl-speed-2', SPEED12[sim2.speedIdx].label);
}
function onSliderSpeed3(val) {
  sys3.speedIdx = parseInt(val, 10);
  _setText('lbl-speed-3', SYSTEMES[sys3.sysIdx].speeds[sys3.speedIdx].label);
}

// ══════════════════════════════════════════════════════════════════════
//  Onglet 1 — paramètres de l'ellipse et affichages
// ══════════════════════════════════════════════════════════════════════

function onSliderA1(val) {
  sim1.a = parseFloat(val);
  _setText('lbl-a-1', fmtFr(sim1.a, 1));
  updateReadouts();
}

function onSliderE1(val) {
  sim1.e = parseFloat(val);
  _setText('lbl-e-1', fmtFr(sim1.e, 2));
  updateReadouts();
}

function toggleAffichage1(cle, checked) {
  sim1[cle] = checked;
}

// ══════════════════════════════════════════════════════════════════════
//  Onglet 2 — loi des aires
// ══════════════════════════════════════════════════════════════════════

function onSliderE2(val) {
  sim2.e = parseFloat(val);
  _setText('lbl-e-2', fmtFr(sim2.e, 2));
  // L'ellipse a changé : les secteurs déjà balayés ne correspondent plus.
  sim2.aires = [];
  sim2.sweep = null;
  _updateBtnBalayer();
  updateAiresList();
  updateReadouts();
}

function onSliderDeltaT2(val) {
  sim2.deltaT = parseInt(val, 10);
  _setText('lbl-dt-2', sim2.deltaT);
}

function toggleVitesse2(checked) {
  sim2.showVitesse = checked;
}

// ── Bouton « Balayer l'aire pendant Δt » ──
function balayerAire() {
  if (sim2.sweep || sim2.aires.length >= MAX_AIRES) return;
  var T = periodeJours(sim2.a);
  sim2.sweep = {
    Mstart: sim2.M,
    Mend:   sim2.M + 2 * Math.PI * sim2.deltaT / T,
    tStart: sim2.t,
    tEnd:   sim2.t + sim2.deltaT,
    colorIdx: sim2.aires.length
  };
  // Le balayage se regarde en mouvement : on relance si l'animation est
  // en pause.
  if (sim2.paused) togglePause2();
  _updateBtnBalayer();
}

// Fin de balayage : bornes exactes (Mend), même si la frame a dépassé tEnd.
function _finaliserAire() {
  var sw = sim2.sweep;
  var b = demiPetitAxe(sim2.a, sim2.e);
  // Durée mémorisée au départ du balayage (le slider Δt a pu bouger depuis).
  var dtSweep = sw.tEnd - sw.tStart;
  sim2.aires.push({
    E0: solveKepler(sw.Mstart, sim2.e),
    E1: solveKepler(sw.Mend, sim2.e),
    // 2ᵉ loi : l'aire balayée pendant Δt vaut exactement π·a·b·Δt/T.
    aire: Math.PI * sim2.a * b * dtSweep / periodeJours(sim2.a),
    tStart: sw.tStart,
    tEnd: sw.tEnd,
    colorIdx: sw.colorIdx
  });
  sim2.sweep = null;
  _updateBtnBalayer();
  updateAiresList();
}

function effacerAires() {
  sim2.aires = [];
  sim2.sweep = null;
  _updateBtnBalayer();
  updateAiresList();
}

function _updateBtnBalayer() {
  var btn = document.getElementById('btn-balayer');
  if (!btn) return;
  if (sim2.sweep) {
    btn.disabled = true;
    btn.textContent = 'Balayage en cours…';
  } else if (sim2.aires.length >= MAX_AIRES) {
    btn.disabled = true;
    btn.textContent = MAX_AIRES + ' aires max — effacez pour continuer';
  } else {
    btn.disabled = false;
    btn.textContent = '◔ Balayer l’aire pendant Δt';
  }
}

// ── Liste des aires dans le panneau ──
function updateAiresList() {
  var cont = document.getElementById('aires-list');
  if (!cont) return;
  if (sim2.aires.length === 0) {
    cont.innerHTML = '<div class="aires-empty">Aucune aire balayée pour l’instant.</div>';
    return;
  }
  var html = '';
  sim2.aires.forEach(function (aire, i) {
    // Swatch : couleur du trait à ~55 % d'opacité (hex 8 chiffres), même
    // rendu que le secteur rempli sur le canvas.
    html += '<div class="aire-row">' +
      '<span class="aire-swatch" style="background:' + AIRE_COULEURS[aire.colorIdx].stroke + '8c;border-color:' + AIRE_COULEURS[aire.colorIdx].stroke + ';"></span>' +
      '<span>A' + SUB_CHARS[i] + ' = <span class="aire-val">' + fmtFr(aire.aire, 3) + ' ua²</span></span>' +
      '<span class="aire-interval">(t = ' + fmtFr(aire.tStart, 0) + ' → ' + fmtFr(aire.tEnd, 0) + ' j)</span>' +
      '</div>';
  });
  cont.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════════════
//  Onglet 3 — système étudié et affichages
// ══════════════════════════════════════════════════════════════════════

function setSysteme(idx) {
  if (sys3.sysIdx === idx) return;
  sys3.sysIdx = idx;
  sys3.t = 0;
  sys3.paused = true;
  sys3.speedIdx = SYSTEMES[idx].defaultSpeedIdx;
  _updatePlayBtn(3, true);

  for (var i = 0; i < SYSTEMES.length; i++) {
    document.getElementById('sys-btn-' + i).classList.toggle('active', i === idx);
  }
  _syncSpeedUI3();
  buildSysTable();
  drawGraph3();
}

function toggleNoms3(checked)    { sys3.showNoms = checked; }
function toggleOrbites3(checked) { sys3.showOrbites = checked; }

// Slider vitesse + labels des crans, recalés sur le système courant.
function _syncSpeedUI3() {
  var sys = SYSTEMES[sys3.sysIdx];
  document.getElementById('sl-speed-3').value = sys3.speedIdx;
  _setText('lbl-speed-3', sys.speeds[sys3.speedIdx].label);
  for (var i = 0; i < 4; i++) {
    _setText('st3-' + i, sys.speeds[i].label);
  }
}

// Tableau des données (a, T) du système courant.
function buildSysTable() {
  var sys = SYSTEMES[sys3.sysIdx];
  var html = '<table class="sys-table"><thead><tr>' +
    '<th>Astre</th>' +
    '<th class="num">a (' + sys.uniteA + ')</th>' +
    '<th class="num">T (' + sys.uniteT + ')</th>' +
    '</tr></thead><tbody>';
  sys.corps.forEach(function (cps) {
    html += '<tr>' +
      '<td><span class="sys-dot" style="background:' + cps.couleur + ';"></span>' + cps.nom + '</td>' +
      '<td class="num">' + fmtSmart(cps.a) + '</td>' +
      '<td class="num">' + fmtSmart(cps.T) + '</td>' +
      '</tr>';
  });
  html += '</tbody></table>';
  document.getElementById('sys-table-wrap').innerHTML = html;
}

// ══════════════════════════════════════════════════════════════════════
//  Redimensionnement
// ══════════════════════════════════════════════════════════════════════

function resizeAll() {
  ['canvas-loi1', 'canvas-loi2', 'canvas-sys3', 'canvas-graph3'].forEach(function (id) {
    sizeCanvas(document.getElementById(id));
  });
  // Redessiner tout de suite ce qui est visible (sans attendre la frame
  // suivante pour le graphe, qui n'est pas redessiné par la boucle).
  if (activeTab === 'premiere-loi') drawLoi1();
  else if (activeTab === 'deuxieme-loi') drawLoi2();
  else { drawSys3(); drawGraph3(); }
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

function _syncUI() {
  // Onglet 1
  document.getElementById('sl-a-1').value = sim1.a;
  _setText('lbl-a-1', fmtFr(sim1.a, 1));
  document.getElementById('sl-e-1').value = sim1.e;
  _setText('lbl-e-1', fmtFr(sim1.e, 2));
  document.getElementById('sl-speed-1').value = sim1.speedIdx;
  _setText('lbl-speed-1', SPEED12[sim1.speedIdx].label);
  document.getElementById('ck-foyers-1').checked    = sim1.showFoyers;
  document.getElementById('ck-grandaxe-1').checked  = sim1.showGrandAxe;
  document.getElementById('ck-petitaxe-1').checked  = sim1.showPetitAxe;
  document.getElementById('ck-dist-1').checked      = sim1.showDistances;

  // Onglet 2
  document.getElementById('sl-e-2').value = sim2.e;
  _setText('lbl-e-2', fmtFr(sim2.e, 2));
  document.getElementById('sl-dt-2').value = sim2.deltaT;
  _setText('lbl-dt-2', sim2.deltaT);
  document.getElementById('sl-speed-2').value = sim2.speedIdx;
  _setText('lbl-speed-2', SPEED12[sim2.speedIdx].label);
  document.getElementById('ck-vit-2').checked = sim2.showVitesse;
  _updateBtnBalayer();
  updateAiresList();

  // Onglet 3
  _syncSpeedUI3();
  buildSysTable();

  _updatePlayBtn(1, sim1.paused);
  _updatePlayBtn(2, sim2.paused);
  _updatePlayBtn(3, sys3.paused);
  updateReadouts();
}

function init() {
  // Deep-linking : #premiere-loi / #deuxieme-loi / #troisieme-loi
  var hash = window.location.hash.replace('#', '');
  if (VALID_TABS.indexOf(hash) !== -1) activeTab = hash;

  _syncUI();
  initGraph3Tooltip();
  setMainTab(activeTab);
  requestAnimationFrame(loop);
}

window.addEventListener('load', init);
