// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
//  sim.js — État global et physique de la diffraction
//  Chargé en premier : ne dépend d'aucun autre fichier du projet.
// ═══════════════════════════════════════════════════

// ── État central de la simulation ──
const sim = {
  lambda: 633,     // longueur d'onde du laser (nm)
  a: 100,          // largeur de la fente (µm)
  d: 0.50,         // distance laser-fente (m)
  D: 1.0,          // distance fente-écran (m)
  lightSource: 'mono', // 'mono' (monochromatique, réglable via λ) | 'blanche' (lumière blanche)
  blancheVisibles: {}, // { [nom de couleur]: bool } — courbes cochées dans la légende du graphe (blanche), rempli plus bas (cf. BLANCHE_COULEURS)
  showRays: false, // afficher les rayons pointillés vers les 1ers minima + l'axe optique
  beamMode: 'off', // 'off' (aucun faisceau) | 'laserOnly' (laser→fente) | 'visible' (laser + diffracté)
  showLengths: false, // afficher les doubles flèches de mesure d, D, L
  view: '3d',      // '3d' | 'top' | 'side' | 'screen'
  maskShape: 'fente', // 'fente' | 'carre' | 'cercle' | 'fil' — forme de l'ouverture de la diapositive

  // Demi-largeur physique de l'écran simulé (m) — fixe, écran réel de TP 25×15 cm, cf. ARCHITECTURE.md
  screenHalfWidth: 0.125
};

// ── Bornes du réglage de largeur de fente (µm) — aussi utilisées par
//    scene.js pour la correspondance avec la largeur visuelle schématique.
//    Les autres bornes (λ, D) ne vivent que dans les attributs min/max
//    des <input type=range> du panneau, pas dupliquées ici.
const A_MIN = 20, A_MAX = 500;

