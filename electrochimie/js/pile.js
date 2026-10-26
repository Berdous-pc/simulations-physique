// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  pile.js — Onglet Pile et électrolyse : modèle et montage macroscopique
//  Dépend de sim.js (METAUX, utilitaires) et becher.js (_EAU,
//  _degradeMetal).
//
//  Deux demi-piles Mⁿ⁺/M (table METAUX) dans deux béchers reliés par un
//  pont salin (K⁺ + NO₃⁻). Entre les deux électrodes, le circuit extérieur
//  au choix : rien, un voltmètre, un ampèremètre + une résistance ou un
//  ampèremètre + une lampe (avec interrupteur).
//
//  Modèle (Terminale, semi-quantitatif) :
//    - potentiel de chaque électrode par la loi de Nernst, calculée en
//      coulisse et jamais affichée : E = E° + (0,059/n)·log[Mⁿ⁺] ;
//    - tension à vide E = E(droite) − E(gauche), multipliée par un facteur
//      d'épuisement qui l'annule quand le réactif limitant (ion de la
//      cathode ou métal de l'anode) est épuisé : la pile usée ne débite
//      plus et le voltmètre affiche alors 0 ;
//    - intensité I = E / (R + r), r résistance interne (pont salin) ;
//    - quantités : Q = I·Δt = n(e⁻)·F, concentrations et masses des lames
//      tenues à jour. Le temps est accéléré (TEMPS_ACCEL).
//  Convention de signe : I > 0 quand l'électrode de droite est le pôle +
//  (courant de la droite vers la gauche dans le circuit extérieur, de la
//  gauche vers la droite dans les solutions et le pont salin).
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ══════════════════════════════════════════════════════════════════════
//  Constantes physiques et du montage
// ══════════════════════════════════════════════════════════════════════

var FARADAY = 96500;          // C/mol
var PENTE_NERNST = 0.059;     // V, à 25 °C
var P_VOLUME = 0.100;         // volume de chaque solution (L)
var N_LAME = 0.05;            // quantité de métal de la partie immergée d'une lame (mol)
var R_INTERNE = 20;           // résistance interne de la pile (Ω), surtout celle du pont salin
var R_LAMPE = 15;             // résistance de la lampe (Ω)
var P_NOMINALE = 0.03;        // puissance pour laquelle la lampe brille à fond (W)
var TEMPS_ACCEL = 3600;       // secondes de fonctionnement par seconde d'animation, à ×1
var I_REF = 0.03;             // intensité (A) des animations les plus rapides

// Facteur d'épuisement : x / (x + coude). Négligeable tant que le réactif
// limitant est abondant, il fait tomber la tension et le courant quand il
// s'épuise (la loi de Nernst seule ne baisse que lentement, en logarithme).
var C_COUDE = 0.0002;         // mol/L, ion réduit à la cathode
var N_COUDE = 0.0002;         // mol, métal oxydé à l'anode

// Crans des curseurs
var CONCENTRATIONS = [0.01, 0.05, 0.1, 0.5, 1.0];          // mol/L
var RESISTANCES = [10, 22, 47, 100, 220, 470, 1000];       // Ω

// Ions du pont salin (nitrate de potassium : pas de précipité avec Ag⁺)
var K_PONT = { texte: 'K⁺', couleur: '#c98a55' };

// ══════════════════════════════════════════════════════════════════════
//  Expériences prédéfinies (palier 1 : piles à deux béchers)
//  g, d : métaux des demi-piles de gauche et de droite ; cg, cd : crans de
//  concentration (indices dans CONCENTRATIONS).
// ══════════════════════════════════════════════════════════════════════

var EXPERIENCES = {
  'daniell': { nom: 'Pile Daniell (zinc – cuivre)', g: 'Zn', d: 'Cu', cg: 2, cd: 2 },
  'cu-ag':   { nom: 'Pile cuivre – argent', g: 'Cu', d: 'Ag', cg: 2, cd: 2 },
  'fe-cu':   { nom: 'Pile fer – cuivre', g: 'Fe', d: 'Cu', cg: 2, cd: 2 },
  'zn-pb':   { nom: 'Pile zinc – plomb', g: 'Zn', d: 'Pb', cg: 2, cd: 2 },
  'conc-cu': { nom: 'Pile de concentration (cuivre)', g: 'Cu', d: 'Cu', cg: 0, cd: 4 },
  'libre':   { nom: 'Montage libre' }
};
var ORDRE_EXPERIENCES = ['daniell', 'cu-ag', 'fe-cu', 'zn-pb', 'conc-cu', 'libre'];

