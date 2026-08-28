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

// Δt : progression QUADRATIQUE, resserrée près de zéro — c'est là que se joue
// le passage à la limite. En dessous de DT_MIN le zoom ne distingue plus rien :
// le cran 0 vaut exactement 0, le cran 1 vaut DT_MIN, sans paliers inutiles
// entre les deux.
var DT_MIN = 0.01;
function dtDepuisSlider(v) {
  if (v <= 0) return 0;
  var f = (v - 1) / (CRANS - 1);
  return DT_MIN + f * f * (fonCourante().dtMax - DT_MIN);
}
function sliderDepuisDt(dt) {
  if (dt <= 0) return 0;
  var dtMax = fonCourante().dtMax;
  var f = Math.sqrt(Math.max(0, dt - DT_MIN) / (dtMax - DT_MIN));
  return 1 + Math.round((CRANS - 1) * f);
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
// Chaque paramètre est réglable de deux façons : au slider pour explorer,
// au clavier pour poser une valeur précise. L'unité ferme la ligne.
function construitParams() {
  var F = fonCourante();
  var html = '';
  F.params.forEach(function (p) {
    html += '<div class="param-row param-inline">' +
            '<label for="num-par-' + p.id + '" class="p-nom">' + p.label + '</label>' +
            '<input type="range" id="sl-par-' + p.id + '" min="' + p.min + '" max="' + p.max +
            '" step="' + p.step + '" value="' + sim.params[p.id] +
            '" oninput="onParam(\'' + p.id + '\', this.value)">' +
            '<span class="param-field">' +
            '<input type="text" inputmode="decimal" class="param-num" id="num-par-' + p.id +
            '" value="' + fmtFr(sim.params[p.id], p.dec) + '"' +
            ' title="Entre ' + fmtFr(p.min, p.dec) + ' et ' + fmtFr(p.max, p.dec) + '"' +
            ' onchange="onParamSaisi(\'' + p.id + '\', this.value)"' +
            ' onblur="onParamSaisi(\'' + p.id + '\', this.value)"' +
            ' onkeydown="if (event.key === \'Enter\') this.blur();">' +
            (p.unite ? '<span class="p-unite">' + p.unite + '</span>' : '') +
            '</span></div>';
  });
  html += '<button class="btn btn-raz" onclick="razParams()">↺ Valeurs par défaut</button>';
  _el('params-box').innerHTML = html;
}

// Remet les seuls paramètres de la fonction à leurs valeurs d'origine :
// le point d'étude, l'écart Δ et la vue ne bougent pas.
function razParams() {
  var F = fonCourante();
  F.params.forEach(function (p) { sim.params[p.id] = p.val; });
  construitParams();
  recadre();
  majAffichages();
}

// Retrouve la description d'un paramètre de la fonction courante.
function _defParam(id) {
  var res = null;
  fonCourante().params.forEach(function (q) { if (q.id === id) res = q; });
  return res;
}

// Le point d'étude se déplace uniquement sur la courbe, sans borne : seul
// le nom de l'écart dépend encore de la fonction choisie.
function construitSliderT0() {
  _setText('lbl-dt-nom', 'Écart Δ' + fonCourante().varNom);
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
  setEncadrement(sim.encadrement);
  sim.chronoIdx = chronoIdxProche(sim.t0);
  majBtnChrono();
  majT0Chrono();
  majAffichages();
}

function onParam(id, val) {
  var p = _defParam(id);
  sim.params[id] = parseFloat(val);
  var champ = _el('num-par-' + id);
  if (champ && p) champ.value = fmtFr(sim.params[id], p.dec);
  // La courbe change de forme : le cadrage de référence doit suivre.
  recadre();
  majAffichages();
}

// Valeur tapée au clavier : virgule ou point acceptés, valeur ramenée dans
// les bornes du slider. Une saisie inutilisable laisse la valeur en place.
function onParamSaisi(id, txt) {
  var p = _defParam(id);
  if (!p) return;
  var v = parseFloat(String(txt).replace(',', '.').replace(/\s/g, ''));
  if (isFinite(v)) {
    v = Math.max(p.min, Math.min(p.max, v));
    sim.params[id] = v;
    _el('sl-par-' + id).value = v;
    recadre();
    majAffichages();
  }
  _el('num-par-' + id).value = fmtFr(sim.params[id], p.dec);
}

// Appelé depuis courbe.js pendant un glissé du point M sur la courbe :
// la vue est volontairement laissée telle quelle (cf. courbe.js).
function onPointDeplace() {
  requestDraw();
  majAffichages();
}

function onDt(val) {
  stopAnimDt();
  sim.dt = dtDepuisSlider(parseFloat(val));
  // Le pas des relevés suit Δt : la chronophotographie se resserre avec lui.
  majT0Chrono();
  // On rafraîchit le label sans réécrire la position du slider : le
  // réécrire pendant le glissé le ferait sauter d'un cran à l'autre.
  _setText('lbl-dt', sim.dt <= 0 ? '0'
                                 : avecUnite(fmtSmart(sim.dt), fonCourante().varUnite));
  requestDraw();
  majAffichages();
}

// ── Définition du taux : 'sym' | 'avant' ──────────────────────────────
// Seules les abscisses de A et B changent (cf. tGauche/tDroite) : Δt, le
// point M et la vue sont conservés, on voit la sécante basculer d'une
// définition à l'autre. Les deux tendent vers le même nombre dérivé.
function setEncadrement(mode) {
  if (mode !== 'avant') mode = 'sym';
  sim.encadrement = mode;
  // Le pas des relevés vaut Δt/2 en symétrique, Δt sinon : il change ici.
  majT0Chrono();

  var bS = _el('btn-enc-sym'), bA = _el('btn-enc-avant');
  if (bS) bS.classList.toggle('active', mode === 'sym');
  if (bA) bA.classList.toggle('active', mode === 'avant');

  var F = fonCourante();
  _setText('hint-enc', mode === 'sym'
    ? 'A et B de part et d’autre de M.'
    : 'Taux calculé de M au point N : [' + F.varNom + '₀ ; ' +
      F.varNom + '₀ + Δ' + F.varNom + '].');

  requestDraw();
  majAffichages();
}

// Retour à la vue initiale — déclenché par un double-clic sur le graphe.
function razVueUI() {
  razVue();
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
  setEncadrement(sim.encadrement);
  sim.chronoIdx = chronoIdxProche(sim.t0);
  majBtnChrono();
  majT0Chrono();
  majAffichages();
}

// ── Cases à cocher d'affichage ────────────────────────────────────────
function toggleTangente(v) { sim.showTangente = v; requestDraw(); }
function toggleCotes(v)    { sim.showCotes = v;    requestDraw(); }

function toggleGraphDeriv() {
  sim.showDeriv = !sim.showDeriv;
  var btn = _el('btn-graph-deriv');
  btn.classList.toggle('active', sim.showDeriv);
  btn.textContent = sim.showDeriv ? 'Masquer la courbe dérivée'
                                  : 'Afficher la courbe dérivée';
  _el('left-col').classList.toggle('avec-deriv', sim.showDeriv);
  // Le canvas du bas avait une taille nulle tant qu'il était masqué.
  resizeAll();
}

// ── Chronophotographie ────────────────────────────────────────────────
// Le point d'étude cesse d'être libre : il se choisit parmi les positions
// relevées à intervalle de temps constant. En entrant dans ce mode, on
// sélectionne le relevé le plus proche du point courant, pour ne pas
// déplacer brutalement l'étude en cours.
function toggleChrono() {
  if (!chronoDispo()) return;
  sim.chrono = !sim.chrono;
  if (sim.chrono) sim.chronoIdx = chronoIdxProche(sim.t0);
  majT0Chrono();
  majBtnChrono();
  requestDraw();
  majAffichages();
}

// Le bouton n'apparaît que pour la trajectoire z(t) : ailleurs, il n'y a
// pas de mobile dont on filmerait les positions successives.
function majBtnChrono() {
  var btn = _el('btn-chrono');
  if (!btn) return;
  var dispo = chronoDispo();
  btn.style.display = dispo ? '' : 'none';
  var on = dispo && sim.chrono;
  btn.classList.toggle('active', on);
  btn.textContent = on ? 'Masquer la chronophotographie' : 'Chronophotographie';
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
  majT0Chrono();
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

function majAffichages() {
  var F = fonCourante();
  var zA = fVal(tGauche()), zB = fVal(tDroite());
  var taux = tauxVariation();
  var deriv = fDeriv(sim.t0);
  var nul = (sim.dt <= 0);

  // En chronophotographie, le point d'étude porte son nom de relevé (M₃…).
  var nomM = nomPointM(sim.chronoIdx);
  _setText('lbl-ro-t0', 'Abscisse de ' + nomM);
  _setText('lbl-ro-fm', 'Valeur en ' + nomM);

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
    // Le taux vient d'une soustraction de deux valeurs proches divisée par Δt :
    // il traîne une erreur d'arrondi de l'ordre de eps·|f|/Δt. En dessous de ce
    // bruit, l'écart est nul en mathématiques (ex. taux symétrique sur une
    // parabole) et on l'affiche comme tel plutôt qu'en 10⁻¹⁶.
    var bruit = 1e-11 * ((Math.abs(zA) + Math.abs(zB)) / sim.dt + Math.abs(deriv) + 1);
    if (e <= bruit) {
      ecart.textContent = 'Écart : 0';
      ecart.className = 'ecart-txt exact';
    } else {
      var rel = Math.abs(deriv) > 1e-9 ? (e / Math.abs(deriv)) * 100 : null;
      ecart.textContent = 'Écart : ' + fmtSmart(e) +
                          (rel !== null ? ' (' + fmtFr(rel, rel < 10 ? 2 : 1) + ' %)' : '');
      ecart.className = 'ecart-txt' + (rel !== null && rel < 1 ? ' proche' : '');
    }
  }

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
  setEncadrement(sim.encadrement);
  majBtnChrono();
  majAffichages();

  _el('ck-tangente').checked = sim.showTangente;
  _el('ck-cotes').checked = sim.showCotes;

  initCourbeSouris();
  initSplitter();
  resizeAll();
  requestAnimationFrame(loop);
}

window.addEventListener('load', init);
