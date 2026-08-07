// ═══════════════════════════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
//  circuit.js — Dessin du circuit électrique + système d'électrons
//  Dépend de : sim.js (sim, currentI, tau)
// ═══════════════════════════════════════════════════════════════════════

// ── Canvas du circuit ──
const canvas = document.getElementById('circuit-canvas');
const ctx    = canvas.getContext('2d');

// Coordonnées des 6 nœuds du circuit (A, B, C, D, E, F), en unités virtuelles
let pt = {};

// Protection anti-rebond du resize (une seule mise à jour par frame)
let resizePending = false;

// ═══════════════════════════════════════════════════════════════════════
//  REPÈRE VIRTUEL
//
//  Tout le schéma est dessiné dans un repère fixe VW × VH, puis ramené au
//  canvas par une homothétie unique (facteur `view.k` + centrage). Deux
//  conséquences :
//    — ce qui ne se chevauche pas à la taille de référence ne se chevauchera
//      jamais, quelles que soient la taille et le format de la fenêtre ;
//    — toutes les constantes de ce fichier sont des longueurs de la maquette,
//      directement lisibles, sans facteur d'échelle disséminé.
// ═══════════════════════════════════════════════════════════════════════
const VW = 1200, VH = 700;

let view = { k: 1, ox: 0, oy: 0 };

function computeView() {
  const W = canvas.clientWidth  || VW;
  const H = canvas.clientHeight || VH;
  const k = Math.min(W / VW, H / VH);
  view.k  = k;
  view.ox = (W - VW * k) / 2;
  view.oy = (H - VH * k) / 2;
}

// ─────────────────────────────────────────────────────────────────────
//  Grossissement du texte sur les petites fenêtres.
//
//  L'homothétie stricte rendrait les étiquettes illisibles sur une zone
//  courte. On les regrossit donc, mais d'un facteur **plafonné** : la
//  maquette virtuelle réserve la place correspondant au grossissement
//  maximal, si bien que le boost ne peut pas provoquer de collision.
// ─────────────────────────────────────────────────────────────────────
const TEXT_BOOST_FROM = 0.5;   // en dessous de ce k, le texte regrossit
const TEXT_BOOST_MAX  = 1.35;  // plafond du grossissement

function textScale() {
  return Math.min(TEXT_BOOST_MAX, Math.max(1, TEXT_BOOST_FROM / view.k));
}

// ─────────────────────────────────────────────────────────────────────
//  Épaisseur de trait : jamais moins de ~1,1 px réel une fois l'homothétie
//  appliquée, sinon les contours disparaissent sur les petites fenêtres.
// ─────────────────────────────────────────────────────────────────────
function strokeW(v) {
  return Math.max(v, 1.1 / view.k);
}

// ── Tailles de police de la maquette (avant boost) ──
const FS_LABEL = 34;   // E, R₁, R₂, C, K, signes + / −
const FS_I     = 26;   // étiquette des flèches de courant

function fsLabel() { return FS_LABEL * textScale(); }
function fsI()     { return FS_I     * textScale(); }

// ── Dimensions fixes des composants (unités virtuelles) ──
const RES_W = 90, RES_H = 34;
const GEN_R = 46;

