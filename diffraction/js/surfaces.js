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
//  Optimisations de la boucle chaude (aucun effet visible, cf. chaque point pour le détail) :
//    • la phase constante k·barrierX est sortie du cache et réinjectée au rendu par un décalage
//      de l'origine des temps — cf. _surfHuygensPQAtCell ;
//    • le champ étant symétrique haut/bas, seule la moitié haute de la grille est calculée, le
//      reste est recopié — facteur 2 exact sur le rebuild, cf. _rebuildSurfFieldCache ;
//    • sin/cos y sont lus dans une table interpolée (_surfSinTab/_surfCosTab) plutôt qu'appelés
//      des millions de fois ;
//    • le rendu par frame écrit des couleurs pré-empaquetées 32 bits (_surfColLUT) via une vue
//      Uint32Array de l'ImageData, et recopie telle quelle la bande d'onde plane à gauche de
//      l'obstacle, identique sur toutes les lignes.
//
//  Le budget ainsi dégagé est dépensé en résolution de grille : 9 cellules par λ au lieu de 5,
//  bornées par un budget global de cellules (et non plus par des maxima séparés en largeur et en
//  hauteur), lui-même ajusté à la machine par un régulateur de performance — cf. les constantes
//  SURF_GRID_* / SURF_PERF_* et _surfPerfSample. Pendant un geste (glissement de slider), une
//  grille d'aperçu ~4× moins chère tient lieu de rendu, la grille définitive n'étant calculée
//  qu'à l'accalmie — cf. _scheduleSurfRebuild.
//
//  Le cadrage, enfin, se règle en largeur de vue (cm) — slider continu ou molette sur le bassin,
//  avec une barre d'échelle graduée comme repère. Il reste FIXE EN CENTIMÈTRES, jamais indexé sur
//  λ : cf. la discussion en tête du bloc SURF_VIEW_* pour la raison, qui est pédagogique.
//
//  Dépend de : sim.js, scene.js (formatFr). Chargé après graph.js, avant ui.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Constantes ────────────────────────────────────────────────────────
var SURF_C_CM           = 9.6;  // célérité de l'onde (cm/s), fixe
// ── Cadrage du bassin ─────────────────────────────────────────────────
// Le zoom se règle DIRECTEMENT en largeur de vue (cm), la grandeur physique que l'utilisateur
// lit sur le slider et sur la barre d'échelle (cf. _drawSurfScaleBar) — plus de facteur abstrait
// dont le « ×1 » désignait paradoxalement le dézoom maximal.
//
// Ce cadrage est FIXE EN CENTIMÈTRES : rien ici ne réagit à λ. C'est délibéré et non
// négociable pédagogiquement — un cadrage qui suivrait λ rendrait toutes les vues semblables
// (la figure ne dépend que de a/λ), et le slider λ semblerait ne rien faire alors que c'est
// précisément l'effet qu'on veut montrer. La contrepartie assumée : aux petites λ dans une vue
// large, une longueur d'onde ne fait plus que quelques pixels — c'est à l'utilisateur de zoomer,
// d'où l'importance d'un zoom qui va assez loin.
//
// Le défaut n'est PLUS la vue la plus large (qui était aussi la moins lisible de toute la plage).
// Bornes et défaut sont choisis pour que le facteur de zoom AFFICHÉ tombe juste : le libellé
// montre ×(défaut/vue), donc ×1 = vue par défaut, et la plage 25↔200 cm autour de 100 cm donne
// exactement ×0,5 (le plus large) à ×4 (le plus serré).
var SURF_VIEW_MIN_CM     = 25;   // vue la plus serrée (slider à droite) → ×4
var SURF_VIEW_MAX_CM     = 200;  // vue la plus large  (slider à gauche) → ×0,5
var SURF_VIEW_DEFAULT_CM = 100;  // → ×1
// Slider à progression GÉOMÉTRIQUE (chaque cran multiplie la largeur de vue par un facteur
// constant) : c'est ce qui rend les pas perceptivement uniformes. 240 crans ⇒ +0,8 % par cran,
// donc un glissement continu à l'œil. Ce qui interdisait un slider continu autrefois — un
// rebuild complet par évènement — a disparu avec la grille d'aperçu (cf. _scheduleSurfRebuild).
var SURF_ZOOM_STEPS      = 240;
var SURF_WHEEL_SENS      = 0.0015; // molette : facteur exp(deltaY · sens) sur la largeur de vue
var SURF_GRAPH_WINDOW   = 5;    // fenêtre temporelle du graphe y(t), en s
var SURF_GRID_FACTOR    = 4;    // sous-échantillonnage du champ (px CSS par cellule de grille) à zoom=1

// ── Dimensionnement de la grille de calcul du champ ───────────────────
// Deux exigences concurrentes, toutes deux au rapport d'aspect du canvas (cf.
// _rebuildSurfFieldCache) — la plus forte l'emporte :
//   • le CADRAGE ÉCRAN (SURF_GRID_FACTOR px CSS par cellule), qui suffit aux grandes longueurs
//     d'onde et garde la grille bon marché ;
//   • l'ÉCHANTILLONNAGE DE L'ONDE (SURF_GRID_CELLS_PER_LAMBDA cellules par λ), qui commande dès
//     que λ est petit devant la largeur de vue — c'est le régime où la figure d'interférences se
//     brouillait. 9 échantillons par période : en dessous de ~8, la reconstruction bilinéaire de
//     l'agrandissement (cf. drawSurfaces) laisse une ondulation d'amplitude parasite et un moiré
//     avec la trame de la grille. (Valeur précédente : 5.)
// Le coût est borné non plus par des maxima SÉPARÉS en largeur et en hauteur — qui écrasaient la
// largeur bien avant la hauteur, donc déformaient la grille — mais par des BUDGETS globaux : au
// delà, les deux dimensions sont divisées par le même facteur. La dégradation est ainsi
// progressive et isotrope au lieu d'être une falaise sur un seul axe. Deux budgets, parce que les
// deux coûts ne suivent pas la même loi : le dessin par frame ∝ cellules, le rebuild ∝ cellules ×
// sources (cf. SURF_REBUILD_BUDGET plus bas).
var SURF_GRID_CELLS_PER_LAMBDA = 9;
var SURF_GRID_BUDGET       = 360000; // cellules, grille définitive
var SURF_GRID_BUDGET_DRAFT = 90000;  // cellules, grille d'aperçu pendant un geste (cf. _scheduleSurfRebuild)
var SURF_GRID_MIN_W        = 40;
var SURF_GRID_MIN_H        = 30;

