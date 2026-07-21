// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
//  sim.js — État global et physique de l'interférence (fentes/trous d'Young)
//  Chargé en premier : ne dépend d'aucun autre fichier du projet.
// ═══════════════════════════════════════════════════

// ── État central de la simulation ──
const sim = {
  lambda: 633,     // longueur d'onde du laser (nm)
  a: 100,          // grandeur caractéristique de CHAQUE ouverture (µm) — largeur (fente) ou rayon (trou)
  b: 500,          // écartement entre les CENTRES des deux ouvertures (µm)
  d: 0.50,         // distance laser-fentes (m)
  D: 1.0,          // distance fentes-écran (m)
  lightSource: 'mono', // 'mono' (monochromatique, réglable via λ) | 'blanche' (lumière blanche)
  blancheVisibles: {}, // { [nom de couleur]: bool } — courbes cochées dans la légende du graphe (blanche), rempli plus bas (cf. BLANCHE_COULEURS)
  showRays: false, // afficher les rayons pointillés vers le 1er zéro de l'enveloppe de diffraction + l'axe optique
  beamMode: 'off', // 'off' (aucun faisceau) | 'laserOnly' (laser→fentes) | 'visible' (laser + interférence)
  showLengths: false, // afficher les doubles flèches de mesure d, D, L
  view: '3d',      // '3d' | 'top' | 'side' | 'screen'
  echelleAngleTop: false, // vue Dessus uniquement : grossit l'angle affiché (cf. scene.js → updateOrthoCamera)
  maskShape: 'fente', // 'fente' (fentes d'Young verticales) | 'cercle' (trous d'Young) — forme des 2 ouvertures
  showGraphIntensite: false, // afficher le graphe I(x) sous la scène 3D (avec splitter) — désactivé par défaut
  showValeursExp: false, // afficher les cadres de valeurs expérimentales (angle, interfrange...) — désactivé par défaut

  // Demi-largeur physique de l'écran simulé (m) — fixe, écran réel de TP 25×15 cm, cf. ARCHITECTURE.md
  screenHalfWidth: 0.125
};

// ── Bornes du réglage de la grandeur caractéristique a (µm) — aussi utilisées par
//    scene.js pour la correspondance avec la largeur visuelle schématique.
//    Les autres bornes (λ, D) ne vivent que dans les attributs min/max
//    des <input type=range> du panneau, pas dupliquées ici.
const A_MIN = 20, A_MAX = 500;

// ── Bornes du réglage de l'écartement b (µm) entre les centres des deux ouvertures ──
const B_MIN = 100, B_MAX = 1000;

// ── Formes d'ouverture disponibles pour la diapositive (2 ouvertures identiques, cf. b) ──
// `aLabel` : texte du <label> du slider `a` (son sens physique change selon la forme — largeur de
// chaque fente ou rayon de chaque trou — mais garde les mêmes bornes A_MIN/A_MAX ci-dessus, la
// représentation 3D de la diapo étant de toute façon schématique, cf. largeurFenteVisuelle dans
// scene.js, pas à l'échelle réelle).
const MASK_SHAPES = {
  fente:  { label: "Fentes d'Young (verticales)", aLabel: "Largeur de chaque fente a" },
  cercle: { label: "Trous d'Young",                aLabel: "Rayon de chaque trou a" }
};

// ── Bornes du réglage de distance laser-fente d (m) et longueur totale du banc ──
// La borne max de D suit d en temps réel pour que d+D ne dépasse jamais la
// longueur de la table (banc de TP réel, cf. scene.js) : Dmax(d) = BANC_LONGUEUR_M - d.
const PETIT_D_MIN_M = 0.15, PETIT_D_MAX_M = 2.50;
const BANC_LONGUEUR_M = 3.15;
function dMaxPourPetitD(d_m) {
  return BANC_LONGUEUR_M - d_m;
}

// ─────────────────────────────────────────────────────────────────────
//  Écart angulaire du m-ième zéro de l'ENVELOPPE de diffraction d'une seule fente (zéros de
//  sinc, indépendant de b) : sin θ ≈ m·λ/a. Renvoie θ en radians. m=1 → 1er zéro (limite du
//  lobe central de l'enveloppe), m=2 → limite du lobe secondaire, etc. Non utilisée pour le
//  trou circulaire (zéros de la fonction de Bessel J1, pas des multiples entiers du 1er — cf.
//  thetaPremierMinimum ci-dessous, seule m=1 est utile ailleurs dans le code).
// ─────────────────────────────────────────────────────────────────────
function thetaMinimum(lambda_nm, a_um, m) {
  const lambda = lambda_nm * 1e-9;
  const a = a_um * 1e-6;
  return m * lambda / a;
}

