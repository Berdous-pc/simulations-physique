// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  pile.js — Onglet Pile et électrolyse : modèle et montage macroscopique
//  Dépend de sim.js (METAUX, ANIONS, utilitaires) et becher.js (_EAU,
//  _degradeMetal, ALPHA_VOILE).
//
//  Trois montages :
//    - deux béchers reliés par un pont salin (K⁺ + NO₃⁻), une demi-pile
//      dans chacun : Mⁿ⁺/M (lame de métal) ou couple gazeux H⁺/H₂, O₂/H₂O
//      (électrode de platine où barbote le gaz) : piles, et leur recharge
//      par un générateur ;
//    - une cuve unique avec deux électrodes (métal, graphite ou platine)
//      dans la même solution : électrolyses ;
//    - la pile à combustible : électrodes de platine alimentées en
//      dihydrogène et en dioxygène, séparées par un électrolyte acide ;
//    - l'accumulateur au plomb : plaque de plomb (−) et plaque de dioxyde
//      de plomb (+) dans l'acide sulfurique ; le sulfate de plomb se forme
//      sur les deux plaques à la décharge et disparaît à la charge.
//  Entre les deux électrodes, le circuit extérieur au choix : rien, un
//  voltmètre, un ampèremètre + une résistance, + une lampe ou + un
//  générateur de tension réglable (avec interrupteur).
//
//  Modèle (Terminale, semi-quantitatif) :
//    - à chaque électrode, les réactions possibles : réduction des cations
//      métalliques, de l'eau (ou des ions H⁺), du dioxygène apporté ;
//      oxydation du métal de surface, de l'eau, des ions chlorure, du
//      dihydrogène apporté. Potentiels par la loi de Nernst (pH compris),
//      en coulisse, jamais affichés. Règle simple : à la cathode, la
//      réduction la plus facile (potentiel le plus haut), à l'anode
//      l'oxydation la plus facile (potentiel le plus bas), en tenant
//      compte des surtensions des couples gazeux, qui dépendent de
//      l'électrode ; exception codée : Cl⁻ s'oxyde avant l'eau ;
//    - le courant est cherché dans les deux sens : f.é.m. du sens
//      considéré moins les surtensions, moins la tension du générateur
//      s'il s'y oppose (plus s'il y pousse), moins une surtension ETA si
//      la transformation est forcée (électrolyse), divisé par la
//      résistance totale ; multiplié par un facteur d'épuisement des
//      réactifs de ce sens. D'où un seuil d'électrolyse, et une pile qui
//      débite contre un générateur trop faible puis se recharge quand U
//      dépasse sa tension ;
//    - quantités : Q = I·Δt = n(e⁻)·F, concentrations, pH, lames et gaz
//      tenus à jour, en temps accéléré (TEMPS_ACCEL).
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
var KE = 1e-14;               // produit ionique de l'eau
var V_MOLAIRE = 24;           // volume molaire des gaz (L/mol)
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
var C_TRACE = 1e-7;           // concentration en dessous de laquelle un ion n'est plus réduit
var C_PLANCHER = 1e-6;        // concentration prise pour un ion absent (loi de Nernst)
var U_PAS = 0.05;             // pas du curseur du générateur (V)

// Couples gazeux (potentiels standard, V)
var E0_O2 = 1.23;             // O₂/H₂O
var E0_CL2 = 1.36;            // Cl₂/Cl⁻
// Au-dessus de cette concentration (mol/L), les ions chlorure s'oxydent
// avant l'eau : exception codée (en réalité, forte surtension de O₂)
var C_CL_PRIORITE = 0.01;

// Accumulateur au plomb : couples PbSO₄/Pb et PbO₂/PbSO₄ (V), matière
// active de chaque plaque (mol), acide sulfurique de l'accumulateur chargé
// (mol/L ; [H⁺] = 2c, [SO₄²⁻] = c)
var E0_PBSO4 = -0.356;
var E0_PBO2 = 1.685;
var N_PLAQUE = 0.05;
var C_ACIDE_PLOMB = 2.0;

// Surtensions des couples gazeux (V) selon la surface de l'électrode :
// platine, graphite, ou un métal (forte pour H₂ : c'est ce qui permet de
// déposer du zinc plutôt que de réduire l'eau)
var ETA_GAZ = {
  H2:    { Pt: 0.05, C: 0.25, metal: 0.50 },   // dégagement de dihydrogène
  O2:    { Pt: 0.30, C: 0.35, PbO2: 0.60, metal: 0.40 },   // dégagement de dioxygène (forte sur PbO₂ : la
                                               // charge de l'accumulateur passe avant)
  Cl2:   { metal: 0.10 },                      // dégagement de dichlore
  H2ox:  { metal: 0.05 },                      // dihydrogène consommé (pile)
  O2red: { metal: 0.30 }                       // dioxygène consommé (pile)
};

// Facteur d'épuisement : x / (x + coude). Négligeable tant que les
// réactifs sont abondants, il fait tomber le courant (et la tension à vide)
// quand l'un d'eux s'épuise (la loi de Nernst seule ne baisse qu'en
// logarithme).
var C_COUDE = 0.0002;         // mol/L, ions réduits à la cathode (ou Cl⁻ oxydés)
var N_COUDE = 0.0002;         // mol, métal oxydable à l'anode

// En dessous de 1 µA (réactif épuisé : reste infime du facteur
// d'épuisement), on considère qu'aucun courant ne circule
var I_MIN = 1e-6;

// Crans des curseurs
var CONCENTRATIONS = [0.01, 0.05, 0.1, 0.5, 1.0];          // mol/L
var RESISTANCES = [10, 22, 47, 100, 220, 470, 1000];       // Ω

// Ions du pont salin (nitrate de potassium : pas de précipité avec Ag⁺)
var K_PONT = { texte: 'K⁺', couleur: '#c98a55' };

// Cations qui ne sont pas ceux d'un métal de METAUX (loupe, migration)
var IONS_SIMPLES = {
  H:  { texte: 'H⁺', couleur: '#e8879a' },
  Na: { texte: 'Na⁺', couleur: '#cf8fc7' },
  K:  K_PONT
};

// ══════════════════════════════════════════════════════════════════════
//  Solutions et demi-piles
//  Solutions : celles des métaux (Mⁿ⁺ + anion usuel, cf. METAUX), et
//  chlorure de sodium, sulfate de sodium, acide sulfurique ([H⁺] = c),
//  électrolyte acide de la pile à combustible. Concentration c réglée par
//  le curseur : celle de Mⁿ⁺, du soluté (NaCl, Na₂SO₄) ou de H⁺.
// ══════════════════════════════════════════════════════════════════════

var SOLUTIONS = {
  NaCl:   { nom: 'chlorure de sodium', court: 'NaCl', spect: 'Na', nSpect: 1, chlorure: true, anion: 'Cl' },
  Na2SO4: { nom: 'sulfate de sodium', court: 'Na₂SO₄', spect: 'Na', nSpect: 2, anion: 'SO4' },
  H2SO4:  { nom: 'acide sulfurique', court: 'H₂SO₄', acide: true, anion: 'SO4' },
  PAC:    { nom: 'électrolyte acide (membrane échangeuse de protons)', acide: true, anion: null },
  PLOMB:  { nom: 'acide sulfurique', court: 'H₂SO₄', sulfurique: true, anion: 'SO4' }   // [H⁺] = 2c, [SO₄²⁻] = c
};
ORDRE_METAUX.forEach(function (sym) {
  var M = METAUX[sym];
  SOLUTIONS[sym] = { nom: M.nomSolution, metal: sym, anion: M.anion };
});
// Solutions proposées dans la cuve d'électrolyse libre
var ORDRE_SOLUTIONS_CUVE = ['Cu', 'Zn', 'Fe', 'Pb', 'Ag', 'Mg', 'NaCl', 'Na2SO4', 'H2SO4'];
// Électrodes proposées dans la cuve : inertes d'abord, puis les métaux
var ORDRE_ELECTRODES = ['C', 'Pt'].concat(ORDRE_METAUX);

// Demi-piles des deux béchers : Mⁿ⁺/M (clé = symbole du métal), ou couple
// gazeux sur électrode de platine, gaz amené par un tube (barbotage), dans
// une solution acide
var DEMI_PILES_GAZ = {
  H2: { nom: 'Dihydrogène', couple: 'H⁺/H₂', electrode: 'Pt', gaz: 'H2', sol: 'H2SO4' },
  O2: { nom: 'Dioxygène', couple: 'O₂/H₂O', electrode: 'Pt', gaz: 'O2', sol: 'H2SO4' }
};
var ORDRE_DEMI_PILES = ORDRE_METAUX.concat(['H2', 'O2']);

