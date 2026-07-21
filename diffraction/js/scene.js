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
const SOURCE_Z = -15;           // cm — position FIXE du laser sur le banc (jamais réglée directement)
// Position de la fente : réglable via sim.d (distance laser-fente). Quand d augmente, la
// fente (et l'écran avec elle, pour garder D constant) se décale vers l'avant ; si l'écran
// atteindrait ainsi la fin de la table, D est réduit à la place (cf. sim.js → dMaxPourPetitD,
// appliquerBorneD dans ui.js). Mise à jour dans updateSceneParams().
let SLIT_Z = 0;
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

// ── Bouton "Décomposer la figure de diffraction" (vue Écran + lumière blanche uniquement) ──
// decomposeActive : état CIBLE (bouton appuyé ou non). decomposeT : degré de transition
// réellement atteint (0 = figure fusionnée, 1 = 6 figures séparées), animé progressivement
// vers decomposeActive à chaque frame par tickDecompose() — cf. sa docstring pour le détail
// du rendu. Séparer les deux (plutôt qu'un simple booléen) permet l'animation fluide dans
// les deux sens, demandée explicitement par l'utilisateur.
let decomposeActive = false;
let decomposeT = 0;
const DECOMPOSE_DUREE_S = 2; // durée totale (s) d'une transition complète (demande explicite)
const DECOMPOSE_VITESSE = 1 / (DECOMPOSE_DUREE_S * 60); // pas par frame, en supposant ~60 fps

// Anti-rebond de la reconstruction des 6 enveloppes couleur (mode Lumière blanche) : chacune
// nécessite sa PROPRE FFT complète (construireChampOuverture par couleur, cf. discussion de
// conception — pas de raccourci analytique, pour rester généralisable à d'autres formes de
// fente), soit 6× le coût de l'enveloppe mono. Recalculer ça à CHAQUE frappe d'un slider
// (oninput se déclenche en continu pendant un glissement) serait perceptiblement saccadé —
// on attend un court silence (ENVELOPPES_BLANCHE_DEBOUNCE_MS) après le dernier changement
// avant de relancer les 6 FFT. Rien d'autre (texture d'écran, graphe, mono) n'est concerné :
// ces calculs restent analytiques (intensiteOuverture) ou déjà bon marché.
let enveloppesBlancheTimer = null;
const ENVELOPPES_BLANCHE_DEBOUNCE_MS = 50;

// TEST : n'utiliser que Rouge/Vert/Bleu (au lieu des 6 couleurs de BLANCHE_COULEURS) pour les
// enveloppes 3D, pour voir si une synthèse additive à 3 couleurs suffit à redonner du blanc
// (moitié moins de FFT que 6, donc moins de lag) — référence de normalisation dédiée (propre
// à ce sous-ensemble, pas BLANCHE_REF qui suppose les 6).
const ENVELOPPE_COULEURS_TEST = BLANCHE_COULEURS.filter(c => ['Rouge', 'Vert', 'Bleu'].includes(c.nom));
const ENVELOPPE_REF_TEST = (() => {
  let r = 0, g = 0, b = 0;
  for (const c of ENVELOPPE_COULEURS_TEST) {
    const rgb = longueurOndeVersRGB(c.lambda);
    r += rgb.r; g += rgb.g; b += rgb.b;
  }
  return { r: Math.max(r, 1), g: Math.max(g, 1), b: Math.max(b, 1) };
})();

// ─────────────────────────────────────────────────────────────────────
//  Bascule la cible de décomposition (bouton, appelé depuis ui.js). L'animation elle-même
//  est pilotée par tickDecompose(), appelée à chaque frame par la boucle de rendu.
// ─────────────────────────────────────────────────────────────────────
function toggleDecompose() {
  decomposeActive = !decomposeActive;
  const btn = document.getElementById('btn-decompose');
  if (btn) btn.classList.toggle('active', decomposeActive);
}

// ─────────────────────────────────────────────────────────────────────
//  Annule INSTANTANÉMENT (pas d'animation) la décomposition et revient à la figure fusionnée
//  normale — appelée quand une des deux conditions qui rendent le bouton pertinent cesse
//  d'être vraie (changement de vue, cf. setSceneView ; retour en mode monochromatique, cf.
//  ui.js → cycleLightSource), PAS quand l'utilisateur clique lui-même sur le bouton (qui,
//  lui, anime toujours en douceur, cf. toggleDecompose).
// ─────────────────────────────────────────────────────────────────────
function annulerDecompose() {
  if (!decomposeActive && decomposeT === 0) return;
  decomposeActive = false;
  decomposeT = 0;
  const btn = document.getElementById('btn-decompose');
  if (btn) btn.classList.remove('active');
  // Réaffiche immédiatement la figure fusionnée normale (sinon la texture resterait figée
  // dans son dernier état décomposé/intermédiaire jusqu'au prochain changement de a/D/d/λ) —
  // seulement utile en lumière blanche, seul mode où cette texture dédiée est utilisée.
  if (sim.lightSource === 'blanche') dessinerTextureEcranBlanche(0);
}

// ─────────────────────────────────────────────────────────────────────
//  (Dés)affiche le bouton "Décomposer" selon les 2 conditions requises (vue Écran + lumière
//  blanche) — appelée par setSceneView() et par ui.js → cycleLightSource()/resetSim()/init().
//  N'annule PAS elle-même la décomposition en cours : c'est aux appelants concernés de le
//  faire explicitement (cf. annulerDecompose), pour garder une seule responsabilité par
//  fonction.
// ─────────────────────────────────────────────────────────────────────
function syncBoutonDecompose() {
  const conteneur = document.getElementById('decompose-buttons');
  if (conteneur) conteneur.classList.toggle('visible', sim.view === 'screen' && sim.lightSource === 'blanche');
}

// ─────────────────────────────────────────────────────────────────────
//  Avance decomposeT d'un pas vers sa cible (decomposeActive) et redessine la texture d'écran
//  en conséquence — appelée à chaque frame par ui.js → loop(), tant que sim.view==='screen'
//  ET sim.lightSource==='blanche' (seul cas où la texture peut différer de son état fusionné
//  normal). PAS de repassage par updateSceneParams() (qui referait inutilement la FFT de
//  l'enveloppe 3D à chaque frame, coûteux) : seule la texture d'écran est concernée ici.
// ─────────────────────────────────────────────────────────────────────
function tickDecompose() {
  if (sim.view !== 'screen' || sim.lightSource !== 'blanche') return;
  const cible = decomposeActive ? 1 : 0;
  if (decomposeT === cible) return;
  const pas = Math.sign(cible - decomposeT) * DECOMPOSE_VITESSE;
  decomposeT = Math.abs(cible - decomposeT) < DECOMPOSE_VITESSE ? cible : decomposeT + pas;
  dessinerTextureEcranBlanche(decomposeT);
}
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
// Capacité max de la table (position d'écran la plus éloignée admissible, fente en butée
// contre le laser, d minimal) : doit rester cohérente avec sim.js → BANC_LONGUEUR_M et
// PETIT_D_MIN_M (D_MAX_CM = 100·(BANC_LONGUEUR_M) - 15, avec SOURCE_Z=-15 fixe).
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

// ── Doubles flèches de mesure (d, D, L) — bouton "Afficher les longueurs" ──
const LEN_COLOR = 0x8fd6ff; // bleu clair, distinct du jaune (rayons) et du blanc (axe optique)
// renderOrder très élevé (largement au-dessus de tout le reste de la scène, dont le
// support d'écran opaque dont le plateau chevauche géométriquement la zone où sont
// dessinés les pointillés de L en vue Dessus) : garantit, combiné à depthTest:false sur
// tous les matériaux de ce module, que flèches/pointillés/labels de mesure restent
// TOUJOURS dessinés par-dessus, quelle que soit la géométrie 3D sous-jacente à cet endroit.
const LEN_RENDER_ORDER = 500;
const LEN_OFFSET_X = 13;        // cm — décalage latéral des flèches d/D sur la table (3D/Dessus), pour éviter les supports (les plus larges, supportScreen, font ~10 cm)
const LEN_ARROW_Y_TABLE = TABLE_Y + 0.4;   // cm — flèches légèrement au-dessus du plateau (3D/Dessus)
const LEN_LABEL_Y_TABLE = TABLE_Y + 0.05; // cm — posé à même la surface de la table (pas flottant à hauteur de la flèche)
const LEN_LABEL_X_EXTRA_TABLE = 4; // cm — décale le label d/D encore plus vers l'extérieur de la table que la flèche (utile en vue Dessus, où le décalage Y ci-dessus est aplati)
const LEN_SIDE_Y = TABLE_Y - PLATEAU_EPAISSEUR - TABLE_THICK / 2; // cm — milieu de la tranche de la table (vue Profil)
const LEN_SIDE_LABEL_Y = TABLE_Y - PLATEAU_EPAISSEUR - TABLE_THICK - 1.6; // cm — sous la table (vue Profil)
const LEN_TOP_L_DECALAGE_Z = 3;   // cm — recul de la flèche L derrière l'écran (vue Dessus)
const LEN_TOP_L_LABEL_DECALAGE_Z = 3; // cm — décalage supplémentaire du label L « à droite » (vue Dessus : le côté « droit » de l'écran correspond à l'axe Z du monde, cf. camOrtho.up=(1,0,0) dans updateOrthoCamera)

let x1CmCourant = 0; // dernière valeur physique (cf. updateSceneParams), réutilisée par updateEnvelopeXLimite() sur simple changement de vue

