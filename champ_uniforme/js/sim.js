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
    showFieldG:    false,
    showVecPos:    false,
    showVecVit:    true,
    showVecAcc:    false,
    showVecForces: false,
    showVecSumF:   false,
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
    graphTab1: 'x(t)',
    graphTab2: 'y(t)',

    /* ── Vue canvas animation ── */
    scale:   20,   // px/m (recalculé par computeScale, = scaleX en mode ortho)
    scaleX:  20,   // px/m axe horizontal
    scaleY:  20,   // px/m axe vertical
    axisMode: 'ortho',  // 'ortho' | 'adapted'
    originX: 65,   // marge gauche (px)
    originY: 50,   // marge basse  (px)

    /* ── Vue projection ── */
    viewMode:   'oxy',   // 'oxy' | 'proj-x' | 'proj-y'
    viewTrans:  null,    // null | { startT, fromMode, toMode }
    splitPhase: false,   // séparer montée/descente (proj-y)
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
    /* Bornes propres à ce run (avant fusion avec les runs sauvegardées) */
    sim._ownMaxT = sim.maxT;
    sim._ownXMax = sim.xMax;
    sim._ownYMax = sim.yMax;
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
    sim._ownGraphBounds = JSON.parse(JSON.stringify(b));
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

/* ══════════════════════════════════════════════════
   CHAMP ÉLECTRIQUE — particules + état + physique
══════════════════════════════════════════════════ */

var PARTICLES = [
    { name: 'Électron',    q: -1.602e-19, m: 9.109e-31  },
    { name: 'Positon',     q:  1.602e-19, m: 9.109e-31  },
    { name: 'Proton',      q:  1.602e-19, m: 1.673e-27  },
    { name: 'Noyau He²⁺', q:  3.204e-19, m: 6.644e-27  },
    { name: 'Ion H₂⁺',    q:  1.602e-19, m: 3.346e-27  },
    { name: 'Ion Na⁺',    q:  1.602e-19, m: 3.818e-26  },
    { name: 'Ion H⁻',     q: -1.602e-19, m: 1.674e-27  },
    { name: 'Ion Cl⁻',    q: -1.602e-19, m: 5.887e-26  },
];

var PHYS_DT_E      = 5e-12;
var SPEED_VALUES_E = [2e-9, 8e-9, 3e-8, 1e-7];

var simE = {
    /* ── Paramètres physiques ── */
    particleIdx: 0,
    q:    -1.602e-19,
    mass:  9.109e-31,
    v0:    1e7,           // norme vitesse initiale (m/s)
    alpha: 0,             // angle (degrés)
    E:     4.5e4,         // champ électrique (V/m)
    armatureMode: 'parallel-x',
    L:    0.10,           // longueur armatures parallèles (m)
    e:    0.04,           // écartement / distance entre plaques (m)
    /* ── Compatibilité draw.js (forces pesanteur = 0) ── */
    g: 0, windForce: 0, useFriction: false, k: 0,
    /* ── État courant ── */
    t: 0, x: 0, y: 0,
    vx: 0, vy: 0,
    ax: 0, ay: 0,
    paused: true, ended: false,
    speedFactor: 2e-9,
    /* ── Options d'affichage ── */
    displayMode:   'chrono',
    showFieldE:    false,
    showFieldG:    false,
    showVecPos:    false,
    showVecVit:    true,
    showVecAcc:    false,
    showVecForces: false,
    showVecSumF:   false,
    deltaT: 1e-9,
    /* ── Données run courant ── */
    trajPoints: [], chronoSnaps: [], graphData: [], analysisPoints: [],
    nextChronoTime: 0,
    /* ── Bornes ── */
    maxT: 0, xMax: 0, yMax: 0,
    graphBounds: null,
    _ownMaxT: 0, _ownXMax: 0, _ownYMax: 0, _ownGraphBounds: null,
    /* ── Graphe ── */
    graphMode: 'single', graphTab1: 'y(x)', graphTab2: 'vy(t)',
    /* ── Vue canvas ── */
    scale: 1000, scaleX: 1000, scaleY: 5000,
    axisMode: 'adapted',
    originX: 65, originY: 200,
    viewMode: 'oxy', viewTrans: null, splitPhase: false,
    /* ── Échelles vecteurs (calculées dans resetSimE) ── */
    vecScaleVit: 6e-6, vecScaleAcc: 1e-14, vecScaleForce: 2e17,
};

