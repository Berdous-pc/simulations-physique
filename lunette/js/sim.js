'use strict';

// ═══════════════════════════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════════════════════════

/* ═══════════════════════════════════════════════════
   sim.js — État global de la simulation Lunette astronomique
   ─────────────────────────────────────────────────
   Objet central contenant tous les paramètres physiques,
   les résultats calculés, les positions des éléments sur
   l'axe optique, et l'état de l'animation.

   Repère physique :
     - axe X = axe optique (gauche → droite)
     - TOUTES les positions sont en centimètres, dans un repère de
       scène dont le zéro est arbitraire (x1, x2, xOeil).
       Les pixels n'apparaissent qu'au moment du rendu, via xToPx().
       C'est ce qui permet à resize() de ne rien détruire : l'état
       physique ne dépend plus de la taille de la fenêtre.
     - O₁ = centre de L₁ (objectif), O₂ = centre de L₂ (oculaire)

   Cadrage : la scène couvre VIEW_SPAN_CM sur la largeur du canvas au
   zoom 1 ; le zoom et le panoramique n'agissent que sur la conversion
   cm → px (scale et originXpx), jamais sur la transformation du canvas.
════════════════════════════════════════════════════ */
const sim = {
  // ── Paramètres physiques ──
  f1:    20,
  f2:    15,
  alpha: 15,
  nRays: 3,     // nombre de rayons tracés

  // ── Mode système ──
  systemMode: 'libre',   // 'libre' | 'lunette'
  oeilActif: false,      // true = afficher l'œil (mode lunette uniquement)
  legendeActif: false,   // true = afficher Objectif/Oculaire sous les lentilles

  // ── Positions sur l'axe optique, en cm (repère de scène) ──
  x1:    60,   // abscisse de O₁
  x2:    95,   // abscisse de O₂
  xOeil: 125,  // abscisse de l'iris de l'œil

  // ── Œil : distances relatives en cm par rapport à son iris ──
  // iris à xOeil, cristallin à +EYE_IRIS_TO_LENS, rétine à +EYE_IRIS_TO_LENS+EYE_FLENS
  EYE_IRIS_TO_LENS: 1,   // cm entre iris et cristallin
  EYE_FLENS: 5,          // distance focale du cristallin (cm)

  // ── Résultats calculés ──
  // Image intermédiaire par L1 (en cm depuis O1)
  O1A1: 0,   // position de A1 par rapport à O1
  h1:   0,   // hauteur de B1

  // Image finale par L2 (en cm depuis O2)
  O2A2: 0,   // position de A2 par rapport à O2
  h2:   0,   // hauteur de B2

  // Image finale par cristallin (en cm depuis O_cristallin)
  OeyeA3: 0,
  h3: 0,

  isAfocal: false,  // true si O1O2 ≈ f1+f2

  // ── Géométrie canvas (mise à jour par resize()) ──
  W: 0, H: 0,
  axisY: 0,        // ordonnée px de l'axe optique

  // ── Cadrage : conversion cm → px ──
  baseScale: 0,    // px/cm au zoom 1, calculé par resize()
  scale:     0,    // px/cm effectif = baseScale × zoom
  zoom:      1,    // facteur de zoom (molette / pincement), ancré sur le pointeur
  originXpx: 0,    // abscisse px du zéro de l'axe des cm ; le panoramique la translate

  // Demi-hauteur des lentilles et de l'œil, FIXE en pixels : c'est leur
  // ouverture exprimée en cm (lensRadiusCm) qui suit le zoom, et qui borne
  // le faisceau de rayons.
  lensHpx:      0,
  lensRadiusCm: 0,

  // ── Mode d'affichage des rayons ──
  rayMode: 'instant',  // 'instant' | 'anim'

  // ── Animation ──
  animT: 0,
  animSpeed: 0.2,
  animSpeedMult: 0.5,
  animRewind: false,
  animRewindMult: 1.0,
  animPaused: true,
  animRunning: false,
  lastTs: 0,
};

/* ── Couleurs des 3 rayons principaux (orange, bleu, vert) ── */
const RAY_COLORS = ['#e05c00', '#2a6aaa', '#2a9a4a'];

