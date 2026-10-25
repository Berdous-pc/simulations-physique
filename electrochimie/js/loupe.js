// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  loupe.js — Onglet Oxydoréduction : modèle microscopique scénarisé
//  Dépend de sim.js et becher.js (disposition, position de la lame).
//
//  La loupe grossit la surface de la lame plongée. Elle déroule un CYCLE
//  toujours identique, pour que l'élève sache où regarder :
//
//    1. approche    : l'ion oxydant (Cu²⁺), mis en avant, arrive par le
//                     haut à droite et vient se coller contre la lame (Zn)
//                     ou contre un grain du dépôt (Cu) ;
//    2. contact     : l'ion et l'atome qui va s'oxyder sont signalés ;
//    3. transfert   : les électrons (visibles sur option) vont de l'atome
//                     à l'ion à travers le métal : en ligne droite s'il le
//                     touche, sinon par la lame puis d'atome en atome dans
//                     le dépôt (lame et dépôt sont conducteurs) ;
//    4. transformation : Cu²⁺ devient Cu, Zn devient Zn²⁺, sur place ;
//    5. départ      : Zn²⁺ quitte la lame en glissant derrière le dépôt
//                     (la scène est la projection d'un volume), puis part
//                     en diagonale vers le bas à droite ; l'atome Cu reste
//                     là où l'ion s'est collé (dépôt hors grille).
//
//  Un cycle correspond à l'équation de la réaction. Les ions se posent
//  sur des SITES tirés au hasard parmi les places libres de la surface
//  métallique : contre la lame (nouveau grain) ou contre le dépôt (le
//  grain grossit), sans préférence ; les ions d'un même cycle restent
//  limitrophes (ou entourent une excroissance). Les atomes de la lame les
//  plus proches des ions s'oxydent. Le dépôt, poreux, laisse les ions
//  passer derrière lui pour atteindre la lame.
//
//  Le dépôt pousse ainsi en GRUMEAUX. La lame se ronge de façon
//  irrégulière (creux bornés en profondeur). Un amas tient tant qu'il touche un atome de la lame :
//  quand ceux qui le retenaient se sont oxydés, il est DÉCHAUSSÉ ; trop
//  lourd pour ses accroches, il casse et son morceau externe part. Il
//  tombe alors dans le liquide (vitesse limite, légère dérive, rotation
//  lente) jusqu'à sortir par le bas de la loupe. Quand la couche externe
//  est entièrement rongée, la vue suit la lame.
//
//  Le cycle suivant commence dès le départ du précédent : au plus deux
//  cycles visibles, légèrement décalés. Sans transformation possible,
//  l'ion touche la lame puis repart sans échange. Quelques ions estompés
//  flottent en fond pour rappeler la solution.
//
//  Coordonnées : en « cases » (côté d'un atome), origine au coin haut
//  gauche du carré circonscrit à la loupe. Réseau de la lame
//  `loupe.grille[r][c]` : '' vide, 'M' atome de la lame, 'O' atome engagé
//  dans un cycle. Le dépôt n'est pas sur la grille : `loupe.depots` garde
//  la position exacte de chaque atome déposé.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Géométrie (en cases) ──────────────────────────────────────────────
var NR = 11, NC = 11;            // lignes, colonnes du réseau
var RC = 5.5;                    // rayon de la loupe
var CU = 5.5, CV = 5.5;          // centre de la loupe
var COL_INIT = 4;                // colonnes de métal au départ
var U_COULOIR = 7.7;             // abscisse du couloir libre longé par les ions
var U_MAX_DEPOT = U_COULOIR - 1.4; // le dépôt ne pousse pas jusqu'au couloir

// ── Tailles des particules (en cases) ─────────────────────────────────
// L'ion métallique est plus petit que l'atome (il a perdu ses électrons
// les plus externes) : différence volontairement visible.
var R_ATOME = 0.47, R_ION = 0.37, R_ANION = 0.36, R_ELECTRON = 0.17;
var DIST_CONTACT = R_ATOME + R_ION;   // ion collé contre un atome
var ESPACE_IONS = 0.9;                // écart vertical entre ions côte à côte

// ── Ions de fond (estompés, ne participent pas aux cycles) ────────────
// Leur nombre suit l'avancement macroscopique (macro.avancement) : au
// départ, N_FOND_OX ions oxydants et aucun ion du métal (la lame n'a pas
// encore réagi) ; les ions oxydants disparaissent peu à peu, les ions du
// métal apparaissent dans le rapport stœchiométrique (Cu + 2 Ag⁺ : 8 Ag⁺
// au départ, 4 Cu²⁺ à la fin). Les anions spectateurs restent en nombre
// constant.
var N_FOND_OX = 8, N_FOND_ANION = 6;
var ALPHA_FOND = 0.42;
var D_FONDU = 0.9;               // apparition / disparition d'un ion de fond (s)
var GAMMA = 1.0, SIGMA = 1.2;    // mouvement brownien lent (Ornstein-Uhlenbeck)

// ── Durées des étapes (s de temps simulé, donc soumises à la vitesse) ──
var D_ARRIVEE   = 1.0;           // lame qui vient d'être plongée
var D_APPROCHE  = 2.4;
var D_DECALAGE  = 0.45;          // entre deux ions d'un même cycle
var D_CONTACT   = 0.8;
var D_TRANSFERT = 0.4;
var D_TRANSFO   = 1.0;           // réduction de l'ion, après l'arrivée des électrons
var D_OXYDATION = 0.4;           // atome → ion, dès que ses électrons l'ont quitté
var D_DEPART    = 2.6;           // trajet de l'ion formé jusqu'au bord
var D_REBOND    = 2.6;

// ── Relief de la surface et dépôt en îlots ────────────────────────────
// Une zone peut puiser jusqu'à TOL_RUGO couches sous la couche la plus
// externe : la surface se creuse un peu par endroits (creux bornés, pour
// que toute la couche externe finisse rongée et que la vue suive la lame).
var TOL_RUGO = 2;
// Le dépôt croît sur lui-même : l'ion oxydant peut se réduire contre un
// atome du dépôt, les électrons venant d'un atome de la lame à travers
// le métal (lame et dépôt sont conducteurs). Le dépôt pousse ainsi en
// grumeaux ; à partir de TAILLE_ILOT_MAX atomes, un amas peut casser.
var TAILLE_ILOT_MAX = 6;
var D_GROUPE = 1.35;             // ions d'un même cycle : limitrophes
var D_SITE_DEPOT = 2 * R_ATOME - 0.04;   // ion posé contre un atome du dépôt
var D_VOISINS = 2 * R_ATOME + 0.15;      // deux atomes du dépôt soudés
var D_PROCHE_DEPOT = 2 * R_ATOME - 0.06; // ion au plus près du dépôt (il deviendra atome)
var V_ELECTRON = 6;              // vitesse des électrons dans le métal (cases/s)

// ── Détachement par déchaussement ─────────────────────────────────────
// Un amas du dépôt tient tant qu'un de ses atomes touche (à ANCRAGE près)
// un atome de la lame. Quand les atomes de la lame qui le retenaient se
// sont oxydés, il se détache et tombe dans la solution.
var ANCRAGE = 1.4;               // distance de centre à centre
var N_POINT_UNIQUE = 3;          // amas tenu par un seul point : casse dès ce nombre d'atomes
var RAPPORT_POIDS = 2.5;         // atomes par accroche au-delà desquels l'amas casse
var TAILLE_MORCEAU = 4;          // atomes au plus dans le morceau qui casse
var D_ENTRE_CASSES = 1.5;        // délai minimal entre deux cassures (s)

// ── Chute d'un amas dans le liquide ───────────────────────────────────
// Frottement visqueux : la vitesse atteint vite une valeur limite ; légère
// dérive latérale et rotation lente de l'amas, qui reste soudé.
var V_LIM_CHUTE = 2.0;           // vitesse limite (cases/s)
var TAU_CHUTE = 0.3;             // temps de mise en vitesse (s)
var D_DECOLLE = 0.15;            // décollement de la lame avant la chute (s)

// Couleurs des rôles (mêmes teintes que les demi-équations du bloc HTML)
var COUL_OX  = [176, 64, 32];    // oxydation : atome de la lame qui perd des électrons
var COUL_RED = [42, 106, 170];   // réduction : ion oxydant qui en gagne

// ══════════════════════════════════════════════════════════════════════
//  État
// ══════════════════════════════════════════════════════════════════════

var loupe = {
  grille: [],
  depots: [],          // atomes déposés, hors grille : { u, v } (coordonnées du réseau)
  fond: [],            // ions estompés : { u, v, vu, vv, type, sym, r, vis, etat }
                       //   vis : visibilité 0 → 1 ; etat : '' | 'entre' | 'sort'
  cycles: [],
  chutes: [],          // amas détachés qui tombent (coordonnées de la loupe) :
                       //   { atomes: [{du, dv}], u, v, vu, vv, ang, om, phi, t, sym }
  fantomes: [],        // ions d'un cycle interrompu, qui s'effacent
  offX: 0, offY: -NR - 2,
  presente: false,     // réseau visible (lame dans le bécher)
  enPlace: false,      // lame plongée à sa place : les cycles peuvent tourner
  tArrivee: 0,
  tCasse: 0            // délai avant la prochaine cassure d'amas
};

