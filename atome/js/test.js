'use strict';
// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

/* ══════════════════════════════════════════════════
   TEST.JS — Mode test (quiz)
   Même mécanique que reaction/ et titrage/ : overlay de
   choix, 5 questions, pop-up de correction, score final.
   (chargé en dernier — cf. index.html)

   Deux thèmes, même disposition de fenêtre et mêmes zones de saisie pour
   les particules et la configuration électronique — seule la dernière
   ligne de la barre change :

   - « constitution » : 5 atomes tirés sans remise parmi les 18. L'élève ne
     voit que le nom, Z et A ; il donne le nombre de protons, de neutrons et
     d'électrons, complète la configuration électronique et décrit la couche
     de valence.
   - « stabilite » : 5 éléments tirés sans remise parmi 16 (carbone et
     silicium exclus). Tout est à renseigner pour l'**ion stable** de
     l'élément : particules, configuration électronique et symbole de l'ion
     (le symbole de l'élément est donné, la charge s'écrit en exposant).
     Le bouton « Comparer » reste accessible — comparer au gaz noble voisin
     est justement la méthode.

   Dans les deux cas le schéma se remplit au fur et à mesure de ce que
   l'élève écrit — y compris si c'est faux.
══════════════════════════════════════════════════ */

var TEST_N = 5;   /* nombre d'atomes par test */

var testState = {
  actif: false,
  mode: null,     /* 'constitution' | 'stabilite'                      */
  atomes: [],     /* les TEST_N numéros atomiques tirés au sort        */
  idx: 0,         /* position courante dans `atomes`                   */
  score: 0,
  essais: 0,      /* essais déjà consommés sur l'atome courant (max 2)  */
  clos: false     /* atome courant terminé (réussi ou réponse vue)      */
};

function estModeStab() { return testState.mode === 'stabilite'; }

/* ─────────────────────────────────────────────────
   Thème « stabilité » — ion stable de chaque élément
   Charge de l'ion formé (0 pour les gaz nobles, qui n'en forment pas :
   la zone « charge » doit alors rester vide). Le carbone et le silicium
   sont absents : ils ne donnent pas d'ion monoatomique.
───────────────────────────────────────────────── */
var ION_STABLE = {
  1: 1,   /* H⁺              */
  2: 0,   /* He — gaz noble  */
  3: 1,   /* Li⁺             */
  4: 2,   /* Be²⁺            */
  5: 3,   /* B³⁺             */
  7: -3,  /* N³⁻             */
  8: -2,  /* O²⁻             */
  9: -1,  /* F⁻              */
  10: 0,  /* Ne — gaz noble  */
  11: 1,  /* Na⁺             */
  12: 2,  /* Mg²⁺            */
  13: 3,  /* Al³⁺            */
  15: -3, /* P³⁻             */
  16: -2, /* S²⁻             */
  17: -1, /* Cl⁻             */
  18: 0   /* Ar — gaz noble  */
};

var CONSIGNE_STAB =
  'Compléter les informations ci-dessous pour l’|ion stable| de l’élément indiqué.';

/* ─────────────────────────────────────────────────
   Overlay modal / pop-up de correction / progression
───────────────────────────────────────────────── */
function afficherOverlay(html) {
  document.getElementById('test-modal-content').innerHTML = html;
  document.getElementById('test-overlay').classList.add('visible');
}
function fermerOverlay() {
  document.getElementById('test-overlay').classList.remove('visible');
  document.getElementById('test-modal-content').innerHTML = '';
}

function afficherPopupTest(msg, cssClass, btnsHtml) {
  var msgEl = document.getElementById('test-popup-msg');
  msgEl.innerHTML = msg;
  msgEl.className = cssClass;
  document.getElementById('test-popup-btns').innerHTML = btnsHtml;
  document.getElementById('test-popup').classList.add('visible');
}
function fermerPopupTest() {
  document.getElementById('test-popup').classList.remove('visible');
  document.getElementById('test-popup-msg').innerHTML = '';
  document.getElementById('test-popup-btns').innerHTML = '';
}

function majBarreProgression() {
  var bar = document.getElementById('test-progress-bar');
  if (!testState.actif) { bar.classList.remove('visible'); bar.innerHTML = ''; return; }
  var s = testState.score;
  var scoreAff = (s % 1 === 0) ? s : s.toFixed(1).replace('.', ',');
  bar.innerHTML = '<div>' + (estModeStab() ? 'Élément' : 'Atome') + ' : ' +
                  (testState.idx + 1) + ' / ' + TEST_N + '</div>' +
                  '<div>Score : ' + scoreAff + ' pt' + (s > 1 ? 's' : '') + '</div>';
  bar.classList.add('visible');
}