function demiPile(cle) {
  return DEMI_PILES_GAZ[cle] || { electrode: cle, gaz: null, sol: cle };
}

// ══════════════════════════════════════════════════════════════════════
//  Expériences prédéfinies
//  bac : 'deux' (défaut), 'un' (cuve unique de la solution `solution`) ou
//  'pac' (pile à combustible). g, d : demi-piles (deux béchers) ou
//  électrodes (cuve) de gauche et de droite ; cg, cd : crans de
//  concentration (indices dans CONCENTRATIONS) ; dipole, iR, iU (cran du
//  générateur), polarite (+1 : borne + du générateur reliée à
//  l'électrode de droite) : circuit imposé par l'expérience.
// ══════════════════════════════════════════════════════════════════════

var EXPERIENCES = {
  'daniell':   { groupe: 'Piles', nom: 'Pile Daniell (zinc – cuivre)', g: 'Zn', d: 'Cu', cg: 2, cd: 2 },
  'cu-ag':     { groupe: 'Piles', nom: 'Pile cuivre – argent', g: 'Cu', d: 'Ag', cg: 2, cd: 2 },
  'fe-cu':     { groupe: 'Piles', nom: 'Pile fer – cuivre', g: 'Fe', d: 'Cu', cg: 2, cd: 2 },
  'zn-pb':     { groupe: 'Piles', nom: 'Pile zinc – plomb', g: 'Zn', d: 'Pb', cg: 2, cd: 2 },
  'conc-cu':   { groupe: 'Piles', nom: 'Pile de concentration (cuivre)', g: 'Cu', d: 'Cu', cg: 0, cd: 4 },
  'h2-cu':     { groupe: 'Piles', nom: 'Pile dihydrogène – cuivre', g: 'H2', d: 'Cu', cg: 4, cd: 2 },
  'pac':       { groupe: 'Piles', nom: 'Pile à combustible (dihydrogène – dioxygène)', bac: 'pac',
                 g: 'H2', d: 'O2', cg: 4, cd: 4, dipole: 'resistance', iR: 3 },
  'plomb-decharge': { groupe: 'Piles', nom: 'Accumulateur au plomb (décharge)', bac: 'plomb', etat: 'charge',
                 g: 'Pb', d: 'PbO2', cg: 4, cd: 4, dipole: 'lampe' },
  'recharge':  { groupe: 'Électrolyses', nom: 'Recharge de la pile Daniell', g: 'Zn', d: 'Cu', cg: 2, cd: 2,
                 dipole: 'generateur', iU: 32, polarite: 1 },
  'affinage':  { groupe: 'Électrolyses', nom: 'Affinage du cuivre (anode soluble)', bac: 'un', solution: 'Cu',
                 g: 'Cu', d: 'Cu', cg: 3, cd: 3, dipole: 'generateur', iU: 10, polarite: -1 },
  'zingage':   { groupe: 'Électrolyses', nom: 'Zingage d’une lame de fer', bac: 'un', solution: 'Zn',
                 g: 'Zn', d: 'Fe', cg: 3, cd: 3, dipole: 'generateur', iU: 20, polarite: -1 },
  'eau':       { groupe: 'Électrolyses', nom: 'Électrolyse de l’eau (sulfate de sodium)', bac: 'un', solution: 'Na2SO4',
                 g: 'C', d: 'C', cg: 3, cd: 3, dipole: 'generateur', iU: 52, polarite: -1 },
  'cuso4':     { groupe: 'Électrolyses', nom: 'Électrolyse du sulfate de cuivre (graphite)', bac: 'un', solution: 'Cu',
                 g: 'C', d: 'C', cg: 3, cd: 3, dipole: 'generateur', iU: 32, polarite: -1 },
  'nacl':      { groupe: 'Électrolyses', nom: 'Électrolyse du chlorure de sodium', bac: 'un', solution: 'NaCl',
                 g: 'C', d: 'C', cg: 4, cd: 4, dipole: 'generateur', iU: 60, polarite: -1 },
  'plomb-charge': { groupe: 'Électrolyses', nom: 'Charge de l’accumulateur au plomb', bac: 'plomb', etat: 'decharge',
                 g: 'Pb', d: 'PbO2', cg: 4, cd: 4, dipole: 'generateur', iU: 54, polarite: 1 },
  'libre':     { groupe: '', nom: 'Montage libre (deux béchers)' },
  'libre-cuve': { groupe: '', nom: 'Électrolyse libre (cuve)', bac: 'un' }
};
var ORDRE_EXPERIENCES = ['daniell', 'cu-ag', 'fe-cu', 'zn-pb', 'conc-cu', 'h2-cu', 'pac', 'plomb-decharge',
                         'recharge', 'affinage', 'zingage', 'eau', 'cuso4', 'nacl', 'plomb-charge',
                         'libre', 'libre-cuve'];

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
var P_LAME_X_PAC = [40, 100];             // axes des électrodes, pile à combustible
var P_PAC = { L: 30, R: 110, haut: 60, ep: 3 };   // boîtier de la pile à combustible, épaisseur des électrodes
var P_LAME_YB = 85;                       // bas des lames
var P_LAME_TOP = P_LAME_YB - P_LAME_H;
var P_FIL_Y = 16;                         // fil horizontal du circuit extérieur
var P_PONT_Y = 46;                        // axe de la partie horizontale du pont
var P_PONT_X = [48, 92];                  // axes des deux branches du pont
var P_PONT_BAS = 77;                      // bas des branches (dans les solutions)
var P_PONT_W = 3.4;                       // diamètre extérieur du tube
var P_PONT_LEVEE = 17;                    // course du pont levé : ses extrémités sortent des solutions
var V_PONT = 1.6;                         // vitesse du pont qu'on lève ou baisse (course par seconde réelle)
var P_Y_LOUPE = 74;                       // hauteur visée par la loupe sur les électrodes
var P_TUBE_ECART = 5.5;                   // tube d'arrivée du gaz, à côté de l'électrode (côté du pont)

// Vitesses des animations du montage (unités de scène par seconde
// d'animation, à I = I_REF ; plus lentes quand I est plus faible)
var V_ELEC_FIL = 9;
var V_ION_MACRO = 2.6;
var ECART_ELECTRONS = 5;                  // espacement des électrons dans les fils
var N_BULLES_S = 16;                      // bulles par seconde à I_REF, pour un gaz à 2 e⁻ par molécule

// ══════════════════════════════════════════════════════════════════════
//  État
// ══════════════════════════════════════════════════════════════════════

var pile = {
  experience: 'daniell',
  bac: 'deux',               // 'deux' : deux béchers + pont salin ; 'un' : cuve unique ; 'pac' : pile à combustible ;
                             // 'plomb' : accumulateur au plomb
  plombEtat: 'charge',       // accumulateur au départ : 'charge' ou 'decharge'
  metaux: ['Zn', 'Cu'],      // demi-piles (deux béchers) ou électrodes (cuve) de gauche et de droite
  solution: 'Cu',            // cuve unique : clé de SOLUTIONS
  iC0: [2, 2],               // crans des concentrations initiales
  dipole: 'voltmetre',       // 'aucun' | 'voltmetre' | 'resistance' | 'lampe' | 'generateur'
  interrupteur: false,       // fermé ?
  iR: 3,                     // cran de la résistance (100 Ω)
  iU: 30,                    // cran du générateur (× U_PAS : 1,50 V)
  polarite: 1,               // +1 : borne + du générateur reliée à l'électrode de droite
  pont: true,                // pont salin en contact avec les deux solutions (deux béchers)
  pontBaisse: true,          // position demandée : pont baissé dans les solutions, ou levé
  levee: 0,                  // position du pont : 0 dans les solutions, 1 levé
  zone: 'gauche',            // zone vue dans la loupe : 'gauche' | 'droite' | 'pont' | 'fil'

  showCourant:   false,      // sens du courant et électrons dans les fils
  showMigration: false,      // ions qui migrent dans les solutions et le pont
  showPoles:     false,      // pôles, anode et cathode
  showEquations: false,

  // ── Grandeurs ──
  comp: [],                  // compartiments : { n: {sym: mol} (cations métalliques), h, cl, spect, nSpect, anion, nom, sym0, sol }
  lames: [],                 // { sym (métal, C ou Pt), reste (mol de métal), depots: [{sym, n}] (dernier = surface), gaz (amené),
                             //   plomb (accumulateur : { n matière active Pb ou PbO₂, s PbSO₄ } en mol) }
  gaz: [],                   // par électrode : { H2, O2, Cl2 } (mol), > 0 dégagé, < 0 consommé
  t: 0,                      // durée de fonctionnement (s, temps accéléré)
  Q: 0,                      // quantité d'électricité (C)
  E: 0,                      // tension à vide V(droite) − V(gauche) (V)
  I: 0,                      // intensité (A), signée

  // ── Animations ──
  horloge: 0,                // temps d'animation (s)
  phaseE: 0,                 // décalage des électrons le long des fils
  particules: null,          // ions du montage (option migration)
  bulles: [],                // bulles de gaz qui montent dans les solutions
  accBulles: [0, 0, 0, 0],   // bulles en attente (dégagement à chaque électrode, barbotage à chaque tube)
  bruitDepot: null,          // contour irrégulier des dépôts
  survol: null               // zone, interrupteur ou tube du pont sous la souris
};

