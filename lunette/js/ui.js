'use strict';

// ═══════════════════════════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════════════════════════

/* ═══════════════════════════════════════════════════
   ui.js — Contrôles UI et boucle d'animation — Lunette astronomique
   ─────────────────────────────────────────────────
   Dépend de : sim.js, draw.js
   Chargé en dernier — démarre l'initialisation.
════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════
   BOUCLE D'ANIMATION
   ─────────────────────────────────────────────────
   Une frame déjà programmée par requestAnimationFrame ne s'annule pas en
   posant animRunning = false : si la boucle est relancée avant qu'elle ne
   s'exécute, elle repart et cohabite avec la nouvelle. Chacune ajoutait son
   dt à animT — bouger un curseur pendant la propagation doublait donc la
   vitesse, et six crans la multipliaient par soixante-quatre.

   D'où le jeton animGen : chaque démarrage l'incrémente, et toute frame
   issue d'une génération périmée se retire sans rien redessiner.
════════════════════════════════════════════════════ */
let animGen = 0;

function startAnimLoop() {
  const gen = ++animGen;
  sim.animRunning = true;
  sim.lastTs = 0;
  requestAnimationFrame(function step(ts) {
    if (gen !== animGen || !sim.animRunning) return;
    if (animLoop(ts)) requestAnimationFrame(step);
  });
}

function stopAnimLoop() {
  sim.animRunning = false;
  animGen++;   // périme la frame éventuellement déjà programmée
}

/* Renvoie true tant que la boucle doit se poursuivre. */
function animLoop(ts) {
  if (sim.lastTs === 0) { sim.lastTs = ts; return true; }
  const dt = (ts - sim.lastTs) / 1000;
  sim.lastTs = ts;

  // Le rembobinage suit la graduation du curseur, comme la marche avant :
  // il avait sa propre vitesse, figée et sans rapport avec elle.
  if (sim.animRewind) {
    sim.animT = Math.max(0, sim.animT - dt * sim.animSpeed * sim.animSpeedMult);
    draw();
    if (sim.animT > 0) return true;
    sim.animRunning = false;
    return false;
  }

  if (sim.animPaused) { sim.animRunning = false; draw(); return false; }

  sim.animT = Math.min(sim.animT + dt * sim.animSpeed * sim.animSpeedMult, 1.0);
  draw();
  if (sim.animT < 1.0) return true;

  sim.animRunning = false; sim.animPaused = true;
  const btn = document.getElementById('btn-pause-play');
  if (btn) { btn.textContent = '▶ Lancer'; btn.classList.remove('active'); }
  draw();
  return false;
}

function startAnim() {
  sim.animT = 0;
  if (!sim.animPaused) {
    startAnimLoop();
  } else {
    stopAnimLoop(); draw();
  }
}

function restartAnim() {
  if (sim.rayMode === 'anim') startAnim();
}

/* ═══════════════════════════════════════════════════
   POINTEUR — DÉPLACEMENT DES ÉLÉMENTS ET PANORAMIQUE
   ─────────────────────────────────────────────────
   Les positions manipulées sont en centimètres : un déplacement à
   l'écran est converti par sim.scale, de sorte que le geste conserve
   le même sens physique quel que soit le zoom.
════════════════════════════════════════════════════ */
let drag    = null;
let panDrag = null;
const DRAG_R = 18;

function hitTest(mx, my) {
  const { axisY, lensHpx } = sim;

  const onElement = xCm =>
    Math.abs(mx - xToPx(xCm)) < DRAG_R &&
    my >= axisY - lensHpx - DRAG_R && my <= axisY + lensHpx + DRAG_R;

  if (onElement(sim.x1)) return 'L1';
  if (onElement(sim.x2)) return 'L2';

  if (sim.oeilActif && sim.systemMode === 'lunette' &&
      onElement(sim.xOeil + sim.EYE_IRIS_TO_LENS)) return 'oeil';

  return null;
}

