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
// Distance fente-écran (cm) en dessous de laquelle le cadrage des vues Dessus/Profil
// (updateOrthoCamera) cesse de se resserrer : au-delà, réduire D ne fait que rapprocher
// l'écran dans un cadre fixe, plutôt que de zoomer sur tout le banc — cf. commentaire à
// updateOrthoCamera.
const D_CADRAGE_MIN_CM = 140;

// Zoom (molette) de la vue Écran, centré sur le centre de l'écran (0,0) — jamais sur le
// curseur, demande explicite de l'utilisateur (contrairement au zoom-vers-curseur de la
// vue 3D, cf. initZoomVersCurseur). 1 = cadrage par défaut (écran entier + marge), plus
// grand = zoom avant. Le graphe I(x) (graph.js) se recale sur la même plage physique
// visible à chaque changement (cf. syncGraphAvecVueEcran), pour que la courbe coïncide
// toujours avec les taches affichées sur l'écran.
let screenViewZoom = 1;
const SCREEN_VIEW_ZOOM_MIN = 1, SCREEN_VIEW_ZOOM_MAX = 15;
const BEAM_DIAMETER = FAISCEAU_DIAMETRE_MM / 10; // cm — même constante que la physique de divergence (sim.js)
const SLIDE_SIZE = 7;          // cm — lame porte-fente réelle, 7×7 cm
const SLIDE_THICK = 0.2;       // cm — épaisseur réelle d'une lame
// cm — hauteur réelle de la fente : reprend FENTE_HAUTEUR_CM (sim.js), source unique désormais
// utilisée aussi par la physique (construireChampOuverture) — plus une simple proportion
// esthétique de SLIDE_SIZE, une vraie grandeur physique partagée entre rendu et calcul.
const SLIT_BAND_HEIGHT = FENTE_HAUTEUR_CM;
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

// Facteur d'exagération du plancher d'opacité (cf. uXLimiteExagere/envMat) EN VUE DE DESSUS
// uniquement : cette vue doit englober tout le banc (jusqu'à ~2 m), ce qui écrase la
// largeur physique réelle de la tache (souvent <2 cm) à 1-2 px — invisible. Comme pour
// RENDU_W_MIN_CM, la vraie valeur physique (x1_cm) reste utilisée pour la géométrie et
// pour les autres vues (profil/écran/3D) ; seule la LARGEUR DU PLANCHER affichée en vue
// de dessus est agrandie, plafonnée pour ne jamais dépasser l'écran lui-même — ET
// seulement sur les tous premiers cm après la fente (cf. TOP_VIEW_FLARE_LONGUEUR_CM),
// pas sur toute la longueur fente→écran : demande explicite de l'utilisateur, qui ne
// voulait pas d'un faisceau élargi sur tout le banc, seulement un « éclatement » visible
// juste à la sortie de la fente (l'échelle de son support), le reste du trajet gardant
// la largeur réelle (fine, cf. discussion de conception initiale sur uPlancherAlpha).
const TOP_VIEW_PLANCHER_GAIN = 6;
const TOP_VIEW_FLARE_LONGUEUR_CM = SLIDE_SIZE; // ≈ taille de la lame porte-fente/son support

let x1CmCourant = 0; // dernière valeur physique (cf. updateSceneParams), réutilisée par updateEnvelopeXLimite() sur simple changement de vue

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

// Résolution de l'enveloppe, dans ses 3 directions :
//  - N : échantillons de I(x) le long de l'écran — c'est la direction où sinc² oscille,
//    besoin de finesse pour résoudre les franges les plus étroites.
//  - M : échantillons du profil gaussien vertical Iy — une seule bosse lisse, besoin de
//    bien moins de points.
//  - K : couches intermédiaires en profondeur (z, de la fente à l'écran) des nappes
//    dessus/dessous, cf. construireGeometrieEnveloppe — sans elles l'enveloppe n'a de
//    matière qu'à ses deux extrémités et paraît creuse vue de biais (constaté en vue
//    Profil, cf. discussion de conception : deux traits fins avec du vide entre les deux,
//    au lieu d'un faisceau qui paraît plein).
// Sommets reliés par des triangles à couleur ET position interpolées.
const ENVELOPPE_N_TRANCHES = 240;
const ENVELOPPE_M_TRANCHES = 12;
const ENVELOPPE_K_COUCHES = 6;

