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

/* Mouvement brownien — inspiré d'ESPECES.V_BROWN/DAMPING dans
   titrage/js/ui.js (dt attendu en secondes, comme là-bas), mais les deux
   constantes s'en écartent nettement :
   - DISS_V_BROWN relevé bien au-delà de sa valeur d'origine (10.0), où
     l'écart type du déplacement cumulé après une seconde n'était que
     d'environ 1px, invisible face à la largeur du verre (~200px) ;
   - DISS_DAMPING relevé aussi (0.85 → 0.95) : la vitesse persiste alors sur
     un temps de corrélation ~3× plus long (~1/(1-damping) images), donc des
     changements de direction bien moins fréquents pour une dispersion
     globale comparable — un damping plus faible aurait exigé un bruit plus
     fort à chaque image pour la même dispersion, d'où des à-coups de
     direction visibles à chaque image. */
const DISS_V_BROWN = 10.0, DISS_DAMPING = 0.95;

/* Décollement visuel des récipients par rapport à la ligne de table : leur
   propre fond est dessiné DISS_BASE_LIFT px au-dessus de tableY, pour qu'ils
   aient l'air posés dessus plutôt qu'encastrés dedans (sinon leur trait de
   fond se superpose exactement au trait de la table). */
const DISS_BASE_LIFT = 2;

/* ══════════════════════════════════════════════════
   État
══════════════════════════════════════════════════ */
const dissState = {
  soluteId: 'glucose',
  volumeML: 1000,
  unit: 'mol',                 // 'mol' | 'molL'
  nApporte: 0,                 // nb de groupements largués dans l'eau depuis le dernier reset (mol)
  tableY: 0,                   // ligne de table sur laquelle reposent la coupelle et le verre (vue de profil)
  baseY: 0,                    // fond réel des récipients (légèrement au-dessus de tableY, cf. DISS_BASE_LIFT)
  dish: { pile: [], x0: 0, y0: 0, w: 0, h: 0, flare: 0 },
  glass: { x0: 0, y0: 0, w: 0, h: 0, wallInset: 10, waterTopY: 0, bottomY: 0 },
  heldGrain: null,              // { x, y, vx, vy, solute, _t } pendant le clic-glisser
  flying: [],                   // groupements lâchés/lancés, en vol balistique : { x, y, vx, vy, solute }
  restingGrains: [],            // groupements immobilisés sur la table : { x, y, solute }
  freeSpecies: [],              // ions/molécules dispersés dans l'eau : { x, y, vx, vy, especeIdx, el, fill, border }
};

/* Nombre max de groupements tolérés sur la table avant blocage du
   prélèvement dans la coupelle (cf. dissUpdateTableFullState()). */
const DISS_TABLE_LIMIT = 10;

/* Accélération de la pesanteur appliquée aux groupements lâchés/lancés
   (dissStepPhysics()), en px/s² — ordre de grandeur choisi pour une chute
   perceptible mais pas instantanée à l'échelle de la scène (DISS_STAGE_H). */
const DISS_GRAVITY = 1500;

/* Taille des groupements en vol ou posés sur la table — légèrement plus
   grande que DISS_ION_R (rayon des ions dissous) pour rester bien visible,
   mais nettement moins que DISS_HELD_SCALE (le groupement saisi, encore
   agrandi pour se détacher du curseur). */
const DISS_LOOSE_SCALE = 1.05;

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

/* Abscisse de la paroi (gauche ou droite) de la coupelle À LA HAUTEUR y —
   la coupelle est évasée (silhouette en trapèze : plus large au rebord y0,
   plus étroite au fond baseY, cf. drawDissDish()), donc contrairement au
   verre (parois verticales), une seule paire de constantes x0/x0+w ne
   décrit correctement la paroi qu'au fond ; ailleurs, et surtout vers les
   pointes évasées du rebord, elle serait bien trop à l'intérieur. Toute
   détection (clic, glisser, vol balistique) portant sur la coupelle doit
   donc interroger cette fonction plutôt qu'utiliser d.x0/d.x0+d.w tels
   quels. */
function dissDishWallX(y, isLeft) {
  const d = dissState.dish;
  const t = clamp01((y - d.y0) / (dissState.baseY - d.y0));
  return isLeft ? lerp(d.x0 - d.flare, d.x0, t) : lerp(d.x0 + d.w + d.flare, d.x0 + d.w, t);
}