/* ═══════════════════════════════════════════════════
   AIMANTATION DU RÉGLAGE AFOCAL (mode libre)
   ─────────────────────────────────────────────────
   En mode lunette, O₁O₂ est imposé et vaut exactement f'₁ + f'₂. En mode
   libre, l'utilisateur place les lentilles à la main : le geste attendu est
   justement d'amener F'₁ sur F₂, mais une abscisse continue ne tombe jamais
   sur l'égalité exacte. Sans aide, le réglage afocal est inatteignable —
   et il faudrait tolérer une égalité approchée pour l'afficher.

   On aimante donc le glissement : dès que la distance entre lentilles
   approche f'₁ + f'₂, elle y bascule exactement. L'égalité devient alors
   vraie dans le modèle et non seulement à l'écran — rayons de sortie
   rigoureusement parallèles, écart nul au panneau, et draw.js peut
   fusionner les étiquettes en « F'₁ = F₂ » sans rien approximer.

   Le seuil est en pixels, et c'est ici légitime : il déclenche un geste,
   il n'affirme aucune égalité. Le zoom change donc la facilité de
   l'accrochage, jamais la véracité de ce qui est affiché ensuite.
════════════════════════════════════════════════════ */
const AFOCAL_SNAP_PX = 7;

/* Rapproche xCm de la cible afocale s'il en est assez près. */
function snapAfocal(xCm, targetCm) {
  // Une lunette dont les lentilles se toucheraient n'a pas de sens : on
  // n'aimante pas vers une position que enforceLensDistance() défera.
  if (sim.f1 + sim.f2 < MIN_LENS_GAP_CM) return xCm;
  return Math.abs(xCm - targetCm) < AFOCAL_SNAP_PX / sim.scale ? targetCm : xCm;
}

/* ── Applique un déplacement dxCm à l'élément saisi ── */
function moveDragged(dxCm) {
  if (drag.target === 'L1') {
    let x1 = clampToView(drag.startX1 + dxCm);
    // Déplacer L₁ change aussi O₁O₂ : l'aimantation joue dans les deux sens.
    if (sim.systemMode === 'libre') x1 = snapAfocal(x1, sim.x2 - sim.f1 - sim.f2);
    sim.x1 = x1;
    enforceLensDistance();

  } else if (drag.target === 'L2') {
    if (sim.systemMode === 'lunette') {
      // En lunette, O₁O₂ est imposé par f'₁ + f'₂ : on translate l'ensemble.
      // Les deux lentilles sont bornées au cadre : ne clamper que x2 laissait
      // L₁ sortir par la gauche quand on poussait l'ensemble vers la droite.
      const dist12 = drag.startX2 - drag.startX1;
      sim.x1 = clampToView(drag.startX1 + dxCm);
      sim.x2 = clampToView(sim.x1 + dist12);
      sim.x1 = sim.x2 - dist12;
      sim.xOeil = sim.x2 + (drag.startOeil - drag.startX2);
    } else {
      const x2 = clampToView(Math.max(sim.x1 + MIN_LENS_GAP_CM, drag.startX2 + dxCm));
      sim.x2 = snapAfocal(x2, sim.x1 + sim.f1 + sim.f2);
    }

  } else if (drag.target === 'oeil') {
    sim.xOeil = clampToView(Math.max(sim.x2 + MIN_EYE_GAP_CM, drag.startOeil + dxCm));
  }
}

function beginDrag(target, cx) {
  drag = {
    target,
    startPx:   cx,
    startX1:   sim.x1,
    startX2:   sim.x2,
    startOeil: sim.xOeil,
  };
  document.getElementById('drag-hint').classList.add('hidden');
}

document.getElementById('btn-reset-view').addEventListener('click', resetView);

