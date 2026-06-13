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

// ── Constantes de calibration ─────────────────────────────────────────
// Valeurs par défaut des paramètres (pour calibrer C_BASE à la resize)
var K_DEFAULT        = 4.0;   // compressibilité par défaut
var RHO_DEFAULT      = 1.0;   // masse volumique par défaut
// C_DISPLAY_FACTOR : c_norm * C_DISPLAY_FACTOR = célérité affichée en cm/s
// sqrt(K_DEFAULT/RHO_DEFAULT) * 10 = 2 * 10 = 20 cm/s à la configuration par défaut
var C_DISPLAY_FACTOR = 10.0;
// C_BASE : px/s par unité de c_norm — recalibré dans tube.js resize()
// Cible : onde traverse le tube (~700px) en ~8s avec c_norm=2 → C_BASE ≈ 700/(8*2) ≈ 43
var C_BASE           = 43.0;
// Durée de l'impulsion = 1 période complète (aller-retour membrane)
var T_IMPULSE        = 2.0;   // secondes de temps simulé
// Nombre max de points enregistrés pour ΔP(t)
var DP_MAX_POINTS    = 3000;

// ── État global de la simulation ──────────────────────────────────────
var sim = {

    // ── Contrôle de l'animation ─────────────────────────────────────
    paused      : false,
    simTime     : 0,       // temps simulé cumulé (s)

    // ── Source — composante sinusoïdale ─────────────────────────────
    sinusoidalActive : false,    // oscillation en cours
    sinStartTime     : 0,        // sim.simTime au démarrage
    sinStopTime      : -1,       // sim.simTime à l'arrêt (-1 = pas encore arrêtée)

    // ── Source — impulsions (superposables) ─────────────────────────
    // Chaque entrée : { startTime }  (1 période de sinus = T_IMPULSE)
    impulses : [],

    // ── Paramètres physiques du milieu ───────────────────────────────
    freq        : 1.5,            // fréquence de la sinusoïdale (Hz)
    rho         : RHO_DEFAULT,    // masse volumique (u.s.)
    K           : K_DEFAULT,      // module de compressibilité (u.s.)
    attenuation : 0.3,            // coefficient d'atténuation (0 = aucun, 1 = fort)

    // ── Propriétés dérivées (recalculées par updateCelerite) ─────────
    c_sim : 0,    // célérité en px/s (pour l'animation)
    c_cms : 0,    // célérité en cm/s (affichée à l'utilisateur)

    // ── Amplitude de la membrane (recalibrée dans tube.js resize) ────
    memAmplitude : 10,    // px

    // ── Particules — modèle lagrangien continu ───────────────────────
    // Chaque particule : { x0 (position de repos en px depuis tubeLeft),
    //                      selected, ry (position y en [0,1], gelée en pause) }
    // N ∝ ρ (linéaire). Domaine [0, tubeLength + 2×memAmplitude].
    // Position affichée : tubeLeft + x0 + waveDisplacement(x0,t) × tubeDispCap
    cols          : [],
    selectionMode : false,   // mode sélection par rectangle actif

    // ── Balises (lignes verticales draggables dans le tube) ──────────
    beacon1 : { active: false, x: 0 },   // balise 1 (orange)
    beacon2 : { active: false, x: 0 },   // balise 2 (vert)

    // ── Géométrie du tube (renseignée par tube.js resize) ────────────
    tubeLeft   : 0,
    tubeRight  : 0,
    tubeTop    : 0,
    tubeBottom : 0,
    tubeLength : 0,    // = tubeRight − tubeLeft (px)

    // ── Données graphes ──────────────────────────────────────────────
    graphMode : 'dpx',   // 'dpx' (spatial) | 'dpt' (temporel)
    dpxData   : [],      // [{x, dp}] snapshot courant de ΔP(x)
    dptData1  : [],      // [{t, dp}] série temporelle balise 1
    dptData2  : [],      // [{t, dp}] série temporelle balise 2

    // ── Vue graphe ΔP(t) ─────────────────────────────────────────────
    graphView        : { xMin: 0, xMax: 30, yMin: -1, yMax: 1 },
    graphViewHistory : [],
    graphZoomMode    : false,
    graphCursorMode  : false,
    graphUserPanned  : false,   // true = l'utilisateur a pané manuellement

    // ── Vue graphe ΔP(x) ─────────────────────────────────────────────
    graphDpxYMin : -1,
    graphDpxYMax :  1,

    // ── Simulation de Vagues (2D) ─────────────────────────────────────
    activeTab         : 'son',   // 'son' | 'vagues' | 'corde'
    vaguesFreq        : 1.5,     // fréquence d'émission des vagues (Hz)
    vaguesAttenuation : 0.2,     // coefficient d'atténuation (0 à 1)
    vaguesCelerite    : 15.0,    // célérité des vagues (cm/s)
    sourceS           : { x: 0, y: 0 }, // Position de la source S (px)
    pointM            : { x: 0, y: 0 }, // Position du point M (px)
    vaguesDataM       : [],      // [{t, amp}] données d'amplitude au point M pour le graphique
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

// ══════════════════════════════════════════════════════════════════════
//  Déplacement de la membrane au temps retardé t_ret (s simulés)
//  Cette fonction est appelée avec t_ret = sim.simTime − x / c_sim
//  et retourne le déplacement de la membrane à ce moment passé.
// ══════════════════════════════════════════════════════════════════════

function memDisplacement(t_ret) {
    var d = 0;

    // ── Composante sinusoïdale ────────────────────────────────────────
    // Active entre sinStartTime et sinStopTime (ou maintenant si toujours active)
    var sinStop = sim.sinusoidalActive ? Infinity : sim.sinStopTime;
    if (sim.sinStopTime !== -1 || sim.sinusoidalActive) {
        // La sinusoïdale a été démarrée au moins une fois
        var sinStop2 = sim.sinusoidalActive ? 1e15 : sim.sinStopTime;
        if (t_ret >= sim.sinStartTime && t_ret <= sinStop2) {
            var tau = t_ret - sim.sinStartTime;
            d += sim.memAmplitude * Math.sin(2 * Math.PI * sim.freq * tau);
        }
    }

    // ── Composantes impulsions ────────────────────────────────────────
    for (var i = 0; i < sim.impulses.length; i++) {
        var imp = sim.impulses[i];
        var tau_imp = t_ret - imp.startTime;
        if (tau_imp >= 0 && tau_imp <= T_IMPULSE) {
            d += sim.memAmplitude * Math.sin(2 * Math.PI / T_IMPULSE * tau_imp);
        }
    }

    return d;
}

// ══════════════════════════════════════════════════════════════════════
//  Déplacement d'onde au point x_px (distance depuis bord gauche du
//  tube, en px) au temps t_sim.
//  Modèle : onde progressive amortie, pas de réflexion à l'extrémité.
//  u(x,t) = d_mem(t − x/c) × exp(−α × x/L)
// ══════════════════════════════════════════════════════════════════════

function waveDisplacement(x_px, t_sim) {
    if (sim.c_sim <= 0 || sim.tubeLength <= 0) return 0;
    var delay = x_px / sim.c_sim;        // retard de propagation (s)
    var t_ret = t_sim - delay;           // temps retardé
    var alpha = sim.attenuation * 5;     // amortissement (×5 pour visibilité sur L)
    var atten = Math.exp(-alpha * x_px / sim.tubeLength);
    return memDisplacement(t_ret) * atten;
}

// ══════════════════════════════════════════════════════════════════════
//  Surpression ΔP au point x_px au temps t_sim
//  ΔP = −K × ∂u/∂x  → approximation par différences finies centrées
// ══════════════════════════════════════════════════════════════════════

function waveDeltaP(x_px, t_sim) {
    var h   = Math.max(1.5, sim.tubeLength / 300);
    var u_m = waveDisplacement(x_px - h, t_sim);
    var u_p = waveDisplacement(x_px + h, t_sim);
    // ΔP = −K × ∂u/∂x  ≈  K × (u_m − u_p) / (2h)
    var dp  = sim.K * (u_m - u_p) / (2 * h);

    // Normalisation : on divise par ΔP_max théorique = K × A × k_eff
    // pour que la valeur retournée soit dans [-1, +1] à l'amplitude maximale.
    // k_eff = 2πf / c_sim (nombre d'onde)
    var kEff   = (sim.c_sim > 0) ? 2 * Math.PI * sim.freq / sim.c_sim : 0;
    var dpMax  = sim.K * sim.memAmplitude * kEff;
    return (dpMax > 1e-9) ? dp / dpMax : 0;
}

// ══════════════════════════════════════════════════════════════════════
//  Rayon adaptatif des points — dépend de la hauteur du tube uniquement.
//  La densité visuelle est portée par N ∝ ρ ; le rayon est indépendant
//  de ρ pour que chaque particule reste lisible quelle que soit la densité.
// ══════════════════════════════════════════════════════════════════════

function particleRadius() {
    var H = sim.tubeBottom - sim.tubeTop;
    return Math.max(1.5, Math.min(3.0, H * 0.015));
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation des particules — modèle lagrangien continu
//
//  Chaque particule représente une parcelle de fluide. Elle possède une
//  position de repos x0 (en px depuis tubeLeft). À chaque frame, sa
//  position affichée est : tubeLeft + x0 + u(x0, t) × tubeDispCap.
//
//  Le domaine s'étend au-delà de tubeRight de extraRight = 2×memAmplitude
//  pour que le milieu soit continu : lors d'une raréfaction à l'extrémité
//  droite, les particules "extérieures" entrent naturellement dans le tube.
//
//  N ∝ ρ : doubler ρ double le nombre de particules → densité visuelle
//  directement proportionnelle à la masse volumique du milieu.
//  N = min(8000, round((L + extraRight) × H × ρ / SLOT))
//  SLOT = 113 px² ≈ aire par particule pour ~25 % de remplissage à ρ=1.
// ══════════════════════════════════════════════════════════════════════

function initCols() {
    sim.cols = [];
    var L = sim.tubeLength;
    var H = sim.tubeBottom - sim.tubeTop;
    if (L <= 0 || H <= 0) return;

    var extraRight = sim.memAmplitude * 2;          // zone virtuelle droite
    var domain     = L + extraRight;
    var SLOT       = 113;                           // px² par particule à ρ=1
    var N = Math.min(8000,
                Math.max(50,
                    Math.round(domain * H * Math.max(0.1, sim.rho) / SLOT)));

    // Distribution jittered (grille régulière + bruit uniforme dans chaque case).
    // Borne la lacune maximale à ~2 × slot au lieu de ~7 × slot avec Math.random() pur,
    // ce qui élimine les bandes verticales blanches visibles au repos.
    // Les ry sont aussi jitterés pour éviter les alignements horizontaux.
    var slot = domain / N;
    // Tableau d'indices mélangés pour que les ry ne suivent pas l'ordre des x0
    var ryOrder = [];
    for (var j = 0; j < N; j++) ryOrder.push(j);
    for (var j = N - 1; j > 0; j--) {
        var k = Math.floor(Math.random() * (j + 1));
        var tmp = ryOrder[j]; ryOrder[j] = ryOrder[k]; ryOrder[k] = tmp;
    }

    for (var i = 0; i < N; i++) {
        sim.cols.push({
            x0      : (i + Math.random()) * slot,   // jittered : lacune max ≤ 2×slot
            selected: false,
            ry      : (ryOrder[i] + Math.random()) / N  // jittered en Y aussi
        });
    }
}

// Alias pour compatibilité ascendante
function initParticles() { initCols(); }

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

function updateDpxData() {
    var N  = 600;   // 600 pts pour résoudre λ_min ≈ 12 px sans aliasing
    var L  = sim.tubeLength;
    sim.dpxData = [];
    if (L <= 0) return;
    for (var i = 0; i <= N; i++) {
        var x = i / N * L;
        sim.dpxData.push({ x: x, dp: waveDeltaP(x, sim.simTime) });
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Enregistrement ΔP(t) aux positions des balises actives
// ══════════════════════════════════════════════════════════════════════

function updateDptData() {
    var t = sim.simTime;
    if (sim.beacon1.active) {
        var dp1 = waveDeltaP(sim.beacon1.x - sim.tubeLeft, t);
        sim.dptData1.push({ t: t, dp: dp1 });
        if (sim.dptData1.length > DP_MAX_POINTS) sim.dptData1.shift();
    }
    if (sim.beacon2.active) {
        var dp2 = waveDeltaP(sim.beacon2.x - sim.tubeLeft, t);
        sim.dptData2.push({ t: t, dp: dp2 });
        if (sim.dptData2.length > DP_MAX_POINTS) sim.dptData2.shift();
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Nettoyage des anciennes impulsions
//  Une impulsion est expirée quand son front arrière a quitté le tube.
// ══════════════════════════════════════════════════════════════════════

function pruneImpulses() {
    if (sim.c_sim <= 0) return;
    // L'impulsion i expire à t = startTime + T_IMPULSE + tubeLength/c_sim
    var cutoff = sim.simTime - T_IMPULSE - sim.tubeLength / sim.c_sim - 0.5;
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
    sim.simTime          = 0;
    sim.sinusoidalActive = false;
    sim.sinStartTime     = 0;
    sim.sinStopTime      = -1;
    sim.impulses         = [];
    sim.dptData1         = [];
    sim.dptData2         = [];
    sim.dpxData          = [];
    sim.vaguesDataM      = [];
    sim.graphView        = { xMin: 0, xMax: 30, yMin: -1, yMax: 1 };
    sim.graphViewHistory = [];
    sim.graphUserPanned  = false;
    sim.graphAutoScaled  = false;
    sim.graphDpxYMin     = -1;
    sim.graphDpxYMax     =  1;
    initCols();
    updateCelerite();
}
