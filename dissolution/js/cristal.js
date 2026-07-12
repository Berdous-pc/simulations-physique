// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

/* cristal.js — grille du cristal (coupe 2D en damier Na/Cl) + machine à états
   des processus de dissolution. Chargé après sim.js, avant eau.js. */

/* ══════════════════════════════════════════════════
   Géométrie de la grille
══════════════════════════════════════════════════ */
function computeCrystalGeometry() {
  /* Unités de scène fixes (STAGE_W/STAGE_H, cf. sim.js) — jamais la taille
     réelle du conteneur DOM : resize() (ui.js) adapte ensuite cette scène à
     l'écran par une simple mise à l'échelle, la géométrie interne ne change
     donc jamais selon la machine/fenêtre. STAGE_W/STAGE_H ont été choisies
     pour que la grille (NCOLS colonnes) déborde toujours un peu de la
     largeur de la scène — débordement simplement rogné par le canvas (et
     #anim-canvas-wrap) — tout en laissant le tiers inférieur de la hauteur
     piloter la taille des cellules. */
  const W = STAGE_W, H = STAGE_H;
  const c = state.crystal;
  c.cellSize = (H / 3) / NROWS_MAX;
  c.x0 = (W - NCOLS * c.cellSize) / 2;
  c.y0 = H - H * 0.02 - NROWS_MAX * c.cellSize;
  /* rNa + rCl = cellSize donnerait un contact géométrique exact entre plus
     proches voisins (toujours de charge opposée sur cette grille) ; on retire
     5% pour laisser un léger espace visuel, le trait de contour (lineWidth)
     faisant sinon paraître les bords superposés. */
  c.rNa = c.cellSize * 4 / 9 * 0.95;
  c.rCl = c.cellSize * 5 / 9 * 0.95;
}

function getSiteXY(row, col) {
  const c = state.crystal;
  return { x: c.x0 + col * c.cellSize + c.cellSize / 2, y: c.y0 + row * c.cellSize + c.cellSize / 2 };
}

/* Motif fixe (non aléatoire) de présence de la ligne du dessus, répété sur les
   colonnes : donne une surface libre irrégulière mais reproductible. */
const TOP_ROW_PATTERN = [1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1, 0];

/* Présence par défaut d'un site (avant dérogations manuelles) : la ligne du
   dessus (row 0) suit TOP_ROW_PATTERN, le reste de la grille est garanti
   présent (fond plat, ancré au fond du verre). */
function defaultOccupied(row, col) {
  return row > 0 || TOP_ROW_PATTERN[col % TOP_ROW_PATTERN.length] === 1;
}

/* Fragment de cristal en coupe (100) : alternance simple Na/Cl (damier) —
   chaque site a 4 plus proches voisins de charge opposée dans le plan ; le
   type d'ion reste toujours imposé par la position, jamais éditable
   librement, pour garantir l'alternance des charges. La présence de chaque
   site suit defaultOccupied(), sauf dérogation dans CRYSTAL_OVERRIDES (mode
   « Cristal » du panneau de réglage). */
function buildCristal() {
  const sites = [];
  for (let row = 0; row < NROWS_MAX; row++) {
    for (let col = 0; col < NCOLS; col++) {
      const key = row + ',' + col;
      const occupied = CRYSTAL_OVERRIDES.hasOwnProperty(key) ? CRYSTAL_OVERRIDES[key] : defaultOccupied(row, col);
      sites.push({ row, col, type: (row + col) % 2 === 0 ? 'Na' : 'Cl', occupied, engaged: false });
    }
  }
  state.crystal.sites = sites;
  state.crystal.nDissolved = 0;
}

/* Bascule la présence d'un site (mode « Cristal » du panneau de réglage). */
function toggleCrystalSite(row, col) {
  if (row < 0 || row >= NROWS_MAX || col < 0 || col >= NCOLS) return;
  const key = row + ',' + col;
  const current = CRYSTAL_OVERRIDES.hasOwnProperty(key) ? CRYSTAL_OVERRIDES[key] : defaultOccupied(row, col);
  CRYSTAL_OVERRIDES[key] = !current;
}

/* Seule la face supérieure du fragment est chimiquement exposée à l'eau :
   la ligne 0, ou un site dont le voisin du dessus s'est déjà dissous (puits). */
function isExposed(site) {
  if (!site.occupied) return false;
  if (site.row === 0) return true;
  const above = state.crystal.sites[(site.row - 1) * NCOLS + site.col];
  return !above.occupied;
}