// ─────────────────────────────────────────────────────────────────────
//  Écart angulaire du 1er zéro de l'enveloppe de diffraction d'UNE seule ouverture (dépend de
//  a seul, jamais de b) : sin θ1 = facteur·λ/D_car, où D_car est la dimension caractéristique
//  (largeur pour la fente ; DIAMÈTRE, soit 2×a_um puisque a_um est le RAYON pour le trou
//  circulaire, cf. MASK_SHAPES) et facteur=1 (zéro de sinc) sauf pour le trou circulaire où
//  facteur=1,22 (1er zéro de J1, anneau d'Airy).
// ─────────────────────────────────────────────────────────────────────
function thetaPremierMinimum(lambda_nm, a_um, shape = sim.maskShape) {
  if (shape === 'cercle') {
    const lambda = lambda_nm * 1e-9;
    const diametre = 2 * a_um * 1e-6;
    return 1.22 * lambda / diametre;
  }
  return thetaMinimum(lambda_nm, a_um, 1);
}

// ─────────────────────────────────────────────────────────────────────
//  Position du m-ième zéro de l'enveloppe sur l'écran (m), à distance D (m). Cf. thetaMinimum
//  — fente uniquement (pas le trou circulaire, cf. thetaPremierMinimum).
// ─────────────────────────────────────────────────────────────────────
function xMinimum(lambda_nm, a_um, D_m, m) {
  return Math.tan(thetaMinimum(lambda_nm, a_um, m)) * D_m;
}
function xPremierMinimum(lambda_nm, a_um, D_m, shape = sim.maskShape) {
  return Math.tan(thetaPremierMinimum(lambda_nm, a_um, shape)) * D_m;
}

// ─────────────────────────────────────────────────────────────────────
//  Intensité de l'ENVELOPPE de diffraction (une seule fente, indépendante de b) en un point
//  d'abscisse x (m) de l'écran — formule de Fraunhofer : I(θ) = I0 · sinc²(π·a·sinθ/λ).
//  sinθ = x / √(x²+D²) (exacte, pas d'approximation petit angle sur θ lui-même). Cette
//  enveloppe module la figure d'interférence des 2 ouvertures, cf. intensiteInterference.
// ─────────────────────────────────────────────────────────────────────
function intensiteSinc(x_m, lambda_nm, a_um, D_m) {
  const lambda = lambda_nm * 1e-9;
  const a = a_um * 1e-6;
  const sinTheta = x_m / Math.sqrt(x_m * x_m + D_m * D_m);
  const beta = Math.PI * a * sinTheta / lambda;
  if (Math.abs(beta) < 1e-6) return 1;
  const s = Math.sin(beta) / beta;
  return s * s;
}

// ─────────────────────────────────────────────────────────────────────
//  Approximation rationnelle standard de la fonction de Bessel J1 (Abramowitz & Stegun,
//  9.4.5/9.4.6 — deux branches, x≤3 et x>3), précision ~1e-8. Aucune dépendance externe,
//  cohérent avec le choix déjà fait pour la FFT (implémentation maison, cf. fft1D/fft2D).
// ─────────────────────────────────────────────────────────────────────
function besselJ1(x) {
  const ax = Math.abs(x);
  let resultat;
  if (ax < 3) {
    const y = (x / 3) * (x / 3);
    resultat = x * (0.5 + y * (-0.56249985 + y * (0.21093573 + y * (-0.03954289 +
      y * (0.00443319 + y * (-0.00031761 + y * 0.00001109))))));
  } else {
    const y = 3 / ax;
    const f1 = 0.79788456 + y * (0.00000156 + y * (0.01659667 + y * (0.00017105 +
      y * (-0.00249511 + y * (0.00113653 - y * 0.00020033)))));
    const theta1 = ax - 2.35619449 + y * (0.12499612 + y * (0.00005650 + y * (-0.00637879 +
      y * (0.00074348 + y * (0.00079824 - y * 0.00029166)))));
    resultat = f1 * Math.cos(theta1) / Math.sqrt(ax);
    if (x < 0) resultat = -resultat;
  }
  return resultat;
}

// ─────────────────────────────────────────────────────────────────────
//  Intensité de l'ENVELOPPE de diffraction (tache d'Airy, UN seul trou circulaire de rayon
//  a_um, indépendante de b). I(v) = [2·J1(v)/v]², v = π·D·sinθ/λ, D = diamètre = 2·a_um
//  (a_um est le RAYON, cf. MASK_SHAPES). Non séparable, mais fonction fermée exacte malgré
//  tout (pas d'approximation petit angle sur θ, même construction que intensiteSinc).
// ─────────────────────────────────────────────────────────────────────
function intensiteAiry(x_m, lambda_nm, a_um, D_m) {
  const lambda = lambda_nm * 1e-9;
  const diametre = 2 * a_um * 1e-6;
  const sinTheta = x_m / Math.sqrt(x_m * x_m + D_m * D_m);
  const v = Math.PI * diametre * sinTheta / lambda;
  if (Math.abs(v) < 1e-6) return 1;
  const s = 2 * besselJ1(v) / v;
  return s * s;
}

