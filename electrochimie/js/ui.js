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
  // Le bloc des équations est commun aux deux onglets : on le reconstruit
  if (tab === 'oxydoreduction') majEquations(); else majEquationsPile(true);
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
  });
  ORDRE_SOLUTIONS.forEach(function (sym) {
    var o2 = document.createElement('option');
    o2.value = sym;
    o2.textContent = _majuscule(METAUX[sym].nomSolution) + ' (' + ionTexte(sym) + ')';
    selS.appendChild(o2);
  });
  selM.value = sim.metal;
  selS.value = sim.solution;
}

// En gras dans la liste des solutions : celles qui réagissent avec la lame choisie
function _majSolutionsGras() {
  var selS = document.getElementById('sel-solution');
  Array.prototype.forEach.call(selS.options, function (o) {
    o.style.fontWeight = reactionPossible(sim.metal, o.value) ? 'bold' : 'normal';
  });
}

function onSelectMetal(v) {
  sim.metal = v;
  resetRedox();
}
function onSelectSolution(v) {
  sim.solution = v;
  resetRedox();
}

// RAZ : lame neuve dans son support, solution fraîche
function resetRedox() {
  _majSolutionsGras();
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

// ── Pause / vitesse (communes aux deux onglets) ───────────────────────
function togglePause() {
  sim.paused = !sim.paused;
  ['btn-playpause', 'btn-playpause-pile'].forEach(function (id) {
    var btn = document.getElementById(id);
    btn.textContent = sim.paused ? '▶ Reprendre' : '⏸ Pause';
    btn.className   = 'btn ' + (sim.paused ? 'btn-play' : 'btn-pause');
  });
}

// Étiquettes et nom d'état repris de ondes/ et pression/ ; pas de cran ×0,25,
// un cran ×2 pour laisser la transformation avancer plus vite
var SPEED_STEPS = [0.10, 0.50, 1.00, 2.00];

function onSliderSpeed(val) {
  sim.speedFactor = SPEED_STEPS[parseInt(val, 10)];
  var txt = sim.speedFactor.toFixed(2).replace('.', ',');
  document.getElementById('lbl-speed').textContent = txt;
  document.getElementById('lbl-speed-pile').textContent = txt;
  document.getElementById('sl-speed').value = val;
  document.getElementById('sl-speed-pile').value = val;
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
  var vis = sim.onglet === 'oxydoreduction' ? sim.showEquations : pile.showEquations;
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
  if (sim.onglet !== 'oxydoreduction') return;      // bloc occupé par l'onglet Pile
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
//  Panneau — onglet Pile et électrolyse
// ══════════════════════════════════════════════════════════════════════

function _remplirListesPile() {
  var selX = document.getElementById('sel-experience');
  ORDRE_EXPERIENCES.forEach(function (cle) {
    var o = document.createElement('option');
    o.value = cle;
    o.textContent = EXPERIENCES[cle].nom;
    selX.appendChild(o);
  });
  ['sel-gauche', 'sel-droite'].forEach(function (id) {
    var sel = document.getElementById(id);
    ORDRE_METAUX.forEach(function (sym) {
      var o = document.createElement('option');
      o.value = sym;
      o.textContent = _majuscule(METAUX[sym].nom) + ' (' + ionTexte(sym) + '/' + sym + ')';
      sel.appendChild(o);
    });
  });
  _synchroniserPanneauPile();
}

// Recopie l'état de la pile dans les listes et les curseurs
function _synchroniserPanneauPile() {
  document.getElementById('sel-experience').value = pile.experience;
  document.getElementById('sel-gauche').value = pile.metaux[0];
  document.getElementById('sel-droite').value = pile.metaux[1];
  ['gauche', 'droite'].forEach(function (cote, i) {
    document.getElementById('sl-c-' + cote).value = pile.iC0[i];
    document.getElementById('lbl-c-' + cote).textContent = _formatC0(concInitiale(i));
  });
}

function _formatC0(c) { return (c < 0.1 ? c.toFixed(2) : c.toFixed(c < 1 ? 2 : 1)).replace('.', ','); }

// Expérience prédéfinie qui correspond aux réglages, sinon « Montage libre »
function _experienceCorrespondante() {
  for (var i = 0; i < ORDRE_EXPERIENCES.length; i++) {
    var X = EXPERIENCES[ORDRE_EXPERIENCES[i]];
    if (X.g === pile.metaux[0] && X.d === pile.metaux[1] && X.cg === pile.iC0[0] && X.cd === pile.iC0[1]) {
      return ORDRE_EXPERIENCES[i];
    }
  }
  return 'libre';
}

function onSelectExperience(v) {
  var X = EXPERIENCES[v];
  if (X.g) {
    pile.metaux = [X.g, X.d];
    pile.iC0 = [X.cg, X.cd];
  }
  pile.experience = v;
  _synchroniserPanneauPile();
  resetPile();
}

function onSelectDemiPile(i, v) {
  pile.metaux[i] = v;
  pile.experience = _experienceCorrespondante();
  _synchroniserPanneauPile();
  resetPile();
}

function onSliderConcentration(i, val) {
  pile.iC0[i] = parseInt(val, 10);
  pile.experience = _experienceCorrespondante();
  _synchroniserPanneauPile();
  resetPile();
}

// RAZ de la pile : solutions et lames neuves, compteurs à zéro. Le circuit
// extérieur (appareil, interrupteur, pont) est conservé.
function resetPile() {
  resetPileModele();
  resetLoupePile();
  _majLibellesPile();
  majEquationsPile(true);
  _majMesures(true);
  sim.needsRedraw = true;
}

function _majLibellesPile() {
  ['gauche', 'droite'].forEach(function (cote, i) {
    var M = METAUX[pile.metaux[i]];
    document.getElementById('lbl-' + cote).innerHTML =
      'Lame ' + M.de + ' dans ' + ionHTML(M.sym) + ' + ' + anionHTML(M.anion);
    // Boutons de la loupe : nommés par le métal, sauf s'il est le même des deux côtés
    document.getElementById('zone-' + cote).textContent =
      pile.metaux[0] === pile.metaux[1] ? 'Électrode ' + cote : 'Électrode ' + M.sym;
  });
}

// ── Circuit extérieur ─────────────────────────────────────────────────
function onSelectDipole(v) {
  pile.dipole = v;
  _majPanneauCircuit();
}

function onSliderResistance(val) {
  pile.iR = parseInt(val, 10);
  document.getElementById('lbl-resistance').textContent = RESISTANCES[pile.iR];
  sim.needsRedraw = true;
}

function toggleInterrupteur() {
  pile.interrupteur = !pile.interrupteur;
  _majPanneauCircuit();
}

function togglePont() {
  pile.pont = !pile.pont;
  _majPanneauCircuit();
}

function _majPanneauCircuit() {
  document.getElementById('row-resistance').style.display = pile.dipole === 'resistance' ? '' : 'none';
  var btnK = document.getElementById('btn-interrupteur');
  btnK.style.display = chargeBranchee() ? '' : 'none';
  btnK.textContent = pile.interrupteur ? 'Ouvrir l’interrupteur' : 'Fermer l’interrupteur';
  var btnP = document.getElementById('btn-pont');
  btnP.textContent = pile.pont ? 'Retirer le pont salin' : 'Remettre le pont salin';
  btnP.classList.toggle('active', !pile.pont);
  btnP.setAttribute('aria-pressed', String(!pile.pont));
  // Le courant change aussitôt (même en pause)
  pile.E = femPile();
  pile.I = courantPile();
  sim.needsRedraw = true;
}

// ── Loupe ─────────────────────────────────────────────────────────────
function setZonePile(z) {
  if (z === pile.zone) return;          // un clic sur la zone déjà vue ne remet pas la loupe à zéro
  pile.zone = z;
  ['gauche', 'droite', 'pont', 'fil'].forEach(function (n) {
    document.getElementById('zone-' + n).classList.toggle('active', n === z);
  });
  resetLoupePile();
  sim.needsRedraw = true;
}

// ── Options ───────────────────────────────────────────────────────────
function toggleOptionPile(id, cle) {
  pile[cle] = !pile[cle];
  var btn = document.getElementById(id);
  btn.classList.toggle('active', pile[cle]);
  btn.setAttribute('aria-pressed', String(pile[cle]));
  sim.needsRedraw = true;
}

function toggleEquationsPile() {
  toggleOptionPile('btn-equations-pile', 'showEquations');
  document.getElementById('btn-equations-pile').textContent =
    pile.showEquations ? 'Masquer les équations' : 'Afficher les équations';
  _majVisibiliteEquations();
}

// ── Mesures (mises à jour à chaque image, seulement si elles changent) ─
var _mesuresAffichees = {};

function _majMesures(force) {
  var h = Math.floor(pile.t / 3600), mn = Math.floor((pile.t % 3600) / 60);
  var valeurs = {
    'ro-duree': h > 0 ? h + ' h ' + (mn < 10 ? '0' : '') + mn + ' min' : mn + ' min',
    'ro-intensite': formatNombre(pile.I * 1000, 1) + ' mA',
    'ro-charge': Math.round(pile.Q).toLocaleString('fr-FR') + ' C'
  };
  for (var id in valeurs) {
    if (!force && _mesuresAffichees[id] === valeurs[id]) continue;
    _mesuresAffichees[id] = valeurs[id];
    document.getElementById(id).textContent = valeurs[id];
  }
}

// ── Équations de fonctionnement ───────────────────────────────────────
// Reconstruites quand les demi-piles, la polarité, l'état du circuit ou
// le pont changent (clé comparée à chaque image).
var _cleEqPile = '';

function majEquationsPile(force) {
  var E = pile.E, I = pile.I;
  var cle = pile.metaux.join('|') + '|' + (E > 1e-4 ? 1 : E < -1e-4 ? -1 : 0) + '|' + (I !== 0) + '|' + pile.pont;
  if (!force && cle === _cleEqPile) return;
  _cleEqPile = cle;
  if (sim.onglet !== 'pile-electrolyse') return;

  var html;
  if (Math.abs(E) <= 1e-4) {
    html = '<div class="eq-rien">Aucune tension entre les électrodes.' +
           '<span class="eq-sous">Même couple et mêmes concentrations des deux côtés : la pile ne peut pas débiter.</span></div>';
  } else {
    var iM = E > 0 ? 0 : 1, iP = 1 - iM;          // électrodes − (anode) et + (cathode)
    var A = pile.metaux[iM], C = pile.metaux[iP];
    var st = stoechiometrie(A, C);
    var cote = function (i) { return i === 0 ? 'gauche' : 'droite'; };
    var mult = function (n) { return n > 1 ? '<td class="eq-mult">× ' + n + '</td>' : '<td></td>'; };
    var bilan;
    if (A !== C) {
      bilan = _coef(st.coefMetal) + A + _etat('s') + ' + ' + _coef(st.coefIon) + ionHTML(C) + _etat('aq') +
              ' → ' + _coef(st.coefMetal) + ionHTML(A) + _etat('aq') + ' + ' + _coef(st.coefIon) + C + _etat('s');
    } else {
      // Pile de concentration : les ions passent du côté concentré au côté dilué
      bilan = ionHTML(C) + _etat('aq, ' + cote(iP)) + ' → ' + ionHTML(C) + _etat('aq, ' + cote(iM));
    }
    html =
      '<table class="eq-table">' +
      '<tr><td class="eq-lbl eq-ox">Pôle − (anode, ' + cote(iM) + ') : oxydation</td><td class="eq-val">' +
        A + _etat('s') + ' = ' + ionHTML(A) + _etat('aq') + ' + ' + _electrons(METAUX[A].charge) +
        '</td>' + mult(st.coefMetal) + '</tr>' +
      '<tr><td class="eq-lbl eq-red">Pôle + (cathode, ' + cote(iP) + ') : réduction</td><td class="eq-val">' +
        ionHTML(C) + _etat('aq') + ' + ' + _electrons(METAUX[C].charge) + ' = ' + C + _etat('s') +
        '</td>' + mult(st.coefIon) + '</tr>' +
      '<tr class="eq-bilan"><td class="eq-lbl">Équation de fonctionnement</td><td class="eq-val">' +
        bilan + '</td><td></td></tr>' +
      '</table>';
    if (I === 0) {
      html += '<div class="eq-note">' + (pile.pont
        ? 'La pile ne débite pas : ces réactions n’ont lieu que lorsqu’un courant circule.'
        : 'Pont salin retiré : le circuit est ouvert, la pile ne débite pas.') + '</div>';
    }
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
  calculerDispositionPile(_cw, _ch);
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
  } else {
    majPile(dtSim);
    majLoupePile(dtSim);
    majEquationsPile(false);
    _majMesures(false);
    if (dtSim > 0 || sim.needsRedraw) {
      _dessiner();
      sim.needsRedraw = false;
    }
  }
}

function _dessiner() {
  ctx.clearRect(0, 0, _cw, _ch);
  if (sim.onglet === 'oxydoreduction') {
    dessinerBecher(ctx);
    dessinerLoupe(ctx);
  } else {
    dessinerMontage(ctx);
    dessinerLoupePile(ctx);
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
  if (sim.onglet !== 'oxydoreduction') {
    var q = _posCanvas(e);
    if (pilePointerDown(q.x, q.y)) e.preventDefault();
    return;
  }
  var p = _posCanvas(e);
  if (!becherPointerDown(p.x, p.y)) return;
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = 'grabbing';
  e.preventDefault();
});

canvas.addEventListener('pointermove', function (e) {
  if (sim.onglet !== 'oxydoreduction') {
    var q = _posCanvas(e);
    canvas.style.cursor = pilePointerMove(q.x, q.y) ? 'pointer' : 'default';
    return;
  }
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
// Onglet Pile : plus rien sous la souris quand elle quitte le canvas
canvas.addEventListener('pointerleave', function () {
  if (pile.survol !== null) { pile.survol = null; sim.needsRedraw = true; }
});

// ── Raccourcis clavier (projection) ───────────────────────────────────
document.addEventListener('keydown', function (e) {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  var tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
  if (e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    togglePause();
  } else if (e.key === 'r' || e.key === 'R') {
    if (sim.onglet === 'oxydoreduction') resetRedox(); else resetPile();
  }
});

// ══════════════════════════════════════════════════════════════════════
//  Initialisation
// ══════════════════════════════════════════════════════════════════════

function init() {
  _remplirListes();
  _remplirListesPile();
  resetPileModele();               // grandeurs de la pile prêtes avant le choix de l'onglet

  var hash = window.location.hash.replace('#', '');
  setMainTab(ONGLETS.indexOf(hash) !== -1 ? hash : 'oxydoreduction');

  _doResize();
  resetRedox();
  _majPanneauCircuit();
  resetPile();

  // La zone du canvas change de taille avec la fenêtre, mais aussi quand
  // le bloc des équations apparaît ou disparaît.
  if (window.ResizeObserver) new ResizeObserver(resize).observe(document.getElementById('sim-area'));
  window.addEventListener('resize', resize);

  requestAnimationFrame(loop);
}

// DOMContentLoaded et non load : hors ligne, `load` attendrait le script
// de statistiques distant (cf. pression/).
document.addEventListener('DOMContentLoaded', init);
