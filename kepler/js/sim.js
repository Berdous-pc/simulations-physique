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
// Accélération gravitationnelle (mm/s²) subie par un corps à 1 ua du Soleil :
// a = G·M☉/r², soit 1,327·10²⁰ / (1,496·10¹¹)² ≈ 5,93·10⁻³ m/s².
// À une distance r (en ua), a = A_TERRE_MMS2 / r².
var A_TERRE_MMS2 = 5.93;

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
  { v: 120, label: '120 j/s' },
  { v: 180, label: '180 j/s' }
];

// ── 1ʳᵉ loi : planète fictive, a et e réglables ────────────────────────
// Échelle FIXE du dessin, calibrée sur le maximum du slider a : agrandir a
// doit réellement agrandir l'ellipse à l'écran (une vue auto-échelle
// annulerait visuellement l'effet du slider), et à a constant, augmenter e
// doit aplatir l'ellipse sans changer le grand axe.
var A1_MAX = 4.0;     // valeur max du slider a (ua) — l'échelle tient 2·A1_MAX

var sim1 = {
  a: 3.0,             // demi-grand axe (ua)
  e: 0.50,            // excentricité
  M: 0,               // anomalie moyenne (rad), intégrée dans la boucle
  paused: true,
  speedIdx: 2,        // 60 j/s
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
  speedIdx: 2,        // 60 j/s
  deltaT: 30,         // durée de balayage (jours)
  showVitesse: false, // vecteur vitesse (tangent à la trajectoire)
  showRayon: false,   // vecteur position r (Soleil → planète)
  showAccel: false,   // vecteur accélération (planète → Soleil)
  aires: [],          // aires terminées : { E0, E1, aire, colorIdx, tStart, tEnd }
  sweep: null,        // balayage en cours : { Mstart, Mend, tStart, tEnd, colorIdx }
  sweepAutoPause: false // animation relancée automatiquement pour ce balayage : la remettre en pause à la fin
};

var MAX_AIRES = 10;

// Couleurs des aires balayées (remplissage translucide + trait/étiquette).
// Teintes claires : elles sont posées sur le fond « espace » sombre de la
// zone d'animation (et restent lisibles sur le fond blanc du panneau).
var AIRE_COULEURS = [
  { fill: 'rgba(140,190,245,0.42)', stroke: '#8cbef5' },
  { fill: 'rgba(245,160,130,0.42)', stroke: '#f5a082' },
  { fill: 'rgba(126,220,168,0.42)', stroke: '#7edca8' },
  { fill: 'rgba(245,205,120,0.42)', stroke: '#f5cd78' },
  { fill: 'rgba(214,168,248,0.40)', stroke: '#d6a8f8' },
  { fill: 'rgba(130,212,228,0.42)', stroke: '#82d4e4' },
  { fill: 'rgba(245,140,175,0.42)', stroke: '#f58caf' },
  { fill: 'rgba(180,215,110,0.42)', stroke: '#b4d76e' },
  { fill: 'rgba(255,180,90,0.42)',  stroke: '#ffb45a' },
  { fill: 'rgba(160,180,245,0.42)', stroke: '#a0b4f5' }
];

