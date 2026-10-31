// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  tf-ui.js — Onglet Transformations : commandes du panneau et boucle
//  Chargé après tf-sim.js, tf-scene.js et tf-graph.js, avant ui.js (qui gère les
//  onglets et appelle tfInit()).
// ══════════════════════════════════════════════════════════════════════

'use strict';

var _tfEl = {};
var _TF_EL_IDS = [
  'tf-it-P', 'tf-it-T', 'tf-it-V', 'tf-it-Pext', 'tf-it-Text', 'tf-sig-P', 'tf-sig-T',
  'tf-voy-meca', 'tf-voy-th',
  'tf-btn-playpause', 'tf-sl-vitesse', 'tf-lbl-vitesse', 'tf-vitesse-limite', 'tf-btn-auto',
  'tf-piston-tenu', 'tf-piston-libre',
  'tf-fond-isolant', 'tf-fond-1', 'tf-fond-2', 'tf-t-1', 'tf-t-2', 'tf-fleche-1', 'tf-fleche-2',
  'tf-pop-source', 'tf-pop-nom', 'tf-in-source', 'tf-pop-moins', 'tf-pop-plus', 'tf-pop-tgaz', 'tf-pop-note',
  'tf-mode-viser', 'tf-mode-main', 'tf-viser', 'tf-main',
  'tf-organes', 'tf-organe-piston', 'tf-organe-source',
  'tf-lbl-vise', 'tf-in-vise', 'tf-unite-vise', 'tf-sel-etat', 'tf-prevu',
  'tf-pm-moins', 'tf-pm-plus', 'tf-btn-annuler',
  'tf-montage-Pair', 'tf-montage-masse', 'tf-resume-init',
  'tf-btn-interrompre',
  'tf-manieres', 'tf-progres', 'tf-progres-rempli', 'tf-progres-txt',
  'tf-voyant', 'tf-voyant-txt', 'tf-main-compte', 'tf-carte-source', 'tf-main-note-source',
  'tf-main-nom-piston', 'tf-main-nature-piston', 'tf-main-val-piston',
  'tf-main-moins-piston', 'tf-main-plus-piston', 'tf-main-sl-piston',
  'tf-main-nom-source', 'tf-main-nature-source', 'tf-main-val-source',
  'tf-main-moins-source', 'tf-main-plus-source', 'tf-main-sl-source',
  'tf-journal', 'tf-ckg-gel',
  'tf-btn-brutal', 'tf-btn-qs', 'tf-btn-rev', 'tf-duree-brutal', 'tf-duree-qs', 'tf-duree-rev',
  'tf-bilan', 'tf-bilan-note', 'tf-bilan-cycle', 'tf-bil-etape', 'tf-bil-A', 'tf-bil-cycle',
  'tf-gamma', 'tf-in-P0', 'tf-in-V0', 'tf-in-T0', 'tf-moins-P0', 'tf-moins-V0', 'tf-moins-T0',
  'tf-plus-P0', 'tf-plus-V0', 'tf-plus-T0', 'tf-dep-info', 'tf-dep-attente'
];

// Vrai une fois tfInit terminée : les réglages initiaux du panneau
// n'ouvrent pas d'étape
var _tfPret = false;

// ══════════════════════════════════════════════════════════════════════
//  Carte « Transformation » (PLAN_TRANSFORMATIONS.md §10.3, §10.7, §10.9)
//  On agit sur l'un de deux organes : le piston ou la source sous le
//  cylindre. La grandeur réglée découle des conditions : piston tenu, sa
//  hauteur ('volume', par le vérin) ; libre, la masse posée ('masse') ou la
//  pression de l'air de l'enceinte ('Pair') selon le montage ; source, sa
//  température ('Text'). Chaque grandeur garde sa valeur visée et son pas ;
//  tant qu'on n'y touche pas (suit), la valeur visée est la valeur
//  actuelle.
// ══════════════════════════════════════════════════════════════════════

// Pas des boutons du mode À la main, en 1-2-5
var TF_PAS_ESC = {
  volume: [0.001, 0.002, 0.005, 0.01, 0.02, 0.05],   // m : course du vérin
  masse : [0.01, 0.02, 0.05, 0.1, 0.2, 0.5],         // kg : masse d'un grain de sable
  Pair  : [500, 1000, 2000, 5000, 10000, 20000],     // Pa
  Text  : [0.5, 1, 2, 5, 10, 20]                     // K
};

var tfCarte = {
  mode   : 'viser',      // 'viser' (valeur visée, trois manières) ou 'main' (pas à pas)
  organe : 'piston',     // organe visé : 'piston' ou 'source' (sur une source seulement)
  moyen  : 'Pair',       // montage : pression par 'Pair' (enceinte) ou 'masse'
  auto   : true,         // vitesse adaptée à chaque transformation
  // Valeur visée (SI), suivie de la valeur actuelle tant qu'on n'y touche
  // pas, cran du pas
  volume : { vise: 0.15,     suit: true, iPas: 3 },
  masse  : { vise: 20,       suit: true, iPas: 2 },
  Pair   : { vise: 2e5,      suit: true, iPas: 1 },
  Text   : { vise: 400,      suit: true, iPas: 1 }
};

// Champ de la valeur visée, par grandeur : libellé, unité affichée et son
// facteur (SI × f), décimales, pas des boutons − et +, bornes (SI)
var TF_VISEE = {
  volume : { nom: 'Hauteur visée du piston', unite: 'cm', f: 100, dec: 1, pas: 0.01,
             min: TF_H_VISEE_MIN, max: TF_H_VISEE_MAX },
  masse  : { nom: 'Masse posée visée', unite: 'kg', f: 1, dec: 2, pas: 5, min: 0, max: TF_MASSE_MAX },
  Pair   : { nom: 'Pression de l’air visée', unite: 'kPa', f: 1e-3, dec: 1, pas: 1e4, min: 0, max: 5e5 },
  Text   : { nom: 'Température visée de la source', unite: 'K', f: 1, dec: 1, pas: 10, min: 250, max: 600 }
};
var TF_T_SOURCE_MIN = 250, TF_T_SOURCE_MAX = 600;   // K

function _tfBorner(x, a, b) { return Math.max(a, Math.min(b, x)); }

// Nombre saisi au clavier, virgule ou point décimal ; NaN sinon
function _tfLireNombre(txt) {
  var t = String(txt).replace(/\s/g, '').replace(',', '.');
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t) ? parseFloat(t) : NaN;
}

// Valeur d'un champ : virgule décimale, sans zéros inutiles (30 ; 0,6)
function _tfFmtChamp(x, dec) {
  return String(+x.toFixed(dec)).replace('.', ',');
}

// Organe visé : la source seulement si le cylindre est posé sur l'une d'elles
function _tfOrgane() {
  return tfCarte.organe === 'source' && tf.fond !== 'isolant' ? 'source' : 'piston';
}

// Grandeur réglée par un organe, selon l'état du piston et le montage
function _tfCleOrgane(o) {
  if (o === 'source') return 'Text';
  return tf.tenu ? 'volume' : tfCarte.moyen;
}

// Grandeur visée
function _tfCle() { return _tfCleOrgane(_tfOrgane()); }

// Nature de la transformation obtenue en agissant sur un organe : elle
// découle des conditions
function _tfNature(o) {
  if (o === 'source') return tf.tenu ? 'isochore' : 'isobare';
  return tf.fond === 'isolant' ? 'adiabatique' : 'isotherme si lente';
}

function _tfPas(cle) { return TF_PAS_ESC[cle][tfCarte[cle].iPas]; }

// Valeur actuelle de la grandeur visée
function _tfActuelle(cle) { return cle === 'volume' ? tf.z[TF_N] : tf[cle]; }

// ══════════════════════════════════════════════════════════════════════
//  Formatage (virgule décimale)
// ══════════════════════════════════════════════════════════════════════

function _tfFmt(x, d) { return _tfFixe(x, d).replace('.', ','); }

// Temps : en ms aux crans de ralenti extrême, où l'on suit des
// phénomènes de l'ordre de la milliseconde ; en s sinon.
function _tfFmtTemps(t) {
  if (tf.vitesse < 0.01) return _tfFmt(t * 1000, 3) + ' ms';
  if (tf.vitesse < 0.1)  return _tfFmt(t * 1000, 1) + ' ms';
  return _tfFmt(t, 2) + ' s';
}

function _tfFmtPression(P) { return _tfFmt(P / 1000, 2) + ' kPa'; }

// Libellé d'une vitesse : ×1/5000, ×0,1, ×20… ; deux chiffres significatifs
// pendant un passage progressif d'un cran à l'autre (×1/140, ×3,5, ×1400)
function _tfLibelleVitesse(v) {
  if (v < 0.1) return '1/' + (+(1 / v).toPrecision(2));
  return String(+v.toPrecision(2)).replace('.', ',');
}

// Valeur d'une grandeur visée, en clair
function _tfFmtValeur(cle, x) {
  if (cle === 'volume') return _tfFmt(x * 100, 1) + ' cm (' + _tfFmt(TF_S * x * 1000, 3) + ' L)';
  if (cle === 'masse')  return (x < 0.0005 ? '0' : _tfFmt(x, x % 1 ? 2 : 0)) + ' kg';
  if (cle === 'Pair') {
    if (x < 500) return 'vide';
    return Math.abs(x - TF_P_ATM) < 1 ? '100 kPa (atmosphère)' : _tfFmt(x / 1000, x % 1000 ? 1 : 0) + ' kPa';
  }
  return _tfFmt(x, x % 1 ? 1 : 0) + ' K (' + Math.round(x - 273.15) + ' °C)';
}

function _tfFmtPas(cle, x) {
  if (cle === 'volume') return _tfFmtChamp(x * 100, 1) + ' cm';
  if (cle === 'masse') return Math.round(x * 1000) + ' g';
  if (cle === 'Pair')  return _tfFmt(x / 1000, x < 1000 ? 1 : 0) + ' kPa';
  return _tfFmt(x, x < 1 ? 1 : 0) + ' K';
}

// Durée à deux ou trois chiffres significatifs, en ms ou en s
function _tfFmtDuree(t) {
  if (t < 0.01) return _tfFmt(t * 1000, 1) + ' ms';
  if (t < 1)    return Math.round(t * 1000) + ' ms';
  if (t < 100)  return _tfFmt(t, t < 10 ? 2 : 1) + ' s';
  if (t < 600)  return Math.round(t) + ' s';
  if (t < 3600) return Math.round(t / 60) + ' min';
  var h = Math.floor(t / 3600), mn = Math.round((t - 3600 * h) / 60);
  if (mn === 60) { h++; mn = 0; }
  return h + ' h' + (mn ? ' ' + (mn < 10 ? '0' : '') + mn : '');
}

function _tfNonDefini(plage) {
  return '<span class="tf-nd">?</span> <span class="tf-plage">(' + plage + ')</span>';
}

// ══════════════════════════════════════════════════════════════════════
//  Afficheurs
// ══════════════════════════════════════════════════════════════════════

var _tfAffTimer = 0;
var TF_AFF_PERIODE = 100;   // ms réelles (10 Hz)