// ─────────────────────────────────────────────────────────────────────
//  Intensité de l'ENVELOPPE de diffraction (UNE seule ouverture) en un point d'abscisse x (m)
//  de l'écran — dispatch par forme (cf. sim.maskShape/MASK_SHAPES). Composante de
//  intensiteInterference() ci-dessous ; réutilisée telle quelle pour l'encart « Angle/largeur
//  de l'enveloppe » (cf. ARCHITECTURE.md).
// ─────────────────────────────────────────────────────────────────────
function intensiteOuverture(x_m, lambda_nm, a_um, D_m, shape = sim.maskShape) {
  if (shape === 'cercle') return intensiteAiry(x_m, lambda_nm, a_um, D_m);
  return intensiteSinc(x_m, lambda_nm, a_um, D_m);
}

// ─────────────────────────────────────────────────────────────────────
//  Facteur d'interférence (« réseau » à 2 points) de 2 ouvertures identiques séparées de b
//  (centre à centre) : par le théorème du réseau, placer 2 copies d'une même ouverture en
//  x=∓b/2 revient à convoluer son masque avec 2 Dirac en ∓b/2 — dans le domaine de Fourier
//  (champ lointain de Fraunhofer), une convolution devient un PRODUIT. La transformée de
//  Fourier de 2 Dirac symétriques en ∓b/2 vaut 2·cos(π·b·sinθ/λ) (exact, sinθ = x/√(x²+D²)
//  comme intensiteSinc/intensiteAiry — pas d'approximation petit angle), donc l'intensité
//  |FFT|² acquiert un facteur cos²(π·b·sinθ/λ) — normalisé pour valoir 1 au centre (θ=0),
//  cohérent avec la convention pic=1 de intensiteOuverture(). Généralise à N'IMPORTE QUELLE
//  forme d'ouverture (fente, trou...), cf. intensiteInterference ci-dessous.
// ─────────────────────────────────────────────────────────────────────
function facteurInterference(x_m, lambda_nm, b_um, D_m) {
  const lambda = lambda_nm * 1e-9;
  const b = b_um * 1e-6;
  const sinTheta = x_m / Math.sqrt(x_m * x_m + D_m * D_m);
  const phi = Math.PI * b * sinTheta / lambda;
  return Math.cos(phi) * Math.cos(phi);
}

// ─────────────────────────────────────────────────────────────────────
//  Intensité normalisée (pic central = 1) de la figure d'interférence complète : enveloppe de
//  diffraction d'UNE ouverture (intensiteOuverture, dépend de a) × facteur d'interférence des
//  2 ouvertures (facteurInterference, dépend de b) — cf. leurs docstrings. SEULE source pour
//  le graphe I(x) et les encarts de valeurs (θ, interfrange...), cf. echantillonnerIntensite —
//  jamais le pipeline FFT (texture d'écran, enveloppe 3D), qui construit directement le champ
//  à 2 ouvertures, cf. construireChampOuverture plus bas.
// ─────────────────────────────────────────────────────────────────────
function intensiteInterference(x_m, lambda_nm, a_um, b_um, D_m, shape = sim.maskShape) {
  return intensiteOuverture(x_m, lambda_nm, a_um, D_m, shape) * facteurInterference(x_m, lambda_nm, b_um, D_m);
}

// ─────────────────────────────────────────────────────────────────────
//  Interfrange i = λ·D/b (formule standard enseignée, approximation des petits angles —
//  valide ici car b, x ≪ D dans tout le domaine réglable) : écart entre 2 franges brillantes
//  consécutives sur l'écran. Grandeur classiquement mesurée en TP sur les fentes d'Young,
//  utilisée uniquement par l'encart Valeurs (jamais par le rendu FFT).
// ─────────────────────────────────────────────────────────────────────
function interfrangeI(lambda_nm, b_um, D_m) {
  const lambda = lambda_nm * 1e-9;
  const b = b_um * 1e-6;
  return lambda * D_m / b;
}

// Diamètre réel du faisceau laser au niveau de la fente (mm) — sert à la fois au
// rendu du faisceau lui-même (scene.js) et au calcul de sa divergence ci-dessous ;
// source unique pour rester cohérent entre le rayon dessiné et le rayon calculé.
const FAISCEAU_DIAMETRE_MM = 1;

// ─────────────────────────────────────────────────────────────────────
//  Rayon du faisceau laser gaussien (mode TEM00) à une distance D du col du
//  faisceau, par divergence naturelle — indépendante de la fente, qui ne
//  restreint que x (cf. §Périmètre physique). Formule standard d'optique
//  laser : w(D) = w0·√(1+(D/zR)²), zR = π·w0²/λ (portée de Rayleigh).
//  Renvoie le rayon en mètres. Approximation : le col du faisceau (w0) est
//  supposé situé au niveau de la fente (l'écart réel laser-fente, sim.d,
//  cf. scene.js, est négligeable devant D).
// ─────────────────────────────────────────────────────────────────────
function largeurFaisceauGaussien(lambda_nm, D_m) {
  const lambda = lambda_nm * 1e-9;
  const w0 = FAISCEAU_DIAMETRE_MM / 2 / 1000; // rayon au col, mm → m
  const zR = Math.PI * w0 * w0 / lambda;      // portée de Rayleigh (m)
  return w0 * Math.sqrt(1 + (D_m / zR) * (D_m / zR));
}

