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
// Valeur réduite (0.6 s) pour un paquet d'onde compact et bien visible
var T_IMPULSE        = 0.6;   // secondes de temps simulé
// Nombre max de points enregistrés pour ΔP(t)
var DP_MAX_POINTS    = 1600;  // 300 pts/s × 5 s + marge → courbes lisses sur la fenêtre entière

// ── État global de la simulation ──────────────────────────────────────
var sim = {

    // ── Contrôle de l'animation ─────────────────────────────────────
    paused      : false,   // démarre en marche (agitation thermique visible)
    simTime     : 0,       // temps simulé cumulé (s)

    // ── Mode source : null | 'impulse' | 'sinus' ────────────────────
    sourceMode        : null,   // aucun mode actif au chargement
    impulsePropagating: false,  // true = une impulsion est en cours de propagation

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
    // Position affichée : tubeLeft + x0 + waveDisplacement(x0,t) × tubeDispCap
    cols              : [],
    selectionMode     : false,   // mode sélection par proximité actif
    selectionRadius   : 25,      // px, rayon de sélection (recalculé dans initCols)

    // ── Balises (lignes verticales draggables dans le tube) ──────────
    beacon1 : { active: false, x: 0 },   // balise 1 (orange)
    beacon2 : { active: false, x: 0 },   // balise 2 (vert)

    // ── Géométrie du tube (renseignée par tube.js resize) ────────────
    tubeLeft   : 0,
    tubeRight  : 0,
    tubeTop    : 0,
    tubeBottom : 0,
    tubeLength : 0,    // = tubeRight − tubeLeft (px)

    // ── Mode coloriage par pression ─────────────────────────────────
    pressureColorMode : false,   // true = particules et fond colorés selon ΔP

    // ── Données graphes ──────────────────────────────────────────────
    graphMode : 'dpx',   // 'dpx' (spatial) | 'dpt' (temporel)
    dpxData   : [],      // [{x, dp}] snapshot courant de ΔP(x)
    dptData1  : [],      // [{t, dp}] série temporelle balise 1
    dptData2  : [],      // [{t, dp}] série temporelle balise 2
    dptTimeOrigin : 0,   // sim.simTime au dernier reset du graphe ΔP(t)

    // ── Vue graphe ΔP(t) ─────────────────────────────────────────────
    graphView        : { xMin: 0, xMax: 5, yMin: -1, yMax: 1 },
    graphViewHistory : [],
    graphZoomMode    : false,
    graphCursorMode  : false,
    graphUserPanned  : false,   // true = l'utilisateur a pané manuellement

    // ── Vue graphe ΔP(x) ─────────────────────────────────────────────
    graphDpxYMin : -1,
    graphDpxYMax :  1,
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
    // Forme du déplacement membranaire : (1 − cos(2π × τ/T)) / 2
    // → démarre à 0, monte doucement, revient à 0 en T (enveloppe demi-cosinus).
    // Sa dérivée spatiale (= ΔP dans le graphe) est un sinus pur sur [0, 2π] :
    // compression (+) puis détente (−), exactement 1 période propre.
    for (var i = 0; i < sim.impulses.length; i++) {
        var imp = sim.impulses[i];
        var tau_imp = t_ret - imp.startTime;
        if (tau_imp >= 0 && tau_imp <= T_IMPULSE) {
            d += sim.memAmplitude * (1 - Math.cos(2 * Math.PI * tau_imp / T_IMPULSE)) / 2;
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
    var freqEff = (sim.sourceMode === 'impulse') ? 1.0 / T_IMPULSE : sim.freq;
    var aEff    = (sim.sourceMode === 'impulse') ? sim.memAmplitude / 2 : sim.memAmplitude;
    var kEff    = (sim.c_sim > 0) ? 2 * Math.PI * freqEff / sim.c_sim : 0;

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
    var dpMax = sim.K * aEff * kEff;
    if (dpMax > 1e-9) {
        var kh     = kEff * h;
        var sincKH = (kh > 1e-6) ? Math.sin(kh) / kh : 1.0;
        return dp / (dpMax * sincKH);
    }
    return 0;
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
//  Le domaine s'étend au-delà de tubeRight de extraRight = 2×memAmplitude×max(1,cap)
//  pour que le milieu soit continu : lors d'une raréfaction à l'extrémité
//  droite, les particules "extérieures" entrent naturellement dans le tube.
//  extraRight est proportionnel au boost de cap pour éviter les zones blanches
//  sur grand écran avec petite fréquence / grand K / petit ρ.
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

    // Zone virtuelle gauche et droite : doivent couvrir le déplacement max d'une
    // particule, qui vaut memAmplitude × tubeDispCap. On recalcule tubeDispCap
    // ici avec les paramètres courants pour avoir la bonne valeur.
    var freqEff_ic = sim.freq;
    var kEff_ic    = (sim.c_sim > 0) ? 2 * Math.PI * freqEff_ic / sim.c_sim : 0;
    var akEff_ic   = sim.memAmplitude * kEff_ic;
    var cap_ic     = (akEff_ic > 0) ? Math.max(0.55, Math.min(0.90, akEff_ic)) / akEff_ic : 1.0;
    var extraLeft  = sim.memAmplitude * cap_ic + 4;   // +4 px de marge sécurité
    // La zone droite doit être au moins aussi large que le déplacement max
    // amplifié. Si cap_ic > 1 (boost basse fréquence), les particules virtuelles
    // droites doivent se trouver assez loin pour que, déplacées vers la gauche,
    // elles couvrent la zone proche de tubeRight sans laisser de blanc.
    var extraRight = sim.memAmplitude * Math.max(1.0, cap_ic) * 2 + 4; // zone virtuelle droite
    var domain     = L + extraRight + extraLeft;
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
            x0      : (i + Math.random()) * slot - extraLeft,  // jittered, domaine [-extraLeft, L+extraRight]
            selected: false,
            ry      : (ryOrder[i] + Math.random()) / N  // jittered en Y aussi
        });
    }

    // ── Recalcul du rayon de sélection adaptatif à la densité ─────────
    // Le rayon s'adapte à l'espacement moyen des colonnes pour rester cohérent
    // quelle que soit la résolution et la densité (ρ).
    // Formule : rayon = 1.5 × dx0, borné entre 20 et 40 px
    var dx0 = slot;
    sim.selectionRadius = Math.max(20, Math.min(40, 1.5 * dx0));
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
var MU_DEFAULT        = 1.0;    // masse linéique par défaut (kg/m)
var T_DEFAULT         = 4.0;    // tension par défaut (N)
// C_BASE_CORDE : px/s par unité de célérité (m/s) — recalibré dans tube.js resize
var C_BASE_CORDE      = 43.0;
// Bornes du slider Amplitude (cm) — l'amplitude visuelle (memAmplitude, px)
// est mappée sur ces bornes indépendamment de l'échelle spatiale (x), pour
// rester lisible quelle que soit la valeur choisie (cf. _recalcMemAmplitudeCorde).
var CORDE_AMPL_CM_MIN = 1.0;
var CORDE_AMPL_CM_MAX = 5.0;

