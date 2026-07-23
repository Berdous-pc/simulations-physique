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
var SURF_HUYGENS_N_MAX  = 110;      // garde-fou (coût du rebuild ∝ grille × N, cf. _rebuildSurfFieldCache) —
                                     // pire cas des sliders (a=30cm, λ=1cm) : divisé par 2 (était 220)
                                     // pour désengorger ce cas, qui faisait lagger le rebuild
// Plancher du nombre de sources : en dessous d'une douzaine, la somme discrète cesse d'approximer
// une fente continue et dégénère en motif de réseau à N fentes (minima décalés par rapport au
// sinc² attendu) — sensible surtout pour a≲λ, où (2w)/espacement+1 tombe sous ce seuil. Le coût
// induit (grille × 16 dans le pire cas) reste très en dessous du plafond SURF_HUYGENS_N_MAX déjà
// toléré (grille × 110), donc sans impact perceptible sur les autres réglages.
var SURF_HUYGENS_N_MIN  = 4;
var SURF_GEO_R_FLOOR    = 0.25;     // plancher de r (× λ) dans la décroissance 1/√r, cf. _surfHuygensPQAtCell

// ── Zoom (slider à crans) ────────────────────────────────────────────
// zoom = 1 → vue par défaut (SURF_VIEW_WIDTH_CM affichés) ; zoom = SURF_ZOOM_MAX → champ de
// vision SURF_ZOOM_MAX fois plus large (dézoom, utile pour les grands λ dont le champ proche
// dépasse la fenêtre par défaut). N'affecte QUE pxPerCm (le rapport a/λ et le nombre de sources
// de Huygens restent inchangés par le zoom) — MAIS un zoom plus large peut, à λ fixe, exiger une
// grille plus fine pour rester au-dessus de SURF_GRID_CELLS_PER_LAMBDA (cf.
// _rebuildSurfFieldCache), donc un rebuild coûteux. Un slider continu (ou la molette) génère
// des dizaines d'évènements par geste, ce qui saturait le rebuild ; on utilise donc un slider à
// 4 crans DISCRETS (×1 à ×4, cf. onSliderZoomSurf) : chaque cran ne déclenche qu'un seul rebuild,
// donc plus besoin d'anti-rebond (setTimeout) ici.
var SURF_ZOOM_MIN  = 1;
var SURF_ZOOM_MAX  = 3;
var SURF_ZOOM_STAGES = 3; // nombre de crans du slider de zoom (×1 à ×3)

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
    paused      : false,
    simTime     : 0,
    speedFactor : 1.0,

    // ── Paramètres réglables ──────────────────────────────────────────
    lambda : 4,   // cm
    a      : 5,   // cm

    // ── Géométrie canvas ─────────────────────────────────────────────
    canvasW     : 0,
    canvasH     : 0,
    pxPerCm     : 10,
    zoom        : SURF_ZOOM_MAX,   // SURF_ZOOM_MAX = vue par défaut (dézoomée au max, cran ×1 du slider), SURF_ZOOM_MIN = zoom le plus net (cf. constantes ci-dessus)
    barrierX    : 0,
    barrierCY   : 0,
    gapHalf     : 0,
    firstResize : true,

    // ── Point de mesure draggable — position physique (cm), indépendante du
    //    zoom : x/y (px écran) sont recalculés à partir de cmX/cmY à chaque
    //    changement de pxPerCm (cf. updateSurfGeometry), pour que M reste sur
    //    le même point du bassin quel que soit le cran de zoom.
    point       : { x: 0, y: 0, cmX: null, cmY: null },
    dragging    : false,

    // ── Axe de coupe vertical draggable (graphe "Amplitude(y)") — même principe
    //    que le point M : position physique (cmX) indépendante du zoom, x (px
    //    écran) recalculé à chaque changement de pxPerCm (cf. updateSurfGeometry).
    //    Ne se déplace qu'horizontalement (l'axe reste vertical, sur toute la
    //    hauteur du bassin).
    cut         : { x: 0, cmX: null, dragging: false },

    // ── Affichage des valeurs (rapport λ/a, angle de diffraction) ─────
    showValeurs  : false,
    showAngle    : false,

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
    { key: 'amp-y', label: 'Amplitude(y)', title: 'Amplitude des vagues le long de l\'axe y' }
];

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

    if (s.point.cmX !== null) {
        s.point.x = Math.max(0, Math.min(s.canvasW, s.point.cmX * s.pxPerCm));
        s.point.y = Math.max(0, Math.min(s.canvasH, s.point.cmY * s.pxPerCm));
    }
    if (s.cut.cmX !== null) {
        s.cut.x = Math.max(0, Math.min(s.canvasW, s.cut.cmX * s.pxPerCm));
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
    simSurf.barrierX = Math.round(w * 0.30);

    if (simSurf.firstResize) {
        simSurf.point.cmX = (0.62 * w) / simSurf.pxPerCm;
        simSurf.point.cmY = (0.42 * h) / simSurf.pxPerCm;
        simSurf.cut.cmX   = (0.55 * w) / simSurf.pxPerCm;
        simSurf.firstResize = false;
    }

    updateSurfGeometry();
    resizeSurfGraphCanvas();
}

