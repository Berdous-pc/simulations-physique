// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  surfaces.js — Onglet "Ondes de surfaces" : onde plane diffractée par une
//  ouverture percée dans un obstacle (vue de dessus).
//
//  Physique : UN SEUL modèle sur toute la plage de a/λ — somme de Huygens
//  discrète sur des sources ponctuelles réparties dans l'ouverture, chacune
//  émettant une onde cylindrique 2D. Pas d'approximation paraxiale (contrairement
//  à une intégrale de Fresnel), donc valide à tout angle — jusqu'à l'onde
//  quasi-omnidirectionnelle d'une "source ponctuelle" quand a≪λ.
//
//  (Une intégrale de Fresnel a été essayée pour éviter la boucle sur les
//  sources : plus rapide, mais paraxiale — donc fausse dès que la figure de
//  diffraction s'étale sur de grands angles (a≲λ), et son champ proche très
//  oscillant (nombre de Fresnel élevé) reste visuellement "chargé" même
//  bien échantillonné. Mélanger les deux modèles créait en plus un battement
//  (moiré) entre leurs motifs de franges légèrement différents. D'où le
//  retour à un unique modèle Huygens.)
//
//  Pour éviter les faux lobes de réseau (repliement dû à un échantillonnage trop grossier d'une
//  ouverture large par trop peu de sources), l'espacement des sources est fixé à
//  λ/SURF_HUYGENS_SPACING_DIV (≈ λ/3, bien en dessous du critère de Nyquist) — voir
//  _surfHuygensSources. Sur les plages de λ/a de cette page, ça reste au pire ~50-60 sources,
//  bon marché puisque le calcul ne tourne qu'au rebuild (anti-rebond via
//  requestAnimationFrame), jamais dans la boucle de rendu par frame. (Reste une granulosité en
//  champ proche pour a/λ modéré — auto-similaire par mise à l'échelle, donc affaire de plage de
//  sliders plutôt que d'espacement des sources, cf. discussion sur SURF_HUYGENS_SPACING_DIV.)
//  Toutes les sources ont la MÊME amplitude (pas de fenêtrage/apodisation) : une fois
//  l'échantillonnage assez fin pour
//  éviter le repliement, l'amplitude uniforme reproduit fidèlement le vrai motif de diffraction
//  d'une fente à bords nets — avec ses véritables lobes secondaires (sinc²), qu'on ne cherche
//  pas à atténuer : ils ont une réalité physique et un intérêt pédagogique.
//
//  Le champ champ(x,y,t) = P(x,y)·cos(ωt) + Q(x,y)·sin(ωt), P/Q
//  indépendants du temps, est précalculé une fois par géométrie (cf.
//  _rebuildSurfFieldCache) sur une grille basse résolution, agrandie par
//  drawImage — le rendu par frame n'a donc ni trigonométrie par source ni
//  boucle sur les sources, juste 2 multiplications par cellule de grille.
//
//  Dépend de : sim.js, scene.js (formatFr). Chargé après graph.js, avant ui.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Constantes ────────────────────────────────────────────────────────
var SURF_C_CM           = 9.6;  // célérité de l'onde (cm/s), fixe
var SURF_VIEW_WIDTH_CM  = 45;   // largeur visible du bassin (calibre pxPerCm au resize)
var SURF_GRAPH_WINDOW   = 5;    // fenêtre temporelle du graphe y(t), en s
var SURF_GRID_FACTOR    = 4;    // sous-échantillonnage du champ (px CSS par cellule de grille) à zoom=1
var SURF_GRID_W_MAX     = 380;  // bornes DURES de la grille de calcul du champ (coût du rebuild et du
var SURF_GRID_H_MAX     = 250;  // dessin par frame ∝ largeur × hauteur de grille)
// Le cadrage ci-dessus (SURF_GRID_FACTOR px/cellule) est fixé en pixels ÉCRAN, donc indépendant
// du zoom : dézoomer (cf. SURF_ZOOM_MAX) fait couvrir plus de cm à chaque cellule, ce qui peut
// sous-échantillonner l'onde pour les petits λ. La grille est donc aussi dimensionnée pour
// garantir au moins SURF_GRID_CELLS_PER_LAMBDA cellules par longueur d'onde (cf.
// _rebuildSurfFieldCache), la plus grande des deux exigences l'emportant — plafonné par
// SURF_GRID_W_MAX/H_MAX pour borner le coût dans les pires cas (zoom max + petit λ + grand a).
var SURF_GRID_CELLS_PER_LAMBDA = 5;
// Espacement des sources = λ / SURF_HUYGENS_SPACING_DIV. La granulosité en champ proche
// (sources individuelles distinguables) ne dépend que du rapport a/λ (le rendu est
// auto-similaire par mise à l'échelle) : resserrer l'espacement au-delà du critère de Nyquist
// (>2) n'y change quasiment rien — c'est la plage des sliders (a/λ atteignable) qu'il faut
// ajuster si le grain reste gênant, pas ce facteur.
var SURF_HUYGENS_SPACING_DIV = 3;
var SURF_HUYGENS_N_MAX  = 220;      // garde-fou (coût du rebuild ∝ grille × N, cf. _rebuildSurfFieldCache) —
                                     // couvre le pire cas des sliders (a=30cm, λ=1cm)
