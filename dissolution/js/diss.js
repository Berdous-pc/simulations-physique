// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

/* diss.js — onglet Dissolution : coupelle de soluté solide, verre d'eau,
   interaction clic-puis-glisser, séparation des ions au contact de l'eau,
   mouvement brownien, tableau d'avancement. Chargé après diss-data.js, avant
   ui.js (qui orchestre resize()/init()/loop()/setMainTab() pour les deux
   onglets de la page).

   Tous les identifiants sont préfixés diss/DISS_ pour ne jamais entrer en
   collision avec l'état global de l'onglet Mécanisme (state, STAGE_W/H,
   resize, drawScene, loop, init...). Les utilitaires génériques de sim.js
   (drawSphere, lerp, clamp01) sont réutilisés tels quels. */

/* ══════════════════════════════════════════════════
   Constantes de scène — résolution logique propre, distincte de STAGE_W/H
   (Mécanisme) car la composition (coupelle + verre côte à côte) est
   entièrement différente de la grille cristalline.
══════════════════════════════════════════════════ */
const DISS_STAGE_W = 1000, DISS_STAGE_H = 560;

/* Rayon commun de toutes les sphères d'ions affichées (tas de soluté
   solide, ions dissous, groupement en cours de glisser) — volontairement
   petit, sans texte à l'intérieur (code couleur seul). */
const DISS_ION_R = 7;

const DISS_VOL_MIN = 100, DISS_VOL_MAX = 2000;      // mL, bornes du slider volume
/* Le récipient a une taille fixe à l'écran (cf. computeDissSceneLayout) :
   seule la fraction remplie varie avec le volume choisi. */
const DISS_FILL_MIN = 0.15, DISS_FILL_MAX = 0.92;

/* Mouvement brownien — mêmes ordres de grandeur que ESPECES.V_BROWN/DAMPING
   dans titrage/js/ui.js (dt attendu en secondes, comme là-bas). */
const DISS_V_BROWN = 10.0, DISS_DAMPING = 0.85;

/* Décollement visuel des récipients par rapport à la ligne de table : leur
   propre fond est dessiné DISS_BASE_LIFT px au-dessus de tableY, pour qu'ils
   aient l'air posés dessus plutôt qu'encastrés dedans (sinon leur trait de
   fond se superpose exactement au trait de la table). */
const DISS_BASE_LIFT = 2;

/* ══════════════════════════════════════════════════
   État
══════════════════════════════════════════════════ */
const dissState = {
  soluteId: 'nacl',
  volumeML: 1000,
  unit: 'mol',                 // 'mol' | 'molL'
  nApporte: 0,                 // nb de groupements largués dans l'eau depuis le dernier reset (mol)
  tableY: 0,                   // ligne de table sur laquelle reposent la coupelle et le verre (vue de profil)
  baseY: 0,                    // fond réel des récipients (légèrement au-dessus de tableY, cf. DISS_BASE_LIFT)
  dish: { pileBack: [], pileFront: [], x0: 0, y0: 0, w: 0, h: 0, flare: 0 },
  glass: { x0: 0, y0: 0, w: 0, h: 0, wallInset: 10, waterTopY: 0, bottomY: 0 },
  heldGrain: null,              // { x, y, solute } pendant le clic-glisser
  freeSpecies: [],              // ions/molécules dispersés dans l'eau : { x, y, vx, vy, especeIdx, el, fill, border }
};

/* ══════════════════════════════════════════════════
   Géométrie — coupelle et verre vus de profil, posés sur une même ligne de
   table (tableY), en unités de scène fixes (DISS_STAGE_W/H) : ne dépend
   jamais de la taille réelle de la fenêtre, seule la mise à l'échelle CSS
   (dissResize()) en tient compte.
══════════════════════════════════════════════════ */
function computeDissSceneLayout() {
  dissState.tableY = 460;
  dissState.baseY = dissState.tableY - DISS_BASE_LIFT;   // fond des récipients, posés sur la table

  const d = dissState.dish;
  d.w = 225; d.h = 100; d.flare = 26;
  d.x0 = 150; d.y0 = dissState.baseY - d.h;

  const g = dissState.glass;
  g.w = 225; g.h = 264;
  g.x0 = 620; g.y0 = dissState.baseY - g.h;
}