function _gauss() {
  var u = 1 - Math.random(), v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function _lisse(s) { s = Math.max(0, Math.min(1, s)); return s * s * (3 - 2 * s); }

function resetLoupe() {
  var r, c, i;
  loupe.grille = [];
  for (r = 0; r < NR; r++) {
    var ligne = [];
    for (c = 0; c < NC; c++) ligne.push(c < COL_INIT ? 'M' : '');
    loupe.grille.push(ligne);
  }
  loupe.depots = [];
  loupe.fond = [];
  loupe.cycles = [];
  loupe.chutes = [];
  loupe.tCasse = 0;
  loupe.fantomes = [];
  loupe.offX = 0;
  loupe.offY = -NR - 2;
  loupe.presente = false;
  loupe.enPlace = false;
  loupe.tArrivee = D_ARRIVEE;

  // Aucun ion du métal au départ : ils n'apparaissent qu'avec la réaction
  for (i = 0; i < N_FOND_OX; i++) _ajouterFond('ox', sim.solution, R_ION, 1);
  for (i = 0; i < N_FOND_ANION; i++) _ajouterFond('anion', METAUX[sim.solution].anion, R_ANION, 1);
}

function _ajouterFond(type, sym, r, vis) {
  var pos = _positionLibre(r);
  var f = { u: pos.u, v: pos.v, vu: _gauss() * 0.5, vv: _gauss() * 0.5,
            type: type, sym: sym, r: r, vis: vis, etat: vis < 1 ? 'entre' : '' };
  loupe.fond.push(f);
  return f;
}

// ── Nombre d'ions de fond imposé par l'avancement ─────────────────────
function _ciblesFond() {
  var p = macro.avancement, prod = 0;
  if (reactionPossible(sim.metal, sim.solution)) {
    var st = stoechiometrie(sim.metal, sim.solution);
    prod = Math.round(N_FOND_OX * p * st.coefMetal / st.coefIon);
  }
  return { ox: Math.round(N_FOND_OX * (1 - p)), prod: prod };
}

// Ions de fond d'un type, sans compter ceux qui disparaissent
function _compterFond(type) {
  var n = 0;
  for (var i = 0; i < loupe.fond.length; i++) {
    if (loupe.fond[i].type === type && loupe.fond[i].etat !== 'sort') n++;
  }
  return n;
}

// Ions formés en route vers le fond (phase de départ d'un cycle)
function _prodEnRoute() {
  var n = 0;
  for (var i = 0; i < loupe.cycles.length; i++) {
    var cy = loupe.cycles[i];
    if (cy.phase !== 'depart') continue;
    for (var k = 0; k < cy.atomes.length; k++) if (cy.atomes[k].garder) n++;
  }
  return n;
}

// Ajuste la population du fond à l'avancement : un ion oxydant consommé
// s'efface (le plus proche de la lame d'abord) ; un ion du métal formé
// vient en général d'un cycle (il reste dans la solution au lieu de
// sortir de la loupe, cf. phase 'transfo'), sinon il apparaît en fondu.
function _majPopulation(dt) {
  var cible = _ciblesFond(), i, f;
  var nOx = _compterFond('ox');
  while (nOx > cible.ox) {
    var choisi = null;
    for (i = 0; i < loupe.fond.length; i++) {
      f = loupe.fond[i];
      if (f.type === 'ox' && f.etat !== 'sort' && (!choisi || f.u < choisi.u)) choisi = f;
    }
    if (!choisi) break;
    choisi.etat = 'sort';
    nOx--;
  }
  // Les cycles fournissent l'essentiel des ions formés ; complément en
  // fondu si la loupe ne tourne pas (lame à peine plongée) ou prend du retard
  var nProd = _compterFond('prod') + _prodEnRoute();
  var retard = loupe.enPlace ? 2 : 1;
  if (cible.prod - nProd >= retard) _ajouterFond('prod', sim.metal, R_ION, 0);

  for (i = loupe.fond.length - 1; i >= 0; i--) {
    f = loupe.fond[i];
    if (f.etat === 'entre') {
      f.vis = Math.min(1, f.vis + dt / D_FONDU);
      if (f.vis >= 1) f.etat = '';
    } else if (f.etat === 'sort') {
      f.vis -= dt / D_FONDU;
      if (f.vis <= 0) loupe.fond.splice(i, 1);
    }
  }
}

// Un ion formé par un cycle rejoint les ions de fond, là où il est arrivé
function _versFond(at) {
  loupe.fond.push({ u: at.u, v: at.v, vu: _gauss() * 0.3, vv: _gauss() * 0.3,
                    type: 'prod', sym: sim.metal, r: R_ION, vis: 1, etat: '' });
}

// Position tirée au hasard dans la partie « solution » de la loupe
function _positionLibre(r) {
  for (var essai = 0; essai < 200; essai++) {
    var u = COL_INIT + 0.3 + r + Math.random() * (2 * RC - COL_INIT - 0.3 - 2 * r);
    var v = r + Math.random() * (2 * RC - 2 * r);
    if (Math.hypot(u - CU, v - CV) > RC - r - 0.1) continue;
    var libre = true;
    for (var i = 0; i < loupe.fond.length; i++) {
      var q = loupe.fond[i];
      if (Math.hypot(q.u - u, q.v - v) < q.r + r + 0.1) { libre = false; break; }
    }
    if (libre) return { u: u, v: v };
  }
  return { u: CU + 2, v: CV };
}

// ══════════════════════════════════════════════════════════════════════
//  Accès au réseau
// ══════════════════════════════════════════════════════════════════════

// Contenu de la case (c, r) ; à gauche de la grille, la lame continue.
function _case(c, r) {
  if (!loupe.presente || r < 0 || r >= NR) return '';
  if (c < 0) return 'M';
  if (c >= NC) return '';
  return loupe.grille[r][c];
}

function _caseSous(u, v) {
  return { c: Math.floor(u - loupe.offX), r: Math.floor(v - loupe.offY) };
}

function _compter(ch) {
  var n = 0;
  for (var r = 0; r < NR; r++) for (var c = 0; c < NC; c++) if (loupe.grille[r][c] === ch) n++;
  return n;
}

// Colonne de la case pleine la plus à droite de chaque ligne (−1 si aucune)
function _fronts() {
  var f = [];
  for (var r = 0; r < NR; r++) {
    var c = NC - 1;
    while (c >= 0 && loupe.grille[r][c] === '') c--;
    f.push(c);
  }
  return f;
}

// ══════════════════════════════════════════════════════════════════════
//  Courbes (trajets des ions et des électrons)
// ══════════════════════════════════════════════════════════════════════

// Point de paramètre s sur une courbe de Bézier de contrôle pts (de Casteljau)
function _bezier(pts, s) {
  var p = pts.slice();
  while (p.length > 1) {
    var q = [];
    for (var i = 0; i < p.length - 1; i++) {
      q.push({ u: p[i].u + (p[i + 1].u - p[i].u) * s, v: p[i].v + (p[i + 1].v - p[i].v) * s });
    }
    p = q;
  }
  return p[0];
}

// Point à la fraction s de la longueur d'une ligne brisée
function _surLigne(pts, s) {
  var L = 0, i, seg = [];
  for (i = 0; i < pts.length - 1; i++) {
    var d = Math.hypot(pts[i + 1].u - pts[i].u, pts[i + 1].v - pts[i].v);
    seg.push(d); L += d;
  }
  var x = s * L;
  for (i = 0; i < seg.length; i++) {
    if (x <= seg[i] || i === seg.length - 1) {
      var k = seg[i] > 0 ? Math.min(1, x / seg[i]) : 1;
      return { u: pts[i].u + (pts[i + 1].u - pts[i].u) * k, v: pts[i].v + (pts[i + 1].v - pts[i].v) * k };
    }
    x -= seg[i];
  }
  return pts[pts.length - 1];
}

// Point du bord de la loupe (un peu au-delà) dans la direction `angle`
// (radians, y vers le bas : angle négatif = vers le haut)
function _bord(angle, marge) {
  return { u: CU + Math.cos(angle) * (RC + marge), v: CV + Math.sin(angle) * (RC + marge) };
}

// ══════════════════════════════════════════════════════════════════════
//  Mise à jour
// ══════════════════════════════════════════════════════════════════════

function majLoupe(dtSim) {
  // ── Position verticale du réseau (suit la lame) ──
  var bas = basLameDansLoupe();
  if (bas < 0) {
    loupe.presente = false;
    loupe.offY = -NR - 2;
  } else {
    loupe.offY = Math.min(0, bas * RC - NR);
    loupe.presente = loupe.offY > -NR;
  }
  var enPlace = loupe.presente && loupe.offY === 0 && fractionImmergee() > 0.5;
  if (!enPlace && loupe.enPlace) _interrompre();          // lame retirée en plein cycle
  if (enPlace && !loupe.enPlace) loupe.tArrivee = D_ARRIVEE;
  loupe.enPlace = enPlace;

  if (dtSim > 0) {
    _brownien(dtSim);
    _majPopulation(dtSim);
    _majFantomes(dtSim);
    if (loupe.offX !== 0) {
      loupe.offX *= Math.exp(-dtSim / 0.3);
      if (Math.abs(loupe.offX) < 0.002) loupe.offX = 0;
    }
    _majChutes(dtSim);
    for (var i = loupe.cycles.length - 1; i >= 0; i--) {
      _majCycle(loupe.cycles[i], dtSim);
      if (loupe.cycles[i].phase === 'fini') loupe.cycles.splice(i, 1);
    }
    if (enPlace) {
      _detacherAmas(dtSim);
      _ordonnancer(dtSim);
    }
  }

  // Même en pause, la lame peut bouger : les ions de fond qu'elle
  // recouvre sont repoussés hors du métal.
  for (var j = 0; j < loupe.fond.length; j++) _sortirDuSolide(loupe.fond[j]);
}

// ── Lancement des cycles ──────────────────────────────────────────────
function _ordonnancer(dt) {
  if (loupe.tArrivee > 0) { loupe.tArrivee -= dt; return; }
  if (loupe.offX !== 0) return;
  // Un seul cycle à la surface à la fois : le suivant démarre quand le
  // précédent en est au départ de ses ions.
  for (var i = 0; i < loupe.cycles.length; i++) {
    var ph = loupe.cycles[i].phase;
    if (ph !== 'depart' && ph !== 'rebond') return;
  }
  // La couche externe est entièrement rongée : la vue suit la lame pour
  // garder la surface en place (aucun cycle n'occupe alors la grille)
  var front = _fronts(), fmax = -1;
  for (i = 0; i < NR; i++) fmax = Math.max(fmax, front[i]);
  var recul = (COL_INIT - 1) - fmax;
  if (recul > 0) { _glisser(recul); return; }

  var cy = _nouveauCycle();
  if (cy) { loupe.cycles.push(cy); return; }
  // Plus de zone disponible (le dépôt masque les atomes de surface) :
  // l'amas le moins bien accroché finit par se détacher
  if (loupe.cycles.length === 0 && loupe.depots.length > 0) _detacherPlusFaible();
}

// ── Amas du dépôt ─────────────────────────────────────────────────────
// Regroupe les atomes du dépôt soudés entre eux (distance < D_VOISINS).
// Renvoie la liste des amas (tableaux d'indices dans loupe.depots) et,
// pour chaque atome, l'indice de son amas.
function _amas() {
  var D = loupe.depots, n = D.length, id = [], liste = [], i, j;
  for (i = 0; i < n; i++) id.push(-1);
  for (i = 0; i < n; i++) {
    if (id[i] >= 0) continue;
    var a = [i], pile = [i];
    id[i] = liste.length;
    while (pile.length) {
      var k = pile.pop();
      for (j = 0; j < n; j++) {
        if (id[j] >= 0) continue;
        if (Math.hypot(D[j].u - D[k].u, D[j].v - D[k].v) < D_VOISINS) {
          id[j] = liste.length; a.push(j); pile.push(j);
        }
      }
    }
    liste.push(a);
  }
  return { liste: liste, id: id };
}

// Nombre de points d'accroche d'un amas : couples (atome du dépôt, atome
// de la lame) à moins d'ANCRAGE
function _accroches(amas) {
  var n = 0;
  for (var k = 0; k < amas.length; k++) {
    var d = loupe.depots[amas[k]];
    var r0 = Math.floor(d.v), c0 = Math.floor(d.u);
    for (var r = r0 - 2; r <= r0 + 2; r++) {
      if (r < 0 || r >= NR) continue;
      for (var c = c0 - 2; c <= c0 + 2; c++) {
        if (c < 0 || c >= NC || loupe.grille[r][c] === '') continue;
        if (Math.hypot(c + 0.5 - d.u, r + 0.5 - d.v) < ANCRAGE) n++;
      }
    }
  }
  return n;
}

// Déchaussement : tout amas qui ne touche plus la lame se détache aussitôt.
// Un amas tenu par un seul point casse à ce point dès N_POINT_UNIQUE
// atomes. Un amas trop lourd pour ses accroches (dépôt spongieux, peu
// adhérent) se casse : seul son morceau le plus éloigné de la lame tombe.
// Un amas contre lequel un ion est en train de se réduire attend la fin
// de la réaction (l'atome formé en fera partie).
function _detacherAmas(dt) {
  if (loupe.tCasse > 0) loupe.tCasse -= dt;
  if (!loupe.depots.length) return;
  var A = _amas().liste, partants = [], hotes = [], i, k;
  for (i = 0; i < loupe.cycles.length; i++) {
    var cy = loupe.cycles[i];
    if (cy.phase === 'depart' || cy.phase === 'rebond') continue;
    for (k = 0; k < cy.ions.length; k++) if (cy.ions[k].depotHote) hotes.push(cy.ions[k].depotHote);
  }
  for (i = 0; i < A.length; i++) {
    var occupe = false;
    for (k = 0; k < A[i].length; k++) if (hotes.indexOf(loupe.depots[A[i][k]]) >= 0) occupe = true;
    if (occupe) continue;
    var n = _accroches(A[i]);
    if (n === 0 || (n === 1 && A[i].length >= N_POINT_UNIQUE)) partants.push(A[i]);
    else if (loupe.tCasse <= 0 && A[i].length >= TAILLE_ILOT_MAX && A[i].length > RAPPORT_POIDS * n) {
      var m = _morceauExterne(A[i]);
      if (m.length) { partants.push(m); loupe.tCasse = D_ENTRE_CASSES; }
    }
  }
  _lancerChutes(partants);
}

// Morceau d'un amas le plus éloigné de la lame : on part de l'atome le
// plus loin (en sauts) des atomes accrochés et on lui adjoint ses voisins
// non accrochés les plus éloignés, jusqu'à TAILLE_MORCEAU atomes
function _morceauExterne(amas) {
  var D = loupe.depots, dist = {}, file = [], i, j, k;
  for (i = 0; i < amas.length; i++) {
    if (_accroches([amas[i]]) > 0) { dist[amas[i]] = 0; file.push(amas[i]); }
  }
  for (var t = 0; t < file.length; t++) {
    for (i = 0; i < amas.length; i++) {
      k = amas[i];
      if (dist[k] !== undefined) continue;
      if (Math.hypot(D[k].u - D[file[t]].u, D[k].v - D[file[t]].v) < D_VOISINS) {
        dist[k] = dist[file[t]] + 1; file.push(k);
      }
    }
  }
  var loin = file[file.length - 1];
  if (loin === undefined || !dist[loin]) return [];
  var morceau = [loin];
  while (morceau.length < TAILLE_MORCEAU) {
    var best = -1;
    for (i = 0; i < amas.length; i++) {
      k = amas[i];
      if (!dist[k] || morceau.indexOf(k) >= 0) continue;
      var voisin = false;
      for (j = 0; j < morceau.length; j++) {
        if (Math.hypot(D[k].u - D[morceau[j]].u, D[k].v - D[morceau[j]].v) < D_VOISINS) voisin = true;
      }
      if (voisin && (best < 0 || dist[k] > dist[best])) best = k;
    }
    if (best < 0) break;
    morceau.push(best);
  }
  return morceau;
}

// Secours (aucune zone disponible) : l'amas le moins accroché se détache
function _detacherPlusFaible() {
  var A = _amas().liste, choisi = null, min = Infinity;
  for (var i = 0; i < A.length; i++) {
    var n = _accroches(A[i]) + Math.random() * 0.5;
    if (n < min) { min = n; choisi = A[i]; }
  }
  if (choisi) _lancerChutes([choisi]);
}

// Zone d'un cycle : d'abord les nI sites où se posent les ions oxydants,
// tirés AU HASARD parmi les places libres de la surface métallique (lame
// ou dépôt, sans préférence) ; les ions d'un même cycle restent groupés.
// Puis les nA atomes de la lame les PLUS PROCHES des ions (à vol d'oiseau)
// s'oxydent ; les électrons vont de ces atomes aux ions à travers le métal.
function _choisirZone(nA, nI, reagit) {
  var g = _reseauMetal(), cand = _sitesLibres(g, reagit), i, k;
  // Ordre de tirage du premier site
  for (i = cand.length - 1; i > 0; i--) {
    k = Math.floor(Math.random() * (i + 1));
    var tmp = cand[i]; cand[i] = cand[k]; cand[k] = tmp;
  }
  for (i = 0; i < cand.length && i < 40; i++) {
    var ions = _grouperSites(cand, cand[i], nI);
    if (!ions) continue;
    var atomes = _atomesProches(g, ions, nA);
    if (atomes) return { atomes: atomes, ions: ions, graphe: g };
  }
  return null;
}

// Complète le groupe des nI ions autour du premier site : chaque nouvel
// ion est tiré au hasard parmi les sites limitrophes d'un ion déjà placé
// (à moins de D_GROUPE) ou posés contre le même atome (ions qui entourent
// une excroissance), sans chevaucher les autres ions
function _grouperSites(cand, premier, nI) {
  var groupe = [premier];
  while (groupe.length < nI) {
    var options = [];
    for (var i = 0; i < cand.length; i++) {
      var s = cand[i], ok = true, proche = false;
      for (var k = 0; k < groupe.length; k++) {
        var d = Math.hypot(s.u - groupe[k].u, s.v - groupe[k].v);
        if (d < ESPACE_IONS) { ok = false; break; }
        if (d < D_GROUPE || s.hote === groupe[k].hote) proche = true;
      }
      if (ok && proche) options.push(s);
    }
    if (!options.length) return null;
    groupe.push(options[Math.floor(Math.random() * options.length)]);
  }
  return groupe;
}

// Les nA atomes de surface de la lame les plus proches du centre du
// groupe d'ions, reliés à eux par le métal. Érosion bornée : seulement
// jusqu'à TOL_RUGO couches sous la couche la plus externe (une de plus si
// c'est impossible autrement), pour que le creux ne s'enfonce pas et que
// toute la couche externe finisse rongée (la vue peut alors suivre la lame).
function _atomesProches(g, ions, nA) {
  var front = _fronts(), couche = -1, bu = 0, bv = 0, hotes = [], i, r, c;
  for (r = 0; r < NR; r++) couche = Math.max(couche, front[r]);
  for (i = 0; i < ions.length; i++) {
    bu += ions[i].u / ions.length; bv += ions[i].v / ions.length;
    hotes.push(ions[i].hote);
  }
  var relie = _parcours(g, hotes).dist;
  for (var tol = TOL_RUGO; tol <= TOL_RUGO + 1; tol++) {
    var cand = [];
    for (r = 0; r < NR; r++) {
      // Atome de surface de la ligne : son ion pourra quitter la lame
      c = front[r];
      if (c < 0 || c + 2 >= NC || loupe.grille[r][c] !== 'M' || c < couche - tol) continue;
      if (relie[g.idx[r + ',' + c]] < 0) continue;
      cand.push({ c: c, r: r, d: Math.hypot(c + 0.5 - bu, r + 0.5 - bv) });
    }
    if (cand.length < nA) continue;
    cand.sort(function (a, b) { return a.d - b.d; });
    return cand.slice(0, nA).sort(function (a, b) { return a.r - b.r; });
  }
  return null;
}

// ── Sites des ions oxydants ───────────────────────────────────────────
// Toutes les places libres contre la surface métallique : contre chaque
// atome de la lame qui touche la solution et contre chaque atome du dépôt,
// dans 7 directions tournées vers la solution (deux places quasi
// confondues ne comptent qu'une fois). Sans réaction, seulement contre la
// lame (l'ion vient la toucher puis repart).
function _sitesLibres(g, reagit) {
  var cand = [], r, c, k, a;
  for (r = 0; r < NR; r++) for (c = 0; c < NC; c++) {
    if (loupe.grille[r][c] === '') continue;
    // Atome au contact de la solution (case vide à droite, en haut ou en bas)
    if (_case(c + 1, r) !== '' && _case(c, r - 1) !== '' && _case(c, r + 1) !== '') continue;
    for (a = -90; a <= 90; a += 30) {
      var cs = Math.cos(a * Math.PI / 180), sn = Math.sin(a * Math.PI / 180);
      _ajouterSite(cand, g, { u: c + 0.5 + DIST_CONTACT * cs, v: r + 0.5 + DIST_CONTACT * sn },
                   cs, sn, g.idx[r + ',' + c]);
    }
  }
  if (reagit) {
    for (k = 0; k < loupe.depots.length; k++) {
      var d = loupe.depots[k];
      for (a = -90; a <= 90; a += 30) {
        var cs2 = Math.cos(a * Math.PI / 180), sn2 = Math.sin(a * Math.PI / 180);
        _ajouterSite(cand, g, { u: d.u + D_SITE_DEPOT * cs2, v: d.v + D_SITE_DEPOT * sn2 },
                     cs2, sn2, g.d0 + k);
      }
    }
  }
  return cand;
}

// Ajoute le site p (normale nu, nv, posé contre le nœud hote) s'il est
// libre. Refusé s'il chevauche la lame ou le dépôt, si l'ion ne peut pas
// l'atteindre sans traverser la lame, ou (dépôt) s'il sort du cercle
// visible ou empiète sur le couloir ; s'il traverse le dépôt (poreux,
// projection d'un volume), l'ion est dessiné derrière lui.
function _ajouterSite(cand, g, p, nu, nv, hote) {
  if (p.v < -0.2 || p.v > NR + 0.2) return;
  if (!g.N[hote].lame) {
    if (p.u > U_MAX_DEPOT || Math.hypot(p.u - CU, p.v - CV) > RC - 0.45) return;
  }
  var i, r, c, derriere = false;
  // Pas deux fois la même place
  for (i = 0; i < cand.length; i++) {
    if (Math.hypot(cand[i].u - p.u, cand[i].v - p.v) < 0.35) return;
  }
  // Ni sur la lame…
  for (r = Math.floor(p.v) - 1; r <= Math.floor(p.v) + 1; r++) {
    if (r < 0 || r >= NR) continue;
    for (c = Math.floor(p.u) - 1; c <= Math.floor(p.u) + 1; c++) {
      if (c < 0 || c >= NC || loupe.grille[r][c] === '') continue;
      if (Math.hypot(c + 0.5 - p.u, r + 0.5 - p.v) < DIST_CONTACT - 0.02) return;
    }
  }
  // … ni sur le dépôt (contre lui seulement)
  for (i = 0; i < loupe.depots.length; i++) {
    if (Math.hypot(loupe.depots[i].u - p.u, loupe.depots[i].v - p.v) < D_PROCHE_DEPOT) return;
  }
  // Arrivée de l'ion le long de la normale : la lame l'arrête, le dépôt non
  for (var s = 0.35; s <= 1.8; s += 0.35) {
    var qu = p.u + nu * s, qv = p.v + nv * s;
    var cs = _caseSous(qu, qv);
    for (r = cs.r - 1; r <= cs.r + 1; r++) for (c = cs.c - 1; c <= cs.c + 1; c++) {
      if (_case(c, r) !== '' && Math.hypot(c + 0.5 - qu, r + 0.5 - qv) < DIST_CONTACT - 0.04) return;
    }
    for (i = 0; i < loupe.depots.length; i++) {
      if (Math.hypot(loupe.depots[i].u - qu, loupe.depots[i].v - qv) < DIST_CONTACT) derriere = true;
    }
  }
  cand.push({ u: p.u, v: p.v, nu: nu, nv: nv, hote: hote, derriere: derriere });
}

// ── Réseau conducteur : lame + dépôt ──────────────────────────────────
// Nœuds : atomes de la lame (cases pleines) puis atomes du dépôt ; liens :
// cases voisines de la lame, dépôt accroché à la lame (ANCRAGE), atomes
// du dépôt soudés (D_VOISINS). Sert au trajet des électrons.
function _reseauMetal() {
  var N = [], adj = [], idx = {}, r, c, k, j;
  for (r = 0; r < NR; r++) for (c = 0; c < NC; c++) {
    if (loupe.grille[r][c] === '') continue;
    idx[r + ',' + c] = N.length;
    N.push({ u: c + 0.5, v: r + 0.5, lame: true });
    adj.push([]);
  }
  var d0 = N.length;
  for (k = 0; k < loupe.depots.length; k++) {
    N.push({ u: loupe.depots[k].u, v: loupe.depots[k].v, lame: false, k: k });
    adj.push([]);
  }
  var lier = function (a, b) { adj[a].push(b); adj[b].push(a); };
  for (r = 0; r < NR; r++) for (c = 0; c < NC; c++) {
    var a = idx[r + ',' + c];
    if (a === undefined) continue;
    if (idx[r + ',' + (c + 1)] !== undefined) lier(a, idx[r + ',' + (c + 1)]);
    if (idx[(r + 1) + ',' + c] !== undefined) lier(a, idx[(r + 1) + ',' + c]);
  }
  for (k = d0; k < N.length; k++) {
    var r0 = Math.floor(N[k].v), c0 = Math.floor(N[k].u);
    for (r = r0 - 2; r <= r0 + 2; r++) for (c = c0 - 2; c <= c0 + 2; c++) {
      var b = idx[r + ',' + c];
      if (b !== undefined && Math.hypot(N[b].u - N[k].u, N[b].v - N[k].v) < ANCRAGE) lier(k, b);
    }
    for (j = k + 1; j < N.length; j++) {
      if (Math.hypot(N[j].u - N[k].u, N[j].v - N[k].v) < D_VOISINS) lier(k, j);
    }
  }
  return { N: N, adj: adj, idx: idx, d0: d0 };
}

// Parcours en largeur depuis les nœuds sources : nombre de sauts et
// prédécesseur de chaque nœud (−1 si inaccessible)
function _parcours(g, sources) {
  var dist = [], prec = [], file = [], i;
  for (i = 0; i < g.N.length; i++) { dist.push(-1); prec.push(-1); }
  for (i = 0; i < sources.length; i++) { dist[sources[i]] = 0; file.push(sources[i]); }
  for (var t = 0; t < file.length; t++) {
    var a = file[t];
    for (i = 0; i < g.adj[a].length; i++) {
      var b = g.adj[a][i];
      if (dist[b] >= 0) continue;
      dist[b] = dist[a] + 1; prec[b] = a; file.push(b);
    }
  }
  return { dist: dist, prec: prec };
}

// Trajet d'un électron, de l'atome qui s'oxyde (nœud src) à l'ion posé
// contre le nœud hote : en ligne droite dans la lame jusqu'au dernier
// atome de la lame du trajet, puis d'atome en atome dans le dépôt
function _trajetElectron(g, src, hote, site) {
  var p = _parcours(g, [src]), noeuds = [], n = hote;
  while (n >= 0) { noeuds.unshift(n); n = p.prec[n]; }
  var pts = [{ u: g.N[src].u, v: g.N[src].v }], dernierLame = src;
  for (var i = 1; i < noeuds.length; i++) {
    if (g.N[noeuds[i]].lame) { dernierLame = noeuds[i]; continue; }
    if (dernierLame >= 0) {
      if (dernierLame !== src) pts.push({ u: g.N[dernierLame].u, v: g.N[dernierLame].v });
      dernierLame = -1;
    }
    pts.push({ u: g.N[noeuds[i]].u, v: g.N[noeuds[i]].v });
  }
  if (dernierLame >= 0 && dernierLame !== src) pts.push({ u: g.N[dernierLame].u, v: g.N[dernierLame].v });
  pts.push({ u: site.u, v: site.v });
  return pts;
}

function _nouveauCycle() {
  var X = sim.metal, Y = sim.solution;
  var reagit = reactionPossible(X, Y);
  var nI = 1, nA = 1, i, k;
  if (reagit) {
    var st = stoechiometrie(X, Y);
    nI = st.coefIon; nA = st.coefMetal;
  }
  var zone = _choisirZone(nA, nI, reagit);
  if (!zone) return null;

  var cy = { phase: 'approche', t: 0, reagit: reagit, ions: [], atomes: [], electrons: [],
             dTransfert: D_TRANSFERT };

  // ── Atomes de la zone ──
  for (i = 0; i < zone.atomes.length; i++) {
    var za = zone.atomes[i];
    cy.atomes.push({ c: za.c, r: za.r, u: za.c + 0.5, v: za.r + 0.5, alpha: 1 });
    if (reagit) loupe.grille[za.r][za.c] = 'O';
  }

  // ── Ions : chacun à son site, contre la lame ou contre le dépôt ; il
  //    arrive le long de la normale au site ──
  for (i = 0; i < nI; i++) {
    var si = zone.ions[i], pu = si.u, pv = si.v;
    cy.ions.push({
      pu: pu, pv: pv,                 // position de contact
      hote: si.hote,                  // nœud du réseau conducteur contre lequel il se pose
      depotHote: zone.graphe.N[si.hote].lame ? null : loupe.depots[zone.graphe.N[si.hote].k],
      derriere: si.derriere,          // passe derrière le dépôt (dessiné dessous)
      chemin: [_bord(-0.55 - 0.18 * i - Math.random() * 0.15, 0.9),
               { u: U_COULOIR + 0.4, v: pv - 2.2 },
               { u: pu + 1.6 * si.nu, v: pv + 1.6 * si.nv },
               { u: pu, v: pv }],
      retard: i * D_DECALAGE,
      u: 0, v: 0, alpha: 0
    });
  }
  // Les ions se posent de haut en bas : leurs trajets ne se croisent pas
  cy.ions.sort(function (a, b) { return a.pv - b.pv; });
  for (i = 0; i < cy.ions.length; i++) cy.ions[i].retard = i * D_DECALAGE;

  if (reagit) {
    // Électrons : chaque atome en cède b, chaque ion en reçoit a, dans
    // l'ordre (Al + Cu²⁺ : le 1er atome donne 2 e⁻ au 1er ion et 1 au 2e…).
    // Trajet dans le métal : en ligne droite si l'ion touche l'atome,
    // sinon à travers la lame puis d'atome en atome dans le dépôt.
    var b = METAUX[X].charge, a = METAUX[Y].charge, n = 0, g = zone.graphe, Lmax = 0;
    for (i = 0; i < cy.atomes.length; i++) {
      var noeud = g.idx[cy.atomes[i].r + ',' + cy.atomes[i].c];
      for (var j = 0; j < b; j++) {
        var src = cy.atomes[i], dst = cy.ions[Math.floor(n / a)];
        var ch = _trajetElectron(g, noeud, dst.hote, { u: dst.pu, v: dst.pv });
        ch[0].v += (j - (b - 1) / 2) * 0.2;
        var L = 0;
        for (k = 1; k < ch.length; k++) L += Math.hypot(ch[k].u - ch[k - 1].u, ch[k].v - ch[k - 1].v);
        Lmax = Math.max(Lmax, L);
        cy.electrons.push({ chemin: ch, L: L, src: i, retard: 0, s: 0 });
        n++;
      }
    }
    // Départs échelonnés (6 électrons au plus) ; durée du transfert à
    // vitesse constante : 0,4 s quand l'ion touche l'atome, plus si les
    // électrons traversent le dépôt
    var ecart = Lmax > 1.5 ? 0.08 : 0.03;
    for (i = 0; i < cy.electrons.length; i++) cy.electrons[i].retard = i * ecart;
    cy.dTransfert = Math.max(D_TRANSFERT, 0.1 + Lmax / V_ELECTRON + (cy.electrons.length - 1) * ecart);
    // Instant (depuis le début du transfert) où le dernier électron de
    // chaque atome en est sorti : l'atome devient ion à partir de là
    var dureeE = _dureeElectrons(cy);
    for (i = 0; i < cy.atomes.length; i++) cy.atomes[i].tOx = 0;
    for (i = 0; i < cy.electrons.length; i++) {
      var e = cy.electrons[i];
      var sortie = e.retard + dureeE * _lisseInverse(Math.min(1, (R_ATOME + 0.05) / e.L));
      cy.atomes[e.src].tOx = Math.max(cy.atomes[e.src].tOx, sortie);
    }
  }
  _majCycle(cy, 0);
  return cy;
}

// ── Déroulement d'un cycle ────────────────────────────────────────────
function _dureeApproche(cy) { return D_APPROCHE + (cy.ions.length - 1) * D_DECALAGE; }

// Durée du trajet de chaque électron (le dernier part plus tard)
function _dureeElectrons(cy) {
  var N = cy.electrons.length;
  return cy.dTransfert - 0.05 - (N > 0 ? cy.electrons[N - 1].retard : 0);
}

// Réciproque de _lisse sur [0, 1] (dichotomie)
function _lisseInverse(y) {
  var a = 0, b = 1;
  for (var i = 0; i < 20; i++) {
    var m = (a + b) / 2;
    if (_lisse(m) < y) a = m; else b = m;
  }
  return (a + b) / 2;
}

// Avancement 0 → 1 de l'oxydation d'un atome du cycle (atome → ion),
// qui commence dès que ses électrons l'ont quitté. tTransfert : temps
// écoulé depuis le début du transfert.
function _kOx(cy, at, tTransfert) {
  return Math.max(0, Math.min(1, (tTransfert - at.tOx) / D_OXYDATION));
}

// Atome devenu ion : il ne fait plus partie de la lame (le dépôt qu'il
// retenait peut se détacher aussitôt)
function _libererAtomesOxydes(cy, tTransfert) {
  for (var i = 0; i < cy.atomes.length; i++) {
    var at = cy.atomes[i];
    if (_kOx(cy, at, tTransfert) >= 1 && loupe.grille[at.r][at.c] === 'O') loupe.grille[at.r][at.c] = '';
  }
}

function _majCycle(cy, dt) {
  var i, s, io, at;
  cy.t += dt;
  switch (cy.phase) {
    case 'approche':
      for (i = 0; i < cy.ions.length; i++) {
        io = cy.ions[i];
        s = (cy.t - io.retard) / D_APPROCHE;
        var p = _bezier(io.chemin, _lisse(s));
        io.u = p.u; io.v = p.v;
        io.alpha = Math.max(0, Math.min(1, (cy.t - io.retard) / 0.35));
      }
      if (cy.t >= _dureeApproche(cy)) _phase(cy, 'contact');
      break;

    case 'contact':
      if (cy.t >= D_CONTACT) {
        if (cy.reagit) _phase(cy, 'transfert');
        else {
          // Pas d'échange : l'ion repart, en diagonale vers le bas à droite
          io = cy.ions[0];
          io.chemin = [{ u: io.pu, v: io.pv }, { u: io.pu + 1.4, v: io.pv },
                       { u: U_COULOIR, v: io.pv + 0.8 }, _bord(0.65, 1.0)];
          _phase(cy, 'rebond');
        }
      }
      break;

    case 'transfert':
      var dureeE = _dureeElectrons(cy);
      for (i = 0; i < cy.electrons.length; i++) {
        cy.electrons[i].s = Math.max(0, Math.min(1, (cy.t - cy.electrons[i].retard) / dureeE));
      }
      _libererAtomesOxydes(cy, cy.t);
      if (cy.t >= cy.dTransfert) _phase(cy, 'transfo');
      break;

    case 'transfo':
      _libererAtomesOxydes(cy, cy.dTransfert + cy.t);
      if (cy.t >= D_TRANSFO) {
        // Les atomes formés restent là où les ions se sont collés
        _deposer(cy);
        // Les ions formés quittent leur case : glissement vers la droite,
        // derrière l'atome formé, puis diagonale vers le bas à droite.
        // Tant que la solution en compte moins que ne le veut l'avancement,
        // l'ion formé reste dans la loupe et rejoint les ions de fond (leur
        // nombre augmente sous les yeux) ; sinon il sort de la loupe.
        var manque = _ciblesFond().prod - _compterFond('prod') - _prodEnRoute();
        for (i = 0; i < cy.atomes.length; i++) {
          at = cy.atomes[i];
          loupe.grille[at.r][at.c] = '';
          at.garder = i < manque;
          var dest = at.garder ? _positionLibre(R_ION)
                               : _bord(0.55 + 0.2 * i + Math.random() * 0.15, 1.0);
          at.chemin = [{ u: at.u, v: at.v }, { u: at.u + 1.5, v: at.v + 0.35 },
                       { u: U_COULOIR, v: at.v + 1.3 }, dest];
          at.retard = i * 0.3;
        }
        _phase(cy, 'depart');
      }
      break;

    case 'depart':
      var fin = 0;
      for (i = 0; i < cy.atomes.length; i++) {
        at = cy.atomes[i];
        s = (cy.t - at.retard) / D_DEPART;
        var q = _bezier(at.chemin, _lisse(s));
        at.u = q.u; at.v = q.v;
        var estompe = Math.max(0, Math.min(1, (s - 0.8) / 0.2));
        // Ion gardé : s'estompe jusqu'à l'aspect des ions de fond
        at.alpha = at.garder ? 1 - (1 - ALPHA_FOND) * estompe : 1 - estompe;
        fin = Math.max(fin, at.retard + D_DEPART);
      }
      if (cy.t >= fin) {
        for (i = 0; i < cy.atomes.length; i++) if (cy.atomes[i].garder) _versFond(cy.atomes[i]);
        _phase(cy, 'fini');
      }
      break;

    case 'rebond':
      io = cy.ions[0];
      s = cy.t / D_REBOND;
      var w = _bezier(io.chemin, _lisse(s));
      io.u = w.u; io.v = w.v;
      io.alpha = 1 - Math.max(0, Math.min(1, (s - 0.8) / 0.2));
      if (cy.t >= D_REBOND) _phase(cy, 'fini');
      break;
  }
}

function _phase(cy, ph) { cy.phase = ph; cy.t = 0; }

// Les ions réduits deviennent des atomes du dépôt, à leur point de
// contact. Ce point est en coordonnées du réseau (un cycle ne démarre
// que réseau immobile, offX = offY = 0) : le dépôt suit la lame.
function _deposer(cy) {
  for (var i = 0; i < cy.ions.length; i++) {
    loupe.depots.push({ u: cy.ions[i].pu, v: cy.ions[i].pv });
  }
}

// Lame retirée pendant un cycle : un échange commencé est mené à son terme
// (il a déjà eu lieu), un ion encore en approche s'efface.
function _interrompre() {
  for (var i = 0; i < loupe.cycles.length; i++) {
    var cy = loupe.cycles[i], k, io, at;
    var echange = cy.reagit && (cy.phase === 'transfert' || cy.phase === 'transfo' || cy.phase === 'depart');
    if (echange) {
      for (k = 0; k < cy.atomes.length; k++) {
        at = cy.atomes[k];
        if (cy.phase !== 'depart') loupe.grille[at.r][at.c] = '';
        else if (at.garder) _versFond(at);
        else if (at.alpha > 0) loupe.fantomes.push({ u: at.u, v: at.v, sym: sim.metal, alpha: at.alpha });
      }
      if (cy.phase !== 'depart') _deposer(cy);   // en départ, c'est déjà fait
    } else {
      for (k = 0; k < cy.ions.length; k++) {
        io = cy.ions[k];
        if (io.alpha > 0) loupe.fantomes.push({ u: io.u, v: io.v, sym: sim.solution, alpha: io.alpha });
      }
      for (k = 0; k < cy.atomes.length; k++) {
        at = cy.atomes[k];
        if (loupe.grille[at.r][at.c] === 'O') loupe.grille[at.r][at.c] = 'M';
      }
    }
  }
  loupe.cycles = [];
}

function _majFantomes(dt) {
  for (var i = loupe.fantomes.length - 1; i >= 0; i--) {
    loupe.fantomes[i].alpha -= dt / 0.5;
    if (loupe.fantomes[i].alpha <= 0) loupe.fantomes.splice(i, 1);
  }
}

// ── Amas du dépôt qui se détachent et tombent ─────────────────────────
// Seul le dépôt tombe : les atomes de la lame ne partent qu'en s'oxydant.
// Chaque amas devient un solide rigide (positions relatives à son centre),
// en coordonnées de la loupe : il ne suit plus la lame.
function _lancerChutes(liste) {
  if (!liste.length) return;
  var retirer = {}, i, k;
  for (i = 0; i < liste.length; i++) {
    var a = liste[i], cu = 0, cv = 0;
    for (k = 0; k < a.length; k++) {
      cu += loupe.depots[a[k]].u / a.length;
      cv += loupe.depots[a[k]].v / a.length;
      retirer[a[k]] = true;
    }
    var atomes = [];
    for (k = 0; k < a.length; k++) {
      atomes.push({ du: loupe.depots[a[k]].u - cu, dv: loupe.depots[a[k]].v - cv });
    }
    loupe.chutes.push({
      atomes: atomes, u: cu + loupe.offX, v: cv + loupe.offY,
      vu: 0.5 + Math.random() * 0.3, vv: 0.4 * V_LIM_CHUTE, // s'écarte de la lame en tombant
      ang: 0, om: (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.35),
      phi: Math.random() * 6.28, t: 0, sym: sim.solution
    });
  }
  var reste = [];
  for (i = 0; i < loupe.depots.length; i++) if (!retirer[i]) reste.push(loupe.depots[i]);
  loupe.depots = reste;
}

// Position (coordonnées de la loupe) de l'atome k d'un amas qui tombe
function _posChute(ch, k) {
  var a = ch.atomes[k], cs = Math.cos(ch.ang), sn = Math.sin(ch.ang);
  return { u: ch.u + a.du * cs - a.dv * sn, v: ch.v + a.du * sn + a.dv * cs };
}

function _majChutes(dt) {
  var amort = Math.exp(-dt / TAU_CHUTE);
  for (var i = loupe.chutes.length - 1; i >= 0; i--) {
    var ch = loupe.chutes[i], k;
    ch.t += dt;
    var go = _lisse(ch.t / D_DECOLLE);         // 0 pendant le décollement → 1
    // Vitesse limite atteinte en douceur (frottement visqueux) ; dérive
    // latérale lente, qui oscille un peu
    var cibleV = V_LIM_CHUTE * go, cibleU = 0.18 * go * Math.sin(1.6 * ch.t + ch.phi);
    ch.vv = cibleV + (ch.vv - cibleV) * amort;
    ch.vu = cibleU + (ch.vu - cibleU) * amort;
    ch.u += ch.vu * dt;
    ch.v += ch.vv * dt;
    ch.ang += ch.om * go * dt;
    _chuteHorsSolide(ch);
    // Sorti par le bas de la loupe
    var bas = true;
    for (k = 0; k < ch.atomes.length; k++) {
      if (_posChute(ch, k).v < CV + RC + R_ATOME + 0.2) { bas = false; break; }
    }
    if (bas || ch.t > 15) loupe.chutes.splice(i, 1);
  }
}

// L'amas qui tombe glisse le long de la lame et du dépôt resté accroché
// au lieu de les traverser : il est repoussé hors des atomes qu'il touche,
// plutôt vers la solution (droite), pour ne jamais rester posé dessus.
function _chuteHorsSolide(ch) {
  var dmin = 2 * R_ATOME, j, k;
  for (k = 0; k < ch.atomes.length; k++) {
    var p = _posChute(ch, k);
    var obst = [];
    if (loupe.presente) {
      var cs = _caseSous(p.u, p.v);
      for (var r = cs.r - 1; r <= cs.r + 1; r++) {
        for (var c = cs.c - 1; c <= cs.c + 1; c++) {
          if (_case(c, r) !== '') obst.push({ u: c + 0.5 + loupe.offX, v: r + 0.5 + loupe.offY });
        }
      }
      for (j = 0; j < loupe.depots.length; j++) {
        obst.push({ u: loupe.depots[j].u + loupe.offX, v: loupe.depots[j].v + loupe.offY });
      }
    }
    for (j = 0; j < obst.length; j++) {
      var du = p.u - obst[j].u, dv = p.v - obst[j].v, d = Math.hypot(du, dv);
      if (d >= dmin) continue;
      var nu = d > 1e-6 ? du / d : 1, nv = d > 1e-6 ? dv / d : 0;
      if (nu < 0.5) { nu = 0.5; var n = Math.hypot(nu, nv); nu /= n; nv /= n; }
      ch.u += nu * (dmin - d);
      ch.v += nv * (dmin - d);
      p.u += nu * (dmin - d);
      p.v += nv * (dmin - d);
      ch.vu = Math.max(ch.vu, 0.3);
    }
  }
}

// La lame rongée recule : on décale le réseau de n colonnes (du métal
// massif entre par la gauche) et il glisse en douceur grâce à offX.
function _glisser(n) {
  for (var k = 0; k < n; k++) {
    for (var r = 0; r < NR; r++) {
      loupe.grille[r].pop();
      loupe.grille[r].unshift('M');
    }
  }
  for (var i = 0; i < loupe.depots.length; i++) loupe.depots[i].u += n;
  loupe.offX -= n;
}

// ── Ions de fond : mouvement brownien lent ────────────────────────────
function _brownien(dt) {
  var P = loupe.fond, i, j, p, q;
  var amort = Math.exp(-GAMMA * dt), bruit = SIGMA * Math.sqrt(dt);
  for (i = 0; i < P.length; i++) {
    p = P[i];
    p.vu = p.vu * amort + bruit * _gauss();
    p.vv = p.vv * amort + bruit * _gauss();
    p.u += p.vu * dt;
    p.v += p.vv * dt;
  }
  // Chocs entre ions de fond (les spectateurs masqués n'interviennent pas)
  for (i = 0; i < P.length; i++) {
    p = P[i];
    if (p.type === 'anion' && !sim.showSpectateurs) continue;
    for (j = i + 1; j < P.length; j++) {
      q = P[j];
      if (q.type === 'anion' && !sim.showSpectateurs) continue;
      var du = q.u - p.u, dv = q.v - p.v;
      var d = Math.sqrt(du * du + dv * dv), dmin = p.r + q.r + 0.04;
      if (d < dmin && d > 1e-6) {
        var nu = du / d, nv = dv / d, rec = (dmin - d) / 2;
        p.u -= nu * rec; p.v -= nv * rec;
        q.u += nu * rec; q.v += nv * rec;
      }
    }
  }
  // Bord de la loupe
  for (i = 0; i < P.length; i++) {
    p = P[i];
    var dx = p.u - CU, dy = p.v - CV, dc = Math.sqrt(dx * dx + dy * dy), lim = RC - p.r;
    if (dc > lim) {
      var nx = dx / dc, ny = dy / dc;
      p.u = CU + nx * lim; p.v = CV + ny * lim;
      var vr = p.vu * nx + p.vv * ny;
      if (vr > 0) { p.vu -= 2 * vr * nx; p.vv -= 2 * vr * ny; }
    }
  }
}

// Repousse un ion de fond hors des cases occupées du réseau
function _sortirDuSolide(p) {
  if (!loupe.presente) return;
  var cs = _caseSous(p.u, p.v);
  if (_case(cs.c, cs.r) !== '') {
    // Centre dans une case pleine (la lame descend sur lui, ou le réseau
    // glisse) : on le replace dans la première case libre à droite.
    var k = cs.c + 1;
    while (k < NC + 1 && _case(k, cs.r) !== '') k++;
    p.u = k + 0.5 + loupe.offX;
    p.vu = Math.abs(p.vu);
    cs = _caseSous(p.u, p.v);
  }
  for (var dc = -1; dc <= 1; dc++) {
    for (var dr = -1; dr <= 1; dr++) {
      var c = cs.c + dc, r = cs.r + dr;
      if (_case(c, r) === '') continue;
      var x0 = c + loupe.offX, y0 = r + loupe.offY;
      var px = Math.max(x0, Math.min(x0 + 1, p.u));
      var py = Math.max(y0, Math.min(y0 + 1, p.v));
      var du = p.u - px, dv = p.v - py, d = Math.sqrt(du * du + dv * dv);
      if (d < p.r && d > 1e-6) {
        var nu = du / d, nv = dv / d;
        p.u += nu * (p.r - d); p.v += nv * (p.r - d);
        var vn = p.vu * nu + p.vv * nv;
        if (vn < 0) { p.vu -= 2 * vn * nu; p.vv -= 2 * vn * nv; }
      }
    }
  }
  // Atomes du dépôt (hors grille)
  for (var i = 0; i < loupe.depots.length; i++) {
    var ex = p.u - (loupe.depots[i].u + loupe.offX), ey = p.v - (loupe.depots[i].v + loupe.offY);
    var de = Math.sqrt(ex * ex + ey * ey), dm = R_ATOME + p.r;
    if (de < dm && de > 1e-6) {
      var mx = ex / de, my = ey / de;
      p.u += mx * (dm - de); p.v += my * (dm - de);
      var vm = p.vu * mx + p.vv * my;
      if (vm < 0) { p.vu -= 2 * vm * mx; p.vv -= 2 * vm * my; }
    }
  }
  _sortirDesChutes(p);
}

// Repousse un ion de fond hors des amas qui tombent
function _sortirDesChutes(p) {
  for (var i = 0; i < loupe.chutes.length; i++) {
    var ch = loupe.chutes[i];
    for (var k = 0; k < ch.atomes.length; k++) {
      var q = _posChute(ch, k);
      var ex = p.u - q.u, ey = p.v - q.v, de = Math.sqrt(ex * ex + ey * ey), dm = R_ATOME + p.r;
      if (de < dm && de > 1e-6) {
        p.u += ex / de * (dm - de); p.v += ey / de * (dm - de);
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Étape en cours (surlignage des équations)
// ══════════════════════════════════════════════════════════════════════

// Ligne du bloc des équations à surligner : 'ox' (l'atome cède ses
// électrons), 'red' (l'ion les reçoit), 'bilan' (transformation) ou null
function etapeEquation() {
  if (!loupe.enPlace) return null;
  for (var i = 0; i < loupe.cycles.length; i++) {
    var cy = loupe.cycles[i];
    if (!cy.reagit) continue;
    if (cy.phase === 'transfert') return cy.t < cy.dTransfert / 2 ? 'ox' : 'red';
    if (cy.phase === 'transfo') return 'bilan';
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════
//  Rendu
// ══════════════════════════════════════════════════════════════════════

function dessinerLoupe(ctx) {
  var s = disp.lr / RC;                 // taille d'une case en px
  var ox = disp.lx - RC * s, oy = disp.ly - RC * s;
  var i;

  _dessinerTraitsLoupe(ctx);

  ctx.save();
  ctx.beginPath();
  ctx.arc(disp.lx, disp.ly, disp.lr, 0, Math.PI * 2);
  ctx.clip();

  // Fond : la solution, teintée comme dans le bécher mais plus clair (les
  // ions doivent rester lisibles) ; bleu pâle si incolore
  var sol = couleurSolution();
  ctx.fillStyle = rgbCss(melange([255, 255, 255], sol.rgb, 0.3 - 0.08 * sol.intensite));
  ctx.fillRect(disp.lx - disp.lr, disp.ly - disp.lr, 2 * disp.lr, 2 * disp.lr);

  ctx.translate(ox, oy);
  ctx.scale(s, s);

  // ── Ions de fond, estompés ──
  for (i = 0; i < loupe.fond.length; i++) {
    var f = loupe.fond[i];
    if (f.type === 'anion') {
      if (sim.showSpectateurs) _dessinerAnion(ctx, f.u, f.v, f.sym, ALPHA_FOND);
    } else {
      _dessinerIon(ctx, f.u, f.v, f.sym, ALPHA_FOND * f.vis, R_ION);
    }
  }

  // ── Ions formés qui quittent la lame : DERRIÈRE le réseau et les
  //    atomes formés (ils glissent derrière eux, comme dans un volume) ──
  for (i = 0; i < loupe.cycles.length; i++) {
    var cy = loupe.cycles[i];
    if (cy.phase !== 'depart') continue;
    for (var k = 0; k < cy.atomes.length; k++) {
      var at = cy.atomes[k];
      if (at.alpha <= 0) continue;
      _halo(ctx, at.u, at.v, R_ION, COUL_OX, Math.max(0, 1 - cy.t / 1.3) * at.alpha, 0.5);
      _dessinerIon(ctx, at.u, at.v, sim.metal, at.alpha, R_ION);
    }
  }

  // ── Réseau métallique ──
  if (loupe.presente) {
    var dx = loupe.offX, dy = loupe.offY;
    var colM = couleurRGB(METAUX[sim.metal].atome);
    // Masse métallique derrière les atomes de la lame
    ctx.fillStyle = rgbCss(nuance(colM, 0.55));
    for (var r = 0; r < NR; r++) {
      var y = r + dy;
      if (y > NR || y + 1 < 0) continue;
      var cmax = -1;
      while (cmax + 1 < NC && (loupe.grille[r][cmax + 1] === 'M' || loupe.grille[r][cmax + 1] === 'O')) cmax++;
      ctx.fillRect(-1.5 + dx, y, cmax + 2.5, 1.02);
    }
    for (r = 0; r < NR; r++) {
      for (var c = -1; c < NC; c++) {
        var ch = c < 0 ? 'M' : loupe.grille[r][c];
        if (ch === 'M') _dessinerAtome(ctx, c + 0.5 + dx, r + 0.5 + dy, sim.metal, 1);
      }
    }
    // Ions en approche qui se glissent derrière le dépôt (dépôt poreux,
    // projection d'un volume) : dessinés sous lui
    for (i = 0; i < loupe.cycles.length; i++) {
      if (loupe.cycles[i].phase === 'approche') _dessinerIonsApproche(ctx, loupe.cycles[i], true);
    }
    // Dépôt : atomes restés là où les ions se sont collés
    for (i = 0; i < loupe.depots.length; i++) {
      _dessinerAtome(ctx, loupe.depots[i].u + dx, loupe.depots[i].v + dy, sim.solution, 1);
    }
  }

  // ── Amas de dépôt qui tombent (ils sortent par le bas de la loupe) ──
  for (i = 0; i < loupe.chutes.length; i++) {
    var ch = loupe.chutes[i];
    for (var a = 0; a < ch.atomes.length; a++) {
      var pc = _posChute(ch, a);
      _dessinerAtome(ctx, pc.u, pc.v, ch.sym, 1);
    }
  }

  for (i = 0; i < loupe.fantomes.length; i++) {
    var g = loupe.fantomes[i];
    _dessinerIon(ctx, g.u, g.v, g.sym, Math.max(0, g.alpha), R_ION);
  }

  // ── Acteurs des cycles ──
  for (i = 0; i < loupe.cycles.length; i++) _dessinerCycle(ctx, loupe.cycles[i]);

  ctx.restore();

  // Cadre de la loupe
  ctx.strokeStyle = '#5a6a78';
  ctx.lineWidth = Math.max(2, disp.lr * 0.022);
  ctx.beginPath();
  ctx.arc(disp.lx, disp.ly, disp.lr, 0, Math.PI * 2);
  ctx.stroke();

  _dessinerTextesLoupe(ctx);
}

function _dessinerCycle(ctx, cy) {
  var i, io, at, dx = loupe.offX, dy = loupe.offY;
  var pulse = 0.5 + 0.5 * Math.sin(performance.now() / 170);

  switch (cy.phase) {
    case 'approche':
      // Les atomes engagés dans ce cycle restent dessinés à leur place
      if (cy.reagit) {
        for (i = 0; i < cy.atomes.length; i++) {
          at = cy.atomes[i];
          _dessinerAtome(ctx, at.u + dx, at.v + dy, sim.metal, 1);
        }
      }
      _dessinerIonsApproche(ctx, cy, false);
      break;

    case 'contact':
    case 'transfert':
      // Ions collés contre le métal, atomes qui vont s'oxyder : signalés ;
      // un atome devient ion dès que ses électrons l'ont quitté
      for (i = 0; i < cy.atomes.length; i++) {
        at = cy.atomes[i];
        if (cy.reagit) {
          var kOx = cy.phase === 'transfert' ? _kOx(cy, at, cy.t) : 0;
          _halo(ctx, at.u + dx, at.v + dy, R_ATOME, COUL_OX, 0.9, kOx > 0 ? 1 : pulse);
          if (kOx > 0) _dessinerTransition(ctx, at.u + dx, at.v + dy, sim.metal, kOx, true);
          else _dessinerAtome(ctx, at.u + dx, at.v + dy, sim.metal, 1);
        }
      }
      for (i = 0; i < cy.ions.length; i++) {
        io = cy.ions[i];
        _halo(ctx, io.pu + dx, io.pv + dy, R_ION, COUL_RED, 0.9, pulse);
        _dessinerIon(ctx, io.pu + dx, io.pv + dy, sim.solution, 1, R_ION);
      }
      if (cy.phase === 'transfert' && sim.showElectrons) {
        for (i = 0; i < cy.electrons.length; i++) {
          var e = cy.electrons[i];
          if (e.s >= 1) continue;
          var p = _surLigne(e.chemin, _lisse(e.s));
          _dessinerElectron(ctx, p.u + dx, p.v + dy);
        }
      }
      break;

    case 'transfo':
      var k = Math.min(1, cy.t / D_TRANSFO);
      for (i = 0; i < cy.atomes.length; i++) {
        at = cy.atomes[i];
        _halo(ctx, at.u + dx, at.v + dy, R_ATOME, COUL_OX, 0.9, 1);
        _dessinerTransition(ctx, at.u + dx, at.v + dy, sim.metal, _kOx(cy, at, cy.dTransfert + cy.t), true);
      }
      for (i = 0; i < cy.ions.length; i++) {
        io = cy.ions[i];
        _halo(ctx, io.pu + dx, io.pv + dy, R_ION, COUL_RED, 0.9 * (1 - k), 1);
        _dessinerTransition(ctx, io.pu + dx, io.pv + dy, sim.solution, k, false);
      }
      break;

    case 'depart':
      // Rien ici : les ions formés sont dessinés derrière le réseau et les
      // atomes formés font déjà partie du dépôt (cf. dessinerLoupe)
      break;

    case 'rebond':
      io = cy.ions[0];
      if (io.alpha > 0) {
        _halo(ctx, io.u, io.v, R_ION, COUL_RED, io.alpha * Math.max(0, 1 - cy.t / 1.3), 0.5);
        _dessinerIon(ctx, io.u, io.v, sim.solution, io.alpha, R_ION);
      }
      break;
  }
}

// Ions d'un cycle en approche : ceux qui passent derrière le dépôt
// (derriere = true) ou les autres
function _dessinerIonsApproche(ctx, cy, derriere) {
  for (var i = 0; i < cy.ions.length; i++) {
    var io = cy.ions[i];
    if (io.alpha <= 0 || !!io.derriere !== derriere) continue;
    _halo(ctx, io.u, io.v, R_ION, COUL_RED, io.alpha * 0.8, 0.5);
    _dessinerIon(ctx, io.u, io.v, sim.solution, io.alpha, R_ION);
  }
}

// Halo coloré autour d'un acteur du cycle (pulse : 0 → 1)
function _halo(ctx, x, y, r, rgb, alpha, pulse) {
  if (alpha <= 0) return;
  var R = r + 0.1 + 0.07 * pulse;
  var g = ctx.createRadialGradient(x, y, r * 0.8, x, y, R + 0.18);
  g.addColorStop(0, rgbCss(rgb, 0.45 * alpha));
  g.addColorStop(1, rgbCss(rgb, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R + 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgbCss(rgb, 0.85 * alpha);
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.stroke();
}

// ── Traits reliant le point visé dans le bécher au cercle de la loupe ──
function _dessinerTraitsLoupe(ctx) {
  var P = sceneVersPx(LOUPE_PX, LOUPE_PY);
  var rs = 2.4 * disp.k;
  var ux = disp.lx - P.x, uy = disp.ly - P.y, d = Math.sqrt(ux * ux + uy * uy);
  if (d < 1) return;
  ux /= d; uy /= d;
  var nx = -uy, ny = ux;
  ctx.save();
  ctx.strokeStyle = 'rgba(90,106,120,0.75)';
  ctx.lineWidth = Math.max(1.2, disp.k * 0.22);
  ctx.setLineDash([disp.k * 1.0, disp.k * 0.8]);
  ctx.beginPath();
  ctx.moveTo(P.x + nx * rs, P.y + ny * rs); ctx.lineTo(disp.lx + nx * disp.lr, disp.ly + ny * disp.lr);
  ctx.moveTo(P.x - nx * rs, P.y - ny * rs); ctx.lineTo(disp.lx - nx * disp.lr, disp.ly - ny * disp.lr);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#5a6a78';
  ctx.lineWidth = Math.max(1.5, disp.k * 0.3);
  ctx.beginPath();
  ctx.arc(P.x, P.y, rs, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ── Particules (coordonnées en cases) ─────────────────────────────────
function _sphere(ctx, x, y, r, rgb, alpha) {
  var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, rgbCss(nuance(rgb, 0.55), alpha));
  g.addColorStop(0.55, rgbCss(rgb, alpha));
  g.addColorStop(1, rgbCss(nuance(rgb, -0.3), alpha));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Texte lisible sur la couleur de fond (blanc sur foncé, sombre sur clair)
function _couleurTexte(rgb, alpha) {
  var lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return lum > 165 ? 'rgba(44,62,80,' + alpha + ')' : 'rgba(255,255,255,' + alpha + ')';
}

function _etiquette(ctx, x, y, txt, taille, rgb, alpha) {
  ctx.fillStyle = _couleurTexte(rgb, alpha);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  texteEchelle(ctx, txt, x, y + taille * 0.04, taille, '700', disp.lr / RC);
}

function _dessinerAtome(ctx, x, y, sym, alpha) {
  if (alpha <= 0) return;
  var rgb = couleurRGB(METAUX[sym].atome);
  _sphere(ctx, x, y, R_ATOME, rgb, alpha);
  ctx.strokeStyle = rgbCss(nuance(rgb, -0.45), alpha * 0.8);
  ctx.lineWidth = 0.03;
  ctx.stroke();
  _etiquette(ctx, x, y, sym, 0.36, rgb, alpha);
}

// Ion : plus petit que l'atome, liseré blanc, charge en exposant
function _dessinerIon(ctx, x, y, sym, alpha, r) {
  if (alpha <= 0) return;
  var rgb = couleurRGB(METAUX[sym].ion);
  _sphere(ctx, x, y, r, rgb, alpha);
  ctx.strokeStyle = 'rgba(255,255,255,' + 0.9 * alpha + ')';
  ctx.lineWidth = 0.05;
  ctx.stroke();
  _etiquette(ctx, x, y, ionTexte(sym), 0.27, rgb, alpha);
}

function _dessinerAnion(ctx, x, y, cle, alpha) {
  var rgb = couleurRGB(ANIONS[cle].couleur);
  _sphere(ctx, x, y, R_ANION, rgb, alpha * 0.9);
  ctx.strokeStyle = rgbCss(nuance(rgb, -0.35), alpha * 0.8);
  ctx.lineWidth = 0.03;
  ctx.setLineDash([0.08, 0.06]);
  ctx.stroke();
  ctx.setLineDash([]);
  _etiquette(ctx, x, y, anionTexte(cle), 0.22, rgb, alpha);
}

// Électron : disque bleu marqué « − » (charte du site)
function _dessinerElectron(ctx, x, y) {
  ctx.fillStyle = '#2a6aaa';
  ctx.beginPath();
  ctx.arc(x, y, R_ELECTRON, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 0.035;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - R_ELECTRON * 0.5, y); ctx.lineTo(x + R_ELECTRON * 0.5, y);
  ctx.stroke();
}

// Transition atome ↔ ion. t = 0 → état de départ, t = 1 → état d'arrivée.
// versIon : true pour une oxydation (atome → ion), false pour une réduction.
function _dessinerTransition(ctx, x, y, sym, t, versIon) {
  var k = _lisse(t);
  var fIon = versIon ? k : 1 - k;            // part « ion » de l'apparence
  var r = R_ATOME + (R_ION - R_ATOME) * fIon;
  var rgb = melange(couleurRGB(METAUX[sym].atome), couleurRGB(METAUX[sym].ion), fIon);
  _sphere(ctx, x, y, r, rgb, 1);
  ctx.strokeStyle = 'rgba(255,255,255,' + 0.9 * fIon + ')';
  ctx.lineWidth = 0.05;
  ctx.stroke();
  _etiquette(ctx, x, y, fIon > 0.5 ? ionTexte(sym) : sym, fIon > 0.5 ? 0.27 : 0.36, rgb, 1);
}

// ── Titre et consigne ─────────────────────────────────────────────────
function _dessinerTextesLoupe(ctx) {
  var fs = Math.max(11, disp.lr * 0.075);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#5a6a78';
  ctx.font = '600 ' + fs + 'px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Surface de la lame vue à l’échelle des atomes', disp.lx, disp.ly - disp.lr - fs * 0.4);

  if (loupe.presente) return;
  var msg = 'Plongez la lame dans la solution';
  ctx.font = '700 ' + fs + 'px "Segoe UI", Arial, sans-serif';
  var w = ctx.measureText(msg).width + fs * 1.4, h = fs * 1.9;
  ctx.fillStyle = 'rgba(253,248,240,0.92)';
  ctx.strokeStyle = '#c8c0b4';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(disp.lx - w / 2, disp.ly - h / 2, w, h, h * 0.3);
  else ctx.rect(disp.lx - w / 2, disp.ly - h / 2, w, h);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2c3e50';
  ctx.textBaseline = 'middle';
  ctx.fillText(msg, disp.lx, disp.ly + fs * 0.05);
}