cv.addEventListener('mousedown', e => {
  const { x: cx, y: cy } = clientToCanvas(e.clientX, e.clientY);

  const target = hitTest(cx, cy);
  if (!target) {
    // Panoramique : disponible dans les deux modes d'affichage — se
    // recadrer pendant une propagation est précisément ce dont on a
    // besoin quand l'oculaire sort du champ.
    panDrag = { startClientX: e.clientX, startOrigin: sim.originXpx };
    cv.style.cursor = 'grab';
    return;
  }
  beginDrag(target, cx);
  cv.style.cursor = 'grabbing';
});

cv.addEventListener('mousemove', e => {
  const { x: cx, y: cy } = clientToCanvas(e.clientX, e.clientY);

  if (panDrag) {
    sim.originXpx = panDrag.startOrigin + (e.clientX - panDrag.startClientX);
    clampPan();
    draw();
    return;
  }

  if (!drag) {
    cv.style.cursor = hitTest(cx, cy) ? 'ew-resize' : 'default';
    return;
  }

  moveDragged((cx - drag.startPx) / sim.scale);
  compute();
  if (sim.rayMode === 'anim') sim.animT = 0;
  draw();
});

cv.addEventListener('mouseup',    () => { drag = null; panDrag = null; cv.style.cursor = 'default'; });
cv.addEventListener('mouseleave', () => {
  if (drag)    { drag    = null; cv.style.cursor = 'default'; }
  if (panDrag) { panDrag = null; cv.style.cursor = 'default'; }
});

/* ═══════════════════════════════════════════════════
   ZOOM DE LA SCÈNE
   ─────────────────────────────────────────────────
   Molette (ou pincement à deux doigts) : change l'échelle cm → px en
   laissant immobile le point de la scène situé sous le pointeur. Les
   lentilles, l'œil et les textes gardant une taille fixe en pixels,
   c'est la portion de scène couverte qui varie — d'où un cadrage
   utilisable aussi bien pour f'₂ = 5 cm que pour O₁O₂ = 2 m.
════════════════════════════════════════════════════ */
cv.addEventListener('wheel', e => {
  e.preventDefault();
  if (drag) return;
  const { x: cx } = clientToCanvas(e.clientX, e.clientY);
  const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
  if (!setZoom(sim.zoom * factor, cx)) return;
  draw();
}, { passive: false });

// Double-clic hors élément draggable : retour au cadrage nominal.
cv.addEventListener('dblclick', e => {
  const { x: cx, y: cy } = clientToCanvas(e.clientX, e.clientY);
  if (hitTest(cx, cy)) return;
  resetView();
});

/* ═══════════════════════════════════════════════════
   TACTILE
   ─────────────────────────────────────────────────
   Un doigt : déplace l'élément saisi, ou fait glisser la scène.
   Deux doigts : pincement, ancré sur le milieu des deux contacts.
════════════════════════════════════════════════════ */
let pinch = null;

function pinchDist(e) {
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  return Math.hypot(dx, dy);
}

function pinchMidPx(e) {
  const mid = (e.touches[0].clientX + e.touches[1].clientX) / 2;
  return clientToCanvas(mid, 0).x;
}

cv.addEventListener('touchstart', e => {
  if (e.touches.length === 2) {
    e.preventDefault();
    drag = null; panDrag = null;
    pinch = { dist: pinchDist(e), zoom: sim.zoom };
    return;
  }

  const t = e.touches[0];
  const { x: cx, y: cy } = clientToCanvas(t.clientX, t.clientY);

  const target = hitTest(cx, cy);
  if (!target) {
    panDrag = { startClientX: t.clientX, startOrigin: sim.originXpx };
    return;
  }
  e.preventDefault();
  beginDrag(target, cx);
}, { passive: false });

