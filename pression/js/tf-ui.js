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
  'tf-it-t', 'tf-it-P', 'tf-it-T', 'tf-it-V', 'tf-it-Pext', 'tf-it-Pext-lbl', 'tf-it-etat',
  'tf-btn-playpause', 'tf-sl-vitesse', 'tf-lbl-vitesse', 'tf-vitesse-limite', 'tf-ck-vitesse-auto',
  'tf-piston-tenu', 'tf-piston-libre',
  'tf-fond-isolant', 'tf-fond-chaude', 'tf-fond-froide', 'tf-in-chaude', 'tf-in-froide',
  'tf-tgaz-chaude', 'tf-tgaz-froide', 'tf-hint-fond',
  'tf-tab-volume', 'tf-tab-pression', 'tf-tab-temperature', 'tf-hint-actuel',
  'tf-lbl-vise', 'tf-in-vise', 'tf-unite-vise', 'tf-sel-etat', 'tf-prevu',
  'tf-pap', 'tf-pap-moins', 'tf-pap-plus', 'tf-btn-annuler', 'tf-nom-pas',
  'tf-montage-Pair', 'tf-montage-masse',
  'tf-sl-duree', 'tf-lbl-duree', 'tf-duree-allongee',
  'tf-row-pas', 'tf-sl-pas', 'tf-lbl-pas', 'tf-hint-escalier',
  'tf-ro-regime', 'tf-durees-car', 'tf-btn-lancer', 'tf-btn-interrompre', 'tf-en-cours',
  'tf-journal', 'tf-ckg-gel',
  'tf-btn-brutal', 'tf-btn-qs', 'tf-btn-rev', 'tf-duree-brutal', 'tf-duree-qs', 'tf-duree-rev',
  'tf-hint-manieres', 'tf-bilan', 'tf-bilan-note',
  'tf-sl-gamma', 'tf-lbl-gamma', 'tf-sl-T0', 'tf-lbl-T0', 'tf-sl-V0', 'tf-lbl-V0'
];

// Vrai une fois tfInit terminée : les réglages initiaux du panneau
// n'ouvrent pas d'étape
var _tfPret = false;

// ══════════════════════════════════════════════════════════════════════
//  Carte « Transformation » (PLAN_TRANSFORMATIONS.md §10.3, §10.7)
//  Une grandeur visée parmi quatre : hauteur du piston ('volume'), masse
//  posée ('masse'), pression de l'air de l'enceinte ('Pair'), température de
//  la source en contact ('Text'). Le montage (section Montage et gaz) décide
//  si la pression passe par la masse ou par l'air de l'enceinte. Chacune
//  garde sa valeur visée, sa durée et la hauteur de ses marches ; tant
//  qu'on n'y touche pas (suit), la valeur visée est la valeur actuelle.
// ══════════════════════════════════════════════════════════════════════

var TF_PAS_ESC = {
  masse : [0.005, 0.01, 0.02, 0.05, 0.1],        // kg : masse d'un grain de sable (pas à pas)
  Pair  : [500, 1000, 2000, 5000, 10000],        // Pa
  Text  : [0.5, 1, 2, 5, 10]                     // K
};

var tfCarte = {
  action : 'volume',     // onglet : 'volume', 'pression' ou 'temperature'
  moyen  : 'Pair',       // montage : pression par 'Pair' (enceinte) ou 'masse'
  auto   : true,         // vitesse adaptée à chaque transformation
  // Valeur visée (SI), suivie de la valeur actuelle tant qu'on n'y touche
  // pas, cran de durée, cran de la hauteur des marches (et du pas à pas)
  volume : { vise: 0.15,     suit: true, iDuree: 8, iPas: 2 },
  masse  : { vise: 20,       suit: true, iDuree: 0, iPas: 3 },
  Pair   : { vise: 2e5,      suit: true, iDuree: 0, iPas: 1 },
  Text   : { vise: 400,      suit: true, iDuree: 0, iPas: 1 }
};

// Champ de la valeur visée, par grandeur : libellé, unité affichée et son
// facteur (SI × f), décimales, pas des boutons − et +, bornes (SI)
var TF_VISEE = {
  volume : { nom: 'Hauteur visée', unite: 'cm', f: 100, dec: 1, pas: 0.01,
             min: TF_H_VISEE_MIN, max: TF_H_VISEE_MAX },
  masse  : { nom: 'Masse posée visée', unite: 'kg', f: 1, dec: 2, pas: 5, min: 0, max: TF_MASSE_MAX },
  Pair   : { nom: 'Pression de l’air de l’enceinte visée', unite: 'kPa', f: 1e-3, dec: 1, pas: 1e4, min: 0, max: 5e5 },
  Text   : { nom: 'Température visée de la source', unite: 'K', f: 1, dec: 1, pas: 10, min: 250, max: 600 }
};
var TF_T_SOURCE_MIN = 250, TF_T_SOURCE_MAX = 600;   // K

function _tfBorner(x, a, b) { return Math.max(a, Math.min(b, x)); }

// Nombre saisi au clavier, virgule ou point décimal ; NaN sinon
function _tfLireNombre(txt) {
  var t = String(txt).replace(/\s/g, '').replace(',', '.');
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t) ? parseFloat(t) : NaN;
}

// Valeur d'un champ : virgule décimale, sans zéros inutiles (30 ; 101,3)
function _tfFmtChamp(x, dec) {
  return String(+x.toFixed(dec)).replace('.', ',');
}

// Grandeur visée par l'action choisie
function _tfCle() {
  if (tfCarte.action === 'volume') return 'volume';
  if (tfCarte.action === 'temperature') return 'Text';
  return tfCarte.moyen;
}

// Durées proposées pour cette grandeur : celles du vérin pour le volume,
// celles d'un escalier (0 = échelon) sinon
function _tfDureesDe(cle) { return cle === 'volume' ? TF_DUREES : TF_DUREES_ESC; }
function _tfDuree(cle) { return _tfDureesDe(cle)[tfCarte[cle].iDuree]; }
function _tfPas(cle) { return TF_PAS_ESC[cle][tfCarte[cle].iPas]; }

