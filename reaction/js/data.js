/* ══════════════════════════════════════════════════════════════════════════
   Simulation pédagogique — Physique-Chimie Lycée
   Auteur  : Mathieu Berdous
   Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   DATA.JS — Données des réactions et modèles moléculaires
   Chargé en premier. Expose : REACTIONS, MOL_MODELS, ATOM_COLORS,
   ATOM_BORDER, COL_BG_*, N_COLS, N_REACTIFS, N_PRODUITS,
   FRAC_MID_W, FRAC_MID_H_EQ, MIN_MOL_SC
══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   DONNÉES DES RÉACTIONS
══════════════════════════════════════════════════════════════════════════ */
const REACTIONS = [
  /* ══ RÉACTIONS ORIGINALES ══ */
  {
    label: 'C + O₂ → CO₂',
    difficulty: 1,
    reactifs: [
      { formula: 'C',   coeff: 1, atoms: { C:1 } },
      { formula: 'O₂',  coeff: 1, atoms: { O:2 } },
    ],
    produits: [
      { formula: 'CO₂', coeff: 1, atoms: { C:1, O:2 } },
    ],
  },
  {
    label: 'CH₄ + 2 O₂ → CO₂ + 2 H₂O',
    difficulty: 2,
    reactifs: [
      { formula: 'CH₄', coeff: 1, atoms: { C:1, H:4 } },
      { formula: 'O₂',  coeff: 2, atoms: { O:2 } },
    ],
    produits: [
      { formula: 'CO₂', coeff: 1, atoms: { C:1, O:2 } },
      { formula: 'H₂O', coeff: 2, atoms: { H:2, O:1 } },
    ],
  },
  {
    label: 'H₂ + Cl₂ → 2 HCl',
    difficulty: 1,
    reactifs: [
      { formula: 'H₂',  coeff: 1, atoms: { H:2 } },
      { formula: 'Cl₂', coeff: 1, atoms: { Cl:2 } },
    ],
    produits: [
      { formula: 'HCl', coeff: 2, atoms: { H:1, Cl:1 } },
    ],
  },
  {
    label: '3 H₂ + N₂ → 2 NH₃',
    difficulty: 2,
    reactifs: [
      { formula: 'H₂', coeff: 3, atoms: { H:2 } },
      { formula: 'N₂', coeff: 1, atoms: { N:2 } },
    ],
    produits: [
      { formula: 'NH₃', coeff: 2, atoms: { N:1, H:3 } },
    ],
  },
  {
    label: '2 Fe + 3 Cl₂ → 2 FeCl₃',
    difficulty: 2,
    reactifs: [
      { formula: 'Fe',  coeff: 2, atoms: { Fe:1 } },
      { formula: 'Cl₂', coeff: 3, atoms: { Cl:2 } },
    ],
    produits: [
      { formula: 'FeCl₃', coeff: 2, atoms: { Fe:1, Cl:3 } },
    ],
  },
  {
    label: '2 SnO + O₂ → 2 SnO₂',
    difficulty: 2,
    reactifs: [
      { formula: 'SnO', coeff: 2, atoms: { Sn:1, O:1 } },
      { formula: 'O₂',  coeff: 1, atoms: { O:2 } },
    ],
    produits: [
      { formula: 'SnO₂', coeff: 2, atoms: { Sn:1, O:2 } },
    ],
  },
  {
    label: 'Mg + CO₂ → CO + MgO',
    difficulty: 1,
    reactifs: [
      { formula: 'Mg',  coeff: 1, atoms: { Mg:1 } },
      { formula: 'CO₂', coeff: 1, atoms: { C:1, O:2 } },
    ],
    produits: [
      { formula: 'CO',  coeff: 1, atoms: { C:1, O:1 } },
      { formula: 'MgO', coeff: 1, atoms: { Mg:1, O:1 } },
    ],
  },
  {
    label: '2 Al + 3 H₂O → Al₂O₃ + 3 H₂',
    difficulty: 2,
    reactifs: [
      { formula: 'Al',  coeff: 2, atoms: { Al:1 } },
      { formula: 'H₂O', coeff: 3, atoms: { H:2, O:1 } },
    ],
    produits: [
      { formula: 'Al₂O₃', coeff: 1, atoms: { Al:2, O:3 } },
      { formula: 'H₂',    coeff: 3, atoms: { H:2 } },
    ],
  },
  {
    label: '2 Zn + SO₂ → 2 ZnO + S',
    difficulty: 2,
    reactifs: [
      { formula: 'Zn',  coeff: 2, atoms: { Zn:1 } },
      { formula: 'SO₂', coeff: 1, atoms: { S:1, O:2 } },
    ],
    produits: [
      { formula: 'ZnO', coeff: 2, atoms: { Zn:1, O:1 } },
      { formula: 'S',   coeff: 1, atoms: { S:1 } },
    ],
  },
  {
    label: '3 Fe₂O₃ + CO → 2 Fe₃O₄ + CO₂',
    difficulty: 3,
    reactifs: [
      { formula: 'Fe₂O₃', coeff: 3, atoms: { Fe:2, O:3 } },
      { formula: 'CO',     coeff: 1, atoms: { C:1, O:1 } },
    ],
    produits: [
      { formula: 'Fe₃O₄', coeff: 2, atoms: { Fe:3, O:4 } },
      { formula: 'CO₂',   coeff: 1, atoms: { C:1, O:2 } },
    ],
  },
  {
    label: 'N₂H₄ + 2 H₂O₂ → N₂ + 4 H₂O',
    difficulty: 2,
    reactifs: [
      { formula: 'N₂H₄', coeff: 1, atoms: { N:2, H:4 } },
      { formula: 'H₂O₂', coeff: 2, atoms: { H:2, O:2 } },
    ],
    produits: [
      { formula: 'N₂',  coeff: 1, atoms: { N:2 } },
      { formula: 'H₂O', coeff: 4, atoms: { H:2, O:1 } },
    ],
  },
  {
    label: '2 H₂ + O₂ → 2 H₂O',
    difficulty: 1,
    reactifs: [
      { formula: 'H₂', coeff: 2, atoms: { H:2 } },
      { formula: 'O₂', coeff: 1, atoms: { O:2 } },
    ],
    produits: [
      { formula: 'H₂O', coeff: 2, atoms: { H:2, O:1 } },
    ],
  },
  {
    label: 'P₄ + 6 H₂ → 4 PH₃',
    difficulty: 2,
    reactifs: [
      { formula: 'P₄', coeff: 1, atoms: { P:4 } },
      { formula: 'H₂', coeff: 6, atoms: { H:2 } },
    ],
    produits: [
      { formula: 'PH₃', coeff: 4, atoms: { P:1, H:3 } },
    ],
  },
  {
    label: 'H₂ + F₂ → 2 HF',
    difficulty: 1,
    reactifs: [
      { formula: 'H₂', coeff: 1, atoms: { H:2 } },
      { formula: 'F₂', coeff: 1, atoms: { F:2 } },
    ],
    produits: [
      { formula: 'HF', coeff: 2, atoms: { H:1, F:1 } },
    ],
  },
  {
    label: 'PCl₅ → PCl₃ + Cl₂',
    difficulty: 1,
    reactifs: [
      { formula: 'PCl₅', coeff: 1, atoms: { P:1, Cl:5 } },
    ],
    produits: [
      { formula: 'PCl₃', coeff: 1, atoms: { P:1, Cl:3 } },
      { formula: 'Cl₂',  coeff: 1, atoms: { Cl:2 } },
    ],
  },
  {
    label: 'C₂H₂ + 2 H₂ → C₂H₆',
    difficulty: 2,
    reactifs: [
      { formula: 'C₂H₂', coeff: 1, atoms: { C:2, H:2 } },
      { formula: 'H₂',   coeff: 2, atoms: { H:2 } },
    ],
    produits: [
      { formula: 'C₂H₆', coeff: 1, atoms: { C:2, H:6 } },
    ],
  },
  {
    label: 'C₂H₄ + 3 O₂ → 2 CO₂ + 2 H₂O',
    difficulty: 2,
    reactifs: [
      { formula: 'C₂H₄', coeff: 1, atoms: { C:2, H:4 } },
      { formula: 'O₂',   coeff: 3, atoms: { O:2 } },
    ],
    produits: [
      { formula: 'CO₂', coeff: 2, atoms: { C:1, O:2 } },
      { formula: 'H₂O', coeff: 2, atoms: { H:2, O:1 } },
    ],
  },
  {
    label: '5 N₂ + 6 H₂O → 4 NH₃ + 6 NO',
    difficulty: 3,
    reactifs: [
      { formula: 'N₂',  coeff: 5, atoms: { N:2 } },
      { formula: 'H₂O', coeff: 6, atoms: { H:2, O:1 } },
    ],
    produits: [
      { formula: 'NH₃', coeff: 4, atoms: { N:1, H:3 } },
      { formula: 'NO',  coeff: 6, atoms: { N:1, O:1 } },
    ],
  },
  {
    label: 'C₂H₅OH + 3 O₂ → 2 CO₂ + 3 H₂O',
    difficulty: 3,
    reactifs: [
      { formula: 'C₂H₅OH', coeff: 1, atoms: { C:2, H:6, O:1 } },
      { formula: 'O₂',     coeff: 3, atoms: { O:2 } },
    ],
    produits: [
      { formula: 'CO₂', coeff: 2, atoms: { C:1, O:2 } },
      { formula: 'H₂O', coeff: 3, atoms: { H:2, O:1 } },
    ],
  },
  {
    label: '6 CO₂ + 6 H₂O → C₆H₁₂O₆ + 6 O₂',
    difficulty: 3,
    reactifs: [
      { formula: 'CO₂', coeff: 6, atoms: { C:1, O:2 } },
      { formula: 'H₂O', coeff: 6, atoms: { H:2, O:1 } },
    ],
    produits: [
      { formula: 'C₆H₁₂O₆', coeff: 1, atoms: { C:6, H:12, O:6 } },
      { formula: 'O₂',       coeff: 6, atoms: { O:2 } },
    ],
  },
  /* ══ NOUVELLES RÉACTIONS ══ */
  {
    label: 'S + O₂ → SO₂',
    difficulty: 1,
    reactifs: [
      { formula: 'S',  coeff: 1, atoms: { S:1 } },
      { formula: 'O₂', coeff: 1, atoms: { O:2 } },
    ],
    produits: [
      { formula: 'SO₂', coeff: 1, atoms: { S:1, O:2 } },
    ],
  },
  {
    label: 'N₂ + O₂ → 2 NO',
    difficulty: 1,
    reactifs: [
      { formula: 'N₂', coeff: 1, atoms: { N:2 } },
      { formula: 'O₂', coeff: 1, atoms: { O:2 } },
    ],
    produits: [
      { formula: 'NO', coeff: 2, atoms: { N:1, O:1 } },
    ],
  },
  {
    label: 'C + 2 S → CS₂',
    difficulty: 1,
    reactifs: [
      { formula: 'C', coeff: 1, atoms: { C:1 } },
      { formula: 'S', coeff: 2, atoms: { S:1 } },
    ],
    produits: [
      { formula: 'CS₂', coeff: 1, atoms: { C:1, S:2 } },
    ],
  },
  {
    label: '2 Mg + O₂ → 2 MgO',
    difficulty: 1,
    reactifs: [
      { formula: 'Mg', coeff: 2, atoms: { Mg:1 } },
      { formula: 'O₂', coeff: 1, atoms: { O:2 } },
    ],
    produits: [
      { formula: 'MgO', coeff: 2, atoms: { Mg:1, O:1 } },
    ],
  },
  {
    label: '2 Cu + O₂ → 2 CuO',
    difficulty: 1,
    reactifs: [
      { formula: 'Cu', coeff: 2, atoms: { Cu:1 } },
      { formula: 'O₂', coeff: 1, atoms: { O:2 } },
    ],
    produits: [
      { formula: 'CuO', coeff: 2, atoms: { Cu:1, O:1 } },
    ],
  },
  {
    label: '2 SO₂ + O₂ → 2 SO₃',
    difficulty: 2,
    reactifs: [
      { formula: 'SO₂', coeff: 2, atoms: { S:1, O:2 } },
      { formula: 'O₂',  coeff: 1, atoms: { O:2 } },
    ],
    produits: [
      { formula: 'SO₃', coeff: 2, atoms: { S:1, O:3 } },
    ],
  },
  {
    label: '4 Fe + 3 O₂ → 2 Fe₂O₃',
    difficulty: 2,
    reactifs: [
      { formula: 'Fe', coeff: 4, atoms: { Fe:1 } },
      { formula: 'O₂', coeff: 3, atoms: { O:2 } },
    ],
    produits: [
      { formula: 'Fe₂O₃', coeff: 2, atoms: { Fe:2, O:3 } },
    ],
  },
  {
    label: '2 NO₂ → 2 NO + O₂',
    difficulty: 2,
    reactifs: [
      { formula: 'NO₂', coeff: 2, atoms: { N:1, O:2 } },
    ],
    produits: [
      { formula: 'NO', coeff: 2, atoms: { N:1, O:1 } },
      { formula: 'O₂', coeff: 1, atoms: { O:2 } },
    ],
  },
  {
    label: 'CH₄ + H₂O → CO + 3 H₂',
    difficulty: 2,
    reactifs: [
      { formula: 'CH₄', coeff: 1, atoms: { C:1, H:4 } },
      { formula: 'H₂O', coeff: 1, atoms: { H:2, O:1 } },
    ],
    produits: [
      { formula: 'CO', coeff: 1, atoms: { C:1, O:1 } },
      { formula: 'H₂', coeff: 3, atoms: { H:2 } },
    ],
  },
  {
    label: 'C₂H₆ + Cl₂ → C₂H₅Cl + HCl',
    difficulty: 2,
    reactifs: [
      { formula: 'C₂H₆', coeff: 1, atoms: { C:2, H:6 } },
      { formula: 'Cl₂',  coeff: 1, atoms: { Cl:2 } },
    ],
    produits: [
      { formula: 'C₂H₅Cl', coeff: 1, atoms: { C:2, H:5, Cl:1 } },
      { formula: 'HCl',     coeff: 1, atoms: { H:1, Cl:1 } },
    ],
  },
  {
    label: 'SiO₂ + 2 C → Si + 2 CO',
    difficulty: 2,
    reactifs: [
      { formula: 'SiO₂', coeff: 1, atoms: { Si:1, O:2 } },
      { formula: 'C',    coeff: 2, atoms: { C:1 } },
    ],
    produits: [
      { formula: 'Si', coeff: 1, atoms: { Si:1 } },
      { formula: 'CO', coeff: 2, atoms: { C:1, O:1 } },
    ],
  },
  {
    label: '2 NO + O₂ → 2 NO₂',
    difficulty: 2,
    reactifs: [
      { formula: 'NO', coeff: 2, atoms: { N:1, O:1 } },
      { formula: 'O₂', coeff: 1, atoms: { O:2 } },
    ],
    produits: [
      { formula: 'NO₂', coeff: 2, atoms: { N:1, O:2 } },
    ],
  },
  {
    label: 'Fe₂O₃ + 3 H₂ → 2 Fe + 3 H₂O',
    difficulty: 2,
    reactifs: [
      { formula: 'Fe₂O₃', coeff: 1, atoms: { Fe:2, O:3 } },
      { formula: 'H₂',    coeff: 3, atoms: { H:2 } },
    ],
    produits: [
      { formula: 'Fe', coeff: 2, atoms: { Fe:1 } },
      { formula: 'H₂O', coeff: 3, atoms: { H:2, O:1 } },
    ],
  },
  {
    label: '2 NH₃ + Cl₂ → N₂H₄ + 2 HCl',
    difficulty: 2,
    reactifs: [
      { formula: 'NH₃', coeff: 2, atoms: { N:1, H:3 } },
      { formula: 'Cl₂', coeff: 1, atoms: { Cl:2 } },
    ],
    produits: [
      { formula: 'N₂H₄', coeff: 1, atoms: { N:2, H:4 } },
      { formula: 'HCl',  coeff: 2, atoms: { H:1, Cl:1 } },
    ],
  },
  {
    label: '2 C₂H₂ + 5 O₂ → 4 CO₂ + 2 H₂O',
    difficulty: 2,
    reactifs: [
      { formula: 'C₂H₂', coeff: 2, atoms: { C:2, H:2 } },
      { formula: 'O₂',   coeff: 5, atoms: { O:2 } },
    ],
    produits: [
      { formula: 'CO₂', coeff: 4, atoms: { C:1, O:2 } },
      { formula: 'H₂O', coeff: 2, atoms: { H:2, O:1 } },
    ],
  },
  {
    label: '2 C₂H₆ + 7 O₂ → 4 CO₂ + 6 H₂O',
    difficulty: 3,
    reactifs: [
      { formula: 'C₂H₆', coeff: 2, atoms: { C:2, H:6 } },
      { formula: 'O₂',   coeff: 7, atoms: { O:2 } },
    ],
    produits: [
      { formula: 'CO₂', coeff: 4, atoms: { C:1, O:2 } },
      { formula: 'H₂O', coeff: 6, atoms: { H:2, O:1 } },
    ],
  },
  {
    label: 'C₃H₈ + 5 O₂ → 3 CO₂ + 4 H₂O',
    difficulty: 3,
    reactifs: [
      { formula: 'C₃H₈', coeff: 1, atoms: { C:3, H:8 } },
      { formula: 'O₂',   coeff: 5, atoms: { O:2 } },
    ],
    produits: [
      { formula: 'CO₂', coeff: 3, atoms: { C:1, O:2 } },
      { formula: 'H₂O', coeff: 4, atoms: { H:2, O:1 } },
    ],
  },
  {
    label: '4 FeS₂ + 11 O₂ → 2 Fe₂O₃ + 8 SO₂',
    difficulty: 3,
    reactifs: [
      { formula: 'FeS₂', coeff: 4, atoms: { Fe:1, S:2 } },
      { formula: 'O₂',   coeff: 11, atoms: { O:2 } },
    ],
    produits: [
      { formula: 'Fe₂O₃', coeff: 2, atoms: { Fe:2, O:3 } },
      { formula: 'SO₂',   coeff: 8, atoms: { S:1, O:2 } },
    ],
  },
  {
    label: '4 NH₃ + 3 O₂ → 2 N₂ + 6 H₂O',
    difficulty: 3,
    reactifs: [
      { formula: 'NH₃', coeff: 4, atoms: { N:1, H:3 } },
      { formula: 'O₂',  coeff: 3, atoms: { O:2 } },
    ],
    produits: [
      { formula: 'N₂',  coeff: 2, atoms: { N:2 } },
      { formula: 'H₂O', coeff: 6, atoms: { H:2, O:1 } },
    ],
  },
  {
    label: '4 NH₃ + 5 O₂ → 4 NO + 6 H₂O',
    difficulty: 3,
    reactifs: [
      { formula: 'NH₃', coeff: 4, atoms: { N:1, H:3 } },
      { formula: 'O₂',  coeff: 5, atoms: { O:2 } },
    ],
    produits: [
      { formula: 'NO',  coeff: 4, atoms: { N:1, O:1 } },
      { formula: 'H₂O', coeff: 6, atoms: { H:2, O:1 } },
    ],
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   MODÈLES MOLÉCULAIRES 2D
══════════════════════════════════════════════════════════════════════════ */
const MOL_MODELS = {
  'C':   { atoms:[{el:'C',x:0,y:0}], bonds:[], radius:14 },
  'O₂':  { atoms:[{el:'O',x:-18,y:0},{el:'O',x:18,y:0}],
            bonds:[{a:{el:'O',x:-18,y:0},b:{el:'O',x:18,y:0},double:true}], radius:12 },
  'CO₂': { atoms:[{el:'O',x:-38,y:0},{el:'C',x:0,y:0},{el:'O',x:38,y:0}],
            bonds:[{a:{el:'O',x:-38,y:0},b:{el:'C',x:0,y:0},double:true},
                   {a:{el:'C',x:0,y:0},  b:{el:'O',x:38,y:0},double:true}], radius:12 },
  'CH₄': { atoms:[{el:'C',x:0,y:0},{el:'H',x:0,y:-28},
                   {el:'H',x:26,y:14},{el:'H',x:-26,y:14},{el:'H',x:0,y:24}],
            bonds:[{a:{el:'C',x:0,y:0},b:{el:'H',x:0,  y:-28}},
                   {a:{el:'C',x:0,y:0},b:{el:'H',x:26, y:14 }},
                   {a:{el:'C',x:0,y:0},b:{el:'H',x:-26,y:14 }},
                   {a:{el:'C',x:0,y:0},b:{el:'H',x:0,  y:24 }}], radius:12 },
  'H₂O': { atoms:[{el:'O',x:0,y:0},{el:'H',x:-20,y:18},{el:'H',x:20,y:18}],
            bonds:[{a:{el:'O',x:0,y:0},b:{el:'H',x:-20,y:18}},
                   {a:{el:'O',x:0,y:0},b:{el:'H',x:20, y:18}}], radius:12 },
  'H₂':  { atoms:[{el:'H',x:-14,y:0},{el:'H',x:14,y:0}],
            bonds:[{a:{el:'H',x:-14,y:0},b:{el:'H',x:14,y:0}}], radius:11 },
  'Cl₂': { atoms:[{el:'Cl',x:-20,y:0},{el:'Cl',x:20,y:0}],
            bonds:[{a:{el:'Cl',x:-20,y:0},b:{el:'Cl',x:20,y:0}}], radius:13 },
  'HCl': { atoms:[{el:'H',x:-18,y:0},{el:'Cl',x:18,y:0}],
            bonds:[{a:{el:'H',x:-18,y:0},b:{el:'Cl',x:18,y:0}}], radius:12 },
  'N₂':  { atoms:[{el:'N',x:-18,y:0},{el:'N',x:18,y:0}],
            bonds:[{a:{el:'N',x:-18,y:0},b:{el:'N',x:18,y:0},triple:true}], radius:12 },
  'NH₃': { atoms:[{el:'N',x:0,y:-4},{el:'H',x:-22,y:18},{el:'H',x:22,y:18},{el:'H',x:0,y:24}],
            bonds:[{a:{el:'N',x:0,y:-4},b:{el:'H',x:-22,y:18}},
                   {a:{el:'N',x:0,y:-4},b:{el:'H',x:22,y:18}},
                   {a:{el:'N',x:0,y:-4},b:{el:'H',x:0,y:24}}], radius:12 },
  'Fe':    { atoms:[{el:'Fe',x:0,y:0}], bonds:[], radius:14 },
  'FeCl₃': { atoms:[{el:'Fe',x:0,y:0},{el:'Cl',x:-28,y:22},{el:'Cl',x:28,y:22},{el:'Cl',x:0,y:-30}],
              bonds:[{a:{el:'Fe',x:0,y:0},b:{el:'Cl',x:-28,y:22}},
                     {a:{el:'Fe',x:0,y:0},b:{el:'Cl',x:28,y:22}},
                     {a:{el:'Fe',x:0,y:0},b:{el:'Cl',x:0,y:-30}}], radius:13 },
  'Sn':   { atoms:[{el:'Sn',x:0,y:0}], bonds:[], radius:14 },
  'SnO':  { atoms:[{el:'Sn',x:-13,y:0},{el:'O',x:13,y:0}],
            bonds:[], radius:13 },
  'SnO₂': { atoms:[{el:'O',x:-36,y:0},{el:'Sn',x:0,y:0},{el:'O',x:36,y:0}],
             bonds:[{a:{el:'O',x:-36,y:0},b:{el:'Sn',x:0,y:0},double:true},
                    {a:{el:'Sn',x:0,y:0},b:{el:'O',x:36,y:0},double:true}], radius:13 },
  'Mg':  { atoms:[{el:'Mg',x:0,y:0}], bonds:[], radius:14 },
  'CO':  { atoms:[{el:'C',x:-18,y:0},{el:'O',x:18,y:0}],
           bonds:[{a:{el:'C',x:-18,y:0},b:{el:'O',x:18,y:0},triple:true}], radius:12 },
  'MgO': { atoms:[{el:'Mg',x:-13,y:0},{el:'O',x:13,y:0}],
           bonds:[], radius:13 },
  'Al':    { atoms:[{el:'Al',x:0,y:0}], bonds:[], radius:14 },
  'Al₂O₃': {
    atoms:[
      {el:'O', x:-44,y: 18},
      {el:'Al',x:-22,y:-14},
      {el:'O', x:  0,y: 18},
      {el:'Al',x: 22,y:-14},
      {el:'O', x: 44,y: 18}
    ],
    bonds:[
      {a:{el:'O', x:-44,y:18}, b:{el:'Al',x:-22,y:-14}, double:true},
      {a:{el:'Al',x:-22,y:-14},b:{el:'O', x:  0,y: 18}},
      {a:{el:'O', x:  0,y:18}, b:{el:'Al',x: 22,y:-14}},
      {a:{el:'Al',x: 22,y:-14},b:{el:'O', x: 44,y: 18}, double:true}
    ], radius:13 },
  'Zn':   { atoms:[{el:'Zn',x:0,y:0}], bonds:[], radius:14 },
  'SO₂':  { atoms:[{el:'O',x:-34,y:0},{el:'S',x:0,y:0},{el:'O',x:34,y:0}],
             bonds:[{a:{el:'O',x:-34,y:0},b:{el:'S',x:0,y:0},double:true},
                    {a:{el:'S',x:0,y:0},b:{el:'O',x:34,y:0},double:true}], radius:12 },
  'ZnO':  { atoms:[{el:'Zn',x:-13,y:0},{el:'O',x:13,y:0}],
            bonds:[], radius:13 },
  'S':    { atoms:[{el:'S',x:0,y:0}], bonds:[], radius:13 },
  'Fe₂O₃': {
    atoms:[
      {el:'O', x:-44,y: 18},
      {el:'Fe',x:-22,y:-14},
      {el:'O', x:  0,y: 18},
      {el:'Fe',x: 22,y:-14},
      {el:'O', x: 44,y: 18}
    ],
    bonds:[
      {a:{el:'O', x:-44,y:18}, b:{el:'Fe',x:-22,y:-14}, double:true},
      {a:{el:'Fe',x:-22,y:-14},b:{el:'O', x:  0,y: 18}},
      {a:{el:'O', x:  0,y:18}, b:{el:'Fe',x: 22,y:-14}},
      {a:{el:'Fe',x: 22,y:-14},b:{el:'O', x: 44,y: 18}, double:true}
    ], radius:13 },
  'Fe₃O₄': {
    atoms:[
      {el:'O', x:-66,y: 18},
      {el:'Fe',x:-44,y:-14},
      {el:'O', x:-22,y: 18},
      {el:'Fe',x:  0,y:-14},
      {el:'O', x: 22,y: 18},
      {el:'Fe',x: 44,y:-14},
      {el:'O', x: 66,y: 18}
    ],
    bonds:[
      {a:{el:'O', x:-66,y: 18},b:{el:'Fe',x:-44,y:-14}, double:true},
      {a:{el:'Fe',x:-44,y:-14},b:{el:'O', x:-22,y: 18}},
      {a:{el:'O', x:-22,y: 18},b:{el:'Fe',x:  0,y:-14}},
      {a:{el:'Fe',x:  0,y:-14},b:{el:'O', x: 22,y: 18}},
      {a:{el:'O', x: 22,y: 18},b:{el:'Fe',x: 44,y:-14}},
      {a:{el:'Fe',x: 44,y:-14},b:{el:'O', x: 66,y: 18}, double:true}
    ], radius:13 },
  'F₂':  { atoms:[{el:'F',x:-18,y:0},{el:'F',x:18,y:0}],
            bonds:[{a:{el:'F',x:-18,y:0},b:{el:'F',x:18,y:0}}], radius:12 },
  'HF':  { atoms:[{el:'H',x:-18,y:0},{el:'F',x:18,y:0}],
            bonds:[{a:{el:'H',x:-18,y:0},b:{el:'F',x:18,y:0}}], radius:12 },
  'P₄':  {
    atoms:[
      {el:'P', x:   0, y: -32},
      {el:'P', x: -28, y:  16},
      {el:'P', x:  28, y:  16},
      {el:'P', x:   0, y:   4}
    ],
    bonds:[
      {a:{el:'P',x:0,y:-32},  b:{el:'P',x:-28,y:16}},
      {a:{el:'P',x:0,y:-32},  b:{el:'P',x: 28,y:16}},
      {a:{el:'P',x:-28,y:16}, b:{el:'P',x: 28,y:16}},
      {a:{el:'P',x:0,y:-32},  b:{el:'P',x:  0,y:  4}},
      {a:{el:'P',x:-28,y:16}, b:{el:'P',x:  0,y:  4}},
      {a:{el:'P',x: 28,y:16}, b:{el:'P',x:  0,y:  4}}
    ], radius:12 },
  'PH₃': { atoms:[{el:'P',x:0,y:-4},{el:'H',x:-22,y:18},{el:'H',x:22,y:18},{el:'H',x:0,y:24}],
            bonds:[{a:{el:'P',x:0,y:-4},b:{el:'H',x:-22,y:18}},
                   {a:{el:'P',x:0,y:-4},b:{el:'H',x:22,y:18}},
                   {a:{el:'P',x:0,y:-4},b:{el:'H',x:0,y:24}}], radius:12 },
  'PCl₅': {
    atoms:[
      {el:'P',  x:  0, y:  0},
      {el:'Cl', x:  0, y:-36},
      {el:'Cl', x: 34, y: 12},
      {el:'Cl', x:-34, y: 12},
      {el:'Cl', x: 20, y:-28},
      {el:'Cl', x:-20, y:-28}
    ],
    bonds:[
      {a:{el:'P',x:0,y:0},b:{el:'Cl',x:  0,y:-36}},
      {a:{el:'P',x:0,y:0},b:{el:'Cl',x: 34,y: 12}},
      {a:{el:'P',x:0,y:0},b:{el:'Cl',x:-34,y: 12}},
      {a:{el:'P',x:0,y:0},b:{el:'Cl',x: 20,y:-28}},
      {a:{el:'P',x:0,y:0},b:{el:'Cl',x:-20,y:-28}}
    ], radius:13 },
  'PCl₃': { atoms:[{el:'P',x:0,y:-4},{el:'Cl',x:-26,y:20},{el:'Cl',x:26,y:20},{el:'Cl',x:0,y:28}],
             bonds:[{a:{el:'P',x:0,y:-4},b:{el:'Cl',x:-26,y:20}},
                    {a:{el:'P',x:0,y:-4},b:{el:'Cl',x:26,y:20}},
                    {a:{el:'P',x:0,y:-4},b:{el:'Cl',x:0,y:28}}], radius:13 },
  'C₂H₂': {
    atoms:[
      {el:'H',x:-48,y:0},{el:'C',x:-20,y:0},{el:'C',x:20,y:0},{el:'H',x:48,y:0}
    ],
    bonds:[
      {a:{el:'H',x:-48,y:0},b:{el:'C',x:-20,y:0}},
      {a:{el:'C',x:-20,y:0},b:{el:'C',x:20,y:0}, triple:true},
      {a:{el:'C',x:20,y:0}, b:{el:'H',x:48,y:0}}
    ], radius:12 },
  'C₂H₆': {
    atoms:[
      {el:'C', x:-22,y:  0},
      {el:'C', x: 22,y:  0},
      {el:'H', x:-22,y:-26},
      {el:'H', x:-22,y: 26},
      {el:'H', x:-48,y:  0},
      {el:'H', x: 22,y:-26},
      {el:'H', x: 22,y: 26},
      {el:'H', x: 48,y:  0}
    ],
    bonds:[
      {a:{el:'C',x:-22,y:0},b:{el:'C',x:22,y:0}},
      {a:{el:'C',x:-22,y:0},b:{el:'H',x:-22,y:-26}},
      {a:{el:'C',x:-22,y:0},b:{el:'H',x:-22,y: 26}},
      {a:{el:'C',x:-22,y:0},b:{el:'H',x:-48,y:  0}},
      {a:{el:'C',x: 22,y:0},b:{el:'H',x: 22,y:-26}},
      {a:{el:'C',x: 22,y:0},b:{el:'H',x: 22,y: 26}},
      {a:{el:'C',x: 22,y:0},b:{el:'H',x: 48,y:  0}}
    ], radius:12 },
  'C₂H₅OH': {
    atoms:[
      {el:'C', x:-30, y:  0},
      {el:'C', x:  0, y:  0},
      {el:'O', x: 28, y:  0},
      {el:'H', x:-30, y:-26},
      {el:'H', x:-30, y: 26},
      {el:'H', x:-56, y:  0},
      {el:'H', x:  0, y:-26},
      {el:'H', x:  0, y: 26},
      {el:'H', x: 50, y:  0}
    ],
    bonds:[
      {a:{el:'C',x:-30,y:0}, b:{el:'C',x:  0,y:0}},
      {a:{el:'C',x:  0,y:0}, b:{el:'O',x: 28,y:0}},
      {a:{el:'C',x:-30,y:0}, b:{el:'H',x:-30,y:-26}},
      {a:{el:'C',x:-30,y:0}, b:{el:'H',x:-30,y: 26}},
      {a:{el:'C',x:-30,y:0}, b:{el:'H',x:-56,y:  0}},
      {a:{el:'C',x:  0,y:0}, b:{el:'H',x:  0,y:-26}},
      {a:{el:'C',x:  0,y:0}, b:{el:'H',x:  0,y: 26}},
      {a:{el:'O',x: 28,y:0}, b:{el:'H',x: 50,y:  0}}
    ], radius:12 },
  'C₆H₁₂O₆': {
    atoms:[
      {el:'C', x:-70, y:  0},
      {el:'C', x:-42, y:  0},
      {el:'C', x:-14, y:  0},
      {el:'C', x: 14, y:  0},
      {el:'C', x: 42, y:  0},
      {el:'C', x: 70, y:  0},
      {el:'O', x:-70, y:-26},
      {el:'O', x:-42, y: 26},
      {el:'O', x:-14, y:-26},
      {el:'O', x: 14, y: 26},
      {el:'O', x: 42, y:-26},
      {el:'O', x: 70, y: 26},
      {el:'H', x:-70, y: 26},
      {el:'H', x:-42, y:-26},
      {el:'H', x:-14, y: 26},
      {el:'H', x: 14, y:-26},
      {el:'H', x: 42, y: 26},
      {el:'H', x: 70, y:-26},
      {el:'H', x:-42, y: 52},
      {el:'H', x:-14, y:-52},
      {el:'H', x: 14, y: 52},
      {el:'H', x: 42, y:-52},
      {el:'H', x: 70, y: 52},
      {el:'H', x: 96, y:  0}
    ],
    bonds:[
      {a:{el:'C',x:-70,y:0},b:{el:'C',x:-42,y:0}},
      {a:{el:'C',x:-42,y:0},b:{el:'C',x:-14,y:0}},
      {a:{el:'C',x:-14,y:0},b:{el:'C',x: 14,y:0}},
      {a:{el:'C',x: 14,y:0},b:{el:'C',x: 42,y:0}},
      {a:{el:'C',x: 42,y:0},b:{el:'C',x: 70,y:0}},
      {a:{el:'C',x:-70,y:0},b:{el:'O',x:-70,y:-26}, double:true},
      {a:{el:'C',x:-42,y:0},b:{el:'O',x:-42,y: 26}},
      {a:{el:'C',x:-14,y:0},b:{el:'O',x:-14,y:-26}},
      {a:{el:'C',x: 14,y:0},b:{el:'O',x: 14,y: 26}},
      {a:{el:'C',x: 42,y:0},b:{el:'O',x: 42,y:-26}},
      {a:{el:'C',x: 70,y:0},b:{el:'O',x: 70,y: 26}},
      {a:{el:'C',x:-70,y:0},b:{el:'H',x:-70,y: 26}},
      {a:{el:'C',x:-42,y:0},b:{el:'H',x:-42,y:-26}},
      {a:{el:'C',x:-14,y:0},b:{el:'H',x:-14,y: 26}},
      {a:{el:'C',x: 14,y:0},b:{el:'H',x: 14,y:-26}},
      {a:{el:'C',x: 42,y:0},b:{el:'H',x: 42,y: 26}},
      {a:{el:'C',x: 70,y:0},b:{el:'H',x: 70,y:-26}},
      {a:{el:'O',x:-42,y: 26},b:{el:'H',x:-42,y: 52}},
      {a:{el:'O',x:-14,y:-26},b:{el:'H',x:-14,y:-52}},
      {a:{el:'O',x: 14,y: 26},b:{el:'H',x: 14,y: 52}},
      {a:{el:'O',x: 42,y:-26},b:{el:'H',x: 42,y:-52}},
      {a:{el:'O',x: 70,y: 26},b:{el:'H',x: 70,y: 52}},
      {a:{el:'C',x: 70,y:0},b:{el:'H',x: 96,y:  0}}
    ], radius:12 },
  'C₂H₄': {
    atoms:[
      {el:'C', x:-20, y:  0},
      {el:'C', x: 20, y:  0},
      {el:'H', x:-20, y:-24},
      {el:'H', x:-20, y: 24},
      {el:'H', x: 20, y:-24},
      {el:'H', x: 20, y: 24},
    ],
    bonds:[
      {a:{el:'C',x:-20,y:0}, b:{el:'C',x:20,y:0}, double:true},
      {a:{el:'C',x:-20,y:0}, b:{el:'H',x:-20,y:-24}},
      {a:{el:'C',x:-20,y:0}, b:{el:'H',x:-20,y: 24}},
      {a:{el:'C',x: 20,y:0}, b:{el:'H',x: 20,y:-24}},
      {a:{el:'C',x: 20,y:0}, b:{el:'H',x: 20,y: 24}},
    ], radius:12 },
  'NO': {
    atoms:[{el:'N',x:-16,y:0},{el:'O',x:16,y:0}],
    bonds:[{a:{el:'N',x:-16,y:0}, b:{el:'O',x:16,y:0}, double:true}],
    radius:12 },
  'N₂H₄': {
    atoms:[
      {el:'N',x:-18,y:0},{el:'N',x:18,y:0},
      {el:'H',x:-18,y:-22},{el:'H',x:-38,y:12},
      {el:'H',x: 18,y:-22},{el:'H',x: 38,y:12}
    ],
    bonds:[
      {a:{el:'N',x:-18,y:0},b:{el:'N',x:18,y:0}},
      {a:{el:'N',x:-18,y:0},b:{el:'H',x:-18,y:-22}},
      {a:{el:'N',x:-18,y:0},b:{el:'H',x:-38,y:12}},
      {a:{el:'N',x:18,y:0}, b:{el:'H',x: 18,y:-22}},
      {a:{el:'N',x:18,y:0}, b:{el:'H',x: 38,y:12}}
    ], radius:12 },
  'H₂O₂': {
    atoms:[
      {el:'H',x:-38,y:0},{el:'O',x:-16,y:0},{el:'O',x:16,y:0},{el:'H',x:38,y:0}
    ],
    bonds:[
      {a:{el:'H',x:-38,y:0},b:{el:'O',x:-16,y:0}},
      {a:{el:'O',x:-16,y:0},b:{el:'O',x:16,y:0}},
      {a:{el:'O',x:16,y:0}, b:{el:'H',x:38,y:0}}
    ], radius:12 },
  'CS₂': {
    atoms:[{el:'S',x:-38,y:0},{el:'C',x:0,y:0},{el:'S',x:38,y:0}],
    bonds:[
      {a:{el:'S',x:-38,y:0},b:{el:'C',x:0,y:0},double:true},
      {a:{el:'C',x:0,y:0},  b:{el:'S',x:38,y:0},double:true}
    ], radius:13 },
  'SO₃': {
    atoms:[
      {el:'S',x:0,  y:0},
      {el:'O',x:0,  y:-36},
      {el:'O',x:31, y:18},
      {el:'O',x:-31,y:18}
    ],
    bonds:[
      {a:{el:'S',x:0,y:0},b:{el:'O',x:0,  y:-36},double:true},
      {a:{el:'S',x:0,y:0},b:{el:'O',x:31, y:18 },double:true},
      {a:{el:'S',x:0,y:0},b:{el:'O',x:-31,y:18 },double:true}
    ], radius:12 },
  'Cu':  { atoms:[{el:'Cu',x:0,y:0}], bonds:[], radius:14 },
  'CuO': { atoms:[{el:'Cu',x:-13,y:0},{el:'O',x:13,y:0}],
           bonds:[], radius:13 },
  'NO₂': {
    atoms:[{el:'O',x:-38,y:0},{el:'N',x:0,y:0},{el:'O',x:38,y:0}],
    bonds:[
      {a:{el:'O',x:-38,y:0},b:{el:'N',x:0,y:0},double:true},
      {a:{el:'N',x:0,y:0},  b:{el:'O',x:38,y:0},double:true}
    ], radius:12 },
  'Si':   { atoms:[{el:'Si',x:0,y:0}], bonds:[], radius:14 },
  'SiO₂': {
    atoms:[{el:'O',x:-38,y:0},{el:'Si',x:0,y:0},{el:'O',x:38,y:0}],
    bonds:[
      {a:{el:'O',x:-38,y:0},b:{el:'Si',x:0,y:0},double:true},
      {a:{el:'Si',x:0,y:0}, b:{el:'O',x:38,y:0},double:true}
    ], radius:13 },
  'FeS₂': {
    atoms:[{el:'S',x:-24,y:0},{el:'Fe',x:0,y:0},{el:'S',x:24,y:0}],
    bonds:[
      {a:{el:'S',x:-24,y:0},b:{el:'Fe',x:0,y:0},double:true},
      {a:{el:'Fe',x:0,y:0}, b:{el:'S',x:24,y:0},double:true}
    ], radius:13 },
  'C₂H₅Cl': {
    atoms:[
      {el:'C', x:-22, y:  0},
      {el:'C', x: 22, y:  0},
      {el:'H', x:-22, y:-26},
      {el:'H', x:-22, y: 26},
      {el:'H', x:-48, y:  0},
      {el:'H', x: 22, y:-26},
      {el:'H', x: 22, y: 26},
      {el:'Cl',x: 52, y:  0}
    ],
    bonds:[
      {a:{el:'C',x:-22,y:0},b:{el:'C',x: 22,y:0}},
      {a:{el:'C',x:-22,y:0},b:{el:'H',x:-22,y:-26}},
      {a:{el:'C',x:-22,y:0},b:{el:'H',x:-22,y: 26}},
      {a:{el:'C',x:-22,y:0},b:{el:'H',x:-48,y:  0}},
      {a:{el:'C',x: 22,y:0},b:{el:'H',x: 22,y:-26}},
      {a:{el:'C',x: 22,y:0},b:{el:'H',x: 22,y: 26}},
      {a:{el:'C',x: 22,y:0},b:{el:'Cl',x:52,y:  0}}
    ], radius:13 },
  'C₃H₈': {
    atoms:[
      {el:'C', x:-44, y:  0},
      {el:'C', x:  0, y:  0},
      {el:'C', x: 44, y:  0},
      {el:'H', x:-44, y:-26},
      {el:'H', x:-44, y: 26},
      {el:'H', x:-70, y:  0},
      {el:'H', x:  0, y:-26},
      {el:'H', x:  0, y: 26},
      {el:'H', x: 44, y:-26},
      {el:'H', x: 44, y: 26},
      {el:'H', x: 70, y:  0}
    ],
    bonds:[
      {a:{el:'C',x:-44,y:0},b:{el:'C',x:  0,y:0}},
      {a:{el:'C',x:  0,y:0},b:{el:'C',x: 44,y:0}},
      {a:{el:'C',x:-44,y:0},b:{el:'H',x:-44,y:-26}},
      {a:{el:'C',x:-44,y:0},b:{el:'H',x:-44,y: 26}},
      {a:{el:'C',x:-44,y:0},b:{el:'H',x:-70,y:  0}},
      {a:{el:'C',x:  0,y:0},b:{el:'H',x:  0,y:-26}},
      {a:{el:'C',x:  0,y:0},b:{el:'H',x:  0,y: 26}},
      {a:{el:'C',x: 44,y:0},b:{el:'H',x: 44,y:-26}},
      {a:{el:'C',x: 44,y:0},b:{el:'H',x: 44,y: 26}},
      {a:{el:'C',x: 44,y:0},b:{el:'H',x: 70,y:  0}}
    ], radius:12 },
};

const ATOM_COLORS = { H:'#ffffff', C:'#404040', O:'#cc2200', N:'#2a6aaa', S:'#c8a020', Cl:'#1a7a1a', Fe:'#e07020', Mg:'#8840cc', Al:'#1a3a8a', Zn:'#808080', Sn:'#909090', F:'#20a080', P:'#e06010', Si:'#4a7a40', Cu:'#b87333' };
const ATOM_BORDER = { H:'#999',    C:'#222',    O:'#881500', N:'#1a4a7a', S:'#8a6010', Cl:'#0d4d0d', Fe:'#a04010', Mg:'#5a2090', Al:'#0d2060', Zn:'#505050', Sn:'#606060', F:'#107050', P:'#904000', Si:'#2a5020', Cu:'#7a4a10' };

/* Couleurs colonnes */
const COL_BG_REACTIF  = '#e8f0fb';
const COL_BG_PRODUIT  = '#e8f5ee';
const COL_BG_INACTIVE = '#f0ede8';
const COL_BG_MID      = '#ede8e0';
const COL_BORDER_MID  = '#ccc4bc';

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTES DE MISE EN PAGE
   Toujours 4 colonnes : 2 réactifs + 2 produits
══════════════════════════════════════════════════════════════════════════ */
const N_COLS     = 4;
const N_REACTIFS = 2;
const N_PRODUITS = 2;

/* Fractions de la hauteur du canvas pour la zone de transition (mode équilibrage) */
const FRAC_MID_W      = 0.55;
const FRAC_MID_H_EQ   = 0.23;

/* Taille minimale des molécules (scale plancher) en mode limitant */
const MIN_MOL_SC = 0.5;