// Exposant de compression de la LUMINOSITÉ affichée de l'enveloppe 3D (distinct de la
// racine carrée — exposant 0.5 — utilisée pour la texture d'écran et pour la géométrie de
// l'enveloppe elle-même, cf. ixGeomCol/ixLumCol dans construireGeometrieEnveloppe) : plus
// grand que 0.5, pour que les taches secondaires restent visibles en silhouette (géométrie
// inchangée) mais paraissent beaucoup moins lumineuses que la tache centrale — demande
// explicite de l'utilisateur, qui ne voulait PAS ce changement sur la texture d'écran.
const ENVELOPPE_GAMMA_LUMINOSITE = 1.6;

// ─────────────────────────────────────────────────────────────────────
//  Géométrie complète de l'enveloppe du faisceau diffracté : UN seul maillage continu
//  (pas de « coins » indépendants par tache, pas de parois internes) formé de :
//   - une nappe « côté écran » (grille (x,y) complète à z=zFar, cf. grilleFar ci-dessous) —
//     porte tout le détail de la figure de diffraction (silhouette + dégradé, cf. ci-dessous) ;
//   - un « ruban » en profondeur (loft, cf. rubans ci-dessous) POUR CHAQUE rangée y (j=0..M),
//     pas seulement les deux bords haut/bas — cf. discussion de conception : une première
//     version ne rubanait que j=0 et j=M ; en vue Profil (qui aplatit x, la seule direction
//     où la nappe écran a une épaisseur), tout l'intérieur de la grille — y compris son
//     centre, le plus lumineux — restait plat à z=zFar et donc invisible par la tranche,
//     laissant un creux exactement là où on attend le plus de matière. Un ruban par rangée
//     élimine ce creux : à chaque hauteur y, il y a désormais une vraie surface qui va de la
//     fente à l'écran, pas seulement un point qui saute directement à un plan.
//
//  Sommets PARTAGÉS entre triangles adjacents (géométrie indexée) plutôt qu'un solide
//  dupliqué par échantillon (version antérieure) : évite toute paroi latérale interne —
//  cause du rendu « en tuyaux d'orgue » constaté (deux parois quasi coïncidentes à chaque
//  frontière s'additionnaient en opacité, cf. discussion de conception).
//
//  Double codage de l'intensité, x ET y (un vrai cône dont la base épouse la silhouette de
//  la tache, pas un volume à section constante peint d'un dégradé) :
//   - GÉOMÉTRIE : à l'écran, la demi-hauteur de la grille à l'abscisse x est proportionnelle
//     à √I(x) — elle pince à une largeur nulle exactement aux minima (I=0 : zéro physique
//     exact, pas une approximation visuelle) et se renfle à chaque maximum, y compris les
//     secondaires, sans énumérer les ordres un par un. Chaque ruban interpole linéairement
//     x et y entre le sommet-arête propre à sa rangée (côté fente, x=0) et sa position réelle
//     côté écran, comme un vrai tronc de cône.
//   - COULEUR de sommet (lue comme alpha par le shader, cf. updateSceneParams) : à
//     l'intérieur de cette silhouette, dégradé bidimensionnel √I(x)·Iy(y) — Iy = même
//     profil gaussien réel que la texture d'écran (largeurFaisceauGaussien, cf. sim.js),
//     évalué à la position y physique réelle. Les deux se renforcent : le faisceau devient
//     à la fois plus fin ET plus terne vers un minimum, plus large ET plus lumineux à un
//     maximum. Le long de z, la couleur de chaque ruban interpole aussi entre le sommet-arête
//     (couleur max, schématique — le faisceau encore non « étalé » juste à la sortie de la
//     fente) et l'intensité réelle côté écran : la figure se dessine progressivement vers
//     l'écran.
//
//  Reconstruite à chaque changement de paramètre (cf. updateSceneParams) : la forme dépend
//  de λ/a/D dans son ensemble, pas de simple mise à l'échelle possible d'une géométrie
//  unitaire.
//
//  I(x) ci-dessus vient de `champ` (paramètre, cf. appelant), construit par
//  construireChampOuverture() → FFT — PAS de intensiteFente() directement (celle-ci reste
//  réservée au graphe et aux encarts, cf. discussion de conception). Les deux sources
//  coïncident pour une fente (mêmes minima/maxima), mais seule celle-ci (le champ FFT) sera
//  concernée le jour où la forme de l'ouverture changera.
// ─────────────────────────────────────────────────────────────────────
function construireGeometrieEnveloppe(zNear, zFar, hNear, wMax, champ) {
  const n = ENVELOPPE_N_TRANCHES, m = ENVELOPPE_M_TRANCHES, kMax = ENVELOPPE_K_COUCHES;
  const halfW = sim.screenHalfWidth; // m — même étendue physique que la texture d'écran
  // xFars[k] = abscisse à l'écran (fixe, non tapée) du rayon auquel appartient le sommet
  // d'indice k — sert au shader (cf. construireObjets) à savoir si CE rayon appartient à la
  // tache centrale, indépendamment de sa position tapée courante (qui, elle, tend vers 0 pour
  // TOUS les rayons près de la fente — cf. discussion de conception).
  const positions = [], colors = [], xFars = [], indices = [];

  // Par colonne (x) : position, facteur géométrique (racine carrée, cf. commentaire plus bas),
  // facteur de LUMINOSITÉ (plus compressif, cf. ENVELOPPE_GAMMA_LUMINOSITE) et demi-hauteur
  // cible côté écran — calculés une fois, réutilisés à la fois par la grille écran et par les
  // rubans de chaque rangée.
  const xCm = new Array(n + 1), ixGeomCol = new Array(n + 1), ixLumCol = new Array(n + 1), halfHFar = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const x_m = -halfW + (2 * halfW * i) / n;
    xCm[i] = x_m * 100;
    const Ix = echantillonnerChamp(champ, x_m, 0); // y=0 : cf. commentaire à l'appel dans updateSceneParams
    // Racine carrée, même compression que la texture d'écran (cf. updateSceneParams) — sert
    // ICI uniquement à la GÉOMÉTRIE (largeur de la silhouette, cf. halfHFar) : sans elle les
    // taches secondaires seraient géométriquement invisibles (silhouette collée à l'axe).
    ixGeomCol[i] = Math.sqrt(Ix);
    halfHFar[i] = wMax * ixGeomCol[i]; // pince à 0 aux minima, max=wMax au centre (Ix=1)
    // Luminosité affichée de l'ENVELOPPE (pas la texture d'écran, cf. discussion de
    // conception) : exposant plus dur que la racine carrée — la silhouette reste visible
    // (ci-dessus) mais l'éclat retombe beaucoup plus vite en s'éloignant du centre, pour ne
    // pas donner l'impression que les taches secondaires sont presque aussi lumineuses que la
    // tache centrale.
    ixLumCol[i] = Math.pow(Ix, ENVELOPPE_GAMMA_LUMINOSITE);
  }

  // Grille complète côté écran (z=zFar) : dégradé vertical Iy réel en plus du dégradé
  // horizontal (double codage, cf. commentaire à la construction) — Iy s'applique à la
  // luminosité (ixLumCol), pas à la géométrie (déjà fixée par halfHFar/ixGeomCol ci-dessus).
  const grilleFar = [];
  for (let i = 0; i <= n; i++) {
    const halfH = halfHFar[i];
    const col = new Array(m + 1);
    for (let j = 0; j <= m; j++) {
      const y_cm = halfH === 0 ? 0 : -halfH + (2 * halfH * j) / m;
      // Profil gaussien réel (même formule que le profil vertical de la texture d'écran,
      // cf. updateSceneParams), évalué à la position y physique réelle — indépendant du
      // fait que la plage y explorée ici soit compressée par ixGeomCol[i].
      const Iy = Math.exp(-2 * y_cm * y_cm / (wMax * wMax));
      const intensite = ixLumCol[i] * Iy;
      col[j] = positions.length / 3;
      positions.push(xCm[i], y_cm, zFar);
      colors.push(intensite, intensite, intensite);
      xFars.push(xCm[i]);
    }
    grilleFar.push(col);
  }

  // Nappe côté écran : grille n×m, chaque quad (2 triangles) entre colonnes/rangées
  // adjacentes — couleur ET position interpolées par le GPU dans les deux directions.
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const a = grilleFar[i][j], b = grilleFar[i + 1][j], c = grilleFar[i + 1][j + 1], d = grilleFar[i][j + 1];
      indices.push(a, b, c);
      indices.push(a, c, d);
    }
  }

  // Un ruban en profondeur PAR RANGÉE (j=0..m, pas seulement j=0 et j=m — cf. commentaire à
  // la construction) : couche 0 côté fente (x=0, y=yNear(j)), couche kMax = contour de la
  // grille écran à cette rangée (réutilise directement ses sommets, aucune couture). La
  // POSITION interpole linéairement entre les deux (taper géométrique, tronc de cône) ; la
  // COULEUR de chaque rayon (i,j) reste en revanche CONSTANTE sur toute sa longueur, égale à
  // sa valeur réelle côté écran — PAS un fondu depuis un blanc plein à la fente. Une première
  // version démarrait à luminosité max près de la fente (schématique, « pas encore diffracté »)
  // puis s'éteignait progressivement vers l'écran : à géométrie partagée entre colonnes, ce
  // fondu maintenait TOUTES les colonnes (y compris les rayons de taches secondaires, censés
  // être ternes) proches du blanc sur une grande partie de la longueur — d'où un faisceau bien
  // trop lumineux à sa base (cf. discussion de conception). Couleur constante = chaque rayon
  // affiche sa vraie luminosité dès le départ, pas seulement une fois arrivé à l'écran.
  // couchesParRangee[j] est conservé (pas juste utilisé puis jeté) : la passe de connectivité Y
  // ci-dessous en a besoin pour relier les rangées entre elles (cf. commentaire à cette passe).
  const couchesParRangee = [];
  for (let j = 0; j <= m; j++) {
    const yNear = -hNear / 2 + (hNear * j) / m;
    const couches = [];
    for (let couche = 0; couche < kMax; couche++) {
      const t = couche / kMax;
      const z = zNear + (zFar - zNear) * t;
      const ligne = new Array(n + 1);
      for (let i = 0; i <= n; i++) {
        const idxFar = grilleFar[i][j];
        const yFar = positions[idxFar * 3 + 1];
        const intensiteFarIJ = colors[idxFar * 3];
        ligne[i] = positions.length / 3;
        positions.push(xCm[i] * t, yNear + (yFar - yNear) * t, z);
        colors.push(intensiteFarIJ, intensiteFarIJ, intensiteFarIJ);
        xFars.push(xCm[i]);
      }
      couches.push(ligne);
    }
    couches.push(grilleFar.map(col => col[j]));
    couchesParRangee.push(couches);

    // Connectivité X : le long d'un même rayon (rangée j fixée), entre colonnes adjacentes.
    for (let couche = 0; couche < kMax; couche++) {
      for (let i = 0; i < n; i++) {
        const a = couches[couche][i], b = couches[couche][i + 1];
        const c = couches[couche + 1][i + 1], d = couches[couche + 1][i];
        indices.push(a, b, c);
        indices.push(a, c, d);
      }
    }
  }

  // Connectivité Y : entre rangées adjacentes (j et j+1), à chaque colonne ET chaque couche de
  // profondeur (sauf la dernière, déjà couverte par la nappe côté écran) — sans cette passe,
  // seule la nappe écran (plate, à z=zFar) reliait les rangées entre elles : le long du reste du
  // trajet fente→écran, les rangées n'étaient que des rubans indépendants avec du vide entre eux
  // — visible en vue Profil comme des traits fins séparés plutôt qu'un faisceau plein (cf.
  // discussion de conception). Combiné au plancher d'opacité désormais restreint à un petit
  // nombre de colonnes centrales (cf. construireObjets → uXLimite), cette connectivité est ce qui
  // permet à cette zone étroite de rester visible comme une petite surface continue plutôt que de
  // se disperser en fils déconnectés. Aucun nouveau sommet nécessaire : ne référence que ceux déjà
  // construits ci-dessus (couchesParRangee).
  for (let j = 0; j < m; j++) {
    const couchesJ = couchesParRangee[j], couchesJ1 = couchesParRangee[j + 1];
    for (let couche = 0; couche < kMax; couche++) {
      for (let i = 0; i <= n; i++) {
        const a = couchesJ[couche][i], b = couchesJ1[couche][i];
        const c = couchesJ1[couche + 1][i], d = couchesJ[couche + 1][i];
        indices.push(a, b, c);
        indices.push(a, c, d);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('aXFar', new THREE.Float32BufferAttribute(xFars, 1));
  geo.setIndex(indices);
  return geo;
}

let renderer, sceneObj, camPersp, camOrtho, controls, canvasEl;
let laserBody, beamMesh, beamEnvelopeMesh, beamDot, topBand, bottomBand, wallLeft, wallRight, screenMesh, screenTexture, screenTexCanvas, screenTexCtx;
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
    if (sim.view === 'screen') {
      e.preventDefault();
      const facteur = e.deltaY > 0 ? 1 / 1.2 : 1.2; // bas = dézoome, haut = zoome
      screenViewZoom = Math.max(SCREEN_VIEW_ZOOM_MIN, Math.min(SCREEN_VIEW_ZOOM_MAX, screenViewZoom * facteur));
      syncGraphAvecVueEcran();
      return;
    }
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
      // coulissement partait vers le sol). Le signe utilise la relation caméra→cible actuelle
      // (Math.sign(target.z - position.z)), pas forward.z : cette dernière vient du quaternion
      // de la caméra, une source indirecte qui pouvait donner un signe incohérent près du seuil
      // de bascule (constaté à l'usage — "molette haut" reculait parfois au lieu d'avancer). La
      // relation caméra→cible est la même que celle déjà utilisée pour le clamp de distance
      // juste après : cohérente par construction.
      const PAS_COULISSEMENT_CM = 10;
      const sensAxial = Math.sign(controls.target.z - camPersp.position.z) || 1;
      const dz = pas * PAS_COULISSEMENT_CM * sensAxial;
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

  // Enveloppe pleine du faisceau diffracté (fente → écran), affichée en mode "Visible"
  // uniquement. Maillage fin en grille (x,y) (cf. ENVELOPPE_N/M_TRANCHES et
  // construireGeometrieEnveloppe) dont la silhouette ET la couleur suivent I(x,y) réelle
  // (champ FFT × profil gaussien vertical, même source physique que la texture d'écran — cf.
  // sim.js → construireChampOuverture/echantillonnerChamp, discussion de conception) — un vrai
  // cône dont la base épouse la forme de la tache projetée, pas un volume à section constante
  // peint d'un dégradé. Largeur en x = toute la largeur de l'écran (même étendue que la
  // texture) : correspond par construction à la projection réelle.
  //
  // ShaderMaterial plutôt que MeshBasicMaterial+vertexColors : le shader intégré de
  // MeshBasicMaterial ne module que le RGB par la couleur de sommet, jamais l'alpha (qui reste
  // fixé par material.opacity) — l'absence de lumière (intensité≈0) rendait donc des bandes
  // NOIRES OPAQUES (à material.opacity constant) plutôt que transparentes, très visibles en se
  // baladant sur un fond de scène qui n'est pas un noir pur (0x14181d, cf. discussion de
  // conception). Un shader minimal réutilise l'attribut `color` (intensité stockée en niveau
  // de gris, cf. construireGeometrieEnveloppe) directement comme alpha du fragment : absence de
  // lumière → alpha≈0 → vraiment transparent, pas juste sombre.
  //
  // Plancher d'opacité restreint À LA TACHE CENTRALE UNIQUEMENT (uPlancherAlpha, borné par
  // uXLimite = position du 1er minimum, cf. sim.js → xPremierMinimum, mise à jour dans
  // updateSceneParams) : la largeur réelle de l'enveloppe (diamètre du faisceau, ~1 mm) est
  // physiquement correcte mais quasi invisible une fois rendue en alpha — contrairement à
  // beamMesh, opaque, qui reste visible à cette même finesse (cf. discussion de conception).
  // Plutôt que d'agrandir la géométrie pour compenser (essayé, mais ça crée un faux élargissement
  // brutal à la jonction avec beamMesh), le plancher relève seulement l'ALPHA minimum. Actif sur
  // TOUTE la longueur du faisceau (fente → écran, demande explicite de l'utilisateur — une
  // version antérieure ne l'activait que près de la fente), mais seulement pour les rayons dont
  // l'abscisse À L'ÉCRAN (attribut `aXFar`, cf. construireGeometrieEnveloppe) tombe dans
  // [-x1, x1] — PAS la position tapée courante du sommet (`position.x`), qui tend vers 0 pour
  // TOUS les rayons près de la fente, y compris ceux des taches secondaires : comparer à cette
  // position aurait fait déborder le plancher sur toute la largeur près de la fente. En utilisant
  // l'abscisse fixe de destination, la zone où le plancher s'applique reproduit exactement le
  // triangle tracé par les pointillés « Rayons vers les minima » (raysLine, cf. plus bas) — un
  // sommet-arête commun à la fente, qui s'évase jusqu'à ±x1 à l'écran, pas une bande de largeur
  // constante (demande explicite de l'utilisateur). poidsX retombe à 0 par un fondu doux
  // (smoothstep) au voisinage de ±x1, pas une coupure brutale.
  const envMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xff0000) },
      uOpacite: { value: 0.6 },
      uPlancherAlpha: { value: 0.15 },
      uXLimiteReel: { value: 1 },
      uXLimiteExagere: { value: 1 },
      uZNear: { value: 0 },
      uFlareLongueur: { value: 0 }
    },
    vertexShader: `
      attribute vec3 color;
      attribute float aXFar;
      varying float vIntensite;
      varying float vXFar;
      varying float vZ;
      void main() {
        vIntensite = color.r;
        vXFar = aXFar;
        vZ = position.z;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacite;
      uniform float uPlancherAlpha;
      uniform float uXLimiteReel;
      uniform float uXLimiteExagere;
      uniform float uZNear;
      uniform float uFlareLongueur;
      varying float vIntensite;
      varying float vXFar;
      varying float vZ;
      void main() {
        // Fondu de la limite du plancher entre uXLimiteExagere (juste après la fente, sur
        // uFlareLongueur) et uXLimiteReel (au-delà) — cf. commentaire à uFlareLongueur.
        float tFlare = uFlareLongueur > 0.0 ? clamp((vZ - uZNear) / uFlareLongueur, 0.0, 1.0) : 1.0;
        float xLimite = mix(uXLimiteExagere, uXLimiteReel, tFlare);
        float poidsX = 1.0 - smoothstep(xLimite * 0.85, xLimite, abs(vXFar));
        float alpha = max(vIntensite * uOpacite, uPlancherAlpha * poidsX);
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  // Géométrie entièrement reconstruite à chaque changement de paramètre (placeholder vide ici,
  // remplacé dès le premier appel à updateSceneParams juste après construireObjets).
  beamEnvelopeMesh = new THREE.Mesh(new THREE.BufferGeometry(), envMat);
  sceneObj.add(beamEnvelopeMesh);

  // Point de couleur en sortie du laser, affiché en mode "Non visibles" uniquement :
  // permet d'identifier la couleur λ en regardant droit dans l'axe du laser, sans
  // dessiner aucun faisceau (cf. discussion de conception avec l'utilisateur).
  beamDot = new THREE.Mesh(
    new THREE.SphereGeometry(BEAM_DIAMETER * 1.5, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
  );
  beamDot.position.set(0, 0, SOURCE_Z);
  sceneObj.add(beamDot);

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
  beamEnvelopeMesh.material.uniforms.uColor.value.setHex(couleurHex);
  beamDot.material.color.setHex(couleurHex);

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

  // Texture d'intensité. I(x) (horizontal) vient du champ FFT (construireChampOuverture, cf.
  // sim.js et commentaire à sa déclaration ci-dessous) — PAS de echantillonnerIntensite/
  // intensiteFente, réservées au graphe et aux encarts (cf. discussion de conception). Le
  // profil VERTICAL affiché ici, lui, reste le profil gaussien du faisceau calculé séparément
  // (largeurFaisceauGaussien) plutôt que lu dans le champ FFT à un y quelconque : la fente
  // (beaucoup plus haute que le faisceau, cf. FENTE_HAUTEUR_CM) ne le contraint pas, et
  // conserver ce facteur séparé évite de changer la compression d'affichage habituelle
  // (racine carrée) appliquée uniquement à la composante horizontale, cf. IxAffichage plus
  // bas. Identique pour l'ordre central et les ordres secondaires, comme sur une vraie photo
  // de diffraction : sans lui, la figure ressemble à des bandes verticales infinies au lieu
  // de taches.
  const w = screenTexCanvas.width, h = screenTexCanvas.height;
  const img = screenTexCtx.createImageData(w, h);
  const { r: r0, g: g0, b: b0 } = longueurOndeVersRGB(sim.lambda);
  const x1_cm = xPremierMinimum(sim.lambda, sim.a, sim.D) * 100;

  // Rayon gaussien du faisceau à l'écran (largeurFaisceauGaussien, cf. sim.js) — utilisé à la
  // fois comme demi-hauteur max de l'enveloppe ci-dessous et pour le profil vertical de la
  // texture d'écran plus bas (RENDU_W_MIN_CM : cf. commentaire à sa définition).
  const w_cm = Math.max(RENDU_W_MIN_CM, largeurFaisceauGaussien(sim.lambda, sim.D) * 100);

  // Champ diffracté (masque de la fente × faisceau incident, propagé par FFT, cf. sim.js) —
  // calculé UNE FOIS ici, partagé par la texture d'écran ci-dessous et l'enveloppe 3D
  // (construireGeometrieEnveloppe) : source physique unique pour tout ce qui est affiché en x,
  // à la place d'intensiteFente() (qui reste, elle, la source du graphe I(x) et des encarts —
  // cf. discussion de conception, aucune des deux ne doit dépendre de l'autre).
  const champ = construireChampOuverture(sim.lambda, sim.a, sim.D);

  // Enveloppe pleine du faisceau diffracté (cf. commentaire à la construction) : reconstruite
  // entièrement à chaque appel, la silhouette et le profil de luminosité changent avec a/D/λ.
  // uXLimite (position du 1er minimum, même x1_cm que raysLine plus bas) borne le plancher
  // d'opacité du shader (cf. construireObjets) à la seule zone de la tache centrale.
  x1CmCourant = x1_cm;
  updateEnvelopeXLimite();
  beamEnvelopeMesh.geometry.dispose();
  beamEnvelopeMesh.geometry = construireGeometrieEnveloppe(SLIT_Z, D_cm, BEAM_DIAMETER, w_cm, champ);
  for (let px = 0; px < w; px++) {
    const x = -sim.screenHalfWidth + (2 * sim.screenHalfWidth * px) / (w - 1);
    const Ix = echantillonnerChamp(champ, x, 0); // y=0 : le champ est normalisé (pic=1) comme intensiteFente(), et le profil vertical (Iy ci-dessous) reste appliqué séparément
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

  updateBeamVisibility();
}

// ─────────────────────────────────────────────────────────────────────
//  Largeur du plancher d'opacité (uXLimite, cf. envMat) : valeur physique réelle
//  (x1CmCourant) partout, sauf en vue de dessus où elle est agrandie (cf.
//  TOP_VIEW_PLANCHER_GAIN) pour rester lisible à l'échelle du banc entier. Appelée à la
//  fois par updateSceneParams() (λ/a/D changent) et setSceneView() (juste un changement
//  de vue, x1CmCourant inchangé) — mêmes déclencheurs que raysLine.visible/
//  updateBeamVisibility (cf. ARCHITECTURE.md).
// ─────────────────────────────────────────────────────────────────────
function updateEnvelopeXLimite() {
  const u = beamEnvelopeMesh.material.uniforms;
  u.uXLimiteReel.value = x1CmCourant;
  if (sim.view === 'top') {
    u.uXLimiteExagere.value = Math.min(x1CmCourant * TOP_VIEW_PLANCHER_GAIN, SCREEN_WIDTH / 2 * 0.5);
    u.uZNear.value = SLIT_Z;
    u.uFlareLongueur.value = TOP_VIEW_FLARE_LONGUEUR_CM;
  } else {
    u.uXLimiteExagere.value = x1CmCourant;
    u.uFlareLongueur.value = 0;
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Visibilité des trois représentations du faisceau (laser→fente,
//  fente→écran, point de couleur), croisant sim.beamMode et la vue
//  active. Appelée depuis updateSceneParams() (changement de mode/
//  paramètre) et setSceneView() (changement de vue) — les deux sont des
//  déclencheurs valides, comme pour raysLine.visible (cf. ARCHITECTURE.md).
// ─────────────────────────────────────────────────────────────────────
function updateBeamVisibility() {
  const cacherBanc = (sim.view === 'screen');
  beamMesh.visible = !cacherBanc && sim.beamMode !== 'off';
  beamEnvelopeMesh.visible = !cacherBanc && sim.beamMode === 'visible';
  beamDot.visible = !cacherBanc && sim.beamMode === 'off';
}

// ─────────────────────────────────────────────────────────────────────
//  Bascule la vue caméra active. Appelée par ui.js → setView().
// ─────────────────────────────────────────────────────────────────────
function setSceneView(view) {
  sim.view = view;
  controls.enabled = (view === '3d');
  const cacherBanc = (view === 'screen');
  laserBody.visible = !cacherBanc;
  topBand.visible = !cacherBanc;
  bottomBand.visible = !cacherBanc;
  wallLeft.visible = !cacherBanc;
  wallRight.visible = !cacherBanc;
  supportLaser.visible = !cacherBanc;
  supportSlide.visible = !cacherBanc;
  raysLine.visible = sim.showRays && view !== 'screen';
  updateEnvelopeXLimite();
  updateBeamVisibility();
  syncGraphAvecVueEcran();
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
  // Cadrage figé en dessous de D_CADRAGE_MIN_CM : sous ce seuil, réduire D ne fait plus
  // « zoomer » les vues Dessus/Profil (recentrage + rétrécissement du cadre à chaque
  // frame, gênant pour observer l'écran se rapprocher) — seul D_cadrage reste borné, la
  // position réelle de l'écran (updateSceneParams, D_cm non modifié) continue de suivre D.
  const D_cadrage = Math.max(D_cm, D_CADRAGE_MIN_CM);
  const zCenter = (SOURCE_Z + D_cadrage) / 2;
  const halfSpanZ = (D_cadrage - SOURCE_Z) / 2 * 1.15;

  if (sim.view === 'top') {
    camOrtho.position.set(0, 500, zCenter);
    camOrtho.up.set(1, 0, 0);
    camOrtho.lookAt(0, 0, zCenter);
    fitOrtho(camOrtho, halfSpanZ, SCREEN_WIDTH / 2 * 1.3, aspect);
  } else if (sim.view === 'side') {
    camOrtho.position.set(-500, 0, zCenter);
    camOrtho.up.set(0, 1, 0);
    camOrtho.lookAt(0, 0, zCenter);
    fitOrtho(camOrtho, halfSpanZ, SCREEN_HEIGHT / 2 * 1.3, aspect);
  } else if (sim.view === 'screen') {
    camOrtho.position.set(0, 0, SOURCE_Z - 300);
    camOrtho.up.set(0, 1, 0);
    camOrtho.lookAt(0, 0, D_cm);
    fitOrtho(camOrtho, SCREEN_WIDTH / 2 * 1.08 / screenViewZoom, SCREEN_HEIGHT / 2 * 1.08 / screenViewZoom, aspect);
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
//  Recale la fenêtre du graphe I(x) (graph.js → gview) sur la plage physique horizontale
//  RÉELLEMENT visible dans la vue Écran (camOrtho.left/right, déjà calculés par
//  updateOrthoCamera pour l'aspect et le zoom courants — pas juste SCREEN_WIDTH/zoom, qui
//  ignorerait la marge ajoutée par fitOrtho quand c'est la hauteur qui contraint le
//  cadrage) : ainsi la courbe reste toujours alignée avec les taches affichées sur
//  l'écran. Appelée après tout changement affectant ce cadrage : zoom molette
//  (initZoomVersCurseur), bascule vers la vue Écran (setSceneView), redimensionnement
//  (resizeScene) — sans quoi le graphe resterait basé sur l'ancien cadrage.
// ─────────────────────────────────────────────────────────────────────
function syncGraphAvecVueEcran() {
  if (sim.view !== 'screen') return;
  const aspect = canvasEl.clientWidth / canvasEl.clientHeight;
  updateOrthoCamera(aspect);
  if (typeof setGraphScreenRange === 'function') {
    setGraphScreenRange(camOrtho.right / 100); // cm → m
  }
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
  syncGraphAvecVueEcran();
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