/* ═══════════════════════════════════════════════════
   CADRAGE DE LA SCÈNE
   ─────────────────────────────────────────────────
   VIEW_SPAN_CM   : largeur de scène visée sur un canvas confortable.
                    Doit couvrir O₁O₂ = f'₁ + f'₂ jusqu'à 200 cm.
   MIN_SPAN_CM    : on ne resserre jamais en deçà, sinon les deux lentilles
                    ne tiennent plus dans le cadre.
   MIN_PX_PER_CM  : en dessous de cette densité le quadrillage et les
                    étiquettes deviennent illisibles → on resserre la scène.
   LENS_RADIUS_MAX_CM : demi-hauteur nominale des lentilles.
════════════════════════════════════════════════════ */
const VIEW_SPAN_CM       = 200;
const MIN_SPAN_CM        = 120;
const MIN_PX_PER_CM      = 3.5;
const LENS_RADIUS_MAX_CM = 46;

/* Écarts minimaux imposés entre les éléments, en cm. */
const MIN_LENS_GAP_CM = 5;
const MIN_EYE_GAP_CM  = 5;

/* ═══════════════════════════════════════════════════
   ZOOM ET PANORAMIQUE
   ─────────────────────────────────────────────────
   Le zoom ne touche qu'à la conversion cm → px : toute la physique reste
   calculée en centimètres, et les lentilles, l'œil et les textes gardent
   leur taille en pixels. C'est la portion de scène couverte qui varie —
   d'où un cadrage utilisable aussi bien pour f' = 5 cm que f' = 100 cm.

   Contrairement à la page lentille, il n'y a pas ici de point fixe
   naturel (les deux lentilles et l'œil sont tous mobiles) : le zoom est
   donc ancré sur le pointeur, et un panoramique translate originXpx.
════════════════════════════════════════════════════ */
const ZOOM_MIN  = 0.15;
const ZOOM_MAX  = 8;
const ZOOM_STEP = 1.12;   // par cran de molette

/* ─────────────────────────────────────────────────
   Conversions repère physique (cm) → canvas (px).
   xToPx / pxToX : le long de l'axe optique.
   hToPx / pxToH : hauteurs, axe Y inversé.
───────────────────────────────────────────────────── */
function xToPx(xCm)  { return sim.originXpx + xCm * sim.scale; }
function pxToX(px)   { return (px - sim.originXpx) / sim.scale; }
function hToPx(hCm)  { return sim.axisY - hCm * sim.scale; }
function pxToH(py)   { return (sim.axisY - py) / sim.scale; }

/* ── Distance O₁O₂ en cm ── */
function getLensDistCm() { return sim.x2 - sim.x1; }

/* ─────────────────────────────────────────────────
   applyScale() — Recalcule l'échelle effective et ce qui en dérive.
   Les lentilles gardant une hauteur fixe en pixels, leur demi-diamètre
   exprimé en cm (qui borne l'ouverture du faisceau) suit le zoom.
───────────────────────────────────────────────────── */
function applyScale() {
  sim.scale        = sim.baseScale * sim.zoom;
  sim.lensRadiusCm = sim.lensHpx / sim.scale;
}

/* ─────────────────────────────────────────────────
   setZoom() — Change le zoom en laissant immobile le point de la scène
   situé sous anchorPx (le pointeur). Renvoie false si la borne est
   atteinte, pour éviter un redessin inutile.
───────────────────────────────────────────────────── */
function setZoom(z, anchorPx) {
  const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  if (clamped === sim.zoom) return false;
  const ax   = (anchorPx === undefined) ? sim.W / 2 : anchorPx;
  const cmAt = pxToX(ax);
  sim.zoom = clamped;
  applyScale();
  sim.originXpx = ax - cmAt * sim.scale;
  clampPan();
  return true;
}

/* ─────────────────────────────────────────────────
   sceneExtentCm() — Emprise en cm des éléments manipulables.
───────────────────────────────────────────────────── */
function sceneExtentCm() {
  let min = Math.min(sim.x1, sim.x2);
  let max = Math.max(sim.x1, sim.x2);
  if (sim.oeilActif && sim.systemMode === 'lunette') {
    max = Math.max(max, sim.xOeil + sim.EYE_IRIS_TO_LENS + sim.EYE_FLENS);
  }
  return { min, max };
}

