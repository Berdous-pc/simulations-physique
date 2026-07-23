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
var SURF_VIEW_WIDTH_CM  = 45;   // largeur visible du bassin (calibre pxPerCm au resize)
var SURF_GRAPH_WINDOW   = 5;    // fenêtre temporelle du graphe y(t), en s
var SURF_GRID_FACTOR    = 4;    // sous-échantillonnage du champ (px CSS par cellule de grille) à zoom=1
var SURF_GRID_W_MAX     = 380;  // bornes DURES de la grille de calcul du champ (coût du rebuild et du
var SURF_GRID_H_MAX     = 250;  // dessin par frame ∝ largeur × hauteur de grille)
var SURF_GRID_CELLS_PER_LAMBDA = 5;
// Enveloppe géométrique d'une source ponctuelle réelle : sqrt(R0/(R0+r)), R0 = SURF_ENV_R0_LAMBDA·λ —
// vaut 1 tout contre la source (pas de singularité 1/√r à traiter) et tend vers la décroissance
// cylindrique physique 1/√r pour r ≫ R0. Même famille de formule que l'enveloppe géométrique de
// ondes/js/vagues.js (sqrt(R0/(R0+r)), R0 fixe en px là-bas ; ici R0 est exprimé en multiples de λ
// pour rester cohérent quel que soit le réglage de λ). Une source de Huygens isolée (cf.
// diffraction/js/surfaces.js), calibrée pour qu'une SOMME de ~100 d'entre elles reconstruise une onde
// incidente d'amplitude 1, a individuellement une amplitude quasi nulle — impropre à une VRAIE
// source ponctuelle unique, d'où ce modèle distinct.
var SURF_ENV_R0_LAMBDA = 2;

// ── Zoom (slider à crans) ────────────────────────────────────────────
var SURF_ZOOM_MIN  = 1;
var SURF_ZOOM_MAX  = 3;
var SURF_ZOOM_STAGES = 3; // nombre de crans du slider de zoom (×1 à ×3)

// Couleurs de l'onde (crêtes ↔ creux) — identiques à diffraction/js/surfaces.js
// pour une cohérence visuelle entre les pages du site.
var SURF_COL_CREST  = [200, 240, 255];
var SURF_COL_TROUGH = [0, 10, 55];
var SURF_COL_BG      = [100, 125, 155];

// Couleurs des zones d'interférences (hyperboles pointillées, cf. _drawSurfInterfZones)
var SURF_COL_INTERF_CONSTRUCTIVE = '#ffe14d'; // jaune
var SURF_COL_INTERF_DESTRUCTIVE  = '#8a3fd6'; // violet