/* ══════════════════════════════════════════════════
   Cycle de déplacement d'un processus de dissolution
   Phases : approche (depuis la gauche, par le dessus) → dissociation
   (détachement vers le haut) → migration (montée rectiligne continue ; la
   cage de solvatation se referme en anneau complet dès que l'ion s'est assez
   éloigné du cristal ; sortie par le haut de la fenêtre — pas de fondu, l'ion
   et ses molécules quittent simplement le canvas, définitivement perdus).
══════════════════════════════════════════════════ */

/* `let` (pas `const`) : modifiables en direct par le panneau de réglage
   temporaire (devpanel.js). Les valeurs dérivées (angles, marges) sont
   recalculées à chaque usage à partir de ces variables, jamais mises en cache,
   pour que les réglages prennent effet immédiatement. */

/* Écart angulaire (rad) des 2 molécules d'approche par rapport à la verticale
   (-π/2) : toujours au-dessus de l'ion, jamais au même niveau ou en dessous,
   pour ne pas traverser le cristal par le côté. */
let APPROACH_ANGLE_SPREAD = 0.5;
/* Distance d'accostage et rayon de cage indépendants par type d'ion : Na+ et
   Cl- n'ont pas le même rayon affiché (cf. crystal.rNa/rCl), donc pas
   forcément la même distance d'interaction avec l'eau. */
let APPROACH_DIST_FACTOR = { Na: 0.75, Cl: 0.9 };
let DETACH_DIST_FACTOR = 1;
let CAGE_RADIUS_FACTOR = { Na: 0.75, Cl: 0.9 };
/* Marge de dégagement (au-delà du rayon de la cage) avant de la refermer :
   assez pour que le point le plus bas ne chevauche jamais plus les ions du
   cristal. */
let CAGE_CLEARANCE_EXTRA = 1;
/* Aucune eau ambiante : chaque molécule apparaît en fondu un peu au-delà de sa
   position finale (accostage ou emplacement dans la cage), puis migre vers
   celle-ci — assez proche pour ne pas traverser tout l'écran, assez loin pour
   qu'on la voie venir et s'orienter sous l'effet électrostatique. */
let SPAWN_EXTRA_FACTOR = 1.4;
/* Nombre total de molécules d'eau dans la cage de solvatation complète
   (2 déjà présentes depuis l'approche + le reste apparaît à la fermeture). */
let CAGE_SIZE = 6;

/* Calcule, pour une molécule, une durée de trajet proportionnelle à la
   distance à parcourir (vitesse constante WATER_TRAVEL_SPEED) plutôt qu'une
   durée fixe — évite qu'une molécule lointaine paraisse foncer plus vite
   qu'une molécule proche. */
function travelDuration(fromX, fromY, toX, toY) {
  const dist = Math.hypot(toX - fromX, toY - fromY);
  const speedPxPerS = WATER_TRAVEL_SPEED * state.crystal.cellSize;
  return Math.max(WATER_TRAVEL_MIN_DUR, (dist / speedPxPerS) * 1000);
}

function startDissolutionProcess(site, speed) {
  if (state.crystal.nDissolved >= MAX_DISSOLVED) return false;
  const pos = getSiteXY(site.row, site.col);
  site.engaged = true;
  const dockDist = state.crystal.cellSize * APPROACH_DIST_FACTOR[site.type];
  const spawnDist = dockDist + state.crystal.cellSize * SPAWN_EXTRA_FACTOR;
  const detachedDist = state.crystal.cellSize * DETACH_DIST_FACTOR;

  const proc = {
    id: state.nextProcessId++, site, ionType: site.type,
    /* Multiplicateur de vitesse propre à cet ion (réglé par le panneau dev,
       DISSOLUTION_SCRIPT[i].speed) : x0.5 = deux fois plus lent, x2 = deux
       fois plus rapide. Appliqué en réduisant le dt local de ce processus
       (cf. updateProcesses) — toutes ses étapes (approche, dissociation,
       migration, solvatation) en héritent uniformément, sans toucher aux
       autres processus ni aux constantes globales. */
    speed: speed || 1,
    phase: 'approche', phaseT: 0, approcheDur: WATER_TRAVEL_MIN_DUR,
    latticeX: pos.x, latticeY: pos.y,
    ionX: pos.x, ionY: pos.y,
    detachedX: pos.x, detachedY: pos.y - detachedDist,   // détachement rectiligne vers le haut
    waters: [],
    detached: false,
    solvated: false, solvT: 0, solvDur: 0,
  };

  [-Math.PI / 2 - APPROACH_ANGLE_SPREAD, -Math.PI / 2 + APPROACH_ANGLE_SPREAD].forEach(ang => {
    const sx = pos.x + Math.cos(ang) * spawnDist;
    const sy = pos.y + Math.sin(ang) * spawnDist;
    const w = spawnWaterMolecule(sx, sy, computeWaterOrientation(sx, sy, pos.x, pos.y, site.type));
    w._relStartX = sx - pos.x; w._relStartY = sy - pos.y;
    w._relTargetX = Math.cos(ang) * dockDist; w._relTargetY = Math.sin(ang) * dockDist;
    w._travelDur = travelDuration(w._relStartX, w._relStartY, w._relTargetX, w._relTargetY);
    proc.approcheDur = Math.max(proc.approcheDur, w._travelDur);
    proc.waters.push(w);
  });

  state.processes.push(proc);
  return true;
}

