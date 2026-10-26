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

function _option(sel, val, txt) {
  var o = document.createElement('option');
  o.value = val;
  o.textContent = txt;
  sel.appendChild(o);
}

function _remplirListesPile() {
  // Expériences regroupées (Piles, Électrolyses), montages libres à la fin
  var selX = document.getElementById('sel-experience');
  var groupes = {};
  ORDRE_EXPERIENCES.forEach(function (cle) {
    var X = EXPERIENCES[cle], parent = selX;
    if (X.groupe) {
      if (!groupes[X.groupe]) {
        groupes[X.groupe] = document.createElement('optgroup');
        groupes[X.groupe].label = X.groupe;
        selX.appendChild(groupes[X.groupe]);
      }
      parent = groupes[X.groupe];
    }
    _option(parent, cle, X.nom);
  });
  // Demi-piles : couples Mⁿ⁺/M, puis couples gazeux
  ['sel-gauche', 'sel-droite'].forEach(function (id) {
    var sel = document.getElementById(id);
    ORDRE_DEMI_PILES.forEach(function (cle) {
      var G = DEMI_PILES_GAZ[cle];
      _option(sel, cle, G ? G.nom + ' (' + G.couple + ')'
                          : _majuscule(METAUX[cle].nom) + ' (' + ionTexte(cle) + '/' + cle + ')');
    });
  });
  // Cuve : solution et électrodes
  var selS = document.getElementById('sel-solution-cuve');
  ORDRE_SOLUTIONS_CUVE.forEach(function (cle) {
    var S = SOLUTIONS[cle];
    _option(selS, cle, _majuscule(S.nom) + (S.metal ? ' (' + ionTexte(S.metal) + ')' : ' (' + S.court + ')'));
  });
  ['sel-elec-gauche', 'sel-elec-droite'].forEach(function (id) {
    var sel = document.getElementById(id);
    ORDRE_ELECTRODES.forEach(function (sym) {
      _option(sel, sym, _majuscule(METAUX[sym].nom));
    });
  });
  _synchroniserPanneauPile();
}

// Recopie l'état de la pile dans les listes et les curseurs ; adapte le
// panneau au montage (deux béchers, cuve unique, pile à combustible)
function _synchroniserPanneauPile() {
  var deux = deuxBechers(), cuve = enCuve(), pac = enPac();
  document.getElementById('sel-experience').value = pile.experience;
  document.getElementById('bloc-demi-piles').style.display = deux ? '' : 'none';
  document.getElementById('bloc-cuve').style.display = cuve ? '' : 'none';
  if (deux) {
    document.getElementById('sel-gauche').value = pile.metaux[0];
    document.getElementById('sel-droite').value = pile.metaux[1];
  }
  if (cuve) {
    document.getElementById('sel-solution-cuve').value = pile.solution;
    document.getElementById('sel-elec-gauche').value = pile.metaux[0];
    document.getElementById('sel-elec-droite').value = pile.metaux[1];
  }
  var lc = document.getElementById('lbl-cuve');
  lc.style.display = pac ? '' : 'none';
  if (pac) {
    lc.innerHTML = 'Électrodes de platine poreuses, alimentées en continu en dihydrogène (à gauche) et en ' +
                   'dioxygène (à droite), séparées par un électrolyte acide (membrane échangeuse de protons).';
  }
  ['gauche', 'droite'].forEach(function (cote, i) {
    document.getElementById('sl-c-' + cote).value = pile.iC0[i];
    document.getElementById('lbl-c-' + cote).textContent = _formatC0(concInitiale(i));
  });
  document.getElementById('titre-c-gauche').textContent = cuve ? 'Concentration de la solution' : 'Concentration à gauche';
  document.getElementById('row-c-gauche').style.display = pac ? 'none' : '';
  document.getElementById('row-c-droite').style.display = deux ? '' : 'none';
  document.getElementById('lbl-parametres').textContent = pac
    ? 'Pile à combustible : électrolyte de concentration fixée ([H⁺] = 1 mol/L).'
    : 'Concentration du cation (métal), du soluté (chlorure, sulfate de sodium) ou des ions H⁺ (acide). ' +
      'Volume de chaque solution : 100 mL. Un changement remet l’expérience à zéro.';
  document.getElementById('sel-dipole').value = pile.dipole;
  document.getElementById('sl-resistance').value = pile.iR;
  document.getElementById('lbl-resistance').textContent = RESISTANCES[pile.iR];
  document.getElementById('sl-tension').value = pile.iU;
  document.getElementById('lbl-tension').textContent = formatNombre(tensionGenerateur(), 2);
}