/* Distance visée (en unités de rayon r) entre deux atomes tangents / très
   légèrement chevauchants, pour des sphères dessinées à r*0.85 (cf.
   dissDrawGrain()) — sert à la fois à calibrer les offsets `dx/dy` de
   chaque `grain` (diss-data.js, atomes d'un même groupement) et l'espacement
   entre groupements voisins du pavage ci-dessous (même logique de contact
   appliquée aux deux échelles). */
const DISS_TOUCH_GAP = 1.6;

/* Empan (en unités de rayon r) du gabarit `grain` sur un axe donné. */
function dissGrainSpan(solute, axis) {
  const values = solute.grain.map(p => (axis === 'x' ? p.dx : p.dy));
  return Math.max(...values) - Math.min(...values);
}

/* Débord maximal (en px) d'un atome par rapport à l'ancre (centre) de son
   groupement, dans chaque direction — c'est-à-dire l'offset `dx`/`dy` le
   plus extrême du gabarit `grain`, converti en px, PLUS le rayon de la
   sphère elle-même (r*0.85, cf. dissDrawGrain()). Sert à border le pavage
   (buildDissPile()) pour qu'aucun atome, même le plus excentré de son
   groupement, ne déborde jamais des parois/du fond de la coupelle — la
   marge d'ancien calcul (juste DISS_ION_R) ignorait cet excentrement et
   laissait déborder les groupements en bord de tas. */
function dissGrainMargins(solute) {
  const r = DISS_ION_R;
  const atomR = r * 0.85;
  let maxDx = 0, maxUp = 0, maxDown = 0;
  solute.grain.forEach(part => {
    maxDx = Math.max(maxDx, Math.abs(part.dx));
    if (part.dy < 0) maxUp = Math.max(maxUp, -part.dy);
    if (part.dy > 0) maxDown = Math.max(maxDown, part.dy);
  });
  return { x: maxDx * r + atomR, up: maxUp * r + atomR, down: maxDown * r + atomR };
}

/* Profil du monticule de soluté : parabole centrée sur la coupelle, plus
   haute au centre, nulle sur les bords — hauteur disponible à l'abscisse x
   (en px, au-dessus de baseY). Partagé par les deux couches du pavage
   (buildDissPile()) pour qu'elles décrivent exactement la même silhouette. */
function dissMoundHeightAt(d, x) {
  const cx = d.x0 + d.w / 2;
  const halfW = d.w / 2;
  const moundH = d.h * 0.85;
  const dx = x - cx;
  const t = Math.max(0, 1 - (dx / halfW) * (dx / halfW));
  return moundH * t;
}

/* Une couche du pavage réseau, décalée de (shiftX, shiftY) par rapport à
   l'origine de la grille — factorisé pour être appelé deux fois par
   buildDissPile() avec un décalage d'un demi-pas, cf. plus bas. `margin`
   (cf. dissGrainMargins()) borde la grille pour que même l'atome le plus
   excentré d'un groupement ne déborde jamais des parois/du fond réels de la
   coupelle : la rangée la plus basse est calée pour que le bas de ses
   atomes soit tangent au fond (baseY), pas simplement son ancre. */
function dissBuildLatticeLayer(d, spacingX, spacingY, shiftX, shiftY, margin) {
  const layer = [];
  const yBottom = dissState.baseY - margin.down;
  const yTop = d.y0 + margin.up;
  let row = 0;
  for (let y = yBottom - shiftY; y >= yTop; y -= spacingY, row++) {
    const rowLift = dissState.baseY - y;
    const offsetX = (row % 2) * (spacingX / 2) + shiftX;
    for (let x = d.x0 + margin.x + offsetX; x <= d.x0 + d.w - margin.x; x += spacingX) {
      if (rowLift > dissMoundHeightAt(d, x)) continue;   // hors du profil du monticule à cette abscisse
      layer.push({ x, y });
    }
  }
  return layer;
}