// Hors équilibre, P et T du gaz ne sont pas définies : « ? », suivi de
// l'intervalle couvert par les tranches. Afficher la moyenne laisserait
// croire qu'elle a un sens.
function tfMajAfficheurs() {
  _tfVitesseRelax();
  var m = tfMesures();
  // Temps des graphes : il s'arrête avec eux quand le chrono est figé à
  // l'équilibre (attentes retirées)
  _tfEl['tf-it-P'].innerHTML      = m.Pdef ? _tfFmtPression(m.Pmoy)
    : _tfNonDefini(_tfFmt(m.Pmin / 1000, 2) + ' à ' + _tfFmtPression(m.Pmax));
  _tfEl['tf-it-T'].innerHTML      = m.Tdef ? _tfFmt(m.Tmoy, 1) + ' K'
    : _tfNonDefini(_tfFmt(m.Tmin, 1) + ' à ' + _tfFmt(m.Tmax, 1) + ' K');
  _tfEl['tf-it-V'].textContent    = _tfFmt(m.V * 1000, 3) + ' L';

  // Extérieur, face au gaz, et signe entre les deux : = condition
  // d'équilibre remplie, ≠ non, ? grandeur du gaz non définie. Piston tenu
  // (le vérin équilibre le gaz quelle que soit sa pression), en butée, ou
  // fond sur l'isolant : rien à comparer.
  var src = function (t) { return ' <span class="tf-ext-src">' + t + '</span>'; };
  var sigP, sigT;
  if (tf.tenu) {
    _tfEl['tf-it-Pext'].innerHTML = src('piston tenu');
    sigP = m.Pdef ? '' : '?';
  } else {
    _tfEl['tf-it-Pext'].innerHTML = _tfFmtPression(m.Pext)
      + src(m.butee ? 'butée ' + m.butee : (tf.montage === 'masse' ? 'masses' : 'air') + ' + piston');
    sigP = !m.Pdef ? '?' : m.butee ? '' : Math.abs(m.Pmoy - m.Pext) / m.Pext < TF_SEUIL_P ? '=' : '≠';
  }
  if (tf.fond === 'isolant') {
    _tfEl['tf-it-Text'].innerHTML = src('isolant');
    sigT = m.Tdef ? '' : '?';
  } else {
    _tfEl['tf-it-Text'].innerHTML = _tfFmt(tf.Text, 1) + ' K' + src('source ' + tf.fond);
    sigT = !m.Tdef ? '?' : Math.abs(m.Tmoy - tf.Text) < TF_SEUIL_T ? '=' : '≠';
  }
  [['P', sigP], ['T', sigT]].forEach(function (q) {
    var el = _tfEl['tf-sig-' + q[0]];
    el.textContent = q[1];
    el.className = 'tf-sig' + (q[1] === '=' ? ' ok' : q[1] === '≠' ? ' non' : q[1] === '?' ? ' nd' : '');
  });
  // Voyants : mécanique (pression uniforme, gaz et piston au repos) et
  // thermique (température uniforme, égale à celle de la source)
  _tfEl['tf-voy-meca'].classList.toggle('ok', m.meca);
  _tfEl['tf-voy-th'].classList.toggle('ok', m.Tdef && (tf.fond === 'isolant' || sigT === '='));

  // Vitesse réellement tenue quand le calcul plafonne (TF_BUDGET_MS). Hors
  // mode quasi statique, la cause est physique : le calcul suit le son
  // (pas de quelques µs), soit ×3 environ au plus
  var lim = _tfEl['tf-vitesse-limite'];
  lim.style.display = tf.limite ? '' : 'none';
  if (tf.limite) {
    var atteint = '×' + _tfLibelleVitesse(+_tfVitesseAtteinte.toPrecision(2));
    lim.textContent = tf.qs ? 'Calcul trop lourd : ' + atteint + ' atteint au lieu de ×' + _tfLibelleVitesse(tf.vitesse)
                            : 'Gaz en mouvement (ondes, piston) : le calcul suit le son, ' + atteint + ' au plus';
  }

  _tfCyTic();
  _tfMajCarte();
  _tfMajJournal();
  _tfMajBilan();
  _tfMajCycle();
}

// ── Bilan (PLAN §10.6) ──
// Reçus par le gaz, pour la dernière étape (de son départ à maintenant) et
// depuis l'état initial A : W, Q, ΔU (premier principe : ΔU = W + Q, à
// l'énergie cinétique du gaz près tant qu'il bouge), variation d'entropie du
// gaz, entropie échangée avec la source Σ δQ / T_source, et entropie créée
// S_c = ΔS − Σ δQ / T_source.
var _tfBilanHtml = '';

// Entropie créée entre deux relevés du bilan : ΔS − Σ δQ / T_source
function _tfScree(b0, b1) { return b1.S - b0.S - (b1.Se - b0.Se); }

// Signe « − » seulement devant une valeur affichée non nulle (pas de « −0,00 »)
function _tfSigne(x, s) { return (x < 0 && /[1-9]/.test(s) ? '−' : '') + s; }
function _tfFmtJ(x) { return _tfSigne(x, _tfFmt(Math.abs(x), 2)) + ' J'; }
function _tfFmtmJK(x) { return _tfSigne(x, _tfFmt(Math.abs(x) * 1e3, 2)) + ' mJ/K'; }

// Vue du Bilan : 'etape' (l'étape cliquée dans la frise, la dernière
// sinon, de son départ à son arrivée ou à maintenant), 'A' (depuis l'état initial) ou 'cycle' (le dernier cycle fermé,
// ou celui de l'étape cliquée ; choisie d'elle-même quand un cycle se ferme)
var tfBilanVue = 'etape';
var _tfBilanCycleSig = '';
// J/K : en dessous, S créée est tenue pour nulle ; c'est aussi ce que
// l'affichage arrondit à 0,00 mJ/K (_tfFmtmJK) : le verdict ne dit pas
// « réversible » à côté d'une valeur non nulle
var TF_SC_REV = 5e-6;

function tfOnBilanVue(v) {
  tfBilanVue = v;
  _tfMajBilan();
}

// Égalité d'un principe : symboles, puis valeurs sous chacun
function _tfBilanEgalite(nom, sym, val, unite, classeDer) {
  var ligne = function (cells, cl) {
    return '<tr class="' + cl + '">' + cells.map(function (x, k) {
      return '<td' + (k % 2 ? ' class="op"' : k === 4 && classeDer ? ' class="' + classeDer + '"' : '') + '>' + x + '</td>';
    }).join('') + '</tr>';
  };
  return '<div class="tf-bil-nom">' + nom + '</div>'
       + '<table class="tf-bil-eq">' + ligne([sym[0], '=', sym[1], '+', sym[2]], 'sym')
       + ligne([val[0], '', val[1], '', val[2]], 'val') + '</table>'
       + '<div class="tf-bil-unite">' + unite + '</div>';
}

function _tfMajBilan() {
  var E = tfEtapes, b = tfBilan(), b0 = null, b1 = null, titreEtape = 'Étape';
  var et = E.liste[E.sel >= 0 ? E.sel : E.liste.length - 1];
  if (et) {
    var dep = et.depart !== null ? E.etats[et.depart].lettre : '?';
    var arr = et.arrivee !== null ? E.etats[et.arrivee].lettre : et.statut === 'en cours' ? '…' : '✕';
    titreEtape = 'Étape ' + dep + ' → ' + arr;
  }
  var cy = tfEtapesCycle();
  // Un cycle qui se ferme passe au premier plan
  var sigCy = cy ? cy.debut + '-' + cy.fin : '';
  if (sigCy !== _tfBilanCycleSig) { if (cy) tfBilanVue = 'cycle'; _tfBilanCycleSig = sigCy; }
  if (tfBilanVue === 'cycle' && !cy) tfBilanVue = 'etape';
  if (tfBilanVue === 'etape' && et) { b0 = et.bilan0; b1 = et.bilan1 || b; }
  else if (tfBilanVue === 'A' && E.bilanA) { b0 = E.bilanA; b1 = b; }
  else if (tfBilanVue === 'cycle') { b0 = E.liste[cy.debut].bilan0; b1 = E.liste[cy.fin].bilan1; }

  _tfEl['tf-bil-etape'].textContent = titreEtape;
  _tfEl['tf-bil-cycle'].disabled = !cy;
  _tfEl['tf-bil-cycle'].title = cy ? '' : 'Aucun cycle fermé : revenir à un état déjà noté';
  ['etape', 'A', 'cycle'].forEach(function (v) {
    _tfEl['tf-bil-' + v].classList.toggle('active', tfBilanVue === v);
  });

  var h;
  if (!b0 || !b1) {
    h = '<div class="tf-bil-vide">Aucune étape pour l’instant.</div>';
  } else {
    var W = b1.W - b0.W, Q = b1.Q - b0.Q, dU = b1.U - b0.U;
    var dS = b1.S - b0.S, Se = b1.Se - b0.Se, Sc = _tfScree(b0, b1);
    var J = function (x) { return _tfFmtJ(x).replace(' J', ''); };
    var mJK = function (x) { return _tfFmtmJK(x).replace(' mJ/K', ''); };
    var rev = Sc < TF_SC_REV;
    h = _tfBilanEgalite('1<sup>er</sup> principe', ['ΔU', 'W', 'Q'], [J(dU), J(W), J(Q)], 'en J')
      + _tfBilanEgalite('2<sup>e</sup> principe', ['ΔS', 'S<sub>e</sub>', 'S<sub>c</sub>'],
                        [mJK(dS), mJK(Se), mJK(Sc)], 'en mJ/K', 'sc')
      + '<div class="tf-bil-verdict ' + (rev ? 'rev' : 'irr') + '">'
      + (rev ? 'S<sub>c</sub> ≈ 0 : réversible' : 'S<sub>c</sub> &gt; 0 : irréversible') + '</div>';
  }
  if (h !== _tfBilanHtml) {
    _tfBilanHtml = h;
    _tfEl['tf-bilan'].innerHTML = h;
  }
  _tfMajBilanCycle(tfBilanVue === 'cycle' ? cy : null);
  var enCours = tfBilanVue === 'etape' && et && et.statut === 'en cours';
  _tfEl['tf-bilan-note'].textContent = enCours ? 'Étape en cours : valeurs à cet instant.' : '';
}

// Bilan d'un cycle fermé, en phrases : moteur (W < 0) et son rendement,
// comparé à celui de Carnot entre les températures extrêmes des sources
// touchées ; récepteur (W > 0) et ses efficacités
var _tfBilanCycleHtml = '';

function _tfFmtRatio(x) { return _tfFmt(x, 2); }

function _tfMajBilanCycle(cy) {
  var h = '';
  if (cy) {
    var E = tfEtapes, b0 = E.liste[cy.debut].bilan0, b1 = E.liste[cy.fin].bilan1;
    var W = b1.W - b0.W, Qabs = b1.Qabs - b0.Qabs, Qced = Qabs - (b1.Q - b0.Q);
    var Tmin = Infinity, Tmax = -Infinity;
    for (var k = cy.debut; k <= cy.fin; k++) {
      var et = E.liste[k];
      if (et.TsMin !== undefined) { Tmin = Math.min(Tmin, et.TsMin); Tmax = Math.max(Tmax, et.TsMax); }
    }
    h = '<b>Cycle ' + tfEtapesLettresCycle(cy) + '</b><br>';
    if (Qabs < 1e-6 || Math.abs(W) < 0.01 * Qabs) {
      h += 'Travail net presque nul (W = ' + _tfFmtJ(W) + ' pour ' + _tfFmtJ(Qabs)
         + ' de chaleur absorbée) : ni moteur ni récepteur.';
    } else if (W < 0) {
      h += 'Moteur : le gaz fournit ' + _tfFmtJ(-W) + ' pour ' + _tfFmtJ(Qabs) + ' de chaleur absorbée.<br>'
         + 'Rendement η = −W / Q<sub>abs</sub> = <b>' + _tfFmtRatio(-W / Qabs) + '</b>';
      if (Tmax - Tmin > 0.5) h += ' ; Carnot entre ' + Math.round(Tmin) + ' et ' + Math.round(Tmax) + ' K : '
         + _tfFmtRatio(1 - Tmin / Tmax);
      h += '.';
    } else {
      h += 'Récepteur : le gaz reçoit ' + _tfFmtJ(W) + ', absorbe ' + _tfFmtJ(Qabs) + ' et cède '
         + _tfFmtJ(Qced) + '.<br>Efficacité frigorifique Q<sub>abs</sub> / W = <b>' + _tfFmtRatio(Qabs / W)
         + '</b> ; de pompe à chaleur Q<sub>cédée</sub> / W = <b>' + _tfFmtRatio(Qced / W) + '</b>.';
    }
  }
  if (h === _tfBilanCycleHtml) return;
  _tfBilanCycleHtml = h;
  _tfEl['tf-bilan-cycle'].innerHTML = h;
  _tfEl['tf-bilan-cycle'].style.display = h ? '' : 'none';
}

