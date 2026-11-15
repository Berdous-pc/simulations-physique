// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  profil.js — Rendu canvas de l'onglet Démonstration (vue de profil) et
//  frise des instants, que l'on fait glisser pour parcourir le temps.
//  Dépend de sim.js. Le rendu ne lit que simD : aucune mémoire d'une image
//  à l'autre.
// ══════════════════════════════════════════════════════════════════════

'use strict';

var cvProfil = null;
var ctxProfil = null;

// Couleurs (charte du site)
var COL_TEXTE   = '#2c3e50';
var COL_GRIS    = '#7a8a96';
var COL_ONDE    = '#2a6aaa';   // front, motifs impairs (1, 3…) et leurs points
var COL_MOTIF2  = '#c98a1a';   // motifs pairs (2, 4…) et leurs points
var COL_ONDE_BG = '#7fa3c6';   // reste de la surface de l'eau
var COL_EMET    = '#2a8a50';   // émetteur, v_E·T_E, T_E
var COL_RECEP   = '#b04020';   // récepteur, T_R
var COL_LP      = '#b04020';   // λ_R
var POLICE      = "'Segoe UI', Arial, sans-serif";

// Géométrie de la dernière image (lue par les interactions de la frise)
var _geo = null;

// ══════════════════════════════════════════════════════════════════════
//  Canvas
// ══════════════════════════════════════════════════════════════════════

// Dimensionne le canvas en pixels physiques (devicePixelRatio) et pose la
// transformation pour continuer à dessiner en pixels CSS.
// Renvoie false si le canvas est masqué (clientWidth nul) : rien à dessiner.
function sizeCanvas(canvas) {
  var dpr = window.devicePixelRatio || 1;
  var w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return false;
  var pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  return true;
}

// ══════════════════════════════════════════════════════════════════════
//  Utilitaires de tracé
// ══════════════════════════════════════════════════════════════════════

// Texte avec indices : « v_{E}·T_{E} » met E en indice.
// (x, y) : point d'ancrage, y au milieu de la ligne ; align : 'left' | 'center' | 'right'.
// Le texte est ramené dans [marge ; largeur − marge] s'il déborde du canvas.
// halo : liseré clair autour des lettres, pour un texte qui reste lisible quand
// un tracé passe derrière lui.
function texteIndices(ctx, str, x, y, taille, couleur, align, gras, halo) {
  var parts = str.split(/_\{([^}]*)\}/);
  var fN = (gras ? 'bold ' : '') + taille + 'px ' + POLICE;
  var fI = (gras ? 'bold ' : '') + (taille * 0.7) + 'px ' + POLICE;
  var larg = [], total = 0, i;
  for (i = 0; i < parts.length; i++) {
    ctx.font = (i % 2) ? fI : fN;
    larg[i] = ctx.measureText(parts[i]).width;
    total += larg[i];
  }
  var x0 = x;
  if (align === 'center') x0 = x - total / 2;
  else if (align === 'right') x0 = x - total;
  var wCanvas = ctx.canvas.clientWidth;
  x0 = borner(x0, 4, Math.max(4, wCanvas - 4 - total));

  ctx.fillStyle = couleur;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  var xc = x0, yb = y + taille * 0.35;
  for (i = 0; i < parts.length; i++) {
    ctx.font = (i % 2) ? fI : fN;
    var yt = (i % 2) ? yb + taille * 0.26 : yb;
    if (halo) {
      ctx.strokeStyle = 'rgba(250,247,240,0.92)';
      ctx.lineWidth = taille * 0.14;
      ctx.lineJoin = 'round';
      ctx.strokeText(parts[i], xc, yt);
    }
    ctx.fillText(parts[i], xc, yt);
    xc += larg[i];
  }
  return total;
}

// Pointe de flèche horizontale en (x, y), dirigée vers +x (dir = 1) ou −x (dir = −1)
function _pointe(ctx, x, y, dir, t) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - dir * t, y - t * 0.5);
  ctx.lineTo(x - dir * t, y + t * 0.5);
  ctx.closePath();
  ctx.fill();
}