/* Construit le pavage en DEUX couches superposées du même motif — une couche
   « arrière » décalée d'un demi-pas (en x comme en y) par rapport à la
   couche « avant » — plutôt qu'une seule couche + un fond de couleur plate.
   Les groupements de la couche arrière tombent exactement dans les
   interstices laissés par la couche avant (et réciproquement), comblant les
   trous avec le MÊME motif d'ions plutôt qu'avec un aplat qui jurerait avec
   le reste. La couche avant est redessinée par-dessus (cf. drawDissDish) :
   c'est elle qui porte le motif « propre » et lisible, la couche arrière ne
   sert qu'à boucher visuellement les espaces entre ses groupements. */
function buildDissPile() {
  const solute = SOLUTES.find(s => s.id === dissState.soluteId);
  const d = dissState.dish;
  /* Espacement calé sur l'empan du groupement + DISS_TOUCH_GAP, de sorte que
     deux groupements voisins se touchent/chevauchent légèrement. Pour NaCl
     (grain linéaire à 2 atomes), cela fait coïncider exactement le contact
     Cl⁻-Na⁺ inter-groupements avec le contact Na⁺-Cl⁻ intra-groupement : le
     pavage devient une chaîne alternée continue Na-Cl-Na-Cl, qui évoque la
     structure réelle du réseau NaCl. */
  const spacingX = (dissGrainSpan(solute, 'x') + DISS_TOUCH_GAP) * DISS_ION_R;
  const spacingY = (dissGrainSpan(solute, 'y') + DISS_TOUCH_GAP) * DISS_ION_R;
  const margin = dissGrainMargins(solute);
  d.pileBack = dissBuildLatticeLayer(d, spacingX, spacingY, spacingX / 2, spacingY / 2, margin);
  d.pileFront = dissBuildLatticeLayer(d, spacingX, spacingY, 0, 0, margin);
}

/* Test d'appartenance grossier (boîte englobante) à la silhouette évasée de
   la coupelle — suffisant pour une zone de clic schématique. */
function dissPointInDish(x, y) {
  const d = dissState.dish;
  return x >= d.x0 - d.flare && x <= d.x0 + d.w + d.flare && y >= d.y0 && y <= dissState.baseY;
}

/* Niveau d'eau : interpolation linéaire du volume choisi entre les bornes
   visuelles fixes DISS_FILL_MIN/MAX — le récipient ne change jamais de
   taille, seul son remplissage varie. Appelée au resize et à chaque
   changement du slider volume (indépendamment d'un redimensionnement). */
function computeDissGlassGeometry() {
  const g = dissState.glass;
  const t = clamp01((dissState.volumeML - DISS_VOL_MIN) / (DISS_VOL_MAX - DISS_VOL_MIN));
  const fillFrac = lerp(DISS_FILL_MIN, DISS_FILL_MAX, t);
  g.waterTopY = g.y0 + g.h * (1 - fillFrac);
  /* Le fond du verre est son propre fond dessiné (baseY, légèrement
     au-dessus de la table — cf. DISS_BASE_LIFT), pas la ligne de table
     elle-même : l'eau doit visuellement toucher ce fond, seule la zone de
     nage des ions (dissWaterZone) retire en plus leur propre rayon. */
  g.bottomY = dissState.baseY;
}

/* Zone de nage des ions dissous (intérieur du verre, sous la ligne d'eau),
   bornée pour que les sphères ne débordent jamais des parois. */
function dissWaterZone() {
  const g = dissState.glass;
  const r = DISS_ION_R;
  return {
    xMin: g.x0 + g.wallInset + r, xMax: g.x0 + g.w - g.wallInset - r,
    yMin: g.waterTopY + r,        yMax: g.bottomY - r,
  };
}

