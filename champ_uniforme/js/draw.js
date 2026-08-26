/* ══════════════════════════════════════════════════
   Simulation pédagogique — Physique-Chimie Lycée
   Auteur  : Mathieu Berdous
   Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
══════════════════════════════════════════════════ */

/* draw.js — rendu canvas animation (champ de pesanteur) */

/* ── Image du ballon ── */
var _ballonImg = new Image();
_ballonImg.src = 'ballon.png';

/* ── Échelles visuelles des vecteurs (champ de pesanteur) ──
   Valeurs de référence, exprimées pour un canvas d'animation de
   VEC_SCALE_REF_H px de haut.
   VEC_SCALE_VIT et VEC_SCALE_ACC en sont dérivées à chaque redimensionnement
   par _updateVecScales() : en px absolus, une flèche d'accélération mesurait
   98 px à g = 9,81 et 200 px à g = 20 quelle que soit la taille de la
   fenêtre, ce qui la rendait démesurée sur petite fenêtre — de même que les
   flèches de champ g⃗, calées sur la même échelle. */
var VEC_SCALE_POS = 0.22;   // fraction de l'échelle physique
var VEC_SCALE_VIT_REF = 7.5;    // px par m/s   (canvas de référence)
var VEC_SCALE_ACC_REF = 10;     // px par m/s²  (canvas de référence)
var VEC_SCALE_REF_H   = 520;    // hauteur de canvas de référence (px)
var VEC_SCALE_MIN_F   = 0.55;   // réduction maximale sur très petite fenêtre

var VEC_SCALE_VIT = VEC_SCALE_VIT_REF;
var VEC_SCALE_ACC = VEC_SCALE_ACC_REF;

/* Facteur de taille : décroît proportionnellement sous la hauteur de
   référence, sans passer sous VEC_SCALE_MIN_F, et croît au-dessus, plafonné
   au même agrandissement maximal que le texte (ANIM_TXT_MAX_F).

   Il était borné à 1 vers le haut : les flèches gardaient donc leur longueur
   de référence en px pendant que la scène, elle, continuait de grandir avec
   le canvas. En relatif elles rétrécissaient — le même défaut que les
   étiquettes plafonnées. Les longueurs restent des grandeurs physiques (px
   par m/s), mais l'échelle qui les convertit suit la taille de la scène,
   comme le fait déjà l'échelle du vecteur position (VEC_SCALE_POS, une
   fraction de l'échelle physique). */
function _vecScaleFactor() {
    if (!_animH) return 1;
    return Math.max(VEC_SCALE_MIN_F,
                    Math.min(ANIM_TXT_MAX_F, _animH / VEC_SCALE_REF_H));
}

/* Appelé depuis resizeAnimCanvas(), seul endroit où _animH change. */
function _updateVecScales() {
    var f = _vecScaleFactor();
    VEC_SCALE_VIT   = VEC_SCALE_VIT_REF   * f;
    VEC_SCALE_ACC   = VEC_SCALE_ACC_REF   * f;
    VEC_SCALE_FORCE = VEC_SCALE_FORCE_REF * f;
}

/* ── Échelles vecteurs du champ électrique ──────────────────────
   Contrairement au champ de pesanteur, elles ne sont pas constantes : simE les
   recalcule à chaque resetSimE() pour viser ~55 px à partir de v0 et E, et
   chaque simulation sauvegardée en emporte une copie. Ces valeurs restent donc
   des RÉFÉRENCES, calées sur un canvas de référence, et le facteur de taille
   est appliqué ici — une seule fois par frame, au début de drawAnimE, plutôt
   qu'aux dix endroits où elles sont lues (risque d'en oublier un, ou de
   l'appliquer deux fois).
─────────────────────────────────────────────────────────────── */
var _vsE = { f: 1, vit: 1, acc: 1, force: 1 };

function _updateVecScalesE() {
    var f = _vecScaleFactor();
    _vsE.f     = f;
    _vsE.vit   = simE.vecScaleVit   * f;
    _vsE.acc   = simE.vecScaleAcc   * f;
    _vsE.force = simE.vecScaleForce * f;
}

/* Échelles d'une run sauvegardée, ramenées à la taille courante du canvas.
   Repli sur celles de la simulation en cours pour les runs enregistrées avant
   que ces champs n'existent. */
function _runVecScalesE(run) {
    return {
        vit: (run.vecScaleVit || simE.vecScaleVit) * _vsE.f,
        acc: (run.vecScaleAcc || simE.vecScaleAcc) * _vsE.f
    };
}

/* Liseré blanc autour des vecteurs, pour les détacher du fond. Volontairement
   très fin : VEC_HALO_W est le débord de CHAQUE côté, en px. */
var VEC_HALO_COLOR = '#ffffff';
var VEC_HALO_W     = 1;

/* Couleurs vecteurs */
var COL_VEC_POS    = '#2a6aaa';
var COL_VEC_VIT    = '#c03030';
var COL_VEC_ACC    = '#2a8a50';
var COL_VEC_FORCES = '#8e44ad';
var COL_VEC_SUMF   = '#8d4e20';

/* Vecteurs plus visibles en mode armatures perpendiculaires à l'axe x
   (trait plus épais, opacité 1 — couleur et longueur inchangées).
   Seule la vitesse change aussi de couleur (rouge plus vif). */
var COL_VEC_POS_PERP    = COL_VEC_POS;
var COL_VEC_VIT_PERP    = '#ff1a1a';
var COL_VEC_ACC_PERP    = COL_VEC_ACC;
var COL_VEC_FORCES_PERP = COL_VEC_FORCES;
var COL_VEC_SUMF_PERP   = COL_VEC_SUMF;
var VEC_LW_PERP         = 3.5;
var VEC_VIT_LW_PERP     = VEC_LW_PERP;

/* Échelle forces : px par Newton. Même traitement que VEC_SCALE_VIT/ACC —
   valeur de référence, dérivée par _updateVecScales() selon la taille du
   canvas. En px absolus, le poids d'une balle de 2 kg à g = 20 donnait une
   flèche de 480 px, et les forces seraient restées à taille fixe pendant que
   la vitesse et l'accélération se réduisaient. */
var VEC_SCALE_FORCE_REF = 12;
var VEC_SCALE_FORCE     = VEC_SCALE_FORCE_REF;

/* Mode d'affichage des vecteurs : 'vecteur' | 'composantes' | 'vecteur-composantes' */
var vecDisplayMode = 'vecteur';

/* ── Cache des angles de vue + origine animée (mis à jour une fois par frame dans drawAnim) ── */
var _viewAngles = { tx: 0, ty: 0, ox: 65, oy: 50 };

var _animCanvas = null;
var _animCtx    = null;
var _animW = 0, _animH = 0;
var _animHoverSnap = null;

/* ── Points épinglés : plafond et message associé ───────────────
   Le clic au-delà du plafond était ignoré sans le moindre retour : on ne
   pouvait pas distinguer « limite atteinte » de « clic mal visé ».
─────────────────────────────────────────────────────────────── */
var MAX_ANALYSIS_POINTS = 10;
var MSG_MAX_PINS = 'Maximum de ' + MAX_ANALYSIS_POINTS + ' points épinglés — cliquez un point existant pour le retirer';

/* ── Message temporaire dessiné sur le canvas d'animation ───────
   Pas d'élément HTML : la zone d'animation est un canvas plein cadre, et un
   overlay DOM devrait suivre le splitter et les changements d'échelle.
─────────────────────────────────────────────────────────────── */
var _animToast = null;   // { msg, until }  (until = timestamp ms)

function showAnimToast(msg) {
    _animToast = { msg: msg, until: Date.now() + 2600 };
}

function _drawAnimToast(ctx) {
    if (!_animToast) return;
    var remain = _animToast.until - Date.now();
    if (remain <= 0) { _animToast = null; return; }

    var fontSize = _animFontSize(12, 17, 0.036);
    ctx.save();
    /* Fondu sur les 600 dernières ms */
    ctx.globalAlpha = Math.min(1, remain / 600);
    ctx.font = 'bold ' + fontSize + 'px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    var padX = fontSize * 0.9, padY = fontSize * 0.55;
    var tw = ctx.measureText(_animToast.msg).width;
    var bw = tw + padX * 2, bh = fontSize + padY * 2;
    var bx = _animW / 2 - bw / 2, by = _animH * 0.08;

    ctx.fillStyle   = 'rgba(60,50,40,0.86)';
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth   = 1;
    var r = 6;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + bw, by,      bx + bw, by + bh, r);
    ctx.arcTo(bx + bw, by + bh, bx,      by + bh, r);
    ctx.arcTo(bx,      by + bh, bx,      by,      r);
    ctx.arcTo(bx,      by,      bx + bw, by,      r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(_animToast.msg, _animW / 2, by + bh / 2);
    ctx.restore();
}

/* ── Rayon d'accroche du survol (px) ────────────────────────────
   Au-delà de cette distance au curseur, aucun point n'est retenu.
   Sans ce seuil, le point le plus proche était sélectionné quelle que
   soit la distance : l'étiquette de vecteur apparaissait dès que la
   souris traversait la zone d'animation, souvent accrochée à un point
   situé à l'autre bout du canvas.
─────────────────────────────────────────────────────────────── */
function _hoverPickRadius() {
    return Math.max(20, Math.min(40, _animH * 0.055));
}

/* ── Taille des textes de l'animation ───────────────────────────
   Toutes les étiquettes du canvas (graduations, noms d'axes, noms de
   vecteurs, bloc coordonnées…) suivaient la hauteur du canvas jusqu'à un
   plafond en px, atteint aux alentours de 500 px de haut. Au-delà — 1080p
   en plein écran, 1440p, vidéoprojecteur — la scène continuait de grandir
   pendant que le texte restait figé : en relatif il rétrécissait de 20 %
   sur un canvas de 600 px, de 40 % sur un canvas de 830 px, au point de
   devenir difficile à lire depuis le fond de la salle.

   Le plafond suit donc maintenant la taille du canvas au lieu d'être une
   constante : au-dessus de la hauteur de référence, il est multiplié par
   ANIM_TXT_REF_H / hauteur, ce qui revient à laisser le texte strictement
   proportionnel à la scène. ANIM_TXT_MAX_F borne l'agrandissement pour
   qu'en 4K les étiquettes ne deviennent pas envahissantes.

   En dessous de la hauteur de référence le facteur vaut 1 : aucun plafond
   n'était actif là, le rendu sur portable et tablette est inchangé. */
var ANIM_TXT_REF_H = 500;    // hauteur de canvas où les tailles nominales s'appliquent
var ANIM_TXT_MAX_F = 1.6;    // agrandissement maximal du texte sur très grand écran

/* Rapport largeur/hauteur en dessous duquel la largeur devient le facteur
   limitant. Le plafond de _animFontSize ne suivait que la hauteur : sur un
   canvas étroit et haut (fenêtre en colonne, tablette en portrait), un bloc
   coordonnées atteignait sa taille maximale alors qu'il ne restait plus la
   place de l'écrire — il débordait ou se collait à ses voisins. Au-dessus de
   ce rapport, la largeur n'a jamais été le problème et rien ne change. */
var ANIM_TXT_REF_AR = 1.6;

function _txtScale() {
    if (!_animH) return 1;
    return Math.min(ANIM_TXT_MAX_F, Math.max(1, _animH / ANIM_TXT_REF_H));
}

/* minPx  : taille plancher, sur très petite fenêtre
   refPx  : taille nominale, sur un canvas de référence
   k      : fraction de la hauteur du canvas suivie entre les deux */
function _animFontSize(minPx, refPx, k) {
    var byH = _animH * k;
    var byW = _animW ? _animW * k / ANIM_TXT_REF_AR : byH;
    return Math.max(minPx, Math.min(refPx * _txtScale(), byH, byW));
}

/* ── Marges du repère ───────────────────────────────────────────
   sim.originX / sim.originY sont la marge gauche et la marge basse du
   canvas, en px : c'est la place réservée aux étiquettes des graduations
   et aux noms d'axes (« 12,5 » aligné à droite de l'axe y, « y (m) » sous
   la pointe de la flèche, « x (m) » sous l'axe x). Fixées à 65 et 50 px,
   elles étaient dimensionnées pour les tailles de texte d'un canvas de
   référence ; dès que le texte suit la taille du canvas, un « y (m) » ou
   un « 12,5 » agrandi déborde du canvas et se retrouve coupé.

   Elles suivent donc exactement la même échelle que le texte qu'elles
   logent — donc inchangées elles aussi en dessous de la hauteur de
   référence. */
var ANIM_MARGIN_L_REF  = 65;   // gauche : graduations de l'axe y + « y (m) »
var ANIM_MARGIN_B_REF  = 50;   // bas    : graduations de l'axe x + « x (m) »
var ANIM_MARGIN_LE_REF = 65;   // gauche, mode champ électrique

function _updateAnimMargins() {
    var f = _txtScale();
    sim.originX  = Math.round(ANIM_MARGIN_L_REF  * f);
    sim.originY  = Math.round(ANIM_MARGIN_B_REF  * f);
    simE.originX = Math.round(ANIM_MARGIN_LE_REF * f);
}

/* ── Traits du repère ───────────────────────────────────────────
   Les épaisseurs étaient des constantes en px (2 pour les axes, 2 et 1,5
   pour les marques, 1 pour les lignes de grille) et les pointes de flèches
   des demi-largeurs de 4 px, plafonnées comme le reste vers 500 px de
   canvas. Un trait de 2 px sur un canvas de 800 px, c'est un cheveu : les
   axes étaient plus visibles sur un portable qu'au vidéoprojecteur.

   Les valeurs de référence ne changent pas, elles suivent simplement la
   même échelle que le texte — donc inchangées sous la hauteur de
   référence, comme tout le reste. */
function _axisLW(refPx) {
    return refPx * _txtScale();
}

/* ── Encre du repère (champ de pesanteur) ───────────────────────
   Les axes, graduations et étiquettes étaient blancs. Sur le dégradé de
   ciel, qui monte à #cce0f4 près de l'horizon, le contraste tombait à
   ~1,2:1 — autant dire rien — et seule une ombre portée floue d'1 px les
   détachait, or c'est exactement ce qui se dilue sur un vidéoprojecteur en
   salle éclairée.

   Encre sombre plutôt que blanche, donc : ~5:1 aussi bien sur le ciel
   clair que sur le bleu du haut ou sur l'herbe. C'est ce que fait déjà le
   mode champ électrique, les deux modes se ressemblent enfin.

   Rien n'est cerné, ni les traits ni les étiquettes. Trois essais l'ont
   tranché à l'œil : liseré sombre autour des traits, halo clair derrière,
   puis fin contour blanc sous les seules étiquettes. Cerner de longues
   lignes fines double leur poids visuel et transforme des marques de 8 px
   en pâtés ; et sur un fond majoritairement clair, un contour d'étiquette
   se voit plus qu'il ne sert. L'encre seule suffit. */
var AXIS_INK = '22,32,48';   // composantes RVB de l'encre

function _ink(alpha) {
    return 'rgba(' + AXIS_INK + ',' + alpha.toFixed(2) + ')';
}

/* ── Rayon du mobile ────────────────────────────────────────────
   Le ballon suit l'échelle physique : 0,55 px par px/m, soit un ballon de
   0,55 m de rayon — exagéré à dessein, un vrai ballon (0,11 m) serait un
   point. Les bornes évitent qu'il devienne invisible sur une scène très
   dézoomée ou énorme sur une scène très zoomée.

   Ces bornes étaient en px fixes : le plafond de 13 px figeait le ballon à
   26 px de diamètre dès que l'échelle dépassait ~24 px/m, ce qui est le cas
   courant en plein écran. Il rétrécissait donc en relatif pendant que la
   scène grandissait, comme le faisaient les étiquettes et les traits. Les
   deux bornes suivent maintenant la taille du canvas ; la branche du milieu,
   elle, était déjà proportionnelle à la scène.

   La particule du mode champ électrique, elle, avait un rayon franchement
   constant : Math.max(5, Math.min(10, 6)) vaut 6, toujours — un reste de
   clamp dont la valeur centrale a été figée en cours de route. */
var BALL_R_MIN_REF   = 7;      // px sur un canvas de référence
var BALL_R_MAX_REF   = 13;
var BALL_R_PER_SCALE = 0.55;   // px de rayon par px/m d'échelle
var PARTICLE_R_REF   = 6;      // mode champ électrique

function _ballRadius() {
    var f = _txtScale();
    return Math.max(BALL_R_MIN_REF * f,
                    Math.min(BALL_R_MAX_REF * f,
                             Math.min(sim.scaleX, sim.scaleY) * BALL_R_PER_SCALE));
}

function _particleRadius() {
    return PARTICLE_R_REF * _txtScale();
}

/* Disques de la chronophotographie et du point survolé : même traitement,
   ils étaient figés à 5 et 7 px de rayon. */
var CHRONO_R_REF = 5;
var HOVER_R_REF  = 7;

function _chronoRadius() { return CHRONO_R_REF * _txtScale(); }
function _hoverRadius()  { return HOVER_R_REF  * _txtScale(); }

/* ── Géométrie des axes (recalculée à chaque frame) ─────────────
   Centralisé ici pour que _drawGrid et _drawAxes soient cohérents.
   aLen  = longueur de la pointe de flèche, aHalf = sa demi-largeur.
   aBase = où le trait de l'axe doit s'arrêter : tracé jusqu'au sommet, il
           dépasse de part et d'autre du triangle sur le dernier quart de la
           pointe — un petit rectangle au bout de la flèche, d'autant plus
           voyant que le trait est épais. Les vecteurs appliquent le même
           retrait depuis toujours (cf. _drawVecArrow), pas les axes.
─────────────────────────────────────────────────────────────── */
function _axisGeom() {
    var f     = _txtScale();
    var aLen  = Math.max(8,  Math.min(14 * f, _animH * 0.030));
    var aHalf = 4 * f;
    var yEnd  = Math.max(16, Math.min(28 * f, _animH * 0.050));
    var xEnd  = _animW - Math.max(18, _animW * 0.030);
    return { aLen: aLen, aHalf: aHalf, aBase: aLen * 0.85, yEnd: yEnd, xEnd: xEnd };
}

/* ─────────────────────────────────────────────────
   initAnimCanvas — lie le canvas et redimensionne
───────────────────────────────────────────────── */
function initAnimCanvas() {
    _animCanvas = document.getElementById('anim-canvas');
    _animCtx    = _animCanvas.getContext('2d');
    resizeAnimCanvas();

    _animCanvas.addEventListener('pointermove', function(e) {
        var rect = _animCanvas.getBoundingClientRect();
        var cx = (e.clientX - rect.left) * (_animW / rect.width);
        var cy = (e.clientY - rect.top)  * (_animH / rect.height);
        if (activeTab === 'champ-electrique') { _updateAnimHoverE(cx, cy); }
        else { _updateAnimHover(cx, cy); }
    });
    _animCanvas.addEventListener('pointerleave', function() {
        _animHoverSnap = null;
        _animHoverSnapE = null;
    });

    _animCanvas.addEventListener('click', function() {
        if (activeTab === 'champ-electrique') { _handleClickE(); return; }
        if (!_pinModeActive || !_animHoverSnap) return;
        var snap = _animHoverSnap;
        var targetList = (snap.runId === null) ? sim.analysisPoints
                         : savedRuns[snap.runId].analysisPoints;

        /* Supprime si clic sur un pin existant (tolérance 12 px) */
        for (var i = 0; i < targetList.length; i++) {
            var pp = toCanvas(targetList[i].x, targetList[i].y);
            if (Math.hypot(pp.cx - snap._cx, pp.cy - snap._cy) < 12) {
                targetList.splice(i, 1);
                return;
            }
        }
        if (targetList.length >= MAX_ANALYSIS_POINTS) { showAnimToast(MSG_MAX_PINS); return; }

        var physCtx = (snap.runId === null)
            ? { mass: sim.mass, g: sim.g, windForce: sim.windForce, useFriction: sim.useFriction, k: sim.k }
            : (function(r){ return { mass: r.mass, g: r.g, windForce: r.windForce, useFriction: r.useFriction, k: 0.15 }; })(savedRuns[snap.runId]);
        targetList.push({
            x: snap.x, y: snap.y,
            vx: snap.vx, vy: snap.vy,
            ax: snap.ax, ay: snap.ay,
            t: snap.t,
            color: snap.color,
            phys: physCtx
        });
    });
}

function resizeAnimCanvas() {
    if (!_animCanvas) return;
    var wrap = _animCanvas.parentElement;
    _animW = wrap.clientWidth  || 600;
    _animH = wrap.clientHeight || 400;
    var dpr = window.devicePixelRatio || 1;
    _animCanvas.width  = Math.round(_animW * dpr);
    _animCanvas.height = Math.round(_animH * dpr);
    _animCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    _updateAnimMargins(); /* les marges du repère suivent la taille du texte    */
    _updateVecScales();   /* les longueurs de flèches suivent la taille du canvas */
    computeScale(_animW, _animH);
}

/* ── Angles de vue : interpolation ease-in-out entre les modes ── */
var _VIEW_TARGETS = {
    'oxy':    { tx: 0,             ty: 0 },
    'proj-x': { tx: Math.PI / 2,  ty: 0 },
    'proj-y': { tx: 0,             ty: Math.PI / 2 }
};
var _DUR_VIEW = 0.7; // secondes

/* Origine canvas cible pour chaque mode (dépend de la taille du canvas) */
function _targetOrigin(mode) {
    switch (mode) {
        case 'proj-x': return { ox: sim.originX,    oy: _animH / 2   };
        case 'proj-y': return { ox: _animW  / 2,    oy: sim.originY  };
        default:       return { ox: sim.originX,    oy: sim.originY  };
    }
}

function _updateViewAngles() {
    var tr = sim.viewTrans;
    if (!tr) {
        var tgt = _VIEW_TARGETS[sim.viewMode] || _VIEW_TARGETS['oxy'];
        var org = _targetOrigin(sim.viewMode);
        _viewAngles.tx = tgt.tx;
        _viewAngles.ty = tgt.ty;
        _viewAngles.ox = org.ox;
        _viewAngles.oy = org.oy;
        return;
    }
    var elapsed = Date.now() / 1000 - tr.startT;
    var t01 = Math.min(elapsed / _DUR_VIEW, 1);
    var ease = t01 < 0.5 ? 2 * t01 * t01 : -1 + (4 - 2 * t01) * t01;
    var from    = _VIEW_TARGETS[tr.fromMode] || _VIEW_TARGETS['oxy'];
    var to      = _VIEW_TARGETS[tr.toMode]   || _VIEW_TARGETS['oxy'];
    var fromOrg = _targetOrigin(tr.fromMode);
    var toOrg   = _targetOrigin(tr.toMode);
    _viewAngles.tx = from.tx + (to.tx - from.tx) * ease;
    _viewAngles.ty = from.ty + (to.ty - from.ty) * ease;
    _viewAngles.ox = fromOrg.ox + (toOrg.ox - fromOrg.ox) * ease;
    _viewAngles.oy = fromOrg.oy + (toOrg.oy - fromOrg.oy) * ease;
    if (t01 >= 1) {
        sim.viewTrans = null;
        sim.viewMode  = tr.toMode;
    }
}

/* Facteurs de projection pour les composantes de vecteurs en pixels */
function _viewProjFactors() {
    return { cx: Math.cos(_viewAngles.ty), cy: Math.cos(_viewAngles.tx) };
}

/* Déplacement canvas (px) d'un vecteur physique (vx, vy) pour le champ de
   pesanteur : la direction tient compte de la déformation des axes (repère
   "Adapté", sim.scaleX ≠ sim.scaleY) et de la vue courante (_viewProjFactors),
   pour rester tangent à la trajectoire ; la longueur reste schématique
   (indépendante de sim.scale), fixée par vecScale px par unité physique. */
function _vecCanvasDelta(vx, vy, vecScale) {
    var p = _viewProjFactors();
    var cvx = vx * p.cx * sim.scaleX, cvy = -vy * p.cy * sim.scaleY;
    var cm  = Math.hypot(cvx, cvy) || 1;
    /* Longueur calculée sur les composantes PROJETÉES (vx·cx, vy·cy), pas sur le
       vecteur complet. Avec Math.hypot(vx, vy), la direction était bien projetée
       mais la flèche était ensuite renormalisée à la norme totale ‖v⃗‖ : en
       projection sur l'axe y, v⃗ gardait donc la longueur ‖v⃗‖ au lieu de |vy| et
       ne s'annulait jamais au sommet — elle basculait brutalement de bas en haut
       à pleine longueur. En vue Oxy, cx = cy = 1 et le résultat est inchangé. */
    var len = Math.hypot(vx * p.cx, vy * p.cy) * vecScale;
    return { dx: cvx * len / cm, dy: cvy * len / cm };
}

