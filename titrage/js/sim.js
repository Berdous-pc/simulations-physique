/* ══════════════════════════════════════════════════════════════════════════
   Simulation pédagogique — Physique-Chimie Lycée
   Auteur  : Mathieu Berdous
   Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   SIM.JS — État global, canvas, géométrie, layout, rendu molécules (cercles)
   Dépend de : data.js
   Expose : state, molCanvas, molCtx,
            invalidateGeomCache, getColRects, getCanvasCellRect,
            resizeCanvas, resizeCanvasDuringAnim, fixCanvasRowHeight, fixAndRedraw,
            computeLayout, drawBackground, drawMolCircle, drawStatic, redraw,
            lerp, easeInOut, roundRect,
            scaleForCircles, gridPositionsCircles
══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   ÉTAT GLOBAL
══════════════════════════════════════════════════════════════════════════ */
const state = {
  onglet: 'principe',        // 'principe' | 'titrage'
  rxnIdx: 0,                 // index dans TITRAGE_REACTIONS
  niTitre: 10,               // quantité initiale de réactif titré (mol)
  avancement: 0,             // avancement actuel (mol)

  /* Quantités courantes */
  nTitrant: 30,              // molécules titrant actuellement dans la case titrant
  nTitreRestant: 10,         // réactif titré restant
  nProdC: 0,                 // produit C formé
  nProdD: 0,                 // produit D formé
  nExces: 0,                 // titrant en excès (après équivalence)

  /* Totaux injectés */
  nTitrantInjecte: 0,        // total injecté depuis le début

  /* Animation en cours */
  anim: null,                // objet animation RAF

  /* Dernière frame rendue (pour resize) */
  lastFrame: null,

  /* UI */
  showCoeffOne: false,
  comparaisonMode: 0,        // 0=Non, 1=brute, 2=avec coeffs
  predictionMode: false,

  _needRelayoutAfterAnim: false,

  /* ── Mode Titrage ── */
  // Paramètres
  titrageType:         'colorimetrique',  // 'colorimetrique' | 'phmetrique' | 'conductimetrique'
  titrageRxnModeIdx:    0,    // index dans TITRAGE_MODE_REACTIONS (indépendant du mode Principe)
  titrageV1:           20,    // volume solution titrée (mL), défaut 20
  titrageVeau:          0,    // volume eau ajoutée (mL)
  titrageConcTitrante:  0.1,  // concentration titrante (mol/L)
  titrageConcTitree:    0.1,  // concentration titrée (mol/L)
  // État dynamique
  titrageVverse:        0,    // volume titrant versé depuis début (mL)
  titrageBecherNominal: 100,  // volume nominal bécher choisi (mL), recalculé à chaque reinit
  titrageAmidon:        false, // empois d'amidon actif (indicateur coloré pour diiode)
  titrageIndicateur:    null,  // index dans INDICATEURS_COLORES, ou null (aucun)

  // ── Mode pH-métrique ──
  titragePhRxnIdx:    0,      // index dans TITRAGE_PH_REACTIONS
  titrageShowGraphPH: true,   // graphe pH=f(V) actif par défaut en mode pH
  titrageShowGraphN:  false,  // graphe n=f(V) actif/inactif (commun aux deux modes)
  // Le graphe pH=f(V) n'accumule plus de points : il est ré-échantillonné densément
  // à chaque dessin via _samplePhCurve (cf. graph.js).

  // ── Mode conductimétrique ──
  titrageCondRxnIdx:     0,    // index dans TITRAGE_COND_REACTIONS
  titrageShowGraphSigma: true, // graphe σ=f(V) actif par défaut en mode conducti

  // ── Pas d'acquisition expérimental (modes pH-métrique & conductimétrique) ──
  // Les graphes pH=f(V) et σ=f(V) affichent une **série de points discrets**
  // (croix), comme en TP réel : un point est créé à chaque multiple exact du
  // pas franchi par le volume versé, quelle que soit la source (boutons,
  // robinet, vidage auto). La courbe théorique reste utilisée *en interne*
  // (par les outils dérivée, tangentes, réticule) mais n'est plus tracée.
  // Valeurs autorisées : 0.1 / 0.5 / 1.0 / 2.0 mL.
  titragePasAcquisition: 1.0,

  // ── Mode "représentation des espèces chimiques" (commun aux trois sous-modes) ──
  // Quand actif, des sphères colorées sont animées dans la burette et le bécher
  // pour représenter les espèces présentes dans le milieu réactionnel.
  // Le rendu et l'animation sont entièrement gérés dans ui.js (section ESPÈCES).
  titrageShowEspeces:     false,
  titrageZoomBecher:      false,
  // Map { id: boolean } — visibilité individuelle par espèce (légende, checkboxes).
  // Reconstruit à chaque changement de réaction par _initEspeces().
  titrageEspecesVisible:  {},
};

/* ══════════════════════════════════════════════════════════════════════════
   MOTEUR pH — équilibres acide-base en solution aqueuse
   Résolution rigoureuse par bisection sur log₁₀[H⁺] de l'équation
   d'électroneutralité, en tenant compte de :
     - l'autoprotolyse de l'eau   ([H⁺]·[OH⁻] = Ke = 10⁻¹⁴)
     - la dissociation de l'acide (Ka pour acide faible, totale pour fort)
     - la dilution par la solution titrante et l'eau ajoutée
   Prend en charge quatre cas :
     - acide_fort   : HCl titré par NaOH
     - acide_faible : AH titré par NaOH
     - base_forte   : NaOH titré par HCl
     - base_faible  : B titrée par HCl
══════════════════════════════════════════════════════════════════════════ */
const PH_KE = 1e-14;   // produit ionique de l'eau à 25 °C

