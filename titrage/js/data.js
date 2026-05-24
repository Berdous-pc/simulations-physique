/* ══════════════════════════════════════════════════════════════════════════
   Simulation pédagogique — Physique-Chimie Lycée
   Auteur  : Mathieu Berdous
   Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   DATA.JS — Données des réactions de titrage et couleurs molécules
   Chargé en premier.
   Expose : TITRAGE_REACTIONS, MOL_COLORS, MOL_BORDER_COLORS,
             COL_BG_TITRANT, COL_BG_TITRE, COL_BG_PRODUIT, COL_BG_EXCES
══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   RÉACTIONS DE TITRAGE
   Chaque réaction a :
   - label         : texte affiché dans le sélecteur
   - titrant       : réactif titrant — toujours à gauche
   - titre         : réactif titré  — colonne centrale
   - produits      : tableau de 2 produits (C, D)
   - fullEquation  : (optionnel) liste de groupes pour l'affichage complet
       Chaque groupe : { coeff, text, type }
         coeff : nombre (1 = affiché seulement si showCoeffOne)
         text  : formule chimique
         type  : 'active' | 'implicit'
       Séparateurs : { type: 'op' } ou { type: 'arrow' }
   Les réactions génériques (A/B/C/D) n'ont pas de fullEquation.
══════════════════════════════════════════════════════════════════════════ */
const TITRAGE_REACTIONS = [
  {
    label: 'A + B → C + D',
    titrant: { formula: 'A', coeff: 1 },
    titre:   { formula: 'B', coeff: 1 },
    produits: [
      { formula: 'C', coeff: 1 },
      { formula: 'D', coeff: 1 },
    ],
  },
  {
    label: '2 A + B → C + D',
    titrant: { formula: 'A', coeff: 2 },
    titre:   { formula: 'B', coeff: 1 },
    produits: [
      { formula: 'C', coeff: 1 },
      { formula: 'D', coeff: 1 },
    ],
  },
  {
    label: 'A + 2 B → C + D',
    titrant: { formula: 'A', coeff: 1 },
    titre:   { formula: 'B', coeff: 2 },
    produits: [
      { formula: 'C', coeff: 1 },
      { formula: 'D', coeff: 1 },
    ],
  },

  // ── Réactions réalistes ──────────────────────────────────────────────

  {
    // I₂ + 2 S₂O₃²⁻ → 2 I⁻ + S₄O₆²⁻
    label: 'Diiode / thiosulfate',
    titrant: { formula: 'S₂O₃²⁻', coeff: 2 },
    titre:   { formula: 'I₂',     coeff: 1 },
    produits: [
      { formula: 'I⁻',     coeff: 2 },
      { formula: 'S₄O₆²⁻', coeff: 1 },
    ],
    fullEquation: [
      { coeff: 1, text: 'I₂',      type: 'active' },
      { type: 'op' },
      { coeff: 2, text: 'S₂O₃²⁻', type: 'active' },
      { type: 'arrow' },
      { coeff: 2, text: 'I⁻',      type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'S₄O₆²⁻', type: 'active' },
    ],
  },

  {
    // 5 Fe²⁺ + MnO₄⁻ + 8 H⁺ → 5 Fe³⁺ + Mn²⁺ + 4 H₂O
    label: 'Ion fer(II) / permanganate',
    titrant: { formula: 'MnO₄⁻', coeff: 1 },
    titre:   { formula: 'Fe²⁺',  coeff: 5 },
    produits: [
      { formula: 'Fe³⁺', coeff: 5 },
      { formula: 'Mn²⁺', coeff: 1 },
    ],
    fullEquation: [
      { coeff: 5, text: 'Fe²⁺',  type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'MnO₄⁻', type: 'active' },
      { type: 'op' },
      { coeff: 8, text: 'H⁺',    type: 'implicit' },
      { type: 'arrow' },
      { coeff: 5, text: 'Fe³⁺',  type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'Mn²⁺',  type: 'active' },
      { type: 'op' },
      { coeff: 4, text: 'H₂O',   type: 'implicit' },
    ],
  },

  {
    // 5 H₂O₂ + 2 MnO₄⁻ + 6 H⁺ → 5 O₂ + 2 Mn²⁺ + 8 H₂O
    label: 'Eau oxygénée / permanganate',
    titrant: { formula: 'MnO₄⁻', coeff: 2 },
    titre:   { formula: 'H₂O₂',  coeff: 5 },
    produits: [
      { formula: 'O₂',   coeff: 5 },
      { formula: 'Mn²⁺', coeff: 2 },
    ],
    fullEquation: [
      { coeff: 5, text: 'H₂O₂',  type: 'active' },
      { type: 'op' },
      { coeff: 2, text: 'MnO₄⁻', type: 'active' },
      { type: 'op' },
      { coeff: 6, text: 'H⁺',    type: 'implicit' },
      { type: 'arrow' },
      { coeff: 5, text: 'O₂',    type: 'active' },
      { type: 'op' },
      { coeff: 2, text: 'Mn²⁺',  type: 'active' },
      { type: 'op' },
      { coeff: 8, text: 'H₂O',   type: 'implicit' },
    ],
  },

  {
    // 5 C₂H₂O₄ + 2 MnO₄⁻ + 6 H⁺ → 10 CO₂ + 2 Mn²⁺ + 8 H₂O
    label: 'Acide oxalique / permanganate',
    titrant: { formula: 'MnO₄⁻',  coeff: 2 },
    titre:   { formula: 'C₂H₂O₄', coeff: 5 },
    produits: [
      { formula: 'CO₂',  coeff: 10 },
      { formula: 'Mn²⁺', coeff: 2 },
    ],
    fullEquation: [
      { coeff: 5,  text: 'C₂H₂O₄', type: 'active' },
      { type: 'op' },
      { coeff: 2,  text: 'MnO₄⁻',  type: 'active' },
      { type: 'op' },
      { coeff: 6,  text: 'H⁺',      type: 'implicit' },
      { type: 'arrow' },
      { coeff: 10, text: 'CO₂',     type: 'active' },
      { type: 'op' },
      { coeff: 2,  text: 'Mn²⁺',   type: 'active' },
      { type: 'op' },
      { coeff: 8,  text: 'H₂O',    type: 'implicit' },
    ],
  },

  {
    // SO₂ + I₂ + 2 H₂O → SO₄²⁻ + 2 I⁻ + 4 H⁺
    label: 'Dioxyde de soufre / diiode',
    titrant: { formula: 'I₂',   coeff: 1 },
    titre:   { formula: 'SO₂',  coeff: 1 },
    produits: [
      { formula: 'SO₄²⁻', coeff: 1 },
      { formula: 'I⁻',    coeff: 2 },
    ],
    fullEquation: [
      { coeff: 1, text: 'SO₂',    type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'I₂',     type: 'active' },
      { type: 'op' },
      { coeff: 2, text: 'H₂O',    type: 'implicit' },
      { type: 'arrow' },
      { coeff: 1, text: 'SO₄²⁻',  type: 'active' },
      { type: 'op' },
      { coeff: 2, text: 'I⁻',     type: 'active' },
      { type: 'op' },
      { coeff: 4, text: 'H⁺',     type: 'implicit' },
    ],
  },

  {
    // 5 NO₂⁻ + 2 MnO₄⁻ + 6 H⁺ → 5 NO₃⁻ + 2 Mn²⁺ + 3 H₂O
    label: 'Ion nitrite / permanganate',
    titrant: { formula: 'MnO₄⁻', coeff: 2 },
    titre:   { formula: 'NO₂⁻',  coeff: 5 },
    produits: [
      { formula: 'NO₃⁻', coeff: 5 },
      { formula: 'Mn²⁺', coeff: 2 },
    ],
    fullEquation: [
      { coeff: 5, text: 'NO₂⁻',  type: 'active' },
      { type: 'op' },
      { coeff: 2, text: 'MnO₄⁻', type: 'active' },
      { type: 'op' },
      { coeff: 6, text: 'H⁺',    type: 'implicit' },
      { type: 'arrow' },
      { coeff: 5, text: 'NO₃⁻',  type: 'active' },
      { type: 'op' },
      { coeff: 2, text: 'Mn²⁺',  type: 'active' },
      { type: 'op' },
      { coeff: 3, text: 'H₂O',   type: 'implicit' },
    ],
  },

  {
    // MnO₄⁻ + 5 Fe²⁺ + 8 H⁺ → Mn²⁺ + 5 Fe³⁺ + 4 H₂O
    label: 'Ion permanganate / fer(II)',
    titrant: { formula: 'Fe²⁺',  coeff: 5 },
    titre:   { formula: 'MnO₄⁻', coeff: 1 },
    produits: [
      { formula: 'Mn²⁺', coeff: 1 },
      { formula: 'Fe³⁺', coeff: 5 },
    ],
    fullEquation: [
      { coeff: 1, text: 'MnO₄⁻', type: 'active' },
      { type: 'op' },
      { coeff: 5, text: 'Fe²⁺',  type: 'active' },
      { type: 'op' },
      { coeff: 8, text: 'H⁺',    type: 'implicit' },
      { type: 'arrow' },
      { coeff: 1, text: 'Mn²⁺',  type: 'active' },
      { type: 'op' },
      { coeff: 5, text: 'Fe³⁺',  type: 'active' },
      { type: 'op' },
      { coeff: 4, text: 'H₂O',   type: 'implicit' },
    ],
  },

  {
    // C₆H₈O₆ + I₂ → C₆H₆O₆ + 2 I⁻ + 2 H⁺
    label: 'Acide ascorbique / diiode',
    titrant: { formula: 'I₂',      coeff: 1 },
    titre:   { formula: 'C₆H₈O₆', coeff: 1 },
    produits: [
      { formula: 'C₆H₆O₆', coeff: 1 },
      { formula: 'I⁻',      coeff: 2 },
    ],
    fullEquation: [
      { coeff: 1, text: 'C₆H₈O₆', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'I₂',      type: 'active' },
      { type: 'arrow' },
      { coeff: 1, text: 'C₆H₆O₆', type: 'active' },
      { type: 'op' },
      { coeff: 2, text: 'I⁻',      type: 'active' },
      { type: 'op' },
      { coeff: 2, text: 'H⁺',      type: 'implicit' },
    ],
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   RÉACTIONS DU MODE TITRAGE
   Tableau indépendant de TITRAGE_REACTIONS (mode Principe).
   Chaque entrée référence l'index dans TITRAGE_REACTIONS pour réutiliser
   les données physico-chimiques, et ajoute un libellé pour le sélecteur.
══════════════════════════════════════════════════════════════════════════ */
const TITRAGE_MODE_REACTIONS = [
  {
    label:   'Diiode (I₂)',
    labelTitrante: 'Thiosulfate de sodium<br>(<b>S₂O₃²⁻</b> ; 2 Na⁺)',
    rxnIdx:  3,   // → 'Diiode / thiosulfate' dans TITRAGE_REACTIONS
    // Toutes les espèces à tracer sur le graphique
    // coeff : relatif à 1 mole de réaction (ξ = 1)
    // coeffTitrant : combien de cette espèce par mole de titrant versée (spectateurs)
    especes: [
      { id: 'I₂',      label: 'I₂',       role: 'titree',    coeff: 1,  coeffTitrant: null },
      { id: 'S₂O₃²⁻', label: 'S₂O₃²⁻',  role: 'titrante',  coeff: 2,  coeffTitrant: null },
      { id: 'I⁻',      label: 'I⁻',       role: 'produit',   coeff: 2,  coeffTitrant: null },
      { id: 'S₄O₆²⁻', label: 'S₄O₆²⁻',  role: 'produit',   coeff: 1,  coeffTitrant: null },
      { id: 'Na⁺',     label: 'Na⁺',      role: 'spectateur',coeff: null, coeffTitrant: 2  },
      // 2 Na⁺ apportés par mole de Na₂S₂O₃ versée (= par mole de S₂O₃²⁻)
    ],
  },
  {
    label:   'Sulfate de fer(II) (SO₄²⁻ ; Fe²⁺)',
    labelTitrante: 'Permanganate de potassium<br>(<b>MnO₄⁻</b> ; K⁺)',
    rxnIdx:  4,   // → 'Ion fer(II) / permanganate' dans TITRAGE_REACTIONS
    // Réaction : 5 Fe²⁺ + MnO₄⁻ + 8 H⁺ → 5 Fe³⁺ + Mn²⁺ + 4 H₂O
    especes: [
      { id: 'Fe²⁺',   label: 'Fe²⁺',   role: 'titree',    coeff: 5,  coeffTitrant: null },
      { id: 'MnO₄⁻',  label: 'MnO₄⁻',  role: 'titrante',  coeff: 1,  coeffTitrant: null },
      { id: 'Fe³⁺',   label: 'Fe³⁺',   role: 'produit',   coeff: 5,  coeffTitrant: null },
      { id: 'Mn²⁺',   label: 'Mn²⁺',   role: 'produit',   coeff: 1,  coeffTitrant: null },
      { id: 'SO₄²⁻',  label: 'SO₄²⁻',  role: 'spectateur',coeff: null, coeffTitrant: null, coeffTitree: 1 },
      // 1 SO₄²⁻ apporté par Fe²⁺ du FeSO₄ (1 par mole de Fe²⁺ titré initial)
      { id: 'K⁺',     label: 'K⁺',     role: 'spectateur',coeff: null, coeffTitrant: 1  },
      // 1 K⁺ apporté par mole de KMnO₄ versée (= par mole de MnO₄⁻)
    ],
  },
  {
    // 5 H₂O₂ + 2 MnO₄⁻ + 6 H⁺ → 5 O₂ + 2 Mn²⁺ + 8 H₂O
    label:   'Eau oxygénée (H₂O₂)',
    labelTitrante: 'Permanganate de potassium<br>(<b>MnO₄⁻</b> ; K⁺)',
    rxnIdx:  5,
    especes: [
      { id: 'H₂O₂',  label: 'H₂O₂',  role: 'titree',    coeff: 5,  coeffTitrant: null },
      { id: 'MnO₄⁻', label: 'MnO₄⁻', role: 'titrante',  coeff: 2,  coeffTitrant: null },
      { id: 'O₂',    label: 'O₂',    role: 'produit',   coeff: 5,  coeffTitrant: null },
      { id: 'Mn²⁺',  label: 'Mn²⁺',  role: 'produit',   coeff: 2,  coeffTitrant: null },
      { id: 'K⁺',    label: 'K⁺',    role: 'spectateur',coeff: null, coeffTitrant: 1  },
      // 1 K⁺ par mole de KMnO₄ versée (= par mole de MnO₄⁻ / 2 non, K⁺ suit MnO₄⁻ : 1 K⁺ / 1 KMnO₄)
    ],
  },
  {
    // 5 C₂H₂O₄ + 2 MnO₄⁻ + 6 H⁺ → 10 CO₂ + 2 Mn²⁺ + 8 H₂O
    label:   'Acide oxalique (C₂H₂O₄)',
    labelTitrante: 'Permanganate de potassium<br>(<b>MnO₄⁻</b> ; K⁺)',
    rxnIdx:  6,
    especes: [
      { id: 'C₂H₂O₄', label: 'C₂H₂O₄', role: 'titree',    coeff: 5,  coeffTitrant: null },
      { id: 'MnO₄⁻',  label: 'MnO₄⁻',  role: 'titrante',  coeff: 2,  coeffTitrant: null },
      { id: 'CO₂',    label: 'CO₂',    role: 'produit',   coeff: 10, coeffTitrant: null },
      { id: 'Mn²⁺',   label: 'Mn²⁺',   role: 'produit',   coeff: 2,  coeffTitrant: null },
      { id: 'K⁺',     label: 'K⁺',     role: 'spectateur',coeff: null, coeffTitrant: 1  },
    ],
  },
  {
    // SO₂ + I₂ + 2 H₂O → SO₄²⁻ + 2 I⁻ + 4 H⁺
    label:   'Dioxyde de soufre (SO₂)',
    labelTitrante: 'Diiode<br>(<b>I₂</b>)',
    rxnIdx:  7,
    especes: [
      { id: 'SO₂',   label: 'SO₂',   role: 'titree',   coeff: 1, coeffTitrant: null },
      { id: 'I₂',    label: 'I₂',    role: 'titrante', coeff: 1, coeffTitrant: null },
      { id: 'SO₄²⁻', label: 'SO₄²⁻', role: 'produit',  coeff: 1, coeffTitrant: null },
      { id: 'I⁻',    label: 'I⁻',    role: 'produit',  coeff: 2, coeffTitrant: null },
    ],
  },
  {
    // 5 NO₂⁻ + 2 MnO₄⁻ + 6 H⁺ → 5 NO₃⁻ + 2 Mn²⁺ + 3 H₂O
    label:   'Nitrite de sodium (NO₂⁻ ; Na⁺)',
    labelTitrante: 'Permanganate de potassium<br>(<b>MnO₄⁻</b> ; K⁺)',
    rxnIdx:  8,
    especes: [
      { id: 'NO₂⁻',  label: 'NO₂⁻',  role: 'titree',    coeff: 5,  coeffTitrant: null },
      { id: 'MnO₄⁻', label: 'MnO₄⁻', role: 'titrante',  coeff: 2,  coeffTitrant: null },
      { id: 'NO₃⁻',  label: 'NO₃⁻',  role: 'produit',   coeff: 5,  coeffTitrant: null },
      { id: 'Mn²⁺',  label: 'Mn²⁺',  role: 'produit',   coeff: 2,  coeffTitrant: null },
      { id: 'Na⁺',   label: 'Na⁺',   role: 'spectateur',coeff: null, coeffTitrant: null, coeffTitree: 1 },
      // 1 Na⁺ par mole de NO₂⁻ initial (sel NaNO₂)
      { id: 'K⁺',    label: 'K⁺',    role: 'spectateur',coeff: null, coeffTitrant: 1  },
    ],
  },
  {
    // MnO₄⁻ + 5 Fe²⁺ + 8 H⁺ → Mn²⁺ + 5 Fe³⁺ + 4 H₂O  (MnO₄⁻ est le titré ici)
    label:   'Ion permanganate / fer(II)',
    labelTitrante: 'Sulfate de fer(II)<br>(<b>Fe²⁺</b> ; SO₄²⁻)',
    rxnIdx:  9,
    especes: [
      { id: 'MnO₄⁻', label: 'MnO₄⁻', role: 'titree',    coeff: 1,  coeffTitrant: null },
      { id: 'Fe²⁺',  label: 'Fe²⁺',  role: 'titrante',  coeff: 5,  coeffTitrant: null },
      { id: 'Mn²⁺',  label: 'Mn²⁺',  role: 'produit',   coeff: 1,  coeffTitrant: null },
      { id: 'Fe³⁺',  label: 'Fe³⁺',  role: 'produit',   coeff: 5,  coeffTitrant: null },
      { id: 'K⁺',    label: 'K⁺',    role: 'spectateur',coeff: null, coeffTitrant: null, coeffTitree: 1 },
      // 1 K⁺ par mole de KMnO₄ initial
      { id: 'SO₄²⁻', label: 'SO₄²⁻', role: 'spectateur',coeff: null, coeffTitrant: 1  },
      // 1 SO₄²⁻ par mole de FeSO₄ versée (= par mole de Fe²⁺)
    ],
  },
  {
    // C₆H₈O₆ + I₂ → C₆H₆O₆ + 2 I⁻ + 2 H⁺
    label:   'Acide ascorbique (C₆H₈O₆)',
    labelTitrante: 'Diiode<br>(<b>I₂</b>)',
    rxnIdx:  10,
    especes: [
      { id: 'C₆H₈O₆', label: 'C₆H₈O₆', role: 'titree',   coeff: 1, coeffTitrant: null },
      { id: 'I₂',      label: 'I₂',      role: 'titrante', coeff: 1, coeffTitrant: null },
      { id: 'C₆H₆O₆', label: 'C₆H₆O₆', role: 'produit',  coeff: 1, coeffTitrant: null },
      { id: 'I⁻',      label: 'I⁻',      role: 'produit',  coeff: 2, coeffTitrant: null },
    ],
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   COULEURS DES MOLÉCULES (cercles)
   Une couleur de fond + une couleur de bordure par formule
══════════════════════════════════════════════════════════════════════════ */
const MOL_COLORS = {
  // Génériques
  'A': '#4a90d9',
  'B': '#e07040',
  'C': '#2a8a50',
  'D': '#9a50c0',
  // Réactions réalistes
  //   I₂ : orange-brun caractéristique
  'I₂':      '#c87820',
  //   S₂O₃²⁻ : vert-teal
  'S₂O₃²⁻': '#3aaa8a',
  //   I⁻ : violet-gris (distinct de S₄O₆²⁻ vert et de I₂ orange)
  'I⁻':      '#8860c0',
  //   S₄O₆²⁻ : vert olive (distinct de S₂O₃²⁻ teal)
  'S₄O₆²⁻': '#5a9a20',
  //   MnO₄⁻ : violet intense caractéristique
  'MnO₄⁻':  '#8030c0',
  //   Fe²⁺ : vert-jaune
  'Fe²⁺':   '#70a030',
  //   Fe³⁺ : orange-rouille
  'Fe³⁺':   '#d06010',
  //   Mn²⁺ : rose pâle
  'Mn²⁺':   '#e0b0d0',
  //   H₂O₂ : bleu-cyan (distinct de O₂)
  'H₂O₂':   '#2090d0',
  //   O₂ : vert pâle (gaz, distinct du bleu H₂O₂)
  'O₂':     '#50c888',
  //   C₂H₂O₄ : jaune-citron
  'C₂H₂O₄': '#c8c830',
  //   CO₂ : gris-bleu ardoise
  'CO₂':    '#7888a0',
  //   SO₂ : rose-magenta (changé pour le distinguer de I₂ orange-brun dans le titrage SO₂/diiode)
  'SO₂':    '#c03080',
  //   SO₄²⁻ : jaune moutarde (changé pour le distinguer de Na⁺ bleu-indigo)
  'SO₄²⁻':  '#b8a010',
  //   NO₂⁻ : orange-rouille (changé pour le distinguer de Na⁺ bleu-indigo dans le titrage Nitrite/permanganate)
  'NO₂⁻':   '#c05020',
  //   NO₃⁻ : jaune citron (changé pour le distinguer de K⁺ teal)
  'NO₃⁻':   '#c8c020',
  //   Na⁺ : bleu-indigo
  'Na⁺':    '#4060c8',
  //   K⁺ : teal-vert
  'K⁺':     '#20a090',
  //   H⁺ : rouge vif
  'H⁺':     '#e04040',
  //   C₆H₈O₆ acide ascorbique : vert-émeraude (distinct de I₂ orange et C₆H₆O₆)
  'C₆H₈O₆': '#28a860',
  //   C₆H₆O₆ acide déhydroascorbique : gris-ardoise (changé pour le distinguer de I⁻ violet dans le titrage Acide ascorbique/diiode)
  'C₆H₆O₆': '#6080a8',
};
const MOL_BORDER_COLORS = {
  // Génériques
  'A': '#1a5a9a',
  'B': '#a04010',
  'C': '#1a5a30',
  'D': '#6a2090',
  // Réactions réalistes
  'I₂':      '#8a5010',
  'S₂O₃²⁻': '#1a7a5a',
  'I⁻':      '#5538a0',
  'S₄O₆²⁻': '#3a7010',
  'MnO₄⁻':  '#501090',
  'Fe²⁺':   '#406010',
  'Fe³⁺':   '#904010',
  'Mn²⁺':   '#a07090',
  'H₂O₂':   '#0060a0',
  'O₂':     '#208858',
  'C₂H₂O₄': '#888810',
  'CO₂':    '#485870',
  'SO₂':    '#8a1050',
  'SO₄²⁻':  '#786a00',
  'NO₂⁻':   '#8a3010',
  'NO₃⁻':   '#807800',
  'Na⁺':    '#1a3a90',
  'K⁺':     '#107060',
  'H⁺':     '#a01010',
  'C₆H₈O₆': '#107840',
  'C₆H₆O₆': '#305070',
};
const MOL_TEXT_COLORS = {
  // Génériques
  'A': '#ffffff',
  'B': '#ffffff',
  'C': '#ffffff',
  'D': '#ffffff',
  // Réactions réalistes
  'I₂':      '#ffffff',
  'S₂O₃²⁻': '#ffffff',
  'I⁻':      '#ffffff',  // violet-gris foncé → blanc
  'S₄O₆²⁻': '#ffffff',
  'MnO₄⁻':  '#ffffff',
  'Fe²⁺':   '#ffffff',
  'Fe³⁺':   '#ffffff',
  'Mn²⁺':   '#333333',  // rose pâle → texte sombre
  'H₂O₂':   '#ffffff',
  'O₂':     '#ffffff',  // vert pâle assez saturé → blanc
  'C₂H₂O₄': '#333333',  // jaune clair → texte sombre
  'CO₂':    '#ffffff',
  'SO₂':    '#ffffff',  // rose-magenta foncé → texte blanc
  'SO₄²⁻':  '#333333',  // jaune moutarde foncé → texte sombre
  'NO₂⁻':   '#ffffff',
  'NO₃⁻':   '#333333',  // jaune citron → texte sombre
  'Na⁺':    '#ffffff',
  'K⁺':     '#ffffff',
  'H⁺':     '#ffffff',
  'C₆H₈O₆': '#ffffff',
  'C₆H₆O₆': '#ffffff',
};

/* ══════════════════════════════════════════════════════════════════════════
   COULEURS DE FOND DES COLONNES
══════════════════════════════════════════════════════════════════════════ */
const COL_BG_TITRANT = '#e8f0fb';   /* bleu clair  — réactif titrant */
const COL_BG_TITRE   = '#fef0e4';   /* orange clair — réactif titré  */
const COL_BG_PRODUIT = '#e8f5ee';   /* vert clair  — produits C + D  */
const COL_BG_EXCES   = '#f2e8f8';   /* violet clair — excès titrant  */

/* Rayons de référence des molécules (cercles) */
const MOL_RADIUS = 18;  /* rayon de base en px à scale 1 */

/* ══════════════════════════════════════════════════════════════════════════
   RÉACTIONS DU MODE TITRAGE pH-MÉTRIQUE
   Indépendant de TITRAGE_MODE_REACTIONS (mode colorimétrique).
   Chaque entrée décrit la solution titrée et la solution titrante avec leurs
   propriétés acide-base (type, pKa, force…) afin de permettre le calcul
   rigoureux du pH par résolution de l'électroneutralité.

   Structure d'une entrée :
   {
     label, labelTitrante,                  // textes affichés dans le panel
     titre :   { type, formula, pKa? },     // espèce titrée (acide)
     titrant : { type, formula },           // espèce titrante (base)
     equationHTML,                          // équation du titrage rendue en HTML
     especes : [...]                        // pour graphe n=f(V)
   }

   type peut valoir : 'acide_fort', 'acide_faible', 'base_forte', 'base_faible'
   pKa : uniquement pour les acides/bases faibles (couple AH/A⁻).
   Pour le calcul du pH on n'a besoin que de pKa de l'acide titré et du fait
   que NaOH est une base forte (titrant totalement dissocié).
══════════════════════════════════════════════════════════════════════════ */
const TITRAGE_PH_REACTIONS = [
  {
    // HCl (acide fort) titré par NaOH (base forte)
    // HCl + NaOH → Na⁺ + Cl⁻ + H₂O   (réaction nette : H₃O⁺ + HO⁻ → 2 H₂O)
    label:         'Acide chlorhydrique (H₃O⁺ ; Cl⁻)',
    labelTitrante: 'Hydroxyde de sodium<br>(Na⁺ ; <b>HO⁻</b>)',
    titre:   { type: 'acide_fort',   formula: 'H₃O⁺' },
    titrant: { type: 'base_forte',   formula: 'HO⁻'  },
    // Équation rendue dans la zone équation de titrage
    fullEquation: [
      { coeff: 1, text: 'H₃O⁺', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'HO⁻',  type: 'active' },
      { type: 'arrow' },
      { coeff: 2, text: 'H₂O',  type: 'implicit' },
    ],
    // Espèces pour le graphe n=f(V) (utile si l'utilisateur active n=f(V))
    // Ici on suit les espèces majoritaires en solution.
    especes: [
      { id: 'H₃O⁺', label: 'H₃O⁺', role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'HO⁻',  label: 'HO⁻',  role: 'titrante',   coeff: 1, coeffTitrant: null },
      { id: 'Cl⁻',  label: 'Cl⁻',  role: 'spectateur', coeff: null, coeffTitrant: null, coeffTitree: 1 },
      { id: 'Na⁺',  label: 'Na⁺',  role: 'spectateur', coeff: null, coeffTitrant: 1 },
    ],
  },
  {
    // CH₃COOH (acide faible) titré par NaOH (base forte)
    // CH₃COOH + HO⁻ → CH₃COO⁻ + H₂O
    label:         'Acide éthanoïque (CH₃COOH)',
    labelTitrante: 'Hydroxyde de sodium<br>(Na⁺ ; <b>HO⁻</b>)',
    titre:   { type: 'acide_faible', formula: 'CH₃COOH', pKa: 4.76 },
    titrant: { type: 'base_forte',   formula: 'HO⁻'  },
    fullEquation: [
      { coeff: 1, text: 'CH₃COOH',  type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'HO⁻',      type: 'active' },
      { type: 'arrow' },
      { coeff: 1, text: 'CH₃COO⁻', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₂O',      type: 'implicit' },
    ],
    especes: [
      { id: 'CH₃COOH',  label: 'CH₃COOH',  role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'HO⁻',      label: 'HO⁻',      role: 'titrante',   coeff: 1, coeffTitrant: null },
      { id: 'CH₃COO⁻', label: 'CH₃COO⁻', role: 'produit',    coeff: 1, coeffTitrant: null },
      { id: 'Na⁺',      label: 'Na⁺',      role: 'spectateur', coeff: null, coeffTitrant: 1 },
    ],
  },

  // ── Acides faibles supplémentaires titrés par NaOH ───────────────────

  {
    // HF (acide faible, pKa = 3,17) titré par NaOH
    // HF + HO⁻ → F⁻ + H₂O
    label:         'Acide fluorhydrique (HF)',
    labelTitrante: 'Hydroxyde de sodium<br>(Na⁺ ; <b>HO⁻</b>)',
    titre:   { type: 'acide_faible', formula: 'HF', pKa: 3.17 },
    titrant: { type: 'base_forte',   formula: 'HO⁻' },
    fullEquation: [
      { coeff: 1, text: 'HF',   type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'HO⁻', type: 'active' },
      { type: 'arrow' },
      { coeff: 1, text: 'F⁻',  type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₂O', type: 'implicit' },
    ],
    especes: [
      { id: 'HF',  label: 'HF',  role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'HO⁻', label: 'HO⁻', role: 'titrante',   coeff: 1, coeffTitrant: null },
      { id: 'F⁻',  label: 'F⁻',  role: 'produit',    coeff: 1, coeffTitrant: null },
      { id: 'Na⁺', label: 'Na⁺', role: 'spectateur', coeff: null, coeffTitrant: 1 },
    ],
  },

  {
    // HCOOH (acide méthanoïque, pKa = 3,75) titré par NaOH
    // HCOOH + HO⁻ → HCOO⁻ + H₂O
    label:         'Acide méthanoïque (HCOOH)',
    labelTitrante: 'Hydroxyde de sodium<br>(Na⁺ ; <b>HO⁻</b>)',
    titre:   { type: 'acide_faible', formula: 'HCOOH', pKa: 3.75 },
    titrant: { type: 'base_forte',   formula: 'HO⁻' },
    fullEquation: [
      { coeff: 1, text: 'HCOOH', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'HO⁻',  type: 'active' },
      { type: 'arrow' },
      { coeff: 1, text: 'HCOO⁻', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₂O',  type: 'implicit' },
    ],
    especes: [
      { id: 'HCOOH',  label: 'HCOOH',  role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'HO⁻',   label: 'HO⁻',   role: 'titrante',   coeff: 1, coeffTitrant: null },
      { id: 'HCOO⁻', label: 'HCOO⁻', role: 'produit',    coeff: 1, coeffTitrant: null },
      { id: 'Na⁺',   label: 'Na⁺',   role: 'spectateur', coeff: null, coeffTitrant: 1 },
    ],
  },

  {
    // Acide lactique (C₂H₄OHCOOH, pKa = 3,86) titré par NaOH
    // C₂H₄OHCOOH + HO⁻ → C₂H₄OHCOO⁻ + H₂O
    label:         'Acide lactique (C₂H₄OHCOOH)',
    labelTitrante: 'Hydroxyde de sodium<br>(Na⁺ ; <b>HO⁻</b>)',
    titre:   { type: 'acide_faible', formula: 'C₂H₄OHCOOH', pKa: 3.86 },
    titrant: { type: 'base_forte',   formula: 'HO⁻' },
    fullEquation: [
      { coeff: 1, text: 'C₂H₄OHCOOH',  type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'HO⁻',          type: 'active' },
      { type: 'arrow' },
      { coeff: 1, text: 'C₂H₄OHCOO⁻', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₂O',          type: 'implicit' },
    ],
    especes: [
      { id: 'C₂H₄OHCOOH',  label: 'C₂H₄OHCOOH',  role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'HO⁻',          label: 'HO⁻',          role: 'titrante',   coeff: 1, coeffTitrant: null },
      { id: 'C₂H₄OHCOO⁻', label: 'C₂H₄OHCOO⁻', role: 'produit',    coeff: 1, coeffTitrant: null },
      { id: 'Na⁺',          label: 'Na⁺',          role: 'spectateur', coeff: null, coeffTitrant: 1 },
    ],
  },

  {
    // Phénol (C₆H₅OH, pKa = 9,95) titré par NaOH
    // C₆H₅OH + HO⁻ → C₆H₅O⁻ + H₂O
    label:         'Phénol (C₆H₅OH)',
    labelTitrante: 'Hydroxyde de sodium<br>(Na⁺ ; <b>HO⁻</b>)',
    titre:   { type: 'acide_faible', formula: 'C₆H₅OH', pKa: 9.95 },
    titrant: { type: 'base_forte',   formula: 'HO⁻' },
    fullEquation: [
      { coeff: 1, text: 'C₆H₅OH', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'HO⁻',    type: 'active' },
      { type: 'arrow' },
      { coeff: 1, text: 'C₆H₅O⁻', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₂O',    type: 'implicit' },
    ],
    especes: [
      { id: 'C₆H₅OH',  label: 'C₆H₅OH',  role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'HO⁻',     label: 'HO⁻',     role: 'titrante',   coeff: 1, coeffTitrant: null },
      { id: 'C₆H₅O⁻', label: 'C₆H₅O⁻', role: 'produit',    coeff: 1, coeffTitrant: null },
      { id: 'Na⁺',     label: 'Na⁺',     role: 'spectateur', coeff: null, coeffTitrant: 1 },
    ],
  },

  // ── Bases titrées par HCl ────────────────────────────────────────────

  {
    // NaOH (base forte) titré par HCl (acide fort)
    // HO⁻ + H₃O⁺ → 2 H₂O   (réaction nette)
    label:         'Hydroxyde de sodium (Na⁺ ; HO⁻)',
    labelTitrante: 'Acide chlorhydrique<br>(H₃O⁺ ; <b>Cl⁻</b>)',
    titre:   { type: 'base_forte',   formula: 'HO⁻'  },
    titrant: { type: 'acide_fort',   formula: 'H₃O⁺' },
    fullEquation: [
      { coeff: 1, text: 'HO⁻',  type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₃O⁺', type: 'active' },
      { type: 'arrow' },
      { coeff: 2, text: 'H₂O',  type: 'implicit' },
    ],
    especes: [
      { id: 'HO⁻',  label: 'HO⁻',  role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'H₃O⁺', label: 'H₃O⁺', role: 'titrante',   coeff: 1, coeffTitrant: null },
      { id: 'Na⁺',  label: 'Na⁺',  role: 'spectateur', coeff: null, coeffTitrant: null, coeffTitree: 1 },
      { id: 'Cl⁻',  label: 'Cl⁻',  role: 'spectateur', coeff: null, coeffTitrant: 1 },
    ],
  },

  {
    // Ammoniaque (NH₃, base faible, pKa(NH₄⁺) = 9,25) titrée par HCl
    // NH₃ + H₃O⁺ → NH₄⁺ + H₂O
    label:         'Ammoniaque (NH₃)',
    labelTitrante: 'Acide chlorhydrique<br>(H₃O⁺ ; <b>Cl⁻</b>)',
    titre:   { type: 'base_faible', formula: 'NH₃', pKa: 9.25 },
    titrant: { type: 'acide_fort',  formula: 'H₃O⁺' },
    fullEquation: [
      { coeff: 1, text: 'NH₃',  type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₃O⁺', type: 'active' },
      { type: 'arrow' },
      { coeff: 1, text: 'NH₄⁺', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₂O',  type: 'implicit' },
    ],
    especes: [
      { id: 'NH₃',  label: 'NH₃',  role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'H₃O⁺', label: 'H₃O⁺', role: 'titrante',   coeff: 1, coeffTitrant: null },
      { id: 'NH₄⁺', label: 'NH₄⁺', role: 'produit',    coeff: 1, coeffTitrant: null },
      { id: 'Cl⁻',  label: 'Cl⁻',  role: 'spectateur', coeff: null, coeffTitrant: 1 },
    ],
  },

  {
    // Éthanoate de sodium (CH₃COO⁻, base faible, pKa(CH₃COOH) = 4,76) titré par HCl
    // CH₃COO⁻ + H₃O⁺ → CH₃COOH + H₂O
    label:         'Éthanoate de sodium (CH₃COO⁻ ; Na⁺)',
    labelTitrante: 'Acide chlorhydrique<br>(H₃O⁺ ; <b>Cl⁻</b>)',
    titre:   { type: 'base_faible', formula: 'CH₃COO⁻', pKa: 4.76 },
    titrant: { type: 'acide_fort',  formula: 'H₃O⁺' },
    fullEquation: [
      { coeff: 1, text: 'CH₃COO⁻', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₃O⁺',    type: 'active' },
      { type: 'arrow' },
      { coeff: 1, text: 'CH₃COOH', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₂O',     type: 'implicit' },
    ],
    especes: [
      { id: 'CH₃COO⁻', label: 'CH₃COO⁻', role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'H₃O⁺',    label: 'H₃O⁺',    role: 'titrante',   coeff: 1, coeffTitrant: null },
      { id: 'CH₃COOH', label: 'CH₃COOH', role: 'produit',    coeff: 1, coeffTitrant: null },
      { id: 'Na⁺',     label: 'Na⁺',     role: 'spectateur', coeff: null, coeffTitrant: null, coeffTitree: 1 },
      { id: 'Cl⁻',     label: 'Cl⁻',     role: 'spectateur', coeff: null, coeffTitrant: 1 },
    ],
  },

  {
    // Méthylamine (CH₃NH₂, base faible, pKa(CH₃NH₃⁺) = 10,64) titrée par HCl
    // CH₃NH₂ + H₃O⁺ → CH₃NH₃⁺ + H₂O
    label:         'Méthylamine (CH₃NH₂)',
    labelTitrante: 'Acide chlorhydrique<br>(H₃O⁺ ; <b>Cl⁻</b>)',
    titre:   { type: 'base_faible', formula: 'CH₃NH₂', pKa: 10.64 },
    titrant: { type: 'acide_fort',  formula: 'H₃O⁺' },
    fullEquation: [
      { coeff: 1, text: 'CH₃NH₂',  type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₃O⁺',   type: 'active' },
      { type: 'arrow' },
      { coeff: 1, text: 'CH₃NH₃⁺', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₂O',    type: 'implicit' },
    ],
    especes: [
      { id: 'CH₃NH₂',  label: 'CH₃NH₂',  role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'H₃O⁺',   label: 'H₃O⁺',   role: 'titrante',   coeff: 1, coeffTitrant: null },
      { id: 'CH₃NH₃⁺', label: 'CH₃NH₃⁺', role: 'produit',    coeff: 1, coeffTitrant: null },
      { id: 'Cl⁻',    label: 'Cl⁻',    role: 'spectateur', coeff: null, coeffTitrant: 1 },
    ],
  },
];

/* Couleurs additionnelles pour les espèces du mode pH (utilisées par le graphe n=f(V)).
   Toutes ces espèces sont incolores en solution : couleurs purement graphiques.

   Règles de palette :
   - H₃O⁺ : rouge  #e04040  (fixe)
   - HO⁻  : vert   #3aa83a  (fixe)
   - Acides (AH) et acides conjugués (BH⁺) : orange  #d07010
   - Bases (A⁻/B) et bases conjuguées      : turquoise #18a0a0
   Ces deux teintes sont bien distinctes de H₃O⁺ (rouge), HO⁻ (vert),
   Na⁺ (bleu-indigo #4060c8) et Cl⁻ (violet #9060c8). */

MOL_COLORS['H₃O⁺']    = '#e04040';   // rouge — fixe
MOL_COLORS['HO⁻']     = '#1a7a1a';   // vert foncé — fixe
MOL_COLORS['Cl⁻']     = '#9060c8';   // violet (spectateur)

// ── Acides faibles (AH) → orange unifié ──────────────────────────────────
MOL_COLORS['CH₃COOH']      = '#d07010';
MOL_COLORS['HF']            = '#d07010';
MOL_COLORS['HCOOH']         = '#d07010';
MOL_COLORS['C₂H₄OHCOOH']  = '#d07010';
MOL_COLORS['C₆H₅OH']       = '#d07010';

// ── Bases faibles et ions conjugués (A⁻ / B) → vert pâle unifié ─────────
MOL_COLORS['CH₃COO⁻']      = '#7aba7a';
MOL_COLORS['F⁻']            = '#7aba7a';
MOL_COLORS['HCOO⁻']         = '#7aba7a';
MOL_COLORS['C₂H₄OHCOO⁻']  = '#7aba7a';
MOL_COLORS['C₆H₅O⁻']       = '#7aba7a';
MOL_COLORS['NH₃']           = '#7aba7a';
MOL_COLORS['CH₃NH₂']        = '#7aba7a';

// ── Acides conjugués (BH⁺) → orange unifié (même famille que AH) ─────────
MOL_COLORS['NH₄⁺']          = '#d07010';
MOL_COLORS['CH₃NH₃⁺']       = '#d07010';
// Ions précipitation
MOL_COLORS['Mg²⁺']         = '#30c0a0';
MOL_COLORS['Ag⁺']          = '#c8c820';
MOL_COLORS['Ba²⁺']         = '#a06020';
MOL_COLORS['NO₃⁻']         = '#48a878';  // déjà dans TITRAGE_REACTIONS mais au cas où
MOL_COLORS['Mg(OH)₂']      = '#222222';
MOL_COLORS['AgCl']         = '#222222';
MOL_COLORS['BaSO₄']        = '#222222';

MOL_BORDER_COLORS['Mg(OH)₂']      = '#000000';
MOL_BORDER_COLORS['AgCl']         = '#000000';
MOL_BORDER_COLORS['BaSO₄']        = '#000000';

MOL_TEXT_COLORS['Mg(OH)₂']      = '#ffffff';
MOL_TEXT_COLORS['AgCl']         = '#ffffff';
MOL_TEXT_COLORS['BaSO₄']        = '#ffffff';

/* ══════════════════════════════════════════════════════════════════════════
   RÉACTIONS DU MODE TITRAGE CONDUCTIMÉTRIQUE
   Indépendant de TITRAGE_PH_REACTIONS et TITRAGE_MODE_REACTIONS.
   Pour l'instant : uniquement HCl titré par NaOH.
   Chaque entrée décrit toutes les espèces ioniques en solution (réactifs,
   produits, spectateurs) avec leur conductivité molaire ionique λ
   (S·m²·mol⁻¹, valeurs à dilution infinie à 25 °C) pour appliquer la loi
   de Kohlrausch : σ = Σᵢ λᵢ · [Xᵢ].
══════════════════════════════════════════════════════════════════════════ */

/**
 * Conductivités molaires ioniques à dilution infinie, 25 °C (S·m²·mol⁻¹).
 * Sources : tables de référence (Handbook of Chemistry and Physics, Atkins).
 */
const LAMBDA_IONIQUE = {
  'H₃O⁺':       35.0e-3,
  'HO⁻' :       19.9e-3,
  'Na⁺' :        5.01e-3,
  'Cl⁻' :        7.63e-3,
  'K⁺'  :        7.35e-3,
  // Ions acides faibles
  'CH₃COO⁻':    4.09e-3,
  'F⁻'  :        5.54e-3,
  'HCOO⁻':       5.46e-3,
  'C₂H₄OHCOO⁻': 3.89e-3,
  'C₆H₅O⁻':     3.00e-3,   // estimé
  // Ions bases faibles
  'NH₄⁺':        7.35e-3,
  'CH₃NH₃⁺':     5.80e-3,   // estimé
  // Ions précipitation
  'Mg²⁺':        5.30e-3,
  'Ag⁺' :        6.19e-3,
  'Ba²⁺':        6.36e-3,
  'NO₃⁻':        7.14e-3,
  'SO₄²⁻':       8.00e-3,
};

const TITRAGE_COND_REACTIONS = [
  {
    // HCl (acide fort) titré par NaOH (base forte)
    // H₃O⁺ + HO⁻ → 2 H₂O   (réaction nette)
    label:         'Acide chlorhydrique (H₃O⁺ ; Cl⁻)',
    labelTitrante: 'Hydroxyde de sodium<br>(Na⁺ ; <b>HO⁻</b>)',
    titre:   { type: 'acide_fort',   formula: 'H₃O⁺' },
    titrant: { type: 'base_forte',   formula: 'HO⁻'  },
    fullEquation: [
      { coeff: 1, text: 'H₃O⁺', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'HO⁻',  type: 'active' },
      { type: 'arrow' },
      { coeff: 2, text: 'H₂O',  type: 'implicit' },
    ],
    especes: [
      { id: 'H₃O⁺', label: 'H₃O⁺', role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'HO⁻',  label: 'HO⁻',  role: 'titrante',   coeff: 1, coeffTitrant: null },
      { id: 'Cl⁻',  label: 'Cl⁻',  role: 'spectateur', coeff: null, coeffTitrant: null, coeffTitree: 1 },
      { id: 'Na⁺',  label: 'Na⁺',  role: 'spectateur', coeff: null, coeffTitrant: 1 },
    ],
  },

  {
    // CH₃COOH (acide faible) titré par NaOH
    label:         'Acide éthanoïque (CH₃COOH)',
    labelTitrante: 'Hydroxyde de sodium<br>(Na⁺ ; <b>HO⁻</b>)',
    titre:   { type: 'acide_faible', formula: 'CH₃COOH', pKa: 4.76 },
    titrant: { type: 'base_forte',   formula: 'HO⁻'  },
    fullEquation: [
      { coeff: 1, text: 'CH₃COOH',  type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'HO⁻',      type: 'active' },
      { type: 'arrow' },
      { coeff: 1, text: 'CH₃COO⁻', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₂O',      type: 'implicit' },
    ],
    especes: [
      { id: 'CH₃COOH',  label: 'CH₃COOH',  role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'HO⁻',      label: 'HO⁻',      role: 'titrante',   coeff: 1, coeffTitrant: null },
      { id: 'CH₃COO⁻', label: 'CH₃COO⁻', role: 'produit',    coeff: 1, coeffTitrant: null },
      { id: 'Na⁺',      label: 'Na⁺',      role: 'spectateur', coeff: null, coeffTitrant: 1 },
    ],
  },

  {
    // HF (acide faible) titré par NaOH
    label:         'Acide fluorhydrique (HF)',
    labelTitrante: 'Hydroxyde de sodium<br>(Na⁺ ; <b>HO⁻</b>)',
    titre:   { type: 'acide_faible', formula: 'HF', pKa: 3.17 },
    titrant: { type: 'base_forte',   formula: 'HO⁻' },
    fullEquation: [
      { coeff: 1, text: 'HF',   type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'HO⁻', type: 'active' },
      { type: 'arrow' },
      { coeff: 1, text: 'F⁻',  type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₂O', type: 'implicit' },
    ],
    especes: [
      { id: 'HF',  label: 'HF',  role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'HO⁻', label: 'HO⁻', role: 'titrante',   coeff: 1, coeffTitrant: null },
      { id: 'F⁻',  label: 'F⁻',  role: 'produit',    coeff: 1, coeffTitrant: null },
      { id: 'Na⁺', label: 'Na⁺', role: 'spectateur', coeff: null, coeffTitrant: 1 },
    ],
  },

  {
    // HCOOH (acide méthanoïque) titré par NaOH
    label:         'Acide méthanoïque (HCOOH)',
    labelTitrante: 'Hydroxyde de sodium<br>(Na⁺ ; <b>HO⁻</b>)',
    titre:   { type: 'acide_faible', formula: 'HCOOH', pKa: 3.75 },
    titrant: { type: 'base_forte',   formula: 'HO⁻' },
    fullEquation: [
      { coeff: 1, text: 'HCOOH',  type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'HO⁻',   type: 'active' },
      { type: 'arrow' },
      { coeff: 1, text: 'HCOO⁻', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₂O',   type: 'implicit' },
    ],
    especes: [
      { id: 'HCOOH',  label: 'HCOOH',  role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'HO⁻',   label: 'HO⁻',   role: 'titrante',   coeff: 1, coeffTitrant: null },
      { id: 'HCOO⁻', label: 'HCOO⁻', role: 'produit',    coeff: 1, coeffTitrant: null },
      { id: 'Na⁺',   label: 'Na⁺',   role: 'spectateur', coeff: null, coeffTitrant: 1 },
    ],
  },

  {
    // Acide lactique titré par NaOH
    label:         'Acide lactique (C₂H₄OHCOOH)',
    labelTitrante: 'Hydroxyde de sodium<br>(Na⁺ ; <b>HO⁻</b>)',
    titre:   { type: 'acide_faible', formula: 'C₂H₄OHCOOH', pKa: 3.86 },
    titrant: { type: 'base_forte',   formula: 'HO⁻' },
    fullEquation: [
      { coeff: 1, text: 'C₂H₄OHCOOH',  type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'HO⁻',          type: 'active' },
      { type: 'arrow' },
      { coeff: 1, text: 'C₂H₄OHCOO⁻', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₂O',          type: 'implicit' },
    ],
    especes: [
      { id: 'C₂H₄OHCOOH',  label: 'C₂H₄OHCOOH',  role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'HO⁻',          label: 'HO⁻',          role: 'titrante',   coeff: 1, coeffTitrant: null },
      { id: 'C₂H₄OHCOO⁻', label: 'C₂H₄OHCOO⁻', role: 'produit',    coeff: 1, coeffTitrant: null },
      { id: 'Na⁺',          label: 'Na⁺',          role: 'spectateur', coeff: null, coeffTitrant: 1 },
    ],
  },

  {
    // Phénol titré par NaOH
    label:         'Phénol (C₆H₅OH)',
    labelTitrante: 'Hydroxyde de sodium<br>(Na⁺ ; <b>HO⁻</b>)',
    titre:   { type: 'acide_faible', formula: 'C₆H₅OH', pKa: 9.95 },
    titrant: { type: 'base_forte',   formula: 'HO⁻' },
    fullEquation: [
      { coeff: 1, text: 'C₆H₅OH',  type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'HO⁻',     type: 'active' },
      { type: 'arrow' },
      { coeff: 1, text: 'C₆H₅O⁻', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₂O',     type: 'implicit' },
    ],
    especes: [
      { id: 'C₆H₅OH',  label: 'C₆H₅OH',  role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'HO⁻',     label: 'HO⁻',     role: 'titrante',   coeff: 1, coeffTitrant: null },
      { id: 'C₆H₅O⁻', label: 'C₆H₅O⁻', role: 'produit',    coeff: 1, coeffTitrant: null },
      { id: 'Na⁺',     label: 'Na⁺',     role: 'spectateur', coeff: null, coeffTitrant: 1 },
    ],
  },

  {
    // NaOH (base forte) titré par HCl (acide fort)
    label:         'Hydroxyde de sodium (Na⁺ ; HO⁻)',
    labelTitrante: 'Acide chlorhydrique<br>(H₃O⁺ ; <b>Cl⁻</b>)',
    titre:   { type: 'base_forte',   formula: 'HO⁻'  },
    titrant: { type: 'acide_fort',   formula: 'H₃O⁺' },
    fullEquation: [
      { coeff: 1, text: 'HO⁻',  type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₃O⁺', type: 'active' },
      { type: 'arrow' },
      { coeff: 2, text: 'H₂O',  type: 'implicit' },
    ],
    especes: [
      { id: 'HO⁻',  label: 'HO⁻',  role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'H₃O⁺', label: 'H₃O⁺', role: 'titrante',   coeff: 1, coeffTitrant: null },
      { id: 'Na⁺',  label: 'Na⁺',  role: 'spectateur', coeff: null, coeffTitrant: null, coeffTitree: 1 },
      { id: 'Cl⁻',  label: 'Cl⁻',  role: 'spectateur', coeff: null, coeffTitrant: 1 },
    ],
  },

  {
    // NH₃ (base faible) titrée par HCl
    label:         'Ammoniaque (NH₃)',
    labelTitrante: 'Acide chlorhydrique<br>(H₃O⁺ ; <b>Cl⁻</b>)',
    titre:   { type: 'base_faible', formula: 'NH₃', pKa: 9.25 },
    titrant: { type: 'acide_fort',  formula: 'H₃O⁺' },
    fullEquation: [
      { coeff: 1, text: 'NH₃',  type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₃O⁺', type: 'active' },
      { type: 'arrow' },
      { coeff: 1, text: 'NH₄⁺', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₂O',  type: 'implicit' },
    ],
    especes: [
      { id: 'NH₃',  label: 'NH₃',  role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'H₃O⁺', label: 'H₃O⁺', role: 'titrante',   coeff: 1, coeffTitrant: null },
      { id: 'NH₄⁺', label: 'NH₄⁺', role: 'produit',    coeff: 1, coeffTitrant: null },
      { id: 'Cl⁻',  label: 'Cl⁻',  role: 'spectateur', coeff: null, coeffTitrant: 1 },
    ],
  },

  {
    // CH₃COO⁻ (base faible) titrée par HCl
    label:         'Éthanoate de sodium (CH₃COO⁻ ; Na⁺)',
    labelTitrante: 'Acide chlorhydrique<br>(H₃O⁺ ; <b>Cl⁻</b>)',
    titre:   { type: 'base_faible', formula: 'CH₃COO⁻', pKa: 4.76 },
    titrant: { type: 'acide_fort',  formula: 'H₃O⁺' },
    fullEquation: [
      { coeff: 1, text: 'CH₃COO⁻', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₃O⁺',    type: 'active' },
      { type: 'arrow' },
      { coeff: 1, text: 'CH₃COOH', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₂O',     type: 'implicit' },
    ],
    especes: [
      { id: 'CH₃COO⁻', label: 'CH₃COO⁻', role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'H₃O⁺',    label: 'H₃O⁺',    role: 'titrante',   coeff: 1, coeffTitrant: null },
      { id: 'CH₃COOH', label: 'CH₃COOH', role: 'produit',    coeff: 1, coeffTitrant: null },
      { id: 'Na⁺',     label: 'Na⁺',     role: 'spectateur', coeff: null, coeffTitrant: null, coeffTitree: 1 },
      { id: 'Cl⁻',     label: 'Cl⁻',     role: 'spectateur', coeff: null, coeffTitrant: 1 },
    ],
  },

  {
    // CH₃NH₂ (base faible) titrée par HCl
    label:         'Méthylamine (CH₃NH₂)',
    labelTitrante: 'Acide chlorhydrique<br>(H₃O⁺ ; <b>Cl⁻</b>)',
    titre:   { type: 'base_faible', formula: 'CH₃NH₂', pKa: 10.64 },
    titrant: { type: 'acide_fort',  formula: 'H₃O⁺' },
    fullEquation: [
      { coeff: 1, text: 'CH₃NH₂',  type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₃O⁺',   type: 'active' },
      { type: 'arrow' },
      { coeff: 1, text: 'CH₃NH₃⁺', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'H₂O',    type: 'implicit' },
    ],
    especes: [
      { id: 'CH₃NH₂',  label: 'CH₃NH₂',  role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'H₃O⁺',   label: 'H₃O⁺',   role: 'titrante',   coeff: 1, coeffTitrant: null },
      { id: 'CH₃NH₃⁺', label: 'CH₃NH₃⁺', role: 'produit',    coeff: 1, coeffTitrant: null },
      { id: 'Cl⁻',    label: 'Cl⁻',    role: 'spectateur', coeff: null, coeffTitrant: 1 },
    ],
  },

  // ── Réactions de précipitation — conductimétrie uniquement ──────────
  // Ces 3 réactions n'ont pas de pH pertinent à modéliser.
  // La conductivité est calculée uniquement à partir des ions non précipités.
  // Le champ precipitationOnly: true les exclut du mode pH-métrique.

  {
    // MgCl₂ titré par NaOH
    // Mg²⁺ + 2 HO⁻ → Mg(OH)₂↓  (précipité)
    // Spectateurs : 2 Cl⁻ (apportés par MgCl₂), Na⁺ (apporté par NaOH)
    // OH⁻ en excès après Veq contribue à σ
    label:            'Chlorure de magnésium (Mg²⁺ ; 2 Cl⁻)',
    labelTitrante:    'Hydroxyde de sodium<br>(Na⁺ ; <b>HO⁻</b>)',
    precipitationOnly: true,
    titre:   { type: 'precipitation', formula: 'Mg²⁺' },
    titrant: { type: 'precipitation', formula: 'HO⁻'  },
    // Stœchiométrie de la réaction : 1 Mg²⁺ + 2 HO⁻ → Mg(OH)₂↓
    coeffTitree:    1,   // mol de Mg²⁺ par "unité"
    coeffTitrante:  2,   // mol de HO⁻ par mol de Mg²⁺
    fullEquation: [
      { coeff: 1, text: 'Mg²⁺', type: 'active' },
      { type: 'op' },
      { coeff: 2, text: 'HO⁻',  type: 'active' },
      { type: 'arrow' },
      { coeff: 1, text: 'Mg(OH)₂↓', type: 'active' },
    ],
    especes: [
      // Mg²⁺ est consommé (rôle 'titree', coeff stœchio 1)
      { id: 'Mg²⁺', label: 'Mg²⁺', role: 'titree',     coeff: 1, coeffTitrant: null },
      // HO⁻ est consommé (coeff stœchio 2 par Mg²⁺)
      { id: 'HO⁻',  label: 'HO⁻',  role: 'titrante',   coeff: 2, coeffTitrant: null },
      // Précipité formé
      { id: 'Mg(OH)₂', label: 'Mg(OH)₂', role: 'precipite', coeff: 1, coeffTitrant: null },
      // Spectateurs permanents
      { id: 'Cl⁻',  label: 'Cl⁻',  role: 'spectateur', coeff: null, coeffTitrant: null, coeffTitree: 2  },
      // 2 Cl⁻ par MgCl₂ initial (mol de Cl⁻ = 2 × mol de Mg²⁺)
      { id: 'Na⁺',  label: 'Na⁺',  role: 'spectateur', coeff: null, coeffTitrant: 1 },
      // 1 Na⁺ par mol de NaOH versée
    ],
  },

  {
    // NaCl titré par AgNO₃
    // Ag⁺ + Cl⁻ → AgCl↓  (précipité blanc)
    // Spectateurs : Na⁺ (apporté par NaCl), NO₃⁻ (apporté par AgNO₃)
    label:            'Chlorure de sodium (Na⁺ ; Cl⁻)',
    labelTitrante:    'Nitrate d\'argent<br>(Ag⁺ ; <b>NO₃⁻</b>)',
    precipitationOnly: true,
    titre:   { type: 'precipitation', formula: 'Cl⁻' },
    titrant: { type: 'precipitation', formula: 'Ag⁺' },
    coeffTitree:   1,
    coeffTitrante: 1,
    fullEquation: [
      { coeff: 1, text: 'Cl⁻', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'Ag⁺', type: 'active' },
      { type: 'arrow' },
      { coeff: 1, text: 'AgCl↓', type: 'active' },
    ],
    especes: [
      { id: 'Cl⁻',  label: 'Cl⁻',  role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'Ag⁺',  label: 'Ag⁺',  role: 'titrante',   coeff: 1, coeffTitrant: null },
      // Précipité formé
      { id: 'AgCl', label: 'AgCl', role: 'precipite', coeff: 1, coeffTitrant: null },
      { id: 'Na⁺',  label: 'Na⁺',  role: 'spectateur', coeff: null, coeffTitrant: null, coeffTitree: 1 },
      // 1 Na⁺ par NaCl initial
      { id: 'NO₃⁻', label: 'NO₃⁻', role: 'spectateur', coeff: null, coeffTitrant: 1 },
      // 1 NO₃⁻ par mol de AgNO₃ versée
    ],
  },

  {
    // Na₂SO₄ titré par BaCl₂
    // Ba²⁺ + SO₄²⁻ → BaSO₄↓  (précipité blanc)
    // Spectateurs : 2 Na⁺ (apportés par Na₂SO₄), 2 Cl⁻ (apportés par BaCl₂)
    label:            'Sulfate de sodium (2 Na⁺ ; SO₄²⁻)',
    labelTitrante:    'Chlorure de baryum<br>(Ba²⁺ ; <b>2 Cl⁻</b>)',
    precipitationOnly: true,
    titre:   { type: 'precipitation', formula: 'SO₄²⁻' },
    titrant: { type: 'precipitation', formula: 'Ba²⁺'  },
    coeffTitree:   1,
    coeffTitrante: 1,
    fullEquation: [
      { coeff: 1, text: 'SO₄²⁻', type: 'active' },
      { type: 'op' },
      { coeff: 1, text: 'Ba²⁺',  type: 'active' },
      { type: 'arrow' },
      { coeff: 1, text: 'BaSO₄↓', type: 'active' },
    ],
    especes: [
      { id: 'SO₄²⁻', label: 'SO₄²⁻', role: 'titree',     coeff: 1, coeffTitrant: null },
      { id: 'Ba²⁺',  label: 'Ba²⁺',  role: 'titrante',   coeff: 1, coeffTitrant: null },
      // Précipité formé
      { id: 'BaSO₄', label: 'BaSO₄', role: 'precipite', coeff: 1, coeffTitrant: null },
      { id: 'Na⁺',   label: 'Na⁺',   role: 'spectateur', coeff: null, coeffTitrant: null, coeffTitree: 2 },
      // 2 Na⁺ par Na₂SO₄ initial
      { id: 'Cl⁻',   label: 'Cl⁻',   role: 'spectateur', coeff: null, coeffTitrant: 2 },
      // 2 Cl⁻ par mol de BaCl₂ versée
    ],
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   INDICATEURS COLORÉS — pH-métrie
   Triés par ordre croissant de pHmin (début de zone de virage).
   Chaque entrée :
     nom        : nom usuel
     pHmin      : début de zone de virage
     pHmax      : fin de zone de virage
     coulAcide  : teinte en milieu acide (CSS color)
     coulInter  : teinte intermédiaire (zone de virage)
     coulBasique: teinte en milieu basique (CSS color)
     labelAcide : description texte de la teinte acide
     labelInter : description texte de la teinte intermédiaire
     labelBasique: description texte de la teinte basique
══════════════════════════════════════════════════════════════════════════ */
const INDICATEURS_COLORES = [
  {
    nom: 'Bleu de bromophénol',
    pHmin: 3.0, pHmax: 4.6,
    coulAcide:   '#f5e642',
    coulInter:   '#6abf6a',
    coulBasique: '#5060c8',
    labelAcide:   'jaune',
    labelInter:   'vert',
    labelBasique: 'bleu-violet',
  },
  {
    nom: 'Hélianthine (orange de méthyle)',
    pHmin: 3.1, pHmax: 4.4,
    coulAcide:   '#c03020',
    coulInter:   '#e07820',
    coulBasique: '#f0c030',
    labelAcide:   'rouge',
    labelInter:   'orange',
    labelBasique: 'jaune',
  },
  {
    nom: 'Vert de bromocrésol',
    pHmin: 3.8, pHmax: 5.4,
    coulAcide:   '#f5e642',
    coulInter:   '#5ab560',
    coulBasique: '#2a7acc',
    labelAcide:   'jaune',
    labelInter:   'vert',
    labelBasique: 'bleu',
  },
  {
    nom: 'Rouge de méthyle',
    pHmin: 4.2, pHmax: 6.2,
    coulAcide:   '#c03020',
    coulInter:   '#e07820',
    coulBasique: '#f0c030',
    labelAcide:   'rouge',
    labelInter:   'orange',
    labelBasique: 'jaune',
  },
  {
    nom: 'Bleu de bromothymol (BBT)',
    pHmin: 6.0, pHmax: 7.6,
    coulAcide:   '#f5e642',
    coulInter:   '#5ab560',
    coulBasique: '#2a5fcc',
    labelAcide:   'jaune',
    labelInter:   'vert',
    labelBasique: 'bleu',
  },
  {
    nom: 'Rouge de phénol',
    pHmin: 6.4, pHmax: 8.0,
    coulAcide:   '#f5e642',
    coulInter:   '#e07820',
    coulBasique: '#c03020',
    labelAcide:   'jaune',
    labelInter:   'orange',
    labelBasique: 'rouge',
  },
  {
    nom: 'Rouge de crésol',
    pHmin: 7.2, pHmax: 8.8,
    coulAcide:   '#f5e642',
    coulInter:   '#e07820',
    coulBasique: '#c03020',
    labelAcide:   'jaune',
    labelInter:   'orange',
    labelBasique: 'rouge',
  },
  {
    nom: 'Phénolphtaléine',
    pHmin: 8.2, pHmax: 10.0,
    coulAcide:   'rgba(184,212,240,0)',   // incolore (transparent)
    coulInter:   '#f4b8d4',
    coulBasique: '#e0408a',
    labelAcide:   'incolore',
    labelInter:   'rose pâle',
    labelBasique: 'rose / fuchsia',
    acideIncolore: true,
  },
  {
    nom: 'Curcuma',
    pHmin: 7.4, pHmax: 9.2,
    coulAcide:   '#f0c030',
    coulInter:   '#d08020',
    coulBasique: '#8b3a10',
    labelAcide:   'jaune',
    labelInter:   'jaune-orangé',
    labelBasique: 'rouge-brun / brun orangé',
  },
  {
    nom: "Jaune d'alizarine R",
    pHmin: 10.1, pHmax: 12.0,
    coulAcide:   '#f5e642',
    coulInter:   '#e07820',
    coulBasique: '#c03020',
    labelAcide:   'jaune',
    labelInter:   'orange',
    labelBasique: 'rouge',
  },
];