function _formatC0(c) { return (c < 0.1 ? c.toFixed(2) : c.toFixed(c < 1 ? 2 : 1)).replace('.', ','); }

// Expérience prédéfinie qui correspond aux réglages, sinon le montage libre
function _experienceCorrespondante() {
  for (var i = 0; i < ORDRE_EXPERIENCES.length; i++) {
    var X = EXPERIENCES[ORDRE_EXPERIENCES[i]], bac = X.bac || 'deux';
    if (!X.g || bac !== pile.bac) continue;
    if (bac === 'pac') return ORDRE_EXPERIENCES[i];
    if (bac === 'un' && X.solution !== pile.solution) continue;
    if (X.g === pile.metaux[0] && X.d === pile.metaux[1] && X.cg === pile.iC0[0] &&
        (bac === 'un' || X.cd === pile.iC0[1])) {
      return ORDRE_EXPERIENCES[i];
    }
  }
  return enCuve() ? 'libre-cuve' : 'libre';
}

function onSelectExperience(v) {
  var X = EXPERIENCES[v], bacAvant = pile.bac;
  pile.bac = X.bac || 'deux';
  if (X.g) {
    pile.metaux = [X.g, X.d];
    pile.iC0 = [X.cg, X.cd];
    if (X.solution) pile.solution = X.solution;
  } else if (pile.bac !== bacAvant) {
    // Montage libre d'un autre type : réglages de départ
    if (enCuve()) { pile.solution = 'Cu'; pile.metaux = ['C', 'C']; pile.iC0 = [3, 3]; }
    else { pile.metaux = ['Zn', 'Cu']; pile.iC0 = [2, 2]; }
  }
  // Circuit imposé par l'expérience (interrupteur ouvert : l'élève le ferme)
  if (X.dipole) {
    pile.dipole = X.dipole;
    if (X.iU !== undefined) pile.iU = X.iU;
    if (X.iR !== undefined) pile.iR = X.iR;
    if (X.polarite !== undefined) pile.polarite = X.polarite;
    pile.interrupteur = false;
  }
  pile.experience = v;
  _synchroniserPanneauPile();
  _majBoutonsZones();
  resetPile();
  _majPanneauCircuit();
}

function _apresChangement() {
  pile.experience = _experienceCorrespondante();
  _synchroniserPanneauPile();
  resetPile();
}

function onSelectDemiPile(i, v) { pile.metaux[i] = v; _apresChangement(); }
function onSelectElectrode(i, v) { pile.metaux[i] = v; _apresChangement(); }
function onSelectSolutionCuve(v) { pile.solution = v; _apresChangement(); }

function onSliderConcentration(i, val) {
  pile.iC0[i] = parseInt(val, 10);
  if (!deuxBechers()) pile.iC0[1] = pile.iC0[0];
  _apresChangement();
}

