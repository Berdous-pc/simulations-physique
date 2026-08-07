'use strict';

// ═══════════════════════════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════════════════════════

/* ═══════════════════════════════════════════════════
   sim.js — État global de la simulation Lentille mince
   ─────────────────────────────────────────────────
   Toutes les distances sont en centimètres, dans le
   repère algébrique centré sur O (centre optique).
   Les coordonnées canvas sont calculées par cmToX/Y().
════════════════════════════════════════════════════ */
const sim = {
  // ── Paramètres physiques ──
  f:     10,      // distance focale f' (cm) — toujours > 0 (valeur absolue)
  h:     15,      // hauteur algébrique de l'objet AB (cm) ; > 0 : vers le haut
  OA:   -25,      // position algébrique de l'objet (cm) ; toujours < 0
  OA_DEFAULT: -25,
  OE:    35,      // position de l'écran (cm)
  OE_DEFAULT: 35,
  autoScreen: false,

  // ── Cadres de visualisation ──
  objCollapsed: false,
  imgCollapsed: false,

  // ── Mode objet à l'infini ──
  infini: false,
  alpha:  0,

  // ── Résultats calculés (mis à jour par compute()) ──
  showValeurs: false, // affichage du tableau de valeurs — désactivé par défaut
  OA2:   0,
  h2:    0,
  gamma: 0,

  // ── Tracé des rayons ──
  nRays: 3,
  multiPoints: false,
  conjugaison: false,
  hoveredGroup: -1,

  // ── Géométrie de la lentille ──
  // La lentille (et l'écran) gardent une taille FIXE à l'écran, exprimée en
  // pixels : c'est le zoom qui fait varier leur ouverture exprimée en cm.
  // lensHpx est figée par resize(), lensRadiusCm en est déduite par applyScale().
  lensHpx: 0,
  lensRadiusCm: 25,

  // ── Géométrie canvas (mis à jour par resize()) ──
  lensX: 0,
  zoom:      1,   // facteur de zoom molette, autour du centre optique O
  baseScale: 0,   // px/cm au zoom 1, calculé par resize()
  scale: 0,       // px/cm effectif = baseScale × zoom
  axisY: 0,
  W: 0, H: 0,

  // ── Cadres Objet / Image (mis à jour par updateFrameMetrics()) ──
  frameW: 0, frameH: 0, barH: 0, frameMargin: 0,

  // ── Mode d'affichage ──
  mode: 'instant', // 'instant' | 'anim'

  // ── Type de lentille ──
  lensType: 'conv', // 'conv' | 'div'

  // ── Animation "vers l'infini" ──
  infiniAnim: false,
  infiniAnimPaused: false,

  // ── Animation de propagation ──
  animT:         0,
  animSpeed:     0.2,
  // Doit correspondre à la dernière entrée de SPEED_VALS (ui.js) : le curseur
  // démarre à fond à droite, sinon le premier clic dessus change la vitesse.
  animSpeedMult: 1.0,
  animRewind:    false,
  animPaused:    true,
  animRunning:   false,
  lastTs:        0,
  animTImage:    1.0,
};

/* ── Couleurs des 3 rayons principaux ── */
const RAY_COLORS = ['#e05c00', '#2a6aaa', '#2a9a4a'];

/* ═══════════════════════════════════════════════════
   CADRAGE DE LA SCÈNE
   ─────────────────────────────────────────────────
   VIEW_SPAN_CM   : largeur de scène visée sur un canvas confortable.
   MIN_SPAN_CM    : on ne resserre jamais en deçà, sinon l'objet et l'écran
                    sortent du cadre.
   MIN_PX_PER_CM  : en dessous de cette densité le quadrillage et les
                    étiquettes deviennent illisibles → on resserre la scène.
   LENS_RADIUS_MAX_CM : demi-hauteur nominale de la lentille.
════════════════════════════════════════════════════ */
const VIEW_SPAN_CM       = 120;
const MIN_SPAN_CM        = 80;
const MIN_PX_PER_CM      = 10;
const LENS_RADIUS_MAX_CM = 25;