// ══════════════════════════════════════════════════════════════════════
//  Géométrie selon le montage
// ══════════════════════════════════════════════════════════════════════

function deuxBechers() { return pile.bac === 'deux'; }
function enCuve() { return pile.bac === 'un'; }
function enPac() { return pile.bac === 'pac'; }
function enPlomb() { return pile.bac === 'plomb'; }
// Cuve sans pont salin ni membrane (électrolyses, accumulateur)
function sansPont() { return enCuve() || enPlomb(); }
function lameX(i) { return deuxBechers() ? P_LAME_X_DEUX[i] : enPac() ? P_LAME_X_PAC[i] : P_LAME_X_UN[i]; }
function compElectrode(i) { return deuxBechers() ? i : 0; }
function pontPresent() { return deuxBechers() && pile.pont; }

// Récipients : bords intérieurs gauche et droit, côté du bec verseur. Pile
// à combustible : l'électrolyte, entre les deux électrodes.
function recipients() {
  if (enPac()) return [{ L: P_LAME_X_PAC[0] + P_PAC.ep / 2, R: P_LAME_X_PAC[1] - P_PAC.ep / 2, bec: 0 }];
  return deuxBechers() ? [{ L: 23, R: 53, bec: -1 }, { L: 87, R: 117, bec: 1 }]
                       : [{ L: 34, R: 106, bec: 0 }];
}

// Tube d'arrivée du gaz d'une demi-pile gazeuse (deux béchers) : à côté
// de l'électrode, du côté du pont (les étiquettes sont de l'autre côté)
function tubeGazX(i) { return lameX(i) + (i === 0 ? 1 : -1) * P_TUBE_ECART; }

// ══════════════════════════════════════════════════════════════════════
//  Grandeurs chimiques
// ══════════════════════════════════════════════════════════════════════

function concInitiale(i) { return CONCENTRATIONS[pile.iC0[i]]; }

// Concentration d'un cation métallique dans un compartiment (mol/L)
function concentrationC(c, sym) { return Math.max(0, pile.comp[c].n[sym] || 0) / P_VOLUME; }

// Somme des concentrations des cations métalliques d'un compartiment
function cationsTotal(c) {
  var s = 0, n = pile.comp[c].n;
  for (var sym in n) s += Math.max(0, n[sym]);
  return s / P_VOLUME;
}

// Ions H⁺ : comp.h = n(H⁺) − n(HO⁻) apportés (acide, électrolyses) ; la
// concentration tient compte de l'autoprotolyse de l'eau (pH 7 sans apport)
function concH(c) {
  var x = pile.comp[c].h / P_VOLUME;
  return (x + Math.sqrt(x * x + 4 * KE)) / 2;
}
function pH(c) { return -Math.log(concH(c)) / Math.LN10; }
function concOH(c) { return KE / concH(c); }
function concCl(c) { return Math.max(0, pile.comp[c].cl) / P_VOLUME; }
// Ions sulfate de l'accumulateur (concentration de l'acide sulfurique)
function concSO4(c) { return Math.max(0, pile.comp[c].so4 || 0) / P_VOLUME; }

// ── Accumulateur au plomb ─────────────────────────────────────────────
// Plaque négative (gauche) : PbSO₄ + 2 e⁻ = Pb + SO₄²⁻ ;
// plaque positive (droite) : PbO₂ + 4 H⁺ + SO₄²⁻ + 2 e⁻ = PbSO₄ + 2 H₂O
function plaquePositive(i) { return pile.lames[i].sym === 'PbO2'; }
function potentielPlaque(i) {
  var c = compElectrode(i), s = Math.max(concSO4(c), C_PLANCHER), h = concH(c);
  var lg = function (x) { return Math.log(x) / Math.LN10; };
  return plaquePositive(i) ? E0_PBO2 + PENTE_NERNST / 2 * lg(Math.pow(h, 4) * s)
                           : E0_PBSO4 - PENTE_NERNST / 2 * lg(s);
}
// Facteurs d'épuisement : matière active (décharge), sulfate de plomb
// (charge), acide (décharge)
// (en dessous de N_TRACE_PLAQUE, le solide est épuisé : en fin de charge,
// c'est alors l'eau qui est électrolysée)
var N_TRACE_PLAQUE = 1e-5;
function _fPlaque(n) { return n > N_TRACE_PLAQUE ? n / (n + N_COUDE) : 0; }
function _fAcide(c) { var s = concSO4(c); return s / (s + C_COUDE); }
// État de charge (0 à 1) : part de matière active sur les deux plaques
function etatCharge() {
  var e = 0;
  for (var i = 0; i < 2; i++) { var P = pile.lames[i].plomb; e += P.n / (P.n + P.s) / 2; }
  return e;
}

function estInerte(sym) { return !!METAUX[sym].inerte; }

// Matériau à la surface d'une électrode : dernière couche de dépôt, sinon
// la lame (métal, graphite ou platine)
function surfaceLame(i) {
  var d = pile.lames[i].depots;
  return d.length ? d[d.length - 1].sym : pile.lames[i].sym;
}

// Métal oxydable d'une électrode (dépôts + partie immergée d'une lame de métal)
function oxydable(i) {
  var L = pile.lames[i], s = estInerte(L.sym) ? 0 : L.reste;
  for (var k = 0; k < L.depots.length; k++) s += L.depots[k].n;
  return s;
}
function depotTotal(i) {
  var L = pile.lames[i], s = 0;
  for (var k = 0; k < L.depots.length; k++) s += L.depots[k].n;
  return s;
}
// Une lame de métal entièrement dissoute ne plonge plus dans la solution
function electrodePresente(i) { return estInerte(pile.lames[i].sym) || oxydable(i) > 0; }

function potentielCouple(sym, c) {
  var M = METAUX[sym];
  return M.E0 + PENTE_NERNST / M.charge * Math.log(Math.max(c, C_PLANCHER)) / Math.LN10;
}

function _eta(type, i) {
  var t = ETA_GAZ[type], s = surfaceLame(i);
  return t[s] !== undefined ? t[s] : t.metal;
}

// ── Réactions possibles à chaque électrode ────────────────────────────
// Objet réaction : { type ('metal', 'H2', 'O2red' réductions ; 'metal',
// 'O2', 'Cl2', 'H2ox' oxydations), ox (oxydation ?), sym (métal), z
// (électrons par entité), E (potentiel du couple), eta (surtension),
// f (facteur d'épuisement du réactif) }

function reductionsPossibles(i) {
  var c = compElectrode(i), C = pile.comp[c], liste = [];
  if (enPlomb()) return _reactionsPlaque(i, false);
  if (!electrodePresente(i)) return liste;
  for (var sym in C.n) {
    var conc = concentrationC(c, sym);
    if (conc < C_TRACE) continue;
    liste.push({ type: 'metal', ox: false, sym: sym, z: METAUX[sym].charge, E: potentielCouple(sym, conc),
                 eta: 0, f: conc / (conc + C_COUDE) });
  }
  var ph = pH(c);
  if (pile.lames[i].gaz === 'O2') {
    liste.push({ type: 'O2red', ox: false, z: 4, E: E0_O2 - PENTE_NERNST * ph, eta: _eta('O2red', i), f: 1 });
  }
  // L'eau (ou les ions H⁺ d'une solution acide) : toujours présente
  liste.push({ type: 'H2', ox: false, z: 2, E: -PENTE_NERNST * ph, eta: _eta('H2', i), f: 1 });
  return liste;
}

