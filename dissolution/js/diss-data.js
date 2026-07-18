// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

/* diss-data.js — données des solutés proposés dans l'onglet Dissolution.
   Chargé après sim.js (réutilise ATOM_COLORS/ATOM_BORDER/ATOM_LABEL_COLOR),
   avant diss.js. */

/* Couleurs des espèces non déjà définies par sim.js (Na⁺ jaune, Cl⁻ vert,
   réutilisées telles quelles pour rester cohérent avec l'onglet Mécanisme). */
/* Deux ions de la même famille chimique ne se retrouvent jamais ensemble
   en solution dans cette page (un seul soluté affiché à la fois), donc on
   réutilise volontairement la même couleur pour les ions d'une même
   famille : c'est plus cohérent pédagogiquement (même couleur = même
   comportement chimique) que d'inventer une teinte par espèce. */
const DISS_ION_COLORS = {
  // Cations alcalins (Na⁺, K⁺) — incolores en réalité, même couleur (jaune, cf. Na⁺ de sim.js)
  K:      { fill: '#e8c020', border: '#a87810', label: '#6b4a00' },   // = Na⁺ (même famille, jamais coprésents)
  // Cations alcalino-terreux (Mg²⁺, Ca²⁺, Ba²⁺) — incolores en réalité, même violet
  Mg:     { fill: '#8840cc', border: '#5a2090', label: '#ffffff' },   // violet — idem onglet Équilibrage
  Ca:     { fill: '#8840cc', border: '#5a2090', label: '#ffffff' },   // = Mg²⁺ (même famille, jamais coprésents)
  Ba:     { fill: '#8840cc', border: '#5a2090', label: '#ffffff' },   // = Mg²⁺ (même famille, jamais coprésents)
  // Anions halogénures (Cl⁻, Br⁻) — incolores en réalité, même vert
  Br:     { fill: '#1a7a1a', border: '#0d4d0d', label: '#ffffff' },   // = Cl⁻ (même famille, jamais coprésents)
  // Oxanions incolores (OH⁻, SO₄²⁻, CO₃²⁻, NO₃⁻) — même émeraude, jamais coprésents
  // (décalé du bleu de Cu²⁺ et du gris d'Ag⁺, avec lequel NO₃⁻ coexiste dans AgNO₃)
  OH:     { fill: '#a8d8b0', border: '#6aa878', label: '#1c4a2c' },
  SO4:    { fill: '#a8d8b0', border: '#6aa878', label: '#1c4a2c' },   // = HO⁻ (même famille, jamais coprésents)
  CO3:    { fill: '#a8d8b0', border: '#6aa878', label: '#1c4a2c' },   // = HO⁻ (même famille, jamais coprésents)
  NO3:    { fill: '#a8d8b0', border: '#6aa878', label: '#1c4a2c' },   // = HO⁻ (même famille, jamais coprésents)
  // Cations métalliques restants, chacun sa propre couleur (pas de famille commune ici)
  Ag:     { fill: '#adadb5', border: '#6e6e78', label: '#303030' },   // gris argenté, clin d'œil à « argent »
  Al:     { fill: '#c85888', border: '#8a3058', label: '#ffffff' },   // rose-mauve, incolore en réalité
  // Espèces à couleur réelle marquée en solution : la couleur DOIT correspondre
  Cu:     { fill: '#0ab0e8', border: '#0880ac', label: '#ffffff' },   // bleu cyan vif — solution de Cu²⁺ (sulfate de cuivre)
  Fe:     { fill: '#a8480f', border: '#6e2e08', label: '#ffffff' },   // brun-rouille — Fe³⁺, assombri pour rester distinct de I₂/Cr₂O₇²⁻
  MnO4:   { fill: '#9a1090', border: '#64085e', label: '#ffffff' },   // violet-magenta permanganate
  Cr2O7:  { fill: '#f0921a', border: '#a8620c', label: '#ffffff' },   // orange vif dichromate
  I:      { fill: '#c87820', border: '#8a5010', label: '#ffffff' },   // orange — idem onglet Titrage (I₂ molécule)
  Iod:    { fill: '#c87820', border: '#8a5010', label: '#ffffff' },   // I⁻ = I₂ (même élément, même couleur)
  Glc:    { fill: '#e8e4d8', border: '#a8a290', label: '#4a4638' },   // blanc cassé — glucose incolore, contraste avec I₂
  AscA:   { fill: '#f0e6a0', border: '#c8ba60', label: '#5c4c10' },   // jaune pâle — acide ascorbique, distinct du jaune vif Na⁺/K⁺
};