/* ── Conversion coordonnées physiques → canvas ── */
function toCanvas(px, py) {
    return {
        cx: _viewAngles.ox + px * Math.cos(_viewAngles.ty) * sim.scaleX,
        cy: _animH - _viewAngles.oy - py * Math.cos(_viewAngles.tx) * sim.scaleY
    };
}

/* ── Pas de grille "joli" pour une plage et un nombre cible de graduations ── */
function _niceGridStep(range, targetMajor) {
    var rough = range / targetMajor;
    var mag   = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1e-9))));
    var mant  = rough / mag;
    var major;
    if      (mant < 1.5) major = mag;
    else if (mant < 3.5) major = 2 * mag;
    else if (mant < 7.5) major = 5 * mag;
    else                  major = 10 * mag;
    var minor = major / 5;
    if (minor < 0.1) minor = major;  // éviter trop de micro-marques
    return { major: major, minor: minor };
}

/* ── Densité de graduations : en pixels, pas en nombre ───────────
   _niceGridStep recevait un nombre de divisions fixe (6 en x, 5 en y ;
   6 et 4 en champ électrique) quelle que soit la taille du canvas. Les
   graduations se resserraient donc à mesure que la fenêtre rétrécissait —
   et les petites marques, à major / 5, tombaient à 6 ou 8 px d'intervalle :
   ce n'est plus une graduation, c'est une trame. Dans l'autre sens, 6
   divisions sur un canvas de 1400 px, c'est un label tous les 220 px.

   Le nombre de divisions est maintenant déduit de la place disponible en
   px. GRID_MAJOR_PX_* est l'espacement visé entre deux graduations
   chiffrées sur un canvas de référence ; il suit _txtScale(), puisque
   c'est la taille des labels qui dicte la place qu'il leur faut. Les
   valeurs sont calées pour reproduire la densité actuelle sur un canvas de
   bureau (~900 × 540) : c'est en petite fenêtre que le rendu change.

   L'axe x demande plus d'espace que l'axe y : ses labels sont côte à côte,
   c'est leur largeur qui compte, alors qu'en y ils sont empilés. */
var GRID_MAJOR_PX_X  = 145;   // pesanteur, axe x
var GRID_MAJOR_PX_Y  = 90;    // pesanteur, axe y
/* Champ électrique, axe x : calé un cran plus serré que le mode pesanteur.
   Sa plage physique n'admet que des pas de 0,05 ou 0,1 m — deux fois plus
   grossiers l'un que l'autre — et 145 px le faisait retomber à 5 divisions
   sur grand écran là où 120 px lui en donne 10. */
var GRID_MAJOR_PX_XE = 120;
var GRID_MAJOR_PX_YE = 55;    // champ électrique, axe y (demi-axe, court)
var GRID_MINOR_MIN_PX = 7;    // espacement minimal des petites marques

function _gridTargetCount(pxSpan, idealPx) {
    if (!(pxSpan > 0)) return 2;
    return Math.max(2, Math.min(14, Math.round(pxSpan / (idealPx * _txtScale()))));
}

/* Pas de graduation d'un axe, à partir de son étendue physique et de la
   place qu'elle occupe à l'écran. */
function _gridSteps(range, pxSpan, idealPx) {
    var g = _niceGridStep(range, _gridTargetCount(pxSpan, idealPx));
    /* Petites marques supprimées si elles se retrouvent trop serrées : le
       pas « joli » retenu peut valoir jusqu'à 0,57 fois le pas visé. */
    var pxPerUnit = (range > 0) ? pxSpan / range : 0;
    if (g.minor * pxPerUnit < GRID_MINOR_MIN_PX * _txtScale()) g.minor = g.major;
    return g;
}

/* Nombre de décimales à afficher pour un pas donné */
function _gridDec(step) {
    if (step >= 10)  return 0;
    if (step >= 1)   return 0;
    if (step >= 0.1) return 1;
    return 2;
}

/* ── Encombrement réel des titres d'axes ────────────────────────
   Les graduations doivent s'arrêter avant « x (m) » et « y (m) ». La place
   réservée était estimée au jugé (axesFontSz * 3 - 20 en largeur, + 12 en
   hauteur) : ça tombait juste pour la police d'origine, mais l'écart
   vertical n'a jamais dépassé 5 px et devenait négatif — donc superposé —
   dès que la police des titres passait ~29 px. Et le mode champ électrique
   ne réservait rien du tout.

   On mesure donc le texte réellement tracé, dans la police réellement
   utilisée, au lieu de l'estimer.

   GRAD_ASC : hauteur d'encre d'un label de graduation au-dessus de sa ligne
   de base, en fraction de sa taille (chiffres et virgule : ni jambage, ni
   accent). */
var GRAD_ASC  = 0.75;
var AXIS_TITLE_PAD = 6;   // jeu minimal entre un titre d'axe et une graduation

function _axisTitleW(ctx, text, size) {
    var prev = ctx.font;
    ctx.font = 'bold ' + size + 'px Segoe UI, Arial';
    var w = ctx.measureText(text).width;
    ctx.font = prev;
    return w;
}

/* Largeur du plus large label de graduation à tracer sur un axe : les
   graduations x sont centrées sur leur marque, il faut donc connaître leur
   demi-largeur pour savoir où les arrêter. bold = false pour le mode champ
   électrique, dont les graduations sont en graisse normale. */
function _gradLabelW(ctx, maxVal, dec, size, bold) {
    var prev = ctx.font;
    ctx.font = (bold === false ? '' : 'bold ') + size + 'px Segoe UI, Arial';
    var w = ctx.measureText(fmt(maxVal, dec)).width;
    ctx.font = prev;
    return w;
}

/* ── Position sol en pixels canvas (animée avec l'origine de vue) ── */
function groundY() {
    return _animH - _viewAngles.oy;
}

/* ─────────────────────────────────────────────────
   drawAnim — point d'entrée du rendu animation
───────────────────────────────────────────────── */
function drawAnim() {
    if (!_animCtx) return;
    var ctx = _animCtx;
    _updateViewAngles();
    _updateLabelHalo(false);
    _updateLabelCrowd();
    ctx.clearRect(0, 0, _animW, _animH);
    _resetLabelRects();

    _drawBackground(ctx);
    _drawGrid(ctx);
    _drawAxes(ctx);
    if (sim.showFieldG) _drawFieldG(ctx);

    /* Trajectoires déclarées au décor. L'avance sur le tracé n'a plus lieu
       d'être depuis que les étiquettes sont toutes résolues en fin d'image ;
       la déclaration reste ici parce qu'elle ne suit PAS exactement ce qui
       est tracé — en replay et en phases séparées, le tracé lit graphData
       tronqué à l'instant courant quand la réservation, elle, prend la
       trajectoire entière. Les réunir demande de trancher ce point ; ce
       n'est pas le sujet du jour.

       Les flèches du champ de pesanteur ne sont volontairement pas
       déclarées : décor de fond régulier, elles quadrillent le canvas et
       interdiraient tout. */
    if (sim.displayMode === 'trajectory' || sim.displayMode === 'both') {
        _reserveTrajPts(sim.trajPoints);
        for (var _tri = 0; _tri < savedRuns.length; _tri++) {
            if (!savedRuns[_tri].hidden) _reserveTrajPts(savedRuns[_tri].trajPoints);
        }
    }

    /* Runs sauvegardées (en dessous de la run courante) */
    _labelPrio = PRIO_SAVED;
    for (var _sri = 0; _sri < savedRuns.length; _sri++) {
        var _sr = savedRuns[_sri];
        if (_sr.hidden) continue;
        if (sim.displayMode === 'trajectory' || sim.displayMode === 'both') {
            _drawSavedTrajectory(ctx, _sr);
        }
        if (sim.displayMode === 'chrono' || sim.displayMode === 'both') {
            _drawSavedChronoSnaps(ctx, _sr);
        }
        if (_replaySessionActive) {
            _drawSavedBall(ctx, _sr);
        }
    }

    if (sim.displayMode === 'trajectory' || sim.displayMode === 'both') {
        _drawTrajectory(ctx);
    }
    if (sim.displayMode === 'chrono' || sim.displayMode === 'both') {
        _labelPrio = PRIO_CHRONO;
        _drawChronoSnaps(ctx);
    }

    _labelPrio = PRIO_MOBILE;
    _drawBall(ctx);
    _drawViewLabel(ctx);
    _labelPrio = PRIO_PIN;
    _drawAnalysisPoints(ctx);
    _labelPrio = PRIO_HOVER;
    if (_animHoverSnap) _drawAnimHover(ctx, _animHoverSnap);

    /* Le décor est complet : les étiquettes peuvent enfin arbitrer contre
       l'image entière. Avant le toast, qui est un message par-dessus la
       scène et doit le rester. */
    _flushLabels(ctx);
    _drawAnimToast(ctx);
}

/* ─────────────────────────────────────────────────
   Fond : ciel + sol, avec horizon mobile pour la
   rotation caméra (proj-x = vue du dessus).
   L'horizon monte de groundY() vers 0 quand tx
   passe de 0 à π/2, révélant un sol en perspective.
───────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────
   Champ de pesanteur g — grille de vecteurs orange
───────────────────────────────────────────────── */
function _drawFieldG(ctx) {
    var gndY   = groundY();
    var topY   = 20;
    var rows = 2;
    /* Position du MILIEU de chaque rangée, en fraction de la bande utile.
       Les flèches étaient auparavant ancrées par le haut à ces fractions et se
       déployaient vers le bas : les allonger les poussait donc dans la rangée
       suivante, et toute borne empêchant le chevauchement bloquait du même coup
       leur croissance. Centrées, elles s'allongent des deux côtés à la fois et
       restent chacune dans sa moitié de bande. */
    var rowCenters = [0.25, 0.75];

    /* Hauteur de bande utile, indépendante de vecLen (8px de marge au sol). */
    var bandH = (gndY - 8) - topY;
    if (bandH < 30) return;

    /* Même échelle que les vecteurs accélération (VEC_SCALE_ACC px par m/s²),
       qui suit désormais la taille du canvas — l'égalité visuelle a⃗ = g⃗ en
       chute libre est donc préservée à toutes les tailles de fenêtre. */
    var vecLen = Math.max(8, sim.g * VEC_SCALE_ACC * _viewProjFactors().cy);

    /* Rangées centrées à 0,25 et 0,75 : l'espace libre entre elles vaut
       0,5·bandH − vecLen. Plafonner vecLen à 0,42·bandH y laisse donc toujours
       0,08·bandH de vide, tout en autorisant la croissance jusqu'à g = 20 sur un
       canvas de taille normale — l'ancienne borne (45 % de la hauteur utile)
       ignorait l'écart entre rangées et les faisait se confondre. */
    vecLen = Math.min(vecLen, bandH * 0.42);

    var xLeft  = sim.originX + 15;
    var xRight = _animW - 15;
    /* Espacement resserré en même temps que les flèches, pour que la trame
       garde la même densité apparente sur petite fenêtre. */
    var cols   = Math.max(3, Math.round((xRight - xLeft) / (75 * _vecScaleFactor())));
    var xStep  = (xRight - xLeft) / (cols - 1);

    var COL = '#e67e22';
    var OPACITY = 0.55;

    /* Même tracé que les vecteurs cinématiques (_drawVecArrow) : corps arrêté à
       la base d'une pointe triangulaire pleine, au lieu du chevron ouvert au
       trait dessiné ici auparavant. Seules la couleur et l'opacité distinguent
       les flèches de champ des vecteurs. */
    for (var r = 0; r < rows; r++) {
        /* Haut de la flèche : la rangée est centrée sur sa fraction de bande */
        var cy = topY + bandH * rowCenters[r] - vecLen / 2;
        for (var c = 0; c < cols; c++) {
            var cx = xLeft + c * xStep;
            _drawVecArrow(ctx, cx, cy, 0, vecLen, COL, null, OPACITY);
        }
    }
}

function _drawBackground(ctx) {
    var gy = groundY();
    var tx = _viewAngles.tx;

    /* Ligne d'horizon réelle (monte quand la caméra se penche en avant) */
    var horizon_y = gy * Math.cos(tx);

    /* ── Sol (du haut du sol jusqu'en bas du canvas) ── */
    var floorTop = Math.min(horizon_y, gy);
    var floorGrad = ctx.createLinearGradient(0, floorTop, 0, _animH);
    floorGrad.addColorStop(0,   '#7aaa50');  // clair près de l'horizon (brume de sol)
    floorGrad.addColorStop(0.3, '#5a8a3a');
    floorGrad.addColorStop(1,   '#3a5a1a');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, floorTop, _animW, _animH - floorTop);

    /* ── Ciel (de 0 à l'horizon) — disparaît quand tx → π/2 ── */
    if (horizon_y > 2) {
        var skyGrad = ctx.createLinearGradient(0, 0, 0, horizon_y);
        skyGrad.addColorStop(0,   '#6aaad8');
        skyGrad.addColorStop(0.5, '#a8ccea');
        skyGrad.addColorStop(1,   '#cce0f4');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, _animW, horizon_y);
    }

    /* ── Ligne d'horizon / sol ── */
    ctx.strokeStyle = '#3a6a20';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, horizon_y);
    ctx.lineTo(_animW, horizon_y);
    ctx.stroke();

    /* ── Grille perspective sur le sol (pendant la rotation proj-x) ── */
    if (tx > 0.04) {
        _drawPerspectiveFloor(ctx, horizon_y, tx);
    }
}

/* Grille perspective convergeant vers le point de fuite à l'horizon */
function _drawPerspectiveFloor(ctx, horizon_y, tx) {
    var intensity = Math.sin(tx);          // 0→1 quand tx: 0→π/2
    var floor_h   = _animH - horizon_y;
    if (floor_h < 4) return;

    /* Point de fuite : centre de la zone de rendu, à l'horizon */
    var vp_x = _viewAngles.ox + (_animW - _viewAngles.ox) * 0.5;
    var vp_y = horizon_y;

    ctx.save();
    ctx.setLineDash([3, 7]);

    /* Lignes de profondeur (rayonnent depuis le point de fuite) */
    var nDepth = 14;
    for (var i = 0; i <= nDepth; i++) {
        var xBot = (i / nDepth) * _animW;
        ctx.globalAlpha = 0.28 * intensity;
        ctx.strokeStyle = '#4a7030';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(vp_x, vp_y);
        ctx.lineTo(xBot, _animH);
        ctx.stroke();
    }

    /* Lignes de largeur (horizontales, espacement en perspective) */
    var nWidth = 8;
    for (var j = 1; j <= nWidth; j++) {
        /* Espacement exponentiel : plus serré près de l'horizon */
        var t = 1 - Math.pow(1 - j / nWidth, 1.8);
        var y = vp_y + floor_h * t;
        ctx.globalAlpha = 0.22 * intensity;
        ctx.strokeStyle = '#4a7030';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(_animW, y);
        ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.restore();
}

/* ─────────────────────────────────────────────────
   Grille légère + graduations sur les axes
   • Grandes lignes + labels tous les 5 m
   • Petites marques sans label tous les 1 m
───────────────────────────────────────────────── */
function _drawGrid(ctx) {
    if (sim.scaleX < 2 && sim.scaleY < 2) return;

    var xMaxPhy  = (_animW - sim.originX) / sim.scaleX;
    var yMaxPhy  = (_animH - sim.originY) / sim.scaleY;
    var gy0      = groundY();
    var fontSize = _animFontSize(11, 16, 0.032);

    /* Pas adaptatifs pour chaque axe */
    var xGrid    = _gridSteps(xMaxPhy, _animW - sim.originX, GRID_MAJOR_PX_X);
    var yGrid    = _gridSteps(yMaxPhy, _animH - sim.originY, GRID_MAJOR_PX_Y);
    var xMajor   = xGrid.major,  xMinor = xGrid.minor;
    var yMajor   = yGrid.major,  yMinor = yGrid.minor;
    var xDec     = _gridDec(xMajor);
    var yDec     = _gridDec(yMajor);

    ctx.save();

    /* ── Facteurs de projection (grille comprimée pendant les transitions) ── */
    var _gcos_tx = Math.cos(_viewAngles.tx);  // comprime y
    var _gcos_ty = Math.cos(_viewAngles.ty);  // comprime x
    var _PROJ_THRESH = 0.08;

    /* ── Bornes de non-superposition ── */
    var _ag        = _axisGeom();
    var tickMajor  = Math.max(6, _animH * 0.014);
    var tickMinor  = Math.max(3, _animH * 0.007);
    var axesFontSz = _animFontSize(14, 20, 0.041);
    /* Titre « y (m) » : tracé sous la pointe de la flèche, de _ag.yEnd +
       _ag.aLen + 3 (baseline 'top') à + axesFontSz. Une graduation y déborde
       de GRAD_ASC * fontSize au-dessus de sa ligne de base, elle-même à
       fontSize * 0.35 sous le centre de la marque. */
    var yAxisEnd   = _ag.yEnd + _ag.aLen + 3 + axesFontSz + AXIS_TITLE_PAD
                     + fontSize * (GRAD_ASC - 0.35);
    /* Titre « x (m) » : aligné à droite sur _ag.xEnd. Les graduations x sont
       centrées sur leur marque, d'où la demi-largeur du plus large label. */
    var xAxisCutoff = _ag.xEnd - _axisTitleW(ctx, 'x (m)', axesFontSz)
                      - _gradLabelW(ctx, xMaxPhy, xDec, fontSize) / 2
                      - AXIS_TITLE_PAD;

    /* Tolérance pour distinguer major vs minor (floating point) */
    function isMultiple(v, step) {
        return Math.abs(v / step - Math.round(v / step)) < 0.001;
    }

    /* ── Grandes lignes de grille ── */
    ctx.lineWidth   = _axisLW(1);
    ctx.setLineDash([_axisLW(4), _axisLW(4)]);

    /* Lignes verticales (axe x) — masquées si x comprimé */
    if (_gcos_ty >= _PROJ_THRESH) {
        /* En proj-x, les lignes passent en dessous de l'axe avec une coupure autour des labels */
        var _sinTx    = Math.sin(_viewAngles.tx);
        var _labelMid = gy0 + tickMajor + fontSize * 0.9;   // baseline du label
        var _gapTop   = _labelMid - fontSize * 0.85;         // début de la coupure
        var _gapBot   = _labelMid + fontSize * 0.25;         // fin de la coupure
        ctx.strokeStyle = _ink(0.22 * _gcos_ty);
        for (var ix = 1; ix * xMinor <= xMaxPhy * 1.05; ix++) {
            var gxv = ix * xMinor;
            if (!isMultiple(gxv, xMajor)) continue;
            var p = toCanvas(gxv, 0);
            if (p.cx > xAxisCutoff) break;
            /* Segment principal : du haut jusqu'avant le label */
            var _lineBot = _sinTx > 0.02 ? _gapTop : gy0;
            ctx.beginPath(); ctx.moveTo(p.cx, 0); ctx.lineTo(p.cx, _lineBot); ctx.stroke();
            /* Segment inférieur : après le label jusqu'au bas du canvas */
            if (_sinTx > 0.02) {
                ctx.beginPath(); ctx.moveTo(p.cx, _gapBot); ctx.lineTo(p.cx, _animH); ctx.stroke();
            }
        }
    }
    /* Lignes horizontales (axe y) — masquées si y comprimé */
    if (_gcos_tx >= _PROJ_THRESH) {
        ctx.strokeStyle = _ink(0.22 * _gcos_tx);
        for (var iy = 1; iy * yMinor <= yMaxPhy * 1.05; iy++) {
            var gyv = iy * yMinor;
            if (!isMultiple(gyv, yMajor)) continue;
            var p2 = toCanvas(0, gyv);
            if (p2.cy < yAxisEnd) break;
            ctx.beginPath(); ctx.moveTo(0, p2.cy); ctx.lineTo(_animW, p2.cy); ctx.stroke();
        }
    }
    ctx.setLineDash([]);

    /* ── Marques sur l'axe X (masquées si x comprimé) ── */
    if (_gcos_ty >= _PROJ_THRESH) {
        var _opX = Math.min(_gcos_ty, 1);
        for (var jx = 1; jx * xMinor <= xMaxPhy * 1.05; jx++) {
            var xv     = jx * xMinor;
            var isMajX = isMultiple(xv, xMajor);
            var pcx    = toCanvas(xv, 0);
            if (pcx.cx > xAxisCutoff) break;
            var tLen   = isMajX ? tickMajor : tickMinor;

            ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
            ctx.strokeStyle = _ink((isMajX ? 0.95 : 0.75) * _opX);
            ctx.lineWidth   = _axisLW(isMajX ? 2 : 1.5);
            ctx.beginPath(); ctx.moveTo(pcx.cx, gy0 - tLen); ctx.lineTo(pcx.cx, gy0); ctx.stroke();

            if (isMajX) {
                ctx.font = 'bold ' + fontSize + 'px Segoe UI, Arial';
                ctx.textAlign = 'center';
                ctx.fillStyle = _ink(0.95 * _opX);
                ctx.fillText(fmt(xv, xDec), pcx.cx, gy0 + tickMajor + fontSize * 0.9);
                _reserveTextBox(ctx, fmt(xv, xDec), pcx.cx, gy0 + tickMajor + fontSize * 0.9, fontSize, INK_GRAD);
            }
        }
    }

    /* ── Marques sur l'axe Y (masquées si y comprimé) ── */
    if (_gcos_tx >= _PROJ_THRESH) {
        var _opY = Math.min(_gcos_tx, 1);
        var _yAxes = _splitActive()
            ? [{ ox: _phaseOx(1), side: 1 }, { ox: _phaseOx(-1), side: -1 }]
            : [{ ox: _viewAngles.ox, side: 1 }];

        for (var jy = 1; jy * yMinor <= yMaxPhy * 1.05; jy++) {
            var yv     = jy * yMinor;
            var isMajY = isMultiple(yv, yMajor);
            var pcy    = toCanvas(0, yv);
            if (pcy.cy < yAxisEnd) break;
            var tLenY  = isMajY ? tickMajor : tickMinor;

            ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
            ctx.strokeStyle = _ink((isMajY ? 0.95 : 0.75) * _opY);
            ctx.lineWidth   = _axisLW(isMajY ? 2 : 1.5);

            for (var _ai = 0; _ai < _yAxes.length; _ai++) {
                var _ax = _yAxes[_ai];
                /* Tick : vers l'intérieur du graphe (droite pour axe gauche, gauche pour axe droit) */
                var _tDir = _ax.side; // +1 → tick vers la droite, -1 → tick vers la gauche
                ctx.beginPath();
                ctx.moveTo(_ax.ox, pcy.cy);
                ctx.lineTo(_ax.ox + tLenY * _tDir, pcy.cy);
                ctx.stroke();

                if (isMajY) {
                    ctx.font = 'bold ' + fontSize + 'px Segoe UI, Arial';
                    /* Label : à l'extérieur de l'axe (opposé au tick) */
                    ctx.textAlign = _tDir > 0 ? 'right' : 'left';
                    ctx.fillStyle = _ink(0.95 * _opY);
                    var _labelX = _tDir > 0
                        ? _ax.ox - tickMajor - 3
                        : _ax.ox + tickMajor + 3;
                    /* Hors canvas plutôt que tronqué : on préfère ne pas
                       tracer le label que d'en laisser dépasser la moitié. */
                    var _lw = ctx.measureText(fmt(yv, yDec)).width;
                    if (_tDir > 0 ? (_labelX - _lw >= 2) : (_labelX + _lw <= _animW - 2)) {
                        ctx.fillText(fmt(yv, yDec), _labelX, pcy.cy + fontSize * 0.35);
                        _reserveTextBox(ctx, fmt(yv, yDec), _labelX, pcy.cy + fontSize * 0.35, fontSize, INK_GRAD);
                    }
                }
            }
        }
    }

    ctx.restore();
}

/* ─────────────────────────────────────────────────
   Axes x et y avec flèches + contour noir
───────────────────────────────────────────────── */

function _drawAxes(ctx) {
    var origin   = toCanvas(0, 0);
    var fontSize = _animFontSize(14, 20, 0.041);
    var ag    = _axisGeom();
    var aLen  = ag.aLen;
    var aHalf = ag.aHalf;
    var xEnd  = ag.xEnd;
    var yEnd  = ag.yEnd;
    var aBase = ag.aBase;
    var cos_tx = Math.cos(_viewAngles.tx);  // 1 = y visible, 0 = y dans l'écran
    var cos_ty = Math.cos(_viewAngles.ty);  // 1 = x visible, 0 = x dans l'écran
    var THRESH = 0.08;

    ctx.save();

    /* Aucun contour sur les traits : l'encre sombre se suffit, et cerner de
       longues lignes fines les alourdit. */
    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.lineWidth  = _axisLW(2);

    /* ── Axe X (visible tant que cos_ty > THRESH) ── */
    if (cos_ty >= THRESH) {
        var opX = Math.min(cos_ty, 1);
        ctx.strokeStyle = _ink(0.92 * opX);
        ctx.fillStyle   = _ink(0.92 * opX);
        ctx.beginPath(); ctx.moveTo(_viewAngles.ox - 5, origin.cy); ctx.lineTo(xEnd - aBase, origin.cy); ctx.stroke();
        _reserveInkSeg(_viewAngles.ox - 5, origin.cy, xEnd, origin.cy, INK_AXIS);
        ctx.beginPath(); ctx.moveTo(xEnd, origin.cy); ctx.lineTo(xEnd - aLen, origin.cy - aHalf); ctx.lineTo(xEnd - aLen, origin.cy + aHalf); ctx.closePath(); ctx.fill();
    }

    /* ── Axe Y (visible tant que cos_tx > THRESH) ── */
    if (cos_tx >= THRESH) {
        var opY = Math.min(cos_tx, 1);
        ctx.strokeStyle = _ink(0.92 * opY);
        ctx.fillStyle   = _ink(0.92 * opY);
        if (_splitActive()) {
            /* Deux axes Y : montée (gauche) + descente (droite) */
            var oxL = _phaseOx(1), oxR = _phaseOx(-1);
            var gy  = groundY();
            [oxL, oxR].forEach(function(ox) {
                ctx.beginPath(); ctx.moveTo(ox, gy + 5); ctx.lineTo(ox, yEnd + aBase); ctx.stroke();
                _reserveInkSeg(ox, gy + 5, ox, yEnd, INK_AXIS);
                ctx.beginPath(); ctx.moveTo(ox, yEnd); ctx.lineTo(ox - aHalf, yEnd + aLen); ctx.lineTo(ox + aHalf, yEnd + aLen); ctx.closePath(); ctx.fill();
            });
        } else {
            ctx.beginPath(); ctx.moveTo(origin.cx, groundY() + 5); ctx.lineTo(origin.cx, yEnd + aBase); ctx.stroke();
            _reserveInkSeg(origin.cx, groundY() + 5, origin.cx, yEnd, INK_AXIS);
            ctx.beginPath(); ctx.moveTo(origin.cx, yEnd); ctx.lineTo(origin.cx - aHalf, yEnd + aLen); ctx.lineTo(origin.cx + aHalf, yEnd + aLen); ctx.closePath(); ctx.fill();
        }
    }

    /* ── Labels ── */
    var tickMajorRef = Math.max(6,  _animH * 0.014);
    var fontSizeGrid = _animFontSize(11, 16, 0.032);
    ctx.font          = 'bold ' + fontSize + 'px Segoe UI, Arial';
    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

    /* Label x */
    if (cos_ty >= THRESH) {
        ctx.fillStyle    = _ink(0.95 * Math.min(cos_ty, 1));
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('x (m)', xEnd, origin.cy + tickMajorRef + fontSizeGrid * 0.9);
        _reserveTextBox(ctx, "x (m)", xEnd, origin.cy + tickMajorRef + fontSizeGrid * 0.9, fontSize, INK_GRAD);
    }

    /* Label O */
    ctx.fillStyle    = _ink(0.95);
    if (_splitActive()) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillText('O', _phaseOx(1),  origin.cy + fontSize + 2);
        ctx.fillText('O', _phaseOx(-1), origin.cy + fontSize + 2);
        _reserveTextBox(ctx, "O", _phaseOx(1),  origin.cy + fontSize + 2, fontSize, INK_GRAD);
        _reserveTextBox(ctx, "O", _phaseOx(-1), origin.cy + fontSize + 2, fontSize, INK_GRAD);
    } else {
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('O', origin.cx - 6, origin.cy + fontSize + 2);
        _reserveTextBox(ctx, "O", origin.cx - 6, origin.cy + fontSize + 2, fontSize, INK_GRAD);
    }

    /* Label y / labels "Montée" "Descente" */
    if (cos_tx >= THRESH) {
        ctx.fillStyle    = _ink(0.95 * Math.min(cos_tx, 1));
        ctx.textBaseline = 'top';
        if (_splitActive()) {
            var smallFs = _animFontSize(10, 13, 0.027);
            ctx.font      = 'bold ' + smallFs + 'px Segoe UI, Arial';
            ctx.textAlign = 'center';
            ctx.fillText('↑ Montée',   _phaseOx(1),  yEnd + aLen + 3);
            ctx.fillText('↓ Descente', _phaseOx(-1), yEnd + aLen + 3);
            _reserveTextBox(ctx, "↑ Montée",   _phaseOx(1),  yEnd + aLen + 3, smallFs, INK_GRAD);
            _reserveTextBox(ctx, "↓ Descente", _phaseOx(-1), yEnd + aLen + 3, smallFs, INK_GRAD);
        } else {
            ctx.textAlign = 'right';
            ctx.fillText('y (m)', origin.cx - 6, yEnd + aLen + 3);
            _reserveTextBox(ctx, "y (m)", origin.cx - 6, yEnd + aLen + 3, fontSize, INK_GRAD);
        }
    }

    ctx.restore();
}

