// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  pile-loupe.js — Onglet Pile et électrolyse : loupes microscopiques
//  Dépend de sim.js, loupe.js (dimensions de la loupe NR, RC, CU, CV,
//  rayons des particules, dessin des atomes, ions et électrons) et
//  pile.js (état de la pile, réactions, disposition dispP).
//
//  Quatre endroits du montage, au choix (zones cliquables ou panneau) :
//    - électrode de gauche ou de droite : réseau de l'électrode (métal,
//      graphite ou platine) et solution. Un CYCLE par réaction, sur le
//      modèle de l'onglet Oxydoréduction mais les électrons passent par
//      le fil. Couples Mⁿ⁺/M :
//        anode   : un atome de la surface est signalé, ses électrons
//                  partent dans le métal vers le fil (haut de la loupe),
//                  il devient ion et part dans la solution ;
//        cathode : un ion de la solution vient contre la surface, des
//                  électrons arrivent du fil à travers le métal, l'ion
//                  devient atome et s'ajoute au réseau.
//      Couples gazeux (eau, H⁺, Cl⁻, H₂ et O₂ amenés) : les réactifs de
//      la demi-équation se posent côte à côte contre la surface (ions et
//      molécules de gaz dissoutes de la solution, molécules d'eau) ;
//      pendant que les électrons partent vers le fil ou en arrivent,
//      chaque atome glisse jusqu'à sa place dans les produits (atomes
//      suivis, pas de fondu) ; les molécules de gaz formées rejoignent
//      une bulle accrochée à l'électrode (on y voit les molécules), qui
//      se détache et monte ; les ions rejoignent la solution, l'eau
//      formée s'y fond.
//      Le réseau garde l'élément de chaque atome : un dépôt d'un autre
//      métal (zinc sur fer, cuivre sur graphite) se voit, et c'est lui
//      qui s'oxyde d'abord.
//      Cadence des cycles réglée par l'intensité ; aucun cycle sans
//      courant. Le réseau recule (anode) ou avance (cathode) et la vue le
//      suit. Les ions de la solution migrent : cations dans le sens du
//      courant, anions en sens inverse.
//    - pont salin : K⁺ et NO₃⁻ dans le gel, qui migrent en sens inverses
//      (pile à combustible : ions H⁺ qui traversent la membrane) ;
//    - fil : réseau du cuivre et électrons libres, agitation et dérive.
//
//  Coordonnées en « cases » comme loupe.js. Électrodes : calculs avec le
//  métal à GAUCHE ; l'électrode de droite est dessinée en miroir (son
//  métal à droite, sa solution à gauche, face à l'autre électrode), sans
//  retourner les textes.
// ══════════════════════════════════════════════════════════════════════

'use strict';

var PL_N_CATIONS = 8, PL_N_ANIONS = 7;
var PL_D_SIGNAL   = 0.6;          // atome ou ion signalé avant l'échange (s)
var PL_D_SIGNAL_COURT = 0.15;    // espèce arrivée contre la surface, avant le départ de ses électrons (oxydation)
var PL_D_APPROCHE = 2.0;          // ion qui vient contre la surface (cathode)
// Transformation (atome ↔ ion, réactifs → produits) synchronisée avec les
// électrons : elle commence quand le premier électron quitte l'espèce
// oxydée (ou atteint l'espèce réduite) et s'achève quand le dernier l'a
// quittée (ou l'a atteinte), plus PL_D_CHANGE ; au moins PL_D_TRANSFO_MIN
var PL_D_CHANGE   = 0.12;
var PL_D_TRANSFO_MIN = 0.3;
var PL_D_DEPART   = 1.6;          // ion formé qui s'éloigne de l'anode, produits qui partent
var PL_N_CYCLES   = 3;            // cycles en cours à la fois, au plus
var PL_ECART_E    = 0.25;         // entre les départs de deux électrons (s)
var PL_X_SORTIE   = 1.5;          // colonne par laquelle les électrons rejoignent le fil
var PL_FRONT_MIN  = 3, PL_FRONT_MAX = 6;   // bornes de la surface avant que la vue la suive
var PL_V_DERIVE   = 0.75;         // dérive des ions de la solution à I_REF (cases/s)
var PL_V_FIL      = 1.4;          // dérive des électrons du fil à I_REF (cases/s)
var PL_T_GLISSE   = 0.8;          // durée du glissement de la vue (s)
var PL_N_BULLE    = 3;            // molécules de gaz d'une bulle avant qu'elle se détache
var PL_V_BULLE    = 1.6;          // montée d'une bulle détachée (cases/s)
var PL_V_BULLE_HAUT = 1.5;        // la bulle se forme en haut de la loupe : les molécules de gaz y montent

// Atomes des molécules : couleur et rayon (cases)
var PL_ATOMES_MOL = {
  H:  { couleur: '#eef1f4', r: 0.33 },
  O:  { couleur: '#d9473b', r: 0.33 },
  Cl: { couleur: '#6dbb48', r: 0.38 }
};

var ploupe = {
  zone: '',
  rangs: [],          // électrodes : éléments des atomes de chaque ligne, du fond vers la surface
  occupe: [],         // ligne engagée dans un cycle
  offX: 0,            // décalage du réseau pendant un glissement
  cycles: [],
  attente: 0,         // délai avant le prochain cycle (s)
  fond: [],           // ions de la solution, du pont, ou électrons du fil
  bulle: null,        // bulle de gaz accrochée à l'électrode { v, n, gaz }
  bullesLibres: [],   // bulles détachées qui montent { u, v, r, gaz }
  horloge: 0
};

// ══════════════════════════════════════════════════════════════════════
//  RAZ (à chaque changement de zone, de demi-pile ou RAZ de la pile)
// ══════════════════════════════════════════════════════════════════════

function resetLoupePile() {
  var i, r;
  if (pile.zone === 'pont' && sansPont()) pile.zone = 'gauche';
  ploupe.zone = pile.zone;
  ploupe.rangs = []; ploupe.occupe = [];
  ploupe.offX = 0;
  ploupe.cycles = [];
  ploupe.attente = 0.5;
  ploupe.fond = [];
  ploupe.bulle = null;
  ploupe.bullesLibres = [];
  ploupe.horloge = 0;

  if (_estElectrode()) {
    // Réseau : matériau de l'électrode, et une ou deux colonnes du dépôt s'il y en a
    var e = _indiceElectrode(), lame = pile.lames[e].sym;
    var nDep = depotTotal(e) > 0.01 ? 2 : depotTotal(e) > 1e-4 ? 1 : 0;
    // Accumulateur : plaque poreuse, mailles de sulfate de plomb dans la
    // proportion du modèle, plus nombreuses vers la surface
    var P = pile.lames[e].plomb, fs = P ? P.s / (P.n + P.s) : 0;
    for (r = 0; r < NR; r++) {
      var ligne = [];
      for (i = 0; i < COL_INIT; i++) {
        var sym = i < COL_INIT - nDep ? lame : surfaceLame(e);
        if (P && Math.random() < fs * (0.6 + 0.8 * i / (COL_INIT - 1))) sym = 'PbSO4';
        ligne.push(sym);
      }
      ploupe.rangs.push(ligne);
      ploupe.occupe.push(false);
    }
    _completerBords();
    // Ions de la solution selon sa composition
    var pop = _populationSolution(compElectrode(e));
    _repartir(pop.cations, PL_N_CATIONS, 'cation', R_ION);
    _repartir(pop.anions, PL_N_ANIONS, 'anion', R_ANION);
    // Gaz amené (barbotage, pile à combustible) : quelques molécules
    // dissoutes, qui viennent réagir sur l'électrode
    if (pile.lames[e].gaz) {
      for (i = 0; i < 3; i++) ploupe.fond.push(_nouvelIon('mol', pile.lames[e].gaz, PL_R_MOL));
    }
  } else if (ploupe.zone === 'pont') {
    if (enPac()) {
      // Membrane : seuls les ions H⁺ sont mobiles
      for (i = 0; i < 14; i++) {
        ploupe.fond.push({ type: 'cation', sym: 'H', r: R_ION,
                           u: Math.random() * 2 * RC, v: 1 + Math.random() * 9,
                           vu: _gauss() * 0.4, vv: _gauss() * 0.4, vis: 1 });
      }
    } else {
      for (i = 0; i < 18; i++) {
        var cat = i % 2 === 0;
        ploupe.fond.push({ type: cat ? 'cation' : 'anion', sym: cat ? 'K' : 'NO3', r: cat ? R_ION : R_ANION,
                           u: Math.random() * 2 * RC, v: 2.6 + Math.random() * 5.8,
                           vu: _gauss() * 0.4, vv: _gauss() * 0.4, vis: 1 });
      }
    }
  } else {
    for (i = 0; i < 18; i++) {
      ploupe.fond.push({ type: 'electron', r: R_ELECTRON,
                         u: Math.random() * 2 * RC, v: 2.8 + Math.random() * 5.4,
                         vu: _gauss() * 1.2, vv: _gauss() * 1.2, vis: 1 });
    }
  }
}

// Ions de la solution d'un compartiment, avec leurs concentrations :
// cations métalliques, H⁺ (solution acide), cation spectateur (Na⁺) ;
// anion spectateur, Cl⁻, HO⁻ (solution basique)
function _populationSolution(c) {
  var C = pile.comp[c], cat = [], an = [];
  for (var sym in C.n) {
    var x = concentrationC(c, sym);
    if (x > 0) cat.push([sym, x]);
  }
  if (concH(c) > 1e-3) cat.push(['H', concH(c)]);
  if (C.spect) cat.push([C.spect, C.nSpect / P_VOLUME]);
  if (C.anion && C.anion !== 'Cl') an.push([C.anion, C.so4 !== undefined ? concSO4(c) : concInitiale(c)]);
  if (SOLUTIONS[C.sol].chlorure) an.push(['Cl', concCl(c)]);
  if (concOH(c) > 1e-3) an.push(['OH', concOH(c)]);
  return { cations: cat, anions: an };
}

// N ions répartis selon les concentrations (au moins un pour une espèce
// qui n'est pas en traces)
function _repartir(liste, N, type, r) {
  var tot = 0, k, i;
  for (k = 0; k < liste.length; k++) tot += liste[k][1];
  for (k = 0; k < liste.length; k++) {
    var part = tot > 0 ? liste[k][1] / tot : 0;
    var nb = Math.round(N * part);
    if (!nb && part > 0.03) nb = 1;
    for (i = 0; i < nb; i++) ploupe.fond.push(_nouvelIon(type, liste[k][0], r));
  }
}

function _estElectrode() { return ploupe.zone === 'gauche' || ploupe.zone === 'droite'; }
function _indiceElectrode() { return ploupe.zone === 'droite' ? 1 : 0; }
function _front(r) { return ploupe.rangs[r].length; }

// Ion de la solution, à une place libre (vis 0 : il apparaît en fondu)
function _nouvelIon(type, sym, r, vis) {
  var f = { type: type, sym: sym, r: r, u: 0, v: 0, vu: _gauss() * 0.4, vv: _gauss() * 0.4,
            vis: vis === undefined ? 1 : vis };
  _placerDansSolution(f, false);
  return f;
}

// Bord de la surface de l'électrode à la hauteur v (abscisse de la face)
function _bordMetal(v) {
  var r = Math.max(0, Math.min(NR - 1, Math.floor(v)));
  return _front(r) + ploupe.offX;
}
function _bordMax() {
  var m = 0;
  for (var r = 0; r < NR; r++) m = Math.max(m, _front(r));
  return m + ploupe.offX;
}

