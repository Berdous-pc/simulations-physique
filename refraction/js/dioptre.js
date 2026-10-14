// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  dioptre.js — Rendu canvas de l'onglet Snell-Descartes (modes « Deux
//  milieux » et « Demi-disque ») et interactions à la souris
//  Dépend de sim.js. Appelle surChangementScene() défini dans ui.js.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Couleurs ──────────────────────────────────────────────────────────
var COUL = {
  fond:      '#fdf8f0',
  texte:     '#2c3e50',
  texte2:    '#2a5080',
  dioptre:   '#2c3e50',
  normale:   '#5a6a78',
  angleI:    '#2a6aaa',
  angleIp:   '#7a4ab0',
  angleR:    '#2a8a50',
  alerte:    '#b04020',
  rayon:     '225, 20, 20'      // faisceau laser (rgb)
};

// ══════════════════════════════════════════════════════════════════════
//  Canvas
// ══════════════════════════════════════════════════════════════════════

var cvSnell = null;
var ctxSnell = null;

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

// ── Rendu à la demande (pas d'animation : la scène est statique) ──────
var _renduDemande = false;
function demanderRendu() {
  if (_renduDemande) return;
  _renduDemande = true;
  requestAnimationFrame(function () {
    _renduDemande = false;
    dessinerSnell();
  });
}

function dessinerSnell() {
  if (!cvSnell || !cvSnell.clientWidth) return;
  var W = cvSnell.clientWidth, H = cvSnell.clientHeight;
  ctxSnell.clearRect(0, 0, W, H);
  if (modeSnell === 'milieux') dessinerMilieux(ctxSnell, W, H);
  else dessinerDisque(ctxSnell, W, H);
}

// ══════════════════════════════════════════════════════════════════════
//  Mise en page (tout est proportionnel à la taille du canvas)
// ══════════════════════════════════════════════════════════════════════

function _clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

// Mode « Deux milieux » : point d'incidence P au centre du canvas
function layoutMilieux(W, H) {
  var m = Math.min(W, H) / 2;
  return {
    P:   { x: W / 2, y: H / 2 },
    m:   m,
    Rl:  0.72 * m,                         // distance P → avant du laser
    len: 0.26 * m,                         // longueur du boîtier
    wid: _clamp(0.07 * m, 12, 36),         // épaisseur du boîtier
    ra:  0.20 * m,                         // rayon des arcs d'angle
    fs:  _clamp(0.07 * m, 13, 28),         // police des étiquettes
    w:   _clamp(0.007 * m, 2, 3.5)         // épaisseur du faisceau
  };
}

// Mode « Demi-disque » : centre C de la face plane au centre du canvas
function layoutDisque(W, H) {
  var m = Math.min(W, H) / 2;
  return {
    P:   { x: W / 2, y: H / 2 },
    m:   m,
    Rp:  0.66 * m,                         // rayon du rapporteur
    Rd:  0.53 * m,                         // rayon du demi-disque
    Rl:  0.78 * m,                         // distance C → avant du laser
    len: 0.21 * m,
    wid: _clamp(0.065 * m, 12, 34),
    ra:  0.17 * m,
    fs:  _clamp(0.065 * m, 13, 26),
    w:   _clamp(0.007 * m, 2, 3.5)
  };
}

// ══════════════════════════════════════════════════════════════════════
//  Primitives de dessin
// ══════════════════════════════════════════════════════════════════════

// Luminosité perçue d'un rayon emportant la part E de l'énergie : la
// puissance 0,4 garde visible le faible rayon réfléchi (≈ 4 % de l'énergie
// pour air/verre) tout en le laissant nettement plus pâle que le réfracté.
function alphaEnergie(E) {
  return E <= 0 ? 0 : Math.min(1, Math.pow(E, 0.4));
}

// Texte entouré d'un liseré couleur fond : reste lisible sur un trait
function texteHalo(ctx, txt, x, y, font, couleur, align, baseline) {
  ctx.font = font;
  ctx.textAlign = align || 'center';
  ctx.textBaseline = baseline || 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, parseFloat(font.replace(/^\D*/, '')) * 0.28);
  ctx.strokeStyle = 'rgba(253, 248, 240, 0.92)';
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = couleur;
  ctx.fillText(txt, x, y);
}