/* ─────────────────────────────────────────────────
   Trajectoire & chronophotographie — runs sauvegardées
───────────────────────────────────────────────── */
function _drawSavedTrajectory(ctx, run) {
    ctx.save();
    ctx.strokeStyle = run.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.82;

    /* Points à parcourir (graphData en replay, trajPoints sinon) */
    var usePts   = _replaySessionActive || _splitActive();
    var pts      = usePts ? run.graphData : null;
    var cutIdx   = pts ? pts.length : 0;
    if (_replaySessionActive && pts) {
        for (var k = 0; k < pts.length; k++) { if (pts[k].t > _replayT) { cutIdx = k; break; } }
        if (cutIdx < 2) { ctx.restore(); return; }
    }

    if (_splitActive() && pts) {
        /* Trouver le sommet dans graphData */
        var peakIdx = 0;
        var lim = _replaySessionActive ? cutIdx : pts.length;
        for (var k = 1; k < lim; k++) { if (pts[k].y > pts[peakIdx].y) peakIdx = k; }
        /* Montée */
        var oxUp = _phaseOx(1);
        ctx.beginPath();
        for (var i = 0; i <= peakIdx; i++) {
            var q = toCanvas(pts[i].x, pts[i].y);
            i === 0 ? ctx.moveTo(oxUp, q.cy) : ctx.lineTo(oxUp, q.cy);
        }
        ctx.stroke();
        /* Descente */
        if (peakIdx < lim - 1) {
            var oxDn = _phaseOx(-1);
            ctx.beginPath();
            for (var j = peakIdx; j < lim; j++) {
                var q2 = toCanvas(pts[j].x, pts[j].y);
                j === peakIdx ? ctx.moveTo(oxDn, q2.cy) : ctx.lineTo(oxDn, q2.cy);
            }
            ctx.stroke();
        }
    } else {
        ctx.beginPath();
        if (_replaySessionActive) {
            var p0 = toCanvas(pts[0].x, pts[0].y);
            ctx.moveTo(p0.cx, p0.cy);
            for (var i = 1; i < cutIdx; i++) {
                var p = toCanvas(pts[i].x, pts[i].y);
                ctx.lineTo(p.cx, p.cy);
            }
        } else {
            if (run.trajPoints.length < 2) { ctx.restore(); return; }
            var p0 = toCanvas(run.trajPoints[0].x, run.trajPoints[0].y);
            ctx.moveTo(p0.cx, p0.cy);
            for (var i = 1; i < run.trajPoints.length; i++) {
                var p = toCanvas(run.trajPoints[i].x, run.trajPoints[i].y);
                ctx.lineTo(p.cx, p.cy);
            }
        }
        ctx.stroke();
    }

    ctx.restore();
}

function _drawSavedChronoSnaps(ctx, run) {
    var snaps = run.chronoSnaps;
    if (snaps.length === 0) return;
    for (var i = 0; i < snaps.length; i++) {
        var s = snaps[i];
        if (_replaySessionActive && s.t > _replayT) break;
        var p = _toCanvasSplit(s.x, s.y, s.vy);
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = run.color;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = _axisLW(1.5);
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, _chronoRadius(), 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        if (run.showVecPos) _drawVectorPos(ctx, s.x, s.y, 0.42);
        if (run.showVecVit) {
            var _dV = _vecCanvasDelta(s.vx, s.vy, VEC_SCALE_VIT);
            _drawVecDispVA(ctx, p.cx, p.cy, _dV.dx, _dV.dy, COL_VEC_VIT, null, 0.42);
        }
        if (run.showVecAcc) {
            var _dA = _vecCanvasDelta(s.ax, s.ay, VEC_SCALE_ACC);
            _drawVecDispVA(ctx, p.cx, p.cy, _dA.dx, _dA.dy, COL_VEC_ACC, null, 0.42);
        }
        if (run.showVecForces || run.showVecSumF) {
            var _rp = { mass: run.mass, g: run.g, windForce: run.windForce, useFriction: run.useFriction, k: 0.15 };
            if (run.showVecForces) _drawForcesAt(ctx, p.cx, p.cy, s.vx, s.vy, 0.42, _rp);
            if (run.showVecSumF)   _drawSumFAt(ctx,   p.cx, p.cy, s.vx, s.vy, 0.42, _rp);
        }
    }
}

/* ─────────────────────────────────────────────────
   Ballon pour une run sauvegardée (replay)
───────────────────────────────────────────────── */
function _drawSavedBall(ctx, run) {
    var pts = run.graphData;
    if (pts.length === 0) return;

    /* Interpolation linéaire de la position à _replayT */
    var idx = pts.length - 1;
    for (var k = 0; k < pts.length - 1; k++) {
        if (pts[k + 1].t > _replayT) { idx = k; break; }
    }
    var d0 = pts[idx];
    var x, y;
    if (idx < pts.length - 1 && pts[idx + 1].t > pts[idx].t) {
        var d1 = pts[idx + 1];
        var alpha = (_replayT - d0.t) / (d1.t - d0.t);
        x = d0.x + alpha * (d1.x - d0.x);
        y = d0.y + alpha * (d1.y - d0.y);
        var vyInterp = d0.vy + alpha * (d1.vy - d0.vy);
    } else {
        x = d0.x; y = d0.y;
        var vyInterp = d0.vy;
    }

    var p = _toCanvasSplit(x, y, vyInterp);
    var r = _ballRadius();

    ctx.save();

    if (_ballonImg.complete && _ballonImg.naturalWidth > 0) {
        var d = r * 2;
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur  = _axisLW(5);
        ctx.drawImage(_ballonImg, p.cx - r, p.cy - r, d, d);
        ctx.shadowBlur  = 0;
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, r, 0, 2 * Math.PI);
        ctx.strokeStyle = run.color;
        ctx.lineWidth   = _axisLW(1.8);
        ctx.stroke();
    } else {
        /* Corps blanc (repli tant que l'image charge) */
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, r, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur  = _axisLW(5);
        ctx.fill();
        ctx.shadowBlur  = 0;
        ctx.strokeStyle = run.color;
        ctx.lineWidth   = _axisLW(1.8);
        ctx.stroke();
    }

    ctx.restore();
}

/* Rejoue une particule (pas le ballon de pesanteur) pour une run électrique sauvegardée */
function _drawSavedBallE(ctx, run) {
    var pts = run.graphData;
    if (pts.length === 0) return;

    var idx = pts.length - 1;
    for (var k = 0; k < pts.length - 1; k++) {
        if (pts[k + 1].t > _replayT) { idx = k; break; }
    }
    var d0 = pts[idx];
    var x, y;
    if (idx < pts.length - 1 && pts[idx + 1].t > pts[idx].t) {
        var d1 = pts[idx + 1];
        var alpha = (_replayT - d0.t) / (d1.t - d0.t);
        x = d0.x + alpha * (d1.x - d0.x);
        y = d0.y + alpha * (d1.y - d0.y);
    } else {
        x = d0.x; y = d0.y;
    }

    var p = toCanvas(x, y);
    var r = _particleRadius();
    var charge = run.q < 0 ? '−' : '+';
    var color  = run.q < 0 ? '#4a90d9' : '#e06060';

    ctx.save();
    ctx.beginPath(); ctx.arc(p.cx, p.cy, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.30)'; ctx.shadowBlur = _axisLW(5);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = _axisLW(1.5); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.max(10, r * 1.3) + 'px Arial';   /* r suit déjà l'échelle */
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(charge, p.cx, p.cy);
    ctx.restore();
}

/* ─────────────────────────────────────────────────
   Trajectoire courante
───────────────────────────────────────────────── */
function _drawTrajectory(ctx) {
    if (sim.trajPoints.length < 2) return;
    ctx.save();
    ctx.strokeStyle = _currentRunColor || 'rgba(255,255,100,0.75)';
    ctx.lineWidth = _axisLW(2);
    ctx.lineJoin = 'round';

    if (_splitActive()) {
        /* Trouver l'index du sommet (y max) */
        var peakIdx = 0;
        for (var k = 1; k < sim.trajPoints.length; k++) {
            if (sim.trajPoints[k].y > sim.trajPoints[peakIdx].y) peakIdx = k;
        }
        /* Segment montée */
        var oxUp = _phaseOx(1);
        ctx.beginPath();
        for (var i = 0; i <= peakIdx; i++) {
            var q = toCanvas(sim.trajPoints[i].x, sim.trajPoints[i].y);
            i === 0 ? ctx.moveTo(oxUp, q.cy) : ctx.lineTo(oxUp, q.cy);
        }
        ctx.stroke();
        /* Segment descente */
        if (peakIdx < sim.trajPoints.length - 1) {
            var oxDn = _phaseOx(-1);
            ctx.beginPath();
            for (var j = peakIdx; j < sim.trajPoints.length; j++) {
                var q2 = toCanvas(sim.trajPoints[j].x, sim.trajPoints[j].y);
                j === peakIdx ? ctx.moveTo(oxDn, q2.cy) : ctx.lineTo(oxDn, q2.cy);
            }
            ctx.stroke();
        }
    } else {
        ctx.beginPath();
        var p0 = toCanvas(sim.trajPoints[0].x, sim.trajPoints[0].y);
        ctx.moveTo(p0.cx, p0.cy);
        for (var i = 1; i < sim.trajPoints.length; i++) {
            var p = toCanvas(sim.trajPoints[i].x, sim.trajPoints[i].y);
            ctx.lineTo(p.cx, p.cy);
        }
        ctx.stroke();
    }
    ctx.restore();
}

/* ─────────────────────────────────────────────────
   Chronophotographie
───────────────────────────────────────────────── */
function _drawChronoSnaps(ctx) {
    var snaps = sim.chronoSnaps;
    if (snaps.length === 0) return;

    for (var i = 0; i < snaps.length; i++) {
        var s = snaps[i];
        var p = _toCanvasSplit(s.x, s.y, s.vy);

        /* Disque de position */
        ctx.save();
        ctx.fillStyle = _currentRunColor || 'rgba(255,255,255,0.85)';
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = _axisLW(1.5);
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, _chronoRadius(), 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        /* Vecteurs aux positions figées */
        if (sim.showVecPos) {
            _drawVectorPos(ctx, s.x, s.y, 0.6);
        }
        if (sim.showVecVit) {
            var _dV = _vecCanvasDelta(s.vx, s.vy, VEC_SCALE_VIT);
            _drawVecDispVA(ctx, p.cx, p.cy, _dV.dx, _dV.dy, COL_VEC_VIT, null, 0.6);
        }
        if (sim.showVecAcc) {
            var _dA = _vecCanvasDelta(s.ax, s.ay, VEC_SCALE_ACC);
            _drawVecDispVA(ctx, p.cx, p.cy, _dA.dx, _dA.dy, COL_VEC_ACC, null, 0.6);
        }
        if (sim.showVecForces || sim.showVecSumF) {
            var _sp = { mass: sim.mass, g: sim.g, windForce: sim.windForce, useFriction: sim.useFriction, k: sim.k };
            if (sim.showVecForces) _drawForcesAt(ctx, p.cx, p.cy, s.vx, s.vy, 0.6, _sp);
            if (sim.showVecSumF)   _drawSumFAt(ctx,   p.cx, p.cy, s.vx, s.vy, 0.6, _sp);
        }
    }
}

/* ─────────────────────────────────────────────────
   Ballon de foot
───────────────────────────────────────────────── */
function _drawBall(ctx) {
    var p = _toCanvasSplit(sim.x, sim.y, sim.vy);
    var r = _ballRadius();

    ctx.save();

    if (_ballonImg.complete && _ballonImg.naturalWidth > 0) {
        var d = r * 2;
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur  = _axisLW(5);
        ctx.drawImage(_ballonImg, p.cx - r, p.cy - r, d, d);
        ctx.shadowBlur  = 0;
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, r, 0, 2 * Math.PI);
        ctx.strokeStyle = _currentRunColor || '#000';
        ctx.lineWidth   = _axisLW(1.8);
        ctx.stroke();
    } else {
        /* Corps blanc (repli tant que l'image charge) */
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, r, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur  = _axisLW(5);
        ctx.fill();
        ctx.shadowBlur  = 0;
        ctx.strokeStyle = _currentRunColor || '#333';
        ctx.lineWidth   = _axisLW(1.8);
        ctx.stroke();
    }

    ctx.restore();

    /* Vecteurs sur la balle courante */
    if (sim.showVecPos) _drawVectorPos(ctx, sim.x, sim.y, 1.0);
    if (sim.showVecVit) {
        var _dV = _vecCanvasDelta(sim.vx, sim.vy, VEC_SCALE_VIT);
        _drawVecDispVA(ctx, p.cx, p.cy, _dV.dx, _dV.dy, COL_VEC_VIT, null, 1.0);
    }
    if (sim.showVecAcc) {
        var _dA = _vecCanvasDelta(sim.ax, sim.ay, VEC_SCALE_ACC);
        _drawVecDispVA(ctx, p.cx, p.cy, _dA.dx, _dA.dy, COL_VEC_ACC, null, 1.0);
    }
    if (sim.showVecForces || sim.showVecSumF) {
        var _bp = { mass: sim.mass, g: sim.g, windForce: sim.windForce, useFriction: sim.useFriction, k: sim.k };
        if (sim.showVecForces) _drawForcesAt(ctx, p.cx, p.cy, sim.vx, sim.vy, 1.0, _bp);
        if (sim.showVecSumF)   _drawSumFAt(ctx,   p.cx, p.cy, sim.vx, sim.vy, 1.0, _bp);
    }
}

/* ── Vecteur position (de O vers la balle) ── */
function _drawVectorPos(ctx, px, py, alpha) {
    var origin = toCanvas(0, 0);
    var p      = toCanvas(px, py);
    var dx = p.cx - origin.cx;
    var dy = p.cy - origin.cy;
    var showVec  = (vecDisplayMode === 'vecteur'     || vecDisplayMode === 'vecteur-composantes');
    var showComp = (vecDisplayMode === 'composantes' || vecDisplayMode === 'vecteur-composantes');
    var showBoth = (vecDisplayMode === 'vecteur-composantes');
    var _posPerp = sim.armatureMode === 'perp-x';
    var _col     = _posPerp ? COL_VEC_POS_PERP : COL_VEC_POS;
    var _a       = _posPerp ? 1.0 : alpha;
    var _lw      = _posPerp ? VEC_LW_PERP : 3.5;
    /* Ordre : composantes → pointillés → vecteur (le vecteur est toujours au premier plan) */
    /* Composantes de OM plus épaisses (lw=3.5, plus en mode perp-x) pour rester visibles */
    if (showComp) _drawVecComponents(ctx, origin.cx, origin.cy, dx, dy, _col, _a, _lw);
    if (showBoth) _drawCompDashes(ctx, origin.cx, origin.cy, dx, dy, _col, _a);
    if (showVec)  _drawVecArrow(ctx, origin.cx, origin.cy, dx, dy, _col, '', _a, _posPerp ? VEC_LW_PERP : undefined);
    if (showVec)  _reserveArrow(origin.cx, origin.cy, dx, dy);
    if (showComp) { _reserveArrow(origin.cx, origin.cy, dx, 0); _reserveArrow(origin.cx, origin.cy, 0, dy); }
}

/* ─────────────────────────────────────────────────
   _drawVecArrow — flèche générique
   (cx,cy) = base, (dx,dy) = composantes en pixels
───────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────
   Composantes d'un vecteur : deux flèches orthogonales
   (une horizontale, une verticale) partant du même point.
   lw = épaisseur du trait (défaut 2, plus épais pour OM qui chevauche les axes)
───────────────────────────────────────────────── */
/* Composantes visuellement atténuées (opacité réduite + trait fin) pour se distinguer du vecteur. */
function _drawVecComponents(ctx, cx, cy, dxPx, dyPx, color, opacity, lw) {
    lw = lw || 2;
    var compOpacity = opacity * 0.55;
    var compLw      = Math.max(1.2, lw * 0.72);
    if (Math.abs(dxPx) > 2) _drawVecArrow(ctx, cx, cy, dxPx, 0, color, null, compOpacity, compLw);
    if (Math.abs(dyPx) > 2) _drawVecArrow(ctx, cx, cy, 0, dyPx, color, null, compOpacity, compLw);
}

/* Pointillés reliant les pointes des composantes à la pointe du vecteur (rectangle de décomposition). */
function _drawCompDashes(ctx, cx, cy, dxPx, dyPx, color, opacity) {
    if (Math.abs(dxPx) < 3 || Math.abs(dyPx) < 3) return;
    ctx.save();
    ctx.globalAlpha  = opacity * 0.40;
    ctx.strokeStyle  = color;
    ctx.lineWidth    = 1.2 * _txtScale();
    ctx.setLineDash([4 * _txtScale(), 5 * _txtScale()]);
    ctx.lineCap      = 'round';
    /* Pointe x-comp → pointe vecteur (vertical) */
    ctx.beginPath();
    ctx.moveTo(cx + dxPx, cy);
    ctx.lineTo(cx + dxPx, cy + dyPx);
    ctx.stroke();
    /* Pointe y-comp → pointe vecteur (horizontal) */
    ctx.beginPath();
    ctx.moveTo(cx, cy + dyPx);
    ctx.lineTo(cx + dxPx, cy + dyPx);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

/* Dessine vecteur et/ou composantes selon vecDisplayMode pour v et a (base = point M). */
function _drawVecDispVA(ctx, cx, cy, dxPx, dyPx, color, label, opacity, lw) {
    var showVec  = (vecDisplayMode === 'vecteur'     || vecDisplayMode === 'vecteur-composantes');
    var showComp = (vecDisplayMode === 'composantes' || vecDisplayMode === 'vecteur-composantes');
    var showBoth = (vecDisplayMode === 'vecteur-composantes');
    if (showComp) _drawVecComponents(ctx, cx, cy, dxPx, dyPx, color, opacity);
    if (showBoth) _drawCompDashes(ctx, cx, cy, dxPx, dyPx, color, opacity);
    if (showVec)  _drawVecArrow(ctx, cx, cy, dxPx, dyPx, color, label, opacity, lw);
    /* Déclaré au décor : une étiquette ne doit pas couvrir la flèche qu'elle
       nomme, ni celle de la voisine. */
    if (showVec)  _reserveArrow(cx, cy, dxPx, dyPx);
    if (showComp) { _reserveArrow(cx, cy, dxPx, 0); _reserveArrow(cx, cy, 0, dyPx); }
}

function _drawVecArrow(ctx, cx, cy, dx, dy, color, label, opacity, lw) {
    var len = Math.hypot(dx, dy);
    if (len < 3) return;
    /* Épaisseur, pointe et liseré suivent la taille du canvas comme les traits
       du repère : les valeurs reçues et les constantes sont des références sur
       un canvas de référence. La LONGUEUR de la flèche, elle, ne bouge pas —
       c'est une échelle physique (px par m/s), pas un choix graphique. */
    var f = _txtScale();
    lw = (lw || 2) * f;
    var halo = VEC_HALO_W * f;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';

    var ex = cx + dx, ey = cy + dy;
    var aLen  = Math.min(12 * f, len * 0.4);
    var angle = Math.atan2(dy, dx);

    /* Corps : s'arrête à la base de la pointe pour que le bout épais du trait
       ne dépasse pas de la pointe (visible surtout avec un lineWidth élevé) */
    var bx = ex - aLen * 0.85 * Math.cos(angle);
    var by = ey - aLen * 0.85 * Math.sin(angle);

    function _bodyPath() {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(bx, by);
    }
    function _headPath() {
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - aLen * Math.cos(angle - 0.38),
                   ey - aLen * Math.sin(angle - 0.38));
        ctx.lineTo(ex - aLen * Math.cos(angle + 0.38),
                   ey - aLen * Math.sin(angle + 0.38));
        ctx.closePath();
    }

    /* Liseré blanc : mêmes chemins tracés d'abord en blanc et légèrement plus
       épais, de sorte que seul le débord reste visible une fois le vecteur
       dessiné par-dessus. Il détache le vecteur du fond (ciel, sol, armatures,
       trajectoire) sans l'épaissir visuellement. Il suit le globalAlpha du
       vecteur, pour qu'une flèche atténuée n'ait pas un liseré à pleine
       opacité. */
    ctx.strokeStyle = VEC_HALO_COLOR;
    ctx.lineWidth   = lw + halo * 2;
    _bodyPath(); ctx.stroke();
    ctx.lineWidth   = halo * 2;
    _headPath(); ctx.stroke();

    /* Vecteur */
    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.lineWidth   = lw;
    _bodyPath(); ctx.stroke();
    _headPath(); ctx.fill();

    /* Label */
    if (label) {
        ctx.font = 'bold ' + _animFontSize(11, 13, 0.028) + 'px Segoe UI, Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var lx = ex + Math.cos(angle + Math.PI / 2) * 10;
        var ly = ey + Math.sin(angle + Math.PI / 2) * 10;
        ctx.fillText(label, lx, ly);
    }

    ctx.restore();
}

