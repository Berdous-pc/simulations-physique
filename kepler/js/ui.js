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
    // Zoom animé vers la cible (presets, double-clic) : interpolation
    // exponentielle — un pas constant en échelle LOG, seule interpolation
    // fluide quand la cible est à un facteur ~20.
    if (sys.zoomMax && sys3.zoom !== sys3.zoomCible) {
      var fz = Math.min(1, dts * 3.5);
      sys3.zoom *= Math.pow(sys3.zoomCible / sys3.zoom, fz);
      if (Math.abs(Math.log(sys3.zoomCible / sys3.zoom)) < 0.005) {
        sys3.zoom = sys3.zoomCible;
      }
      _syncZoomUI3();
      drawGraph3();          // le graphe suit le zoom du canvas
    }
    drawSys3();
    // Le graphe de la 3ᵉ loi est statique : redessiné uniquement sur
    // changement de système, d'axes, de zoom ou de taille de fenêtre.
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
    _setText('ro-acc-2', fmtFr(A_TERRE_MMS2 / (p2.r * p2.r), 2) + ' mm/s²');
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
  sim2.sweepAutoPause = false;
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

// Vecteurs superposés à la trajectoire : vitesse, position r, accélération.
function toggleAffichage2(cle, checked) {
  sim2[cle] = checked;
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
  // Le balayage se regarde en mouvement : on relance si l'animation est en
  // pause, et on mémorise ce départ pour la remettre en pause une fois le
  // balayage terminé (sinon l'animation continue indéfiniment).
  sim2.sweepAutoPause = sim2.paused;
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
  // Si l'animation avait été relancée automatiquement pour ce balayage
  // (elle était en pause au clic sur « Balayer »), la remettre en pause.
  if (sim2.sweepAutoPause) {
    sim2.sweepAutoPause = false;
    sim2.paused = true;
    _updatePlayBtn(2, true);
  }
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
  var sys = SYSTEMES[idx];
  // Vue de départ : le premier preset de zoom s'il y en a (ex. « Orbites
  // basses » pour les satellites terrestres), sinon la vue complète
  // (systèmes sans zoom, ou Système Solaire dont le 1ᵉʳ preset EST déjà la
  // vue complète).
  var vueInit = (sys.zoomMax && sys.presets && sys.presets[0]) ? sys.presets[0] : null;
  sys3.speedIdx = vueInit ? vueInit.speedIdx : sys.defaultSpeedIdx;
  sys3.zoom = vueInit ? vueInit.zoom : 1;
  sys3.zoomCible = sys3.zoom;
  sys3.graphZoomLinked = true;
  document.getElementById('ck-zoom-lie-3').checked = true;
  sys3.modelLin = false;
  document.getElementById('btn-model-lin-3').classList.remove('active');
  sys3.showGeoLigne = false;
  document.getElementById('ck-geo-3').checked = false;
  _updatePlayBtn(3, true);

  document.getElementById('sys-select').value = idx;
  _syncSpeedUI3();
  _syncZoomVisibilite3();
  _syncGeoLigneVisibilite3();
  buildSysTable();
  resetGraph3Zoom();      // nouveau système = nouvelle étendue de données
  drawGraph3();
}

// ── Zoom du canvas (Système Solaire uniquement) ───────────────────────

// Section Zoom du panneau : visible uniquement pour les systèmes zoomables.
function _syncZoomVisibilite3() {
  var zoomable = !!SYSTEMES[sys3.sysIdx].zoomMax;
  document.getElementById('zoom-section-3').style.display = zoomable ? '' : 'none';
  if (zoomable) {
    _buildZoomPresetsUI3();
    _syncZoomUI3();
  }
}

// Boutons de presets de zoom : reconstruits à chaque système (le NOMBRE de
// presets et leurs libellés varient — 2 pour le Système Solaire, 3 pour les
// satellites terrestres), même principe que _syncSpeedUI3 pour les crans.
function _buildZoomPresetsUI3() {
  var sys = SYSTEMES[sys3.sysIdx];
  var html = '';
  sys.presets.forEach(function (pr, i) {
    html += '<button class="sys-btn" id="zoom-preset-' + i + '" onclick="setZoomPreset3(' + i + ')">' +
            pr.label + '</button>';
  });
  document.getElementById('zoom-presets-3').innerHTML = html;
}

// Pose le zoom immédiatement (slider, molette) : pas d'animation, la main
// de l'utilisateur EST l'animation.
function setZoom3(z) {
  var zMax = SYSTEMES[sys3.sysIdx].zoomMax;
  if (!zMax) return;
  z = Math.min(zMax, Math.max(1, z));
  sys3.zoom = z;
  sys3.zoomCible = z;
  _syncZoomUI3();
  drawSys3();
  drawGraph3();
}

