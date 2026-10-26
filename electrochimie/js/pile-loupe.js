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
//      la demi-équation viennent contre la surface (ions de la solution,
//      molécules d'eau ou de gaz), les électrons partent vers le fil ou en
//      arrivent, puis les produits se forment : les molécules de gaz
//      gonflent une bulle accrochée à l'électrode, qui se détache et
//      monte ; les ions rejoignent la solution, l'eau formée s'y fond.
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
var PL_D_APPROCHE = 2.0;          // ion qui vient contre la surface (cathode)
// Transformation (atome ↔ ion, réactifs → produits) synchronisée avec les
// électrons : elle commence quand le premier électron quitte l'espèce
// oxydée (ou atteint l'espèce réduite) et s'achève quand le dernier l'a
// quittée (ou l'a atteinte), plus PL_D_CHANGE ; au moins PL_D_TRANSFO_MIN
var PL_D_CHANGE   = 0.12;
var PL_D_TRANSFO_MIN = 0.3;
var PL_D_DEPART   = 2.2;          // ion formé qui s'éloigne de l'anode, produits qui partent
var PL_ECART_E    = 0.25;         // entre les départs de deux électrons (s)
var PL_X_SORTIE   = 1.5;          // colonne par laquelle les électrons rejoignent le fil
var PL_FRONT_MIN  = 3, PL_FRONT_MAX = 6;   // bornes de la surface avant que la vue la suive
var PL_V_DERIVE   = 0.75;         // dérive des ions de la solution à I_REF (cases/s)
var PL_V_FIL      = 1.4;          // dérive des électrons du fil à I_REF (cases/s)
var PL_T_GLISSE   = 0.8;          // durée du glissement de la vue (s)
var PL_ECART_V    = 0.95;         // écart vertical entre les réactifs d'un cycle gazeux
var PL_N_BULLE    = 3;            // molécules de gaz d'une bulle avant qu'elle se détache
var PL_V_BULLE    = 1.6;          // montée d'une bulle détachée (cases/s)