// PLAFOND ÉCRAN — une cellule par pixel CSS. Au-delà, la finesse calculée ne peut tout simplement
// pas s'afficher : c'est du calcul jeté. Ce plafond est aussi la limite théorique de la
// simulation — au dézoom maximal avec λ = 1 cm, une longueur d'onde ne couvre que ~4,5 pixels
// écran, donc aucune grille, si fine soit-elle, ne rendra ce réglage net. C'est à l'utilisateur
// de zoomer ; le budget ci-dessus est dimensionné pour atteindre CE plafond, pas pour le dépasser.

// PLAFOND DE COÛT DU REBUILD — le nombre de cellules ne borne que le dessin par frame ; le
// rebuild, lui, coûte cellules × sources (la symétrie haut/bas n'en calculant que la moitié,
// d'où le facteur 2 à l'usage). Or les sources de Huygens sont les plus nombreuses exactement là
// où l'on voudrait le plus de cellules : grande ouverture ET petite longueur d'onde. Sans ce
// second plafond, le temps de rebuild pourrait se mettre à figer visiblement l'affichage sur une
// machine modeste.
//
// Il est réglé pour NE PAS MORDRE sur la plage de réglages accessible : le pire cas est
// N = 3·a/λ = 90 sources (a = 30 cm, λ = 1 cm), qui demande SURF_GRID_BUDGET·N/2 = 16,2e6
// évaluations. Une première valeur plus basse (8e6) rabotait la grille dans tout le haut de la
// plage de `a`, proportionnellement à `a` puisque N lui est proportionnel — la figure se
// dégradait donc visiblement à mesure qu'on ouvrait la fente, alors même que c'est le réglage où
// le faisceau reste le plus brillant, donc où l'artefact se voit le plus. Le plafond ne sert donc
// plus que de garde-fou si SURF_GRID_BUDGET était relevé, ou sur un bassin au rapport
// hauteur/largeur inhabituel (un bassin haut coûte plus de cellules à finesse égale).
var SURF_REBUILD_BUDGET       = 17e6; // évaluations source×cellule par rebuild définitif
var SURF_REBUILD_BUDGET_DRAFT = 2e6;  // idem, grille d'aperçu (lui mord, et c'est voulu)

// ── Aperçu pendant les gestes, puis raffinement ───────────────────────
// Deux demandes de rebuild rapprochées de moins de SURF_INTERACT_WINDOW_MS = un geste en cours
// (glissement de slider, répétition clavier). On ne calcule alors qu'une grille d'aperçu
// (SURF_GRID_BUDGET_DRAFT, ~4× moins chère), et la grille définitive n'est calculée qu'après
// SURF_REFINE_DELAY_MS sans nouvelle demande. Une action isolée (clic, reset, changement
// d'onglet) part au contraire directement en pleine résolution.
var SURF_INTERACT_WINDOW_MS = 350;
var SURF_REFINE_DELAY_MS    = 260;

// ── Régulateur de performance ─────────────────────────────────────────
// Le budget ci-dessus est calibré pour une machine correcte ; sur un portable de lycée le dessin
// par frame peut ne plus tenir dans le budget d'une frame. On mesure donc la durée réelle de la
// boucle de rendu (moyenne sur SURF_PERF_SAMPLES frames) et on rabote — ou on redonne — du
// budget. Descente proportionnelle (viser SURF_PERF_MS_HIGH d'un coup, le coût étant linéaire en
// nombre de cellules), remontée prudente par paliers de 25 %. Garde-fous contre l'oscillation :
// seuils asymétriques (on descend au-dessus de SURF_PERF_MS_HIGH, on ne remonte qu'en dessous de
// SURF_PERF_MS_LOW), écart minimal de 5 % pour agir, et délai minimal entre deux ajustements —
// chacun coûtant un rebuild.
var SURF_PERF_SAMPLES     = 30;
var SURF_PERF_MS_HIGH     = 9;
var SURF_PERF_MS_LOW      = 4;
var SURF_PERF_SCALE_MIN   = 0.2;
var SURF_PERF_COOLDOWN_MS = 1500;

// ── Flou d'agrandissement ─────────────────────────────────────────────
// L'agrandissement bilinéaire de la grille vers l'écran laisse voir sa trame quand une cellule
// dépasse quelques pixels. Un flou léger la gomme — mais ctx.filter alloue une surface temporaire
// à chaque frame, c'est cher. On ne l'applique donc QUE dans ce régime (grandes longueurs d'onde,
// grille au cadrage écran), et pas quand la grille est déjà très fine (petits λ) : c'est
// justement là qu'on a le moins de marge. À SURF_GRID_FACTOR = 4 px/cellule, la formule redonne
// le rayon de 0,6 px utilisé jusqu'ici.
var SURF_BLUR_MIN_PX_PER_CELL = 2.5;
var SURF_BLUR_RATIO           = 0.15;
var SURF_BLUR_MAX_PX          = 1.0;
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

