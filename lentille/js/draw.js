'use strict';

// ═══════════════════════════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════════════════════════

/* ═══════════════════════════════════════════════════
   draw.js — Rendu canvas de la simulation Lentille mince
   ─────────────────────────────────────────────────
   Dépend de : sim.js (sim, RAY_COLORS, cmToX, cmToY, p, xToCm, compute, updateTableHeight)
   Expose : cv, ctx, resize, draw, computeRays,
            drawRaysInstant, drawRaysAnim,
            drawSegment, drawSegmentToX, drawArrowHead,
            segLength
════════════════════════════════════════════════════ */

const cv  = document.getElementById('cv');
const ctx = cv.getContext('2d');

/* ═══════════════════════════════════════════════════
   ÉCHELLE TYPOGRAPHIQUE
   ─────────────────────────────────────────────────
   Les tailles de police et les petits éléments décoratifs
   (croix des foyers, pointes de flèche, barres de titre,
   boutons dessinés) sont exprimés pour un canvas de
   référence 1200 × 700 px, puis remis à l'échelle.
   L'homothétie est bornée : sous FS_MIN le texte devient
   illisible, au-dessus de FS_MAX il écrase le schéma.
════════════════════════════════════════════════════ */
const FS_REF_W = 1200, FS_REF_H = 700;
const FS_MIN   = 0.55, FS_MAX   = 1.25;

function uiScale() {
  const k = Math.min(sim.W / FS_REF_W, sim.H / FS_REF_H);
  return Math.max(FS_MIN, Math.min(FS_MAX, k));
}
function fs(base) { return base * uiScale(); }

/* Police des étiquettes du schéma. */
const LABEL_FONT = 'monospace';

/* ═══════════════════════════════════════════════════
   GESTIONNAIRE D'ÉTIQUETTES
   ─────────────────────────────────────────────────
   Chaque fonction de dessin plaçait son texte avec des décalages en dur,
   sans rien savoir des autres : A recouvre F quand l'objet est au foyer
   objet, A' recouvre F' quand l'objet s'éloigne, O se fait rattraper par
   F' aux courtes focales, « Écran » disparaissait sous le cadre Image, et
   le tout se comprime encore au dézoom puisque le texte garde une taille
   en pixels.

   Les fonctions ne dessinent donc plus leurs étiquettes : elles les
   DÉCLARENT (pushLabel), avec un point d'ancrage, une priorité et une
   liste de positions candidates par ordre de préférence. flushLabels(),
   appelé en fin de draw(), les place ensuite en une passe :

     1. premier candidat dont la boîte englobante est libre ;
     2. à défaut, on s'éloigne en couronne autour de l'ancre et on relie
        l'étiquette à son point par un trait de rappel ;
     3. en dernier recours, le candidat préféré, quitte à empiéter.

   Les meubles de l'interface — cadres Objet et Image, barre d'échelle,
   boutons, tableau de conjugaison — réservent leur emprise (reserveBox),
   de sorte qu'aucune étiquette ne vienne se glisser dessous.

   Le rendu ajoute systématiquement un halo à la couleur du fond : même
   bien placée, une étiquette passe sur un rayon, sur l'axe pointillé ou
   sur une flèche de lentille — et le mode multipoints en trace beaucoup.

   La priorité est un simple ordre de service — plus petit = servi en
   premier, donc plus de chances d'obtenir sa position idéale.
════════════════════════════════════════════════════ */
const HALO_COLOR   = '#fdf8f0';   // couleur du fond du canvas
const LABEL_PAD    = 2;           // marge de sécurité entre deux boîtes, en px de référence
const LEADER_RADII = [34, 52, 72, 96];
const LEADER_DIRS  = [
  { cx:  1, cy: -1, align: 'left'   },
  { cx: -1, cy: -1, align: 'right'  },
  { cx:  1, cy:  1, align: 'left'   },
  { cx: -1, cy:  1, align: 'right'  },
  { cx:  0, cy: -1, align: 'center' },
  { cx:  0, cy:  1, align: 'center' },
  { cx:  1, cy:  0, align: 'left'   },
  { cx: -1, cy:  0, align: 'right'  },
];

const labelQueue = [];   // étiquettes déclarées pendant la passe de dessin
const occupied   = [];   // boîtes déjà attribuées, plus les zones réservées

function resetLabels() { labelQueue.length = 0; occupied.length = 0; }

/* Interdit une zone au placement. */
function reserveBox(l, t, r, b) { occupied.push({ l, t, r, b }); }

/* Réserve l'emprise des éléments HTML superposés au canvas. Ils sont
   opaques et dessinés par le navigateur au-dessus de lui : une étiquette
   qui tomberait dessous serait simplement invisible.

   Réservé aux éléments dont la géométrie n'est pas connue d'ici — les
   boutons, eux, réservent la leur depuis layoutCanvasButtons(), qui la
   calcule déjà. getBoundingClientRect() force un recalcul de mise en page
   à chaque image d'animation : on en appelle le moins possible.

   Le repli sur la classe « hidden » n'est pas cosmétique : drag-hint
   s'efface par opacity et non par display, si bien que offsetParent reste
   non nul — sans ce test, sa place resterait réservée à jamais. */
function reserveOverlays(ids) {
  const c = cv.getBoundingClientRect();
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el || el.offsetParent === null || el.classList.contains('hidden')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    reserveBox(r.left - c.left, r.top - c.top, r.right - c.left, r.bottom - c.top);
  }
}

/* Déclare une étiquette. Champs : text, x, y (ancre), color, fontPx,
   placements (liste de {dx, dy, align, baseline}), priority, et
   optionnellement family, weight, leader:false pour interdire le rappel. */
function pushLabel(o) { labelQueue.push(o); }

function labelFont(lb) {
  return `${lb.weight ?? 'bold'} ${lb.fontPx.toFixed(1)}px ${lb.family ?? LABEL_FONT}`;
}

/* Boîte englobante d'une étiquette pour un décalage donné.
   La hauteur est prise au corps de la police : measureText ne renvoie de
   métriques verticales fiables que sur les navigateurs récents, et
   l'approximation suffit puisqu'elle sert de gabarit, pas de mesure. */
function labelBox(lb, dx, dy, align, baseline) {
  ctx.font = labelFont(lb);
  const w = ctx.measureText(lb.text).width;
  const h = lb.fontPx * 0.98;
  const cx = lb.x + dx, cy = lb.y + dy;

  let l = cx;
  if (align === 'right')  l = cx - w;
  if (align === 'center') l = cx - w / 2;

  let t = cy;
  if (baseline === 'bottom')     t = cy - h;
  if (baseline === 'middle')     t = cy - h / 2;
  if (baseline === 'alphabetic') t = cy - h * 0.78;

  return { l, t, r: l + w, b: t + h };
}

