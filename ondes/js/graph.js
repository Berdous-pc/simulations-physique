// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  graph.js — Graphes ΔP(x) et ΔP(t) avec zoom / pan / réticule
//  Dépend de : sim.js
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Références canvas ─────────────────────────────────────────────────
var graphCanvas = null;
var graphCtx    = null;

// ── État de l'interaction souris ──────────────────────────────────────
var graphHoverPos  = null;   // {x, y} en coordonnées canvas

// ── Anti-rebond resize ─────────────────────────────────────────────────
var graphResizeRAF = false;

// ── Marges internes du graphe ──────────────────────────────────────────
var GM = { top: 14, right: 16, bottom: 60, left: 62 };

// ── Tailles de police dynamiques ───────────────────────────────────────
// Calculées depuis la hauteur disponible du canvas (H) et mises à jour
// au début de chaque appel _drawDpxGraph / _drawDptGraph.
// FONT_TICK  : graduations des axes (tick labels)
// FONT_TITLE : titres des axes (ex : "Temps (s)", "ΔP (u.a.)")
// FONT_HOVER : étiquette du hover snappé
var _gFontTick  = 14;
var _gFontTitle = 14;
var _gFontHover = 14;

// Met à jour les tailles de police dynamiques et les marges GM dépendantes.
// W = largeur effective du graphe (demi-largeur en mode both)
// H = hauteur totale du canvas (partagée entre les deux moitiés)
function _updateFontSizes(ctx, W, H, yMin, yMax) {
    // Taille tick : 3,5 % de la hauteur, bornes min/max selon usage
    _gFontTick  = Math.max(10, Math.min(18, Math.round(H * 0.038)));
    // Taille titre : nettement plus grand que le tick, pour bien identifier
    // les axes ("Distance (m)", "y (cm)"...) au premier coup d'œil.
    _gFontTitle = Math.max(14, Math.min(26, Math.round(H * 0.058)));
    // Taille hover : proche du tick
    _gFontHover = Math.max(10, Math.min(18, Math.round(H * 0.038)));

    // Marge haute : espace pour éviter que le premier tick Y soit rogné
    GM.top    = Math.max(10, Math.round(_gFontTick * 0.8));
    // Marge droite : fixe
    GM.right  = 16;
    // Marge basse : espace pour tick X + titre X
    GM.bottom = Math.max(28, Math.round(_gFontTick * 1.6 + _gFontTitle * 1.5 + 4));
}

// ══════════════════════════════════════════════════════════════════════
//  Cache du décor des graphes (fond, grille, cadre, titres d'axes)
// ══════════════════════════════════════════════════════════════════════
//  Tout ce décor est invariant tant que la géométrie et les échelles ne bougent
//  pas, alors qu'il concentre les opérations canvas les plus coûteuses (fillText,
//  et surtout measureText). Rendu une fois dans un canvas hors écran par onglet/
//  mode (slot), puis simplement recomposé par drawImage à chaque frame — seules
//  les courbes et les marqueurs, qui bougent, restent dessinés directement.
//  Partagé par les 3 onglets (Son, Corde, Vagues) : chacun garde son propre
//  objet `store` ({dpx:null, dpt:null} etc.) pour ne jamais mélanger les caches.
function _drawGraphChrome(store, slot, key, W, H, drawFn) {
    var c = store[slot];
    if (!c) c = store[slot] = { canvas: document.createElement('canvas'), key: null, w: 0, h: 0, dpr: 0 };

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

var _sonChrome   = { dpx: null, dpt: null };
var _cordeChrome = { yx: null, yt: null };

// Calcule GM.left de sorte que l'axe Y (x=0 du graphe) soit aligné
// avec la position de repos de la membrane dans la fenêtre.
// On utilise getBoundingClientRect pour comparer les positions viewport
// des deux canvas, indépendamment de la mise en page autour d'eux.
function _syncLeftMarginWithTube(ctx, W, yMin, yMax) {
    // + place pour le titre d'axe Y pivoté (cf. _yAxisTitleX), pour qu'il
    // ne se retrouve jamais collé au bord gauche du canvas, loin des chiffres.
    var minForLabels = _calcLeftMarginRaw(ctx, yMin, yMax) + _gFontTitle + 8;

    // En mode simultané, aucun alignement n'est possible : les deux graphes
    // n'occupent qu'une demi-largeur chacun, l'origine ne peut donc pas tomber
    // sous la membrane. On s'en tient au strict nécessaire pour les libellés,
    // sans quoi la marge de l'alignement serait conservée en pure perte — deux
    // fois, et sur des graphes deux fois plus étroits.
    if (sim.graphMode === 'both') {
        GM.left = minForLabels;
        return;
    }

    if (tubeCanvas && tubeCanvas.clientWidth > 0 && sim.tubeLeft > 0 && graphCanvas) {
        var tubeRect  = tubeCanvas.getBoundingClientRect();
        var graphRect = graphCanvas.getBoundingClientRect();

        // Position viewport de la membrane (bord gauche du tube dans le canvas tube)
        var memViewportX = tubeRect.left + (sim.tubeLeft / tubeCanvas.clientWidth) * tubeRect.width;

        // Distance depuis le bord gauche du canvas graphe
        var marginFromViewport = memViewportX - graphRect.left;

        // Convertir en coordonnées canvas (DPR éventuel)
        var marginCanvas = Math.round(marginFromViewport * (W / graphRect.width));

        GM.left = Math.max(minForLabels, marginCanvas);
    } else {
        GM.left = minForLabels;
    }
}

// Calcule la marge minimale pour afficher les labels Y (chiffres seulement)
// Utilise la taille de police dynamique courante (_gFontTick)
// Mémoïsé : fonction pure de (_gFontTick, yMin, yMax), mais appelée plusieurs
// fois par frame (dessin + hover + _yAxisTitleX) alors que measureText est
// l'une des opérations canvas les plus coûteuses.
var _lmCache = { key: '', val: 0 };

function _calcLeftMarginRaw(ctx, yMin, yMax) {
    var key = _gFontTick + '|' + yMin + '|' + yMax;
    if (_lmCache.key === key) return _lmCache.val;

    ctx.font = _gFontTick + 'px monospace';
    var wMin = ctx.measureText(_fmtLabel(yMin)).width;
    var wMax = ctx.measureText(_fmtLabel(yMax)).width;
    var val  = Math.round(Math.max(wMin, wMax) + 14);

    _lmCache.key = key;
    _lmCache.val = val;
    return val;
}

// Position X (translate) du titre d'axe Y pivoté, juste à gauche de la
// zone des chiffres — quelle que soit la valeur de GM.left (y compris
// quand elle est étendue pour aligner l'axe sur la membrane/le pot).
function _yAxisTitleX(ctx, GM, yMin, yMax) {
    var numbersZone = _calcLeftMarginRaw(ctx, yMin, yMax);
    return Math.max(4, GM.left - numbersZone - _gFontTitle - 4);
}

// ══════════════════════════════════════════════════════════════════════
//  resize
// ══════════════════════════════════════════════════════════════════════

function resizeGraph() {
    graphCanvas = graphCanvas || document.getElementById('graph-canvas');
    if (!graphCanvas) return;
    graphCtx = graphCtx || graphCanvas.getContext('2d');

    var wrap = document.getElementById('graph-canvas-wrap');
    var w    = wrap.clientWidth;
    var h    = wrap.clientHeight;
    if (w < 10 || h < 10) return;

    var dpr = window.devicePixelRatio || 1;
    graphCanvas.width  = Math.round(w * dpr);
    graphCanvas.height = Math.round(h * dpr);
    graphCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    _updateBothSepCSS(w);
}

// Met à jour la CSS variable --both-sep-x sur #graph-area pour que
// le pseudo-élément ::after de #graph-ctrl prolonge le séparateur canvas
function _updateBothSepCSS(canvasW) {
    var graphArea = document.getElementById('graph-area');
    if (!graphArea) return;
    var sep  = 3;
    var half = Math.floor((canvasW - sep) / 2);
    // La ligne CSS doit être positionnée par rapport à #graph-area.
    // Le canvas commence à x=0 dans #graph-canvas-wrap, lui-même dans #graph-area.
    // #graph-canvas-wrap et #graph-area ont la même largeur → half est correct.
    graphArea.style.setProperty('--both-sep-x', half + 'px');
    graphArea.style.setProperty('--both-sep-w', sep + 'px');
}

// ══════════════════════════════════════════════════════════════════════
//  Dessin du graphe — point d'entrée appelé à chaque frame
// ══════════════════════════════════════════════════════════════════════

function drawGraph() {
    graphCanvas = graphCanvas || document.getElementById('graph-canvas');
    if (!graphCanvas) return;
    graphCtx = graphCtx || graphCanvas.getContext('2d');

    var ctx = graphCtx;
    var W   = graphCanvas.clientWidth;
    var H   = graphCanvas.clientHeight;
    if (!W || !H) return;

    // Fond
    ctx.fillStyle = '#faf9f6';
    ctx.fillRect(0, 0, W, H);

    // ── Branchement selon le tab actif ────────────────────────────────
    var isCorde  = (typeof activeTab !== 'undefined' && activeTab === 'corde');
    var isVagues = (typeof activeTab !== 'undefined' && activeTab === 'vagues');

    if (isVagues) {
        drawGraphVagues(ctx, W, H);
        return;
    }

    if (isCorde) {
        // ── Mode corde ─────────────────────────────────────────────
        var mode = simCorde.graphMode;
        if (mode === 'both') {
            var sep   = 3;
            var half  = Math.floor((W - sep) / 2);

            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, half, H);
            ctx.clip();
            _drawYxGraph(ctx, half, H);
            ctx.restore();
            var leftGMCorde = GM.left;    // marge du panneau gauche (y(x)) — écrasée par le dessin suivant

            ctx.save();
            ctx.translate(half + sep, 0);
            ctx.beginPath();
            ctx.rect(0, 0, half, H);
            ctx.clip();
            _drawYtGraph(ctx, half, H);
            ctx.restore();
            var rightGMCorde = GM.left;   // marge du panneau droit (y(t))

            ctx.fillStyle = '#c8c0b4';
            ctx.fillRect(half, 0, sep, H);

            _drawBothLinksYt(ctx, W, H, half, sep);

            // ── Hover snappé en mode « both » : bascule selon la moitié survolée ──
            if (graphHoverPos && !simCorde.graphCursorMode) {
                var mxBC = graphHoverPos.x, myBC = graphHoverPos.y;
                if (mxBC < half) {
                    GM.left = leftGMCorde;
                    var pWlC = half - GM.left - GM.right, pHlC = H - GM.top - GM.bottom;
                    if (pWlC > 10 && pHlC > 10) {
                        ctx.save();
                        _drawSnappedHoverCorde_yx(ctx, half, H, mxBC, myBC, pWlC, pHlC);
                        ctx.restore();
                    }
                } else if (mxBC > half + sep) {
                    GM.left = rightGMCorde;
                    var pWrC = half - GM.left - GM.right, pHrC = H - GM.top - GM.bottom;
                    if (pWrC > 10 && pHrC > 10) {
                        ctx.save();
                        ctx.translate(half + sep, 0);
                        _drawSnappedHoverCorde_yt(ctx, half, H, mxBC - (half + sep), myBC, pWrC, pHrC);
                        ctx.restore();
                    }
                }
            }
            GM.left = rightGMCorde;   // laisse GM dans l'état attendu par le prochain rendu hors « both »

        } else if (mode === 'dpx') {
            _drawYxGraph(ctx, W, H);
        } else {
            _drawYtGraph(ctx, W, H);
        }

        if (mode !== 'both') {
            if (graphHoverPos && !simCorde.graphCursorMode) {
                _drawSnappedHoverCorde(ctx, W, H);
            }
            if (simCorde.graphCursorMode && graphHoverPos) {
                _drawCrosshairCorde(ctx, W, H);
            }
        }

    } else {
        // ── Mode son (comportement original) ──────────────────────
        if (sim.graphMode === 'both') {
            var sep   = 3;
            var half  = Math.floor((W - sep) / 2);

            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, half, H);
            ctx.clip();
            _drawDpxGraph(ctx, half, H);
            ctx.restore();
            var leftGMSon = GM.left;   // marge du panneau gauche (ΔP(x)) — écrasée par le dessin suivant

            ctx.save();
            ctx.translate(half + sep, 0);
            ctx.beginPath();
            ctx.rect(0, 0, half, H);
            ctx.clip();
            _drawDptGraph(ctx, half, H);
            ctx.restore();
            var rightGMSon = GM.left;   // marge du panneau droit (ΔP(t))

            ctx.fillStyle = '#c8c0b4';
            ctx.fillRect(half, 0, sep, H);

            _drawBothLinks(ctx, W, H, half, sep);

            // ── Hover snappé en mode « both » : bascule selon la moitié survolée ──
            if (graphHoverPos && !sim.graphCursorMode) {
                var mxBS = graphHoverPos.x, myBS = graphHoverPos.y;
                if (mxBS < half) {
                    GM.left = leftGMSon;
                    var pWlS = half - GM.left - GM.right, pHlS = H - GM.top - GM.bottom;
                    if (pWlS > 10 && pHlS > 10) {
                        ctx.save();
                        _drawSnappedHover_dpx(ctx, half, H, mxBS, myBS, pWlS, pHlS);
                        ctx.restore();
                    }
                } else if (mxBS > half + sep) {
                    GM.left = rightGMSon;
                    var pWrS = half - GM.left - GM.right, pHrS = H - GM.top - GM.bottom;
                    if (pWrS > 10 && pHrS > 10) {
                        ctx.save();
                        ctx.translate(half + sep, 0);
                        _drawSnappedHover_dpt(ctx, half, H, mxBS - (half + sep), myBS, pWrS, pHrS);
                        ctx.restore();
                    }
                }
            }
            GM.left = rightGMSon;   // laisse GM dans l'état attendu par le prochain rendu hors « both »

        } else if (sim.graphMode === 'dpx') {
            _drawDpxGraph(ctx, W, H);
        } else {
            _drawDptGraph(ctx, W, H);
        }

        if (sim.graphMode !== 'both') {
            if (graphHoverPos && !sim.graphCursorMode) {
                _drawSnappedHover(ctx, W, H);
            }
            if (sim.graphCursorMode && graphHoverPos) {
                _drawCrosshair(ctx, W, H);
            }
        }
    }

}

