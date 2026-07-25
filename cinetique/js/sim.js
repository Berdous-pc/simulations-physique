// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  sim.js — État et physique de la simulation
//  Chargé en PREMIER. Expose la fabrique `createSim()`, le tableau `sims`
//  (une entrée par simulation) et toutes les fonctions physiques utilisées
//  par recipient.js, graph.js et ui.js.
//
//  La page peut afficher 1 ou 2 simulations (bouton « Nombre de
//  simulation(s) ») pour comparer en direct deux jeux de paramètres. Toutes
//  les fonctions physiques prennent donc en PREMIER ARGUMENT l'instance `s`
//  sur laquelle elles travaillent : il n'y a plus d'état global unique.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Constantes physiques et de simulation ──────────────────────────────
var T_REF = 300;   // K, température de référence pour calibrage visuel
// Vitesse de base en px/s à T_REF (recalibrée par instance dans resize())
var V0_PX_DEFAULT = 180;

// ── Correspondance slider (°C) → température de simulation (K) ─────────
// Le slider affiche des températures réalistes (1 °C à 90 °C) mais l'échelle
// des vitesses reste celle, exagérée, qui rendait la simulation lisible :
// - à 90 °C on retrouve la vitesse moyenne maximale d'avant (celle de 1000 K) ;
// - à 1 °C la vitesse moyenne vaut le QUART de l'ancien minimum (100 K), soit
//   V0·sqrt(100/300)/4 → T_SIM_MIN = 300·(sqrt(1/3)/4)² = 6,25 K.
// L'interpolation est linéaire en température, donc la vitesse moyenne varie
// bien comme sqrt(T) sur toute la course du slider.
var T_C_MIN = 1;
var T_C_MAX = 90;
var T_SIM_MIN = 6.25;    // K, atteint à 1 °C
var T_SIM_MAX = 1000;    // K, atteint à 90 °C

// Température de simulation (K) correspondant à une consigne en °C
function simTempFromCelsius(T_C) {
  var f = (T_C - T_C_MIN) / (T_C_MAX - T_C_MIN);
  if (f < 0) f = 0; else if (f > 1) f = 1;
  return T_SIM_MIN + f * (T_SIM_MAX - T_SIM_MIN);
}

// Rayon des molécules en fraction de la largeur intérieure du récipient
var MOL_RADIUS_FRAC = 0.007;  // le rayon en px est recalculé par recipient.js

// ── Énergie d'activation ───────────────────────────────────────────────
// Un choc A + B ne donne la réaction que si la vitesse d'APPROCHE (composante
// normale de la vitesse relative) dépasse ce seuil : c'est ce qui distingue
// un choc « efficace » d'un simple rebond, et donc ce qui donne son sens au
// modèle des chocs efficaces.
//
// Le seuil est exprimé en fraction de `v0px`, qui est une échelle purement
// GÉOMÉTRIQUE (proportionnelle à la taille du récipient, cf. recipient.js) et
// ne dépend PAS de la température. C'est essentiel : la barrière d'activation
// doit rester fixe pendant que les vitesses, elles, varient en √T. C'est
// précisément cet écart qui fait que la proportion de chocs efficaces croît
// avec la température (comportement de type Arrhenius). Un seuil qui serait
// défini en fraction de la vitesse thermique du moment donnerait une
// proportion constante et supprimerait tout effet de la température.
//
// À froid, la voie directe est quasi gelée et seule la voie catalytique
// fonctionne encore — ce qui est exactement le propos.
// Calibré pour un t½ d'environ 20 s à 20 °C, avec 50 A + 50 B et sans
// catalyseur. La sensibilité est FORTE et très non linéaire (c'est le propre
// d'une loi d'Arrhenius) : mesuré sur cette base, 2,4 donne ~13 s, 2,8 ~20 s
// et 3,2 ~56 s. Bouger ce paramètre de 0,1 change le temps de réaction
// d'environ 12 % — ajuster par petits pas.
var ACTIVATION_SPEED_FACTOR = 2.8;   // × v0px

// ── Sous-pas d'intégration par frame (anti-tunneling) ──────────────────
// Le nombre de sous-pas est calculé à chaque frame (cf. _requiredSubsteps) :
// une valeur fixe ne tient pas quand le slider de vitesse multiplie dt par 4
// et que la température maximale du slider (90 °C, soit T_SIM_MAX) multiplie
// les vitesses par ~1,8. Dans ce cas la molécule
// la plus rapide parcourt plusieurs diamètres par sous-pas, traverse ses
// voisines sans être détectée, et des chocs A+B efficaces sont manqués :
// la réaction paraît alors artificiellement lente à haute température, ce
// qui est précisément l'inverse de ce que la simulation doit montrer.
var SUBSTEPS_MIN = 4;
// Plafond de sécurité : au-delà on préfère dégrader la précision plutôt que
// de faire chuter le nombre d'images par seconde.
var SUBSTEPS_MAX = 32;
// Déplacement maximal toléré par sous-pas, en fraction du RAYON. Deux
// molécules qui se croisent de front se rapprochent de 2·v·subDt ; ne pas
// tunneler impose 2·v·subDt < 2·r, soit v·subDt < r. On prend la moitié,
// ce qui laisse un facteur 2 de marge.
var MAX_STEP_FRAC = 0.5;

// Période d'échantillonnage de l'historique (ms simulés)
var HISTORY_PERIOD = 200;

// ── Couleurs des espèces (réutilisées par recipient.js et graph.js) ────
// Réactifs A/B : teintes VIVES et saturées, pour repérer d'un coup d'œil
// les réactifs restants au milieu des produits accumulés.
// Produits C/D : teintes TERNES (désaturées), volontairement en retrait.
var SPECIES_COLORS = {
  A: { fill: '#0f7fe0', border: '#0a5498', label: 'A' },
  B: { fill: '#f04a10', border: '#a8300a', label: 'B' },
  C: { fill: '#8fa896', border: '#6a8271', label: 'C' },
  D: { fill: '#a89ab0', border: '#82748a', label: 'D' }
};