/* Concentration effective (mol·L⁻¹) de l'espèce colorante à partir de
   laquelle l'eau du verre affiche la teinte de saturation (cf. `tint: true`
   sur les especes ci-dessous, et son usage dans dissWaterTint(), diss.js). */
const DISS_SOLUTION_COLOR_SAT_MOLL = 20;

/* Chaque soluté définit :
   - `grain` : géométrie du groupement formulaire saisi dans la coupelle
     (positions relatives en unités de rayon), affiché tel quel pendant le
     clic-glisser, avant tout contact avec l'eau ;
   - `especes` : ce que devient ce groupement une fois dans l'eau. Pour un
     solide ionique (`dissocie: true`), une entrée par ion avec son
     coefficient stœchiométrique (ex. 2 pour Cl⁻ dans MgCl₂). Pour un solide
     moléculaire (`dissocie: false`, ex. I₂), une seule entrée : aucune
     séparation, le groupement reste intact en solution. */
const SOLUTES = [
  {
    id: 'nacl', formule: 'NaCl', nom: 'Chlorure de sodium',
    dissocie: true,
    grain: [
      { el: 'Na', dx: -0.8, dy: 0 },
      { el: 'Cl', dx:  0.8, dy: 0 },
    ],
    especes: [
      { formule: 'Na⁺', coeff: 1, el: 'Na', label: 'Na⁺', fill: ATOM_COLORS.Na, border: ATOM_BORDER.Na, labelColor: ATOM_LABEL_COLOR.Na },
      { formule: 'Cl⁻', coeff: 1, el: 'Cl', label: 'Cl⁻', fill: ATOM_COLORS.Cl, border: ATOM_BORDER.Cl, labelColor: ATOM_LABEL_COLOR.Cl },
    ],
  },
  {
    id: 'mgcl2', formule: 'MgCl₂', nom: 'Chlorure de magnésium',
    dissocie: true,
    grain: [
      { el: 'Mg', dx: 0,    dy: -0.6 },
      { el: 'Cl', dx: -0.8, dy: 0.5 },
      { el: 'Cl', dx: 0.8,  dy: 0.5 },
    ],
    especes: [
      { formule: 'Mg²⁺', coeff: 1, el: 'Mg', label: 'Mg²⁺', fill: DISS_ION_COLORS.Mg.fill, border: DISS_ION_COLORS.Mg.border, labelColor: DISS_ION_COLORS.Mg.label },
      { formule: 'Cl⁻',  coeff: 2, el: 'Cl', label: 'Cl⁻',  fill: ATOM_COLORS.Cl, border: ATOM_BORDER.Cl, labelColor: ATOM_LABEL_COLOR.Cl },
    ],
  },
  // ── Stœchiométrie 1:1 ────────────────────────────────────────────────
  {
    id: 'nabr', formule: 'NaBr', nom: 'Bromure de sodium',
    dissocie: true,
    grain: [
      { el: 'Na', dx: -0.8, dy: 0 },
      { el: 'Br', dx:  0.8, dy: 0 },
    ],
    especes: [
      { formule: 'Na⁺', coeff: 1, el: 'Na', label: 'Na⁺', fill: ATOM_COLORS.Na, border: ATOM_BORDER.Na, labelColor: ATOM_LABEL_COLOR.Na },
      { formule: 'Br⁻', coeff: 1, el: 'Br', label: 'Br⁻', fill: DISS_ION_COLORS.Br.fill, border: DISS_ION_COLORS.Br.border, labelColor: DISS_ION_COLORS.Br.label },
    ],
  },
  {
    id: 'ki', formule: 'KI', nom: 'Iodure de potassium',
    dissocie: true,
    grain: [
      { el: 'K',   dx: -0.8, dy: 0 },
      { el: 'Iod', dx:  0.8, dy: 0 },
    ],
    especes: [
      { formule: 'K⁺', coeff: 1, el: 'K',   label: 'K⁺', fill: DISS_ION_COLORS.K.fill,   border: DISS_ION_COLORS.K.border,   labelColor: DISS_ION_COLORS.K.label },
      { formule: 'I⁻', coeff: 1, el: 'Iod', label: 'I⁻', fill: DISS_ION_COLORS.Iod.fill, border: DISS_ION_COLORS.Iod.border, labelColor: DISS_ION_COLORS.Iod.label },
    ],
  },
  {
    id: 'kcl', formule: 'KCl', nom: 'Chlorure de potassium',
    dissocie: true,
    grain: [
      { el: 'K',  dx: -0.8, dy: 0 },
      { el: 'Cl', dx:  0.8, dy: 0 },
    ],
    especes: [
      { formule: 'K⁺',  coeff: 1, el: 'K',  label: 'K⁺',  fill: DISS_ION_COLORS.K.fill, border: DISS_ION_COLORS.K.border, labelColor: DISS_ION_COLORS.K.label },
      { formule: 'Cl⁻', coeff: 1, el: 'Cl', label: 'Cl⁻', fill: ATOM_COLORS.Cl, border: ATOM_BORDER.Cl, labelColor: ATOM_LABEL_COLOR.Cl },
    ],
  },
  {
    id: 'agno3', formule: 'AgNO₃', nom: "Nitrate d'argent",
    dissocie: true,
    grain: [
      { el: 'Ag',  dx: -0.8, dy: 0 },
      { el: 'NO3', dx:  0.8, dy: 0 },
    ],
    especes: [
      { formule: 'Ag⁺',  coeff: 1, el: 'Ag',  label: 'Ag⁺',  fill: DISS_ION_COLORS.Ag.fill,  border: DISS_ION_COLORS.Ag.border,  labelColor: DISS_ION_COLORS.Ag.label },
      { formule: 'NO₃⁻', coeff: 1, el: 'NO3', label: 'NO₃⁻', fill: DISS_ION_COLORS.NO3.fill, border: DISS_ION_COLORS.NO3.border, labelColor: DISS_ION_COLORS.NO3.label },
    ],
  },
  {
    id: 'kmno4', formule: 'KMnO₄', nom: 'Permanganate de potassium',
    dissocie: true,
    grain: [
      { el: 'K',    dx: -0.8, dy: 0 },
      { el: 'MnO4', dx:  0.8, dy: 0 },
    ],
    especes: [
      { formule: 'K⁺',    coeff: 1, el: 'K',    label: 'K⁺',    fill: DISS_ION_COLORS.K.fill,    border: DISS_ION_COLORS.K.border,    labelColor: DISS_ION_COLORS.K.label },
      { formule: 'MnO₄⁻', coeff: 1, el: 'MnO4', label: 'MnO₄⁻', fill: DISS_ION_COLORS.MnO4.fill, border: DISS_ION_COLORS.MnO4.border, labelColor: DISS_ION_COLORS.MnO4.label, tint: true },
    ],
  },
  {
    id: 'cuso4', formule: 'CuSO₄', nom: 'Sulfate de cuivre',
    dissocie: true,
    grain: [
      { el: 'Cu',  dx: -0.8, dy: 0 },
      { el: 'SO4', dx:  0.8, dy: 0 },
    ],
    especes: [
      { formule: 'Cu²⁺', coeff: 1, el: 'Cu',  label: 'Cu²⁺', fill: DISS_ION_COLORS.Cu.fill,  border: DISS_ION_COLORS.Cu.border,  labelColor: DISS_ION_COLORS.Cu.label, tint: true },
      { formule: 'SO₄²⁻', coeff: 1, el: 'SO4', label: 'SO₄²⁻', fill: DISS_ION_COLORS.SO4.fill, border: DISS_ION_COLORS.SO4.border, labelColor: DISS_ION_COLORS.SO4.label },
    ],
  },
  {
    id: 'naoh', formule: 'NaOH', nom: "Hydroxyde de sodium",
    dissocie: true,
    grain: [
      { el: 'Na', dx: -0.8, dy: 0 },
      { el: 'OH', dx:  0.8, dy: 0 },
    ],
    especes: [
      { formule: 'Na⁺', coeff: 1, el: 'Na', label: 'Na⁺', fill: ATOM_COLORS.Na, border: ATOM_BORDER.Na, labelColor: ATOM_LABEL_COLOR.Na },
      { formule: 'HO⁻', coeff: 1, el: 'OH', label: 'HO⁻', fill: DISS_ION_COLORS.OH.fill, border: DISS_ION_COLORS.OH.border, labelColor: DISS_ION_COLORS.OH.label },
    ],
  },
  // ── Stœchiométrie 1:2 / 2:1 ──────────────────────────────────────────
  {
    id: 'cacl2', formule: 'CaCl₂', nom: 'Chlorure de calcium',
    dissocie: true,
    grain: [
      { el: 'Ca', dx: 0,    dy: -0.6 },
      { el: 'Cl', dx: -0.8, dy: 0.5 },
      { el: 'Cl', dx: 0.8,  dy: 0.5 },
    ],
    especes: [
      { formule: 'Ca²⁺', coeff: 1, el: 'Ca', label: 'Ca²⁺', fill: DISS_ION_COLORS.Ca.fill, border: DISS_ION_COLORS.Ca.border, labelColor: DISS_ION_COLORS.Ca.label },
      { formule: 'Cl⁻',  coeff: 2, el: 'Cl', label: 'Cl⁻',  fill: ATOM_COLORS.Cl, border: ATOM_BORDER.Cl, labelColor: ATOM_LABEL_COLOR.Cl },
    ],
  },
  {
    id: 'bacl2', formule: 'BaCl₂', nom: 'Chlorure de baryum',
    dissocie: true,
    grain: [
      { el: 'Ba', dx: 0,    dy: -0.6 },
      { el: 'Cl', dx: -0.8, dy: 0.5 },
      { el: 'Cl', dx: 0.8,  dy: 0.5 },
    ],
    especes: [
      { formule: 'Ba²⁺', coeff: 1, el: 'Ba', label: 'Ba²⁺', fill: DISS_ION_COLORS.Ba.fill, border: DISS_ION_COLORS.Ba.border, labelColor: DISS_ION_COLORS.Ba.label },
      { formule: 'Cl⁻',  coeff: 2, el: 'Cl', label: 'Cl⁻',  fill: ATOM_COLORS.Cl, border: ATOM_BORDER.Cl, labelColor: ATOM_LABEL_COLOR.Cl },
    ],
  },
  {
    id: 'na2co3', formule: 'Na₂CO₃', nom: 'Carbonate de sodium',
    dissocie: true,
    grain: [
      { el: 'CO3', dx: 0,    dy: -0.6 },
      { el: 'Na',  dx: -0.8, dy: 0.5 },
      { el: 'Na',  dx: 0.8,  dy: 0.5 },
    ],
    especes: [
      { formule: 'Na⁺',  coeff: 2, el: 'Na',  label: 'Na⁺',  fill: ATOM_COLORS.Na, border: ATOM_BORDER.Na, labelColor: ATOM_LABEL_COLOR.Na },
      { formule: 'CO₃²⁻', coeff: 1, el: 'CO3', label: 'CO₃²⁻', fill: DISS_ION_COLORS.CO3.fill, border: DISS_ION_COLORS.CO3.border, labelColor: DISS_ION_COLORS.CO3.label },
    ],
  },
  {
    id: 'na2so4', formule: 'Na₂SO₄', nom: 'Sulfate de sodium',
    dissocie: true,
    grain: [
      { el: 'SO4', dx: 0,    dy: -0.6 },
      { el: 'Na',  dx: -0.8, dy: 0.5 },
      { el: 'Na',  dx: 0.8,  dy: 0.5 },
    ],
    especes: [
      { formule: 'Na⁺',  coeff: 2, el: 'Na',  label: 'Na⁺',  fill: ATOM_COLORS.Na, border: ATOM_BORDER.Na, labelColor: ATOM_LABEL_COLOR.Na },
      { formule: 'SO₄²⁻', coeff: 1, el: 'SO4', label: 'SO₄²⁻', fill: DISS_ION_COLORS.SO4.fill, border: DISS_ION_COLORS.SO4.border, labelColor: DISS_ION_COLORS.SO4.label },
    ],
  },
  {
    id: 'k2cr2o7', formule: 'K₂Cr₂O₇', nom: 'Dichromate de potassium',
    dissocie: true,
    grain: [
      { el: 'Cr2O7', dx: 0,    dy: -0.6 },
      { el: 'K',     dx: -0.8, dy: 0.5 },
      { el: 'K',     dx: 0.8,  dy: 0.5 },
    ],
    especes: [
      { formule: 'K⁺',      coeff: 2, el: 'K',     label: 'K⁺',      fill: DISS_ION_COLORS.K.fill,     border: DISS_ION_COLORS.K.border,     labelColor: DISS_ION_COLORS.K.label },
      { formule: 'Cr₂O₇²⁻', coeff: 1, el: 'Cr2O7', label: 'Cr₂O₇²⁻', fill: DISS_ION_COLORS.Cr2O7.fill, border: DISS_ION_COLORS.Cr2O7.border, labelColor: DISS_ION_COLORS.Cr2O7.label, tint: true },
    ],
  },
  // ── Stœchiométrie 2:3 ────────────────────────────────────────────────
  {
    id: 'al2so43', formule: 'Al₂(SO₄)₃', nom: "Sulfate d'aluminium",
    dissocie: true,
    grain: [
      { el: 'Al',  dx: -0.4, dy: -0.7 },
      { el: 'Al',  dx:  0.4, dy: -0.7 },
      { el: 'SO4', dx: -0.9, dy: 0.4 },
      { el: 'SO4', dx:  0,   dy: 0.75 },
      { el: 'SO4', dx:  0.9, dy: 0.4 },
    ],
    especes: [
      { formule: 'Al³⁺',  coeff: 2, el: 'Al',  label: 'Al³⁺',  fill: DISS_ION_COLORS.Al.fill,  border: DISS_ION_COLORS.Al.border,  labelColor: DISS_ION_COLORS.Al.label },
      { formule: 'SO₄²⁻', coeff: 3, el: 'SO4', label: 'SO₄²⁻', fill: DISS_ION_COLORS.SO4.fill, border: DISS_ION_COLORS.SO4.border, labelColor: DISS_ION_COLORS.SO4.label },
    ],
  },
  {
    id: 'fe2so43', formule: 'Fe₂(SO₄)₃', nom: 'Sulfate de fer (III)',
    dissocie: true,
    grain: [
      { el: 'Fe',  dx: -0.4, dy: -0.7 },
      { el: 'Fe',  dx:  0.4, dy: -0.7 },
      { el: 'SO4', dx: -0.9, dy: 0.4 },
      { el: 'SO4', dx:  0,   dy: 0.75 },
      { el: 'SO4', dx:  0.9, dy: 0.4 },
    ],
    especes: [
      { formule: 'Fe³⁺',  coeff: 2, el: 'Fe',  label: 'Fe³⁺',  fill: DISS_ION_COLORS.Fe.fill,  border: DISS_ION_COLORS.Fe.border,  labelColor: DISS_ION_COLORS.Fe.label, tint: true },
      { formule: 'SO₄²⁻', coeff: 3, el: 'SO4', label: 'SO₄²⁻', fill: DISS_ION_COLORS.SO4.fill, border: DISS_ION_COLORS.SO4.border, labelColor: DISS_ION_COLORS.SO4.label },
    ],
  },
  // ── Solide moléculaire (ne se dissocie pas) ─────────────────────────
  {
    id: 'i2', formule: 'I₂', nom: 'Diiode',
    dissocie: false,
    grain: [
      { el: 'I', dx: -0.8, dy: 0 },
      { el: 'I', dx:  0.8, dy: 0 },
    ],
    especes: [
      { formule: 'I₂', coeff: 1, el: 'I', label: null, fill: DISS_ION_COLORS.I.fill, border: DISS_ION_COLORS.I.border, labelColor: DISS_ION_COLORS.I.label, tint: true },
    ],
  },
  {
    id: 'glucose', formule: 'C₆H₁₂O₆', nom: 'Glucose',
    dissocie: false,
    grain: [
      { el: 'Glc', dx: 0, dy: 0 },
    ],
    especes: [
      { formule: 'C₆H₁₂O₆', coeff: 1, el: 'Glc', label: null, fill: DISS_ION_COLORS.Glc.fill, border: DISS_ION_COLORS.Glc.border, labelColor: DISS_ION_COLORS.Glc.label },
    ],
  },
  {
    id: 'ascorbique', formule: 'C₆H₈O₆', nom: 'Acide ascorbique',
    dissocie: false,
    grain: [
      { el: 'AscA', dx: 0, dy: 0 },
    ],
    especes: [
      { formule: 'C₆H₈O₆', coeff: 1, el: 'AscA', label: null, fill: DISS_ION_COLORS.AscA.fill, border: DISS_ION_COLORS.AscA.border, labelColor: DISS_ION_COLORS.AscA.label },
    ],
  },
];

/* Texte de l'équation de dissolution, généré depuis les données ci-dessus
   (pas de champ statique à maintenir séparément). Le coefficient n'est
   affiché que s'il diffère de 1. */
function dissEquationText(solute) {
  const droite = solute.especes
    .map(esp => (esp.coeff > 1 ? esp.coeff + ' ' : '') + esp.formule + ' (aq)')
    .join('  +  ');
  return solute.formule + ' (s)  →  ' + droite;
}
