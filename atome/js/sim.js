'use strict';
// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

/* ══════════════════════════════════════════════════
   SIM.JS — Données des éléments + état global
   (chargé en premier — cf. index.html)
══════════════════════════════════════════════════ */

/* ── Les 18 premiers éléments (3 premières lignes du tableau périodique).
      A : nombre de nucléons de l'isotope le plus abondant.
      art : article devant le nom ("d'" ou "de ") pour les légendes. ── */
var ELEMENTS = [
  { Z:  1, sym: 'H',  nom: 'Hydrogène',  art: 'd’', A:  1 },
  { Z:  2, sym: 'He', nom: 'Hélium',     art: 'd’', A:  4 },
  { Z:  3, sym: 'Li', nom: 'Lithium',    art: 'de ',     A:  7 },
  { Z:  4, sym: 'Be', nom: 'Béryllium',  art: 'de ',     A:  9 },
  { Z:  5, sym: 'B',  nom: 'Bore',       art: 'de ',     A: 11 },
  { Z:  6, sym: 'C',  nom: 'Carbone',    art: 'de ',     A: 12 },
  { Z:  7, sym: 'N',  nom: 'Azote',      art: 'd’', A: 14 },
  { Z:  8, sym: 'O',  nom: 'Oxygène',    art: 'd’', A: 16 },
  { Z:  9, sym: 'F',  nom: 'Fluor',      art: 'de ',     A: 19 },
  { Z: 10, sym: 'Ne', nom: 'Néon',       art: 'de ',     A: 20 },
  { Z: 11, sym: 'Na', nom: 'Sodium',     art: 'de ',     A: 23 },
  { Z: 12, sym: 'Mg', nom: 'Magnésium',  art: 'de ',     A: 24 },
  { Z: 13, sym: 'Al', nom: 'Aluminium',  art: 'd’', A: 27 },
  { Z: 14, sym: 'Si', nom: 'Silicium',   art: 'de ',     A: 28 },
  { Z: 15, sym: 'P',  nom: 'Phosphore',  art: 'de ',     A: 31 },
  { Z: 16, sym: 'S',  nom: 'Soufre',     art: 'de ',     A: 32 },
  { Z: 17, sym: 'Cl', nom: 'Chlore',     art: 'de ',     A: 35 },
  { Z: 18, sym: 'Ar', nom: 'Argon',      art: 'd’', A: 40 }
];

/* ── Sous-couches dans l'ordre de remplissage (portée du programme
      de Seconde : jusqu'à 3p, soit Z = 18). Une couleur par sous-couche,
      reprise partout (cercles, étiquettes, configuration écrite). ── */
var SUBSHELLS = [
  { id: '1s', n: 1, l: 's', cap: 2, color: '#2a6aaa' },  /* bleu           */
  { id: '2s', n: 2, l: 's', cap: 2, color: '#2a8a50' },  /* vert foncé     */
  { id: '2p', n: 2, l: 'p', cap: 6, color: '#7aa832' },  /* vert olive     */
  { id: '3s', n: 3, l: 's', cap: 2, color: '#8e44ad' },  /* violet         */
  { id: '3p', n: 3, l: 'p', cap: 6, color: '#c05fa8' }   /* rose           */
];

/* ── Accès aux données ─────────────────────────── */
function getElement(Z) { return ELEMENTS[Z - 1]; }

/* Gaz nobles de la page (couches externes saturées) — mis en gras dans le
   sélecteur de comparaison du panneau. */
var GAZ_NOBLES = [2, 10, 18];
function estGazNoble(Z) { return GAZ_NOBLES.indexOf(Z) !== -1; }

/* Configuration électronique : liste des sous-couches occupées,
   dans l'ordre de remplissage → [{ sub, count }] */
function getConfig(Z) {
  var reste = Z, out = [];
  for (var i = 0; i < SUBSHELLS.length && reste > 0; i++) {
    var c = Math.min(reste, SUBSHELLS[i].cap);
    out.push({ sub: SUBSHELLS[i], count: c });
    reste -= c;
  }
  return out;
}

/* Période (ligne du tableau) d'un élément */
function getPeriode(Z) { return Z <= 2 ? 1 : (Z <= 10 ? 2 : 3); }

/* n maximal des sous-couches affichables quand on montre les sous-couches
   vides : celles de la période suivante, sans dépasser n = 3 (portée de la
   page). Ex. : O (période 2) → on montre aussi 3s et 3p vides. */
function getMaxNAffiche(Z) { return Math.min(3, getPeriode(Z) + 1); }

/* ── État global ───────────────────────────────── */
var state = {
  Z: 8,               /* élément sélectionné (oxygène par défaut)      */
  showEmpty: false,   /* afficher les sous-couches vides suivantes     */
  showLegend: true,   /* afficher la légende sur la zone d'animation   */
  eclate: false,      /* vue éclatée du noyau (cadre de comptage)      */
  charge: false,      /* vue éclatée protons/électrons (charge)        */
  compare: false,     /* zone de schéma coupée en deux (comparaison)   */
  Zcmp: 18            /* élément comparé (argon par défaut)            */
};