// Nombre de sources qu'utiliserait _surfHuygensSources pour les réglages courants (sans générer
// le tableau) — sert uniquement à décider du délai d'anti-rebond ci-dessous.
var SURF_REBUILD_DEBOUNCE_N = 48;
function _surfEstimateSourceCount() {
    var s = simSurf;
    var lambda_px = s.lambda * s.pxPerCm;
    var w_px = (s.a / 2) * s.pxPerCm;
    var targetSpacing = Math.max(0.5, lambda_px / SURF_HUYGENS_SPACING_DIV);
    return Math.max(SURF_HUYGENS_N_MIN, Math.min(SURF_HUYGENS_N_MAX, Math.round((2 * w_px) / targetSpacing)));
}

var _surfRebuildScheduled = false;
var _surfRebuildTimer = null;
function _scheduleSurfRebuild() {
    // Au-delà de SURF_REBUILD_DEBOUNCE_N sources, un rebuild par frame (rAF) pendant un drag de
    // slider devient trop coûteux (cf. discussion : lag sur a max / λ min) — on bascule sur un
    // anti-rebond à 100 ms (un seul rebuild après une pause dans le glissement) au lieu d'un par
    // frame. En dessous de ce seuil, rAF reste réactif sans souci de perf.
    if (_surfEstimateSourceCount() > SURF_REBUILD_DEBOUNCE_N) {
        if (_surfRebuildTimer) clearTimeout(_surfRebuildTimer);
        _surfRebuildTimer = setTimeout(function () {
            _surfRebuildTimer = null;
            _rebuildSurfFieldCache();
        }, 100);
        return;
    }
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
    var N = Math.max(SURF_HUYGENS_N_MIN, Math.min(SURF_HUYGENS_N_MAX, Math.round((2 * w) / targetSpacing)));
    // Règle du POINT MILIEU (centres de N intervalles égaux), pas des bords inclus (i/(N-1)) :
    // avec les bords inclus, N sources ne couvrent que N-1 intervalles pour la largeur 2w, donc
    // un espacement réel 2w/(N-1) — ce qui décale le premier zéro du réseau discret d'un facteur
    // parasite (N-1)/N par rapport au sinc² continu (cf. discussion avec l'auteur). Au point
    // milieu, l'espacement est exactement 2w/N, ce qui fait coïncider EXACTEMENT le premier zéro
    // du réseau discret avec celui de la fente continue (sin θ₁ = λ/a), quel que soit N.
    var spacing0 = (2 * w) / N;
    var ys = [];
    for (var i = 0; i < N; i++) {
        ys.push(-w + (i + 0.5) * spacing0);
    }
    // Espacement RÉEL entre sources (peut différer légèrement de targetSpacing à cause de
    // l'arrondi de N) — c'est lui qu'il faut utiliser comme poids de Riemann dans
    // _surfHuygensPQAtCell, pas targetSpacing, pour que la somme discrète approxime
    // fidèlement l'intégrale continue quel que soit N.
    return { ys: ys, spacing: spacing0 };
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
    // Buffer de pixels réutilisé à chaque frame (cf. drawSurfaces) — évite de réallouer un
    // nouvel ImageData 60 fois par seconde (pression sur le ramasse-miettes).
    s._imgData = s._offCtx.createImageData(gw, gh);
}

