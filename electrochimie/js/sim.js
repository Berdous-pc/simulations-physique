// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  sim.js — Données chimiques et état global
//  Chargé en PREMIER. Aucune dépendance.
//  La table METAUX est commune aux deux onglets : l'onglet Pile et
//  électrolyse réutilisera les mêmes couples (potentiels, couleurs, noms).
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ══════════════════════════════════════════════════════════════════════
//  Couples Mⁿ⁺/M
//  E0       : potentiel standard (V), sert uniquement à décider du sens
//             spontané (le programme de Première ne l'affiche pas).
//  charge   : charge n de l'ion Mⁿ⁺.
//  atome    : couleur de l'atome (métal), dans la loupe et la lame.
//  ion      : couleur de l'ion dans la loupe (teinte distincte par élément,
//             y compris pour les ions incolores en solution).
//  solution : progression de la couleur de la solution, de la plus diluée
//             à la concentration initiale (teintes des colorStops de la
//             page Dissolution, dissolution/js/diss-data.js ; bleu de Cu²⁺
//             revu pour être réaliste) ;
//             null = incolore (seuls Cu²⁺ et Fe²⁺ colorent la solution).
//  anion    : ion spectateur de la solution usuelle. Nitrate pour Ag⁺ et
//             Pb²⁺ (leurs sulfates sont peu solubles), sulfate sinon.
//  depot    : aspect du dépôt sur la lame (cf. becher.js).
// ══════════════════════════════════════════════════════════════════════

var METAUX = {
  Mg: { sym: 'Mg', nom: 'magnésium', de: 'de magnésium', le: 'le magnésium', du: 'du magnésium', charge: 2, E0: -2.37,
        atome: '#c9ccd1', ion: '#b49ad6', solution: null,
        nomIon: 'ions magnésium', nomSolution: 'sulfate de magnésium', anion: 'SO4',
        depot: 'gris' },
  Al: { sym: 'Al', nom: 'aluminium', de: 'd’aluminium', le: 'l’aluminium', du: 'de l’aluminium', charge: 3, E0: -1.66,
        atome: '#d8dce1', ion: '#e3a9c0', solution: null,
        nomIon: 'ions aluminium', nomSolution: 'sulfate d’aluminium', anion: 'SO4',
        depot: 'gris' },
  Zn: { sym: 'Zn', nom: 'zinc', de: 'de zinc', le: 'le zinc', du: 'du zinc', charge: 2, E0: -0.76,
        atome: '#9aa6b3', ion: '#8fc7b6', solution: null,
        nomIon: 'ions zinc', nomSolution: 'sulfate de zinc', anion: 'SO4',
        depot: 'gris' },
  Fe: { sym: 'Fe', nom: 'fer', de: 'de fer', le: 'le fer', du: 'du fer', charge: 2, E0: -0.44,
        atome: '#77716b', ion: '#93c060', solution: ['#e4f4d6', '#a4d488', '#5a9c40'],
        nomIon: 'ions fer(II)', nomSolution: 'sulfate de fer(II)', anion: 'SO4',
        depot: 'noir' },
  Pb: { sym: 'Pb', nom: 'plomb', de: 'de plomb', le: 'le plomb', du: 'du plomb', charge: 2, E0: -0.13,
        atome: '#626977', ion: '#d2b37e', solution: null,
        nomIon: 'ions plomb(II)', nomSolution: 'nitrate de plomb(II)', anion: 'NO3',
        depot: 'aiguilles' },
  Cu: { sym: 'Cu', nom: 'cuivre', de: 'de cuivre', le: 'le cuivre', du: 'du cuivre', charge: 2, E0: 0.34,
        // Bleu azur vif, légèrement turquoise, d'une vraie solution de
        // sulfate de cuivre (Cu²⁺ absorbe le rouge-orangé : il transmet le
        // bleu et un peu de vert), du plus dilué au plus concentré. Le bleu
        // de Dissolution ('#00d0ff' → '#0059ff') finissait trop violacé.
        atome: '#c26a32', ion: '#3a80d4', solution: ['#a6e3fb', '#33bdf2', '#0096e2'],
        nomIon: 'ions cuivre(II)', nomSolution: 'sulfate de cuivre(II)', anion: 'SO4',
        depot: 'eponge' },
  Ag: { sym: 'Ag', nom: 'argent', de: 'd’argent', le: 'l’argent', du: 'de l’argent', charge: 1, E0: 0.80,
        atome: '#c7ccd2', ion: '#dcc25e', solution: null,
        nomIon: 'ions argent', nomSolution: 'nitrate d’argent', anion: 'NO3',
        depot: 'aiguilles' }
};

// Ordre d'affichage dans les listes : du réducteur le plus fort au plus faible
var ORDRE_METAUX = ['Mg', 'Al', 'Zn', 'Fe', 'Pb', 'Cu', 'Ag'];

// Ions spectateurs (anions)
var ANIONS = {
  SO4: { formule: 'SO₄', html: 'SO<sub>4</sub>', charge: 2, couleur: '#8d9aa6' },
  NO3: { formule: 'NO₃', html: 'NO<sub>3</sub>', charge: 1, couleur: '#a3a08f' }
};

// ══════════════════════════════════════════════════════════════════════
//  Utilitaires d'écriture chimique
// ══════════════════════════════════════════════════════════════════════

