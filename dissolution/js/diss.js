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
  dish: { pile: [], x0: 0, y0: 0, w: 0, h: 0, flare: 0 },
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

/* Rayon des petits grains formant le tas de soluté solide dans la coupelle —
   VOLONTAIREMENT DISTINCT de DISS_ION_R (rayon des ions dissous dans le
   verre et du groupement saisi pendant le clic-glisser, tous deux inchangés)
   : le tas doit évoquer un tas de sel/de sable fait de grains minuscules,
   pas un empilement de sphères de la même taille que les ions individuels
   qu'on manipule. */
const DISS_PILE_GRAIN_R = 3.2;

/* Épaisseur du trait de la coupelle (cf. drawDissDish()) — extraite ici pour
   être réutilisée par buildDissPile() : la marge de sécurité du tas doit
   connaître cette épaisseur pour garantir qu'aucun grain ne chevauche le
   trait, pas seulement qu'il reste dans le rectangle intérieur. */
const DISS_DISH_WALL_LW = 4;

/* Tolérance de recouvrement volontaire, en px, entre le bord d'un grain et
   le trait de la coupelle (cf. son usage dans buildDissPile()) : au lieu de
   s'arrêter strictement à l'intérieur du trait, chaque grain peut mordre
   dessus de ce tout petit débord, pour qu'il ait l'air de reposer contre la
   paroi plutôt que de laisser un liseré vide bien net avant le trait. */
const DISS_PILE_BORDER_OVERLAP = 0.1;

/* Pas de la grille de génération du tas (cf. buildDissPile()) — NETTEMENT
   inférieur au diamètre moyen d'un grain (2×DISS_PILE_GRAIN_R), de sorte que
   deux grains voisins se chevauchent déjà franchement sur la grille de base,
   AVANT même dispersion aléatoire. Cette marge de chevauchement est ce qui
   garantit l'absence de trou une fois le jitter appliqué (cf. buildDissPile) :
   un pas trop proche du diamètre (chevauchement quasi nul sur la grille) ne
   laisse aucune marge, et le jitter suffit alors à écarter des grains voisins
   au point de laisser voir le fond de la coupelle entre eux. */
const DISS_PILE_SPACING = DISS_PILE_GRAIN_R * 1.15;

/* Profil du monticule de soluté : parabole centrée sur la coupelle, plus
   haute au centre, nulle sur les bords — hauteur disponible à l'abscisse x
   (en px, au-dessus de baseY). */
function dissMoundHeightAt(d, x) {
  const cx = d.x0 + d.w / 2;
  const halfW = d.w / 2;
  const moundH = d.h * 0.85;
  const dx = x - cx;
  const t = Math.max(0, 1 - (dx / halfW) * (dx / halfW));
  return moundH * t;
}

/* Choisit l'espèce du prochain grain posé le long du balayage du tas
   (buildDissPile(), ligne par ligne) en répartissant les tirages de façon
   ÉQUILIBRÉE DANS L'ESPACE, plutôt que par un tirage indépendant à chaque
   grain : un tirage aléatoire pur, même pondéré correctement en moyenne sur
   tout le tas, laisse par pur hasard des paquets locaux d'une même espèce
   assez grands pour être perçus comme des « zones » — artefact classique du
   bruit blanc (le tirage indépendant précédent en souffrait).

   Ici, chaque espèce accumule à chaque grain un « crédit » proportionnel à
   son coefficient stœchiométrique (credit[i] += coeff[i]/total) ; l'espèce
   choisie est celle au crédit le plus élevé (± une petite perturbation
   aléatoire, pour ne pas figer un motif parfaitement mécanique), puis son
   crédit est décrémenté d'une unité. Ce mécanisme (apparenté à l'algorithme
   de tracé de segment de Bresenham, aussi utilisé en ordonnancement réseau
   pondéré) garantit que, sur n'importe quelle fenêtre de grains consécutifs,
   la proportion de chaque espèce colle de très près à son coefficient — d'où
   une répartition homogène partout dans le tas plutôt que des plaques. */
