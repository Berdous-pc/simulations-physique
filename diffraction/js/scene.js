// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
//  scene.js — Scène 3D (Three.js) : banc optique, caméras, écran
//  Dépend de : sim.js, THREE (vendé), THREE.OrbitControls (vendé)
//  Chargé après sim.js, avant graph.js.
// ═══════════════════════════════════════════════════

// ── Géométrie du banc (1 unité Three.js = 1 cm) ──
// Toutes les tailles sont à l'échelle du matériel réel de TP, à la seule exception
// assumée de la largeur de la fente (cf. largeurFenteVisuelle ci-dessous et ARCHITECTURE.md).
const LASER_DIAMETER = 1.5;    // cm — module laser diode de TP
const LASER_LENGTH = 5;        // cm
const SOURCE_Z = -15;          // cm — laser monté proche de la fente, comme sur un vrai banc
const SLIT_Z = 0;
const BEAM_DIAMETER = FAISCEAU_DIAMETRE_MM / 10; // cm — même constante que la physique de divergence (sim.js)
const SLIDE_SIZE = 7;          // cm — lame porte-fente réelle, 7×7 cm
const SLIDE_THICK = 0.2;       // cm — épaisseur réelle d'une lame
const SLIT_BAND_HEIGHT = SLIDE_SIZE * 0.8; // cm — la fente occupe 80% de la hauteur de la lame
const SCREEN_WIDTH = sim.screenHalfWidth * 2 * 100; // = 25 cm, cohérent avec sim.screenHalfWidth
const SCREEN_HEIGHT = 15;      // cm — écran réel de TP, 25×15 cm
const TABLE_Y = -18;            // cm — hauteur du dessus des plateaux de support (sommet de la table)
const PLATEAU_EPAISSEUR = 0.8;  // cm — épaisseur des plateaux de support, cf. creerSupport()
const TABLE_THICK = 2;          // cm — épaisseur de la table
const TABLE_WIDTH = 40;         // cm — largeur de la table (dépasse la largeur de l'écran, 25 cm)
// Longueur de la table calée sur la borne max du slider D (index.html, sl-D max="3") : doit
// être mise à jour si cette borne change, pour que la table s'étende toujours sous l'écran.
const D_MAX_CM = 300;
const LEG_LENGTH = 75;          // cm — hauteur de table classique (pieds table/paillasse)
const LEG_SECTION = 3;          // cm — section carrée des pieds
const FLOOR_Y = TABLE_Y - PLATEAU_EPAISSEUR - TABLE_THICK - LEG_LENGTH; // dessus du sol
const FLOOR_THICK = 3;          // cm
// Rayon minimal de rendu du profil vertical (cm) : en dessous, la texture (résolution
// finie, cf. updateSceneParams) ne peut plus représenter le faisceau proprement — un
// faisceau réel de ~1 mm ne fait souvent qu'1-2 texels de rayon à cette échelle. Même
// compromis que pour la fente elle-même : le rayon RÉEL (largeurFaisceauGaussien) est
// utilisé dès qu'il dépasse ce plancher, donc la divergence avec D reste visible.
const RENDU_W_MIN_CM = 0.2;

// Correspondance a (µm, physique) → largeur visuelle de la fente (cm, schématique).
// Cf. ARCHITECTURE.md : la fente réelle (dixièmes de mm) est invisible à l'échelle
// du banc (mètres) ; elle est donc dessinée agrandie, mais sa valeur RÉELLE
// (sim.a) reste seule utilisée dans les calculs physiques (intensiteFente, etc.).
// Plage resserrée : le maximum correspond à l'ancien minimum (0.4 cm), et le reste de la
// plage est compressé dans la même proportion (facteur 0.4/2.5) pour garder la même forme
// de gradation sur tout le slider. Nécessaire depuis que SLIT_BAND_HEIGHT est passé à 80%
// de la lame (fente beaucoup plus haute) : l'ancienne largeur (jusqu'à 2.5 cm) faisait un
// gros carré au lieu d'une fente fine et haute.
const LARGEUR_FENTE_MAX_CM = 0.4, LARGEUR_FENTE_MIN_CM = 0.4 * (0.4 / 2.5);
function largeurFenteVisuelle(a_um) {
  const t = (a_um - A_MIN) / (A_MAX - A_MIN);
  return LARGEUR_FENTE_MIN_CM + t * (LARGEUR_FENTE_MAX_CM - LARGEUR_FENTE_MIN_CM);
}

