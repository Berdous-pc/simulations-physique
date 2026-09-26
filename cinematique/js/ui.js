// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  ui.js — Panneau (piste, voitures, graphe), animation, boucle de rendu
//  Chargé en DERNIER. Dépend de sim.js, graph.js et piste.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

function _el(id) { return document.getElementById(id); }
function _setText(id, txt) { var e = _el(id); if (e) e.textContent = txt; }

// ══════════════════════════════════════════════════════════════════════
//  Cartes des voitures
// ══════════════════════════════════════════════════════════════════════

// Les trois conditions initiales, dans l'ordre d'affichage.
var CHAMPS = [
  { id: 'x0', label: 'x<sub>0</sub>',  unite: 'm' },
  { id: 'v0', label: 'v<sub>x0</sub>', unite: 'm/s' },
  { id: 'a',  label: 'a<sub>x</sub>',  unite: 'm/s²' }
];

// Bornes d'une saisie : x₀ va de la ligne de départ à la ligne d'arrivée.
function bornes(champ) {
  if (champ === 'x0') return { min: 0, max: sim.L };
  return BORNES[champ];
}

// Reconstruit toutes les cartes : appelé quand le nombre de voitures
// change (ajout, retrait, réinitialisation).
function construitVoitures() {
  var n = sim.voitures.length;
  var html = '';
  sim.voitures.forEach(function (v, i) {
    html += '<div class="car-card" style="--car-coul:' + COUL_VOITURES[i].coul + '">' +
            '<div class="car-head"><span class="car-nom">Voiture ' + (i + 1) + '</span>' +
            (n > 1 ? '<button class="car-suppr" onclick="supprimeVoiture(' + i + ')"' +
                     ' title="Retirer cette voiture">✕</button>' : '') +
            '</div><div class="car-grid">';
    CHAMPS.forEach(function (c) {
      var b = bornes(c.id);
      var id = 'num-' + c.id + '-' + i;
      html += '<div class="car-champ"><label class="car-lbl" for="' + id + '">' + c.label +
              ' <span class="car-unite">(' + c.unite + ')</span></label>' +
              '<input type="text" inputmode="decimal" class="param-num" id="' + id + '"' +
              ' value="' + fmtNombre(v[c.id]) + '"' +
              ' title="Entre ' + fmtNombre(b.min) + ' et ' + fmtNombre(b.max) + ' ' + c.unite + '"' +
              ' onchange="onSaisie(' + i + ', \'' + c.id + '\', this.value)"' +
              ' onblur="onSaisie(' + i + ', \'' + c.id + '\', this.value)"' +
              ' onkeydown="if (event.key === \'Enter\') this.blur();">' +
              '</div>';
    });
    html += '</div><div class="car-eq" id="eq-' + i + '"></div></div>';
  });
  _el('voitures-box').innerHTML = html;
  _el('btn-ajouter').style.display = n < NB_VOITURES_MAX ? '' : 'none';
  majEquations();
}

// Réécrit les champs d'après l'état (après un bornage) et les équations.
function majChamps() {
  sim.voitures.forEach(function (v, i) {
    CHAMPS.forEach(function (c) {
      var e = _el('num-' + c.id + '-' + i);
      if (e && document.activeElement !== e) e.value = fmtNombre(v[c.id]);
      if (e) {
        var b = bornes(c.id);
        e.title = 'Entre ' + fmtNombre(b.min) + ' et ' + fmtNombre(b.max) + ' ' + c.unite;
      }
    });
  });
  majEquations();
}

function majEquations() {
  sim.voitures.forEach(function (v, i) {
    var e = _el('eq-' + i);
    if (!e) return;
    e.textContent = equationHoraire(v);
    e.title = e.textContent;
  });
}

// Valeur tapée : virgule ou point acceptés, ramenée dans ses bornes. Une
// saisie inutilisable laisse la valeur en place.
function onSaisie(i, champ, txt) {
  var v = sim.voitures[i];
  if (!v) return;
  var x = parseSaisie(txt);
  var e = _el('num-' + champ + '-' + i);
  if (isFinite(x)) {
    var b = bornes(champ);
    x = arrondi(Math.max(b.min, Math.min(b.max, x)));
    if (x !== v[champ]) {
      v[champ] = x;
      apresModif();
    }
  }
  if (e) e.value = fmtNombre(v[champ]);
  majEquations();
}

