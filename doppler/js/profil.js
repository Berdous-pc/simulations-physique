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
var COL_ONDE    = '#2a6aaa';   // premier motif (celui qu'on suit), front, début du motif 2
var COL_ONDE_BG = '#7fa3c6';   // reste de la surface de l'eau
var COL_EMET    = '#2a8a50';   // émetteur, v_E·T_E, T_E
var COL_RECEP   = '#b04020';   // récepteur, T_R
var COL_LP      = '#b04020';   // λ′
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
  var f = borner(Math.min(w / 52, h / 21), 12, 24);
  var hFrise = 5.6 * f;                 // bande de la frise, en bas
  var hs = h - hFrise;                  // hauteur de la scène
  var s = w / SCENE_L;                  // px par cm
  var X = function (x) { return x * s; };

  var yL  = 1.6 * f;                    // cote λ (tirets)
  var yLp = yL + 2.2 * f;               // cote λ′ (rouge)
  var yRegle = hs - 1.7 * f;            // règle graduée
  var yVe = yRegle - 2.3 * f;           // cote v_E·T_E
  var yHaut = yLp + 1.0 * f;            // haut de la zone d'eau (étiquettes du front et du motif 2)
  var yFond = yVe - 0.9 * f;            // fond de l'eau
  var dispo = Math.max(10, yFond - yHaut);
  var A = borner(dispo * 0.2, 5, 2.2 * f);                   // amplitude à l'écran
  var y0 = yHaut + Math.max(2.1 * f + A, 0.38 * dispo);      // niveau de repos
  var r = 0.62 * f;                     // rayon des pastilles E et R

  // ── Grandeurs physiques de l'instant ────────────────────────────────
  var t = simD.t, TE = dopTE(), tc = Math.min(t, TE);
  var fige = t >= TE - 1e-9;            // le motif 2 commence : λ et v_E·T_E sont figées
  var xE0 = dopXE0(), xE = dopXE(t), vEs = dopVEs();
  var T1 = dopT1(), T2 = dopT2(), tFin = dopTFin();
  var xC1 = dopXRepere(0, t), xC2 = dopXRepere(1, t);   // front, début du motif 2
  // Émetteur et récepteur flottent à cheval sur la surface, qu'ils suivent
  var yE = y0 - A * Math.sin(2 * Math.PI * simD.fE * t);
  var yR = y0 - A * dopElongation(X_RECEPTEUR, t);

  // ── Eau et profil de l'onde ─────────────────────────────────────────
  var pas = 2, n = Math.floor(w / pas) + 1;
  var ys = new Float32Array(n), suivi = new Uint8Array(n), i, px;
  for (i = 0; i < n; i++) {
    var xi = (i * pas) / s, te = dopDateEmission(xi, t);
    ys[i] = y0 - A * dopElongation(xi, t);          // plat tant que le front n'est pas passé
    // premier motif émis vers le récepteur : entre les dates 0 et min(t, T_E)
    suivi[i] = (t > 0 && (xi - xE) >= -1e-9 && te >= -1e-9 && te <= tc + 1e-9) ? 1 : 0;
  }
  ctx.beginPath();
  ctx.moveTo(0, yFond);
  for (i = 0; i < n; i++) ctx.lineTo(i * pas, ys[i]);
  ctx.lineTo((n - 1) * pas, yFond);
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

  // Premier motif, du début du motif 2 (ou de l'émetteur) au front : c'est lui qu'on suit
  ctx.strokeStyle = COL_ONDE;
  ctx.lineWidth = Math.max(2.5, f * 0.2);
  ctx.beginPath();
  var enCours = false;
  for (i = 0; i < n; i++) {
    if (suivi[i]) {
      if (enCours) ctx.lineTo(i * pas, ys[i]); else { ctx.moveTo(i * pas, ys[i]); enCours = true; }
    } else enCours = false;
  }
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Fond de l'eau
  ctx.strokeStyle = '#c8c0b4';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, yFond); ctx.lineTo(w, yFond);
  ctx.stroke();

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

  // ── Points suivis (front, début du motif 2) : barres bleues et étiquettes ──
  var yBarreHaut = yLp - 0.35 * f;
  // cote : +1 étiquette à droite de la barre, −1 à gauche (les deux étiquettes
  // s'écartent l'une de l'autre et ne se chevauchent pas quand λ′ est petite)
  function barreRepere(xc, nom, cote) {
    if (xc === null || xc > SCENE_L + 0.01) return;
    ctx.strokeStyle = COL_ONDE;
    ctx.lineWidth = Math.max(2.5, f * 0.2);
    ctx.beginPath();
    ctx.moveTo(X(xc), yBarreHaut); ctx.lineTo(X(xc), yFond);
    ctx.stroke();
    texteIndices(ctx, nom, X(xc) + cote * 0.4 * f, yLp + 0.85 * f, f * 0.85, COL_ONDE,
                 cote > 0 ? 'left' : 'right', true);
  }
  if (t > 0) barreRepere(xC1, 'front', 1);
  barreRepere(xC2, 'motif 2', -1);

  // ── Cotes ───────────────────────────────────────────────────────────
  if (simD.showCotes && t > 0) {
    var pale = fige && t > TE + 1e-9;   // cotes figées, une fois le motif 2 commencé
    var tete = 0.7 * f;

    // λ = v·T_E : distance parcourue par le front depuis t = 0
    var xFinL = xE0 + V_ONDE * tc;
    ctx.save();
    ctx.globalAlpha = pale ? 0.45 : 1;
    _rappel(ctx, X(xE0), yL, y0, COL_TEXTE);
    _rappel(ctx, X(xFinL), yL, yBarreHaut, COL_TEXTE);
    fleche(ctx, X(xE0), X(xFinL), yL, { couleur: COL_TEXTE, epais: 1.5, tete: tete, tirets: [6, 4] });
    texteIndices(ctx, fige ? 'λ = v·T_{E}' : 'v·t', (X(xE0) + X(xFinL)) / 2, yL - 0.8 * f,
                 f, COL_TEXTE, 'center', true);
    ctx.restore();

    // v_E·T_E : déplacement de l'émetteur pendant ce temps
    if (simD.vE > 0) {
      var xFinE = dopXE(tc);
      ctx.save();
      ctx.globalAlpha = pale ? 0.45 : 1;
      _rappel(ctx, X(xE0), y0, yVe, COL_EMET);
      _rappel(ctx, X(xFinE), fige ? y0 : yE, yVe, COL_EMET);
      fleche(ctx, X(xE0), X(xFinE), yVe, { couleur: COL_EMET, epais: 2, tete: tete, double: true });
      texteIndices(ctx, fige ? 'v_{E}·T_{E}' : 'v_{E}·t', (X(xE0) + X(xFinE)) / 2, yVe + 0.95 * f,
                   f, COL_EMET, 'center', true);
      // Étiquettes des deux positions de l'émetteur, écrites vers l'extérieur de la cote
      var gauche = vEs > 0 ? 'right' : 'left', droite = vEs > 0 ? 'left' : 'right';
      var ecart = (vEs > 0 ? -1 : 1) * 0.45 * f;
      texteIndices(ctx, 'E à t = 0', X(xE0) + ecart, yVe, f * 0.8, COL_GRIS, gauche, false);
      if (fige) texteIndices(ctx, 'E à t = T_{E}', X(xFinE) - ecart, yVe, f * 0.8, COL_GRIS, droite, false);
      ctx.restore();
    }

    // λ′ : longueur du premier motif (du début du motif 2 au front), qui voyage ensuite avec lui
    if (fige && xC2 !== null && xC2 < SCENE_L) {
      var xFinLp = Math.min(xC1, SCENE_L), coupe = xC1 > SCENE_L;
      fleche(ctx, X(xC2), X(xFinLp), yLp,
             { couleur: COL_LP, epais: 2.5, tete: tete, double: true, sansPointeFin: coupe });
      texteIndices(ctx, 'λ′ = λ ' + (simD.sens > 0 ? '−' : '+') + ' v_{E}·T_{E}',
                   (X(xC2) + X(xFinLp)) / 2, yLp - 0.85 * f, f, COL_LP, 'center', true);
    }
  }

  // ── Émetteur (positions passées en pâle) et récepteur ───────────────
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
