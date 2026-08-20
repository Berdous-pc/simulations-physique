// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  sim.js — État global et physique de la simulation d'onde sonore
//  Chargé en PREMIER. Expose l'objet `sim` et toutes les fonctions
//  physiques utilisées par tube.js, graph.js et ui.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Formatage numérique ───────────────────────────────────────────────
// Convention française : séparateur décimal = virgule. À utiliser pour TOUT
// nombre affiché à l'élève (graduations d'axes, étiquettes de survol, readouts),
// aussi bien dans le DOM que dans les canvas.
function fmtFR(v, decimals) {
    var s = (decimals === undefined) ? String(v) : Number(v).toFixed(decimals);
    return s.replace('.', ',');
}

// Comme fmtFR, mais avec un arrondi « logique » (moitié vers le haut) au lieu
// du toFixed brut : toFixed hérite des imprécisions binaires du flottant
// (ex. (1.235).toFixed(2) === "1.23" alors qu'on attend "1,24"). On corrige
// en ajoutant une épsilon avant l'arrondi, ce qui recale les valeurs qui
// tombent tout juste sous la moitié à cause de la représentation binaire.
function fmtFRRound(v, decimals) {
    if (!isFinite(v)) v = 0;
    var factor  = Math.pow(10, decimals);
    var rounded = Math.sign(v) * Math.round(Math.abs(v) * factor + 1e-9) / factor;
    return rounded.toFixed(decimals).replace('.', ',');
}

// ── Tampon circulaire générique (séries y(t) / ΔP(t) des 3 onglets) ────
// Remplace push()+shift() sur un tableau d'objets : shift() décale tout le
// contenu en O(n) à chaque échantillon (300/s), pesant lourd sur la durée.
// Écriture ici en O(1) sur des Float32Array pré-allouées.
function _cbufMake(cap) {
    return { cap: cap, t: new Float32Array(cap), y: new Float32Array(cap), head: 0, n: 0 };
}
function _cbufPush(buf, t, y) {
    var i = (buf.head + buf.n) % buf.cap;
    buf.t[i] = t;
    buf.y[i] = y;
    if (buf.n < buf.cap) buf.n++;
    else                 buf.head = (buf.head + 1) % buf.cap;
}
function _cbufClear(buf) {
    buf.head = 0;
    buf.n    = 0;
}
// Index physique du i-ème point, du plus ancien au plus récent.
function _cbufIdx(buf, i) {
    var j = buf.head + i;
    return (j < buf.cap) ? j : j - buf.cap;
}

// ══════════════════════════════════════════════════════════════════════
//  Historique de la source — mécanique partagée par les onglets Son et Corde
//
//  Ces onglets ne recalculent PAS le champ à partir des réglages courants :
//  ils enregistrent ce que la source a réellement émis, échantillon par
//  échantillon, puis relisent cet historique en retard. C'est ce qui garantit
//  qu'une onde déjà partie ne peut plus être ni modifiée ni effacée par un
//  changement de réglage ou par une relance de la source.
//
//  Deux tampons circulaires parallèles :
//    • srcD — déplacement émis par la source, unité propre à l'onglet
//    • srcS — abscisse curviligne cumulée S(t) = ∫ c dt, soit la distance
//             totale parcourue depuis t = 0 par un front parti à t = 0
//
//  Un point situé à la distance x lit l'échantillon dont le S vaut S(t) − x :
//  inverser S revient à remonter au temps d'émission, ce qui reste exact même
//  si c a changé entre-temps.
//
//    • pas : 1/600 s de temps simulé → 120 points par période à la fréquence
//      max (5 Hz), tracé lisse en toutes circonstances
//    • capacité : 40 s, soit largement le temps de trajet le plus long
//      (Corde : c_min ≈ 0,35 m/s sur 5 m ≈ 14 s ; Son : c_min ≈ 3,5 cm/s
//      sur 40 cm ≈ 11 s)
// ══════════════════════════════════════════════════════════════════════

var SRC_DT  = 1 / 600;
var SRC_CAP = Math.round(40 / SRC_DT);

function _srcAlloc(s) {
    if (!s.srcD) {
        s.srcD = new Float32Array(SRC_CAP);
        s.srcS = new Float64Array(SRC_CAP);
        s.srcA = new Float32Array(SRC_CAP);
        s.srcQ = new Float32Array(SRC_CAP);
    }
}

// Index physique de l'échantillon n° k (k = 0 → le plus ancien)
function _srcIdx(s, k) {
    return (s.srcHead - s.srcN + k + SRC_CAP) % SRC_CAP;
}

function _srcClear(s) {
    s.srcN      = 0;
    s.srcHead   = 0;
    s.srcTNew   = 0;
    s.srcSCur   = 0;
    s.lastEmitT = -1e9;
    s.srcKMin   = Infinity;
    s.srcSeq++;
}

// Écrit un échantillon : d = déplacement émis, cAdvance = célérité courante
// dans l'unité de longueur de l'onglet (m/s pour la Corde, cm/s pour le Son).
// aux = grandeur auxiliaire figée à l'émission, propre à l'onglet (le Son y
// range le nombre d'onde, cf. stepSourceSon ; la Corde n'en a pas l'usage).
// auxQ = 2e grandeur auxiliaire, réservée au Son (cf. PERIODIC_DP_FACTOR) :
// facteur correcteur de ΔP figé à l'émission, propre au mode de la source
// à cet instant — nécessaire pour qu'une portion d'onde émise en Périodique
// garde SA correction même après un changement de mode.
function _srcPush(s, t, d, cAdvance, aux, auxQ) {
    _srcAlloc(s);
    if (d !== 0) s.lastEmitT = t;
    s.srcSCur += cAdvance * SRC_DT;
    s.srcD[s.srcHead] = d;
    s.srcS[s.srcHead] = s.srcSCur;
    s.srcA[s.srcHead] = aux || 0;
    s.srcQ[s.srcHead] = auxQ || 1;
    s.srcHead = (s.srcHead + 1) % SRC_CAP;
    if (s.srcN < SRC_CAP) s.srcN++;
    s.srcTNew = t;
    s.srcSeq++;
}

// S(t) : distance cumulée à l'instant t. Au-delà du dernier échantillon,
// extrapolation linéaire à la célérité courante (le point « vivant » des
// graphes est demandé à simTime, entre deux échantillons).
function _srcSAtTime(s, t, cNow) {
    var n = s.srcN;
    if (n === 0) return 0;
    if (t >= s.srcTNew) return s.srcSCur + cNow * (t - s.srcTNew);

    var tOld = s.srcTNew - (n - 1) * SRC_DT;
    if (t <= tOld) return s.srcS[_srcIdx(s, 0)];

    var f = (t - tOld) / SRC_DT;
    var k = Math.floor(f);
    if (k >= n - 1) return s.srcS[_srcIdx(s, n - 1)];
    var sA = s.srcS[_srcIdx(s, k)];
    var sB = s.srcS[_srcIdx(s, k + 1)];
    return sA + (sB - sA) * (f - k);
}

// Échantillon émis quand le front avait parcouru la distance sT : renvoie à la
// fois le déplacement (.d) et la grandeur auxiliaire (.a). S étant croissante
// (c > 0), on inverse par dichotomie. Un sT antérieur au plus ancien
// échantillon signifie que l'onde n'est pas encore arrivée : .d = 0.
//
// Objet de sortie réutilisé d'un appel à l'autre : la fonction est appelée
// quelques milliers de fois par frame, allouer y serait coûteux. La valeur
// renvoyée doit donc être consommée immédiatement.
var _srcOut = { d: 0, a: 0, q: 1 };

function _srcSampleAtS(s, sT) {
    _srcOut.d = 0;
    _srcOut.a = 0;
    _srcOut.q = 1;

    var n = s.srcN;
    if (n === 0) return _srcOut;

    if (sT <= s.srcS[_srcIdx(s, 0)]) return _srcOut;

    var iLast = _srcIdx(s, n - 1);
    if (sT >= s.srcS[iLast]) {
        _srcOut.d = s.srcD[iLast];
        _srcOut.a = s.srcA[iLast];
        _srcOut.q = s.srcQ[iLast];
        return _srcOut;
    }

    // Plus grand k tel que S(k) ≤ sT
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) {
        var mid = (lo + hi) >> 1;
        if (s.srcS[_srcIdx(s, mid)] <= sT) lo = mid;
        else                               hi = mid;
    }
    var iA = _srcIdx(s, lo);
    var iB = _srcIdx(s, hi);
    var span = s.srcS[iB] - s.srcS[iA];
    var f    = (span > 0) ? (sT - s.srcS[iA]) / span : 0;

    _srcOut.d = s.srcD[iA] + (s.srcD[iB] - s.srcD[iA]) * f;
    _srcOut.a = s.srcA[iA] + (s.srcA[iB] - s.srcA[iA]) * f;
    _srcOut.q = s.srcQ[iA] + (s.srcQ[iB] - s.srcQ[iA]) * f;
    return _srcOut;
}

function _srcDAtS(s, sT) {
    return _srcSampleAtS(s, sT).d;
}

// « Au repos » = plus rien n'est émis, et la dernière perturbation émise a eu
// le temps de traverser toute la longueur affichée. Sert à décider si l'on
// peut réinitialiser la fenêtre du graphe temporel sans couper une courbe.
function _srcIsQuiet(s, length, c) {
    if (s.sinusoidalActive || s.periodicActive || s.impulses.length > 0) return false;
    if (c <= 0) return true;
    return (s.simTime - s.lastEmitT) > length / c;
}

// Écriture scientifique : mantisse à `decimals` décimales × 10^exposant.
// Renvoie du HTML (exposant en <sup>, signe moins typographique) — à injecter
// via innerHTML, pas textContent.
function fmtSciHTML(v, decimals) {
    if (!isFinite(v) || v === 0) return fmtFR(0, decimals);

    var exp  = Math.floor(Math.log10(Math.abs(v)));
    var mant = v / Math.pow(10, exp);
    // L'arrondi peut faire basculer la mantisse à 10,00 (ex. 9,999 → 10,00) :
    // on recale d'une décade pour rester dans [1 ; 10[.
    if (Math.abs(Number(mant.toFixed(decimals))) >= 10) { mant /= 10; exp += 1; }

    // Puissance 0 : pas d'intérêt à afficher « × 10^0 ».
    if (exp === 0) return fmtFR(mant, decimals);

    return fmtFR(mant, decimals) + ' × 10<sup>' + String(exp).replace('-', '−') + '</sup>';
}

