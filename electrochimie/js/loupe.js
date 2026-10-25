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
//                     haut à droite et vient se coller contre l'atome de
//                     la lame (Zn) avec lequel il va réagir ;
//    2. contact     : l'ion et l'atome sont signalés ;
//    3. transfert   : les électrons passent directement de l'atome à l'ion
//                     collé contre lui (visibles sur option) ;
//    4. transformation : Cu²⁺ devient Cu, Zn devient Zn²⁺, sur place ;
//    5. départ      : Zn²⁺ quitte la lame en glissant derrière le Cu formé
//                     (la scène est la projection d'un volume), puis part
//                     en diagonale vers le bas à droite ; l'atome Cu reste
//                     là où l'ion s'est collé (dépôt hors grille).
//
//  Un cycle correspond à l'équation de la réaction et met en jeu une
//  seule ZONE de la lame : les atomes qui s'oxydent sont voisins, et les
//  ions se posent côte à côte contre eux (Cu + 2 Ag⁺ : les deux Ag⁺
//  encadrent l'atome Cu). Un ion ne se pose jamais sur le dépôt : seulement
//  contre des atomes de la lame.
//
//  La surface de la lame se couvre ainsi peu à peu de dépôt, avec des
//  creux derrière lui. Quand plus aucune zone n'est disponible, le dépôt
//  se détache d'un bloc et tombe ; si la lame a reculé, la vue la suit.
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
// Toutes les lignes peuvent réagir (sinon celles du bord ne seraient
// jamais rongées et dépasseraient quand la vue suit la lame), mais celles
// qui sont bien visibles dans le cercle sont choisies en priorité.
var LIGNE_CENTRE_MIN = 2, LIGNE_CENTRE_MAX = 8;
// Décalages verticaux essayés pour les ions quand la surface est accidentée
var DECALAGES_IONS = [0, 0.15, -0.15, 0.3, -0.3, 0.45, -0.45];
var U_COULOIR = 7.7;             // abscisse du couloir libre longé par les ions

// ── Tailles des particules (en cases) ─────────────────────────────────
// L'ion métallique est plus petit que l'atome (il a perdu ses électrons
// les plus externes) : différence volontairement visible.
var R_ATOME = 0.47, R_ION = 0.37, R_ANION = 0.36, R_ELECTRON = 0.17;
var DIST_CONTACT = R_ATOME + R_ION;   // ion collé contre un atome
var ESPACE_IONS = 0.9;                // écart vertical entre ions côte à côte

// ── Ions de fond (estompés, ne participent pas aux cycles) ────────────
var N_FOND_OX = 5, N_FOND_PROD = 3, N_FOND_ANION = 6;
var ALPHA_FOND = 0.32;
var GAMMA = 1.0, SIGMA = 1.2;    // mouvement brownien lent (Ornstein-Uhlenbeck)

// ── Durées des étapes (s de temps simulé, donc soumises à la vitesse) ──
var D_ARRIVEE   = 1.0;           // lame qui vient d'être plongée
var D_APPROCHE  = 2.4;
var D_DECALAGE  = 0.45;          // entre deux ions d'un même cycle
var D_CONTACT   = 0.8;
var D_TRANSFERT = 0.4;
var D_TRANSFO   = 1.0;
var D_DEPART    = 2.6;           // trajet de l'ion formé jusqu'au bord
var D_REBOND    = 2.6;
var D_PLAQUE    = 2.2;

// Couleurs des rôles (mêmes teintes que les demi-équations du bloc HTML)
var COUL_OX  = [176, 64, 32];    // oxydation : atome de la lame qui perd des électrons
var COUL_RED = [42, 106, 170];   // réduction : ion oxydant qui en gagne

// ══════════════════════════════════════════════════════════════════════
//  État
// ══════════════════════════════════════════════════════════════════════