cv.addEventListener('touchmove', e => {
  if (pinch && e.touches.length === 2) {
    e.preventDefault();
    if (pinch.dist < 1) return;
    if (setZoom(pinch.zoom * pinchDist(e) / pinch.dist, pinchMidPx(e))) draw();
    return;
  }

  const t = e.touches[0];
  if (!t) return;

  if (panDrag) {
    e.preventDefault();
    sim.originXpx = panDrag.startOrigin + (t.clientX - panDrag.startClientX);
    clampPan();
    draw();
    return;
  }

  if (!drag) return;
  e.preventDefault();
  const { x: cx } = clientToCanvas(t.clientX, t.clientY);
  moveDragged((cx - drag.startPx) / sim.scale);
  compute();
  if (sim.rayMode === 'anim') sim.animT = 0;
  draw();
}, { passive: false });

cv.addEventListener('touchend', e => {
  if (e.touches.length < 2)   pinch = null;
  if (e.touches.length === 0) { drag = null; panDrag = null; }
});

/* ═══════════════════════════════════════════════════
   CONTRÔLES DU PANNEAU
════════════════════════════════════════════════════ */
function onSliderAlpha(val) {
  sim.alpha = parseInt(val);
  const sign = sim.alpha >= 0 ? '+' : '';
  document.getElementById('lbl-alpha').textContent = sign + sim.alpha + '°';
  compute();
  sim.rayMode === 'instant' ? draw() : restartAnim();
}

function onSliderF1(val) {
  sim.f1 = parseFloat(val);
  document.getElementById('lbl-f1').textContent = '+' + sim.f1.toFixed(1) + ' cm';
  if (sim.systemMode === 'lunette') enforceLensDistance();
  compute();
  sim.rayMode === 'instant' ? draw() : restartAnim();
}

function onSliderF2(val) {
  sim.f2 = parseFloat(val);
  document.getElementById('lbl-f2').textContent = '+' + sim.f2.toFixed(1) + ' cm';
  if (sim.systemMode === 'lunette') enforceLensDistance();
  compute();
  sim.rayMode === 'instant' ? draw() : restartAnim();
}

function onSliderNRays(val) {
  sim.nRays = parseInt(val);
  document.getElementById('lbl-nrays').textContent = sim.nRays;
  sim.rayMode === 'instant' ? draw() : restartAnim();
}

function setSystemMode(mode) {
  sim.systemMode = mode;
  document.getElementById('btn-libre').classList.toggle('active', mode === 'libre');
  document.getElementById('btn-lunette').classList.toggle('active', mode === 'lunette');
  document.getElementById('section-oeil').style.display = mode === 'lunette' ? '' : 'none';

  if (mode === 'lunette') {
    enforceLensDistance();
  } else {
    if (sim.oeilActif) toggleOeil(true);
    if (sim.legendeActif) toggleLegende();
  }

  compute();
  sim.rayMode === 'instant' ? draw() : restartAnim();
}

function setRayMode(mode) {
  sim.rayMode = mode;
  document.getElementById('btn-instant').classList.toggle('active', mode === 'instant');
  document.getElementById('btn-anim').classList.toggle('active', mode === 'anim');
  document.getElementById('row-speed').style.display = mode === 'anim' ? '' : 'none';
  if (mode === 'instant') {
    stopAnimLoop(); draw();
  } else {
    // Le cadrage n'est plus réinitialisé au passage en propagation :
    // l'utilisateur garde le zoom et le recadrage qu'il vient de choisir.
    sim.animPaused = true;
    const btn = document.getElementById('btn-pause-play');
    if (btn) { btn.textContent = '▶ Lancer'; btn.classList.remove('active'); }
    startAnim();
  }
}

function toggleOeil(forceOff) {
  sim.oeilActif = forceOff ? false : !sim.oeilActif;
  const btn = document.getElementById('btn-oeil');
  if (sim.oeilActif) {
    btn.textContent = 'Ajouter un œil : OUI';
    btn.classList.add('active');
    // On restitue l'écart choisi par l'utilisateur : masquer puis réafficher
    // l'œil replaçait l'observateur à 20 cm, réglage perdu.
    sim.xOeil = sim.x2 + Math.max(MIN_EYE_GAP_CM, sim.eyeGapCm);
  } else {
    sim.eyeGapCm = Math.max(MIN_EYE_GAP_CM, sim.xOeil - sim.x2);
    btn.textContent = 'Ajouter un œil : NON';
    btn.classList.remove('active');
  }
  compute();
  sim.rayMode === 'instant' ? draw() : restartAnim();
}