// Exposant de charge en caractères Unicode (pour le canvas) : 1 → ⁺, 2 → ²⁺
var _EXPOSANTS = { 1: '', 2: '²', 3: '³' };
function exposantCharge(n, signe) {
  return _EXPOSANTS[n] + (signe < 0 ? '⁻' : '⁺');
}

// Ion métallique en texte Unicode (canvas) : 'Cu' → « Cu²⁺ »
function ionTexte(sym) {
  return sym + exposantCharge(METAUX[sym].charge, +1);
}

// Ion métallique en HTML (panneau, équations) : 'Cu' → Cu<sup>2+</sup>
function ionHTML(sym) {
  var n = METAUX[sym].charge;
  return sym + '<sup>' + (n > 1 ? n : '') + '+</sup>';
}

// Anion en texte Unicode et en HTML
function anionTexte(cle) {
  var a = ANIONS[cle];
  return a.formule + exposantCharge(a.charge, -1);
}
function anionHTML(cle) {
  var a = ANIONS[cle];
  return a.html + '<sup>' + (a.charge > 1 ? a.charge : '') + '−</sup>';
}

// ══════════════════════════════════════════════════════════════════════
//  Réactivité
// ══════════════════════════════════════════════════════════════════════

// Une lame de métal `metal` réagit-elle avec les ions de `ion` ?
// Oui si l'oxydant (ion) est plus fort que l'oxydant conjugué du métal,
// c'est-à-dire si son potentiel standard est plus élevé.
function reactionPossible(metal, ion) {
  return metal !== ion && METAUX[ion].E0 > METAUX[metal].E0;
}

// Combinaison écartée : Mg dans Al³⁺. Le potentiel l'autoriserait, mais en
// solution aqueuse le magnésium attaque surtout l'eau (H₂) et l'aluminium
// ne se dépose pas : le dépôt montré serait faux.
function combinaisonExclue(metal, ion) {
  return metal === 'Mg' && ion === 'Al';
}

function _pgcd(a, b) { return b === 0 ? a : _pgcd(b, a % b); }

// Coefficients de l'équation : nombre d'électrons échangés = PPCM des
// charges ; le métal (charge b) est multiplié par N/b, l'oxydant (charge a)
// par N/a. Ex. Cu + 2 Ag⁺ : N = 2, coefMetal = 1, coefIon = 2.
function stoechiometrie(metal, ion) {
  var b = METAUX[metal].charge;
  var a = METAUX[ion].charge;
  var N = a * b / _pgcd(a, b);
  return { electrons: N, coefMetal: N / b, coefIon: N / a };
}

// ══════════════════════════════════════════════════════════════════════
//  État global
// ══════════════════════════════════════════════════════════════════════

var sim = {
  onglet: 'oxydoreduction',

  // ── Onglet Oxydoréduction ──
  metal:    'Zn',        // lame plongée
  solution: 'Cu',        // ion métallique de la solution (l'oxydant)

  paused: false,
  speedFactor: 1,

  showEquations:   false,
  showElectrons:   false,
  showSpectateurs: false,
  showTemoin:      true,     // tube témoin de la solution initiale

  needsRedraw: true
};

// ── Générateur pseudo-aléatoire reproductible ─────────────────────────
// Utilisé pour l'aspect de la lame (taches du dépôt, aiguilles) : à chaque
// RAZ le même dessin, et il ne « clignote » pas d'une image à l'autre.
function creerAlea(graine) {
  var s = graine >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Couleurs ──────────────────────────────────────────────────────────
// Conversion '#rrggbb' ou 'rgb(r,g,b)' → [r, g, b]
function couleurRGB(c) {
  if (c[0] === '#') {
    return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)];
  }
  var m = c.match(/\d+/g);
  return [+m[0], +m[1], +m[2]];
}

// Mélange linéaire de deux couleurs [r,g,b] (t = 0 → a, t = 1 → b)
function melange(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Couleur le long d'une suite de teintes (2 ou plus), t ∈ [0, 1] couvrant
// la suite à parts égales (même principe que _multiLerpHex de Dissolution)
function couleurSuite(stops, t) {
  if (stops.length === 1) return couleurRGB(stops[0]);
  var seg = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  var i = Math.min(Math.floor(seg), stops.length - 2);
  return melange(couleurRGB(stops[i]), couleurRGB(stops[i + 1]), seg - i);
}

function rgbCss(c, alpha) {
  var r = Math.round(c[0]), g = Math.round(c[1]), b = Math.round(c[2]);
  return alpha === undefined ? 'rgb(' + r + ',' + g + ',' + b + ')'
                             : 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

// Éclaircit (t > 0) ou assombrit (t < 0) une couleur
function nuance(c, t) {
  return t >= 0 ? melange(c, [255, 255, 255], t) : melange(c, [0, 0, 0], -t);
}

// ── Texte dans un repère mis à l'échelle ──────────────────────────────
// La scène et la loupe sont dessinées en unités logiques (ctx.scale) : une
// police de « 0,3px » agrandie par la transformation est arrondie, voire
// ignorée, par certains navigateurs. On repasse donc en pixels le temps
// d'écrire. `echelle` = nombre de px par unité du repère courant.
function texteEchelle(ctx, txt, x, y, taille, poids, echelle) {
  ctx.save();
  ctx.scale(1 / echelle, 1 / echelle);
  ctx.font = poids + ' ' + (taille * echelle).toFixed(2) + 'px "Segoe UI", Arial, sans-serif';
  ctx.fillText(txt, x * echelle, y * echelle);
  ctx.restore();
}