// ═══════════════════════════════════════════════════════════════════════
//  Interférence par FFT — texture d'écran + enveloppe 3D (cf. scene.js)
//
//  intensiteInterference() ci-dessus (formule fermée, exacte) reste la SEULE source pour le
//  graphe I(x) et les encarts de valeurs (θ, interfrange...) — elle n'est pas touchée par ce
//  qui suit. L'infrastructure ci-dessous est une source ALTERNATIVE, utilisée uniquement par
//  scene.js pour la texture d'écran et l'enveloppe 3D du faisceau.
//
//  Principe (optique de Fourier) : le champ juste après UNE SEULE ouverture (fente ou trou,
//  largeur/rayon a réglable) éclairée par un faisceau réel (pas une onde plane infinie) est
//  masque(x,y) · champ_incident(x,y). La figure de diffraction de cette ouverture seule est
//  |FFT2D(ce champ)|² — EXACTEMENT le même pipeline que `diffraction/js/sim.js` (même
//  dimensionnement de fenêtre/résolution, cf. FFT_N/FFT_FENETRE_FACTEUR ci-dessous), pas de
//  b ici : le masque ne contient QU'UNE ouverture, centrée en x=0.
//
//  Les franges d'interférence (dépendantes de b) ne sont PAS mises dans ce masque — une
//  première version le faisait (masque = union de 2 ouvertures écartées de b), mais ça
//  obligeait à élargir la fenêtre FFT pour couvrir l'écartement b (jusqu'à 1 mm) tout en
//  gardant assez d'échantillons dans l'ouverture (a, jusqu'à 20 µm) : rapport jusqu'à 50,
//  qui aurait demandé soit une grille FFT bien plus grande (trop lente pour un recalcul à
//  chaque frappe de slider), soit une résolution de frange trop grossière. cf.
//  echantillonnerChampInterference() ci-dessous pour la solution retenue : le facteur de
//  frange (cos², cf. facteurInterference plus haut) est exact et quasi gratuit à évaluer, donc
//  appliqué directement lors de l'ÉCHANTILLONNAGE du champ FFT plutôt que dans le masque —
//  aucune limite de résolution sur les franges, et la FFT reste aussi rapide qu'en diffraction
//  simple. champ_incident = profil gaussien du faisceau laser (col du faisceau au niveau de
//  l'ouverture).
// ═══════════════════════════════════════════════════════════════════════

// Hauteur réelle de la fente (cm), à l'échelle — cf. scene.js → SLIT_BAND_HEIGHT, qui reprend
// cette même valeur pour le rendu 3D (source unique). Très supérieure à la fenêtre FFT ci-
// dessous (FFT_FENETRE_FACTEUR × a, de l'ordre du mm — cf. sa docstring) : dans cette fenêtre,
// la fente n'est donc jamais limitante en y — seul le profil du faisceau incident l'est. C'est exactement la même
// approximation physique que l'ancien `largeurFaisceauGaussien` (une fente réelle est bien
// plus haute que le faisceau qui la traverse), mais elle ressort maintenant de la géométrie du
// masque plutôt que d'être supposée a priori.
const FENTE_HAUTEUR_CM = 5.6;

// Résolution (N, puissance de 2) de la grille FFT et facteur de sa fenêtre physique
// (FFT_FENETRE_FACTEUR × a, PAS une largeur fixe) — dimensionnement d'UNE SEULE ouverture,
// repris à l'identique de `diffraction/js/sim.js` (mêmes valeurs, même raisonnement : ~41
// échantillons dans l'ouverture au réglage par défaut, ratio couverture/1er-minimum ≈ 20,5,
// indépendant de a/λ/D). Voir `diffraction/ARCHITECTURE.md` §Pipeline FFT pour le détail
// complet du raisonnement — inchangé ici puisque le masque ne contient plus qu'une ouverture
// (cf. discussion ci-dessus). Les franges (b) n'entrent pour rien dans ce dimensionnement.
const FFT_N = 1024;
const FFT_FENETRE_FACTEUR = 25;

// Buffers réutilisés d'un appel à l'autre (évite de réallouer ~1 million de flottants à
// chaque changement de paramètre — coûteux en pression mémoire/GC dans une boucle interactive).
const _fftRe = new Float64Array(FFT_N * FFT_N);
const _fftIm = new Float64Array(FFT_N * FFT_N);
const _fftGrille = new Float64Array(FFT_N * FFT_N);

// ─────────────────────────────────────────────────────────────────────
//  FFT 1D radix-2 (Cooley-Tukey), en place, itérative. re/im : Float64Array de longueur N
//  (puissance de 2). invert=true calcule la FFT inverse (normalisée par 1/N). Algorithme
//  standard (permutation par inversion de bits puis papillons), sans dépendance externe.
// ─────────────────────────────────────────────────────────────────────
function fft1D(re, im, invert) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (invert ? 1 : -1) * 2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curWr = 1, curWi = 0;
      const half = len / 2;
      for (let j = 0; j < half; j++) {
        const ur = re[i + j], ui = im[i + j];
        const vr = re[i + j + half] * curWr - im[i + j + half] * curWi;
        const vi = re[i + j + half] * curWi + im[i + j + half] * curWr;
        re[i + j] = ur + vr; im[i + j] = ui + vi;
        re[i + j + half] = ur - vr; im[i + j + half] = ui - vi;
        const nextWr = curWr * wr - curWi * wi;
        const nextWi = curWr * wi + curWi * wr;
        curWr = nextWr; curWi = nextWi;
      }
    }
  }
  if (invert) {
    for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
}