function toggleLegende() {
  sim.legendeActif = !sim.legendeActif;
  const btn = document.getElementById('btn-legende');
  if (sim.legendeActif) {
    btn.textContent = 'Légende : OUI';
    btn.classList.add('active');
  } else {
    btn.textContent = 'Légende : NON';
    btn.classList.remove('active');
  }
  sim.rayMode === 'instant' ? draw() : restartAnim();
}

function togglePausePlay() {
  sim.animPaused = !sim.animPaused;
  const btn = document.getElementById('btn-pause-play');
  if (sim.animPaused) {
    btn.textContent = '▶ Lancer'; btn.classList.remove('active');
    stopAnimLoop();
  } else {
    btn.textContent = '⏸ Pause'; btn.classList.add('active');
    // L'animation terminée reste à animT = 1 : sans remise à zéro, Lancer
    // n'avait plus aucun effet une fois la propagation arrivée au bout.
    if (sim.animT >= 1.0) sim.animT = 0;
    if (sim.rayMode === 'anim') startAnimLoop();
  }
}

/* Posée par le module du curseur de vitesse : remet le rembobinage à plat,
   son état interne compris. Sans elle, RAZ pressé pendant un ⏪ maintenu
   désynchronisait le module, qui se croyait encore en rembobinage. */
let stopRewindExternal = () => {};

function resetAnim() {
  stopRewindExternal();
  sim.animRewind = false; sim.animT = 0;
  stopAnimLoop();
  document.getElementById('speed-rewind').classList.remove('active');
  if (!sim.animPaused && sim.rayMode === 'anim') {
    startAnimLoop();
  } else { draw(); }
}

/* ═══════════════════════════════════════════════════
   SLIDER VITESSE CUSTOM
════════════════════════════════════════════════════ */
/* Les valeurs collent aux libellés : elles en valaient la moitié, rattrapée
   par un facteur 2 en dur dans la marche avant de animLoop — que la branche
   de rembobinage, elle, n'avait pas. */
const SPEED_VALS   = [0.1, 0.25, 0.5, 0.75, 1.0];
const SPEED_LABELS = ['×0.1', '×0.25', '×0.5', '×0.75', '×1'];