// ── Constantes de calibration ─────────────────────────────────────────
// Valeurs par défaut des paramètres (pour calibrer C_BASE à la resize)
// K_DEFAULT doit rester DANS la plage du curseur (index.html, min 5,0) :
// une valeur en dehors serait clampée par le navigateur à l'affichage,
// laissant sim.K et le curseur en désaccord au chargement.
var K_DEFAULT        = 6.0;   // compressibilité par défaut
var RHO_DEFAULT      = 1.0;   // masse volumique par défaut
// C_DISPLAY_FACTOR : c_norm * C_DISPLAY_FACTOR = célérité affichée en cm/s
// sqrt(K_DEFAULT/RHO_DEFAULT) * 10 = sqrt(6) * 10 ≈ 24,5 cm/s par défaut
var C_DISPLAY_FACTOR = 10.0;
// Longueur physique du tube représentée par tubeLength pixels
var TUBE_LENGTH_CM   = 40.0;
// C_BASE : px/s par unité de c_norm — recalibré dans tube.js resize()
// Cible : onde traverse le tube (~700px) en ~8s avec c_norm=2 → C_BASE ≈ 700/(8*2) ≈ 43
var C_BASE           = 43.0;
// Durée de l'impulsion = 1 période complète (aller-retour membrane)
// Valeur réduite (0.6 s) pour un paquet d'onde compact et bien visible
var T_IMPULSE        = 0.6;   // secondes de temps simulé
// Nombre max de points enregistrés pour ΔP(t)
var DP_MAX_POINTS    = 1600;  // 300 pts/s × 5 s + marge → courbes lisses sur la fenêtre entière
// Aire disponible par particule à ρ = 1, en px² : fixe le nombre de particules
// dans initCols, et le seuil de saturation dans particleRadius.
var COL_SLOT_PX2     = 113;   // ≈ 25 % de remplissage à ρ = 1

// ── État global de la simulation ──────────────────────────────────────
var sim = {

    // ── Contrôle de l'animation ─────────────────────────────────────
    paused      : false,   // démarre en marche (agitation thermique visible)
    simTime     : 0,       // temps simulé cumulé (s)

    // ── Mode source : null | 'impulse' | 'sinus' | 'periodic' ───────────
    sourceMode        : null,   // aucun mode actif au chargement
    impulsePropagating: false,  // true = une impulsion est en cours de propagation
    sourceActiveUntil : 0,      // fin du mouvement de la membrane (mode Impulsion)

    // ── Source — composante sinusoïdale ─────────────────────────────
    //  sinPhase : phase accumulée (rad), jamais recalculée depuis un instant
    //  de départ — changer f n'introduit donc aucun saut de phase.
    sinusoidalActive : false,    // oscillation en cours
    sinPhase         : 0,

    // ── Source — composante périodique non sinusoïdale (multi-lobes) ────
    periodicActive : false,
    periodicPhase  : 0,

    // ── Enveloppe de démarrage / d'arrêt de la source continue ──────────
    //  sonEmitMode : signal RÉELLEMENT émis, extinction comprise. Il survit
    //  donc à sinusoidalActive / periodicActive le temps de la descente.
    //  sonEnv : progression de l'enveloppe dans [0, 1] (cf. stepSourceSon).
    sonEmitMode : null,
    sonEnv      : 0,

    // ── Source — impulsions (superposables) ─────────────────────────
    // Chaque entrée : { startTime }  (1 période de sinus = T_IMPULSE)
    impulses : [],

    // ── Historique de la source (cf. _srcPush / _srcDAtS) ────────────
    //  srcD est enregistré NORMALISÉ (sans dimension, dans [−1, 1]) et non
    //  en pixels : memAmplitude est recalibrée à chaque resize, et une
    //  amplitude figée en pixels ne suivrait pas le redimensionnement.
    //  srcS progresse en centimètres, l'unité physique du tube.
    srcD    : null,
    srcS    : null,
    srcN    : 0,
    srcHead : 0,
    srcTNew : 0,
    srcSCur : 0,
    srcA    : null,   // nombre d'onde figé à l'émission (rad/cm)
    srcSeq  : 0,
    lastEmitT : -1e9,
    srcKMin   : Infinity,   // plus petit k émis — dimensionne les zones virtuelles

    // ── Paramètres physiques du milieu ───────────────────────────────
    freq        : 1.5,            // fréquence de la sinusoïdale (Hz)
    rho         : RHO_DEFAULT,    // masse volumique (u.s.)
    K           : K_DEFAULT,      // module de compressibilité (u.s.)
    attenuation : 0.0,            // coefficient d'atténuation (0 = aucun, 1 = fort)

    // ── Propriétés dérivées (recalculées par updateCelerite) ─────────
    c_sim : 0,    // célérité en px/s (pour l'animation)
    c_cms : 0,    // célérité en cm/s (affichée à l'utilisateur)

    // ── Amplitude de la membrane (recalibrée dans tube.js resize) ────
    memAmplitude : 10,    // px

    // ── Particules — modèle lagrangien continu ───────────────────────
    // Chaque particule : { x0 (position de repos en px depuis tubeLeft),
    //                      selected, ry (position y en [0,1], gelée en pause) }
    // N ∝ ρ (linéaire). Domaine [0, tubeLength + 2×memAmplitude].
    // Position affichée : tubeLeft + x0 + waveDisplacementDisplay(x0, t)
    cols              : [],
    colsSig           : null,    // géométrie pour laquelle cols a été construit
    colsL             : 0,       // tubeLength correspondante (transposition sélection)
    selectionMode     : false,   // mode sélection par proximité actif
    selectionRadius   : 25,      // px, rayon de sélection (recalculé dans initCols)

    // ── Balises (lignes verticales draggables dans le tube) ──────────
    // frac = position relative (0–1) le long du tube — utilisée pour
    // recalculer x au resize et garder la balise à distance constante
    // de la membrane, indépendamment de la largeur du canvas.
    beacon1 : { active: false, x: 0, frac: 0.30 },   // balise 1 (orange)
    beacon2 : { active: false, x: 0, frac: 0.65 },   // balise 2 (vert)

    // ── Flèche de longueur d'onde (draggable horizontalement) ─────────
    // lambdaX = abscisse écran de l'extrémité gauche de la flèche ;
    // lambdaFrac = même position en relatif (0–1) le long du tube, utilisée
    // pour recalculer lambdaX au resize (comme les balises). La largeur,
    // elle, n'est jamais stockée : recalculée à chaque frame depuis c_sim
    // et freq, pour suivre en direct tout changement de λ.
    lambdaVisible : false,
    lambdaX       : 0,
    lambdaFrac    : 0.08,

    // ── Géométrie du tube (renseignée par tube.js resize) ────────────
    tubeLeft   : 0,
    tubeRight  : 0,
    tubeTop    : 0,
    tubeBottom : 0,
    tubeLength : 0,    // = tubeRight − tubeLeft (px)

    // ── Mode coloriage par pression ─────────────────────────────────
    pressureColorMode : false,   // true = particules et fond colorés selon ΔP

    // ── Données graphes ──────────────────────────────────────────────
    //  dpxX/dpxY (Float32Array) : snapshot ΔP(x) courant, partagé par le
    //  tracé et le hover snappé — dpxSig évite de le recalculer quand rien
    //  n'a changé (typiquement en pause).
    graphMode : 'dpx',   // 'dpx' (spatial) | 'dpt' (temporel)
    dpxX      : null,
    dpxY      : null,
    dpxN      : 0,
    dpxSig    : null,
    dptBuf1   : null,    // tampon circulaire — série temporelle balise 1
    dptBuf2   : null,    // tampon circulaire — série temporelle balise 2
    // Horloge du graphe ΔP(t) : null tant qu'aucune source n'a été activée
    // depuis le dernier changement de mode/RAZ (graphe en attente) ; sinon
    // simTime au moment de la 1ère activation (origine de la fenêtre glissante).
    dptTimeOrigin : null,
    dptArmedMode  : null,   // mode ('impulse' | 'sinus') pour lequel dptTimeOrigin est valide

    // ── Vue graphe ΔP(t) ─────────────────────────────────────────────
    graphView        : { xMin: 0, xMax: 5, yMin: -1, yMax: 1 },
    graphCursorMode  : false,

    // ── Vue graphe ΔP(x) ─────────────────────────────────────────────
    graphDpxYMin : -1,
    graphDpxYMax :  1,

    // ── Options : zone graphe affichée ou non (désactivé par défaut) ──
    graphVisible     : false,
};

// ══════════════════════════════════════════════════════════════════════
//  Calcul de la célérité
// ══════════════════════════════════════════════════════════════════════

function updateCelerite() {
    if (sim.rho <= 0) return;
    var c_norm = Math.sqrt(sim.K / sim.rho);   // vitesse normalisée (u.s./s)
    sim.c_sim  = c_norm * C_BASE;              // px/s
    sim.c_cms  = c_norm * C_DISPLAY_FACTOR;    // cm/s (affiché)
}

// Le tube est « au repos » : cf. _srcIsQuiet.
function sonIsQuiet() {
    return _srcIsQuiet(sim, TUBE_LENGTH_CM, sim.c_cms);
}

// ══════════════════════════════════════════════════════════════════════
//  Avancement de la source son (membrane) d'un pas SRC_DT
//
//  Appelé à pas fixe par la boucle d'animation (ui.js). C'est le SEUL
//  endroit où l'on consulte freq / c : une fois l'échantillon écrit, il est
//  figé. Bouger un curseur n'affecte donc que la suite de l'émission, jamais
//  l'onde déjà présente dans le tube.
//
//  Le déplacement est enregistré NORMALISÉ (sans dimension) ; il est remis à
//  l'échelle par memAmplitude au moment de la lecture, ce qui laisse le
//  redimensionnement de la fenêtre agir correctement sur toute l'onde.
// ══════════════════════════════════════════════════════════════════════