var SUB_CHARS = ['₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉', '₁₀'];

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
    // Fusion des deux groupes précédents : les 8 planètes sur un seul
    // canvas, avec un zoom (échelle log) pour passer de la vue complète
    // (Neptune) aux planètes internes — l'élève « voit » le facteur ~20
    // entre les deux échelles.
    label: 'Système Solaire',
    attracteur: { nom: 'Soleil', type: 'soleil' },
    uniteA: 'ua', uniteT: 'an',
    // zoomMax : borne du slider (échelle log, 1 = système complet).
    // presets : vues prédéfinies (zoom animé) ; le zoom « internes » cadre
    // l'aphélie de Mars (30,07·1,010 / 1,524·1,093 ≈ 18,2), et chaque
    // preset pré-sélectionne un cran de vitesse adapté à l'échelle vue.
    zoomMax: 40,
    ceinture: true,     // ceinture d'astéroïdes décorative entre Mars et Jupiter
    presets: [
      { label: 'Système complet',   zoom: 1,    speedIdx: 4 },
      { label: 'Planètes internes', zoom: 18.2, speedIdx: 2 }
    ],
    // Toute la gamme des deux anciens groupes : les crans « jours » servent
    // zoomé sur les internes, les crans « an » servent en vue complète.
    speeds: [
      { v: 30 / JOURS_PAR_AN,  label: '30 j/s'   },
      { v: 60 / JOURS_PAR_AN,  label: '60 j/s'   },
      { v: 120 / JOURS_PAR_AN, label: '120 j/s'  },
      { v: 0.5,                label: '6 mois/s' },
      { v: 1,                  label: '1 an/s'   },
      { v: 5,                  label: '5 an/s'   }
    ],
    defaultSpeedIdx: 4,
    corps: [
      { nom: 'Mercure', a: 0.387,  T: 0.2408, e: 0.206, couleur: '#7a8a96', couleurClair: '#b0bcc6', rayon: 6, type: 'mercure' },
      { nom: 'Vénus',   a: 0.723,  T: 0.6152, e: 0.007, couleur: '#c08020', couleurClair: '#e8a848', rayon: 8, type: 'venus' },
      { nom: 'Terre',   a: 1.000,  T: 1.0000, e: 0.017, couleur: '#2a6aaa', couleurClair: '#6aa2e0', rayon: 8, type: 'terre' },
      { nom: 'Mars',    a: 1.524,  T: 1.8808, e: 0.093, couleur: '#b04020', couleurClair: '#e87850', rayon: 7, type: 'mars' },
      { nom: 'Jupiter', a: 5.203,  T: 11.86,  e: 0.049, couleur: '#b07040', couleurClair: '#dc9868', rayon: 11, type: 'jupiter' },
      { nom: 'Saturne', a: 9.537,  T: 29.46,  e: 0.057, couleur: '#c8a050', couleurClair: '#e8c878', rayon: 10, type: 'saturne' },
      { nom: 'Uranus',  a: 19.19,  T: 84.02,  e: 0.046, couleur: '#4a9aa8', couleurClair: '#70c8d8', rayon: 8, type: 'uranus' },
      { nom: 'Neptune', a: 30.07,  T: 164.8,  e: 0.010, couleur: '#3a5aaa', couleurClair: '#7a96e0', rayon: 8, type: 'neptune' }
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
      { nom: 'Io',       a: 0.4218, T: 1.769,  e: 0.004, couleur: '#c0a030', couleurClair: '#e8cc58', rayon: 7 },
      { nom: 'Europe',   a: 0.6711, T: 3.551,  e: 0.009, couleur: '#6a92b8', couleurClair: '#98c0e8', rayon: 6 },
      { nom: 'Ganymède', a: 1.0704, T: 7.155,  e: 0.001, couleur: '#8a7a68', couleurClair: '#c0ac94', rayon: 8 },
      { nom: 'Callisto', a: 1.8827, T: 16.69,  e: 0.007, couleur: '#6a5a48', couleurClair: '#a89078', rayon: 7 }
    ]
  },
  {
    // Principales lunes glacées + Titan. Mimas et Japet sont volontairement
    // écartées : Japet orbite 15× plus loin qu'Encelade, l'échelle linéaire
    // écraserait toutes les orbites internes.
    label: 'Lunes de Saturne',
    attracteur: { nom: 'Saturne', type: 'saturne' },
    uniteA: 'Gm', uniteT: 'j',
    speeds: [
      { v: 0.25, label: '6 h/s'  },
      { v: 0.5,  label: '12 h/s' },
      { v: 1,    label: '1 j/s'  },
      { v: 2,    label: '2 j/s'  }
    ],
    defaultSpeedIdx: 2,
    corps: [
      { nom: 'Encelade', a: 0.2380, T: 1.370,  e: 0.005, couleur: '#4a90a0', couleurClair: '#78c8d8', rayon: 4 },
      { nom: 'Téthys',   a: 0.2947, T: 1.888,  e: 0.001, couleur: '#8a8a9a', couleurClair: '#b8b8cc', rayon: 6 },
      { nom: 'Dioné',    a: 0.3774, T: 2.737,  e: 0.002, couleur: '#9a7a9a', couleurClair: '#c8a8c8', rayon: 6 },
      { nom: 'Rhéa',     a: 0.5271, T: 4.518,  e: 0.001, couleur: '#a08850', couleurClair: '#d0b878', rayon: 7 },
      { nom: 'Titan',    a: 1.2219, T: 15.95,  e: 0.029, couleur: '#c07830', couleurClair: '#e8a058', rayon: 10 }
    ]
  }
];

var sys3 = {
  sysIdx: 0,
  t: 0,               // temps simulé, en unité de T du système courant
  paused: true,
  // Vue par défaut : preset « Planètes internes » du Système Solaire.
  speedIdx: SYSTEMES[0].presets[1].speedIdx,
  showNoms: true,
  showOrbites: true,
  showGraph: false,   // graphe masqué par défaut : place à l'animation
  zoom: SYSTEMES[0].presets[1].zoom,     // zoom canvas courant (systèmes avec zoomMax uniquement)
  zoomCible: SYSTEMES[0].presets[1].zoom, // cible du zoom animé (presets, double-clic)
  graphZoomLinked: true, // graphe asservi au zoom du canvas (Système Solaire)
  modelLin: false,    // droite modèle y = k×x affichée sur le graphe
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
