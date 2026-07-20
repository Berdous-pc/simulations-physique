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
  D: 2.0,          // distance fente-écran (m)
  showRays: false, // afficher les rayons pointillés vers les 1ers minima + l'axe optique
  beamMode: 'off', // 'off' (aucun faisceau) | 'laserOnly' (laser→fente) | 'visible' (laser + diffracté)
  showLengths: false, // afficher les doubles flèches de mesure d, D, L
  view: '3d',      // '3d' | 'top' | 'side' | 'screen'

  // Demi-largeur physique de l'écran simulé (m) — fixe, écran réel de TP 25×15 cm, cf. ARCHITECTURE.md
  screenHalfWidth: 0.125
};

// ── Bornes du réglage de largeur de fente (µm) — aussi utilisées par
//    scene.js pour la correspondance avec la largeur visuelle schématique.
//    Les autres bornes (λ, D) ne vivent que dans les attributs min/max
//    des <input type=range> du panneau, pas dupliquées ici.
const A_MIN = 20, A_MAX = 500;

// ─────────────────────────────────────────────────────────────────────
//  Écart angulaire du m-ième minimum de diffraction : sin θ ≈ m·λ/a.
//  Renvoie θ en radians (petit angle, valide dans tout le domaine réglable).
//  m=1 → 1er minimum (limite de la tache centrale), m=2 → limite de la
//  1ère tache secondaire, etc.
// ─────────────────────────────────────────────────────────────────────
function thetaMinimum(lambda_nm, a_um, m) {
  const lambda = lambda_nm * 1e-9;
  const a = a_um * 1e-6;
  return m * lambda / a;
}
function thetaPremierMinimum(lambda_nm, a_um) {
  return thetaMinimum(lambda_nm, a_um, 1);
}

// ─────────────────────────────────────────────────────────────────────
//  Position du m-ième minimum sur l'écran (m), à distance D (m).
// ─────────────────────────────────────────────────────────────────────
function xMinimum(lambda_nm, a_um, D_m, m) {
  return Math.tan(thetaMinimum(lambda_nm, a_um, m)) * D_m;
}
function xPremierMinimum(lambda_nm, a_um, D_m) {
  return xMinimum(lambda_nm, a_um, D_m, 1);
}

// ─────────────────────────────────────────────────────────────────────
//  Intensité diffractée normalisée en un point d'abscisse x (m) de l'écran.
//  Formule de Fraunhofer pour une fente simple : I(θ) = I0 · sinc²(π·a·sinθ/λ).
//  sinθ = x / √(x²+D²) (exacte, pas d'approximation petit angle sur θ lui-même).
// ─────────────────────────────────────────────────────────────────────
function intensiteFente(x_m, lambda_nm, a_um, D_m) {
  const lambda = lambda_nm * 1e-9;
  const a = a_um * 1e-6;
  const sinTheta = x_m / Math.sqrt(x_m * x_m + D_m * D_m);
  const beta = Math.PI * a * sinTheta / lambda;
  if (Math.abs(beta) < 1e-6) return 1;
  const s = Math.sin(beta) / beta;
  return s * s;
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
//  supposé situé au niveau de la fente (l'écart réel de 15 cm laser-fente,
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
//  intensiteFente() ci-dessus (formule fermée, exacte) reste la SEULE source pour le graphe
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
//  central = 1, même convention que intensiteFente()) ainsi que λ et D, réutilisés par
//  échantillonnerChamp() pour convertir position écran → indice de grille (relation
//  géométrique EXACTE, cf. sa docstring — pas une simple mise à l'échelle par λ·D).
//  Appelée une seule fois par changement de paramètre (scene.js → updateSceneParams), le
//  résultat est ensuite échantillonné en de nombreux points (texture, enveloppe 3D) sans
//  recalcul — la FFT elle-même est le seul poste coûteux.
// ─────────────────────────────────────────────────────────────────────
function construireChampOuverture(lambda_nm, a_um, D_m) {
  const N = FFT_N;
  const lambda_m = lambda_nm * 1e-9;
  const a_m = a_um * 1e-6;
  const FFT_FENETRE_M = FFT_FENETRE_FACTEUR * a_m; // cf. discussion de conception ci-dessus
  const pas = FFT_FENETRE_M / N;
  const h_m = FENTE_HAUTEUR_CM / 100;
  const w0 = FAISCEAU_DIAMETRE_MM / 2 / 1000; // rayon du faisceau au col (m) — même valeur que largeurFaisceauGaussien

  const re = _fftRe, im = _fftIm;
  re.fill(0); im.fill(0); // champ incident réel (pas de courbure de phase au col, cf. approximation ci-dessus) : im reste nul

  for (let j = 0; j < N; j++) {
    const y = (j - N / 2) * pas;
    if (Math.abs(y) >= h_m / 2) continue; // hors fente en y (n'arrive jamais en pratique, cf. commentaire FENTE_HAUTEUR_CM)
    const base = j * N;
    for (let i = 0; i < N; i++) {
      const x = (i - N / 2) * pas;
      if (Math.abs(x) >= a_m / 2) continue; // hors fente en x
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
//  géométrique que intensiteFente() — cf. sa docstring), PAS l'approximation paraxiale
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
// ─────────────────────────────────────────────────────────────────────
function echantillonnerIntensite(n, xMin, xMax) {
  const pts = new Array(n);
  const lo = xMin ?? -sim.screenHalfWidth, hi = xMax ?? sim.screenHalfWidth;
  for (let i = 0; i < n; i++) {
    const x = lo + ((hi - lo) * i) / (n - 1);
    pts[i] = { x, I: intensiteFente(x, sim.lambda, sim.a, sim.D) };
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

// ─────────────────────────────────────────────────────────────────────
//  Remet les paramètres à leurs valeurs par défaut.
// ─────────────────────────────────────────────────────────────────────
function resetParams() {
  sim.lambda = 633;
  sim.a = 100;
  sim.D = 2.0;
  sim.showRays = false;
  sim.beamMode = 'off';
  sim.showLengths = false;
}