/* ══════════════════════════════════════════════════
   Interaction : clic pour saisir un groupement, glisser jusqu'au verre
══════════════════════════════════════════════════ */
function dissToStageXY(e) {
  const canvas = document.getElementById('diss-canvas');
  const scale = canvas.clientWidth / DISS_STAGE_W;
  return { x: e.offsetX / scale, y: e.offsetY / scale };
}

/* Le tas est un réservoir de fait infini (cf. buildDissPile()) : cliquer
   n'importe où dedans prélève un nouveau groupement (formule du soluté
   courant), sans retirer de sphère précise du tas affiché. */
function onDissPointerDown(e) {
  const { x, y } = dissToStageXY(e);
  if (!dissPointInDish(x, y)) return;
  const solute = SOLUTES.find(s => s.id === dissState.soluteId);
  dissState.heldGrain = { x, y, solute };
  const canvas = document.getElementById('diss-canvas');
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = 'grabbing';
  dissDrawScene();
}

function onDissPointerMove(e) {
  const hg = dissState.heldGrain;
  if (!hg) return;
  const { x, y } = dissToStageXY(e);
  hg.x = x; hg.y = y;
  dissDrawScene();
}

/* Simplification assumée : tout relâchement à l'intérieur du contour du
   verre est traité comme un contact immédiat avec l'eau (pas d'animation de
   chute) — la position de dépôt est simplement bridée dans la zone d'eau
   courante (dissWaterZone()). En dehors du verre, le groupement est
   simplement abandonné (annulation) — le tas de la coupelle, réservoir de
   fait infini, n'a jamais été modifié par le prélèvement. */
function onDissPointerUp(e) {
  const hg = dissState.heldGrain;
  if (!hg) return;
  const g = dissState.glass;
  const inGlass = hg.x >= g.x0 && hg.x <= g.x0 + g.w && hg.y >= g.y0 && hg.y <= g.y0 + g.h;
  if (inGlass) dissDropGrainInWater(hg);
  dissState.heldGrain = null;
  document.getElementById('diss-canvas').style.cursor = 'pointer';
  dissDrawScene();
}

function initDissInteraction() {
  const canvas = document.getElementById('diss-canvas');
  canvas.addEventListener('pointerdown', onDissPointerDown);
  canvas.addEventListener('pointermove', onDissPointerMove);
  canvas.addEventListener('pointerup', onDissPointerUp);
  canvas.addEventListener('pointercancel', onDissPointerUp);
}

/* ══════════════════════════════════════════════════
   Séparation au contact de l'eau + mouvement brownien
══════════════════════════════════════════════════ */
function dissMakeFreeSpecies(esp, especeIdx, x, y) {
  const ang = Math.random() * 2 * Math.PI;
  return {
    x: x + Math.cos(ang) * 6, y: y + Math.sin(ang) * 6,
    vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
    especeIdx, el: esp.el, fill: esp.fill, border: esp.border,
  };
}

function dissDropGrainInWater(hg) {
  dissState.nApporte++;
  const solute = hg.solute;
  const zone = dissWaterZone();
  const x = Math.min(Math.max(hg.x, zone.xMin), zone.xMax);
  const y = Math.min(Math.max(hg.y, zone.yMin), zone.yMax);
  if (solute.dissocie) {
    /* Solide ionique : chaque espèce se sépare, dupliquée selon son
       coefficient stœchiométrique (2 Cl⁻ par groupement MgCl₂). */
    solute.especes.forEach((esp, especeIdx) => {
      for (let k = 0; k < esp.coeff; k++) {
        dissState.freeSpecies.push(dissMakeFreeSpecies(esp, especeIdx, x, y));
      }
    });
  } else {
    /* Solide moléculaire (I₂) : aucune séparation, une seule entité. */
    dissState.freeSpecies.push(dissMakeFreeSpecies(solute.especes[0], 0, x, y));
  }
  renderDissTable();
}