// ── Compensation de l'étalement géométrique (contraste du bassin) ─────────────
// L'onde plane incidente a l'amplitude 1 (calibre de la palette crête↔creux), mais derrière
// l'ouverture le champ est cylindrique : son amplitude décroît en 1/√r. Aux réglages par
// défaut (λ=4 cm, a=5 cm, ~25 λ de profondeur visible) elle tombe à ~0,25 en bord droit — le
// mapping linéaire ne balaie alors que le voisinage de SURF_COL_BG, d'où un motif diffracté
// délavé bien qu'il soit physiquement correct.
// On multiplie donc le champ, AU RENDU SEULEMENT, par g(z,y) = min(SURF_GAIN_MAX, √(r/r₀)),
// r = distance parcourue depuis l'ouverture (cf. _surfRmin, la même que pour le front causal) :
//   • g ne dépend que de la POSITION, jamais de l'amplitude → le rapport entre un lobe et une
//     annulation du sinc est rigoureusement inchangé, les minima restent des lignes noires ;
//   • g varie sur l'échelle de r, pas sur celle de λ → aucune harmonique spatiale créée, donc
//     pas de repliement sur la grille (5 à 7 cellules par λ, cf. SURF_GRID_CELLS_PER_LAMBDA) ;
//   • il annule exactement le 1/√r, donc le motif garde le même contraste près et loin de la
//     fente au lieu de s'éteindre vers le bord droit.
// (Une compression non linéaire du champ instantané — signe(u)·|u|^γ — a été essayée d'abord :
// son gain est maximal là où |u| est petit, donc elle comble les annulations du sinc, et elle
// transforme le cosinus en quasi-créneau dont les harmoniques 3k, 5k… se replient sur la
// grille → crénelage des surfaces d'onde. Deux défauts intrinsèques, sans bon réglage de γ.)
// r₀ = début de la décroissance cylindrique : au-delà de la distance de Fresnel a²/λ (en deçà,
// pour une ouverture large, l'onde n'a pas encore commencé à s'étaler et vaut déjà ~1 — la
// compenser la ferait saturer), avec un plancher de SURF_GAIN_R0_LAMBDA·λ pour les petites
// ouvertures. g = 1 pour r < r₀ → continuité avec l'onde incidente à la sortie de la fente.
// À noter : les graphes Hauteur(t) et Amplitude(y) lisent rightP/rightQ (via _surfSampleGridPQ),
// PAS ce gain — ils restent donc rigoureusement physiques.
var SURF_GAIN_MAX       = 3.5;  // plafond (sinon écrêtage massif du champ lointain)
var SURF_GAIN_R0_LAMBDA = 3;    // plancher de r₀, en longueurs d'onde

// ── Barre d'échelle (cf. _drawSurfScaleBar) ──────────────────────────
// Le cadrage étant désormais réglable en continu, une référence métrique dessinée dans le bassin
// devient indispensable pour situer les distances. Bénéfice secondaire, et pas le moindre : elle
// rend le changement de λ PLUS explicite qu'avant, les crêtes se resserrant contre une règle qui,
// elle, ne bouge pas.
var SURF_SCALE_NICE_CM   = [1, 2, 5, 10, 20, 50, 100, 200]; // longueurs « rondes » admissibles
var SURF_SCALE_TARGET_FR = 0.14; // longueur visée, en fraction de la largeur du bassin

// Couleurs de l'onde (crêtes ↔ creux) — identiques à ondes/js/vagues.js pour
// une cohérence visuelle entre les pages du site.
var SURF_COL_CREST  = [200, 240, 255];
var SURF_COL_TROUGH = [0, 10, 55];
// SURF_COL_BG = midpoint crête/creux → pas de cassure au front d'onde ni hors
// du bassin non encore atteint par l'onde.
var SURF_COL_BG      = [100, 125, 155];

// ── Table de sinus/cosinus (rebuild) ──────────────────────────────────
// La somme de Huygens évalue sin(k·r) et cos(k·r) pour CHAQUE couple (cellule, source), soit
// plusieurs millions d'appels par rebuild dans les pires réglages — c'est le poste dominant.
// Math.sin/Math.cos y sont remplacés par une table de SURF_TRIG_N valeurs sur une période, lue
// avec interpolation linéaire : l'erreur maximale vaut (2π/N)²/8 ≈ 3·10⁻⁷ pour N = 4096, soit
// très en deçà du pas d'une couleur 8 bits — indétectable à l'écran, mais ~3× plus rapide.
// Indexation par ET binaire (d'où une taille en puissance de 2) : la phase k·r est toujours
// positive et reste largement sous 2³¹ pour toute taille de canvas réaliste, donc `| 0` suffit
// à en prendre la partie entière.
var SURF_TRIG_BITS  = 12;
var SURF_TRIG_N     = 1 << SURF_TRIG_BITS;   // 4096
var SURF_TRIG_MASK  = SURF_TRIG_N - 1;
var SURF_TRIG_SCALE = SURF_TRIG_N / (2 * Math.PI); // radians → unités de table
var _surfSinTab = new Float64Array(SURF_TRIG_N + 1); // +1 : borne haute de l'interpolation
var _surfCosTab = new Float64Array(SURF_TRIG_N + 1);
(function _buildSurfTrigTables() {
    for (var i = 0; i <= SURF_TRIG_N; i++) {
        var ang = 2 * Math.PI * i / SURF_TRIG_N;
        _surfSinTab[i] = Math.sin(ang);
        _surfCosTab[i] = Math.cos(ang);
    }
})();

// ── Table de couleurs (rendu par frame) ───────────────────────────────
// Le rendu convertit le champ (∈ [-1, 1]) en RVBA pour chaque cellule de grille, à chaque frame.
// Au lieu de réinterpoler les 3 canaux puis d'écrire 4 octets, on pré-calcule les couleurs déjà
// empaquetées en 32 bits : une lecture de table + UNE écriture dans une vue Uint32Array de
// l'ImageData. SURF_COL_LUT_N = 512 dépasse largement l'amplitude maximale d'un canal (200
// niveaux pour le bleu), donc aucun risque de bandes.
// L'ordre des octets dans un mot de 32 bits dépend du boutisme de la machine, d'où la sonde.
var SURF_COL_LUT_N   = 512;
var SURF_COL_LUT_MAX = SURF_COL_LUT_N - 1;
var SURF_COL_LUT_HALF = SURF_COL_LUT_MAX / 2; // champ ∈ [-1,1] → indice : (raw + 1) * HALF
var _surfColLUT = new Uint32Array(SURF_COL_LUT_N);
(function _buildSurfColorLUT() {
    var probe = new ArrayBuffer(4);
    new Uint32Array(probe)[0] = 0x0a0b0c0d;
    var littleEndian = (new Uint8Array(probe)[0] === 0x0d);
    for (var i = 0; i < SURF_COL_LUT_N; i++) {
        var t01 = i / SURF_COL_LUT_MAX;
        var r = Math.round(SURF_COL_TROUGH[0] + t01 * (SURF_COL_CREST[0] - SURF_COL_TROUGH[0]));
        var g = Math.round(SURF_COL_TROUGH[1] + t01 * (SURF_COL_CREST[1] - SURF_COL_TROUGH[1]));
        var b = Math.round(SURF_COL_TROUGH[2] + t01 * (SURF_COL_CREST[2] - SURF_COL_TROUGH[2]));
        _surfColLUT[i] = littleEndian
            ? (((255 << 24) | (b << 16) | (g << 8) | r) >>> 0)
            : (((r << 24) | (g << 16) | (b << 8) | 255) >>> 0);
    }
})();

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
    viewCm      : SURF_VIEW_DEFAULT_CM, // largeur de vue du bassin, en cm — SEULE grandeur du zoom (cf. constantes ci-dessus)
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

    // ── Grille de calcul du champ ────────────────────────────────────
    // perfScale : fraction du budget de cellules réellement utilisée, pilotée par le régulateur
    // de performance (cf. _surfPerfSample) — propriété de la MACHINE, jamais remise à 1 par un
    // reset de la simulation. gridIsDraft : la grille en place n'est qu'un aperçu de geste (cf.
    // _scheduleSurfRebuild), à ne pas prendre en compte dans les mesures de performance.
    perfScale    : 1,
    gridIsDraft  : false
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
    simSurf.pxPerCm = w / simSurf.viewCm;
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
var _surfRefineTimer  = null;
var _surfLastReqT     = -1e9;

