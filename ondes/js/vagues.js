// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  vagues.js — Simulation d'ondes de surface (vue de dessus)
//  Dépend de : sim.js (T_IMPULSE, DP_MAX_POINTS), tube.js (tubeCanvas)
//              graph.js (_updateFontSizes, _calcLeftMarginRaw, etc.)
//  Chargé après graph.js, avant ui.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Constantes ────────────────────────────────────────────────────────
var BLOCK_V               = 2;     // taille des blocs de rendu (px) — 2 pour meilleure résolution
var VAGUES_AMP_GAIN       = 1.0;   // gain visuel appliqué au champ calculé (aligné sur surfaces.js — pas de sur-contraste)
var VAGUES_VIS_AMP_SCALE  = 5/6;   // réduit l'amplitude visuelle animation (3→équivalent 2.5)
var C_BASE_VAGUES         = 150;   // px/s par m/s — recalibré au resize
var COUPE_LEFT_MARGIN     = 70;    // px réservés à gauche en vue coupe — recalculé
                                   // au resize par _syncCoupeLeftMargin
var COUPE_LEFT_MARGIN_MIN = 70;    // plancher : la place de la source seule
var COUPE_LEFT_BOX_GAP    = 10;    // jeu entre la colonne source et ce qui est dessiné
var COUPE_LEFT_MAX_FRAC   = 0.38;  // part maximale de la largeur concédée à la bande

// Flèche d'oscillation de la source, dessinée à GAUCHE de celle-ci : posée à
// −COUPE_SRC_ARROW_DX, pointe large de ±COUPE_SRC_ARROW_HALF. Son bord gauche
// est donc à srcX − (DX + HALF), et c'est cette avancée-là — et non la seule
// position de la source — que la bande de gauche doit dégager, sans quoi la
// flèche passe sous la colonne source. Les deux sites de dessin (coupe et
// transition) lisent ces constantes, pour qu'elles ne puissent pas diverger du
// calcul de marge.
// Crête de sin(u)·(1 − cos u)/2, atteinte en u = 2π/3 : 3√3/8. On divise par
// elle pour que l'impulsion culmine à 1, comme la sinusoïde (cf.
// stepSourceVagues).
var IMPULSE_V_NORM        = 8 / (3 * Math.sqrt(3));

var COUPE_SRC_ARROW_DX    = 22;
var COUPE_SRC_ARROW_HALF  = 4;

// La colonne source (chronomètre, puis box source) est posée en overlay sur le
// canvas, au bord gauche (cf. style.css, .vagues-layout #source-col). En vue du
// dessus elle recouvre de l'onde, c'est assumé ; en vue de coupe on élargit la
// bande de gauche pour que l'onde commence à sa droite.
//
// Le prix à payer est direct : `max_r_coupe = canvasW − COUPE_LEFT_MARGIN` est
// la distance de propagation exploitable, donc élargir la bande RACCOURCIT
// l'onde visible en coupe. D'où le plafond COUPE_LEFT_MAX_FRAC, qui rend la
// main au canvas plutôt qu'à la colonne sur les fenêtres étroites.
//
// La mesure se fait sur #source-col : sa largeur de MISE EN PAGE est fixe, mais
// getBoundingClientRect() rend la largeur PEINTE, donc déjà multipliée par
// --src-s (transform: scale) — c'est bien la place réellement occupée.
function _syncCoupeLeftMargin(w) {
    var need = COUPE_LEFT_MARGIN_MIN;
    var col  = document.getElementById('source-col');
    if (col && col.offsetParent !== null) {
        var cs = getComputedStyle(col);
        var ml = parseFloat(cs.marginLeft)  || 0;
        var mr = parseFloat(cs.marginRight) || 0;
        need = Math.max(need,
                        col.getBoundingClientRect().width + ml + mr +
                        COUPE_SRC_ARROW_DX + COUPE_SRC_ARROW_HALF + COUPE_LEFT_BOX_GAP);
    }
    COUPE_LEFT_MARGIN = Math.round(Math.min(need, w * COUPE_LEFT_MAX_FRAC));
}

// ── Raideur maximale dessinée en vue de profil ────────────────────────
//  La vue en coupe exagère massivement l'échelle verticale devant
//  l'horizontale. Sans garde-fou, à λ = 75 px (réglages par défaut) elle
//  dessine une amplitude de 46 px, soit une houle haute de 0,6 λ — une
//  raideur que même une vague sur le point de déferler n'atteint jamais,
//  et qui rend le tracé des trajectoires de molécules impossible (cf. la
//  borne λ/π dans _drawOrbitesCoupeVagues).
//
//  Au-delà du seuil COUPE_STEEP_FRAC·λ, le déplacement dessiné est donc
//  COMPRIMÉ en loi de puissance — et non plafonné. La nuance est
//  essentielle : un plafond dur (ou une saturation tanh) est ici toujours
//  très en dessous de la course du curseur Amplitude, qui devient alors
//  parfaitement inerte en vue de profil.
//
//  MAIS la compression est calibrée sur l'amplitude MAXIMALE du curseur, et
//  non sur l'amplitude courante : le facteur d'écrasement est le même pour
//  toute la course, si bien que le dessin reste strictement PROPORTIONNEL à
//  l'amplitude (0,5 est bien six fois plus bas que 3,0). Appliquer la loi de
//  puissance à l'amplitude courante — la version précédente — écrasait au
//  contraire les rapports : la course 0,5 → 3,0 ne se lisait plus que comme
//  un facteur 6^EXP ≈ 1,9 à l'écran, et le curseur mentait sur la physique.
//  Seule la crête maximale est bornée, ce qui suffit au garde-fou de
//  raideur : à amplitude 3,0 le tracé est exactement celui que produisait la
//  loi de puissance (à FRAC égal).
//
//  La compression ne mord QUE là où le dessin était invraisemblable,
//  c'est-à-dire aux petites λ : quand même le maximum du curseur tient sous
//  le seuil (grandes λ — f = 1 Hz + h = 10 mm, λ ≈ 410 px), la houle est
//  rendue à l'identité. L'amplitude reste par ailleurs lisible
//  quantitativement sur le graphe y(x), gradué en cm.
//
//  Les deux constantes se règlent indépendamment : FRAC déplace le seuil
//  (donc la platitude générale), EXP dose la crête laissée au maximum du
//  curseur au-delà (1 = aucune compression, 0 = plafond dur).
var COUPE_STEEP_FRAC = 0.16;
var COUPE_STEEP_EXP  = 0.35;

// Amplitude maximale offerte par le curseur Amplitude (cf. #sl-ampl-vagues
// dans index.html) : elle calibre la compression ci-dessus et l'échelle Y fixe
// du graphe y(x). À garder synchronisée avec le max du slider.
var VAGUES_AMPL_MAX = 3.0;

// Amplitude visuelle de la vue de profil, en px pour une enveloppe de 1.
// Point d'entrée UNIQUE : la vue en coupe, la transition 3D et le hit-test
// des balises doivent impérativement partager la même valeur, sinon la
// transition n'arrive plus exactement sur la coupe.
// Ne dépend PAS de simVagues.amplitude (les appelants multiplient par elle) :
// la valeur est stable d'un coup de curseur à l'autre.
function _coupeAmpPx(H) {
    var base = Math.min(H * 0.18, 55) * VAGUES_VIS_AMP_SCALE;
    var lam  = (simVagues.freq > 0) ? simVagues.c_sim / simVagues.freq : 0;
    if (!(lam > 0)) return base;
    var aMax = base * VAGUES_AMPL_MAX;       // crête demandée à fond de course (px)
    var aRef = COUPE_STEEP_FRAC * lam;       // seuil de compression (px)
    if (aMax <= aRef || aMax < 1e-6) return base;   // sous le seuil : identité
    return base * Math.pow(aRef / aMax, 1 - COUPE_STEEP_EXP);
}

// ── Transition vue du dessus ↔ vue en coupe ───────────────────────────
// Durées des deux phases, en secondes. Il n'y a plus de fondu croisé final
// (cf. _drawVaguesTransition) : le rendu 3D arrive exactement sur la vue en
// coupe, si bien que les 2,0 s sont entièrement consacrées au mouvement
// (rotation puis panoramique), là où l'ancienne version en dépensait un
// tiers de sa durée en raccord.
var VAGUES_TRANS_ROT   = 1.10;   // rotation θ : 0 → π/2
var VAGUES_TRANS_SLIDE = 0.90;   // panoramique de la caméra vers la source
var VAGUES_TRANS_TOTAL = VAGUES_TRANS_ROT + VAGUES_TRANS_SLIDE;

function _clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

// Adoucissements : cosinus (départ/arrivée nuls) pour la rotation,
// quadratique in-out pour le panoramique — c'est la courbe qu'utilisait déjà
// l'ancienne transition, conservée telle quelle. (tube.js a un _smoothstep01
// très proche ; pas de mutualisation ici pour ne pas coupler les deux modules
// sur un détail d'animation.)
function _easeCos(t)   { return (1 - Math.cos(_clamp01(t) * Math.PI)) / 2; }
function _easeInOut(t) { t = _clamp01(t); return t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t; }

// Amplitude du panoramique : distance dont la caméra doit glisser pour amener
// la source de sa position en vue du dessus à sa marge en vue coupe.
function _vaguesMaxPan() {
    return simVagues.sourceX - COUPE_LEFT_MARGIN;
}

// Progression de la transition. Point d'entrée UNIQUE, partagé par le canvas
// (_drawVaguesTransition) et par le graphe y(x) (_drawYxGraphVagues) : les
// durées étaient auparavant recopiées en dur des deux côtés, et la moindre
// retouche désynchronisait la vue et son graphe.
function _vaguesTransProgress(tr) {
    var elapsed = tr._pausedAt
        ? (tr._pausedAt - tr.startT) / 1000
        : (performance.now() - tr.startT) / 1000;

    var R = VAGUES_TRANS_ROT, S = VAGUES_TRANS_SLIDE;
    var rotFrac, panFrac;
    if (tr.direction === 'toCoupe') {
        rotFrac = _clamp01(elapsed / R);
        panFrac = _clamp01((elapsed - R) / S);
    } else {                                  // toTop : phases inversées
        panFrac = 1 - _clamp01(elapsed / S);
        rotFrac = 1 - _clamp01((elapsed - S) / R);
    }

    return {
        elapsed : elapsed,
        done    : elapsed >= VAGUES_TRANS_TOTAL,
        theta   : _easeCos(rotFrac) * Math.PI / 2,
        panFrac : _easeInOut(panFrac)
    };
}

// ── Cache de champ (vue du dessus) ───────────────────────────────────────
// Même principe que diffraction/js/surfaces.js (_rebuildSurfFieldCache) : pour une
// source ponctuelle, sin(ωt - k·r) = cos(k·r)·sin(ωt) - sin(k·r)·cos(ωt). Le couple
// (cos(k·r), sin(k·r)) et l'enveloppe d'atténuation ne dépendent que de r (donc de la
// géométrie/fréquence/atténuation, pas du temps) : précalculés une fois par changement de
// réglage sur une grille basse résolution (cf. _rebuildVaguesFieldCache), le rendu par frame
// (drawVagues) n'a plus qu'à combiner ce cache avec 2 scalaires (sin ωt, cos ωt) — ni
// trigonométrie ni racine carrée par cellule et par frame, contrairement à l'ancien calcul
// (Math.sin + Math.sqrt par bloc, à chaque frame, sur la quasi-totalité de la résolution
// physique de l'écran).
var VAGUES_GRID_FACTOR           = 3;   // px CSS par cellule de grille de calcul
var VAGUES_GRID_W_MAX            = 400; // bornes dures (coût du rebuild/dessin ∝ largeur × hauteur)
var VAGUES_GRID_H_MAX            = 300;
var VAGUES_GRID_CELLS_PER_LAMBDA = 6;   // sur-échantillonnage mini pour éviter le repliement à petit λ

// Résolution du cache 1D servant la courbe y(x) : nombre d'échantillons par pixel CSS
// de distance à la source (cf. _rebuildVaguesFieldCache et updateYxDataVagues).
var VAGUES_YX_CACHE_SUB = 4;

// Couleurs de l'onde (crêtes ↔ creux)
var COL_CREST_R = 200, COL_CREST_G = 240, COL_CREST_B = 255; // bleu très clair
var COL_TROUGH_R = 0,  COL_TROUGH_G = 10, COL_TROUGH_B = 55; // bleu nuit
// COL_BG = midpoint crête/creux → pas de cassure au front d'onde
var COL_BG_R = 100,    COL_BG_G = 125,    COL_BG_B = 155;

// ── État global ───────────────────────────────────────────────────────
var simVagues = {

    // ── Contrôle de l'animation ─────────────────────────────────────
    paused      : false,
    simTime     : 0,
    speedFactor : 1.0,

    // ── Source ──────────────────────────────────────────────────────
    sourceX   : 0,   // position canvas (px)
    sourceY   : 0,
    freq      : 1.5, // Hz
    amplitude : 1.0, // relative

    // ── Milieu ──────────────────────────────────────────────────────
    g              : 9.81,  // m/s²
    h              : 0.003, // m (profondeur) — bornes 2mm–10mm
    attenuation    : 0.0,
    geoAttenuation : false, // atténuation en 1/√r (désactivée par défaut)

    // ── Propriétés dérivées ──────────────────────────────────────────
    c_sim : 0,   // px/s
    c_ms  : 0,   // m/s (affiché)

    // ── Historique de la source (cf. _srcPush / _srcDAtS dans sim.js) ─
    //  Même machinerie que le Son et la Corde, à ceci près que la source
    //  Vagues est FIXE et le milieu isotrope : la distance parcourue ne
    //  dépend que de r, un seul historique 1D suffit donc pour tout le plan.
    //  srcD est enregistré normalisé (∈ [−1, 1]) : l'amplitude est appliquée
    //  à la lecture, pour que le curseur agisse aussi sur l'onde déjà émise.
    //  srcS progresse en PIXELS CSS, l'unité de longueur de cet onglet.
    //
    //  C'est lui qui porte désormais l'enveloppe causale : le front n'est plus
    //  c·(t − t_reset) mais la distance couverte par l'historique
    //  (cf. _vaguesFrontR). Conséquence voulue : changer f, g ou h ne réécrit
    //  plus rétroactivement l'onde déjà partie.
    srcD    : null,
    srcS    : null,
    srcA    : null,
    srcN    : 0,
    srcHead : 0,
    srcTNew : 0,
    srcSCur : 0,
    srcSeq  : 0,
    srcKMin : Infinity,
    lastEmitT : -1e9,

    // Phase accumulée de la source sinusoïdale (cf. stepSourceVagues)
    sinPhase : 0,

    // ── Source : mise en marche ──────────────────────────────────────
    //  La source démarre en marche : l'onglet s'ouvre donc sur le bassin
    //  déjà animé, comme avant qu'elle ne devienne commutable.
    //  vaguesEnv / vaguesEmitMode : enveloppe demi-cosinus de démarrage et
    //  d'arrêt, étalée sur une période (cf. stepSourceVagues).
    //  sourceMode décrit l'ÉMISSION EN COURS et non le mode choisi dans le
    //  sélecteur (que lit `_vaguesSourceMode`) — même convention qu'au Son.
    sourceMode       : 'sinus',
    sinusoidalActive : true,
    vaguesEmitMode   : null,
    vaguesEnv        : 0,

    // ── Source — impulsions (superposables) ─────────────────────────
    // Chaque entrée : { startTime }. Une impulsion n'efface pas les
    // précédentes : elles se superposent dans l'historique.
    impulses           : [],
    impulsePropagating : false,
    sourceActiveUntil  : 0,   // fin du mouvement de la source (mode Impulsion)

    // ── Balises (points draggables dans le canvas 2D) ────────────────
    beacon1 : { active: false, x: 0, y: 0, snapped: false },
    beacon2 : { active: false, x: 0, y: 0, snapped: false },

    // Trace y(t) à recalculer au prochain rendu (balise déplacée) —
    // cf. rebuildYtDataVagues
    ytDirty1 : false,
    ytDirty2 : false,

    // ── Données graphes ──────────────────────────────────────────────
    //  Stockage en Float32Array plutôt qu'en tableaux d'objets : la courbe y(x)
    //  est régénérée à chaque frame (cf. updateYxDataVagues) et allouer quelques
    //  milliers de {x, y} 60 fois par seconde saturait le ramasse-miettes.
    graphMode     : 'dpx',   // 'dpx' (y(x)) | 'dpt' (y(t)) | 'both'
    yxX           : null,    // Float32Array — abscisses (px, relatives à la source)
    yxY           : null,    // Float32Array — ordonnées (cm)
    yxN           : 0,       // nombre de points valides dans yxX/yxY
    yxSig         : null,    // signature de l'état ayant produit yxX/yxY (anti-recalcul)
    ytBuf1        : null,    // tampon circulaire série temporelle balise 1
    ytBuf2        : null,    // tampon circulaire série temporelle balise 2

    // ── Vue graphe ───────────────────────────────────────────────────
    graphView        : { xMin: 0, xMax: 5, yMin: -1, yMax: 1 },
    graphCursorMode  : false,
    graphYxYMin      : -1,
    graphYxYMax      :  1,
    peakAmpCm        :  0.1,  // amplitude max observée (cm), pour l'échelle Y

    // ── Propriétés de l'onde (readout étendu) ────────────────────────
    wavePropsVisible : false,

    // ── Options d'affichage (zone graphe / flèche λ) ──────────────────
    //  Masqués par défaut, comme sur les onglets Son et Corde
    //  (cf. toggleShowGraphVagues/toggleLambdaVagues dans ui.js).
    graphVisible  : false,
    lambdaVisible : false,
    // Flèche λ draggable le long de l'axe horizontal (cf. _drawLambdaArrowVagues
    // et initVaguesMouse). lambdaX = abscisse écran de son extrémité gauche, en
    // repère VUE DU DESSUS ; lambdaOffsetFrac = distance (signée) à la source
    // sourceX, en fraction de la largeur du canvas — utilisée pour recalculer
    // lambdaX au resize (comme pour les balises), et par la vue en coupe pour
    // replacer la flèche sur son propre axe (cf. _drawLambdaArrowCoupeVagues).
    lambdaX          : 0,
    lambdaOffsetFrac : 0.05,

    // ── Géométrie canvas ─────────────────────────────────────────────
    canvasW     : 0,
    canvasH     : 0,
    firstResize : true,

    // ── Vue en coupe ─────────────────────────────────────────────────
    viewMode  : 'top',   // 'top' | 'coupe'
    transAnim : null,    // null | { startT, direction }  (transition en cours)
    coupeSrcX : 0,       // x canvas de la source en vue coupe (px)

    // Trajectoire des molécules d'eau (option de la vue en coupe, masquée par
    // défaut comme les autres options d'affichage). Cf. _drawOrbitesCoupeVagues.
    showOrbits : false,
};


// ══════════════════════════════════════════════════════════════════════
//  Physique : c = √(g × h)
// ══════════════════════════════════════════════════════════════════════

function updateCeleriteVagues() {
    var c_ms = Math.sqrt(Math.max(0.001, simVagues.g * simVagues.h));
    simVagues.c_ms  = c_ms;
    simVagues.c_sim = c_ms * C_BASE_VAGUES;
}

// ══════════════════════════════════════════════════════════════════════
//  Resize — calibration et placement initial
// ══════════════════════════════════════════════════════════════════════

function resizeVagues() {
    var canvas = document.getElementById('tube-canvas');
    if (!canvas) return;
    var wrap = document.getElementById('tube-canvas-wrap');
    var w = wrap ? wrap.clientWidth  : canvas.clientWidth;
    var h = wrap ? wrap.clientHeight : canvas.clientHeight;
    if (w < 10 || h < 10) return;

    var dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    simVagues.canvasW = w;
    simVagues.canvasH = h;

    // Bande de gauche en vue de coupe : dépend de la place prise par la colonne
    // source en overlay, dont la largeur peinte suit --src-s. À réévaluer à
    // chaque resize, donc, et avant tout usage de COUPE_LEFT_MARGIN ci-dessous.
    _syncCoupeLeftMargin(w);

    // Calibration : vue par défaut ±51 cm (g=9.81, h=0.003, f=1,5 Hz)
    //   (w / N_λ * f_def) / c_déf  →  N_λ longueurs d'onde visibles sur la largeur.
    //   N_λ = 9 : compromis « crêtes assez lentes » (c_px = λ_px × f) sans trop
    //   resserrer le motif — cf. l'ancien réglage 12 λ à 3 Hz, deux fois plus nerveux.
    var c_ms_def = Math.sqrt(9.81 * 0.003);        // ≈ 0,171 m/s
    C_BASE_VAGUES = (w / 9.0 * 1.5) / c_ms_def;   // px/(m/s), calibré sur les réglages par défaut

    // Source fixe au centre
    simVagues.sourceX = Math.round(w / 2);
    simVagues.sourceY = Math.round(h / 2);

    if (simVagues.firstResize) {
        // Positions relatives initiales des balises
        simVagues.beacon1.rx = 0.5 + 0.22;
        simVagues.beacon1.ry = 0.5;
        simVagues.beacon2.rx = 0.5 + 0.40;
        simVagues.beacon2.ry = 0.5;
        simVagues.firstResize = false;
    }
    // Recalcul pixel des balises depuis leurs coordonnées relatives
    simVagues.beacon1.x = Math.round(simVagues.beacon1.rx * w);
    simVagues.beacon1.y = Math.round(simVagues.beacon1.ry * h);
    simVagues.beacon2.x = Math.round(simVagues.beacon2.rx * w);
    simVagues.beacon2.y = Math.round(simVagues.beacon2.ry * h);

    // Recalcul pixel de la flèche λ depuis sa distance relative à la source
    // (cf. lambdaOffsetFrac)
    simVagues.lambdaX = Math.round(simVagues.sourceX + simVagues.lambdaOffsetFrac * w);

    if (simVagues.viewMode === 'coupe') {
        simVagues.coupeSrcX = COUPE_LEFT_MARGIN;
    }

    updateCeleriteVagues();
    _scheduleVaguesRebuild();
    // La bande d'options se recale sur la nouvelle hauteur des boutons.
    syncBtnOrbitesVagues();
}

// ══════════════════════════════════════════════════════════════════════
//  Source : émission dans l'historique
//
//  La source grave un échantillon tous les SRC_DT de temps simulé, comme la
//  membrane du Son (cf. stepSourceSon). Le rattrapage à pas fixe se fait ici
//  et non dans la boucle de ui.js : cet onglet n'a rien d'autre à cadencer
//  sur ce pas.
// ══════════════════════════════════════════════════════════════════════

var lastSrcUpdateVagues = 0;

