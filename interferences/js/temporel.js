// ══════════════════════════════════════════════════════════════════════
//  temporel.js — onglet « Interférences en 1D », représentation TEMPORELLE
//
//  Trois graphes figés, l'un sous l'autre : y₁(t), y₂(t) et y₁(t) + y₂(t),
//  sur une fenêtre de durée FIXE (TEMP_FENETRE_MS). y₂ est la même sinusoïde
//  que y₁, translatée de Δt : y₂(t) = A₂·sin(2π(t − Δt)/T).
//
//  Aucune animation : le dessin n'est refait que sur un changement de réglage
//  ou de taille. Les réglages (simTemp) sont INDÉPENDANTS de ceux de la
//  représentation spatiale (simPrin) : on retrouve chacune telle qu'on l'a
//  laissée.
//
//  Chargé après principe.js, dont il réutilise les couleurs (PRIN_COL_*),
//  _prinRoundRect et la classe de tolérance PRIN_TOL_RATIO ; formatFr vient
//  de scene.js.
// ══════════════════════════════════════════════════════════════════════

var TEMP_FENETRE_MS = 10;        // durée affichée (ms), fixe
var TEMP_T_DEF = 2.00, TEMP_A_DEF = 0.80;
var TEMP_COL_T  = '#2c3e50';     // double flèche de la période
var TEMP_COL_DT = '#2a6aaa';     // double flèche du décalage

var simTemp = {
    T: TEMP_T_DEF,               // période commune (ms)
    dt: 0,                       // décalage de y₂ par rapport à y₁ (ms)
    a1: TEMP_A_DEF,
    a2: TEMP_A_DEF,
    showT: false,
    showDt: false,
    // Mise en page (cf. _tempLayout)
    W: 0, H: 0, fs: 12, lw: 1,
    plotX0: 0, plotW: 10, ampPx: 10, rows: [], axeLabelY: 0, gap12: 0
};

function _tempY1(t) { return simTemp.a1 * Math.sin(2 * Math.PI * t / simTemp.T); }
function _tempY2(t) { return simTemp.a2 * Math.sin(2 * Math.PI * (t - simTemp.dt) / simTemp.T); }
function _tempXpx(tms) { return simTemp.plotX0 + tms / TEMP_FENETRE_MS * simTemp.plotW; }

// ── Mise en page ──────────────────────────────────────────────────────
// Même découpe que la scène spatiale (cf. _prinLayout) : 1 unité pour y₁,
// 1 pour y₂, 2 pour la somme, et une échelle verticale ampPx COMMUNE aux
// trois — un doublement d'amplitude se voit vraiment. La gouttière entre y₁
// et y₂ est plus large : elle loge la double flèche Δt. Elle est réservée en
// permanence, pour que rien ne bouge quand on active l'option.
function _tempLayout(ctx) {
    var s = simTemp;
    var base  = Math.min(s.W / 62, 17);
    var grand = Math.min(s.W / 52, s.H / 30, 24);
    s.fs = Math.max(10, base, grand);
    s.lw = Math.max(1, s.fs / 17);
    var fs = s.fs;

    var padTop = fs * 0.55;
    var basH   = fs * 2.2;                       // valeurs de l'axe des temps + marge
    s.gap12    = Math.max(16, fs * 2.6);
    var gap23  = Math.max(8, fs * 1.15);
    var utile  = Math.max(40, s.H - padTop - basH - s.gap12 - gap23);
    var unitH  = utile / 4;
    s.ampPx    = unitH * 0.5 * 0.82;

    ctx.save();
    ctx.font = 'bold ' + (fs * 0.88) + 'px monospace';
    var margeEch = ctx.measureText('−2').width + 16 * s.lw;
    ctx.font = 'bold ' + (fs * 0.9) + 'px monospace';
    var margeT = fs * 0.8 + ctx.measureText('t (ms)').width + 4;
    ctx.restore();
    var padL = Math.max(38, s.W * 0.045, margeEch);
    var padR = Math.max(24, s.W * 0.030, margeT);
    s.plotX0 = padL;
    s.plotW  = Math.max(10, s.W - padL - padR);

    var y = padTop;
    s.rows = [];
    s.rows.push({ y0: y + unitH * 0.5, half: unitH * 0.5, maxU: 1, titre: 'Onde 1 — y₁(t)' });
    y += unitH + s.gap12;
    s.rows.push({ y0: y + unitH * 0.5, half: unitH * 0.5, maxU: 1, titre: 'Onde 2 — y₂(t)' });
    y += unitH + gap23;
    s.rows.push({ y0: y + unitH, half: unitH, maxU: 2, titre: 'Superposition — y₁(t) + y₂(t)' });
    y += unitH * 2;
    s.axeLabelY = y + fs * 0.30;
}

