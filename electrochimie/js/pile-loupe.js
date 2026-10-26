// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  pile-loupe.js — Onglet Pile et électrolyse : loupes microscopiques
//  Dépend de sim.js, loupe.js (dimensions de la loupe NR, RC, CU, CV,
//  rayons des particules, dessin des atomes, ions et électrons) et
//  pile.js (état de la pile, disposition dispP).
//
//  Quatre endroits du montage, au choix (zones cliquables ou panneau) :
//    - électrode de gauche ou de droite : réseau du métal et solution.
//      Un CYCLE par atome, sur le modèle de l'onglet Oxydoréduction mais
//      les électrons passent par le fil :
//        anode   : un atome de la surface est signalé, ses électrons
//                  partent dans le métal vers le fil (haut de la loupe),
//                  il devient ion et part dans la solution ;
//        cathode : un ion de la solution vient contre la surface, des
//                  électrons arrivent du fil à travers le métal, l'ion
//                  devient atome et s'ajoute au réseau.
//      Le réseau garde l'élément de chaque atome : un dépôt d'un autre
//      métal (zinc sur fer) se voit, et c'est lui qui s'oxyde d'abord.
//      Cadence des cycles réglée par l'intensité ; aucun cycle sans
//      courant. Le réseau recule (anode) ou avance (cathode) et la vue le
//      suit. Les ions de la solution migrent : cations dans le sens du
//      courant, anions en sens inverse.
//    - pont salin : K⁺ et NO₃⁻ dans le gel, qui migrent en sens inverses ;
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
var PL_D_TRANSFO  = 0.8;          // ion → atome à la cathode
var PL_D_OXYDATION = 0.4;         // atome → ion à l'anode, après le départ de ses électrons
var PL_D_DEPART   = 2.2;          // ion formé qui s'éloigne de l'anode
var PL_ECART_E    = 0.25;         // entre les départs de deux électrons (s)
var PL_X_SORTIE   = 1.5;          // colonne par laquelle les électrons rejoignent le fil
var PL_FRONT_MIN  = 3, PL_FRONT_MAX = 6;   // bornes de la surface avant que la vue la suive
var PL_V_DERIVE   = 0.75;         // dérive des ions de la solution à I_REF (cases/s)
var PL_V_FIL      = 1.4;          // dérive des électrons du fil à I_REF (cases/s)
var PL_T_GLISSE   = 0.8;          // durée du glissement de la vue (s)

var ploupe = {
  zone: '',
  rangs: [],          // électrodes : éléments des atomes de chaque ligne, du fond vers la surface
  occupe: [],         // ligne engagée dans un cycle
  offX: 0,            // décalage du réseau pendant un glissement
  cycles: [],
  attente: 0,         // délai avant le prochain cycle (s)
  fond: [],           // ions de la solution, du pont, ou électrons du fil
  horloge: 0
};

// ══════════════════════════════════════════════════════════════════════
//  RAZ (à chaque changement de zone, de demi-pile ou RAZ de la pile)
// ══════════════════════════════════════════════════════════════════════