// ── État global de la simulation corde ────────────────────────────────
var simCorde = {

    // ── Contrôle de l'animation ─────────────────────────────────────
    paused      : false,
    simTime     : 0,

    // ── Mode source : null | 'impulse' | 'sinus' ────────────────────
    sourceMode        : null,
    impulsePropagating: false,

    // ── Source — composante sinusoïdale ─────────────────────────────
    sinusoidalActive : false,
    sinStartTime     : 0,
    sinStopTime      : -1,

    // ── Source — impulsions (superposables) ─────────────────────────
    impulses : [],

    // ── Paramètres physiques de la corde ────────────────────────────
    freq        : 1.5,          // fréquence de la sinusoïdale (Hz)
    amplitudeCm : 2.0,          // amplitude imposée par le vibreur (cm, affiché)
    mu          : MU_DEFAULT,   // masse linéique (kg/m)
    T_tension   : T_DEFAULT,    // tension (N)
    attenuation : 0.0,          // coefficient d'atténuation

    // ── Propriétés dérivées ──────────────────────────────────────────
    c_sim : 0,    // célérité en px/s
    c_cms : 0,    // célérité en m/s (affichée)

    // ── Amplitude du pot vibrant (recalibrée dans resize) ────────────
    memAmplitude : 10,   // px (déplacement transversal maximal, échelle visuelle)
    pxPerCmAmpl  : 1,    // px par cm d'amplitude réelle — pour reconvertir
                          // les déplacements (px) en valeurs physiques (cm)

    // ── Géométrie de la zone corde (renseignée par tube.js resize) ────
    cordeLeft   : 0,
    cordeRight  : 0,
    cordeMiddleY: 0,    // y de la corde au repos (centre vertical)
    cordeTop    : 0,
    cordeBottom : 0,
    cordeLength : 0,    // = cordeRight − cordeLeft (px)

    // ── Balises (lignes verticales draggables) ───────────────────────
    beacon1 : { active: false, x: 0 },
    beacon2 : { active: false, x: 0 },

    // ── Données graphes ──────────────────────────────────────────────
    graphMode : 'dpx',   // 'dpx' (spatial) | 'dpt' (temporel)
    yxData    : [],      // [{x, y}] snapshot courant de y(x)
    ytData1   : [],      // [{t, y}] série temporelle balise 1
    ytData2   : [],      // [{t, y}] série temporelle balise 2
    ytTimeOrigin : 0,    // simTime au dernier reset du graphe y(t)

    // ── Vue graphe y(t) ──────────────────────────────────────────────
    graphView        : { xMin: 0, xMax: 5, yMin: -1, yMax: 1 },
    graphViewHistory : [],
    graphZoomMode    : false,
    graphCursorMode  : false,
    graphUserPanned  : false,

    // ── Vue graphe y(x) ──────────────────────────────────────────────
    graphYxYMin : -1,
    graphYxYMax :  1,

    // ── Propriétés de l'onde (readout étendu) ─────────────────────────
    wavePropsVisible : false,
    speedFactor      : 1.0,
};