function stepSourceSon(t) {
    var d = 0;

    // ── Enveloppe de démarrage / d'arrêt de la source continue ────────
    // Une sinusoïde démarrée brutalement est continue en u, mais PAS en
    // ∂u/∂x — or c'est ∂u/∂x que l'élève voit (densité des particules) et
    // que trace le graphe ΔP. Le tout premier lobe de compression arrivait
    // donc avec un bord franc et ne mesurait qu'un QUART de longueur d'onde
    // au lieu d'une demie ; l'arrêt produisait la même coupure nette à
    // l'arrière du train d'ondes.
    // On module donc l'amplitude par une enveloppe demi-cosinus étalée sur
    // exactement UNE période : la source démarre et s'arrête comme un vrai
    // haut-parleur, dont la membrane ne peut pas accélérer instantanément.
    // Passé cette période, le signal est une sinusoïde pure — la longueur
    // d'onde reste donc mesurable partout ailleurs.
    var wantMode = sim.sinusoidalActive ? 'sinus'
                 : sim.periodicActive   ? 'periodic'
                 : null;

    // Changer de type de source pendant l'extinction : on repart de zéro
    // plutôt que de faire hériter la nouvelle forme de l'enveloppe en cours.
    if (wantMode && wantMode !== sim.sonEmitMode) {
        sim.sonEmitMode = wantMode;
        sim.sonEnv      = 0;
    }

    var envStep = Math.max(0.2, sim.freq) * SRC_DT;   // 1 période pour 0 → 1
    if (wantMode) {
        sim.sonEnv = Math.min(1, sim.sonEnv + envStep);
    } else if (sim.sonEmitMode) {
        sim.sonEnv = Math.max(0, sim.sonEnv - envStep);
        if (sim.sonEnv === 0) sim.sonEmitMode = null;
    }
    var env = (1 - Math.cos(Math.PI * sim.sonEnv)) / 2;

    // ── Composante sinusoïdale : phase accumulée ──────────────────────
    if (sim.sonEmitMode === 'sinus') {
        sim.sinPhase += 2 * Math.PI * sim.freq * SRC_DT;
        if (sim.sinPhase > 2 * Math.PI) sim.sinPhase -= 2 * Math.PI;
        d += env * Math.sin(sim.sinPhase);
    }

    // ── Composante périodique non sinusoïdale (multi-lobes, asymétrique) ──
    // Harmoniques renforcées par rapport à la Corde, le Son n'affichant que
    // ∂u/∂x — cf. le bloc PERIODIC_*_SON. La pente du motif valant 2,48 fois
    // celle d'une sinusoïde de même amplitude, c'est PERIODIC_DP_FACTOR
    // (rangé dans srcQ) qui en tient compte à la lecture, pour ΔP comme pour
    // l'amplitude d'affichage.
    if (sim.sonEmitMode === 'periodic') {
        sim.periodicPhase += 2 * Math.PI * sim.freq * SRC_DT;
        if (sim.periodicPhase > 2 * Math.PI) sim.periodicPhase -= 2 * Math.PI;
        var p = sim.periodicPhase;
        d += env * PERIODIC_NORM_SON
                 * (Math.sin(p) + PERIODIC_A3_SON * Math.sin(3 * p)
                                + PERIODIC_A2_SON * Math.sin(2 * p));
    }

    // ── Composantes impulsions (superposables) ────────────────────────
    // Forme du déplacement membranaire : (1 − cos(2π × τ/T)) / 2
    // → démarre à 0, monte doucement, revient à 0 en T (enveloppe demi-cosinus).
    // Sa dérivée spatiale (= ΔP dans le graphe) est un sinus pur sur [0, 2π] :
    // compression (+) puis détente (−), exactement 1 période propre.
    for (var i = 0; i < sim.impulses.length; i++) {
        var tau = t - sim.impulses[i].startTime;
        if (tau >= 0 && tau <= T_IMPULSE) {
            d += (1 - Math.cos(2 * Math.PI * tau / T_IMPULSE)) / 2;
        }
    }

    // ── Nombre d'onde figé à l'émission (rad/cm) ──────────────────────
    // C'est lui qui, à la lecture, fixera le gain d'affichage des colonnes
    // (cf. _sonDisplayGain). L'enregistrer par échantillon est indispensable :
    // un gain global recalculé à partir de la fréquence COURANTE redimensionnait
    // d'un coup les zones de compression dans tout le tube dès qu'on touchait
    // au curseur f. En cm⁻¹ pour survivre aux redimensionnements de fenêtre.
    var freqEff = (sim.sourceMode === 'impulse') ? 1.0 / T_IMPULSE : sim.freq;
    var k_cm    = (sim.c_cms > 0) ? 2 * Math.PI * freqEff / sim.c_cms : 0;

    if (d !== 0 && k_cm > 0 && k_cm < sim.srcKMin) sim.srcKMin = k_cm;

    // Facteur correcteur de ΔP figé à l'émission (cf. PERIODIC_DP_FACTOR) :
    // 1 pour Impulsion/Sinusoïdale, où la normalisation de waveDeltaP est déjà
    // exacte ; le facteur propre au signal multi-harmoniques en Périodique.
    var dpFactor = (sim.sonEmitMode === 'periodic') ? PERIODIC_DP_FACTOR : 1;

    _srcPush(sim, t, d, sim.c_cms, k_cm, dpFactor);
}

// ══════════════════════════════════════════════════════════════════════
//  Gain d'affichage des colonnes
//
//  Le déplacement physique des particules est bien trop petit ou bien trop
//  grand selon les réglages : A·k (la modulation de densité) couvre trois
//  décades sur les plages de curseurs. On le ramène dans [AK_MIN, AK_CAP] :
//    • en dessous : on amplifie, sinon la compression est invisible
//    • au-dessus  : on plafonne, sinon les colonnes se chevauchent
//  Le calcul se fait à partir du k FIGÉ À L'ÉMISSION, donc chaque portion de
//  l'onde garde son propre gain : changer f n'affecte plus l'affichage de ce
//  qui est déjà parti.
// ══════════════════════════════════════════════════════════════════════

// Le fond du tube n'est colorié que sur demande : la lisibilité de la
// compression repose donc bien sur la seule position des particules, et les
// bornes doivent rester franches. Elles sont malgré tout en retrait des
// valeurs d'origine (0,55 / 0,90), le plafond absolu ci-dessous ayant pris
// en charge le cas qui les rendait disgracieuses — les grandes longueurs
// d'onde, où l'amplitude devenait énorme.
var AK_MIN = 0.45;
var AK_CAP = 0.75;

// ── Plafond absolu d'amplitude affichée ───────────────────────────────
// A·k doit rester dans [AK_MIN, AK_CAP], donc l'amplitude affichée est
// nécessairement PROPORTIONNELLE à λ : aux grandes longueurs d'onde
// (f = 0,5 Hz, λ = tube entier) elle atteignait le tiers de la hauteur du
// tube, et la membrane pompait de façon disgracieuse. On la borne donc en
// dur à une fraction de la hauteur du tube. Le contraste de densité passe
// alors sous AK_MIN : c'est le prix à payer, mais il ne se paie qu'aux très
// basses fréquences, où la compression s'étale sur tout le tube et reste
// lisible malgré un contraste plus doux.
//
// Le plafond ne dépend QUE de la géométrie du tube : il est donc aussi ce
// qui dimensionne les zones virtuelles de particules (cf. initCols), qui
// n'ont ainsi plus à être reconstruites quand f ou K changent.
var SON_A_MAX_FRAC = 0.13;

function sonMaxDisplayPx() {
    var H = sim.tubeBottom - sim.tubeTop;
    return (H > 0) ? H * SON_A_MAX_FRAC : sim.memAmplitude;
}

// q = facteur de forme du signal émis (srcQ) : rapport entre la pente maximale
// réelle du motif et celle d'une sinusoïde de même amplitude. Vaut 1 en
// Sinusoïdale et en Impulsion, PERIODIC_DP_FACTOR en Périodique.
//
// Il DOIT entrer dans le budget, sinon on calibre sur le seul fondamental
// alors que les harmoniques dominent la pente. En Périodique la pente réelle
// valait A·k × 2,32, donc bien au-delà de 1 : or |∂u/∂x| > 1 signifie que
// x₀ ↦ x₀ + u n'est plus monotone — les particules se REPLIENT les unes sur
// les autres. Les trois lobes du motif (3,5 / 0,95 / 0,95) saturaient alors
// en trois bandes d'aspect identique, et la période apparente devenait λ/3
// alors que la vraie période est bien λ = c/f. C'était un artefact de rendu,
// pas une erreur sur λ.
function _sonDisplayGain(k_cm, q) {
    if (k_cm <= 0 || sim.tubeLength <= 0) return 1.0;
    var k_px = k_cm * TUBE_LENGTH_CM / sim.tubeLength;   // rad/px
    var ak   = sim.memAmplitude * k_px * (q > 0 ? q : 1);
    if (ak <= 0) return 1.0;
    var g    = Math.max(AK_MIN, Math.min(AK_CAP, ak)) / ak;
    // Plafond absolu : A × g ≤ sonMaxDisplayPx()
    var gMax = (sim.memAmplitude > 0) ? sonMaxDisplayPx() / sim.memAmplitude : 1.0;
    return Math.min(g, gMax);
}

// ══════════════════════════════════════════════════════════════════════
//  Contraste de densité RÉELLEMENT AFFICHÉ à l'abscisse x_px
//
//  C'est le A·k du champ d'AFFICHAGE, gain de lisibilité compris — donc la
//  mesure de ce que les particules peuvent montrer à cet endroit. En
//  dépliant le gain, il vaut
//
//      ak_disp = min( clamp(A·k, AK_MIN, AK_CAP) , sonMaxDisplayPx()·k )
//
//  et l'amplitude de la membrane en disparaît : seul compte le rapport
//  entre la HAUTEUR du tube et la longueur d'onde. C'est pourquoi le
//  contraste s'effondre aux grandes λ (le plafond absolu prend la main et
//  neutralise le relèvement par AK_MIN) et pourquoi écraser le volet
//  d'animation avec le splitter le dégrade lui aussi.
//
//  À ne PAS confondre avec waveDeltaP, qui est normalisée sur l'amplitude
//  PHYSIQUE et atteint donc ±1 quels que soient les réglages : ΔP dit où
//  sont les compressions, ak_disp dit si elles sont visibles.
//
//  Comme le gain, la valeur est lue dans l'HISTORIQUE : c'est le nombre
//  d'onde figé à l'émission qui compte, pas la fréquence courante, sinon
//  bouger f requalifierait d'un coup toute l'onde déjà propagée.
//
//  L'atténuation n'entre volontairement pas dans le calcul : elle réduit
//  déjà ΔP dans les mêmes proportions (waveDeltaP normalise par une
//  amplitude non atténuée), et la compter deux fois surdoserait tout ce
//  qui s'appuie là-dessus. Renvoie 0 là où l'onde n'est pas encore arrivée.
// ══════════════════════════════════════════════════════════════════════

