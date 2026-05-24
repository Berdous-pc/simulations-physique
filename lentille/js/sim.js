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
  h:     3,       // hauteur algébrique de l'objet AB (cm) ; > 0 : vers le haut
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
  OA2:   0,
  h2:    0,
  gamma: 0,

  // ── Tracé des rayons ──
  nRays: 3,
  multiPoints: false,
  conjugaison: false,
  hoveredGroup: -1,

  // ── Géométrie de la lentille ──
  LENS_RADIUS_CM: 25,

  // ── Géométrie canvas (mis à jour par resize()) ──
  lensX: 0,
  scale: 0,
  axisY: 0,
  W: 0, H: 0,

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
  animSpeedMult: 1.0,
  animRewind:    false,
  animRewindMult: 1.0,
  animPaused:    true,
  animRunning:   false,
  lastTs:        0,
  animTImage:    1.0,
};

/* ── Couleurs des 3 rayons principaux ── */
const RAY_COLORS = ['#e05c00', '#2a6aaa', '#2a9a4a'];

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
    const isReal = isFinite(sim.OA2) && Math.abs(sim.OA2) < 800 && sim.OA2 > 0;
    sim.OE = isReal ? sim.OA2 : sim.OE_DEFAULT;
  }

  updatePanel();
}

/* ═══════════════════════════════════════════════════
   PANNEAU DROIT — affichage des résultats
════════════════════════════════════════════════════ */
function fmt(val, unit = 'cm', decimals = 1) {
  if (!isFinite(val) || Math.abs(val) > 800) return (val >= 0 ? '+' : '−') + '∞';
  return (val >= 0 ? '+' : '') + val.toFixed(decimals) + ' ' + unit;
}

function updatePanel() {
  const { OA, OA2, gamma, h2, infini } = sim;
  const quasiInfini = Math.abs(OA2) > 800;

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
  el.className = 'rb-value ' + cls;

  updateConjugaison();
}

/* ═══════════════════════════════════════════════════
   TABLEAU RELATION DE CONJUGAISON
════════════════════════════════════════════════════ */
function updateTableHeight() {
  const tbl = document.getElementById('conjugaison-table');
  if (!tbl || !tbl.classList.contains('visible')) return;
  const frameH  = 18 * sim.scale;
  const barH    = 26;
  const totalH  = frameH + barH;
  const rows    = tbl.querySelectorAll('tr');
  const rowH    = Math.floor(totalH / rows.length);
  rows.forEach(tr => { tr.style.height = rowH + 'px'; });
  tbl.style.height = totalH + 'px';
  const fontSize = Math.min(26, Math.max(11, sim.scale * 1.4));
  tbl.style.fontSize = fontSize + 'px';
}

function fmtCj(val, decimals = 1) {
  if (!isFinite(val) || Math.abs(val) > 800) return val >= 0 ? '+∞' : '−∞';
  return ((val >= 0 ? '+' : '') + val.toFixed(decimals)).replace('.', ',');
}

function updateConjugaison() {
  if (!sim.conjugaison) return;

  const { OA, OA2, f, lensType, infini } = sim;
  const fEff = lensType === 'div' ? -f : f;

  const oaVal  = infini ? -Infinity : OA;
  const oa2Val = OA2;
  const ofVal  = fEff;

  const invOA  = (infini || !isFinite(oaVal) || Math.abs(oaVal) > 800) ? 0 : 1 / oaVal;
  const invOA2 = (!isFinite(oa2Val)) ? 0 : 1 / oa2Val;
  const invOF  = 1 / ofVal;

  const OA_bar  = `<span style="text-decoration:overline">OA</span>`;
  const OA2_bar = `<span style="text-decoration:overline">OA'</span>`;
  const OF_bar  = `<span style="text-decoration:overline">OF'</span>`;

  function fmtVal(val) {
    if (!isFinite(val) || Math.abs(val) > 800) return val >= 0 ? '+∞' : '−∞';
    return fmtCj(val);
  }
  function fmtInvVal(val) {
    if (!isFinite(val)) return val >= 0 ? '+∞' : '−∞';
    if (Math.abs(val) < 1e-9) return '0,000';
    return ((val >= 0 ? '+' : '') + val.toFixed(3)).replace('.', ',');
  }

  document.getElementById('cj-OA').innerHTML  = `${OA_bar} = ${fmtVal(oaVal)}`;
  document.getElementById('cj-OA2').innerHTML = `${OA2_bar} = ${fmtVal(oa2Val)}`;
  document.getElementById('cj-OF').innerHTML  = `${OF_bar} = ${fmtCj(ofVal)}`;

  document.getElementById('cj-invOA').innerHTML  = `1/${OA_bar} = ${fmtInvVal(invOA)}`;
  document.getElementById('cj-invOA2').innerHTML = `1/${OA2_bar} = ${fmtInvVal(invOA2)}`;
  document.getElementById('cj-invOF').innerHTML  = `1/${OF_bar} = ${fmtInvVal(invOF)}`;

  const sOA  = fmtInvVal(invOA);
  const sOF  = fmtInvVal(invOF);
  const sRes = fmtInvVal(invOA2);
  const cOA  = `<span class="col-OA">`;
  const cOA2 = `<span class="col-OA2">`;
  const cOF  = `<span class="col-OF">`;
  const ce   = `</span>`;
  document.getElementById('cj-verif').innerHTML =
    `${cOA2}1/${OA2_bar}${ce} = ${cOA}1/${OA_bar}${ce} + ${cOF}1/${OF_bar}${ce} = ${cOA}${sOA}${ce}${cOF}${sOF}${ce} = ${cOA2}${sRes}${ce}`;
}
