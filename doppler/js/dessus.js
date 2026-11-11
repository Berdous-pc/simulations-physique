// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  dessus.js — Onglet Vue de dessus (2D) : état, modèle, rendu, écrans
//  d'oscilloscope et interactions. AUTONOME : il ne partage avec l'onglet
//  Démonstration que les utilitaires (fmtFR, borner : sim.js ; sizeCanvas,
//  texteIndices, fleche, couleurs : profil.js).
//  Onde sonore vue de dessus, fortement ralentie. Unités : m, s, Hz.
//  Chargé après profil.js, avant ui.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Constantes ────────────────────────────────────────────────────────
var VD_LARGEUR      = 12;     // largeur de la scène (m) ; la hauteur suit le canvas
var VD_MARGE        = 0.35;   // E et R restent à cette distance des bords (m)
var VD_PAS_PAR_T    = 120;    // pas de calcul par période émise (f_R peut valoir 10 f_E)
var VD_PAS_MAX      = 80;     // pas de calcul par image, au plus
var VD_FENETRE_T    = 5;      // les oscilloscopes montrent 5 périodes d'émission
var VD_TRACE_DUREE  = 0.03;   // durée de signal conservée (s) : 5 périodes à 200 Hz + marge
var VD_FLECHE_C     = 0.9;    // longueur (m) du vecteur vitesse d'un objet allant à c
var VD_V_GLISSER    = 0.4;    // objet immobile tiré à la souris : il suit à 0,4 c

var VD_COL_SCOPE_BG   = '#0f1720';
var VD_COL_SCOPE_GRID = 'rgba(160,190,220,0.16)';
var VD_COL_SCOPE_AXE  = 'rgba(190,210,230,0.55)';
var VD_COL_SCOPE_TXT  = '#aebccb';
var VD_COL_SCOPE_E    = '#5fe08a';   // trace du signal émis (vert de l'émetteur, éclairci)
var VD_COL_SCOPE_R    = '#ff9a6e';   // trace du signal reçu (terracotta du récepteur, éclairci)

// ── État ──────────────────────────────────────────────────────────────
var simV = {
  t: 0,               // date simulée (s)
  phase: 0,           // phase de l'émetteur (rad) ; signal émis = sin(phase)
  lecture: false,
  ralenti: 4,         // millisecondes simulées par seconde réelle
  c: 340,             // célérité de l'onde (m/s)
  fE: 500,            // fréquence d'émission (Hz)
  // Objets : position (m, y = 0 au milieu de la scène), vitesse (m/s), direction (rad),
  // cible = point visé pendant qu'on les tire à la souris (null sinon)
  E: { x: 3, y: 0,   v: 100, dir: 0,       cible: null },
  R: { x: 9, y: 1.1, v: 0,   dir: Math.PI, cible: null },
  showCentres: true,  // points d'émission des crêtes visibles
  scopeE: false,      // écran d'oscilloscope de l'émetteur affiché
  scopeR: false,
  fR: NaN             // fréquence reçue instantanée lissée (NaN : indéfinie)
};

// Historique de l'émetteur : un échantillon par pas de calcul.
// saut = 1 : l'émetteur a été déplacé à l'arrêt, le segment qui y mène n'est pas un trajet.
var _vdH = { t: [], x: [], y: [], p: [], saut: [] };
// Crêtes : cercles centrés là où se trouvait l'émetteur quand sa phase valait π/2 + 2kπ
var _vdCretes = [];                       // { t, x, y }
// Signaux enregistrés pour les oscilloscopes
var _vdTrace = { t: [], e: [], r: [] };
var _vdPhiRetPrec = NaN, _vdTPrec = 0;    // phase retardée au pas précédent (mesure de f_R)

var cvDessus = null, ctxDessus = null;
var _vdGeo = null;                        // géométrie de la dernière image
var _vdRaf = null, _vdDernierTs = 0, _vdDernierReadout = 0;

// ══════════════════════════════════════════════════════════════════════
//  Modèle
// ══════════════════════════════════════════════════════════════════════

function _vdHauteur() { return _vdGeo ? _vdGeo.Hm : VD_LARGEUR * 0.6; }

// Amplitude reçue à la distance r de son point d'émission (décroissance douce)
function _vdAmp(r) { return 1 / Math.sqrt(1 + r); }

