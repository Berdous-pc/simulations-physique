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
    ? (sim.E - uc0) / sim.R1 * 1000
    : -uc0 / sim.R2 * 1000;
  sim.graphUc.push({ t: sim.tTotal, v: uc0 });
  sim.graphI.push({  t: sim.tTotal, v: i0  });

  document.getElementById('btn-charge').classList.toggle('active',    p === 'charge');
  document.getElementById('btn-discharge').classList.toggle('active', p === 'discharge');
  const el = document.getElementById('state-text');
  el.textContent = p === 'charge' ? 'Phase de charge en cours…' : 'Phase de décharge en cours…';
  el.style.color = p === 'charge' ? '#4a90d9' : '#e86020';
}

// ─────────────────────────────────────────────────────────────────────
//  Bascule entre pause et lecture.
// ─────────────────────────────────────────────────────────────────────
function togglePause() {
  sim.paused = !sim.paused;
  const btn = document.getElementById('btn-playpause');
  if (sim.paused) {
    btn.textContent = '▶ Lancer';
    btn.className   = 'btn btn-play';
  } else {
    btn.textContent = '⏸ Pause';
    btn.className   = 'btn btn-pause';
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Slider Vitesse d'animation.
// ─────────────────────────────────────────────────────────────────────
var SPEED_STEPS  = [0.1, 0.5, 1, 2, 5];
var SPEED_LABELS = ['0,1', '0,5', '1,0', '2,0', '5,0'];

function onSliderSpeed(val) {
  const idx = parseInt(val, 10);
  sim.timeScale = SPEED_STEPS[idx];
  document.getElementById('lbl-speed').textContent = SPEED_LABELS[idx];
}

// ─────────────────────────────────────────────────────────────────────
//  Bascule l'affichage de la zone de graphes (masquée par défaut :
//  le circuit occupe alors toute la colonne gauche).
// ─────────────────────────────────────────────────────────────────────
let graphVisible = false;
function toggleGraphVisible() {
  graphVisible = !graphVisible;
  document.getElementById('left-col').classList.toggle('graph-off', !graphVisible);
  const btn = document.getElementById('btn-toggle-graph');
  btn.classList.toggle('active', graphVisible);
  btn.setAttribute('aria-pressed', String(graphVisible));
  resize();
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
  if (name === 'E')  { sim.E  = v;        document.getElementById('lbl-E').textContent  = fmtSig3(v); }
  if (name === 'C')  { sim.C  = v * 1e-6; document.getElementById('lbl-C').textContent  = fmtSig3(v); resetSim(); }
  if (name === 'R1') { sim.R1 = v;        document.getElementById('lbl-R1').textContent = fmtSig3(v); }
  if (name === 'R2') { sim.R2 = v;        document.getElementById('lbl-R2').textContent = fmtSig3(v); }
  updateReadouts();
}

// ─────────────────────────────────────────────────────────────────────
//  Met à jour les encarts de valeurs instantanées.
// ─────────────────────────────────────────────────────────────────────
function updateReadouts() {
  // Calibres : E pour la tension, iFullScale_mA() pour l'intensité — c'est
  // ce même calibre qui décide de l'arrêt du mode Synchronisé, de sorte que
  // le tracé se fige exactement quand l'encart passe à 0.
  const roUc = document.getElementById('ro-Uc');
  if (roUc) roUc.textContent = fmtScale(sim.Uc, sim.E);
  const roI = document.getElementById('ro-i');
  if (roI) roI.textContent = fmtScale(currentI() * 1000, iFullScale_mA());
  const roTauChg = document.getElementById('ro-tau-chg');
  if (roTauChg) roTauChg.textContent = fmtTau(sim.R1 * sim.C * 1000);
  const roTauDis = document.getElementById('ro-tau-dis');
  if (roTauDis) roTauDis.textContent = fmtTau(sim.R2 * sim.C * 1000);

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
    || (sim.graphMode === 'sync' && sim.syncFrozen);
  const dt = simStopped
    ? 0
    : dtReal * sim.timeScale;

  if (sim.phase !== 'idle' && dt > 0) {
    sim.t      += dt;
    sim.tTotal += dt;

    const t_s = sim.t / 1000;
    const τ   = tau();

    // Solution analytique exacte de Uc(t)
    sim.Uc = sim.phase === 'charge'
      ? sim.E + (sim.U0_chg - sim.E) * Math.exp(-t_s / τ)
      : sim.U0_dis * Math.exp(-t_s / τ);

    // Stockage des points de graphe avec sous-échantillonnage adaptatif
    const tauMs       = τ * 1000;
    const SAMPLE_STEP = Math.max(0.5, tauMs / 100);
    // Mode Synchronisé : on s'arrête quand les DEUX appareils sont au repos —
    // l'ampèremètre affiche zéro ET le voltmètre affiche la tension finale —
    // et non à 6τ, qui n'était qu'une convention.
    //
    // Les deux conditions sont nécessaires : i et Uc ont la même constante de
    // temps mais des calibres indépendants, leurs seuils de résolution ne
    // tombent donc pas au même instant. Le courant peut atteindre zéro alors
    // qu'il manque encore un cran de tension à Uc, et le tracé s'arrêtait
    // avant que la valeur finale soit lisible.
    const iZero       = scaleResolution(iFullScale_mA());
    const uZero       = scaleResolution(sim.E);
    const ucFinal     = sim.phase === 'charge' ? sim.E : 0;
    const nSamples    = Math.max(1, Math.round(dt / SAMPLE_STEP));
    const subDt       = dt / nSamples;

    for (let s = 1; s <= nSamples; s++) {
      const tAbs  = sim.tTotal - dt + s * subDt;
      const t_sub = (sim.t    - dt + s * subDt) / 1000;
      const ucSub = sim.phase === 'charge'
        ? sim.E + (sim.U0_chg - sim.E) * Math.exp(-t_sub / τ)
        : sim.U0_dis * Math.exp(-t_sub / τ);
      const iSub = sim.phase === 'charge'
        ? (sim.E - ucSub) / sim.R1 * 1000
        : -ucSub / sim.R2 * 1000;

      sim.graphUc.push({ t: tAbs, v: ucSub });
      sim.graphI.push({  t: tAbs, v: iSub  });

      if (sim.graphMode === 'sync'
          && Math.abs(iSub) < iZero
          && Math.abs(ucSub - ucFinal) < uZero) {
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

  const def1 = graphDefFor(sim.graphTab1);
  drawGraph('graph-Uc', def1.data, def1.color, def1.yMin, def1.yMax, def1.unit, def1.name);

  const def2 = graphDefFor(sim.graphTab2);
  drawGraph('graph-i', def2.data, def2.color, def2.yMin, def2.yMax, def2.unit, def2.name);

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