// ── Formes d'ouverture disponibles pour la diapositive ──
// `aLabel` : texte du <label> du slider `a` (son sens physique change selon la forme — rayon,
// côté, largeur ou diamètre du fil — mais garde les mêmes bornes A_MIN/A_MAX ci-dessus, la
// représentation 3D de la diapo étant de toute façon schématique, cf. largeurFenteVisuelle dans
// scene.js, pas à l'échelle réelle).
const MASK_SHAPES = {
  fente:  { label: 'Fente simple',               aLabel: "Largeur de la fente a" },
  carre:  { label: 'Trou carré',                 aLabel: "Côté du trou carré a" },
  cercle: { label: 'Trou circulaire',             aLabel: "Rayon du trou circulaire a" },
  fil:    { label: 'Fil (fente complémentaire)',  aLabel: "Diamètre du fil a" }
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
//  Écart angulaire du m-ième minimum de diffraction pour une ouverture séparable
//  (fente/carré/fil, zéros de sinc) : sin θ ≈ m·λ/a. Renvoie θ en radians (petit angle,
//  valide dans tout le domaine réglable). m=1 → 1er minimum (limite de la tache centrale),
//  m=2 → limite de la 1ère tache secondaire, etc. Non utilisée pour le cercle (zéros de la
//  fonction de Bessel J1, pas des multiples entiers du 1er — cf. thetaPremierMinimum
//  ci-dessous, seule m=1 est utile ailleurs dans le code).
// ─────────────────────────────────────────────────────────────────────
function thetaMinimum(lambda_nm, a_um, m) {
  const lambda = lambda_nm * 1e-9;
  const a = a_um * 1e-6;
  return m * lambda / a;
}

// ─────────────────────────────────────────────────────────────────────
//  Écart angulaire du 1er minimum (limite de la tache centrale), généralisé par forme
//  d'ouverture : sin θ1 = facteur·λ/D_car, où D_car est la dimension caractéristique de
//  l'ouverture dans le sens de propagation de la mesure (largeur/côté/diamètre-du-fil pour
//  les formes séparables ; DIAMÈTRE, soit 2×a_um puisque a_um est le RAYON pour le cercle,
//  cf. MASK_SHAPES) et facteur=1 (zéro de sinc) sauf pour le cercle où facteur=1,22 (1er
//  zéro de J1, anneau d'Airy).
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
//  Position du m-ième minimum sur l'écran (m), à distance D (m). Cf. thetaMinimum — formes
//  séparables uniquement (pas le cercle, cf. thetaPremierMinimum).
// ─────────────────────────────────────────────────────────────────────
function xMinimum(lambda_nm, a_um, D_m, m) {
  return Math.tan(thetaMinimum(lambda_nm, a_um, m)) * D_m;
}
function xPremierMinimum(lambda_nm, a_um, D_m, shape = sim.maskShape) {
  return Math.tan(thetaPremierMinimum(lambda_nm, a_um, shape)) * D_m;
}

// ─────────────────────────────────────────────────────────────────────
//  Intensité diffractée normalisée en un point d'abscisse x (m) de l'écran, pour une
//  ouverture séparable (fente, carré, fil) — formule de Fraunhofer : I(θ) = I0 · sinc²(π·a·sinθ/λ).
//  sinθ = x / √(x²+D²) (exacte, pas d'approximation petit angle sur θ lui-même).
//  Carré : la coupe horizontale (y=0) d'une ouverture carrée séparable (I(x,y)=Ix(x)·Iy(y))
//  suit EXACTEMENT la même formule que la fente, avec `a` = côté — aucune formule différente
//  nécessaire.
//  Fil : par le principe de Babinet, un fil opaque de largeur `a` (complémentaire d'une fente
//  de même largeur) donne, PARTOUT SAUF au centre exact (θ=0, où le faisceau non diffracté
//  domine), EXACTEMENT la même figure d'interférence que la fente complémentaire — même
//  amplitude au signe près, donc même intensité. Réutiliser cette même formule ici est donc
//  physiquement correct hors du centre ; au centre, elle renvoie 1 comme un maximum central
//  ordinaire (simplification pédagogique assumée, plutôt que le pic non diffracté réel,
//  beaucoup plus intense et non représentatif d'une diffraction).
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
//  Intensité diffractée normalisée (tache d'Airy) pour un trou circulaire de rayon a_um.
//  I(v) = [2·J1(v)/v]², v = π·D·sinθ/λ, D = diamètre = 2·a_um (a_um est le RAYON, cf.
//  MASK_SHAPES). Non séparable, mais fonction fermée exacte malgré tout (pas d'approximation
//  petit angle sur θ, même construction que intensiteSinc).
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
//  Intensité diffractée normalisée en un point d'abscisse x (m) de l'écran — dispatch par
//  forme d'ouverture (cf. sim.maskShape/MASK_SHAPES). SEULE source pour le graphe I(x) et les
//  encarts de valeurs (θ, position des minima) — jamais le pipeline FFT (texture d'écran,
//  enveloppe 3D), cf. discussion de conception plus bas.
// ─────────────────────────────────────────────────────────────────────
function intensiteOuverture(x_m, lambda_nm, a_um, D_m, shape = sim.maskShape) {
  if (shape === 'cercle') return intensiteAiry(x_m, lambda_nm, a_um, D_m);
  return intensiteSinc(x_m, lambda_nm, a_um, D_m);
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
//  Diffraction par FFT — infrastructure généralisable (cf. discussion de conception)
//
//  intensiteOuverture() ci-dessus (formule fermée, exacte) reste la SEULE source pour le graphe
//  I(x) et les encarts de valeurs (θ, position des minima) — elle n'est pas touchée par ce
//  qui suit. L'infrastructure ci-dessous est une source ALTERNATIVE, utilisée uniquement par
//  scene.js pour la texture d'écran et l'enveloppe 3D du faisceau, pensée pour rester valable
//  quand la forme de l'ouverture changera plus tard (carré, cercle...) — seule la fonction qui
//  dessine le masque changera alors, pas le reste du pipeline (FFT, échantillonnage, mise à
//  l'échelle écran).
//
//  Principe (optique de Fourier) : le champ juste après une ouverture éclairée par un faisceau
//  réel (pas une onde plane infinie) est masque(x,y) · champ_incident(x,y). La figure de
//  diffraction de Fraunhofer est |FFT2D(ce champ)|². Pour une fente, masque = rectangle
//  (largeur a réglable, hauteur FENTE_HAUTEUR_CM réelle) et champ_incident = profil gaussien du
//  faisceau laser (même approximation qu'ailleurs dans ce fichier : col du faisceau au niveau
//  de la fente). Avantage par rapport à deux facteurs séparés (l'ancien `Iy` gaussien multiplié
//  après coup) : la divergence naturelle du faisceau sort de la MÊME FFT que la diffraction,
//  au lieu d'être rajoutée à la main — et généralise sans changement à une ouverture qui
//  diffracte aussi verticalement (carré, cercle), ce qu'un facteur `Iy` figé ne pourrait pas
//  faire.
// ═══════════════════════════════════════════════════════════════════════

// Hauteur réelle de la fente (cm), à l'échelle — cf. scene.js → SLIT_BAND_HEIGHT, qui reprend
// cette même valeur pour le rendu 3D (source unique). Très supérieure à la fenêtre FFT ci-
// dessous (FFT_FENETRE_FACTEUR × a, de l'ordre du mm — cf. sa docstring) : dans cette fenêtre,
// la fente n'est donc jamais limitante en y — seul le profil du faisceau incident l'est. C'est exactement la même
// approximation physique que l'ancien `largeurFaisceauGaussien` (une fente réelle est bien
// plus haute que le faisceau qui la traverse), mais elle ressort maintenant de la géométrie du
// masque plutôt que d'être supposée a priori.
const FENTE_HAUTEUR_CM = 5.6;

// Résolution (N, puissance de 2) de la grille FFT dans le plan de la fente, et facteur de sa
// fenêtre physique (FFT_FENETRE_FACTEUR × a, PAS une largeur fixe — cf. discussion de conception
// ci-dessous). Choix guidés par l'ouverture, PAS par la largeur de l'écran à couvrir — le champ
// incident est nul hors de la fente (masque), inutile de mailler au-delà, quelle que soit la
// taille réelle de la fente (5,6 cm de haut, cf. FENTE_HAUTEUR_CM).
//
// **Fenêtre proportionnelle à `a`, pas fixe** : une première version utilisait une fenêtre fixe
// (2,5 mm, N inchangé) — correcte à a par défaut (100 µm, pas dans la fente ≈2,4 µm, ~41
// échantillons DANS la fente), mais à a minimal (20 µm, cf. A_MIN) la fente ne tient plus que
// sur ~8 échantillons : bien trop grossier pour représenter proprement un rectangle transformé
// par FFT — le sinc² obtenu numériquement s'écarte visiblement du sinc² théorique près de ses
// zéros (minima décalés/adoucis), constaté par l'utilisateur précisément aux réglages donnant la
// plus large tache centrale (justement ceux où a est petit). Le champ incident (profil gaussien
// du faisceau, cf. construireChampOuverture) n'a, lui, pas besoin d'une fenêtre bien plus grande
// que l'ouverture : il est de toute façon masqué à zéro hors de la fente, donc SEULE la finesse
// du pas À L'INTÉRIEUR de la fente compte pour la qualité du résultat — la marge au-delà de la
// fente ne sert qu'à fixer la résolution angulaire côté écran (cf. ratio ci-dessous), pas à
// « contenir » le faisceau.
//
// FFT_FENETRE_FACTEUR = 25 reproduit exactement le comportement (déjà jugé correct) de l'ancien
// réglage fixe AU RÉGLAGE PAR DÉFAUT (2,5 mm / 100 µm = 25) et le généralise à toute valeur de
// `a` : le nombre d'échantillons DANS la fente (N/FFT_FENETRE_FACTEUR = 1024/25 ≈ 41) et le
// nombre de pas angulaires entre le centre et le 1er minimum (toujours exactement
// FFT_FENETRE_FACTEUR, cf. calcul ci-dessous) restent désormais CONSTANTS quels que soient
// a/λ/D — au lieu de dégénérer à a minimal.
//
// Portée couverte à l'écran, en unités du 1er minimum x1 : ratio = Coverage/x1 =
// N/(2·FFT_FENETRE_FACTEUR) = 1024/50 ≈ 20,5 — désormais INDÉPENDANT de `a` (pas seulement de λ
// et D comme avec la fenêtre fixe) : couvre largement plusieurs taches secondaires, quel que
// soit le réglage. Au-delà de la portée couverte, échantillonnerChamp() renvoie 0 (l'intensité y
// est de toute façon négligeable en pratique).
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
//  Construit le champ diffracté par la fente (masque rectangulaire a × FENTE_HAUTEUR_CM,
//  éclairé par le profil gaussien du faisceau incident, cf. discussion de conception),
//  propagé en champ lointain par FFT2D. Renvoie une grille d'intensité normalisée (pic
//  central = 1, même convention que intensiteOuverture()) ainsi que λ et D, réutilisés par
//  échantillonnerChamp() pour convertir position écran → indice de grille (relation
//  géométrique EXACTE, cf. sa docstring — pas une simple mise à l'échelle par λ·D).
//  Appelée une seule fois par changement de paramètre (scene.js → updateSceneParams), le
//  résultat est ensuite échantillonné en de nombreux points (texture, enveloppe 3D) sans
//  recalcul — la FFT elle-même est le seul poste coûteux.
// ─────────────────────────────────────────────────────────────────────
function construireChampOuverture(lambda_nm, a_um, D_m, shape = sim.maskShape) {
  const N = FFT_N;
  const lambda_m = lambda_nm * 1e-9;
  const a_m = a_um * 1e-6;
  // Dimension caractéristique PLEINE de l'ouverture, utilisée pour dimensionner la fenêtre FFT
  // (cf. discussion de conception ci-dessus) : diamètre (2·a_m) pour le cercle, puisque a_um en
  // est le RAYON (cf. MASK_SHAPES) — sinon la fenêtre serait deux fois trop étroite par rapport
  // aux autres formes (où a_um est déjà une dimension pleine), cassant le ratio couverture/1er-
  // minimum vérifié à l'origine pour FFT_FENETRE_FACTEUR (cf. piège §4 de PISTES_EVOLUTION.md).
  const extent_m = shape === 'cercle' ? 2 * a_m : a_m;
  const FFT_FENETRE_M = FFT_FENETRE_FACTEUR * extent_m;
  const pas = FFT_FENETRE_M / N;
  const h_m = FENTE_HAUTEUR_CM / 100;
  const w0 = FAISCEAU_DIAMETRE_MM / 2 / 1000; // rayon du faisceau au col (m) — même valeur que largeurFaisceauGaussien

  const re = _fftRe, im = _fftIm;
  re.fill(0); im.fill(0); // champ incident réel (pas de courbure de phase au col, cf. approximation ci-dessus) : im reste nul

  // Masque de l'ouverture, par forme (cf. sim.maskShape/MASK_SHAPES) :
  //  - fente  : rectangle a × FENTE_HAUTEUR_CM (comportement historique, inchangé)
  //  - carre  : rectangle a × a (côté réglable dans les deux sens, cf. §2 de PISTES_EVOLUTION.md)
  //  - cercle : disque de rayon a (a_um = rayon, cf. MASK_SHAPES)
  //  - fil    : PAS un masque complémentaire de la fente ici (essayé, mais le champ juste après
  //    un fil est dominé par le faisceau non diffracté qui passe presque intégralement à côté —
  //    une fois la grille FFT normalisée par CE pic géant, les franges de Babinet, ~1000× plus
  //    faibles, deviennent numériquement invisibles). Comme intensiteSinc() ci-dessus, on
  //    réutilise directement le masque de la fente : la figure de diffraction EST rigoureusement
  //    la même hors du centre (Babinet), et c'est cette figure-là (pas le pic non diffracté)
  //    qu'on veut montrer sur la texture d'écran/l'enveloppe 3D — seule la représentation 3D de
  //    la diapositive (le fil, cf. scene.js) reste visuellement complémentaire de la fente.
  for (let j = 0; j < N; j++) {
    const y = (j - N / 2) * pas;
    const base = j * N;
    for (let i = 0; i < N; i++) {
      const x = (i - N / 2) * pas;
      let ouvert;
      if (shape === 'carre') {
        ouvert = Math.abs(x) < a_m / 2 && Math.abs(y) < a_m / 2;
      } else if (shape === 'cercle') {
        ouvert = (x * x + y * y) < a_m * a_m;
      } else { // fente / fil (cf. commentaire ci-dessus)
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
    pts[i] = { x, I: intensiteOuverture(x, lambda_nm, sim.a, sim.D) };
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

// Décalage vertical CIBLE (cm) de chaque couleur en vue « Décomposer la figure de
// diffraction » (bouton disponible en vue Écran + lumière blanche, cf. scene.js →
// dessinerTextureEcranBlanche) — un décalage par entrée de BLANCHE_COULEURS, même ordre :
// violet tout en haut, rouge tout en bas, les 4 autres également réparties entre les deux
// (demande explicite de l'utilisateur : -3 cm à +3 cm, pas de raison de couvrir toute la
// hauteur réelle de l'écran, SCREEN_HEIGHT=15 cm cf. scene.js — on reste compact). Le signe
// est celui qui affiche VISUELLEMENT en haut de l'écran, PAS le signe physique intuitif :
// la texture (canvas 2D, py=0 = première ligne écrite) est appliquée avec l'orientation par
// défaut de Three.js (CanvasTexture.flipY=true) sur un plan non retourné, ce qui fait qu'un
// y_cm POSITIF (cf. la même formule dans le code de rendu) apparaît en BAS de l'écran, pas
// en haut — d'où le violet (en haut voulu) sur la valeur la plus NÉGATIVE.
const DECOMPOSE_Y_CM = [-3, -1.8, -0.6, 0.6, 1.8, 3];

// ─────────────────────────────────────────────────────────────────────
//  Composantes RGB (0-255, PAS normalisées) de chacune des 6 couleurs de référence à
//  l'abscisse x_m, ainsi que leur somme normalisée (« couleur composite », cf.
//  intensiteBlancheRGB ci-dessous). Racine carrée sur chaque intensité AVANT pondération
//  (même compression que IxAffichage en mode mono, cf. scene.js) : sans elle, les franges
//  secondaires (colorées) seraient quasi invisibles. Les composantes NON normalisées sont
//  réutilisées telles quelles par la vue « Décomposer » (chaque couleur y garde sa PROPRE
//  figure de diffraction, pas de raison de la renormaliser comme le composite).
// ─────────────────────────────────────────────────────────────────────
function intensiteBlancheComposantes(x_m, a_um, D_m) {
  const composantes = new Array(BLANCHE_COULEURS.length);
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < BLANCHE_COULEURS.length; i++) {
    const c = BLANCHE_COULEURS[i];
    const I = Math.sqrt(intensiteOuverture(x_m, c.lambda, a_um, D_m));
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
//  Couleur composite (0-255 par canal) de la figure de diffraction en lumière blanche, au
//  point d'abscisse x_m de l'écran — cf. intensiteBlancheComposantes ci-dessus.
// ─────────────────────────────────────────────────────────────────────
function intensiteBlancheRGB(x_m, a_um, D_m) {
  return intensiteBlancheComposantes(x_m, a_um, D_m).merged;
}

// ─────────────────────────────────────────────────────────────────────
//  Remet les paramètres à leurs valeurs par défaut.
// ─────────────────────────────────────────────────────────────────────
function resetParams() {
  sim.lambda = 633;
  sim.a = 100;
  sim.d = 0.50;
  sim.D = 1.0;
  sim.lightSource = 'mono';
  for (const c of BLANCHE_COULEURS) sim.blancheVisibles[c.nom] = true;
  sim.showRays = false;
  sim.beamMode = 'off';
  sim.showLengths = false;
  sim.maskShape = 'fente';
}
