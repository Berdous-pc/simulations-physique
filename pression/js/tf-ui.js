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
  'tf-sl-isolation', 'tf-lbl-isolation',
  'tf-btn-piston', 'tf-tab-volume', 'tf-tab-pression', 'tf-tab-temperature',
  'tf-moyens', 'tf-tab-masse', 'tf-tab-Pair', 'tf-hint-actuel',
  'tf-sl-duree', 'tf-lbl-duree', 'tf-duree-allongee',
  'tf-row-pas', 'tf-sl-pas', 'tf-lbl-pas', 'tf-hint-escalier',
  'tf-ro-regime', 'tf-durees-car', 'tf-btn-lancer', 'tf-btn-interrompre', 'tf-en-cours',
  'tf-journal', 'tf-ckg-gel'
];

// Vrai une fois tfInit terminée : les réglages initiaux du panneau
// n'ouvrent pas d'étape
var _tfPret = false;

// ══════════════════════════════════════════════════════════════════════
//  Carte « Transformation » (PLAN_TRANSFORMATIONS.md §10.3)
//  Une grandeur visée parmi quatre : hauteur du piston ('volume'), masse
//  posée ('masse'), pression de l'air de l'enceinte ('Pair'), température de
//  la source ('Text'). Chacune garde sa valeur visée, sa durée et la hauteur
//  de ses marches.
// ══════════════════════════════════════════════════════════════════════

var TF_PAS_ESC = {
  masse : [0.005, 0.01, 0.02, 0.05, 0.1],        // kg : masse d'un grain de sable
  Pair  : [500, 1000, 2000, 5000, 10000],        // Pa
  Text  : [0.5, 1, 2, 5, 10]                     // K
};

var tfCarte = {
  action : 'volume',     // onglet : 'volume', 'pression' ou 'temperature'
  moyen  : 'masse',      // action pression : 'masse' ou 'Pair'
  auto   : true,         // vitesse adaptée à chaque transformation
  // Valeur visée (SI), cran de durée, cran de la hauteur des marches
  volume : { vise: 0.15,     iDuree: 8, iPas: 2 },
  masse  : { vise: 20,       iDuree: 0, iPas: 2 },
  Pair   : { vise: 2e5,      iDuree: 0, iPas: 2 },
  Text   : { vise: 400,      iDuree: 0, iPas: 1 }
};

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

// Libellé d'un cran de vitesse : ×1/5000, ×0,1, ×20…
function _tfLibelleVitesse(v) {
  if (v < 0.1) return '1/' + Math.round(1 / v);
  return String(v).replace('.', ',');
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
  return Math.round(t) + ' s';
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
  var m = tfMesures();
  _tfEl['tf-it-t'].textContent    = _tfFmtTemps(tf.t);
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
    h += '<div class="tf-etape tf-etape-depart"><span class="tf-pastille" style="background:' + TF_COUL_SANS_ETAPE + '"></span>'
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
  return d + (tf.G === 0 ? ' · calorifugé' : ' · fond conducteur');
}

// Ouvre une étape avant une action : le chrono des graphes repart et l'état
// de départ est enregistré
function _tfOuvrirEtape(desc) {
  tfGraphDegeler();
  tfEtapeNouvelle(desc);
  tfGraphDepartEtape();
}

