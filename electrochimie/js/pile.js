// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  pile.js — Onglet Pile et électrolyse : modèle et montage macroscopique
//  Dépend de sim.js (METAUX, utilitaires) et becher.js (_EAU,
//  _degradeMetal, ALPHA_VOILE).
//
//  Deux montages :
//    - deux béchers (une demi-pile Mⁿ⁺/M chacun) reliés par un pont salin
//      (K⁺ + NO₃⁻) : piles, et leur recharge par un générateur ;
//    - une cuve unique avec deux lames dans la même solution : électrolyses
//      à anode soluble (affinage du cuivre, zingage).
//  Entre les deux électrodes, le circuit extérieur au choix : rien, un
//  voltmètre, un ampèremètre + une résistance, + une lampe ou + un
//  générateur de tension réglable (avec interrupteur).
//
//  Modèle (Terminale, semi-quantitatif) :
//    - chaque compartiment contient une ou plusieurs espèces Mⁿ⁺ ; chaque
//      lame porte des couches de dépôt (éventuellement d'un autre métal,
//      ex. zinc sur fer), oxydées d'abord quand elle devient anode ;
//    - potentiels par la loi de Nernst, en coulisse, jamais affichés :
//      à l'anode, couple du métal de surface ; à la cathode, couple du
//      cation le plus facile à réduire du compartiment ;
//    - le courant est cherché dans les deux sens : f.é.m. du sens
//      considéré, moins la tension du générateur s'il s'y oppose (plus s'il
//      y pousse), moins une surtension ETA si la transformation est forcée
//      (électrolyse), divisé par la résistance totale ; multiplié par un
//      facteur d'épuisement des réactifs de ce sens. D'où un seuil
//      d'électrolyse, et une pile qui débite contre un générateur trop
//      faible puis se recharge quand U dépasse sa tension ;
//    - quantités : Q = I·Δt = n(e⁻)·F, concentrations et lames tenues à
//      jour, en temps accéléré (TEMPS_ACCEL).
//  Convention de signe : I > 0 quand le courant va de l'électrode de
//  droite vers celle de gauche dans le circuit extérieur (de la gauche
//  vers la droite dans les solutions) : électrode de gauche anode, de
//  droite cathode.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ══════════════════════════════════════════════════════════════════════
//  Constantes physiques et du montage
// ══════════════════════════════════════════════════════════════════════

var FARADAY = 96500;          // C/mol
var PENTE_NERNST = 0.059;     // V, à 25 °C
var P_VOLUME = 0.100;         // volume de chaque compartiment (L)
var N_LAME = 0.05;            // quantité de métal de la partie immergée d'une lame (mol)
var R_INTERNE = 20;           // résistance interne de la cellule (Ω), surtout celle de l'électrolyte
var R_LAMPE = 15;             // résistance de la lampe (Ω)
var R_GENERATEUR = 10;        // résistance de protection du générateur (Ω)
var P_NOMINALE = 0.03;        // puissance pour laquelle la lampe brille à fond (W)
var TEMPS_ACCEL = 3600;       // secondes de fonctionnement par seconde d'animation, à ×1
var I_REF = 0.03;             // intensité (A) des animations les plus rapides
var ETA = 0.15;               // surtension d'une transformation forcée (V) : seuil d'électrolyse
var E_FORCE = 0.005;          // f.é.m. en dessous de laquelle un sens est forcé (V)
var C_TRACE = 1e-7;           // concentration en dessous de laquelle un cation n'est plus réduit
var C_PLANCHER = 1e-6;        // concentration prise pour un ion absent (loi de Nernst)
var U_PAS = 0.05;             // pas du curseur du générateur (V)

// Facteur d'épuisement : x / (x + coude). Négligeable tant que les
// réactifs sont abondants, il fait tomber le courant (et la tension à vide)
// quand l'un d'eux s'épuise (la loi de Nernst seule ne baisse qu'en
// logarithme).
var C_COUDE = 0.0002;         // mol/L, cations réductibles à la cathode
var N_COUDE = 0.0002;         // mol, métal oxydable à l'anode

// En dessous de 1 µA (réactif épuisé : reste infime du facteur
// d'épuisement), on considère qu'aucun courant ne circule
var I_MIN = 1e-6;

// Crans des curseurs
var CONCENTRATIONS = [0.01, 0.05, 0.1, 0.5, 1.0];          // mol/L
var RESISTANCES = [10, 22, 47, 100, 220, 470, 1000];       // Ω

// Ions du pont salin (nitrate de potassium : pas de précipité avec Ag⁺)
var K_PONT = { texte: 'K⁺', couleur: '#c98a55' };

// ══════════════════════════════════════════════════════════════════════
//  Expériences prédéfinies
//  g, d : métaux des lames de gauche et de droite ; cg, cd : crans de
//  concentration (indices dans CONCENTRATIONS) ; bac 'un' : cuve unique
//  de la solution `solution` ; dipole, iU (cran du générateur), polarite
//  (+1 : borne + du générateur reliée à l'électrode de droite) : circuit
//  imposé par l'expérience.
// ══════════════════════════════════════════════════════════════════════

var EXPERIENCES = {
  'daniell':   { groupe: 'Piles', nom: 'Pile Daniell (zinc – cuivre)', g: 'Zn', d: 'Cu', cg: 2, cd: 2 },
  'cu-ag':     { groupe: 'Piles', nom: 'Pile cuivre – argent', g: 'Cu', d: 'Ag', cg: 2, cd: 2 },
  'fe-cu':     { groupe: 'Piles', nom: 'Pile fer – cuivre', g: 'Fe', d: 'Cu', cg: 2, cd: 2 },
  'zn-pb':     { groupe: 'Piles', nom: 'Pile zinc – plomb', g: 'Zn', d: 'Pb', cg: 2, cd: 2 },
  'conc-cu':   { groupe: 'Piles', nom: 'Pile de concentration (cuivre)', g: 'Cu', d: 'Cu', cg: 0, cd: 4 },
  'recharge':  { groupe: 'Électrolyses', nom: 'Recharge de la pile Daniell', g: 'Zn', d: 'Cu', cg: 2, cd: 2,
                 dipole: 'generateur', iU: 32, polarite: 1 },
  'affinage':  { groupe: 'Électrolyses', nom: 'Affinage du cuivre (anode soluble)', bac: 'un', solution: 'Cu',
                 g: 'Cu', d: 'Cu', cg: 3, cd: 3, dipole: 'generateur', iU: 10, polarite: -1 },
  'zingage':   { groupe: 'Électrolyses', nom: 'Zingage d’une lame de fer', bac: 'un', solution: 'Zn',
                 g: 'Zn', d: 'Fe', cg: 3, cd: 3, dipole: 'generateur', iU: 20, polarite: -1 },
  'libre':     { groupe: '', nom: 'Montage libre (deux béchers)' }
};
var ORDRE_EXPERIENCES = ['daniell', 'cu-ag', 'fe-cu', 'zn-pb', 'conc-cu', 'recharge', 'affinage', 'zingage', 'libre'];

// ══════════════════════════════════════════════════════════════════════
//  Géométrie du montage, en unités logiques (repère 140 × 102)
//  Indice 0 = électrode de gauche, 1 = électrode de droite.
// ══════════════════════════════════════════════════════════════════════

var P_SCENE_W = 140, P_SCENE_H = 102;
var P_TABLE_Y = 90;
var P_BECHER_H = 34;
var P_BECHER_TOP = P_TABLE_Y - P_BECHER_H;
var P_SOL_TOP = 62;                       // surface libre des solutions
var P_LAME_W = 4, P_LAME_H = 42;
var P_LAME_X_DEUX = [31, 109];            // axes des lames, deux béchers
var P_LAME_X_UN = [41, 99];               // axes des lames, cuve unique
var P_LAME_YB = 85;                       // bas des lames
var P_LAME_TOP = P_LAME_YB - P_LAME_H;
var P_FIL_Y = 16;                         // fil horizontal du circuit extérieur
var P_PONT_Y = 46;                        // axe de la partie horizontale du pont
var P_PONT_X = [48, 92];                  // axes des deux branches du pont
var P_PONT_BAS = 77;                      // bas des branches (dans les solutions)
var P_PONT_W = 3.4;                       // diamètre extérieur du tube
var P_Y_LOUPE = 74;                       // hauteur visée par la loupe sur les électrodes