// Flèche horizontale de x1 à x2. opts : couleur, epais, tete, double (deux pointes),
// tirets, sansPointeFin (extrémité coupée par le bord de la scène).
function fleche(ctx, x1, x2, y, opts) {
  var len = Math.abs(x2 - x1);
  if (len < 0.5) return;
  var dir = x2 > x1 ? 1 : -1;
  var tete = Math.min(opts.tete, opts.double ? len / 2 : len);
  ctx.save();
  ctx.strokeStyle = opts.couleur;
  ctx.fillStyle = opts.couleur;
  ctx.lineWidth = opts.epais;
  if (opts.tirets) ctx.setLineDash(opts.tirets);
  ctx.beginPath();
  ctx.moveTo(x1 + (opts.double ? dir * tete * 0.8 : 0), y);
  ctx.lineTo(x2 - (opts.sansPointeFin ? 0 : dir * tete * 0.8), y);
  ctx.stroke();
  ctx.setLineDash([]);
  if (!opts.sansPointeFin) _pointe(ctx, x2, y, dir, tete);
  if (opts.double) _pointe(ctx, x1, y, -dir, tete);
  ctx.restore();
}

// Trait vertical fin en pointillés (ligne de rappel)
function _rappel(ctx, x, y1, y2, couleur) {
  ctx.save();
  ctx.strokeStyle = couleur;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x, y1);
  ctx.lineTo(x, y2);
  ctx.stroke();
  ctx.restore();
}

// Disque portant une lettre (émetteur E, récepteur R : flotteurs centrés sur la surface)
function _pastille(ctx, x, y, r, couleur, lettre, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = couleur;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fill();
  if (lettre) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (r * 1.25) + 'px ' + POLICE;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lettre, x, y + r * 0.06);
  }
  ctx.restore();
}