function stepSourceVagues(t) {
    var s = simVagues;

    // ── Enveloppe de démarrage / d'arrêt ──────────────────────────────
    // Même raison qu'au Son (cf. stepSourceSon) : une sinusoïde allumée
    // brutalement produit un front franc, ici un anneau net qui se détache du
    // reste de la houle. On module donc l'amplitude par un demi-cosinus étalé
    // sur exactement une période — la source met une oscillation à s'établir,
    // et autant à se taire. Passé ce délai le signal est une sinusoïde pure :
    // la longueur d'onde reste mesurable partout ailleurs.
    var wantMode = s.sinusoidalActive ? 'sinus' : null;
    if (wantMode && wantMode !== s.vaguesEmitMode) {
        s.vaguesEmitMode = wantMode;
        s.vaguesEnv      = 0;
    }
    var envStep = Math.max(0.2, s.freq) * SRC_DT;   // 1 période pour 0 → 1
    if (wantMode) {
        s.vaguesEnv = Math.min(1, s.vaguesEnv + envStep);
    } else if (s.vaguesEmitMode) {
        s.vaguesEnv = Math.max(0, s.vaguesEnv - envStep);
        if (s.vaguesEnv === 0) s.vaguesEmitMode = null;
    }
    var env = (1 - Math.cos(Math.PI * s.vaguesEnv)) / 2;

    var d = 0;
    if (s.vaguesEmitMode === 'sinus') {
        // Phase accumulée, et non 2πf·t recalculé : c'est ce qui fait que
        // changer la fréquence n'introduit pas de saut de phase et n'affecte
        // que l'onde émise à partir de cet instant.
        s.sinPhase += 2 * Math.PI * s.freq * SRC_DT;
        if (s.sinPhase > 2 * Math.PI) s.sinPhase -= 2 * Math.PI;
        d += env * Math.sin(s.sinPhase);
    }

    // ── Composantes impulsions (superposables) ────────────────────────
    // Une oscillation unique, fenêtrée :
    //     d(τ) = sin(2π·τ/T) × (1 − cos(2π·τ/T)) / 2
    // Elle part de 0 avec une pente nulle, monte en crête, redescend en creux
    // et revient à 0 sans à-coup — d'où une crête circulaire suivie d'un
    // sillon, et non une bosse isolée.
    //
    // Le creux n'est pas décoratif : la source monte puis REVIENT à sa
    // position de repos, elle n'injecte donc aucun volume d'eau net. Une onde
    // purement positive ferait apparaître de l'eau venue de nulle part. (Une
    // vraie vague solitaire — le soliton de Russell — est bien une bosse sans
    // creux, mais elle demande une source qui pousse l'eau et reste avancée,
    // et une physique non linéaire que ce modèle n'a pas.)
    //
    // C'est aussi l'analogue visuel de l'impulsion du Son : là-bas la
    // membrane décrit une bosse unipolaire, mais ce que l'élève voit est ΔP,
    // sa dérivée — compression puis dépression. Ici l'observable EST le
    // déplacement, il doit donc porter les deux.
    for (var i = 0; i < s.impulses.length; i++) {
        var tau = t - s.impulses[i].startTime;
        if (tau >= 0 && tau <= T_IMPULSE) {
            var u = 2 * Math.PI * tau / T_IMPULSE;
            d += IMPULSE_V_NORM * Math.sin(u) * (1 - Math.cos(u)) / 2;
        }
    }

    // Gravé même quand d vaut 0 : c'est ce silence qui, en s'éloignant,
    // dessine l'arrière du train d'ondes quand on coupe la source — et qui
    // sépare deux impulsions successives.
    _srcPush(s, t, d, s.c_sim);
}

// Une impulsion est « terminée » quand elle a fini d'être émise ET a fini de
// sortir du champ visible. On mesure la diagonale du canvas : c'est la plus
// grande distance qu'elle ait à parcourir avant de disparaître.
function pruneImpulsesVagues() {
    var s = simVagues;
    if (s.c_sim <= 0 || s.impulses.length === 0) return;
    var diag   = Math.sqrt(s.canvasW * s.canvasW + s.canvasH * s.canvasH);
    var cutoff = s.simTime - T_IMPULSE - diag / s.c_sim - 0.5;
    s.impulses = s.impulses.filter(function(imp) {
        return imp.startTime > cutoff;
    });
}

