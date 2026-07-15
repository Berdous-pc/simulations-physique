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
const DISS_ION_COLORS = {
  Mg: { fill: '#d9822b', border: '#95571a', label: '#4a2c00' },   // ambre
  I:  { fill: '#6a3aa0', border: '#4a2470', label: '#ffffff' },   // violet — convention usuelle du diiode
};

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
  {
    id: 'i2', formule: 'I₂', nom: 'Diiode',
    dissocie: false,
    grain: [
      { el: 'I', dx: -0.8, dy: 0 },
      { el: 'I', dx:  0.8, dy: 0 },
    ],
    especes: [
      { formule: 'I₂', coeff: 1, el: 'I', label: null, fill: DISS_ION_COLORS.I.fill, border: DISS_ION_COLORS.I.border, labelColor: DISS_ION_COLORS.I.label },
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