// Correspondance a (µm, physique) → largeur visuelle de la fente (cm, schématique).
// Cf. ARCHITECTURE.md : la fente réelle (dixièmes de mm) est invisible à l'échelle
// du banc (mètres) ; elle est donc dessinée agrandie, mais sa valeur RÉELLE
// (sim.a) reste seule utilisée dans les calculs physiques (intensiteOuverture, etc.).
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
//  Reconstruit slideCercleMesh : un vrai trou circulaire de rayon rayon_cm, découpé dans le
//  carré SLIDE_SIZE de la lame via THREE.Shape + un trou (THREE.Path via absarc) — la seule
//  des 4 formes qui ne peut pas s'obtenir avec des boîtes assemblées (cf. construireObjets),
//  sans recourir à du CSG. Extrudée sur SLIDE_THICK puis recentrée en z (ExtrudeGeometry
//  extrude par défaut de 0 à depth, pas symétriquement autour de 0 comme BoxGeometry).
// ─────────────────────────────────────────────────────────────────────
function reconstruireSlideCercle(rayon_cm) {
  const half = SLIDE_SIZE / 2;
  const contour = new THREE.Shape();
  contour.moveTo(-half, -half);
  contour.lineTo(half, -half);
  contour.lineTo(half, half);
  contour.lineTo(-half, half);
  contour.closePath();
  const trou = new THREE.Path();
  trou.absarc(0, 0, rayon_cm, 0, Math.PI * 2, false);
  contour.holes.push(trou);
  slideCercleMesh.geometry.dispose();
  slideCercleMesh.geometry = new THREE.ExtrudeGeometry(contour, { depth: SLIDE_THICK, bevelEnabled: false });
  slideCercleMesh.geometry.translate(0, 0, -SLIDE_THICK / 2);
}

// ─────────────────────────────────────────────────────────────────────
//  Visibilité des objets de la lame porte-fente : croise la forme active (sim.maskShape, cf.
//  construireObjets pour le détail de chaque cas) et la vue Écran (qui masque tout le banc,
//  comme laserBody/supportSlide, cf. setSceneView). Appelée depuis updateSceneParams()
//  (changement de forme/paramètre) et setSceneView() (changement de vue) — mêmes déclencheurs
//  que updateBeamVisibility (cf. ARCHITECTURE.md).
// ─────────────────────────────────────────────────────────────────────
function refreshSlideVisibility() {
  const cacherBanc = (sim.view === 'screen');
  const shape = sim.maskShape;
  const cadreVisible = !cacherBanc && (shape === 'fente' || shape === 'carre' || shape === 'fil');
  topBand.visible = cadreVisible;
  bottomBand.visible = cadreVisible;
  wallLeft.visible = !cacherBanc && (shape === 'fente' || shape === 'carre');
  wallRight.visible = wallLeft.visible;
  wallCenter.visible = !cacherBanc && shape === 'fil';
  slideCercleMesh.visible = !cacherBanc && shape === 'cercle';
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
//  construireChampOuverture() → FFT — PAS de intensiteOuverture() directement (celle-ci reste
//  réservée au graphe et aux encarts, cf. discussion de conception). Les deux sources
//  coïncident pour une fente (mêmes minima/maxima), mais seule celle-ci (le champ FFT) sera
//  concernée le jour où la forme de l'ouverture changera.
// ─────────────────────────────────────────────────────────────────────
function construireGeometrieEnveloppe(zNear, zFar, hNear, wMax, champ, shape = sim.maskShape) {
  const n = ENVELOPPE_N_TRANCHES, m = ENVELOPPE_M_TRANCHES, kMax = ENVELOPPE_K_COUCHES;
  const halfW = sim.screenHalfWidth; // m — même étendue physique que la texture d'écran
  // xFars[k]/yFars[k] = position à l'écran (fixe, non tapée) du rayon auquel appartient le
  // sommet d'indice k — sert au shader (cf. construireObjets) à savoir si CE rayon appartient
  // à la tache centrale, indépendamment de sa position tapée courante (qui, elle, tend vers 0
  // pour TOUS les rayons près de la fente — cf. discussion de conception).
  const positions = [], colors = [], xFars = [], yFars = [], indices = [];

  // Carré/cercle diffractent RÉELLEMENT en y (pas seulement le faisceau incident qui les
  // traverse) : leur enveloppe a besoin d'un vrai balayage 2D du champ FFT (silhouette ET
  // luminosité), au lieu de la factorisation hauteur(x) = wMax × facteur_horizontal, valable
  // seulement pour fente/fil (hauteur non contrainte par le masque à cette échelle pour ces
  // deux formes, cf. FENTE_HAUTEUR_CM) — cf. §3 de PISTES_EVOLUTION.md.
  const balayage2D = (shape === 'carre' || shape === 'cercle');
  const SEUIL_ENVELOPPE_NEGLIGEABLE = 1e-3; // relatif au pic central (champ normalisé à 1, cf. construireChampOuverture)
  const PAS_BALAYAGE_Y = 96;
  // Borne du balayage vertical : PAS sim.screenHalfWidth (12,5 cm, beaucoup trop grossier — la
  // figure réelle tient souvent sur quelques mm, cf. FFT_FENETRE_FACTEUR dans sim.js) mais la
  // portée MAXIMALE que la grille FFT peut effectivement représenter (au-delà,
  // echantillonnerChamp renvoie 0 quel que soit y, cf. sa docstring) — même principe que le
  // ratio couverture/1er-minimum déjà utilisé pour dimensionner la fenêtre FFT elle-même
  // (indépendant de a/λ/D, cf. sim.js). Sans cette borne, le pas du balayage (halfW/PAS) était
  // ~1000× plus grossier que la portée réelle de la figure à petit a, donnant une silhouette
  // quantifiée/artefactée au lieu d'un contour lisse (constaté par l'utilisateur — cercle pas
  // du tout circulaire).
  let yBalayageMax_m = halfW;
  if (balayage2D) {
    const sinThetaMax = Math.min((champ.N / 2) * champ.lambda_m / champ.FFT_FENETRE_M, 0.999);
    yBalayageMax_m = Math.min(halfW, champ.D_m * sinThetaMax / Math.sqrt(1 - sinThetaMax * sinThetaMax));
  }

  // Par colonne (x) : position, facteur géométrique (racine carrée, cf. commentaire plus bas),
  // facteur de LUMINOSITÉ (plus compressif, cf. ENVELOPPE_GAMMA_LUMINOSITE — fente/fil
  // seulement, cf. ci-dessous) et demi-hauteur cible côté écran — calculés une fois, réutilisés
  // à la fois par la grille écran et par les rubans de chaque rangée.
  const xCm = new Array(n + 1), ixLumCol = new Array(n + 1), halfHFar = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const x_m = -halfW + (2 * halfW * i) / n;
    xCm[i] = x_m * 100;
    const Ix = echantillonnerChamp(champ, x_m, 0); // y=0 : cf. commentaire à l'appel dans updateSceneParams
    if (balayage2D) {
      // Cherche le plus grand y où le champ reste non négligeable À CETTE ABSCISSE (balayage
      // du bord vers le centre : robuste même si l'intensité n'est pas monotone en y, ce qui
      // exclut une simple bissection — cas des anneaux d'Airy du cercle).
      let yLimite_m = 0;
      for (let s = PAS_BALAYAGE_Y; s >= 1; s--) {
        const y_scan = (yBalayageMax_m * s) / PAS_BALAYAGE_Y;
        if (echantillonnerChamp(champ, x_m, y_scan) > SEUIL_ENVELOPPE_NEGLIGEABLE) { yLimite_m = y_scan; break; }
      }
      halfHFar[i] = yLimite_m * 100;
    } else {
      // Racine carrée, même compression que la texture d'écran (cf. updateSceneParams) — sert
      // ICI uniquement à la GÉOMÉTRIE (largeur de la silhouette) : sans elle les taches
      // secondaires seraient géométriquement invisibles (silhouette collée à l'axe).
      halfHFar[i] = wMax * Math.sqrt(Ix); // pince à 0 aux minima, max=wMax au centre (Ix=1)
      // Luminosité affichée de l'ENVELOPPE (pas la texture d'écran, cf. discussion de
      // conception) : exposant plus dur que la racine carrée — la silhouette reste visible
      // (ci-dessus) mais l'éclat retombe beaucoup plus vite en s'éloignant du centre, pour ne
      // pas donner l'impression que les taches secondaires sont presque aussi lumineuses que
      // la tache centrale.
      ixLumCol[i] = Math.pow(Ix, ENVELOPPE_GAMMA_LUMINOSITE);
    }
  }

  // Grille complète côté écran (z=zFar). Fente/fil : dégradé vertical Iy réel (profil gaussien
  // du faisceau incident, indépendant de x) en plus du dégradé horizontal (double codage, cf.
  // commentaire à la construction). Carré/cercle : luminosité échantillonnée DIRECTEMENT dans
  // le champ 2D réel à la position (x,y) de chaque sommet — la silhouette (halfHFar) est déjà
  // le vrai contour du champ, calculée ci-dessus.
  const grilleFar = [];
  for (let i = 0; i <= n; i++) {
    const x_m = xCm[i] / 100;
    const halfH = halfHFar[i];
    const col = new Array(m + 1);
    for (let j = 0; j <= m; j++) {
      const y_cm = halfH === 0 ? 0 : -halfH + (2 * halfH * j) / m;
      let intensite;
      if (balayage2D) {
        intensite = Math.pow(echantillonnerChamp(champ, x_m, y_cm / 100), ENVELOPPE_GAMMA_LUMINOSITE);
      } else {
        // Profil gaussien réel (même formule que le profil vertical de la texture d'écran,
        // cf. updateSceneParams), évalué à la position y physique réelle — indépendant du
        // fait que la plage y explorée ici soit compressée par halfHFar.
        const Iy = Math.exp(-2 * y_cm * y_cm / (wMax * wMax));
        intensite = ixLumCol[i] * Iy;
      }
      col[j] = positions.length / 3;
      positions.push(xCm[i], y_cm, zFar);
      colors.push(intensite, intensite, intensite);
      xFars.push(xCm[i]);
      yFars.push(y_cm);
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
        yFars.push(yFar);
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
  geo.setAttribute('aYFar', new THREE.Float32BufferAttribute(yFars, 1));
  geo.setIndex(indices);
  return geo;
}

let renderer, sceneObj, camPersp, camOrtho, controls, canvasEl;
let laserBody, beamMesh, beamEnvelopeMesh, beamDot, topBand, bottomBand, wallLeft, wallRight, wallCenter, slideCercleMesh, screenMesh, screenTexture, screenTexCanvas, screenTexCtx;
let raysLine, axisLine, supportLaser, supportSlide, supportScreen;
let lengthsGroup, mesurePetitD, mesureGrandD, mesureL;

// 6 enveloppes couleur du faisceau diffracté (mode Lumière blanche), une par BLANCHE_COULEURS
// (cf. sim.js) — cf. construireObjets() pour leur construction et updateSceneParams()/
// reconstruireEnveloppesBlanche() pour leur mise à jour. x1CmCourantCouleurs : 1er minimum
// (cm) de CHAQUE couleur, parallèle à x1CmCourant (mono) — cf. updateEnvelopeXLimite().
let beamEnvelopeMeshesBlanche = [];
let x1CmCourantCouleurs = [];

// ─────────────────────────────────────────────────────────────────────
//  Formate un nombre en notation française (virgule décimale).
// ─────────────────────────────────────────────────────────────────────
function formatFr(valeur, decimales) {
  return valeur.toFixed(decimales).replace('.', ',');
}

// ─────────────────────────────────────────────────────────────────────
//  Double flèche 3D générique : segment central + une pointe (cône) à
//  chaque extrémité. Construite le long de l'axe LOCAL X, centrée en 0 ;
//  on la positionne/oriente ensuite en plaçant le groupe retourné.
// ─────────────────────────────────────────────────────────────────────
function creerFlecheDouble(color) {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
  const shaftGeo = new THREE.BufferGeometry();
  shaftGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(6).fill(0), 3));
  const shaft = new THREE.Line(shaftGeo, mat);
  shaft.renderOrder = LEN_RENDER_ORDER;
  const coneMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
  const head1 = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1, 10), coneMat);
  const head2 = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1, 10), coneMat);
  head1.renderOrder = LEN_RENDER_ORDER; head2.renderOrder = LEN_RENDER_ORDER;
  group.add(shaft, head1, head2);
  group.userData.shaft = shaft;
  group.userData.head1 = head1;
  group.userData.head2 = head2;
  return group;
}

