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
//
//  Différences avec cinetique/ (dont cette page est dérivée) :
//  - réaction RÉVERSIBLE A + B ⇌ C + D (au lieu d'un sens unique) ;
//  - ni température, ni catalyseur : le seul degré de liberté sur
//    l'efficacité des chocs est donné par deux sliders « Probabilité »
//    (un par sens de réaction), exprimés directement en % de chocs
//    efficaces plutôt qu'en énergie d'activation ;
//  - quantités initiales réglables pour les 4 espèces A/B/C/D.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Constantes physiques et de simulation ──────────────────────────────
// Vitesse thermique de base en px/s (recalibrée par instance dans resize()).
// Contrairement à cinetique/, il n'y a pas de réglage de température : cette
// échelle est purement géométrique et reste constante pendant l'expérience.
var V0_PX_DEFAULT = 180;

// ── Rayon des molécules : fraction de la largeur intérieure, dépendant de N ──
// Un rayon plus petit augmente le LIBRE PARCOURS MOYEN à densité égale
// (ℓ ∝ 1/diamètre en 2D) — donc le coefficient de diffusion (D ∝ v·ℓ). C'est
// ce rapport diffusion/réaction (nombre de Damköhler) qui gouverne la
// ségrégation spatiale des réactifs observée à forte probabilité de
// réaction : plus la diffusion est rapide devant la réaction, moins des
// poches locales appauvries en A ou en B ont le temps de se former avant
// d'être réapprovisionnées par le mélange.
//
// En dessous de `MOL_RADIUS_N_FULL` molécules affichées (total des 4
// espèces d'UNE simulation), le rayon reste celui de cinetique/ (aucun
// besoin de compenser, la densité est faible) ; au-delà, il diminue
// linéairement jusqu'à `MOL_RADIUS_FRAC_MIN`, atteint à
// `MOL_RADIUS_N_REDUCED` molécules (le maximum atteignable avec les 4
// sliders à 300). Un rayon plus petit ralentit aussi la fréquence des chocs
// (donc la réaction globale), mais c'est le RATIO diffusion/réaction qui
// compte ici, pas la valeur absolue de chacun.
var MOL_RADIUS_FRAC_FULL = 0.007;          // taille pleine (= cinetique/)
var MOL_RADIUS_FRAC_MIN  = 0.007 * 0.45;   // taille réduite, au plancher
var MOL_RADIUS_N_FULL    = 600;            // en-deçà : taille pleine
var MOL_RADIUS_N_REDUCED = 1200;           // à partir de : taille réduite

// Fraction de rayon à appliquer pour un total `nTotal` de molécules
// affichées (une seule simulation, N_A+N_B+N_C+N_D).
function molRadiusFrac(nTotal) {
  if (nTotal <= MOL_RADIUS_N_FULL) return MOL_RADIUS_FRAC_FULL;
  if (nTotal >= MOL_RADIUS_N_REDUCED) return MOL_RADIUS_FRAC_MIN;
  var t = (nTotal - MOL_RADIUS_N_FULL) / (MOL_RADIUS_N_REDUCED - MOL_RADIUS_N_FULL);
  return MOL_RADIUS_FRAC_FULL + t * (MOL_RADIUS_FRAC_MIN - MOL_RADIUS_FRAC_FULL);
}

// ── Sous-pas d'intégration par frame (anti-tunneling) ──────────────────
var SUBSTEPS_MIN = 4;
var SUBSTEPS_MAX = 32;
var MAX_STEP_FRAC = 0.5;

// Période d'échantillonnage de l'historique (ms simulés)
var HISTORY_PERIOD = 200;

// ── Durée maximale enregistrée dans l'historique du graphe (ms simulés) ──
// Au-delà, `recordHistoryPoint` cesse d'ALLONGER `s.history` : le graphe
// N(t) se fige sur ses 5 premières minutes. Deux raisons :
//  - pédagogique : tout ce qui porte le propos (la montée puis le plateau
//    d'équilibre) se joue très en amont de cette limite ; laisser l'axe des
//    temps s'étirer indéfiniment ne fait qu'écraser cette partie-là ;
//  - performance : sans borne, le coût de tracé du graphe (un `lineTo` par
//    point et par courbe, cf. graph.js) croît linéairement avec la durée de
//    la séance. 5 min = 1500 points, soit ~4 points par pixel de large sur
//    un graphe typique : la borne est atteinte bien après que la courbe a
//    cessé d'apporter de l'information nouvelle.
// La simulation, elle, continue normalement : molécules, frise et moyenne
// glissante de Qr restent vivants (cf. _pushQrSample, qui est alimenté même
// une fois l'historique figé).
var HISTORY_MAX_MS = 300000;   // 5 min