// ── Journal des étapes (tf-etapes.js) ──
// Reconstruit seulement quand son contenu change (les clics ne se perdent
// pas) ; défile jusqu'à la dernière étape quand une étape s'ajoute.
var _tfJournalHtml = '', _tfJournalNb = 0;

function _tfFmtEtat(L) {
  return '<span class="tf-etat-val">' + _tfFmt(L.V * 1000, 3) + ' L · ' + _tfFmt(L.P / 1000, 1) + ' kPa · '
       + _tfFmt(L.T, 1) + ' K</span>';
}

function _tfBoutonRevenir(i) {
  var l = tfEtapes.etats[i].lettre;
  return '<button class="tf-revenir" title="Revenir à l’état ' + l + '" '
       + 'onclick="event.stopPropagation(); tfOnRevenir(' + i + ')">↺ ' + l + '</button>';
}

// Frise : des points (les états, comme les lettres du diagramme) reliés
// par des traits (les étapes, de leur couleur sur le diagramme ; pointillés
// si le gaz est passé par un état non défini). Un point fait passer les
// courbes de référence par son état, ↺ y revient ; un trait met l'étape en
// évidence et en fait le bilan.
var TF_PUCE_MANIERE = { brutal: 'brutale', qs: 'quasi statique', rev: 'réversible', main: 'à la main' };

function _tfPointFrise(i, coul, cycle) {
  var E = tfEtapes, L = E.etats[i];
  return '<div class="tf-f-point' + (E.selEtat === i ? ' sel' : '') + '" onclick="tfOnSelEtat(' + i + ')" '
       + 'title="Faire passer les courbes de référence par l’état ' + L.lettre + '">'
       + '<span class="tf-f-noeud" style="border-color:' + coul + '"></span>'
       + '<b class="tf-f-lettre">' + L.lettre + '</b>' + _tfFmtEtat(L)
       + (cycle ? '<span class="tf-f-cycle" title="Cycle ' + tfEtapesLettresCycle(cycle) + '">⟳ cycle</span>' : '')
       + _tfBoutonRevenir(i) + '</div>';
}

function _tfMajJournal() {
  var E = tfEtapes, h = '';
  if (E.etats.length) h += _tfPointFrise(0, TF_COUL_SANS_ETAPE);
  for (var k = 0; k < E.liste.length; k++) {
    var et = E.liste[k], detail = et.detail;
    if (et.man === 'main' && et.nbHors) detail += ' · ' + et.nbHors + ' pas hors équilibre';
    if (et.bilan1) detail += ' · S créée ' + _tfFmtmJK(_tfScree(et.bilan0, et.bilan1)).replace(' ', ' ');
    h += '<div class="tf-f-trait' + (et.nonDef || et.statut === 'interrompue' ? ' pointille' : '')
       + (E.sel === k ? ' sel' : '') + '" style="border-left-color:' + et.couleur + '" onclick="tfOnSelEtape(' + k + ')" '
       + 'title="Mettre l’étape en évidence sur le diagramme et en faire le bilan">'
       + '<div class="tf-f-titre">' + et.titre
       + (et.man ? ' <span class="tf-f-puce tf-f-' + et.man + '">' + TF_PUCE_MANIERE[et.man] + '</span>' : '') + '</div>'
       + (detail ? '<div class="tf-f-detail">' + detail.replace(/^ · /, '') + '</div>' : '') + '</div>';
    if (et.arrivee !== null) h += _tfPointFrise(et.arrivee, et.couleur, et.cycle);
    else {
      var enCours = et.statut === 'en cours';
      h += '<div class="tf-f-point tf-f-' + (enCours ? 'encours' : 'interrompu') + '">'
         + '<span class="tf-f-noeud" style="border-color:' + et.couleur + '"></span>'
         + '<span class="tf-etat-val">' + (enCours ? 'en cours…' : 'interrompue avant l’équilibre') + '</span></div>';
    }
  }
  if (h === _tfJournalHtml) return;
  _tfJournalHtml = h;
  var j = _tfEl['tf-journal'];
  j.innerHTML = h;
  if (E.liste.length > _tfJournalNb) j.scrollTop = j.scrollHeight;
  _tfJournalNb = E.liste.length;
}

// Fin des textes du journal : sur quoi le fond est posé
function _tfSuffixeFond() {
  return tf.fond === 'isolant' ? ' · isolant' : ' · source ' + tf.fond;
}

// ══════════════════════════════════════════════════════════════════════
//  Trois manières (PLAN §10.5) : la page choisit les paramètres
// ══════════════════════════════════════════════════════════════════════

// Brutalement : vérin à la vitesse de pointe la plus haute que tient le
// moteur (TF_V_VERIN_MAX) : la course dure moins qu'une traversée du son, un
// front de compression net part du piston (à 150 m/s, la course durait deux
// traversées et le gaz se comprimait presque d'un bloc). Échelon sinon.
//
// Les deux manières lentes sont réglées sur la chaleur Q qu'échangerait la
// transformation réversible (isotherme pour le volume et la pression,
// isobare ou isochore pour la température) et sur deux résistances
// thermiques en série : le gaz, R_int = TF_R_INT·π²·τ_int / (4·n·Cv) (le
// facteur, mesuré, donne l'écart de température entre tranches pour un flux
// donné ; τ_int sur la plus haute des colonnes de départ et d'arrivée), et
// la paroi du fond, 1/G.
//   - Quasi statiquement : lent devant le son et le piston (au moins
//     TF_QS_MIN, et 1,25 × TF_QS_RAMPE temps mécaniques pour une rampe de
//     pression : le mode quasi statique la suit) ; et assez lent pour que le
//     flux Q/durée laisse entre tranches moins de TF_QS_ECART (seuil de
//     « T définie » : 0,5 K). Pour le volume et la pression, si la paroi
//     limite seule le flux à G·ΔT_adiabatique sous ce seuil, la course
//     mécanique suffit : le gaz reste uniforme, l'écart de température se
//     loge dans la paroi.
//   - Réversiblement : en plus, entropie créée Q²·(R_int + 1/G) / (T²·durée)
//     sous TF_REV_SC. Mesuré, S_c décroît bien comme 1/durée, et vaut ~2,6
//     fois moins que cette estimation : une étape crée ~1 µJ/K, un cycle de
//     quatre étapes reste sous TF_SC_REV (affiché 0,00 mJ/K). Quasi
//     statiquement, un Carnot crée 0,016 mJ/K, un Stirling 0,07.
// Mesures (vérin 30 → 15 cm, PLAN §10.5) : diathermane, il faut ~6000 s
// pour que T reste définie (S_c 0,09 mJ/K) ; G = 0,001 W/K, 6000 s laissent
// T définie mais S_c = 5 mJ/K : quasi statique mais irréversible.
var TF_V_BRUTAL = TF_V_VERIN_MAX;   // m/s
var TF_QS_MIN = 1;            // s
var TF_QS_ECART = 0.25;       // K
var TF_REV_SC = 2.5e-6;       // J/K estimés par étape (~1 µJ/K mesuré)
var TF_R_INT = 0.72;

function _tfParamsManiere(cle, man) {
  var d = tfDurees(), m = tfMesures(), vise = tfCarte[cle].vise, L = tf.z[TF_N];
  if (man === 'brutal') {
    return { duree: cle === 'volume' ? Math.max(5e-4, 2 * Math.abs(vise - L) / TF_V_BRUTAL) : 0 };
  }
  var meca = cle === 'Pair' || cle === 'masse'
           ? Math.max(TF_QS_MIN, 1.25 * TF_QS_RAMPE * _tfTempsMeca(cle, vise)) : TF_QS_MIN;
  if (tf.G === 0) return { duree: meca };

  var T = m.Tmoy, nCv = tf.n * tf.Cv, Lf, Q, dTad;
  if (cle === 'volume') {
    Lf = vise;
    Q = tf.n * TF_R * T * Math.abs(Math.log(L / vise));
    dTad = T * Math.abs(Math.pow(L / vise, tf.gamma - 1) - 1);
  } else if (cle === 'Text') {
    Lf = tf.tenu ? L : L * vise / T;
    Q = Math.abs(vise - T) * (nCv + (tf.tenu ? 0 : tf.n * TF_R));
    dTad = Infinity;   // la source elle-même change : pas de limite par la paroi
  } else {
    var P = tf.tenu ? m.Pmoy : m.Pext, Pf = _tfPextVisee(cle, vise);
    Lf = L * P / Pf;
    Q = tf.n * TF_R * T * Math.abs(Math.log(Pf / P));
    dTad = T * Math.abs(Math.pow(Pf / P, (tf.gamma - 1) / tf.gamma) - 1);
  }
  var Rint = TF_R_INT * Math.PI * Math.PI * d.interne * Math.max(1, Lf / L) / (4 * nCv);
  var qs = tf.G * dTad * Rint <= TF_QS_ECART ? meca : Math.max(meca, Q * Rint / TF_QS_ECART);
  if (man === 'qs') return { duree: qs, Rint: Rint };
  return { duree: Math.max(qs, Q * Q * (Rint + 1 / tf.G) / (T * T * TF_REV_SC)), Rint: Rint };
}

// Pression extérieure une fois la masse ou P_air visée appliquée
function _tfPextVisee(cle, vise) {
  if (cle === 'Pair') return vise + (TF_M_PISTON + tf.masse) * TF_G / TF_S;
  return tf.Pair + (TF_M_PISTON + vise) * TF_G / TF_S;
}

// Titre d'une étape de la frise : le sens (Compression, Chauffage…) et la
// nature, qui découle des conditions ; sur une source, le piston ne donne
// une isotherme que lentement (sinon : monotherme)
function _tfTitreEtape(o, sens, lent) {
  return sens + ' ' + (o === 'source' ? (tf.tenu ? 'isochore' : 'isobare')
    : tf.fond === 'isolant' ? 'adiabatique' : lent ? 'isotherme' : 'monotherme');
}

// Étape d'une manière : titre, et en détail la consigne, la durée, le fond
function _tfDescManiere(cle, man, p) {
  var vise = tfCarte[cle].vise, sens, consigne;
  if (cle === 'volume') {
    sens = vise < tf.z[TF_N] ? 'Compression' : 'Détente';
    consigne = 'V → ' + _tfFmt(TF_S * vise * 1000, 3) + ' L';
  } else if (cle === 'Text') {
    sens = vise > tf.Text ? 'Chauffage' : 'Refroidissement';
    consigne = 'T_source → ' + Math.round(vise) + ' K';
  } else {
    sens = _tfPextVisee(cle, vise) > (tf.tenu ? tfMesures().Pmoy : tfPext()) ? 'Compression' : 'Détente';
    consigne = (cle === 'masse' ? 'masse → ' : 'P_air → ') + _tfFmtValeur(cle, vise).replace(/ \(.*\)$/, '');
  }
  return {
    titre: _tfTitreEtape(cle === 'Text' ? 'source' : 'piston', sens, man !== 'brutal'),
    detail: consigne + (p.duree > 0 ? ' · ' + _tfFmtDuree(p.duree) : '') + _tfSuffixeFond(),
    man: man
  };
}