/* Test d'appartenance à la silhouette évasée de la coupelle, fidèle au
   trapèze réellement dessiné (via dissDishWallX()) plutôt qu'à sa boîte
   englobante — une boîte englobante prise sur toute la hauteur (comme
   c'était le cas auparavant) surestime la zone valide près du fond (plus
   étroit que le rebord) et la reste correcte seulement au rebord. */
function dissPointInDish(x, y) {
  const d = dissState.dish;
  if (y < d.y0 || y > dissState.baseY) return false;
  return x >= dissDishWallX(y, true) && x <= dissDishWallX(y, false);
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
   Interaction : clic pour saisir un groupement, glisser puis lâcher/lancer —
   le relâchement transmet la vitesse du geste au groupement, qui devient
   ensuite un projectile balistique (cf. dissStepPhysics()) plutôt que de se
   téléporter instantanément dans l'eau.
══════════════════════════════════════════════════ */
function dissToStageXY(e) {
  const canvas = document.getElementById('diss-canvas');
  const scale = canvas.clientWidth / DISS_STAGE_W;
  return { x: e.offsetX / scale, y: e.offsetY / scale };
}

/* Bloque le franchissement d'UNE paroi verticale (à l'abscisse wallX) par un
   point qui se déplace de prevX à nx, DANS LES DEUX SENS : aussi bien de
   l'extérieur vers l'intérieur (ne pas entrer par le côté) que de
   l'intérieur vers l'extérieur (ne pas sortir par le côté — cas d'un
   groupement déjà tombé dans le verre, au-dessus de l'eau, qu'un lancer ou
   un grab ne doit pas pouvoir extraire en le poussant latéralement à travers
   la paroi). `insideIsRight` indique de quel côté de wallX se trouve
   l'intérieur du récipient (true pour la paroi gauche d'un caisson, false
   pour sa paroi droite). Renvoie {x, blocked} : xéventuellement bridé contre
   la paroi (à r de distance, du côté d'où le point venait), blocked=true si
   un rebond doit annuler la composante de vitesse correspondante. */
function dissBlockWallCrossing(prevX, nx, wallX, insideIsRight, r) {
  const wasInside = insideIsRight ? prevX > wallX : prevX < wallX;
  const nowInside = insideIsRight ? nx > wallX : nx < wallX;
  if (wasInside === nowInside) return { x: nx, blocked: false };
  const x = wasInside
    ? (insideIsRight ? wallX + r : wallX - r)   // reste à l'intérieur
    : (insideIsRight ? wallX - r : wallX + r);  // reste à l'extérieur
  return { x, blocked: true };
}

/* dissBlockWallCrossing() n'empêche qu'un FRANCHISSEMENT (passer d'un côté à
   l'autre) ; il n'impose aucune distance minimale tant qu'on reste du même
   côté. Un point qui APPROCHE la paroi sans jamais la franchir (glisser en
   rasant le trait, notamment près du rebord où la marge visuelle est fine)
   peut donc s'arrêter pile dessus, voire empiéter dessus — visuellement
   « enfoncé dans la bordure ». Cette fonction complète l'autre en imposant
   systématiquement un écart minimal r à l'abscisse wallX, quel que soit le
   côté courant (déterminé par le signe de x - wallX, pas par un paramètre
   « intérieur » : elle repousse toujours x du côté où il se trouve déjà). */
function dissClampWallClearance(x, wallX, r) {
  return x >= wallX ? Math.max(x, wallX + r) : Math.min(x, wallX - r);
}

/* Empêche tout franchissement des parois solides (coupelle, verre, table)
   par un point déplacé d'une position PRÉCÉDENTE connue (prevX, prevY) vers
   une position CANDIDATE (x, y) — utilisé pendant le glisser
   (onDissPointerMove) pour qu'un grab ne puisse pas traverser une paroi,
   même en un seul geste rapide, ni de l'extérieur vers l'intérieur ni de
   l'intérieur vers l'extérieur (cf. dissBlockWallCrossing()). Le rebord haut
   des récipients reste ouvert (aucune paroi n'existe au-dessus de leur y0) :
   on ne bride que les parois latérales (à hauteur de paroi) et le sol
   (table, ou fond du récipient si on est déjà au-dessus).

   Le test de hauteur porte sur tout le SEGMENT parcouru pendant ce pas
   (min/max de prevY et y), pas seulement sur la position d'arrivée y : un
   geste rapide qui, en un seul événement pointermove, ferait passer le point
   de l'intérieur (sous le rebord) à une position finale au-dessus du rebord
   franchirait sinon la paroi sans jamais être détecté (seule l'arrivée,
   « hors zone de paroi », étant testée) — c'est ce qui permettait de faire
   glisser une entité au travers d'une paroi du verre en la faisant sortir
   « par le haut » d'un seul geste.

   La coupelle, évasée, utilise sa largeur réelle à la hauteur courante
   (dissDishWallX()) plutôt que sa largeur au fond — sans quoi ses parois
   seraient détectées bien trop à l'intérieur près du rebord (les « pointes »
   évasées), cf. dissDishWallX(). Le verre, à parois verticales, garde une
   largeur constante. */
function dissClampAgainstSolids(prevX, prevY, x, y, r) {
  const baseY = dissState.baseY;
  const segTop = Math.min(prevY, y), segBot = Math.max(prevY, y);

  const g = dissState.glass;
  if (segBot >= g.y0 && segTop <= baseY) {
    x = dissBlockWallCrossing(prevX, x, g.x0, true, r).x;
    x = dissBlockWallCrossing(prevX, x, g.x0 + g.w, false, r).x;
    x = dissClampWallClearance(x, g.x0, r);
    x = dissClampWallClearance(x, g.x0 + g.w, r);
  }

  const d = dissState.dish;
  if (segBot >= d.y0 && segTop <= baseY) {
    const wallY = Math.min(Math.max(y, d.y0), baseY);
    const dishLeft = dissDishWallX(wallY, true), dishRight = dissDishWallX(wallY, false);
    x = dissBlockWallCrossing(prevX, x, dishLeft, true, r).x;
    x = dissBlockWallCrossing(prevX, x, dishRight, false, r).x;
    x = dissClampWallClearance(x, dishLeft, r);
    x = dissClampWallClearance(x, dishRight, r);
  }

  const inDish = dissPointInDish(x, y);
  const inGlass = x >= g.x0 && x <= g.x0 + g.w;
  const floorY = (inDish || inGlass) ? baseY : dissState.tableY;
  if (y > floorY - r) y = floorY - r;
  x = Math.min(Math.max(x, r), DISS_STAGE_W - r);   // bords gauche/droit de la scène
  return { x, y };
}

/* Marge de tolérance du clic pour reprendre un groupement posé sur la table
   (dissGrabRestingGrainAt()) — nettement plus généreuse que son rayon
   affiché (DISS_ION_R * DISS_LOOSE_SCALE) : viser pile le petit disque à
   l'écran est peu confortable, alors qu'aucune autre entité ne se dispute
   cette zone de clic (contrairement au tas de la coupelle, dense). */
const DISS_RESTING_GRAB_R = DISS_ION_R * DISS_LOOSE_SCALE * 2.5;

/* Reprend un groupement déjà posé sur la table le plus proche du clic, s'il
   est à portée (DISS_RESTING_GRAB_R) — le retire de dissState.restingGrains
   pour en faire à nouveau un heldGrain manipulable, exactement comme un
   prélèvement dans la coupelle. Renvoie null si aucun groupement posé n'est
   à portée du clic. */
function dissGrabRestingGrainAt(x, y) {
  const r = DISS_RESTING_GRAB_R;
  let bestIdx = -1, bestDist = r * r;
  dissState.restingGrains.forEach((rg, i) => {
    const dx = rg.x - x, dy = rg.y - y;
    const dist = dx * dx + dy * dy;
    if (dist <= bestDist) { bestDist = dist; bestIdx = i; }
  });
  if (bestIdx === -1) return null;
  return dissState.restingGrains.splice(bestIdx, 1)[0];
}

/* Le tas est un réservoir de fait infini (cf. buildDissPile()) : cliquer
   n'importe où dedans prélève un nouveau groupement (formule du soluté
   courant), sans retirer de sphère précise du tas affiché. Prélèvement
   bloqué si la table est déjà encombrée (cf. DISS_TABLE_LIMIT) — mais un
   groupement DÉJÀ posé sur la table reste toujours saisissable (repris via
   dissGrabRestingGrainAt()), sans quoi il n'y aurait aucun moyen de
   débarrasser la table une fois pleine. */
function onDissPointerDown(e) {
  const { x, y } = dissToStageXY(e);
  const canvas = document.getElementById('diss-canvas');

  const resting = dissGrabRestingGrainAt(x, y);
  if (resting) {
    dissState.heldGrain = { x, y, solute: resting.solute, rot: resting.rot, history: [{ x, y, t: performance.now() }] };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
    dissDrawScene();
    return;
  }

  if (!dissPointInDish(x, y)) return;
  if (dissState.restingGrains.length >= DISS_TABLE_LIMIT) return;
  const solute = SOLUTES.find(s => s.id === dissState.soluteId);
  dissState.heldGrain = { x, y, solute, rot: 0, history: [{ x, y, t: performance.now() }] };
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = 'grabbing';
  dissDrawScene();
}

/* Fenêtre de temps sur laquelle la vitesse du geste est moyennée pour estimer
   la vitesse de lancer au relâchement (cf. onDissPointerUp()) — moyenner sur
   une fenêtre courte plutôt que sur le seul dernier événement pointermove
   évite qu'un delta de temps ponctuellement minuscule ou énorme entre deux
   événements (jitter normal du pilote souris/tactile) ne produise une
   vitesse instantanée aberrante, tantôt beaucoup trop grande tantôt quasi
   nulle. */
const DISS_THROW_WINDOW_MS = 50;

/* Norme maximale (px/s) de la vitesse transmise au projectile au relâchement
   — au-delà, un geste anormalement violent (ou un pic de mesure résiduel)
   produirait un lancer disproportionné par rapport à l'échelle de la scène
   (DISS_STAGE_W/H) ; la direction du geste est conservée, seule sa norme est
   plafonnée. */
const DISS_THROW_SPEED_MAX = 800;

function onDissPointerMove(e) {
  const hg = dissState.heldGrain;
  if (!hg) return;
  const { x, y } = dissToStageXY(e);
  const r = DISS_ION_R * DISS_HELD_SCALE;
  const clamped = dissClampAgainstSolids(hg.x, hg.y, x, y, r);
  hg.x = clamped.x; hg.y = clamped.y;

  const now = performance.now();
  hg.history.push({ x: hg.x, y: hg.y, t: now });
  const cutoff = now - DISS_THROW_WINDOW_MS;
  while (hg.history.length > 1 && hg.history[0].t < cutoff) hg.history.shift();

  dissDrawScene();
}

/* Le relâchement ne décide plus lui-même du sort du groupement : il devient
   un projectile balistique (vitesse du geste + pesanteur), et c'est
   dissStepPhysics() qui, image par image, tranche entre chute sur la table
   (reste), retombée dans la coupelle (disparaît), contact avec l'eau par le
   dessus (dissolution) ou blocage par une paroi. La vitesse de lancer est le
   déplacement moyen sur DISS_THROW_WINDOW_MS (cf. onDissPointerMove()), pas
   le dernier delta instantané — un geste immobilisé juste avant de relâcher
   (fin de lancer volontairement freinée) donne alors bien une vitesse quasi
   nulle, et un grand geste rapide une vitesse représentative de l'ensemble
   du mouvement plutôt que du seul dernier micro-pas. */
/* Vitesse angulaire transmise au relâchement, purement cosmétique (aucun
   moment d'inertie réel n'est simulé) : proportionnelle à la composante
   horizontale du lancer, un peu comme un objet réel lancé tend à tourner
   d'autant plus qu'il est lancé "à plat" avec de l'élan — plafonnée pour
   qu'un lancer très rapide ne fasse pas tourbillonner le groupement de façon
   illisible. */
const DISS_ANGVEL_PER_VX = 0.012;
const DISS_ANGVEL_MAX = 14;

function onDissPointerUp(e) {
  const hg = dissState.heldGrain;
  if (!hg) return;
  const first = hg.history[0];
  const dt = Math.max((performance.now() - first.t) / 1000, 1 / 60);
  let vx = (hg.x - first.x) / dt;
  let vy = (hg.y - first.y) / dt;
  const speed = Math.hypot(vx, vy);
  if (speed > DISS_THROW_SPEED_MAX) {
    const k = DISS_THROW_SPEED_MAX / speed;
    vx *= k; vy *= k;
  }
  const angVel = Math.min(Math.max(vx * DISS_ANGVEL_PER_VX, -DISS_ANGVEL_MAX), DISS_ANGVEL_MAX);
  dissState.flying.push({ x: hg.x, y: hg.y, vx, vy, rot: hg.rot || 0, angVel, solute: hg.solute });
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
   Vol balistique des groupements lâchés/lancés (dissState.flying) — pesanteur
   + parois solides infranchissables (coupelle, verre, table), résolues
   chacune leur tour à chaque image :
   - le sommet de chaque paroi (rebord) est un petit rebord solide : un
     groupement qui tombe pile dessus y rebondit (rebond amorti + léger
     coup de coude pour l'écarter de l'aplomb exact de la paroi) au lieu de
     traverser tout droit vers l'intérieur ou l'extérieur (cf.
     dissRimBounce()) ;
   - une paroi latérale (à hauteur de paroi) bloque tout franchissement
     horizontal, aussi bien venu de l'extérieur que de l'intérieur (rebond
     amorti — cf. dissBlockWallCrossing()) ;
   - un groupement qui atteint l'intérieur de la coupelle par le dessus
     disparaît (retombé dans le réservoir de fait infini du tas) ;
   - un groupement qui atteint l'intérieur du verre ET touche l'eau par le
     dessus se dissout (dissDropGrainInWater) — toujours vrai en pratique
     puisque DISS_FILL_MIN garantit un niveau d'eau minimal ;
   - hors de tout récipient, atteindre la table immobilise le groupement
     définitivement (dissState.restingGrains).
══════════════════════════════════════════════════ */
/* Demi-largeur du rebord solide au sommet d'une paroi (cf. dissRimBounce()) —
   calée sur l'épaisseur du trait dessiné (DISS_DISH_WALL_LW pour la coupelle,
   4px pour le verre, cf. drawDissGlass()) : un impact tombant hors de cette
   bande mince est considéré comme franchement à côté de la paroi (pas un
   impact sur son sommet), pas comme un cas limite à départager. */
const DISS_RIM_HALF_W = 5;

/* Rebond sur le sommet plat d'UNE paroi (à l'abscisse wallX, hauteur rimY) :
   si le groupement vient de FRANCHIR rimY par le dessus (prevY en dessous du
   rebord, ny au-dessus après le pas de temps) alors que son abscisse nx est
   dans la bande étroite du rebord, il rebondit dessus plutôt que de
   continuer sa chute — sans quoi il traverserait le rebord tout droit,
   aussi bien vers l'intérieur du récipient que vers l'extérieur, selon
   l'abscisse exacte du point d'impact (une paroi n'a, sinon, aucune
   épaisseur dans ce modèle). Un petit coup de coude latéral, proportionnel à
   l'écart à l'aplomb de la paroi, l'écarte progressivement de l'équilibre
   instable pile sur le rebord. Renvoie la nouvelle valeur de ny (inchangée
   si aucun impact). */
function dissRimBounce(f, prevY, nx, ny, wallX, rimY, r) {
  const capHalf = DISS_RIM_HALF_W + r;
  if (Math.abs(nx - wallX) > capHalf) return ny;
  if (prevY >= rimY - r || ny < rimY - r) return ny;
  f.vy = -Math.abs(f.vy) * 0.35;
  f.vx += (nx - wallX) * 6;
  return rimY - r;
}

function dissStepPhysics(dt) {
  if (dissState.flying.length === 0) return;
  const r = DISS_ION_R * DISS_LOOSE_SCALE;
  const d = dissState.dish, g = dissState.glass, baseY = dissState.baseY;
  const keep = [];

  dissState.flying.forEach(f => {
    f.vy += DISS_GRAVITY * dt;
    const prevX = f.x, prevY = f.y;
    let nx = f.x + f.vx * dt;
    let ny = f.y + f.vy * dt;
    f.angVel = f.angVel || 0;
    f.rot = (f.rot || 0) + f.angVel * dt;

    /* Rebond sur le rebord (dissRimBounce()) : pour la coupelle évasée, le
       vrai sommet de chaque paroi est la POINTE du trapèze (dissDishWallX à
       y0 = d.x0 ± d.flare), pas la largeur du fond — utiliser cette dernière
       ferait rebondir bien trop tôt, avant même d'atteindre le rebord réel. */
    [
      { xMin: dissDishWallX(d.y0, true), xMax: dissDishWallX(d.y0, false), yTop: d.y0 },
      { xMin: g.x0, xMax: g.x0 + g.w, yTop: g.y0 },
    ].forEach(box => {
      const beforeNy = ny;
      ny = dissRimBounce(f, prevY, nx, ny, box.xMin, box.yTop, r);
      ny = dissRimBounce(f, prevY, nx, ny, box.xMax, box.yTop, r);
      if (ny !== beforeNy) f.angVel *= 0.6;
    });

    /* Parois latérales : la coupelle est évasée (largeur dépendant de la
       hauteur, cf. dissDishWallX()), le verre a des parois verticales
       (largeur constante). Le test de hauteur porte sur tout le segment
       parcouru ce pas-ci (prevY..ny), pas seulement sur ny — un lancer très
       rapide qui, en un seul pas, passerait du dessus du rebord au-dessous du
       fond franchirait sinon une paroi sans jamais être détecté. */
    if (Math.min(prevY, ny) <= baseY && Math.max(prevY, ny) >= g.y0) {
      const left = dissBlockWallCrossing(prevX, nx, g.x0, true, r);
      nx = left.x; if (left.blocked) { f.vx *= -0.3; f.angVel *= -0.5; }
      const right = dissBlockWallCrossing(prevX, nx, g.x0 + g.w, false, r);
      nx = right.x; if (right.blocked) { f.vx *= -0.3; f.angVel *= -0.5; }
      nx = dissClampWallClearance(nx, g.x0, r);
      nx = dissClampWallClearance(nx, g.x0 + g.w, r);
    }
    if (Math.min(prevY, ny) <= baseY && Math.max(prevY, ny) >= d.y0) {
      const wallY = Math.min(Math.max(ny, d.y0), baseY);
      const dishLeft = dissDishWallX(wallY, true), dishRight = dissDishWallX(wallY, false);
      const left = dissBlockWallCrossing(prevX, nx, dishLeft, true, r);
      nx = left.x; if (left.blocked) { f.vx *= -0.3; f.angVel *= -0.5; }
      const right = dissBlockWallCrossing(prevX, nx, dishRight, false, r);
      nx = right.x; if (right.blocked) { f.vx *= -0.3; f.angVel *= -0.5; }
      nx = dissClampWallClearance(nx, dishLeft, r);
      nx = dissClampWallClearance(nx, dishRight, r);
    }

    /* Bords gauche/droit de la scène (0..DISS_STAGE_W) : infranchissables,
       comme les parois des récipients — un lancer trop appuyé rebondit
       dessus plutôt que de sortir de la zone d'animation. */
    if (nx < r) { nx = r; f.vx = Math.abs(f.vx) * 0.3; f.angVel *= -0.5; }
    else if (nx > DISS_STAGE_W - r) { nx = DISS_STAGE_W - r; f.vx = -Math.abs(f.vx) * 0.3; f.angVel *= -0.5; }

    const inDish = dissPointInDish(nx, ny);
    const inGlass = nx >= g.x0 && nx <= g.x0 + g.w;

    if (inDish) return;   // retombé dans la coupelle : disparaît

    if (inGlass) {
      if (ny >= g.waterTopY) {          // contact avec l'eau par le dessus
        dissDropGrainInWater({ x: Math.min(Math.max(nx, g.x0 + r), g.x0 + g.w - r), y: ny, solute: f.solute });
        return;
      }
    } else if (ny >= dissState.tableY - r) {
      dissState.restingGrains.push({ x: nx, y: dissState.tableY - r, solute: f.solute, rot: f.rot });
      return;
    }

    f.x = nx; f.y = ny;
    keep.push(f);
  });

  dissState.flying = keep;
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

/* Couleur « neutre » de l'eau (sans espèce colorante) — même bleu pâle
   #b8d4f0 que la couleur neutre de l'onglet Titrage (cf. couleurDiiode(),
   couleurPermanganate_burette()... dans titrage/js/ui.js), pour rester
   cohérent avec la charte du site. Couleur plate (pas de fondu de
   profondeur haut/bas) : un dégradé vers une teinte plus foncée en bas
   assombrissait trop la solution une fois teintée. */
const DISS_WATER_NEUTRAL = '#b8d4f0';

function _hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function _lerpRgbHex(hexA, hexB, t) {
  const a = _hexToRgb(hexA), b = _hexToRgb(hexB);
  const c = a.map((v, i) => Math.round(lerp(v, b[i], t)));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/* Teinte de l'eau du verre, interpolée linéairement entre la couleur
   neutre et la couleur de l'espèce colorante du soluté courant
   (`especes[i].tint` dans SOLUTES, diss-data.js — seules les espèces à
   couleur réelle marquée en solution, ex. Cu²⁺, MnO₄⁻, en portent une ; la
   plupart des solutés n'en ont aucune et l'eau reste neutre). La
   progression suit la concentration EFFECTIVE de cette espèce (n apporté ×
   son coefficient stœchiométrique / volume), rapportée à
   DISS_SOLUTION_COLOR_SAT_MOLL (diss-data.js) : c'est cette concentration-là
   qui donne sa couleur à une vraie solution, pas la concentration apportée
   du soluté lui-même. */
function dissWaterTint() {
  const solute = SOLUTES.find(s => s.id === dissState.soluteId);
  const esp = solute.especes.find(e => e.tint);
  if (!esp) return DISS_WATER_NEUTRAL;

  const volumeL = dissState.volumeML / 1000;
  const conc = (dissState.nApporte * esp.coeff) / volumeL;
  const t = clamp01(conc / DISS_SOLUTION_COLOR_SAT_MOLL);

  return _lerpRgbHex(DISS_WATER_NEUTRAL, esp.fill, t);
}

/* Verre vu de profil, posé sur la même table que la coupelle — hauteur
   proportionnée à la scène (ne remplit pas toute la fenêtre). */
function drawDissGlass(ctx) {
  const g = dissState.glass;
  const baseY = dissState.baseY;

  ctx.save();
  ctx.fillStyle = dissWaterTint();
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

/* Groupements en vol (dissState.flying) ou immobilisés sur la table/le fond
   sec du verre (dissState.restingGrains) — même gabarit complet que le
   groupement saisi (dissDrawGrain), à une échelle intermédiaire. */
function drawDissLooseGrains(ctx, list) {
  list.forEach(loose => dissDrawGrain(ctx, loose.x, loose.y, loose.solute, DISS_ION_R * DISS_LOOSE_SCALE, loose.rot));
}

/* Avertissement affiché par-dessus la coupelle quand la table est encombrée
   (DISS_TABLE_LIMIT atteint) : le prélèvement est bloqué (cf.
   onDissPointerDown) tant que la table n'a pas été débarrassée — dissReset()
   étant le seul moyen actuel de vider dissState.restingGrains. */
function drawDissTableFullWarning(ctx) {
  const d = dissState.dish;
  const cx = d.x0 + d.w / 2, cy = d.y0 + d.h / 2;
  const boxW = d.w + d.flare * 2 + 20, boxH = 70;
  ctx.save();
  ctx.fillStyle = 'rgba(120, 20, 20, 0.88)';
  ctx.fillRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);
  ctx.strokeStyle = '#ffd7d7'; ctx.lineWidth = 2;
  ctx.strokeRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.round(DISS_STAGE_H * 0.036)}px 'Segoe UI', Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Nettoyer la paillasse !', cx, cy);
  ctx.restore();
}

/* Groupement saisi dessiné ~35% plus grand que dans le tas, pour se détacher
   visuellement du curseur natif du système qui le recouvre partiellement
   (centré exactement sur le point cliqué). */
const DISS_HELD_SCALE = 1.35;

function drawDissHeldGrain(ctx) {
  const hg = dissState.heldGrain;
  dissDrawGrain(ctx, hg.x, hg.y, hg.solute, DISS_ION_R * DISS_HELD_SCALE, hg.rot);
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
  drawDissLooseGrains(ctx, dissState.restingGrains);
  drawDissLooseGrains(ctx, dissState.flying);
  if (dissState.heldGrain) drawDissHeldGrain(ctx);
  if (dissState.restingGrains.length >= DISS_TABLE_LIMIT) drawDissTableFullWarning(ctx);
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
  dissState.flying = [];
  dissState.restingGrains = [];
  dissState.nApporte = 0;
  dissState.heldGrain = null;
  buildDissPile();
  renderDissTable();
  dissDrawScene();
}