// Couleur du catalyseur — anthracite à liseré clair.
//
// Le choix ne joue PAS sur la teinte mais sur la LUMINOSITÉ, seul axe encore
// libre : les quatre espèces occupent déjà le cercle chromatique (A 208°,
// B 15°, C 137°, D 278°) et la meilleure teinte restante n'offrirait qu'une
// marge de ~61°, insuffisante et forcément très lumineuse donc peu contrastée
// sur le fond clair. Aucun objet de la scène n'étant sombre, un anthracite
// tranche immédiatement.
//
// Le contour clair INVERSE le motif visuel de toutes les molécules (fond
// coloré clair + fin contour noir) : l'œil sépare cette inversion avant même
// d'analyser la couleur. Deux bénéfices concrets en classe : la distinction
// survit au daltonisme (elle repose sur la luminosité, alors que l'ancien
// magenta et le mauve D devenaient indistinguables en deutéranopie) comme à
// la vidéoprojection, qui délave les teintes saturées.
var CATA_COLOR = { fill: '#1f2933', border: '#f0f4f8' };

// ── Catalyseurs ──────────────────────────────────────────────────────
// Rayon d'action (distance centre-à-centre à partir de laquelle une molécule
// libre est captée) : 3 diamètres de sphère — valeur intermédiaire entre les
// facteurs 4 (2 diamètres, ×1,16 mesuré) et 8 (4 diamètres, ×1,66 mesuré) sur
// le temps de consommation à 80 % avec 10 catalyseurs, cf. ARCHITECTURE.md ;
// non mesurée précisément pour ce facteur 6 lui-même. Ces mesures dataient
// en outre d'avant l'introduction de l'énergie d'activation : la voie directe
// tournait alors à son débit maximum, ce qui écrasait l'effet catalytique
// relatif quel que soit ce facteur — le contraste réel, aujourd'hui que la
// voie catalytique seule ignore la barrière, est sans doute plus net qu'à
// l'époque de ces chiffres.
var CATA_CAPTURE_RADIUS_FACTOR = 6;   // × molRadius
// Distance en-deçà de laquelle une molécule en approche est considérée comme
// arrivée à son site (le site est un point sur la bordure du catalyseur).
var CATA_ATTACH_DIST_FACTOR = 1.0;    // × molRadius

// Vivacité de l'attraction : la vitesse d'approche vaut ce facteur × la plus
// grande des vitesses en jeu (la sienne, celle du catalyseur à rattraper, ou
// une fraction de la vitesse thermique). Doit rester légèrement supérieur
// à 1 — assez pour rattraper un catalyseur en mouvement, mais pas au point
// que les molécules aient l'air propulsées.
//
// Ce qui rend le captage lisible n'est PAS ce facteur mais la correction de
// l'overshoot (cf. `reach` dans _updateCatalystInteractions) : c'est
// l'orbite autour du site, et non un manque de vitesse, qui donnait
// l'impression que les molécules n'étaient pas attirées.
var CATA_SEEK_SPEED_FACTOR = 1.15;

// Temps de résidence moyen (ms simulées) d'une molécule SEULE sur un site.
// L'adsorption n'est pas un piège : une molécule adsorbée finit par se
// désorber, avec une probabilité constante par unité de temps (donc une
// distribution exponentielle des temps de résidence — le comportement
// physique attendu). Sans cela, les catalyseurs séquestrent définitivement
// les réactifs : dans le cas extrême, la moitié des catalyseurs retiennent
// des A et l'autre des B, plus aucune molécule libre ne circule et la
// réaction se fige alors qu'il reste des réactifs.
// Ne concerne QUE les molécules seules : dès que le second site se remplit,
// la réaction est immédiate, il n'y a pas de fenêtre pour se désorber.
var CATA_RESIDENCE_MS = 1800;

// ══════════════════════════════════════════════════════════════════════
//  Instances de simulation
// ══════════════════════════════════════════════════════════════════════

// Fabrique une instance complète. `index` vaut 1 ou 2 et sert à retrouver
// les éléments du DOM correspondants (suffixe des id : -1 / -2).
function createSim(index) {
  return {
    index: index,

    // ── Molécules : { type:'A'|'B'|'C'|'D', x, y, vx, vy } ──
    molecules: [],

    // ── Quantités initiales pilotées par les sliders (état courant) ──
    N0_A: 50,
    N0_B: 50,
    N_CATA: 0,

    // ── Température ──
    T_C: 20,                              // °C, valeur affichée par le slider
    T_K: simTempFromCelsius(20),          // K, température de simulation associée

    // ── Géométrie du récipient (mise à jour par recipient.js) ──
    boxLeft: 0,
    boxRight: 0,
    boxTop: 0,
    boxBottom: 0,
    _rx1: 0, _rx2: 0, _ry1: 0, _ry2: 0,

    // ── Échelles dépendant de la taille du canvas (cf. recipient.js) ──
    molRadius: 3,             // px
    v0px: V0_PX_DEFAULT,      // px/s à T_REF

    // ── Rendu (renseigné par recipient.js / graph.js) ──
    canvas: null, ctx: null, cw: 0, ch: 0,
    chartCanvas: null, chartCtx: null,
    chartVisible: { A: true, B: true, C: true, D: true },
    chartHover: null,

    // Halo matérialisant le rayon de captage des catalyseurs (checkbox du
    // panneau, activable seulement s'il y a au moins un catalyseur).
    showActionRadius: false,

    // ── Temps simulé cumulé (ms) ──
    simTime: 0,

    // Passe à true dès que A ou B tombe à 0 : la réaction A + B → C + D ne
    // peut plus avoir lieu, l'animation et le tracé de CETTE simulation se
    // figent — indépendamment de l'autre en mode 2 simulations, et même si
    // l'utilisateur laisse le bouton Lancer/Pause sur "Pause" partagé actif.
    finished: false,

    // ── Historique temporel des quantités (fenêtre glissante) ──
    // t en secondes, A/B/C/D en nombre de molécules
    history: { t: [], A: [], B: [], C: [], D: [] },

    // Passe à true quand un point d'historique vient d'être ajouté : le graphe
    // ne se redessine que dans ce cas (5 redraws/s au lieu de 60), cf. ui.js.
    historyDirty: true,

    // Accumulateur interne pour l'échantillonnage de l'historique
    _historyTimer: 0,

    // Grille spatiale de détection des collisions (cf. _collidePairs)
    _grid: [], _gridCols: 0, _gridRows: 0
  };
}