// Durées écrites sur les boutons. Quand réversiblement ne fait rien de plus
// que quasi statiquement (isolant, ou même durée), le bouton le dit d'un
// signe « = » plutôt que par une phrase.
function _tfMajManieres() {
  var cle = _tfCle(), txt = {};
  ['brutal', 'qs', 'rev'].forEach(function (man) {
    var p = _tfParamsManiere(cle, man);
    txt[man] = p.duree > 0 ? _tfFmtDuree(p.duree) : cle === 'masse' ? 'd’un coup' : 'échelon';
  });
  if (cle !== 'Text' && (tf.G === 0 || txt.rev === txt.qs)) txt.rev = '= quasi statique';
  ['brutal', 'qs', 'rev'].forEach(function (man) { _tfEl['tf-duree-' + man].textContent = txt[man]; });
}

// Dernière action lancée, pour la barre de progression : manière, grandeur,
// valeur de départ
var _tfLance = null;
var TF_NOM_MANIERE = { brutal: 'Brutale', qs: 'Quasi statique', rev: 'Réversible' };

// Lance l'action de la carte de la manière choisie : 'brutal', 'qs' ou 'rev'
function tfLancerManiere(man) {
  if (tfEnCours() || _tfEnAttente) return;
  var cle = _tfCle(), vise = tfCarte[cle].vise, p = _tfParamsManiere(cle, man);
  var desc = _tfDescManiere(cle, man, p);
  _tfLance = { man: man, cle: cle, v0: _tfActuelle(cle) };
  _tfLancerApresRalenti(cle, vise, p.duree, function () {
    _tfLance.v0 = _tfActuelle(cle);
    _tfOuvrirEtape(desc);
    if (cle === 'volume') {
      tfLancerVerin(vise, p.duree);
    } else {
      tfAppliquer(cle, vise, p.duree, 0, p.duree > 0);   // échelon ou rampe continue
      if (cle !== 'Text') tfSetTenu(false);
    }
    tfCarte[cle].suit = true;
    _tfApresLancer(cle, p.duree);
  });
}

// Fin commune des lancements : relaxation suivie, graphes, panneau
function _tfApresLancerCommun() {
  _tfDemarrerRelax();
  tfGraphReprogrammer();
  tfGraph.sale = true;
  _tfMajBoutons();
  tfMajAfficheurs();
}

// Vitesse adaptée. Gaz au repos : rien ne serait vu d'un passage
// progressif, le cran change d'un coup (dans les deux sens, signalé sur le
// compteur de la scène) et l'action part aussitôt. Gaz hors d'équilibre :
// s'il faut ralentir le temps pour voir l'action, le ralentissement se fait
// d'abord, progressivement, et l'action part ensuite (rien ne serait vu des
// premiers instants à l'ancienne vitesse) ; accélérer se fait pendant
// l'action.
function _tfLancerApresRalenti(cle, vise, duree, lancer) {
  var go = function () { lancer(); _tfApresLancerCommun(); };
  if (!tfCarte.auto || tf.paused) { go(); return; }
  var D = _tfDureePrevue(cle, vise, duree);
  if (!isFinite(D) || D <= 0) { go(); return; }
  var i = tfCranVitesse(D / TF_ECRAN_ACTION);
  if (tfMesures().equilibre) { _tfSauterCran(i); go(); return; }
  if (TF_VITESSES[i] < tf.vitesse * (1 - 1e-9)) {
    _tfVersCran(i, go);
    _tfMajBoutons();
  } else {
    go();
  }
}

// Durée de l'action avant de la lancer (_tfDureeAction l'évalue une fois
// lancée) : course du vérin, ou consigne appliquée le temps du calcul
function _tfDureePrevue(cle, vise, duree) {
  if (cle === 'volume') {
    var z = tf.z[TF_N];
    return Math.abs(vise - z) > 1e-6 ? tfTauEffectif(z, vise, duree) : duree;
  }
  var sauve = tf[cle], tenu = tf.tenu;
  tf[cle] = vise;
  if (cle !== 'Text') tf.tenu = false;
  var D = _tfDureeAction(cle, duree);
  tf[cle] = sauve;
  tf.tenu = tenu;
  return D;
}

// Changement du fond ({fond}) ou du piston ({tenir}) qui laisse le gaz dans
// son état d'équilibre : fond posé sur l'isolant ou sur une source à la
// température du gaz, piston tenu au repos, ou libéré quand le gaz équilibre
// déjà la pression extérieure (ou le pousse contre une butée). Aucune étape
// n'est alors ouverte : le chrono reste figé, les graphes n'avancent pas.
// Seuils de tfEtapesSuivre (étape retirée du journal si rien n'a changé).
function _tfSansEffet(chgt) {
  var der = tfEtapes.liste[tfEtapes.liste.length - 1];
  if (tfEnCours() || (der && der.statut === 'en cours')) return false;
  var m = tfMesures();
  if (!m.equilibre) return false;
  if ('fond' in chgt) return chgt.fond === 'isolant' || Math.abs(tfTSource(chgt.fond) - m.Tmoy) < 0.01;
  if (chgt.tenir) return true;
  var zN = tf.z[TF_N];
  return Math.abs(m.Pmoy - m.Pext) < 1e-4 * m.Pext
      || (zN >= TF_H_CYL - 1e-9 && m.Pmoy >= m.Pext)
      || (zN <= TF_Z_BUTEE + 1e-9 && m.Pmoy <= m.Pext);
}

// Ouvre une étape avant une action : le chrono des graphes repart et l'état
// de départ est enregistré
function _tfOuvrirEtape(desc) {
  tfGraphDegeler();
  tfEtapeNouvelle(desc);
  tfGraphDepartEtape();
  tfGraphDureeAttendue(_tfDureeAction(null, 0));
}

// Action lancée : l'axe des temps des graphes prend sa durée attendue (quel
// que soit le cran), le cran de vitesse s'y adapte si la case est cochée
function _tfApresLancer(cle, duree, repos) {
  var D = _tfDureeAction(cle, duree);
  tfGraphDureeAttendue(D);
  if (tfCarte.auto) _tfVitesseAdaptee(D, repos);
}

// Partie de la carte qui suit l'état du gaz : valeur actuelle, arrivée
// prévue, durées des manières, boutons, action en cours
function _tfMajCarte() {
  var cle = _tfCle();

  _tfMajChampVise();
  _tfMajPrevu(cle);
  _tfMajMain();
  _tfMajSelEtat(cle);
  _tfMajFond();
  _tfMajManieres();
  _tfMajBoutonsCarte();
}

// Lancer : une action à la fois, et seulement si elle change quelque chose.
// Pendant une action (lancée en mode Viser), les trois manières laissent
// place à une barre de progression et au bouton ■ qui l'interrompt.
function _tfMajBoutonsCarte() {
  var cle = _tfCle(), enCours = tfEnCours() || !!_tfEnAttente;
  var rien = Math.abs(tfCarte[cle].vise - _tfActuelle(cle)) < 1e-6;
  var sansEffet = cle === 'Text' && tf.G === 0;
  ['brutal', 'qs', 'rev'].forEach(function (man) {
    _tfEl['tf-btn-' + man].disabled = enCours || rien || sansEffet;
  });
  _tfEl['tf-btn-annuler'].disabled = tfEtapesEtatAnnuler() === null;
  _tfMajProgres(enCours);
}

// Barre de progression : fraction faite, manière, temps (simulé) restant
function _tfMajProgres(enCours) {
  var visible = enCours && tfCarte.mode === 'viser';
  _tfEl['tf-progres'].style.display = visible ? '' : 'none';
  _tfEl['tf-manieres'].style.display = visible ? 'none' : '';
  if (!visible) return;
  var frac = 0, reste = null, L = _tfLance;
  if (_tfEnAttente) {
    _tfEl['tf-progres-txt'].textContent = 'Le temps ralentit avant l’action…';
    _tfEl['tf-progres-rempli'].style.width = '0%';
    return;
  }
  if (tf.verin.actif) {
    frac = (tf.t - tf.verin.t0) / tf.verin.tau;
    reste = tf.verin.t0 + tf.verin.tau - tf.t;
  } else {
    for (var c in tf.rampes) {
      var r = tf.rampes[c];
      if (!r.actif) continue;
      if (r.continu) {
        frac = (tf.t - r.t0) / r.duree;
        reste = r.t0 + r.duree - tf.t;
      } else {
        var v0 = L && L.cle === c ? L.v0 : tf[c];
        frac = Math.abs(r.cible - v0) > 1e-12 ? 1 - Math.abs(r.cible - tf[c]) / Math.abs(r.cible - v0) : 1;
        reste = (Math.round(Math.abs(r.cible - tf[c]) / r.pas)) * r.periode;
      }
    }
  }
  frac = _tfBorner(frac, 0, 1);
  _tfEl['tf-progres-rempli'].style.width = (100 * frac).toFixed(1) + '%';
  _tfEl['tf-progres-txt'].textContent = (L ? TF_NOM_MANIERE[L.man] : 'En cours')
    + (reste !== null ? ' · reste ' + _tfFmtDuree(Math.max(0, reste)) : '');
}

// ── État des boutons et des onglets ──
function _tfMajBoutons() {
  var bp = _tfEl['tf-btn-playpause'];
  if (tf.paused) { bp.textContent = '▶ Reprendre'; bp.className = 'btn btn-play'; }
  else           { bp.textContent = '⏸ Pause';     bp.className = 'btn btn-pause'; }

  _tfEl['tf-piston-tenu'].classList.toggle('active', tf.tenu);
  _tfEl['tf-piston-libre'].classList.toggle('active', !tf.tenu);

  var cle = _tfCle(), o = _tfOrgane(), viser = tfCarte.mode === 'viser';
  _tfMajResume();

  // Mode : Viser une valeur ou À la main
  _tfEl['tf-mode-viser'].classList.toggle('active', viser);
  _tfEl['tf-mode-main'].classList.toggle('active', !viser);
  _tfEl['tf-viser'].style.display = viser ? '' : 'none';
  _tfEl['tf-main'].style.display = viser ? 'none' : '';

  // Choix de l'organe, toujours visible ; sur l'isolant, seul le piston
  // peut agir : la source est grisée
  var isolant = tf.fond === 'isolant', bs = _tfEl['tf-organe-source'];
  bs.disabled = isolant;
  bs.title = isolant ? 'Posez le cylindre sur une source (Conditions)' : '';
  _tfEl['tf-organe-piston'].classList.toggle('active', o === 'piston');
  _tfEl['tf-organe-source'].classList.toggle('active', o === 'source');

  // Champ de la valeur visée : libellé et unité de la grandeur
  var V = TF_VISEE[cle];
  _tfEl['tf-lbl-vise'].textContent = V.nom;
  _tfEl['tf-unite-vise'].textContent = V.unite;
  _tfMajChampVise(true);

  // Curseurs du pas des organes, crans de leur grandeur
  _tfEl['tf-main-sl-piston'].value = tfCarte[_tfCleOrgane('piston')].iPas;
  _tfEl['tf-main-sl-source'].value = tfCarte.Text.iPas;
  _tfMajMain();

  tfRepereVisee = viser && cle === 'volume';
  tf.hVisee = tfCarte.volume.vise;
  tf.needsRedraw = true;
  _tfMajBoutonsCarte();
}

// ══════════════════════════════════════════════════════════════════════
//  Gestionnaires (appelés depuis index.html)
// ══════════════════════════════════════════════════════════════════════

function tfBasculerPause() {
  tf.paused = !tf.paused;
  _tfMajBoutons();
}

function tfReinitialiser() {
  // Dispositif et point de départ A réglés dans la section État initial
  tf.gamma = tfDepart.gamma;
  tf.P0 = tfDepart.P0; tf.V0 = tfDepart.V0; tf.T0 = tfDepart.T0;
  tfCarte.moyen = tf.montage = tfDepart.montage;
  _tfRelax = null;
  _tfAnnulerAttente();
  tfPapFin();
  _tfSuivreTout();
  tfReset();
  tfMolInit();
  tfEtapesEffacer();
  tfGraphEffacer();
  tfCyclesRaz(0);
  _tfMajBoutons();
  _tfMajDepart(true);
  tfMajAfficheurs();
}