// Valeur actuelle de la grandeur visée
function _tfActuelle(cle) { return cle === 'volume' ? tf.z[TF_N] : tf[cle]; }

// ══════════════════════════════════════════════════════════════════════
//  Formatage (virgule décimale)
// ══════════════════════════════════════════════════════════════════════

function _tfFmt(x, d) { return x.toFixed(d).replace('.', ','); }

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
    return Math.abs(x - TF_P_ATM) < 1 ? '101,3 kPa (atmosphère)' : _tfFmt(x / 1000, x % 1000 ? 1 : 0) + ' kPa';
  }
  return _tfFmt(x, x % 1 ? 1 : 0) + ' K (' + Math.round(x - 273.15) + ' °C)';
}

function _tfFmtPas(cle, x) {
  if (cle === 'masse') return Math.round(x * 1000) + ' g';
  if (cle === 'Pair')  return _tfFmt(x / 1000, x < 1000 ? 1 : 0) + ' kPa';
  return _tfFmt(x, x < 1 ? 1 : 0) + ' K';
}

// Libellé d'une durée τ : 0,5 ms, 2 ms, 500 ms, 1 s, 60 s
function _tfLibelleDuree(t) {
  if (t < 0.001) return _tfFmt(t * 1000, 1) + ' ms';
  return t < 1 ? Math.round(t * 1000) + ' ms' : String(t) + ' s';
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
  _tfEl['tf-it-t'].textContent    = _tfFmtTemps(Math.max(0, tfGraphTemps()));
  _tfEl['tf-it-P'].innerHTML      = m.Pdef ? _tfFmtPression(m.Pmoy)
    : _tfNonDefini(_tfFmt(m.Pmin / 1000, 2) + ' à ' + _tfFmtPression(m.Pmax));
  _tfEl['tf-it-T'].innerHTML      = m.Tdef ? _tfFmt(m.Tmoy, 1) + ' K'
    : _tfNonDefini(_tfFmt(m.Tmin, 1) + ' à ' + _tfFmt(m.Tmax, 1) + ' K');
  _tfEl['tf-it-V'].textContent    = _tfFmt(m.V * 1000, 3) + ' L';
  // Piston tenu : la pression extérieure ne fixe pas l'équilibre ; le vérin
  // mesure la pression du gaz sur le piston
  _tfEl['tf-it-Pext-lbl'].textContent = tf.tenu ? 'Pression sur le piston' : 'Pression extérieure';
  _tfEl['tf-it-Pext'].textContent = _tfFmtPression(tf.tenu ? m.Pface : m.Pext);

  var etat = _tfEl['tf-it-etat'];
  etat.textContent = m.equilibre ? 'À l’équilibre' : 'Hors équilibre';
  etat.className = 'it-val ' + (m.equilibre ? 'tf-etat-eq' : 'tf-etat-hors');

  // Vitesse réellement tenue quand le calcul plafonne (TF_SOUS_PAS_MAX)
  var lim = _tfEl['tf-vitesse-limite'];
  lim.style.display = tf.limite ? '' : 'none';
  if (tf.limite) lim.textContent = 'Calcul trop lourd : ×' + _tfLibelleVitesse(+_tfVitesseAtteinte.toPrecision(2))
                                 + ' atteint au lieu de ×' + _tfLibelleVitesse(tf.vitesse);

  _tfMajCarte();
  _tfMajJournal();
  _tfMajBilan();
}

// ── Bilan (PLAN §10.6) ──
// Reçus par le gaz, pour la dernière étape (de son départ à maintenant) et
// depuis l'état initial A : W, Q, ΔU (premier principe : ΔU = W + Q, à
// l'énergie cinétique du gaz près tant qu'il bouge), variation d'entropie du
// gaz, entropie échangée avec la source Σ δQ / T_source, et entropie créée
// S_c = ΔS − Σ δQ / T_source.
var _tfBilanHtml = '';

function _tfFmtJ(x) { return (x < 0 ? '−' : '') + _tfFmt(Math.abs(x), 2) + ' J'; }
function _tfFmtmJK(x) {
  if (Math.abs(x) < 0.005e-3) x = 0;
  return (x < 0 ? '−' : '') + _tfFmt(Math.abs(x) * 1e3, 2) + ' mJ/K';
}