var loupe = {
  grille: [],
  depots: [],          // atomes déposés, hors grille : { u, v } (coordonnées du réseau)
  fond: [],            // ions estompés : { u, v, vu, vv, type, sym, r }
  cycles: [],
  plaque: null,        // { atomes: [{u, v, sym}], t, dy, du, vv }
  fantomes: [],        // ions d'un cycle interrompu, qui s'effacent
  offX: 0, offY: -NR - 2,
  presente: false,     // réseau visible (lame dans le bécher)
  enPlace: false,      // lame plongée à sa place : les cycles peuvent tourner
  tArrivee: 0
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
  loupe.plaque = null;
  loupe.fantomes = [];
  loupe.offX = 0;
  loupe.offY = -NR - 2;
  loupe.presente = false;
  loupe.enPlace = false;
  loupe.tArrivee = D_ARRIVEE;

  for (i = 0; i < N_FOND_OX; i++) _ajouterFond('ox', sim.solution, R_ION);
  if (reactionPossible(sim.metal, sim.solution)) {
    for (i = 0; i < N_FOND_PROD; i++) _ajouterFond('prod', sim.metal, R_ION);
  }
  for (i = 0; i < N_FOND_ANION; i++) _ajouterFond('anion', METAUX[sim.solution].anion, R_ANION);
}

function _ajouterFond(type, sym, r) {
  var pos = _positionLibre(r);
  loupe.fond.push({ u: pos.u, v: pos.v, vu: _gauss() * 0.5, vv: _gauss() * 0.5,
                    type: type, sym: sym, r: r });
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
    _majFantomes(dtSim);
    if (loupe.offX !== 0) {
      loupe.offX *= Math.exp(-dtSim / 0.3);
      if (Math.abs(loupe.offX) < 0.002) loupe.offX = 0;
    }
    if (loupe.plaque) _majPlaque(dtSim);
    for (var i = loupe.cycles.length - 1; i >= 0; i--) {
      _majCycle(loupe.cycles[i], dtSim);
      if (loupe.cycles[i].phase === 'fini') loupe.cycles.splice(i, 1);
    }
    if (enPlace) _ordonnancer(dtSim);
  }

  // Même en pause, la lame peut bouger : les ions de fond qu'elle
  // recouvre sont repoussés hors du métal.
  for (var j = 0; j < loupe.fond.length; j++) _sortirDuSolide(loupe.fond[j]);
}

// ── Lancement des cycles ──────────────────────────────────────────────
function _ordonnancer(dt) {
  if (loupe.tArrivee > 0) { loupe.tArrivee -= dt; return; }
  if (loupe.plaque || loupe.offX !== 0) return;
  // Un seul cycle à la surface à la fois : le suivant démarre quand le
  // précédent en est au départ de ses ions.
  for (var i = 0; i < loupe.cycles.length; i++) {
    var ph = loupe.cycles[i].phase;
    if (ph !== 'depart' && ph !== 'rebond') return;
  }
  var cy = _nouveauCycle();
  if (cy) { loupe.cycles.push(cy); return; }
  // Plus de zone disponible : la couche de dépôt se détache
  if (loupe.cycles.length === 0 && loupe.depots.length > 0) _lancerPlaque();
}

// Zone de la lame pour un cycle : les nA atomes les plus saillants d'une
// courte fenêtre de lignes (nA à nA + 2 lignes : ils sont voisins, sans
// être forcément sur des lignes consécutives), tous en surface (place
// libre à leur droite pour les ions). Le dépôt est vérifié ensuite, ion
// par ion (_placerIons).
function _choisirZone(nA, nI) {
  // Érosion couche par couche : on prend d'abord des atomes de la couche
  // la plus externe ; la surface reste plane, et toutes les lignes finissent
  // rongées (la vue peut alors suivre la lame). Si les derniers atomes
  // d'une couche ne suffisent plus pour une zone (3 atomes de Mg pour
  // 2 Al³⁺), on puise dans les couches juste en dessous.
  for (var tol = 0; tol <= 3; tol++) {
    var z = _choisirZoneTol(nA, nI, tol);
    if (z) return z;
  }
  return null;
}