// Vitesses des animations du montage (unités de scène par seconde
// d'animation, à I = I_REF ; plus lentes quand I est plus faible)
var V_ELEC_FIL = 9;
var V_ION_MACRO = 2.6;
var ECART_ELECTRONS = 5;                  // espacement des électrons dans les fils

// ══════════════════════════════════════════════════════════════════════
//  État
// ══════════════════════════════════════════════════════════════════════

var pile = {
  experience: 'daniell',
  bac: 'deux',               // 'deux' : deux béchers + pont salin ; 'un' : cuve unique
  metaux: ['Zn', 'Cu'],      // métaux des lames de gauche et de droite
  solution: 'Cu',            // cuve unique : cation de la solution
  iC0: [2, 2],               // crans des concentrations initiales
  dipole: 'voltmetre',       // 'aucun' | 'voltmetre' | 'resistance' | 'lampe' | 'generateur'
  interrupteur: false,       // fermé ?
  iR: 3,                     // cran de la résistance (100 Ω)
  iU: 30,                    // cran du générateur (× U_PAS : 1,50 V)
  polarite: 1,               // +1 : borne + du générateur reliée à l'électrode de droite
  pont: true,                // pont salin en place (deux béchers)
  zone: 'gauche',            // zone vue dans la loupe : 'gauche' | 'droite' | 'pont' | 'fil'

  showCourant:   false,      // sens du courant et électrons dans les fils
  showMigration: false,      // ions qui migrent dans les solutions et le pont
  showPoles:     false,      // pôles, anode et cathode
  showEquations: false,

  // ── Grandeurs ──
  comp: [],                  // compartiments : { n: {sym: mol}, anion, nom, sym0 }
  lames: [],                 // { sym, reste (mol de métal de la lame), depots: [{sym, n}] (dernier = surface) }
  t: 0,                      // durée de fonctionnement (s, temps accéléré)
  Q: 0,                      // quantité d'électricité (C)
  E: 0,                      // tension à vide V(droite) − V(gauche) (V)
  I: 0,                      // intensité (A), signée

  // ── Animations ──
  horloge: 0,                // temps d'animation (s)
  phaseE: 0,                 // décalage des électrons le long des fils
  particules: null,          // ions du montage (option migration)
  bruitDepot: null,          // contour irrégulier des dépôts
  survol: null               // zone ou interrupteur sous la souris
};

// ══════════════════════════════════════════════════════════════════════
//  Géométrie selon le montage
// ══════════════════════════════════════════════════════════════════════

function enCuve() { return pile.bac === 'un'; }
function lameX(i) { return enCuve() ? P_LAME_X_UN[i] : P_LAME_X_DEUX[i]; }
function compElectrode(i) { return enCuve() ? 0 : i; }
function pontPresent() { return !enCuve() && pile.pont; }

// Récipients : bords intérieurs gauche et droit, côté du bec verseur
function recipients() {
  return enCuve() ? [{ L: 34, R: 106, bec: 0 }]
                  : [{ L: 23, R: 53, bec: -1 }, { L: 87, R: 117, bec: 1 }];
}

// ══════════════════════════════════════════════════════════════════════
//  Grandeurs chimiques
// ══════════════════════════════════════════════════════════════════════

function concInitiale(i) { return CONCENTRATIONS[pile.iC0[i]]; }

// Concentration d'une espèce dans un compartiment (mol/L)
function concentrationC(c, sym) { return Math.max(0, pile.comp[c].n[sym] || 0) / P_VOLUME; }

// Concentration des ions du métal d'une lame dans son compartiment
function concentration(i) { return concentrationC(compElectrode(i), pile.metaux[i]); }

// Somme des concentrations des cations d'un compartiment
function cationsTotal(c) {
  var s = 0, n = pile.comp[c].n;
  for (var sym in n) s += Math.max(0, n[sym]);
  return s / P_VOLUME;
}

// Métal à la surface d'une lame : dernière couche de dépôt, sinon la lame
function surfaceLame(i) {
  var d = pile.lames[i].depots;
  return d.length ? d[d.length - 1].sym : pile.lames[i].sym;
}

// Métal oxydable d'une lame (dépôts + partie immergée)
function oxydable(i) {
  var L = pile.lames[i], s = L.reste;
  for (var k = 0; k < L.depots.length; k++) s += L.depots[k].n;
  return s;
}
function depotTotal(i) { return oxydable(i) - pile.lames[i].reste; }

function potentielCouple(sym, c) {
  var M = METAUX[sym];
  return M.E0 + PENTE_NERNST / M.charge * Math.log(Math.max(c, C_PLANCHER)) / Math.LN10;
}

// Potentiel de l'électrode i quand elle s'oxyde (et à vide) : couple du
// métal de surface, avec la concentration de ses ions
function potentielOx(i) {
  var s = surfaceLame(i);
  return potentielCouple(s, concentrationC(compElectrode(i), s));
}

// Cation réduit sur l'électrode i : le plus facile à réduire (potentiel le
// plus élevé) parmi ceux de son compartiment ; null s'il n'y en a plus
function cationReduit(i) {
  var c = compElectrode(i), n = pile.comp[c].n, best = null, eBest = -Infinity;
  for (var sym in n) {
    var conc = concentrationC(c, sym);
    if (conc < C_TRACE) continue;
    var e = potentielCouple(sym, conc);
    if (e > eBest) { eBest = e; best = sym; }
  }
  return best;
}

function potentielRed(i) {
  var s = cationReduit(i);
  return s ? potentielCouple(s, concentrationC(compElectrode(i), s)) : potentielOx(i);
}

// F.é.m. du sens où l'électrode iA est l'anode (l'autre la cathode) :
// positive si ce sens est spontané
function femSens(iA) { return potentielRed(1 - iA) - potentielOx(iA); }

// Facteur d'épuisement des réactifs du sens où iA est l'anode
function facteurSens(iA) {
  var c = cationsTotal(compElectrode(1 - iA)), n = oxydable(iA);
  return (c / (c + C_COUDE)) * (n / (n + N_COUDE));
}

// Tension à vide (voltmètre) : V(droite) − V(gauche), avec le facteur
// d'épuisement du sens spontané (pile usée : 0)
function femPile() {
  var V = potentielOx(1) - potentielOx(0);
  return V * facteurSens(V >= 0 ? 0 : 1);
}

// ══════════════════════════════════════════════════════════════════════
//  Grandeurs électriques
// ══════════════════════════════════════════════════════════════════════

function tensionGenerateur() { return pile.iU * U_PAS; }

function courantPossible() {
  return pile.dipole === 'resistance' || pile.dipole === 'lampe' || pile.dipole === 'generateur';
}
function resistanceCharge() {
  return pile.dipole === 'lampe' ? R_LAMPE : pile.dipole === 'generateur' ? R_GENERATEUR : RESISTANCES[pile.iR];
}
function circuitFerme() { return courantPossible() && pile.interrupteur && (enCuve() || pile.pont); }

// Tension que le générateur oppose au sens I > 0 (gauche anode)
function _tensionOpposee() {
  return pile.dipole === 'generateur' ? pile.polarite * tensionGenerateur() : 0;
}

// Pilote du courant dans chaque sens (V), avant division par la résistance
function _pilote(iA) {
  var e = femSens(iA);
  var u = iA === 0 ? -_tensionOpposee() : _tensionOpposee();
  return e + u - (e < E_FORCE ? ETA : 0);
}