/* ─────────────────────────────────────────────────
   clampPan() — Empêche de faire glisser toute la scène hors du cadre :
   une bande d'au moins 15 % de la largeur reste occupée par le système.
───────────────────────────────────────────────────── */
function clampPan() {
  if (!sim.W) return;
  const { min, max } = sceneExtentCm();
  const keep = sim.W * 0.15;
  const lo   = keep - max * sim.scale;
  const hi   = sim.W - keep - min * sim.scale;
  sim.originXpx = Math.max(lo, Math.min(hi, sim.originXpx));
}

/* ─────────────────────────────────────────────────
   centerScene() — Cadrage nominal : zoom 1, système centré.
───────────────────────────────────────────────────── */
function centerScene() {
  sim.zoom = 1;
  applyScale();
  const { min, max } = sceneExtentCm();
  sim.originXpx = sim.W / 2 - ((min + max) / 2) * sim.scale;
  clampPan();
}

/* ─────────────────────────────────────────────────
   clampToView() — Borne une abscisse cm à la portion visible, pour
   qu'un élément ne puisse pas être traîné hors du cadre.
───────────────────────────────────────────────────── */
function clampToView(xCm) {
  const marginCm = 20 / sim.scale;
  return Math.max(pxToX(0) + marginCm,
                  Math.min(pxToX(sim.W) - marginCm, xCm));
}

/* ═══════════════════════════════════════════════════
   PHYSIQUE
   ─────────────────────────────────────────────────
   L'objet est toujours à l'infini, incliné d'un angle alpha.

   Passage par L1 (objectif) :
     O1A1 = f'1  (image au foyer image de L1)
     h1   = −f'1 · tan(α)

   Passage par L2 (oculaire) :
     O2A1 = O1A1 − d  (position de A1 vue depuis O2)
     Formule conjuguée : 1/O2A2 = 1/O2A1 + 1/f'2

   Système afocal (d ≈ f'1 + f'2) :
     Grossissement angulaire G = −f'1/f'2
════════════════════════════════════════════════════ */
function compute() {
  const { f1, f2, alpha } = sim;
  const alphaRad = alpha * Math.PI / 180;
  const d = getLensDistCm();

  // ── Image par L1 (objet à l'infini) ──
  sim.O1A1 = f1;
  sim.h1   = -f1 * Math.tan(alphaRad);

  // ── Objet pour L2 ──
  const O2A1 = sim.O1A1 - d;

  // Vérification afocalité : d ≈ f1+f2
  sim.isAfocal = Math.abs(d - (f1 + f2)) < 0.5;

  if (sim.isAfocal || Math.abs(O2A1 + f2) < 0.4) {
    sim.O2A2 = Infinity;
    sim.h2   = Infinity;
  } else if (Math.abs(O2A1) < 0.01) {
    sim.O2A2 = Infinity; sim.h2 = Infinity;
  } else {
    const inv = 1/O2A1 + 1/f2;
    sim.O2A2 = 1 / inv;
    sim.h2   = (sim.O2A2 / O2A1) * sim.h1;
  }

  // ── Passage par l'œil (cristallin) ──
  if (sim.oeilActif && sim.systemMode === 'lunette') {
    computeEye();
  }

  updatePanel();
}

/* ─────────────────────────────────────────────────
   computeEye() — Calcule le passage par le cristallin.
───────────────────────────────────────────────────── */
function computeEye() {
  const { EYE_IRIS_TO_LENS, EYE_FLENS } = sim;
  const fEye = EYE_FLENS;

  const crystalX    = sim.xOeil + EYE_IRIS_TO_LENS;
  const L2toCrystal = crystalX - sim.x2;

  if (sim.isAfocal) {
    sim.OeyeA3 = fEye;
    const alphaRad = sim.alpha * Math.PI / 180;
    const alphaSortie = -sim.f1/sim.f2 * Math.tan(alphaRad);
    sim.h3 = fEye * (-alphaSortie);
  } else if (!isFinite(sim.O2A2)) {
    sim.OeyeA3 = fEye; sim.h3 = 0;
  } else {
    const crystalToA2cm = sim.O2A2 - L2toCrystal;
    if (Math.abs(crystalToA2cm) < 0.01) {
      sim.OeyeA3 = Infinity; sim.h3 = Infinity;
    } else {
      const inv = 1/crystalToA2cm + 1/fEye;
      sim.OeyeA3 = 1/inv;
      sim.h3 = (sim.OeyeA3 / crystalToA2cm) * sim.h2;
    }
  }
}

