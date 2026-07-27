// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  sim.js — État global, données astronomiques et outils mathématiques
//  Chargé en PREMIER (scope global, pas de modules ES).
//
//  Trois états indépendants, un par onglet :
//  - sim1 : 1ʳᵉ loi (vocabulaire de l'ellipse, a et e réglables) ;
//  - sim2 : 2ᵉ loi (loi des aires, a = 1 ua fixé, e réglable) ;
//  - sys3 : 3ᵉ loi (systèmes réels : planètes et lunes de Jupiter).
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Constantes physiques ───────────────────────────────────────────────
var JOURS_PAR_AN = 365.25;
// Vitesse orbitale (km/s) d'un corps en orbite circulaire de rayon 1 ua
// autour du Soleil — sert de facteur d'échelle dans la formule vis-viva :
// v = 29,78 × √(2/r − 1/a)  avec r et a en ua.
var V_TERRE_KMS = 29.78;

// ══════════════════════════════════════════════════════════════════════
//  Mathématiques du mouvement képlérien
// ══════════════════════════════════════════════════════════════════════

// Résout l'équation de Kepler  M = E − e·sin(E)  par la méthode de Newton.
// 20 itérations : à e = 0,99 (max des sliders) et M proche du périhélie,
// Newton partant de E = M fait un grand détour avant de converger (~7-8
// itérations) — la marge est donc confortable, et chaque itération est
// triviale. M peut être quelconque (pas besoin de le ramener dans [0, 2π] :
// E reste alors « déroulé » comme M, ce qui est précisément ce qu'exploite
// le balayage d'aires de la 2ᵉ loi).
function solveKepler(M, e) {
  var E = M;
  for (var i = 0; i < 20; i++) {
    E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  return E;
}

// Demi-petit axe.
function demiPetitAxe(a, e) { return a * Math.sqrt(1 - e * e); }

// Période orbitale (jours) autour du Soleil — 3ᵉ loi : T² = a³ (an, ua).
function periodeJours(a) { return JOURS_PAR_AN * Math.pow(a, 1.5); }

// Position du corps par rapport au foyer occupé par l'attracteur (le Soleil),
// périhélie vers +x, y vers le haut, unités de a.
//   x = a(cos E − e)   ;   y = b·sin E   ;   r = a(1 − e·cos E)
function posKepler(a, e, M) {
  var E = solveKepler(M, e);
  var b = demiPetitAxe(a, e);
  return {
    E: E,
    x: a * (Math.cos(E) - e),
    y: b * Math.sin(E),
    r: a * (1 - e * Math.cos(E))
  };
}

// ══════════════════════════════════════════════════════════════════════
//  Onglets 1 et 2 — état
// ══════════════════════════════════════════════════════════════════════

// Crans du slider « Vitesse d'animation » (jours simulés par seconde réelle),
// communs aux onglets 1 et 2.
var SPEED12 = [
  { v: 10,  label: '10 j/s'  },
  { v: 30,  label: '30 j/s'  },
  { v: 60,  label: '60 j/s'  },
  { v: 120, label: '120 j/s' }
];

// ── 1ʳᵉ loi : planète fictive, a et e réglables ────────────────────────
// Échelle FIXE du dessin, calibrée sur le maximum du slider a : agrandir a
// doit réellement agrandir l'ellipse à l'écran (une vue auto-échelle
// annulerait visuellement l'effet du slider), et à a constant, augmenter e
// doit aplatir l'ellipse sans changer le grand axe.
var A1_MAX = 4.0;     // valeur max du slider a (ua) — l'échelle tient 2·A1_MAX

var sim1 = {
  a: 1.0,             // demi-grand axe (ua)
  e: 0.50,            // excentricité
  M: 0,               // anomalie moyenne (rad), intégrée dans la boucle
  paused: true,
  speedIdx: 1,        // 30 j/s
  showFoyers: true,   // foyers F, F′, centre O et distance c
  showGrandAxe: true,
  showPetitAxe: true,
  showDistances: false // segments r et r′ (planète → foyers)
};

// ── 2ᵉ loi : a = 1 ua fixé (T = 1 an), e réglable ──────────────────────
var sim2 = {
  a: 1.0,
  e: 0.60,
  M: 0,
  t: 0,               // temps simulé (jours)
  paused: true,
  speedIdx: 0,        // 10 j/s : un balayage de 30 j dure 3 s à l'écran
  deltaT: 30,         // durée de balayage (jours)
  showVitesse: true,  // vecteur vitesse
  aires: [],          // aires terminées : { E0, E1, aire, colorIdx, tStart, tEnd }
  sweep: null         // balayage en cours : { Mstart, Mend, tStart, tEnd, colorIdx }
};

var MAX_AIRES = 6;

// Couleurs des aires balayées (remplissage translucide + trait/étiquette).
// Teintes claires : elles sont posées sur le fond « espace » sombre de la
// zone d'animation (et restent lisibles sur le fond blanc du panneau).
var AIRE_COULEURS = [
  { fill: 'rgba(106,162,224,0.35)', stroke: '#6aa2e0' },
  { fill: 'rgba(224,128,96,0.35)',  stroke: '#e08060' },
  { fill: 'rgba(88,192,136,0.35)',  stroke: '#58c088' },
  { fill: 'rgba(224,176,80,0.35)',  stroke: '#e0b050' },
  { fill: 'rgba(192,136,232,0.32)', stroke: '#c088e8' },
  { fill: 'rgba(96,184,200,0.35)',  stroke: '#60b8c8' }
];

var SUB_CHARS = ['₁', '₂', '₃', '₄', '₅', '₆'];

// ══════════════════════════════════════════════════════════════════════
//  Onglet 3 — systèmes réels
// ══════════════════════════════════════════════════════════════════════
//
//  a : demi-grand axe — ua pour les planètes, Gm (10⁶ km) pour les lunes ;
//  T : période de révolution — an pour les planètes, jours pour les lunes ;
//  e : excentricité réelle (les orbites sont tracées comme de vraies
//      ellipses, attracteur au foyer, périhélies alignés vers +x par
//      simplification) ;
//  speeds : crans du slider vitesse, en unité de T par seconde réelle ;
//  couleur : teinte pour les fonds CLAIRS (graphe, tableau du panneau) ;
//  couleurClair : la même teinte éclaircie pour le canvas au fond sombre.

var SYSTEMES = [
  {
    label: 'Mercure → Mars',
    attracteur: { nom: 'Soleil', type: 'soleil' },
    uniteA: 'ua', uniteT: 'an',
    speeds: [
      { v: 15 / JOURS_PAR_AN,  label: '15 j/s'  },
      { v: 30 / JOURS_PAR_AN,  label: '30 j/s'  },
      { v: 60 / JOURS_PAR_AN,  label: '60 j/s'  },
      { v: 120 / JOURS_PAR_AN, label: '120 j/s' }
    ],
    defaultSpeedIdx: 2,
    corps: [
      { nom: 'Mercure', a: 0.387,  T: 0.2408, e: 0.206, couleur: '#7a8a96', couleurClair: '#b0bcc6', rayon: 4 },
      { nom: 'Vénus',   a: 0.723,  T: 0.6152, e: 0.007, couleur: '#c08020', couleurClair: '#e8a848', rayon: 6 },
      { nom: 'Terre',   a: 1.000,  T: 1.0000, e: 0.017, couleur: '#2a6aaa', couleurClair: '#6aa2e0', rayon: 6 },
      { nom: 'Mars',    a: 1.524,  T: 1.8808, e: 0.093, couleur: '#b04020', couleurClair: '#e87850', rayon: 5 }
    ]
  },
  {
    label: 'Jupiter → Neptune',
    attracteur: { nom: 'Soleil', type: 'soleil' },
    uniteA: 'ua', uniteT: 'an',
    speeds: [
      { v: 0.5, label: '6 mois/s' },
      { v: 1,   label: '1 an/s'   },
      { v: 2,   label: '2 an/s'   },
      { v: 5,   label: '5 an/s'   }
    ],
    defaultSpeedIdx: 2,
    corps: [
      { nom: 'Jupiter', a: 5.203,  T: 11.86,  e: 0.049, couleur: '#b07040', couleurClair: '#dc9868', rayon: 8 },
      { nom: 'Saturne', a: 9.537,  T: 29.46,  e: 0.057, couleur: '#c8a050', couleurClair: '#e8c878', rayon: 7 },
      { nom: 'Uranus',  a: 19.19,  T: 84.02,  e: 0.046, couleur: '#4a9aa8', couleurClair: '#70c8d8', rayon: 6 },
      { nom: 'Neptune', a: 30.07,  T: 164.8,  e: 0.010, couleur: '#3a5aaa', couleurClair: '#7a96e0', rayon: 6 }
    ]
  },
  {
    label: 'Lunes de Jupiter',
    attracteur: { nom: 'Jupiter', type: 'jupiter' },
    uniteA: 'Gm', uniteT: 'j',
    speeds: [
      { v: 0.25, label: '6 h/s'  },
      { v: 0.5,  label: '12 h/s' },
      { v: 1,    label: '1 j/s'  },
      { v: 2,    label: '2 j/s'  }
    ],
    defaultSpeedIdx: 2,
    corps: [
      { nom: 'Io',       a: 0.4218, T: 1.769,  e: 0.004, couleur: '#c0a030', couleurClair: '#e8cc58', rayon: 5 },
      { nom: 'Europe',   a: 0.6711, T: 3.551,  e: 0.009, couleur: '#6a92b8', couleurClair: '#98c0e8', rayon: 4 },
      { nom: 'Ganymède', a: 1.0704, T: 7.155,  e: 0.001, couleur: '#8a7a68', couleurClair: '#c0ac94', rayon: 6 },
      { nom: 'Callisto', a: 1.8827, T: 16.69,  e: 0.007, couleur: '#6a5a48', couleurClair: '#a89078', rayon: 5 }
    ]
  }
];

var sys3 = {
  sysIdx: 0,
  t: 0,               // temps simulé, en unité de T du système courant
  paused: true,
  speedIdx: SYSTEMES[0].defaultSpeedIdx,
  showNoms: true,
  showOrbites: true,
  axeX: 1,            // exposant de a porté en abscisse  (1, 2 ou 3)
  axeY: 1             // exposant de T porté en ordonnée (1, 2 ou 3)
};

// ══════════════════════════════════════════════════════════════════════
//  Formatage des nombres (convention française : virgule décimale)
// ══════════════════════════════════════════════════════════════════════

function fmtFr(x, dec) {
  return x.toFixed(dec).replace('.', ',');
}

// Nombre de décimales adapté à l'ordre de grandeur.
function fmtSmart(x) {
  var ax = Math.abs(x);
  if (ax >= 100) return fmtFr(x, 0);
  if (ax >= 10)  return fmtFr(x, 1);
  if (ax >= 1)   return fmtFr(x, 2);
  return fmtFr(x, 3);
}

// Exposant en exposant Unicode (pour les libellés T², a³…).
function expChar(n) { return n === 2 ? '²' : (n === 3 ? '³' : ''); }

// « T² », « a³ »… puis « an² », « ua³ »… pour les unités.
function labelPow(base, n) { return base + expChar(n); }
