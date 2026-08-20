// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  tube.js — Rendu du canvas d'animation
//  Responsabilités : tube, membrane, particules, balises, sélection,
//  splitter draggable, resize.
//  Dépend de : sim.js (sim, waveDisplacement, particleRadius, initCols,
//               updateCelerite, C_BASE, K_DEFAULT, RHO_DEFAULT)
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Références canvas ─────────────────────────────────────────────────
var tubeCanvas = null;
var tubeCtx    = null;

// Épaisseur visuelle de la membrane dans le canvas (px)
var MEM_THICKNESS = 14;

// ── État de l'interaction souris sur le canvas tube ───────────────────
var tubeInter = {
    mode      : null,   // null | 'beacon1-drag' | 'beacon2-drag'
};

// ── Anti-rebond resize ────────────────────────────────────────────────
var tubeResizeRAF = false;

// ══════════════════════════════════════════════════════════════════════
//  resize — adapte le canvas et recalibrise la physique
// ══════════════════════════════════════════════════════════════════════

function resizeTube() {
    tubeCanvas = tubeCanvas || document.getElementById('tube-canvas');
    tubeCtx    = tubeCtx    || tubeCanvas.getContext('2d');

    var wrap = document.getElementById('tube-canvas-wrap');
    var w    = wrap.clientWidth;
    var h    = wrap.clientHeight;
    if (w < 10 || h < 28) return;  // tubeH = h*0.88-4 ≥ 20 requiert h ≥ 28

    var dpr = window.devicePixelRatio || 1;
    tubeCanvas.width  = Math.round(w * dpr);
    tubeCanvas.height = Math.round(h * dpr);
    tubeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // ── Géométrie interne du tube ─────────────────────────────────────
    var marginH      = 13;   // 5 px de plus de chaque côté → labels règle non croppés
    var marginTop    = 4;
    var marginBottom = Math.round(h * 0.12);
    sim.tubeLeft   = marginH + MEM_THICKNESS;
    sim.tubeRight  = w - marginH;
    sim.tubeTop    = marginTop;
    sim.tubeBottom = Math.max(sim.tubeTop + 20, h - marginBottom);
    sim.tubeLength = sim.tubeRight - sim.tubeLeft;

    // ── Calibration de C_BASE ─────────────────────────────────────────
    // c_sim (px/s) doit être EXACTEMENT la conversion en pixels de c_cms,
    // sans quoi tout ce qui exprime une longueur d'onde en pixels — au
    // premier rang la flèche λ — est faux d'un facteur constant :
    //
    //     c_sim = c_cms × (L_px / L_cm)
    //           = c_norm × C_DISPLAY_FACTOR × L_px / TUBE_LENGTH_CM
    //   ⟹ C_BASE = C_DISPLAY_FACTOR × L_px / TUBE_LENGTH_CM = L_px / 4
    //
    // La formule employée jusqu'ici, L_px / (2 × √(K_DEFAULT/RHO_DEFAULT)),
    // ne donnait cette valeur que par coïncidence : elle suppose
    // √(K_DEFAULT/RHO_DEFAULT) = 2, ce qui n'était vrai qu'avec K_DEFAULT = 4.
    // Passer K_DEFAULT à 6 a donc raccourci la flèche λ d'un facteur
    // √6/2 ≈ 1,22, dans TOUS les modes de source. La propagation, elle,
    // n'était pas touchée : elle se calcule en centimètres, via c_cms.
    //
    // Écrite ainsi, la calibration ne dépend plus d'aucune valeur par défaut.
    // Le temps de traversée du tube en découle (4/c_norm, soit ~1,6 s aux
    // réglages par défaut) au lieu d'être imposé.
    C_BASE = C_DISPLAY_FACTOR * sim.tubeLength / TUBE_LENGTH_CM;

    // ── Amplitude de la membrane ──────────────────────────────────────
    // Calibrée sur dx0 à ρ=1 pour un ratio A/dx0 ≈ 7.5 constant,
    // quelle que soit la taille de la fenêtre.
    var nColsRho1    = Math.max(15, Math.round(sim.tubeLength / 9));
    var dx0Rho1      = sim.tubeLength / nColsRho1;
    sim.memAmplitude = Math.max(27, Math.min(90, dx0Rho1 * 7.5));

    // ── Positions des balises ──────────────────────────────────────────
    // Recalculées depuis frac (position relative) pour rester à distance
    // constante de la membrane quelle que soit la largeur du canvas.
    sim.beacon1.x = sim.tubeLeft + sim.tubeLength * sim.beacon1.frac;
    sim.beacon2.x = sim.tubeLeft + sim.tubeLength * sim.beacon2.frac;

    // ── Position de la flèche de longueur d'onde ──────────────────────
    sim.lambdaX = sim.tubeLeft + sim.tubeLength * sim.lambdaFrac;

    updateCelerite();
    initCols();
}

function scheduleResizeTube() {
    if (tubeResizeRAF) return;
    tubeResizeRAF = true;
    requestAnimationFrame(function() {
        tubeResizeRAF = false;
        resizeTube();
        resizeCorde();
        if (typeof resizeVagues === 'function') resizeVagues();
        resizeGraph();
    });
}

// ══════════════════════════════════════════════════════════════════════
//  Échelle de la colonne source
// ══════════════════════════════════════════════════════════════════════
// Sur petite fenêtre, la box source et le chronomètre étaient hors de
// proportion avec le canvas, se faisaient rogner en haut et en bas, et
// imposaient au splitter un plancher qui bornait d'autant la zone graphe.
//
// Ils sont donc réduits par un `transform: scale(var(--src-s))` posé sur
// #source-col (cf. style.css), avec une largeur de mise en page fixe. Deux
// conséquences qui font tout l'intérêt de ce choix :
//   — la hauteur naturelle de la colonne ne dépend pas du facteur, donc
//     l'échelle qui la fait tenir se calcule exactement, en une division ;
//   — rien ne peut être oublié : le facteur porte sur la boîte entière, et
//     non sur chaque taille de police ou marge prise séparément.
//
// L'échelle se calcule sur la hauteur MESURÉE de #anim-area, jamais sur celle
// du viewport : tirer le splitter change la première sans toucher la seconde.
// Elle vaut exactement 1 dès que tout tient sans réduction — l'aspect grand
// écran est alors celui d'origine au pixel près.

var SRC_S_MIN     = 0.50;   // échelle minimale ; en dessous, la colonne est retirée
var SRC_S_NOTITLE = 0.85;   // sous cette échelle, le titre « Source » est masqué

// Part maximale de la row 2 que la box source peut occuper. C'est le réglage
// qui gouverne les deux symptômes à la fois : en dessous de cette part elle ne
// peut pas être rognée, et au-delà elle rapetisse au lieu de paraître énorme
// face au canvas. Sur grand écran la box occupe environ 35 % de la row : le
// facteur y vaut donc 1, sans rien changer à l'aspect d'origine.
var SRC_MAX_FILL = 0.55;

var _srcScaleCur = 1;       // dernière échelle appliquée
var _srcGoneCur  = false;   // colonne source retirée ?

// Hauteurs naturelles (échelle 1) de la colonne source, avec et sans le titre
// « Source », et du chronomètre marge comprise. Elles ne dépendent pas du
// facteur — la largeur de mise en page est fixe — mais de la largeur de la
// colonne, de l'onglet et des clamp() en vw : d'où la mémoïsation par
// largeur + onglet + largeur de fenêtre. Lire offsetHeight force le reflow,
// donc les valeurs correspondent bien à l'état écrit juste avant.
var _srcNat = { key: '', full: 0, noTitle: 0, chrono: 0 };

function _sourceNatural(animArea) {
    var srcCol = document.getElementById('source-col');
    var tab    = (typeof activeTab !== 'undefined') ? activeTab : '';
    var chrono = document.getElementById(tab === 'corde' ? 'chrono-corde' : 'chrono-son');
    if (!srcCol) return _srcNat;

    var key = Math.round(animArea.getBoundingClientRect().width) + '|' +
              (typeof activeTab !== 'undefined' ? activeTab : '') + '|' +
              Math.round(window.innerWidth);
    if (_srcNat.key === key) return _srcNat;

    var hadTiny   = animArea.classList.contains('src-tiny');
    var hadHidden = animArea.classList.contains('src-hidden');

    // La mesure doit impérativement se faire colonne AFFICHÉE : masquée, elle
    // mesurerait 0, ce qui la ferait juger « tient partout » et donc réafficher
    // — puis remasquer au calcul suivant, indéfiniment.
    animArea.classList.remove('src-hidden');

    animArea.classList.remove('src-tiny');
    var full = srcCol.offsetHeight;

    animArea.classList.add('src-tiny');
    var noTitle = srcCol.offsetHeight;

    var chronoH = 0;
    if (chrono && chrono.offsetParent !== null) {
        var mb  = parseFloat(getComputedStyle(chrono).marginBottom) || 0;
        chronoH = chrono.offsetHeight + mb;
    }

    animArea.classList.toggle('src-tiny',   hadTiny);
    animArea.classList.toggle('src-hidden', hadHidden);

    _srcNat = { key: key, full: full, noTitle: noTitle, chrono: chronoH };
    return _srcNat;
}

// Échelle à retenir pour une colonne de hauteur naturelle H, dans une zone
// d'animation de hauteur animH. Renvoie { s, gone } : l'échelle, et si la
// colonne doit être retirée faute de tenir à cette échelle.
//
// La grid de #anim-area a deux rows : row1 = auto (hauteur des boutons
// balises), row2 = 1fr. La box source est centrée dans row2 ; le chronomètre
// est posé juste au-dessus, en absolu, et peut déborder dans row1 — côté
// colonne 1 celle-ci ne contient que #anim-source-spacer, qui est vide.
//
// Deux temps, et c'est ce qui rend la règle simple à énoncer :
//
//   1. l'échelle voulue — proportionnée à la place (SRC_MAX_FILL), jamais
//      au-dessus de 1, et jamais en dessous de SRC_S_MIN, qui est un vrai
//      minimum : en dessous, la colonne n'est plus ni lisible ni cliquable ;
//   2. tient-elle à cette échelle ? Deux conditions, sans quoi elle dépasserait
//      de la zone et se ferait rogner :
//        (a) box :    H·s ≤ row2H
//        (b) chrono : B·s ≤ btnH + (row2H − H·s)/2
//      Si non, `gone`.
function _srcFitFor(animH, btnH, H, B) {
    var row2H = animH - btnH;
    if (H <= 0)     return { s: 1, gone: false };   // Vagues : pas de colonne
    if (row2H <= 0) return { s: SRC_S_MIN, gone: true };

    var s    = Math.min(1, Math.max(SRC_MAX_FILL * row2H / H, SRC_S_MIN));
    var gone = (H * s > row2H) ||
               (B > 0 && B * s > btnH + (row2H - H * s) / 2);

    return { s: s, gone: gone };
}

// Hauteur d'#anim-area à partir de laquelle la colonne source (sans son
// titre — c'est la version qui compte près du seuil) tient encore à
// SRC_S_MIN. Résolution analytique des deux mêmes contraintes que
// _srcFitFor, prises à s = SRC_S_MIN : c'est la branche qui s'applique
// effectivement au voisinage du seuil, puisque le terme de proportion
// (SRC_MAX_FILL) y est toujours inférieur au plancher.
function _srcMinAnimH(nat, btnH) {
    var H = nat.noTitle, B = nat.chrono;
    if (H <= 0) return -Infinity;   // Vagues : la colonne ne fait jamais loi

    var row2Min = Math.max(H * SRC_S_MIN,
                           2 * B * SRC_S_MIN - 2 * btnH + H * SRC_S_MIN);
    return btnH + row2Min;
}

function _srcBtnH() {
    var topBtns = document.getElementById('tube-top-btns');
    return topBtns ? topBtns.offsetHeight : 36;
}

// Hauteur d'#anim-area en dessous de laquelle la zone n'a plus rien
// d'exploitable à montrer — et c'est LE SEUL seuil de toute la zone
// d'animation : boîte et canvas s'escamotent ensemble, exactement à cette
// hauteur, jamais l'un avant l'autre.
//
// C'est le point qui a fait défaut aux versions précédentes : la box source
// avait son propre seuil (issu de _srcFitFor) et le canvas le sien (une
// constante indépendante, la hauteur minimale du tube) — deux critères
// distincts, donc deux hauteurs de disparition différentes, avec une bande
// intermédiaire où l'un avait disparu et pas l'autre.
//
// Ici, le seuil est le plus haut des deux besoins :
//   — le tube doit rester dessinable (rangée des boutons balises + 28 px,
//     cf. _minUsefulAnimHeight) ;
//   — la colonne source doit tenir à SRC_S_MIN (cf. _srcMinAnimH).
// En pratique c'est presque toujours la colonne source qui est la plus
// exigeante des deux ; le max garde le calcul correct même si un onglet aux
// proportions différentes inversait un jour ce constat.
function _animHideThreshold(animArea) {
    var nat  = _sourceNatural(animArea);
    var btnH = _srcBtnH();
    return Math.max(_minUsefulAnimHeight(btnH), _srcMinAnimH(nat, btnH));
}

// Applique l'échelle correspondant à la place disponible.
function _applySourceScale() {
    var animArea = document.getElementById('anim-area');
    if (!animArea) return;
    var h = animArea.getBoundingClientRect().height;
    if (h <= 0) return;   // zone masquée : on garde l'état courant

    var nat  = _sourceNatural(animArea);
    var btnH = _srcBtnH();

    // En dessous du seuil unifié, la box est retirée avec le reste de la
    // zone — sans même tester _srcFitFor : c'est le même critère qui a déjà
    // décidé, en amont, de la hauteur d'#anim-area (cf. _snapAnimHeight).
    // Le test de repli ci-dessous (fit.gone) ne couvre que le cas où
    // #anim-area a atteint cette hauteur par un autre chemin que le snap —
    // la répartition par défaut de clearSplitSizes, en zone très exiguë.
    var gone = h < _animHideThreshold(animArea);
    var s, hide;

    if (gone) {
        s = SRC_S_MIN;
        hide = true;
    } else {
        // Titre visible d'abord. S'il faut descendre sous le seuil — ou si
        // la colonne ne tient pas —, on le masque et on recalcule :
        // récupérer sa hauteur peut suffire à faire tenir le reste, et vaut
        // mieux que de tout retirer.
        var fit = _srcFitFor(h, btnH, nat.full, nat.chrono);
        hide    = (fit.gone || fit.s < SRC_S_NOTITLE) && nat.noTitle < nat.full;
        if (hide) fit = _srcFitFor(h, btnH, nat.noTitle, nat.chrono);

        s    = fit.s;
        gone = fit.gone;   // filet de sécurité, cf. commentaire ci-dessus
    }

    animArea.style.setProperty('--src-s', s.toFixed(3));
    animArea.classList.toggle('src-tiny', hide && !gone);
    animArea.classList.toggle('src-hidden', gone);

    // La largeur de la colonne source suit l'échelle, et tombe à zéro quand
    // elle est retirée : le canvas change donc de largeur, et doit être
    // redessiné.
    if (Math.abs(s - _srcScaleCur) > 0.002 || gone !== _srcGoneCur) {
        _srcScaleCur = s;
        _srcGoneCur  = gone;
        scheduleResizeTube();
    }
}

// Rangée des boutons balises, plus les 28 px sans lesquels le tube n'est plus
// dessinable (tubeH = row2H·0,88 − 4 ≥ 20). Un des deux besoins combinés par
// _animHideThreshold — voir ce commentaire pour le pourquoi de l'unification.
function _minUsefulAnimHeight(btnH) {
    return Math.ceil(btnH + 28);
}