// Partie de la carte qui suit l'état du gaz : valeur actuelle, escalier,
// régime attendu, durées caractéristiques, boutons, action en cours
function _tfMajCarte() {
  var cle = _tfCle(), k = tfCarte[cle], duree = _tfDuree(cle);
  var d = tfDurees();

  // Valeur actuelle, et ce que fera Lancer au piston
  var txt = 'Actuellement : ' + _tfFmtValeur(cle, _tfActuelle(cle));
  if (cle === 'masse' && tf.masse > 0) {
    txt += ' (' + (tf.blocs > 0 ? _tfFmtValeur('masse', tf.blocs) + ' en bloc' : '')
         + (tf.blocs > 0 && tf.sable > 0 ? ', ' : '')
         + (tf.sable > 0 ? _tfFmtValeur('masse', tf.sable) + ' de sable' : '') + ')';
  }
  if (cle === 'masse' || cle === 'Pair') txt += tf.tenu ? '. Lancer libère le piston.' : '.';
  if (cle === 'Text') txt += tf.tenu ? '. Piston tenu : volume constant.' : '. Piston libre : pression constante.';
  _tfEl['tf-hint-actuel'].textContent = txt;

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
  var cle = _tfCle(), enCours = tfEnCours();
  var rien = Math.abs(tfCarte[cle].vise - _tfActuelle(cle)) < 1e-6
          && !((cle === 'masse' || cle === 'Pair') && tf.tenu);
  _tfEl['tf-btn-lancer'].disabled = enCours || rien;
  _tfEl['tf-btn-interrompre'].disabled = !enCours;

  var info = '';
  if (tf.verin.actif) {
    info = 'Vérin en marche : encore ' + _tfFmtDuree(Math.max(0, tf.verin.t0 + tf.verin.tau - tf.t));
  } else {
    for (var c in tf.rampes) {
      var r = tf.rampes[c];
      if (!r.actif) continue;
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

  var b = _tfEl['tf-btn-piston'];
  b.textContent = tf.tenu ? '🔒 Piston tenu par le vérin' : '🔓 Piston libre';
  b.classList.toggle('active', tf.tenu);

  var a = tfCarte.action, cle = _tfCle();
  ['volume', 'pression', 'temperature'].forEach(function (x) {
    _tfEl['tf-tab-' + x].classList.toggle('active', a === x);
  });
  _tfEl['tf-moyens'].style.display = a === 'pression' ? '' : 'none';
  _tfEl['tf-tab-masse'].classList.toggle('active', tfCarte.moyen === 'masse');
  _tfEl['tf-tab-Pair'].classList.toggle('active', tfCarte.moyen === 'Pair');
  ['volume', 'masse', 'Pair', 'Text'].forEach(function (x) {
    document.getElementById('tf-row-' + x).style.display = x === cle ? '' : 'none';
  });

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

// Libellé de la durée, curseur des marches (escalier seulement)
function _tfMajDuree() {
  var cle = _tfCle(), duree = _tfDuree(cle);
  _tfEl['tf-lbl-duree'].textContent = cle !== 'volume' && duree === 0 ? 'brutale (échelon)'
    : _tfLibelleDuree(duree);
  var esc = cle !== 'volume' && duree > 0;
  _tfEl['tf-row-pas'].style.display = esc ? '' : 'none';
  if (esc) {
    _tfEl['tf-sl-pas'].value = tfCarte[cle].iPas;
    _tfEl['tf-lbl-pas'].textContent = _tfFmtPas(cle, _tfPas(cle))
                                    + (cle === 'masse' ? ' (un grain de sable)' : '');
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
  tfReset();
  tfMolInit();
  tfEtapesEffacer();
  tfGraphEffacer();
  _tfMajBoutons();
  tfMajAfficheurs();
}

function tfOnVitesse(val) {
  tf.vitesse = TF_VITESSES[parseInt(val, 10)];
  _tfEl['tf-sl-vitesse'].value = val;
  _tfEl['tf-lbl-vitesse'].textContent = _tfLibelleVitesse(tf.vitesse);
  tfGraph.sale = true;   // la fenêtre des graphes temporels suit le cran
  tfGraphReprogrammer();
  tfMajAfficheurs();
}

function tfOnVitesseAuto(coche) { tfCarte.auto = coche; }

function tfOnIsolation(val) {
  var idx = parseInt(val, 10);
  // Le fond devient conducteur ou isolant : des échanges peuvent commencer
  // (étape retirée du journal si rien ne change)
  if (_tfPret && TF_ISOLATIONS[idx] !== tf.G) {
    var nom = idx === 0 ? 'calorifugé' : idx === TF_ISOLATIONS.length - 1 ? 'diathermane' : 'G = ' + String(TF_ISOLATIONS[idx]).replace('.', ',') + ' W/K';
    // En faisant glisser le curseur, une seule étape « Fond » tant que le gaz
    // n'a pas atteint l'équilibre
    var der = tfEtapes.liste[tfEtapes.liste.length - 1];
    if (tfEnCours()) tfGraphDegeler();
    else if (der && der.fond && der.statut === 'en cours') { der.desc = 'Fond ' + nom; tfEtapes.version++; tfGraphDegeler(); }
    else { _tfOuvrirEtape('Fond ' + nom); tfEtapes.liste[tfEtapes.liste.length - 1].fond = true; }
  }
  tfSetIsolation(TF_ISOLATIONS[idx]);
  var G = TF_ISOLATIONS[idx];
  _tfEl['tf-lbl-isolation'].textContent =
    idx === 0 ? 'calorifugé'
    : idx === TF_ISOLATIONS.length - 1 ? 'diathermane'
    : 'G = ' + String(G).replace('.', ',') + ' W/K';
  tfMajAfficheurs();
}

// Tenir ou libérer le piston, à tout moment (libérer arrête le vérin)
function tfBasculerPiston() {
  _tfOuvrirEtape(tf.tenu ? 'Piston libéré' : 'Piston tenu');
  tfSetTenu(!tf.tenu);
  _tfMajBoutons();
  tfMajAfficheurs();
}

function tfOnAction(a) {
  tfCarte.action = a;
  _tfMajBoutons();
  tfMajAfficheurs();
}

function tfOnMoyen(m) {
  tfCarte.moyen = m;
  _tfMajBoutons();
  tfMajAfficheurs();
}

// Curseur d'une valeur visée : cm, kg, kPa ou K entiers. La graduation la
// plus proche de l'atmosphère redonne la valeur exacte de l'état initial.
function tfOnVisee(cle, val) {
  var v = parseFloat(val);
  if (cle === 'volume') v /= 100;
  else if (cle === 'Pair') v = Math.abs(v - TF_P_ATM / 1000) < 0.5 ? TF_P_ATM : v * 1000;
  else if (cle === 'Text') v = Math.abs(v - TF_T0) < 0.5 ? TF_T0 : v;
  tfCarte[cle].vise = v;
  document.getElementById('tf-lbl-' + cle).textContent = _tfFmtValeur(cle, v);
  if (cle === 'volume') { tf.hVisee = v; tf.needsRedraw = true; }
  tfMajAfficheurs();
}

function tfOnDuree(val) {
  tfCarte[_tfCle()].iDuree = parseInt(val, 10);
  _tfMajDuree();
  tfMajAfficheurs();
}

function tfOnPas(val) {
  tfCarte[_tfCle()].iPas = parseInt(val, 10);
  _tfMajDuree();
  tfMajAfficheurs();
}

// Lance l'action de la carte. Volume : le vérin tient le piston et le mène
// à la hauteur visée. Pression : la consigne s'applique et le piston est
// libéré. Température : le piston garde son état.
function tfLancer() {
  if (tfEnCours()) return;
  var cle = _tfCle(), k = tfCarte[cle], duree = _tfDuree(cle);
  _tfOuvrirEtape(_tfDescAction(cle, duree));
  if (cle === 'volume') {
    tfLancerVerin(k.vise, duree);
  } else {
    tfAppliquer(cle, k.vise, duree, _tfPas(cle));
    if (cle !== 'Text') tfSetTenu(false);
  }
  if (tfCarte.auto) _tfVitesseAdaptee(cle, duree);
  tfGraphReprogrammer();
  tfGraph.sale = true;
  _tfMajBoutons();
  tfMajAfficheurs();
}

function tfOnInterrompre() {
  tfInterrompre();
  tfMajAfficheurs();
}

// ── Journal : mise en évidence d'une étape, retour à un état ──
function tfOnSelEtape(k) {
  tfEtapesSelectionner(k);
  _tfMajJournal();
}

function tfOnRevenir(i) {
  tfEtapesRevenir(i);
  tfMolInit();
  _tfMajBoutons();
  tfMajAfficheurs();
}

// Vitesse adaptée (§10.3) : le cran dont la durée de l'action, vue à
// l'écran, est la plus proche de quelques secondes. Durée de l'action :
// course du vérin, escalier, retour au repos du piston (pression brutale)
// ou mise en équilibre thermique (température brutale).
var TF_ECRAN_ACTION = 5;   // s réelles visées

function _tfVitesseAdaptee(cle, duree) {
  var d = tfDurees(), D;
  if (cle === 'volume') D = tf.verin.actif ? tf.verin.tau : duree;
  else if (duree > 0) D = duree;
  else if (cle === 'Text') D = d.thermique;
  else D = 16 * d.piston;
  if (!isFinite(D) || D <= 0) return;
  var cible = D / TF_ECRAN_ACTION, iMieux = 0;
  for (var i = 1; i < TF_VITESSES.length; i++) {
    if (Math.abs(Math.log(TF_VITESSES[i] / cible)) < Math.abs(Math.log(TF_VITESSES[iMieux] / cible))) iMieux = i;
  }
  if (TF_VITESSES[iMieux] !== tf.vitesse) tfOnVitesse(iMieux);
}

// ── Section Affichage ──
function tfOnAffichage(cle, coche) {
  tfAff[cle] = coche;
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
    var dtSim = tfAvancer(dtReel / 1000 * tf.vitesse);
    if (dtReel > 0) _tfVitesseAtteinte += (dtSim / (dtReel / 1000) - _tfVitesseAtteinte) * Math.min(1, dtReel / 1000);
    // Agitation des molécules en temps d'affichage, freinée au ralenti
    // (racine cubique du cran) et jamais accélérée au-delà de ×1, où elle
    // deviendrait illisible ; au cran le plus lent, elle suit le temps
    // simulé, à l'échelle réelle (tfMolReel).
    if (tfAff.molecules) {
      var f = Math.pow(Math.min(1, tf.vitesse), 1 / 3);
      tfMolAvancer(dtReel / 1000, dtReel / 1000 * f, dtSim, tfLargeurDessinee(),
                   tfRayonMolecule() / (_tfX2 - _tfX1), tfAff.chocs);
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
  _tfEl['tf-sl-isolation'].value = 0;
  tfOnIsolation(0);
  for (var cle in tfAff) {
    document.getElementById('tf-ck-' + cle).checked = tfAff[cle];
  }
  ['volume', 'masse', 'Pair', 'Text'].forEach(function (c) {
    var v = tfCarte[c].vise;
    var pos = c === 'volume' ? v * 100 : c === 'Pair' ? v / 1000 : v;
    document.getElementById('tf-sl-' + c).value = Math.round(pos);
    tfOnVisee(c, Math.round(pos));
  });

  tfMolInit();
  tfEtapesEffacer();
  tfGraphInit();
  _tfDoResize();
  _tfMajBoutons();
  tfMajAfficheurs();
  _tfPret = true;
  requestAnimationFrame(_tfLoop);
}