// ── Fenêtre de moyennage du quotient de réaction (ms simulés) ──────────
// Qr instantané fluctue beaucoup : son écart-type relatif vaut
// √(1/N_A + 1/N_B + 1/N_C + 1/N_D), soit ~±40 % avec une centaine de
// molécules — un bruit intrinsèque, pas un défaut de simulation (c'est
// justement parce que N ~ 10²³ en chimie réelle que K apparaît comme une
// constante bien définie). Moyenner sur 40 s de temps simulé, soit
// 40000/200 = 200 points d'historique, divise ce bruit par ~14 : le
// marqueur de la frise vient alors visiblement se coller à K.
var QR_AVG_WINDOW_MS = 40000;

// Nombre d'échantillons couvrant cette fenêtre (200 points).
var QR_AVG_SAMPLES = Math.round(QR_AVG_WINDOW_MS / HISTORY_PERIOD);

// ── Couleurs des espèces (réutilisées par recipient.js, graph.js, frise.js) ──
// Contrairement à cinetique/, C et D ne sont pas de simples « produits en
// retrait » : la réaction étant réversible, ils sont tour à tour réactifs
// et produits selon le sens en cours. Les 4 espèces sont donc en teintes
// VIVES et bien séparées sur le cercle chromatique (A 208° bleu, B 15°
// rouge-orangé, C 130° vert franc, D 48° jaune), plutôt que de désaturer
// C/D comme le faisait cinetique/. `border` ne sert qu'aux pastilles de
// légende et de readout (les molécules elles-mêmes sont dessinées avec un
// contour noir commun, cf. _drawMolecules dans recipient.js) — utile ici pour D
// (jaune), la seule teinte assez claire pour perdre en lisibilité sur un
// fond blanc sans un contour plus soutenu.
var SPECIES_COLORS = {
  A: { fill: '#0f7fe0', border: '#0a5498', label: 'A' },
  B: { fill: '#f04a10', border: '#a8300a', label: 'B' },
  C: { fill: '#22c55e', border: '#15803d', label: 'C' },
  D: { fill: '#f5c518', border: '#a67c00', label: 'D' }
};

// ══════════════════════════════════════════════════════════════════════
//  Probabilité de choc efficace ⇄ seuil de vitesse d'approche
// ══════════════════════════════════════════════════════════════════════
//
// Les sliders affichent directement une PROBABILITÉ (%) de choc efficace,
// sans jamais mentionner d'énergie d'activation.
//
// Piège classique de théorie cinétique, corrigé ici : la distribution des
// vitesses d'approche PARMI LES CHOCS QUI SE PRODUISENT n'est PAS la même
// que la distribution des vitesses en général. Une paire qui se rapproche
// vite « balaie » plus d'espace par seconde et se heurte donc plus souvent
// qu'une paire lente — les chocs sont pondérés par la vitesse d'approche
// elle-même (même principe que la distribution de FLUX à travers une
// surface, différente de la distribution de vitesse d'où elle dérive).
// Avec vrel_n distribué selon une gaussienne centrée d'écart-type σ_rel
// (σ_rel = σ√2, σ = écart-type d'une composante de vitesse d'UNE molécule,
// cf. randomVelocity), cette pondération donne, pour la fraction de chocs
// avec vrel_n ⩾ vAct :
//   P(efficace) = ∫[vAct,∞] v·f(v) dv / ∫[0,∞] v·f(v) dv = exp(−vAct² / (2σ_rel²))
//                                                          = exp(−vAct² / (4σ²))
// une simple exponentielle (forme d'Arrhenius), sans fonction spéciale.
// On l'inverse pour retrouver vAct à partir du pourcentage affiché :
//   vAct = 2σ·√(−ln p)