/* ─────────────────────────────────────────────────
   Points d'analyse épinglés — hover figé
───────────────────────────────────────────────── */
function _drawAnalysisPoints(ctx) {
    var allPins = sim.analysisPoints.slice();
    for (var ri = 0; ri < savedRuns.length; ri++) {
        if (!savedRuns[ri].hidden) {
            allPins = allPins.concat(savedRuns[ri].analysisPoints);
        }
    }
    for (var pi = 0; pi < allPins.length; pi++) {
        _drawAnimHover(ctx, allPins[pi], true);
    }
}

/* ─────────────────────────────────────────────────
   Hover animation canvas
───────────────────────────────────────────────── */
function _updateAnimHover(mouseX, mouseY) {
    if (activeTab === 'champ-electrique') { _updateAnimHoverE(mouseX, mouseY); return; }
    var isChrono = (sim.displayMode === 'chrono');
    var datasets = [];

    if (isChrono) {
        if (sim.chronoSnaps.length > 0) {
            datasets.push({ data: sim.chronoSnaps, color: _currentRunColor || '#2a5080', runId: null });
        }
        for (var i = 0; i < savedRuns.length; i++) {
            if (!savedRuns[i].hidden && savedRuns[i].chronoSnaps.length > 0) {
                datasets.push({ data: savedRuns[i].chronoSnaps, color: savedRuns[i].color, runId: i });
            }
        }
    } else {
        if (sim.graphData.length >= 2) {
            datasets.push({ data: sim.graphData, color: _currentRunColor || '#2a5080', runId: null });
        }
        for (var i = 0; i < savedRuns.length; i++) {
            if (!savedRuns[i].hidden) datasets.push({ data: savedRuns[i].graphData, color: savedRuns[i].color, runId: i });
        }
    }

    /* Boucle appelée à chaque pointermove sur l'ensemble des points de toutes
       les simulations affichées : on rejette d'abord par encadrement (deux
       comparaisons) et on compare des distances au carré, pour ne calculer
       ni racine ni groundY() sur la quasi-totalité des points. bestD2 part du
       carré du rayon d'accroche, ce qui applique le seuil au passage. */
    var R  = _hoverPickRadius();
    var bestD2 = R * R, bestSnap = null;
    var groundLimit = groundY() + 10;
    for (var di = 0; di < datasets.length; di++) {
        var pts = datasets[di].data;
        for (var k = 0; k < pts.length; k++) {
            var p = _toCanvasSplit(pts[k].x, pts[k].y, pts[k].vy || 0);
            /* ignorer les points sous le sol (hors zone visible) */
            if (p.cy > groundLimit) continue;
            var dx = p.cx - mouseX;
            if (dx > R || dx < -R) continue;
            var dy = p.cy - mouseY;
            if (dy > R || dy < -R) continue;
            var d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
                bestD2 = d2;
                bestSnap = { x: pts[k].x, y: pts[k].y,
                             vx: pts[k].vx, vy: pts[k].vy,
                             ax: pts[k].ax, ay: pts[k].ay,
                             t: pts[k].t, color: datasets[di].color,
                             runId: datasets[di].runId,
                             _cx: p.cx, _cy: p.cy };
            }
        }
    }
    _animHoverSnap = bestSnap;
}

/* ─────────────────────────────────────────────────
   Style des noms de vecteurs sur le canvas — calé sur celui du <math> des
   boutons "Vecteurs" du panneau (ex. <mover><mi>v</mi><mo>→</mo></mover>).
   MathML Core met en italique un <mi> d'une seule lettre et droit un <mi> de
   plusieurs lettres ; le Σ des boutons ΣF est en outre marqué
   mathvariant="normal" (droit) explicitement dans le HTML. Reproduit ici :
     - identifiant d'une lettre (v, a, F, f, P)  → italique
     - identifiant de plusieurs lettres (OM)     → droit
     - Σ, seul ou suivi d'une lettre (ΣF)        → toujours droit
     - "F" + lettre d'espèce (FE, Fv)            → F italique, lettre en
       indice italique, comme le F_E du bouton "Force électrique"
   (<msub><mi>F</mi><mi>E</mi></msub>).
   Défini nom par nom plutôt que déduit d'une règle générale, pour ne jamais
   mal interpréter un nom qui n'existe pas encore dans cette table. */
var VEC_NAME_PARTS = {
    'OM': [{ t: 'OM' }],
    'v':  [{ t: 'v', i: true }],
    'a':  [{ t: 'a', i: true }],
    'P':  [{ t: 'P', i: true }],
    'f':  [{ t: 'f', i: true }],
    'Fv': [{ t: 'F', i: true }, { t: 'v', i: true, sub: true }],
    'FE': [{ t: 'F', i: true }, { t: 'E', i: true, sub: true }],
    'ΣF': [{ t: 'Σ' }, { t: 'F', i: true }]
};
var VEC_SUB_RATIO = 0.68;  // taille d'un indice, fraction de la lettre normale
var VEC_SUB_DY    = 0.32;  // décalage vertical d'un indice, fraction de la taille

/* Police des noms de vecteurs — reproduit ce que le navigateur fait pour les
   <math> des boutons "Vecteurs" (aucune règle de font-family ne les cible dans
   style.css : ils s'affichent donc dans la police mathématique par défaut).

   Le mot-clé générique CSS "math" désigne cette police, mais il ne suffit pas
   de l'écrire seul dans ctx.font : un navigateur qui ne le connaît pas le lit
   comme un simple NOM de famille, ne trouve rien, et retombe sur la police par
   défaut du canvas — d'où des noms sans aucun rapport avec ceux des boutons.
   On le place donc en tête d'une pile qui nomme explicitement les polices math
   réellement installées (Cambria Math sous Windows, celle que Chrome choisit
   pour <math>), avec un repli serif final. */
var VEC_MATH_FONT = 'math, "Cambria Math", "STIX Two Math", "Latin Modern Math", ' +
                    '"DejaVu Math TeX Gyre", Georgia, "Times New Roman", serif';

/* Italique : MathML n'incline rien. <mi>v</mi> est rendu via text-transform
   math-auto, qui remplace la lettre par son codet italique mathématique
   (v → U+1D463 𝑣), un glyphe réellement dessiné dans la police math. Demander
   "italic" au canvas donnerait au contraire une oblique synthétique — les
   polices math n'ont pas de fonte italique —, nettement plus lourde et
   différente des boutons. On applique donc la même substitution de codets. */
function _mathItalicGlyph(t) {
    var out = '';
    for (var i = 0; i < t.length; i++) {
        var c = t.charCodeAt(i), cp;
        if      (c === 104)           cp = 0x210E;              // h : absent du bloc, glyphe de Planck
        else if (c >= 65 && c <= 90)  cp = 0x1D434 + (c - 65);  // A–Z italique math
        else if (c >= 97 && c <= 122) cp = 0x1D44E + (c - 97);  // a–z italique math
        else { out += t.charAt(i); continue; }                  // Σ, chiffres… : inchangés
        /* Hors du plan de base : encodage en paire de substitution UTF-16 */
        out += (cp > 0xFFFF)
            ? String.fromCharCode(0xD800 + ((cp - 0x10000) >> 10), 0xDC00 + ((cp - 0x10000) & 0x3FF))
            : String.fromCharCode(cp);
    }
    return out;
}

/* Ces codets ne sont pas couverts par toutes les polices : sans police math
   installée, ils s'afficheraient en carrés vides. Test fait une seule fois, en
   comparant la largeur du glyphe à celle d'un codet d'usage privé qu'aucune
   police courante ne dessine (largeurs identiques = les deux sont des carrés
   vides). Si absent, on retombe sur l'oblique synthétique, moins fidèle mais
   toujours lisible. */
var _mathItalicOk = null;
function _mathItalicAvailable(ctx) {
    if (_mathItalicOk === null) {
        var prev = ctx.font;
        ctx.font = 'bold 40px ' + VEC_MATH_FONT;
        var wGlyph = ctx.measureText('𝑣').width;   // 𝑣 italique math
        var wTofu  = ctx.measureText('󰀀').width;   // codet d'usage privé, sans glyphe
        _mathItalicOk = (wGlyph > 0 && Math.abs(wGlyph - wTofu) > 0.5);
        ctx.font = prev;
    }
    return _mathItalicOk;
}

function _mathNameParts(name) {
    return VEC_NAME_PARTS[name] || [{ t: name }];   /* nom inconnu : rendu droit tel quel */
}

/* Texte à tracer pour une partie de nom, selon la disponibilité des codets. */
function _mathText(ctx, p) {
    return (p.i && _mathItalicAvailable(ctx)) ? _mathItalicGlyph(p.t) : p.t;
}

function _mathFont(ctx, sz, italic) {
    var synth = italic && !_mathItalicAvailable(ctx);   /* repli : oblique simulée */
    return (synth ? 'italic ' : '') + 'bold ' + sz + 'px ' + VEC_MATH_FONT;
}

/* Largeur totale d'un nom de vecteur dans le style ci-dessus. */
function _measureMathName(ctx, name, size) {
    var parts = _mathNameParts(name);
    var w = 0;
    for (var i = 0; i < parts.length; i++) {
        var p  = parts[i];
        var sz = p.sub ? size * VEC_SUB_RATIO : size;
        ctx.font = _mathFont(ctx, sz, p.i);
        w += ctx.measureText(_mathText(ctx, p)).width;
    }
    return w;
}

/* Dessine un nom de vecteur dans le style ci-dessus.
   (x, y) = coin haut-gauche du texte normal (textBaseline 'top'). */
function _drawMathName(ctx, name, x, y, size, color, outlineW) {
    var parts = _mathNameParts(name);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle    = color;
    var cx = x;
    for (var i = 0; i < parts.length; i++) {
        var p  = parts[i];
        var sz = p.sub ? size * VEC_SUB_RATIO : size;
        var tx = _mathText(ctx, p);
        ctx.font = _mathFont(ctx, sz, p.i);
        var py = p.sub ? y + size * VEC_SUB_DY : y;
        if (outlineW) {
            ctx.save();
            ctx.lineJoin    = 'round';
            ctx.miterLimit  = 2;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth   = outlineW;
            ctx.strokeText(tx, cx, py);
            ctx.restore();
        }
        ctx.fillText(tx, cx, py);
        cx += ctx.measureText(tx).width;
    }
}

/* ── Flèche de vecteur, au-dessus du nom ──
   Les boutons l'obtiennent par <mover><mi>v</mi><mo>→</mo></mover> : c'est le
   GLYPHE → (U+2192) de la police math, pas un dessin. La tracer ici au trait
   avec des barbes de taille fixe donnait forcément autre chose — pointe trop
   grosse sur les petits noms de forces, trop maigre sur les grandes étiquettes,
   épaisseur sans rapport avec celle des lettres. On dessine donc le même
   glyphe, dans la même police et la même graisse que le nom.

   Comme dans un <mover>, la flèche n'est jamais comprimée sous sa largeur
   naturelle : si le nom est plus étroit qu'elle (v, a, f…), c'est la boîte du
   composé qui vaut la largeur de la flèche et le nom qui se centre dessous ;
   si le nom est plus large (OM, ΣF, F indicé), la flèche s'étire jusqu'à le
   couvrir. */
var VEC_ARROW_CHAR = '→';

function _measureMathArrow(ctx, size) {
    ctx.font = 'bold ' + size + 'px ' + VEC_MATH_FONT;
    var mt   = ctx.measureText(VEC_ARROW_CHAR);
    /* Hauteur réelle de l'encre : la flèche est un trait fin très au-dessus de
       la ligne de base, la boîte em serait beaucoup trop haute. */
    var asc  = (typeof mt.actualBoundingBoxAscent  === 'number') ? mt.actualBoundingBoxAscent  : size * 0.46;
    var desc = (typeof mt.actualBoundingBoxDescent === 'number') ? mt.actualBoundingBoxDescent : -size * 0.30;
    return { w: mt.width, h: Math.max(1, asc + desc), asc: asc };
}

/* (x, y) = coin haut-gauche de l'encre de la flèche ; w = largeur voulue. */
function _drawMathArrow(ctx, x, y, w, size, color, outlineW) {
    var a = _measureMathArrow(ctx, size);
    ctx.save();
    ctx.fillStyle    = color;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font         = 'bold ' + size + 'px ' + VEC_MATH_FONT;
    if (w > a.w + 0.5) {
        ctx.translate(x, 0);
        ctx.scale(w / a.w, 1);          /* étirement horizontal seul : le trait
                                           s'allonge, l'épaisseur ne bouge pas */
        x = 0;
    }
    if (outlineW) {
        ctx.lineJoin    = 'round';
        ctx.miterLimit  = 2;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = outlineW;
        ctx.strokeText(VEC_ARROW_CHAR, x, y + a.asc);
    }
    ctx.fillText(VEC_ARROW_CHAR, x, y + a.asc);
    ctx.restore();
}

/* ── Lignes de coordonnées : indices ──
   Les lignes sont écrites avec un souligné devant la lettre à mettre en
   indice : 'v_x = 3,2 m/s' donne « vx = 3,2 m/s » avec le x en indice, comme
   il se doit pour une composante. Le souligné ne concerne que le caractère qui
   le suit ; tout le reste de la ligne est rendu normalement. */
var TXT_SUB_RATIO = 0.72;   // taille de l'indice, fraction de la taille normale
var TXT_SUB_DY    = 0.22;   // abaissement de l'indice, fraction de la taille normale

/* Découpe une ligne en morceaux [{ t, sub }]. */
function _subParts(line) {
    var parts = [], buf = '';
    for (var i = 0; i < line.length; i++) {
        if (line.charAt(i) === '_' && i + 1 < line.length) {
            if (buf) { parts.push({ t: buf }); buf = ''; }
            parts.push({ t: line.charAt(i + 1), sub: true });
            i++;
        } else {
            buf += line.charAt(i);
        }
    }
    if (buf) parts.push({ t: buf });
    return parts;
}

/* Police par défaut (étiquettes de l'animation). fontFn(taille) → ctx.font :
   graph.js passe la sienne pour les axes et l'infobulle des graphes. */
function _txtFont(sz) { return 'bold ' + sz + 'px "Segoe UI", Arial'; }

function _measureSubText(ctx, line, size, fontFn) {
    var f = fontFn || _txtFont;
    var parts = _subParts(line), w = 0;
    for (var i = 0; i < parts.length; i++) {
        ctx.font = f(parts[i].sub ? size * TXT_SUB_RATIO : size);
        w += ctx.measureText(parts[i].t).width;
    }
    return w;
}

/* (x, y) = origine gauche du texte normal ; l'appelant fixe textBaseline, le
   décalage de l'indice est le même quelle que soit la ligne de référence.
   outlineW : épaisseur (px) d'un liseré blanc tracé sous le texte, pour le
   détacher d'un fond chargé (vue projetée) ; omis, aucun liseré. */
function _drawSubText(ctx, line, x, y, size, fontFn, outlineW) {
    var f = fontFn || _txtFont;
    var parts = _subParts(line), cx = x;
    ctx.textAlign = 'left';
    for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var py = p.sub ? y + size * TXT_SUB_DY : y;
        ctx.font = f(p.sub ? size * TXT_SUB_RATIO : size);
        if (outlineW) {
            ctx.save();
            ctx.lineJoin    = 'round';
            ctx.miterLimit  = 2;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth   = outlineW;
            ctx.strokeText(p.t, cx, py);
            ctx.restore();
        }
        ctx.fillText(p.t, cx, py);
        cx += ctx.measureText(p.t).width;
    }
}

/* Affiche les coordonnées d'un vecteur en notation mathématique :
   grande parenthèse avec deux lignes (ligne1 / ligne2)  */
/* Calcule les dimensions d'un label coordonnées (sans dessiner). */
function _measureVecLabel(ctx, vecName, line1, line2, scale) {
    /* Tailles calibrées pour rester lisibles vidéoprojetées, au fond d'une
       salle : ~6 % de la hauteur du canvas, avec un plancher confortable. */
    var k        = (scale || 1) * _labelCrowdScale;
    var fontSize = _animFontSize(20, 30, 0.060) * k;
    var nameSize = _animFontSize(19, 28, 0.056) * k;

    var w1    = _measureSubText(ctx, line1, fontSize);
    var w2    = _measureSubText(ctx, line2, fontSize);
    var textW = Math.max(w1, w2);
    var lineH = fontSize * 1.45;
    var parenH = lineH * 2;
    var parenW = Math.max(7, fontSize * 0.38);
    var iPad   = 7 * k;
    var blockW = parenW * 2 + iPad * 2 + textW;

    var nameW      = _measureMathName(ctx, vecName, nameSize);
    var arrow      = _measureMathArrow(ctx, nameSize);
    var accW       = Math.max(nameW, arrow.w);          // largeur du composé <mover>
    var arrowGap   = Math.max(1, nameSize * 0.07);      // jeu flèche / sommet des lettres
    var arrowExtra = arrow.h + arrowGap;
    var nameColW   = accW + 10 * k;
    var nameColH   = arrowExtra + nameSize;

    return {
        fontSize: fontSize, nameSize: nameSize,
        textW: textW, lineH: lineH, parenH: parenH, parenW: parenW, iPad: iPad, blockW: blockW,
        nameW: nameW, accW: accW, arrowW: arrow.w, arrowH: arrow.h,
        arrowExtra: arrowExtra, nameColW: nameColW, nameColH: nameColH,
        totalW: nameColW + blockW,
        totalH: Math.max(parenH, nameColH)
    };
}

/* Retourne {lx, ly} : première position dans preferOrder qui :
   - tient dans le canvas (marge M),
   - est au-dessus du sol,
   - ne chevauche aucun rect dans placedRects [{lx,ly,w,h}]. */
var _labelMaxY = null; // null = auto (ground), number = override

/* ── Registre des boîtes déjà attribuées, partagé par toute une image ──
   Chaque groupe d'étiquettes repartait d'un tableau vide : un par instantané
   chronophoto, un par point épinglé, un pour le mobile, un pour le survol.
   Aveugles les uns aux autres, ils se recouvraient systématiquement dès que
   la chronophotographie affichait les forces. Un seul registre par image y
   met fin.

   Deux niveaux, parce que les regrouper tous rendrait le remède pire que le
   mal : les instantanés figés sont dessinés AVANT le mobile et le survol,
   donc placés avant eux. Nombreux et fanés, ils rafleraient les bonnes
   positions et exileraient loin de son vecteur l'étiquette que l'on est
   justement en train de désigner.

   • dur  — étiquettes à pleine opacité : mobile courant, points épinglés,
            survol. Elles s'évitent entre elles et rien ne leur prend leur
            place.
   • fané — instantanés chronophoto (α 0,42 à 0,6). Ils s'évitent entre eux
            et évitent les dures, sans jamais les contraindre.

   Une étiquette dure peut donc encore tomber sur une fanée ; le contraste
   d'opacité fait qu'elle se lit par-dessus, et c'est le compromis voulu :
   mieux vaut une étiquette nette sur un fantôme que la bonne étiquette
   exilée à l'autre bout du canvas. */
/* Bord bas au-delà duquel une étiquette ne doit pas descendre.

   En vue normale c'est le sol : une étiquette enterrée n'a pas de sens. Mais
   en vue du dessus (proj-x), tx vaut π/2, le cosinus de toCanvas s'annule et
   toute la scène s'écrase sur la ligne y = 0, désormais au milieu du canvas.
   Cette ligne n'est plus le sol — c'est l'axe x vu du dessus, et le sol, lui,
   a envahi tout le cadre. La contrainte, devenue vide de sens, restait
   pourtant active : elle interdisait aux étiquettes la moitié basse du
   canvas, laissée vide pendant que la moitié haute se serrait.

   La limite suit donc l'aplatissement de la scène, du sol vers le bas du
   cadre. L'interpolation est progressive et non un basculement, parce que le
   changement de vue est animé : une limite qui sauterait ferait sauter les
   étiquettes avec elle en milieu de transition.

   En proj-y, tx reste nul : la verticale y est toujours physique, le sol
   toujours le sol, et rien ne change. */
function _labelGroundLimit(M) {
    var ground = toCanvas(0, 0).cy - M;
    var flat   = Math.min(1, Math.max(0, _viewAngles.tx / (Math.PI / 2)));
    return ground + (_animH - M - ground) * flat;
}

var _labelRectsHard = [];
var _labelRectsSoft = [];

/* ── Le décor : ce que les étiquettes doivent éviter de masquer ──
   Jusqu'ici le placement n'arbitrait qu'entre étiquettes ; les axes, les
   flèches et la trajectoire n'existaient pas pour lui. Une étiquette pouvait
   se poser en plein sur la parabole sans que rien ne s'y oppose.

   Le décor est déclaré en deux formes, parce que deux natures d'encre ne se
   masquent pas de la même façon :

   • _labelScenery — des RECTANGLES, pour ce qui occupe une surface : les
     graduations chiffrées, les noms d'axes. Recouvrir la moitié d'un « 12 »
     le rend illisible ; ce qui compte est la fraction cachée.

   • _labelInk — des POINTS échantillonnés le long des TRAITS : axes, flèches,
     trajectoire. Un trait ne s'évalue pas en surface — il est fin, et son
     coût tient à la longueur qu'on en traverse. Compter les points tombés
     dans la boîte mesure exactement cela, et coûte bien moins cher qu'un
     test rectangle contre rectangle par segment.

   Les poids traduisent la règle retenue : on tolère de croiser la trajectoire
   (le halo la laisse lire au travers) pour rester près du vecteur, mais on
   s'éloigne plutôt que de couvrir une flèche ou une graduation. La grille de
   fond n'est pas déclarée du tout : elle est gratuite. */
var _labelScenery = [];
var _labelInk     = [];

var INK_GRAD    = 0.60;   // graduations chiffrées, noms d'axes
var INK_AXIS    = 0.45;   // le trait des axes lui-même
var INK_ARROW   = 1.00;   // flèches de vecteurs : le sujet du cours
var INK_TRAJ    = 0.25;   // trajectoire : tolérée, le halo la sauve

/* Plafond du nuage de points. Sans lui, une trajectoire longue et une
   chronophotographie fournie feraient enfler la boucle de coût à chaque
   image. Au-delà, on cesse d'ajouter : mieux vaut un décor incomplet qu'une
   animation qui rame. */
var _INK_MAX = 900;

/* Le nuage d'encre est rangé en cases, sans quoi chaque position candidate le
   parcourrait en entier : une quarantaine de candidats par étiquette, autant
   d'étiquettes par image, quelques centaines de points — le compte grimpe
   vite. Une étiquette ne couvre qu'une poignée de cases, et n'a donc à
   examiner que les points qui s'y trouvent.

   La grille se reconstruit quand le nuage a changé de taille. Les points ne
   font que s'y ajouter jusqu'au prochain _resetLabelRects, si bien que sa
   longueur suffit à dater son contenu. */
var _INK_CELL = 64;
var _inkGrid  = null;
var _inkGridN = -1;

function _resetLabelRects() {
    _labelRectsHard.length = 0;
    _labelRectsSoft.length = 0;
    _labelScenery.length   = 0;
    _labelInk.length       = 0;
    /* La file aussi : _flushLabels la vide en temps normal, mais une exception
       levée en cours d'image la laisserait pleine, et ses demandes se
       poseraient à l'image suivante contre un décor qui n'est plus le leur. */
    _labelQueue.length     = 0;
    _inkGrid  = null;
    _inkGridN = -1;
}

/* Halo (liseré blanc) des étiquettes de vecteur et de coordonnées : utile sur
   fond clair ou sur la scène habituelle, mais un liseré blanc sur le fond vert
   de la vue du dessus (proj-x) dessine un cadre autour du texte au lieu de le
   détacher du décor — l'effet inverse de celui recherché.

   La couverture verte croît continûment avec tx (l'horizon monte à mesure
   que la caméra bascule), donc le halo suit la même fraction plutôt que de
   basculer net : sans ça, il apparaîtrait ou disparaîtrait d'un coup en
   plein milieu de l'animation de changement de vue.

   Ne concerne pas les flèches elles-mêmes (_drawVecArrow a son propre halo,
   indépendant) : sur un trait fin, contre la grille ou une autre flèche, le
   même problème ne se pose pas.

   Le mode électrique n'a jamais de sol vert (_drawBackgroundE est toujours
   clair et plat) : la fraction y est donc nulle, quelle que soit la vue
   affichée — même règle que oxy et proj-y en mode pesanteur. */
