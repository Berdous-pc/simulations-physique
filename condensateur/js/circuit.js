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

// Coordonnées des 6 nœuds du circuit (A, B, C, D, E, F)
let pt = {};

// Protection anti-rebond du resize (une seule mise à jour par frame)
let resizePending = false;

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
    buildPoints();
    if (sim.phase === 'idle') initElectrons();

    for (const id of ['graph-Uc', 'graph-i']) {
      const c      = document.getElementById(id);
      const wrap   = c.parentElement;
      const wr     = wrap.getBoundingClientRect();
      const titleH = wrap.querySelector('.graph-title').offsetHeight + 3;
      const cCssW  = Math.floor(wr.width);
      const cCssH  = Math.max(Math.floor(wr.height) - titleH, 20);
      c.style.width  = cCssW + 'px';
      c.style.height = cCssH + 'px';
      c.width  = Math.round(cCssW * dpr);
      c.height = Math.round(cCssH * dpr);
      c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────
//  Calcule les coordonnées des 6 nœuds du circuit.
//
//  Topologie :
//    A ──R1──Gén── B
//    |              |
//    K(E)    C     F
//    |              |
//    D ────R2────── C_
// ─────────────────────────────────────────────────────────────────────
function buildPoints() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const ml = W * 0.15, mr = W * 0.15;
  const mt = H * 0.15, mb = H * 0.15;
  const x0 = ml, x1 = W - mr;
  const y0 = mt, y2 = H - mb;
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
  wire:          '#1a1a1a',
  wireCharge:    '#1a1a1a',
  wireDischarge: '#1a1a1a',
  compCharge:    '#2a6aaa',
  compDischarge: '#b04020',
  compInactive:  '#b0a898',
};

function wireColor(active, discharge) {
  if (!active) return COL.wire;
  return discharge ? COL.wireDischarge : COL.wireCharge;
}