// ── État global ───────────────────────────────────────────────────────
var simSurf = {

    // ── Contrôle de l'animation ─────────────────────────────────────
    paused  : false,
    simTime : 0,

    // ── Paramètres réglables ──────────────────────────────────────────
    lambda : 4,   // cm
    b      : 8,   // écartement des 2 sources (cm)

    // ── Géométrie canvas ─────────────────────────────────────────────
    canvasW     : 0,
    canvasH     : 0,
    pxPerCm     : 10,
    zoom        : SURF_ZOOM_MAX,
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

    // ── Zones d'interférences (trame de points), cf. toggleSurfInterfMode ──
    interfMode   : 'none',  // 'none' | 'constructive' | 'destructive' | 'both'

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
    simSurf.pxPerCm = w / (SURF_VIEW_WIDTH_CM * simSurf.zoom);

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

    var gw = Math.max(40, Math.min(SURF_GRID_W_MAX, Math.round(s.canvasW / SURF_GRID_FACTOR)));
    var gh = Math.max(30, Math.min(SURF_GRID_H_MAX, Math.round(s.canvasH / SURF_GRID_FACTOR)));
    var neededGw = Math.ceil(s.canvasW * SURF_GRID_CELLS_PER_LAMBDA / lambda_px);
    var neededGh = Math.ceil(s.canvasH * SURF_GRID_CELLS_PER_LAMBDA / lambda_px);
    if (neededGw > gw) gw = Math.min(SURF_GRID_W_MAX, neededGw);
    if (neededGh > gh) gh = Math.min(SURF_GRID_H_MAX, neededGh);

    var k     = 2 * Math.PI / lambda_px;
    var c_px  = SURF_C_CM * s.pxPerCm;
    var omega = 2 * Math.PI * c_px / lambda_px;
    var R0    = SURF_ENV_R0_LAMBDA * lambda_px;

    var r1arr = new Float32Array(gw * gh), r2arr = new Float32Array(gw * gh);
    var P1 = new Float32Array(gw * gh), Q1 = new Float32Array(gw * gh);
    var P2 = new Float32Array(gw * gh), Q2 = new Float32Array(gw * gh);

    for (var gy = 0; gy < gh; gy++) {
        var py = (gy + 0.5) / gh * s.canvasH;
        for (var gx = 0; gx < gw; gx++) {
            var idx = gy * gw + gx;
            var px = (gx + 0.5) / gw * s.canvasW;

            var dx1 = px - s.s1.x, dy1 = py - s.s1.y;
            var r1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
            var dx2 = px - s.s2.x, dy2 = py - s.s2.y;
            var r2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
            r1arr[idx] = r1; r2arr[idx] = r2;

            var pq1 = _surfPointSourcePQ(_surfSourceEnv(R0, r1), k, r1);
            P1[idx] = pq1.P; Q1[idx] = pq1.Q;
            var pq2 = _surfPointSourcePQ(_surfSourceEnv(R0, r2), k, r2);
            P2[idx] = pq2.P; Q2[idx] = pq2.Q;
        }
    }

    s.gridW = gw; s.gridH = gh;
    s.k = k; s.c_px = c_px; s.omega = omega;
    s.r1 = r1arr; s.r2 = r2arr;
    s.P1 = P1; s.Q1 = Q1; s.P2 = P2; s.Q2 = Q2;

    if (!s._offCanvas) s._offCanvas = document.createElement('canvas');
    s._offCanvas.width  = gw;
    s._offCanvas.height = gh;
    s._offCtx = s._offCanvas.getContext('2d');
    s._imgData = s._offCtx.createImageData(gw, gh);
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
    var front = c_px * t;

    var f = _surfSourcesAt(s, lambda_px, px, py);
    var cosWT = Math.cos(omega * t), sinWT = Math.sin(omega * t);
    var raw = 0;
    if (f.r1 <= front) raw += f.P1 * cosWT + f.Q1 * sinWT;
    if (f.r2 <= front) raw += f.P2 * cosWT + f.Q2 * sinWT;
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
    var front = c_px * t;

    var f = _surfSourcesAt(s, lambda_px, px, py);
    var P = 0, Q = 0;
    if (f.r1 <= front) { P += f.P1; Q += f.Q1; }
    if (f.r2 <= front) { P += f.P2; Q += f.Q2; }
    return Math.sqrt(P * P + Q * Q);
}

// ══════════════════════════════════════════════════════════════════════
//  Rendu principal du bassin (vue de dessus)
// ══════════════════════════════════════════════════════════════════════