// Place un ion dans la solution : au hasard, ou au bord droit de la loupe
// (aDroite : il arrive du reste de la solution)
function _placerDansSolution(f, aDroite) {
  for (var essai = 0; essai < 100; essai++) {
    var v = 0.6 + Math.random() * (2 * RC - 1.2);
    var u = aDroite ? 2 * RC - 0.2 + Math.random() * 0.4
                    : _bordMax() + 0.8 + Math.random() * (2 * RC - _bordMax() - 0.8);
    if (aDroite || Math.hypot(u - CU, v - CV) < RC - 0.3) { f.u = u; f.v = v; return; }
  }
  f.u = CU + 2; f.v = CV;
}

// ══════════════════════════════════════════════════════════════════════
//  Mise à jour
// ══════════════════════════════════════════════════════════════════════

function majLoupePile(dt) {
  if (ploupe.zone !== pile.zone) resetLoupePile();
  if (dt <= 0) return;
  ploupe.horloge += dt;
  if (_estElectrode()) _majElectrode(dt);
  else if (ploupe.zone === 'pont') _majPont(dt);
  else _majFil(dt);
}

// Signe du courant (+1 : de la gauche vers la droite dans les solutions)
function _signeI() { return pile.I > 0 ? 1 : pile.I < 0 ? -1 : 0; }

// ── Électrode ─────────────────────────────────────────────────────────
function _majElectrode(dt) {
  var i, e = _indiceElectrode();
  // Glissement de la vue en cours
  if (ploupe.offX !== 0) {
    var pasG = dt / PL_T_GLISSE;
    ploupe.offX = Math.abs(ploupe.offX) <= pasG ? 0 : ploupe.offX - Math.sign(ploupe.offX) * pasG;
  }

  // Nouveau cycle selon la réaction qui a lieu sur l'électrode et l'intensité
  var role = roleElectrode(e);
  ploupe.attente -= dt;
  if (role && ploupe.attente <= 0 && ploupe.cycles.length < PL_N_CYCLES && ploupe.offX === 0) {
    var reac = reactionEnCours(e), cy = null;
    if (reac && reac.type === 'metal') {
      if (!_suivreSurface(role)) cy = role === 'anode' ? _cycleAnode() : _cycleCathode(reac.sym);
    } else if (reac && !_etapesEnCours()) {
      // Couples gazeux : un cycle à la fois (choix de l'utilisateur : la
      // stœchiométrie reste lisible), le suivant pendant le départ des produits
      cy = _cycleGaz(reac);
    }
    if (cy) ploupe.cycles.push(cy);
    // Intervalle entre deux départs de cycle : 0,7 s à I_REF, plus long si
    // I est faible ; pas de place libre : on réessaie bientôt
    ploupe.attente = cy ? Math.min(3, 0.7 / Math.max(0.25, facteurCourant())) : 0.2;
  }

  for (i = ploupe.cycles.length - 1; i >= 0; i--) {
    if (_majCycleP(ploupe.cycles[i], dt)) ploupe.cycles.splice(i, 1);
  }
  _majBullesL(dt);

  // Ions de la solution : agitation + migration. Cations dans le sens du
  // courant (vers la droite si I > 0), anions en sens inverse ; en miroir
  // pour l'électrode de droite.
  var dir = _signeI() * (ploupe.zone === 'gauche' ? 1 : -1) * PL_V_DERIVE * facteurCourant();
  var nCat = 0, nAn = 0;
  for (i = ploupe.fond.length - 1; i >= 0; i--) {
    var f = ploupe.fond[i];
    if (f.sort) {
      f.vis -= dt / D_FONDU;
      if (f.vis <= 0) { ploupe.fond.splice(i, 1); continue; }
    } else if (f.vis < 1) {
      f.vis = Math.min(1, f.vis + dt / D_FONDU);
    }
    if (!f.sort) { if (f.type === 'cation') nCat++; else if (f.type === 'anion') nAn++; }
    _agiter(f, dt, 1);
    // Lente rotation (visible pour HO⁻ et les molécules de gaz dissoutes)
    if (f.ang === undefined) { f.ang = Math.random() * 6.28; f.va = (Math.random() - 0.5) * 0.8; }
    f.ang += f.va * dt;
    // Les molécules de gaz dissoutes ne migrent pas
    var d = f.type === 'cation' ? dir : f.type === 'anion' ? -dir : 0;
    f.u += (f.vu + d) * dt;
    f.v += f.vv * dt;
    if (f.v < f.r) { f.v = f.r; f.vv = Math.abs(f.vv); }
    if (f.v > 2 * RC - f.r) { f.v = 2 * RC - f.r; f.vv = -Math.abs(f.vv); }
    var b = _bordMetal(f.v) + f.r + 0.05;
    if (f.u < b) {
      // Poussé contre le métal par la migration : il est remplacé par un
      // ion venu du reste de la solution ; sinon il rebondit
      if (d < -0.05 && !f.sort) { _placerDansSolution(f, true); f.vis = 0; }
      else { f.u = b; f.vu = Math.abs(f.vu); }
    }
    if (f.u > 2 * RC + 0.6) { _placerDansSolution(f, d > 0.05 ? false : true); f.vis = 0; }
  }
  // Les cycles ajoutent des ions (anode d'un métal, eau oxydée ou
  // réduite) : on garde des nombres stables
  if (nCat > PL_N_CATIONS + 2) _retirerLoin('cation');
  if (nAn > PL_N_ANIONS + 3) _retirerLoin('anion');
}

// Un cycle d'un couple gazeux est-il encore dans ses étapes ?
function _etapesEnCours() {
  for (var i = 0; i < ploupe.cycles.length; i++) if (ploupe.cycles[i].phase === 'etapes') return true;
  return false;
}

// L'ion de ce type le plus éloigné de l'électrode s'efface
function _retirerLoin(type) {
  var loin = null;
  for (var i = 0; i < ploupe.fond.length; i++) {
    var g = ploupe.fond[i];
    if (g.type === type && !g.sort && (!loin || g.u > loin.u)) loin = g;
  }
  if (loin) loin.sort = true;
}

// Mouvement brownien lent (Ornstein-Uhlenbeck sur la vitesse)
function _agiter(f, dt, sigma) {
  f.vu += -GAMMA * f.vu * dt + SIGMA * sigma * Math.sqrt(dt) * _gauss();
  f.vv += -GAMMA * f.vv * dt + SIGMA * sigma * Math.sqrt(dt) * _gauss();
}

// La surface a trop reculé (anode) ou trop avancé (cathode) : quand aucun
// cycle n'est en cours, le réseau est décalé d'une colonne (une colonne du
// métal de la lame ajoutée au fond, ou la plus profonde retirée) et glisse
// en douceur, pour que la surface reste au milieu de la loupe.
// Renvoie true si un glissement a été lancé (ou est attendu).
function _suivreSurface(role) {
  var r, mn = 99, mx = 0;
  for (r = 1; r < NR - 1; r++) { mn = Math.min(mn, _front(r)); mx = Math.max(mx, _front(r)); }
  var sens = role === 'anode' && mx <= PL_FRONT_MIN ? 1 : role === 'cathode' && mn >= PL_FRONT_MAX ? -1 : 0;
  if (!sens) return false;
  if (ploupe.cycles.length) return true;
  // Les ions de la solution ne bougent pas : seul le réseau glisse
  var lame = pile.lames[_indiceElectrode()].sym;
  for (r = 0; r < NR; r++) {
    if (sens > 0) ploupe.rangs[r].unshift(lame);
    else ploupe.rangs[r].shift();
  }
  ploupe.offX = -sens;
  return true;
}

// Ligne où a lieu le prochain cycle : surface la plus avancée (anode) ou
// la plus en retrait (cathode), hors lignes déjà engagées. À l'anode, de
// préférence une ligne dont l'atome de surface est du métal qui s'oxyde
// d'après le modèle (le dépôt avant la lame).
function _ligneCandidate(plusAvancee, symSurface) {
  var r, ref = plusAvancee ? 0 : 99, cand = [], candSym = [];
  for (r = 1; r < NR - 1; r++) {
    if (ploupe.occupe[r]) continue;
    ref = plusAvancee ? Math.max(ref, _front(r)) : Math.min(ref, _front(r));
  }
  for (r = 1; r < NR - 1; r++) {
    if (ploupe.occupe[r]) continue;
    var R = ploupe.rangs[r];
    if (symSurface && R.length >= 2 && R[R.length - 1] === symSurface && _front(r) >= ref - 1) candSym.push(r);
    if (_front(r) === ref) cand.push(r);
  }
  if (candSym.length) cand = candSym;
  return cand.length ? cand[Math.floor(Math.random() * cand.length)] : -1;
}

// Trajets des électrons dans le métal : de la place (u, v) vers le fil,
// en restant dans le métal (colonne de sortie puis vers le haut)
function _cheminVersFil(u, v) {
  return [{ u: u, v: v }, { u: PL_X_SORTIE, v: v }, { u: PL_X_SORTIE, v: -1.5 }];
}

function _cycleAnode() {
  var e = _indiceElectrode(), sSurf = surfaceLame(e);
  // Dépôt d'un autre métal : ses atomes s'oxydent d'abord
  var r = _ligneCandidate(true, sSurf !== pile.lames[e].sym ? sSurf : null);
  if (r < 0) return null;
  var c = _front(r) - 1;
  var sym = ploupe.rangs[r][c];
  if (estInerte(sym)) return null;              // graphite, platine : jamais oxydés
  var z = METAUX[sym].charge;
  ploupe.occupe[r] = true;
  var cy = { type: 'anode', sym: sym, r: r, c: c, u: c + 0.5, v: r + 0.5, phase: 'signal', t: 0,
             electrons: [], du: 0, dv: 0 };
  var ch = _cheminVersFil(cy.u, cy.v);
  for (var k = 0; k < z; k++) cy.electrons.push({ chemin: ch, depart: k * PL_ECART_E, s: 0 });
  var L = _longueurChemin(ch);
  // L'atome devient ion pendant que ses électrons le quittent
  _horaireTransfo(cy, 0, (z - 1) * PL_ECART_E + 0.6 / V_ELECTRON);
  cy.dElectrons = (z - 1) * PL_ECART_E + L / V_ELECTRON;
  cy.du = 2.6 + Math.random() * 1.2;
  cy.dv = (Math.random() - 0.5) * 2.4;
  return cy;
}

// sym : cation réduit d'après le modèle
function _cycleCathode(sym) {
  var r = _ligneCandidate(false, null);
  if (r < 0) return null;
  var z = METAUX[sym].charge, front = _front(r);
  ploupe.occupe[r] = true;
  var cible = { u: front - 0.5 + DIST_CONTACT, v: r + 0.5 };   // ion contre l'atome de surface
  var fin = { u: front + 0.5, v: r + 0.5 };                     // place de l'atome formé
  // L'ion qui vient se réduire : le plus proche des ions de cet élément ;
  // un autre arrive du reste de la solution pour le remplacer
  var io = _prendreIon('cation', sym, cible);
  var dep = io ? { u: io.u, v: io.v } : { u: 2 * RC + 0.5, v: 1 + Math.random() * 9 };
  var cy = { type: 'cathode', sym: sym, r: r, phase: 'approche', t: 0, cible: cible, fin: fin,
             trajet: [dep, { u: cible.u + 2.2, v: (dep.v + cible.v) / 2 }, { u: cible.u + 1.0, v: cible.v }, cible],
             u: dep.u, v: dep.v, electrons: [] };
  // Électrons venus du fil : dans le métal jusqu'à l'atome de surface, puis l'ion
  var ch = [{ u: PL_X_SORTIE, v: -1.5 }, { u: PL_X_SORTIE, v: r + 0.5 },
            { u: front - 0.5, v: r + 0.5 }, { u: cible.u, v: cible.v }];
  for (var k = 0; k < z; k++) cy.electrons.push({ chemin: ch, depart: k * PL_ECART_E, s: 0 });
  cy.dElectrons = (z - 1) * PL_ECART_E + _longueurChemin(ch) / V_ELECTRON;
  // L'ion devient atome pendant que ses électrons l'atteignent
  _horaireTransfo(cy, _longueurChemin(ch) / V_ELECTRON, cy.dElectrons);
  return cy;
}