/* Approximation d'une loi normale centrée réduite (somme de 3 uniformes),
   même technique que _especesRandn() dans titrage/js/ui.js. */
function dissRandn() {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 1.4;
}

/* Mouvement brownien + rebond élastique sur les parois du verre — adapté de
   _especesBrownienStep() (titrage/js/ui.js). `dt` en secondes. */
function dissBrownianStep(s, dt) {
  const zone = dissWaterZone();
  s.vx += dissRandn() * DISS_V_BROWN * dt * 8;
  s.vy += dissRandn() * DISS_V_BROWN * dt * 8;
  s.vx *= DISS_DAMPING; s.vy *= DISS_DAMPING;
  s.x += s.vx * dt * 5; s.y += s.vy * dt * 5;
  if (s.x < zone.xMin) { s.x = zone.xMin; s.vx = Math.abs(s.vx) * 0.6; }
  if (s.x > zone.xMax) { s.x = zone.xMax; s.vx = -Math.abs(s.vx) * 0.6; }
  if (s.y < zone.yMin) { s.y = zone.yMin; s.vy = Math.abs(s.vy) * 0.6; }
  if (s.y > zone.yMax) { s.y = zone.yMax; s.vy = -Math.abs(s.vy) * 0.6; }
}

/* ══════════════════════════════════════════════════
   Rendu
══════════════════════════════════════════════════ */
function dissLabelFont() {
  return `bold ${Math.round(DISS_STAGE_H * 0.032)}px 'Segoe UI', Arial, sans-serif`;
}

/* Légende inscrite dans le plan de table, sous le récipient concerné (plutôt
   qu'au-dessus, pour ne pas empiéter sur l'espace utile de la scène). Couleur
   claire pour rester lisible sur le fond bois. */
function dissDrawLabel(ctx, text, cx, tableY) {
  ctx.save();
  ctx.fillStyle = '#fff8ec';
  ctx.font = dissLabelFont();
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, cx, tableY + 20);
  ctx.restore();
}

/* `rot` (radians, optionnel) fait tourner le gabarit du groupement autour de
   (gx, gy) — utilisé pour varier l'orientation des groupements du tas
   (buildDissPile()) sans dupliquer la logique de dessin. */
function dissDrawGrain(ctx, gx, gy, solute, r, rot) {
  const angle = rot || 0;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  solute.grain.forEach(part => {
    const esp = solute.especes.find(e => e.el === part.el) || solute.especes[0];
    const lx = part.dx * r, ly = part.dy * r;
    const rx = gx + lx * cos - ly * sin;
    const ry = gy + lx * sin + ly * cos;
    drawSphere(ctx, rx, ry, r * 0.85, esp.fill, esp.border, null, null);
  });
}

/* Fond neutre (mur) au-dessus de la table — donne une scène « posée », pas
   un cristal/verre flottant sur fond vide. */
function drawDissBackdrop(ctx) {
  ctx.fillStyle = '#eef2f6';
  ctx.fillRect(0, 0, DISS_STAGE_W, dissState.tableY);
}

/* Plan de table sur lequel reposent la coupelle et le verre, tous deux vus
   de profil. */
function drawDissTable(ctx) {
  const y = dissState.tableY;
  ctx.save();
  const grad = ctx.createLinearGradient(0, y, 0, DISS_STAGE_H);
  grad.addColorStop(0, '#c9a06a');
  grad.addColorStop(1, '#a97d45');
  ctx.fillStyle = grad;
  ctx.fillRect(0, y, DISS_STAGE_W, DISS_STAGE_H - y);
  ctx.strokeStyle = '#8a6236';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(DISS_STAGE_W, y);
  ctx.stroke();
  ctx.restore();
}