// Curseur Vitesse : le cran choisi s'applique aussitôt (un passage
// progressif en cours s'arrête, une action qui attendait part)
function tfOnVitesse(val) {
  _tfArreterRampeV();
  _tfFixerVitesse(TF_VITESSES[parseInt(val, 10)]);
  tfGraph.sale = true;
  tfMajAfficheurs();
}

// Curseur bougé à la main : le cran choisi l'emporte, Auto se coupe (il
// reprendrait sinon la main à la phase suivante)
function tfOnVitesseCurseur(val) {
  if (tfCarte.auto) tfOnVitesseAuto(false);
  tfOnVitesse(val);
}

function tfBasculerAuto() { tfOnVitesseAuto(!tfCarte.auto); }

function tfOnVitesseAuto(coche) {
  tfCarte.auto = coche;
  _tfEl['tf-btn-auto'].classList.toggle('active', coche);
  if (!coche) {
    _tfArreterRampeV();
    _tfFixerVitesse(TF_VITESSES[tfCranVitesse(tf.vitesse)]);
    tfMajAfficheurs();
  }
}

// Vitesse effective : libellé, curseur au cran le plus proche, pas
// d'échantillonnage des graphes (l'axe des temps, lui, ne dépend pas du cran)
function _tfFixerVitesse(v) {
  var i = tfCranVitesse(v), changeCran = i !== tfCranVitesse(tf.vitesse);
  tf.vitesse = v;
  _tfEl['tf-sl-vitesse'].value = i;
  _tfEl['tf-lbl-vitesse'].textContent = _tfLibelleVitesse(v);
  if (changeCran) { tfGraph.sale = true; tfGraphReprogrammer(); }
  tf.needsRedraw = true;   // compteur de temps de la scène
}

// ── Fond posé sur l'isolant ou sur une source (un état, pas une action) ──
// Le cylindre change de support : des échanges peuvent commencer (sans
// étape ni chrono qui repart si rien ne change, _tfSansEffet ; changé de nouveau avant
// l'équilibre, une seule étape « Fond »). Posé sur une source qui n'est pas
// à la température du gaz, le temps s'adapte à la mise en équilibre
// thermique.
function tfOnFond(f) {
  if (f === tf.fond) return;
  var nom = f === 'isolant' ? { titre: 'Fond sur l’isolant', detail: '' }
          : { titre: _tfTitreEtape('source', tfTSource(f) > tfMesures().Tmoy ? 'Chauffage' : 'Refroidissement'),
              detail: 'fond sur la source ' + f + ' ('
                    + _tfFmtValeur('Text', tfTSource(f)).replace(/ \(.*\)$/, '') + ')' };
  if (_tfPret && !_tfSansEffet({ fond: f })) {
    var der = tfEtapes.liste[tfEtapes.liste.length - 1];
    if (tfEnCours()) tfGraphDegeler();
    else if (der && der.fond && der.statut === 'en cours') {
      der.titre = nom.titre; der.detail = nom.detail; tfEtapes.version++; tfGraphDegeler();
    }
    else { _tfOuvrirEtape(nom); tfEtapes.liste[tfEtapes.liste.length - 1].fond = true; }
  }
  var repos = !tfEnCours() && tfMesures().equilibre;
  tfSetFond(f);
  if (_tfPret && f !== 'isolant') {
    _tfDemarrerRelax();
    if (Math.abs(tf.Text - tfMesures().Tmoy) > TF_SEUIL_T) _tfApresLancer('Text', 0, repos);
  }
  tfGraph.sale = true;
  _tfMajBoutons();
  tfMajAfficheurs();
}

// Température d'une source : la flèche ▾ de son onglet déroule un menu
// (− champ +, « = T gaz »), refermé par la flèche, Échap ou un clic
// ailleurs. Chaque réglage s'applique aussitôt. La source sous le cylindre
// ne s'y règle pas (Agir sur Température) : son champ est grisé.
// « = T gaz » prend la température exacte du gaz : y poser le cylindre
// n'amène aucun saut.
var TF_PAS_T_SOURCE = 10;   // K, boutons − et +
var _tfPopSource = null;    // source dont le menu est déroulé

function tfBasculerSource(f, ev) {
  if (ev) ev.stopPropagation();
  if (_tfPopSource === f) { tfFermerSource(); return; }
  _tfPopSource = f;
  _tfEl['tf-pop-source'].style.display = '';
  _tfMajPopSource(true);
  _tfMajFond();
  if (tf.fond !== f) { _tfEl['tf-in-source'].focus(); _tfEl['tf-in-source'].select(); }
}

function tfFermerSource() {
  if (!_tfPopSource) return;
  _tfPopSource = null;
  _tfEl['tf-pop-source'].style.display = 'none';
  _tfMajFond();
}

function _tfFixerTSource(T) {
  var f = _tfPopSource;
  if (!f || f === tf.fond || isNaN(T)) return;
  tf['T' + f] = _tfBorner(T, TF_T_SOURCE_MIN, TF_T_SOURCE_MAX);
  _tfMajPopSource(true);
  tfMajAfficheurs();
}

function tfOnTSourceSaisie(val) {
  _tfFixerTSource(_tfLireNombre(val));
  _tfMajPopSource(true);
}

// − et + : vers la dizaine de kelvins voisine
function tfOnTSourcePM(sens) {
  if (!_tfPopSource) return;
  var v = tfTSource(_tfPopSource) / TF_PAS_T_SOURCE;
  _tfFixerTSource(TF_PAS_T_SOURCE * (sens > 0 ? Math.floor(v + 1e-6) + 1 : Math.ceil(v - 1e-6) - 1));
}

function tfOnSourceTgaz() { _tfFixerTSource(tfMesures().Tmoy); }

function _tfMajPopSource(force) {
  var f = _tfPopSource;
  if (!f) return;
  var dessous = tf.fond === f, inp = _tfEl['tf-in-source'];
  _tfEl['tf-pop-nom'].textContent = 'Source ' + f;
  inp.disabled = _tfEl['tf-pop-moins'].disabled = _tfEl['tf-pop-plus'].disabled
    = _tfEl['tf-pop-tgaz'].disabled = dessous;
  if (force || document.activeElement !== inp) inp.value = _tfFmtChamp(tfTSource(f), 2);
  _tfEl['tf-pop-note'].textContent = dessous ? 'Sous le cylindre : elle se règle dans Transformation (agir sur la source).' : '';
}

// Onglets du fond et températures des sources (celle sous le cylindre suit
// Text, que l'action Température fait varier)
function _tfMajFond() {
  ['isolant', '1', '2'].forEach(function (f) {
    _tfEl['tf-fond-' + f].classList.toggle('active', tf.fond === f);
    if (f === 'isolant') return;
    _tfEl['tf-t-' + f].textContent = _tfFmtChamp(tfTSource(f), 2) + ' K';
    _tfEl['tf-fleche-' + f].classList.toggle('active', tf.fond === f);
    _tfEl['tf-fleche-' + f].classList.toggle('ouvert', _tfPopSource === f);
  });
  _tfMajPopSource();
}

// Tenir ou libérer le piston, à tout moment (libérer arrête le vérin)
function tfOnPiston(tenir) {
  if (tenir !== tf.tenu) tfBasculerPiston();
}

function tfBasculerPiston() {
  if (!_tfSansEffet({ tenir: !tf.tenu })) {
    var m = tfMesures();
    _tfOuvrirEtape(tf.tenu
      ? { titre: _tfTitreEtape('piston', m.Pmoy > m.Pext ? 'Détente' : 'Compression', false), detail: 'piston libéré' }
      : { titre: 'Piston tenu', detail: '' });
  }
  tfSetTenu(!tf.tenu);
  _tfDemarrerRelax();
  _tfMajBoutons();
  tfMajAfficheurs();
}

// Organe visé (mode Viser) : le piston ou la source sous le cylindre
function tfOnOrgane(o) {
  tfCarte.organe = o;
  _tfMajBoutons();
  tfMajAfficheurs();
}

// Mode : viser une valeur, ou agir à la main pas à pas
function tfOnMode(m) {
  if (m === tfCarte.mode) return;
  tfCarte.mode = m;
  tfPapFin();
  _tfMajBoutons();
  tfMajAfficheurs();
}

// ── Valeur visée : champ, − et +, valeurs des états du journal ──
function _tfSuivreTout() {
  ['volume', 'masse', 'Pair', 'Text'].forEach(function (c) { tfCarte[c].suit = true; });
}

// Fixe la valeur visée de la grandeur de la carte (elle ne suit plus l'état)
function _tfViser(v) {
  var cle = _tfCle(), V = TF_VISEE[cle];
  tfCarte[cle].vise = _tfBorner(v, V.min, V.max);
  tfCarte[cle].suit = false;
  if (cle === 'volume') { tf.hVisee = tfCarte.volume.vise; tf.needsRedraw = true; }
}

// Champ : valeur actuelle tant qu'on n'y touche pas ; pas réécrit pendant
// la saisie (force : changement de grandeur, − ou +)
function _tfMajChampVise(force) {
  var cle = _tfCle(), k = tfCarte[cle], inp = _tfEl['tf-in-vise'];
  if (k.suit) k.vise = _tfActuelle(cle);
  if (cle === 'volume') { tf.hVisee = k.vise; tf.needsRedraw = true; }
  if (force || document.activeElement !== inp) inp.value = _tfFmtChamp(k.vise * TF_VISEE[cle].f, TF_VISEE[cle].dec);
  inp.disabled = cle === 'Text' && tf.fond === 'isolant';
}

// Saisie : prise en compte à chaque frappe si la valeur est dans les bornes
// (prévision à jour), bornée et réécrite à la validation
function tfOnSaisieVise(val, fin) {
  var cle = _tfCle(), V = TF_VISEE[cle], x = _tfLireNombre(val) / V.f;
  if (!isNaN(x) && (fin || (x >= V.min && x <= V.max))) _tfViser(x);
  if (fin) _tfMajChampVise(true);
  tfMajAfficheurs();
}

// − et + : vers la graduation voisine (1 cm, 5 kg, 10 kPa, 10 K)
function tfOnPlusMoins(sens) {
  var cle = _tfCle(), V = TF_VISEE[cle], v = tfCarte[cle].vise / V.pas;
  _tfViser(V.pas * (sens > 0 ? Math.floor(v + 1e-6) + 1 : Math.ceil(v - 1e-6) - 1));
  _tfMajChampVise(true);
  tfMajAfficheurs();
  return true;
}

// Valeur d'une grandeur dans un état du journal (température : celle du
// gaz, pour y ramener la source)
function _tfValeurEtat(cle, L) {
  if (cle === 'volume') return L.V / TF_S;
  if (cle === 'Text') return L.T;
  return L.snap[cle];
}

// Menu des états du journal, reconstruit quand le journal ou la grandeur
// change (pas pendant qu'il est ouvert)
var _tfSelEtatSig = '';

function _tfMajSelEtat(cle) {
  var sel = _tfEl['tf-sel-etat'], E = tfEtapes;
  var sig = cle + '|' + E.version + '|' + E.etats.length;
  if (sig === _tfSelEtatSig || document.activeElement === sel) return;
  _tfSelEtatSig = sig;
  var V = TF_VISEE[cle], h = '<option value="">État</option>';
  for (var i = 0; i < E.etats.length; i++) {
    var L = E.etats[i];
    if (!L.snap || L.retour !== undefined) continue;
    h += '<option value="' + i + '">' + L.lettre + ' : '
       + _tfFmtChamp(_tfValeurEtat(cle, L) * V.f, V.dec) + ' ' + V.unite + '</option>';
  }
  sel.innerHTML = h;
  sel.value = '';
}