// Convertit un pourcentage affiché (0 à 100) en seuil de vitesse d'approche,
// exprimé en multiple de σ (l'écart-type d'une composante de vitesse d'UNE
// molécule) : vAct = facteur × σ.
function _activationFactorFromProbability(probPercent) {
  var p = Math.min(100, Math.max(0, probPercent)) / 100;
  if (p <= 0) return Infinity;    // jamais efficace
  if (p >= 1) return 0;           // toujours efficace
  return 2 * Math.sqrt(-Math.log(p));
}

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
    N0_A: 40,
    N0_B: 40,
    N0_C: 10,
    N0_D: 10,

    // ── Probabilités de choc efficace (%), un réglage par sens ──
    probAB: 50,   // A + B → C + D
    probCD: 50,   // C + D → A + B

    // ── Géométrie du récipient (mise à jour par recipient.js) ──
    boxLeft: 0,
    boxRight: 0,
    boxTop: 0,
    boxBottom: 0,
    _rx1: 0, _rx2: 0, _ry1: 0, _ry2: 0,

    // ── Échelles dépendant de la taille du canvas (cf. recipient.js) ──
    molRadius: 3,             // px
    v0px: V0_PX_DEFAULT,      // px/s

    // ── Rendu (renseigné par recipient.js / graph.js / frise.js) ──
    canvas: null, ctx: null, cw: 0, ch: 0,
    chartCanvas: null, chartCtx: null,
    chartVisible: { A: true, B: true, C: true, D: true },
    chartHover: null,
    // Vrai entre la prise en compte d'un `mousemove` sur le graphe et le
    // redraw qui s'ensuit : coalesce en une seule frame la rafale
    // d'événements d'une souris haute fréquence (cf. attachChart).
    _hoverRafPending: false,
    friseCanvas: null, friseCtx: null,

    // Affiche sur le graphe, en pointillés, les quantités théoriques à
    // l'équilibre (cf. theoreticalEquilibrium ci-dessous) — bouton
    // « Quantités finales théoriques » du panneau.
    showTheoretical: false,

    // ── Vue affichée en mode 2 SIMULATIONS : 'graphe' ou 'frise' ──
    // En mode 1 simulation, graphe ET frise sont affichés simultanément
    // (l'un sous l'autre) et cette propriété est ignorée : la place ne
    // manque que lorsque deux lignes se partagent la hauteur.
    view: 'graphe',

    // Curseur Qr instantané visible sur la frise (case à cocher sous
    // celle-ci). La moyenne glissante, elle, est toujours affichée : c'est
    // elle qui porte le propos (convergence vers K).
    showQrInstant: true,

    // ── Temps simulé cumulé (ms) ──
    simTime: 0,

    // ── Historique temporel des quantités ──
    // t en secondes, A/B/C/D en nombre de molécules.
    // Cesse de s'allonger au-delà de HISTORY_MAX_MS (cf. recordHistoryPoint).
    history: { t: [], A: [], B: [], C: [], D: [] },

    // Maximum atteint par chaque espèce sur toute la durée de l'historique,
    // tenu à jour à chaque point ajouté (cf. recordHistoryPoint) et remis à
    // zéro à chaque RAZ. Évite à _axisBounds() (graph.js) de rebalayer tout
    // l'historique à chaque redraw pour retrouver la borne de l'axe Y : les
    // quantités ne faisant que croître ou décroître par pas de 1, ce
    // maximum incrémental est exact.
    _histMax: { A: 0, B: 0, C: 0, D: 0 },

    // Passe à true quand un point d'historique vient d'être ajouté : le graphe
    // ne se redessine que dans ce cas (5 redraws/s au lieu de 60), cf. ui.js.
    historyDirty: true,

    // Même rôle pour la frise, mais sur un critère plus large : elle affiche
    // Qr instantané et sa moyenne glissante, qui continuent d'évoluer même
    // une fois l'historique du graphe figé (cf. HISTORY_MAX_MS). Ce drapeau
    // est donc levé à CHAQUE échantillon, là où `historyDirty` ne l'est que
    // si le point a effectivement été ajouté au graphe.
    friseDirty: true,

    // Accumulateur interne pour l'échantillonnage de l'historique
    _historyTimer: 0,

    // ── Fenêtre glissante de Qr : tampon circulaire ──────────────────────
    // Les produits N_A·N_B et N_C·N_D des QR_AVG_SAMPLES derniers
    // échantillons, avec leurs sommes courantes — averagedReactionQuotient()
    // n'a ainsi qu'une division à faire, au lieu de resommer 200 points à
    // chaque redraw de la frise. Les valeurs étant des produits d'entiers,
    // l'ajout/retrait incrémental sur les sommes reste EXACT (entiers bien
    // en deçà de 2⁵³), sans dérive de virgule flottante.
    // Le tampon est intégralement vidé dès que probAB ou probCD change
    // (donc K) : la fenêtre ne mélange jamais des échantillons visant deux K
    // différents, cf. setReactionProbability.
    _qrAB: [], _qrCD: [],
    _qrHead: 0, _qrCount: 0,
    _qrSumAB: 0, _qrSumCD: 0,

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
var paused = true;
var speedFactor = 1;   // multiplie dt avant stepPhysics (×0,10 à ×2,00)

function activeSims() {
  return sims.slice(0, simCount);
}

// ══════════════════════════════════════════════════════════════════════
//  Génération de vitesses — distribution de Maxwell-Boltzmann 2D
// ══════════════════════════════════════════════════════════════════════

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

// Vitesse selon Maxwell-Boltzmann 2D (deux gaussiennes indépendantes sur vx/vy).
// Pas de réglage de température sur cette page : σ = v0px, constant.
function randomVelocity(s) {
  return { vx: _gaussRandom(s.v0px), vy: _gaussRandom(s.v0px) };
}