function _surfNow() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function _scheduleSurfRebuild() {
    var now = _surfNow();
    // Geste en cours ? (cf. SURF_INTERACT_WINDOW_MS) — si oui, l'aperçu se contente de la grille
    // brouillon et la grille définitive attend l'accalmie ; sinon on va directement au définitif.
    var asDraft = (now - _surfLastReqT) < SURF_INTERACT_WINDOW_MS;
    _surfLastReqT = now;

    if (_surfRefineTimer) { clearTimeout(_surfRefineTimer); _surfRefineTimer = null; }
    if (asDraft) {
        _surfRefineTimer = setTimeout(function () {
            _surfRefineTimer = null;
            _rebuildSurfFieldCache(false);
        }, SURF_REFINE_DELAY_MS);
    }

    // Au-delà de SURF_REBUILD_DEBOUNCE_N sources, un rebuild par frame (rAF) pendant un drag de
    // slider devient trop coûteux (cf. discussion : lag sur a max / λ min) — on bascule sur un
    // anti-rebond à 100 ms (un seul rebuild après une pause dans le glissement) au lieu d'un par
    // frame. En dessous de ce seuil, rAF reste réactif sans souci de perf. Le seuil est doublé
    // pour une grille brouillon, ~4× moins chère à calculer.
    var nMax = asDraft ? SURF_REBUILD_DEBOUNCE_N * 2 : SURF_REBUILD_DEBOUNCE_N;
    if (_surfEstimateSourceCount() > nMax) {
        if (_surfRebuildTimer) clearTimeout(_surfRebuildTimer);
        _surfRebuildTimer = setTimeout(function () {
            _surfRebuildTimer = null;
            _rebuildSurfFieldCache(asDraft);
        }, 100);
        return;
    }
    if (_surfRebuildScheduled) return;
    _surfRebuildScheduled = true;
    requestAnimationFrame(function () {
        _surfRebuildScheduled = false;
        _rebuildSurfFieldCache(asDraft);
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
//  ∝ exp(i(k·r - ωt))/√r (décroissance géométrique 1/√r d'une onde cylindrique, avec un
//  plancher SURF_GEO_R_FLOOR·λ pour éviter la singularité tout contre une source).
//
//  PHASE DE L'OBSTACLE SORTIE DU CALCUL — la distance totale parcourue depuis l'origine vaut
//  R = barrierX + r, mais le terme k·barrierX est le MÊME pour toutes les cellules et toutes
//  les sources : c'est une rotation globale du couple (P,Q). L'y inclure ici reviendrait à la
//  payer des millions de fois par rebuild, et rendrait le cache dépendant de la position de
//  l'obstacle. On calcule donc P,Q pour R = r seul, et on réinjecte k·barrierX au rendu en
//  décalant simplement l'origine des temps :
//      P·cos(ωt) + Q·sin(ωt)  avec la phase incluse
//    = P₀·cos(ωt - k·barrierX) + Q₀·sin(ωt - k·barrierX)  sans elle
//  soit DEUX évaluations trigonométriques par frame au lieu d'une par couple (cellule, source).
//  Tous les consommateurs de P,Q (cf. drawSurfaces, _surfFieldRaw) doivent donc appliquer ce
//  décalage ; l'enveloppe √(P²+Q²), invariante par rotation, n'a rien à changer.
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

// Chemin de repli (points isolés : point M, axe de coupe) quand le cache de grille n'est pas
// encore prêt. La boucle chaude équivalente est écrite en ligne dans _rebuildSurfFieldCache
// (pas d'objet {P,Q} alloué par cellule, table de sinus) — ici le coût est négligeable, on
// garde donc la version lisible avec Math.sin/Math.cos.
function _surfHuygensPQAtCell(sourcesInfo, lambda_px, z, y) {
    var k = 2 * Math.PI / lambda_px;
    var rFloor = SURF_GEO_R_FLOOR * lambda_px;
    var ys = sourcesInfo.ys, spacing = sourcesInfo.spacing;
    var N = ys.length;
    var z2 = z * z;
    var sSin = 0, sCos = 0; // Σ (spacing/√r)·sin(kr) et Σ (spacing/√r)·cos(kr)
    for (var i = 0; i < N; i++) {
        var dy = y - ys[i];
        var r = Math.sqrt(z2 + dy * dy);
        if (r < rFloor) r = rFloor;
        var wgt = spacing / Math.sqrt(r);
        sSin += wgt * Math.sin(k * r);
        sCos += wgt * Math.cos(k * r);
    }
    var norm = 1 / Math.sqrt(2 * lambda_px); // |1/√(iλ)|, réparti en P,Q ci-dessous
    return { P: norm * (sSin - sCos), Q: -norm * (sCos + sSin) };
}

function _rebuildSurfFieldCache(draft) {
    var s = simSurf;
    if (s.canvasW < 10 || s.canvasH < 10) return;

    var lambda_px = s.lambda * s.pxPerCm;
    if (lambda_px <= 0) return;

    // Dimensions de la grille — tout se joue sur UN scalaire, le nombre de cellules par pixel
    // CSS : les deux exigences (cadrage écran / échantillonnage de λ, cf. constantes en tête de
    // fichier) ayant le rapport d'aspect du canvas, la grille le conserve quoi qu'il arrive.
    var m = Math.max(1 / SURF_GRID_FACTOR, SURF_GRID_CELLS_PER_LAMBDA / lambda_px);
    if (m > 1) m = 1; // plafond écran : au-delà d'une cellule par pixel, rien ne s'affiche de plus
    var gw = s.canvasW * m;
    var gh = s.canvasH * m;

    // Puis les deux plafonds de coût (cf. constantes) : nombre de cellules pour le dessin par
    // frame, produit cellules × sources pour le rebuild. Le plus contraignant l'emporte, et le
    // dépassement divise les DEUX dimensions par le même facteur.
    var budget = (draft ? SURF_GRID_BUDGET_DRAFT : SURF_GRID_BUDGET) * s.perfScale;
    var cellCap = 2 * (draft ? SURF_REBUILD_BUDGET_DRAFT : SURF_REBUILD_BUDGET)
                    / Math.max(1, _surfEstimateSourceCount());
    if (cellCap < budget) budget = cellCap;
    if (gw * gh > budget) {
        var shrink = Math.sqrt(budget / (gw * gh));
        gw *= shrink;
        gh *= shrink;
    }
    gw = Math.max(SURF_GRID_MIN_W, Math.round(gw));
    gh = Math.max(SURF_GRID_MIN_H, Math.round(gh));
    s.gridIsDraft = !!draft;

    var k     = 2 * Math.PI / lambda_px;
    var c_px  = SURF_C_CM * s.pxPerCm;
    var omega = 2 * Math.PI * c_px / lambda_px;
    var w     = s.gapHalf;
    var cy0   = s.barrierCY;
    var sources = _surfHuygensSources(w, lambda_px);
    var srcYs = sources.ys, srcN = srcYs.length, spacing = sources.spacing;

    var leftSin   = new Float32Array(gw), leftCos = new Float32Array(gw);
    var rightP    = new Float32Array(gw * gh);
    var rightQ    = new Float32Array(gw * gh);
    var rightFront = new Float32Array(gw * gh); // distance (origine → cellule) déclenchant le front causal
    var rightGain  = new Float32Array(gw * gh); // compensation de l'étalement 1/√r, rendu seulement (cf. SURF_GAIN_MAX)

    // r₀ : distance à partir de laquelle la décroissance cylindrique s'installe (cf. constantes)
    var gainR0 = Math.max(SURF_GAIN_R0_LAMBDA * lambda_px, (2 * w) * (2 * w) / lambda_px);

    // Abscisse (px écran) de chaque colonne de grille, et première colonne située à DROITE de
    // l'obstacle : le test `px <= barrierX` ne dépend que de la colonne, inutile de le refaire
    // pour chaque cellule (ici) ni pour chaque cellule de chaque frame (cf. drawSurfaces).
    var gridPx = new Float64Array(gw);
    var gxBar  = gw;
    for (var gx = 0; gx < gw; gx++) {
        var px0 = (gx + 0.5) / gw * s.canvasW;
        gridPx[gx]  = px0;
        leftSin[gx] = Math.sin(k * px0);
        leftCos[gx] = Math.cos(k * px0);
        if (gxBar === gw && px0 > s.barrierX) gxBar = gx;
    }
    for (var gxz = 0; gxz < gxBar; gxz++) {
        // Zone à gauche de l'obstacle : pas de champ diffracté (cf. drawSurfaces, qui y applique
        // l'onde plane incidente). Front à l'infini → jamais atteint par le test causal.
        for (var gyz = 0; gyz < gh; gyz++) rightFront[gyz * gw + gxz] = Infinity;
    }
    rightGain.fill(1);

    var rFloor  = SURF_GEO_R_FLOOR * lambda_px;
    var norm    = 1 / Math.sqrt(2 * lambda_px); // |1/√(iλ)|, cf. _surfHuygensPQAtCell
    var kScaled = k * SURF_TRIG_SCALE;          // k·r directement en unités de table
    var SIN = _surfSinTab, COS = _surfCosTab, TMASK = SURF_TRIG_MASK;
    var dyArr = new Float64Array(srcN); // écarts source→cellule, constants sur une ligne

    // SYMÉTRIE HAUT/BAS — l'obstacle est centré (barrierCY = canvasH/2), les sources de Huygens
    // sont réparties symétriquement autour de l'axe de l'ouverture (cf. _surfHuygensSources,
    // règle du point milieu) et les lignes de grille sont elles-mêmes symétriques deux à deux
    // ((gy+0,5)/gh et (gh-1-gy+0,5)/gh sont de somme 1, donc d'ordonnées opposées par rapport à
    // canvasH/2, quelle que soit la parité de gh). Le champ vérifie donc P(z,-y) = P(z,y) : on ne
    // calcule que la moitié haute et on recopie ligne à ligne. Facteur 2 exact sur le rebuild.
    // (Si gh est impair, la ligne médiane est son propre miroir — d'où le test mgy > gy.)
    var halfRows = Math.ceil(gh / 2);
    for (var gy = 0; gy < halfRows; gy++) {
        var py = (gy + 0.5) / gh * s.canvasH;
        var y  = py - cy0;
        var rowOff = gy * gw;
        for (var si = 0; si < srcN; si++) dyArr[si] = y - srcYs[si];

        for (var gx2 = gxBar; gx2 < gw; gx2++) {
            var z   = gridPx[gx2] - s.barrierX;
            var z2  = z * z;
            var idx = rowOff + gx2;
            var rCell = _surfRmin(w, z, y);
            rightFront[idx] = s.barrierX + rCell;
            rightGain[idx]  = (rCell <= gainR0) ? 1
                            : Math.min(SURF_GAIN_MAX, Math.sqrt(rCell / gainR0));

            // Somme de Huygens en ligne (cf. _surfHuygensPQAtCell pour le modèle et la
            // normalisation) : boucle chaude du rebuild, d'où la table de sinus et l'absence
            // d'objet intermédiaire.
            var sSin = 0, sCos = 0;
            for (var si2 = 0; si2 < srcN; si2++) {
                var dy = dyArr[si2];
                var r = Math.sqrt(z2 + dy * dy);
                if (r < rFloor) r = rFloor;
                var ph = kScaled * r;
                var fi = ph | 0;
                var fr = ph - fi;
                var i0 = fi & TMASK, i1 = i0 + 1;
                var wgt = spacing / Math.sqrt(r);
                sSin += wgt * (SIN[i0] + fr * (SIN[i1] - SIN[i0]));
                sCos += wgt * (COS[i0] + fr * (COS[i1] - COS[i0]));
            }
            rightP[idx] =  norm * (sSin - sCos);
            rightQ[idx] = -norm * (sCos + sSin);
        }

        var mgy = gh - 1 - gy;
        if (mgy > gy) {
            var dstOff = mgy * gw;
            rightP.set(rightP.subarray(rowOff, rowOff + gw), dstOff);
            rightQ.set(rightQ.subarray(rowOff, rowOff + gw), dstOff);
            rightFront.set(rightFront.subarray(rowOff, rowOff + gw), dstOff);
            rightGain.set(rightGain.subarray(rowOff, rowOff + gw), dstOff);
        }
    }

    s.gridW = gw; s.gridH = gh;
    s.k = k; s.c_px = c_px; s.omega = omega;
    s.leftSin = leftSin; s.leftCos = leftCos;
    // barrierX est figé dans le cache (rightFront, et la phase k·barrierX que le rendu réinjecte) :
    // on le mémorise pour que le rendu reste cohérent avec la grille pendant les ~100 ms d'attente
    // d'un rebuild anti-rebondi, où s.barrierX a déjà changé mais pas encore la grille.
    s.gridPx = gridPx; s.gridBarrierCol = gxBar; s.gridBarrierX = s.barrierX;
    s.rightP = rightP; s.rightQ = rightQ; s.rightFront = rightFront; s.rightGain = rightGain;

    if (!s._offCanvas) s._offCanvas = document.createElement('canvas');
    s._offCanvas.width  = gw;
    s._offCanvas.height = gh;
    s._offCtx = s._offCanvas.getContext('2d');
    // Buffer de pixels réutilisé à chaque frame (cf. drawSurfaces) — évite de réallouer un
    // nouvel ImageData 60 fois par seconde (pression sur le ramasse-miettes).
    s._imgData = s._offCtx.createImageData(gw, gh);
    // Vue 32 bits sur le MÊME tampon : le rendu y écrit une couleur pré-empaquetée par cellule
    // (cf. _surfColLUT) au lieu de 4 octets, putImageData lit toujours s._imgData.
    s._imgU32   = new Uint32Array(s._imgData.data.buffer);
    s._leftRow  = new Uint32Array(gxBar); // bande gauche : identique sur toutes les lignes
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
        pq = _surfHuygensPQAtCell(sources, lambda_px, z, y);
    }
    // Décalage de l'origine des temps = phase constante k·barrierX sortie du calcul de P,Q
    // (cf. _surfHuygensPQAtCell) — même convention qu'au rendu.
    var th = omega * t - k * s.barrierX;
    return pq.P * Math.cos(th) + pq.Q * Math.sin(th);
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
        pq = _surfHuygensPQAtCell(sources, lambda_px, z, y);
    }
    // √(P²+Q²) est invariant par la rotation de phase k·barrierX — rien à réinjecter ici.
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
        _drawSurfScaleBar(ctx, W, H);
        return;
    }

    var t = s.simTime;
    var cosWT = Math.cos(s.omega * t), sinWT = Math.sin(s.omega * t);
    // Zone diffractée : la phase constante k·barrierX, sortie du cache (cf. _surfHuygensPQAtCell),
    // est réinjectée ici par un simple décalage de l'origine des temps.
    var thR   = s.omega * t - s.k * s.gridBarrierX;
    var cosWR = Math.cos(thR), sinWR = Math.sin(thR);
    var front     = s.c_px * t; // distance parcourue depuis l'origine (front causal, gauche ET droite)

    var tPerf0 = _surfNow(); // mesure pour le régulateur de performance (cf. _surfPerfSample)

    var gw = s.gridW, gh = s.gridH;
    var img  = s._imgData; // buffer réutilisé (cf. _rebuildSurfFieldCache), pas de réallocation par frame
    var out  = s._imgU32;  // même tampon, vu en couleurs 32 bits pré-empaquetées
    var LUT  = _surfColLUT, LHALF = SURF_COL_LUT_HALF, LMAX = SURF_COL_LUT_MAX;
    var gxBar = s.gridBarrierCol;
    var rightP = s.rightP, rightQ = s.rightQ, rightFront = s.rightFront, rightGain = s.rightGain;
    var ci;

    // Bande à gauche de l'obstacle : onde plane incidente, donc STRICTEMENT identique sur toutes
    // les lignes — on la calcule une fois par frame et on la recopie ligne à ligne (~30 % des
    // cellules du bassin, cf. barrierX à 30 % de la largeur).
    var leftRow = s._leftRow, leftSin = s.leftSin, leftCos = s.leftCos, gridPx = s.gridPx;
    for (var gxl = 0; gxl < gxBar; gxl++) {
        var rawL = (gridPx[gxl] > front) ? 0 : (cosWT * leftSin[gxl] - sinWT * leftCos[gxl]);
        ci = (rawL + 1) * LHALF;
        if (ci < 0) ci = 0; else if (ci > LMAX) ci = LMAX;
        leftRow[gxl] = LUT[ci | 0];
    }

    for (var gy = 0; gy < gh; gy++) {
        var rowOff = gy * gw;
        out.set(leftRow, rowOff);
        for (var gx = gxBar; gx < gw; gx++) {
            var idx = rowOff + gx;
            var raw;
            if (rightFront[idx] > front) {
                raw = 0;
            } else {
                // Gain purement géométrique (cf. SURF_GAIN_MAX) : rendu seulement, les graphes
                // lisent rightP/rightQ bruts.
                raw = (rightP[idx] * cosWR + rightQ[idx] * sinWR) * rightGain[idx];
            }
            // L'écrêtage à [-1, 1] du champ est assuré par le bornage de l'indice de couleur.
            ci = (raw + 1) * LHALF;
            if (ci < 0) ci = 0; else if (ci > LMAX) ci = LMAX;
            out[idx] = LUT[ci | 0];
        }
    }
    s._offCtx.putImageData(img, 0, 0);

    // Agrandissement natif (lissé) de la grille vers la taille d'affichage réelle — bien moins
    // coûteux qu'un remplissage par blocs en JS. Flou d'appoint pour adoucir la trame de la
    // grille (pas pour masquer du repliement : l'espacement des sources en
    // λ/SURF_HUYGENS_SPACING_DIV s'en charge déjà), conditionné à la taille écran d'une cellule
    // — cf. SURF_BLUR_MIN_PX_PER_CELL pour la justification.
    ctx.imageSmoothingEnabled = true;
    var pxPerCell = W / gw;
    var blurPx = (pxPerCell >= SURF_BLUR_MIN_PX_PER_CELL)
               ? Math.min(SURF_BLUR_MAX_PX, pxPerCell * SURF_BLUR_RATIO) : 0;
    if (blurPx > 0) ctx.filter = 'blur(' + blurPx.toFixed(2) + 'px)';
    ctx.drawImage(s._offCanvas, 0, 0, gw, gh, 0, 0, W, H);
    if (blurPx > 0) ctx.filter = 'none';
    // Mesuré ici, sur la seule partie dont le coût suit le budget de cellules (boucle de rendu +
    // agrandissement), à l'exclusion des surcouches vectorielles ci-dessous.
    var perfMs = _surfNow() - tPerf0;

    _drawBarrierSurf(ctx, W, H);
    if (s.showAngle) _drawSurfAngle(ctx, W, H);
    if (simSurf.showGraph) _drawSurfPoint(ctx);
    if (simSurf.showGraph && _surfAmpYActive()) _drawSurfCutAxis(ctx, H);
    _drawSurfScaleBar(ctx, W, H);

    _surfPerfSample(perfMs); // en dernier : peut déclencher un rebuild (cf. SURF_PERF_COOLDOWN_MS)
}

