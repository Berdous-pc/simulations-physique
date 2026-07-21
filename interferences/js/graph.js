// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
//  graph.js — Graphe I(x) interactif (survol/points épinglés)
//  Dépend de : sim.js (sim, echantillonnerIntensite)
//  Chargé après scene.js.
// ═══════════════════════════════════════════════════

// Nombre de points échantillonnés sur la fenêtre COURANTE (gview.xMin..xMax), pas sur
// toute la largeur de l'écran : la fenêtre se resserre automatiquement en vue Écran
// (cf. scene.js → syncGraphAvecVueEcran) quand la tache est petite (D et/ou λ faibles),
// et la résolution doit suivre pour que la courbe reste lisse. Valeur bien plus élevée
// qu'en diffraction pure (1200) : les franges d'interférence (période ~λD/b, cf. sim.js →
// interfrangeI) sont beaucoup plus fines que l'enveloppe de diffraction seule — au réglage
// b maximal (1 mm) sur la largeur par défaut de l'écran (25 cm), l'interfrange ne fait
// qu'une fraction de mm, largement sous-échantillonnée à 1200 points. À affiner
// visuellement si besoin (cf. ARCHITECTURE.md → §Fenêtrage FFT pour la même préoccupation
// côté rendu 3D).
const N_ECHANTILLONS = 6000;

// Fenêtre de vue courante (en mètres, sur x) et sur y (intensité normalisée) — modifiée
// uniquement par syncGraphPixelParfait() (appelée par scene.js → syncGraphAvecVueEcran)
// quand la vue Écran zoome/dézoome ou change.
const gview = {
  xMin: -sim.screenHalfWidth,
  xMax:  sim.screenHalfWidth,
  yMin: 0,
  yMax: 1.05
};

// Marge fixe autour de la zone de tracé, partagée par le dessin et les interactions
// souris (évite deux définitions divergentes du même repère).
const GRAPH_PAD = { t: 10, r: 14, b: 30, l: 34 };

// ═══════════════════════════════════════════════════════════════════════
//  Cache des points échantillonnés (mono + par couleur en lumière blanche) — le calcul
//  (echantillonnerIntensite, coûteux : sinc/Airy × cos² par point) ne doit se refaire QUE
//  quand la courbe physique change réellement (paramètre a/b/D/λ, forme, mode lumineux,
//  couleurs cochées) ou que la fenêtre visible change (zoom/pan, cf. gview). Le survol
//  souris, l'épinglage et le simple redessin (à chaque frame) ne font qu'une RECHERCHE dans
//  ce cache (pointLePlusProche, un balayage de comparaisons — aucune trigonométrie) : ils ne
//  doivent jamais déclencher un rééchantillonnage. `invaliderCourbe()` est appelée à chaque
//  déclencheur légitime (ui.js → updateParam/updateMaskShape/setLightSource/resetSim, la
//  légende lumière blanche ci-dessous, syncGraphPixelParfait au zoom) ; assurerCourbeCalculee()
//  ne recalcule que si nécessaire, sinon c'est un no-op quasi gratuit.
// ═══════════════════════════════════════════════════════════════════════
let courbeDirty = true;
let cachedPtsMono = null;
let cachedPtsCouleurs = null; // { [nom de couleur]: pts[] }, une entrée par couleur cochée

function invaliderCourbe() {
  courbeDirty = true;
}

function assurerCourbeCalculee() {
  if (!courbeDirty) return;
  cachedPtsMono = echantillonnerIntensite(N_ECHANTILLONS, gview.xMin, gview.xMax);
  if (sim.lightSource === 'blanche') {
    cachedPtsCouleurs = {};
    for (const c of BLANCHE_COULEURS) {
      if (!sim.blancheVisibles[c.nom]) continue;
      cachedPtsCouleurs[c.nom] = echantillonnerIntensite(N_ECHANTILLONS, gview.xMin, gview.xMax, c.lambda);
    }
  } else {
    cachedPtsCouleurs = null;
  }
  courbeDirty = false;
}

// Survol souris (position canvas, coordonnées CSS) — null quand le curseur est hors du
// canvas. Pilote la mise en évidence du point le plus proche sous la souris, TOUJOURS
// active (plus de mode à activer, contrairement à l'ancien réticule libre).
let graphHover = null;

// Mode « Épingler » : un clic ajoute le point du curseur à graphPins (retiré si l'on
// clique à nouveau dessus), indépendamment du survol qui continue d'afficher son propre
// point en direct.
let graphPinMode = false;
const graphPins = []; // { x, I } — persistent jusqu'à suppression ou reset (cf. ui.js)