// Hauteur retenue pour la zone d'animation : bornée par le maximum, et
// escamotée d'un coup sous le seuil unifié (cf. _animHideThreshold) — jamais
// la box source seule, jamais le canvas seul.
function _snapAnimHeight(animH, bounds) {
    if (animH < bounds.hideBelow) return 0;
    return Math.min(bounds.maxAnim, animH);
}

// Suit la taille de #anim-area : elle change au resize de la fenêtre, au drag
// du splitter et au masquage du graphe (onglet Corde), sans qu'aucun de ces
// chemins n'ait à penser à l'échelle.
// Pas de boucle de rétroaction possible : la taille de #anim-area est imposée
// par le flex (ou par le style inline du drag), jamais par son contenu.
(function initSourceScale() {
    function init() {
        var animArea = document.getElementById('anim-area');
        if (!animArea) return;
        _applySourceScale();
        if (typeof ResizeObserver === 'function') {
            new ResizeObserver(_applySourceScale).observe(animArea);
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// ══════════════════════════════════════════════════════════════════════
//  Répartition animation / graphe (position du splitter)
// ══════════════════════════════════════════════════════════════════════
// La position réglée par l'utilisateur est mémorisée sous forme de FRACTION
// de l'espace partageable (hauteur de #left-col moins les 6 px du splitter)
// revenant à #anim-area, et appliquée en flex-grow : elle survit ainsi au
// redimensionnement de la fenêtre, au masquage du graphe (onglet Corde) et
// au rechargement de la page.
// Les hauteurs en pixels ne servent que pendant le drag lui-même.

var SPLIT_KEY  = 'ondes.splitFrac';
var splitFrac  = null;   // null = répartition par défaut (flex 3 / 2)

// Distance de drag (px) qui suffit à faire réapparaître la zone d'animation
// depuis l'état escamoté, quelle que soit la valeur — potentiellement bien
// plus grande — du seuil de réapparition (cf. le pointermove d'initSplitter).
var REVEAL_GRAB_PX = 24;

function _loadSplitFrac() {
    try {
        var v = parseFloat(localStorage.getItem(SPLIT_KEY));
        // 0 est une valeur légitime : zone d'animation escamotée, graphe sur
        // toute la colonne. `parseFloat` d'une clé absente donne NaN, que les
        // deux comparaisons rejettent.
        return (v >= 0 && v <= 0.95) ? v : null;
    } catch (e) {
        return null;   // stockage indisponible (navigation privée, fichier local)
    }
}

function _saveSplitFrac(f) {
    try { localStorage.setItem(SPLIT_KEY, f.toFixed(4)); } catch (e) {}
}

// Fraction par défaut (part de #anim-area) correspondant au ratio CSS
// d'origine flex 3/2, soit 40 % pour #graph-area. Appelée à l'activation du
// bouton "Afficher graphe" (Son et Corde) : sans ça, un splitFrac mémorisé
// depuis un drag antérieur — sur N'IMPORTE QUEL onglet, la clé étant
// partagée — s'appliquerait tel quel et pourrait donner un graphe minuscule.
var SPLIT_FRAC_DEFAULT = 0.6;

function _resetSplitFracToDefault() {
    splitFrac = SPLIT_FRAC_DEFAULT;
    _saveSplitFrac(splitFrac);
}

// Bornes du splitter, dans l'état courant du DOM.
// Renvoie null si la colonne gauche n'est pas mesurable.
function _splitBounds() {
    var leftCol  = document.getElementById('left-col');
    var animArea = document.getElementById('anim-area');
    if (!leftCol) return null;

    var totalH    = leftCol.getBoundingClientRect().height;
    var splitterH = 6;
    var minGraph  = 60;

    return {
        total:     totalH,
        avail:     totalH - splitterH,   // place réellement partageable
        hideBelow: animArea ? _animHideThreshold(animArea) : 0,
        maxAnim:   totalH - splitterH - minGraph
    };
}

// Pose ou retire .anim-collapsed sur #left-col : la zone d'animation
// escamotée met le splitter au ras du bord, sans rien en dessous pour le
// distinguer visuellement — la classe élargit sa zone cliquable vers le bas
// (cf. style.css), pour qu'il reste facile à attraper malgré la précision
// qu'exigerait un clic pile sur 6 px de haut.
function _setAnimCollapsed(collapsed) {
    var leftCol = document.getElementById('left-col');
    if (leftCol) leftCol.classList.toggle('anim-collapsed', collapsed);
}

// Rend la main à la répartition CSS par défaut (#anim-area flex 3,
// #graph-area flex 2).
function clearSplitSizes() {
    var animArea  = document.getElementById('anim-area');
    var graphArea = document.getElementById('graph-area');
    if (animArea)  { animArea.style.flex  = ''; animArea.style.height  = ''; }
    if (graphArea) { graphArea.style.flex = ''; graphArea.style.height = ''; }
    _setAnimCollapsed(false);
}

// Applique une fraction (part de l'espace partageable revenant à
// #anim-area), bornée par _splitBounds. À appeler après tout ce qui change
// la place disponible : resize de la fenêtre, bascule du graphe, changement
// d'onglet.
function applySplitFrac(frac) {
    var leftCol   = document.getElementById('left-col');
    var animArea  = document.getElementById('anim-area');
    var graphArea = document.getElementById('graph-area');
    if (!leftCol || !animArea || !graphArea) return;

    // Graphe masqué (onglets Son + Corde) : #anim-area doit occuper tout
    // #left-col. Une hauteur inline la figerait à sa valeur de drag et
    // laisserait une bande vide en dessous, là où le graphe était.
    if (frac === null ||
        leftCol.classList.contains('graph-hidden') ||
        document.documentElement.classList.contains('init-graph-hidden')) {
        clearSplitSizes();
        return;
    }

    var b = _splitBounds();
    if (!b || b.avail <= 0) return;
    // Colonne trop courte pour laisser au graphe son minimum : le partage
    // proportionnel par défaut reste le moins mauvais compromis.
    if (b.maxAnim <= 0) { clearSplitSizes(); return; }

    var animH = _snapAnimHeight(frac * b.avail, b);
    var f     = animH / b.avail;
    _setAnimCollapsed(animH === 0);

    // Répartition exprimée en flex-grow, et non en hauteurs : les deux zones
    // se partagent l'espace laissé par le splitter (flex: 0 0 6px) dans ce
    // rapport, quelle que soit la taille de la fenêtre. Rien à recalculer au
    // resize, et aucune dépendance à une hauteur de référence — un pixel ou
    // un pourcentage figé, eux, auraient dû être repris à chaque fois.
    animArea.style.height  = '';
    graphArea.style.height = '';
    animArea.style.flex    = f.toFixed(4) + ' 1 0%';
    graphArea.style.flex   = (1 - f).toFixed(4) + ' 1 0%';

    scheduleResizeTube();
}

// ══════════════════════════════════════════════════════════════════════
//  Splitter draggable (sépare #anim-area et #graph-area)
// ══════════════════════════════════════════════════════════════════════

(function initSplitter() {
    var splitter   = null;
    var animArea   = null;
    var graphArea  = null;
    var leftCol    = null;
    var dragging   = false;
    var startY     = 0;
    var startAnim  = 0;
    var bounds     = null;

    function init() {
        splitter  = document.getElementById('left-splitter');
        animArea  = document.getElementById('anim-area');
        graphArea = document.getElementById('graph-area');
        leftCol   = document.getElementById('left-col');
        if (!splitter) return;

        // Position mémorisée d'une session précédente. Appliquée telle
        // quelle : applySplitFrac se charge de la borner et de ne rien poser
        // si le graphe est masqué.
        splitFrac = _loadSplitFrac();
        if (splitFrac !== null) applySplitFrac(splitFrac);

        splitter.addEventListener('pointerdown', function(e) {
            dragging  = true;
            startY    = e.clientY;
            startAnim = animArea.getBoundingClientRect().height;
            // Pause la transition vagues si elle est en cours
            if (typeof simVagues !== 'undefined' && simVagues.transAnim && !simVagues.transAnim._pausedAt) {
                simVagues.transAnim._pausedAt = performance.now();
            }

            bounds = _splitBounds();

            splitter.setPointerCapture(e.pointerId);
            splitter.classList.add('dragging');
            e.preventDefault();
        });

        // Pendant le drag, les hauteurs sont posées en pixels : c'est le
        // suivi le plus direct du pointeur. La conversion en fraction n'a
        // lieu qu'au relâchement.
        window.addEventListener('pointermove', function(e) {
            if (!dragging || !bounds) return;
            requestAnimationFrame(function() {
                var dy       = e.clientY - startY;
                var totalH   = leftCol.getBoundingClientRect().height;
                var newAnim;

                if (startAnim < 1 && bounds.hideBelow > 0) {
                    // Repartir d'une zone escamotée est un cas à part. Suivre
                    // le pointeur au pixel près depuis 0 obligerait à glisser
                    // sur bounds.hideBelow (le seuil de réapparition, souvent
                    // 100-200 px) avant que quoi que ce soit ne bouge à
                    // l'écran — la zone paraît alors ne pas répondre. Un petit
                    // geste (REVEAL_GRAB_PX) suffit à la faire réapparaître
                    // d'un coup à sa taille utile minimale ; au-delà, le
                    // pointeur reprend le contrôle au pixel près, exactement
                    // comme _snapAnimHeight l'aurait fait sans discontinuité.
                    if (dy <= REVEAL_GRAB_PX) {
                        newAnim = 0;
                    } else {
                        newAnim = Math.min(bounds.maxAnim,
                                           bounds.hideBelow + (dy - REVEAL_GRAB_PX));
                    }
                } else {
                    // _snapAnimHeight escamote la zone d'animation dès qu'elle
                    // n'aurait plus rien d'exploitable à montrer : le graphe
                    // passe alors d'un coup à toute la colonne, sans bande
                    // résiduelle.
                    newAnim = _snapAnimHeight(Math.max(0, startAnim + dy), bounds);
                }

                var newGraph = totalH - 6 - newAnim;

                animArea.style.flex    = 'none';
                animArea.style.height  = newAnim  + 'px';
                graphArea.style.flex   = 'none';
                graphArea.style.height = newGraph + 'px';
                _setAnimCollapsed(newAnim === 0);
                scheduleResizeTube();
            });
        });

        window.addEventListener('pointerup', function() {
            if (!dragging) return;
            dragging = false;
            splitter.classList.remove('dragging');

            // Fige la position réglée sous forme de fraction de l'espace
            // partageable, puis la réapplique en flex-grow : les pixels du
            // drag ne survivraient pas au premier redimensionnement.
            var avail = leftCol.getBoundingClientRect().height - 6;
            if (avail > 0) {
                splitFrac = animArea.getBoundingClientRect().height / avail;
                _saveSplitFrac(splitFrac);
                applySplitFrac(splitFrac);
            }

            // Reprend la transition vagues en décalant startT de la durée de pause
            if (typeof simVagues !== 'undefined' && simVagues.transAnim && simVagues.transAnim._pausedAt) {
                simVagues.transAnim.startT += performance.now() - simVagues.transAnim._pausedAt;
                simVagues.transAnim._pausedAt = 0;
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// ══════════════════════════════════════════════════════════════════════
//  Dessin de la scène complète
// ══════════════════════════════════════════════════════════════════════

function drawTube() {
    tubeCanvas = tubeCanvas || document.getElementById('tube-canvas');
    tubeCtx    = tubeCtx    || tubeCanvas.getContext('2d');
    var ctx    = tubeCtx;
    var W      = tubeCanvas.clientWidth;
    var H      = tubeCanvas.clientHeight;

    if (!W || !H) return;

    // La normalisation visuelle (gain de lisibilité des colonnes) n'est plus
    // calculée ici : elle est propre à chaque échantillon émis et appliquée à
    // la lecture par waveDisplacementDisplay (cf. _sonDisplayGain dans sim.js).

    // ── Fond général ─────────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fdf8f0';
    ctx.fillRect(0, 0, W, H);

    // ── Fond intérieur du tube ────────────────────────────────────────
    // Deux fonds distincts, jamais superposés :
    //   • bouton « Colorier selon la pression » → palette pastel signée,
    //     qui code ΔP (compression ET détente) — cf. _drawTubePressureBg ;
    //   • sinon → voile bleu de densité, réservé aux fortes compressions,
    //     cf. _drawTubeDensityBg.
    // Dans les trois cas le remplissage part de la face RÉELLE de la
    // membrane et non de tubeLeft — cf. _sonTubeFillLeft.
    if (sim.pressureColorMode) {
        _drawTubePressureBg(ctx);
    } else if (sim.srcN === 0 || sonIsQuiet()) {
        // Rien n'a jamais été émis, ou la dernière onde a fini de traverser :
        // le voile serait nul partout, autant peindre à plat.
        var xf = _sonTubeFillLeft();
        ctx.fillStyle = TUBE_BG;
        ctx.fillRect(xf, sim.tubeTop,
                     sim.tubeRight - xf, sim.tubeBottom - sim.tubeTop);
    } else {
        _drawTubeDensityBg(ctx);
    }

    // ── Parois du tube (haut et bas) ─────────────────────────────────
    // Les bordures partent du bord gauche du canvas (x=0) pour couvrir
    // toute la plage de recul de la membrane. Le boîtier du haut-parleur
    // et la membrane sont dessinés par-dessus et masquent la partie gauche.
    ctx.strokeStyle = '#3a4a5a';
    ctx.lineWidth   = 1.8;
    ctx.beginPath();
    // Paroi haute
    ctx.moveTo(0,              sim.tubeTop);
    ctx.lineTo(sim.tubeRight,  sim.tubeTop);
    // Paroi basse
    ctx.moveTo(0,              sim.tubeBottom);
    ctx.lineTo(sim.tubeRight,  sim.tubeBottom);
    ctx.stroke();

    // Extrémité droite : pas de fermeture — le tube est infini à droite.

    // ── Particules ────────────────────────────────────────────────────
    // Dessinées AVANT la membrane pour qu'elle les recouvre
    _drawParticles(ctx);

    // ── Membrane (haut-parleur) ───────────────────────────────────────
    // Dessinée APRÈS les particules pour les masquer derrière elle
    _drawMembrane(ctx);

    // ── Flèche de longueur d'onde ────────────────────────────────────
    _drawSonLambdaArrow(ctx);

    // ── Balises ───────────────────────────────────────────────────────
    _drawBeacons(ctx);

    // ── Règle graduée sous le tube ────────────────────────────────────
    _drawTubeRuler(ctx);
}

// ── Fond du tube colorié selon la pression ────────────────────────────
//
//  Dégradé continu via createLinearGradient : on calcule N points de ΔP,
//  on les convertit en couleur, puis on construit un gradient avec autant
//  de color-stops. Rendu nativement interpolé → parfaitement smooth, sans
//  bandes visibles même à haute fréquence.
//
//  Palette (teintes pastels d'origine) :
//    dp = 0  → orange pâle  rgb(252,220,180)  (pression normale)
//    dp = +1 → rose pâle    rgb(250,185,180)  (surpression / compression)
//    dp = −1 → jaune pâle   rgb(252,245,185)  (dépression / raréfaction)

var TUBE_BG = '#f7f3ec';

var N_PRESSURE_BANDS = 300;

// ── Bord gauche du fond intérieur ─────────────────────────────────────
//  Quand la membrane recule, elle laisse entre sa face et tubeLeft une bande
//  qui appartient bel et bien à l'intérieur du tube. Peindre à partir de
//  tubeLeft y laissait apparaître le fond général du canvas — c'était la
//  bande blanche visible en mode pression (invisible en mode normal, les
//  deux crèmes étant presque identiques). On peint donc depuis la face
//  réelle de la membrane. Vers la droite rien à étendre : la membrane
//  recouvre ce qu'elle avance.
function _sonTubeFillLeft() {
    return sim.tubeLeft + Math.min(0, _sonMembraneDisp());
}

// ── ΔP pour le fond, échantillonné à l'abscisse écran ─────────────────
//  x_px est mesuré depuis tubeLeft, et devient donc NÉGATIF dans la bande
//  que la membrane vient de découvrir. Il faut y ramener l'échantillonnage
//  en x = 0 : waveDeltaP est une différence finie, et pour un x négatif ses
//  deux points de calcul, u(x−h) et u(x+h), tombent tous deux au-delà du
//  dernier échantillon émis. _srcSampleAtS les écrête alors à la MÊME
//  valeur, et leur différence vaut exactement zéro.
//
//  Ce zéro produisait une bande neutre large de |disp| − h, soit près de
//  20 px, plaquée contre la membrane et d'autant plus visible que
//  l'excursion était grande — donc précisément aux très grandes longueurs
//  d'onde. Écrêter x à 0 y met la pression de la face de la membrane, ce
//  qui est aussi la valeur juste : ce fluide est celui que la membrane
//  vient d'emmener avec elle, il est dans son état de compression.
function _sonBgDeltaP(x_px) {
    return waveDeltaP(x_px > 0 ? x_px : 0, sim.simTime);
}

function _drawTubePressureBg(ctx) {
    var L    = sim.tubeLength;
    var yTop = sim.tubeTop;
    var h    = sim.tubeBottom - yTop;
    if (L <= 0 || h <= 0) return;

    // Couleur neutre (dp = 0) : orange pâle
    var r0 = 252, g0 = 220, b0 = 180;
    // Compression (dp = +1) : rose pâle
    var rP = 250, gP = 185, bP = 180;
    // Dépression (dp = −1) : jaune pâle
    var rN = 252, gN = 245, bN = 185;

    var xLeft  = _sonTubeFillLeft();
    var xRight = sim.tubeLeft + L;

    // Construire le gradient linéaire horizontal
    var grad = ctx.createLinearGradient(xLeft, 0, xRight, 0);
    var span = xRight - xLeft;

    for (var i = 0; i <= N_PRESSURE_BANDS; i++) {
        var frac = i / N_PRESSURE_BANDS;
        // x_px est mesuré depuis tubeLeft (origine de l'onde) ; il est
        // négatif dans la bande découverte par la membrane — cf. _sonBgDeltaP.
        var x_px = xLeft - sim.tubeLeft + frac * span;
        var dp   = Math.max(-1, Math.min(1, _sonBgDeltaP(x_px)));

        var r, g, b;
        if (dp >= 0) {
            r = Math.round(r0 + dp * (rP - r0));
            g = Math.round(g0 + dp * (gP - g0));
            b = Math.round(b0 + dp * (bP - b0));
        } else {
            var t = -dp;
            r = Math.round(r0 + t * (rN - r0));
            g = Math.round(g0 + t * (gN - g0));
            b = Math.round(b0 + t * (bN - b0));
        }

        grad.addColorStop(frac, 'rgb(' + r + ',' + g + ',' + b + ')');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(xLeft, yTop, span, h);
}

// ── Voile bleu de densité (fond permanent) ────────────────────────────
//
//  Un halo dans la COULEUR DES PARTICULES sous les zones de forte
//  compression. Il ne code pas une grandeur de plus : il redit ce que les
//  particules disent déjà — « il y a du monde ici » — mais en aplat, donc
//  lisible d'un coup d'œil et sans légende à apprendre. C'est aussi pour
//  cela qu'il est UNILATÉRAL : ne teinter que les compressions laisse les
//  détentes se lire d'elles-mêmes comme les zones restées claires, au lieu
//  d'introduire un second code couleur concurrent.
//
//  Réservé aux fortes compressions (au-delà du genou), pour rester un
//  renfort et non un fond permanent qui écraserait le nuage.
//
//  Le genou est ADOUCI (smoothstep) et non un simple seuil : un seuil franc
//  sur un champ continu crée des bords nets qui glissent le long du tube au
//  passage de l'onde, et cela se voit comme un artefact de rendu.
//
//  À noter : waveDeltaP est normalisée sur l'amplitude PHYSIQUE et non sur
//  le gain d'affichage. Le voile SE DÉCLENCHE donc à pleine force même aux
//  basses fréquences, là où le plafond de sonMaxDisplayPx() bride le
//  mouvement visible et où le regroupement des particules est le moins net.
//
//  Se déclencher n'est pas se doser, et la nuance a longtemps masqué le
//  défaut : le voile s'allumait bien aux basses fréquences, mais à sa teinte
//  MINIMALE, faute d'un dosage qui sache que le nuage y est en difficulté.
//  C'est ce que corrige l'arm de contraste plus bas.

//  Le dosage est délibérément timide : le voile doit se remarquer sans qu'on
//  le regarde, et surtout ne pas concurrencer le bleu des particules — deux
//  bleus d'intensité voisine se brouillent l'un l'autre et le nuage paraît
//  sale. Un premier réglage à 0,30 de teinte dès ΔP = 0,45 était nettement
//  trop appuyé.
//
//  ── Dosage adaptatif à la longueur d'onde ────────────────────────────
//  Mais « timide » ne vaut que tant que les particules font le travail. Aux
//  petites longueurs d'onde elles ne le peuvent plus : à λ = 50 px une bande
//  de compression fait 25 px, soit deux espacements à peine (le grain vaut
//  ~10,6 px à ρ = 1) — on est à la limite de résolution du nuage lui-même,
//  et aucun réglage d'amplitude n'y changera rien. Le voile, lui, est un
//  champ CONTINU : il résout parfaitement ces échelles.
//
//  On l'appuie donc légèrement à mesure que λ rétrécit — λ mesurée EN
//  ESPACEMENTS, puisque c'est au grain du nuage qu'elle doit se comparer et
//  que ce grain suit ρ (cf. les bornes plus bas). Le passage entre les deux
//  régimes est lissé (smoothstep), sans quoi le fond changerait visiblement
//  d'aspect au franchissement d'un seuil du curseur f.
//
//  ── Pourquoi le renfort reste modeste ────────────────────────────────
//  Un premier réglage montait à 0,42 de teinte avec un genou abaissé à 0,22,
//  pour élargir les bandes. Le résultat se dénonçait immédiatement comme un
//  ARTEFACT : un aplat de couleur uniforme ne ressemble pas à « beaucoup de
//  particules au même endroit », il ressemble à un rectangle peint, et
//  d'autant plus qu'on l'appuie. La limite est structurelle, pas une
//  question de dosage.
//
//  Le genou est donc maintenu HAUT même en régime serré : ne marquer que
//  les cœurs de compression donne des taches douces et isolées — un halo,
//  qui se lit comme un effet du milieu — là où un genou bas donnait des
//  bandes régulières, qui se lisent comme un décor.
var DENS_BLUE      = [42, 106, 170];  // #2a6aaa — la couleur des particules

// ── Bornes de l'arm de résolution, en GRAIN et non en pixels ──────────
//
//  Ces bornes ont d'abord été des pixels : 140 px « les particules
//  suffisent », 45 px « le voile porte tout ». Elles ont été calées sur ce
//  que le nuage savait montrer à ρ = 1 — donc sans le dire, elles étaient
//  déjà une mesure du GRAIN du nuage, mais figée à une seule valeur de ρ.
//
//  Or ce grain suit ρ : l'aire par particule vaut COL_SLOT_PX2/ρ, donc
//  l'espacement moyen vaut √(COL_SLOT_PX2/ρ) — 10,6 px à ρ = 1, mais 15,0 px
//  à ρ = 0,5 et 6,1 px à ρ = 3. Un nuage dense résout des bandes deux fois
//  plus fines qu'un nuage clairsemé, et des bornes en pixels absolus le
//  ignoraient : le voile s'appuyait autant sur un nuage qui n'en avait pas
//  besoin qu'il s'abstenait sur un nuage incapable de suivre.
//
//  Les bornes sont donc exprimées en ESPACEMENTS. Les valeurs reprennent
//  très exactement les anciennes à ρ = 1 (13,2 × 10,6 ≈ 140 px, 4,2 × 10,6
//  ≈ 45 px) : rien ne change au réglage par défaut, seule la réponse au
//  curseur ρ apparaît.
//
//  ── Pourquoi le grain et non le NOMBRE de particules par bande ───────
//  Le critère complet serait le comptage : une bande λ/2 × H contient
//  n = (λ/2)·H·ρ/COL_SLOT_PX2 particules, de bruit relatif 1/√n — ce qui
//  ferait aussi dépendre l'arm de la HAUTEUR du tube. On s'en garde, et pas
//  par paresse : la hauteur est déjà l'affaire de l'AUTRE arm, puisque
//  ak_disp ≤ 0,817·H/λ (cf. sonDisplayAkAt). Écraser le volet d'animation
//  fait donc déjà monter le renfort par la voie du contraste ; le faire
//  monter une seconde fois par la voie de la résolution le compterait deux
//  fois. Chaque arm sa variable : le contraste porte H, la résolution ρ.
var DENS_LAM_COMFY_SP = 13.2;         // espacements : au-delà, les particules suffisent
var DENS_LAM_TIGHT_SP = 4.2;          // ... en deçà, le voile porte tout
var DENS_KNEE_LO   = 0.55;            // seuil ΔP en régime confortable
var DENS_KNEE_HI   = 0.45;            // ... et en régime serré
var DENS_TINT_LO   = 0.14;            // teinte max en régime confortable
var DENS_TINT_HI   = 0.22;            // ... et en régime serré

// ── Le nuage échoue de DEUX façons, pas d'une ─────────────────────────
//
//  Le dosage ci-dessus ne connaissait que λ, et ne couvrait donc qu'une
//  moitié du problème. Les particules cessent d'être lisibles pour deux
//  raisons indépendantes, aux deux BOUTS de la plage de réglages :
//
//    • manque de RÉSOLUTION, aux petites λ — la bande de compression
//      devient comparable au grain du nuage. C'est l'arm historique,
//      mesurée sur λ (_densTightLam), et elle reste inchangée.
//    • manque de CONTRASTE, aux grandes λ — le déplacement affiché est
//      plafonné par la hauteur du tube (cf. sonDisplayAkAt), donc le
//      rapport de densité s'écrase. À f = 0,5 Hz il tombe à 1,17 : les
//      particules sont parfaitement résolues et ne montrent rien.
//
//  Le second cas n'était pas traité, et c'était le pire des deux : le
//  voile y restait à sa teinte minimale précisément là où il aurait dû
//  porter le plus. On dose donc sur le MAXIMUM des deux manques.
//
//  ── Pourquoi ça ne rend pas le fond plus visible ─────────────────────
//  L'arm de contraste est ancrée sur AK_MIN — la valeur en dessous de
//  laquelle le code considère déjà le contraste comme insuffisant. Elle ne
//  contribue donc RIEN aux réglages par défaut et au-dessus (ak_disp ≈
//  0,445 ≈ AK_MIN), et plafonne au même DENS_TINT_HI que l'arm de
//  résolution. L'intensité maximale du voile est inchangée : il devient
//  seulement atteignable dans un cas où il ne l'était pas.
//
//  ── Pourquoi la mesure est LOCALE ────────────────────────────────────
//  ak_disp est lu dans l'historique, à l'abscisse du color-stop. Si f a
//  bougé en cours de route, le tube contient des portions d'onde de nombres
//  d'onde différents : chacune reçoit alors le renfort qui lui manque, au
//  lieu d'un dosage global calé sur ce que la source émet en ce moment.
var DENS_AK_FULL   = AK_MIN;          // ak affiché au-delà duquel le nuage suffit
var DENS_AK_DEAD   = 0.12;            // ... et en deçà duquel il ne montre plus rien

function _smoothstep01(u) {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    return u * u * (3 - 2 * u);
}

// Espacement moyen des particules, en px : l'aire par particule vaut
// COL_SLOT_PX2/ρ (cf. initCols, même écrêtage de ρ).
function _densGrainPx() {
    return Math.sqrt(COL_SLOT_PX2 / Math.max(0.1, sim.rho));
}

// Manque de résolution : 0 = confortable, 1 = aussi serré que possible.
function _densTightLam() {
    var lam   = _sonFeaturePx() / _densGrainPx();   // λ, en espacements
    return _smoothstep01((DENS_LAM_COMFY_SP - lam) /
                         (DENS_LAM_COMFY_SP - DENS_LAM_TIGHT_SP));
}

// Manque de contraste affiché à l'abscisse courante : 0 = le nuage montre
// tout, 1 = il ne montre plus rien.
function _densTightAk(ak) {
    return _smoothstep01((DENS_AK_FULL - ak) / (DENS_AK_FULL - DENS_AK_DEAD));
}

function _drawTubeDensityBg(ctx) {
    var L    = sim.tubeLength;
    var yTop = sim.tubeTop;
    var h    = sim.tubeBottom - yTop;
    if (L <= 0 || h <= 0) return;

    // Fond neutre décomposé une fois (TUBE_BG = #f7f3ec)
    var r0 = 247, g0 = 243, b0 = 236;
    var rB = DENS_BLUE[0], gB = DENS_BLUE[1], bB = DENS_BLUE[2];

    var xLeft  = _sonTubeFillLeft();
    var xRight = sim.tubeLeft + L;
    var span   = xRight - xLeft;

    // ── Dosage ────────────────────────────────────────────────────────
    // L'arm de résolution ne dépend que de ce que la source émet : elle se
    // calcule une fois. L'arm de contraste est lue dans l'historique, donc
    // au color-stop (cf. plus haut).
    var tightLam = _densTightLam();

    // ── Finesse d'échantillonnage ─────────────────────────────────────
    // Le nombre de color-stops doit suivre λ : à 300 stops sur 900 px, une
    // λ de 55 px ne recevrait que 3 points par alternance et le dégradé
    // rendrait un moiré au lieu des bandes. On vise ~14 stops par λ, borné
    // pour que le coût reste stable — chaque stop coûte une remontée dans
    // l'historique pour waveDeltaP et une pour sonDisplayAkAt.
    var lam   = _sonFeaturePx();
    var nb    = N_PRESSURE_BANDS;
    if (lam > 0) {
        nb = Math.round(span / lam * 14);
        if (nb < N_PRESSURE_BANDS) nb = N_PRESSURE_BANDS;
        else if (nb > 1400)        nb = 1400;
    }

    var grad = ctx.createLinearGradient(xLeft, 0, xRight, 0);

    for (var i = 0; i <= nb; i++) {
        var frac = i / nb;
        // x_px est mesuré depuis tubeLeft (origine de l'onde) ; il est
        // négatif dans la bande découverte par la membrane — cf. _sonBgDeltaP.
        var x_px = xLeft - sim.tubeLeft + frac * span;
        var dp   = _sonBgDeltaP(x_px);

        // Manque local : le pire des deux (résolution / contraste affiché).
        // Même écrêtage de x que _sonBgDeltaP — dans la bande que la membrane
        // vient de découvrir, l'échantillon à lire est celui de sa face.
        var tightAk = _densTightAk(sonDisplayAkAt(x_px > 0 ? x_px : 0, sim.simTime));
        var tight   = (tightAk > tightLam) ? tightAk : tightLam;
        var knee    = DENS_KNEE_LO + tight * (DENS_KNEE_HI - DENS_KNEE_LO);
        var tint    = DENS_TINT_LO + tight * (DENS_TINT_HI - DENS_TINT_LO);

        var a = 0;
        if (dp > knee) {
            var u = (dp - knee) / (1 - knee);
            if (u > 1) u = 1;
            a = u * u * (3 - 2 * u) * tint;   // smoothstep
        }

        var r = Math.round(r0 + a * (rB - r0));
        var g = Math.round(g0 + a * (gB - g0));
        var b = Math.round(b0 + a * (bB - b0));

        grad.addColorStop(frac, 'rgb(' + r + ',' + g + ',' + b + ')');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(xLeft, yTop, span, h);
}

// ── Conversion ΔP → couleur RGB pour les particules ──────────────────
//
//  dp dans [-1, +1]
//  dp = 0  → orange foncé   rgb(200,100,20)   (pression normale)
//  dp = +1 → rouge foncé    rgb(170,30,15)    (compression)
//  dp = -1 → ocre/doré      rgb(190,150,10)   (dépression)
//  Couleurs sombres/saturées bien contrastées sur les fonds pastels.

function _dpToColor(dp) {
    var r0 = 200, g0 = 100, b0 =  20;   // orange foncé neutre
    var r, g, b;
    if (dp >= 0) {
        // → rouge foncé (compression)
        var t = Math.min(1, dp);
        r = Math.round(r0 + t * (170 - r0));
        g = Math.round(g0 + t * ( 30 - g0));
        b = Math.round(b0 + t * ( 15 - b0));
    } else {
        // → ocre doré (dépression)
        var t = Math.min(1, -dp);
        r = Math.round(r0 + t * (190 - r0));
        g = Math.round(g0 + t * (150 - g0));
        b = Math.round(b0 + t * ( 10 - b0));
    }
    return 'rgb(' + r + ',' + g + ',' + b + ')';
}

// ── Extrémité droite ouverte ──────────────────────────────────────────

function _drawOpenEnd(ctx) {
    var x  = sim.tubeRight;
    var y1 = sim.tubeTop;
    var y2 = sim.tubeBottom;
    var tick = 6;
    ctx.strokeStyle = '#3a4a5a';
    ctx.lineWidth   = 1.5;
    // Petites encoches symbolisant l'ouverture
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x + tick, y1 - tick * 0.5);
    ctx.moveTo(x, y2);
    ctx.lineTo(x + tick, y2 + tick * 0.5);
    ctx.stroke();
}

// ── Règle graduée sous le tube ────────────────────────────────────────
//
//  Dessinée dans la bande marginBottom (sim.tubeBottom → canvas bas).
//  x = 0 cm correspond à sim.tubeLeft (position de repos de la membrane).
//  Graduation identique au graphe ΔP(x) : même cmPerPx, même niceStep.
//  Ticks principaux (labels) + ticks secondaires à mi-pas.

function _drawTubeRuler(ctx) {
    var L = sim.tubeLength;
    if (L <= 0) return;

    var W        = tubeCanvas.clientWidth;
    var H        = tubeCanvas.clientHeight;
    var yBase    = sim.tubeBottom;           // ligne de base de la règle
    var yRoom    = H - yBase;               // hauteur disponible sous le tube
    if (yRoom < 6) return;

    var cmPerPx  = 40 / L;                  // 40 cm simulés sur L pixels
    var xMaxCm   = 40;

    // Même pas que le graphe : niceStep(40, 6) → 10 cm en général
    var range     = xMaxCm;
    var rough     = range / 6;
    var mag       = Math.pow(10, Math.floor(Math.log10(rough)));
    var mant      = rough / mag;
    var step      = mant < 1.5 ? mag : mant < 3.5 ? 2 * mag : mant < 7.5 ? 5 * mag : 10 * mag;

    var fontSize  = Math.max(13, Math.min(18, Math.round(yRoom * 0.75)));
    var tickMaj   = Math.min(yRoom * 0.40, 6);   // hauteur tick principal
    var tickMin   = tickMaj * 0.55;               // hauteur tick secondaire

    ctx.save();
    ctx.font         = fontSize + 'px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    // Ligne de base horizontale (depuis la membrane jusqu'à la fin du tube)
    ctx.strokeStyle = '#8a9aaa';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(sim.tubeLeft, yBase);
    ctx.lineTo(sim.tubeRight, yBase);
    ctx.stroke();

    // Ticks principaux et labels
    ctx.strokeStyle = '#5a6a78';
    ctx.lineWidth   = 1;
    ctx.fillStyle   = '#5a6a78';

    for (var cm = 0; cm <= xMaxCm + step * 0.01; cm += step) {
        var xc = sim.tubeLeft + cm / cmPerPx;
        if (xc > sim.tubeRight + 0.5) break;

        ctx.beginPath();
        ctx.moveTo(xc, yBase);
        ctx.lineTo(xc, yBase + tickMaj);
        ctx.stroke();

        // Label : "0" à l'origine, sinon valeur en cm
        var lbl = cm === 0 ? '0' : cm.toFixed(0);
        ctx.fillText(lbl, xc, yBase + tickMaj + 1);
    }

    // Ticks secondaires (mi-pas)
    ctx.strokeStyle = '#a0b0bc';
    ctx.lineWidth   = 0.8;
    var halfStep = step / 2;
    for (var cm2 = halfStep; cm2 <= xMaxCm + halfStep * 0.01; cm2 += step) {
        var xc2 = sim.tubeLeft + cm2 / cmPerPx;
        if (xc2 > sim.tubeRight + 0.5) break;
        ctx.beginPath();
        ctx.moveTo(xc2, yBase);
        ctx.lineTo(xc2, yBase + tickMin);
        ctx.stroke();
    }

    // Unité (en cm) à gauche de l'origine, avant la graduation 0
    if (yRoom >= 14) {
        ctx.fillStyle    = '#7a8a96';
        ctx.font         = Math.max(12, fontSize - 1) + 'px monospace';
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('cm', sim.tubeLeft - 8, yBase + tickMaj + 1);
    }

    ctx.restore();
}

// ── Membrane mobile ───────────────────────────────────────────────────

// Déplacement de la face de la membrane, en px.
//
//  RIGOUREUSEMENT le même que celui des particules : c'est la particule en
//  x0 = 0, ni plus ni moins. La membrane et le fluide qu'elle pousse restent
//  ainsi solidaires par construction.
//
//  L'ancien code prenait min(|uDisp|, |uPhys|) pour éviter que la membrane
//  soit « boostée » aux basses fréquences. Mais les particules, elles,
//  suivaient uDisp : quand le gain amplifiait, elles partaient à droite plus
//  loin que la membrane, ouvrant devant sa face un vide que rien ne peignait.
//  L'amplitude excessive qui motivait ce bridage est désormais traitée à sa
//  source, par le plafond de sonMaxDisplayPx() — qui s'applique au gain
//  d'affichage lui-même, donc au fluide ET à la membrane ensemble.
function _sonMembraneDisp() {
    return waveDisplacementDisplay(0, sim.simTime);
}

function _drawMembrane(ctx) {
    var disp = _sonMembraneDisp();

    // Corps de la membrane
    var mx    = sim.tubeLeft - MEM_THICKNESS + disp;
    var mh    = sim.tubeBottom - sim.tubeTop;
    var r     = 3;

    // Fond gradient membrane
    var grd   = ctx.createLinearGradient(mx, 0, mx + MEM_THICKNESS, 0);
    grd.addColorStop(0, '#6a7a8a');
    grd.addColorStop(0.6, '#4a5a6a');
    grd.addColorStop(1, '#3a4a5a');
    ctx.fillStyle = grd;

    ctx.beginPath();
    ctx.roundRect
        ? ctx.roundRect(mx, sim.tubeTop, MEM_THICKNESS, mh, [0, r, r, 0])
        : ctx.rect(mx, sim.tubeTop, MEM_THICKNESS, mh);
    ctx.fill();

    // Ligne de contact membrane / tube (face active)
    ctx.strokeStyle = '#90a0b0';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx + MEM_THICKNESS, sim.tubeTop);
    ctx.lineTo(mx + MEM_THICKNESS, sim.tubeBottom);
    ctx.stroke();

    // ── Boîtier du haut-parleur (zone à gauche de la membrane) ────────
    ctx.fillStyle = '#d4d0c8';
    ctx.fillRect(0, sim.tubeTop, mx, mh);
    ctx.strokeStyle = '#b0a898';
    ctx.lineWidth   = 1;
    ctx.strokeRect(0, sim.tubeTop, mx, mh);

    // Symbole "haut-parleur" stylisé
    var cx = mx * 0.5;
    var cy = sim.tubeTop + mh * 0.5;
    var s  = Math.min(mx * 0.3, mh * 0.18, 12);
    if (s > 3) {
        ctx.fillStyle = '#5a6a78';
        // Corps rectangulaire
        ctx.fillRect(cx - s * 0.5, cy - s * 0.4, s * 0.4, s * 0.8);
        // Cône
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.1, cy - s * 0.4);
        ctx.lineTo(cx + s * 0.6, cy - s * 0.8);
        ctx.lineTo(cx + s * 0.6, cy + s * 0.8);
        ctx.lineTo(cx - s * 0.1, cy + s * 0.4);
        ctx.closePath();
        ctx.fill();
    }
}

// ── Particules — modèle lagrangien continu ────────────────────────────
//
//  Chaque entrée de sim.cols est une parcelle de fluide avec :
//    • x0  : position de repos (px depuis tubeLeft), domaine [-extraLeft, L+extraRight]
//    • ry  : position y mémorisée (0..1), gelée en pause
//  Position affichée : px = tubeLeft + x0 + waveDisplacementDisplay(x0, t)
//
//  Les particules de la zone virtuelle droite (x0 > tubeLength) entrent
//  naturellement dans le tube quand l'onde crée une raréfaction à droite.
//  extraRight est dimensionné pour couvrir l'amplitude de déplacement max
//  (y compris le boost basse fréquence) — pas de zone blanche en bout de tube.
//  Le clip [memFace, tubeRight] × [tubeTop, tubeBottom] les masque sinon.
//
//  Deux passes (non-sélectionnées puis sélectionnées) pour minimiser
//  les changements de fillStyle.

// ── Agitation thermique ───────────────────────────────────────────────
//  Chaque particule garde SA hauteur, tirée une fois pour toutes à la
//  création (cols[i].ry) ; l'agitation n'est qu'une petite errance autour
//  d'elle (cols[i].wy, en px).
//
//  L'ancien code réaffectait ry = Math.random() à chaque frame. Ce n'était
//  pas une agitation thermique mais un ré-échantillonnage complet du nuage :
//  un scintillement à 60 Hz qui brouillait la lecture des zones de
//  compression et rendait impossible le suivi d'une particule — donc
//  l'essentiel de l'intérêt du bouton « Sélectionner des particules ».
//
//  Le terme de rappel (−w × WANDER_PULL) évite que la marche aléatoire
//  finisse par plaquer toutes les particules contre leurs bornes.
//
//  ── Calibration ──────────────────────────────────────────────────────
//  Une marche aléatoire de pas σ parcourt σ√n en n frames : le pas se
//  déduit donc de l'excursion voulue et du temps qu'on veut y mettre.
//  On vise ici l'excursion typique `wAmp` en une quinzaine de frames, soit
//  σ ≈ 0,26 × wAmp — assez vif pour que le gaz paraisse franchement agité,
//  mais avec des sauts de l'ordre du rayon d'une particule, donc perçus
//  comme un mouvement continu et non comme le scintillement d'avant.
//  L'écart-type stationnaire d'une marche rappelée vaut σ/√(2·pull), soit
//  ici ≈ 1,3 × wAmp ; WANDER_CLAMP borne les rares excursions au-delà.
//
//  ── L'errance est ISOTROPE ───────────────────────────────────────────
//  L'errance est à deux dimensions, comme une vraie agitation thermique —
//  purement verticale, elle donnait un effet de pluie. Elle a longtemps été
//  franchement ANISOTROPE : amplitude pleine en vertical, bridée à une
//  fraction de λ en horizontal, au motif que le vertical est « gratuit »
//  (déplacer une particule de haut en bas ne change rien à la densité lue
//  le long du tube) alors que l'horizontal « floute » la structure. Le
//  rapport atteignait 3:1 aux réglages par défaut, et 5:1 en haut de la
//  plage de fréquence.
//
//  Ça se voit. Une agitation trois fois plus ample en hauteur qu'en largeur
//  n'est pas lue comme de l'agitation thermique, elle est lue comme de la
//  pluie — l'œil est très sensible à l'anisotropie d'un mouvement brownien.
//
//  Et le motif ne tenait pas. Deux erreurs s'étaient superposées :
//
//    • « l'errance fabrique des amas parasites ». Non : chaque particule
//      erre INDÉPENDAMMENT de ses voisines. Une telle marche ne peut pas
//      créer d'amas, elle ne fait que FLOUTER. (Un déplacement indépendant
//      laisse d'ailleurs un processus de Poisson inchangé.)
//    • « le flou horizontal dissout les bandes ». Beaucoup moins qu'estimé :
//      sur une sinusoïde de longueur d'onde λ, une errance d'écart-type σ
//      réduit le contraste d'un facteur exp(−2π²σ²/λ²), soit 2 % seulement
//      à σ = λ/30 et 5 % à σ = λ/20. Le budget horizontal était bien plus
//      large que ce qu'on lui accordait.
//
//  Le réglage se pose donc à l'envers de l'ancien : UNE SEULE amplitude
//  pour les deux axes, fixée par un budget de flou explicite — σ ≤ λ/20,
//  soit wAmp ≤ λ/26 puisque σ ≈ 1,3 × wAmp. Aux réglages par défaut
//  (λ ≈ 367 px) la borne vaut 14 px et coïncide avec l'amplitude naturelle :
//  l'errance est exactement isotrope. Elle ne se resserre qu'en haut de la
//  plage de fréquence, là où λ devient petite — et le nuage s'y calme sur
//  les DEUX axes, ce qui est cohérent à l'œil et profite en prime à la
//  lecture des bandes, devenues fines.
//
//  L'errance n'entre pas dans la sélection, qui travaille sur x0.
var WANDER_PULL  = 0.02;   // rappel vers la position de repos
var WANDER_CLAMP = 2.5;    // borne dure, en multiples de wAmp
var WANDER_LAM   = 1 / 26; // budget de flou : wAmp ≤ λ/26, soit σ ≤ λ/20
var WANDER_MIN   = 2.5;    // px — plancher, pour que le gaz ne fige jamais

function _wanderAmp(H) {
    var base = Math.max(4.5, Math.min(14, H * 0.07));   // px
    return Math.max(WANDER_MIN,
                    Math.min(base, _sonFeaturePx() * WANDER_LAM));
}

// Taille caractéristique, en px, de ce que la source est en train d'émettre :
// la longueur d'onde en régime continu, l'étendue spatiale de l'impulsion
// sinon. Sert à borner tout ce qui ne doit pas brouiller la structure de
// l'onde. Bornée à la longueur du tube, faute de quoi une très basse
// fréquence donnerait une valeur sans rapport avec ce qui est affiché.
function _sonFeaturePx() {
    var lam;
    if (sim.sourceMode === 'impulse') lam = sim.c_sim * T_IMPULSE;
    else                              lam = (sim.freq > 0) ? sim.c_sim / sim.freq : 0;
    if (!(lam > 0)) lam = sim.tubeLength;
    return Math.min(lam, sim.tubeLength);
}

// step = largeur du tirage uniforme par frame (cf. calibration), max = borne
// dure. Les deux axes partagent les mêmes valeurs : l'errance est isotrope.
function _wander(c, step, max) {
    c.wy += (Math.random() - 0.5) * step - c.wy * WANDER_PULL;
    if      (c.wy >  max) c.wy =  max;
    else if (c.wy < -max) c.wy = -max;

    c.wx += (Math.random() - 0.5) * step - c.wx * WANDER_PULL;
    if      (c.wx >  max) c.wx =  max;
    else if (c.wx < -max) c.wx = -max;
}

// ── Rencontre d'une paroi : rebond, pas écrasement ────────────────────
//
//  L'errance verticale a un écart-type stationnaire de 1,3 × wAmp, soit
//  jusqu'à 18 px. Sur une bande utile de 200 px, une particule sur cinq
//  environ sort donc de la bande à un instant donné. Les ÉCRASER sur yMin
//  ou yMax — ce que faisait un simple clamp — ne les fait pas disparaître :
//  ça les EMPILE, exactement sur deux droites. Le tube se bordait ainsi de
//  deux liserés sombres, permanents et insensibles à ΔP, qui prenaient une
//  part appréciable de l'encre disponible tout en ne disant rien de l'onde.
//  Autant d'encre en moins pour les compressions, et un cadre visuel qui
//  attire l'œil hors de la zone où il faudrait le porter.
//
//  Le repliement rend la position à l'intérieur de la bande au lieu de la
//  coller au bord. C'est aussi la bonne image physique : une molécule qui
//  atteint la paroi rebondit, elle ne s'y colle pas.
//
//  Le repliement est ITÉRÉ (triangle) et non appliqué une seule fois : une
//  bande étroite — volet d'animation très écrasé — peut être plus courte
//  que l'excursion, et un repli unique ressortirait alors de l'autre côté.
function _foldY(py, yMin, yMax) {
    var span = yMax - yMin;
    if (span <= 0) return yMin;
    var t = (py - yMin) % (2 * span);
    if (t < 0) t += 2 * span;
    return yMin + (t <= span ? t : 2 * span - t);
}

function _drawParticles(ctx) {
    var N = sim.cols.length;
    if (N === 0) return;

    var H = sim.tubeBottom - sim.tubeTop;
    var r = particleRadius();

    // ── Paramètres d'errance de la frame (cf. calibration ci-dessus) ──
    // Un seul jeu de valeurs : l'errance est isotrope, le bornage par λ est
    // déjà intégré à _wanderAmp.
    var wAmp   = _wanderAmp(H);
    var wStep  = 0.90 * wAmp;              // → σ ≈ 0,26 × wAmp par frame
    var wMax   = wAmp * WANDER_CLAMP;
    var moving = !sim.paused;

    // Bande utile : ry ∈ [0,1] est réparti entre les deux parois, en gardant
    // le rayon du point de chaque côté. L'errance est ramenée dans la bande
    // À L'AFFICHAGE (yMin/yMax, par repliement — cf. _foldY) plutôt qu'en lui
    // réservant sa place dans la bande : lui réserver l'excursion maximale
    // aurait laissé le gaz flotter entre deux marges vides, alors qu'une
    // particule a le droit d'aller toucher la paroi.
    var yPad  = r;
    var yBand = Math.max(0, H - 2 * yPad);
    var yMin  = sim.tubeTop + r;
    var yMax  = sim.tubeBottom - r;

    // Clipping : on laisse les particules déborder légèrement à gauche de tubeLeft
    // (zone virtuelle gauche). La membrane, dessinée par-dessus, masque proprement
    // tout ce qui est derrière elle — pas besoin d'un clip serré sur sa face.
    var memFace  = sim.tubeLeft - sim.memAmplitude;
    var clipWidth = sim.tubeRight - memFace;
    ctx.save();
    ctx.beginPath();
    ctx.rect(memFace, sim.tubeTop, clipWidth, H);
    ctx.clip();

    if (sim.pressureColorMode) {
        // ── Mode pression : chaque particule colorée selon ΔP ────────
        // Une seule passe : affichage couleur ΔP uniquement,
        // pas de contour blanc pour les sélectionnées (trop visuellement chargé).
        for (var i = 0; i < N; i++) {
            var c  = sim.cols[i];
            var x0 = c.x0;
            var u  = waveDisplacementDisplay(x0, sim.simTime);

            if (moving) _wander(c, wStep, wMax);
            var px = sim.tubeLeft + x0 + u + c.wx;
            var py = sim.tubeTop + yPad + c.ry * yBand + c.wy;
            if (py < yMin || py > yMax) py = _foldY(py, yMin, yMax);

            // Remplissage couleur ΔP
            var dp = waveDeltaP(x0, sim.simTime);
            ctx.fillStyle = _dpToColor(dp);
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
        }
    } else {
        // ── Mode normal : deux passes groupées (bleu / rouge) ────────
        var COLORS = ['#2a6aaa', '#b04020'];

        for (var pass = 0; pass < 2; pass++) {
            var wantSelected = (pass === 1);
            ctx.fillStyle = COLORS[pass];
            ctx.beginPath();

            for (var i = 0; i < N; i++) {
                var c = sim.cols[i];
                if (c.selected !== wantSelected) continue;

                var x0 = c.x0;
                var u  = waveDisplacementDisplay(x0, sim.simTime);

                // Agitation thermique : errance 2D autour de la position de
                // repos, figée en pause (cf. _wander).
                if (moving) _wander(c, wStep, wMax);
                var px = sim.tubeLeft + x0 + u + c.wx;
                var py = sim.tubeTop + yPad + c.ry * yBand + c.wy;
                if (py < yMin || py > yMax) py = _foldY(py, yMin, yMax);

                ctx.moveTo(px + r, py);     // moveTo évite les lignes parasites entre arcs
                ctx.arc(px, py, r, 0, Math.PI * 2);
            }
            ctx.fill();
        }
    }

    ctx.restore();
}

// ── Balises ───────────────────────────────────────────────────────────

function _drawBeacons(ctx) {
    if (sim.beacon1.active) _drawOneBeacon(ctx, sim.beacon1.x, '#e07020', 'B1');
    if (sim.beacon2.active) _drawOneBeacon(ctx, sim.beacon2.x, '#2a8a50', 'B2');
}

function _drawOneBeacon(ctx, x, color, label) {
    var y1    = sim.tubeTop;
    var y2    = sim.tubeBottom;
    var fSize = Math.max(11, Math.round((y2 - y1) * 0.13));

    // Ligne verticale en pointillés
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 3;
    ctx.setLineDash([6, 4]);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Étiquette au-dessus du tube
    ctx.fillStyle    = color;
    ctx.font         = 'bold ' + fSize + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, x, y1 - 2);

    // Poignée de drag (losange)
    ctx.save();
    ctx.fillStyle   = color;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(x,       y1 - fSize * 0.3);
    ctx.lineTo(x + 6,   y1 + 4);
    ctx.lineTo(x,       y1 + 8);
    ctx.lineTo(x - 6,   y1 + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ── Label de position sur la règle graduée ────────────────────────
    // Converti en cm (même échelle que la règle : 40 cm sur tubeLength px)
    var L = sim.tubeLength;
    if (L <= 0) return;
    var cmPerPx  = 40 / L;
    var xCm      = (x - sim.tubeLeft) * cmPerPx;
    var W        = tubeCanvas.clientWidth;
    var H        = tubeCanvas.clientHeight;
    var yRoom    = H - y2;
    if (yRoom < 6) return;

    var fontSize  = Math.max(13, Math.min(18, Math.round(yRoom * 0.75)));
    var tickMaj   = Math.min(yRoom * 0.40, 6);

    ctx.save();
    ctx.fillStyle    = color;
    ctx.font         = 'bold ' + fontSize + 'px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(fmtFR(xCm, 1), x, y2 + tickMaj + 1);
    ctx.restore();
}

// ── Flèche de longueur d'onde (Son) ────────────────────────────────────
//  Uniquement pertinente en Sinusoïdale / Périodique (fréquence définie) ;
//  cf. _syncLambdaBtnStateSon dans ui.js pour le verrouillage du bouton
//  en Impulsion.
//
//  La largeur n'est jamais mémorisée : recalculée à chaque frame depuis
//  c_sim et freq, si bien qu'un changement de ρ, K ou f redimensionne la
//  flèche instantanément. Même principe que _cordeLambdaPx/_drawCordeLambdaArrow.

function _sonLambdaPx() {
    return (sim.c_sim > 0 && sim.freq > 0) ? sim.c_sim / sim.freq : 0;
}

// Hauteur de la flèche, partagée par le tracé et le hit-test du drag
// (cf. nearLambdaArrow dans initTubeInteractions).
function _sonLambdaArrowY() {
    return sim.tubeTop + Math.max(24, Math.round(sim.tubeLength * 0.09));
}

function _drawSonLambdaArrow(ctx) {
    if (!sim.lambdaVisible) return;
    var lambdaPx = _sonLambdaPx();
    if (lambdaPx <= 0) return;

    var x1 = sim.lambdaX;
    var x2 = x1 + lambdaPx;
    var arrowY = _sonLambdaArrowY();
    var zeroY  = Math.round((sim.tubeTop + sim.tubeBottom) / 2);
    // Magenta vif : le violet essayé d'abord restait trop proche du bleu des
    // particules à l'œil. Le magenta est à l'opposé du bleu sur le cercle
    // chromatique (fort contraste de teinte) et absent du reste de la
    // palette (bleu particules, rouge/orange sélection-pression-balise,
    // vert 2e balise, fond crème) : reste visible quel que soit le mode.
    var color  = '#e6007e';
    var halo   = '#ffffff';   // liseré blanc pour détacher la flèche du fond

    ctx.save();
    // Clip à la zone du tube : λ peut dépasser largement la longueur
    // affichée, la flèche ne doit pas déborder sur le reste du canvas.
    ctx.beginPath();
    ctx.rect(sim.tubeLeft, sim.tubeTop, sim.tubeLength,
              sim.tubeBottom - sim.tubeTop);
    ctx.clip();
    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';

    // Pointillés verticaux jusqu'au centre du tube, aux deux extrémités —
    // halo blanc dessous, dans le même pointillé, puis trait magenta dessus.
    ctx.setLineDash([4, 3]);
    [1, 0].forEach(function (isHalo) {
        ctx.strokeStyle = isHalo ? halo : color;
        ctx.lineWidth   = isHalo ? 3 : 1;
        ctx.globalAlpha = isHalo ? 1 : 0.7;
        ctx.beginPath();
        ctx.moveTo(x1, arrowY);
        ctx.lineTo(x1, zeroY);
        ctx.moveTo(x2, arrowY);
        ctx.lineTo(x2, zeroY);
        ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Intersection : petite croix, pour repérer au premier coup d'œil où la
    // flèche « touche » la ligne centrale.
    var crossR = Math.max(4, Math.round(sim.tubeLength * 0.01)) * 0.75;
    [1, 0].forEach(function (isHalo) {
        ctx.strokeStyle = isHalo ? halo : color;
        ctx.lineWidth   = isHalo ? 4 : 2;
        [x1, x2].forEach(function (x) {
            ctx.beginPath();
            ctx.moveTo(x - crossR, zeroY - crossR);
            ctx.lineTo(x + crossR, zeroY + crossR);
            ctx.moveTo(x - crossR, zeroY + crossR);
            ctx.lineTo(x + crossR, zeroY - crossR);
            ctx.stroke();
        });
    });

    // Double flèche horizontale — épaissie et têtes agrandies pour rester
    // bien visible même par-dessus le reste du dessin. Pas de halo ici : sur
    // un trait aussi large, il épaississait la silhouette au lieu de la
    // détacher proprement.
    var headLen = Math.max(10, Math.min(20, lambdaPx * 0.12));
    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'butt';
    // Le trait s'arrête à la BASE des têtes de flèche (pas à leur pointe) :
    // près de l'apex, le triangle s'effile bien plus fin que l'épaisseur du
    // trait, qui dépasserait sinon visiblement au-delà de la pointe.
    ctx.beginPath();
    ctx.moveTo(Math.min(x1 + headLen, (x1 + x2) / 2), arrowY);
    ctx.lineTo(Math.max(x2 - headLen, (x1 + x2) / 2), arrowY);
    ctx.stroke();

    function head(xTip, dir) {
        ctx.beginPath();
        ctx.moveTo(xTip, arrowY);
        ctx.lineTo(xTip + dir * headLen, arrowY - headLen * 0.6);
        ctx.lineTo(xTip + dir * headLen, arrowY + headLen * 0.6);
        ctx.closePath();
        ctx.fill();
    }
    head(x1, 1);
    head(x2, -1);

    // Étiquette λ centrée au-dessus de la flèche — halo blanc puis texte
    // magenta, technique classique de contour de texte.
    var fSize = Math.max(12, Math.round(sim.tubeLength * 0.045));
    ctx.font         = 'italic bold ' + fSize + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.strokeStyle  = halo;
    ctx.lineWidth    = 4;
    ctx.strokeText('λ', (x1 + x2) / 2, arrowY - 4);
    ctx.fillStyle    = color;
    ctx.fillText('λ', (x1 + x2) / 2, arrowY - 4);

    ctx.restore();
}

// ── Rectangle de sélection ────────────────────────────────────────────
// [SUPPRIMÉ] Cette fonction n'est plus utilisée avec le système de sélection
// par proximité.

// ── Applique la sélection rectangulaire aux particules ───────────────
//  [SUPPRIMÉ] Cette fonction n'est plus utilisée avec le système de sélection
// par proximité.

// ══════════════════════════════════════════════════════════════════════
//  Interactions souris sur le canvas tube
// ══════════════════════════════════════════════════════════════════════

(function initTubeInteractions() {
    // Hit-test : est-on proche d'une balise ?
    function nearBeacon(x, beacon) {
        return beacon.active && Math.abs(x - beacon.x) < 10;
    }

    // Le graphe temporel enregistre la valeur mesurée À une position donnée :
    // dès que la balise bouge, les points antérieurs ne décrivent plus le
    // même point du milieu. On repart donc d'un tampon vide, au début et à
    // la fin du glissement (les points intermédiaires du drag sont eux aussi
    // écartés de cette façon).
    function _clearBeaconRecord(n) {
        if (typeof activeTab !== 'undefined' && activeTab === 'corde') {
            _ytClearCorde(n);
        } else {
            _dptClear(n);
        }
    }

    // Hit-test : est-on sur la flèche de longueur d'onde (ligne ou pointillés) ?
    // Bande verticale généreuse, de la flèche elle-même jusqu'à l'axe de
    // référence (y = 0 pour la Corde, centre du tube pour le Son), pour
    // rester attrapable même si l'onde a une grande amplitude. Disponible
    // sur Corde et Son, chacun avec ses propres grandeurs.
    function nearLambdaArrow(x, y) {
        var isCorde = (typeof activeTab !== 'undefined' && activeTab === 'corde');
        var isSon   = (typeof activeTab !== 'undefined' && activeTab === 'son');
        if (!isCorde && !isSon) return false;

        var sv = isCorde ? simCorde : sim;
        if (!sv.lambdaVisible) return false;
        var lambdaPx = isCorde ? _cordeLambdaPx() : _sonLambdaPx();
        if (lambdaPx <= 0) return false;
        var x1 = sv.lambdaX, x2 = x1 + lambdaPx;
        var arrowY = isCorde ? _cordeLambdaArrowY() : _sonLambdaArrowY();
        var zeroY  = isCorde ? simCorde.cordeMiddleY
                              : Math.round((sim.tubeTop + sim.tubeBottom) / 2);
        return x >= x1 - 8 && x <= x2 + 8 &&
               y >= arrowY - 10 && y <= zeroY;
    }

    // Hit-test : est-on sur la boule du mode Libre ? Zone de saisie élargie
    // (×2) pour rester attrapable même quand la corde vibre.
    function nearFreeHandle(x, y) {
        if (typeof activeTab === 'undefined' || activeTab !== 'corde') return false;
        if (!simCorde.freeActive) return false;
        var dx = x - simCorde.cordeLeft;
        var dy = y - _cordeAttachY();
        var r  = _cordeFreeHandleR() * 2;
        return dx * dx + dy * dy <= r * r;
    }

    function onDown(e) {
        var rect = tubeCanvas.getBoundingClientRect();
        var mx   = (e.clientX - rect.left) * (tubeCanvas.clientWidth  / rect.width);
        var my   = (e.clientY - rect.top)  * (tubeCanvas.clientHeight / rect.height);

        // Priorité absolue : saisie de la boule du mode Libre. Elle est au
        // bord gauche, là où aucune balise ne peut se trouver.
        if (nearFreeHandle(mx, my)) {
            tubeInter.mode        = 'corde-free-drag';
            simCorde.freeDragging = true;
            // Sans temps qui s'écoule, le geste ne graverait rien.
            if (simCorde.paused && typeof _setPausedCorde === 'function') _setPausedCorde(false);
            if (typeof _armYtWindowCorde === 'function') _armYtWindowCorde();
            // Mode Libre : la source, c'est le geste. Si le chronomètre est
            // lié, la saisie de la boule joue donc le rôle du bouton Activer.
            if (typeof _startChronoIfLinkedCorde === 'function') _startChronoIfLinkedCorde();
            tubeCanvas.setPointerCapture(e.pointerId);
            return;
        }

        // Flèche de longueur d'onde : ne se déplace qu'horizontalement,
        // en bloc (sa taille suit λ, jamais le geste de la souris).
        if (nearLambdaArrow(mx, my)) {
            var svLambda = (typeof activeTab !== 'undefined' && activeTab === 'corde') ? simCorde : sim;
            tubeInter.mode = 'lambda-drag';
            tubeInter.lambdaGrabDx = mx - svLambda.lambdaX;
            tubeCanvas.setPointerCapture(e.pointerId);
            return;
        }

        // Choisir les balises selon le tab actif
        var b1 = (typeof activeTab !== 'undefined' && activeTab === 'corde')
                    ? simCorde.beacon1 : sim.beacon1;
        var b2 = (typeof activeTab !== 'undefined' && activeTab === 'corde')
                    ? simCorde.beacon2 : sim.beacon2;

        // Priorité : drag d'une balise
        if (nearBeacon(mx, b1)) {
            tubeInter.mode = 'beacon1-drag';
            _clearBeaconRecord(1);
            tubeCanvas.setPointerCapture(e.pointerId);
            return;
        }
        if (nearBeacon(mx, b2)) {
            tubeInter.mode = 'beacon2-drag';
            _clearBeaconRecord(2);
            tubeCanvas.setPointerCapture(e.pointerId);
            return;
        }

        // Sélection par proximité (si mode actif — Son uniquement)
        if (sim.selectionMode && !(typeof activeTab !== 'undefined' && activeTab === 'corde')) {
            // On passe l'abscisse ÉCRAN : c'est selectNearbyParticles qui
            // remonte à la position de repos, l'onde ayant déplacé les
            // particules par rapport à leur x0.
            selectNearbyParticles(mx, {
                ctrl  : e.ctrlKey,
                shift : e.shiftKey
            });
        }
    }

    function onMove(e) {
        if (!tubeInter.mode) {
            // Curseur adaptatif
            var rect = tubeCanvas.getBoundingClientRect();
            var mx   = (e.clientX - rect.left) * (tubeCanvas.clientWidth  / rect.width);
            var my   = (e.clientY - rect.top)  * (tubeCanvas.clientHeight / rect.height);

            var b1 = (typeof activeTab !== 'undefined' && activeTab === 'corde')
                        ? simCorde.beacon1 : sim.beacon1;
            var b2 = (typeof activeTab !== 'undefined' && activeTab === 'corde')
                        ? simCorde.beacon2 : sim.beacon2;

            if (nearFreeHandle(mx, my)) {
                tubeCanvas.style.cursor = 'ns-resize';
            } else if (nearBeacon(mx, b1) || nearBeacon(mx, b2) || nearLambdaArrow(mx, my)) {
                tubeCanvas.style.cursor = 'ew-resize';
            } else if (sim.selectionMode && !(typeof activeTab !== 'undefined' && activeTab === 'corde')) {
                tubeCanvas.style.cursor = 'crosshair';
            } else {
                tubeCanvas.style.cursor = 'default';
            }
            return;
        }

        var rect = tubeCanvas.getBoundingClientRect();
        var mx   = (e.clientX - rect.left) * (tubeCanvas.clientWidth  / rect.width);
        var my   = (e.clientY - rect.top)  * (tubeCanvas.clientHeight / rect.height);

        // Bornes de déplacement selon le tab
        var isCorde = (typeof activeTab !== 'undefined' && activeTab === 'corde');
        var left    = isCorde ? simCorde.cordeLeft  : sim.tubeLeft;
        var right   = isCorde ? simCorde.cordeRight : sim.tubeRight;
        var length  = isCorde ? simCorde.cordeLength : sim.tubeLength;
        var b1      = isCorde ? simCorde.beacon1    : sim.beacon1;
        var b2      = isCorde ? simCorde.beacon2    : sim.beacon2;

        if (tubeInter.mode === 'corde-free-drag') {
            // La hauteur de la souris DEVIENT le signal émis : on convertit
            // les pixels en cm (même échelle que le tracé) et on borne à toute
            // la hauteur de la zone corde (cf. cordeFreeLimitCm).
            // On n'écrit ici que la CIBLE : la boucle d'animation l'atteint
            // en interpolant sur les échantillons de la frame, sans quoi le
            // geste se graverait en escalier (cf. freeTargetY dans sim.js).
            var cmToPx = simCorde.pxPerCmAmpl;
            var yCm    = (cmToPx > 0) ? (simCorde.cordeMiddleY - my) / cmToPx : 0;
            var lim = cordeFreeLimitCm();
            simCorde.freeTargetY = Math.max(-lim.down,
                                            Math.min(lim.up, yCm));
            return;
        }

        if (tubeInter.mode === 'lambda-drag') {
            var svLambda = isCorde ? simCorde : sim;
            var lambdaPx = isCorde ? _cordeLambdaPx() : _sonLambdaPx();
            var nx = mx - tubeInter.lambdaGrabDx;
            // Les deux extrémités doivent rester dans la zone affichée. Si λ
            // dépasse cette longueur, la flèche reste calée à gauche
            // (impossible de la faire tenir tout entière).
            var maxX = Math.max(left, right - lambdaPx);
            nx = Math.max(left, Math.min(maxX, nx));
            svLambda.lambdaX = nx;
            if (length > 0) svLambda.lambdaFrac = (nx - left) / length;
            return;
        }

        // Sur la corde en aspect Discret, la balise se cale sur le point
        // matériel le plus proche (cf. snapCordeBeaconX) : elle ne peut pas
        // se poser sur un lien entre deux points.
        if (tubeInter.mode === 'beacon1-drag') {
            b1.x = Math.max(left, Math.min(right, mx));
            if (isCorde) b1.x = snapCordeBeaconX(b1.x);
            if (length > 0) b1.frac = (b1.x - left) / length;
        } else if (tubeInter.mode === 'beacon2-drag') {
            b2.x = Math.max(left, Math.min(right, mx));
            if (isCorde) b2.x = snapCordeBeaconX(b2.x);
            if (length > 0) b2.frac = (b2.x - left) / length;
        }
    }

    function onUp() {
        if (tubeInter.mode === 'beacon1-drag') _clearBeaconRecord(1);
        if (tubeInter.mode === 'beacon2-drag') _clearBeaconRecord(2);
        // La boule reste où on l'a lâchée (cf. simCorde.freeY) : la corde
        // garde le déplacement imposé, comme une main qui la tiendrait.
        if (tubeInter.mode === 'corde-free-drag') simCorde.freeDragging = false;
        tubeInter.mode = null;
    }

    function setup() {
        tubeCanvas = document.getElementById('tube-canvas');
        if (!tubeCanvas) return;
        tubeCanvas.addEventListener('pointerdown', onDown);
        tubeCanvas.addEventListener('pointermove', onMove);
        tubeCanvas.addEventListener('pointerup',   onUp);
        tubeCanvas.addEventListener('pointerleave', function() {
            if (tubeInter.mode) onUp();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();

// ── Désélectionner toutes les colonnes ───────────────────────────────

function clearSelection() {
    for (var i = 0; i < sim.cols.length; i++) {
        sim.cols[i].selected = false;
    }
}

// ══════════════════════════════════════════════════════════════════════
//  ██████╗ ██████╗ ██████╗ ██████╗ ███████╗
//  Rendu du canvas — mode CORDE
//  Fonctions : resizeCorde, drawCorde, _drawShaker, _drawCordeWire,
//              _drawCordeBeacons, _drawCordeRuler
// ══════════════════════════════════════════════════════════════════════

// Épaisseur visuelle du corps du pot vibrant (px)
var SHAKER_BASE_W = 28;

// ── Échelle verticale de la corde (cm → px) ───────────────────────────
//  L'échelle verticale (y) est volontairement DÉCOUPLÉE de l'échelle
//  spatiale réelle (x, en m) : une amplitude réaliste de quelques cm serait
//  invisible sur une corde de 5 m affichée à l'écran. On fixe donc un
//  facteur cm → px tel que l'amplitude maximale du curseur occupe 55 % de la
//  demi-hauteur disponible ; il reste responsive puisque halfH suit le
//  redimensionnement.

// Fraction de la demi-hauteur occupée par l'amplitude maximale du curseur.
// Plafonnée à 45 % (et non 55 %) pour garder de la marge : deux impulsions
// émises à moins de T_IMPULSE d'intervalle se superposent et atteignent le
// double, soit 90 % — ça rentre encore, sans rognage ni décrochage du pot.
var CORDE_AMPL_FRAC = 0.45;

function _recalcCordeScale() {
    var halfH = (simCorde.cordeBottom - simCorde.cordeTop) / 2;

    // Échelle unique cm → px. Le facteur ne dépend PAS de l'amplitude
    // courante, sans quoi toutes les amplitudes s'afficheraient à la même
    // taille (c'était le cas avant : le curseur semblait sans effet).
    simCorde.pxPerCmAmpl = (halfH * CORDE_AMPL_FRAC) / CORDE_AMPL_CM_MAX;
}

// ── Point d'accroche de la corde sur le pot vibrant ───────────────────
//  Source de vérité UNIQUE, partagée par le fil et par le pot : tant qu'ils
//  calculaient chacun leur y avec des bornes différentes, une excursion
//  ample pouvait les désolidariser visuellement.

function _cordeAttachY() {
    var disp = cordeDisplacement(0, simCorde.simTime) * simCorde.pxPerCmAmpl;
    return Math.max(simCorde.cordeTop + 1,
                    Math.min(simCorde.cordeBottom - 1, simCorde.cordeMiddleY - disp));
}

// ── Sommet du vérin du pot vibrant ────────────────────────────────────
//  Normalement confondu avec le point d'accroche de la corde. En mode
//  Libre le pot est débrayé : le vérin ne suit plus la corde et reste
//  immobile au repos (le zéro), c'est la petite tige horizontale qui
//  pivote pour lâcher la corde (cf. _drawShaker).

function _shakerTopY() {
    return simCorde.freeActive ? simCorde.cordeMiddleY : _cordeAttachY();
}

// ── Boule du bout de corde (mode Libre) ───────────────────────────────
//  Rayon de la poignée, et sa position courante — partagés par le tracé
//  (_drawCordeFreeHandle) et le hit-test de la souris (initTubeInteractions).

function _cordeFreeHandleR() {
    // Indexé sur cordeLength (largeur), pas sur la hauteur de la zone :
    // même correctif que pour les sphères du mode discret et le label
    // des balises, cf. leurs commentaires respectifs.
    return Math.max(4, Math.round(simCorde.cordeLength * 0.008));
}

// ── Débattement de la boule du mode Libre ─────────────────────────────
//  La boule se traîne dans TOUTE la hauteur de la zone corde, et non plus
//  dans la seule plage du curseur Amplitude : le geste de l'utilisateur
//  n'a pas de raison d'être bridé par un réglage qui ne le concerne pas.
//  Le rayon de la boule est retranché pour qu'elle reste entièrement
//  visible quand on la pousse contre un bord. Bornes séparées haut/bas :
//  cordeMiddleY étant arrondi, les deux moitiés de la zone ne sont pas
//  exactement égales.
function cordeFreeLimitCm() {
    var cmToPx = simCorde.pxPerCmAmpl;
    if (!(cmToPx > 0)) return { up: CORDE_AMPL_CM_MAX, down: CORDE_AMPL_CM_MAX };
    var r = _cordeFreeHandleR();
    return {
        up  : Math.max(0, simCorde.cordeMiddleY - simCorde.cordeTop     - r) / cmToPx,
        down: Math.max(0, simCorde.cordeBottom  - simCorde.cordeMiddleY - r) / cmToPx
    };
}

// ── Demi-étendue de l'axe y des graphes corde ─────────────────────────
//  Fixe en temps normal (cf. CORDE_Y_AXIS_CM). En mode Libre elle s'ouvre
//  au débattement réel de la boule, sinon le geste sortirait du cadre dès
//  qu'il dépasse l'amplitude max du curseur. Les graduations, elles, se
//  recalculent seules (cf. _niceStep dans graph.js).
function cordeYAxisCm() {
    if (!simCorde.freeActive) return CORDE_Y_AXIS_CM;
    var lim = cordeFreeLimitCm();
    return Math.max(CORDE_Y_AXIS_CM, 1.06 * Math.max(lim.up, lim.down));
}

// ── Resize corde ──────────────────────────────────────────────────────

function resizeCorde() {
    tubeCanvas = tubeCanvas || document.getElementById('tube-canvas');
    tubeCtx    = tubeCtx    || tubeCanvas.getContext('2d');

    var wrap = document.getElementById('tube-canvas-wrap');
    var w    = wrap.clientWidth;
    var h    = wrap.clientHeight;
    if (w < 10 || h < 28) return;

    var dpr = window.devicePixelRatio || 1;
    tubeCanvas.width  = Math.round(w * dpr);
    tubeCanvas.height = Math.round(h * dpr);
    tubeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // ── Géométrie de la zone corde ────────────────────────────────────
    // Même logique que le tube son : marge horizontale + verticale
    var marginH      = 13;
    var marginTop    = 10;
    var marginBottom = Math.round(h * 0.12);

    simCorde.cordeLeft   = marginH + SHAKER_BASE_W;
    simCorde.cordeRight  = w - marginH;
    simCorde.cordeLength = simCorde.cordeRight - simCorde.cordeLeft;
    simCorde.cordeTop    = marginTop;
    simCorde.cordeBottom = Math.max(marginTop + 20, h - marginBottom);
    simCorde.cordeMiddleY = Math.round((simCorde.cordeTop + simCorde.cordeBottom) / 2);

    // ── Échelle spatiale : px par mètre réel ──────────────────────────
    // La propagation elle-même se calcule en mètres (cf. cordeDisplacement),
    // donc ce facteur ne sert plus qu'à exprimer c et λ en pixels pour
    // dimensionner la finesse d'échantillonnage du tracé.
    C_BASE_CORDE = simCorde.cordeLength / CORDE_LENGTH_M;

    // ── Amplitude du pot vibrant ──────────────────────────────────────
    // Échelle visuelle dédiée (indépendante de l'échelle spatiale x),
    // mappée sur une fraction lisible de la demi-hauteur disponible
    // (cf. _recalcCordeScale).
    _recalcCordeScale();

    // ── Positions des balises ──────────────────────────────────────────
    // Recalculées depuis frac (position relative) pour rester à distance
    // constante du vibreur quelle que soit la largeur du canvas.
    simCorde.beacon1.x = simCorde.cordeLeft + simCorde.cordeLength * simCorde.beacon1.frac;
    simCorde.beacon2.x = simCorde.cordeLeft + simCorde.cordeLength * simCorde.beacon2.frac;
    // En aspect Discret, une balise ne peut vivre que sur un point matériel.
    snapCordeBeacon(simCorde.beacon1);
    snapCordeBeacon(simCorde.beacon2);

    // ── Position de la flèche de longueur d'onde ──────────────────────
    simCorde.lambdaX = simCorde.cordeLeft + simCorde.cordeLength * simCorde.lambdaFrac;

    updateCeleriteCorde();
}

// ── Dessin de la scène corde ──────────────────────────────────────────

function drawCorde() {
    tubeCanvas = tubeCanvas || document.getElementById('tube-canvas');
    tubeCtx    = tubeCtx    || tubeCanvas.getContext('2d');
    var ctx    = tubeCtx;
    var W      = tubeCanvas.clientWidth;
    var H      = tubeCanvas.clientHeight;
    if (!W || !H) return;

    // ── Fond général ──────────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fdf8f0';
    ctx.fillRect(0, 0, W, H);

    // ── Zone de la corde (fond légèrement teinté) ─────────────────────
    var zoneH   = simCorde.cordeBottom - simCorde.cordeTop;
    ctx.fillStyle = '#f0ece4';
    ctx.fillRect(simCorde.cordeLeft, simCorde.cordeTop, simCorde.cordeLength, zoneH);

    // ── Grille (lignes verticales tous les mètres + ligne du zéro) ────
    _drawCordeGrid(ctx);

    // ── Pot vibrant (à gauche) ────────────────────────────────────────
    // Dessiné EN PREMIER : son masque efface le fond de zone, puis la
    // corde est tracée par-dessus en partant exactement du point d'accroche.
    _drawShaker(ctx);

    // ── Corde elle-même ───────────────────────────────────────────────
    // Dessinée APRÈS le shaker pour partir visuellement du sommet du tube.
    // Deux aspects possibles, même physique (cf. simCorde.aspect).
    if (simCorde.aspect === 'discret') _drawCordeBeads(ctx);
    else                               _drawCordeWire(ctx);

    // ── Flèche de longueur d'onde ────────────────────────────────────
    _drawCordeLambdaArrow(ctx);

    // ── Balises ───────────────────────────────────────────────────────
    _drawCordeBeacons(ctx);

    // ── Règle graduée (distance en bas) ────────────────────────────────
    _drawCordeRuler(ctx);

    // ── Bordure de la zone (dessinée avant la poignée pour que celle-ci,
    //    posée sur le bord gauche du cadre en mode Libre, ne soit pas
    //    coupée par le trait de bordure) ────────────────────────────────
    ctx.strokeStyle = '#b0a89c';
    ctx.lineWidth   = 1;
    ctx.strokeRect(
        simCorde.cordeLeft + 0.5, simCorde.cordeTop + 0.5,
        simCorde.cordeLength - 1, zoneH - 1
    );

    // ── Poignée du mode Libre (au bout du fil) ────────────────────────
    // Dessinée en dernier pour rester au-dessus du cadre.
    _drawCordeFreeHandle(ctx);
}

// ── Grille de la corde : repères verticaux (mètres) + ligne du zéro ───

function _drawCordeGrid(ctx) {
    var L = simCorde.cordeLength;
    if (L <= 0) return;
    var top    = simCorde.cordeTop;
    var bottom = simCorde.cordeBottom;
    var midY   = simCorde.cordeMiddleY;

    ctx.save();

    // Lignes verticales tous les mètres
    ctx.strokeStyle = 'rgba(140,150,160,0.35)';
    ctx.lineWidth   = 1;
    var nMarks = Math.round(CORDE_LENGTH_M);
    for (var m = 0; m <= nMarks; m++) {
        var x = simCorde.cordeLeft + (m / CORDE_LENGTH_M) * L;
        if (x > simCorde.cordeRight + 0.5) break;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
    }

    // Ligne horizontale du zéro (position d'équilibre)
    ctx.strokeStyle = 'rgba(110,120,130,0.55)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(simCorde.cordeLeft,  midY);
    ctx.lineTo(simCorde.cordeRight, midY);
    ctx.stroke();

    ctx.restore();
}

// ── Fil de la corde ───────────────────────────────────────────────────
//
//  La corde est tracée comme un chemin sinueux depuis x=cordeLeft jusqu'à
//  x=cordeRight. Pour chaque colonne x (pixels), le déplacement physique
//  y(x,t) = cordeDisplacement(x − cordeLeft, simTime) (en cm) est converti
//  en pixels par pxPerCmAmpl, puis retranché à cordeMiddleY.
//
//  Épaisseur du trait = f(μ) : de 1.5 px (μ=0.5) à 5 px (μ=4)
//  Couleur : bordeaux #7a2510

function _drawCordeWire(ctx) {
    var L  = simCorde.cordeLength;
    if (L <= 0) return;

    // Point de départ = accroche sur le pot (cf. _cordeAttachY, partagé avec
    // _drawShaker). Partout le déplacement est RETRANCHÉ à cordeMiddleY, pour
    // que y positif aille vers le haut comme sur les graphes y(x) et y(t)
    // (convention mathématique standard).
    var cmToPx = simCorde.pxPerCmAmpl;
    var startX = simCorde.cordeLeft;
    var startY = _cordeAttachY();

    // Épaisseur selon μ : linéaire de 1.5 (μ=0.1) à 5 (μ=4)
    var muRange    = 4.0 - 0.1;
    var lwRange    = 5.0 - 1.5;
    var cordeLineW = 1.5 + ((simCorde.mu - 0.1) / muRange) * lwRange;

    // Finesse d'échantillonnage : ~60 points par longueur d'onde. À 24 pts/λ
    // (valeur précédente), la corde de crête (courbure max, tangente quasi
    // horizontale) n'était approchée que par une corde de polygone d'environ
    // 1 px de flèche pour une corde épaisse au max d'amplitude — trop peu
    // pour rester sous le seuil de perception une fois anti-aliasé sur un
    // trait épais, d'où un léger « tremblement » visible surtout au ralenti
    // (l'image reste assez longtemps pour que l'œil suive le sous-pixel).
    var freqEff_  = (simCorde.sourceMode === 'impulse') ? 1.0 / T_IMPULSE : simCorde.freq;
    var lambda_px = (simCorde.c_sim > 0) ? simCorde.c_sim / freqEff_ : L;
    var subSteps  = Math.max(400, Math.min(6000, Math.ceil(60 * L / Math.max(0.5, lambda_px))));

    // Clipping dans la zone corde uniquement
    ctx.save();
    ctx.beginPath();
    ctx.rect(simCorde.cordeLeft, simCorde.cordeTop, L, simCorde.cordeBottom - simCorde.cordeTop);
    ctx.clip();

    // Le chemin est construit dans un Path2D quand c'est possible : contrairement
    // au chemin courant du contexte (figé dès sa construction), un Path2D est
    // transformé au moment du tracé, ce qui permet de le réutiliser tel quel
    // pour le passage d'ombre décalé — sans recalculer un seul point.
    var path = (typeof Path2D === 'function') ? new Path2D() : null;
    var sink = path || ctx;
    if (!path) ctx.beginPath();

    sink.moveTo(startX, startY);   // premier point = point d'accroche
    for (var s = 1; s <= subSteps; s++) {
        var x_px = (s / subSteps) * L;
        var disp = cordeDisplacement(x_px, simCorde.simTime) * cmToPx;
        sink.lineTo(simCorde.cordeLeft + x_px, simCorde.cordeMiddleY - disp);
    }

    // Pas de shadowBlur : sur un chemin de plusieurs milliers de points, le
    // flou coûte bien plus cher que le tracé lui-même, à chaque frame, pour
    // un halo à peine perceptible. Un second passage décalé d'un pixel et
    // demi donne le même relief pour le prix d'un stroke.
    ctx.lineJoin  = 'round';
    ctx.lineCap   = 'round';
    ctx.lineWidth = cordeLineW;

    if (path) {
        ctx.save();
        ctx.translate(0, 1.5);
        ctx.strokeStyle = 'rgba(80,20,0,0.20)';
        ctx.stroke(path);
        ctx.restore();

        ctx.strokeStyle = '#7a2510';
        ctx.stroke(path);
    } else {
        ctx.strokeStyle = '#7a2510';
        ctx.stroke();
    }

    ctx.restore();
}

// ── Corde en aspect « Discret » : chapelet de points matériels ────────
//
//  Même déplacement y(x,t) que le tracé continu, échantillonné cette fois
//  à pas fixe : un point tous les CORDE_BEAD_STEP_M (10 cm), soit 51 points
//  sur 5 m. Chacun est relié à son voisin par un petit lien.
//
//  Intérêt pédagogique : on suit un point donné et on constate qu'il ne se
//  déplace jamais horizontalement — il ne fait que reproduire, avec un
//  retard, le mouvement du point qui le précède.

// Nombre de points (bornes incluses) — 51 pour 5 m au pas de 10 cm.
function cordeBeadCount() {
    return Math.round(CORDE_LENGTH_M / CORDE_BEAD_STEP_M) + 1;
}

// Abscisse écran (px) du point d'indice i.
function cordeBeadX(i) {
    var n = cordeBeadCount() - 1;
    return simCorde.cordeLeft + (i / n) * simCorde.cordeLength;
}

function _drawCordeBeads(ctx) {
    var L = simCorde.cordeLength;
    if (L <= 0) return;

    var cmToPx = simCorde.pxPerCmAmpl;
    var zoneH  = simCorde.cordeBottom - simCorde.cordeTop;
    var nBeads = cordeBeadCount();

    // Rayon des points et épaisseur des liens : indexés sur μ, comme
    // l'épaisseur du fil en aspect continu, pour que la corde reste
    // visuellement « plus lourde » quand μ augmente. Interpolation linéaire
    // sur toute la plage du curseur : rayon minimal à μ = 0,1, maximal à
    // μ = 4 — ce maximum est volontairement modeste, des sphères plus
    // grosses se toucheraient et la corde redeviendrait un trait plein.
    // Base = espacement entre points (proportionnel à L, la largeur de la
    // zone), pas zoneH (hauteur) : sinon les sphères grossissent
    // artificiellement dans une fenêtre haute et étroite alors que rien
    // n'a changé horizontalement.
    var spacing = L / (nBeads - 1);
    var muFrac  = (simCorde.mu - 0.1) / (4.0 - 0.1);
    var beadR   = Math.max(2.5, spacing * (0.26 + 0.11 * muFrac));
    var linkW   = Math.max(1.0, beadR * 0.45);

    // Positions calculées une seule fois : elles servent aux liens puis aux
    // points. Le premier point est le point d'accroche sur le pot vibrant
    // (cf. _cordeAttachY), exactement comme le départ du fil continu.
    var xs = new Float32Array(nBeads);
    var ys = new Float32Array(nBeads);
    for (var i = 0; i < nBeads; i++) {
        var xPx = (i / (nBeads - 1)) * L;
        xs[i] = simCorde.cordeLeft + xPx;
        ys[i] = (i === 0)
                    ? _cordeAttachY()
                    : simCorde.cordeMiddleY - cordeDisplacement(xPx, simCorde.simTime) * cmToPx;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(simCorde.cordeLeft, simCorde.cordeTop, L, zoneH);
    ctx.clip();

    // ── Liens ─────────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(122,37,16,0.55)';
    ctx.lineWidth   = linkW;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(xs[0], ys[0]);
    for (var k = 1; k < nBeads; k++) ctx.lineTo(xs[k], ys[k]);
    ctx.stroke();

    // ── Points ────────────────────────────────────────────────────────
    // En mode Libre le point d'indice 0 est remplacé par la poignée
    // attrapable, dessinée juste après au même endroit (_drawCordeFreeHandle).
    //
    //  Anti-scintillement : une sphère de quelques pixels dont le bord n'est
    //  qu'un dégradé adouci par l'antialiasing change d'aspect à chaque frame
    //  quand elle traverse la hauteur de l'écran en quelques images — d'où
    //  l'impression de clignotement. Deux parades :
    //   - un contour net d'un pixel, qui donne à la sphère une silhouette
    //     stable quelle que soit sa position sub-pixel ;
    //   - un dégradé qui s'arrête avant le bord, pour que la couleur y soit
    //     franche au lieu de s'y éteindre.
    var first = simCorde.freeActive ? 1 : 0;
    ctx.strokeStyle = '#4a1008';
    ctx.lineWidth   = 1;
    for (var j = first; j < nBeads; j++) {
        var grd = ctx.createRadialGradient(
            xs[j] - beadR * 0.35, ys[j] - beadR * 0.35, beadR * 0.15,
            xs[j], ys[j], beadR
        );
        grd.addColorStop(0,    '#c05030');
        grd.addColorStop(0.75, '#7a2510');
        grd.addColorStop(1,    '#7a2510');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(xs[j], ys[j], beadR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    ctx.restore();
}

// ── Calage des balises sur les points (aspect Discret) ────────────────
//
//  En aspect Discret la corde n'existe qu'aux points matériels : une balise
//  posée entre deux d'entre eux ne suivrait aucun point réel. On l'aligne
//  donc sur le point le plus proche. En aspect Continu, x est renvoyé tel
//  quel — la balise reste librement positionnable.

function snapCordeBeaconX(x) {
    if (simCorde.aspect !== 'discret') return x;
    var L = simCorde.cordeLength;
    if (L <= 0) return x;
    var n = cordeBeadCount() - 1;
    var i = Math.round(((x - simCorde.cordeLeft) / L) * n);
    i = Math.max(0, Math.min(n, i));
    return cordeBeadX(i);
}

// Cale une balise corde et resynchronise sa position relative.
function snapCordeBeacon(beacon) {
    if (simCorde.aspect !== 'discret') return;
    beacon.x = snapCordeBeaconX(beacon.x);
    if (simCorde.cordeLength > 0) {
        beacon.frac = (beacon.x - simCorde.cordeLeft) / simCorde.cordeLength;
    }
}

// ── Pot vibrant ───────────────────────────────────────────────────────
//
//  Géométrie (vue de face, vertical) :
//
//    ┌──────┐   ← sommet du tube animé (y = midY − disp)
//    │ tube │     → extrémité de la corde accrochée ici
//    │      │
//    │      │
//    └──────┘
//    ┌──────────┐  ← base fixe (rectangle centré, en bas de zone)
//    └──────────┘
//
//  - Base (fixe) : rectangle gris, centré dans la marge gauche,
//    ancré juste au-dessus de cordeBottom, hauteur ≈ 18 % de zoneH
//  - Tube (animé) : rectangle fin centré sur la base,
//    part du dessus de la base et monte jusqu'à midY − disp
//  - Point d'accroche : petit disque coloré au sommet du tube
//    → c'est d'ici que part le fil de la corde

function _drawShaker(ctx) {
    var cordeTop    = simCorde.cordeTop;
    var cordeBottom = simCorde.cordeBottom;
    var zoneH       = cordeBottom - cordeTop;
    var marginLeft  = simCorde.cordeLeft;   // largeur totale de la zone pot

    // Hauteur actuelle du sommet du pot. En mode Libre il est débrayé et
    // reste en position haute, indépendamment de la corde (cf. _shakerTopY).
    var attachY = _shakerTopY();

    // ── Dimensions ────────────────────────────────────────────────────
    var baseH  = Math.max(12, Math.round(zoneH * 0.18));   // hauteur base fixe
    var baseW  = Math.max(18, Math.round(marginLeft * 0.80)); // largeur base
    var baseX  = Math.round((marginLeft - baseW) / 2);     // centré horizontalement
    var baseY  = cordeBottom - baseH;                       // ancré en bas de zone

    var tubeW  = Math.max(6, Math.round(baseW * 0.28));    // largeur tube fin
    var tubeX  = Math.round(marginLeft / 2 - tubeW / 2);  // centré

    // Sommet du tube = point d'accroche exact de la corde — AUCUNE borne
    // propre ici, sinon le tube pourrait s'arrêter alors que le fil, lui,
    // continue de descendre (c'était la cause du décrochage visuel).
    // Si l'accroche passe sous le dessus de la base, le tube n'est plus
    // dessiné : la base, tracée ensuite, le recouvre — le vérin donne alors
    // l'impression de rentrer dans le corps du pot, ce qui est réaliste.
    var tubeTop_anim = attachY;
    var tubeBot      = baseY;      // pied du tube = dessus de la base

    // ── Fond : masque la zone du pot (couleur de fond de zone) ────────
    ctx.fillStyle = '#f0ece4';
    ctx.fillRect(0, cordeTop, marginLeft, zoneH);

    // ── Tube animé ────────────────────────────────────────────────────
    var tubeH = tubeBot - tubeTop_anim;
    if (tubeH > 0) {
        var tGrd = ctx.createLinearGradient(tubeX, 0, tubeX + tubeW, 0);
        tGrd.addColorStop(0,   '#9aabb8');
        tGrd.addColorStop(0.5, '#c0d0da');
        tGrd.addColorStop(1,   '#7a8a98');
        ctx.fillStyle = tGrd;
        ctx.fillRect(tubeX, tubeTop_anim, tubeW, tubeH);

        // Contour tube
        ctx.strokeStyle = '#6a7a88';
        ctx.lineWidth   = 1;
        ctx.strokeRect(tubeX, tubeTop_anim, tubeW, tubeH);
    }

    // ── Base fixe ─────────────────────────────────────────────────────
    var bGrd = ctx.createLinearGradient(baseX, baseY, baseX, baseY + baseH);
    bGrd.addColorStop(0,   '#8a9aaa');
    bGrd.addColorStop(0.4, '#6a7a8a');
    bGrd.addColorStop(1,   '#4a5a6a');
    ctx.fillStyle = bGrd;
    if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(baseX, baseY, baseW, baseH, 3);
        ctx.fill();
    } else {
        ctx.fillRect(baseX, baseY, baseW, baseH);
    }

    // Contour base
    ctx.strokeStyle = '#3a4a58';
    ctx.lineWidth   = 1.2;
    ctx.strokeRect(baseX, baseY, baseW, baseH);

    // Traits horizontaux décoratifs sur la base (effet métal)
    ctx.strokeStyle = 'rgba(180,200,210,0.4)';
    ctx.lineWidth   = 0.8;
    var nLines = 2;
    for (var li = 1; li <= nLines; li++) {
        var ly = baseY + Math.round(baseH * li / (nLines + 1));
        ctx.beginPath();
        ctx.moveTo(baseX + 3, ly);
        ctx.lineTo(baseX + baseW - 3, ly);
        ctx.stroke();
    }

    // ── Tige d'accroche de la corde (sommet du vérin) ─────────────────
    // Petite tige reliant le sommet du vérin au bord de la zone corde.
    // Son point d'attache au vérin sert de pivot : en mode Libre elle
    // bascule d'un quart de tour dans le sens antihoraire et se dresse à la
    // verticale, ce qui la déconnecte de la corde. (À l'écran l'axe y est
    // orienté vers le bas : « vers le haut » = y décroissant.)
    var pivotX = tubeX + tubeW / 2;   // centre du disque = pivot de la tige
    var rodLen = simCorde.cordeLeft - pivotX;
    var dotR   = Math.max(3, tubeW * 0.45);   // attachY : calculé plus haut

    ctx.strokeStyle = '#5a3a20';
    ctx.lineWidth   = Math.max(1.5, tubeW * 0.3);
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(pivotX, attachY);
    if (simCorde.freeActive) ctx.lineTo(pivotX, attachY - rodLen);
    else                     ctx.lineTo(pivotX + rodLen, attachY);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Disque d'accroche (sommet du vérin, également pivot de la tige)
    ctx.fillStyle   = '#7a2510';
    ctx.beginPath();
    ctx.arc(tubeX + tubeW / 2, attachY, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a1008';
    ctx.lineWidth   = 1;
    ctx.stroke();
}

// ── Poignée du mode Libre : boule au bout de la corde ─────────────────
//  Dessinée après le fil, à son extrémité gauche exacte : c'est le point
//  que l'utilisateur attrape pour imposer lui-même le déplacement.

function _drawCordeFreeHandle(ctx) {
    if (!simCorde.freeActive) return;

    var x = simCorde.cordeLeft;
    var y = _cordeAttachY();
    var r = _cordeFreeHandleR();

    ctx.save();

    // Halo quand la boule est saisie — retour visuel du glissement en cours
    if (simCorde.freeDragging) {
        ctx.fillStyle = 'rgba(122,37,16,0.20)';
        ctx.beginPath();
        ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
        ctx.fill();
    }

    var grd = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.15, x, y, r);
    grd.addColorStop(0, '#c05030');
    grd.addColorStop(1, '#7a2510');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#4a1008';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    ctx.restore();
}

// ── Flèche de longueur d'onde ─────────────────────────────────────────
//  Uniquement pertinente en Sinusoïdale / Périodique (fréquence définie) ;
//  cf. _syncLambdaBtnStateCorde dans ui.js pour le verrouillage du bouton
//  en Impulsion / Libre.
//
//  La largeur n'est jamais mémorisée : recalculée à chaque frame depuis
//  c_sim et freq (mêmes grandeurs que _drawCordeWire), si bien qu'un
//  changement de μ, T ou f redimensionne la flèche instantanément.

function _cordeLambdaPx() {
    return (simCorde.c_sim > 0 && simCorde.freq > 0) ? simCorde.c_sim / simCorde.freq : 0;
}

// Hauteur de la flèche, partagée par le tracé et le hit-test du drag
// (cf. nearLambdaArrow dans initTubeInteractions).
function _cordeLambdaArrowY() {
    return simCorde.cordeTop + Math.max(24, Math.round(simCorde.cordeLength * 0.09));
}

function _drawCordeLambdaArrow(ctx) {
    if (!simCorde.lambdaVisible) return;
    var lambdaPx = _cordeLambdaPx();
    if (lambdaPx <= 0) return;

    var x1 = simCorde.lambdaX;
    var x2 = x1 + lambdaPx;
    var arrowY = _cordeLambdaArrowY();
    var zeroY  = simCorde.cordeMiddleY;
    var color  = '#1a5fb4';
    var halo   = '#ffffff';   // liseré blanc pour détacher la flèche du fond

    ctx.save();
    // Clip à la zone de la corde : λ peut dépasser largement la longueur
    // physique de la corde (jusqu'à 20 m pour 5 m de corde aux réglages
    // extrêmes), la flèche ne doit pas déborder sur le reste du canvas.
    ctx.beginPath();
    ctx.rect(simCorde.cordeLeft, simCorde.cordeTop, simCorde.cordeLength,
              simCorde.cordeBottom - simCorde.cordeTop);
    ctx.clip();
    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';

    // Pointillés verticaux jusqu'à y = 0, aux deux extrémités — halo blanc
    // dessous, dans le même pointillé, puis trait bleu dessus.
    ctx.setLineDash([4, 3]);
    [1, 0].forEach(function (isHalo) {
        ctx.strokeStyle = isHalo ? halo : color;
        ctx.lineWidth   = isHalo ? 3 : 1;
        ctx.globalAlpha = isHalo ? 1 : 0.7;
        ctx.beginPath();
        ctx.moveTo(x1, arrowY);
        ctx.lineTo(x1, zeroY);
        ctx.moveTo(x2, arrowY);
        ctx.lineTo(x2, zeroY);
        ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Intersection avec l'axe y = 0 : petite croix, pour repérer au premier
    // coup d'œil où la flèche « touche » la ligne de repos.
    var crossR = Math.max(4, Math.round(simCorde.cordeLength * 0.01)) * 0.75;
    [1, 0].forEach(function (isHalo) {
        ctx.strokeStyle = isHalo ? halo : color;
        ctx.lineWidth   = isHalo ? 4 : 2;
        [x1, x2].forEach(function (x) {
            ctx.beginPath();
            ctx.moveTo(x - crossR, zeroY - crossR);
            ctx.lineTo(x + crossR, zeroY + crossR);
            ctx.moveTo(x - crossR, zeroY + crossR);
            ctx.lineTo(x + crossR, zeroY - crossR);
            ctx.stroke();
        });
    });

    // Double flèche horizontale — épaissie et têtes agrandies pour rester
    // bien visible même par-dessus le reste du dessin. Pas de halo ici : sur
    // un trait aussi large, il épaississait la silhouette au lieu de la
    // détacher proprement.
    var headLen = Math.max(10, Math.min(20, lambdaPx * 0.12));
    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'butt';
    // Le trait s'arrête à la BASE des têtes de flèche (pas à leur pointe) :
    // près de l'apex, le triangle s'effile bien plus fin que l'épaisseur du
    // trait, qui dépasserait sinon visiblement au-delà de la pointe.
    ctx.beginPath();
    ctx.moveTo(Math.min(x1 + headLen, (x1 + x2) / 2), arrowY);
    ctx.lineTo(Math.max(x2 - headLen, (x1 + x2) / 2), arrowY);
    ctx.stroke();

    function head(xTip, dir) {
        ctx.beginPath();
        ctx.moveTo(xTip, arrowY);
        ctx.lineTo(xTip + dir * headLen, arrowY - headLen * 0.6);
        ctx.lineTo(xTip + dir * headLen, arrowY + headLen * 0.6);
        ctx.closePath();
        ctx.fill();
    }
    head(x1, 1);
    head(x2, -1);

    // Étiquette λ centrée au-dessus de la flèche — halo blanc puis texte
    // bleu, technique classique de contour de texte.
    var fSize = Math.max(12, Math.round(simCorde.cordeLength * 0.045));
    ctx.font         = 'italic bold ' + fSize + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.strokeStyle  = halo;
    ctx.lineWidth    = 4;
    ctx.strokeText('λ', (x1 + x2) / 2, arrowY - 4);
    ctx.fillStyle    = color;
    ctx.fillText('λ', (x1 + x2) / 2, arrowY - 4);

    ctx.restore();
}

// ── Balises corde ─────────────────────────────────────────────────────

function _drawCordeBeacons(ctx) {
    if (simCorde.beacon1.active) _drawOneCordeBeacon(ctx, simCorde.beacon1.x, '#e07020', 'B1');
    if (simCorde.beacon2.active) _drawOneCordeBeacon(ctx, simCorde.beacon2.x, '#2a8a50', 'B2');
}

function _drawOneCordeBeacon(ctx, x, color, label) {
    var top    = simCorde.cordeTop;
    var bottom = simCorde.cordeBottom;
    // Indexé sur la largeur de la zone (cordeLength), pas sur sa hauteur :
    // sinon l'étiquette grossit artificiellement dans une fenêtre haute et
    // étroite alors que rien n'a changé horizontalement.
    var fSize  = Math.max(11, Math.round(simCorde.cordeLength * 0.045));

    // Position verticale actuelle du point d'attache : suit le déplacement
    // transversal de la corde à cette abscisse (comme un point matériel posé
    // sur le fil). Signe inversé, cf. _drawCordeWire (y positif vers le haut).
    var xRel = x - simCorde.cordeLeft;
    var disp = cordeDisplacement(xRel, simCorde.simTime) * simCorde.pxPerCmAmpl;
    var y    = Math.max(top, Math.min(bottom, simCorde.cordeMiddleY - disp));

    // Ligne pointillée vers le bas uniquement, jusqu'à la règle graduée
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Point matérialisant la balise (toujours dragable horizontalement,
    // cf. nearBeacon() dans initTubeInteractions — basé uniquement sur x)
    var dotR = Math.max(2, fSize * 0.16);
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.restore();

    // Étiquette juste au-dessus du point. Quand l'amplitude est très grande,
    // le point est plaqué contre le haut de la zone (clampé ci-dessus) et
    // l'étiquette voudrait sortir du canvas : on la retient à une hauteur
    // minimale pour qu'elle reste toujours visible, quitte à empiéter sur
    // la marge au-dessus de la zone plutôt que d'être coupée.
    var labelY = Math.max(fSize + 2, y - dotR - 3);
    ctx.fillStyle    = color;
    ctx.font         = 'bold ' + fSize + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, x, labelY);

    // Label de position sur la règle graduée
    var L = simCorde.cordeLength;
    if (L <= 0) return;
    var mPerPx   = CORDE_LENGTH_M / L;
    var xM       = (x - simCorde.cordeLeft) * mPerPx;
    var H        = tubeCanvas.clientHeight;
    var yRoom    = H - bottom;
    if (yRoom < 6) return;

    var fontSize = Math.max(13, Math.min(18, Math.round(yRoom * 0.75)));
    var tickMaj  = Math.min(yRoom * 0.40, 6);

    ctx.save();
    ctx.fillStyle    = color;
    ctx.font         = 'bold ' + fontSize + 'px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(fmtFR(xM, 2), x, bottom + tickMaj + 1);
    ctx.restore();
}

// ── Règle graduée corde ───────────────────────────────────────────────

function _drawCordeRuler(ctx) {
    var L = simCorde.cordeLength;
    if (L <= 0) return;

    var H        = tubeCanvas.clientHeight;
    var yBase    = simCorde.cordeBottom;
    var yRoom    = H - yBase;
    if (yRoom < 6) return;

    var mPerPx   = CORDE_LENGTH_M / L;
    var xMaxM    = CORDE_LENGTH_M;

    var range    = xMaxM;
    var rough    = range / 6;
    var mag      = Math.pow(10, Math.floor(Math.log10(rough)));
    var mant     = rough / mag;
    var step     = mant < 1.5 ? mag : mant < 3.5 ? 2 * mag : mant < 7.5 ? 5 * mag : 10 * mag;
    var decimals = step < 1 ? 1 : 0;

    var fontSize = Math.max(13, Math.min(18, Math.round(yRoom * 0.75)));
    var tickMaj  = Math.min(yRoom * 0.40, 6);
    var tickMin  = tickMaj * 0.55;

    ctx.save();
    ctx.font         = fontSize + 'px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    // Ligne de base
    ctx.strokeStyle = '#8a9aaa';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(simCorde.cordeLeft, yBase);
    ctx.lineTo(simCorde.cordeRight, yBase);
    ctx.stroke();

    // Ticks principaux
    ctx.strokeStyle = '#5a6a78';
    ctx.lineWidth   = 1;
    ctx.fillStyle   = '#5a6a78';

    for (var m_ = 0; m_ <= xMaxM + step * 0.01; m_ += step) {
        var xc = simCorde.cordeLeft + m_ / mPerPx;
        if (xc > simCorde.cordeRight + 0.5) break;
        ctx.beginPath();
        ctx.moveTo(xc, yBase);
        ctx.lineTo(xc, yBase + tickMaj);
        ctx.stroke();
        ctx.fillText(m_ === 0 ? '0' : fmtFR(m_, decimals), xc, yBase + tickMaj + 1);
    }

    // Ticks secondaires
    ctx.strokeStyle = '#a0b0bc';
    ctx.lineWidth   = 0.8;
    var halfStep = step / 2;
    for (var m2 = halfStep; m2 <= xMaxM + halfStep * 0.01; m2 += step) {
        var xc2 = simCorde.cordeLeft + m2 / mPerPx;
        if (xc2 > simCorde.cordeRight + 0.5) break;
        ctx.beginPath();
        ctx.moveTo(xc2, yBase);
        ctx.lineTo(xc2, yBase + tickMin);
        ctx.stroke();
    }

    // Unité
    if (yRoom >= 14) {
        ctx.fillStyle    = '#7a8a96';
        ctx.font         = Math.max(12, fontSize - 1) + 'px monospace';
        ctx.textAlign    = 'right';
        ctx.fillText('m', simCorde.cordeLeft - 8, yBase + tickMaj + 1);
    }

    ctx.restore();
}