var savedRunsE       = [];
var _nextSaveIdE     = 1;
var _currentRunColorE = SAVE_COLORS[0];

function _updateCurrentRunColorE() {
    var used = savedRunsE.map(function(r) { return r.color; });
    _currentRunColorE = SAVE_COLORS.find(function(c) { return used.indexOf(c) === -1; }) || null;
}

function computeScaleE(canvasW, canvasH) {
    simE.originY = Math.round(canvasH / 2);
    var availW = canvasW - simE.originX - 20;
    var availH = canvasH - 60;
    var sx = simE.xMax > 0 ? availW / (simE.xMax * 1.05) : 1000;
    var sy = simE.yMax > 0 ? availH / (simE.yMax * 2 * 1.05) : 5000;
    simE.scaleX = Math.max(1, sx);
    simE.scaleY = Math.max(1, sy);
    simE.scale  = simE.scaleX;
}

function resetSimE() {
    var p = PARTICLES[simE.particleIdx];
    simE.q    = p.q;
    simE.mass = p.m;
    var alphaRad = simE.alpha * Math.PI / 180;
    simE.t = 0; simE.x = 0; simE.y = 0;
    simE.vx = simE.v0 * Math.cos(alphaRad);
    simE.vy = simE.v0 * Math.sin(alphaRad);
    _nextGraphRecordE = 0;
    computeAccelerationE();
    /* Échelles vecteurs : target ~55 px pour la valeur initiale */
    var _tpx = 55;
    simE.vecScaleVit   = simE.v0 > 0 ? _tpx / simE.v0 : 6e-6;
    var _maxA = Math.abs(simE.q * simE.E) / simE.mass;
    simE.vecScaleAcc   = _maxA > 0 ? _tpx / _maxA : 1e-14;
    simE.vecScaleForce = Math.abs(simE.q * simE.E) > 0 ? _tpx / Math.abs(simE.q * simE.E) : 2e17;

    simE.trajPoints     = [{x: 0, y: 0}];
    simE.chronoSnaps    = [];
    simE.graphData      = [{t:0, x:0, y:0, vx:simE.vx, vy:simE.vy, ax:simE.ax, ay:simE.ay}];
    simE.analysisPoints = [];
    simE.nextChronoTime = 0;
    simE.ended = false;
    if (simE.displayMode === 'chrono' || simE.displayMode === 'both') {
        _pushChronoSnapE();
        simE.nextChronoTime = simE.deltaT;
    }
    computeTrajectoryBoundsE();
    computeGraphBoundsE();
}

function computeAccelerationE() {
    if (simE.armatureMode === 'perp-x') {
        var inField = (simE.x >= 0 && simE.x <= simE.e);
        simE.ax = inField ? (simE.q * simE.E) / simE.mass : 0;
        simE.ay = 0;
    } else {
        var inField2 = (simE.x >= 0 && simE.x <= simE.L && Math.abs(simE.y) < simE.e / 2);
        simE.ax = 0;
        simE.ay = inField2 ? (simE.q * simE.E) / simE.mass : 0;
    }
}

function stepPhysicsE(dt) {
    computeAccelerationE();
    simE.vx += simE.ax * dt;
    simE.vy += simE.ay * dt;
    simE.x  += simE.vx * dt;
    simE.y  += simE.vy * dt;
    simE.t  += dt;
}

function _pushChronoSnapE() {
    simE.chronoSnaps.push({
        x: simE.x, y: simE.y,
        vx: simE.vx, vy: simE.vy,
        ax: simE.ax, ay: simE.ay,
        t: simE.t
    });
}