// ─────────────────────────────────────────────────────────────────────
//  Support (tige + plateau) pour un élément du banc, posé sur la table
//  virtuelle TABLE_Y. Le sommet de la tige est à l'origine locale (y=0) :
//  positionner le groupe à (x, yBasElement, z) suffit à le faire tenir
//  exactement sous l'élément, sans jamais toucher à sa propre position
//  (l'alignement optique vertical de l'élément reste intact).
// ─────────────────────────────────────────────────────────────────────
function creerSupport(largeurPlateau, profondeurPlateau, longueurTige) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3f46 });

  const tigeRayon = 0.4;
  const tige = new THREE.Mesh(new THREE.CylinderGeometry(tigeRayon, tigeRayon, longueurTige, 12), mat);
  tige.position.y = -longueurTige / 2;
  group.add(tige);

  const plateau = new THREE.Mesh(new THREE.BoxGeometry(largeurPlateau, PLATEAU_EPAISSEUR, profondeurPlateau), mat);
  plateau.position.y = -longueurTige - PLATEAU_EPAISSEUR / 2;
  group.add(plateau);

  return group;
}

let renderer, sceneObj, camPersp, camOrtho, controls, canvasEl;
let laserBody, beamMesh, topBand, bottomBand, wallLeft, wallRight, screenMesh, screenTexture, screenTexCanvas, screenTexCtx;
let raysLine, supportLaser, supportSlide, supportScreen;

// ─────────────────────────────────────────────────────────────────────
//  Initialisation de la scène (appelée une fois par ui.js → init()).
// ─────────────────────────────────────────────────────────────────────
function initScene() {
  canvasEl = document.getElementById('scene-canvas');
  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });

  sceneObj = new THREE.Scene();
  sceneObj.background = new THREE.Color(0x14181d);

  sceneObj.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.55);
  dirLight.position.set(60, 120, -30);
  sceneObj.add(dirLight);

  camPersp = new THREE.PerspectiveCamera(50, 1, 1, 3000);
  camOrtho = new THREE.OrthographicCamera(-50, 50, 50, -50, 1, 3000);

  controls = new THREE.OrbitControls(camPersp, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 8;
  controls.maxDistance = 400; // assez pour voir tout le banc (D_MAX_CM=300) avec marge, sans s'éloigner dans le vide
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minPolarAngle = 0.02;
  // Zoom natif désactivé : remplacé par initZoomVersCurseur() ci-dessous, qui zoome vers
  // l'endroit pointé par la souris (et non vers un pivot fixe) pour permettre d'explorer
  // librement — cf. ARCHITECTURE.md.
  controls.enableZoom = false;

  construireObjets();
  reset3DCamera();
  updateSceneParams();
  initZoomVersCurseur();
}

// ─────────────────────────────────────────────────────────────────────
//  Point de l'axe optique (droite x=0, y=0 — le prolongement du faisceau)
//  le plus proche d'un rayon donné (origine + direction, tous deux en
//  coordonnées monde). Distance minimale entre deux droites : formule
//  standard, cf. https://en.wikipedia.org/wiki/Skew_lines#Distance
//  N'est appelée que hors du mode axial (cf. initZoomVersCurseur ci-dessous),
//  qui écarte déjà les configurations proches de la dégénérescence — le
//  garde-fou ci-dessous n'est qu'une sécurité de dernier recours.
// ─────────────────────────────────────────────────────────────────────
function pointAxeLePlusProche(rayOrigin, rayDir) {
  const d1 = new THREE.Vector3(0, 0, 1); // direction de l'axe optique
  const d2 = rayDir;                     // direction du rayon (normalisée par le raycaster)
  const w0 = rayOrigin.clone().multiplyScalar(-1); // = A0 - R0, avec A0 = origine

  const b = d1.dot(d2);
  const d = d1.dot(w0);
  const e = d2.dot(w0);
  const denom = 1 - b * b; // a = c = 1 (vecteurs unitaires)

  const t = Math.abs(denom) < 1e-3 ? rayOrigin.z : (b * e - d) / denom;
  return new THREE.Vector3(0, 0, t);
}

