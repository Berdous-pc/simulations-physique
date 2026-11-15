// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  dessus.js — Onglet Vue de dessus (2D) : état, modèle, rendu, écrans
//  d'oscilloscope et interactions. AUTONOME : il ne partage avec l'onglet
//  Démonstration que les utilitaires (fmtFR, borner : sim.js ; sizeCanvas,
//  texteIndices, _pastille, couleurs : profil.js).
//  Onde sonore vue de dessus, fortement ralentie. Unités : m, s, Hz.
//  Deux modes de mouvement : Automatique (vitesses et directions réglées) et
//  À la souris (E et R suivent la main, leur vitesse est mesurée).
//  Chargé après profil.js, avant ui.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Constantes ────────────────────────────────────────────────────────
var VD_LARGEUR      = 12;     // largeur de la scène (m) ; la hauteur suit le canvas
var VD_MARGE        = 0.35;   // E et R restent à cette distance des bords (m)
var VD_PAS_PAR_T    = 120;    // pas de calcul par période émise (f_R peut valoir 10 f_E)
var VD_PAS_MAX      = 80;     // pas de calcul par image, au plus
var VD_TRACE_DUREE  = 0.07;   // durée de signal conservée (s) : deux balayages de 20 ms + attente
var VD_FLECHE_C     = 0.9;    // longueur (m) du vecteur vitesse d'un objet allant à c
var VD_DIV_X        = 10;     // divisions horizontales des écrans
var VD_DIV_Y        = 8;      // divisions verticales
var VD_CALIBRES     = [0.2e-3, 0.5e-3, 1e-3, 2e-3];   // bases de temps (s/div)

// Mode À la souris (poursuite) : l'objet court vers le pointeur à une vitesse
// proportionnelle à la distance d qui les sépare,
// v = v_max·(d − VD_POURS_MORTE) / (VD_POURS_MAX − VD_POURS_MORTE), bornée à [0, v_max].
var VD_POURS_MORTE  = 0.15;   // en deçà (m), l'objet est arrivé : il s'arrête
var VD_POURS_MAX    = 3;      // distance (m) à partir de laquelle l'objet va à v_max
var VD_PLAFOND      = 0.9;    // vitesse maximale d'un objet tiré : 0,9 c …
var VD_PLAFOND_SUP  = 2;      // … ou 2 c si le supersonique est autorisé

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
  mode: 'auto',       // 'auto' | 'souris'
  ralenti: 4,         // millisecondes simulées par seconde réelle
  c: 340,             // célérité de l'onde (m/s) pour les émissions à venir
  fE: 500,            // fréquence d'émission (Hz)
  // Objets : position (m, y = 0 au milieu de la scène) ;
  //   v, dir : vitesse et direction réglées (mode Automatique) ;
  //   saisi : tenu à la souris ; cible : point visé par le pointeur { x, y } (m) ;
  //   vm, dm : vitesse (m/s) et direction du mouvement à la souris
  E: { x: 3, y: 0,   v: 100, dir: 0,       saisi: false, cible: null, vm: 0, dm: 0 },
  R: { x: 9, y: 1.1, v: 0,   dir: Math.PI, saisi: false, cible: null, vm: 0, dm: 0 },
  supersonique: false,
  showCentres: true,  // points d'émission des crêtes visibles
  scopeE: false,      // écran d'oscilloscope de l'émetteur affiché
  scopeR: false,
  calibre: 1e-3,      // base de temps commune aux deux écrans (s/div)
  fige: false,        // écrans figés
  fR: NaN             // fréquence reçue instantanée lissée (NaN : indéfinie)
};