// RAZ : solutions et électrodes neuves, compteurs à zéro. Le circuit
// extérieur (appareil, interrupteur, générateur, pont) est conservé.
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
    var cle = pile.metaux[i], G = DEMI_PILES_GAZ[cle];
    if (deuxBechers()) {
      var S = SOLUTIONS[demiPile(cle).sol];
      document.getElementById('lbl-' + cote).innerHTML = G
        ? 'Électrode de platine où barbote le ' + G.nom.toLowerCase() + ', dans une solution acide (H<sup>+</sup> + ' +
          anionHTML(S.anion) + ')'
        : 'Lame ' + METAUX[cle].de + ' dans ' + ionHTML(cle) + ' + ' + anionHTML(S.anion);
    }
    // Boutons de la loupe : nommés par l'électrode, sauf si c'est la même des deux côtés
    var nom = enPac() ? (i === 0 ? 'H₂' : 'O₂') : G ? ESPECES[G.gaz].txt : METAUX[pile.lames[i].sym].sym;
    var memes = !enPac() && pile.metaux[0] === pile.metaux[1];
    document.getElementById('zone-' + cote).textContent = memes ? 'Électrode ' + cote : 'Électrode ' + nom;
  });
  if (enCuve()) {
    var S = SOLUTIONS[pile.solution], ions = [];
    if (S.metal) ions.push(ionHTML(S.metal));
    if (S.spect) ions.push(S.spect + '<sup>+</sup>');
    if (S.acide) ions.push('H<sup>+</sup>');
    ions.push(anionHTML(S.anion));
    document.getElementById('lbl-solution-cuve').innerHTML = 'Ions : ' + ions.join(' + ') + ' (et l’eau, H<sub>2</sub>O).';
  }
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

function onSliderTension(val) {
  pile.iU = parseInt(val, 10);
  document.getElementById('lbl-tension').textContent = formatNombre(tensionGenerateur(), 2);
  _majPanneauCircuit();
}

function togglePolarite() {
  pile.polarite = -pile.polarite;
  _majPanneauCircuit();
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
  var gen = pile.dipole === 'generateur';
  document.getElementById('row-resistance').style.display = pile.dipole === 'resistance' ? '' : 'none';
  document.getElementById('bloc-generateur').style.display = gen ? '' : 'none';
  document.getElementById('btn-polarite').style.display = gen ? '' : 'none';
  var btnK = document.getElementById('btn-interrupteur');
  btnK.style.display = courantPossible() ? '' : 'none';
  btnK.textContent = pile.interrupteur ? 'Ouvrir l’interrupteur' : 'Fermer l’interrupteur';
  var btnP = document.getElementById('btn-pont');
  btnP.style.display = deuxBechers() ? '' : 'none';
  btnP.textContent = pile.pont ? 'Retirer le pont salin' : 'Remettre le pont salin';
  btnP.classList.toggle('active', !pile.pont);
  btnP.setAttribute('aria-pressed', String(!pile.pont));
  // Le courant change aussitôt (même en pause)
  pile.E = femPile();
  pile.I = courantPile();
  _majSeuil();
  sim.needsRedraw = true;
}

// Indication sous le curseur du générateur : seuil d'électrolyse dans le
// sens où il pousse (il évolue avec les concentrations et le pH)
var _seuilAffiche = '';
function _majSeuil() {
  if (pile.dipole !== 'generateur') return;
  var s = seuilElectrolyse();
  var txt = s === null
    ? 'Branché dans le sens de la pile : il l’aide à débiter.'
    : 'Électrolyse au-delà de ' + formatNombre(s, 2) + ' V environ.';
  if (txt === _seuilAffiche) return;
  _seuilAffiche = txt;
  document.getElementById('lbl-seuil').textContent = txt;
}

// ── Loupe ─────────────────────────────────────────────────────────────
function setZonePile(z) {
  if (z === pile.zone) return;          // un clic sur la zone déjà vue ne remet pas la loupe à zéro
  if (z === 'pont' && enCuve()) return;
  pile.zone = z;
  _majBoutonsZones();
  resetLoupePile();
  sim.needsRedraw = true;
}

// Boutons des zones : zone active, pont salin indisponible dans la cuve,
// membrane à sa place dans la pile à combustible
function _majBoutonsZones() {
  if (pile.zone === 'pont' && enCuve()) pile.zone = 'gauche';
  ['gauche', 'droite', 'pont', 'fil'].forEach(function (n) {
    var b = document.getElementById('zone-' + n);
    b.classList.toggle('active', n === pile.zone);
    if (n === 'pont') {
      b.disabled = enCuve();
      b.textContent = enPac() ? 'Membrane' : 'Pont salin';
    }
  });
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
  _majSeuil();
}