function vdRaz() {
  vdArreter();
  simV.t = 0; simV.phase = 0; simV.fR = NaN;
  simV.E.x = 3; simV.E.y = 0;   simV.E.dir = 0;       simV.E.cible = null;
  simV.R.x = 9; simV.R.y = 1.1; simV.R.dir = Math.PI; simV.R.cible = null;
  _vdH = { t: [], x: [], y: [], p: [], saut: [] };
  _vdCretes = [];
  _vdTrace = { t: [], e: [], r: [] };
  _vdPhiRetPrec = NaN;
  _vdBorner(simV.E); _vdBorner(simV.R);
  _vdMajValeurs();
  dessinerDessus();
}

function _vdBorner(o) {
  var hy = _vdHauteur() / 2 - VD_MARGE;
  o.x = borner(o.x, VD_MARGE, VD_LARGEUR - VD_MARGE);
  o.y = borner(o.y, -hy, hy);
}

// Déplace un objet pendant h secondes : vers le pointeur s'il est tiré à la
// souris (à sa vitesse réglée, donc sans téléportation), sinon en ligne droite
// avec rebond sur les bords de la scène.
function _vdDeplacer(o, h) {
  if (o.cible) {
    var dx = o.cible.x - o.x, dy = o.cible.y - o.y, d = Math.sqrt(dx * dx + dy * dy);
    var pas = (o.v > 0 ? o.v : VD_V_GLISSER * simV.c) * h;
    if (d <= pas) { o.x = o.cible.x; o.y = o.cible.y; }
    else { o.x += dx / d * pas; o.y += dy / d * pas; }
    _vdBorner(o);
    return;
  }
  if (o.v <= 0) return;
  var hy = _vdHauteur() / 2 - VD_MARGE;
  o.x += o.v * Math.cos(o.dir) * h;
  o.y += o.v * Math.sin(o.dir) * h;
  if (o.x < VD_MARGE)              { o.x = 2 * VD_MARGE - o.x;                o.dir = Math.PI - o.dir; }
  if (o.x > VD_LARGEUR - VD_MARGE) { o.x = 2 * (VD_LARGEUR - VD_MARGE) - o.x; o.dir = Math.PI - o.dir; }
  if (o.y < -hy)                   { o.y = -2 * hy - o.y;                     o.dir = -o.dir; }
  if (o.y > hy)                    { o.y = 2 * hy - o.y;                      o.dir = -o.dir; }
  _vdBorner(o);
}

function _vdPousserHistorique(saut) {
  _vdH.t.push(simV.t); _vdH.x.push(simV.E.x); _vdH.y.push(simV.E.y);
  _vdH.p.push(simV.phase); _vdH.saut.push(saut ? 1 : 0);
}

// Signal reçu en (px, py) à la date courante : somme des contributions émises
// aux dates τ telles que c·(t − τ) = distance au point d'émission (une seule
// tant que l'émetteur est subsonique, plusieurs possibles au-delà).
// Renvoie { val, n, phi } : valeur, nombre de contributions, phase de la plus récente.
var _vdRes = { val: 0, n: 0, phi: 0 };
function _vdSignalRecu(px, py) {
  var H = _vdH, t = simV.t, c = simV.c, n = H.t.length;
  var val = 0, nb = 0, phi = 0;
  var dx = px - H.x[n - 1], dy = py - H.y[n - 1];
  var gSuiv = c * (t - H.t[n - 1]) - Math.sqrt(dx * dx + dy * dy), g;
  for (var i = n - 2; i >= 0; i--) {
    dx = px - H.x[i]; dy = py - H.y[i];
    g = c * (t - H.t[i]) - Math.sqrt(dx * dx + dy * dy);
    if (!H.saut[i + 1] && ((g >= 0 && gSuiv < 0) || (g < 0 && gSuiv >= 0))) {
      var u = g / (g - gSuiv);                         // racine entre i et i + 1
      var ph = H.p[i] + u * (H.p[i + 1] - H.p[i]);
      var tau = H.t[i] + u * (H.t[i + 1] - H.t[i]);
      val += _vdAmp(c * (t - tau)) * Math.sin(ph);
      if (nb === 0) phi = ph;
      nb++;
    }
    gSuiv = g;
  }
  _vdRes.val = val; _vdRes.n = nb; _vdRes.phi = phi;
  return _vdRes;
}