// ─────────────────────────────────────────────────────────────────────
//  Zoom ancré sur l'axe optique (vue 3D uniquement) : remplace le zoom
//  natif d'OrbitControls, qui zoome toujours vers `controls.target` (un
//  pivot fixe) quel que soit l'endroit pointé par la souris — trop rigide
//  pour explorer librement (il fallait d'abord repositionner le pivot au
//  clic-droit avant de pouvoir zoomer là où on voulait). Ici, la molette
//  zoome vers le point de l'axe optique le plus proche du curseur (tout
//  ce qui compte dans la scène — laser, fente, écran — est sur cet axe,
//  zoomer ailleurs n'a pas d'intérêt), et ce point devient le nouveau
//  centre d'orbite — on peut ensuite tourner librement autour de la zone
//  qu'on vient d'explorer.
//
//  MODE AXIAL : quand la caméra elle-même regarde à peu près le long de
//  l'axe optique (vue en enfilade dans le faisceau), le rayon souris est
//  quasi-parallèle à l'axe quel que soit le pixel visé — chercher "le"
//  point le plus proche devient un calcul mal conditionné (rafistoler la
//  formule ne suffit pas, cf. discussion de conception). On bascule alors
//  sur un dolly classique (avance/recule vers la cible actuelle, sans
//  chercher de point précis) : basé sur l'orientation de la CAMÉRA, pas
//  sur la position du curseur, donc stable et prévisible.
// ─────────────────────────────────────────────────────────────────────
const raycasterZoom = new THREE.Raycaster();
const SEUIL_MODE_AXIAL = 0.95; // |forward·axeZ| au-delà duquel on bascule (~18° de l'axe)