// ══════════════════════════════════════════════════════════════════════
//  Régulateur de performance — ajuste la fraction du budget de cellules réellement utilisée
//  (simSurf.perfScale) d'après le coût mesuré du rendu, pour que la simulation reste fluide sur
//  une machine modeste sans brider inutilement les autres. Cf. les constantes SURF_PERF_* pour
//  les seuils et les garde-fous anti-oscillation.
// ══════════════════════════════════════════════════════════════════════

var _surfPerfSum = 0, _surfPerfCount = 0, _surfPerfLastAdjust = -1e9;

function _surfPerfSample(ms) {
    var s = simSurf;
    // Une grille brouillon ne mesure pas le coût réel du rendu définitif : on l'ignore, et on
    // repart d'une moyenne vierge pour ne pas la contaminer.
    if (s.gridIsDraft) { _surfPerfSum = 0; _surfPerfCount = 0; return; }

    _surfPerfSum += ms;
    if (++_surfPerfCount < SURF_PERF_SAMPLES) return;
    var avg = _surfPerfSum / _surfPerfCount;
    _surfPerfSum = 0;
    _surfPerfCount = 0;

    var now = _surfNow();
    if (now - _surfPerfLastAdjust < SURF_PERF_COOLDOWN_MS) return;

    var next = s.perfScale;
    if (avg > SURF_PERF_MS_HIGH) {
        // Le coût du rendu est quasi linéaire en nombre de cellules : on vise DIRECTEMENT
        // SURF_PERF_MS_HIGH au lieu de descendre par paliers fixes, ce qui évite plusieurs
        // secondes de saccades avant convergence sur une machine lente. Correction bornée pour
        // ne pas sur-réagir à une rafale de frames parasites (onglet réactivé, autre appli…).
        next = Math.max(SURF_PERF_SCALE_MIN, s.perfScale * Math.max(0.4, SURF_PERF_MS_HIGH / avg));
    } else if (avg < SURF_PERF_MS_LOW) {
        // Remontée prudente, par paliers : rien ne presse, et un pas trop grand ferait osciller.
        next = Math.min(1, s.perfScale / 0.75);
    }
    // Sous 5 % d'écart, le gain ne vaut pas le rebuild.
    if (Math.abs(next - s.perfScale) < 0.05 * s.perfScale) return;

    s.perfScale = next;
    _surfPerfLastAdjust = now;
    _rebuildSurfFieldCache(false);
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

// Épaisseur exprimée en CENTIMÈTRES (grandeur physique) plutôt qu'en pixels écran, pour que
// l'obstacle garde une taille cohérente à tout cadrage. Bornée en pixels : la plage de zoom
// couvrant un facteur ~7, l'obstacle deviendrait sinon un pavé à la vue la plus serrée et un fil
// à la plus large.
var SURF_OBSTACLE_CM     = 1.35;
var SURF_OBSTACLE_MIN_PX = 6;
var SURF_OBSTACLE_MAX_PX = 50;

function _drawBarrierSurf(ctx, W, H) {
    var s = simSurf;
    ctx.save();
    // Couleur complémentaire de SURF_COL_BG (= milieu crête/creux, couleur moyenne des vagues) :
    // 255 - [100,125,155] = [155,130,100] = #9b8264.
    ctx.strokeStyle = '#9b8264';
    ctx.lineWidth = Math.max(SURF_OBSTACLE_MIN_PX,
                    Math.min(SURF_OBSTACLE_MAX_PX, SURF_OBSTACLE_CM * s.pxPerCm));
    ctx.beginPath();
    ctx.moveTo(s.barrierX, 0);
    ctx.lineTo(s.barrierX, Math.max(0, s.barrierCY - s.gapHalf));
    ctx.moveTo(s.barrierX, Math.min(H, s.barrierCY + s.gapHalf));
    ctx.lineTo(s.barrierX, H);
    ctx.stroke();
    ctx.restore();
}

// ── Barre d'échelle ──────────────────────────────────────────────────
// Référence métrique en bas à gauche du bassin — côté onde incidente, dont le motif régulier
// est le moins gênant à recouvrir. Longueur choisie parmi des valeurs rondes (cf.
// SURF_SCALE_NICE_CM), la plus proche de SURF_SCALE_TARGET_FR de la largeur du bassin, de sorte
// que le nombre affiché reste lisible à tout cadrage. Tracée en clair sur un liseré sombre, pour
// rester lisible aussi bien sur les crêtes que sur les creux.

function _drawSurfScaleBar(ctx, W, H) {
    var pxPerCm = simSurf.pxPerCm;
    if (!(pxPerCm > 0)) return;

    var targetPx = SURF_SCALE_TARGET_FR * W;
    var bestCm = SURF_SCALE_NICE_CM[0], bestErr = Infinity;
    for (var i = 0; i < SURF_SCALE_NICE_CM.length; i++) {
        // Écart comparé en RELATIF (rapport des longueurs) : sinon les grandes valeurs, dont
        // l'écart absolu est mécaniquement plus grand, ne seraient jamais retenues.
        var err = Math.abs(Math.log(SURF_SCALE_NICE_CM[i] * pxPerCm / targetPx));
        if (err < bestErr) { bestErr = err; bestCm = SURF_SCALE_NICE_CM[i]; }
    }

    var len = bestCm * pxPerCm;
    var x0 = 16, y = H - 18, tick = 5;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, y);           ctx.lineTo(x0 + len, y);
    ctx.moveTo(x0, y - tick);    ctx.lineTo(x0, y + tick);
    ctx.moveTo(x0 + len, y - tick); ctx.lineTo(x0 + len, y + tick);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0, 12, 40, 0.75)';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    var label = bestCm + ' cm';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0, 12, 40, 0.75)';
    ctx.strokeText(label, x0 + len / 2, y - tick - 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x0 + len / 2, y - tick - 3);
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
//  Zoom — réglé en largeur de vue (cm), du plus large (SURF_VIEW_MAX_CM, slider à gauche) au
//  plus serré (SURF_VIEW_MIN_CM, slider à droite) : le slider va donc dans le SENS NATUREL,
//  contrairement à l'ancien réglage à 3 crans dont le cran ×1 était le dézoom maximal.
//  Progression géométrique (cf. SURF_ZOOM_STEPS) pour des pas perceptivement uniformes.
//
//  N'affecte QUE pxPerCm : ni le rapport a/λ, ni le nombre de sources de Huygens, ni la physique.
//  Zoomer est même MOINS coûteux (moins de λ dans le champ ⇒ grille plus petite à
//  SURF_GRID_CELLS_PER_LAMBDA constant) ; seul le dézoom demande plus de cellules, et le budget
//  de B les borne. Les dizaines d'évènements d'un glissement ou d'un coup de molette ne
//  déclenchent qu'une grille d'aperçu, le définitif venant à l'accalmie (cf. _scheduleSurfRebuild).
// ══════════════════════════════════════════════════════════════════════