function drawSurfaces() {
    var canvas = document.getElementById('surf-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    var s = simSurf;

    if (!s.P1 || s.gridW * s.gridH !== s.P1.length) {
        // Cache pas encore construit (premier affichage juste après un resize/tab-switch,
        // rebuild anti-rebond en attente) : fond uni le temps qu'il arrive.
        ctx.fillStyle = 'rgb(' + SURF_COL_BG.join(',') + ')';
        ctx.fillRect(0, 0, W, H);
        _drawSurfSources(ctx);
        if (s.showGraph) _drawSurfPoint(ctx);
        if (s.showGraph && _surfAmpYActive()) _drawSurfCutAxis(ctx, H);
        if (s.showGraph && _surfAmpXActive()) _drawSurfCutAxisH(ctx, W);
        return;
    }

    var t = s.simTime;
    var cosWT = Math.cos(s.omega * t), sinWT = Math.sin(s.omega * t);
    var front = s.c_px * t;

    var gw = s.gridW, gh = s.gridH;
    var img  = s._imgData;
    var data = img.data;

    for (var gy = 0; gy < gh; gy++) {
        for (var gx = 0; gx < gw; gx++) {
            var idx = gy * gw + gx;
            var r1 = s.r1[idx], r2 = s.r2[idx];
            var raw = 0;
            if (r1 <= front) raw += s.P1[idx] * cosWT + s.Q1[idx] * sinWT;
            if (r2 <= front) raw += s.P2[idx] * cosWT + s.Q2[idx] * sinWT;
            if (raw > 1) raw = 1; else if (raw < -1) raw = -1;
            var t01 = (raw + 1) * 0.5;
            var p = idx * 4;
            data[p]     = SURF_COL_TROUGH[0] + t01 * (SURF_COL_CREST[0] - SURF_COL_TROUGH[0]);
            data[p + 1] = SURF_COL_TROUGH[1] + t01 * (SURF_COL_CREST[1] - SURF_COL_TROUGH[1]);
            data[p + 2] = SURF_COL_TROUGH[2] + t01 * (SURF_COL_CREST[2] - SURF_COL_TROUGH[2]);
            data[p + 3] = 255;
        }
    }
    s._offCtx.putImageData(img, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.filter = 'blur(0.6px)';
    ctx.drawImage(s._offCanvas, 0, 0, gw, gh, 0, 0, W, H);
    ctx.filter = 'none';

    if (s.interfMode !== 'none') _drawSurfInterfZones(ctx, front);

    _drawSurfSources(ctx);
    if (s.showGraph) _drawSurfPoint(ctx);
    if (s.showGraph && _surfAmpYActive()) _drawSurfCutAxis(ctx, H);
    if (s.showGraph && _surfAmpXActive()) _drawSurfCutAxisH(ctx, W);
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

function _drawSurfInterfZones(ctx, front) {
    var s = simSurf;
    var lambda_px = s.lambda * s.pxPerCm;
    var b_px = s.b * s.pxPerCm;
    var c = b_px / 2;
    if (lambda_px <= 0 || c <= 0) return;

    var cx = s.canvasW / 2, cy = s.canvasH / 2;
    var wantC = s.interfMode === 'constructive' || s.interfMode === 'both';
    var wantD = s.interfMode === 'destructive'  || s.interfMode === 'both';

    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);

    if (wantC) {
        ctx.strokeStyle = SURF_COL_INTERF_CONSTRUCTIVE;
        ctx.beginPath();
        for (var n = 0; n * lambda_px < b_px - 1e-6; n++) {
            _surfAddInterfCurve(ctx, s, cx, cy, c, n * lambda_px, front);
        }
        ctx.stroke();
    }
    if (wantD) {
        ctx.strokeStyle = SURF_COL_INTERF_DESTRUCTIVE;
        ctx.beginPath();
        for (var m = 0; (m + 0.5) * lambda_px < b_px - 1e-6; m++) {
            _surfAddInterfCurve(ctx, s, cx, cy, c, (m + 0.5) * lambda_px, front);
        }
        ctx.stroke();
    }
    ctx.restore();
}

// Ajoute au chemin en cours la portion visible de l'hyperbole |r1-r2| = d (foyers en
// (cx∓c, cy)) — d = 0 dégénère en la droite médiatrice x = cx.
function _surfAddInterfCurve(ctx, s, cx, cy, c, d, front) {
    var a = d / 2;
    if (a < 1e-6) {
        _surfAddBisectorPoints(ctx, s, cx, cy, c, front);
        return;
    }
    if (a >= c) return; // pas d'hyperbole réelle (d ≥ b)
    var bh = Math.sqrt(c * c - a * a);
    _surfAddBranchPoints(ctx, s, cx, cy, a, bh, +1, front);
    _surfAddBranchPoints(ctx, s, cx, cy, a, bh, -1, front);
}

function _surfAddBisectorPoints(ctx, s, cx, cy, c, front) {
    var step = 3;
    var drawing = false;
    for (var y = 0; y <= s.canvasH; y += step) {
        var r = Math.sqrt(c * c + (y - cy) * (y - cy));
        if (r <= front) {
            if (!drawing) { ctx.moveTo(cx, y); drawing = true; }
            else ctx.lineTo(cx, y);
        } else {
            drawing = false;
        }
    }
}

// Paramétrage standard d'une branche d'hyperbole : x = cx + sign·a·cosh(u), y = cy + bh·sinh(u).
// uMax est borné par la première des deux dimensions du canvas atteinte (cosh/sinh sont
// monotones croissantes en |u| : une fois sortie du canvas sur un axe, la branche ne peut plus y
// revenir), pour ne pas gaspiller l'échantillonnage au-delà de la portion visible.
function _surfAddBranchPoints(ctx, s, cx, cy, a, bh, sign, front) {
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
            visible = (r1 <= front && r2 <= front);
        }
        if (visible) {
            if (!drawing) { ctx.moveTo(x, y); drawing = true; }
            else ctx.lineTo(x, y);
        } else {
            drawing = false;
        }
    }
}