// Voile d'eau sur la moitié basse d'un flotteur centré en (x, y) : il paraît
// à moitié immergé, la ligne d'eau passant par son centre.
function _immerger(ctx, x, y, r) {
  ctx.save();
  ctx.fillStyle = 'rgba(214,230,244,0.55)';
  ctx.beginPath();
  ctx.arc(x, y, r + 0.5, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Anneau qui s'élargit en s'effaçant : signale une émission ou une réception.
// p : avancement de 0 à 1.
function _eclat(ctx, x, y, r, couleur, p) {
  if (p < 0 || p >= 1) return;
  ctx.save();
  ctx.globalAlpha = 1 - p;
  ctx.strokeStyle = couleur;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, r * (1.2 + 1.8 * p), 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════
//  Rendu de la scène
// ══════════════════════════════════════════════════════════════════════

function dessinerProfil() {
  var cv = cvProfil, ctx = ctxProfil;
  if (!cv) return;
  var w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  ctx.clearRect(0, 0, w, h);

  // ── Mise en page : tout se déduit de la taille de police f ──────────
  // De haut en bas : bande témoin (émetteur immobile), barre empilée des
  // longueurs, bande de l'émetteur en mouvement, cote v_E·T_E, règle, frise.
  var f = borner(Math.min(w / 52, h / 26), 12, 24);
  var hFrise = 5.6 * f;                 // bande de la frise, en bas
  var hs = h - hFrise;                  // hauteur de la scène
  var s = w / SCENE_L;                  // px par cm
  var X = function (x) { return x * s; };

  var yRegle = hs - 1.7 * f;            // règle graduée
  var yVe = yRegle - 2.3 * f;           // cote v_E·T_E (au sol, sous la bande mobile)
  var yFond = yVe - 0.9 * f;            // fond de la bande mobile
  // Chaque bande : 0,6 f au-dessus des crêtes et sous les creux ; la bande
  // mobile garde 0,7 f de plus en haut pour l'étiquette « motif 2 »
  var A = borner((hs - 13.35 * f) / 4, 5, 2.2 * f); // amplitude à l'écran
  var yLblT = 0.9 * f;                  // ligne du titre de la bande témoin
  var yT0 = 1.6 * f;                    // haut de la bande témoin
  var y0T = yT0 + 0.6 * f + A;          // niveau de repos, bande témoin
  var yFondT = y0T + A + 0.6 * f;       // fond de la bande témoin
  var yB1 = yFondT + 1.5 * f;           // barre empilée, ligne 1 (λ_E)
  var yB2 = yB1 + 0.75 * f;             // barre empilée, ligne 2 (λ_R)
  var yLblM = yB2 + 0.9 * f;            // ligne du titre de la bande mobile
  var y0 = yFond - 0.6 * f - A;         // niveau de repos, bande mobile
  var r = 0.62 * f;                     // rayon des pastilles E et R

  // ── Grandeurs physiques de l'instant ────────────────────────────────
  var t = simD.t, TE = dopTE(), tc = Math.min(t, TE);
  var fige = t >= TE - 1e-9;            // le motif 2 commence : λ_E, λ_R et v_E·T_E sont figées
  var xE0 = dopXE0(), xE = dopXE(t), vEs = dopVEs();
  var T1 = dopT1(), T2 = dopT2(), tFin = dopTFin();
  var xF = xE0 + V_ONDE * t;            // front de l'onde : le même dans les deux bandes
  var xC2 = dopXRepere(1, t);           // début du motif 2, bande mobile
  var phase = 2 * Math.PI * simD.fE;
  var elong = function (x, vE) {        // élongation en x pour un émetteur de vitesse vE
    var te = dopDateEmissionV(x, t, vE);
    return te > 0 ? Math.sin(phase * te) : 0;
  };
  // Émetteurs et récepteurs flottent à cheval sur la surface, qu'ils suivent
  var dyE = A * Math.sin(phase * t);
  var yE = y0 - dyE, yET = y0T - dyE;
  var yR = y0 - A * elong(X_RECEPTEUR, vEs), yRT = y0T - A * elong(X_RECEPTEUR, 0);

  var coulMotif = function (m) { return (m % 2) ? COL_MOTIF2 : COL_ONDE; };

  // ── Une bande d'eau : profil de l'onde, motifs colorés, points, marques ──
  // y0b : niveau de repos ; yFondB : fond ; vE : vitesse algébrique de l'émetteur
  function dessinerBande(y0b, yFondB, vE) {
    var xEb = xE0 + vE * t;
    var pas = 2, n = Math.floor(w / pas) + 1;
    var ys = new Float32Array(n), mo = new Int16Array(n), i, k;
    for (i = 0; i < n; i++) {
      var xi = (i * pas) / s, te = dopDateEmissionV(xi, t, vE);
      ys[i] = y0b - A * (te > 0 ? Math.sin(phase * te) : 0);   // plat tant que le front n'est pas passé
      // numéro du motif (0 : premier), côté récepteur seulement ; −1 ailleurs
      mo[i] = (t > 0 && xi >= xEb - 1e-9 && te >= -1e-9) ? Math.max(0, Math.floor(te / TE + 1e-9)) : -1;
    }
    ctx.beginPath();
    ctx.moveTo(0, yFondB);
    for (i = 0; i < n; i++) ctx.lineTo(i * pas, ys[i]);
    ctx.lineTo((n - 1) * pas, yFondB);
    ctx.closePath();
    ctx.fillStyle = 'rgba(42,106,170,0.10)';
    ctx.fill();

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = COL_ONDE_BG;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (i = 0; i < n; i++) { if (i) ctx.lineTo(i * pas, ys[i]); else ctx.moveTo(0, ys[0]); }
    ctx.stroke();

    // Motifs émis vers le récepteur, de couleur alternée : trait fin sous les
    // points, trait épais quand les points sont masqués
    ctx.lineWidth = simD.showPoints ? 2 : Math.max(3, f * 0.22);
    var cur = -1;
    for (i = 0; i < n; i++) {
      if (mo[i] !== cur) {
        if (cur >= 0) { ctx.lineTo(i * pas, ys[i]); ctx.stroke(); }
        cur = mo[i];
        if (cur >= 0) {
          ctx.strokeStyle = coulMotif(cur);
          ctx.beginPath();
          ctx.moveTo(i * pas, ys[i]);
        }
      } else if (cur >= 0) ctx.lineTo(i * pas, ys[i]);
    }
    if (cur >= 0) ctx.stroke();
    ctx.lineCap = 'butt';

    // Fond de l'eau
    ctx.strokeStyle = '#c8c0b4';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, yFondB); ctx.lineTo(w, yFondB);
    ctx.stroke();

    if (!simD.showPoints || t <= 0) return;

    // Points déposés par l'émetteur tous les T_E / N_POINTS, à sa hauteur du
    // moment ; chacun file ensuite à la célérité c. Début de motif : gros point.
    var dtp = TE / N_POINTS, kmax = Math.floor(t / dtp + 1e-9);
    var ecart = (V_ONDE - vE) * dtp * s;                       // px entre deux points
    var rMin = Math.min(0.2 * f, Math.max(1.5, 0.4 * ecart)), rMaj = 0.34 * f;

    // Marques au sol : où se trouvait l'émetteur à chaque dépôt
    ctx.strokeStyle = COL_EMET;
    for (k = 0; k <= kmax; k++) {
      var majM = (k % N_POINTS === 0), xm = X(xE0 + vE * k * dtp);
      ctx.lineWidth = majM ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(xm, yFondB); ctx.lineTo(xm, yFondB - (majM ? 0.6 : 0.32) * f);
      ctx.stroke();
    }

    for (k = kmax; k >= 0; k--) {
      var tk = k * dtp, xk = xE0 + vE * tk + V_ONDE * (t - tk);
      if (xk > SCENE_L + 1) continue;
      var maj = (k % N_POINTS === 0);
      ctx.fillStyle = coulMotif(Math.floor(k / N_POINTS));
      ctx.beginPath();
      ctx.arc(X(xk), y0b - A * Math.sin(2 * Math.PI * k / N_POINTS), maj ? rMaj : rMin, 0, 2 * Math.PI);
      ctx.fill();
      if (maj) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  dessinerBande(y0T, yFondT, 0);
  dessinerBande(y0, yFond, vEs);

  texteIndices(ctx, 'Émetteur immobile (témoin)', 0.6 * f, yLblT, f * 0.85, COL_GRIS, 'left', true);
  texteIndices(ctx, 'Émetteur en mouvement', 0.6 * f, yLblM, f * 0.85, COL_GRIS, 'left', true);

  // ── Règle graduée (cm) ──────────────────────────────────────────────
  var fRegle = Math.max(11, f * 0.8);
  ctx.strokeStyle = COL_GRIS;
  ctx.fillStyle = COL_GRIS;
  ctx.lineWidth = 1;
  ctx.font = fRegle + 'px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.beginPath();
  ctx.moveTo(0, yRegle); ctx.lineTo(w, yRegle);
  for (var xg = 0; xg <= SCENE_L; xg += 5) {
    var ht = (xg % 10 === 0) ? f * 0.45 : f * 0.25;
    ctx.moveTo(X(xg), yRegle); ctx.lineTo(X(xg), yRegle + ht);
  }
  ctx.stroke();
  for (xg = 20; xg < SCENE_L; xg += 20) ctx.fillText(String(xg), X(xg), yRegle + f * 0.55);
  ctx.textAlign = 'right';
  ctx.fillText('cm', w - 4, yRegle + f * 0.55);

  // ── Front de l'onde : une seule barre, commune aux deux bandes ──────
  if (t > 0 && xF <= SCENE_L + 0.01) {
    ctx.strokeStyle = COL_ONDE;
    ctx.lineWidth = Math.max(2.5, f * 0.2);
    ctx.beginPath();
    ctx.moveTo(X(xF), yLblT - 0.5 * f); ctx.lineTo(X(xF), yFond);
    ctx.stroke();
    texteIndices(ctx, 'front', X(xF) + 0.4 * f, yLblT, f * 0.85, COL_ONDE, 'left', true);
  }
  // Début du motif 2 (bande mobile) : étiquette au-dessus du gros point
  if (xC2 !== null && xC2 <= SCENE_L + 0.01 && t > TE + 1e-9) {
    texteIndices(ctx, 'motif 2', X(xC2) - 0.3 * f, y0 - A - 0.65 * f, f * 0.8, COL_MOTIF2, 'right', true, true);
  }

  // ── Cotes ───────────────────────────────────────────────────────────
  if (simD.showCotes && t > 0) {
    var pale = fige && t > TE + 1e-9;   // cote au sol figée, une fois le motif 2 commencé
    var tete = 0.7 * f;
    var hb = 0.42 * f;                  // épaisseur des barres

    // Barre empilée, qui voyage avec le premier motif. Les deux premiers motifs
    // finissent au même front ; ils commencent en xa (témoin) et en xb (mobile).
    var xa = xF - V_ONDE * tc;                 // = x_E0 jusqu'à T_E
    var xb = xF - (V_ONDE - vEs) * tc;         // = x_E(t) jusqu'à T_E
    var barre = function (x1, x2, y, coul) {
      ctx.fillStyle = coul;
      ctx.fillRect(X(Math.min(x1, x2)), y - hb / 2, Math.abs(X(x2) - X(x1)), hb);
    };
    var largeur = function (str, taille) {     // largeur d'un texte à indices, en gras
      var parts = str.split(/_\{([^}]*)\}/), tot = 0;
      for (var q = 0; q < parts.length; q++) {
        ctx.font = 'bold ' + ((q % 2) ? taille * 0.7 : taille) + 'px ' + POLICE;
        tot += ctx.measureText(parts[q]).width;
      }
      return tot;
    };
    // Libellé centré sur la partie visible de la barre : version longue si elle
    // tient, sinon version courte ('' : rien)
    var libelle = function (long, court, x1, x2, y, coul) {
      var xg2 = Math.min(x1, x2), xd2 = Math.min(Math.max(x1, x2), SCENE_L);
      var place = (xd2 - xg2) * s - 0.3 * f;
      if (place <= 0) return;
      var txt = largeur(long, f) <= place ? long : court;
      if (!txt) return;
      texteIndices(ctx, txt, (X(xg2) + X(xd2)) / 2, y, f, coul, 'center', true, true);
    };

    _rappel(ctx, X(xa), y0T, yB2 + hb / 2, COL_GRIS);
    _rappel(ctx, X(xb), yB1 - hb / 2, y0, COL_GRIS);

    // Ligne 1 : λ_E = c·T_E, distance parcourue par le front depuis t = 0
    barre(xa, xF, yB1, COL_TEXTE);
    libelle(fige ? 'λ_{E} = c·T_{E}' : 'c·t', fige ? 'λ_{E}' : 'c·t', xa, xF, yB1 - 0.85 * f, COL_TEXTE);

    // Ligne 2 : λ_R, longueur du premier motif de l'émetteur en mouvement
    barre(xb, xF, yB2, COL_LP);
    if (fige) {
      libelle('λ_{R} = λ_{E} ' + (simD.sens > 0 ? '−' : '+') + ' v_{E}·T_{E}', 'λ_{R}',
              xb, xF, yB2 + 0.9 * f, COL_LP);
    }

    // v_E·T_E : l'écart entre les deux débuts de motif. Il complète λ_R quand
    // l'émetteur se rapproche (ligne 2), λ_E quand il s'éloigne (ligne 1).
    if (simD.vE > 0) {
      var enBas = vEs > 0;
      barre(xa, xb, enBas ? yB2 : yB1, COL_EMET);
      libelle(fige ? 'v_{E}·T_{E}' : 'v_{E}·t', '', xa, xb,
              enBas ? yB2 + 0.9 * f : yB1 - 0.85 * f, COL_EMET);
    }

    // Au sol : déplacement de l'émetteur pendant la première période
    if (simD.vE > 0) {
      var xFinE = dopXE(tc);
      ctx.save();
      ctx.globalAlpha = pale ? 0.45 : 1;
      _rappel(ctx, X(xE0), yFond, yVe, COL_EMET);
      _rappel(ctx, X(xFinE), yFond, yVe, COL_EMET);
      fleche(ctx, X(xE0), X(xFinE), yVe, { couleur: COL_EMET, epais: 2, tete: tete, double: true });
      texteIndices(ctx, fige ? 'v_{E}·T_{E}' : 'v_{E}·t', (X(xE0) + X(xFinE)) / 2, yVe + 0.95 * f,
                   f, COL_EMET, 'center', true);
      // Étiquettes des deux positions de l'émetteur, écrites vers l'extérieur de la cote
      var gauche = vEs > 0 ? 'right' : 'left', droite = vEs > 0 ? 'left' : 'right';
      var ecartE = (vEs > 0 ? -1 : 1) * 0.45 * f;
      texteIndices(ctx, 'E à t = 0', X(xE0) + ecartE, yVe, f * 0.8, COL_GRIS, gauche, false);
      if (fige) texteIndices(ctx, 'E à t = T_{E}', X(xFinE) - ecartE, yVe, f * 0.8, COL_GRIS, droite, false);
      ctx.restore();
    }
  }

  // ── Émetteurs (positions passées en pâle) et récepteurs ─────────────
  // À t = 0 et à t = T_E l'émetteur est à l'altitude 0 (début d'un motif)
  if (t > 0) _pastille(ctx, X(xE0), y0, r, COL_EMET, '', 0.3);
  if (t > TE + 1e-9) _pastille(ctx, X(dopXE(TE)), y0, r, COL_EMET, '', 0.3);

  _eclat(ctx, X(xE0), y0, r, COL_EMET, t / (0.35 * TE));
  _eclat(ctx, X(dopXE(TE)), y0, r, COL_EMET, (t - TE) / (0.35 * TE));
  _eclat(ctx, X(X_RECEPTEUR), y0, r, COL_RECEP, (t - T1) / (0.35 * TE));
  _eclat(ctx, X(X_RECEPTEUR), y0, r, COL_RECEP, (t - T2) / (0.35 * TE));

  // Vecteur vitesse de l'émetteur, solidaire du flotteur ; étiquette à liseré
  // clair : la barre du front et la vague passent derrière elle au début
  if (simD.vE > 0) {
    var lv = (0.8 + 2.4 * simD.vE / VE_MAX) * f, sg = simD.sens;
    fleche(ctx, X(xE) + sg * r, X(xE) + sg * (r + lv), yE,
           { couleur: COL_EMET, epais: 2.5, tete: 0.6 * f });
    texteIndices(ctx, 'v_{E}', X(xE) + sg * (r + lv + 0.3 * f), yE, f * 0.85, COL_EMET,
                 sg > 0 ? 'left' : 'right', true, true);
  }
  // Bande témoin : émetteur immobile, récepteur en retrait (il ne sert qu'à comparer)
  _pastille(ctx, X(xE0), yET, r, COL_EMET, 'E', 1);
  _pastille(ctx, X(X_RECEPTEUR), yRT, r, COL_RECEP, 'R', 0.55);
  _immerger(ctx, X(xE0), yET, r);
  _immerger(ctx, X(X_RECEPTEUR), yRT, r);
  // Bande mobile
  _pastille(ctx, X(xE), yE, r, COL_EMET, 'E', 1);
  _pastille(ctx, X(X_RECEPTEUR), yR, r, COL_RECEP, 'R', 1);
  _immerger(ctx, X(xE), yE, r);
  _immerger(ctx, X(X_RECEPTEUR), yR, r);

  // ── Frise des instants ──────────────────────────────────────────────
  var yAx = h - 2.9 * f;
  var fF = f * 0.85;
  ctx.font = 'bold ' + fF + 'px ' + POLICE;
  var xs0 = 0.8 * f + ctx.measureText('Réceptions').width + 1.2 * f;
  var xs1 = w - 1.6 * f;
  var TX = function (tt) { return xs0 + (tt / tFin) * (xs1 - xs0); };
  _geo = { hs: hs, xs0: xs0, xs1: xs1, tFin: tFin };

  ctx.strokeStyle = '#c8c0b4';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, hs); ctx.lineTo(w, hs);
  ctx.stroke();

  texteIndices(ctx, 'Émissions', 0.8 * f, yAx - 1.0 * f, fF, COL_EMET, 'left', true);
  texteIndices(ctx, 'Réceptions', 0.8 * f, yAx + 1.0 * f, fF, COL_RECEP, 'left', true);

  // Axe du temps, partie écoulée en bleu
  ctx.strokeStyle = COL_GRIS;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(xs0, yAx); ctx.lineTo(xs1, yAx);
  ctx.stroke();
  ctx.strokeStyle = COL_ONDE;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(xs0, yAx); ctx.lineTo(TX(t), yAx);
  ctx.stroke();

  // Repère d'un instant clé : plein s'il est atteint, creux sinon
  function repere(tt, cote, couleur) {
    var atteint = t >= tt - 1e-9;
    var yy = yAx + cote * 1.0 * f;
    ctx.save();
    ctx.globalAlpha = atteint ? 1 : 0.4;
    ctx.strokeStyle = couleur;
    ctx.fillStyle = atteint ? couleur : '#fdf8f0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(TX(tt), yAx); ctx.lineTo(TX(tt), yy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(TX(tt), yy, 0.3 * f, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  repere(0, -1, COL_EMET);
  repere(TE, -1, COL_EMET);
  repere(T1, 1, COL_RECEP);
  repere(T2, 1, COL_RECEP);

  // Durées T_E (entre les émissions) et T_R (entre les réceptions)
  function duree(ta, tb, cote, couleur, texte) {
    var yy = yAx + cote * 1.0 * f;
    ctx.strokeStyle = couleur;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(TX(ta), yy); ctx.lineTo(TX(tb), yy);
    ctx.stroke();
    texteIndices(ctx, texte, (TX(ta) + TX(tb)) / 2, yy + cote * 0.95 * f, fF, couleur, 'center', true);
  }
  if (fige) duree(0, TE, -1, COL_EMET, 'T_{E} = ' + fmtFR(TE, 2) + ' s');
  if (t >= T2 - 1e-9) duree(T1, T2, 1, COL_RECEP, 'T_{R} = ' + fmtFR(dopTR(), 2) + ' s');

  // Curseur du temps (poignée à faire glisser)
  ctx.strokeStyle = COL_ONDE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(TX(t), yAx - 1.5 * f); ctx.lineTo(TX(t), yAx + 1.5 * f);
  ctx.stroke();
  ctx.fillStyle = COL_ONDE;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(TX(t), yAx, 0.45 * f, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
}

// ══════════════════════════════════════════════════════════════════════
//  Interactions : glisser sur la frise pour parcourir le temps
// ══════════════════════════════════════════════════════════════════════

var _glisseFrise = false;

// Date correspondant à l'abscisse px de la frise, aimantée sur les instants clés
function _dateFrise(px) {
  var g = _geo;
  var t = borner((px - g.xs0) / (g.xs1 - g.xs0), 0, 1) * g.tFin;
  var cles = dopCles(), pxParS = (g.xs1 - g.xs0) / g.tFin;
  for (var i = 0; i < cles.length; i++) {
    if (Math.abs(t - cles[i]) * pxParS < 7) return cles[i];
  }
  return t;
}

function initInteractionsProfil() {
  var cv = cvProfil;

  function pos(e) {
    var b = cv.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  }

  cv.addEventListener('pointerdown', function (e) {
    var p = pos(e);
    if (!_geo || p.y < _geo.hs) return;
    _glisseFrise = true;
    cv.setPointerCapture(e.pointerId);
    allerA(_dateFrise(p.x));           // ui.js : met en pause et place le temps
  });

  cv.addEventListener('pointermove', function (e) {
    var p = pos(e);
    if (_glisseFrise) { allerA(_dateFrise(p.x)); return; }
    cv.style.cursor = (_geo && p.y >= _geo.hs) ? 'ew-resize' : 'default';
  });

  function fin() { _glisseFrise = false; }
  cv.addEventListener('pointerup', fin);
  cv.addEventListener('pointercancel', fin);
}
