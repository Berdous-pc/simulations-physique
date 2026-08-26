// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  ui.js — Contrôles du panneau, animation « Δt → 0 », boucle de rendu
//  Chargé en DERNIER. Dépend de sim.js, courbe.js et graph.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// Nombre de crans des sliders Δt et zoom : assez fin pour approcher 0 en
// douceur, assez grossier pour rester manipulable à la souris.
var CRANS = 1000;

function _el(id) { return document.getElementById(id); }
function _setText(id, txt) { var e = _el(id); if (e) e.textContent = txt; }

// ══════════════════════════════════════════════════════════════════════
//  Correspondance slider ↔ grandeur
// ══════════════════════════════════════════════════════════════════════

// Δt : progression QUADRATIQUE. Les derniers crans avant zéro couvrent des
// valeurs de plus en plus petites — c'est là que se joue le passage à la
// limite, il faut pouvoir s'en approcher finement.
function dtDepuisSlider(v) {
  var f = v / CRANS;
  return f * f * fonCourante().dtMax;
}
function sliderDepuisDt(dt) {
  var dtMax = fonCourante().dtMax;
  return Math.round(CRANS * Math.sqrt(Math.max(0, dt) / dtMax));
}

// Zoom : progression LOGARITHMIQUE de ×1 à ×2000, sinon la moitié haute du
// slider serait inutilisable.
function zoomDepuisSlider(v) {
  return Math.pow(ZOOM_MAX, v / CRANS);
}
function sliderDepuisZoom(z) {
  return Math.round(CRANS * Math.log(z) / Math.log(ZOOM_MAX));
}

// ══════════════════════════════════════════════════════════════════════
//  Construction du panneau selon la fonction choisie
// ══════════════════════════════════════════════════════════════════════

// Boutons de choix de la fonction.
function construitSelecteurFonctions() {
  var html = '';
  FONCTIONS.forEach(function (F, i) {
    html += '<option value="' + i + '"' + (i === sim.fonIdx ? ' selected' : '') + '>' +
            F.nom + ' — ' + F.sousTitre + '</option>';
  });
  _el('fon-select').innerHTML = html;
  _setText('fon-select-formule', FONCTIONS[sim.fonIdx].sousTitre);
}

// Sliders des paramètres (a, b, c… propres à chaque fonction).
function construitParams() {
  var F = fonCourante();
  var html = '';
  F.params.forEach(function (p) {
    html += '<div class="param-row">' +
            '<label>' + p.label + (p.unite ? ' <span class="p-unite">(' + p.unite + ')</span>' : '') +
            '<span class="param-value" id="lbl-par-' + p.id + '">' +
            fmtFr(sim.params[p.id], p.dec) + '</span></label>' +
            '<input type="range" id="sl-par-' + p.id + '" min="' + p.min + '" max="' + p.max +
            '" step="' + p.step + '" value="' + sim.params[p.id] +
            '" oninput="onParam(\'' + p.id + '\', this.value)"></div>';
  });
  _el('params-box').innerHTML = html;
}

// Slider du point d'étude : ses bornes suivent le domaine de la fonction.
function construitSliderT0() {
  var F = fonCourante();
  var sl = _el('sl-t0');
  sl.min = F.tMin;
  sl.max = F.tMax;
  sl.step = (F.tMax - F.tMin) / CRANS;
  sl.value = sim.t0;
  _setText('lbl-t0-nom', 'Point d\'étude ' + F.varNom + '₀');
  _setText('lbl-dt-nom', 'Écart Δ' + F.varNom);
}

// ══════════════════════════════════════════════════════════════════════
//  Gestionnaires de contrôles
// ══════════════════════════════════════════════════════════════════════

function setFonction(i) {
  if (i === sim.fonIdx) return;
  sim.fonIdx = i;
  stopAnimDt();
  chargeParamsDefaut();
  sim.zoom = 1; sim.panT = 0; sim.panZ = 0;
  recadre();
  construitSelecteurFonctions();
  construitParams();
  construitSliderT0();
  syncDtUI();
  syncZoomUI();
  majAffichages();
}

function onParam(id, val) {
  sim.params[id] = parseFloat(val);
  var p = null;
  fonCourante().params.forEach(function (q) { if (q.id === id) p = q; });
  if (p) _setText('lbl-par-' + id, fmtFr(sim.params[id], p.dec));
  // La courbe change de forme : le cadrage de référence doit suivre.
  recadre();
  majAffichages();
}

function onT0(val) {
  sim.t0 = parseFloat(val);
  appliqueVue();          // en zoom fort, la vue suit le point d'étude
  majAffichages();
}