function boxIsFree(b) {
  // Une étiquette rognée par le bord est aussi illisible qu'une étiquette
  // superposée : le candidat est rejeté et le placement cherche ailleurs.
  if (b.l < 1 || b.r > sim.W - 1 || b.t < 1 || b.b > sim.H - 1) return false;
  const p = fs(LABEL_PAD);
  return !occupied.some(o => b.l < o.r + p && b.r > o.l - p &&
                             b.t < o.b + p && b.b > o.t - p);
}

function flushLabels() {
  labelQueue.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));

  for (const lb of labelQueue) {
    // Ancre hors cadre : sans ce garde-fou, la recherche en couronne
    // ramènerait l'étiquette dans le canvas au bout d'un trait de rappel
    // pointant vers un point que l'on ne voit pas.
    if (lb.x < 0 || lb.x > sim.W || lb.y < 0 || lb.y > sim.H) continue;

    let box = null, leader = false;

    for (const p of lb.placements) {
      const b = labelBox(lb, p.dx, p.dy, p.align, p.baseline);
      if (boxIsFree(b)) { box = b; break; }
    }

    if (!box && lb.leader !== false) {
      for (const r of LEADER_RADII) {
        for (const d of LEADER_DIRS) {
          const k = (d.cx && d.cy) ? Math.SQRT1_2 : 1;   // diagonales à la même distance
          const b = labelBox(lb, fs(r) * d.cx * k, fs(r) * d.cy * k, d.align, 'middle');
          if (boxIsFree(b)) { box = b; leader = true; break; }
        }
        if (box) break;
      }
    }

    if (!box) {
      const p = lb.placements[0];
      box = labelBox(lb, p.dx, p.dy, p.align, p.baseline);
    }

    occupied.push(box);
    renderLabel(lb, box, leader);
  }

  labelQueue.length = 0;
}

function renderLabel(lb, box, leader) {
  ctx.save();

  if (leader) {
    // Le trait rejoint le point de la boîte le plus proche de l'ancre :
    // il reste court et n'entre jamais sous le texte.
    const ax = Math.max(box.l, Math.min(lb.x, box.r));
    const ay = Math.max(box.t, Math.min(lb.y, box.b));
    ctx.strokeStyle = lb.color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth   = fs(1.1);
    ctx.beginPath(); ctx.moveTo(lb.x, lb.y); ctx.lineTo(ax, ay); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.font = labelFont(lb);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round'; ctx.miterLimit = 2;
  ctx.strokeStyle = HALO_COLOR;
  ctx.lineWidth   = Math.max(fs(2.5), lb.fontPx * 0.14);
  ctx.strokeText(lb.text, box.l, box.t);
  ctx.fillStyle = lb.color;
  ctx.fillText(lb.text, box.l, box.t);

  ctx.restore();
}

/* Jeu de quatre positions en coin autour d'une ancre, du coin préféré
   (prefX, prefY : +1 droite / bas, -1 gauche / haut) aux trois autres. */
function cornerPlacements(gapX, gapY, prefX = 1, prefY = -1) {
  const out = [];
  for (const sy of [prefY, -prefY]) {
    for (const sx of [prefX, -prefX]) {
      out.push({ dx: sx * gapX, dy: sy * gapY,
                 align: sx < 0 ? 'right' : 'left',
                 baseline: sy < 0 ? 'bottom' : 'top' });
    }
  }
  return out;
}

/* ─────────────────────────────────────────────────
   updateFrameMetrics() — Dimensions des cadres Objet / Image.
   Le cadre suit l'échelle de la scène, mais reste plafonné en
   proportion du canvas : sinon il dévore la moitié de la
   largeur sur mobile et déborde en hauteur sur écran bas.
───────────────────────────────────────────────────── */
function updateFrameMetrics() {
  const { W, H, baseScale } = sim;
  // baseScale et non scale : les cadres sont des vignettes d'interface, leur
  // taille ne doit pas suivre le zoom de la scène.
  const frameH = Math.min(18 * baseScale, H * 0.30, W * 0.165);
  sim.frameH      = frameH;
  sim.frameW      = frameH * (4 / 3);
  sim.barH        = fs(26);
  sim.frameMargin = fs(12);
}

/* ─────────────────────────────────────────────────
   resize() — Adapte le canvas à la taille de la fenêtre.
───────────────────────────────────────────────────── */
function resize() {
  const area = document.getElementById('canvas-area');
  const W = area.clientWidth;
  const H = area.clientHeight;
  cv.width  = W * devicePixelRatio;
  cv.height = H * devicePixelRatio;
  cv.style.width  = W + 'px';
  cv.style.height = H + 'px';
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  sim.W = W;
  sim.H = H;
  sim.axisY  = H / 2;
  sim.lensX  = W / 2;

  // Largeur de scène visible : VIEW_SPAN_CM sur un canvas large, resserrée
  // sur les canvas étroits pour conserver au moins MIN_PX_PER_CM par cm.
  const spanCm = Math.min(VIEW_SPAN_CM,
                          Math.max(MIN_SPAN_CM, W / MIN_PX_PER_CM));
  sim.baseScale = W / spanCm;

  // Demi-hauteur de la lentille, en PIXELS : elle est fixe une fois la
  // fenêtre dimensionnée, et la borne sur H évite que ses pointes ou le
  // faisceau de rayons soient rognés en écran bas. L'écran partage cette
  // même hauteur. applyScale() en déduit l'ouverture en cm selon le zoom.
  sim.lensHpx = Math.min(LENS_RADIUS_MAX_CM * sim.baseScale, H * 0.42);
  applyScale();

  updateFrameMetrics();
  compute();
  updateTableHeight();
  draw();
}

/* ═══════════════════════════════════════════════════
   DESSIN PRINCIPAL
════════════════════════════════════════════════════ */
function draw() {
  const { W, H, mode, animT, animTImage } = sim;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = HALO_COLOR;
  ctx.fillRect(0, 0, W, H);

  resetLabels();

  drawGrid();
  drawAxis();
  drawFocalPoints();

  const rays = computeRays();
  sim._lastRays = rays;
  if (mode === 'instant') {
    drawRaysInstant(rays);
  } else {
    drawRaysAnim(rays, animT);
  }

  drawScreen();
  drawLens();
  if (!sim.infini) drawObject();

  // En animation, l'image n'apparaît qu'une fois le front d'onde parvenu
  // jusqu'à elle : son étiquette doit suivre la même règle.
  const imageShown = (mode === 'instant') || (animT >= animTImage);
  drawImage(imageShown ? 1.0 : 0.0);

  drawViewfinders();
  drawScaleBar();

  // Les meubles HTML posés sur le canvas sont opaques : ils réservent leur
  // emprise avant que les étiquettes ne soient placées.
  reserveOverlays(['drag-hint', 'conjugaison-table']);

  // Dernière étape : F, A, F' et A' sont déclarés ensemble, car ce sont les
  // seuls points susceptibles d'être confondus, puis tout est placé d'un coup
  // — donc par-dessus rayons, lentille et quadrillage.
  pushAxisPointLabels(imageShown);
  flushLabels();
}

/* ── Quadrillage à pas adaptatif (série 1-2-5) ──
   À faible échelle, un pas fixe de 1 cm produit des lignes à 3 px d'écart :
   le quadrillage vire au moiré. On monte donc dans la série jusqu'à obtenir
   au moins GRID_MIN_PX entre deux lignes, et on renforce une ligne sur cinq
   pour garder un repère de lecture. */
const GRID_MIN_PX = 9;
const GRID_STEPS  = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

function drawGrid() {
  const { W, H, scale, lensX, axisY } = sim;

  let stepCm = GRID_STEPS[GRID_STEPS.length - 1];
  for (const s of GRID_STEPS) {
    if (s * scale >= GRID_MIN_PX) { stepCm = s; break; }
  }
  const minor = stepCm * scale;

  ctx.save();
  ctx.lineWidth = 0.5;
  for (const [period, color] of [[minor,     'rgba(180, 160, 130, 0.22)'],
                                 [minor * 5, 'rgba(180, 160, 130, 0.45)']]) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let x = lensX % period; x <= W; x += period) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = axisY % period; y <= H; y += period) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }
  ctx.restore();
}