(function() {
  let isDragging = false, isRewind = false;
  let speedIdx   = SPEED_VALS.length - 1;   // le curseur démarre à fond à droite

  function setSpeedIdx(idx) {
    speedIdx = idx;
    sim.animSpeedMult = SPEED_VALS[idx];
    document.getElementById('lbl-speed').textContent = SPEED_LABELS[idx];
    updateThumb(idx / (SPEED_VALS.length - 1) * 100);
    if (sim.rayMode === 'anim' && !sim.animRunning && !sim.animPaused) {
      startAnimLoop();
    }
  }

  function updateThumb(pct) {
    const track = document.getElementById('speed-track');
    const thumb = document.getElementById('speed-thumb');
    const fill  = document.getElementById('speed-fill');
    if (!track) return;
    thumb.style.left = pct + '%';
    fill.style.width  = Math.max(0, Math.min(100, pct)) + '%';
  }

  function pctFromEvent(e, track) {
    const rect = track.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return (clientX - rect.left) / rect.width * 100;
  }

  function pctToIdx(pct) {
    const idx = Math.round(pct / 100 * (SPEED_VALS.length - 1));
    return Math.max(0, Math.min(SPEED_VALS.length - 1, idx));
  }

  function startRewind() {
    if (isRewind) return;
    isRewind = true;
    sim.animRewind = true;
    document.getElementById('lbl-speed').textContent = '⏪';
    document.getElementById('speed-rewind').classList.add('active');
    if (sim.rayMode === 'anim' && !sim.animRunning) startAnimLoop();
  }

  function stopRewind() {
    if (!isRewind) return;
    isRewind = false;
    sim.animRewind = false;
    document.getElementById('speed-rewind').classList.remove('active');
    // On restitue l'étiquette de la graduation choisie : l'ancienne version
    // retombait silencieusement sur la plus lente.
    document.getElementById('lbl-speed').textContent = SPEED_LABELS[speedIdx];
    // Le rembobinage a pu vider la boucle en atteignant t = 0 : on la relance
    // si la lecture était en cours.
    if (sim.rayMode === 'anim' && !sim.animPaused && !sim.animRunning && sim.animT < 1.0) {
      startAnimLoop();
    }
  }

  // Exposé à resetAnim() : le module garde son propre drapeau isRewind, que
  // seul stopRewind() remet à plat.
  stopRewindExternal = stopRewind;

  document.addEventListener('DOMContentLoaded', () => {
    const track = document.getElementById('speed-track');
    const thumb = document.getElementById('speed-thumb');
    if (!track) return;

    function onDown(e) {
      isDragging = true;
      thumb.style.cursor = 'grabbing';
      setSpeedIdx(pctToIdx(pctFromEvent(e, track)));
      if (e.cancelable) e.preventDefault();
    }

    function onMove(e) {
      if (!isDragging) return;
      setSpeedIdx(pctToIdx(pctFromEvent(e, track)));
      if (e.cancelable) e.preventDefault();
    }

    function onUp() {
      stopRewind();
      if (!isDragging) return;
      isDragging = false;
      thumb.style.cursor = 'grab';
    }

    track.addEventListener('mousedown',  onDown);
    thumb.addEventListener('mousedown',  onDown);
    track.addEventListener('touchstart', onDown, { passive: false });
    thumb.addEventListener('touchstart', onDown, { passive: false });

    // Rembobinage : bouton à maintenir. L'ancienne version imposait de tirer
    // le thumb hors de la piste jusque sur l'icône — indécouvrable.
    const rew = document.getElementById('speed-rewind');
    rew.addEventListener('mousedown',  e => { e.preventDefault(); startRewind(); });
    rew.addEventListener('touchstart', e => { e.preventDefault(); startRewind(); },
                         { passive: false });

    document.addEventListener('mousemove',   onMove);
    document.addEventListener('mouseup',     onUp);
    document.addEventListener('touchmove',   onMove, { passive: false });
    document.addEventListener('touchend',    onUp);
    document.addEventListener('touchcancel', onUp);
  });
})();

/* ═══════════════════════════════════════════════════
   RESIZE
════════════════════════════════════════════════════ */
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resize, 60);
});

/* ═══════════════════════════════════════════════════
   INITIALISATION
════════════════════════════════════════════════════ */
// Étiquettes initiales dérivées de sim, pour qu'elles ne puissent pas
// diverger des valeurs de départ.
document.getElementById('lbl-f1').textContent = '+' + sim.f1.toFixed(1) + ' cm';
document.getElementById('lbl-f2').textContent = '+' + sim.f2.toFixed(1) + ' cm';
document.getElementById('lbl-alpha').textContent = (sim.alpha >= 0 ? '+' : '') + sim.alpha + '°';
document.getElementById('lbl-nrays').textContent = sim.nRays;

resize();
document.getElementById('row-speed').style.display = 'none';

document.addEventListener('DOMContentLoaded', () => {
  const thumb = document.getElementById('speed-thumb');
  if (thumb) thumb.style.left = '100%';
});

setTimeout(() => { document.getElementById('drag-hint').classList.add('hidden'); }, 5000);

function toggleHint() {
  var hint = document.getElementById('panel-hint');
  if (hint) hint.classList.toggle('collapsed');
}