// Avance la simulation de dt secondes simulées
function vdAvancer(dt) {
  var TE = 1 / simV.fE;
  var n = Math.min(VD_PAS_MAX, Math.max(1, Math.ceil(dt / (TE / VD_PAS_PAR_T))));
  var h = dt / n, deuxPi = 2 * Math.PI;
  if (_vdH.t.length === 0) _vdPousserHistorique(false);

  for (var k = 0; k < n; k++) {
    _vdDeplacer(simV.E, h);
    _vdDeplacer(simV.R, h);
    var kAvant = Math.floor((simV.phase - Math.PI / 2) / deuxPi);
    simV.t += h;
    simV.phase += deuxPi * simV.fE * h;
    if (Math.floor((simV.phase - Math.PI / 2) / deuxPi) > kAvant) {
      _vdCretes.push({ t: simV.t, x: simV.E.x, y: simV.E.y });     // l'émetteur est en haut
    }
    _vdPousserHistorique(false);

    var res = _vdSignalRecu(simV.R.x, simV.R.y);
    _vdTrace.t.push(simV.t); _vdTrace.e.push(Math.sin(simV.phase)); _vdTrace.r.push(res.val);

    // Fréquence reçue : vitesse de variation de la phase reçue (une seule contribution)
    if (res.n === 1) {
      if (!isNaN(_vdPhiRetPrec)) {
        var fInst = (res.phi - _vdPhiRetPrec) / (deuxPi * (simV.t - _vdTPrec));
        simV.fR = isNaN(simV.fR) ? fInst : simV.fR + 0.08 * (fInst - simV.fR);
      }
      _vdPhiRetPrec = res.phi; _vdTPrec = simV.t;
    } else {
      _vdPhiRetPrec = NaN; simV.fR = NaN;
    }
  }
  _vdElaguer();
}

// Oublie ce qui ne peut plus servir : émissions plus vieilles que la traversée
// de la scène (E et R y restent, donc c·(t − τ) ≤ diagonale), signal sorti des écrans.
function _vdElaguer() {
  var Hm = _vdHauteur();
  var diag = Math.sqrt(VD_LARGEUR * VD_LARGEUR + Hm * Hm);
  var tMin = simV.t - 1.05 * diag / simV.c, i = 0;
  while (i < _vdH.t.length - 2 && _vdH.t[i] < tMin) i++;
  if (i > 400) { for (var cle in _vdH) _vdH[cle].splice(0, i); }
  i = 0;
  while (i < _vdCretes.length && _vdCretes[i].t < tMin) i++;
  if (i) _vdCretes.splice(0, i);
  i = 0;
  while (i < _vdTrace.t.length && _vdTrace.t[i] < simV.t - VD_TRACE_DUREE) i++;
  if (i > 400) { _vdTrace.t.splice(0, i); _vdTrace.e.splice(0, i); _vdTrace.r.splice(0, i); }
}

// ══════════════════════════════════════════════════════════════════════
//  Boucle d'animation
// ══════════════════════════════════════════════════════════════════════

function _vdBoucle(ts) {
  _vdRaf = null;
  if (!simV.lecture) return;
  var dtReel = Math.min((ts - _vdDernierTs) / 1000, 0.05);
  _vdDernierTs = ts;
  vdAvancer(dtReel * simV.ralenti * 1e-3);
  dessinerDessus();
  if (ts - _vdDernierReadout > 150) { _vdDernierReadout = ts; _vdMajValeurs(); }
  _vdRaf = requestAnimationFrame(_vdBoucle);
}

function vdDemarrer() {
  simV.lecture = true;
  _vdMajBoutonLecture();
  if (_vdRaf === null) {
    _vdDernierTs = performance.now();
    _vdRaf = requestAnimationFrame(_vdBoucle);
  }
}

function vdArreter() {
  simV.lecture = false;
  _vdMajBoutonLecture();
}

function vdBasculerLecture() { if (simV.lecture) vdArreter(); else vdDemarrer(); }

function _vdMajBoutonLecture() {
  var b = document.getElementById('vd-btn-lecture');
  if (!b) return;
  b.textContent = simV.lecture ? '⏸ Pause' : '▶ Lecture';
  b.classList.toggle('btn-pause', simV.lecture);
  b.classList.toggle('btn-play', !simV.lecture);
}