var SURF_GEO_R_FLOOR    = 0.25;     // plancher de r (× λ) dans la décroissance 1/√r, cf. _surfHuygensPQAtCell

// ── Zoom (molette) ────────────────────────────────────────────────────
// zoom = 1 → vue par défaut (SURF_VIEW_WIDTH_CM affichés) ; zoom = SURF_ZOOM_MAX → champ de
// vision SURF_ZOOM_MAX fois plus large (dézoom, utile pour les grands λ dont le champ proche
// dépasse la fenêtre par défaut). N'affecte QUE pxPerCm (le rapport a/λ et le nombre de sources
// de Huygens restent inchangés par le zoom) — MAIS un zoom plus large peut, à λ fixe, exiger une
// grille plus fine pour rester au-dessus de SURF_GRID_CELLS_PER_LAMBDA (cf.
// _rebuildSurfFieldCache), donc un rebuild coûteux. Un geste de molette (trackpad surtout)
// enchaîne des dizaines d'évènements par seconde : reconstruire la grille à CHAQUE évènement
// (même juste re-coalescé par frame via requestAnimationFrame) resaturait le rebuild en continu
// pendant tout le geste. Le rebuild est donc anti-rebondi par un vrai délai (cf.
// _surfZoomDebounceMs dans initSurfZoom) : on ne recalcule qu'une fois le geste terminé.
var SURF_ZOOM_MIN  = 1;
var SURF_ZOOM_MAX  = 4;
var SURF_ZOOM_STEP = 1.12; // facteur multiplicatif appliqué par cran de molette
var SURF_ZOOM_DEBOUNCE_MS = 150; // délai d'inactivité molette avant de reconstruire la grille

// Couleurs de l'onde (crêtes ↔ creux) — identiques à ondes/js/vagues.js pour
// une cohérence visuelle entre les pages du site.
var SURF_COL_CREST  = [200, 240, 255];
var SURF_COL_TROUGH = [0, 10, 55];
// SURF_COL_BG = midpoint crête/creux → pas de cassure au front d'onde ni hors
// du bassin non encore atteint par l'onde.
var SURF_COL_BG      = [100, 125, 155];

// ── État global ───────────────────────────────────────────────────────
var simSurf = {

    // ── Contrôle de l'animation ─────────────────────────────────────
    paused  : false,
    simTime : 0,

    // ── Paramètres réglables ──────────────────────────────────────────
    lambda : 4,   // cm
    a      : 5,   // cm

    // ── Géométrie canvas ─────────────────────────────────────────────
    canvasW     : 0,
    canvasH     : 0,
    pxPerCm     : 10,
    zoom        : 1,   // 1 = vue par défaut, SURF_ZOOM_MAX = dézoomé au max (cf. constantes ci-dessus)
    barrierX    : 0,
    barrierCY   : 0,
    gapHalf     : 0,
    firstResize : true,

    // ── Point de mesure draggable ─────────────────────────────────────
    point       : { x: 0, y: 0 },
    dragging    : false,

    // ── Graphe y(t) ────────────────────────────────────────────────────
    showGraph    : false,
    ptData       : [],   // [{t, y}]
    ptTimeOrigin : 0,
};