// Appelé depuis courbe.js pendant un glissé du point M sur la courbe :
// la vue est volontairement laissée telle quelle (cf. courbe.js).
function onPointDeplace() {
  _el('sl-t0').value = sim.t0;
  requestDraw();
  majAffichages();
}

function onDt(val) {
  stopAnimDt();
  sim.dt = dtDepuisSlider(parseFloat(val));
  requestDraw();
  majAffichages();
}

function onZoom(val) {
  setZoom(zoomDepuisSlider(parseFloat(val)));
  _setText('lbl-zoom', '×' + fmtSmart(sim.zoom));
  majAffichages();
}

function razVueUI() {
  razVue();
  syncZoomUI();
  majAffichages();
}

function razTout() {
  stopAnimDt();
  chargeParamsDefaut();
  sim.zoom = 1; sim.panT = 0; sim.panZ = 0;
  recadre();
  construitParams();
  construitSliderT0();
  syncDtUI();
  syncZoomUI();
  majAffichages();
}

// ── Cases à cocher d'affichage ────────────────────────────────────────
function toggleTangente(v) { sim.showTangente = v; requestDraw(); }
function toggleCotes(v)    { sim.showCotes = v;    requestDraw(); }
function toggleCourbeDeriv(v) { sim.showCourbeDeriv = v; requestDraw(); }

function toggleGraphDeriv() {
  sim.showDeriv = !sim.showDeriv;
  var btn = _el('btn-graph-deriv');
  btn.classList.toggle('active', sim.showDeriv);
  btn.textContent = sim.showDeriv ? 'Masquer la courbe dérivée'
                                  : 'Afficher la courbe dérivée';
  _el('left-col').classList.toggle('avec-deriv', sim.showDeriv);
  _el('row-courbe-deriv').style.display = sim.showDeriv ? '' : 'none';
  // Le canvas du bas avait une taille nulle tant qu'il était masqué.
  resizeAll();
}

function toggleHint() {
  var hint = _el('panel-hint');
  if (hint) hint.classList.toggle('collapsed');
}

// ══════════════════════════════════════════════════════════════════════
//  Animation « Δt → 0 »
//  Δt décroît jusqu'à zéro : la sécante (AB) pivote et vient se coucher
//  exactement sur la tangente en M. C'est la démonstration visuelle du
//  passage à la limite, à projeter en classe.
// ══════════════════════════════════════════════════════════════════════

var DUREE_ANIM = 2600;   // ms pour passer de Δt courant à Δt = 0
var _animV0 = 0;         // position du slider Δt au départ de l'animation
var _animT  = 0;         // temps écoulé (ms)

function lanceAnimDt() {
  if (sim.animDt) { stopAnimDt(); return; }
  // Si Δt est déjà nul, on repart du haut : le bouton relance la démo.
  if (sim.dt <= 0) {
    sim.dt = fonCourante().dtMax;
    syncDtUI();
  }
  _animV0 = sliderDepuisDt(sim.dt);
  _animT = 0;
  sim.animDt = true;
  _majBtnAnim();
}

function stopAnimDt() {
  if (!sim.animDt) return;
  sim.animDt = false;
  _majBtnAnim();
}

function _majBtnAnim() {
  var b = _el('btn-anim');
  b.textContent = sim.animDt ? '■ Arrêter' : 'Δt → 0';
  b.classList.toggle('btn-pause', sim.animDt);
  b.classList.toggle('btn-primary', !sim.animDt);
}

// Avance l'animation d'un pas de temps (appelée par la boucle de rendu).
function avanceAnimDt(dtMs) {
  _animT += dtMs;
  var f = Math.min(1, _animT / DUREE_ANIM);
  var v = _animV0 * (1 - f);
  sim.dt = dtDepuisSlider(v);
  if (f >= 1) { sim.dt = 0; stopAnimDt(); }
  syncDtUI();
  requestDraw();
}

// ══════════════════════════════════════════════════════════════════════
//  Synchronisation des afficheurs
// ══════════════════════════════════════════════════════════════════════

function syncDtUI() {
  var F = fonCourante();
  _el('sl-dt').value = sliderDepuisDt(sim.dt);
  _setText('lbl-dt', sim.dt <= 0 ? '0' : avecUnite(fmtSmart(sim.dt), F.varUnite));
}

function syncZoomUI() {
  _el('sl-zoom').value = sliderDepuisZoom(sim.zoom);
  _setText('lbl-zoom', '×' + fmtSmart(sim.zoom));
}