// ══════════════════════════════════════════════════════════════════════
//  Comptage des espèces et historique
// ══════════════════════════════════════════════════════════════════════

function countSpecies(s) {
  var c = { A: 0, B: 0, C: 0, D: 0 };
  var mols = s.molecules;
  for (var i = 0; i < mols.length; i++) {
    var t = mols[i].type;
    if (c[t] !== undefined) c[t]++;
  }
  return c;
}

// Quotient de réaction Qr = (N_C × N_D) / (N_A × N_B), en nombre de
// molécules (proportionnel aux concentrations à volume constant). `null`
// si indéterminé (0/0), `Infinity` si le dénominateur est nul mais pas le
// numérateur.
function reactionQuotient(c) {
  var num = c.C * c.D;
  var den = c.A * c.B;
  if (den === 0) return num === 0 ? null : Infinity;
  return num / den;
}

// ── Constante d'équilibre prédite par le modèle ────────────────────────
// À l'équilibre, les deux sens se compensent. La fréquence des chocs A+B
// est proportionnelle à N_A·N_B et celle des chocs C+D à N_C·N_D, avec le
// MÊME facteur géométrique (toutes les molécules ont même rayon et même
// distribution de vitesses — il n'y a ni température ni taille par espèce
// sur cette page). Chaque choc est efficace avec la probabilité réglée par
// le slider correspondant, d'où :
//     N_A·N_B · p_AB = N_C·N_D · p_CD     (à l'équilibre)
//  ⟹  K = ⟨N_C·N_D⟩ / ⟨N_A·N_B⟩ = p_AB / p_CD
// C'est cette valeur que la frise matérialise, et vers laquelle la moyenne
// glissante de Qr doit converger.
// `null` si les deux probabilités sont nulles (aucune réaction possible
// dans un sens ni dans l'autre : K est indéterminé), `Infinity` si seul le
// sens indirect est bloqué (la réaction ne va que vers C + D).
function equilibriumConstant(s) {
  if (s.probCD === 0) return s.probAB === 0 ? null : Infinity;
  return s.probAB / s.probCD;
}

// ── Quantités théoriques à l'équilibre ──────────────────────────────────
// Toute la réaction se résume à un seul degré de liberté, l'avancement ξ :
// chaque événement (dans un sens ou dans l'autre) échange exactement 1 A +
// 1 B contre 1 C + 1 D. Donc, à partir des quantités INITIALES :
//   N_A = N0_A − ξ,  N_B = N0_B − ξ,  N_C = N0_C + ξ,  N_D = N0_D + ξ
// et il suffit de résoudre Qr(ξ) = K pour trouver l'avancement d'équilibre :
//   K·(N0_A−ξ)(N0_B−ξ) = (N0_C+ξ)(N0_D+ξ)
// soit, développé, l'équation du second degré (K−1)ξ² − [K(N0_A+N0_B) +
// (N0_C+N0_D)]·ξ + (K·N0_A·N0_B − N0_C·N0_D) = 0. Le physiquement valide
// des (au plus) deux racines est celui compris dans [ξmin, ξmax] où
// ξmax = min(N0_A, N0_B) (A ou B totalement consommé, sens direct à fond)
// et ξmin = −min(N0_C, N0_D) (sens indirect à fond) : c'est l'intervalle
// sur lequel les 4 quantités restent positives ou nulles. Un argument des
// valeurs intermédiaires garantit qu'exactement une racine tombe dans cet
// intervalle pour tout K fini strictement positif (aux deux bornes, l'un
// des deux membres de l'équation Qr(ξ)=K s'annule, avec un signe opposé).
// `null` si le total de molécules est nul (rien à répartir).
function theoreticalEquilibrium(s) {
  var A0 = s.N0_A, B0 = s.N0_B, C0 = s.N0_C, D0 = s.N0_D;
  if (A0 + B0 + C0 + D0 <= 0) return null;

  var xiMin = -Math.min(C0, D0);
  var xiMax = Math.min(A0, B0);
  var K = equilibriumConstant(s);
  var xi;

  if (K === null) {
    // Aucune des deux réactions n'est possible (probAB = probCD = 0) :
    // le système reste figé à son état initial, ξ = 0.
    xi = 0;
  } else if (K === Infinity) {
    // Seul le sens direct est possible : A + B se consomment à fond.
    xi = xiMax;
  } else if (K === 0) {
    // Seul le sens indirect est possible : C + D se consomment à fond.
    xi = xiMin;
  } else {
    var a = K - 1;
    var b = -(K * (A0 + B0) + (C0 + D0));
    var c = K * A0 * B0 - C0 * D0;
    if (Math.abs(a) < 1e-9) {
      // K ≈ 1 : l'équation dégénère en une droite (b·ξ + c = 0).
      xi = (b === 0) ? 0 : -c / b;
    } else {
      var disc = Math.max(0, b * b - 4 * a * c);   // ⩾ 0 par construction (IVT)
      var sq = Math.sqrt(disc);
      var xi1 = (-b + sq) / (2 * a);
      var xi2 = (-b - sq) / (2 * a);
      var eps = 1e-6;
      var ok1 = xi1 >= xiMin - eps && xi1 <= xiMax + eps;
      var ok2 = xi2 >= xiMin - eps && xi2 <= xiMax + eps;
      // Cas normal : une seule racine tombe dans l'intervalle physique.
      // Si aucune n'y tombe pile (bord numérique), on garde celle qui en
      // est la plus proche plutôt que d'échouer.
      xi = ok1 ? xi1 : ok2 ? xi2 : xi1;
    }
  }

  if (xi < xiMin) xi = xiMin; else if (xi > xiMax) xi = xiMax;

  return { A: A0 - xi, B: B0 - xi, C: C0 + xi, D: D0 + xi };
}