// ══════════════════════════════════════════════════════════════════════
//  Échantillonnage interpolé de la grille P/Q déjà cachée (cf.
//  _rebuildSurfFieldCache) en un point (z, y) quelconque, relatif à
//  l'obstacle/l'axe de l'ouverture — utilisé par _surfFieldRaw et
//  _surfFieldEnvelope pour éviter de refaire la somme de Huygens complète
//  (jusqu'à SURF_HUYGENS_N_MAX sources) à chaque point interrogé (point M,
//  axe de coupe) : on réutilise le résultat déjà sommé sur la grille, avec
//  une interpolation bilinéaire (résolution grille suffisante puisqu'elle
//  respecte déjà SURF_GRID_CELLS_PER_LAMBDA). Retourne null si le cache
//  n'est pas encore prêt (rebuild anti-rebond en attente) — l'appelant se
//  rabat alors sur le calcul exact.
// ══════════════════════════════════════════════════════════════════════

function _surfSampleGridPQ(s, z, y) {
    var gw = s.gridW, gh = s.gridH;
    if (!s.rightP || gw * gh !== s.rightP.length) return null;

    var px = s.barrierX + z, py = s.barrierCY + y;
    var gxf = px / s.canvasW * gw - 0.5;
    var gyf = py / s.canvasH * gh - 0.5;
    var gx0 = Math.floor(gxf), gy0 = Math.floor(gyf);
    var fx  = gxf - gx0,       fy  = gyf - gy0;
    var gx1 = gx0 + 1,         gy1 = gy0 + 1;
    if (gx0 < 0) gx0 = 0; else if (gx0 > gw - 1) gx0 = gw - 1;
    if (gx1 < 0) gx1 = 0; else if (gx1 > gw - 1) gx1 = gw - 1;
    if (gy0 < 0) gy0 = 0; else if (gy0 > gh - 1) gy0 = gh - 1;
    if (gy1 < 0) gy1 = 0; else if (gy1 > gh - 1) gy1 = gh - 1;

    var i00 = gy0 * gw + gx0, i10 = gy0 * gw + gx1;
    var i01 = gy1 * gw + gx0, i11 = gy1 * gw + gx1;
    var rightP = s.rightP, rightQ = s.rightQ;
    var P = (rightP[i00] * (1 - fx) + rightP[i10] * fx) * (1 - fy) +
            (rightP[i01] * (1 - fx) + rightP[i11] * fx) * fy;
    var Q = (rightQ[i00] * (1 - fx) + rightQ[i10] * fx) * (1 - fy) +
            (rightQ[i01] * (1 - fx) + rightQ[i11] * fx) * fy;
    return { P: P, Q: Q };
}

// ══════════════════════════════════════════════════════════════════════
//  Champ d'onde exact (non grillé) en un point (px, py) du bassin, à
//  l'instant t (simTime par défaut) — utilisé pour le point de mesure M
//  (position arbitraire) et son graphe Hauteur(t). Même modèle que la
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

    var pq = _surfSampleGridPQ(s, z, y);
    if (!pq) {
        var sources = _surfHuygensSources(w, lambda_px);
        pq = _surfHuygensPQAtCell(sources, lambda_px, s.barrierX, z, y);
    }
    return pq.P * Math.cos(omega * t) + pq.Q * Math.sin(omega * t);
}

// ══════════════════════════════════════════════════════════════════════
//  Enveloppe (amplitude MAXIMALE) en un point (px, py) — le facteur devant
//  cos(ωt)/sin(ωt), soit √(P²+Q²) : ne dépend pas de t (hormis le front
//  causal, qui détermine si l'onde a déjà atteint le point). Utilisé par le
//  graphe "Amplitude(y)" : contrairement à Hauteur(t), on ne veut pas
//  l'oscillation instantanée mais l'enveloppe figée le long de l'axe de coupe.
// ══════════════════════════════════════════════════════════════════════