var _labelHaloFrac = 0;

function _updateLabelHalo(isElectric) {
    _labelHaloFrac = isElectric ? 0 : _viewAngles.tx / (Math.PI / 2);
}

/* ── F : rétrécir les étiquettes quand la scène est chargée ──
   Idée de l'utilisateur : sur grand écran, la responsivité (_txtScale) a
   agrandi les polices — confortable quand la scène est calme, mais ça donne
   moins de marge au placement dès que plusieurs points cohabitent. Plutôt que
   d'ajouter un critère de plus dans le coût de _bestLabelPos, on redonne ici
   une partie de cet agrandissement quand ça sature.

   La charge se mesure au NOMBRE DE POINTS ÉPINGLÉS, et à rien d'autre. Une
   première version comptait les étiquettes réellement posées à l'image
   précédente : plus fin sur le papier, insupportable à l'usage — ce nombre
   varie à chaque image (le mobile avance, une flèche entre ou sort du cadre,
   un instantané chronophoto apparaît) et les étiquettes respiraient en
   permanence. L'épinglage, lui, ne change que sur un geste délibéré de
   l'utilisateur : la taille ne bouge qu'au moment où il épingle ou dépingle,
   et reste ensuite parfaitement stable.

   Pour la même raison le changement est instantané, sans amortissement : un
   lissage n'aurait servi qu'à masquer les oscillations qu'on vient de
   supprimer à la source, et transformerait un geste net en glissement mou.

   Borné à [1/_txtScale(), 1] : au plus on rend l'agrandissement que
   _txtScale() a apporté, jamais on ne descend sous la taille de référence
   (calibrée pour rester lisible au vidéoprojecteur, au fond d'une salle).
   Sur un écran de taille normale, _txtScale() vaut 1, la borne basse aussi :
   le mécanisme est alors inerte, comme demandé ("surtout sur grand écran"). */
var _labelCrowdScale = 1;
var CROWD_PIN_FULL = 4;   // nombre d'épingles à partir duquel on est à la borne basse

function _updateLabelCrowd() {
    /* Mêmes épingles que _drawAnalysisPoints : celles de la course en cours
       plus celles des courses sauvegardées visibles. En mode électrique, sim
       et savedRuns sont déjà permutés vers leurs équivalents E au moment de
       l'appel, le même comptage vaut donc pour les deux modes. */
    var n = sim.analysisPoints.length;
    for (var ri = 0; ri < savedRuns.length; ri++) {
        if (!savedRuns[ri].hidden) n += savedRuns[ri].analysisPoints.length;
    }
    var frac  = Math.min(1, n / CROWD_PIN_FULL);
    var floor = 1 / _txtScale();
    _labelCrowdScale = 1 - frac * (1 - floor);
}

function _inkGridEnsure() {
    if (_inkGrid && _inkGridN === _labelInk.length) return _inkGrid;
    var cols = Math.max(1, Math.ceil(_animW / _INK_CELL));
    var rows = Math.max(1, Math.ceil(_animH / _INK_CELL));
    var cell = new Array(cols * rows);
    for (var i = 0; i < _labelInk.length; i++) {
        var p  = _labelInk[i];
        var cx = Math.floor(p.x / _INK_CELL), cy = Math.floor(p.y / _INK_CELL);
        /* Hors cadre : aucune étiquette ne peut s'y poser, le point ne servira
           jamais. */
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
        var k = cx + cy * cols;
        if (cell[k]) cell[k].push(p); else cell[k] = [p];
    }
    _inkGrid  = { cols: cols, rows: rows, cell: cell };
    _inkGridN = _labelInk.length;
    return _inkGrid;
}

function _reserveScenery(lx, ly, w, h, weight) {
    if (w > 0 && h > 0) _labelScenery.push({ lx: lx, ly: ly, w: w, h: h, weight: weight });
}

/* Échantillonne un segment en points d'encre. Le pas suit _txtScale() : sur
   grand écran tout est plus gros, il serait absurde d'y semer deux fois plus
   de points pour la même longueur de trait. */
function _reserveInkSeg(x1, y1, x2, y2, weight) {
    if (_labelInk.length >= _INK_MAX) return;
    var step = 10 * _txtScale();
    var dx = x2 - x1, dy = y2 - y1;
    var n  = Math.max(1, Math.round(Math.sqrt(dx * dx + dy * dy) / step));
    for (var i = 0; i <= n; i++) {
        if (_labelInk.length >= _INK_MAX) return;
        _labelInk.push({ x: x1 + dx * i / n, y: y1 + dy * i / n, weight: weight });
    }
}

/* Une flèche de vecteur, déclarée depuis son point d'application. */
function _reserveArrow(cx, cy, dx, dy) {
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    _reserveInkSeg(cx, cy, cx + dx, cy + dy, INK_ARROW);
}

/* Déclare l'emprise d'un texte que l'on vient de tracer. L'alignement et la
   ligne de base sont relus sur le contexte plutôt que passés en paramètre :
   chaque site de tracé les a déjà posés, les redonner serait les redire — et
   ouvrir la porte à ce que les deux divergent. */
function _reserveTextBox(ctx, text, x, y, size, weight) {
    var w  = ctx.measureText(text).width;
    var h  = size;
    var lx = x;
    if (ctx.textAlign === 'right')  lx = x - w;
    if (ctx.textAlign === 'center') lx = x - w / 2;
    var ly = y;
    if (ctx.textBaseline === 'bottom')          ly = y - h;
    else if (ctx.textBaseline === 'middle')     ly = y - h / 2;
    else if (ctx.textBaseline === 'alphabetic') ly = y - h * 0.78;
    _reserveScenery(lx, ly, w, h, weight);
}

/* Une trajectoire, échantillonnée en une centaine de points au plus quelle
   que soit sa finesse : c'est la forme de la courbe qui compte ici, pas sa
   définition.

   Sautée quand la phase de descente est séparée : la trajectoire y est
   redessinée en deux colonnes miroir, et trajPoints ne porte pas la vitesse
   qui dirait de quel côté va chaque point. Réserver la mauvaise colonne
   serait pire que de ne rien réserver. */
function _reserveTrajPts(pts) {
    if (!pts || pts.length < 2 || _splitActive()) return;
    var step = Math.max(1, Math.round(pts.length / 120));
    for (var i = 0; i < pts.length; i += step) {
        if (_labelInk.length >= _INK_MAX) return;
        var q = toCanvas(pts[i].x, pts[i].y);
        _labelInk.push({ x: q.cx, y: q.cy, weight: INK_TRAJ });
    }
}

/* Registre où réserver, et registres à éviter, pour une opacité donnée. */
function _labelRects(opacity) {
    return (opacity === undefined || opacity >= 1) ? _labelRectsHard : _labelRectsSoft;
}
function _labelObstacles(opacity) {
    return (opacity === undefined || opacity >= 1)
        ? _labelRectsHard
        : _labelRectsSoft.concat(_labelRectsHard);
}

/* Placement au coût.
   ─────────────────────────────────────────────────
   L'ancienne version prenait le premier créneau libre de preferOrder, puis
   tentait un empilage, puis — faute de mieux — clampait l'étiquette sans
   aucun test de collision. Trois défauts :

   • la réponse était binaire, libre ou occupé : impossible d'arbitrer entre
     « un peu loin mais propre » et « tout près mais à cheval sur un rect » ;
   • le dernier recours posait l'étiquette à l'aveugle, exactement le cas où
     il aurait fallu réfléchir le plus ;
   • une étiquette exilée par l'empilage devenait orpheline — plus rien ne
     disait à quelle flèche elle se rapportait.

   Chaque candidat reçoit maintenant un coût, et le moins cher gagne :

     coût = éloignement de l'ancre
          + recouvrement des étiquettes déjà posées (très cher)
          + débordement du cadre (pire encore)
          + rang dans preferOrder (départage les candidats équivalents)
          + supplément de trait de rappel

   Il n'y a donc plus de placement aveugle : même saturé, le canvas rend la
   position la moins mauvaise, et non la première venue.

   Les candidats sont de deux familles : les huit créneaux au contact de
   l'ancre, et des couronnes de rayon croissant autour d'elle. Une position
   en couronne est reliée à son ancre par un trait de rappel — l'étiquette
   s'éloigne sans se détacher. Son supplément de coût fait qu'un créneau
   libre l'emporte toujours : le trait n'apparaît que faute de mieux.

   Retourne {lx, ly, leader} ; leader vrai réclame un appel à _drawLeader. */
function _bestLabelPos(anchorX, anchorY, totalW, totalH, preferOrder, placedRects) {
    /* Ces jeux étaient en pixels fixes alors que la police, elle, suit
       _txtScale() depuis le passage aux tailles responsives : sur grand écran
       les étiquettes grossissaient de 60 % en restant séparées des mêmes 14 px,
       d'où l'impression de labels serrés les uns contre les autres. Ils suivent
       maintenant le texte, comme le reste de l'encre de la scène. */
    var f    = _txtScale();
    var GAP  = 14 * f;
    var M    = 5 * f;
    var maxY = (_labelMaxY !== null) ? _labelMaxY : _labelGroundLimit(M);
    var maxX = _animW - M;

    /* Marge de sécurité entre deux boîtes : sans elle, deux étiquettes qui se
       touchent au pixel près passent pour compatibles — lisiblement collées. */
    var PAD  = 4 * f;

    /* Poids, tous ramenés à des pixels pour rester comparables à
       l'éloignement. COST_OVERLAP : une étiquette entièrement recouverte
       coûte comme un exil de 2000 px, très au-delà de la diagonale du canvas
       — recouvrir une voisine est donc rédhibitoire sauf si rien d'autre
       n'existe, conformément à la règle « on s'éloigne plutôt que de couvrir ».
       COST_RANK reste petit : la préférence départage deux candidats aussi
       propres l'un que l'autre, elle ne rachète jamais un recouvrement. */
    var COST_OVERLAP = 2000;
    var COST_OUT     = 40;     // par pixel débordé, cumulé sur les quatre bords
    var COST_RANK    = 8 * f;
    var COST_LEADER  = 30 * f;
    var COST_INK     = 22 * f; // par point d'encre traversé, pondéré

    var slots = {
        'right':       { lx: anchorX + GAP,           ly: anchorY - totalH / 2 },
        'left':        { lx: anchorX - totalW - GAP,  ly: anchorY - totalH / 2 },
        'above':       { lx: anchorX - totalW / 2,    ly: anchorY - totalH - GAP },
        'below':       { lx: anchorX - totalW / 2,    ly: anchorY + GAP },
        'upper-right': { lx: anchorX + GAP,           ly: anchorY - totalH - GAP },
        'upper-left':  { lx: anchorX - totalW - GAP,  ly: anchorY - totalH - GAP },
        'lower-right': { lx: anchorX + GAP,           ly: anchorY + GAP },
        'lower-left':  { lx: anchorX - totalW - GAP,  ly: anchorY + GAP }
    };

    /* ── Symétrie du rang dans les vues projetées ──
       Les listes de préférence sont câblées d'un côté : 'right' avant 'left',
       'above' avant 'below'. En vue normale c'est un choix raisonnable. En vue
       projetée, il devient un biais coûteux : la scène s'écrase sur une bande,
       tout l'espace disponible est de part et d'autre de cette bande, et les
       étiquettes s'entassent d'un seul côté pendant que l'autre reste vide.

       Plutôt que de réécrire chaque liste, on rend le rang symétrique le long
       de l'axe où l'espace s'est libéré : les deux créneaux d'une paire
       reçoivent le meilleur des deux rangs. La préférence haut/bas ou
       près/loin est conservée ; seul le choix du côté est rendu au coût, qui
       tranchera sur l'encombrement réel — c'est-à-dire sur le côté le plus
       libre.

       proj-x aplatit la scène sur une bande horizontale : l'espace est
       au-dessus et en dessous, on symétrise donc verticalement. proj-y la
       réduit à une colonne : on symétrise horizontalement. Le fondu suit
       l'angle de vue, pour que rien ne saute pendant la bascule. */
    var MIRROR_V = { 'above': 'below', 'below': 'above',
                     'upper-right': 'lower-right', 'lower-right': 'upper-right',
                     'upper-left':  'lower-left',  'lower-left':  'upper-left' };
    var MIRROR_H = { 'right': 'left', 'left': 'right',
                     'upper-right': 'upper-left', 'upper-left': 'upper-right',
                     'lower-right': 'lower-left', 'lower-left': 'lower-right' };

    var flatV = Math.min(1, Math.max(0, _viewAngles.tx / (Math.PI / 2)));
    var flatH = Math.min(1, Math.max(0, _viewAngles.ty / (Math.PI / 2)));
    var mirror = (flatV >= flatH) ? MIRROR_V : MIRROR_H;
    var tSym   = Math.max(flatV, flatH);

    var slotIdx = {};
    for (var si = 0; si < preferOrder.length; si++) slotIdx[preferOrder[si]] = si;

    function effRank(i) {
        if (!tSym) return i;
        var m = mirror[preferOrder[i]];
        var j = (m !== undefined && slotIdx[m] !== undefined) ? slotIdx[m] : i;
        return i * (1 - tSym) + Math.min(i, j) * tSym;
    }

    /* Symétriser le rang ne suffisait pas : à égalité parfaite de rang ET de
       distance — le cas exact de deux créneaux miroirs —, le tri conserve le
       premier créneau listé, et tout repartait à droite. Rien ne se produisait
       tant que les étiquettes ne se recouvraient pas franchement, c'est-à-dire
       précisément dans le cas qui pose problème : un côté dense, l'autre vide,
       sans un seul chevauchement à signaler.

       Ce terme compte les étiquettes déjà posées du côté visé de l'axe de la
       scène. Il est faible — il départage des candidats équivalents, il ne
       renverse jamais une vraie différence de proximité ou un recouvrement. */
    var COST_SIDE = 12 * f;
    var sideAxis  = (mirror === MIRROR_H) ? _viewAngles.ox : toCanvas(0, 0).cy;

    /* Zone morte autour de l'axe : les créneaux centrés sur l'ancre — 'right'
       et 'left' quand on symétrise verticalement — ont leur milieu exactement
       sur l'axe. Sans elle, un signe arbitraire les verse tous du même côté et
       fausse le décompte pour tous les suivants. À cheval, une étiquette n'est
       d'aucun côté : elle ne compte pour personne et ne paie rien. */
    var sideBand = ((mirror === MIRROR_H) ? totalW : totalH) * 0.25;

    function sideOf(c) {
        if (Math.abs(c - sideAxis) <= sideBand) return 0;
        return (c < sideAxis) ? -1 : 1;
    }

    function sideCost(lx, ly) {
        if (!tSym) return 0;
        var side = sideOf((mirror === MIRROR_H) ? lx + totalW / 2 : ly + totalH / 2);
        if (!side) return 0;
        var n = 0;
        for (var k = 0; k < placedRects.length; k++) {
            var r = placedRects[k];
            if (sideOf((mirror === MIRROR_H) ? r.lx + r.w / 2 : r.ly + r.h / 2) === side) n++;
        }
        return n * COST_SIDE * tSym;
    }

    var area = Math.max(1, totalW * totalH);

    /* Coût du recouvrement des étiquettes déjà posées, marge de sécurité
       comprise : une mesure continue, là où un booléen ne distinguait pas un
       frôlement d'un empilement complet.

       La fraction cachée se rapporte, voisine par voisine, à la PLUS PETITE
       des deux boîtes — exactement la règle appliquée au décor par
       sceneryCost(). Elle manquait ici, et cet oubli suffisait à faire passer
       le pire cas pour anodin : la version précédente rapportait l'aire
       recouverte à celle du CANDIDAT. Un panneau de 300 × 160 posé à cheval
       sur une étiquette de force de 60 × 40 masquait celle-ci entièrement en
       ne payant que 2400/48000, soit 5 % — une centaine de pixels, le prix
       d'un petit déplacement. S'écarter coûtait donc plus cher qu'effacer la
       voisine, et le tri choisissait d'effacer. Rapportée à la petite boîte,
       la même situation vaut 1, c'est-à-dire rédhibitoire, ce qu'elle est.

       Les fractions s'additionnent : recouvrir deux voisines est deux fois
       pire qu'une, et rien ne doit rendre la seconde gratuite une fois la
       première condamnée. Chacune est plafonnée à 1 — la marge PAD gonfle la
       boîte du candidat et peut faire dépasser l'aire réelle de la voisine,
       sans que cela veuille dire « plus que totalement recouverte ». */
    function overlapCost(lx, ly) {
        var sum = 0;
        for (var j = 0; j < placedRects.length; j++) {
            var r  = placedRects[j];
            var ox = Math.min(lx + totalW + PAD, r.lx + r.w) - Math.max(lx - PAD, r.lx);
            var oy = Math.min(ly + totalH + PAD, r.ly + r.h) - Math.max(ly - PAD, r.ly);
            if (ox > 0 && oy > 0) {
                var ref = Math.max(1, Math.min(area, r.w * r.h));
                sum += Math.min(1, ox * oy / ref);
            }
        }
        return sum * COST_OVERLAP;
    }

    /* Coût du décor : rectangles pondérés puis points d'encre.

       La fraction cachée se rapporte à la PLUS PETITE des deux boîtes. Sinon
       un grand bloc posé sur une petite graduation ne paierait presque rien —
       la graduation serait entièrement effacée pour un coût dérisoire, alors
       que c'est précisément le cas à éviter. */
    function sceneryCost(lx, ly) {
        var sum = 0, j;
        for (j = 0; j < _labelScenery.length; j++) {
            var r  = _labelScenery[j];
            var ox = Math.min(lx + totalW + PAD, r.lx + r.w) - Math.max(lx - PAD, r.lx);
            var oy = Math.min(ly + totalH + PAD, r.ly + r.h) - Math.max(ly - PAD, r.ly);
            if (ox > 0 && oy > 0) {
                var ref = Math.max(1, Math.min(area, r.w * r.h));
                sum += Math.min(1, ox * oy / ref) * COST_OVERLAP * r.weight;
            }
        }
        if (_labelInk.length) {
            var g  = _inkGridEnsure();
            var c0 = Math.max(0, Math.floor(lx / _INK_CELL));
            var c1 = Math.min(g.cols - 1, Math.floor((lx + totalW) / _INK_CELL));
            var r0 = Math.max(0, Math.floor(ly / _INK_CELL));
            var r1 = Math.min(g.rows - 1, Math.floor((ly + totalH) / _INK_CELL));
            for (var gy = r0; gy <= r1; gy++) {
                for (var gx = c0; gx <= c1; gx++) {
                    var bucket = g.cell[gx + gy * g.cols];
                    if (!bucket) continue;
                    for (var bi = 0; bi < bucket.length; bi++) {
                        var p = bucket[bi];
                        if (p.x >= lx && p.x <= lx + totalW &&
                            p.y >= ly && p.y <= ly + totalH) sum += COST_INK * p.weight;
                    }
                }
            }
        }
        return sum;
    }

    /* Débordement du cadre, en pixels cumulés sur les quatre bords. Continu
       lui aussi : dépasser de 2 px doit coûter moins que dépasser de 60. */
    function outAmount(lx, ly) {
        return Math.max(0, M - lx)
             + Math.max(0, M - ly)
             + Math.max(0, lx + totalW - maxX)
             + Math.max(0, ly + totalH - maxY);
    }

    /* Distance de l'ancre au point le plus proche de la boîte : le vide que
       l'oeil doit franchir pour relier l'étiquette à son vecteur. Nulle dès
       que l'ancre tombe dans la boîte. */
    function gapToAnchor(lx, ly) {
        var dx = Math.max(lx - anchorX, 0, anchorX - (lx + totalW));
        var dy = Math.max(ly - anchorY, 0, anchorY - (ly + totalH));
        return Math.sqrt(dx * dx + dy * dy);
    }

    function cost(lx, ly, rank, leader) {
        return gapToAnchor(lx, ly)
             + sideCost(lx, ly)
             + overlapCost(lx, ly)
             + outAmount(lx, ly) * COST_OUT
             + rank * COST_RANK
             + (leader ? COST_LEADER : 0);
    }

    /* Deux passes. La première note tous les candidats avec le coût bon marché
       — distance, étiquettes voisines, cadre, préférence — et n'en garde que
       les meilleurs ; la seconde n'ajoute le coût du décor qu'à ceux-là.

       Sans cela, chaque candidat parcourrait le nuage d'encre entier, une
       quarantaine de fois par étiquette et pour chaque étiquette de l'image.
       Le décor ne fait jamais que renchérir un candidat : restreindre la
       seconde passe à une présélection large ne peut donc écarter un bon
       placement que si tous les finalistes se révèlent chargés en décor, ce
       que la largeur de la présélection rend improbable. */
    var KEEP  = 6;
    var pool  = [];

    function consider(lx, ly, rank, leader) {
        pool.push({ lx: lx, ly: ly, leader: leader, c: cost(lx, ly, rank, leader) });
    }

    /* 1. Les huit créneaux au contact, dans l'ordre de préférence. */
    for (var i = 0; i < preferOrder.length; i++) {
        var s = slots[preferOrder[i]];
        if (s) consider(s.lx, s.ly, effRank(i), false);
    }

    /* 2. Couronnes de rayon croissant. La boîte est poussée vers l'extérieur
       plutôt que centrée sur le point de la couronne : centrée, un bloc large
       reviendrait à cheval sur l'ancre qu'il est justement censé fuir. */
    var RING_R   = [2.4, 3.8, 5.4, 7.2];
    var RING_DIR = [[ 1, -1], [-1, -1], [ 1,  1], [-1,  1],
                    [ 0, -1], [ 0,  1], [ 1,  0], [-1,  0]];

    for (var ri = 0; ri < RING_R.length; ri++) {
        var rad = RING_R[ri] * GAP;
        for (var di = 0; di < RING_DIR.length; di++) {
            var ux = RING_DIR[di][0], uy = RING_DIR[di][1];
            /* Diagonales ramenées au même éloignement que les axes */
            var k  = (ux && uy) ? Math.SQRT1_2 : 1;
            var rx = rad * ux * k, ry = rad * uy * k;
            var lx = anchorX + (ux > 0 ? rx : ux < 0 ? rx - totalW : -totalW / 2);
            var ly = anchorY + (uy > 0 ? ry : uy < 0 ? ry - totalH : -totalH / 2);
            consider(lx, ly, preferOrder.length, true);
        }
    }

    pool.sort(function (a, b) { return a.c - b.c; });

    var best = pool[0];
    if (_labelScenery.length || _labelInk.length) {
        var n = Math.min(KEEP, pool.length);
        for (var pi = 0; pi < n; pi++) {
            var cand = pool[pi];
            cand.c += sceneryCost(cand.lx, cand.ly);
            if (cand.c < best.c || pi === 0) best = cand;
        }
    }

    return { lx: best.lx, ly: best.ly, leader: best.leader };
}

/* Trait de rappel : relie l'étiquette exilée au point qu'elle décrit, sans
   quoi elle flotte et l'on ne sait plus de quelle flèche elle parle.

   Il vise le point de la boîte le plus proche de l'ancre : il reste donc
   court et ne passe jamais sous le texte. Discret à dessein — c'est un
   rappel, pas un trait de construction. */
function _drawLeader(ctx, anchorX, anchorY, pos, w, h, color, opacity) {
    if (!pos.leader) return;
    var tx = Math.max(pos.lx, Math.min(anchorX, pos.lx + w));
    var ty = Math.max(pos.ly, Math.min(anchorY, pos.ly + h));
    ctx.save();
    /* Le trait suit l'estompage de son étiquette : un rappel bien visible
       vers un texte fantôme désignerait l'accessoire au lieu du principal. */
    ctx.globalAlpha = (opacity === undefined ? 1 : opacity) * 0.45;
    ctx.strokeStyle = color;
    ctx.lineWidth   = _axisLW(1.1);
    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.restore();
}