/* ─────────────────────────────────────────────────
   Entrée / sortie du mode test
───────────────────────────────────────────────── */
function ouvrirConfirmTest() {
  afficherOverlay(
    '<h2>Mode Test</h2>' +
    '<p>Choisissez un thème :</p>' +
    '<div class="test-modal-btns">' +
      '<button class="btn-test-confirm btn-test-oui" ' +
              'onclick="lancerTest(\'constitution\')">Constitution des atomes</button>' +
    '</div>' +
    '<div class="test-modal-btns">' +
      '<button class="btn-test-confirm btn-test-oui" ' +
              'onclick="lancerTest(\'stabilite\')">Stabilité des éléments</button>' +
    '</div>' +
    '<div class="test-modal-btns">' +
      '<button class="btn-test-confirm btn-test-non" onclick="fermerOverlay()">Annuler</button>' +
    '</div>');
}

/* Les contrôles qui donneraient la réponse (dispersion du noyau, vue charge,
   ionisation, stabilité) ou qui changeraient d'atome (tableau périodique,
   comparaison) sont neutralisés pendant le test. Exception : dans le thème
   « stabilité », la comparaison reste offerte — comparer l'élément au gaz
   noble voisin est la méthode attendue. */
var TEST_CTRLS_OFF = ['btn-comparer', 'cmp-select', 'btn-eclater', 'btn-charge',
                      'btn-empty', 'btn-stable',
                      'btn-ion-add-main', 'btn-ion-sub-main',
                      'btn-ion-add-cmp',  'btn-ion-sub-cmp'];
var TEST_CTRLS_STAB_ON = ['btn-comparer', 'cmp-select'];

function setTestUI(actif) {
  document.body.classList.toggle('test', actif);
  document.body.classList.toggle('test-constit', actif && !estModeStab());
  document.body.classList.toggle('test-stab',    actif && estModeStab());

  TEST_CTRLS_OFF.forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    var off = actif && !(estModeStab() && TEST_CTRLS_STAB_ON.indexOf(id) !== -1);
    el.disabled = off;
  });

  var btn = document.getElementById('btn-test-mode');
  if (actif) {
    btn.textContent = '✕ Sortir du mode test';
    btn.className = 'btn btn-quitter-test';
    btn.onclick = quitterModeTest;
  } else {
    btn.innerHTML = '&#9881; Mode Test';
    btn.className = 'btn btn-test-mode';
    btn.onclick = ouvrirConfirmTest;
    /* Les états « disabled » légitimes (limites d'ionisation, animation en
       cours…) sont recalculés par les fonctions du panneau. */
    majBtnEclate(); majBtnCharge(); majBtnIon();
  }
}

/* Remet la scène à plat avant d'entrer en test : un seul atome, noyau
   assemblé, aucune option d'affichage active. */
function preparerScenTest() {
  if (state.compare) toggleCompare();
  if (state.showEmpty) toggleEmpty();
  if (state.showStable) toggleStable();
  state.eclate = false; state.charge = false;
  _nucAnim.running = false; _chargeAnim.running = false;
  state.ionQ = 0; state.ionQCmp = 0;
  resetNucVue(); resetChargeVue(); resetIonVue();
}

/* TEST_N éléments tirés sans remise : les 18 en « constitution », les 16
   qui donnent un ion monoatomique en « stabilité » (cf. ION_STABLE). */