// ── Équations ─────────────────────────────────────────────────────────
// Demi-équations à l'anode et à la cathode et équation de fonctionnement
// (pile, transformation spontanée) ou de l'électrolyse (transformation
// forcée). Sans courant : celles du sens où la transformation aurait lieu
// (sens spontané, ou sens imposé par le générateur s'il force), avec la
// raison de l'absence de courant. Le bloc n'est réécrit que s'il change.
var _htmlEqPile = '';

// Membre d'équation en HTML : « 2&nbsp;H<sub>2</sub>O(l) + … »
function _membreHTML(liste) {
  return liste.map(function (p) {
    var E = espece(p[1]);
    return _coef(p[0]) + E.html + _etat(E.etat);
  }).join(' + ');
}

function _demiEquationHTML(d, ox) {
  return ox ? _membreHTML(d.gauche) + ' = ' + _membreHTML(d.droite) + ' + ' + _electrons(d.n)
            : _membreHTML(d.gauche) + ' + ' + _electrons(d.n) + ' = ' + _membreHTML(d.droite);
}

// Équation de la réaction : demi-équations multipliées pour échanger le
// même nombre d'électrons, ajoutées ; H⁺ et HO⁻ d'un même membre forment
// de l'eau ; les espèces des deux membres se simplifient. null si tout se
// simplifie (même couple aux deux électrodes).
function _bilan(dOx, dRed) {
  var N = dOx.n * dRed.n / _pgcd(dOx.n, dRed.n);
  var R = {}, P = {}, ordreR = [], ordreP = [];
  var ajouter = function (M, ordre, liste, k) {
    liste.forEach(function (p) {
      if (!M[p[1]]) { M[p[1]] = 0; ordre.push(p[1]); }
      M[p[1]] += p[0] * k;
    });
  };
  ajouter(R, ordreR, dOx.gauche, N / dOx.n); ajouter(R, ordreR, dRed.gauche, N / dRed.n);
  ajouter(P, ordreP, dOx.droite, N / dOx.n); ajouter(P, ordreP, dRed.droite, N / dRed.n);
  [[R, ordreR], [P, ordreP]].forEach(function (m) {
    var M = m[0], n = Math.min(M['H+'] || 0, M['HO-'] || 0);
    if (n > 0) {
      M['H+'] -= n; M['HO-'] -= n;
      if (!M.H2O) { M.H2O = 0; m[1].push('H2O'); }
      M.H2O += n;
    }
  });
  for (var cle in R) {
    var m = Math.min(R[cle], P[cle] || 0);
    if (m > 0) { R[cle] -= m; P[cle] -= m; }
  }
  var g = 0, k;
  for (k in R) if (R[k] > 0) g = _pgcd(R[k], g);
  for (k in P) if (P[k] > 0) g = _pgcd(P[k], g);
  var liste = function (M, ordre) {
    return ordre.filter(function (c) { return M[c] > 0; }).map(function (c) { return [M[c] / g, c]; });
  };
  var lr = liste(R, ordreR), lp = liste(P, ordreP);
  return lr.length ? { gauche: lr, droite: lp } : null;
}

function majEquationsPile(force) {
  if (sim.onglet !== 'pile-electrolyse') return;
  var html = _equationsPileHTML();
  if (!force && html === _htmlEqPile) return;
  _htmlEqPile = html;
  document.getElementById('equations').innerHTML = html;
}