// ─────────────────────────────────────────────────────────────────────
//  Adapte les dimensions des canvas (circuit + graphes) à la fenêtre.
// ─────────────────────────────────────────────────────────────────────
function resize() {
  if (resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => {
    resizePending = false;

    const dpr  = window.devicePixelRatio || 1;
    const area = document.getElementById('circuit-area');
    const ar   = area.getBoundingClientRect();
    const cssW = Math.floor(ar.width);
    const cssH = Math.floor(ar.height);
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    computeView();
    buildPoints();
    if (sim.phase === 'idle') initElectrons();

    for (const id of ['graph-Uc', 'graph-i']) {
      const c      = document.getElementById(id);
      const wrap   = c.parentElement;
      // clientWidth/Height et non getBoundingClientRect() : depuis que c'est
      // le wrapper qui porte la bordure du cadre, le rect inclurait ces 2 px
      // et le canvas déborderait de son cadre arrondi.
      const cCssW  = Math.floor(wrap.clientWidth);
      const cCssH  = Math.max(Math.floor(wrap.clientHeight), 20);
      c.style.width  = cCssW + 'px';
      c.style.height = cCssH + 'px';
      c.width  = Math.round(cCssW * dpr);
      c.height = Math.round(cCssH * dpr);
      c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────
//  Coordonnées des 6 nœuds, en unités virtuelles (donc constantes).
//
//  Topologie :
//    A ──R1──Gén── B
//    |              |
//    K(E)    C     F
//    |              |
//    D ────R2────── C_
//
//  Les marges n'ont plus à héberger d'étiquettes : les labels des
//  composants sont posés du côté **intérieur** de leur branche, dans
//  l'espace libre au centre du circuit (cf. drawGenerator / drawResistor).
// ─────────────────────────────────────────────────────────────────────
function buildPoints() {
  const mx = VW * 0.13, my = VH * 0.10;
  const x0 = mx, x1 = VW - mx;
  const y0 = my, y2 = VH - my;
  const y1 = (y0 + y2) / 2;
  pt.A = { x: x0, y: y0 };
  pt.B = { x: x1, y: y0 };
  pt.C = { x: x1, y: y2 };
  pt.D = { x: x0, y: y2 };
  pt.E = { x: x0, y: y1 };
  pt.F = { x: x1, y: y1 };
}

// ═══════════════════════════════════════════════════════════════════════
//  UTILITAIRES DE DESSIN
// ═══════════════════════════════════════════════════════════════════════

const COL = {
  neutral:       '#1a1a1a',
  charge:        '#2a6aaa',
  discharge:     '#b04020',
  inactive:      '#b0a898',
  bg:            '#fdf8f0',
  fillCharge:    '#e9f1f9',
  fillDischarge: '#faece6',
  arrow:         '#cc2200',
};

// Couleur d'une branche : noire au repos, colorée quand elle conduit,
// grisée quand c'est l'autre branche qui conduit.
function branchColor(active, discharge) {
  if (sim.phase === 'idle') return COL.neutral;
  if (!active)              return COL.inactive;
  return discharge ? COL.discharge : COL.charge;
}

function branchFill(active, discharge) {
  if (sim.phase === 'idle' || !active) return COL.bg;
  return discharge ? COL.fillDischarge : COL.fillCharge;
}

function drawWire(x1, y1, x2, y2, active, discharge) {
  const live = active && sim.phase !== 'idle';
  ctx.save();
  ctx.strokeStyle = branchColor(active, discharge);
  ctx.lineWidth   = strokeW(live ? 4 : 2.5);
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────
//  Flèche rouge indiquant le sens conventionnel du courant.
//  L'étiquette « I » est toujours posée à l'extérieur du circuit :
//  au-dessus des segments horizontaux, du côté du bord le plus proche
//  pour les segments verticaux.
// ─────────────────────────────────────────────────────────────────────
function drawCurrentArrow(x1, y1, x2, y2) {
  const mx    = (x1 + x2) / 2;
  const my    = (y1 + y2) / 2;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const hs    = 13;

  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(angle);
  ctx.fillStyle = COL.arrow;
  ctx.beginPath();
  ctx.moveTo( hs,  0);
  ctx.lineTo(-hs, -7);
  ctx.lineTo(-hs,  7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const isVertical = Math.abs(y2 - y1) > Math.abs(x2 - x1);
  ctx.save();
  ctx.font         = `bold ${fsI()}px serif`;
  ctx.fillStyle    = COL.arrow;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  if (!isVertical) {
    ctx.fillText('I', mx, my - 22);
  } else {
    ctx.fillText('I', mx + (mx < VW / 2 ? -26 : 26), my);
  }
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════
//  COMPOSANTS DU CIRCUIT
// ═══════════════════════════════════════════════════════════════════════

function drawGenerator(genX, genY, genR, active) {
  const col = branchColor(active, false);

  ctx.save();
  ctx.fillStyle   = branchFill(active, false);
  ctx.strokeStyle = col;
  ctx.lineWidth   = strokeW(2.5);
  ctx.beginPath();
  ctx.arc(genX, genY, genR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(genX - genR * 0.55, genY);
  ctx.lineTo(genX + genR * 0.55, genY);
  ctx.stroke();
  ctx.restore();

  // Bornes + / − : dans la marge extérieure, de part et d'autre du cercle.
  const fs = fsLabel();
  ctx.save();
  ctx.font         = `bold ${fs}px monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = '#d26414';
  ctx.fillText('+', genX + genR + 16, genY - genR * 0.5);
  ctx.fillStyle    = '#2850b4';
  ctx.fillText('−', genX - genR - 16, genY - genR * 0.5);
  ctx.restore();

  // Étiquette E : côté intérieur du circuit, sous la branche du haut.
  ctx.save();
  ctx.fillStyle    = COL.neutral;
  ctx.font         = `bold ${fs}px monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('E', genX, genY + genR + 10);
  ctx.restore();
}

// `inside` : sens vers l'intérieur du circuit (+1 = label sous le composant).
function drawResistor(cx, cy, label, active, discharge, inside) {
  const col = branchColor(active, discharge);
  const fs  = fsLabel();

  ctx.save();
  ctx.fillStyle   = branchFill(active, discharge);
  ctx.strokeStyle = col;
  ctx.lineWidth   = strokeW(2.5);
  ctx.beginPath();
  ctx.rect(cx - RES_W / 2, cy - RES_H / 2, RES_W, RES_H);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle    = col;
  ctx.font         = `bold ${fs}px monospace`;
  ctx.textAlign    = 'center';
  if (inside > 0) {
    ctx.textBaseline = 'top';
    ctx.fillText(label, cx, cy + RES_H / 2 + 10);
  } else {
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, cx, cy - RES_H / 2 - 10);
  }
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════
//  CHARGES (billes − et +)
//
//  Le signe est tracé au trait et non en glyphe : à ces tailles, un
//  caractère « − » de 7 px se réduisait à une tache grise après
//  antialiasing. Le volume vient du seul dégradé radial : ni halo, ni reflet
//  — les électrons chevauchent leur ion, tout cerne les en séparerait, et
//  le rendu doit rester sobre vu la densité de billes le long du fil.
// ═══════════════════════════════════════════════════════════════════════
const ELECTRON_R = 6;
const ION_R      = 9;

const PAL_ELECTRON = { light: '#6ba6de', dark: '#1d4f85', edge: 'rgba(14,42,72,0.85)' };
const PAL_ION      = { light: '#e79063', dark: '#a8431c', edge: 'rgba(118,44,14,0.85)' };

function drawChargeBead(x, y, r, sign, pal) {
  ctx.save();

  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.12, x, y, r);
  g.addColorStop(0, pal.light);
  g.addColorStop(1, pal.dark);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = pal.edge;
  ctx.lineWidth   = strokeW(0.9);
  ctx.stroke();

  const a = r * 0.52;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth   = Math.max(r * 0.26, strokeW(1.1));
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(x - a, y); ctx.lineTo(x + a, y);
  if (sign > 0) { ctx.moveTo(x, y - a); ctx.lineTo(x, y + a); }
  ctx.stroke();

  ctx.restore();
}

function drawElectronDot(x, y, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  drawChargeBead(x, y, ELECTRON_R, -1, PAL_ELECTRON);
  ctx.restore();
}

function drawIonDot(x, y) {
  drawChargeBead(x, y, ION_R, +1, PAL_ION);
}

// ─────────────────────────────────────────────────────────────────────
//  Condensateur plan (vue en coupe).
//
//  Chaque armature porte un réseau d'ions + fixes. Les électrons sont
//  « accrochés » en diagonale à leur ion, en le **chevauchant** : le premier
//  en haut à droite, le second en bas à gauche.
//
//  État lu par le nombre d'électrons par site :
//    armature neutre   → 1 électron par ion
//    armature négative → 2 électrons par ion
//    armature positive → ion nu
//
//  CAP_IONS_COLS se bascule à 2 ou 3 sans rien d'autre à toucher : tout le
//  reste (largeur et hauteur d'armature) en découle. Le chevauchement rend le
//  site assez compact pour que 2 colonnes — donc 15 rangées à 500 µF —
//  tiennent dans la maille du circuit avec les charges à pleine taille.
// ─────────────────────────────────────────────────────────────────────
const CAP_IONS_COLS    = 2;
const CAP_OFF          = ION_R * 0.8;                             // ≈ 7,2
const CAP_SITE_R       = CAP_OFF + ELECTRON_R;                    // ≈ 13,2
const CAP_COL_PITCH    = 2 * CAP_SITE_R + 4;                      // ≈ 30,4
const CAP_ROW_PITCH    = 2 * CAP_SITE_R + 1;                      // ≈ 27,4
const CAP_PLATE_W_BASE = CAP_IONS_COLS * CAP_COL_PITCH;           // ≈ 61
const CAP_GAP_BASE     = 54;
const CAP_MIN_H        = 90;

// Position des électrons autour de leur ion, par couche.
const ELECTRON_OFFSETS = [
  { dx:  CAP_OFF, dy: -CAP_OFF },
  { dx: -CAP_OFF, dy:  CAP_OFF },
  { dx: -CAP_OFF, dy: -CAP_OFF },
];

function capPlateH(nIons) {
  const nRows = Math.ceil(nIons / CAP_IONS_COLS);
  return Math.max(CAP_MIN_H, nRows * CAP_ROW_PITCH);
}

function drawCapacitor(cx, cy, active) {
  const gap = CAP_GAP_BASE;
  const pw  = CAP_PLATE_W_BASE;

  const nIons = nIonsFromC();
  const nRows = Math.ceil(nIons / CAP_IONS_COLS);
  const bh    = capPlateH(nIons);

  const chargeRatio = sim.E > 0 ? Math.min(sim.Uc / sim.E, 1) : 0;
  const leftX  = cx - gap / 2;
  const rightX = cx + gap / 2;
  const dis       = sim.phase === 'discharge';
  const plateFill = active ? branchFill(true, dis) : COL.bg;

  ctx.save();
  ctx.fillStyle = plateFill;
  ctx.fillRect(leftX - pw, cy - bh/2, pw, bh);
  ctx.fillRect(rightX,     cy - bh/2, pw, bh);
  ctx.strokeStyle = COL.neutral;
  ctx.lineWidth   = strokeW(2.5);
  ctx.strokeRect(leftX - pw, cy - bh/2, pw, bh);
  ctx.strokeRect(rightX,     cy - bh/2, pw, bh);
  ctx.restore();

  const ionPositions = [];
  for (let row = 0; row < nRows; row++) {
    const y = cy - bh/2 + (row + 0.5) * (bh / nRows);
    for (let col = 0; col < CAP_IONS_COLS; col++) {
      if (ionPositions.length >= nIons) break;
      const t = (col + 0.5) / CAP_IONS_COLS;
      ionPositions.push({ xL: leftX - pw + t * pw, xR: rightX + t * pw, y });
    }
  }

  for (const p of ionPositions) {
    drawIonDot(p.xL, p.y);
    drawIonDot(p.xR, p.y);
  }

  const drawOrder = [];
  for (let c = CAP_IONS_COLS - 1; c >= 0; c--) {
    for (let row = 0; row < nRows; row++) {
      const idx = row * CAP_IONS_COLS + c;
      if (idx < nIons) drawOrder.push(idx);
    }
  }

  function drawPlateElectrons(nElectrons, useLeft) {
    const filling = useLeft
      ? sim.phase === 'charge'
      : sim.phase === 'discharge';
    for (let k = 0; k < nElectrons; k++) {
      const orderIdx = filling
        ? k % drawOrder.length
        : drawOrder.length - 1 - (k % drawOrder.length);
      const ionIdx = drawOrder[orderIdx];
      const layer  = Math.floor(k / drawOrder.length);
      const off    = ELECTRON_OFFSETS[Math.min(layer, ELECTRON_OFFSETS.length - 1)];
      const pos    = ionPositions[ionIdx];
      if (!pos) break;
      drawElectronDot(
        (useLeft ? pos.xL : pos.xR) + off.dx,
        pos.y + off.dy,
        1.0
      );
    }
  }
  drawPlateElectrons(nOnPlateLeft,  true);
  drawPlateElectrons(nOnPlateRight, false);

  // Étiquettes au-dessus du condensateur : − | C | + sur une même ligne.
  const fs     = fsLabel();
  const labelY = cy - bh/2 - 12;
  ctx.save();
  ctx.font         = `bold ${fs}px monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle    = COL.neutral;
  ctx.fillText('C', cx, labelY);
  if (chargeRatio > 0.05) {
    const alpha = Math.min(chargeRatio * 1.5, 1);
    ctx.fillStyle = `rgba(40, 80, 180, ${alpha})`;
    ctx.fillText('−', leftX  - pw/2, labelY);
    ctx.fillStyle = `rgba(210, 100, 20, ${alpha})`;
    ctx.fillText('+', rightX + pw/2, labelY);
  }
  ctx.restore();

  return { leftX, rightX, bh, pw };
}

// ─────────────────────────────────────────────────────────────────────
//  Interrupteur K
// ─────────────────────────────────────────────────────────────────────
function drawSwitch(armLen) {
  const E = pt.E;
  const contactUp   = { x: E.x, y: E.y - armLen };
  const contactDown = { x: E.x, y: E.y + armLen };

  const angle =
    sim.phase === 'charge'    ? -Math.PI / 2 :
    sim.phase === 'discharge' ? +Math.PI / 2 :
                                -Math.PI / 3;

  const bx = E.x + Math.cos(angle) * armLen;
  const by = E.y + Math.sin(angle) * armLen;

  ctx.save();
  ctx.fillStyle = COL.neutral;
  ctx.beginPath(); ctx.arc(contactUp.x,   contactUp.y,   6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(contactDown.x, contactDown.y, 6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#4a5a6a';
  ctx.lineWidth   = strokeW(3.5);
  ctx.lineCap     = 'round';
  ctx.beginPath(); ctx.moveTo(E.x, E.y); ctx.lineTo(bx, by); ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle   = '#e8e4de';
  ctx.strokeStyle = '#7a8a96';
  ctx.lineWidth   = strokeW(1.8);
  ctx.beginPath(); ctx.arc(E.x, E.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle    = COL.neutral;
  ctx.font         = `bold ${fsLabel()}px monospace`;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('K', E.x + 16, E.y - 20);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════
//  SYSTÈME D'ÉLECTRONS
// ═══════════════════════════════════════════════════════════════════════

const ELECTRON_SPACING = 42;
const C_MIN_UF    = 100;
const C_MAX_UF    = 500;
const IONS_AT_CMIN = 6;
const IONS_AT_CMAX = 30;

let nOnPlateLeft  = 6;
let nOnPlateRight = 6;
let wireElectrons = [];
let wireN0        = 1;
let wireSpeedK    = 1;
let wireSettled   = false;

function nIonsFromC() {
  const C_uf = sim.C * 1e6;
  const t = Math.max(0, Math.min(1, (C_uf - C_MIN_UF) / (C_MAX_UF - C_MIN_UF)));
  return Math.round(IONS_AT_CMIN + t * (IONS_AT_CMAX - IONS_AT_CMIN));
}

function initElectrons() {
  const nIons = nIonsFromC();
  nOnPlateLeft  = nIons;
  nOnPlateRight = nIons;

  if (!pt.A) buildPoints();

  const g     = getCircuitGeometry();
  const path  = buildPathCharge(g);
  const L     = pathLength(path);
  const nWire = Math.max(1, Math.floor(L / ELECTRON_SPACING));

  wireElectrons = [];
  for (let i = 0; i < nWire; i++) wireElectrons.push((i + 0.5) / nWire);
  wireN0      = nWire;
  wireSettled = false;

  wireSpeedK = (sim.E > 0 && sim.C > 0)
    ? (nIonsFromC() * L) / (nWire * sim.C * sim.E)
    : 1;
}

// ─────────────────────────────────────────────────────────────────────
//  Géométrie dérivée — **source unique**, consommée aussi bien par
//  drawScene() que par les chemins d'électrons.
// ─────────────────────────────────────────────────────────────────────
function getCircuitGeometry() {
  const A = pt.A, B = pt.B, C_ = pt.C, D = pt.D, E = pt.E, F = pt.F;
  const circuitW    = B.x - A.x;
  const rw          = RES_W;
  const genR        = GEN_R;
  const r1X         = A.x + circuitW * 0.28;
  const genX        = A.x + circuitW * 0.68;
  const r2X         = (D.x + C_.x) / 2;
  const capX        = (E.x + F.x) / 2;
  const capY        = E.y;
  const gap         = CAP_GAP_BASE;
  const pw          = CAP_PLATE_W_BASE;
  const leftPlateX  = capX - gap / 2;
  const rightPlateX = capX + gap / 2;
  const armLen      = Math.min((E.y - A.y) * 0.45, 52);
  const contactUp   = { x: E.x, y: E.y - armLen };
  const contactDown = { x: E.x, y: E.y + armLen };
  const r1          = { lx: r1X - rw / 2, rx: r1X + rw / 2 };
  const r2          = { lx: r2X - rw / 2, rx: r2X + rw / 2 };
  return { A, B, C_, D, E, F, rw, genR, r1X, genX, r2X, r1, r2,
           capX, capY, leftPlateX, rightPlateX, armLen, contactUp, contactDown,
           gap, pw };
}

// ─────────────────────────────────────────────────────────────────────
//  Chemins des électrons
// ─────────────────────────────────────────────────────────────────────
function buildPathCharge(g) {
  const { A, B, E, F, rw, genR, r1X, genX, leftPlateX, rightPlateX, capY, contactUp, pw } = g;
  return [
    { x: rightPlateX + pw, y: capY },
    { x: F.x,  y: F.y },
    { x: B.x,  y: B.y },
    { x: genX + genR,  y: A.y },
    { x: genX - genR,  y: A.y, hidden: true },
    { x: r1X  + rw/2,  y: A.y },
    { x: r1X  - rw/2,  y: A.y, hidden: true },
    { x: A.x,  y: A.y },
    { x: contactUp.x, y: contactUp.y },
    { x: E.x,  y: E.y },
    { x: leftPlateX - pw, y: capY },
  ];
}

function buildPathDischarge(g) {
  const { C_, D, E, F, rw, r2X, leftPlateX, rightPlateX, capY, contactDown, pw } = g;
  return [
    { x: leftPlateX - pw, y: capY },
    { x: E.x,  y: E.y },
    { x: contactDown.x, y: contactDown.y },
    { x: D.x,  y: D.y },
    { x: r2X  - rw/2,  y: D.y },
    { x: r2X  + rw/2,  y: D.y, hidden: true },
    { x: C_.x, y: C_.y },
    { x: F.x,  y: F.y },
    { x: rightPlateX + pw, y: capY },
  ];
}

function pathLength(path) {
  let len = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const dx = path[i+1].x - path[i].x;
    const dy = path[i+1].y - path[i].y;
    len += Math.sqrt(dx*dx + dy*dy);
  }
  return len;
}

function posToXY(path, p) {
  const total = pathLength(path);
  let dist = ((p % 1) + 1) % 1 * total;
  for (let i = 0; i < path.length - 1; i++) {
    const dx  = path[i+1].x - path[i].x;
    const dy  = path[i+1].y - path[i].y;
    const seg = Math.sqrt(dx*dx + dy*dy);
    if (dist <= seg + 0.001) {
      const t = seg > 0 ? Math.min(dist / seg, 1) : 0;
      return {
        x:      path[i].x + dx * t,
        y:      path[i].y + dy * t,
        hidden: path[i+1].hidden === true,
      };
    }
    dist -= seg;
  }
  return { ...path[path.length - 1], hidden: false };
}

// ─────────────────────────────────────────────────────────────────────
//  Mise à jour des électrons sur le fil pour une frame dt.
// ─────────────────────────────────────────────────────────────────────
function updateElectrons(path, I_now, dt) {
  if (wireSettled) return;

  const L = pathLength(path);
  if (L === 0) return;

  const nIons    = nIonsFromC();
  const isCharge = sim.phase === 'charge';
  const tau_s    = sim.C * (isCharge ? sim.R1 : sim.R2);
  const t_s      = sim.t / 1000;
  const spacing0 = 1 / wireN0;

  const targetLeft  = isCharge ? nIons * 2 : nIons;
  const targetRight = isCharge ? 0         : nIons;

  const n_restant   = isCharge ? (nOnPlateRight - targetRight) : (nOnPlateLeft - targetLeft);
  const t_restant_s = Math.max(6 * tau_s - t_s, dt / 1000);
  const speedFloor  = (Math.max(n_restant, 0) * L / wireN0) / t_restant_s;
  const speedPx     = Math.max(wireSpeedK * Math.abs(I_now), speedFloor);
  const dp_raw      = (speedPx * dt / 1000) / L;

  const nSteps = Math.max(1, Math.ceil(dp_raw / spacing0));
  const dp     = dp_raw / nSteps;

  for (let step = 0; step < nSteps; step++) {
    const srcCount  = isCharge ? nOnPlateRight : nOnPlateLeft;
    const srcTarget = isCharge ? targetRight   : targetLeft;
    if (srcCount <= srcTarget) { wireSettled = true; break; }

    for (let i = 0; i < wireElectrons.length; i++) wireElectrons[i] += dp;

    let arrived = 0;
    const remaining = [];
    for (const p of wireElectrons) {
      if (p >= 1) arrived++;
      else remaining.push(p);
    }
    wireElectrons = remaining;

    for (let i = 0; i < arrived; i++) {
      if (isCharge) nOnPlateLeft  = Math.min(nOnPlateLeft  + 1, targetLeft);
      else          nOnPlateRight = Math.min(nOnPlateRight + 1, targetRight);
      const src = isCharge ? nOnPlateRight : nOnPlateLeft;
      const tgt = isCharge ? targetRight   : targetLeft;
      if (src > tgt) {
        wireElectrons.push(0);
        if (isCharge) nOnPlateRight--;
        else          nOnPlateLeft--;
      }
    }

    wireElectrons.sort((a, b) => a - b);
  }

  if (nOnPlateLeft === targetLeft && nOnPlateRight === targetRight) {
    const U_finale = isCharge ? sim.E : 0;
    const U_ref    = Math.max(Math.abs(isCharge ? sim.E : sim.U0_dis), 0.01);
    if (Math.abs(sim.Uc - U_finale) / U_ref < 0.01) wireSettled = true;
  }
}

function drawElectronsOnPath(path) {
  for (const pos of wireElectrons) {
    const { x, y, hidden } = posToXY(path, pos);
    if (hidden) continue;
    drawElectronDot(x, y, 1.0);
  }
}

function updateAndDrawElectrons(dt) {
  const g          = getCircuitGeometry();
  const activePath = sim.phase === 'discharge'
    ? buildPathDischarge(g)
    : buildPathCharge(g);

  if (sim.phase !== 'idle') {
    updateElectrons(activePath, Math.abs(currentI()), dt);
  }

  drawElectronsOnPath(activePath);
}

// ═══════════════════════════════════════════════════════════════════════
//  SCÈNE COMPLÈTE (redessinée à chaque frame)
// ═══════════════════════════════════════════════════════════════════════
function drawScene(dt_scene) {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(view.ox, view.oy);
  ctx.scale(view.k, view.k);

  const g = getCircuitGeometry();
  const { A, B, C_, D, E, F, genR, genX, r1X, r2X, r1, r2,
          capX, capY, leftPlateX, rightPlateX, armLen,
          contactUp, contactDown, pw } = g;

  const chg = sim.phase === 'charge';
  const dis = sim.phase === 'discharge';

  // ── Fils ──
  drawWire(A.x,         A.y, r1.lx,        A.y, chg, false);
  drawWire(r1.rx,       A.y, genX - genR,  A.y, chg, false);
  drawWire(genX + genR, A.y, B.x,          A.y, chg, false);
  drawWire(B.x, B.y, F.x, F.y,   chg, false);
  drawWire(F.x, F.y, C_.x, C_.y, dis, true);
  drawWire(C_.x, C_.y, r2.rx, C_.y, dis, true);
  drawWire(r2.lx, C_.y, D.x,  C_.y, dis, true);
  drawWire(A.x, A.y, contactUp.x,   contactUp.y,   chg, false);
  drawWire(contactDown.x, contactDown.y, D.x, D.y, dis, true);
  drawWire(E.x,          E.y,  leftPlateX - pw,  capY, (chg || dis), dis);
  drawWire(rightPlateX + pw, capY, F.x,           F.y,  (chg || dis), dis);

  // ── Flèches de courant ──
  const I         = currentI();
  const threshold = (sim.E / Math.min(sim.R1, sim.R2)) * 0.005;

  if (chg && Math.abs(I) > threshold) {
    drawCurrentArrow(A.x,         A.y, r1.lx,       A.y);
    drawCurrentArrow(r1.rx,       A.y, genX - genR, A.y);
    drawCurrentArrow(genX + genR, A.y, B.x,         A.y);
    drawCurrentArrow(B.x, B.y, F.x, F.y);
    drawCurrentArrow(rightPlateX + pw, capY, E.x, E.y);
    drawCurrentArrow(contactUp.x, contactUp.y,  A.x, A.y);
  }

  if (dis && Math.abs(I) > threshold) {
    drawCurrentArrow(rightPlateX + pw, capY,  F.x,  F.y);
    drawCurrentArrow(F.x,   F.y,   C_.x,  C_.y);
    drawCurrentArrow(C_.x,  C_.y,  r2.rx, C_.y);
    drawCurrentArrow(r2.lx, C_.y,  D.x,   D.y);
    drawCurrentArrow(D.x,   D.y,   contactDown.x, contactDown.y);
    drawCurrentArrow(E.x,   E.y,   leftPlateX - pw, capY);
  }

  // ── Composants (par-dessus les fils) ──
  drawResistor(r1X,  A.y,  'R₁', chg, false, +1);
  drawGenerator(genX, A.y, genR, chg);
  drawResistor(r2X,  C_.y, 'R₂', dis, true, -1);
  drawCapacitor(capX, capY, chg || dis);
  drawSwitch(armLen);

  // ── Électrons (par-dessus tout le reste) ──
  updateAndDrawElectrons(dt_scene);

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════
//  SPLITTER DRAGGABLE (entre circuit et graphes)
// ═══════════════════════════════════════════════════════════════════════
(function initSplitter() {
  const splitter  = document.getElementById('left-splitter');
  const circuitEl = document.getElementById('circuit-area');
  const graphEl   = document.getElementById('graph-area');
  const leftCol   = document.getElementById('left-col');
  const minH      = 80;
  let dragging    = false;
  let startY      = 0;
  let startCircH  = 0;
  let ratio       = null; // proportion circuit / left-col, conservée au resize

  function applyRatio(r) {
    const colH    = leftCol.getBoundingClientRect().height;
    const splH    = splitter.getBoundingClientRect().height;
    const avail   = colH - splH;
    const newCircH = Math.max(minH, Math.min(avail - minH, Math.round(r * avail)));
    const newGraphH = avail - newCircH;
    circuitEl.style.flex   = 'none';
    circuitEl.style.height = newCircH + 'px';
    graphEl.style.flex     = 'none';
    graphEl.style.height   = newGraphH + 'px';
    resize();
  }

  splitter.addEventListener('mousedown', e => {
    dragging   = true;
    startY     = e.clientY;
    startCircH = circuitEl.getBoundingClientRect().height;
    splitter.classList.add('dragging');
    document.body.style.cursor = 'row-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dy      = e.clientY - startY;
    const colH    = leftCol.getBoundingClientRect().height;
    const splH    = splitter.getBoundingClientRect().height;
    const avail   = colH - splH;
    const newCircH = Math.max(minH, Math.min(avail - minH, startCircH + dy));
    ratio = newCircH / avail;
    const newGraphH = avail - newCircH;
    circuitEl.style.flex   = 'none';
    circuitEl.style.height = newCircH + 'px';
    graphEl.style.flex     = 'none';
    graphEl.style.height   = newGraphH + 'px';
    resize();
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove('dragging');
    document.body.style.cursor = '';
  });

  // Recalcul de la proportion quand la fenêtre change de taille
  window.addEventListener('resize', () => {
    if (ratio === null) return;
    applyRatio(ratio);
  });
})();