// Mode « Lien figure » : n'a de sens qu'en vue Écran (seule vue où la figure 3D et le
// graphe représentent la même chose, au même endroit physique) — cf. syncGraphLienDisponibilite,
// appelée par scene.js → setSceneView() à chaque bascule de vue.
let graphLienMode = false;

// Couleurs des pointillés minima/maxima (cf. dessinerLienFigure) — distinctes du bleu du
// survol (#2a6aaa) et de l'orange des épingles (#b04020) pour ne pas les confondre.
const COULEUR_LIEN_MAXIMA = '#2a9d4a';
const COULEUR_LIEN_MINIMA = '#8a4fc9';

// ─────────────────────────────────────────────────────────────────────
//  Aligne la fenêtre horizontale du graphe sur la vue Écran de façon PIXEL-PARFAITE (pas
//  juste « même plage physique ») : même échelle px/m ET même pixel de page pour x=0 que
//  la scène 3D — appelée par scene.js → syncGraphAvecVueEcran (zoom molette, redimensionnement,
//  bascule de vue, dont camOrtho vient d'être recalculé). Sans ça, les deux canvas ont beau
//  montrer la même plage physique, ils n'ont pas la même échelle (le graphe réserve une
//  marge interne pour ses axes, GRAPH_PAD, que la scène — plein cadre — n'a pas) ni le même
//  centre de page (marge asymétrique 34px/14px, + padding CSS différent autour de chaque
//  canvas) : les pointillés de dessinerLienFigure() n'étaient donc verticaux qu'à peu près.
//  Résout xMin/xMax (pas nécessairement symétriques autour de 0) pour que :
//   - l'écart xMax-xMin corresponde exactement à la largeur de la zone de tracé (gw px) à
//     la même échelle px/m que la scène ;
//   - le pixel de PAGE correspondant à x=0 dans le graphe (pad.l + f·gw, f la position de 0
//     dans la fenêtre) tombe exactement sur le pixel de page du centre de la vue Écran
//     (toujours le centre du canvas scène, cf. fracXVueEcran(0) = 0.5 par construction de
//     fitOrtho, toujours symétrique).
// ─────────────────────────────────────────────────────────────────────
function syncGraphPixelParfait() {
  const sceneCanvas = document.getElementById('scene-canvas');
  const graphCanvas = document.getElementById('graph-intensity');
  if (!sceneCanvas || !graphCanvas) return;
  const sceneRect = sceneCanvas.getBoundingClientRect();
  const { pad, gw } = graphLayout(graphCanvas);
  if (sceneRect.width === 0 || gw <= 0) return;

  const scenePxParM = sceneRect.width / (2 * (camOrtho.right / 100)); // camOrtho symétrique
  const spanGraph_m = gw / scenePxParM;

  const pxScene0 = sceneRect.left + sceneRect.width / 2; // x=0 = toujours le centre en vue Écran
  const graphRect = graphCanvas.getBoundingClientRect();
  const localPx0 = pxScene0 - graphRect.left;
  const f = (localPx0 - pad.l) / gw; // position de x=0 dans la fenêtre, en fraction 0..1

  gview.xMin = -f * spanGraph_m;
  gview.xMax = (1 - f) * spanGraph_m;
  invaliderCourbe(); // fenêtre échantillonnée différente : la courbe en cache ne correspond plus
  drawIntensityGraph();
}

function toggleGraphPin() {
  graphPinMode = !graphPinMode;
  document.getElementById('btn-graph-pin').classList.toggle('active', graphPinMode);
}

function toggleGraphLien() {
  if (sim.view !== 'screen' || sim.lightSource === 'blanche') return; // bouton normalement désactivé dans ce cas
  graphLienMode = !graphLienMode;
  const btn = document.getElementById('btn-graph-lien');
  btn.classList.toggle('active', graphLienMode);
  if (!graphLienMode) effacerOverlayLien();
}

// ─────────────────────────────────────────────────────────────────────
//  (Dés)active le bouton « Lien figure » selon la vue courante et le mode lumineux (pas de
//  sens en lumière blanche, plusieurs courbes superposées, cf. syncGraphModeBlanche). Coupe
//  le mode si l'une des conditions cesse d'être remplie. Appelée par scene.js →
//  setSceneView() et par syncGraphModeBlanche() ci-dessous.
// ─────────────────────────────────────────────────────────────────────
function syncGraphLienDisponibilite() {
  const actif = sim.view === 'screen' && sim.lightSource !== 'blanche';
  const btn = document.getElementById('btn-graph-lien');
  if (btn) btn.disabled = !actif;
  if (!actif && graphLienMode) {
    graphLienMode = false;
    if (btn) btn.classList.remove('active');
    effacerOverlayLien();
  }
}