function drawWire(x1, y1, x2, y2, active, discharge) {
  const col = wireColor(active, discharge);
  const sc  = circuitScale();
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth   = active ? 2.5 * sc : 1.5 * sc;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────
//  Flèche rouge indiquant le sens conventionnel du courant.
// ─────────────────────────────────────────────────────────────────────
function drawCurrentArrow(x1, y1, x2, y2) {
  const sc    = circuitScale();
  const col   = '#cc2200';
  const mx    = (x1 + x2) / 2;
  const my    = (y1 + y2) / 2;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const hs    = 12 * sc;

  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(angle);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo( hs,  0);
  ctx.lineTo(-hs, -6 * sc);
  ctx.lineTo(-hs,  6 * sc);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const isVertical = Math.abs(y2 - y1) > Math.abs(x2 - x1);
  ctx.save();
  ctx.font         = `bold ${Math.round(26 * sc)}px serif`;
  ctx.fillStyle    = col;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  if (!isVertical) {
    ctx.fillText('I', mx, my - 20 * sc);
  } else {
    const g           = getCircuitGeometry();
    const outsideLeft = Math.abs(x1 - g.A.x) < 20;
    ctx.fillText('I', mx + (outsideLeft ? -22 * sc : 22 * sc), my);
  }
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════
//  COMPOSANTS DU CIRCUIT
// ═══════════════════════════════════════════════════════════════════════

function drawGenerator(genX, genY, genR, active) {
  const sc = circuitScale();
  ctx.save();
  ctx.fillStyle   = '#fdf8f0';
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(genX, genY, genR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(genX - genR * 0.55, genY);
  ctx.lineTo(genX + genR * 0.55, genY);
  ctx.stroke();
  ctx.restore();

  const signOffset = genR + 16 * sc;
  const signY      = genY - genR * 0.5;
  ctx.save();
  ctx.font         = `bold ${Math.round(36 * sc)}px monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = 'rgba(210, 100, 20, 1)';
  ctx.fillText('+', genX + signOffset, signY);
  ctx.fillStyle    = 'rgba(40, 80, 180, 1)';
  ctx.fillText('−', genX - signOffset, signY);
  ctx.restore();

  ctx.save();
  ctx.fillStyle    = '#1a1a1a';
  ctx.font         = `bold ${Math.round(36 * sc)}px monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'bottom';
  const labelEY = Math.max(Math.round(36 * sc) + 2, genY - genR - 6 * sc);
  ctx.fillText('E', genX, labelEY);
  ctx.restore();
}

function drawResistor(cx, cy, label, active, discharge) {
  const sc  = circuitScale();
  const rw  = Math.min((pt.B.x - pt.A.x) * 0.28, 90 * sc);
  const rh  = 32 * sc;
  const col = discharge
    ? (active ? COL.compDischarge : COL.compInactive)
    : (active ? COL.compCharge    : COL.compInactive);

  ctx.save();
  ctx.fillStyle   = '#fdf8f0';
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.rect(cx - rw / 2, cy - rh / 2, rw, rh);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle    = '#1a1a1a';
  ctx.font         = `bold ${Math.round(28 * sc)}px monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, cx, cy - rh / 2 - 5 * sc);
  ctx.restore();

  return { lx: cx - rw / 2, rx: cx + rw / 2 };
}

// ─────────────────────────────────────────────────────────────────────
//  Condensateur plan (vue en coupe).
// ─────────────────────────────────────────────────────────────────────
const CAP_PLATE_W_BASE = 44;
const CAP_GAP_BASE     = 45;
const CAP_IONS_COLS    = 2;
const CAP_PLATE_W      = CAP_PLATE_W_BASE;

function capPlateW() { return CAP_PLATE_W_BASE * circuitScale(); }
function capGap()    { return CAP_GAP_BASE     * circuitScale(); }

const ELECTRON_OFFSETS = [
  { dx:  4, dy: -4 },
  { dx: -4, dy:  4 },
  { dx: -4, dy: -4 },
];

function drawCapacitor(cx, cy, active) {
  const sc  = circuitScale();
  const gap = capGap();
  const pw  = capPlateW();

  const nIons = nIonsFromC();
  const nRows = Math.ceil(nIons / CAP_IONS_COLS);
  const bh    = Math.max(80 * sc, nRows * 18 * sc + 16 * sc);

  const chargeRatio = sim.U > 0 ? Math.min(sim.Uc / sim.U, 1) : 0;
  const leftX  = cx - gap / 2;
  const rightX = cx + gap / 2;

  ctx.save();
  ctx.fillStyle = active ? '#eef3f8' : '#fdf8f0';
  ctx.fillRect(leftX - pw, cy - bh/2, pw, bh);
  ctx.fillRect(rightX,     cy - bh/2, pw, bh);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth   = 2;
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

  function drawIon(x, y) {
    ctx.save();
    ctx.fillStyle   = 'rgba(180, 80, 40, 0.75)';
    ctx.strokeStyle = 'rgba(180, 80, 40, 0.4)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.arc(x, y, 5 * sc, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle    = '#fff';
    ctx.font         = `bold ${Math.round(7 * sc)}px sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', x, y);
    ctx.restore();
  }

  for (const p of ionPositions) {
    drawIon(p.xL, p.y);
    drawIon(p.xR, p.y);
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
      const offBase = ELECTRON_OFFSETS[Math.min(layer, ELECTRON_OFFSETS.length - 1)];
      const off    = { dx: offBase.dx * sc, dy: offBase.dy * sc };
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

  if (chargeRatio > 0.05) {
    const alpha = Math.min(chargeRatio * 1.5, 1);
    ctx.save();
    ctx.font         = `bold ${Math.round(36 * sc)}px monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = `rgba(40, 80, 180, ${alpha})`;
    ctx.fillText('−', leftX  - pw/2, cy - bh/2 - 22 * sc);
    ctx.fillStyle    = `rgba(210, 100, 20, ${alpha})`;
    ctx.fillText('+', rightX + pw/2, cy - bh/2 - 22 * sc);
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle    = '#1a1a1a';
  ctx.font         = `bold ${Math.round(36 * sc)}px monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('C', cx, cy - bh / 2 - 34 * sc);
  ctx.restore();

  return { leftX, rightX, bh, pw };
}

// ─────────────────────────────────────────────────────────────────────
//  Interrupteur K
// ─────────────────────────────────────────────────────────────────────
function drawSwitch(armLen) {
  const sc = circuitScale();
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
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(contactUp.x,   contactUp.y,   5 * sc, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(contactDown.x, contactDown.y, 5 * sc, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#4a5a6a';
  ctx.lineWidth   = 2.5;
  ctx.beginPath(); ctx.moveTo(E.x, E.y); ctx.lineTo(bx, by); ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle   = '#e8e4de';
  ctx.strokeStyle = '#7a8a96';
  ctx.lineWidth   = 1.5;
  ctx.beginPath(); ctx.arc(E.x, E.y, 5 * sc, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle    = '#1a1a1a';
  ctx.font         = `bold ${Math.round(36 * sc)}px monospace`;
  ctx.textBaseline = 'middle';
  ctx.fillText('K', E.x + 18 * sc, E.y - 24 * sc);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════
//  SYSTÈME D'ÉLECTRONS
// ═══════════════════════════════════════════════════════════════════════

const ELECTRON_SPACING = 40;
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

  if (!pt.A) {
    wireElectrons = [];
    for (let i = 0; i < 20; i++) wireElectrons.push(i / 20);
    wireN0 = 20;
    return;
  }

  const g     = getCircuitGeometry();
  const path  = buildPathCharge(g);
  const L     = pathLength(path);
  const nWire = Math.max(1, Math.floor(L / ELECTRON_SPACING));

  wireElectrons = [];
  for (let i = 0; i < nWire; i++) wireElectrons.push((i + 0.5) / nWire);
  wireN0      = nWire;
  wireSettled = false;

  wireSpeedK = (sim.U > 0 && sim.C > 0)
    ? (nIonsFromC() * L) / (nWire * sim.C * sim.U)
    : 1;
}

// ─────────────────────────────────────────────────────────────────────
//  Facteur d'échelle du circuit.
// ─────────────────────────────────────────────────────────────────────
function circuitScale() {
  const REF_W = 1200, REF_H = 700;
  const raw = Math.min(canvas.clientWidth / REF_W, canvas.clientHeight / REF_H);
  return Math.pow(raw, 0.5);
}

function getCircuitGeometry() {
  const A = pt.A, B = pt.B, C_ = pt.C, D = pt.D, E = pt.E, F = pt.F;
  const sc          = circuitScale();
  const circuitW    = B.x - A.x;
  const rw          = Math.min(circuitW * 0.28, 90 * sc);
  const genR        = Math.min(circuitW * 0.18, 46 * sc);
  const r1X         = A.x + circuitW * 0.28;
  const genX        = A.x + circuitW * 0.68;
  const r2X         = (D.x + C_.x) / 2;
  const capX        = (E.x + F.x) / 2;
  const capY        = E.y;
  const gap         = CAP_GAP_BASE * sc;
  const pw          = CAP_PLATE_W_BASE * sc;
  const leftPlateX  = capX - gap / 2;
  const rightPlateX = capX + gap / 2;
  const armLen      = Math.min((E.y - A.y) * 0.45, 48 * sc);
  const contactUp   = { x: E.x, y: E.y - armLen };
  const contactDown = { x: E.x, y: E.y + armLen };
  return { A, B, C_, D, E, F, rw, genR, r1X, genX, r2X,
           capX, capY, leftPlateX, rightPlateX, armLen, contactUp, contactDown,
           gap, pw, sc };
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
    const U_finale = isCharge ? sim.U : 0;
    const U_ref    = Math.max(Math.abs(isCharge ? sim.U : sim.U0_dis), 0.01);
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

function drawElectronDot(x, y, alpha) {
  const sc = circuitScale();
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle   = '#2a6aaa';
  ctx.beginPath(); ctx.arc(x, y, 4 * sc, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle    = '#ffffff';
  ctx.font         = `bold ${Math.round(7 * sc)}px sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('−', x, y);
  ctx.restore();
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fdf8f0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const A = pt.A, B = pt.B, C_ = pt.C, D = pt.D, E = pt.E, F = pt.F;
  const chg = sim.phase === 'charge';
  const dis  = sim.phase === 'discharge';
  const sc   = circuitScale();

  const circuitW = B.x - A.x;
  const rw       = Math.min(circuitW * 0.28, 90 * sc);
  const genR     = Math.min(circuitW * 0.18, 46 * sc);
  const r1X      = A.x + circuitW * 0.28;
  const genX     = A.x + circuitW * 0.68;
  const genY     = A.y;
  const r2X      = (D.x + C_.x) / 2;
  const capX     = (E.x + F.x) / 2;
  const capY     = E.y;

  const gap         = CAP_GAP_BASE * sc;
  const pw          = CAP_PLATE_W_BASE * sc;
  const leftPlateX  = capX - gap / 2;
  const rightPlateX = capX + gap / 2;

  const armLen      = Math.min((E.y - A.y) * 0.45, 48 * sc);
  const contactUp   = { x: E.x, y: E.y - armLen };
  const contactDown = { x: E.x, y: E.y + armLen };

  // Résistances (dessinées en premier pour récupérer les coordonnées de raccord)
  const r1 = drawResistor(r1X, A.y,  'R₁', chg, false);
  const r2 = drawResistor(r2X, C_.y, 'R₂', dis, true);

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
  const threshold = (sim.U / Math.min(sim.R1, sim.R2)) * 0.005;

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
  drawResistor(r1X,  A.y,  'R₁', chg, false);
  drawGenerator(genX, genY, genR, chg);
  drawResistor(r2X,  C_.y, 'R₂', dis, true);
  drawCapacitor(capX, capY, chg || dis);
  drawSwitch(armLen);

  // ── Électrons (par-dessus tout le reste) ──
  updateAndDrawElectrons(dt_scene);
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