function sonDisplayAkAt(x_px, t_sim) {
    if (sim.tubeLength <= 0) return 0;

    var cmPerPx = TUBE_LENGTH_CM / sim.tubeLength;
    var smp  = _srcSampleAtS(sim, _srcSAtTime(sim, t_sim, sim.c_cms) - x_px * cmPerPx);
    // Copie immédiate : _srcOut est réutilisé d'un appel à l'autre.
    var k_cm = smp.a;
    var q    = smp.q;
    if (k_cm <= 0) return 0;

    var ak = sim.memAmplitude * (k_cm * cmPerPx) * (q > 0 ? q : 1);
    return ak * _sonDisplayGain(k_cm, q);
}

// ══════════════════════════════════════════════════════════════════════
//  Déplacement d'onde au point x_px (distance depuis bord gauche du
//  tube, en px) au temps t_sim.
//
//  Modèle : onde progressive amortie, pas de réflexion à l'extrémité. Le
//  point situé à la distance x lit ce que la membrane a émis quand le front
//  avait parcouru S(t) − x :
//      u(x, t) = d_émis(S(t) − x) × memAmplitude × exp(−α·x/L)
//
//  Retourne des pixels (échelle d'affichage des colonnes). x_px est converti
//  en centimètres : la propagation est ainsi indépendante de la taille du
//  canvas.
// ══════════════════════════════════════════════════════════════════════

function waveDisplacement(x_px, t_sim) {
    if (sim.tubeLength <= 0) return 0;

    var x_cm = x_px * TUBE_LENGTH_CM / sim.tubeLength;
    var d    = _srcDAtS(sim, _srcSAtTime(sim, t_sim, sim.c_cms) - x_cm);
    if (d === 0) return 0;

    var alpha = sim.attenuation * 5;     // amortissement (×5 pour visibilité sur L)
    return d * sim.memAmplitude * Math.exp(-alpha * x_cm / TUBE_LENGTH_CM);
}

// ══════════════════════════════════════════════════════════════════════
//  Déplacement D'AFFICHAGE : idem, mais pondéré par le gain de lisibilité
//  propre à l'échantillon lu (cf. _sonDisplayGain). Réservé au rendu des
//  colonnes et de la membrane — la physique (waveDeltaP, graphes) utilise
//  waveDisplacement, qui n'est pas pondérée.
// ══════════════════════════════════════════════════════════════════════

function waveDisplacementDisplay(x_px, t_sim) {
    if (sim.tubeLength <= 0) return 0;

    var x_cm = x_px * TUBE_LENGTH_CM / sim.tubeLength;
    var smp  = _srcSampleAtS(sim, _srcSAtTime(sim, t_sim, sim.c_cms) - x_cm);
    if (smp.d === 0) return 0;

    var alpha = sim.attenuation * 5;
    return smp.d * sim.memAmplitude * _sonDisplayGain(smp.a, smp.q)
                 * Math.exp(-alpha * x_cm / TUBE_LENGTH_CM);
}

// ══════════════════════════════════════════════════════════════════════
//  Surpression ΔP au point x_px au temps t_sim
//  ΔP = −K × ∂u/∂x  → approximation par différences finies centrées
// ══════════════════════════════════════════════════════════════════════

function waveDeltaP(x_px, t_sim) {
    if (sim.tubeLength <= 0) return 0;

    // Nombre d'onde LOCAL, lu dans l'historique : comme le gain d'affichage,
    // la normalisation doit être calée sur ce qui a été émis à cet endroit et
    // non sur la fréquence courante — sinon bouger f redimensionne d'un coup
    // toute la courbe, y compris la partie déjà propagée.
    // (On copie la valeur : _srcOut est réutilisé par les appels suivants.)
    var cmPerPx = TUBE_LENGTH_CM / sim.tubeLength;
    var smp  = _srcSampleAtS(sim, _srcSAtTime(sim, t_sim, sim.c_cms) - x_px * cmPerPx);
    var k_cm = smp.a;
    if (k_cm <= 0) return 0;

    var aEff = (sim.sourceMode === 'impulse') ? sim.memAmplitude / 2 : sim.memAmplitude;
    var kEff = k_cm * cmPerPx;   // rad/px
    // Facteur correcteur figé à l'émission (1 en Impulsion/Sinusoïdale, cf.
    // PERIODIC_DP_FACTOR en Périodique) : ΔP dérive le déplacement, ce qui
    // amplifie chaque harmonique du signal multi-lobes par son propre rang —
    // sans cette correction, ΔP en Périodique dépasserait largement dpMax.
    var dpFactor = smp.q;

    // ── Pas h adaptatif ───────────────────────────────────────────────
    // h doit être petit devant λ = 2π/k pour que la DFC soit précise.
    // On cible h = λ/20 = π/(10k), borné par un minimum de 0.5 px
    // et un maximum de L/100 (pour ne pas être trop grand sur le domaine).
    var hIdeal = (kEff > 0) ? Math.PI / (10 * kEff) : sim.tubeLength / 100;
    var h      = Math.max(0.5, Math.min(sim.tubeLength / 100, hIdeal));

    var u_m = waveDisplacement(x_px - h, t_sim);
    var u_p = waveDisplacement(x_px + h, t_sim);
    // ΔP = −K × ∂u/∂x  ≈  K × (u_m − u_p) / (2h)
    var dp  = sim.K * (u_m - u_p) / (2 * h);

    // Normalisation : ΔP_max théorique = K × A_eff × k_eff
    // Correction du biais DFC : la DFC sous-estime ∂u/∂x d'un facteur sinc(k·h).
    // On compense en divisant dpMax par sinc(k·h) = sin(k·h)/(k·h).
    var dpMax = sim.K * aEff * kEff * dpFactor;
    if (dpMax > 1e-9) {
        var kh     = kEff * h;
        var sincKH = (kh > 1e-6) ? Math.sin(kh) / kh : 1.0;
        return dp / (dpMax * sincKH);
    }
    return 0;
}

// ══════════════════════════════════════════════════════════════════════
//  Rayon adaptatif des points
//
//  La densité visuelle est portée par N ∝ ρ. Le rayon était pour cette
//  raison rendu indépendant de ρ — mais l'aire occupée vaut alors N·πr²,
//  elle aussi ∝ ρ : le taux de remplissage passait de ~25 % à ρ = 1 à
//  100 % à ρ = 4. Le tube devenait un aplat, et une compression n'est plus
//  lisible dans ce qui est déjà plein : c'est pourquoi les fronts d'onde
//  disparaissaient aux fortes masses volumiques.
//
//  Le rayon ne doit donc dépendre QUE de la hauteur du tube, jamais de ρ.
//  Toute dépendance en ρ, même à sens unique, revient au même défaut vu à
//  l'envers : un rayon qui rétrécit quand ρ monte est un rayon qui GROSSIT
//  quand ρ descend, et voir une parcelle de fluide enfler parce que le
//  milieu se raréfie n'a aucun sens.
//
//  On dimensionne donc le rayon une fois pour toutes sur le cas le plus
//  défavorable — ρ au maximum du curseur — de sorte que le nuage ne sature
//  nulle part sur la plage :
//
//      πr² ≤ PARTICLE_FILL_MAX × (aire par particule à ρ_max)
//
//  l'aire par particule valant COL_SLOT_PX2/ρ (cf. initCols).
//
//  ── Où placer PARTICLE_FILL_MAX ? ────────────────────────────────────
//  « Ne pas saturer » ne dit pas où se placer, et la valeur d'origine
//  (0,50) plaçait le nuage BEAUCOUP trop bas. Le calcul se pose : dans un
//  semis aléatoire de taux de remplissage φ, la couverture perçue vaut
//  C = 1 − e^(−φ). Une compression de taux ak porte localement φ à
//  φ/(1−ak), une détente à φ/(1+ak), et ce qui se VOIT est l'écart
//
//      ΔC(φ) = e^(−φ/(1+ak)) − e^(−φ/(1−ak))
//
//  qui est nul aux deux bouts — nuage vide, nuage saturé — et maximal
//  quelque part au milieu. À ak = 0,45 (le régime courant, cf. AK_MIN) le
//  maximum tombe vers φ ≈ 0,9. Or l'ancien réglage donnait φ = 0,167 à
//  ρ = 1 : on travaillait à un cinquième de l'optimum, et le contraste
//  perdu là ne se rattrape par aucun fond ni aucune couleur.
//
//  Avec PARTICLE_FILL_MAX = 1,00 le remplissage va de 0,17 (ρ = 0,5) à
//  1,00 (ρ = 3), et l'écart de couverture compression/détente passe de
//  0,15 à 0,25 aux réglages par défaut — il double, à géométrie et à
//  physique inchangées.
//
//  La crainte de l'aplat ne se vérifie pas à cette valeur : à ρ = 3 la
//  couverture vaut 50 % en détente contre 84 % en compression. Le nuage
//  est dense, mais il reste modulé — c'est φ = 2 ou 3 qui aplatirait.
//  En revanche les points se touchent franchement à ρ élevé : c'est le
//  prix assumé, et le curseur ρ reste là pour qui veut compter les points
//  plutôt que lire les fronts.
// ══════════════════════════════════════════════════════════════════════

var PARTICLE_FILL_MAX = 1.00;   // part de l'aire disponible qu'un point peut couvrir
var RHO_MAX_UI        = 3.0;    // doit suivre le max du curseur ρ (index.html)