function majAffichages() {
  var F = fonCourante();
  var zA = fVal(tGauche()), zB = fVal(tDroite());
  var taux = tauxVariation();
  var deriv = fDeriv(sim.t0);
  var nul = (sim.dt <= 0);

  _setText('ro-t0', avecUnite(fmtSmart(sim.t0), F.varUnite));
  _setText('ro-fm', avecUnite(fmtSmart(fVal(sim.t0)), F.funUnite));
  _setText('ro-dt', nul ? '0' : avecUnite(fmtSmart(sim.dt), F.varUnite));
  _setText('ro-df', nul ? '0' : avecUnite(fmtSmart(zB - zA), F.funUnite));

  _setText('lbl-taux', labelTaux());
  _setText('lbl-nderiv', labelDeriv() + ' (' + F.varNom + '₀)');
  _setText('ro-taux', nul ? '—' : avecUnite(fmtSmart(taux), F.derivUnite));
  _setText('ro-nderiv', avecUnite(fmtSmart(deriv), F.derivUnite));

  // Écart entre l'approximation (sécante) et la valeur exacte (tangente) :
  // c'est ce que l'élève voit tendre vers zéro en réduisant Δt.
  var ecart = _el('ro-ecart');
  if (nul) {
    ecart.textContent = 'Δ' + F.varNom + ' = 0 : la sécante EST la tangente.';
    ecart.className = 'ecart-txt exact';
  } else if (!isFinite(taux) || !isFinite(deriv)) {
    ecart.textContent = '—';
    ecart.className = 'ecart-txt';
  } else {
    var e = Math.abs(taux - deriv);
    var rel = Math.abs(deriv) > 1e-9 ? (e / Math.abs(deriv)) * 100 : null;
    ecart.textContent = 'Écart : ' + fmtSmart(e) +
                        (rel !== null ? ' (' + fmtFr(rel, rel < 10 ? 2 : 1) + ' %)' : '');
    ecart.className = 'ecart-txt' + (rel !== null && rel < 1 ? ' proche' : '');
  }

  _setText('lbl-t0', avecUnite(fmtSmart(sim.t0), F.varUnite));
  _setText('lbl-deriv-nom', 'Courbe ' + labelDeriv() + ' exacte');
  _setText('sens-deriv', F.derivSens ? '(' + F.derivSens + ')' : '');
}

// ══════════════════════════════════════════════════════════════════════
//  Séparateur draggable entre les deux graphes
// ══════════════════════════════════════════════════════════════════════

var _split = { on: false, y0: 0, frac0: 0.6 };
var _fracCourbe = 0.6;   // part de hauteur prise par le graphe principal

function initSplitter() {
  var sp = _el('splitter');
  if (!sp) return;
  sp.addEventListener('pointerdown', function (e) {
    _split.on = true;
    _split.y0 = e.clientY;
    _split.frac0 = _fracCourbe;
    sp.setPointerCapture(e.pointerId);
    sp.classList.add('actif');
  });
  sp.addEventListener('pointermove', function (e) {
    if (!_split.on) return;
    var h = _el('row-graphes').clientHeight;
    if (!h) return;
    _fracCourbe = Math.max(0.25, Math.min(0.8, _split.frac0 + (e.clientY - _split.y0) / h));
    _el('row-graphes').style.setProperty('--frac-courbe', _fracCourbe);
    resizeAll();
  });
  function fin(e) {
    if (!_split.on) return;
    _split.on = false;
    sp.classList.remove('actif');
    if (e && sp.hasPointerCapture(e.pointerId)) sp.releasePointerCapture(e.pointerId);
  }
  sp.addEventListener('pointerup', fin);
  sp.addEventListener('pointercancel', fin);
}

// ══════════════════════════════════════════════════════════════════════
//  Redimensionnement et boucle de rendu
// ══════════════════════════════════════════════════════════════════════

function resizeAll() {
  sizeCanvas(_el('canvas-courbe'));
  if (sim.showDeriv) sizeCanvas(_el('canvas-deriv'));
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

  if (sim.animDt) { avanceAnimDt(dtMs); majAffichages(); }

  // Rien ne bouge tant que l'utilisateur n'agit pas : inutile de
  // redessiner 60 fois par seconde une image identique.
  if (!needsDraw) return;
  needsDraw = false;
  drawCourbe();
  if (sim.showDeriv) drawDeriv();
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation
// ══════════════════════════════════════════════════════════════════════

function init() {
  chargeParamsDefaut();

  construitSelecteurFonctions();
  construitParams();
  construitSliderT0();
  recadre();
  syncDtUI();
  syncZoomUI();
  majAffichages();

  _el('ck-tangente').checked = sim.showTangente;
  _el('ck-cotes').checked = sim.showCotes;
  _el('ck-courbe-deriv').checked = sim.showCourbeDeriv;

  initCourbeSouris();
  initSplitter();
  resizeAll();
  requestAnimationFrame(loop);
}

window.addEventListener('load', init);