/* ── Axe optique ── */
function drawAxis() {
  const { W, axisY } = sim;
  ctx.save();
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = fs(1.5);
  ctx.setLineDash([fs(8), fs(6)]);
  ctx.beginPath(); ctx.moveTo(0, axisY); ctx.lineTo(W, axisY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/* ── Croix des foyers F et F' ──
   Les étiquettes ne sont plus posées ici : F et F' peuvent se confondre
   avec A ou A', et c'est pushAxisPointLabels() qui arbitre. */
function drawFocalPoints() {
  const { f, axisY, lensType } = sim;
  const fEff = lensType === 'div' ? -f : f;
  const arm  = fs(7);

  ctx.save();
  ctx.strokeStyle = '#888'; ctx.lineWidth = fs(1.8);
  for (const cm of [-fEff, fEff]) {
    const x = cmToX(cm);
    ctx.beginPath();
    ctx.moveTo(x - arm, axisY); ctx.lineTo(x + arm, axisY);
    ctx.moveTo(x, axisY - arm); ctx.lineTo(x, axisY + arm);
    ctx.stroke();
  }
  ctx.restore();
}

/* ═══════════════════════════════════════════════════
   ÉTIQUETTES DES POINTS DE L'AXE — F, A, F', A'
   ─────────────────────────────────────────────────
   Ces quatre points se confondent deux à deux dans les configurations
   canoniques du cours : A sur F quand l'objet est au foyer objet (image
   rejetée à l'infini), A' sur F' quand l'objet est à l'infini. Aucun
   placement ne sépare deux points confondus : on fusionne alors les
   étiquettes en une seule — « F = A », « F' = A' » — qui énonce le
   résultat au lieu de le masquer sous deux textes empilés. L'ancienne
   version écrivait déjà « F'= A' », mais câblé pour le seul mode infini.

   Le critère porte sur les CENTIMÈTRES et l'égalité doit être rigoureuse :
   écrire « F = A » pour deux points seulement voisins énoncerait une
   égalité fausse, ce qui est bien pire qu'un chevauchement. Un critère en
   pixels laisserait le dézoom la fabriquer, et les tolérances de compute()
   (0,4 cm autour du foyer objet) servent à décider du tracé des rayons,
   pas à affirmer une égalité de points.

   AXIS_SAME_CM ne couvre donc que le bruit de l'arithmétique flottante.
   En mode infini, compute() pose OA' = f' et l'égalité est exacte ; sur
   l'axe, c'est l'aimantation du glissement (ui.js) qui rend le foyer objet
   atteignable à la souris. Hors de ces cas, les étiquettes restent
   séparées — le gestionnaire les écarte, au besoin par un trait de rappel.
════════════════════════════════════════════════════ */
const AXIS_SAME_CM = 1e-6;

function pushAxisPointLabels(imageShown) {
  const { f, h, h2, OA, OA2, axisY, infini, lensType } = sim;
  const fEff = lensType === 'div' ? -f : f;

  // rank : ordre de lecture d'une étiquette fusionnée (le foyer en tête).
  // up : côté de l'axe préféré, opposé à la flèche dont le point est le pied.
  const pts = [
    { rank: 0, cm: -fEff, text: 'F',   color: '#555' },
    { rank: 1, cm:  fEff, text: "F'",  color: '#555' },
  ];
  if (!infini) {
    pts.push({ rank: 2, cm: OA, text: 'A', color: '#c05020', up: h <= 0 });
  }
  if (imageShown && isFinite(OA2) && Math.abs(OA2) < FAR_CM) {
    pts.push({ rank: 3, cm: OA2, text: "A'",
               color: OA2 > 0 ? '#2a6aaa' : '#b04020', up: h2 < 0 });
  }

  const marks = pts
    .map(m => ({ ...m, x: cmToX(m.cm) }))
    .sort((a, b) => (a.cm - b.cm) || (a.rank - b.rank));

  // Regroupement des points rigoureusement confondus.
  const groups = [];
  for (const m of marks) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(m.cm - g.cm) <= AXIS_SAME_CM) g.parts.push(m);
    else groups.push({ cm: m.cm, x: m.x, parts: [m] });
  }

  for (const g of groups) {
    const ordered = g.parts.slice().sort((a, b) => a.rank - b.rank);
    // Un groupe qui contient un point objet ou image en prend la couleur :
    // elle porte une information (réelle / virtuelle) que le gris n'a pas.
    const carrier = ordered.find(m => m.up !== undefined) ?? ordered[0];

    pushLabel({
      text: ordered.map(m => m.text).join(' = '),
      x: g.x, y: axisY,
      color: carrier.color,
      fontPx: fs(30),
      // Le point s'écarte de O, et se pose du côté opposé à sa flèche.
      placements: cornerPlacements(fs(9), fs(9),
                                   g.cm < 0 ? -1 : 1,
                                   (carrier.up ?? true) ? -1 : 1),
      priority: ordered.some(m => m.rank >= 2) ? 20 : 40,
    });
  }
}