// Plaques de l'accumulateur : leur couple (dans le sens de la décharge ou
// de la charge, tant qu'il reste le réactif solide), et l'eau, qui
// s'électrolyse en fin de charge
function _reactionsPlaque(i, ox) {
  var c = compElectrode(i), P = pile.lames[i].plomb, pos = plaquePositive(i), liste = [], ph = pH(c);
  var E = potentielPlaque(i), type = pos ? 'PbO2' : 'PbSO4';
  // Décharge : la matière active réagit (oxydation à la plaque −, réduction à la plaque +)
  var decharge = ox !== pos;
  var n = decharge ? P.n : P.s;
  if (n > N_TRACE_PLAQUE) {
    liste.push({ type: type, ox: ox, z: 2, E: E, eta: 0, f: _fPlaque(n) * (decharge ? _fAcide(c) : 1) });
  }
  if (ox) liste.push({ type: 'O2', ox: true, z: 4, E: E0_O2 - PENTE_NERNST * ph, eta: _eta('O2', i), f: 1 });
  else liste.push({ type: 'H2', ox: false, z: 2, E: -PENTE_NERNST * ph, eta: _eta('H2', i), f: 1 });
  return liste;
}

function oxydationsPossibles(i) {
  var c = compElectrode(i), liste = [];
  if (enPlomb()) return _reactionsPlaque(i, true);
  if (!electrodePresente(i)) return liste;
  var s = surfaceLame(i), ph = pH(c), cl = concCl(c);
  if (!estInerte(s)) {
    var n = oxydable(i);
    liste.push({ type: 'metal', ox: true, sym: s, z: METAUX[s].charge, E: potentielCouple(s, concentrationC(c, s)),
                 eta: 0, f: n / (n + N_COUDE) });
  }
  if (pile.lames[i].gaz === 'H2') {
    liste.push({ type: 'H2ox', ox: true, z: 2, E: -PENTE_NERNST * ph, eta: _eta('H2ox', i), f: 1 });
  }
  if (cl > C_TRACE) {
    liste.push({ type: 'Cl2', ox: true, z: 2, E: E0_CL2 - PENTE_NERNST * Math.log(cl) / Math.LN10,
                 eta: _eta('Cl2', i), f: cl / (cl + C_COUDE) });
  }
  // Exception codée : tant qu'il reste assez d'ions chlorure, ce sont eux
  // qui s'oxydent, et non l'eau
  if (cl < C_CL_PRIORITE) {
    liste.push({ type: 'O2', ox: true, z: 4, E: E0_O2 - PENTE_NERNST * ph, eta: _eta('O2', i), f: 1 });
  }
  return liste;
}

// Réduction la plus facile (potentiel, moins la surtension, le plus haut)
function reductionChoisie(i) {
  var l = reductionsPossibles(i), b = null;
  for (var k = 0; k < l.length; k++) if (!b || l[k].E - l[k].eta > b.E - b.eta) b = l[k];
  return b;
}
// Oxydation la plus facile (potentiel, plus la surtension, le plus bas)
function oxydationChoisie(i) {
  var l = oxydationsPossibles(i), b = null;
  for (var k = 0; k < l.length; k++) if (!b || l[k].E + l[k].eta < b.E + b.eta) b = l[k];
  return b;
}

// Cation métallique réduit sur l'électrode i (null : ce n'est pas un métal)
function cationReduit(i) {
  var r = reductionChoisie(i);
  return r && r.type === 'metal' ? r.sym : null;
}

// Sens où l'électrode iA est l'anode (l'autre la cathode) : réactions,
// f.é.m. (positive si ce sens est spontané), f.é.m. diminuée des
// surtensions, facteur d'épuisement. null si une électrode manque.
function _sens(iA) {
  var ox = oxydationChoisie(iA), red = reductionChoisie(1 - iA);
  if (!ox || !red) return null;
  return { ox: ox, red: red, fem: red.E - ox.E, eff: red.E - red.eta - ox.E - ox.eta, f: ox.f * red.f };
}
function femSens(iA) { var s = _sens(iA); return s ? s.fem : -Infinity; }

// ── Tension à vide ────────────────────────────────────────────────────
// Potentiel d'une électrode à l'abandon : couple du métal de surface, ou
// couple du gaz qui y est amené. Électrode inerte sans gaz : non défini.
function potentielAVide(i) {
  var c = compElectrode(i), s = surfaceLame(i), g = pile.lames[i].gaz;
  if (!estInerte(s)) return potentielCouple(s, concentrationC(c, s));
  if (g === 'H2') return -PENTE_NERNST * pH(c);
  if (g === 'O2') return E0_O2 - PENTE_NERNST * pH(c);
  return null;
}

// Facteur d'épuisement de la pile qui débiterait avec iA pour anode
// (cations réductibles de la cathode, métal oxydable de l'anode ; un gaz
// amené ne s'épuise pas)
function _facteurVide(iA) {
  var iC = 1 - iA, n = oxydable(iA), c = cationsTotal(compElectrode(iC));
  var fa = pile.lames[iA].gaz ? 1 : n / (n + N_COUDE);
  var fc = pile.lames[iC].gaz ? 1 : c / (c + C_COUDE);
  return fa * fc;
}