function _tfMajBilan() {
  var E = tfEtapes, b = tfBilan(), cols = [];
  var et = E.liste[E.liste.length - 1];
  if (et) {
    var dep = et.depart !== null ? E.etats[et.depart].lettre : '?';
    var arr = et.arrivee !== null ? E.etats[et.arrivee].lettre : et.statut === 'en cours' ? '…' : '✕';
    cols.push({ titre: 'Étape ' + dep + ' → ' + arr, b0: et.bilan0 });
  }
  if (E.bilanA) cols.push({ titre: 'Depuis A', b0: E.bilanA });
  var lignes = [
    ['W reçu', function (b0) { return _tfFmtJ(b.W - b0.W); }],
    ['Q reçue', function (b0) { return _tfFmtJ(b.Q - b0.Q); }],
    ['ΔU', function (b0) { return _tfFmtJ(b.U - b0.U); }],
    ['W + Q', function (b0) { return _tfFmtJ(b.W - b0.W + b.Q - b0.Q); }],
    ['ΔS du gaz', function (b0) { return _tfFmtmJK(b.S - b0.S); }],
    ['Σ δQ / T_source', function (b0) { return _tfFmtmJK(b.Se - b0.Se); }],
    ['S créée', function (b0) { return _tfFmtmJK(b.S - b0.S - (b.Se - b0.Se)); }, 'tf-bilan-sc']
  ];
  var h = '<tr><th></th>' + cols.map(function (c) { return '<th>' + c.titre + '</th>'; }).join('') + '</tr>';
  lignes.forEach(function (l) {
    h += '<tr' + (l[2] ? ' class="' + l[2] + '"' : '') + '><td>' + l[0] + '</td>'
       + cols.map(function (c) { return '<td>' + l[1](c.b0) + '</td>'; }).join('') + '</tr>';
  });
  if (h !== _tfBilanHtml) {
    _tfBilanHtml = h;
    _tfEl['tf-bilan'].innerHTML = h;
  }
  var enCours = et && et.statut === 'en cours';
  _tfEl['tf-bilan-note'].textContent = (enCours ? 'Étape en cours : valeurs à cet instant. ' : '')
    + 'Grandeurs reçues par le gaz. S créée = ΔS − Σ δQ / T_source : nulle pour une transformation réversible, positive sinon.';
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

function _tfMajJournal() {
  var E = tfEtapes, h = '';
  if (E.etats.length) {
    h += '<div class="tf-etape tf-etape-depart' + (E.selA ? ' sel' : '') + '" onclick="tfOnSelA()" '
       + 'title="Faire passer les courbes de référence par l’état A">'
       + '<span class="tf-pastille" style="background:' + TF_COUL_SANS_ETAPE + '"></span>'
       + '<span class="tf-etape-txt"><b>A</b> état initial<br>' + _tfFmtEtat(E.etats[0]) + '</span>'
       + _tfBoutonRevenir(0) + '</div>';
  }
  for (var k = 0; k < E.liste.length; k++) {
    var et = E.liste[k];
    var dep = et.depart !== null ? E.etats[et.depart].lettre : '?';
    var arr = et.arrivee !== null ? E.etats[et.arrivee].lettre : et.statut === 'en cours' ? '…' : '✕';
    var suite = et.arrivee !== null ? _tfFmtEtat(E.etats[et.arrivee])
              : et.statut === 'en cours' ? '<span class="tf-etat-val">en cours…</span>'
              : '<span class="tf-etat-val">interrompue avant l’équilibre</span>';
    h += '<div class="tf-etape' + (E.sel === k ? ' sel' : '') + '" onclick="tfOnSelEtape(' + k + ')" '
       + 'title="Mettre en évidence sur le diagramme">'
       + '<span class="tf-pastille" style="background:' + et.couleur + '"></span>'
       + '<span class="tf-etape-txt"><b>' + dep + ' → ' + arr + '</b> ' + et.desc + '<br>' + suite + '</span>'
       + (et.arrivee !== null ? _tfBoutonRevenir(et.arrivee) : '') + '</div>';
  }
  if (h === _tfJournalHtml) return;
  _tfJournalHtml = h;
  var j = _tfEl['tf-journal'];
  j.innerHTML = h;
  if (E.liste.length > _tfJournalNb) j.scrollTop = j.scrollHeight;
  _tfJournalNb = E.liste.length;
}

// Texte du journal pour l'action de la carte
function _tfDescAction(cle, duree) {
  var k = tfCarte[cle], d;
  if (cle === 'volume') {
    d = 'Volume → ' + _tfFmt(TF_S * k.vise * 1000, 3) + ' L en '
      + _tfFmtDuree(tfTauEffectif(tf.z[TF_N], k.vise, duree));
  } else {
    var nom = cle === 'masse' ? 'Masse' : cle === 'Pair' ? 'P_air' : 'T_source';
    d = nom + ' → ' + _tfFmtValeur(cle, k.vise).replace(/ \(.*\)$/, '') + ', '
      + (duree === 0 ? (cle === 'masse' ? 'd’un coup' : 'échelon')
                     : (cle === 'masse' ? 'sable' : 'escalier') + ' en ' + _tfFmtDuree(duree));
    if (cle === 'Text') d += tf.tenu ? ', piston tenu' : ', piston libre';
  }
  return d + _tfSuffixeFond();
}

// Fin des textes du journal : sur quoi le fond est posé
function _tfSuffixeFond() {
  return tf.fond === 'isolant' ? ' · isolant' : ' · source ' + tf.fond;
}

// ══════════════════════════════════════════════════════════════════════
//  Trois manières (PLAN §10.5) : la page choisit les paramètres
// ══════════════════════════════════════════════════════════════════════

// Brutalement : vérin à vitesse de pointe fixée (une petite course reste
// brutale, la pression du gaz n'est clairement pas définie), échelon sinon.
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
//     sous TF_REV_SC.
// Mesures (vérin 30 → 15 cm, PLAN §10.5) : diathermane, il faut ~6000 s
// pour que T reste définie (S_c 0,09 mJ/K) ; G = 0,001 W/K, 6000 s laissent
// T définie mais S_c = 5 mJ/K : quasi statique mais irréversible.
var TF_V_BRUTAL = 150;        // m/s
var TF_QS_MIN = 1;            // s
var TF_QS_ECART = 0.25;       // K
var TF_REV_SC = 2e-4;         // J/K
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

// Texte du journal : nature de la transformation, manière, consigne, durée
function _tfDescManiere(cle, man, p) {
  var vise = tfCarte[cle].vise, f, txt;
  var adjF = { brutal: 'brutale', qs: 'quasi statique', rev: 'réversible' }[man];
  var adjM = { brutal: 'brutal', qs: 'quasi statique', rev: 'réversible' }[man];
  if (cle === 'volume') {
    txt = (vise < tf.z[TF_N] ? 'Compression ' : 'Détente ') + adjF + ' (V → ' + _tfFmt(TF_S * vise * 1000, 3) + ' L';
  } else if (cle === 'Text') {
    txt = (vise > tf.Text ? 'Chauffage ' : 'Refroidissement ') + (tf.tenu ? 'isochore ' : 'isobare ') + adjM
        + ' (T_source → ' + Math.round(vise) + ' K';
  } else {
    f = tf.tenu ? tfMesures().Pmoy : tfPext();
    txt = (_tfPextVisee(cle, vise) > f ? 'Compression ' : 'Détente ') + adjF + ' ('
        + (cle === 'masse' ? 'masse → ' : 'P_air → ') + _tfFmtValeur(cle, vise).replace(/ \(.*\)$/, '');
  }
  txt += p.duree > 0 ? ', en ' + _tfFmtDuree(p.duree) + ')' : ')';
  return txt + _tfSuffixeFond();
}

// Durées écrites sur les boutons, et ce que l'isolation du fond fait des
// deux manières lentes
function _tfMajManieres() {
  var cle = _tfCle(), d = tfDurees();
  ['brutal', 'qs', 'rev'].forEach(function (man) {
    var p = _tfParamsManiere(cle, man);
    _tfEl['tf-duree-' + man].textContent = p.duree > 0 ? _tfFmtDuree(p.duree)
      : cle === 'masse' ? 'd’un coup' : 'échelon';
  });
  // « Se confondent » seulement si les deux boutons affichent la même
  // durée. Sinon, le message dépend de ce qui freine la chaleur : le gaz
  // lui-même (résistance interne R_int plus grande que celle du fond, 1/G)
  // ou le fond.
  var h, pq = _tfParamsManiere(cle, 'qs'), qs = pq.duree, rev = _tfParamsManiere(cle, 'rev').duree;
  if (cle === 'Text' && tf.G === 0) h = 'Posé sur l’isolant, le gaz ne voit aucune source : posez le cylindre sur une source pour agir sur sa température.';
  else if (tf.G === 0) h = 'Posé sur l’isolant : quasi statique et réversible se confondent (aucun échange thermique).';
  else if (_tfFmtDuree(rev) === _tfFmtDuree(qs)) h = 'Fond très conducteur : quasi statique et réversible se confondent (assez lente pour garder le gaz uniforme, la transformation l’est aussi pour le garder à la température de la source).';
  else if (tf.G * pq.Rint >= 1) h = 'Fond conducteur : quasi statiquement, le gaz reste uniforme et la transformation crée déjà peu d’entropie (le petit écart de température se loge dans le gaz, pas dans le fond) ; réversiblement, la transformation est ' + _tfFmt(rev / qs, 1) + ' fois plus lente pour en créer encore moins.';
  else h = 'Fond peu conducteur : quasi statiquement, le gaz reste uniforme mais la chaleur traverse le fond sous un écart de température : de l’entropie est créée ; réversiblement, presque pas.';
  _tfEl['tf-hint-manieres'].textContent = h;
}

// Lance l'action de la carte de la manière choisie : 'brutal', 'qs' ou 'rev'
function tfLancerManiere(man) {
  if (tfEnCours() || _tfEnAttente) return;
  var cle = _tfCle(), vise = tfCarte[cle].vise, p = _tfParamsManiere(cle, man);
  var desc = _tfDescManiere(cle, man, p), pas = cle === 'volume' ? 0 : _tfPas(cle);   // pas de marches pour le vérin
  _tfLancerApresRalenti(cle, vise, p.duree, function () {
    _tfOuvrirEtape(desc);
    if (cle === 'volume') {
      tfLancerVerin(vise, p.duree);
    } else {
      tfAppliquer(cle, vise, p.duree, pas, p.duree > 0);
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

// Vitesse adaptée : s'il faut ralentir le temps pour voir l'action, le
// ralentissement se fait d'abord, progressivement, et l'action part
// ensuite (rien ne serait vu des premiers instants à l'ancienne vitesse).
// Accélérer, en revanche, se fait pendant l'action.
function _tfLancerApresRalenti(cle, vise, duree, lancer) {
  var go = function () { lancer(); _tfApresLancerCommun(); };
  if (!tfCarte.auto || tf.paused) { go(); return; }
  var D = _tfDureePrevue(cle, vise, duree);
  if (!isFinite(D) || D <= 0) { go(); return; }
  var i = tfCranVitesse(D / TF_ECRAN_ACTION);
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
function _tfApresLancer(cle, duree) {
  var D = _tfDureeAction(cle, duree);
  tfGraphDureeAttendue(D);
  if (tfCarte.auto) _tfVitesseAdaptee(D);
}

// Partie de la carte qui suit l'état du gaz : valeur actuelle, escalier,
// régime attendu, durées caractéristiques, boutons, action en cours
function _tfMajCarte() {
  var cle = _tfCle(), k = tfCarte[cle], duree = _tfDuree(cle);
  var d = tfDurees();

  // Valeur actuelle, et ce que fera l'action au piston
  _tfMajChampVise();
  var txt = 'Actuellement : ' + _tfFmtValeur(cle, _tfActuelle(cle));
  if (cle === 'masse' && tf.masse > 0) {
    txt += ' (' + (tf.blocs > 0 ? _tfFmtValeur('masse', tf.blocs) + ' en bloc' : '')
         + (tf.blocs > 0 && tf.sable > 0 ? ', ' : '')
         + (tf.sable > 0 ? _tfFmtValeur('masse', tf.sable) + ' de sable' : '') + ')';
  }
  if (cle === 'masse' || cle === 'Pair') txt += tf.tenu ? '. Agir libère le piston.' : '.';
  if (cle === 'Text') {
    txt = tf.fond === 'isolant' ? 'Aucune source sous le fond.'
        : 'Source ' + tf.fond + ' : ' + _tfFmtValeur('Text', tf.Text)
          + (tf.tenu ? '. Piston tenu : volume constant.' : '. Piston libre : pression constante.');
  }
  _tfEl['tf-hint-actuel'].textContent = txt;
  _tfMajPrevu(cle);
  _tfMajSelEtat(cle);
  _tfMajFond();

  // Escalier : nombre de marches et rythme
  if (cle !== 'volume' && duree > 0) {
    var n = tfNbMarches(cle, k.vise, _tfPas(cle));
    _tfEl['tf-hint-escalier'].textContent = Math.abs(k.vise - tf[cle]) < 1e-9 ? 'Déjà à la valeur visée'
      : n + (n > 1 ? ' marches, une toutes les ' : ' marche, puis attente de ') + _tfFmtDuree(duree / n);
  }

  // Volume : durée allongée si la course l'exige (piston limité à TF_V_VERIN_MAX)
  var allongee = _tfEl['tf-duree-allongee'];
  var tau = cle === 'volume' ? tfTauEffectif(tf.z[TF_N], k.vise, duree) : 0;
  if (cle === 'volume' && tau > duree * 1.0001) {
    allongee.textContent = 'Course trop longue pour cette durée : portée à ' + _tfFmtDuree(tau)
                         + ' (piston limité à ' + TF_V_VERIN_MAX + ' m/s)';
    allongee.style.display = '';
  } else {
    allongee.style.display = 'none';
  }

  _tfEl['tf-ro-regime'].textContent = cle === 'volume' ? _tfRegime(d, tau) : _tfRegimeEscalier(cle, d, duree);
  _tfMajManieres();

  // Durées caractéristiques auxquelles comparer la durée choisie
  var lignes = [];
  if (cle === 'volume') lignes.push(['Traversée du gaz par le son', _tfFmtDuree(d.traversee)]);
  if (cle === 'masse' || cle === 'Pair') lignes.push(['Oscillation du piston libre (période)', _tfFmtDuree(4 * d.piston)]);
  lignes.push(['Mise en équilibre thermique', isFinite(d.thermique) ? _tfFmtDuree(d.thermique) : 'aucune (calorifugé)']);
  _tfEl['tf-durees-car'].innerHTML = lignes.map(function (l) {
    return '<div class="tf-duree-car"><span>' + l[0] + '</span><span>' + l[1] + '</span></div>';
  }).join('');

  _tfMajBoutonsCarte();
}

// Lancer : une action à la fois, et seulement si elle change quelque chose
// (une action sur la pression libère aussi le piston tenu). Interrompre :
// pendant une action.
function _tfMajBoutonsCarte() {
  var cle = _tfCle(), enCours = tfEnCours() || !!_tfEnAttente;
  var rien = Math.abs(tfCarte[cle].vise - _tfActuelle(cle)) < 1e-6
          && !((cle === 'masse' || cle === 'Pair') && tf.tenu);
  _tfEl['tf-btn-lancer'].disabled = enCours || rien;
  _tfEl['tf-btn-interrompre'].disabled = !enCours;
  var sansEffet = cle === 'Text' && tf.G === 0;
  ['brutal', 'qs', 'rev'].forEach(function (man) {
    _tfEl['tf-btn-' + man].disabled = enCours || rien || sansEffet;
  });
  _tfEl['tf-pap-moins'].disabled = _tfEl['tf-pap-plus'].disabled = enCours;
  if (enCours) tfPapFin();
  _tfEl['tf-btn-annuler'].disabled = tfEtapesEtatAnnuler() === null;

  var info = '';
  if (_tfEnAttente) {
    info = 'Le temps ralentit avant l’action…';
  } else if (tf.verin.actif) {
    info = 'Vérin en marche : encore ' + _tfFmtDuree(Math.max(0, tf.verin.t0 + tf.verin.tau - tf.t));
  } else {
    for (var c in tf.rampes) {
      var r = tf.rampes[c];
      if (!r.actif) continue;
      if (r.continu) {
        info = 'En cours : encore ' + _tfFmtDuree(Math.max(0, r.t0 + r.duree - tf.t)) + ', vers ' + _tfFmtValeur(c, r.cible);
        continue;
      }
      var reste = Math.round(Math.abs(r.cible - tf[c]) / r.pas);
      info = 'Escalier en cours : encore ' + reste + (reste > 1 ? ' marches' : ' marche')
           + ', vers ' + _tfFmtValeur(c, r.cible);
    }
  }
  _tfEl['tf-en-cours'].textContent = info;
  _tfEl['tf-en-cours'].style.display = info ? '' : 'none';
}

// Régime attendu d'une action sur le volume, de durée tau (PLAN §2.7) :
// comparée à la traversée du gaz par le son (mécanique), puis à la mise en
// équilibre thermique avec l'extérieur. Seuils mécaniques en τ / (L/c), L
// étant la plus grande des hauteurs de départ et d'arrivée (mesures du
// palier 3, 30 → 15 cm) : sous 5, un front raide (Pmax/Pmin ≥ 1,1) ; de 5 à
// 50, des ondes laissent le gaz non uniforme pendant la course (1,10 à 5,7 ;
// 1,02 à 11), état final pourtant proche du réversible ; au-delà, écarts
// sous le seuil de 0,1 % où P est définie : quasi statique.
var TF_TAU_FRONT = 5, TF_TAU_QS = 50;

function _tfRegime(d, tau) {
  // Vitesse de pointe du piston plus grande que la célérité du son : choc
  var zN = tf.z[TF_N], vise = tfCarte.volume.vise;
  var v = 2 * Math.abs(vise - zN) / tau;
  if (!tf.verin.actif && v > d.c) return 'Brutale : piston plus rapide que le son, onde de choc';
  var r = tau / (Math.max(zN, vise) / d.c);
  if (r < TF_TAU_FRONT) return 'Brutale : un front traverse le gaz';
  if (r < TF_TAU_QS) {
    return 'Rapide, non quasi statique : des ondes parcourent le gaz, non uniforme pendant la course'
         + (isFinite(d.thermique) ? ' ; échanges thermiques avec un gaz non uniforme : irréversible'
                                  : ' ; état final proche de l’adiabatique réversible');
  }
  if (!isFinite(d.thermique)) return 'Quasi statique et réversible (adiabatique)';
  // Seuil large : à 4·τ_th (60 s diathermane), l'entropie créée vaut encore
  // le tiers de celle d'une compression rapide
  if (tau < 10 * d.thermique) return 'Quasi statique mais irréversible : échanges thermiques avec un gaz non uniforme en température';
  return 'Quasi statique et presque réversible (presque isotherme)';
}

// Régime attendu d'une action sur la pression ou la température : échelon
// (durée nulle) ou escalier, dont l'écart entre marches est comparé au
// retour au repos du piston (~4 périodes d'oscillation) et à la mise en
// équilibre thermique
function _tfRegimeEscalier(cle, d, duree) {
  var vise = tfCarte[cle].vise;
  var periode = duree > 0 ? duree / tfNbMarches(cle, vise, _tfPas(cle)) : 0;
  var thermique = isFinite(d.thermique);

  if (cle === 'Text') {
    if (!thermique) return 'Sans effet : le fond est calorifugé';
    var nature = tf.tenu ? 'Isochore' : 'Isobare';
    if (duree === 0) return nature + ' brutale : le gaz chauffe par le fond, gradient de température';
    if (periode < d.thermique) return nature + ' en escalier, marches trop rapprochées : gaz non uniforme en température';
    return nature + ' quasi statique, d’autant plus proche du réversible que les marches sont petites';
  }

  if (duree === 0) return 'Brutale : le piston oscille, le système est hors équilibre'
                        + (thermique ? ', puis échanges thermiques' : '');
  if (periode < 16 * d.piston) return 'Marches trop rapprochées : le piston n’a pas le temps de s’arrêter entre deux marches';
  if (!thermique) return 'Quasi statique, proche de l’adiabatique réversible si les marches sont petites';
  if (duree < 10 * d.thermique) return 'Quasi statique mais irréversible : échanges thermiques avec un gaz non uniforme en température';
  return 'Quasi statique, proche de l’isotherme réversible';
}

// ── État des boutons et des onglets ──
function _tfMajBoutons() {
  var bp = _tfEl['tf-btn-playpause'];
  if (tf.paused) { bp.textContent = '▶ Reprendre'; bp.className = 'btn btn-play'; }
  else           { bp.textContent = '⏸ Pause';     bp.className = 'btn btn-pause'; }

  _tfEl['tf-piston-tenu'].classList.toggle('active', tf.tenu);
  _tfEl['tf-piston-libre'].classList.toggle('active', !tf.tenu);

  var a = tfCarte.action, cle = _tfCle();
  ['volume', 'pression', 'temperature'].forEach(function (x) {
    _tfEl['tf-tab-' + x].classList.toggle('active', a === x);
  });
  _tfEl['tf-montage-Pair'].classList.toggle('active', tfCarte.moyen === 'Pair');
  _tfEl['tf-montage-masse'].classList.toggle('active', tfCarte.moyen === 'masse');

  // Champ de la valeur visée : libellé et unité de la grandeur
  var V = TF_VISEE[cle];
  _tfEl['tf-lbl-vise'].textContent = V.nom;
  _tfEl['tf-unite-vise'].textContent = V.unite;
  _tfMajChampVise(true);

  // Pas à pas : pression seulement, un grain de sable ou un pas de P_air
  _tfEl['tf-pap'].style.display = a === 'pression' ? '' : 'none';
  if (a === 'pression') {
    var lib = cle === 'masse' ? '1 grain' : _tfFmtPas(cle, _tfPas(cle));
    _tfEl['tf-pap-moins'].textContent = '− ' + lib;
    _tfEl['tf-pap-plus'].textContent = '+ ' + lib;
    _tfEl['tf-pap-plus'].title = cle === 'masse' ? 'Verser un grain de sable (' + _tfFmtPas('masse', _tfPas('masse'))
                                 + ') ; maintenir pour en verser plusieurs' : 'Maintenir pour répéter';
    _tfEl['tf-pap-moins'].title = cle === 'masse' ? 'Retirer un grain de sable ; maintenir pour en retirer plusieurs'
                                  : 'Maintenir pour répéter';
  }

  // Curseur de durée : crans de la grandeur visée
  var sl = _tfEl['tf-sl-duree'];
  sl.max = _tfDureesDe(cle).length - 1;
  sl.value = tfCarte[cle].iDuree;
  _tfMajDuree();

  tfRepereVisee = cle === 'volume';
  tf.hVisee = tfCarte.volume.vise;
  tf.needsRedraw = true;
  _tfMajBoutonsCarte();
}

// Libellé de la durée, curseur des marches : escalier, et pas à pas de la
// pression (grain de sable, pas de P_air)
function _tfMajDuree() {
  var cle = _tfCle(), duree = _tfDuree(cle);
  _tfEl['tf-lbl-duree'].textContent = cle !== 'volume' && duree === 0 ? 'brutale (échelon)'
    : _tfLibelleDuree(duree);
  var esc = cle !== 'volume' && duree > 0;
  var montre = esc || cle === 'masse' || cle === 'Pair';
  _tfEl['tf-row-pas'].style.display = montre ? '' : 'none';
  _tfEl['tf-hint-escalier'].style.display = esc ? '' : 'none';
  if (montre) {
    _tfEl['tf-nom-pas'].textContent = cle === 'masse' ? 'Grain de sable (pas à pas, escalier)'
      : cle === 'Pair' ? 'Pas de P_air (pas à pas, escalier)' : 'Hauteur des marches';
    _tfEl['tf-sl-pas'].value = tfCarte[cle].iPas;
    _tfEl['tf-lbl-pas'].textContent = _tfFmtPas(cle, _tfPas(cle));
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Gestionnaires (appelés depuis index.html)
// ══════════════════════════════════════════════════════════════════════

function tfBasculerPause() {
  tf.paused = !tf.paused;
  _tfMajBoutons();
}

function tfReinitialiser() {
  _tfRelax = null;
  _tfAnnulerAttente();
  tfPapFin();
  _tfSuivreTout();
  tfReset();
  tfMolInit();
  tfEtapesEffacer();
  tfGraphEffacer();
  _tfMajBoutons();
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

function tfOnVitesseAuto(coche) {
  tfCarte.auto = coche;
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
// Le cylindre change de support : des échanges peuvent commencer (étape
// retirée du journal si rien ne change ; changé de nouveau avant
// l'équilibre, une seule étape « Fond »). Posé sur une source qui n'est pas
// à la température du gaz, le temps s'adapte à la mise en équilibre
// thermique.
function tfOnFond(f) {
  if (f === tf.fond) return;
  var nom = f === 'isolant' ? 'Fond sur l’isolant'
          : 'Fond sur la source ' + f + ' (' + _tfFmtValeur('Text', tfTSource(f)).replace(/ \(.*\)$/, '') + ')';
  if (_tfPret) {
    var der = tfEtapes.liste[tfEtapes.liste.length - 1];
    if (tfEnCours()) tfGraphDegeler();
    else if (der && der.fond && der.statut === 'en cours') { der.desc = nom; tfEtapes.version++; tfGraphDegeler(); }
    else { _tfOuvrirEtape(nom); tfEtapes.liste[tfEtapes.liste.length - 1].fond = true; }
  }
  tfSetFond(f);
  if (_tfPret && f !== 'isolant') {
    _tfDemarrerRelax();
    if (Math.abs(tf.Text - tfMesures().Tmoy) > TF_SEUIL_T) _tfApresLancer('Text', 0);
  }
  tfGraph.sale = true;
  _tfMajBoutons();
  tfMajAfficheurs();
}

// Température d'une source, saisie au clavier : seulement quand le cylindre
// n'est pas posé dessus (sinon, Agir sur Température)
function tfOnTSource(f, val) {
  var x = _tfLireNombre(val);
  if (f !== tf.fond && !isNaN(x)) tf['T' + f] = _tfBorner(x, TF_T_SOURCE_MIN, TF_T_SOURCE_MAX);
  _tfMajFond(true);
  tfMajAfficheurs();
}

// « = T gaz » : la source prend la température du gaz (exacte ; le champ
// l'arrondit) : le poser dessus n'amènera pas de saut de température
function tfOnSourceTgaz(f) {
  if (f === tf.fond) return;
  tf['T' + f] = _tfBorner(tfMesures().Tmoy, TF_T_SOURCE_MIN, TF_T_SOURCE_MAX);
  _tfMajFond(true);
  tfMajAfficheurs();
}

// Boutons du fond, températures des sources (champ verrouillé sous le
// cylindre : il suit alors Text, que l'action Température fait varier)
function _tfMajFond(force) {
  ['isolant', 'chaude', 'froide'].forEach(function (f) {
    _tfEl['tf-fond-' + f].classList.toggle('active', tf.fond === f);
    if (f === 'isolant') return;
    var inp = _tfEl['tf-in-' + f], dessous = tf.fond === f;
    inp.disabled = dessous;
    _tfEl['tf-tgaz-' + f].disabled = dessous;
    inp.title = dessous ? 'Cylindre posé sur cette source : agir sur Température pour la changer' : '';
    if (force || document.activeElement !== inp) inp.value = _tfFmtChamp(tfTSource(f), 2);
  });
  _tfEl['tf-hint-fond'].textContent = tf.fond === 'isolant'
    ? 'Fond calorifugé : aucun échange de chaleur.'
    : 'Fond diatherme : le gaz échange de la chaleur avec la source ' + tf.fond + '.';
}

// Tenir ou libérer le piston, à tout moment (libérer arrête le vérin)
function tfOnPiston(tenir) {
  if (tenir !== tf.tenu) tfBasculerPiston();
}

function tfBasculerPiston() {
  _tfOuvrirEtape(tf.tenu ? 'Piston libéré' : 'Piston tenu');
  tfSetTenu(!tf.tenu);
  _tfDemarrerRelax();
  _tfMajBoutons();
  tfMajAfficheurs();
}

function tfOnAction(a) {
  tfCarte.action = a;
  _tfMajBoutons();
  tfMajAfficheurs();
}

// Montage (section Montage et gaz) : la pression passe par l'air de
// l'enceinte ou par les masses posées ; en changer réinitialise
function tfOnMontage(m) {
  if (m === tfCarte.moyen) return;
  tfCarte.moyen = m;
  tfReinitialiser();
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
    if (!L.snap) continue;
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
  var P = enCours || rien ? [] : _tfPrevoir(cle);
  var fmt = function (p) {
    return '<b>' + _tfFmt(p.V * 1000, 3) + ' L · ' + _tfFmt(p.P / 1000, 1) + ' kPa · ' + _tfFmt(p.T, 1) + ' K</b>';
  };
  var h = '';
  if (P.length === 1 && !P[0].nom) {
    h = 'Arrivée prévue, quelle que soit la manière : ' + fmt(P[0]);
  } else if (P.length) {
    h = 'Arrivée prévue réversiblement : ' + fmt(P[0]);
    if (P[1]) h += '<br>Brutalement : ' + fmt(P[1]);
    else if (cle === 'volume') h += '<br>Brutalement : un peu plus chaud.';
    if (P[0].V >= TF_S * TF_H_CYL * (1 - 1e-9)) h += '<br>Le piston s’arrête en butée haute.';
  }
  if (cle === 'volume' && h && tf.fond !== 'isolant') h += '<br><span class="input-hint">(après la mise en équilibre thermique avec la source)</span>';
  var sig = h;
  if (sig === _tfPrevuSig) return;
  _tfPrevuSig = sig;
  _tfEl['tf-prevu'].innerHTML = h;
  tfGraph.prevu = P.map(function (p) {
    return { V: p.V, P: p.P, T: p.T, S: p.S, nom: p.nom === 'brutal' ? 'brutal' : 'prévu' };
  });
  tfGraph.sale = true;
}

// ── Pas à pas (pression) : un grain de sable ou un pas de P_air par clic ──
// Chaque clic agit aussitôt (une petite transformation brutale) ; maintenu,
// le bouton répète. Les clics successifs du même sens de pas font une
// seule étape du journal, même si le gaz atteint l'équilibre entre deux.
var TF_PAP_DELAI = 400, TF_PAP_PERIODE = 150;   // ms réelles
var _tfPap = null;   // {minuterie}

function tfPapDebut(sens, ev) {
  if (ev && ev.button) return;   // bouton principal seulement
  if (ev) ev.preventDefault();   // ni focus ni sélection de texte
  tfPapFin();
  if (!_tfPapPas(sens)) return;
  _tfPap = { t: setTimeout(function () {
    if (!_tfPap) return;
    _tfPap.t = setInterval(function () { if (!_tfPapPas(sens)) tfPapFin(); }, TF_PAP_PERIODE);
  }, TF_PAP_DELAI) };
}

function tfPapFin() {
  if (!_tfPap) return;
  clearTimeout(_tfPap.t);
  clearInterval(_tfPap.t);
  _tfPap = null;
}

// Clavier (Entrée, Espace sur le bouton) : un pas ; le clic de la souris,
// lui, est déjà compté au pointerdown
function tfPapClavier(sens, ev) {
  if (ev && ev.detail !== 0) return;
  _tfPapPas(sens);
}

function _tfPapPas(sens) {
  if (tfEnCours() || _tfEnAttente) return false;
  var cle = tfCarte.moyen, pas = _tfPas(cle), v = tf[cle];
  var cible = Math.round(_tfBorner(v + sens * pas, 0, TF_VISEE[cle].max) * 1e6) / 1e6;
  if (Math.abs(cible - v) < 1e-9) return false;
  var E = tfEtapes, der = E.liste[E.liste.length - 1];
  if (der && der.pap === cle) {
    tfEtapeRouvrir();
    tfGraphDegeler();
  } else {
    _tfOuvrirEtape('');
    der = E.liste[E.liste.length - 1];
    der.pap = cle;
    der.v0 = v;
  }
  _tfFixer(cle, cible, true);   // un grain : du sable, pas un bloc
  tfSetTenu(false);
  der.desc = _tfDescPap(cle, der.v0, cible);
  E.version++;
  tfCarte[cle].suit = true;
  _tfDemarrerRelax();
  tfGraph.sale = true;
  _tfMajBoutons();
  tfMajAfficheurs();
  return true;
}

function _tfDescPap(cle, v0, v) {
  var d;
  if (cle === 'masse') {
    var nb = Math.round(Math.abs(v - v0) / _tfPas('masse'));
    d = 'Sable ' + (v >= v0 ? 'versé' : 'retiré') + ' grain à grain (' + nb + (nb > 1 ? ' grains' : ' grain')
      + ' de ' + _tfFmtPas('masse', _tfPas('masse')) + ')';
  } else {
    d = 'P_air pas à pas (' + (v >= v0 ? '+' : '−') + _tfFmt(Math.abs(v - v0) / 1000, 1) + ' kPa)';
  }
  return d + _tfSuffixeFond();
}

function tfOnDuree(val) {
  tfCarte[_tfCle()].iDuree = parseInt(val, 10);
  _tfMajDuree();
  tfMajAfficheurs();
}

function tfOnPas(val) {
  tfCarte[_tfCle()].iPas = parseInt(val, 10);
  _tfMajBoutons();
  tfMajAfficheurs();
}

// Lance l'action de la carte. Volume : le vérin tient le piston et le mène
// à la hauteur visée. Pression : la consigne s'applique et le piston est
// libéré. Température : le piston garde son état.
function tfLancer() {
  if (tfEnCours() || _tfEnAttente) return;
  var cle = _tfCle(), vise = tfCarte[cle].vise, duree = _tfDuree(cle);
  var desc = _tfDescAction(cle, duree), pas = cle === 'volume' ? 0 : _tfPas(cle);   // pas de marches pour le vérin
  _tfLancerApresRalenti(cle, vise, duree, function () {
    _tfOuvrirEtape(desc);
    if (cle === 'volume') {
      tfLancerVerin(vise, duree);
    } else {
      tfAppliquer(cle, vise, duree, pas);
      if (cle !== 'Text') tfSetTenu(false);
    }
    tfCarte[cle].suit = true;
    _tfApresLancer(cle, duree);
  });
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
  _tfMajJournal();
}

function tfOnSelA() {
  tfEtapesSelectionnerA();
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

function _tfVitesseAdaptee(D) {
  if (!isFinite(D) || D <= 0) return;
  _tfVersCran(tfCranVitesse(D / TF_ECRAN_ACTION));
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
  // ~1 ms, c'est lui qu'on veut voir
  else if (cle === 'Pair' && tf.masse === 0) D = 10 * d.traversee;
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
var TF_ECRAN_FRONT = 3;   // s réelles
var TF_ECRAN_MECA  = 1;   // s réelles
var _tfRelax = null;      // { ecran, tPrec, meca } jusqu'au retour à l'équilibre

function _tfDemarrerRelax() {
  _tfRelax = tfCarte.auto ? { ecran: 0, tPrec: tf.t, meca: 0 } : null;
}

function _tfVitesseRelax() {
  var R = _tfRelax;
  if (!R) return;
  if (!tfCarte.auto) { _tfRelax = null; return; }
  if (_tfEnAttente) return;   // une action attend la fin d'un ralentissement
  if (tfEnCours()) { R.ecran = 0; R.meca = 0; R.tPrec = tf.t; return; }
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

// ── Section Gaz : γ et état initial (en changer réinitialise) ──
function tfOnGamma(g) {
  g = Math.round(g * 1e6) / 1e6;
  if (Math.abs(g - tf.gamma) < 1e-9) return;
  tf.gamma = g;
  _tfMajGaz();
  tfReinitialiser();
}

function tfOnEtatInitial(cle, val) {
  var v = parseFloat(val);
  if (cle === 'T0') tf.T0 = Math.abs(v - TF_T0) < 0.5 ? TF_T0 : v;
  else tf.V0 = TF_S * v / 100;
  _tfMajGaz();
  tfReinitialiser();
}

function _tfMajGaz() {
  var g = tf.gamma;
  _tfEl['tf-sl-gamma'].value = g;
  _tfEl['tf-lbl-gamma'].textContent = _tfFmt(g, Math.abs(g * 100 - Math.round(g * 100)) > 1e-6 ? 3 : 2);
  [['mono', 5 / 3], ['di', 1.4], ['poly', 4 / 3]].forEach(function (x) {
    document.getElementById('tf-gaz-' + x[0]).classList.toggle('active', Math.abs(g - x[1]) < 2e-3);
  });
  _tfEl['tf-sl-T0'].value = Math.round(tf.T0);
  _tfEl['tf-lbl-T0'].textContent = _tfFmtValeur('Text', tf.T0);
  var h = tf.V0 / TF_S;
  _tfEl['tf-sl-V0'].value = Math.round(h * 100);
  _tfEl['tf-lbl-V0'].textContent = _tfFmtValeur('volume', h);
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
  _tfEl['tf-ck-vitesse-auto'].checked = tfCarte.auto;
  for (var cle in tfAff) {
    document.getElementById('tf-ck-' + cle).checked = tfAff[cle];
  }
  _tfMajGaz();
  _tfMajFond(true);
  window.addEventListener('pointerup', tfPapFin);
  window.addEventListener('pointercancel', tfPapFin);
  window.addEventListener('blur', tfPapFin);

  tfMolInit();
  tfEtapesEffacer();
  tfGraphInit();
  _tfDoResize();
  _tfMajBoutons();
  tfMajAfficheurs();
  _tfPret = true;
  requestAnimationFrame(_tfLoop);
}
