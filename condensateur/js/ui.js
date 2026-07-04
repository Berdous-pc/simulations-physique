// ═══════════════════════════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
//  ui.js — Contrôles UI, boucle d'animation, initialisation
//  Dépend de : sim.js, circuit.js, graph.js
// ═══════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────
//  Lance une phase de charge ou de décharge.
// ─────────────────────────────────────────────────────────────────────
function setPhase(p) {
  if (sim.phase === p) return;
  if (p === 'discharge') sim.U0_dis = sim.Uc;
  if (p === 'charge')    sim.U0_chg = sim.Uc;
  sim.phase      = p;
  sim.t          = 0;
  sim.syncFrozen = false;

  const g     = getCircuitGeometry();
  const path  = p === 'discharge' ? buildPathDischarge(g) : buildPathCharge(g);
  const L     = pathLength(path);
  const nWire = Math.max(1, Math.floor(L / ELECTRON_SPACING));
  wireElectrons = [];
  for (let i = 0; i < nWire; i++) wireElectrons.push((i + 0.5) / nWire);
  wireN0      = nWire;
  wireSettled = false;

  const uc0 = sim.Uc;
  const i0  = p === 'charge'
    ? (sim.U - uc0) / sim.R1 * 1000
    : -uc0 / sim.R2 * 1000;
  sim.graphUc.push({ t: sim.tTotal, v: uc0 });
  sim.graphI.push({  t: sim.tTotal, v: i0  });

  document.getElementById('btn-charge').classList.toggle('active',    p === 'charge');
  document.getElementById('btn-discharge').classList.toggle('active', p === 'discharge');
  const el = document.getElementById('state-text');
  el.textContent = p === 'charge' ? '⚡ Phase de charge en cours…' : '↩ Phase de décharge en cours…';
  el.style.color = p === 'charge' ? '#4a90d9' : '#e86020';
}

// ─────────────────────────────────────────────────────────────────────
//  Bascule entre pause et lecture.
// ─────────────────────────────────────────────────────────────────────
function togglePause() {
  sim.paused = !sim.paused;
  const btn = document.getElementById('btn-playpause');
  btn.textContent = sim.paused ? '▶ Lecture' : '⏸ Pause';
  btn.classList.toggle('paused', sim.paused);
}

// ─────────────────────────────────────────────────────────────────────
//  Change le facteur d'accélération du temps.
// ─────────────────────────────────────────────────────────────────────
function setTimeScale(v) {
  sim.timeScale = v;
  document.querySelectorAll('.btn-speed').forEach(b => {
    b.classList.toggle('active', parseFloat(b.textContent.replace('×', '')) === v);
  });
}

// ─────────────────────────────────────────────────────────────────────
//  Réinitialise complètement la simulation.
// ─────────────────────────────────────────────────────────────────────
function resetSim() {
  sim.phase      = 'idle';
  sim.t          = 0;
  sim.tTotal     = 0;
  sim.Uc         = 0;
  sim.syncFrozen = false;
  resetGraphs();
  initElectrons();
  document.getElementById('btn-charge').classList.remove('active');
  document.getElementById('btn-discharge').classList.remove('active');
  const el = document.getElementById('state-text');
  el.textContent = '— En attente —';
  el.style.color = '#4a6a9a';
  updateReadouts();
}

// ─────────────────────────────────────────────────────────────────────
//  Met à jour un paramètre physique depuis un slider.
// ─────────────────────────────────────────────────────────────────────
function updateParam(name, val) {
  const v = parseFloat(val);
  if (name === 'U')  { sim.U  = v;        document.getElementById('lbl-U').textContent  = v.toFixed(1); }
  if (name === 'C')  { sim.C  = v * 1e-6; document.getElementById('lbl-C').textContent  = v; resetSim(); }
  if (name === 'R1') { sim.R1 = v;        document.getElementById('lbl-R1').textContent = v; }
  if (name === 'R2') { sim.R2 = v;        document.getElementById('lbl-R2').textContent = v; }
  updateReadouts();
}