/* Répartit n molécules en anneau complet autour de l'ion (cage de solvatation
   refermée), à intervalles réguliers en partant du dessus. */
function cageSlotAngle(i, n) {
  if (n <= 1) return -Math.PI / 2;
  return -Math.PI / 2 + i * (2 * Math.PI / n);
}

function updateProcesses(dt) {
  const exitMargin = state.crystal.cellSize * 0.5;

  state.processes = state.processes.filter(p => {
    /* dt local à ce processus, mis à l'échelle par son multiplicateur de
       vitesse individuel (p.speed) : x0.5 ralentit uniquement cet ion (deux
       fois plus de temps réel pour la même progression), sans affecter le dt
       global ni les autres processus. */
    const pdt = dt * p.speed;
    p.phaseT += pdt;
    /* Rayon de cage propre au type d'ion de ce processus (Na+ et Cl- n'ont
       pas le même rayon affiché) — marges de dégagement/attente dérivées.
       CAGE_RADIUS_FACTOR est réglé à la main (panneau dev) pour éviter tout
       chevauchement des molécules de la cage selon CAGE_SIZE : pas de
       recalcul automatique, à ajuster visuellement si l'un de ces deux
       réglages change. */
    const cageRadiusFactor = CAGE_RADIUS_FACTOR[p.ionType];
    const cageClearY = state.crystal.y0 - state.crystal.cellSize * (cageRadiusFactor + CAGE_CLEARANCE_EXTRA);

    if (p.phase === 'approche') {
      p.waters.forEach(w => {
        const t = easeInOut(clamp01(p.phaseT / w._travelDur));
        w.x = p.ionX + lerp(w._relStartX, w._relTargetX, t);
        w.y = p.ionY + lerp(w._relStartY, w._relTargetY, t);
        w.orient = computeWaterOrientation(w.x, w.y, p.ionX, p.ionY, p.ionType);
      });
      if (p.phaseT >= p.approcheDur) {
        p.phaseT = 0;
        p.waters.forEach(w => { w._relTargetX = w.x - p.ionX; w._relTargetY = w.y - p.ionY; });
        p.phase = 'dissociation';
      }

    } else if (p.phase === 'dissociation') {
      const dur = PHASE_DUR.dissociation;
      if (!p.detached) { state.crystal.nDissolved++; p.site.occupied = false; p.detached = true; }
      const t = clamp01(p.phaseT / dur);
      /* Courbe de Hermite (et non un ease-in-out symétrique) : part à vitesse
         nulle (l'ion quitte le repos du réseau) et se termine exactement à la
         vitesse constante de la phase de migration qui suit. Un ease-in-out
         revenait à vitesse nulle en fin de dissociation, puis la migration
         démarrait d'un coup à pleine vitesse : la saccade venait de cette
         discontinuité de vitesse au changement de phase, pas d'une des deux
         phases prise isolément. */
      const dy = p.detachedY - p.latticeY;
      const migVy = -(MIGRATION_SPEED * state.crystal.cellSize / 1000) * dur;   // dérivée (par unité de t) en fin de courbe
      const tt = t * t, ttt = tt * t;
      p.ionX = lerp(p.latticeX, p.detachedX, t);
      p.ionY = p.latticeY + dy * (3 * tt - 2 * ttt) + migVy * (ttt - tt);
      p.waters.forEach(w => {
        w.x = p.ionX + w._relTargetX; w.y = p.ionY + w._relTargetY;
        w.orient = computeWaterOrientation(w.x, w.y, p.ionX, p.ionY, p.ionType);
      });
      if (p.phaseT >= dur) { p.phaseT = 0; p.phase = 'migration'; }

    } else if (p.phase === 'migration') {
      p.ionY -= MIGRATION_SPEED * state.crystal.cellSize * pdt / 1000;

      /* La cage de solvatation se complète (CAGE_SIZE molécules au total,
         anneau à 360°) dès que l'ion s'est assez éloigné du cristal pour que
         le point le plus bas de l'anneau ne chevauche plus les ions restants
         — pas besoin d'attendre le tiers supérieur. */
      if (!p.solvated && p.ionY <= cageClearY) {
        p.solvated = true;
        p.solvT = 0;
        const n = CAGE_SIZE;
        const radius = state.crystal.cellSize * cageRadiusFactor;
        const spawnDist = radius + state.crystal.cellSize * SPAWN_EXTRA_FACTOR;

        /* Les molécules déjà présentes (approche) repartent de leur position actuelle. */
        p.waters.forEach(w => { w._relStartX = w.x - p.ionX; w._relStartY = w.y - p.ionY; });

        /* Les nouvelles apparaissent en fondu, un peu au-delà de leur
           emplacement final dans la cage — on les voit venir et s'orienter. */
        for (let i = p.waters.length; i < n; i++) {
          const spawnAng = cageSlotAngle(i, n);
          const sx = p.ionX + Math.cos(spawnAng) * spawnDist;
          const sy = p.ionY + Math.sin(spawnAng) * spawnDist;
          const w = spawnWaterMolecule(sx, sy, computeWaterOrientation(sx, sy, p.ionX, p.ionY, p.ionType));
          w._relStartX = sx - p.ionX; w._relStartY = sy - p.ionY;
          p.waters.push(w);
        }

        p.solvDur = WATER_TRAVEL_MIN_DUR;
        p.waters.forEach((w, i) => {
          const ang = cageSlotAngle(i, n);
          w._relTargetX = Math.cos(ang) * radius;
          w._relTargetY = Math.sin(ang) * radius;
          w._travelDur = travelDuration(w._relStartX, w._relStartY, w._relTargetX, w._relTargetY);
          p.solvDur = Math.max(p.solvDur, w._travelDur);
        });
      }

      if (p.solvated && p.solvT < p.solvDur) {
        p.solvT += pdt;
        p.waters.forEach(w => {
          const t = easeInOut(clamp01(p.solvT / w._travelDur));
          w.x = p.ionX + lerp(w._relStartX, w._relTargetX, t);
          w.y = p.ionY + lerp(w._relStartY, w._relTargetY, t);
          w.orient = computeWaterOrientation(w.x, w.y, p.ionX, p.ionY, p.ionType);
        });
      } else {
        p.waters.forEach(w => {
          w.x = p.ionX + w._relTargetX; w.y = p.ionY + w._relTargetY;
          w.orient = computeWaterOrientation(w.x, w.y, p.ionX, p.ionY, p.ionType);
        });
      }

      /* Pas de fondu : l'ion et sa cage sortent simplement par le haut de la
         fenêtre dès qu'ils la dépassent, et sont alors définitivement perdus
         (retirés du bassin) — aucune mise en attente. */
      if (p.ionY < -exitMargin) {
        p.waters.forEach(removeWaterMolecule);
        return false;
      }
    }
    return true;
  });
}