// Les deux instances existent toujours ; seules les `simCount` premières
// sont animées et affichées (cf. activeSims() et setSimCount() dans ui.js).
var sims = [createSim(1), createSim(2)];

// Nombre de simulations affichées (1 par défaut)
var simCount = 1;

// ── Contrôle de l'animation — COMMUN aux deux simulations ──────────────
// Lancer/mettre en pause et la vitesse d'animation agissent sur les deux :
// c'est ce qui permet de comparer deux évolutions « en direct », au même
// temps simulé.
// En pause au chargement de la page : l'élève lance lui-même la réaction.
var paused = true;
var speedFactor = 1;   // multiplie dt avant stepPhysics (×0,10 à ×2,00)

function activeSims() {
  return sims.slice(0, simCount);
}

// ══════════════════════════════════════════════════════════════════════
//  Génération de vitesses — distribution de Maxwell-Boltzmann 2D
// ══════════════════════════════════════════════════════════════════════

// ── Générateur de nombre gaussien (Box-Muller) ────────────────────────
function _gaussRandom(sigma) {
  var u, v, s;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  var factor = sigma * Math.sqrt(-2 * Math.log(s) / s);
  return u * factor;
}

// Vitesse selon Maxwell-Boltzmann 2D (deux gaussiennes indépendantes sur vx/vy)
function randomVelocity(s) {
  var sigma = s.v0px * Math.sqrt(s.T_K / T_REF);
  return { vx: _gaussRandom(sigma), vy: _gaussRandom(sigma) };
}

// ══════════════════════════════════════════════════════════════════════
//  Comptage des espèces et historique
// ══════════════════════════════════════════════════════════════════════

function countSpecies(s) {
  var c = { A: 0, B: 0, C: 0, D: 0 };
  var mols = s.molecules;
  // Les catalyseurs (type 'cata') ne sont pas une espèce comptée ici.
  for (var i = 0; i < mols.length; i++) {
    var t = mols[i].type;
    if (c[t] !== undefined) c[t]++;
  }
  return c;
}