function ajouteVoiture() {
  var n = sim.voitures.length;
  if (n >= NB_VOITURES_MAX) return;
  var v = clone(VOITURES_DEFAUT[n]);
  v.x0 = Math.min(v.x0, sim.L);
  sim.voitures.push(v);
  construitVoitures();
  apresModif();
}

function supprimeVoiture(i) {
  if (sim.voitures.length <= 1) return;
  sim.voitures.splice(i, 1);
  construitVoitures();
  apresModif();
}

// ══════════════════════════════════════════════════════════════════════
//  Longueur de piste
// ══════════════════════════════════════════════════════════════════════

function setLongueur(L) {
  L = Math.round(Math.max(BORNES.L.min, Math.min(BORNES.L.max, L)));
  if (L === sim.L) return false;
  sim.L = L;
  // x₀ est borné par la ligne d'arrivée : une piste raccourcie ramène
  // les voitures trop avancées sur la ligne.
  sim.voitures.forEach(function (v) { v.x0 = Math.min(v.x0, L); });
  majChamps();
  apresModif();
  return true;
}

function onLongueur(val) {
  setLongueur(parseFloat(val));
  _el('num-longueur').value = sim.L;
}

function onLongueurSaisie(txt) {
  var L = parseSaisie(txt);
  if (isFinite(L)) setLongueur(L);
  _el('num-longueur').value = sim.L;
  _el('sl-longueur').value = sim.L;
}

// Toute modification des conditions initiales ou de la piste remet la
// course à l'instant zéro : la course affichée doit toujours être celle
// des valeurs écrites dans le panneau.
function apresModif() {
  sim.t = 0;
  sim.play = false;
  sim.fini = false;
  sim.tangentesFig = [];
  majBtnPlay();
  requestDraw();
}

// ══════════════════════════════════════════════════════════════════════
//  Graphe affiché et outils
// ══════════════════════════════════════════════════════════════════════

// Chaque graphe s'affiche ou se masque indépendamment ; aucun n'est
// obligatoire (masquer x(t) évite de dévoiler l'allure des courbes).
function toggleGraphe(m) {
  sim.graphes[m] = !sim.graphes[m];
  // Une tangente disparaît avec le graphe sur lequel on l'a posée.
  if (!sim.graphes[m]) {
    sim.tangentesFig = sim.tangentesFig.filter(function (f) { return f.mode !== m; });
  }
  majBtnGraphes();
}

function majBtnGraphes() {
  ORDRE_GRAPHES.forEach(function (k) {
    _el('btn-mode-' + k).classList.toggle('active', sim.graphes[k]);
  });
  requestDraw();
}

// Tangente et réticule s'excluent (charte : radioactivité).
function toggleTangente() {
  sim.tangente = !sim.tangente;
  if (sim.tangente) sim.reticule = false;
  majBtnOutils();
}

function toggleReticule() {
  sim.reticule = !sim.reticule;
  if (sim.reticule) sim.tangente = false;
  majBtnOutils();
}

function majBtnOutils() {
  _el('btn-tangente').classList.toggle('active', sim.tangente);
  _el('btn-reticule').classList.toggle('active', sim.reticule);
  if (!sim.reticule) _el('reticule-tooltip').style.display = 'none';
  requestDraw();
}

// ══════════════════════════════════════════════════════════════════════
//  Course : Lancer / Pause, RAZ, vitesse, rembobinage
// ══════════════════════════════════════════════════════════════════════

// Crans du curseur de vitesse (×1 par défaut, value="2" dans la page).
// ×5 s'ajoute à ceux du décollage : une course lente dure bien plus
// longtemps qu'un vol de fusée.
var VITESSES = [0.10, 0.50, 1.00, 2.00, 5.00];

function majBtnPlay() {
  var b = _el('btn-play');
  if (!b) return;
  // Arrivée au bout, le bouton propose de rejouer plutôt que de reprendre
  // une course qui n'a plus nulle part où aller.
  b.textContent = sim.play ? '❚❚ Pause' : (sim.fini ? '↻ Rejouer' : '▶ Lancer');
  b.classList.toggle('btn-pause', sim.play);
  b.classList.toggle('btn-play', !sim.play);
}