function resizeTemporel() {
    var canvas = document.getElementById('temporel-canvas');
    var wrap = document.getElementById('prin-temp-area');
    if (!canvas || !wrap) return;
    var w = wrap.clientWidth, h = wrap.clientHeight;
    if (w < 10 || h < 10) return;                // représentation masquée
    var dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    simTemp.W = w;
    simTemp.H = h;
    _tempLayout(ctx);
    drawTemporel();
}

// ── Primitives ────────────────────────────────────────────────────────
function _tempText(ctx, txt, x, y, color, font, align, baseline) {
    ctx.font = font;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = baseline || 'middle';
    ctx.lineWidth = Math.max(3, simTemp.fs * 0.28);
    ctx.strokeStyle = PRIN_COL_BG;
    ctx.lineJoin = 'round';
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = color;
    ctx.fillText(txt, x, y);
}

// Fond de bande + grille verticale (ms entières marquées, demi-ms discrètes)
function _tempDrawBande(ctx, row) {
    var s = simTemp, lw = s.lw;
    var x = s.plotX0 - 6 * lw, w = s.plotW + 12 * lw;
    var y = row.y0 - row.half, h = row.half * 2;
    ctx.save();
    ctx.fillStyle = PRIN_COL_BAND;
    _prinRoundRect(ctx, x, y, w, h, Math.min(8, h * 0.15));
    ctx.fill();
    ctx.strokeStyle = PRIN_COL_BAND_BD;
    ctx.lineWidth = lw;
    ctx.stroke();
    for (var niveau = 0; niveau < 2; niveau++) {
        ctx.strokeStyle = niveau ? PRIN_COL_GRILLE_MAJ : PRIN_COL_GRILLE;
        ctx.lineWidth = (niveau ? 1.3 : 1) * lw;
        ctx.beginPath();
        for (var i = 0; i * 0.5 <= TEMP_FENETRE_MS + 1e-9; i++) {
            if ((i % 2 === 0) !== (niveau === 1)) continue;
            var px = Math.round(_tempXpx(i * 0.5)) + 0.5;
            ctx.moveTo(px, y + 2);
            ctx.lineTo(px, y + h - 2);
        }
        ctx.stroke();
    }
    ctx.restore();
}

function _tempDrawEchelleY(ctx, row) {
    var s = simTemp, fs = s.fs, lw = s.lw;
    var police = 'bold ' + (fs * 0.88) + 'px monospace';
    var pas = (s.ampPx < fs * 1.05) ? row.maxU : 1;
    ctx.save();
    ctx.strokeStyle = PRIN_COL_TICK;
    ctx.lineWidth = 1.3 * lw;
    ctx.beginPath();
    for (var u = -row.maxU; u <= row.maxU; u += pas) {
        var y = row.y0 - u * s.ampPx;
        ctx.moveTo(s.plotX0 - 6 * lw, y);
        ctx.lineTo(s.plotX0 - (u === 0 ? 11 : 9) * lw, y);
    }
    ctx.stroke();
    ctx.restore();
    for (var v = -row.maxU; v <= row.maxU; v += pas) {
        var txt = (v > 0 ? '+' : (v < 0 ? '−' : '')) + Math.abs(v);
        _tempText(ctx, txt, s.plotX0 - 12 * lw, row.y0 - v * s.ampPx,
                  PRIN_COL_TICK, police, 'right', 'middle');
    }
}