// Historique de l'émetteur : un échantillon par pas de calcul, avec la célérité
// de l'onde émise à cet instant (chaque émission garde la sienne).
// saut = 1 : l'émetteur a été déplacé à l'arrêt, le segment qui y mène n'est pas un trajet.
var _vdH = { t: [], x: [], y: [], p: [], c: [], saut: [] };
// Crêtes : cercles centrés là où se trouvait l'émetteur quand sa phase valait π/2 + 2kπ
var _vdCretes = [];                       // { t, x, y, c }
// Signaux enregistrés pour les oscilloscopes
var _vdTrace = { t: [], e: [], r: [] };
// Balayages : date de début du balayage en cours et du précédent (NaN : aucun)
var _vdBal = { e: { deb: NaN, prec: NaN }, r: { deb: NaN, prec: NaN } };
var _vdFige = null;                       // copie des écrans au moment où on les fige
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

function _vdLacher(o) { o.saisi = false; o.cible = null; o.vm = 0; }

function vdRaz() {
  vdArreter();
  simV.t = 0; simV.phase = 0; simV.fR = NaN;
  simV.E.x = 3; simV.E.y = 0;   simV.E.dir = 0;
  simV.R.x = 9; simV.R.y = 1.1; simV.R.dir = Math.PI;
  _vdLacher(simV.E); _vdLacher(simV.R);
  _vdH = { t: [], x: [], y: [], p: [], c: [], saut: [] };
  _vdCretes = [];
  _vdTrace = { t: [], e: [], r: [] };
  _vdBal = { e: { deb: NaN, prec: NaN }, r: { deb: NaN, prec: NaN } };
  _vdPhiRetPrec = NaN;
  _vdBorner(simV.E); _vdBorner(simV.R);
  if (simV.fige) vdBasculerFige();
  _vdMajValeurs();
  dessinerDessus();
}

function _vdBorner(o) {
  var hy = _vdHauteur() / 2 - VD_MARGE;
  o.x = borner(o.x, VD_MARGE, VD_LARGEUR - VD_MARGE);
  o.y = borner(o.y, -hy, hy);
}

// Mode À la souris : vitesse de poursuite d'un objet saisi, recalculée à chaque
// pas de calcul à partir de la distance d (m) qui le sépare de sa cible.
// Proche du pointeur : lent ; loin : v_max (0,9 c, ou 2 c si supersonique).
// Main immobile : l'objet rattrape le pointeur en ralentissant et s'arrête.
function _vdPoursuite(o) {
  if (!o.saisi || !o.cible) { o.vm = 0; return 0; }
  var dx = o.cible.x - o.x, dy = o.cible.y - o.y, d = Math.sqrt(dx * dx + dy * dy);
  var vMax = (simV.supersonique ? VD_PLAFOND_SUP : VD_PLAFOND) * simV.c;
  o.vm = vMax * borner((d - VD_POURS_MORTE) / (VD_POURS_MAX - VD_POURS_MORTE), 0, 1);
  if (o.vm > 0) o.dm = Math.atan2(dy, dx);
  return d;
}

// Déplace un objet pendant h secondes simulées
function _vdDeplacer(o, h) {
  if (simV.mode === 'souris') {
    var d = _vdPoursuite(o);
    if (!o.vm) return;
    var pas = Math.min(o.vm * h, d - VD_POURS_MORTE);   // sans dépasser la cible
    o.x += pas * Math.cos(o.dm);
    o.y += pas * Math.sin(o.dm);
    _vdBorner(o);                       // arrêté par les bords, sans rebond
    return;
  }
  // Automatique : ligne droite à vitesse constante, rebond sur les bords
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
  _vdH.p.push(simV.phase); _vdH.c.push(simV.c); _vdH.saut.push(saut ? 1 : 0);
}