/* ── Lentille (double flèche verticale) ── */
function drawLens() {
  const { lensX, axisY, scale, lensRadiusCm, lensType } = sim;
  const lensHpx = lensRadiusCm * scale;
  const top = axisY - lensHpx;
  const bot = axisY + lensHpx;
  const aw = fs(10), ah = fs(14);

  ctx.save();
  ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = fs(2.5);

  ctx.beginPath(); ctx.moveTo(lensX, top); ctx.lineTo(lensX, bot); ctx.stroke();

  if (lensType === 'conv') {
    ctx.beginPath();
    ctx.moveTo(lensX - aw, top + ah); ctx.lineTo(lensX, top); ctx.lineTo(lensX + aw, top + ah);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lensX - aw, bot - ah); ctx.lineTo(lensX, bot); ctx.lineTo(lensX + aw, bot - ah);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(lensX - aw, top); ctx.lineTo(lensX, top + ah); ctx.lineTo(lensX + aw, top);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lensX - aw, bot); ctx.lineTo(lensX, bot - ah); ctx.lineTo(lensX + aw, bot);
    ctx.stroke();
  }

  // O : de préférence en haut à droite du centre optique.
  pushLabel({
    text: 'O', x: lensX, y: axisY,
    color: '#2c3e50', fontPx: fs(30),
    placements: cornerPlacements(fs(8), fs(8), 1, -1),
    priority: 30,
  });

  // Arc d'angle alpha (mode infini, alpha ≠ 0)
  if (sim.infini && sim.alpha !== 0) {
    const alphaRad = sim.alpha * Math.PI / 180;
    const arcR = fs(38);
    const angleAxis = Math.PI;
    const angleRay  = Math.PI - alphaRad;

    const aStart = alphaRad >= 0 ? angleRay  : angleAxis;
    const aEnd   = alphaRad >= 0 ? angleAxis : angleRay;

    ctx.save();
    ctx.strokeStyle = '#2a6aaa'; ctx.lineWidth = fs(1.5);
    ctx.beginPath(); ctx.arc(lensX, axisY, arcR, aStart, aEnd); ctx.stroke();

    ctx.restore();

    const aMid = (aStart + aEnd) / 2;
    pushLabel({
      text: 'α',
      x: lensX + (arcR + fs(14)) * Math.cos(aMid),
      y: axisY + (arcR + fs(14)) * Math.sin(aMid),
      color: '#2a6aaa', fontPx: fs(18), family: 'serif',
      placements: [{ dx: 0, dy: 0, align: 'center', baseline: 'middle' }],
      priority: 15,
    });
  }

  ctx.restore();
}

/* ── Objet AB (flèche terracotta, draggable) ── */
function drawObject() {
  const { OA, h, axisY } = sim;
  const x  = cmToX(OA);
  const yA = axisY;
  const yB = cmToY(h);
  const arrowDir = h > 0 ? 1 : -1;

  ctx.save();
  ctx.strokeStyle = '#c05020'; ctx.lineWidth = fs(3);
  ctx.beginPath(); ctx.moveTo(x, yA); ctx.lineTo(x, yB); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - fs(8), yB + arrowDir * fs(14));
  ctx.lineTo(x, yB);
  ctx.lineTo(x + fs(8), yB + arrowDir * fs(14));
  ctx.stroke();
  ctx.restore();

  // A est sur l'axe : son étiquette est posée par pushAxisPointLabels(),
  // qui seul sait si le point se confond avec un foyer.
  pushLabel({
    text: 'B', x, y: yB,
    color: '#c05020', fontPx: fs(30),
    placements: cornerPlacements(fs(8), fs(8), -1, h > 0 ? -1 : 1),
    priority: 20,
  });
}

/* ── Image A'B' ── */
function drawImage(alphaVal) {
  const { OA2, h2, infini } = sim;
  if (!isFinite(OA2) || Math.abs(OA2) > FAR_CM || alphaVal <= 0) return;

  const x  = cmToX(OA2);
  const yA = sim.axisY;
  const yB = cmToY(h2);

  const isReal   = OA2 > 0;
  const col      = isReal ? '#2a6aaa' : '#b04020';
  const dash     = isReal ? [] : [5, 4];
  const arrowDir = h2 >= 0 ? 1 : -1;

  ctx.save();
  ctx.globalAlpha = alphaVal;
  ctx.strokeStyle = col; ctx.lineWidth = fs(3);
  ctx.setLineDash(dash.map(d => fs(d)));
  ctx.beginPath(); ctx.moveTo(x, yA); ctx.lineTo(x, yB); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - fs(7), yB + arrowDir * fs(12));
  ctx.lineTo(x, yB);
  ctx.lineTo(x + fs(7), yB + arrowDir * fs(12));
  ctx.stroke();
  ctx.setLineDash([]);

  if (infini) {
    const arm = fs(7);
    ctx.strokeStyle = col; ctx.lineWidth = fs(1.8);
    ctx.beginPath();
    ctx.moveTo(x - arm, yA); ctx.lineTo(x + arm, yA);
    ctx.moveTo(x, yA - arm); ctx.lineTo(x, yA + arm);
    ctx.stroke();
  }

  ctx.restore();

  // A' est sur l'axe : pushAxisPointLabels() s'en charge, et le fusionne
  // avec F' lorsque l'objet est à l'infini.
  pushLabel({
    text: "B'", x, y: yB,
    color: col, fontPx: fs(30),
    placements: cornerPlacements(fs(8), fs(8), 1, h2 >= 0 ? -1 : 1),
    priority: 20,
  });
}

/* ── Écran ── */
function drawScreen() {
  const { OE, axisY, lensHpx } = sim;
  const x = cmToX(OE);

  ctx.save();
  ctx.strokeStyle = '#7a4010';
  ctx.lineWidth   = fs(4);
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(x, axisY - lensHpx); ctx.lineTo(x, axisY + lensHpx);
  ctx.stroke();
  ctx.restore();

  // « Écran » était écrit ici même, puis recouvert par le cadre Image, que
  // drawViewfinders() peint ensuite : l'étiquette passe par le gestionnaire,
  // qui la déplace au lieu de la laisser disparaître.
  pushLabel({
    text: 'Écran', x, y: axisY - lensHpx - fs(6),
    color: '#7a4010', fontPx: fs(15), family: '"Segoe UI", Arial, sans-serif',
    placements: [
      { dx: 0,       dy: 0, align: 'center', baseline: 'bottom' },
      { dx: -fs(10), dy: 0, align: 'right',  baseline: 'bottom' },
      { dx:  fs(10), dy: 0, align: 'left',   baseline: 'bottom' },
    ],
    priority: 50,
  });
}

