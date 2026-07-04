/* ══════════════════════════════════════════════════════════════════════════
   Simulation pédagogique — Physique-Chimie Lycée
   Auteur  : Mathieu Berdous
   Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   UI.JS — Onglets, tableau, animation, contrôles, init
   Dépend de : data.js, sim.js
══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   CONSTRUCTION DU TABLEAU
══════════════════════════════════════════════════════════════════════════ */
function buildTable() {
  invalidateGeomCache();
  buildThead();
  buildTbody();
  buildTfoot();
  requestAnimationFrame(() => {
    fixAndRedraw();
    initFixedPositions();
    updateTitreMask();
  });
}

function buildThead() {
  invalidateGeomCache();
  const rxn = TITRAGE_REACTIONS[state.rxnIdx];
  const row = document.getElementById('thead-row');
  row.innerHTML = '';

  const mkTh = (text, cls) => {
    const th = document.createElement('th');
    th.className = cls; th.innerHTML = text;
    return th;
  };

  const thLabel = mkTh('Molécule', 'col-label');
  thLabel.style.width = '150px';
  row.appendChild(thLabel);

  // titrant et titré : chacun 25% de la largeur restante, produit 50%
  // On pose width en % sur chaque th — table-layout:fixed les respecte
  const thTitrant = mkTh(`Réactif titrant — ${rxn.titrant.formula}`, 'col-titrant sep-tp');
  thTitrant.style.width = '25%';
  row.appendChild(thTitrant);

  const thTitre = mkTh(`Réactif titré — ${rxn.titre.formula}`, 'col-titre sep-tp');
  thTitre.style.width = '25%';
  row.appendChild(thTitre);

  const thProduit = mkTh(`Produits — ${rxn.produits[0].formula} + ${rxn.produits[1].formula}`, 'col-produit');
  thProduit.style.width = '50%';
  row.appendChild(thProduit);
}

function buildTbody() {
  invalidateGeomCache();
  const tbody = document.getElementById('table-tbody');
  tbody.innerHTML = '';

  const tr = document.createElement('tr');
  tr.className = 'row-canvas';

  const tdLbl = document.createElement('td');
  tdLbl.className = 'td-label';
  tdLbl.textContent = 'Modèles moléculaires';
  tr.appendChild(tdLbl);

  const tdC = document.createElement('td');
  tdC.id = 'canvas-cell';
  tdC.colSpan = 3;
  tr.appendChild(tdC);

  tbody.appendChild(tr);
}

function buildTfoot() {
  invalidateGeomCache();
  const rxn   = TITRAGE_REACTIONS[state.rxnIdx];
  const tfoot = document.getElementById('table-tfoot');
  tfoot.innerHTML = '';
  tfoot.style.display = '';

  const tr = document.createElement('tr');

  // Colonne label
  const tdLbl = document.createElement('td');
  tdLbl.className = 'td-label';
  tdLbl.style.width = '150px';
  tdLbl.innerHTML = `<span id="foot-avancement">x = 0 mol</span>`;
  tr.appendChild(tdLbl);

  // Colonne titrant
  const tdTit = document.createElement('td');
  tdTit.className = 'td-titrant sep-tp';
  tdTit.id = 'foot-titrant';
  tdTit.innerHTML = `Quantité introduite : n(${rxn.titrant.formula}) = 0 mol`;
  tr.appendChild(tdTit);

  // Colonne titré
  const tdTitre = document.createElement('td');
  tdTitre.className = 'td-titre sep-tp';
  tdTitre.id = 'foot-titre';
  tdTitre.innerHTML = `Quantité initiale : nᵢ(${rxn.titre.formula}) = ${state.niTitre} mol<br>`
                    + `Quantité restante : n(${rxn.titre.formula}) = ${state.niTitre} mol`;
  tr.appendChild(tdTitre);

  // Colonne produits (comparaison)
  const tdProd = document.createElement('td');
  tdProd.className = 'td-produit';
  tdProd.id = 'foot-produit';
  tdProd.innerHTML = '';
  tr.appendChild(tdProd);

  tfoot.appendChild(tr);
  rebuildCmpRow();
}

/* ══════════════════════════════════════════════════════════════════════════
   MISE À JOUR TFOOT
══════════════════════════════════════════════════════════════════════════ */
function updateTableFoot() {
  const rxn = TITRAGE_REACTIONS[state.rxnIdx];
  const adv = document.getElementById('foot-avancement');
  if (adv) adv.textContent = `x = ${state.avancement} mol`;

  const tdTit = document.getElementById('foot-titrant');
  if (tdTit) {
    tdTit.innerHTML = `Quantité introduite : n(${rxn.titrant.formula}) = ${state.nTitrantInjecte} mol`;
  }

  const tdTitre = document.getElementById('foot-titre');
  if (tdTitre) {
    tdTitre.innerHTML = `Quantité initiale : nᵢ(${rxn.titre.formula}) = ${state.niTitre} mol<br>`
                      + `Quantité restante : n(${rxn.titre.formula}) = ${state.nTitreRestant} mol`;
  }

  rebuildCmpRow();
  requestAnimationFrame(updateTitreMask);
}


/* ══════════════════════════════════════════════════════════════════════════
   COMPARAISON
══════════════════════════════════════════════════════════════════════════ */
const CMP_LABELS = ['Non', 'Comparaison brute', 'Comparaison avec coeff. stœch.'];

function rebuildCmpRow() {
  const tdProd = document.getElementById('foot-produit');
  if (!tdProd) return;

  if (state.comparaisonMode === 0) {
    tdProd.innerHTML = '';
    return;
  }

  const rxn = TITRAGE_REACTIONS[state.rxnIdx];
  const nA  = state.nTitrantInjecte;   // total injecté
  const niB = state.niTitre;
  const a   = rxn.titrant.coeff;
  const b   = rxn.titre.coeff;

  // Le point d'équivalence est toujours déterminé par n(A)/a vs ni(B)/b
  const ratioA = a > 0 ? nA / a : 0;
  const ratioB = b > 0 ? niB / b : 0;
  const atEquiv   = Math.abs(ratioA - ratioB) < 1e-9;
  const pastEquiv = ratioA - ratioB > 1e-9;
  const equivMsg = atEquiv
    ? `<br><span class="cmp-equiv-exact">Point d'équivalence atteint !</span>`
    : pastEquiv
      ? `<br><span class="cmp-equiv-past">Équivalence dépassée</span>`
      : `<br><span class="cmp-nonequiv">Avant l'équivalence</span>`;

  if (state.comparaisonMode === 1) {
    // Comparaison brute : n(A) vs ni(B) — sans coefficients
    const op = nA < niB ? '<' : nA > niB ? '>' : '=';
    tdProd.innerHTML = `n(${rxn.titrant.formula}) = ${nA} mol &nbsp;<strong>${op}</strong>&nbsp; nᵢ(${rxn.titre.formula}) = ${niB} mol` + equivMsg;
  } else {
    // Mode 2 : avec coefficients stœchiométriques
    const ra = Number.isInteger(ratioA) ? ratioA : +ratioA.toFixed(3);
    const rb = Number.isInteger(ratioB) ? ratioB : +ratioB.toFixed(3);
    const op = ratioA < ratioB ? '<' : ratioA > ratioB ? '>' : '=';
    const fracA = `<span class="cmp-frac"><span class="cmp-frac-num">n(${rxn.titrant.formula})</span><span class="cmp-frac-den">${a}</span></span> = ${ra} mol`;
    const fracB = `<span class="cmp-frac"><span class="cmp-frac-num">nᵢ(${rxn.titre.formula})</span><span class="cmp-frac-den">${b}</span></span> = ${rb} mol`;
    tdProd.innerHTML = `${fracA} &nbsp;<strong>${op}</strong>&nbsp; ${fracB}` + equivMsg;
  }
}

function cycleComparaison() {
  state.comparaisonMode = (state.comparaisonMode + 1) % 3;
  const lbl = document.getElementById('btn-comparaison-label');
  if (lbl) lbl.textContent = CMP_LABELS[state.comparaisonMode];
  const btn = document.getElementById('btn-comparaison');
  if (btn) btn.classList.toggle('active', state.comparaisonMode > 0);
  rebuildCmpRow();
  requestAnimationFrame(() => fixAndRedraw());
}