// Tension à vide (voltmètre) : V(droite) − V(gauche), avec le facteur
// d'épuisement du sens spontané (pile usée : 0) ; nulle si une électrode
// inerte n'est le siège d'aucun couple
function femPile() {
  if (enPlomb()) {
    // Plaque + à droite : la tension est positive tant qu'il reste de la
    // matière active et de l'acide
    var P0 = pile.lames[0].plomb, P1 = pile.lames[1].plomb;
    return (potentielPlaque(1) - potentielPlaque(0)) * _fPlaque(P0.n) * _fPlaque(P1.n) * _fAcide(0);
  }
  var V0 = potentielAVide(0), V1 = potentielAVide(1);
  if (V0 === null || V1 === null) return 0;
  var V = V1 - V0;
  return V * _facteurVide(V >= 0 ? 0 : 1);
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
function circuitFerme() { return courantPossible() && pile.interrupteur && (!deuxBechers() || pile.pont); }

// Tension que le générateur oppose au sens I > 0 (gauche anode)
function _tensionOpposee() {
  return pile.dipole === 'generateur' ? pile.polarite * tensionGenerateur() : 0;
}

// Pilote du courant dans le sens s (V), avant division par la résistance
function _pilote(iA, s) {
  var u = iA === 0 ? -_tensionOpposee() : _tensionOpposee();
  return s.eff + u - (s.fem < E_FORCE ? ETA : 0);
}

function courantPile() {
  if (!circuitFerme()) return 0;
  var Rt = R_INTERNE + resistanceCharge();
  var s0 = _sens(0), s1 = _sens(1);
  var Jp = s0 ? s0.f * _pilote(0, s0) / Rt : 0;     // gauche anode
  var Jm = s1 ? s1.f * _pilote(1, s1) / Rt : 0;     // droite anode
  var I = 0;
  if (Jp > 0 && Jp >= Jm) I = Jp;
  else if (Jm > 0) I = -Jm;
  return Math.abs(I) < I_MIN ? 0 : I;
}

// Tension lue par le voltmètre (borne V à droite, COM à gauche). Sans pont
// salin, le circuit est ouvert dans les solutions : rien à mesurer.
function tensionVoltmetre() { return (!deuxBechers() || pile.pont) ? femPile() : 0; }

// Le sens du courant actuel est-il forcé (électrolyse) ?
function sensForce() {
  if (pile.I === 0) return false;
  var s = _sens(pile.I > 0 ? 0 : 1);
  return !s || s.fem < E_FORCE;
}

// Tension minimale du générateur pour forcer la transformation dans le
// sens où il pousse ; null s'il pousse dans le sens spontané
function seuilElectrolyse() {
  var s = _sens(pile.polarite > 0 ? 1 : 0);    // électrode reliée à la borne + : anode
  if (!s || s.fem >= E_FORCE) return null;
  return ETA - s.eff;
}

// Rôle d'une électrode : 'anode' (oxydation), 'cathode' (réduction) ou ''
// quand aucun courant ne circule
function roleElectrode(i) {
  if (pile.I === 0) return '';
  return (pile.I > 0) === (i === 0) ? 'anode' : 'cathode';
}

// Réaction qui a lieu sur l'électrode i (null sans courant)
function reactionEnCours(i) {
  var r = roleElectrode(i);
  return r === 'anode' ? oxydationChoisie(i) : r === 'cathode' ? reductionChoisie(i) : null;
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
//  Demi-équations (texte du canvas, HTML du panneau)
//  Espèces : clés de ESPECES, ou 'M:Zn' (métal) et 'I:Zn' (ion métallique)
// ══════════════════════════════════════════════════════════════════════

var ESPECES = {
  'H+':  { txt: 'H⁺',  html: 'H<sup>+</sup>',  etat: 'aq' },
  'HO-': { txt: 'HO⁻', html: 'HO<sup>−</sup>', etat: 'aq' },
  'H2O': { txt: 'H₂O', html: 'H<sub>2</sub>O', etat: 'l' },
  'H2':  { txt: 'H₂',  html: 'H<sub>2</sub>',  etat: 'g' },
  'O2':  { txt: 'O₂',  html: 'O<sub>2</sub>',  etat: 'g' },
  'Cl2': { txt: 'Cl₂', html: 'Cl<sub>2</sub>', etat: 'g' },
  'Cl-': { txt: 'Cl⁻', html: 'Cl<sup>−</sup>', etat: 'aq' },
  'SO42-': { txt: 'SO₄²⁻', html: 'SO<sub>4</sub><sup>2−</sup>', etat: 'aq' }
};

// 'M:' : solide (métal, PbO₂, PbSO₄) ; 'I:' : ion métallique
function espece(cle) {
  if (cle.charAt(1) === ':') {
    var sym = cle.slice(2), M = METAUX[sym];
    return cle.charAt(0) === 'M' ? { txt: M.formule || sym, html: M.formuleHTML || sym, etat: 's' }
                                 : { txt: ionTexte(sym), html: ionHTML(sym), etat: 'aq' };
  }
  return ESPECES[cle];
}

// Demi-équation de la réaction r dans le compartiment c, dans le sens où
// elle a lieu : { gauche: [[coef, espèce]], droite: [...], n }. Électrons
// à droite pour une oxydation, à gauche pour une réduction. Eau : écrite
// avec H⁺ en solution acide, avec HO⁻ en solution basique.
function demiEquation(r, c) {
  var ph = pH(c);
  switch (r.type) {
    case 'metal':
      return r.ox ? { gauche: [[1, 'M:' + r.sym]], droite: [[1, 'I:' + r.sym]], n: r.z }
                  : { gauche: [[1, 'I:' + r.sym]], droite: [[1, 'M:' + r.sym]], n: r.z };
    case 'H2':
      return ph < 6.5 ? { gauche: [[2, 'H+']], droite: [[1, 'H2']], n: 2 }
                      : { gauche: [[2, 'H2O']], droite: [[1, 'H2'], [2, 'HO-']], n: 2 };
    case 'O2':
      return ph > 7.5 ? { gauche: [[4, 'HO-']], droite: [[1, 'O2'], [2, 'H2O']], n: 4 }
                      : { gauche: [[2, 'H2O']], droite: [[1, 'O2'], [4, 'H+']], n: 4 };
    case 'Cl2':   return { gauche: [[2, 'Cl-']], droite: [[1, 'Cl2']], n: 2 };
    case 'H2ox':  return { gauche: [[1, 'H2']], droite: [[2, 'H+']], n: 2 };
    case 'O2red': return { gauche: [[1, 'O2'], [4, 'H+']], droite: [[2, 'H2O']], n: 4 };
    case 'PbSO4':
      return r.ox ? { gauche: [[1, 'M:Pb'], [1, 'SO42-']], droite: [[1, 'M:PbSO4']], n: 2 }
                  : { gauche: [[1, 'M:PbSO4']], droite: [[1, 'M:Pb'], [1, 'SO42-']], n: 2 };
    case 'PbO2':
      return r.ox ? { gauche: [[1, 'M:PbSO4'], [2, 'H2O']], droite: [[1, 'M:PbO2'], [4, 'H+'], [1, 'SO42-']], n: 2 }
                  : { gauche: [[1, 'M:PbO2'], [4, 'H+'], [1, 'SO42-']], droite: [[1, 'M:PbSO4'], [2, 'H2O']], n: 2 };
  }
  return null;
}

// Demi-équation en texte (loupe) : « 2 H₂O → O₂ + 4 H⁺ + 4 e⁻ »
function texteDemiEquation(r, c) {
  var d = demiEquation(r, c);
  var membre = function (l) {
    return l.map(function (p) { return (p[0] > 1 ? p[0] + ' ' : '') + espece(p[1]).txt; }).join(' + ');
  };
  var e = (d.n > 1 ? d.n + ' ' : '') + 'e⁻';
  return r.ox ? membre(d.gauche) + ' → ' + membre(d.droite) + ' + ' + e
              : membre(d.gauche) + ' + ' + e + ' → ' + membre(d.droite);
}

// Gaz dégagé par une réaction (null s'il n'y en a pas)
function gazDegage(r) {
  return !r ? null : r.type === 'H2' ? 'H2' : r.type === 'O2' ? 'O2' : r.type === 'Cl2' ? 'Cl2' : null;
}

// ══════════════════════════════════════════════════════════════════════
//  RAZ
// ══════════════════════════════════════════════════════════════════════

// Compartiment rempli de la solution `cle` à la concentration c
function _nouveauCompartiment(cle, c) {
  var S = SOLUTIONS[cle];
  var C = { n: {}, h: 0, cl: 0, spect: S.spect || null, nSpect: 0, anion: S.anion,
            nom: S.nom, sym0: S.metal || null, sol: cle };
  if (S.metal) C.n[S.metal] = c * P_VOLUME;
  if (S.spect) C.nSpect = S.nSpect * c * P_VOLUME;
  if (S.chlorure) C.cl = c * P_VOLUME;
  if (S.acide) C.h = c * P_VOLUME;
  if (S.sulfurique) { C.h = 2 * c * P_VOLUME; C.so4 = c * P_VOLUME; }
  return C;
}

function resetPileModele() {
  var i, elec = [], gaz = [null, null];
  pile.comp = [];
  if (deuxBechers()) {
    for (i = 0; i < 2; i++) {
      var D = demiPile(pile.metaux[i]);
      pile.comp.push(_nouveauCompartiment(D.sol, concInitiale(i)));
      elec.push(D.electrode);
      gaz[i] = D.gaz;
    }
  } else if (enPac()) {
    pile.comp.push(_nouveauCompartiment('PAC', 1.0));
    elec = ['Pt', 'Pt'];
    gaz = ['H2', 'O2'];
  } else if (enPlomb()) {
    // Chargé : matière active seule, acide concentré. Déchargé à 90 % : le
    // sulfate de plomb couvre les plaques, l'acide s'est dilué (2 SO₄²⁻
    // et 4 H⁺ consommés pour 2 électrons)
    var x = pile.plombEtat === 'charge' ? 0 : 0.9 * N_PLAQUE;
    var C = _nouveauCompartiment('PLOMB', C_ACIDE_PLOMB);
    C.so4 -= 2 * x;
    C.h -= 4 * x;
    pile.comp.push(C);
    elec = ['Pb', 'PbO2'];
  } else {
    pile.comp.push(_nouveauCompartiment(pile.solution, concInitiale(0)));
    elec = pile.metaux.slice();
  }
  pile.lames = [];
  pile.gaz = [];
  for (i = 0; i < 2; i++) {
    pile.lames.push({ sym: elec[i], reste: N_LAME, depots: [], gaz: gaz[i],
                      plomb: enPlomb() ? { n: N_PLAQUE - x, s: x } : null });
    pile.gaz.push({ H2: 0, O2: 0, Cl2: 0 });
  }
  pile.t = 0;
  pile.Q = 0;
  pile.horloge = 0;
  pile.phaseE = 0;
  pile.bulles = [];
  pile.accBulles = [0, 0, 0, 0];
  pile.E = femPile();
  pile.I = courantPile();
  _tirerParticules();
  _tirerBruitDepot();
}

// Ion représentatif d'un compartiment (option migration) : couleurs du
// cation et de l'anion de la solution (pas d'anion mobile dans la membrane)
function _couleursIons(C) {
  var cat = C.sym0 ? METAUX[C.sym0].ion : C.spect ? IONS_SIMPLES[C.spect].couleur : IONS_SIMPLES.H.couleur;
  return { cation: couleurRGB(cat), anion: C.anion ? couleurRGB(ANIONS[C.anion].couleur) : null };
}

// Ions du montage (option migration) : quelques ions par compartiment,
// répartis dans la solution, et des ions K⁺ / NO₃⁻ le long du pont salin
function _tirerParticules() {
  var alea = creerAlea(20261027);
  var R = recipients(), comps = [];
  for (var c = 0; c < R.length; c++) {
    var coul = _couleursIons(pile.comp[c]), liste = [];
    var nb = deuxBechers() ? 14 : 24;
    for (var k = 0; k < nb; k++) {
      var cation = k % 2 === 0 || !coul.anion;
      liste.push({
        x: R[c].L + 1.6 + alea() * (R[c].R - R[c].L - 3.2),
        y: P_SOL_TOP + 3 + alea() * (P_TABLE_Y - P_SOL_TOP - 5.5),
        signe: cation ? 1 : -1,
        rgb: cation ? coul.cation : coul.anion,
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
// ni le cation réduit à la cathode (on passe ensuite au suivant) ; les
// réactions qui changent le pH avancent par petits pas.
function _integrerPile(dt) {
  var pas = 0;
  while (dt > 1e-9 && pas < 500) {
    pas++;
    var I = courantPile();
    if (Math.abs(I) < 1e-9) break;
    var iA = I > 0 ? 0 : 1, iC = 1 - iA;
    var s = _sens(iA);
    if (!s) break;
    var ne = Math.abs(I) * dt / FARADAY;       // électrons échangés (mol)
    ne = Math.min(ne, _pasMax(iA, s.ox), _pasMax(iC, s.red));
    if (!(ne > 0)) break;
    var h = ne * FARADAY / Math.abs(I);
    _appliquer(iA, s.ox, ne);
    _appliquer(iC, s.red, ne);
    _nettoyer(pile.lames[iA]);
    pile.t += h;
    pile.Q += ne * FARADAY;
    dt -= h;
  }
  if (circuitFerme()) pile.t += Math.max(0, dt);
}

// Électrons (mol) au plus échangés en un pas par la réaction r sur
// l'électrode i
function _pasMax(i, r) {
  var c = compElectrode(i), C = pile.comp[c], L = pile.lames[i];
  if (r.type === 'metal' && r.ox) {
    var couche = L.depots.length ? L.depots[L.depots.length - 1].n : L.reste;
    return Math.min(0.05 * oxydable(i), couche) * r.z;
  }
  if (r.type === 'metal') return Math.min(0.05 * cationsTotal(c) * P_VOLUME, C.n[r.sym]) * r.z;
  if (r.type === 'Cl2') return 0.05 * C.cl;
  if (r.type === 'PbSO4' || r.type === 'PbO2') {
    // Décharge : matière active et acide ; charge : sulfate de plomb
    var P = L.plomb, dech = r.ox !== (r.type === 'PbO2');
    return 0.05 * 2 * (dech ? Math.min(P.n, C.so4) : P.s) + 1e-9;
  }
  return Math.max(0.1 * Math.abs(C.h), 2e-6);     // H⁺ ou HO⁻ produits ou consommés
}

// Effet de ne mol d'électrons échangés par la réaction r sur l'électrode i
function _appliquer(i, r, ne) {
  var C = pile.comp[compElectrode(i)], L = pile.lames[i], G = pile.gaz[i];
  switch (r.type) {
    case 'metal':
      if (r.ox) {
        // Couche de surface → ions dans le compartiment
        if (L.depots.length) L.depots[L.depots.length - 1].n -= ne / r.z;
        else L.reste -= ne / r.z;
        C.n[r.sym] = (C.n[r.sym] || 0) + ne / r.z;
      } else {
        // Cation → nouvelle couche (ou couche de surface du même métal)
        C.n[r.sym] -= ne / r.z;
        if (C.n[r.sym] < 1e-14) C.n[r.sym] = 0;
        var top = L.depots[L.depots.length - 1];
        if (top && top.sym === r.sym) top.n += ne / r.z;
        else L.depots.push({ sym: r.sym, n: ne / r.z });
      }
      break;
    case 'H2':    C.h -= ne; G.H2 += ne / 2; break;     // 2 H⁺ (ou 2 H₂O) + 2 e⁻ → H₂ (+ 2 HO⁻)
    case 'O2red': C.h -= ne; G.O2 -= ne / 4; break;     // O₂ + 4 H⁺ + 4 e⁻ → 2 H₂O
    case 'O2':    C.h += ne; G.O2 += ne / 4; break;     // 2 H₂O → O₂ + 4 H⁺ + 4 e⁻
    case 'Cl2':   C.cl -= ne; G.Cl2 += ne / 2; break;   // 2 Cl⁻ → Cl₂ + 2 e⁻
    case 'H2ox':  C.h += ne; G.H2 -= ne / 2; break;     // H₂ → 2 H⁺ + 2 e⁻
    case 'PbSO4':                                       // Pb + SO₄²⁻ ⇄ PbSO₄ + 2 e⁻
    case 'PbO2': {                                      // PbO₂ + 4 H⁺ + SO₄²⁻ + 2 e⁻ ⇄ PbSO₄ + 2 H₂O
      var P = L.plomb, k = ne / 2, dech = r.ox !== (r.type === 'PbO2') ? 1 : -1;
      k = dech > 0 ? Math.min(k, P.n) : Math.min(k, P.s);
      P.n -= dech * k; P.s += dech * k;
      C.so4 -= dech * k;
      if (r.type === 'PbO2') C.h -= dech * 4 * k;
      break;
    }
  }
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
  _majBulles(dtSim, f);
}

// Bulles : dégagement gazeux le long des électrodes (deux fois plus de
// bulles de H₂ que de O₂ pour un même courant), et barbotage continu du
// gaz amené par un tube (demi-piles gazeuses)
function _majBulles(dt, f) {
  var i, k, B = pile.bulles;
  for (i = 0; i < 2; i++) {
    var g = gazDegage(reactionEnCours(i));
    if (g && !enPac()) {
      var parE = g === 'O2' ? 0.5 : 1;             // O₂ : 4 e⁻ par molécule
      pile.accBulles[i] += N_BULLES_S * f * parE * dt;
      while (pile.accBulles[i] >= 1) {
        pile.accBulles[i] -= 1;
        var cote = Math.random() < 0.5 ? -1 : 1;
        B.push({ x: lameX(i) + cote * (P_LAME_W / 2 + 0.3 + Math.random() * 0.6),
                 y: P_SOL_TOP + 5 + Math.random() * (P_LAME_YB - P_SOL_TOP - 6),
                 r: 0.35 + Math.random() * 0.35, vy: 6 + Math.random() * 4, gaz: g, phi: Math.random() * 6.28 });
      }
    }
    if (pile.lames[i].gaz && deuxBechers()) {
      pile.accBulles[2 + i] += 5 * dt;
      while (pile.accBulles[2 + i] >= 1) {
        pile.accBulles[2 + i] -= 1;
        B.push({ x: tubeGazX(i) + (Math.random() - 0.5) * 0.8, y: P_LAME_YB - 1,
                 r: 0.5 + Math.random() * 0.4, vy: 7 + Math.random() * 3, gaz: pile.lames[i].gaz, phi: Math.random() * 6.28 });
      }
    }
  }
  for (k = B.length - 1; k >= 0; k--) {
    B[k].y -= B[k].vy * dt;
    if (B[k].y < P_SOL_TOP + B[k].r) B.splice(k, 1);
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

// Coin haut gauche du montage laissé libre pour la carte « Circuit » (px
// CSS, depuis le coin du canvas) : à gauche du fil de l'électrode de
// gauche, au-dessus des étiquettes des électrodes (y = 47 environ)
function coinLibrePile() {
  return { w: dispP.mx + (lameX(0) - 3.5) * dispP.k, h: dispP.my + 46 * dispP.k };
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
// (pile à combustible : la zone « pont » est la membrane)
function zonesLoupe() {
  var w = enPac() ? P_PAC.ep : P_LAME_W;
  var Z = {
    gauche: { x: lameX(0) + w / 2, y: P_Y_LOUPE },
    droite: { x: lameX(1) - w / 2, y: P_Y_LOUPE },
    fil:    { x: lameX(0) + 3.6, y: P_FIL_Y }
  };
  if (deuxBechers()) Z.pont = { x: (P_PONT_X[0] + P_PONT_X[1]) / 2, y: P_PONT_Y };
  if (enPac()) Z.pont = { x: (lameX(0) + lameX(1)) / 2, y: P_Y_LOUPE };
  return Z;
}

// La zone est-elle visible (pont salin sorti des solutions : plus de zone du pont)
function zoneDisponible(nom) { return nom !== 'pont' || enPac() || pontPresent(); }
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

  if (enPac()) {
    _dessinerPac(ctx);
  } else {
    _dessinerRecipients(ctx);
  }

  _dessinerCircuit(ctx);
  if (pile.showCourant) _dessinerCourant(ctx);
  _dessinerEtiquettesP(ctx);
  _dessinerZones(ctx);

  ctx.restore();
}

// Béchers ou cuve : solutions (couleur pleine + modelé), ions qui migrent,
// tubes d'arrivée des gaz, lames, bulles, pont, puis voile de la solution
// devant ce qui est immergé, puis le verre
function _dessinerRecipients(ctx) {
  var R = recipients(), c, i, cols = [];
  for (c = 0; c < R.length; c++) cols.push(_couleurCompartiment(c));
  for (c = 0; c < R.length; c++) {
    _cheminInterieurP(ctx, R[c], P_SOL_TOP);
    ctx.fillStyle = rgbCss(cols[c]);
    ctx.fill();
    _dessinerVolumeP(ctx, R[c]);
  }
  if (pile.showMigration) _dessinerIonsComps(ctx);
  for (i = 0; i < 2; i++) if (pile.lames[i].gaz) _dessinerTubeGaz(ctx, i);
  for (i = 0; i < 2; i++) _dessinerLameP(ctx, i);
  _dessinerBulles(ctx);
  if (deuxBechers()) _dessinerPont(ctx);
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
  if (deuxBechers() && pile.showMigration) _dessinerIonsPont(ctx);
}

// ── Pile à combustible ────────────────────────────────────────────────
// Boîtier gris : à gauche la chambre du dihydrogène, à droite celle du
// dioxygène, chacune fermée par une électrode de platine poreuse ; entre
// les deux, l'électrolyte acide (membrane échangeuse de protons). Le
// dihydrogène et le dioxygène arrivent en continu, l'eau formée s'écoule.
var COUL_MEMBRANE = [238, 226, 170];

function _dessinerPac(ctx) {
  var B = P_PAC, yH = B.haut, yB = P_TABLE_Y, i;
  var R = recipients()[0];
  // Boîtier
  ctx.fillStyle = '#8d969f';
  ctx.strokeStyle = '#4a525c';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(B.L, yH - 1.2, B.R - B.L, yB - yH + 1.2, 1.2);
  else ctx.rect(B.L, yH - 1.2, B.R - B.L, yB - yH + 1.2);
  ctx.fill(); ctx.stroke();
  // Chambres des gaz
  ctx.fillStyle = '#eef3f7';
  ctx.fillRect(B.L + 1, yH, lameX(0) - B.ep / 2 - B.L - 1, yB - yH - 1);
  ctx.fillRect(lameX(1) + B.ep / 2, yH, B.R - 1 - lameX(1) - B.ep / 2, yB - yH - 1);
  // Électrolyte (membrane)
  ctx.fillStyle = rgbCss(COUL_MEMBRANE);
  ctx.fillRect(R.L, yH, R.R - R.L, yB - yH - 1);
  ctx.strokeStyle = rgbCss(nuance(COUL_MEMBRANE, -0.12));
  ctx.lineWidth = 0.15;
  for (var x = R.L + 3; x < R.R - 1; x += 3) {
    ctx.beginPath(); ctx.moveTo(x, yH + 0.6); ctx.lineTo(x, yB - 1.6); ctx.stroke();
  }
  if (pile.showMigration) _dessinerIonsComps(ctx);
  // Électrodes poreuses de platine, et tiges vers les pinces
  var col = couleurRGB(METAUX.Pt.atome);
  for (i = 0; i < 2; i++) {
    var x0 = lameX(i) - B.ep / 2;
    ctx.fillStyle = rgbCss(nuance(col, -0.25));
    ctx.fillRect(x0, yH, B.ep, yB - yH - 1);
    ctx.fillStyle = rgbCss(nuance(col, 0.35));
    for (var yp = yH + 1; yp < yB - 1.5; yp += 1.6) {
      ctx.beginPath();
      ctx.arc(x0 + 0.8 + ((yp * 7) % 1.4), yp, 0.3, 0, Math.PI * 2);
      ctx.arc(x0 + 2.1 - ((yp * 5) % 1.2), yp + 0.8, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#6f7880';
    ctx.fillRect(lameX(i) - 0.6, P_LAME_TOP, 1.2, yH - 1.2 - P_LAME_TOP);
    _dessinerPince(ctx, lameX(i), P_LAME_TOP, 2);
  }
  // Arrivées des gaz et sortie de l'eau (flèches)
  ctx.textBaseline = 'middle';
  _flecheGaz(ctx, B.L - 9, 70, B.L + 1, 'H₂', '#2c3e50');
  _flecheGaz(ctx, B.R + 9, 70, B.R - 1, 'O₂', '#2c3e50');
  _flecheGaz(ctx, B.R - 1, 84, B.R + 9, 'H₂O', '#2a6aaa');
  ctx.fillStyle = '#5a6a78';
  ctx.textAlign = 'center';
  texteEchelle(ctx, 'H₂', (B.L + lameX(0)) / 2, yH + 4, 2.6, '700', dispP.k);
  texteEchelle(ctx, 'O₂', (B.R + lameX(1)) / 2, yH + 4, 2.6, '700', dispP.k);
  texteEchelle(ctx, 'Membrane', (R.L + R.R) / 2, yH + 3.2, 2.4, '600', dispP.k);
}

// Flèche horizontale d'arrivée ou de sortie d'un fluide, avec son nom
function _flecheGaz(ctx, xa, y, xb, txt, couleur) {
  var s = xb > xa ? 1 : -1;
  ctx.strokeStyle = couleur;
  ctx.fillStyle = couleur;
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xb - s * 1.2, y); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(xb, y); ctx.lineTo(xb - s * 1.4, y - 0.9); ctx.lineTo(xb - s * 1.4, y + 0.9);
  ctx.closePath(); ctx.fill();
  ctx.textAlign = 'center';
  texteEchelle(ctx, txt, (xa + xb) / 2, y - 2.2, 2.4, '700', dispP.k);
}

// ── Tube d'arrivée d'un gaz (demi-pile gazeuse) ───────────────────────
function _dessinerTubeGaz(ctx, i) {
  var x = tubeGazX(i), yh = P_LAME_TOP + 2, yb = P_LAME_YB - 0.5;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#6f7f8c';
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(x, yh); ctx.lineTo(x, yb); ctx.stroke();
  ctx.strokeStyle = '#f2f6f9';
  ctx.lineWidth = 1.0;
  ctx.beginPath(); ctx.moveTo(x, yh - 0.3); ctx.lineTo(x, yb + 0.3); ctx.stroke();
  ctx.lineCap = 'round';
  ctx.fillStyle = '#2c3e50';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  texteEchelle(ctx, ESPECES[pile.lames[i].gaz].txt, x, yh - 1.2, 2.6, '700', dispP.k);
}

// ── Bulles de gaz (incolores ; dichlore jaune-vert) ───────────────────
function _dessinerBulles(ctx) {
  var B = pile.bulles;
  ctx.lineWidth = 0.14;
  for (var k = 0; k < B.length; k++) {
    var b = B[k], x = b.x + 0.25 * Math.sin(pile.horloge * 6 + b.phi);
    ctx.fillStyle = b.gaz === 'Cl2' ? 'rgba(200,225,90,0.7)' : 'rgba(255,255,255,0.55)';
    ctx.strokeStyle = b.gaz === 'Cl2' ? 'rgba(120,150,40,0.8)' : 'rgba(80,105,125,0.65)';
    ctx.beginPath();
    ctx.arc(x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
}

// ── Couleur d'un compartiment ─────────────────────────────────────────
// Mêmes teintes que l'onglet Oxydoréduction (METAUX[…].solution), sur une
// échelle logarithmique de la concentration : 1 mol/L → teinte la plus
// soutenue, 0,005 mol/L et moins → l'eau. Plusieurs espèces colorées :
// moyenne pondérée par leurs concentrations. Ions incolores : l'eau.
function _couleurCompartiment(c) {
  if (enPac()) return COUL_MEMBRANE.slice();
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

  // Accumulateur : sulfate de plomb blanc qui couvre la partie immergée,
  // en taches de plus en plus serrées à mesure que la plaque se décharge
  if (L.plomb) {
    var fs = L.plomb.s / (L.plomb.n + L.plomb.s);
    if (fs > 0.005) {
      var Bp = pile.bruitDepot[i], H2 = yb - P_SOL_TOP, nb = Bp[0].length - 1;
      ctx.fillStyle = 'rgba(240,239,230,' + (0.25 + 0.55 * fs) + ')';
      for (var kk = 0; kk < nb; kk++) {
        for (var cc = 0; cc < 2; cc++) {
          if (Bp[cc][kk] > 0.55 + 0.45 * fs) continue;     // tache absente tant que la plaque est peu sulfatée
          ctx.beginPath();
          ctx.arc(x0 + 0.9 + cc * 2.2 + (Bp[1 - cc][kk] - 0.75) * 1.2, P_SOL_TOP + 1 + H2 * kk / nb,
                  0.55 + 0.6 * fs, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  _dessinerPince(ctx, xc, top, P_LAME_W);
}

// Pince crocodile en haut d'une électrode de largeur w
function _dessinerPince(ctx, xc, top, w) {
  ctx.fillStyle = '#4a525c';
  ctx.strokeStyle = '#2c3238';
  ctx.lineWidth = 0.25;
  ctx.beginPath();
  ctx.rect(xc - w / 2 - 0.6, top - 1.6, w + 1.2, 3.6);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#8a929c';
  ctx.fillRect(xc - w / 2 - 0.2, top - 1.1, w + 0.4, 0.6);
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
  var surv = pile.survol === 'tube-pont';
  ctx.save();
  ctx.translate(0, decalagePont());
  ctx.lineCap = 'butt';
  if (surv) {
    // Halo : le pont se lève ou se baisse d'un clic
    _cheminPont(ctx);
    ctx.strokeStyle = 'rgba(42,106,170,0.25)';
    ctx.lineWidth = P_PONT_W + 1.6;
    ctx.stroke();
  }
  _cheminPont(ctx);
  ctx.strokeStyle = surv ? '#2a6aaa' : '#6f7f8c';
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
  ctx.restore();
}

// Décalage vertical du pont (négatif : vers le haut), course adoucie
function decalagePont() {
  var u = pile.levee;
  return -P_PONT_LEVEE * u * u * (3 - 2 * u);
}

// Lève ou baisse le pont vers la position demandée (temps réel : marche
// aussi en pause). Renvoie true quand le pont retouche les solutions.
function majPontLevee(dtReel) {
  var cible = pile.pontBaisse ? 0 : 1;
  if (pile.levee === cible) return false;
  var pas = V_PONT * dtReel;
  pile.levee = cible > pile.levee ? Math.min(cible, pile.levee + pas) : Math.max(cible, pile.levee - pas);
  sim.needsRedraw = true;
  if (pile.levee === 0 && !pile.pont) { pile.pont = true; return true; }
  return false;
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
    _petitIon(ctx, P.x - P.ty * d, P.y + P.tx * d + decalagePont(), q.rgb, q.signe, alpha);
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
// Nom d'une électrode : lame de métal, ou électrode de graphite / platine
function nomElectrode(i) {
  var M = METAUX[pile.lames[i].sym];
  if (enPlomb()) return 'Plaque ' + M.de;
  return (M.inerte ? 'Électrode ' : 'Lame ') + M.de;
}

// Volume de gaz (mL, puis L), virgule décimale
function formatVolume(mL) {
  if (mL >= 1000) return formatNombre(mL / 1000, 2) + ' L';
  return formatNombre(mL, mL >= 10 ? 0 : 1) + ' mL';
}

// Gaz dégagés ou consommés à une électrode depuis la RAZ
// (accumulateur : d'abord la part de sulfate de plomb sur la plaque)
function texteGaz(i) {
  var G = pile.gaz[i], morceaux = [], P = pile.lames[i].plomb;
  if (P) morceaux.push('PbSO₄ : ' + Math.round(100 * P.s / (P.n + P.s)) + ' %');
  for (var g in G) {
    var mL = G[g] * V_MOLAIRE * 1000;
    if (Math.abs(mL) < 0.05) continue;
    morceaux.push(ESPECES[g].txt + (mL > 0 ? ' dégagé : ' : ' consommé : ') + formatVolume(Math.abs(mL)));
  }
  return morceaux.join(' · ');
}

// Texte à taille réduite si besoin pour tenir dans une largeur (unités de scène)
function _texteBorne(ctx, txt, x, y, taille, poids, largeur) {
  texteEchelle(ctx, txt, x, y, Math.min(taille, largeur / (txt.length * 0.53)), poids, dispP.k);
}

function _dessinerEtiquettesP(ctx) {
  var i, R = recipients();
  var w = enPac() ? P_PAC.ep : P_LAME_W;
  ctx.textBaseline = 'alphabetic';
  for (i = 0; i < 2; i++) {
    var gauche = i === 0;
    var xl = gauche ? lameX(0) - w / 2 - 1.6 : lameX(1) + w / 2 + 1.6;
    var larg = gauche ? xl - 0.5 : P_SCENE_W - 0.5 - xl;
    var y = 50.5;
    ctx.textAlign = gauche ? 'right' : 'left';
    ctx.fillStyle = '#2c3e50';
    _texteBorne(ctx, nomElectrode(i), xl, y, 2.9, '600', larg);

    if (pile.showPoles) {
      var pole = poleElectrode(i), role = roleElectrode(i);
      if (pole || role) {
        var txt = (pole ? 'Pôle ' + pole : '') + (pole && role ? ' · ' : '') + role;
        ctx.fillStyle = pole === '+' ? 'rgba(210,100,20,1)' : pole === '−' ? 'rgba(40,80,180,1)' : '#5a6a78';
        y += 3.7;
        _texteBorne(ctx, txt, xl, y, 2.9, '700', larg);
      }
    }
    var tg = texteGaz(i);
    if (tg) {
      ctx.fillStyle = '#5a6a78';
      _texteBorne(ctx, tg, xl, y + 3.5, 2.5, '600', larg);
    }
  }

  // Solutions : nom et concentrations actuelles (pH si l'eau intervient),
  // sous chaque récipient
  ctx.textAlign = 'center';
  for (var c = 0; c < R.length; c++) {
    var C = pile.comp[c], xm = (R[c].L + R[c].R) / 2;
    ctx.fillStyle = '#2c3e50';
    var nom = enPac() ? 'Électrolyte acide (membrane échangeuse de protons)' : _majusculeP(C.nom);
    _texteBorne(ctx, nom, xm, P_TABLE_Y + 6.4, 2.9, '600', deuxBechers() ? 44 : 100);
    var morceaux = [];
    for (var sym in C.n) {
      var conc = concentrationC(c, sym);
      if (sym === C.sym0 || conc >= 5e-4) {
        morceaux.push('[' + ionTexte(sym) + '] = ' + formatConcentration(conc) + ' mol/L');
      }
    }
    if (SOLUTIONS[C.sol].chlorure) morceaux.push('[Cl⁻] = ' + formatConcentration(concCl(c)) + ' mol/L');
    if (enPac()) morceaux.push('Alimentée en continu en dihydrogène et en dioxygène');
    else if (enPlomb()) {
      morceaux.push('c = ' + formatConcentration(concSO4(c)) + ' mol/L');
      morceaux.push('État de charge : ' + Math.round(100 * etatCharge()) + ' %');
    }
    else if (!C.sym0 || Math.abs(C.h) > 1e-6) morceaux.push('pH = ' + formatNombre(pH(c), 1));
    ctx.fillStyle = '#5a6a78';
    _texteBorne(ctx, morceaux.join('   '), xm, P_TABLE_Y + 10, 2.6, '400', deuxBechers() ? 46 : 100);
  }

  if (deuxBechers()) {
    ctx.fillStyle = pile.pont ? '#2c3e50' : '#9aa6b0';
    texteEchelle(ctx, pile.pontBaisse ? 'Pont salin (K⁺ + NO₃⁻)' : 'Pont salin sorti des solutions',
                 (P_PONT_X[0] + P_PONT_X[1]) / 2, P_PONT_Y - 3.4 + decalagePont(), 2.6, '600', dispP.k);
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
    if (!zoneDisponible(nom)) continue;
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
//  Souris : choix de la zone de la loupe, interrupteur, pont salin
// ══════════════════════════════════════════════════════════════════════

// Le point (unités de scène) est-il sur le tube du pont, levé ou non ?
function _surTubePont(p) {
  var dy = decalagePont(), pts = _CHEMIN_PONT;
  for (var i = 1; i < pts.length; i++) {
    var ax = pts[i - 1][0], ay = pts[i - 1][1] + dy, bx = pts[i][0], by = pts[i][1] + dy;
    var vx = bx - ax, vy = by - ay;
    var t = Math.max(0, Math.min(1, ((p.x - ax) * vx + (p.y - ay) * vy) / (vx * vx + vy * vy)));
    if (Math.hypot(p.x - ax - t * vx, p.y - ay - t * vy) < P_PONT_W / 2 + 0.8) return true;
  }
  return false;
}

// Élément sous le point (px CSS) : nom de zone, 'interrupteur', 'tube-pont' ou null
function _cibleSous(px, py) {
  var p = pxVersPile(px, py);
  var Z = zonesLoupe();
  for (var nom in Z) {
    if (!zoneDisponible(nom)) continue;
    if (Math.hypot(p.x - Z[nom].x, p.y - Z[nom].y) < R_ZONE + 1) return nom;
  }
  var comps = composantsCircuit();
  for (var i = 0; i < comps.length; i++) {
    var c = comps[i];
    if (c.type === 'interrupteur' && p.x > c.x0 - 2 && p.x < c.x1 + 2 &&
        p.y > P_FIL_Y - 7 && p.y < P_FIL_Y + 3) return 'interrupteur';
  }
  if (deuxBechers() && _surTubePont(p)) return 'tube-pont';
  return null;
}

// Renvoie true si le clic a servi
function pilePointerDown(px, py) {
  var cible = _cibleSous(px, py);
  if (!cible) return false;
  if (cible === 'interrupteur') toggleInterrupteur();
  else if (cible === 'tube-pont') togglePont();
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