// Slider log : valeur ∈ [0, 1] → zoom ∈ [1, zoomMax] (chaque déplacement
// égal du curseur multiplie l'échelle par un facteur constant).
function onSliderZoom3(val) {
  setZoom3(Math.pow(SYSTEMES[sys3.sysIdx].zoomMax, parseFloat(val)));
}

function setZoomPreset3(i) {
  var sys = SYSTEMES[sys3.sysIdx];
  var pr = sys.presets[i];
  sys3.zoomCible = pr.zoom;              // le zoom animé fait le trajet
  if (pr.speedIdx !== undefined) {
    sys3.speedIdx = pr.speedIdx;         // cran de vitesse adapté à l'échelle
    _syncSpeedUI3();
  }
  _syncZoomUI3();
}

// Slider + label + état actif des presets, recalés sur le zoom courant.
function _syncZoomUI3() {
  var sys = SYSTEMES[sys3.sysIdx];
  if (!sys.zoomMax) return;
  document.getElementById('sl-zoom-3').value =
    Math.log(sys3.zoom) / Math.log(sys.zoomMax);
  _setText('lbl-zoom-3', '× ' + fmtFr(sys3.zoom, sys3.zoom < 10 ? 1 : 0));
  sys.presets.forEach(function (pr, i) {
    // Un preset est « actif » si le zoom cible lui correspond (à 2 % près).
    var actif = Math.abs(Math.log(sys3.zoomCible / pr.zoom)) < 0.02;
    document.getElementById('zoom-preset-' + i).classList.toggle('active', actif);
  });
}

// Molette et double-clic sur le canvas d'animation, comme sur le graphe.
function initSys3Wheel() {
  var canvas = document.getElementById('canvas-sys3');
  canvas.addEventListener('wheel', function (ev) {
    if (!SYSTEMES[sys3.sysIdx].zoomMax) return;
    ev.preventDefault();
    setZoom3(sys3.zoom * Math.exp(-ev.deltaY * 0.0015));
  }, { passive: false });
  canvas.addEventListener('dblclick', function () {
    if (!SYSTEMES[sys3.sysIdx].zoomMax) return;
    sys3.zoomCible = 1;                  // dézoom animé vers la vue complète
    _syncZoomUI3();
  });
}

function toggleNoms3(checked)     { sys3.showNoms = checked; }
function toggleOrbites3(checked)  { sys3.showOrbites = checked; }
function toggleGeoLigne3(checked) { sys3.showGeoLigne = checked; }

// Checkbox « Position du satellite géostationnaire » : visible uniquement
// pour les systèmes définissant `geoNom` (satellites terrestres).
function _syncGeoLigneVisibilite3() {
  var row = document.getElementById('geo-ligne-row-3');
  if (row) row.style.display = SYSTEMES[sys3.sysIdx].geoNom ? '' : 'none';
}

function toggleModelLin3() {
  sys3.modelLin = !sys3.modelLin;
  document.getElementById('btn-model-lin-3').classList.toggle('active', sys3.modelLin);
  drawGraph3();
}

function toggleZoomLie3(checked) {
  sys3.graphZoomLinked = checked;
  if (checked) {
    _graph3Zoom = sys3.zoom;   // le graphe rattrape le zoom courant de l'animation
    drawGraph3();
  }
}

function toggleGraph3() {
  sys3.showGraph = !sys3.showGraph;
  document.getElementById('btn-graph-3').classList.toggle('active', sys3.showGraph);
  document.getElementById('view-troisieme-loi').classList.toggle('no-graph', !sys3.showGraph);
  resizeAll();
}

// Slider vitesse + labels des crans, recalés sur le système courant.
// Le NOMBRE de crans varie selon le système (6 pour le Système Solaire,
// 4 ailleurs) : l'étendue du slider et ses graduations sont reconstruites.
function _syncSpeedUI3() {
  var sys = SYSTEMES[sys3.sysIdx];
  var sl = document.getElementById('sl-speed-3');
  sl.max = sys.speeds.length - 1;
  sl.value = sys3.speedIdx;
  _setText('lbl-speed-3', sys.speeds[sys3.speedIdx].label);
  var html = '';
  sys.speeds.forEach(function (sp, i) {
    html += '<span style="--tick-frac:' + (i / (sys.speeds.length - 1)) +
            ';">' + sp.label + '</span>';
  });
  document.getElementById('speed-ticks-3').innerHTML = html;
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
  document.getElementById('ck-ray-2').checked = sim2.showRayon;
  document.getElementById('ck-acc-2').checked = sim2.showAccel;
  _updateBtnBalayer();
  updateAiresList();

  // Onglet 3
  _syncSpeedUI3();
  _syncZoomVisibilite3();
  _syncGeoLigneVisibilite3();
  document.getElementById('ck-geo-3').checked = sys3.showGeoLigne;
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
  initGraph3Wheel();
  initSys3Wheel();
  setMainTab(activeTab);
  requestAnimationFrame(loop);
}

window.addEventListener('load', init);