/* Au-delà de FAR_CM, une distance est traitée comme infinie (affichage « ∞ »,
   image non tracée). Le seuil doit rester très au-dessus des configurations
   légitimes : avec f' allant jusqu'à 200 cm, une image réelle à 3 m n'a rien
   d'aberrant. Le pseudo-infini de compute() (±9999) reste au-dessus. */
const FAR_CM = 4000;

/* ═══════════════════════════════════════════════════
   ZOOM
   ─────────────────────────────────────────────────
   Le zoom ne touche qu'à la conversion cm → px : toute la physique
   reste calculée en centimètres. Il est centré sur O, qui est le seul
   point d'ancrage du repère (il n'y a pas de translation de la vue).
   Les bornes couvrent les très petites focales (zoom avant) comme les
   objets et distances métriques (zoom arrière).
════════════════════════════════════════════════════ */
const ZOOM_MIN  = 0.12;
const ZOOM_MAX  = 8;
const ZOOM_STEP = 1.12;   // par cran de molette

/* ─────────────────────────────────────────────────
   applyScale() — Recalcule l'échelle effective et ce qui en dérive.
   La lentille gardant une hauteur fixe en pixels, son demi-diamètre
   exprimé en cm (qui borne l'ouverture du faisceau) suit le zoom.
───────────────────────────────────────────────────── */
function applyScale() {
  sim.scale        = sim.baseScale * sim.zoom;
  sim.lensRadiusCm = sim.lensHpx / sim.scale;
}

function setZoom(z) {
  const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  if (clamped === sim.zoom) return false;
  sim.zoom = clamped;
  applyScale();
  return true;
}

/* ═══════════════════════════════════════════════════
   CONVERSIONS COORDONNÉES
════════════════════════════════════════════════════ */
function cmToX(cm) { return sim.lensX + cm * sim.scale; }
function cmToY(cm) { return sim.axisY - cm * sim.scale; }
function xToCm(px) { return (px - sim.lensX) / sim.scale; }
function p(xcm, ycm) { return { x: cmToX(xcm), y: cmToY(ycm) }; }

/* ═══════════════════════════════════════════════════
   PHYSIQUE — relation conjuguée de la lentille mince
   ─────────────────────────────────────────────────
   Formule : 1/OA' = 1/OA + 1/f'
════════════════════════════════════════════════════ */
function compute() {
  const { f, h, OA, infini, alpha, lensType } = sim;
  const fEff = lensType === 'div' ? -f : f;

  if (infini) {
    const alphaRad = alpha * Math.PI / 180;
    sim.OA2   = fEff;
    sim.h2    = fEff * Math.tan(alphaRad);
    sim.gamma = 0;
  } else if (Math.abs(OA) < 0.01) {
    sim.OA2 = Infinity; sim.gamma = Infinity; sim.h2 = Infinity;
  } else if (Math.abs(OA + fEff) < 0.4) {
    sim.OA2   = -Math.sign(OA + fEff) * 9999;
    sim.gamma = sim.OA2 / OA;
    sim.h2    = sim.gamma * h;
  } else {
    const invOA2 = 1/OA + 1/fEff;
    sim.OA2   = 1 / invOA2;
    sim.gamma = sim.OA2 / OA;
    sim.h2    = sim.gamma * h;
  }

  if (sim.autoScreen) {
    const isReal = isFinite(sim.OA2) && Math.abs(sim.OA2) < FAR_CM && sim.OA2 > 0;
    sim.OE = isReal ? sim.OA2 : sim.OE_DEFAULT;
  }

  updatePanel();
}

/* ═══════════════════════════════════════════════════
   PANNEAU DROIT — affichage des résultats
════════════════════════════════════════════════════ */
function fmt(val, unit = 'cm', decimals = 1) {
  if (!isFinite(val) || Math.abs(val) > FAR_CM) return (val >= 0 ? '+' : '−') + '∞';
  return (val >= 0 ? '+' : '') + val.toFixed(decimals) + ' ' + unit;
}