/* Coupelle vue de profil, posée sur la table : silhouette peu profonde et
   évasée (parois + fond, ouverture non fermée en haut), remplie par le
   pavage de groupements solides — deux couches du même motif (cf.
   buildDissPile()), la couche arrière comblant les interstices de la couche
   avant, dessinées dans cet ordre pour que le motif propre reste au premier
   plan. */
function drawDissDish(ctx) {
  const d = dissState.dish;
  const baseY = dissState.baseY;

  ctx.save();
  ctx.strokeStyle = '#8a9aaa';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(d.x0 - d.flare, d.y0);
  ctx.lineTo(d.x0, baseY);
  ctx.lineTo(d.x0 + d.w, baseY);
  ctx.lineTo(d.x0 + d.w + d.flare, d.y0);
  ctx.stroke();
  ctx.restore();

  dissDrawLabel(ctx, 'Coupelle — soluté solide', d.x0 + d.w / 2, dissState.tableY);

  const solute = SOLUTES.find(s => s.id === dissState.soluteId);
  d.pileBack.forEach(p => dissDrawGrain(ctx, p.x, p.y, solute, DISS_ION_R));
  d.pileFront.forEach(p => dissDrawGrain(ctx, p.x, p.y, solute, DISS_ION_R));
}

/* Verre vu de profil, posé sur la même table que la coupelle — hauteur
   proportionnée à la scène (ne remplit pas toute la fenêtre). */
function drawDissGlass(ctx) {
  const g = dissState.glass;
  const baseY = dissState.baseY;

  ctx.save();
  const grad = ctx.createLinearGradient(0, g.waterTopY, 0, g.bottomY);
  grad.addColorStop(0, '#7dd3f7'); grad.addColorStop(1, '#29b6e8');
  ctx.fillStyle = grad;
  ctx.fillRect(g.x0, g.waterTopY, g.w, Math.max(0, g.bottomY - g.waterTopY));
  ctx.strokeStyle = '#1a2744'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(g.x0, g.y0);
  ctx.lineTo(g.x0, baseY);
  ctx.lineTo(g.x0 + g.w, baseY);
  ctx.lineTo(g.x0 + g.w, g.y0);
  ctx.stroke();
  ctx.restore();

  dissDrawLabel(ctx, 'Verre — eau', g.x0 + g.w / 2, dissState.tableY);
}

function drawDissFreeSpecies(ctx) {
  dissState.freeSpecies.forEach(s => drawSphere(ctx, s.x, s.y, DISS_ION_R, s.fill, s.border, null, null));
}

/* Groupement saisi dessiné ~35% plus grand que dans le tas, pour se détacher
   visuellement du curseur natif du système qui le recouvre partiellement
   (centré exactement sur le point cliqué). */
const DISS_HELD_SCALE = 1.35;

function drawDissHeldGrain(ctx) {
  const hg = dissState.heldGrain;
  dissDrawGrain(ctx, hg.x, hg.y, hg.solute, DISS_ION_R * DISS_HELD_SCALE);
}