function _hitsBoundaryE() {
    if (simE.armatureMode === 'parallel-x') {
        if (simE.x > 0 && simE.x <= simE.L && Math.abs(simE.y) >= simE.e / 2) return true;
        if (simE.x >= simE.xMax) return true;
    } else {
        if (simE.x < 0) return true;
        if (simE.x >= simE.xMax) return true;
    }
    return false;
}

var _nextGraphRecordE = 0;

function advanceSimE(dtReal) {
    if (simE.paused || simE.ended) return;
    var dtSim = dtReal * simE.speedFactor;
    var elapsed = 0;
    while (elapsed < dtSim) {
        var step = Math.min(PHYS_DT_E, dtSim - elapsed);
        stepPhysicsE(step);
        elapsed += step;
        var last = simE.trajPoints[simE.trajPoints.length - 1];
        if (Math.hypot(simE.x - last.x, simE.y - last.y) > 2e-4) {
            simE.trajPoints.push({x: simE.x, y: simE.y});
        }
        if (simE.t >= _nextGraphRecordE) {
            simE.graphData.push({t:simE.t, x:simE.x, y:simE.y,
                vx:simE.vx, vy:simE.vy, ax:simE.ax, ay:simE.ay});
            _nextGraphRecordE += PHYS_DT_E * 10;
        }
        if ((simE.displayMode === 'chrono' || simE.displayMode === 'both') &&
            simE.t >= simE.nextChronoTime) {
            _pushChronoSnapE();
            simE.nextChronoTime += simE.deltaT;
        }
        if (_hitsBoundaryE()) {
            simE.ended = true;
            simE.trajPoints.push({x: simE.x, y: simE.y});
            simE.graphData.push({t:simE.t, x:simE.x, y:simE.y,
                vx:simE.vx, vy:simE.vy, ax:0, ay:0});
            break;
        }
    }
}

function computeTrajectoryBoundsE() {
    var p = PARTICLES[simE.particleIdx];
    var halfE = simE.e / 2;

    if (simE.armatureMode === 'parallel-x') {
        /* Écran de détection fixe à 70 cm de l'origine */
        simE.xMax = 0.70;
        /* Simuler la déviation y au bout des plaques pour calibrer yMax */
        var alphaRad = simE.alpha * Math.PI / 180;
        var tx = 0, ty = 0;
        var tvx = simE.v0 * Math.cos(alphaRad);
        var tvy = simE.v0 * Math.sin(alphaRad);
        var dt = PHYS_DT_E * 20;
        var yExitMax = halfE;
        var maxT_est = 0;
        for (var i = 0; i < 300000; i++) {
            var inF = (tx >= 0 && tx <= simE.L && Math.abs(ty) < halfE);
            var ay_t = inF ? (p.q * simE.E) / p.m : 0;
            tvx += 0; tvy += ay_t * dt;
            tx  += tvx * dt; ty  += tvy * dt;
            maxT_est = (i + 1) * dt;
            if (tx <= simE.L && Math.abs(ty) > yExitMax) yExitMax = Math.abs(ty);
            if (tx > 0 && tx <= simE.L && Math.abs(ty) >= halfE) break;
            if (tx >= simE.xMax) { maxT_est = (i + 1) * dt; break; }
        }
        simE.yMax = Math.max(yExitMax * 1.6, halfE * 1.4, 0.005);
        simE.maxT = maxT_est;
    } else {
        /* Écran à e×3 — visible après les deux armatures */
        simE.xMax = simE.e * 3.0;
        /* Simuler la déviation dans la direction x */
        var alphaRad2 = simE.alpha * Math.PI / 180;
        var tx2 = 0, ty2 = 0;
        var tvx2 = simE.v0 * Math.cos(alphaRad2);
        var tvy2 = simE.v0 * Math.sin(alphaRad2);
        var dt2 = PHYS_DT_E * 20;
        var yMaxS = halfE;
        var maxT2 = 0;
        for (var j = 0; j < 300000; j++) {
            var inF2 = (tx2 >= 0 && tx2 <= simE.e);
            var ax_t2 = inF2 ? (p.q * simE.E) / p.m : 0;
            tvx2 += ax_t2 * dt2;
            tx2  += tvx2  * dt2; ty2  += tvy2  * dt2;
            maxT2 = (j + 1) * dt2;
            if (Math.abs(ty2) > yMaxS) yMaxS = Math.abs(ty2);
            if (tx2 < 0 || tx2 >= simE.xMax) break;
        }
        simE.yMax = Math.max(yMaxS * 1.6, halfE * 1.4, 0.005);
        simE.maxT = maxT2;
    }
    simE._ownMaxT = simE.maxT;
    simE._ownXMax = simE.xMax;
    simE._ownYMax = simE.yMax;
}