/**
 * Calcule le pH d'un mélange acide-base à 25 °C.
 * Résout par bisection (en log₁₀[H⁺]) l'équation d'électroneutralité.
 *
 * Pour acide_fort / acide_faible (acide titré par NaOH) :
 *   [H⁺] - Ke/[H⁺] + Cb0 - [A⁻] = 0
 *   [A⁻] = Ca0 (fort) ou Ca0·Ka/(Ka+[H⁺]) (faible)
 *
 * Pour base_forte (NaOH titré par HCl) :
 *   [H⁺] - Ke/[H⁺] + Ca0 - Cb0 = 0
 *   où Ca0 = [HCl] ajouté, Cb0 = [NaOH] initial restant
 *
 * Pour base_faible (B titrée par HCl) :
 *   [H⁺] - Ke/[H⁺] + [BH⁺] - Ca0 = 0
 *   [BH⁺] = Cb0 · [H⁺] / (Ka + [H⁺])   avec Ka du couple BH⁺/B
 *
 * @param {Object} params
 *   - typeTitre : 'acide_fort' | 'acide_faible' | 'base_forte' | 'base_faible'
 *   - pKa       : pKa du couple AH/A⁻ (acide faible) ou BH⁺/B (base faible)
 *   - Ca        : concentration de la solution acide (mol/L)  — ou titrante si base titrée
 *   - Va        : volume de la solution acide (mL)            — ou V1 si base titrée
 *   - Cb        : concentration de la solution NaOH (mol/L)  — ou titrante HCl si base titrée
 *   - Vb        : volume de NaOH versé (mL)                  — ou volume HCl versé
 *   - Veau      : volume d'eau distillée ajouté (mL)
 * @returns {number} pH (entre 0 et 14)
 */
function calcPH(params) {
  const { typeTitre, pKa, Ca, Va, Cb, Vb, Veau } = params;
  const Vtot = (Va + Vb + (Veau || 0)) / 1000; // L
  if (Vtot <= 0) return 7;

  const Ka  = (typeTitre === 'acide_faible' || typeTitre === 'base_faible')
              ? Math.pow(10, -pKa) : Infinity;

  // Concentrations analytiques dans le mélange
  // Convention : Ca/Va = solution dans le bécher (titrée), Cb/Vb = solution versée (titrante)
  const Ca0 = (Ca * Va / 1000) / Vtot;   // mol/L dans le mélange
  const Cb0 = (Cb * Vb / 1000) / Vtot;

  // Fonction d'électroneutralité selon le type
  function f(h) {
    const oh = PH_KE / h;
    switch (typeTitre) {
      case 'acide_fort':
        // [Cl⁻] = Ca0, [Na⁺] = Cb0  →  h - oh + Cb0 - Ca0 = 0
        return h - oh + Cb0 - Ca0;
      case 'acide_faible':
        // [A⁻] = Ca0·Ka/(Ka+h), [Na⁺] = Cb0
        return h - oh + Cb0 - Ca0 * Ka / (Ka + h);
      case 'base_forte':
        // NaOH (Cb/Vb = bécher) titré par HCl (Ca/Va = burette)
        // Électroneutralité : [H⁺] + [Na⁺] = [OH⁻] + [Cl⁻]
        //   h + Cb0 = oh + Ca0  →  h - oh + Cb0 - Ca0 = 0
        return h - oh + Cb0 - Ca0;
      case 'base_faible':
        // B (Cb/Vb = bécher) titrée par HCl (Ca/Va = burette)
        // [BH⁺] = Cb0·h/(Ka+h), [Cl⁻] = Ca0
        // Charge : [H⁺] + [BH⁺] = [OH⁻] + [Cl⁻]
        // → h + Cb0·h/(Ka+h) - oh - Ca0 = 0
        return h + Cb0 * h / (Ka + h) - oh - Ca0;
      default:
        return h - oh + Cb0 - Ca0;
    }
  }

  // Bisection sur log10(h) ∈ [-14, 0]  → h ∈ [1e-14, 1]
  let lo = -14, hi = 0;
  let fLo = f(Math.pow(10, lo));
  let fHi = f(Math.pow(10, hi));
  // Si pas de changement de signe (cas dégénéré rarissime) → fallback
  if (fLo * fHi > 0) {
    return 7;
  }
  for (let i = 0; i < 80; i++) {
    const mid  = (lo + hi) / 2;
    const fMid = f(Math.pow(10, mid));
    if (fMid === 0 || (hi - lo) < 1e-6) { lo = hi = mid; break; }
    if (fLo * fMid < 0) { hi = mid; fHi = fMid; }
    else                { lo = mid; fLo = fMid; }
  }
  const pH = -((lo + hi) / 2);
  // Garde-fous numériques
  return Math.max(0, Math.min(14, pH));
}

/**
 * Calcule le pH courant dans le bécher d'après l'état du titrage.
 * Lit state.titragePhRxnIdx, state.titrageConcTitree, state.titrageConcTitrante,
 * state.titrageV1, state.titrageVeau, state.titrageVverse.
 *
 * Convention pour bases titrées par HCl :
 *   - Ca / Va = HCl (versé depuis la burette) → Ca = titrageConcTitrante, Va = titrageVverse
 *   - Cb / Vb = base (dans le bécher)          → Cb = titrageConcTitree,  Vb = titrageV1
 * Pour les acides titrés par NaOH, la convention reste identique à avant.
 *
 * @returns {number} pH ou null si le mode pH n'est pas applicable.
 */