function updatePanel() {
  const { OA, OA2, gamma, h2, infini } = sim;
  const quasiInfini = Math.abs(OA2) > FAR_CM;

  document.getElementById('res-OA').textContent  = infini ? '−∞' : fmt(OA);
  document.getElementById('res-OA2').textContent = fmt(OA2);
  document.getElementById('res-gamma').textContent =
    (infini || quasiInfini) ? '—' : (isFinite(gamma) ? (gamma >= 0 ? '+' : '') + gamma.toFixed(2) : '∞');
  document.getElementById('res-h2').textContent  =
    (quasiInfini || !isFinite(h2)) ? '∞' : fmt(h2);

  const reel = isFinite(OA2) && !quasiInfini && OA2 > 0;
  let nature = '', cls = '';
  if (infini) {
    nature = 'Réelle, au foyer image'; cls = 'reel';
  } else if (!isFinite(OA2) || quasiInfini) {
    nature = 'À l\'infini'; cls = '';
  } else if (reel) {
    nature = 'Réelle';
    if (Math.abs(gamma) > 1.01)      nature += ', agrandie';
    else if (Math.abs(gamma) < 0.99) nature += ', réduite';
    else                              nature += ', même taille';
    nature += ', renversée'; cls = 'reel';
  } else {
    nature = 'Virtuelle';
    if (Math.abs(gamma) > 1.01)      nature += ', agrandie';
    else if (Math.abs(gamma) < 0.99) nature += ', réduite';
    else                              nature += ', même taille';
    nature += ', droite'; cls = 'virt';
  }
  const el = document.getElementById('res-nature');
  el.textContent = nature;
  el.className = 'ro-value ' + cls;

  updateLegend();
  updateConjugaison();
}

/* ── Légende : en mode « objet à l'infini » (et pendant l'animation qui y
   mène), computeRays() trace tous les rayons en gris. Afficher le code
   couleur des trois rayons principaux serait alors mensonger. ── */
function updateLegend() {
  const mono = sim.infini || sim.infiniAnim;
  const main = document.getElementById('legend-main');
  const inf  = document.getElementById('legend-infini');
  if (main) main.style.display = mono ? 'none' : '';
  if (inf)  inf.style.display  = mono ? '' : 'none';
}

/* ═══════════════════════════════════════════════════
   TABLEAU RELATION DE CONJUGAISON
════════════════════════════════════════════════════ */
function updateTableHeight() {
  const tbl = document.getElementById('conjugaison-table');
  if (!tbl || !tbl.classList.contains('visible')) return;
  // Le tableau est en overlay bas-gauche, sous l'axe optique : il n'est plus
  // bridé par la hauteur des cadres Objet / Image (trop petite pour rester
  // lisible en vidéoprojection), il peut monter jusqu'à 37 % du canvas.
  const totalH  = Math.max(sim.frameH + sim.barH, Math.min(sim.H * 0.37, 370));
  const rows    = tbl.querySelectorAll('tr');
  const rowH    = Math.floor(totalH / rows.length);
  rows.forEach(tr => { tr.style.height = rowH + 'px'; });
  tbl.style.height = totalH + 'px';
  // Le calcul occupe 5 lignes, dont 2 avec des fractions (≈ 10,5 em au total
  // interlignes compris) : la police doit les faire tenir dans la case,
  // marges verticales de la case incluses (~0,9 em).
  const lineH = rowH / 11.4;
  // baseScale et non scale : la taille du tableau ne doit pas suivre le zoom.
  const fontSize = Math.min(34, lineH, Math.max(11, sim.baseScale * 2.6));
  tbl.style.fontSize = fontSize + 'px';
}