/* ── Le protocole de pose, en un seul endroit ──
   Poser une étiquette, c'est toujours la même suite de cinq gestes : choisir
   la position, tirer le trait de rappel si elle s'est exilée, inscrire la
   boîte au registre pour que les suivantes l'évitent, puis dessiner. Cette
   suite était réécrite à l'identique en huit endroits — bloc projeté,
   panneau, nom scalaire, nom de force, étiquette vectorielle, forces et ΣF
   en pesanteur, les mêmes en électrique.

   Huit copies d'un protocole, c'est huit occasions de le faire diverger, et
   c'est déjà arrivé : les versions électriques ont leur liste de créneaux
   codée en dur, plus courte que les autres. C'est surtout huit endroits où
   l'on peut oublier l'inscription au registre — un oubli parfaitement
   silencieux, qui ne se voit qu'à la première étiquette recouverte.

   Le rendu est passé en fonction plutôt qu'en paramètres : chaque famille
   d'étiquettes a sa propre signature de tracé (des lignes, un panneau, un
   nom seul), et les réunir demanderait un descripteur commun qui n'existe
   pas. La fermeture, elle, capture ce dont chacune a besoin.

     req = { anchorX, anchorY, w, h, prefer, color, opacity, level, render }

   opacity ne concerne que l'encre — le trait de rappel la suit. level dit à
   quel registre l'étiquette appartient, dur ou fané ; il vaut opacity par
   défaut. Les deux ne coïncident pas toujours : en mode électrique et vue
   perpendiculaire, les étiquettes sont tracées en pleine opacité tout en
   restant inscrites au registre fané de leur instantané.

   ── Pourquoi la demande est mise en file plutôt qu'honorée ──
   Le décor que le placement évite — _labelScenery, _labelInk — ne contient
   que ce qui a DÉJÀ été tracé. Tant que chaque étiquette était posée au fil
   du dessin, chacune ne voyait donc que le passé de l'image : les étiquettes
   du mobile ignoraient purement et simplement les flèches des points
   épinglés, dessinés après elles. Un placement soigneusement calculé contre
   la moitié d'une scène.

   Le pré-enregistrement des trajectoires en tête de drawAnim est la trace de
   ce défaut : un cas particulier réglé à la main, faute de pouvoir régler le
   cas général. Les autres n'ont jamais été réglés.

   Les fonctions de dessin n'obtiennent donc plus de position : elles
   déposent une demande et continuent de tracer flèches et encre. Quand le
   décor est complet, _flushLabels résout toute la file d'un coup. Chaque
   étiquette arbitre alors contre l'image entière.

   Effet de bord voulu : les étiquettes passent toutes au-dessus du décor,
   au lieu de s'intercaler dans l'ordre de tracé et d'être recouvertes par
   ce qui se dessinait après elles. */
var _labelQueue = [];

/* ── Qui se sert en premier ──
   Le premier placé prend la meilleure position et ne la rend jamais : les
   suivants héritent de ce qu'il laisse, jusqu'à l'exil en couronne au bout
   d'un trait de rappel. Cet ordre était celui du tracé, ce qui revenait à
   décider de l'importance des étiquettes par la profondeur du décor.

   Il était même exactement inversé. Le ballon est dessiné avant les points
   épinglés : les noms de ses forces se servaient donc avant eux. Or une
   épingle est le seul élément de la scène que l'utilisateur a posé lui-même,
   d'un geste délibéré, parce que c'est ce point-là qu'il veut lire.

   L'ordre part donc de ce qui est demandé vers ce qui est ambiant : les
   épingles, le point survolé, le mobile courant, ses instantanés
   chronophotographiques, enfin les courses sauvegardées. Ce qui reste de
   place échoit à ce qui est le plus reproductible — une chronophotographie
   se relit point par point, une épingle est unique.

   ── Pourquoi les épingles passent devant le survol ──
   Le survol désigne ce que l'utilisateur regarde à l'instant même, ce qui
   plaidait pour le servir en premier. C'est exactement ce qu'il ne faut pas
   faire : son ancre suit le pointeur, donc elle se déplace à chaque image.
   Servi en premier, il se réserve à chaque image une position différente, et
   toutes les étiquettes épinglées se replacent derrière lui — elles dansent
   le long de la trajectoire alors que rien, chez elles, n'a bougé.

   Les épingles, elles, sont immobiles tant qu'on n'y touche pas. Servies en
   premier, elles se posent une fois et ne bougent plus ; il ne reste qu'une
   seule étiquette mobile dans la scène, celle qui suit effectivement le
   pointeur. Le mouvement est ainsi ramené à ce qui bouge vraiment.

   C'est aussi la première pierre de la stabilité dans le temps : servir
   d'abord ce qui ne bouge pas, c'est déjà ne plus laisser le transitoire
   commander au permanent.

   La granularité s'arrête à la phase de tracé. Faire passer ΣF devant les
   forces qui la composent serait défendable ; c'est un arbitrage de fond sur
   ce qu'on veut lire d'abord, pas une conséquence de ce qui précède. */
var PRIO_PIN    = 0;
var PRIO_HOVER  = 1;
var PRIO_MOBILE = 2;
var PRIO_CHRONO = 3;
var PRIO_SAVED  = 4;

var _labelPrio = PRIO_MOBILE;

function _queueLabel(req) {
    req.prio = _labelPrio;
    /* Rang de dépôt, pour départager à priorité égale. Un tri qui s'en
       remettrait à la stabilité de sort() laisserait l'ordre des forces d'un
       même point à la discrétion du moteur. */
    req.seq  = _labelQueue.length;
    _labelQueue.push(req);
}

/* Résout et dessine toute la file. Appelée en fin d'image, une fois le décor
   complet — et, en mode électrique, IMPÉRATIVEMENT avant que drawAnimE ne
   restaure les globales qu'il a permutées : _bestLabelPos lit _labelMaxY et
   _viewAngles, qui valent alors ceux de la scène électrique. */
function _flushLabels(ctx) {
    var order = _labelQueue.slice();
    order.sort(function (a, b) { return (a.prio - b.prio) || (a.seq - b.seq); });

    var i, req;

    /* 1. Résolution, du plus important au moins important : chacun arbitre
       contre les boîtes déjà attribuées, donc contre plus important que lui. */
    for (i = 0; i < order.length; i++) {
        req = order[i];
        req.lvl = (req.level === undefined) ? req.opacity : req.level;
        req.pos = _bestLabelPos(req.anchorX, req.anchorY, req.w, req.h,
                                req.prefer, _labelObstacles(req.lvl));
        _labelRects(req.lvl).push({ lx: req.pos.lx, ly: req.pos.ly, w: req.w, h: req.h });
    }

    /* 2. Tracé dans l'ordre inverse, pour que le plus important passe
       par-dessus. Se servir en premier ne suffirait pas : sur une scène
       saturée, aucune position n'est propre, et la moins mauvaise recouvre
       quand même quelque chose. Autant que ce soit l'accessoire qui cède.

       Le trait de rappel accompagne son étiquette plutôt que la résolution :
       il doit se superposer comme elle. */
    for (i = order.length - 1; i >= 0; i--) {
        req = order[i];
        _drawLeader(ctx, req.anchorX, req.anchorY, req.pos, req.w, req.h, req.color, req.opacity);
        req.render(req.pos.lx, req.pos.ly);
    }

    _labelQueue.length = 0;
}

/* Dépose la demande d'un nom de vecteur au bout d'une flèche — les quatre
   sites de forces, pesanteur et électrique.

   Cette fonction n'existe pas seulement pour éviter une redite : elle donne
   à chaque étiquette une PORTÉE PROPRE. Les demandes étant honorées après la
   boucle qui les dépose, une fermeture qui capturerait la variable de boucle
   les verrait toutes pointer sur la dernière force — les trois noms se
   poseraient au même endroit, avec le même texte. Un appel de fonction par
   étiquette est ce qui rend la capture correcte. */
function _queueForceName(ctx, anchorX, anchorY, name, color, opacity, level, prefer) {
    var lm = _measureForceName(ctx, name);
    _queueLabel({
        anchorX: anchorX, anchorY: anchorY,
        w: lm.w, h: lm.h,
        prefer: prefer, color: color, opacity: opacity, level: level,
        render: function (lx, ly) { _renderForceName(ctx, lx, ly, name, color, opacity, lm); }
    });
}

/* Dessine le label à la position (lx, ly) déjà calculée. */
function _renderVecLabel(ctx, lx, ly, m, vecName, line1, line2, color) {
    var nameCenterY = ly + m.totalH / 2;
    var nameTopY    = nameCenterY - m.nameColH / 2;

    ctx.save();
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    /* Halo : même bien placé, un bloc passe sur la grille, sur un rayon de
       champ ou sur la trajectoire — c'est ce qui rend tolérable, dans le
       calcul de coût, de croiser un trait fin plutôt que de s'exiler. */
    var halo = _axisLW(3.2) * _labelHaloFrac;

    /* Flèche au-dessus du nom, puis nom : les deux centrés dans la largeur du
       composé, comme les deux étages d'un <mover>. */
    /* Le composé est centré dans la colonne des noms, et non calé à gauche :
       en panneau, cette colonne est élargie à la plus longue des lignes, et
       un OM calé à gauche pendrait hors de l'axe des v et des a. */
    var nameX = lx + (m.nameColW - m.accW) / 2;
    _drawMathArrow(ctx, nameX, nameTopY, m.accW, m.nameSize, color, halo);
    _drawMathName(ctx, vecName, nameX + (m.accW - m.nameW) / 2, nameTopY + m.arrowExtra,
                  m.nameSize, color, halo);

    /* Parenthèses */
    var bx  = lx + m.nameColW;
    var bly = ly + (m.totalH - m.parenH) / 2;

    /* Trait des parenthèses : la seule épaisseur restée fixe dans le bloc,
       alors que sa police, elle, suit la taille du canvas.
       Tracé deux fois — blanc épais, puis couleur — pour leur donner le même
       halo qu'au texte : sans lui, elles seules resteraient à nu. */
    var parenLW = 2.5 * _txtScale();

    function strokeParen(px, dir) {
        ctx.beginPath();
        ctx.moveTo(px, bly);
        ctx.bezierCurveTo(px + dir * m.parenW * 1.3, bly + m.parenH * 0.18,
                          px + dir * m.parenW * 1.3, bly + m.parenH * 0.82,
                          px, bly + m.parenH);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = parenLW + halo;
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth   = parenLW;
        ctx.stroke();
    }

    strokeParen(bx + m.parenW, -1);
    strokeParen(bx + m.parenW + m.iPad + m.textW + m.iPad, 1);

    /* Texte */
    ctx.fillStyle    = color;
    ctx.textBaseline = 'middle';
    /* Chaque ligne est centrée dans la largeur de la colonne, et non calée à
       gauche : cette largeur est celle de la plus longue — de la plus longue
       du panneau entier quand les blocs sont groupés — et une ligne courte
       calée à gauche laisserait un vide sous la parenthèse droite. */
    var textX = bx + m.parenW + m.iPad;
    var w1 = _measureSubText(ctx, line1, m.fontSize);
    var w2 = _measureSubText(ctx, line2, m.fontSize);
    _drawSubText(ctx, line1, textX + (m.textW - w1) / 2, bly + m.lineH * 0.5, m.fontSize, null, halo);
    _drawSubText(ctx, line2, textX + (m.textW - w2) / 2, bly + m.lineH * 1.5, m.fontSize, null, halo);

    ctx.restore();
}


/* ── Panneau : plusieurs vecteurs d'un même point dans une seule étiquette ──
   En vue normale, OM, v et a affichés ensemble donnaient trois blocs
   séparés qui se disputaient le voisinage du mobile — trois boîtes à placer
   pour une seule information, celle de ce point-là. Rangés en panneau, ils
   n'en forment plus qu'une, reliée au point par un trait de rappel dès
   qu'elle doit s'éloigner.

   Ce qui distingue un panneau d'un tas, c'est l'alignement : une seule
   largeur de colonne de noms et une seule largeur de coordonnées, prises au
   maximum des lignes, pour que les parenthèses se superposent au cordeau.
   Chaque ligne garde en revanche sa couleur — c'est elle qui rattache la
   ligne à sa flèche.

   La police décroît avec le nombre de lignes : trois blocs à pleine taille
   dépasseraient la demi-hauteur du canvas sur grand écran. La réduction
   reste modeste et très au-dessus du seuil de lisibilité au vidéoprojecteur,
   qui a présidé au calibrage de ces tailles.

   items = [{ vecName, line1, line2, color }] */
function _measureVecPanel(ctx, items) {
    var scale = items.length >= 3 ? 0.85 : items.length === 2 ? 0.93 : 1;
    var rows  = [];
    var nameColW = 0, textW = 0, parenW = 0, iPad = 0;

    var i, m;
    for (i = 0; i < items.length; i++) {
        m = _measureVecLabel(ctx, items[i].vecName, items[i].line1, items[i].line2, scale);
        rows.push(m);
        nameColW = Math.max(nameColW, m.nameColW);
        textW    = Math.max(textW,    m.textW);
        parenW   = Math.max(parenW,   m.parenW);
        iPad     = Math.max(iPad,     m.iPad);
    }

    /* Colonnes unifiées, puis largeurs dérivées recalculées sur ces colonnes.
       accW et nameW restent propres à chaque ligne : ce sont les dimensions
       du composé <mover> lui-même, que _renderVecLabel centre dans la
       colonne commune. */
    var blockW = parenW * 2 + iPad * 2 + textW;
    var gap    = rows.length ? rows[0].fontSize * 0.25 : 0;
    var totalH = 0;
    for (i = 0; i < rows.length; i++) {
        m = rows[i];
        m.nameColW = nameColW;
        m.textW    = textW;
        m.parenW   = parenW;
        m.iPad     = iPad;
        m.blockW   = blockW;
        m.totalW   = nameColW + blockW;
        totalH += m.totalH;
        if (i) totalH += gap;
    }

    return { rows: rows, gap: gap, totalW: nameColW + blockW, totalH: totalH };
}

function _renderVecPanel(ctx, lx, ly, pm, items) {
    var y = ly;
    for (var i = 0; i < items.length; i++) {
        var m = pm.rows[i];
        _renderVecLabel(ctx, lx, y, m, items[i].vecName, items[i].line1, items[i].line2,
                        items[i].color);
        y += m.totalH + pm.gap;
    }
}
/* Étiquettes des vues projetées (proj-x / proj-y) : le vecteur n'a plus de
   sens hors de son axe de projection, donc plus de flèche ni de nom
   vectoriel — seule la coordonnée projetée reste affichée.

   Les trois grandeurs sont réunies dans un bloc unique, une par ligne. La
   projection écrase les trois ancres — milieu de OM, milieu de v, milieu de
   a — sur la même ligne : séparées, elles se disputaient littéralement le
   même point. Réunies, la compétition disparaît au lieu d'être arbitrée, et
   trois rectangles n'en font plus qu'un.

   Chaque ligne garde la couleur de SON vecteur : c'est ce qui préserve le
   lien avec la flèche correspondante, sans quoi le bloc gagnerait de la
   place en perdant toute lecture.

   Les noms sont alignés à droite et les valeurs à gauche, de part et
   d'autre du signe égal : empilées au fil du texte, des lignes de largeurs
   différentes dessinent un escalier.

     rows = [{ name, value, color }]   ex. { name: 'v_x', value: '3,20 m/s' } */
function _measureProjBlock(ctx, rows) {
    var fontSize = _animFontSize(20, 30, 0.060) * _labelCrowdScale;
    var gap      = fontSize * 0.28;
    var nameW = 0, valW = 0;
    for (var i = 0; i < rows.length; i++) {
        nameW = Math.max(nameW, _measureSubText(ctx, rows[i].name,  fontSize));
        valW  = Math.max(valW,  _measureSubText(ctx, rows[i].value, fontSize));
    }
    var eqW = _measureSubText(ctx, '=', fontSize);
    return {
        fontSize: fontSize, lineH: fontSize * 1.45, gap: gap,
        nameW: nameW, eqW: eqW, valW: valW,
        totalW: nameW + gap + eqW + gap + valW,
        totalH: fontSize * 1.45 * rows.length
    };
}

function _renderProjBlock(ctx, lx, ly, m, rows) {
    ctx.save();
    ctx.textBaseline = 'middle';
    var eqX  = lx + m.nameW + m.gap;
    var valX = eqX + m.eqW + m.gap;
    for (var i = 0; i < rows.length; i++) {
        var r  = rows[i];
        var y  = ly + m.lineH * (i + 0.5);
        var nw = _measureSubText(ctx, r.name, m.fontSize);
        ctx.fillStyle = r.color;
        _drawSubText(ctx, r.name,  lx + m.nameW - nw, y, m.fontSize, null, _axisLW(3) * _labelHaloFrac);
        _drawSubText(ctx, "=",     eqX,               y, m.fontSize, null, _axisLW(3) * _labelHaloFrac);
        _drawSubText(ctx, r.value, valX,              y, m.fontSize, null, _axisLW(3) * _labelHaloFrac);
    }
    ctx.restore();
}

/* Même idée que ci-dessus mais pour le nom seul (sans bloc coordonnées),
   utilisée quand « Afficher les coordonnées » est désactivé : en vue
   projetée, plus de flèche ni de <mover> — juste le nom scalaire (v_x, a_y…),
   à la taille des noms de force pour rester cohérent avec eux. */
function _measureScalarName(ctx, text) {
    var sz = _animFontSize(16, 21, 0.042) * _labelCrowdScale;
    return { sz: sz, w: _measureSubText(ctx, text, sz), h: sz * 1.2 };
}

function _renderScalarName(ctx, lx, ly, text, color, m) {
    ctx.save();
    ctx.fillStyle    = color;
    ctx.textBaseline = 'middle';
    _drawSubText(ctx, text, lx, ly + m.h / 2, m.sz, null, _axisLW(3) * _labelHaloFrac);
    ctx.restore();
}

/* Dépose la demande d'une étiquette cinématique — OM, v ou a — sous la forme
   que la vue et les réglages appellent. Comme _queueForceName, c'est une
   fonction et non un bloc dans la boucle appelante : chaque étiquette a
   besoin de sa propre portée, sinon les fermetures, honorées après la
   boucle, verraient toutes la dernière mesure. */
function _queueKinLabel(ctx, lbl, projLine) {
    if (lbl.showCoords === false && projLine && lbl.compX) {
        /* Vue projetée, sans bloc coordonnées : juste le nom scalaire
           (v_x, a_y…), sans flèche ni <mover> — un vecteur n'a plus de
           sens hors de son axe de projection. */
        var compName = projLine === 1 ? lbl.compX : lbl.compY;
        var cm = _measureScalarName(ctx, compName);
        _queueLabel({
            anchorX: lbl.anchorX, anchorY: lbl.anchorY,
            w: cm.w, h: cm.h,
            prefer: lbl.prefer, color: lbl.color,
            render: function (lx, ly) { _renderScalarName(ctx, lx, ly, compName, lbl.color, cm); }
        });
    } else if (lbl.showCoords === false) {
        /* Juste la flèche + nom, sans bloc coordonnées : la même étiquette
           que celle des forces, au même rendu près. */
        _queueForceName(ctx, lbl.anchorX, lbl.anchorY, lbl.vecName,
                        lbl.color, 1.0, undefined, lbl.prefer);
    } else {
        /* Vue normale : notation vectorielle complète. Le cas « vue projetée
           avec coordonnées » n'arrive jamais ici, il a été traité en bloc
           par l'appelant. */
        var m = _measureVecLabel(ctx, lbl.vecName, lbl.line1, lbl.line2);
        _queueLabel({
            anchorX: lbl.anchorX, anchorY: lbl.anchorY,
            w: m.totalW, h: m.totalH,
            prefer: lbl.prefer, color: lbl.color,
            render: function (lx, ly) {
                _renderVecLabel(ctx, lx, ly, m, lbl.vecName, lbl.line1, lbl.line2, lbl.color);
            }
        });
    }
}

function _drawAnimHover(ctx, snap, isPinned) {
    var p = _toCanvasSplit(snap.x, snap.y, snap.vy || 0);
    /* Un point épinglé qui sort du cadre (zoom) ne doit plus être affiché,
       ni lui ni ses étiquettes. */
    if (isPinned && (p.cx < 0 || p.cx > _animW || p.cy < 0 || p.cy > _animH)) return;

    var showPos    = isPinned ? pinShowVecPos    : sim.showVecPos;
    var showVit    = isPinned ? pinShowVecVit    : sim.showVecVit;
    var showAcc    = isPinned ? pinShowVecAcc    : sim.showVecAcc;
    var showForces = isPinned ? pinShowVecForces : sim.showVecForces;
    var showSumF   = isPinned ? pinShowVecSumF   : sim.showVecSumF;
    var showCoords = isPinned ? pinShowCoords    : sim.hoverShowCoords;

    /* ── Point survolé ── */
    ctx.save();
    ctx.fillStyle   = snap.color;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth   = _axisLW(2);
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur  = _axisLW(5);
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, _hoverRadius(), 0, 2 * Math.PI);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();
    ctx.restore();

    /* ── Prépare les labels à placer ── */
    var toPlace  = [];   /* { anchorX, anchorY, vecName, line1, line2, color, prefer } */
    var origin   = toCanvas(0, 0);

    if (showPos) {
        _drawVectorPos(ctx, snap.x, snap.y, 1.0);
        toPlace.push({
            anchorX: (origin.cx + p.cx) / 2,
            anchorY: (origin.cy + p.cy) / 2,
            vecName: 'OM',
            compX: 'x', compY: 'y',
            valX: fmt(snap.x, 2) + ' m',
            valY: fmt(snap.y, 2) + ' m',
            line1: 'x = ' + fmt(snap.x, 2) + ' m',
            line2: 'y = ' + fmt(snap.y, 2) + ' m',
            color:  sim.armatureMode === 'perp-x' ? COL_VEC_POS_PERP : COL_VEC_POS,
            prefer: ['lower-right', 'right', 'upper-right', 'lower-left', 'left', 'upper-left', 'above', 'below'],
            showCoords: showCoords
        });
    }
    if (showVit) {
        var _vscV = _vecScaleVitOverride !== null ? _vecScaleVitOverride : VEC_SCALE_VIT;
        var dvx, dvy;
        if (_vecScaleVitOverride !== null) {
            /* Mode électrique : direction alignée sur le canvas pour la tangence */
            var _cvxV = snap.vx * sim.scaleX, _cvyV = -snap.vy * sim.scaleY;
            var _cmV = Math.hypot(_cvxV, _cvyV) || 1;
            var _lenV = Math.hypot(snap.vx, snap.vy) * _vscV;
            dvx = _cvxV * _lenV / _cmV; dvy = _cvyV * _lenV / _cmV;
        } else {
            var _dV = _vecCanvasDelta(snap.vx, snap.vy, _vscV);
            dvx = _dV.dx; dvy = _dV.dy;
        }
        var _vitPerp = _vecScaleVitOverride !== null && sim.armatureMode === 'perp-x';
        var _colVit  = _vitPerp ? COL_VEC_VIT_PERP : COL_VEC_VIT;
        _drawVecDispVA(ctx, p.cx, p.cy, dvx, dvy, _colVit, '', 1.0, _vitPerp ? VEC_VIT_LW_PERP : undefined);
        var vPrefer = dvy <= 0
            ? ['above', 'upper-right', 'upper-left', 'right', 'left', 'lower-right', 'lower-left', 'below']
            : ['upper-right', 'upper-left', 'above', 'right', 'left', 'lower-right', 'lower-left', 'below'];
        toPlace.push({
            anchorX: p.cx + dvx / 2,
            anchorY: p.cy + dvy / 2,
            vecName: 'v',
            compX: 'v_x', compY: 'v_y',
            valX: (_vecScaleVitOverride !== null ? fmtSci(snap.vx, 3) : fmt(snap.vx, 2)) + ' m/s',
            valY: (_vecScaleVitOverride !== null ? fmtSci(snap.vy, 3) : fmt(snap.vy, 2)) + ' m/s',
            line1: 'v_x = ' + (_vecScaleVitOverride !== null ? fmtSci(snap.vx, 3) : fmt(snap.vx, 2)) + ' m/s',
            line2: 'v_y = ' + (_vecScaleVitOverride !== null ? fmtSci(snap.vy, 3) : fmt(snap.vy, 2)) + ' m/s',
            color:  _colVit,
            prefer: vPrefer,
            showCoords: showCoords
        });
    }
    if (showAcc) {
        var _vscA = _vecScaleAccOverride !== null ? _vecScaleAccOverride : VEC_SCALE_ACC;
        var dax, day;
        if (_vecScaleAccOverride !== null) {
            var _cvxA = snap.ax * sim.scaleX, _cvyA = -snap.ay * sim.scaleY;
            var _cmA = Math.hypot(_cvxA, _cvyA) || 1;
            var _lenA = Math.hypot(snap.ax, snap.ay) * _vscA;
            dax = _cvxA * _lenA / _cmA; day = _cvyA * _lenA / _cmA;
        } else {
            var _dA = _vecCanvasDelta(snap.ax, snap.ay, _vscA);
            dax = _dA.dx; day = _dA.dy;
        }
        var _accPerp = _vecScaleAccOverride !== null && sim.armatureMode === 'perp-x';
        var _colAcc  = _accPerp ? COL_VEC_ACC_PERP : COL_VEC_ACC;
        if (snap.ax !== 0 || snap.ay !== 0) {
            _drawVecDispVA(ctx, p.cx, p.cy, dax, day, _colAcc, '', 1.0, _accPerp ? VEC_LW_PERP : undefined);
            toPlace.push({
                anchorX: p.cx + dax / 2,
                anchorY: p.cy + day / 2,
                vecName: 'a',
                compX: 'a_x', compY: 'a_y',
                valX: (_vecScaleAccOverride !== null ? fmtSci(snap.ax, 3) : fmt(snap.ax, 2)) + ' m/s²',
                valY: (_vecScaleAccOverride !== null ? fmtSci(snap.ay, 3) : fmt(snap.ay, 2)) + ' m/s²',
                line1: 'a_x = ' + (_vecScaleAccOverride !== null ? fmtSci(snap.ax, 3) : fmt(snap.ax, 2)) + ' m/s²',
                line2: 'a_y = ' + (_vecScaleAccOverride !== null ? fmtSci(snap.ay, 3) : fmt(snap.ay, 2)) + ' m/s²',
                color:  _colAcc,
                prefer: ['right', 'upper-right', 'left', 'upper-left', 'above', 'lower-right', 'lower-left', 'below'],
                showCoords: showCoords
            });
        }
    }

    /* En vue projetée sur un axe (pesanteur uniquement), seule la coordonnée
       projetée a un sens : proj-x → composante x (line1), proj-y → composante
       y (line2). */
    var projLine = (sim.viewMode === 'proj-x') ? 1 : (sim.viewMode === 'proj-y') ? 2 : 0;

    /* ── Dépose chaque label cinématique ; la position viendra plus tard ──
       Registre de l'image : les points épinglés et le survol se partagent le
       même, ils ne se recouvrent donc plus entre eux. Il n'est plus nommé
       ici — toutes ces étiquettes sont tracées en pleine opacité, et
       _flushLabels en déduit le registre dur, celui-là même. */

    /* ── Vue projetée, coordonnées demandées : un seul bloc pour les trois ──
       Ancré sur le mobile lui-même, seul point que les trois grandeurs
       partagent honnêtement : origine de v et de a, extrémité de OM.
       Le côté préféré suit l'axe d'écrasement — proj-x aplatit la scène sur
       une bande horizontale, l'espace libre est donc au-dessus et en dessous ;
       proj-y la réduit à une colonne, l'espace est à droite et à gauche. */
    if (projLine && showCoords !== false && toPlace.length > 0) {
        var rows = [];
        for (var ri = 0; ri < toPlace.length; ri++) {
            var rl = toPlace[ri];
            rows.push({
                name:  projLine === 1 ? rl.compX : rl.compY,
                value: projLine === 1 ? rl.valX  : rl.valY,
                color: rl.color
            });
        }
        var bm  = _measureProjBlock(ctx, rows);
        var bpr = projLine === 1
            ? ['above', 'upper-right', 'upper-left', 'below', 'lower-right', 'lower-left', 'right', 'left']
            : ['right', 'upper-right', 'lower-right', 'left', 'upper-left', 'lower-left', 'above', 'below'];
        _queueLabel({
            anchorX: p.cx, anchorY: p.cy,
            w: bm.totalW, h: bm.totalH,
            prefer: bpr, color: rows[0].color,
            render: function (lx, ly) { _renderProjBlock(ctx, lx, ly, bm, rows); }
        });
        toPlace.length = 0;
    }

    /* ── Vue normale, coordonnées demandées : un panneau pour les trois ──
       Même raison qu'en vue projetée, sous une autre forme. Trois blocs
       séparés se disputaient le voisinage du mobile : trois boîtes à placer
       pour une seule information, celle de ce point-là. Rangés en panneau,
       colonnes alignées, ils n'en forment plus qu'une.

       Seule différence avec la vue projetée : la notation vectorielle est
       conservée telle quelle — flèche, nom, grandes parenthèses. C'est elle
       qui a un sens ici, puisque le vecteur en a un. */
    if (!projLine && showCoords !== false && toPlace.length > 1) {
        var items = [];
        for (var pi2 = 0; pi2 < toPlace.length; pi2++) {
            items.push({
                vecName: toPlace[pi2].vecName,
                line1:   toPlace[pi2].line1,
                line2:   toPlace[pi2].line2,
                color:   toPlace[pi2].color
            });
        }
        var pm   = _measureVecPanel(ctx, items);
        var ppr  = ['right', 'upper-right', 'lower-right', 'left', 'upper-left', 'lower-left', 'above', 'below'];
        _queueLabel({
            anchorX: p.cx, anchorY: p.cy,
            w: pm.totalW, h: pm.totalH,
            prefer: ppr, color: items[0].color,
            render: function (lx, ly) { _renderVecPanel(ctx, lx, ly, pm, items); }
        });
        toPlace.length = 0;
    }

    for (var i = 0; i < toPlace.length; i++) {
        _queueKinLabel(ctx, toPlace[i], projLine);
    }

    /* ── Forces (utilisent le contexte physique du point épinglé) ── */
    if (showForces || showSumF) {
        if (_vecScaleVitOverride !== null) {
            /* Mode électrique : force électrique FE, pas le poids */
            var phE = snap.phys || _getEPhys(snap.x, snap.y);
            if (showForces) _drawForcesAtE(ctx, p.cx, p.cy, snap.vx, snap.vy, 1.0, phE);
            if (showSumF)   _drawSumFAtE(ctx,   p.cx, p.cy, snap.vx, snap.vy, 1.0, phE);
        } else {
            var ph = snap.phys || { mass: sim.mass, g: sim.g, windForce: sim.windForce, useFriction: sim.useFriction, k: sim.k };
            if (showForces) _drawForcesAt(ctx, p.cx, p.cy, snap.vx, snap.vy, 1.0, ph);
            if (showSumF)   _drawSumFAt(ctx,   p.cx, p.cy, snap.vx, snap.vy, 1.0, ph);
        }
    }
}