// ══════════════════════════════════════════════════════════════════════
//  Géométrie — recalculée au resize et à chaque changement de λ/a. Reste
//  volontairement bon marché (pas de boucle sur la grille de calcul du champ,
//  cf. _scheduleSurfRebuild plus bas) : appelée directement à chaque
//  évènement `oninput` d'un slider sans avoir besoin d'anti-rebond.
// ══════════════════════════════════════════════════════════════════════

function updateSurfGeometry() {
    var s = simSurf;
    var a_px = s.a * s.pxPerCm;
    var cy   = s.canvasH / 2;

    s.barrierCY = cy;
    s.gapHalf   = a_px / 2;

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
    simSurf.barrierX = Math.round(w * 0.30);

    if (simSurf.firstResize) {
        simSurf.point.rx = 0.62;
        simSurf.point.ry = 0.42;
        simSurf.firstResize = false;
    }
    simSurf.point.x = Math.round(simSurf.point.rx * w);
    simSurf.point.y = Math.round(simSurf.point.ry * h);

    updateSurfGeometry();
    resizeSurfGraphCanvas();
}

var _surfRebuildScheduled = false;
function _scheduleSurfRebuild() {
    if (_surfRebuildScheduled) return;
    _surfRebuildScheduled = true;
    requestAnimationFrame(function () {
        _surfRebuildScheduled = false;
        _rebuildSurfFieldCache();
    });
}

// ══════════════════════════════════════════════════════════════════════
//  Sources de Huygens réparties dans l'ouverture, espacées de λ/SURF_HUYGENS_SPACING_DIV
//  (Nyquist pour une onde de longueur λ : il faut plus de 2 sources par λ pour ne pas créer de
//  faux lobes de réseau — on prend ~3 par prudence). Positions RELATIVES à l'axe de l'ouverture
//  (cy0), comme le `y` reçu par _surfHuygensPQAtCell (cf. appelants : `y = py - cy0`) — ne pas y
//  ajouter cy0 ici, sous peine de décaler toute la figure (cy0 serait alors soustrait deux fois).
//  Amplitude UNIFORME sur toutes les sources (pas de fenêtrage) — cf. en-tête de fichier.
// ══════════════════════════════════════════════════════════════════════

function _surfHuygensSources(w, lambda_px) {
    var targetSpacing = Math.max(0.5, lambda_px / SURF_HUYGENS_SPACING_DIV);
    var N = Math.max(4, Math.min(SURF_HUYGENS_N_MAX, Math.round((2 * w) / targetSpacing) + 1));
    var ys = [];
    for (var i = 0; i < N; i++) {
        var frac = (N === 1) ? 0.5 : i / (N - 1); // 0 → 1 sur toute l'ouverture
        ys.push(-w + frac * 2 * w);
    }
    // Espacement RÉEL entre sources (peut différer légèrement de targetSpacing à cause de
    // l'arrondi de N) — c'est lui qu'il faut utiliser comme poids de Riemann dans
    // _surfHuygensPQAtCell, pas targetSpacing, pour que la somme discrète approxime
    // fidèlement l'intégrale continue quel que soit N.
    var spacing = (N > 1) ? (2 * w) / (N - 1) : 2 * w;
    return { ys: ys, spacing: spacing };
}

// Distance la plus courte d'un point (z, y déjà relatifs à l'obstacle/l'axe de l'ouverture)
// au segment de l'ouverture — approxime le temps de parcours de l'onde depuis l'obstacle
// (front causal), sans avoir à sommer sur des sources individuelles.
function _surfRmin(w, z, y) {
    var dyAbs = y < 0 ? -y : y;
    return (dyAbs <= w) ? z : Math.sqrt(z * z + (dyAbs - w) * (dyAbs - w));
}

