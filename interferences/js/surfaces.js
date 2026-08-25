// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  surfaces.js — Onglet "Ondes de surfaces" : interférences de 2 sources
//  ponctuelles synchrones (vue de dessus d'un bassin).
//
//  Physique : chaque source émet une onde circulaire ; le champ affiché est
//  la superposition (somme) des deux. Comme dans l'onglet équivalent de
//  diffraction/, le champ champ(x,y,t) = P(x,y)·cos(ωt) + Q(x,y)·sin(ωt),
//  P/Q indépendants du temps, est précalculé une fois par géométrie (cf.
//  _rebuildSurfFieldCache) sur une grille basse résolution, agrandie par
//  drawImage — le rendu par frame n'a donc que 2 sources × 1 addition par
//  cellule (pas de somme de Huygens sur une ouverture, contrairement à
//  diffraction/js/surfaces.js : ici il y a exactement 2 sources réelles).
//
//  Chaque source ponctuelle est modélisée par le même modèle asymptotique
//  d'onde cylindrique 2D que les sources de Huygens de l'onglet diffraction
//  (facteur de normalisation (1-i)/√(2λ), cf. _surfPointSourcePQ) — c'est le
//  Green du problème 2D (pas une simple sin(kr-ωt)/√r), pour rester
//  cohérent avec le reste du site.
//
//  Dépend de : sim.js, scene.js (non utilisé directement ici, mais chargé
//  avant). Chargé après graph.js, avant ui.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Constantes ────────────────────────────────────────────────────────
var SURF_C_CM           = 9.6;  // célérité de l'onde (cm/s), fixe
// ── Cadrage du bassin ─────────────────────────────────────────────────
// Le zoom se règle DIRECTEMENT en largeur de vue (cm), la grandeur physique que l'utilisateur
// lit sur le slider et sur la barre d'échelle (cf. _drawSurfScaleBar) — plus de facteur abstrait
// à 3 crans dont le « ×1 » désignait paradoxalement le dézoom maximal. Même dispositif que
// diffraction/js/surfaces.js (cf. son étape C), pour que les deux pages se manipulent pareil.
//
// Ce cadrage est FIXE EN CENTIMÈTRES : rien ici ne réagit à λ. C'est délibéré et non négociable
// pédagogiquement — un cadrage qui suivrait λ rendrait toutes les vues semblables et le slider λ
// semblerait ne rien faire, alors que c'est précisément l'effet qu'on veut montrer. Contrepartie
// assumée : aux petites λ dans une vue large, une longueur d'onde ne fait plus que quelques
// pixels — c'est à l'utilisateur de zoomer, d'où l'importance d'un zoom qui va assez loin.
//
// Le défaut n'est PLUS la vue la plus large (qui était aussi la moins lisible de toute la plage) :
// à 80 cm, λ = 4 cm fait ~50 px et b = 8 cm ~100 px, lisible d'emblée. Bornes et défaut sont
// choisis pour que le facteur AFFICHÉ tombe juste — le libellé montre ×(défaut/vue), donc
// ×1 = vue par défaut, et la plage 20↔160 cm autour de 80 cm donne exactement ×0,5 à ×4.
// Au zoom maximal avec un grand écartement (b jusqu'à 30 cm), les 2 sources peuvent sortir du
// cadre : c'est assumé, l'utilisateur a alors délibérément choisi d'examiner la zone centrale.
var SURF_VIEW_MIN_CM     = 20;   // vue la plus serrée (slider à droite) → ×4
var SURF_VIEW_MAX_CM     = 160;  // vue la plus large  (slider à gauche) → ×0,5
var SURF_VIEW_DEFAULT_CM = 80;   // → ×1
// Slider à progression GÉOMÉTRIQUE (chaque cran multiplie la largeur de vue par un facteur
// constant) : c'est ce qui rend les pas perceptivement uniformes. 240 crans ⇒ +0,9 % par cran,
// donc un glissement continu à l'œil.
var SURF_ZOOM_STEPS      = 240;
var SURF_WHEEL_SENS      = 0.0015; // molette : facteur exp(deltaY · sens) sur la largeur de vue

var SURF_GRAPH_WINDOW   = 5;    // fenêtre temporelle du graphe y(t), en s
// ── Dimensionnement de la grille de calcul du champ ───────────────────
// Deux exigences concurrentes, toutes deux au rapport d'aspect du canvas (cf.
// _rebuildSurfFieldCache) — la plus forte l'emporte :
//   • le CADRAGE ÉCRAN (SURF_GRID_FACTOR px CSS par cellule), qui suffit aux grandes longueurs
//     d'onde et garde la grille bon marché ;
//   • l'ÉCHANTILLONNAGE DE L'ONDE (SURF_GRID_CELLS_PER_LAMBDA cellules par λ), qui commande dès
//     que λ est petit devant la largeur de vue — c'est le régime où la figure d'interférences se
//     brouillait. 9 échantillons par période : en dessous de ~8, la reconstruction bilinéaire de
//     l'agrandissement (cf. drawSurfaces) laisse une ondulation d'amplitude parasite et un moiré
//     avec la trame de la grille. (Valeur précédente : 5.)
//
// Le coût est borné non plus par des maxima SÉPARÉS en largeur et en hauteur — qui écrasaient la
// largeur (380) bien avant la hauteur (250), donc déformaient la grille et créaient une falaise
// sur un seul axe — mais par un BUDGET GLOBAL en cellules : au delà, les deux dimensions sont
// divisées par le même facteur, donc la dégradation est progressive et isotrope.
//
// Budget calé sur celui de diffraction/ (même valeur) alors que le coût est ici bien moindre :
// 2 sources ponctuelles contre une centaine de sources de Huygens, et le rebuild ne fait plus que
// le quart du travail trigonométrique depuis l'étape 2. Pas de régulateur adaptatif : un budget
// FIXE, cf. le bilan de la session précédente (un régulateur à levier unique avait raboté la
// grille jusqu'au repliement en croyant soulager une vue dont le coût est ailleurs).
var SURF_GRID_FACTOR    = 4;    // px CSS par cellule de grille quand λ n'exige pas mieux
var SURF_GRID_CELLS_PER_LAMBDA = 9;
var SURF_GRID_BUDGET    = 360000; // cellules
var SURF_GRID_MIN_W     = 40;
var SURF_GRID_MIN_H     = 30;

// PLAFOND ÉCRAN — une cellule par pixel CSS. Au-delà, la finesse calculée ne peut tout simplement
// pas s'afficher : c'est du calcul jeté. Ce plafond est aussi la limite théorique de la
// simulation — au dézoom maximal (160 cm) avec λ = 1 cm, une longueur d'onde ne couvre qu'une
// dizaine de pixels écran, donc aucune grille, si fine soit-elle, ne rendra ce réglage net.
// C'est à l'utilisateur de zoomer, et c'est précisément à quoi sert la plage de zoom de l'étape 1.
// Enveloppe géométrique d'une source ponctuelle réelle : sqrt(R0/(R0+r)), R0 = SURF_ENV_R0_LAMBDA·λ —
// vaut 1 tout contre la source (pas de singularité 1/√r à traiter) et tend vers la décroissance
// cylindrique physique 1/√r pour r ≫ R0. Même famille de formule que l'enveloppe géométrique de
// ondes/js/vagues.js (sqrt(R0/(R0+r)), R0 fixe en px là-bas ; ici R0 est exprimé en multiples de λ
// pour rester cohérent quel que soit le réglage de λ). Une source de Huygens isolée (cf.
// diffraction/js/surfaces.js), calibrée pour qu'une SOMME de ~100 d'entre elles reconstruise une onde
// incidente d'amplitude 1, a individuellement une amplitude quasi nulle — impropre à une VRAIE
// source ponctuelle unique, d'où ce modèle distinct.
var SURF_ENV_R0_LAMBDA = 2;

// ── Barre d'échelle (cf. _drawSurfScaleBar) ──────────────────────────
// Le cadrage étant réglable en continu, une référence métrique dessinée dans le bassin devient
// indispensable pour situer les distances. Bénéfice secondaire, et pas le moindre : elle rend le
// changement de λ PLUS explicite qu'avant, les crêtes se resserrant contre une règle qui, elle,
// ne bouge pas. Identique à celle de diffraction/js/surfaces.js.
var SURF_SCALE_NICE_CM   = [1, 2, 5, 10, 20, 50, 100, 200]; // longueurs « rondes » admissibles
var SURF_SCALE_TARGET_FR = 0.14; // longueur visée, en fraction de la largeur du bassin

// ── Vue plongeante (rotation 3D autour de l'axe S1S2), cf. setSurfViewMode ──
var SURF_TILT_MIN     = 10;  // degrés
var SURF_TILT_MAX     = 75;
var SURF_TILT_DEFAULT = 45;
// Hauteur visuelle max de la nappe (px CSS), à raw = ±1 (une seule source) — un point où les
// 2 sources sont en phase peut monter jusqu'à ~2× cette hauteur (cf. décision : la hauteur 3D
// n'est PAS écrêtée à ±1 comme la couleur, contrairement à _rebuildSurfFieldCache/drawSurfaces).
var SURF_3D_AMP_PX = 42;
// Demi-hauteur fixe (px CSS) du plan de coupe horizontal (Amplitude(x), cf. _render3DSurfView) —
// réutilisée aussi pour la zone de drag (initSurfDrag), qui doit couvrir toute la bande visible
// et pas seulement sa ligne centrale (sinon le plan "semble" non draggable, cf. retour utilisateur).
var SURF_3D_PLANE_HALF_H = SURF_3D_AMP_PX * 2.2;

// ── Échantillonnage en PROFONDEUR de la vue plongeante (cf. _render3DSurfView) ──
// Nombre de bandes de l'algorithme du peintre. Indexé sur λ comme la grille du champ, avec :
// un plancher de lissage de la silhouette, un plafond dur, et un BUDGET D'ITÉRATIONS
// (bandes × colonnes) — pas un budget en millisecondes, qui appartiendrait à l'écran et non
// au code. Le budget est calé pour rester du même ordre que ce que la version précédente
// dépensait déjà (N_Z plafonné à 500), le dégraissage de la boucle du peintre finançant
// l'écart. C'est le poste de coût dominant du rendu : à surveiller si l'animation accroche.
var SURF_3D_BANDS_MIN    = 150;
var SURF_3D_BANDS_MAX    = 900;
// Ancien pire cas : 500 bandes, soit 800 000 itérations sur une sortie de 1600 px de large. Le
// budget ci-dessous est un peu au-dessus, mais le corps de la boucle a été allégé d'environ un
// quart en parallèle (tables d'interpolation horizontale sorties de la boucle, constantes de
// couleur hoistées) : à budget plein, on dépense donc moins qu'avant.
var SURF_3D_BANDS_BUDGET = 1000000;

// Couleurs de l'onde (crêtes ↔ creux) — identiques à diffraction/js/surfaces.js
// pour une cohérence visuelle entre les pages du site.
var SURF_COL_CREST  = [200, 240, 255];
var SURF_COL_TROUGH = [0, 10, 55];
var SURF_COL_BG      = [100, 125, 155];

// Couleurs des zones d'interférences (hyperboles pointillées, cf. _drawSurfInterfZones)
var SURF_COL_INTERF_CONSTRUCTIVE = '#ffe14d'; // jaune
var SURF_COL_INTERF_DESTRUCTIVE  = '#8a3fd6'; // violet

// Couleurs des doubles flèches source→M, cf. _drawSurfDistances — 2 teintes chaudes proches
// (orange / rose-orangé), toutes deux bien tranchées sur le fond bleu-gris du bassin, mais
// distinguables entre elles pour associer chaque flèche à sa source (S1 ↔ orange, S2 ↔ rose).
var SURF_COL_DIST_S1 = '#e07020';
var SURF_COL_DIST_S2 = '#e0397a';

// ── État global ───────────────────────────────────────────────────────
var simSurf = {

    // ── Contrôle de l'animation ─────────────────────────────────────
    paused      : false,
    simTime     : 0,
    speedFactor : 1.0,

    // ── Paramètres réglables ──────────────────────────────────────────
    lambda : 4,   // cm
    b      : 8,   // écartement des 2 sources (cm)

    // ── Sources actives/coupées, cf. toggleSurfSource ─────────────────────
    // s1Enabled/s2Enabled reflètent l'état COURANT (coché ou non) ; s1Toggles/
    // s2Toggles gardent l'historique des bascules {t: simTime, enabled} pour que
    // l'extinction/l'allumage d'une source respecte la causalité : une onde déjà
    // émise avant une coupure continue de se propager (elle n'est pas effacée
    // instantanément), et une source rallumée ne fait pas réapparaître d'un coup
    // tout le bassin — seul un nouveau front part de l'instant de rallumage (cf.
    // _surfSourceContrib, qui évalue l'état de la source au temps RETARDÉ
    // t - r/c, pas à l'instant présent).
    s1Enabled : true,
    s2Enabled : true,
    s1Toggles : [],
    s2Toggles : [],

    // ── Géométrie canvas ─────────────────────────────────────────────
    canvasW     : 0,
    canvasH     : 0,
    pxPerCm     : 10,
    viewCm      : SURF_VIEW_DEFAULT_CM, // largeur de vue du bassin, en cm — SEULE grandeur du zoom
    originY     : 0,               // centre vertical du bassin (= y des 2 sources)
    s1          : { x: 0, y: 0 },  // source 1 (gauche)
    s2          : { x: 0, y: 0 },  // source 2 (droite)
    firstResize : true,

    // ── Point de mesure draggable — position physique (cm), indépendante du
    //    zoom (cf. diffraction/js/surfaces.js pour le détail du principe).
    point       : { x: 0, y: 0, cmX: null, cmY: null },
    dragging    : false,

    // ── Axe de coupe vertical draggable (graphe "Amplitude(y)").
    cut         : { x: 0, cmX: null, dragging: false },

    // ── Axe de coupe horizontal draggable (graphe "Amplitude(x)"), même
    //    principe que `cut` mais orienté horizontalement (ne se déplace
    //    verticalement).
    cutH        : { y: 0, cmY: null, dragging: false },

    // ── Vue plongeante (rotation 3D), cf. setSurfViewMode ──────────────
    viewMode : 'top',            // 'top' | 'plongeante'
    tiltDeg  : SURF_TILT_DEFAULT,

    // ── Zones d'interférences (trame de points), cf. toggleSurfInterfMode ──
    interfMode   : 'none',  // 'none' | 'constructive' | 'destructive' | 'both'

    // ── Distances sources→M affichées, cf. toggleSurfDistMode ─────────────
    distMode     : 'none',  // 'none' | 'cm' | 'lambda'

    // ── Section "Valeurs" (S₁M, S₂M, δ), cf. toggleSurfValeurs ────────────
    showValeurs  : false,

    // ── Graphe(s) — mode 1 ou 2 graphes, cf. _buildSurfGraphCtrl ──────────
    showGraph    : false,
    graphMode    : 'single',  // 'single' | 'dual'
    graphTab1    : 'amp-t',   // Hauteur(t) au point M (par défaut)
    graphTab2    : 'amp-y',   // Amplitude(y) selon l'axe de coupe
    ptData       : [],   // [{t, y}] — échantillons pour Hauteur(t)
    ptTimeOrigin : 0,
};

// Options de graphe disponibles pour l'onglet Ondes de surfaces
var SURF_GRAPH_TABS = [
    { key: 'amp-t', label: 'Hauteur(t)', title: 'Hauteur de l\'eau au point M en fonction du temps' },
    { key: 'amp-y', label: 'Amplitude(y)', title: 'Amplitude des vagues le long de l\'axe y' },
    { key: 'amp-x', label: 'Amplitude(x)', title: 'Amplitude des vagues le long de l\'axe x' }
];