function particleRadius() {
    // La fenêtre de `base` suit PARTICLE_FILL_MAX : la laisser à son ancien
    // calibrage (1,5 … 3,0 px) aurait fait d'elle la borne active — le rayon
    // aurait plafonné à 3,0 px au lieu des 3,46 px visés, et les deux tiers
    // du gain seraient restés sur la table. Facteur 1,2 sur les trois
    // termes, pour que les petites hauteurs de volet profitent du même
    // supplément d'encre que les grandes.
    var H    = sim.tubeBottom - sim.tubeTop;
    var base = Math.max(1.8, Math.min(3.6, H * 0.018));

    // Rayon au-delà duquel le nuage saturerait à ρ_max. Constante de fait :
    // ne dépend d'aucun réglage, seulement des bornes du curseur.
    var rSat = Math.sqrt(PARTICLE_FILL_MAX * COL_SLOT_PX2 / (Math.PI * RHO_MAX_UI));

    return Math.max(1.2, Math.min(base, rSat));
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation des particules — modèle lagrangien continu
//
//  Chaque particule représente une parcelle de fluide. Elle possède une
//  position de repos x0 (en px depuis tubeLeft). À chaque frame, sa
//  position affichée est : tubeLeft + x0 + waveDisplacementDisplay(x0, t).
//
//  Le domaine s'étend au-delà de tubeRight de extraRight = 2 × sonMaxDisplayPx()
//  pour que le milieu soit continu : lors d'une raréfaction à l'extrémité
//  droite, les particules "extérieures" entrent naturellement dans le tube.
//  Ce plafond ne dépendant que de la hauteur du tube, le domaine est
//  insensible à f et K — cf. la garde de non-reconstruction plus bas.
//
//  N ∝ ρ : doubler ρ double le nombre de particules → densité visuelle
//  directement proportionnelle à la masse volumique du milieu.
//  N = min(8000, round((L + extraRight) × H × ρ / COL_SLOT_PX2))
// ══════════════════════════════════════════════════════════════════════

// Relevé de la sélection courante, sous forme d'intervalles de x0 exprimés
// en FRACTION de la longueur du tube — donc transposables à un tube d'une
// autre largeur. sim.cols est rempli par x0 croissant, un simple balayage
// suffit à regrouper les particules voisines en paquets.
function _colsSelectionSnapshot() {
    // La longueur de RÉFÉRENCE est celle pour laquelle les x0 ont été
    // construits, pas la longueur courante : au resize, sim.tubeLength vaut
    // déjà la nouvelle valeur quand initCols est appelée, et rapporter les
    // anciens x0 à la nouvelle longueur décalerait la sélection.
    var out = [], L = sim.colsL || sim.tubeLength;
    if (L <= 0) return out;
    var run = null;
    for (var i = 0; i < sim.cols.length; i++) {
        if (!sim.cols[i].selected) continue;
        var f = sim.cols[i].x0 / L;
        if (run && (f - run.b) < 0.02) run.b = f;   // même paquet
        else { run = { a: f, b: f }; out.push(run); }
    }
    return out;
}

function _colsSelectionRestore(runs) {
    if (!runs || runs.length === 0) return;
    var L = sim.tubeLength;
    if (L <= 0) return;
    for (var i = 0; i < sim.cols.length; i++) {
        var f = sim.cols[i].x0 / L;
        for (var r = 0; r < runs.length; r++) {
            if (f >= runs[r].a && f <= runs[r].b) { sim.cols[i].selected = true; break; }
        }
    }
}

function initCols() {
    var L = sim.tubeLength;
    var H = sim.tubeBottom - sim.tubeTop;
    if (L <= 0 || H <= 0) { sim.cols = []; return; }

    // Zone virtuelle gauche et droite : doivent couvrir le déplacement max
    // d'une particule. Celui-ci est désormais borné en dur par
    // sonMaxDisplayPx(), qui ne dépend QUE de la hauteur du tube — le
    // domaine est donc insensible à f, K et ρ. C'est ce qui permet la garde
    // ci-dessous : bouger le curseur Fréquence ou Compressibilité ne
    // reconstruit plus les particules, et n'efface donc plus la sélection.
    var aMax       = sonMaxDisplayPx();
    var extraLeft  = aMax + 4;        // +4 px de marge sécurité
    // La zone droite doit rester peuplée même quand une raréfaction tire les
    // particules vers la gauche sur toute l'amplitude : d'où le facteur 2.
    var extraRight = aMax * 2 + 4;
    var domain     = L + extraRight + extraLeft;
    var N = Math.min(8000,
                Math.max(50,
                    Math.round(domain * H * Math.max(0.1, sim.rho) / COL_SLOT_PX2)));

    // Distribution jittered (grille régulière + bruit uniforme dans chaque case).
    // Borne la lacune maximale à ~2 × slot au lieu de ~7 × slot avec Math.random() pur,
    // ce qui élimine les bandes verticales blanches visibles au repos.
    // Les ry sont aussi jitterés pour éviter les alignements horizontaux.
    var slot = domain / N;

    // ── Rayon de sélection adaptatif à la densité ─────────────────────
    // Le rayon s'adapte à l'espacement moyen des colonnes pour rester cohérent
    // quelle que soit la résolution et la densité (ρ).
    // Formule : rayon = 1.5 × dx0, borné entre 20 et 40 px
    sim.selectionRadius = Math.max(20, Math.min(40, 1.5 * slot));

    // ── Garde : rien de géométrique n'a changé, on ne reconstruit pas ──
    // Reconstruire, c'est retirer aux particules leur position de repos et
    // donc effacer la sélection de l'élève : à ne faire que si le nombre de
    // particules ou la géométrie du tube l'imposent réellement.
    var sig = L + '|' + H + '|' + N;
    if (sig === sim.colsSig && sim.cols.length === N) return;

    var keep = _colsSelectionSnapshot();
    sim.colsSig = sig;
    sim.colsL   = L;
    sim.cols    = [];

    // Tableau d'indices mélangés pour que les ry ne suivent pas l'ordre des x0
    var ryOrder = [];
    for (var j = 0; j < N; j++) ryOrder.push(j);
    for (var j = N - 1; j > 0; j--) {
        var k = Math.floor(Math.random() * (j + 1));
        var tmp = ryOrder[j]; ryOrder[j] = ryOrder[k]; ryOrder[k] = tmp;
    }

    for (var i = 0; i < N; i++) {
        sim.cols.push({
            x0      : (i + Math.random()) * slot - extraLeft,  // jittered, domaine [-extraLeft, L+extraRight]
            selected: false,
            ry      : (ryOrder[i] + Math.random()) / N, // jittered en Y aussi
            wx      : 0,                                // errance thermique (cf. _wander)
            wy      : 0
        });
    }

    _colsSelectionRestore(keep);
}

// Alias pour compatibilité ascendante
function initParticles() { initCols(); }

// ══════════════════════════════════════════════════════════════════════
//  ██████╗ ██████╗ ██████╗ ██████╗ ███████╗
//  ██╔════╝██╔═══██╗██╔══██╗██╔══██╗██╔════╝
//  ██║     ██║   ██║██████╔╝██║  ██║█████╗
//  ██║     ██║   ██║██╔══██╗██║  ██║██╔══╝
//  ╚██████╗╚██████╔╝██║  ██║██████╔╝███████╗
//   ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚══════╝
//  Simulation — onde transversale sur une corde
// ══════════════════════════════════════════════════════════════════════

// ── Constantes de calibration corde ───────────────────────────────────
// Grandeurs physiques réelles : μ en kg/m, T en N, corde de longueur
// CORDE_LENGTH_M, célérité c = √(T/μ) en m/s (sans facteur d'échelle).
var CORDE_LENGTH_M    = 5.0;    // longueur physique de la corde (m)
// Espacement des points matériels en aspect « Discret » (m) : un point
// tous les 10 cm, soit 51 points sur les 5 m — assez pour lire la forme de
// l'onde, assez peu pour distinguer chaque point à l'œil.
var CORDE_BEAD_STEP_M = 0.10;
var MU_DEFAULT        = 1.0;    // masse linéique par défaut (kg/m)
var T_DEFAULT         = 4.0;    // tension par défaut (N)
// C_BASE_CORDE : px/s par unité de célérité (m/s) — recalibré dans tube.js resize
var C_BASE_CORDE      = 43.0;
// Borne haute du slider Amplitude (cm) — sert de référence à l'échelle
// verticale, à l'écran comme sur les graphes (cf. _recalcMemAmplitudeCorde).
var CORDE_AMPL_CM_MAX = 5.0;
// Demi-étendue de l'axe y des graphes (cm). FIXE, et non calée sur
// l'amplitude courante : sinon l'axe se redimensionnait exactement comme la
// courbe et le curseur Amplitude semblait sans effet sur le graphe.
var CORDE_Y_AXIS_CM   = 1.12 * CORDE_AMPL_CM_MAX;

// Signal « Périodique » : sin(x) + 0,6·sin(3x) + 0,35·sin(2x) — l'harmonique 3
// crée 6 extrema nets par période (3 maxima, 3 minima), et l'harmonique 2
// (paire) casse la symétrie : les lobes positifs et négatifs ne se
// ressemblent plus. Normalise le pic (trouvé numériquement, ≈ 1,507097)
// pour que l'amplitude affichée corresponde au déplacement maximal réel.
var PERIODIC_NORM = 1 / 1.507097;

// ══════════════════════════════════════════════════════════════════════
//  Motif Périodique — version SON, harmoniques renforcées
//
//  Le Son affiche ∂u/∂x, où chaque harmonique n est multipliée par son rang.
//  Le motif de la Corde y donne des lobes secondaires à 27 % du lobe
//  principal — trop discrets pour qu'on lise la structure du motif. On
//  renforce donc les harmoniques CÔTÉ SON uniquement :
//
//      u(p)  = sin p + 1,000·sin 3p + 0,500·sin 2p
//      ΔP ∝    cos p + 3,000·cos 3p + 1,000·cos 2p
//
//  Le lobe secondaire passe à 40 % du principal (contraste de densité ×1,43
//  contre ×1,26), sans que le principal cesse de dominer — condition pour
//  que la période lue reste λ et non λ/3. C'est un compromis, et le curseur
//  est PERIODIC_B3_SON : plus il monte, plus les lobes s'égalisent, jusqu'à
//  ce que le motif se lise comme une onde de longueur d'onde λ/3.
//
//  Vérifié numériquement : max|u| = 2,016026, max|∂u/∂x| = 5,000000.
//
//  ── Facteur de forme ─────────────────────────────────────────────────
//  Rapport entre la pente maximale du motif et celle d'une sinusoïde de
//  même amplitude : 5,000000 / 2,016026 = 2,480126.
//
//  Ce facteur a DEUX usages, et c'est important :
//    • waveDeltaP  — sans lui, ΔP en Périodique sortirait de l'échelle calée
//      sur la Sinusoïdale ;
//    • _sonDisplayGain — sans lui, l'amplitude d'affichage était calibrée sur
//      le seul fondamental alors que les harmoniques dominent la pente, et
//      les particules se repliaient (cf. le commentaire de cette fonction).
//
//  Il est enregistré par échantillon (srcQ) et non lu sur les réglages
//  courants : une portion émise en Périodique garde ainsi SA correction même
//  après un changement de mode.
// ══════════════════════════════════════════════════════════════════════
var PERIODIC_B3_SON   = 3.0;              // poids de l'harmonique 3 dans ΔP
var PERIODIC_B2_SON   = 1.0;              // ... et de l'harmonique 2
var PERIODIC_A3_SON   = PERIODIC_B3_SON / 3;   // = 1,000 dans le déplacement
var PERIODIC_A2_SON   = PERIODIC_B2_SON / 2;   // = 0,500
var PERIODIC_NORM_SON = 1 / 2.016026;
var PERIODIC_DP_FACTOR = 2.480126;

// ── État global de la simulation corde ────────────────────────────────
var simCorde = {

    // ── Contrôle de l'animation ─────────────────────────────────────
    paused      : false,
    simTime     : 0,

    // ── Mode source : null | 'impulse' | 'sinus' ────────────────────
    sourceMode        : null,
    impulsePropagating: false,
    // simTime en dessous duquel le pot vibrant est encore en train de
    // bouger (fin de la dernière impulsion lancée) — sert uniquement au
    // bouton Activer/Désactiver, qui doit s'éteindre dès que LA SOURCE est
    // au repos, sans attendre que l'onde ait fini de traverser la corde.
    sourceActiveUntil : 0,

    // ── Source — composante sinusoïdale ─────────────────────────────
    //  sinPhase : phase accumulée (rad). Elle n'est JAMAIS recalculée à
    //  partir de (t − t_départ) : on l'incrémente de 2π·f·dt à chaque pas.
    //  Changer f en cours de route infléchit donc la suite du signal sans
    //  créer de saut de phase, et sans toucher à ce qui est déjà émis.
    sinusoidalActive : false,
    sinPhase         : 0,

    // ── Source — composante périodique non sinusoïdale ───────────────
    //  Même principe de phase accumulée que sinPhase (cf. ci-dessus) :
    //  somme fondamentale + harmonique 2, normalisée pour que le pic
    //  atteigne exactement amplitudeCm (cf. PERIODIC_NORM).
    periodicActive : false,
    periodicPhase  : 0,

    // ── Source — mode Libre (pilotée à la souris) ────────────────────
    //  Le pot vibrant est débrayé : c'est l'utilisateur qui tient le bout
    //  de la corde et impose lui-même le déplacement. Lâcher la boule ne la
    //  ramène pas au repos : elle reste où on l'a laissée, comme une main
    //  qui tient la corde.
    //
    //  DEUX hauteurs, et non une seule : la souris n'émet qu'un événement
    //  par frame (~60 Hz) alors que la source est échantillonnée à 1/SRC_DT
    //  (600 Hz). Réutiliser directement la position du curseur reviendrait à
    //  écrire dix échantillons identiques d'affilée, soit un escalier de
    //  paliers gravé sur la corde. freeTargetY reçoit donc le curseur, et
    //  freeY — la valeur réellement émise — l'y rejoint par interpolation
    //  linéaire, un pas à la fois (cf. boucle d'animation dans ui.js).
    freeActive   : false,
    freeY        : 0,
    freeTargetY  : 0,
    freeDragging : false,

    // ── Source — impulsions (superposables) ─────────────────────────
    impulses : [],

    // ── Historique de la source (tampon circulaire) ──────────────────
    //  srcD : déplacement émis par le pot vibrant (cm, valeur physique)
    //  srcS : abscisse curviligne cumulée S(t) = ∫ c dt (m) — distance
    //         totale parcourue depuis t = 0 par un front émis à t = 0.
    //  Un point situé à la distance x lit l'échantillon dont le S vaut
    //  S(t) − x : inverser S revient à remonter au temps d'émission, ce
    //  qui reste exact même si c a changé entre-temps.
    srcD    : null,
    srcS    : null,
    srcN    : 0,     // nombre d'échantillons valides
    srcHead : 0,     // index de la prochaine écriture
    srcTNew : 0,     // simTime du dernier échantillon
    srcSCur : 0,     // dernière valeur de S (m)
    srcSeq  : 0,     // compteur d'écritures — invalidation du cache y(x)
    lastEmitT : -1e9, // dernier instant où la source a émis autre chose que 0

    // ── Paramètres physiques de la corde ────────────────────────────
    freq        : 1.5,          // fréquence de la sinusoïdale (Hz)
    amplitudeCm : 2.0,          // amplitude CIBLE, réglée par le curseur (cm, affiché)
    amplitudeCmEff : 2.0,       // amplitude RÉELLEMENT émise (cf. stepSourceCorde) —
                                 // rattrape amplitudeCm à vitesse bornée pour éviter
                                 // qu'un coup de curseur en cours d'oscillation ne
                                 // grave un saut brutal dans le signal émis
    mu          : MU_DEFAULT,   // masse linéique (kg/m)
    T_tension   : T_DEFAULT,    // tension (N)
    attenuation : 0.0,          // coefficient d'atténuation

    // ── Propriétés dérivées ──────────────────────────────────────────
    c_sim : 0,    // célérité en px/s
    c_cms : 0,    // célérité en m/s (affichée)

    // ── Échelle verticale (recalibrée dans resize) ───────────────────
    pxPerCmAmpl  : 1,    // px par cm — conversion valeur physique → écran
                          // (les déplacements circulent en cm dans tout le
                          //  code, la conversion n'a lieu qu'au tracé)

    // ── Géométrie de la zone corde (renseignée par tube.js resize) ────
    cordeLeft   : 0,
    cordeRight  : 0,
    cordeMiddleY: 0,    // y de la corde au repos (centre vertical)
    cordeTop    : 0,
    cordeBottom : 0,
    cordeLength : 0,    // = cordeRight − cordeLeft (px)

    // ── Aspect de la corde : 'continu' | 'discret' ───────────────────
    //  Purement visuel : la physique et les graphes sont identiques dans
    //  les deux cas. En 'discret' la corde est dessinée comme un chapelet
    //  de points matériels reliés (cf. _drawCordeBeads dans tube.js), ce
    //  qui rend visible le fait que chaque point ne fait qu'osciller
    //  verticalement en reproduisant, avec retard, le mouvement du
    //  précédent. Les balises se calent alors sur ces points.
    aspect : 'continu',

    // ── Balises (lignes verticales draggables) ───────────────────────
    // frac = position relative (0–1) le long de la corde — utilisée pour
    // recalculer x au resize et garder la balise à distance constante
    // du vibreur, indépendamment de la largeur du canvas.
    beacon1 : { active: false, x: 0, frac: 0.30 },
    beacon2 : { active: false, x: 0, frac: 0.65 },

    // ── Flèche de longueur d'onde (draggable horizontalement) ─────────
    // lambdaX = abscisse écran de l'extrémité gauche de la flèche ;
    // lambdaFrac = même position en relatif (0–1) le long de la corde,
    // utilisée pour recalculer lambdaX au resize (comme les balises).
    // La largeur, elle, n'est jamais stockée : recalculée à chaque frame
    // depuis c_sim et freq, pour suivre en direct tout changement de λ.
    lambdaVisible : false,
    lambdaX       : 0,
    lambdaFrac    : 0.08,

    // ── Données graphes ──────────────────────────────────────────────
    //  yxX/yxY (Float32Array) : snapshot y(x) courant, partagé par le tracé
    //  et le hover snappé — yxSig évite de le recalculer quand rien n'a
    //  changé (typiquement en pause).
    graphMode : 'dpx',   // 'dpx' (spatial) | 'dpt' (temporel)
    yxX       : null,
    yxY       : null,
    yxN       : 0,
    yxSig     : null,
    ytBuf1    : null,    // tampon circulaire — série temporelle balise 1
    ytBuf2    : null,    // tampon circulaire — série temporelle balise 2
    // Horloge du graphe y(t) : null tant que la source n'a pas été activée
    // pour la 1ère fois depuis le dernier changement de mode/RAZ (graphe en
    // attente) ; sinon simTime au moment de cette 1ère activation (origine
    // de la fenêtre glissante). Un changement de mode (sélecteur Corde)
    // remet toujours à null, quel que soit le nouveau mode choisi.
    ytTimeOrigin : null,

    // ── Vue graphe y(t) ──────────────────────────────────────────────
    graphView        : { xMin: 0, xMax: 5, yMin: -1, yMax: 1 },
    graphCursorMode  : false,

    // ── Vue graphe y(x) ──────────────────────────────────────────────
    graphYxYMin : -1,
    graphYxYMax :  1,

    // ── Propriétés de l'onde (readout étendu) ─────────────────────────
    wavePropsVisible : false,
    speedFactor      : 1.0,

    // ── Options : zone graphe affichée ou non (désactivé par défaut) ──
    graphVisible     : false,
};

// ══════════════════════════════════════════════════════════════════════
//  Calcul de la célérité de la corde
//  c = √(T / μ)  analogue à c = √(K / ρ)
// ══════════════════════════════════════════════════════════════════════

function updateCeleriteCorde() {
    if (simCorde.mu <= 0) return;
    var c_ms       = Math.sqrt(simCorde.T_tension / simCorde.mu);   // m/s, formule réelle
    simCorde.c_cms = c_ms;                  // m/s — c'est CETTE valeur qui régit
                                            // la propagation (cf. stepSourceCorde)
    simCorde.c_sim = c_ms * C_BASE_CORDE;   // px/s — seulement pour calibrer la
                                            // finesse d'échantillonnage du tracé
}

// La corde est « au repos » : cf. _srcIsQuiet.
function cordeIsQuiet() {
    return _srcIsQuiet(simCorde, CORDE_LENGTH_M, simCorde.c_cms);
}

// ══════════════════════════════════════════════════════════════════════
//  Avancement de la source corde d'un pas SRC_DT
//
//  Appelé à pas fixe par la boucle d'animation (ui.js). C'est le SEUL
//  endroit où l'on consulte freq / amplitudeCm / c : une fois l'échantillon
//  écrit, il est figé. Bouger un curseur n'affecte donc que la suite de
//  l'émission, jamais l'onde déjà présente sur la corde.
//
//  Le déplacement est enregistré en centimètres (valeur physique) et S
//  progresse en mètres.
// ══════════════════════════════════════════════════════════════════════

// Vitesse maximale de rattrapage de amplitudeCmEff vers amplitudeCm, en cm par
// seconde SIMULÉE. Un déplacement de curseur à mi-oscillation ne grave donc
// plus un saut brutal dans le signal émis (visible en corde épaisse + ralenti) :
// la nouvelle amplitude s'installe progressivement sur quelques pas SRC_DT au
// lieu de s'appliquer d'un coup au prochain échantillon.
var CORDE_AMPL_SLEW_CMPS = 60;

function stepSourceCorde(t) {
    var d = 0;

    // ── Rattrapage borné de l'amplitude réellement émise vers la cible ──
    var amplDiff = simCorde.amplitudeCm - simCorde.amplitudeCmEff;
    var amplStep = CORDE_AMPL_SLEW_CMPS * SRC_DT;
    if (Math.abs(amplDiff) <= amplStep) simCorde.amplitudeCmEff = simCorde.amplitudeCm;
    else                                simCorde.amplitudeCmEff += Math.sign(amplDiff) * amplStep;
    var ampl = simCorde.amplitudeCmEff;

    // ── Composante sinusoïdale : phase accumulée ──────────────────────
    // Jamais recalculée depuis (t − t_départ) : changer f infléchit la suite
    // du signal sans créer de saut de phase.
    if (simCorde.sinusoidalActive) {
        simCorde.sinPhase += 2 * Math.PI * simCorde.freq * SRC_DT;
        if (simCorde.sinPhase > 2 * Math.PI) simCorde.sinPhase -= 2 * Math.PI;
        d += ampl * Math.sin(simCorde.sinPhase);
    }

    // ── Composante périodique non sinusoïdale (multi-lobes, asymétrique) ──
    if (simCorde.periodicActive) {
        simCorde.periodicPhase += 2 * Math.PI * simCorde.freq * SRC_DT;
        if (simCorde.periodicPhase > 2 * Math.PI) simCorde.periodicPhase -= 2 * Math.PI;
        var p = simCorde.periodicPhase;
        d += ampl * PERIODIC_NORM * (Math.sin(p) + 0.6 * Math.sin(3 * p) + 0.35 * Math.sin(2 * p));
    }

    // ── Mode Libre : la hauteur imposée à la souris EST le signal ─────
    if (simCorde.freeActive) d += simCorde.freeY;

    // ── Composantes impulsions (superposables) ────────────────────────
    for (var i = 0; i < simCorde.impulses.length; i++) {
        var tau = t - simCorde.impulses[i].startTime;
        if (tau >= 0 && tau <= T_IMPULSE) {
            d += ampl * (1 - Math.cos(2 * Math.PI * tau / T_IMPULSE)) / 2;
        }
    }

    _srcPush(simCorde, t, d, simCorde.c_cms);
}

// ══════════════════════════════════════════════════════════════════════
//  Déplacement transversal de la corde au point x_px au temps t_sim
//
//  Modèle : onde progressive amortie, corde infinie à droite (pas de
//  réflexion). Le point situé à la distance x lit ce que la source a émis
//  quand le front avait parcouru S(t) − x :
//      y(x, t) = d_émis(S(t) − x) × exp(−α·x/L)
//
//  RETOURNE UNE VALEUR PHYSIQUE EN cm (conversion en px au tracé, via
//  simCorde.pxPerCmAmpl). x_px est en pixels écran, converti en mètres :
//  la physique est ainsi totalement indépendante de la taille du canvas.
// ══════════════════════════════════════════════════════════════════════

function cordeDisplacement(x_px, t_sim) {
    if (simCorde.cordeLength <= 0) return 0;

    var x_m = x_px * CORDE_LENGTH_M / simCorde.cordeLength;
    var d   = _srcDAtS(simCorde, _srcSAtTime(simCorde, t_sim, simCorde.c_cms) - x_m);
    if (d === 0) return 0;

    var alpha = simCorde.attenuation * 5;
    return d * Math.exp(-alpha * x_m / CORDE_LENGTH_M);
}

// ══════════════════════════════════════════════════════════════════════
//  Mise à jour du snapshot y(x)
//  Analogue à updateDpxData() : un seul calcul par frame, partagé par le
//  tracé et le hover snappé, avec skip via signature quand rien n'a changé.
//  yxY est stocké en cm (valeur physique), comme cordeDisplacement.
// ══════════════════════════════════════════════════════════════════════

var CORDE_YX_PTS_PER_PX = 2;
var CORDE_YX_PTS_MIN    = 300;
var CORDE_YX_PTS_MAX    = 4000;

// Le profil ne dépend plus que de l'historique émis (srcSeq), de la
// géométrie et de l'atténuation : freq / amplitude n'ont plus d'effet
// rétroactif, donc plus besoin de les surveiller ici.
function _cordeYxSignature() {
    var s = simCorde;
    return s.srcSeq + '|' + s.simTime + '|' + s.cordeLength + '|' +
           s.attenuation + '|' + s.graphMode;
}

function updateYxData() {
    var sig = _cordeYxSignature();
    if (simCorde.yxSig === sig) return;
    simCorde.yxSig = sig;

    var L = simCorde.cordeLength;
    simCorde.yxN = 0;
    if (L <= 0) return;

    var freqEff = (simCorde.sourceMode === 'impulse') ? 1.0 / T_IMPULSE : simCorde.freq;
    var lambda  = (simCorde.c_sim > 0) ? simCorde.c_sim / freqEff : L;

    var gW = (typeof graphCanvas !== 'undefined' && graphCanvas && graphCanvas.clientWidth > 0)
        ? graphCanvas.clientWidth : L;
    if (simCorde.graphMode === 'both') gW *= 0.5;

    var N = Math.min(CORDE_YX_PTS_MAX, Math.max(CORDE_YX_PTS_MIN, Math.ceil(gW * CORDE_YX_PTS_PER_PX)));
    var pxPerLambda = (lambda > 0) ? gW * lambda / L : gW;
    if (pxPerLambda > 0 && pxPerLambda < 8) {
        N = Math.min(CORDE_YX_PTS_MAX, Math.ceil(N * 8 / Math.max(0.5, pxPerLambda)));
    }

    if (!simCorde.yxX || simCorde.yxX.length < N + 1) {
        simCorde.yxX = new Float32Array(N + 1);
        simCorde.yxY = new Float32Array(N + 1);
    }
    for (var i = 0; i <= N; i++) {
        var x = i / N * L;
        simCorde.yxX[i] = x;
        simCorde.yxY[i] = cordeDisplacement(x, simCorde.simTime);
    }
    simCorde.yxN = N + 1;
}

// ══════════════════════════════════════════════════════════════════════
//  Enregistrement y(t) aux positions des balises actives
// ══════════════════════════════════════════════════════════════════════

function _ytBufCorde(n) {
    var key = (n === 1) ? 'ytBuf1' : 'ytBuf2';
    if (!simCorde[key]) simCorde[key] = _cbufMake(DP_MAX_POINTS);
    return simCorde[key];
}
function _ytClearCorde(n) { _cbufClear(_ytBufCorde(n)); }

function updateYtData(t) {
    if (simCorde.beacon1.active) _cbufPush(_ytBufCorde(1), t, cordeDisplacement(simCorde.beacon1.x - simCorde.cordeLeft, t));
    if (simCorde.beacon2.active) _cbufPush(_ytBufCorde(2), t, cordeDisplacement(simCorde.beacon2.x - simCorde.cordeLeft, t));
}

// ══════════════════════════════════════════════════════════════════════
//  Nettoyage des anciennes impulsions corde
// ══════════════════════════════════════════════════════════════════════

function pruneImpulsesCorde() {
    if (simCorde.c_cms <= 0) return;
    // Une impulsion est « terminée » quand elle a fini d'être émise ET a
    // fini de traverser la corde (durée exprimée en grandeurs physiques,
    // donc insensible à la taille du canvas).
    var cutoff = simCorde.simTime - T_IMPULSE - CORDE_LENGTH_M / simCorde.c_cms - 0.5;
    simCorde.impulses = simCorde.impulses.filter(function(imp) {
        return imp.startTime > cutoff;
    });
}

// ══════════════════════════════════════════════════════════════════════
//  Remise à zéro de l'animation corde
// ══════════════════════════════════════════════════════════════════════

function resetAnimCorde() {
    simCorde.simTime            = 0;
    simCorde.paused             = false;
    simCorde.sourceMode         = null;
    simCorde.sinusoidalActive   = false;
    simCorde.sinPhase           = 0;
    simCorde.periodicActive     = false;
    simCorde.periodicPhase      = 0;
    simCorde.freeY              = 0;
    simCorde.freeTargetY        = 0;
    simCorde.freeDragging       = false;
    simCorde.impulses           = [];
    simCorde.impulsePropagating = false;
    simCorde.sourceActiveUntil  = 0;
    _srcClear(simCorde);
    _ytClearCorde(1);
    _ytClearCorde(2);
    simCorde.ytTimeOrigin       = null;   // graphe en attente d'une 1ère activation
    simCorde.yxN                = 0;
    simCorde.yxSig              = null;
    simCorde.graphView          = { xMin: 0, xMax: 5, yMin: -1, yMax: 1 };
    simCorde.graphYxYMin        = -1;
    simCorde.graphYxYMax        =  1;

    // Positions des balises : seul « Remettre à zéro » les restaure, le
    // masquage/réaffichage par les boutons Balise les conserve.
    simCorde.beacon1.frac = 0.30;
    simCorde.beacon2.frac = 0.65;
    simCorde.beacon1.x = simCorde.cordeLeft + simCorde.cordeLength * simCorde.beacon1.frac;
    simCorde.beacon2.x = simCorde.cordeLeft + simCorde.cordeLength * simCorde.beacon2.frac;

    updateCeleriteCorde();
}

// ══════════════════════════════════════════════════════════════════════
//  stepParticles : no-op — le modèle colonnes n'a pas besoin d'intégrer
//  des vitesses. Le repositionnement aléatoire est fait dans drawTube.
//  Conservé pour compatibilité avec ui.js.
// ══════════════════════════════════════════════════════════════════════

function stepParticles(dt) { /* no-op — modèle colonnes */ }

// ══════════════════════════════════════════════════════════════════════
//  rescaleThermalVelocities : no-op — plus de vitesses thermiques
//  Conservé pour compatibilité avec ui.js.
// ══════════════════════════════════════════════════════════════════════

function rescaleThermalVelocities(K_old, K_new) { /* no-op */ }

// ══════════════════════════════════════════════════════════════════════
//  Mise à jour du snapshot ΔP(x)
// ══════════════════════════════════════════════════════════════════════
//  Un seul calcul par frame, partagé par le tracé et le hover snappé (avant
//  cette version, chacun recalculait indépendamment : le tracé en ligne dans
//  _drawDpxGraph avec un échantillonnage propre, dpxData avec un autre —
//  deux fois le coût pour un seul résultat affiché). dpxSig évite même ce
//  calcul unique tant que rien n'a changé (typiquement en pause).

var SON_DPX_PTS_PER_PX = 2;
var SON_DPX_PTS_MIN    = 300;
var SON_DPX_PTS_MAX    = 4000;

// Le champ ne dépend plus que de l'historique émis (srcSeq), de la géométrie
// et de l'atténuation. La normalisation de ΔP, elle, reste calée sur les
// réglages courants (cf. waveDeltaP) : d'où la présence de freq, K et
// sourceMode, qui changent l'échelle du tracé sans toucher au champ.
function _dpxSignature() {
    var s = sim;
    return s.srcSeq + '|' + s.simTime + '|' + s.tubeLength + '|' + s.c_sim + '|' +
           s.freq + '|' + s.sourceMode + '|' + s.K + '|' + s.memAmplitude + '|' +
           s.attenuation + '|' + s.graphMode;
}

function updateDpxData() {
    var sig = _dpxSignature();
    if (sim.dpxSig === sig) return;
    sim.dpxSig = sig;

    var L = sim.tubeLength;
    sim.dpxN = 0;
    if (L <= 0) return;

    var freqEff = (sim.sourceMode === 'impulse') ? 1.0 / T_IMPULSE : sim.freq;
    var lambda  = (sim.c_sim > 0) ? sim.c_sim / freqEff : L;  // px tube

    // Nombre de points calé sur la résolution d'affichage du graphe (pas sur λ) :
    // en mode 'both' chaque courbe n'occupe que la moitié du canvas. On augmente
    // ensuite la densité si λ est petite à l'écran, pour ne pas rendre une
    // sinusoïde "pointue" (repliement visuel), même quand ça dépasse 1 pt/px.
    var gW = (typeof graphCanvas !== 'undefined' && graphCanvas && graphCanvas.clientWidth > 0)
        ? graphCanvas.clientWidth : L;
    if (sim.graphMode === 'both') gW *= 0.5;

    var N = Math.min(SON_DPX_PTS_MAX, Math.max(SON_DPX_PTS_MIN, Math.ceil(gW * SON_DPX_PTS_PER_PX)));
    var pxPerLambda = (lambda > 0) ? gW * lambda / L : gW;
    if (pxPerLambda > 0 && pxPerLambda < 8) {
        N = Math.min(SON_DPX_PTS_MAX, Math.ceil(N * 8 / Math.max(0.5, pxPerLambda)));
    }

    if (!sim.dpxX || sim.dpxX.length < N + 1) {
        sim.dpxX = new Float32Array(N + 1);
        sim.dpxY = new Float32Array(N + 1);
    }
    for (var i = 0; i <= N; i++) {
        var x = i / N * L;
        sim.dpxX[i] = x;
        sim.dpxY[i] = waveDeltaP(x, sim.simTime);
    }
    sim.dpxN = N + 1;
}

// ══════════════════════════════════════════════════════════════════════
//  Enregistrement ΔP(t) aux positions des balises actives
// ══════════════════════════════════════════════════════════════════════

function _dptBuf(n) {
    var key = (n === 1) ? 'dptBuf1' : 'dptBuf2';
    if (!sim[key]) sim[key] = _cbufMake(DP_MAX_POINTS);
    return sim[key];
}
function _dptClear(n) { _cbufClear(_dptBuf(n)); }

function updateDptData(t) {
    if (sim.beacon1.active) _cbufPush(_dptBuf(1), t, waveDeltaP(sim.beacon1.x - sim.tubeLeft, t));
    if (sim.beacon2.active) _cbufPush(_dptBuf(2), t, waveDeltaP(sim.beacon2.x - sim.tubeLeft, t));
}

// ══════════════════════════════════════════════════════════════════════
//  Nettoyage des anciennes impulsions
//  Une impulsion est expirée quand son front arrière a quitté le tube.
// ══════════════════════════════════════════════════════════════════════

function pruneImpulses() {
    if (sim.c_cms <= 0) return;
    // Une impulsion est « terminée » quand elle a fini d'être émise ET a fini
    // de traverser le tube (durée en grandeurs physiques, donc insensible à la
    // taille du canvas).
    var cutoff = sim.simTime - T_IMPULSE - TUBE_LENGTH_CM / sim.c_cms - 0.5;
    sim.impulses = sim.impulses.filter(function(imp) {
        return imp.startTime > cutoff;
    });
}

// ══════════════════════════════════════════════════════════════════════
//  Rescale des vitesses thermiques après changement de K
//  Maintient l'énergie cinétique proportionnelle à K.
// ══════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  Remise à zéro de l'animation
//  Ne réinitialise PAS les paramètres physiques (K, rho, freq, attenuation)
//  ni la position des balises.
// ══════════════════════════════════════════════════════════════════════

function resetAnim() {
    sim.simTime            = 0;
    sim.paused             = false;
    sim.sourceMode         = null;
    sim.sinusoidalActive   = false;
    sim.sinPhase           = 0;
    sim.periodicActive     = false;
    sim.periodicPhase      = 0;
    sim.sonEmitMode        = null;
    sim.sonEnv             = 0;
    sim.impulses           = [];
    sim.impulsePropagating = false;
    sim.sourceActiveUntil  = 0;
    _srcClear(sim);
    _dptClear(1);
    _dptClear(2);
    sim.dptTimeOrigin      = null;   // graphe en attente d'une 1ère activation
    sim.dptArmedMode       = null;
    sim.dpxN               = 0;
    sim.dpxSig             = null;
    sim.graphView          = { xMin: 0, xMax: 5, yMin: -1, yMax: 1 };
    sim.graphDpxYMin       = -1;
    sim.graphDpxYMax       =  1;

    // Positions des balises : seul « Remettre à zéro » les restaure, le
    // masquage/réaffichage par les boutons Balise les conserve.
    sim.beacon1.frac = 0.30;
    sim.beacon2.frac = 0.65;
    sim.beacon1.x = sim.tubeLeft + sim.tubeLength * sim.beacon1.frac;
    sim.beacon2.x = sim.tubeLeft + sim.tubeLength * sim.beacon2.frac;

    initCols();
    updateCelerite();
}

// ══════════════════════════════════════════════════════════════════════
//  Sélection de particules par proximité
//
//  Le clic désigne une particule TELLE QU'ELLE EST AFFICHÉE ; on remonte à
//  sa position de repos, puis on sélectionne tout le paquet qui partage
//  cette position de repos à selectionRadius près. Comparer directement le
//  clic à x0, comme on le faisait, revenait à ignorer le déplacement de
//  l'onde : on cliquait sur un paquet et on en sélectionnait un autre,
//  décalé de u(x0) — soit plusieurs dizaines de pixels, et précisément
//  quand l'onde est la plus ample.
//
//  u(x0) n'étant pas inversible analytiquement (historique de source), on
//  balaie les particules une fois pour trouver l'affichée la plus proche.
//  C'est du O(N) une seule fois par clic, donc sans effet sur le rendu.
//
//  Le paquet est ensuite défini sur x0 et non sur la position affichée :
//  ses membres restent donc solidaires quand l'onde les déplace, ce qui est
//  tout l'intérêt pédagogique de la sélection.
//
//  Paramètres :
//    • xScreen : abscisse cliquée, en px depuis le bord gauche du canvas
//    • modifiers.ctrl : true si Ctrl est enfoncé (ajouter à la sélection)
//    • modifiers.shift : true si Maj est enfoncée (retirer de la sélection)
//
//  Logique :
//    • Clic normal : effacer tout, sélectionner proximité
//    • Ctrl+clic : ajouter à la sélection actuelle
//    • Maj+clic : retirer de la sélection actuelle
// ══════════════════════════════════════════════════════════════════════

function selectNearbyParticles(xScreen, modifiers) {
    if (!sim.cols || sim.cols.length === 0) return;

    var ctrl = modifiers && modifiers.ctrl;
    var shift = modifiers && modifiers.shift;

    // Mode normal (aucun modifieur) : reset + sélectionner
    if (!ctrl && !shift) {
        for (var i = 0; i < sim.cols.length; i++) {
            sim.cols[i].selected = false;
        }
    }

    // ── Position de repos visée : celle de la particule affichée la plus
    //    proche du clic.
    var t = sim.simTime, best = -1, bestD = Infinity;
    for (var i = 0; i < sim.cols.length; i++) {
        var xd = sim.tubeLeft + sim.cols[i].x0
               + waveDisplacementDisplay(sim.cols[i].x0, t);
        var dd = Math.abs(xd - xScreen);
        if (dd < bestD) { bestD = dd; best = i; }
    }
    if (best < 0) return;

    // Clic manifestement à côté de toute particule (hors tube, derrière la
    // membrane) : on ne sélectionne rien — le reset éventuel a déjà eu lieu.
    if (bestD > sim.selectionRadius) return;

    var x0_click = sim.cols[best].x0;

    // Itérer sur toutes les particules et tester la proximité
    for (var i = 0; i < sim.cols.length; i++) {
        var distance = Math.abs(sim.cols[i].x0 - x0_click);

        if (distance <= sim.selectionRadius) {
            if (shift) {
                // Maj+clic : retirer
                sim.cols[i].selected = false;
            } else {
                // Clic normal ou Ctrl+clic : ajouter/sélectionner
                sim.cols[i].selected = true;
            }
        }
    }
}