// ══════════════════════════════════════════════════════════════════════
//  Commandes du panneau
// ══════════════════════════════════════════════════════════════════════

function _vdTexte(id, txt) {
  var el = document.getElementById(id);
  if (el) el.textContent = txt;
}

function vdOnRalenti(v) {
  simV.ralenti = parseFloat(v);
  _vdTexte('vd-lbl-ralenti', '1 s ↔ ' + fmtFR(simV.ralenti, 0) + ' ms');
}
function vdOnC(v) {
  simV.c = parseFloat(v);
  _vdTexte('vd-lbl-c', fmtFR(simV.c, 0) + ' m/s');
  _vdMajValeurs(); dessinerDessus();
}
function vdOnFE(v) {
  simV.fE = parseFloat(v);
  _vdTexte('vd-lbl-fe', fmtFR(simV.fE, 0) + ' Hz');
  _vdMajValeurs(); dessinerDessus();
}
function vdOnVE(v) {
  simV.E.v = parseFloat(v);
  _vdTexte('vd-lbl-ve', fmtFR(simV.E.v, 0) + ' m/s');
  _vdMajValeurs(); dessinerDessus();
}
function vdOnVR(v) {
  simV.R.v = parseFloat(v);
  _vdTexte('vd-lbl-vr', fmtFR(simV.R.v, 0) + ' m/s');
  dessinerDessus();
}
function vdToggleCentres(coche) { simV.showCentres = coche; dessinerDessus(); }

function _vdMajValeurs() {
  var fR = simV.fR, ok = !isNaN(fR);
  _vdTexte('vd-ro-fe', fmtFR(simV.fE, 0) + ' Hz');
  _vdTexte('vd-ro-fr', ok ? fmtFR(fR, 0) + ' Hz' : '—');
  _vdTexte('vd-ro-ecart', ok ? (fR - simV.fE >= 0.5 ? '+' : '') + fmtFR(fR - simV.fE, 0) + ' Hz' : '—');
}

// ══════════════════════════════════════════════════════════════════════
//  Rendu de la scène
// ══════════════════════════════════════════════════════════════════════