// ══════════════════════════════════════════════════════════════════════
//  Calcul de la célérité de la corde
//  c = √(T / μ)  analogue à c = √(K / ρ)
// ══════════════════════════════════════════════════════════════════════

function updateCeleriteCorde() {
    if (simCorde.mu <= 0) return;
    var c_ms       = Math.sqrt(simCorde.T_tension / simCorde.mu);   // m/s, formule réelle
    simCorde.c_sim = c_ms * C_BASE_CORDE;   // px/s pour l'animation
    simCorde.c_cms = c_ms;                  // m/s, valeur affichée
}

// ══════════════════════════════════════════════════════════════════════
//  Déplacement du pot vibrant au temps retardé t_ret
//  Analogue à memDisplacement() mais utilise les paramètres de simCorde
// ══════════════════════════════════════════════════════════════════════

function memDisplacementCorde(t_ret) {
    var d = 0;

    // ── Composante sinusoïdale ────────────────────────────────────────
    if (simCorde.sinStopTime !== -1 || simCorde.sinusoidalActive) {
        var sinStop2 = simCorde.sinusoidalActive ? 1e15 : simCorde.sinStopTime;
        if (t_ret >= simCorde.sinStartTime && t_ret <= sinStop2) {
            var tau = t_ret - simCorde.sinStartTime;
            d += simCorde.memAmplitude * Math.sin(2 * Math.PI * simCorde.freq * tau);
        }
    }

    // ── Composantes impulsions ────────────────────────────────────────
    for (var i = 0; i < simCorde.impulses.length; i++) {
        var imp     = simCorde.impulses[i];
        var tau_imp = t_ret - imp.startTime;
        if (tau_imp >= 0 && tau_imp <= T_IMPULSE) {
            d += simCorde.memAmplitude * (1 - Math.cos(2 * Math.PI * tau_imp / T_IMPULSE)) / 2;
        }
    }

    return d;
}

