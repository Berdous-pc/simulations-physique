// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  tf-molecules.js — Onglet Transformations : molécules par bandes de gaz
//  Chargé après tf-sim.js, avant tf-scene.js (qui les dessine).
//
//  Les molécules ne calculent rien : P et T viennent des tranches du
//  modèle. Pour l'affichage, les tranches sont regroupées en bandes de même
//  masse ; chaque bande est une petite boîte de gaz :
//    - ses molécules volent en ligne droite et rebondissent sur les parois,
//      le fond, le piston et les LIMITES DE LEUR BANDE, qu'elles ne
//      franchissent jamais : le haut et le bas ne se mélangent pas ;
//    - leur position verticale est une coordonnée de MASSE dans la bande
//      (zr), placée dans les tranches là où elles se trouvent : une tranche
//      comprimée serre ses molécules, densité juste par construction à la
//      résolution des tranches ; un front de compression se voit comme une
//      zone de molécules serrées qui traverse le gaz, et les molécules
//      suivent le mouvement d'ensemble de leur tranche. (Avant : position
//      proportionnelle à la hauteur de la bande, densité uniforme dans la
//      bande, où le front, épais de ~3 tranches sur 8, ne se voyait pas.)
//      zr avance à vitesse uniforme en masse, sans quoi les molécules
//      s'accumuleraient dans les tranches épaisses : la vitesse verticale
//      vue est donc multipliée par ρ̄/ρ de la tranche (écart de quelques %
//      dans une onde ordinaire) ;
//    - vitesse et couleur selon T de la TRANCHE où se trouve la molécule
//      (interpolée entre centres de tranches) et non de la moyenne de sa
//      bande : un front, épais de quelques tranches, tombe à l'intérieur
//      d'une bande et serait lissé par la moyenne.
//  Le confinement par bande donne la densité, la tranche locale l'agitation.
//
//  Nombre de bandes : 10 tant qu'elles sont assez hautes à l'écran ; dans un
//  gaz très écrasé, une bande de quelques px ne laisserait voir que le vol
//  horizontal, et les bandes sont regroupées (8, 5, 4, 2 puis 1). Les 600
//  molécules restent, réparties à nouveau par altitude : aucune ne saute.
//
//  Vitesse d'agitation : conventionnelle (lisible). Aux crans lents, elle
//  ralentit avec le curseur Vitesse, jusqu'à un plancher (_tfMolFacteurTemps :
//  ×0,25 à ×1/5000) : on voit le temps ralentir dans le gaz, et la densité
//  d'un front ressort mieux d'une agitation moins vive. C'est un repère du
//  ralenti, pas une échelle : proportionnelle au cran, l'agitation figerait
//  le gaz dès ×1/100 ; à l'échelle réelle, elle ne changerait qu'à ×1/5000.
//  Au-dessus de ×1, elle ne s'accélère pas (illisible).
//  Écarts exagérés (option) : v ∝ (T/T₀)³ au lieu de √(T/T₀), entre ×0,12
//  et ×5 ; une compression adiabatique de 30 à 15 cm ne change la vraie
//  vitesse que de 15 %, invisible (×1,5 avec l'exposant 1,5 ne se voyait
//  toujours pas), ici ×2,3.
//  Versions abandonnées : vols libres d'une paroi à l'autre (tout se
//  mélangeait), libre parcours court (onde noyée dans le bruit), molécules
//  ancrées qui frémissaient (~1 px : un gaz figé, agitation invisible),
//  agitation freinée en racine cubique du cran, et à l'échelle réelle au
//  cran ×1/5000 (non monotone : ×1/1000 était huit fois plus lent que
//  ×1/5000).
// ══════════════════════════════════════════════════════════════════════

'use strict';

var TF_BANDES          = 10;                    // bandes de repère (pointillés), et au plus de molécules
var TF_TR_PAR_BANDE    = TF_N / TF_BANDES;      // tranches par bande de repère (8)
var TF_MOL_TOTAL       = 600;
// Regroupements possibles (diviseurs communs de 80 tranches et 600 molécules)
var TF_MOL_NB_BANDES   = [10, 8, 5, 4, 2, 1];
// Hauteur moyenne d'une bande à l'écran, en rayons de molécule, en dessous
// de laquelle on regroupe (8 diamètres, au moins 24 px : avec 4 diamètres,
// le vol restait lu comme un va-et-vient horizontal dès 15 cm) ; on ne
// redécoupe qu'au-dessus de ce seuil × 1,25.
var TF_MOL_BANDE_RAYONS = 16;
var TF_MOL_BANDE_PX_MIN = 24;
// Vitesse affichée à T₀ (m/s, échelle verticale du dessin) : une bande au
// repos (~3 cm) est traversée en ~0,25 s.
var TF_MOL_VITESSE     = 0.12;
var TF_MOL_EXAGERE     = 3;                     // exposant de T/T₀ (écarts exagérés)
var TF_MOL_EXAGERE_MIN = 0.12;                  // facteur de vitesse au moins (gaz froid)
var TF_MOL_EXAGERE_MAX = 5;                     // facteur de vitesse au plus
var TF_MOL_RAYON       = 0.0055;                // fraction de la largeur dessinée