function resetLoupePile() {
  var i, r;
  if (pile.zone === 'pont' && enCuve()) pile.zone = 'gauche';
  ploupe.zone = pile.zone;
  ploupe.rangs = []; ploupe.occupe = [];
  ploupe.offX = 0;
  ploupe.cycles = [];
  ploupe.attente = 0.5;
  ploupe.fond = [];
  ploupe.horloge = 0;

  if (_estElectrode()) {
    // Réseau : métal de la lame, et une ou deux colonnes du dépôt s'il y en a
    var e = _indiceElectrode(), lame = pile.lames[e].sym;
    var nDep = depotTotal(e) > 0.01 ? 2 : depotTotal(e) > 1e-4 ? 1 : 0;
    for (r = 0; r < NR; r++) {
      var ligne = [];
      for (i = 0; i < COL_INIT; i++) ligne.push(i < COL_INIT - nDep ? lame : surfaceLame(e));
      ploupe.rangs.push(ligne);
      ploupe.occupe.push(false);
    }
    // Cations de la solution selon la composition du compartiment
    var c = compElectrode(e), tot = cationsTotal(c), n = pile.comp[c].n;
    for (var sym in n) {
      var part = tot > 0 ? concentrationC(c, sym) / tot : 0;
      var nb = Math.round(PL_N_CATIONS * part);
      if (!nb && part > 0.03) nb = 1;
      for (i = 0; i < nb; i++) ploupe.fond.push(_nouvelIon('cation', sym, R_ION));
    }
    for (i = 0; i < PL_N_ANIONS; i++) ploupe.fond.push(_nouvelIon('anion', pile.comp[c].anion, R_ANION));
  } else if (ploupe.zone === 'pont') {
    for (i = 0; i < 18; i++) {
      var cat = i % 2 === 0;
      ploupe.fond.push({ type: cat ? 'cation' : 'anion', sym: cat ? 'K' : 'NO3', r: cat ? R_ION : R_ANION,
                         u: Math.random() * 2 * RC, v: 2.6 + Math.random() * 5.8,
                         vu: _gauss() * 0.4, vv: _gauss() * 0.4, vis: 1 });
    }
  } else {
    for (i = 0; i < 18; i++) {
      ploupe.fond.push({ type: 'electron', r: R_ELECTRON,
                         u: Math.random() * 2 * RC, v: 2.8 + Math.random() * 5.4,
                         vu: _gauss() * 1.2, vv: _gauss() * 1.2, vis: 1 });
    }
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

// Bord de la surface métallique à la hauteur v (abscisse de la face)
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
  var i;
  // Glissement de la vue en cours
  if (ploupe.offX !== 0) {
    var pasG = dt / PL_T_GLISSE;
    ploupe.offX = Math.abs(ploupe.offX) <= pasG ? 0 : ploupe.offX - Math.sign(ploupe.offX) * pasG;
  }

  // Nouveau cycle selon le rôle de l'électrode et l'intensité
  var role = roleElectrode(_indiceElectrode());
  ploupe.attente -= dt;
  if (role && ploupe.attente <= 0 && ploupe.cycles.length < 2 && ploupe.offX === 0) {
    if (!_suivreSurface(role)) {
      var cy = role === 'anode' ? _cycleAnode() : _cycleCathode();
      if (cy) ploupe.cycles.push(cy);
    }
    // Intervalle entre deux cycles : 1,6 s à I_REF, plus long si I est faible
    ploupe.attente = Math.min(7, 1.6 / Math.max(0.23, facteurCourant()));
  }

  for (i = ploupe.cycles.length - 1; i >= 0; i--) {
    if (_majCycleP(ploupe.cycles[i], dt)) ploupe.cycles.splice(i, 1);
  }

  // Ions de la solution : agitation + migration. Cations dans le sens du
  // courant (vers la droite si I > 0), anions en sens inverse ; en miroir
  // pour l'électrode de droite.
  var dir = _signeI() * (ploupe.zone === 'gauche' ? 1 : -1) * PL_V_DERIVE * facteurCourant();
  var nCat = 0;
  for (i = ploupe.fond.length - 1; i >= 0; i--) {
    var f = ploupe.fond[i];
    if (f.sort) {
      f.vis -= dt / D_FONDU;
      if (f.vis <= 0) { ploupe.fond.splice(i, 1); continue; }
    } else if (f.vis < 1) {
      f.vis = Math.min(1, f.vis + dt / D_FONDU);
    }
    if (f.type === 'cation' && !f.sort) nCat++;
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
  // Les cycles de l'anode ajoutent des cations : on garde un nombre stable
  if (nCat > PL_N_CATIONS + 2) {
    var loin = null;
    for (i = 0; i < ploupe.fond.length; i++) {
      var g = ploupe.fond[i];
      if (g.type === 'cation' && !g.sort && (!loin || g.u > loin.u)) loin = g;
    }
    if (loin) loin.sort = true;
  }
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
  var z = METAUX[sym].charge;
  ploupe.occupe[r] = true;
  var cy = { type: 'anode', sym: sym, r: r, c: c, u: c + 0.5, v: r + 0.5, phase: 'signal', t: 0,
             electrons: [], tOx: 0, du: 0, dv: 0 };
  var ch = _cheminVersFil(cy.u, cy.v);
  for (var k = 0; k < z; k++) cy.electrons.push({ chemin: ch, depart: k * PL_ECART_E, s: 0 });
  var L = _longueurChemin(ch);
  // L'atome devient ion dès que son dernier électron l'a quitté
  cy.tOx = (z - 1) * PL_ECART_E + 0.6 / V_ELECTRON;
  cy.dElectrons = (z - 1) * PL_ECART_E + L / V_ELECTRON;
  cy.du = 2.6 + Math.random() * 1.2;
  cy.dv = (Math.random() - 0.5) * 2.4;
  return cy;
}

function _cycleCathode() {
  var e = _indiceElectrode();
  var sym = cationReduit(e);
  if (!sym) return null;
  var r = _ligneCandidate(false, null);
  if (r < 0) return null;
  var z = METAUX[sym].charge, front = _front(r);
  ploupe.occupe[r] = true;
  var cible = { u: front - 0.5 + DIST_CONTACT, v: r + 0.5 };   // ion contre l'atome de surface
  var fin = { u: front + 0.5, v: r + 0.5 };                     // place de l'atome formé
  // L'ion qui vient se réduire : le plus proche des ions de cet élément ;
  // un autre arrive du reste de la solution pour le remplacer
  var io = null;
  for (var i = 0; i < ploupe.fond.length; i++) {
    var f = ploupe.fond[i];
    if (f.type !== 'cation' || f.sym !== sym || f.sort || f.vis < 1) continue;
    if (!io || Math.hypot(f.u - cible.u, f.v - cible.v) < Math.hypot(io.u - cible.u, io.v - cible.v)) io = f;
  }
  var dep;
  if (io) {
    dep = { u: io.u, v: io.v };
    ploupe.fond.splice(ploupe.fond.indexOf(io), 1);
    var rempl = _nouvelIon('cation', sym, R_ION, 0);
    _placerDansSolution(rempl, true);
    ploupe.fond.push(rempl);
  } else {
    dep = { u: 2 * RC + 0.5, v: 1 + Math.random() * 9 };
  }
  var cy = { type: 'cathode', sym: sym, r: r, phase: 'approche', t: 0, cible: cible, fin: fin,
             trajet: [dep, { u: cible.u + 2.2, v: (dep.v + cible.v) / 2 }, { u: cible.u + 1.0, v: cible.v }, cible],
             u: dep.u, v: dep.v, electrons: [] };
  // Électrons venus du fil : dans le métal jusqu'à l'atome de surface, puis l'ion
  var ch = [{ u: PL_X_SORTIE, v: -1.5 }, { u: PL_X_SORTIE, v: r + 0.5 },
            { u: front - 0.5, v: r + 0.5 }, { u: cible.u, v: cible.v }];
  for (var k = 0; k < z; k++) cy.electrons.push({ chemin: ch, depart: k * PL_ECART_E, s: 0 });
  cy.dElectrons = (z - 1) * PL_ECART_E + _longueurChemin(ch) / V_ELECTRON;
  return cy;
}

// Avance un cycle ; renvoie true quand il est terminé
function _majCycleP(cy, dt) {
  cy.t += dt;
  if (cy.type === 'anode') {
    if (cy.phase === 'signal' && cy.t >= PL_D_SIGNAL) { cy.phase = 'electrons'; cy.t = 0; }
    else if (cy.phase === 'electrons') {
      _avancerElectrons(cy);
      if (cy.t >= Math.max(cy.dElectrons, cy.tOx + PL_D_OXYDATION)) {
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
      if (cy.t >= PL_D_DEPART) {
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
      cy.phase = 'electrons'; cy.t = 0;
    } else if (cy.phase === 'electrons') {
      _avancerElectrons(cy);
      if (cy.t >= cy.dElectrons + 0.05) { cy.phase = 'transfo'; cy.t = 0; }
    } else if (cy.phase === 'transfo') {
      var q = _lisse(cy.t / PL_D_TRANSFO);
      cy.u = cy.cible.u + (cy.fin.u - cy.cible.u) * q;
      if (cy.t >= PL_D_TRANSFO) {
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

function _avancerElectrons(cy) {
  for (var k = 0; k < cy.electrons.length; k++) {
    var e = cy.electrons[k];
    var L = _longueurChemin(e.chemin);
    e.s = Math.max(0, Math.min(1, (cy.t - e.depart) * V_ELECTRON / L));
  }
}

// ── Pont salin ────────────────────────────────────────────────────────
function _majPont(dt) {
  var d = _signeI() * PL_V_DERIVE * 1.3 * facteurCourant();
  for (var i = 0; i < ploupe.fond.length; i++) {
    var f = ploupe.fond[i];
    _agiter(f, dt, 1);
    f.u += (f.vu + (f.type === 'cation' ? d : -d)) * dt;
    f.v += f.vv * dt;
    var h = 2.2 + f.r, b = 8.8 - f.r;
    if (f.v < h) { f.v = h; f.vv = Math.abs(f.vv); }
    if (f.v > b) { f.v = b; f.vv = -Math.abs(f.vv); }
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

  if (ploupe.zone === 'pont' && !pile.pont) {
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, 2 * RC, 2 * RC);
  } else if (_estElectrode()) {
    _dessinerElectrodeL(ctx);
  } else if (ploupe.zone === 'pont') {
    _dessinerPontL(ctx);
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
    if (f.type === 'anion') _dessinerAnion(ctx, _mx(f.u), f.v, f.sym, ALPHA_ANION * a);
    else _dessinerIon(ctx, _mx(f.u), f.v, f.sym, 0.55 * a, R_ION);
  }

  // Ions formés à l'anode qui s'éloignent : derrière le réseau
  for (i = 0; i < ploupe.cycles.length; i++) {
    var cy = ploupe.cycles[i];
    if (cy.type === 'anode' && cy.phase === 'depart') {
      _halo(ctx, _mx(cy.u + ploupe.offX), cy.v, R_ION, COUL_OX, Math.max(0, 1 - cy.t / 1.3), 0.5);
      _dessinerIon(ctx, _mx(cy.u + ploupe.offX), cy.v, cy.sym, 1, R_ION);
    }
  }

  // Réseau du métal : masse claire derrière, puis les atomes (élément de
  // chacun : lame ou dépôt)
  ctx.fillStyle = rgbCss(nuance(couleurRGB(METAUX[lame].atome), 0.55));
  for (r = 0; r < NR; r++) {
    var x1 = _front(r) + ploupe.offX + 0.5;
    var xa = _mx(-2), xb = _mx(x1);
    ctx.fillRect(Math.min(xa, xb), r, Math.abs(xb - xa), 1.02);
  }
  for (r = 0; r < NR; r++) {
    for (c = -2; c < _front(r); c++) {
      if (_atomeEnCycle(r, c)) continue;
      _dessinerAtome(ctx, _mx(c + 0.5 + ploupe.offX), r + 0.5, c < 0 ? lame : ploupe.rangs[r][c], 1);
    }
  }

  // Acteurs des cycles
  var pulse = 0.5 + 0.5 * Math.sin(performance.now() / 170);
  for (i = 0; i < ploupe.cycles.length; i++) _dessinerCycleP(ctx, ploupe.cycles[i], pulse);
}

// Atome de la lame dessiné par son cycle (anode, avant son départ)
function _atomeEnCycle(r, c) {
  for (var i = 0; i < ploupe.cycles.length; i++) {
    var cy = ploupe.cycles[i];
    if (cy.type === 'anode' && cy.phase !== 'depart' && cy.r === r && cy.c === c) return true;
  }
  return false;
}

function _dessinerCycleP(ctx, cy, pulse) {
  var dx = ploupe.offX, k, sym = cy.sym;
  if (cy.type === 'anode') {
    if (cy.phase === 'depart') return;
    var x = _mx(cy.u + dx);
    var kOx = cy.phase === 'electrons' ? (cy.t - cy.tOx) / PL_D_OXYDATION : 0;
    _halo(ctx, x, cy.v, R_ATOME, COUL_OX, 0.9, kOx > 0 ? 1 : pulse);
    if (kOx > 0) _dessinerTransition(ctx, x, cy.v, sym, Math.min(1, kOx), true);
    else _dessinerAtome(ctx, x, cy.v, sym, 1);
  } else {
    var xi = _mx(cy.u + dx);
    if (cy.phase === 'transfo') {
      _halo(ctx, xi, cy.v, R_ION, COUL_RED, 0.9 * (1 - cy.t / PL_D_TRANSFO), 1);
      _dessinerTransition(ctx, xi, cy.v, sym, cy.t / PL_D_TRANSFO, false);
    } else {
      _halo(ctx, xi, cy.v, R_ION, COUL_RED, cy.phase === 'approche' ? 0.8 : 0.9, cy.phase === 'approche' ? 0.5 : pulse);
      _dessinerIon(ctx, xi, cy.v, sym, 1, R_ION);
    }
  }
  // Électrons dans le métal (toujours visibles : ils sont l'essentiel ici)
  if (cy.phase === 'electrons') {
    for (k = 0; k < cy.electrons.length; k++) {
      var e = cy.electrons[k];
      if (cy.t < e.depart || e.s >= 1) continue;
      var p = _surLigne(e.chemin, e.s);
      _dessinerElectron(ctx, _mx(p.u + dx), p.v);
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
    if (f.type === 'anion') _dessinerAnion(ctx, f.u, f.v, 'NO3', 1);
    else _dessinerIonK(ctx, f.u, f.v);
  }
}

function _dessinerIonK(ctx, x, y) {
  var rgb = couleurRGB(K_PONT.couleur);
  _sphere(ctx, x, y, R_ION, rgb, 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 0.05;
  ctx.stroke();
  _etiquette(ctx, x, y, K_PONT.texte, 0.27, rgb, 1);
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
  var titre, lignes = [];
  var I = pile.I;

  if (_estElectrode()) {
    var i = _indiceElectrode(), role = roleElectrode(i);
    titre = 'Électrode ' + METAUX[pile.lames[i].sym].de + ' vue à l’échelle des atomes';
    var sym = role === 'cathode' ? (cationReduit(i) || pile.lames[i].sym) : surfaceLame(i);
    var n = METAUX[sym].charge, e = (n > 1 ? n + ' ' : '') + 'e⁻';
    if (role === 'anode') {
      lignes.push({ txt: 'Anode : oxydation  ' + sym + ' → ' + ionTexte(sym) + ' + ' + e, col: '#b04020' });
      lignes.push({ txt: 'Les électrons partent dans le fil' + (sensForce() ? ', vers le générateur' : ''), col: '#5a6a78' });
    } else if (role === 'cathode') {
      lignes.push({ txt: 'Cathode : réduction  ' + ionTexte(sym) + ' + ' + e + ' → ' + sym, col: '#2a6aaa' });
      lignes.push({ txt: 'Les électrons arrivent par le fil' + (sensForce() ? ', venant du générateur' : ''), col: '#5a6a78' });
    } else {
      lignes.push({ txt: 'Pas de courant : aucun échange d’électrons', col: '#5a6a78' });
    }
  } else if (ploupe.zone === 'pont') {
    titre = 'Pont salin vu à l’échelle des ions';
    if (!pile.pont) lignes.push({ txt: 'Pont salin retiré', col: '#5a6a78' });
    else if (I === 0) lignes.push({ txt: 'Pas de courant : agitation sans déplacement d’ensemble', col: '#5a6a78' });
    else {
      var cat = pile.lames[I > 0 ? 1 : 0].sym, an = pile.lames[I > 0 ? 0 : 1].sym;
      lignes.push({ txt: 'K⁺ vers la cathode (' + cat + '), NO₃⁻ vers l’anode (' + an + ')', col: '#5a6a78' });
    }
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

  // Repères de côté sous la loupe (pont) : vers quelle demi-pile
  if (ploupe.zone === 'pont' && pile.pont) {
    var fs2 = fs * 0.85;
    ctx.font = '600 ' + fs2 + 'px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#7a8a96';
    ctx.textAlign = 'left';
    ctx.fillText('← côté ' + METAUX[pile.lames[0].sym].nom, dispP.lx - dispP.lr, dispP.ly + dispP.lr + fs * 0.1);
    ctx.textAlign = 'right';
    ctx.fillText('côté ' + METAUX[pile.lames[1].sym].nom + ' →', dispP.lx + dispP.lr, dispP.ly + dispP.lr + fs * 0.1);
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