function togglePlay() {
  if (!sim.play && sim.t >= dureeCourse()) {
    sim.t = 0;
    sim.fini = false;
    sim.tangentesFig = [];
  }
  sim.play = !sim.play;
  majBtnPlay();
  requestDraw();
}

function razCourse() {
  sim.t = 0;
  sim.play = false;
  sim.fini = false;
  sim.tangentesFig = [];
  majBtnPlay();
  requestDraw();
}

function onSpeed(v) {
  sim.speed = VITESSES[parseInt(v, 10)] || 1;
  _setText('lbl-speed', '×' + fmtFr(sim.speed, 2));
}

// Avance (ou recule, dtMs < 0) la course.
function avanceCourse(dtMs) {
  var D = dureeCourse();
  sim.t += dtMs / 1000 * sim.speed;
  if (sim.t >= D) {
    sim.t = D;
    if (sim.play || !sim.fini) {
      sim.play = false;
      sim.fini = true;
      majBtnPlay();
    }
  } else {
    if (sim.t < 0) sim.t = 0;
    if (sim.fini) { sim.fini = false; majBtnPlay(); }
  }
  requestDraw();
}

// Rembobinage : bouton à MAINTENIR appuyé. Le pointeur est capturé, si
// bien que relâcher hors du bouton arrête bien le retour en arrière.
var _rewind = false;

function initRewind() {
  var btn = _el('btn-rewind');
  if (!btn) return;
  btn.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (btn.setPointerCapture) btn.setPointerCapture(e.pointerId);
    _rewind = true;
    sim.play = false;
    btn.classList.add('active');
    _setText('lbl-speed', '⏪');
    majBtnPlay();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) {
    btn.addEventListener(ev, function () {
      if (!_rewind) return;
      _rewind = false;
      btn.classList.remove('active');
      onSpeed(_el('sl-speed').value);
      requestDraw();
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
//  Réinitialisation complète
// ══════════════════════════════════════════════════════════════════════

function razTout() {
  chargeDefaut();
  _el('sl-longueur').value = sim.L;
  _el('num-longueur').value = sim.L;
  construitVoitures();
  sim.graphes = { x: true, v: false, a: false };
  majBtnGraphes();
  sim.tangente = false;
  sim.reticule = false;
  majBtnOutils();
  _el('sl-speed').value = 2;
  onSpeed(2);
  apresModif();
}

function toggleHint() {
  var hint = _el('panel-hint');
  if (hint) hint.classList.toggle('collapsed');
}

// ══════════════════════════════════════════════════════════════════════
//  Redimensionnement et boucle de rendu
// ══════════════════════════════════════════════════════════════════════

function resizeAll() {
  sizeCanvas(_el('canvas-graph'));
  sizeCanvas(_el('canvas-piste'));
  requestDraw();
}

var _resizePending = false;
window.addEventListener('resize', function () {
  if (_resizePending) return;
  _resizePending = true;
  requestAnimationFrame(function () { _resizePending = false; resizeAll(); });
});

var _lastTs = null;

function loop(ts) {
  requestAnimationFrame(loop);
  if (_lastTs === null) { _lastTs = ts; return; }
  var dtMs = Math.min(ts - _lastTs, 60);
  _lastTs = ts;

  if (sim.play || _rewind) avanceCourse(_rewind ? -dtMs : dtMs);

  // Rien ne bouge tant que l'utilisateur n'agit pas : inutile de
  // redessiner 60 fois par seconde une image identique.
  if (!needsDraw) return;
  needsDraw = false;
  drawGraph();
  // Après drawGraph : la piste lit `geoPiste`, qui vient d'être remis à
  // jour, pour aligner les voitures sur leur point de courbe.
  drawPiste();
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation
// ══════════════════════════════════════════════════════════════════════

function init() {
  chargeDefaut();
  construitVoitures();
  majBtnGraphes();
  majBtnOutils();
  majBtnPlay();
  onSpeed(_el('sl-speed').value);
  initGraphSouris();
  initRewind();
  resizeAll();
  requestAnimationFrame(loop);
}

window.addEventListener('load', init);