/* Déroule le scénario fixe : dès que animT atteint l'instant prévu d'une
   entrée non encore déclenchée, on démarre la dissolution du site exact
   qu'elle désigne (row, col) — aucune décision au moment de l'exécution,
   tout est écrit à l'avance dans DISSOLUTION_SCRIPT. Chaque entrée porte son
   propre drapeau `fired` (pas d'indice global) : l'ordre du tableau n'a donc
   pas besoin d'être trié, ce qui permet de réordonner/éditer librement la
   liste depuis le panneau de réglage. */
function runScript() {
  DISSOLUTION_SCRIPT.forEach(entry => {
    if (entry.fired || state.animT < entry.atMs) return;
    entry.fired = true;
    const site = state.crystal.sites[entry.row * NCOLS + entry.col];
    if (site && site.occupied && !site.engaged && isExposed(site)) startDissolutionProcess(site, entry.speed);
  });
}

/* ══════════════════════════════════════════════════
   Rendu
══════════════════════════════════════════════════ */
function drawIon(ctx, type, cx, cy, r) {
  ctx.save();
  const label = type === 'Na' ? 'Na⁺' : 'Cl⁻';
  drawSphere(ctx, cx, cy, r, ATOM_COLORS[type], ATOM_BORDER[type], label, ATOM_LABEL_COLOR[type]);
  ctx.restore();
}

function drawCristal(ctx) {
  const c = state.crystal;
  c.sites.forEach(s => {
    if (!s.occupied || s.engaged) return;
    const pos = getSiteXY(s.row, s.col);
    const r = s.type === 'Na' ? c.rNa : c.rCl;
    drawIon(ctx, s.type, pos.x, pos.y, r);
  });
}

function drawProcesses(ctx) {
  const sc = waterScale();
  state.processes.forEach(p => {
    p.waters.forEach(w => drawWaterMolecule(ctx, w.x, w.y, w.orient, sc, w.alpha));
    const r = p.ionType === 'Na' ? state.crystal.rNa : state.crystal.rCl;
    drawIon(ctx, p.ionType, p.ionX, p.ionY, r);
  });
}