// tol : nombre de couches sous la couche externe où la zone peut puiser
// (0 = couche externe seulement)
function _choisirZoneTol(nA, nI, tol) {
  var front = _fronts(), zones = [], i, r, c, L, s;
  var couche = -1;
  for (i = 0; i < NR; i++) couche = Math.max(couche, front[i]);
  var parSaillie = function (a, b) { return b.k - a.k; };
  var parLigne = function (a, b) { return a.r - b.r; };

  for (L = nA; L <= nA + 2; L++) {
    for (s = 0; s + L <= NR; s++) {
      // Atomes de surface de la fenêtre, du plus saillant au moins saillant
      var cand = [];
      for (r = s; r < s + L; r++) {
        c = front[r];
        if (c < 0 || c + 2 >= NC || loupe.grille[r][c] !== 'M' || c < couche - tol) continue;
        cand.push({ c: c, r: r, k: c + Math.random() * 0.1 });
      }
      if (cand.length < nA) continue;
      cand.sort(parSaillie);
      var atomes = cand.slice(0, nA).sort(parLigne);
      // Fenêtre au plus juste (sinon la même zone serait comptée plusieurs fois)
      if (atomes[nA - 1].r - atomes[0].r + 1 !== L) continue;
      var cmin = NC, cmax = -1;
      for (i = 0; i < nA; i++) { cmin = Math.min(cmin, atomes[i].c); cmax = Math.max(cmax, atomes[i].c); }
      if (cmax - cmin > tol) continue;
      var penal = (L - nA) * 1.5;               // atomes non contigus : moins lisible
      // Lignes du bord du cercle : légèrement moins prioritaires (une forte
      // pénalité ferait creuser le centre avant de finir la couche au bord)
      if (s < LIGNE_CENTRE_MIN || s + L - 1 > LIGNE_CENTRE_MAX) penal += 1;
      // Priorité aux atomes les plus saillants : c'est ce qui garde la
      // surface plane
      zones.push({
        atomes: atomes,
        score: -3 * cmax - cmin + penal + Math.abs(s + L / 2 - CV) * 0.25 + Math.random() * 1.6
      });
    }
  }
  zones.sort(function (a, b) { return a.score - b.score; });
  // Première zone où les ions trouvent leur place (en décalant au besoin
  // le groupe d'ions vers le haut ou le bas)
  for (i = 0; i < zones.length; i++) {
    for (var j = 0; j < DECALAGES_IONS.length; j++) {
      var places = _placerIons(zones[i].atomes, nI, DECALAGES_IONS[j]);
      if (places) return { atomes: zones[i].atomes, ions: places };
    }
  }
  return null;
}

// Points de contact des nI ions, côte à côte (écart ESPACE_IONS) autour
// des atomes de la zone. Chaque ion est poussé contre la surface jusqu'à
// toucher l'atome le plus saillant à sa hauteur ; la zone est refusée si
// cet atome n'est pas l'un des siens, si l'ion frôle le dépôt, ou si un
// atome du dépôt lui barre l'arrivée (il se glisserait dans un creux
// derrière le dépôt).
function _placerIons(atomes, nI, decal) {
  var vMoy = 0, i, k, r, c;
  for (k = 0; k < atomes.length; k++) vMoy += (atomes[k].r + 0.5) / atomes.length;
  var res = [];
  for (i = 0; i < nI; i++) {
    var v = vMoy + decal + (i - (nI - 1) / 2) * ESPACE_IONS;
    // (un ion peut déborder un peu de la grille aux lignes extrêmes : il
    // est alors au bord du cercle de la loupe)
    if (v < -0.2 || v > NR + 0.2) return null;
    var u = -1, contre = null;
    for (r = Math.floor(v) - 1; r <= Math.floor(v) + 1; r++) {
      if (r < 0 || r >= NR) continue;
      for (c = 0; c < NC; c++) {
        if (loupe.grille[r][c] === '') continue;
        var dv = Math.abs(r + 0.5 - v);
        if (dv >= DIST_CONTACT) continue;
        var uc = c + 0.5 + Math.sqrt(DIST_CONTACT * DIST_CONTACT - dv * dv);
        if (uc > u) { u = uc; contre = { c: c, r: r }; }
      }
    }
    if (!contre) return null;
    var sienne = false;
    for (k = 0; k < atomes.length; k++) {
      if (atomes[k].c === contre.c && atomes[k].r === contre.r) sienne = true;
    }
    if (!sienne) return null;
    for (k = 0; k < loupe.depots.length; k++) {
      var d = loupe.depots[k];
      // Atome du dépôt à portée de contact
      if (Math.hypot(u - d.u, v - d.v) < DIST_CONTACT + 0.1) return null;
      // Atome du dépôt devant l'ion, à sa hauteur : il bloque l'arrivée
      if (Math.abs(d.v - v) < DIST_CONTACT + 0.05 && d.u > u - 0.3) return null;
    }
    res.push({ u: u, v: v });
  }
  return res;
}