// Début (tDeb) et durée (dTransfo) de la transformation, en temps compté
// depuis le départ du premier électron (cy.te) ; tFin : dernier électron
// parti de l'espèce oxydée ou arrivé sur l'espèce réduite
function _horaireTransfo(cy, tDeb, tFin) {
  cy.tDeb = tDeb;
  cy.dTransfo = Math.max(PL_D_TRANSFO_MIN, tFin + PL_D_CHANGE - tDeb);
}

// Retire de la solution l'ion (type, sym) le plus proche de la cible, et
// en fait arriver un autre du reste de la solution. null s'il n'y en a pas.
function _prendreIon(type, sym, cible) {
  var io = null;
  for (var i = 0; i < ploupe.fond.length; i++) {
    var f = ploupe.fond[i];
    if (f.type !== type || f.sym !== sym || f.sort || f.vis < 1) continue;
    if (!io || Math.hypot(f.u - cible.u, f.v - cible.v) < Math.hypot(io.u - cible.u, io.v - cible.v)) io = f;
  }
  if (!io) return null;
  ploupe.fond.splice(ploupe.fond.indexOf(io), 1);
  var rempl = _nouvelIon(type, sym, io.r, 0);
  _placerDansSolution(rempl, true);
  ploupe.fond.push(rempl);
  return io;
}

// ── Cycle d'un couple gazeux ──────────────────────────────────────────
// Les espèces sont décrites par leurs atomes, suivis d'un bout à l'autre
// (pas de fondu entre réactifs et produits) ; la réaction se fait en
// étapes à un électron (PL_SCRIPTS). H⁺, Cl⁻ et SO₄²⁻ gardent leur aspect
// d'ion et prennent celui d'un atome au moment du transfert (comme
// l'atome ↔ ion des métaux).

var PL_R_H_LIE = 0.26;         // H lié à un O (H₂O, HO⁻, OH), plus petit que dans H₂

// Motifs : atomes (élément, position locale en cases, axe de la molécule
// selon u, rayon s'il diffère de celui de l'élément), charge à afficher
// (ions de plusieurs atomes), aspect d'ion
// (ions d'un seul atome), espèce correspondante parmi les ions de la
// solution (fond)
var PL_MOTIFS = (function () {
  var a = 52.25 * Math.PI / 180, dOH = 0.43;
  var hx = dOH * Math.cos(a), hy = dOH * Math.sin(a);
  return {
    'H+':    { at: [['H', 0, 0]], ion: { k: 'cation', sym: 'H' }, fond: { k: 'cation', sym: 'H' } },
    'Cl-':   { at: [['Cl', 0, 0]], ion: { k: 'anion', sym: 'Cl' }, fond: { k: 'anion', sym: 'Cl' } },
    'SO42-': { at: [['SO4', 0, 0]], ion: { k: 'anion', sym: 'SO4' }, fond: { k: 'anion', sym: 'SO4' } },
    'HO-':   { q: -1, at: [['O', -0.21, 0], ['H', 0.22, 0, PL_R_H_LIE]], fond: { k: 'anion', sym: 'OH' } },
    'H2O':   { at: [['O', -hx * 0.4, 0], ['H', hx * 0.6, -hy, PL_R_H_LIE], ['H', hx * 0.6, hy, PL_R_H_LIE]] },
    'H2':    { at: [['H', -0.27, 0], ['H', 0.27, 0]], fond: { k: 'mol', sym: 'H2' } },
    'O2':    { at: [['O', -0.28, 0], ['O', 0.28, 0]], fond: { k: 'mol', sym: 'O2' } },
    'Cl2':   { at: [['Cl', -0.32, 0], ['Cl', 0.32, 0]], fond: { k: 'mol', sym: 'Cl2' } },
    // Intermédiaires accrochés à la surface
    'Hads':  { at: [['H', 0, 0]] },
    'Oads':  { at: [['O', 0, 0]] },
    'Clads': { at: [['Cl', 0, 0]] },
    'OHads': { at: [['O', -0.21, 0], ['H', 0.22, 0, PL_R_H_LIE]] }
  };
})();
var PL_R_MOL = 0.6;            // rayon d'encombrement d'une molécule de gaz dissoute

// Motif d'une particule de la solution (null : ion dessiné en sphère)
function _cleFond(k, sym) {
  if (k === 'mol') return sym;
  if (k === 'anion' && sym === 'OH') return 'HO-';
  return null;
}

// Rayon d'un atome d'un motif (aspect d'ion : rayon de l'ion)
function _rAtomeL(el, ion) {
  if (ion) return ion.k === 'cation' ? R_ION : R_ANION;
  return PL_ATOMES_MOL[el].r;
}

// Atomes d'un motif centré en (u, v), tourné de ang : [{ el, du, dv, r }]
function _atomesMotif(cle, ang) {
  var M = PL_MOTIFS[cle], c = Math.cos(ang), s = Math.sin(ang), L = [];
  for (var i = 0; i < M.at.length; i++) {
    var A = M.at[i];
    L.push({ el: A[0], du: A[1] * c - A[2] * s, dv: A[1] * s + A[2] * c, r: A[3] || _rAtomeL(A[0], M.ion) });
  }
  return L;
}

// Rectangle englobant d'un motif tourné (relatif à son centre)
function _boiteMotif(cle, ang) {
  var L = _atomesMotif(cle, ang), b = { u0: 9, u1: -9, v0: 9, v1: -9 };
  for (var i = 0; i < L.length; i++) {
    b.u0 = Math.min(b.u0, L[i].du - L[i].r); b.u1 = Math.max(b.u1, L[i].du + L[i].r);
    b.v0 = Math.min(b.v0, L[i].dv - L[i].r); b.v1 = Math.max(b.v1, L[i].dv + L[i].r);
  }
  return b;
}

// ── Scripts des demi-équations : étapes à un électron ─────────────────
// Choix de l'utilisateur : le mécanisme réel, simplifié, étape par étape,
// avec des intermédiaires accrochés à la surface (H, O, OH, Cl). Chaque
// étape : des espèces arrivent de la solution (arr), rejoignent des
// espèces déjà accrochées (avec : leurs noms), et, pendant le passage de
// n électrons (0 ou 1 ; 2 pour l'accumulateur), leurs atomes glissent
// jusqu'à leur place dans les espèces formées (apres). Une espèce formée
// reste accrochée sous un nom, ou part (P) : gaz vers la bulle, ions vers
// la solution, eau qui s'y fond.
// Espèce : [clé, orientation, décalage vertical depuis le centre du cycle,
// éloignement de la surface au-delà du contact (, nom ou P (, true :
// l'éloignement est celui du centre depuis la ligne de la surface))].
// Les espèces formées prennent leurs atomes dans l'ordre de la liste (les
// plus proches). ou : espèce formée par où passent les électrons. d :
// lancement de l'étape après la précédente (PL_ECART_ETAPE par défaut) ;
// les deux places d'une même réaction (deux H₂O, deux O…) sont traitées
// presque en même temps.
//   2 H⁺ + 2 e⁻ → H₂ : H⁺ + e⁻ → H accroché, deux fois ; H + H → H₂ ;
//   2 H₂O + 2 e⁻ → H₂ + 2 HO⁻ : H₂O + e⁻ → H accroché + HO⁻, deux fois ;
//     H + H → H₂ ;
//   2 H₂O → O₂ + 4 H⁺ + 4 e⁻ : H₂O → OH accroché + H⁺ + e⁻ ; OH → O
//     accroché + H⁺ + e⁻ ; deux fois ; O + O → O₂ ;
//   4 HO⁻ → O₂ + 2 H₂O + 4 e⁻ : HO⁻ → OH accroché + e⁻ ; OH + HO⁻ → O
//     accroché + H₂O + e⁻ ; deux fois ; O + O → O₂ ;
//   2 Cl⁻ → Cl₂ + 2 e⁻ : Cl⁻ → Cl accroché + e⁻, deux fois ; Cl + Cl → Cl₂ ;
//   H₂ → 2 H⁺ + 2 e⁻ : H₂ se scinde en deux H accrochés ; H → H⁺ + e⁻,
//     deux fois ;
//   O₂ + 4 H⁺ + 4 e⁻ → 2 H₂O : O₂ se scinde en deux O accrochés ; pour
//     chaque O : O + H⁺ + e⁻ → OH, OH + H⁺ + e⁻ → H₂O ;
//   accumulateur : une seule étape (le tableau n'en détaille pas) : SO₄²⁻
//     entre dans la maille ou en sort, les O de PbO₂ en sortent et forment
//     H₂O avec quatre H⁺ (ou l'inverse).
var PL_SCRIPTS = (function () {
  var V = Math.PI / 2, PI = Math.PI, P = 'part';
  // Géométrie autour d'un O accroché (place vO) : centres donnés depuis la
  // ligne de la surface (dernier élément true). O contre le métal, H de
  // l'eau finale de part et d'autre (k = −1 en haut, +1 en bas), à la
  // distance O–H et à l'angle de la molécule d'eau ; un H⁺ arrive ou part
  // dans l'axe de sa liaison O–H.
  var rO = 0.33, uO = 0.03 + rO, dOH = 0.43, a = 52.25 * Math.PI / 180;
  var hx = dOH * Math.cos(a), hy = dOH * Math.sin(a), eH = 1 + 0.45 / dOH;
  var VO = 0.85;                             // écart des deux places O au centre du cycle (les H⁺ du milieu se chevauchent un peu)
  var eau = function (vO, p) { return ['H2O', 0, vO, uO + 0.4 * hx, p, true]; };
  var oAds = function (vO, nom) { return ['Oads', 0, vO, uO, nom, true]; };
  var ohVers = function (vO, k, nom) {       // OH accroché, H tourné vers la place k de l'eau
    return ['OHads', Math.atan2(k * hy, hx), vO + 0.21 * k * hy / dOH, uO + 0.21 * hx / dOH, nom, true];
  };
  var hPlus = function (vO, k, p) { return ['H+', 0, vO + k * hy * eH, uO + hx * eH, p, true]; };
  var quatreH = function (p) { return [['H+', 0, -1.18, 0.75, p], ['H+', 0, -0.42, 0.75, p], ['H+', 0, 0.42, 0.75, p], ['H+', 0, 1.18, 0.75, p]]; };
  var deuxEau = function (p) { return [['H2O', 0, -0.8, 0, p], ['H2O', 0, 0.8, 0, p]]; };
  var PRES = 0.2, SUITE = 0.5;               // départs quasi simultanés des deux places, puis étape suivante
  return {
    'H2-acide': [
      { arr: [['H+', 0, -0.45, 0]], apres: [['Hads', 0, -0.45, 0, 'a']], n: 1 },
      { d: PRES, arr: [['H+', 0, 0.45, 0]], apres: [['Hads', 0, 0.45, 0, 'b']], n: 1 },
      { avec: ['a', 'b'], apres: [['H2', V, 0, 0, P]], n: 0 }
    ],
    'H2-eau': [
      { arr: [['H2O', PI, -0.6, 0]], apres: [['Hads', 0, -0.45, 0, 'a'], ['HO-', 0, -0.85, 0.45, P]], n: 1 },
      { d: PRES, arr: [['H2O', PI, 0.6, 0]], apres: [['Hads', 0, 0.45, 0, 'b'], ['HO-', 0, 0.85, 0.45, P]], n: 1 },
      { avec: ['a', 'b'], apres: [['H2', V, 0, 0, P]], n: 0 }
    ],
    // 2 H₂O → O₂ + 4 H⁺ : chaque eau perd d'abord son H extérieur, puis l'autre
    'O2-eau': [
      { arr: [eau(-VO)], apres: [hPlus(-VO, -1, P), ohVers(-VO, 1, 'a')], n: 1, ou: 1 },
      { d: PRES, arr: [eau(VO)], apres: [hPlus(VO, 1, P), ohVers(VO, -1, 'b')], n: 1, ou: 1 },
      { d: SUITE, avec: ['a'], apres: [hPlus(-VO, 1, P), oAds(-VO, 'a')], n: 1, ou: 1 },
      { d: PRES, avec: ['b'], apres: [hPlus(VO, -1, P), oAds(VO, 'b')], n: 1, ou: 1 },
      { avec: ['a', 'b'], apres: [['O2', V, 0, 0, P]], n: 0 }
    ],
    // 4 HO⁻ → O₂ + 2 H₂O : HO⁻ → OH accroché ; un second HO⁻ lui prend son H
    'O2-HO': [
      { arr: [['HO-', 0, -VO, 0]], apres: [['OHads', 0, -VO, 0, 'a']], n: 1 },
      { d: PRES, arr: [['HO-', 0, VO, 0]], apres: [['OHads', 0, VO, 0, 'b']], n: 1 },
      { d: SUITE, avec: ['a'], arr: [['HO-', 0, -VO, 1.0]], apres: [['H2O', 0, -VO, 0.87, P], ['Oads', 0, -VO, 0, 'a']], n: 1, ou: 1 },
      { d: PRES, avec: ['b'], arr: [['HO-', 0, VO, 1.0]], apres: [['H2O', 0, VO, 0.87, P], ['Oads', 0, VO, 0, 'b']], n: 1, ou: 1 },
      { avec: ['a', 'b'], apres: [['O2', V, 0, 0, P]], n: 0 }
    ],
    'Cl2': [
      { arr: [['Cl-', 0, -0.45, 0]], apres: [['Clads', 0, -0.45, 0, 'a']], n: 1 },
      { d: PRES, arr: [['Cl-', 0, 0.45, 0]], apres: [['Clads', 0, 0.45, 0, 'b']], n: 1 },
      { avec: ['a', 'b'], apres: [['Cl2', V, 0, 0, P]], n: 0 }
    ],
    'H2ox': [
      { arr: [['H2', V, 0, 0]], apres: [['Hads', 0, -0.45, 0, 'a'], ['Hads', 0, 0.45, 0, 'b']], n: 0 },
      { avec: ['a'], apres: [['H+', 0, -0.45, 0.3, P]], n: 1 },
      { d: PRES, avec: ['b'], apres: [['H+', 0, 0.45, 0.3, P]], n: 1 }
    ],
    // O₂ + 4 H⁺ → 2 H₂O : O₂ se scinde ; chaque O reçoit un H⁺ dans l'axe de
    // la future liaison O–H (OH), puis un second (H₂O) ; les deux O en même temps
    'O2red': [
      { arr: [['O2', V, 0, 0]], apres: [oAds(-VO, 'a'), oAds(VO, 'b')], n: 0 },
      { avec: ['a'], arr: [hPlus(-VO, -1)], apres: [ohVers(-VO, -1, 'a')], n: 1 },
      { d: PRES, avec: ['b'], arr: [hPlus(VO, 1)], apres: [ohVers(VO, 1, 'b')], n: 1 },
      { d: SUITE, avec: ['a'], arr: [hPlus(-VO, 1)], apres: [eau(-VO, P)], n: 1 },
      { d: PRES, avec: ['b'], arr: [hPlus(VO, -1)], apres: [eau(VO, P)], n: 1 }
    ],
    'PbSO4-ox':  [{ arr: [['SO42-', 0, 0, 0]], apres: [], n: 2 }],
    'PbSO4-red': [{ apres: [['SO42-', 0, 0, 0, P]], n: 2 }],
    'PbO2-red':  [{ arr: [['SO42-', 0, 0, 0]].concat(quatreH()), apres: deuxEau(P), n: 2 }],
    'PbO2-ox':   [{ arr: [['H2O', 0, -0.8, 0], ['H2O', 0, 0.8, 0]], apres: quatreH(P).concat([['SO42-', 0, 0, 0, P]]), n: 2 }]
  };
})();

