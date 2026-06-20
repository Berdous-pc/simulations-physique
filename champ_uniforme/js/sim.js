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
    displayMode: 'chrono',  // 'trajectory' | 'chrono' | 'both'
    showVecPos:  false,
    showVecVit:  false,
    showVecAcc:  false,
    deltaT:      0.3,           // pas chronophotographie (s)

    /* ── Données run courant ── */
    trajPoints:      [],  // [{x,y}]
    chronoSnaps:     [],  // [{x,y,vx,vy,ax,ay,t}]
    graphData:       [],  // [{t,x,y,vx,vy,ax,ay}]
    analysisPoints:  [],  // [{x,y,vx,vy,ax,ay,t,color}]
    nextChronoTime: 0,

    /* ── Durée totale pré-calculée ── */
    maxT: 0,
    xMax: 0,
    yMax: 0,

    /* ── Bornes pré-calculées pour les graphes ── */
    graphBounds: null,

    /* ── Graphe ── */
    graphMode: 'single',  // 'single' | 'dual'
    graphTab1: 'y(x)',
    graphTab2: 'vy(t)',

    /* ── Vue canvas animation ── */
    scale:   20,   // px/m (recalculé par computeScale, = scaleX en mode ortho)
    scaleX:  20,   // px/m axe horizontal
    scaleY:  20,   // px/m axe vertical
    axisMode: 'ortho',  // 'ortho' | 'adapted'
    originX: 65,   // marge gauche (px)
    originY: 50,   // marge basse  (px)
};

/* ── Facteurs de vitesse selon le cran du slider ── */
var SPEED_VALUES = [0.10, 0.25, 0.50, 1.00];

/* ── Constante d'intégration ── */
var PHYS_DT = 1 / 300;  // pas de temps simulation (s)

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
    sim.trajPoints     = [{x: sim.x, y: sim.y}];
    sim.chronoSnaps    = [];
    sim.graphData      = [{t:0, x:sim.x, y:sim.y, vx:sim.vx, vy:sim.vy, ax:sim.ax, ay:sim.ay}];
    sim.analysisPoints = [];
    sim.nextChronoTime = 0;
    sim.ended = false;
    if (sim.displayMode === 'chrono' || sim.displayMode === 'both') {
        pushChronoSnap();
        sim.nextChronoTime = sim.deltaT;
    }
    computeTrajectoryBounds();
    computeGraphBounds();
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
    sim.xMax  = Math.max(xMax, 5);
    sim.yMax  = Math.max(yMax, sim.h + 1, 1);
}

/* ─────────────────────────────────────────────────
   computeGraphBounds
   Simule la trajectoire complète et collecte les
   bornes min/max de toutes les grandeurs graphables.
───────────────────────────────────────────────── */
function computeGraphBounds() {
    var alphaRad = sim.alpha * Math.PI / 180;
    var tx = 0, ty = sim.h;
    var tvx = sim.v0 * Math.cos(alphaRad);
    var tvy = sim.v0 * Math.sin(alphaRad);
    var dt = PHYS_DT * 4;

    /* Accélération initiale */
    var Fx0 = sim.windForce - (sim.useFriction ? sim.k * tvx : 0);
    var Fy0 = -sim.g * sim.mass - (sim.useFriction ? sim.k * tvy : 0);
    var tax0 = Fx0 / sim.mass, tay0 = Fy0 / sim.mass;

    var b = {
        t:  { min: 0, max: 0 },
        x:  { min: 0, max: Math.max(tx, 0.01) },
        y:  { min: 0, max: Math.max(ty, 0.01) },
        vx: { min: tvx, max: tvx },
        vy: { min: tvy, max: tvy },
        ax: { min: tax0, max: tax0 },
        ay: { min: tay0, max: tay0 }
    };

    for (var i = 0; i < 20000; i++) {
        var Fx = sim.windForce - (sim.useFriction ? sim.k * tvx : 0);
        var Fy = -sim.g * sim.mass - (sim.useFriction ? sim.k * tvy : 0);
        var tax = Fx / sim.mass, tay = Fy / sim.mass;
        tvx += tax * dt;
        tvy += tay * dt;
        tx  += tvx * dt;
        ty  += tvy * dt;
        var tt = (i + 1) * dt;

        if (tx  > b.x.max)  b.x.max  = tx;
        if (tvx > b.vx.max) b.vx.max = tvx;
        if (tvx < b.vx.min) b.vx.min = tvx;
        if (tvy > b.vy.max) b.vy.max = tvy;
        if (tvy < b.vy.min) b.vy.min = tvy;
        if (tax > b.ax.max) b.ax.max = tax;
        if (tax < b.ax.min) b.ax.min = tax;
        if (tay > b.ay.max) b.ay.max = tay;
        if (tay < b.ay.min) b.ay.min = tay;
        if (ty  > b.y.max)  b.y.max  = ty;
        b.t.max = tt;

        if (ty <= 0 && i > 2) break;
    }

    /* Garanties minimales */
    b.x.max  = Math.max(b.x.max,  1);
    b.y.max  = Math.max(b.y.max,  sim.h + 1, 1);
    b.y.min  = 0;  /* jamais sous le sol */

    sim.graphBounds = b;
}

/* ─────────────────────────────────────────────────
   computeScale
   Appelée après computeTrajectoryBounds, quand on
   connaît la taille du canvas.
───────────────────────────────────────────────── */
function computeScale(canvasW, canvasH) {
    var availW = canvasW - sim.originX - 20;
    var availH = canvasH - sim.originY - 30;
    var sx = availW / (sim.xMax * 1.05);
    var sy = availH / (sim.yMax * 1.05);
    if (sim.axisMode === 'adapted') {
        sim.scaleX = Math.max(2, sx);
        sim.scaleY = Math.max(2, sy);
    } else {
        sim.scaleX = sim.scaleY = Math.max(2, Math.min(sx, sy));
    }
    sim.scale = sim.scaleX;
}

/* ── Formatage nombre français ── */
function fmt(v, dec) {
    return v.toFixed(dec).replace('.', ',');
}

/* ── Runs sauvegardées ── */
var savedRuns     = [];
var _nextSaveId   = 1;
var MAX_SAVED_RUNS = 5;
var SAVE_COLORS   = ['#e67e22', '#c0392b', '#27ae60', '#8e44ad', '#16a085'];