function dessinerDessus() {
  var cv = cvDessus, ctx = ctxDessus;
  if (!cv) return;
  var w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  ctx.clearRect(0, 0, w, h);

  var s = w / VD_LARGEUR;                         // px par m
  var f = borner(Math.min(w / 58, h / 30), 12, 22);
  var X = function (x) { return x * s; };
  var Y = function (y) { return h / 2 + y * s; };
  var r = 0.72 * f;                               // rayon des pastilles
  _vdGeo = { s: s, w: w, h: h, Hm: h / s, r: r, f: f };

  // ── Crêtes : cercles centrés sur leur point d'émission ──────────────
  var i, c, rayon, a;
  ctx.lineWidth = Math.max(1.5, f * 0.1);
  for (i = 0; i < _vdCretes.length; i++) {
    c = _vdCretes[i];
    rayon = simV.c * (simV.t - c.t);
    if (rayon <= 0) continue;
    a = _vdAmp(rayon);
    ctx.strokeStyle = 'rgba(42,106,170,' + (0.12 + 0.8 * a).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(X(c.x), Y(c.y), rayon * s, 0, 2 * Math.PI);
    ctx.stroke();
  }
  if (simV.showCentres) {
    ctx.fillStyle = 'rgba(42,138,80,0.45)';
    for (i = 0; i < _vdCretes.length; i++) {
      c = _vdCretes[i];
      ctx.beginPath();
      ctx.arc(X(c.x), Y(c.y), Math.max(1.5, f * 0.11), 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  // ── Échelle ─────────────────────────────────────────────────────────
  var xe = 0.9 * f, ye = h - 1.0 * f;
  ctx.strokeStyle = COL_GRIS;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(xe, ye - 0.3 * f); ctx.lineTo(xe, ye); ctx.lineTo(xe + s, ye); ctx.lineTo(xe + s, ye - 0.3 * f);
  ctx.stroke();
  texteIndices(ctx, '1 m', xe + s / 2, ye - 0.75 * f, f * 0.85, COL_GRIS, 'center', false);

  // Date simulée (l'animation est un fort ralenti)
  texteIndices(ctx, 't = ' + fmtFR(simV.t * 1000, 1) + ' ms', w - 0.9 * f, h - 1.0 * f, f * 0.85,
               COL_GRIS, 'right', false);

  // ── Vecteurs vitesse (poignée ronde à la pointe : on la tire pour orienter) ──
  _vdVecteur(ctx, simV.E, 'v_{E}', COL_EMET, X, Y, s, f, r);
  _vdVecteur(ctx, simV.R, 'v_{R}', COL_RECEP, X, Y, s, f, r);

  // ── Émetteur et récepteur ───────────────────────────────────────────
  _pastille(ctx, X(simV.R.x), Y(simV.R.y), r, COL_RECEP, 'R', 1);
  _pastille(ctx, X(simV.E.x), Y(simV.E.y), r, COL_EMET, 'E', 1);

  if (simV.scopeE) _vdDessinerScope('e');
  if (simV.scopeR) _vdDessinerScope('r');
}

// Pointe du vecteur vitesse d'un objet, en px (null si l'objet est immobile)
function _vdPointe(o) {
  if (o.v <= 0 || !_vdGeo) return null;
  var g = _vdGeo;
  var L = g.r + Math.max(1.6 * g.f, o.v / simV.c * VD_FLECHE_C * g.s);
  return { x: o.x * g.s + L * Math.cos(o.dir), y: g.h / 2 + o.y * g.s + L * Math.sin(o.dir) };
}

function _vdVecteur(ctx, o, nom, couleur, X, Y, s, f, r) {
  var p = _vdPointe(o);
  if (!p) return;
  var cx = Math.cos(o.dir), sy = Math.sin(o.dir);
  var x0 = X(o.x) + r * cx, y0 = Y(o.y) + r * sy;
  var ang = Math.atan2(p.y - y0, p.x - x0), tete = 0.75 * f;
  ctx.save();
  ctx.strokeStyle = couleur; ctx.fillStyle = couleur;
  ctx.lineWidth = Math.max(2.5, f * 0.16);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(p.x - 0.7 * tete * cx, p.y - 0.7 * tete * sy);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x - tete * Math.cos(ang - 0.42), p.y - tete * Math.sin(ang - 0.42));
  ctx.lineTo(p.x - tete * Math.cos(ang + 0.42), p.y - tete * Math.sin(ang + 0.42));
  ctx.closePath();
  ctx.fill();
  // Poignée
  ctx.fillStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 0.28 * f, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // Étiquette, écartée de la flèche du côté perpendiculaire
  texteIndices(ctx, nom, p.x - 1.0 * f * cx - 0.95 * f * sy, p.y - 1.0 * f * sy + 0.95 * f * cx,
               f * 0.9, couleur, 'center', true);
}

// ══════════════════════════════════════════════════════════════════════
//  Écrans d'oscilloscope (fenêtres DOM déplaçables par leur barre de titre)
//  Même base de temps sur les deux écrans : c'est ce qui rend comparable la
//  période reçue à la période émise.
// ══════════════════════════════════════════════════════════════════════

// Pas rond (1 / 2 / 5 × 10ⁿ) au moins égal à brut
function _vdPasRond(brut) {
  var p = Math.pow(10, Math.floor(Math.log(brut) / Math.LN10)), m = brut / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

function _vdDessinerScope(qui) {
  var win = document.getElementById('vd-scope-' + qui);
  var cv = win.querySelector('canvas');
  if (!sizeCanvas(cv)) return;
  var ctx = cv.getContext('2d');
  var w = cv.clientWidth, h = cv.clientHeight;
  var fs = borner(w / 22, 9, 17), lw = Math.max(1, fs / 11);
  var bas = 1.5 * fs;                              // bande des graduations
  var hg = h - bas, yMil = hg / 2, ampPx = hg / 2 / 1.15;

  ctx.fillStyle = VD_COL_SCOPE_BG;
  ctx.fillRect(0, 0, w, h);

  // Fenêtre de temps : les 5 dernières périodes d'émission (l'écran défile)
  var duree = VD_FENETRE_T / simV.fE;
  var tFin = Math.max(simV.t, duree), tDeb = tFin - duree;
  var TX = function (t) { return (t - tDeb) / duree * w; };

  // Grille verticale sur des dates rondes, en ms
  var pas = _vdPasRond(duree * 1000 / Math.max(2, Math.min(8, w / (4.2 * fs)))) / 1000;
  ctx.font = fs + 'px ' + POLICE;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  var dec = pas * 1000 < 1 ? 1 : 0;
  var wUnite = ctx.measureText('t (ms)').width + 0.8 * fs;
  for (var tg = Math.ceil(tDeb / pas) * pas; tg <= tFin + 1e-12; tg += pas) {
    var xg = TX(tg);
    ctx.strokeStyle = VD_COL_SCOPE_GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xg, 0); ctx.lineTo(xg, hg);
    ctx.stroke();
    if (xg > 1.2 * fs && xg < w - wUnite - 0.8 * fs) {
      ctx.fillStyle = VD_COL_SCOPE_TXT;
      ctx.fillText(fmtFR(tg * 1000, dec), xg, hg + bas / 2);
    }
  }
  ctx.fillStyle = VD_COL_SCOPE_TXT;
  ctx.textAlign = 'right';
  ctx.fillText('t (ms)', w - 0.4 * fs, hg + bas / 2);

  // Axe des temps (niveau zéro) et bord bas de l'écran
  ctx.strokeStyle = VD_COL_SCOPE_AXE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, yMil); ctx.lineTo(w, yMil);
  ctx.moveTo(0, hg); ctx.lineTo(w, hg);
  ctx.stroke();

  // Trace « phosphore »
  var T = _vdTrace, vals = qui === 'e' ? T.e : T.r, n = T.t.length, debute = false;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, hg);
  ctx.clip();
  ctx.strokeStyle = qui === 'e' ? VD_COL_SCOPE_E : VD_COL_SCOPE_R;
  ctx.lineWidth = 1.6 * lw;
  ctx.lineJoin = 'round';
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 4 * lw;
  ctx.beginPath();
  for (var i = 0; i < n; i++) {
    if (T.t[i] < tDeb) continue;
    var px = TX(T.t[i]), py = yMil - ampPx * borner(vals[i], -1.3, 1.3);
    if (debute) ctx.lineTo(px, py); else { ctx.moveTo(px, py); debute = true; }
  }
  ctx.stroke();
  ctx.restore();
}