function calcCurrentPH() {
  const entry = TITRAGE_PH_REACTIONS[state.titragePhRxnIdx || 0];
  if (!entry) return null;
  const type = entry.titre.type;
  if (type === 'base_forte' || type === 'base_faible') {
    // Base dans le bécher, HCl versé depuis la burette
    return calcPH({
      typeTitre: type,
      pKa:       entry.titre.pKa,
      Ca:        state.titrageConcTitrante,  // HCl concentr. titrante
      Va:        state.titrageVverse,         // volume HCl versé
      Cb:        state.titrageConcTitree,     // base concentr. titrée
      Vb:        state.titrageV1,             // volume base initial
      Veau:      state.titrageVeau,
    });
  }
  // Acide dans le bécher, NaOH versé
  return calcPH({
    typeTitre: type,
    pKa:       entry.titre.pKa,
    Ca:        state.titrageConcTitree,
    Va:        state.titrageV1,
    Cb:        state.titrageConcTitrante,
    Vb:        state.titrageVverse,
    Veau:      state.titrageVeau,
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   MOTEUR CONDUCTIMÉTRIQUE — loi de Kohlrausch
   σ = Σᵢ λᵢ · [Xᵢ]   (S/m, avec λ en S·m²/mol et [X] en mol/m³)

   Pour HCl titré par NaOH, les espèces conductrices sont :
     • H₃O⁺   (apporté par HCl, consommé par HO⁻)
     • Cl⁻    (spectateur, apporté par HCl)
     • Na⁺    (spectateur, apporté par NaOH)
     • HO⁻    (apporté par NaOH après l'équivalence)

   On obtient [H₃O⁺] et [HO⁻] à partir du pH calculé rigoureusement par
   `calcPH` (incluant l'autoprotolyse de l'eau, ce qui assure un profil
   continu et physiquement correct autour de l'équivalence).
   Les spectateurs sont obtenus par bilan de matière : [Cl⁻] = Ca·V1/Vtot
   et [Na⁺] = Cb·Vb/Vtot.

   La dilution est prise en compte dans Vtot = V1 + Veau + Vb.
══════════════════════════════════════════════════════════════════════════ */

/**
 * Calcule la conductivité d'un mélange.
 * @param {Object} params  — même convention que calcPH :
 *   Pour acides (titrés par NaOH) : Ca/Va = bécher, Cb/Vb = burette
 *   Pour bases  (titrées par HCl) : Ca/Va = burette (HCl), Cb/Vb = bécher (base)
 *   Pour précipitations            : Ca/Va = bécher (titré), Cb/Vb = versé (titrant)
 * @param {Object} entry   entrée du tableau TITRAGE_COND_REACTIONS
 * @returns {number} σ en mS/cm
 */
function calcSigma(params, entry) {
  const { Ca, Va, Cb, Vb, Veau } = params;
  const Vtot = (Va + Vb + (Veau || 0)) / 1000; // L
  if (Vtot <= 0) return 0;

  const type = (entry.titre || {}).type || '';
  const cMol = {};

  if (type === 'precipitation') {
    // ── Précipitation ──────────────────────────────────────────────────
    // Pas de calcul pH. On raisonne uniquement par bilan de matière.
    // - nTitree    = Ca · Va / 1000  (mol de l'espèce titrée)
    // - nTitrant   = Cb · Vb / 1000  (mol de l'espèce titrante versée)
    // - stœchio : 1 mol titré ↔ (entry.coeffTitrante / entry.coeffTitree) mol titrant
    const coeffTitree   = entry.coeffTitree   || 1;
    const coeffTitrante = entry.coeffTitrante || 1;
    const nTitree   = Ca * Va / 1000;   // mol
    const nTitrant  = Cb * Vb / 1000;   // mol
    // Avancement maximal limité par le réactif en défaut
    const xiMax     = nTitree / coeffTitree;
    const xiTitrant = nTitrant / coeffTitrante;
    const xi        = Math.min(xiMax, xiTitrant);
    // Concentration de l'espèce titrée restante en mol/L
    const cTitreeRestant = Math.max(0, (nTitree - xi * coeffTitree)) / Vtot;
    // Concentration de l'espèce titrante en excès en mol/L
    const cTitrantExces  = Math.max(0, (nTitrant - xi * coeffTitrante)) / Vtot;

    // Ajouter les espèces consommables (titrée et titrante) si elles ont λ
    const especeTitree   = (entry.especes || []).find(e => e.role === 'titree');
    const especeTitrante = (entry.especes || []).find(e => e.role === 'titrante');
    if (especeTitree   && LAMBDA_IONIQUE[especeTitree.id]   != null)
      cMol[especeTitree.id]   = (cMol[especeTitree.id]   || 0) + cTitreeRestant;
    if (especeTitrante && LAMBDA_IONIQUE[especeTitrante.id] != null)
      cMol[especeTitrante.id] = (cMol[especeTitrante.id] || 0) + cTitrantExces;

    // Spectateurs : bilan de matière
    (entry.especes || []).forEach(e => {
      if (e.role !== 'spectateur') return;
      const cTitreeCoeff   = e.coeffTitree   != null ? e.coeffTitree   : 0;
      const cTitranteCoeff = e.coeffTitrant  != null ? e.coeffTitrant  : 0;
      const n = cTitreeCoeff * Ca * Va / 1000 + cTitranteCoeff * Cb * Vb / 1000;
      cMol[e.id] = (cMol[e.id] || 0) + n / Vtot;
    });

  } else {
    // ── Acide-base (y compris base_forte, base_faible) ─────────────────
    // pH → [H₃O⁺] et [HO⁻] en mol/L (résolution rigoureuse)
    const pH = calcPH(params);
    const cH  = Math.pow(10, -pH);
    const cOH = PH_KE / cH;
    cMol['H₃O⁺'] = cH;
    cMol['HO⁻']  = cOH;

    // Pour les bases (Ca = [HCl] versé, Cb = [base] dans bécher) :
    // les spectateurs utilisent Ca/Va pour la titrante et Cb/Vb pour la titrée.
    // La structure de entry.especes est identique mais les rôles pointent vers
    // la bonne solution : coeffTitree → espèce dans le bécher (Cb/Vb),
    //                    coeffTitrant → espèce dans la burette (Ca/Va).
    // Pour les acides : Ca/Va = bécher, Cb/Vb = burette (convention historique).
    // Pour les bases  : Ca/Va = burette (HCl), Cb/Vb = bécher (base) → même formule !
    // La convention est donc : coeffTitree × [bécher] + coeffTitrant × [burette]
    // Avec les acides : bécher=Ca/Va, burette=Cb/Vb  → n = cTitree×Ca×Va + cTitrante×Cb×Vb
    // Avec les bases  : bécher=Cb/Vb, burette=Ca/Va  → on inverse Ca/Va et Cb/Vb
    // => On détecte le type et on applique les bons volumes.
    const isBase = (type === 'base_forte' || type === 'base_faible');
    (entry.especes || []).forEach(e => {
      if (e.role !== 'spectateur') return;
      const cBecherCoeff   = e.coeffTitree   != null ? e.coeffTitree   : 0;
      const cBuretteCoeff  = e.coeffTitrant  != null ? e.coeffTitrant  : 0;
      let nBecher, nBurette;
      if (isBase) {
        // bécher = Cb/Vb (base), burette = Ca/Va (HCl)
        nBecher  = cBecherCoeff  * Cb * Vb / 1000;
        nBurette = cBuretteCoeff * Ca * Va / 1000;
      } else {
        // bécher = Ca/Va (acide), burette = Cb/Vb (NaOH)
        nBecher  = cBecherCoeff  * Ca * Va / 1000;
        nBurette = cBuretteCoeff * Cb * Vb / 1000;
      }
      cMol[e.id] = (cMol[e.id] || 0) + (nBecher + nBurette) / Vtot;

      // Pour les acides faibles/bases faibles, ajouter les produits de réaction
      // (CH₃COO⁻, F⁻, NH₄⁺…) qui ne sont pas dans les spectateurs mais ont un λ.
      // Ils sont traités via calcPH implicitement dans [H₃O⁺]/[HO⁻], mais leurs
      // concentrations directes sont calculées par bilan de matière.
    });

    // Espèces produites (produits de la réaction acide-base) — bilan de matière
    // L'avancement est min(nTitree, nTitrant/stoech)
    const especeTitree   = (entry.especes || []).find(e => e.role === 'titree');
    const especeTitrante = (entry.especes || []).find(e => e.role === 'titrante');
    const especeProduits = (entry.especes || []).filter(e => e.role === 'produit');
    if (especeTitree && especeTitrante && especeProduits.length > 0) {
      const coeffTitree2   = especeTitree.coeff   || 1;
      const coeffTitrante2 = especeTitrante.coeff || 1;
      let nTitree, nTitrant;
      if (isBase) {
        nTitree  = Cb * Vb / 1000;  // mol base initiale dans bécher
        nTitrant = Ca * Va / 1000;  // mol HCl versé
      } else {
        nTitree  = Ca * Va / 1000;
        nTitrant = Cb * Vb / 1000;
      }
      const xiMax     = nTitree  / coeffTitree2;
      const xiTitrant = nTitrant / coeffTitrante2;
      const xi        = Math.min(xiMax, xiTitrant);
      especeProduits.forEach(ep => {
        if (LAMBDA_IONIQUE[ep.id] == null) return;
        const nProduit = xi * (ep.coeff || 1);
        cMol[ep.id] = (cMol[ep.id] || 0) + nProduit / Vtot;
      });
    }
  }

  // Loi de Kohlrausch : σ(S/m) = Σ λᵢ(S·m²/mol) × cᵢ(mol/m³)
  // cᵢ(mol/m³) = 1000 × cᵢ(mol/L)
  let sigmaSm = 0;
  for (const id in cMol) {
    const lambda = LAMBDA_IONIQUE[id];
    if (lambda == null) continue;
    sigmaSm += lambda * cMol[id] * 1000;
  }
  // Conversion S/m → mS/cm : 1 S/m = 10 mS/cm
  return sigmaSm * 10;
}

/**
 * Calcule la conductivité courante (mS/cm) dans le bécher d'après l'état
 * du titrage. Renvoie null hors mode conductimétrique.
 */
function calcCurrentSigma() {
  const entry = TITRAGE_COND_REACTIONS[state.titrageCondRxnIdx || 0];
  if (!entry) return null;
  const type = (entry.titre || {}).type || '';
  const isBase = (type === 'base_forte' || type === 'base_faible');
  if (type === 'precipitation') {
    return calcSigma({
      typeTitre: type,
      pKa:       entry.titre.pKa,
      Ca:        state.titrageConcTitree,
      Va:        state.titrageV1,
      Cb:        state.titrageConcTitrante,
      Vb:        state.titrageVverse,
      Veau:      state.titrageVeau,
    }, entry);
  }
  if (isBase) {
    return calcSigma({
      typeTitre: type,
      pKa:       entry.titre.pKa,
      Ca:        state.titrageConcTitrante,  // HCl (burette)
      Va:        state.titrageVverse,
      Cb:        state.titrageConcTitree,    // base (bécher)
      Vb:        state.titrageV1,
      Veau:      state.titrageVeau,
    }, entry);
  }
  return calcSigma({
    typeTitre: type,
    pKa:       entry.titre.pKa,
    Ca:        state.titrageConcTitree,
    Va:        state.titrageV1,
    Cb:        state.titrageConcTitrante,
    Vb:        state.titrageVverse,
    Veau:      state.titrageVeau,
  }, entry);
}

/**
 * Calcule la conductivité à un volume Vb arbitraire (mL) sans modifier l'état.
 * Utilisé pour l'échantillonnage du graphe σ = f(V).
 */
function calcSigmaAtVolume(vVerse) {
  const entry = TITRAGE_COND_REACTIONS[state.titrageCondRxnIdx || 0];
  if (!entry) return 0;
  const type = (entry.titre || {}).type || '';
  const isBase = (type === 'base_forte' || type === 'base_faible');
  if (type === 'precipitation') {
    return calcSigma({
      typeTitre: type,
      pKa:       entry.titre.pKa,
      Ca:        state.titrageConcTitree,
      Va:        state.titrageV1,
      Cb:        state.titrageConcTitrante,
      Vb:        vVerse,
      Veau:      state.titrageVeau,
    }, entry);
  }
  if (isBase) {
    return calcSigma({
      typeTitre: type,
      pKa:       entry.titre.pKa,
      Ca:        state.titrageConcTitrante,
      Va:        vVerse,
      Cb:        state.titrageConcTitree,
      Vb:        state.titrageV1,
      Veau:      state.titrageVeau,
    }, entry);
  }
  return calcSigma({
    typeTitre: type,
    pKa:       entry.titre.pKa,
    Ca:        state.titrageConcTitree,
    Va:        state.titrageV1,
    Cb:        state.titrageConcTitrante,
    Vb:        vVerse,
    Veau:      state.titrageVeau,
  }, entry);
}

/* ══════════════════════════════════════════════════════════════════════════
   CANVAS
══════════════════════════════════════════════════════════════════════════ */
const molCanvas = document.getElementById('mol-canvas');
const molCtx    = molCanvas.getContext('2d');

function resizeCanvas() {
  const wrap = document.getElementById('canvas-and-table');
  const newW = wrap.clientWidth;
  const h    = parseInt(wrap.style.height, 10);
  const newH = (h > 0 ? h : wrap.offsetHeight) || wrap.clientHeight;
  let changed = false;
  if (molCanvas.width  !== newW) { molCanvas.width  = newW; changed = true; }
  if (molCanvas.height !== newH) { molCanvas.height = newH; changed = true; }
  if (changed) invalidateGeomCache();
  if (changed && !state.anim && !state._skipAutoRedraw) redraw();
}

function resizeCanvasDuringAnim() {
  const wrap = document.getElementById('canvas-and-table');
  const newW = wrap.clientWidth;
  const h    = parseInt(wrap.style.height, 10);
  const newH = (h > 0 ? h : wrap.offsetHeight) || wrap.clientHeight;
  if (molCanvas.width  !== newW) molCanvas.width  = newW;
  if (molCanvas.height !== newH) molCanvas.height = newH;
}

function fixAndRedraw() {
  fixCanvasRowHeight();
  const before = { w: molCanvas.width, h: molCanvas.height };
  resizeCanvas();
  if (molCanvas.width === before.w && molCanvas.height === before.h) redraw();
}

/* ══════════════════════════════════════════════════════════════════════════
   GESTION RESIZE — un seul point d'entrée, avec debounce
══════════════════════════════════════════════════════════════════════════ */
let _resizeTimer = null;

function _onResize() {
  // Séquence correcte : hauteur → canvas → géométrie → positions fixes → masque → redraw
  fixCanvasRowHeight();
  invalidateGeomCache();
  resizeCanvas();           // met à jour molCanvas.width/height
  invalidateGeomCache();    // invalider après resize canvas
  initFixedPositions();     // recalcule grilles titrant/titré avec nouvelle géométrie
  if (typeof updateTitreMask === 'function') updateTitreMask();
  if (!state.anim) redraw();
  // Repositionner les éléments flottants du mode titrage
  if (state.onglet === 'titrage') {
    if (typeof _updateLabelVolume   === 'function') _updateLabelVolume();
    if (typeof _updateBtnsPosition  === 'function') _updateBtnsPosition();
  }
}

function _scheduleResize() {
  if (state.anim) {
    // Pendant une animation : resize canvas immédiatement, relayout différé
    fixCanvasRowHeight();
    resizeCanvasDuringAnim();
    invalidateGeomCache();
    state._needRelayoutAfterAnim = true;
    return;
  }
  // Debounce : attendre 30ms d'inactivité avant de recalculer
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    requestAnimationFrame(_onResize);
  }, 30);
}

window.addEventListener('resize', _scheduleResize);

if (typeof ResizeObserver !== 'undefined') {
  const wrap = document.getElementById('canvas-and-table');
  if (wrap) {
    const ro = new ResizeObserver(_scheduleResize);
    ro.observe(wrap);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   CACHE DE GÉOMÉTRIE
══════════════════════════════════════════════════════════════════════════ */
let _geomCache = null;

function invalidateGeomCache() { _geomCache = null; }

function _computeGeomCache() {
  const cr  = molCanvas.getBoundingClientRect();
  const ths = Array.from(document.querySelectorAll('#thead-row th'));
  if (ths.length === 0) return null;

  const rects = [];
  let chainedRight = null;
  ths.forEach(th => {
    const r = th.getBoundingClientRect();
    const realLeft  = r.left  - cr.left;
    const realRight = r.right - cr.left;
    const x0 = chainedRight !== null ? chainedRight : Math.round(realLeft);
    const x1 = Math.round(realRight);
    chainedRight = x1;
    rects.push({ x0, w: x1 - x0, cls: th.className });
  });

  const cell = document.getElementById('canvas-cell');
  let cellRect = null;
  if (cell) {
    const r = cell.getBoundingClientRect();
    cellRect = {
      x0: Math.round(r.left - cr.left),
      y0: Math.round(r.top  - cr.top),
      w:  Math.round(r.width),
      h:  Math.round(r.height),
    };
  }

  return { rects, cellRect, canvasW: molCanvas.width, canvasH: molCanvas.height };
}

function _ensureGeomCache() {
  if (_geomCache && _geomCache.canvasW === molCanvas.width
                 && _geomCache.canvasH === molCanvas.height) return _geomCache;
  _geomCache = _computeGeomCache();
  return _geomCache;
}

function getColRects() {
  const g = _ensureGeomCache();
  return g ? g.rects : [];
}

function getCanvasCellRect() {
  const g = _ensureGeomCache();
  return g ? g.cellRect : null;
}

/* ══════════════════════════════════════════════════════════════════════════
   HAUTEUR CANVAS
══════════════════════════════════════════════════════════════════════════ */
function fixCanvasRowHeight() {
  const wrap  = document.getElementById('canvas-and-table');
  const cell  = document.getElementById('canvas-cell');
  const thead = document.getElementById('table-thead');
  const tfoot = document.getElementById('table-tfoot');
  if (!wrap || !cell) return;

  const tableTargetH = Math.round(window.innerHeight * 0.60);
  const theadH = thead ? thead.getBoundingClientRect().height : 0;
  let tfootH = 0;
  if (tfoot && tfoot.style.display !== 'none') tfootH = tfoot.getBoundingClientRect().height;
  const fixedH = theadH + tfootH;

  const MIN_CANVAS_CELL = Math.max(140, Math.round(window.innerHeight * 0.20));
  const canvasCellH = Math.max(MIN_CANVAS_CELL, tableTargetH - fixedH);
  cell.style.height = canvasCellH + 'px';
  wrap.style.height = (tableTargetH + 20) + 'px';
  invalidateGeomCache();
}

/* ══════════════════════════════════════════════════════════════════════════
   CALCUL DES POSITIONS — CERCLES
   Chaque "molécule" est un cercle de rayon r.
   On calcule la grille de cercles dans la zone disponible.
══════════════════════════════════════════════════════════════════════════ */

/**
 * Trouve le plus grand rayon r tel que `count` cercles tiennent dans (w × h).
 * Le rayon minimum retourné est 6px.
 */
function scaleForCircles(count, w, h, pad) {
  pad = pad || 8;
  if (count <= 0) return MOL_RADIUS;
  const availW = w - pad * 2;
  const availH = h - pad * 2;
  for (let r = MOL_RADIUS * 2.5; r >= 6; r -= 0.5) {
    const cell = r * 2 + pad;
    if (cell > availW) continue;
    const cols = Math.max(1, Math.floor(availW / cell));
    const rows = Math.ceil(count / cols);
    if (rows * cell <= availH) return r;
  }
  // Fallback : on diminue encore
  const rW = (availW / 1) / 2;
  const rH = (availH / count) / 2;
  return Math.max(5, Math.min(rW, rH));
}

/**
 * Calcule les positions (cx, cy) d'une grille de cercles de rayon r dans (x0,y0,w,h).
 * Grille alignée en haut (espace laissé en bas).
 */
function gridPositionsCircles(count, x0, y0, w, h, r, pad, alignTop) {
  pad = pad || 8;
  if (count <= 0) return [];
  const cell = r * 2 + pad;
  const availW = w - pad * 2;
  const cols = Math.max(1, Math.floor(availW / cell));
  const rows = Math.ceil(count / cols);
  const gw   = Math.min(cols, count) * cell;
  const gh   = rows * cell;
  const ox   = x0 + pad + (availW - gw) / 2 + cell / 2;
  // alignTop = true : on colle en haut (laisse de la place en bas pour accueillir du nouveau)
  const oy   = alignTop
    ? y0 + pad + cell / 2
    : y0 + pad + (h - pad * 2 - gh) / 2 + cell / 2;
  const pos = [];
  for (let k = 0; k < count; k++) {
    pos.push({ cx: ox + (k % cols) * cell, cy: oy + Math.floor(k / cols) * cell });
  }
  return pos;
}

/* ══════════════════════════════════════════════════════════════════════════
   POSITIONS FIXES — calculées une fois, réutilisées à chaque frame
   Recalculées seulement au reset ou au resize.
══════════════════════════════════════════════════════════════════════════ */

/**
 * Calcule et stocke dans state les positions fixes des titrant et titré.
 * Appelé au reset et après un resize.
 * Retourne true si le calcul a réussi.
 */
function initFixedPositions() {
  const rects    = getColRects();
  const cellRect = getCanvasCellRect();
  if (!cellRect || rects.length === 0 || cellRect.h < 20) return false;

  const PAD = 8;
  const hasCls = (r, c) => r.cls && r.cls.split(' ').includes(c);
  const colTitrant = rects.find(r => hasCls(r, 'col-titrant'));
  const colTitre   = rects.find(r => hasCls(r, 'col-titre'));
  if (!colTitrant || !colTitre) return false;

  const y0 = cellRect.y0;
  const h  = cellRect.h;

  // Titrant : grille pour 30 molécules (capacité max), positions stables
  const rTitrant = scaleForCircles(30, colTitrant.w, h, PAD);
  state._posTitrant   = gridPositionsCircles(30, colTitrant.x0, y0, colTitrant.w, h, rTitrant, PAD, false);
  state._rTitrant     = rTitrant;

  // Titré : grille pour niTitre molécules, positions stables
  const hTitreTop = Math.round(h * 0.60);
  const rTitre    = scaleForCircles(state.niTitre, colTitre.w, hTitreTop, PAD);
  state._posTitreAll  = gridPositionsCircles(state.niTitre, colTitre.x0, y0, colTitre.w, hTitreTop, rTitre, PAD, false);
  state._rTitre       = rTitre;
  state._hTitreTop    = hTitreTop;
  state._hTitreBot    = h - hTitreTop;

  return true;
}


/**
 * Retourne un objet layout décrivant les zones de chaque colonne et les positions
 * des molécules en cours.
 * Structure layout :
 *   cols : [ { key, x0, w, y0, h, bg }, ... ]
 *   titrant : { x0, w, y0, h, r, positions[] }
 *   titre   : { x0, w, y0, h, r, positionsTop[], positionsBottom[] }
 *              positionsTop  = molécules titrées restantes (haut de case)
 *              positionsBottom = espace réservé (bas de case) pour titrant arrivant
 *   produit : { x0, w, y0, h, rProd, posC[], posD[], posExces[] }
 *              posC / posD   = produits C et D en haut (séparés par ligne médiane)
 *              posExces      = excès titrant en bas
 */
function computeLayout() {
  const rects   = getColRects();
  const cellRect = getCanvasCellRect();
  if (!cellRect || rects.length === 0) return null;
  if (cellRect.h < 20) return null;

  const rxn = TITRAGE_REACTIONS[state.rxnIdx];
  const PAD = 8;

  // Les rects correspondent aux colonnes du thead :
  // 0 = label, 1 = titrant, 2 = titre, 3 = produit
  // Si pas de colonne label (thead sans col-label), adapter
  const hasLabel = rects.some(r => r.cls && r.cls.split(' ').includes('col-label'));
  const hasCls = (r, c) => r.cls && r.cls.split(' ').includes(c);
  const colLabel   = hasLabel ? rects.find(r => hasCls(r, 'col-label'))   : null;
  const colTitrant = rects.find(r => hasCls(r, 'col-titrant'));
  const colTitre   = rects.find(r => hasCls(r, 'col-titre'));
  const colProduit = rects.find(r => hasCls(r, 'col-produit'));

  if (!colTitrant || !colTitre || !colProduit) return null;

  const y0 = cellRect.y0;
  const h  = cellRect.h;

  /* ── Titrant : utilise les positions fixes stockées ── */
  // Si pas encore initialisées (ou géométrie changée), initialiser maintenant
  if (!state._posTitrant || state._posTitrant.length === 0) initFixedPositions();
  const rTitrant   = state._rTitrant   || scaleForCircles(30, colTitrant.w, h, PAD);
  // Les `nTitrant` premières positions (les molécules restantes occupent le début de la grille)
  const posTitrant = (state._posTitrant || []).slice(0, state.nTitrant);

  /* ── Titré : utilise les positions fixes stockées ── */
  if (!state._posTitreAll || state._posTitreAll.length === 0) initFixedPositions();
  const hTitreTop  = state._hTitreTop  || Math.round(h * 0.60);
  const hTitreBot  = state._hTitreBot  || (h - hTitreTop);
  const rTitre     = state._rTitre     || scaleForCircles(state.niTitre, colTitre.w, hTitreTop, PAD);
  // Les `nTitreRestant` premières positions
  const posTitreTop = (state._posTitreAll || []).slice(0, state.nTitreRestant);

  /* ── Produits — case divisée en 2 lignes :
     - Ligne 1 (60% haut) : produits C et D (côte à côte, séparés par ligne centrale)
     - Ligne 2 (40% bas)  : excès de titrant
  ── */
  const hProdTop = Math.round(h * 0.60);
  const hProdBot = h - hProdTop;
  const halfW = Math.round(colProduit.w / 2);

  // Produits C (gauche) et D (droite)
  const maxC = state.nProdC + state.nProdD + 5; // on dimensionne sur max possible
  const rC = scaleForCircles(Math.max(1, Math.ceil(state.niTitre * rxn.produits[0].coeff / rxn.titre.coeff)), halfW, hProdTop, PAD);
  const rD = scaleForCircles(Math.max(1, Math.ceil(state.niTitre * rxn.produits[1].coeff / rxn.titre.coeff)), halfW, hProdTop, PAD);
  const rProd = Math.min(rC, rD);

  const posC = gridPositionsCircles(
    state.nProdC, colProduit.x0, y0, halfW, hProdTop, rProd, PAD, true
  );
  const posD = gridPositionsCircles(
    state.nProdD, colProduit.x0 + halfW, y0, halfW, hProdTop, rProd, PAD, true
  );

  // Excès (bas)
  const maxExces = Math.ceil(30 * rxn.titrant.coeff / rxn.titre.coeff) + 5;
  const rExces = scaleForCircles(Math.max(1, maxExces), colProduit.w, hProdBot, PAD);
  const posExces = gridPositionsCircles(
    state.nExces, colProduit.x0, y0 + hProdTop, colProduit.w, hProdBot, rExces, PAD, false
  );

  return {
    cellRect,
    titrant: { x0: colTitrant.x0, w: colTitrant.w, y0, h, r: rTitrant, positions: posTitrant },
    titre:   {
      x0: colTitre.x0, w: colTitre.w, y0, h,
      hTop: hTitreTop, hBot: hTitreBot,
      r: rTitre,
      positionsTop: posTitreTop,
      yBot: y0 + hTitreTop,   // ligne de démarcation
    },
    produit: {
      x0: colProduit.x0, w: colProduit.w, y0, h,
      hTop: hProdTop, hBot: hProdBot,
      halfW,
      rProd, rExces,
      posC, posD, posExces,
      ySep: y0 + hProdTop,   // ligne de démarcation haut/bas dans produits
      xSepProd: colProduit.x0 + halfW,  // séparateur C/D
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   RENDU FOND
══════════════════════════════════════════════════════════════════════════ */
function drawBackground(layout) {
  if (!layout) return;
  const ctx = molCtx;
  const { cellRect, titrant, titre, produit } = layout;
  const y0 = cellRect.y0, h = cellRect.h;

  // Fond titrant
  ctx.fillStyle = COL_BG_TITRANT;
  ctx.fillRect(titrant.x0, y0, titrant.w, h);

  // Fond titré
  ctx.fillStyle = COL_BG_TITRE;
  ctx.fillRect(titre.x0, y0, titre.w, h);

  // Fond produits haut (C+D) — vert
  ctx.fillStyle = COL_BG_PRODUIT;
  ctx.fillRect(produit.x0, y0, produit.w, produit.hTop);

  // Fond produits bas (excès) — même vert que le reste de la colonne
  ctx.fillStyle = COL_BG_PRODUIT;
  ctx.fillRect(produit.x0, produit.ySep, produit.w, produit.hBot);

  // Séparateur vertical titrant | titré
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(titre.x0, y0);
  ctx.lineTo(titre.x0, y0 + h);
  ctx.stroke();

  // Séparateur vertical titré | produit
  ctx.beginPath();
  ctx.moveTo(produit.x0, y0);
  ctx.lineTo(produit.x0, y0 + h);
  ctx.stroke();
  ctx.restore();

  // Séparateur interne produits : C | D (ligne verticale légère)
  ctx.save();
  ctx.strokeStyle = '#a0c0a8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(produit.xSepProd, y0 + 4);
  ctx.lineTo(produit.xSepProd, produit.ySep - 4);
  ctx.stroke();
  ctx.restore();

  // Séparateur horizontal produits haut / bas (pointillé léger)
  ctx.save();
  ctx.strokeStyle = '#90b89a';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(produit.x0 + 4, produit.ySep);
  ctx.lineTo(produit.x0 + produit.w - 4, produit.ySep);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Label discret "excès" dans la zone basse produit
  ctx.save();
  ctx.font = `bold ${Math.max(10, Math.round(h * 0.045))}px 'Segoe UI', Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#70a880';
  ctx.fillText('excès titrant', produit.x0 + produit.w / 2, y0 + h - 4);
  ctx.restore();
}

/* ══════════════════════════════════════════════════════════════════════════
   RENDU MOLÉCULE — cercle coloré + formule au centre
══════════════════════════════════════════════════════════════════════════ */
function drawMolCircle(ctx, formula, cx, cy, r, alpha) {
  if (r <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha ?? 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle   = MOL_COLORS[formula]       || '#888';
  ctx.fill();
  ctx.strokeStyle = MOL_BORDER_COLORS[formula] || '#444';
  ctx.lineWidth   = Math.max(1, r * 0.1);
  ctx.stroke();
  // Texte : taille adaptée à la longueur de la formule pour tenir dans le cercle
  ctx.fillStyle = MOL_TEXT_COLORS[formula] || '#fff';
  const len = formula.length;
  const scale = len <= 2 ? 0.72 : len <= 4 ? 0.52 : len <= 6 ? 0.40 : 0.32;
  let fs = Math.max(6, Math.round(r * scale));
  // Vérification que le texte tient : réduction itérative si nécessaire
  ctx.font = `bold ${fs}px 'Segoe UI', Arial, sans-serif`;
  while (fs > 6 && ctx.measureText(formula).width > r * 1.8) {
    fs--;
    ctx.font = `bold ${fs}px 'Segoe UI', Arial, sans-serif`;
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(formula, cx, cy);
  ctx.restore();
}

/* ══════════════════════════════════════════════════════════════════════════
   DESSIN STATIQUE (état courant)
══════════════════════════════════════════════════════════════════════════ */
function drawStatic() {
  const W = molCanvas.width, H = molCanvas.height;
  molCtx.clearRect(0, 0, W, H);

  const layout = computeLayout();
  if (!layout) return;

  drawBackground(layout);

  const rxn = TITRAGE_REACTIONS[state.rxnIdx];

  // Titrant
  layout.titrant.positions.forEach(p =>
    drawMolCircle(molCtx, rxn.titrant.formula, p.cx, p.cy, layout.titrant.r, 1)
  );

  // Titré restant (haut) — invisible si masqué
  layout.titre.positionsTop.forEach(p =>
    drawMolCircle(molCtx, rxn.titre.formula, p.cx, p.cy, layout.titre.r,
      state.predictionMode ? 0 : 1)
  );

  // Fantômes persistants des titrés consommés
  const ghostAlpha = state.predictionMode ? 0 : 0.25;
  (state.ghostTitre || []).forEach(idx => {
    const p = (state._posTitreAll || [])[idx];
    if (p) drawMolCircle(molCtx, rxn.titre.formula, p.cx, p.cy, layout.titre.r, ghostAlpha);
  });

  // Produits C et D
  layout.produit.posC.forEach(p =>
    drawMolCircle(molCtx, rxn.produits[0].formula, p.cx, p.cy, layout.produit.rProd, 1)
  );
  layout.produit.posD.forEach(p =>
    drawMolCircle(molCtx, rxn.produits[1].formula, p.cx, p.cy, layout.produit.rProd, 1)
  );

  // Excès
  layout.produit.posExces.forEach(p =>
    drawMolCircle(molCtx, rxn.titrant.formula, p.cx, p.cy, layout.produit.rExces, 1)
  );
}

function redraw(retryCount) {
  if (state.anim) return;
  const cell = getCanvasCellRect();
  if (!cell || cell.h < 10) {
    const n = (retryCount | 0) + 1;
    if (n > 10) return;
    requestAnimationFrame(() => redraw(n));
    return;
  }
  drawStatic();
}

/* ══════════════════════════════════════════════════════════════════════════
   UTILITAIRES
══════════════════════════════════════════════════════════════════════════ */
function lerp(a, b, t) { return a + (b - a) * t; }
function easeInOut(t)   { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,   x + w, y + r,   r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h,   x, y + h - r,   r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y,       x + r, y,        r);
  ctx.closePath();
}