// Atomes des molécules : couleur et rayon (cases)
var PL_ATOMES_MOL = {
  H:  { couleur: '#eef1f4', r: 0.22 },
  O:  { couleur: '#d9473b', r: 0.30 },
  Cl: { couleur: '#6dbb48', r: 0.34 }
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
  if (role && ploupe.attente <= 0 && ploupe.cycles.length < 2 && ploupe.offX === 0) {
    var reac = reactionEnCours(e), cy = null, nE = 2;
    if (reac && reac.type === 'metal') {
      if (!_suivreSurface(role)) cy = role === 'anode' ? _cycleAnode() : _cycleCathode(reac.sym);
    } else if (reac) {
      cy = _cycleGaz(reac);
      nE = reac.z;
    }
    if (cy) ploupe.cycles.push(cy);
    // Intervalle entre deux cycles : 1,6 s à I_REF, plus long si I est
    // faible, et pour une réaction qui échange 4 électrons
    ploupe.attente = Math.min(7, 1.6 / Math.max(0.23, facteurCourant())) * Math.max(1, nE / 2);
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
    if (!f.sort) { if (f.type === 'cation') nCat++; else nAn++; }
    _agiter(f, dt, 1);
    var d = f.type === 'cation' ? dir : -dir;
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
// Espèce d'une demi-équation → particule de la loupe
function _particuleEspece(cle) {
  if (cle === 'H+') return { k: 'cation', sym: 'H', r: R_ION };
  if (cle === 'HO-') return { k: 'anion', sym: 'OH', r: R_ANION };
  if (cle === 'Cl-') return { k: 'anion', sym: 'Cl', r: R_ANION };
  if (cle === 'SO42-') return { k: 'anion', sym: 'SO4', r: R_ANION };
  return { k: 'mol', sym: cle, r: cle === 'H2O' ? 0.42 : cle === 'H2' ? 0.42 : cle === 'O2' ? 0.55 : 0.62 };
}

// Les réactifs de la demi-équation viennent contre la surface, sur des
// lignes voisines libres ; les produits se forment au même endroit
function _cycleGaz(reac) {
  var e = _indiceElectrode(), d = demiEquation(reac, compElectrode(e));
  // Solides de la demi-équation ('M:…', accumulateur) : une maille du
  // réseau qui se transforme sur place ; les autres espèces viennent de la
  // solution ou y partent
  var R = [], P = [], k, r, avant = null, apres = null;
  d.gauche.forEach(function (p) {
    if (p[1].charAt(1) === ':') { avant = p[1].slice(2); return; }
    for (var j = 0; j < p[0]; j++) R.push(_particuleEspece(p[1]));
  });
  d.droite.forEach(function (p) {
    if (p[1].charAt(1) === ':') { apres = p[1].slice(2); return; }
    for (var j = 0; j < p[0]; j++) P.push(_particuleEspece(p[1]));
  });

  // Hauteur du cycle : lignes libres sur toute la hauteur occupée
  var span = (Math.max(R.length, P.length, 1) - 1) * PL_ECART_V, vc = -1, r0 = 0, r1 = 0, maille = null;
  var bornes = function (v) {
    r0 = Math.max(0, Math.floor(v - span / 2 - 0.45));
    r1 = Math.min(NR - 1, Math.floor(v + span / 2 + 0.45));
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
      var vm = Math.max(0.6 + span / 2, Math.min(NR - 0.6 - span / 2, cands[k].r + 0.5));
      if (bornes(vm) && !ploupe.occupe[cands[k].r]) { maille = cands[k]; vc = vm; }
    }
    if (!maille) return null;
    r0 = Math.min(r0, maille.r); r1 = Math.max(r1, maille.r);
  } else {
    for (var essai = 0; essai < 25 && vc < 0; essai++) {
      var v0 = 1.2 + span / 2 + Math.random() * (NR - 2.4 - span);
      if (bornes(v0)) vc = v0;
    }
  }
  if (vc < 0) return null;
  for (r = r0; r <= r1; r++) ploupe.occupe[r] = true;

  var cy = { type: 'gaz', ox: reac.ox, phase: 'approche', t: 0, r0: r0, r1: r1, vc: vc,
             reactifs: [], produits: [], electrons: [], gaz: gazDegage(reac),
             maille: maille ? { r: maille.r, c: maille.c, avant: avant, apres: apres } : null };
  var contre = function (v, rayon) {
    return { u: _bordMetal(v) - 0.5 + R_ATOME + rayon + 0.03, v: v };
  };
  for (k = 0; k < R.length; k++) {
    var p = R[k], v = Math.max(0.6, Math.min(NR - 0.6, vc + (k - (R.length - 1) / 2) * PL_ECART_V));
    var cible = contre(v, p.r), dep, fondu = false;
    var io = p.k === 'mol' ? null : _prendreIon(p.k, p.sym, cible);
    if (io) dep = { u: io.u, v: io.v };
    else { dep = { u: 2 * RC - 0.6 - Math.random() * 1.5, v: Math.max(0.6, Math.min(NR - 0.6, v + (Math.random() - 0.5) * 4)) }; fondu = true; }
    cy.reactifs.push({ k: p.k, sym: p.sym, r: p.r, dep: dep, cible: cible, u: dep.u, v: dep.v, fondu: fondu });
  }
  for (k = 0; k < P.length; k++) {
    var q = P[k], vq = Math.max(0.6, Math.min(NR - 0.6, vc + (k - (P.length - 1) / 2) * PL_ECART_V));
    var pos = contre(vq, q.r);
    cy.produits.push({ k: q.k, sym: q.sym, r: q.r, pos: pos, u: pos.u, v: pos.v,
                       vers: { u: pos.u + 1.8 + Math.random() * 1.2, v: pos.v + (Math.random() - 0.5) * 2 } });
  }
  // Électrons : de chaque réactif vers le fil (oxydation), ou du fil vers
  // eux (réduction), à travers l'électrode
  // (accumulateur : c'est la maille qui cède ou reçoit les électrons)
  for (k = 0; k < d.n; k++) {
    var ch;
    if (cy.maille) {
      var vm2 = cy.maille.r + 0.5;
      ch = [{ u: cy.maille.c + 0.5, v: vm2 }, { u: PL_X_SORTIE, v: vm2 }, { u: PL_X_SORTIE, v: -1.5 }];
    } else {
      var s = cy.reactifs[k % cy.reactifs.length], ve = s.cible.v;
      ch = [{ u: s.cible.u, v: ve }, { u: _bordMetal(ve) - 0.5, v: ve }, { u: PL_X_SORTIE, v: ve }, { u: PL_X_SORTIE, v: -1.5 }];
    }
    if (!reac.ox) ch.reverse();
    cy.electrons.push({ chemin: ch, depart: k * PL_ECART_E, s: 0 });
  }
  var Lmax = 0, arr0 = Infinity, arr1 = 0;
  for (k = 0; k < cy.electrons.length; k++) {
    var Lk = _longueurChemin(cy.electrons[k].chemin);
    Lmax = Math.max(Lmax, Lk);
    arr0 = Math.min(arr0, cy.electrons[k].depart + Lk / V_ELECTRON);   // arrivées (réduction)
    arr1 = Math.max(arr1, cy.electrons[k].depart + Lk / V_ELECTRON);
  }
  cy.dElectrons = (d.n - 1) * PL_ECART_E + Lmax / V_ELECTRON;
  // Oxydation : pendant que les électrons quittent les réactifs ;
  // réduction : pendant qu'ils les atteignent
  if (reac.ox) _horaireTransfo(cy, 0, (d.n - 1) * PL_ECART_E + 0.6 / V_ELECTRON);
  else _horaireTransfo(cy, arr0, arr1);
  return cy;
}

function _majCycleGaz(cy, dt) {
  var k, s;
  if (cy.phase === 'approche') {
    s = _lisse(cy.t / PL_D_APPROCHE);
    for (k = 0; k < cy.reactifs.length; k++) {
      var a = cy.reactifs[k];
      a.u = a.dep.u + (a.cible.u - a.dep.u) * s;
      a.v = a.dep.v + (a.cible.v - a.dep.v) * s;
    }
    if (cy.t >= PL_D_APPROCHE) { cy.phase = 'signal'; cy.t = 0; }
  } else if (cy.phase === 'signal' && cy.t >= PL_D_SIGNAL * 0.6) {
    _lancerElectrons(cy);
  } else if (cy.phase === 'electrons') {
    _debutTransfo(cy);
  } else if (cy.phase === 'transfo') {
    if (cy.t >= cy.dTransfo) {
      cy.phase = 'depart'; cy.t = 0;
      // La maille transformée fait désormais partie du réseau
      if (cy.maille) {
        ploupe.rangs[cy.maille.r][cy.maille.c] = cy.maille.apres;
        _completerBords();
      }
      // Bulle où vont les molécules de gaz formées
      if (cy.gaz && !ploupe.bulle) {
        ploupe.bulle = { v: Math.max(0.9, Math.min(NR - 0.9, cy.vc - 1.2)), n: 0, gaz: cy.gaz };
      }
    }
  } else if (cy.phase === 'depart') {
    s = _lisse(cy.t / PL_D_DEPART);
    for (k = 0; k < cy.produits.length; k++) {
      var p = cy.produits[k], vers = p.vers;
      if (p.sym === cy.gaz && ploupe.bulle) vers = _centreBulle();
      p.u = p.pos.u + (vers.u - p.pos.u) * s;
      p.v = p.pos.v + (vers.v - p.pos.v) * s;
    }
    if (cy.t >= PL_D_DEPART && cy.te >= cy.dElectrons) {
      for (k = 0; k < cy.produits.length; k++) {
        var q = cy.produits[k];
        if (q.sym === cy.gaz) _gonflerBulle(cy.gaz);
        else if (q.k !== 'mol') {
          ploupe.fond.push({ type: q.k, sym: q.sym, r: q.r, u: q.u, v: q.v,
                             vu: _gauss() * 0.3, vv: _gauss() * 0.3, vis: 1 });
        }
      }
      for (var r = cy.r0; r <= cy.r1; r++) ploupe.occupe[r] = false;
      return true;
    }
  }
  return false;
}

// ── Bulles de la loupe ────────────────────────────────────────────────
function _rayonBulle(n) { return 0.38 + 0.3 * Math.sqrt(n); }

// Centre de la bulle accrochée : elle touche la face de l'électrode
function _centreBulle() {
  var b = ploupe.bulle, rb = _rayonBulle(Math.max(1, b.n));
  return { u: _bordMetal(b.v) - 0.5 + R_ATOME + rb, v: b.v };
}

function _gonflerBulle(gaz) {
  if (!ploupe.bulle) ploupe.bulle = { v: 3 + Math.random() * 5, n: 0, gaz: gaz };
  ploupe.bulle.n++;
  if (ploupe.bulle.n >= PL_N_BULLE) {
    // Assez grosse : elle se détache et monte
    var c = _centreBulle();
    ploupe.bullesLibres.push({ u: c.u, v: c.v, r: _rayonBulle(ploupe.bulle.n), gaz: gaz });
    ploupe.bulle = null;
  }
}

function _majBullesL(dt) {
  var B = ploupe.bullesLibres;
  for (var k = B.length - 1; k >= 0; k--) {
    B[k].v -= PL_V_BULLE * dt;
    B[k].u += 0.35 * dt;
    if (B[k].v < -B[k].r - 0.5) B.splice(k, 1);
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
      if (cy.t >= PL_D_APPROCHE) { cy.phase = 'signal'; cy.t = 0; }
    } else if (cy.phase === 'signal' && cy.t >= PL_D_SIGNAL * 0.6) {
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

// Ion ou molécule de la loupe, quel qu'il soit
function _dessinerEspeceL(ctx, x, y, k, sym, alpha) {
  if (alpha <= 0) return;
  if (k === 'anion') _dessinerAnion(ctx, x, y, sym, alpha);
  else if (k === 'mol') _dessinerMoleculeL(ctx, x, y, sym, alpha);
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

// Molécules : H₂O (coudée), H₂, O₂, Cl₂ (deux atomes côte à côte)
function _dessinerMoleculeL(ctx, x, y, sym, alpha) {
  var at = [];
  if (sym === 'H2O') {
    at = [['H', x - 0.2, y - 0.25], ['H', x - 0.2, y + 0.25], ['O', x + 0.1, y]];
  } else {
    var el = sym === 'H2' ? 'H' : sym === 'O2' ? 'O' : 'Cl';
    var d = PL_ATOMES_MOL[el].r * 0.85;
    at = [[el, x - d, y], [el, x + d, y]];
  }
  for (var k = 0; k < at.length; k++) {
    var A = PL_ATOMES_MOL[at[k][0]], rgb = couleurRGB(A.couleur);
    _sphere(ctx, at[k][1], at[k][2], A.r, rgb, alpha);
    ctx.strokeStyle = rgbCss(nuance(rgb, -0.4), 0.7 * alpha);
    ctx.lineWidth = 0.025;
    ctx.stroke();
    _etiquette(ctx, at[k][1], at[k][2], at[k][0], A.r * 0.85, rgb, alpha);
  }
}

// Bulle de gaz : disque clair (jaune-vert pour le dichlore), reflet, nom du gaz
function _dessinerBulleL(ctx, x, y, r, gaz, alpha) {
  var cl = gaz === 'Cl2';
  ctx.fillStyle = cl ? 'rgba(215,235,120,' + 0.55 * alpha + ')' : 'rgba(255,255,255,' + 0.55 * alpha + ')';
  ctx.strokeStyle = cl ? 'rgba(120,150,40,' + 0.85 * alpha + ')' : 'rgba(70,100,130,' + 0.75 * alpha + ')';
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,' + 0.9 * alpha + ')';
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.72, -2.6, -1.8);
  ctx.stroke();
  ctx.fillStyle = 'rgba(44,62,80,' + 0.85 * alpha + ')';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  texteEchelle(ctx, ESPECES[gaz].txt, x, y, Math.min(0.42, r * 0.7), '700', echelleParticules);
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
    _dessinerEspeceL(ctx, _mx(f.u), f.v, f.type, f.sym, (f.type === 'anion' ? ALPHA_ANION : 0.55) * a);
  }

  // Bulles détachées qui montent
  for (i = 0; i < ploupe.bullesLibres.length; i++) {
    var b = ploupe.bullesLibres[i];
    _dessinerBulleL(ctx, _mx(b.u), b.v, b.r, b.gaz, Math.max(0, Math.min(1, (b.v + b.r + 0.5) / 1.5)));
  }

  // Ions formés à l'anode qui s'éloignent : derrière le réseau
  for (i = 0; i < ploupe.cycles.length; i++) {
    var cy = ploupe.cycles[i];
    if (cy.type === 'anode' && cy.phase === 'depart') {
      _halo(ctx, _mx(cy.u + ploupe.offX), cy.v, R_ION, COUL_OX, Math.max(0, 1 - cy.t / 1.3), 0.5);
      _dessinerIon(ctx, _mx(cy.u + ploupe.offX), cy.v, cy.sym, 1, R_ION);
    }
  }

  // Réseau : masse claire derrière, puis les atomes (élément de chacun :
  // électrode ou dépôt)
  ctx.fillStyle = rgbCss(nuance(couleurRGB(METAUX[lame].atome), 0.55));
  for (r = 0; r < NR; r++) {
    var x1 = _front(r) + ploupe.offX + 0.5;
    var xa = _mx(-2), xb = _mx(x1);
    ctx.fillRect(Math.min(xa, xb), r, Math.abs(xb - xa), 1.02);
  }
  for (r = 0; r < NR; r++) {
    for (c = -2; c < _front(r); c++) {
      if (_atomeEnCycle(r, c)) continue;
      _dessinerAtomeP(ctx, _mx(c + 0.5 + ploupe.offX), r + 0.5, c < 0 ? lame : ploupe.rangs[r][c], 1);
    }
  }

  // Bulle accrochée à l'électrode
  if (ploupe.bulle && ploupe.bulle.n > 0) {
    var cb = _centreBulle();
    _dessinerBulleL(ctx, _mx(cb.u), cb.v, _rayonBulle(ploupe.bulle.n), ploupe.bulle.gaz, 1);
  }

  // Acteurs des cycles
  var pulse = 0.5 + 0.5 * Math.sin(performance.now() / 170);
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
    if (cy.phase !== 'depart') {     // en partant, l'ion est dessiné derrière le réseau
      var x = _mx(cy.u + dx);
      var kOx = cy.phase === 'transfo' ? Math.min(1, cy.t / cy.dTransfo) : 0;
      _halo(ctx, x, cy.v, R_ATOME, COUL_OX, 0.9, kOx > 0 ? 1 : pulse);
      if (kOx > 0) _dessinerTransition(ctx, x, cy.v, sym, kOx, true);
      else _dessinerAtome(ctx, x, cy.v, sym, 1);
    }
  } else {
    var xi = _mx(cy.u + dx);
    if (cy.phase === 'transfo') {
      var kRed = Math.min(1, cy.t / cy.dTransfo);
      _halo(ctx, xi, cy.v, R_ION, COUL_RED, 0.9 * (1 - kRed), 1);
      _dessinerTransition(ctx, xi, cy.v, sym, kRed, false);
    } else {
      _halo(ctx, xi, cy.v, R_ION, COUL_RED, cy.phase === 'approche' ? 0.8 : 0.9, cy.phase === 'approche' ? 0.5 : pulse);
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

// Réactifs signalés (rouge : oxydés, bleu : réduits), puis fondu vers les
// produits, qui partent : le gaz dans la bulle, les ions dans la solution,
// l'eau s'y fond
function _dessinerCycleGaz(ctx, cy, pulse) {
  var k, coul = cy.ox ? COUL_OX : COUL_RED;
  var fondu = cy.phase === 'transfo' ? _lisse(Math.min(1, cy.t / cy.dTransfo)) : cy.phase === 'depart' ? 1 : 0;
  // Maille de l'accumulateur : signalée, puis fondu vers le solide formé
  if (cy.maille && cy.phase !== 'depart') {
    var xm = _mx(cy.maille.c + 0.5 + ploupe.offX), ym = cy.maille.r + 0.5;
    if (cy.phase !== 'approche') _halo(ctx, xm, ym, R_ATOME, coul, 0.9 * (1 - fondu), pulse);
    _dessinerAtomeP(ctx, xm, ym, cy.maille.avant, 1);
    if (fondu > 0) _dessinerAtomeP(ctx, xm, ym, cy.maille.apres, fondu);
  }
  if (fondu < 1) {
    for (k = 0; k < cy.reactifs.length; k++) {
      var a = cy.reactifs[k], x = _mx(a.u);
      var alpha = (a.fondu && cy.phase === 'approche' ? Math.min(1, cy.t / 0.6) : 1) * (1 - fondu);
      var rh = a.k === 'mol' ? a.r * 0.75 : a.r;
      if (cy.phase !== 'approche') _halo(ctx, x, a.v, rh, coul, 0.9 * (1 - fondu), pulse);
      _dessinerEspeceL(ctx, x, a.v, a.k, a.sym, alpha);
    }
  }
  if (fondu > 0) {
    for (k = 0; k < cy.produits.length; k++) {
      var p = cy.produits[k];
      var ap = fondu;
      if (cy.phase === 'depart' && p.k === 'mol' && p.sym !== cy.gaz) ap = 1 - _lisse(cy.t / PL_D_DEPART);   // eau formée : se fond dans la solution
      if (cy.phase === 'depart' && p.sym === cy.gaz) ap = 1 - 0.6 * _lisse((cy.t / PL_D_DEPART - 0.7) / 0.3);
      _dessinerEspeceL(ctx, _mx(p.u), p.v, p.k, p.sym, ap);
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