function _surfFieldEnvelope(px, py, tOverride) {
    var s = simSurf;
    var lambda_px = s.lambda * s.pxPerCm;
    if (lambda_px <= 0 || s.pxPerCm <= 0) return 0;
    var c_px = SURF_C_CM * s.pxPerCm;
    var t    = (tOverride !== undefined) ? tOverride : s.simTime;

    if (px <= s.barrierX) {
        var front = c_px * t;
        return (px > front) ? 0 : 1; // onde plane incidente, amplitude unité
    }

    var w = s.gapHalf, cy0 = s.barrierCY;
    var z = px - s.barrierX;
    var y = py - cy0;
    var rmin = _surfRmin(w, z, y);
    if (c_px * t < s.barrierX + rmin) return 0;

    var pq = _surfSampleGridPQ(s, z, y);
    if (!pq) {
        var sources = _surfHuygensSources(w, lambda_px);
        pq = _surfHuygensPQAtCell(sources, lambda_px, s.barrierX, z, y);
    }
    return Math.sqrt(pq.P * pq.P + pq.Q * pq.Q);
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
        if (s.showAngle) _drawSurfAngle(ctx, W, H);
        if (s.showGraph) _drawSurfPoint(ctx);
        if (s.showGraph && _surfAmpYActive()) _drawSurfCutAxis(ctx, H);
        return;
    }

    var t = s.simTime;
    var cosWT = Math.cos(s.omega * t), sinWT = Math.sin(s.omega * t);
    var front     = s.c_px * t; // distance parcourue depuis l'origine (front causal, gauche ET droite)

    var gw = s.gridW, gh = s.gridH;
    var img  = s._imgData; // buffer réutilisé (cf. _rebuildSurfFieldCache), pas de réallocation par frame
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
    if (s.showAngle) _drawSurfAngle(ctx, W, H);
    if (simSurf.showGraph) _drawSurfPoint(ctx);
    if (simSurf.showGraph && _surfAmpYActive()) _drawSurfCutAxis(ctx, H);
}

// L'axe de coupe (graphe "Amplitude(y)") n'est affiché/actif que si ce graphe
// est sélectionné dans l'un des deux emplacements (simple ou dual).
function _surfAmpYActive() {
    return simSurf.graphTab1 === 'amp-y' ||
           (simSurf.graphMode === 'dual' && simSurf.graphTab2 === 'amp-y');
}

// ── Angle de diffraction (axe blanc + bissectrices jaunes du 1er minimum) ────

function _drawSurfAngle(ctx, W, H) {
    var s = simSurf;
    var theta = _surfFindFirstMinTheta(s.lambda, s.a);
    var ox = s.barrierX, oy = s.barrierCY;
    var len = Math.max(W, H) * 1.5; // assez long pour traverser tout le canvas quel que soit l'angle

    ctx.save();
    ctx.lineWidth = 3;
    ctx.setLineDash([16, 10]);

    // Axe initial de propagation (θ = 0), centré sur l'ouverture.
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + len, oy);
    ctx.stroke();

    // Bissectrices ±θ délimitant le lobe central.
    ctx.strokeStyle = '#ffe14d';
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + len * Math.cos(theta), oy - len * Math.sin(theta));
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + len * Math.cos(theta), oy + len * Math.sin(theta));
    ctx.stroke();

    ctx.restore();
}

// ── Obstacle percé de l'ouverture ────────────────────────────────────

var SURF_OBSTACLE_WIDTH_PX = 27; // épaisseur (px écran) au zoom le plus net (SURF_ZOOM_MIN) ; ×3 par rapport aux 9px précédents

function _drawBarrierSurf(ctx, W, H) {
    var s = simSurf;
    ctx.save();
    // Couleur complémentaire de SURF_COL_BG (= milieu crête/creux, couleur moyenne des vagues) :
    // 255 - [100,125,155] = [155,130,100] = #9b8264.
    ctx.strokeStyle = '#9b8264';
    // Épaisseur exprimée en cm (fixée au zoom le plus net) plutôt qu'en px écran, pour que
    // l'obstacle garde une taille physique cohérente quel que soit le cran de zoom choisi.
    ctx.lineWidth = SURF_OBSTACLE_WIDTH_PX * SURF_ZOOM_MIN / s.zoom;
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
// Trait vertical orienté vers le haut, sur toute la hauteur du bassin — sa
// position x définit le plan de coupe pour le graphe Amplitude(y) (0 = centre
// de la figure = barrierCY).

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
    // Pointe de flèche vers le haut
    ctx.fillStyle = SURF_COL_CUT;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 7, 14);
    ctx.lineTo(x + 7, 14);
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
    if (dt > 0.1) dt = 0.1; // évite un saut après un changement d'onglet/minimisation

    if (!simSurf.paused) {
        var tPrev = simSurf.simTime;
        simSurf.simTime += dt * (simSurf.speedFactor || 1.0);
        if (simSurf.showGraph) _updateSurfPointData(tPrev, simSurf.simTime);
    }
    drawSurfaces();
    if (simSurf.showGraph) drawSurfGraph();
}

