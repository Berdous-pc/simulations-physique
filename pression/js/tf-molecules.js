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
//    - vitesse ∝ √T, et couleur selon T, de la TRANCHE où se trouve la
//      molécule (interpolée entre centres de tranches) et non de la moyenne
//      de sa bande : un front, épais de quelques tranches, tombe à
//      l'intérieur d'une bande et serait lissé par la moyenne.
//  Le confinement par bande donne la densité, la tranche locale l'agitation.
//
//  Vitesse d'agitation : conventionnelle (lisible) à tous les crans, sauf au
//  plus lent (×1/5000), où les vraies vitesses (~500 m/s) tombent à
//  l'échelle du dessin : elles y sont tirées du temps simulé, à l'échelle
//  réelle, comme la dérive du gaz.
//  Versions abandonnées : vols libres d'une paroi à l'autre (tout se
//  mélangeait), libre parcours court (onde noyée dans le bruit), molécules
//  ancrées qui frémissaient (~1 px : un gaz figé, agitation invisible).
// ══════════════════════════════════════════════════════════════════════

'use strict';

var TF_BANDES          = 10;                    // bandes affichées
var TF_TR_PAR_BANDE    = TF_N / TF_BANDES;      // tranches par bande (8)
var TF_MOL_PAR_BANDE   = 60;                    // 600 molécules
// Vitesse affichée à T0 (m/s, échelle verticale du dessin) aux crans
// conventionnels : une bande au repos (~3 cm) est traversée en ~0,25 s.
var TF_MOL_VITESSE     = 0.12;
var TF_MOL_RAYON       = 0.0055;                // fraction de la largeur dessinée

// Éclats de chocs sur les parois, le fond et le piston (option) : durée de
// vie en s d'affichage, nombre maximal à l'écran
var TF_CHOC_VIE = 0.15;
var TF_CHOC_MAX = 400;

var tfMol = [];   // { b, zr, x, ux, uz } : bande, position relative dans la
                  // bande (0 → 1), abscisse (fraction de la largeur),
                  // direction unitaire du vol
var tfChocs = []; // { x, z, cote, age } : point d'impact (fraction de la
                  // largeur, m), paroi touchée ('g', 'd', 'fond', 'piston')

// Agitation à l'échelle réelle : au cran le plus lent seulement
function tfMolReel() { return tf.vitesse <= TF_VITESSES[0]; }

// Limites d'une bande (m)
function tfBandeBas(b)  { return tf.z[b * TF_TR_PAR_BANDE]; }
function tfBandeHaut(b) { return tf.z[(b + 1) * TF_TR_PAR_BANDE]; }

// Altitude (m) d'une molécule
function tfMolZ(m) {
  var z0 = tfBandeBas(m.b);
  return z0 + m.zr * (tfBandeHaut(m.b) - z0);
}

// Température du gaz à l'altitude d'une molécule (K) : tranche qui la
// contient (cherchée dans sa bande), interpolée linéairement entre les
// centres de cette tranche et de sa voisine
function tfMolT(m) {
  var z = tfMolZ(m), zz = tf.z;
  var j = m.b * TF_TR_PAR_BANDE, jFin = j + TF_TR_PAR_BANDE - 1;
  while (j < jFin && zz[j + 1] < z) j++;
  var c = 0.5 * (zz[j] + zz[j + 1]);
  var k = z > c ? j + 1 : j - 1;
  if (k < 0 || k >= TF_N) return tfTTranche(j);
  var ck = 0.5 * (zz[k] + zz[k + 1]);
  var a = (z - c) / (ck - c);
  return tfTTranche(j) + a * (tfTTranche(k) - tfTTranche(j));
}

// Même nombre de molécules par bande, positions et directions au hasard
function tfMolInit() {
  tfMol = [];
  tfChocs = [];
  for (var b = 0; b < TF_BANDES; b++) {
    for (var k = 0; k < TF_MOL_PAR_BANDE; k++) {
      var a = Math.random() * 2 * Math.PI;
      tfMol.push({ b: b, zr: Math.random(), x: Math.random(),
                   ux: Math.cos(a), uz: Math.sin(a) });
    }
  }
}

function _tfChoc(x, z, cote) {
  if (tfChocs.length < TF_CHOC_MAX) tfChocs.push({ x: x, z: z, cote: cote, age: 0 });
}

// Avance les molécules. dtReel : durée réelle de l'image (s), qui fait
// vieillir les éclats ; dtAff : la même, freinée au ralenti par l'appelant
// (agitation conventionnelle) ; dtSim : temps simulé de l'image (agitation à
// l'échelle réelle). largeur : largeur intérieure dessinée, en m d'échelle
// verticale (le cylindre est élargi sur le dessin : c'est la largeur VUE qui
// compte pour que l'agitation paraisse isotrope). chocs : relever les
// impacts sur les parois.
function tfMolAvancer(dtReel, dtAff, dtSim, largeur, rayonFrac, chocs) {
  if (dtAff <= 0 || largeur <= 0) return;
  var xMin = rayonFrac, xMax = 1 - rayonFrac;
  // Distance parcourue à T : d = k·√T
  var reel = tfMolReel();
  var k = reel ? Math.sqrt(3 * TF_R / TF_M_AIR) * dtSim
               : TF_MOL_VITESSE / Math.sqrt(TF_T0) * dtAff;

  for (var i = 0; i < tfChocs.length; i++) tfChocs[i].age += dtReel;
  while (tfChocs.length && tfChocs[0].age > TF_CHOC_VIE) tfChocs.shift();

  var bHaut = TF_BANDES - 1;
  for (i = 0; i < tfMol.length; i++) {
    var m = tfMol[i];
    var d = k * Math.sqrt(Math.max(tfMolT(m), 1));

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