function initZoomVersCurseur() {
  canvasEl.addEventListener('wheel', e => {
    if (sim.view !== '3d') return;
    e.preventDefault();

    const pas = e.deltaY > 0 ? -1 : 1; // molette bas = s'éloigner, molette haut = se rapprocher

    const forward = new THREE.Vector3();
    camPersp.getWorldDirection(forward);

    if (Math.abs(forward.z) > SEUIL_MODE_AXIAL) {
      // Mode axial : pas un zoom (rapprochement d'une cible) mais un coulissement — caméra
      // ET cible avancent du même pas le long du regard, donc leur distance ne change jamais
      // et ne peut pas se faire bloquer par minDistance/maxDistance (qui n'a pas de sens ici,
      // cf. discussion de conception).
      // Translation selon z UNIQUEMENT (jamais selon `forward` complet) : même dans le cône du
      // mode axial, `forward` garde une petite composante x/y qui s'accumulerait à chaque cran
      // de molette et ferait dériver la cible hors de l'axe optique (constaté à l'usage — le
      // coulissement partait vers le sol). Le signe suit le sens de visée de la caméra le long
      // de z, pour que "molette haut" avance toujours dans le sens du regard.
      const PAS_COULISSEMENT_CM = 10;
      const dz = pas * PAS_COULISSEMENT_CM * (forward.z > 0 ? 1 : -1);
      camPersp.position.z += dz;
      controls.target.z += dz;
      // Garde-fou très large (pas une limite de "zoom", juste éviter de sortir de la scène) :
      const zClamp = Math.max(SOURCE_Z - 300, Math.min(D_MAX_CM + 300, controls.target.z));
      if (zClamp !== controls.target.z) {
        const correction = zClamp - controls.target.z;
        camPersp.position.z += correction;
        controls.target.z += correction;
      }
    } else if (pas > 0) {
      // Zoom avant : cherche un nouveau point sous le curseur et plonge dessus (comportement
      // "explorer" d'origine).
      const rect = canvasEl.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycasterZoom.setFromCamera(ndc, camPersp);
      const point = pointAxeLePlusProche(raycasterZoom.ray.origin, raycasterZoom.ray.direction);

      const t = 0.15;
      camPersp.position.lerp(point, t);
      controls.target.lerp(point, t);
    } else {
      // Zoom arrière : ne cherche PAS de nouveau point (inutile de "viser" quelque chose en
      // reculant) — s'éloigne simplement de la cible actuelle, ET recentre progressivement la
      // cible vers le milieu de la scène. Sans ce recentrage, après avoir zoomé sur une
      // extrémité (ex. la fente), le pivot de rotation restait figé là-bas même une fois
      // dézoomé — contre-intuitif : on s'attend à retrouver un pivot proche du centre de la
      // scène en dézoomant suffisamment (constaté à l'usage).
      const D_cm = sim.D * 100;
      const centreZ = (SOURCE_Z + D_cm) / 2;
      const oldTarget = controls.target.clone();
      const dir = camPersp.position.clone().sub(oldTarget).multiplyScalar(1.15);

      controls.target.z += (centreZ - oldTarget.z) * 0.12;
      camPersp.position.copy(controls.target).add(dir);
    }

    // Respecte minDistance/maxDistance comme le ferait le zoom natif
    const dir = new THREE.Vector3().subVectors(camPersp.position, controls.target);
    const dist = dir.length();
    const clamped = Math.max(controls.minDistance, Math.min(controls.maxDistance, dist));
    if (clamped !== dist) {
      dir.setLength(clamped);
      camPersp.position.copy(controls.target).add(dir);
    }
    controls.update();
  }, { passive: false });
}