// Un seul échantillon par frame (~60 Hz) sous-échantillonne largement les petites longueurs
// d'onde : à λ = 1 cm, la période T = λ/c ≈ 0,10 s n'est couverte que par ~6 points/période,
// ce qui aliase visiblement la courbe. On subdivise donc le pas de temps en sous-pas d'au plus
// T/20 pour garder une courbe lisse quel que soit λ, sans dépendre du taux de rafraîchissement.
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
    // Purge des points hors fenêtre glissante (garde une petite marge)
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

// ── drawSurfGraph — point d'entrée (1 ou 2 graphes, cf. simSurf.graphMode) ──
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
    else _drawSurfAmpT(ctx, x0, y0, W, H);
}

// ── Graphe "Hauteur(t)" — hauteur d'eau au point M en fonction du temps
//    (distincte de l'Amplitude(y), qui est l'enveloppe constante dans le
//    temps — cf. discussion avec l'auteur) ──
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

    // Grille horizontale (amplitude) + axe zéro
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

    // Graduations temporelles (secondes)
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

    // Courbe hauteur(t)
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

// ── Graphe "Amplitude(y)" — enveloppe (amplitude MAXIMALE, √(P²+Q²), le
//    facteur devant cos(ωt)/sin(ωt)) le long de l'axe de coupe vertical
//    (draggable dans le bassin), 0 = centre de la figure (barrierCY). Ne
//    dépend pas du temps (hormis le front causal qui la fait apparaître
//    progressivement) — pas d'oscillation, contrairement à Hauteur(t). ──
function _drawSurfAmpY(ctx, x0, y0, W, H) {
    var s = simSurf;
    if (s.pxPerCm <= 0 || !s.canvasH) return;

    var halfRangeCm = (s.canvasH / 2) / s.pxPerCm;
    var xMin = -halfRangeCm, xMax = halfRangeCm;

    var GL = 78, GR = 12, GT = 14, GB = 34;
    var pW = W - GL - GR, pH = H - GT - GB;
    if (pW < 20 || pH < 20) return;

    // ── Échantillonnage de l'enveloppe le long de l'axe de coupe, une seule
    //    fois — sert à la fois à cadrer l'axe des ordonnées (qui doit monter
    //    au-delà de 1 très près de l'obstacle, cf. interférences constructives
    //    proches) et à tracer la courbe.
    var N = Math.max(40, Math.round(pW));
    var yCms = [], amps = [];
    var maxAmp = 0;
    for (var i = 0; i <= N; i++) {
        var py_screen = i / N * s.canvasH;
        yCms.push((py_screen - s.barrierCY) / s.pxPerCm);
        var amp = _surfFieldEnvelope(s.cut.x, py_screen, s.simTime);
        amps.push(amp);
        if (amp > maxAmp) maxAmp = amp;
    }

    // Plancher à 1,25 (cadrage habituel), mais l'axe monte plus haut si
    // l'enveloppe le dépasse (interférences constructives près de l'obstacle).
    var yMin = 0, yMax = Math.max(1.25, maxAmp * 1.08);

    function px(v) { return x0 + GL + (v - xMin) / (xMax - xMin) * pW; }
    function py(v) { return y0 + GT + (1 - (v - yMin) / (yMax - yMin)) * pH; }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x0 + GL, y0 + GT, pW, pH);

    // Grille horizontale (amplitude, toujours positive — enveloppe)
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

    // Graduations le long de l'axe (cm, 0 = centre)
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

    // Courbe amplitude(y) — enveloppe échantillonnée le long de l'axe de coupe
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