/* ═══════════════════════════════════════════════════
   PANNEAU — AFFICHAGE DES RÉSULTATS
════════════════════════════════════════════════════ */
function fmt(val, unit='cm', dec=1) {
  if (!isFinite(val)) return '∞';
  return (val >= 0 ? '+' : '') + val.toFixed(dec) + ' ' + unit;
}

function updatePanel() {
  const { f1, f2, isAfocal, O1A1, h1, O2A2, h2, alpha } = sim;
  const d = getLensDistCm();

  document.getElementById('res-dist').textContent = fmt(d);
  document.getElementById('res-O1A1').textContent = fmt(O1A1);
  document.getElementById('res-h1').textContent   = fmt(h1);

  if (isAfocal) {
    document.getElementById('res-box-O2A2').style.display        = 'none';
    document.getElementById('res-box-h2').style.display          = 'none';
    document.getElementById('res-box-gamma').style.display       = 'none';
    document.getElementById('res-box-alpha2').style.display      = '';
    document.getElementById('res-box-O2Ainf').style.display      = '';
    document.getElementById('res-box-gross-afocal').style.display = '';

    const alphaRad  = alpha * Math.PI / 180;
    const tanAlpha  = Math.tan(alphaRad);
    const tanAlpha2 = -f1/f2 * tanAlpha;
    const alpha2Deg = Math.atan(tanAlpha2) * 180 / Math.PI;
    const sign      = alpha2Deg >= 0 ? '+' : '';
    document.getElementById('res-alpha2').textContent = sign + alpha2Deg.toFixed(1) + '°';
    document.getElementById('res-O2Ainf').textContent = '−∞';
    const G = -(f1 / f2);
    document.getElementById('res-gross-afocal').textContent = G.toFixed(2);
  } else {
    document.getElementById('res-box-O2A2').style.display        = '';
    document.getElementById('res-box-h2').style.display          = '';
    document.getElementById('res-box-alpha2').style.display      = 'none';
    document.getElementById('res-box-O2Ainf').style.display      = 'none';
    document.getElementById('res-box-gross-afocal').style.display = 'none';

    document.getElementById('res-O2A2').textContent = fmt(O2A2);
    document.getElementById('res-h2').textContent   = fmt(h2);

    if (h1 !== 0 && isFinite(h2)) {
      const gamma = h2 / h1;
      const gsign = gamma >= 0 ? '+' : '';
      document.getElementById('res-gamma').textContent = gsign + gamma.toFixed(2);
      document.getElementById('res-box-gamma').style.display = '';
    } else {
      document.getElementById('res-gamma').textContent = '—';
      document.getElementById('res-box-gamma').style.display = 'none';
    }
  }

  if (isAfocal) {
    document.getElementById('res-systeme').textContent = 'Afocal (lunette réglée)';
    document.getElementById('res-systeme').style.color = '#2a6aaa';
  } else {
    const diff = (d - (f1 + f2)).toFixed(1);
    document.getElementById('res-systeme').textContent = `Non afocal (Δ=${diff} cm)`;
    document.getElementById('res-systeme').style.color = '#b04020';
  }
}

/* ═══════════════════════════════════════════════════
   CONTRAINTES DE POSITIONNEMENT DES ÉLÉMENTS
   ─────────────────────────────────────────────────
   En mode lunette, O₁O₂ est asservi à f'₁ + f'₂. L'œil conserve dans
   tous les cas son écart à l'oculaire : c'est l'oculaire qu'on règle,
   pas la position de l'observateur.
   Plus aucune borne liée à la largeur du canvas : les positions sont
   en cm, et le panoramique permet d'atteindre ce qui sort du cadre.
════════════════════════════════════════════════════ */
function enforceLensDistance() {
  const dEye = sim.xOeil - sim.x2;

  if (sim.systemMode === 'lunette') {
    sim.x2 = sim.x1 + sim.f1 + sim.f2;
  } else if (sim.x2 < sim.x1 + MIN_LENS_GAP_CM) {
    sim.x2 = sim.x1 + sim.f1 + sim.f2;
  }

  sim.xOeil = sim.x2 + Math.max(MIN_EYE_GAP_CM, dEye);
}