// ══════════════════════════════════════════════════════════════════════
//  Géométrie — recalculée au resize et à chaque changement de λ/b. Reste
//  volontairement bon marché (pas de boucle sur la grille de calcul du champ,
//  cf. _scheduleSurfRebuild plus bas) : appelée directement à chaque
//  évènement `oninput` d'un slider sans avoir besoin d'anti-rebond.
// ══════════════════════════════════════════════════════════════════════

function updateSurfGeometry() {
    var s = simSurf;
    var cx = s.canvasW / 2;
    var cy = s.canvasH / 2;
    var bHalf_px = (s.b * s.pxPerCm) / 2;

    s.originX = cx;
    s.originY = cy;
    s.s1.x = cx - bHalf_px; s.s1.y = cy;
    s.s2.x = cx + bHalf_px; s.s2.y = cy;

    // Point M / axes de coupe : cmX/cmY sont des offsets physiques (cm) relatifs au CENTRE du
    // bassin (origine des sources), pas au coin haut-gauche — comme les sources sont toujours
    // recentrées en (cx,cy) quel que soit le zoom, un offset relatif au centre garde le point/axe
    // à une position géométrique fixe par rapport aux sources quand on zoome/dézoome (un offset
    // relatif au coin haut-gauche dérivait, car la portion de bassin visible en cm change avec le
    // zoom alors que le centre à l'écran (cx,cy), lui, ne bouge pas).
    if (s.point.cmX !== null) {
        s.point.x = Math.max(0, Math.min(s.canvasW, cx + s.point.cmX * s.pxPerCm));
        s.point.y = Math.max(0, Math.min(s.canvasH, cy + s.point.cmY * s.pxPerCm));
    }
    if (s.cut.cmX !== null) {
        s.cut.x = Math.max(0, Math.min(s.canvasW, cx + s.cut.cmX * s.pxPerCm));
    }
    if (s.cutH.cmY !== null) {
        s.cutH.y = Math.max(0, Math.min(s.canvasH, cy + s.cutH.cmY * s.pxPerCm));
    }

    _scheduleSurfRebuild();
}

function resizeSurfaces() {
    var canvas = document.getElementById('surf-canvas');
    if (!canvas) return;
    var wrap = document.getElementById('surf-scene-area');
    var w = wrap ? wrap.clientWidth  : canvas.clientWidth;
    var h = wrap ? wrap.clientHeight : canvas.clientHeight;
    if (w < 10 || h < 10) return;

    var dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    simSurf.canvasW = w;
    simSurf.canvasH = h;
    simSurf.pxPerCm = w / simSurf.viewCm;

    if (simSurf.firstResize) {
        // Positions par défaut exprimées en offset (cm) depuis le centre (cf. updateSurfGeometry).
        simSurf.point.cmX = (0.68 * w - w / 2) / simSurf.pxPerCm;
        simSurf.point.cmY = (0.30 * h - h / 2) / simSurf.pxPerCm;
        simSurf.cut.cmX   = (0.60 * w - w / 2) / simSurf.pxPerCm;
        simSurf.cutH.cmY  = (0.35 * h - h / 2) / simSurf.pxPerCm;
        simSurf.firstResize = false;
    }

    updateSurfGeometry();
    resizeSurfGraphCanvas();
}

var _surfRebuildScheduled = false;
function _scheduleSurfRebuild() {
    // Seulement 2 sources ponctuelles (contrairement à diffraction/ dont le rebuild pouvait
    // sommer jusqu'à ~110 sources de Huygens) : le rebuild reste bon marché quel que soit le
    // réglage, un seul requestAnimationFrame suffit toujours (pas besoin d'anti-rebond setTimeout).
    if (_surfRebuildScheduled) return;
    _surfRebuildScheduled = true;
    requestAnimationFrame(function () {
        _surfRebuildScheduled = false;
        _rebuildSurfFieldCache();
    });
}

// ══════════════════════════════════════════════════════════════════════
//  P,Q (cf. en-tête de fichier) d'UNE source ponctuelle à distance r :
//  champ(r,t) = env(r)·sin(k·r - ωt), décomposé en
//  P = env(r)·sin(kr), Q = -env(r)·cos(kr) (raw = P·cosωt + Q·sinωt),
//  cf. SURF_ENV_R0_LAMBDA pour l'enveloppe géométrique env(r).
// ══════════════════════════════════════════════════════════════════════

function _surfSourceEnv(R0, r) {
    return Math.sqrt(R0 / (R0 + r));
}

function _surfPointSourcePQ(env, k, r) {
    return { P: env * Math.sin(k * r), Q: -env * Math.cos(k * r) };
}