// Pas "joli" pour les graduations d'un axe (cm ou amplitude) — targetTicks
// graduations visées sur la plage donnée.
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
// Même structure que _buildGraphCtrl (champ_uniforme/js/graph.js), adaptée aux
// deux seuls graphes disponibles ici (Hauteur(t), Amplitude(y)).

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
        // Axe de coupe : n'accroche que si le graphe Amplitude(y) est actif —
        // tolérance horizontale sur toute la hauteur (trait vertical).
        if (simSurf.showGraph && _surfAmpYActive() &&
            Math.abs(pos.x - simSurf.cut.x) <= 10) {
            simSurf.cut.dragging = true;
            canvas.style.cursor = 'ew-resize';
            evt.preventDefault();
        }
    }
    function move(evt) {
        if (simSurf.cut.dragging) {
            var posC = _surfPointerPos(canvas, evt);
            var c = simSurf.cut;
            c.x = Math.max(0, Math.min(simSurf.canvasW, posC.x));
            c.cmX = c.x / simSurf.pxPerCm;
            evt.preventDefault();
            return;
        }
        if (!simSurf.dragging) return;
        var pos = _surfPointerPos(canvas, evt);
        var p = simSurf.point;
        p.x = Math.max(0, Math.min(simSurf.canvasW, pos.x));
        p.y = Math.max(0, Math.min(simSurf.canvasH, pos.y));
        p.cmX = p.x / simSurf.pxPerCm;
        p.cmY = p.y / simSurf.pxPerCm;
        evt.preventDefault();
    }
    function up() {
        if (simSurf.cut.dragging) {
            simSurf.cut.dragging = false;
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
//  Zoom (slider à SURF_ZOOM_STAGES crans) — champ de vision de SURF_VIEW_WIDTH_CM
//  (zoom=SURF_ZOOM_MIN, cran ×SURF_ZOOM_STAGES, le plus net) à SURF_ZOOM_MAX·SURF_VIEW_WIDTH_CM
//  (zoom=SURF_ZOOM_MAX, cran ×1, vue par défaut, dézoomée au max — utile pour les grandes
//  longueurs d'onde dont le champ proche dépasse la fenêtre la plus zoomée). Le cran de slider
//  (1 à SURF_ZOOM_STAGES) est INVERSEMENT proportionnel au zoom interne — cf. onSliderZoomSurf.
//  Chaque cran ne déclenche qu'un seul rebuild de la grille (pas de geste continu comme à la
//  molette), donc pas besoin d'anti-rebond ici.
// ══════════════════════════════════════════════════════════════════════

function _surfApplyZoom() {
    var s = simSurf;
    if (s.canvasW < 10) return;
    s.pxPerCm = s.canvasW / (SURF_VIEW_WIDTH_CM * s.zoom);
    updateSurfGeometry();
}

function onSliderZoomSurf(v) {
    var stage = parseInt(v, 10);
    // Cran ×SURF_ZOOM_STAGES → zoom = SURF_ZOOM_MIN (le plus net) ;
    // cran ×1 (défaut) → zoom = SURF_ZOOM_MAX (le plus dézoomé).
    simSurf.zoom = SURF_ZOOM_MAX + SURF_ZOOM_MIN - stage;
    var lbl = document.getElementById('lbl-zoom-surf');
    if (lbl) lbl.textContent = stage;
    _surfApplyZoom();
    _syncSurfAngleWarning();
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

var SURF_SPEED_STEPS = [0.10, 0.25, 0.50, 1.00];

function onSliderSpeedSurf(v) {
    var idx = parseInt(v, 10);
    simSurf.speedFactor = SURF_SPEED_STEPS[idx];
    var lbl = document.getElementById('lbl-speed-surf');
    if (lbl) lbl.textContent = simSurf.speedFactor.toFixed(2).replace('.', ',');
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

// ══════════════════════════════════════════════════════════════════════
//  Premier minimum d'intensité depuis le centre (θ=0) : sin θ₁ = λ/a, la solution fermée de
//  l'intégrale de Fraunhofer d'une fente continue. Depuis le passage à la répartition point
//  milieu des sources de Huygens (cf. _surfHuygensSources), le premier zéro du réseau discret
//  qu'on affiche coïncide EXACTEMENT avec cette formule, quel que soit N — plus besoin de
//  balayer/affiner numériquement le facteur de réseau, la formule fermée donne déjà la valeur
//  cohérente avec la figure rendue, sans boucle ni coût.
//  Si λ/a > 1 (aperture plus petite qu'une longueur d'onde), il n'y a plus de minimum réel
//  (l'intensité décroît sans jamais s'annuler) — on plafonne à 90°, simplification niveau
//  terminale, cf. discussion avec l'auteur.
// ══════════════════════════════════════════════════════════════════════
function _surfFindFirstMinTheta(lambda, a) {
    return Math.asin(Math.min(lambda / a, 1));
}

function _updateSurfRatioReadout() {
    var el = document.getElementById('ro-a-lambda-surf');
    if (el) {
        var ratio = simSurf.lambda / simSurf.a;
        el.textContent = ratio.toFixed(2).replace('.', ',');
    }
    var elRad = document.getElementById('ro-theta-rad-surf');
    var elDeg = document.getElementById('ro-theta-deg-surf');
    var theta = _surfFindFirstMinTheta(simSurf.lambda, simSurf.a);
    if (elRad) elRad.textContent = theta.toFixed(4).replace('.', ',');
    if (elDeg) elDeg.textContent = (theta * 180 / Math.PI).toFixed(2).replace('.', ',');
    _syncSurfAngleWarning();
}

// ══════════════════════════════════════════════════════════════════════
//  Avertissement : l'ouverture angulaire théorique (sin θ₁ = λ/a) ne devient visible qu'à
//  partir de la distance de Fraunhofer a²/λ (au-delà, le faisceau a eu la place de s'ouvrir ;
//  en-deçà, il reste quasi collimaté — régime de Fresnel proche, cf. discussion avec l'auteur).
//  Le bassin affiché ne couvre que ~0,70·SURF_VIEW_WIDTH_CM·zoom cm derrière l'obstacle (30% de
//  la largeur est occupée par l'obstacle) : si cette profondeur est trop courte devant a²/λ,
//  l'angle ne peut pas se voir sur la figure, quel que soit le zoom raisonnable choisi.
// ══════════════════════════════════════════════════════════════════════
function _syncSurfAngleWarning() {
    var warn = document.getElementById('surf-angle-warning');
    if (!warn) return;
    var fraunhoferDist = (simSurf.a * simSurf.a) / simSurf.lambda;
    var visibleDepth = 0.70 * SURF_VIEW_WIDTH_CM * simSurf.zoom;
    warn.style.display = (fraunhoferDist > visibleDepth) ? '' : 'none';
}

function syncValeursSurfUI() {
    var visible = simSurf.showValeurs;
    var el = document.getElementById('readouts-surf');
    if (el) el.style.display = visible ? '' : 'none';
    var btn = document.getElementById('btn-toggle-valeurs-surf');
    if (btn) btn.classList.toggle('active', visible);
}

function toggleValeursSurf() {
    simSurf.showValeurs = !simSurf.showValeurs;
    syncValeursSurfUI();
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

function toggleSurfAngle() {
    simSurf.showAngle = !simSurf.showAngle;
    var btn = document.getElementById('btn-angle-surf');
    if (btn) btn.classList.toggle('active', simSurf.showAngle);
}

function resetSurfaces() {
    simSurf.paused  = false;
    simSurf.simTime = 0;
    simSurf.lambda  = 4;
    simSurf.a       = 5;
    simSurf.zoom    = SURF_ZOOM_MAX; // cran ×1, vue par défaut (dézoomée au max)
    simSurf.ptData  = [];
    simSurf.graphMode = 'single';
    simSurf.graphTab1 = 'amp-t';
    simSurf.graphTab2 = 'amp-y';
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

    simSurf.showValeurs = false;
    syncValeursSurfUI();

    simSurf.showAngle = false;
    var btnAngle = document.getElementById('btn-angle-surf');
    if (btnAngle) btnAngle.classList.remove('active');

    var slZoom = document.getElementById('sl-zoom-surf');
    if (slZoom) slZoom.value = 1;
    var lblZoom = document.getElementById('lbl-zoom-surf');
    if (lblZoom) lblZoom.textContent = 1;

    _surfApplyZoom(); // recalcule pxPerCm (zoom remis à 1) + géométrie + programme le rebuild
    _updateSurfRatioReadout();
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation — appelée depuis ui.js → init()
// ══════════════════════════════════════════════════════════════════════

function initSurfaces() {
    initSurfDrag();
    _updateSurfRatioReadout();
    syncValeursSurfUI();
    syncSurfGraphUI();
}