function recordHistoryPoint(s) {
  var c = countSpecies(s);
  var h = s.history;
  h.t.push(s.simTime / 1000);
  h.A.push(c.A); h.B.push(c.B); h.C.push(c.C); h.D.push(c.D);
  s.historyDirty = true;
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation des molécules
// ══════════════════════════════════════════════════════════════════════

// Place N0_A molécules A + N0_B molécules B sans chevauchement dans la boîte.
// Stratégie : grille dimensionnée pour contenir EXACTEMENT les N molécules et
// couvrir toute la zone d'animation (cols × rows ≥ N, proportions du récipient),
// puis mélange Fisher-Yates pour répartir aléatoirement les types A/B.
function initMolecules(s) {
  s.molecules = [];
  var NA = s.N0_A, NB = s.N0_B, NCata = s.N_CATA;
  var N  = NA + NB + NCata;
  var r   = s.molRadius;
  var xlo = s.boxLeft   + r + 1;
  var xhi = s.boxRight  - r - 1;
  var ylo = s.boxTop    + r + 1;
  var yhi = s.boxBottom - r - 1;

  if (xhi > xlo && yhi > ylo && N > 0) {
    var w = xhi - xlo;
    var h = yhi - ylo;

    // Grille couvrant tout le récipient : on choisit cols pour que les cellules
    // soient à peu près carrées (cols/rows ≈ w/h) tout en ayant cols×rows ≥ N.
    var cols = Math.max(1, Math.ceil(Math.sqrt(N * w / h)));
    var rows = Math.max(1, Math.ceil(N / cols));
    var cellW = w / cols;
    var cellH = h / rows;

    var positions = [];
    for (var i = 0; i < cols * rows; i++) {
      positions.push({
        x: xlo + (i % cols + 0.5) * cellW,
        y: ylo + (Math.floor(i / cols) + 0.5) * cellH
      });
    }

    // Mélange Fisher-Yates
    for (var k = positions.length - 1; k > 0; k--) {
      var j = Math.floor(Math.random() * (k + 1));
      var tmp = positions[k]; positions[k] = positions[j]; positions[j] = tmp;
    }

    var types = [];
    for (var a = 0; a < NA; a++) types.push('A');
    for (var b = 0; b < NB; b++) types.push('B');
    for (var g = 0; g < NCata; g++) types.push('cata');

    // Jitter maximal : reste dans la cellule sans chevaucher la voisine
    var jitX = Math.max(0, (cellW - 2 * r - 1) / 2);
    var jitY = Math.max(0, (cellH - 2 * r - 1) / 2);

    for (var m = 0; m < N; m++) {
      var pos = positions[m];
      var vel = randomVelocity(s);
      var mol = {
        type: types[m],
        x: pos.x + (Math.random() * 2 - 1) * jitX,
        y: pos.y + (Math.random() * 2 - 1) * jitY,
        vx: vel.vx, vy: vel.vy,
        // état de capture : 'free' | 'seeking' (en approche d'un site) |
        // 'attached' (fixée sur un site) — seules A/B l'utilisent.
        // seekSpeed : norme de la vitesse d'approche, figée à la capture.
        // lastCata : catalyseur dont elle vient de se désorber, qui ne peut
        // pas la recapter tant qu'elle n'est pas sortie de son rayon.
        state: 'free', target: null, seekSpeed: 0, lastCata: null
      };
      // Un catalyseur dispose de 2 sites (occupant : molécule ou null).
      // `incoming` : site déjà visé par une molécule en vol guidé, recalculé
      // à chaque frame (cf. _updateCatalystInteractions).
      if (types[m] === 'cata') {
        mol.sites = [null, null];
        mol.incoming = [false, false];
      }
      s.molecules.push(mol);
    }
  }

  s.simTime = 0;
  s._historyTimer = 0;
  s.history = { t: [], A: [], B: [], C: [], D: [] };
  // Un réactif à 0 dès le départ (ex. N_A = 0) fige tout de suite : la
  // réaction ne peut pas avoir lieu, inutile d'attendre un premier choc.
  s.finished = (s.N0_A === 0 || s.N0_B === 0);
  recordHistoryPoint(s);
}

// ══════════════════════════════════════════════════════════════════════
//  Modification dynamique des paramètres
// ══════════════════════════════════════════════════════════════════════

// Rescale instantané des vitesses quand T change (consigne en °C)
function setTemperature(s, T_C_new) {
  var T_new = simTempFromCelsius(T_C_new);
  if (T_new <= 0) return;
  var ratio = Math.sqrt(T_new / s.T_K);
  for (var i = 0; i < s.molecules.length; i++) {
    s.molecules[i].vx *= ratio;
    s.molecules[i].vy *= ratio;
  }
  s.T_C = T_C_new;
  s.T_K = T_new;
}

// Change la quantité initiale d'une espèce réactive (A ou B).
// Un tel changement redéfinit les conditions initiales de la réaction :
// on remet donc l'animation à zéro (et en pause) plutôt que d'injecter des
// molécules en cours de route, pour que la courbe affichée corresponde
// toujours à une seule et même expérience.
//
// En mode 2 simulations, deux cas :
// - si l'une des simulations affichées a déjà commencé à évoluer (simTime > 0,
//   donc a été lancée au moins une fois depuis la dernière RAZ), on ne peut pas
//   ne repositionner QUE celle qu'on modifie : les deux courbes doivent redémarrer
//   ensemble pour rester comparables sur le même axe des temps → RAZ complète ;
// - si aucune n'a encore été lancée (t=0 des deux côtés, réglage des paramètres
//   avant le premier "Lancer"), repositionner l'autre simulation n'aurait aucun
//   effet utile — elle est déjà à t=0 — mais lui ferait perdre son placement
//   aléatoire initial sans raison. On ne touche donc qu'à `s`.
function setSpeciesCount(s, type, target) {
  if (type === 'A') s.N0_A = target; else s.N0_B = target;

  var anyStarted = activeSims().some(function (sim) { return sim.simTime > 0; });
  if (anyStarted) {
    resetSim();
  } else {
    paused = true;
    initMolecules(s);
    if (typeof syncUIToSim === 'function') syncUIToSim();
  }
}

// Change le nombre de catalyseurs — même logique de RAZ que setSpeciesCount
// (une nouvelle quantité de catalyseurs redéfinit l'expérience).
function setCatalystCount(s, target) {
  s.N_CATA = target;

  var anyStarted = activeSims().some(function (sim) { return sim.simTime > 0; });
  if (anyStarted) {
    resetSim();
  } else {
    paused = true;
    initMolecules(s);
    if (typeof syncUIToSim === 'function') syncUIToSim();
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Intégration physique — un pas de temps
// ══════════════════════════════════════════════════════════════════════

function stepPhysics(s, dt_ms) {
  if (dt_ms <= 0 || s.finished) return;
  var dt_s = dt_ms / 1000;

  s.simTime += dt_ms;

  // Capture/relargage par les catalyseurs : calculé une fois par frame (pas
  // par sous-pas), sur les positions du début de frame.
  _updateCatalystInteractions(s, dt_ms);

  var nSub  = _requiredSubsteps(s, dt_s);
  var subDt = dt_s / nSub;
  for (var sub = 0; sub < nSub; sub++) {
    _moveAll(s, subDt);
    // Les molécules fixées suivent leur catalyseur : repositionnées après
    // chaque déplacement plutôt que déplacées par intégration indépendante
    // (cf. _moveAll), pour que leur hitbox reste juste à chaque sous-pas.
    _syncAttachedPositions(s);
    _collidePairs(s);
    _collideWalls(s);
    _syncAttachedPositions(s);
  }

  s._historyTimer += dt_ms;
  if (s._historyTimer >= HISTORY_PERIOD) {
    s._historyTimer = 0;
    recordHistoryPoint(s);
  }

  // Réactif épuisé : la réaction A + B → C + D ne peut plus avoir lieu.
  // On fige immédiatement (animation ET graphe) plutôt que d'attendre la
  // prochaine RAZ — un point d'historique final est enregistré tout de
  // suite si ce n'était pas déjà fait, pour que la courbe s'arrête pile
  // sur l'instant de l'épuisement plutôt que de laisser un plat jusqu'au
  // prochain échantillon prévu 200 ms plus tard.
  var c = countSpecies(s);
  if (c.A === 0 || c.B === 0) {
    s.finished = true;
    if (s._historyTimer !== 0) {
      s._historyTimer = 0;
      recordHistoryPoint(s);
    }
  }
}

// ── Nombre de sous-pas nécessaires pour cette frame ────────────────────
// On dimensionne sur la molécule la PLUS rapide : c'est elle qui tunnelle
// en premier. Le balayage est en O(N) (≤ 300 itérations), soit un coût
// négligeable devant celui des sous-pas qu'il permet d'économiser quand
// les vitesses sont faibles.
function _requiredSubsteps(s, dt_s) {
  var mols  = s.molecules;
  var v2max = 0;
  for (var i = 0; i < mols.length; i++) {
    var v2 = mols[i].vx * mols[i].vx + mols[i].vy * mols[i].vy;
    if (v2 > v2max) v2max = v2;
  }
  if (v2max === 0) return SUBSTEPS_MIN;

  var travel = Math.sqrt(v2max) * dt_s;      // px parcourus sur la frame
  var budget = s.molRadius * MAX_STEP_FRAC;  // px tolérés par sous-pas
  var n = Math.ceil(travel / budget);
  if (n < SUBSTEPS_MIN) return SUBSTEPS_MIN;
  if (n > SUBSTEPS_MAX) return SUBSTEPS_MAX;
  return n;
}

// ── Avance toutes les positions (mouvement rectiligne uniforme) ────────
function _moveAll(s, dt) {
  var mols = s.molecules;
  for (var i = 0; i < mols.length; i++) {
    // Une molécule fixée à un catalyseur ne bouge pas toute seule : elle est
    // repositionnée sur son site par _syncAttachedPositions().
    if (mols[i].state === 'attached') continue;
    mols[i].x += mols[i].vx * dt;
    mols[i].y += mols[i].vy * dt;
  }
}

// ── Collisions avec les 4 parois du récipient ──────────────────────────
function _collideWalls(s) {
  var mols = s.molecules;
  var r    = s.molRadius;
  var xlo  = s.boxLeft   + r;
  var xhi  = s.boxRight  - r;
  var ylo  = s.boxTop    + r;
  var yhi  = s.boxBottom - r;

  for (var i = 0; i < mols.length; i++) {
    var m = mols[i];
    // Une molécule attachée n'a pas de dynamique propre : c'est son
    // catalyseur qui rebondit, en tenant compte d'elle (ci-dessous).
    if (m.state === 'attached') continue;

    var mxlo = xlo, mxhi = xhi;
    // Un catalyseur porteur déborde de 2r du côté du site occupé (site posé
    // sur la bordure à ±r, molécule de rayon r) : sans ça, la molécule
    // attachée traverserait la paroi.
    if (m.type === 'cata') {
      if (m.sites[0]) mxlo = s.boxLeft  + 2 * r;
      if (m.sites[1]) mxhi = s.boxRight - 2 * r;
    }

    if (m.x < mxlo) { m.x = 2 * mxlo - m.x; if (m.vx < 0) m.vx = -m.vx; }
    if (m.x > mxhi) { m.x = 2 * mxhi - m.x; if (m.vx > 0) m.vx = -m.vx; }
    if (m.y < ylo) { m.y = 2 * ylo - m.y; if (m.vy < 0) m.vy = -m.vy; }
    if (m.y > yhi) { m.y = 2 * yhi - m.y; if (m.vy > 0) m.vy = -m.vy; }
  }
}

// Une paire est réactive uniquement si elle associe une molécule A et une
// molécule B (dans n'importe quel ordre).
function _isReactive(t1, t2) {
  return (t1 === 'A' && t2 === 'B') || (t1 === 'B' && t2 === 'A');
}

// ── Résolution d'une paire en contact : choc élastique, ou réaction ────
//
// Réaction A + B → C + D (choc efficace) : la quantité de mouvement totale
// du couple est conservée. On part de la vitesse du centre de masse
// vG = (vA+vB)/2, puis on ajoute à C et on retranche à D un même vecteur
// perpendiculaire à la normale de choc (± vrel_n/2, sens tiré au hasard) :
//   vC = vG + kick,  vD = vG - kick
// La somme vC + vD = 2·vG = vA + vB est conservée EXACTEMENT quel que soit
// ce vecteur, puisqu'il s'annule dans la somme — c'est ce qui autorise à
// faire diverger C et D (au lieu de leur donner la même vitesse) sans jamais
// rompre la conservation de la quantité de mouvement. Sans ce kick, C et D
// repartiraient à l'identique, collés, en translation parallèle : un résultat
// certes conservatif mais qui ne ressemble à aucune collision réelle.
// L'énergie cinétique du système, elle, n'est volontairement PAS conservée
// lors d'une réaction (comportement assumé, analogue à une transformation
// chimique exo/endothermique simplifiée — ce n'est pas un choc élastique).
// ── Corps rigides {catalyseur + molécule(s) attachée(s)} ───────────────
// Une molécule fixée à un site garde sa hitbox (elle peut être percutée)
// mais elle n'a plus de vitesse propre : l'ensemble du bloc ne possède
// qu'UNE vitesse, portée par le catalyseur, et les molécules attachées ne
// font que la refléter (cf. _syncAttachedPositions).
//
// C'est le point crucial pour la stabilité : donner sa propre vitesse à
// chaque membre du bloc puis laisser chacun la transmettre lors d'un choc
// reviendrait à créer de l'énergie cinétique à chaque collision (un bloc de
// 3 corps à la vitesse v porte 3 fois l'énergie d'un seul), et la
// distribution des vitesses divergerait en quelques secondes.
//
// `_bodyOf(m)` renvoie donc le corps dont `m` fait partie : le catalyseur si
// `m` lui est lié, `m` elle-même sinon. Toute la dynamique (vitesse, masse,
// déplacement) se raisonne sur les CORPS, la géométrie du contact sur les
// hitboxes individuelles.
function _bodyOf(m) {
  if (m.type === 'cata') return m;
  if (m.state === 'attached') return m.target.cata;
  return m;
}

// Un bloc chargé compte pour UNE SEULE masse, comme une molécule isolée —
// et non pour la somme de ses membres. C'est contre-intuitif mais c'est la
// condition de stabilité : une molécule qui s'accroche adopte la vitesse du
// catalyseur sans que celui-ci ralentisse (le catalyseur n'est pas modifié
// par ce qu'il porte, cf. _updateCatalystInteractions). Compter le bloc
// comme une masse 2 ou 3 reviendrait donc à créer de l'énergie cinétique à
// chaque capture, puis à la redistribuer aux molécules libres à chaque choc.
//
// Le bloc échangeant exactement comme une molécule isolée, les chocs
// conservent rigoureusement l'énergie du système comptée sur les CORPS. Une
// molécule captée en sort temporairement (elle n'a plus de vitesse propre)
// et y revient avec une vitesse thermique fraîche au moment de la réaction :
// le système se thermalise au lieu de diverger.

function _resolvePair(mi, mj, diam, diam2, vAct) {
  // Une molécule en approche d'un site est en VOL GUIDÉ : sa vitesse est
  // réimposée à chaque frame par _updateCatalystInteractions. Si elle
  // participait aux chocs, l'énergie qu'elle cède à une voisine lui serait
  // aussitôt restituée par cette réécriture — une pompe à énergie sans fond
  // (mesuré : +1,3·10⁹ en 400 pas, la simulation partait en vrille).
  // Elle traverse donc les autres molécules, sur un trajet volontairement
  // court (rayon de captage = 2 diamètres).
  if (mi.state === 'seeking' || mj.state === 'seeking') return;

  var bi = _bodyOf(mi);
  var bj = _bodyOf(mj);
  // Le catalyseur et ses propres molécules attachées se chevauchent par
  // construction (site posé sur la bordure) : ce n'est pas une collision.
  if (bi === bj) return;

  // Géométrie du contact : positions des hitboxes réellement en contact.
  var dx = mj.x - mi.x;
  var dy = mj.y - mi.y;
  var dist2 = dx * dx + dy * dy;
  if (dist2 >= diam2 || dist2 === 0) return;

  var dist = Math.sqrt(dist2);
  var nx = dx / dist;
  var ny = dy / dist;

  // Dynamique : vitesses des CORPS, pas des hitboxes.
  var vrel_n = (bi.vx - bj.vx) * nx + (bi.vy - bj.vy) * ny;
  if (vrel_n <= 0) return;   // ils s'éloignent déjà

  var linked = (bi !== mi) || (bj !== mj);

  // Choc EFFICACE : il faut réunir trois conditions.
  //  - une paire A + B ;
  //  - aucune des deux fixée à un catalyseur (une molécule adsorbée ne réagit
  //    que par le remplissage de l'autre site, pas par un choc) ;
  //  - une vitesse d'approche supérieure à l'énergie d'activation.
  // Sinon la paire rebondit simplement (choc élastique, plus bas).
  if (_isReactive(mi.type, mj.type) && !linked && vrel_n >= vAct) {
    var vgx = (mi.vx + mj.vx) / 2;
    var vgy = (mi.vy + mj.vy) / 2;
    // Vecteur perpendiculaire à la normale de choc, tangent au contact.
    var tx = -ny, ty = nx;
    var sign = Math.random() < 0.5 ? 1 : -1;
    var kick = sign * 0.5 * vrel_n;
    mi.type = 'C'; mi.vx = vgx + kick * tx; mi.vy = vgy + kick * ty;
    mj.type = 'D'; mj.vx = vgx - kick * tx; mj.vy = vgy - kick * ty;
    // Une molécule en approche d'un catalyseur peut réagir via un choc
    // classique avant d'atteindre son site : elle abandonne alors la capture.
    mi.state = 'free'; mi.target = null;
    mj.state = 'free'; mj.target = null;
    // ── Séparation positionnelle anti-sticking ──
    var overlapR = diam - dist;
    var halfR = (overlapR / 2) + 0.5;
    mi.x -= nx * halfR; mi.y -= ny * halfR;
    mj.x += nx * halfR; mj.y += ny * halfR;
    return;
  }

  // ── Choc élastique standard (échange de la composante normale) ──
  // Appliqué aux CORPS : percuter une molécule attachée revient à percuter
  // son catalyseur, et c'est le bloc entier qui repart avec la nouvelle
  // vitesse (les molécules portées la reflètent, cf. _syncAttachedPositions).
  bi.vx -= vrel_n * nx;
  bi.vy -= vrel_n * ny;
  bj.vx += vrel_n * nx;
  bj.vy += vrel_n * ny;

  // ── Séparation positionnelle anti-sticking ──
  // On écarte les CORPS (une molécule attachée sera repositionnée sur son
  // site juste après).
  var overlap = diam - dist;
  var half = (overlap / 2) + 0.5;
  bi.x -= nx * half; bi.y -= ny * half;
  bj.x += nx * half; bj.y += ny * half;
}

// ── Détection des collisions par grille spatiale ───────────────────────
// Un balayage naïf de toutes les paires est en O(N²) : à N = 300 molécules
// et 4 sous-pas, cela fait ~180 000 tests par frame, soit ~11 M/s — d'où des
// à-coups sur des machines modestes. Comme deux molécules ne peuvent se
// toucher qu'à une distance ≤ diamètre, on range les molécules dans une
// grille de cellules de côté ≥ diamètre : chaque molécule n'est alors testée
// que contre celles de sa cellule et des 8 cellules voisines, ce qui ramène
// le coût à O(N) (le nombre de voisins par cellule ne dépend pas de N mais
// de la densité).
// La grille est stockée SUR l'instance (s._grid) : deux simulations animées
// dans la même frame ne doivent pas se partager les buckets.

// Décalages couvrant les 8 voisines sans traiter deux fois la même paire :
// la cellule elle-même (avec j > i), puis droite, bas-gauche, bas, bas-droite.
var _GRID_NEIGHBOURS = [[1, 0], [-1, 1], [0, 1], [1, 1]];

function _collidePairs(s) {
  var mols = s.molecules;
  var n = mols.length;
  if (n < 2) return;

  var diam  = 2 * s.molRadius;
  var diam2 = diam * diam;

  // Seuil d'activation en px/s, constant sur toute la passe (il ne dépend
  // que de la géométrie du récipient, jamais de la température).
  var vAct = ACTIVATION_SPEED_FACTOR * s.v0px;

  // Côté de cellule = 2 diamètres : assez grand pour garder peu de cellules
  // à vider, assez petit pour que peu de molécules tombent dans chacune.
  var cell = Math.max(1, diam * 2);
  var x0 = s.boxLeft, y0 = s.boxTop;
  var cols = Math.max(1, Math.ceil((s.boxRight - x0) / cell));
  var rows = Math.max(1, Math.ceil((s.boxBottom - y0) / cell));

  if (cols !== s._gridCols || rows !== s._gridRows) {
    s._grid = new Array(cols * rows);
    for (var g = 0; g < s._grid.length; g++) s._grid[g] = [];
    s._gridCols = cols; s._gridRows = rows;
  } else {
    for (var g2 = 0; g2 < s._grid.length; g2++) s._grid[g2].length = 0;
  }

  var grid = s._grid;

  // ── Remplissage ──
  for (var i = 0; i < n; i++) {
    var cx = Math.floor((mols[i].x - x0) / cell);
    var cy = Math.floor((mols[i].y - y0) / cell);
    if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
    if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
    grid[cy * cols + cx].push(i);
  }

  // ── Parcours cellule par cellule ──
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var bucket = grid[r * cols + c];
      var bl = bucket.length;
      if (bl === 0) continue;

      // Paires internes à la cellule
      for (var a = 0; a < bl - 1; a++) {
        for (var b = a + 1; b < bl; b++) {
          _resolvePair(mols[bucket[a]], mols[bucket[b]], diam, diam2, vAct);
        }
      }

      // Paires avec les cellules voisines "en avant"
      for (var k = 0; k < _GRID_NEIGHBOURS.length; k++) {
        var nc = c + _GRID_NEIGHBOURS[k][0];
        var nr = r + _GRID_NEIGHBOURS[k][1];
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        var other = grid[nr * cols + nc];
        var ol = other.length;
        for (var p = 0; p < bl; p++) {
          for (var q = 0; q < ol; q++) {
            _resolvePair(mols[bucket[p]], mols[other[q]], diam, diam2, vAct);
          }
        }
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Catalyseurs — capture, approche et réaction sur site
// ══════════════════════════════════════════════════════════════════════
//
// Un catalyseur ('cata') a 2 sites, chacun repéré par un point sur sa
// bordure (extrémités du diamètre HORIZONTAL — fixe, un catalyseur ne
// tourne pas visuellement). Chaque site peut capter indifféremment une
// molécule A ou B tant que l'autre site est vide ; dès qu'un site est
// occupé, l'autre ne peut plus capter que le type opposé — c'est cette
// règle qui garantit que 2 sites occupés signifient toujours 1 A + 1 B.

function _catalystSitePos(cata, siteIndex, r) {
  return { x: cata.x + (siteIndex === 0 ? -r : r), y: cata.y };
}

// Renvoie l'indice d'un site libre pouvant capter `type`, ou -1.
function _catalystEligibleSite(cata, type) {
  var occupantType = null;
  if (cata.sites[0]) occupantType = cata.sites[0].type;
  else if (cata.sites[1]) occupantType = cata.sites[1].type;

  for (var i = 0; i < 2; i++) {
    if (cata.sites[i] !== null) continue;
    if (occupantType !== null && occupantType === type) continue;
    return i;
  }
  return -1;
}

// Les 2 sites occupés valent toujours 1 A + 1 B (garanti à la capture par
// _catalystEligibleSite ET revérifié à l'attachement, cf. phase 2) : la
// réaction a lieu, les deux molécules deviennent C et D et sont relâchées,
// libérant le catalyseur pour un nouveau cycle.
//
// Une molécule accrochée garde son type tant que la réaction n'a pas eu
// lieu : elle continue donc d'être comptée dans A ou B par countSpecies(),
// et n'est jamais « consommée » d'avance. C'est ce qui fait que A et B
// décroissent bien en 1 pour 1 sur le graphe.
function _tryCatalystReaction(s, cata) {
  var mA = cata.sites[0], mB = cata.sites[1];
  if (!mA || !mB) return;

  // Vitesse tirée dans la distribution de Maxwell-Boltzmann de la
  // température courante — indépendante de la vitesse du catalyseur, pour
  // ne pas propager une dérive éventuelle de celle-ci aux produits relâchés.
  var velA = randomVelocity(s);
  var velB = randomVelocity(s);

  mA.type = 'C'; mA.state = 'free'; mA.target = null;
  mA.vx = velA.vx; mA.vy = velA.vy;

  mB.type = 'D'; mB.state = 'free'; mB.target = null;
  mB.vx = velB.vx; mB.vy = velB.vy;

  cata.sites[0] = null; cata.sites[1] = null;
}

// Repositionne exactement les molécules fixées sur leur site, après que les
// catalyseurs ont bougé (mouvement + collisions) dans la frame.
function _syncAttachedPositions(s) {
  var mols = s.molecules;
  for (var i = 0; i < mols.length; i++) {
    var mol = mols[i];
    if (mol.state !== 'attached') continue;
    var cata = mol.target.cata;
    var pos = _catalystSitePos(cata, mol.target.site, s.molRadius);
    mol.x = pos.x; mol.y = pos.y;
    mol.vx = cata.vx; mol.vy = cata.vy;
  }
}

// Une molécule renonce à sa capture (le site a été pris avant elle) et
// reprend son mouvement rectiligne uniforme. Sa vitesse est retirée de la
// distribution thermique courante plutôt que conservée : pendant le vol
// guidé elle valait `seekSpeed`, une valeur imposée qui n'appartient pas à
// la distribution de Maxwell-Boltzmann et qui réchaufferait le système à
// chaque capture manquée.
function _releaseSeeker(s, mol) {
  var vel = randomVelocity(s);
  mol.state = 'free';
  mol.target = null;
  mol.vx = vel.vx;
  mol.vy = vel.vy;
}

function _updateCatalystInteractions(s, dt_ms) {
  var mols = s.molecules;
  var r = s.molRadius;
  var capR  = CATA_CAPTURE_RADIUS_FACTOR * r;
  var capR2 = capR * capR;
  var attachDist = CATA_ATTACH_DIST_FACTOR * r;

  var catalysts = [];
  for (var i = 0; i < mols.length; i++) {
    if (mols[i].type === 'cata') catalysts.push(mols[i]);
  }
  if (catalysts.length === 0) return;

  // ── 0. Recensement des captages en cours ─────────────────────────────
  // Quels sites sont déjà visés par une molécule en vol guidé. Sert à ne
  // pas désorber une molécule dont le partenaire est en route (ci-dessous).
  for (var q = 0; q < catalysts.length; q++) {
    catalysts[q].incoming[0] = false;
    catalysts[q].incoming[1] = false;
  }
  for (var w = 0; w < mols.length; w++) {
    var mw = mols[w];
    if (mw.state === 'seeking' && mw.target) {
      mw.target.cata.incoming[mw.target.site] = true;
    }
  }

  // ── 1. Désorption spontanée ──────────────────────────────────────────
  // Une molécule restée SEULE sur un catalyseur peut se détacher : sans
  // cela, les catalyseurs finiraient par séquestrer définitivement les
  // réactifs (cf. CATA_RESIDENCE_MS). Probabilité constante par unité de
  // temps ⇒ temps de résidence distribué exponentiellement.
  var pDesorb = 1 - Math.exp(-dt_ms / CATA_RESIDENCE_MS);
  for (var d = 0; d < catalysts.length; d++) {
    var cd = catalysts[d];
    // Deux sites occupés : la réaction a déjà eu lieu dans la même frame,
    // il n'y a jamais de molécule à désorber ici.
    for (var si = 0; si < 2; si++) {
      var occ = cd.sites[si];
      if (!occ || cd.sites[1 - si]) continue;
      // Le partenaire manquant est déjà en vol guidé vers l'autre site :
      // la molécule l'attend au lieu de partir juste avant son arrivée.
      if (cd.incoming[1 - si]) continue;
      if (Math.random() >= pDesorb) continue;
      var velD = randomVelocity(s);
      occ.state = 'free';
      occ.target = null;
      occ.vx = velD.vx; occ.vy = velD.vy;
      // Sans ce marqueur, la molécule — encore au contact du catalyseur,
      // donc largement dans son rayon d'action — serait recaptée par lui
      // dès la frame suivante et la désorption ne servirait à rien. Elle
      // reste captable par les AUTRES catalyseurs.
      occ.lastCata = cd;
      cd.sites[si] = null;
    }
  }

  // ── 2. Molécules libres entrant dans le rayon d'action → mise en approche
  //       Molécules déjà en approche → vérifier que leur site cible est
  //       toujours disponible (sinon la première arrivée l'a pris avant
  //       elles : elles reprennent leur mouvement rectiligne uniforme).
  for (var m = 0; m < mols.length; m++) {
    var mol = mols[m];
    if (mol.type !== 'A' && mol.type !== 'B') continue;

    if (mol.state === 'seeking') {
      var t = mol.target;
      if (t.cata.sites[t.site] !== null && t.cata.sites[t.site] !== mol) {
        _releaseSeeker(s, mol);
      }
      continue;
    }

    if (mol.state !== 'free') continue;

    // Le catalyseur dont elle vient de se désorber redevient captable une
    // fois qu'elle est sortie de son rayon d'action.
    if (mol.lastCata) {
      var dlx = mol.x - mol.lastCata.x, dly = mol.y - mol.lastCata.y;
      if (dlx * dlx + dly * dly > capR2) mol.lastCata = null;
    }

    for (var c = 0; c < catalysts.length; c++) {
      var cata = catalysts[c];
      if (cata === mol.lastCata) continue;
      var dx = mol.x - cata.x, dy = mol.y - cata.y;
      if (dx * dx + dy * dy > capR2) continue;
      var site = _catalystEligibleSite(cata, mol.type);
      if (site === -1) continue;
      mol.state = 'seeking';
      mol.target = { cata: cata, site: site };
      // Norme de la vitesse d'approche, FIXÉE une fois pour toutes ici : sa
      // propre vitesse du moment, relevée si besoin pour pouvoir rattraper
      // le catalyseur. La recalculer à chaque frame ferait d'une molécule en
      // approche une pompe à énergie — elle regagnerait aussitôt ce qu'elle
      // cède dans un choc, et la distribution des vitesses dériverait.
      var ownSpeed = Math.sqrt(mol.vx * mol.vx + mol.vy * mol.vy);
      var cataSpeed = Math.sqrt(cata.vx * cata.vx + cata.vy * cata.vy);
      // Le plancher (demi vitesse thermique moyenne) évite qu'une molécule
      // lente traîne indéfiniment en approche.
      var floorSpeed = 0.5 * s.v0px * Math.sqrt(s.T_K / T_REF);
      mol.seekSpeed = CATA_SEEK_SPEED_FACTOR *
                      Math.max(ownSpeed, cataSpeed, floorSpeed);
      break;
    }
  }

  // ── 3. Molécules en approche : direction vers le site (recalculée à
  //       chaque frame car le catalyseur bouge), vitesse boostée si besoin
  //       pour le rattraper. Arrivée → fixation puis tentative de réaction.
  for (var m2 = 0; m2 < mols.length; m2++) {
    var mol2 = mols[m2];
    if (mol2.state !== 'seeking') continue;

    var cata2 = mol2.target.cata, site2 = mol2.target.site;
    var pos = _catalystSitePos(cata2, site2, r);
    var ddx = pos.x - mol2.x, ddy = pos.y - mol2.y;
    var dist = Math.sqrt(ddx * ddx + ddy * ddy);

    // On s'accroche aussi dès que le site est à portée du déplacement de la
    // frame : sinon, une molécule rapide dépasse le point du site à chaque
    // pas sans jamais entrer dans `attachDist`, et se met à orbiter autour
    // du catalyseur au lieu de s'y adsorber.
    var reach = mol2.seekSpeed * (dt_ms / 1000);
    if (dist <= attachDist || dist <= reach) {
      // Le type doit être revérifié ICI, à l'arrivée, et pas seulement au
      // départ : le vol guidé dure plusieurs frames, pendant lesquelles le
      // catalyseur peut avoir complètement changé d'état. Cas concret :
      // la molécule vise le site libre d'un catalyseur portant une A ; une
      // réaction vide entre-temps les deux sites ; une autre B s'accroche à
      // l'autre site ; la molécule arrive et se retrouverait accrochée face
      // à une molécule de son propre type. Sans cette revérification, deux
      // molécules identiques finissent sur le même catalyseur, qui ne peut
      // alors plus jamais réagir.
      var other = cata2.sites[1 - site2];
      if (cata2.sites[site2] === null && (!other || other.type !== mol2.type)) {
        cata2.sites[site2] = mol2;
        mol2.state = 'attached';
        mol2.x = pos.x; mol2.y = pos.y;
        mol2.vx = cata2.vx; mol2.vy = cata2.vy;
        _tryCatalystReaction(s, cata2);
      } else {
        // Site pris entre-temps, ou occupant devenu incompatible : elle repart.
        _releaseSeeker(s, mol2);
      }
      continue;
    }

    // Seule la DIRECTION est réorientée vers le site (le catalyseur bouge) ;
    // la norme reste celle fixée au moment de la capture (cf. seekSpeed).
    var speed = mol2.seekSpeed;
    mol2.vx = (ddx / dist) * speed;
    mol2.vy = (ddy / dist) * speed;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Réinitialisation
// ══════════════════════════════════════════════════════════════════════
// Conserve la température et les quantités N0_A/N0_B actuellement réglées
// par l'utilisateur (RAZ = relancer la simulation avec les paramètres en
// cours, pas revenir aux valeurs par défaut). L'animation repart en pause :
// l'élève relance lui-même la réaction.
// La RAZ porte toujours sur TOUTES les simulations affichées, pour qu'elles
// démarrent au même instant et restent comparables.
function resetSim() {
  paused = true;
  activeSims().forEach(initMolecules);
  if (typeof syncUIToSim === 'function') syncUIToSim();
}