function vdToggleScope(qui) {
  var cle = qui === 'e' ? 'scopeE' : 'scopeR';
  simV[cle] = !simV[cle];
  document.getElementById('vd-scope-' + qui).style.display = simV[cle] ? '' : 'none';
  document.getElementById('vd-btn-scope-' + qui).classList.toggle('actif', simV[cle]);
  dessinerDessus();
}

// Ramène les fenêtres dans la scène (après un redimensionnement)
function _vdRecalerScopes() {
  ['e', 'r'].forEach(function (qui) {
    var win = document.getElementById('vd-scope-' + qui);
    if (!win || win.style.display === 'none' || !win.dataset.deplace) return;
    var zone = win.parentNode;
    win.style.left = borner(win.offsetLeft, 0, Math.max(0, zone.clientWidth - win.offsetWidth)) + 'px';
    win.style.top = borner(win.offsetTop, 0, Math.max(0, zone.clientHeight - win.offsetHeight)) + 'px';
  });
}

var _vdZ = 20;
function _vdInitScope(qui) {
  var win = document.getElementById('vd-scope-' + qui);
  var tete = win.querySelector('.scope-head');
  var saisie = null;

  tete.addEventListener('pointerdown', function (e) {
    if (e.target.closest('button')) return;        // la croix n'embarque pas la fenêtre
    saisie = { dx: e.clientX - win.offsetLeft, dy: e.clientY - win.offsetTop };
    win.style.left = win.offsetLeft + 'px';        // la fenêtre de droite quitte son ancrage « right »
    win.style.right = 'auto';
    win.dataset.deplace = '1';
    win.style.zIndex = ++_vdZ;
    tete.classList.add('dragging');
    tete.setPointerCapture(e.pointerId);
  });
  tete.addEventListener('pointermove', function (e) {
    if (!saisie) return;
    var zone = win.parentNode;
    win.style.left = borner(e.clientX - saisie.dx, 0, Math.max(0, zone.clientWidth - win.offsetWidth)) + 'px';
    win.style.top = borner(e.clientY - saisie.dy, 0, Math.max(0, zone.clientHeight - win.offsetHeight)) + 'px';
  });
  function fin() { saisie = null; tete.classList.remove('dragging'); }
  tete.addEventListener('pointerup', fin);
  tete.addEventListener('pointercancel', fin);
}