// ─────────────────────────────────────────────────────────────────────
//  Met à jour les encarts de valeurs instantanées.
// ─────────────────────────────────────────────────────────────────────
function updateReadouts() {
  document.getElementById('ro-Uc').textContent      = sim.Uc.toFixed(3);
  document.getElementById('ro-i').textContent       = (currentI() * 1000).toFixed(3);
  document.getElementById('ro-tau-chg').textContent = fmtTau(sim.R1 * sim.C * 1000);
  document.getElementById('ro-tau-dis').textContent = fmtTau(sim.R2 * sim.C * 1000);

  document.getElementById('lbl-acq-reached').style.display =
    (sim.phase !== 'idle' && sim.tTotal >= sim.tAcq) ? 'inline' : 'none';

  if (sim.phase !== 'idle' && wireSettled) {
    const el = document.getElementById('state-text');
    if (sim.phase === 'charge') {
      el.textContent = 'Condensateur chargé';
      el.style.color = '#2a7a40';
    } else {
      el.textContent = 'Condensateur déchargé';
      el.style.color = '#888';
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  BOUCLE D'ANIMATION (~60 fps)
// ═══════════════════════════════════════════════════════════════════════
let lastTime = null;

function loop(ts) {
  if (!lastTime) lastTime = ts;
  const dtReal = Math.min(ts - lastTime, 50);
  lastTime = ts;

  const simStopped = sim.paused
    || sim.tTotal >= sim.tAcq
    || (sim.graphMode === 'sync' && sim.syncFrozen);
  const dt = simStopped
    ? 0
    : Math.min(dtReal * sim.timeScale, sim.tAcq - sim.tTotal);

  if (sim.phase !== 'idle' && dt > 0) {
    sim.t      += dt;
    sim.tTotal += dt;

    const t_s = sim.t / 1000;
    const τ   = tau();

    // Solution analytique exacte de Uc(t)
    sim.Uc = sim.phase === 'charge'
      ? sim.U + (sim.U0_chg - sim.U) * Math.exp(-t_s / τ)
      : sim.U0_dis * Math.exp(-t_s / τ);

    // Stockage des points de graphe avec sous-échantillonnage adaptatif
    const tauMs       = τ * 1000;
    const SAMPLE_STEP = Math.max(0.5, tauMs / 100);
    const nSamples    = Math.max(1, Math.round(dt / SAMPLE_STEP));
    const subDt       = dt / nSamples;

    for (let s = 1; s <= nSamples; s++) {
      const tAbs  = sim.tTotal - dt + s * subDt;
      const t_sub = (sim.t    - dt + s * subDt) / 1000;
      const ucSub = sim.phase === 'charge'
        ? sim.U + (sim.U0_chg - sim.U) * Math.exp(-t_sub / τ)
        : sim.U0_dis * Math.exp(-t_sub / τ);
      const iSub = sim.phase === 'charge'
        ? (sim.U - ucSub) / sim.R1 * 1000
        : -ucSub / sim.R2 * 1000;

      sim.graphUc.push({ t: tAbs, v: ucSub });
      sim.graphI.push({  t: tAbs, v: iSub  });

      if (sim.graphMode === 'sync' && t_sub * 1000 >= 6 * tauMs) {
        sim.syncFrozen = true;
        break;
      }
    }

    // Écrêtage à 8000 points
    if (sim.graphUc.length > 8000) {
      sim.graphUc = sim.graphUc.filter((_, i) => i % 2 === 0);
      sim.graphI  = sim.graphI.filter((_,  i) => i % 2 === 0);
    }

    // Auto-scroll
    if (!sim.userPanned) {
      sim.viewOffsetMs = Math.max(0, sim.tTotal - sim.graphWindowMs);
    }

    updateReadouts();
  }

  // ── Rendu ──
  drawScene(dt);

  const Imax = sim.U / Math.min(sim.R1, sim.R2) * 1000;

  if (sim.graphMode1 === 'q') {
    const C_uF  = sim.C * 1e6;
    const dataQ = sim.graphUc.map(p => ({ t: p.t, v: p.v * C_uF }));
    drawGraph('graph-Uc', dataQ, '#2a6aaa', 0, Math.max(sim.U * C_uF, 0.001) * 1.05, 'µC');
  } else {
    drawGraph('graph-Uc', sim.graphUc, '#2a6aaa', 0, Math.max(sim.U, 0.1), 'V');
  }

  drawGraph('graph-i', sim.graphI, '#b04020', -Imax * 1.1, Imax * 1.1, 'mA');

  requestAnimationFrame(loop);
}

// ═══════════════════════════════════════════════════════════════════════
//  INITIALISATION
// ═══════════════════════════════════════════════════════════════════════
window.addEventListener('resize', resize);
document.addEventListener('fullscreenchange', resize);
document.addEventListener('webkitfullscreenchange', resize);

function init() {
  resize();
  initElectrons();
  initGraphHover();
  updateReadouts();
  requestAnimationFrame(loop);
}

function toggleHint() {
  var hint = document.getElementById('panel-hint');
  if (hint) hint.classList.toggle('collapsed');
}

init();
