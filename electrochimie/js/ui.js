// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  ui.js — Onglets, panneau, équations, boucle d'animation
//  Chargé en DERNIER. Dépend de sim.js, becher.js et loupe.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

var ONGLETS = ['oxydoreduction', 'pile-electrolyse'];

var canvas = document.getElementById('sim-canvas');
var ctx = canvas.getContext('2d');
var _cw = 0, _ch = 0;            // taille du canvas en px CSS

// ══════════════════════════════════════════════════════════════════════
//  Onglets principaux (deep-linking #oxydoreduction / #pile-electrolyse)
// ══════════════════════════════════════════════════════════════════════

function setMainTab(tab) {
  if (ONGLETS.indexOf(tab) === -1) tab = 'oxydoreduction';
  sim.onglet = tab;
  ONGLETS.forEach(function (t) {
    var sec  = document.getElementById('section-' + t);
    var btn  = document.getElementById('tab-' + t);
    var hint = document.getElementById('panel-hint-' + t);
    if (sec)  sec.style.display  = (t === tab) ? '' : 'none';
    if (hint) hint.style.display = (t === tab) ? '' : 'none';
    if (btn)  btn.classList.toggle('active', t === tab);
  });
  _majVisibiliteEquations();
  sim.needsRedraw = true;
  // replaceState : un rechargement reste sur l'onglet affiché, sans empiler
  // d'entrées d'historique (cf. CONTEXTE_PROJET.md §9)
  history.replaceState(null, '', location.pathname + '#' + tab);
}

// ── Bandeau Informations (celui de l'onglet affiché) ──────────────────
function toggleHint() {
  var hint = document.getElementById('panel-hint-' + sim.onglet);
  if (hint) hint.classList.toggle('collapsed');
}

// ══════════════════════════════════════════════════════════════════════
//  Panneau — onglet Oxydoréduction
// ══════════════════════════════════════════════════════════════════════