/* ─────────────────────────────────────────────────
   Label nom de vecteur avec flèche au-dessus
   (version allégée sans bloc coordonnées)
───────────────────────────────────────────────── */
function _measureForceName(ctx, name) {
    /* Même logique de lisibilité en projection que _measureVecLabel : ces noms
       sont plus petits (ils accompagnent chaque flèche de force, souvent
       plusieurs à la fois), mais suivent le même agrandissement. */
    var sz    = _animFontSize(16, 21, 0.042) * _labelCrowdScale;
    var tw    = _measureMathName(ctx, name, sz);
    var arrow = _measureMathArrow(ctx, sz);
    var accW  = Math.max(tw, arrow.w);              // largeur du composé <mover>
    var gap   = Math.max(1, sz * 0.07);
    return { sz: sz, tw: tw, accW: accW, arrowH: arrow.h, gap: gap,
             w: accW + 6, h: arrow.h + gap + sz };
}

function _renderForceName(ctx, lx, ly, name, color, opacity, m) {
    ctx.save();
    ctx.globalAlpha  = opacity * 0.92;
    ctx.fillStyle    = color;

    /* Flèche puis nom, centrés dans la largeur du composé (cf. _drawMathArrow).
       Halo comme pour les blocs coordonnées : ces noms se posent souvent au
       bout d'une flèche, donc en travers d'une autre. */
    var halo = _axisLW(2.6) * _labelHaloFrac;
    _drawMathArrow(ctx, lx, ly, m.accW, m.sz, color, halo);
    _drawMathName(ctx, name, lx + (m.accW - m.tw) / 2, ly + m.arrowH + m.gap, m.sz, color, halo);
    ctx.restore();
}

/* ─────────────────────────────────────────────────
   Forces : poids, vent, frottement, ΣF
   phys = {mass, g, windForce, useFriction, k}
   Le registre anti-chevauchement est celui de l'image entière, choisi selon
   l'opacité (cf. _labelRects).
───────────────────────────────────────────────── */
function _drawForcesAt(ctx, cx, cy, vx, vy, opacity, phys) {
    var forces = [];

    var _fvp = _viewProjFactors();
    forces.push({ dx: 0, dy: phys.mass * phys.g * VEC_SCALE_FORCE * _fvp.cy, name: 'P' });

    if (Math.abs(phys.windForce) > 0.01) {
        forces.push({ dx: phys.windForce * VEC_SCALE_FORCE * _fvp.cx, dy: 0, name: 'Fv' });
    }

    if (phys.useFriction && (Math.abs(vx) > 0.01 || Math.abs(vy) > 0.01)) {
        forces.push({
            dx:  -phys.k * vx * VEC_SCALE_FORCE * _fvp.cx,
            dy:   phys.k * vy * VEC_SCALE_FORCE * _fvp.cy,
            name: 'f'
        });
    }

    /* Flèches d'abord */
    for (var i = 0; i < forces.length; i++) {
        _drawVecArrow(ctx, cx, cy, forces[i].dx, forces[i].dy, COL_VEC_FORCES, null, opacity);
        _reserveArrow(cx, cy, forces[i].dx, forces[i].dy);
    }

    /* Labels avec anti-chevauchement */
    var pref = ['right', 'upper-right', 'lower-right', 'left', 'upper-left', 'lower-left', 'above', 'below'];
    for (var i = 0; i < forces.length; i++) {
        var f = forces[i];
        _queueForceName(ctx, cx + f.dx, cy + f.dy, f.name,
                        COL_VEC_FORCES, opacity, undefined, pref);
    }
}

function _drawSumFAt(ctx, cx, cy, vx, vy, opacity, phys) {
    var _sfvp = _viewProjFactors();
    var SFx = phys.windForce - (phys.useFriction ? phys.k * vx : 0);
    var SFy = -phys.mass * phys.g - (phys.useFriction ? phys.k * vy : 0);
    var dxPx = SFx * VEC_SCALE_FORCE * _sfvp.cx;
    var dyPx = -SFy * VEC_SCALE_FORCE * _sfvp.cy;

    _drawVecArrow(ctx, cx, cy, dxPx, dyPx, COL_VEC_SUMF, null, opacity);
    _reserveArrow(cx, cy, dxPx, dyPx);

    var pref = ['right', 'upper-right', 'lower-right', 'left', 'upper-left', 'lower-left', 'above', 'below'];
    _queueForceName(ctx, cx + dxPx, cy + dyPx, 'ΣF',
                    COL_VEC_SUMF, opacity, undefined, pref);
}

/* ─────────────────────────────────────────────────
   Légende des échelles vecteurs (coin bas-droite du ciel)
───────────────────────────────────────────────── */
/* ── Helpers split montée/descente (proj-y) ── */
function _splitActive() {
    return sim.splitPhase && _viewAngles.ty > Math.PI / 2 - 0.15;
}
function _splitOffset() {
    return Math.min(110, (_animW - sim.originX) * 0.35);
}
/* cx selon la phase : vy >= 0 → montée (gauche), vy < 0 → descente (droite) */
function _phaseOx(vy) {
    if (!_splitActive()) return _viewAngles.ox;
    var off = _splitOffset();
    return vy >= 0 ? _viewAngles.ox - off : _viewAngles.ox + off;
}
/* toCanvas adapté phase */
function _toCanvasSplit(px, py, vy) {
    var p = toCanvas(px, py);
    if (_splitActive()) p.cx = _phaseOx(vy);
    return p;
}

/* ── Label de vue projection (haut-gauche du canvas) ── */
function _drawViewLabel(ctx) {
    var tx = _viewAngles.tx, ty = _viewAngles.ty;
    var maxAngle = Math.max(tx, ty);
    if (maxAngle < 0.01) {
        var btn0 = document.getElementById('btn-split-phase');
        if (btn0) btn0.style.display = 'none';
        return;
    }
    var opacity   = maxAngle / (Math.PI / 2);
    var isProj_y  = ty > tx;
    var label     = isProj_y ? 'Vue de face' : 'Vue du dessus';
    var fontSize  = _animFontSize(12, 16, 0.033);

    ctx.save();
    ctx.globalAlpha   = opacity * 0.9;
    ctx.font          = 'bold ' + fontSize + 'px Segoe UI, Arial';
    ctx.textAlign     = 'left';
    ctx.textBaseline  = 'top';
    ctx.shadowColor   = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur    = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, _viewAngles.ox + 4, 6);

    /* Mesure la largeur du label ICI (avant restore) pour positionner le bouton */
    var labelW = ctx.measureText(label).width;
    ctx.restore();

    /* Bouton "Séparer la phase de descente" — uniquement en proj-y */
    var btn = document.getElementById('btn-split-phase');
    if (btn) {
        if (isProj_y && ty > Math.PI / 4) {
            var canvas = document.getElementById('anim-canvas');
            var scaleX = canvas ? (canvas.offsetWidth / _animW) : 1;
            var leftPx = (_viewAngles.ox + 4 + labelW + 10) * scaleX;
            btn.style.display = 'block';
            btn.style.opacity = Math.min(1, (ty - Math.PI / 4) / (Math.PI / 4)).toFixed(2);
            btn.style.left    = Math.round(leftPx) + 'px';
        } else {
            btn.style.display = 'none';
        }
    }
}

/* ── Splitter draggable ── */
(function initSplitter() {
    document.addEventListener('DOMContentLoaded', function () {
        var splitter = document.getElementById('left-splitter');
        var animArea = document.getElementById('anim-area');
        var graphArea = document.getElementById('graph-area');
        if (!splitter) return;

        var dragging = false;
        var startY = 0, startAnimH = 0, startGraphH = 0;

        splitter.addEventListener('pointerdown', function (e) {
            dragging = true;
            startY      = e.clientY;
            startAnimH  = animArea.getBoundingClientRect().height;
            startGraphH = graphArea.getBoundingClientRect().height;
            splitter.classList.add('dragging');
            splitter.setPointerCapture(e.pointerId);
        });

        splitter.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            var minAH = 80, minGH = 80;
            var dy = e.clientY - startY;
            /* Clamp dy pour que ni l'animation ni le graphe ne descende sous son minimum */
            dy = Math.max(dy, -(startAnimH - minAH));
            dy = Math.min(dy,   startGraphH - minGH);
            var newAH = startAnimH + dy;
            var newGH = startGraphH - dy;
            animArea.style.flex  = 'none';
            graphArea.style.flex = 'none';
            animArea.style.height  = newAH + 'px';
            graphArea.style.height = newGH + 'px';
            /* Redimensionner le bitmap des canvas pendant le glissé, et pas
               seulement au relâchement : sinon l'animation et les graphes
               restent étirés/flous tout le temps du déplacement, puis
               claquent d'un coup. Une fois par frame au plus. */
            if (dragRaf === null) dragRaf = requestAnimationFrame(_applyDragResize);
        });

        var dragRaf = null;
        function _applyDragResize() {
            dragRaf = null;
            resizeAnimCanvas();
            resizeGraphCanvas();
            computeScale(_animW, _animH);
            computeScaleE(_animW, _animH);
        }

        function endDrag() {
            if (!dragging) return;
            dragging = false;
            splitter.classList.remove('dragging');
            resizeAnimCanvas();
            resizeGraphCanvas();
            computeScale(_animW, _animH);
            computeScaleE(_animW, _animH);
        }

        splitter.addEventListener('pointerup', endDrag);
        splitter.addEventListener('pointercancel', endDrag);
    });
})();

/* ══════════════════════════════════════════════════
   CHAMP ÉLECTRIQUE — fonctions de rendu
══════════════════════════════════════════════════ */

var _animHoverSnapE = null;
var _replayPlayingE       = false;
var _replaySessionActiveE = false;
var _replayTE       = 0;
var _replayMaxTE    = 0;

/* Overrides d'échelle pour le mode électrique (null = utiliser constantes globales) */
var _vecScaleVitOverride = null;
var _vecScaleAccOverride = null;

function _drawBackgroundE(ctx) {
    var grad = ctx.createLinearGradient(0, 0, 0, _animH);
    grad.addColorStop(0,   '#eef2f7');
    grad.addColorStop(0.5, '#e4eaf2');
    grad.addColorStop(1,   '#eef2f7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, _animW, _animH);
}

function _drawGridE(ctx) {
    if (sim.scaleX < 1 && sim.scaleY < 1) return;
    /* Bornes des graduations x/y fixées sur la plage logique (écran de détection / ±yMax),
       pas sur la marge visuelle du canvas */
    var xGridMax = _effXMaxE(sim);
    var yGridMax = _effYMaxE(sim);
    var xGrid = _gridSteps(xGridMax, xGridMax * sim.scaleX, GRID_MAJOR_PX_XE);
    var yGrid = _gridSteps(yGridMax, yGridMax * sim.scaleY, GRID_MAJOR_PX_YE);
    var xDec  = _gridDec(xGrid.major);
    var yDec  = _gridDec(yGrid.major);
    var fontSize = _animFontSize(11, 15, 0.030);
    var tickLen = Math.max(5, _animH * 0.012);

    /* ── Bornes de non-superposition avec les titres d'axes ──
       Ce mode n'en avait aucune : la dernière graduation x passait sous
       « x (m) » et la plus haute graduation y sous « y (m) », d'autant plus
       nettement que la fenêtre était petite (les titres sont placés par des
       constantes plafonnées, les graduations par l'échelle physique, qui se
       comprime). Mêmes règles qu'en mode pesanteur. */
    var agE         = _axisGeom();
    var axesFontSzE = _animFontSize(13, 18, 0.038);
    var yAxisEndE   = agE.yEnd + agE.aLen + 2 + axesFontSzE + AXIS_TITLE_PAD
                      + fontSize * 0.45;   /* labels y en textBaseline 'middle' : demi-hauteur d'encre */
    var xCutoffE    = agE.xEnd - _axisTitleW(ctx, 'x (m)', axesFontSzE)
                      - _gradLabelW(ctx, xGridMax, xDec, fontSize, false) / 2
                      - AXIS_TITLE_PAD;
    var orig = toCanvas(0, 0);
    /* Labels y du mode électrique : alignés à droite dans la marge gauche ; on
       ne les trace pas s'ils n'y tiennent pas plutôt que de les laisser tronquer. */
    var _yLblFitsE  = (orig.cx - tickLen - 4
                       - _gradLabelW(ctx, yGridMax, yDec, fontSize, false)) >= 2;

    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.lineWidth = _axisLW(1);
    ctx.setLineDash([_axisLW(4), _axisLW(4)]);

    for (var ix = 1; ix * xGrid.minor <= xGridMax * 1.001; ix++) {
        var gx = toCanvas(ix * xGrid.minor, 0).cx;
        if (gx > _animW - 5) break;
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, _animH); ctx.stroke();
    }
    for (var iy = 1; iy * yGrid.minor <= yGridMax * 1.001; iy++) {
        var gyP = toCanvas(0,  iy * yGrid.minor).cy;
        var gyN = toCanvas(0, -iy * yGrid.minor).cy;
        if (gyP >= 5)          { ctx.beginPath(); ctx.moveTo(0, gyP); ctx.lineTo(_animW, gyP); ctx.stroke(); }
        if (gyN <= _animH - 5) { ctx.beginPath(); ctx.moveTo(0, gyN); ctx.lineTo(_animW, gyN); ctx.stroke(); }
    }

    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(60,60,60,0.72)';
    ctx.font = fontSize + 'px Segoe UI, Arial';

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (var jx = 1; jx * xGrid.minor <= xGridMax * 1.001; jx++) {
        var xv = jx * xGrid.minor;
        var isMaj = Math.abs(xv / xGrid.major - Math.round(xv / xGrid.major)) < 0.001;
        var gx2 = toCanvas(xv, 0).cx;
        if (gx2 > _animW - 5 || gx2 > xCutoffE) break;
        ctx.strokeStyle = 'rgba(60,60,60,' + (isMaj ? '0.45' : '0.22') + ')';
        ctx.lineWidth = _axisLW(isMaj ? 1.4 : 0.8);
        ctx.beginPath(); ctx.moveTo(gx2, orig.cy - tickLen); ctx.lineTo(gx2, orig.cy + tickLen); ctx.stroke();
        if (isMaj) ctx.fillText(fmt(xv, xDec), gx2, orig.cy + tickLen + 2);
        if (isMaj) _reserveTextBox(ctx, fmt(xv, xDec), gx2, orig.cy + tickLen + 2, fontSize, INK_GRAD);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var jy = 1; jy * yGrid.minor <= yGridMax * 1.001; jy++) {
        var yv = jy * yGrid.minor;
        var isMaj2 = Math.abs(yv / yGrid.major - Math.round(yv / yGrid.major)) < 0.001;
        var pcyP = toCanvas(0,  yv).cy;
        var pcyN = toCanvas(0, -yv).cy;
        var ck = 'rgba(60,60,60,' + (isMaj2 ? '0.45' : '0.22') + ')';
        ctx.strokeStyle = ck; ctx.lineWidth = _axisLW(isMaj2 ? 1.4 : 0.8);
        /* Marques : jusqu'au bord. Labels : seulement s'ils ne passent ni sous
           « y (m) » (en haut) ni hors du canvas (en bas). */
        if (pcyP >= 5) {
            ctx.beginPath(); ctx.moveTo(orig.cx - tickLen, pcyP); ctx.lineTo(orig.cx + tickLen, pcyP); ctx.stroke();
            if (isMaj2 && _yLblFitsE && pcyP >= yAxisEndE) ctx.fillText(fmt(yv, yDec), orig.cx - tickLen - 4, pcyP);
            if (isMaj2 && _yLblFitsE && pcyP >= yAxisEndE) _reserveTextBox(ctx, fmt(yv, yDec), orig.cx - tickLen - 4, pcyP, fontSize, INK_GRAD);
        }
        if (pcyN <= _animH - 5) {
            ctx.beginPath(); ctx.moveTo(orig.cx - tickLen, pcyN); ctx.lineTo(orig.cx + tickLen, pcyN); ctx.stroke();
            if (isMaj2 && _yLblFitsE && pcyN <= _animH - fontSize * 0.45 - 3) ctx.fillText(fmt(-yv, yDec), orig.cx - tickLen - 4, pcyN);
            if (isMaj2 && _yLblFitsE && pcyN <= _animH - fontSize * 0.45 - 3) _reserveTextBox(ctx, fmt(-yv, yDec), orig.cx - tickLen - 4, pcyN, fontSize, INK_GRAD);
        }
    }
    ctx.restore();
}

function _drawAxesE(ctx) {
    var orig = toCanvas(0, 0);
    var ag   = _axisGeom();
    var fontSize = _animFontSize(13, 18, 0.038);
    ctx.save();
    ctx.strokeStyle = 'rgba(40,40,40,0.70)';
    ctx.fillStyle   = 'rgba(40,40,40,0.70)';
    ctx.lineWidth   = _axisLW(2);

    /* Axe X */
    ctx.beginPath(); ctx.moveTo(orig.cx - 5, orig.cy); ctx.lineTo(ag.xEnd - ag.aBase, orig.cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ag.xEnd, orig.cy);
    ctx.lineTo(ag.xEnd - ag.aLen, orig.cy - ag.aHalf); ctx.lineTo(ag.xEnd - ag.aLen, orig.cy + ag.aHalf);
    ctx.closePath(); ctx.fill();

    /* Axe Y symétrique */
    ctx.beginPath(); ctx.moveTo(orig.cx, _animH - ag.yEnd); ctx.lineTo(orig.cx, ag.yEnd + ag.aBase); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(orig.cx, ag.yEnd);
    ctx.lineTo(orig.cx - ag.aHalf, ag.yEnd + ag.aLen); ctx.lineTo(orig.cx + ag.aHalf, ag.yEnd + ag.aLen);
    ctx.closePath(); ctx.fill();
    ctx.font = 'bold ' + fontSize + 'px Segoe UI, Arial';
    /* Aligné à droite sur la pointe de la flèche, comme en mode pesanteur :
       aligné à gauche, « x (m) » partait vers la droite depuis un xEnd déjà
       à ~18 px du bord et sortait du canvas. */
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('x (m)', ag.xEnd, orig.cy + fontSize + 4);
    _reserveTextBox(ctx, "x (m)", ag.xEnd, orig.cy + fontSize + 4, fontSize, INK_GRAD);
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('y (m)', orig.cx - 6, ag.yEnd + ag.aLen + 2);
    _reserveTextBox(ctx, "y (m)", orig.cx - 6, ag.yEnd + ag.aLen + 2, fontSize, INK_GRAD);
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('O', orig.cx - 4, orig.cy + 2);
    _reserveTextBox(ctx, "O", orig.cx - 4, orig.cy + 2, fontSize, INK_GRAD);
    ctx.restore();
}