function tfOnCopierEtat(i) {
  var L = tfEtapes.etats[parseInt(i, 10)];
  if (L) {
    _tfViser(_tfValeurEtat(_tfCle(), L));
    _tfMajChampVise(true);
  }
  _tfEl['tf-sel-etat'].value = '';
  tfMajAfficheurs();
}

// ── Arrivée prévue de l'action préparée ──
// Calculée pour le gaz parfait à partir de l'état moyen actuel :
//   - fond sur une source : l'état final est le même quelle que soit la
//     manière (température de la source, volume ou pression imposés) ;
//   - fond sur l'isolant : loi de Laplace réversiblement ; brutalement,
//     premier principe sous la pression finale constante pour la pression
//     (n·Cv·(Tf − T) = −Pf·(Vf − V)) ; pour le volume, un peu plus chaud que
//     la loi de Laplace (entropie créée par le front), non chiffré.
// Rien pendant une action, ni si l'action ne changerait rien.
var _tfPrevuSig = '';

function _tfPrevoir(cle) {
  var m = tfMesures(), n = tf.n, R = TF_R, g = tf.gamma, Cv = tf.Cv;
  var T = m.Tmoy, V = m.V, S = tfEntropie(), vise = tfCarte[cle].vise;
  var Vmax = TF_S * TF_H_CYL, Vmin = TF_S * TF_Z_BUTEE;
  var pt = function (Tf, Vf, nom) {
    return { T: Tf, V: Vf, P: n * R * Tf / Vf, nom: nom,
             S: S + n * Cv * Math.log(Tf / T) + n * R * Math.log(Vf / V) };
  };
  var source = tf.fond !== 'isolant', Vf, Pf, Tf;
  if (cle === 'Text') {
    if (!source) return [];
    return [tf.tenu ? pt(vise, V, '') : pt(vise, _tfBorner(n * R * vise / m.Pext, Vmin, Vmax), '')];
  }
  if (cle === 'volume') {
    Vf = TF_S * vise;
    if (source) return [pt(tf.Text, Vf, '')];
    return [pt(T * Math.pow(V / Vf, g - 1), Vf, 'réversible')];
  }
  Pf = _tfPextVisee(cle, vise);
  if (source) return [pt(tf.Text, _tfBorner(n * R * tf.Text / Pf, Vmin, Vmax), '')];
  // Isolant : en butée, le piston s'arrête avant (adiabatique jusqu'à la
  // butée, réversiblement) ; brutalement, non chiffré
  Tf = T * Math.pow(Pf / m.Pmoy, (g - 1) / g);
  Vf = n * R * Tf / Pf;
  var res = [Vf > Vmax ? pt(T * Math.pow(V / Vmax, g - 1), Vmax, 'réversible')
                       : pt(Tf, Math.max(Vf, Vmin), 'réversible')];
  Tf = (n * Cv * T + Pf * V) / (n * (Cv + R));
  Vf = n * R * Tf / Pf;
  if (Pf > 0 && Vf <= Vmax && Vf >= Vmin) res.push(pt(Tf, Vf, 'brutal'));
  return res;
}

function _tfMajPrevu(cle) {
  var k = tfCarte[cle], enCours = tfEnCours() || !!_tfEnAttente;
  var rien = Math.abs(k.vise - _tfActuelle(cle)) < 1e-6 * Math.max(1, Math.abs(k.vise));
  var P = enCours || rien || tfCarte.mode !== 'viser' ? [] : _tfPrevoir(cle);
  var fmt = function (p) {
    return '<b>' + _tfFmt(p.V * 1000, 3) + ' L · ' + _tfFmt(p.P / 1000, 1) + ' kPa · ' + _tfFmt(p.T, 1) + ' K</b>';
  };
  // La nature de la transformation (elle découle des conditions), puis
  // l'arrivée (réversible si elle dépend de la manière) et l'arrivée
  // brutale quand elle est chiffrée
  var h = '';
  if (P.length) {
    var o = _tfOrgane(), m = tfMesures();
    var sens = o === 'source' ? (k.vise > tf.Text ? 'Chauffage ' : 'Refroidissement ')
             : (P[0].V < m.V ? 'Compression ' : 'Détente ');
    h = '<span class="tf-nature">' + sens + _tfNature(o) + '</span><br>→ ' + fmt(P[0]);
    if (P[1]) h += '<br>brutalement → ' + fmt(P[1]);
  }
  var sig = h;
  if (sig === _tfPrevuSig) return;
  _tfPrevuSig = sig;
  _tfEl['tf-prevu'].innerHTML = h;
  tfGraph.prevu = P.map(function (p) {
    return { V: p.V, P: p.P, T: p.T, S: p.S, nom: p.nom === 'brutal' ? 'brutal' : 'prévu' };
  });
  tfGraph.sale = true;
}

// ── Boutons maintenus : répétés ──
// − et + de la valeur visée ; boutons d'un pas, à la main : un grain de
// sable, un pas de P_air, un pas du vérin (rapide) ou un échelon de la
// source sous le cylindre. Chaque pas est une petite transformation
// brutale ; les pas successifs sur la même grandeur font une seule étape du
// journal, même si le gaz atteint l'équilibre entre deux.
var TF_PAP_DELAI = 400, TF_PAP_PERIODE = 150;   // ms réelles
var _tfPap = null;   // {minuterie}

function _tfRepeter(agir, ev) {
  if (ev && ev.button) return;   // bouton principal seulement
  if (ev) ev.preventDefault();   // ni focus ni sélection de texte
  tfPapFin();
  if (!agir()) return;
  _tfPap = { t: setTimeout(function () {
    if (!_tfPap) return;
    // Un pas refusé pendant que le vérin finit le précédent : on réessaie
    _tfPap.t = setInterval(function () {
      if (!agir() && !tf.verin.actif) tfPapFin();
    }, TF_PAP_PERIODE);
  }, TF_PAP_DELAI) };
}

function tfPmDebut(sens, ev) {
  _tfRepeter(function () { return tfOnPlusMoins(sens); }, ev);
}

function tfMainDebut(o, sens, ev) {
  _tfRepeter(function () { return _tfPapPas(o, sens); }, ev);
}

function tfMainClavier(o, sens, ev) {
  if (ev && ev.detail !== 0) return;
  _tfPapPas(o, sens);
}

// Curseur du pas d'un organe (crans 1-2-5)
function tfOnPasMain(o, val) {
  tfCarte[_tfCleOrgane(o)].iPas = parseInt(val, 10);
  _tfMajMain();
}

function tfPapFin() {
  if (!_tfPap) return;
  clearTimeout(_tfPap.t);
  clearInterval(_tfPap.t);
  _tfPap = null;
}

// Clavier (Entrée, Espace sur le bouton) : une fois ; le clic de la
// souris, lui, est déjà compté au pointerdown
function tfPmClavier(sens, ev) {
  if (ev && ev.detail !== 0) return;
  tfOnPlusMoins(sens);
}

// Un pas sur l'organe o ('piston' ou 'source'). Compte les pas de l'étape
// et ceux faits sans attendre l'équilibre (affichés sous les organes).
function _tfPapPas(o, sens) {
  if (tfEnCours() || _tfEnAttente) return false;
  if (o === 'source' && tf.fond === 'isolant') return false;
  var cle = _tfCleOrgane(o), pas = _tfPas(cle), V = TF_VISEE[cle], v = _tfActuelle(cle);
  var cible = Math.round(_tfBorner(v + sens * pas, V.min, V.max) * 1e6) / 1e6;
  if (Math.abs(cible - v) < 1e-9) return false;
  var eq = tfMesures().equilibre;
  var E = tfEtapes, der = E.liste[E.liste.length - 1];
  if (der && der.pap === cle) {
    tfEtapeRouvrir();
    tfGraphDegeler();
  } else {
    _tfOuvrirEtape({ titre: '', detail: '' });
    der = E.liste[E.liste.length - 1];
    der.pap = cle;
    der.v0 = v;
    der.nbPas = der.nbHors = 0;
  }
  der.nbPas++;
  if (!eq) der.nbHors++;
  tfGraphMarche();
  if (cle === 'volume') {
    tfLancerVerin(cible, Math.max(5e-4, 2 * Math.abs(cible - v) / TF_V_BRUTAL));
  } else if (cle === 'Text') {
    tfAppliquer('Text', cible, 0);
  } else {
    _tfFixer(cle, cible, true);   // un grain : du sable, pas un bloc
    tfSetTenu(false);
  }
  var dsc = _tfDescPap(cle, der.v0, cible, der.nbHors);
  der.titre = dsc.titre; der.detail = dsc.detail; der.man = dsc.man;
  E.version++;
  tfCarte[cle].suit = true;
  _tfDemarrerRelax();
  tfGraph.sale = true;
  _tfMajBoutons();
  tfMajAfficheurs();
  return true;
}

// ── Mode À la main : voyant d'équilibre et cartes des organes ──
// Le voyant dit quand faire le pas suivant : un pas fait avant l'équilibre
// rend le chemin non défini (la transformation n'est plus quasi statique).
var TF_NOM_ORGANE = { volume: 'Vérin', masse: 'Sable', Pair: 'Air de l’enceinte' };

// Libellé d'un bouton d'un pas : flèche du vérin, ou signe − (-1) ou +
// (1) remonté par le CSS, puis le pas ; réécrit seulement s'il change
function _tfLibPas(id, signe, lib) {
  var b = _tfEl[id];
  var h = (typeof signe === 'string' ? signe + ' '
          : '<span class="tf-signe" aria-hidden="true">' + (signe > 0 ? '+' : '−') + '</span>') + lib;
  if (b.dataset.lib === h) return;
  b.dataset.lib = h;
  b.innerHTML = h;
  b.setAttribute('aria-label', (typeof signe === 'string' ? '' : signe > 0 ? '+ ' : '− ') + lib);
}

function _tfMajMain() {
  if (tfCarte.mode !== 'main') return;
  var m = tfMesures(), eq = m.equilibre;
  var voy = _tfEl['tf-voyant'];
  voy.classList.toggle('eq', eq);
  _tfEl['tf-voyant-txt'].textContent = eq ? 'Équilibre : pas suivant possible'
                                          : 'Hors équilibre : attendre le vert';

  // Piston : vérin (tenu), air ou sable (libre)
  var cle = _tfCleOrgane('piston'), pas = _tfPas(cle), lib = _tfFmtPas(cle, pas);
  _tfEl['tf-main-nom-piston'].textContent = TF_NOM_ORGANE[cle];
  _tfEl['tf-main-nature-piston'].textContent = _tfNature('piston');
  _tfEl['tf-main-val-piston'].textContent = cle === 'volume' ? _tfFmt(tf.z[TF_N] * 100, 1) + ' cm'
    : cle === 'Pair' ? _tfFmt(tf.Pair / 1000, 1) + ' kPa' : _tfFmt(tf.masse, 2) + ' kg';
  _tfLibPas('tf-main-moins-piston', cle === 'volume' ? '▼' : -1, lib);
  _tfLibPas('tf-main-plus-piston', cle === 'volume' ? '▲' : 1, lib);
  _tfEl['tf-main-moins-piston'].title = cle === 'volume' ? 'Descendre le piston (compression)'
    : cle === 'masse' ? 'Retirer un grain de sable' : 'Diminuer la pression de l’air';
  _tfEl['tf-main-plus-piston'].title = cle === 'volume' ? 'Monter le piston (détente)'
    : cle === 'masse' ? 'Verser un grain de sable' : 'Augmenter la pression de l’air';

  // Source : seulement si le cylindre est posé sur l'une d'elles
  var src = tf.fond !== 'isolant', libT = _tfFmtPas('Text', _tfPas('Text'));
  _tfEl['tf-carte-source'].classList.toggle('inactif', !src);
  _tfEl['tf-main-nom-source'].textContent = src ? 'Source ' + tf.fond : 'Source';
  _tfEl['tf-main-nature-source'].textContent = src ? _tfNature('source') : '';
  _tfEl['tf-main-val-source'].textContent = src ? _tfFmt(tf.Text, 1) + ' K' : '';
  _tfLibPas('tf-main-moins-source', -1, libT);
  _tfLibPas('tf-main-plus-source', 1, libT);
  _tfEl['tf-main-moins-source'].disabled = _tfEl['tf-main-plus-source'].disabled = !src;
  _tfEl['tf-main-sl-source'].disabled = !src;
  _tfEl['tf-main-note-source'].style.display = src ? 'none' : '';

  // Pas de l'étape en cours
  var E = tfEtapes, der = E.liste[E.liste.length - 1], txt = '';
  if (der && der.pap && der.nbPas) {
    txt = 'Étape en cours : ' + der.nbPas + ' pas';
    if (der.nbHors) txt += ', dont ' + der.nbHors + ' sans attendre l’équilibre';
  }
  _tfEl['tf-main-compte'].textContent = txt;
}