// Faisceau laser du point a au point b (trait net, sans halo)
function dessinerFaisceau(ctx, a, b, alpha, w) {
  if (alpha <= 0.003) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = 'rgba(' + COUL.rayon + ',' + alpha + ')';
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.restore();
}

// Pointe de flèche (sens de propagation) en p, orientée selon dir
function dessinerChevron(ctx, p, dir, taille, alpha) {
  if (alpha <= 0.003) return;
  var nx = -dir.y, ny = dir.x;
  ctx.save();
  ctx.fillStyle = 'rgba(' + COUL.rayon + ',' + alpha + ')';
  ctx.beginPath();
  ctx.moveTo(p.x + dir.x * taille, p.y + dir.y * taille);
  ctx.lineTo(p.x - dir.x * taille * 0.6 + nx * taille * 0.75,
             p.y - dir.y * taille * 0.6 + ny * taille * 0.75);
  ctx.lineTo(p.x - dir.x * taille * 0.2, p.y - dir.y * taille * 0.2);
  ctx.lineTo(p.x - dir.x * taille * 0.6 - nx * taille * 0.75,
             p.y - dir.y * taille * 0.6 - ny * taille * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Les trois rayons issus du point d'incidence P.
// sc : scène (construireRayons), L : géométrie (layout)
function dessinerRayons(ctx, sc, L, W, H) {
  var P = L.P, loin = W + H;
  var avant = { x: P.x + sc.u.x * L.Rl, y: P.y + sc.u.y * L.Rl };
  var ch = Math.max(7, L.w * 3.2);
  var mi = 0.5 * L.Rl;

  // Incident (énergie totale)
  if (affichage.rayonInc) {
    dessinerFaisceau(ctx, avant, P, 1, L.w);
    dessinerChevron(ctx, { x: P.x + sc.u.x * mi, y: P.y + sc.u.y * mi },
                    { x: -sc.u.x, y: -sc.u.y }, ch, 1);
  }

  // Réfléchi
  if (affichage.rayonRefl) {
    var aRefl = alphaEnergie(sc.R);
    dessinerFaisceau(ctx, P, { x: P.x + sc.uRefl.x * loin, y: P.y + sc.uRefl.y * loin }, aRefl, L.w);
    dessinerChevron(ctx, { x: P.x + sc.uRefl.x * mi, y: P.y + sc.uRefl.y * mi },
                    sc.uRefl, ch, aRefl);
  }

  // Réfracté
  if (affichage.rayonRefr && !sc.tir) {
    var aRefr = alphaEnergie(1 - sc.R);
    dessinerFaisceau(ctx, P, { x: P.x + sc.uRefr.x * loin, y: P.y + sc.uRefr.y * loin }, aRefr, L.w);
    dessinerChevron(ctx, { x: P.x + sc.uRefr.x * mi, y: P.y + sc.uRefr.y * mi },
                    sc.uRefr, ch, aRefr);
  }
}

// Laser schématisé : boîtier dont l'avant est à la distance L.Rl de P,
// dans la direction u (point d'incidence → laser)
function dessinerLaser(ctx, P, u, L) {
  var ang = Math.atan2(u.y, u.x);
  var len = L.len, wid = L.wid;
  ctx.save();
  ctx.translate(P.x + u.x * L.Rl, P.y + u.y * L.Rl);
  ctx.rotate(ang);

  // Ombre portée légère
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  _rectArrondi(ctx, 2, -wid / 2 + 3, len, wid, wid * 0.22);
  ctx.fill();

  // Boîtier (dégradé transversal pour l'effet de volume)
  var g = ctx.createLinearGradient(0, -wid / 2, 0, wid / 2);
  g.addColorStop(0, '#6a7682');
  g.addColorStop(0.45, '#3a444e');
  g.addColorStop(1, '#262e36');
  ctx.fillStyle = g;
  _rectArrondi(ctx, 0, -wid / 2, len, wid, wid * 0.22);
  ctx.fill();
  ctx.strokeStyle = '#1c2228';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Embout de sortie
  ctx.fillStyle = '#1c2228';
  ctx.fillRect(-wid * 0.12, -wid * 0.3, wid * 0.22, wid * 0.6);

  // Voyant à l'arrière
  ctx.fillStyle = '#ff5030';
  ctx.beginPath();
  ctx.arc(len - wid * 0.4, 0, wid * 0.12, 0, 2 * Math.PI);
  ctx.fill();

  // Inscription « LASER », retournée si elle serait à l'envers
  var fsL = wid * 0.42;
  ctx.save();
  ctx.translate(len * 0.45, 0);
  if (Math.cos(ang) < 0) ctx.rotate(Math.PI);
  ctx.font = 'bold ' + fsL + 'px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('LASER', 0, fsL * 0.05);
  ctx.restore();

  // Point d'émission lumineux
  var halo = ctx.createRadialGradient(0, 0, 0, 0, 0, wid * 0.55);
  halo.addColorStop(0, 'rgba(255,80,60,0.9)');
  halo.addColorStop(1, 'rgba(255,80,60,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(-wid * 0.12, 0, wid * 0.55, 0, 2 * Math.PI);
  ctx.fill();

  ctx.restore();
}

function _rectArrondi(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// Normale au dioptre en P (pointillés), de longueur 2·demi
function dessinerNormale(ctx, P, n, demi) {
  ctx.save();
  ctx.setLineDash([9, 7]);
  ctx.strokeStyle = COUL.normale;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(P.x - n.x * demi, P.y - n.y * demi);
  ctx.lineTo(P.x + n.x * demi, P.y + n.y * demi);
  ctx.stroke();
  ctx.restore();
}

// Arc d'angle entre la normale (dirN) et un rayon (dirR), centré en P
function dessinerArc(ctx, P, dirN, dirR, rad, couleur, epais) {
  var a0 = Math.atan2(dirN.y, dirN.x);
  var d = Math.atan2(dirR.y, dirR.x) - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  if (Math.abs(d) < 0.3 * DEG) return;
  ctx.save();
  // Secteur légèrement teinté
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = couleur;
  ctx.beginPath();
  ctx.moveTo(P.x, P.y);
  ctx.arc(P.x, P.y, rad, a0, a0 + d, d < 0);
  ctx.closePath();
  ctx.fill();
  // Arc
  ctx.globalAlpha = 1;
  ctx.strokeStyle = couleur;
  ctx.lineWidth = epais;
  ctx.beginPath();
  ctx.arc(P.x, P.y, rad, a0, a0 + d, d < 0);
  ctx.stroke();
  ctx.restore();
}

// Demi-étendue d'une boîte w × h (alignée sur les axes) projetée sur la
// direction unitaire q
function _demiEtendue(w, h, q) {
  return (w / 2) * Math.abs(q.x) + (h / 2) * Math.abs(q.y);
}

// La boîte de centre c ne coupe pas la droite passant par P de direction d
function _boiteHorsDroite(c, w, h, P, d, marge) {
  var q = { x: -d.y, y: d.x };
  var dist = Math.abs((c.x - P.x) * q.x + (c.y - P.y) * q.y);
  return dist > _demiEtendue(w, h, q) + marge;
}

// Étiquette d'un angle. Premier choix : à l'intérieur de l'angle, sur la
// bissectrice, au-delà de l'arc — retenu seulement si le texte n'y touche
// ni la normale, ni le rayon, ni le dioptre (cas des angles assez ouverts).
// Sinon (angles étroits) : juste à l'extérieur du rayon, du côté opposé à
// la normale, collé au rayon à hauteur de l'arc.
function dessinerEtiquetteAngle(ctx, P, dirN, dirR, rad, txt, couleur, fs) {
  var font = 'bold ' + fs + 'px monospace';
  ctx.font = font;
  var w = ctx.measureText(txt).width + fs * 0.3, h = fs * 1.1;
  var marge = fs * 0.15;
  var dioptre = { x: -dirN.y, y: dirN.x };

  function libre(c) {
    return _boiteHorsDroite(c, w, h, P, dirN, marge) &&
           _boiteHorsDroite(c, w, h, P, dirR, marge) &&
           _boiteHorsDroite(c, w, h, P, dioptre, marge);
  }

  // Candidats, du préféré au moins bon
  var cands = [];
  var bis = vNorm({ x: dirN.x + dirR.x, y: dirN.y + dirR.y });
  if (bis.x !== 0 || bis.y !== 0) {
    for (var k = 0; k < 7; k++) {
      var d = rad + fs * (0.9 + 0.8 * k);
      cands.push({ x: P.x + bis.x * d, y: P.y + bis.y * d });
    }
  }
  // Extérieur du rayon : perpendiculaire au rayon, côté opposé à la
  // normale, à plusieurs distances de P le long du rayon
  var pr = { x: -dirR.y, y: dirR.x };
  if (vDot(pr, dirN) > 0) pr = { x: -pr.x, y: -pr.y };
  var e = _demiEtendue(w, h, pr) + marge * 2;
  [1.05, 1.6, 2.2].forEach(function (f) {
    cands.push({ x: P.x + dirR.x * rad * f + pr.x * e,
                 y: P.y + dirR.y * rad * f + pr.y * e });
  });

  var choix = cands[cands.length > 7 ? 7 : 0];
  for (var j = 0; j < cands.length; j++) {
    if (libre(cands[j])) { choix = cands[j]; break; }
  }
  texteHalo(ctx, txt, choix.x, choix.y, font, couleur, 'center', 'middle');
}

// Arcs et étiquettes des angles i, i′ et r. Un angle n'est tracé que si
// son rayon est affiché.
function dessinerAngles(ctx, sc, L, couche) {
  if (!affichage.angles) return;
  var P = L.P, ep = Math.max(2, L.fs * 0.12);
  var nInc = sc.nInc, nOpp = { x: -nInc.x, y: -nInc.y };
  var val = affichage.valeurs;
  var lst = [];
  if (affichage.rayonInc)
    lst.push({ n: nInc, d: sc.u, rad: L.ra, c: COUL.angleI,
               t: val ? 'i = ' + fmtFr(sc.i, 1) + '°' : 'i' });
  if (affichage.rayonRefl)
    lst.push({ n: nInc, d: sc.uRefl, rad: L.ra * 1.12, c: COUL.angleIp,
               t: val ? 'i′ = ' + fmtFr(sc.i, 1) + '°' : 'i′' });
  if (affichage.rayonRefr && !sc.tir)
    lst.push({ n: nOpp, d: sc.uRefr, rad: L.ra, c: COUL.angleR,
               t: val ? 'r = ' + fmtFr(sc.r, 1) + '°' : 'r' });

  lst.forEach(function (a) {
    if (couche === 'arcs') dessinerArc(ctx, P, a.n, a.d, a.rad, a.c, ep);
    else dessinerEtiquetteAngle(ctx, P, a.n, a.d, a.rad, a.t, a.c, L.fs);
  });
}

// Mention « Réflexion totale » dans le milieu 2
function dessinerMentionTIR(ctx, sc, L, dist) {
  if (!sc.tir) return;
  var P = L.P;
  texteHalo(ctx, 'Réflexion totale',
            P.x - sc.nInc.x * dist, P.y - sc.nInc.y * dist,
            'bold ' + L.fs + 'px "Segoe UI", Arial, sans-serif', COUL.alerte);
}

// ══════════════════════════════════════════════════════════════════════
//  Mode « Deux milieux »
// ══════════════════════════════════════════════════════════════════════

// Teinte d'un milieu : d'autant plus soutenue que l'indice est grand
// (vide et air restent couleur fond)
function teinteMilieu(n) {
  var t = Math.sqrt(_clamp((n - 1) / 1.6, 0, 1)) * 0.7;
  var r = Math.round(253 + (110 - 253) * t);
  var g = Math.round(248 + (165 - 248) * t);
  var b = Math.round(240 + (210 - 240) * t);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function nomMilieu(m) {
  var def = milieuParId(m.id);
  return def ? def.nom : 'Milieu personnalisé';
}

function dessinerMilieux(ctx, W, H) {
  var L = layoutMilieux(W, H), P = L.P;
  var sc = sceneMilieux();

  // Milieux
  ctx.fillStyle = teinteMilieu(simDM.m1.n);
  ctx.fillRect(0, 0, W, P.y);
  ctx.fillStyle = teinteMilieu(simDM.m2.n);
  ctx.fillRect(0, P.y, W, H - P.y);

  // Dioptre
  ctx.strokeStyle = COUL.dioptre;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, P.y);
  ctx.lineTo(W, P.y);
  ctx.stroke();

  // Noms des milieux
  var pad = L.fs * 0.8;
  _legendeMilieu(ctx, 'Milieu 1 : ' + nomMilieu(simDM.m1),
                 'n₁ = ' + fmtFr(simDM.m1.n, 2), pad, pad, L.fs, 'top');
  _legendeMilieu(ctx, 'Milieu 2 : ' + nomMilieu(simDM.m2),
                 'n₂ = ' + fmtFr(simDM.m2.n, 2), pad, H - pad, L.fs, 'bottom');

  if (affichage.normale) dessinerNormale(ctx, P, sc.nInc, H);
  dessinerAngles(ctx, sc, L, 'arcs');
  dessinerRayons(ctx, sc, L, W, H);
  if (affichage.rayonInc) dessinerLaser(ctx, P, sc.u, L);
  dessinerAngles(ctx, sc, L, 'etiquettes');
  dessinerMentionTIR(ctx, sc, L, L.m * 0.5);
}

// Nom du milieu (gras) + indice, calés en haut ou en bas à gauche
function _legendeMilieu(ctx, nom, indice, x, y, fs, cale) {
  var f1 = 'bold ' + fs + 'px "Segoe UI", Arial, sans-serif';
  var f2 = 'bold ' + fs + 'px monospace';
  if (cale === 'top') {
    texteHalo(ctx, nom, x, y, f1, COUL.texte, 'left', 'top');
    texteHalo(ctx, indice, x, y + fs * 1.3, f2, COUL.texte2, 'left', 'top');
  } else {
    texteHalo(ctx, nom, x, y - fs * 1.3, f1, COUL.texte, 'left', 'bottom');
    texteHalo(ctx, indice, x, y, f2, COUL.texte2, 'left', 'bottom');
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Mode « Demi-disque »
// ══════════════════════════════════════════════════════════════════════

// Rapporteur en papier, circulaire, gradué de 0 à 90° dans chaque quadrant
// à partir de son axe 0° (direction simDD.rappo)
function dessinerRapporteur(ctx, L) {
  var C = L.P, Rp = L.Rp;
  ctx.save();

  // Feuille
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#fffdf8';
  ctx.beginPath();
  ctx.arc(C.x, C.y, Rp, 0, 2 * Math.PI);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#b8ad9c';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Axes 0°–0° et 90°–90°
  var a0 = simDD.rappo * DEG;
  ctx.strokeStyle = 'rgba(44, 62, 80, 0.35)';
  ctx.lineWidth = 1;
  for (var q = 0; q < 2; q++) {
    var a = a0 + q * Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(C.x - Math.cos(a) * Rp * 0.92, C.y - Math.sin(a) * Rp * 0.92);
    ctx.lineTo(C.x + Math.cos(a) * Rp * 0.92, C.y + Math.sin(a) * Rp * 0.92);
    ctx.stroke();
  }

  // Graduations : 1° (courte), 5° (moyenne), 10° (longue + valeur)
  ctx.strokeStyle = '#4a5a68';
  for (var k = 0; k < 360; k++) {
    var ak = a0 + k * DEG;
    var lg = (k % 10 === 0) ? 0.085 : (k % 5 === 0) ? 0.055 : 0.03;
    ctx.lineWidth = (k % 10 === 0) ? 1.4 : 0.8;
    var cx = Math.cos(ak), cy = Math.sin(ak);
    ctx.beginPath();
    ctx.moveTo(C.x + cx * Rp, C.y + cy * Rp);
    ctx.lineTo(C.x + cx * Rp * (1 - lg), C.y + cy * Rp * (1 - lg));
    ctx.stroke();
  }

  // Valeurs, tous les 10° : 0 → 90 → 0 → 90 → 0
  var fsG = Math.max(9, Rp * 0.06);
  ctx.font = 'bold ' + fsG + 'px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#2c3e50';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (var g = 0; g < 360; g += 10) {
    var v = g <= 90 ? g : g <= 180 ? 180 - g : g <= 270 ? g - 180 : 360 - g;
    var ag = a0 + g * DEG;
    ctx.fillText(String(v), C.x + Math.cos(ag) * Rp * 0.85, C.y + Math.sin(ag) * Rp * 0.85);
  }

  // Petite croix au centre
  ctx.strokeStyle = '#4a5a68';
  ctx.lineWidth = 1;
  var cr = Rp * 0.03;
  ctx.beginPath();
  ctx.moveTo(C.x - cr, C.y); ctx.lineTo(C.x + cr, C.y);
  ctx.moveTo(C.x, C.y - cr); ctx.lineTo(C.x, C.y + cr);
  ctx.stroke();

  ctx.restore();
}

// Demi-disque de plexiglas : face plane passant par C, partie courbe du
// côté de la normale intérieure (direction simDD.disque)
function dessinerDemiDisque(ctx, L) {
  var C = L.P, Rd = L.Rd, a = simDD.disque * DEG;
  ctx.save();
  ctx.beginPath();
  ctx.arc(C.x, C.y, Rd, a - Math.PI / 2, a + Math.PI / 2);
  ctx.closePath();

  // Remplissage translucide : le rapporteur reste lisible à travers
  var g = ctx.createRadialGradient(C.x, C.y, 0, C.x, C.y, Rd);
  g.addColorStop(0, 'rgba(185, 225, 240, 0.40)');
  g.addColorStop(1, 'rgba(140, 195, 220, 0.55)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(50, 100, 135, 0.85)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Face plane (le dioptre étudié) mise en valeur
  var tx = Math.cos(a + Math.PI / 2), ty = Math.sin(a + Math.PI / 2);
  ctx.strokeStyle = COUL.dioptre;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(C.x - tx * Rd, C.y - ty * Rd);
  ctx.lineTo(C.x + tx * Rd, C.y + ty * Rd);
  ctx.stroke();
  ctx.restore();
}

function dessinerDisque(ctx, W, H) {
  var L = layoutDisque(W, H), P = L.P;
  var sc = sceneDisque();

  dessinerRapporteur(ctx, L);
  dessinerDemiDisque(ctx, L);

  // Légende
  var pad = L.fs * 0.8;
  _legendeMilieu(ctx, 'Air', 'n = 1,00', pad, pad, L.fs, 'top');
  _legendeMilieu(ctx, 'Demi-disque : plexiglas',
                 'n = ' + fmtFr(simDD.n, 2), pad, H - pad, L.fs, 'bottom');

  if (affichage.normale) dessinerNormale(ctx, P, sc.nInc, L.Rp * 1.1);
  dessinerAngles(ctx, sc, L, 'arcs');
  dessinerRayons(ctx, sc, L, W, H);
  if (affichage.rayonInc) dessinerLaser(ctx, P, sc.u, L);
  dessinerAngles(ctx, sc, L, 'etiquettes');
  dessinerMentionTIR(ctx, sc, L, L.Rd * 0.55);
}

// ══════════════════════════════════════════════════════════════════════
//  Interactions souris / tactile (glisser-déposer)
// ══════════════════════════════════════════════════════════════════════
// Mode « Deux milieux » : un glissé dans le milieu 1 oriente le laser.
// Mode « Demi-disque » : on attrape le laser (son boîtier, ou n'importe où
// hors du rapporteur), le demi-disque, ou la couronne du rapporteur.

var _drag = null;   // { cible, a0, v0 } pendant un glissé

function _posCanvas(e) {
  var r = cvSnell.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// Distance d'un point au segment [a, b]
function _distSegment(p, a, b) {
  var vx = b.x - a.x, vy = b.y - a.y;
  var t = _clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy), 0, 1);
  return Math.hypot(p.x - a.x - t * vx, p.y - a.y - t * vy);
}

// Objet sous le pointeur, ou null
function _cibleSous(p) {
  var W = cvSnell.clientWidth, H = cvSnell.clientHeight;
  if (modeSnell === 'milieux') {
    var Lm = layoutMilieux(W, H);
    return p.y < Lm.P.y ? 'laserDM' : null;
  }
  var L = layoutDisque(W, H), C = L.P;
  var u = vDir(simDD.laser);
  var a = { x: C.x + u.x * L.Rl, y: C.y + u.y * L.Rl };
  var b = { x: C.x + u.x * (L.Rl + L.len), y: C.y + u.y * (L.Rl + L.len) };
  if (_distSegment(p, a, b) < L.wid * 0.8 + 4) return 'laserDD';
  var v = { x: p.x - C.x, y: p.y - C.y }, d = Math.hypot(v.x, v.y);
  if (d <= L.Rd && vDot(v, vDir(simDD.disque)) >= 0) return 'disque';
  if (d <= L.Rp) return 'rappo';
  return 'laserDD';
}

function _anglePointeur(p) {
  var W = cvSnell.clientWidth, H = cvSnell.clientHeight;
  return Math.atan2(p.y - H / 2, p.x - W / 2) / DEG;
}

// Applique la position du pointeur à l'objet saisi
function _appliquerDrag(p) {
  var W = cvSnell.clientWidth, H = cvSnell.clientHeight;
  var ap = _anglePointeur(p);

  if (_drag.cible === 'laserDM') {
    var dx = p.x - W / 2, dy = Math.min(0, p.y - H / 2);
    if (Math.abs(dx) > 0.5) simDM.cote = dx < 0 ? 1 : -1;
    var i = Math.atan2(Math.abs(dx), -dy) / DEG;
    simDM.i = _clamp(aimanter(i, 5, 0.5), 0, 90);

  } else if (_drag.cible === 'laserDD') {
    // Angle repéré par rapport à la normale du côté où se trouve le
    // laser, pour aimanter l'angle d'incidence lui-même
    var base = simDD.disque + 180;               // normale côté air
    var d = normDeg(ap - base);
    if (Math.abs(d) > 90) { base = simDD.disque; d = normDeg(ap - base); }
    var s = d < 0 ? -1 : 1;
    simDD.laser = normDeg(auDixieme(base + s * aimanter(Math.abs(d), 5, 0.5)));

  } else if (_drag.cible === 'disque') {
    simDD.disque = normDeg(aimanter(normDeg(_drag.v0 + ap - _drag.a0), 5, 0.5));

  } else if (_drag.cible === 'rappo') {
    var r = normDeg(_drag.v0 + ap - _drag.a0);
    // Aimantation prioritaire : axe 0° du rapporteur sur la normale
    var ecart = normDeg(r - simDD.disque);
    var e180 = ((ecart % 180) + 270) % 180 - 90;
    if (Math.abs(e180) <= 1) r = r - e180;
    else r = aimanter(r, 5, 0.5);
    simDD.rappo = normDeg(auDixieme(r));
  }
}

function initInteractionsSnell() {
  cvSnell.addEventListener('pointerdown', function (e) {
    var p = _posCanvas(e);
    var cible = _cibleSous(p);
    if (!cible) return;
    var v0 = cible === 'disque' ? simDD.disque : cible === 'rappo' ? simDD.rappo : 0;
    _drag = { cible: cible, a0: _anglePointeur(p), v0: v0 };
    try { cvSnell.setPointerCapture(e.pointerId); } catch (err) { /* pointeur déjà relâché */ }
    cvSnell.style.cursor = 'grabbing';
    // Un clic sur le laser l'oriente aussitôt ; disque et rapporteur ne
    // bougent qu'au déplacement (rotation relative).
    if (cible === 'laserDM' || cible === 'laserDD') {
      _appliquerDrag(p);
      surChangementScene();
    }
    e.preventDefault();
  });

  cvSnell.addEventListener('pointermove', function (e) {
    var p = _posCanvas(e);
    if (!_drag) {
      cvSnell.style.cursor = _cibleSous(p) ? 'grab' : 'default';
      return;
    }
    _appliquerDrag(p);
    surChangementScene();
  });

  function fin(e) {
    if (!_drag) return;
    _drag = null;
    if (cvSnell.hasPointerCapture(e.pointerId)) cvSnell.releasePointerCapture(e.pointerId);
    cvSnell.style.cursor = _cibleSous(_posCanvas(e)) ? 'grab' : 'default';
  }
  cvSnell.addEventListener('pointerup', fin);
  cvSnell.addEventListener('pointercancel', fin);
}