// Script de la réaction (null : pas de cycle)
function _scriptCycle(reac, d) {
  var aGauche = function (cle) { return d.gauche.some(function (p) { return p[1] === cle; }); };
  switch (reac.type) {
    case 'H2':    return PL_SCRIPTS[aGauche('H+') ? 'H2-acide' : 'H2-eau'];
    case 'O2':    return PL_SCRIPTS[aGauche('H2O') ? 'O2-eau' : 'O2-HO'];
    case 'Cl2': case 'H2ox': case 'O2red': return PL_SCRIPTS[reac.type];
    case 'PbSO4': case 'PbO2': return PL_SCRIPTS[reac.type + (reac.ox ? '-ox' : '-red')];
  }
  return null;
}

// Espèce d'un script placée autour de vc : contre la surface, plus
// l'éloignement demandé
function _placerSpec(S, vc) {
  var B = _boiteMotif(S[0], S[1]), v = vc + S[2];
  var surface = Math.max(_bordMetal(v + B.v0), _bordMetal(v + B.v1)) - 0.5 + R_ATOME;
  var u = S[5] ? surface + S[3] : surface + 0.03 - B.u0 + S[3];
  return { cle: S[0], ang: S[1], angC: S[1], pos: { u: u, v: v }, u: u, v: v,
           atomes: _atomesMotif(S[0], S[1]), nom: S[4] };
}

// Hauteur occupée par un script (symétrique autour de son centre)
function _hauteurScript(script) {
  var h = 0;
  var voir = function (L) {
    for (var i = 0; L && i < L.length; i++) {
      var B = _boiteMotif(L[i][0], L[i][1]);
      h = Math.max(h, Math.abs(L[i][2] + B.v0), Math.abs(L[i][2] + B.v1));
    }
  };
  for (var k = 0; k < script.length; k++) { voir(script[k].arr); voir(script[k].apres); }
  return 2 * h;
}

var PL_D_APPROCHE_E = 1.1;    // approche d'une espèce pour une étape (s)
var PL_D_REARR      = 0.45;   // réarrangement sans électron (O + O → O₂, H₂ qui se scinde…)
var PL_ECART_ETAPE  = 0.6;    // l'étape suivante est lancée (ses espèces approchent, ses électrons partent) 0,6 s après la courante

function _cycleGaz(reac) {
  var e = _indiceElectrode(), d = demiEquation(reac, compElectrode(e));
  var script = _scriptCycle(reac, d);
  if (!script) return null;
  // Solide de la demi-équation ('M:…', accumulateur) : une maille du
  // réseau qui se transforme sur place
  var avant = null, apres = null, k, r;
  d.gauche.forEach(function (p) { if (p[1].charAt(1) === ':') avant = p[1].slice(2); });
  d.droite.forEach(function (p) { if (p[1].charAt(1) === ':') apres = p[1].slice(2); });

  // Hauteur du cycle : lignes libres sur toute la hauteur occupée
  var span = _hauteurScript(script), vc = -1, r0 = 0, r1 = 0, maille = null;
  var bornes = function (v) {
    r0 = Math.max(0, Math.floor(v - span / 2));
    r1 = Math.min(NR - 1, Math.floor(v + span / 2));
    for (var q = r0; q <= r1; q++) if (ploupe.occupe[q]) return false;
    return true;
  };
  if (avant) {
    // Maille à transformer : la plus proche de la surface (la plaque est
    // poreuse : l'acide atteint aussi les mailles plus profondes)
    var cands = [];
    for (r = 1; r < NR - 1; r++) {
      var L = ploupe.rangs[r];
      for (var c = L.length - 1; c >= 0; c--) {
        if (L[c] === avant) { cands.push({ r: r, c: c, prof: L.length - 1 - c + Math.random() * 0.9 }); break; }
      }
    }
    cands.sort(function (a, b) { return a.prof - b.prof; });
    for (k = 0; k < cands.length && !maille; k++) {
      var vm = Math.max(0.3 + span / 2, Math.min(NR - 0.3 - span / 2, cands[k].r + 0.5));
      if (bornes(vm) && !ploupe.occupe[cands[k].r]) { maille = cands[k]; vc = vm; }
    }
    if (!maille) return null;
    r0 = Math.min(r0, maille.r); r1 = Math.max(r1, maille.r);
  } else {
    for (var essai = 0; essai < 25 && vc < 0; essai++) {
      // gaz formé : sous la bulle, qui se forme en haut de la loupe
      var vMin = 0.8 + (gazDegage(reac) ? PL_V_BULLE_HAUT + 1.6 : 0);
      var v0 = vMin + span / 2 + Math.random() * Math.max(0, NR - 0.8 - vMin - span);
      if (bornes(v0)) vc = v0;
    }
  }
  if (vc < 0) return null;
  for (r = r0; r <= r1; r++) ploupe.occupe[r] = true;

  var cy = { type: 'gaz', ox: reac.ox, phase: 'etapes', t: 0, r0: r0, r1: r1, vc: vc,
             gaz: gazDegage(reac), script: script, k: 0, etapes: [], accroches: {}, partants: [],
             maille: maille ? { r: maille.r, c: maille.c, avant: avant, apres: apres } : null };
  cy.etapes.push(_creerEtape(cy, 0));
  return cy;
}

// Étape k du cycle : arrivées tirées de la solution, espèces formées
// placées, électrons (de l'espèce par où ils passent vers le fil, ou
// l'inverse), horaire de la transformation
function _creerEtape(cy, k) {
  var D = cy.script[k], st = { k: k, def: D, arr: [], apres: [], phase: 'approche', tA: 0, t: 0,
                               electrons: [], n: D.n, ox: cy.ox };
  var i;
  for (i = 0; D.arr && i < D.arr.length; i++) {
    var a = _placerSpec(D.arr[i], cy.vc), F = PL_MOTIFS[a.cle].fond;
    var io = F ? _prendreIon(F.k, F.sym, a.pos) : null;
    if (io) { a.dep = { u: io.u, v: io.v }; a.ang0 = io.ang || 0; a.fondu = false; }
    else {
      a.dep = { u: 2 * RC - 0.6 - Math.random() * 1.5, v: Math.max(0.6, Math.min(NR - 0.6, a.pos.v + (Math.random() - 0.5) * 4)) };
      a.ang0 = Math.random() * 6.28; a.fondu = true;
    }
    a.u = a.dep.u; a.v = a.dep.v; a.angC = a.ang0;
    st.arr.push(a);
  }
  for (i = 0; D.apres && i < D.apres.length; i++) st.apres.push(_placerSpec(D.apres[i], cy.vc));
  // Fin de l'approche dans l'axe où l'espèce va se lier : depuis le centre
  // de l'espèce formée la plus proche vers sa place (H⁺ dans l'axe de la
  // future liaison O–H) ; à défaut, perpendiculairement à la surface
  for (i = 0; i < st.arr.length; i++) {
    a = st.arr[i];
    var axe = _axeDepuis(a.pos, st.apres);
    a.via = { u: a.pos.u + 1.3 * axe.u, v: a.pos.v + 1.3 * axe.v };
  }
  st.dA = st.arr.length ? PL_D_APPROCHE_E : 0;

  // Électrons : par la maille (accumulateur), ou par l'espèce formée `ou`
  for (i = 0; i < D.n; i++) {
    var ch;
    if (cy.maille) {
      var vm = cy.maille.r + 0.5;
      ch = [{ u: cy.maille.c + 0.5, v: vm }, { u: PL_X_SORTIE, v: vm }, { u: PL_X_SORTIE, v: -1.5 }];
    } else {
      var S = st.apres[D.ou || 0] || st.arr[0], p = { u: S.pos.u, v: S.pos.v };
      ch = [p, { u: _bordMetal(p.v) - 0.5, v: p.v }, { u: PL_X_SORTIE, v: p.v }, { u: PL_X_SORTIE, v: -1.5 }];
    }
    if (!cy.ox) ch.reverse();
    st.electrons.push({ chemin: ch, depart: i * PL_ECART_E, s: 0 });
  }
  if (D.n) {
    var L0 = _longueurChemin(st.electrons[0].chemin);
    st.dElectrons = (D.n - 1) * PL_ECART_E + L0 / V_ELECTRON;
    if (cy.ox) _horaireTransfo(st, 0, (D.n - 1) * PL_ECART_E + 0.6 / V_ELECTRON);
    else _horaireTransfo(st, L0 / V_ELECTRON, st.dElectrons);
  } else {
    st.dElectrons = 0; st.tDeb = 0; st.dTransfo = PL_D_REARR;
  }
  // Réduction : les électrons partent du fil dès la création de l'étape ;
  // l'espèce attend un peu dans la solution (retard) pour arriver avec eux
  st.retard = st.n && !st.ox && st.dA ? Math.max(0, st.tDeb - st.dA) : 0;
  st.fA = st.retard + st.dA;          // instant où les espèces sont arrivées
  return st;
}