// Position de slider (0…SURF_ZOOM_STEPS) ↔ largeur de vue (cm), en progression géométrique.
function _surfViewFromSlider(pos) {
    var f = Math.max(0, Math.min(1, pos / SURF_ZOOM_STEPS));
    return SURF_VIEW_MAX_CM * Math.pow(SURF_VIEW_MIN_CM / SURF_VIEW_MAX_CM, f);
}

function _surfSliderFromView(cm) {
    var f = Math.log(SURF_VIEW_MAX_CM / cm) / Math.log(SURF_VIEW_MAX_CM / SURF_VIEW_MIN_CM);
    return Math.round(Math.max(0, Math.min(1, f)) * SURF_ZOOM_STEPS);
}

function _surfApplyZoom() {
    var s = simSurf;
    if (s.canvasW < 10) return;
    s.pxPerCm = s.canvasW / s.viewCm;
    updateSurfGeometry();
}

// Point d'entrée unique du zoom (slider, molette, reset) — `syncSlider` remet le curseur en
// place quand le changement ne vient pas de lui.
function _surfSetViewCm(cm, syncSlider) {
    var s = simSurf;
    s.viewCm = Math.max(SURF_VIEW_MIN_CM, Math.min(SURF_VIEW_MAX_CM, cm));

    // Affiché comme un facteur de zoom classique — ×1 = vue par défaut, plus grand = plus zoomé
    // (cf. bornes SURF_VIEW_*). La largeur de vue en cm, elle, se lit sur la barre d'échelle
    // dessinée dans le bassin (cf. _drawSurfScaleBar).
    var lbl = document.getElementById('lbl-zoom-surf');
    if (lbl) lbl.textContent = (SURF_VIEW_DEFAULT_CM / s.viewCm).toFixed(1).replace('.', ',');
    if (syncSlider) {
        var sl = document.getElementById('sl-zoom-surf');
        if (sl) sl.value = _surfSliderFromView(s.viewCm);
    }
    _surfApplyZoom();
    _syncSurfAngleWarning();
}