function _nouveauCycle() {
  var X = sim.metal, Y = sim.solution;
  var reagit = reactionPossible(X, Y);
  var nI = 1, nA = 1, i, k;
  if (reagit) {
    var st = stoechiometrie(X, Y);
    nI = st.coefIon; nA = st.coefMetal;
  }
  var zone = _choisirZone(nA, nI);
  if (!zone) return null;

  var cy = { phase: 'approche', t: 0, reagit: reagit, ions: [], atomes: [], electrons: [] };

  // ── Atomes de la zone ──
  for (i = 0; i < zone.atomes.length; i++) {
    var za = zone.atomes[i];
    cy.atomes.push({ c: za.c, r: za.r, u: za.c + 0.5, v: za.r + 0.5, alpha: 1 });
    if (reagit) loupe.grille[za.r][za.c] = 'O';
  }

  // ── Ions : côte à côte, collés aux atomes de la zone ──
  for (i = 0; i < nI; i++) {
    var pu = zone.ions[i].u, pv = zone.ions[i].v;
    cy.ions.push({
      pu: pu, pv: pv,                 // position de contact
      chemin: [_bord(-0.55 - 0.18 * i - Math.random() * 0.15, 0.9),
               { u: U_COULOIR + 0.4, v: pv - 2.2 },
               { u: pu + 1.6, v: pv },
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
    // Trajet direct : l'ion est collé contre l'atome.
    var b = METAUX[X].charge, a = METAUX[Y].charge, n = 0;
    for (i = 0; i < cy.atomes.length; i++) {
      for (var j = 0; j < b; j++) {
        var src = cy.atomes[i], dst = cy.ions[Math.floor(n / a)];
        var sv = src.v + (j - (b - 1) / 2) * 0.2;
        cy.electrons.push({
          chemin: [{ u: src.u, v: sv }, { u: dst.pu, v: dst.pv }],
          retard: n * 0.03,           // 6 électrons au plus : départs sur 0,15 s
          s: 0
        });
        n++;
      }
    }
  }
  _majCycle(cy, 0);
  return cy;
}

// ── Déroulement d'un cycle ────────────────────────────────────────────
function _dureeApproche(cy) { return D_APPROCHE + (cy.ions.length - 1) * D_DECALAGE; }

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
      var N = cy.electrons.length;
      var dureeE = D_TRANSFERT - 0.05 - (N > 0 ? cy.electrons[N - 1].retard : 0);
      for (i = 0; i < N; i++) {
        cy.electrons[i].s = Math.max(0, Math.min(1, (cy.t - cy.electrons[i].retard) / dureeE));
      }
      if (cy.t >= D_TRANSFERT) _phase(cy, 'transfo');
      break;

    case 'transfo':
      if (cy.t >= D_TRANSFO) {
        // Les atomes formés restent là où les ions se sont collés
        _deposer(cy);
        // Les ions formés quittent leur case : glissement vers la droite,
        // derrière l'atome formé, puis diagonale vers le bas à droite
        for (i = 0; i < cy.atomes.length; i++) {
          at = cy.atomes[i];
          loupe.grille[at.r][at.c] = '';
          at.chemin = [{ u: at.u, v: at.v }, { u: at.u + 1.5, v: at.v + 0.35 },
                       { u: U_COULOIR, v: at.v + 1.3 },
                       _bord(0.55 + 0.2 * i + Math.random() * 0.15, 1.0)];
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
        at.alpha = 1 - Math.max(0, Math.min(1, (s - 0.8) / 0.2));
        fin = Math.max(fin, at.retard + D_DEPART);
      }
      if (cy.t >= fin) _phase(cy, 'fini');
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

// ── Plaque de dépôt qui se détache et tombe ───────────────────────────
function _lancerPlaque() {
  var atomes = [], r, c, i;
  for (i = 0; i < loupe.depots.length; i++) {
    atomes.push({ u: loupe.depots[i].u + loupe.offX, v: loupe.depots[i].v + loupe.offY, sym: sim.solution });
  }
  loupe.depots = [];
  // Seul le dépôt tombe : les atomes de la lame ne partent qu'en s'oxydant
  loupe.plaque = { atomes: atomes, t: 0, dy: 0, du: 0, vv: 0 };
}

function _majPlaque(dt) {
  var P = loupe.plaque;
  P.t += dt;
  // Bref décollement de la lame, puis chute
  P.du = 0.35 * _lisse(P.t / 0.5);
  if (P.t > 0.35) { P.vv += 3.2 * dt; P.dy += P.vv * dt; }
  if (P.t >= D_PLAQUE) {
    loupe.plaque = null;
    // La lame a reculé sur toute sa hauteur : la vue la suit pour garder
    // la surface en place
    var front = _fronts(), fmax = -1;
    for (var i = 0; i < NR; i++) fmax = Math.max(fmax, front[i]);
    var recul = (COL_INIT - 1) - fmax;
    if (recul > 0) _glisser(recul);
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
    if (cy.phase === 'transfert') return cy.t < D_TRANSFERT / 2 ? 'ox' : 'red';
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

  // Fond : la solution, légèrement teintée comme dans le bécher
  var sol = couleurSolution();
  ctx.fillStyle = rgbCss(melange([255, 255, 255], sol.rgb, 0.25));
  ctx.fillRect(disp.lx - disp.lr, disp.ly - disp.lr, 2 * disp.lr, 2 * disp.lr);

  ctx.translate(ox, oy);
  ctx.scale(s, s);

  // ── Ions de fond, estompés ──
  for (i = 0; i < loupe.fond.length; i++) {
    var f = loupe.fond[i];
    if (f.type === 'anion') {
      if (sim.showSpectateurs) _dessinerAnion(ctx, f.u, f.v, f.sym, ALPHA_FOND + 0.1);
    } else {
      _dessinerIon(ctx, f.u, f.v, f.sym, ALPHA_FOND, R_ION);
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
    // Dépôt : atomes restés là où les ions se sont collés
    for (i = 0; i < loupe.depots.length; i++) {
      _dessinerAtome(ctx, loupe.depots[i].u + dx, loupe.depots[i].v + dy, sim.solution, 1);
    }
  }

  // ── Plaque de dépôt qui tombe ──
  if (loupe.plaque) {
    var P = loupe.plaque, aP = 1 - Math.max(0, Math.min(1, (P.t - D_PLAQUE + 0.7) / 0.7));
    for (i = 0; i < P.atomes.length; i++) {
      _dessinerAtome(ctx, P.atomes[i].u + P.du, P.atomes[i].v + P.dy, P.atomes[i].sym, aP);
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
      for (i = 0; i < cy.ions.length; i++) {
        io = cy.ions[i];
        if (io.alpha <= 0) continue;
        _halo(ctx, io.u, io.v, R_ION, COUL_RED, io.alpha * 0.8, 0.5);
        _dessinerIon(ctx, io.u, io.v, sim.solution, io.alpha, R_ION);
      }
      break;

    case 'contact':
    case 'transfert':
      // Ions collés contre la lame, atomes qui vont s'oxyder : signalés
      for (i = 0; i < cy.atomes.length; i++) {
        at = cy.atomes[i];
        if (cy.reagit) {
          _halo(ctx, at.u + dx, at.v + dy, R_ATOME, COUL_OX, 0.9, pulse);
          _dessinerAtome(ctx, at.u + dx, at.v + dy, sim.metal, 1);
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
        _dessinerTransition(ctx, at.u + dx, at.v + dy, sim.metal, k, true);
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