function courantPile() {
  if (!circuitFerme()) return 0;
  var Rt = R_INTERNE + resistanceCharge();
  var Jp = facteurSens(0) * _pilote(0) / Rt;     // gauche anode
  var Jm = facteurSens(1) * _pilote(1) / Rt;     // droite anode
  var I = 0;
  if (Jp > 0 && Jp >= Jm) I = Jp;
  else if (Jm > 0) I = -Jm;
  return Math.abs(I) < I_MIN ? 0 : I;
}

// Tension lue par le voltmètre (borne V à droite, COM à gauche). Sans pont
// salin, le circuit est ouvert dans les solutions : rien à mesurer.
function tensionVoltmetre() { return (enCuve() || pile.pont) ? femPile() : 0; }

// Le sens du courant actuel est-il forcé (électrolyse) ?
function sensForce() {
  if (pile.I === 0) return false;
  return femSens(pile.I > 0 ? 0 : 1) < E_FORCE;
}

// Tension minimale du générateur pour forcer la transformation dans le
// sens où il pousse ; null s'il pousse dans le sens spontané
function seuilElectrolyse() {
  var iA = pile.polarite > 0 ? 1 : 0;          // électrode reliée à la borne +
  var e = femSens(iA);
  if (e >= E_FORCE) return null;
  return ETA - e;
}

// Rôle d'une électrode : 'anode' (oxydation), 'cathode' (réduction) ou ''
// quand aucun courant ne circule
function roleElectrode(i) {
  if (pile.I === 0) return '';
  return (pile.I > 0) === (i === 0) ? 'anode' : 'cathode';
}

// Pôle d'une électrode : celui de la borne du générateur à laquelle elle
// est reliée s'il y en a un, sinon celui de la pile (signe de E)
function poleElectrode(i) {
  if (pile.dipole === 'generateur') return (pile.polarite > 0) === (i === 1) ? '+' : '−';
  if (Math.abs(pile.E) < 1e-4) return '';
  return (pile.E > 0) === (i === 1) ? '+' : '−';
}

// Facteur d'animation : 0 sans courant, 1 à I_REF et au-delà (racine : les
// faibles courants restent visibles)
function facteurCourant() { return Math.sqrt(Math.min(1, Math.abs(pile.I) / I_REF)); }

// ══════════════════════════════════════════════════════════════════════
//  RAZ
// ══════════════════════════════════════════════════════════════════════

function resetPileModele() {
  var i;
  pile.comp = [];
  if (enCuve()) {
    var S = METAUX[pile.solution];
    var n0 = {};
    n0[pile.solution] = concInitiale(0) * P_VOLUME;
    pile.comp.push({ n: n0, anion: S.anion, nom: S.nomSolution, sym0: pile.solution });
  } else {
    for (i = 0; i < 2; i++) {
      var M = METAUX[pile.metaux[i]];
      var n = {};
      n[M.sym] = concInitiale(i) * P_VOLUME;
      pile.comp.push({ n: n, anion: M.anion, nom: M.nomSolution, sym0: M.sym });
    }
  }
  pile.lames = [];
  for (i = 0; i < 2; i++) pile.lames.push({ sym: pile.metaux[i], reste: N_LAME, depots: [] });
  pile.t = 0;
  pile.Q = 0;
  pile.horloge = 0;
  pile.phaseE = 0;
  pile.E = femPile();
  pile.I = courantPile();
  _tirerParticules();
  _tirerBruitDepot();
}

// Ions du montage (option migration) : quelques ions par compartiment,
// répartis dans la solution, et des ions K⁺ / NO₃⁻ le long du pont salin
function _tirerParticules() {
  var alea = creerAlea(20261027);
  var R = recipients(), comps = [];
  for (var c = 0; c < R.length; c++) {
    var C = pile.comp[c], liste = [];
    var nb = enCuve() ? 24 : 14;
    for (var k = 0; k < nb; k++) {
      var cation = k % 2 === 0;
      liste.push({
        x: R[c].L + 1.6 + alea() * (R[c].R - R[c].L - 3.2),
        y: P_SOL_TOP + 3 + alea() * (P_TABLE_Y - P_SOL_TOP - 5.5),
        signe: cation ? 1 : -1,
        rgb: couleurRGB(cation ? METAUX[C.sym0].ion : ANIONS[C.anion].couleur),
        phi: alea() * 6.28
      });
    }
    comps.push(liste);
  }
  var pont = [], L = _longueurPont();
  for (k = 0; k < 16; k++) {
    pont.push({
      s: alea() * L,
      d: (alea() - 0.5) * 1.1,          // écart à l'axe du tube
      signe: k % 2 === 0 ? 1 : -1,
      rgb: couleurRGB(k % 2 === 0 ? K_PONT.couleur : ANIONS.NO3.couleur),
      phi: alea() * 6.28
    });
  }
  pile.particules = { comps: comps, pont: pont };
}

// Contour irrégulier des dépôts (fixe, tiré une fois)
function _tirerBruitDepot() {
  var alea = creerAlea(20261028);
  var b = [];
  for (var i = 0; i < 2; i++) {
    var cotes = [[], []];
    for (var c = 0; c < 2; c++) for (var k = 0; k <= 24; k++) cotes[c].push(0.55 + 0.45 * alea());
    b.push(cotes);
  }
  pile.bruitDepot = b;
}

// ══════════════════════════════════════════════════════════════════════
//  Mise à jour
// ══════════════════════════════════════════════════════════════════════

// Fonctionnement pendant dt secondes (temps accéléré). Pas adaptatifs : la
// quantité d'électrons échangée à chaque pas reste petite devant les
// réactifs restants, et ne dépasse jamais la couche de surface de l'anode
// ni le cation réduit à la cathode (on passe ensuite au suivant).
function _integrerPile(dt) {
  var pas = 0;
  while (dt > 1e-9 && pas < 500) {
    pas++;
    var I = courantPile();
    if (Math.abs(I) < 1e-9) break;
    var iA = I > 0 ? 0 : 1, iC = 1 - iA;
    var cA = compElectrode(iA), cC = compElectrode(iC);
    var Sa = surfaceLame(iA), Cc = cationReduit(iC);
    if (!Cc) break;
    var zA = METAUX[Sa].charge, zC = METAUX[Cc].charge;
    var LA = pile.lames[iA];
    var couche = LA.depots.length ? LA.depots[LA.depots.length - 1].n : LA.reste;
    var nC = pile.comp[cC].n[Cc];
    var limite = Math.min(cationsTotal(cC) * P_VOLUME * zC, oxydable(iA) * zA);

    var ne = Math.abs(I) * dt / FARADAY;       // électrons échangés (mol)
    ne = Math.min(ne, 0.05 * limite, couche * zA, nC * zC);
    var h = ne * FARADAY / Math.abs(I);
    if (!(ne > 0)) break;

    // Anode : couche de surface → ions dans son compartiment
    if (LA.depots.length) LA.depots[LA.depots.length - 1].n -= ne / zA;
    else LA.reste -= ne / zA;
    pile.comp[cA].n[Sa] = (pile.comp[cA].n[Sa] || 0) + ne / zA;
    // Cathode : cation → nouvelle couche (ou couche de surface du même métal)
    pile.comp[cC].n[Cc] -= ne / zC;
    var LC = pile.lames[iC], top = LC.depots[LC.depots.length - 1];
    if (top && top.sym === Cc) top.n += ne / zC;
    else LC.depots.push({ sym: Cc, n: ne / zC });

    _nettoyer(LA);
    if (pile.comp[cC].n[Cc] < 1e-14) pile.comp[cC].n[Cc] = 0;
    pile.t += h;
    pile.Q += ne * FARADAY;
    dt -= h;
  }
  if (circuitFerme()) pile.t += Math.max(0, dt);
}