function _majuscule(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function _remplirListes() {
  var selM = document.getElementById('sel-metal');
  var selS = document.getElementById('sel-solution');
  ORDRE_METAUX.forEach(function (sym) {
    var M = METAUX[sym];
    var o = document.createElement('option');
    o.value = sym;
    o.textContent = _majuscule(M.nom) + ' (' + sym + ')';
    selM.appendChild(o);

    var o2 = document.createElement('option');
    o2.value = sym;
    o2.textContent = _majuscule(M.nomSolution) + ' (' + ionTexte(sym) + ')';
    selS.appendChild(o2);
  });
  selM.value = sim.metal;
  selS.value = sim.solution;
}

// Grise dans chaque liste les choix incompatibles avec l'autre liste
function _majOptionsExclues() {
  var selM = document.getElementById('sel-metal');
  var selS = document.getElementById('sel-solution');
  Array.prototype.forEach.call(selM.options, function (o) {
    o.disabled = combinaisonExclue(o.value, sim.solution);
  });
  Array.prototype.forEach.call(selS.options, function (o) {
    o.disabled = combinaisonExclue(sim.metal, o.value);
    // En gras : les solutions qui réagissent avec la lame choisie
    o.style.fontWeight = reactionPossible(sim.metal, o.value) && !o.disabled ? 'bold' : 'normal';
  });
}

function onSelectMetal(v) {
  sim.metal = v;
  // Choix incompatible avec la solution actuelle : on prend la solution par défaut
  if (combinaisonExclue(sim.metal, sim.solution)) {
    sim.solution = 'Cu';
    document.getElementById('sel-solution').value = sim.solution;
  }
  resetRedox();
}
function onSelectSolution(v) {
  sim.solution = v;
  // Choix incompatible avec la lame actuelle : on prend la lame par défaut
  if (combinaisonExclue(sim.metal, sim.solution)) {
    sim.metal = 'Zn';
    document.getElementById('sel-metal').value = sim.metal;
  }
  resetRedox();
}

// RAZ : lame neuve dans son support, solution fraîche
function resetRedox() {
  _majOptionsExclues();
  resetBecher();
  resetLoupe();
  var S = METAUX[sim.solution];
  document.getElementById('lbl-solution-ions').innerHTML =
    'Ions ' + ionHTML(S.sym) + ' et ' + anionHTML(S.anion) + ' (spectateurs)';
  majEquations();
  sim.needsRedraw = true;
}

function togglePlonger() {
  if (lame.cible === 'becher') retirerLame(); else plongerLame();
}

// Appelée par becher.js à chaque changement de destination de la lame
function majBoutonPlonger() {
  var btn = document.getElementById('btn-plonger');
  if (!btn) return;
  btn.textContent = lame.cible === 'becher' ? '⬆ Retirer la lame' : '⬇ Plonger la lame';
}

// ── Pause / vitesse ───────────────────────────────────────────────────
function togglePause() {
  sim.paused = !sim.paused;
  var btn = document.getElementById('btn-playpause');
  btn.textContent = sim.paused ? '▶ Reprendre' : '⏸ Pause';
  btn.className   = 'btn ' + (sim.paused ? 'btn-play' : 'btn-pause');
}

// Étiquettes et nom d'état repris de ondes/ et pression/ ; pas de cran ×0,25,
// un cran ×2 pour laisser la transformation avancer plus vite
var SPEED_STEPS = [0.10, 0.50, 1.00, 2.00];

function onSliderSpeed(val) {
  sim.speedFactor = SPEED_STEPS[parseInt(val, 10)];
  document.getElementById('lbl-speed').textContent = sim.speedFactor.toFixed(2).replace('.', ',');
}

// ── Options ───────────────────────────────────────────────────────────
function _basculer(id, cle) {
  sim[cle] = !sim[cle];
  var btn = document.getElementById(id);
  btn.classList.toggle('active', sim[cle]);
  btn.setAttribute('aria-pressed', String(sim[cle]));
  sim.needsRedraw = true;
}

function toggleEquations() {
  _basculer('btn-equations', 'showEquations');
  document.getElementById('btn-equations').textContent =
    sim.showEquations ? 'Masquer les équations' : 'Afficher les équations';
  _majVisibiliteEquations();
}
function toggleElectrons()   { _basculer('btn-electrons', 'showElectrons'); }
function toggleSpectateurs() { _basculer('btn-spectateurs', 'showSpectateurs'); }
function toggleTemoin()      { _basculer('btn-temoin', 'showTemoin'); }

function _majVisibiliteEquations() {
  var vis = sim.showEquations && sim.onglet === 'oxydoreduction';
  document.getElementById('equations').style.display = vis ? '' : 'none';
  // La zone du canvas change de hauteur : le ResizeObserver s'en charge.
}

// ══════════════════════════════════════════════════════════════════════
//  Équations (couples, demi-équations, équation de la réaction)
//  Conventions du programme : demi-équation écrite avec « = », équation
//  de la réaction avec « → », états physiques précisés.
// ══════════════════════════════════════════════════════════════════════

function _etat(e) { return '<span class="eq-etat">(' + e + ')</span>'; }
function _coef(n) { return n > 1 ? n + '&nbsp;' : ''; }
function _electrons(n) { return (n > 1 ? n + '&nbsp;' : '') + 'e<sup>−</sup>'; }

function majEquations() {
  var X = sim.metal, Y = sim.solution;
  var MX = METAUX[X], MY = METAUX[Y];
  var html;

  if (reactionPossible(X, Y)) {
    var st = stoechiometrie(X, Y);
    var mult = function (n) { return n > 1 ? '<td class="eq-mult">× ' + n + '</td>' : '<td></td>'; };
    html =
      '<table class="eq-table">' +
      '<tr><td class="eq-lbl">Couples</td><td class="eq-val">' +
        ionHTML(Y) + '/' + Y + ' &nbsp;et&nbsp; ' + ionHTML(X) + '/' + X + '</td><td></td></tr>' +
      '<tr id="eq-ligne-ox"><td class="eq-lbl eq-ox">Oxydation ' + MX.du + '</td><td class="eq-val">' +
        X + _etat('s') + ' = ' + ionHTML(X) + _etat('aq') + ' + ' + _electrons(MX.charge) +
        '</td>' + mult(st.coefMetal) + '</tr>' +
      '<tr id="eq-ligne-red"><td class="eq-lbl eq-red">Réduction des ' + MY.nomIon + '</td><td class="eq-val">' +
        ionHTML(Y) + _etat('aq') + ' + ' + _electrons(MY.charge) + ' = ' + Y + _etat('s') +
        '</td>' + mult(st.coefIon) + '</tr>' +
      '<tr class="eq-bilan" id="eq-ligne-bilan"><td class="eq-lbl">Équation de la réaction</td><td class="eq-val">' +
        _coef(st.coefMetal) + X + _etat('s') + ' + ' + _coef(st.coefIon) + ionHTML(Y) + _etat('aq') +
        ' → ' + _coef(st.coefMetal) + ionHTML(X) + _etat('aq') + ' + ' + _coef(st.coefIon) + Y + _etat('s') +
        '</td><td></td></tr>' +
      '</table>';
  } else if (X === Y) {
    html = '<div class="eq-rien">Aucune transformation : la lame et les ions appartiennent au même couple ' +
           ionHTML(Y) + '/' + Y + '.' +
           '<span class="eq-sous">Le métal ne peut pas réduire ses propres ions.</span></div>';
  } else {
    html = '<div class="eq-rien">Aucune transformation entre ' + MX.le + ' et les ' + MY.nomIon + '.' +
           '<span class="eq-sous">Couples ' + ionHTML(Y) + '/' + Y + ' et ' + ionHTML(X) + '/' + X +
           ' : c’est la transformation inverse qui se produit (lame ' + MY.de +
           ' dans une solution d’' + MX.nomIon + ').</span></div>';
  }
  document.getElementById('equations').innerHTML = html;
}

// ══════════════════════════════════════════════════════════════════════
//  Canvas : redimensionnement (devicePixelRatio, cf. CONTEXTE_PROJET.md §7)
// ══════════════════════════════════════════════════════════════════════

var _resizeRAF = null;

function resize() {
  if (_resizeRAF !== null) return;
  _resizeRAF = requestAnimationFrame(function () { _resizeRAF = null; _doResize(); });
}

function _doResize() {
  var area = document.getElementById('sim-area');
  var dpr = window.devicePixelRatio || 1;
  _cw = area.clientWidth;
  _ch = area.clientHeight;
  canvas.width  = Math.round(_cw * dpr);
  canvas.height = Math.round(_ch * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  calculerDisposition(_cw, _ch);
  sim.needsRedraw = true;
}

// ══════════════════════════════════════════════════════════════════════
//  Boucle d'animation
// ══════════════════════════════════════════════════════════════════════

var _lastTs = null;

function loop(ts) {
  requestAnimationFrame(loop);
  if (_lastTs === null) { _lastTs = ts; return; }
  var dtReel = Math.min(ts - _lastTs, 50) / 1000;   // plafonné : onglet en arrière-plan
  _lastTs = ts;
  var dtSim = sim.paused ? 0 : dtReel * sim.speedFactor;

  if (sim.onglet === 'oxydoreduction') {
    majBecher(dtSim, dtReel);
    majLoupe(dtSim);
    // En pause, on ne redessine que si quelque chose a changé (lame déplacée…)
    if (dtSim > 0 || sim.needsRedraw) {
      _dessiner();
      sim.needsRedraw = false;
    }
  } else if (sim.needsRedraw) {
    _dessiner();
    sim.needsRedraw = false;
  }
}

function _dessiner() {
  ctx.clearRect(0, 0, _cw, _ch);
  if (sim.onglet === 'oxydoreduction') {
    dessinerBecher(ctx);
    dessinerLoupe(ctx);
  } else {
    var fs = Math.max(14, Math.min(_cw, _ch) * 0.045);
    ctx.fillStyle = '#7a8a96';
    ctx.font = '600 ' + fs + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Pile et électrolyse — onglet en préparation', _cw / 2, _ch / 2);
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Souris / doigt : glisser la lame
// ══════════════════════════════════════════════════════════════════════

function _posCanvas(e) {
  var r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

canvas.addEventListener('pointerdown', function (e) {
  if (sim.onglet !== 'oxydoreduction') return;
  var p = _posCanvas(e);
  if (!becherPointerDown(p.x, p.y)) return;
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = 'grabbing';
  e.preventDefault();
});

canvas.addEventListener('pointermove', function (e) {
  if (sim.onglet !== 'oxydoreduction') return;
  var p = _posCanvas(e);
  var surLame = becherPointerMove(p.x, p.y);
  if (!canvas.hasPointerCapture(e.pointerId)) canvas.style.cursor = surLame ? 'grab' : 'default';
});

function _finGlisser(e) {
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  if (becherPointerUp()) canvas.style.cursor = 'grab';
}
canvas.addEventListener('pointerup', _finGlisser);
canvas.addEventListener('pointercancel', _finGlisser);

// ── Raccourcis clavier (projection) ───────────────────────────────────
document.addEventListener('keydown', function (e) {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  var tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
  if (sim.onglet !== 'oxydoreduction') return;
  if (e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    togglePause();
  } else if (e.key === 'r' || e.key === 'R') {
    resetRedox();
  }
});

// ══════════════════════════════════════════════════════════════════════
//  Initialisation
// ══════════════════════════════════════════════════════════════════════

function init() {
  _remplirListes();

  var hash = window.location.hash.replace('#', '');
  setMainTab(ONGLETS.indexOf(hash) !== -1 ? hash : 'oxydoreduction');

  _doResize();
  resetRedox();

  // La zone du canvas change de taille avec la fenêtre, mais aussi quand
  // le bloc des équations apparaît ou disparaît.
  if (window.ResizeObserver) new ResizeObserver(resize).observe(document.getElementById('sim-area'));
  window.addEventListener('resize', resize);

  requestAnimationFrame(loop);
}

// DOMContentLoaded et non load : hors ligne, `load` attendrait le script
// de statistiques distant (cf. pression/).
document.addEventListener('DOMContentLoaded', init);