// ── Quotient de réaction MOYENNÉ sur une fenêtre glissante ─────────────
// On moyenne les PRODUITS N_C·N_D et N_A·N_B séparément, puis on divise —
// et non l'inverse. Deux raisons, toutes deux importantes :
//  1. c'est ⟨N_C·N_D⟩/⟨N_A·N_B⟩ qui vaut exactement K à l'équilibre (cf.
//     equilibriumConstant) ; moyenner Qr lui-même donnerait ⟨N_C·N_D /
//     (N_A·N_B)⟩, une quantité différente et biaisée VERS LE HAUT (un
//     rapport est une fonction convexe de son dénominateur — inégalité de
//     Jensen), donc systématiquement au-dessus de K ;
//  2. moyenner Qr exploserait dès qu'un seul échantillon a N_A·N_B = 0
//     (un Qr infini contamine définitivement la moyenne), alors qu'ici un
//     tel échantillon ne fait qu'ajouter 0 au dénominateur cumulé.
// Le rapport des SOMMES égale le rapport des moyennes (même nombre de
// termes), inutile de diviser par le compte.
function averagedReactionQuotient(s) {
  if (s._qrCount === 0) return null;
  if (s._qrSumAB === 0) return s._qrSumCD === 0 ? null : Infinity;
  return s._qrSumCD / s._qrSumAB;
}

// Ajoute un échantillon au tampon circulaire de la fenêtre glissante, en
// maintenant les sommes courantes. Alimenté à CHAQUE échantillon, y compris
// une fois l'historique du graphe figé (cf. HISTORY_MAX_MS) : c'est ce qui
// permet à la frise de rester vivante indéfiniment.
function _pushQrSample(s, c) {
  var ab = c.A * c.B;
  var cd = c.C * c.D;
  if (s._qrCount < QR_AVG_SAMPLES) {
    // Phase de remplissage : on empile, `_qrHead` (index du plus ancien)
    // reste à 0.
    s._qrAB.push(ab);
    s._qrCD.push(cd);
    s._qrCount++;
  } else {
    // Tampon plein : le plus ancien sort des sommes et cède sa case.
    s._qrSumAB -= s._qrAB[s._qrHead];
    s._qrSumCD -= s._qrCD[s._qrHead];
    s._qrAB[s._qrHead] = ab;
    s._qrCD[s._qrHead] = cd;
    s._qrHead = (s._qrHead + 1) % QR_AVG_SAMPLES;
  }
  s._qrSumAB += ab;
  s._qrSumCD += cd;
}

// Vide la fenêtre glissante (RAZ, ou changement de K).
function _resetQrWindow(s) {
  s._qrAB.length = 0;
  s._qrCD.length = 0;
  s._qrHead = 0;
  s._qrCount = 0;
  s._qrSumAB = 0;
  s._qrSumCD = 0;
}