// ══════════════════════════════════════════════════════════════════════
//  P,Q (cf. en-tête de fichier) au point (z,y) derrière l'obstacle — somme de Huygens sur les
//  sources (amplitude uniforme) de l'ouverture, chacune émettant une onde cylindrique 2D
//  ∝ exp(i(k·R - ωt))/√r (R = barrierX + r, distance totale depuis l'origine ; décroissance
//  géométrique 1/√r d'une onde cylindrique, avec un plancher SURF_GEO_R_FLOOR·λ pour éviter la
//  singularité tout contre une source).
//
//  Normalisation — la somme discrète APPROXIME l'intégrale continue de Huygens
//  U(y,z,t) = (1/√(iλ)) · ∫ [exp(i(kR-ωt))/√r] dy0, dont on sait (en l'approximant en
//  paraxial, cf. dérivation de la diffraction de Fresnel) qu'elle redonne exactement l'onde
//  incidente non perturbée quand l'ouverture est très large devant λ — c'est cette
//  normalisation qui calibre l'échelle d'amplitude correcte, PAS le nombre de sources N :
//  chaque terme est pondéré par l'espacement RÉEL entre sources (poids de Riemann), de sorte
//  qu'échantillonner plus finement (N plus grand à ouverture fixe) ne change pas la valeur de
//  la somme — seulement sa précision. Diviser par N (essayé initialement) faisait au contraire
//  décroître l'amplitude avec la largeur de l'ouverture (donc avec N, l'espacement étant fixé
//  à λ/SURF_HUYGENS_SPACING_DIV), ce qui n'a aucun sens physique : une ouverture plus large ne
//  devrait pas atténuer le champ, au contraire elle tend vers l'onde plane non perturbée.
//
//  (1/√(iλ)) = (1-i)/√(2λ) — développé ci-dessous en P,Q via les formules d'addition, comme
//  pour le modèle de Fresnel précédent.
// ══════════════════════════════════════════════════════════════════════

function _surfHuygensPQAtCell(sourcesInfo, lambda_px, barrierX, z, y) {
    var k = 2 * Math.PI / lambda_px;
    var rFloor = SURF_GEO_R_FLOOR * lambda_px;
    var ys = sourcesInfo.ys, spacing = sourcesInfo.spacing;
    var N = ys.length;
    var sSin = 0, sCos = 0; // Σ (spacing/√r)·sin(kR) et Σ (spacing/√r)·cos(kR)
    for (var i = 0; i < N; i++) {
        var dy = y - ys[i];
        var r = Math.sqrt(z * z + dy * dy);
        if (r < rFloor) r = rFloor;
        var wgt = spacing / Math.sqrt(r);
        var R = barrierX + r;
        sSin += wgt * Math.sin(k * R);
        sCos += wgt * Math.cos(k * R);
    }
    var norm = 1 / Math.sqrt(2 * lambda_px); // |1/√(iλ)|, réparti en P,Q ci-dessous
    return { P: norm * (sSin - sCos), Q: -norm * (sCos + sSin) };
}