// Direction unitaire de p vu depuis le centre le plus proche des espèces
// de L (vers la solution, +u, si p en est trop près : même place)
function _axeDepuis(p, L) {
  var best = null;
  for (var i = 0; i < L.length; i++) {
    var d = Math.hypot(p.u - L[i].pos.u, p.v - L[i].pos.v);
    if (!best || d < best.d) best = { d: d, u: p.u - L[i].pos.u, v: p.v - L[i].pos.v };
  }
  if (!best || best.d < 0.3) return { u: 1, v: 0 };
  return { u: best.u / best.d, v: best.v / best.d };
}

// Liens atome → atome entre les espèces qui réagissent et celles qui se
// forment (même élément, le plus proche, dans l'ordre des espèces
// formées) ; un atome sans correspondant sort de la maille ou y entre
function _lierAtomes(avantL, apresL) {
  var liens = [], pris = [], i, j, m;
  for (j = 0; j < apresL.length; j++) {
    for (m = 0; m < apresL[j].atomes.length; m++) {
      var B = apresL[j].atomes[m], bu = apresL[j].pos.u + B.du, bv = apresL[j].pos.v + B.dv, best = null;
      for (i = 0; i < avantL.length; i++) {
        for (var n = 0; n < avantL[i].atomes.length; n++) {
          var A = avantL[i].atomes[n];
          if (A.el !== B.el || pris.indexOf(A) >= 0) continue;
          var dist = Math.hypot(avantL[i].pos.u + A.du - bu, avantL[i].pos.v + A.dv - bv);
          if (!best || dist < best.d) best = { d: dist, i: i, n: n, A: A };
        }
      }
      if (best) { pris.push(best.A); liens.push({ el: B.el, ra: best.i, ma: best.n, pb: j, mb: m }); }
      else liens.push({ el: B.el, ra: -1, pb: j, mb: m });
    }
  }
  for (i = 0; i < avantL.length; i++) {
    for (m = 0; m < avantL[i].atomes.length; m++) {
      if (pris.indexOf(avantL[i].atomes[m]) < 0) liens.push({ el: avantL[i].atomes[m].el, ra: i, ma: m, pb: -1 });
    }
  }
  return liens;
}

// Plus court chemin angulaire de a vers b, à la fraction s
function _angVers(a, b, s) {
  var d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * s;
}

// Une étape : approche des arrivées ; réduction : électrons partis du fil
// pendant l'approche pour arriver avec l'espèce ; oxydation ou
// réarrangement : peu après l'arrivée. La transformation attend la fin de
// l'étape précédente (aMoi).
function _majEtape(cy, st, dt, aMoi) {
  var i, s;
  st.tA += dt;
  if (st.te !== undefined) {
    st.te += dt;
    _avancerElectrons({ electrons: st.electrons, te: st.te });
  }
  if (st.phase === 'approche') {
    s = st.dA ? _lisse((st.tA - st.retard) / st.dA) : 1;
    for (i = 0; i < st.arr.length; i++) {
      var a = st.arr[i];
      var q = _bezier([a.dep, a.via, a.pos], s);   // fin du trajet dans l'axe de la liaison
      a.u = q.u; a.v = q.v;
      a.angC = _angVers(a.ang0, a.ang, s);
    }
    if (st.te === undefined) {
      if (st.n && !st.ox) { if (st.tA >= st.fA - st.tDeb) st.te = 0; }
      else if (aMoi && st.tA >= st.fA + (st.dA ? PL_D_SIGNAL_COURT : 0.1)) st.te = 0;
    }
    if (aMoi && st.tA >= st.fA && st.te !== undefined && st.te >= st.tDeb) {
      // Début de la transformation : espèces accrochées qui réagissent
      st.avec = [];
      for (i = 0; st.def.avec && i < st.def.avec.length; i++) st.avec.push(cy.accroches[st.def.avec[i]]);
      st.liens = _lierAtomes(st.avec.concat(st.arr), st.apres);
      st.phase = 'transfo'; st.t = 0;
    }
  } else if (st.phase === 'transfo') {
    st.t += dt;
    if (st.t >= st.dTransfo) {
      st.phase = 'fini';
      for (i = 0; i < st.avec.length; i++) delete cy.accroches[st.def.avec[i]];
      for (i = 0; i < st.apres.length; i++) {
        var p = st.apres[i];
        if (p.nom !== 'part') { cy.accroches[p.nom] = p; continue; }
        // Espèce formée qui part : le gaz vers la bulle, le reste vers la solution
        p.t = 0;
        // dans l'axe de la liaison rompue (H⁺ qui quitte OH…), sinon droit vers la solution
        var axe = _axeDepuis(p.pos, st.avec.concat(st.arr)), lg = 1.8 + Math.random() * 1.0;
        p.vers = { u: p.pos.u + lg * axe.u, v: p.pos.v + lg * axe.v + (Math.random() - 0.5) * 0.8 };
        p.angV = p.ang + (Math.random() - 0.5) * 2;
        if (p.cle === cy.gaz) {
          if (!ploupe.bulle) ploupe.bulle = { v: PL_V_BULLE_HAUT, n: 0, gaz: cy.gaz };
          p.rang = ploupe.bulle.n;
        }
        cy.partants.push(p);
      }
      // La maille transformée fait désormais partie du réseau
      if (cy.maille && st.k === cy.script.length - 1) {
        ploupe.rangs[cy.maille.r][cy.maille.c] = cy.maille.apres;
        _completerBords();
      }
    }
  }
}

function _majCycleGaz(cy, dt) {
  var i, s;
  // Étapes : chacune est lancée (ses espèces approchent, ses électrons
  // partent du fil) PL_ECART_ETAPE après la précédente ; elles se
  // transforment dans l'ordre
  for (i = 0; i < cy.etapes.length; i++) _majEtape(cy, cy.etapes[i], dt, i === cy.k);
  var cur = cy.etapes[cy.k], der = cy.etapes[cy.etapes.length - 1];
  var suiv = cy.script[cy.etapes.length];
  if (suiv && der.tA >= (suiv.d !== undefined ? suiv.d : PL_ECART_ETAPE)) {
    cy.etapes.push(_creerEtape(cy, cy.etapes.length));
  }
  if (cur && cur.phase === 'fini') cy.k++;
  if (cy.k >= cy.script.length) cy.phase = 'depart';

  // Espèces formées qui partent
  for (i = cy.partants.length - 1; i >= 0; i--) {
    var p = cy.partants[i], vers = p.vers, angV = p.angV;
    p.t += dt;
    if (p.cle === cy.gaz && ploupe.bulle) { var pl = _placeBulle(p.rang, p.rang + 1); vers = pl; angV = pl.ang; }
    s = _lisse(p.t / PL_D_DEPART);
    p.u = p.pos.u + (vers.u - p.pos.u) * s;
    p.v = p.pos.v + (vers.v - p.pos.v) * s;
    p.angC = _angVers(p.ang, angV, s);
    if (p.t >= PL_D_DEPART) {
      var F = PL_MOTIFS[p.cle].fond;
      if (p.cle === cy.gaz) _gonflerBulle(cy.gaz);
      else if (F && F.k !== 'mol') {
        ploupe.fond.push({ type: F.k, sym: F.sym, r: F.k === 'cation' ? R_ION : R_ANION, u: p.u, v: p.v,
                           ang: p.angC, vu: _gauss() * 0.3, vv: _gauss() * 0.3, vis: 1 });
      }
      cy.partants.splice(i, 1);
    }
  }

  // Fin : toutes les étapes faites, produits partis, électrons arrivés
  if (cy.phase === 'depart' && !cy.partants.length) {
    for (i = 0; i < cy.etapes.length; i++) {
      var st = cy.etapes[i];
      if (st.n && st.te < st.dElectrons) return false;
    }
    for (var r = cy.r0; r <= cy.r1; r++) ploupe.occupe[r] = false;
    return true;
  }
  return false;
}

// ── Bulles de la loupe ────────────────────────────────────────────────
// Une bulle est une enveloppe où l'on voit les molécules de gaz qu'elle
// contient (même dessin que les molécules isolées)
function _rayonBulle(n) { return 0.5 + 0.5 * Math.sqrt(n); }

// Centre de la bulle accrochée, pour n molécules : elle touche la face de
// l'électrode
function _centreBulle(n) {
  var b = ploupe.bulle, rb = _rayonBulle(Math.max(1, n === undefined ? b.n : n));
  return { u: _bordMetal(b.v) - 0.5 + R_ATOME + rb, v: b.v };
}

// Place de la i-ème des n molécules d'une bulle (relative à son centre),
// axe de la molécule tangent au cercle des places
function _placesBulle(i, n) {
  if (n <= 1) return { du: 0, dv: 0, ang: Math.PI / 2 };
  var th = -Math.PI / 2 + i * 2 * Math.PI / n, rp = 0.5 * _rayonBulle(n);
  return { du: rp * Math.cos(th), dv: rp * Math.sin(th), ang: th + Math.PI / 2 };
}

// Place absolue dans la bulle accrochée (de n molécules)
function _placeBulle(i, n) {
  var c = _centreBulle(n), p = _placesBulle(i, n);
  return { u: c.u + p.du, v: c.v + p.dv, ang: p.ang };
}

function _gonflerBulle(gaz) {
  if (!ploupe.bulle) ploupe.bulle = { v: PL_V_BULLE_HAUT, n: 0, gaz: gaz };
  ploupe.bulle.n++;
  if (ploupe.bulle.n >= PL_N_BULLE) {
    // Assez grosse : elle se détache et monte
    var c = _centreBulle();
    ploupe.bullesLibres.push({ u: c.u, v: c.v, n: ploupe.bulle.n, gaz: gaz });
    ploupe.bulle = null;
  }
}

function _majBullesL(dt) {
  var B = ploupe.bullesLibres;
  for (var k = B.length - 1; k >= 0; k--) {
    B[k].v -= PL_V_BULLE * dt;
    B[k].u += 0.35 * dt;
    if (B[k].v < -_rayonBulle(B[k].n) - 0.5) B.splice(k, 1);
  }
}

