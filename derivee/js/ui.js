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
  return DT_MIN + f * f * (dtMaxCourant() - DT_MIN);
}
function sliderDepuisDt(dt) {
  if (dt <= 0) return 0;
  var dtMax = dtMaxCourant();
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
  // Les bornes ne viennent plus de la seule définition de la fonction : le
  // mode décollage impose les siennes (cf. bornesParam), et fige b à 0.
  borneParamsAuMode();
  F.params.forEach(function (p) {
    var b = bornesParam(p);
    var off = b.fixe ? ' disabled' : '';
    html += '<div class="param-row param-inline' + (b.fixe ? ' param-fige' : '') + '">' +
            '<label for="num-par-' + p.id + '" class="p-nom">' + p.label + '</label>' +
            '<input type="range" id="sl-par-' + p.id + '" min="' + b.min + '" max="' + b.max +
            '" step="' + b.step + '" value="' + sim.params[p.id] + '"' + off +
            ' oninput="onParam(\'' + p.id + '\', this.value)">' +
            '<span class="param-field">' +
            '<input type="text" inputmode="decimal" class="param-num" id="num-par-' + p.id +
            '" value="' + fmtFr(sim.params[p.id], p.dec) + '"' + off +
            ' title="Entre ' + fmtFr(b.min, p.dec) + ' et ' + fmtFr(b.max, p.dec) + '"' +
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
  // Le décollage ne survit pas au changement de fonction : il n'a de sens
  // que sur z(t), et il impose ses bornes aux paramètres.
  if (sim.fusee && !fuseeDispo()) quitteFusee();
  chargeParamsDefaut();
  sim.zoom = 1; sim.panT = 0; sim.panZ = 0;
  recadre();
  construitSelecteurFonctions();
  construitParams();
  construitSliderT0();
  // L'ancre précède le recalage : setEncadrement quantifie le pas dessus.
  sim.chronoAncre = sim.t0;
  setEncadrement(sim.encadrement);
  syncDtUI();
  majBtnChrono();
  majPanneauFusee();
  resizeAll();
  majAffichages();
}

function onParam(id, val) {
  var p = _defParam(id);
  sim.params[id] = parseFloat(val);
  var champ = _el('num-par-' + id);
  if (champ && p) champ.value = fmtFr(sim.params[id], p.dec);
  majApresParam();
}

// Valeur tapée au clavier : virgule ou point acceptés, valeur ramenée dans
// les bornes du slider. Une saisie inutilisable laisse la valeur en place.
function onParamSaisi(id, txt) {
  var p = _defParam(id);
  if (!p) return;
  var v = parseFloat(String(txt).replace(',', '.').replace(/\s/g, ''));
  var b = bornesParam(p);
  if (isFinite(v)) {
    v = Math.max(b.min, Math.min(b.max, v));
    sim.params[id] = v;
    _el('sl-par-' + id).value = v;
    majApresParam();
  }
  _el('num-par-' + id).value = fmtFr(sim.params[id], p.dec);
}

// Suites d'un changement de paramètre : la courbe change de forme, donc
// le cadrage de référence doit suivre. En décollage, a et c commandent en
// plus la DURÉE du vol (date des 1000 m) : elle a pu passer sous la date
// courante, et l'écart Δ sous son propre plafond.
function majApresParam() {
  if (fuseeActif()) {
    if (fuseeClampT()) majBtnFusee();
    var dtM = dtMaxCourant();
    if (sim.dt > dtM) { sim.dt = dtM; chronoRecale(); }
    syncDtUI();
  }
  recadre();
  majAffichages();
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
  // Le pas des relevés suit Δt, mais se cale sur le point d'étude : celui-ci
  // garde son abscisse, seule la densité des relevés change.
  chronoRecale();
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
  // Le pas des relevés vaut Δt/2 en symétrique, Δt sinon : il change ici,
  // mais le point d'étude reste à son abscisse.
  chronoRecale();

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
  // Le décollage repart à l'instant zéro, fusée au sol.
  fuseeRaz();
  chargeParamsDefaut();
  sim.zoom = 1; sim.panT = 0; sim.panZ = 0;
  recadre();
  construitParams();
  construitSliderT0();
  // L'ancre precede le recalage : setEncadrement quantifie le pas dessus.
  sim.chronoAncre = sim.t0;
  setEncadrement(sim.encadrement);
  syncDtUI();
  majBtnChrono();
  majBtnFusee();
  majAffichages();
}

// ── Cases à cocher d'affichage ────────────────────────────────────────
function toggleTangente(v) { sim.showTangente = v; requestDraw(); }
function toggleCotes(v)    { sim.showCotes = v;    requestDraw(); }
function toggleCoords(v)   { sim.showCoords = v;   requestDraw(); }

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
// La courbe se peuple des positions relevées à intervalle de temps
// constant. La grille se cale sur le point d'étude, qui garde donc son
// abscisse en entrant dans le mode : l'étude en cours n'est pas déplacée.
function toggleChrono() {
  if (!chronoDispo()) return;
  sim.chrono = !sim.chrono;
  if (sim.chrono) {
    // Le point courant devient l'ancre : la grille des relevés se cale sur
    // lui, il ne bouge donc pas en entrant dans le mode.
    sim.chronoAncre = sim.t0;
    chronoRecale();
    syncDtUI();
  }
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

// ══════════════════════════════════════════════════════════════════════
//  Décollage de fusée
//  Le graphe cesse d'être donné d'avance : il s'écrit pendant que la
//  fusée monte, à la même ordonnée qu'elle. Ce n'est qu'une fois posée
//  la dernière valeur que le point d'étude, les cotes et la sécante
//  reviennent — on ne calcule pas un taux de variation sur un
//  enregistrement en cours.
// ══════════════════════════════════════════════════════════════════════

// Crans du curseur de vitesse (mêmes valeurs que la page champ uniforme).
var FUSEE_VITESSES = [0.10, 0.25, 0.50, 1.00];

function toggleFusee() {
  if (!fuseeDispo()) return;
  sim.fusee = !sim.fusee;
  stopAnimDt();
  fuseeRaz();
  // Entrer dans le mode (comme en sortir) remet a, b et c dans leurs
  // valeurs d'origine : les bornes du décollage sont plus étroites, et
  // surtout le décor — hauteur de la fusée, cadrage — doit repartir d'un
  // état connu.
  var F = fonCourante();
  F.params.forEach(function (p) { sim.params[p.id] = p.val; });
  sim.zoom = 1; sim.panT = 0; sim.panZ = 0;
  construitParams();
  recadre();
  majPanneauFusee();
  // Le plafond de Δ change avec le mode (durée du vol / dtMax de la
  // fonction) : l'écart courant doit y rentrer, dans un sens comme dans
  // l'autre, sinon le curseur se retrouverait hors de sa course.
  sim.dt = Math.min(sim.dt, dtMaxCourant());
  chronoRecale();
  syncDtUI();
  // Le canevas de la fusée avait une taille nulle tant qu'il était masqué.
  resizeAll();
  majAffichages();
}

// Sortie du mode sans toucher aux paramètres : appelée quand on change de
// fonction, où chargeParamsDefaut() s'en charge juste après.
function quitteFusee() {
  sim.fusee = false;
  fuseeRaz();
  majPanneauFusee();
}

// Montre ou cache ce qui n'appartient qu'au décollage : le panneau de la
// fusée à gauche, la section de commandes à droite.
function majPanneauFusee() {
  _el('left-col').classList.toggle('avec-fusee', fuseeActif());
  _el('bloc-fusee').style.display = fuseeActif() ? '' : 'none';
  majBtnFusee();
}

// Le bouton n'existe que pour la trajectoire z(t) : ailleurs, il n'y a
// rien qui décolle.
function majBtnFusee() {
  var btn = _el('btn-fusee');
  if (btn) {
    var dispo = fuseeDispo();
    btn.style.display = dispo ? '' : 'none';
    var on = dispo && sim.fusee;
    btn.classList.toggle('active', on);
    btn.textContent = on ? 'Quitter le décollage' : 'Décollage de fusée';
  }
  var b = _el('btn-fusee-play');
  if (!b) return;
  // Arrivée au bout, le bouton propose de rejouer plutôt que de reprendre
  // une animation qui n'a plus nulle part où aller.
  var fini = sim.fuseeFini && sim.fuseeT >= fuseeDuree();
  b.textContent = sim.fuseePlay ? '❚❚ Pause' : (fini ? '↻ Rejouer' : '▶ Lancer');
  b.classList.toggle('btn-pause', sim.fuseePlay);
  b.classList.toggle('btn-play', !sim.fuseePlay);
}

function toggleFuseePlay() {
  if (!fuseeActif()) return;
  // Rejouer : retour à l'instant zéro, donc au cadre de départ.
  if (!sim.fuseePlay && sim.fuseeT >= fuseeDuree()) { fuseeRaz(); recadre(); }
  sim.fuseePlay = !sim.fuseePlay;
  majBtnFusee();
  requestDraw();
}

function razFusee() {
  if (!fuseeActif()) return;
  fuseeRaz();
  recadre();
  majBtnFusee();
  requestDraw();
  majAffichages();
}

function onFuseeSpeed(v) {
  sim.fuseeSpeed = FUSEE_VITESSES[parseInt(v, 10)] || 1;
  _setText('lbl-fusee-speed', '×' + sim.fuseeSpeed.toFixed(2).replace('.', ','));
}

// Avance (ou recule, dtMs < 0) l'animation. Le point d'étude suit la
// fusée : à l'arrivée, il est posé sur la dernière valeur enregistrée,
// et c'est là que la lecture du taux de variation commence.
function avanceFusee(dtMs) {
  var duree = fuseeDuree();
  sim.fuseeT += dtMs / 1000 * sim.fuseeSpeed;

  if (sim.fuseeT >= duree) {
    sim.fuseeT = duree;
    sim.fuseePlay = false;
    if (!sim.fuseeFini) {
      sim.fuseeFini = true;
      // Le point d'étude atterrit au milieu du vol : la sécante y est bien
      // encadrée des deux côtés, alors qu'au bout elle sortirait du relevé.
      sim.t0 = duree / 2;
      sim.chronoAncre = sim.t0;
      // En chronophotographie on se pose sur le relevé le plus proche du
      // milieu, sans toucher au pas de prise de vue.
      if (chronoActif()) chronoChoisirPres(sim.t0);
      syncDtUI();
    }
    majBtnFusee();
  } else {
    if (sim.fuseeT < 0) { sim.fuseeT = 0; }
    // Rembobiner rouvre l'enregistrement : la figure de lecture se retire.
    if (sim.fuseeFini) { sim.fuseeFini = false; majBtnFusee(); }
  }
  // La fenêtre suit l'enregistrement : elle se dilate au fil de la montée
  // (cf. fuseeCadre), donc le cadrage se recalcule à chaque pas.
  recadre();
}

// Rembobinage : bouton à MAINTENIR appuyé. Le pointeur est capturé, si
// bien que relâcher hors du bouton — voire hors de la fenêtre — arrête
// bien le retour en arrière.
var _fuseeRewind = false;

function initFuseeRewind() {
  var btn = _el('btn-fusee-rewind');
  if (!btn) return;
  btn.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (btn.setPointerCapture) btn.setPointerCapture(e.pointerId);
    _fuseeRewind = true;
    sim.fuseePlay = false;
    btn.classList.add('active');
    _setText('lbl-fusee-speed', '⏪');
    majBtnFusee();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) {
    btn.addEventListener(ev, function () {
      if (!_fuseeRewind) return;
      _fuseeRewind = false;
      btn.classList.remove('active');
      // L'étiquette revient à la graduation choisie, relue sur le curseur
      // lui-même plutôt que tenue en double.
      onFuseeSpeed(_el('sl-fusee-speed').value);
    });
  });
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
    sim.dt = dtMaxCourant();
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
  // Même invariant que le slider : c'est l'abscisse de M qui est conservée.
  chronoRecale();
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
  if (fuseeActif()) sizeCanvas(_el('canvas-fusee'));
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

  // Décollage : le temps du vol avance (ou recule, bouton de rembobinage).
  if (fuseeActif() && (sim.fuseePlay || _fuseeRewind)) {
    avanceFusee(_fuseeRewind ? -dtMs : dtMs);
    majAffichages();
  }

  // Rien ne bouge tant que l'utilisateur n'agit pas : inutile de
  // redessiner 60 fois par seconde une image identique.
  if (!needsDraw) return;
  needsDraw = false;
  drawCourbe();
  if (sim.showDeriv) drawDeriv();
  // Après drawCourbe : le panneau de la fusée lit `geoCourbe`, qui vient
  // d'être remis à jour, pour aligner le centre de masse sur z(t).
  if (fuseeActif()) drawFusee();
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
  _el('ck-coords').checked = sim.showCoords;

  initCourbeSouris();
  initSplitter();
  initFuseeRewind();
  majBtnFusee();
  resizeAll();
  requestAnimationFrame(loop);
}

window.addEventListener('load', init);