function _equationsPileHTML() {
  var E = pile.E, I = pile.I;
  var sI = I > 0 ? 1 : I < 0 ? -1 : 0;
  var gen = pile.dipole === 'generateur';
  var seuil = gen ? seuilElectrolyse() : null;
  var cote = function (i) { return i === 0 ? 'gauche' : 'droite'; };
  var iA, forcee;
  if (sI) {
    iA = sI > 0 ? 0 : 1;
    forcee = sensForce();
  } else if (gen && seuil !== null) {
    iA = pile.polarite > 0 ? 1 : 0;              // électrode reliée à la borne +
    forcee = true;
  } else if (Math.abs(E) > 1e-4) {
    iA = E > 0 ? 0 : 1;                          // pôle − de la pile
    forcee = false;
  } else {
    return '<div class="eq-rien">Aucune tension entre les électrodes.' +
      '<span class="eq-sous">' + (deuxBechers()
        ? 'Même couple et mêmes concentrations des deux côtés (ou pile usée) : la pile ne peut pas débiter.'
        : 'Les deux électrodes ne forment pas une pile : seul un générateur peut forcer une transformation.') +
      '</span></div>';
  }
  var iC = 1 - iA, s = _sens(iA);
  if (!s) {
    return '<div class="eq-rien">Aucune réaction possible.' +
      '<span class="eq-sous">Une lame est entièrement dissoute : elle ne plonge plus dans la solution.</span></div>';
  }
  var dOx = demiEquation(s.ox, compElectrode(iA)), dRed = demiEquation(s.red, compElectrode(iC));
  var N = dOx.n * dRed.n / _pgcd(dOx.n, dRed.n);
  var mult = function (n) { return n > 1 ? '<td class="eq-mult">× ' + n + '</td>' : '<td></td>'; };

  var b = _bilan(dOx, dRed), bilan;
  if (b) bilan = _membreHTML(b.gauche) + ' → ' + _membreHTML(b.droite);
  else if (!deuxBechers()) {
    // Anode soluble : le métal passe de l'anode à la cathode
    bilan = s.ox.sym + _etat('s, anode') + ' → ' + s.ox.sym + _etat('s, cathode');
  } else {
    // Pile de concentration : les ions passent d'un compartiment à l'autre
    bilan = ionHTML(s.red.sym) + _etat('aq, ' + cote(iC)) + ' → ' + ionHTML(s.red.sym) + _etat('aq, ' + cote(iA));
  }
  var lblA = forcee ? 'Anode (borne + du générateur, ' + cote(iA) + ') : oxydation'
                    : 'Pôle − (anode, ' + cote(iA) + ') : oxydation';
  var lblC = forcee ? 'Cathode (borne − du générateur, ' + cote(iC) + ') : réduction'
                    : 'Pôle + (cathode, ' + cote(iC) + ') : réduction';
  var html =
    '<table class="eq-table">' +
    '<tr><td class="eq-lbl eq-ox">' + lblA + '</td><td class="eq-val">' + _demiEquationHTML(dOx, true) +
      '</td>' + mult(N / dOx.n) + '</tr>' +
    '<tr><td class="eq-lbl eq-red">' + lblC + '</td><td class="eq-val">' + _demiEquationHTML(dRed, false) +
      '</td>' + mult(N / dRed.n) + '</tr>' +
    '<tr class="eq-bilan"><td class="eq-lbl">' +
      (forcee ? 'Électrolyse (transformation forcée)' : 'Équation de fonctionnement') +
      '</td><td class="eq-val">' + bilan + '</td><td></td></tr>' +
    '</table>';

  if (!sI) {
    var note;
    if (deuxBechers() && !pile.pont) note = 'Pont salin retiré : le circuit est ouvert, aucun courant ne circule.';
    else if (!courantPossible()) note = 'Circuit ouvert : aucun courant, ces réactions n’ont pas lieu.';
    else if (!pile.interrupteur) note = 'Interrupteur ouvert : aucun courant, ces réactions n’ont pas lieu.';
    else if (gen && seuil !== null) note = 'Aucun courant : la tension du générateur n’atteint pas le seuil d’électrolyse (' +
                                            formatNombre(seuil, 2) + ' V environ).';
    else note = 'Aucun courant : un réactif est épuisé.';
    html += '<div class="eq-note">' + note + '</div>';
  } else if (enPac() && !forcee) {
    html += '<div class="eq-note">Les réactifs sont amenés en continu : la pile ne s’use pas tant qu’elle est alimentée.</div>';
  }
  return html;
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