function addSourceSampleVagues(t) {
    // Avant le premier resize la célérité vaut 0 : graver maintenant empilerait
    // des échantillons à distance nulle, que le front ne pourrait plus séparer.
    if (simVagues.c_sim <= 0) { lastSrcUpdateVagues = t; return; }
    // Onglet resté en arrière-plan, ou reprise après une longue pause : on ne
    // grave pas les milliers d'échantillons du retard, on recale l'horloge.
    if (t - lastSrcUpdateVagues > 1.0) lastSrcUpdateVagues = t - SRC_DT;
    while (t - lastSrcUpdateVagues >= SRC_DT) {
        lastSrcUpdateVagues += SRC_DT;
        stepSourceVagues(lastSrcUpdateVagues);
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Lecture du champ : un seul point d'entrée
//
//  Le déplacement au point situé à la distance r de la source est celui que
//  la source a émis quand le front avait parcouru S(t) − r. Toutes les vues
//  (dessus, coupe, transition 3D) et tous les graphes passent par là : c'est
//  la condition pour qu'ils continuent de montrer la même onde.
// ══════════════════════════════════════════════════════════════════════

// Rayon atteint par le front : distance couverte par l'historique. Remplace
// l'ancien c·(t − sourceResetTime), qu'il vaut exactement tant que c ne change
// pas — mais qui reste juste, lui, quand la célérité varie en cours de route.
function _vaguesFrontR(t) {
    var s = simVagues;
    if (s.srcN === 0 || s.c_sim <= 0) return 0;
    if (t === undefined) t = s.simTime;
    return _srcSAtTime(s, t, s.c_sim) - s.srcS[_srcIdx(s, 0)];
}

// Déplacement normalisé émis, lu à la distance r (px CSS) et à l'instant t.
// Lecture unitaire : les rendus pleine surface passent par la table radiale
// ci-dessous, qui fait le même calcul une fois pour toutes.
function _vaguesSrcDAtR(r, t) {
    var s = simVagues;
    if (s.c_sim <= 0 || s.srcN === 0) return 0;
    if (t === undefined) t = s.simTime;
    return _srcDAtS(s, _srcSAtTime(s, t, s.c_sim) - r);
}

// ── Table radiale du déplacement, reconstruite une fois par frame ─────
//  Le rendu de la vue du dessus lit le champ en ~120 000 points par frame ;
//  une recherche dichotomique par point serait ruineuse. Comme le champ ne
//  dépend que de r, on tabule d(r) une seule fois, en sous-pixel, puis chaque
//  point interpole. La table se construit d'un seul balayage : r croissant
//  ⇔ S décroissant, un curseur descend l'historique sans jamais revenir.
var VAGUES_RAD_SUB = 4;    // échantillons par pixel CSS (cf. VAGUES_YX_CACHE_SUB)

function _vaguesRadLUT(t) {
    var s = simVagues;
    if (t === undefined) t = s.simTime;

    // Diagonale du canvas, plus le panoramique de la transition 3D qui décale
    // le repère vers la droite et fait donc lire plus loin que la diagonale.
    var maxR = Math.ceil(Math.sqrt(s.canvasW * s.canvasW + s.canvasH * s.canvasH)
                         + Math.max(0, _vaguesMaxPan())) + 4;
    var nSub = maxR * VAGUES_RAD_SUB + 2;

    var sig = t + '|' + s.srcSeq + '|' + s.c_sim + '|' + nSub;
    if (s._radSig === sig && s._radD && s._radD.length === nSub) return s._radD;

    var radD = (s._radD && s._radD.length === nSub) ? s._radD : new Float32Array(nSub);
    s._radD   = radD;
    s._radSig = sig;
    s._radLen = nSub;

    var n = s.srcN;
    if (n === 0 || s.c_sim <= 0) {
        for (var z = 0; z < nSub; z++) radD[z] = 0;
        return radD;
    }

    var sNow   = _srcSAtTime(s, t, s.c_sim);
    var invSub = 1 / VAGUES_RAD_SUB;
    var sFirst = s.srcS[_srcIdx(s, 0)];
    var sLast  = s.srcS[_srcIdx(s, n - 1)];
    var k      = n - 1;   // curseur : plus grand indice tel que S[k] ≤ sT

    for (var ri = 0; ri < nSub; ri++) {
        var sT = sNow - ri * invSub;
        if (sT <= sFirst) {
            // Au-delà du front : l'onde n'est pas encore arrivée. Tout le
            // reste de la table est nul, inutile de continuer.
            for (var zz = ri; zz < nSub; zz++) radD[zz] = 0;
            break;
        }
        if (sT >= sLast) {
            // Tout près de la source, entre le dernier échantillon gravé et
            // l'instant courant : prolongement confié à _srcSampleAtS.
            radD[ri] = _srcDAtS(s, sT);
            continue;
        }
        while (k > 0 && s.srcS[_srcIdx(s, k)] > sT) k--;
        var iA = _srcIdx(s, k), iB = _srcIdx(s, k + 1);
        var span = s.srcS[iB] - s.srcS[iA];
        var fr   = (span > 0) ? (sT - s.srcS[iA]) / span : 0;
        radD[ri] = s.srcD[iA] + (s.srcD[iB] - s.srcD[iA]) * fr;
    }
    return radD;
}

// ── Mouvement réel de la source ───────────────────────────────────────
//  Position et vitesse du point S, LUES DANS L'HISTORIQUE plutôt que
//  recalculées en sin(2πf·t). C'est la seule façon qu'elles décrivent ce que
//  la source fait vraiment : elle est immobile entre deux impulsions, et une
//  fois désactivée. La vitesse sort d'une différence finie sur deux pas
//  d'échantillonnage — c'est elle qui oriente la flèche, la position seule
//  la ferait pointer dans le même sens pendant toute une demi-période.
var _srcMotionV = { y: 0, v: 0, moving: false };

function _vaguesSourceMotion() {
    var s  = simVagues;
    var t  = s.simTime;
    var h  = 2 * SRC_DT;
    var d0 = _vaguesSrcDAtR(0, t);
    var d1 = _vaguesSrcDAtR(0, t - h);
    _srcMotionV.y = d0 * s.amplitude;
    _srcMotionV.v = (d0 - d1) / h;
    // Seuil très bas devant la vitesse d'une source en marche (2πf ≈ 9 à
    // 1,5 Hz) : il ne distingue que le repos franc.
    _srcMotionV.moving = Math.abs(_srcMotionV.v) > 0.01;
    return _srcMotionV;
}

// Lecture interpolée de la table radiale. r au-delà de la table = hors champ.
function _radAt(radD, r) {
    var rs = r * VAGUES_RAD_SUB;
    var i0 = rs | 0;
    if (i0 < 0 || i0 >= radD.length - 1) return 0;
    var d0 = radD[i0];
    return d0 + (radD[i0 + 1] - d0) * (rs - i0);
}

// ══════════════════════════════════════════════════════════════════════
//  Rebuild du cache de champ (vue du dessus) — cf. discussion en tête de
//  fichier. Appelé au resize et à chaque changement de fréquence/célérité
//  (g, h)/atténuation, jamais dans la boucle de rendu par frame.
// ══════════════════════════════════════════════════════════════════════

var _vaguesRebuildScheduled = false;
function _scheduleVaguesRebuild() {
    if (_vaguesRebuildScheduled) return;
    _vaguesRebuildScheduled = true;
    requestAnimationFrame(function () {
        _vaguesRebuildScheduled = false;
        _rebuildVaguesFieldCache();
    });
}

function _rebuildVaguesFieldCache() {
    var s = simVagues;
    if (s.canvasW < 10 || s.canvasH < 10 || s.c_sim <= 0 || s.freq <= 0) { s.gridW = 0; return; }

    var lambda_px = s.c_sim / s.freq;
    if (!(lambda_px > 0)) { s.gridW = 0; return; }

    var gw = Math.max(40, Math.min(VAGUES_GRID_W_MAX, Math.round(s.canvasW / VAGUES_GRID_FACTOR)));
    var gh = Math.max(30, Math.min(VAGUES_GRID_H_MAX, Math.round(s.canvasH / VAGUES_GRID_FACTOR)));
    // Repasse dessus si le cadrage écran seul sous-échantillonnerait λ (cf. constantes ci-dessus).
    var neededGw = Math.ceil(s.canvasW * VAGUES_GRID_CELLS_PER_LAMBDA / lambda_px);
    var neededGh = Math.ceil(s.canvasH * VAGUES_GRID_CELLS_PER_LAMBDA / lambda_px);
    if (neededGw > gw) gw = Math.min(VAGUES_GRID_W_MAX, neededGw);
    if (neededGh > gh) gh = Math.min(VAGUES_GRID_H_MAX, neededGh);

    var maxR = Math.sqrt(s.canvasW * s.canvasW + s.canvasH * s.canvasH);
    var a5   = s.attenuation * 5;
    var geo  = s.geoAttenuation;
    var sx   = s.sourceX, sy = s.sourceY;

    // Ne subsistent ici que les grandeurs indépendantes du temps : la distance
    // à la source et l'enveloppe d'atténuation. La phase, elle, vient de
    // l'historique de la source via la table radiale (cf. _vaguesRadLUT) —
    // c'est ce qui autorise une forme d'onde quelconque.
    var gridEnv = new Float32Array(gw * gh); // enveloppe géo/atténuation (sans le gain visuel)
    var gridR   = new Float32Array(gw * gh); // r (px CSS) — déclenche le front causal

    for (var gy = 0; gy < gh; gy++) {
        var py = (gy + 0.5) / gh * s.canvasH;
        var dy = py - sy;
        for (var gx = 0; gx < gw; gx++) {
            var px = (gx + 0.5) / gw * s.canvasW;
            var dx = px - sx;
            var r  = Math.sqrt(dx * dx + dy * dy);
            var idx = gy * gw + gx;

            var env = 1.0;
            if (geo) env = Math.min(1, Math.sqrt(50 / Math.max(1, r)));
            if (a5 > 0) env *= Math.exp(-a5 * r / maxR);

            gridEnv[idx] = env;
            gridR[idx]   = r;
        }
    }

    s.gridW = gw; s.gridH = gh;
    s.gridEnv = gridEnv; s.gridR = gridR;

    if (!s._offCanvas) s._offCanvas = document.createElement('canvas');
    s._offCanvas.width  = gw;
    s._offCanvas.height = gh;
    s._offCtx = s._offCanvas.getContext('2d');
    // Buffer de pixels réutilisé à chaque frame (cf. drawVagues) — évite de réallouer un
    // nouvel ImageData 60 fois par seconde (pression sur le ramasse-miettes).
    s._imgData = s._offCtx.createImageData(gw, gh);

    // ── Cache 1D le long de l'axe horizontal (courbe y(x), cf. updateYxDataVagues) ──
    // Même principe que ci-dessus, mais indexé directement par r = distance à la source.
    // Ne reste ici que l'enveloppe : la phase vient de la table radiale, échantillonnée
    // au même pas sous-pixel. Ce sous-échantillonnage n'est pas un luxe : lu au pixel
    // entier tronqué, le champ devenait un escalier dont les marches valaient A·2π/λ_px
    // sur les flancs — soit ~16 % de l'amplitude pour λ = 40 px, bien visible.
    // Formule d'enveloppe identique à _waveFieldRaw (légèrement différente de celle du
    // rendu 2D ci-dessus, qui utilise une autre constante — incohérence déjà présente
    // entre les deux, conservée à l'identique pour ne pas changer le résultat affiché).
    var maxRpx = Math.ceil(s.canvasW) + 2;
    var nSub   = maxRpx * VAGUES_YX_CACHE_SUB + 2;
    var invSub = 1 / VAGUES_YX_CACHE_SUB;
    // Réutilise les tampons si la taille n'a pas changé (le rebuild est déclenché par un
    // resize ou un changement de réglage, pas à chaque frame, mais autant éviter le churn).
    var yxEnv = (s.yxCacheEnv && s.yxCacheEnv.length === nSub) ? s.yxCacheEnv : new Float32Array(nSub);
    for (var ri = 0; ri < nSub; ri++) {
        var rPx   = ri * invSub;
        var envYx = 1.0;
        if (geo) envYx = Math.sqrt(40 / (40 + rPx));
        if (a5 > 0) envYx *= Math.exp(-a5 * rPx / maxR);
        yxEnv[ri] = envYx;
    }
    s.yxCacheEnv = yxEnv;
    s.yxCacheLen = nSub;  s.yxCacheSub = VAGUES_YX_CACHE_SUB;
    s.yxSig      = null;  // force le recalcul de la courbe avec le nouveau cache
}

// ══════════════════════════════════════════════════════════════════════
//  Champ d'onde en un point (px, py) du canvas
//  Retourne une valeur normalisée ∈ [-1, 1].
// ══════════════════════════════════════════════════════════════════════

// Retourne le champ normalisé ∈ [-1,1] avec gain visuel (pour le rendu couleur).
function _waveFieldAt(px, py) {
    var raw = _waveFieldRaw(px, py);
    return Math.max(-1, Math.min(1, raw * VAGUES_AMP_GAIN));
}

// Retourne le champ physique brut (sin × atténuation, sans gain visuel).
// Valeurs ∈ [-1,1] en conditions normales ; peut dépasser si géo désactivée près de la source.
// tOverride (optionnel) : évalue le champ à un instant passé au lieu de
// l'instant courant. Sert à reconstruire la trace y(t) d'une balise qu'on
// vient de déplacer (cf. rebuildYtDataVagues).
function _waveFieldRaw(px, py, tOverride) {
    var c = simVagues.c_sim;
    if (c <= 0) return 0;

    var t    = (tOverride === undefined) ? simVagues.simTime : tOverride;
    var maxR = Math.sqrt(simVagues.canvasW * simVagues.canvasW + simVagues.canvasH * simVagues.canvasH);
    var a5   = simVagues.attenuation * 5;
    var geo  = simVagues.geoAttenuation;

    var dx = px - simVagues.sourceX;
    var dy = py - simVagues.sourceY;
    var r  = Math.sqrt(dx * dx + dy * dy);

    // L'enveloppe causale n'est plus un test : au-delà du front, l'historique
    // n'a rien à donner et renvoie 0 de lui-même.
    var field = _vaguesSrcDAtR(r, t);
    if (field === 0) return 0;
    if (geo) field *= Math.sqrt(40 / (40 + r));
    if (a5 > 0) field *= Math.exp(-a5 * r / maxR);
    return field * simVagues.amplitude;
}

// ══════════════════════════════════════════════════════════════════════
//  Rendu principal du canvas (vue de dessus)
// ══════════════════════════════════════════════════════════════════════

function drawVagues() {
    var canvas = document.getElementById('tube-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = canvas.clientWidth, H = canvas.clientHeight;   // pixels CSS — repère de sourceX/Y, dessin vectoriel
    if (!W || !H) return;
    var dpr = window.devicePixelRatio || 1;
    var PW  = canvas.width, PH = canvas.height;            // pixels physiques — repère de putImageData

    if (simVagues.transAnim) { _drawVaguesTransition(ctx, W, H, PW, PH, dpr); return; }
    if (simVagues.viewMode === 'coupe') { _drawVaguesCoupe(ctx, W, H); return; }

    if (simVagues.c_sim <= 0) {
        ctx.fillStyle = 'rgb(' + COL_BG_R + ',' + COL_BG_G + ',' + COL_BG_B + ')';
        ctx.fillRect(0, 0, W, H);
        _drawAxisVagues(ctx, W, H);
        _drawBeaconsVagues(ctx);
        _drawSourceVagues(ctx);
        return;
    }

    // ── Rendu via le cache basse résolution (cf. _rebuildVaguesFieldCache) ──
    var s = simVagues;
    if (!s.gridR || s.gridW * s.gridH !== s.gridR.length) {
        // Cache pas encore prêt (juste après un resize/changement de réglage, rebuild
        // anti-rebond en attente, cf. _scheduleVaguesRebuild) : fond uni le temps qu'il arrive.
        ctx.fillStyle = 'rgb(' + COL_BG_R + ',' + COL_BG_G + ',' + COL_BG_B + ')';
        ctx.fillRect(0, 0, W, H);
        _drawAxisVagues(ctx, W, H);
        _drawBeaconsVagues(ctx);
        _drawSourceVagues(ctx);
        return;
    }

    var t        = s.simTime;
    var radD     = _vaguesRadLUT(t);
    var radLast  = radD.length - 1;
    var r_front  = _vaguesFrontR(t);   // enveloppe causale, portée par l'historique
    // Largeur de la zone de lissage du front (px CSS), calquée sur surfaces.js — évite la
    // coupure nette en anneau qui apparaissait auparavant à la limite atteinte par l'onde.
    // Le fondu se fait désormais VERS L'INTÉRIEUR : l'historique est vide au-delà du front,
    // il n'y a plus rien à estomper de ce côté (avant, le rendu prolongeait la sinusoïde
    // hors du cône causal pour l'y faire décroître).
    var frontFeather = Math.max(1, s.c_sim / Math.max(1, s.freq) * 0.15);
    var featherFrom  = r_front - frontFeather;

    var gw = s.gridW, gh = s.gridH;
    var gridEnv = s.gridEnv, gridR = s.gridR;
    var img  = s._imgData; // buffer réutilisé (cf. _rebuildVaguesFieldCache), pas de réallocation par frame
    var data = img.data;

    for (var idx = 0, n = gw * gh; idx < n; idx++) {
        var p = idx * 4;
        var r = gridR[idx];
        if (r > r_front) {
            data[p] = COL_BG_R; data[p + 1] = COL_BG_G; data[p + 2] = COL_BG_B; data[p + 3] = 255;
            continue;
        }
        // Déplacement émis, relu à la distance r dans la table radiale de la frame.
        // Interpolation linéaire : lue au sous-échantillon entier, la table ferait
        // apparaître des marches sur les flancs de l'onde.
        var rs = r * VAGUES_RAD_SUB;
        var i0 = rs | 0;
        var raw = (i0 >= radLast) ? 0
                : radD[i0] + (radD[i0 + 1] - radD[i0]) * (rs - i0);
        var env = gridEnv[idx] * VAGUES_AMP_GAIN;
        if (env > 1) env = 1;
        // Fondu progressif sur les frontFeather derniers px avant le front (au lieu d'une
        // coupure nette) — bord doux, comme surfaces.js.
        if (r > featherFrom) {
            env *= (r_front - r) / frontFeather;
        }
        var t01 = (raw * env + 1) * 0.5;
        data[p]     = (COL_TROUGH_R + t01 * (COL_CREST_R - COL_TROUGH_R)) | 0;
        data[p + 1] = (COL_TROUGH_G + t01 * (COL_CREST_G - COL_TROUGH_G)) | 0;
        data[p + 2] = (COL_TROUGH_B + t01 * (COL_CREST_B - COL_TROUGH_B)) | 0;
        data[p + 3] = 255;
    }
    s._offCtx.putImageData(img, 0, 0);

    // Agrandissement natif (lissé) de la grille basse résolution + léger flou, alignés sur
    // le rendu de surfaces.js (diffraction/interférences) pour une cohérence visuelle.
    ctx.imageSmoothingEnabled = true;
    ctx.filter = 'blur(0.6px)';
    ctx.drawImage(s._offCanvas, 0, 0, gw, gh, 0, 0, W, H);
    ctx.filter = 'none';

    _drawAxisVagues(ctx, W, H);
    _drawLambdaArrowVagues(ctx, W, H);
    _drawBeaconsVagues(ctx);
    _drawSourceVagues(ctx);
}


// ── Graduations de l'axe x — style commun aux trois vues ──────────────
//  Vue du dessus, vue en coupe et transition 3D partagent le même rendu :
//  ticks principaux étiquetés + sous-graduations, tracés en blanc sur un
//  liseré sombre. Le liseré (plutôt qu'une ombre floue) garde les chiffres
//  lisibles aussi bien sur le bleu clair des crêtes que sur le fond sombre.
var VAGUES_TICK_HALO = 'rgba(4,14,26,0.85)';

// Taille de police des graduations, proportionnelle à la hauteur du canvas
function _vaguesTickFont(H) {
    return Math.max(12, Math.min(19, Math.round(H * 0.042)));
}

// Trait vertical : liseré sombre épais (wHalo = 0 pour s'en passer) puis trait blanc
function _vaguesTick(ctx, px, yLevel, half, wHalo, wLine, alpha) {
    ctx.beginPath(); ctx.moveTo(px, yLevel - half); ctx.lineTo(px, yLevel + half);
    if (wHalo > 0) { ctx.strokeStyle = VAGUES_TICK_HALO; ctx.lineWidth = wHalo; ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,' + alpha + ')'; ctx.lineWidth = wLine; ctx.stroke();
}

// refWidth : largeur (px) servant à choisir le pas — la portion d'axe
// réellement montrée, qui diffère entre vue du dessus et vue en coupe.
// leftAlpha : opacité des ticks à gauche de la source (0 = aucun).
function _drawVaguesTicks(ctx, W, H, srcX, yLevel, refWidth, leftAlpha) {
    if (C_BASE_VAGUES <= 0) return;

    var step_raw = (refWidth / C_BASE_VAGUES) / 6;
    var mag      = Math.pow(10, Math.floor(Math.log10(Math.max(step_raw, 1e-9))));
    var step, sub;                      // sub : nombre de sous-graduations par pas
    if      (step_raw / mag < 2) { step = mag;     sub = 5; }
    else if (step_raw / mag < 5) { step = 2 * mag; sub = 4; }
    else                         { step = 5 * mag; sub = 5; }
    var decimals = Math.max(0, -Math.floor(Math.log10(step)));

    var fs    = _vaguesTickFont(H);
    var HALF  = Math.round(fs * 0.60);  // demi-longueur d'un tick principal
    var MINOR = Math.round(fs * 0.30);
    var pxStep = step * C_BASE_VAGUES;

    ctx.save();
    ctx.lineCap = 'round';

    // Sous-graduations (sans étiquette), des deux côtés de la source
    var subStep = pxStep / sub;
    for (var i = 1; srcX + i * subStep < W + 1; i++) {
        if (i % sub === 0) continue;
        _vaguesTick(ctx, Math.round(srcX + i * subStep), yLevel, MINOR, 0, 1.2, 0.75);
    }
    if (leftAlpha > 0.01) {
        for (var j = 1; srcX - j * subStep > -1; j++) {
            if (j % sub === 0) continue;
            _vaguesTick(ctx, Math.round(srcX - j * subStep), yLevel, MINOR, 0, 1.2, 0.75 * leftAlpha);
        }
    }

    // Graduations principales + étiquettes, de part et d'autre de la source.
    // À gauche les valeurs sont négatives (signe « − » typographique) et tout
    // le groupe s'estompe avec leftAlpha pendant la bascule vers la coupe.
    ctx.font         = 'bold ' + fs + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin     = 'round';
    ctx.miterLimit   = 2;
    for (var side = 0; side < 2; side++) {
        var sign = side === 0 ? 1 : -1;
        if (sign < 0) {
            if (leftAlpha <= 0.01) break;
            ctx.globalAlpha = leftAlpha;
        }
        for (var d = step; ; d += step) {
            var px = Math.round(srcX + sign * d * C_BASE_VAGUES);
            if (sign > 0 ? px > W + 1 : px < -1) break;
            _vaguesTick(ctx, px, yLevel, HALF, 4.5, 2, 0.95);
            var txt = (sign < 0 ? '\u2212' : '') + d.toFixed(decimals).replace('.', ',');
            ctx.strokeStyle = VAGUES_TICK_HALO;
            ctx.lineWidth   = Math.max(3, fs * 0.3);
            ctx.strokeText(txt, px, yLevel + HALF + 3);
            ctx.fillStyle   = '#ffffff';
            ctx.fillText(txt, px, yLevel + HALF + 3);
        }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
}

// Étiquette « x (m) → » au bord droit de l'axe, même traitement lisible
function _drawVaguesAxisLabel(ctx, W, H, yLevel) {
    var fs = _vaguesTickFont(H);
    ctx.save();
    ctx.font         = 'italic bold ' + fs + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'bottom';
    ctx.lineJoin     = 'round';
    ctx.miterLimit   = 2;
    ctx.strokeStyle  = VAGUES_TICK_HALO;
    ctx.lineWidth    = Math.max(3, fs * 0.3);
    ctx.strokeText('x (m) \u2192', W - 5, yLevel - 5);
    ctx.fillStyle    = '#ffffff';
    ctx.fillText('x (m) \u2192', W - 5, yLevel - 5);
    ctx.restore();
}

// ── Axe horizontal en pointillés ─────────────────────────────────────

function _drawAxisVagues(ctx, W, H) {
    var sy = simVagues.sourceY;
    var sx = simVagues.sourceX;
    ctx.save();

    // Ligne en pointillés
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth   = 1.6;
    ctx.setLineDash([9, 6]);
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(W, sy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Graduations en mètres, de part et d'autre de la source
    _drawVaguesTicks(ctx, W, H, sx, sy, W, 1);
    _drawVaguesAxisLabel(ctx, W, H, sy);

    ctx.restore();
}

// ── Flèche de longueur d'onde (segment radial) ──────────────────────────
//  L'onde de Vagues étant circulaire, la flèche suit l'axe horizontal (vue
//  du dessus) ou l'axe d'équilibre y=0 (vue en coupe) plutôt qu'un axe de
//  propagation dédié — une simple coupe radiale de longueur λ. Draggable
//  horizontalement, comme sur Son/Corde (cf. initVaguesMouse).
//
//  Position stockée en repère VUE DU DESSUS (lambdaX, absolu ; lambdaOffsetFrac,
//  relatif à la largeur du canvas) : dist = lambdaX - sourceX est la
//  distance (signée) à la source, seule grandeur physique pertinente,
//  invariante par rotation de vue. La vue en coupe la retraduit en
//  coupeSrcX + dist (même principe que les balises, cf.
//  _drawBeaconsCoupeVagues) et masque la flèche si dist ≤ 0 : ce cadrage-là
//  ne montre que le demi-axe x > 0 depuis la source.
function _vaguesLambdaPx() {
    return (simVagues.c_sim > 0 && simVagues.freq > 0)
        ? simVagues.c_sim / simVagues.freq : 0;
}

// Hauteur de la flèche au-dessus de l'axe d'équilibre, en vue coupe —
// jamais nulle (contrairement à la vue du dessus, où la flèche est posée
// directement sur l'axe) : sans relief, les pointillés de mise à niveau
// n'auraient rien à montrer.
function _vaguesLambdaArrowYCoupe(W, H, srcX) {
    var yLevel = Math.round(H / 2);
    return Math.max(20, yLevel - Math.max(28, Math.round((W - srcX) * 0.12)));
}

// Tracé générique d'une double flèche horizontale λ, avec pointillés de
// mise à niveau optionnels si arrowY ≠ zeroY (vue coupe) — même dessin que
// _drawSonLambdaArrow/_drawCordeLambdaArrow (tube.js), adapté ici pour
// n'avoir qu'un seul appelant par vue plutôt qu'un état sim.tubeLeft/Right.
function _drawLambdaArrowCore(ctx, x1, x2, arrowY, zeroY, fSize) {
    var lambdaPx = x2 - x1;
    var color = '#e6007e';   // même magenta que Son/Corde
    var halo  = '#ffffff';

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';

    // Pointillés verticaux jusqu'à l'axe d'équilibre (vue coupe uniquement).
    if (arrowY !== zeroY) {
        ctx.setLineDash([4, 3]);
        [1, 0].forEach(function (isHalo) {
            ctx.strokeStyle = isHalo ? halo : color;
            ctx.lineWidth   = isHalo ? 3 : 1;
            ctx.globalAlpha = isHalo ? 1 : 0.7;
            ctx.beginPath();
            ctx.moveTo(x1, arrowY); ctx.lineTo(x1, zeroY);
            ctx.moveTo(x2, arrowY); ctx.lineTo(x2, zeroY);
            ctx.stroke();
        });
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
    }

    ctx.lineCap = 'butt';
    var headLen = Math.max(8, Math.min(18, lambdaPx * 0.12));
    var shaftA  = Math.min(x1 + headLen, (x1 + x2) / 2);
    var shaftB  = Math.max(x2 - headLen, (x1 + x2) / 2);

    function headPath(xTip, dir) {
        ctx.beginPath();
        ctx.moveTo(xTip, arrowY);
        ctx.lineTo(xTip + dir * headLen, arrowY - headLen * 0.6);
        ctx.lineTo(xTip + dir * headLen, arrowY + headLen * 0.6);
        ctx.closePath();
    }

    [1, 0].forEach(function (isBorder) {
        ctx.strokeStyle = isBorder ? halo : color;
        ctx.fillStyle   = isBorder ? halo : color;

        ctx.lineWidth = isBorder ? 5 : 3;
        ctx.beginPath();
        ctx.moveTo(shaftA, arrowY);
        ctx.lineTo(shaftB, arrowY);
        ctx.stroke();

        ctx.lineWidth = 2;
        [[x1, 1], [x2, -1]].forEach(function (h) {
            headPath(h[0], h[1]);
            ctx.fill();
            if (isBorder) ctx.stroke();
        });
    });

    ctx.font         = 'italic bold ' + fSize + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.strokeStyle  = halo;
    ctx.lineWidth    = 4;
    ctx.strokeText('λ', (x1 + x2) / 2, arrowY - 4);
    ctx.fillStyle    = color;
    ctx.fillText('λ', (x1 + x2) / 2, arrowY - 4);

    ctx.restore();
}

// ── Vue du dessus : flèche posée sur l'axe, à l'abscisse lambdaX ───────
function _drawLambdaArrowVagues(ctx, W, H) {
    if (!simVagues.lambdaVisible) return;
    var lambdaPx = _vaguesLambdaPx();
    if (lambdaPx <= 0) return;

    var sy = simVagues.sourceY;
    var x1 = simVagues.lambdaX, x2 = x1 + lambdaPx;
    var fSize = Math.max(16, Math.round(simVagues.canvasW * 0.045));

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    _drawLambdaArrowCore(ctx, x1, x2, sy, sy, fSize);
    ctx.restore();
}

// ── Vue en coupe : flèche au-dessus de l'axe y=0, reliée par pointillés ──
function _drawLambdaArrowCoupeVagues(ctx, W, H, srcX, yLevel) {
    if (!simVagues.lambdaVisible) return;
    var lambdaPx = _vaguesLambdaPx();
    if (lambdaPx <= 0) return;

    var dist = simVagues.lambdaX - simVagues.sourceX;
    if (dist <= 0) return;   // hors du demi-axe x > 0 montré en coupe

    var x1 = srcX + dist, x2 = x1 + lambdaPx;
    if (x1 > W) return;      // entièrement hors champ, rien à dessiner

    var arrowY = _vaguesLambdaArrowYCoupe(W, H, srcX);
    var fSize  = Math.max(16, Math.round((W - srcX) * 0.06));

    ctx.save();
    ctx.beginPath();
    ctx.rect(srcX, 0, W - srcX, H);
    ctx.clip();
    _drawLambdaArrowCore(ctx, x1, x2, arrowY, yLevel, fSize);
    ctx.restore();
}

// ── Source S ──────────────────────────────────────────────────────────

function _drawSourceVagues(ctx) {
    var sx = simVagues.sourceX, sy = simVagues.sourceY;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffdd44';
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle    = '#ffffff';
    ctx.font         = 'bold 13px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('S', sx, sy - 11);
    ctx.restore();
}

// ── Balises ───────────────────────────────────────────────────────────

function _drawBeaconsVagues(ctx) {
    if (simVagues.viewMode === 'coupe') return;
    var specs = [
        { b: simVagues.beacon1, color: '#e07020', label: 'B1' },
        { b: simVagues.beacon2, color: '#2a8a50', label: 'B2' }
    ];
    for (var i = 0; i < specs.length; i++) {
        var s = specs[i];
        if (!s.b.active) continue;
        ctx.save();
        ctx.strokeStyle = s.color;
        ctx.lineWidth   = 2.5;
        ctx.beginPath();
        ctx.arc(s.b.x, s.b.y, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.b.x, s.b.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.font         = 'bold 22px monospace';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(s.label, s.b.x, s.b.y - 10);
        ctx.restore();
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Données graphe — y(x) le long de l'axe horizontal
// ══════════════════════════════════════════════════════════════════════

var VAGUES_AMP_CM = 1.0;  // 1 unité normalisée = 1 cm (référence pédagogique)

// Densité d'échantillonnage de la courbe y(x), en points par pixel de largeur
// du canvas graphe. Au-delà de ~2 pts/px le tracé ne peut plus gagner en finesse
// (le canvas ne sait pas dessiner plus fin qu'un pixel) : c'était du calcul pur
// perdu, d'autant que le cache 1D est désormais interpolé (cf. plus bas).
var VAGUES_YX_PTS_PER_PX = 2;
var VAGUES_YX_PTS_MIN    = 300;
var VAGUES_YX_PTS_MAX    = 4000;

// Signature de tous les paramètres dont dépend la courbe y(x). Tant qu'elle est
// inchangée (typiquement : simulation en pause), le recalcul est inutile.
function _yxSignatureVagues() {
    var s = simVagues;
    return s.simTime + '|' + s.sourceX + '|' + s.sourceY + '|' + s.freq + '|' +
           s.c_sim + '|' + s.amplitude + '|' + s.attenuation + '|' +
           (s.geoAttenuation ? 1 : 0) + '|' + s.srcSeq + '|' +
           s.canvasW + '|' + s.viewMode + '|' + (s.transAnim ? 1 : 0) + '|' +
           s.graphMode;
}

function updateYxDataVagues() {
    var sig = _yxSignatureVagues();
    if (simVagues.yxSig === sig) return;   // rien n'a bougé depuis la dernière frame
    simVagues.yxSig = sig;

    simVagues.yxN = 0;
    if (simVagues.c_sim <= 0 || simVagues.canvasW <= 0) return;

    var sx       = simVagues.sourceX;
    var sy       = simVagues.sourceY;
    var max_r_top   = simVagues.canvasW - sx;
    var max_r_coupe = simVagues.canvasW - COUPE_LEFT_MARGIN;
    if (max_r_top   <= 0) max_r_top   = simVagues.canvasW;
    if (max_r_coupe <= 0) max_r_coupe = simVagues.canvasW;

    // Plage de données selon l'état :
    //  - transition : couvre la totalité du parcours (-max_r_top → +max_r_coupe)
    //  - top stable : symétrique (-max_r_top → +max_r_top)
    //  - coupe stable : 0 → max_r_coupe
    var xStart, xEnd;
    if (simVagues.transAnim) {
        xStart = -max_r_top;   xEnd = max_r_coupe;
    } else if (simVagues.viewMode === 'coupe') {
        xStart = 0;            xEnd = max_r_coupe;
    } else {
        xStart = -max_r_top;   xEnd = max_r_top;
    }

    var s = simVagues;

    // Nombre de points calé sur la résolution d'affichage du graphe, pas sur λ :
    // en mode 'both' chaque courbe n'occupe que la moitié du canvas.
    var gW = (typeof graphCanvas !== 'undefined' && graphCanvas && graphCanvas.clientWidth > 0)
        ? graphCanvas.clientWidth : s.canvasW;
    if (s.graphMode === 'both') gW *= 0.5;
    var N_PTS = Math.min(VAGUES_YX_PTS_MAX,
                Math.max(VAGUES_YX_PTS_MIN, Math.ceil(gW * VAGUES_YX_PTS_PER_PX)));

    // (Ré)allocation des tampons uniquement quand la taille change.
    if (!s.yxX || s.yxX.length < N_PTS + 1) {
        s.yxX = new Float32Array(N_PTS + 1);
        s.yxY = new Float32Array(N_PTS + 1);
    }
    var outX = s.yxX, outY = s.yxY;

    // Deux tables lues par interpolation : l'enveloppe (cf. _rebuildVaguesFieldCache,
    // reconstruite seulement quand un réglage change) et le déplacement radial de la
    // frame (cf. _vaguesRadLUT). Sans elles, chaque point coûterait une recherche
    // dichotomique dans l'historique, plusieurs milliers de fois par frame.
    // Repli sur le calcul direct si l'enveloppe n'est pas encore prête (rebuild
    // anti-rebond en attente).
    var cEnv = s.yxCacheEnv, cLen = s.yxCacheLen | 0;
    var useCache = !!cEnv && cLen > 1;
    var radD, radLast, rFrontAbs, sub;
    if (useCache) {
        radD      = _vaguesRadLUT(s.simTime);
        radLast   = radD.length - 1;
        rFrontAbs = _vaguesFrontR(s.simTime);
        sub       = s.yxCacheSub || 1;
    }

    var peakCm = 0;
    var stepX  = (xEnd - xStart) / N_PTS;
    for (var i = 0; i <= N_PTS; i++) {
        var x_px = xStart + i * stepX;
        var yCm;
        if (useCache) {
            var r = x_px < 0 ? -x_px : x_px;
            if (r > rFrontAbs) {
                yCm = 0;
            } else {
                var rs   = r * sub;
                var ridx = rs | 0;
                var fr;
                if (ridx >= cLen - 1) { ridx = cLen - 2; fr = 1; }   // borne : pas d'extrapolation
                else                  { fr = rs - ridx; }
                var en = cEnv[ridx] + (cEnv[ridx + 1] - cEnv[ridx]) * fr;
                var rs2 = r * VAGUES_RAD_SUB;
                var j0  = rs2 | 0;
                var d   = (j0 >= radLast) ? 0
                        : radD[j0] + (radD[j0 + 1] - radD[j0]) * (rs2 - j0);
                yCm = d * en * VAGUES_AMP_CM * s.amplitude;
            }
        } else {
            yCm = _waveFieldRaw(sx + x_px, sy) * VAGUES_AMP_CM;
        }
        outX[i] = x_px;
        outY[i] = yCm;
        var a = yCm < 0 ? -yCm : yCm;
        if (a > peakCm) peakCm = a;
    }
    s.yxN = N_PTS + 1;
    if (peakCm > s.peakAmpCm) s.peakAmpCm = peakCm;
}

// ══════════════════════════════════════════════════════════════════════
//  Données graphe — y(t) aux balises
// ══════════════════════════════════════════════════════════════════════

// Fenêtre affichée = 5 s. À 100 Hz cela fait 500 points pour ~300 px de large,
// déjà 1,5 point par pixel : l'ancien 300 Hz (hérité de l'onglet Son) ne servait
// qu'à alourdir la boucle et le tracé.
var VAGUES_YT_SAMPLE_DT = 1 / 100;
var VAGUES_YT_CAP       = 600;   // 100 pts/s × 5 s + marge

// Tampon circulaire (helpers génériques _cbuf* définis dans sim.js, partagés
// avec Son et Corde) : l'ancien tableau d'objets avec .shift() décalait tout
// le contenu à chaque échantillon (O(n) × 300/s). Ici l'écriture est en O(1).

// Tampon de la balise n, créé à la volée.
function _ytBuf(n) {
    var key = (n === 1) ? 'ytBuf1' : 'ytBuf2';
    if (!simVagues[key]) simVagues[key] = _cbufMake(VAGUES_YT_CAP);
    return simVagues[key];
}

function _ytClear(n) { _cbufClear(_ytBuf(n)); }
function _ytPush(buf, t, y) { _cbufPush(buf, t, y); }
function _ytIdx(buf, i) { return _cbufIdx(buf, i); }

function updateYtDataVagues(t) {
    var b1 = simVagues.beacon1.active && simVagues.beacon1.snapped;
    var b2 = simVagues.beacon2.active && simVagues.beacon2.snapped;
    if (!b1 && !b2) return;

    // Champ évalué au temps d'échantillonnage t, et non à l'instant courant
    // (identique à cordeDisplacement(x, t) dans sim.js).
    if (b1) _ytPush(_ytBuf(1), t, _waveFieldRaw(simVagues.beacon1.x, simVagues.beacon1.y, t) * VAGUES_AMP_CM);
    if (b2) _ytPush(_ytBuf(2), t, _waveFieldRaw(simVagues.beacon2.x, simVagues.beacon2.y, t) * VAGUES_AMP_CM);
}

// Déplacement d'une balise : la trace n'est pas effacée, elle est recalculée
// pour la nouvelle position (cf. _cbufRebuild dans sim.js). Le recalcul est
// différé au prochain rendu par un drapeau, pour ne le faire qu'une fois par
// frame et non à chaque pointermove.
function _ytMarkMovedVagues(n) { simVagues[(n === 1) ? 'ytDirty1' : 'ytDirty2'] = true; }

function rebuildYtDataVagues() {
    for (var n = 1; n <= 2; n++) {
        var key = (n === 1) ? 'ytDirty1' : 'ytDirty2';
        if (!simVagues[key]) continue;
        simVagues[key] = false;
        var b = (n === 1) ? simVagues.beacon1 : simVagues.beacon2;
        if (!b.active || !b.snapped) continue;
        var bx = b.x, by = b.y;
        _cbufRebuild(_ytBuf(n), function (t) {
            return _waveFieldRaw(bx, by, t) * VAGUES_AMP_CM;
        });
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Cache du décor des graphes (fond, grille, cadre, titres d'axes)
// ══════════════════════════════════════════════════════════════════════
//  Tout ce décor est invariant tant que la géométrie et les échelles ne bougent
//  pas, alors qu'il concentre les opérations canvas les plus coûteuses (fillText,
//  et surtout measureText). Il est donc rendu une fois dans un canvas hors écran,
//  puis simplement recomposé à chaque frame — seules les courbes et les marqueurs
//  de balises, qui bougent, restent dessinés directement.

var _vaguesChrome = { yx: null, yt: null };

function _chromeVagues(slot, key, W, H, drawFn) {
    var c = _vaguesChrome[slot];
    if (!c) c = _vaguesChrome[slot] = { canvas: document.createElement('canvas'), key: null, w: 0, h: 0, dpr: 0 };

    var dpr = window.devicePixelRatio || 1;
    if (c.key === key && c.w === W && c.h === H && c.dpr === dpr) return c.canvas;

    c.canvas.width  = Math.max(1, Math.round(W * dpr));
    c.canvas.height = Math.max(1, Math.round(H * dpr));
    var cx = c.canvas.getContext('2d');
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, W, H);
    drawFn(cx);

    c.key = key; c.w = W; c.h = H; c.dpr = dpr;
    return c.canvas;
}

// ══════════════════════════════════════════════════════════════════════
//  Dessin des graphes vagues — point d'entrée appelé par drawGraph()
// ══════════════════════════════════════════════════════════════════════

function drawGraphVagues(ctx, W, H) {
    ctx.fillStyle = '#faf9f6';
    ctx.fillRect(0, 0, W, H);
    var mode = simVagues.graphMode;

    if (mode === 'both') {
        var sep  = 3;
        var half = Math.floor((W - sep) / 2);
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, half, H); ctx.clip();
        _drawYxGraphVagues(ctx, half, H);
        ctx.restore();

        ctx.save();
        ctx.translate(half + sep, 0);
        ctx.beginPath(); ctx.rect(0, 0, half, H); ctx.clip();
        _drawYtGraphVagues(ctx, half, H);
        ctx.restore();

        ctx.fillStyle = '#c8c0b4';
        ctx.fillRect(half, 0, sep, H);

        _drawBothLinksVagues(ctx, W, H, half, sep);

        // ── Hover snappé en mode « both » : bascule selon la moitié survolée ──
        // (chaque fonction recalcule elle-même GM.left, pas besoin de le capturer.)
        if (graphHoverPos && !simVagues.graphCursorMode) {
            var mxBV = graphHoverPos.x, myBV = graphHoverPos.y;
            if (mxBV < half) {
                ctx.save();
                _drawSnappedHoverVagues_yx(ctx, half, H, mxBV, myBV);
                ctx.restore();
            } else if (mxBV > half + sep) {
                ctx.save();
                ctx.translate(half + sep, 0);
                _drawSnappedHoverVagues_yt(ctx, half, H, mxBV - (half + sep), myBV);
                ctx.restore();
            }
        }

    } else if (mode === 'dpx') {
        _drawYxGraphVagues(ctx, W, H);
        if (graphHoverPos && !simVagues.graphCursorMode) _drawSnappedHoverVagues_yx(ctx, W, H);
        if (simVagues.graphCursorMode && graphHoverPos)  _drawCrosshairVagues(ctx, W, H);
    } else {
        _drawYtGraphVagues(ctx, W, H);
        if (graphHoverPos && !simVagues.graphCursorMode) _drawSnappedHoverVagues_yt(ctx, W, H);
        if (simVagues.graphCursorMode && graphHoverPos)  _drawCrosshairVagues(ctx, W, H);
    }
}

// ── y(x) ──────────────────────────────────────────────────────────────

function _drawYxGraphVagues(ctx, W, H) {
    var dx = simVagues.yxX, dy = simVagues.yxY;

    var max_r_top   = simVagues.canvasW - simVagues.sourceX;
    var max_r_coupe = simVagues.canvasW - COUPE_LEFT_MARGIN;
    if (max_r_top   <= 0) max_r_top   = simVagues.canvasW;
    if (max_r_coupe <= 0) max_r_coupe = simVagues.canvasW;

    var xMin, xMax;
    var tr = simVagues.transAnim;
    if (tr) {
        // Pendant la transition : anime xMin/xMax selon la progression du
        // panoramique, lue via le même helper que le canvas (cf. _vaguesTransProgress)
        var panFrac = _vaguesTransProgress(tr).panFrac;
        xMin = -max_r_top * (1 - panFrac);
        xMax = max_r_top + (max_r_coupe - max_r_top) * panFrac;
    } else {
        var max_r_px = (simVagues.viewMode === 'coupe') ? max_r_coupe : max_r_top;
        xMin = (simVagues.viewMode !== 'coupe') ? -max_r_px : 0;
        xMax = max_r_px;
    }
    var yMax = VAGUES_AMPL_MAX * 1.12;  // échelle fixe : amplitude max slider × marge
    var yMin = -yMax;
    simVagues.graphYxYMin = yMin;
    simVagues.graphYxYMax = yMax;
    simVagues.graphYxXMin = xMin;
    simVagues.graphYxXMax = xMax;

    _updateFontSizes(ctx, W, H, yMin, yMax);
    GM.left = _calcLeftMarginRaw(ctx, yMin, yMax) + _gFontTitle + 8;

    var pW = W - GM.left - GM.right;
    var pH = H - GM.top  - GM.bottom;
    if (pW < 20 || pH < 20) return;

    function px(x_data) { return GM.left + (x_data - xMin) / (xMax - xMin) * pW; }
    function py(y_data) { return GM.top  + (1 - (y_data - yMin) / (yMax - yMin)) * pH; }

    // ── Décor (mis en cache) ──────────────────────────────────────────
    var yxTitleX = _yAxisTitleX(ctx, GM, yMin, yMax);
    var key = W + '|' + H + '|' + xMin + '|' + xMax + '|' + yMin + '|' + yMax + '|' + GM.left;
    var chrome = _chromeVagues('yx', key, W, H, function (cx) {
        cx.fillStyle = '#faf9f6';
        cx.fillRect(0, 0, W, H);
        cx.fillStyle = '#ffffff';
        cx.fillRect(GM.left, GM.top, pW, pH);

        _drawGridY(cx, yMin, yMax, px, py, pW, pH);
        // Grille X en mètres — max_r_px = xMax pour que les labels correspondent à la plage affichée
        _drawGridX_vagues(cx, xMin, xMax, px, py, pW, pH, xMax);
        _drawZeroLine(cx, yMin, yMax, px, py, pW);

        // Labels axes
        cx.fillStyle    = '#5a6a78';
        cx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
        cx.textAlign    = 'center';
        cx.textBaseline = 'bottom';
        cx.fillText('Distance depuis S (m)', GM.left + pW / 2, H - 2);

        cx.save();
        cx.translate(yxTitleX, GM.top + pH / 2);
        cx.rotate(-Math.PI / 2);
        cx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
        cx.textAlign    = 'center';
        cx.textBaseline = 'top';
        cx.fillText('y (cm)', 0, 0);
        cx.restore();
    });
    ctx.drawImage(chrome, 0, 0, W, H);

    // ── Courbe y(x) — clippée sur la zone de tracé ────────────────────
    var n = simVagues.yxN | 0;
    if (dx && dy && n > 1) {
        ctx.save();
        ctx.beginPath(); ctx.rect(GM.left, GM.top, pW, pH); ctx.clip();
        ctx.beginPath();
        ctx.moveTo(px(dx[0]), py(dy[0]));
        for (var i = 1; i < n; i++) {
            ctx.lineTo(px(dx[i]), py(dy[i]));
        }
        ctx.strokeStyle = '#1a6abf';
        ctx.lineWidth   = 2;
        ctx.stroke();
        ctx.restore();
    }

    // Marqueurs de balises (sur l'axe x, à leur distance depuis la source)
    _drawBeaconMarkerVagues(ctx, px, py, pW, pH, yMin, yMax);

    // Cadre tracé en dernier pour recouvrir les débordements de trait sur le bord
    ctx.strokeStyle = '#c8c0b4';
    ctx.lineWidth   = 1;
    ctx.strokeRect(GM.left, GM.top, pW, pH);
}

// Grille X pour vagues : distance en mètres
function _drawGridX_vagues(ctx, xMin_px, xMax_px, px, py, pW, pH, max_r_px) {
    if (C_BASE_VAGUES <= 0 || max_r_px <= 0) return;
    var m_per_px  = 1 / C_BASE_VAGUES;
    var xMin_m    = xMin_px * m_per_px;   // peut être négatif
    var xMax_m    = max_r_px * m_per_px;
    var step      = _niceStep(xMax_m, 6);
    var decimals  = step < 0.1 ? 2 : (step < 1 ? 1 : 0);

    ctx.font         = _gFontTick + 'px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    var uStart = xMin_m < 0 ? Math.ceil(xMin_m / step - 0.01) * step : 0;
    for (var u = uStart; u <= xMax_m + step * 0.01; u += step) {
        var xData = u / m_per_px;
        var xc    = px(xData);
        if (xc < GM.left - 2 || xc > GM.left + pW + 2) continue;

        ctx.strokeStyle = 'rgba(200,192,180,0.55)';
        ctx.lineWidth   = 0.8;
        ctx.beginPath();
        ctx.moveTo(xc, GM.top);
        ctx.lineTo(xc, GM.top + pH);
        ctx.stroke();

        ctx.fillStyle = '#7a8a96';
        ctx.fillText(fmtFR(u, decimals), xc, GM.top + pH + 4);
    }
}

// Marqueurs de balises sur le graphe y(x)
function _drawBeaconMarkerVagues(ctx, px, py, pW, pH, yMin, yMax) {
    var sx = simVagues.sourceX, sy = simVagues.sourceY;
    var specs = [
        { b: simVagues.beacon1, color: '#e07020', label: 'B1' },
        { b: simVagues.beacon2, color: '#2a8a50', label: 'B2' }
    ];
    for (var i = 0; i < specs.length; i++) {
        var s = specs[i];
        if (!s.b.active || !s.b.snapped) continue;
        // distance du beacon à la source projetée sur l'axe horizontal
        var bx_dist = s.b.x - sx; // peut être négatif
        // En vue du dessus, les balises à gauche de la source sont valides
        if (bx_dist < 0 && simVagues.viewMode !== 'top') continue;
        var xBeacon = px(bx_dist);
        if (xBeacon < GM.left - 1 || xBeacon > GM.left + pW + 1) continue;
        _drawBeaconMarker(ctx, xBeacon, py, yMin, yMax, s.color, s.label, pH,
                          _waveFieldRaw(s.b.x, s.b.y) * VAGUES_AMP_CM);
    }
}

// ── y(t) ──────────────────────────────────────────────────────────────

function _drawYtGraphVagues(ctx, W, H) {
    var d1   = _ytBuf(1);
    var d2   = _ytBuf(2);
    var b1ok = simVagues.beacon1.active && simVagues.beacon1.snapped;
    var b2ok = simVagues.beacon2.active && simVagues.beacon2.snapped;
    var hasData = b1ok || b2ok;

    if (!hasData) {
        var msg    = 'Activer une balise et la positionner sur l\'axe x pour visualiser le graphe';
        var fSize  = Math.round(W * 0.025 + 10);
        ctx.fillStyle    = '#7a8a96';
        ctx.font         = 'italic ' + fSize + 'px "Segoe UI", Arial, sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        if (ctx.measureText(msg).width <= W - 16) {
            ctx.fillText(msg, W / 2, H / 2);
        } else {
            // Coupe au mot le plus proche du milieu pour tenir sur 2 lignes
            var words  = msg.split(' ');
            var line1  = '', line2  = '', mid = Math.floor(words.length / 2);
            // Cherche la coupure qui équilibre les deux lignes
            for (var cut = mid; cut < words.length; cut++) {
                var l1 = words.slice(0, cut).join(' ');
                var l2 = words.slice(cut).join(' ');
                if (ctx.measureText(l1).width <= W - 16) { line1 = l1; line2 = l2; break; }
            }
            if (!line1) { line1 = words.slice(0, mid).join(' '); line2 = words.slice(mid).join(' '); }
            var gap = fSize * 1.4;
            ctx.fillText(line1, W / 2, H / 2 - gap / 2);
            ctx.fillText(line2, W / 2, H / 2 + gap / 2);
        }
        return;
    }

    // ── Fenêtre glissante de 5 s : l'axe (graduations comprises) avance en
    // continu avec simTime — la source Vagues émet en continu dès simTime=0
    // (pas de bouton d'activation séparé comme sur Corde/Son), donc l'origine
    // de la fenêtre est simplement l'origine de simTime (remise à 0 au RAZ).
    var tNow    = simVagues.simTime;
    var origin  = 0;
    var elapsed = tNow;
    var xMin = Math.max(0, elapsed - 5);
    var xMax = xMin + 5;
    simVagues.graphView.xMin = xMin;
    simVagues.graphView.xMax = xMax;
    simVagues.graphView.tOrigin = origin;
    var yMax = VAGUES_AMPL_MAX * 1.12;
    var yMin = -yMax;
    simVagues.graphView.yMin = yMin;
    simVagues.graphView.yMax = yMax;

    _updateFontSizes(ctx, W, H, yMin, yMax);
    GM.left = _calcLeftMarginRaw(ctx, yMin, yMax) + _gFontTitle + 8;

    var pW = W - GM.left - GM.right;
    var pH = H - GM.top  - GM.bottom;
    if (pW < 20 || pH < 20) return;

    function px(x_data) { return GM.left + (x_data - xMin) / (xMax - xMin) * pW; }
    function py(y_data) { return GM.top  + (1 - (y_data - yMin) / (yMax - yMin)) * pH; }

    // ── Décor (mis en cache) ──────────────────────────────────────────
    var ytTitleX = _yAxisTitleX(ctx, GM, yMin, yMax);
    var key = W + '|' + H + '|' + yMin + '|' + yMax + '|' + GM.left;
    var chrome = _chromeVagues('yt', key, W, H, function (cx) {
        cx.fillStyle = '#faf9f6';
        cx.fillRect(0, 0, W, H);
        cx.fillStyle = '#ffffff';
        cx.fillRect(GM.left, GM.top, pW, pH);

        _drawGridY(cx, yMin, yMax, px, py, pW, pH);
        _drawZeroLine(cx, yMin, yMax, px, py, pW);

        cx.fillStyle    = '#5a6a78';
        cx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
        cx.textAlign    = 'center';
        cx.textBaseline = 'bottom';
        cx.fillText('Temps (s)', GM.left + pW / 2, H - 2);

        cx.save();
        cx.translate(ytTitleX, GM.top + pH / 2);
        cx.rotate(-Math.PI / 2);
        cx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
        cx.textAlign    = 'center';
        cx.textBaseline = 'top';
        cx.fillText('y (cm)', 0, 0);
        cx.restore();
    });
    ctx.drawImage(chrome, 0, 0, W, H);

    // ── Grille X (glissante, redessinée chaque frame) ──────────────────
    _drawGridX_dpt(ctx, xMin, xMax, px, py, pW, pH);

    // ── Courbes ───────────────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(GM.left, GM.top, pW, pH);
    ctx.clip();

    // Point "vivant" ajouté en tête de chaque courbe : sans lui, la pointe du tracé
    // n'avance qu'au rythme des échantillons enregistrés (VAGUES_YT_SAMPLE_DT), ce
    // qui saute visiblement en ralenti (le temps simulé progresse alors moins vite
    // que le temps réel entre deux frames, donc plusieurs frames s'écoulent sans
    // nouvel échantillon avant que la pointe ne bondisse). Calculé à la volée,
    // indépendamment de la fréquence de stockage.
    if (b1ok && d1.n > 1)
        _drawSeriesVagues(ctx, d1, px, py, '#e07020', 2, xMin, xMax, origin, tNow, _waveFieldRaw(simVagues.beacon1.x, simVagues.beacon1.y) * VAGUES_AMP_CM);
    if (b2ok && d2.n > 1)
        _drawSeriesVagues(ctx, d2, px, py, '#2a8a50', 2, xMin, xMax, origin, tNow, _waveFieldRaw(simVagues.beacon2.x, simVagues.beacon2.y) * VAGUES_AMP_CM);

    ctx.restore();

    ctx.strokeStyle = '#c8c0b4';
    ctx.lineWidth   = 1;
    ctx.strokeRect(GM.left, GM.top, pW, pH);

    _drawLegendVagues(ctx, W, pH);
}

function _drawSeriesVagues(ctx, buf, px, py, color, lw, xMin, xMax, origin, liveT, liveY) {
    ctx.beginPath();
    var started = false;
    for (var i = 0; i < buf.n; i++) {
        var j = _ytIdx(buf, i);
        var t = buf.t[j] - origin;   // origin = 0 (source Vagues toujours active depuis simTime=0)
        if (t < xMin || t > xMax) { started = false; continue; }
        var cx = px(t);
        var cy = py(buf.y[j]);
        if (!started) { ctx.moveTo(cx, cy); started = true; }
        else          { ctx.lineTo(cx, cy); }
    }
    // Extension "vivante" jusqu'à l'instant présent (cf. appelant).
    if (liveT !== undefined) {
        var tLive = liveT - origin;
        if (started && tLive >= xMin && tLive <= xMax) {
            ctx.lineTo(px(tLive), py(liveY));
        }
    }
    ctx.strokeStyle = color;
    ctx.lineWidth   = lw;
    ctx.stroke();
}

function _drawLegendVagues(ctx, W, pH) {
    // Taille alignée sur les graduations, comme le reste du graphe : une valeur
    // en dur ne suivait pas la mise à l'échelle responsive du canvas.
    var fs = _gFontTick;
    var x  = GM.left + 8, y = GM.top + fs * 0.9;
    ctx.font         = 'bold ' + fs + 'px monospace';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    if (simVagues.beacon1.active && simVagues.beacon1.snapped) {
        ctx.fillStyle = '#e07020';
        ctx.fillRect(x, y - fs * 0.4, fs * 1.3, 3);
        ctx.fillText('Balise 1', x + fs * 1.3 + 5, y);
        y += fs + 6;
    }
    if (simVagues.beacon2.active && simVagues.beacon2.snapped) {
        ctx.fillStyle = '#2a8a50';
        ctx.fillRect(x, y - fs * 0.4, fs * 1.3, 3);
        ctx.fillText('Balise 2', x + fs * 1.3 + 5, y);
    }
}

// ── Mode simultané — liaisons ─────────────────────────────────────────

function _drawBothLinksVagues(ctx, W, H, half, sep) {
    // Échelle Y identique aux deux graphes
    var yMax = VAGUES_AMPL_MAX * 1.12, yMin = -yMax;
    var pH   = H - GM.top - GM.bottom;
    var pW_l = half - GM.left - GM.right;
    var pW_r = half - GM.left - GM.right;
    if (pH <= 0 || pW_l <= 0 || pW_r <= 0) return;

    function py(v) { return GM.top + (1 - (v - yMin) / (yMax - yMin)) * pH; }

    // Plage X du graphe y(x) — même logique que _drawYxGraphVagues
    var max_r_top   = simVagues.canvasW - simVagues.sourceX;
    var max_r_coupe = simVagues.canvasW - COUPE_LEFT_MARGIN;
    if (max_r_top   <= 0) max_r_top   = simVagues.canvasW;
    if (max_r_coupe <= 0) max_r_coupe = simVagues.canvasW;
    var xMin_yx, xMax_yx;
    if (simVagues.viewMode === 'coupe') {
        xMin_yx = 0; xMax_yx = max_r_coupe;
    } else {
        xMin_yx = -max_r_top; xMax_yx = max_r_top;
    }

    var specs = [
        { b: simVagues.beacon1, color: '#e07020' },
        { b: simVagues.beacon2, color: '#2a8a50' }
    ];
    for (var i = 0; i < specs.length; i++) {
        var s = specs[i];
        if (!s.b.active || !s.b.snapped) continue;

        // Valeur y courante — même formule que les courbes des deux graphes
        var yVal = _waveFieldRaw(s.b.x, s.b.y) * VAGUES_AMP_CM;
        var yc   = py(yVal);
        if (yc < GM.top || yc > GM.top + pH) continue;

        // Point sur y(x) : position de la balise le long de l'axe x
        var bx_dist = s.b.x - simVagues.sourceX;
        var xDpx = GM.left + (bx_dist - xMin_yx) / (xMax_yx - xMin_yx) * pW_l;
        if (xDpx < GM.left || xDpx > GM.left + pW_l) continue;

        // Point sur y(t) : position du curseur temporel dans la fenêtre glissante de 5 s
        var WINDOW   = 5;
        var tOrigin  = Math.max(0, simVagues.simTime - WINDOW);
        var tLocal   = Math.max(0, Math.min(WINDOW, simVagues.simTime - tOrigin));
        var xDpt     = (half + sep) + GM.left + (tLocal / WINDOW) * pW_r;

        ctx.save();
        ctx.strokeStyle = s.color;
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(xDpx, yc);
        ctx.lineTo(xDpt, yc);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;
        ctx.fillStyle   = s.color;
        ctx.beginPath();
        ctx.arc(xDpx, yc, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(xDpt, yc, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ── Hover snappé y(x) ────────────────────────────────────────────────

function _drawSnappedHoverVagues_yx(ctx, W, H, mxOverride, myOverride) {
    if (!graphHoverPos) return;
    var dx = simVagues.yxX, dy = simVagues.yxY, dn = simVagues.yxN | 0;
    if (!dx || dn < 2) return;

    ctx.save();
    _updateFontSizes(ctx, W, H, simVagues.graphYxYMin, simVagues.graphYxYMax);
    GM.left = _calcLeftMarginRaw(ctx, simVagues.graphYxYMin, simVagues.graphYxYMax) + _gFontTitle + 8;
    var pW = W - GM.left - GM.right, pH = H - GM.top - GM.bottom;
    if (pW < 10 || pH < 10) { ctx.restore(); return; }

    var yMin = simVagues.graphYxYMin, yMax = simVagues.graphYxYMax;
    var xMin = simVagues.graphYxXMin || 0, xMax = simVagues.graphYxXMax || 1;
    function px(v) { return GM.left + (v - xMin) / (xMax - xMin) * pW; }
    function py(v) { return GM.top  + (1 - (v - yMin) / (yMax - yMin)) * pH; }

    // En mode « both », l'appelant fournit mx/my déjà exprimés dans le repère
    // local du panneau (translaté) — sinon on retombe sur la position brute.
    var mx = (mxOverride !== undefined) ? mxOverride : graphHoverPos.x;
    var my = (myOverride !== undefined) ? myOverride : graphHoverPos.y;
    var bestI = -1, bestDist = Infinity;
    for (var i = 0; i < dn; i++) {
        var bx = px(dx[i]), by = py(dy[i]);
        var byc = Math.max(GM.top, Math.min(GM.top + pH, by));
        var d   = (bx - mx) * (bx - mx) + (byc - my) * (byc - my);
        if (d < bestDist) { bestDist = d; bestI = i; }
    }
    if (bestI < 0) { ctx.restore(); return; }
    var bestX = dx[bestI], bestY = dy[bestI];

    var bxc  = px(bestX);
    var byc2 = Math.max(GM.top, Math.min(GM.top + pH, py(bestY)));
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(60,60,60,0.45)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(bxc, byc2); ctx.lineTo(bxc, GM.top + pH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bxc, byc2); ctx.lineTo(GM.left, byc2);    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#1a6abf';
    ctx.beginPath();
    ctx.arc(bxc, byc2, 5, 0, Math.PI * 2);
    ctx.fill();

    var m_per_px = 1 / C_BASE_VAGUES;
    var dM = fmtFR(bestX * m_per_px, 2);
    var label = '(' + dM + ' m, y = ' + fmtFR(bestY, 2) + ')';
    ctx.font         = _gFontHover + 'px monospace';
    ctx.fillStyle    = '#1a6abf';
    ctx.textBaseline = 'bottom';
    ctx.textAlign    = 'left';
    var lw = ctx.measureText(label).width;
    var lx = (bxc + 10 + lw > GM.left + pW) ? bxc - 10 - lw : bxc + 10;
    var ly = (byc2 - 8 < GM.top + 28)        ? byc2 + 32      : byc2 - 8;
    ctx.fillText(label, lx, ly);
    ctx.restore();
}

// ── Hover snappé y(t) ────────────────────────────────────────────────

function _drawSnappedHoverVagues_yt(ctx, W, H, mxOverride, myOverride) {
    if (!graphHoverPos) return;
    ctx.save();
    var yMax = VAGUES_AMPL_MAX * 1.12, yMin = -yMax;
    _updateFontSizes(ctx, W, H, yMin, yMax);
    GM.left = _calcLeftMarginRaw(ctx, yMin, yMax) + _gFontTitle + 8;
    var pW = W - GM.left - GM.right, pH = H - GM.top - GM.bottom;
    if (pW < 10 || pH < 10) { ctx.restore(); return; }

    // xMin/xMax en simTime, cf. simVagues.graphView mis à jour par
    // _drawYtGraphVagues (fenêtre glissante de 5 s).
    var xMin   = simVagues.graphView.xMin, xMax = simVagues.graphView.xMax;
    var origin = simVagues.graphView.tOrigin || 0;
    function px(v) { return GM.left + (v - xMin) / (xMax - xMin) * pW; }
    function py(v) { return GM.top  + (1 - (v - yMin) / (yMax - yMin)) * pH; }

    // En mode « both », l'appelant fournit mx/my déjà exprimés dans le repère
    // local du panneau (translaté) — sinon on retombe sur la position brute.
    var mx = (mxOverride !== undefined) ? mxOverride : graphHoverPos.x;
    var my = (myOverride !== undefined) ? myOverride : graphHoverPos.y;
    var series = [];
    if (simVagues.beacon1.active && simVagues.beacon1.snapped && _ytBuf(1).n > 1)
        series.push({ buf: _ytBuf(1), color: '#e07020' });
    if (simVagues.beacon2.active && simVagues.beacon2.snapped && _ytBuf(2).n > 1)
        series.push({ buf: _ytBuf(2), color: '#2a8a50' });

    var winner = null, winnerColor = null, winnerDist = Infinity;
    for (var s = 0; s < series.length; s++) {
        var buf = series[s].buf;
        for (var i = 0; i < buf.n; i++) {
            var j = _ytIdx(buf, i);
            var t = buf.t[j] - origin;
            if (t < xMin || t > xMax) continue;
            var yVal = buf.y[j];
            var bx   = px(t), by = py(yVal);
            var byc  = Math.max(GM.top, Math.min(GM.top + pH, by));
            var d    = (bx - mx) * (bx - mx) + (byc - my) * (byc - my);
            if (d < winnerDist) { winnerDist = d; winner = { t: t, y: yVal }; winnerColor = series[s].color; }
        }
    }
    if (!winner) { ctx.restore(); return; }

    var bx2  = px(winner.t);
    var byc2 = Math.max(GM.top, Math.min(GM.top + pH, py(winner.y)));
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(60,60,60,0.45)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(bx2, byc2); ctx.lineTo(bx2, GM.top + pH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx2, byc2); ctx.lineTo(GM.left, byc2);    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = winnerColor;
    ctx.beginPath();
    ctx.arc(bx2, byc2, 5, 0, Math.PI * 2);
    ctx.fill();
    var label = '(' + fmtFR(winner.t, 2) + ' s, y = ' + fmtFR(winner.y, 2) + ')';
    ctx.font         = _gFontHover + 'px monospace';
    ctx.fillStyle    = winnerColor;
    ctx.textBaseline = 'bottom';
    ctx.textAlign    = 'left';
    var lw2 = ctx.measureText(label).width;
    var lx  = (bx2 + 10 + lw2 > GM.left + pW) ? bx2 - 10 - lw2 : bx2 + 10;
    var ly  = (byc2 - 8 < GM.top + 28) ? byc2 + 32 : byc2 - 8;
    ctx.fillText(label, lx, ly);
    ctx.restore();
}

// ── Réticule ──────────────────────────────────────────────────────────

function _drawCrosshairVagues(ctx, W, H) {
    if (!graphHoverPos) return;
    var mx = graphHoverPos.x, my = graphHoverPos.y;
    var pW = W - GM.left - GM.right, pH = H - GM.top - GM.bottom;
    ctx.save();
    ctx.strokeStyle = '#1a6abf';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 3]);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(mx, GM.top); ctx.lineTo(mx, GM.top + pH);
    ctx.moveTo(GM.left, my); ctx.lineTo(GM.left + pW, my);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════
//  Remise à zéro
// ══════════════════════════════════════════════════════════════════════

function resetVagues() {
    simVagues.simTime         = 0;
    simVagues.paused          = false;
    simVagues.transAnim       = null;
    // L'onde en vol vit désormais dans l'historique : c'est lui qu'il faut vider
    // pour la faire disparaître. La phase repart de 0 pour que la source réémette
    // à l'identique.
    _srcClear(simVagues);
    simVagues.sinPhase           = 0;
    simVagues.vaguesEnv          = 0;
    simVagues.vaguesEmitMode     = null;
    simVagues.impulses           = [];
    simVagues.impulsePropagating = false;
    simVagues.sourceActiveUntil  = 0;
    simVagues._radSig            = null;
    lastSrcUpdateVagues          = 0;
    _ytClear(1);
    _ytClear(2);
    // Horloge d'échantillonnage y(t) : sans ce recalage, simTime repart de 0 alors
    // que lastYtUpdateV reste à la valeur atteinte avant le reset — plus aucun
    // échantillon n'était enregistré tant que le temps n'avait pas rattrapé.
    lastYtUpdateV            = 0;
    simVagues.yxN            = 0;
    simVagues.yxSig          = null;
    simVagues.graphView      = { xMin: 0, xMax: 5, yMin: -1, yMax: 1 };
    simVagues.graphYxYMin = -0.1;
    simVagues.graphYxYMax =  0.1;
    simVagues.peakAmpCm   =  0.1;
    // Le chronomètre mesure le temps de simulation : remettre celle-ci à zéro
    // sans l'arrêter laisserait une durée qui ne correspond plus à rien.
    // (Défini dans ui.js, chargé après : d'où le garde.)
    if (typeof resetChrono === 'function') resetChrono('vagues');
    updateCeleriteVagues();
}

// ══════════════════════════════════════════════════════════════════════
//  Balises vagues
// ══════════════════════════════════════════════════════════════════════

function _toggleBeaconVagues(n) {
    var beacon = (n === 1) ? simVagues.beacon1 : simVagues.beacon2;
    var btn    = document.getElementById('btn-beacon' + n);
    beacon.active = !beacon.active;
    if (beacon.active) {
        // Position initiale sur l'axe horizontal
        var sx = simVagues.sourceX, sy = simVagues.sourceY;
        var W  = simVagues.canvasW;
        beacon.x = Math.round(sx + (W - sx) * (n === 1 ? 0.30 : 0.55));
        beacon.y = sy;
        beacon.rx = beacon.x / W;
        beacon.ry = beacon.y / simVagues.canvasH;
        beacon.snapped = true;
        if (btn) btn.classList.add('active');
    } else {
        beacon.snapped = false;
        if (btn) btn.classList.remove('active');
        _ytClear(n);
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Handlers UI (sliders, boutons)
// ══════════════════════════════════════════════════════════════════════

function togglePauseVagues() {
    simVagues.paused = !simVagues.paused;
    var btn = document.getElementById('btn-playpause-vagues');
    if (!btn) return;
    if (simVagues.paused) { btn.textContent = '▶ Reprendre'; btn.className = 'btn btn-play'; }
    else                  { btn.textContent = '⏸ Pause';     btn.className = 'btn btn-pause'; }
}

function resetSimAnimVagues() {
    resetVagues();
    var btn = document.getElementById('btn-playpause-vagues');
    if (btn) { btn.textContent = '⏸ Pause'; btn.className = 'btn btn-pause'; }
}

function onSliderFreqVagues(v) {
    simVagues.freq = parseFloat(v);
    var lbl = document.getElementById('lbl-freq-vagues');
    if (lbl) lbl.textContent = simVagues.freq.toFixed(1).replace('.', ',');
    _scheduleVaguesRebuild();
}

function onSliderAmplVagues(v) {
    simVagues.amplitude = parseFloat(v);
    var lbl = document.getElementById('lbl-ampl-vagues');
    if (lbl) lbl.textContent = simVagues.amplitude.toFixed(1).replace('.', ',');
    simVagues.peakAmpCm = 0.1;  // reset auto-scale pour recaler l'axe Y
}

function onSliderGVagues(v) {
    var g = parseFloat(v);
    // "Cran" magnétique autour de g=9,81 m/s² (valeur terrestre usuelle) — permet de s'y
    // recaler facilement malgré le pas du slider (0,1) qui ne tombe pas dessus exactement.
    var slider = document.getElementById('sl-g-vagues');
    if (Math.abs(g - 9.81) < 0.15) {
        g = 9.81;
        if (slider) slider.value = g;
    }
    simVagues.g = g;
    var lbl = document.getElementById('lbl-g-vagues');
    if (lbl) lbl.textContent = simVagues.g.toFixed(2).replace('.', ',');
    updateCeleriteVagues();
    _updateCReadoutVagues();
    _scheduleVaguesRebuild();
}

function onSliderHVagues(v) {
    simVagues.h = parseFloat(v);
    var lbl = document.getElementById('lbl-h-vagues');
    if (lbl) lbl.textContent = (simVagues.h * 1000).toFixed(1).replace('.', ',');
    updateCeleriteVagues();
    _updateCReadoutVagues();
    _scheduleVaguesRebuild();
}

function onSliderAttenVagues(v) {
    simVagues.attenuation = parseFloat(v);
    var lbl = document.getElementById('lbl-atten-vagues');
    if (lbl) lbl.textContent = simVagues.attenuation.toFixed(2).replace('.', ',');
    _scheduleVaguesRebuild();
}

function onSliderSpeedVagues(v) {
    var idx = parseInt(v, 10);
    simVagues.speedFactor = [0.10, 0.25, 0.50, 1.00][idx] || 1.0;
    var lbl = document.getElementById('lbl-speed-vagues');
    if (lbl) lbl.textContent = simVagues.speedFactor.toFixed(2).replace('.', ',');
}

function toggleGeoAttenVagues() {
    simVagues.geoAttenuation = !simVagues.geoAttenuation;
    var btn = document.getElementById('btn-geo-atten-vagues');
    if (btn) btn.classList.toggle('active', simVagues.geoAttenuation);
    _scheduleVaguesRebuild();
}

function toggleWavePropsVagues() {
    simVagues.wavePropsVisible = !simVagues.wavePropsVisible;
    _applyWavePropsVagues();
}

function _applyWavePropsVagues() {
    var btn      = document.getElementById('btn-wave-props-vagues');
    var simple   = document.getElementById('readout-simple-vagues');
    var extended = document.getElementById('readout-props-vagues');
    if (simVagues.wavePropsVisible) {
        if (btn)      btn.classList.add('active');
        if (simple)   simple.style.display = 'none';
        if (extended) extended.style.display = '';
        _updateWavePropsVagues();
    } else {
        if (btn)      btn.classList.remove('active');
        if (simple)   simple.style.display = '';
        if (extended) extended.style.display = 'none';
    }
}

function _updateCReadoutVagues() {
    var el = document.getElementById('ro-c-vagues');
    if (el) el.textContent = (simVagues.c_ms * 100).toFixed(1).replace('.', ',');
}

function _updateWavePropsVagues() {
    if (!simVagues.wavePropsVisible) return;
    var elC = document.getElementById('ro-c-ext-vagues');
    if (elC) elC.textContent = (simVagues.c_ms * 100).toFixed(1).replace('.', ',');
    var f = simVagues.freq;
    var T = (f > 0) ? 1 / f : 0;
    var elF = document.getElementById('ro-f-vagues');
    var elT = document.getElementById('ro-T-vagues');
    if (elF) elF.textContent = f.toFixed(2).replace('.', ',');
    if (elT) elT.textContent = T.toFixed(3).replace('.', ',');
    var lambda = simVagues.c_ms * T;
    var elL    = document.getElementById('ro-lambda-vagues');
    if (elL) elL.textContent = (lambda * 100).toFixed(1).replace('.', ',');
}

// ══════════════════════════════════════════════════════════════════════
//  Toggle vue en coupe
// ══════════════════════════════════════════════════════════════════════

function toggleViewVagues() {
    if (simVagues.transAnim) return;
    var toCoupe   = (simVagues.viewMode === 'top');
    if (toCoupe) {
        // Désactiver les balises qui ne seront pas visibles en vue coupe (hors axe x>0)
        var sx = simVagues.sourceX;
        var bSpecs = [
            { b: simVagues.beacon1, n: 1 },
            { b: simVagues.beacon2, n: 2 }
        ];
        for (var bi = 0; bi < bSpecs.length; bi++) {
            var bs = bSpecs[bi];
            if (bs.b.active && !(bs.b.snapped && bs.b.x > sx)) {
                bs.b.active  = false;
                bs.b.snapped = false;
                var bBtn = document.getElementById('btn-beacon' + bs.n);
                if (bBtn) bBtn.classList.remove('active');
                _ytClear(bs.n);
            }
        }
    }
    var wasPaused = simVagues.paused;
    simVagues.paused = true; // gel de la simulation pendant la transition
    simVagues.transAnim = {
        startT    : performance.now(),
        direction : toCoupe ? 'toCoupe' : 'toTop',
        wasPaused : wasPaused
    };
    var btn = document.getElementById('btn-view-coupe-vagues');
    if (btn) {
        btn.classList.toggle('active', toCoupe);
        btn.textContent = toCoupe ? 'Vue du dessus' : 'Vue en coupe';
    }
    // transAnim vient d'être posé : la bande disparaît le temps de la
    // transition, et sera rétablie (ou non) à son terme.
    syncBtnOrbitesVagues();
}

// ══════════════════════════════════════════════════════════════════════
//  Bouton « Trajectoire des molécules d'eau »
// ══════════════════════════════════════════════════════════════════════
//  Même dispositif que le bouton « Décomposer » de la page diffraction :
//  une seconde bande, posée sous #tube-top-btns, qui n'existe à l'écran
//  que dans la configuration où l'option a un sens — onglet Vagues, vue en
//  coupe, transition terminée (pendant la rotation, la scène n'est pas
//  encore une coupe et _drawOrbitesCoupeVagues n'est pas appelée).

function syncBtnOrbitesVagues() {
    var bar = document.getElementById('orbites-btns');
    if (!bar) return;

    var show = (typeof activeTab !== 'undefined') && activeTab === 'vagues' &&
               simVagues.viewMode === 'coupe' && !simVagues.transAnim;
    bar.classList.toggle('visible', show);
    if (!show) return;

    // Décalage vertical MESURÉ plutôt que codé en dur : la hauteur de la bande
    // du dessus suit les clamp() de .btn-tube-top et change avec la fenêtre.
    var top = document.getElementById('tube-top-btns');
    if (top && top.offsetHeight > 0) bar.style.top = (6 + top.offsetHeight + 4) + 'px';

    var btn = document.getElementById('btn-orbites-vagues');
    if (btn) btn.classList.toggle('active', simVagues.showOrbits);
}

function toggleOrbitesVagues() {
    simVagues.showOrbits = !simVagues.showOrbits;
    syncBtnOrbitesVagues();
}

// ══════════════════════════════════════════════════════════════════════
//  Animation de transition — 2 phases
//
//  toCoupe (total = VAGUES_TRANS_ROT + VAGUES_TRANS_SLIDE) :
//    Phase 1 — Rotation 3D (theta 0 → π/2), panOffset = 0. À mi-course,
//              l'onde s'estompe hors du plan de coupe (cf. « focus » dans
//              _render3DWaveView) : elle se réduit visiblement à sa coupe.
//    Phase 2 — Panoramique horizontal (theta = π/2, pan 0 → MAX_PAN)
//              Toute la scène glisse vers la gauche ; le bandeau sombre de
//              la source arrive par la gauche comme un rideau.
//  toTop : les mêmes phases dans l'ordre inverse.
//
//  Il n'y a PAS de fondu croisé final : _render3DWaveView converge
//  exactement vers _drawVaguesCoupe (mêmes formules d'atténuation, mêmes
//  dégradés, mêmes décors), la bascule de viewMode est donc invisible.
//  C'est ce qui permet de tenir en ~1,3 s au lieu de 2,7 s.
// ══════════════════════════════════════════════════════════════════════

function _drawVaguesTransition(ctx, W, H, PW, PH, dpr) {
    var tr = simVagues.transAnim;
    var pr = _vaguesTransProgress(tr);

    // Nettoyage CSS résiduel
    var canvas = document.getElementById('tube-canvas');
    var wrap   = document.getElementById('tube-canvas-wrap');
    canvas.style.transform       = '';
    canvas.style.transformOrigin = '';
    wrap.style.perspective       = '';
    wrap.style.background        = '';

    if (pr.done) {
        simVagues.transAnim = null;
        simVagues._buf3D    = null;   // ~8 Mo de tampons pleine résolution : rendus au GC
        simVagues.viewMode  = (tr.direction === 'toCoupe') ? 'coupe' : 'top';
        simVagues.coupeSrcX = COUPE_LEFT_MARGIN;
        if (!tr.wasPaused) simVagues.paused = false;
        syncBtnOrbitesVagues();
        return;
    }

    var pan = _vaguesMaxPan() * pr.panFrac;
    // Tenir coupeSrcX à jour pendant la transition : les hit-tests souris
    // (flèche λ) y lisent l'abscisse écran de la source.
    simVagues.coupeSrcX = simVagues.sourceX - pan;

    _render3DWaveView(ctx, W, H, pr.theta, pan, PW, PH, dpr);
}

// ── Rendu perspectif orthographique de la surface d'eau ───────────────
//   theta = 0   → vue de dessus (identique au rendu normal)
//   theta = π/2 → vue de profil (côté) : identique à la vue en coupe
//
// Algorithme du peintre : on itère les bandes z de l'arrière vers l'avant.
// Projection : screen_y = yLevel + (wz − srcY)·cos(θ) − wy·sin(θ)
//   À θ=0 : screen_y = wz  (la profondeur z devient la coordonnée y écran)
//   À θ=π/2 : screen_y = yLevel − wy  (la hauteur de l'onde devient y écran)
//
// Deux paramètres de fondu pilotent tous les décors, et c'est ce qui rend
// les deux raccords (départ et arrivée) invisibles :
//   sinT      (rotation)     → ciel, dégradé d'eau, écume, fond marin,
//                              labels Air/Eau, élévation de la flèche λ,
//                              style des balises
//   bandAlpha (panoramique)  → bandeau/tige de source, repli de l'axe et
//                              des graduations vers le demi-axe x > 0
function _render3DWaveView(ctx, W, H, theta, panOffset, PW, PH, dpr) {
    panOffset = (panOffset | 0) || 0;
    var cosT = Math.cos(theta);
    var sinT = Math.sin(theta);

    var srcX     = simVagues.sourceX;
    var srcY     = simVagues.sourceY;  // = round(H/2)
    var yLevel   = Math.round(H / 2);  // même repère que _drawVaguesCoupe
    var srcXs    = srcX - panOffset;   // abscisse écran de la source (px CSS)
    var c        = simVagues.c_sim;
    var t        = simVagues.simTime;
    var ampPx    = _coupeAmpPx(H);
    var maxR     = Math.sqrt(W * W + H * H);
    var a5       = simVagues.attenuation * 5;
    var geo      = simVagues.geoAttenuation;
    var radD     = _vaguesRadLUT(t);
    var r_front  = _vaguesFrontR(t);
    var rfSq     = r_front * r_front;

    var maxPan    = _vaguesMaxPan();
    // panOffset porte déjà l'adoucissement du panoramique : pas de second ease ici.
    var bandAlpha = maxPan > 0 ? Math.min(1, panOffset / maxPan) : sinT;

    // ── Tampons réutilisés d'une frame à l'autre ──────────────────────
    // (l'animation dure ~1,3 s à 60 fps : réallouer un ImageData pleine
    //  résolution physique à chaque frame mettait le GC sous pression)
    var buf = simVagues._buf3D;
    if (!buf || buf.PW !== PW || buf.PH !== PH) {
        buf = simVagues._buf3D = {
            PW      : PW,
            PH      : PH,
            imgData : ctx.createImageData(PW, PH),
            prevSy  : new Int16Array(PW),
            sky     : new Uint8Array(PH * 3),   // couleur ciel de la coupe, par ligne
            water   : new Uint8Array(PH * 3),   // couleur d'eau de la coupe, par ligne
            bg      : new Uint8Array(PH * 3)    // fond effectivement peint, par ligne
        };
    }
    var imgData = buf.imgData;
    var data    = imgData.data;

    // ── Tables de couleurs de la vue en coupe, ligne par ligne ────────
    // Reproduisent exactement les deux dégradés de _drawVaguesCoupe, pour
    // pouvoir les interpoler pixel par pixel avec le rendu vue du dessus.
    _fillCoupeColorLUTs(buf, H, PH, dpr, yLevel, ampPx);
    var skyLUT = buf.sky, waterLUT = buf.water, bgLUT = buf.bg;

    // ── Fond : COL_BG (vue dessus) → ciel de la coupe ─────────────────
    // Mémorisé ligne par ligne : c'est aussi la couleur vers laquelle
    // s'estompent les bandes hors du plan de coupe (cf. « focus » ci-dessous).
    for (var py0 = 0; py0 < PH; py0++) {
        var k3 = py0 * 3;
        var br = (COL_BG_R + (skyLUT[k3]     - COL_BG_R) * sinT) | 0;
        var bg = (COL_BG_G + (skyLUT[k3 + 1] - COL_BG_G) * sinT) | 0;
        var bb = (COL_BG_B + (skyLUT[k3 + 2] - COL_BG_B) * sinT) | 0;
        bgLUT[k3] = br; bgLUT[k3 + 1] = bg; bgLUT[k3 + 2] = bb;
        for (var pxb = 0, ib = py0 * PW * 4; pxb < PW; pxb++, ib += 4) {
            data[ib] = br; data[ib + 1] = bg; data[ib + 2] = bb; data[ib + 3] = 255;
        }
    }

    if (c <= 0) { ctx.putImageData(imgData, 0, 0); return; }

    // Position écran (physique) de la première bande (wz = 0, wy = 0)
    var sy0 = Math.round((yLevel + (0 - srcY) * cosT) * dpr);

    var prevSyArr = buf.prevSy;
    for (var px = 0; px < PW; px++) prevSyArr[px] = sy0;

    var N_Z = 110; // bandes z — ~27 échantillons par longueur d'onde à λ≈100 px

    // ── Mise au point sur le plan de coupe ────────────────────────────
    // À mi-rotation, l'empilement des bandes z ne donnait qu'une silhouette
    // d'enveloppe, illisible. On estompe donc les bandes vers le fond à
    // mesure qu'elles s'éloignent du plan y = sourceY : l'onde 2D « se
    // réduit » visiblement à sa coupe. L'effet s'annule aux deux extrémités
    // (focus = sin 2θ), pour ne toucher ni la vue du dessus ni la coupe.
    var focus    = Math.sin(2 * theta);
    if (focus < 0) focus = 0;
    var HAZE_MAX = 0.72;                          // jamais totalement effacé
    var sigma    = H * (0.55 - 0.39 * focus);     // demi-épaisseur du plan net
    var invSig2  = 1 / Math.max(1, sigma * sigma);


    for (var zi = 0; zi < N_Z; zi++) {
        var wz = (zi / (N_Z - 1)) * H;
        var dz = wz - srcY;
        var screenYbase = yLevel + dz * cosT; // y écran (CSS) sans hauteur d'onde
        // Estompage de la bande : constant sur toute sa largeur, donc hors boucle px.
        var haze = focus > 0 ? HAZE_MAX * focus * (1 - Math.exp(-dz * dz * invSig2)) : 0;

        for (var px = 0; px < PW; px++) {
            var wx          = px / dpr;   // colonne physique → position CSS pour la physique
            var dx          = (wx + panOffset) - srcX;
            var effectiveDz = dz * cosT;
            var rSq         = dx * dx + effectiveDz * effectiveDz;
            var raw = 0, env = 1.0;

            if (rfSq > 0 && rSq <= rfSq) {
                var r = Math.sqrt(rSq);
                raw   = _radAt(radD, r);
                // Enveloppe interpolée entre la formule de la vue du dessus
                // (cache de champ) et celle de la vue en coupe : sans cela les
                // deux profils n'avaient pas la même amplitude et le raccord
                // final se voyait (cf. _rebuildVaguesFieldCache / _waveFieldCoupeAt).
                if (geo) {
                    var gTop = Math.min(1, Math.sqrt(50 / Math.max(1, r)));
                    var gCut = Math.sqrt(40 / (40 + r));
                    env = gTop + (gCut - gTop) * sinT;
                }
                if (a5 > 0) {
                    var aTop = Math.exp(-a5 * r / maxR);
                    var aCut = Math.exp(-a5 * r / W);
                    env *= aTop + (aCut - aTop) * sinT;
                }
                // La vue en coupe ne montre que le demi-axe x > 0 : à gauche de
                // la source l'eau y est plate. On efface donc l'onde de gauche
                // au rythme du rideau, qui la recouvre au même moment.
                if (dx < 0) env *= 1 - bandAlpha;
            } else {
                env = 0;
            }

            // Déplacement vertical de la surface (en pixels CSS), converti en pixels physiques
            var wy  = raw * env * simVagues.amplitude * ampPx;
            var sy  = Math.round((screenYbase - wy * sinT) * dpr);
            var syP = prevSyArr[px];

            // Couleur de l'eau : teinte de phase (vue du dessus) fondue vers
            // le dégradé de profondeur de la coupe.
            var envC = Math.min(1, env * VAGUES_AMP_GAIN);
            var t01  = (raw * envC + 1) * 0.5;
            var wr   = COL_TROUGH_R + t01 * (COL_CREST_R - COL_TROUGH_R);
            var wg   = COL_TROUGH_G + t01 * (COL_CREST_G - COL_TROUGH_G);
            var wb   = COL_TROUGH_B + t01 * (COL_CREST_B - COL_TROUGH_B);

            // Remplir la bande entre syP et sy (back-to-front overwrite)
            var yLo = (syP < sy ? syP : sy);
            var yHi = (syP < sy ? sy  : syP);
            if (yLo < 0)  yLo = 0;
            if (yHi >= PH) yHi = PH - 1;
            for (var py = yLo; py <= yHi; py++) {
                var idx = (py * PW + px) * 4;
                var kw  = py * 3;
                var cr  = wr + (waterLUT[kw]     - wr) * sinT;
                var cg  = wg + (waterLUT[kw + 1] - wg) * sinT;
                var cb  = wb + (waterLUT[kw + 2] - wb) * sinT;
                if (haze > 0) {
                    cr += (bgLUT[kw]     - cr) * haze;
                    cg += (bgLUT[kw + 1] - cg) * haze;
                    cb += (bgLUT[kw + 2] - cb) * haze;
                }
                data[idx] = cr | 0; data[idx + 1] = cg | 0; data[idx + 2] = cb | 0;
                data[idx + 3] = 255;
            }

            prevSyArr[px] = sy;
        }
    }

    // Fond marin : sous la dernière bande, dégradé profond (vue du dessus)
    // fondu vers le dégradé d'eau de la coupe. La dernière bande (wz = H) est
    // la plus éloignée du plan de coupe : elle reçoit donc le même estompage
    // que les bandes, sans quoi une masse d'eau opaque subsisterait au premier
    // plan alors que tout le reste s'efface.
    var dzFront   = H - srcY;
    var hazeFront = focus > 0
        ? HAZE_MAX * focus * (1 - Math.exp(-dzFront * dzFront * invSig2))
        : 0;
    for (var px2 = 0; px2 < PW; px2++) {
        var syLast  = prevSyArr[px2];
        var yStart  = syLast < 0 ? 0 : syLast;
        var invSpan = 1 / Math.max(1, PH - syLast);
        for (var py2 = yStart; py2 < PH; py2++) {
            var depth = (py2 - syLast) * invSpan;
            var idx2  = (py2 * PW + px2) * 4;
            var kw2   = py2 * 3;
            var dr = COL_TROUGH_R * (1 - depth * 0.6);
            var dg = COL_TROUGH_G * (1 - depth * 0.3);
            var db = COL_TROUGH_B + (90 - COL_TROUGH_B) * depth * 0.25;
            var fr = dr + (waterLUT[kw2]     - dr) * sinT;
            var fg = dg + (waterLUT[kw2 + 1] - dg) * sinT;
            var fb = db + (waterLUT[kw2 + 2] - db) * sinT;
            if (hazeFront > 0) {
                fr += (bgLUT[kw2]     - fr) * hazeFront;
                fg += (bgLUT[kw2 + 1] - fg) * hazeFront;
                fb += (bgLUT[kw2 + 2] - fb) * hazeFront;
            }
            data[idx2] = fr | 0; data[idx2 + 1] = fg | 0; data[idx2 + 2] = fb | 0;
            data[idx2 + 3] = 255;
        }
    }

    ctx.putImageData(imgData, 0, 0);

    // ══ Décors, dans l'ordre de _drawVaguesCoupe ══════════════════════

    _draw3DFoamLine(ctx, prevSyArr, PW, dpr, srcXs * bandAlpha, sinT);

    // ── Fond marin ────────────────────────────────────────────────────
    // Il n'a aucun sens vu du dessus : il se lève avec la ROTATION, en sinT²
    // comme l'écume, pour que les deux décors propres à la coupe
    // apparaissent ensemble. Son bord gauche suit le rideau de la source
    // (srcXs·bandAlpha, comme l'axe) et arrive donc exactement sur le srcX
    // de _drawVaguesCoupe — le raccord de fin reste invisible.
    if (sinT > 0.02) {
        ctx.save();
        ctx.globalAlpha = sinT * sinT;
        _drawSeabedVagues(ctx, W, H, srcXs * bandAlpha, H - ORBIT_SEABED_PAD);
        ctx.restore();
    }

    _draw3DSourceZone(ctx, W, H, srcXs, yLevel, ampPx, sinT, bandAlpha);
    _draw3DAirWaterLabels(ctx, H, srcXs, sinT);
    _draw3DAxis(ctx, W, H, srcXs, yLevel, sinT, bandAlpha);
    _draw3DLambdaArrow(ctx, W, H, srcXs, yLevel, sinT, bandAlpha);
    _draw3DBeacons(ctx, W, srcXs, yLevel, ampPx, sinT, cosT);
}

// Remplit les tables de couleurs (par ligne de pixels physiques) reproduisant
// les deux dégradés verticaux de _drawVaguesCoupe : ciel et masse d'eau.
// Coût linéaire en PH, négligeable devant la boucle de bandes.
function _fillCoupeColorLUTs(buf, H, PH, dpr, yLevel, ampPx) {
    var sky = buf.sky, water = buf.water;
    // Ciel : #b0d8f0 (0) → #d4ecf8 (0,5) → #d4ecf8 (1)
    var s0r = 176, s0g = 216, s0b = 240;
    var s1r = 212, s1g = 236, s1b = 248;
    // Eau : rgb(10,110,200) (0) → rgb(0,60,140) (0,3) → rgb(0,15,65) (1),
    // de y = yLevel − ampPx à y = H (le canvas prolonge les teintes au-delà).
    var w0r = 10, w0g = 110, w0b = 200;
    var w1r = 0,  w1g = 60,  w1b = 140;
    var w2r = 0,  w2g = 15,  w2b = 65;
    var yTop = yLevel - ampPx;
    var span = Math.max(1, H - yTop);

    for (var py = 0; py < PH; py++) {
        var y = py / dpr;
        var k = py * 3;

        var fs = (H > 0) ? (y / H) / 0.5 : 0;
        if (fs > 1) fs = 1; else if (fs < 0) fs = 0;
        sky[k]     = (s0r + (s1r - s0r) * fs) | 0;
        sky[k + 1] = (s0g + (s1g - s0g) * fs) | 0;
        sky[k + 2] = (s0b + (s1b - s0b) * fs) | 0;

        var uw = (y - yTop) / span;
        if (uw < 0) uw = 0; else if (uw > 1) uw = 1;
        var ar, ag, ab, brr, bgg, bbb, fw;
        if (uw < 0.3) {
            ar = w0r; ag = w0g; ab = w0b; brr = w1r; bgg = w1g; bbb = w1b; fw = uw / 0.3;
        } else {
            ar = w1r; ag = w1g; ab = w1b; brr = w2r; bgg = w2g; bbb = w2b; fw = (uw - 0.3) / 0.7;
        }
        water[k]     = (ar + (brr - ar) * fw) | 0;
        water[k + 1] = (ag + (bgg - ag) * fw) | 0;
        water[k + 2] = (ab + (bbb - ab) * fw) | 0;
    }
}

// ── Décors projetés ───────────────────────────────────────────────────
// Chacun part de son apparence en vue du dessus et arrive exactement sur
// celle de la vue en coupe. Aucun n'est masqué pendant la transition :
// c'est ce qui supprime le « pop » des repères aux deux extrémités.

// Ligne d'écume : suit le profil de la bande la plus en avant, qui est
// précisément la surface libre une fois θ = π/2.
function _draw3DFoamLine(ctx, prevSyArr, PW, dpr, xLeft, sinT) {
    var alpha = 0.85 * sinT * sinT;
    if (alpha < 0.01) return;
    var pxLeft = Math.max(0, Math.round(xLeft * dpr));
    if (pxLeft >= PW - 1) return;

    ctx.save();
    ctx.beginPath();
    var started = false;
    for (var px = pxLeft; px < PW; px += 2) {
        var x = px / dpr, y = prevSyArr[px] / dpr;
        if (!started) { ctx.moveTo(x, y); started = true; }
        else            ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(255,255,255,' + alpha.toFixed(3) + ')';
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.restore();
}

// Bandeau sombre + tige du vibreur + flèche d'oscillation : arrivent en
// rideau par la gauche pendant le panoramique (bandAlpha), puis le point S,
// dont le style converge de la vue du dessus vers celui de la coupe (sinT).
function _draw3DSourceZone(ctx, W, H, srcXs, yLevel, ampPx, sinT, bandAlpha) {
    var mot  = _vaguesSourceMotion();
    var dotY = yLevel - mot.y * ampPx * sinT;

    if (bandAlpha > 0.005 && srcXs > 0) {
        ctx.save();
        ctx.globalAlpha = bandAlpha;

        var grd = ctx.createLinearGradient(0, 0, srcXs, 0);
        grd.addColorStop(0, 'rgba(30, 35, 50, 0.95)');
        grd.addColorStop(1, 'rgba(50, 55, 75, 0.90)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, srcXs, H);

        ctx.strokeStyle = 'rgba(140, 180, 220, 0.40)';
        ctx.lineWidth   = 1;
        ctx.beginPath(); ctx.moveTo(srcXs, 0); ctx.lineTo(srcXs, H); ctx.stroke();

        ctx.fillStyle = '#8aa4c0';
        ctx.fillRect(srcXs - 3, 0, 6, H);

        // Même règle qu'en coupe stabilisée : la flèche suit la VITESSE, et
        // disparaît quand la source est au repos.
        if (mot.moving) {
            var arrowDir = mot.v >= 0 ? -1 : 1;
            var ax = srcXs - COUPE_SRC_ARROW_DX, ay1 = dotY, ay2 = dotY + arrowDir * 14;
            ctx.strokeStyle = 'rgba(255, 215, 80, 0.80)';
            ctx.lineWidth   = 1.5;
            ctx.beginPath(); ctx.moveTo(ax, ay1); ctx.lineTo(ax, ay2); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(ax - COUPE_SRC_ARROW_HALF, ay2 - arrowDir * 6);
            ctx.lineTo(ax,     ay2);
            ctx.lineTo(ax + COUPE_SRC_ARROW_HALF, ay2 - arrowDir * 6);
            ctx.stroke();
        }

        ctx.restore();
    }

    // Point S — rayon 8 → 7 et libellé à −11 → −10 px : les deux vues ne le
    // dessinaient pas tout à fait pareil, on interpole pour éviter le sursaut.
    if (srcXs < -10 || srcXs > W + 10) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.arc(srcXs, dotY, 8 - sinT, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffdd44';
    ctx.beginPath(); ctx.arc(srcXs, dotY, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle    = '#ffffff';
    ctx.font         = 'bold 13px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor  = 'rgba(0,0,0,' + (0.7 * sinT).toFixed(2) + ')';
    ctx.shadowBlur   = 3;
    ctx.fillText('S', srcXs, dotY - 11 + sinT);
    ctx.restore();
}

function _draw3DAirWaterLabels(ctx, H, srcXs, sinT) {
    if (sinT < 0.02) return;
    ctx.save();
    ctx.font        = 'italic 12px "Segoe UI", Arial, sans-serif';
    ctx.textAlign   = 'left';
    ctx.globalAlpha = sinT;
    ctx.fillStyle   = 'rgba(30, 80, 130, 0.65)';
    ctx.textBaseline = 'top';
    ctx.fillText('Air', srcXs + 10, 8);
    ctx.fillStyle    = 'rgba(200, 235, 255, 0.70)';
    ctx.textBaseline = 'bottom';
    // Même calage que _drawVaguesCoupe : au-dessus du sable, pas sur lui.
    ctx.fillText('Eau', srcXs + 10, H - ORBIT_SEABED_PAD - 6);
    ctx.restore();
}

// Axe d'équilibre + graduations. L'axe reste à yLevel quel que soit θ (sa
// profondeur dz vaut 0, la projection le laisse sur place) : seul son bord
// gauche se replie sur la source, au rythme du rideau qui le recouvre.
function _draw3DAxis(ctx, W, H, srcXs, yLevel, sinT, bandAlpha) {
    var xLeft = srcXs * bandAlpha;
    ctx.save();

    // 0,70 en vue du dessus, 0,60 en coupe — interpolé pour ne pas sauter
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.70 - 0.10 * sinT).toFixed(3) + ')';
    ctx.lineWidth   = 1.6;
    ctx.setLineDash([9, 6]);
    ctx.beginPath();
    ctx.moveTo(xLeft, yLevel);
    ctx.lineTo(W, yLevel);
    ctx.stroke();
    ctx.setLineDash([]);

    // Largeur de référence du pas : W en vue du dessus, W − srcX en coupe.
    // Les graduations à gauche de la source s'effacent avec le rideau.
    _drawVaguesTicks(ctx, W, H, srcXs, yLevel, W - srcXs * bandAlpha, 1 - bandAlpha);
    _drawVaguesAxisLabel(ctx, W, H, yLevel);

    ctx.restore();
}

// Flèche λ : sa longueur ne change pas de la vue du dessus à la coupe (c'est
// tout l'intérêt de la montrer pendant le basculement), seule sa hauteur
// au-dessus de l'axe s'élève avec la rotation.
function _draw3DLambdaArrow(ctx, W, H, srcXs, yLevel, sinT, bandAlpha) {
    if (!simVagues.lambdaVisible) return;
    var lambdaPx = _vaguesLambdaPx();
    if (lambdaPx <= 0) return;

    var dist = simVagues.lambdaX - simVagues.sourceX;
    var x1   = srcXs + dist, x2 = x1 + lambdaPx;
    if (x1 > W) return;

    // Hors du demi-axe x > 0 : la coupe ne la montre pas, elle s'efface
    // au rythme du rideau plutôt que de disparaître d'un coup.
    var alpha = (dist <= 0) ? 1 - bandAlpha : 1;
    if (alpha < 0.01) return;

    var arrowYCoupe = _vaguesLambdaArrowYCoupe(W, H, srcXs);
    var arrowY      = yLevel + (arrowYCoupe - yLevel) * sinT;
    if (Math.abs(arrowY - yLevel) < 1) arrowY = yLevel;  // pas de pointillés à plat

    var fTop  = Math.max(16, Math.round(simVagues.canvasW * 0.045));
    var fCut  = Math.max(16, Math.round((W - srcXs) * 0.06));
    var fSize = Math.round(fTop + (fCut - fTop) * sinT);

    var clipL = srcXs * bandAlpha;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.rect(clipL, 0, W - clipL, H);
    ctx.clip();
    _drawLambdaArrowCore(ctx, x1, x2, arrowY, yLevel, fSize);
    ctx.restore();
}

// Balises. toggleViewVagues n'a laissé actives que celles posées sur l'axe
// (dz = 0) : elles montent donc sur la vague au fur et à mesure que θ croît,
// ce qui montre que le point suivi est bien le même dans les deux vues.
// Le style anneau (vue du dessus) se fond vers le style bouée (coupe).
function _draw3DBeacons(ctx, W, srcXs, yLevel, ampPx, sinT, cosT) {
    var specs = [
        { b: simVagues.beacon1, color: '#e07020', label: 'B1' },
        { b: simVagues.beacon2, color: '#2a8a50', label: 'B2' }
    ];
    for (var i = 0; i < specs.length; i++) {
        var s = specs[i];
        if (!s.b.active) continue;
        var dist = s.b.x - simVagues.sourceX;
        var bx   = srcXs + dist;
        if (bx < -20 || bx > W + 20) continue;

        // Hauteur d'onde au point suivi : même appel que la vue en coupe,
        // pour arriver exactement sur sa position finale.
        var wy    = (dist > 0) ? _waveFieldCoupeAt(simVagues.sourceX + dist, simVagues.sourceX) : 0;
        var surfY = yLevel + (s.b.y - simVagues.sourceY) * cosT - wy * ampPx * sinT;

        // — style vue du dessus (anneau fin) —
        if (sinT < 0.995) {
            ctx.save();
            ctx.globalAlpha = 1 - sinT;
            ctx.strokeStyle = s.color;
            ctx.lineWidth   = 2.5;
            ctx.beginPath(); ctx.arc(bx, surfY, 7, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = s.color;
            ctx.beginPath(); ctx.arc(bx, surfY, 3, 0, Math.PI * 2); ctx.fill();
            ctx.font         = 'bold 22px monospace';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(s.label, bx, surfY - 10);
            ctx.restore();
        }

        // — style vue en coupe (bouée pleine + pointillé de mise à niveau) —
        if (sinT > 0.005) {
            ctx.save();
            ctx.globalAlpha = sinT;

            ctx.strokeStyle = s.color;
            ctx.lineWidth   = 1.5;
            ctx.setLineDash([5, 4]);
            ctx.beginPath(); ctx.moveTo(bx, surfY); ctx.lineTo(bx, yLevel); ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = s.color;
            ctx.beginPath(); ctx.arc(bx, surfY, 10, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth   = 1.5;
            ctx.stroke();

            ctx.fillStyle    = s.color;
            ctx.font         = 'bold 24px "Segoe UI", Arial, sans-serif';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'bottom';
            ctx.shadowColor  = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur   = 3;
            ctx.fillText(s.label, bx, surfY - 13);
            ctx.restore();
        }
    }
}

// Rendu top-down dans un contexte 2D (ctx du canvas principal ou offscreen)
function _renderTopDown(ctx, W, H) {
    if (simVagues.c_sim <= 0) {
        ctx.fillStyle = 'rgb(' + COL_BG_R + ',' + COL_BG_G + ',' + COL_BG_B + ')';
        ctx.fillRect(0, 0, W, H);
        _drawAxisVagues(ctx, W, H);
        _drawBeaconsVagues(ctx);
        _drawSourceVagues(ctx);
        return;
    }
    var imgData = ctx.createImageData(W, H);
    var data    = imgData.data;
    var B = BLOCK_V, BH = B >> 1;
    var t = simVagues.simTime, c = simVagues.c_sim;
    var maxR = Math.sqrt(W * W + H * H);
    var a5   = simVagues.attenuation * 5;
    var geo  = simVagues.geoAttenuation;
    var sx   = simVagues.sourceX, sy = simVagues.sourceY;
    var radD    = _vaguesRadLUT(t);
    var r_front = _vaguesFrontR(t);

    for (var bj = 0; bj < H; bj += B) {
        var cy = bj + BH;
        for (var bi = 0; bi < W; bi += B) {
            var cx = bi + BH;
            var rc, gc, bc;
            var dx = cx - sx, dy = cy - sy;
            var r  = Math.sqrt(dx * dx + dy * dy);
            if (r > r_front) {
                rc = COL_BG_R; gc = COL_BG_G; bc = COL_BG_B;
            } else {
                var raw = _radAt(radD, r);
                var env = 1.0;
                if (geo) env = Math.min(1, Math.sqrt(50 / Math.max(1, r)));
                if (a5 > 0) env *= Math.exp(-a5 * r / maxR);
                env = Math.min(1, env * VAGUES_AMP_GAIN);
                var t01 = (raw * env + 1) * 0.5;
                rc = Math.round(COL_TROUGH_R + t01 * (COL_CREST_R - COL_TROUGH_R));
                gc = Math.round(COL_TROUGH_G + t01 * (COL_CREST_G - COL_TROUGH_G));
                bc = Math.round(COL_TROUGH_B + t01 * (COL_CREST_B - COL_TROUGH_B));
            }
            for (var dj = 0; dj < B && bj + dj < H; dj++) {
                for (var di = 0; di < B && bi + di < W; di++) {
                    var idx = ((bj + dj) * W + (bi + di)) * 4;
                    data[idx] = rc; data[idx+1] = gc; data[idx+2] = bc; data[idx+3] = 255;
                }
            }
        }
    }
    ctx.putImageData(imgData, 0, 0);
    _drawAxisVagues(ctx, W, H);
    _drawBeaconsVagues(ctx);
    _drawSourceVagues(ctx);
}

// ══════════════════════════════════════════════════════════════════════
//  Vue en coupe (plan Sxy)
// ══════════════════════════════════════════════════════════════════════

// Champ d'onde 1D le long de l'axe x, depuis la source en srcX
function _waveFieldCoupeAt(x_canvas, srcX) {
    var r_px = x_canvas - srcX;
    if (r_px < 0) return 0;
    var c = simVagues.c_sim;
    if (c <= 0) return 0;
    var field = _vaguesSrcDAtR(r_px);
    if (field === 0) return 0;
    if (simVagues.geoAttenuation) field *= Math.sqrt(40 / (40 + r_px));
    if (simVagues.attenuation > 0)
        field *= Math.exp(-simVagues.attenuation * 5 * r_px / simVagues.canvasW);
    return field * simVagues.amplitude;
}

function _drawVaguesCoupe(ctx, W, H) {
    var srcX   = simVagues.coupeSrcX;
    var yLevel = Math.round(H / 2);
    var ampPx  = _coupeAmpPx(H);

    // ── 1. Fond ciel (air) ────────────────────────────────────────────
    var skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, '#b0d8f0');
    skyGrad.addColorStop(0.5, '#d4ecf8');
    skyGrad.addColorStop(1, '#d4ecf8');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // ── 2. Polygone eau (surface ondulée + fond) ──────────────────────
    var srcField = _waveFieldCoupeAt(srcX, srcX);
    ctx.beginPath();
    ctx.moveTo(srcX, yLevel - srcField * ampPx);
    for (var x = srcX + 1; x <= W; x++) {
        ctx.lineTo(x, yLevel - _waveFieldCoupeAt(x, srcX) * ampPx);
    }
    ctx.lineTo(W, H);
    ctx.lineTo(srcX, H);
    ctx.closePath();

    var waterGrad = ctx.createLinearGradient(0, yLevel - ampPx, 0, H);
    waterGrad.addColorStop(0,   'rgb(10, 110, 200)');
    waterGrad.addColorStop(0.3, 'rgb(0, 60, 140)');
    waterGrad.addColorStop(1,   'rgb(0, 15, 65)');
    ctx.fillStyle = waterGrad;
    ctx.fill();

    // ── 3. Ligne de surface (écume) ───────────────────────────────────
    ctx.beginPath();
    for (var x = srcX; x <= W; x++) {
        var sy = yLevel - _waveFieldCoupeAt(x, srcX) * ampPx;
        if (x === srcX) ctx.moveTo(x, sy);
        else             ctx.lineTo(x, sy);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth   = 2;
    ctx.stroke();

    // ── 4. Fond marin ─────────────────────────────────────────────────
    //  Toujours visible en vue de profil (cf. _drawSeabedVagues), qu'on ait
    //  ou non demandé les trajectoires : c'est lui qui donne sa profondeur à
    //  la colonne d'eau.
    _drawSeabedVagues(ctx, W, H, srcX, H - ORBIT_SEABED_PAD);

    // ── 5. Trajectoire des molécules d'eau (option) ───────────────────
    //  Après l'écume, pour que la molécule de la rangée de surface se voie
    //  SUR la ligne blanche qu'elle suit exactement ; avant la source, l'axe
    //  et les balises, qui restent au premier plan.
    _drawOrbitesCoupeVagues(ctx, W, H, srcX, yLevel, ampPx);

    // ── 6. Zone source ────────────────────────────────────────────────
    _drawSourceCoupeVagues(ctx, W, H, srcX, yLevel, ampPx);

    // ── 7. Labels Air / Eau ───────────────────────────────────────────
    ctx.save();
    ctx.font      = 'italic 12px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(30, 80, 130, 0.65)';
    ctx.textBaseline = 'top';
    ctx.fillText('Air', srcX + 10, 8);
    ctx.fillStyle = 'rgba(200, 235, 255, 0.70)';
    ctx.textBaseline = 'bottom';
    // Juste au-dessus du sable : le fond marin étant désormais toujours
    // dessiné, un label calé sur le bas du canvas tomberait dessus.
    ctx.fillText('Eau', srcX + 10, H - ORBIT_SEABED_PAD - 6);
    ctx.restore();

    // ── 8. Axe x et graduations ───────────────────────────────────────
    _drawAxisCoupeVagues(ctx, W, H, srcX, yLevel);

    // ── 9. Flèche de longueur d'onde ───────────────────────────────────
    _drawLambdaArrowCoupeVagues(ctx, W, H, srcX, yLevel);

    // ── 10. Balises (bouées flottantes) ────────────────────────────────
    _drawBeaconsCoupeVagues(ctx, W, H, srcX, yLevel, ampPx);
}

// ══════════════════════════════════════════════════════════════════════
//  Trajectoire des molécules d'eau (option de la vue en coupe)
// ══════════════════════════════════════════════════════════════════════
//  Théorie d'Airy à profondeur FINIE — c'est bien celle du modèle simulé
//  ici (c = √(gh), donc eau peu profonde), et non le cas « eau profonde »
//  des cercles qui rétrécissent. Une particule dont la position moyenne
//  est à la profondeur d sous la surface (fond marin en d = h) décrit une
//  ELLIPSE de demi-axes
//      vertical    V(d) = a · sinh(k(h−d)) / sinh(kh)
//      horizontal  Hz(d) = a · cosh(k(h−d)) / sinh(kh)
//  où a est l'amplitude LOCALE de la surface. En surface V = a ; au fond
//  V = 0 : il ne reste qu'un va-et-vient horizontal — c'est le point
//  pédagogique de l'option. Le rapport Hz/V = coth(k(h−d)) tend vers 1
//  (cercles) quand kh ≫ 1 et explose quand kh ≪ 1 ; les deux régimes sont
//  atteignables avec les curseurs, cf. plus bas.
//
//  kh est le nombre d'onde PHYSIQUE fois la profondeur PHYSIQUE :
//      kh = 2π·h/λ = 2π·f·h/c = 2π·f·√(h/g)      (puisque c = √(gh))
//  soit ≈ 0,02 (h=1 mm, g=25, f=0,5 Hz) à ≈ 3,1 (h=10 mm, g=1, f=5 Hz)
//  sur la plage des curseurs : du segment quasi horizontal jusqu'au
//  quasi-cercle. Noter que kh ne dépend PAS du pixel : la colonne d'eau
//  dessinée (surface → fond marin) représente h, seul cadrage cohérent
//  avec des ellipses qui s'écrasent en arrivant au fond.
//
//  Phase : le champ de la coupe vaut F = env·sin(φ) avec φ = ωt − kr
//  (cf. _waveFieldCoupeAt). La composante horizontale est sa QUADRATURE
//  Q = env·cos(φ), d'où
//      ζ = +(V/a)·F     déplacement vertical, compté vers le haut
//      ξ = −(Hz/a)·Q    déplacement horizontal, compté vers +x
//  ce qui donne une molécule qui avance sur la crête et recule dans le
//  creux — le sens de rotation correct pour une onde allant vers +x.
//  Enfin |env| = √(F² + Q²) : l'amplitude locale sort du couple (F, Q)
//  sans avoir à ré-évaluer les deux atténuations.
//
//  ── LE CADRAGE, sans quoi le tracé n'a aucun sens à l'écran ─────────
//  La vue en coupe exagère massivement l'échelle VERTICALE devant
//  l'horizontale : par défaut l'amplitude dessinée fait 46 px pour λ = 75
//  px, soit une vague haute de 0,6 λ là où une vraie vague est cent fois
//  plus plate. Facteur d'exagération verticale : ~35.
//
//  Conséquence : on ne peut pas avoir à la fois (a) la molécule de surface
//  collée à l'écume, (b) le rapport d'aplatissement exact et (c) une orbite
//  plus étroite que λ. À l'échelle exacte des deux axes, l'ellipse de
//  surface ferait 288 px de large pour λ = 75 px — la molécule aurait l'air
//  de traverser quatre crêtes.
//
//  Arbitrage retenu (l'objectif étant de montrer qu'il n'y a PAS de
//  transport de matière) : on garde (a), on lâche (b).
//
//   • Demi-axe VERTICAL : échelle exacte de la surface. La molécule de la
//     rangée du haut est donc rigoureusement SUR l'écume — elle monte quand
//     la crête arrive, redescend dans le creux, et l'ellipse de cette
//     rangée couvre exactement la bande balayée par la houle.
//   • Demi-axe HORIZONTAL : comprimé par un `hScale` GLOBAL (calé sur la
//     rangée de surface, donc identique pour toutes les rangées — la
//     largeur reste constante avec la profondeur, comme le veut la
//     physique, seule la hauteur décroît). L'aplatissement affiché n'est
//     donc pas mesurable.
//
//  ── LA BORNE λ/π, la contrainte dure du tracé ───────────────────────
//  La molécule est dessinée en px = x₀ − Hz·cos φ, mais sa HAUTEUR est
//  celle de sa propre trajectoire. Pour qu'elle reste sous la surface, il
//  faut que la surface en px soit au-dessus d'elle, soit
//      sin(φ + β·cos φ) ≤ sin φ  pour tout φ,  avec β = k·Hz
//  Le développement au voisinage de φ = π/2 (le cas critique) donne
//  1 − (1 − β)² ≥ 0, c'est-à-dire **β ≤ 2**, soit **Hz ≤ λ/π**.
//
//  Au-delà, la molécule « double » la forme de la vague et se retrouve en
//  l'air : c'est exactement ce qui arrivait aux petites longueurs d'onde,
//  invisible aux grandes. Hz est donc plafonné à ORBIT_LAMBDA_FRAC·λ,
//  sous la borne. Conséquence assumée : plus λ est petite devant
//  l'amplitude DESSINÉE, plus la boucle est étroite et verticale. Une
//  boucle large et plate suppose une vague plate — c'est le compromis
//  inverse, celui qui aurait demandé d'aplatir la houle.
//   • RANGÉES à espacement VARIABLE, chaque écart étant calculé sur les
//     deux ellipses qu'il sépare : le non-chevauchement est structurel,
//     et non le fruit d'un plafond calé sur la seule ellipse de surface.
//     Aucune rangée sur le fond marin — l'ellipse y dégénère en segment
//     horizontal, un trait mort. La plus basse s'arrête à 0,70·h.
//   • Les colonnes remplissent d'abord la LARGEUR ; leur pas est ensuite
//     ajusté, quand c'est possible sans laisser de marge, vers un multiple
//     IMPAIR de λ/2, ce qui met les colonnes voisines en ANTIPHASE : à un
//     instant donné, une molécule est au sommet de sa boucle (sous la
//     crête) pendant que sa voisine est au fond de la sienne (sous le
//     creux). L'ordre des priorités compte : caler l'antiphase d'abord
//     groupait deux ou trois colonnes au centre de l'écran aux grandes λ.

var ORBIT_TARGET_STEP  = 150;  // px — espacement visé entre deux colonnes
var ORBIT_SEABED_PAD   = 16;   // px — eau laissée sous le fond marin dessiné
var ORBIT_LAMBDA_FRAC  = 0.27; // demi-axe horizontal max, en λ (borne : 1/π)
var ORBIT_MAX_ROWS     = 4;
var ORBIT_DOT_R        = 4.3;  // px — rayon de la bille « molécule »
var ORBIT_MAX_DEPTH_FRAC = 0.70; // profondeur de la rangée la plus basse, en h
var ORBIT_ROW_GAP        = 1.15; // marge de non-chevauchement entre deux rangées
var ORBIT_TRAIL_ARC      = 1.15; // rad — longueur d'arc de la traînée de la bille
var ORBIT_TRAIL_COL      = ['rgba(255,255,255,0.16)',
                            'rgba(255,255,255,0.32)',
                            'rgba(255,255,255,0.55)'];

// Couple (F, Q) du champ de la coupe en x. DOIT rester aligné sur
// _waveFieldCoupeAt : out[0] en est la copie exacte, out[1] sa quadrature.
//
// out[0] est lu dans l'historique, comme partout ailleurs : la bille suit donc
// exactement la surface dessinée. out[1] reste analytique — la quadrature d'un
// signal quelconque n'a pas d'expression locale, et la théorie d'Airy dont
// sortent ces orbites suppose de toute façon une onde monochromatique. C'est
// la raison pour laquelle l'option sera grisée en mode impulsion.
function _coupeFieldPairAt(x_canvas, srcX, out) {
    out[0] = 0; out[1] = 0;
    var r_px = x_canvas - srcX;
    if (r_px < 0) return;
    var c = simVagues.c_sim;
    if (c <= 0) return;
    var d = _vaguesSrcDAtR(r_px);
    if (d === 0) return;
    var phi = 2 * Math.PI * simVagues.freq * (simVagues.simTime - r_px / c);
    var env = simVagues.amplitude;
    if (simVagues.geoAttenuation) env *= Math.sqrt(40 / (40 + r_px));
    if (simVagues.attenuation > 0)
        env *= Math.exp(-simVagues.attenuation * 5 * r_px / simVagues.canvasW);
    out[0] = d * env;
    out[1] = Math.cos(phi) * env;
}

var _orbitFP   = [0, 0];   // tampon réutilisé (pas d'allocation par frame)
var _orbitCols = [];       // idem pour les colonnes
var _orbitRows = [];       // idem pour les profondeurs des rangées (fraction de h)

// ── Sprite de la molécule ─────────────────────────────────────────────
//  Une bille d'eau : dégradé radial avec un reflet en haut à gauche, cerné
//  d'un liseré sombre APPUYÉ. Ce liseré n'est pas décoratif : la rangée de
//  surface passe alternativement sur l'eau profonde, sur l'écume blanche et
//  sur le ciel clair (son orbite monte au niveau des crêtes), où une bille
//  claire seule devenait invisible. Le dégradé est peint UNE FOIS hors
//  écran puis recopié (même principe que _chromeVagues) : en créer un par
//  molécule et par frame, c'était une trentaine de createRadialGradient à
//  chaque image.
var _orbitBead = null;
function _orbitBeadSprite() {
    var dpr = window.devicePixelRatio || 1;
    if (_orbitBead && _orbitBead.dpr === dpr) return _orbitBead;

    var R    = ORBIT_DOT_R;
    var size = Math.ceil(2 * (R + 1.5));
    var cv   = document.createElement('canvas');
    cv.width = cv.height = Math.max(1, Math.round(size * dpr));
    var cx   = cv.getContext('2d');
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var c = size / 2;
    var g = cx.createRadialGradient(c - R * 0.32, c - R * 0.36, R * 0.10, c, c, R);
    g.addColorStop(0,    'rgba(255,255,255,0.98)');
    g.addColorStop(0.45, 'rgba(186,238,255,0.96)');
    g.addColorStop(1,    'rgba(104,196,232,0.92)');
    cx.fillStyle = g;
    cx.beginPath();
    cx.arc(c, c, R, 0, Math.PI * 2);
    cx.fill();
    cx.strokeStyle = 'rgba(8, 42, 72, 0.88)';
    cx.lineWidth   = 1.6;
    cx.stroke();

    _orbitBead = { canvas: cv, dpr: dpr, size: size, half: size / 2 };
    return _orbitBead;
}

// ── Fond marin ────────────────────────────────────────────────────────
//  Dessiné dès la vue en coupe, et non plus seulement avec l'option
//  trajectoires : il matérialise la profondeur h et ferme la colonne d'eau,
//  sans quoi la scène est un aplat bleu sans repère de fond. Bande de sable
//  dégradée, ligne de crête claire et quelques galets — positions
//  DÉTERMINISTES : un Math.random dans une boucle de rendu ferait grésiller
//  le fond d'une frame à l'autre.
function _drawSeabedVagues(ctx, W, H, srcX, seabedY) {
    var top   = seabedY - 3;
    var sand  = ctx.createLinearGradient(0, top, 0, H);
    sand.addColorStop(0,    'rgba(228, 210, 162, 0.16)');
    sand.addColorStop(0.35, 'rgba(224, 203, 150, 0.52)');
    sand.addColorStop(1,    'rgba(192, 168, 118, 0.74)');
    ctx.fillStyle = sand;
    ctx.fillRect(srcX, top, W - srcX, H - top);

    ctx.strokeStyle = 'rgba(246, 234, 198, 0.50)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(srcX, seabedY);
    ctx.lineTo(W, seabedY);
    ctx.stroke();

    var wSand = W - srcX;
    ctx.fillStyle = 'rgba(150, 127, 88, 0.40)';
    for (var i = 0; i < 18; i++) {
        var gx = srcX + (((i * 37 + 11) % 100) / 100) * wSand;
        var gy = seabedY + 3 + ((i * 53) % 9);
        var gr = 1.2 + ((i * 17) % 5) * 0.35;
        ctx.beginPath();
        ctx.ellipse(gx, gy, gr * 1.5, gr, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Demi-axe VERTICAL d'une rangée, en px, pour une profondeur df exprimée en
// fraction de h (0 = surface, 1 = fond marin). aPx est le demi-axe de la
// rangée de surface. Sert au placement des rangées (cf. plus bas) autant qu'à
// leur tracé.
function _orbitRvAt(df, kh, shKh, aPx) {
    var kz = kh * (1 - df);
    if (kz < 0) kz = 0;
    return (Math.sinh(kz) / shKh) * aPx;
}

function _drawOrbitesCoupeVagues(ctx, W, H, srcX, yLevel, ampPx) {
    var s = simVagues;
    if (!s.showOrbits) return;
    if (s.c_ms <= 0 || s.c_sim <= 0 || s.freq <= 0) return;

    var seabedY = H - ORBIT_SEABED_PAD;
    var colH    = seabedY - yLevel;          // hauteur DESSINÉE de la colonne d'eau
    if (colH < 40) return;                   // canvas trop plat : illisible

    var kh = 2 * Math.PI * s.freq * s.h / s.c_ms;
    if (!(kh > 1e-4)) return;
    var shKh = Math.sinh(kh);

    // ── Colonnes ──────────────────────────────────────────────────────
    // Le nombre de colonnes est fixé par la LARGEUR disponible, puis le pas
    // est ajusté vers un multiple impair de λ/2 (antiphase entre voisines,
    // cf. en-tête) — mais seulement s'il reste à moins de 25 % du pas idéal,
    // et toujours vers le BAS pour que la rangée continue de tenir dans
    // l'espace disponible. La priorité inverse — antiphase d'abord — groupait
    // deux ou trois colonnes au centre de l'écran dès que λ était grande.
    var xLeft = srcX + 10, xRight = W - 12;
    var avail = xRight - xLeft;
    if (avail < 90) return;

    var lamPx   = s.c_sim / s.freq;
    var nCols   = Math.max(3, Math.min(9, Math.round(avail / ORBIT_TARGET_STEP) + 1));
    var colStep = avail / (nCols - 1);
    if (lamPx > 0) {
        var m = Math.floor(colStep / (lamPx / 2));
        if (m % 2 === 0) m -= 1;             // impair, et ≤ pas idéal
        var cand = m * lamPx / 2;
        if (m >= 1 && cand >= 0.75 * colStep) colStep = cand;
    }
    // Reste réparti en marges égales, nécessairement petites : la rangée
    // occupe au minimum 75 % de la largeur disponible.
    var xFirst = xLeft + (avail - (nCols - 1) * colStep) / 2;

    var envMax = 0;
    _orbitCols.length = 0;
    for (var i = 0; i < nCols; i++) {
        var x0 = xFirst + i * colStep;
        _coupeFieldPairAt(x0, srcX, _orbitFP);
        var F = _orbitFP[0], Q = _orbitFP[1];
        var env = Math.sqrt(F * F + Q * Q);
        _orbitCols.push({ x: x0, F: F, Q: Q, env: env });
        if (env > envMax) envMax = env;
    }
    if (envMax <= 0) return;                 // le front n'a atteint aucune colonne

    // ── Rangées ───────────────────────────────────────────────────────
    // La première est SUR la surface moyenne (d = 0) ; il n'y en a AUCUNE sur
    // le fond marin, où l'ellipse dégénère en segment horizontal — un trait
    // mort qui n'apprend rien. La dernière s'arrête à ORBIT_MAX_DEPTH_FRAC·h,
    // profondeur à laquelle l'ellipse est encore franchement une ellipse.
    //
    // Les rangées ne sont PAS équidistantes. On descend la colonne en plaçant
    // chaque rangée juste sous la précédente, à une distance calculée sur les
    // demi-axes verticaux RÉELS des deux ellipses concernées (plus une garde
    // de trois rayons de bille, pour que deux rangées restent distinctes même
    // quand leurs ellipses sont minuscules). Le non-chevauchement devient
    // ainsi structurel. L'ancien espacement uniforme, dimensionné par la
    // seule ellipse de SURFACE, ne garantissait rien dès que le plancher de
    // deux rangées passait outre la contrainte.
    var aPx = envMax * ampPx;                // demi-axe vertical en surface (fV = 1)
    _orbitRows.length = 0;
    var df = 0;
    for (var ri = 0; ri < ORBIT_MAX_ROWS; ri++) {
        _orbitRows.push(df);
        var rvPrev = _orbitRvAt(df, kh, shKh, aPx);
        // Point fixe : rv décroît avec la profondeur, la suite converge en
        // deux ou trois tours depuis la borne haute (deux fois rvPrev).
        var next = df + (ORBIT_ROW_GAP * 2 * rvPrev + 3 * ORBIT_DOT_R) / colH;
        for (var it = 0; it < 3; it++) {
            next = df + (ORBIT_ROW_GAP * (rvPrev + _orbitRvAt(next, kh, shKh, aPx))
                         + 3 * ORBIT_DOT_R) / colH;
        }
        if (next > ORBIT_MAX_DEPTH_FRAC) break;
        df = next;
    }
    var nRows = _orbitRows.length;

    // Étalement. Les écarts minimaux se resserrent vers le bas (les ellipses y
    // sont minuscules) : les rangées s'entasseraient sous la surface en
    // laissant toute la moitié basse de la colonne d'eau vide. On dilate donc
    // les profondeurs pour que la dernière tombe pile sur ORBIT_MAX_DEPTH_FRAC.
    // Dilater ne peut pas recréer de chevauchement : chaque écart est
    // multiplié par un facteur ≥ 1 pendant que descendre une rangée ne fait
    // que rapetisser son ellipse.
    var lastDf = _orbitRows[nRows - 1];
    if (nRows > 1 && lastDf > 1e-3 && lastDf < ORBIT_MAX_DEPTH_FRAC) {
        var kStretch = ORBIT_MAX_DEPTH_FRAC / lastDf;
        for (var rj = 1; rj < nRows; rj++) _orbitRows[rj] *= kStretch;
    }

    // ── Compression horizontale ───────────────────────────────────────
    // Seule entorse au rapport exact (cf. en-tête). Le facteur est calculé
    // sur la rangée de SURFACE et appliqué tel quel à toutes les autres : la
    // largeur reste ainsi quasi constante avec la profondeur — c'est bien la
    // physique — pendant que la hauteur, elle, décroît. Le plafond
    // DÉTERMINANT est ORBIT_LAMBDA_FRAC·λ (borne β ≤ 2, cf. en-tête) : c'est
    // lui qui garantit que la molécule ne double jamais la forme de la vague.
    // Le plafond par case ne joue qu'aux très grandes λ.
    var rhTrue = (Math.cosh(kh) / shKh) * aPx;
    var capPx  = Math.min(colStep * 0.42, ORBIT_LAMBDA_FRAC * lamPx);
    var hScale = Math.min(1, capPx / Math.max(1, rhTrue));

    ctx.save();
    var bead = _orbitBeadSprite();

    // ── Filet vertical ────────────────────────────────────────────────
    // Relie les positions MOYENNES d'une même colonne : sans lui, la grille se
    // lit comme un semis de billes indépendantes au lieu d'une sonde plantée
    // dans l'eau, et l'écrasement des ellipses avec la profondeur ne saute pas
    // aux yeux.
    if (nRows > 1) {
        ctx.strokeStyle = 'rgba(200, 232, 255, 0.20)';
        ctx.lineWidth   = 1;
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        var yBot = yLevel + _orbitRows[nRows - 1] * colH;
        for (var cl = 0; cl < nCols; cl++) {
            if (_orbitCols[cl].env <= 0) continue;
            ctx.moveTo(_orbitCols[cl].x, yLevel);
            ctx.lineTo(_orbitCols[cl].x, yBot);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Rangées à l'extérieur : fV et fH ne dépendent que de la profondeur.
    for (var ri2 = 0; ri2 < nRows; ri2++) {
        var dfr = _orbitRows[ri2];
        var cy  = yLevel + dfr * colH;
        var kz  = kh * (1 - dfr);            // k(h − d)
        if (kz < 0) kz = 0;
        var fV  = Math.sinh(kz) / shKh;                // V/a — échelle EXACTE
        var fH  = (Math.cosh(kz) / shKh) * hScale;     // Hz/a — comprimé

        // Estompage et bille rétrécie avec la profondeur : la colonne se lit
        // comme une atténuation, et non comme quatre copies du même dessin.
        var dNorm = dfr / ORBIT_MAX_DEPTH_FRAC;
        ctx.globalAlpha = 1 - 0.45 * dNorm;
        var bSize = bead.size * (1 - 0.28 * dNorm);
        var bHalf = bSize / 2;

        for (var ci = 0; ci < nCols; ci++) {
            var col = _orbitCols[ci];
            if (col.env <= 0) continue;      // colonne pas encore atteinte

            var rv = fV * col.env * ampPx;
            var rh = fH * col.env * ampPx;
            if (rh < 1.2 && rv < 1.2) continue;
            var rxD = Math.max(rh, 0.5), ryD = Math.max(rv, 0.5);

            // Orbite, tracée DEUX FOIS : un halo sombre puis le trait clair.
            // L'orbite de la rangée de surface monte jusqu'au niveau des
            // crêtes, elle traverse donc des zones de ciel clair autant que
            // d'eau profonde — un trait d'une seule couleur y disparaît
            // forcément d'un côté ou de l'autre. Le halo règle les deux cas
            // d'un coup, et coûte un stroke. Trait FIN : l'orbite est le
            // décor, la traînée et la bille sont le sujet.
            ctx.beginPath();
            ctx.ellipse(col.x, cy, rxD, ryD, 0, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(8, 42, 72, 0.30)';
            ctx.lineWidth   = 2.2;
            ctx.stroke();
            ctx.strokeStyle = 'rgba(216, 246, 255, 0.45)';
            ctx.lineWidth   = 1;
            ctx.stroke();

            // ── Traînée ───────────────────────────────────────────────
            // Le chemin parcouru pendant la dernière fraction de période, en
            // trois arcs de plus en plus clairs et épais. Sans elle, RIEN
            // n'indique le sens de rotation — or c'est tout le propos : la
            // molécule avance sur la crête et recule dans le creux.
            // Angle canvas de la bille : elle est en (x − rh·cos φ,
            // y − rv·sin φ) et le paramétrage de ctx.ellipse en
            // (x + rx·cos t, y + ry·sin t), d'où t = atan2(−F, −Q).
            if (rxD > 3 && ryD > 3) {
                var tAng = Math.atan2(-col.F, -col.Q);
                for (var k = 0; k < 3; k++) {
                    ctx.beginPath();
                    ctx.ellipse(col.x, cy, rxD, ryD, 0,
                                tAng - ORBIT_TRAIL_ARC * (3 - k) / 3,
                                tAng - ORBIT_TRAIL_ARC * (2 - k) / 3);
                    ctx.strokeStyle = ORBIT_TRAIL_COL[k];
                    ctx.lineWidth   = 1.4 + 0.7 * k;
                    ctx.stroke();
                }
            }

            var px = col.x - fH * col.Q * ampPx;
            var py = cy    - fV * col.F * ampPx;

            // Hauteur de la surface À L'ABSCISSE OÙ LA MOLÉCULE EST DESSINÉE,
            // et non à celle de sa position moyenne : confondre les deux était
            // la cause des molécules en l'air aux petites λ. La borne λ/π rend
            // désormais le cas normalement impossible ; ce qui suit est le
            // filet — recadrage sur l'écume pour la rangée de surface (qui EST
            // la surface, jamais masquée), escamotage pour les autres.
            _coupeFieldPairAt(px, srcX, _orbitFP);
            var ySurf = yLevel - _orbitFP[0] * ampPx;
            if (ri2 === 0) { if (py < ySurf) py = ySurf; }
            else if (py < ySurf) continue;

            ctx.drawImage(bead.canvas, px - bHalf, py - bHalf, bSize, bSize);
        }
    }
    ctx.restore();
}

function _drawSourceCoupeVagues(ctx, W, H, srcX, yLevel, ampPx) {
    var mot  = _vaguesSourceMotion();
    var dotY = yLevel - mot.y * ampPx;

    ctx.save();

    // ── Fond sombre de la zone source (toute la hauteur) ─────────────
    var grd = ctx.createLinearGradient(0, 0, srcX, 0);
    grd.addColorStop(0, 'rgba(30, 35, 50, 0.95)');
    grd.addColorStop(1, 'rgba(50, 55, 75, 0.90)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, srcX, H);

    // Séparation verticale légère à droite de la zone source
    ctx.strokeStyle = 'rgba(140, 180, 220, 0.40)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(srcX, 0); ctx.lineTo(srcX, H); ctx.stroke();

    // ── Tige du vibreur ───────────────────────────────────────────────
    ctx.fillStyle = '#8aa4c0';
    ctx.fillRect(srcX - 3, 0, 6, H);

    // ── Petite flèche indiquant le sens d'oscillation ─────────────────
    // Sens du mouvement réel de la source = signe de la vitesse (cf.
    // _vaguesSourceMotion). Source au repos : pas de flèche du tout — entre
    // deux impulsions, ou une fois la source coupée, elle ne bouge plus.
    if (mot.moving) {
        var arrowDir = mot.v >= 0 ? -1 : 1;
        var ax = srcX - COUPE_SRC_ARROW_DX, ay1 = dotY, ay2 = dotY + arrowDir * 14;
        ctx.strokeStyle = 'rgba(255, 215, 80, 0.80)';
        ctx.lineWidth   = 1.5;
        ctx.beginPath(); ctx.moveTo(ax, ay1); ctx.lineTo(ax, ay2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ax - COUPE_SRC_ARROW_HALF, ay2 - arrowDir * 6);
        ctx.lineTo(ax,     ay2);
        ctx.lineTo(ax + COUPE_SRC_ARROW_HALF, ay2 - arrowDir * 6);
        ctx.stroke();
    }

    ctx.restore();

    // ── Point oscillant S sur la surface ─────────────────────────────
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.arc(srcX, dotY, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffdd44';
    ctx.beginPath(); ctx.arc(srcX, dotY, 4, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle    = '#ffffff';
    ctx.font         = 'bold 13px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor  = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur   = 3;
    ctx.fillText('S', srcX, dotY - 10);
    ctx.restore();
}

function _drawAxisCoupeVagues(ctx, W, H, srcX, yLevel) {
    ctx.save();

    // Ligne pointillée à l'équilibre (y=0)
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth   = 1.6;
    ctx.setLineDash([9, 6]);
    ctx.beginPath();
    ctx.moveTo(srcX, yLevel);
    ctx.lineTo(W, yLevel);
    ctx.stroke();
    ctx.setLineDash([]);

    // Graduations en mètres depuis la source (la coupe ne montre que x > 0)
    _drawVaguesTicks(ctx, W, H, srcX, yLevel, W - srcX, 0);
    _drawVaguesAxisLabel(ctx, W, H, yLevel);

    ctx.restore();
}

// Balises en vue coupe — même style que le tab corde :
// point coloré sur la surface + pointillé vertical vers l'axe d'équilibre + label
function _drawBeaconsCoupeVagues(ctx, W, H, srcX, yLevel, ampPx) {
    var specs = [
        { b: simVagues.beacon1, color: '#e07020', label: 'B1' },
        { b: simVagues.beacon2, color: '#2a8a50', label: 'B2' }
    ];
    for (var i = 0; i < specs.length; i++) {
        var s = specs[i];
        if (!s.b.active || !s.b.snapped) continue;
        var dist = s.b.x - simVagues.sourceX;
        if (dist <= 0) continue;
        var bx = srcX + dist;
        if (bx < srcX || bx > W) continue;

        var surfY = yLevel - _waveFieldCoupeAt(bx, srcX) * ampPx;
        var dotR  = 10;

        // Pointillé vertical du point jusqu'à l'axe d'équilibre
        ctx.save();
        ctx.strokeStyle = s.color;
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(bx, surfY);
        ctx.lineTo(bx, yLevel);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.restore();

        // Point sur la surface
        ctx.save();
        ctx.fillStyle   = s.color;
        ctx.beginPath();
        ctx.arc(bx, surfY, dotR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 1.5;
        ctx.stroke();
        ctx.restore();

        // Label au-dessus du point
        ctx.fillStyle    = s.color;
        ctx.font         = 'bold 24px "Segoe UI", Arial, sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.shadowColor  = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur   = 3;
        ctx.fillText(s.label, bx, surfY - dotR - 3);
        ctx.shadowBlur   = 0;
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Interactions souris sur le canvas tube (drag source + balises)
// ══════════════════════════════════════════════════════════════════════

(function initVaguesMouse() {
    var dragTarget    = null; // null | 'beacon1' | 'beacon2' | 'lambda'
    var lambdaGrabDx  = 0;    // décalage souris ↔ extrémité gauche de la flèche, saisi au clic
    var DRAG_RADIUS_B = 14;  // px autour d'une balise pour le drag (vue du dessus)

    // En vue coupe, la balise ne se déplace que sur l'axe des x : la saisie
    // est bien plus facile si on ne demande pas de tomber pile sur le point
    // de surface (qui bouge avec la houle) mais sur toute une large bande
    // verticale au-dessus/en dessous de son abscisse.
    var COUPE_HIT_HALF_W = 22; // tolérance horizontale (px)
    var COUPE_HIT_MARGIN = 20; // marge verticale ajoutée à l'amplitude (px)

    function canvasCoords(e, canvas) {
        var rect   = canvas.getBoundingClientRect();
        var scaleX = canvas.clientWidth  / rect.width;
        var scaleY = canvas.clientHeight / rect.height;
        return {
            x : (e.clientX - rect.left) * scaleX,
            y : (e.clientY - rect.top)  * scaleY
        };
    }

    // Hit-test large en vue coupe : bande verticale généreuse autour de
    // l'abscisse de la balise plutôt qu'un cercle centré sur son point de
    // surface exact (qui oscille avec la houle et serait difficile à viser).
    function nearBeaconCoupe(mx, my, b) {
        if (!b.active || !b.snapped) return false;
        var dist = b.x - simVagues.sourceX;
        if (dist <= 0) return false;
        var bx = simVagues.coupeSrcX + dist;
        if (bx < simVagues.coupeSrcX || bx > simVagues.canvasW) return false;
        if (Math.abs(mx - bx) > COUPE_HIT_HALF_W) return false;
        var H      = simVagues.canvasH;
        var yLevel = Math.round(H / 2);
        var ampPx  = _coupeAmpPx(H);
        return my >= yLevel - ampPx - COUPE_HIT_MARGIN && my <= yLevel + ampPx + COUPE_HIT_MARGIN;
    }

    // Abscisse écran de l'extrémité gauche de la flèche λ, dans le repère
    // de la vue actuellement affichée (cf. commentaire sur lambdaOffsetFrac
    // dans simVagues, en tête de fichier).
    function lambdaScreenX1() {
        if (simVagues.viewMode === 'coupe') {
            return simVagues.coupeSrcX + (simVagues.lambdaX - simVagues.sourceX);
        }
        return simVagues.lambdaX;
    }

    // Hit-test : est-on sur la flèche de longueur d'onde (hampe, têtes, ou
    // pointillés de mise à niveau en vue coupe) ? Bande généreuse sur toute
    // la largeur de la flèche — même principe que nearLambdaArrow dans
    // tube.js (Son/Corde).
    function nearLambdaArrowVagues(mx, my) {
        if (!simVagues.lambdaVisible) return false;
        var lambdaPx = _vaguesLambdaPx();
        if (lambdaPx <= 0) return false;

        if (simVagues.viewMode === 'coupe') {
            var dist = simVagues.lambdaX - simVagues.sourceX;
            if (dist <= 0) return false;
            var srcX = simVagues.coupeSrcX;
            var x1c = srcX + dist, x2c = x1c + lambdaPx;
            var arrowY = _vaguesLambdaArrowYCoupe(simVagues.canvasW, simVagues.canvasH, srcX);
            var yLevel = Math.round(simVagues.canvasH / 2);
            return mx >= x1c - 10 && mx <= x2c + 10 && my >= arrowY - 10 && my <= yLevel;
        }

        var x1 = simVagues.lambdaX, x2 = x1 + lambdaPx;
        var sy = simVagues.sourceY;
        return mx >= x1 - 10 && mx <= x2 + 10 && Math.abs(my - sy) <= 12;
    }

    // Balise sous le curseur (ou null), tous modes de vue confondus — sert
    // au hit-test du clic comme au curseur adaptatif au survol.
    function beaconAt(mx, my) {
        var isCoupe = (simVagues.viewMode === 'coupe');
        if (simVagues.beacon1.active) {
            if (isCoupe) {
                if (nearBeaconCoupe(mx, my, simVagues.beacon1)) return 'beacon1';
            } else {
                var dx1 = mx - simVagues.beacon1.x, dy1 = my - simVagues.beacon1.y;
                if (Math.sqrt(dx1 * dx1 + dy1 * dy1) <= DRAG_RADIUS_B) return 'beacon1';
            }
        }
        if (simVagues.beacon2.active) {
            if (isCoupe) {
                if (nearBeaconCoupe(mx, my, simVagues.beacon2)) return 'beacon2';
            } else {
                var dx2 = mx - simVagues.beacon2.x, dy2 = my - simVagues.beacon2.y;
                if (Math.sqrt(dx2 * dx2 + dy2 * dy2) <= DRAG_RADIUS_B) return 'beacon2';
            }
        }
        return null;
    }

    function setup() {
        var canvas = document.getElementById('tube-canvas');
        if (!canvas) return;

        canvas.addEventListener('pointerdown', function(e) {
            if (typeof activeTab === 'undefined' || activeTab !== 'vagues') return;

            var pos = canvasCoords(e, canvas);
            var mx = pos.x, my = pos.y;

            // Drag des balises (priorité : cible ponctuelle, plus précise que
            // la flèche λ qui, elle, couvre toute une bande horizontale).
            var hitBeacon = beaconAt(mx, my);
            if (hitBeacon) {
                dragTarget = hitBeacon;
                canvas.setPointerCapture(e.pointerId);
                canvas.style.cursor = 'grabbing';
                return;
            }

            // Flèche de longueur d'onde : ne se déplace qu'horizontalement,
            // en bloc (sa taille suit λ, jamais le geste de la souris).
            if (nearLambdaArrowVagues(mx, my)) {
                dragTarget   = 'lambda';
                lambdaGrabDx = mx - lambdaScreenX1();
                canvas.setPointerCapture(e.pointerId);
                return;
            }
        });

        canvas.addEventListener('pointermove', function(e) {
            if (!dragTarget) {
                // Curseur adaptatif au survol d'une balise ou de la flèche λ.
                if (typeof activeTab !== 'undefined' && activeTab === 'vagues') {
                    var hoverPos = canvasCoords(e, canvas);
                    if (beaconAt(hoverPos.x, hoverPos.y)) {
                        canvas.style.cursor = 'grab';
                    } else if (nearLambdaArrowVagues(hoverPos.x, hoverPos.y)) {
                        canvas.style.cursor = 'ew-resize';
                    } else {
                        canvas.style.cursor = 'default';
                    }
                }
                return;
            }
            if (typeof activeTab === 'undefined' || activeTab !== 'vagues') { dragTarget = null; return; }

            if (dragTarget === 'lambda') {
                var posL = canvasCoords(e, canvas);
                var nx = posL.x - lambdaGrabDx;
                var dist;
                if (simVagues.viewMode === 'coupe') {
                    // Bornée à droite de la source : la vue coupe ne montre
                    // que le demi-axe x > 0 (cf. _drawLambdaArrowCoupeVagues).
                    dist = Math.max(0, Math.min(simVagues.canvasW - simVagues.coupeSrcX, nx - simVagues.coupeSrcX));
                } else {
                    nx = Math.max(0, Math.min(simVagues.canvasW, nx));
                    dist = nx - simVagues.sourceX;
                }
                simVagues.lambdaX = simVagues.sourceX + dist;
                if (simVagues.canvasW > 0) simVagues.lambdaOffsetFrac = dist / simVagues.canvasW;
                return;
            }

            var pos = canvasCoords(e, canvas);
            var mx  = Math.max(0, Math.min(simVagues.canvasW, pos.x));
            var my  = Math.max(0, Math.min(simVagues.canvasH, pos.y));
            var beacon = (dragTarget === 'beacon1') ? simVagues.beacon1 : simVagues.beacon2;

            // En vue coupe, seule l'abscisse compte : la balise reste sur
            // l'axe de propagation (demi-axe x > 0 depuis la source), sa
            // hauteur à l'écran est imposée par la houle, pas par la souris.
            if (simVagues.viewMode === 'coupe') {
                var dist = Math.max(0, Math.min(simVagues.canvasW - simVagues.coupeSrcX,
                                                 mx - simVagues.coupeSrcX));
                beacon.x       = simVagues.sourceX + dist;
                beacon.y       = simVagues.sourceY;
                beacon.rx      = beacon.x / simVagues.canvasW;
                beacon.ry      = beacon.y / simVagues.canvasH;
                beacon.snapped = true;
                _ytMarkMovedVagues(dragTarget === 'beacon1' ? 1 : 2);
                return;
            }

            // Snap à l'axe x avec hystérésis :
            //   entrée : ≤12 px de l'axe   |   sortie : >25 px de l'axe
            var axisY    = simVagues.sourceY;
            var SNAP_IN  = 12, SNAP_OUT = 25;
            var dist2ax  = Math.abs(my - axisY);
            var snapped  = beacon.snapped ? (dist2ax <= SNAP_OUT) : (dist2ax <= SNAP_IN);
            if (snapped) my = axisY;

            if (dragTarget === 'beacon1') {
                simVagues.beacon1.x = mx;
                simVagues.beacon1.y = my;
                simVagues.beacon1.rx = mx / simVagues.canvasW;
                simVagues.beacon1.ry = my / simVagues.canvasH;
                simVagues.beacon1.snapped = snapped;
                // Hors de l'axe, rien n'est enregistré : la trace est vidée.
                // Sur l'axe, elle est recalculée pour la nouvelle distance.
                if (!snapped) { _ytClear(1); } else { _ytMarkMovedVagues(1); }
            } else if (dragTarget === 'beacon2') {
                simVagues.beacon2.x = mx;
                simVagues.beacon2.y = my;
                simVagues.beacon2.rx = mx / simVagues.canvasW;
                simVagues.beacon2.ry = my / simVagues.canvasH;
                simVagues.beacon2.snapped = snapped;
                if (!snapped) { _ytClear(2); } else { _ytMarkMovedVagues(2); }
            }
        });

        canvas.addEventListener('pointerup', function(e) {
            dragTarget = null;
            var upPos = canvasCoords(e, canvas);
            canvas.style.cursor = beaconAt(upPos.x, upPos.y) ? 'grab'
                : (nearLambdaArrowVagues(upPos.x, upPos.y) ? 'ew-resize' : 'default');
        });

        canvas.addEventListener('pointerleave', function() {
            dragTarget = null;
            canvas.style.cursor = 'default';
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();