// Redéfinit la longueur (cm) d'une flèche double créée par creerFlecheDouble.
function setFlecheDoubleLongueur(grp, longueur) {
  const len = Math.max(0.01, longueur);
  const headLen = Math.min(1.4, Math.max(0.4, len * 0.12));
  const headRad = headLen * 0.32;
  const demi = len / 2;
  grp.userData.shaft.geometry.setAttribute('position', new THREE.Float32BufferAttribute(
    [-demi, 0, 0, demi, 0, 0], 3
  ));
  const h1 = grp.userData.head1, h2 = grp.userData.head2;
  h1.geometry.dispose(); h1.geometry = new THREE.ConeGeometry(headRad, headLen, 10);
  h2.geometry.dispose(); h2.geometry = new THREE.ConeGeometry(headRad, headLen, 10);
  // THREE.ConeGeometry pointe vers +Y par défaut ; on l'oriente vers +X et -X.
  h1.rotation.z = -Math.PI / 2;
  h1.position.x = demi - headLen / 2;
  h2.rotation.z = Math.PI / 2;
  h2.position.x = -(demi - headLen / 2);
}

// ─────────────────────────────────────────────────────────────────────
//  Double flèche STRICTEMENT PLATE (aucune épaisseur locale en Z, pointes
//  en triangles plats et non en cônes 3D) : utilisée pour la flèche L
//  posée à même le plan de l'écran, qui doit rester un simple décalque 2D
//  et non un objet 3D visible en volume depuis la vue 3D perspective.
// ─────────────────────────────────────────────────────────────────────
function creerFlecheDoublePlate(color) {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
  const shaftGeo = new THREE.BufferGeometry();
  shaftGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(6).fill(0), 3));
  const shaft = new THREE.Line(shaftGeo, mat);
  shaft.renderOrder = LEN_RENDER_ORDER;

  const headMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const head1Geo = new THREE.BufferGeometry();
  head1Geo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(9).fill(0), 3));
  head1Geo.setIndex([0, 1, 2]);
  const head1 = new THREE.Mesh(head1Geo, headMat);
  const head2Geo = new THREE.BufferGeometry();
  head2Geo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(9).fill(0), 3));
  head2Geo.setIndex([0, 1, 2]);
  const head2 = new THREE.Mesh(head2Geo, headMat);
  head1.renderOrder = LEN_RENDER_ORDER; head2.renderOrder = LEN_RENDER_ORDER;
  group.add(shaft, head1, head2);
  group.userData.shaft = shaft;
  group.userData.head1 = head1;
  group.userData.head2 = head2;
  return group;
}
function setFlecheDoublePlateLongueur(grp, longueur) {
  const len = Math.max(0.01, longueur);
  const headLen = Math.min(1.4, Math.max(0.4, len * 0.12));
  const headDemiLargeur = headLen * 0.36;
  const demi = len / 2;
  grp.userData.shaft.geometry.setAttribute('position', new THREE.Float32BufferAttribute(
    [-demi, 0, 0, demi, 0, 0], 3
  ));
  const setHead = (mesh, tipX, sens) => {
    const baseX = tipX - sens * headLen;
    mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      tipX, 0, 0,
      baseX, headDemiLargeur, 0,
      baseX, -headDemiLargeur, 0
    ], 3));
  };
  setHead(grp.userData.head1, demi, 1);
  setHead(grp.userData.head2, -demi, -1);
}

// ─────────────────────────────────────────────────────────────────────
//  Oriente un décalque (label ou flèche plate) via une base orthonormée
//  explicite (right = axe local X = sens de lecture du texte, up = axe
//  local Y approximatif) plutôt qu'une rotation Euler à un seul axe : on
//  a besoin de fixer SIMULTANÉMENT la normale (quel côté est visible,
//  pour ne pas rendre le texte en miroir) ET le sens de lecture (aligné
//  sur la flèche correspondante), ce qu'une seule rotation d'axe ne
//  permet pas. `up` n'a besoin d'être qu'approximatif : il est
//  ré-orthogonalisé ci-dessous pour garantir une base propre (rotation,
//  jamais une réflexion qui inverserait le texte).
// ─────────────────────────────────────────────────────────────────────
function orienterDecalque(mesh, right, up) {
  const R = new THREE.Vector3(...right).normalize();
  const Uapprox = new THREE.Vector3(...up).normalize();
  const N = new THREE.Vector3().crossVectors(R, Uapprox).normalize();
  const U = new THREE.Vector3().crossVectors(N, R).normalize();
  const m = new THREE.Matrix4().makeBasis(R, U, N);
  mesh.quaternion.setFromRotationMatrix(m);
}

// ─────────────────────────────────────────────────────────────────────
//  Segment pointillé générique (relie une extrémité de flèche au point
//  physique dont elle indique l'éloignement). Construit à partir de petits
//  pavés (Mesh) pleins, PAS d'une THREE.Line + LineDashedMaterial : l'épaisseur
//  réelle à l'écran d'une ligne GL native n'est pas garantie (souvent
//  clampée/arrondie à 0-1 px selon le pilote/GPU, notamment sur ANGLE/Windows),
//  ce qui la rendait invisible à certains niveaux de zoom (bug observé en vue
//  Dessus pour la double flèche L, non résolu par depthTest/depthWrite/ordre de
//  rendu — cf. discussion). Des pavés pleins ont une épaisseur RÉELLE (en cm),
//  donc toujours au moins quelques pixels, quel que soit le zoom.
//  Chaque segment est aligné sur UN axe (X, Y ou Z) et vit sur une surface
//  plane (table, tranche de table, écran) : `axePlat` désigne, PARMI LES DEUX
//  AUTRES axes, celui perpendiculaire à cette surface — il reste quasi nul
//  (LEN_DASH_PLAT), pour un pavé plat/décalque plutôt qu'un pavé 3D épais dans
//  les deux directions. Le troisième axe (dans le plan) garde l'épaisseur
//  visible normale (LEN_DASH_THICK).
// ─────────────────────────────────────────────────────────────────────
const LEN_DASH_SIZE = 0.8, LEN_GAP_SIZE = 0.6;
const LEN_DASH_THICK = 0.18; // cm — épaisseur visible, dans le plan de la surface
const LEN_DASH_THICK_L_ECRAN = 0.06; // cm — épaisseur réduite, uniquement pour les pointillés de L en vue 3D/Écran
const LEN_DASH_PLAT = 0.02;  // cm — épaisseur quasi nulle, perpendiculaire à la surface (décalque)
const LEN_DASH_MAX_TICKS = 12; // assez pour les plus longs segments utilisés (cf. placerMesureTable)
function creerPointilleSegment(color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
  const ticks = [];
  for (let i = 0; i < LEN_DASH_MAX_TICKS; i++) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    tick.renderOrder = LEN_RENDER_ORDER;
    tick.visible = false;
    group.add(tick);
    ticks.push(tick);
  }
  group.userData.ticks = ticks;
  return group;
}
function placerPointilleSegment(group, p1, p2, axePlat, epaisseurVisible = LEN_DASH_THICK) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1], dz = p2[2] - p1[2];
  const longueur = Math.hypot(dx, dy, dz);
  const ticks = group.userData.ticks;
  if (longueur < 1e-6) { ticks.forEach(t => t.visible = false); return; }
  const ux = dx / longueur, uy = dy / longueur, uz = dz / longueur;
  const epaisseur = { x: epaisseurVisible, y: epaisseurVisible, z: epaisseurVisible };
  epaisseur[axePlat] = LEN_DASH_PLAT;
  const cycle = LEN_DASH_SIZE + LEN_GAP_SIZE;
  let d = 0, i = 0;
  for (; i < ticks.length && d < longueur; i++) {
    const dashLen = Math.min(LEN_DASH_SIZE, longueur - d);
    const centre = d + dashLen / 2;
    const tick = ticks[i];
    tick.visible = true;
    tick.position.set(p1[0] + ux * centre, p1[1] + uy * centre, p1[2] + uz * centre);
    // Segment aligné sur un seul axe (toujours le cas actuellement) : ce pavé s'étire le
    // long de cet axe (dashLen) ; des deux autres, un garde l'épaisseur visible normale,
    // l'autre (axePlat) reste quasi nul pour rester un décalque plat sur sa surface.
    tick.scale.set(
      Math.abs(ux) > 0.5 ? dashLen : epaisseur.x,
      Math.abs(uy) > 0.5 ? dashLen : epaisseur.y,
      Math.abs(uz) > 0.5 ? dashLen : epaisseur.z
    );
    d += cycle;
  }
  for (; i < ticks.length; i++) ticks[i].visible = false;
}

