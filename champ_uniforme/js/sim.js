/* ══════════════════════════════════════════════════
   Simulation pédagogique — Physique-Chimie Lycée
   Auteur  : Mathieu Berdous
   Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
══════════════════════════════════════════════════ */

/* sim.js — état global + physique (champ de pesanteur) */

var sim = {
    /* ── Paramètres physiques ── */
    h:           0,      // hauteur initiale (m)
    v0:          15,     // norme vitesse initiale (m/s)
    alpha:       45,     // angle avec l'horizontal (degrés)
    g:           9.81,   // pesanteur (m/s²)
    mass:        0.43,   // masse balle de foot (kg, fixe)
    useFriction: false,
    k:           0.15,   // coeff frottement linéaire (N·s/m)
    windForce:   0,      // force vent horizontale (N, + = droite)

    /* ── État courant ── */
    t:  0, x: 0, y: 0,
    vx: 0, vy: 0,
    ax: 0, ay: 0,
    paused: true,
    ended:  false,
    speedFactor: 1.0,

    /* ── Options d'affichage ── */
    displayMode: 'trajectory',  // 'trajectory' | 'chrono' | 'both'
    showVecPos:  false,
    showVecVit:  false,
    showVecAcc:  false,
    deltaT:      0.3,           // pas chronophotographie (s)

    /* ── Données run courant ── */
    trajPoints:    [],  // [{x,y}]
    chronoSnaps:   [],  // [{x,y,vx,vy,ax,ay,t}]
    graphData:     [],  // [{t,x,y,vx,vy,ax,ay}]
    nextChronoTime: 0,

    /* ── Durée totale pré-calculée ── */
    maxT: 0,
    xMax: 0,
    yMax: 0,

    /* ── Graphe ── */
    graphMode: 'single',  // 'single' | 'dual'
    graphTab1: 'y(x)',
    graphTab2: 'vy(t)',

    /* ── Vue canvas animation ── */
    scale:   20,   // px/m (recalculé par computeScale)
    originX: 65,   // marge gauche (px)
    originY: 50,   // marge basse  (px)
};

/* ── Facteurs de vitesse selon le cran du slider ── */
var SPEED_VALUES = [0.10, 0.25, 0.50, 1.00];

/* ── Constante d'intégration ── */
var PHYS_DT = 1 / 120;  // pas de temps simulation (s)

/* ─────────────────────────────────────────────────
   resetSim — réinitialise l'état au début du lancer
───────────────────────────────────────────────── */
function resetSim() {
    var alphaRad = sim.alpha * Math.PI / 180;
    sim.t  = 0;
    sim.x  = 0;
    sim.y  = sim.h;
    sim.vx = sim.v0 * Math.cos(alphaRad);
    sim.vy = sim.v0 * Math.sin(alphaRad);
    computeAcceleration();
    sim.trajPoints    = [{x: sim.x, y: sim.y}];
    sim.chronoSnaps   = [];
    sim.graphData     = [{t:0, x:sim.x, y:sim.y, vx:sim.vx, vy:sim.vy, ax:sim.ax, ay:sim.ay}];
    sim.nextChronoTime = 0;
    sim.ended = false;
    if (sim.displayMode === 'chrono' || sim.displayMode === 'both') {
        pushChronoSnap();
        sim.nextChronoTime = sim.deltaT;
    }
    computeTrajectoryBounds();
}

/* ── Calcul accélération en fonction de l'état courant ── */
function computeAcceleration() {
    var Fx = sim.windForce;
    var Fy = -sim.g * sim.mass;
    if (sim.useFriction) {
        Fx -= sim.k * sim.vx;
        Fy -= sim.k * sim.vy;
    }
    sim.ax = Fx / sim.mass;
    sim.ay = Fy / sim.mass;
}

/* ── Euler-Cromer, un pas de dt ── */
function stepPhysics(dt) {
    computeAcceleration();
    sim.vx += sim.ax * dt;
    sim.vy += sim.ay * dt;
    sim.x  += sim.vx * dt;
    sim.y  += sim.vy * dt;
    sim.t  += dt;
}