function dissDrawScene() {
  const canvas = document.getElementById('diss-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, DISS_STAGE_W, DISS_STAGE_H);
  drawDissBackdrop(ctx);
  drawDissTable(ctx);
  drawDissDish(ctx);
  drawDissGlass(ctx);
  drawDissFreeSpecies(ctx);
  if (dissState.heldGrain) drawDissHeldGrain(ctx);
}

/* ══════════════════════════════════════════════════
   Redimensionnement — même principe « cover » + devicePixelRatio que
   resize() (ui.js) pour #anim-canvas, appliqué à #diss-canvas.
══════════════════════════════════════════════════ */
function dissResize() {
  const canvas = document.getElementById('diss-canvas');
  const wrap = canvas.parentElement;
  const wrapW = wrap.clientWidth || DISS_STAGE_W, wrapH = wrap.clientHeight || DISS_STAGE_H;
  const scale = Math.max(wrapW / DISS_STAGE_W, wrapH / DISS_STAGE_H);
  const cssW = DISS_STAGE_W * scale, cssH = DISS_STAGE_H * scale;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.getContext('2d').setTransform(cssW * dpr / DISS_STAGE_W, 0, 0, cssH * dpr / DISS_STAGE_H, 0, 0);
  computeDissSceneLayout();
  computeDissGlassGeometry();
  dissDrawScene();
}

/* ══════════════════════════════════════════════════
   Tableau d'avancement — État initial (x = 0) / État final (dissolution
   totale, x = xmax = n apporté), colonnes générées depuis SOLUTES[i].especes.
   Le mode mol·L⁻¹ convertit TOUTES les cellules, y compris la colonne
   solide (interprétée alors comme la concentration apportée c = n/V) :
   c'est précisément la comparaison recherchée avec la concentration
   effective de chaque ion.
══════════════════════════════════════════════════ */
function dissTh(text, className) {
  const th = document.createElement('th');
  if (className) th.className = className;
  th.textContent = text;
  return th;
}
function dissTd(text, className) {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = text;
  return td;
}

function dissFormatQty(nMol) {
  if (dissState.unit === 'mol') return nMol + ' mol';
  const c = nMol / (dissState.volumeML / 1000);
  return c.toFixed(2).replace('.', ',') + ' mol·L⁻¹';
}

function renderDissTable() {
  const solute = SOLUTES.find(s => s.id === dissState.soluteId);
  document.getElementById('diss-equation').textContent = dissEquationText(solute);

  const thead = document.getElementById('diss-thead-row');
  const tbInit = document.getElementById('diss-tbody-initial');
  const tbFinal = document.getElementById('diss-tbody-final');
  thead.innerHTML = ''; tbInit.innerHTML = ''; tbFinal.innerHTML = '';

  thead.appendChild(dissTh('État du système', 'diss-label'));
  thead.appendChild(dissTh(solute.formule + ' (s)', 'diss-col-solute sep-rp'));
  solute.especes.forEach(esp => thead.appendChild(dissTh(esp.formule + ' (aq)', 'diss-col-ion')));

  tbInit.appendChild(dissTd('État initial (x = 0)', 'diss-label'));
  tbInit.appendChild(dissTd(dissFormatQty(dissState.nApporte), 'diss-td-solute sep-rp'));
  solute.especes.forEach(() => tbInit.appendChild(dissTd(dissFormatQty(0), 'diss-td-ion')));

  tbFinal.appendChild(dissTd('État final (dissolution totale)', 'diss-label'));
  tbFinal.appendChild(dissTd(dissFormatQty(0), 'diss-td-solute sep-rp'));
  solute.especes.forEach(esp => tbFinal.appendChild(dissTd(dissFormatQty(dissState.nApporte * esp.coeff), 'diss-td-ion')));
}

/* ══════════════════════════════════════════════════
   Contrôles exposés au panneau de droite (index.html)
══════════════════════════════════════════════════ */
function onDissSoluteChange(id) {
  dissState.soluteId = id;
  dissReset();
}

function dissFormatVolumeLabel(mL) {
  return (mL / 1000).toFixed(2).replace('.', ',');
}

function onDissVolumeInput(v) {
  dissState.volumeML = Number(v) || DISS_VOL_MIN;
  const lbl = document.getElementById('diss-lbl-vol');
  if (lbl) lbl.textContent = dissFormatVolumeLabel(dissState.volumeML);
  computeDissGlassGeometry();
  renderDissTable();
  dissDrawScene();
}

function setDissUnit(u) {
  dissState.unit = u;
  document.getElementById('diss-unit-btn-mol').classList.toggle('active', u === 'mol');
  document.getElementById('diss-unit-btn-molL').classList.toggle('active', u === 'molL');
  renderDissTable();
}

function dissReset() {
  dissState.freeSpecies = [];
  dissState.nApporte = 0;
  dissState.heldGrain = null;
  buildDissPile();
  renderDissTable();
  dissDrawScene();
}