/* ═══════════════════════════════════════════════════
   BARRE D'ÉCHELLE
   ─────────────────────────────────────────────────
   Puisque la molette change l'échelle, le schéma n'est plus lisible
   sans repère métrique explicite. On choisit dans la série 1-2-5 la
   plus grande longueur ronde qui tient sous BAR_MAX_PX, et on la
   dessine graduée en cinq intervalles, en bas à gauche du canvas.
════════════════════════════════════════════════════ */
const BAR_MAX_PX  = 170;
const BAR_STEPS   = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];

function drawScaleBar() {
  const { H, scale } = sim;

  // Plus grande graduation ronde dont la longueur reste sous le plafond.
  let stepCm = BAR_STEPS[0];
  for (const s of BAR_STEPS) {
    if (s * scale <= BAR_MAX_PX) stepCm = s; else break;
  }
  const lenPx = stepCm * scale;

  const x0 = fs(16);
  const y  = H - fs(20);
  const tickH = fs(6);

  const label = (stepCm < 1 ? stepCm.toFixed(1).replace('.', ',') : String(stepCm)) + ' cm';

  ctx.save();
  ctx.strokeStyle = '#7a6a52';
  ctx.fillStyle   = '#7a6a52';
  ctx.lineWidth   = fs(1.6);
  ctx.lineCap     = 'butt';

  // Trait principal + montants d'extrémité
  ctx.beginPath();
  ctx.moveTo(x0, y); ctx.lineTo(x0 + lenPx, y);
  ctx.moveTo(x0, y - tickH); ctx.lineTo(x0, y + tickH);
  ctx.moveTo(x0 + lenPx, y - tickH); ctx.lineTo(x0 + lenPx, y + tickH);
  ctx.stroke();

  // Graduations intermédiaires (cinquièmes), plus courtes
  ctx.lineWidth = fs(1);
  ctx.beginPath();
  for (let k = 1; k < 5; k++) {
    const xk = x0 + lenPx * k / 5;
    ctx.moveTo(xk, y); ctx.lineTo(xk, y - tickH * 0.6);
  }
  ctx.stroke();

  ctx.font = `${fs(12).toFixed(1)}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(label, x0, y - tickH - fs(4));

  // Facteur de zoom, en retrait, seulement s'il diffère de 1.
  if (Math.abs(sim.zoom - 1) > 0.02) {
    ctx.fillStyle = 'rgba(122,106,82,0.65)';
    ctx.font = `${fs(11).toFixed(1)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText('×' + sim.zoom.toFixed(2).replace('.', ','), x0, y + tickH + fs(12));
  }
  ctx.restore();

  // La barre n'est pas une étiquette gérée, mais elle occupe le coin :
  // on l'interdit au placement pour qu'aucun texte ne vienne s'y poser.
  reserveBox(0, y - tickH - fs(20), x0 + lenPx + fs(8), H);
}