function tirerAtomesTest() {
  var pool = ELEMENTS.map(function (el) { return el.Z; });
  if (estModeStab()) pool = pool.filter(function (Z) { return ION_STABLE[Z] !== undefined; });
  for (var i = pool.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  return pool.slice(0, TEST_N);
}

function lancerTest(mode) {
  fermerOverlay();
  fermerPopupTest();
  preparerScenTest();
  testState.actif  = true;
  testState.mode   = mode;
  testState.atomes = tirerAtomesTest();   /* après testState.mode : le tirage en dépend */
  testState.idx    = 0;
  testState.score  = 0;
  setTestUI(true);
  chargerAtomeTest();
}

function quitterModeTest() {
  fermerOverlay(); fermerPopupTest();
  var Z = state.Z;
  testState.actif = false;
  testState.mode  = null;
  testState.atomes = [];
  testState.idx = 0; testState.score = 0; testState.essais = 0; testState.clos = false;
  state.testShells = null;
  state.testConsigne = null;
  majBarreProgression();
  setTestUI(false);
  /* Retour à l'affichage normal : l'atome du dernier test reste sélectionné. */
  selectElement(Z);
}

/* ─────────────────────────────────────────────────
   Enchaînement des atomes
───────────────────────────────────────────────── */
function chargerAtomeTest() {
  var Z = testState.atomes[testState.idx];
  testState.essais = 0;
  testState.clos = false;
  fermerPopupTest();

  state.Z = Z;
  state.ionQ = 0;
  state.testShells = [0, 0, 0, 0, 0];
  state.testConsigne = estModeStab() ? CONSIGNE_STAB : null;
  resetNucVue(); resetChargeVue(); resetIonVue();

  /* Thème « stabilité » : le symbole de l'élément est donné, seule la
     charge est à écrire (en exposant). */
  if (estModeStab()) document.getElementById('ti-sym').textContent = getElement(Z).sym;

  /* Le tableau périodique reste consultable, mais aucune case n'est
     surlignée : la période de l'atome testé dirait le nombre de couches. */
  var cells = document.querySelectorAll('.tp-cell');
  for (var i = 0; i < cells.length; i++) cells[i].classList.remove('selected', 'compared');

  buildTestBar();
  viderSaisiesTest();
  majBarreProgression();
  majInfos();   /* le nom de l'élément reste affiché au-dessus du schéma */
  render();
}

function atomeSuivantTest() {
  fermerPopupTest();
  testState.idx++;
  if (testState.idx >= TEST_N) { afficherScoreFinal(); return; }
  chargerAtomeTest();
}

function afficherScoreFinal() {
  var s = testState.score;
  var scoreAff = (s % 1 === 0) ? s : s.toFixed(1).replace('.', ',');
  var message;
  if      (s >= 5)   message = 'Parfait ! Maîtrise totale.';
  else if (s >= 4)   message = 'Très bien ! Tu maîtrises le sujet.';
  else if (s >= 3)   message = 'Bien. Quelques points à retravailler.';
  else if (s >= 1.5) message = 'Passable. Il faut revoir ce thème.';
  else               message = 'Insuffisant. Reprends le cours !';
  afficherOverlay(
    '<h2>Résultat du test — ' +
    (estModeStab() ? 'Stabilité des éléments' : 'Constitution des atomes') + '</h2>' +
    '<div id="test-score-display">' + scoreAff + ' / ' + TEST_N + '</div>' +
    '<p>' + message + '</p>' +
    '<div class="test-modal-btns">' +
      '<button class="btn-test-confirm btn-test-oui" onclick="relancerTest()">Réessayer</button>' +
      '<button class="btn-test-confirm btn-test-non" onclick="quitterModeTest()">Sortir</button>' +
    '</div>');
}

function relancerTest() {
  fermerOverlay();
  testState.atomes = tirerAtomesTest();
  testState.idx = 0;
  testState.score = 0;
  chargerAtomeTest();
}

/* ─────────────────────────────────────────────────
   Ligne « configuration électronique » de la barre du bas : les zones
   de saisie tiennent la place des exposants ; les libellés 1s, 2s…
   gardent la couleur de leur sous-couche (comme au canvas). Le rappel
   Z/A, lui, reste dessiné sous le schéma (draw.js), comme hors test.
───────────────────────────────────────────────── */
function buildTestBar() {
  document.getElementById('test-bar-cfg').innerHTML =
    SUBSHELLS.map(function (s, i) {
      return '<span class="cfg-term" style="color:' + s.color + '">' + s.id +
             '<input class="cfg-exp" id="cfg-exp-' + i + '" type="text" ' +
             'inputmode="numeric" maxlength="2" autocomplete="off" ' +
             'aria-label="Nombre d’électrons de la sous-couche ' + s.id + '" ' +
             'oninput="onCfgInput(' + i + ')"></span>';
    }).join('');
}

/* Saisie d'un exposant : le schéma suit immédiatement. Aucune limite de
   capacité — c'est à l'élève de savoir qu'une sous-couche s n'accepte
   que 2 électrons. */
function onCfgInput(i) {
  var inp = document.getElementById('cfg-exp-' + i);
  var v = inp.value.replace(/\D/g, '');
  if (v !== inp.value) inp.value = v;
  inp.classList.remove('ko', 'ok');
  state.testShells[i] = v === '' ? 0 : parseInt(v, 10);
  render();
}

/* ─────────────────────────────────────────────────
   Correction
───────────────────────────────────────────────── */

/* Réponses attendues : pour l'atome neutre en « constitution », pour l'ion
   stable en « stabilité » (l'espèce décrite change, pas les questions). */
function reponsesAttenduesTest(Z) {
  var el = getElement(Z);
  var ionQ = estModeStab() ? ION_STABLE[Z] : 0;
  var nE = nElectronsIon(Z, ionQ);
  var conf = getConfigForN(nE);
  var cfg = SUBSHELLS.map(function (s) {
    var c = conf.filter(function (x) { return x.sub === s; })[0];
    return c ? c.count : 0;
  });
  var st = getStabilite(Z, ionQ);
  return {
    p: Z, n: el.A - Z, e: nE, cfg: cfg,
    vn: st.n, ve: st.count,
    charge: ionExposant(ionQ)   /* '' pour un gaz noble : aucun ion formé */
  };
}

/* Toutes les zones de saisie de la question courante, avec la valeur
   attendue. Une case vide vaut 0 (cf. énoncé : rien ou 0 = pas d'électron).
   `couche` et `charge` marquent les deux zones où une réponse non numérique
   est possible, et où la forme de l'écriture compte. */
function champsTest() {
  var r = reponsesAttenduesTest(testState.atomes[testState.idx]);
  var l = [
    { el: document.getElementById('ti-p'), att: r.p },
    { el: document.getElementById('ti-n'), att: r.n },
    { el: document.getElementById('ti-e'), att: r.e }
  ];
  if (estModeStab()) {
    l.push({ el: document.getElementById('ti-charge'), att: r.charge, charge: true });
  } else {
    l.push({ el: document.getElementById('ti-vn'), att: r.vn, couche: true });
    l.push({ el: document.getElementById('ti-ve'), att: r.ve });
  }
  SUBSHELLS.forEach(function (s, i) {
    l.push({ el: document.getElementById('cfg-exp-' + i), att: r.cfg[i] });
  });
  return l;
}

function valeurChamp(inp) {
  var v = inp.value.replace(/\D/g, '');
  return v === '' ? 0 : parseInt(v, 10);
}

/* Une sous-couche écrite à la place du numéro de couche : « 3p », « 2 s »… */
function estSousCouche(txt) { return /^\d\s*[spSP]$/.test(txt.trim()); }

/* Charge d'un ion : espaces retirés, tous les tirets ramenés au signe moins
   du clavier. */
function normCharge(txt) {
  return txt.replace(/[\s ]/g, '').replace(/[−–—]/g, '-');
}

/* Signe écrit avant le nombre (« +2 » au lieu de « 2+ ») — l'erreur à
   signaler. */
function estChargeInversee(txt) { return /^[+-]\d$/.test(normCharge(txt)); }

/* Charge attendue : la notation classique de ionExposant() — '+', '2+',
   '-', '3-'… Seul le « 1 » redondant est toléré (« 1+ » pour « + ») ; un
   signe placé avant le nombre est faux. Gaz noble (att = '') : aucun ion,
   la zone doit rester vide (ou porter un 0). */
function chargeCorrecte(txt, att) {
  var v = normCharge(txt);
  if (att === '') return v === '' || v === '0';
  if (att === '+' || att === '-') return v === att || v === '1' + att;
  return v === att;
}

/* Réponse juste ? Les zones « couche de valence » et « charge » ne sont pas
   de simples nombres : « 3p » comme « +2 » sont faux, même quand le chiffre
   est bon. */
function champCorrect(c) {
  if (c.charge) return chargeCorrecte(c.el.value, c.att);
  if (c.couche) {
    var brut = c.el.value.trim();
    return /^\d+$/.test(brut) && parseInt(brut, 10) === c.att;
  }
  return valeurChamp(c.el) === c.att;
}

/* Libellé du bouton de passage à la question suivante */
function libelleSuivant(dernier) {
  if (dernier) return 'Voir le score ➜';
  return estModeStab() ? 'Élément suivant ➜' : 'Atome suivant ➜';
}

function validerTest() {
  if (!testState.actif || testState.clos) return;
  var champs = champsTest();
  var faux = 0, confusion = false, inversee = false;

  champs.forEach(function (c) {
    var ok = champCorrect(c);
    c.el.classList.remove('ok', 'ko');
    if (ok) return;
    c.el.classList.add('ko');
    faux++;
    if (c.couche && estSousCouche(c.el.value)) confusion = true;
    if (c.charge && estChargeInversee(c.el.value)) inversee = true;
  });

  /* Remarques ajoutées au message de correction : les erreurs classiques. */
  var astuce = '';
  if (confusion) astuce += '<div class="popup-astuce">Attention à ne pas confondre couche et sous-couche.</div>';
  if (inversee)  astuce += '<div class="popup-astuce">Attention : dans la charge d’un ion, le nombre s’écrit avant le signe (2+ et non +2).</div>';

  var dernier = (testState.idx === TEST_N - 1);
  var btnSuiv = '<button class="btn-test-confirm btn-test-green" ' +
                'onclick="atomeSuivantTest()">' + libelleSuivant(dernier) + '</button>';

  if (faux === 0) {
    var pts = (testState.essais === 0) ? 1 : 0.5;
    testState.score += pts;
    testState.clos = true;
    champs.forEach(function (c) { c.el.classList.add('ok'); });
    verrouillerSaisiesTest(true);
    majBarreProgression();
    afficherPopupTest('✓ Bravo ! ' +
                      (estModeStab() ? 'Ion stable entièrement décrit' : 'Atome entièrement décrit') +
                      ' (' + (pts === 1 ? '+1 point' : '+0,5 point') + ')', 'ok', btnSuiv);
    return;
  }

  testState.essais++;
  var nbFaux = faux + (faux > 1 ? ' réponses fausses' : ' réponse fausse');
  if (testState.essais >= 2) {
    testState.clos = true;
    verrouillerSaisiesTest(true);
    afficherPopupTest('✗ Deux essais épuisés — ' + nbFaux + ' (0 point)' + astuce, 'nok',
      '<button class="btn-test-confirm btn-test-orange" ' +
      'onclick="voirReponseTest()">Voir la réponse</button>' + btnSuiv);
  } else {
    afficherPopupTest('✗ ' + nbFaux + ' (en rouge) — il vous reste un essai' + astuce, 'nok',
      '<button class="btn-test-confirm btn-test-non" ' +
      'onclick="fermerPopupTest()">Corriger</button>');
  }
}

/* Remplit toutes les zones avec la bonne réponse et met le schéma à jour */
function voirReponseTest() {
  fermerPopupTest();
  champsTest().forEach(function (c) {
    c.el.value = String(c.att);
    c.el.classList.remove('ko');
    c.el.classList.add('ok');
  });
  var r = reponsesAttenduesTest(testState.atomes[testState.idx]);
  state.testShells = r.cfg.slice();
  render();

  afficherPopupTest('Réponse affichée', 'ok',
    '<button class="btn-test-confirm btn-test-non" onclick="atomeSuivantTest()">' +
    libelleSuivant(testState.idx === TEST_N - 1) + '</button>');
}

/* ─────────────────────────────────────────────────
   Zones de saisie — remise à zéro et verrouillage
───────────────────────────────────────────────── */
function toutesLesSaisiesTest() {
  var l = ['ti-p', 'ti-n', 'ti-e', 'ti-vn', 'ti-ve', 'ti-charge'].map(function (id) {
    return document.getElementById(id);
  });
  SUBSHELLS.forEach(function (s, i) {
    var el = document.getElementById('cfg-exp-' + i);
    if (el) l.push(el);
  });
  return l;
}

function viderSaisiesTest() {
  toutesLesSaisiesTest().forEach(function (el) {
    el.value = '';
    el.classList.remove('ok', 'ko');
    el.disabled = false;
  });
}

function verrouillerSaisiesTest(v) {
  toutesLesSaisiesTest().forEach(function (el) { el.disabled = v; });
}

/* Entrée = valider (raccourci pratique quand on saisit au clavier) */
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter' || !testState.actif || testState.clos) return;
  if (!e.target || !e.target.classList) return;
  if (!e.target.classList.contains('test-input') &&
      !e.target.classList.contains('cfg-exp')) return;
  e.preventDefault();
  validerTest();
});