// ─────────────────────────────────────────────────────────────────────
//  Construit les objets 3D fixes du banc optique (une seule fois).
// ─────────────────────────────────────────────────────────────────────
function construireObjets() {
  // Table : plan fixe sous tous les plateaux de support, du laser jusqu'au-delà de la
  // position d'écran la plus éloignée (D_MAX_CM) — longueur fixe, ne dépend pas de D
  // courant (la table ne rétrécit pas quand on rapproche l'écran, comme une vraie table).
  const tableZStart = SOURCE_Z - LASER_LENGTH - 5;
  const tableZEnd = D_MAX_CM + 10;
  const table = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE_WIDTH, TABLE_THICK, tableZEnd - tableZStart),
    new THREE.MeshStandardMaterial({ color: 0x5a4632 })
  );
  table.position.set(0, TABLE_Y - PLATEAU_EPAISSEUR - TABLE_THICK / 2, (tableZStart + tableZEnd) / 2);
  sceneObj.add(table);

  // Pieds de table : 3 paires (début / milieu / fin), du dessous de la table jusqu'au sol.
  // Insertion légèrement en retrait des bords (esthétique, comme une vraie table).
  const tableUnderY = TABLE_Y - PLATEAU_EPAISSEUR - TABLE_THICK;
  const legMat = new THREE.MeshStandardMaterial({ color: 0x3a2e20 });
  const legX = TABLE_WIDTH / 2 - LEG_SECTION;
  const legZs = [tableZStart + 15, (tableZStart + tableZEnd) / 2, tableZEnd - 15];
  for (const lz of legZs) {
    for (const lx of [-legX, legX]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(LEG_SECTION, LEG_LENGTH, LEG_SECTION),
        legMat
      );
      leg.position.set(lx, tableUnderY - LEG_LENGTH / 2, lz);
      sceneObj.add(leg);
    }
  }

  // Sol : grand plan sous toute la scène, dépasse largement la table.
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(500, FLOOR_THICK, (tableZEnd - tableZStart) + 300),
    new THREE.MeshStandardMaterial({ color: 0x33383e })
  );
  floor.position.set(0, FLOOR_Y - FLOOR_THICK / 2, (tableZStart + tableZEnd) / 2);
  sceneObj.add(floor);

  // Source laser : module cylindrique (Ø 1,5 cm, longueur 5 cm), calé juste derrière le
  // point de départ du faisceau (dimensions choisies cohérentes avec un module de TP réel).
  laserBody = new THREE.Mesh(
    new THREE.CylinderGeometry(LASER_DIAMETER / 2, LASER_DIAMETER / 2, LASER_LENGTH, 20),
    new THREE.MeshStandardMaterial({ color: 0x2a2f36 })
  );
  laserBody.rotation.x = Math.PI / 2;
  laserBody.position.set(0, 0, SOURCE_Z - LASER_LENGTH / 2);
  sceneObj.add(laserBody);

  supportLaser = creerSupport(4, 3, -LASER_DIAMETER / 2 - TABLE_Y);
  supportLaser.position.set(0, -LASER_DIAMETER / 2, SOURCE_Z - LASER_LENGTH / 2);
  sceneObj.add(supportLaser);

  // Faisceau avant la fente (matériau auto-éclairé, comme un vrai laser) — diamètre réel 1 mm.
  const beamGeo = new THREE.CylinderGeometry(BEAM_DIAMETER / 2, BEAM_DIAMETER / 2, SLIT_Z - SOURCE_Z, 12);
  beamGeo.rotateX(Math.PI / 2);
  beamMesh = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
  beamMesh.position.set(0, 0, (SOURCE_Z + SLIT_Z) / 2);
  sceneObj.add(beamMesh);

  // Lame porte-fente (7×7 cm réels) : 3 bandes pleines (haut/bas) + 2 murs latéraux
  // encadrant la fente, tous confinés à une bande centrale de hauteur SLIT_BAND_HEIGHT
  // (la fente n'occupe pas toute la hauteur de la lame). Pas de CSG : la "fente" est
  // simplement l'espace laissé vide entre les deux murs latéraux.
  const slideMat = new THREE.MeshStandardMaterial({ color: 0x555a60 });
  const marginBandH = (SLIDE_SIZE - SLIT_BAND_HEIGHT) / 2;

  topBand = new THREE.Mesh(new THREE.BoxGeometry(SLIDE_SIZE, marginBandH, SLIDE_THICK), slideMat);
  topBand.position.set(0, SLIT_BAND_HEIGHT / 2 + marginBandH / 2, SLIT_Z);
  sceneObj.add(topBand);

  bottomBand = new THREE.Mesh(new THREE.BoxGeometry(SLIDE_SIZE, marginBandH, SLIDE_THICK), slideMat);
  bottomBand.position.set(0, -(SLIT_BAND_HEIGHT / 2 + marginBandH / 2), SLIT_Z);
  sceneObj.add(bottomBand);

  // Murs latéraux de la fente (géométrie unitaire mise à l'échelle, cf. updateSceneParams)
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  wallLeft = new THREE.Mesh(wallGeo, slideMat);
  wallRight = new THREE.Mesh(wallGeo, slideMat);
  sceneObj.add(wallLeft, wallRight);

  supportSlide = creerSupport(SLIDE_SIZE + 2, 3, -SLIDE_SIZE / 2 - TABLE_Y);
  supportSlide.position.set(0, -SLIDE_SIZE / 2, SLIT_Z);
  sceneObj.add(supportSlide);

  // Écran : plan recevant la texture d'intensité (générée par sim.js → echantillonnerIntensite).
  // Le buffer de la texture garde le même ratio largeur/hauteur que le plan physique
  // (SCREEN_WIDTH/SCREEN_HEIGHT) : sinon chaque texel correspond à un rectangle physique
  // non carré une fois étiré sur le plan, ce qui déforme tout profil vertical dessiné dedans
  // (cf. discussion de conception — le profil gaussien SIGMA_Y ressortait écrasé verticalement).
  screenTexCanvas = document.createElement('canvas');
  screenTexCanvas.width = 512;
  screenTexCanvas.height = Math.round(512 * SCREEN_HEIGHT / SCREEN_WIDTH);
  screenTexCtx = screenTexCanvas.getContext('2d');
  screenTexture = new THREE.CanvasTexture(screenTexCanvas);

  screenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT),
    new THREE.MeshBasicMaterial({ map: screenTexture, side: THREE.DoubleSide })
  );
  sceneObj.add(screenMesh);

  // Cadre discret autour de l'écran (repère visuel), léger décalage local en z
  // pour éviter le z-fighting avec la texture du plan parent.
  const frameEdges = new THREE.EdgesGeometry(new THREE.PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT));
  const frame = new THREE.LineSegments(frameEdges, new THREE.LineBasicMaterial({ color: 0x5a6a78 }));
  screenMesh.add(frame);
  frame.position.set(0, 0, 0.05);

  // Support de l'écran : repositionné en z dans updateSceneParams() (D réglable), x/y fixes
  supportScreen = creerSupport(SCREEN_WIDTH * 0.4, 5, -SCREEN_HEIGHT / 2 - TABLE_Y);
  supportScreen.position.set(0, -SCREEN_HEIGHT / 2, 0);
  sceneObj.add(supportScreen);

  // Rayons pointillés vers les 1ers minima
  const rayGeo = new THREE.BufferGeometry();
  rayGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(12).fill(0), 3));
  const rayMat = new THREE.LineDashedMaterial({ color: 0xffcc66, dashSize: 2.2, gapSize: 1.4, transparent: true, opacity: 0.85 });
  raysLine = new THREE.LineSegments(rayGeo, rayMat);
  sceneObj.add(raysLine);
}