// Facteur d'agitation selon la vitesse du temps : un par cran lent, de ×1
// à ×1/5000, interpolé en log entre les crans (passages progressifs de la
// vitesse adaptée)
var TF_MOL_TEMPS = [[1 / 5000, 0.25], [1 / 1000, 0.35], [1 / 100, 0.5], [0.1, 0.7], [1, 1]];

function _tfMolFacteurTemps(v) {
  var P = TF_MOL_TEMPS;
  if (v >= 1) return 1;
  if (v <= P[0][0]) return P[0][1];
  for (var i = 1; i < P.length; i++) {
    if (v <= P[i][0]) {
      var f = Math.log(v / P[i - 1][0]) / Math.log(P[i][0] / P[i - 1][0]);
      return P[i - 1][1] + f * (P[i][1] - P[i - 1][1]);
    }
  }
  return 1;
}

// Éclats de chocs sur les parois, le fond et le piston (option) : durée de
// vie en s d'affichage, nombre maximal à l'écran
var TF_CHOC_VIE = 0.15;
var TF_CHOC_MAX = 400;

var tfMol = [];   // { b, zr, x, ux, uz } : bande, coordonnée de masse dans
                  // la bande (0 → 1), abscisse (fraction de la largeur),
                  // direction unitaire du vol
var tfChocs = []; // { x, z, cote, age } : point d'impact (fraction de la
                  // largeur, m), paroi touchée ('g', 'd', 'fond', 'piston')
var tfMolNb = TF_BANDES;   // nombre de bandes des molécules
var tfMolExagere = true;   // écarts d'agitation exagérés

// Limites d'une bande de molécules (m)
function _tfMolTr() { return TF_N / tfMolNb; }
function tfBandeBas(b)  { return tf.z[b * _tfMolTr()]; }
function tfBandeHaut(b) { return tf.z[(b + 1) * _tfMolTr()]; }

// Tranche d'une molécule et sa position dans la tranche (0 → 1), en masse :
// zr est une coordonnée de masse dans la bande, dont les tranches ont la
// même masse
function _tfMolTranche(m) {
  var nTr = _tfMolTr(), s = m.zr * nTr;
  var i = Math.min(nTr - 1, Math.max(0, Math.floor(s)));
  return { j: m.b * nTr + i, f: s - i };
}

// Altitude (m) d'une molécule : dans sa tranche, là où celle-ci se trouve.
// Une tranche comprimée serre ses molécules, à la résolution des tranches
// et non plus des bandes : un front, épais de ~3 tranches, se voit.
function tfMolZ(m) {
  var t = _tfMolTranche(m), zz = tf.z;
  return zz[t.j] + t.f * (zz[t.j + 1] - zz[t.j]);
}

// Coordonnée de masse (zr) de l'altitude z dans la bande b
function _tfMolZr(b, z) {
  var nTr = _tfMolTr(), j0 = b * nTr, zz = tf.z, i = 0;
  if (z <= zz[j0]) return 0;
  if (z >= zz[j0 + nTr]) return 1;
  while (i < nTr - 1 && zz[j0 + i + 1] < z) i++;
  var dz = zz[j0 + i + 1] - zz[j0 + i];
  return (i + (dz > 0 ? (z - zz[j0 + i]) / dz : 0.5)) / nTr;
}

// Température du gaz à l'altitude d'une molécule (K) : celle de sa
// tranche, interpolée linéairement entre les centres de cette tranche et
// de sa voisine
function tfMolT(m) {
  var t = _tfMolTranche(m), j = t.j;
  var k = t.f > 0.5 ? j + 1 : j - 1;
  if (k < 0 || k >= TF_N) return tfTTranche(j);
  return tfTTranche(j) + Math.abs(t.f - 0.5) * (tfTTranche(k) - tfTTranche(j));
}

// Même nombre de molécules par bande, positions et directions au hasard
function tfMolInit() {
  tfMol = [];
  tfChocs = [];
  var parBande = TF_MOL_TOTAL / tfMolNb;
  for (var b = 0; b < tfMolNb; b++) {
    for (var k = 0; k < parBande; k++) {
      var a = Math.random() * 2 * Math.PI;
      tfMol.push({ b: b, zr: Math.random(), x: Math.random(),
                   ux: Math.cos(a), uz: Math.sin(a) });
    }
  }
}