function _tfDescPap(cle, v0, v, nbHors) {
  var d, sens = cle === 'Text' ? (v >= v0 ? 'Chauffage' : 'Refroidissement')
    : (cle === 'volume' ? v < v0 : v >= v0) ? 'Compression' : 'Détente';
  if (cle === 'masse') {
    var nb = Math.round(Math.abs(v - v0) / _tfPas('masse'));
    d = 'Sable ' + (v >= v0 ? 'versé' : 'retiré') + ' grain à grain (' + nb + (nb > 1 ? ' grains' : ' grain')
      + ' de ' + _tfFmtPas('masse', _tfPas('masse')) + ')';
  } else {
    var nom = { volume: 'Hauteur', Pair: 'P_air', Text: 'T_source' }[cle];
    d = nom + ' pas à pas (' + (v >= v0 ? '+' : '−') + _tfFmtPas(cle, Math.abs(v - v0)) + ')';
  }
  return { titre: _tfTitreEtape(cle === 'Text' ? 'source' : 'piston', sens, !nbHors),
           detail: d + _tfSuffixeFond(), man: 'main' };
}

// Interrompre pendant le ralentissement qui précède une action : elle ne
// part pas
function tfOnInterrompre() {
  if (_tfEnAttente) _tfAnnulerAttente();
  tfInterrompre();
  _tfMajBoutons();
  tfMajAfficheurs();
}

// ── Journal : mise en évidence d'une étape, retour à un état ──
function tfOnSelEtape(k) {
  tfEtapesSelectionner(k);
  tfBilanVue = 'etape';
  _tfMajJournal();
  _tfMajBilan();
}

function tfOnSelEtat(i) {
  tfEtapesSelectionnerEtat(i);
  _tfMajJournal();
}

// ↶ Annuler l'étape : retour à l'état de départ de la dernière étape (une
// action en cours est abandonnée)
function tfOnAnnuler() {
  var i = tfEtapesEtatAnnuler();
  if (i !== null) tfOnRevenir(i);
}

function tfOnRevenir(i) {
  _tfRelax = null;
  _tfAnnulerAttente();
  tfPapFin();
  tfEtapesRevenir(i);
  tfCyclesRaz(i);
  _tfSuivreTout();
  tfMolInit();
  _tfMajBoutons();
  tfMajAfficheurs();
}

// Vitesse adaptée (§10.3) : le cran dont la durée de l'action, vue à
// l'écran, est la plus proche de quelques secondes. Durée de l'action :
// course du vérin, escalier, retour au repos du piston (pression brutale)
// ou mise en équilibre thermique (température brutale).
var TF_ECRAN_ACTION = 5;   // s réelles visées

// repos : le gaz était au repos avant l'action, le cran change d'un coup
function _tfVitesseAdaptee(D, repos) {
  if (!isFinite(D) || D <= 0) return;
  var i = tfCranVitesse(D / TF_ECRAN_ACTION);
  if (repos) _tfSauterCran(i); else _tfVersCran(i);
}

// Changement de cran d'un coup (gaz au repos) : le compteur de la scène le
// signale un instant (tfChrono.saut, date du saut)
function _tfSauterCran(i) {
  _tfRampeV = null;
  tfChrono.sens = 0;
  if (Math.abs(Math.log(TF_VITESSES[i] / tf.vitesse)) < 1e-6) return;
  _tfFixerVitesse(TF_VITESSES[i]);
  tfChrono.saut = performance.now();
}

// ── Passage progressif d'une vitesse à l'autre ──
// Passer d'un coup de ×1/1000 (oscillations du piston) à ×500 (équilibre
// thermique) ne se voit pas. La vitesse va donc de l'une à l'autre en
// progression géométrique adoucie (logarithme lissé, départ et arrivée en
// douceur), d'autant plus longtemps que l'écart compte de
// décades : ~0,7 s par décade pour accélérer (de 0,8 à 3,5 s), ~0,45 s pour
// ralentir avant une action (de 0,8 à 2 s), qui attend la fin du
// ralentissement. Le compteur de temps de la scène (tf-scene.js) montre
// l'un et l'autre.
var TF_RAMPE_MONTE   = { parDecade: 0.7,  min: 0.8, max: 3.5 };   // s réelles
var TF_RAMPE_DESCEND = { parDecade: 0.45, min: 0.8, max: 2 };
var _tfRampeV = null;      // { v0, v1, t, duree } (t et duree en s réelles)
var _tfEnAttente = null;   // action lancée à la fin du ralentissement

// Vers le cran i, progressivement ; apres : appelée une fois la vitesse
// atteinte. En pause, la vitesse change d'un coup (rien ne défile).
function _tfVersCran(i, apres) {
  var v1 = TF_VITESSES[i];
  if (_tfRampeV && _tfRampeV.v1 === v1 && !apres) return;
  var r = Math.abs(Math.log(v1 / tf.vitesse)) / Math.LN10;   // décades
  if (tf.paused || r < 1e-6) {
    _tfRampeV = null;
    tfChrono.sens = 0;
    _tfFixerVitesse(v1);
    if (apres) apres();
    return;
  }
  var p = v1 > tf.vitesse ? TF_RAMPE_MONTE : TF_RAMPE_DESCEND;
  _tfRampeV = { v0: tf.vitesse, v1: v1, t: 0,
                duree: Math.max(p.min, Math.min(p.max, p.parDecade * r)) };
  _tfEnAttente = apres || null;
  tfChrono.sens = v1 > tf.vitesse ? 1 : -1;
}

// Cran visé : celui d'arrivée d'un passage progressif en cours
function tfCranVise() {
  return tfCranVitesse(_tfRampeV ? _tfRampeV.v1 : tf.vitesse);
}

// Appelée à chaque image hors pause, avec la durée réelle écoulée (s)
function _tfAvancerRampeV(dt) {
  var R = _tfRampeV;
  if (!R) return;
  R.t += dt;
  var s = Math.min(1, R.t / R.duree);
  if (s < 1) {
    // Lissage : 0 → 1, pentes nulles aux deux bouts
    var e = s * s * (3 - 2 * s);
    _tfFixerVitesse(R.v0 * Math.pow(R.v1 / R.v0, e));
    return;
  }
  _tfFixerVitesse(R.v1);
  _tfArreterRampeV();
  tfMajAfficheurs();
}

// Fin (ou arrêt) du passage progressif : l'action qui attendait part
function _tfArreterRampeV() {
  _tfRampeV = null;
  tfChrono.sens = 0;
  var f = _tfEnAttente;
  _tfEnAttente = null;
  if (f) f();
}

// Réinitialisation, retour à un état : l'action qui attendait ne part pas
// (le passage de vitesse, lui, se poursuit)
function _tfAnnulerAttente() {
  if (!_tfEnAttente) return;
  _tfEnAttente = null;
  _tfMajBoutons();
}

// Durée simulée de ce qu'il y a à voir d'une action lancée (s). cle null :
// action sans consigne (piston saisi ou lâché, fond changé), le retour au
// repos du piston.
function _tfDureeAction(cle, duree) {
  var d = tfDurees(), D;
  if (cle === 'volume') D = tf.verin.actif ? tf.verin.tau : duree;
  else if (duree > 0) D = duree;
  // Échelon de température : retour à l'équilibre, exponentiel, jusqu'à un
  // écart de la moitié du seuil
  else if (cle === 'Text') D = d.thermique * Math.log(Math.max(2, Math.abs(tf.Text - tfMesures().Tmoy) / (TF_SEUIL_T / 2)));
  // Échelon de P_air sur la membrane nue : le front traverse le gaz en
  // ~1 ms, c'est lui qu'on veut voir. Une traversée : le cran le plus lent
  // (×1/5000) quelle que soit la hauteur, même gaz froid sous 50 cm, ~4 s
  // d'écran par traversée à 30 cm (avec 10 traversées, ×1/1000 : moins
  // d'une seconde)
  else if (cle === 'Pair' && tf.masse === 0) D = d.traversee;
  else D = 16 * d.piston;
  return D;
}

// ── Vitesse adaptée pendant le retour à l'équilibre ──
// Le cran choisi au lancement montre le phénomène rapide (front, ondes,
// oscillations du piston) ; il resterait sinon pour l'amortissement des
// ondes puis la mise en équilibre thermique, qui durent des secondes à des
// heures simulées. Une fois l'action finie et TF_ECRAN_FRONT secondes
// d'écran passées, le cran monte (jamais ne descend) pour que le reste du
// retour à l'équilibre dure ~TF_ECRAN_ACTION à l'écran, en deux temps :
// d'abord les ondes ou le piston à amortir, tant que le gaz n'est pas à
// l'équilibre mécanique ; puis, une fois celui-ci atteint et vu à l'écran
// TF_ECRAN_MECA secondes (le piston s'est arrêté), l'écart de température à
// résorber (exponentiel, jusqu'à la moitié du seuil « T définie »).
// L'amortissement des ondes ou du piston peut durer bien plus que prévu
// (jusqu'à 18 s d'écran à ×1/100) : au-delà de TF_ECRAN_MECA_MAX secondes
// d'écran sans repos mécanique, le temps accélère d'un cran (jusqu'à ×1).
// Chaque phase est nommée sur le compteur de la scène (tfPhaseAuto).
var TF_ECRAN_FRONT    = 3;   // s réelles
var TF_ECRAN_MECA     = 1;   // s réelles
var TF_ECRAN_MECA_MAX = 6;   // s réelles
var _tfRelax = null;      // { ecran, tPrec, meca, attente } jusqu'au retour à l'équilibre

function _tfDemarrerRelax() {
  _tfRelax = tfCarte.auto ? { ecran: 0, tPrec: tf.t, meca: 0, attente: 0 } : null;
}

// Phase que suit la vitesse adaptée ('' : Auto coupé, ou gaz au repos)
function tfPhaseAuto() {
  if (!tfCarte.auto) return '';
  if (_tfEnAttente) return 'avant l’action';
  if (tfEnCours()) return 'pendant l’action';
  var R = _tfRelax;
  if (!R) return '';
  return R.meca > 0 ? 'équilibre thermique' : tf.tenu ? 'ondes' : 'ondes et piston';
}