// ══════════════════════════════════════════════════════════════════════
//  Géométrie du montage, en unités logiques (repère 140 × 102)
//  Indice 0 = demi-pile de gauche, 1 = demi-pile de droite.
// ══════════════════════════════════════════════════════════════════════

var P_SCENE_W = 140, P_SCENE_H = 102;
var P_TABLE_Y = 90;
var P_BECHER_W = 30, P_BECHER_H = 34;
var P_BECHER_CX = [38, 102];
var P_BECHER_TOP = P_TABLE_Y - P_BECHER_H;
var P_SOL_TOP = 62;                       // surface libre des solutions
var P_LAME_W = 4, P_LAME_H = 42;
var P_LAME_X = [31, 109];                 // axes des lames
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
  metaux: ['Zn', 'Cu'],      // demi-piles de gauche et de droite
  iC0: [2, 2],               // crans des concentrations initiales
  dipole: 'voltmetre',       // 'aucun' | 'voltmetre' | 'resistance' | 'lampe'
  interrupteur: false,       // fermé ?
  iR: 3,                     // cran de la résistance (100 Ω)
  pont: true,                // pont salin en place
  zone: 'gauche',            // zone vue dans la loupe : 'gauche' | 'droite' | 'pont' | 'fil'

  showCourant:   false,      // sens du courant et électrons dans les fils
  showMigration: false,      // ions qui migrent dans les solutions et le pont
  showPoles:     false,      // pôles, anode et cathode
  showEquations: false,

  // ── Grandeurs ──
  nIon: [0, 0],              // quantité d'ions Mⁿ⁺ de chaque solution (mol)
  dLame: [0, 0],             // métal gagné (+, dépôt) ou perdu (−) par chaque lame (mol)
  t: 0,                      // durée de fonctionnement (s, temps accéléré)
  Q: 0,                      // quantité d'électricité débitée (C)
  E: 0,                      // tension à vide (V), signée
  I: 0,                      // intensité (A), signée

  // ── Animations ──
  horloge: 0,                // temps d'animation (s)
  phaseE: 0,                 // décalage des électrons le long des fils
  particules: null,          // ions du montage (option migration)
  bruitDepot: null,          // contour irrégulier des dépôts
  survol: null               // zone ou interrupteur sous la souris
};

// ══════════════════════════════════════════════════════════════════════
//  Grandeurs chimiques et électriques
// ══════════════════════════════════════════════════════════════════════

function concInitiale(i) { return CONCENTRATIONS[pile.iC0[i]]; }
function concentration(i) { return Math.max(0, pile.nIon[i]) / P_VOLUME; }
function resteLame(i) { return Math.max(0, N_LAME + pile.dLame[i]); }

// Potentiel d'électrode (loi de Nernst, en coulisse)
function potentielElectrode(i) {
  var M = METAUX[pile.metaux[i]];
  return M.E0 + PENTE_NERNST / M.charge * Math.log(Math.max(concentration(i), 1e-9)) / Math.LN10;
}

// Tension à vide signée : potentiel de droite − potentiel de gauche, avec
// le facteur d'épuisement du réactif limitant du sens spontané.
// Indépendante du pont salin (elle sert aussi à nommer les pôles).
function femPile() {
  var En = potentielElectrode(1) - potentielElectrode(0);
  var iCat = En >= 0 ? 1 : 0, iAn = 1 - iCat;
  var c = concentration(iCat), n = resteLame(iAn);
  return En * (c / (c + C_COUDE)) * (n / (n + N_COUDE));
}

function chargeBranchee() { return pile.dipole === 'resistance' || pile.dipole === 'lampe'; }
function resistanceCharge() { return pile.dipole === 'lampe' ? R_LAMPE : RESISTANCES[pile.iR]; }
function circuitFerme() { return chargeBranchee() && pile.interrupteur && pile.pont; }

// En dessous de 1 µA (pile épuisée : reste infime du facteur
// d'épuisement), on considère qu'aucun courant ne circule
var I_MIN = 1e-6;

function courantPile() {
  if (!circuitFerme()) return 0;
  var I = femPile() / (resistanceCharge() + R_INTERNE);
  return Math.abs(I) < I_MIN ? 0 : I;
}

// Tension lue par le voltmètre (borne V à droite, COM à gauche). Sans pont
// salin, le circuit est ouvert dans les solutions : rien à mesurer.
function tensionVoltmetre() { return pile.pont ? femPile() : 0; }