// Nombre de bandes pour un gaz de hauteur hPx à l'écran : le plus grand
// dont les bandes restent assez hautes (rPx : rayon d'une molécule), avec
// une marge pour redécouper
function _tfMolNbVise(hPx, rPx) {
  var hMin = Math.max(TF_MOL_BANDE_PX_MIN, TF_MOL_BANDE_RAYONS * rPx);
  for (var i = 0; i < TF_MOL_NB_BANDES.length; i++) {
    var nb = TF_MOL_NB_BANDES[i];
    var seuil = nb > tfMolNb ? 1.25 * hMin : hMin;
    if (hPx / nb >= seuil) return nb;
  }
  return 1;
}

// Regroupe (ou redécoupe) les molécules en nb bandes : classées par
// altitude, les TF_MOL_TOTAL/nb plus basses vont dans la première bande, et
// ainsi de suite. Chacune garde son altitude, sauf, au redécoupage, les
// rares qui tombent du mauvais côté d'une limite (ramenées contre elle).
function _tfMolRegrouper(nb) {
  var z = tfMol.map(tfMolZ);
  var ordre = tfMol.map(function (m, i) { return i; });
  ordre.sort(function (a, b) { return z[a] - z[b]; });
  tfMolNb = nb;
  var parBande = TF_MOL_TOTAL / nb;
  for (var r = 0; r < ordre.length; r++) {
    var m = tfMol[ordre[r]], b = Math.floor(r / parBande);
    m.b = b;
    m.zr = _tfMolZr(b, z[ordre[r]]);
  }
}

function _tfChoc(x, z, cote) {
  if (tfChocs.length < TF_CHOC_MAX) tfChocs.push({ x: x, z: z, cote: cote, age: 0 });
}

// Avance les molécules. dtReel : durée réelle de l'image (s). largeur :
// largeur intérieure dessinée, en m d'échelle verticale (le cylindre est
// élargi sur le dessin : c'est la largeur VUE qui compte pour que
// l'agitation paraisse isotrope). echelle : px par m, pour la hauteur des
// bandes à l'écran. chocs : relever les impacts sur les parois.
function tfMolAvancer(dtReel, largeur, rayonFrac, echelle, chocs) {
  if (dtReel <= 0 || largeur <= 0) return;
  var nb = _tfMolNbVise(tf.z[TF_N] * echelle, rayonFrac * largeur * echelle);
  if (nb !== tfMolNb) _tfMolRegrouper(nb);

  var xMin = rayonFrac, xMax = 1 - rayonFrac;
  // Distance parcourue à T : d = k·(T/T₀)^α
  var k = TF_MOL_VITESSE * dtReel * _tfMolFacteurTemps(tf.vitesse);
  var alpha = tfMolExagere ? TF_MOL_EXAGERE : 0.5;
  var Tref = tf.T0;

  for (var i = 0; i < tfChocs.length; i++) tfChocs[i].age += dtReel;
  while (tfChocs.length && tfChocs[0].age > TF_CHOC_VIE) tfChocs.shift();

  var bHaut = tfMolNb - 1;
  for (i = 0; i < tfMol.length; i++) {
    var m = tfMol[i];
    var f = Math.pow(Math.max(tfMolT(m), 1) / Tref, alpha);
    var d = k * Math.min(TF_MOL_EXAGERE_MAX, Math.max(TF_MOL_EXAGERE_MIN, f));

    // Horizontal : rebonds sur les parois
    m.x += m.ux * d / largeur;
    if (m.x < xMin) { m.x = 2 * xMin - m.x; m.ux = Math.abs(m.ux);  if (chocs) _tfChoc(xMin, tfMolZ(m), 'g'); }
    if (m.x > xMax) { m.x = 2 * xMax - m.x; m.ux = -Math.abs(m.ux); if (chocs) _tfChoc(xMax, tfMolZ(m), 'd'); }
    if (m.x < xMin || m.x > xMax) m.x = 0.5;   // pas aberrant

    // Vertical : rebonds sur les limites de la bande (fond et piston pour
    // les bandes extrêmes), en position relative pour suivre le gaz
    var h = tfBandeHaut(m.b) - tfBandeBas(m.b);
    if (h <= 0) continue;
    m.zr += m.uz * d / h;
    var garde = 0;
    while ((m.zr < 0 || m.zr > 1) && garde++ < 8) {
      if (m.zr > 1) {
        m.zr = 2 - m.zr; m.uz = -Math.abs(m.uz);
        if (chocs && m.b === bHaut) _tfChoc(m.x, tf.z[TF_N], 'piston');
      }
      if (m.zr < 0) {
        m.zr = -m.zr; m.uz = Math.abs(m.uz);
        if (chocs && m.b === 0) _tfChoc(m.x, 0, 'fond');
      }
    }
    if (m.zr < 0 || m.zr > 1) m.zr = 0.5;
  }
}