/* ═══════════════════════════════════════════════════
   CADRES DE VISUALISATION (Objet / Image sur écran)
════════════════════════════════════════════════════ */
function drawViewfinders() {
  const { W, frameW, frameH, barH, frameMargin: margin } = sim;

  const frameY  = margin;
  const leftX   = margin;
  const rightX  = W - margin - frameW;

  // Les deux cadres sont opaques : ils réservent leur emprise, repliés
  // (barre de titre seule) comme dépliés.
  for (const [fx, collapsed] of [[leftX, sim.objCollapsed], [rightX, sim.imgCollapsed]]) {
    reserveBox(fx, frameY, fx + frameW, frameY + (collapsed ? barH : frameH));
  }

  // Champ de vision représenté dans le cadre, en centimètres. Le cadre étant
  // désormais plafonné, on ne peut plus dessiner à l'échelle de la scène :
  // on projette sur la hauteur utile réelle du cadre.
  // Le champ s'élargit si l'objet dépasse : avec AB jusqu'à 50 cm, un champ
  // figé à 16 cm ne montrerait plus qu'un trait vertical. Objet et image
  // partagent ce même champ, donc la comparaison des tailles reste juste.
  const FIELD_CM = Math.max(16, Math.abs(sim.h) * 1.25);
  const innerScale = (frameH - barH - 1) / FIELD_CM;

  function drawBar(fx, fy, fw, label) {
    ctx.save();
    ctx.fillStyle = '#e8e4de'; ctx.fillRect(fx, fy, fw, barH);
    ctx.strokeStyle = '#c8c0b4'; ctx.lineWidth = 1; ctx.strokeRect(fx, fy, fw, barH);
    ctx.fillStyle = '#2c3e50';
    ctx.font = `bold ${fs(13).toFixed(1)}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // Le bouton +/− mange la droite de la barre : on centre sur l'espace restant.
    ctx.fillText(label, fx + (fw - fs(21)) / 2, fy + barH / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  function drawInner(fx, fy, fw, fh) {
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(fx + 1, fy + barH, fw - 2, fh - barH - 1);
    ctx.beginPath();
    ctx.rect(fx + 1, fy + barH, fw - 2, fh - barH - 1);
    ctx.clip();
  }

  function drawGlowLetter(cx, cy, hPx, flipH, flipV, blurPx) {
    const sw    = Math.max(2, hPx * 0.10);
    const yTop  = cy - hPx / 2;
    const yBot  = cy + hPx / 2;
    const bumpR = hPx * 0.225;
    const bumpH = bumpR * 2;
    const xRc   = hPx * 0.22;
    const futX  = flipH ? cx + hPx * 0.18 : cx - hPx * 0.18;
    const arcCX = flipH ? futX - xRc       : futX + xRc;
    const arcCCW = flipH;
    const bumpy1   = flipV ? yBot - bumpH : yTop;
    const bumpy2   = flipV ? yBot         : yTop + bumpH;
    const arcCyVal = flipV ? yBot - bumpR : yTop + bumpR;

    function strokeLetter() {
      ctx.beginPath();
      ctx.moveTo(futX, yTop); ctx.lineTo(futX, yBot); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(futX, bumpy1); ctx.lineTo(arcCX, bumpy1);
      ctx.arc(arcCX, arcCyVal, bumpR, -Math.PI / 2, Math.PI / 2, arcCCW);
      ctx.lineTo(futX, bumpy2); ctx.stroke();
    }

    ctx.save();
    if (blurPx > 0.5) {
      ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
      const s = 1 + (blurPx / (hPx * 0.8)) * 1.6;
      ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
    }
    const glowR = hPx * 0.9;
    const glow  = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    glow.addColorStop(0,   'rgba(255, 220, 120, 0.18)');
    glow.addColorStop(0.5, 'rgba(255, 180,  60, 0.08)');
    glow.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2);
    ctx.save();
    ctx.shadowColor = 'rgba(255, 200, 80, 0.9)'; ctx.shadowBlur = sw * 2.5;
    ctx.strokeStyle = '#ffe090'; ctx.lineWidth = sw;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    strokeLetter(); ctx.restore();
    ctx.save();
    ctx.shadowColor = 'rgba(255, 255, 200, 1)'; ctx.shadowBlur = sw * 1.2;
    ctx.strokeStyle = 'rgba(255, 255, 220, 0.7)'; ctx.lineWidth = sw * 0.35;
    ctx.lineCap = 'round';
    strokeLetter(); ctx.restore();
    ctx.filter = 'none';
    ctx.restore();
  }

  function drawBlurSpot(ix, iy, iw, ih, intensity) {
    const cx = ix + iw / 2, cy = iy + ih / 2;
    const r  = Math.min(iw, ih) * 0.65 * intensity;
    const g  = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0,   `rgba(255, 220, 100, ${0.85 * intensity})`);
    g.addColorStop(0.3, `rgba(255, 160,  40, ${0.55 * intensity})`);
    g.addColorStop(0.7, `rgba(200,  80,   0, ${0.15 * intensity})`);
    g.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(ix, iy, iw, ih);
    ctx.fillRect(ix, iy, iw, ih);
  }

  function drawNoImageMsg(fx, fy, fw, fh, msg) {
    ctx.fillStyle = 'rgba(180,160,120,0.85)';
    ctx.font = `bold ${fs(11).toFixed(1)}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(msg, fx + fw / 2, fy + fh - fs(6));
    ctx.textBaseline = 'alphabetic';
  }

  // ══ CADRE OBJET ══
  drawBar(leftX, frameY, frameW, 'Objet');
  if (!sim.objCollapsed) {
    drawInner(leftX, frameY, frameW, frameH);
    const ix = leftX + 1, iy = frameY + barH;
    const iw = frameW - 2, ih = frameH - barH - 1;
    const hPx = Math.abs(sim.h) * innerScale;
    drawGlowLetter(ix + iw / 2, iy + ih / 2, hPx, false, sim.h < 0, 0);
    ctx.restore();
  }

  // ══ CADRE IMAGE ══
  drawBar(rightX, frameY, frameW, 'Image sur écran');
  if (!sim.imgCollapsed) {
    drawInner(rightX, frameY, frameW, frameH);
    const ix = rightX + 1, iy = frameY + barH;
    const iw = frameW - 2, ih = frameH - barH - 1;
    const { OA2, h2, OE, f } = sim;
    const isReal    = isFinite(OA2) && Math.abs(OA2) < FAR_CM && OA2 > 0;
    const isVirtual = isFinite(OA2) && Math.abs(OA2) < FAR_CM && OA2 < 0;

    // En mode « objet à l'infini », A'B' n'est un point que si α = 0 : dès que
    // l'angle est non nul l'image a une taille et se dessine comme dans le cas
    // général (lettre, floutée selon l'écart écran / plan image).
    if (sim.infini && isReal && Math.abs(h2) * innerScale > 1.5) {
      const distCm    = Math.abs(OE - OA2);
      const blurSeuil = Math.max(3, Math.abs(f) * 0.4);
      const blurFrac  = Math.min(1, distCm / blurSeuil);
      const h2Px      = Math.abs(h2) * innerScale;
      const blurPx    = blurFrac * blurFrac * h2Px * 0.8;
      drawGlowLetter(ix + iw / 2, iy + ih / 2, h2Px, true, h2 < 0, blurPx);
    } else if (sim.infini) {
      const distCm   = Math.abs(OE - OA2);
      const seuil    = Math.max(2, Math.abs(f) * 0.5);
      const t        = Math.min(1, distCm / seuil);
      const cx = ix + iw / 2, cy = iy + ih / 2;
      const rMax = Math.min(iw, ih) * 0.62;
      const r    = rMax * t + 6;
      const alpha0 = 1.0 - 0.65 * t;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0,   `rgba(255, 240, 180, ${alpha0})`);
      g.addColorStop(0.25, `rgba(255, 200,  80, ${alpha0 * 0.75})`);
      g.addColorStop(0.6,  `rgba(255, 120,  20, ${alpha0 * 0.35})`);
      g.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      if (t < 0.15) {
        const rCore = r * 0.4;
        const gc = ctx.createRadialGradient(cx, cy, 0, cx, cy, rCore);
        gc.addColorStop(0,   `rgba(255, 255, 240, ${(1 - t / 0.15) * 0.9})`);
        gc.addColorStop(1,   'rgba(255,255,255,0)');
        ctx.fillStyle = gc;
        ctx.beginPath(); ctx.arc(cx, cy, rCore, 0, Math.PI * 2); ctx.fill();
      }
      if (OA2 <= 0) {
        drawNoImageMsg(rightX, frameY, frameW, frameH, "Pas d'image réelle");
      }
    } else if (!isReal && !isVirtual) {
      drawBlurSpot(ix, iy, iw, ih, 1.0);
      drawNoImageMsg(rightX, frameY, frameW, frameH, "Image à l'infini");
    } else if (isVirtual) {
      drawBlurSpot(ix, iy, iw, ih, 1.0);
      drawNoImageMsg(rightX, frameY, frameW, frameH, "Pas d'image réelle");
    } else {
      const distCm    = Math.abs(OE - OA2);
      const blurSeuil = Math.max(3, Math.abs(f) * 0.4);
      const blurFrac  = Math.min(1, distCm / blurSeuil);
      const h2Px      = Math.abs(h2) * innerScale;
      const blurPx    = blurFrac * blurFrac * h2Px * 0.8;
      drawGlowLetter(ix + iw / 2, iy + ih / 2, h2Px, true, sim.h > 0, blurPx);
    }
    ctx.restore();
  }

  layoutCanvasButtons(leftX, rightX, frameY);
}