// Axe des temps d'une bande ; valeurs chiffrées sous la dernière seulement
function _tempDrawAxe(ctx, row, avecValeurs) {
    var s = simTemp, fs = s.fs, lw = s.lw;
    ctx.save();
    ctx.strokeStyle = PRIN_COL_AXE;
    ctx.lineWidth = 1.4 * lw;
    ctx.beginPath();
    ctx.moveTo(_tempXpx(0), row.y0);
    ctx.lineTo(_tempXpx(TEMP_FENETRE_MS), row.y0);
    ctx.stroke();
    ctx.strokeStyle = PRIN_COL_TICK;
    ctx.beginPath();
    for (var i = 0; i * 0.5 <= TEMP_FENETRE_MS + 1e-9; i++) {
        var px = Math.round(_tempXpx(i * 0.5)) + 0.5;
        var t = ((i % 2 === 0) ? 7 : 4) * lw;
        ctx.moveTo(px, row.y0 - t);
        ctx.lineTo(px, row.y0 + t);
    }
    ctx.stroke();
    ctx.restore();
    if (!avecValeurs) return;
    var police = 'bold ' + (fs * 0.95) + 'px monospace';
    // Une valeur par ms, ou une sur deux si la place manque
    ctx.font = police;
    var pasPx = s.plotW / TEMP_FENETRE_MS;
    var pas = (pasPx < ctx.measureText('10').width * 1.8) ? 2 : 1;
    for (var j = 0; j <= TEMP_FENETRE_MS + 1e-9; j += pas) {
        _tempText(ctx, formatFr(j, 0), _tempXpx(j), s.axeLabelY,
                  PRIN_COL_TICK, police, 'center', 'top');
    }
    _tempText(ctx, 't (ms)', s.plotX0 + s.plotW + fs * 0.8, s.axeLabelY,
              PRIN_COL_TICK, 'bold ' + (fs * 0.9) + 'px monospace', 'left', 'top');
}