// ══════════════════════════════════════════════════════════════════════
//  Mode simultané — liaisons horizontales balise ↔ point temporel
//
//  Pour chaque balise active, on trace une ligne pointillée horizontale
//  à la hauteur canvas correspondant à la valeur ΔP instantanée de la
//  balise. Les deux graphes partagent les mêmes bornes Y et les mêmes
//  marges GM → py(dp) est identique dans les deux moitiés → ligne
//  parfaitement horizontale sur toute la largeur W du canvas.
//
//  En plus de la ligne, on dessine :
//   • un disque sur le point de la courbe ΔP(x) à la position de la balise
//   • un disque sur le front de la courbe ΔP(t) (point courant)
// ══════════════════════════════════════════════════════════════════════

function _drawBothLinks(ctx, W, H, half, sep) {
    if (sim.dptTimeOrigin === null) return;   // graphe ΔP(t) en attente d'activation (cf. _drawDptGraph)
    var yMin = -1.12;
    var yMax =  1.12;
    var pH   = H - GM.top - GM.bottom;
    if (pH <= 0) return;

    function py(dp) {
        return GM.top + (1 - (dp - yMin) / (yMax - yMin)) * pH;
    }

    var WINDOW  = 5;
    var elapsed = sim.simTime - sim.dptTimeOrigin;
    var tOrigin = Math.max(0, elapsed - WINDOW);   // plancher de la fenêtre glissante (temps écoulé)

    var beacons = [];
    if (sim.beacon1.active) beacons.push({ beacon: sim.beacon1, color: '#e07020' });
    if (sim.beacon2.active) beacons.push({ beacon: sim.beacon2, color: '#2a8a50' });

    for (var b = 0; b < beacons.length; b++) {
        var bc    = beacons[b];
        var color = bc.color;
        var xb    = bc.beacon.x - sim.tubeLeft;
        var dp    = waveDeltaP(xb, sim.simTime);
        var yc    = py(dp);

        // Bornes Y clampées à la zone de tracé
        if (yc < GM.top || yc > GM.top + pH) continue;

        // ── Point sur ΔP(x) : position X de la balise dans la moitié gauche ──
        var pW_left = half - GM.left - GM.right;
        if (pW_left <= 0) continue;
        var L    = sim.tubeLength > 0 ? sim.tubeLength : 1;
        var xDpx = GM.left + (xb / L) * pW_left;   // coordonnée X dans la moitié gauche

        // ── Point sur ΔP(t) : bord droit de la courbe = t_local actuel ──
        var tLocal   = elapsed - tOrigin;
        tLocal       = Math.max(0, Math.min(WINDOW, tLocal));
        var pW_right = half - GM.left - GM.right;
        var xDpt     = (half + sep) + GM.left + (tLocal / WINDOW) * pW_right;

        // ── Ligne pointillée horizontale sur toute la largeur ────────
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(xDpx, yc);
        ctx.lineTo(xDpt, yc);
        ctx.stroke();
        ctx.setLineDash([]);

        // ── Disque sur la courbe ΔP(x) ───────────────────────────────
        ctx.globalAlpha = 1.0;
        ctx.fillStyle   = color;
        ctx.beginPath();
        ctx.arc(xDpx, yc, 4, 0, Math.PI * 2);
        ctx.fill();

        // ── Disque sur le front de la courbe ΔP(t) ───────────────────
        ctx.beginPath();
        ctx.arc(xDpt, yc, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}


function _drawDpxGraph(ctx, W, H) {
    var L = sim.tubeLength;

    // Bornes X : toujours 0 → L (fixe)
    var xMin = 0;
    var xMax = L > 0 ? L : 1;

    // Bornes Y : fixées à [-1, +1] normalisé avec marge 12 %
    var yMin = -1.12;
    var yMax =  1.12;
    sim.graphDpxYMin = yMin;
    sim.graphDpxYMax = yMax;

    // ── Tailles de police et marges dynamiques ────────────────────────
    _updateFontSizes(ctx, W, H, yMin, yMax);

    // Marge gauche synchronisée avec la position de la membrane dans le tube
    _syncLeftMarginWithTube(ctx, W, yMin, yMax);

    var pW = W - GM.left - GM.right;
    var pH = H - GM.top  - GM.bottom;
    if (pW < 20 || pH < 20) return;

    // Fonctions de projection
    function px(x_data) { return GM.left + (x_data - xMin) / (xMax - xMin) * pW; }
    function py(y_data) { return GM.top  + (1 - (y_data - yMin) / (yMax - yMin)) * pH; }

    // ── Décor (mis en cache) ──────────────────────────────────────────
    var key = W + '|' + H + '|' + xMin + '|' + xMax + '|' + GM.left + '|' + L;
    var chrome = _drawGraphChrome(_sonChrome, 'dpx', key, W, H, function (cx) {
        cx.fillStyle = '#ffffff';
        cx.fillRect(GM.left, GM.top, pW, pH);
        _drawGridY(cx, yMin, yMax, px, py, pW, pH);
        _drawGridX_dpx(cx, xMin, xMax, px, py, pW, pH, L);
        _drawZeroLine(cx, yMin, yMax, px, py, pW);
        _drawAxisLabels_dpx(cx, W, H, GM, pW, pH, xMin, xMax, yMin, yMax, px, py, L);
    });
    ctx.drawImage(chrome, 0, 0, W, H);

    // ── Courbe ΔP(x) ────────────────────────────────────────────────
    // Points calculés une fois par frame par updateDpxData (résolution calée
    // sur l'écran, partagée avec le hover snappé) — ici seulement le tracé.
    var dx = sim.dpxX, dy = sim.dpxY, n = sim.dpxN | 0;
    if (dx && n > 1) {
        ctx.save();
        ctx.beginPath(); ctx.rect(GM.left, GM.top, pW, pH); ctx.clip();
        ctx.beginPath();
        ctx.moveTo(px(dx[0]), py(dy[0]));
        for (var i = 1; i < n; i++) {
            ctx.lineTo(px(dx[i]), py(dy[i]));
        }
        ctx.strokeStyle = '#2a6aaa';
        ctx.lineWidth   = 2;
        ctx.stroke();
        ctx.restore();
    }

    // ── Marqueurs de balises ──────────────────────────────────────────
    if (sim.beacon1.active) {
        var xb1 = sim.beacon1.x - sim.tubeLeft;
        _drawBeaconMarker(ctx, px(xb1), py, yMin, yMax, '#e07020', 'B1', pH, waveDeltaP(xb1, sim.simTime));
    }
    if (sim.beacon2.active) {
        var xb2 = sim.beacon2.x - sim.tubeLeft;
        _drawBeaconMarker(ctx, px(xb2), py, yMin, yMax, '#2a8a50', 'B2', pH, waveDeltaP(xb2, sim.simTime));
    }

    // Cadre tracé en dernier pour recouvrir les débordements de trait sur le bord
    ctx.strokeStyle = '#c8c0b4';
    ctx.lineWidth   = 1;
    ctx.strokeRect(GM.left, GM.top, pW, pH);
}

// ══════════════════════════════════════════════════════════════════════
//  Graphe ΔP(t) — séries temporelles aux balises
// ══════════════════════════════════════════════════════════════════════

function _drawDptGraph(ctx, W, H) {
    var d1 = _dptBuf(1);
    var d2 = _dptBuf(2);
    var beaconOn = sim.beacon1.active || sim.beacon2.active;
    var armed    = sim.dptTimeOrigin !== null;   // source déjà activée dans le mode courant

    if (!beaconOn) {
        // Message d'aide
        ctx.fillStyle = '#7a8a96';
        ctx.font      = 'italic ' + Math.round(W * 0.025 + 10) + 'px "Segoe UI", Arial, sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Activez une balise pour afficher le graphe', W / 2, H / 2);
        return;
    }

    // ── Fenêtre glissante de 5 s : l'axe (graduations comprises) avance en
    // continu avec le temps écoulé depuis la 1ère activation de la source
    // dans le mode courant — façon sismographe, sans coupure toutes les 5 s
    // (ancien comportement cyclique). Le temps est compté depuis
    // dptTimeOrigin (armé par _armDptWindowSon, remis en attente au
    // changement de mode/RAZ), pas depuis l'origine absolue de simTime :
    // sinon la fenêtre défilerait déjà avant même que la source ait émis
    // quoi que ce soit. La grille X n'est donc plus mise en cache : elle
    // dépend de xMin/xMax qui changent à chaque frame. Tant que la source
    // n'a pas encore été activée (armed === false), le graphe est préaffiché
    // avec sa fenêtre initiale figée à 0–5 s et une courbe plate à 0.
    var tNow    = sim.simTime;
    var origin  = armed ? sim.dptTimeOrigin : tNow;
    var elapsed = armed ? (tNow - origin) : 0;
    var xMin = Math.max(0, elapsed - 5);
    var xMax = xMin + 5;
    sim.graphView.xMin = xMin;   // mis à jour pour le réticule et le hover snappé
    sim.graphView.xMax = xMax;
    sim.graphView.tOrigin = origin;
    var yMin = -1.12;
    var yMax =  1.12;
    sim.graphView.yMin = yMin;
    sim.graphView.yMax = yMax;

    // ── Tailles de police et marges dynamiques ────────────────────────
    _updateFontSizes(ctx, W, H, yMin, yMax);

    // Marge gauche synchronisée avec la position de la membrane (même axe Y que ΔP(x))
    _syncLeftMarginWithTube(ctx, W, yMin, yMax);

    var pW = W - GM.left - GM.right;
    var pH = H - GM.top  - GM.bottom;
    if (pW < 20 || pH < 20) return;

    function px(x_data) { return GM.left + (x_data - xMin) / (xMax - xMin) * pW; }
    function py(y_data) { return GM.top  + (1 - (y_data - yMin) / (yMax - yMin)) * pH; }

    // ── Décor (mis en cache — indépendant de la fenêtre temporelle) ────
    var key = W + '|' + H + '|' + GM.left;
    var chrome = _drawGraphChrome(_sonChrome, 'dpt', key, W, H, function (cx) {
        cx.fillStyle = '#ffffff';
        cx.fillRect(GM.left, GM.top, pW, pH);
        _drawGridY(cx, yMin, yMax, px, py, pW, pH);
        _drawZeroLine(cx, yMin, yMax, px, py, pW);
        _drawAxisLabels_dpt(cx, W, H, GM, pW, pH, xMin, xMax, yMin, yMax, px, py);
    });
    ctx.drawImage(chrome, 0, 0, W, H);

    // ── Grille X (glissante, redessinée chaque frame) ──────────────────
    _drawGridX_dpt(ctx, xMin, xMax, px, py, pW, pH);

    // ── Tracé des séries ──────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(GM.left, GM.top, pW, pH);
    ctx.clip();

    if (armed) {
        // Point "vivant" en tête de courbe (cf. correctif équivalent sur Vagues) :
        // sans lui, la pointe n'avance qu'au rythme des échantillons enregistrés
        // (un pas sur deux), ce qui saute visiblement en ralenti.
        if (sim.beacon1.active && d1.n > 1)
            _drawSeries(ctx, d1, px, py, '#e07020', 2, xMin, xMax, origin, tNow, waveDeltaP(sim.beacon1.x - sim.tubeLeft, tNow));
        if (sim.beacon2.active && d2.n > 1)
            _drawSeries(ctx, d2, px, py, '#2a8a50', 2, xMin, xMax, origin, tNow, waveDeltaP(sim.beacon2.x - sim.tubeLeft, tNow));
    } else {
        // Source pas encore activée : courbe figée à 0 pour prévisualiser le graphe.
        if (sim.beacon1.active) _drawFlatZero(ctx, px, py, xMin, xMax, '#e07020');
        if (sim.beacon2.active) _drawFlatZero(ctx, px, py, xMin, xMax, '#2a8a50');
    }

    ctx.restore();

    // Bordure
    ctx.strokeStyle = '#c8c0b4';
    ctx.lineWidth   = 1;
    ctx.strokeRect(GM.left, GM.top, pW, pH);

    // Légende
    _drawLegend(ctx, W, pH);
}

// ── Courbe plate à 0 (préaffichage avant activation de la source) ──────
//  Utilisée par Son (ΔP(t)) et Corde (y(t)) : une balise déjà positionnée
//  montre ainsi tout de suite l'axe et une trace figée, sans attendre que
//  la source démarre.
function _drawFlatZero(ctx, px, py, xMin, xMax, color) {
    ctx.beginPath();
    ctx.moveTo(px(xMin), py(0));
    ctx.lineTo(px(xMax), py(0));
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.stroke();
}

// ── Tracé d'une série (tampon circulaire) dans la fenêtre visible ──────

function _drawSeries(ctx, buf, px, py, color, lw, xMin, xMax, origin, liveT, liveY) {
    ctx.beginPath();
    var started = false;
    for (var i = 0; i < buf.n; i++) {
        var j = _cbufIdx(buf, i);
        var t = buf.t[j] - origin;   // temps écoulé depuis le début de la salve
        if (t < xMin || t > xMax) { started = false; continue; }
        var cx = px(t);
        var cy = py(buf.y[j]);
        if (!started) { ctx.moveTo(cx, cy); started = true; }
        else          { ctx.lineTo(cx, cy); }
    }
    // Extension "vivante" jusqu'à l'instant présent : sans elle, la pointe
    // n'avance qu'au rythme des échantillons enregistrés.
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

// ── Légende (balise 1 et 2) ───────────────────────────────────────────

function _drawLegend(ctx, W, pH) {
    // Taille alignée sur les graduations, comme le reste du graphe : une
    // valeur en dur ne suivait pas la mise à l'échelle responsive du canvas.
    var fs = _gFontTick;
    var x  = GM.left + 8, y = GM.top + fs * 0.9;
    ctx.font         = 'bold ' + fs + 'px monospace';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    if (sim.beacon1.active) {
        ctx.fillStyle = '#e07020';
        ctx.fillRect(x, y - fs * 0.4, fs * 1.3, 3);
        ctx.fillText('Balise 1', x + fs * 1.3 + 5, y);
        y += fs + 6;
    }
    if (sim.beacon2.active) {
        ctx.fillStyle = '#2a8a50';
        ctx.fillRect(x, y - fs * 0.4, fs * 1.3, 3);
        ctx.fillText('Balise 2', x + fs * 1.3 + 5, y);
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Hover snappé — point le plus proche + étiquette
//  Actif quand le réticule libre est désactivé (graphHoverPos.free === false)
// ══════════════════════════════════════════════════════════════════════

function _drawSnappedHover(ctx, W, H) {
    if (!graphHoverPos) return;
    var mx = graphHoverPos.x;
    var my = graphHoverPos.y;
    var pW = W - GM.left - GM.right;
    var pH = H - GM.top  - GM.bottom;
    if (pW < 10 || pH < 10) return;

    ctx.save();

    if (sim.graphMode === 'dpt') {
        _drawSnappedHover_dpt(ctx, W, H, mx, my, pW, pH);
    } else {
        _drawSnappedHover_dpx(ctx, W, H, mx, my, pW, pH);
    }

    ctx.restore();
}

// ── Hover snappé pour ΔP(t) ───────────────────────────────────────────

function _drawSnappedHover_dpt(ctx, W, H, mx, my, pW, pH) {
    var xMin   = sim.graphView.xMin;
    var xMax   = sim.graphView.xMax;
    var yMin   = sim.graphView.yMin;
    var yMax   = sim.graphView.yMax;
    var origin = sim.graphView.tOrigin || 0;

    function px(v) { return GM.left + (v - xMin) / (xMax - xMin) * pW; }
    function py(v) { return GM.top  + (1 - (v - yMin) / (yMax - yMin)) * pH; }

    // Temps écoulé correspondant à la position X du curseur (xMin/xMax
    // déjà en temps écoulé depuis dptTimeOrigin, cf. _drawDptGraph)
    var tCursor = xMin + (mx - GM.left) / pW * (xMax - xMin);

    // Candidats pour chaque série active
    var series = [];
    if (sim.beacon1.active && _dptBuf(1).n > 1)
        series.push({ buf: _dptBuf(1), color: '#e07020' });
    if (sim.beacon2.active && _dptBuf(2).n > 1)
        series.push({ buf: _dptBuf(2), color: '#2a8a50' });

    // Chercher le meilleur point toutes séries confondues (distance euclidienne canvas)
    var winner = null, winnerColor = null, winnerDist = Infinity;

    for (var s = 0; s < series.length; s++) {
        var buf = series[s].buf;
        for (var i = 0; i < buf.n; i++) {
            var j = _cbufIdx(buf, i);
            var t = buf.t[j] - origin;
            if (t < xMin || t > xMax) continue;
            var dpVal = buf.y[j];
            var bx  = px(t);
            var by  = py(dpVal);
            var byc = Math.max(GM.top, Math.min(GM.top + pH, by));
            var dist = (bx - mx) * (bx - mx) + (byc - my) * (byc - my);
            if (dist < winnerDist) { winnerDist = dist; winner = { t: t, dp: dpVal }; winnerColor = series[s].color; }
        }
    }
    if (!winner) return;

    var bx  = px(winner.t);
    var by  = py(winner.dp);
    var byc = Math.max(GM.top, Math.min(GM.top + pH, by));

    // Lignes tiretées vers les axes
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(60,60,60,0.45)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(bx, GM.top + pH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(GM.left, byc);    ctx.stroke();
    ctx.setLineDash([]);

    // Disque sur la courbe
    ctx.fillStyle = winnerColor;
    ctx.beginPath();
    ctx.arc(bx, byc, 5, 0, Math.PI * 2);
    ctx.fill();

    // Étiquette
    var tLbl  = fmtFR(winner.t, 2) + ' s';
    var vLbl  = 'ΔP = ' + fmtFR(winner.dp, 3);
    var label = '(' + tLbl + ', ' + vLbl + ')';
    ctx.font         = _gFontHover + 'px monospace';
    ctx.fillStyle    = winnerColor;
    ctx.textBaseline = 'bottom';
    ctx.textAlign    = 'left';
    var lw2 = ctx.measureText(label).width;
    var lx  = (bx + 10 + lw2 > GM.left + pW) ? bx - 10 - lw2 : bx + 10;
    var ly  = (byc - 8 < GM.top + 28)         ? byc + 32       : byc - 8;
    ctx.fillText(label, lx, ly);
}

// ── Hover snappé pour ΔP(x) ───────────────────────────────────────────

function _drawSnappedHover_dpx(ctx, W, H, mx, my, pW, pH) {
    var dx = sim.dpxX, dy = sim.dpxY, dn = sim.dpxN | 0;
    if (!dx || dn < 2) return;

    var L    = sim.tubeLength;
    var xMin = 0;
    var xMax = L > 0 ? L : 1;
    var yMin = sim.graphDpxYMin;
    var yMax = sim.graphDpxYMax;

    function px(v) { return GM.left + (v - xMin) / (xMax - xMin) * pW; }
    function py(v) { return GM.top  + (1 - (v - yMin) / (yMax - yMin)) * pH; }

    var bestI = -1, bestDist = Infinity;
    for (var i = 0; i < dn; i++) {
        var bx_  = px(dx[i]);
        var by_  = py(dy[i]);
        var byc_ = Math.max(GM.top, Math.min(GM.top + pH, by_));
        var d = (bx_ - mx) * (bx_ - mx) + (byc_ - my) * (byc_ - my);
        if (d < bestDist) { bestDist = d; bestI = i; }
    }
    if (bestI < 0) return;
    var bestX = dx[bestI], bestDp = dy[bestI];

    var bx  = px(bestX);
    var by  = py(bestDp);
    var byc = Math.max(GM.top, Math.min(GM.top + pH, by));

    // Lignes tiretées vers les axes
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(60,60,60,0.45)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(bx, GM.top + pH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(GM.left, byc);    ctx.stroke();
    ctx.setLineDash([]);

    // Disque sur la courbe
    ctx.fillStyle = '#2a6aaa';
    ctx.beginPath();
    ctx.arc(bx, byc, 5, 0, Math.PI * 2);
    ctx.fill();

    // Étiquette : distance en cm
    var cmPerPx = (L > 0) ? 40 / L : 1;
    var dCm     = fmtFR(bestX * cmPerPx, 1);
    var label   = '(' + dCm + ' cm, ΔP = ' + fmtFR(bestDp, 3) + ')';
    ctx.font         = _gFontHover + 'px monospace';
    ctx.fillStyle    = '#2a6aaa';
    ctx.textBaseline = 'bottom';
    ctx.textAlign    = 'left';
    var lw2 = ctx.measureText(label).width;
    var lx  = (bx + 10 + lw2 > GM.left + pW) ? bx - 10 - lw2 : bx + 10;
    var ly  = (byc - 8 < GM.top + 28)         ? byc + 32       : byc - 8;
    ctx.fillText(label, lx, ly);
}

// ══════════════════════════════════════════════════════════════════════
//  Utilitaires de dessin communs
// ══════════════════════════════════════════════════════════════════════

// Formate un label numérique (2 chiffres significatifs)
function _fmtLabel(v) {
    if (v === 0) return '0';
    var av = Math.abs(v);
    if (av >= 100)  return fmtFR(v, 0);
    if (av >= 10)   return fmtFR(v, 1);
    if (av >= 1)    return fmtFR(v, 2);
    return fmtFR(v, 3);
}

// Pas "joli" pour les graduations
function _niceStep(range, targetTicks) {
    var rough = range / targetTicks;
    var mag   = Math.pow(10, Math.floor(Math.log10(rough)));
    var mant  = rough / mag;
    if (mant < 1.5) return mag;
    if (mant < 3.5) return 2 * mag;
    if (mant < 7.5) return 5 * mag;
    return 10 * mag;
}

// Grille et labels Y
function _drawGridY(ctx, yMin, yMax, px, py, pW, pH) {
    var step  = _niceStep(yMax - yMin, 5);
    var start = Math.ceil(yMin / step) * step;

    ctx.font         = _gFontTick + 'px monospace';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';

    for (var v = start; v <= yMax + step * 0.01; v += step) {
        var yc = py(v);
        if (yc < GM.top - 2 || yc > GM.top + pH + 2) continue;

        ctx.strokeStyle = v === 0 ? 'rgba(44,62,80,0.20)' : 'rgba(200,192,180,0.55)';
        ctx.lineWidth   = v === 0 ? 1.2 : 0.8;
        ctx.beginPath();
        ctx.moveTo(GM.left, yc);
        ctx.lineTo(GM.left + pW, yc);
        ctx.stroke();

        ctx.fillStyle = '#7a8a96';
        ctx.fillText(_fmtLabel(v), GM.left - 5, yc);
    }
}

// Grille X pour ΔP(x) / y(x) : distance en unité physique (cm par défaut,
// utilisé par le tube ; la corde passe xMaxUnit=CORDE_LENGTH_M, unit='m').
function _drawGridX_dpx(ctx, xMin, xMax, px, py, pW, pH, L, xMaxUnit, unit) {
    xMaxUnit = (xMaxUnit !== undefined) ? xMaxUnit : 40;
    unit     = unit || 'cm';
    var unitPerPx = (L > 0) ? xMaxUnit / L : 1;
    var step      = _niceStep(xMaxUnit, 6);
    var start     = Math.ceil(0 / step) * step;
    var decimals  = step < 1 ? 1 : 0;

    ctx.font         = _gFontTick + 'px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    for (var u = start; u <= xMaxUnit + step * 0.01; u += step) {
        var xData = u / unitPerPx;   // px dans les données
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

// Grille X pour ΔP(t) : temps en secondes
function _drawGridX_dpt(ctx, xMin, xMax, px, py, pW, pH) {
    var step  = _niceStep(xMax - xMin, 6);
    var start = Math.ceil(xMin / step) * step;

    ctx.font         = _gFontTick + 'px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    for (var t = start; t <= xMax + step * 0.01; t += step) {
        var xc = px(t);
        if (xc < GM.left - 2 || xc > GM.left + pW + 2) continue;

        ctx.strokeStyle = 'rgba(200,192,180,0.55)';
        ctx.lineWidth   = 0.8;
        ctx.beginPath();
        ctx.moveTo(xc, GM.top);
        ctx.lineTo(xc, GM.top + pH);
        ctx.stroke();

        ctx.fillStyle = '#7a8a96';
        ctx.fillText(_fmtLabel(t), xc, GM.top + pH + 4);
    }
}

// Ligne zéro
function _drawZeroLine(ctx, yMin, yMax, px, py, pW) {
    if (0 < yMin || 0 > yMax) return;
    var yc = py(0);
    ctx.save();
    ctx.strokeStyle = 'rgba(44,62,80,0.30)';
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    ctx.moveTo(GM.left, yc);
    ctx.lineTo(GM.left + pW, yc);
    ctx.stroke();
    ctx.restore();
}

// Marqueur de balise sur le graphe ΔP(x)
// yVal (optionnel) : valeur courante de la courbe à l'abscisse de la balise.
// Fournie → une pastille est dessinée sur la courbe, quel que soit le mode
// d'affichage (le mode simultané ajoute en plus la liaison vers le graphe
// temporel, cf. _drawBothLinks*).
function _drawBeaconMarker(ctx, xc, py, yMin, yMax, color, label, pH, yVal) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(xc, GM.top);
    ctx.lineTo(xc, GM.top + pH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle    = color;
    ctx.globalAlpha  = 0.9;
    ctx.font         = 'bold 11px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, xc, GM.top + 2);

    // Pastille sur la courbe
    if (typeof yVal === 'number' && isFinite(yVal)) {
        var yc = py(yVal);
        if (yc >= GM.top && yc <= GM.top + pH) {
            ctx.globalAlpha = 1.0;
            ctx.beginPath();
            ctx.arc(xc, yc, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

// Labels des axes pour ΔP(x)
function _drawAxisLabels_dpx(ctx, W, H, GM, pW, pH, xMin, xMax, yMin, yMax, px, py, L) {
    ctx.fillStyle    = '#5a6a78';
    ctx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';

    // Titre X : version courte si le canvas est trop étroit pour le texte long
    var labelX = pW < 260 ? 'Distance (cm)' : 'Distance depuis la membrane (cm)';
    ctx.fillText(labelX, GM.left + pW / 2, H - 2);

    // Label axe Y (vertical)
    ctx.save();
    ctx.translate(_yAxisTitleX(ctx, GM, yMin, yMax), GM.top + pH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('ΔP (u.a.)', 0, 0);
    ctx.restore();
}

// Labels des axes pour ΔP(t)
function _drawAxisLabels_dpt(ctx, W, H, GM, pW, pH, xMin, xMax, yMin, yMax, px, py) {
    ctx.fillStyle    = '#5a6a78';
    ctx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Temps (s)', GM.left + pW / 2, H - 2);

    ctx.save();
    ctx.translate(_yAxisTitleX(ctx, GM, yMin, yMax), GM.top + pH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('ΔP (u.a.)', 0, 0);
    ctx.restore();
}

// Réticule
function _drawCrosshair(ctx, W, H) {
    if (!graphHoverPos) return;
    var mx = graphHoverPos.x;
    var my = graphHoverPos.y;
    var pW = W - GM.left - GM.right;
    var pH = H - GM.top  - GM.bottom;

    ctx.save();
    ctx.strokeStyle = '#2a6aaa';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 3]);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(mx, GM.top);
    ctx.lineTo(mx, GM.top + pH);
    ctx.moveTo(GM.left, my);
    ctx.lineTo(GM.left + pW, my);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Tooltip coordonnées
    var xVal, yVal;
    if (pW > 0 && pH > 0) {
        if (sim.graphMode === 'dpx') {
            var xData = (mx - GM.left) / pW * sim.tubeLength;
            var cmPerPx = sim.tubeLength > 0 ? 40 / sim.tubeLength : 1;
            xVal = fmtFR(xData * cmPerPx, 1) + ' cm';
        } else {
            var tData = sim.graphView.xMin +
                (mx - GM.left) / pW * (sim.graphView.xMax - sim.graphView.xMin);
            xVal = fmtFR(tData, 2) + ' s';
        }
        var yRange = sim.graphMode === 'dpx'
            ? (sim.graphDpxYMax - sim.graphDpxYMin)
            : (sim.graphView.yMax - sim.graphView.yMin);
        var yMin   = sim.graphMode === 'dpx' ? sim.graphDpxYMin : sim.graphView.yMin;
        yVal = fmtFR(yMin + (1 - (my - GM.top) / pH) * yRange, 3);
    }

    var tip = document.getElementById('graph-hover-tooltip');
    if (tip && xVal !== undefined) {
        tip.textContent = xVal + '  |  ΔP = ' + yVal;
        tip.style.display = 'block';
        // Coordonnées viewport (tooltip en position:fixed)
        var gRect  = graphCanvas.getBoundingClientRect();
        var scaleX = graphCanvas.clientWidth  / gRect.width;
        var scaleY = graphCanvas.clientHeight / gRect.height;
        var vpX    = gRect.left + mx / scaleX;
        var vpY    = gRect.top  + my / scaleY;
        var offX   = vpX + 12;
        var offY   = vpY - 10;
        if (offX + 190 > window.innerWidth) offX = vpX - 190;
        if (offY < 4) offY = vpY + 14;
        tip.style.left = offX + 'px';
        tip.style.top  = offY + 'px';
    }
}

// ══════════════════════════════════════════════════════════════════════
//  ██████╗ ██████╗ ██████╗ ██████╗ ███████╗
//  Graphes — mode CORDE  (y(x) et y(t))
// ══════════════════════════════════════════════════════════════════════

// ── Graphe y(x) ───────────────────────────────────────────────────────
//  Analogue à _drawDpxGraph mais :
//    • données : simCorde.yxX/yxY (Float32Array), via updateYxData
//    • axe Y : y (cm), valeur physique réelle, bornes ±cordeYAxisCm()
//    • axe X : Distance depuis le pot (m), 0–CORDE_LENGTH_M

function _drawYxGraph(ctx, W, H) {
    var L      = simCorde.cordeLength;
    var xMin   = 0;
    var xMax   = L > 0 ? L : 1;
    var yMin   = -cordeYAxisCm();
    var yMax   =  cordeYAxisCm();
    simCorde.graphYxYMin = yMin;
    simCorde.graphYxYMax = yMax;

    _updateFontSizes(ctx, W, H, yMin, yMax);
    _syncLeftMarginWithCorde(ctx, W, yMin, yMax);

    var pW = W - GM.left - GM.right;
    var pH = H - GM.top  - GM.bottom;
    if (pW < 20 || pH < 20) return;

    function px(x_data) { return GM.left + (x_data - xMin) / (xMax - xMin) * pW; }
    function py(y_data) { return GM.top  + (1 - (y_data - yMin) / (yMax - yMin)) * pH; }

    // ── Décor (mis en cache) ──────────────────────────────────────────
    var key = W + '|' + H + '|' + yMin + '|' + yMax + '|' + GM.left + '|' + L;
    var chrome = _drawGraphChrome(_cordeChrome, 'yx', key, W, H, function (cx) {
        cx.fillStyle = '#ffffff';
        cx.fillRect(GM.left, GM.top, pW, pH);
        _drawGridY(cx, yMin, yMax, px, py, pW, pH);
        _drawGridX_dpx(cx, xMin, xMax, px, py, pW, pH, L, CORDE_LENGTH_M, 'm');
        _drawZeroLine(cx, yMin, yMax, px, py, pW);
        _drawAxisLabels_yx(cx, W, H, GM, pW, pH, yMin, yMax);
    });
    ctx.drawImage(chrome, 0, 0, W, H);

    // ── Courbe y(x) ───────────────────────────────────────────────────
    // Points calculés une fois par frame par updateYxData (résolution calée
    // sur l'écran, partagée avec le hover snappé) — ici seulement le tracé.
    // yxY est déjà en cm (valeur physique) — aucune conversion ici.
    var dx = simCorde.yxX, dy = simCorde.yxY, n = simCorde.yxN | 0;
    if (dx && n > 1) {
        ctx.save();
        ctx.beginPath(); ctx.rect(GM.left, GM.top, pW, pH); ctx.clip();
        ctx.beginPath();
        ctx.moveTo(px(dx[0]), py(dy[0]));
        for (var i = 1; i < n; i++) {
            ctx.lineTo(px(dx[i]), py(dy[i]));
        }
        ctx.strokeStyle = '#7a2510';
        ctx.lineWidth   = 2;
        ctx.stroke();
        ctx.restore();
    }

    // Marqueurs de balises
    if (simCorde.beacon1.active) {
        var xb1 = simCorde.beacon1.x - simCorde.cordeLeft;
        _drawBeaconMarker(ctx, px(xb1), py, yMin, yMax, '#e07020', 'B1', pH, cordeDisplacement(xb1, simCorde.simTime));
    }
    if (simCorde.beacon2.active) {
        var xb2 = simCorde.beacon2.x - simCorde.cordeLeft;
        _drawBeaconMarker(ctx, px(xb2), py, yMin, yMax, '#2a8a50', 'B2', pH, cordeDisplacement(xb2, simCorde.simTime));
    }

    // Cadre tracé en dernier pour recouvrir les débordements de trait sur le bord
    ctx.strokeStyle = '#c8c0b4';
    ctx.lineWidth   = 1;
    ctx.strokeRect(GM.left, GM.top, pW, pH);
}

// ── Graphe y(t) ───────────────────────────────────────────────────────

function _drawYtGraph(ctx, W, H) {
    var d1 = _ytBufCorde(1);
    var d2 = _ytBufCorde(2);
    var beaconOn = simCorde.beacon1.active || simCorde.beacon2.active;
    var armed    = simCorde.ytTimeOrigin !== null;   // source déjà activée dans le mode courant

    if (!beaconOn) {
        ctx.fillStyle = '#7a8a96';
        ctx.font      = 'italic ' + Math.round(W * 0.025 + 10) + 'px "Segoe UI", Arial, sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Activez une balise pour afficher le graphe', W / 2, H / 2);
        return;
    }

    // ── Fenêtre glissante de 5 s : l'axe (graduations comprises) avance en
    // continu avec le temps écoulé depuis la 1ère activation de la source
    // dans le mode courant (ytTimeOrigin, armé par _armYtWindowCorde, remis
    // en attente au changement de mode/RAZ) — sinon elle défilerait déjà
    // avant même que la source ait émis quoi que ce soit. Tant qu'elle n'a
    // pas encore été activée (armed === false), le graphe est préaffiché
    // avec sa fenêtre initiale figée à 0–5 s et une courbe plate à 0.
    var tNow    = simCorde.simTime;
    var origin  = armed ? simCorde.ytTimeOrigin : tNow;
    var elapsed = armed ? (tNow - origin) : 0;
    var xMin = Math.max(0, elapsed - 5);
    var xMax = xMin + 5;
    simCorde.graphView.xMin = xMin;
    simCorde.graphView.xMax = xMax;
    simCorde.graphView.tOrigin = origin;
    var yMin  = -cordeYAxisCm();
    var yMax  =  cordeYAxisCm();
    simCorde.graphView.yMin = yMin;
    simCorde.graphView.yMax = yMax;

    _updateFontSizes(ctx, W, H, yMin, yMax);
    _syncLeftMarginWithCorde(ctx, W, yMin, yMax);

    var pW = W - GM.left - GM.right;
    var pH = H - GM.top  - GM.bottom;
    if (pW < 20 || pH < 20) return;

    function px(x_data) { return GM.left + (x_data - xMin) / (xMax - xMin) * pW; }
    function py(y_data) { return GM.top  + (1 - (y_data - yMin) / (yMax - yMin)) * pH; }

    // ── Décor (mis en cache — indépendant de la fenêtre temporelle) ────
    var key = W + '|' + H + '|' + yMin + '|' + yMax + '|' + GM.left;
    var chrome = _drawGraphChrome(_cordeChrome, 'yt', key, W, H, function (cx) {
        cx.fillStyle = '#ffffff';
        cx.fillRect(GM.left, GM.top, pW, pH);
        _drawGridY(cx, yMin, yMax, px, py, pW, pH);
        _drawZeroLine(cx, yMin, yMax, px, py, pW);
        _drawAxisLabels_yt(cx, W, H, GM, pW, pH, yMin, yMax);
    });
    ctx.drawImage(chrome, 0, 0, W, H);

    // ── Grille X (glissante, redessinée chaque frame) ──────────────────
    _drawGridX_dpt(ctx, xMin, xMax, px, py, pW, pH);

    // Clip
    ctx.save();
    ctx.beginPath();
    ctx.rect(GM.left, GM.top, pW, pH);
    ctx.clip();

    if (armed) {
        // Point "vivant" en tête de courbe (cf. correctif équivalent sur Vagues/Son) :
        // sans lui, la pointe n'avance qu'au rythme des échantillons enregistrés,
        // ce qui saute visiblement en ralenti.
        if (simCorde.beacon1.active && d1.n > 1)
            _drawSeriesCorde(ctx, d1, px, py, '#e07020', 2, xMin, xMax, origin, tNow, cordeDisplacement(simCorde.beacon1.x - simCorde.cordeLeft, tNow));
        if (simCorde.beacon2.active && d2.n > 1)
            _drawSeriesCorde(ctx, d2, px, py, '#2a8a50', 2, xMin, xMax, origin, tNow, cordeDisplacement(simCorde.beacon2.x - simCorde.cordeLeft, tNow));
    } else {
        // Source pas encore activée : courbe figée à 0 pour prévisualiser le graphe.
        if (simCorde.beacon1.active) _drawFlatZero(ctx, px, py, xMin, xMax, '#e07020');
        if (simCorde.beacon2.active) _drawFlatZero(ctx, px, py, xMin, xMax, '#2a8a50');
    }

    ctx.restore();

    ctx.strokeStyle = '#c8c0b4';
    ctx.lineWidth   = 1;
    ctx.strokeRect(GM.left, GM.top, pW, pH);

    _drawLegendCorde(ctx, W, pH);
}

// ── Tracé d'une série y(t) (tampon circulaire) ─────────────────────────

function _drawSeriesCorde(ctx, buf, px, py, color, lw, xMin, xMax, origin, liveT, liveY) {
    ctx.beginPath();
    var started = false;
    for (var i = 0; i < buf.n; i++) {
        var j = _cbufIdx(buf, i);
        var t = buf.t[j] - origin;   // temps écoulé depuis le début de la salve
        if (t < xMin || t > xMax) { started = false; continue; }
        var cx = px(t);
        var cy = py(buf.y[j]);   // tampon déjà en cm
        if (!started) { ctx.moveTo(cx, cy); started = true; }
        else          { ctx.lineTo(cx, cy); }
    }
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

// ── Légende y(t) ──────────────────────────────────────────────────────

function _drawLegendCorde(ctx, W, pH) {
    // Taille alignée sur les graduations, comme le reste du graphe.
    var fs = _gFontTick;
    var x  = GM.left + 8, y = GM.top + fs * 0.9;
    ctx.font         = 'bold ' + fs + 'px monospace';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    if (simCorde.beacon1.active) {
        ctx.fillStyle = '#e07020';
        ctx.fillRect(x, y - fs * 0.4, fs * 1.3, 3);
        ctx.fillText('Balise 1', x + fs * 1.3 + 5, y);
        y += fs + 6;
    }
    if (simCorde.beacon2.active) {
        ctx.fillStyle = '#2a8a50';
        ctx.fillRect(x, y - fs * 0.4, fs * 1.3, 3);
        ctx.fillText('Balise 2', x + fs * 1.3 + 5, y);
    }
}

// ── Labels axes y(x) ──────────────────────────────────────────────────

function _drawAxisLabels_yx(ctx, W, H, GM, pW, pH, yMin, yMax) {
    ctx.fillStyle    = '#5a6a78';
    ctx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    var labelX = pW < 260 ? 'Distance (m)' : 'Distance depuis le pot (m)';
    ctx.fillText(labelX, GM.left + pW / 2, H - 2);
    ctx.save();
    ctx.translate(_yAxisTitleX(ctx, GM, yMin, yMax), GM.top + pH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('y (cm)', 0, 0);
    ctx.restore();
}

// ── Labels axes y(t) ──────────────────────────────────────────────────

function _drawAxisLabels_yt(ctx, W, H, GM, pW, pH, yMin, yMax) {
    ctx.fillStyle    = '#5a6a78';
    ctx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Temps (s)', GM.left + pW / 2, H - 2);
    ctx.save();
    ctx.translate(_yAxisTitleX(ctx, GM, yMin, yMax), GM.top + pH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font         = _gFontTitle + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('y (cm)', 0, 0);
    ctx.restore();
}

// ── Synchronisation marge gauche avec la position du pot (corde) ──────
//  Analogue à _syncLeftMarginWithTube mais utilise cordeLeft

function _syncLeftMarginWithCorde(ctx, W, yMin, yMax) {
    // + place pour le titre d'axe Y pivoté (cf. _yAxisTitleX)
    var minForLabels = _calcLeftMarginRaw(ctx, yMin, yMax) + _gFontTitle + 8;

    // Mode simultané : pas d'alignement possible sur le pot vibrant, cf. le
    // commentaire équivalent dans _syncLeftMarginWithTube.
    if (simCorde.graphMode === 'both') {
        GM.left = minForLabels;
        return;
    }

    if (tubeCanvas && tubeCanvas.clientWidth > 0 && simCorde.cordeLeft > 0 && graphCanvas) {
        var tubeRect  = tubeCanvas.getBoundingClientRect();
        var graphRect = graphCanvas.getBoundingClientRect();
        var potViewportX    = tubeRect.left + (simCorde.cordeLeft / tubeCanvas.clientWidth) * tubeRect.width;
        var marginFromVp    = potViewportX - graphRect.left;
        var marginCanvas    = Math.round(marginFromVp * (W / graphRect.width));
        GM.left = Math.max(minForLabels, marginCanvas);
    } else {
        GM.left = minForLabels;
    }
}

// ── Mode both corde : liaisons balise → point temporel ────────────────

function _drawBothLinksYt(ctx, W, H, half, sep) {
    if (simCorde.ytTimeOrigin === null) return;   // graphe y(t) en attente d'activation (cf. _drawYtGraph)
    var yMin  = -cordeYAxisCm();
    var yMax  =  cordeYAxisCm();
    var pH    = H - GM.top - GM.bottom;
    if (pH <= 0) return;

    function py(y_cm) {
        return GM.top + (1 - (y_cm - yMin) / (yMax - yMin)) * pH;
    }

    var WINDOW  = 5;
    var elapsed = simCorde.simTime - simCorde.ytTimeOrigin;
    var tOrigin = Math.max(0, elapsed - WINDOW);   // plancher de la fenêtre glissante (temps écoulé)

    var beacons = [];
    if (simCorde.beacon1.active) beacons.push({ beacon: simCorde.beacon1, color: '#e07020' });
    if (simCorde.beacon2.active) beacons.push({ beacon: simCorde.beacon2, color: '#2a8a50' });

    for (var b = 0; b < beacons.length; b++) {
        var bc    = beacons[b];
        var color = bc.color;
        var xb    = bc.beacon.x - simCorde.cordeLeft;
        var y_cm  = cordeDisplacement(xb, simCorde.simTime);
        var yc    = py(y_cm);

        if (yc < GM.top || yc > GM.top + pH) continue;

        var pW_left = half - GM.left - GM.right;
        if (pW_left <= 0) continue;
        var L    = simCorde.cordeLength > 0 ? simCorde.cordeLength : 1;
        var xDpx = GM.left + (xb / L) * pW_left;

        var tLocal   = elapsed - tOrigin;
        tLocal       = Math.max(0, Math.min(WINDOW, tLocal));
        var pW_right = half - GM.left - GM.right;
        var xDpt     = (half + sep) + GM.left + (tLocal / WINDOW) * pW_right;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(xDpx, yc);
        ctx.lineTo(xDpt, yc);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.globalAlpha = 1.0;
        ctx.fillStyle   = color;
        ctx.beginPath();
        ctx.arc(xDpx, yc, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(xDpt, yc, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ── Hover snappé corde ────────────────────────────────────────────────

function _drawSnappedHoverCorde(ctx, W, H) {
    if (!graphHoverPos) return;
    var mx = graphHoverPos.x;
    var my = graphHoverPos.y;
    var pW = W - GM.left - GM.right;
    var pH = H - GM.top  - GM.bottom;
    if (pW < 10 || pH < 10) return;

    ctx.save();
    if (simCorde.graphMode === 'dpt') {
        _drawSnappedHoverCorde_yt(ctx, W, H, mx, my, pW, pH);
    } else {
        _drawSnappedHoverCorde_yx(ctx, W, H, mx, my, pW, pH);
    }
    ctx.restore();
}

function _drawSnappedHoverCorde_yt(ctx, W, H, mx, my, pW, pH) {
    var xMin   = simCorde.graphView.xMin;
    var xMax   = simCorde.graphView.xMax;
    var yMin   = simCorde.graphView.yMin;
    var yMax   = simCorde.graphView.yMax;
    var origin = simCorde.graphView.tOrigin || 0;

    function px(v) { return GM.left + (v - xMin) / (xMax - xMin) * pW; }
    function py(v) { return GM.top  + (1 - (v - yMin) / (yMax - yMin)) * pH; }

    var series = [];
    if (simCorde.beacon1.active && _ytBufCorde(1).n > 1)
        series.push({ buf: _ytBufCorde(1), color: '#e07020' });
    if (simCorde.beacon2.active && _ytBufCorde(2).n > 1)
        series.push({ buf: _ytBufCorde(2), color: '#2a8a50' });

    var winner = null, winnerColor = null, winnerDist = Infinity;
    for (var s = 0; s < series.length; s++) {
        var buf = series[s].buf;
        for (var i = 0; i < buf.n; i++) {
            var j = _cbufIdx(buf, i);
            var t = buf.t[j] - origin;
            if (t < xMin || t > xMax) continue;
            var y_cm = buf.y[j];
            var bx   = px(t);
            var by   = py(y_cm);
            var byc  = Math.max(GM.top, Math.min(GM.top + pH, by));
            var dist = (bx - mx) * (bx - mx) + (byc - my) * (byc - my);
            if (dist < winnerDist) { winnerDist = dist; winner = { t: t, y: buf.y[j] }; winnerColor = series[s].color; }
        }
    }
    if (!winner) return;

    var y_cm = winner.y;
    var bx  = px(winner.t);
    var by  = py(y_cm);
    var byc = Math.max(GM.top, Math.min(GM.top + pH, by));

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(60,60,60,0.45)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(bx, GM.top + pH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(GM.left, byc);    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = winnerColor;
    ctx.beginPath();
    ctx.arc(bx, byc, 5, 0, Math.PI * 2);
    ctx.fill();

    var tLbl  = fmtFR(winner.t, 2) + ' s';
    var vLbl  = 'y = ' + fmtFR(y_cm, 2) + ' cm';
    var label = '(' + tLbl + ', ' + vLbl + ')';
    ctx.font         = _gFontHover + 'px monospace';
    ctx.fillStyle    = winnerColor;
    ctx.textBaseline = 'bottom';
    ctx.textAlign    = 'left';
    var lw2 = ctx.measureText(label).width;
    var lx  = (bx + 10 + lw2 > GM.left + pW) ? bx - 10 - lw2 : bx + 10;
    var ly  = (byc - 8 < GM.top + 28)         ? byc + 32       : byc - 8;
    ctx.fillText(label, lx, ly);
}

function _drawSnappedHoverCorde_yx(ctx, W, H, mx, my, pW, pH) {
    var dx = simCorde.yxX, dy = simCorde.yxY, dn = simCorde.yxN | 0;
    if (!dx || dn < 2) return;

    var L    = simCorde.cordeLength;
    var xMin = 0;
    var xMax = L > 0 ? L : 1;
    var yMin = simCorde.graphYxYMin;
    var yMax = simCorde.graphYxYMax;

    function px(v) { return GM.left + (v - xMin) / (xMax - xMin) * pW; }
    function py(v) { return GM.top  + (1 - (v - yMin) / (yMax - yMin)) * pH; }

    var bestI = -1, bestDist = Infinity;
    for (var i = 0; i < dn; i++) {
        var y_cm = dy[i];
        var bx_  = px(dx[i]);
        var by_  = py(y_cm);
        var byc_ = Math.max(GM.top, Math.min(GM.top + pH, by_));
        var d    = (bx_ - mx) * (bx_ - mx) + (byc_ - my) * (byc_ - my);
        if (d < bestDist) { bestDist = d; bestI = i; }
    }
    if (bestI < 0) return;
    var bestX = dx[bestI];

    var y_cm = dy[bestI];
    var bx   = px(bestX);
    var by   = py(y_cm);
    var byc  = Math.max(GM.top, Math.min(GM.top + pH, by));

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(60,60,60,0.45)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(bx, GM.top + pH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, byc); ctx.lineTo(GM.left, byc);    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#7a2510';
    ctx.beginPath();
    ctx.arc(bx, byc, 5, 0, Math.PI * 2);
    ctx.fill();

    var mPerPx  = (L > 0) ? CORDE_LENGTH_M / L : 1;
    var dM      = fmtFR(bestX * mPerPx, 2);
    var label   = '(' + dM + ' m, y = ' + fmtFR(y_cm, 2) + ' cm)';
    ctx.font         = _gFontHover + 'px monospace';
    ctx.fillStyle    = '#7a2510';
    ctx.textBaseline = 'bottom';
    ctx.textAlign    = 'left';
    var lw2 = ctx.measureText(label).width;
    var lx  = (bx + 10 + lw2 > GM.left + pW) ? bx - 10 - lw2 : bx + 10;
    var ly  = (byc - 8 < GM.top + 28)         ? byc + 32       : byc - 8;
    ctx.fillText(label, lx, ly);
}

// ── Réticule corde ────────────────────────────────────────────────────

function _drawCrosshairCorde(ctx, W, H) {
    if (!graphHoverPos) return;
    var mx = graphHoverPos.x;
    var my = graphHoverPos.y;
    var pW = W - GM.left - GM.right;
    var pH = H - GM.top  - GM.bottom;

    ctx.save();
    ctx.strokeStyle = '#7a2510';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 3]);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(mx, GM.top);
    ctx.lineTo(mx, GM.top + pH);
    ctx.moveTo(GM.left, my);
    ctx.lineTo(GM.left + pW, my);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    var xVal, yVal;
    if (pW > 0 && pH > 0) {
        if (simCorde.graphMode === 'dpx') {
            var xData  = (mx - GM.left) / pW * simCorde.cordeLength;
            var mPerPx = simCorde.cordeLength > 0 ? CORDE_LENGTH_M / simCorde.cordeLength : 1;
            xVal = fmtFR(xData * mPerPx, 2) + ' m';
        } else {
            var tData = simCorde.graphView.xMin +
                (mx - GM.left) / pW * (simCorde.graphView.xMax - simCorde.graphView.xMin);
            xVal = fmtFR(tData, 2) + ' s';
        }
        var yRange = simCorde.graphMode === 'dpx'
            ? (simCorde.graphYxYMax - simCorde.graphYxYMin)
            : (simCorde.graphView.yMax - simCorde.graphView.yMin);
        var yMinV  = simCorde.graphMode === 'dpx' ? simCorde.graphYxYMin : simCorde.graphView.yMin;
        yVal = fmtFR(yMinV + (1 - (my - GM.top) / pH) * yRange, 2) + ' cm';
    }

    var tip = document.getElementById('graph-hover-tooltip');
    if (tip && xVal !== undefined) {
        tip.textContent = xVal + '  |  y = ' + yVal;
        tip.style.display = 'block';
        var gRect  = graphCanvas.getBoundingClientRect();
        var scaleX = graphCanvas.clientWidth  / gRect.width;
        var scaleY = graphCanvas.clientHeight / gRect.height;
        var vpX    = gRect.left + mx / scaleX;
        var vpY    = gRect.top  + my / scaleY;
        var offX   = vpX + 12;
        var offY   = vpY - 10;
        if (offX + 190 > window.innerWidth) offX = vpX - 190;
        if (offY < 4) offY = vpY + 14;
        tip.style.left = offX + 'px';
        tip.style.top  = offY + 'px';
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Basculement des modes graphe / outils
// ══════════════════════════════════════════════════════════════════════

function setGraphMode(mode) {
    var isCorde  = (typeof activeTab !== 'undefined' && activeTab === 'corde');
    var isVagues = (typeof activeTab !== 'undefined' && activeTab === 'vagues');

    // Mettre à jour le graphMode dans l'objet approprié
    if (isCorde) {
        simCorde.graphMode = mode;
    } else if (isVagues) {
        simVagues.graphMode = mode;
    } else {
        sim.graphMode = mode;
    }

    var btnDpx  = document.getElementById('btn-graph-dpx');
    var btnDpt  = document.getElementById('btn-graph-dpt');
    var btnBoth = document.getElementById('btn-graph-both');
    if (btnDpx)  btnDpx.classList.toggle ('active', mode === 'dpx');
    if (btnDpt)  btnDpt.classList.toggle ('active', mode === 'dpt');
    if (btnBoth) btnBoth.classList.toggle('active', mode === 'both');

    // Classe sur #graph-area pour afficher/masquer la ligne de séparation
    var graphArea = document.getElementById('graph-area');
    if (graphArea) graphArea.classList.toggle('mode-both', mode === 'both');

    // Masquer tooltip
    var tip = document.getElementById('graph-hover-tooltip');
    if (tip) tip.style.display = 'none';
}

// Met à jour les labels des boutons graphe selon le tab actif
function _updateGraphBtnLabels(tab) {
    var btnDpx  = document.getElementById('btn-graph-dpx');
    var btnDpt  = document.getElementById('btn-graph-dpt');
    if (tab === 'corde' || tab === 'vagues') {
        if (btnDpx) btnDpx.textContent = 'y(x) — spatial';
        if (btnDpt) btnDpt.textContent = 'y(t) — temporel';
    } else {
        if (btnDpx) btnDpx.textContent = 'ΔP(x) — spatial';
        if (btnDpt) btnDpt.textContent = 'ΔP(t) — temporel';
    }
}

function _activeSv() {
    if (typeof activeTab === 'undefined') return sim;
    if (activeTab === 'corde')  return simCorde;
    if (activeTab === 'vagues') return simVagues;
    return sim;
}

function toggleGraphCursor() {
    var sv  = _activeSv();
    var tip = document.getElementById('graph-hover-tooltip');
    sv.graphCursorMode = !sv.graphCursorMode;
    if (!sv.graphCursorMode && tip) tip.style.display = 'none';
    var c = document.getElementById('btn-graph-cursor');
    if (c) c.classList.toggle('active', sv.graphCursorMode);
}

// ══════════════════════════════════════════════════════════════════════
//  Interactions souris sur le canvas graphe
// ══════════════════════════════════════════════════════════════════════

(function initGraphHover() {
    function setup() {
        graphCanvas = document.getElementById('graph-canvas');
        if (!graphCanvas) return;

        graphCanvas.addEventListener('pointermove', function(e) {
            var rect = graphCanvas.getBoundingClientRect();
            var mx   = (e.clientX - rect.left) * (graphCanvas.clientWidth  / rect.width);
            var my   = (e.clientY - rect.top)  * (graphCanvas.clientHeight / rect.height);
            graphHoverPos = { x: mx, y: my, free: !!_activeSv().graphCursorMode };
        });

        graphCanvas.addEventListener('pointerleave', function() {
            graphHoverPos = null;
            var tip = document.getElementById('graph-hover-tooltip');
            if (tip) tip.style.display = 'none';
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();