function _drawArmatures(ctx) {
    var isPos = sim.E >= 0;
    ctx.save();
    if (sim.armatureMode === 'parallel-x') {
        var halfE  = sim.e / 2;
        var topPt  = toCanvas(0, halfE);
        var botPt  = toCanvas(0, -halfE);
        var exitPt = toCanvas(sim.L, 0);
        var scrPt  = toCanvas(sim.xMax, 0);
        var platH  = Math.max(7, Math.min(18, Math.abs(toCanvas(0, halfE).cy - toCanvas(0, halfE * 0.8).cy)));
        var platW  = exitPt.cx - topPt.cx;
        var topColor  = isPos ? '#4a90d9' : '#e06060';
        var botColor  = isPos ? '#e06060' : '#4a90d9';
        var topCharge = isPos ? '−' : '+';
        var botCharge = isPos ? '+' : '−';
        var topY = topPt.cy - platH;
        var botY = botPt.cy;

        /* Zone champ */
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = isPos ? '#3060cc' : '#cc3030';
        ctx.fillRect(topPt.cx, topY + platH, platW, botY - topY - platH);
        ctx.globalAlpha = 1;

        function _drawPlate(y, color, charge, strokeCol) {
            ctx.fillStyle = color; ctx.globalAlpha = 0.82;
            ctx.fillRect(topPt.cx, y, platW, platH);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = strokeCol; ctx.lineWidth = 1.5;
            ctx.strokeRect(topPt.cx, y, platW, platH);
            var nSigns = Math.max(3, Math.floor(platW / 22));
            ctx.fillStyle = '#fff';
            ctx.font = 'bold ' + Math.max(9, Math.min(14, platH * 0.85)) + 'px Arial';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            for (var si = 0; si < nSigns; si++) {
                ctx.fillText(charge, topPt.cx + (si + 0.5) * platW / nSigns, y + platH / 2);
            }
        }
        _drawPlate(topY, topColor, topCharge, isPos ? '#2a6aaa' : '#aa3030');
        _drawPlate(botY, botColor, botCharge, isPos ? '#aa3030' : '#2a6aaa');

        /* Écran droit */
        ctx.strokeStyle = 'rgba(80,80,80,0.45)'; ctx.lineWidth = 1.8;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(scrPt.cx, 10); ctx.lineTo(scrPt.cx, _animH - 10); ctx.stroke();
        ctx.setLineDash([]);

    } else {
        /* perp-x */
        var halfE2   = PLATE_HALF_HEIGHT_PERP;
        var topL  = toCanvas(0,      halfE2);
        var botL  = toCanvas(0,     -halfE2);
        var topR  = toCanvas(sim.e,  halfE2);
        var botR  = toCanvas(sim.e, -halfE2);
        var scrP2 = toCanvas(sim.xMax, 0);
        var platW2  = Math.max(6, Math.min(14, sim.scaleX * sim.e * 0.06));
        var platH2  = botL.cy - topL.cy;
        var holeSz  = Math.max(6, Math.min(16, platH2 * 0.18));
        var holeCy  = topL.cy + platH2 / 2;
        var leftColor  = isPos ? '#e06060' : '#4a90d9';
        var rightColor = isPos ? '#4a90d9' : '#e06060';
        var leftCharge  = isPos ? '+' : '−';
        var rightCharge = isPos ? '−' : '+';

        /* Zone champ */
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = isPos ? '#3060cc' : '#cc3030';
        ctx.fillRect(topL.cx, topL.cy, topR.cx - topL.cx, platH2);
        ctx.globalAlpha = 1;

        function _drawSignsInSegment(bx, charge, yTop, yBot) {
            var segH = yBot - yTop;
            if (segH < 8) return;
            var nSigns = Math.max(1, Math.floor(segH / 22));
            for (var si = 0; si < nSigns; si++) {
                var sy = yTop + (si + 0.5) * segH / nSigns;
                ctx.fillText(charge, bx, sy);
            }
        }
        function _drawVPlate(bx, color, charge) {
            ctx.fillStyle = color; ctx.globalAlpha = 0.82;
            ctx.fillRect(bx - platW2 / 2, topL.cy, platW2, holeCy - holeSz - topL.cy);
            ctx.fillRect(bx - platW2 / 2, holeCy + holeSz, platW2, botL.cy - holeCy - holeSz);
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            _drawSignsInSegment(bx, charge, topL.cy, holeCy - holeSz);
            _drawSignsInSegment(bx, charge, holeCy + holeSz, botL.cy);
        }
        _drawVPlate(topL.cx, leftColor,  leftCharge);
        _drawVPlate(topR.cx, rightColor, rightCharge);

        /* Écran droit */
        ctx.strokeStyle = 'rgba(80,80,80,0.45)'; ctx.lineWidth = 1.8;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(scrP2.cx, 10); ctx.lineTo(scrP2.cx, _animH - 10); ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.restore();
}

function _drawFieldE(ctx) {
    var COL = '#e67e22';
    var OPACITY = 0.50;
    var E   = sim.E;
    var dir = E >= 0 ? -1 : 1;   /* -1 = flèche vers le haut (cy décroît) */

    /* Même tracé que les vecteurs cinématiques (_drawVecArrow) : corps arrêté à
       la base d'une pointe triangulaire pleine, au lieu du chevron ouvert au
       trait dessiné ici auparavant. Seules la couleur et l'opacité distinguent
       les flèches de champ des vecteurs. */

    /* Échelle des flèches en fonction de l'intensité du champ (log, bornée) */
    var E_REF = 1.5e4;
    var eScale = 1 + 0.65 * Math.log10(Math.max(Math.abs(E), 1) / E_REF);
    eScale = Math.max(0.4, Math.min(2.2, eScale));

    /* Les bornes en px absolus ci-dessous (longueur plancher/plafond et
       espacement) suivent la taille du canvas : le plancher de 14 px rendait
       les flèches démesurées quand l'écartement des armatures se réduisait
       sur une petite fenêtre. */
    var f = _vecScaleFactor();

    if (sim.armatureMode === 'parallel-x') {
        var xL   = sim.originX + 12;
        var xR   = toCanvas(sim.L, 0).cx - 12;
        var cols = Math.max(3, Math.floor((xR - xL) / (50 * f)));
        var halfE  = sim.e / 2;
        var halfPx = Math.abs(toCanvas(0, halfE).cy - toCanvas(0, 0).cy);
        var vecLen = Math.min(Math.max(14 * f, Math.min(36 * f, halfPx * 0.75)) * eScale, halfPx * 0.9);
        var midCy  = toCanvas(0, 0).cy;
        var rowOffset = halfPx * 0.5; /* décale chaque rangée à mi-chemin entre l'axe x et une plaque */

        [-1, 1].forEach(function(side) {
            var rowCy = midCy - side * rowOffset;
            for (var c = 0; c < cols; c++) {
                var fx = xL + c * (xR - xL) / Math.max(1, cols - 1);
                var fy1 = rowCy - dir * vecLen / 2;
                _drawVecArrow(ctx, fx, fy1, 0, dir * vecLen, COL, null, OPACITY);
            }
        });
    } else {
        /* perp-x : miroir du mode parallel-x (colonnes ↔ rangées, x ↔ y) */
        var yT   = toCanvas(0, PLATE_HALF_HEIGHT_PERP).cy + 12;
        var yB   = toCanvas(0, -PLATE_HALF_HEIGHT_PERP).cy - 12;
        var rows = Math.max(3, Math.floor((yB - yT) / (50 * f)));
        var halfPxH = Math.abs(toCanvas(sim.e, 0).cx - toCanvas(sim.e / 2, 0).cx);
        var vecLenH = Math.min(Math.max(14 * f, Math.min(36 * f, halfPxH * 0.75)) * eScale, halfPxH * 0.9);
        var midCx   = toCanvas(sim.e / 2, 0).cx;
        var colOffset = halfPxH * 0.5;
        var dxd = E >= 0 ? 1 : -1;

        [-1, 1].forEach(function(side) {
            var colCx = midCx - side * colOffset;
            for (var r = 0; r < rows; r++) {
                var fy  = yT + r * (yB - yT) / Math.max(1, rows - 1);
                var fx1 = colCx - dxd * vecLenH / 2;
                _drawVecArrow(ctx, fx1, fy, dxd * vecLenH, 0, COL, null, OPACITY);
            }
        });
    }
}

/* Force électrique au point (x,y) — nulle hors du condensateur.
   Sans arguments, utilise la position courante de la particule (sim = simE ici). */
function _getEPhys(x, y) {
    if (x === undefined) { x = sim.x; y = sim.y; }
    return _fieldForceAt(sim, x, y);
}

function _drawForcesAtE(ctx, cx, cy, vx, vy, opacity, phys) {
    if (phys.FEx === 0 && phys.FEy === 0) return; /* hors du condensateur : rien à afficher */
    var _perp = sim.armatureMode === 'perp-x';
    var _col  = _perp ? COL_VEC_FORCES_PERP : COL_VEC_FORCES;
    var _op   = _perp ? 1.0 : opacity;
    var _vp = _viewProjFactors();
    var _sf = _vsE.force;
    var dxPx =  phys.FEx * _sf * _vp.cx;
    var dyPx = -phys.FEy * _sf * _vp.cy;
    _drawVecArrow(ctx, cx, cy, dxPx, dyPx, _col, null, _op, _perp ? VEC_LW_PERP : undefined);
    _reserveArrow(cx, cy, dxPx, dyPx);
    _queueForceName(ctx, cx + dxPx, cy + dyPx, 'FE', _col, _op, opacity,
                    ['right','upper-right','lower-right','left','above','below']);
}

function _drawSumFAtE(ctx, cx, cy, vx, vy, opacity, phys) {
    if (phys.FEx === 0 && phys.FEy === 0) return; /* hors du condensateur : rien à afficher */
    var _perp = sim.armatureMode === 'perp-x';
    var _col  = _perp ? COL_VEC_SUMF_PERP : COL_VEC_SUMF;
    var _op   = _perp ? 1.0 : opacity;
    var _vp = _viewProjFactors();
    var _sf = _vsE.force;
    var dxPx =  phys.FEx * _sf * _vp.cx;
    var dyPx = -phys.FEy * _sf * _vp.cy;
    _drawVecArrow(ctx, cx, cy, dxPx, dyPx, _col, null, _op, _perp ? VEC_LW_PERP : undefined);
    _reserveArrow(cx, cy, dxPx, dyPx);
    _queueForceName(ctx, cx + dxPx, cy + dyPx, 'ΣF', _col, _op, opacity,
                    ['right','upper-right','lower-right','left','above','below']);
}

function _drawChronoSnapsE(ctx) {
    var snaps = sim.chronoSnaps;
    if (!snaps.length) return;
    var _vp = _viewProjFactors();
    for (var i = 0; i < snaps.length; i++) {
        var s = snaps[i];
        var ep = _getEPhys(s.x, s.y);
        var p = toCanvas(s.x, s.y);
        ctx.save();
        ctx.fillStyle = _currentRunColor || 'rgba(50,80,180,0.85)';
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = _axisLW(1.5);
        ctx.beginPath(); ctx.arc(p.cx, p.cy, _chronoRadius(), 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        ctx.restore();
        if (sim.showVecPos)    _drawVectorPos(ctx, s.x, s.y, 0.6);
        if (sim.showVecVit) {
            var _cvxS = s.vx * sim.scaleX, _cvyS = -s.vy * sim.scaleY;
            var _cmS = Math.hypot(_cvxS, _cvyS) || 1, _lS = Math.hypot(s.vx, s.vy) * _vsE.vit;
            var _vitPerpS = sim.armatureMode === 'perp-x';
            _drawVecDispVA(ctx, p.cx, p.cy, _cvxS * _lS / _cmS, _cvyS * _lS / _cmS,
                _vitPerpS ? COL_VEC_VIT_PERP : COL_VEC_VIT, null, _vitPerpS ? 1.0 : 0.6,
                _vitPerpS ? VEC_VIT_LW_PERP : undefined);
        }
        if (sim.showVecAcc) {
            var _caxS = s.ax * sim.scaleX, _cayS = -s.ay * sim.scaleY;
            var _caS = Math.hypot(_caxS, _cayS) || 1, _laS = Math.hypot(s.ax, s.ay) * _vsE.acc;
            var _accPerpS = sim.armatureMode === 'perp-x';
            _drawVecDispVA(ctx, p.cx, p.cy, _caxS * _laS / _caS, _cayS * _laS / _caS,
                _accPerpS ? COL_VEC_ACC_PERP : COL_VEC_ACC, null, _accPerpS ? 1.0 : 0.6,
                _accPerpS ? VEC_LW_PERP : undefined);
        }
        if (sim.showVecForces || sim.showVecSumF) {
            if (sim.showVecForces) _drawForcesAtE(ctx, p.cx, p.cy, s.vx, s.vy, 0.6, ep);
            if (sim.showVecSumF)   _drawSumFAtE  (ctx, p.cx, p.cy, s.vx, s.vy, 0.6, ep);
        }
    }
}

function _drawSavedChronoSnapsE(ctx, run) {
    var snaps = run.chronoSnaps;
    if (!snaps.length) return;
    var _vp = _viewProjFactors();
    var _rvs = _runVecScalesE(run);
    var vsv = _rvs.vit;
    var vsa = _rvs.acc;
    for (var i = 0; i < snaps.length; i++) {
        var s = snaps[i];
        if (_replaySessionActive && s.t > _replayT) break;
        var ep = _fieldForceAt(run, s.x, s.y);
        var p = toCanvas(s.x, s.y);
        ctx.save();
        ctx.globalAlpha = 0.82;
        ctx.fillStyle = run.color; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = _axisLW(1.5);
        ctx.beginPath(); ctx.arc(p.cx, p.cy, _chronoRadius(), 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        ctx.restore();
        if (run.showVecPos)    _drawVectorPos(ctx, s.x, s.y, 0.42);
        if (run.showVecVit) {
            var _cvxR = s.vx * sim.scaleX, _cvyR = -s.vy * sim.scaleY;
            var _cmR = Math.hypot(_cvxR, _cvyR) || 1, _lR = Math.hypot(s.vx, s.vy) * vsv;
            var _vitPerpR = run.armatureMode === 'perp-x';
            _drawVecDispVA(ctx, p.cx, p.cy, _cvxR * _lR / _cmR, _cvyR * _lR / _cmR,
                _vitPerpR ? COL_VEC_VIT_PERP : COL_VEC_VIT, null, _vitPerpR ? 1.0 : 0.42,
                _vitPerpR ? VEC_VIT_LW_PERP : undefined);
        }
        if (run.showVecAcc) {
            var _caxR = s.ax * sim.scaleX, _cayR = -s.ay * sim.scaleY;
            var _caR = Math.hypot(_caxR, _cayR) || 1, _laR = Math.hypot(s.ax, s.ay) * vsa;
            var _accPerpR = run.armatureMode === 'perp-x';
            _drawVecDispVA(ctx, p.cx, p.cy, _caxR * _laR / _caR, _cayR * _laR / _caR,
                _accPerpR ? COL_VEC_ACC_PERP : COL_VEC_ACC, null, _accPerpR ? 1.0 : 0.42,
                _accPerpR ? VEC_LW_PERP : undefined);
        }
        if (run.showVecForces || run.showVecSumF) {
            if (run.showVecForces) _drawForcesAtE(ctx, p.cx, p.cy, s.vx, s.vy, 0.42, ep);
            if (run.showVecSumF)   _drawSumFAtE  (ctx, p.cx, p.cy, s.vx, s.vy, 0.42, ep);
        }
    }
}

function _drawParticleE(ctx) {
    if (sim.ended && sim.trajPoints.length > 0) return;
    var p = toCanvas(sim.x, sim.y);
    var r = _particleRadius();
    var charge = sim.q < 0 ? '−' : '+';
    var color  = sim.q < 0 ? '#4a90d9' : '#e06060';
    ctx.save();
    ctx.beginPath(); ctx.arc(p.cx, p.cy, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.30)'; ctx.shadowBlur = _axisLW(5);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = _axisLW(1.5); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.max(10, r * 1.3) + 'px Arial';   /* r suit déjà l'échelle */
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(charge, p.cx, p.cy);
    ctx.restore();

    var _vp = _viewProjFactors();
    if (sim.showVecPos)    _drawVectorPos(ctx, sim.x, sim.y, 1.0);
    if (sim.showVecVit) {
        var _cvxP = sim.vx * sim.scaleX, _cvyP = -sim.vy * sim.scaleY;
        var _cmP = Math.hypot(_cvxP, _cvyP) || 1, _lP = Math.hypot(sim.vx, sim.vy) * _vsE.vit;
        var _vitPerpP = sim.armatureMode === 'perp-x';
        _drawVecDispVA(ctx, p.cx, p.cy, _cvxP * _lP / _cmP, _cvyP * _lP / _cmP,
            _vitPerpP ? COL_VEC_VIT_PERP : COL_VEC_VIT, null, 1.0, _vitPerpP ? VEC_VIT_LW_PERP : undefined);
    }
    if (sim.showVecAcc) {
        var _caxP = sim.ax * sim.scaleX, _cayP = -sim.ay * sim.scaleY;
        var _caP = Math.hypot(_caxP, _cayP) || 1, _laP = Math.hypot(sim.ax, sim.ay) * _vsE.acc;
        var _accPerpP = sim.armatureMode === 'perp-x';
        _drawVecDispVA(ctx, p.cx, p.cy, _caxP * _laP / _caP, _cayP * _laP / _caP,
            _accPerpP ? COL_VEC_ACC_PERP : COL_VEC_ACC, null, 1.0, _accPerpP ? VEC_LW_PERP : undefined);
    }
    if (sim.showVecForces || sim.showVecSumF) {
        var ep = _getEPhys();
        if (sim.showVecForces) _drawForcesAtE(ctx, p.cx, p.cy, sim.vx, sim.vy, 1.0, ep);
        if (sim.showVecSumF)   _drawSumFAtE  (ctx, p.cx, p.cy, sim.vx, sim.vy, 1.0, ep);
    }
}

function _updateAnimHoverE(mouseX, mouseY) {
    var isChrono = (simE.displayMode === 'chrono');
    var visible = _visibleSavedRunsE();
    var datasets = [];
    if (isChrono) {
        if (simE.chronoSnaps.length > 0) datasets.push({data: simE.chronoSnaps, color: _currentRunColorE || '#2050a0', runId: null});
        for (var i = 0; i < visible.length; i++) {
            if (!visible[i].hidden && visible[i].chronoSnaps.length > 0)
                datasets.push({data: visible[i].chronoSnaps, color: visible[i].color, runId: visible[i].id});
        }
    } else {
        if (simE.graphData.length >= 2) datasets.push({data: simE.graphData, color: _currentRunColorE || '#2050a0', runId: null});
        for (var i = 0; i < visible.length; i++) {
            if (!visible[i].hidden) datasets.push({data: visible[i].graphData, color: visible[i].color, runId: visible[i].id});
        }
    }
    /* Même rejet par encadrement + distance au carré qu'en pesanteur */
    var R = _hoverPickRadius();
    var bestD2 = R * R, bestSnap = null;
    /* sim is swapped to simE during drawAnimE but not here; use simE directly for toCanvas */
    var _simBak = sim; sim = simE;
    try {
        for (var di = 0; di < datasets.length; di++) {
            var pts = datasets[di].data;
            for (var k = 0; k < pts.length; k++) {
                var p = toCanvas(pts[k].x, pts[k].y);
                var dx = p.cx - mouseX;
                if (dx > R || dx < -R) continue;
                var dy = p.cy - mouseY;
                if (dy > R || dy < -R) continue;
                var d2 = dx * dx + dy * dy;
                if (d2 < bestD2) {
                    bestD2 = d2;
                    bestSnap = {x: pts[k].x, y: pts[k].y,
                                vx: pts[k].vx, vy: pts[k].vy,
                                ax: pts[k].ax, ay: pts[k].ay,
                                t: pts[k].t, color: datasets[di].color,
                                runId: datasets[di].runId, _cx: p.cx, _cy: p.cy};
                }
            }
        }
    } finally {
        sim = _simBak;
    }
    _animHoverSnapE = bestSnap;
}

function _handleClickE() {
    if (!_pinModeActive || !_animHoverSnapE) return;
    var snap = _animHoverSnapE;
    var runRef = snap.runId === null ? null : savedRunsE.find(function(r) { return r.id === snap.runId; });
    if (snap.runId !== null && !runRef) return; /* run supprimée entre-temps */
    var targetList = runRef ? runRef.analysisPoints : simE.analysisPoints;
    var _simBak = sim; sim = simE;
    var hitIdx = -1;
    try {
        for (var i = 0; i < targetList.length; i++) {
            var pp = toCanvas(targetList[i].x, targetList[i].y);
            if (Math.hypot(pp.cx - snap._cx, pp.cy - snap._cy) < 12) { hitIdx = i; break; }
        }
    } finally {
        sim = _simBak;
    }
    if (hitIdx !== -1) { targetList.splice(hitIdx, 1); return; }
    if (targetList.length >= MAX_ANALYSIS_POINTS) { showAnimToast(MSG_MAX_PINS); return; }
    var ep = runRef
        ? _fieldForceAt(runRef, snap.x, snap.y)
        : _fieldForceAt(simE, snap.x, snap.y);
    targetList.push({x: snap.x, y: snap.y, vx: snap.vx, vy: snap.vy,
                     ax: snap.ax, ay: snap.ay, t: snap.t,
                     color: snap.color, phys: ep});
}

function drawAnimE() {
    if (!_animCtx) return;
    var ctx = _animCtx;

    /* Swap temporaire sim → simE */
    var _simOrig    = sim;
    var _runsOrig   = savedRuns;
    var _colorOrig  = _currentRunColor;
    var _repOrig    = _replayPlaying;
    var _repActiveOrig = _replaySessionActive;
    var _repTOrig   = _replayT;
    var _hoverOrig  = _animHoverSnap;
    sim              = simE;
    /* Runs sauvegardées indépendantes entre parallel-x et perp-x */
    savedRuns        = _visibleSavedRunsE();
    _currentRunColor = _currentRunColorE;
    _replayPlaying   = _replayPlayingE;
    _replaySessionActive = _replaySessionActiveE;
    _replayT         = _replayTE;
    _animHoverSnap   = _animHoverSnapE;
    _labelMaxY       = _animH - 5;
    /* Échelles électriques ramenées à la taille courante du canvas — à faire
       avant tout tracé, tout le rendu ci-dessous lit _vsE. */
    _updateVecScalesE();
    /* Nécessaire pour que les points épinglés (_drawAnalysisPoints) utilisent les
       échelles vitesse/accélération électriques, pas celles du champ de pesanteur */
    _vecScaleVitOverride = _vsE.vit;
    _vecScaleAccOverride = _vsE.acc;

    /* try/finally : sans lui, une exception levée pendant le rendu laisserait
       "sim" pointé sur simE définitivement — l'onglet champ de pesanteur
       deviendrait inutilisable jusqu'au rechargement, sans message. */
    try {
        _updateViewAngles();
        _updateLabelHalo(true);
        _updateLabelCrowd();
        ctx.clearRect(0, 0, _animW, _animH);
        _resetLabelRects();

        _drawBackgroundE(ctx);
        _drawGridE(ctx);
        _drawAxesE(ctx);
        _drawArmatures(ctx);
        if (simE.showFieldE) _drawFieldE(ctx);

        _labelPrio = PRIO_SAVED;
        for (var _sri = 0; _sri < savedRuns.length; _sri++) {
            var _sr = savedRuns[_sri];
            if (_sr.hidden) continue;
            if (simE.displayMode === 'trajectory' || simE.displayMode === 'both') _drawSavedTrajectory(ctx, _sr);
            if (simE.displayMode === 'chrono'     || simE.displayMode === 'both') _drawSavedChronoSnapsE(ctx, _sr);
            if (_replaySessionActive) _drawSavedBallE(ctx, _sr);
        }

        if (simE.displayMode === 'trajectory' || simE.displayMode === 'both') _drawTrajectory(ctx);
        _labelPrio = PRIO_CHRONO;
        if (simE.displayMode === 'chrono'     || simE.displayMode === 'both') _drawChronoSnapsE(ctx);

        _labelPrio = PRIO_MOBILE;
        _drawParticleE(ctx);
        _labelPrio = PRIO_PIN;
        _drawAnalysisPoints(ctx);
        _drawViewLabel(ctx);
        _labelPrio = PRIO_HOVER;
        if (_animHoverSnapE) _drawAnimHoverE(ctx, _animHoverSnapE);

        /* Dans le try, impérativement : _bestLabelPos lit _labelMaxY et
           _viewAngles, que le finally ci-dessous s'apprête à restaurer. */
        _flushLabels(ctx);
        _drawAnimToast(ctx);
    } finally {
        /* Restore */
        sim              = _simOrig;
        savedRuns        = _runsOrig;
        _currentRunColor = _colorOrig;
        _replayPlaying   = _repOrig;
        _replaySessionActive = _repActiveOrig;
        _replayT         = _repTOrig;
        _animHoverSnap   = _hoverOrig;
        _labelMaxY       = null;
        _vecScaleVitOverride = null;
        _vecScaleAccOverride = null;
    }
}

function _drawAnimHoverE(ctx, snap) {
    var _simBak = sim; var _runsBak = savedRuns; var _colBak = _currentRunColor;
    sim = simE; savedRuns = _visibleSavedRunsE(); _currentRunColor = _currentRunColorE;
    _updateVecScalesE();
    _vecScaleVitOverride = _vsE.vit;
    _vecScaleAccOverride = _vsE.acc;
    try {
        _drawAnimHover(ctx, snap);
    } finally {
        _vecScaleVitOverride = null;
        _vecScaleAccOverride = null;
        sim = _simBak; savedRuns = _runsBak; _currentRunColor = _colBak;
    }
}