// Couches de dépôt épuisées retirées
function _nettoyer(L) {
  while (L.depots.length && L.depots[L.depots.length - 1].n < 1e-12) L.depots.pop();
  if (L.reste < 1e-12) L.reste = 0;
}

// dtSim : temps d'animation (s), nul en pause
function majPile(dtSim) {
  if (dtSim > 0 && circuitFerme()) _integrerPile(dtSim * TEMPS_ACCEL);
  pile.E = femPile();
  pile.I = courantPile();
  if (dtSim <= 0) return;

  pile.horloge += dtSim;
  var sgn = pile.I > 0 ? 1 : pile.I < 0 ? -1 : 0;
  var f = facteurCourant();

  // Électrons des fils : de l'anode vers la cathode dans le circuit
  // extérieur, soit vers les s croissants (gauche → droite) si I > 0
  pile.phaseE += sgn * f * V_ELEC_FIL * dtSim;

  // Ions : les cations suivent le courant dans les solutions et le pont
  // (gauche → droite si I > 0), les anions vont en sens inverse
  var v = sgn * f * V_ION_MACRO * dtSim;
  var P = pile.particules, R = recipients();
  for (var c = 0; c < R.length; c++) {
    var a = R[c].L + 1.6, b = R[c].R - 1.6;
    for (var k = 0; k < P.comps[c].length; k++) {
      var p = P.comps[c][k];
      p.x += p.signe * v;
      if (p.x > b) p.x -= b - a;
      if (p.x < a) p.x += b - a;
    }
  }
  var L = _longueurPont();
  for (k = 0; k < P.pont.length; k++) {
    var q = P.pont[k];
    q.s += q.signe * v;
    if (q.s > L) q.s -= L;
    if (q.s < 0) q.s += L;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Disposition du canvas (montage à gauche, loupe à droite ; en portrait,
//  montage en haut, loupe en bas)
// ══════════════════════════════════════════════════════════════════════

var dispP = { W: 0, H: 0, mx: 0, my: 0, k: 1, lx: 0, ly: 0, lr: 0 };

function calculerDispositionPile(W, H) {
  dispP.W = W; dispP.H = H;
  var rw, rh;
  if (W >= 1.15 * H) {
    rw = W * 0.6; rh = H;
    // Loupe un peu au-dessus du milieu : deux lignes de légende dessous
    dispP.lx = W * 0.8;
    dispP.ly = H * 0.47;
    dispP.lr = Math.min(W * 0.2, H * 0.5) * 0.78;
  } else {
    rw = W; rh = H * 0.52;
    dispP.lx = W * 0.5;
    dispP.ly = H * 0.74;
    dispP.lr = Math.min(W * 0.5, H * 0.22) * 0.8;
  }
  dispP.k  = Math.min(rw / P_SCENE_W, rh / P_SCENE_H) * 0.97;
  dispP.mx = (rw - P_SCENE_W * dispP.k) / 2;
  dispP.my = (rh - P_SCENE_H * dispP.k) / 2;
}

function pileVersPx(x, y) { return { x: dispP.mx + dispP.k * x, y: dispP.my + dispP.k * y }; }
function pxVersPile(px, py) { return { x: (px - dispP.mx) / dispP.k, y: (py - dispP.my) / dispP.k }; }

// ══════════════════════════════════════════════════════════════════════
//  Circuit extérieur : composants posés sur le fil du haut
//  (x0, x1 : bornes de gauche et de droite), tous entre x = 48 et 92 pour
//  laisser passer les fils verticaux des deux montages
// ══════════════════════════════════════════════════════════════════════

function composantsCircuit() {
  var A = { type: 'multimetre', mode: 'A', x0: 49, x1: 65 };
  var K = { type: 'interrupteur', x0: 69, x1: 76 };
  switch (pile.dipole) {
    case 'voltmetre':  return [{ type: 'multimetre', mode: 'V', x0: 61, x1: 79 }];
    case 'resistance': return [A, K, { type: 'resistance', x0: 81, x1: 91 }];
    case 'lampe':      return [A, K, { type: 'lampe', x0: 82, x1: 90 }];
    case 'generateur': return [A, K, { type: 'generateur', x0: 80, x1: 93 }];
    default:           return [{ type: 'ouvert', x0: 62, x1: 78 }];
  }
}

// Fil de l'électrode de gauche à celle de droite (ligne brisée), parcouru
// par les électrons
function _cheminFil() {
  return [[lameX(0), P_LAME_TOP - 1], [lameX(0), P_FIL_Y],
          [lameX(1), P_FIL_Y], [lameX(1), P_LAME_TOP - 1]];
}

// Axe du pont salin (ligne brisée), parcouru par les ions du pont
var _CHEMIN_PONT = [[P_PONT_X[0], P_PONT_BAS - 1], [P_PONT_X[0], P_PONT_Y],
                    [P_PONT_X[1], P_PONT_Y], [P_PONT_X[1], P_PONT_BAS - 1]];

function _longueurLigne(pts) {
  var L = 0;
  for (var i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}
function _longueurPont() { return _longueurLigne(_CHEMIN_PONT); }

// Point à l'abscisse curviligne s d'une ligne brisée, avec la direction
// du segment (tx, ty)
function _pointLigne(pts, s) {
  for (var i = 1; i < pts.length; i++) {
    var dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
    var d = Math.hypot(dx, dy);
    if (s <= d || i === pts.length - 1) {
      var k = Math.max(0, Math.min(1, s / d));
      return { x: pts[i - 1][0] + dx * k, y: pts[i - 1][1] + dy * k, tx: dx / d, ty: dy / d };
    }
    s -= d;
  }
  return null;
}

// Zones que la loupe peut grossir (cercles cliquables sur le montage)
function zonesLoupe() {
  var Z = {
    gauche: { x: lameX(0) + P_LAME_W / 2, y: P_Y_LOUPE },
    droite: { x: lameX(1) - P_LAME_W / 2, y: P_Y_LOUPE },
    fil:    { x: lameX(0) + 3.6, y: P_FIL_Y }
  };
  if (!enCuve()) Z.pont = { x: (P_PONT_X[0] + P_PONT_X[1]) / 2, y: P_PONT_Y };
  return Z;
}
var R_ZONE = 2.4;

// ══════════════════════════════════════════════════════════════════════
//  Rendu du montage
// ══════════════════════════════════════════════════════════════════════

function dessinerMontage(ctx) {
  ctx.save();
  ctx.translate(dispP.mx, dispP.my);
  ctx.scale(dispP.k, dispP.k);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Table
  ctx.fillStyle = '#e6dccb';
  ctx.fillRect(0, P_TABLE_Y, P_SCENE_W, 3.2);
  ctx.strokeStyle = '#b0a898';
  ctx.lineWidth = 0.3;
  ctx.beginPath(); ctx.moveTo(0, P_TABLE_Y); ctx.lineTo(P_SCENE_W, P_TABLE_Y); ctx.stroke();

  var R = recipients(), c, i, cols = [];
  for (c = 0; c < R.length; c++) cols.push(_couleurCompartiment(c));

  // Solutions (couleur pleine + modelé), ions qui migrent, lames, pont,
  // puis voile de la solution devant ce qui est immergé, puis le verre
  for (c = 0; c < R.length; c++) {
    _cheminInterieurP(ctx, R[c], P_SOL_TOP);
    ctx.fillStyle = rgbCss(cols[c]);
    ctx.fill();
    _dessinerVolumeP(ctx, R[c]);
  }
  if (pile.showMigration) _dessinerIonsComps(ctx);
  for (i = 0; i < 2; i++) _dessinerLameP(ctx, i);
  if (pontPresent()) _dessinerPont(ctx);
  for (c = 0; c < R.length; c++) {
    _cheminInterieurP(ctx, R[c], P_SOL_TOP);
    ctx.fillStyle = rgbCss(cols[c], ALPHA_VOILE);
    ctx.fill();
    ctx.strokeStyle = rgbCss(nuance(cols[c], -0.3), 0.8);
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.moveTo(R[c].L, P_SOL_TOP); ctx.lineTo(R[c].R, P_SOL_TOP);
    ctx.stroke();
    _dessinerVerreP(ctx, R[c]);
  }
  if (pontPresent() && pile.showMigration) _dessinerIonsPont(ctx);

  _dessinerCircuit(ctx);
  if (pile.showCourant) _dessinerCourant(ctx);
  _dessinerEtiquettesP(ctx);
  _dessinerZones(ctx);

  ctx.restore();
}

// ── Couleur d'un compartiment ─────────────────────────────────────────
// Mêmes teintes que l'onglet Oxydoréduction (METAUX[…].solution), sur une
// échelle logarithmique de la concentration : 1 mol/L → teinte la plus
// soutenue, 0,005 mol/L et moins → l'eau. Plusieurs espèces colorées :
// moyenne pondérée par leurs concentrations. Ions incolores : l'eau.
function _couleurCompartiment(c) {
  var n = pile.comp[c].n, somme = [0, 0, 0], poids = 0, presence = 0;
  for (var sym in n) {
    var M = METAUX[sym], conc = concentrationC(c, sym);
    if (!M.solution || conc <= 0) continue;
    var t = Math.max(0, Math.min(1, (Math.log(conc) / Math.LN10 + 2.3) / 2.3));
    var pres = Math.min(1, t / 0.35);
    var rgb = couleurSuite(M.solution, t);
    var w = conc * pres;
    for (var k = 0; k < 3; k++) somme[k] += w * rgb[k];
    poids += w;
    presence = Math.max(presence, pres);
  }
  if (poids <= 0) return _EAU.slice();
  return melange(_EAU, [somme[0] / poids, somme[1] / poids, somme[2] / poids], presence);
}

// Couleur de la solution autour de l'électrode i (loupe)
function couleurSolutionElectrode(i) { return _couleurCompartiment(compElectrode(i)); }

// ── Récipients (mêmes formes que becher.js) ───────────────────────────
function _cheminInterieurP(ctx, B, yHaut) {
  ctx.beginPath();
  ctx.moveTo(B.L, yHaut);
  ctx.lineTo(B.L, P_TABLE_Y - 1);
  ctx.quadraticCurveTo(B.L, P_TABLE_Y, B.L + 1, P_TABLE_Y);
  ctx.lineTo(B.R - 1, P_TABLE_Y);
  ctx.quadraticCurveTo(B.R, P_TABLE_Y, B.R, P_TABLE_Y - 1);
  ctx.lineTo(B.R, yHaut);
  ctx.closePath();
}

function _dessinerVolumeP(ctx, B) {
  _cheminInterieurP(ctx, B, P_SOL_TOP);
  var g = ctx.createLinearGradient(B.L, 0, B.R, 0);
  g.addColorStop(0,    'rgba(255,255,255,0.38)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.10)');
  g.addColorStop(0.5,  'rgba(255,255,255,0)');
  g.addColorStop(0.82, 'rgba(255,255,255,0.10)');
  g.addColorStop(1,    'rgba(255,255,255,0.38)');
  ctx.fillStyle = g;
  ctx.fill();
  var h = ctx.createLinearGradient(0, P_SOL_TOP, 0, P_TABLE_Y);
  h.addColorStop(0,    'rgba(255,255,255,0.22)');
  h.addColorStop(0.15, 'rgba(255,255,255,0)');
  h.addColorStop(0.7,  'rgba(0,30,60,0)');
  h.addColorStop(1,    'rgba(0,30,60,0.12)');
  ctx.fillStyle = h;
  ctx.fill();
}

// Verre : bec verseur côté extérieur (bécher), aucun pour la cuve
function _dessinerVerreP(ctx, B) {
  var L = B.L, R = B.R, T = P_BECHER_TOP;
  ctx.strokeStyle = '#6f7f8c';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  if (B.bec < 0) {
    ctx.moveTo(L - 1.6, T - 0.8);
    ctx.quadraticCurveTo(L, T, L, T + 2);
  } else {
    ctx.moveTo(L, T);
  }
  ctx.lineTo(L, P_TABLE_Y - 1);
  ctx.quadraticCurveTo(L, P_TABLE_Y, L + 1, P_TABLE_Y);
  ctx.lineTo(R - 1, P_TABLE_Y);
  ctx.quadraticCurveTo(R, P_TABLE_Y, R, P_TABLE_Y - 1);
  if (B.bec > 0) {
    ctx.lineTo(R, T + 2);
    ctx.quadraticCurveTo(R, T, R + 1.6, T - 0.8);
  } else {
    ctx.lineTo(R, T);
  }
  ctx.stroke();
  if (!B.bec) return;
  // Graduations, côté du bec
  ctx.strokeStyle = 'rgba(111,127,140,0.7)';
  ctx.lineWidth = 0.25;
  for (var k = 1; k <= 4; k++) {
    var y = P_TABLE_Y - k * 7.5, l = k % 2 ? 2 : 3.5;
    ctx.beginPath();
    if (B.bec < 0) { ctx.moveTo(L + 1, y); ctx.lineTo(L + 1 + l, y); }
    else           { ctx.moveTo(R - 1, y); ctx.lineTo(R - 1 - l, y); }
    ctx.stroke();
  }
}

// ── Lames : partie immergée rongée (métal de la lame oxydé) et couverte
//    de dépôt (couleur du métal de surface) ──
function _dessinerLameP(ctx, i) {
  var L = pile.lames[i];
  var base = couleurRGB(METAUX[L.sym].atome);
  var xc = lameX(i), x0 = xc - P_LAME_W / 2;
  var top = P_LAME_TOP, yb = P_LAME_YB;
  var hSeche = P_SOL_TOP - top;

  ctx.fillStyle = _degradeMetal(ctx, x0, P_LAME_W, base, 0);
  ctx.fillRect(x0, top, P_LAME_W, hSeche);
  ctx.strokeStyle = rgbCss(nuance(base, -0.45));
  ctx.lineWidth = 0.25;
  ctx.strokeRect(x0, top, P_LAME_W, hSeche);

  // Partie immergée, amincie à mesure que le métal s'oxyde (elle
  // disparaît quand il est entièrement consommé)
  var perdu = Math.min(1, Math.max(0, 1 - L.reste / N_LAME));
  var w = P_LAME_W * Math.pow(1 - perdu, 0.6);
  if (w > 0.05) {
    var xa = xc - w / 2;
    var arr = Math.min(w / 2, 0.8 * perdu + 0.2);
    ctx.fillStyle = _degradeMetal(ctx, xa, w, base, -0.2 * perdu);
    ctx.beginPath();
    ctx.moveTo(xa, P_SOL_TOP);
    ctx.lineTo(xa + w, P_SOL_TOP);
    ctx.lineTo(xa + w, yb - arr);
    ctx.quadraticCurveTo(xa + w, yb, xa + w - arr, yb);
    ctx.lineTo(xa + arr, yb);
    ctx.quadraticCurveTo(xa, yb, xa, yb - arr);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Dépôt, en couche irrégulière autour de la partie immergée
  var gagne = depotTotal(i);
  if (gagne > 1e-6) {
    var e = 2.2 * Math.sqrt(Math.min(1.5, gagne / 0.02));
    var B = pile.bruitDepot[i], n = B[0].length - 1;
    var yH = P_SOL_TOP + 0.6, H = yb - yH;
    var col = _couleurDepotP(surfaceLame(i));
    ctx.fillStyle = rgbCss(col, 0.95);
    ctx.beginPath();
    for (var k = 0; k <= n; k++) ctx.lineTo(x0 - e * B[0][k], yH + H * k / n);
    ctx.lineTo(x0 - e * 0.6, yb + e * 0.5);
    ctx.lineTo(x0 + P_LAME_W + e * 0.6, yb + e * 0.5);
    for (k = n; k >= 0; k--) ctx.lineTo(x0 + P_LAME_W + e * B[1][k], yH + H * k / n);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgbCss(nuance(col, -0.3), 0.8);
    ctx.lineWidth = 0.2;
    ctx.stroke();
  }

  // Pince crocodile en haut de la lame
  ctx.fillStyle = '#4a525c';
  ctx.strokeStyle = '#2c3238';
  ctx.lineWidth = 0.25;
  ctx.beginPath();
  ctx.rect(xc - P_LAME_W / 2 - 0.6, top - 1.6, P_LAME_W + 1.2, 3.6);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#8a929c';
  ctx.fillRect(xc - P_LAME_W / 2 - 0.2, top - 1.1, P_LAME_W + 0.4, 0.6);
}

// Couleur du métal déposé (plus sombre que la lame, cf. _couleurDepot)
function _couleurDepotP(sym) {
  var D = METAUX[sym], col = couleurRGB(D.atome);
  return D.depot === 'eponge' ? [150, 72, 36]
       : D.depot === 'noir'   ? nuance(col, -0.5)
       : nuance(col, -0.28);
}

// ── Pont salin : tube en U renversé rempli de gel (K⁺ + NO₃⁻), bouché
//    de coton aux deux extrémités ──
function _cheminPont(ctx) {
  ctx.beginPath();
  ctx.moveTo(P_PONT_X[0], P_PONT_BAS);
  ctx.arcTo(P_PONT_X[0], P_PONT_Y, P_PONT_X[1], P_PONT_Y, 4);
  ctx.arcTo(P_PONT_X[1], P_PONT_Y, P_PONT_X[1], P_PONT_BAS, 4);
  ctx.lineTo(P_PONT_X[1], P_PONT_BAS);
}

function _dessinerPont(ctx) {
  ctx.lineCap = 'butt';
  _cheminPont(ctx);
  ctx.strokeStyle = '#6f7f8c';
  ctx.lineWidth = P_PONT_W;
  ctx.stroke();
  _cheminPont(ctx);
  ctx.strokeStyle = '#f3f0e4';
  ctx.lineWidth = P_PONT_W - 0.7;
  ctx.stroke();
  ctx.lineCap = 'round';
  // Bouchons de coton
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#c8c0b4';
  ctx.lineWidth = 0.15;
  for (var i = 0; i < 2; i++) {
    ctx.beginPath();
    ctx.rect(P_PONT_X[i] - (P_PONT_W - 0.7) / 2, P_PONT_BAS - 2.2, P_PONT_W - 0.7, 2.4);
    ctx.fill(); ctx.stroke();
  }
}

// ── Petits ions du montage (option migration) ─────────────────────────
function _petitIon(ctx, x, y, rgb, signe, alpha) {
  if (alpha <= 0) return;
  var r = 1.05;
  ctx.fillStyle = rgbCss(rgb, alpha);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,' + alpha + ')';
  ctx.lineWidth = 0.26;
  ctx.beginPath();
  ctx.moveTo(x - 0.5, y); ctx.lineTo(x + 0.5, y);
  if (signe > 0) { ctx.moveTo(x, y - 0.5); ctx.lineTo(x, y + 0.5); }
  ctx.stroke();
}

function _dessinerIonsComps(ctx) {
  var R = recipients();
  for (var c = 0; c < R.length; c++) {
    var a = R[c].L + 1.6, b = R[c].R - 1.6;
    var liste = pile.particules.comps[c];
    for (var k = 0; k < liste.length; k++) {
      var p = liste[k];
      var alpha = Math.max(0, Math.min(1, Math.min(p.x - a, b - p.x) / 2.5));
      var y = p.y + 0.5 * Math.sin(pile.horloge * 1.3 + p.phi);
      _petitIon(ctx, p.x, y, p.rgb, p.signe, alpha * 0.95);
    }
  }
}

function _dessinerIonsPont(ctx) {
  var L = _longueurPont(), liste = pile.particules.pont;
  for (var k = 0; k < liste.length; k++) {
    var q = liste[k];
    var P = _pointLigne(_CHEMIN_PONT, q.s);
    var d = q.d + 0.15 * Math.sin(pile.horloge * 1.7 + q.phi);
    var alpha = Math.max(0, Math.min(1, Math.min(q.s, L - q.s) / 3));
    _petitIon(ctx, P.x - P.ty * d, P.y + P.tx * d, q.rgb, q.signe, alpha);
  }
}

// ── Circuit extérieur ─────────────────────────────────────────────────
function _dessinerCircuit(ctx) {
  var comps = composantsCircuit();
  var xs = [lameX(0)];
  var i;
  for (i = 0; i < comps.length; i++) xs.push(comps[i].x0, comps[i].x1);
  xs.push(lameX(1));

  // Fils : des pinces au fil du haut, puis entre les composants
  ctx.strokeStyle = '#3a3f45';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.moveTo(lameX(0), P_LAME_TOP - 1.6);
  ctx.lineTo(lameX(0), P_FIL_Y);
  ctx.lineTo(xs[1], P_FIL_Y);
  for (i = 2; i < xs.length - 1; i += 2) {
    ctx.moveTo(xs[i], P_FIL_Y);
    ctx.lineTo(xs[i + 1], P_FIL_Y);
  }
  ctx.lineTo(lameX(1), P_LAME_TOP - 1.6);
  ctx.stroke();

  for (i = 0; i < comps.length; i++) {
    var c = comps[i];
    if (c.type === 'multimetre') _dessinerMultimetre(ctx, c);
    else if (c.type === 'interrupteur') _dessinerInterrupteur(ctx, c);
    else if (c.type === 'resistance') _dessinerResistance(ctx, c);
    else if (c.type === 'lampe') _dessinerLampe(ctx, c);
    else if (c.type === 'generateur') _dessinerGenerateur(ctx, c);
    else _dessinerFichesOuvertes(ctx, c);
  }
}

// Valeur affichée : virgule décimale et vrai signe moins
function formatNombre(x, dec) {
  var s = Math.abs(x).toFixed(dec).replace('.', ',');
  return (x < 0 && parseFloat(Math.abs(x).toFixed(dec)) > 0 ? '−' : '') + s;
}

// Afficheur à cristaux liquides d'un appareil : texte réduit pour tenir
function _afficheur(ctx, x0, x1, y0, txt) {
  ctx.fillStyle = '#c9d8b6';
  ctx.fillRect(x0, y0, x1 - x0, 6.4);
  var taille = Math.min(3.6, (x1 - x0 - 1.2) / (txt.length * 0.56));
  ctx.fillStyle = '#1d2a1a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  texteEchelle(ctx, txt, (x0 + x1) / 2, y0 + 3.3, taille, '700', dispP.k);
}

// Multimètre : boîtier, afficheur, bornes COM (à gauche) et V ou A (à
// droite). Le voltmètre affiche V(droite) − V(gauche), l'ampèremètre
// l'intensité du courant qui entre par la borne A (signes conservés)
function _dessinerMultimetre(ctx, c) {
  var xm = (c.x0 + c.x1) / 2, w = c.x1 - c.x0;
  var y0 = P_FIL_Y - 11, h = 16;
  ctx.fillStyle = '#e0a526';
  ctx.strokeStyle = '#7a5a10';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(c.x0, y0, w, h, 1.6); else ctx.rect(c.x0, y0, w, h);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3d4550';
  ctx.fillRect(c.x0 + 1, y0 + 1, w - 2, h - 2);
  _afficheur(ctx, c.x0 + 1.8, c.x1 - 1.8, y0 + 2,
             c.mode === 'V' ? formatNombre(tensionVoltmetre(), 2) + ' V'
                            : formatNombre(pile.I * 1000, 1) + ' mA');
  // Bornes
  ctx.fillStyle = '#ffffff';
  texteEchelle(ctx, 'COM', c.x0 + 3.4, P_FIL_Y + 1.9, 1.6, '700', dispP.k);
  texteEchelle(ctx, c.mode === 'V' ? 'V' : 'A', c.x1 - 2.6, P_FIL_Y + 1.9, 1.8, '700', dispP.k);
  _borne(ctx, c.x0, P_FIL_Y, '#20242a');
  _borne(ctx, c.x1, P_FIL_Y, '#c0392b');
  // Nom de l'appareil au-dessus
  ctx.fillStyle = '#2c3e50';
  ctx.textBaseline = 'alphabetic';
  texteEchelle(ctx, c.mode === 'V' ? 'Voltmètre' : 'Ampèremètre', xm, y0 - 1.1, 2.6, '600', dispP.k);
}

// Générateur de tension réglable : boîtier bleu-gris, afficheur de la
// tension réglée, bornes + (rouge) et − (noire) du côté choisi
function _dessinerGenerateur(ctx, c) {
  var xm = (c.x0 + c.x1) / 2, w = c.x1 - c.x0;
  var y0 = P_FIL_Y - 11, h = 16;
  ctx.fillStyle = '#4f6a86';
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(c.x0, y0, w, h, 1.2); else ctx.rect(c.x0, y0, w, h);
  ctx.fill(); ctx.stroke();
  _afficheur(ctx, c.x0 + 1.4, c.x1 - 1.4, y0 + 2, formatNombre(tensionGenerateur(), 2) + ' V');
  var plusDroite = pile.polarite > 0;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  texteEchelle(ctx, plusDroite ? '−' : '+', c.x0 + 2.8, P_FIL_Y + 1.6, 2.6, '700', dispP.k);
  texteEchelle(ctx, plusDroite ? '+' : '−', c.x1 - 2.8, P_FIL_Y + 1.6, 2.6, '700', dispP.k);
  _borne(ctx, c.x0, P_FIL_Y, plusDroite ? '#20242a' : '#c0392b');
  _borne(ctx, c.x1, P_FIL_Y, plusDroite ? '#c0392b' : '#20242a');
  ctx.fillStyle = '#2c3e50';
  ctx.textBaseline = 'alphabetic';
  texteEchelle(ctx, 'Générateur', xm, y0 - 1.1, 2.6, '600', dispP.k);
}

function _borne(ctx, x, y, couleur) {
  ctx.fillStyle = couleur;
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 0.15;
  ctx.beginPath();
  ctx.arc(x, y, 1.1, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
}

// Interrupteur : levier entre deux plots, levé quand il est ouvert
function _dessinerInterrupteur(ctx, c) {
  var surv = pile.survol === 'interrupteur';
  if (surv) {
    ctx.fillStyle = 'rgba(42,106,170,0.15)';
    ctx.beginPath();
    ctx.rect(c.x0 - 1.8, P_FIL_Y - 6, c.x1 - c.x0 + 3.6, 8.2);
    ctx.fill();
  }
  var ang = pile.interrupteur ? 0 : -0.6;
  var L = c.x1 - c.x0;
  ctx.strokeStyle = surv ? '#2a6aaa' : '#3a3f45';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(c.x0, P_FIL_Y);
  ctx.lineTo(c.x0 + L * Math.cos(ang), P_FIL_Y + L * Math.sin(ang));
  ctx.stroke();
  _plot(ctx, c.x0, P_FIL_Y);
  _plot(ctx, c.x1, P_FIL_Y);
  ctx.fillStyle = '#5a6a78';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  texteEchelle(ctx, 'K', (c.x0 + c.x1) / 2, P_FIL_Y + 5, 2.4, '700', dispP.k);
}

function _plot(ctx, x, y) {
  ctx.fillStyle = '#3a3f45';
  ctx.beginPath();
  ctx.arc(x, y, 0.75, 0, Math.PI * 2);
  ctx.fill();
}

function _dessinerResistance(ctx, c) {
  ctx.fillStyle = '#f2ead8';
  ctx.strokeStyle = '#3a3f45';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.rect(c.x0, P_FIL_Y - 1.7, c.x1 - c.x0, 3.4);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2c3e50';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  texteEchelle(ctx, 'R = ' + RESISTANCES[pile.iR] + ' Ω', (c.x0 + c.x1) / 2, P_FIL_Y + 5.4, 2.6, '600', dispP.k);
}

// Lampe : ampoule sur son culot ; elle brille selon la puissance reçue
function _dessinerLampe(ctx, c) {
  var xm = (c.x0 + c.x1) / 2, yb = P_FIL_Y - 5.2, rb = 3.3;
  var P = pile.I * pile.I * R_LAMPE;
  var eclat = Math.min(1, Math.sqrt(P / P_NOMINALE));
  if (eclat > 0.02) {
    var g = ctx.createRadialGradient(xm, yb, 0, xm, yb, rb * 3.2);
    g.addColorStop(0, 'rgba(255,230,120,' + 0.85 * eclat + ')');
    g.addColorStop(1, 'rgba(255,230,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(xm, yb, rb * 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Ampoule
  ctx.fillStyle = eclat > 0.02 ? rgbCss(melange([236, 240, 244], [255, 236, 150], eclat)) : 'rgba(236,240,244,0.9)';
  ctx.strokeStyle = '#6f7f8c';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.arc(xm, yb, rb, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // Filament
  ctx.strokeStyle = eclat > 0.02 ? rgbCss(melange([90, 90, 90], [255, 150, 30], eclat)) : '#5a5a5a';
  ctx.lineWidth = 0.25;
  ctx.beginPath();
  ctx.moveTo(xm - 1.2, yb + 2.6); ctx.lineTo(xm - 1.2, yb);
  ctx.lineTo(xm - 0.6, yb - 0.7); ctx.lineTo(xm, yb); ctx.lineTo(xm + 0.6, yb - 0.7);
  ctx.lineTo(xm + 1.2, yb); ctx.lineTo(xm + 1.2, yb + 2.6);
  ctx.stroke();
  // Culot, posé sur le fil
  ctx.fillStyle = '#9aa2aa';
  ctx.strokeStyle = '#4a525c';
  ctx.beginPath();
  ctx.rect(xm - 2, yb + 2.4, 4, P_FIL_Y + 1 - (yb + 2.4));
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#3a3f45';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.moveTo(c.x0, P_FIL_Y); ctx.lineTo(xm - 2, P_FIL_Y);
  ctx.moveTo(xm + 2, P_FIL_Y); ctx.lineTo(c.x1, P_FIL_Y);
  ctx.stroke();
  ctx.fillStyle = '#2c3e50';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  texteEchelle(ctx, 'Lampe', xm, P_FIL_Y + 5.4, 2.6, '600', dispP.k);
}

// Rien entre les électrodes : deux fiches qui ne se touchent pas
function _dessinerFichesOuvertes(ctx, c) {
  ctx.fillStyle = '#20242a';
  ctx.fillRect(c.x0 - 0.4, P_FIL_Y - 0.9, 2.2, 1.8);
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(c.x1 - 1.8, P_FIL_Y - 0.9, 2.2, 1.8);
  ctx.strokeStyle = '#8a929c';
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  ctx.moveTo(c.x0 + 1.8, P_FIL_Y); ctx.lineTo(c.x0 + 3.2, P_FIL_Y);
  ctx.moveTo(c.x1 - 1.8, P_FIL_Y); ctx.lineTo(c.x1 - 3.2, P_FIL_Y);
  ctx.stroke();
  ctx.fillStyle = '#7a8a96';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  texteEchelle(ctx, 'Circuit ouvert', (c.x0 + c.x1) / 2, P_FIL_Y - 2.4, 2.4, '600', dispP.k);
}

// ── Sens du courant et électrons dans les fils ────────────────────────
function _dessinerCourant(ctx) {
  var comps = composantsCircuit(), chemin = _cheminFil(), L = _longueurLigne(chemin);
  // Électrons, sauf dans les appareils et entre les fiches ouvertes
  var s0 = ((pile.phaseE % ECART_ELECTRONS) + ECART_ELECTRONS) % ECART_ELECTRONS;
  for (var s = s0; s < L; s += ECART_ELECTRONS) {
    var P = _pointLigne(chemin, s);
    var cache = false;
    if (Math.abs(P.y - P_FIL_Y) < 0.01) {
      for (var i = 0; i < comps.length; i++) {
        if (comps[i].type !== 'interrupteur' && P.x > comps[i].x0 - 1.2 && P.x < comps[i].x1 + 1.2) cache = true;
      }
    }
    if (cache) continue;
    ctx.fillStyle = '#2a6aaa';
    ctx.beginPath();
    ctx.arc(P.x, P.y, 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 0.18;
    ctx.beginPath();
    ctx.moveTo(P.x - 0.38, P.y); ctx.lineTo(P.x + 0.38, P.y);
    ctx.stroke();
  }
  // Flèches du sens conventionnel dans le circuit extérieur : de la
  // cathode vers l'anode en passant par les fils (descend vers la lame de
  // gauche si I > 0)
  if (pile.I === 0) return;
  var bas = pile.I > 0;
  _flecheCourant(ctx, lameX(0) - 2.2, 30, bas ? 1 : -1);
  _flecheCourant(ctx, lameX(1) + 2.2, 30, bas ? -1 : 1);
}

// Flèche verticale rouge (sens : +1 vers le bas), marquée I
function _flecheCourant(ctx, x, y, sens) {
  ctx.fillStyle = '#cc2200';
  ctx.beginPath();
  ctx.moveTo(x, y + 1.8 * sens);
  ctx.lineTo(x - 1.3, y - 0.8 * sens);
  ctx.lineTo(x + 1.3, y - 0.8 * sens);
  ctx.closePath();
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  texteEchelle(ctx, 'I', x + (x < P_SCENE_W / 2 ? -2.2 : 2.2), y + 0.3, 2.8, '700', dispP.k);
}

// ── Étiquettes ────────────────────────────────────────────────────────
function _dessinerEtiquettesP(ctx) {
  var i, R = recipients();
  ctx.textBaseline = 'alphabetic';
  for (i = 0; i < 2; i++) {
    var M = METAUX[pile.lames[i].sym];
    var gauche = i === 0;
    var xl = gauche ? lameX(0) - P_LAME_W / 2 - 1.6 : lameX(1) + P_LAME_W / 2 + 1.6;
    ctx.textAlign = gauche ? 'right' : 'left';
    ctx.fillStyle = '#2c3e50';
    texteEchelle(ctx, 'Lame ' + M.de, xl, 50.5, 2.9, '600', dispP.k);

    if (pile.showPoles) {
      var pole = poleElectrode(i), role = roleElectrode(i);
      if (pole || role) {
        var txt = (pole ? 'Pôle ' + pole : '') + (pole && role ? ' · ' : '') + role;
        ctx.fillStyle = pole === '+' ? 'rgba(210,100,20,1)' : pole === '−' ? 'rgba(40,80,180,1)' : '#5a6a78';
        texteEchelle(ctx, txt, xl, 54.2, 2.9, '700', dispP.k);
      }
    }
  }

  // Solutions : nom et concentrations actuelles, sous chaque récipient
  ctx.textAlign = 'center';
  for (var c = 0; c < R.length; c++) {
    var C = pile.comp[c], xm = (R[c].L + R[c].R) / 2;
    ctx.fillStyle = '#2c3e50';
    texteEchelle(ctx, _majusculeP(C.nom), xm, P_TABLE_Y + 6.4, 2.9, '600', dispP.k);
    var morceaux = [];
    for (var sym in C.n) {
      var conc = concentrationC(c, sym);
      if (sym === C.sym0 || conc >= 5e-4) {
        morceaux.push('[' + ionTexte(sym) + '] = ' + formatConcentration(conc) + ' mol/L');
      }
    }
    ctx.fillStyle = '#5a6a78';
    texteEchelle(ctx, morceaux.join('   '), xm, P_TABLE_Y + 10, 2.6, '400', dispP.k);
  }

  if (!enCuve()) {
    ctx.fillStyle = pile.pont ? '#2c3e50' : '#9aa6b0';
    texteEchelle(ctx, pile.pont ? 'Pont salin (K⁺ + NO₃⁻)' : 'Pont salin retiré',
                 (P_PONT_X[0] + P_PONT_X[1]) / 2, P_PONT_Y - 3.4, 2.6, '600', dispP.k);
  }
}

function _majusculeP(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// Concentration : trois chiffres significatifs, virgule décimale
function formatConcentration(c) {
  if (c >= 0.995) return c.toFixed(2).replace('.', ',');
  if (c >= 0.0995) return c.toFixed(3).replace('.', ',');
  return c.toFixed(4).replace('.', ',');
}

// ── Zones de la loupe : cercles cliquables ────────────────────────────
function _dessinerZones(ctx) {
  var Z = zonesLoupe();
  for (var nom in Z) {
    if (nom === pile.zone) continue;          // la zone active est dessinée avec la loupe
    if (nom === 'pont' && !pile.pont) continue;
    var z = Z[nom], surv = pile.survol === nom;
    ctx.fillStyle = surv ? 'rgba(42,106,170,0.18)' : 'rgba(253,248,240,0.25)';
    ctx.strokeStyle = surv ? '#2a6aaa' : 'rgba(42,106,170,0.6)';
    ctx.lineWidth = surv ? 0.35 : 0.25;
    ctx.setLineDash(surv ? [] : [0.7, 0.5]);
    ctx.beginPath();
    ctx.arc(z.x, z.y, R_ZONE, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    // Petite loupe dessinée au centre
    ctx.lineWidth = 0.22;
    ctx.beginPath();
    ctx.arc(z.x - 0.25, z.y - 0.25, 0.75, 0, Math.PI * 2);
    ctx.moveTo(z.x + 0.3, z.y + 0.3); ctx.lineTo(z.x + 1, z.y + 1);
    ctx.stroke();
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Souris : choix de la zone de la loupe, interrupteur
// ══════════════════════════════════════════════════════════════════════

// Élément sous le point (px CSS) : nom de zone, 'interrupteur' ou null
function _cibleSous(px, py) {
  var p = pxVersPile(px, py);
  var Z = zonesLoupe();
  for (var nom in Z) {
    if (nom === 'pont' && !pile.pont) continue;
    if (Math.hypot(p.x - Z[nom].x, p.y - Z[nom].y) < R_ZONE + 1) return nom;
  }
  var comps = composantsCircuit();
  for (var i = 0; i < comps.length; i++) {
    var c = comps[i];
    if (c.type === 'interrupteur' && p.x > c.x0 - 2 && p.x < c.x1 + 2 &&
        p.y > P_FIL_Y - 7 && p.y < P_FIL_Y + 3) return 'interrupteur';
  }
  return null;
}

// Renvoie true si le clic a servi
function pilePointerDown(px, py) {
  var cible = _cibleSous(px, py);
  if (!cible) return false;
  if (cible === 'interrupteur') toggleInterrupteur();
  else setZonePile(cible);
  return true;
}

// Renvoie true si le pointeur est sur un élément cliquable
function pilePointerMove(px, py) {
  var cible = _cibleSous(px, py);
  if (cible !== pile.survol) {
    pile.survol = cible;
    sim.needsRedraw = true;
  }
  return cible !== null;
}