// Avance un cycle ; renvoie true quand il est terminé
// Les électrons, une fois partis, avancent jusqu'au bout (cy.te : temps
// depuis le départ du premier), quelle que soit l'étape du cycle
function _majCycleP(cy, dt) {
  cy.t += dt;
  if (cy.te !== undefined) { cy.te += dt; _avancerElectrons(cy); }
  if (cy.type === 'gaz') return _majCycleGaz(cy, dt);
  if (cy.type === 'anode') {
    if (cy.phase === 'signal' && cy.t >= PL_D_SIGNAL) _lancerElectrons(cy);
    else if (cy.phase === 'electrons') _debutTransfo(cy);
    else if (cy.phase === 'transfo') {
      if (cy.t >= cy.dTransfo) {
        cy.phase = 'depart'; cy.t = 0;
        // L'ion quitte le réseau : la place reste libre
        ploupe.rangs[cy.r].length = Math.min(_front(cy.r), cy.c);
        _completerBords();
        cy.u0 = cy.u; cy.v0 = cy.v;
      }
    } else if (cy.phase === 'depart') {
      var s = _lisse(cy.t / PL_D_DEPART);
      cy.u = cy.u0 + cy.du * s;
      cy.v = cy.v0 + cy.dv * s;
      if (cy.t >= PL_D_DEPART && cy.te >= cy.dElectrons) {
        // Il rejoint les ions de la solution
        ploupe.fond.push({ type: 'cation', sym: cy.sym, r: R_ION, u: cy.u, v: cy.v,
                           vu: _gauss() * 0.3, vv: _gauss() * 0.3, vis: 1 });
        ploupe.occupe[cy.r] = false;
        return true;
      }
    }
  } else {
    if (cy.phase === 'approche') {
      var p = _bezier(cy.trajet, _lisse(cy.t / PL_D_APPROCHE));
      cy.u = p.u; cy.v = p.v;
      _anticiperElectrons(cy);
      _finApproche(cy);
    } else if (cy.phase === 'signal' && cy.t >= PL_D_SIGNAL_COURT) {
      _lancerElectrons(cy);
    } else if (cy.phase === 'electrons') {
      _debutTransfo(cy);
    } else if (cy.phase === 'transfo') {
      var q = _lisse(cy.t / cy.dTransfo);
      cy.u = cy.cible.u + (cy.fin.u - cy.cible.u) * q;
      if (cy.t >= cy.dTransfo && cy.te >= cy.dElectrons) {
        ploupe.rangs[cy.r].push(cy.sym);      // l'atome formé fait partie du réseau
        _completerBords();
        ploupe.occupe[cy.r] = false;
        return true;
      }
    }
  }
  return false;
}

// Lignes du haut et du bas, hors des cycles : comme leurs voisines
function _completerBords() {
  ploupe.rangs[0] = ploupe.rangs[1].slice();
  ploupe.rangs[NR - 1] = ploupe.rangs[NR - 2].slice();
}

// Réduction : les électrons partent du fil pendant l'approche, pour
// arriver au moment où l'espèce atteint sa place (cy.tDeb : durée du
// trajet du premier) ; oxydation (tDeb nul) : ils partent peu après
// l'arrivée (étape « signal » courte)
function _anticiperElectrons(cy) {
  if (cy.te === undefined && cy.tDeb > 0 && cy.t >= PL_D_APPROCHE - cy.tDeb) cy.te = 0;
}

function _finApproche(cy) {
  if (cy.t < PL_D_APPROCHE) return;
  cy.t = 0;
  if (cy.te !== undefined) { cy.phase = 'electrons'; _debutTransfo(cy); }
  else cy.phase = 'signal';
}

function _lancerElectrons(cy) {
  cy.phase = 'electrons'; cy.t = 0; cy.te = 0;
  _debutTransfo(cy);
}

// La transformation commence avec le premier électron qui part ou arrive
function _debutTransfo(cy) {
  if (cy.te < cy.tDeb) return;
  cy.phase = 'transfo'; cy.t = cy.te - cy.tDeb;
}

function _avancerElectrons(cy) {
  for (var k = 0; k < cy.electrons.length; k++) {
    var e = cy.electrons[k];
    var L = _longueurChemin(e.chemin);
    e.s = Math.max(0, Math.min(1, (cy.te - e.depart) * V_ELECTRON / L));
  }
}

// ── Pont salin (ou membrane) ──────────────────────────────────────────
function _majPont(dt) {
  var d = _signeI() * PL_V_DERIVE * 1.3 * facteurCourant();
  var h = enPac() ? 0.4 : 2.2, bas = enPac() ? 10.6 : 8.8;
  for (var i = 0; i < ploupe.fond.length; i++) {
    var f = ploupe.fond[i];
    _agiter(f, dt, 1);
    f.u += (f.vu + (f.type === 'cation' ? d : -d)) * dt;
    f.v += f.vv * dt;
    if (f.v < h + f.r) { f.v = h + f.r; f.vv = Math.abs(f.vv); }
    if (f.v > bas - f.r) { f.v = bas - f.r; f.vv = -Math.abs(f.vv); }
    if (f.u > 2 * RC + 1) f.u -= 2 * RC + 2;
    if (f.u < -1) f.u += 2 * RC + 2;
  }
}

// ── Fil de cuivre ─────────────────────────────────────────────────────
// Électrons libres : agitation rapide en tous sens, et dérive lente
// d'ensemble quand le courant passe (vers la droite si I > 0 : la zone
// est sur le fil qui part de l'électrode de gauche)
function _majFil(dt) {
  var d = _signeI() * PL_V_FIL * facteurCourant();
  for (var i = 0; i < ploupe.fond.length; i++) {
    var f = ploupe.fond[i];
    _agiter(f, dt, 2.2);
    f.u += (f.vu + d) * dt;
    f.v += f.vv * dt;
    if (f.v < 2.7) { f.v = 2.7; f.vv = Math.abs(f.vv); }
    if (f.v > 8.3) { f.v = 8.3; f.vv = -Math.abs(f.vv); }
    if (f.u > 2 * RC + 1) f.u -= 2 * RC + 2;
    if (f.u < -1) f.u += 2 * RC + 2;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Rendu
// ══════════════════════════════════════════════════════════════════════

function dessinerLoupePile(ctx) {
  var s = dispP.lr / RC;
  echelleParticules = s;
  _dessinerTraitsLoupeP(ctx);

  ctx.save();
  ctx.beginPath();
  ctx.arc(dispP.lx, dispP.ly, dispP.lr, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(dispP.lx - RC * s, dispP.ly - RC * s);
  ctx.scale(s, s);

  if (ploupe.zone === 'pont' && !zoneDisponible('pont')) {
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, 2 * RC, 2 * RC);
  } else if (_estElectrode()) {
    _dessinerElectrodeL(ctx);
  } else if (ploupe.zone === 'pont') {
    if (enPac()) _dessinerMembraneL(ctx); else _dessinerPontL(ctx);
  } else {
    _dessinerFilL(ctx);
  }
  ctx.restore();

  ctx.strokeStyle = '#5a6a78';
  ctx.lineWidth = Math.max(2, dispP.lr * 0.022);
  ctx.beginPath();
  ctx.arc(dispP.lx, dispP.ly, dispP.lr, 0, Math.PI * 2);
  ctx.stroke();

  _dessinerTextesLoupeP(ctx);
}

// Abscisse dessinée : en miroir pour l'électrode de droite
function _mx(u) { return ploupe.zone === 'droite' ? 2 * RC - u : u; }

// Ion ou molécule de la loupe, quel qu'il soit (ang : orientation d'un
// motif de plusieurs atomes : HO⁻, molécules)
function _dessinerEspeceL(ctx, x, y, k, sym, alpha, ang) {
  if (alpha <= 0) return;
  var cle = _cleFond(k, sym);
  if (cle) _dessinerMotif(ctx, x, y, cle, ang || 0, alpha);
  else if (k === 'anion') _dessinerAnion(ctx, x, y, sym, alpha);
  else if (METAUX[sym] && METAUX[sym].charge) _dessinerIon(ctx, x, y, sym, alpha, R_ION);
  else _dessinerIonSimple(ctx, x, y, sym, alpha);
}

// Cation sans métal de METAUX (H⁺, Na⁺, K⁺)
function _dessinerIonSimple(ctx, x, y, sym, alpha) {
  var I = IONS_SIMPLES[sym], rgb = couleurRGB(I.couleur);
  _sphere(ctx, x, y, R_ION, rgb, alpha);
  ctx.strokeStyle = 'rgba(255,255,255,' + 0.9 * alpha + ')';
  ctx.lineWidth = 0.05;
  ctx.stroke();
  _etiquette(ctx, x, y, I.texte, 0.27, rgb, alpha);
}

// Atome d'un motif, à l'abscisse dessinée x ; ion : aspect de l'ion
// (sphère des ions de la solution)
function _dessinerAtomeL(ctx, x, y, el, ion, alpha, r) {
  if (alpha <= 0) return;
  if (ion) {
    if (ion.k === 'cation') _dessinerIonSimple(ctx, x, y, ion.sym, alpha);
    else _dessinerAnion(ctx, x, y, ion.sym, alpha);
    return;
  }
  var A = PL_ATOMES_MOL[el], rgb = couleurRGB(A.couleur);
  r = r || A.r;
  _sphere(ctx, x, y, r, rgb, alpha);
  ctx.strokeStyle = rgbCss(nuance(rgb, -0.4), 0.7 * alpha);
  ctx.lineWidth = 0.025;
  ctx.stroke();
  _etiquette(ctx, x, y, el, r * 0.85, rgb, alpha);
}

// Signe de la charge d'un ion de plusieurs atomes (HO⁻) : pastille
function _dessinerChargeL(ctx, x, y, q, alpha) {
  if (alpha <= 0) return;
  var r = 0.13;
  ctx.fillStyle = 'rgba(44,62,80,' + 0.9 * alpha + ')';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,' + alpha + ')';
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.55, y); ctx.lineTo(x + r * 0.55, y);
  if (q > 0) { ctx.moveTo(x, y - r * 0.55); ctx.lineTo(x, y + r * 0.55); }
  ctx.stroke();
}

// Position dessinée de la pastille de charge d'un motif, au-dessus à
// droite de ses atomes
function _placeCharge(L) {
  var u = -9, v = 9;
  for (var i = 0; i < L.length; i++) { u = Math.max(u, L[i].du + L[i].r * 0.6); v = Math.min(v, L[i].dv - L[i].r * 0.6); }
  return { du: u, dv: v };
}

// Motif (molécule, HO⁻, H⁺…) centré à l'abscisse dessinée x ; en miroir
// pour l'électrode de droite
function _dessinerMotif(ctx, x, y, cle, ang, alpha) {
  if (alpha <= 0) return;
  var M = PL_MOTIFS[cle], L = _atomesMotif(cle, ang), sx = ploupe.zone === 'droite' ? -1 : 1;
  for (var i = 0; i < L.length; i++) _dessinerAtomeL(ctx, x + sx * L[i].du, y + L[i].dv, L[i].el, M.ion, alpha, L[i].r);
  if (M.q) {
    var c = _placeCharge(L);
    _dessinerChargeL(ctx, x + sx * c.du, y + c.dv, M.q, alpha);
  }
}

// Bulle de gaz : enveloppe claire (jaune-vert pour le dichlore) où l'on
// voit ses molécules, reflet
function _dessinerBulleL(ctx, x, y, n, gaz, alpha) {
  var cl = gaz === 'Cl2', r = _rayonBulle(n), sx = ploupe.zone === 'droite' ? -1 : 1;
  ctx.fillStyle = cl ? 'rgba(215,235,120,' + 0.45 * alpha + ')' : 'rgba(255,255,255,' + 0.5 * alpha + ')';
  ctx.strokeStyle = cl ? 'rgba(120,150,40,' + 0.85 * alpha + ')' : 'rgba(70,100,130,' + 0.75 * alpha + ')';
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  for (var i = 0; i < n; i++) {
    var p = _placesBulle(i, n);
    _dessinerMotif(ctx, x + sx * p.du, y + p.dv, gaz, p.ang, alpha);
  }
  ctx.strokeStyle = 'rgba(255,255,255,' + 0.9 * alpha + ')';
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.86, -2.6, -1.8);
  ctx.stroke();
}