/* ─────────────────────────────────────────────────
   layoutCanvasButtons() — Place les boutons HTML superposés au canvas.
   Ils étaient auparavant dessinés au pinceau : ils n'avaient alors ni
   survol, ni focus clavier, ni rôle accessible, et ignoraient le zoom
   du navigateur. Seule leur position reste calculée ici, puisqu'elle
   dépend de la géométrie des cadres.
───────────────────────────────────────────────────── */
function layoutCanvasButtons(leftX, rightX, frameY) {
  const { frameW, frameH, barH } = sim;

  function place(el, x, y, w, h, fontPx) {
    el.style.left     = x + 'px';
    el.style.top      = y + 'px';
    el.style.width    = w + 'px';
    el.style.height   = h + 'px';
    el.style.fontSize = fontPx.toFixed(1) + 'px';
    // Le bouton est opaque : aucune étiquette ne doit se glisser dessous.
    reserveBox(x, y, x + w, y + h);
  }

  const bs = fs(17);
  const collapseY = frameY + (barH - bs) / 2;

  for (const [id, fx, collapsed, nom] of
       [['btn-obj-collapse', leftX,  sim.objCollapsed, 'Objet'],
        ['btn-img-collapse', rightX, sim.imgCollapsed, 'Image']]) {
    const el = document.getElementById(id);
    if (!el) continue;
    place(el, fx + frameW - bs - fs(5), collapseY, bs, bs, fs(14));
    el.textContent = collapsed ? '+' : '−';
    el.title = (collapsed ? 'Déplier' : 'Replier') + ' le cadre ' + nom;
    el.setAttribute('aria-expanded', String(!collapsed));
  }

  const autoBtn = document.getElementById('btn-auto-screen');
  if (autoBtn) {
    const aw = fs(64), ah = fs(22);
    place(autoBtn, rightX + (frameW - aw) / 2,
          frameY + (sim.imgCollapsed ? barH : frameH) + fs(6), aw, ah, fs(11));
    autoBtn.classList.toggle('active', sim.autoScreen);
    autoBtn.setAttribute('aria-pressed', String(sim.autoScreen));
  }
}

/* ═══════════════════════════════════════════════════
   CALCUL DES RAYONS
════════════════════════════════════════════════════ */
function computeRays() {
  const { f, h, OA, OA2, infini, alpha, nRays, lensRadiusCm, lensType } = sim;
  const fEff = lensType === 'div' ? -f : f;
  const fObj = -fEff;

  const xRight = xToCm(sim.W + 80);
  const xLeft  = xToCm(-80);

  const imgAtInfinity = !isFinite(OA2) || Math.abs(OA2) > FAR_CM;
  const alphaRad = alpha * Math.PI / 180;

  // Départ du balayage : l'abscisse où les rayons naissent réellement.
  // Hors mode infini c'est l'objet lui-même — partir du bord du canvas
  // laissait défiler un quart de l'animation avant le premier trait visible.
  // Le plancher à -80 px couvre le cas où l'objet est très loin à gauche
  // (animation « vers l'infini », où OA descend jusqu'à −2000 cm).
  const xLeftPx  = cmToX(xLeft);
  const xRightPx = cmToX(xRight);
  const xStartPx = infini ? xLeftPx : Math.max(xLeftPx, cmToX(OA));
  sim._animXLeft  = xStartPx;
  sim._animXRight = xRightPx;

  let fracImage = 1.0;
  if (!imgAtInfinity && OA2 > 0) {
    const imgXpx = cmToX(OA2);
    fracImage = Math.min(1.0, Math.max(0, (imgXpx - xStartPx) / (xRightPx - xStartPx)));
  }
  sim.animTImage = fracImage;

  function raysForSource(srcH, overrideColors, groupId = -1) {
    let yiList = [], colorList = [], isMainList = [];

    const R  = lensRadiusCm;
    const Rc = R / 5;

    if (infini) {
      const canonical = [Rc, 0, -Rc];
      const GRIS = '#7a8a96';

      if (nRays === 3) {
        yiList     = [...canonical];
        colorList  = [GRIS, GRIS, GRIS];
        isMainList = [true, true, true];
      } else {
        const nExtra = nRays - 3;
        const allExtra = [];
        const nLevels = 4;
        for (let k = 1; k <= nLevels; k++) {
          const yAbs = Rc + (R - Rc) * k / nLevels;
          allExtra.push(yAbs); allExtra.push(-yAbs);
        }
        allExtra.sort((a, b) => Math.abs(a) - Math.abs(b));
        const extraYi = allExtra.slice(0, nExtra);
        yiList     = [...canonical, ...extraYi];
        colorList  = yiList.map(() => GRIS);
        isMainList = [true, true, true, ...extraYi.map(() => false)];
      }

    } else {
      const slopeFo = (0 - srcH) / (fObj - OA);
      const yLens3  = srcH + slopeFo * (0 - OA);

      if (sim.infiniAnim) {
        const canonical = [Rc, 0, -Rc];
        const GRIS = '#7a8a96';
        if (nRays === 3) {
          yiList     = [...canonical];
          colorList  = [GRIS, GRIS, GRIS];
          isMainList = [true, true, true];
        } else {
          const nExtra = nRays - 3;
          const allExtra = [];
          const nLevels = 4;
          for (let k = 1; k <= nLevels; k++) {
            const yAbs = Rc + (R - Rc) * k / nLevels;
            allExtra.push(yAbs); allExtra.push(-yAbs);
          }
          allExtra.sort((a, b) => Math.abs(a) - Math.abs(b));
          const extraYi = allExtra.slice(0, nExtra);
          yiList     = [...canonical, ...extraYi];
          colorList  = yiList.map(() => GRIS);
          isMainList = [true, true, true, ...extraYi.map(() => false)];
        }
      } else {
        const canonical = [srcH, 0, yLens3];
        if (nRays === 3) {
          yiList     = [...canonical];
          colorList  = overrideColors ? [...overrideColors] : [...RAY_COLORS];
          isMainList = [true, true, true];
        } else {
          const nExtra = nRays - 3;
          const allExtra = [];
          const nLevels = 7;
          for (let k = 1; k <= nLevels; k++) {
            const yAbs = R * k / nLevels;
            allExtra.push(yAbs); allExtra.push(-yAbs);
          }
          allExtra.sort((a, b) => Math.abs(a) - Math.abs(b));
          const extraYi = allExtra.slice(0, nExtra).map(y => {
            for (const cy of canonical) {
              if (Math.abs(y - cy) < R * 0.06) y += (y >= cy ? 1 : -1) * R * 0.06;
            }
            return y;
          });
          yiList     = [...canonical, ...extraYi];
          colorList  = overrideColors
            ? [...overrideColors, ...extraYi.map(() => overrideColors[1])]
            : [...RAY_COLORS, ...extraYi.map(() => '#7a8a96')];
          isMainList = [true, true, true, ...extraYi.map(() => false)];
        }
      }
    }

    const rays = [];
    for (let ri = 0; ri < yiList.length; ri++) {
      const yi     = yiList[ri];
      const color  = colorList[ri];
      const isMain = isMainList[ri];
      const segs   = [];

      let slopeIn;
      if (infini) {
        slopeIn = Math.tan(alphaRad);
      } else {
        slopeIn = (yi - srcH) / (0 - OA);
      }
      const slopeOut = slopeIn - yi / fEff;

      if (infini) {
        const yAtLeft = yi + slopeIn * xLeft;
        segs.push({ pts: [p(xLeft, yAtLeft), p(0, yi)], virtual: false });
      } else {
        segs.push({ pts: [p(OA, srcH), p(0, yi)], virtual: false });
      }

      if (imgAtInfinity) {
        segs.push({ pts: [p(0, yi), p(xRight, yi + slopeOut * xRight)], virtual: false });
      } else if (OA2 > 0) {
        const yAtImg = yi + slopeOut * OA2;
        segs.push({ pts: [p(0, yi), p(OA2, yAtImg)],                          virtual: false });
        segs.push({ pts: [p(OA2, yAtImg), p(xRight, yi + slopeOut * xRight)], virtual: false });
      } else {
        segs.push({ pts: [p(0, yi), p(xRight, yi + slopeOut * xRight)], virtual: false });
        const yAtImg = yi + slopeOut * OA2;
        segs.push({ pts: [p(0, yi), p(OA2, yAtImg)], virtual: true });
      }

      rays.push({ color, segs, isMain, groupId });
    }
    return rays;
  }

  if (!infini && sim.multiPoints) {
    const srcList = [0];
    const step = h >= 0 ? 1 : -1;
    for (let y = step; Math.abs(y) < Math.abs(h) - 0.01; y += step) srcList.push(y);
    if (Math.abs(h) > 0.01) srcList.push(h);

    const allRays = [];
    srcList.forEach((srcH, i) => {
      const mainColor = '#b0b8c4';
      const dimColor  = '#c8cfd8';
      allRays.push(...raysForSource(srcH, [mainColor, dimColor, mainColor], i));
    });
    return allRays;
  }

  return raysForSource(h, null);
}