// ══════════════════════════════════════════════════════════════════════
//  Interactions sur la scène : tirer E ou R, orienter leur vecteur vitesse
// ══════════════════════════════════════════════════════════════════════

function initDessus() {
  cvDessus = document.getElementById('canvas-dessus');
  ctxDessus = cvDessus.getContext('2d');
  _vdInitScope('e');
  _vdInitScope('r');

  var cv = cvDessus, prise = null;     // { o, type: 'objet' | 'pointe', dx, dy }

  function pos(e) {
    var b = cv.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  }
  function enMetres(p) { return { x: p.x / _vdGeo.s, y: (p.y - _vdGeo.h / 2) / _vdGeo.s }; }

  // Ce qui se trouve sous le pointeur : une pointe de flèche d'abord, puis un objet
  function viser(p) {
    if (!_vdGeo) return null;
    var g = _vdGeo, tol = Math.max(14, 0.7 * g.f), objs = [simV.E, simV.R], i, o, d;
    for (i = 0; i < 2; i++) {
      var pt = _vdPointe(objs[i]);
      if (pt && Math.abs(p.x - pt.x) < tol && Math.abs(p.y - pt.y) < tol) return { o: objs[i], type: 'pointe' };
    }
    for (i = 0; i < 2; i++) {
      o = objs[i];
      d = Math.sqrt(Math.pow(p.x - o.x * g.s, 2) + Math.pow(p.y - (g.h / 2 + o.y * g.s), 2));
      if (d < g.r + 10) return { o: o, type: 'objet', dx: o.x * g.s - p.x, dy: g.h / 2 + o.y * g.s - p.y };
    }
    return null;
  }

  function appliquer(p) {
    var o = prise.o, g = _vdGeo;
    if (prise.type === 'pointe') {
      o.dir = Math.atan2(p.y - (g.h / 2 + o.y * g.s), p.x - o.x * g.s);
    } else {
      var m = enMetres({ x: p.x + prise.dx, y: p.y + prise.dy });
      var hy = g.Hm / 2 - VD_MARGE;
      m.x = borner(m.x, VD_MARGE, VD_LARGEUR - VD_MARGE);
      m.y = borner(m.y, -hy, hy);
      if (simV.lecture) {
        o.cible = m;                    // l'objet rejoint le pointeur à sa vitesse réglée
      } else {
        o.x = m.x; o.y = m.y;           // à l'arrêt : déplacement direct
        if (o === simV.E && _vdH.t.length) _vdPousserHistorique(true);
      }
    }
    if (!simV.lecture) dessinerDessus();
  }

  cv.addEventListener('pointerdown', function (e) {
    var p = pos(e);
    prise = viser(p);
    if (!prise) return;
    cv.setPointerCapture(e.pointerId);
    cv.style.cursor = 'grabbing';
    appliquer(p);
  });
  cv.addEventListener('pointermove', function (e) {
    var p = pos(e);
    if (prise) { appliquer(p); return; }
    cv.style.cursor = viser(p) ? 'grab' : 'default';
  });
  function fin() {
    if (prise) prise.o.cible = null;
    prise = null;
    cv.style.cursor = 'default';
  }
  cv.addEventListener('pointerup', fin);
  cv.addEventListener('pointercancel', fin);

  // Curseurs et libellés reprennent l'état
  document.getElementById('vd-sl-ralenti').value = simV.ralenti;
  document.getElementById('vd-sl-c').value = simV.c;
  document.getElementById('vd-sl-fe').value = simV.fE;
  document.getElementById('vd-sl-ve').value = simV.E.v;
  document.getElementById('vd-sl-vr').value = simV.R.v;
  _vdMajValeurs();
}

// Appelé par resizeAll (ui.js) quand la taille de la scène a pu changer
function resizeDessus() {
  if (!cvDessus || !sizeCanvas(cvDessus)) return;
  _vdGeo = null;
  dessinerDessus();                    // recalcule la hauteur de la scène en mètres
  _vdBorner(simV.E); _vdBorner(simV.R);
  _vdRecalerScopes();
  dessinerDessus();
}