function recordHistoryPoint(s) {
  var c = countSpecies(s);

  // La fenêtre glissante de Qr est alimentée sans condition : la frise doit
  // continuer de vivre après que le graphe s'est figé.
  _pushQrSample(s, c);
  s.friseDirty = true;

  // Au-delà de HISTORY_MAX_MS, le graphe N(t) garde le tracé déjà accumulé
  // et cesse de s'allonger.
  if (s.simTime > HISTORY_MAX_MS) return;

  var h = s.history;
  h.t.push(s.simTime / 1000);
  h.A.push(c.A); h.B.push(c.B); h.C.push(c.C); h.D.push(c.D);

  var mx = s._histMax;
  if (c.A > mx.A) mx.A = c.A;
  if (c.B > mx.B) mx.B = c.B;
  if (c.C > mx.C) mx.C = c.C;
  if (c.D > mx.D) mx.D = c.D;

  s.historyDirty = true;
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation des molécules
// ══════════════════════════════════════════════════════════════════════

// Place les molécules A/B/C/D sans chevauchement dans la boîte.
// Stratégie : grille dimensionnée pour contenir EXACTEMENT les N molécules et
// couvrir toute la zone d'animation (cols × rows ≥ N, proportions du récipient),
// puis mélange Fisher-Yates pour répartir aléatoirement les types.
function initMolecules(s) {
  s.molecules = [];
  var NA = s.N0_A, NB = s.N0_B, NC = s.N0_C, ND = s.N0_D;
  var N  = NA + NB + NC + ND;
  var r   = s.molRadius;
  var xlo = s.boxLeft   + r + 1;
  var xhi = s.boxRight  - r - 1;
  var ylo = s.boxTop    + r + 1;
  var yhi = s.boxBottom - r - 1;

  if (xhi > xlo && yhi > ylo && N > 0) {
    var w = xhi - xlo;
    var h = yhi - ylo;

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
    for (var cc = 0; cc < NC; cc++) types.push('C');
    for (var dd = 0; dd < ND; dd++) types.push('D');

    // Jitter maximal : reste dans la cellule sans chevaucher la voisine
    var jitX = Math.max(0, (cellW - 2 * r - 1) / 2);
    var jitY = Math.max(0, (cellH - 2 * r - 1) / 2);

    for (var m = 0; m < N; m++) {
      var pos = positions[m];
      var vel = randomVelocity(s);
      s.molecules.push({
        type: types[m],
        x: pos.x + (Math.random() * 2 - 1) * jitX,
        y: pos.y + (Math.random() * 2 - 1) * jitY,
        vx: vel.vx, vy: vel.vy
      });
    }
  }

  s.simTime = 0;
  s._historyTimer = 0;
  s.history = { t: [], A: [], B: [], C: [], D: [] };
  s._histMax = { A: 0, B: 0, C: 0, D: 0 };
  _resetQrWindow(s);
  recordHistoryPoint(s);
}

// ══════════════════════════════════════════════════════════════════════
//  Modification dynamique des paramètres
// ══════════════════════════════════════════════════════════════════════

// Change la quantité initiale d'une espèce (A, B, C ou D).
// Un tel changement redéfinit les conditions initiales de la réaction :
// on remet donc l'animation à zéro (et en pause) plutôt que d'injecter des
// molécules en cours de route, pour que la courbe affichée corresponde
// toujours à une seule et même expérience.
//
// En mode 2 simulations, deux cas :
// - si l'une des simulations affichées a déjà commencé à évoluer (simTime > 0),
//   on ne peut pas ne repositionner QUE celle qu'on modifie : les deux courbes
//   doivent redémarrer ensemble pour rester comparables sur le même axe des
//   temps → RAZ complète ;
// - si aucune n'a encore été lancée, repositionner l'autre n'aurait aucun
//   effet utile mais lui ferait perdre son placement aléatoire initial sans
//   raison. On ne touche donc qu'à `s`.
function setSpeciesCount(s, type, target) {
  if (type === 'A') s.N0_A = target;
  else if (type === 'B') s.N0_B = target;
  else if (type === 'C') s.N0_C = target;
  else s.N0_D = target;

  var anyStarted = activeSims().some(function (sim) { return sim.simTime > 0; });
  if (anyStarted) {
    resetSim();
  } else {
    paused = true;
    // Le rayon des molécules dépend de N_A+N_B+N_C+N_D (cf. molRadiusFrac) :
    // il faut recalculer la géométrie du récipient AVANT de replacer les
    // molécules, sinon initMolecules() utiliserait un rayon périmé.
    if (typeof resizeRecipient === 'function') resizeRecipient(s);
    initMolecules(s);
    if (typeof syncUIToSim === 'function') syncUIToSim();
  }
}

// Change une probabilité de choc efficace. Contrairement aux quantités
// initiales, ce réglage ne redéfinit pas l'expérience en cours : il modifie
// seulement le seuil appliqué aux PROCHAINS chocs, sans RAZ — l'élève peut
// ainsi observer en direct l'effet d'un changement de probabilité sur un
// système déjà en évolution (ou déjà à l'équilibre).
//
// K = probAB/probCD changeant avec ce réglage, la fenêtre de moyennage de
// Qr (averagedReactionQuotient) avance son point de départ pour ne plus
// jamais mélanger des échantillons visant deux K différents — sans ce
// garde-fou, juste après un changement de réglage, la moyenne affichée
// resterait un temps un mélange de l'ancien et du nouveau K, brouillant la
// lecture de la convergence.
function setReactionProbability(s, direction, percent) {
  var changed = (direction === 'AB') ? (s.probAB !== percent) : (s.probCD !== percent);
  if (direction === 'AB') s.probAB = percent; else s.probCD = percent;
  // Vider la fenêtre plutôt que d'y mémoriser un index de départ : la
  // moyenne repart de zéro (au sens statistique) et ne peut plus contenir un
  // seul échantillon visant l'ancien K. Le test `changed` évite de la
  // tronquer pour rien quand un slider revient à sa position courante.
  if (changed) _resetQrWindow(s);
}

// ══════════════════════════════════════════════════════════════════════
//  Intégration physique — un pas de temps
// ══════════════════════════════════════════════════════════════════════

function stepPhysics(s, dt_ms) {
  if (dt_ms <= 0) return;
  var dt_s = dt_ms / 1000;

  s.simTime += dt_ms;

  var nSub  = _requiredSubsteps(s, dt_s);
  var subDt = dt_s / nSub;
  for (var sub = 0; sub < nSub; sub++) {
    _moveAll(s, subDt);
    _collidePairs(s);
    _collideWalls(s);
  }

  s._historyTimer += dt_ms;
  if (s._historyTimer >= HISTORY_PERIOD) {
    s._historyTimer = 0;
    recordHistoryPoint(s);
  }
}

// ── Nombre de sous-pas nécessaires pour cette frame ────────────────────
function _requiredSubsteps(s, dt_s) {
  var mols  = s.molecules;
  var v2max = 0;
  for (var i = 0; i < mols.length; i++) {
    var v2 = mols[i].vx * mols[i].vx + mols[i].vy * mols[i].vy;
    if (v2 > v2max) v2max = v2;
  }
  if (v2max === 0) return SUBSTEPS_MIN;

  var travel = Math.sqrt(v2max) * dt_s;
  var budget = s.molRadius * MAX_STEP_FRAC;
  var n = Math.ceil(travel / budget);
  if (n < SUBSTEPS_MIN) return SUBSTEPS_MIN;
  if (n > SUBSTEPS_MAX) return SUBSTEPS_MAX;
  return n;
}

// ── Avance toutes les positions (mouvement rectiligne uniforme) ────────
function _moveAll(s, dt) {
  var mols = s.molecules;
  for (var i = 0; i < mols.length; i++) {
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
    if (m.x < xlo) { m.x = 2 * xlo - m.x; if (m.vx < 0) m.vx = -m.vx; }
    if (m.x > xhi) { m.x = 2 * xhi - m.x; if (m.vx > 0) m.vx = -m.vx; }
    if (m.y < ylo) { m.y = 2 * ylo - m.y; if (m.vy < 0) m.vy = -m.vy; }
    if (m.y > yhi) { m.y = 2 * yhi - m.y; if (m.vy > 0) m.vy = -m.vy; }
  }
}

// Une paire {t1,t2} correspond-elle à {ta,tb}, dans n'importe quel ordre ?
function _isPairOf(t1, t2, ta, tb) {
  return (t1 === ta && t2 === tb) || (t1 === tb && t2 === ta);
}

// ── Résolution d'une paire en contact : toujours un choc élastique ─────
//
// Qu'il y ait réaction ou non, la collision est un choc élastique standard
// entre sphères dures de même masse (échange de la composante NORMALE de la
// vitesse relative) : ce choc conserve exactement la quantité de mouvement
// ET l'énergie cinétique du couple. Une réaction ne fait que RENOMMER les
// deux molécules (A,B → C,D ou C,D → A,B) au moment d'un choc suffisamment
// frontal (vrel_n ⩾ vAct) ; leurs nouvelles vitesses sont celles, ordinaires,
// de ce même choc élastique.
//
// Ce choix a remplacé une première version où les produits d'une réaction
// recevaient une vitesse recalculée « à part » (vitesse du centre de masse
// + kick, ou tirage Maxwell-Boltzmann) : dans les deux cas, cela revenait à
// traiter la réaction comme un événement à part de la collision physique,
// avec le risque de ne pas conserver exactement l'énergie cinétique du
// système. Or ici, la réaction tourne indéfiniment dans les deux sens
// (équilibre dynamique) : la moindre fuite d'énergie à chaque réaction
// finit par refroidir tout le système au fil du temps, ce qui fausse
// l'équilibre observé — les seuils `vAct` sont calibrés une fois pour
// toutes par rapport à `v0px`, en supposant une température CONSTANTE.
// En traitant la réaction comme un simple choc élastique, l'énergie totale
// du système ne varie JAMAIS (par construction, comme pour n'importe quel
// choc de sphères dures) : le système reste à température constante
// indéfiniment, quel que soit le nombre de réactions déjà survenues — c'est
// la condition nécessaire pour que le quotient de réaction Qr converge vers
// K = probAB / probCD (cf. ARCHITECTURE.md).
function _resolvePair(mi, mj, diam, diam2, vActAB, vActCD) {
  var dx = mj.x - mi.x;
  var dy = mj.y - mi.y;
  var dist2 = dx * dx + dy * dy;
  if (dist2 >= diam2 || dist2 === 0) return;

  var dist = Math.sqrt(dist2);
  var nx = dx / dist;
  var ny = dy / dist;

  var vrel_n = (mi.vx - mj.vx) * nx + (mi.vy - mj.vy) * ny;
  if (vrel_n <= 0) return;   // ils s'éloignent déjà

  var forward  = _isPairOf(mi.type, mj.type, 'A', 'B');
  var backward = !forward && _isPairOf(mi.type, mj.type, 'C', 'D');

  if ((forward && vrel_n >= vActAB) || (backward && vrel_n >= vActCD)) {
    if (forward) { mi.type = 'C'; mj.type = 'D'; } else { mi.type = 'A'; mj.type = 'B'; }
  }

  // ── Choc élastique standard (échange de la composante normale) ──
  // S'applique dans tous les cas : la réaction (ci-dessus) n'a fait que
  // décider du type, pas de la vitesse.
  mi.vx -= vrel_n * nx;
  mi.vy -= vrel_n * ny;
  mj.vx += vrel_n * nx;
  mj.vy += vrel_n * ny;

  // ── Séparation positionnelle anti-sticking ──
  var overlap = diam - dist;
  var half = (overlap / 2) + 0.5;
  mi.x -= nx * half; mi.y -= ny * half;
  mj.x += nx * half; mj.y += ny * half;
}

// ── Détection des collisions par grille spatiale ───────────────────────
// cf. cinetique/js/sim.js pour le détail : grille de cellules de côté
// 2×diamètre, chaque molécule n'est testée que contre sa cellule et les
// 8 voisines, ce qui ramène le coût de O(N²) à O(N).
//
// Pourquoi 2 diamètres et non 1 (le minimum correct pour ce voisinage) :
// cette grille est TRÈS CREUSE — de 0,03 à 0,3 molécule par cellule selon
// les réglages, jamais davantage. Le coût dominant n'est donc pas le test
// des paires mais le coût FIXE par cellule, payé deux fois par sous-pas
// (vidage des buckets, puis traversée des cellules). Diviser le côté par 2
// quadruple le nombre de cellules, donc ce coût fixe, pour n'économiser que
// quelques paires : mesuré en opérations par sous-pas, ~7100 contre ~2200
// aux réglages par défaut, ~37000 contre ~16000 aux réglages maximaux.
// L'argument inverse (« moins de paires testées ») ne vaut qu'en régime
// dense, à plus d'une molécule par cellule — jamais atteint ici.
var _GRID_NEIGHBOURS = [[1, 0], [-1, 1], [0, 1], [1, 1]];

function _collidePairs(s) {
  var mols = s.molecules;
  var n = mols.length;
  if (n < 2) return;

  var diam  = 2 * s.molRadius;
  var diam2 = diam * diam;

  // Seuils d'activation en px/s, un par sens de réaction, recalculés à
  // chaque passe à partir des probabilités réglées par les sliders.
  var vActAB = _activationFactorFromProbability(s.probAB) * s.v0px;
  var vActCD = _activationFactorFromProbability(s.probCD) * s.v0px;

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
          _resolvePair(mols[bucket[a]], mols[bucket[b]], diam, diam2, vActAB, vActCD);
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
            _resolvePair(mols[bucket[p]], mols[other[q]], diam, diam2, vActAB, vActCD);
          }
        }
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Réinitialisation
// ══════════════════════════════════════════════════════════════════════
// Conserve les quantités N0_A/B/C/D et les probabilités actuellement réglées
// par l'utilisateur (RAZ = relancer la simulation avec les paramètres en
// cours, pas revenir aux valeurs par défaut). L'animation repart en pause :
// l'élève relance lui-même la réaction.
// La RAZ porte toujours sur TOUTES les simulations affichées, pour qu'elles
// démarrent au même instant et restent comparables.
function resetSim() {
  paused = true;
  // Le rayon des molécules dépend de N_A+N_B+N_C+N_D (cf. molRadiusFrac) :
  // recalculé à chaque RAZ, pour refléter d'éventuels changements de
  // quantités initiales survenus depuis la dernière initialisation.
  if (typeof resizeRecipient === 'function') activeSims().forEach(resizeRecipient);
  activeSims().forEach(initMolecules);
  if (typeof syncUIToSim === 'function') syncUIToSim();
}