function _rebuildSurfFieldCache() {
    var s = simSurf;
    if (s.canvasW < 10 || s.canvasH < 10) return;

    var lambda_px = s.lambda * s.pxPerCm;
    if (lambda_px <= 0) return;

    // Dimensions de la grille — tout se joue sur UN scalaire, le nombre de cellules par pixel
    // CSS : les deux exigences (cadrage écran / échantillonnage de λ, cf. constantes en tête de
    // fichier) ayant le rapport d'aspect du canvas, la grille le conserve quoi qu'il arrive.
    var m = Math.max(1 / SURF_GRID_FACTOR, SURF_GRID_CELLS_PER_LAMBDA / lambda_px);
    if (m > 1) m = 1; // plafond écran : au-delà d'une cellule par pixel, rien ne s'affiche de plus
    var gw = s.canvasW * m;
    var gh = s.canvasH * m;

    // Puis le budget global : un dépassement divise les DEUX dimensions par le même facteur,
    // au lieu d'écraser un seul axe.
    if (gw * gh > SURF_GRID_BUDGET) {
        var shrink = Math.sqrt(SURF_GRID_BUDGET / (gw * gh));
        gw *= shrink;
        gh *= shrink;
    }
    gw = Math.max(SURF_GRID_MIN_W, Math.round(gw));
    gh = Math.max(SURF_GRID_MIN_H, Math.round(gh));

    var k     = 2 * Math.PI / lambda_px;
    var c_px  = SURF_C_CM * s.pxPerCm;
    var omega = 2 * Math.PI * c_px / lambda_px;
    var R0    = SURF_ENV_R0_LAMBDA * lambda_px;

    // Tableaux réalloués UNIQUEMENT si la taille de grille change (le rebuild est déclenché par
    // tout changement de λ/b/zoom/resize, donc très souvent à taille constante — réallouer
    // 6 Float32Array à chaque fois ne servirait qu'à nourrir le ramasse-miettes).
    var n = gw * gh;
    if (!s.r1 || s.r1.length !== n) {
        s.r1 = new Float32Array(n); s.r2 = new Float32Array(n);
        s.P1 = new Float32Array(n); s.Q1 = new Float32Array(n);
        s.P2 = new Float32Array(n); s.Q2 = new Float32Array(n);
    }
    var r1arr = s.r1, r2arr = s.r2;
    var P1 = s.P1, Q1 = s.Q1, P2 = s.P2, Q2 = s.Q2;

    // ── Les deux symétries exactes du maillage ────────────────────────────────────────────
    // Le maillage px = (gx+0,5)/gw·canvasW et py = (gy+0,5)/gh·canvasH est EXACTEMENT symétrique
    // par rapport au centre du canvas, et les 2 sources sont placées en (cx ∓ b/2, cy) avec
    // cx = canvasW/2 et cy = canvasH/2 (cf. updateSurfGeometry). D'où deux identités exactes,
    // au flottant près, valables pour toute cellule :
    //
    //   • SYMÉTRIE HAUT/BAS — les 2 sources étant sur la ligne médiane, dy(gh-1-gy) = -dy(gy),
    //     donc r1[gh-1-gy][gx] = r1[gy][gx] (idem r2). On ne calcule que la moitié haute et on
    //     RECOPIE les lignes. Facteur 2.
    //
    //   • SYMÉTRIE GAUCHE/DROITE — attention, elle n'échange pas une source avec elle-même mais
    //     LES DEUX SOURCES ENTRE ELLES : dx1(gw-1-gx) = -dx2(gx), donc r1[gy][gw-1-gx] =
    //     r2[gy][gx]. Elle ne divise donc PAS le calcul de r1 par 2 — elle donne r2/P2/Q2
    //     GRATUITEMENT à partir de r1/P1/Q1, par simple écriture en miroir. Facteur 2 aussi.
    //
    // Total : 1 sqrt + 1 sqrt(env) + 1 sin + 1 cos sur la moitié des cellules, là où le code
    // précédent en faisait 2+2+2+2 sur la totalité — soit le quart du travail trigonométrique.
    //
    // NB : ces deux identités sont purement GÉOMÉTRIQUES (elles ne portent que sur r/P/Q, jamais
    // sur l'état allumé/éteint des sources) — elles restent donc vraies quel que soit l'historique
    // des bascules. C'est ce qui les distingue de la symétrie du CHAMP, cf. drawSurfaces.
    var hh = (gh + 1) >> 1; // lignes réellement calculées (moitié haute, arrondie au-dessus)

    for (var gy = 0; gy < hh; gy++) {
        var py = (gy + 0.5) / gh * s.canvasH;
        var dy1 = py - s.s1.y;
        var dy1sq = dy1 * dy1;
        var row = gy * gw;
        for (var gx = 0; gx < gw; gx++) {
            var px = (gx + 0.5) / gw * s.canvasW;
            var dx1 = px - s.s1.x;
            var r1 = Math.sqrt(dx1 * dx1 + dy1sq);
            var env = Math.sqrt(R0 / (R0 + r1));
            var kr = k * r1;
            var Pv = env * Math.sin(kr), Qv = -env * Math.cos(kr);

            var idx = row + gx;
            r1arr[idx] = r1; P1[idx] = Pv; Q1[idx] = Qv;
            // Miroir gauche/droite → source 2, sans le moindre calcul supplémentaire.
            var mir = row + (gw - 1 - gx);
            r2arr[mir] = r1; P2[mir] = Pv; Q2[mir] = Qv;
        }
    }

    // Miroir haut/bas : recopie de lignes entières (memcpy), aucun calcul.
    for (var gyb = hh; gyb < gh; gyb++) {
        var srcOff = (gh - 1 - gyb) * gw, dstOff = gyb * gw;
        r1arr.set(r1arr.subarray(srcOff, srcOff + gw), dstOff);
        r2arr.set(r2arr.subarray(srcOff, srcOff + gw), dstOff);
        P1.set(P1.subarray(srcOff, srcOff + gw), dstOff);
        Q1.set(Q1.subarray(srcOff, srcOff + gw), dstOff);
        P2.set(P2.subarray(srcOff, srcOff + gw), dstOff);
        Q2.set(Q2.subarray(srcOff, srcOff + gw), dstOff);
    }

    s.gridW = gw; s.gridH = gh;
    s.k = k; s.c_px = c_px; s.omega = omega;

    // Canvas hors écran + ImageData de la vue de dessus : reconstruits seulement si la grille a
    // changé de dimensions (redimensionner un canvas l'efface et réalloue son tampon).
    if (!s._offCanvas) s._offCanvas = document.createElement('canvas');
    if (s._offCanvas.width !== gw || s._offCanvas.height !== gh || !s._imgData) {
        s._offCanvas.width  = gw;
        s._offCanvas.height = gh;
        s._offCtx = s._offCanvas.getContext('2d');
        s._imgData = s._offCtx.createImageData(gw, gh);
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Champ d'onde exact (non grillé) en un point (px, py) du bassin, à
//  l'instant t (simTime par défaut) — utilisé pour le point de mesure M
//  (position arbitraire) et les graphes Hauteur(t)/Amplitude(y)/Amplitude(x).
//  Volontairement PAS interpolé depuis la grille basse résolution du rendu
//  couleur (cf. _rebuildSurfFieldCache) : cette grille est dimensionnée pour
//  résoudre l'onde porteuse (λ), mais les franges d'interférence peuvent
//  varier sur une échelle spatiale bien plus fine (près des sources, ou pour
//  un grand écartement b) — l'interpoler y introduit un moiré/crénelage
//  artificiel. Chaque source ne coûtant qu'un sqrt+sin+cos, le calcul direct
//  reste largement assez rapide pour ces requêtes ponctuelles.
// ══════════════════════════════════════════════════════════════════════

// État allumé/éteint d'une source au temps `tau` (à évaluer au temps RETARDÉ d'émission,
// pas au temps présent — cf. _surfSourceContrib), d'après l'historique des bascules
// `toggles` (triées par ordre croissant de t, cf. toggleSurfSource). Avant la première
// bascule, la source est considérée allumée depuis toujours.
function _surfActiveAt(toggles, tau) {
    var enabled = true;
    for (var i = 0; i < toggles.length; i++) {
        if (toggles[i].t <= tau) enabled = toggles[i].enabled; else break;
    }
    return enabled;
}

// Une source contribue au champ en (px,py) à l'instant t si (a) l'onde a eu le temps
// d'arriver (r ≤ c·t, comme l'ancien test `r <= front`) ET (b) la source était allumée au
// moment RETARDÉ où cette contribution a été émise (t - r/c) — pas forcément son état
// actuel : une source coupée après avoir émis une onde ne l'efface pas rétroactivement.
function _surfSourceContrib(toggles, t, r, c_px) {
    if (r > c_px * t) return false;
    return _surfActiveAt(toggles, t - r / c_px);
}

// Variante "anti-aliasée" de _surfSourceContrib, réservée aux 2 boucles qui peignent la grille
// basse résolution du champ (cf. _rebuildSurfFieldCache) avant agrandissement par drawImage
// (vue de dessus ET vue plongeante) : un front (de démarrage ou créé par une bascule marche/arrêt,
// cf. toggleSurfSource) est une transition BRUTALE d'amplitude d'une cellule à l'autre — contrairement
// au reste du champ qui varie progressivement — et cette brutalité, échantillonnée à la résolution
// grossière de la grille, produit un cercle en escalier que le flou de rendu (bien plus fin qu'une
// cellule) ne peut pas masquer. On adoucit donc ici l'état actif/inactif sur une petite largeur
// `edgePx` (quelques cellules) en moyennant plusieurs échantillons radiaux, plutôt qu'en tranchant
// net — un vrai anti-aliasing, pas un changement de la physique (la bascule reste un instant précis).
// Retourne un facteur [0,1] à MULTIPLIER à la contribution (pas un booléen à tester).
//
// N'est appelée par _surfSourceGate QUE tout près d'une frontière réelle (cf. _surfBoundaryList/
// _surfNearBoundary) : ailleurs (l'immense majorité de la grille, y compris tout le champ proche
// entre les 2 sources où les franges d'interférence sont très serrées), on garde le test booléen
// exact — sinon ce lissage, à largeur fixe, floute aussi du vrai détail fin du champ qui n'a rien
// à voir avec un front (bug repéré : franges proches des sources floutées par le tout premier front
// de démarrage qui les traverse en début d'animation).
var SURF_FRONT_AA_SAMPLES = 3;
function _surfSourceWeight(toggles, t, r, c_px, edgePx) {
    var sum = 0;
    for (var i = 0; i < SURF_FRONT_AA_SAMPLES; i++) {
        var offset = edgePx * (i / (SURF_FRONT_AA_SAMPLES - 1) - 0.5);
        var rr = r + offset;
        if (rr < 0) rr = 0;
        if (rr <= c_px * t && _surfActiveAt(toggles, t - rr / c_px)) sum++;
    }
    return sum / SURF_FRONT_AA_SAMPLES;
}

// Rayons des frontières actives pour une source donnée à l'instant t : le front d'arrivée
// (c·t, commun aux 2 sources) et le rayon correspondant à chaque bascule marche/arrêt de
// l'historique (cf. toggleSurfSource) — au-delà de `edgePx` de toutes ces frontières, le champ
// est soit entièrement établi soit encore entièrement silencieux, sans transition à lisser.
function _surfBoundaryList(toggles, t, c_px) {
    var arr = [c_px * t];
    for (var i = 0; i < toggles.length; i++) arr.push(c_px * (t - toggles[i].t));
    return arr;
}

function _surfNearBoundary(r, boundaries, edgePx) {
    for (var i = 0; i < boundaries.length; i++) {
        var d = r - boundaries[i];
        if (d < 0) d = -d;
        if (d < edgePx) return true;
    }
    return false;
}

// Passerelle entre le test exact (rapide, utilisé partout) et le lissage anti-aliasé (coûteux,
// réservé aux abords immédiats d'une frontière) — cf. commentaires de _surfSourceWeight.
function _surfSourceGate(toggles, boundaries, t, r, c_px, edgePx) {
    if (_surfNearBoundary(r, boundaries, edgePx)) {
        return _surfSourceWeight(toggles, t, r, c_px, edgePx);
    }
    return _surfSourceContrib(toggles, t, r, c_px) ? 1 : 0;
}

function _surfSourcesAt(s, lambda_px, px, py) {
    var k = 2 * Math.PI / lambda_px;
    var R0 = SURF_ENV_R0_LAMBDA * lambda_px;
    var dx1 = px - s.s1.x, dy1 = py - s.s1.y;
    var r1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    var dx2 = px - s.s2.x, dy2 = py - s.s2.y;
    var r2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    var pq1 = _surfPointSourcePQ(_surfSourceEnv(R0, r1), k, r1);
    var pq2 = _surfPointSourcePQ(_surfSourceEnv(R0, r2), k, r2);
    return { r1: r1, r2: r2, P1: pq1.P, Q1: pq1.Q, P2: pq2.P, Q2: pq2.Q };
}

function _surfFieldRaw(px, py, tOverride) {
    var s = simSurf;
    var lambda_px = s.lambda * s.pxPerCm;
    if (lambda_px <= 0 || s.pxPerCm <= 0) return 0;
    var c_px  = SURF_C_CM * s.pxPerCm;
    var omega = 2 * Math.PI * c_px / lambda_px;
    var t     = (tOverride !== undefined) ? tOverride : s.simTime;

    var f = _surfSourcesAt(s, lambda_px, px, py);
    var cosWT = Math.cos(omega * t), sinWT = Math.sin(omega * t);
    var raw = 0;
    if (_surfSourceContrib(s.s1Toggles, t, f.r1, c_px)) raw += f.P1 * cosWT + f.Q1 * sinWT;
    if (_surfSourceContrib(s.s2Toggles, t, f.r2, c_px)) raw += f.P2 * cosWT + f.Q2 * sinWT;
    return raw;
}

// ══════════════════════════════════════════════════════════════════════
//  Enveloppe (amplitude MAXIMALE) en un point (px, py) — le facteur devant
//  cos(ωt)/sin(ωt) de la somme des 2 sources, soit √(P²+Q²). Utilisé par le
//  graphe "Amplitude(y)".
// ══════════════════════════════════════════════════════════════════════

function _surfFieldEnvelope(px, py, tOverride) {
    var s = simSurf;
    var lambda_px = s.lambda * s.pxPerCm;
    if (lambda_px <= 0 || s.pxPerCm <= 0) return 0;
    var c_px = SURF_C_CM * s.pxPerCm;
    var t    = (tOverride !== undefined) ? tOverride : s.simTime;

    var f = _surfSourcesAt(s, lambda_px, px, py);
    var P = 0, Q = 0;
    if (_surfSourceContrib(s.s1Toggles, t, f.r1, c_px)) { P += f.P1; Q += f.Q1; }
    if (_surfSourceContrib(s.s2Toggles, t, f.r2, c_px)) { P += f.P2; Q += f.Q2; }
    return Math.sqrt(P * P + Q * Q);
}

// ══════════════════════════════════════════════════════════════════════
//  Projection 3D partagée (vue plongeante) — rotation d'angle theta autour de
//  l'axe x (= droite S1S2). Reprend le principe de ondes/js/vagues.js →
//  _render3DWaveView (screen_y = H/2 + (wz−srcY)·cosθ − wy·sinθ), ici wz = y
//  bassin (axe perpendiculaire à S1S2) et wy = hauteur de vague au point.
//  Utilisée par les overlays (zones d'interférence, axes de coupe, sources) —
//  PAS par le rendu de la nappe elle-même (_render3DSurfView), qui lit
//  directement le cache P/Q par cellule pour éviter de recalculer un
//  sqrt+sin+cos par pixel affiché.
//
//  Hauteur volontairement NON écrêtée à ±1 (contrairement à la couleur) : un
//  point où les 2 sources arrivent en phase peut ainsi monter visiblement
//  plus haut qu'un point simple — c'est exactement ce qu'on veut mettre en
//  évidence avec cette vue.
// ══════════════════════════════════════════════════════════════════════

// `flat` : ignore la hauteur d'onde (utilisé pour le marqueur d'une source désactivée, cf.
// _drawSurfSources — sinon son marqueur continuerait d'osciller avec le champ TOTAL au point où
// elle se trouve, y compris la contribution de l'AUTRE source encore active, ce qui donnerait
// l'impression trompeuse qu'une source coupée "vibre" encore).
function _surf3DProjectPoint(px, py, thetaRad, flat) {
    var s = simSurf;
    var wy = flat ? 0 : _surfFieldRaw(px, py) * SURF_3D_AMP_PX;
    var screenYbase = s.canvasH / 2 + (py - s.originY) * Math.cos(thetaRad);
    return { x: px, y: screenYbase - wy * Math.sin(thetaRad) };
}

// Inverse de _surf3DProjectPoint pour une abscisse x FIXÉE (screenX = x, insensible à theta,
// cf. plus haut) : retrouve la coordonnée y du bassin correspondant à un clic écran, pour
// permettre le drag du point M en vue plongeante. Pas de forme fermée (wy dépend lui-même de y)
// — résolu par point fixe (quelques itérations suffisent, la correction de hauteur restant petite
// devant le terme dominant en cosθ·y) ; amorcé à la position actuelle de M pour une convergence
// rapide et une continuité visuelle d'une frame à l'autre.
function _surf3DInvertY(x, screenY, thetaRad, seedY) {
    var s = simSurf;
    var cosT = Math.cos(thetaRad), sinT = Math.sin(thetaRad);
    var y = seedY;
    for (var i = 0; i < 8; i++) {
        var raw = _surfFieldRaw(x, y);
        var wy = raw * SURF_3D_AMP_PX;
        y = s.originY + (screenY - s.canvasH / 2 + wy * sinT) / cosT;
        if (y < 0) y = 0; else if (y > s.canvasH) y = s.canvasH;
    }
    return y;
}

// ══════════════════════════════════════════════════════════════════════
//  Rendu principal du bassin (vue de dessus)
// ══════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  Profileur — TEMPORAIRE, à retirer à la fin de ce chantier.
//
//  Éteint par défaut et ne pilote RIEN : il ne fait que mesurer, à la demande. C'est délibéré —
//  la session précédente a perdu des heures sur trois hypothèses de coût successives, toutes
//  démenties par la première mesure venue, et sur un régulateur qui, lui, agissait.
//
//  Usage, depuis la console du navigateur :
//      SURF_PERF_DEBUG = true;   // puis laisser tourner ~3 s dans la vue à mesurer
//      surfPerfReport();         // affiche le relevé et remet les compteurs à zéro
//
//  Le compteur de frames est incrémenté dans drawSurfaces, donc dans les DEUX vues — les
//  compteurs de détail s'alimentant eux aussi dans les deux, l'incrémenter seulement dans le
//  rendu 3D ferait afficher des SOMMES au lieu de moyennes en vue de dessus (bug de la session
//  précédente : un absurde champ_ms à 2617).
// ══════════════════════════════════════════════════════════════════════

var SURF_PERF_DEBUG = false;
var _surfPerf = { frames: 0, total: 0, field: 0, paint: 0, span: 0, first: 0, last: 0, dims: '' };

function _surfPerfNow() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function _surfPerfFrame(t0) {
    var p = _surfPerf;
    var now = _surfPerfNow();
    if (!p.frames) p.first = t0;
    p.frames++;
    p.total += now - t0;
    p.last = now;
}

function surfPerfReport() {
    var p = _surfPerf;
    if (!p.frames) {
        console.log('Profileur inactif. Faire : SURF_PERF_DEBUG = true; puis attendre ~3 s.');
        return;
    }
    // Période d'affichage MESURÉE, pas une constante en dur — mais plafonnée à 16,7 ms : si la
    // simulation rame, les intervalles s'allongent et un estimateur naïf conclurait « le budget a
    // doublé », donc se relâcherait encore (piège de rétroaction du bilan précédent).
    var period = Math.min(16.7, (p.last - p.first) / Math.max(1, p.frames - 1));
    var f = p.frames;
    console.log(
        'frames=' + f +
        '  frame_totale_ms=' + (p.total / f).toFixed(3) +
        '  champ_ms=' + (p.field / f).toFixed(3) +
        '  peintre_ms=' + (p.paint / f).toFixed(3) +
        '\nperiode_mesuree_ms=' + period.toFixed(2) +
        '  budget_consomme_pct=' + (100 * p.total / f / period).toFixed(1) +
        '\n' + p.dims
    );
    _surfPerf = { frames: 0, total: 0, field: 0, paint: 0, span: 0, first: 0, last: 0, dims: '' };
}

function drawSurfaces() {
    var _perfT0 = SURF_PERF_DEBUG ? _surfPerfNow() : 0;
    var canvas = document.getElementById('surf-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    var s = simSurf;

    var is3D = (s.viewMode === 'plongeante');

    if (!s.P1 || s.gridW * s.gridH !== s.P1.length) {
        // Cache pas encore construit (premier affichage juste après un resize/tab-switch,
        // rebuild anti-rebond en attente) : fond uni le temps qu'il arrive.
        ctx.fillStyle = 'rgb(' + SURF_COL_BG.join(',') + ')';
        ctx.fillRect(0, 0, W, H);
        _drawSurfSources(ctx);
        _drawSurfPoint(ctx, is3D);
        if (!is3D && s.distMode !== 'none') _drawSurfDistances(ctx);
        if (s.showGraph && _surfAmpYActive()) _drawSurfCutAxis(ctx, H);
        if (s.showGraph && _surfAmpXActive()) _drawSurfCutAxisH(ctx, W);
        _drawSurfScaleBar(ctx, W, H);
        _updateSurfValues();
        if (SURF_PERF_DEBUG) _surfPerfFrame(_perfT0);
        return;
    }

    var t = s.simTime;
    var cosWT = Math.cos(s.omega * t), sinWT = Math.sin(s.omega * t);

    if (is3D) {
        _render3DSurfView(ctx, W, H, cosWT, sinWT, t);
    } else {
        var gw = s.gridW, gh = s.gridH;
        var img  = s._imgData;
        var data = img.data;
        var edgePx = 2 * (s.canvasW / gw); // largeur d'adoucissement des fronts, cf. _surfSourceWeight
        var boundS1 = _surfBoundaryList(s.s1Toggles, t, s.c_px);
        var boundS2 = _surfBoundaryList(s.s2Toggles, t, s.c_px);

        // ── Symétrie haut/bas du CHAMP ────────────────────────────────────────────────────
        // r/P/Q sont symétriques ligne à ligne (cf. _rebuildSurfFieldCache), et les portes
        // marche/arrêt ne dépendent que de r — donc raw, et donc la couleur, le sont aussi.
        // Contrairement au rebuild, la symétrie GAUCHE/DROITE n'est ici PAS exploitable : elle
        // échange les 2 sources, or leurs historiques de bascule peuvent différer (une source
        // coupée, l'autre non) — le champ cesse alors d'être symétrique en x. Celle du haut/bas,
        // elle, tient inconditionnellement, les 2 sources étant sur la ligne médiane.
        var hh = (gh + 1) >> 1;
        var r1a = s.r1, r2a = s.r2, P1a = s.P1, Q1a = s.Q1, P2a = s.P2, Q2a = s.Q2;
        var cpx = s.c_px;
        var tr0 = SURF_COL_TROUGH[0], tr1 = SURF_COL_TROUGH[1], tr2 = SURF_COL_TROUGH[2];
        var dc0 = SURF_COL_CREST[0] - tr0, dc1 = SURF_COL_CREST[1] - tr1, dc2 = SURF_COL_CREST[2] - tr2;
        var _pField0 = SURF_PERF_DEBUG ? _surfPerfNow() : 0;

        for (var gy = 0; gy < hh; gy++) {
            for (var gx = 0; gx < gw; gx++) {
                var idx = gy * gw + gx;
                var raw = 0;
                raw += _surfSourceGate(s.s1Toggles, boundS1, t, r1a[idx], cpx, edgePx) * (P1a[idx] * cosWT + Q1a[idx] * sinWT);
                raw += _surfSourceGate(s.s2Toggles, boundS2, t, r2a[idx], cpx, edgePx) * (P2a[idx] * cosWT + Q2a[idx] * sinWT);
                if (raw > 1) raw = 1; else if (raw < -1) raw = -1;
                var t01 = (raw + 1) * 0.5;
                var p = idx * 4;
                data[p]     = tr0 + t01 * dc0;
                data[p + 1] = tr1 + t01 * dc1;
                data[p + 2] = tr2 + t01 * dc2;
                data[p + 3] = 255;
            }
        }
        // Moitié basse : recopie des lignes RGBA déjà peintes (memcpy, aucun calcul).
        var rowBytes = gw * 4;
        for (var gyb = hh; gyb < gh; gyb++) {
            var srcB = (gh - 1 - gyb) * rowBytes;
            data.set(data.subarray(srcB, srcB + rowBytes), gyb * rowBytes);
        }
        if (SURF_PERF_DEBUG) {
            _surfPerf.field += _surfPerfNow() - _pField0;
            _surfPerf.dims = 'vue=dessus  grille=' + gw + '×' + gh + ' (' + (gw * gh) + ' cellules)';
        }
        s._offCtx.putImageData(img, 0, 0);

        ctx.imageSmoothingEnabled = true;
        ctx.filter = 'blur(0.6px)';
        ctx.drawImage(s._offCanvas, 0, 0, gw, gh, 0, 0, W, H);
        ctx.filter = 'none';
    }

    if (s.interfMode !== 'none') _drawSurfInterfZones(ctx, is3D);

    _drawSurfSources(ctx, is3D);
    _drawSurfPoint(ctx, is3D);
    if (!is3D && s.distMode !== 'none') _drawSurfDistances(ctx);
    if (s.showGraph && _surfAmpYActive()) _drawSurfCutAxis(ctx, H, is3D);
    if (s.showGraph && _surfAmpXActive()) _drawSurfCutAxisH(ctx, W, is3D);
    _drawSurfScaleBar(ctx, W, H);
    _updateSurfValues();
    if (SURF_PERF_DEBUG) _surfPerfFrame(_perfT0);
}

// ══════════════════════════════════════════════════════════════════════
//  Rendu de la nappe en vue plongeante (rotation 3D autour de l'axe S1S2) —
//  réutilise la grille déjà mise en cache par _rebuildSurfFieldCache (mêmes
//  tableaux P1/Q1/P2/Q2/r1/r2 que la vue de dessus), seul le mapping vers
//  l'écran change. Algorithme du peintre par bandes, même principe que
//  ondes/js/vagues.js → _render3DWaveView, mais ici chaque "bande" est une
//  LIGNE de la grille (perpendiculaire à S1S2), remplie sur toute la largeur
//  physique du canvas — pas de sin/cos par pixel : uniquement des lectures du
//  cache déjà calculé (moins cher par pixel que vagues.js malgré 2 sources).
// ══════════════════════════════════════════════════════════════════════

// Conversion "#rrggbb" → [r,g,b], et mélange une fois pour toutes avec le fond du bassin (PAS un
// alpha-blend répété pixel par pixel à chaque frame/bande — cf. _render3DSurfView plus bas pour
// le pourquoi).
function _hexToRgb(hex) {
    var v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function _blendWithSurfBg(rgb, alpha) {
    return [
        SURF_COL_BG[0] * (1 - alpha) + rgb[0] * alpha,
        SURF_COL_BG[1] * (1 - alpha) + rgb[1] * alpha,
        SURF_COL_BG[2] * (1 - alpha) + rgb[2] * alpha
    ];
}

function _render3DSurfView(ctx, W, H, cosWT, sinWT, t) {
    var s = simSurf;
    var gw = s.gridW, gh = s.gridH;
    var dpr = window.devicePixelRatio || 1;
    var PW = Math.max(1, Math.round(W * dpr));
    var PH = Math.max(1, Math.round(H * dpr));
    var thetaRad = s.tiltDeg * Math.PI / 180;
    var cosT = Math.cos(thetaRad), sinT = Math.sin(thetaRad);
    var originY = s.canvasH / 2;

    // Tampon de sortie réutilisé d'une frame sur l'autre — un createImageData(PW, PH) par frame,
    // c'est ~8 Mo alloués puis jetés 60 fois par seconde en plein écran, à la seule charge du
    // ramasse-miettes. Recréé uniquement si la taille de sortie change (resize, splitter, dpr).
    if (!s._img3D || s._img3D.width !== PW || s._img3D.height !== PH) {
        s._img3D  = ctx.createImageData(PW, PH);
        s._img3Du32 = new Uint32Array(s._img3D.data.buffer);
        s._prevSy = new Int32Array(PW);
    }
    var imgData = s._img3D;
    var data = imgData.data;

    // Fond (aucune vague n'a encore atteint la zone, ou hors nappe) : même bleu-gris qu'en vue
    // de dessus (pas de dégradé "ciel" façon vagues.js — ici on regarde un bassin d'en haut, pas
    // un tube avec de l'air au-dessus). Peint en un seul fill() sur une vue 32 bits du tampon
    // (~4× moins d'écritures qu'une boucle octet par octet). Le motif 32 bits est fabriqué en
    // écrivant les 4 composantes puis en RELISANT le mot : pas d'hypothèse sur le boutisme.
    data[0] = SURF_COL_BG[0]; data[1] = SURF_COL_BG[1]; data[2] = SURF_COL_BG[2]; data[3] = 255;
    s._img3Du32.fill(s._img3Du32[0]);

    // Champ brut (non écrêté) précalculé une fois par cellule de la grille de cache (comme la
    // boucle couleur de la vue de dessus), réutilisé ensuite par interpolation bilinéaire —
    // évite de retomber sur un rendu "plus proche voisin" blocky (cause du pixelisé signalé) tout
    // en gardant un coût de calcul par cellule (pas par pixel de sortie).
    if (!s._rawGrid || s._rawGrid.length !== gw * gh) s._rawGrid = new Float32Array(gw * gh);
    var rawGrid = s._rawGrid;
    var edgePx = 2 * (s.canvasW / gw); // largeur d'adoucissement des fronts, cf. _surfSourceWeight
    var boundS1 = _surfBoundaryList(s.s1Toggles, t, s.c_px);
    var boundS2 = _surfBoundaryList(s.s2Toggles, t, s.c_px);

    // Moitié haute seulement, puis recopie des lignes : même symétrie haut/bas que la boucle
    // couleur de la vue de dessus, et pour la même raison (cf. drawSurfaces).
    var hhc = (gh + 1) >> 1;
    var r1c_ = s.r1, r2c_ = s.r2, P1c = s.P1, Q1c = s.Q1, P2c = s.P2, Q2c = s.Q2;
    var cpxc = s.c_px;
    var _pField0 = SURF_PERF_DEBUG ? _surfPerfNow() : 0;
    for (var gyc = 0; gyc < hhc; gyc++) {
        for (var gxc = 0; gxc < gw; gxc++) {
            var idxc = gyc * gw + gxc;
            var rawc = 0;
            rawc += _surfSourceGate(s.s1Toggles, boundS1, t, r1c_[idxc], cpxc, edgePx) * (P1c[idxc] * cosWT + Q1c[idxc] * sinWT);
            rawc += _surfSourceGate(s.s2Toggles, boundS2, t, r2c_[idxc], cpxc, edgePx) * (P2c[idxc] * cosWT + Q2c[idxc] * sinWT);
            rawGrid[idxc] = rawc;
        }
    }
    for (var gycb = hhc; gycb < gh; gycb++) {
        var srcC = (gh - 1 - gycb) * gw;
        rawGrid.set(rawGrid.subarray(srcC, srcC + gw), gycb * gw);
    }
    if (SURF_PERF_DEBUG) _surfPerf.field += _surfPerfNow() - _pField0;

    // ── Nombre de bandes de profondeur ────────────────────────────────────────────────────
    // C'est l'échantillonnage de la nappe le long de l'axe y du bassin, et donc l'axe FAIBLE du
    // rendu : la grille du champ offre désormais 9 cellules par λ dans les deux directions (cf.
    // étape 3a), mais la boucle du peintre ne relisait cette grille qu'à travers un nombre de
    // bandes indexé sur la seule résolution de SORTIE (150…500), sans aucun rapport avec λ. Aux
    // petites longueurs d'onde sur un bassin haut, la profondeur retombait sous les 5 échantillons
    // par λ — en dessous de ce que la grille fournit, donc c'est ce maillon-là qui repliait le
    // champ et crénelait les crêtes, pas la grille.
    //
    // On l'indexe donc sur λ exactement comme la grille, avec le MÊME scalaire cellules/px, puis
    // trois bornes : un plancher de lissage, la résolution de sortie (au-delà, deux bandes
    // tombent sur la même ligne et la seconde efface la première), et un budget d'itérations.
    //
    // Ce budget est exprimé en ITÉRATIONS (bandes × colonnes), pas en millisecondes : le budget
    // d'une frame appartient à l'écran, pas au code, et une constante en ms se serait révélée
    // fausse sur toute autre machine (cf. bilan de la session précédente). C'est la boucle du
    // peintre qui domine le coût du rendu — d'où le dégraissage de son corps ci-dessous, qui
    // finance ces bandes supplémentaires.
    //
    // NB : l'optimisation « ne peindre que PH·cos θ bandes » (l'inclinaison comprimant la
    // profondeur) est délibérément ÉCARTÉE — elle réduit précisément la grandeur qu'on cherche
    // ici à augmenter, et d'autant plus qu'on regarde de plus en plus rasant.
    // DEUX exigences indépendantes, dont on prend le maximum :
    //
    //   • LISSAGE DE LA SILHOUETTE — une bande par ligne de sortie réellement couverte par la
    //     nappe. L'inclinaison comprimant la profondeur, la nappe ne s'étale que sur PH·cos θ
    //     lignes : c'est donc là, et pas à PH, qu'il faut viser. C'est exactement le facteur
    //     cos θ que la session précédente avait mesuré — mais utilisé ici comme un PLANCHER de
    //     lissage, pas comme un plafond d'économie. Il donne d'ailleurs ce qu'on veut des deux
    //     côtés : plus de bandes en vue quasi-verticale (nappe étalée), moins en vue rasante
    //     (nappe écrasée), ce qui libère justement du budget là où l'autre exigence monte.
    //
    //   • ÉCHANTILLONNAGE DE λ EN PROFONDEUR — le même nombre de cellules par λ que la grille du
    //     champ. C'est cette exigence-là qui manquait : elle ne l'emporte que pour λ_px inférieur
    //     à ~13 px, c'est-à-dire précisément le régime de dézoom à petite λ où les crêtes se
    //     crénelaient, et où le maillon faible était la profondeur, pas la grille.
    var lambda_px_3d = s.lambda * s.pxPerCm;
    var mDepth = (lambda_px_3d > 0)
        ? Math.max(1 / SURF_GRID_FACTOR, SURF_GRID_CELLS_PER_LAMBDA / lambda_px_3d)
        : 1 / SURF_GRID_FACTOR;
    var N_Z = Math.ceil(PH * cosT);                            // lissage
    var nLambda = Math.ceil(s.canvasH * mDepth);               // échantillonnage de λ
    if (nLambda > N_Z) N_Z = nLambda;
    if (N_Z > SURF_3D_BANDS_MAX) N_Z = SURF_3D_BANDS_MAX;
    if (N_Z > PH) N_Z = PH; // au-delà, deux bandes tombent sur la même ligne de sortie
    if (N_Z * PW > SURF_3D_BANDS_BUDGET) N_Z = Math.floor(SURF_3D_BANDS_BUDGET / PW);
    if (N_Z < SURF_3D_BANDS_MIN) N_Z = SURF_3D_BANDS_MIN; // plancher appliqué en dernier : il prime

    // ── Plan de coupe horizontal (Amplitude(x), y = cutH.y), cf. _drawSurfCutAxisH ──────────
    // Rendu ICI (pas en overlay séparé après coup) : la nappe/le fond marin, dessinés APRÈS pour
    // la même bande, masquent ainsi naturellement toute portion "sous l'eau" du plan (retour
    // utilisateur : on ne devait plus du tout la voir). Couleur mélangée UNE SEULE FOIS avec le
    // fond (pas un alpha-blend répété à chaque bande, qui sur-saturerait le plan) — alpha modéré
    // pour qu'il reste visiblement transparent au-dessus de l'eau (2e retour utilisateur).
    // Le plan vertical (Amplitude(y), x = cut.x) N'EST PAS traité ici : perpendiculaire à l'axe de
    // rotation S1S2, il n'a par construction aucune épaisseur sous cet angle de vue (sa projection
    // reste un simple TRAIT quel que soit theta) — inutile/trompeur d'en faire un plan rempli ; il
    // est tracé en overlay simple par _drawSurfCutAxis, comme avant ce chantier des plans.
    var showHPlane = s.showGraph && _surfAmpXActive();
    var hRgb = showHPlane ? _blendWithSurfBg(_hexToRgb(SURF_COL_CUT_H), 0.22) : null;
    var hHalfBand = (s.canvasH / N_Z) / 2 + 0.5; // demi-épaisseur (en y bassin) d'une bande z

    // Position écran (physique) de la ligne "z = -0.5" (bord arrière du bassin, wy = 0).
    var sy0 = Math.round((H / 2 + (0 - originY) * cosT) * dpr);
    var prevSyArr = s._prevSy; // alloué en même temps que le tampon de sortie, cf. plus haut
    prevSyArr.fill(sy0);

    // ── Tables d'interpolation horizontale ────────────────────────────────────────────────
    // gx0/gx1/tx ne dépendent QUE de la colonne : les recalculer dans la boucle interne les
    // refaisait à l'identique N_Z fois de suite (une division, un floor, deux comparaisons et
    // une soustraction par pixel peint). Calculés une fois par frame — et même seulement quand
    // la géométrie change, ce qui est le cas courant.
    var colSig = PW + '|' + gw + '|' + s.canvasW + '|' + dpr;
    if (s._colSig !== colSig) {
        s._colSig = colSig;
        s._colGx0 = new Int32Array(PW);
        s._colGx1 = new Int32Array(PW);
        s._colTx  = new Float32Array(PW);
        for (var ci = 0; ci < PW; ci++) {
            var fxc = (ci / dpr) / s.canvasW * gw - 0.5;
            if (fxc < 0) fxc = 0; else if (fxc > gw - 1) fxc = gw - 1;
            var g0 = Math.floor(fxc);
            s._colGx0[ci] = g0;
            s._colGx1[ci] = Math.min(g0 + 1, gw - 1);
            s._colTx[ci]  = fxc - g0;
        }
    }
    var colGx0 = s._colGx0, colGx1 = s._colGx1, colTx = s._colTx;

    // Constantes de couleur sorties des boucles : elles étaient relues dans les tableaux
    // SURF_COL_* à chaque pixel peint (6 accès indexés par pixel).
    var tr0_ = SURF_COL_TROUGH[0], tr1_ = SURF_COL_TROUGH[1], tr2_ = SURF_COL_TROUGH[2];
    var dc0_ = SURF_COL_CREST[0] - tr0_, dc1_ = SURF_COL_CREST[1] - tr1_, dc2_ = SURF_COL_CREST[2] - tr2_;
    // Hauteur → décalage écran, en pixels physiques : un seul facteur au lieu de trois produits.
    var ampSinDpr = SURF_3D_AMP_PX * sinT * dpr;

    var _pPaint0 = SURF_PERF_DEBUG ? _surfPerfNow() : 0;

    for (var zi = 0; zi < N_Z; zi++) {
        var py = (zi + 0.5) / N_Z * s.canvasH;
        var screenYbase = H / 2 + (py - originY) * cosT;
        var screenYbaseDpr = screenYbase * dpr;
        var fy = py / s.canvasH * gh - 0.5;
        if (fy < 0) fy = 0; else if (fy > gh - 1) fy = gh - 1;
        var gy0 = Math.floor(fy), gy1 = Math.min(gy0 + 1, gh - 1);
        var ty = fy - gy0;
        var row0 = gy0 * gw, row1 = gy1 * gw; // décalages de ligne, invariants dans la bande

        // Plan horizontal : n'existe qu'à UNE profondeur (y = cutH.y) — dessiné exactement à la
        // bande zi qui la contient, intercalé DANS la boucle peintre (donc occlus par toute bande
        // plus proche/plus tard, et occultant lui-même ce qui a été dessiné plus loin/avant).
        var zIsHPlane = showHPlane && Math.abs(py - s.cutH.y) <= hHalfBand;
        var hTop = 0, hBot = 0;
        if (zIsHPlane) {
            hTop = Math.round((screenYbase - SURF_3D_PLANE_HALF_H * sinT) * dpr);
            hBot = Math.round((screenYbase + SURF_3D_PLANE_HALF_H * sinT) * dpr);
            if (hTop < 0) hTop = 0;
            if (hBot >= PH) hBot = PH - 1;
        }

        for (var pxi2 = 0; pxi2 < PW; pxi2++) {
            var gx0 = colGx0[pxi2], gx1 = colGx1[pxi2], tx = colTx[pxi2];

            // Interpolation bilinéaire de rawGrid aux 4 cellules voisines (gx0/gx1 × gy0/gy1).
            var v00 = rawGrid[row0 + gx0], v10 = rawGrid[row0 + gx1];
            var v01 = rawGrid[row1 + gx0], v11 = rawGrid[row1 + gx1];
            var vx0 = v00 + (v10 - v00) * tx;
            var vx1 = v01 + (v11 - v01) * tx;
            var raw = vx0 + (vx1 - vx0) * ty;

            // Couleur : même dégradé crête/creux que la vue de dessus, écrêté à ±1.
            var rawC = raw; if (rawC > 1) rawC = 1; else if (rawC < -1) rawC = -1;
            var t01 = (rawC + 1) * 0.5;
            var wr = tr0_ + t01 * dc0_;
            var wg = tr1_ + t01 * dc1_;
            var wb = tr2_ + t01 * dc2_;

            // Hauteur : NON écrêtée (cf. en-tête de fonction) — un point doublement constructif
            // (raw jusqu'à ±2) monte visiblement plus haut qu'un point simple.
            var sy = Math.round(screenYbaseDpr - raw * ampSinDpr);

            if (zIsHPlane) {
                for (var pyH = hTop; pyH <= hBot; pyH++) {
                    var pidxH = (pyH * PW + pxi2) * 4;
                    data[pidxH] = hRgb[0]; data[pidxH + 1] = hRgb[1]; data[pidxH + 2] = hRgb[2];
                }
            }

            var syPrev = prevSyArr[pxi2];
            var yLo = syPrev < sy ? syPrev : sy;
            var yHi = syPrev < sy ? sy : syPrev;
            if (yLo < 0) yLo = 0;
            if (yHi >= PH) yHi = PH - 1;
            // Remplissage vertical du segment : l'index avance d'une LIGNE de tampon à chaque pas
            // (PW·4 octets), inutile de le recalculer par multiplication à chaque pixel.
            var pidx = (yLo * PW + pxi2) * 4, pStep = PW * 4;
            for (var py2 = yLo; py2 <= yHi; py2++) {
                data[pidx] = wr; data[pidx + 1] = wg; data[pidx + 2] = wb; data[pidx + 3] = 255;
                pidx += pStep;
            }
            prevSyArr[pxi2] = sy;
        }
    }

    // Avant du bassin (sous la dernière ligne) : aplat façon fond marin, teinte "creux" assombrie.
    for (var pxi3 = 0; pxi3 < PW; pxi3++) {
        var syLast = prevSyArr[pxi3];
        var yStart = syLast < 0 ? 0 : syLast;
        for (var py3 = yStart; py3 < PH; py3++) {
            var pidx2 = (py3 * PW + pxi3) * 4;
            data[pidx2] = SURF_COL_TROUGH[0] * 0.5;
            data[pidx2 + 1] = SURF_COL_TROUGH[1] * 0.5;
            data[pidx2 + 2] = SURF_COL_TROUGH[2] * 0.7;
            data[pidx2 + 3] = 255;
        }
    }

    if (SURF_PERF_DEBUG) {
        _surfPerf.paint += _surfPerfNow() - _pPaint0;
        // Échantillons de profondeur par longueur d'onde — la grandeur que l'étape 3b vise.
        var depthPerLambda = N_Z * lambda_px_3d / s.canvasH;
        _surfPerf.dims = 'vue=plongeante  grille=' + gw + '×' + gh + ' (' + (gw * gh) + ' cellules)'
            + '  sortie=' + PW + '×' + PH
            + '  bandes=' + N_Z + ' (' + (N_Z * PW) + ' iterations)'
            + '\ncellules/lambda=' + (gw * lambda_px_3d / s.canvasW).toFixed(1)
            + '  echantillons_profondeur/lambda=' + depthPerLambda.toFixed(1)
            + '  lambda_px=' + lambda_px_3d.toFixed(1);
    }
    ctx.putImageData(imgData, 0, 0);
}

// Les axes de coupe (graphes "Amplitude(y)"/"Amplitude(x)") ne sont affichés/actifs que si le
// graphe correspondant est sélectionné dans l'un des deux emplacements (simple ou dual).
function _surfAmpYActive() {
    return simSurf.graphTab1 === 'amp-y' ||
           (simSurf.graphMode === 'dual' && simSurf.graphTab2 === 'amp-y');
}
function _surfAmpXActive() {
    return simSurf.graphTab1 === 'amp-x' ||
           (simSurf.graphMode === 'dual' && simSurf.graphTab2 === 'amp-x');
}

// ── Zones d'interférences (hyperboles pointillées, foyers = les 2 sources) ──
// Le lieu des points où la différence de marche |r1-r2| vaut une constante d est une hyperbole
// de foyers S1/S2 (2 branches, une par source "favorisée"). Constructif : d = n·λ (n entier,
// n=0 → droite médiatrice, cas dégénéré de l'hyperbole avec a=0). Destructif : d = (n+½)·λ.
// N'existe que pour d < b (l'écart de marche ne peut pas dépasser la distance entre les sources).
// Seule la portion déjà atteinte par les 2 fronts d'onde (r1 ≤ front ET r2 ≤ front) est tracée.

// `is3D` fait passer chaque point ajouté au chemin par _surf3DProjectPoint (vue plongeante) —
// la logique de génération des points/visibilité (front d'onde) est identique dans les 2 vues.
function _drawSurfInterfZones(ctx, is3D) {
    var s = simSurf;
    var lambda_px = s.lambda * s.pxPerCm;
    var b_px = s.b * s.pxPerCm;
    var c = b_px / 2;
    if (lambda_px <= 0 || c <= 0) return;

    var cx = s.canvasW / 2, cy = s.canvasH / 2;
    var theta = is3D ? (s.tiltDeg * Math.PI / 180) : null;
    var wantC = s.interfMode === 'constructive' || s.interfMode === 'both';
    var wantD = s.interfMode === 'destructive'  || s.interfMode === 'both';

    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);

    if (wantC) {
        ctx.strokeStyle = SURF_COL_INTERF_CONSTRUCTIVE;
        ctx.beginPath();
        for (var n = 0; n * lambda_px < b_px - 1e-6; n++) {
            _surfAddInterfCurve(ctx, s, cx, cy, c, n * lambda_px, theta);
        }
        ctx.stroke();
    }
    if (wantD) {
        ctx.strokeStyle = SURF_COL_INTERF_DESTRUCTIVE;
        ctx.beginPath();
        for (var m = 0; (m + 0.5) * lambda_px < b_px - 1e-6; m++) {
            _surfAddInterfCurve(ctx, s, cx, cy, c, (m + 0.5) * lambda_px, theta);
        }
        ctx.stroke();
    }
    ctx.restore();
}

function _surfPathTo(ctx, x, y, theta, drawing) {
    if (theta !== null) {
        var pr = _surf3DProjectPoint(x, y, theta);
        x = pr.x; y = pr.y;
    }
    if (!drawing) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    return true;
}

// Ajoute au chemin en cours la portion visible de l'hyperbole |r1-r2| = d (foyers en
// (cx∓c, cy)) — d = 0 dégénère en la droite médiatrice x = cx.
function _surfAddInterfCurve(ctx, s, cx, cy, c, d, theta) {
    var a = d / 2;
    if (a < 1e-6) {
        _surfAddBisectorPoints(ctx, s, cx, cy, c, theta);
        return;
    }
    if (a >= c) return; // pas d'hyperbole réelle (d ≥ b)
    var bh = Math.sqrt(c * c - a * a);
    _surfAddBranchPoints(ctx, s, cx, cy, a, bh, +1, theta);
    _surfAddBranchPoints(ctx, s, cx, cy, a, bh, -1, theta);
}

function _surfAddBisectorPoints(ctx, s, cx, cy, c, theta) {
    var step = 3;
    var drawing = false;
    for (var y = 0; y <= s.canvasH; y += step) {
        var r = Math.sqrt(c * c + (y - cy) * (y - cy));
        if (_surfSourceContrib(s.s1Toggles, s.simTime, r, s.c_px) &&
            _surfSourceContrib(s.s2Toggles, s.simTime, r, s.c_px)) {
            drawing = _surfPathTo(ctx, cx, y, theta, drawing);
        } else {
            drawing = false;
        }
    }
}

// Paramétrage standard d'une branche d'hyperbole : x = cx + sign·a·cosh(u), y = cy + bh·sinh(u).
// uMax est borné par la première des deux dimensions du canvas atteinte (cosh/sinh sont
// monotones croissantes en |u| : une fois sortie du canvas sur un axe, la branche ne peut plus y
// revenir), pour ne pas gaspiller l'échantillonnage au-delà de la portion visible.
function _surfAddBranchPoints(ctx, s, cx, cy, a, bh, sign, theta) {
    var margin = 20;
    var uMaxX = Math.acosh(Math.max(1.001, (s.canvasW / 2 + margin) / a));
    var uMaxY = Math.asinh((s.canvasH / 2 + margin) / bh);
    var uMax = Math.min(uMaxX, uMaxY);
    if (!(uMax > 0.02)) uMax = 0.02;

    var N = 200;
    var drawing = false;
    for (var i = -N; i <= N; i++) {
        var u = uMax * i / N;
        var x = cx + sign * a * Math.cosh(u);
        var y = cy + bh * Math.sinh(u);
        var visible = false;
        if (x >= -margin && x <= s.canvasW + margin && y >= -margin && y <= s.canvasH + margin) {
            var dx1 = x - s.s1.x, dy1 = y - s.s1.y, r1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
            var dx2 = x - s.s2.x, dy2 = y - s.s2.y, r2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
            visible = _surfSourceContrib(s.s1Toggles, s.simTime, r1, s.c_px) &&
                      _surfSourceContrib(s.s2Toggles, s.simTime, r2, s.c_px);
        }
        if (visible) {
            drawing = _surfPathTo(ctx, x, y, theta, drawing);
        } else {
            drawing = false;
        }
    }
}

// ── Sources S1/S2 ─────────────────────────────────────────────────────

function _drawSurfSources(ctx, is3D) {
    var s = simSurf;
    var theta = is3D ? (s.tiltDeg * Math.PI / 180) : null;
    var pts = [[s.s1, 'S₁', s.s1Enabled], [s.s2, 'S₂', s.s2Enabled]];
    ctx.save();
    for (var i = 0; i < pts.length; i++) {
        var pos = pts[i][0], label = pts[i][1], enabled = pts[i][2];
        var sx = pos.x, sy = pos.y;
        if (theta !== null) {
            var pr = _surf3DProjectPoint(pos.x, pos.y, theta, !enabled);
            sx = pr.x; sy = pr.y;
        }
        // Source coupée : grisée/translucide plutôt que masquée, pour rester repérable
        // (le point M/les axes de coupe peuvent encore s'y référer) tout en signalant
        // clairement qu'elle n'émet plus.
        ctx.globalAlpha = enabled ? 1 : 0.4;
        ctx.fillStyle = enabled ? '#9b8264' : '#8a8a8a';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.font = 'bold 15px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#00000080';
        ctx.lineWidth = 3;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.strokeText(label, sx, sy - 9);
        ctx.fillText(label, sx, sy - 9);
        ctx.globalAlpha = 1;
    }
    ctx.restore();
}

// ── Barre d'échelle ──────────────────────────────────────────────────
// Référence métrique en bas à gauche du bassin. Longueur choisie parmi des valeurs rondes (cf.
// SURF_SCALE_NICE_CM), la plus proche de SURF_SCALE_TARGET_FR de la largeur du bassin, de sorte
// que le nombre affiché reste lisible à tout cadrage. Tracée en clair sur un liseré sombre, pour
// rester lisible aussi bien sur les crêtes que sur les creux.
//
// Valable dans les DEUX vues : la rotation de la vue plongeante se fait autour de l'axe S1S2,
// donc horizontal — l'axe x n'est pas raccourci et une longueur en x garde son échelle exacte.

function _drawSurfScaleBar(ctx, W, H) {
    var pxPerCm = simSurf.pxPerCm;
    if (!(pxPerCm > 0)) return;

    var targetPx = SURF_SCALE_TARGET_FR * W;
    var bestCm = SURF_SCALE_NICE_CM[0], bestErr = Infinity;
    for (var i = 0; i < SURF_SCALE_NICE_CM.length; i++) {
        // Écart comparé en RELATIF (rapport des longueurs) : sinon les grandes valeurs, dont
        // l'écart absolu est mécaniquement plus grand, ne seraient jamais retenues.
        var err = Math.abs(Math.log(SURF_SCALE_NICE_CM[i] * pxPerCm / targetPx));
        if (err < bestErr) { bestErr = err; bestCm = SURF_SCALE_NICE_CM[i]; }
    }

    var len = bestCm * pxPerCm;
    var x0 = 16, y = H - 18, tick = 5;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, y);              ctx.lineTo(x0 + len, y);
    ctx.moveTo(x0, y - tick);       ctx.lineTo(x0, y + tick);
    ctx.moveTo(x0 + len, y - tick); ctx.lineTo(x0 + len, y + tick);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0, 12, 40, 0.75)';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    var label = bestCm + ' cm';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0, 12, 40, 0.75)';
    ctx.strokeText(label, x0 + len / 2, y - tick - 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x0 + len / 2, y - tick - 3);
    ctx.restore();
}

// ── Point de mesure M (draggable) ────────────────────────────────────

function _drawSurfPoint(ctx, is3D) {
    var p = simSurf.point;
    var px = p.x, py = p.y;
    if (is3D) {
        // M reste sur la surface de l'eau par construction (sa hauteur écran suit la vague, comme
        // les sources) — draggable, cf. initSurfDrag → _surf3DInvertY.
        var proj = _surf3DProjectPoint(p.x, p.y, simSurf.tiltDeg * Math.PI / 180);
        px = proj.x; py = proj.y;
    }
    ctx.save();
    ctx.strokeStyle = '#e07020';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#e07020';
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#00000080';
    ctx.lineWidth = 3;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.strokeText('M', px, py - 14);
    ctx.fillText('M', px, py - 14);
    ctx.restore();
}

// ── Distances S1→M et S2→M (doubles flèches), cf. toggleSurfDistMode ──

// Met à jour la section "Valeurs" (S₁M, S₂M, différence de marche δ) — cm si le mode
// "Distance depuis les sources" est "Non" ou "En centimètres", en multiples de λ sinon.
function _updateSurfValues() {
    var s = simSurf;
    if (!s.showValeurs) return;
    var p = s.point;
    var d1_cm = Math.hypot(p.x - s.s1.x, p.y - s.s1.y) / s.pxPerCm;
    var d2_cm = Math.hypot(p.x - s.s2.x, p.y - s.s2.y) / s.pxPerCm;

    var unit, v1, v2;
    if (s.distMode === 'lambda') {
        unit = '× λ';
        v1 = d1_cm / s.lambda;
        v2 = d2_cm / s.lambda;
    } else {
        unit = 'cm';
        v1 = d1_cm;
        v2 = d2_cm;
    }
    var s1txt = v1.toFixed(2).replace('.', ',');
    var s2txt = v2.toFixed(2).replace('.', ',');
    var deltaTxt = Math.abs(v1 - v2).toFixed(2).replace('.', ',');

    var elS1 = document.getElementById('ro-surf-s1m');
    var elS2 = document.getElementById('ro-surf-s2m');
    var elU1 = document.getElementById('ro-surf-unit1');
    var elU2 = document.getElementById('ro-surf-unit2');
    var elDetail = document.getElementById('ro-surf-delta-detail');
    if (elS1) elS1.textContent = s1txt;
    if (elS2) elS2.textContent = s2txt;
    if (elU1) elU1.textContent = unit;
    if (elU2) elU2.textContent = unit;
    if (elDetail) {
        var termUnit = (s.distMode === 'lambda') ? unit : '';
        elDetail.innerHTML =
            '<span class="rvd-lhs">δ</span><span class="rvd-eq">= |' + s1txt + termUnit + ' − ' + s2txt + termUnit + '|</span>' +
            '<span class="rvd-lhs"></span><span class="rvd-eq">= ' + deltaTxt + ' ' + unit + '</span>';
    }
}

function _drawSurfDistances(ctx) {
    var s = simSurf;
    var p = s.point;
    var d1_px = Math.hypot(p.x - s.s1.x, p.y - s.s1.y);
    var d2_px = Math.hypot(p.x - s.s2.x, p.y - s.s2.y);
    var d1_cm = d1_px / s.pxPerCm;
    var d2_cm = d2_px / s.pxPerCm;
    var label1, label2;
    if (s.distMode === 'cm') {
        label1 = d1_cm.toFixed(1).replace('.', ',') + ' cm';
        label2 = d2_cm.toFixed(1).replace('.', ',') + ' cm';
    } else {
        label1 = (d1_cm / s.lambda).toFixed(2).replace('.', ',') + ' × λ';
        label2 = (d2_cm / s.lambda).toFixed(2).replace('.', ',') + ' × λ';
    }
    _drawSurfDoubleArrow(ctx, s.s1.x, s.s1.y, p.x, p.y, label1, s.canvasW, s.canvasH, s.s2.x, s.s2.y, SURF_COL_DIST_S1);
    _drawSurfDoubleArrow(ctx, s.s2.x, s.s2.y, p.x, p.y, label2, s.canvasW, s.canvasH, s.s1.x, s.s1.y, SURF_COL_DIST_S2);
}

// Double flèche entre (x1,y1) et (x2,y2), avec un label centré au milieu, décalé
// perpendiculairement à la flèche de `offsetPx` pour ne pas la recouvrir. Le texte reste
// TOUJOURS horizontal (pas de rotation, quelle que soit l'orientation de la flèche) pour
// rester lisible, et sa position est repliée (clampée) à l'intérieur du canvas pour ne
// jamais être coupé sur les bords. (otherX,otherY) est l'AUTRE source (pas celle de cette
// flèche) : le label est décalé à l'opposé d'elle pour que les deux labels S1M/S2M,
// convergeant tous deux vers M, ne se superposent jamais entre eux.
function _drawSurfDoubleArrow(ctx, x1, y1, x2, y2, label, canvasW, canvasH, otherX, otherY, color) {
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.hypot(dx, dy);
    if (len < 1) return;
    var angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    _surfDrawArrowHead(ctx, x1, y1, angle + Math.PI);
    _surfDrawArrowHead(ctx, x2, y2, angle);

    // Décalage perpendiculaire à la flèche, du côté opposé à l'autre source : comme les
    // deux flèches S1M et S2M convergent vers M, ça écarte systématiquement les deux
    // labels l'un de l'autre plutôt que de risquer de les superposer au milieu.
    var offsetPx = 46;
    var perpX = -dy / len, perpY = dx / len;
    var midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
    var toOtherX = otherX - midX, toOtherY = otherY - midY;
    if (perpX * toOtherX + perpY * toOtherY > 0) { perpX = -perpX; perpY = -perpY; }
    var lx = midX + perpX * offsetPx;
    var ly = midY + perpY * offsetPx;

    // Repli à l'intérieur du canvas (marge tenant compte de la largeur approx. du texte).
    ctx.font = 'bold 30px monospace';
    var textW = ctx.measureText(label).width;
    var margin = textW / 2 + 4;
    if (canvasW) lx = Math.max(margin, Math.min(canvasW - margin, lx));
    if (canvasH) ly = Math.max(16, Math.min(canvasH - 6, ly));

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#00000080';
    ctx.strokeText(label, lx, ly);
    ctx.fillStyle = color;
    ctx.fillText(label, lx, ly);
    ctx.restore();
}

function _surfDrawArrowHead(ctx, x, y, angle) {
    var size = 8;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, -size * 0.5);
    ctx.lineTo(-size, size * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

// ── Axe de coupe vertical draggable (graphe "Amplitude(y)") ───────────

var SURF_COL_CUT = '#d21f1f';

function _drawSurfCutAxis(ctx, H, is3D) {
    var s = simSurf;
    var x = s.cut.x;
    if (is3D) {
        // x = cut.x est perpendiculaire à l'axe de rotation (S1S2) : ce plan n'a, par construction,
        // AUCUNE épaisseur sous cet angle de vue (sa projection reste un simple trait vertical quel
        // que soit theta, cf. _render3DSurfView) — un rendu "plan rempli" façon plan horizontal
        // n'aurait donc aucun sens géométrique ici (et se retrouvait de toute façon systématiquement
        // recouvert par la nappe, celle-ci balayant la même plage de profondeur). Simple trait
        // semi-transparent, non occulté (overlay), comme avant ce chantier des plans.
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = SURF_COL_CUT;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
        ctx.restore();
        return;
    }
    ctx.save();
    ctx.strokeStyle = SURF_COL_CUT;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x, 10);
    ctx.stroke();
    ctx.fillStyle = SURF_COL_CUT;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 7, 14);
    ctx.lineTo(x + 7, 14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

// ── Axe de coupe horizontal draggable (graphe "Amplitude(x)") ─────────

// Rose vif plutôt que bleu/vert : le bassin est déjà tout en tons bleus (crêtes claires / creux
// marine, cf. SURF_COL_CREST/TROUGH), un axe dans ces tons-là s'y distingue mal.
var SURF_COL_CUT_H = '#F5278B';

// Position écran (référence "eau au repos", PAS la vague instantanée) du plan de coupe
// horizontal en vue plongeante — cf. _drawSurfCutAxisH/initSurfDrag. cosθ ne s'annule jamais
// (SURF_TILT_MAX = 75°), l'inverse _surfCutHInvert est donc toujours bien défini.
function _surfCutHScreenY() {
    var s = simSurf;
    var theta = s.tiltDeg * Math.PI / 180;
    return s.canvasH / 2 + (s.cutH.y - s.originY) * Math.cos(theta);
}
function _surfCutHInvert(screenY) {
    var s = simSurf;
    var theta = s.tiltDeg * Math.PI / 180;
    return s.originY + (screenY - s.canvasH / 2) / Math.cos(theta);
}

function _drawSurfCutAxisH(ctx, W, is3D) {
    var s = simSurf;
    var y = s.cutH.y;
    if (is3D) {
        // Idem _drawSurfCutAxis : le plan de coupe horizontal est déjà dessiné dans
        // _render3DSurfView, intercalé au bon endroit de la boucle peintre pour une occlusion
        // correcte par la nappe (cf. commentaire là-bas).
        return;
    }
    ctx.save();
    ctx.strokeStyle = SURF_COL_CUT_H;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W - 10, y);
    ctx.stroke();
    ctx.fillStyle = SURF_COL_CUT_H;
    ctx.beginPath();
    ctx.moveTo(W, y);
    ctx.lineTo(W - 14, y - 7);
    ctx.lineTo(W - 14, y + 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════
//  Boucle d'animation — avancement du temps + échantillonnage du point M
// ══════════════════════════════════════════════════════════════════════

var _surfLastFrameT = null;

function tickSurfaces() {
    var now = performance.now();
    if (_surfLastFrameT === null) _surfLastFrameT = now;
    var dt = (now - _surfLastFrameT) / 1000;
    _surfLastFrameT = now;
    if (dt > 0.1) dt = 0.1;

    if (!simSurf.paused) {
        var tPrev = simSurf.simTime;
        simSurf.simTime += dt * (simSurf.speedFactor || 1.0);
        if (simSurf.showGraph) _updateSurfPointData(tPrev, simSurf.simTime);
    }
    drawSurfaces();
    if (simSurf.showGraph) drawSurfGraph();
}

function _updateSurfPointData(tFrom, tTo) {
    var s = simSurf;
    var p = s.point;
    var lambda_px = s.lambda * s.pxPerCm;
    var c_px = SURF_C_CM * s.pxPerCm;
    var period = (lambda_px > 0 && c_px > 0) ? lambda_px / c_px : (tTo - tFrom);
    var dtMax = Math.max(period / 20, 0.0005);
    var span = tTo - tFrom;
    var steps = Math.max(1, Math.ceil(span / dtMax));
    for (var i = 1; i <= steps; i++) {
        var t = tFrom + span * i / steps;
        s.ptData.push({ t: t, y: _surfFieldRaw(p.x, p.y, t) });
    }
    var tMin = tTo - SURF_GRAPH_WINDOW - 0.5;
    while (s.ptData.length && s.ptData[0].t < tMin) s.ptData.shift();
}

// ══════════════════════════════════════════════════════════════════════
//  Graphe Hauteur(t) au point M
// ══════════════════════════════════════════════════════════════════════

function resizeSurfGraphCanvas() {
    var canvas = document.getElementById('surf-graph-canvas');
    if (!canvas) return;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (w < 10 || h < 10) return;
    var dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawSurfGraph() {
    var canvas = document.getElementById('surf-graph-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#faf9f6';
    ctx.fillRect(0, 0, W, H);

    if (simSurf.graphMode === 'dual') {
        var halfW  = Math.floor(W / 2);
        var leftW  = halfW - 1;
        var rightW = W - halfW - 1;

        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, leftW, H); ctx.clip();
        _drawSurfOneGraph(ctx, 0, 0, leftW, H, simSurf.graphTab1);
        ctx.restore();

        ctx.save();
        ctx.translate(halfW + 1, 0);
        ctx.beginPath(); ctx.rect(0, 0, rightW, H); ctx.clip();
        _drawSurfOneGraph(ctx, 0, 0, rightW, H, simSurf.graphTab2);
        ctx.restore();
    } else {
        _drawSurfOneGraph(ctx, 0, 0, W, H, simSurf.graphTab1);
    }
}

function _drawSurfOneGraph(ctx, x0, y0, W, H, tabKey) {
    if (tabKey === 'amp-y') _drawSurfAmpY(ctx, x0, y0, W, H);
    else if (tabKey === 'amp-x') _drawSurfAmpX(ctx, x0, y0, W, H);
    else _drawSurfAmpT(ctx, x0, y0, W, H);
}

function _drawSurfAmpT(ctx, x0, y0, W, H) {
    var t    = simSurf.simTime;
    var tMax = Math.max(SURF_GRAPH_WINDOW, t);
    var tMin = tMax - SURF_GRAPH_WINDOW;
    var yMax = 1.25, yMin = -1.25;

    var GL = 78, GR = 12, GT = 14, GB = 34;
    var pW = W - GL - GR, pH = H - GT - GB;
    if (pW < 20 || pH < 20) return;

    function px(v) { return x0 + GL + (v - tMin) / (tMax - tMin) * pW; }
    function py(v) { return y0 + GT + (1 - (v - yMin) / (yMax - yMin)) * pH; }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x0 + GL, y0 + GT, pW, pH);

    ctx.strokeStyle = 'rgba(200,192,180,0.55)';
    ctx.lineWidth = 0.8;
    ctx.fillStyle = '#7a8a96';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (var v = -1; v <= 1; v += 0.5) {
        var yc = py(v);
        ctx.beginPath(); ctx.moveTo(x0 + GL, yc); ctx.lineTo(x0 + GL + pW, yc); ctx.stroke();
        ctx.fillText(v.toFixed(1).replace('.', ','), x0 + GL - 8, yc);
    }
    ctx.strokeStyle = '#b0a898';
    ctx.lineWidth = 1;
    var y0line = py(0);
    ctx.beginPath(); ctx.moveTo(x0 + GL, y0line); ctx.lineTo(x0 + GL + pW, y0line); ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var tStep = 1;
    var tStart = Math.ceil(tMin / tStep) * tStep;
    for (var tt = tStart; tt <= tMax; tt += tStep) {
        var xc = px(tt);
        ctx.strokeStyle = 'rgba(200,192,180,0.4)';
        ctx.beginPath(); ctx.moveTo(xc, y0 + GT); ctx.lineTo(xc, y0 + GT + pH); ctx.stroke();
        ctx.fillStyle = '#7a8a96';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(tt.toFixed(0), xc, y0 + GT + pH + 4);
    }

    var data = simSurf.ptData;
    if (data && data.length > 1) {
        ctx.save();
        ctx.beginPath(); ctx.rect(x0 + GL, y0 + GT, pW, pH); ctx.clip();
        ctx.beginPath();
        var started = false;
        for (var i = 0; i < data.length; i++) {
            var d = data[i];
            if (d.t < tMin - 1) continue;
            var cx = px(d.t), cy2 = py(d.y);
            if (!started) { ctx.moveTo(cx, cy2); started = true; }
            else ctx.lineTo(cx, cy2);
        }
        ctx.strokeStyle = '#e07020';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }

    ctx.strokeStyle = '#c8c0b4';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + GL, y0 + GT, pW, pH);

    ctx.fillStyle = '#5a6a78';
    ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Temps (s)', x0 + GL + pW / 2, y0 + H - 2);

    ctx.save();
    ctx.translate(x0 + 12, y0 + GT + pH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Hauteur', 0, 0);
    ctx.restore();
}

// Nombre de points d'échantillonnage pour les graphes Amplitude(x)/Amplitude(y) : au moins 1
// point par pixel du graphe, mais aussi assez pour résoudre les franges d'interférence elles-mêmes
// (SURF_GRAPH_SAMPLES_PER_LAMBDA points par λ) — celles-ci peuvent varier sur une échelle bien
// plus fine que λ près des sources ou pour un grand écartement b, un sous-échantillonnage y crée
// un crénelage/moiré qui n'a rien à voir avec la vraie figure d'interférence.
var SURF_GRAPH_SAMPLES_PER_LAMBDA = 8;
var SURF_GRAPH_SAMPLES_MAX = 6000;
function _surfGraphSampleCount(rangePx, lambda_px, pW) {
    var byPixel = Math.round(pW);
    var byFringe = (lambda_px > 0)
        ? Math.ceil(rangePx * SURF_GRAPH_SAMPLES_PER_LAMBDA / lambda_px)
        : byPixel;
    return Math.max(40, Math.min(SURF_GRAPH_SAMPLES_MAX, Math.max(byPixel, byFringe)));
}

function _drawSurfAmpY(ctx, x0, y0, W, H) {
    var s = simSurf;
    if (s.pxPerCm <= 0 || !s.canvasH) return;

    var halfRangeCm = (s.canvasH / 2) / s.pxPerCm;
    var xMin = -halfRangeCm, xMax = halfRangeCm;

    var GL = 78, GR = 12, GT = 14, GB = 34;
    var pW = W - GL - GR, pH = H - GT - GB;
    if (pW < 20 || pH < 20) return;

    var N = _surfGraphSampleCount(s.canvasH, s.lambda * s.pxPerCm, pW);
    var yCms = [], amps = [];
    var maxAmp = 0;
    for (var i = 0; i <= N; i++) {
        var py_screen = i / N * s.canvasH;
        yCms.push((py_screen - s.originY) / s.pxPerCm);
        var amp = _surfFieldEnvelope(s.cut.x, py_screen, s.simTime);
        amps.push(amp);
        if (amp > maxAmp) maxAmp = amp;
    }

    var yMin = 0, yMax = Math.max(1.25, maxAmp * 1.08);

    function px(v) { return x0 + GL + (v - xMin) / (xMax - xMin) * pW; }
    function py(v) { return y0 + GT + (1 - (v - yMin) / (yMax - yMin)) * pH; }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x0 + GL, y0 + GT, pW, pH);

    ctx.strokeStyle = 'rgba(200,192,180,0.55)';
    ctx.lineWidth = 0.8;
    ctx.fillStyle = '#7a8a96';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    var yStep = _niceAxisStep(yMax - yMin, 5);
    var yStart = Math.ceil(yMin / yStep) * yStep;
    for (var vy = yStart; vy <= yMax + yStep * 0.01; vy += yStep) {
        var vyr = Math.round(vy / yStep) * yStep;
        var yc = py(vyr);
        ctx.beginPath(); ctx.moveTo(x0 + GL, yc); ctx.lineTo(x0 + GL + pW, yc); ctx.stroke();
        ctx.fillText(vyr.toFixed(2).replace('.', ','), x0 + GL - 8, yc);
    }
    ctx.strokeStyle = '#b0a898';
    ctx.lineWidth = 1;
    var y0line = py(0);
    ctx.beginPath(); ctx.moveTo(x0 + GL, y0line); ctx.lineTo(x0 + GL + pW, y0line); ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var xStep = _niceAxisStep(xMax - xMin);
    var xStart = Math.ceil(xMin / xStep) * xStep;
    for (var xx = xStart; xx <= xMax; xx += xStep) {
        var xc = px(xx);
        ctx.strokeStyle = 'rgba(200,192,180,0.4)';
        ctx.beginPath(); ctx.moveTo(xc, y0 + GT); ctx.lineTo(xc, y0 + GT + pH); ctx.stroke();
        ctx.fillStyle = '#7a8a96';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(Math.round(xx), xc, y0 + GT + pH + 4);
    }

    ctx.save();
    ctx.beginPath(); ctx.rect(x0 + GL, y0 + GT, pW, pH); ctx.clip();
    ctx.beginPath();
    for (var j = 0; j <= N; j++) {
        var cx = px(yCms[j]), cy2 = py(amps[j]);
        if (j === 0) ctx.moveTo(cx, cy2);
        else ctx.lineTo(cx, cy2);
    }
    ctx.strokeStyle = SURF_COL_CUT;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = '#c8c0b4';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + GL, y0 + GT, pW, pH);

    ctx.fillStyle = '#5a6a78';
    ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('y (cm)', x0 + GL + pW / 2, y0 + H - 2);

    ctx.save();
    ctx.translate(x0 + 12, y0 + GT + pH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Amplitude', 0, 0);
    ctx.restore();
}

function _drawSurfAmpX(ctx, x0, y0, W, H) {
    var s = simSurf;
    if (s.pxPerCm <= 0 || !s.canvasW) return;

    var halfRangeCm = (s.canvasW / 2) / s.pxPerCm;
    var xMin = -halfRangeCm, xMax = halfRangeCm;

    var GL = 78, GR = 12, GT = 14, GB = 34;
    var pW = W - GL - GR, pH = H - GT - GB;
    if (pW < 20 || pH < 20) return;

    var N = _surfGraphSampleCount(s.canvasW, s.lambda * s.pxPerCm, pW);
    var xCms = [], amps = [];
    var maxAmp = 0;
    for (var i = 0; i <= N; i++) {
        var px_screen = i / N * s.canvasW;
        xCms.push((px_screen - s.canvasW / 2) / s.pxPerCm); // 0 = centre horizontal (milieu S1S2)
        var amp = _surfFieldEnvelope(px_screen, s.cutH.y, s.simTime);
        amps.push(amp);
        if (amp > maxAmp) maxAmp = amp;
    }

    var yMin = 0, yMax = Math.max(1.25, maxAmp * 1.08);

    function px(v) { return x0 + GL + (v - xMin) / (xMax - xMin) * pW; }
    function py(v) { return y0 + GT + (1 - (v - yMin) / (yMax - yMin)) * pH; }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x0 + GL, y0 + GT, pW, pH);

    ctx.strokeStyle = 'rgba(200,192,180,0.55)';
    ctx.lineWidth = 0.8;
    ctx.fillStyle = '#7a8a96';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    var yStep = _niceAxisStep(yMax - yMin, 5);
    var yStart = Math.ceil(yMin / yStep) * yStep;
    for (var vy = yStart; vy <= yMax + yStep * 0.01; vy += yStep) {
        var vyr = Math.round(vy / yStep) * yStep;
        var yc = py(vyr);
        ctx.beginPath(); ctx.moveTo(x0 + GL, yc); ctx.lineTo(x0 + GL + pW, yc); ctx.stroke();
        ctx.fillText(vyr.toFixed(2).replace('.', ','), x0 + GL - 8, yc);
    }
    ctx.strokeStyle = '#b0a898';
    ctx.lineWidth = 1;
    var y0line = py(0);
    ctx.beginPath(); ctx.moveTo(x0 + GL, y0line); ctx.lineTo(x0 + GL + pW, y0line); ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var xStep = _niceAxisStep(xMax - xMin);
    var xStart = Math.ceil(xMin / xStep) * xStep;
    for (var xx = xStart; xx <= xMax; xx += xStep) {
        var xc = px(xx);
        ctx.strokeStyle = 'rgba(200,192,180,0.4)';
        ctx.beginPath(); ctx.moveTo(xc, y0 + GT); ctx.lineTo(xc, y0 + GT + pH); ctx.stroke();
        ctx.fillStyle = '#7a8a96';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(Math.round(xx), xc, y0 + GT + pH + 4);
    }

    ctx.save();
    ctx.beginPath(); ctx.rect(x0 + GL, y0 + GT, pW, pH); ctx.clip();
    ctx.beginPath();
    for (var j = 0; j <= N; j++) {
        var cx = px(xCms[j]), cy2 = py(amps[j]);
        if (j === 0) ctx.moveTo(cx, cy2);
        else ctx.lineTo(cx, cy2);
    }
    ctx.strokeStyle = SURF_COL_CUT_H;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = '#c8c0b4';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + GL, y0 + GT, pW, pH);

    ctx.fillStyle = '#5a6a78';
    ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('x (cm)', x0 + GL + pW / 2, y0 + H - 2);

    ctx.save();
    ctx.translate(x0 + 12, y0 + GT + pH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Amplitude', 0, 0);
    ctx.restore();
}

function _niceAxisStep(range, targetTicks) {
    var rough = range / (targetTicks || 6);
    var mag  = Math.pow(10, Math.floor(Math.log10(rough)));
    var mant = rough / mag;
    if (mant < 1.5) return mag;
    if (mant < 3.5) return 2 * mag;
    if (mant < 7.5) return 5 * mag;
    return 10 * mag;
}

// ── Barre de contrôle des graphes (1/2 graphes + sélecteurs) ──────────────

function _buildSurfGraphCtrl() {
    var ctrl = document.getElementById('surf-graph-ctrl');
    var sep  = document.getElementById('surf-graph-dual-sep');
    if (!ctrl) return;
    ctrl.innerHTML = '';
    var s = simSurf;

    if (s.graphMode === 'single') {
        ctrl.style.cssText = '';
        if (sep) sep.style.display = 'none';
        ctrl.appendChild(_surfMakeDualBtn());
        ctrl.appendChild(_surfMakeSelect('sel-surf-tab1', s.graphTab1, function(key) {
            s.graphTab1 = key;
            _buildSurfGraphCtrl();
        }));
        ctrl.appendChild(_surfMakeTitle(s.graphTab1));
    } else {
        ctrl.style.cssText = 'display:flex;align-items:stretch;padding:0;gap:0';
        if (sep) sep.style.display = 'block';

        var leftHalf = document.createElement('div');
        leftHalf.style.cssText = 'flex:1;display:flex;align-items:center;gap:6px;' +
            'padding:3px 8px;min-width:0;overflow-x:auto';
        leftHalf.appendChild(_surfMakeDualBtn());
        leftHalf.appendChild(_surfMakeSelect('sel-surf-tab1', s.graphTab1, function(key) {
            s.graphTab1 = key;
            _buildSurfGraphCtrl();
        }));
        leftHalf.appendChild(_surfMakeTitle(s.graphTab1));
        ctrl.appendChild(leftHalf);

        var rightHalf = document.createElement('div');
        rightHalf.style.cssText = 'flex:1;display:flex;align-items:center;gap:6px;' +
            'padding:3px 8px;min-width:0;overflow-x:auto';
        rightHalf.appendChild(_surfMakeSelect('sel-surf-tab2', s.graphTab2, function(key) {
            s.graphTab2 = key;
            _buildSurfGraphCtrl();
        }));
        rightHalf.appendChild(_surfMakeTitle(s.graphTab2));
        ctrl.appendChild(rightHalf);
    }
}

function _surfMakeDualBtn() {
    var btn = document.createElement('button');
    btn.className = 'graph-mode-btn' + (simSurf.graphMode === 'dual' ? ' active' : '');
    btn.textContent = simSurf.graphMode === 'dual' ? '2 graphes' : '1 graphe';
    btn.style.cssText = 'flex-shrink:0';
    btn.onclick = function () { toggleSurfDualGraph(); };
    return btn;
}

function _surfMakeTitle(activeKey) {
    var info = SURF_GRAPH_TABS.find(function(t) { return t.key === activeKey; });
    var span = document.createElement('span');
    span.className = 'graph-title';
    span.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    span.textContent = info ? info.title : '';
    span.title = info ? info.title : '';
    return span;
}

function _surfMakeSelect(id, activeKey, onChange) {
    var sel = document.createElement('select');
    sel.id = id;
    sel.className = 'graph-select';
    SURF_GRAPH_TABS.forEach(function(tab) {
        var opt = document.createElement('option');
        opt.value = tab.key;
        opt.textContent = tab.label;
        if (tab.key === activeKey) opt.selected = true;
        sel.appendChild(opt);
    });
    sel.onchange = function() { onChange(sel.value); };
    return sel;
}

function toggleSurfDualGraph() {
    simSurf.graphMode = (simSurf.graphMode === 'dual') ? 'single' : 'dual';
    _buildSurfGraphCtrl();
}

// ══════════════════════════════════════════════════════════════════════
//  Interactions — glisser le point M dans le bassin
// ══════════════════════════════════════════════════════════════════════

function _surfPointerPos(canvas, evt) {
    var rect = canvas.getBoundingClientRect();
    var cx = (evt.touches ? evt.touches[0].clientX : evt.clientX) - rect.left;
    var cy = (evt.touches ? evt.touches[0].clientY : evt.clientY) - rect.top;
    return { x: cx, y: cy };
}

function initSurfDrag() {
    var canvas = document.getElementById('surf-canvas');
    if (!canvas) return;

    function down(evt) {
        var pos = _surfPointerPos(canvas, evt);

        // Vue plongeante : les 2 plans de coupe ET le point M restent draggables.
        // - Plan vertical (cut.x) : insensible à l'inclinaison (perpendiculaire à l'axe de
        //   rotation S1S2) → hit-test identique à la vue de dessus.
        // - Plan horizontal (cutH.y) : hit-test sur toute la bande visible, cf.
        //   _surfCutHScreenY/SURF_3D_PLANE_HALF_H.
        // - Point M : sa position écran suit la vague (cf. _surf3DProjectPoint) → hit-test sur sa
        //   position PROJETÉE, pas sur (p.x,p.y) bruts.
        if (simSurf.viewMode !== 'top') {
            var theta0 = simSurf.tiltDeg * Math.PI / 180;
            var p0 = simSurf.point;
            var pProj = _surf3DProjectPoint(p0.x, p0.y, theta0);
            if (Math.hypot(pos.x - pProj.x, pos.y - pProj.y) <= 18) {
                simSurf.dragging = true;
                canvas.style.cursor = 'grabbing';
                evt.preventDefault();
                return;
            }
            if (simSurf.showGraph && _surfAmpYActive() &&
                Math.abs(pos.x - simSurf.cut.x) <= 10) {
                simSurf.cut.dragging = true;
                canvas.style.cursor = 'ew-resize';
                evt.preventDefault();
                return;
            }
            if (simSurf.showGraph && _surfAmpXActive()) {
                // Zone de drag = toute la largeur de la bande VISIBLE du plan (± sa demi-hauteur
                // à l'écran), pas seulement sa ligne centrale à ±10px — sinon cliquer n'importe
                // où dans le plan bien visible ne faisait rien, ce qui le rendait de facto non
                // draggable (retour utilisateur).
                var hHitHalf = Math.max(10, SURF_3D_PLANE_HALF_H * Math.sin(theta0));
                if (Math.abs(pos.y - _surfCutHScreenY()) <= hHitHalf) {
                    simSurf.cutH.dragging = true;
                    canvas.style.cursor = 'ns-resize';
                    evt.preventDefault();
                }
            }
            return;
        }

        var p = simSurf.point;
        var d = Math.hypot(pos.x - p.x, pos.y - p.y);
        if (d <= 18) {
            simSurf.dragging = true;
            canvas.style.cursor = 'grabbing';
            evt.preventDefault();
            return;
        }
        if (simSurf.showGraph && _surfAmpYActive() &&
            Math.abs(pos.x - simSurf.cut.x) <= 10) {
            simSurf.cut.dragging = true;
            canvas.style.cursor = 'ew-resize';
            evt.preventDefault();
            return;
        }
        if (simSurf.showGraph && _surfAmpXActive() &&
            Math.abs(pos.y - simSurf.cutH.y) <= 10) {
            simSurf.cutH.dragging = true;
            canvas.style.cursor = 'ns-resize';
            evt.preventDefault();
        }
    }
    function move(evt) {
        if (simSurf.cut.dragging) {
            var posC = _surfPointerPos(canvas, evt);
            var c = simSurf.cut;
            c.x = Math.max(0, Math.min(simSurf.canvasW, posC.x));
            c.cmX = (c.x - simSurf.canvasW / 2) / simSurf.pxPerCm; // offset depuis le centre, cf. updateSurfGeometry
            evt.preventDefault();
            return;
        }
        if (simSurf.cutH.dragging) {
            var posH = _surfPointerPos(canvas, evt);
            var ch = simSurf.cutH;
            // En vue plongeante, la position écran cliquée correspond au plan (référence "eau au
            // repos", cf. _surfCutHScreenY) et doit être réinvertie pour retrouver la coordonnée y
            // du bassin — en vue de dessus, écran et bassin coïncident (identité).
            var newY = (simSurf.viewMode !== 'top') ? _surfCutHInvert(posH.y) : posH.y;
            ch.y = Math.max(0, Math.min(simSurf.canvasH, newY));
            ch.cmY = (ch.y - simSurf.canvasH / 2) / simSurf.pxPerCm;
            evt.preventDefault();
            return;
        }
        if (!simSurf.dragging) return;
        var pos = _surfPointerPos(canvas, evt);
        var p = simSurf.point;
        if (simSurf.viewMode !== 'top') {
            // x est insensible à l'inclinaison (identité) ; y s'obtient par point fixe puisque la
            // hauteur de vague (qui décale l'écran) dépend elle-même de y, cf. _surf3DInvertY.
            var theta1 = simSurf.tiltDeg * Math.PI / 180;
            p.x = Math.max(0, Math.min(simSurf.canvasW, pos.x));
            p.y = _surf3DInvertY(p.x, pos.y, theta1, p.y);
            p.cmX = (p.x - simSurf.canvasW / 2) / simSurf.pxPerCm;
            p.cmY = (p.y - simSurf.canvasH / 2) / simSurf.pxPerCm;
            evt.preventDefault();
            return;
        }
        p.x = Math.max(0, Math.min(simSurf.canvasW, pos.x));
        p.y = Math.max(0, Math.min(simSurf.canvasH, pos.y));
        p.cmX = (p.x - simSurf.canvasW / 2) / simSurf.pxPerCm;
        p.cmY = (p.y - simSurf.canvasH / 2) / simSurf.pxPerCm;
        evt.preventDefault();
    }
    function up() {
        if (simSurf.cut.dragging) {
            simSurf.cut.dragging = false;
            canvas.style.cursor = 'grab';
        }
        if (simSurf.cutH.dragging) {
            simSurf.cutH.dragging = false;
            canvas.style.cursor = 'grab';
        }
        if (!simSurf.dragging) return;
        simSurf.dragging = false;
        canvas.style.cursor = 'grab';
    }

    canvas.addEventListener('mousedown', down);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    canvas.addEventListener('touchstart', down, { passive: false });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
}

// ══════════════════════════════════════════════════════════════════════
//  Zoom — réglé en largeur de vue (cm), du plus large (SURF_VIEW_MAX_CM, slider à gauche) au
//  plus serré (SURF_VIEW_MIN_CM, slider à droite) : le slider va donc dans le SENS NATUREL,
//  contrairement à l'ancien réglage à 3 crans dont le cran ×1 était le dézoom maximal.
//  Progression géométrique (cf. SURF_ZOOM_STEPS) pour des pas perceptivement uniformes.
//  Même dispositif que diffraction/js/surfaces.js.
//
//  N'affecte QUE pxPerCm : ni λ, ni b, ni la physique. Le rebuild de la grille reste bon marché
//  (2 sources ponctuelles seulement, cf. _scheduleSurfRebuild) — un rebuild par frame de
//  glissement passe sans peine, pas besoin de grille d'aperçu comme en diffraction.
// ══════════════════════════════════════════════════════════════════════

// Position de slider (0…SURF_ZOOM_STEPS) ↔ largeur de vue (cm), en progression géométrique.
function _surfViewFromSlider(pos) {
    var f = Math.max(0, Math.min(1, pos / SURF_ZOOM_STEPS));
    return SURF_VIEW_MAX_CM * Math.pow(SURF_VIEW_MIN_CM / SURF_VIEW_MAX_CM, f);
}

function _surfSliderFromView(cm) {
    var f = Math.log(SURF_VIEW_MAX_CM / cm) / Math.log(SURF_VIEW_MAX_CM / SURF_VIEW_MIN_CM);
    return Math.round(Math.max(0, Math.min(1, f)) * SURF_ZOOM_STEPS);
}

function _surfApplyZoom() {
    var s = simSurf;
    if (s.canvasW < 10) return;
    s.pxPerCm = s.canvasW / s.viewCm;
    updateSurfGeometry();
}

// Point d'entrée unique du zoom (slider, molette, reset) — `syncSlider` remet le curseur en
// place quand le changement ne vient pas de lui.
function _surfSetViewCm(cm, syncSlider) {
    var s = simSurf;
    s.viewCm = Math.max(SURF_VIEW_MIN_CM, Math.min(SURF_VIEW_MAX_CM, cm));

    // Affiché comme un facteur de zoom classique — ×1 = vue par défaut, plus grand = plus zoomé
    // (cf. bornes SURF_VIEW_*). La largeur de vue en cm, elle, se lit sur la barre d'échelle
    // dessinée dans le bassin (cf. _drawSurfScaleBar).
    var lbl = document.getElementById('lbl-zoom-surf');
    if (lbl) lbl.textContent = (SURF_VIEW_DEFAULT_CM / s.viewCm).toFixed(1).replace('.', ',');
    if (syncSlider) {
        var sl = document.getElementById('sl-zoom-surf');
        if (sl) sl.value = _surfSliderFromView(s.viewCm);
    }
    _surfApplyZoom();
}

function onSliderZoomSurf(v) {
    _surfSetViewCm(_surfViewFromSlider(parseInt(v, 10)), false);
}

// ── Molette sur le bassin ────────────────────────────────────────────
// Variation MULTIPLICATIVE de la largeur de vue, comme le slider : un cran de molette change la
// vue du même pourcentage où qu'on soit dans la plage. Ancrée sur le CENTRE du bassin (milieu de
// S1S2), qui est aussi le point que updateSurfGeometry garde immobile à l'écran à tout cadrage :
// la figure d'interférences étant symétrique autour de ce centre, tout reste bien cadré à tout
// zoom — d'où l'absence de panoramique à prévoir.
function initSurfWheelZoom() {
    var canvas = document.getElementById('surf-canvas');
    if (!canvas) return;
    canvas.addEventListener('wheel', function (evt) {
        // deltaMode : 0 = pixels, 1 = lignes, 2 = pages — normalisé en « pixels » approximatifs.
        var d = evt.deltaY;
        if (evt.deltaMode === 1) d *= 16;
        else if (evt.deltaMode === 2) d *= 400;
        if (!d) return;
        evt.preventDefault(); // sinon la page défile sous le curseur pendant qu'on zoome
        _surfSetViewCm(simSurf.viewCm * Math.exp(d * SURF_WHEEL_SENS), true);
    }, { passive: false });
}

// ══════════════════════════════════════════════════════════════════════
//  Splitter draggable (entre le bassin et le graphe)
// ══════════════════════════════════════════════════════════════════════

(function initSurfSplitter() {
    var splitter = document.getElementById('surf-splitter');
    var sceneEl  = document.getElementById('surf-scene-area');
    var graphEl  = document.getElementById('surf-graph-area');
    var col      = document.getElementById('surfaces-area');
    if (!splitter || !sceneEl || !graphEl || !col) return;
    var minH = 80;
    var dragging = false, startY = 0, startSceneH = 0, ratio = null;

    function applyDims(newSceneH, avail) {
        sceneEl.style.flex = 'none';
        sceneEl.style.height = newSceneH + 'px';
        graphEl.style.flex = 'none';
        graphEl.style.height = (avail - newSceneH) + 'px';
        resize();
    }

    splitter.addEventListener('mousedown', function (e) {
        dragging = true;
        startY = e.clientY;
        startSceneH = sceneEl.getBoundingClientRect().height;
        splitter.classList.add('dragging');
        document.body.style.cursor = 'row-resize';
        e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        var dy = e.clientY - startY;
        var colH = col.getBoundingClientRect().height;
        var splH = splitter.getBoundingClientRect().height;
        var avail = colH - splH;
        var newSceneH = Math.max(minH, Math.min(avail - minH, startSceneH + dy));
        ratio = newSceneH / avail;
        applyDims(newSceneH, avail);
    });
    document.addEventListener('mouseup', function () {
        if (!dragging) return;
        dragging = false;
        splitter.classList.remove('dragging');
        document.body.style.cursor = '';
    });
    window.addEventListener('resize', function () {
        if (ratio === null || graphEl.style.display === 'none') return;
        var colH = col.getBoundingClientRect().height;
        var splH = splitter.getBoundingClientRect().height;
        var avail = colH - splH;
        var newSceneH = Math.max(minH, Math.min(avail - minH, Math.round(ratio * avail)));
        applyDims(newSceneH, avail);
    });
})();

// ══════════════════════════════════════════════════════════════════════
//  Handlers UI (sliders, boutons) — appelés depuis interferences/index.html
// ══════════════════════════════════════════════════════════════════════

function togglePauseSurfaces() {
    simSurf.paused = !simSurf.paused;
    var btn = document.getElementById('btn-playpause-surf');
    if (!btn) return;
    if (simSurf.paused) { btn.textContent = '▶ Reprendre'; btn.className = 'btn btn-play'; }
    else                { btn.textContent = '⏸ Pause';     btn.className = 'btn btn-pause'; }
}

var SURF_SPEED_STEPS = [0.10, 0.25, 0.50, 1.00];

function onSliderSpeedSurf(v) {
    var idx = parseInt(v, 10);
    simSurf.speedFactor = SURF_SPEED_STEPS[idx];
    var lbl = document.getElementById('lbl-speed-surf');
    if (lbl) lbl.textContent = simSurf.speedFactor.toFixed(2).replace('.', ',');
}

// ── Vue plongeante (rotation 3D autour de S1S2) ───────────────────────
// Bascule simple (pas de transition animée, contrairement à ondes/js/vagues.js →
// toggleViewVagues) : le slider d'angle fournit déjà le contrôle continu demandé.

function setSurfViewMode(mode) {
    var s = simSurf;
    s.viewMode = mode;
    var isPlongeante = (mode === 'plongeante');

    var btnTop = document.getElementById('btn-surf-view-top');
    var btnPlongeante = document.getElementById('btn-surf-view-plongeante');
    if (btnTop) btnTop.classList.toggle('active', !isPlongeante);
    if (btnPlongeante) btnPlongeante.classList.toggle('active', isPlongeante);

    var slider = document.getElementById('surf-tilt-slider');
    if (slider) slider.classList.toggle('visible', isPlongeante);

    // Le drag de M/des axes de coupe reprend automatiquement en repassant en vue de dessus
    // (cf. initSurfDrag → down(), gaté sur viewMode) ; rien d'autre à réinitialiser ici.
}

function onSliderTiltSurf(v) {
    simSurf.tiltDeg = parseFloat(v);
    var lbl = document.getElementById('lbl-tilt-surf');
    if (lbl) lbl.textContent = simSurf.tiltDeg.toFixed(0);
}

function onSliderLambdaSurf(v) {
    simSurf.lambda = parseFloat(v);
    var lbl = document.getElementById('lbl-lambda-surf');
    if (lbl) lbl.textContent = simSurf.lambda.toFixed(1).replace('.', ',');
    updateSurfGeometry();
}

function onSliderBSurf(v) {
    simSurf.b = parseFloat(v);
    var lbl = document.getElementById('lbl-b-surf');
    if (lbl) lbl.textContent = simSurf.b.toFixed(1).replace('.', ',');
    updateSurfGeometry();
}

function syncSurfGraphUI() {
    var visible = simSurf.showGraph;
    var splitter = document.getElementById('surf-splitter');
    var graphEl  = document.getElementById('surf-graph-area');
    var sceneEl  = document.getElementById('surf-scene-area');
    if (!splitter || !graphEl || !sceneEl) return;
    splitter.style.display = visible ? '' : 'none';
    graphEl.style.display  = visible ? 'flex' : 'none';
    sceneEl.style.flex   = visible ? '' : '1';
    sceneEl.style.height = '';
    graphEl.style.flex   = '';
    graphEl.style.height = '';
    var btn = document.getElementById('btn-graph-surf');
    if (btn) btn.classList.toggle('active', visible);
    if (visible) {
        simSurf.ptTimeOrigin = simSurf.simTime;
        simSurf.ptData = [];
        _buildSurfGraphCtrl();
    }
    resize();
}

function toggleGraphSurf() {
    simSurf.showGraph = !simSurf.showGraph;
    syncSurfGraphUI();
}

// ── Sources actives/coupées (cases à cocher) ──────────────────────────
// Historise la bascule (cf. simSurf.s1Toggles/s2Toggles et _surfSourceContrib) plutôt que de
// simplement lire l'état courant au rendu : une source coupée ne doit pas effacer d'un coup les
// ondes déjà émises (causalité — cf. commentaire de simSurf).
function toggleSurfSource(n, checked) {
    var s = simSurf;
    var enabledKey = 's' + n + 'Enabled';
    var togglesKey = 's' + n + 'Toggles';
    if (s[enabledKey] === checked) return;
    s[enabledKey] = checked;
    s[togglesKey].push({ t: s.simTime, enabled: checked });
}

// ── Zones d'interférences (bouton 4 états) ────────────────────────────

var SURF_INTERF_MODES = ['none', 'constructive', 'destructive', 'both'];
var SURF_INTERF_LABELS = {
    none: 'Non',
    constructive: 'Constructives',
    destructive: 'Destructives',
    both: 'Constructives et destructives'
};

function toggleSurfInterfMode() {
    var idx = SURF_INTERF_MODES.indexOf(simSurf.interfMode);
    simSurf.interfMode = SURF_INTERF_MODES[(idx + 1) % SURF_INTERF_MODES.length];
    _syncSurfInterfBtn();
}

function _syncSurfInterfBtn() {
    var btn = document.getElementById('btn-interf-surf');
    if (!btn) return;
    btn.innerHTML = 'Afficher les zones d\'interférences :<br>' + SURF_INTERF_LABELS[simSurf.interfMode];
    btn.classList.toggle('active', simSurf.interfMode !== 'none');
}

// ── Distances depuis les sources (bouton 3 états) ─────────────────────

var SURF_DIST_MODES  = ['none', 'cm', 'lambda'];
var SURF_DIST_LABELS = {
    none   : 'Non',
    cm     : 'En centimètres',
    lambda : 'En longueurs d\'onde'
};

function toggleSurfDistMode() {
    var idx = SURF_DIST_MODES.indexOf(simSurf.distMode);
    simSurf.distMode = SURF_DIST_MODES[(idx + 1) % SURF_DIST_MODES.length];
    _syncSurfDistBtn();
    _updateSurfValues();
}

function _syncSurfDistBtn() {
    var btn = document.getElementById('btn-dist-surf');
    if (!btn) return;
    btn.innerHTML = 'Distance depuis les sources :<br>' + SURF_DIST_LABELS[simSurf.distMode];
    btn.classList.toggle('active', simSurf.distMode !== 'none');
}

// ── Section "Valeurs" (S₁M, S₂M, δ) ────────────────────────────────────

function toggleSurfValeurs() {
    simSurf.showValeurs = !simSurf.showValeurs;
    var btn = document.getElementById('btn-toggle-valeurs-surf');
    var box = document.getElementById('readouts-surf');
    if (btn) btn.classList.toggle('active', simSurf.showValeurs);
    if (box) box.style.display = simSurf.showValeurs ? '' : 'none';
    if (simSurf.showValeurs) _updateSurfValues();
}

function resetSurfaces() {
    simSurf.paused  = false;
    simSurf.simTime = 0;
    simSurf.lambda  = 4;
    simSurf.b       = 8;
    simSurf.viewCm  = SURF_VIEW_DEFAULT_CM;
    simSurf.ptData  = [];
    simSurf.graphMode = 'single';
    simSurf.graphTab1 = 'amp-t';
    simSurf.graphTab2 = 'amp-y';
    simSurf.interfMode = 'none';
    simSurf.distMode = 'none';
    simSurf.showValeurs = false;
    simSurf.viewMode = 'top';
    simSurf.tiltDeg  = SURF_TILT_DEFAULT;
    simSurf.s1Enabled = true;
    simSurf.s2Enabled = true;
    simSurf.s1Toggles = [];
    simSurf.s2Toggles = [];
    _surfLastFrameT = null;

    var chkS1 = document.getElementById('chk-surf-s1');
    var chkS2 = document.getElementById('chk-surf-s2');
    if (chkS1) chkS1.checked = true;
    if (chkS2) chkS2.checked = true;

    var btnViewTop = document.getElementById('btn-surf-view-top');
    var btnViewPlongeante = document.getElementById('btn-surf-view-plongeante');
    if (btnViewTop) btnViewTop.classList.add('active');
    if (btnViewPlongeante) btnViewPlongeante.classList.remove('active');
    var tiltSlider = document.getElementById('surf-tilt-slider');
    if (tiltSlider) tiltSlider.classList.remove('visible');
    var slTilt = document.getElementById('sl-tilt-surf');
    if (slTilt) slTilt.value = SURF_TILT_DEFAULT;
    var lblTilt = document.getElementById('lbl-tilt-surf');
    if (lblTilt) lblTilt.textContent = SURF_TILT_DEFAULT.toFixed(0);

    var slLambda = document.getElementById('sl-lambda-surf');
    var slB      = document.getElementById('sl-b-surf');
    if (slLambda) slLambda.value = simSurf.lambda;
    if (slB)      slB.value = simSurf.b;
    var lblLambda = document.getElementById('lbl-lambda-surf');
    var lblB      = document.getElementById('lbl-b-surf');
    if (lblLambda) lblLambda.textContent = simSurf.lambda.toFixed(1).replace('.', ',');
    if (lblB)      lblB.textContent = simSurf.b.toFixed(1).replace('.', ',');

    var btnPlay = document.getElementById('btn-playpause-surf');
    if (btnPlay) { btnPlay.textContent = '⏸ Pause'; btnPlay.className = 'btn btn-pause'; }

    simSurf.showGraph = false;
    syncSurfGraphUI();

    _syncSurfInterfBtn();
    _syncSurfDistBtn();
    var btnValeurs = document.getElementById('btn-toggle-valeurs-surf');
    var boxValeurs = document.getElementById('readouts-surf');
    if (btnValeurs) btnValeurs.classList.remove('active');
    if (boxValeurs) boxValeurs.style.display = 'none';

    // Remet le cadrage au défaut, met à jour slider + libellé, recalcule pxPerCm et la géométrie,
    // et programme le rebuild de la grille (cf. _surfSetViewCm → _surfApplyZoom).
    _surfSetViewCm(SURF_VIEW_DEFAULT_CM, true);
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation — appelée depuis ui.js → init()
// ══════════════════════════════════════════════════════════════════════

function initSurfaces() {
    initSurfDrag();
    initSurfWheelZoom();
    // Le slider part de la position correspondant à la vue par défaut (pas de sa borne gauche,
    // qui est le dézoom maximal) et le libellé affiche le facteur ×1 correspondant.
    _surfSetViewCm(SURF_VIEW_DEFAULT_CM, true);
    _syncSurfInterfBtn();
    _syncSurfDistBtn();
    syncSurfGraphUI();
}