function computeGraphBoundsE() {
    var p = PARTICLES[simE.particleIdx];
    var alphaRad = simE.alpha * Math.PI / 180;
    var tx = 0, ty = 0;
    var tvx = simE.v0 * Math.cos(alphaRad);
    var tvy = simE.v0 * Math.sin(alphaRad);
    var halfE = simE.e / 2;
    var ax0 = simE.armatureMode === 'perp-x' ? (p.q * simE.E) / p.m : 0;
    var ay0 = simE.armatureMode === 'parallel-x' ? (p.q * simE.E) / p.m : 0;
    var b = {
        t:  { min: 0, max: 0 },
        x:  { min: 0, max: 0.001 },
        y:  { min: 0, max: 0.001 },
        vx: { min: tvx, max: tvx },
        vy: { min: tvy, max: tvy },
        ax: { min: ax0, max: ax0 },
        ay: { min: ay0, max: ay0 }
    };
    var dt = PHYS_DT_E * 20;
    for (var i = 0; i < 200000; i++) {
        var axt, ayt;
        if (simE.armatureMode === 'perp-x') {
            axt = (tx >= 0 && tx <= simE.e) ? (p.q * simE.E) / p.m : 0;
            ayt = 0;
        } else {
            axt = 0;
            ayt = (tx >= 0 && tx <= simE.L && Math.abs(ty) < halfE) ? (p.q * simE.E) / p.m : 0;
        }
        tvx += axt * dt; tvy += ayt * dt;
        tx  += tvx  * dt; ty  += tvy  * dt;
        var tt = (i + 1) * dt;
        if (tx  > b.x.max)  b.x.max  = tx;
        if (tx  < b.x.min)  b.x.min  = tx;
        if (ty  > b.y.max)  b.y.max  = ty;
        if (ty  < b.y.min)  b.y.min  = ty;
        if (tvx > b.vx.max) b.vx.max = tvx;
        if (tvx < b.vx.min) b.vx.min = tvx;
        if (tvy > b.vy.max) b.vy.max = tvy;
        if (tvy < b.vy.min) b.vy.min = tvy;
        if (axt > b.ax.max) b.ax.max = axt;
        if (axt < b.ax.min) b.ax.min = axt;
        if (ayt > b.ay.max) b.ay.max = ayt;
        if (ayt < b.ay.min) b.ay.min = ayt;
        b.t.max = tt;
        var stop = false;
        if (simE.armatureMode === 'parallel-x') {
            if (tx > 0 && tx <= simE.L && Math.abs(ty) >= halfE) stop = true;
            if (tx >= simE.xMax * 1.1) stop = true;
        } else {
            if (tx < 0) stop = true;
            if (tx >= simE.xMax * 1.1) stop = true;
        }
        if (stop) break;
    }
    if (b.x.min === b.x.max) { b.x.max += 0.001; }
    if (b.y.min === b.y.max) { b.y.min -= simE.e / 4; b.y.max += simE.e / 4; }
    if (b.ax.min === b.ax.max) { b.ax.min -= 1e12; b.ax.max += 1e12; }
    if (b.ay.min === b.ay.max) { b.ay.min -= 1e12; b.ay.max += 1e12; }
    simE.graphBounds = b;
    simE._ownGraphBounds = JSON.parse(JSON.stringify(b));
}