function onSliderZoomSurf(v) {
    _surfSetViewCm(_surfViewFromSlider(parseInt(v, 10)), false);
}

// ── Molette sur le bassin ────────────────────────────────────────────
// Variation MULTIPLICATIVE de la largeur de vue, comme le slider : un cran de molette change la
// vue du même pourcentage où qu'on soit dans la plage. Ancrée sur l'ouverture comme le slider
// (barrierX reste à 30 % de la largeur, l'axe reste centré) : la figure étant un éventail issu
// de l'ouverture, la garder à poste fixe conserve TOUS les lobes à l'écran quel que soit le zoom
// — d'où l'absence de panoramique à prévoir.
function initSurfWheelZoom() {
    var canvas = document.getElementById('surf-canvas');
    if (!canvas) return;
    canvas.addEventListener('wheel', function (evt) {
        // deltaMode : 0 = pixels, 1 = lignes, 2 = pages — normalisé en « pixels » approximatifs.
        var d = evt.deltaY;
        if (evt.deltaMode === 1) d *= 16;
        else if (evt.deltaMode === 2) d *= 400;
        if (!d) return;
        evt.preventDefault(); // sinon la page défile sous le curseur pendant qu'on zoome
        _surfSetViewCm(simSurf.viewCm * Math.exp(d * SURF_WHEEL_SENS), true);
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
//  Le bassin affiché ne couvre que ~0,70·viewCm cm derrière l'obstacle (30% de la largeur est
//  occupée par l'obstacle) : si cette profondeur est trop courte devant a²/λ, l'angle ne peut pas
//  se voir sur la figure. Comme le cadrage est maintenant réglable en continu, l'avertissement
//  suit le zoom — dézoomer suffit parfois à le faire disparaître.
// ══════════════════════════════════════════════════════════════════════
function _syncSurfAngleWarning() {
    var warn = document.getElementById('surf-angle-warning');
    if (!warn) return;
    var fraunhoferDist = (simSurf.a * simSurf.a) / simSurf.lambda;
    var visibleDepth = 0.70 * simSurf.viewCm;
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
    simSurf.viewCm  = SURF_VIEW_DEFAULT_CM;
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

    // Remet le cadrage par défaut, resynchronise slider + libellé, recalcule pxPerCm et la
    // géométrie, et programme le rebuild.
    _surfSetViewCm(SURF_VIEW_DEFAULT_CM, true);
    _updateSurfRatioReadout();
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation — appelée depuis ui.js → init()
// ══════════════════════════════════════════════════════════════════════

function initSurfaces() {
    initSurfDrag();
    initSurfWheelZoom();
    _surfSetViewCm(simSurf.viewCm, true); // aligne slider et libellé sur SURF_VIEW_DEFAULT_CM
    _updateSurfRatioReadout();
    syncValeursSurfUI();
    syncSurfGraphUI();
}