/* ── Enregistre un snapshot chronophotographie ── */
function pushChronoSnap() {
    sim.chronoSnaps.push({
        x: sim.x, y: sim.y,
        vx: sim.vx, vy: sim.vy,
        ax: sim.ax, ay: sim.ay,
        t: sim.t
    });
}

/* ── Avance la simulation de dtReal secondes réelles ── */
function advanceSim(dtReal) {
    if (sim.paused || sim.ended) return;

    var dtSim = dtReal * sim.speedFactor;
    var elapsed = 0;

    while (elapsed < dtSim) {
        var step = Math.min(PHYS_DT, dtSim - elapsed);
        stepPhysics(step);
        elapsed += step;

        /* Enregistrement trajectoire (toutes les 2 frames env.) */
        if (sim.trajPoints.length === 0 ||
            Math.hypot(sim.x - sim.trajPoints[sim.trajPoints.length-1].x,
                       sim.y - sim.trajPoints[sim.trajPoints.length-1].y) > 0.05) {
            sim.trajPoints.push({x: sim.x, y: sim.y});
        }

        /* Enregistrement données graphes */
        sim.graphData.push({
            t: sim.t, x: sim.x, y: sim.y,
            vx: sim.vx, vy: sim.vy,
            ax: sim.ax, ay: sim.ay
        });

        /* Chronophotographie */
        if ((sim.displayMode === 'chrono' || sim.displayMode === 'both') &&
            sim.t >= sim.nextChronoTime) {
            pushChronoSnap();
            sim.nextChronoTime += sim.deltaT;
        }

        /* Arrêt au sol */
        if (sim.y <= 0 && sim.t > 0.001) {
            sim.y = 0;
            sim.vx = 0; sim.vy = 0; sim.ax = 0; sim.ay = 0;
            sim.ended = true;
            sim.trajPoints.push({x: sim.x, y: 0});
            sim.graphData.push({
                t: sim.t, x: sim.x, y: 0,
                vx: 0, vy: 0, ax: 0, ay: 0
            });
            break;
        }
    }
}

/* ─────────────────────────────────────────────────
   computeTrajectoryBounds
   Intègre toute la trajectoire pour trouver xMax/yMax
   et calculer l'échelle canvas appropriée.
───────────────────────────────────────────────── */
function computeTrajectoryBounds() {
    var alphaRad = sim.alpha * Math.PI / 180;
    var tx = 0, ty = sim.h;
    var tvx = sim.v0 * Math.cos(alphaRad);
    var tvy = sim.v0 * Math.sin(alphaRad);
    var xMax = 0, yMax = sim.h;
    var dt = PHYS_DT * 4;
    var maxSteps = 20000;

    for (var i = 0; i < maxSteps; i++) {
        var Fx = sim.windForce;
        var Fy = -sim.g * sim.mass;
        if (sim.useFriction) {
            Fx -= sim.k * tvx;
            Fy -= sim.k * tvy;
        }
        var ax = Fx / sim.mass;
        var ay = Fy / sim.mass;
        tvx += ax * dt;
        tvy += ay * dt;
        tx  += tvx * dt;
        ty  += tvy * dt;

        if (tx > xMax) xMax = tx;
        if (ty > yMax) yMax = ty;

        if (ty <= 0 && i > 2) break;
    }

    /* Durée totale approximative */
    sim.maxT  = i * dt;
    sim.xMax  = Math.max(xMax, 1);
    sim.yMax  = Math.max(yMax, sim.h + 1, 1);
}

/* ─────────────────────────────────────────────────
   computeScale
   Appelée après computeTrajectoryBounds, quand on
   connaît la taille du canvas.
───────────────────────────────────────────────── */
function computeScale(canvasW, canvasH) {
    var availW = canvasW - sim.originX - 20;
    var availH = canvasH - sim.originY - 30;
    var scaleX = availW / (sim.xMax * 1.18);
    var scaleY = availH / (sim.yMax * 1.18);
    sim.scale = Math.max(2, Math.min(scaleX, scaleY));
}

/* ── Formatage nombre français ── */
function fmt(v, dec) {
    return v.toFixed(dec).replace('.', ',');
}