function _dessinerElectrodeL(ctx) {
  var i, r, c;
  var e = _indiceElectrode(), lame = pile.lames[e].sym;

  // Fond : la solution, éclaircie (cf. loupe.js)
  ctx.fillStyle = rgbCss(melange([255, 255, 255], couleurSolutionElectrode(e), 0.3));
  ctx.fillRect(0, 0, 2 * RC, 2 * RC);

  // Ions de la solution (estompés : ce sont les acteurs des cycles qui
  // doivent ressortir)
  for (i = 0; i < ploupe.fond.length; i++) {
    var f = ploupe.fond[i];
    var a = Math.max(0, Math.min(1, f.vis));
    _dessinerEspeceL(ctx, _mx(f.u), f.v, f.type, f.sym, (f.type === 'anion' ? ALPHA_ANION : 0.55) * a, f.ang);
  }

  // Bulles détachées qui montent
  for (i = 0; i < ploupe.bullesLibres.length; i++) {
    var b = ploupe.bullesLibres[i];
    _dessinerBulleL(ctx, _mx(b.u), b.v, b.n, b.gaz, Math.max(0, Math.min(1, (b.v + _rayonBulle(b.n) + 0.5) / 1.5)));
  }

  // Réseau : masse claire derrière (marge fine, qui s'arrête juste sous la
  // surface des atomes de la face), puis les atomes (élément de chacun :
  // électrode ou dépôt)
  ctx.fillStyle = rgbCss(nuance(couleurRGB(METAUX[lame].atome), 0.55));
  for (r = 0; r < NR; r++) {
    var x1 = _front(r) + ploupe.offX + 0.38;
    var xa = _mx(-2), xb = _mx(x1);
    ctx.fillRect(Math.min(xa, xb), r, Math.abs(xb - xa), 1.02);
  }
  for (r = 0; r < NR; r++) {
    for (c = -2; c < _front(r); c++) {
      if (_atomeEnCycle(r, c)) continue;
      _dessinerAtomeP(ctx, _mx(c + 0.5 + ploupe.offX), r + 0.5, c < 0 ? lame : ploupe.rangs[r][c], 1);
    }
  }

  // Ions formés à l'anode qui s'éloignent : par-dessus la marge du réseau,
  // pour qu'ils ne soient pas rognés
  for (i = 0; i < ploupe.cycles.length; i++) {
    var cy = ploupe.cycles[i];
    if (cy.type === 'anode' && cy.phase === 'depart') {
      _halo(ctx, _mx(cy.u + ploupe.offX), cy.v, R_ION, COUL_OX, Math.max(0, 1 - cy.t / 1.3), 0.5);
      _dessinerIon(ctx, _mx(cy.u + ploupe.offX), cy.v, cy.sym, 1, R_ION);
    }
  }

  // Bulle accrochée à l'électrode
  if (ploupe.bulle && ploupe.bulle.n > 0) {
    var cb = _centreBulle();
    _dessinerBulleL(ctx, _mx(cb.u), cb.v, ploupe.bulle.n, ploupe.bulle.gaz, 1);
  }

  // Acteurs des cycles
  // Halos fixes autour des espèces qui réagissent (choix de l'utilisateur :
  // pas de pulsation) : rouge pour une oxydation, bleu pour une réduction
  var pulse = 0.5;
  for (i = 0; i < ploupe.cycles.length; i++) _dessinerCycleP(ctx, ploupe.cycles[i], pulse);
}

// Atome de la lame dessiné par son cycle (anode, avant son départ)
// (accumulateur : maille qui se transforme)
function _atomeEnCycle(r, c) {
  for (var i = 0; i < ploupe.cycles.length; i++) {
    var cy = ploupe.cycles[i];
    if (cy.type === 'anode' && cy.phase !== 'depart' && cy.r === r && cy.c === c) return true;
    if (cy.maille && cy.phase !== 'depart' && cy.maille.r === r && cy.maille.c === c) return true;
  }
  return false;
}

// Atome du réseau, ou maille d'un solide écrit par sa formule (PbO₂, PbSO₄)
function _dessinerAtomeP(ctx, x, y, sym, alpha) {
  var M = METAUX[sym];
  if (!M.formule) { _dessinerAtome(ctx, x, y, sym, alpha); return; }
  var rgb = couleurRGB(M.atome);
  _sphere(ctx, x, y, R_ATOME, rgb, alpha);
  ctx.strokeStyle = rgbCss(nuance(rgb, -0.45), alpha * 0.8);
  ctx.lineWidth = 0.03;
  ctx.stroke();
  _etiquette(ctx, x, y, M.formule, M.formule.length > 4 ? 0.21 : 0.27, rgb, alpha);
}

function _dessinerCycleP(ctx, cy, pulse) {
  var dx = ploupe.offX, k, sym = cy.sym;
  if (cy.type === 'gaz') {
    _dessinerCycleGaz(ctx, cy, pulse);
  } else if (cy.type === 'anode') {
    if (cy.phase !== 'depart') {     // en partant, l'ion est dessiné à part, par-dessus le réseau
      var x = _mx(cy.u + dx);
      var kOx = cy.phase === 'transfo' ? Math.min(1, cy.t / cy.dTransfo) : 0;
      _halo(ctx, x, cy.v, R_ATOME, COUL_OX, 0.9, pulse);
      if (kOx > 0) _dessinerTransition(ctx, x, cy.v, sym, kOx, true);
      else _dessinerAtome(ctx, x, cy.v, sym, 1);
    }
  } else {
    var xi = _mx(cy.u + dx);
    if (cy.phase === 'transfo') {
      var kRed = Math.min(1, cy.t / cy.dTransfo);
      _halo(ctx, xi, cy.v, R_ION, COUL_RED, 0.9 * (1 - kRed), pulse);
      _dessinerTransition(ctx, xi, cy.v, sym, kRed, false);
    } else {
      _halo(ctx, xi, cy.v, R_ION, COUL_RED, cy.phase === 'approche' ? 0.8 : 0.9, pulse);
      _dessinerIon(ctx, xi, cy.v, sym, 1, R_ION);
    }
  }
  // Électrons dans l'électrode (toujours visibles : ils sont l'essentiel
  // ici), jusqu'au bout de leur trajet, même si la transformation est finie
  if (cy.te !== undefined) {
    for (k = 0; k < cy.electrons.length; k++) {
      var e = cy.electrons[k];
      if (cy.te < e.depart || e.s >= 1) continue;
      var p = _surLigne(e.chemin, e.s);
      _dessinerElectron(ctx, _mx(p.u + dx), p.v);
    }
  }
}

// Rayon d'encombrement d'un motif (pour son halo)
function _rayonMotif(cle) {
  var L = _atomesMotif(cle, 0), r = 0;
  for (var i = 0; i < L.length; i++) r = Math.max(r, Math.hypot(L[i].du, L[i].dv) + L[i].r);
  return r;
}

// Cycle d'un couple gazeux ou de l'accumulateur : maille, espèces
// accrochées, étapes en cours (espèces qui arrivent, atomes qui glissent
// pendant la transformation), espèces formées qui partent, électrons.
// Halos fixes (rouge : oxydation, bleu : réduction) autour des espèces
// d'une étape à électron, une fois arrivées.
function _dessinerCycleGaz(ctx, cy, pulse) {
  var i, k, coul = cy.ox ? COUL_OX : COUL_RED, sx = ploupe.zone === 'droite' ? -1 : 1;
  var enCours = {};                     // espèces accrochées dessinées par une transformation
  for (i = 0; i < cy.etapes.length; i++) {
    var st = cy.etapes[i];
    if (st.phase === 'transfo') for (k = 0; k < st.avec.length; k++) enCours[st.def.avec[k]] = true;
  }

  // Maille de l'accumulateur : signalée, puis elle devient le solide formé
  var xm = 0, ym = 0;
  if (cy.maille) {
    xm = cy.maille.c + 0.5 + ploupe.offX; ym = cy.maille.r + 0.5;
    if (cy.phase !== 'depart') {
      var st0 = cy.etapes[0], kM = st0.phase === 'transfo' ? _lisse(Math.min(1, st0.t / st0.dTransfo)) : 0;
      if (st0.tA >= st0.fA) _halo(ctx, _mx(xm), ym, R_ATOME, coul, 0.9 * (1 - kM), pulse);
      _dessinerAtomeP(ctx, _mx(xm), ym, cy.maille.avant, 1);
      if (kM > 0) _dessinerAtomeP(ctx, _mx(xm), ym, cy.maille.apres, kM);
    }
  }

  // Espèces formées qui partent (derrière les autres)
  for (i = 0; i < cy.partants.length; i++) {
    var p = cy.partants[i];
    var ap = p.cle === 'H2O' ? 1 - _lisse(p.t / PL_D_DEPART) : 1;   // eau formée : se fond dans la solution
    _dessinerMotif(ctx, _mx(p.u), p.v, p.cle, p.angC, ap);
  }

  // Espèces accrochées, en attente de l'étape suivante
  var cour = cy.etapes[cy.k];
  for (var nom in cy.accroches) {
    if (enCours[nom]) continue;
    var A = cy.accroches[nom];
    var signale = cour && cour.n && cour.phase === 'approche' && cour.tA >= cour.fA &&
                  cour.def.avec && cour.def.avec.indexOf(nom) >= 0;
    if (signale) _halo(ctx, _mx(A.pos.u), A.pos.v, _rayonMotif(A.cle) * 0.8, coul, 0.9, pulse);
    _dessinerMotif(ctx, _mx(A.pos.u), A.pos.v, A.cle, A.ang, 1);
  }

  for (i = 0; i < cy.etapes.length; i++) {
    st = cy.etapes[i];
    if (st.phase === 'approche') {
      // Espèces qui arrivent (halo une fois arrivées, si l'étape échange un électron)
      for (k = 0; k < st.arr.length; k++) {
        var a = st.arr[k];
        var al = a.fondu ? Math.min(1, (st.tA - st.retard) / 0.6) : 1;
        if (st.n && st.tA >= st.fA) _halo(ctx, _mx(a.u), a.v, _rayonMotif(a.cle) * 0.8, coul, 0.9, pulse);
        _dessinerMotif(ctx, _mx(a.u), a.v, a.cle, a.angC, al);
      }
    } else if (st.phase === 'transfo') {
      var kT = _lisse(Math.min(1, st.t / st.dTransfo)), R = st.avec.concat(st.arr), P = st.apres;
      if (st.n) {
        for (k = 0; k < R.length; k++) _halo(ctx, _mx(R[k].pos.u), R[k].pos.v, _rayonMotif(R[k].cle) * 0.8, coul, 0.9 * (1 - kT), pulse);
      }
      // Atomes : de leur place dans les espèces qui réagissent à leur place
      // dans les espèces formées (ou depuis la maille, ou vers elle) ; un
      // ion d'un seul atome prend l'aspect d'un atome, ou l'inverse
      for (k = 0; k < st.liens.length; k++) {
        var l = st.liens[k];
        var At = l.ra >= 0 ? R[l.ra].atomes[l.ma] : null, Bt = l.pb >= 0 ? P[l.pb].atomes[l.mb] : null;
        var au = At ? R[l.ra].pos.u + At.du : xm, av = At ? R[l.ra].pos.v + At.dv : ym;
        var bu = Bt ? P[l.pb].pos.u + Bt.du : xm, bv = Bt ? P[l.pb].pos.v + Bt.dv : ym;
        var u = au + (bu - au) * kT, v = av + (bv - av) * kT;
        var alpha = !At ? kT : !Bt ? 1 - kT : 1;
        var ionA = At ? PL_MOTIFS[R[l.ra].cle].ion : null, ionB = Bt ? PL_MOTIFS[P[l.pb].cle].ion : null;
        var rr = At && Bt ? At.r + (Bt.r - At.r) * kT : (At || Bt).r;   // rayon : de celui du réactif à celui du produit
        if (ionA === ionB || !At || !Bt) _dessinerAtomeL(ctx, _mx(u), v, l.el, At ? ionA : ionB, alpha, rr);
        else {
          _dessinerAtomeL(ctx, _mx(u), v, l.el, ionA, alpha * (1 - kT), rr);
          _dessinerAtomeL(ctx, _mx(u), v, l.el, ionB, alpha * kT, rr);
        }
      }
      var charge = function (S, alq) {
        var q = PL_MOTIFS[S.cle].q;
        if (!q) return;
        var c = _placeCharge(S.atomes);
        _dessinerChargeL(ctx, _mx(S.pos.u) + sx * c.du, S.pos.v + c.dv, q, alq);
      };
      for (k = 0; k < R.length; k++) charge(R[k], 1 - kT);
      for (k = 0; k < P.length; k++) charge(P[k], kT);
    }
    // Électrons de l'étape, jusqu'au bout de leur trajet
    if (st.te !== undefined) {
      for (k = 0; k < st.electrons.length; k++) {
        var e = st.electrons[k];
        if (st.te < e.depart || e.s >= 1) continue;
        var q = _surLigne(e.chemin, e.s);
        _dessinerElectron(ctx, _mx(q.u + ploupe.offX), q.v);
      }
    }
  }
}