function dissPickBalancedEspece(especes, credit, totalCoeff) {
  let bestIdx = 0, bestScore = -Infinity;
  especes.forEach((esp, i) => {
    credit[i] += esp.coeff / totalCoeff;
    const score = credit[i] + (Math.random() - 0.5) * 0.35;
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  });
  credit[bestIdx] -= 1;
  return especes[bestIdx];
}

/* Construit le tas comme une multitude de petits grains colorés selon
   l'espèce choisie de façon équilibrée (dissPickBalancedEspece()), plutôt
   qu'un pavage de groupements formulaires assemblés bout à bout : plus
   proche visuellement d'un tas de sel/de sable réel, où la stœchiométrie se
   lit dans les proportions de couleurs — homogènes partout, pas juste en
   moyenne — plutôt que dans un motif géométrique répété.

   Grille resserrée (DISS_PILE_SPACING, chevauchement franc par défaut) +
   léger décalage aléatoire par grain (jitter, petit devant ce chevauchement
   pour ne jamais l'annuler) + rayon légèrement variable : le chevauchement
   de base assure qu'aucune zone du monticule ne reste vide (pas de trou),
   le jitter casse juste l'alignement trop régulier pour donner un aspect
   naturel de grains versés en vrac. */
function buildDissPile() {
  const solute = SOLUTES.find(s => s.id === dissState.soluteId);
  const d = dissState.dish;
  const r = DISS_PILE_GRAIN_R;
  const spacing = DISS_PILE_SPACING;
  const jitter = spacing * 0.3;

  /* Distance à respecter entre le CENTRE d'un grain et la ligne géométrique
     du trait de la coupelle, pour que le BORD de ce grain (son propre rayon,
     pas un rayon "pire cas" commun à tous) s'arrête tout juste sur cette
     ligne — avec une tolérance volontaire de DISS_PILE_BORDER_OVERLAP : le
     bord du grain peut légèrement mordre sur le trait plutôt que de rester
     strictement à l'intérieur, pour que le tas ait l'air de vraiment
     reposer contre la paroi plutôt que de s'arrêter net avec un liseré vide.
     Appliquée à chaque grain individuellement (une fois son propre rayon
     `gr` tiré) plutôt qu'à toute la grille avec un rayon maximal commun :
     une marge commune calée sur le pire cas laissait les grains de taille
     moyenne (la majorité) flotter loin du bord réel. */
  const wallClear = DISS_DISH_WALL_LW / 2 - DISS_PILE_BORDER_OVERLAP;
  /* Marge de génération de la grille elle-même : juste assez pour couvrir le
     cas typique (rayon moyen), le clamp par grain ci-dessous rattrape les
     grains plus gros que la moyenne sans qu'il soit nécessaire de reculer
     toute la grille pour eux. */
  const gridMargin = r + wallClear;

  const totalCoeff = solute.especes.reduce((s, e) => s + e.coeff, 0);
  const credit = solute.especes.map(() => 0);   // état de dissPickBalancedEspece(), maintenu tout au long du balayage

  const pile = [];
  const yBottom = dissState.baseY - gridMargin;
  const yTop = d.y0 + gridMargin;
  let row = 0;
  for (let y = yBottom; y >= yTop; y -= spacing, row++) {
    const offsetX = (row % 2) * (spacing / 2);
    const rowLift = dissState.baseY - y;
    for (let x = d.x0 + gridMargin + offsetX; x <= d.x0 + d.w - gridMargin; x += spacing) {
      if (rowLift > dissMoundHeightAt(d, x)) continue;   // hors du profil du monticule à cette abscisse
      const esp = dissPickBalancedEspece(solute.especes, credit, totalCoeff);
      const gr = r * (0.75 + Math.random() * 0.5);
      let gx = x + (Math.random() - 0.5) * jitter;
      let gy = y + (Math.random() - 0.5) * jitter;
      /* Clamp final : ramène le CENTRE du grain à l'intérieur de la zone où
         son propre bord (gr, son rayon réel) reste à wallClear du trait —
         nécessaire aussi bien pour le jitter (qui peut le pousser vers le
         bord) que pour les grains tirés plus gros que la moyenne. */
      gx = Math.min(Math.max(gx, d.x0 + gr + wallClear), d.x0 + d.w - gr - wallClear);
      gy = Math.min(Math.max(gy, d.y0 + gr + wallClear), dissState.baseY - gr - wallClear);
      pile.push({ x: gx, y: gy, r: gr, fill: esp.fill, border: esp.border });
    }
  }
  d.pile = pile;
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

/* Atomes du gabarit `grain`, triés par coefficient stœchiométrique
   DÉCROISSANT — l'espèce la plus rare (ex. Mg²⁺, coeff 1, face à 2 Cl⁻) est
   ainsi toujours dessinée EN DERNIER, par-dessus les espèces plus
   nombreuses, aussi bien au sein d'un même groupement qu'entre groupements
   voisins du pavage (cf. dissDrawPile()) : elle ne se retrouve jamais
   noyée/masquée sous l'espèce majoritaire, ce qui rendait la stœchiométrie
   difficile à percevoir. */
function dissOrderedGrainParts(solute) {
  return [...solute.grain].sort((a, b) => {
    const ca = (solute.especes.find(e => e.el === a.el) || {}).coeff || 1;
    const cb = (solute.especes.find(e => e.el === b.el) || {}).coeff || 1;
    return cb - ca;
  });
}

/* `rot` (radians, optionnel) fait tourner le gabarit du groupement autour de
   (gx, gy) — utilisé pour varier l'orientation des groupements du tas
   (buildDissPile()) sans dupliquer la logique de dessin. */
function dissDrawGrain(ctx, gx, gy, solute, r, rot) {
  const angle = rot || 0;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  dissOrderedGrainParts(solute).forEach(part => {
    const esp = solute.especes.find(e => e.el === part.el) || solute.especes[0];
    const lx = part.dx * r, ly = part.dy * r;
    const rx = gx + lx * cos - ly * sin;
    const ry = gy + lx * sin + ly * cos;
    drawSphere(ctx, rx, ry, r * 0.85, esp.fill, esp.border, null, null);
  });
}

/* Dessine le tas grain par grain (cf. buildDissPile()) : chaque grain porte
   déjà sa couleur (espèce tirée au sort à la construction), donc un simple
   passage suffit — pas de tri par espèce nécessaire, chaque grain est une
   sphère indépendante plutôt qu'un groupement formulaire à composer. */
function dissDrawPile(ctx, d) {
  d.pile.forEach(g => drawSphere(ctx, g.x, g.y, g.r, g.fill, g.border, null, null));
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
   évasée (parois + fond, ouverture non fermée en haut), remplie par un tas
   de petits grains colorés (cf. buildDissPile()) évoquant du sel/du sable
   plutôt qu'un empilement de groupements formulaires. */
function drawDissDish(ctx) {
  const d = dissState.dish;
  const baseY = dissState.baseY;

  ctx.save();
  ctx.strokeStyle = '#8a9aaa';
  ctx.lineWidth = DISS_DISH_WALL_LW;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(d.x0 - d.flare, d.y0);
  ctx.lineTo(d.x0, baseY);
  ctx.lineTo(d.x0 + d.w, baseY);
  ctx.lineTo(d.x0 + d.w + d.flare, d.y0);
  ctx.stroke();
  ctx.restore();

  dissDrawLabel(ctx, 'Coupelle — soluté solide', d.x0 + d.w / 2, dissState.tableY);

  dissDrawPile(ctx, d);
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