function effacerOverlayLien() {
  const cv = document.getElementById('graph-lien-overlay');
  if (cv && cv.width && cv.height) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
}

// ─────────────────────────────────────────────────────────────────────
//  Légende à cases à cocher du graphe (mode Lumière blanche, cf. sim.js → BLANCHE_COULEURS) :
//  une entrée par couleur de référence, pastille teintée selon sa λ, case à cocher liée à
//  sim.blancheVisibles. Appelée une seule fois au démarrage (ui.js → init()).
// ─────────────────────────────────────────────────────────────────────
function initLegendeBlanche() {
  const legende = document.getElementById('graph-legend-blanche');
  if (!legende) return;
  for (const c of BLANCHE_COULEURS) {
    const swatch = legende.querySelector(`.legend-swatch[data-couleur="${c.nom}"]`);
    if (swatch) swatch.style.background = longueurOndeVersCss(c.lambda);
    const checkbox = legende.querySelector(`input[data-couleur="${c.nom}"]`);
    if (checkbox) {
      checkbox.addEventListener('change', () => {
        sim.blancheVisibles[c.nom] = checkbox.checked;
        invaliderCourbe(); // couleur ajoutée/retirée de cachedPtsCouleurs
        drawIntensityGraph();
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
//  (Dés)active tout ce qui dépend du mode lumineux dans la zone graphe : légende à cases à
//  cocher (visible seulement en lumière blanche) et bouton "Lien figure" (sans sens dans ce
//  mode, cf. son commentaire — l'épinglage/survol, eux, restent actifs, cf.
//  dessinerInfoMultiCourbes). Appelée par ui.js → setLightSource()/resetSim()/init().
// ─────────────────────────────────────────────────────────────────────
function syncGraphModeBlanche() {
  const estBlanche = sim.lightSource === 'blanche';
  const legende = document.getElementById('graph-legend-blanche');
  if (legende) {
    legende.classList.toggle('visible', estBlanche);
    for (const c of BLANCHE_COULEURS) {
      const checkbox = legende.querySelector(`input[data-couleur="${c.nom}"]`);
      if (checkbox) checkbox.checked = sim.blancheVisibles[c.nom];
    }
  }
  syncGraphLienDisponibilite();
  invaliderCourbe(); // bascule mono/blanche : la courbe en cache ne correspond plus au mode actif
  drawIntensityGraph();
}

// ─────────────────────────────────────────────────────────────────────
//  Pas de graduation "joli" (1, 2, 5 × 10^n).
// ─────────────────────────────────────────────────────────────────────
function niceStep(range, targetN) {
  const raw  = range / targetN;
  const mag  = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return nice * mag;
}

// ─────────────────────────────────────────────────────────────────────
//  Point échantillonné le plus proche d'une abscisse x (m).
// ─────────────────────────────────────────────────────────────────────
function pointLePlusProche(pts, x) {
  let best = pts[0], bestD = Infinity;
  for (const p of pts) {
    const d = Math.abs(p.x - x);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────
//  Extrema locaux (minima ET maxima, y compris les secondaires) d'une série de points déjà
//  échantillonnée. Comparaison sur une fenêtre de K voisins de chaque côté (pas juste le
//  voisin immédiat) avec inégalités LARGES (>=, pas de comparaison stricte) : au sommet
//  d'un maximum, la courbe est quasi plate sur plusieurs échantillons consécutifs (dérivée
//  nulle), et une comparaison stricte au seul voisin immédiat ratait le maximum dès que
//  deux échantillons adjacents tombaient à une intensité identique au bit près — constaté
//  par l'utilisateur sur la tache centrale, la plus large et donc la plus sujette à ce
//  plateau. Les inégalités larges font qualifier TOUS les points du plateau ; dedupePlateau()
//  les fusionne ensuite en un seul point représentatif (le milieu du plateau). Pas de
//  formule fermée pour les maxima secondaires (racines transcendantes de tan β = β), la
//  détection numérique évite d'en avoir besoin et reste valable si intensiteOuverture() change
//  un jour de forme.
// ─────────────────────────────────────────────────────────────────────
const EXTREMA_FENETRE = 2;

function calculerExtrema(pts) {
  const maxima = [], minima = [];
  const n = pts.length;
  for (let i = EXTREMA_FENETRE; i < n - EXTREMA_FENETRE; i++) {
    const b = pts[i].I;
    let estMax = true, estMin = true;
    for (let k = 1; k <= EXTREMA_FENETRE && (estMax || estMin); k++) {
      const g = pts[i - k].I, d = pts[i + k].I;
      if (b < g || b < d) estMax = false;
      if (b > g || b > d) estMin = false;
    }
    if (estMax) maxima.push(pts[i]);
    else if (estMin) minima.push(pts[i]);
  }
  const pas = pts.length > 1 ? pts[1].x - pts[0].x : 0;
  return {
    maxima: dedupePlateau(maxima, pas, (a, b) => (b.I > a.I ? b : a)),
    minima: dedupePlateau(minima, pas, (a, b) => (b.I < a.I ? b : a))
  };
}

// ─────────────────────────────────────────────────────────────────────
//  Fusionne les points consécutifs (en x) d'une liste d'extrema candidats — cf.
//  calculerExtrema : sur un plateau (ou un creux large et peu profond), plusieurs
//  échantillons voisins qualifient tous comme extremum. `pts` est déjà trié par x
//  croissant, donc les points d'un même plateau sont forcément consécutifs dans `liste`.
//  Tolérance = quelques pas d'échantillonnage (assez large pour couvrir un plateau, bien
//  plus petit que l'écart entre deux extrema DISTINCTS de la figure — le premier minimum
//  et la tache centrale ne sont jamais aussi rapprochés).
//
//  `meilleur(a, b)` choisit le représentant du groupe : le point d'intensité la PLUS
//  BASSE pour un creux, la plus HAUTE pour une bosse — PAS le milieu géométrique du
//  groupe (essayé initialement, mais un creux large n'est pas forcément symétrique en x
//  autour de son point le plus bas ; le milieu géométrique retombe alors visiblement à
//  côté du vrai minimum, constaté par l'utilisateur sur un minimum secondaire large et
//  peu profond). Choisir par valeur d'intensité retombe toujours exactement sur le point
//  le plus sombre/lumineux réellement échantillonné, quelle que soit la forme du groupe.
// ─────────────────────────────────────────────────────────────────────
function dedupePlateau(liste, pas, meilleur) {
  if (liste.length === 0) return liste;
  const tolerance = pas * 6;
  const out = [];
  let run = [liste[0]];
  for (let i = 1; i < liste.length; i++) {
    if (liste[i].x - run[run.length - 1].x <= tolerance) {
      run.push(liste[i]);
    } else {
      out.push(run.reduce(meilleur));
      run = [liste[i]];
    }
  }
  out.push(run.reduce(meilleur));
  return out;
}

// ─────────────────────────────────────────────────────────────────────
//  Restreint les extrema affichés à la TACHE CENTRALE DE DIFFRACTION, c-à-d à |x| < premier
//  zéro de l'enveloppe (xPremierMinimum, cf. sim.js) : au-delà, l'enveloppe de diffraction
//  écrase tellement les franges d'interférence qu'elles ne sont plus visibles à l'œil sur la
//  figure projetée à l'écran, donc les relier au graphe n'a plus de sens pédagogique. Borne
//  physique (dépend de λ, a, D), pas un nombre de franges fixe : avec des franges
//  d'interférence, il peut y en avoir des dizaines dans la tache centrale ou une seule selon
//  le rapport b/a (cf. sim.js).
// ─────────────────────────────────────────────────────────────────────
const LIEN_FRACTION_TACHE_CENTRALE = 0.8; // fraction du rayon de la tache centrale au-delà de laquelle on arrête de tracer les liens (franges trop écrasées par l'enveloppe pour rester lisibles)
function limiterExtremaCentraux(maxima, minima) {
  const lim = LIEN_FRACTION_TACHE_CENTRALE * Math.abs(xPremierMinimum(sim.lambda, sim.a, sim.D, sim.maskShape));
  return {
    maxima: maxima.filter(p => Math.abs(p.x) <= lim),
    minima: minima.filter(p => Math.abs(p.x) <= lim)
  };
}

// ─────────────────────────────────────────────────────────────────────
//  Repère de tracé courant (échelle x/y ↔ pixels canvas) pour le canvas donné.
// ─────────────────────────────────────────────────────────────────────
function graphLayout(cv) {
  const pad = GRAPH_PAD;
  const gw = cv.clientWidth - pad.l - pad.r;
  const gh = cv.clientHeight - pad.t - pad.b;
  const { xMin, xMax, yMin, yMax } = gview;
  return {
    pad, gw, gh, xMin, xMax, yMin, yMax,
    toX: x => pad.l + ((x - xMin) / (xMax - xMin)) * gw,
    toY: I => pad.t + gh - ((I - yMin) / (yMax - yMin)) * gh
  };
}

// ─────────────────────────────────────────────────────────────────────
//  Marqueur (point + étiquette coordonnées) à une position (x, I) du graphe — utilisé à
//  la fois pour le survol en direct et pour les points épinglés (cf. drawIntensityGraph).
//  L'étiquette bascule à gauche/en dessous si elle déborderait du cadre.
// ─────────────────────────────────────────────────────────────────────
function dessinerMarqueurPoint(gc, layout, x, I, couleur) {
  const { pad, gw, toX, toY } = layout;
  const px = toX(x), py = toY(I);

  gc.save();
  gc.fillStyle = couleur;
  gc.beginPath(); gc.arc(px, py, 4.5, 0, Math.PI * 2); gc.fill();
  gc.strokeStyle = '#fff';
  gc.lineWidth = 1.2;
  gc.stroke();

  const label = `(${formatFr(x * 100, 2)} cm, ${formatFr(I, 3)})`;
  gc.font = '18px monospace'; // ×1,5 (demande explicite de l'utilisateur)
  const lw = gc.measureText(label).width;
  let lx = px + 15;
  if (lx + lw > pad.l + gw) lx = px - 15 - lw;
  let ly = py - 30;
  if (ly < pad.t) ly = py + 18;

  gc.fillStyle = 'rgba(44,62,80,0.85)';
  gc.fillRect(lx - 6, ly - 6, lw + 12, 27);
  gc.fillStyle = '#fff';
  gc.textAlign = 'left';
  gc.textBaseline = 'middle';
  gc.fillText(label, lx, ly + 7);
  gc.restore();
}

// ─────────────────────────────────────────────────────────────────────
//  Marqueurs + encart d'infos à une abscisse x, EN MODE BLANC : un point par couleur
//  actuellement cochée dans la légende (pas "le" point le plus proche comme en mono, qui
//  n'aurait pas de sens univoque avec plusieurs courbes superposées), plus un seul encart
//  listant toutes leurs valeurs — utilisée à la fois pour le survol et pour chaque épingle.
// ─────────────────────────────────────────────────────────────────────
function dessinerInfoMultiCourbes(gc, layout, x) {
  const { toX, toY, pad, gw } = layout;
  const px = toX(x);
  const lignes = [];
  for (const c of BLANCHE_COULEURS) {
    if (!sim.blancheVisibles[c.nom]) continue;
    const I = intensiteInterference(x, c.lambda, sim.a, sim.b, sim.D);
    const py = toY(I);
    const couleurC = longueurOndeVersCss(c.lambda);
    gc.save();
    gc.fillStyle = couleurC;
    gc.beginPath(); gc.arc(px, py, 4.5, 0, Math.PI * 2); gc.fill();
    gc.strokeStyle = '#fff';
    gc.lineWidth = 1.2;
    gc.stroke();
    gc.restore();
    lignes.push({ couleur: couleurC, texte: `${c.nom} : ${formatFr(I, 3)}` });
  }
  if (lignes.length === 0) return;

  gc.save();
  gc.font = 'bold 18px monospace'; // ×1,5 (demande explicite de l'utilisateur)
  const titre = `x = ${formatFr(x * 100, 2)} cm`;
  let boxW = gc.measureText(titre).width;
  gc.font = '18px monospace';
  for (const l of lignes) boxW = Math.max(boxW, 30 + gc.measureText(l.texte).width);
  boxW += 18;
  const ligneH = 23;
  const boxH = 27 + lignes.length * ligneH + 9;

  let bx = px + 18;
  if (bx + boxW > pad.l + gw) bx = px - 18 - boxW;
  const by = pad.t + 9;

  gc.fillStyle = 'rgba(44,62,80,0.92)';
  gc.fillRect(bx, by, boxW, boxH);
  gc.textAlign = 'left';
  gc.textBaseline = 'top';
  gc.fillStyle = '#fff';
  gc.font = 'bold 18px monospace';
  gc.fillText(titre, bx + 9, by + 8);
  gc.font = '18px monospace';
  lignes.forEach((l, i) => {
    const ly = by + 33 + i * ligneH;
    gc.fillStyle = l.couleur;
    gc.fillRect(bx + 9, ly + 4, 18, 8);
    gc.fillStyle = '#fff';
    gc.fillText(l.texte, bx + 33, ly);
  });
  gc.restore();
}

// ─────────────────────────────────────────────────────────────────────
//  Dessine le graphe I(x) complet dans #graph-intensity.
// ─────────────────────────────────────────────────────────────────────
function drawIntensityGraph() {
  const cv = document.getElementById('graph-intensity');
  if (!cv) return;
  const gc = cv.getContext('2d');
  const w = cv.clientWidth, h = cv.clientHeight;
  if (w === 0 || h === 0) return;

  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  gc.setTransform(dpr, 0, 0, dpr, 0, 0);

  const layout = graphLayout(cv);
  const { pad, gw, gh, xMin, xMax, yMin, yMax, toX, toY } = layout;
  assurerCourbeCalculee();
  const pts = cachedPtsMono;

  gc.font = '13px monospace';
  gc.clearRect(0, 0, w, h);
  gc.fillStyle = '#ffffff';
  gc.fillRect(0, 0, w, h);

  // ── Grille + graduations X (cm) ──
  const xStepM = niceStep((xMax - xMin) * 100, 6) / 100;
  const xFirst = Math.ceil(xMin / xStepM) * xStepM;
  gc.strokeStyle = '#e0dcd6';
  gc.lineWidth = 1;
  gc.fillStyle = '#7a8a96';
  gc.font = '12px monospace';
  gc.textAlign = 'center';
  gc.textBaseline = 'top';
  for (let x = xFirst; x <= xMax + xStepM * 0.01; x += xStepM) {
    const px = toX(x);
    if (px < pad.l - 1 || px > pad.l + gw + 1) continue;
    gc.beginPath(); gc.moveTo(px, pad.t); gc.lineTo(px, pad.t + gh); gc.stroke();
    gc.fillText(formatFr(x * 100, 1) + ' cm', px, pad.t + gh + 4);
  }

  // ── Grille + graduations Y (intensité normalisée) ──
  const yStep = niceStep(yMax - yMin, 4);
  const yFirst = Math.ceil(yMin / yStep) * yStep;
  gc.textAlign = 'right';
  gc.textBaseline = 'middle';
  for (let v = yFirst; v <= yMax + yStep * 0.01; v += yStep) {
    const py = toY(v);
    if (py < pad.t - 1 || py > pad.t + gh + 1) continue;
    gc.beginPath(); gc.moveTo(pad.l, py); gc.lineTo(pad.l + gw, py); gc.stroke();
    gc.fillText(formatFr(v, 2), pad.l - 5, py);
  }

  // ── Cadre ──
  gc.strokeStyle = '#c8c0b4';
  gc.strokeRect(pad.l, pad.t, gw, gh);

  // ── Courbe(s) I(x) ──
  // Mode blanc : une courbe par couleur de référence cochée dans la légende (cf. sim.js →
  // BLANCHE_COULEURS), au lieu de la seule courbe de sim.lambda. Pas de survol/épingles dans
  // ce mode (cf. syncGraphModeBlanche) : avec plusieurs courbes superposées, "le" point le
  // plus proche du curseur n'aurait pas de sens univoque.
  gc.save();
  gc.beginPath();
  gc.rect(pad.l, pad.t, gw, gh);
  gc.clip();
  if (sim.lightSource === 'blanche') {
    for (const c of BLANCHE_COULEURS) {
      const ptsC = cachedPtsCouleurs[c.nom];
      if (!ptsC) continue;
      const couleurC = longueurOndeVersCss(c.lambda);
      gc.strokeStyle = couleurC;
      gc.lineWidth = 2;
      gc.shadowColor = couleurC;
      gc.shadowBlur = 4;
      gc.beginPath();
      let firstC = true;
      for (const p of ptsC) {
        const px = toX(p.x), py = toY(p.I);
        if (firstC) { gc.moveTo(px, py); firstC = false; }
        else gc.lineTo(px, py);
      }
      gc.stroke();
    }
  } else {
    const couleur = longueurOndeVersCss(sim.lambda);
    gc.strokeStyle = couleur;
    gc.lineWidth = 2;
    gc.shadowColor = couleur;
    gc.shadowBlur = 4;
    gc.beginPath();
    let first = true;
    for (const p of pts) {
      const px = toX(p.x), py = toY(p.I);
      if (first) { gc.moveTo(px, py); first = false; }
      else gc.lineTo(px, py);
    }
    gc.stroke();
  }
  gc.restore();

  if (sim.lightSource === 'blanche') {
    // ── Épingles + survol, mode blanc : toutes les couleurs cochées à cette abscisse ──
    for (const p of graphPins) dessinerInfoMultiCourbes(gc, layout, p.x);
    if (graphHover) {
      const xHover = Math.max(xMin, Math.min(xMax, xMin + ((graphHover.x - pad.l) / gw) * (xMax - xMin)));
      dessinerInfoMultiCourbes(gc, layout, xHover);
    }
  } else {
    // ── Points épinglés (persistants) ──
    for (const p of graphPins) dessinerMarqueurPoint(gc, layout, p.x, p.I, '#b04020');

    // ── Point le plus proche du curseur (survol en direct, toujours actif) ──
    if (graphHover) {
      const xHover = Math.max(xMin, Math.min(xMax, xMin + ((graphHover.x - pad.l) / gw) * (xMax - xMin)));
      const p = pointLePlusProche(pts, xHover); // recherche dans le cache, pas de rééchantillonnage
      dessinerMarqueurPoint(gc, layout, p.x, p.I, '#2a6aaa');
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Écouteurs souris du canvas graphe (survol, épinglage).
// ─────────────────────────────────────────────────────────────────────
function initGraphInteractions() {
  const cv = document.getElementById('graph-intensity');

  cv.addEventListener('mousemove', e => {
    const r = cv.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (cv.clientWidth / r.width);
    const my = (e.clientY - r.top) * (cv.clientHeight / r.height);
    graphHover = { x: mx, y: my };
    drawIntensityGraph();
  });

  cv.addEventListener('mouseleave', () => {
    graphHover = null;
    drawIntensityGraph();
  });

  cv.addEventListener('mousedown', e => {
    if (!graphPinMode) return;
    const r = cv.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (cv.clientWidth / r.width);
    const my = (e.clientY - r.top) * (cv.clientHeight / r.height);
    const layout = graphLayout(cv);

    const estBlanche = sim.lightSource === 'blanche';

    // Reclic sur une épingle existante : on la retire. En mode blanc, une épingle porte
    // plusieurs points (un par couleur cochée, cf. dessinerInfoMultiCourbes) empilés à la
    // même abscisse — la proximité HORIZONTALE seule suffit à l'identifier (comparer aussi
    // en y n'aurait pas de sens univoque, il n'y a plus un seul point). En mono, proximité en
    // PIXELS sur les 2 axes (un point serré horizontalement mais loin verticalement ne doit
    // pas se faire supprimer par erreur).
    const idx = graphPins.findIndex(p => estBlanche
      ? Math.abs(layout.toX(p.x) - mx) <= 8
      : Math.hypot(layout.toX(p.x) - mx, layout.toY(p.I) - my) <= 8);
    if (idx !== -1) {
      graphPins.splice(idx, 1);
    } else {
      const xClick = Math.max(layout.xMin, Math.min(layout.xMax,
        layout.xMin + ((mx - layout.pad.l) / layout.gw) * (layout.xMax - layout.xMin)));
      // Recherche dans le cache (cf. assurerCourbeCalculee) : aucun rééchantillonnage ici,
      // juste une lecture — la courbe mono en cache suffit à retrouver un x sur la grille
      // d'échantillonnage (les positions x sont identiques pour toutes les couleurs/mono à
      // fenêtre donnée, seule l'intensité I diffère).
      assurerCourbeCalculee();
      const p = pointLePlusProche(cachedPtsMono, xClick);
      graphPins.push(estBlanche ? { x: p.x } : { x: p.x, I: p.I });
    }
    drawIntensityGraph();
    e.preventDefault();
  });
}

// ─────────────────────────────────────────────────────────────────────
//  Redimensionnement du canvas graphe (anti-rebond via ui.js).
// ─────────────────────────────────────────────────────────────────────
function resizeGraphCanvas() {
  drawIntensityGraph();
}

// ─────────────────────────────────────────────────────────────────────
//  Dessine, sur l'overlay #graph-lien-overlay (qui recouvre scène 3D + splitter + graphe,
//  cf. index.html/style.css), les pointillés reliant chaque minimum/maximum du graphe à sa
//  position sur la figure affichée en vue Écran. Appelée à chaque frame depuis ui.js →
//  loop() (comme drawIntensityGraph()) : la position/taille des deux canvas (scène,
//  graphe) peut changer à tout moment (redimensionnement, glissement du splitter) sans
//  qu'aucun autre événement ne le signale explicitement, donc pas d'anti-rebond ici — juste
//  un no-op immédiat si le mode est inactif.
//
//  Chaque pointillé est une polyligne en 2 segments dans le repère de l'overlay (partagé
//  par la scène ET le graphe, cf. #lumineuses-area → position:relative) : part de l'axe
//  horizontal y=0 de la vue Écran (hauteur des minima/maxima sur l'écran — pas plus haut,
//  inutile de traverser le fond noir au-dessus/en-dessous de la figure), diagonal à travers
//  le splitter (les deux canvas n'ont pas forcément la même échelle px/m, cf. GRAPH_PAD qui
//  mange une partie de la largeur du graphe), puis vertical dans le graphe (toute la
//  hauteur du tracé, à l'abscisse du point sur la courbe). Un extremum physiquement hors de
//  l'écran (`|x| > sim.screenHalfWidth`) n'est pas tracé, même s'il reste dans le cadre de
//  la caméra (qui peut montrer plus que l'écran lui-même selon le zoom).
// ─────────────────────────────────────────────────────────────────────
function dessinerLienFigure() {
  if (!graphLienMode) return;

  const overlay = document.getElementById('graph-lien-overlay');
  const sceneCanvas = document.getElementById('scene-canvas');
  const graphCanvas = document.getElementById('graph-intensity');
  if (!overlay || !sceneCanvas || !graphCanvas) return;

  const hostRect = overlay.getBoundingClientRect();
  const w = overlay.clientWidth, h = overlay.clientHeight;
  if (w === 0 || h === 0) return;
  const dpr = window.devicePixelRatio || 1;
  if (overlay.width !== Math.round(w * dpr) || overlay.height !== Math.round(h * dpr)) {
    overlay.width = Math.round(w * dpr);
    overlay.height = Math.round(h * dpr);
  }
  const gc = overlay.getContext('2d');
  gc.setTransform(dpr, 0, 0, dpr, 0, 0);
  gc.clearRect(0, 0, w, h);

  const sceneRect = sceneCanvas.getBoundingClientRect();
  const graphRect = graphCanvas.getBoundingClientRect();
  const layout = graphLayout(graphCanvas);
  assurerCourbeCalculee(); // lecture du cache : cette fonction tourne à chaque frame (cf. sa docstring), jamais de rééchantillonnage tant que rien n'a changé
  const extremaBruts = calculerExtrema(cachedPtsMono);
  const { maxima, minima } = limiterExtremaCentraux(extremaBruts.maxima, extremaBruts.minima);

  // Axe horizontal (y=0) de la vue Écran, en repère overlay — toujours le centre vertical
  // exact du canvas scène (caméra ortho symétrique, comme fracXVueEcran pour x=0). Les
  // pointillés s'arrêtent à cette hauteur côté scène (ligne des minima/maxima sur l'écran),
  // au lieu de traverser toute la hauteur du canvas comme avant : inutile de les prolonger
  // dans le fond noir au-dessus/en-dessous de la figure.
  const yAxeScene = sceneRect.top - hostRect.top + sceneRect.height / 2;
  const yGraphTop = graphRect.top - hostRect.top + layout.pad.t;
  const yGraphBot = yGraphTop + layout.gh;

  function tracerLien(x_m, couleur) {
    if (Math.abs(x_m) > sim.screenHalfWidth) return; // extremum physiquement hors de l'écran
    const fracScene = fracXVueEcran(x_m);
    if (fracScene < 0 || fracScene > 1) return; // hors cadre de la vue Écran (zoom, bord)
    const pxScene = sceneRect.left - hostRect.left + fracScene * sceneRect.width;
    const pxGraph = graphRect.left - hostRect.left + layout.toX(x_m);
    gc.save();
    gc.strokeStyle = couleur;
    gc.lineWidth = 1.5;
    gc.setLineDash([5, 4]);
    gc.beginPath();
    gc.moveTo(pxScene, yAxeScene);
    gc.lineTo(pxGraph, yGraphTop);
    gc.lineTo(pxGraph, yGraphBot);
    gc.stroke();
    gc.restore();
  }

  for (const p of minima) tracerLien(p.x, COULEUR_LIEN_MINIMA);
  for (const p of maxima) tracerLien(p.x, COULEUR_LIEN_MAXIMA);

  // ── Légende — À L'INTÉRIEUR du cadre de tracé (coin haut-droit), en retrait de ses bords
  // (marge `retrait`) pour ne jamais chevaucher le cadre lui-même. Superposée à la courbe
  // (comme toute légende de graphique classique), pas dans la marge des axes : élargir
  // cette marge pour l'y loger avait été essayé puis rejeté (rétrécit le cadre de tracé,
  // jugé inesthétique par l'utilisateur).
  const boxW = 108, boxH = 64, retrait = 8;
  const lx = graphRect.left - hostRect.left + layout.pad.l + layout.gw - retrait - boxW;
  const ly = graphRect.top - hostRect.top + layout.pad.t + retrait;
  gc.save();
  gc.fillStyle = 'rgba(255,255,255,0.95)';
  gc.strokeStyle = '#c8c0b4';
  gc.lineWidth = 1;
  gc.fillRect(lx, ly, boxW, boxH);
  gc.strokeRect(lx, ly, boxW, boxH);
  gc.font = 'bold 14px sans-serif';
  gc.textBaseline = 'middle';
  gc.textAlign = 'left';
  const ligne = (y, couleur, texte) => {
    gc.fillStyle = couleur;
    gc.fillRect(lx + 8, y - 3, 16, 5);
    gc.fillStyle = '#2c3e50';
    gc.fillText(texte, lx + 30, y);
  };
  ligne(ly + boxH * 0.32, COULEUR_LIEN_MAXIMA, 'Maxima');
  ligne(ly + boxH * 0.72, COULEUR_LIEN_MINIMA, 'Minima');
  gc.restore();
}