// Rôle d'une électrode : 'anode' (oxydation), 'cathode' (réduction) ou ''
// quand aucun courant ne circule
function roleElectrode(i) {
  if (pile.I === 0) return '';
  return (pile.I > 0) === (i === 0) ? 'anode' : 'cathode';
}

// Pôle d'une électrode d'après la tension à vide : '+', '−' ou ''
function poleElectrode(i) {
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
  for (var i = 0; i < 2; i++) {
    pile.nIon[i] = concInitiale(i) * P_VOLUME;
    pile.dLame[i] = 0;
  }
  pile.t = 0;
  pile.Q = 0;
  pile.horloge = 0;
  pile.phaseE = 0;
  pile.E = femPile();
  pile.I = courantPile();
  _tirerParticules();
  _tirerBruitDepot();
}

// Ions du montage (option migration) : quelques ions par bécher, répartis
// dans la solution, et des ions K⁺ / NO₃⁻ le long du pont salin
function _tirerParticules() {
  var alea = creerAlea(20261027);
  var bechers = [[], []];
  for (var i = 0; i < 2; i++) {
    var M = METAUX[pile.metaux[i]];
    for (var k = 0; k < 14; k++) {
      var cation = k % 2 === 0;
      bechers[i].push({
        x: _xMinIons(i) + alea() * (_xMaxIons(i) - _xMinIons(i)),
        y: P_SOL_TOP + 3 + alea() * (P_TABLE_Y - P_SOL_TOP - 5.5),
        signe: cation ? 1 : -1,
        rgb: couleurRGB(cation ? M.ion : ANIONS[M.anion].couleur),
        phi: alea() * 6.28
      });
    }
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
  pile.particules = { bechers: bechers, pont: pont };
}

function _xMinIons(i) { return P_BECHER_CX[i] - P_BECHER_W / 2 + 1.6; }
function _xMaxIons(i) { return P_BECHER_CX[i] + P_BECHER_W / 2 - 1.6; }

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
// quantité d'électrons échangée à chaque pas reste petite devant ce qui
// reste du réactif limitant, ce qui suit sans à-coup la chute finale.
function _integrerPile(dt) {
  var pas = 0;
  while (dt > 1e-9 && pas < 500) {
    pas++;
    var I = courantPile();
    if (Math.abs(I) < 1e-9) break;
    var iCat = I > 0 ? 1 : 0, iAn = 1 - iCat;
    var zC = METAUX[pile.metaux[iCat]].charge, zA = METAUX[pile.metaux[iAn]].charge;
    var dispo = Math.min(Math.max(0, pile.nIon[iCat]) * zC, resteLame(iAn) * zA);
    var h = dt;
    var ne = Math.abs(I) * h / FARADAY;        // électrons échangés (mol)
    if (ne > 0.05 * dispo) {
      ne = 0.05 * dispo;
      h = ne * FARADAY / Math.abs(I);
      if (h < 1e-6) break;
    }
    pile.nIon[iAn]  += ne / zA;  pile.dLame[iAn]  -= ne / zA;   // anode : M → Mⁿ⁺ + n e⁻
    pile.nIon[iCat] -= ne / zC;  pile.dLame[iCat] += ne / zC;   // cathode : Mⁿ⁺ + n e⁻ → M
    pile.t += h;
    pile.Q += ne * FARADAY;
    dt -= h;
  }
  if (circuitFerme()) pile.t += Math.max(0, dt);
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
  var P = pile.particules;
  for (var i = 0; i < 2; i++) {
    var a = _xMinIons(i), b = _xMaxIons(i);
    for (var k = 0; k < P.bechers[i].length; k++) {
      var p = P.bechers[i][k];
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
//  (x0, x1 : bornes de gauche et de droite)
// ══════════════════════════════════════════════════════════════════════

function composantsCircuit() {
  switch (pile.dipole) {
    case 'voltmetre':
      return [{ type: 'multimetre', mode: 'V', x0: 60, x1: 80 }];
    case 'resistance':
      return [{ type: 'multimetre', mode: 'A', x0: 50, x1: 70 },
              { type: 'interrupteur', x0: 78, x1: 86 },
              { type: 'resistance', x0: 93, x1: 103 }];
    case 'lampe':
      return [{ type: 'multimetre', mode: 'A', x0: 50, x1: 70 },
              { type: 'interrupteur', x0: 78, x1: 86 },
              { type: 'lampe', x0: 94, x1: 102 }];
    default:
      return [{ type: 'ouvert', x0: 62, x1: 78 }];
  }
}

// Fil de l'électrode de gauche à celle de droite (ligne brisée), parcouru
// par les électrons
var _CHEMIN_FIL = [[P_LAME_X[0], P_LAME_TOP - 1], [P_LAME_X[0], P_FIL_Y],
                   [P_LAME_X[1], P_FIL_Y], [P_LAME_X[1], P_LAME_TOP - 1]];

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
  return {
    gauche: { x: P_LAME_X[0] + P_LAME_W / 2, y: P_Y_LOUPE },
    droite: { x: P_LAME_X[1] - P_LAME_W / 2, y: P_Y_LOUPE },
    pont:   { x: (P_PONT_X[0] + P_PONT_X[1]) / 2, y: P_PONT_Y },
    fil:    { x: 40, y: P_FIL_Y }
  };
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

  var i, cols = [_couleurSolutionPile(0), _couleurSolutionPile(1)];

  // Solutions (couleur pleine + modelé), ions qui migrent, lames, pont,
  // puis voile de la solution devant ce qui est immergé, puis le verre
  for (i = 0; i < 2; i++) {
    _cheminInterieurP(ctx, i, P_SOL_TOP);
    ctx.fillStyle = rgbCss(cols[i]);
    ctx.fill();
    _dessinerVolumeP(ctx, i);
  }
  if (pile.showMigration) _dessinerIonsBechers(ctx);
  for (i = 0; i < 2; i++) _dessinerLameP(ctx, i);
  if (pile.pont) _dessinerPont(ctx);
  for (i = 0; i < 2; i++) {
    _cheminInterieurP(ctx, i, P_SOL_TOP);
    ctx.fillStyle = rgbCss(cols[i], ALPHA_VOILE);
    ctx.fill();
    ctx.strokeStyle = rgbCss(nuance(cols[i], -0.3), 0.8);
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.moveTo(_bordG(i), P_SOL_TOP); ctx.lineTo(_bordD(i), P_SOL_TOP);
    ctx.stroke();
    _dessinerVerreP(ctx, i);
  }
  if (pile.pont && pile.showMigration) _dessinerIonsPont(ctx);

  _dessinerCircuit(ctx);
  if (pile.showCourant) _dessinerCourant(ctx);
  _dessinerEtiquettesP(ctx);
  _dessinerZones(ctx);

  ctx.restore();
}

function _bordG(i) { return P_BECHER_CX[i] - P_BECHER_W / 2; }
function _bordD(i) { return P_BECHER_CX[i] + P_BECHER_W / 2; }

// ── Couleur d'une solution selon sa concentration ─────────────────────
// Mêmes teintes que l'onglet Oxydoréduction (METAUX[…].solution), sur une
// échelle logarithmique : 1 mol/L → teinte la plus soutenue, 0,005 mol/L
// et moins → l'eau. Les ions incolores laissent l'eau.
function _couleurSolutionPile(i) {
  var M = METAUX[pile.metaux[i]], c = concentration(i);
  if (!M.solution || c <= 0) return _EAU.slice();
  var t = Math.max(0, Math.min(1, (Math.log(c) / Math.LN10 + 2.3) / 2.3));
  return melange(_EAU, couleurSuite(M.solution, t), Math.min(1, t / 0.35));
}

// ── Béchers (mêmes formes que becher.js, bec verseur côté extérieur) ──
function _cheminInterieurP(ctx, i, yHaut) {
  var L = _bordG(i), R = _bordD(i);
  ctx.beginPath();
  ctx.moveTo(L, yHaut);
  ctx.lineTo(L, P_TABLE_Y - 1);
  ctx.quadraticCurveTo(L, P_TABLE_Y, L + 1, P_TABLE_Y);
  ctx.lineTo(R - 1, P_TABLE_Y);
  ctx.quadraticCurveTo(R, P_TABLE_Y, R, P_TABLE_Y - 1);
  ctx.lineTo(R, yHaut);
  ctx.closePath();
}

function _dessinerVolumeP(ctx, i) {
  var L = _bordG(i), R = _bordD(i);
  _cheminInterieurP(ctx, i, P_SOL_TOP);
  var g = ctx.createLinearGradient(L, 0, R, 0);
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

function _dessinerVerreP(ctx, i) {
  var L = _bordG(i), R = _bordD(i), T = P_BECHER_TOP;
  ctx.strokeStyle = '#6f7f8c';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  if (i === 0) {                                   // bec verseur à gauche
    ctx.moveTo(L - 1.6, T - 0.8);
    ctx.quadraticCurveTo(L, T, L, T + 2);
  } else {
    ctx.moveTo(L, T);
  }
  ctx.lineTo(L, P_TABLE_Y - 1);
  ctx.quadraticCurveTo(L, P_TABLE_Y, L + 1, P_TABLE_Y);
  ctx.lineTo(R - 1, P_TABLE_Y);
  ctx.quadraticCurveTo(R, P_TABLE_Y, R, P_TABLE_Y - 1);
  if (i === 1) {                                   // bec verseur à droite
    ctx.lineTo(R, T + 2);
    ctx.quadraticCurveTo(R, T, R + 1.6, T - 0.8);
  } else {
    ctx.lineTo(R, T);
  }
  ctx.stroke();
  // Graduations, côté du bec
  ctx.strokeStyle = 'rgba(111,127,140,0.7)';
  ctx.lineWidth = 0.25;
  for (var k = 1; k <= 4; k++) {
    var y = P_TABLE_Y - k * 7.5, l = k % 2 ? 2 : 3.5;
    ctx.beginPath();
    if (i === 0) { ctx.moveTo(L + 1, y); ctx.lineTo(L + 1 + l, y); }
    else         { ctx.moveTo(R - 1, y); ctx.lineTo(R - 1 - l, y); }
    ctx.stroke();
  }
}

// ── Lames : partie immergée rongée (anode) ou couverte de dépôt (cathode)
function _dessinerLameP(ctx, i) {
  var M = METAUX[pile.metaux[i]];
  var base = couleurRGB(M.atome);
  var x0 = P_LAME_X[i] - P_LAME_W / 2;
  var top = P_LAME_TOP, yb = P_LAME_YB;
  var hSeche = P_SOL_TOP - top;

  ctx.fillStyle = _degradeMetal(ctx, x0, P_LAME_W, base, 0);
  ctx.fillRect(x0, top, P_LAME_W, hSeche);
  ctx.strokeStyle = rgbCss(nuance(base, -0.45));
  ctx.lineWidth = 0.25;
  ctx.strokeRect(x0, top, P_LAME_W, hSeche);

  // Partie immergée, amincie à mesure que le métal s'oxyde (elle
  // disparaît quand il est entièrement consommé)
  var perdu = Math.min(1, Math.max(0, -pile.dLame[i]) / N_LAME);
  var w = P_LAME_W * Math.pow(1 - perdu, 0.6);
  if (w > 0.05) {
    var xa = P_LAME_X[i] - w / 2;
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

  // Dépôt du métal formé (même élément que la lame), en couche irrégulière
  var gagne = Math.max(0, pile.dLame[i]);
  if (gagne > 1e-6) {
    var e = 2.2 * Math.sqrt(Math.min(1.5, gagne / 0.02));
    var B = pile.bruitDepot[i], n = B[0].length - 1;
    var yH = P_SOL_TOP + 0.6, H = yb - yH;
    var col = _couleurDepotP(pile.metaux[i]);
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
  ctx.rect(P_LAME_X[i] - P_LAME_W / 2 - 0.6, top - 1.6, P_LAME_W + 1.2, 3.6);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#8a929c';
  ctx.fillRect(P_LAME_X[i] - P_LAME_W / 2 - 0.2, top - 1.1, P_LAME_W + 0.4, 0.6);
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

function _dessinerIonsBechers(ctx) {
  for (var i = 0; i < 2; i++) {
    var a = _xMinIons(i), b = _xMaxIons(i);
    var liste = pile.particules.bechers[i];
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
  var xs = [P_LAME_X[0]];
  var i;
  for (i = 0; i < comps.length; i++) xs.push(comps[i].x0, comps[i].x1);
  xs.push(P_LAME_X[1]);

  // Fils : des pinces au fil du haut, puis entre les composants
  ctx.strokeStyle = '#3a3f45';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.moveTo(P_LAME_X[0], P_LAME_TOP - 1.6);
  ctx.lineTo(P_LAME_X[0], P_FIL_Y);
  ctx.lineTo(xs[1], P_FIL_Y);
  for (i = 2; i < xs.length - 1; i += 2) {
    ctx.moveTo(xs[i], P_FIL_Y);
    ctx.lineTo(xs[i + 1], P_FIL_Y);
  }
  ctx.lineTo(P_LAME_X[1], P_LAME_TOP - 1.6);
  ctx.stroke();

  for (i = 0; i < comps.length; i++) {
    var c = comps[i];
    if (c.type === 'multimetre') _dessinerMultimetre(ctx, c);
    else if (c.type === 'interrupteur') _dessinerInterrupteur(ctx, c);
    else if (c.type === 'resistance') _dessinerResistance(ctx, c);
    else if (c.type === 'lampe') _dessinerLampe(ctx, c);
    else _dessinerFichesOuvertes(ctx, c);
  }
}

// Valeur affichée : virgule décimale et vrai signe moins
function formatNombre(x, dec) {
  var s = Math.abs(x).toFixed(dec).replace('.', ',');
  return (x < 0 && parseFloat(Math.abs(x).toFixed(dec)) > 0 ? '−' : '') + s;
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
  // Afficheur
  ctx.fillStyle = '#c9d8b6';
  ctx.fillRect(c.x0 + 2, y0 + 2, w - 4, 6.4);
  var txt = c.mode === 'V' ? formatNombre(tensionVoltmetre(), 2) + ' V'
                           : formatNombre(pile.I * 1000, 1) + ' mA';
  ctx.fillStyle = '#1d2a1a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  texteEchelle(ctx, txt, xm, y0 + 5.3, 3.6, '700', dispP.k);
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
  ctx.fillStyle = surv ? 'rgba(42,106,170,0.15)' : 'rgba(0,0,0,0)';
  ctx.beginPath();
  ctx.rect(c.x0 - 1.8, P_FIL_Y - 6, c.x1 - c.x0 + 3.6, 8.2);
  ctx.fill();
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
  var comps = composantsCircuit(), L = _longueurLigne(_CHEMIN_FIL);
  // Électrons, sauf dans les appareils et entre les fiches ouvertes
  var s0 = ((pile.phaseE % ECART_ELECTRONS) + ECART_ELECTRONS) % ECART_ELECTRONS;
  for (var s = s0; s < L; s += ECART_ELECTRONS) {
    var P = _pointLigne(_CHEMIN_FIL, s);
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
  // Flèches du sens conventionnel : du pôle + vers le pôle − dans le
  // circuit extérieur (descend vers la lame de gauche si I > 0)
  if (pile.I === 0) return;
  var bas = pile.I > 0;
  _flecheCourant(ctx, P_LAME_X[0] - 2.2, 30, bas ? 1 : -1);
  _flecheCourant(ctx, P_LAME_X[1] + 2.2, 30, bas ? -1 : 1);
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
  ctx.textBaseline = 'alphabetic';
  for (var i = 0; i < 2; i++) {
    var M = METAUX[pile.metaux[i]];
    var gauche = i === 0;
    var xl = gauche ? P_LAME_X[0] - P_LAME_W / 2 - 1.6 : P_LAME_X[1] + P_LAME_W / 2 + 1.6;
    ctx.textAlign = gauche ? 'right' : 'left';
    ctx.fillStyle = '#2c3e50';
    texteEchelle(ctx, 'Lame ' + M.de, xl, 50.5, 2.9, '600', dispP.k);

    if (pile.showPoles) {
      var pole = poleElectrode(i), role = roleElectrode(i);
      if (pole) {
        var txt = 'Pôle ' + pole + (role ? ' · ' + role : '');
        ctx.fillStyle = pole === '+' ? 'rgba(210,100,20,1)' : 'rgba(40,80,180,1)';
        texteEchelle(ctx, txt, xl, 54.2, 2.9, '700', dispP.k);
      }
    }

    // Solution : nom et concentration actuelle, sous le bécher
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2c3e50';
    texteEchelle(ctx, _majusculeP(M.nomSolution), P_BECHER_CX[i], P_TABLE_Y + 6.4, 2.9, '600', dispP.k);
    ctx.fillStyle = '#5a6a78';
    texteEchelle(ctx, '[' + ionTexte(M.sym) + '] = ' + formatConcentration(concentration(i)) + ' mol/L',
                 P_BECHER_CX[i], P_TABLE_Y + 10, 2.6, '400', dispP.k);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = pile.pont ? '#2c3e50' : '#9aa6b0';
  texteEchelle(ctx, pile.pont ? 'Pont salin (K⁺ + NO₃⁻)' : 'Pont salin retiré',
               (P_PONT_X[0] + P_PONT_X[1]) / 2, P_PONT_Y - 3.4, 2.6, '600', dispP.k);
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
