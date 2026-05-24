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
   le canvas, et l'état de l'animation.

   Repère physique :
     - axe X = axe optique (gauche → droite)
     - distances en centimètres, positives vers la droite
     - O1 = centre de L1 (objectif), O2 = centre de L2 (oculaire)
     - lensX1, lensX2 = abscisses en pixels (converties via scale)

   Échelle : 200 cm de large → scale = W_px / 200 px/cm
             1 carreau de quadrillage = 5 cm
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

  // ── Positions des lentilles (en px, recalculées par resize()) ──
  lensX1: 0,   // abscisse px de L1
  lensX2: 0,   // abscisse px de L2

  // ── Œil : positions relatives en cm par rapport à son iris ──
  // iris à oeilX px, cristallin à +EYE_IRIS_TO_LENS cm, rétine à +EYE_IRIS_TO_LENS+f_eye cm
  oeilX: 0,         // abscisse px de l'iris de l'œil
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

  // ── Géométrie canvas (mis à jour par resize()) ──
  scale: 0,   // px/cm
  axisY: 0,   // ordonnée px de l'axe optique
  W: 0, H: 0,
  LENS_RADIUS_CM: 46,  // rayon physique des lentilles en cm

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

  // ── Vue (zoom + pan) ──
  // La transformation est appliquée au rendu canvas uniquement.
  // Les positions sim.lensX1, lensX2 etc. restent en coordonnées logiques (px canvas sans zoom).
  view: { scale: 1, tx: 0, ty: 0 },
};

/* ── Couleurs des 3 rayons principaux (orange, bleu, vert) ── */
const RAY_COLORS = ['#e05c00', '#2a6aaa', '#2a9a4a'];

/* ═══════════════════════════════════════════════════
   CONVERSIONS COORDONNÉES
   ─────────────────────────────────────────────────
   cmToX(cm, lensX) : position cm depuis une lentille → px canvas
   cmToY(cm)        : hauteur physique cm → ordonnée px (axe Y inversé)
   xToCm(px, lensX) : px canvas → cm depuis une lentille
════════════════════════════════════════════════════ */
function cmToX(cm, lensX) { return lensX + cm * sim.scale; }
function cmToY(cm)         { return sim.axisY - cm * sim.scale; }
function xToCm(px, lensX) { return (px - lensX) / sim.scale; }

/* ── Retourne la distance O1O2 en cm ── */
function getLensDistCm() { return (sim.lensX2 - sim.lensX1) / sim.scale; }

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

  const crystalX = sim.oeilX + EYE_IRIS_TO_LENS * sim.scale;
  const L2toCrystal = (crystalX - sim.lensX2) / sim.scale;

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
   CONTRAINTES DE POSITIONNEMENT DES LENTILLES
════════════════════════════════════════════════════ */
function enforceLensDistance() {
  if (sim.systemMode === 'lunette') {
    sim.lensX2 = sim.lensX1 + (sim.f1 + sim.f2) * sim.scale;
  } else {
    if (sim.lensX2 < sim.lensX1 + 5 * sim.scale) {
      sim.lensX2 = sim.lensX1 + (sim.f1 + sim.f2) * sim.scale;
    }
  }
  sim.lensX2 = Math.min(sim.lensX2, sim.W - 10 * sim.scale);
}