// Signal reçu en (px, py) à la date courante : somme des contributions émises
// aux dates τ telles que c_τ·(t − τ) = distance au point d'émission, où c_τ est
// la célérité de l'onde émise à τ (une seule contribution tant que l'émetteur
// est subsonique et c constant, plusieurs possibles sinon).
// Renvoie { val, n, phi } : valeur, nombre de contributions, phase de la plus récente.
var _vdRes = { val: 0, n: 0, phi: 0 };
function _vdSignalRecu(px, py) {
  var H = _vdH, t = simV.t, n = H.t.length;
  var val = 0, nb = 0, phi = 0;
  var dx = px - H.x[n - 1], dy = py - H.y[n - 1];
  var gSuiv = H.c[n - 1] * (t - H.t[n - 1]) - Math.sqrt(dx * dx + dy * dy), g;
  for (var i = n - 2; i >= 0; i--) {
    dx = px - H.x[i]; dy = py - H.y[i];
    g = H.c[i] * (t - H.t[i]) - Math.sqrt(dx * dx + dy * dy);
    // Un segment où c change (ou un saut) n'est pas une émission continue : pas de racine
    if (!H.saut[i + 1] && H.c[i] === H.c[i + 1] && ((g >= 0 && gSuiv < 0) || (g < 0 && gSuiv >= 0))) {
      var u = g / (g - gSuiv);                         // racine entre i et i + 1
      var ph = H.p[i] + u * (H.p[i + 1] - H.p[i]);
      var tau = H.t[i] + u * (H.t[i + 1] - H.t[i]);
      val += _vdAmp(H.c[i] * (t - tau)) * Math.sin(ph);
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
      _vdCretes.push({ t: simV.t, x: simV.E.x, y: simV.E.y, c: simV.c });   // l'émetteur est en haut
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

// Oublie ce qui ne peut plus servir : émissions dont l'onde a dépassé la
// traversée de la scène (E et R y restent), signal sorti des écrans.
function _vdElaguer() {
  var Hm = _vdHauteur();
  var lim = 1.05 * Math.sqrt(VD_LARGEUR * VD_LARGEUR + Hm * Hm), t = simV.t, i = 0;
  while (i < _vdH.t.length - 2 && _vdH.c[i] * (t - _vdH.t[i]) > lim) i++;
  if (i > 400) { for (var cle in _vdH) _vdH[cle].splice(0, i); }
  i = 0;
  while (i < _vdCretes.length && _vdCretes[i].c * (t - _vdCretes[i].t) > lim) i++;
  if (i) _vdCretes.splice(0, i);
  i = 0;
  while (i < _vdTrace.t.length && _vdTrace.t[i] < t - VD_TRACE_DUREE) i++;
  if (i > 400) { _vdTrace.t.splice(0, i); _vdTrace.e.splice(0, i); _vdTrace.r.splice(0, i); }
}

// ══════════════════════════════════════════════════════════════════════
//  Boucle d'animation
// ══════════════════════════════════════════════════════════════════════

// Une image : dtReel secondes réelles ; maintenant = date réelle (ms) de l'image
function vdImage(dtReel, maintenant) {
  vdAvancer(dtReel * simV.ralenti * 1e-3);
  _vdMajBalayages();
}

function _vdBoucle(ts) {
  _vdRaf = null;
  if (!simV.lecture) return;
  var dtReel = Math.min((ts - _vdDernierTs) / 1000, 0.05);
  _vdDernierTs = ts;
  vdImage(dtReel, ts);
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
  simV.E.vm = 0; simV.R.vm = 0;
  _vdMajBoutonLecture();
  _vdMajValeurs();
  if (cvDessus) dessinerDessus();
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
// c et f ne valent que pour les émissions à venir : l'onde déjà émise garde les siens
function vdOnC(v) {
  simV.c = parseFloat(v);
  _vdTexte('vd-lbl-c', fmtFR(simV.c, 0) + ' m/s');
  _vdMajValeurs();
}
function vdOnFE(v) {
  simV.fE = parseFloat(v);
  _vdTexte('vd-lbl-fe', fmtFR(simV.fE, 0) + ' Hz');
  _vdMajValeurs();
}
function vdOnVE(v) {
  simV.E.v = parseFloat(v);
  _vdTexte('vd-lbl-ve', fmtFR(simV.E.v, 0) + ' m/s');
  dessinerDessus();
}
function vdOnVR(v) {
  simV.R.v = parseFloat(v);
  _vdTexte('vd-lbl-vr', fmtFR(simV.R.v, 0) + ' m/s');
  dessinerDessus();
}
function vdToggleCentres(coche) { simV.showCentres = coche; dessinerDessus(); }
function vdToggleSupersonique(coche) { simV.supersonique = coche; }

// Mode de mouvement : 'auto' (curseurs et poignées) ou 'souris' (E et R suivent la main)
function vdSetMode(m) {
  if (m === simV.mode) return;
  simV.mode = m;
  _vdLacher(simV.E); _vdLacher(simV.R);
  document.getElementById('vd-mode-auto').classList.toggle('active', m === 'auto');
  document.getElementById('vd-mode-souris').classList.toggle('active', m === 'souris');
  document.getElementById('vd-bloc-auto').style.display = m === 'auto' ? '' : 'none';
  document.getElementById('vd-bloc-souris').style.display = m === 'souris' ? '' : 'none';
  _vdMajValeurs();
  dessinerDessus();
}

function _vdMajValeurs() {
  var fR = simV.fR, ok = !isNaN(fR);
  _vdTexte('vd-ro-fe', fmtFR(simV.fE, 0) + ' Hz');
  _vdTexte('vd-ro-fr', ok ? fmtFR(fR, 0) + ' Hz' : '—');
  _vdTexte('vd-ro-ecart', ok ? (fR - simV.fE >= 0.5 ? '+' : '') + fmtFR(fR - simV.fE, 0) + ' Hz' : '—');
  _vdTexte('vd-ro-ve', fmtFR(simV.E.vm, 0) + ' m/s');
  _vdTexte('vd-ro-mach', fmtFR(simV.E.vm / simV.c, 2));
  _vdTexte('vd-ro-vr', fmtFR(simV.R.vm, 0) + ' m/s');
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

  // ── Crêtes : cercles centrés sur leur point d'émission, chacun à sa célérité ──
  var i, c, rayon, a;
  ctx.lineWidth = Math.max(1.5, f * 0.1);
  for (i = 0; i < _vdCretes.length; i++) {
    c = _vdCretes[i];
    rayon = c.c * (simV.t - c.t);
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

  // ── Vecteurs vitesse (en mode Automatique : poignée ronde pour orienter) ──
  _vdVecteur(ctx, simV.E, 'v_{E}', COL_EMET, X, Y, s, f, r);
  _vdVecteur(ctx, simV.R, 'v_{R}', COL_RECEP, X, Y, s, f, r);

  // ── Émetteur et récepteur ───────────────────────────────────────────
  _pastille(ctx, X(simV.R.x), Y(simV.R.y), r, COL_RECEP, 'R', 1);
  _pastille(ctx, X(simV.E.x), Y(simV.E.y), r, COL_EMET, 'E', 1);

  // Objet tenu à la souris : élastique pointillé jusqu'à la cible, vitesse au-dessus
  [[simV.E, COL_EMET], [simV.R, COL_RECEP]].forEach(function (oc) {
    var o = oc[0];
    if (simV.mode !== 'souris' || !o.saisi || !simV.lecture) return;
    if (o.cible) {
      ctx.save();
      ctx.strokeStyle = oc[1]; ctx.fillStyle = oc[1];
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = Math.max(1.5, f * 0.09);
      ctx.setLineDash([0.4 * f, 0.3 * f]);
      ctx.beginPath();
      ctx.moveTo(X(o.x), Y(o.y)); ctx.lineTo(X(o.cible.x), Y(o.cible.y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(X(o.cible.x), Y(o.cible.y), Math.max(3, 0.22 * f), 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }
    texteIndices(ctx, fmtFR(o.vm, 0) + ' m/s', X(o.x), Y(o.y) - r - 0.8 * f, f * 0.85, oc[1], 'center', true, true);
  });

  if (simV.scopeE) _vdDessinerScope('e');
  if (simV.scopeR) _vdDessinerScope('r');
}

// Vitesse et direction affichées : réglées (Automatique) ou mesurées (À la souris)
function _vdVitesseVue(o) {
  return simV.mode === 'souris' ? { v: o.vm, dir: o.dm } : { v: o.v, dir: o.dir };
}

// Pointe du vecteur vitesse d'un objet, en px (null si l'objet est immobile)
function _vdPointe(o) {
  var vv = _vdVitesseVue(o);
  if (vv.v <= 0.5 || !_vdGeo) return null;
  var g = _vdGeo;
  var L = g.r + Math.max(1.6 * g.f, vv.v / simV.c * VD_FLECHE_C * g.s);
  return { x: o.x * g.s + L * Math.cos(vv.dir), y: g.h / 2 + o.y * g.s + L * Math.sin(vv.dir) };
}

function _vdVecteur(ctx, o, nom, couleur, X, Y, s, f, r) {
  var p = _vdPointe(o);
  if (!p) return;
  var dir = _vdVitesseVue(o).dir;
  var cx = Math.cos(dir), sy = Math.sin(dir);
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
  if (simV.mode === 'auto') {                     // poignée d'orientation
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 0.28 * f, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  // Étiquette, écartée de la flèche du côté perpendiculaire
  texteIndices(ctx, nom, p.x - 1.0 * f * cx - 0.95 * f * sy, p.y - 1.0 * f * sy + 0.95 * f * cx,
               f * 0.9, couleur, 'center', true);
}

// ══════════════════════════════════════════════════════════════════════
//  Écrans d'oscilloscope (fenêtres DOM déplaçables par leur barre de titre)
//  Balayage déclenché, comme un oscilloscope de TP : le spot parcourt l'écran
//  de gauche à droite puis repart au passage suivant du signal par zéro en
//  montant ; un signal périodique paraît donc immobile. Sans déclenchement
//  pendant un balayage entier (pas encore de signal), le spot repart seul.
//  Même base de temps (ms/div) sur les deux écrans : la période reçue se
//  compare directement à la période émise.
// ══════════════════════════════════════════════════════════════════════

function _vdDuree() { return VD_DIV_X * simV.calibre; }

// Premier indice de la trace dont la date est ≥ t (recherche dichotomique)
function _vdIndice(T, t) {
  var a = 0, b = T.t.length;
  while (a < b) { var m = (a + b) >> 1; if (T.t[m] < t) a = m + 1; else b = m; }
  return a;
}

// Date du premier passage par zéro en montant après tMin (NaN s'il n'y en a pas)
function _vdDeclenchement(vals, tMin) {
  var T = _vdTrace;
  for (var i = Math.max(1, _vdIndice(T, tMin)); i < T.t.length; i++) {
    if (vals[i - 1] < 0 && vals[i] >= 0) {
      var u = -vals[i - 1] / (vals[i] - vals[i - 1]);
      return T.t[i - 1] + u * (T.t[i] - T.t[i - 1]);
    }
  }
  return NaN;
}

function _vdMajBalayages() {
  if (simV.fige) return;
  var D = _vdDuree(), T = _vdTrace;
  ['e', 'r'].forEach(function (qui) {
    var b = _vdBal[qui], vals = qui === 'e' ? T.e : T.r;
    if (!isNaN(b.deb) && simV.t < b.deb + D) return;              // balayage en cours
    var depuis = isNaN(b.deb) ? (T.t.length ? T.t[0] : 0) : b.deb + D;
    var td = _vdDeclenchement(vals, depuis);
    if (!isNaN(td)) { b.prec = b.deb; b.deb = td; }
    else if (simV.t - depuis > D) { b.prec = b.deb; b.deb = simV.t; }   // pas de signal : départ libre
  });
}

function vdOnCalibre(v) {
  simV.calibre = VD_CALIBRES[parseInt(v, 10)];
  _vdTexte('vd-lbl-calibre', fmtFR(simV.calibre * 1000, simV.calibre < 1e-3 ? 1 : 0) + ' ms/div');
  dessinerDessus();
}

// Figer : les écrans gardent leur image, la simulation continue
function vdBasculerFige() {
  simV.fige = !simV.fige;
  _vdFige = simV.fige ? {
    t: simV.t,
    trace: { t: _vdTrace.t.slice(), e: _vdTrace.e.slice(), r: _vdTrace.r.slice() },
    bal: { e: { deb: _vdBal.e.deb, prec: _vdBal.e.prec }, r: { deb: _vdBal.r.deb, prec: _vdBal.r.prec } }
  } : null;
  var b = document.getElementById('vd-btn-figer');
  if (b) {
    b.classList.toggle('actif', simV.fige);
    b.textContent = simV.fige ? 'Libérer les écrans' : 'Figer les écrans';
  }
  dessinerDessus();
}

// Trace d'une portion [t0, t1] de signal, abscisse comptée depuis le début tDeb du balayage
function _vdTracer(ctx, T, vals, tDeb, t0, t1, D, w, yMil, ampPx) {
  var debute = false, dernier = null;
  ctx.beginPath();
  for (var i = _vdIndice(T, t0); i < T.t.length && T.t[i] <= t1; i++) {
    var px = (T.t[i] - tDeb) / D * w, py = yMil - ampPx * borner(vals[i], -1.3, 1.3);
    if (debute) ctx.lineTo(px, py); else { ctx.moveTo(px, py); debute = true; }
    dernier = { x: px, y: py };
  }
  ctx.stroke();
  return dernier;
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
  var D = _vdDuree(), k;

  ctx.fillStyle = VD_COL_SCOPE_BG;
  ctx.fillRect(0, 0, w, h);

  // Graticule : 10 divisions en temps, 8 en tension
  ctx.strokeStyle = VD_COL_SCOPE_GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (k = 1; k < VD_DIV_X; k++) { ctx.moveTo(k * w / VD_DIV_X, 0); ctx.lineTo(k * w / VD_DIV_X, hg); }
  for (k = 1; k < VD_DIV_Y; k++) { if (2 * k !== VD_DIV_Y) { ctx.moveTo(0, k * hg / VD_DIV_Y); ctx.lineTo(w, k * hg / VD_DIV_Y); } }
  ctx.stroke();
  ctx.strokeStyle = VD_COL_SCOPE_AXE;
  ctx.beginPath();
  ctx.moveTo(0, yMil); ctx.lineTo(w, yMil);
  ctx.moveTo(0, hg); ctx.lineTo(w, hg);
  ctx.stroke();

  // Graduations en ms depuis le déclenchement (une division sur deux si l'écran est étroit)
  ctx.font = fs + 'px ' + POLICE;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = VD_COL_SCOPE_TXT;
  var wUnite = ctx.measureText('t (ms)').width + 0.8 * fs;
  var saut = w / VD_DIV_X < 2.6 * fs ? 2 : 1, dec = simV.calibre < 1e-3 ? 1 : 0;
  ctx.textAlign = 'center';
  for (k = 0; k < VD_DIV_X; k += saut) {
    var xg = k * w / VD_DIV_X;
    if (xg < w - wUnite - 0.8 * fs) {
      ctx.textAlign = k === 0 ? 'left' : 'center';
      ctx.fillText(fmtFR(k * simV.calibre * 1000, dec), k === 0 ? 0.3 * fs : xg, hg + bas / 2);
    }
  }
  ctx.textAlign = 'right';
  ctx.fillText('t (ms)', w - 0.4 * fs, hg + bas / 2);

  // Traces : balayage précédent (rémanence, à droite du spot) puis balayage en cours
  var src = simV.fige ? _vdFige : { t: simV.t, trace: _vdTrace, bal: _vdBal };
  var T = src.trace, vals = qui === 'e' ? T.e : T.r, b = src.bal[qui], tNow = src.t;
  if (isNaN(b.deb)) return;
  var couleur = qui === 'e' ? VD_COL_SCOPE_E : VD_COL_SCOPE_R;
  var avance = borner((tNow - b.deb) / D, 0, 1);  // position du spot (fraction de l'écran)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, hg);
  ctx.clip();
  ctx.strokeStyle = couleur;
  ctx.lineJoin = 'round';
  if (!isNaN(b.prec) && avance < 1) {
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1.3 * lw;
    _vdTracer(ctx, T, vals, b.prec, b.prec + avance * D, b.prec + D, D, w, yMil, ampPx);
    ctx.globalAlpha = 1;
  }
  ctx.lineWidth = 1.6 * lw;
  ctx.shadowColor = couleur;
  ctx.shadowBlur = 4 * lw;
  var spot = _vdTracer(ctx, T, vals, b.deb, b.deb, Math.min(tNow, b.deb + D), D, w, yMil, ampPx);
  if (spot && avance < 1) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, 1.8 * lw, 0, 2 * Math.PI);
    ctx.fill();
  }
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
//  Interactions sur la scène
//   Automatique : pointe de flèche → orientation ; à l'arrêt, E ou R se
//     replacent (pendant la lecture, ils suivent leur mouvement réglé).
//   À la souris : pendant la lecture, l'objet saisi POURSUIT le pointeur à une
//     vitesse proportionnelle à leur distance (voir _vdPoursuite). À l'arrêt,
//     l'objet se replace directement.
// ══════════════════════════════════════════════════════════════════════

function initDessus() {
  cvDessus = document.getElementById('canvas-dessus');
  ctxDessus = cvDessus.getContext('2d');
  _vdInitScope('e');
  _vdInitScope('r');

  // prise : { o, type: 'objet' | 'pointe', dx, dy (décalage de la saisie, px), pilote }
  var cv = cvDessus, prise = null;

  function pos(e) {
    var b = cv.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  }
  function enMetres(p) {
    var g = _vdGeo, hy = g.Hm / 2 - VD_MARGE;
    return { x: borner(p.x / g.s, VD_MARGE, VD_LARGEUR - VD_MARGE),
             y: borner((p.y - g.h / 2) / g.s, -hy, hy) };
  }

  // Ce qui se trouve sous le pointeur : une pointe de flèche d'abord, puis un objet
  function viser(p) {
    if (!_vdGeo) return null;
    var g = _vdGeo, tol = Math.max(14, 0.7 * g.f), objs = [simV.E, simV.R], i, o, d;
    if (simV.mode === 'auto') {
      for (i = 0; i < 2; i++) {
        var pt = _vdPointe(objs[i]);
        if (pt && Math.abs(p.x - pt.x) < tol && Math.abs(p.y - pt.y) < tol) return { o: objs[i], type: 'pointe' };
      }
      if (simV.lecture) return null;               // en lecture, le mouvement réglé commande
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
      o.x = m.x; o.y = m.y;             // à l'arrêt : on replace l'objet
      if (o === simV.E && _vdH.t.length) _vdPousserHistorique(true);
    }
    dessinerDessus();
  }

  cv.addEventListener('pointerdown', function (e) {
    var p = pos(e);
    prise = viser(p);
    if (!prise) return;
    if (prise.type === 'objet' && simV.lecture && simV.mode === 'souris') {
      prise.pilote = true;
      prise.o.saisi = true;
      prise.o.cible = { x: prise.o.x, y: prise.o.y };   // saisi sur place : pas d'à-coup
      cv.setPointerCapture(e.pointerId);
      cv.style.cursor = 'grabbing';
      return;
    }
    cv.setPointerCapture(e.pointerId);
    cv.style.cursor = 'grabbing';
    appliquer(p);
  });
  cv.addEventListener('pointermove', function (e) {
    var p = pos(e);
    if (prise && prise.pilote) {
      // la cible garde le décalage de la saisie (cliquer à côté du centre ne fait pas bouger)
      prise.o.cible = enMetres({ x: p.x + prise.dx, y: p.y + prise.dy });
      if (!simV.lecture) dessinerDessus();
      return;
    }
    if (prise) { appliquer(p); return; }
    cv.style.cursor = viser(p) ? 'grab' : 'default';
  });
  function fin() {
    if (!prise) return;
    if (prise.pilote) {
      _vdLacher(prise.o);               // lâché : l'objet s'arrête net
      if (!simV.lecture) dessinerDessus();
    }
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
  document.getElementById('vd-sl-calibre').value = VD_CALIBRES.indexOf(simV.calibre);
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