function updateConjugaison() {
  if (!sim.conjugaison) return;

  const { OA, OA2, f, lensType, infini } = sim;
  const fEff = lensType === 'div' ? -f : f;

  const oaVal  = infini ? -Infinity : OA;
  const oa2Val = OA2;
  const ofVal  = fEff;

  const invOA  = (infini || !isFinite(oaVal) || Math.abs(oaVal) > FAR_CM) ? 0 : 1 / oaVal;
  const invOA2 = (!isFinite(oa2Val)) ? 0 : 1 / oa2Val;
  const invOF  = 1 / ofVal;

  const OA_bar  = `<span style="text-decoration:overline">OA</span>`;
  const OA2_bar = `<span style="text-decoration:overline">OA'</span>`;
  const OF_bar  = `<span style="text-decoration:overline">OF'</span>`;

  function fmtInvVal(val) {
    if (!isFinite(val)) return val >= 0 ? '+∞' : '−∞';
    if (Math.abs(val) < 1e-9) return '0,000';
    return ((val >= 0 ? '+' : '') + val.toFixed(3)).replace('.', ',');
  }

  // Valeur brute d'une longueur : pas de « + » devant les positifs.
  function fmtLen(val) {
    if (!isFinite(val) || Math.abs(val) > FAR_CM) return val >= 0 ? '∞' : '−∞';
    return val.toFixed(1).replace('.', ',').replace('-', '−');
  }
  // Longueur signée, pour le résultat final.
  function fmtLenSigned(val) {
    if (!isFinite(val) || Math.abs(val) > FAR_CM) return val >= 0 ? '+∞' : '−∞';
    return ((val >= 0 ? '+' : '') + val.toFixed(1)).replace('.', ',').replace('-', '−');
  }
  // Inverse en valeur absolue : le signe est porté par l'opérateur (+ / −).
  function fmtInvAbs(val) {
    if (!isFinite(val)) return '∞';
    return Math.abs(val).toFixed(3).replace('.', ',');
  }

  const cOA  = s => `<span class="col-OA">${s}</span>`;
  const cOA2 = s => `<span class="col-OA2">${s}</span>`;
  const cOF  = s => `<span class="col-OF">${s}</span>`;

  // Fraction typographique : 1 sur « den », avec un vrai trait de fraction.
  const frac = den =>
    `<span class="frac"><span class="frac-n">1</span><span class="frac-d">${den}</span></span>`;

  const lhs   = cOA2(frac(OA2_bar));
  const opNum = invOA < 0 ? '−' : '+';

  // La grille compte 5 colonnes : membre gauche, « = », terme 1, opérateur,
  // terme 2. Les trois premières lignes remplissent les cinq colonnes, ce qui
  // aligne verticalement chaque membre ; les deux dernières fusionnent le
  // membre de droite.
  const c = cls => (cls ? ' ' + cls : '');
  const lineTerms = (l, t1, op, t2, cls = '') =>
    `<span class="cj-lhs${c(cls)}">${l}</span><span class="cj-eq${c(cls)}">=</span>` +
    `<span class="cj-t1${c(cls)}">${t1}</span><span class="cj-op${c(cls)}">${op}</span>` +
    `<span class="cj-t2${c(cls)}">${t2}</span>`;
  const line = (l, r, cls = '') =>
    `<span class="cj-lhs${c(cls)}">${l}</span><span class="cj-eq${c(cls)}">=</span>` +
    `<span class="cj-rhs${c(cls)}">${r}</span>`;

  document.getElementById('cj-calc').innerHTML =
    lineTerms(lhs, cOF(frac(OF_bar)), '+', cOA(frac(OA_bar))) +
    lineTerms('', cOF(frac(fmtLen(ofVal))), '+', cOA(frac(fmtLen(oaVal)))) +
    lineTerms('', cOF((invOF < 0 ? '−' : '') + fmtInvAbs(invOF)), opNum, cOA(fmtInvAbs(invOA))) +
    line(lhs, cOA2(`${fmtInvVal(invOA2)} cm⁻¹`)) +
    // Conclusion : on inverse pour obtenir la position de l'image.
    line(cOA2(`⇒ ${OA2_bar}`), cOA2(`${fmtLenSigned(oa2Val)} cm`), 'cj-gap');
}