// ─────────────────────────────────────────────────────────────────────
//  Met à jour tous les objets 3D suite à un changement de λ, a, D ou
//  de l'option "rayons". Appelée par ui.js → updateParam()/toggleRays().
// ─────────────────────────────────────────────────────────────────────
function updateSceneParams() {
  const D_cm = sim.D * 100;
  const couleurHex = longueurOndeVersHex(sim.lambda);

  // Faisceau : couleur selon λ
  beamMesh.material.color.setHex(couleurHex);

  // Fente : écartement des murs selon a (largeur visuelle schématique), confinés à la
  // bande centrale de la lame (cf. construireObjets)
  const gap = largeurFenteVisuelle(sim.a);
  const wallW = (SLIDE_SIZE - gap) / 2;
  wallLeft.scale.set(wallW, SLIT_BAND_HEIGHT, SLIDE_THICK);
  wallLeft.position.set(-(gap / 2 + wallW / 2), 0, SLIT_Z);
  wallRight.scale.set(wallW, SLIT_BAND_HEIGHT, SLIDE_THICK);
  wallRight.position.set(gap / 2 + wallW / 2, 0, SLIT_Z);

  // Écran : position selon D (le support suit en z uniquement — x/y jamais touchés,
  // pour ne pas casser l'alignement optique vertical)
  screenMesh.position.set(0, 0, D_cm);
  supportScreen.position.z = D_cm;

  // Texture d'intensité (source physique unique : echantillonnerIntensite, cf. sim.js).
  // I(x) (horizontal) vient de la vraie diffraction par la fente. La fente n'a pas de
  // hauteur réglable dans ce modèle (approximation "fente infinie" en y, cf. sim.js) ;
  // le profil VERTICAL affiché n'est donc pas calculé — c'est un profil gaussien fixe,
  // représentant la hauteur du faisceau laser d'origine (non affectée par la fente, qui
  // ne diffracte qu'horizontalement). Identique pour l'ordre central et les ordres
  // secondaires, comme sur une vraie photo de diffraction (cf. discussion de conception) :
  // sans lui, la figure ressemble à des bandes verticales infinies au lieu de taches.
  const w = screenTexCanvas.width, h = screenTexCanvas.height;
  const img = screenTexCtx.createImageData(w, h);
  const { r: r0, g: g0, b: b0 } = longueurOndeVersRGB(sim.lambda);
  const x1_cm = xPremierMinimum(sim.lambda, sim.a, sim.D) * 100;

  // Profil vertical = divergence réelle du faisceau gaussien (largeurFaisceauGaussien,
  // cf. sim.js — même physique que la diffraction par la fente, appliquée cette fois au
  // faisceau lui-même). w = rayon à distance D, en cm ; plancher RENDU_W_MIN_CM car la
  // texture (résolution finie) ne peut pas résoudre un faisceau de l'ordre du mm sans
  // buffer démesurément grand — la divergence avec D reste visible dès que w dépasse ce
  // plancher (cf. commentaire de RENDU_W_MIN_CM ci-dessus).
  const w_cm = Math.max(RENDU_W_MIN_CM, largeurFaisceauGaussien(sim.lambda, sim.D) * 100);
  for (let px = 0; px < w; px++) {
    const x = -sim.screenHalfWidth + (2 * sim.screenHalfWidth * px) / (w - 1);
    const Ix = intensiteFente(x, sim.lambda, sim.a, sim.D);
    // Les ordres secondaires sont physiquement très faibles (1er ≈ 4,5 % du maximum central,
    // cf. sinc²) : en couleur linéaire ils sont quasi invisibles à l'écran. On applique une
    // racine carrée uniquement ici (affichage), jamais dans intensiteFente() ni dans le
    // graphe I(x) qui doivent rester l'intensité physique exacte, sans quoi une lecture
    // quantitative sur le graphe serait faussée.
    const IxAffichage = Math.sqrt(Ix);
    for (let py = 0; py < h; py++) {
      const y_cm = -SCREEN_HEIGHT / 2 + (SCREEN_HEIGHT * py) / (h - 1); // position physique verticale (cm)
      const Iy = Math.exp(-2 * y_cm * y_cm / (w_cm * w_cm)); // profil gaussien standard (convention laser : I(r)=I0·exp(-2r²/w²))
      const I = IxAffichage * Iy;
      const r = Math.round(r0 * I), g = Math.round(g0 * I), b = Math.round(b0 * I);
      const idx = (py * w + px) * 4;
      img.data[idx] = r; img.data[idx + 1] = g; img.data[idx + 2] = b; img.data[idx + 3] = 255;
    }
  }
  screenTexCtx.putImageData(img, 0, 0);
  screenTexture.needsUpdate = true;

  // Rayons vers les 1ers minima — masqués en vue Écran : une caméra orthographique de face
  // ne représente pas la profondeur, donc les deux rayons s'y aplatissent en un simple trait
  // horizontal (start et fin à même x,y projetés) qui n'apporte rien dans cette vue précise.
  raysLine.visible = sim.showRays && sim.view !== 'screen';
  raysLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, SLIT_Z,  x1_cm, 0, D_cm,
    0, 0, SLIT_Z, -x1_cm, 0, D_cm
  ], 3));
  raysLine.computeLineDistances();
}