function _rebuildSurfFieldCache() {
    var s = simSurf;
    if (s.canvasW < 10 || s.canvasH < 10) return;

    var lambda_px = s.lambda * s.pxPerCm;
    if (lambda_px <= 0) return;

    var gw = Math.max(40, Math.min(SURF_GRID_W_MAX, Math.round(s.canvasW / SURF_GRID_FACTOR)));
    var gh = Math.max(30, Math.min(SURF_GRID_H_MAX, Math.round(s.canvasH / SURF_GRID_FACTOR)));
    // Repasse dessus si le cadrage écran seul sous-échantillonnerait λ (cf. constantes ci-dessus).
    var neededGw = Math.ceil(s.canvasW * SURF_GRID_CELLS_PER_LAMBDA / lambda_px);
    var neededGh = Math.ceil(s.canvasH * SURF_GRID_CELLS_PER_LAMBDA / lambda_px);
    if (neededGw > gw) gw = Math.min(SURF_GRID_W_MAX, neededGw);
    if (neededGh > gh) gh = Math.min(SURF_GRID_H_MAX, neededGh);

    var k     = 2 * Math.PI / lambda_px;
    var c_px  = SURF_C_CM * s.pxPerCm;
    var omega = 2 * Math.PI * c_px / lambda_px;
    var w     = s.gapHalf;
    var cy0   = s.barrierCY;
    var sources = _surfHuygensSources(w, lambda_px);

    var leftSin   = new Float32Array(gw), leftCos = new Float32Array(gw);
    var rightP    = new Float32Array(gw * gh);
    var rightQ    = new Float32Array(gw * gh);
    var rightFront = new Float32Array(gw * gh); // distance (origine → cellule) déclenchant le front causal

    for (var gx = 0; gx < gw; gx++) {
        var px0 = (gx + 0.5) / gw * s.canvasW;
        leftSin[gx] = Math.sin(k * px0);
        leftCos[gx] = Math.cos(k * px0);
    }

    for (var gy = 0; gy < gh; gy++) {
        var py = (gy + 0.5) / gh * s.canvasH;
        for (var gx2 = 0; gx2 < gw; gx2++) {
            var px = (gx2 + 0.5) / gw * s.canvasW;
            var idx = gy * gw + gx2;
            if (px <= s.barrierX) {
                rightP[idx] = 0; rightQ[idx] = 0; rightFront[idx] = Infinity;
                continue;
            }
            var z = px - s.barrierX;
            var y = py - cy0;
            rightFront[idx] = s.barrierX + _surfRmin(w, z, y);

            var pq = _surfHuygensPQAtCell(sources, lambda_px, s.barrierX, z, y);
            rightP[idx] = pq.P;
            rightQ[idx] = pq.Q;
        }
    }

    s.gridW = gw; s.gridH = gh;
    s.k = k; s.c_px = c_px; s.omega = omega;
    s.leftSin = leftSin; s.leftCos = leftCos;
    s.rightP = rightP; s.rightQ = rightQ; s.rightFront = rightFront;

    if (!s._offCanvas) s._offCanvas = document.createElement('canvas');
    s._offCanvas.width  = gw;
    s._offCanvas.height = gh;
    s._offCtx = s._offCanvas.getContext('2d');
}

// ══════════════════════════════════════════════════════════════════════
//  Champ d'onde exact (non grillé) en un point (px, py) du bassin, à
//  l'instant t (simTime par défaut) — utilisé pour le point de mesure M
//  (position arbitraire) et son graphe élongation(t). Même modèle que la
//  grille (cf. _surfHuygensPQAtCell), pour rester cohérent avec elle.
// ══════════════════════════════════════════════════════════════════════