/* ══════════════════════════════════════════════════════════════════════════
   ÉQUATION
══════════════════════════════════════════════════════════════════════════ */
function buildEquationUI() {
  const rxn = TITRAGE_REACTIONS[state.rxnIdx];
  const row = document.getElementById('equation-row');
  row.innerHTML = '';

  const addPlus = () => {
    const s = document.createElement('span');
    s.className = 'eq-plus'; s.textContent = '+';
    row.appendChild(s);
  };

  // ── Rendu avec fullEquation (réactions réalistes) ──────────────────
  if (rxn.fullEquation) {
    rxn.fullEquation.forEach(tok => {
      if (tok.type === 'op') { addPlus(); return; }
      if (tok.type === 'arrow') {
        const s = document.createElement('span');
        s.className = 'eq-arrow'; s.textContent = '→';
        row.appendChild(s); return;
      }
      // Groupe : coeff (optionnel) + formule
      const grp = document.createElement('div'); grp.className = 'mol-group';
      if (tok.coeff > 1 || state.showCoeffOne) {
        const c = document.createElement('span');
        c.className = 'mol-coeff-fixed'; c.textContent = tok.coeff;
        grp.appendChild(c);
      }
      const f = document.createElement('span');
      f.className = 'mol-formula' + (tok.type === 'implicit' ? ' implicit' : '');
      if (tok.type === 'active') f.style.color = MOL_COLORS[tok.text] || '#333';
      f.textContent = tok.text;
      grp.appendChild(f);
      row.appendChild(grp);
    });
    return;
  }

  // ── Rendu générique (A/B/C/D) ──────────────────────────────────────
  const addMol = (formula, cls, coeff) => {
    const grp = document.createElement('div'); grp.className = 'mol-group';
    if (coeff > 1 || state.showCoeffOne) {
      const c = document.createElement('span');
      c.className = 'mol-coeff-fixed'; c.textContent = coeff;
      grp.appendChild(c);
    }
    const f = document.createElement('span');
    f.className = `mol-formula ${cls}`; f.textContent = formula;
    grp.appendChild(f);
    row.appendChild(grp);
  };

  addMol(rxn.titrant.formula, 'titrant', rxn.titrant.coeff);
  addPlus();
  addMol(rxn.titre.formula, 'titre', rxn.titre.coeff);

  const arr = document.createElement('span');
  arr.className = 'eq-arrow'; arr.textContent = '→';
  row.appendChild(arr);

  rxn.produits.forEach((p, i) => {
    if (i > 0) addPlus();
    addMol(p.formula, 'produit', p.coeff);
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   ONGLETS
══════════════════════════════════════════════════════════════════════════ */
function setOnglet(o) {
  state.onglet = o;
  ['principe', 'titrage'].forEach(id => {
    document.getElementById('tab-' + id).classList.toggle('active', id === o);
    document.getElementById('section-' + id).classList.toggle('visible', id === o);
  });
  document.getElementById('panel-hint-principe').style.display = o === 'principe' ? '' : 'none';
  document.getElementById('panel-hint-titrage').style.display  = o === 'titrage'  ? '' : 'none';

  // Basculer la zone centrale
  const simPrincipe = document.getElementById('sim-area');
  const simTitrage  = document.getElementById('sim-area-titrage');
  if (simPrincipe) simPrincipe.style.display = o === 'principe' ? '' : 'none';
  if (simTitrage)  simTitrage.style.display  = o === 'titrage'  ? 'flex' : 'none';

  if (o === 'titrage') {
    _syncPanelToState();
    _choisirBecher();
    renderTitrageEquation();
    initChartData();
    buildChartLegende();
    updateLiquides();
    _updateLabelVolume();
    _updateBtnsPosition();
    _initRobinet();
    _initPanelListeners();
    _initSchemaResizeObserver();
    startBarreau();
    if (typeof _updateIndicateurBtn === 'function') _updateIndicateurBtn();
    // Si la représentation des espèces était active, relancer la boucle
    if (state.titrageShowEspeces && !_especesRAF) {
      _especesLastTime = null;
      _especesRAF = requestAnimationFrame(_animEspeces);
    }
    // Second RAF pour que #titrage-charts-zone soit rendu avant le positionnement
    requestAnimationFrame(() => requestAnimationFrame(_updateBuretteBoxPosition));
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   TYPE DE TITRAGE — bascule colorimétrique / pH-métrique / conductimétrique
   Pilote l'affichage des éléments SVG additionnels (électrode pH, pH-mètre)
   et ajuste le viewBox pour englober le pH-mètre quand nécessaire.
   ══════════════════════════════════════════════════════════════════════════ */

/** ViewBox du SVG dispositif selon le type de titrage. */
const _TITRAGE_VIEWBOX = {
  colorimetrique:    '42.02 -1.37 89.97 303.5',
  phmetrique:        '42.02 -1.37 157.98 303.5',  // élargi à droite jusqu'à x=200 pour englober le pH-mètre
  conductimetrique:  '42.02 -1.37 157.98 303.5',  // élargi à droite pour englober le conductimètre
};

function onTypeTitrageChange(val) {
  if (!_TITRAGE_VIEWBOX[val]) val = 'colorimetrique';
  const previous = state.titrageType;
  state.titrageType = val;

  // Bascule des classes globales qui pilotent l'affichage CSS des éléments
  // pH / conducti (potence + électrode + boîtier "pH-mètre" réutilisé)
  document.body.classList.toggle('titrage-ph',   val === 'phmetrique');
  document.body.classList.toggle('titrage-cond', val === 'conductimetrique');
  // Synchroniser le clone de l'électrode dans le zoom bécher
  _syncZoomElectrode();

  // ViewBox adapté pour conserver un bon centrage visuel dans chaque mode
  const svg = document.getElementById('svg-dispositif');
  if (svg) svg.setAttribute('viewBox', _TITRAGE_VIEWBOX[val]);

  // Repeupler le sélecteur de solution titrée selon le mode
  // (pH-métrique : HCl + CH₃COOH ; conductimétrique : HCl ; sinon : colorimétrique).
  populateTitrageRxnSelect();

  // Au passage en pH-métrique OU conductimétrique, imposer des valeurs par
  // défaut pédagogiques : C_titrante = C_titrée = 1,00 × 10⁻² mol/L
  // → Veq = 20 mL avec V1 = 20 mL, courbes exploitables.
  if ((val === 'phmetrique'      && previous !== 'phmetrique') ||
      (val === 'conductimetrique' && previous !== 'conductimetrique')) {
    _setConcInputs(1.00, -2, 1.00, -2);
  }

  // Resynchroniser l'état depuis les inputs (qui ont pu être modifiés ci-dessus)
  if (typeof _syncPanelToState === 'function') _syncPanelToState();

  // Réinitialiser la réaction et le graphe pour le nouveau mode
  const sel = document.getElementById('sel-rxn-titrage');
  if (sel) onTitrageRxnChange(sel.value);

  // Adapter le layout des graphes (pH ou σ actif par défaut selon le mode)
  if (typeof _applyChartsLayout === 'function') _applyChartsLayout();

  // Afficher / masquer et adapter le label du bouton du graphe principal
  // (pH en mode pH-métrique, σ en mode conductimétrique, masqué sinon).
  const btnPh = document.getElementById('btn-toggle-graph-ph');
  if (btnPh) {
    if (val === 'phmetrique') {
      btnPh.style.display = '';
      btnPh.textContent = "Afficher l'évolution du pH";
      btnPh.classList.toggle('active', !!state.titrageShowGraphPH);
    } else if (val === 'conductimetrique') {
      btnPh.style.display = '';
      btnPh.textContent = "Afficher l'évolution de la conductivité";
      btnPh.classList.toggle('active', !!state.titrageShowGraphSigma);
    } else {
      btnPh.style.display = 'none';
    }
  }

  // Afficher le sélecteur "Pas d'acquisition" uniquement en pH-métrique / conducti
  const rowPas = document.getElementById('row-pas-acquisition');
  if (rowPas) {
    rowPas.style.display = (val === 'phmetrique' || val === 'conductimetrique') ? '' : 'none';
  }

  // Le ratio SVG↔px change avec le viewBox : resynchroniser les overlays
  // positionnés en absolu (robinet, label volume, boutons, bouton amidon).
  if (typeof _updateRobinetPosition === 'function') _updateRobinetPosition();
  if (typeof _updateLabelVolume    === 'function') _updateLabelVolume();
  if (typeof _updateBtnsPosition   === 'function') _updateBtnsPosition();
  if (typeof _updateAmidonPosition === 'function') _updateAmidonPosition();
  if (typeof _updateIndicateurBtn  === 'function') _updateIndicateurBtn();
}

/**
 * (Re)peuple le sélecteur de solution titrée selon le type de titrage.
 * - colorimétrique         : TITRAGE_MODE_REACTIONS (8 entrées)
 * - pH-métrique            : TITRAGE_PH_REACTIONS   (HCl, CH₃COOH)
 * - conductimétrique       : TITRAGE_COND_REACTIONS (HCl pour l'instant)
 * Préserve la sélection courante si possible.
 */
function populateTitrageRxnSelect() {
  const sel = document.getElementById('sel-rxn-titrage');
  if (!sel) return;
  let source;
  let idx;
  if (state.titrageType === 'phmetrique') {
    source = TITRAGE_PH_REACTIONS;
    idx = state.titragePhRxnIdx || 0;
  } else if (state.titrageType === 'conductimetrique') {
    source = TITRAGE_COND_REACTIONS;
    idx = state.titrageCondRxnIdx || 0;
  } else {
    source = TITRAGE_MODE_REACTIONS;
    idx = state.titrageRxnModeIdx || 0;
  }
  sel.innerHTML = '';
  source.forEach((entry, i) => {
    // En mode pH-métrique, exclure les réactions de précipitation
    if (state.titrageType === 'phmetrique' && entry.precipitationOnly) return;
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = entry.label;
    sel.appendChild(opt);
  });
  // S'assurer que l'index courant est valide (peut avoir changé si une
  // réaction de précipitation était sélectionnée avant le basculement)
  const validIdx = Math.min(idx, source.filter((e, i) =>
    !(state.titrageType === 'phmetrique' && e.precipitationOnly)
  ).length - 1);
  // Sélectionner la valeur : chercher l'option avec la valeur correspondante
  const opts = Array.from(sel.options);
  const found = opts.find(o => parseInt(o.value) === idx);
  if (found) {
    sel.value = String(idx);
  } else if (opts.length > 0) {
    sel.value = opts[0].value;
  }
}

/** Écrit les inputs de concentration (mantisse + exposant) pour titrante & titrée. */
function _setConcInputs(mantTitrante, expTitrante, mantTitree, expTitree) {
  const elTM = document.getElementById('conc-titrante-mantisse');
  const elTE = document.getElementById('conc-titrante-exp');
  const elRM = document.getElementById('conc-titre-mantisse');
  const elRE = document.getElementById('conc-titre-exp');
  if (elTM) elTM.value = mantTitrante.toFixed(2);
  if (elTE) elTE.value = String(expTitrante);
  if (elRM) elRM.value = mantTitree.toFixed(2);
  if (elRE) elRE.value = String(expTitree);
}

/** Appelé au changement de réactif titré dans le sélecteur du mode titrage */
function onTitrageRxnChange(val) {
  const idx = parseInt(val);
  const lbl = document.getElementById('titrant-label');

  if (state.titrageType === 'phmetrique') {
    // ── Mode pH-métrique : TITRAGE_PH_REACTIONS ──
    const entry = TITRAGE_PH_REACTIONS[idx];
    if (!entry) return;
    state.titragePhRxnIdx = idx;
    if (lbl) lbl.innerHTML = entry.labelTitrante || entry.titrant.formula;
  } else if (state.titrageType === 'conductimetrique') {
    // ── Mode conductimétrique : TITRAGE_COND_REACTIONS ──
    const entry = TITRAGE_COND_REACTIONS[idx];
    if (!entry) return;
    state.titrageCondRxnIdx = idx;
    if (lbl) lbl.innerHTML = entry.labelTitrante || entry.titrant.formula;
  } else {
    // ── Mode colorimétrique : TITRAGE_MODE_REACTIONS ──
    const entry = TITRAGE_MODE_REACTIONS[idx];
    if (!entry) return;
    const rxn = TITRAGE_REACTIONS[entry.rxnIdx];
    state.titrageRxnModeIdx = idx;
    if (lbl && rxn) lbl.innerHTML = entry.labelTitrante || rxn.titrant.formula;
  }

  renderTitrageEquation();
  reinitialiserTitrage();   // met à jour _chartEspeces via initChartData
  buildChartLegende();      // lit les nouvelles _chartEspeces
  _updateAmidonPosition();  // affiche/masque le bouton empois d'amidon
}

/**
 * Appelé au changement du sélecteur "Pas d'acquisition" (modes pH/conducti).
 * Met à jour `state.titragePasAcquisition`, **régénère intégralement** la
 * liste des points expérimentaux depuis V=0 jusqu'au volume versé courant
 * selon le nouveau pas (cf. `_rebuildExpPoints`), puis redessine le graphe
 * principal. Comportement prévisible : changer le pas en plein titrage
 * recompose immédiatement la grille de mesures, sans cohabitation d'anciens
 * et nouveaux points.
 */
function onPasAcquisitionChange(val) {
  const pas = parseFloat(val);
  if (!Number.isFinite(pas) || pas <= 0) return;
  state.titragePasAcquisition = pas;
  // Ne pas régénérer les points existants : le nouveau pas s'applique
  // uniquement aux prochains ajouts de titrant.
}

/** Génère une concentration titrée aléatoire et adapte la titrante */
function titrageConcAlea() {
  // Récupérer les coefficients stœchiométriques de la réaction courante
  const rxnEntry       = TITRAGE_MODE_REACTIONS[state.titrageRxnModeIdx || 0];
  const especeTitree   = rxnEntry.especes.find(e => e.role === 'titree');
  const especeTitrante = rxnEntry.especes.find(e => e.role === 'titrante');
  const coeffTitree    = especeTitree   ? especeTitree.coeff   : 1;
  const coeffTitrante  = especeTitrante ? especeTitrante.coeff : 1;

  const V1 = parseFloat(document.getElementById('sel-v1').value) * 1e-3; // en L
  const C_MIN = 1e-5, C_MAX = 9.5e-1;
  const VEQ_MIN = 7e-3, VEQ_MAX = 23e-3;

  // Tirer C_titrée jusqu'à ce qu'une plage Veq valide existe
  let exp, mantisse, cTitre, veqLo, veqHi;
  let attempts = 0;
  do {
    exp      = -(Math.floor(Math.random() * 5) + 1); // -1 à -5
    mantisse = +(Math.random() * 8.9 + 1.0).toFixed(2);
    cTitre   = mantisse * Math.pow(10, exp);
    const k       = cTitre * V1 * coeffTitrante / coeffTitree;
    veqLo = Math.max(VEQ_MIN, k / C_MAX);
    veqHi = Math.min(VEQ_MAX, k / C_MIN);
    attempts++;
  } while (veqLo > veqHi && attempts < 100);

  const k   = cTitre * V1 * coeffTitrante / coeffTitree;
  const Veq = veqLo + Math.random() * (veqHi - veqLo);
  const cTitrante = k / Veq;

  // Arrondir à la mantisse entière ou demi-entière la plus proche
  let bestExp = -1;
  for (let e = -1; e >= -5; e--) {
    const m = cTitrante / Math.pow(10, e);
    if (m >= 1.0 && m < 10.0) { bestExp = e; break; }
  }
  // Arrondir à 0.5 près : valeurs possibles 1.0, 1.5, 2.0, … 9.5
  const rawMantisse  = cTitrante / Math.pow(10, bestExp);
  const bestMantisse = (Math.min(9.5, Math.max(1.0, Math.round(rawMantisse * 2) / 2))).toFixed(2);

  document.getElementById('conc-titre-mantisse').value = mantisse;
  document.getElementById('conc-titre-exp').value      = exp;
  document.getElementById('conc-titrante-mantisse').value = bestMantisse;
  document.getElementById('conc-titrante-exp').value      = bestExp;

  // Mettre à jour state et rafraîchir les couleurs/graphe
  _syncPanelToState();
  reinitialiserTitrage();
}

/** Bascule le masque "réactif titré caché" dans le mode Titrage */
function toggleCacherTitreTitrage() {
  const btn  = document.getElementById('btn-cacher-titre');
  const mask = document.getElementById('titrage-conc-mask');
  if (!btn || !mask) return;

  const hidden = btn.classList.toggle('active');

  if (hidden) {
    mask.style.display = 'flex';
    mask.innerHTML = `
      <div id="titrage-conc-mask-inner">
        <span id="titrage-conc-mask-qmark">?</span>
        <span>Concentration masquée</span>
      </div>`;
  } else {
    mask.style.display = 'none';
    mask.innerHTML = '';
  }
}

function toggleGraphN() {
  // Si le zoom bécher est actif, le clic sur ce bouton doit fermer le zoom
  // sans restaurer l'état mémorisé : l'input de l'utilisateur prime.
  if (state.titrageZoomBecher) _closeZoomBecherDiscardMemory();
  state.titrageShowGraphN = !state.titrageShowGraphN;
  const btn = document.getElementById('btn-toggle-graph-n');
  if (btn) btn.classList.toggle('active', state.titrageShowGraphN);
  _applyChartsLayout();
}

/** Bouton "Afficher l'évolution du pH / de la conductivité".
 *  Pilote `titrageShowGraphPH` en mode pH-métrique et `titrageShowGraphSigma`
 *  en mode conductimétrique. */
function toggleGraphPH() {
  // Idem : réactiver ce bouton pendant que le zoom est actif ferme le zoom
  // sans restaurer l'état mémorisé.
  if (state.titrageZoomBecher) _closeZoomBecherDiscardMemory();
  const btn = document.getElementById('btn-toggle-graph-ph');
  if (state.titrageType === 'conductimetrique') {
    state.titrageShowGraphSigma = !state.titrageShowGraphSigma;
    if (btn) btn.classList.toggle('active', state.titrageShowGraphSigma);
  } else {
    state.titrageShowGraphPH = !state.titrageShowGraphPH;
    if (btn) btn.classList.toggle('active', state.titrageShowGraphPH);
  }
  _applyChartsLayout();
}

/**
 * Applique le layout des graphes selon le mode et les toggles :
 *  - mode pH-métrique :
 *      pH actif seul          → pH prend toute la place
 *      n actif seul           → n prend toute la place
 *      pH + n actifs          → split 50/50 (haut pH, bas n) avec scroll si trop petit
 *      aucun                  → zone vide
 *  - mode conductimétrique : idem mais avec σ=f(V) à la place de pH=f(V)
 *    (le même canvas #titrage-chart-ph est réutilisé ; le draw est aiguillé
 *     vers `drawTitrageSigmaGraph` au lieu de `drawTitragePhGraph`).
 *  - mode colorimétrique :
 *      seul n peut être affiché (le bouton pH/σ est masqué)
 */
function _applyChartsLayout() {
  const phPanel = document.getElementById('titrage-chart-ph-panel');
  const nPanel  = document.getElementById('titrage-chart-panel');
  if (!phPanel || !nPanel) return;

  const showMain = (state.titrageType === 'phmetrique'      && state.titrageShowGraphPH)
                 || (state.titrageType === 'conductimetrique' && state.titrageShowGraphSigma);
  const showN    = state.titrageShowGraphN;

  phPanel.style.display = showMain ? 'flex' : 'none';
  nPanel.style.display  = showN    ? 'flex' : 'none';

  // Les boutons dérivée et tangentes sont pertinents uniquement en
  // pH-métrique ; on les masque en conductimétrique. Le bouton
  // "Modéliser la courbe" et le réticule restent visibles dans les deux modes.
  // On ne masque plus tout #ph-analysis-btns : on cache seulement les
  // boutons dérivée/tangentes individuellement.
  const btnDerivee      = document.getElementById('btn-courbe-derivee');
  const btnTangentes    = document.getElementById('btn-methode-tangentes');
  const btnTracerDroites = document.getElementById('btn-tracer-droites');
  const isCond = (state.titrageType === 'conductimetrique');
  if (btnDerivee)       btnDerivee.style.display       = isCond ? 'none' : '';
  if (btnTangentes)     btnTangentes.style.display      = isCond ? 'none' : '';
  if (btnTracerDroites) btnTracerDroites.style.display  = isCond ? '' : 'none';
  // Masquer tout le panneau en mode colorimétrique (pas de graphe principal)
  const btnsAnalyse = document.getElementById('ph-analysis-btns');
  if (btnsAnalyse) {
    btnsAnalyse.style.display = (state.titrageType === 'colorimetrique') ? 'none' : '';
  }

  // Si les deux sont actifs : split 50/50 chacun avec min-height pour le scroll.
  // Si un seul actif : il prend toute la place (flex:1).
  if (showMain && showN) {
    phPanel.style.flex = '1 1 50%';
    nPanel.style.flex  = '1 1 50%';
  } else {
    phPanel.style.flex = '1 1 auto';
    nPanel.style.flex  = '1 1 auto';
  }

  // Initialiser les canvas si nouvellement visibles
  if (showMain) {
    initPhChartCanvas();
    requestAnimationFrame(() => {
      _syncPhCanvasSize();
      if (state.titrageType === 'conductimetrique') drawTitrageSigmaGraph();
      else                                          drawTitragePhGraph();
    });
  }
  if (showN) {
    initChartCanvas();
    requestAnimationFrame(() => { _syncCanvasSize(); drawTitrageGraph(); });
  }

  // Repositionner la boîte burette (le haut de #titrage-charts-zone peut changer)
  requestAnimationFrame(_updateBuretteBoxPosition);
}

/* ══════════════════════════════════════════════════════════════════════════
   TOGGLE INSTRUCTIONS
══════════════════════════════════════════════════════════════════════════ */
function toggleHint(id) {
  const hint = document.getElementById('panel-hint-' + id);
  hint.classList.toggle('collapsed');
  const btn = document.getElementById('btn-hint-' + id);
  btn.title = hint.classList.contains('collapsed') ? 'Afficher les instructions' : 'Masquer les instructions';
}

/* ══════════════════════════════════════════════════════════════════════════
   CHANGEMENT DE RÉACTION
══════════════════════════════════════════════════════════════════════════ */
function onReactionChange(val) {
  stopAnim();
  state.rxnIdx = parseInt(val);
  resetState();
  buildEquationUI();
  buildTable();
  updatePanelQtyLabel();
}

/* ══════════════════════════════════════════════════════════════════════════
   QUANTITÉ DE RÉACTIF TITRÉ
══════════════════════════════════════════════════════════════════════════ */
function updatePanelQtyLabel() {
  const rxn = TITRAGE_REACTIONS[state.rxnIdx];
  const lbl = document.getElementById('qty-panel-lbl');
  if (lbl) lbl.textContent = `nᵢ(${rxn.titre.formula}) =`;
}

function changeQteTitre(delta) {
  const inp = document.getElementById('qty-titre-val');
  let val = parseInt(inp.value) || state.niTitre;
  val = Math.max(1, Math.min(30, val + delta));
  inp.value = val;
  _applyQteTitre(val);
}



function randomQteTitre() {
  const rxn = TITRAGE_REACTIONS[state.rxnIdx];
  const b   = rxn.titre.coeff;
  // Multiples de b entre 1 et 30
  const multiples = [];
  for (let v = b; v <= 30; v += b) multiples.push(v);
  // Exclure la valeur courante si possible
  const current = state.niTitre;
  const choices = multiples.length > 1 ? multiples.filter(v => v !== current) : multiples;
  const val = choices[Math.floor(Math.random() * choices.length)];
  const inp = document.getElementById('qty-titre-val');
  inp.value = val;
  _applyQteTitre(val);
}

function _applyQteTitre(val) {
  stopAnim();
  state.niTitre = val;
  resetState();
  buildTable();
}

/* ══════════════════════════════════════════════════════════════════════════
   RESET
══════════════════════════════════════════════════════════════════════════ */
function resetState() {
  state.avancement       = 0;
  state.nTitrant         = 30;
  state.nTitreRestant    = state.niTitre;
  state.nProdC           = 0;
  state.nProdD           = 0;
  state.nExces           = 0;
  state.nTitrantInjecte  = 0;
  state.lastFrame        = null;
  state.ghostTitre       = [];   // indices dans _posTitreAll des titrés "consommés"
  // Invalider les positions fixes pour qu'elles soient recalculées
  state._posTitrant  = null;
  state._posTitreAll = null;
  clearStatus();
}

function razPrincipe() {
  stopAnim();
  resetState();
  buildTable();
  updateTableFoot();
}

/* ══════════════════════════════════════════════════════════════════════════
   VITESSE
══════════════════════════════════════════════════════════════════════════ */
function getSpeedMult() {
  const v = parseInt(document.getElementById('speed-slider')?.value ?? 1);
  return [1, 2, 3, Infinity][v] ?? 1;
}

function updateSpeedLabels() {
  const slider = document.getElementById('speed-slider'); if (!slider) return;
  const v = parseInt(slider.value);
  const labels = document.querySelectorAll('#speed-labels span');
  labels.forEach((s, i) => s.classList.toggle('active', i === v));
  const pct = (v / 3) * 100;
  slider.style.background = `linear-gradient(to right,#2a6aaa 0%,#2a6aaa ${pct}%,#c8c0b4 ${pct}%,#c8c0b4 100%)`;
}

/* ══════════════════════════════════════════════════════════════════════════
   AFFICHER COEFFICIENTS 1
══════════════════════════════════════════════════════════════════════════ */
function toggleShowCoeffOne() {
  state.showCoeffOne = !state.showCoeffOne;
  document.getElementById('btn-show-one').classList.toggle('active', state.showCoeffOne);
  buildEquationUI();
}

/* ══════════════════════════════════════════════════════════════════════════
   PRÉDICTION (placeholder)
══════════════════════════════════════════════════════════════════════════ */
function togglePrediction() {
  state.predictionMode = !state.predictionMode;
  const btn = document.getElementById('btn-prediction');
  btn.classList.toggle('active', state.predictionMode);

  // Remettre la comparaison sur "Non" quand on active le masque
  if (state.predictionMode && state.comparaisonMode !== 0) {
    state.comparaisonMode = 0;
    const lbl = document.getElementById('btn-comparaison-label');
    if (lbl) lbl.textContent = CMP_LABELS[0];
    const btnCmp = document.getElementById('btn-comparaison');
    if (btnCmp) btnCmp.classList.remove('active');
    rebuildCmpRow();
  }

  updateTitreMask();
  if (!state.anim) fixAndRedraw();
}

function updateTitreMask() {
  _updateTableMask();
  _updateQtyMask();
  _updateCmpMask();
  _updateTfootTitreMask();
}

function _updateTableMask() {
  const mask = document.getElementById('titre-mask');
  if (!mask) return;

  if (!state.predictionMode) {
    mask.style.display = 'none';
    return;
  }

  const simArea = document.getElementById('sim-area');
  const thTitre = document.querySelector('#thead-row th.col-titre');
  const tbody   = document.getElementById('table-tbody');
  const tfoot   = document.getElementById('table-tfoot');
  if (!thTitre || !simArea || !tbody) { mask.style.display = 'none'; return; }

  const simRect    = simArea.getBoundingClientRect();
  const thRect     = thTitre.getBoundingClientRect();
  const tbodyRect  = tbody.getBoundingClientRect();
  const bottomEl   = (tfoot && tfoot.style.display !== 'none') ? tfoot : tbody;
  const bottomRect = bottomEl.getBoundingClientRect();

  mask.style.display = 'flex';
  mask.style.top     = (tbodyRect.top  - simRect.top  + simArea.scrollTop) + 'px';
  mask.style.left    = (thRect.left    - simRect.left) + 'px';
  mask.style.width   = thRect.width   + 'px';
  mask.style.height  = (bottomRect.bottom - tbodyRect.top) + 'px';

  mask.innerHTML = `
    <div id="titre-mask-inner">
      <span id="titre-mask-qmark">?</span>
      <span>Réactif titré masqué</span>
    </div>`;
}

function _updateQtyMask() {
  const mask    = document.getElementById('qty-mask');
  const input   = document.getElementById('qty-titre-val');
  const btnPlus = document.getElementById('btn-qty-plus');
  const btnMoins= document.getElementById('btn-qty-moins');
  const disabled = state.predictionMode;

  if (input)    input.disabled    = disabled;
  if (btnPlus)  btnPlus.disabled  = disabled;
  if (btnMoins) btnMoins.disabled = disabled;

  if (!mask) return;
  if (!disabled) {
    mask.style.display = 'none';
    return;
  }
  mask.style.display = 'flex';
  mask.innerHTML = `<span style="font-size:clamp(16px,2vw,28px);font-weight:900;color:#c07830;line-height:1;">?</span>`;
}

function _updateCmpMask() {
  const mask   = document.getElementById('cmp-mask');
  const btnCmp = document.getElementById('btn-comparaison');
  const disabled = state.predictionMode;

  if (btnCmp) btnCmp.disabled = disabled;
  if (!mask) return;
  if (!disabled) { mask.style.display = 'none'; return; }
  mask.style.display = 'flex';
  mask.innerHTML = `<span style="font-size:clamp(16px,2vw,28px);font-weight:900;color:#c07830;line-height:1;">?</span>`;
}

function _updateTfootTitreMask() {
  // Masquer/afficher le contenu textuel de la case titré dans le tfoot
  const tdTitre = document.getElementById('foot-titre');
  if (!tdTitre) return;
  tdTitre.style.visibility = state.predictionMode ? 'hidden' : '';
}

/* ══════════════════════════════════════════════════════════════════════════
   ANIMATION — Augmenter l'avancement de 1 mol
   
   Séquence pour chaque pas :
   Phase 0 → "descend" : les molécules titrant (coeff A) descendent vers
              la zone basse de la case titré.
   Phase 1 → "contact" : si réactif titré restant, les titrant arrivent,
              petit délai de contact.
   Phase 2 → "transform" : les molécules reagissent → cercles titrant
              et titré disparaissent, produits apparaissent dans col produit.
   Phase 3 → "prodmigrate" : produits migrent dans leur zone.
   Sinon (plus de titré) :
   Phase 0 → "descend" : titrant descend dans zone basse titré.
   Phase 1 → "pause" : pause.
   Phase 2 → "exces" : titrant migre vers zone exces dans col produit.
══════════════════════════════════════════════════════════════════════════ */

/* Timings de base en ms */
const T_BASE = {
  DESCEND:  500,
  CONTACT:  300,
  TRANSFORM:400,
  MIGRATE:  500,
  PAUSE:    200,
};

function T(key) {
  const m = getSpeedMult();
  return m === Infinity ? 0 : Math.round(T_BASE[key] / m);
}

function stopAnim() {
  if (state.anim) {
    cancelAnimationFrame(state.anim.rafId);
    state.anim = null;
  }
  document.getElementById('btn-avancer').disabled = false;
}

function avancerStep() {
  if (state.anim) return;
  const rxn = TITRAGE_REACTIONS[state.rxnIdx];
  const a   = rxn.titrant.coeff;   // molécules titrant à injecter
  const b   = rxn.titre.coeff;     // molécules titrées qui réagissent

  // On injecte toujours `a` molécules titrant
  // Si titré restant >= b → réaction → on consomme b titrés, on produit coeff C/D
  // Sinon → excès

  // Vérifier que le titrant est rechargé si nécessaire (il se recharge automatiquement à 20 quand il tombe à 0)
  if (state.nTitrant < a) {
    // Recharge automatique
    state.nTitrant = 30;
  }

  if (getSpeedMult() === Infinity) {
    _stepInstant(rxn, a, b);
    return;
  }

  document.getElementById('btn-avancer').disabled = true;
  _lancerAnimStep(rxn, a, b);
}

function _stepInstant(rxn, a, b) {
  const hasReactif = state.nTitreRestant >= b;

  if (hasReactif) {
    // Enregistrer les indices des titrés consommés avant de décrémenter
    const nBefore = state.nTitreRestant;
    if (!state.ghostTitre) state.ghostTitre = [];
    for (let i = nBefore - b; i < nBefore; i++) state.ghostTitre.push(i);

    state.nTitreRestant -= b;
    state.nProdC        += rxn.produits[0].coeff;
    state.nProdD        += rxn.produits[1].coeff;
    state.nTitrant      -= a;
  } else {
    state.nExces        += a;
    state.nTitrant      -= a;
  }

  // Injecter
  state.nTitrantInjecte += a;
  state.avancement      += 1;

  // Recharge titrant si nécessaire
  if (state.nTitrant <= 0) state.nTitrant = 30;

  updateTableFoot();
  fixAndRedraw();
}

/* ──────────────────────────────────────────────────────────────────────────
   Animation fluide — translation de cercles
   Phases si réactif titré restant :
     gather      → titrant glisse col-titrant → centre-bas col-titré
                   ET titré glisse haut col-titré → centre-bas col-titré (simultané)
     overlap     → pause courte : tous superposés au centre
     transform   → les cercles réactifs se morphent en cercles produits (même position)
     prodmigrate → les cercles produits glissent vers leur position finale col-produit
   Phases si plus de réactif (excès) :
     gather      → titrant glisse col-titrant → centre-bas col-titré
     pause       → pause courte
     exces       → titrant migre centre-bas col-titré → zone excès col-produit
────────────────────────────────────────────────────────────────────────── */
function _lancerAnimStep(rxn, a, b) {
  const layout = computeLayout();
  if (!layout) {
    requestAnimationFrame(() => _lancerAnimStep(rxn, a, b));
    return;
  }

  const hasReactif = state.nTitreRestant >= b;

  // Sources : les `a` derniers titrant dans leur colonne
  const srcTitrant = layout.titrant.positions.slice(
    Math.max(0, layout.titrant.positions.length - a)
  );
  if (srcTitrant.length === 0) {
    _stepInstant(rxn, a, b);
    document.getElementById('btn-avancer').disabled = false;
    return;
  }

  // Point de rendez-vous : centre de la zone basse du col-titré
  const meetCx = layout.titre.x0 + layout.titre.w / 2;
  const meetCy = layout.titre.yBot + layout.titre.hBot / 2;

  // Positions de contact des titrant (regroupés autour du centre)
  const rT = layout.titrant.r;
  const contactTitrant = srcTitrant.map((_, i) => ({
    cx: meetCx + (i - (srcTitrant.length - 1) / 2) * (rT * 2 + 3),
    cy: meetCy,
  }));

  // Sources et positions de contact des titrés (si réaction)
  const srcTitre = hasReactif
    ? layout.titre.positionsTop.slice(Math.max(0, layout.titre.positionsTop.length - b))
    : [];
  const rTi = layout.titre.r;
  const contactTitre = srcTitre.map((_, i) => ({
    cx: meetCx + (i - (srcTitre.length - 1) / 2) * (rTi * 2 + 3),
    cy: meetCy,
  }));

  const anim = {
    phase: 'gather',
    t0: null,
    rafId: null,
    done: false,
    rxn, a, b, hasReactif,
    srcTitrant: srcTitrant.map(p => ({ ...p })),
    contactTitrant,
    srcTitre: srcTitre.map(p => ({ ...p })),
    contactTitre,
    meetCx, meetCy,
    // remplies après transform
    prodSrc: [],   // positions de départ des produits (= meetCx/meetCy)
    prodTargets: [],
    layout,
  };

  state.anim = anim;
  anim.rafId = requestAnimationFrame(ts => tickAnim(ts));
}

function tickAnim(ts) {
  const anim = state.anim;
  if (!anim || anim.done) return;

  if (anim.t0 === null) anim.t0 = ts;
  const dt = ts - anim.t0;

  if (state._needRelayoutAfterAnim) {
    state._needRelayoutAfterAnim = false;
    initFixedPositions();
    const L = computeLayout();
    if (L) anim.layout = L;
    updateTitreMask();
  }

  // Phase done — redessiner la scène finale puis libérer
  if (anim.phase === 'done') {
    anim.done = true;
    state.anim = null;
    document.getElementById('btn-avancer').disabled = false;
    fixAndRedraw();
    return;
  }

  const ctx = molCtx;
  const rxn = anim.rxn;
  ctx.clearRect(0, 0, molCanvas.width, molCanvas.height);

  /* ── gather : titrant ET titré se déplacent simultanément vers le point de rendez-vous ── */
  if (anim.phase === 'gather') {
    const dur  = Math.max(1, T('DESCEND'));
    const t    = Math.min(dt / dur, 1);
    const ease = easeInOut(t);
    const L    = anim.layout;

    drawBackground(L);
    _drawStaticMolecules(L, rxn, {
      nSkipTitrant: anim.srcTitrant.length,
      nSkipTitre:   anim.srcTitre.length,
    });

    // Titrant en mouvement
    anim.srcTitrant.forEach((src, i) => {
      const tgt = anim.contactTitrant[i];
      drawMolCircle(ctx, rxn.titrant.formula,
        lerp(src.cx, tgt.cx, ease), lerp(src.cy, tgt.cy, ease), L.titrant.r, 1);
    });
    // Titré en mouvement (si réaction)
    anim.srcTitre.forEach((src, i) => {
      const tgt = anim.contactTitre[i];
      drawMolCircle(ctx, rxn.titre.formula,
        lerp(src.cx, tgt.cx, ease), lerp(src.cy, tgt.cy, ease), L.titre.r,
        state.predictionMode ? 0 : 1);
    });

    if (t >= 1) {
      anim.phase = anim.hasReactif ? 'overlap' : 'pause';
      anim.t0 = ts;
    }
    anim.rafId = requestAnimationFrame(t2 => tickAnim(t2));
    return;
  }

  /* ── overlap : tous superposés au centre, courte pause ── */
  if (anim.phase === 'overlap') {
    const dur = Math.max(1, T('CONTACT'));
    const t   = Math.min(dt / dur, 1);
    const L   = anim.layout;

    drawBackground(L);
    _drawStaticMolecules(L, rxn, {
      nSkipTitrant: anim.srcTitrant.length,
      nSkipTitre:   anim.srcTitre.length,
    });
    // Titrant superposé au centre
    anim.contactTitrant.forEach(p =>
      drawMolCircle(ctx, rxn.titrant.formula, p.cx, p.cy, L.titrant.r, 1)
    );
    // Titré superposé au centre (par-dessus)
    anim.contactTitre.forEach(p =>
      drawMolCircle(ctx, rxn.titre.formula, p.cx, p.cy, L.titre.r,
        state.predictionMode ? 0 : 1)
    );

    if (t >= 1) {
      // Enregistrer les indices des titrés consommés AVANT de décrémenter nTitreRestant
      const nBefore = state.nTitreRestant;
      const ghostIndices = [];
      for (let i = nBefore - anim.b; i < nBefore; i++) ghostIndices.push(i);
      if (!state.ghostTitre) state.ghostTitre = [];
      state.ghostTitre.push(...ghostIndices);

      // Mettre à jour l'état
      state.nTitrantInjecte += anim.a;
      state.avancement      += 1;
      state.nTitreRestant   -= anim.b;
      state.nProdC          += rxn.produits[0].coeff;
      state.nProdD          += rxn.produits[1].coeff;
      state.nTitrant        -= anim.a;
      if (state.nTitrant <= 0) state.nTitrant = 30;
      updateTableFoot();

      // Préparer les positions source/cible pour prodmigrate
      // Source = point de rendez-vous pour tous les produits
      // Cible = positions finales calculées avec le nouvel état
      const Lnew = computeLayout();
      if (Lnew) anim.layout = Lnew;
      const L2 = anim.layout;
      const nC = rxn.produits[0].coeff;
      const nD = rxn.produits[1].coeff;
      anim.prodSrc = [
        ...Array(nC).fill({ cx: anim.meetCx, cy: anim.meetCy }),
        ...Array(nD).fill({ cx: anim.meetCx, cy: anim.meetCy }),
      ];
      anim.prodTargets = [
        ...L2.produit.posC.slice(-nC),
        ...L2.produit.posD.slice(-nD),
      ];
      anim.prodFormulas = [
        ...Array(nC).fill(rxn.produits[0].formula),
        ...Array(nD).fill(rxn.produits[1].formula),
      ];
      // Réactifs qui disparaissent pendant transform (titrant + titré au contact)
      anim.reactSrc = [
        ...anim.contactTitrant.map(p => ({ ...p, formula: rxn.titrant.formula, r: L2.titrant.r })),
        ...anim.contactTitre.map(p  => ({ ...p, formula: rxn.titre.formula,   r: L2.titre.r   })),
      ];

      anim.phase = 'transform';
      anim.t0 = ts;
    }
    anim.rafId = requestAnimationFrame(t2 => tickAnim(t2));
    return;
  }

  /* ── transform : les cercles réactifs se morphent visuellement en cercles produits
     On fait un crossfade de couleur par interpolation dans la même position ── */
  if (anim.phase === 'transform') {
    const dur  = Math.max(1, T('TRANSFORM'));
    const t    = Math.min(dt / dur, 1);
    const ease = easeInOut(t);
    const L    = anim.layout;

    drawBackground(L);
    _drawStaticMolecules(L, rxn, { nSkipProdC: rxn.produits[0].coeff, nSkipProdD: rxn.produits[1].coeff });

    // Réactifs qui s'effacent (restent au centre)
    (anim.reactSrc || []).forEach(p => {
      const isTitre = p.formula === rxn.titre.formula;
      const alpha = isTitre && state.predictionMode ? 0 : (1 - ease);
      drawMolCircle(ctx, p.formula, p.cx, p.cy, p.r, alpha);
    });
    // Produits qui apparaissent (au centre)
    const rProd = L.produit.rProd;
    anim.prodSrc.forEach((p, i) =>
      drawMolCircle(ctx, anim.prodFormulas[i], p.cx, p.cy, rProd, ease)
    );

    if (t >= 1) {
      anim.phase = 'prodmigrate';
      anim.t0 = ts;
    }
    anim.rafId = requestAnimationFrame(t2 => tickAnim(t2));
    return;
  }

  /* ── prodmigrate : les cercles produits glissent du centre vers leur position finale ── */
  if (anim.phase === 'prodmigrate') {
    const dur  = Math.max(1, T('MIGRATE'));
    const t    = Math.min(dt / dur, 1);
    const ease = easeInOut(t);

    const newLayout = computeLayout();
    if (newLayout) anim.layout = newLayout;
    const L = anim.layout;

    drawBackground(L);
    _drawStaticMolecules(L, rxn, { nSkipProdC: rxn.produits[0].coeff, nSkipProdD: rxn.produits[1].coeff });

    anim.prodSrc.forEach((src, i) => {
      const tgt = anim.prodTargets[i] || src;
      drawMolCircle(ctx, anim.prodFormulas[i],
        lerp(src.cx, tgt.cx, ease), lerp(src.cy, tgt.cy, ease),
        L.produit.rProd, 1);
    });

    if (t >= 1) anim.phase = 'done';
    anim.rafId = requestAnimationFrame(t2 => tickAnim(t2));
    return;
  }

  /* ── pause (excès) ── */
  if (anim.phase === 'pause') {
    const dur = Math.max(1, T('PAUSE'));
    const t   = Math.min(dt / dur, 1);
    const L   = anim.layout;

    drawBackground(L);
    _drawStaticMolecules(L, rxn, { nSkipTitrant: anim.srcTitrant.length });
    anim.contactTitrant.forEach(p =>
      drawMolCircle(ctx, rxn.titrant.formula, p.cx, p.cy, L.titrant.r, 1)
    );

    if (t >= 1) {
      state.nTitrantInjecte += anim.a;
      state.avancement      += 1;
      state.nExces          += anim.a;
      state.nTitrant        -= anim.a;
      if (state.nTitrant <= 0) state.nTitrant = 30;
      updateTableFoot();
      const Lnew = computeLayout();
      if (Lnew) anim.layout = Lnew;
      anim.phase = 'exces';
      anim.t0 = ts;
    }
    anim.rafId = requestAnimationFrame(t2 => tickAnim(t2));
    return;
  }

  /* ── exces : titrant migre centre-bas col-titré → zone excès col-produit ── */
  if (anim.phase === 'exces') {
    const dur  = Math.max(1, T('MIGRATE'));
    const t    = Math.min(dt / dur, 1);
    const ease = easeInOut(t);

    const newLayout = computeLayout();
    if (newLayout) anim.layout = newLayout;
    const L = anim.layout;

    const excesTargets = L.produit.posExces.slice(-anim.a);

    drawBackground(L);
    _drawStaticMolecules(L, rxn, { nSkipExces: anim.a });

    anim.contactTitrant.forEach((src, i) => {
      const tgt = excesTargets[i] || src;
      drawMolCircle(ctx, rxn.titrant.formula,
        lerp(src.cx, tgt.cx, ease), lerp(src.cy, tgt.cy, ease),
        lerp(L.titrant.r, L.produit.rExces, ease), 1);
    });

    if (t >= 1) anim.phase = 'done';
    anim.rafId = requestAnimationFrame(t2 => tickAnim(t2));
    return;
  }
}

/**
 * Dessine les molécules statiques.
 * nSkipTitrant  — sauter les N derniers titrant (en mouvement)
 * nSkipTitre    — sauter les N derniers titrés (en mouvement)
 * nSkipExces    — sauter les N derniers excès (en mouvement)
 * nSkipProdC    — sauter les N derniers produits C (en mouvement / morphing)
 * nSkipProdD    — sauter les N derniers produits D (en mouvement / morphing)
 */
function _drawStaticMolecules(layout, rxn,
    { nSkipTitrant = 0, nSkipTitre = 0, nSkipExces = 0, nSkipProdC = 0, nSkipProdD = 0 } = {}) {
  const ctx = molCtx;

  const nT = Math.max(0, layout.titrant.positions.length - nSkipTitrant);
  layout.titrant.positions.slice(0, nT).forEach(p =>
    drawMolCircle(ctx, rxn.titrant.formula, p.cx, p.cy, layout.titrant.r, 1)
  );

  const ghostAlpha = state.predictionMode ? 0 : 0.25;
  const nTi = Math.max(0, layout.titre.positionsTop.length - nSkipTitre);
  layout.titre.positionsTop.slice(0, nTi).forEach(p =>
    drawMolCircle(ctx, rxn.titre.formula, p.cx, p.cy, layout.titre.r, state.predictionMode ? 0 : 1)
  );
  // Fantômes des titrés en mouvement pendant cette anim (nSkipTitre derniers du top)
  layout.titre.positionsTop.slice(nTi).forEach(p =>
    drawMolCircle(ctx, rxn.titre.formula, p.cx, p.cy, layout.titre.r, ghostAlpha)
  );
  // Fantômes persistants des titrés consommés lors des réactions précédentes
  (state.ghostTitre || []).forEach(idx => {
    const p = (state._posTitreAll || [])[idx];
    if (p) drawMolCircle(ctx, rxn.titre.formula, p.cx, p.cy, layout.titre.r, ghostAlpha);
  });

  const nC = Math.max(0, layout.produit.posC.length - nSkipProdC);
  layout.produit.posC.slice(0, nC).forEach(p =>
    drawMolCircle(ctx, rxn.produits[0].formula, p.cx, p.cy, layout.produit.rProd, 1)
  );

  const nD = Math.max(0, layout.produit.posD.length - nSkipProdD);
  layout.produit.posD.slice(0, nD).forEach(p =>
    drawMolCircle(ctx, rxn.produits[1].formula, p.cx, p.cy, layout.produit.rProd, 1)
  );

  const nE = Math.max(0, layout.produit.posExces.length - nSkipExces);
  layout.produit.posExces.slice(0, nE).forEach(p =>
    drawMolCircle(ctx, rxn.titrant.formula, p.cx, p.cy, layout.produit.rExces, 1)
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   UTILITAIRES UI
══════════════════════════════════════════════════════════════════════════ */
function setStatus(msg, cls) {
  const el = document.getElementById('status-msg');
  el.textContent = msg; el.className = cls;
}
function clearStatus() {
  const el = document.getElementById('status-msg');
  el.className = ''; el.textContent = '';
}

/* ══════════════════════════════════════════════════════════════════════════
   MODE TEST
══════════════════════════════════════════════════════════════════════════ */

const testState = {
  actif: false,
  niveau: 1,
  rxnList: [],      // liste des indices de réactions pour ce niveau
  rxnListIdx: 0,    // position courante dans rxnList
  score: 0,
  reponduCette: false,
};

function afficherOverlay(html) {
  document.getElementById('test-modal-content').innerHTML = html;
  document.getElementById('test-overlay').classList.add('visible');
}
function fermerOverlay() {
  document.getElementById('test-overlay').classList.remove('visible');
  document.getElementById('test-modal-content').innerHTML = '';
}

function afficherPopupTest(msgHtml, cssClass, btnsHtml) {
  const popup = document.getElementById('test-popup');
  const msgEl = document.getElementById('test-popup-msg');
  msgEl.innerHTML = msgHtml;
  msgEl.className = cssClass;
  document.getElementById('test-popup-btns').innerHTML = btnsHtml;
  popup.classList.add('visible');
  updatePopupSpacer();
}
function fermerPopupTest() {
  const popup = document.getElementById('test-popup');
  popup.classList.remove('visible');
  document.getElementById('test-popup-msg').innerHTML = '';
  document.getElementById('test-popup-btns').innerHTML = '';
  updatePopupSpacer();
}

function updatePopupSpacer() {
  const popup = document.getElementById('test-popup');
  const spacer = document.getElementById('popup-spacer');
  if (!spacer) return;
  if (popup && popup.classList.contains('visible')) {
    spacer.style.height = (popup.offsetHeight + 40) + 'px';
  } else {
    spacer.style.height = '0';
  }
}

function majBarreProgression() {
  const bar = document.getElementById('test-progress-bar');
  if (!testState.actif) { bar.classList.remove('visible'); bar.innerHTML = ''; return; }
  const total = testState.rxnList.length;
  const num   = testState.rxnListIdx + 1;
  bar.innerHTML = `<div>Réaction : ${num} / ${total}</div><div>Score : ${testState.score} pt${testState.score > 1 ? 's' : ''}</div>`;
  bar.classList.add('visible');
}

function setTestUI(actif) {
  // Onglet Titrage bloqué
  const tabTitrage = document.getElementById('tab-titrage');
  if (tabTitrage) tabTitrage.disabled = actif;

  // Sélecteur de réaction bloqué
  const sel = document.getElementById('sel-reaction');
  if (sel) sel.disabled = actif;

  // Bouton valeur aléatoire bloqué
  const btnRand = document.querySelector('button[onclick="randomQteTitre()"]');
  if (btnRand) btnRand.disabled = actif;

  // Bouton cacher le réactif titré : bloqué (automatiquement actif)
  const btnPred = document.getElementById('btn-prediction');
  if (btnPred) btnPred.disabled = actif;

  // Bouton comparaison bloqué (désactivé par predictionMode)
  const btnCmp = document.getElementById('btn-comparaison');
  if (btnCmp) btnCmp.disabled = actif;

  // Bouton mode test → sortir
  const btnTest = document.getElementById('btn-test-mode');
  if (actif) {
    if (btnTest) { btnTest.textContent = '✕ Sortir du mode test'; btnTest.className = 'btn btn-quitter-test'; btnTest.onclick = quitterModeTest; }
  } else {
    if (btnTest) { btnTest.innerHTML = '&#9881; Mode Test'; btnTest.className = 'btn btn-test-mode'; btnTest.onclick = ouvrirConfirmTest; }
  }
}

function ouvrirConfirmTest() {
  afficherOverlay(`
    <h2>Mode Test</h2>
    <p>Choisissez un niveau :</p>
    <div class="test-modal-btns">
      <button class="btn-test-confirm btn-test-oui" onclick="lancerTest(1)">Niveau 1</button>
      <button class="btn-test-confirm btn-test-oui" onclick="lancerTest(2)">Niveau 2</button>
    </div>
    <div class="test-modal-btns">
      <button class="btn-test-confirm btn-test-non" onclick="fermerOverlay()">Annuler</button>
    </div>`);
}

const TEST_REACTIONS = {
  1: [0, 1, 2, 7, 3],   // 3 génériques + SO₂/diiode + diiode/thiosulfate
  2: [4, 5, 6, 8, 9],   // 5 réalistes avancées
};

function lancerTest(niveau) {
  fermerOverlay();
  testState.actif = true;
  testState.niveau = niveau;
  testState.rxnList = TEST_REACTIONS[niveau];
  testState.rxnListIdx = 0;   // position dans rxnList
  testState.score = 0;
  testState.reponduCette = false;
  stopAnim();
  clearStatus();
  fermerPopupTest();
  setTestUI(true);
  chargerReactionTest();
}

function chargerReactionTest() {
  const rxnIdx = testState.rxnList[testState.rxnListIdx];
  testState.reponduCette = false;

  // Changer la réaction dans le sélecteur et l'état
  const sel = document.getElementById('sel-reaction');
  if (sel) sel.value = rxnIdx;
  stopAnim();
  state.rxnIdx = rxnIdx;

  // Tirer une quantité aléatoire (multiple du coeff stœch du titré)
  const rxn = TITRAGE_REACTIONS[rxnIdx];
  const b = rxn.titre.coeff;
  const multiples = [];
  for (let v = b; v <= 30; v += b) multiples.push(v);
  const val = multiples[Math.floor(Math.random() * multiples.length)];
  state.niTitre = val;
  const inp = document.getElementById('qty-titre-val');
  if (inp) inp.value = val;

  // Réinitialiser
  resetState();
  buildEquationUI();
  buildTable();
  updatePanelQtyLabel();

  // Activer le mode "cacher le réactif titré"
  if (!state.predictionMode) {
    state.predictionMode = true;
    const btnPred = document.getElementById('btn-prediction');
    if (btnPred) btnPred.classList.add('active');
    // Désactiver la comparaison
    if (state.comparaisonMode !== 0) {
      state.comparaisonMode = 0;
      const lbl = document.getElementById('btn-comparaison-label');
      if (lbl) lbl.textContent = CMP_LABELS[0];
      const btnCmp = document.getElementById('btn-comparaison');
      if (btnCmp) btnCmp.classList.remove('active');
      rebuildCmpRow();
    }
    requestAnimationFrame(updateTitreMask);
  }

  majBarreProgression();

  // Afficher le popup de saisie
  _afficherPopupSaisie(rxn);
}

function _afficherPopupSaisie(rxn) {
  const labelFormule = rxn.titre.formula;
  const msgHtml = `Quelle est la quantité initiale de réactif titré <strong>${labelFormule}</strong> ?`;
  const btnsHtml = `
    <div id="test-input-wrap">
      <span id="test-input-label">nᵢ(${labelFormule}) =</span>
      <input type="number" id="test-input-qty" min="1" max="30" step="1" value="1" />
      <span id="test-input-unit">mol</span>
    </div>
    <button class="btn-test-confirm btn-test-oui" onclick="validerReponseTest()">Valider</button>`;
  afficherPopupTest(msgHtml, '', btnsHtml);

  // Soumettre avec Entrée
  requestAnimationFrame(() => {
    const inp = document.getElementById('test-input-qty');
    if (inp) {
      inp.focus();
      inp.addEventListener('keydown', function handler(e) {
        if (e.key === 'Enter') { inp.removeEventListener('keydown', handler); validerReponseTest(); }
      });
    }
  });
}

function validerReponseTest() {
  if (testState.reponduCette) return;
  testState.reponduCette = true;

  const inp = document.getElementById('test-input-qty');
  const valSaisie = inp ? Math.round(parseFloat(inp.value)) : null;
  if (valSaisie === null || isNaN(valSaisie)) return;

  const bonne = state.niTitre;
  const ok = valSaisie === bonne;

  if (ok) testState.score += 1;

  majBarreProgression();

  // Révéler le réactif titré
  state.predictionMode = false;
  const btnPred = document.getElementById('btn-prediction');
  if (btnPred) btnPred.classList.remove('active');
  requestAnimationFrame(updateTitreMask);
  fixAndRedraw();

  // Construire le message de résultat
  const rxn = TITRAGE_REACTIONS[testState.rxnList[testState.rxnListIdx]];
  const estDerniere = testState.rxnListIdx >= testState.rxnList.length - 1;
  const btnSuivant = estDerniere
    ? `<button class="btn-test-confirm btn-test-green" onclick="afficherScoreFinal()">Voir le score ➜</button>`
    : `<button class="btn-test-confirm btn-test-green" onclick="prochainQuestionTest()">Réaction suivante ➜</button>`;

  if (ok) {
    afficherPopupTest(
      `✓ Bravo ! nᵢ(${rxn.titre.formula}) = ${bonne} mol (+1 point)`,
      'ok',
      btnSuivant
    );
  } else {
    afficherPopupTest(
      `✗ Incorrect. La bonne réponse était nᵢ(${rxn.titre.formula}) = ${bonne} mol (0 point)`,
      'nok',
      btnSuivant
    );
  }
}

function prochainQuestionTest() {
  testState.rxnListIdx++;
  if (testState.rxnListIdx >= testState.rxnList.length) {
    afficherScoreFinal();
    return;
  }
  fermerPopupTest();
  chargerReactionTest();
}

function afficherScoreFinal() {
  fermerPopupTest();
  const total = testState.rxnList.length;
  const score = testState.score;
  const pct = score / total;
  const message = pct >= 0.8
    ? 'Excellent ! Très bonne maîtrise du titrage.'
    : pct >= 0.6
      ? 'Bien ! Quelques notions à revoir.'
      : 'À retravailler. Refais le test après révision.';
  afficherOverlay(`
    <h2>Résultat du test — Niveau ${testState.niveau}</h2>
    <div id="test-score-display">${score} / ${total}</div>
    <p>${message}</p>
    <div class="test-modal-btns">
      <button class="btn-test-confirm btn-test-oui" onclick="relancerTest()">Réessayer</button>
      <button class="btn-test-confirm btn-test-non" onclick="quitterModeTest()">Sortir</button>
    </div>`);
}

function relancerTest() {
  fermerOverlay();
  testState.rxnListIdx = 0;
  testState.score = 0;
  testState.reponduCette = false;
  stopAnim();
  clearStatus();
  fermerPopupTest();
  chargerReactionTest();
}

function quitterModeTest() {
  fermerOverlay();
  fermerPopupTest();
  stopAnim();
  clearStatus();
  testState.actif = false;
  testState.rxnListIdx = 0;
  testState.score = 0;
  testState.reponduCette = false;

  // Désactiver le mode prédiction si actif
  if (state.predictionMode) {
    state.predictionMode = false;
    const btnPred = document.getElementById('btn-prediction');
    if (btnPred) btnPred.classList.remove('active');
    requestAnimationFrame(updateTitreMask);
  }

  majBarreProgression();
  setTestUI(false);

  // Remettre la réaction 0 et l'état initial
  state.rxnIdx = 0;
  const sel = document.getElementById('sel-reaction');
  if (sel) sel.value = 0;
  state.niTitre = 10;
  const inp = document.getElementById('qty-titre-val');
  if (inp) inp.value = 10;
  resetState();
  buildEquationUI();
  buildTable();
  updatePanelQtyLabel();
  requestAnimationFrame(() => fixAndRedraw());
}

/* ══════════════════════════════════════════════════════════════════════════
   INITIALISATION
══════════════════════════════════════════════════════════════════════════ */
function init() {
  // Remplir le sélecteur de réactions (mode Principe)
  const sel = document.getElementById('sel-reaction');
  TITRAGE_REACTIONS.forEach((rxn, i) => {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = rxn.label;
    sel.appendChild(opt);
  });

  // Remplir le sélecteur de réaction du mode Titrage (indépendant du mode Principe)
  const selTitrage = document.getElementById('sel-rxn-titrage');
  if (selTitrage) {
    populateTitrageRxnSelect();
    // Initialiser le label titrant
    onTitrageRxnChange(selTitrage.value);
  }

  resetState();
  buildEquationUI();
  buildTable();
  updatePanelQtyLabel();

  const slider = document.getElementById('speed-slider');
  if (slider) {
    slider.addEventListener('input', updateSpeedLabels);
    updateSpeedLabels();
  }

  const qtyInput = document.getElementById('qty-titre-val');
  if (qtyInput) qtyInput.addEventListener('change', function() {
    const v = parseInt(this.value);
    const clamped = isNaN(v) ? 1 : Math.max(1, Math.min(30, v));
    this.value = clamped;
    _applyQteTitre(clamped);
  });

  // Validation mantisse concentration : clampage entre 1 et 9.99
  ['conc-titrante-mantisse', 'conc-titre-mantisse'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', function() {
      let v = parseFloat(this.value);
      if (isNaN(v)) v = 1;
      v = Math.max(1, Math.min(9.99, v));
      this.value = +v.toFixed(2);
    });
    el.addEventListener('blur', function() {
      let v = parseFloat(this.value);
      if (isNaN(v)) v = 1;
      v = Math.max(1, Math.min(9.99, v));
      this.value = +v.toFixed(2);
    });
  });

  requestAnimationFrame(() => fixAndRedraw());

  // ── Deep link depuis la page d'accueil (?tab=principe|titrage) ─────────
  const _tab = new URLSearchParams(location.search).get('tab');
  if (_tab === 'principe' || _tab === 'titrage') setOnglet(_tab);
}

/* ══════════════════════════════════════════════════════════════════════════
   MODE TITRAGE — REMPLISSAGE VERRERIE
══════════════════════════════════════════════════════════════════════════ */

/**
 * Constantes géométriques (coordonnées root SVG, calculées depuis les clipPaths).
 * Burette : clipPath burette-interieur en coords root.
 *   Grad 0  → y_root = 14.793  (ménisque quand burette pleine)
 *   Grad 25 → y_root = 171.842
 *   Échelle  = (171.842 - 14.793) / 25 = 6.282 unités SVG/mL
 *   Clip top = 12.98  (haut du ménisque)
 *   Clip bot = 209.98 (pointe)
 * Bécher : clipPath becher-interieur en coords root.
 *   Top (plein 300mL) = y 225, Bottom (vide) = y 268.5, height = 43.5
 */
const BURETTE = {
  CLIP_TOP:    12.98,
  GRAD0_Y:     14.793,
  SCALE_Y:     6.282,   // unités SVG par mL versé
  CLIP_BOT:    209.98,
  TUBE_X:      84.5,
  TUBE_W:      9.3,
  MAX_ML:      25,
};
const BECHER = {
  CLIP_TOP:    225.0,
  CLIP_BOT:    268.5,
  CLIP_H:      43.5,
  CLIP_X:      77.279,
  CLIP_W:      37.721,
  MAX_ML:      300,
};

/**
 * Couleur de la burette pour une solution de KMnO₄ (permanganate).
 * concMnO4 : concentration en mol/L dans la burette (constante = concTitrante).
 * Retourne { fill, opacity }
 */
function couleurPermanganate_burette(concMnO4) {
  if (concMnO4 <= 0) return { fill: '#b8d4f0', opacity: 0.65 };
  const C_ref = 0.0002;
  const C_max = 0.5;
  const t = Math.min(
    Math.log(1 + concMnO4 / C_ref) / Math.log(1 + C_max / C_ref),
    1
  );
  // rose très pâle rgb(240,200,255) → violet intense rgb(100,0,160)
  const r = Math.round(lerp(240, 100, t));
  const g = Math.round(lerp(200,   0, t));
  const b = Math.round(lerp(255, 160, t));
  const opacity = lerp(0.45, 0.90, t);
  return { fill: `rgb(${r},${g},${b})`, opacity };
}

/**
 * Couleur du bécher pour le titrage Fe²⁺ / MnO₄⁻.
 * Avant l'équivalence : vert-jaune du Fe²⁺ restant (MnO₄⁻ consommé instantanément).
 * Après l'équivalence : excès MnO₄⁻ → rose/violet.
 * concFe2 : concentration Fe²⁺ restant (mol/L)
 * concMnO4_exces : concentration MnO₄⁻ en excès (mol/L)
 * Retourne { fill, opacity }
 */
function couleurFerPermanganate_becher(concFe2, concMnO4_exces) {
  if (concFe2 <= 0) {
    // Dès l'équivalence : couleur MnO₄⁻ (excès ou trace minimale pour signaler l'éq.)
    const C_ref = 0.00005;
    const C_max = 0.1;
    const concAffichee = concMnO4_exces > 0 ? concMnO4_exces : 1e-5;
    const t = Math.min(
      Math.log(1 + concAffichee / C_ref) / Math.log(1 + C_max / C_ref),
      1
    );
    const r = Math.round(lerp(255, 180, t));
    const g = Math.round(lerp(220,   0, t));
    const b = Math.round(lerp(240, 200, t));
    const opacity = lerp(0.35, 0.80, t);
    return { fill: `rgb(${r},${g},${b})`, opacity };
  }
  const C_ref = 0.005;
  const C_max = 0.5;
  const t = Math.min(
    Math.log(1 + concFe2 / C_ref) / Math.log(1 + C_max / C_ref),
    1
  );
  // Interpolation en 2 segments pour éviter le gris intermédiaire :
  // bleu pâle rgb(184,212,240) → bleu-vert rgb(182,215,195) → vert très pâle rgb(200,230,185)
  let r, g, b;
  if (t < 0.5) {
    const s = t / 0.5;
    r = Math.round(lerp(184, 182, s));
    g = Math.round(lerp(212, 215, s));
    b = Math.round(lerp(240, 195, s));
  } else {
    const s = (t - 0.5) / 0.5;
    r = Math.round(lerp(182, 200, s));
    g = Math.round(lerp(215, 230, s));
    b = Math.round(lerp(195, 185, s));
  }
  const opacity = lerp(0.65, 0.72, t);
  return { fill: `rgb(${r},${g},${b})`, opacity };
}

/** Active/désactive l'empois d'amidon (indicateur coloré pour diiode). */
function activerAmidon() {
  if (state.titrageAmidon) return; // déjà actif, rien à faire
  state.titrageAmidon = true;
  const btn = document.getElementById('btn-amidon');
  if (btn) btn.disabled = true;
  updateLiquides();
}

/**
 * Calcule la couleur du liquide diiode/thiosulfate selon la concentration
 * en I₂ restante.
 * concI2 : concentration en mol/L (0 = incolore, > 0 = jaune/orange)
 * Retourne { fill, opacity }
 */
function couleurDiiode(concI2) {
  if (concI2 <= 0) return { fill: '#b8d4f0', opacity: 0.65 };

  // Empois d'amidon actif : bleu nuit interpolé selon concentration
  if (state.titrageAmidon) {
    const C_ref = 0.00001; // très sensible : bleu marqué même à très faible conc
    const C_max = 0.1;
    const t = Math.min(
      Math.log(1 + concI2 / C_ref) / Math.log(1 + C_max / C_ref),
      1
    );
    // bleu nuit pâle rgb(100,130,200) → bleu nuit intense rgb(10,20,100)
    const r = Math.round(lerp(100,  10, t));
    const g = Math.round(lerp(130,  20, t));
    const b = Math.round(lerp(200, 100, t));
    const opacity = lerp(0.55, 0.92, t);
    return { fill: `rgb(${r},${g},${b})`, opacity };
  }
  // Tant qu'il reste du diiode : jaune très pâle → marron-orange foncé
  // Interpolation logarithmique pour rester perceptible sur tous les OdG
  const C_ref = 0.0001;
  const C_max = 0.9;
  const t = Math.min(
    Math.log(1 + concI2 / C_ref) / Math.log(1 + C_max / C_ref),
    1
  );
  // Segment 1 (t 0→0.5) : jaune pâle rgb(255,220,0) → orange vif rgb(255,160,0)
  // Segment 2 (t 0.5→1) : orange vif → orange foncé rgb(200,80,0)
  let r, g, b;
  if (t < 0.5) {
    const s = t / 0.5;
    r = Math.round(lerp(255, 255, s));
    g = Math.round(lerp(220, 160, s));
    b = Math.round(lerp(80,   0, s));
  } else {
    const s = (t - 0.5) / 0.5;
    r = Math.round(lerp(255, 160, s));
    g = Math.round(lerp(160,  50, s));
    b = 0;
  }
  const opacity = lerp(0.45, 0.95, t);
  return { fill: `rgb(${r},${g},${b})`, opacity };
}

/**
 * Couleur du bécher pour SO₂ titré par I₂.
 * Avant équivalence : incolore (SO₂ restant, I₂ consommé instantanément).
 * À l'équivalence et après : couleur I₂ (excès ou trace minimale).
 */
function couleurSO2Diiode_becher(concSO2, concI2_exces) {
  if (concSO2 <= 0) {
    // Dès l'équivalence : couleur I₂ (trace minimale si excès nul)
    const concAffichee = concI2_exces > 0 ? concI2_exces : 1e-5;
    return couleurDiiode(concAffichee);
  }
  return { fill: '#b8d4f0', opacity: 0.65 };
}

/**
 * Couleur du bécher pour KMnO₄ titré par FeSO₄.
 * Bécher violet (KMnO₄ initial) → incolore à l'équivalence → vert-jaune (excès Fe²⁺).
 */
function couleurKMnO4_becher(concMnO4, concFe2_exces) {
  if (concFe2_exces > 0) {
    // Excès Fe²⁺ : vert-jaune pâle
    const C_ref = 0.0001;
    const C_max = 0.8;
    const t = Math.min(
      Math.log(1 + concFe2_exces / C_ref) / Math.log(1 + C_max / C_ref),
      1
    );
    const r = Math.round(lerp(240, 160, t));
    const g = Math.round(lerp(240, 190, t));
    const b = Math.round(lerp(180,  60, t));
    return { fill: `rgb(${r},${g},${b})`, opacity: lerp(0.30, 0.75, t) };
  }
  if (concMnO4 <= 0) return { fill: '#b8d4f0', opacity: 0.65 };
  // KMnO₄ restant : violet
  const C_ref = 0.0002;
  const C_max = 0.5;
  const t = Math.min(
    Math.log(1 + concMnO4 / C_ref) / Math.log(1 + C_max / C_ref),
    1
  );
  const r = Math.round(lerp(240, 100, t));
  const g = Math.round(lerp(200,   0, t));
  const b = Math.round(lerp(255, 160, t));
  return { fill: `rgb(${r},${g},${b})`, opacity: lerp(0.35, 0.85, t) };
}

/**
 * Met à jour le rendu visuel de la burette et du bécher selon l'état courant.
 * Appelé après chaque modification de state.titrageVverse ou des concentrations.
 */
function updateLiquides() {
  const pathBurette = document.getElementById('liquide-burette');
  const rectBecher  = document.getElementById('liquide-becher');
  if (!pathBurette || !rectBecher) return;

  // ── Réaction courante : sélection selon le mode ──
  let rxnEntry, rxn;
  if (state.titrageType === 'phmetrique') {
    rxnEntry = TITRAGE_PH_REACTIONS[state.titragePhRxnIdx || 0];
    rxn = null;
  } else if (state.titrageType === 'conductimetrique') {
    rxnEntry = TITRAGE_COND_REACTIONS[state.titrageCondRxnIdx || 0];
    rxn = null;
  } else {
    rxnEntry = TITRAGE_MODE_REACTIONS[state.titrageRxnModeIdx || 0];
    rxn = TITRAGE_REACTIONS[rxnEntry ? rxnEntry.rxnIdx : 0];
  }
  if (!rxnEntry) return;
  const isPh = state.titrageType === 'phmetrique';
  const isCond = state.titrageType === 'conductimetrique';

  // ── Burette ──
  const vVerse  = state.titrageVverse % BURETTE.MAX_ML;
  const offsetY = vVerse * BURETTE.SCALE_Y;
  const yTop = (12.98 + offsetY).toFixed(3);
  const yBot = (512 + offsetY).toFixed(3);
  pathBurette.setAttribute('d',
    `M84.744,${yTop} s.02048,2.3082 3.8807,2.3082 c3.8602,0 3.8468,-2.2886 3.8468,-2.2886 L92.591,${yBot} L84.744,${yBot} Z`
  );
  pathBurette.removeAttribute('transform');

  // Identifier le titrant pour la couleur burette
  const especeTitrante = rxnEntry.especes.find(e => e.role === 'titrante');
  const idTitrante     = especeTitrante ? especeTitrante.id : '';
  let colBurette;
  if (idTitrante === 'MnO₄⁻') {
    colBurette = couleurPermanganate_burette(state.titrageConcTitrante);
  } else if (idTitrante === 'I₂') {
    // I₂ en burette : jaune-brun selon concentration
    colBurette = couleurDiiode(state.titrageConcTitrante);
  } else if (idTitrante === 'Fe²⁺') {
    // FeSO₄ en burette : vert-jaune très pâle (quasi incolore aux conc usuelles)
    colBurette = couleurFerPermanganate_becher(state.titrageConcTitrante, 0);
  } else {
    colBurette = { fill: '#b8d4f0', opacity: 0.65 }; // neutre
  }
  pathBurette.setAttribute('fill',         colBurette.fill);
  pathBurette.setAttribute('fill-opacity', String(colBurette.opacity.toFixed ? colBurette.opacity.toFixed(3) : colBurette.opacity));

  // ── Bécher ──
  const vBecherTotal = state.titrageV1 + state.titrageVeau + state.titrageVverse;
  const vBecherCap   = Math.min(vBecherTotal, state.titrageBecherNominal);
  const fraction     = vBecherCap / state.titrageBecherNominal;
  const liquidH      = fraction * BECHER.CLIP_H;
  const liquidY      = BECHER.CLIP_BOT - liquidH;

  rectBecher.setAttribute('x',      BECHER.CLIP_X);
  rectBecher.setAttribute('y',      liquidY);
  rectBecher.setAttribute('width',  BECHER.CLIP_W);
  rectBecher.setAttribute('height', liquidH);

  // Calcul avancement
  const especeTitree  = rxnEntry.especes.find(e => e.role === 'titree');
  const coeffTitree   = especeTitree   ? especeTitree.coeff   : 1;
  const coeffTitrante2 = especeTitrante ? especeTitrante.coeff : 1;
  const nTitreeInitial = state.titrageConcTitree   * (state.titrageV1     / 1000);
  const nTitrantTotal  = state.titrageConcTitrante * (state.titrageVverse / 1000);
  const xiMax          = nTitreeInitial  / coeffTitree;
  const xiFromTitrant  = nTitrantTotal   / coeffTitrante2;
  const xi             = Math.min(xiFromTitrant, xiMax);
  const nTitreeRestant = Math.max(0, nTitreeInitial - xi * coeffTitree);
  const nTitrantExces  = Math.max(0, nTitrantTotal  - xiMax * coeffTitrante2);
  const vBecherL       = vBecherTotal / 1000;
  const concTitree     = vBecherL > 0 ? nTitreeRestant / vBecherL : 0;
  const concExces      = vBecherL > 0 ? nTitrantExces  / vBecherL : 0;

  // Couleur bécher selon l'identité du titré
  const idTitree = especeTitree ? especeTitree.id : '';
  let colBecher;
  if (isPh || isCond) {
    const entryType = (rxnEntry.titre || {}).type || '';
    if (entryType === 'precipitation') {
      // ── Réaction de précipitation : bécher incolore → turbidité blanche progressive ──
      // Le précipité se forme dès le premier versement (proportionnel à ξ).
      // La turbidité blanche augmente jusqu'à Veq (tout le titré précipité),
      // puis reste maximale (le titrant en excès est incolore pour ces réactions).
      const coeffTitreePrecip   = rxnEntry.coeffTitree   || 1;
      const coeffTitrantePrecip = rxnEntry.coeffTitrante || 1;
      const nTitreePrecip  = state.titrageConcTitree   * (state.titrageV1     / 1000);
      const nTitrantPrecip = state.titrageConcTitrante * (state.titrageVverse / 1000);
      const xiMaxPrecip        = nTitreePrecip  / coeffTitreePrecip;
      const xiFromTitrantPrecip = nTitrantPrecip / coeffTitrantePrecip;
      const xiPrecip = Math.min(xiFromTitrantPrecip, xiMaxPrecip);
      // Fraction de précipitation (0→1 entre V=0 et V=Veq)
      const fractionPrecipite = (xiMaxPrecip > 0) ? (xiPrecip / xiMaxPrecip) : 0;
      if (fractionPrecipite > 0) {
        // Turbidité blanche progressive : mélange fond bleu pâle + blanc
        const opaciteBlanche = Math.min(0.55, fractionPrecipite * 0.55);
        const r = Math.round(184 + opaciteBlanche / 0.55 * (255 - 184));
        const g = Math.round(212 + opaciteBlanche / 0.55 * (255 - 212));
        const b = Math.round(240 + opaciteBlanche / 0.55 * (255 - 240));
        colBecher = { fill: `rgb(${r},${g},${b})`, opacity: 0.75 };
      } else {
        colBecher = { fill: '#b8d4f0', opacity: 0.65 };
      }
    } else if (isPh && state.titrageIndicateur !== null) {
      // Modes pH-métrique et conductimétrique : espèces incolores en solution.
      // Si un indicateur coloré est actif en mode pH-métrique, colorer selon le pH courant.
      const indic = INDICATEURS_COLORES[state.titrageIndicateur];
      if (indic) {
        colBecher = _couleurIndicateur(indic);
      } else {
        colBecher = { fill: '#b8d4f0', opacity: 0.65 };
      }
    } else {
      colBecher = { fill: '#b8d4f0', opacity: 0.65 };
    }
  } else if (idTitree === 'MnO₄⁻') {
    // KMnO₄ titré par FeSO₄
    colBecher = couleurKMnO4_becher(concTitree, concExces);
  } else if (idTitree === 'SO₂') {
    // SO₂ titré par I₂
    colBecher = couleurSO2Diiode_becher(concTitree, concExces);
  } else if (idTitree === 'Fe²⁺') {
    // Fe²⁺ : vert-jaune restant, excès MnO₄⁻ violet
    colBecher = couleurFerPermanganate_becher(concTitree, concExces);
  } else if (['H₂O₂', 'C₂H₂O₄', 'NO₂⁻', 'C₆H₈O₆'].includes(idTitree)) {
    // Solutions incolores titrées par KMnO₄ ou I₂ :
    // bécher bleu pâle → couleur titrante dès l'équivalence (concTitree = 0).
    // On utilise concTitree <= 0 (et non concExces > 0) pour que le changement
    // de couleur se produise exactement à Veq et non au premier pas après.
    if (concTitree <= 0) {
      // À l'équivalence exacte concExces = 0 : on affiche la couleur minimale du titrant.
      // On passe max(concExces, une concentration trace) pour obtenir une teinte visible.
      const concAffichee = concExces > 0 ? concExces : state.titrageConcTitrante * 1e-4;
      if (idTitrante === 'I₂') colBecher = couleurDiiode(concAffichee);
      else colBecher = couleurFerPermanganate_becher(0, concAffichee);
    } else {
      colBecher = { fill: '#b8d4f0', opacity: 0.65 };
    }
  } else {
    // I₂ titré par S₂O₃²⁻ (diiode)
    colBecher = couleurDiiode(concTitree);
  }
  rectBecher.setAttribute('fill',         colBecher.fill);
  rectBecher.setAttribute('fill-opacity', colBecher.opacity.toFixed(3));
}

/** Intervalle d'écoulement robinet (null = fermé). */
let _robinetInterval = null;

/** Affiche le groupe robinet-ouvert ou robinet-fermé selon l'état. */
function _setRobinetOuvert(ouvert) {
  const go = document.getElementById('robinet-ouvert');
  const gf = document.getElementById('robinet-fermé');
  if (go) go.style.display = ouvert ? '' : 'none';
  if (gf) gf.style.display = ouvert ? 'none' : '';
}
let _robinetDebit = 1;  // multiplicateur de vitesse (1–5)

/** Intervalle de versement manuel (+0,5 mL / +1 mL) — continu comme le robinet. */
let _versementInterval = null;

/**
 * Verse un volume total (mL) de façon continue, à la même vitesse que le robinet
 * (0,05 × _robinetDebit mL tous les 50 ms = _robinetDebit mL/s).
 * Ignoré si le robinet ou le vidage auto est déjà actif.
 */
/** Flag actif pendant un versement déclenché par bouton (+0,5 / +1 mL).
 *  Empêche _recordExpPointIfNeeded de créer des points intermédiaires ;
 *  un unique point est posé à la fin du versement. */
let _versementManuel = false;

function _verserVolume(mLTotal) {
  if (_robinetInterval || _vidageAutoInterval || _versementInterval) return;
  const mode = state.titrageType;
  const vDebut = state.titrageVverse;
  let reste = mLTotal;
  const pas = 0.05 * _robinetDebit;
  _versementManuel = (mode === 'phmetrique' || mode === 'conductimetrique');
  _setRobinetOuvert(true);
  _versementInterval = setInterval(() => {
    if (reste <= 0) {
      // Sauvegarder le flag avant _stopVersement qui le remet à false
      const etaitManuel = _versementManuel;
      _stopVersement();
      _setRobinetOuvert(false);
      if (etaitManuel) {
        const vFin = +(vDebut + mLTotal).toFixed(6);
        if (typeof pushExpPoint === 'function') pushExpPoint(vFin);
        if (typeof _drawMainGraph === 'function') _drawMainGraph();
      }
      return;
    }
    const dv = Math.min(pas, reste);
    ajouterTitrant(dv);
    reste -= dv;
  }, 50);
  _startFilet();
}

/** Arrête le versement manuel en cours. */
function _stopVersement() {
  if (_versementInterval) {
    clearInterval(_versementInterval);
    _versementInterval = null;
  }
  _versementManuel = false;
}

/** Met à jour le multiplicateur de débit depuis le slider. */
function _initDebitSlider() {
  const slider = document.getElementById('slider-debit');
  if (!slider) return;
  const updateLabels = () => {
    _robinetDebit = parseInt(slider.value);
    const spans = document.querySelectorAll('#debit-labels span');
    spans.forEach((s, i) => s.classList.toggle('active', i === _robinetDebit - 1));
    // Mettre à jour le gradient de la piste comme le speed-slider
    const pct = ((_robinetDebit - 1) / 4) * 100;
    slider.style.background = `linear-gradient(to right, #2a6aaa 0%, #2a6aaa ${pct}%, #c8c0b4 ${pct}%)`;
  };
  slider.addEventListener('input', updateLabels);
  updateLabels(); // initialiser
}

/**
 * Ajoute un volume (mL) de solution titrante.
 * Auto-recharge transparente : le volume total affiché continue de croître,
 * seul le niveau visuel de la burette repart de 0.
 */
function ajouterTitrant(mL) {
  const vPrec  = state.titrageVverse;
  const vFinal = Math.round((vPrec + mL) * 10000) / 10000;

  // Arrondi à 4 décimales pour éviter l'accumulation d'erreurs flottantes
  // (ex. 400 additions de 0.05 mL donnent 19.999...96 au lieu de 20.000).
  state.titrageVverse = vFinal;
  // Enregistrer les éventuels points expérimentaux franchis (modes pH/conducti).
  // Ignoré pendant un versement manuel (_verserVolume) : dans ce cas un unique
  // point est posé à la fin du versement, exactement à vPrec + mLTotal.
  if (!_versementManuel && typeof _recordExpPointIfNeeded === 'function') {
    _recordExpPointIfNeeded(vPrec, state.titrageVverse);
  }
  updateLiquides();
  _updateLabelVolume();
  _updatePhDisplay();
  pushChartPoint();
  if (state.titrageType === 'phmetrique') updatePhAnalysisBtns();
  // Mode "représentation des espèces" : enfiler les sphères à éjecter
  if (state.titrageShowEspeces && typeof _syncSpheresAvecVerse === 'function') {
    _syncSpheresAvecVerse();
  }
}

/** Ouvre le robinet (démarrage d'un écoulement continu ~1 mL/s × débit). */
function ouvrirRobinet() {
  if (_robinetInterval) return;
  _arreterVidageAuto(); // arrêter le vidage auto si en cours
  _stopVersement();     // arrêter un versement manuel en cours
  _setRobinetOuvert(true);
  _robinetInterval = setInterval(() => ajouterTitrant(0.05 * _robinetDebit), 50);
  _startFilet();
}

/** Ferme le robinet. */
function fermerRobinet() {
  if (_robinetInterval) {
    clearInterval(_robinetInterval);
    _robinetInterval = null;
  }
  // Ne pas fermer visuellement le robinet si un autre écoulement est en cours
  // (vidage auto ou versement manuel) — ceux-ci gèrent leur propre état visuel.
  if (!_vidageAutoInterval && !_versementInterval) {
    _setRobinetOuvert(false);
  }
  _stopVersement();
}

/** Positionne le div#robinet-cliquable par-dessus la zone rouge du robinet. */
function _updateRobinetPosition() {
  const div = document.getElementById('robinet-cliquable');
  if (!div) return;
  // Coordonnées SVG du robinet rouge (espace racine du viewBox)
  const SVG_X = 93.5, SVG_Y = 178.5, SVG_W = 5, SVG_H = 21;
  const x = svgXtoPx(SVG_X);
  const y = svgYtoPx(SVG_Y);
  const x2 = svgXtoPx(SVG_X + SVG_W);
  const y2 = svgYtoPx(SVG_Y + SVG_H);
  div.style.left   = `${x}px`;
  div.style.top    = `${y}px`;
  div.style.width  = `${x2 - x}px`;
  div.style.height = `${y2 - y}px`;
}

/** Branche les événements mousedown/mouseup/mouseleave sur le robinet SVG (une seule fois). */
let _robinetInited = false;
function _initRobinet() {
  if (_robinetInited) return;
  const r = document.getElementById('robinet-cliquable');
  if (!r) return;
  _robinetInited = true;
  r.addEventListener('mousedown',  (e) => { e.preventDefault(); ouvrirRobinet(); });
  r.addEventListener('mouseup',    fermerRobinet);
  r.addEventListener('mouseleave', fermerRobinet);
  r.addEventListener('touchstart', (e) => { e.preventDefault(); ouvrirRobinet(); }, { passive: false });
  r.addEventListener('touchend',   fermerRobinet);
  // Robinet dans le zoom bécher (même comportement)
  const rZoom = document.getElementById('zoom-robinet-cliquable');
  if (rZoom) {
    rZoom.addEventListener('mousedown',  (e) => { e.preventDefault(); ouvrirRobinet(); });
    rZoom.addEventListener('mouseup',    fermerRobinet);
    rZoom.addEventListener('mouseleave', fermerRobinet);
    rZoom.addEventListener('touchstart', (e) => { e.preventDefault(); ouvrirRobinet(); }, { passive: false });
    rZoom.addEventListener('touchend',   fermerRobinet);
  }
  _initDebitSlider();
}

const BECHERS_STD = [50, 100, 150, 250, 400, 600];

/* ══════════════════════════════════════════════════════════════════════════
   FILET D'ÉCOULEMENT — animation SVG
   Un <rect id="filet-rect"> est placé directement dans le SVG du dispositif,
   en coordonnées SVG. Pas de conversion px nécessaire — responsive natif.

   Géométrie :
     Départ  : pointe de la burette — y = BURETTE.CLIP_BOT (209.98)
     Arrivée : surface du liquide bécher — y = attribut y de #liquide-becher
     Largeur : 2 unités SVG (largeur de la buse de sortie)
     X       : centré sur le tube — (84.744 + 92.591) / 2 = 88.668
   Le rect est tracé verticalement entre ces deux y.
   La couleur suit celle de la burette.
══════════════════════════════════════════════════════════════════════════ */

let _filetRAF = null;

/** Retourne true si un écoulement (robinet, versement ou vidage auto) est actif. */
function _ecoulementActif() {
  return !!((_robinetInterval || _versementInterval || _vidageAutoInterval));
}

// Largeur du filet en unités SVG (= largeur de la buse de sortie de la burette)
const FILET_W = 2.0;
// Centre X du tube burette = (84.744 + 92.591) / 2 = 88.668 (bords du liquide-burette)
const FILET_X = 88.668 - FILET_W / 2;

/** Boucle RAF de l'animation du filet. */
function _animFilet() {
  const rect = document.getElementById('filet-rect');
  if (!rect) { _filetRAF = null; return; }

  if (!_ecoulementActif()) {
    rect.style.display = 'none';
    rect.setAttribute('height', '0');
    _filetRAF = null;
    return;
  }

  // Y de départ : pointe de la burette
  const yTop = BURETTE.CLIP_BOT;   // 209.98

  // Y d'arrivée : surface du liquide dans le bécher
  const rectBecher = document.getElementById('liquide-becher');
  let yBot = BECHER.CLIP_BOT;      // fallback : fond bécher
  if (rectBecher) {
    const yAttr = parseFloat(rectBecher.getAttribute('y'));
    if (!isNaN(yAttr)) yBot = yAttr;
  }

  const h = Math.max(0, yBot - yTop);
  rect.setAttribute('x',      FILET_X.toFixed(3));
  rect.setAttribute('y',      yTop.toFixed(3));
  rect.setAttribute('width',  FILET_W.toFixed(3));
  rect.setAttribute('height', h.toFixed(3));

  // Couleur calquée sur la burette
  const burette = document.getElementById('liquide-burette');
  if (burette) {
    rect.setAttribute('fill',         burette.getAttribute('fill')         || '#b8d4f0');
    rect.setAttribute('fill-opacity', burette.getAttribute('fill-opacity') || '0.75');
  }
  rect.style.display = '';

  _filetRAF = requestAnimationFrame(_animFilet);
}

/** Démarre l'animation du filet (sans doublon). */
function _startFilet() {
  if (_filetRAF) return;
  _filetRAF = requestAnimationFrame(_animFilet);
}

function _choisirBecher() {
  const vMax = state.titrageV1 + state.titrageVeau + BURETTE.MAX_ML;
  state.titrageBecherNominal = BECHERS_STD.find(v => v >= vMax * 1.2) ?? 600;
  // Mettre à jour l'indicateur dans le panel
  const ind = document.getElementById('becher-indicator');
  if (ind) ind.textContent = `Bécher utilisé : ${state.titrageBecherNominal} mL`;
}

/** Réinitialise le titrage. */
function reinitialiserTitrage() {
  fermerRobinet();
  _stopVersement();
  _arreterVidageAuto();
  _choisirBecher();
  state.titrageVverse      = 0;
  state.titrageAmidon  = false;
  const btnA = document.getElementById('btn-amidon');
  if (btnA) btnA.disabled = false;
  // Réinitialiser l'indicateur coloré (one-way comme l'amidon)
  // On conserve l'indicateur choisi mais sa couleur sera recalculée via updateLiquides()
  _updateIndicateurBtn();
  initChartData();
  drawTitrageGraph();
  if (typeof _drawMainGraph === 'function') _drawMainGraph();
  else                                       drawTitragePhGraph();
  updateLiquides();
  _updateLabelVolume();
  _updatePhDisplay();
  updatePhAnalysisBtns();
  // Réinitialiser le réticule libre si actif
  if (typeof _phCursorActive !== 'undefined' && _phCursorActive) {
    _phCursorActive = false;
    const btnC = document.getElementById('btn-ph-cursor');
    if (btnC) btnC.classList.remove('active');
    const tt = document.getElementById('ph-reticule-tooltip');
    if (tt) tt.style.display = 'none';
  }
  // Mode "représentation des espèces" : régénérer les sphères pour les
  // nouvelles concentrations / volume / Veq.
  if (typeof _especesRebuild === 'function') _especesRebuild();
}

/**
 * Indique si le bulbe en verre de l'électrode pH trempe suffisamment dans
 * le liquide du bécher pour que la mesure soit physiquement représentative.
 * Géométrie (coordonnées SVG monde, après application du translate du groupe
 * #electrode-ph (17.587, 10.554) au cercle (cx=90.799, cy=250.61, r=2.514)) :
 *   - centre du bulbe : (108.386, 261.164)
 *   - rayon du bulbe  : 2.514
 *   - bas du bulbe    : y = 263.68
 * Critère retenu (atténué) : le **centre** du bulbe doit être sous le niveau
 * du liquide → membrane sensible majoritairement immergée. Ce critère valide
 * 20 mL de solution dans un bécher de 100 mL (cas pédagogique courant).
 *
 * En SVG, "y plus petit" = "plus haut visuellement".
 * Renvoie false hors mode pH-métrique / conductimétrique (pas d'électrode plongée).
 */
function _electrodeImmergee() {
  if (state.titrageType !== 'phmetrique' && state.titrageType !== 'conductimetrique') return false;
  const BULBE_CENTRE_Y = 261.164; // centre du bulbe (cy_world)
  const vBecherTotal = state.titrageV1 + state.titrageVeau + state.titrageVverse;
  const vBecherCap   = Math.min(vBecherTotal, state.titrageBecherNominal);
  const fraction     = vBecherCap / state.titrageBecherNominal;
  const liquidH      = fraction * BECHER.CLIP_H;
  const liquidY      = BECHER.CLIP_BOT - liquidH;
  return liquidY <= BULBE_CENTRE_Y;
}

/**
 * Met à jour l'affichage de l'écran (texte SVG).
 * - mode pH-métrique     : affiche pH (2 décimales) dans #ph-metre-display
 * - mode conductimétrique : affiche σ en mS/cm (2 décimales) dans #conductimetre-display
 * Affiche `--` hors de ces deux modes OU si la sonde n'est pas immergée.
 */
function _updatePhDisplay() {
  const isMesure = state.titrageType === 'phmetrique' || state.titrageType === 'conductimetrique';

  if (state.titrageType === 'conductimetrique') {
    const el = document.getElementById('conductimetre-display');
    if (!el) return;
    if (!isMesure || !_electrodeImmergee()) {
      el.textContent = '--';
    } else {
      const sigma = calcCurrentSigma();
      el.textContent = (sigma == null) ? '--' : sigma.toFixed(2);
    }
    // Synchroniser l'affichage dans le clone du zoom bécher
    const zoomDisplay = document.querySelector('#zoom-conductimetre-svg .zoom-metre-display');
    if (zoomDisplay) zoomDisplay.textContent = el.textContent;
  } else {
    const el = document.getElementById('ph-metre-display');
    if (!el) return;
    if (!isMesure || !_electrodeImmergee()) {
      el.textContent = '--';
    } else {
      const ph = calcCurrentPH();
      el.textContent = (ph == null) ? '--' : ph.toFixed(2);
    }
    // Synchroniser l'affichage dans le clone du zoom bécher
    const zoomDisplay = document.querySelector('#zoom-ph-metre .zoom-metre-display');
    if (zoomDisplay) zoomDisplay.textContent = el.textContent;
  }
}

/**
 * Convertit une coordonnée Y du viewBox SVG en px dans le wrapper.
 * Tient compte du letterboxing (object-fit: contain).
 */
function svgYtoPx(svgY) {
  const svg     = document.getElementById('svg-dispositif');
  // Repère de référence : #svg-stage (parent direct des boutons absolus
  // positionnés via cette fonction). Fallback sur #schema-wrapper si absent.
  const wrapper = document.getElementById('svg-stage') || document.getElementById('schema-wrapper');
  if (!svg || !wrapper) return 0;
  const vb      = svg.viewBox.baseVal;           // {x, y, width, height}
  const rect    = svg.getBoundingClientRect();
  const wRect   = wrapper.getBoundingClientRect();
  // Échelle réelle (contain peut laisser des bandes)
  const scaleX  = rect.width  / vb.width;
  const scaleY  = rect.height / vb.height;
  const scale   = Math.min(scaleX, scaleY);
  // Offset du SVG rendu dans le wrapper (centrage)
  const svgOffsetY = rect.top - wRect.top + (rect.height - vb.height * scale) / 2;
  return svgOffsetY + (svgY - vb.y) * scale;
}

function svgXtoPx(svgX) {
  const svg     = document.getElementById('svg-dispositif');
  const wrapper = document.getElementById('svg-stage') || document.getElementById('schema-wrapper');
  if (!svg || !wrapper) return 0;
  const vb      = svg.viewBox.baseVal;
  const rect    = svg.getBoundingClientRect();
  const wRect   = wrapper.getBoundingClientRect();
  const scaleX  = rect.width  / vb.width;
  const scaleY  = rect.height / vb.height;
  const scale   = Math.min(scaleX, scaleY);
  const svgOffsetX = rect.left - wRect.left + (rect.width - vb.width * scale) / 2;
  return svgOffsetX + (svgX - vb.x) * scale;
}

function _updateLabelVolume() {
  const lbl = document.getElementById('label-volume-verse');
  if (!lbl) return;
  lbl.textContent = state.titrageVverse.toFixed(2).replace('.', ',') + ' mL versé';

  const buretteLeftX = 84.744;
  const vVerse    = state.titrageVverse % BURETTE.MAX_ML;
  const offsetY   = vVerse * BURETTE.SCALE_Y;
  const menisqueY = 12.98 + offsetY + 1.15;

  const pxY  = svgYtoPx(menisqueY);
  const pxX  = svgXtoPx(buretteLeftX);

  // Espace disponible entre le bord gauche du wrapper et la burette,
  // en réservant une marge minimale des deux côtés
  const MARGE_TUBE  = 8;   // px entre label et bord du tube
  const MARGE_BORD  = 6;   // px minimum entre label et bord gauche du wrapper
  const available   = pxX - MARGE_TUBE - MARGE_BORD;

  // Réinitialiser la font-size pour mesurer la largeur naturelle
  lbl.style.fontSize = '';
  let labelW = lbl.offsetWidth || 90;

  if (labelW > available && available > 16) {
    // Réduire la font-size proportionnellement pour tenir dans l'espace disponible
    const currentFs = parseFloat(getComputedStyle(lbl).fontSize) || 15;
    const newFs = Math.max(9, Math.floor(currentFs * (available / labelW)));
    lbl.style.fontSize = newFs + 'px';
    labelW = lbl.offsetWidth;
  }

  // Positionner : clamp pour ne jamais sortir à gauche (marge min MARGE_BORD)
  const leftIdeal = pxX - labelW - MARGE_TUBE;
  lbl.style.top   = `${pxY - lbl.offsetHeight / 2}px`;
  lbl.style.right = '';
  lbl.style.left  = `${Math.max(MARGE_BORD, leftIdeal)}px`;
}

function _updateBtnsPosition() {
  requestAnimationFrame(() => {
    _updateRobinetPosition();
    _updateAmidonPosition();
    _updateBuretteBoxPosition();
  });
}

/**
 * Positionne la boîte de gestion de la burette.
 *
 * La box est en position:absolute, ancrée sur #schema-wrapper.
 *
 * Comportement :
 *  - Par défaut, la box est calée à droite du wrapper (right = MARGIN_RIGHT)
 *    avec une largeur préférée PREF_WIDTH.
 *  - Si la place disponible entre la box et le bord droit de la burette
 *    devient insuffisante (la box déborderait sur la burette), on autorise
 *    la box à empiéter vers la gauche, mais jamais au-delà d'une marge
 *    MARGIN_TUBE depuis le bord droit du tube de la burette.
 *  - La largeur s'adapte si même cette marge ne suffit pas (clamp à MIN_WIDTH).
 *  - La hauteur max est limitée pour ne pas chevaucher le pH-mètre (mode
 *    pH-métrique) ou le robinet (autres modes) : si le contenu dépasse,
 *    un scroll vertical unique apparaît sur la box.
 */
function _updateBuretteBoxPosition() {
  const box     = document.getElementById('burette-box');
  const wrapper = document.getElementById('schema-wrapper');
  if (!box || !wrapper) return;

  const MARGIN_TUBE  = 10;  // px : marge minimale entre le tube de la burette et la box
  const MARGIN_RIGHT = 10;  // px : marge entre la box et le bord droit du wrapper
  const MARGIN_BOT   = 10;  // px : marge entre la box et l'obstacle bas (pH-mètre / robinet)
  const MIN_WIDTH    = 140; // px : largeur minimale (lisibilité)
  const PREF_WIDTH   = 260; // px : largeur préférée par défaut
  const MAX_WIDTH    = 290; // px : largeur maximale

  const wRect = wrapper.getBoundingClientRect();
  const wW    = wRect.width;

  // Bord droit du tube de la burette en px, relatif au wrapper
  const stage = document.getElementById('svg-stage');
  let stageOffsetX = 0;
  let stageOffsetY = 0;
  if (stage) {
    const sRect = stage.getBoundingClientRect();
    stageOffsetX = sRect.left - wRect.left;
    stageOffsetY = sRect.top  - wRect.top;
  }
  const buretteRightInWrapper = stageOffsetX + svgXtoPx(BURETTE.TUBE_X + BURETTE.TUBE_W);

  // Limite gauche absolue (la box ne doit jamais aller plus à gauche que ça)
  const leftLimit  = buretteRightInWrapper + MARGIN_TUBE;
  const zoneRight  = wW - MARGIN_RIGHT;
  const zoneWidth  = zoneRight - leftLimit;

  // Largeur préférée, clampée selon l'espace disponible
  let width = Math.min(MAX_WIDTH, PREF_WIDTH);
  if (zoneWidth < width) {
    width = Math.max(MIN_WIDTH, zoneWidth);
  }

  // Position idéale : centrée dans la zone entre burette et bord droit du wrapper.
  // Sur petite fenêtre (zone trop étroite), on colle au bord droit de la burette.
  let leftPx = leftLimit + (zoneWidth - width) / 2;
  if (leftPx < leftLimit) leftPx = leftLimit;

  box.style.left  = `${Math.round(leftPx)}px`;
  box.style.width = `${Math.round(width)}px`;
  box.style.right = '';

  // ─── Position verticale (ancre basse sur la grad 25 mL) ──────────────
  // La box est ancrée par le bas : elle grandit vers le haut selon son contenu.
  // Quand la fenêtre rétrécit, bottomPx diminue → la box monte automatiquement.
  // Quand maxH atteint MIN_H, la scrollbar apparaît.
  const TOP_MIN = 8;   // px : marge haute minimale (la box ne dépasse jamais ce seuil)
  const MIN_H   = 120; // px : hauteur minimale avant apparition de la scrollbar

  // Graduation 25 mL en px relatifs au wrapper
  const grad25px  = stageOffsetY + svgYtoPx(BURETTE.GRAD0_Y + BURETTE.SCALE_Y * BURETTE.MAX_ML);
  const bottomPx  = grad25px + MARGIN_BOT; // bas de la box (marge incluse)

  // Ancre "bottom" relative au bas du wrapper
  const bottomFromWrapperBot = Math.round(wRect.height - bottomPx);
  box.style.bottom = `${Math.max(0, bottomFromWrapperBot)}px`;
  box.style.top    = ''; // plus d'ancre haute fixe

  let maxH = bottomPx - TOP_MIN;
  maxH = Math.max(MIN_H, maxH);
  box.style.maxHeight = `${Math.round(maxH)}px`;
}

/** Positionne et affiche/masque le bouton empois d'amidon selon la réaction courante. */
function _updateAmidonPosition() {
  const btn = document.getElementById('btn-amidon');
  if (!btn) return;
  // Jamais utile hors mode colorimétrique (aucune espèce colorée à révéler en
  // pH-métrique ni en conductimétrique).
  if (state.titrageType !== 'colorimetrique') { btn.style.display = 'none'; return; }
  // Visible uniquement si I₂ est l'espèce titrée (pas titrante)
  const rxn = TITRAGE_MODE_REACTIONS[state.titrageRxnModeIdx || 0];
  const i2Titree = rxn && rxn.especes && rxn.especes.some(e => e.id === 'I₂' && e.role === 'titree');
  btn.style.display = i2Titree ? 'block' : 'none';
  if (!i2Titree) return;
  requestAnimationFrame(() => {
    const becherRight  = svgXtoPx(BECHER.CLIP_X + BECHER.CLIP_W); // x droit du bécher
    const becherMidY   = svgYtoPx((BECHER.CLIP_TOP + BECHER.CLIP_BOT) / 2);
    btn.style.left = `${becherRight + 8}px`;
    btn.style.top  = `${becherMidY - btn.offsetHeight / 2}px`;
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   VIDAGE AUTOMATIQUE
   Vide la burette mL par mL (1 mL/pas), point par point sur le graphe.
   Cible :
     - colorimétrique : Veq
     - pH-métrique / conductimétrique : Veq + 10 mL
   La vitesse d'animation suit le multiplicateur de débit.
══════════════════════════════════════════════════════════════════════════ */
let _vidageAutoInterval = null;

function _calcVeq() {
  if (state.titrageType === 'phmetrique') {
    const entry = TITRAGE_PH_REACTIONS[state.titragePhRxnIdx || 0];
    if (!entry) return null;
    const type = (entry.titre || {}).type || '';
    const isBase = (type === 'base_forte' || type === 'base_faible');
    const Ca = state.titrageConcTitree;
    const Va = state.titrageV1;
    const Cb = state.titrageConcTitrante;
    if (!Cb || Cb <= 0) return null;
    // Acide : Veq = Ca·Va / Cb  (volume de NaOH versé)
    // Base  : Veq = Ca·Va / Cb  (même formule : Ca = base, Cb = HCl titrante)
    return (Ca * Va) / Cb;
  } else if (state.titrageType === 'conductimetrique') {
    const entry = TITRAGE_COND_REACTIONS[state.titrageCondRxnIdx || 0];
    if (!entry) return null;
    const type = (entry.titre || {}).type || '';
    const isBase = (type === 'base_forte' || type === 'base_faible');
    const isPrecip = (type === 'precipitation');
    const Ca = state.titrageConcTitree;
    const Va = state.titrageV1;
    const Cb = state.titrageConcTitrante;
    if (!Cb || Cb <= 0) return null;
    if (isPrecip) {
      // Veq tient compte de la stœchiométrie : n_titrée / coeff_titrée × coeff_titrante / C_titrante
      const coeffTitree   = entry.coeffTitree   || 1;
      const coeffTitrante = entry.coeffTitrante || 1;
      const nTitree = Ca * Va / 1000; // mol
      return (nTitree / coeffTitree) * coeffTitrante / Cb * 1000; // mL
    }
    // Acide ou base, stœchiométrie 1:1
    return (Ca * Va) / Cb;
  } else {
    const entry = TITRAGE_MODE_REACTIONS[state.titrageRxnModeIdx || 0];
    if (!entry) return null;
    const eTitree    = entry.especes.find(e => e.role === 'titree');
    const eTitrante  = entry.especes.find(e => e.role === 'titrante');
    const a          = eTitrante ? eTitrante.coeff : 1;
    const b          = eTitree  ? eTitree.coeff   : 1;
    const nTitree    = state.titrageConcTitree * state.titrageV1 / 1000; // mol
    const Cb         = state.titrageConcTitrante;
    if (!Cb || Cb <= 0) return null;
    // Veq en mL : n_titrée/coeff_titrée * coeff_titrante / C_titrante * 1000
    return (nTitree / b) * a / Cb * 1000;
  }
}

function toggleVidageAuto() {
  if (_vidageAutoInterval) {
    _arreterVidageAuto();
    return;
  }
  _demarrerVidageAuto();
}

function _demarrerVidageAuto() {
  const veq = _calcVeq();
  if (veq === null || veq <= 0) return;

  const isPh = state.titrageType === 'phmetrique' || state.titrageType === 'conductimetrique';
  const cible = isPh ? veq + 10 : veq;

  if (state.titrageVverse >= cible) return;

  const box = document.getElementById('burette-box');
  if (box) box.classList.add('auto-running');
  const btnAuto = document.getElementById('btn-vidage-auto');
  if (btnAuto) { btnAuto.textContent = '⏹ Arrêter'; btnAuto.classList.add('running'); }

  _setRobinetOuvert(true);
  let _dernierPalier = Math.floor(state.titrageVverse);
  _startFilet();

  _vidageAutoInterval = setInterval(() => {
    if (state.titrageVverse >= cible) {
      _arreterVidageAuto();
      return;
    }

    const pas = Math.min(0.05 * _robinetDebit, cible - state.titrageVverse);
    ajouterTitrant(pas);

    // Ajouter un point graphe n=f(V) à chaque palier entier franchi
    const palierCourant = Math.floor(state.titrageVverse);
    if (palierCourant > _dernierPalier) {
      for (let p = _dernierPalier + 1; p <= palierCourant; p++) {
        _pushChartPointAt(p);
      }
      _dernierPalier = palierCourant;
      drawTitrageGraph();
    }
  }, 50);
}

function _arreterVidageAuto() {
  if (_vidageAutoInterval) {
    clearInterval(_vidageAutoInterval);
    _vidageAutoInterval = null;
  }
  _setRobinetOuvert(false);
  const box = document.getElementById('burette-box');
  if (box) box.classList.remove('auto-running');
  const btnAuto = document.getElementById('btn-vidage-auto');
  if (btnAuto) { btnAuto.textContent = '▶ Vidage automatique'; btnAuto.classList.remove('running'); }
}


let _schemaResizeObserver = null;
function _initSchemaResizeObserver() {
  if (_schemaResizeObserver) return;
  const wrapper = document.getElementById('schema-wrapper');
  const stage   = document.getElementById('svg-stage');
  if (!wrapper) return;
  _schemaResizeObserver = new ResizeObserver(() => {
    _updateBtnsPosition();
    _updateLabelVolume();
    if (typeof _updateIndicateurBtn === 'function') _updateIndicateurBtn();
  });
  _schemaResizeObserver.observe(wrapper);
  // Observer aussi le stage : sa largeur varie selon que la burette-box
  // prend plus ou moins de place dans le flex row, indépendamment du wrapper.
  if (stage) _schemaResizeObserver.observe(stage);
}

/* ══════════════════════════════════════════════════════════════════════════
   BARREAU AIMANTÉ — animation rotation 2 tours/s
   Le barreau est un rect SVG à bouts arrondis clipé dans le bécher.
   La rotation est simulée en variant la largeur selon |cos(θ)|.
   CX, CY : centre du barreau (fond du bécher en coords viewBox).
   L_MAX  : demi-longueur du barreau (SVG units).
   R_BOUT : rayon des bouts arrondis = demi-hauteur du rect.
══════════════════════════════════════════════════════════════════════════ */
const BARREAU = {
  CX:    96.14,   // centre horizontal bécher
  CY:    265.5,   // proche du fond (CLIP_BOT=268.5, -3 pour laisser de l'espace)
  L_MAX: 6.0,     // demi-longueur max (largeur totale = 12 SVG units ≈ 32% de 37.7)
  R:     2.0,     // demi-hauteur = rayon bout
  OMEGA: 2 * Math.PI * 2.5,  // 2.5 tours/s en rad/s
};

let _barreauTheta    = 0;
let _barreauLastTime = null;
let _barreauRAF      = null;

function _animBarreau(ts) {
  if (_barreauLastTime === null) _barreauLastTime = ts;
  const dt = (ts - _barreauLastTime) / 1000; // secondes
  _barreauLastTime = ts;

  _barreauTheta += BARREAU.OMEGA * dt;

  const rect = document.getElementById('barreau-rect');
  if (rect) {
    const cosA   = Math.abs(Math.cos(_barreauTheta));
    const halfW  = Math.max(BARREAU.R, BARREAU.L_MAX * cosA);
    const w      = halfW * 2;
    const rx     = BARREAU.R;
    rect.setAttribute('x',      (BARREAU.CX - halfW).toFixed(3));
    rect.setAttribute('y',      (BARREAU.CY - BARREAU.R).toFixed(3));
    rect.setAttribute('width',  w.toFixed(3));
    rect.setAttribute('height', (BARREAU.R * 2).toFixed(3));
    rect.setAttribute('rx',     rx.toFixed(3));
    rect.setAttribute('ry',     rx.toFixed(3));
  }

  _barreauRAF = requestAnimationFrame(_animBarreau);
}

function startBarreau() {
  if (_barreauRAF) return;
  _barreauLastTime = null;
  _barreauRAF = requestAnimationFrame(_animBarreau);
}

function stopBarreau() {
  if (_barreauRAF) { cancelAnimationFrame(_barreauRAF); _barreauRAF = null; }
}

/**
 * Lit les inputs du panel titrage et met à jour state.
 * Appelée à chaque changement d'input et au passage sur l'onglet titrage.
 */
function _syncPanelToState() {
  const v1El   = document.getElementById('sel-v1');
  const veauEl = document.getElementById('sel-veau');
  const ctMant = document.getElementById('conc-titrante-mantisse');
  const ctExp  = document.getElementById('conc-titrante-exp');
  const crMant = document.getElementById('conc-titre-mantisse');
  const crExp  = document.getElementById('conc-titre-exp');

  if (v1El)   state.titrageV1            = parseFloat(v1El.value)   || 20;
  if (veauEl) state.titrageVeau          = parseFloat(veauEl.value) || 0;
  if (ctMant && ctExp)
    state.titrageConcTitrante = parseFloat(ctMant.value) * Math.pow(10, parseInt(ctExp.value));
  if (crMant && crExp)
    state.titrageConcTitree   = parseFloat(crMant.value) * Math.pow(10, parseInt(crExp.value));
}

/** Branche les listeners sur les inputs du panel pour resynchroniser en temps réel. */
let _panelListenersInited = false;
function _initPanelListeners() {
  if (_panelListenersInited) return;
  _panelListenersInited = true;
  const ids = ['sel-v1', 'sel-veau',
               'conc-titrante-mantisse', 'conc-titrante-exp',
               'conc-titre-mantisse',    'conc-titre-exp'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => { _syncPanelToState(); reinitialiserTitrage(); });
    el.addEventListener('input',  () => { _syncPanelToState(); reinitialiserTitrage(); });
  });

  // Sélecteur "Type de titrage" : pilote l'affichage des éléments pH-mètre
  const selType = document.getElementById('sel-type-titrage');
  if (selType) {
    selType.addEventListener('change', e => onTypeTitrageChange(e.target.value));
    // Synchronisation initiale (au cas où la valeur sélectionnée diffère du défaut)
    onTypeTitrageChange(selType.value);
  }

  // Reformatage à 2 décimales sur les mantisses (au blur)
  ['conc-titrante-mantisse', 'conc-titre-mantisse'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('blur', () => {
      const v = parseFloat(el.value);
      if (!isNaN(v)) el.value = v.toFixed(2);
    });
  });
}

/**
 * Affiche l'équation de la réaction support du titrage dans #titrage-equation-display.
 * Réutilise la logique fullEquation + MOL_COLORS.
 */
function renderTitrageEquation() {
  const display = document.getElementById('titrage-equation-display');
  if (!display) return;
  display.innerHTML = '';

  // Lire selon le mode (pH-métrique, conductimétrique ou colorimétrique)
  let fullEquation, fallbackLabel;
  if (state.titrageType === 'phmetrique') {
    const entry = TITRAGE_PH_REACTIONS[state.titragePhRxnIdx || 0];
    if (!entry) { display.textContent = '—'; return; }
    fullEquation  = entry.fullEquation;
    fallbackLabel = entry.label;
  } else if (state.titrageType === 'conductimetrique') {
    const entry = TITRAGE_COND_REACTIONS[state.titrageCondRxnIdx || 0];
    if (!entry) { display.textContent = '—'; return; }
    fullEquation  = entry.fullEquation;
    fallbackLabel = entry.label;
  } else {
    const entry = TITRAGE_MODE_REACTIONS[state.titrageRxnModeIdx || 0];
    const rxn   = entry ? TITRAGE_REACTIONS[entry.rxnIdx] : null;
    if (!rxn) { display.textContent = '—'; return; }
    fullEquation  = rxn.fullEquation;
    fallbackLabel = rxn.label;
  }

  const addPlus = () => {
    const s = document.createElement('span');
    s.className = 'eq-plus'; s.textContent = ' + ';
    display.appendChild(s);
  };

  if (fullEquation) {
    fullEquation.forEach(tok => {
      if (tok.type === 'op') { addPlus(); return; }
      if (tok.type === 'arrow') {
        const s = document.createElement('span');
        s.className = 'eq-arrow'; s.textContent = ' → ';
        display.appendChild(s); return;
      }
      const grp = document.createElement('span');
      grp.className = 'mol-group';
      if (tok.coeff > 1) {
        const c = document.createElement('span');
        c.className = 'mol-coeff-fixed'; c.textContent = tok.coeff + ' ';
        grp.appendChild(c);
      }
      const f = document.createElement('span');
      f.className = 'mol-formula';
      if (tok.type === 'implicit') f.classList.add('implicit');
      if (tok.type === 'active') {
        const key = tok.text.replace(/↓/g, '');
        // Pour le texte de l'équation, utiliser MOL_BORDER_COLORS (foncées)
        // car MOL_COLORS peut être très pâle pour certaines espèces (ex. précipités).
        const col = (typeof MOL_BORDER_COLORS !== 'undefined' && MOL_BORDER_COLORS[key])
          || MOL_COLORS[key] || '#333';
        f.style.color = col;
      }
      f.textContent = tok.text.replace(/↓/g, '');
      grp.appendChild(f);
      display.appendChild(grp);
    });
  } else {
    display.textContent = fallbackLabel || '—';
  }
  _fitTitrageEquation();
}

/** Ajuste la font-size de l'équation titrage pour remplir la largeur sans déborder. */
function _fitTitrageEquation() {
  const zone    = document.getElementById('titrage-equation-zone');
  const display = document.getElementById('titrage-equation-display');
  if (!zone || !display) return;
  const maxW = zone.clientWidth - 40; // 40px de padding total
  if (maxW <= 0) return;
  let lo = 8, hi = 40, best = 8;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    display.style.fontSize = mid + 'px';
    if (display.scrollWidth <= maxW) { best = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  display.style.fontSize = best + 'px';
}

// ResizeObserver pour recalculer quand le conteneur change de taille
(function _initEquationResize() {
  const zone = document.getElementById('titrage-equation-zone');
  if (!zone) return;
  new ResizeObserver(() => _fitTitrageEquation()).observe(zone);
})();

/* ══════════════════════════════════════════════════════════════════════════
   INDICATEURS COLORÉS — mode pH-métrique
══════════════════════════════════════════════════════════════════════════ */

/**
 * Calcule la couleur CSS du bécher pour l'indicateur `indic` au pH courant.
 * Interpolation linéaire entre teinte acide et basique dans la zone de virage.
 * @param {object} indic — entrée de INDICATEURS_COLORES
 * @returns {{ fill: string, opacity: number }}
 */
function _couleurIndicateur(indic) {
  const ph = calcCurrentPH();
  if (ph === null) return { fill: '#b8d4f0', opacity: 0.65 };

  // Interpolation : t=0 → acide, t=1 → basique
  let t;
  if (ph <= indic.pHmin) {
    t = 0;
  } else if (ph >= indic.pHmax) {
    t = 1;
  } else {
    t = (ph - indic.pHmin) / (indic.pHmax - indic.pHmin);
  }

  // Cas indicateur incolore en milieu acide (ex. phénolphtaléine) :
  // afficher la couleur de l'eau distillée tant qu'on est dans la zone incolore,
  // puis interpoler vers la couleur basique à l'entrée dans la zone de virage.
  if (indic.acideIncolore) {
    const SEUIL = 0.15; // fraction de t sous laquelle on reste "eau"
    if (t <= 0) return { fill: '#b8d4f0', opacity: 0.65 };
    if (t < SEUIL) {
      // Transition douce eau → couleur de virage
      const s = t / SEUIL;
      const fill = _lerpColor('#b8d4f0', indic.coulBasique, s);
      const opacity = lerp(0.65, 0.75, s);
      return { fill, opacity };
    }
    // Au-delà du seuil : couleur basique pleine
    return { fill: indic.coulBasique, opacity: 0.75 };
  }

  // Cas général : interpolation acide ↔ intermédiaire ↔ basique
  let fill;
  if (t <= 0.5) {
    fill = _lerpColor(indic.coulAcide, indic.coulInter, t * 2);
  } else {
    fill = _lerpColor(indic.coulInter, indic.coulBasique, (t - 0.5) * 2);
  }

  return { fill, opacity: 0.75 };
}

/**
 * Interpolation linéaire entre deux couleurs CSS (hex #rrggbb ou rgba).
 * Pour la phénolphtaléine en milieu acide (transparent → rose), on part de
 * la couleur de l'eau (#b8d4f0) plutôt que de la couleur acide déclarée.
 */
function _lerpColor(c1, c2, t) {
  const parseRGB = (c) => {
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (m) return [+m[1], +m[2], +m[3]];
    const hex = c.replace('#','');
    if (hex.length === 6)
      return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
    if (hex.length === 3)
      return [parseInt(hex[0]+hex[0],16), parseInt(hex[1]+hex[1],16), parseInt(hex[2]+hex[2],16)];
    return [184, 212, 240];
  };
  const toHSL = ([r,g,b]) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
    let h = 0, s = 0, l = (max + min) / 2;
    if (d > 0) {
      s = d / (1 - Math.abs(2*l - 1));
      if      (max === r) h = ((g - b) / d + 6) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else                h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  };
  const fromHSL = (h, s, l) => {
    const c = (1 - Math.abs(2*l - 1)) * s;
    const x = c * (1 - Math.abs((h/60) % 2 - 1));
    const m = l - c/2;
    let r,g,b;
    if      (h < 60)  { r=c; g=x; b=0; }
    else if (h < 120) { r=x; g=c; b=0; }
    else if (h < 180) { r=0; g=c; b=x; }
    else if (h < 240) { r=0; g=x; b=c; }
    else if (h < 300) { r=x; g=0; b=c; }
    else              { r=c; g=0; b=x; }
    return [Math.round((r+m)*255), Math.round((g+m)*255), Math.round((b+m)*255)];
  };
  const [h1,s1,l1] = toHSL(parseRGB(c1));
  const [h2,s2,l2] = toHSL(parseRGB(c2));
  // Interpolation de la teinte par le chemin le plus court
  let dh = h2 - h1;
  if (dh >  180) dh -= 360;
  if (dh < -180) dh += 360;
  const h = h1 + dh * t;
  const s = s1 + (s2 - s1) * t;
  const l = l1 + (l2 - l1) * t;
  const [r,g,b] = fromHSL((h + 360) % 360, s, l);
  return `rgb(${r},${g},${b})`;
}

/** Ouvre la modal de sélection d'indicateur coloré. */
function ouvrirModalIndicateur() {
  // Construire le tableau
  const tbody = document.getElementById('indicateur-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  // Trier par pHmin croissant (déjà le cas dans INDICATEURS_COLORES)
  INDICATEURS_COLORES.forEach((indic, idx) => {
    const tr = document.createElement('tr');
    if (state.titrageIndicateur === idx) tr.classList.add('selected');

    // Nom
    const tdNom = document.createElement('td');
    tdNom.textContent = indic.nom;
    tr.appendChild(tdNom);

    // Teinte acide
    tr.appendChild(_indicCellCouleur(indic.coulAcide, indic.labelAcide));
    // Teinte intermédiaire
    tr.appendChild(_indicCellCouleur(indic.coulInter, indic.labelInter));
    // Teinte basique
    tr.appendChild(_indicCellCouleur(indic.coulBasique, indic.labelBasique));

    // Zone de virage
    const tdZone = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'indic-zone-badge';
    badge.textContent = `${indic.pHmin.toFixed(1).replace('.',',')} – ${indic.pHmax.toFixed(1).replace('.',',')}`;
    tdZone.appendChild(badge);
    tr.appendChild(tdZone);

    tr.addEventListener('click', () => choisirIndicateur(idx));
    tbody.appendChild(tr);
  });

  const overlay = document.getElementById('indicateur-overlay');
  if (overlay) overlay.style.display = 'flex';
}

/** Crée une cellule td avec pastille de couleur + label texte. */
function _indicCellCouleur(coul, label) {
  const td = document.createElement('td');
  const wrap = document.createElement('div');
  wrap.className = 'indic-color-cell';
  const swatch = document.createElement('span');
  swatch.className = 'indic-color-swatch';
  // Couleur de fond : si transparent (phénolphtaléine acide), on montre eau
  const bg = (coul === 'rgba(184,212,240,0)' || coul.startsWith('rgba')) ? '#b8d4f0' : coul;
  swatch.style.background = bg;
  if (coul === 'rgba(184,212,240,0)') swatch.style.opacity = '0.3';
  wrap.appendChild(swatch);
  const txt = document.createElement('span');
  txt.textContent = label;
  wrap.appendChild(txt);
  td.appendChild(wrap);
  return td;
}

/** Sélectionne l'indicateur d'index `idx` et ferme la modal. */
function choisirIndicateur(idx) {
  state.titrageIndicateur = idx;
  fermerModalIndicateur();
  _updateIndicateurBtn();
  updateLiquides();
  if (typeof updatePhAnalysisBtns === 'function') updatePhAnalysisBtns();
  if (typeof drawTitragePhGraph   === 'function') drawTitragePhGraph();
}

/** Retire l'indicateur actif et ferme la modal. */
function retirerIndicateur() {
  state.titrageIndicateur = null;
  fermerModalIndicateur();
  _updateIndicateurBtn();
  updateLiquides();
  if (typeof updatePhAnalysisBtns === 'function') updatePhAnalysisBtns();
  if (typeof drawTitragePhGraph   === 'function') drawTitragePhGraph();
}

/** Ferme la modal sans changer la sélection. */
function fermerModalIndicateur() {
  const overlay = document.getElementById('indicateur-overlay');
  if (overlay) overlay.style.display = 'none';
}

/**
 * Met à jour l'apparence du bouton indicateur et positionne / affiche-masque
 * le label de l'indicateur actif.
 */
function _updateIndicateurBtn() {
  const btn = document.getElementById('btn-indicateur-colore');
  if (!btn) return;

  // Visible uniquement en mode pH-métrique
  const visible = state.titrageType === 'phmetrique';
  btn.style.display = visible ? 'block' : 'none';
  if (!visible) return;

  if (state.titrageIndicateur !== null) {
    const indic = INDICATEURS_COLORES[state.titrageIndicateur];
    btn.textContent = indic ? `Indicateur : ${indic.nom}` : 'Ajouter un indicateur coloré.';
    btn.classList.add('has-indicateur');
  } else {
    btn.textContent = 'Ajouter un indicateur coloré.';
    btn.classList.remove('has-indicateur');
  }

  // Positionnement : centré horizontalement sur le boîtier pH-mètre,
  // au-dessus avec une marge proportionnelle à l'échelle SVG courante.
  requestAnimationFrame(() => {
    const wrapper = document.getElementById('schema-wrapper');
    if (!wrapper) return;

    // Boîtier pH-mètre : x ∈ [132.85, 197.551], y haut = 249 (coords SVG)
    const SVG_METRE_LEFT  = 132.85;
    const SVG_METRE_RIGHT = 197.551;
    const SVG_METRE_TOP   = 249;

    // Échelle pixel/SVGunit courante (pour la marge proportionnelle)
    const svgEl = document.getElementById('svg-dispositif');
    let scale = 1;
    if (svgEl) {
      const vb = svgEl.viewBox.baseVal;
      const rect = svgEl.getBoundingClientRect();
      const scaleX = rect.width  / vb.width;
      const scaleY = rect.height / vb.height;
      scale = Math.min(scaleX, scaleY);
    }

    // Marge responsive : 12 SVGunits convertis en px, min 10px, max 22px
    const marge = Math.min(22, Math.max(10, 12 * scale));

    // Largeur du pH-mètre en px → bouton au moins aussi large
    const pxMetreLeft  = svgXtoPx(SVG_METRE_LEFT);
    const pxMetreRight = svgXtoPx(SVG_METRE_RIGHT);
    const pxMetreW     = pxMetreRight - pxMetreLeft;
    const pxMetreCx    = (pxMetreLeft + pxMetreRight) / 2;

    // Font-size : basée sur la largeur réelle du pH-mètre en pixels,
    // qui scale naturellement avec la taille de la fenêtre.
    // Référence : pH-mètre large de ~130px sur grand écran → 14px.
    // Clampée entre 8px et 15px.
    const fs = Math.min(15, Math.max(8, Math.round(pxMetreW * 0.108)));
    btn.style.fontSize = `${fs}px`;

    // Largeur = 80 % de la largeur du pH-mètre en px, clampée [80px, 210px]
    btn.style.width = `${Math.min(210, Math.max(80, pxMetreW * 0.8))}px`;

    // Second RAF : le layout est recalculé avec la nouvelle font-size et largeur,
    // on peut maintenant centrer précisément sur le boîtier pH-mètre.
    requestAnimationFrame(() => {
      const pxTop = svgYtoPx(SVG_METRE_TOP) - btn.offsetHeight - marge;
      btn.style.left = `${pxMetreCx - btn.offsetWidth / 2}px`;
      btn.style.top  = `${Math.max(4, pxTop)}px`;
      // Repositionner la boîte burette maintenant que le bouton est placé
      _updateBuretteBoxPosition();
    });
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   ESPÈCES CHIMIQUES — Représentation par sphères (mode commun aux 3 sous-modes)
   ══════════════════════════════════════════════════════════════════════════
   Quand state.titrageShowEspeces === true :
   - Des sphères colorées sont placées dans la burette et le bécher
     (groupes SVG #especes-burette et #especes-becher).
   - Elles sont animées d'un mouvement brownien (boucle RAF dédiée).
   - À chaque éjection (versement de V_par_sphere_titrant mL), une sphère
     de titrant descend le long du filet jusqu'au bécher.
   - Une fois dans le bécher, elle cherche la sphère de titré la plus proche
     et migre vers elle ; au contact, les deux disparaissent et sont remplacées
     par les sphères des produits (selon la stœchiométrie).
   - La calibration : N_TITRE_INIT = 20 sphères de titré au départ ; le nombre
     de sphères de titrant à l'équivalence vaut N_TITRE_INIT × coeffTitrant/coeffTitre.
   - V_par_sphere_titrant = Veq / N_titrant_eq (mL par sphère).
   - Les ions spectateurs ont une checkbox dans la légende, décochée par défaut.
   ══════════════════════════════════════════════════════════════════════════ */

const ESPECES = {
  R:                 1.2,    // rayon sphère (unités SVG)
  N_TITRE_INIT:      20,     // nombre de sphères de titré au départ
  V_BROWN:           12.0,   // amplitude vitesse brownienne (SVG/s, ordre de grandeur)
  V_BROWN_BURETTE:   2.5,    // brownien réduit dans la burette (tube étroit)
  DAMPING:           0.82,   // amortissement de la vitesse à chaque frame
  MIG_DURATION:      0.45,   // durée de la phase migration (s)
  FLASH_DURATION:    0.25,   // durée du flash des produits naissants (s)
  DESCENTE_VITESSE:  85,     // vitesse de descente le long du filet (SVG/s)
  MAX_TRANCHES_DESCENTE_PAR_FRAME: 2, // cap anti-explosion (nb tranches qui basculent en descente par frame)
  // ─── Géométrie burette (en coordonnées SVG) ───
  // CLIP_TOP = graduation 0 (haut du liquide à V=0).
  // GRAD25_Y = graduation 25 = CLIP_TOP + MAX_ML × SCALE_Y. C'est la limite
  //   basse des tranches stœchiométriques (en dessous = zone tampon dans la pointe).
  // CLIP_BOT_BURETTE = bas du clipPath burette-interieur (≈ 215). Les sphères
  //   en zone tampon descendent jusqu'à ce niveau avant de quitter la burette.
  GRAD25_Y:          12.98 + 25 * 6.282,  // = 170.03 (recalculé depuis BURETTE.CLIP_TOP, MAX_ML, SCALE_Y)
  CLIP_BOT_BURETTE:  214,    // bas approximatif du clipPath burette-interieur (avant disparition)
};

// État interne de la boucle d'animation des espèces
let _especesRAF        = null;
let _especesLastTime   = null;
let _especesSpheres    = [];     // tableau plat de toutes les sphères vivantes
let _especesVparSphere = null;   // mL de titrant par sphère (recalculé à chaque init)
let _especesVverseRef  = 0;      // dernier V versé (référence pour _syncSpheresAvecVerse, no-op)
let _especesNextId     = 0;      // identifiant unique par sphère (pour le DOM)
let _especesGroupesReaction = {}; // { groupeId : { titrants, titres, cx, cy, declenche } }

/** Récupère l'entrée réaction courante (mêmes règles que graph.js _getRxnEntry). */
function _especesGetRxnEntry() {
  if (typeof _getRxnEntry === 'function') return _getRxnEntry();
  // Fallback (au cas où graph.js ne serait pas chargé) :
  if (state.titrageType === 'phmetrique')
    return TITRAGE_PH_REACTIONS[state.titragePhRxnIdx || 0] || null;
  if (state.titrageType === 'conductimetrique')
    return TITRAGE_COND_REACTIONS[state.titrageCondRxnIdx || 0] || null;
  return TITRAGE_MODE_REACTIONS[state.titrageRxnModeIdx || 0] || null;
}

/** Lit les coeffs stœchiométriques titré/titrant pour la réaction courante. */
function _especesCoeffs(entry) {
  if (!entry) return { coeffTitre: 1, coeffTitrant: 1 };
  if (entry.rxnIdx != null) {
    const rxn = TITRAGE_REACTIONS[entry.rxnIdx];
    return { coeffTitre: rxn.titre.coeff, coeffTitrant: rxn.titrant.coeff };
  }
  const eT = (entry.especes || []).find(e => e.role === 'titree');
  const eB = (entry.especes || []).find(e => e.role === 'titrante');
  return {
    coeffTitre:   eT ? eT.coeff : 1,
    coeffTitrant: eB ? eB.coeff : 1,
  };
}

/**
 * Table des bornes intérieures de la burette dans la zone de transition
 * (y ≥ GRAD25_Y ≈ 170.03), reconstruite depuis le path SVG #burette-interieur.
 *
 * Chaque entrée : { y, xLeft, xRight } en coordonnées SVG absolues.
 * xLeft = bord gauche intérieur, xRight = bord droit intérieur.
 *
 * Points extraits en reconstituant le path complet (commandes relatives l/v/h).
 * Le bord droit descend en premier dans le path, le bord gauche remonte ensuite.
 */
const _BURETTE_TRANSITION_PTS = [
  { y: 170.03,  xLeft: 84.764, xRight: 92.485 }, // GRAD25_Y (tube plein)
  { y: 172.32,  xLeft: 84.764, xRight: 92.485 }, // avant rétrécissement
  { y: 175.13,  xLeft: 84.808, xRight: 92.241 },
  { y: 176.19,  xLeft: 85.757, xRight: 91.429 },
  { y: 179.66,  xLeft: 85.754, xRight: 91.141 },
  { y: 182.99,  xLeft: 86.039, xRight: 91.141 },
  { y: 192.07,  xLeft: 86.203, xRight: 90.950 },
  { y: 193.81,  xLeft: 86.619, xRight: 90.681 },
  { y: 205.86,  xLeft: 86.623, xRight: 90.681 },
  { y: 208.15,  xLeft: 87.000, xRight: 90.298 },
  { y: 210.00,  xLeft: 87.641, xRight: 89.663 }, // juste au-dessus du fond
];

function _especesXBornesAtY(y) {
  const pts = _BURETTE_TRANSITION_PTS;
  if (y <= pts[0].y) {
    return { xLeft: BURETTE.TUBE_X, xRight: BURETTE.TUBE_X + BURETTE.TUBE_W };
  }
  if (y >= pts[pts.length - 1].y) {
    const p = pts[pts.length - 1];
    return { xLeft: p.xLeft, xRight: p.xRight };
  }
  for (let i = 0; i < pts.length - 1; i++) {
    if (y >= pts[i].y && y <= pts[i + 1].y) {
      const t = (y - pts[i].y) / (pts[i + 1].y - pts[i].y);
      return {
        xLeft:  pts[i].xLeft  + t * (pts[i + 1].xLeft  - pts[i].xLeft),
        xRight: pts[i].xRight + t * (pts[i + 1].xRight - pts[i].xRight),
      };
    }
  }
  return { xLeft: BURETTE.TUBE_X, xRight: BURETTE.TUBE_X + BURETTE.TUBE_W };
}

/**
 * Bornes courantes de la zone burette (espace utile pour les sphères
 * dans la partie graduée, entre le ménisque et la graduation 25).
 *
 * Le ménisque (yTop) descend au fur et à mesure du versement.
 * yMax = GRAD25_Y - R = limite basse de la partie graduée.
 * Sous GRAD25_Y se trouve la zone tampon (pointe + extension), traitée
 * séparément par la logique de descente en bloc.
 */
function _especesZoneBurette() {
  const vMod   = state.titrageVverse % BURETTE.MAX_ML;
  const yTop   = BURETTE.CLIP_TOP + vMod * BURETTE.SCALE_Y;
  const yBot   = ESPECES.GRAD25_Y;
  const xMin   = BURETTE.TUBE_X + ESPECES.R + 0.2;
  const xMax   = BURETTE.TUBE_X + BURETTE.TUBE_W - ESPECES.R - 0.2;
  return {
    xMin, xMax,
    yMin: yTop + ESPECES.R + 0.3,
    yMax: yBot - ESPECES.R,
    yTopMenisque: yTop,
    yGrad25:      yBot,
    hauteurUtile: Math.max(0, yBot - yTop - 2 * ESPECES.R),
  };
}

/** Bornes courantes de la zone bécher (lecture DOM de #liquide-becher). */
function _especesZoneBecher() {
  const liq = document.getElementById('liquide-becher');
  const y   = liq ? parseFloat(liq.getAttribute('y')) : BECHER.CLIP_BOT;
  const h   = liq ? parseFloat(liq.getAttribute('height')) : 0;
  const yTop = y;
  const yBot = y + h;
  // yMax global = fond du bécher (les sphères trop proches du barreau sont
  // repoussées individuellement dans _especesBrownienStep).
  const yMaxUtile = yBot - ESPECES.R - 0.3;
  const xMin = BECHER.CLIP_X + ESPECES.R + 0.5;
  const xMax = BECHER.CLIP_X + BECHER.CLIP_W - ESPECES.R - 0.5;
  return {
    xMin, xMax,
    yMin: yTop + ESPECES.R + 0.5,
    yMax: Math.max(yTop + ESPECES.R + 1, yMaxUtile),
    yTop,
  };
}

/** Tire un nombre aléatoire ~ N(0, 1) approximé par somme de 3 uniformes. */
function _especesRandn() {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 1.4;
}

/** Position aléatoire dans une zone {xMin,xMax,yMin,yMax}. */
function _especesRandPos(zone) {
  return {
    x: zone.xMin + Math.random() * Math.max(0.01, zone.xMax - zone.xMin),
    y: zone.yMin + Math.random() * Math.max(0.01, zone.yMax - zone.yMin),
  };
}

/** Crée un objet sphère. */
function _especesCreerSphere(id, role, zone, opts = {}) {
  const z = (zone === 'burette') ? _especesZoneBurette() : _especesZoneBecher();
  const p = opts.pos || _especesRandPos(z);
  const sphere = {
    uid:    ++_especesNextId,
    id, role, zone,
    x: p.x, y: p.y,
    vx: (Math.random() - 0.5) * 1.5,
    vy: (Math.random() - 0.5) * 1.5,
    state:  opts.state  || 'brownien',
    target: opts.target || null,
    tMig:   0,
    tFlash: opts.tFlash || 0,
    descenteFromY: opts.descenteFromY || null,
    descenteToY:   opts.descenteToY   || null,
    // ─── Couplage tranche (burette uniquement) ───
    // trancheIdx : T = numéro de tranche depuis le ménisque INITIAL du cycle.
    //   T=0 est juste sous le ménisque à vMod=0, T=N-1 est tout en bas (juste
    //   au-dessus de la graduation 25). Les tranches descendent solidairement
    //   avec le ménisque ; la tranche T=N-1 est éjectée en premier.
    // hTranche : hauteur d'une tranche en unités SVG (constante pour ce cycle).
    // yLocal : position de la sphère DANS sa tranche, CENTRÉE
    //   (∈ [-hTranche/2 + R, hTranche/2 - R]). C'est sur yLocal que le
    //   brownien est intégré (clamp à |yLocal| ≤ hTranche/2 - R).
    trancheIdx: (opts.trancheIdx != null) ? opts.trancheIdx : null,
    hTranche:   (opts.hTranche   != null) ? opts.hTranche   : null,
    vParTranche:(opts.vParTranche != null) ? opts.vParTranche: null,
    nTranches:  (opts.nTranches  != null) ? opts.nTranches  : null,
    yLocal:     (opts.yLocal     != null) ? opts.yLocal     : null,
    yBasRel:    (opts.yBasRel    != null) ? opts.yBasRel    : null,
    // Migration groupée : id du paquet (= trancheIdx + cycle) pour regrouper
    // les sphères de réaction qui arrivent ensemble dans le bécher.
    paquetId:       opts.paquetId || null,
    // Flag : si éjectée et de rôle titrante → cherche un titré dans le bécher.
    _reagit: !!opts._reagit,
  };
  return sphere;
}

/**
 * Initialise les espèces pour la réaction courante :
 *  - Reset state.titrageEspecesVisible (cochés sauf spectateurs).
 *  - Recalcule V_par_sphere_titrant à partir de Veq.
 *  - Vide la liste des sphères et la file d'éjection.
 */
function _initEspeces() {
  const entry = _especesGetRxnEntry();
  state.titrageEspecesVisible = {};
  if (entry && entry.especes) {
    entry.especes.forEach(e => {
      state.titrageEspecesVisible[e.id] = (e.role !== 'spectateur');
    });
  }
  // V par sphère de titrant : à l'équivalence, on doit avoir exactement
  // N_titrant_eq = N_TITRE_INIT × coeffTitrant / coeffTitre sphères versées.
  const { coeffTitre, coeffTitrant } = _especesCoeffs(entry);
  const veq = _calcVeq();
  if (veq && veq > 0 && coeffTitre > 0) {
    const nTitrantEq = ESPECES.N_TITRE_INIT * (coeffTitrant / coeffTitre);
    _especesVparSphere = veq / nTitrantEq;
  } else {
    _especesVparSphere = null;
  }
  _especesSpheres   = [];
  _especesGroupesReaction = {};
  _especesVverseRef = state.titrageVverse;
}


/**
 * Génère l'état initial des sphères (à appeler après _initEspeces) :
 *
 *  - Bécher : N_TITRE_INIT sphères de titré + spectateurs apportés par la
 *    solution titrée (au prorata de coeffTitree), placés aléatoirement.
 *
 *  - Burette : sphères de titrant (et spectateurs apportés) organisées en
 *    TRANCHES stœchiométriques horizontales (voir `_remplirBurette`).
 *    Chaque tranche représente V_par_tranche = ν_titrant × V_par_sphère mL
 *    et contient ν_titrant titrants + leurs spectateurs au prorata.
 *    Quand le ménisque atteint le bas d'une tranche, toutes ses sphères
 *    basculent ensemble en descente vers le bécher, où elles déclenchent
 *    une réaction groupée avec ν_titré sphères de titré (`_especesTenterReactionPaquet`).
 */
function _genererSpheres() {
  _especesSpheres = [];
  const entry = _especesGetRxnEntry();
  if (!entry || !entry.especes) return;
  const especes  = entry.especes;
  const eTitree  = especes.find(e => e.role === 'titree');
  const eTitrante = especes.find(e => e.role === 'titrante');

  // ── BÉCHER : titré + spectateurs initiaux (coeffTitree) ──
  // Si le titrage a déjà commencé (V > 0), on retire les titrés déjà consommés.
  // nTitresConsommes = floor(Vverse / vParTranche) × nuTitre, plafonné à N_TITRE_INIT.
  if (state.titrageV1 > 0 && eTitree) {
    const { coeffTitrant, coeffTitre } = _especesCoeffs(entry);
    const nuTitrant = Math.max(1, Math.round(coeffTitrant));
    const nuTitre   = Math.max(1, Math.round(coeffTitre));
    const vParTranche = nuTitrant * (_especesVparSphere || 0);
    const nTranchesVersees = (vParTranche > 0)
      ? Math.floor(state.titrageVverse / vParTranche)
      : 0;
    const nTitresConsommes = Math.min(
      ESPECES.N_TITRE_INIT,
      nTranchesVersees * nuTitre
    );
    const nTitresRestants = ESPECES.N_TITRE_INIT - nTitresConsommes;

    for (let i = 0; i < nTitresRestants; i++) {
      _especesSpheres.push(_especesCreerSphere(eTitree.id, 'titree', 'becher'));
    }
    // Spectateurs bécher : toujours présents (non consommés).
    especes.forEach(e => {
      if (e.role === 'spectateur' && e.coeffTitree != null && e.coeffTitree > 0) {
        const n = Math.round(ESPECES.N_TITRE_INIT * e.coeffTitree);
        for (let i = 0; i < n; i++) {
          _especesSpheres.push(_especesCreerSphere(e.id, 'spectateur', 'becher'));
        }
      }
      // Spectateurs apportés par le titrant déjà versé.
      if (e.role === 'spectateur' && e.coeffTitrant != null && e.coeffTitrant > 0) {
        const nTitrantVersees = Math.floor(state.titrageVverse / (_especesVparSphere || Infinity));
        const n = Math.round(nTitrantVersees * e.coeffTitrant);
        for (let i = 0; i < n; i++) {
          _especesSpheres.push(_especesCreerSphere(e.id, 'spectateur', 'becher'));
        }
      }
    });
    // Produits déjà formés : on les ajoute comme sphères brownien dans le bécher.
    const eProduits = especes.filter(e => e.role === 'produit');
    eProduits.forEach(ep => {
      const nProduits = Math.round(nTitresConsommes * (ep.coeff || 1) / nuTitre);
      for (let i = 0; i < nProduits; i++) {
        _especesSpheres.push(_especesCreerSphere(ep.id, 'produit', 'becher'));
      }
    });
  }

  // ── BURETTE : titrant + spectateurs apportés (coeffTitrant) ──
  _remplirBurette();

  _especesVverseRef = state.titrageVverse;
}

/**
 * (Re)remplit la burette avec les sphères de titrant + spectateurs apportés,
 * organisées en TRANCHES stœchiométriques horizontales.
 *
 * Une tranche représente exactement `V_par_tranche = ν_titrant × V_par_sphère`
 * mL versés. Elle contient :
 *   - ν_titrant sphères de titrant
 *   - ν_titrant × coeffTitrant_spectateur sphères de chaque spectateur
 *
 * Indexation : T = 0 est la tranche juste sous le ménisque INITIAL du cycle
 * courant (yMenisque = CLIP_TOP). T croît vers le bas jusqu'à T = N-1
 * (juste au-dessus de la graduation 25).
 *
 * Position virtuelle d'une tranche T à un instant donné :
 *   yHautVirtuel(T) = yMenisque + T × hTranche
 *   yBasVirtuel(T)  = yMenisque + (T+1) × hTranche
 * où yMenisque = CLIP_TOP + (vVerse % MAX_ML) × SCALE_Y.
 *
 * Les tranches descendent SOLIDAIREMENT avec le ménisque tant qu'elles sont
 * entièrement dans la zone graduée. Quand une tranche commence à dépasser
 * GRAD25_Y, elle entre en zone de transition et est compressée linéairement
 * vers le bas du clipPath (`α` ∈ [0, 1], voir `_animEspeces`).
 *
 * Toutes les sphères d'une tranche partagent le même `paquetId` (= cycle ×
 * 1000 + trancheIdx).
 *
 * Purge d'abord les sphères burette en état 'brownien' (les sphères en
 * 'descente' restent intactes, elles sont en chemin vers le bécher).
 */
function _remplirBurette() {
  _especesSpheres = _especesSpheres.filter(s => !(s.zone === 'burette' && s.state === 'brownien'));

  const entry = _especesGetRxnEntry();
  if (!entry || !entry.especes) return;
  const especes   = entry.especes;
  const eTitrante = especes.find(e => e.role === 'titrante');
  if (!_especesVparSphere || !eTitrante) return;

  const { coeffTitrant, coeffTitre } = _especesCoeffs(entry);
  const nuTitrant = Math.max(1, Math.round(coeffTitrant));
  const nuTitre   = Math.max(1, Math.round(coeffTitre));

  // Calibration de base :
  //   vParTranche = nuTitrant × _especesVparSphere
  //              = nuTitrant × Veq / (N_TITRE_INIT × nuTitrant/nuTitre)
  //              = nuTitre × Veq / N_TITRE_INIT
  // → à l'équivalence, nTransesEq = N_TITRE_INIT/nuTitre tranches versées
  //   (consomment exactement N_TITRE_INIT sphères de titré).
  const vParTrancheNominal = nuTitrant * _especesVparSphere;
  if (vParTrancheNominal <= 0) return;

  // ── Calibration des tranches : adapte le cycle d'équivalence ──
  //
  // Phase 1 (cycles avant kEq) : N = round(MAX_ML/vParTrancheNominal), toutes
  //   les tranches ont hTranche = (GRAD25_Y-CLIP_TOP)/N (zone graduée divisée
  //   en N parts égales).
  //
  // Phase 2 (cycle kEq qui contient Veq) :
  //   vPT_local = (Veq - kEq×MAX_ML) / (nTransesEq - kEq×N_phase1)
  //   → la nRest-ème tranche éjectée tombe pile à Veq.
  //   nTotal = floor(MAX_ML / vPT_local) tranches dans le cycle.
  //   Les (nTotal - 1) tranches du bas ont volume vPT_local.
  //   La tranche du haut (T=0) a volume résiduel vFinale = MAX_ML - (nTotal-1)*vPT_local
  //   (∈ [vPT_local, 2*vPT_local) par construction). Elle contient le même
  //   nombre de sphères que les autres (juste plus de hauteur visuelle).
  //   hTranche dimensionné en mL (= vPT × SCALE_Y) → critère visuel = critère mL.
  //
  // Phase 3 (cycles après kEq) : retour à Phase 1 nominale.
  const veq    = _calcVeq();
  const cycle  = Math.floor(state.titrageVverse / BURETTE.MAX_ML);
  const kEq    = (veq && veq > 0) ? Math.floor(veq / BURETTE.MAX_ML) : -1;
  const nPhase1 = Math.max(1, Math.round(BURETTE.MAX_ML / vParTrancheNominal));

  // tranchesParCycle = [{ hTranche, vParTranche, paquetId }, ...] de T=0 (haut) à T=N-1 (bas)
  let tranchesDef;
  if (cycle === kEq && veq > 0) {
    const nTransesEq = ESPECES.N_TITRE_INIT / nuTitre;
    const tranchesAvantKeq = kEq * nPhase1;
    const nRest = Math.max(1, Math.round(nTransesEq - tranchesAvantKeq));
    const vRest = veq - kEq * BURETTE.MAX_ML;
    if (vRest > 1e-6 && nRest > 0) {
      const vPTlocal = vRest / nRest;
      const nTotal   = Math.max(nRest, Math.floor(BURETTE.MAX_ML / vPTlocal));
      const vFinale  = BURETTE.MAX_ML - (nTotal - 1) * vPTlocal;
      const hTlocal  = vPTlocal * BURETTE.SCALE_Y;
      const hTfinale = vFinale  * BURETTE.SCALE_Y;
      tranchesDef = [];
      // T=0 (la grosse, en haut)
      tranchesDef.push({ hTranche: hTfinale, vParTranche: vFinale });
      // T=1..nTotal-1 (normales)
      for (let i = 1; i < nTotal; i++) {
        tranchesDef.push({ hTranche: hTlocal, vParTranche: vPTlocal });
      }
    } else {
      tranchesDef = _trancheDefUniforme(nPhase1, vParTrancheNominal);
    }
  } else {
    tranchesDef = _trancheDefUniforme(nPhase1, vParTrancheNominal);
  }

  const nTranches = tranchesDef.length;
  const yGrad0 = BURETTE.CLIP_TOP;

  // Espèces par tranche (titrant + spectateurs au prorata)
  const especesParTranche = [
    { id: eTitrante.id, role: 'titrante', mult: nuTitrant, _reagit: true },
  ];
  especes.forEach(e => {
    if (e.role === 'spectateur' && e.coeffTitrant != null && e.coeffTitrant > 0) {
      especesParTranche.push({
        id: e.id, role: 'spectateur',
        mult: Math.max(1, Math.round(nuTitrant * e.coeffTitrant)),
        _reagit: false,
      });
    }
  });

  // Position : on calcule yBasRel pour chaque tranche en accumulant en mL
  // (puis conversion × SCALE_Y en une seule fois) pour éviter l'erreur
  // flottante cumulée de N additions de vPT × SCALE_Y.
  const vMod = state.titrageVverse % BURETTE.MAX_ML;
  const yMenisque = yGrad0 + vMod * BURETTE.SCALE_Y;
  let vBasCumul = 0; // offset du bas de la tranche courante, en mL, depuis le ménisque
  for (let T = 0; T < nTranches; T++) {
    const def = tranchesDef[T];
    vBasCumul += def.vParTranche;
    const yBasRel = vBasCumul * BURETTE.SCALE_Y;
    const yHaut   = yMenisque + yBasRel - def.hTranche;
    // Skip si déjà éjectée (haut de la tranche déjà sous GRAD25_Y).
    if (yHaut >= ESPECES.GRAD25_Y) continue;
    const yCentre  = yMenisque + yBasRel - def.hTranche / 2;
    const paquetId = `c${cycle}t${T}`;
    _creerTrancheSpheres({
      paquetId, trancheIdx: T,
      hTranche: def.hTranche,
      vParTranche: def.vParTranche,
      nTranches,
      yCentreInit: yCentre,
      yBasRel,
      especesParTranche,
    });
  }
}

/** Tableau uniforme de nTranches tranches identiques (Phase 1/3).
 *  vParTranche effectif = MAX_ML/nTranches (visuel, pas nominal stœchio). */
function _trancheDefUniforme(nTranches, vParTrancheNominal) {
  const hT = (ESPECES.GRAD25_Y - BURETTE.CLIP_TOP) / nTranches;
  const vPTeff = BURETTE.MAX_ML / nTranches; // volume visuel par tranche (= MAX_ML/N)
  const arr = [];
  for (let i = 0; i < nTranches; i++) arr.push({ hTranche: hT, vParTranche: vPTeff });
  return arr;
}

/**
 * Helper : crée toutes les sphères d'une tranche (titrant + spectateurs prorata)
 * et les ajoute à _especesSpheres.
 */
function _creerTrancheSpheres({ paquetId, trancheIdx, hTranche, vParTranche,
                                nTranches, yCentreInit, yBasRel, especesParTranche }) {
  const pool = [];
  especesParTranche.forEach(eb => {
    for (let i = 0; i < eb.mult; i++) pool.push(eb);
  });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const n = pool.length;
  const yLocalMax = Math.max(0.05, hTranche / 2 - ESPECES.R - 0.2);
  const bordsInit = _especesXBornesAtY(yCentreInit);
  const xSpanInit = Math.max(0.4, (bordsInit.xRight - bordsInit.xLeft) - 2 * (ESPECES.R + 0.2));
  const xCentreInit = (bordsInit.xLeft + bordsInit.xRight) / 2;
  pool.forEach((eb, k) => {
    const frac   = (n > 1) ? (k + 0.5) / n : 0.5;
    const x      = xCentreInit + (frac - 0.5) * xSpanInit * 0.7 + (Math.random() - 0.5) * 0.5;
    const yLocal = (Math.random() - 0.5) * 2 * yLocalMax;
    const yAbs   = yCentreInit + yLocal;
    const s = _especesCreerSphere(eb.id, eb.role, 'burette', {
      pos: { x, y: yAbs },
      _reagit: eb._reagit,
      trancheIdx, hTranche, vParTranche, nTranches,
      yLocal, paquetId,
      yBasRel,
    });
    _especesSpheres.push(s);
  });
}

/**
 * Hook appelé à chaque ajouterTitrant().
 *
 * Rôle principal : détecter le franchissement d'un multiple de MAX_ML
 * (recharge de la burette) et régénérer les sphères burette à ce moment-là.
 *
 * Le reste du temps (versement courant à l'intérieur d'un cycle de 25 mL),
 * la descente solidaire des sphères avec le ménisque est gérée par
 * `_animEspeces` via le couplage yRel.
 */
function _syncSpheresAvecVerse() {
  if (!state.titrageShowEspeces) {
    _especesVverseRef = state.titrageVverse;
    return;
  }
  // Détection de recharge : si floor(V/MAX_ML) a augmenté depuis le
  // dernier appel, on régénère la burette (qui était visuellement vide).
  const cycleAvant  = Math.floor(_especesVverseRef / BURETTE.MAX_ML);
  const cycleApres  = Math.floor(state.titrageVverse / BURETTE.MAX_ML);
  if (cycleApres > cycleAvant) {
    // AVANT la recharge : éjecter toutes les tranches résiduelles du cycle
    // précédent (cas où MAX_ML/vParTranche n'est pas entier → tranche partielle
    // qui n'a jamais atteint son seuil d'éjection en mL).
    const paquetsResiduels = new Set();
    for (const s of _especesSpheres) {
      if (s.zone === 'burette' && s.state === 'brownien' && s.paquetId) {
        paquetsResiduels.add(s.paquetId);
      }
    }
    paquetsResiduels.forEach(pid => _especesAmorcerDescenteTranche(pid));
    _remplirBurette();
  }
  _especesVverseRef = state.titrageVverse;
}

/**
 * Démarre la descente d'une SPHÈRE individuelle (cas edge, ex. spectateur isolé).
 * Préfère `_especesAmorcerDescenteTranche` pour les sphères de tranche.
 */
function _especesAmorcerDescente(s) {
  s.zone   = 'becher';
  s.state  = 'descente';
  s.x      = 88.668;
  s.y      = BURETTE.CLIP_BOT;
  s.descenteFromY = BURETTE.CLIP_BOT;
}

/**
 * Démarre la descente GROUPÉE de toutes les sphères d'une tranche
 * (même `paquetId`). Elles partent ensemble depuis leur position actuelle
 * (qui doit être en bas de la zone tampon, juste au-dessus de CLIP_BOT_BURETTE
 * grâce à l'interpolation α_tranche) et descendent côte à côte dans le filet.
 *
 * On préserve approximativement leur disposition horizontale (autour du filet)
 * pour un effet visuel naturel : pas de "saut" vers x=88.668.
 */
function _especesAmorcerDescenteTranche(paquetId) {
  const sphPaquet = _especesSpheres.filter(
    s => s.paquetId === paquetId && s.zone === 'burette' && s.state === 'brownien'
  );
  if (sphPaquet.length === 0) return;
  const xFilet = 88.668;
  sphPaquet.forEach((s) => {
    s.zone  = 'becher';   // logiquement destinée au bécher
    s.state = 'descente';
    // Léger jitter en x autour du filet (largeur ≈ 2)
    s.x = xFilet + (Math.random() - 0.5) * 0.8;
    // y conservé : la sphère continue depuis sa position courante en zone tampon
    s.descenteFromY = s.y;
  });
}

/** Cherche la sphère de titré la plus proche dans le bécher (état brownien). */
function _especesChercherTitre(sTitrant, eTitreeId) {
  let best = null;
  let dMin = Infinity;
  for (const s of _especesSpheres) {
    if (s.zone !== 'becher') continue;
    if (s.id !== eTitreeId) continue;
    if (s.state !== 'brownien') continue;
    const dx = s.x - sTitrant.x;
    const dy = s.y - sTitrant.y;
    const d2 = dx*dx + dy*dy;
    if (d2 < dMin) { dMin = d2; best = s; }
  }
  return best;
}

/**
 * Tente de déclencher la réaction groupée d'un paquet (une tranche complète
 * arrivée dans le bécher).
 *
 * Conditions :
 *  - Tous les titrants du paquet (ν_titrant) sont arrivés (état 'attente').
 *  - Il existe ν_titré sphères de titré encore disponibles (état 'brownien').
 *
 * Si oui : sélectionne les ν_titré titrés les plus proches du barycentre
 * des titrants, et bascule l'ensemble (titrants + titrés) en migration vers
 * leur barycentre commun, où la réaction se produira (création des produits).
 *
 * Si pas assez de titrés disponibles : les titrants restent en 'attente'
 * (ils attendront éventuellement, ou seront convertis en 'brownien' si
 * c'est la phase d'excès — détecté ici par absence de tout titré).
 */
function _especesTenterReactionPaquet(paquetId, eTitreeId) {
  if (!paquetId || !eTitreeId) return;
  const entry = _especesGetRxnEntry();
  if (!entry) return;
  const { coeffTitre, coeffTitrant } = _especesCoeffs(entry);
  const nuTitrant = Math.max(1, Math.round(coeffTitrant));
  const nuTitre   = Math.max(1, Math.round(coeffTitre));

  // 1) Titrants du paquet en attente
  const titrants = _especesSpheres.filter(
    s => s.paquetId === paquetId && s.zone === 'becher' && s.state === 'attente' && s._reagit
  );
  if (titrants.length < nuTitrant) return; // pas encore tous arrivés

  // 2) Barycentre des titrants
  let cxT = 0, cyT = 0;
  titrants.forEach(s => { cxT += s.x; cyT += s.y; });
  cxT /= titrants.length;
  cyT /= titrants.length;

  // 3) Chercher ν_titré titrés les plus proches du barycentre
  const titres = _especesSpheres
    .filter(s => s.zone === 'becher' && s.id === eTitreeId && s.state === 'brownien')
    .map(s => {
      const dx = s.x - cxT, dy = s.y - cyT;
      return { s, d2: dx*dx + dy*dy };
    })
    .sort((a, b) => a.d2 - b.d2)
    .slice(0, nuTitre)
    .map(o => o.s);

  if (titres.length < nuTitre) {
    // Vérifier s'il reste des titrés en cours de migration (réaction en cours) :
    // dans ce cas on attend plutôt que de déclarer l'excès prématurément.
    const titresEnRoute = _especesSpheres.filter(
      s => s.zone === 'becher' && s.id === eTitreeId &&
           (s.state === 'migration_groupe' || s.state === 'migration')
    );
    if (titresEnRoute.length > 0) return; // on retentera à la prochaine frame
    // Vraiment plus de titré disponible : phase d'excès.
    titrants.forEach(s => { s.state = 'brownien'; });
    return;
  }

  // 4) Barycentre commun des ν_titrant + ν_titré sphères réagissantes
  const reagissants = titrants.concat(titres);
  let cx = 0, cy = 0;
  reagissants.forEach(s => { cx += s.x; cy += s.y; });
  cx /= reagissants.length;
  cy /= reagissants.length;

  // 5) Bascule tous en migration groupée vers (cx, cy)
  const groupeId = `g${++_especesNextId}`;
  reagissants.forEach(s => {
    s.state    = 'migration_groupe';
    s.tMig     = 0;
    s.targetX  = cx;
    s.targetY  = cy;
    s.groupeId = groupeId;
    s.x0       = s.x;
    s.y0       = s.y;
  });
  // Stocker le groupe pour la réaction au contact (le 1er à terminer déclenche)
  _especesGroupesReaction[groupeId] = {
    titrants, titres, cx, cy, declenche: false,
  };
}

/**
 * Déclenche la réaction entre une sphère de titrant et une sphère de titré :
 *  - Supprime les deux sphères.
 *  - Crée les sphères-produits au point de contact (avec state='flash').
 *    Stœchiométrie : pour chaque produit, on crée e.coeff sphères.
 *
 * Note : utilisée uniquement pour les cas dégradés (ex. titrant en excès
 * qui rencontre un titré isolé). La voie principale est la réaction
 * groupée `_especesReactionGroupee`.
 */
function _especesReaction(sT, sR) {
  const entry = _especesGetRxnEntry();
  if (!entry) return;
  const cx = (sT.x + sR.x) / 2;
  const cy = (sT.y + sR.y) / 2;
  const { coeffTitre } = _especesCoeffs(entry);
  _especesSpheres = _especesSpheres.filter(s => s !== sT && s !== sR);
  (entry.especes || []).forEach(e => {
    if (e.role !== 'produit' && e.role !== 'precipite') return;
    const n = Math.max(1, Math.round(e.coeff / coeffTitre));
    const zoneBornes = _especesZoneBecher();
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / Math.max(1, n) + Math.random() * 0.7;
      const r     = 0.6 + Math.random() * 0.5;
      let nx = cx + Math.cos(angle) * r;
      let ny = cy + Math.sin(angle) * r;
      nx = Math.max(zoneBornes.xMin, Math.min(zoneBornes.xMax, nx));
      ny = Math.max(zoneBornes.yMin, Math.min(zoneBornes.yMax, ny));
      _especesSpheres.push(_especesCreerSphere(e.id, e.role, 'becher', {
        state: 'flash',
        pos: { x: nx, y: ny },
        tFlash: ESPECES.FLASH_DURATION,
      }));
    }
  });
}

/**
 * Réaction groupée déclenchée à la fin de la migration d'un paquet :
 *  - Supprime les ν_titrant sphères de titrant + ν_titré sphères de titré.
 *  - Crée au barycentre (cx, cy) le bon nombre de chaque produit
 *    (= coefficient stœchiométrique du produit, puisque la stœchio entière
 *    "ν_titrant + ν_titré → produits" est consommée d'un coup).
 */
function _especesReactionGroupee(groupe) {
  const entry = _especesGetRxnEntry();
  if (!entry) return;
  const { cx, cy, titrants, titres } = groupe;
  const reagissants = new Set([...titrants, ...titres]);
  _especesSpheres = _especesSpheres.filter(s => !reagissants.has(s));

  const zoneBornes = _especesZoneBecher();
  (entry.especes || []).forEach(e => {
    if (e.role !== 'produit' && e.role !== 'precipite') return;
    const n = Math.max(1, Math.round(e.coeff));
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / Math.max(1, n) + Math.random() * 0.7;
      const r     = 0.8 + Math.random() * 0.7;
      let nx = cx + Math.cos(angle) * r;
      let ny = cy + Math.sin(angle) * r;
      nx = Math.max(zoneBornes.xMin, Math.min(zoneBornes.xMax, nx));
      ny = Math.max(zoneBornes.yMin, Math.min(zoneBornes.yMax, ny));
      _especesSpheres.push(_especesCreerSphere(e.id, e.role, 'becher', {
        state: 'flash',
        pos: { x: nx, y: ny },
        tFlash: ESPECES.FLASH_DURATION,
      }));
    }
  });
}

/** Une frame d'animation : intègre la dynamique de chaque sphère. */
function _animEspeces(ts) {
  if (!state.titrageShowEspeces) {
    _especesRAF = null;
    _especesLastTime = null;
    return;
  }
  if (_especesLastTime === null) _especesLastTime = ts;
  let dt = (ts - _especesLastTime) / 1000;
  _especesLastTime = ts;
  if (dt > 0.1) dt = 0.1; // cap (anti gros saut après tab hidden)

  // 1) Zones (recalculées chaque frame car le ménisque burette descend)
  const zBurette = _especesZoneBurette();
  const zBecher  = _especesZoneBecher();

  // 2) Détection des tranches éjectées : la tranche est éjectée quand son
  //    HAUT franchit GRAD25_Y (= tranche entièrement passée sous la graduation),
  //    i.e. yMenisque + (yBasRel - hTranche) ≥ GRAD25_Y.
  //    yBasRel = offset constant du bas de la tranche par rapport au ménisque
  //    (figé à la création, indépendant des hT des autres tranches).
  let nTranchesBascule = 0;
  const tranchesABascule = new Set();
  for (const s of _especesSpheres) {
    if (s.zone !== 'burette' || s.state !== 'brownien') continue;
    if (s.yBasRel == null || s.hTranche == null) continue;
    if (zBurette.yTopMenisque + s.yBasRel - s.hTranche >= ESPECES.GRAD25_Y - 1e-9) {
      tranchesABascule.add(s.paquetId);
    }
  }
  const tranchesArr = Array.from(tranchesABascule).slice(0, ESPECES.MAX_TRANCHES_DESCENTE_PAR_FRAME);
  for (const paquetId of tranchesArr) {
    _especesAmorcerDescenteTranche(paquetId);
    nTranchesBascule++;
  }

  // 3) Mise à jour de chaque sphère
  const entry    = _especesGetRxnEntry();
  const eTitree  = entry ? (entry.especes || []).find(e => e.role === 'titree') : null;
  const eTitreeId = eTitree ? eTitree.id : null;

  for (let i = _especesSpheres.length - 1; i >= 0; i--) {
    const s = _especesSpheres[i];
    if (s.state === 'flash') {
      s.tFlash -= dt;
      if (s.tFlash <= 0) {
        s.state  = 'brownien';
        s.tFlash = 0;
      }
      // Petit brownien atténué pendant le flash
      _especesBrownienStep(s, dt, zBecher, 0.4);
    } else if (s.state === 'descente') {
      // Descente verticale le long du filet
      s.y += ESPECES.DESCENTE_VITESSE * dt;
      // Petite oscillation horizontale autour du filet (88.668)
      s.x = 88.668 + Math.sin(ts * 0.012 + s.uid) * 0.3;
      // Arrivée à la surface du liquide bécher
      if (s.y >= zBecher.yTop + ESPECES.R + 0.5) {
        s.y = zBecher.yTop + ESPECES.R + 0.5;
        if (s._reagit && eTitreeId && s.paquetId) {
          // Bascule temporairement en 'attente' pour synchroniser le paquet
          s.state = 'attente';
          // Test de complétude du paquet : tous les titrants du même paquet
          // sont-ils arrivés (état 'attente' OU 'brownien' déjà placés) ?
          _especesTenterReactionPaquet(s.paquetId, eTitreeId);
        } else {
          // Spectateur ou rôle non-réactif : brownien directement
          s.state = 'brownien';
        }
      }
    } else if (s.state === 'attente') {
      // En attente que tous les titrants du paquet soient arrivés.
      // Pas de mouvement (statique au point d'arrivée).
      // Note : si pour une raison quelconque l'arrivée ne se complète pas
      // (ex. animation suspendue), on retente la réaction périodiquement
      // au cas où d'autres sphères du paquet seraient arrivées.
      _especesTenterReactionPaquet(s.paquetId, eTitreeId);
    } else if (s.state === 'migration') {
      s.tMig += dt;
      const t = Math.min(1, s.tMig / ESPECES.MIG_DURATION);
      // Point de rendez-vous = milieu entre s et target (figé à l'instant de mise en migration)
      // Pour simplifier on recalcule en continu : convergence par easing.
      const ease = (t < 0.5) ? 2*t*t : 1 - Math.pow(-2*t+2, 2) / 2;
      const tx = (s.x + s.target.x) / 2;
      const ty = (s.y + s.target.y) / 2;
      s.x += (tx - s.x) * ease * 0.55;
      s.y += (ty - s.y) * ease * 0.55;
      // Détection de contact : seul un des deux déclenche la réaction
      const dx = s.x - s.target.x;
      const dy = s.y - s.target.y;
      const d  = Math.sqrt(dx*dx + dy*dy);
      const isPrincipal = s.uid < s.target.uid;
      if ((d < ESPECES.R * 2.1 || t >= 1) && isPrincipal) {
        const partner = s.target;
        // Décider qui est le titrant et qui est le titré (le réactif "titrant" devient produit aussi)
        const sTitrant = (s.role === 'titrante' || s._reagit) ? s : partner;
        const sTitree  = sTitrant === s ? partner : s;
        _especesReaction(sTitrant, sTitree);
      }
    } else if (s.state === 'migration_groupe') {
      // Migration groupée vers (targetX, targetY) = barycentre du paquet.
      s.tMig += dt;
      const t = Math.min(1, s.tMig / ESPECES.MIG_DURATION);
      const ease = (t < 0.5) ? 2*t*t : 1 - Math.pow(-2*t+2, 2) / 2;
      s.x = s.x0 + (s.targetX - s.x0) * ease;
      s.y = s.y0 + (s.targetY - s.y0) * ease;
      // Une seule sphère du groupe déclenche la réaction quand t≥1
      const groupe = _especesGroupesReaction[s.groupeId];
      if (groupe && !groupe.declenche && t >= 1) {
        groupe.declenche = true;
        _especesReactionGroupee(groupe);
        delete _especesGroupesReaction[s.groupeId];
      }
    } else { // 'brownien'
      if (s.zone === 'burette') {
        // Modèle "tranches empilées sous le ménisque" :
        //
        // Position virtuelle d'une tranche T à un instant donné :
        //   yHautVirtuel(T) = yMenisque + T × hTranche
        //   yBasVirtuel(T)  = yMenisque + (T+1) × hTranche
        // où yMenisque = position courante du ménisque (descend avec V).
        //
        // Tant que la tranche est entièrement au-dessus de GRAD25_Y, sa
        // position réelle = position virtuelle : elle descend solidairement
        // avec le ménisque.
        //
        // Quand la tranche commence à dépasser GRAD25_Y, on compresse :
        //   α = clamp((yBasVirtuel - GRAD25_Y) / hTranche, 0, 1)
        //   yCentreReel = (1-α)×yCentreVirtuel + α×(CLIP_BOT_BURETTE - hTranche/2)
        //
        // À α=1 (tranche entièrement passée sous GRAD25_Y), la tranche est
        // au bas du clipPath, prête à être éjectée (gérée à l'étape 2).
        //
        // Chaque sphère conserve son yLocal (offset dans la tranche) et son
        // mouvement brownien. Le brownien est intégré sur (x, yLocal) ;
        // la position monde y est recalculée à partir de yCentreReel et yLocal.
        if (s.yBasRel == null || s.hTranche == null) {
          _especesBrownienStep(s, dt, zBurette, ESPECES.V_BROWN_BURETTE / ESPECES.V_BROWN);
        } else {
          const hTranche = s.hTranche;
          // Position virtuelle : yBasVirtuel = yMenisque + yBasRel, où yBasRel
          // est l'offset constant du bas de la tranche par rapport au ménisque
          // (figé à la création, indépendant des hT des autres tranches dans
          // le cycle d'équivalence).
          const yBasVirtuel    = zBurette.yTopMenisque + s.yBasRel;
          const yCentreVirtuel = yBasVirtuel - hTranche / 2;
          // α : compression vers la zone tampon quand la tranche dépasse GRAD25_Y
          const alpha = Math.max(0, Math.min(1,
            (yBasVirtuel - ESPECES.GRAD25_Y) / Math.max(0.01, hTranche)
          ));
          const yCentreFinal = ESPECES.CLIP_BOT_BURETTE - hTranche / 2;
          const yCentre      = (1 - alpha) * yCentreVirtuel + alpha * yCentreFinal;

          if (s.yLocal == null) s.yLocal = 0;

          const ampli = ESPECES.V_BROWN_BURETTE;
          const sc    = ampli / ESPECES.V_BROWN;
          s.vx += _especesRandn() * ESPECES.V_BROWN * sc * dt * 8;
          s.vy += _especesRandn() * ESPECES.V_BROWN * sc * dt * 8;
          s.vx *= ESPECES.DAMPING;
          s.vy *= ESPECES.DAMPING;
          s.x      += s.vx * dt * 5;
          s.yLocal += s.vy * dt * 5;
          // Bornes horizontales : dépendent de y pour respecter le
          // rétrécissement de la burette dans la zone de transition
          const yWorld = yCentre + s.yLocal;
          const bords  = _especesXBornesAtY(yWorld);
          const xMinB  = bords.xLeft  + ESPECES.R + 0.15;
          const xMaxB  = bords.xRight - ESPECES.R - 0.15;
          if (s.x < xMinB) { s.x = xMinB; s.vx = Math.abs(s.vx) * 0.6; }
          if (s.x > xMaxB) { s.x = xMaxB; s.vx = -Math.abs(s.vx) * 0.6; }
          const yLocMax = Math.max(0.1, hTranche / 2 - ESPECES.R - 0.1);
          if (s.yLocal < -yLocMax) { s.yLocal = -yLocMax; s.vy = Math.abs(s.vy) * 0.6; }
          if (s.yLocal >  yLocMax) { s.yLocal =  yLocMax; s.vy = -Math.abs(s.vy) * 0.6; }
          s.y = yCentre + s.yLocal;
        }
      } else {
        _especesBrownienStep(s, dt, zBecher, 1.0);
      }
    }
  }

  // 3) Rendu DOM
  _renderSpheres();

  _especesRAF = requestAnimationFrame(_animEspeces);
}

/** Mouvement brownien + rebond élastique sur les bornes de zone. */
function _especesBrownienStep(s, dt, zone, scaleFactor) {
  const sc = scaleFactor != null ? scaleFactor : 1.0;
  s.vx += _especesRandn() * ESPECES.V_BROWN * sc * dt * 8;
  s.vy += _especesRandn() * ESPECES.V_BROWN * sc * dt * 8;
  s.vx *= ESPECES.DAMPING;
  s.vy *= ESPECES.DAMPING;
  s.x  += s.vx * dt * 5;
  s.y  += s.vy * dt * 5;
  // Rebond élastique
  if (s.x < zone.xMin) { s.x = zone.xMin; s.vx = Math.abs(s.vx) * 0.6; }
  if (s.x > zone.xMax) { s.x = zone.xMax; s.vx = -Math.abs(s.vx) * 0.6; }
  if (s.y < zone.yMin) { s.y = zone.yMin; s.vy = Math.abs(s.vy) * 0.6; }
  if (s.y > zone.yMax) { s.y = zone.yMax; s.vy = -Math.abs(s.vy) * 0.6; }
}

/** Rendu DOM : synchronise les <circle> dans les groupes SVG. */
function _renderSpheres() {
  const gBur = document.getElementById('especes-burette');
  const gBec = document.getElementById('especes-becher');
  if (!gBur || !gBec) return;

  // Index des <circle> et <rect> existants par uid (data-uid)
  const existants = {};
  gBur.querySelectorAll('[data-uid]').forEach(c => { existants[c.dataset.uid] = c; });
  gBec.querySelectorAll('[data-uid]').forEach(c => { existants[c.dataset.uid] = c; });

  const uidsVivants = new Set();
  for (const s of _especesSpheres) {
    // Filtrage par checkbox de légende
    if (state.titrageEspecesVisible && state.titrageEspecesVisible[s.id] === false) {
      // Si un élément existe encore, on le supprime
      const old = existants[s.uid];
      if (old && old.parentNode) old.parentNode.removeChild(old);
      continue;
    }
    uidsVivants.add(String(s.uid));
    let c = existants[s.uid];
    const groupeCible = (s.zone === 'burette') ? gBur : gBec;
    const isPrecipite = (s.role === 'precipite');
    if (!c) {
      if (isPrecipite) {
        // Précipité : carré gris
        c = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        c.setAttribute('data-uid', s.uid);
        c.setAttribute('width',  (ESPECES.R * 2).toFixed(2));
        c.setAttribute('height', (ESPECES.R * 2).toFixed(2));
        c.setAttribute('fill',   '#c8c8c8');
        c.setAttribute('stroke', '#888888');
        c.setAttribute('stroke-width', '0.25');
        c.setAttribute('rx', '0.3');
      } else {
        c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('data-uid', s.uid);
        c.setAttribute('r', ESPECES.R);
        c.setAttribute('fill',   (typeof MOL_COLORS        !== 'undefined' && MOL_COLORS[s.id])        || '#888');
        c.setAttribute('stroke', (typeof MOL_BORDER_COLORS !== 'undefined' && MOL_BORDER_COLORS[s.id]) || '#444');
        c.setAttribute('stroke-width', '0.25');
      }
      groupeCible.appendChild(c);
    } else if (c.parentNode !== groupeCible) {
      // Changement de zone → déplacer
      groupeCible.appendChild(c);
    }
    if (isPrecipite) {
      // <rect> : positionnement par coin supérieur gauche
      c.setAttribute('x', (s.x - ESPECES.R).toFixed(2));
      c.setAttribute('y', (s.y - ESPECES.R).toFixed(2));
    } else {
      c.setAttribute('cx', s.x.toFixed(2));
      c.setAttribute('cy', s.y.toFixed(2));
    }
    // Effet flash : opacité modulée
    if (s.state === 'flash') {
      const t = Math.max(0, s.tFlash / ESPECES.FLASH_DURATION);
      c.setAttribute('opacity', (0.4 + 0.6 * (1 - t)).toFixed(2));
    } else if (c.hasAttribute('opacity')) {
      c.removeAttribute('opacity');
    }
  }

  // Supprimer les éléments orphelins
  for (const uid in existants) {
    if (!uidsVivants.has(uid)) {
      const el = existants[uid];
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
  }
}

/**
 * Construit/reconstruit la légende des espèces dans #burette-box.
 * Une ligne par espèce : [checkbox] [pastille couleur] [formule].
 * Spectateurs décochés par défaut (déjà géré dans state.titrageEspecesVisible).
 */
function _construireLegendeEspeces() {
  const wrap = document.getElementById('especes-legende-list');
  if (!wrap) return;
  wrap.innerHTML = '';
  const entry = _especesGetRxnEntry();
  if (!entry || !entry.especes) return;
  entry.especes.forEach(e => {
    const row = document.createElement('label');
    row.className = 'especes-legende-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!state.titrageEspecesVisible[e.id];
    cb.addEventListener('change', () => toggleEspeceVisible(e.id, cb.checked));
    const pastille = document.createElement('span');
    pastille.className = 'especes-pastille';
    const fill   = (typeof MOL_COLORS        !== 'undefined' && MOL_COLORS[e.id])        || '#888';
    const border = (typeof MOL_BORDER_COLORS !== 'undefined' && MOL_BORDER_COLORS[e.id]) || '#444';
    if (e.role === 'precipite') {
      pastille.style.background   = '#c8c8c8';
      pastille.style.borderColor  = '#888888';
      pastille.style.borderRadius = '2px';
    } else {
      pastille.style.background   = fill;
      pastille.style.borderColor  = border;
    }
    const formule = document.createElement('span');
    formule.className = 'especes-formule';
    formule.innerHTML = e.label || e.id;
    row.appendChild(cb);
    row.appendChild(pastille);
    row.appendChild(formule);
    wrap.appendChild(row);
  });
}

/** Handler de checkbox dans la légende. */
function toggleEspeceVisible(id, checked) {
  if (!state.titrageEspecesVisible) state.titrageEspecesVisible = {};
  state.titrageEspecesVisible[id] = !!checked;
  // Le rendu prendra effet à la prochaine frame
}

/**
 * Synchronise les clones de l'électrode et du boîtier pH/conductimètre
 * dans le zoom bécher.
 * - pH-métrique      : clone #electrode-ph et #ph-metre
 * - conductimétrique : clone #sonde-conducti et #conductimetre-svg
 * Vide les groupes sinon.
 */
function _syncZoomElectrode() {
  const destEl   = document.getElementById('zoom-electrode-ph');
  const destMetre = document.getElementById('zoom-ph-metre');
  const destSonde = document.getElementById('zoom-sonde-conducti');
  const destCond  = document.getElementById('zoom-conductimetre-svg');
  if (!destEl || !destMetre) return;
  destEl.innerHTML   = '';
  destMetre.innerHTML = '';
  if (destSonde) destSonde.innerHTML = '';
  if (destCond)  destCond.innerHTML  = '';
  const type = state.titrageType;
  if (type !== 'phmetrique' && type !== 'conductimetrique') return;

  if (type === 'phmetrique') {
    // Clone électrode pH
    const srcEl = document.getElementById('electrode-ph');
    if (srcEl) {
      const clone = srcEl.cloneNode(true);
      clone.removeAttribute('id');
      clone.style.display = '';
      destEl.appendChild(clone);
    }

    // Clone boîtier pH-mètre (fil inclus)
    const srcMetre = document.getElementById('ph-metre');
    if (srcMetre) {
      const clone = srcMetre.cloneNode(true);
      clone.removeAttribute('id');
      clone.style.display = '';
      // Marquer le texte d'affichage pour la synchro temps réel
      const texts = clone.querySelectorAll('text');
      if (texts.length > 0) {
        const last = texts[texts.length - 1];
        last.classList.add('zoom-metre-display');
      }
      // Supprimer les id internes pour éviter les doublons
      clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      destMetre.appendChild(clone);
      // Synchro immédiate avec la valeur courante
      const zoomDisplay = destMetre.querySelector('.zoom-metre-display');
      const srcDisplay  = document.getElementById('ph-metre-display');
      if (zoomDisplay && srcDisplay) zoomDisplay.textContent = srcDisplay.textContent;
    }
  } else if (type === 'conductimetrique') {
    // Clone sonde conductimétrique
    const srcSonde = document.getElementById('sonde-conducti');
    if (srcSonde && destSonde) {
      const clone = srcSonde.cloneNode(true);
      clone.removeAttribute('id');
      clone.style.display = '';
      destSonde.appendChild(clone);
    }

    // Clone boîtier conductimètre (fil inclus)
    const srcCond = document.getElementById('conductimetre-svg');
    if (srcCond && destCond) {
      const clone = srcCond.cloneNode(true);
      clone.removeAttribute('id');
      clone.style.display = '';
      // Marquer le texte d'affichage pour la synchro temps réel
      const texts = clone.querySelectorAll('text');
      if (texts.length > 0) {
        const last = texts[texts.length - 1];
        last.classList.add('zoom-metre-display');
      }
      // Supprimer les id internes pour éviter les doublons
      clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      destCond.appendChild(clone);
      // Synchro immédiate avec la valeur courante
      const zoomDisplay = destCond.querySelector('.zoom-metre-display');
      const srcDisplay  = document.getElementById('conductimetre-display');
      if (zoomDisplay && srcDisplay) zoomDisplay.textContent = srcDisplay.textContent;
    }
  }
}

/**
 * Bascule le mode "représentation des espèces".
 * Montre/masque les groupes SVG et la légende, (re)génère les sphères,
 * démarre/arrête la boucle d'animation.
 */
/** Met à jour l'état visuel (classe active) des boutons graphes n / pH-σ. */
function _syncGraphButtonsActiveState() {
  const btnN  = document.getElementById('btn-toggle-graph-n');
  const btnPh = document.getElementById('btn-toggle-graph-ph');
  if (btnN) btnN.classList.toggle('active', state.titrageShowGraphN);
  if (btnPh) {
    const active = state.titrageType === 'conductimetrique'
      ? state.titrageShowGraphSigma
      : state.titrageShowGraphPH;
    btnPh.classList.toggle('active', active);
  }
}

/**
 * Ferme le zoom bécher sans restaurer l'état des graphes mémorisé à
 * l'activation : utilisé quand l'utilisateur ré-active lui-même un des
 * boutons graphes pendant que le zoom est actif (son input prime).
 */
function _closeZoomBecherDiscardMemory() {
  state.titrageZoomBecher = false;
  state._zoomBecherMemoireGraphes = null;
  const panel = document.getElementById('zoom-becher-panel');
  const btn   = document.getElementById('btn-zoom-becher');
  if (panel) panel.style.display = 'none';
  if (btn) { btn.classList.remove('active'); btn.innerHTML = 'Zoom bécher'; }
}

/**
 * Active / désactive le zoom bécher dans la zone centrale.
 * À l'activation : mémorise puis désactive les graphes n=f(V) et pH/σ=f(V).
 * À la désactivation (via ce bouton) : restaure l'état des graphes tel
 * qu'il était avant l'activation du zoom.
 */
function toggleZoomBecher() {
  state.titrageZoomBecher = !state.titrageZoomBecher;
  const panel = document.getElementById('zoom-becher-panel');
  const btn   = document.getElementById('btn-zoom-becher');

  if (state.titrageZoomBecher) {
    state._zoomBecherMemoireGraphes = {
      n: state.titrageShowGraphN,
      ph: state.titrageShowGraphPH,
      sigma: state.titrageShowGraphSigma
    };
    state.titrageShowGraphN = false;
    state.titrageShowGraphPH = false;
    state.titrageShowGraphSigma = false;
    _syncGraphButtonsActiveState();
    if (panel) panel.style.display = '';
    if (btn) { btn.classList.add('active'); btn.innerHTML = 'Fermer le zoom'; }
  } else {
    const mem = state._zoomBecherMemoireGraphes;
    if (mem) {
      // En mode test, le graphe n=f(V) reste verrouillé désactivé : ne pas
      // le restaurer même s'il était affiché avant l'activation du zoom.
      state.titrageShowGraphN = titrageTestState.actif ? false : mem.n;
      state.titrageShowGraphPH = mem.ph;
      state.titrageShowGraphSigma = mem.sigma;
      state._zoomBecherMemoireGraphes = null;
    }
    _syncGraphButtonsActiveState();
    if (panel) panel.style.display = 'none';
    if (btn) { btn.classList.remove('active'); btn.innerHTML = 'Zoom bécher'; }
  }
  _applyChartsLayout();
}

function toggleEspeces() {
  state.titrageShowEspeces = !state.titrageShowEspeces;
  const btn = document.getElementById('btn-toggle-especes');
  if (btn) btn.classList.toggle('active', state.titrageShowEspeces);
  const gBur = document.getElementById('especes-burette');
  const gBec = document.getElementById('especes-becher');
  const leg  = document.getElementById('especes-legende-section');
  if (state.titrageShowEspeces) {
    if (gBur) gBur.style.display = '';
    if (gBec) gBec.style.display = '';
    if (leg)  leg.style.display  = '';
    _initEspeces();
    _construireLegendeEspeces();
    _genererSpheres();
    _renderSpheres();
    _especesLastTime = null;
    if (!_especesRAF) _especesRAF = requestAnimationFrame(_animEspeces);
    // Repositionner la burette-box maintenant que la légende est dépliée
    if (typeof _updateBuretteBoxPosition === 'function') {
      requestAnimationFrame(_updateBuretteBoxPosition);
    }
  } else {
    if (gBur) { gBur.style.display = 'none'; gBur.innerHTML = ''; }
    if (gBec) { gBec.style.display = 'none'; gBec.innerHTML = ''; }
    if (leg)  leg.style.display = 'none';
    if (_especesRAF) { cancelAnimationFrame(_especesRAF); _especesRAF = null; }
    _especesLastTime = null;
    _especesSpheres = [];
    _especesGroupesReaction = {};
    if (typeof _updateBuretteBoxPosition === 'function') {
      requestAnimationFrame(_updateBuretteBoxPosition);
    }
  }
}

/**
 * Régénère intégralement les sphères pour la réaction courante.
 * À appeler à chaque reinitialiserTitrage / changement de réaction / type
 * de titrage, si le mode est actif.
 */
function _especesRebuild() {
  if (!state.titrageShowEspeces) return;
  _initEspeces();
  _construireLegendeEspeces();
  _genererSpheres();
  _renderSpheres();
}

/* ══════════════════════════════════════════════════════════════════════════
   MODE TEST — TITRAGE
   Permet à l'élève de :
     1. Choisir un type de titrage (colorimétrique / pH-métrique / conductimétrique)
     2. Réaliser le titrage avec une réaction, un V1 et des concentrations aléatoires
     3. Saisir le volume équivalent et la concentration de la solution titrée
     4. Valider et voir si ses réponses sont correctes
══════════════════════════════════════════════════════════════════════════ */

const titrageTestState = {
  actif: false,
  veqCorrecte: null,
  concTitreeCorrecte: null,
  lastType: 'colorimetrique'
};

// ── Ouverture de la modal de choix du type de titrage ──────────────────────
function ouvrirModalTestTitrage() {
  // Si déjà actif : sortie immédiate
  if (titrageTestState.actif) {
    quitterModeTestTitrage();
    return;
  }
  afficherOverlay(`
    <h2>Mode Test — Titrage</h2>
    <p>Choisissez le type de titrage à pratiquer :</p>
    <div class="test-modal-btns">
      <button class="btn-test-confirm btn-test-oui" onclick="lancerModeTitrageTest('colorimetrique')">Colorimétrique</button>
      <button class="btn-test-confirm btn-test-oui" onclick="lancerModeTitrageTest('colorimetrique-ac')">Colorimétrique (indicateur coloré)</button>
      <button class="btn-test-confirm btn-test-oui" onclick="lancerModeTitrageTest('phmetrique')">pH-métrique</button>
      <button class="btn-test-confirm btn-test-oui" onclick="lancerModeTitrageTest('conductimetrique')">Conductimétrique</button>
    </div>
    <div class="test-modal-btns">
      <button class="btn-test-confirm btn-test-non" onclick="fermerOverlay()">Annuler</button>
    </div>`);
}

// ── Lancement du mode test avec le type choisi ────────────────────────────
function lancerModeTitrageTest(type) {
  fermerOverlay();

  // Pour colorimetrique-ac : on utilise le moteur pH-métrique (TITRAGE_PH_REACTIONS,
  // _calcVeq, calcPH) mais le dispositif et le sélecteur affichent "colorimétrique".
  const typeMoteur = (type === 'colorimetrique-ac') ? 'phmetrique' : type;

  // 1. Basculer sur l'onglet Titrage et initialiser le moteur
  setOnglet('titrage');
  const selType = document.getElementById('sel-type-titrage');
  if (selType) { selType.value = typeMoteur; onTypeTitrageChange(typeMoteur); }

  // Pour colorimetrique-ac : retirer la classe CSS titrage-ph (pas de sonde/pH-mètre)
  if (type === 'colorimetrique-ac') {
    document.body.classList.remove('titrage-ph');
  }

  // 2. Tirer un V1 aléatoire parmi les valeurs du sélecteur
  const selV1 = document.getElementById('sel-v1');
  if (selV1) {
    const opts = Array.from(selV1.options);
    const picked = opts[Math.floor(Math.random() * opts.length)];
    selV1.value = picked.value;
    state.titrageV1 = parseFloat(picked.value) || 20;
  }

  // 3. Tirer une réaction aléatoire (APRÈS onTypeTitrageChange qui peuple le select)
  _titrageTestTirerReaction(type);

  // 4. Tirer des concentrations aléatoires
  _titrageTestTirerConcentrations(type);

  // 5. Réinitialiser le titrage avec les nouveaux paramètres
  // (pas de _syncPanelToState ici : _titrageTestTirerConcentrations a déjà
  //  écrit dans state.titrageConcTitree / state.titrageConcTitrante)
  reinitialiserTitrage();

  // Pour colorimetrique-ac : s'assurer que la classe ph est bien absente après reinit
  if (type === 'colorimetrique-ac') {
    document.body.classList.remove('titrage-ph');
  }

  // 6. Activer le masque "cacher la solution titrée"
  const btnCacher = document.getElementById('btn-cacher-titre');
  if (btnCacher && !btnCacher.classList.contains('active')) {
    toggleCacherTitreTitrage();
  }

  // 7. Calculer et stocker Veq cible
  titrageTestState.veqCorrecte = _calcVeq();

  // 8. Stocker la concentration titrée correcte
  titrageTestState.concTitreeCorrecte = state.titrageConcTitree;

  // 9. Désactiver le mode "représentation des espèces" s'il était actif
  if (state.titrageShowEspeces) {
    toggleEspeces();  // remet titrageShowEspeces à false et stoppe la boucle RAF
  }

  // 10. Activer l'état test
  titrageTestState.actif = true;
  titrageTestState.lastType = type;

  // 11. Verrouiller l'UI
  setTitrageTestUI(true);

  // 12. Afficher le panel flottant
  _afficherPanelTestTitrage();

  // 13. Pour colorimetrique-ac : afficher le pH à l'équivalence
  if (type === 'colorimetrique-ac') {
    _afficherPheMsg();
  } else {
    _masquerPheMsg();
  }
}

// ── Tire une réaction aléatoire selon le type ─────────────────────────────
function _titrageTestTirerReaction(type) {
  let source, stateKey;
  if (type === 'phmetrique' || type === 'colorimetrique-ac') {
    source = TITRAGE_PH_REACTIONS.filter(e => !e.precipitationOnly);
    stateKey = 'titragePhRxnIdx';
  } else if (type === 'conductimetrique') {
    source = TITRAGE_COND_REACTIONS;
    stateKey = 'titrageCondRxnIdx';
  } else {
    source = TITRAGE_MODE_REACTIONS;
    stateKey = 'titrageRxnModeIdx';
  }
  if (!source || source.length === 0) return;
  const idx = Math.floor(Math.random() * source.length);
  state[stateKey] = idx;
  const selRxn = document.getElementById('sel-rxn-titrage');
  if (selRxn) {
    // Repeupler le sélecteur puis sélectionner
    populateTitrageRxnSelect();
    const opts = Array.from(selRxn.options);
    const found = opts.find(o => parseInt(o.value) === idx);
    if (found) selRxn.value = String(idx);
    else if (opts.length > 0) {
      selRxn.value = opts[0].value;
      state[stateKey] = parseInt(opts[0].value);
    }
  }

  // Mettre à jour le label titrant et l'équation de réaction
  // sans appeler reinitialiserTitrage (le lancement du test le fait ensuite)
  const finalIdx = state[stateKey];
  const lbl = document.getElementById('titrant-label');
  if (type === 'phmetrique' || type === 'colorimetrique-ac') {
    const entry = TITRAGE_PH_REACTIONS[finalIdx];
    if (entry && lbl) lbl.innerHTML = entry.labelTitrante || entry.titrant.formula;
  } else if (type === 'conductimetrique') {
    const entry = TITRAGE_COND_REACTIONS[finalIdx];
    if (entry && lbl) lbl.innerHTML = entry.labelTitrante || entry.titrant.formula;
  } else {
    const entry = TITRAGE_MODE_REACTIONS[finalIdx];
    if (entry && lbl) {
      const rxn = TITRAGE_REACTIONS[entry.rxnIdx];
      if (rxn) lbl.innerHTML = entry.labelTitrante || rxn.titrant.formula;
    }
  }
  renderTitrageEquation();
  buildChartLegende();
  _updateAmidonPosition();
}

// ── Tire des concentrations aléatoires (adapté pour pH/conducti aussi) ───
function _titrageTestTirerConcentrations(type) {
  // Pour pH-métrique et conductimétrique, la stœchiométrie est 1:1
  // Pour colorimétrique, on lit les coefficients de la réaction
  let coeffTitree = 1, coeffTitrante = 1;
  if (type === 'colorimetrique') {
    const entry = TITRAGE_MODE_REACTIONS[state.titrageRxnModeIdx || 0];
    if (entry) {
      const eT  = entry.especes.find(e => e.role === 'titree');
      const eTt = entry.especes.find(e => e.role === 'titrante');
      if (eT)  coeffTitree   = eT.coeff;
      if (eTt) coeffTitrante = eTt.coeff;
    }
  }

  const V1 = (parseFloat(document.getElementById('sel-v1').value) || 20) * 1e-3;
  const C_MAX = 9.5e-1;
  const VEQ_MIN = 7e-3, VEQ_MAX = 23e-3;

  // En colorimetrique-ac avec acide/base faible : C_titrée ≥ 1e-2 mol/L
  let C_MIN = 1e-5;
  if (type === 'colorimetrique-ac') {
    const entry = TITRAGE_PH_REACTIONS[state.titragePhRxnIdx || 0];
    const titreType = entry ? (entry.titre || {}).type || '' : '';
    if (titreType === 'acide_faible' || titreType === 'base_faible') C_MIN = 1e-2;
  }

  let exp, mantisse, cTitre, veqLo, veqHi;
  let attempts = 0;
  do {
    exp      = -(Math.floor(Math.random() * 5) + 1);
    mantisse = +(Math.random() * 8.9 + 1.0).toFixed(2);
    cTitre   = mantisse * Math.pow(10, exp);
    const k  = cTitre * V1 * coeffTitrante / coeffTitree;
    veqLo = Math.max(VEQ_MIN, k / C_MAX);
    veqHi = Math.min(VEQ_MAX, k / C_MIN);
    attempts++;
  } while (veqLo > veqHi && attempts < 100);

  const k      = cTitre * V1 * coeffTitrante / coeffTitree;
  const Veq    = veqLo + Math.random() * (veqHi - veqLo);
  const cTitrante = k / Veq;

  // Arrondir C_titrante à la mantisse demi-entière la plus proche
  let bestExp = -1;
  for (let e = -1; e >= -5; e--) {
    const m = cTitrante / Math.pow(10, e);
    if (m >= 1.0 && m < 10.0) { bestExp = e; break; }
  }
  const rawM      = cTitrante / Math.pow(10, bestExp);
  const bestMant  = +(Math.min(9.5, Math.max(1.0, Math.round(rawM * 2) / 2))).toFixed(2);

  // Écrire dans les inputs et mettre à jour l'état
  const elTM = document.getElementById('conc-titrante-mantisse');
  const elTE = document.getElementById('conc-titrante-exp');
  const elRM = document.getElementById('conc-titre-mantisse');
  const elRE = document.getElementById('conc-titre-exp');
  if (elTM) elTM.value = bestMant;
  if (elTE) elTE.value = bestExp;
  if (elRM) elRM.value = mantisse;
  if (elRE) elRE.value = exp;

  state.titrageConcTitrante = parseFloat(bestMant) * Math.pow(10, bestExp);
  state.titrageConcTitree   = cTitre;
}

// ── Verrouillage / déverrouillage de l'UI en mode test ───────────────────
function setTitrageTestUI(actif) {
  // En entrant en mode test : forcer la désactivation des quantités de
  // matière et de la représentation des espèces si elles étaient actives,
  // pour ne pas les laisser affichées alors que leurs boutons sont verrouillés.
  if (actif) {
    if (state.titrageShowGraphN) toggleGraphN();
    if (state.titrageShowEspeces) toggleEspeces();
  }

  // Éléments toujours verrouillés en mode test
  const ids = [
    'sel-type-titrage',
    'sel-rxn-titrage',
    'sel-v1',
    'btn-toggle-graph-n',
    'btn-toggle-especes',
    'btn-vidage-auto',
    'btn-cacher-titre',
    'conc-titrante-mantisse',
    'conc-titrante-exp',
  ];

  // En mode colorimetrique-ac : le toggle pH est masqué (géré séparément ci-dessous)

  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (actif) {
      el.disabled = true;
      el.classList.add('titrage-test-locked');
    } else {
      el.disabled = false;
      el.classList.remove('titrage-test-locked');
    }
  });

  // btn-toggle-graph-ph : masquer en mode colorimetrique-ac, restaurer sinon
  const btnTogglePh = document.getElementById('btn-toggle-graph-ph');
  if (btnTogglePh) {
    if (actif && titrageTestState.lastType === 'colorimetrique-ac') {
      btnTogglePh.style.display = 'none';
    } else {
      btnTogglePh.style.display = '';
    }
  }
  // Graphe pH : forcer masqué en mode colorimetrique-ac
  const chartPh = document.getElementById('titrage-chart-ph-panel');
  if (chartPh && actif && titrageTestState.lastType === 'colorimetrique-ac') {
    chartPh.style.display = 'none';
  }

  // Déverrouiller btn-toggle-graph-ph si on sort du mode (au cas où il avait été lock)
  if (!actif) {
    const btnPh = document.getElementById('btn-toggle-graph-ph');
    if (btnPh) { btnPh.disabled = false; btnPh.classList.remove('titrage-test-locked'); btnPh.style.display = ''; }
  }

  // Onglet Principe
  const tabPrincipe = document.getElementById('tab-principe');
  if (tabPrincipe) {
    if (actif) {
      tabPrincipe.disabled = true;
      tabPrincipe.classList.add('titrage-test-locked');
    } else {
      tabPrincipe.disabled = false;
      tabPrincipe.classList.remove('titrage-test-locked');
    }
  }

  // Bouton Mode Test : changer l'apparence
  const btnTest = document.getElementById('btn-test-titrage');
  if (btnTest) {
    if (actif) {
      btnTest.innerHTML = '✕ Sortir du mode test';
      btnTest.className = 'btn btn-quitter-test';
    } else {
      btnTest.innerHTML = '&#9881; Mode Test';
      btnTest.className = 'btn btn-test-mode';
    }
  }
}

// ── Affichage / position du panel flottant ────────────────────────────────
function _afficherPanelTestTitrage() {
  const panel = document.getElementById('titrage-test-panel');
  if (!panel) return;

  // Position initiale : en bas à droite pour ne pas masquer le message pH_E
  const zone = document.getElementById('titrage-graph-zone');
  if (zone) {
    const zw = zone.offsetWidth  || 600;
    const zh = zone.offsetHeight || 400;
    panel.style.top  = Math.max(0, zh - 260) + 'px';
    panel.style.left = Math.max(0, zw - 330) + 'px';
  } else {
    panel.style.top  = '200px';
    panel.style.left = '300px';
  }
  panel.style.display = 'block';

  // Réinitialiser les champs de saisie et le feedback
  const inpVeq  = document.getElementById('test-titrage-veq');
  const inpMant = document.getElementById('test-titrage-mantisse');
  const inpExp  = document.getElementById('test-titrage-exp');
  if (inpVeq)  inpVeq.value  = '';
  if (inpMant) inpMant.value = '';
  if (inpExp)  inpExp.value  = '-2';
  const fb = document.getElementById('titrage-test-feedback');
  if (fb) { fb.textContent = ''; fb.className = ''; }

  // Réinitialiser les boutons : masquer les actions, montrer Valider
  const actions = document.getElementById('titrage-test-actions');
  if (actions) actions.style.display = 'none';
  const btnValider = document.querySelector('.titrage-test-btn-valider');
  if (btnValider) btnValider.style.display = '';

  // Activer le drag
  _initDragTestPanel();

  // Bouton minimize : état initial non-réduit
  const minBtn = document.getElementById('titrage-test-panel-minimize');
  if (minBtn) { minBtn.textContent = '−'; panel.classList.remove('minimized'); }
}

// ── Drag & drop du panel (confiné dans #titrage-graph-zone) ──────────────
function _initDragTestPanel() {
  const panel  = document.getElementById('titrage-test-panel');
  const header = document.getElementById('titrage-test-panel-header');
  if (!panel || !header) return;

  let dragging = false;
  let offX = 0, offY = 0;

  // Éviter les doubles bindings
  header._dragBound && header.removeEventListener('pointerdown', header._dragBound);

  header._dragBound = function(e) {
    // Ne pas déclencher si clic sur le bouton minimize
    if (e.target.id === 'titrage-test-panel-minimize') return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    offX = e.clientX - rect.left;
    offY = e.clientY - rect.top;
    header.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  header._moveBound && document.removeEventListener('pointermove', header._moveBound);
  header._upBound   && document.removeEventListener('pointerup',   header._upBound);

  header._moveBound = function(e) {
    if (!dragging) return;
    const zone = document.getElementById('titrage-graph-zone');
    if (!zone) return;
    const zRect = zone.getBoundingClientRect();
    const pW = panel.offsetWidth;
    const pH = panel.offsetHeight;

    let newLeft = e.clientX - offX - zRect.left;
    let newTop  = e.clientY - offY - zRect.top;

    // Confinement
    newLeft = Math.max(0, Math.min(newLeft, zRect.width  - pW));
    newTop  = Math.max(0, Math.min(newTop,  zRect.height - pH));

    panel.style.left = newLeft + 'px';
    panel.style.top  = newTop  + 'px';
  };

  header._upBound = function() { dragging = false; };

  header.addEventListener('pointerdown', header._dragBound);
  document.addEventListener('pointermove', header._moveBound);
  document.addEventListener('pointerup',   header._upBound);
}

// ── Minimize / agrandir ───────────────────────────────────────────────────
document.addEventListener('click', function(e) {
  if (e.target.id === 'titrage-test-panel-minimize') {
    const panel = document.getElementById('titrage-test-panel');
    if (!panel) return;
    const minimized = panel.classList.toggle('minimized');
    e.target.textContent = minimized ? '+' : '−';
  }
});

// ── Validation des réponses ───────────────────────────────────────────────
function validerReponseTestTitrage() {
  if (!titrageTestState.actif) return;

  const veqSaisie      = parseFloat(document.getElementById('test-titrage-veq').value);
  const mantisseSaisie = parseFloat(document.getElementById('test-titrage-mantisse').value);
  const expSaisi       = parseInt(document.getElementById('test-titrage-exp').value);

  const fb = document.getElementById('titrage-test-feedback');
  if (!fb) return;

  // Validation des entrées
  if (isNaN(veqSaisie) || isNaN(mantisseSaisie) || isNaN(expSaisi)) {
    fb.textContent = 'Veuillez remplir tous les champs.';
    fb.className = 'nok';
    return;
  }

  const veqCorr  = titrageTestState.veqCorrecte;
  const concCorr = titrageTestState.concTitreeCorrecte;

  // Vérification Veq (± 0,10 mL, ou ± 0,50 mL en colorimetrique-ac)
  const tolVeq = (titrageTestState.lastType === 'colorimetrique-ac') ? 0.50 : 0.10;
  const okVeq = (veqCorr !== null) && Math.abs(veqSaisie - veqCorr) <= tolVeq;

  // Vérification concentration (exposant exact + mantisse ± 0,1, ou ± 0,5 en colorimetrique-ac)
  const tolConc = (titrageTestState.lastType === 'colorimetrique-ac') ? 0.5 : 0.1;
  const corrExp = _getMantisseExp(concCorr);
  const okConc  = (expSaisi === corrExp.exp) && (Math.abs(mantisseSaisie - corrExp.mantisse) <= tolConc);

  // Construire le message de feedback
  const veqCorrStr  = veqCorr !== null ? veqCorr.toFixed(2) + ' mL' : '?';
  const concCorrStr = concCorr !== null
    ? corrExp.mantisse.toFixed(1) + ' × 10<sup>' + corrExp.exp + '</sup> mol/L'
    : '?';

  let msg, cssClass;
  if (okVeq && okConc) {
    msg      = '✓ Bravo ! Les deux réponses sont correctes.<br>'
             + 'V<sub>éq</sub> = ' + veqCorrStr
             + ' &nbsp;|&nbsp; C = ' + concCorrStr;
    cssClass = 'ok';
  } else if (okVeq && !okConc) {
    msg      = '✓ Volume équivalent correct.<br>'
             + '✗ Concentration incorrecte.<br>'
             + 'C = ' + concCorrStr;
    cssClass = 'ok-partial';
  } else if (!okVeq && okConc) {
    msg      = '✗ Volume équivalent incorrect.<br>'
             + 'V<sub>éq</sub> = ' + veqCorrStr + '<br>'
             + '✓ Concentration correcte.';
    cssClass = 'ok-partial';
  } else {
    msg      = '✗ Les deux réponses sont incorrectes.<br>'
             + 'V<sub>éq</sub> = ' + veqCorrStr
             + ' &nbsp;|&nbsp; C = ' + concCorrStr;
    cssClass = 'nok';
  }

  fb.innerHTML  = msg;
  fb.className  = cssClass;

  // Afficher les boutons post-validation et masquer le bouton Valider
  const actions = document.getElementById('titrage-test-actions');
  if (actions) actions.style.display = 'flex';
  const btnValider = document.querySelector('.titrage-test-btn-valider');
  if (btnValider) btnValider.style.display = 'none';
}

// ── Utilitaire : extraire mantisse + exposant normalisé d'une concentration
function _getMantisseExp(val) {
  if (!val || val <= 0) return { mantisse: 1, exp: 0 };
  const exp = Math.floor(Math.log10(val));
  const mantisse = val / Math.pow(10, exp);
  return { mantisse: +mantisse.toFixed(2), exp };
}

// ── Réessayer : même type de titrage, nouvelle réaction/concentrations ────
function reessayerTestTitrage() {
  const type = titrageTestState.lastType;

  // 1. Nouveau V1 aléatoire
  const selV1 = document.getElementById('sel-v1');
  if (selV1) {
    const opts = Array.from(selV1.options);
    const picked = opts[Math.floor(Math.random() * opts.length)];
    selV1.value = picked.value;
    state.titrageV1 = parseFloat(picked.value) || 20;
  }

  // 2. Nouvelles concentrations (réaction inchangée)
  _titrageTestTirerConcentrations(type);

  // 3. Réinitialiser
  reinitialiserTitrage();

  // Pour colorimetrique-ac : retirer la classe ph après reinit
  if (type === 'colorimetrique-ac') {
    document.body.classList.remove('titrage-ph');
  }

  // 4. Recalculer Veq et concentration cible
  titrageTestState.veqCorrecte      = _calcVeq();
  titrageTestState.concTitreeCorrecte = state.titrageConcTitree;

  // 5. Réafficher le panel (reset champs + boutons)
  _afficherPanelTestTitrage();

  // 6. Mettre à jour le pH_E si besoin
  if (type === 'colorimetrique-ac') {
    _afficherPheMsg();
  }
}

// ── Autre titrage : rouvrir la modal de choix du type ─────────────────────
function autreTitrageTest() {
  titrageTestState.actif = false;
  setTitrageTestUI(false);
  const panel = document.getElementById('titrage-test-panel');
  if (panel) panel.style.display = 'none';
  _masquerPheMsg();
  afficherOverlay(`
    <h2>Mode Test — Titrage</h2>
    <p>Choisissez le type de titrage à pratiquer :</p>
    <div class="test-modal-btns">
      <button class="btn-test-confirm btn-test-oui" onclick="lancerModeTitrageTest('colorimetrique')">Colorimétrique</button>
      <button class="btn-test-confirm btn-test-oui" onclick="lancerModeTitrageTest('colorimetrique-ac')">Colorimétrique (indicateur coloré)</button>
      <button class="btn-test-confirm btn-test-oui" onclick="lancerModeTitrageTest('phmetrique')">pH-métrique</button>
      <button class="btn-test-confirm btn-test-oui" onclick="lancerModeTitrageTest('conductimetrique')">Conductimétrique</button>
    </div>
    <div class="test-modal-btns">
      <button class="btn-test-confirm btn-test-non" onclick="fermerOverlay(); quitterModeTestTitrage()">Annuler</button>
    </div>`);
}

// ── Calcul du pH à l'équivalence (mode colorimétrique-ac) ────────────────
function _calcPheEquivalence() {
  const idx = (state.titragePhRxnIdx !== undefined && state.titragePhRxnIdx !== null)
              ? state.titragePhRxnIdx : 0;
  const entry = TITRAGE_PH_REACTIONS[idx];
  if (!entry) return null;
  const veq = _calcVeq(); // mL
  if (!veq || veq <= 0) return null;

  const Ca    = state.titrageConcTitree;
  const V1    = state.titrageV1;
  const Veau  = state.titrageVeau || 0;
  if (!Ca || Ca <= 0 || !V1 || V1 <= 0) return null;

  const vTotal  = (V1 + Veau + veq) / 1000; // L
  const nTitree = Ca * V1 / 1000;            // mol
  const type    = (entry.titre || {}).type || '';

  if (type === 'acide_fort' || type === 'base_forte') {
    // Sel neutre : pH_E = 7
    return 7.00;
  } else if (type === 'acide_faible') {
    // Sel basique : pH_E = 7 + ½(pKa + log C_sel)
    const pKa = entry.titre.pKa;
    const Csel = nTitree / vTotal;
    if (!Csel || Csel <= 0) return null;
    return +(7 + 0.5 * (pKa + Math.log10(Csel))).toFixed(2);
  } else if (type === 'base_faible') {
    // Sel acide BH⁺ : pH_E = ½(pKa − log C) = ½(pKa + pC)
    const pKa = entry.titre.pKa;
    const Csel = nTitree / vTotal;
    if (!Csel || Csel <= 0) return null;
    return +(0.5 * (pKa - Math.log10(Csel))).toFixed(2);
  }
  return null;
}

// ── Affichage du message pH_E ─────────────────────────────────────────────
function _afficherPheMsg() {
  const msg = document.getElementById('titrage-test-phe-msg');
  const val = document.getElementById('titrage-test-phe-val');
  if (!msg || !val) return;
  const phe = _calcPheEquivalence();
  val.textContent = phe !== null ? phe.toFixed(2) : '—';
  msg.style.display = 'block';
}

function _masquerPheMsg() {
  const msg = document.getElementById('titrage-test-phe-msg');
  if (msg) msg.style.display = 'none';
}

// ── Sortir du mode test ───────────────────────────────────────────────────
function quitterModeTestTitrage() {
  const wasColorimetriqueAc = titrageTestState.lastType === 'colorimetrique-ac';

  titrageTestState.actif = false;
  titrageTestState.veqCorrecte = null;
  titrageTestState.concTitreeCorrecte = null;
  titrageTestState.lastType = null;

  // Cacher le panel et le message pH_E
  const panel = document.getElementById('titrage-test-panel');
  if (panel) panel.style.display = 'none';
  _masquerPheMsg();

  // Retirer l'indicateur coloré s'il y en a un
  if (state.titrageIndicateur !== null) {
    state.titrageIndicateur = null;
    _updateIndicateurBtn();
    updateLiquides();
    if (typeof updatePhAnalysisBtns === 'function') updatePhAnalysisBtns();
    if (typeof drawTitragePhGraph   === 'function') drawTitragePhGraph();
  }

  // Désactiver le masque "Cacher la solution titrée" s'il est actif
  const btnCacher = document.getElementById('btn-cacher-titre');
  if (btnCacher && btnCacher.classList.contains('active')) {
    toggleCacherTitreTitrage();
  }

  // Déverrouiller l'UI (restaure btn-toggle-graph-ph avant onTypeTitrageChange)
  setTitrageTestUI(false);

  // Si on était en colorimetrique-ac : remettre le dispositif pH-métrique complet
  if (wasColorimetriqueAc) {
    const selType = document.getElementById('sel-type-titrage');
    if (selType) { selType.value = 'phmetrique'; }
    onTypeTitrageChange('phmetrique');
  }
}

init();