// ─────────────────────────────────────────────────────────────────────
//  Bascule la vue caméra active. Appelée par ui.js → setView().
// ─────────────────────────────────────────────────────────────────────
function setSceneView(view) {
  sim.view = view;
  controls.enabled = (view === '3d');
  const cacherBanc = (view === 'screen');
  laserBody.visible = !cacherBanc;
  beamMesh.visible = !cacherBanc;
  topBand.visible = !cacherBanc;
  bottomBand.visible = !cacherBanc;
  wallLeft.visible = !cacherBanc;
  wallRight.visible = !cacherBanc;
  supportLaser.visible = !cacherBanc;
  supportSlide.visible = !cacherBanc;
  raysLine.visible = sim.showRays && view !== 'screen';
}

// ─────────────────────────────────────────────────────────────────────
//  Repositionne la caméra 3D (perspective) sur son cadrage par défaut.
// ─────────────────────────────────────────────────────────────────────
function reset3DCamera() {
  const D_cm = sim.D * 100;
  const zTarget = D_cm * 0.25;
  camPersp.position.set(40, 28, SOURCE_Z - 30);
  controls.target.set(0, 1, zTarget);
  controls.update();
}

// ─────────────────────────────────────────────────────────────────────
//  Recadre la caméra orthographique (Dessus / Profil / Écran) sur le
//  banc courant. Appelée à chaque frame tant qu'une de ces vues est
//  active, pour rester juste si D change entre-temps (cf. ARCHITECTURE.md).
// ─────────────────────────────────────────────────────────────────────
function updateOrthoCamera(aspect) {
  const D_cm = sim.D * 100;
  const zCenter = (SOURCE_Z + D_cm) / 2;
  const halfSpanZ = (D_cm - SOURCE_Z) / 2 * 1.15;

  if (sim.view === 'top') {
    camOrtho.position.set(0, 500, zCenter);
    camOrtho.up.set(0, 0, -1);
    camOrtho.lookAt(0, 0, zCenter);
    fitOrtho(camOrtho, SCREEN_WIDTH / 2 * 1.3, halfSpanZ, aspect);
  } else if (sim.view === 'side') {
    camOrtho.position.set(-500, 0, zCenter);
    camOrtho.up.set(0, 1, 0);
    camOrtho.lookAt(0, 0, zCenter);
    fitOrtho(camOrtho, halfSpanZ, SCREEN_HEIGHT / 2 * 1.3, aspect);
  } else if (sim.view === 'screen') {
    camOrtho.position.set(0, 0, SOURCE_Z - 300);
    camOrtho.up.set(0, 1, 0);
    camOrtho.lookAt(0, 0, D_cm);
    fitOrtho(camOrtho, SCREEN_WIDTH / 2 * 1.08, SCREEN_HEIGHT / 2 * 1.08, aspect);
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Ajuste left/right/top/bottom d'une caméra ortho pour contenir un
//  rectangle de demi-largeur/demi-hauteur données, quel que soit l'aspect
//  du canvas ("contain" — aucune des deux dimensions n'est jamais coupée).
// ─────────────────────────────────────────────────────────────────────
function fitOrtho(cam, worldHalfW, worldHalfH, aspect) {
  if (worldHalfW / worldHalfH > aspect) {
    cam.left = -worldHalfW; cam.right = worldHalfW;
    cam.top = worldHalfW / aspect; cam.bottom = -worldHalfW / aspect;
  } else {
    cam.top = worldHalfH; cam.bottom = -worldHalfH;
    cam.left = -worldHalfH * aspect; cam.right = worldHalfH * aspect;
  }
  cam.updateProjectionMatrix();
}

// ─────────────────────────────────────────────────────────────────────
//  Redimensionnement (appelé par ui.js sur resize, avec anti-rebond).
// ─────────────────────────────────────────────────────────────────────
function resizeScene() {
  const area = document.getElementById('scene-area');
  const w = area.clientWidth, h = area.clientHeight;
  if (w === 0 || h === 0) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  camPersp.aspect = w / h;
  camPersp.updateProjectionMatrix();
  updateOrthoCamera(w / h);
}

// ─────────────────────────────────────────────────────────────────────
//  Rendu d'une frame (appelé depuis la boucle d'animation de ui.js).
// ─────────────────────────────────────────────────────────────────────
function renderScene() {
  if (sim.view === '3d') {
    controls.update();
    renderer.render(sceneObj, camPersp);
  } else {
    const aspect = canvasEl.clientWidth / canvasEl.clientHeight;
    updateOrthoCamera(aspect);
    renderer.render(sceneObj, camOrtho);
  }
}
