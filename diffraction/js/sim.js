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
  showRays: true,  // afficher les rayons pointillés vers les 1ers minima
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
//  Écart angulaire du premier minimum de diffraction : sin θ ≈ λ/a.
//  Renvoie θ en radians (petit angle, valide dans tout le domaine réglable).
// ─────────────────────────────────────────────────────────────────────
function thetaPremierMinimum(lambda_nm, a_um) {
  const lambda = lambda_nm * 1e-9;
  const a = a_um * 1e-6;
  return lambda / a;
}

// ─────────────────────────────────────────────────────────────────────
//  Position du premier minimum sur l'écran (m), à distance D (m).
// ─────────────────────────────────────────────────────────────────────
function xPremierMinimum(lambda_nm, a_um, D_m) {
  return Math.tan(thetaPremierMinimum(lambda_nm, a_um)) * D_m;
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

// ─────────────────────────────────────────────────────────────────────
//  Échantillonne I(x) sur toute la largeur de l'écran (n points, de
//  -screenHalfWidth à +screenHalfWidth). Utilisée à la fois par le graphe
//  (graph.js) et par la texture projetée sur l'écran 3D (scene.js) :
//  source physique unique, pas de duplication du calcul.
// ─────────────────────────────────────────────────────────────────────
function echantillonnerIntensite(n) {
  const pts = new Array(n);
  const w = sim.screenHalfWidth;
  for (let i = 0; i < n; i++) {
    const x = -w + (2 * w * i) / (n - 1);
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
  sim.showRays = true;
}