/* ── Tracé instantané ── */
function drawRaysInstant(rays) {
  const normal  = rays.filter(r => !(sim.multiPoints && sim.hoveredGroup !== -1 && r.groupId === sim.hoveredGroup));
  const hovered = rays.filter(r =>   sim.multiPoints && sim.hoveredGroup !== -1 && r.groupId === sim.hoveredGroup);
  for (const ray of [...normal, ...hovered]) {
    const isHov = hovered.includes(ray);
    const color = isHov ? '#cc2200' : ray.color;
    for (const seg of ray.segs) {
      drawSegment(seg.pts, color, seg.virtual, 1.0, ray.isMain, isHov);
    }
  }
}

/* ── Tracé animé ── */
function drawRaysAnim(rays, t) {
  const xLeft    = sim._animXLeft  ?? -80;
  const xRight   = sim._animXRight ?? (sim.W + 80);
  const currentX = xLeft + t * (xRight - xLeft);

  const normal  = rays.filter(r => !(sim.multiPoints && sim.hoveredGroup !== -1 && r.groupId === sim.hoveredGroup));
  const hovered = rays.filter(r =>   sim.multiPoints && sim.hoveredGroup !== -1 && r.groupId === sim.hoveredGroup);

  for (const ray of [...normal, ...hovered]) {
    const { segs, isMain } = ray;
    const isHov = hovered.includes(ray);
    const color = isHov ? '#cc2200' : ray.color;
    const realSegs = segs.filter(s => !s.virtual);

    for (const seg of realSegs) {
      const x0 = seg.pts[0].x;
      const x1 = seg.pts[seg.pts.length - 1].x;
      if (currentX <= x0) continue;
      if (currentX >= x1) {
        drawSegment(seg.pts, color, false, 1.0, isMain, isHov);
      } else {
        drawSegmentToX(seg.pts, color, isMain, isHov, currentX);
      }
    }

    if (t >= 1.0) {
      for (const seg of segs.filter(s => s.virtual)) {
        drawSegment(seg.pts, color, true, 1.0, isMain, isHov);
      }
    }
  }
}

/* ── Tracé d'un segment jusqu'à un X donné ── */
function drawSegmentToX(pts, color, isMain, hovered, targetX) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = fs(hovered ? 2.8 : (isMain ? 2.2 : 1.4));
  ctx.globalAlpha = hovered ? 1.0 : (isMain ? 1.0 : 0.65);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const x0 = pts[i-1].x, y0 = pts[i-1].y;
    const x1 = pts[i].x,   y1 = pts[i].y;
    if (targetX >= x1) {
      ctx.lineTo(x1, y1);
    } else {
      const t = (targetX - x0) / (x1 - x0);
      ctx.lineTo(x0 + t * (x1 - x0), y0 + t * (y1 - y0));
      break;
    }
  }
  ctx.stroke();
  ctx.restore();
}

/* ── Longueur d'une polyligne ── */
function segLength(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
    l += Math.sqrt(dx*dx + dy*dy);
  }
  return l;
}

/* ── Dessine un segment avec progression frac ── */
function drawSegment(pts, color, virtual, frac, isMain = true, hovered = false) {
  if (pts.length < 2) return;
  const targetLen = frac * segLength(pts);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = fs(virtual ? 1.5 : (hovered ? 2.8 : (isMain ? 2.2 : 1.4)));
  ctx.globalAlpha = virtual ? 0.55 : (hovered ? 1.0 : (isMain ? 1.0 : 0.65));
  ctx.lineCap     = 'round';
  if (virtual) ctx.setLineDash([fs(6), fs(5)]);

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  let covered = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
    const segLen = Math.sqrt(dx*dx + dy*dy);
    const rem    = targetLen - covered;
    if (rem >= segLen) {
      ctx.lineTo(pts[i].x, pts[i].y); covered += segLen;
    } else {
      const t = rem / segLen;
      ctx.lineTo(pts[i-1].x + dx*t, pts[i-1].y + dy*t);
      break;
    }
  }
  ctx.stroke();

  if (frac >= 1.0 && !virtual) {
    drawArrowHead(pts[pts.length - 2], pts[pts.length - 1], color, isMain);
  }
  ctx.restore();
}

/* ── Petite flèche directionnelle ── */
function drawArrowHead(from, to, color, isMain = true) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.sqrt(dx*dx + dy*dy);
  if (len < 2) return;
  const ux = dx/len, uy = dy/len;
  const mx = (from.x + to.x)/2, my = (from.y + to.y)/2;
  const aLen = fs(isMain ? 9 : 7), aHalf = fs(isMain ? 5 : 3.5);

  ctx.save();
  ctx.fillStyle   = color;
  ctx.globalAlpha = isMain ? 1.0 : 0.65;
  ctx.beginPath();
  ctx.moveTo(mx + ux*aLen/2,             my + uy*aLen/2);
  ctx.lineTo(mx - ux*aLen/2 - uy*aHalf, my - uy*aLen/2 + ux*aHalf);
  ctx.lineTo(mx - ux*aLen/2 + uy*aHalf, my - uy*aLen/2 - ux*aHalf);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
