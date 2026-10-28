// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  tf-molecules.js — Onglet Transformations : molécules pilotées par le
//  modèle en tranches
//  Chargé après tf-sim.js, avant tf-scene.js (qui les dessine).
//
//  Les molécules ne calculent rien : P et T viennent des tranches. Elles
//  rendent visible ce que fait le gaz LÀ OÙ ELLES SONT :
//    - chaque molécule appartient à une tranche et y garde sa position
//      RELATIVE : elle est entraînée avec le gaz (piston, ondes) ;
//    - LIBRE PARCOURS COURT : elle vole sur quelques millimètres puis repart
//      dans une direction au hasard, comme dans un gaz réel où les chocs
//      sont incessants. Elle reste donc dans sa région au lieu de traverser
//      le cylindre d'un trait (ce qui mélangeait tout) ;
//    - vitesse ∝ √T de sa tranche (la couleur, dessinée par tf-scene.js,
//      suit aussi cette température) ;
//    - la densité suit celle du gaz : le passage d'une tranche à l'autre est
//      accepté avec la probabilité min(1, ρ'·v'/(ρ·v)) (sinon la molécule
//      rebrousse chemin), règle qui équilibre les flux de part et d'autre et
//      donne, en régime établi, un nombre de molécules par tranche
//      proportionnel à la masse de gaz, quelles que soient les températures.
// ══════════════════════════════════════════════════════════════════════

'use strict';

var TF_MOL_PAR_TRANCHE = 20;    // 600 molécules pour 30 tranches
// Vitesse affichée à T0 (m/s, à l'échelle verticale du dessin). Les vraies
// vitesses (~500 m/s) sont invisibles : on garde le rapport √T.
var TF_MOL_VITESSE = 0.15;
// Libre parcours moyen affiché (m, échelle du dessin). Constant : le faire
// varier comme 1/ρ, comme dans un gaz réel, biaisait la règle de passage
// entre tranches (+11 à +14 % de molécules dans le gaz dense, mesuré).
var TF_MOL_LPM     = 0.008;
var TF_MOL_RAYON   = 0.0075;    // fraction de la largeur dessinée du cylindre

var tfMol = [];   // { j, s, x, ux, uz, libre } : tranche, position relative
                  // dans la tranche (0 → 1), abscisse en fraction de la
                  // largeur (0 → 1), direction unitaire, distance restant à
                  // parcourir avant le prochain choc (m)

// Répartition initiale : même nombre par tranche, positions et directions
// au hasard
function tfMolInit() {
  tfMol = [];
  for (var j = 0; j < TF_N; j++) {
    for (var k = 0; k < TF_MOL_PAR_TRANCHE; k++) {
      var m = { j: j, s: Math.random(), x: Math.random(), ux: 0, uz: 0, libre: 0 };
      _tfMolNouveauChoc(m);
      tfMol.push(m);
    }
  }
}

// Vitesse affichée d'une molécule de la tranche j (m/s)
function tfMolVitesse(j) {
  return TF_MOL_VITESSE * Math.sqrt(Math.max(tfTTranche(j), 1) / TF_T0);
}

// Nouveau choc : direction au hasard, distance au choc suivant tirée selon
// une loi exponentielle de moyenne le libre parcours.
function _tfMolNouveauChoc(m) {
  var a = Math.random() * 2 * Math.PI;
  m.ux = Math.cos(a);
  m.uz = Math.sin(a);
  m.libre = -TF_MOL_LPM * Math.log(1 - Math.random());
}

// Avance les molécules de dt secondes (temps d'affichage).
// largeur : largeur intérieure dessinée, en m d'échelle verticale (le
// cylindre est élargi sur le dessin : c'est la largeur VUE qui compte pour
// que l'agitation paraisse isotrope).
function tfMolAvancer(dt, largeur, rayonFrac) {
  if (dt <= 0 || largeur <= 0) return;
  for (var i = 0; i < tfMol.length; i++) {
    var m = tfMol[i];
    var d = tfMolVitesse(m.j) * dt;
    var garde = 0;
    while (d > 0 && garde++ < 20) {
      var pas = Math.min(d, m.libre);
      _tfMolDeplacer(m, pas, largeur, rayonFrac);
      d -= pas;
      m.libre -= pas;
      if (m.libre <= 1e-9) _tfMolNouveauChoc(m);
    }
  }
}

// Déplace une molécule de dist (m) dans sa direction : rebonds sur les
// parois, le fond et le piston, passages d'une tranche à l'autre.
function _tfMolDeplacer(m, dist, largeur, rayonFrac) {
  var z = tf.z, N = TF_N;
  var xMin = rayonFrac, xMax = 1 - rayonFrac;

  m.x += m.ux * dist / largeur;
  if (m.x < xMin) { m.x = 2 * xMin - m.x; m.ux = Math.abs(m.ux); }
  if (m.x > xMax) { m.x = 2 * xMax - m.x; m.ux = -Math.abs(m.ux); }
  if (m.x < xMin || m.x > xMax) m.x = 0.5;   // pas aberrant

  var j = m.j;
  var zm = z[j] + m.s * (z[j + 1] - z[j]) + m.uz * dist;
  var garde = 0;
  while (garde++ < 4 * N) {
    if (zm > z[j + 1]) {
      if (j === N - 1) {                       // piston
        zm = 2 * z[N] - zm; m.uz = -Math.abs(m.uz);
      } else if (Math.random() < _tfMolPassage(j, j + 1)) {
        j++;
      } else {                                 // rebrousse chemin
        zm = 2 * z[j + 1] - zm; m.uz = -Math.abs(m.uz);
      }
    } else if (zm < z[j]) {
      if (j === 0) {                           // fond
        zm = -zm; m.uz = Math.abs(m.uz);
      } else if (Math.random() < _tfMolPassage(j, j - 1)) {
        j--;
      } else {
        zm = 2 * z[j] - zm; m.uz = Math.abs(m.uz);
      }
    } else {
      break;
    }
  }
  m.j = j;
  m.s = Math.min(1, Math.max(0, (zm - z[j]) / (z[j + 1] - z[j])));
}

// Probabilité de passer de la tranche a à la tranche b : min(1, ρ_b·v_b / (ρ_a·v_a)),
// avec ρ ∝ 1/épaisseur (tranches de même masse) et v ∝ √T.
function _tfMolPassage(a, b) {
  var r = ((tf.z[a + 1] - tf.z[a]) / (tf.z[b + 1] - tf.z[b]))
        * Math.sqrt(tfTTranche(b) / tfTTranche(a));
  return r >= 1 ? 1 : r;
}

// Altitude (m) d'une molécule, pour le dessin
function tfMolZ(m) {
  return tf.z[m.j] + m.s * (tf.z[m.j + 1] - tf.z[m.j]);
}