// ─────────────────────────────────────────────────────────────────────
//  Label texte (canvas → texture) pour une mesure. Rendu comme un décalque
//  plat (PlaneGeometry de taille fixe en cm), pas un sprite billboard : il
//  s'oriente avec la surface sur laquelle il est posé (table ou écran),
//  cf. updateLengthsGroup().
// ─────────────────────────────────────────────────────────────────────
function creerLabelMesure(largeurCm, hauteurCm) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(largeurCm, hauteurCm), mat);
  mesh.renderOrder = LEN_RENDER_ORDER + 1;
  mesh.userData.canvas = canvas;
  mesh.userData.ctx = ctx;
  mesh.userData.tex = tex;
  return mesh;
}
function setLabelTexte(mesh, texte) {
  const canvas = mesh.userData.canvas, ctx = mesh.userData.ctx;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let fontSize = 46;
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  const maxW = canvas.width - 16;
  while (ctx.measureText(texte).width > maxW && fontSize > 18) {
    fontSize -= 2;
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  }
  ctx.fillStyle = '#f2fbff';
  ctx.strokeStyle = 'rgba(8,16,24,0.85)';
  ctx.lineWidth = Math.max(4, fontSize * 0.14);
  ctx.lineJoin = 'round';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(texte, canvas.width / 2, canvas.height / 2);
  ctx.fillText(texte, canvas.width / 2, canvas.height / 2);
  mesh.userData.tex.needsUpdate = true;
}

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
      const screenZ = SLIT_Z + sim.D * 100;
      const centreZ = (SOURCE_Z + screenZ) / 2;
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
      // uYLimite* : pendant vertical de uXLimite* (cf. commentaire ci-dessus), ajouté pour le
      // trou carré/circulaire — leur 1er minimum contraint aussi y, pas seulement x (cf.
      // appliquerXLimiteUniforms). Pour fente/fil (contrainte verticale non pertinente à cette
      // échelle), une sentinelle très grande y est appliquée : poidsY reste alors ≈1 partout,
      // reproduisant exactement l'ancien test 1D (uniquement sur x).
      uYLimiteReel: { value: 1e6 },
      uYLimiteExagere: { value: 1e6 },
      // uPlancherRadial : 0 = test RECTANGULAIRE (produit de deux smoothstep 1D, forme exacte
      // du 1er minimum d'un carré séparable, cf. ci-dessous) ; 1 = test RADIAL/elliptique
      // (forme exacte du 1er anneau d'Airy — un test rectangulaire y donnait un plancher en
      // croix/carré arrondi, visiblement pas circulaire, cf. discussion avec l'utilisateur).
      // Fente/fil : rectangulaire aussi, sans effet (uYLimite* déjà en sentinelle).
      uPlancherRadial: { value: 0 },
      uZNear: { value: 0 },
      uFlareLongueur: { value: 0 }
    },
    vertexShader: `
      attribute vec3 color;
      attribute float aXFar;
      attribute float aYFar;
      varying float vIntensite;
      varying float vXFar;
      varying float vYFar;
      varying float vZ;
      void main() {
        vIntensite = color.r;
        vXFar = aXFar;
        vYFar = aYFar;
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
      uniform float uYLimiteReel;
      uniform float uYLimiteExagere;
      uniform float uPlancherRadial;
      uniform float uZNear;
      uniform float uFlareLongueur;
      varying float vIntensite;
      varying float vXFar;
      varying float vYFar;
      varying float vZ;
      void main() {
        // Fondu de la limite du plancher entre uXLimiteExagere/uYLimiteExagere (juste après la
        // fente, sur uFlareLongueur) et uXLimiteReel/uYLimiteReel (au-delà) — cf. commentaire à
        // uFlareLongueur. Ce plancher n'est qu'une aide visuelle (pas la silhouette réelle, déjà
        // correcte via halfHFar/luminosité, cf. construireGeometrieEnveloppe) mais sa FORME doit
        // rester fidèle : rectangulaire (produit de deux smoothstep 1D) pour un carré séparable,
        // radiale (cf. uPlancherRadial) pour un cercle — un test rectangulaire y donnait un
        // plancher en croix/carré arrondi, visiblement pas circulaire.
        float tFlare = uFlareLongueur > 0.0 ? clamp((vZ - uZNear) / uFlareLongueur, 0.0, 1.0) : 1.0;
        float xLimite = mix(uXLimiteExagere, uXLimiteReel, tFlare);
        float yLimite = mix(uYLimiteExagere, uYLimiteReel, tFlare);
        float poidsForme;
        if (uPlancherRadial > 0.5) {
          float r = length(vec2(vXFar / xLimite, vYFar / yLimite));
          poidsForme = 1.0 - smoothstep(0.85, 1.0, r);
        } else {
          float poidsX = 1.0 - smoothstep(xLimite * 0.85, xLimite, abs(vXFar));
          float poidsY = 1.0 - smoothstep(yLimite * 0.85, yLimite, abs(vYFar));
          poidsForme = poidsX * poidsY;
        }
        float alpha = max(vIntensite * uOpacite, uPlancherAlpha * poidsForme);
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

  // 6 enveloppes couleur (mode Lumière blanche), une par BLANCHE_COULEURS (cf. sim.js) : même
  // matériau que ci-dessus, CLONÉ (uniforms indépendants, cf. THREE.ShaderMaterial.copy) pour
  // que chaque couleur ait sa propre teinte ET son propre jeu d'uniforms uXLimite* (chaque λ a
  // son propre 1er minimum, cf. updateEnvelopeXLimite). Géométrie reconstruite (une FFT par
  // couleur) dans reconstruireEnveloppesBlanche(), appelée avec anti-rebond depuis
  // updateSceneParams() (cf. planifierEnveloppesBlanche).
  //
  // Blending ADDITIF (THREE.AdditiveBlending, PAS le blending normal de envMat ci-dessus,
  // conservé tel quel pour l'enveloppe mono) : la lumière réelle qui se superpose s'ADDITIONNE
  // (rouge+vert+bleu → blanc), contrairement à des calques de peinture semi-transparente (le
  // blending normal, lui, donnerait un mélange terne au lieu de blanc). uColor de chaque clone
  // est en plus normalisée par BLANCHE_REF (cf. sim.js — même normalisation que la texture
  // d'écran, intensiteBlancheRGB) : sans elle, même en additif, la somme des 6 teintes penche
  // côté chaud (violet/bleu moins représentés que jaune/orange/rouge dans ces 6 couleurs
  // précises) au lieu de redonner du blanc pur là où les 6 se superposent à pleine intensité.
  beamEnvelopeMeshesBlanche = ENVELOPPE_COULEURS_TEST.map(c => {
    const mat = envMat.clone();
    mat.blending = THREE.AdditiveBlending;
    const rgb = longueurOndeVersRGB(c.lambda);
    mat.uniforms.uColor.value.setRGB(rgb.r / ENVELOPPE_REF_TEST.r, rgb.g / ENVELOPPE_REF_TEST.g, rgb.b / ENVELOPPE_REF_TEST.b);
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    mesh.visible = false;
    sceneObj.add(mesh);
    return mesh;
  });

  // Point de couleur en sortie du laser, affiché en mode "Non visible" uniquement :
  // permet d'identifier la couleur λ en regardant droit dans l'axe du laser, sans
  // dessiner aucun faisceau (cf. discussion de conception avec l'utilisateur).
  beamDot = new THREE.Mesh(
    new THREE.SphereGeometry(BEAM_DIAMETER * 1.5, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
  );
  beamDot.position.set(0, 0, SOURCE_Z);
  sceneObj.add(beamDot);

  // Lame porte-fente (7×7 cm réels) — géométrie dépend de la forme d'ouverture choisie
  // (sim.maskShape, cf. sim.js → MASK_SHAPES), branchée dans updateSceneParams() :
  //  - fente/carré : 2 bandes pleines (haut/bas) + 2 murs latéraux, tous en géométrie
  //    UNITAIRE mise à l'échelle (pas de CSG — l'ouverture est l'espace laissé vide entre
  //    eux) ; carré = même écartement horizontal ET vertical (bandes devenues dynamiques,
  //    plus fixées à SLIT_BAND_HEIGHT comme avant).
  //  - fil : bandes haut/bas comme la fente (cadre inchangé), murs latéraux cachés, remplacés
  //    par wallCenter (fine barre centrale — le fil).
  //  - cercle : les 4 objets ci-dessus cachés, remplacés par slideCercleMesh (vrai trou
  //    circulaire découpé via THREE.Shape + trou, cf. reconstruireSlideCercle) : pas possible
  //    à obtenir avec des boîtes, contrairement aux 3 autres formes.
  const slideMat = new THREE.MeshStandardMaterial({ color: 0x555a60 });
  const bandGeo = new THREE.BoxGeometry(1, 1, 1);
  topBand = new THREE.Mesh(bandGeo, slideMat);
  bottomBand = new THREE.Mesh(bandGeo, slideMat);
  sceneObj.add(topBand, bottomBand);

  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  wallLeft = new THREE.Mesh(wallGeo, slideMat);
  wallRight = new THREE.Mesh(wallGeo, slideMat);
  wallCenter = new THREE.Mesh(wallGeo, slideMat);
  sceneObj.add(wallLeft, wallRight, wallCenter);

  // Géométrie remplacée à la demande par reconstruireSlideCercle() (placeholder vide ici).
  slideCercleMesh = new THREE.Mesh(new THREE.BufferGeometry(), slideMat);
  sceneObj.add(slideCercleMesh);

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

  // Axe optique pointillé blanc (rappel visuel de la direction de propagation),
  // affiché conjointement aux rayons vers les 1ers minima.
  const axisGeo = new THREE.BufferGeometry();
  axisGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(6).fill(0), 3));
  const axisMat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 2.2, gapSize: 1.4, transparent: true, opacity: 0.85 });
  axisLine = new THREE.Line(axisGeo, axisMat);
  sceneObj.add(axisLine);

  // Doubles flèches de mesure d, D, L (bouton "Afficher les longueurs")
  lengthsGroup = new THREE.Group();
  sceneObj.add(lengthsGroup);
  mesurePetitD = {
    fleche: creerFlecheDouble(LEN_COLOR),
    dash1: creerPointilleSegment(LEN_COLOR),
    dash2: creerPointilleSegment(LEN_COLOR),
    label: creerLabelMesure(18, 6.6) // taille ×3 (demande explicite)
  };
  mesureGrandD = {
    fleche: creerFlecheDouble(LEN_COLOR),
    dash1: creerPointilleSegment(LEN_COLOR),
    dash2: creerPointilleSegment(LEN_COLOR),
    label: creerLabelMesure(21, 7.8) // taille ×3 (demande explicite)
  };
  mesureL = {
    fleche: creerFlecheDouble(LEN_COLOR),        // variante volumique (cônes), utilisée en vue Dessus
    flechePlate: creerFlecheDoublePlate(LEN_COLOR), // variante plate (décalque écran), utilisée en 3D/Écran
    dash1: creerPointilleSegment(LEN_COLOR),
    dash2: creerPointilleSegment(LEN_COLOR),
    label: creerLabelMesure(5, 1.9) // taille laissée telle quelle en vue Écran (jugée parfaite) ; agrandie via .scale en vue Dessus
  };
  [mesurePetitD, mesureGrandD].forEach(m => {
    lengthsGroup.add(m.fleche, m.dash1, m.dash2, m.label);
  });
  lengthsGroup.add(mesureL.fleche, mesureL.flechePlate, mesureL.dash1, mesureL.dash2, mesureL.label);
}

// ─────────────────────────────────────────────────────────────────────
//  Remplit screenTexCanvas pour le mode Lumière blanche, à un degré de décomposition t (0 =
//  figure fusionnée normale, 1 = 6 figures monochromatiques séparées verticalement à
//  DECOMPOSE_Y_CM, valeurs intermédiaires = transition animée, cf. sim.js →
//  DECOMPOSE_Y_CM/intensiteBlancheComposantes et scene.js → tickDecompose/toggleDecompose).
//
//  PAS de fondu (essayé en simultané puis en 2 phases séquentielles, les deux jugés peu
//  convaincants par l'utilisateur) : un seul morphing continu. Chacune des 6 couleurs
//  contribue TOUJOURS à l'image (jamais d'opacité qui varie), seules sa POSITION verticale
//  et sa LARGEUR gaussienne interpolent, de (0, wCmFusion — partagées par les 6) à (sa
//  position/largeur propre cible). Pour que la somme des 6 reproduise EXACTEMENT la figure
//  fusionnée normale à t=0 (pas seulement une approximation visuelle), chaque composante est
//  normalisée INDIVIDUELLEMENT par BLANCHE_REF (au lieu de sommer d'abord puis normaliser la
//  somme, cf. intensiteBlancheRGB) : à t=0, les 6 largeurs/positions étant identiques, leur
//  Iy commun se factorise et la somme des composantes normalisées redonne exactement
//  merged.{r,g,b} — la transition n'est donc qu'un étirement/déplacement progressif de la
//  même image, jamais un fondu entre deux rendus différents.
//
//  Profils verticaux (Iy) précalculés PAR LIGNE, en dehors de la boucle sur les colonnes :
//  ils ne dépendent que de y (et de t), jamais de x — les calculer une fois par ligne plutôt
//  que largeur×hauteur fois évite ~500× plus d'appels à Math.exp(), notable puisque cette
//  fonction tourne en continu pendant l'animation (tickDecompose, à chaque frame).
//
//  Simplification assumée pour carré/cercle (diffraction verticale réelle, cf. mono ci-dessous
//  et construireGeometrieEnveloppe) : Iy reste ici le profil gaussien du faisceau INCIDENT,
//  jamais la vraie diffraction verticale de l'ouverture — reproduire celle-ci PAR COULEUR ET
//  PAR COLONNE casserait justement la factorisation « par ligne » ci-dessus, sur une fonction
//  qui tourne en continu pendant l'animation (déjà un point sensible en performance, cf.
//  ci-dessus). La texture mono (voir plus bas), qui n'a pas cette contrainte de fréquence
//  d'appel, reste elle exacte pour les 4 formes.
// ─────────────────────────────────────────────────────────────────────
function dessinerTextureEcranBlanche(t) {
  const w = screenTexCanvas.width, h = screenTexCanvas.height;
  const img = screenTexCtx.createImageData(w, h);
  const te = t * t * (3 - 2 * t); // smoothstep unique, pilote position ET largeur

  const wCmFusion = Math.max(RENDU_W_MIN_CM, largeurFaisceauGaussien(BLANCHE_LAMBDA_MOYENNE, sim.D) * 100);
  const n = BLANCHE_COULEURS.length;
  const wCmCiblesCouleurs = BLANCHE_COULEURS.map(c => Math.max(RENDU_W_MIN_CM, largeurFaisceauGaussien(c.lambda, sim.D) * 100));
  const wCourantCouleurs = wCmCiblesCouleurs.map(wc => wCmFusion + (wc - wCmFusion) * te);
  const yCourantCouleurs = DECOMPOSE_Y_CM.map(yCible => yCible * te);

  const iyCouleurs = Array.from({ length: n }, () => new Float64Array(h));
  for (let py = 0; py < h; py++) {
    const y_cm = -SCREEN_HEIGHT / 2 + (SCREEN_HEIGHT * py) / (h - 1);
    for (let k = 0; k < n; k++) {
      const dy = y_cm - yCourantCouleurs[k];
      const wk = wCourantCouleurs[k];
      iyCouleurs[k][py] = Math.exp(-2 * dy * dy / (wk * wk));
    }
  }

  for (let px = 0; px < w; px++) {
    const x = -sim.screenHalfWidth + (2 * sim.screenHalfWidth * px) / (w - 1);
    const { composantes } = intensiteBlancheComposantes(x, sim.a, sim.D);
    for (let py = 0; py < h; py++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < n; k++) {
        const iy = iyCouleurs[k][py];
        if (iy < 1e-4) continue; // hors gaussienne de cette bande : rien à ajouter
        const comp = composantes[k];
        r += (255 * comp.r / BLANCHE_REF.r) * iy;
        g += (255 * comp.g / BLANCHE_REF.g) * iy;
        b += (255 * comp.b / BLANCHE_REF.b) * iy;
      }
      const idx = (py * w + px) * 4;
      img.data[idx] = Math.min(255, Math.round(r));
      img.data[idx + 1] = Math.min(255, Math.round(g));
      img.data[idx + 2] = Math.min(255, Math.round(b));
      img.data[idx + 3] = 255;
    }
  }
  screenTexCtx.putImageData(img, 0, 0);
  screenTexture.needsUpdate = true;
}

// ─────────────────────────────────────────────────────────────────────
//  Reconstruit les 6 enveloppes couleur (une FFT complète par couleur — construireChampOuverture
//  — cf. discussion de conception : pas de raccourci analytique, pour rester généralisable à
//  d'autres formes de fente) : 6× le coût de l'enveloppe mono, d'où l'anti-rebond
//  (planifierEnveloppesBlanche ci-dessous), jamais appelée directement en dehors de ce fichier.
// ─────────────────────────────────────────────────────────────────────
function reconstruireEnveloppesBlanche() {
  const screenZ = SLIT_Z + sim.D * 100;
  x1CmCourantCouleurs = ENVELOPPE_COULEURS_TEST.map((c, k) => {
    const champC = construireChampOuverture(c.lambda, sim.a, sim.D);
    const wCmC = Math.max(RENDU_W_MIN_CM, largeurFaisceauGaussien(c.lambda, sim.D) * 100);
    const mesh = beamEnvelopeMeshesBlanche[k];
    mesh.geometry.dispose();
    mesh.geometry = construireGeometrieEnveloppe(SLIT_Z, screenZ, BEAM_DIAMETER, wCmC, champC);
    return xPremierMinimum(c.lambda, sim.a, sim.D) * 100;
  });
  updateEnvelopeXLimite();
}

// ─────────────────────────────────────────────────────────────────────
//  Planifie (avec anti-rebond, cf. ENVELOPPES_BLANCHE_DEBOUNCE_MS) la reconstruction des 6
//  enveloppes couleur. Chaque appel annule le délai précédent : seul le DERNIER changement
//  dans une rafale (glissement de slider) déclenche effectivement les 6 FFT, ~100 ms après
//  que l'utilisateur s'est arrêté. Appelée par updateSceneParams() (λ/a/D changent, en mode
//  blanc) et updateBeamVisibility() (le faisceau devient visible sans que a/D/λ aient changé).
// ─────────────────────────────────────────────────────────────────────
function planifierEnveloppesBlanche() {
  clearTimeout(enveloppesBlancheTimer);
  enveloppesBlancheTimer = setTimeout(reconstruireEnveloppesBlanche, ENVELOPPES_BLANCHE_DEBOUNCE_MS);
}

// ─────────────────────────────────────────────────────────────────────
//  Annule une reconstruction des 6 enveloppes couleur en attente (anti-rebond) — appelée en
//  quittant le mode blanc (ui.js → syncModeBlancheUI), pour ne pas relancer 6 FFT inutiles
//  ~100 ms plus tard pour un mode qu'on vient de quitter.
// ─────────────────────────────────────────────────────────────────────
function annulerEnveloppesBlancheEnAttente() {
  clearTimeout(enveloppesBlancheTimer);
}

// ─────────────────────────────────────────────────────────────────────
//  Met à jour tous les objets 3D suite à un changement de λ, a, D, d ou
//  de l'option "rayons". Appelée par ui.js → updateParam()/toggleRays().
// ─────────────────────────────────────────────────────────────────────
function updateSceneParams() {
  const D_cm = sim.D * 100;
  const estBlanche = sim.lightSource === 'blanche';
  // Faisceau avant la fente : blanc en lumière blanche (les λ ne sont pas encore séparées à
  // ce stade, cf. discussion de conception), sinon couleur de λ.
  const couleurHex = estBlanche ? 0xffffff : longueurOndeVersHex(sim.lambda);

  // Position de la fente selon d (distance laser-fente, réglable) : le laser reste fixe
  // (SOURCE_Z), la fente se décale vers l'avant quand d augmente. L'écran suit (cf.
  // screenZ plus bas) pour garder D inchangé, sauf si sa borne max (appliquée en amont
  // dans ui.js → appliquerBorneD) a déjà réduit D. Le faisceau laser→fente est reconstruit
  // (sa longueur dépend de d), comme l'enveloppe diffractée plus bas.
  SLIT_Z = SOURCE_Z + sim.d * 100;
  const screenZ = SLIT_Z + D_cm; // position absolue de l'écran (fente + D)
  beamMesh.geometry.dispose();
  beamMesh.geometry = new THREE.CylinderGeometry(BEAM_DIAMETER / 2, BEAM_DIAMETER / 2, SLIT_Z - SOURCE_Z, 12);
  beamMesh.geometry.rotateX(Math.PI / 2);
  beamMesh.position.set(0, 0, (SOURCE_Z + SLIT_Z) / 2);

  beamMesh.material.color.setHex(couleurHex);
  beamDot.material.color.setHex(couleurHex);

  // Lame porte-fente : dimensionnement de tous les objets candidats selon la forme
  // d'ouverture (sim.maskShape, cf. la docstring de construireObjets pour le détail de
  // chaque cas) — la visibilité, elle, est tranchée séparément par refreshSlideVisibility()
  // ci-dessous. Écartement visuel schématique (gap), commun aux 4 formes (cf. sim.js →
  // MASK_SHAPES) ; lame et support suivent SLIT_Z dans tous les cas.
  const gap = largeurFenteVisuelle(sim.a);
  const wallW = (SLIDE_SIZE - gap) / 2;
  const maskShape = sim.maskShape;

  wallLeft.scale.set(wallW, SLIT_BAND_HEIGHT, SLIDE_THICK);
  wallLeft.position.set(-(gap / 2 + wallW / 2), 0, SLIT_Z);
  wallRight.scale.set(wallW, SLIT_BAND_HEIGHT, SLIDE_THICK);
  wallRight.position.set(gap / 2 + wallW / 2, 0, SLIT_Z);

  // Bandes haut/bas : ouverture verticale = SLIT_BAND_HEIGHT (fente/fil, cadre fixe) ou `gap`
  // (carré — même écartement horizontal ET vertical, ouverture carrée). Sans effet visible
  // pour le cercle (bandes cachées par refreshSlideVisibility).
  const bandOuvertureH = (maskShape === 'carre') ? gap : SLIT_BAND_HEIGHT;
  const marginBandH = (SLIDE_SIZE - bandOuvertureH) / 2;
  topBand.scale.set(SLIDE_SIZE, marginBandH, SLIDE_THICK);
  topBand.position.set(0, bandOuvertureH / 2 + marginBandH / 2, SLIT_Z);
  bottomBand.scale.set(SLIDE_SIZE, marginBandH, SLIDE_THICK);
  bottomBand.position.set(0, -(bandOuvertureH / 2 + marginBandH / 2), SLIT_Z);

  // Fil : barre centrale (le fil), même largeur visuelle `gap` que l'écartement des murs des
  // autres formes, hauteur du cadre SLIT_BAND_HEIGHT.
  wallCenter.scale.set(gap, SLIT_BAND_HEIGHT, SLIDE_THICK);
  wallCenter.position.set(0, 0, SLIT_Z);

  // Cercle : vrai trou circulaire (rayon = gap/2), géométrie reconstruite uniquement pour
  // cette forme (coûteuse — nouvelle géométrie à chaque appel — inutile pour les 3 autres).
  if (maskShape === 'cercle') reconstruireSlideCercle(gap / 2);
  slideCercleMesh.position.set(0, 0, SLIT_Z);

  refreshSlideVisibility();
  supportSlide.position.z = SLIT_Z;

  // Écran : position selon D à partir de la fente (le support suit en z uniquement — x/y
  // jamais touchés, pour ne pas casser l'alignement optique vertical)
  screenMesh.position.set(0, 0, screenZ);
  supportScreen.position.z = screenZ;

  // Texture d'intensité. I(x) (horizontal) vient du champ FFT (construireChampOuverture, cf.
  // sim.js et commentaire à sa déclaration ci-dessous) — PAS de echantillonnerIntensite/
  // intensiteOuverture, réservées au graphe et aux encarts (cf. discussion de conception). Le
  // profil VERTICAL affiché ici, lui, reste le profil gaussien du faisceau calculé séparément
  // (largeurFaisceauGaussien) plutôt que lu dans le champ FFT à un y quelconque : la fente
  // (beaucoup plus haute que le faisceau, cf. FENTE_HAUTEUR_CM) ne le contraint pas, et
  // conserver ce facteur séparé évite de changer la compression d'affichage habituelle
  // (racine carrée) appliquée uniquement à la composante horizontale, cf. IxAffichage plus
  // bas. Identique pour l'ordre central et les ordres secondaires, comme sur une vraie photo
  // de diffraction : sans lui, la figure ressemble à des bandes verticales infinies au lieu
  // de taches.
  const w = screenTexCanvas.width, h = screenTexCanvas.height;
  const { r: r0, g: g0, b: b0 } = longueurOndeVersRGB(sim.lambda);
  const x1_cm = xPremierMinimum(sim.lambda, sim.a, sim.D) * 100;

  // Rayon gaussien du faisceau à l'écran (largeurFaisceauGaussien, cf. sim.js) — utilisé à la
  // fois comme demi-hauteur max de l'enveloppe ci-dessous et pour le profil vertical de la
  // texture d'écran plus bas (RENDU_W_MIN_CM : cf. commentaire à sa définition).
  const w_cm = Math.max(RENDU_W_MIN_CM, largeurFaisceauGaussien(sim.lambda, sim.D) * 100);
  x1CmCourant = x1_cm; // toujours à jour (rayons/longueurs plus bas), même en mode blanc

  if (estBlanche) {
    // Enveloppe(s) : 6 FFT complètes (une par couleur), coûteuses — reconstruites avec
    // anti-rebond plutôt qu'ici (cf. planifierEnveloppesBlanche), pour ne pas saccader le
    // glissement des sliders, et seulement si elles seraient effectivement visibles (inutile
    // de les calculer tant que sim.beamMode !== 'visible' ou qu'on est en vue Écran, cf.
    // updateBeamVisibility — qui se charge aussi de planifier la reconstruction si l'une de
    // ces deux conditions change sans que a/D/λ n'aient bougé). L'enveloppe mono
    // (beamEnvelopeMesh) n'est pas touchée : cachée tant que le mode blanc est actif.
    if (sim.beamMode === 'visible' && sim.view !== 'screen') planifierEnveloppesBlanche();
    // Texture d'écran entièrement déléguée (fusionnée / décomposée / transition, cf. sa
    // docstring) — remplace le double-boucle générique ci-dessous, propre au mode mono.
    dessinerTextureEcranBlanche(decomposeT);
  } else {
    // Champ diffracté (masque de la fente × faisceau incident, propagé par FFT, cf. sim.js) —
    // calculé UNE FOIS ici, partagé par la texture d'écran ci-dessous et l'enveloppe 3D
    // (construireGeometrieEnveloppe) : source physique unique pour tout ce qui est affiché en
    // x, à la place d'intensiteOuverture() (qui reste, elle, la source du graphe I(x) et des
    // encarts — cf. discussion de conception, aucune des deux ne doit dépendre de l'autre).
    const champ = construireChampOuverture(sim.lambda, sim.a, sim.D);

    // Enveloppe pleine du faisceau diffracté (cf. commentaire à la construction) : reconstruite
    // entièrement à chaque appel, la silhouette et le profil de luminosité changent avec a/D/λ.
    // uXLimite (position du 1er minimum, même x1_cm que raysLine plus bas) borne le plancher
    // d'opacité du shader (cf. construireObjets) à la seule zone de la tache centrale.
    updateEnvelopeXLimite();
    beamEnvelopeMesh.material.uniforms.uColor.value.setHex(couleurHex);
    beamEnvelopeMesh.geometry.dispose();
    beamEnvelopeMesh.geometry = construireGeometrieEnveloppe(SLIT_Z, screenZ, BEAM_DIAMETER, w_cm, champ);

    // Carré/cercle diffractent réellement en y : leur profil vertical vient directement d'un
    // échantillonnage 2D du champ FFT (comme x), pas du profil gaussien du faisceau INCIDENT
    // (Iy ci-dessous) — valable seulement pour fente/fil, cf. même distinction que
    // construireGeometrieEnveloppe.
    const balayage2D = (sim.maskShape === 'carre' || sim.maskShape === 'cercle');
    const img = screenTexCtx.createImageData(w, h);
    for (let px = 0; px < w; px++) {
      const x = -sim.screenHalfWidth + (2 * sim.screenHalfWidth * px) / (w - 1);
      const Ix = echantillonnerChamp(champ, x, 0); // y=0 : le champ est normalisé (pic=1) comme intensiteOuverture(), et le profil vertical (Iy ci-dessous) reste appliqué séparément (fente/fil uniquement)
      // Les ordres secondaires sont physiquement très faibles (1er ≈ 4,5 % du maximum central,
      // cf. sinc²) : en couleur linéaire ils sont quasi invisibles à l'écran. On applique une
      // racine carrée uniquement ici (affichage), jamais dans intensiteOuverture() ni dans le
      // graphe I(x) qui doivent rester l'intensité physique exacte, sans quoi une lecture
      // quantitative sur le graphe serait faussée.
      const IxAffichage = Math.sqrt(Ix);
      const rx = r0 * IxAffichage, gx = g0 * IxAffichage, bx = b0 * IxAffichage;
      for (let py = 0; py < h; py++) {
        const y_cm = -SCREEN_HEIGHT / 2 + (SCREEN_HEIGHT * py) / (h - 1); // position physique verticale (cm)
        let r, g, b;
        if (balayage2D) {
          const I2 = Math.sqrt(echantillonnerChamp(champ, x, y_cm / 100));
          r = Math.round(r0 * I2); g = Math.round(g0 * I2); b = Math.round(b0 * I2);
        } else {
          const Iy = Math.exp(-2 * y_cm * y_cm / (w_cm * w_cm)); // profil gaussien standard (convention laser : I(r)=I0·exp(-2r²/w²))
          r = Math.round(rx * Iy); g = Math.round(gx * Iy); b = Math.round(bx * Iy);
        }
        const idx = (py * w + px) * 4;
        img.data[idx] = r; img.data[idx + 1] = g; img.data[idx + 2] = b; img.data[idx + 3] = 255;
      }
    }
    screenTexCtx.putImageData(img, 0, 0);
    screenTexture.needsUpdate = true;
  }

  // Rayons vers les 1ers minima — masqués en vue Écran : une caméra orthographique de face
  // ne représente pas la profondeur, donc les deux rayons s'y aplatissent en un simple trait
  // horizontal (start et fin à même x,y projetés) qui n'apporte rien dans cette vue précise.
  raysLine.visible = sim.showRays && sim.view !== 'screen';
  raysLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, SLIT_Z,  x1_cm, 0, screenZ,
    0, 0, SLIT_Z, -x1_cm, 0, screenZ
  ], 3));
  // computeLineDistances() cumule la distance sur TOUS les sommets sans la
  // remettre à zéro à chaque paire (bug connu de Three.js pour LineSegments) :
  // le 2ème rayon héritait de la longueur du 1er, d'où des pointillés décalés
  // entre les deux rayons. On calcule donc la distance manuellement, par paire.
  const rayLen = Math.hypot(x1_cm, D_cm);
  raysLine.geometry.setAttribute('lineDistance', new THREE.Float32BufferAttribute([
    0, rayLen,
    0, rayLen
  ], 1));

  axisLine.visible = sim.showRays && sim.view !== 'screen';
  axisLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, SLIT_Z, 0, 0, screenZ
  ], 3));
  axisLine.computeLineDistances();

  updateLengthsGroup(x1_cm, w_cm);
  updateBeamVisibility();
}

// ─────────────────────────────────────────────────────────────────────
//  Doubles flèches de mesure d (laser→fente), D (fente→écran) et L
//  (largeur de la tache centrale), affichées si sim.showLengths.
//  Repositionnées entièrement selon la vue courante (cf. commentaires
//  ci-dessous) : appelée depuis updateSceneParams() (λ/a/D changent) et
//  setSceneView() (juste un changement de vue, mêmes calculs).
// ─────────────────────────────────────────────────────────────────────
function updateLengthsGroup(x1_cm, w_cm) {
  if (!sim.showLengths) { lengthsGroup.visible = false; return; }
  lengthsGroup.visible = true;

  const D_cm = sim.D * 100;
  const screenZ = SLIT_Z + D_cm; // position absolue de l'écran (fente + D)
  const d_cm = SLIT_Z - SOURCE_Z; // dépend de sim.d, mis à jour dans updateSceneParams()
  const view = sim.view;

  // Vues Dessus/Profil : la caméra ortho recule à mesure que D grandit au-delà de
  // D_CADRAGE_MIN_CM (cf. updateOrthoCamera → D_cadrage), ce qui réduit d'autant la taille
  // apparente à l'écran de tout ce qui a une taille fixe en cm — dont nos labels. On
  // compense en agrandissant leur géométrie dans les mêmes proportions, pour qu'ils gardent
  // toujours leur taille apparente MAXIMALE (celle qu'ils ont pour D ≤ D_CADRAGE_MIN_CM),
  // jamais plus petits quel que soit D. Vue 3D et vue Écran : pas concernées (pas de ce
  // mécanisme de cadrage), donc facteur neutre (1).
  const D_cadrage = Math.max(D_cm, D_CADRAGE_MIN_CM);
  const zoomCompense = (view === 'top' || view === 'side') ? (D_cadrage / D_CADRAGE_MIN_CM) : 1;

  // d, D : masquées en vue Écran (profondeur nulle de face, cf. raysLine).
  const showTableArrows = (view !== 'screen');
  mesurePetitD.fleche.visible = mesurePetitD.dash1.visible = mesurePetitD.dash2.visible = mesurePetitD.label.visible = showTableArrows;
  mesureGrandD.fleche.visible = mesureGrandD.dash1.visible = mesureGrandD.dash2.visible = mesureGrandD.label.visible = showTableArrows;

  if (showTableArrows) {
    if (view === 'side') {
      // Vue Profil : flèches dans la tranche de la table (x=0, invisibles autrement de
      // cette vue), labels sous la table.
      placerMesureTable(mesurePetitD, 0, LEN_SIDE_Y, LEN_SIDE_LABEL_Y, SOURCE_Z, SLIT_Z, true);
      placerMesureTable(mesureGrandD, 0, LEN_SIDE_Y, LEN_SIDE_LABEL_Y, SLIT_Z, screenZ, true);
    } else {
      // Vue 3D / Dessus : flèches décalées latéralement pour ne pas être gênées par les
      // supports, sur le plateau de la table.
      placerMesureTable(mesurePetitD, LEN_OFFSET_X, LEN_ARROW_Y_TABLE, LEN_LABEL_Y_TABLE, SOURCE_Z, SLIT_Z, false);
      placerMesureTable(mesureGrandD, LEN_OFFSET_X, LEN_ARROW_Y_TABLE, LEN_LABEL_Y_TABLE, SLIT_Z, screenZ, false);
    }
    mesurePetitD.label.scale.set(zoomCompense, zoomCompense, 1);
    mesureGrandD.label.scale.set(zoomCompense, zoomCompense, 1);
    setLabelTexte(mesurePetitD.label, 'd = ' + formatFr(d_cm, 1) + ' cm');
    setLabelTexte(mesureGrandD.label, 'D = ' + formatFr(sim.D, 2) + ' m');
  }

  // L : masquée en vue Profil (une ligne horizontale sur l'écran, vu de côté, n'apporte rien).
  const showL = (view !== 'side');
  const showLTop = showL && view === 'top';
  const showLEcran = showL && view !== 'top';
  mesureL.fleche.visible = showLTop;       // variante volumique (cônes) : vue Dessus seulement
  mesureL.flechePlate.visible = showLEcran; // variante plate : 3D/Écran, à même le plan de l'écran
  mesureL.dash1.visible = mesureL.dash2.visible = mesureL.label.visible = showL;
  if (showL) {
    if (view === 'top') {
      // Vue Dessus : la flèche « au-dessus de la tache » (axe Y) est aplatie par cette vue ;
      // on la reporte légèrement derrière l'écran, label encore un peu plus à droite.
      const zArrow = screenZ + LEN_TOP_L_DECALAGE_Z;
      setFlecheDoubleLongueur(mesureL.fleche, 2 * x1_cm);
      mesureL.fleche.rotation.set(0, 0, 0);
      mesureL.fleche.position.set(0, 0, zArrow);
      placerPointilleSegment(mesureL.dash1, [-x1_cm, 0, zArrow], [-x1_cm, 0, screenZ], 'y');
      placerPointilleSegment(mesureL.dash2, [x1_cm, 0, zArrow], [x1_cm, 0, screenZ], 'y');
      // Sens de lecture aligné sur la flèche (axe X, comme celle-ci), normale vers le haut —
      // cf. orienterDecalque et placerMesureTable pour le même principe appliqué à d/D.
      // Vue Dessus : l'axe X du monde correspond à la verticale de l'écran (camOrtho.up=
      // (1,0,0), cf. updateOrthoCamera) ; le sens de lecture est inversé par rapport au cas
      // « naturel » ci-dessus pour que le début du label soit en haut et la fin en bas.
      orienterDecalque(mesureL.label, [-1, 0, 0], [0, 0, 1]);
      const echelleL = 3 * zoomCompense; // agrandi ×3 comme d/D, + compensation du zoom Dessus/Profil
      mesureL.label.scale.set(echelleL, echelleL, 1);
      // Centré sur l'axe optique (x=0, comme le milieu de la flèche elle-même) : décalé
      // seulement en z (« à droite » sur cette vue, cf. LEN_TOP_L_LABEL_DECALAGE_Z), jamais
      // en x — un décalage en x le désaxerait par rapport à l'axe optique.
      mesureL.label.position.set(0, 0.02, zArrow + LEN_TOP_L_LABEL_DECALAGE_Z);
    } else {
      // Vue 3D / Écran : décalque STRICTEMENT plat, à même le plan de l'écran (z = screenZ,
      // aucun recul) — flèche plate dédiée (creerFlecheDoublePlate) plutôt que la variante à
      // cônes 3D, et pointillés dont les deux extrémités restent à z = screenZ (jamais un
      // segment qui sortirait du plan de l'écran).
      const yArrow = Math.min(SCREEN_HEIGHT / 2 - 1.4, w_cm + 1.8);
      setFlecheDoublePlateLongueur(mesureL.flechePlate, 2 * x1_cm);
      mesureL.flechePlate.rotation.set(0, 0, 0);
      mesureL.flechePlate.position.set(0, yArrow, screenZ);
      placerPointilleSegment(mesureL.dash1, [-x1_cm, yArrow, screenZ], [-x1_cm, 0, screenZ], 'z', LEN_DASH_THICK_L_ECRAN);
      placerPointilleSegment(mesureL.dash2, [x1_cm, yArrow, screenZ], [x1_cm, 0, screenZ], 'z', LEN_DASH_THICK_L_ECRAN);
      // Décalque contre l'écran : la normale doit faire face à la source/caméra (côté -Z),
      // pas s'en éloigner, sinon le texte se lit à l'envers (bug initial, cf. écran lui-même
      // vu depuis le laser et non depuis l'extérieur).
      orienterDecalque(mesureL.label, [-1, 0, 0], [0, 1, 0]);
      mesureL.label.scale.set(1, 1, 1); // taille de base (jugée parfaite), ne pas tripler ici
      mesureL.label.position.set(0, yArrow + 1.3, screenZ);
    }
    setLabelTexte(mesureL.label, 'L = ' + formatFr(2 * x1_cm, 2) + ' cm');
  }
}

// Place une flèche "table" (d ou D) le long de l'axe optique (Z), avec ses 2 pointillés
// de rappel. En vue Profil (dansLaTranche=true), les flèches restent à x=0 (déjà dans
// l'épaisseur de la table) : les pointillés relient alors verticalement la flèche au
// dessus du plateau plutôt qu'horizontalement vers l'axe.
//
// Orientation du label : sens de lecture toujours le long de l'axe optique (Z), comme la
// flèche elle-même (jamais perpendiculaire). La normale visible change selon la vue :
// - 3D/Dessus : normale vers le haut (+Y), lu depuis au-dessus — cf. orienterDecalque.
// - Profil : normale vers -X (côté caméra Profil, positionnée en x=-500), sinon le
//   décalque serait vu par la tranche (donc invisible), cf. bug initial.
//
// Le label est décalé plus loin que la flèche vers l'extérieur de la table (x plus grand,
// hors tranche) : en vue Dessus, où l'écart Y avec la flèche est aplati (donc invisible),
// c'est cet écart en X — qui correspond à « vers le haut » de cette vue, cf.
// camOrtho.up=(1,0,0) dans updateOrthoCamera — qui les sépare visuellement.
function placerMesureTable(mesure, x, y, yLabel, z0, z1, dansLaTranche) {
  const longueur = Math.abs(z1 - z0);
  const zCentre = (z0 + z1) / 2;
  setFlecheDoubleLongueur(mesure.fleche, longueur);
  mesure.fleche.rotation.set(0, -Math.PI / 2, 0); // aligne l'axe local X sur l'axe monde Z
  mesure.fleche.position.set(x, y, zCentre);

  if (dansLaTranche) {
    placerPointilleSegment(mesure.dash1, [x, y, z0], [x, TABLE_Y, z0], 'x');
    placerPointilleSegment(mesure.dash2, [x, y, z1], [x, TABLE_Y, z1], 'x');
    orienterDecalque(mesure.label, [0, 0, 1], [0, 1, 0]);
    mesure.label.position.set(x, yLabel, zCentre);
  } else {
    placerPointilleSegment(mesure.dash1, [x, y, z0], [0, y, z0], 'y');
    placerPointilleSegment(mesure.dash2, [x, y, z1], [0, y, z1], 'y');
    orienterDecalque(mesure.label, [0, 0, 1], [1, 0, 0]);
    mesure.label.position.set(x + LEN_LABEL_X_EXTRA_TABLE, yLabel, zCentre);
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Applique la largeur du plancher d'opacité (uXLimite, cf. envMat) à un jeu d'uniforms
//  donné, pour la valeur x1Cm fournie (1er minimum, en cm) : valeur physique réelle partout,
//  sauf en vue de dessus où elle est agrandie (cf. TOP_VIEW_PLANCHER_GAIN) pour rester
//  lisible à l'échelle du banc entier. Factorisé pour être appliqué à la fois à l'enveloppe
//  mono (x1CmCourant) et à chacune des 6 enveloppes couleur (x1CmCourantCouleurs, cf.
//  updateEnvelopeXLimite ci-dessous), qui partagent la même logique de vue mais pas la même
//  valeur de x1.
// ─────────────────────────────────────────────────────────────────────
function appliquerXLimiteUniforms(u, x1Cm) {
  // Pendant vertical (cf. uYLimite* dans construireObjets) : même valeur que x1Cm pour une
  // ouverture symétrique (carré/cercle, même écart angulaire dans les deux directions), sinon
  // une sentinelle très grande (fente/fil — pas de contrainte verticale réelle à cette échelle,
  // cf. FENTE_HAUTEUR_CM) — NON soumise au plafond SCREEN_WIDTH/2 ci-dessous (réservé à x, qui
  // reste toujours dans les dimensions de l'écran), pour ne pas réduire la sentinelle sous une
  // valeur réellement atteinte par des rayons.
  const symetrique = (sim.maskShape === 'carre' || sim.maskShape === 'cercle');
  const y1Cm = symetrique ? x1Cm : 1e6;
  u.uXLimiteReel.value = x1Cm;
  u.uYLimiteReel.value = y1Cm;
  u.uPlancherRadial.value = (sim.maskShape === 'cercle') ? 1 : 0;
  if (sim.view === 'top') {
    u.uXLimiteExagere.value = Math.min(x1Cm * TOP_VIEW_PLANCHER_GAIN, SCREEN_WIDTH / 2 * 0.5);
    u.uYLimiteExagere.value = symetrique ? Math.min(y1Cm * TOP_VIEW_PLANCHER_GAIN, SCREEN_WIDTH / 2 * 0.5) : y1Cm;
    u.uZNear.value = SLIT_Z;
    u.uFlareLongueur.value = TOP_VIEW_FLARE_LONGUEUR_CM;
  } else {
    u.uXLimiteExagere.value = x1Cm;
    u.uYLimiteExagere.value = y1Cm;
    u.uFlareLongueur.value = 0;
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Met à jour uXLimite* sur l'enveloppe mono ET les 6 enveloppes couleur (mode blanc) — cf.
//  appliquerXLimiteUniforms. Appelée par updateSceneParams()/reconstruireEnveloppesBlanche()
//  (λ/a/D changent) et setSceneView() (juste un changement de vue, x1Cm* inchangés) — mêmes
//  déclencheurs que raysLine.visible/updateBeamVisibility (cf. ARCHITECTURE.md).
// ─────────────────────────────────────────────────────────────────────
function updateEnvelopeXLimite() {
  appliquerXLimiteUniforms(beamEnvelopeMesh.material.uniforms, x1CmCourant);
  for (let k = 0; k < beamEnvelopeMeshesBlanche.length; k++) {
    appliquerXLimiteUniforms(beamEnvelopeMeshesBlanche[k].material.uniforms, x1CmCourantCouleurs[k] || 0);
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
  const estBlanche = sim.lightSource === 'blanche';
  beamMesh.visible = !cacherBanc && sim.beamMode !== 'off';
  beamEnvelopeMesh.visible = !cacherBanc && sim.beamMode === 'visible' && !estBlanche;
  const enveloppesBlancheVisibles = !cacherBanc && sim.beamMode === 'visible' && estBlanche;
  for (const m of beamEnvelopeMeshesBlanche) m.visible = enveloppesBlancheVisibles;
  // Les 6 enveloppes n'étant reconstruites qu'avec anti-rebond (cf. planifierEnveloppesBlanche),
  // on déclenche/rafraîchit la reconstruction dès qu'elles deviennent effectivement visibles
  // (sinon, en entrant dans ce mode sans changer a/D/λ juste après, la géométrie resterait
  // celle — potentiellement vide ou périmée — du dernier calcul).
  if (enveloppesBlancheVisibles) planifierEnveloppesBlanche();
  beamDot.visible = !cacherBanc && sim.beamMode === 'off';
}

// ─────────────────────────────────────────────────────────────────────
//  Bascule la vue caméra active. Appelée par ui.js → setView().
// ─────────────────────────────────────────────────────────────────────
function setSceneView(view) {
  // Changer réellement de vue annule la décomposition en cours (instantanément, pas
  // d'animation, cf. annulerDecompose) — un simple re-clic sur la vue déjà active ne doit
  // pas couper une décomposition en cours (rien n'a changé).
  if (view !== sim.view) annulerDecompose();
  sim.view = view;
  syncBoutonDecompose();
  controls.enabled = (view === '3d');
  const cacherBanc = (view === 'screen');
  laserBody.visible = !cacherBanc;
  refreshSlideVisibility();
  supportLaser.visible = !cacherBanc;
  supportSlide.visible = !cacherBanc;
  raysLine.visible = sim.showRays && view !== 'screen';
  axisLine.visible = sim.showRays && view !== 'screen';
  const x1_cm = xPremierMinimum(sim.lambda, sim.a, sim.D) * 100;
  const w_cm = Math.max(RENDU_W_MIN_CM, largeurFaisceauGaussien(sim.lambda, sim.D) * 100);
  updateLengthsGroup(x1_cm, w_cm);
  updateEnvelopeXLimite();
  updateBeamVisibility();
  syncGraphAvecVueEcran();
  if (typeof syncGraphLienDisponibilite === 'function') syncGraphLienDisponibilite();
}

// ─────────────────────────────────────────────────────────────────────
//  Repositionne la caméra 3D (perspective) sur son cadrage par défaut.
// ─────────────────────────────────────────────────────────────────────
function reset3DCamera() {
  const D_cm = sim.D * 100;
  const slitZ = SOURCE_Z + sim.d * 100;
  const zTarget = slitZ + D_cm * 0.25;
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
  const screenZ = SLIT_Z + D_cm;
  // Cadrage figé en dessous de D_CADRAGE_MIN_CM : sous ce seuil, réduire D ne fait plus
  // « zoomer » les vues Dessus/Profil (recentrage + rétrécissement du cadre à chaque
  // frame, gênant pour observer l'écran se rapprocher) — seul D_cadrage reste borné, la
  // position réelle de l'écran (updateSceneParams, D_cm non modifié) continue de suivre D.
  const D_cadrage = Math.max(D_cm, D_CADRAGE_MIN_CM);
  const screenZCadrage = SLIT_Z + D_cadrage;
  const zCenter = (SOURCE_Z + screenZCadrage) / 2;
  const halfSpanZ = (screenZCadrage - SOURCE_Z) / 2 * 1.15;

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
    camOrtho.lookAt(0, 0, screenZ);
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
//  Recale la fenêtre du graphe I(x) (graph.js → gview) sur le cadrage RÉEL de la vue Écran
//  (camOrtho.left/right, déjà recalculés par updateOrthoCamera pour l'aspect et le zoom
//  courants), de façon pixel-parfaite (cf. graph.js → syncGraphPixelParfait — même échelle
//  px/m ET même centre de page que la scène, pas juste la même plage physique) : ainsi les
//  pointillés de dessinerLienFigure() restent rigoureusement verticaux. Appelée après tout
//  changement affectant ce cadrage : zoom molette (initZoomVersCurseur), bascule vers la
//  vue Écran (setSceneView), redimensionnement (resizeScene) — sans quoi le graphe
//  resterait basé sur l'ancien cadrage.
// ─────────────────────────────────────────────────────────────────────
function syncGraphAvecVueEcran() {
  if (sim.view !== 'screen') return;
  const aspect = canvasEl.clientWidth / canvasEl.clientHeight;
  updateOrthoCamera(aspect);
  if (typeof syncGraphPixelParfait === 'function') syncGraphPixelParfait();
}

// ─────────────────────────────────────────────────────────────────────
//  Position horizontale d'un point physique de l'écran (x_m, mètres) dans le canvas 3D
//  courant, en fraction 0..1 de sa largeur — utilisée par graph.js → dessinerLienFigure()
//  pour aligner les pointillés reliant graphe et figure. Valide uniquement en vue Écran
//  (camOrtho.left/right y sont recalculés en continu par updateOrthoCamera, cf.
//  renderScene) : une caméra orthographique remplit TOUJOURS tout le canvas entre
//  left et right, sans letterboxing — contrairement à une caméra perspective, la
//  conversion est donc une simple règle de trois, aucune projection à faire.
// ─────────────────────────────────────────────────────────────────────
function fracXVueEcran(x_m) {
  const xCm = x_m * 100;
  return (xCm - camOrtho.left) / (camOrtho.right - camOrtho.left);
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