// ══════════════════════════════════════════════════════════════════════
//  Déplacement transversal de la corde au point x_px au temps t_sim
//  Modèle : onde progressive amortie, corde infinie à droite (pas de réflexion)
//  y(x, t) = d_pot(t − x/c) × exp(−α × x/L)
// ══════════════════════════════════════════════════════════════════════

function cordeDisplacement(x_px, t_sim) {
    if (simCorde.c_sim <= 0 || simCorde.cordeLength <= 0) return 0;
    var delay = x_px / simCorde.c_sim;
    var t_ret = t_sim - delay;
    var alpha = simCorde.attenuation * 5;
    var atten = Math.exp(-alpha * x_px / simCorde.cordeLength);
    return memDisplacementCorde(t_ret) * atten;
}

// ══════════════════════════════════════════════════════════════════════
//  Cap visuel du déplacement transversal
//  Contrairement au tube (où ak doit rester dans une fenêtre pour éviter
//  le chevauchement des particules), la corde n'a pas cette contrainte
//  physique : seule la borne géométrique (memAmplitude ≤ 90% de la
//  demi-hauteur de la zone, cf. _recalcMemAmplitudeCorde dans tube.js)
//  est nécessaire pour garder l'onde lisible. Le slider Amplitude doit
//  donc se répercuter directement, sans compensation.
// ══════════════════════════════════════════════════════════════════════

var cordeDispCap = 1.0;

function updateCordeDispCap() {
    cordeDispCap = 1.0;
}

// ══════════════════════════════════════════════════════════════════════
//  Mise à jour du snapshot y(x)
//  Analogue à updateDpxData() mais pour le déplacement transversal
// ══════════════════════════════════════════════════════════════════════

