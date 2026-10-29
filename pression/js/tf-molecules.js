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
//  modèle. Pour l'affichage, les tranches sont regroupées en TF_BANDES
//  bandes de même masse ; chaque bande est une petite boîte de gaz :
//    - ses molécules volent en ligne droite et rebondissent sur les parois,
//      le fond, le piston et les LIMITES DE LEUR BANDE, qu'elles ne
//      franchissent jamais : le haut et le bas ne se mélangent pas ;
//    - les limites de bande suivent le gaz : une bande comprimée s'aplatit et
//      ses molécules se serrent (densité juste par construction), un front
//      de compression se voit comme des bandes écrasées l'une après l'autre ;
//    - vitesse ∝ √T moyenne de la bande (couleur selon T dans tf-scene.js).
//  Versions abandonnées : vols libres d'une paroi à l'autre (tout se
//  mélangeait), libre parcours court (onde noyée dans le bruit), molécules
//  ancrées qui frémissaient (~1 px : un gaz figé, agitation invisible).
// ══════════════════════════════════════════════════════════════════════

'use strict';

var TF_BANDES          = 10;                    // bandes affichées
var TF_TR_PAR_BANDE    = TF_N / TF_BANDES;      // tranches par bande (3)
var TF_MOL_PAR_BANDE   = 60;                    // 600 molécules
// Vitesse affichée à T0 (m/s, échelle verticale du dessin) : une bande au
// repos (~3 cm) est traversée en ~0,25 s. Les vraies vitesses (~500 m/s)
// sont invisibles : on garde le rapport √T.
var TF_MOL_VITESSE     = 0.12;
var TF_MOL_RAYON       = 0.0055;                // fraction de la largeur dessinée

var tfMol = [];   // { b, zr, x, ux, uz } : bande, position relative dans la
                  // bande (0 → 1), abscisse (fraction de la largeur),
                  // direction unitaire du vol

// Limites d'une bande (m)
function tfBandeBas(b)  { return tf.z[b * TF_TR_PAR_BANDE]; }
function tfBandeHaut(b) { return tf.z[(b + 1) * TF_TR_PAR_BANDE]; }

// Température moyenne d'une bande (tranches de même masse)
function tfTBande(b) {
  var s = 0;
  for (var k = 0; k < TF_TR_PAR_BANDE; k++) s += tfTTranche(b * TF_TR_PAR_BANDE + k);
  return s / TF_TR_PAR_BANDE;
}

// Même nombre de molécules par bande, positions et directions au hasard
function tfMolInit() {
  tfMol = [];
  for (var b = 0; b < TF_BANDES; b++) {
    for (var k = 0; k < TF_MOL_PAR_BANDE; k++) {
      var a = Math.random() * 2 * Math.PI;
      tfMol.push({ b: b, zr: Math.random(), x: Math.random(),
                   ux: Math.cos(a), uz: Math.sin(a) });
    }
  }
}

// Avance les molécules de dt secondes (temps d'affichage).
// largeur : largeur intérieure dessinée, en m d'échelle verticale (le
// cylindre est élargi sur le dessin : c'est la largeur VUE qui compte pour
// que l'agitation paraisse isotrope).
function tfMolAvancer(dt, largeur, rayonFrac) {
  if (dt <= 0 || largeur <= 0) return;
  var xMin = rayonFrac, xMax = 1 - rayonFrac;
  var vit = [];
  for (var b = 0; b < TF_BANDES; b++) {
    vit[b] = TF_MOL_VITESSE * Math.sqrt(Math.max(tfTBande(b), 1) / TF_T0);
  }

  for (var i = 0; i < tfMol.length; i++) {
    var m = tfMol[i];
    var d = vit[m.b] * dt;

    // Horizontal : rebonds sur les parois
    m.x += m.ux * d / largeur;
    if (m.x < xMin) { m.x = 2 * xMin - m.x; m.ux = Math.abs(m.ux); }
    if (m.x > xMax) { m.x = 2 * xMax - m.x; m.ux = -Math.abs(m.ux); }
    if (m.x < xMin || m.x > xMax) m.x = 0.5;   // pas aberrant

    // Vertical : rebonds sur les limites de la bande (fond et piston pour
    // les bandes extrêmes), en position relative pour suivre le gaz
    var h = tfBandeHaut(m.b) - tfBandeBas(m.b);
    if (h <= 0) continue;
    m.zr += m.uz * d / h;
    var garde = 0;
    while ((m.zr < 0 || m.zr > 1) && garde++ < 8) {
      if (m.zr > 1) { m.zr = 2 - m.zr; m.uz = -Math.abs(m.uz); }
      if (m.zr < 0) { m.zr = -m.zr;    m.uz =  Math.abs(m.uz); }
    }
    if (m.zr < 0 || m.zr > 1) m.zr = 0.5;
  }
}

// Altitude (m) d'une molécule, pour le dessin
function tfMolZ(m) {
  var z0 = tfBandeBas(m.b);
  return z0 + m.zr * (tfBandeHaut(m.b) - z0);
}