// ── Sources S1/S2 ─────────────────────────────────────────────────────

function _drawSurfSources(ctx) {
    var s = simSurf;
    var pts = [[s.s1, 'S₁'], [s.s2, 'S₂']];
    ctx.save();
    for (var i = 0; i < pts.length; i++) {
        var pos = pts[i][0], label = pts[i][1];
        ctx.fillStyle = '#9b8264';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.font = 'bold 15px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#00000080';
        ctx.lineWidth = 3;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.strokeText(label, pos.x, pos.y - 9);
        ctx.fillText(label, pos.x, pos.y - 9);
    }
    ctx.restore();
}

// ── Point de mesure M (draggable) ────────────────────────────────────

function _drawSurfPoint(ctx) {
    var p = simSurf.point;
    ctx.save();
    ctx.strokeStyle = '#e07020';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#e07020';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#00000080';
    ctx.lineWidth = 3;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.strokeText('M', p.x, p.y - 14);
    ctx.fillText('M', p.x, p.y - 14);
    ctx.restore();
}

// ── Axe de coupe vertical draggable (graphe "Amplitude(y)") ───────────

var SURF_COL_CUT = '#d21f1f';

function _drawSurfCutAxis(ctx, H) {
    var x = simSurf.cut.x;
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

function _drawSurfCutAxisH(ctx, W) {
    var y = simSurf.cutH.y;
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
        simSurf.simTime += dt;
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
            ch.y = Math.max(0, Math.min(simSurf.canvasH, posH.y));
            ch.cmY = (ch.y - simSurf.canvasH / 2) / simSurf.pxPerCm;
            evt.preventDefault();
            return;
        }
        if (!simSurf.dragging) return;
        var pos = _surfPointerPos(canvas, evt);
        var p = simSurf.point;
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
//  Zoom (slider à SURF_ZOOM_STAGES crans) — même principe que
//  diffraction/js/surfaces.js.
// ══════════════════════════════════════════════════════════════════════

function _surfApplyZoom() {
    var s = simSurf;
    if (s.canvasW < 10) return;
    s.pxPerCm = s.canvasW / (SURF_VIEW_WIDTH_CM * s.zoom);
    updateSurfGeometry();
}

function onSliderZoomSurf(v) {
    var stage = parseInt(v, 10);
    simSurf.zoom = SURF_ZOOM_MAX + SURF_ZOOM_MIN - stage;
    var lbl = document.getElementById('lbl-zoom-surf');
    if (lbl) lbl.textContent = stage;
    _surfApplyZoom();
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

function resetSurfaces() {
    simSurf.paused  = false;
    simSurf.simTime = 0;
    simSurf.lambda  = 4;
    simSurf.b       = 8;
    simSurf.zoom    = SURF_ZOOM_MAX;
    simSurf.ptData  = [];
    simSurf.graphMode = 'single';
    simSurf.graphTab1 = 'amp-t';
    simSurf.graphTab2 = 'amp-y';
    simSurf.interfMode = 'none';
    _surfLastFrameT = null;

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

    var slZoom = document.getElementById('sl-zoom-surf');
    if (slZoom) slZoom.value = 1;
    var lblZoom = document.getElementById('lbl-zoom-surf');
    if (lblZoom) lblZoom.textContent = 1;

    _surfApplyZoom(); // recalcule pxPerCm (zoom remis à 1) + géométrie + programme le rebuild
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation — appelée depuis ui.js → init()
// ══════════════════════════════════════════════════════════════════════

function initSurfaces() {
    initSurfDrag();
    _syncSurfInterfBtn();
    syncSurfGraphUI();
}