function updateYxData() {
    var L = simCorde.cordeLength;
    simCorde.yxData = [];
    if (L <= 0) return;

    var freqEff = (simCorde.sourceMode === 'impulse') ? 1.0 / T_IMPULSE : simCorde.freq;
    var lambda  = (simCorde.c_sim > 0) ? simCorde.c_sim / freqEff : L;
    var N = 400;
    if (lambda > 0) {
        N = Math.min(6000, Math.max(400, Math.ceil(20 * L / lambda)));
    }

    for (var i = 0; i <= N; i++) {
        var x = i / N * L;
        var y = cordeDisplacement(x, simCorde.simTime);
        simCorde.yxData.push({ x: x, y: y });
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Enregistrement y(t) aux positions des balises actives
// ══════════════════════════════════════════════════════════════════════

function updateYtData(t) {
    if (simCorde.beacon1.active) {
        var y1 = cordeDisplacement(simCorde.beacon1.x - simCorde.cordeLeft, t);
        simCorde.ytData1.push({ t: t, y: y1 });
        if (simCorde.ytData1.length > DP_MAX_POINTS) simCorde.ytData1.shift();
    }
    if (simCorde.beacon2.active) {
        var y2 = cordeDisplacement(simCorde.beacon2.x - simCorde.cordeLeft, t);
        simCorde.ytData2.push({ t: t, y: y2 });
        if (simCorde.ytData2.length > DP_MAX_POINTS) simCorde.ytData2.shift();
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Nettoyage des anciennes impulsions corde
// ══════════════════════════════════════════════════════════════════════

function pruneImpulsesCorde() {
    if (simCorde.c_sim <= 0) return;
    var cutoff = simCorde.simTime - T_IMPULSE - simCorde.cordeLength / simCorde.c_sim - 0.5;
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
    simCorde.sinStartTime       = 0;
    simCorde.sinStopTime        = -1;
    simCorde.impulses           = [];
    simCorde.impulsePropagating = false;
    simCorde.ytData1            = [];
    simCorde.ytData2            = [];
    simCorde.ytTimeOrigin       = 0;
    simCorde.yxData             = [];
    simCorde.graphView          = { xMin: 0, xMax: 5, yMin: -1, yMax: 1 };
    simCorde.graphViewHistory   = [];
    simCorde.graphUserPanned    = false;
    simCorde.graphYxYMin        = -1;
    simCorde.graphYxYMax        =  1;
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

function updateDpxData() {
    var L  = sim.tubeLength;
    sim.dpxData = [];
    if (L <= 0) return;

    // ── Échantillonnage adaptatif ─────────────────────────────────────
    // On veut au moins 20 points par longueur d'onde pour tracer un sinus
    // correctement sans qu'il paraisse "pointu".
    // λ (px) = c_sim / f  → points nécessaires = 20 × L / λ = 20 × L × f / c_sim
    // Minimum absolu : 400 pts (basse fréquence / impulsion)
    // Maximum : 6000 pts (évite les calculs trop lents)
    var freqEff = (sim.sourceMode === 'impulse') ? 1.0 / T_IMPULSE : sim.freq;
    var lambda  = (sim.c_sim > 0) ? sim.c_sim / freqEff : L;  // px
    var N = 400;
    if (lambda > 0) {
        N = Math.min(6000, Math.max(400, Math.ceil(20 * L / lambda)));
    }

    for (var i = 0; i <= N; i++) {
        var x = i / N * L;
        sim.dpxData.push({ x: x, dp: waveDeltaP(x, sim.simTime) });
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Enregistrement ΔP(t) aux positions des balises actives
// ══════════════════════════════════════════════════════════════════════

function updateDptData(t) {
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
    sim.simTime            = 0;
    sim.paused             = false;
    sim.sourceMode         = null;
    sim.sinusoidalActive   = false;
    sim.sinStartTime       = 0;
    sim.sinStopTime        = -1;
    sim.impulses           = [];
    sim.impulsePropagating = false;
    sim.dptData1           = [];
    sim.dptData2           = [];
    sim.dptTimeOrigin      = 0;
    sim.dpxData            = [];
    sim.graphView          = { xMin: 0, xMax: 5, yMin: -1, yMax: 1 };
    sim.graphViewHistory   = [];
    sim.graphUserPanned    = false;
    sim.graphAutoScaled    = false;
    sim.graphDpxYMin       = -1;
    sim.graphDpxYMax       =  1;
    initCols();
    updateCelerite();
}

// ══════════════════════════════════════════════════════════════════════
//  Sélection de particules par proximité
//  Sélectionne toutes les particules dont la position de repos x0 se
//  trouve dans un rayon selectionRadius autour du clic utilisateur.
//
//  Paramètres :
//    • x0_click : position horizontale cliquée (en px depuis tubeLeft)
//    • modifiers.ctrl : true si Ctrl est enfoncé (ajouter à la sélection)
//    • modifiers.shift : true si Maj est enfoncée (retirer de la sélection)
//
//  Logique :
//    • Clic normal : effacer tout, sélectionner proximité
//    • Ctrl+clic : ajouter à la sélection actuelle
//    • Maj+clic : retirer de la sélection actuelle
// ══════════════════════════════════════════════════════════════════════

function selectNearbyParticles(x0_click, modifiers) {
    if (!sim.cols || sim.cols.length === 0) return;

    var ctrl = modifiers && modifiers.ctrl;
    var shift = modifiers && modifiers.shift;

    // Mode normal (aucun modifieur) : reset + sélectionner
    if (!ctrl && !shift) {
        for (var i = 0; i < sim.cols.length; i++) {
            sim.cols[i].selected = false;
        }
    }

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