// ─────────────────────────────────────────────────────────────────────
//  FFT 2D par décomposition lignes puis colonnes (algorithme standard, exact — pas une
//  approximation) : une FFT 1D sur chaque ligne, puis une FFT 1D sur chaque colonne du
//  résultat. re/im : Float64Array de longueur N×N, grille aplatie indexée [j*N+i].
// ─────────────────────────────────────────────────────────────────────
function fft2D(re, im, N, invert) {
  const tmpRe = new Float64Array(N), tmpIm = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    const base = j * N;
    for (let i = 0; i < N; i++) { tmpRe[i] = re[base + i]; tmpIm[i] = im[base + i]; }
    fft1D(tmpRe, tmpIm, invert);
    for (let i = 0; i < N; i++) { re[base + i] = tmpRe[i]; im[base + i] = tmpIm[i]; }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) { tmpRe[j] = re[j * N + i]; tmpIm[j] = im[j * N + i]; }
    fft1D(tmpRe, tmpIm, invert);
    for (let j = 0; j < N; j++) { re[j * N + i] = tmpRe[j]; im[j * N + i] = tmpIm[j]; }
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Construit le champ diffracté par UNE SEULE ouverture (masque centré en x=0, éclairé par le
//  profil gaussien du faisceau incident), propagé en champ lointain par FFT2D — identique à
//  `diffraction/js/sim.js` (aucune trace de b ici, cf. discussion de conception plus haut).
//  Renvoie une grille d'intensité normalisée (pic central = 1, même convention que
//  intensiteOuverture()) ainsi que λ et D, réutilisés par échantillonnerChamp() pour convertir
//  position écran → indice de grille (relation géométrique EXACTE, cf. sa docstring). Appelée
//  une seule fois par changement de paramètre (scene.js → updateSceneParams), le résultat est
//  ensuite échantillonné en de nombreux points (texture, enveloppe 3D) via
//  echantillonnerChampInterference() ci-dessous, qui y applique le facteur de frange exact.
// ─────────────────────────────────────────────────────────────────────
function construireChampOuverture(lambda_nm, a_um, D_m, shape = sim.maskShape) {
  const N = FFT_N;
  const lambda_m = lambda_nm * 1e-9;
  const a_m = a_um * 1e-6;
  // Dimension caractéristique PLEINE de l'ouverture (diamètre pour le trou circulaire,
  // puisque a_um en est le RAYON, cf. MASK_SHAPES ; largeur pour la fente).
  const extent_m = shape === 'cercle' ? 2 * a_m : a_m;
  const FFT_FENETRE_M = FFT_FENETRE_FACTEUR * extent_m;
  const pas = FFT_FENETRE_M / N;
  const h_m = FENTE_HAUTEUR_CM / 100;
  const w0 = FAISCEAU_DIAMETRE_MM / 2 / 1000; // rayon du faisceau au col (m) — même valeur que largeurFaisceauGaussien

  const re = _fftRe, im = _fftIm;
  re.fill(0); im.fill(0); // champ incident réel (pas de courbure de phase au col, cf. approximation ci-dessus) : im reste nul

  // Masque d'une seule ouverture, centrée en x=0 (cf. sim.maskShape/MASK_SHAPES) :
  //  - fente  : rectangle a × FENTE_HAUTEUR_CM (une fente d'Young verticale)
  //  - cercle : disque de rayon a (a_um = rayon, cf. MASK_SHAPES) — un trou d'Young
  for (let j = 0; j < N; j++) {
    const y = (j - N / 2) * pas;
    const base = j * N;
    for (let i = 0; i < N; i++) {
      const x = (i - N / 2) * pas;
      let ouvert;
      if (shape === 'cercle') {
        ouvert = (x * x + y * y) < a_m * a_m;
      } else { // fente (fente d'Young verticale)
        ouvert = Math.abs(x) < a_m / 2 && Math.abs(y) < h_m / 2;
      }
      if (!ouvert) continue;
      // Profil gaussien du faisceau incident, en AMPLITUDE (exp(-r²/w0²)) — son carré, obtenu
      // plus loin par |FFT|², redonne la convention d'intensité laser standard I∝exp(-2r²/w0²).
      re[base + i] = Math.exp(-(x * x + y * y) / (w0 * w0));
    }
  }

  fft2D(re, im, N, false);

  // Décalage (fftshift) + intensité + normalisation (pic central = 1) en une passe.
  const grille = _fftGrille;
  let pic = 0;
  for (let j = 0; j < N; j++) {
    const js = (j + N / 2) % N;
    const baseDst = j * N, baseSrc = js * N;
    for (let i = 0; i < N; i++) {
      const is = (i + N / 2) % N;
      const idx = baseSrc + is;
      const v = re[idx] * re[idx] + im[idx] * im[idx];
      grille[baseDst + i] = v;
      if (v > pic) pic = v;
    }
  }
  if (pic > 0) {
    for (let k = 0; k < grille.length; k++) grille[k] /= pic;
  }

  return { grille, N, lambda_m, D_m, FFT_FENETRE_M };
}

// ─────────────────────────────────────────────────────────────────────
//  Lit l'intensité du champ construit par construireChampOuverture() à une position physique
//  (x,y) du plan écran (mètres). Plus proche voisin — la résolution de la grille FFT (pas
//  écran de l'ordre du dixième de mm dans les réglages courants) est très supérieure à celle
//  des échantillonnages appelants (texture, enveloppe 3D), l'interpolation n'apporterait rien
//  de visible. Renvoie 0 hors de la zone couverte par la grille (cf. commentaire FFT_FENETRE_M).
//
//  Conversion position → indice de grille EXACTE (sinθ = x/√(x²+D²), même relation
//  géométrique que intensiteOuverture() — cf. sa docstring), PAS l'approximation paraxiale
//  x_écran ≈ λ·D·fx utilisée jusqu'ici : les deux coïncident pour un petit angle (D grand
//  devant x), mais divergent nettement quand x devient comparable à D (D réglable jusqu'à
//  un minimum bien inférieur à screenHalfWidth) — ce qui décalait les minima de la texture
//  d'écran par rapport à ceux du graphe I(x) (constaté par l'utilisateur, cf. discussion de
//  conception). La relation EXACTE entre angle et fréquence spatiale de Fraunhofer,
//  sinθ = λ·fx, reste inchangée (ce n'est pas une approximation, contrairement à x≈D·sinθ) —
//  seule la façon de relier x physique à fx change ici, la grille elle-même (calculée par
//  construireChampOuverture) n'est pas touchée.
// ─────────────────────────────────────────────────────────────────────
function echantillonnerChamp(champ, x_m, y_m) {
  const { grille, N, lambda_m, D_m, FFT_FENETRE_M } = champ;
  const sinThetaX = x_m / Math.sqrt(x_m * x_m + D_m * D_m);
  const sinThetaY = y_m / Math.sqrt(y_m * y_m + D_m * D_m);
  const i = Math.round((sinThetaX / lambda_m) * FFT_FENETRE_M) + N / 2;
  const j = Math.round((sinThetaY / lambda_m) * FFT_FENETRE_M) + N / 2;
  if (i < 0 || i >= N || j < 0 || j >= N) return 0;
  return grille[j * N + i];
}

// ─────────────────────────────────────────────────────────────────────
//  Combine echantillonnerChamp() (enveloppe de diffraction d'UNE ouverture, cf. champ,
//  construit par construireChampOuverture) avec facteurInterference() (franges, dépend de
//  b — cf. théorème du réseau, §Clé physique de ARCHITECTURE.md) : c'est CETTE fonction, pas
//  echantillonnerChamp() seule, qui doit être utilisée partout dans le rendu visuel (texture
//  d'écran, enveloppe 3D, cf. scene.js) pour obtenir l'intensité d'interférence réellement
//  affichée. λ et D sont lus directement sur `champ` (déjà stockés par construireChampOuverture,
//  cohérents avec le champ échantillonné) — seul b_um est à fournir, propre à cet appel.
//  Aucun coût FFT supplémentaire : facteurInterference() est une simple évaluation de cos²,
//  donc cette combinaison n'a AUCUNE limite de résolution sur les franges (contrairement à
//  echantillonnerChamp() seule, bornée par le pas de la grille FFT) — c'est ce qui permet de
//  garder une fenêtre FFT dimensionnée sur `a` seul (rapide) tout en affichant des franges
//  nettes à n'importe quelle valeur de b.
// ─────────────────────────────────────────────────────────────────────
function echantillonnerChampInterference(champ, x_m, y_m, b_um) {
  const I = echantillonnerChamp(champ, x_m, y_m);
  if (I === 0) return 0;
  const lambda_nm = champ.lambda_m * 1e9;
  return I * facteurInterference(x_m, lambda_nm, b_um, champ.D_m);
}

// ─────────────────────────────────────────────────────────────────────
//  Échantillonne I(x) (n points), par défaut sur toute la largeur de l'écran
//  (-screenHalfWidth à +screenHalfWidth). Utilisée par le graphe (graph.js), qui passe
//  xMin/xMax explicitement — la fenêtre RÉELLEMENT visible (gview), pas toujours la pleine
//  largeur de l'écran : sans cela, une tache très petite (D et/ou λ faibles) n'était couverte
//  que par une poignée des n points répartis sur toute la largeur de l'écran, donnant une
//  courbe visiblement anguleuse une fois zoomée sur cette tache (constaté par l'utilisateur).
//  `lambda_nm` optionnel (défaut sim.lambda) : permet au graphe de tracer une courbe de
//  référence à une AUTRE longueur d'onde que celle du slider (mode Lumière blanche, cf.
//  graph.js → BLANCHE_COULEURS), sans dupliquer cette fonction.
// ─────────────────────────────────────────────────────────────────────
function echantillonnerIntensite(n, xMin, xMax, lambda_nm = sim.lambda) {
  const pts = new Array(n);
  const lo = xMin ?? -sim.screenHalfWidth, hi = xMax ?? sim.screenHalfWidth;
  for (let i = 0; i < n; i++) {
    const x = lo + ((hi - lo) * i) / (n - 1);
    pts[i] = { x, I: intensiteInterference(x, lambda_nm, sim.a, sim.b, sim.D) };
  }
  return pts;
}

// ─────────────────────────────────────────────────────────────────────
//  Conversion longueur d'onde (nm, visible 380-750) → couleur RGB approchée.
//  Algorithme classique (d'après Dan Bruton), utilisé pour colorer le
//  faisceau laser et teinter la figure de diffraction selon λ.
// ─────────────────────────────────────────────────────────────────────
function longueurOndeVersRGB(nm) {
  let r = 0, g = 0, b = 0;
  if (nm >= 380 && nm < 440) { r = -(nm - 440) / (440 - 380); g = 0; b = 1; }
  else if (nm < 490) { r = 0; g = (nm - 440) / (490 - 440); b = 1; }
  else if (nm < 510) { r = 0; g = 1; b = -(nm - 510) / (510 - 490); }
  else if (nm < 580) { r = (nm - 510) / (580 - 510); g = 1; b = 0; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / (645 - 580); b = 0; }
  else if (nm <= 750) { r = 1; g = 0; b = 0; }

  let facteur;
  if (nm >= 380 && nm < 420) facteur = 0.3 + 0.7 * (nm - 380) / (420 - 380);
  else if (nm < 701) facteur = 1;
  else if (nm <= 750) facteur = 0.3 + 0.7 * (750 - nm) / (750 - 700);
  else facteur = 0;

  const gamma = 0.8;
  const ajuste = c => c <= 0 ? 0 : Math.round(255 * Math.pow(c * facteur, gamma));
  return { r: ajuste(r), g: ajuste(g), b: ajuste(b) };
}

// ─────────────────────────────────────────────────────────────────────
//  Idem, renvoie une chaîne CSS/Three.js exploitable directement.
// ─────────────────────────────────────────────────────────────────────
function longueurOndeVersHex(nm) {
  const { r, g, b } = longueurOndeVersRGB(nm);
  return (r << 16) | (g << 8) | b;
}
function longueurOndeVersCss(nm) {
  const { r, g, b } = longueurOndeVersRGB(nm);
  return `rgb(${r},${g},${b})`;
}

// ═══════════════════════════════════════════════════════════════════════
//  Mode "Lumière blanche" — six longueurs d'onde de référence (une par couleur
//  nommée), utilisées à la fois par le graphe (une courbe par couleur, cf. graph.js)
//  et par la texture d'écran (sommées, cf. scene.js → updateSceneParams). Pas une
//  vraie décomposition spectrale continue (ce serait plus juste avec des dizaines
//  d'échantillons), mais un compromis pédagogique délibéré : chaque couleur du
//  graphe correspond exactement à une composante visible dans la figure sur l'écran.
// ═══════════════════════════════════════════════════════════════════════
const BLANCHE_COULEURS = [
  { nom: 'Violet', lambda: 420 },
  { nom: 'Bleu',   lambda: 460 },
  { nom: 'Vert',   lambda: 520 },
  { nom: 'Jaune',  lambda: 580 },
  { nom: 'Orange', lambda: 610 },
  { nom: 'Rouge',  lambda: 660 }
];
for (const c of BLANCHE_COULEURS) sim.blancheVisibles[c.nom] = true;

// Référence de « balance des blancs » : somme des RGB des 6 couleurs ci-dessus à pleine
// intensité (I=1, comme au centre de la figure, où toutes les λ valent 1). L'approximation
// RGB de longueurOndeVersRGB (pensée pour une SEULE couleur à la fois, cf. sa docstring)
// n'a aucune raison de sommer à du blanc pur sur ces 6 teintes précises (choisies pour être
// des noms de couleur reconnaissables, pas pour un équilibre spectral) : sans cette
// référence, le centre de la tache en lumière blanche ressortirait teinté (plutôt brun-
// orangé, ces 6 couleurs penchant côté chaud) au lieu de blanc. Diviser par cette référence
// force le centre (I=1 partout) à retomber exactement sur blanc, cf. intensiteBlancheRGB.
const BLANCHE_REF = (() => {
  let r = 0, g = 0, b = 0;
  for (const c of BLANCHE_COULEURS) {
    const rgb = longueurOndeVersRGB(c.lambda);
    r += rgb.r; g += rgb.g; b += rgb.b;
  }
  return { r: Math.max(r, 1), g: Math.max(g, 1), b: Math.max(b, 1) };
})();

// Longueur d'onde « moyenne » des 6 couleurs ci-dessus, utilisée uniquement pour la largeur
// verticale (gaussienne) du faisceau affiché à l'écran en mode blanc (cf. scene.js) : cette
// largeur varie très peu avec λ, un seul réglage représentatif suffit, pas la peine de la
// sommer sur les 6 couleurs comme l'intensité horizontale.
const BLANCHE_LAMBDA_MOYENNE = BLANCHE_COULEURS.reduce((s, c) => s + c.lambda, 0) / BLANCHE_COULEURS.length;

// Décalage vertical CIBLE (cm) de chaque couleur en vue « Décomposer la figure
// d'interférence » (bouton disponible en vue Écran + lumière blanche, cf. scene.js →
// dessinerTextureEcranBlanche) — un décalage par entrée de BLANCHE_COULEURS, même ordre :
// violet tout en haut, rouge tout en bas, les 4 autres également réparties entre les deux
// (demande explicite de l'utilisateur : -3 cm à +3 cm pour la fente, pas de raison de
// couvrir toute la hauteur réelle de l'écran, SCREEN_HEIGHT=15 cm cf. scene.js — on reste
// compact). Le signe est celui qui affiche VISUELLEMENT en haut de l'écran, PAS le signe
// physique intuitif : la texture (canvas 2D, py=0 = première ligne écrite) est appliquée avec
// l'orientation par défaut de Three.js (CanvasTexture.flipY=true) sur un plan non retourné, ce
// qui fait qu'un y_cm POSITIF (cf. la même formule dans le code de rendu) apparaît en BAS de
// l'écran, pas en haut — d'où le violet (en haut voulu) sur la valeur la plus NÉGATIVE.
//
// Étendue PAR FORME (demande explicite de l'utilisateur, reprise de diffraction) : -5 cm à
// +5 cm pour le trou circulaire, au lieu de -3/+3 pour la fente — sa figure, plus étalée
// verticalement (diffraction réelle en y, cf. construireChampOuverture), se chevaucherait trop
// à l'étendue standard une fois décomposée.
const DECOMPOSE_Y_CM_STANDARD = [-3, -1.8, -0.6, 0.6, 1.8, 3];
const DECOMPOSE_Y_CM_LARGE = [-5, -3, -1, 1, 3, 5];
function decomposeYCm(shape = sim.maskShape) {
  return shape === 'cercle' ? DECOMPOSE_Y_CM_LARGE : DECOMPOSE_Y_CM_STANDARD;
}

// ─────────────────────────────────────────────────────────────────────
//  Composantes RGB (0-255, PAS normalisées) de chacune des 6 couleurs de référence à
//  l'abscisse x_m, ainsi que leur somme normalisée (« couleur composite », cf.
//  intensiteBlancheRGB ci-dessous). Racine carrée sur chaque intensité AVANT pondération
//  (même compression que IxAffichage en mode mono, cf. scene.js) : sans elle, les franges
//  secondaires (colorées) seraient quasi invisibles. Les composantes NON normalisées sont
//  réutilisées telles quelles par la vue « Décomposer » (chaque couleur y garde sa PROPRE
//  figure de diffraction, pas de raison de la renormaliser comme le composite).
// ─────────────────────────────────────────────────────────────────────
function intensiteBlancheComposantes(x_m, a_um, b_um, D_m) {
  const composantes = new Array(BLANCHE_COULEURS.length);
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < BLANCHE_COULEURS.length; i++) {
    const c = BLANCHE_COULEURS[i];
    const I = Math.sqrt(intensiteInterference(x_m, c.lambda, a_um, b_um, D_m));
    const rgb = longueurOndeVersRGB(c.lambda);
    const cr = I * rgb.r, cg = I * rgb.g, cb = I * rgb.b;
    composantes[i] = { r: cr, g: cg, b: cb };
    r += cr; g += cg; b += cb;
  }
  return {
    composantes,
    merged: {
      r: Math.min(255, Math.round(255 * r / BLANCHE_REF.r)),
      g: Math.min(255, Math.round(255 * g / BLANCHE_REF.g)),
      b: Math.min(255, Math.round(255 * b / BLANCHE_REF.b))
    }
  };
}

// ─────────────────────────────────────────────────────────────────────
//  Couleur composite (0-255 par canal) de la figure d'interférence en lumière blanche, au
//  point d'abscisse x_m de l'écran — cf. intensiteBlancheComposantes ci-dessus.
// ─────────────────────────────────────────────────────────────────────
function intensiteBlancheRGB(x_m, a_um, b_um, D_m) {
  return intensiteBlancheComposantes(x_m, a_um, b_um, D_m).merged;
}

// ─────────────────────────────────────────────────────────────────────
//  Remet les paramètres à leurs valeurs par défaut.
// ─────────────────────────────────────────────────────────────────────
function resetParams() {
  sim.lambda = 633;
  sim.a = 100;
  sim.b = 500;
  sim.d = 0.50;
  sim.D = 1.0;
  sim.lightSource = 'mono';
  for (const c of BLANCHE_COULEURS) sim.blancheVisibles[c.nom] = true;
  sim.showRays = false;
  sim.beamMode = 'off';
  sim.showLengths = false;
  sim.maskShape = 'fente';
  sim.showGraphIntensite = false;
  sim.showValeursExp = false;
}