// Courbe échantillonnée une valeur par colonne de pixels
function _tempDrawCourbe(ctx, row, fy, color, largeur, remplissage) {
    var s = simTemp, n = Math.round(s.plotW);
    var tDe = function (i) { return i / n * TEMP_FENETRE_MS; };
    if (remplissage) {
        var grd = ctx.createLinearGradient(0, row.y0 - row.half, 0, row.y0 + row.half);
        grd.addColorStop(0,   'rgba(44, 62, 80, 0.13)');
        grd.addColorStop(0.5, 'rgba(44, 62, 80, 0.02)');
        grd.addColorStop(1,   'rgba(44, 62, 80, 0.13)');
        ctx.save();
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(s.plotX0, row.y0);
        for (var k = 0; k <= n; k++) ctx.lineTo(s.plotX0 + k, row.y0 - fy(tDe(k)) * s.ampPx);
        ctx.lineTo(s.plotX0 + n, row.y0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = largeur;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var i = 0; i <= n; i++) {
        var y = row.y0 - fy(tDe(i)) * s.ampPx;
        if (i === 0) ctx.moveTo(s.plotX0, y); else ctx.lineTo(s.plotX0 + i, y);
    }
    ctx.stroke();
    ctx.restore();
}

// Titre de bande en pilule, ancré à DROITE : à gauche, il couvrirait la
// première crête, qui porte la double flèche T.
function _tempDrawTitre(ctx, row, couleur) {
    var s = simTemp, fs = s.fs;
    if (row.half < fs * 1.4) return;
    ctx.save();
    ctx.font = 'bold ' + (fs * 0.92) + 'px "Segoe UI", Arial, sans-serif';
    var r = fs * 0.28;
    var w = ctx.measureText(row.titre).width + fs * 1.5 + r * 2;
    var h = fs * 1.45;
    var y = row.y0 - row.half + 3 * s.lw;
    var x = s.plotX0 + s.plotW + 2 - w;
    ctx.fillStyle = PRIN_COL_BG;
    ctx.globalAlpha = 0.92;
    _prinRoundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = PRIN_COL_LABEL;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(row.titre, x + w - fs * 0.55 - r - fs * 0.35, y + h / 2 + 0.5);
    ctx.fillStyle = couleur;
    ctx.beginPath();
    ctx.arc(x + w - fs * 0.55, y + h / 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// Pastille ronde cerclée de blanc, posée sur une courbe
function _tempPastille(ctx, x, y, color) {
    var r = Math.max(5, simTemp.fs * 0.42);
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * simTemp.lw;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

// Pointillé vertical
function _tempPointille(ctx, x, yA, yB, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * simTemp.lw;
    ctx.setLineDash([5 * simTemp.lw, 4 * simTemp.lw]);
    ctx.beginPath();
    ctx.moveTo(x, yA);
    ctx.lineTo(x, yB);
    ctx.stroke();
    ctx.restore();
}

// Double flèche horizontale de xa à xb, libellé en cartouche. `posLabel` :
// 'sur' (centré sur le trait) ou 'dessous'. Trop courte pour loger ses deux
// pointes, la flèche les retourne à l'extérieur (usage des cotes).
function _tempDoubleFleche(ctx, xa, xb, y, label, color, posLabel) {
    var s = simTemp, fs = s.fs, lw = s.lw;
    var t = Math.max(4, Math.min(7 * lw, fs * 0.45));
    var long = t * 1.6;
    var L = xb - xa;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.8 * lw;
    if (L > 0.5) {
        var dedans = L >= long * 2.4;
        ctx.beginPath();
        ctx.moveTo(dedans ? xa : xa - long * 1.8, y);
        ctx.lineTo(dedans ? xb : xb + long * 1.8, y);
        ctx.stroke();
        var sens = dedans ? 1 : -1;
        [[xa, sens], [xb, -sens]].forEach(function (p) {
            ctx.beginPath();
            ctx.moveTo(p[0], y);
            ctx.lineTo(p[0] + p[1] * long, y - t * 0.7);
            ctx.lineTo(p[0] + p[1] * long, y + t * 0.7);
            ctx.closePath();
            ctx.fill();
        });
    }
    ctx.lineWidth = 1.2 * lw;
    ctx.beginPath();
    ctx.moveTo(xa, y - t); ctx.lineTo(xa, y + t);
    ctx.moveTo(xb, y - t); ctx.lineTo(xb, y + t);
    ctx.stroke();
    ctx.restore();

    var police = 'bold ' + (fs * 1.05) + 'px "Segoe UI", Arial, sans-serif';
    ctx.save();
    ctx.font = police;
    var wTxt = ctx.measureText(label).width;
    var padX = fs * 0.34, hP = fs * 1.20;
    var cx = (xa + xb) / 2, cy = (posLabel === 'dessous') ? y + t + hP * 0.6 : y;
    // Pas la place entre les pointes : libellé reporté à droite de la flèche
    if (posLabel !== 'dessous' && wTxt + padX * 2 > L - long * 2) {
        cx = xb + long * 1.8 + fs * 0.3 + wTxt / 2 + padX;
        if (cx + wTxt / 2 + padX > s.W - 2) cx = xa - long * 1.8 - fs * 0.3 - wTxt / 2 - padX;
    }
    ctx.fillStyle = PRIN_COL_BG;
    _prinRoundRect(ctx, cx - wTxt / 2 - padX, cy - hP / 2, wTxt + padX * 2, hP, hP * 0.28);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + 0.5);
    ctx.restore();
}

// ── Grandeurs remarquables ────────────────────────────────────────────
// Première crête de y₁ : t = T/4 (y₁ = A₁·sin). La crête correspondante de y₂
// est en T/4 + Δt. Si elle sort de la fenêtre, on remonte d'un nombre entier
// de périodes : la flèche montre alors Δt − k·T, et le dit.
function _tempCreteDt() {
    var s = simTemp, ta = s.T / 4;
    var k = Math.max(0, Math.ceil((ta + s.dt - TEMP_FENETRE_MS) / s.T - 1e-9));
    return { ta: ta, tb: ta + s.dt - k * s.T, k: k };
}

function _tempNature() {
    var s = simTemp, ratio = s.dt / s.T;
    var ecartEntier = Math.abs(ratio - Math.round(ratio));
    var ecartDemi   = Math.abs((ratio + 0.5) - Math.round(ratio + 0.5));
    if (ecartEntier < PRIN_TOL_RATIO)
        return { ratio: ratio, couleur: PRIN_COL_CONSTR, texte: 'Δt ≈ k·T → interférence constructive' };
    if (ecartDemi < PRIN_TOL_RATIO)
        return { ratio: ratio, couleur: PRIN_COL_DESTR, texte: 'Δt ≈ (k + ½)·T → interférence destructive' };
    return { ratio: ratio, couleur: '#5a6a78', texte: 'Cas intermédiaire' };
}

// ── Dessin complet ────────────────────────────────────────────────────
function drawTemporel() {
    var canvas = document.getElementById('temporel-canvas');
    var s = simTemp;
    if (!canvas || s.W < 10) return;
    var ctx = canvas.getContext('2d');
    var lw = s.lw;

    ctx.clearRect(0, 0, s.W, s.H);
    ctx.fillStyle = PRIN_COL_BG;
    ctx.fillRect(0, 0, s.W, s.H);

    var cols = [PRIN_COL_S1, PRIN_COL_S2, PRIN_COL_SOMME];
    var fys  = [_tempY1, _tempY2, function (t) { return _tempY1(t) + _tempY2(t); }];
    for (var r = 0; r < 3; r++) {
        var row = s.rows[r];
        _tempDrawBande(ctx, row);
        _tempDrawAxe(ctx, row, r === 2);
        _tempDrawEchelleY(ctx, row);
    }

    // Pointillés du décalage SOUS les courbes : ils relient deux crêtes
    var cr = null;
    if (s.showDt) {
        cr = _tempCreteDt();
        var r1 = s.rows[0], r2 = s.rows[1];
        var yF = r1.y0 + r1.half + s.gap12 / 2;
        _tempPointille(ctx, _tempXpx(cr.ta), r1.y0 - s.a1 * s.ampPx, yF, PRIN_COL_S1);
        _tempPointille(ctx, _tempXpx(cr.tb), r2.y0 - s.a2 * s.ampPx, yF, PRIN_COL_S2);
    }

    for (var c = 0; c < 3; c++) {
        _tempDrawCourbe(ctx, s.rows[c], fys[c], cols[c], (c === 2 ? 3 : 2.5) * lw, c === 2);
    }
    for (var p = 0; p < 3; p++) _tempDrawTitre(ctx, s.rows[p], cols[p]);

    // Pastilles repères du décalage, TOUJOURS visibles (option Δt ou non) :
    // la crête de y₁ en T/4 et la crête correspondante de y₂ — on suit ainsi
    // le glissement de y₂ en jouant sur Δt, même sans la double flèche.
    var crP = cr || _tempCreteDt();
    _tempPastille(ctx, _tempXpx(crP.ta), s.rows[0].y0 - s.a1 * s.ampPx, PRIN_COL_S1);
    _tempPastille(ctx, _tempXpx(crP.tb), s.rows[1].y0 - s.a2 * s.ampPx, PRIN_COL_S2);

    // Période : entre les deux premières crêtes de y₁, au niveau des crêtes
    if (s.showT) {
        var rT = s.rows[0];
        var yT = rT.y0 - s.a1 * s.ampPx;
        _tempDoubleFleche(ctx, _tempXpx(s.T / 4), _tempXpx(s.T / 4 + s.T), yT,
                          'T', TEMP_COL_T, 'dessous');
    }
    // Décalage : dans la gouttière entre y₁ et y₂
    if (cr) {
        var lbl = (cr.k === 0) ? 'Δt' : (cr.k === 1 ? 'Δt − T' : 'Δt − ' + cr.k + 'T');
        var yD = s.rows[0].y0 + s.rows[0].half + s.gap12 / 2;
        _tempDoubleFleche(ctx, _tempXpx(cr.ta), _tempXpx(cr.tb), yD, lbl, TEMP_COL_DT, 'sur');
    }
}

// ── Panneau ───────────────────────────────────────────────────────────
function _tempUpdateValeurs() {
    var s = simTemp, nat = _tempNature();
    var set = function (id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; };
    set('ro-temp-dt', formatFr(s.dt, 2));
    set('ro-temp-T', formatFr(s.T, 2));
    set('ro-temp-ratio', formatFr(nat.ratio, 2));
    var elN = document.getElementById('ro-temp-nature');
    if (elN) { elN.textContent = nat.texte; elN.style.color = nat.couleur; }
}

function _tempSetLabel(id, v) {
    var el = document.getElementById(id);
    if (el) el.textContent = formatFr(v, 2);
}

function _tempRefresh() {
    _tempUpdateValeurs();
    drawTemporel();
}

// Curseur Δt aimanté sur les multiples de T/2 (cas constructif / destructif).
// L'aimant ne joue qu'à la souris / au doigt : au clavier, chaque appui sur
// une flèche avance d'un pas (0,01 ms), plus petit que le rayon d'aimantation,
// et le curseur retomberait sans fin sur le même cran. Le dernier mode de
// saisie utilisé sur le curseur décide.
var _tempDtClavier = false;
(function () {
    var sl = document.getElementById('sl-dt-temp');
    if (!sl) return;
    sl.addEventListener('keydown',     function () { _tempDtClavier = true;  });
    sl.addEventListener('pointerdown', function () { _tempDtClavier = false; });
})();

function onSliderDtTemp(v) {
    var s = simTemp, dt = parseFloat(v);
    var demi = s.T / 2;
    var cible = Math.round(dt / demi) * demi;
    if (!_tempDtClavier &&
        Math.abs(dt - cible) < Math.min(0.1, s.T / 12) && cible <= TEMP_FENETRE_MS + 1e-9) {
        dt = cible;
        var sl = document.getElementById('sl-dt-temp');
        if (sl) sl.value = dt;
    }
    s.dt = dt;
    _tempSetLabel('lbl-dt-temp', dt);
    _tempRefresh();
}

function onSliderTTemp(v) {
    simTemp.T = parseFloat(v);
    _tempSetLabel('lbl-T-temp', simTemp.T);
    _tempRefresh();
}

function onSliderA1Temp(v) {
    simTemp.a1 = parseFloat(v);
    _tempSetLabel('lbl-a1-temp', simTemp.a1);
    drawTemporel();
}

function onSliderA2Temp(v) {
    simTemp.a2 = parseFloat(v);
    _tempSetLabel('lbl-a2-temp', simTemp.a2);
    drawTemporel();
}

function toggleTempOption(cle, btnId) {
    simTemp[cle] = !simTemp[cle];
    var btn = document.getElementById(btnId);
    if (btn) btn.classList.toggle('active', simTemp[cle]);
    drawTemporel();
}

// ── Bascule Spatiale / Temporelle ─────────────────────────────────────
// Échange la zone de tracé et les blocs du panneau ; la section
// « Représentation » est la seule commune. L'animation spatiale est gelée
// pendant la représentation temporelle (cf. tickPrincipe).
function setPrinVue(vue) {
    var temp = (vue === 'temporelle');
    simPrin.vue = temp ? 'temporelle' : 'spatiale';
    var aff = function (id, vis) { var el = document.getElementById(id); if (el) el.style.display = vis ? '' : 'none'; };
    aff('prin-scene-area', !temp);
    aff('prin-1d-blocks', !temp);
    aff('prin-temp-area', temp);
    aff('prin-temp-blocks', temp);
    var bS = document.getElementById('btn-vue-spat-prin');
    var bT = document.getElementById('btn-vue-temp-prin');
    if (bS) bS.classList.toggle('active', !temp);
    if (bT) bT.classList.toggle('active', temp);
    if (temp) { resizeTemporel(); _tempUpdateValeurs(); }
    else resizePrincipe();
}