function _surfFieldRaw(px, py, tOverride) {
    var s = simSurf;
    var lambda_px = s.lambda * s.pxPerCm;
    if (lambda_px <= 0 || s.pxPerCm <= 0) return 0;
    var c_px  = SURF_C_CM * s.pxPerCm;
    var k     = 2 * Math.PI / lambda_px;
    var omega = 2 * Math.PI * c_px / lambda_px;
    var t     = (tOverride !== undefined) ? tOverride : s.simTime;

    if (px <= s.barrierX) {
        // Onde plane incidente venant de la gauche — front d'onde vertical
        // avançant à la célérité c depuis le bord gauche (x = 0) à t = 0.
        var front = c_px * t;
        if (px > front) return 0;
        return Math.sin(k * px - omega * t);
    }

    var w = s.gapHalf, cy0 = s.barrierCY;
    var z = px - s.barrierX;
    var y = py - cy0;
    var rmin = _surfRmin(w, z, y);
    if (c_px * t < s.barrierX + rmin) return 0;

    var sources = _surfHuygensSources(w, lambda_px);
    var pq = _surfHuygensPQAtCell(sources, lambda_px, s.barrierX, z, y);
    return pq.P * Math.cos(omega * t) + pq.Q * Math.sin(omega * t);
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

    if (!s.rightP || s.gridW * s.gridH !== s.rightP.length) {
        // Cache pas encore construit (premier affichage juste après un resize/tab-switch,
        // rebuild anti-rebond en attente) : fond uni le temps qu'il arrive.
        ctx.fillStyle = 'rgb(' + SURF_COL_BG.join(',') + ')';
        ctx.fillRect(0, 0, W, H);
        _drawBarrierSurf(ctx, W, H);
        if (s.showGraph) _drawSurfPoint(ctx);
        return;
    }

    var t = s.simTime;
    var cosWT = Math.cos(s.omega * t), sinWT = Math.sin(s.omega * t);
    var front     = s.c_px * t; // distance parcourue depuis l'origine (front causal, gauche ET droite)

    var gw = s.gridW, gh = s.gridH;
    var img  = s._offCtx.createImageData(gw, gh);
    var data = img.data;

    for (var gy = 0; gy < gh; gy++) {
        for (var gx = 0; gx < gw; gx++) {
            var idx = gy * gw + gx;
            var px  = (gx + 0.5) / gw * s.canvasW;
            var raw;
            if (px <= s.barrierX) {
                raw = (px > front) ? 0 : (cosWT * s.leftSin[gx] - sinWT * s.leftCos[gx]);
            } else if (s.rightFront[idx] > front) {
                raw = 0;
            } else {
                raw = s.rightP[idx] * cosWT + s.rightQ[idx] * sinWT;
            }
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

    // Agrandissement natif (lissé) de la grille basse résolution vers la taille d'affichage
    // réelle — bien moins coûteux qu'un remplissage par blocs en JS. Léger flou en plus, juste
    // pour adoucir la trame de la grille basse résolution elle-même (pas pour masquer du
    // repliement : l'espacement des sources en λ/SURF_HUYGENS_SPACING_DIV s'en charge déjà).
    ctx.imageSmoothingEnabled = true;
    ctx.filter = 'blur(0.6px)';
    ctx.drawImage(s._offCanvas, 0, 0, gw, gh, 0, 0, W, H);
    ctx.filter = 'none';

    _drawBarrierSurf(ctx, W, H);
    if (simSurf.showGraph) _drawSurfPoint(ctx);
}

// ── Obstacle percé de l'ouverture ────────────────────────────────────

function _drawBarrierSurf(ctx, W, H) {
    var s = simSurf;
    ctx.save();
    ctx.strokeStyle = '#f0c020';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(s.barrierX, 0);
    ctx.lineTo(s.barrierX, Math.max(0, s.barrierCY - s.gapHalf));
    ctx.moveTo(s.barrierX, Math.min(H, s.barrierCY + s.gapHalf));
    ctx.lineTo(s.barrierX, H);
    ctx.stroke();
    ctx.restore();
}

// ── Point de mesure M (draggable) ────────────────────────────────────

function _drawSurfPoint(ctx) {
    var p = simSurf.point;
    ctx.save();
    ctx.strokeStyle = '#e07020';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#e07020';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('M', p.x, p.y - 10);
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
    if (dt > 0.1) dt = 0.1; // évite un saut après un changement d'onglet/minimisation

    if (!simSurf.paused) {
        simSurf.simTime += dt;
        if (simSurf.showGraph) _updateSurfPointData(simSurf.simTime);
    }
    drawSurfaces();
    if (simSurf.showGraph) drawSurfGraph();
}

function _updateSurfPointData(t) {
    var p = simSurf.point;
    var y = _surfFieldRaw(p.x, p.y, t);
    simSurf.ptData.push({ t: t, y: y });
    // Purge des points hors fenêtre glissante (garde une petite marge)
    var tMin = t - SURF_GRAPH_WINDOW - 0.5;
    while (simSurf.ptData.length && simSurf.ptData[0].t < tMin) simSurf.ptData.shift();
}

// ══════════════════════════════════════════════════════════════════════
//  Graphe élongation(t) au point M
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

    ctx.fillStyle = '#faf9f6';
    ctx.fillRect(0, 0, W, H);

    var t    = simSurf.simTime;
    var tMax = Math.max(SURF_GRAPH_WINDOW, t);
    var tMin = tMax - SURF_GRAPH_WINDOW;
    var yMax = 1.25, yMin = -1.25;

    var GL = 42, GR = 10, GT = 10, GB = 26;
    var pW = W - GL - GR, pH = H - GT - GB;
    if (pW < 20 || pH < 20) return;

    function px(v) { return GL + (v - tMin) / (tMax - tMin) * pW; }
    function py(v) { return GT + (1 - (v - yMin) / (yMax - yMin)) * pH; }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(GL, GT, pW, pH);

    // Grille horizontale (élongation) + axe zéro
    ctx.strokeStyle = 'rgba(200,192,180,0.55)';
    ctx.lineWidth = 0.8;
    ctx.fillStyle = '#7a8a96';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (var v = -1; v <= 1; v += 0.5) {
        var yc = py(v);
        ctx.beginPath(); ctx.moveTo(GL, yc); ctx.lineTo(GL + pW, yc); ctx.stroke();
        ctx.fillText(v.toFixed(1).replace('.', ','), GL - 4, yc);
    }
    ctx.strokeStyle = '#b0a898';
    ctx.lineWidth = 1;
    var y0 = py(0);
    ctx.beginPath(); ctx.moveTo(GL, y0); ctx.lineTo(GL + pW, y0); ctx.stroke();

    // Graduations temporelles (secondes)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var tStep = 1;
    var tStart = Math.ceil(tMin / tStep) * tStep;
    for (var tt = tStart; tt <= tMax; tt += tStep) {
        var xc = px(tt);
        ctx.strokeStyle = 'rgba(200,192,180,0.4)';
        ctx.beginPath(); ctx.moveTo(xc, GT); ctx.lineTo(xc, GT + pH); ctx.stroke();
        ctx.fillStyle = '#7a8a96';
        ctx.fillText(tt.toFixed(0), xc, GT + pH + 3);
    }

    // Courbe élongation(t)
    var data = simSurf.ptData;
    if (data && data.length > 1) {
        ctx.save();
        ctx.beginPath(); ctx.rect(GL, GT, pW, pH); ctx.clip();
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
    ctx.strokeRect(GL, GT, pW, pH);

    ctx.fillStyle = '#5a6a78';
    ctx.font = '11px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Temps (s)', GL + pW / 2, H - 2);

    ctx.save();
    ctx.translate(12, GT + pH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Élongation', 0, 0);
    ctx.restore();
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
        if (d <= 14) {
            simSurf.dragging = true;
            canvas.style.cursor = 'grabbing';
            evt.preventDefault();
        }
    }
    function move(evt) {
        if (!simSurf.dragging) return;
        var pos = _surfPointerPos(canvas, evt);
        var p = simSurf.point;
        p.x = Math.max(0, Math.min(simSurf.canvasW, pos.x));
        p.y = Math.max(0, Math.min(simSurf.canvasH, pos.y));
        p.rx = p.x / simSurf.canvasW;
        p.ry = p.y / simSurf.canvasH;
        evt.preventDefault();
    }
    function up() {
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
//  Zoom (molette) — champ de vision de SURF_VIEW_WIDTH_CM (zoom=1, par défaut) à
//  SURF_ZOOM_MAX·SURF_VIEW_WIDTH_CM (dézoomé), pour pouvoir dézoomer le champ proche des
//  grandes longueurs d'onde. Un geste de molette (trackpad surtout) enchaîne des dizaines
//  d'évènements par seconde ; recalculer pxPerCm + la géométrie + reconstruire toute la grille
//  du champ à CHAQUE évènement (même re-coalescé une fois par frame) sature le rebuild en
//  continu pendant tout le geste — d'où le vrai anti-rebond temporisé ci-dessous (setTimeout,
//  pas juste requestAnimationFrame) : `simSurf.zoom` est mis à jour immédiatement (c'est un
//  simple nombre, gratuit), mais _surfApplyZoom() — qui déclenche le rebuild coûteux — n'est
//  appelé qu'une fois le défilement réellement arrêté (SURF_ZOOM_DEBOUNCE_MS d'inactivité).
//  Le rendu reste donc figé pendant le geste, puis "saute" au nouveau zoom une fois relâché.
// ══════════════════════════════════════════════════════════════════════

function _surfApplyZoom() {
    var s = simSurf;
    if (s.canvasW < 10) return;
    s.pxPerCm = s.canvasW / (SURF_VIEW_WIDTH_CM * s.zoom);
    updateSurfGeometry();
}

var _surfZoomDebounceTimer = null;

function initSurfZoom() {
    var canvas = document.getElementById('surf-canvas');
    if (!canvas) return;

    canvas.addEventListener('wheel', function (evt) {
        evt.preventDefault();
        var factor = evt.deltaY > 0 ? SURF_ZOOM_STEP : (1 / SURF_ZOOM_STEP);
        var z = simSurf.zoom * factor;
        if (z < SURF_ZOOM_MIN) z = SURF_ZOOM_MIN;
        if (z > SURF_ZOOM_MAX) z = SURF_ZOOM_MAX;
        simSurf.zoom = z;

        if (_surfZoomDebounceTimer) clearTimeout(_surfZoomDebounceTimer);
        _surfZoomDebounceTimer = setTimeout(function () {
            _surfZoomDebounceTimer = null;
            _surfApplyZoom();
        }, SURF_ZOOM_DEBOUNCE_MS);
    }, { passive: false });
}

// ══════════════════════════════════════════════════════════════════════
//  Splitter draggable (entre le bassin et le graphe), même logique que
//  celui de l'onglet Ondes lumineuses (cf. ui.js → initSplitter).
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
//  Handlers UI (sliders, boutons) — appelés depuis diffraction/index.html
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
    _updateSurfRatioReadout();
}

function onSliderASurf(v) {
    simSurf.a = parseFloat(v);
    var lbl = document.getElementById('lbl-a-surf');
    if (lbl) lbl.textContent = simSurf.a.toFixed(1).replace('.', ',');
    updateSurfGeometry();
    _updateSurfRatioReadout();
}

function _updateSurfRatioReadout() {
    var el = document.getElementById('ro-a-lambda-surf');
    if (!el) return;
    var ratio = simSurf.a / simSurf.lambda;
    el.textContent = ratio.toFixed(2).replace('.', ',');
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
    if (visible) { simSurf.ptTimeOrigin = simSurf.simTime; simSurf.ptData = []; }
    resize();
}

function toggleGraphSurf() {
    simSurf.showGraph = !simSurf.showGraph;
    syncSurfGraphUI();
}

function resetSurfaces() {
    simSurf.paused  = false;
    simSurf.simTime = 0;
    simSurf.lambda  = 4;
    simSurf.a       = 5;
    simSurf.zoom    = 1;
    simSurf.ptData  = [];
    _surfLastFrameT = null;

    var slLambda = document.getElementById('sl-lambda-surf');
    var slA      = document.getElementById('sl-a-surf');
    if (slLambda) slLambda.value = simSurf.lambda;
    if (slA)      slA.value = simSurf.a;
    var lblLambda = document.getElementById('lbl-lambda-surf');
    var lblA      = document.getElementById('lbl-a-surf');
    if (lblLambda) lblLambda.textContent = simSurf.lambda.toFixed(1).replace('.', ',');
    if (lblA)      lblA.textContent = simSurf.a.toFixed(1).replace('.', ',');

    var btnPlay = document.getElementById('btn-playpause-surf');
    if (btnPlay) { btnPlay.textContent = '⏸ Pause'; btnPlay.className = 'btn btn-pause'; }

    simSurf.showGraph = false;
    syncSurfGraphUI();

    _surfApplyZoom(); // recalcule pxPerCm (zoom remis à 1) + géométrie + programme le rebuild
    _updateSurfRatioReadout();
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation — appelée depuis ui.js → init()
// ══════════════════════════════════════════════════════════════════════

function initSurfaces() {
    initSurfDrag();
    initSurfZoom();
    _updateSurfRatioReadout();
}