function _tfVitesseRelax() {
  var R = _tfRelax;
  if (!R) return;
  if (!tfCarte.auto) { _tfRelax = null; return; }
  if (_tfEnAttente) return;   // une action attend la fin d'un ralentissement
  if (tfEnCours()) { R.ecran = 0; R.meca = 0; R.attente = 0; R.tPrec = tf.t; return; }
  var dEcran = (tf.t - R.tPrec) / tf.vitesse;
  R.ecran += dEcran;
  R.tPrec = tf.t;
  var m = tfMesures();
  if (m.equilibre) { _tfRelax = null; return; }
  // Temps d'écran passé à l'équilibre mécanique. Pendant la mise en
  // équilibre thermique, le piston suit lentement le gaz qui se dilate ou se
  // contracte : le critère strict clignote. Seul un écart net (cinq fois les
  // seuils : le piston oscille encore) remet le compte à zéro.
  var presque = (m.Pmax - m.Pmin) / m.Pmoy < 5 * TF_SEUIL_P
             && (tf.tenu || m.butee !== null || Math.abs(m.Pmoy - m.Pext) / m.Pext < 5 * TF_SEUIL_P);
  if (m.meca) R.meca += dEcran;
  else if (!presque) R.meca = 0;
  if (R.ecran < TF_ECRAN_FRONT) return;
  var d = tfDurees(), D = 0;
  if (R.meca === 0) {
    // Ondes ou piston à amortir : rien de thermique encore
    if (!tf.qs) D = tf.masse > 0.5 ? 16 * d.piston : 100 * d.traversee;
    R.attente += dEcran;
    if (R.attente > TF_ECRAN_MECA_MAX) {
      R.attente = 0;
      var iv = tfCranVitesse(_tfRampeV ? _tfRampeV.v1 : tf.vitesse);
      if (iv < TF_VITESSES.indexOf(1)) { _tfVersCran(iv + 1); return; }
    }
  } else {
    if (R.meca < TF_ECRAN_MECA) return;
    var ecart = Math.max(m.Tmax - m.Tmin, tf.G > 0 ? Math.abs(m.Tmoy - tf.Text) : 0);
    if (ecart > TF_SEUIL_T / 2) {
      D = (tf.G > 0 ? d.thermique : d.interne) * Math.log(Math.max(2, ecart / (TF_SEUIL_T / 2)));
    }
  }
  if (D <= 0) return;
  // Jamais plus lent que la vitesse visée (celle d'un passage en cours)
  var i = tfCranVitesse(D / TF_ECRAN_ACTION);
  if (TF_VITESSES[i] > (_tfRampeV ? _tfRampeV.v1 : tf.vitesse)) _tfVersCran(i);
}

// ── Section État initial : dispositif (montage : air de l'enceinte ou
// masses posées ; gaz) et point de départ A (P0, V0, T0, d'où n). Les
// réglages forment un brouillon, tfDepart, appliqué aussitôt tant que le
// journal est vide, sinon au clic sur « Recommencer depuis A »
// (tfReinitialiser) : rien n'est effacé avant ──
var tfDepart = { montage: 'Pair', gamma: 1.4, P0: TF_P0, V0: TF_V0, T0: TF_T0 };
// Champs : facteur d'affichage, décimales, pas des boutons − et +
var TF_DEPART = {
  P0 : { f: 1e-3, dec: 1, pas: 10e3 },      // kPa
  V0 : { f: 1e3,  dec: 3, pas: 0.05e-3 },   // L
  T0 : { f: 1,    dec: 2, pas: 10 }         // K
};

function _tfBornesDepart(cle) {
  if (cle === 'P0') return tfBornesP0(tfDepart.montage);
  if (cle === 'V0') return [0.10 * TF_S, 0.45 * TF_S];   // hauteur 10 à 45 cm
  return [250, 600];
}

function _tfDepartModifie() {
  var D = tfDepart;
  return D.montage !== tf.montage || Math.abs(D.gamma - tf.gamma) > 1e-9
    || Math.abs(D.P0 - tf.P0) > 1e-6 || Math.abs(D.V0 - tf.V0) > 1e-12 || Math.abs(D.T0 - tf.T0) > 1e-9;
}

// Brouillon changé (P0 ramenée dans les bornes du montage) : appliqué tout
// de suite si aucune étape n'est faite
function _tfDepartChange() {
  var b = _tfBornesDepart('P0');
  tfDepart.P0 = _tfBorner(tfDepart.P0, b[0], b[1]);
  if (!tfEtapes.liste.length && !tfEnCours()) tfReinitialiser();
  else _tfMajDepart(true);
}

function tfOnMontage(m) {
  if (m === tfDepart.montage) return;
  tfDepart.montage = m;
  _tfDepartChange();
}

function tfOnGamma(g) {
  g = Math.round(g * 1e6) / 1e6;
  if (Math.abs(g - tfDepart.gamma) < 1e-9) return;
  tfDepart.gamma = g;
  _tfDepartChange();
}

function tfOnDepartSaisie(cle, txt) {
  var v = _tfLireNombre(txt), b = _tfBornesDepart(cle);
  if (!isNaN(v)) {
    tfDepart[cle] = _tfBorner(v / TF_DEPART[cle].f, b[0], b[1]);
    _tfDepartChange();
  }
  _tfMajDepart(true);
}

// − et + : vers le multiple du pas voisin, dans les bornes
function tfOnDepartPas(cle, sens) {
  var p = TF_DEPART[cle].pas, b = _tfBornesDepart(cle), v = tfDepart[cle] / p;
  tfDepart[cle] = _tfBorner(p * (sens > 0 ? Math.floor(v + 1e-6) + 1 : Math.ceil(v - 1e-6) - 1), b[0], b[1]);
  _tfDepartChange();
}

// Rétablir : le brouillon revient aux réglages de l'expérience en cours
function tfDepartRetablir() {
  tfDepart = { montage: tf.montage, gamma: tf.gamma, P0: tf.P0, V0: tf.V0, T0: tf.T0 };
  _tfMajDepart(true);
}

function _tfMajDepart(force) {
  var D = tfDepart, g = D.gamma;
  _tfEl['tf-montage-Pair'].classList.toggle('active', D.montage === 'Pair');
  _tfEl['tf-montage-masse'].classList.toggle('active', D.montage === 'masse');
  [['mono', 5 / 3], ['di', 1.4], ['poly', 4 / 3]].forEach(function (x) {
    document.getElementById('tf-gaz-' + x[0]).classList.toggle('active', Math.abs(g - x[1]) < 2e-3);
  });
  _tfEl['tf-gamma'].textContent = 'γ = ' + _tfFmt(g, 2);
  ['P0', 'V0', 'T0'].forEach(function (cle) {
    var inp = _tfEl['tf-in-' + cle], F = TF_DEPART[cle], b = _tfBornesDepart(cle);
    if (force || document.activeElement !== inp) inp.value = _tfFmtChamp(D[cle] * F.f, F.dec);
    _tfEl['tf-moins-' + cle].disabled = D[cle] <= b[0] * (1 + 1e-9);
    _tfEl['tf-plus-' + cle].disabled = D[cle] >= b[1] * (1 - 1e-9);
  });
  var n = D.P0 * D.V0 / (TF_R * D.T0);
  _tfEl['tf-dep-info'].textContent = 'n = ' + _tfFmt(n * 1000, 1) + ' mmol · hauteur '
    + _tfFmtChamp(D.V0 / TF_S * 100, 1) + ' cm'
    + (D.montage === 'masse' ? ' · masse posée ' + _tfFmtChamp(tfMasseDepart(D.P0), 2) + ' kg' : '');
  _tfEl['tf-dep-attente'].style.display = _tfDepartModifie() ? '' : 'none';
  _tfMajResume();
}

// Résumé de l'expérience en cours, dans le titre de la section repliée
// (✎ : réglages changés, pas encore appliqués)
function _tfMajResume() {
  var g = tf.gamma, nom = Math.abs(g - 5 / 3) < 2e-3 ? 'mono' : Math.abs(g - 1.4) < 2e-3 ? 'di'
    : Math.abs(g - 4 / 3) < 2e-3 ? 'poly' : 'γ ' + _tfFmt(g, 2);
  _tfEl['tf-resume-init'].textContent = (_tfDepartModifie() ? '✎ ' : '')
    + (tf.montage === 'masse' ? 'masses' : 'enceinte') + ' · ' + nom
    + ' · ' + _tfFmtChamp(tf.P0 / 1000, 0) + ' kPa · ' + _tfFmtChamp(tf.V0 * 1000, 2) + ' L · '
    + Math.round(tf.T0) + ' K';
}

// ── Section Affichage ──
function tfOnAffichage(cle, coche) {
  tfAff[cle] = coche;
  if (cle === 'exagere') tfMolExagere = coche;
  // Le profil de pression prend de la place à droite du cylindre
  if (cle === 'profil') _tfDoResize();
  tf.needsRedraw = true;
  tfGraph.sale = true;   // couleur des points des tranches (diagramme PV)
}

// ══════════════════════════════════════════════════════════════════════
//  Boucle d'animation
//  Ne calcule que si l'onglet est affiché (ongletPrincipal, défini par
//  ui.js) : l'autre onglet garde son état figé.
// ══════════════════════════════════════════════════════════════════════

var _tfLastTs = null;
var _tfVitesseAtteinte = 1;   // temps simulé / temps réel, lissé sur ~1 s

function _tfLoop(ts) {
  requestAnimationFrame(_tfLoop);
  if (ongletPrincipal !== 'transformations') { _tfLastTs = null; return; }
  if (_tfLastTs === null) { _tfLastTs = ts; return; }

  var dtReel = Math.min(ts - _tfLastTs, 50);   // ms, plafonné
  _tfLastTs = ts;

  if (!tf.paused) {
    _tfAvancerRampeV(dtReel / 1000);
    var dtSim = tfAvancer(dtReel / 1000 * tf.vitesse);
    if (dtReel > 0) _tfVitesseAtteinte += (dtSim / (dtReel / 1000) - _tfVitesseAtteinte) * Math.min(1, dtReel / 1000);
    // Agitation des molécules en temps d'affichage, la même à tous les
    // crans (tf-molecules.js)
    if (tfAff.molecules) {
      tfMolAvancer(dtReel / 1000, tfLargeurDessinee(),
                   tfRayonMolecule() / (_tfX2 - _tfX1), _tfEch, tfAff.chocs);
    }
  }

  _tfAffTimer += dtReel;
  if (_tfAffTimer >= TF_AFF_PERIODE) {
    _tfAffTimer = 0;
    tfMajAfficheurs();
  }

  if (tf.needsRedraw) {
    tfDessiner();
    tf.needsRedraw = false;
  }
  tfGraphDessiner();
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation (appelée par ui.js)
// ══════════════════════════════════════════════════════════════════════

function tfInit() {
  for (var i = 0; i < _TF_EL_IDS.length; i++) {
    _tfEl[_TF_EL_IDS[i]] = document.getElementById(_TF_EL_IDS[i]);
  }
  // Réglages initiaux du panneau (un rechargement peut avoir conservé
  // d'anciennes positions des curseurs)
  tfReset();
  tfOnVitesse(TF_VITESSES.indexOf(1));
  _tfEl['tf-btn-auto'].classList.toggle('active', tfCarte.auto);
  tf.montage = tfDepart.montage = tfCarte.moyen;
  for (var cle in tfAff) {
    document.getElementById('tf-ck-' + cle).checked = tfAff[cle];
  }
  _tfMajDepart(true);
  _tfMajFond();
  window.addEventListener('pointerup', tfPapFin);
  // Un clic hors du menu d'une source le referme (pas sur une flèche ▾ :
  // elle le bascule elle-même) ; Échap aussi
  document.addEventListener('pointerdown', function (ev) {
    if (_tfPopSource && !_tfEl['tf-pop-source'].contains(ev.target)
        && !(ev.target.closest && ev.target.closest('.tf-fleche'))) tfFermerSource();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') tfFermerSource();
  });
  window.addEventListener('pointercancel', tfPapFin);
  window.addEventListener('blur', tfPapFin);

  tfMolInit();
  tfEtapesEffacer();
  tfGraphInit();
  tfCyclesInit();
  _tfDoResize();
  _tfMajBoutons();
  tfMajAfficheurs();
  _tfPret = true;
  requestAnimationFrame(_tfLoop);
}