// ── Pont salin : gel entre deux parois de verre ───────────────────────
function _dessinerPontL(ctx) {
  ctx.fillStyle = '#fdf8f0';                    // air autour du tube
  ctx.fillRect(0, 0, 2 * RC, 2 * RC);
  ctx.fillStyle = '#f3f0e4';                    // gel
  ctx.fillRect(-1, 2.2, 2 * RC + 2, 6.6);
  ctx.fillStyle = 'rgba(111,127,140,0.55)';     // parois de verre
  ctx.fillRect(-1, 1.6, 2 * RC + 2, 0.6);
  ctx.fillRect(-1, 8.8, 2 * RC + 2, 0.6);
  for (var i = 0; i < ploupe.fond.length; i++) {
    var f = ploupe.fond[i];
    _dessinerEspeceL(ctx, f.u, f.v, f.type, f.sym, 1);
  }
}

// ── Membrane de la pile à combustible : chaînes du polymère, ions H⁺ ──
function _dessinerMembraneL(ctx) {
  ctx.fillStyle = rgbCss(nuance(COUL_MEMBRANE, 0.35));
  ctx.fillRect(0, 0, 2 * RC, 2 * RC);
  ctx.strokeStyle = rgbCss(nuance(COUL_MEMBRANE, -0.25), 0.6);
  ctx.lineWidth = 0.08;
  for (var j = 0; j < 6; j++) {
    var y0 = 0.9 + j * 1.85;
    ctx.beginPath();
    for (var x = -0.5; x <= 2 * RC + 0.5; x += 0.25) {
      var y = y0 + 0.25 * Math.sin(x * 1.7 + j * 1.3);
      if (x === -0.5) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (var i = 0; i < ploupe.fond.length; i++) {
    var f = ploupe.fond[i];
    _dessinerIonSimple(ctx, f.u, f.v, f.sym, 1);
  }
}

// ── Fil : gaine isolante, réseau du cuivre et électrons libres ─────────
function _dessinerFilL(ctx) {
  ctx.fillStyle = '#fdf8f0';
  ctx.fillRect(0, 0, 2 * RC, 2 * RC);
  ctx.fillStyle = '#c94a3a';                    // gaine plastique
  ctx.fillRect(-1, 1.6, 2 * RC + 2, 0.9);
  ctx.fillRect(-1, 8.5, 2 * RC + 2, 0.9);
  var colCu = couleurRGB(METAUX.Cu.atome);
  ctx.fillStyle = rgbCss(nuance(colCu, 0.6));
  ctx.fillRect(-1, 2.5, 2 * RC + 2, 6);
  // Réseau : atomes fixes, en quinconce
  for (var r = 0; r < 6; r++) {
    var v = 3.0 + r * 1.0;
    for (var c = -1; c < 13; c++) {
      var u = c + (r % 2 ? 0.5 : 0);
      _sphere(ctx, u, v, 0.36, colCu, 1);
      _etiquette(ctx, u, v, 'Cu', 0.26, colCu, 0.9);
    }
  }
  for (var i = 0; i < ploupe.fond.length; i++) _dessinerElectron(ctx, ploupe.fond[i].u, ploupe.fond[i].v);
}

// ── Traits du point visé vers la loupe ────────────────────────────────
function _dessinerTraitsLoupeP(ctx) {
  var z = zonesLoupe()[pile.zone];
  if (!z) return;
  var P = pileVersPx(z.x, z.y);
  var rs = R_ZONE * dispP.k;
  var ux = dispP.lx - P.x, uy = dispP.ly - P.y, d = Math.sqrt(ux * ux + uy * uy);
  if (d < 1) return;
  ux /= d; uy /= d;
  var nx = -uy, ny = ux;
  ctx.save();
  ctx.strokeStyle = 'rgba(90,106,120,0.75)';
  ctx.lineWidth = Math.max(1.2, dispP.k * 0.22);
  ctx.setLineDash([dispP.k * 1.0, dispP.k * 0.8]);
  ctx.beginPath();
  ctx.moveTo(P.x + nx * rs, P.y + ny * rs); ctx.lineTo(dispP.lx + nx * dispP.lr, dispP.ly + ny * dispP.lr);
  ctx.moveTo(P.x - nx * rs, P.y - ny * rs); ctx.lineTo(dispP.lx - nx * dispP.lr, dispP.ly - ny * dispP.lr);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#5a6a78';
  ctx.lineWidth = Math.max(1.5, dispP.k * 0.3);
  ctx.beginPath();
  ctx.arc(P.x, P.y, rs, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ── Titre au-dessus de la loupe, légende en dessous ───────────────────
function _dessinerTextesLoupeP(ctx) {
  var fs = Math.max(11, dispP.lr * 0.075);
  var largeur = Math.min(dispP.W, dispP.lr * 2.6);
  var haut = dispP.ly - dispP.lr - fs * 0.4;
  var bas = dispP.ly + dispP.lr + fs * 1.3;
  var titre, lignes = [], cotes = null;
  var I = pile.I;

  if (_estElectrode()) {
    var i = _indiceElectrode(), role = roleElectrode(i), r = reactionEnCours(i), c = compElectrode(i);
    titre = 'Électrode ' + METAUX[pile.lames[i].sym].de + ' vue à l’échelle des atomes';
    if (role === 'anode' && r) {
      lignes.push({ txt: 'Anode : oxydation  ' + texteDemiEquation(r, c), col: '#b04020' });
      lignes.push({ txt: 'Les électrons partent dans le fil' + (sensForce() ? ', vers le générateur' : ''), col: '#5a6a78' });
    } else if (role === 'cathode' && r) {
      lignes.push({ txt: 'Cathode : réduction  ' + texteDemiEquation(r, c), col: '#2a6aaa' });
      lignes.push({ txt: 'Les électrons arrivent par le fil' + (sensForce() ? ', venant du générateur' : ''), col: '#5a6a78' });
    } else {
      lignes.push({ txt: 'Pas de courant : aucun échange d’électrons', col: '#5a6a78' });
    }
  } else if (ploupe.zone === 'pont' && enPac()) {
    titre = 'Membrane vue à l’échelle des ions';
    if (I === 0) lignes.push({ txt: 'Pas de courant : agitation sans déplacement d’ensemble', col: '#5a6a78' });
    else lignes.push({ txt: 'Les ions H⁺ traversent la membrane vers la cathode (côté ' + (I > 0 ? 'O₂' : 'H₂') + ')', col: '#5a6a78' });
    cotes = ['côté H₂', 'côté O₂'];
  } else if (ploupe.zone === 'pont') {
    titre = 'Pont salin vu à l’échelle des ions';
    if (!pile.pont) lignes.push({ txt: 'Pont salin sorti des solutions', col: '#5a6a78' });
    else if (I === 0) lignes.push({ txt: 'Pas de courant : agitation sans déplacement d’ensemble', col: '#5a6a78' });
    else {
      var cat = METAUX[pile.lames[I > 0 ? 1 : 0].sym].nom, an = METAUX[pile.lames[I > 0 ? 0 : 1].sym].nom;
      lignes.push({ txt: 'K⁺ vers la cathode (' + cat + '), NO₃⁻ vers l’anode (' + an + ')', col: '#5a6a78' });
    }
    if (pile.pont) cotes = ['côté ' + METAUX[pile.lames[0].sym].nom, 'côté ' + METAUX[pile.lames[1].sym].nom];
  } else {
    titre = 'Fil de connexion en cuivre vu à l’échelle des atomes';
    if (I === 0) lignes.push({ txt: 'Pas de courant : les électrons s’agitent sans se déplacer dans l’ensemble', col: '#5a6a78' });
    else lignes.push({ fleches: true });
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#5a6a78';
  _texteAjuste(ctx, titre, dispP.lx, haut, fs, '600', largeur);

  ctx.textBaseline = 'middle';
  for (var k = 0; k < lignes.length; k++) {
    var y = bas + k * fs * 1.35;
    if (lignes[k].fleches) { _flechesFil(ctx, y, fs); continue; }
    ctx.fillStyle = lignes[k].col;
    _texteAjuste(ctx, lignes[k].txt, dispP.lx, y, fs, k === 0 ? '700' : '600', largeur);
  }

  // Repères de côté sous la loupe (pont, membrane) : vers quelle électrode
  if (cotes) {
    var fs2 = fs * 0.85;
    ctx.font = '600 ' + fs2 + 'px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#7a8a96';
    ctx.textAlign = 'left';
    ctx.fillText('← ' + cotes[0], dispP.lx - dispP.lr, dispP.ly + dispP.lr + fs * 0.1);
    ctx.textAlign = 'right';
    ctx.fillText(cotes[1] + ' →', dispP.lx + dispP.lr, dispP.ly + dispP.lr + fs * 0.1);
    ctx.textAlign = 'center';
  }
}

// Texte réduit si besoin pour tenir dans la largeur disponible
function _texteAjuste(ctx, txt, x, y, fs, poids, largeur) {
  ctx.font = poids + ' ' + fs + 'px "Segoe UI", Arial, sans-serif';
  var w = ctx.measureText(txt).width;
  if (w > largeur) ctx.font = poids + ' ' + (fs * largeur / w) + 'px "Segoe UI", Arial, sans-serif';
  ctx.fillText(txt, x, y);
}

// Sous la loupe du fil : sens du courant (rouge) et sens de déplacement
// des électrons (bleu), opposés
function _flechesFil(ctx, y, fs) {
  var droite = pile.I > 0;          // électrons vers la droite si I > 0
  var L = dispP.lr * 0.5, x1 = dispP.lx - dispP.lr * 0.55, x2 = dispP.lx + dispP.lr * 0.55;
  _flecheH(ctx, x1, y, L, droite ? -1 : 1, '#cc2200', 'courant', fs);
  _flecheH(ctx, x2, y, L, droite ? 1 : -1, '#2a6aaa', 'électrons', fs);
}

function _flecheH(ctx, xc, y, L, sens, couleur, txt, fs) {
  var a = xc - sens * L / 2, b = xc + sens * L / 2;
  ctx.strokeStyle = couleur;
  ctx.fillStyle = couleur;
  ctx.lineWidth = Math.max(2, fs * 0.16);
  ctx.beginPath();
  ctx.moveTo(a, y); ctx.lineTo(b - sens * fs * 0.5, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(b, y);
  ctx.lineTo(b - sens * fs * 0.7, y - fs * 0.4);
  ctx.lineTo(b - sens * fs * 0.7, y + fs * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.font = '700 ' + (fs * 0.9) + 'px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(txt, xc, y + fs * 0.95);
}
