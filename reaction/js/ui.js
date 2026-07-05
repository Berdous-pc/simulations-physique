/* ══════════════════════════════════════════════════════════════════════════
   Simulation pédagogique — Physique-Chimie Lycée
   Auteur  : Mathieu Berdous
   Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   UI.JS — Tableau HTML, onglets, animations, mode test, init
   Dépend de : data.js, sim.js
   Expose : buildThead, buildTbody, buildTfoot, makeQtyWidget, updateTableFoot,
            updateQtyWidgets, setOnglet, onReactionChange,
            initCoeffsUser, initQtesLim, getCoeffEq, displayCoeffValue,
            buildEquationUI, onCoeffInput, stepCoeff,
            testerEquilibrage, testerEquilibrageInstantane,
            lancerAnimEquilibrage, tickAnimEq, relayoutAnimEq, finirAnimEq,
            tickAnimLim, prepareTourLim, finirAnimLim,
            predictionEstCorrecte, afficherResultatPrediction,
            razEquilibrage, razLimitant, setQteLimDirect, changeQteLim,
            toggleShowCoeffOneEq, toggleShowProductsEq, resetShowProductsEq,
            toggleShowCoeffOneLim,
            rebuildExtraRows, buildCmpText, cycleComparaison,
            togglePrediction, makePredWidget, lockPrediction, unlockPrediction,
            predictionComplete, lancerReactionMax, lancerReactionStep,
            testState, setTestUI, ouvrirConfirmTest, lancerTest,
            chargerReactionTest, prochainQuestionTest, afficherScoreFinal,
            relancerTest, quitterModeTest, voirReponseTest,
            afficherOverlay, fermerOverlay, afficherPopupTest, fermerPopupTest,
            majBarreProgression, updatePopupSpacer, setStatus, clearStatus,
            stopAnimations, clearSnapshots,
            updateSpeedLabels, updateSpeedLabelsEq, getSpeedMult, getSpeedMultEq,
            init
══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   CONSTRUCTION DU TABLEAU HTML
══════════════════════════════════════════════════════════════════════════ */

function buildThead(mode) {
  invalidateGeomCache();
  const rxn  = REACTIONS[mode === 'eq' ? state.reactionEqIdx : state.reactionLimIdx];
  const row  = document.getElementById('thead-row');
  row.innerHTML = '';

  if (mode === 'lim') {
    const th = document.createElement('th');
    th.className = 'col-adv';
    th.style.width = '200px';
    th.textContent = 'Molécule';
    row.appendChild(th);
  }

  for (let i = 0; i < N_COLS; i++) {
    const th = document.createElement('th');
    const isR = i < N_REACTIFS;
    const idx = isR ? i : i - N_REACTIFS;
    const isActive = isR ? idx < rxn.reactifs.length : idx < rxn.produits.length;
    const formula  = isActive ? (isR ? rxn.reactifs[idx].formula : rxn.produits[idx].formula) : null;

    if (!isActive) {
      th.className = 'col-inactive';
      th.textContent = isR ? `Réactif ${idx + 1}` : `Produit ${idx + 1}`;
    } else if (isR) {
      th.className = 'col-reactif' + (i === N_REACTIFS - 1 ? ' sep-rp' : '');
      th.textContent = mode === 'eq'
        ? `Réactif ${idx + 1} — ${formula}`
        : formula;
    } else {
      th.className = 'col-produit';
      th.textContent = mode === 'eq'
        ? `Produit ${idx + 1} — ${formula}`
        : formula;
    }
    if (i === N_REACTIFS - 1) th.classList.add('sep-rp');
    row.appendChild(th);
  }
}

function buildTbody(mode) {
  invalidateGeomCache();
  const rxn   = REACTIONS[mode === 'eq' ? state.reactionEqIdx : state.reactionLimIdx];
  const tbody = document.getElementById('table-tbody');
  tbody.innerHTML = '';
  const tfoot = document.getElementById('table-tfoot');

  if (mode === 'lim') {
    const trQ = document.createElement('tr');
    trQ.className = 'row-qty';

    const tdAdv = document.createElement('td');
    tdAdv.className = 'td-adv row-label';
    tdAdv.textContent = 'Quantités initiales';
    trQ.appendChild(tdAdv);

    for (let i = 0; i < N_COLS; i++) {
      const td  = document.createElement('td');
      const isR = i < N_REACTIFS;
      const idx = isR ? i : i - N_REACTIFS;
      const isActive = isR ? idx < rxn.reactifs.length : idx < rxn.produits.length;
      td.className = (isActive ? (isR ? 'td-reactif' : 'td-produit') : 'td-inactive')
                   + (i === N_REACTIFS - 1 ? ' sep-rp' : '');
      if (isR && isActive) {
        td.appendChild(makeQtyWidget(idx, rxn.reactifs[idx]));
      }
      trQ.appendChild(td);
    }
    tbody.appendChild(trQ);

    buildTfoot(rxn);
    rebuildExtraRows(false);
    tfoot.style.display = '';
  } else {
    tfoot.style.display = 'none';
    tfoot.innerHTML = '';
  }

  const trC = document.createElement('tr');
  trC.className = 'row-canvas';

  if (mode === 'lim') {
    const tdLbl = document.createElement('td');
    tdLbl.className = 'td-adv row-label row-canvas-label';
    tdLbl.textContent = 'Modèles moléculaires';
    trC.appendChild(tdLbl);
  }

  const tdC = document.createElement('td');
  tdC.id = 'canvas-cell';
  tdC.colSpan = N_COLS;
  trC.appendChild(tdC);
  tbody.appendChild(trC);

  requestAnimationFrame(() => {
    fixAndRedraw(mode);
  });
}

function buildTfoot(rxn) {
  invalidateGeomCache();
  const tfoot = document.getElementById('table-tfoot');
  tfoot.innerHTML = '';
  const tr = document.createElement('tr');

  const tdAdv = document.createElement('td');
  tdAdv.className = 'td-adv';
  tdAdv.style.width = '200px';
  tdAdv.innerHTML = '<span class="foot-row-label">Avancement et quantités finales</span><span id="foot-avancement">x = 0 mol</span>';
  tr.appendChild(tdAdv);

  for (let i = 0; i < N_COLS; i++) {
    const td  = document.createElement('td');
    const isR = i < N_REACTIFS;
    const idx = isR ? i : i - N_REACTIFS;
    const isActive = isR ? idx < rxn.reactifs.length : idx < rxn.produits.length;
    td.className = (isActive ? (isR ? 'td-reactif' : 'td-produit') : '')
                 + (i === N_REACTIFS - 1 ? ' sep-rp' : '');
    if (isActive) {
      td.id = isR ? `foot-qty-r${idx}` : `foot-qty-p${idx}`;
      const mol = isR ? rxn.reactifs[idx] : rxn.produits[idx];
      td.textContent = isR
        ? `n(${mol.formula}) = ${state.qtesLimInit[idx]} mol`
        : `n(${mol.formula}) = 0 mol`;
    }
    tr.appendChild(td);
  }
  tfoot.appendChild(tr);
}

function makeQtyWidget(i, mol) {
  const wrap = document.createElement('div');
  wrap.className = 'qty-cell-widget';
  const lbl = document.createElement('span');
  lbl.className = 'qty-cell-label';
  lbl.textContent = `nᵢ(${mol.formula}) =`;
  wrap.appendChild(lbl);
  const row = document.createElement('div');
  row.className = 'qty-cell-row';
  const btnM = document.createElement('button');
  btnM.className = 'qty-cell-btn'; btnM.textContent = '−';
  btnM.onclick = () => changeQteLim(i, -1);
  const inp = document.createElement('input');
  inp.type = 'text'; inp.inputMode = 'numeric';
  inp.className = 'qty-cell-input';
  inp.id = `qty-val-${i}`;
  inp.value = state.qtesLimInit[i];
  inp.addEventListener('change', () => {
    const v = parseInt(inp.value);
    const clamped = isNaN(v) || v < 0 ? 0 : Math.min(20, v);
    setQteLimDirect(i, clamped);
    inp.value = clamped;
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  const btnP = document.createElement('button');
  btnP.className = 'qty-cell-btn'; btnP.textContent = '+';
  btnP.onclick = () => changeQteLim(i, +1);
  const unit = document.createElement('span');
  unit.className = 'qty-cell-unit'; unit.textContent = 'mol';
  row.appendChild(btnM); row.appendChild(inp);
  row.appendChild(btnP); row.appendChild(unit);
  wrap.appendChild(row);
  return wrap;
}

function updateTableFoot(avancement, qtesR, qtesP, xmax) {
  const rxn = REACTIONS[state.reactionLimIdx];
  const tdAdv = document.getElementById('foot-avancement');
  if (tdAdv) {
    if (xmax !== null && xmax !== undefined) {
      tdAdv.textContent = `xmax = ${xmax} mol`;
      tdAdv.classList.add('xmax');
    } else {
      tdAdv.textContent = `x = ${avancement} mol`;
      tdAdv.classList.remove('xmax');
    }
  }
  rxn.reactifs.forEach((mol, i) => {
    const td = document.getElementById(`foot-qty-r${i}`);
    if (td) td.textContent = `n(${mol.formula}) = ${qtesR[i] !== undefined ? qtesR[i] : state.qtesR[i]} mol`;
  });
  rxn.produits.forEach((mol, j) => {
    const td = document.getElementById(`foot-qty-p${j}`);
    if (td) td.textContent = `n(${mol.formula}) = ${qtesP[j] !== undefined ? qtesP[j] : 0} mol`;
  });
}

function updateQtyWidgets() {
  state.qtesLimInit.forEach((v, i) => {
    const el = document.getElementById(`qty-val-${i}`);
    if (el) el.value = v;
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   ONGLETS
══════════════════════════════════════════════════════════════════════════ */
function _applyOngletUI(o) {
  ['equilibrage','limitant'].forEach(id => {
    document.getElementById('tab-'+id).classList.toggle('active', id===o);
    document.getElementById('section-'+id).classList.toggle('visible', id===o);
  });
  document.getElementById('panel-hint-eq').style.display  = o==='equilibrage' ? '' : 'none';
  document.getElementById('panel-hint-lim').style.display = o==='limitant'    ? '' : 'none';
}

function setOnglet(o) {
  state.onglet = o;
  _applyOngletUI(o);
  stopAnimations(); clearSnapshots(); clearStatus();
  if (o==='equilibrage') { buildEquationUI('eq'); buildThead('eq'); buildTbody('eq'); }
  else                   { buildEquationUI('lim'); buildThead('lim'); buildTbody('lim'); }
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

function onReactionChange(mode, val) {
  const idx = parseInt(val);
  stopAnimations(); clearSnapshots(); clearStatus();
  if (mode==='eq') {
    state.reactionEqIdx = idx; initCoeffsUser(); buildEquationUI('eq'); buildThead('eq'); buildTbody('eq');
  } else {
    state.reactionLimIdx = idx; state.predictions = {};
    initQtesLim(); buildEquationUI('lim'); buildThead('lim'); buildTbody('lim');
    if (!testState.actif) document.getElementById('btn-reagir-step').disabled = false;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   INIT COEFFICIENTS / QUANTITÉS
══════════════════════════════════════════════════════════════════════════ */
function initCoeffsUser() {
  const rxn = REACTIONS[state.reactionEqIdx];
  state.coeffsUser = Array(rxn.reactifs.length + rxn.produits.length).fill(1);
}

function initQtesLim() {
  const rxn = REACTIONS[state.reactionLimIdx];
  state.qtesLimInit = rxn.reactifs.map(() => 1);
  state.qtesR  = rxn.reactifs.map(() => 1);
  state.qtesP  = rxn.produits.map(() => 0);
  state.avancement = 0; state.xmax = null;
}

function getCoeffEq(idx) {
  const v = state.coeffsUser[idx];
  return (v===null||v===undefined||isNaN(v)||v<1) ? 1 : v;
}

function displayCoeffValue(v, mode) {
  const n = (v===null||v===undefined||isNaN(v)||v<1) ? 1 : v;
  const show = mode==='lim' ? state.showCoeffOneLim : state.showCoeffOneEq;
  return (n===1 && !show) ? '' : String(n);
}

/* ══════════════════════════════════════════════════════════════════════════
   INTERFACE ÉQUATION
══════════════════════════════════════════════════════════════════════════ */
function buildEquationUI(mode) {
  const rxn = REACTIONS[mode==='eq' ? state.reactionEqIdx : state.reactionLimIdx];
  const row = document.getElementById('equation-row');
  row.innerHTML = '';
  const addPlus = () => { const s=document.createElement('span'); s.className='eq-plus'; s.textContent='+'; row.appendChild(s); };
  const makeCoeffWidget = (idx, side) => {
    const wrap = document.createElement('div'); wrap.className=`coeff-widget ${side}`;
    const inp = document.createElement('input');
    inp.type='text'; inp.inputMode='numeric'; inp.maxLength=2;
    inp.dataset.index=idx; inp.value=displayCoeffValue(state.coeffsUser[idx],'eq');
    inp.addEventListener('input', onCoeffInput);
    const arrows = document.createElement('div'); arrows.className='coeff-arrows';
    const btnUp = document.createElement('button'); btnUp.className='coeff-arrow-btn'; btnUp.textContent='▲';
    btnUp.addEventListener('click', ()=>stepCoeff(idx,+1,inp));
    const btnDn = document.createElement('button'); btnDn.className='coeff-arrow-btn'; btnDn.textContent='▼';
    btnDn.addEventListener('click', ()=>stepCoeff(idx,-1,inp));
    arrows.appendChild(btnUp); arrows.appendChild(btnDn);
    wrap.appendChild(inp); wrap.appendChild(arrows); return wrap;
  };
  rxn.reactifs.forEach((mol, i) => {
    if (i>0) addPlus();
    const grp = document.createElement('div'); grp.className='mol-group';
    if (mode==='eq') grp.appendChild(makeCoeffWidget(i,'reactif'));
    else if (mol.coeff>1||state.showCoeffOneLim) { const s=document.createElement('span'); s.className='mol-coeff-fixed'; s.textContent=mol.coeff; grp.appendChild(s); }
    const f = document.createElement('span'); f.className='mol-formula reactif'; f.innerHTML=mol.formula; grp.appendChild(f);
    row.appendChild(grp);
  });
  const arr = document.createElement('span'); arr.className='eq-arrow'; arr.textContent='→'; row.appendChild(arr);
  rxn.produits.forEach((mol, j) => {
    if (j>0) addPlus();
    const grp = document.createElement('div'); grp.className='mol-group';
    if (mode==='eq') { grp.appendChild(makeCoeffWidget(rxn.reactifs.length+j,'produit')); }
    else if (mol.coeff>1||state.showCoeffOneLim) { const s=document.createElement('span'); s.className='mol-coeff-fixed produit'; s.textContent=mol.coeff; grp.appendChild(s); }
    const f = document.createElement('span'); f.className='mol-formula produit'; f.innerHTML=mol.formula; grp.appendChild(f);
    row.appendChild(grp);
  });
}

function onCoeffInput(e) {
  const idx=parseInt(e.target.dataset.index), raw=e.target.value.trim(), val=parseInt(raw);
  if (raw===''||isNaN(val)||val<1) { state.coeffsUser[idx]=1; e.target.value=displayCoeffValue(1,'eq'); }
  else { const c=Math.min(11,Math.max(1,val)); state.coeffsUser[idx]=c; e.target.value=displayCoeffValue(c,'eq'); }
  stopAnimations(); clearSnapshots(); clearStatus(); redraw();
}

function stepCoeff(idx, delta, inp) {
  const next = Math.min(11, Math.max(1, getCoeffEq(idx)+delta));
  state.coeffsUser[idx] = next; inp.value = displayCoeffValue(next,'eq');
  stopAnimations(); clearSnapshots(); clearStatus(); redraw();
}

/* ══════════════════════════════════════════════════════════════════════════
   MODE ÉQUILIBRAGE — TESTER
══════════════════════════════════════════════════════════════════════════ */
function testerEquilibrage() {
  stopAnimations(); clearStatus();
  const rxn = REACTIONS[state.reactionEqIdx];
  const coeffsR = rxn.reactifs.map((_,i) => getCoeffEq(i));
  const coeffsP = rxn.produits.map((_,j) => getCoeffEq(rxn.reactifs.length+j));
  if (getSpeedMultEq() === Infinity) { testerEquilibrageInstantane(rxn, coeffsR, coeffsP); return; }
  lancerAnimEquilibrage(coeffsR, coeffsP);
}

function testerEquilibrageInstantane(rxn, coeffsR, coeffsP) {
  const pool = {};
  rxn.reactifs.forEach(mol => {
    const count = coeffsR[rxn.reactifs.indexOf(mol)] || 0;
    const model = MOL_MODELS[mol.formula]; if (!model) return;
    for (let m = 0; m < count; m++) {
      model.atoms.forEach(a => { (pool[a.el] = pool[a.el] || []).push(1); });
    }
  });
  const maxDemand = rxn.produits.map((_,j) => coeffsP[j]);
  const formed = rxn.produits.map(() => 0);
  const countsPossible = rxn.produits.map(() => 0);
  let anyProgress = true;
  while (anyProgress) {
    anyProgress = false;
    rxn.produits.forEach((mol, j) => {
      if (formed[j] >= maxDemand[j]) return;
      const model = MOL_MODELS[mol.formula]; if (!model) return;
      const need = {};
      model.atoms.forEach(a => { need[a.el] = (need[a.el] || 0) + 1; });
      if (!Object.entries(need).every(([el,n]) => (pool[el]||[]).length >= n)) return;
      Object.entries(need).forEach(([el,n]) => { for (let k=0;k<n;k++) pool[el].shift(); });
      formed[j]++; countsPossible[j]++;
      anyProgress = true;
    });
  }
  const orphanSpecs = [];
  Object.keys(pool).forEach(el => { const excess=(pool[el]||[]).length; if (excess>0) orphanSpecs.push({el,count:excess}); });
  const orphans = [];
  if (orphanSpecs.length > 0) {
    const coeffs4Init = [coeffsR[0]||0, coeffsR[1]||0, 0, 0];
    const layoutInit = computeLayout(rxn, coeffs4Init);
    if (layoutInit) {
      const { midX, midY, midW, midH } = layoutInit;
      const BASE_R = 10, cell = BASE_R*2+8;
      const total = orphanSpecs.reduce((s,sp) => s+sp.count, 0);
      const cols2 = Math.max(1, Math.floor(Math.max(1,midW-16)/cell));
      const rows  = Math.ceil(total/cols2);
      const gridW = Math.min(cols2,total)*cell, gridH = rows*cell;
      const x0 = midX+(midW-gridW)/2+BASE_R;
      const y0 = midY+(midH-gridH)/2+BASE_R;
      let idx = 0;
      orphanSpecs.forEach(spec => {
        for (let k=0; k<spec.count; k++) {
          orphans.push({ el:spec.el, ex:x0+(idx%cols2)*cell, ey:y0+Math.floor(idx/cols2)*cell, r:BASE_R, assigned:false });
          idx++;
        }
      });
    }
  }
  const ghostCounts = state.showProductsEq
    ? rxn.produits.map((_,j) => getCoeffEq(rxn.reactifs.length+j))
    : rxn.produits.map(() => 0);
  const parfait = orphans.length === 0;
  state.animEq = { done:false, coeffsR, coeffsP, countsPossible, doneCount:countsPossible.slice(), ghostSlots:ghostCounts, atoms:orphans, parfait, rxn };
  document.getElementById('btn-tester').disabled = true;
  if (testState.actif) document.getElementById('btn-raz-eq').disabled = true;
  finirAnimEq();
  requestAnimationFrame(() => { fixAndRedraw('eq'); });
}

/* ══════════════════════════════════════════════════════════════════════════
   ANIMATION ÉQUILIBRAGE
══════════════════════════════════════════════════════════════════════════ */
const T_INTRO=600, T_DECONS_BONDS=500, T_DECONS_ATOMS=700, T_SCATTER=300;
const T_TRAVEL=800, T_BONDS=500, T_REMONTE=600, T_PAUSE_INTER=180, T_HOLD=300;
function teq_intro()       { return T_EQ(T_INTRO); }
function teq_deconsBonds() { return T_EQ(T_DECONS_BONDS); }
function teq_deconsAtoms() { return T_EQ(T_DECONS_ATOMS); }
function teq_scatter()     { return T_EQ(T_SCATTER); }
function teq_travel()      { return T_EQ(T_TRAVEL); }
function teq_bonds()       { return T_EQ(T_BONDS); }
function teq_remonte()     { return T_EQ(T_REMONTE); }
function teq_pauseInter()  { return T_EQ(T_PAUSE_INTER); }
function teq_hold()        { return T_EQ(T_HOLD); }

// Plus grande échelle qui permet de caser `count` cercles de rayon `maxR` (à cette échelle)
// dans une grille tenant dans availW x availH, en testant chaque nombre de colonnes possible.
function bestGridScale(count, maxR, availW, availH, gap) {
  if (count<=0 || maxR<=0) return 1;
  let best=MIN_MOL_SC;
  for (let cols=1; cols<=count; cols++) {
    const rows=Math.ceil(count/cols);
    const scByW=(availW/cols-gap)/(2*maxR);
    const scByH=(availH/rows-gap)/(2*maxR);
    const sc=Math.min(scByW,scByH);
    if (sc>best) best=sc;
  }
  return best;
}

function lancerAnimEquilibrage(coeffsR, coeffsP) {
  const rxn = REACTIONS[state.reactionEqIdx];
  const coeffs4Init = [coeffsR[0]||0, coeffsR[1]||0, 0, 0];
  const layoutInit = computeLayout(rxn, coeffs4Init);
  if (!layoutInit) return;
  const {midX,midY,midW,midH} = layoutInit;
  const midCY = midY+midH/2, PAD_ATOM = 20;
  const centeredRand = () => (Math.random()+Math.random())/2; // biais vers 0.5 (centre)

  const atoms = [];
  layoutInit.cols.filter(c=>c.type==='reactif').forEach(col => {
    const model = MOL_MODELS[col.formula]; if (!model) return;
    col.positions.forEach(molPos => {
      model.atoms.forEach(a => {
        const ix=molPos.cx+a.x*col.sc, iy=molPos.cy+a.y*col.sc;
        const len=Math.sqrt(a.x*a.x+a.y*a.y)||1e-9;
        const dist=getBoundingRadius(col.formula)*col.sc*0.55+10;
        const dx=a.x===0&&a.y===0?Math.cos(Math.random()*Math.PI*2):a.x/len;
        const dy=a.x===0&&a.y===0?Math.sin(Math.random()*Math.PI*2):a.y/len;
        const baseR=(a.el==='C'?model.radius:model.radius*0.75);
        const r=baseR*col.sc, pad=r+PAD_ATOM;
        const rawX=midX+pad+centeredRand()*(Math.max(0,midW-pad*2));
        const rawY=midCY+(centeredRand()-0.5)*(Math.max(0,midH-pad*2));
        const ex=Math.max(midX+pad,Math.min(midX+midW-pad,rawX+dx*dist));
        const ey=Math.max(midY+pad,Math.min(midY+midH-pad,rawY+dy*dist));
        const ex_rel=(ex-midX)/midW, ey_rel=(ey-midY)/midH;
        atoms.push({el:a.el,ix,iy,ex,ey,ex_rel,ey_rel,r,baseR,rTarget:r,assigned:false,midPosRef:null,modelAtomIdx:undefined,tx:ex,ty:ey,fx:ex,fy:ey});
      });
    });
  });

  // Taille des atomes tant qu'ils flottent librement dans la zone (phases "decons"/"scatter"),
  // calculée séparément de la taille qu'ils auront une fois regroupés en molécules (scMid
  // ci-dessous) : à ce stade ce sont des cercles individuels, pas des molécules compactes,
  // donc la zone peut en accueillir de bien plus gros sans qu'ils se chevauchent.
  const scScatter = atoms.length===0 ? 1 : bestGridScale(
    atoms.length, Math.max(...atoms.map(a=>a.baseR)),
    Math.max(1,midW-16), Math.max(1,midH-32), 6
  );
  // Ne jamais agrandir un atome au-delà de la taille qu'il avait dans sa colonne réactif d'origine.
  atoms.forEach(a => { a.rScatter=Math.min(a.baseR*scScatter, a.r); });

  const pool = {};
  atoms.forEach((a,i) => { (pool[a.el]=pool[a.el]||[]).push(i); });
  const queue=[], maxDemand=rxn.produits.map((_,j)=>coeffsP[j]);
  const formed=rxn.produits.map(()=>0), countsPossible=rxn.produits.map(()=>0);
  let anyProgress=true;
  while (anyProgress) {
    anyProgress=false;
    rxn.produits.forEach((mol,j) => {
      if (formed[j]>=maxDemand[j]) return;
      const model=MOL_MODELS[mol.formula]; if (!model) return;
      const need={};
      model.atoms.forEach(a => { need[a.el]=(need[a.el]||0)+1; });
      if (!Object.entries(need).every(([el,n])=>(pool[el]||[]).length>=n)) return;
      const atomIndices=[];
      Object.entries(need).forEach(([el,n]) => { for(let k=0;k<n;k++) atomIndices.push(pool[el].shift()); });
      formed[j]++; countsPossible[j]++;
      queue.push({formula:mol.formula,prodIdx:j,atomIndices});
      anyProgress=true;
    });
  }
  const allAssignedIndices=new Set(queue.flatMap(q=>q.atomIndices));

  // scMid est la plus grande échelle qui permet de caser TOUTES les molécules produits
  // (comptées ensemble, indépendamment de leur formule) dans une grille unique tenant dans
  // la zone de transition. On teste chaque nombre de colonnes possible et on prend l'échelle
  // maximale (limitée par la largeur ou la hauteur) qu'il permet : pas de plafond arbitraire,
  // on ne réduit donc jamais la taille si la zone a la place d'accueillir tout le monde.
  const totalCount=countsPossible.reduce((s,c)=>s+c,0);
  let scMid = totalCount===0 ? 1 : bestGridScale(
    totalCount, Math.max(...rxn.produits.filter((_,j)=>countsPossible[j]>0).map(mol=>getBoundingRadius(mol.formula))),
    Math.max(1,midW-16), Math.max(1,midH-32), 10
  );
  atoms.forEach(a => { a.rTarget=a.baseR*scMid; });

  // Sépare les atomes qui se chevauchent dans la zone de transition
  const SEP_ITER=6, SEP_MARGIN=4;
  for (let iter=0; iter<SEP_ITER; iter++) {
    for (let i=0; i<atoms.length; i++) {
      for (let j=i+1; j<atoms.length; j++) {
        const A=atoms[i], B=atoms[j];
        let dx=B.ex-A.ex, dy=B.ey-A.ey;
        let dist=Math.sqrt(dx*dx+dy*dy);
        const minDist=A.rScatter+B.rScatter+SEP_MARGIN;
        if (dist<minDist) {
          if (dist<1e-6) { dx=Math.random()-0.5; dy=Math.random()-0.5; dist=Math.sqrt(dx*dx+dy*dy)||1e-6; }
          const push=(minDist-dist)/2, nx=dx/dist, ny=dy/dist;
          A.ex-=nx*push; A.ey-=ny*push;
          B.ex+=nx*push; B.ey+=ny*push;
        }
      }
    }
    atoms.forEach(a => {
      const pad=a.rScatter+PAD_ATOM;
      a.ex=Math.max(midX+pad, Math.min(midX+midW-pad, a.ex));
      a.ey=Math.max(midY+pad, Math.min(midY+midH-pad, a.ey));
    });
  }
  atoms.forEach(a => { a.ex_rel=(a.ex-midX)/midW; a.ey_rel=(a.ey-midY)/midH; });

  // Colonne produit finale (et échelle associée) de chaque molécule, déterminée en amont :
  // la molécule doit déjà avoir sa taille définitive (celle de sa colonne produit) quand
  // elle s'assemble dans la zone de transition, pour ne plus changer de taille pendant
  // qu'elle en sort (elle ne fera plus alors que se déplacer).
  const coeffs4Final=[coeffsR[0]||0,coeffsR[1]||0,countsPossible[0]||0,countsPossible[1]||0];
  const layoutFinal=computeLayout(rxn,coeffs4Final);
  if (!layoutFinal) return;
  const ghostCounts=state.showProductsEq ? rxn.produits.map((_,j)=>getCoeffEq(rxn.reactifs.length+j)) : rxn.produits.map(()=>0);
  const coeffs4Ghost=[coeffsR[0]||0,coeffsR[1]||0,ghostCounts[0]||0,ghostCounts[1]||0];
  const layoutGhost=state.showProductsEq ? computeLayout(rxn,coeffs4Ghost) : null;
  queue.forEach(entry => {
    const colDest=(layoutGhost&&layoutGhost.cols.find(c=>c.type==='produit'&&c.idx===entry.prodIdx))||layoutFinal.cols.find(c=>c.type==='produit'&&c.idx===entry.prodIdx);
    entry.colDest=colDest; entry.destSc=colDest?colDest.sc:scMid;
  });

  // Grille unique et continue (partagée entre toutes les formules produits), cohérente
  // avec le calcul de scMid ci-dessus : les molécules de formules différentes se partagent
  // les lignes au lieu de démarrer un nouveau bloc de lignes à chaque formule, ce qui évite
  // de gaspiller de la hauteur (et donc de forcer un scMid plus petit que nécessaire). Cette
  // grille ne sert qu'à répartir les emplacements d'assemblage dans la zone (scMid) ; la
  // molécule y est ensuite dessinée à sa taille finale (destSc), pas à scMid.
  const midPosByProd=rxn.produits.map(()=>[]);
  if (queue.length>0) {
    const prodList=[];
    rxn.produits.forEach((mol,j) => { const cnt=countsPossible[j]; for(let k=0;k<cnt;k++) prodList.push({formula:mol.formula,prodIdx:j}); });
    const maxR0=Math.max(...prodList.map(p=>getBoundingRadius(p.formula)));
    const cell=maxR0*scMid*2+10;
    const cols=Math.max(1,Math.floor(Math.max(1,midW-16)/cell));
    const rows=Math.ceil(prodList.length/cols);
    const gw=Math.min(cols,prodList.length)*cell, gh=rows*cell;
    const x0=midX+(midW-gw)/2+cell/2;
    const y0=Math.max(midY+cell/2+4, midY+(midH-gh)/2+cell/2);
    prodList.forEach((p,k) => {
      const r=getBoundingRadius(p.formula)*scMid;
      const cx=x0+(k%cols)*cell;
      const rawCy=y0+Math.floor(k/cols)*cell;
      const cy=Math.min(midY+midH-r-4,Math.max(midY+r+4,rawCy));
      midPosByProd[p.prodIdx].push({formula:p.formula,sc:scMid,prodIdx:p.prodIdx,cx,cy});
    });
  }

  const cursors=rxn.produits.map(()=>0);
  queue.forEach(entry => {
    const j=entry.prodIdx, mp=midPosByProd[j][cursors[j]++];
    entry.midPos=mp; if (!mp) return;
    const destSc=entry.destSc; mp.sc=destSc;
    const model=MOL_MODELS[entry.formula], elGroups={};
    model.atoms.forEach((a,ai) => { if (!elGroups[a.el]) elGroups[a.el]={targets:[],indices:[]}; elGroups[a.el].targets.push({tx:mp.cx+a.x*destSc,ty:mp.cy+a.y*destSc,ai}); });
    entry.atomIndices.forEach(idx => { const el=atoms[idx].el; if (elGroups[el]) elGroups[el].indices.push(idx); });
    Object.values(elGroups).forEach(grp => {
      const used=new Set();
      grp.targets.forEach(tgt => {
        let bestIdx=-1,bestDist=Infinity;
        grp.indices.forEach(idx => { if (used.has(idx)) return; const a=atoms[idx]; const d=(a.ix-tgt.tx)**2+(a.iy-tgt.ty)**2; if (d<bestDist){bestDist=d;bestIdx=idx;} });
        if (bestIdx===-1) return;
        used.add(bestIdx);
        atoms[bestIdx].midTx=tgt.tx; atoms[bestIdx].midTy=tgt.ty;
        atoms[bestIdx].midTx_rel=(tgt.tx-midX)/midW; atoms[bestIdx].midTy_rel=(tgt.ty-midY)/midH;
        atoms[bestIdx].modelAtomIdx=tgt.ai; atoms[bestIdx].midPosRef=mp;
        atoms[bestIdx].rFinal=atoms[bestIdx].baseR*destSc;
      });
    });
  });

  const colCounters=rxn.produits.map(()=>0);
  queue.forEach(entry => {
    const j=entry.prodIdx;
    const colDest=entry.colDest;
    if (!colDest||!entry.midPos) return;
    const colPos=colDest.positions[colCounters[j]++]; if (!colPos) return;
    const model=MOL_MODELS[entry.formula];
    entry.atomIndices.forEach(idx => {
      const a=atoms[idx],ai=a.modelAtomIdx; if (ai===undefined) return;
      const ma=model.atoms[ai];
      a.fx=colPos.cx+ma.x*colDest.sc; a.fy=colPos.cy+ma.y*colDest.sc;
    });
  });
  allAssignedIndices.forEach(idx => { atoms[idx].assigned=true; });

  const anim={phase:0,subPhase:null,t0:null,atoms,layoutInit,layoutFinal,layoutGhost,queue,queueIdx:0,countsPossible,coeffsP,parfait:atoms.every(a=>a.assigned),doneCount:rxn.produits.map(()=>0),ghostSlots:ghostCounts,rafId:null,done:false,rxn,coeffsR,scMid};
  state.animEq=anim;
  document.getElementById('btn-tester').disabled=true;
  if (testState.actif) document.getElementById('btn-raz-eq').disabled=true;
  anim.rafId=requestAnimationFrame(t=>tickAnimEq(t));
}

function tickAnimEq(ts) {
  const anim=state.animEq; if (!anim||anim.done) return;
  const _cr=getCanvasCellRect(); if (!_cr||_cr.h<10) { anim.rafId=requestAnimationFrame(t=>tickAnimEq(t)); return; }
  if (anim.t0===null) anim.t0=ts;
  const dt=ts-anim.t0;
  molCtx.clearRect(0,0,molCanvas.width,molCanvas.height);
  const {atoms,layoutInit,layoutFinal,queue,rxn}=anim;
  const layoutBg=anim.phase===7?layoutFinal:layoutInit;
  drawBackground(layoutBg);
  const drawDoneMols=()=>{
    const layoutDraw=anim.layoutGhost||anim.layoutFinal;
    rxn.produits.forEach((mol,j)=>{
      const col=layoutDraw.cols.find(c=>c.type==='produit'&&c.idx===j); if (!col) return;
      for(let k=0;k<anim.doneCount[j];k++){const p=col.positions[k];if(!p)continue;drawMolecule(molCtx,col.formula,p.cx,p.cy,col.sc,1);}
    });
  };
  const drawGhosts=()=>{
    if (!anim.layoutGhost||!anim.ghostSlots) return;
    rxn.produits.forEach((mol,j)=>{
      const total=anim.ghostSlots[j]; if (!total) return;
      const col=anim.layoutGhost.cols.find(c=>c.type==='produit'&&c.idx===j); if (!col) return;
      for(let k=0;k<total;k++){const p=col.positions[k];if(!p)continue;drawMolecule(molCtx,col.formula,p.cx,p.cy,col.sc,0.35);}
    });
  };
  if (anim.phase===0) {
    layoutInit.cols.filter(c=>c.type==='reactif').forEach(col=>col.positions.forEach(p=>drawMolecule(molCtx,col.formula,p.cx,p.cy,col.sc,1)));
    drawGhosts();
    if (dt>=teq_intro()) { anim.phase=1;anim.subPhase='bonds';anim.t0=ts; }
    anim.rafId=requestAnimationFrame(t=>tickAnimEq(t)); return;
  }
  if (anim.phase===1&&anim.subPhase==='bonds') {
    const ease=easeInOut(Math.min(dt/teq_deconsBonds(),1));
    layoutInit.cols.filter(c=>c.type==='reactif').forEach(col=>col.positions.forEach(p=>drawBonds(molCtx,col.formula,p.cx,p.cy,col.sc,1-ease)));
    atoms.forEach(a=>drawAtom(molCtx,a.el,a.ix,a.iy,a.r,1));
    drawGhosts();
    if (ease>=1) { anim.subPhase='atoms';anim.t0=ts; }
    anim.rafId=requestAnimationFrame(t=>tickAnimEq(t)); return;
  }
  if (anim.phase===1&&anim.subPhase==='atoms') {
    const ease=easeInOut(Math.min(dt/teq_deconsAtoms(),1));
    atoms.forEach(a=>drawAtom(molCtx,a.el,lerp(a.ix,a.ex,ease),lerp(a.iy,a.ey,ease),lerp(a.r,a.rScatter,ease),1));
    drawGhosts();
    if (ease>=1) { anim.phase=2;anim.subPhase=null;anim.t0=ts; }
    anim.rafId=requestAnimationFrame(t=>tickAnimEq(t)); return;
  }
  if (anim.phase===2) {
    atoms.forEach(a=>drawAtom(molCtx,a.el,a.ex,a.ey,a.rScatter,1));
    drawGhosts();
    if (dt>=teq_scatter()) { anim.phase=queue.length===0?7:3;anim.t0=ts; }
    anim.rafId=requestAnimationFrame(t=>tickAnimEq(t)); return;
  }
  const qi=anim.queueIdx, entry=queue[qi];
  drawDoneMols(); drawGhosts();
  atoms.filter(a=>!a.assigned).forEach(a=>drawAtom(molCtx,a.el,a.ex,a.ey,a.rScatter,1));
  if (anim.phase===3) {
    const ease=easeInOut(Math.min(dt/teq_travel(),1));
    for(let k=qi+1;k<queue.length;k++) queue[k].atomIndices.forEach(idx=>drawAtom(molCtx,atoms[idx].el,atoms[idx].ex,atoms[idx].ey,atoms[idx].rScatter,1));
    entry.atomIndices.forEach(idx=>{const a=atoms[idx];drawAtom(molCtx,a.el,lerp(a.ex,a.midTx,ease),lerp(a.ey,a.midTy,ease),lerp(a.rScatter,a.rFinal??a.rTarget,ease),1);});
    if (ease>=1) { anim.phase=4;anim.t0=ts; }
    anim.rafId=requestAnimationFrame(t=>tickAnimEq(t)); return;
  }
  if (anim.phase===4) {
    const alpha=easeInOut(Math.min(dt/teq_bonds(),1));
    for(let k=qi+1;k<queue.length;k++) queue[k].atomIndices.forEach(idx=>drawAtom(molCtx,atoms[idx].el,atoms[idx].ex,atoms[idx].ey,atoms[idx].rScatter,1));
    if (entry.midPos) drawBonds(molCtx,entry.formula,entry.midPos.cx,entry.midPos.cy,entry.midPos.sc,alpha);
    entry.atomIndices.forEach(idx=>drawAtom(molCtx,atoms[idx].el,atoms[idx].midTx,atoms[idx].midTy,atoms[idx].rFinal??atoms[idx].rTarget,1));
    if (alpha>=1) { anim.phase=5;anim.t0=ts; }
    anim.rafId=requestAnimationFrame(t=>tickAnimEq(t)); return;
  }
  if (anim.phase===5) {
    const ease=easeInOut(Math.min(dt/teq_remonte(),1));
    for(let k=qi+1;k<queue.length;k++) queue[k].atomIndices.forEach(idx=>drawAtom(molCtx,atoms[idx].el,atoms[idx].ex,atoms[idx].ey,atoms[idx].rScatter,1));
    const mp=entry.midPos, model=MOL_MODELS[entry.formula];
    const refIdx=entry.atomIndices.find(idx=>atoms[idx].modelAtomIdx!==undefined);
    if (refIdx!==undefined) {
      const ref=atoms[refIdx],ma=model.atoms[ref.modelAtomIdx];
      const destSc=entry.destSc??mp.sc;
      const destCx=ref.fx-ma.x*destSc, destCy=ref.fy-ma.y*destSc;
      const cx=lerp(mp.cx,destCx,ease), cy=lerp(mp.cy,destCy,ease);
      drawBonds(molCtx,entry.formula,cx,cy,destSc,1);
    }
    entry.atomIndices.forEach(idx=>{const a=atoms[idx];drawAtom(molCtx,a.el,lerp(a.midTx,a.fx,ease),lerp(a.midTy,a.fy,ease),a.rFinal??a.rTarget,1);});
    if (ease>=1) { anim.doneCount[entry.prodIdx]++;anim.phase=6;anim.t0=ts; }
    anim.rafId=requestAnimationFrame(t=>tickAnimEq(t)); return;
  }
  if (anim.phase===6) {
    drawDoneMols(); drawGhosts();
    atoms.filter(a=>!a.assigned).forEach(a=>drawAtom(molCtx,a.el,a.ex,a.ey,a.rScatter,1));
    for(let k=qi+1;k<queue.length;k++) queue[k].atomIndices.forEach(idx=>drawAtom(molCtx,atoms[idx].el,atoms[idx].ex,atoms[idx].ey,atoms[idx].rScatter,1));
    if (dt>=teq_pauseInter()) {
      anim.queueIdx++;
      if (state._needRelayoutAfterAnim && anim.queueIdx < queue.length) { state._needRelayoutAfterAnim=false; relayoutAnimEq(); }
      anim.phase=anim.queueIdx>=queue.length?7:3; anim.t0=ts;
    }
    anim.rafId=requestAnimationFrame(t=>tickAnimEq(t)); return;
  }
  if (anim.phase===7) {
    const layoutDraw=anim.layoutGhost||anim.layoutFinal;
    drawGhosts();
    layoutDraw.cols.filter(c=>c.type==='produit').forEach(col=>{
      for(let k=0;k<anim.doneCount[col.idx];k++){const p=col.positions[k];if(!p)continue;drawMolecule(molCtx,col.formula,p.cx,p.cy,col.sc,1);}
    });
    atoms.filter(a=>!a.assigned).forEach(a=>drawAtom(molCtx,a.el,a.ex,a.ey,a.rScatter,1));
    if (dt>=teq_hold()) { finirAnimEq(); return; }
    anim.rafId=requestAnimationFrame(t=>tickAnimEq(t)); return;
  }
  anim.rafId=requestAnimationFrame(t=>tickAnimEq(t));
}

function relayoutAnimEq() {
  const anim=state.animEq; if (!anim) return;
  const {atoms,queue,queueIdx,rxn,coeffsR,countsPossible}=anim;
  const coeffs4Init=[coeffsR[0]||0,coeffsR[1]||0,0,0];
  invalidateGeomCache(); fixCanvasRowHeight('eq'); resizeCanvas();
  const newLayout=computeLayout(rxn,coeffs4Init); if (!newLayout) return;
  const {midX,midY,midW,midH}=newLayout;
  anim.layoutInit=newLayout;
  atoms.forEach(a => {
    if (a.ex_rel!==undefined&&a.ey_rel!==undefined) { a.ex=midX+a.ex_rel*midW; a.ey=midY+a.ey_rel*midH; }
  });
  const remainingCounts=rxn.produits.map((_,j)=>queue.slice(queueIdx).filter(e=>e.prodIdx===j).length);
  const scMid=anim.scMid;

  // Recalcule la colonne produit finale (et son échelle) de chaque molécule restante, avant
  // de reconstruire la grille d'assemblage, pour que les molécules gardent leur taille finale
  // (destSc) même après un redimensionnement — voir lancerAnimEquilibrage.
  const coeffs4Final=[coeffsR[0]||0,coeffsR[1]||0,countsPossible[0]||0,countsPossible[1]||0];
  const newLayoutFinal=computeLayout(rxn,coeffs4Final);
  const ghostCounts=anim.ghostSlots||rxn.produits.map(()=>0);
  const coeffs4Ghost=[coeffsR[0]||0,coeffsR[1]||0,ghostCounts[0]||0,ghostCounts[1]||0];
  const newLayoutGhost=(anim.layoutGhost&&newLayoutFinal)?computeLayout(rxn,coeffs4Ghost):null;
  if (newLayoutFinal) {
    queue.slice(queueIdx).forEach(entry => {
      const colDest=(newLayoutGhost&&newLayoutGhost.cols.find(c=>c.type==='produit'&&c.idx===entry.prodIdx))||newLayoutFinal.cols.find(c=>c.type==='produit'&&c.idx===entry.prodIdx);
      if (colDest) { entry.colDest=colDest; entry.destSc=colDest.sc; }
    });
  }

  const newMidPosByProd=rxn.produits.map(()=>[]);
  let pMidIdx=0;
  rxn.produits.forEach((mol,j) => {
    const cnt=remainingCounts[j]; if (!cnt) return;
    const r=getBoundingRadius(mol.formula)*scMid, cell=r*2+10;
    const cols2=Math.max(1,Math.floor(Math.max(1,midW-16)/cell));
    const gw=Math.min(cols2,cnt)*cell, x0=midX+(midW-gw)/2+cell/2;
    const startY=midY+22+pMidIdx*(r*2+14)+r;
    for (let k=0;k<cnt;k++) {
      const rawCy=startY+Math.floor(k/cols2)*cell;
      const cy=Math.min(midY+midH-r-4,Math.max(midY+r+4,rawCy));
      newMidPosByProd[j].push({formula:mol.formula,sc:scMid,prodIdx:j,cx:x0+(k%cols2)*cell,cy});
    }
    pMidIdx+=Math.ceil(cnt/cols2);
  });
  const cursors=rxn.produits.map(()=>0);
  queue.slice(queueIdx).forEach(entry => {
    const j=entry.prodIdx;
    const mp=newMidPosByProd[j][cursors[j]++]; if (!mp) return;
    entry.midPos=mp;
    const destSc=entry.destSc??mp.sc; mp.sc=destSc;
    const model=MOL_MODELS[entry.formula];
    entry.atomIndices.forEach(idx => {
      const a=atoms[idx]; if (a.modelAtomIdx===undefined) return;
      const ma=model.atoms[a.modelAtomIdx];
      a.midTx=mp.cx+ma.x*destSc; a.midTy=mp.cy+ma.y*destSc;
      a.midTx_rel=(a.midTx-midX)/midW; a.midTy_rel=(a.midTy-midY)/midH;
      a.rFinal=a.baseR*destSc;
    });
  });
  if (newLayoutFinal) {
    anim.layoutFinal=newLayoutFinal;
    if (newLayoutGhost) anim.layoutGhost=newLayoutGhost;
    const colCountersStart=[...anim.doneCount];
    queue.slice(queueIdx).forEach(entry => {
      const j=entry.prodIdx;
      const colDest=entry.colDest;
      if (!colDest) return;
      const colPos=colDest.positions[colCountersStart[j]++]; if (!colPos) return;
      const model=MOL_MODELS[entry.formula];
      entry.atomIndices.forEach(idx => {
        const a=atoms[idx]; if (a.modelAtomIdx===undefined) return;
        const ma=model.atoms[a.modelAtomIdx];
        a.fx=colPos.cx+ma.x*colDest.sc; a.fy=colPos.cy+ma.y*colDest.sc;
      });
    });
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   VITESSE
══════════════════════════════════════════════════════════════════════════ */
const T_LIM_BASE = { DECONS_BONDS:400, TRAVEL:700, BONDS:400, PAUSE:250, HOLD:1000 };
function getSpeedMult() {
  const v=parseInt(document.getElementById('speed-slider')?.value??0);
  return [1,2,3,Infinity][v]??1;
}
function getSpeedMultEq() {
  const v=parseInt(document.getElementById('speed-slider-eq')?.value??0);
  return [1,2,3,Infinity][v]??1;
}
function T_LIM(key) { const m=getSpeedMult(); return m===Infinity?0:Math.round(T_LIM_BASE[key]/m); }
function T_EQ(baseMs) { const m=getSpeedMultEq(); return m===Infinity?0:Math.round(baseMs/m); }

function updateSpeedLabelsForSlider(sliderId, labelsId) {
  const slider=document.getElementById(sliderId); if (!slider) return;
  const v=parseInt(slider.value);
  const labels=document.querySelectorAll(`#${labelsId} span`);
  labels.forEach((s,i)=>s.classList.toggle('active',i===v));
  const pct=(v/3)*100;
  slider.style.background=`linear-gradient(to right,#2a6aaa 0%,#2a6aaa ${pct}%,#c8c0b4 ${pct}%,#c8c0b4 100%)`;
}
function updateSpeedLabels()   { updateSpeedLabelsForSlider('speed-slider','speed-labels-lim'); }
function updateSpeedLabelsEq() { updateSpeedLabelsForSlider('speed-slider-eq','speed-labels-eq'); }

/* ══════════════════════════════════════════════════════════════════════════
   MODE RÉACTIF LIMITANT — ANIMATION
══════════════════════════════════════════════════════════════════════════ */
function prepareTourLim(anim) {
  const rxn=anim.rxn;
  const layoutSrc=anim.layoutSrcFixed, layoutDst=anim.layoutDstFixed;
  if (!layoutSrc||!layoutDst) return [];
  const pool={};
  rxn.reactifs.forEach((mol,i) => {
    const colSrc=layoutSrc.cols.find(c=>c.type==='reactif'&&c.idx===i); if (!colSrc) return;
    const model=MOL_MODELS[colSrc.formula]; if (!model) return;
    const start=anim.qtesR[i]-mol.coeff;
    for (let k=start;k<anim.qtesR[i];k++) {
      const molPosSrc=colSrc.positions[k]; if (!molPosSrc) continue;
      model.atoms.forEach((a,ai) => {
        const el=a.el;
        if (!pool[el]) pool[el]=[];
        pool[el].push({el,ix:molPosSrc.cx+a.x*colSrc.sc,iy:molPosSrc.cy+a.y*colSrc.sc,r_src:(el==='H'?model.radius*0.65:model.radius)*colSrc.sc,colIdx:i,molIdx:k,fx:0,fy:0,r_dst:0,prodMolRef:null});
      });
    }
  });
  const passes=[];
  rxn.produits.forEach((mol,j) => {
    const colDst=layoutDst.cols.find(c=>c.type==='produit'&&c.idx===j); if (!colDst) return;
    const model=MOL_MODELS[mol.formula]; if (!model) return;
    const flyAtoms=[], prodMols=[];
    for (let k=0;k<mol.coeff;k++) {
      const slotIdx=anim.qtesP[j]+k;
      const pos=colDst.positions[slotIdx]; if (!pos) continue;
      const pm={formula:mol.formula,prodIdx:j,slotIdx,pos,model,sc:colDst.sc};
      prodMols.push(pm);
      model.atoms.forEach((a,ai) => {
        const el=a.el, avail=pool[el]||[];
        if (!avail.length) return;
        const tx=pos.cx+a.x*colDst.sc, ty=pos.cy+a.y*colDst.sc;
        let bestI=0, bestDist=Infinity;
        avail.forEach((fa,ri) => { const d=(fa.ix-tx)**2+(fa.iy-ty)**2; if(d<bestDist){bestDist=d;bestI=ri;} });
        const fa=avail.splice(bestI,1)[0];
        fa.fx=tx; fa.fy=ty; fa.r_dst=(el==='H'?model.radius*0.65:model.radius)*colDst.sc; fa.prodMolRef=pm;
        flyAtoms.push(fa);
      });
    }
    if (flyAtoms.length>0) passes.push({prodIdx:j,flyAtoms,prodMols});
  });
  return passes;
}

function tickAnimLim(ts) {
  const anim=state.animLim; if (!anim||anim.done) return;
  const _cr=getCanvasCellRect();
  if (!_cr||_cr.h<10) { anim.rafId=requestAnimationFrame(t=>tickAnimLim(t)); return; }
  if (anim.t0===null) anim.t0=ts;
  const dt=ts-anim.t0;
  const rxn=anim.rxn;

  const keysProchainTour=(qtesR)=>{
    const s=new Set();
    rxn.reactifs.forEach((mol,i) => { const start=qtesR[i]-mol.coeff; for(let k=start;k<qtesR[i];k++) if(k>=0) s.add(`${i}_${k}`); });
    return s;
  };
  const drawStable=()=>{
    molCtx.clearRect(0,0,molCanvas.width,molCanvas.height);
    const layout=anim.layoutSrcFixed, layoutDst=anim.layoutDstFixed;
    drawBackground(layout,true);
    const flyingKeys=new Set();
    (anim.passes||[]).forEach(p=>p.flyAtoms.forEach(fa=>flyingKeys.add(`${fa.colIdx}_${fa.molIdx}`)));
    rxn.reactifs.forEach((mol,i) => {
      const col=layout.cols.find(c=>c.type==='reactif'&&c.idx===i); if (!col) return;
      col.positions.forEach((p,k) => {
        if (k>=anim.qtesRInit[i]) return;
        if (k>=anim.qtesR[i]&&!flyingKeys.has(`${i}_${k}`)) return;
        if (flyingKeys.has(`${i}_${k}`)) return;
        const alpha=anim.reactifsOpaques.has(`${i}_${k}`)?1:0.25;
        drawMolecule(molCtx,col.formula,p.cx,p.cy,col.sc,alpha);
      });
    });
    rxn.produits.forEach((mol,j) => {
      const col=layoutDst.cols.find(c=>c.type==='produit'&&c.idx===j); if (!col) return;
      for(let k=0;k<anim.qtesP[j];k++) { const p=col.positions[k]; if(p) drawMolecule(molCtx,col.formula,p.cx,p.cy,col.sc,1); }
    });
  };
  const drawPasseAtoms=(passe,t_fly)=>{
    passe.flyAtoms.forEach(fa=>drawAtom(molCtx,fa.el,lerp(fa.ix,fa.fx,t_fly),lerp(fa.iy,fa.fy,t_fly),lerp(fa.r_src,fa.r_dst,t_fly),1));
  };
  const drawPasseFinal=(passe,bondAlpha)=>{
    if (bondAlpha>0) passe.prodMols.forEach(pm=>drawBonds(molCtx,pm.formula,pm.pos.cx,pm.pos.cy,pm.sc,bondAlpha));
    passe.flyAtoms.forEach(fa=>drawAtom(molCtx,fa.el,fa.fx,fa.fy,fa.r_dst,1));
  };

  if (getSpeedMult()===Infinity) {
    for (let s=anim.step;s<anim.nMax;s++) {
      rxn.reactifs.forEach((mol,i)=>{anim.qtesR[i]-=mol.coeff;});
      rxn.produits.forEach((mol,j)=>{anim.qtesP[j]+=mol.coeff;});
      state.avancement++;
    }
    anim.step=anim.nMax;
    state.qtesR=anim.qtesR.slice(); state.qtesP=anim.qtesP.slice();
    updateTableFoot(state.avancement,anim.qtesR.slice(),anim.qtesP.slice(),state.xmax);
    anim.reactifsOpaques.clear();
    if (anim.isStep) {
      const tourSuivantPossible=state.avancement<(anim.nMaxTotal??anim.nMax);
      if (tourSuivantPossible) keysProchainTour(anim.qtesR).forEach(k=>anim.reactifsOpaques.add(k));
    }
    anim.done=true; finirAnimLim();
    const _redrawInstant=()=>{
      fixCanvasRowHeight('lim');
      state._skipAutoRedraw=true; resizeCanvas(); state._skipAutoRedraw=false;
      if (state.lastFrameLim&&state.stepCache) {
        const sc=state.stepCache.scalesFixed, f=state.lastFrameLim;
        const rxnL=f.rxn;
        const qtesRInitGlobal=state.stepCache.qtesRInitGlobal;
        const qtesP_initGlobal=state.stepCache.qtesP_initGlobal;
        const nMaxTotal=state.stepCache.nMaxTotal;
        const qtesR_fin=rxnL.reactifs.map((mol,i)=>qtesRInitGlobal[i]-mol.coeff*nMaxTotal);
        const qtesP_fin=rxnL.produits.map((mol,j)=>qtesP_initGlobal[j]+mol.coeff*nMaxTotal);
        const newSrc=computeLayoutLimFixed(qtesRInitGlobal,qtesP_initGlobal,sc);
        const newDst=computeLayoutLimFixed(qtesR_fin,qtesP_fin,sc);
        if (newSrc) state.lastFrameLim.layoutSrc=newSrc;
        if (newDst) state.lastFrameLim.layoutDst=newDst;
      }
      redraw();
    };
    requestAnimationFrame(_redrawInstant); return;
  }

  if (anim.phase==='dissolve') {
    anim.passes=prepareTourLim(anim); anim.passeIdx=0; anim.phase='fly_p'; anim.t0=ts;
    if (!anim.dissolveInitDone) { anim.reactifsOpaques.clear(); anim.dissolveInitDone=true; }
    keysProchainTour(anim.qtesR).forEach(k=>anim.reactifsOpaques.add(k));
    const nextR=rxn.reactifs.map((mol,i)=>anim.qtesR[i]-mol.coeff);
    const nextAdv=state.avancement+1;
    const tdAdv=document.getElementById('foot-avancement');
    if (tdAdv) { tdAdv.textContent=`x = ${nextAdv} mol`; tdAdv.classList.remove('xmax'); }
    rxn.reactifs.forEach((mol,i)=>{ const td=document.getElementById(`foot-qty-r${i}`); if(td) td.textContent=`n(${mol.formula}) = ${nextR[i]} mol`; });
    drawStable();
    anim.passes.forEach(passe=>passe.flyAtoms.forEach(fa=>drawAtom(molCtx,fa.el,fa.ix,fa.iy,fa.r_src,1)));
    anim.rafId=requestAnimationFrame(t=>tickAnimLim(t)); return;
  }
  if (anim.phase==='fly_p') {
    const passe=anim.passes[anim.passeIdx];
    if (!passe) { anim.phase='end_turn'; anim.t0=ts; anim.rafId=requestAnimationFrame(t=>tickAnimLim(t)); return; }
    const ease=easeInOut(Math.min(dt/Math.max(1,T_LIM('TRAVEL')),1));
    drawStable();
    for(let k=0;k<anim.passeIdx;k++) drawPasseFinal(anim.passes[k],1);
    for(let k=anim.passeIdx+1;k<anim.passes.length;k++) anim.passes[k].flyAtoms.forEach(fa=>drawAtom(molCtx,fa.el,fa.ix,fa.iy,fa.r_src,1));
    drawPasseAtoms(passe,ease);
    if (ease>=1) { anim.phase='bonds_p'; anim.t0=ts; }
    anim.rafId=requestAnimationFrame(t=>tickAnimLim(t)); return;
  }
  if (anim.phase==='bonds_p') {
    const passe=anim.passes[anim.passeIdx];
    const alpha=easeInOut(Math.min(dt/Math.max(1,T_LIM('BONDS')),1));
    drawStable();
    for(let k=0;k<anim.passeIdx;k++) drawPasseFinal(anim.passes[k],1);
    for(let k=anim.passeIdx+1;k<anim.passes.length;k++) anim.passes[k].flyAtoms.forEach(fa=>drawAtom(molCtx,fa.el,fa.ix,fa.iy,fa.r_src,1));
    drawPasseFinal(passe,alpha);
    if (alpha>=1) { anim.passeIdx++; anim.phase='fly_p'; anim.t0=ts; }
    anim.rafId=requestAnimationFrame(t=>tickAnimLim(t)); return;
  }
  if (anim.phase==='end_turn') {
    rxn.reactifs.forEach((mol,i)=>{anim.qtesR[i]-=mol.coeff;});
    rxn.produits.forEach((mol,j)=>{anim.qtesP[j]+=mol.coeff;});
    anim.step++; state.avancement++;
    state.qtesR=anim.qtesR.slice(); state.qtesP=anim.qtesP.slice();
    rxn.produits.forEach((mol,j)=>{ const td=document.getElementById(`foot-qty-p${j}`); if(td) td.textContent=`n(${mol.formula}) = ${anim.qtesP[j]} mol`; });
    anim.reactifsOpaques.clear();
    const tourSuivantPossible=state.avancement<(anim.nMaxTotal??anim.nMax);
    if (tourSuivantPossible) keysProchainTour(anim.qtesR).forEach(k=>anim.reactifsOpaques.add(k));
    drawStable();
    if (anim.passes) anim.passes.forEach(passe=>drawPasseFinal(passe,1));
    if (anim.step>=anim.nMax) { anim.done=true; finirAnimLim(); return; }
    anim.phase='preview'; anim.t0=ts; anim.rafId=requestAnimationFrame(t=>tickAnimLim(t)); return;
  }
  if (anim.phase==='preview') {
    if (state._needRelayoutAfterAnim) {
      state._needRelayoutAfterAnim=false;
      const scalesFixed=anim.layoutSrcFixed.cols.map(c=>c.sc);
      fixCanvasRowHeight('lim'); state._skipAutoRedraw=true; resizeCanvas(); state._skipAutoRedraw=false;
      const cache=state.stepCache;
      const qtesRInitGlobal=cache?cache.qtesRInitGlobal:anim.qtesRInit.slice();
      const qtesP_initGlobal=cache?cache.qtesP_initGlobal:rxn.produits.map(()=>0);
      const nMaxTotal=cache?cache.nMaxTotal:anim.nMaxTotal??anim.nMax;
      const qtesR_fin=rxn.reactifs.map((mol,i)=>qtesRInitGlobal[i]-mol.coeff*nMaxTotal);
      const qtesP_fin=rxn.produits.map((mol,j)=>qtesP_initGlobal[j]+mol.coeff*nMaxTotal);
      const newSrc=computeLayoutLimFixed(qtesRInitGlobal,qtesP_initGlobal,scalesFixed);
      const newDst=computeLayoutLimFixed(qtesR_fin,qtesP_fin,scalesFixed);
      if (newSrc) anim.layoutSrcFixed=newSrc;
      if (newDst) anim.layoutDstFixed=newDst;
    }
    drawStable();
    if (anim.passes) anim.passes.forEach(passe=>drawPasseFinal(passe,1));
    if (anim.isStep) { anim.done=true; finirAnimLim(); return; }
    if (dt>=T_LIM('HOLD')) { anim.phase='dissolve'; anim.t0=ts; }
    anim.rafId=requestAnimationFrame(t=>tickAnimLim(t)); return;
  }
  anim.rafId=requestAnimationFrame(t=>tickAnimLim(t));
}

/* ══════════════════════════════════════════════════════════════════════════
   PRÉDICTION
══════════════════════════════════════════════════════════════════════════ */
function predictionEstCorrecte(qtesRFin, qtesPFin, xmaxFin) {
  const rxn=REACTIONS[state.reactionLimIdx];
  const predX=state.predictions['pred-xmax'], realX=xmaxFin??state.avancement;
  if (predX!==null&&predX!==undefined&&Math.abs(predX-realX)>=0.01) return false;
  for (let i=0;i<N_COLS;i++) {
    const isR=i<N_REACTIFS, idx=isR?i:i-N_REACTIFS;
    const arr=isR?rxn.reactifs:rxn.produits;
    if (idx>=arr.length) continue;
    const key=isR?`pred-r${idx}`:`pred-p${idx}`;
    const predVal=state.predictions[key];
    if (predVal===null||predVal===undefined) continue;
    const realVal=isR?qtesRFin[idx]:qtesPFin[idx];
    if (Math.abs(predVal-realVal)>=0.01) return false;
  }
  return true;
}

/* ══════════════════════════════════════════════════════════════════════════
   UTILITAIRES
══════════════════════════════════════════════════════════════════════════ */
function updatePopupSpacer() {
  const spacer=document.getElementById('popup-spacer'); if (!spacer) return;
  const popup=document.getElementById('test-popup'), status=document.getElementById('status-msg');
  const el=(popup&&popup.classList.contains('visible'))?popup:(status&&status.className!=='')?status:null;
  if (!el) { spacer.style.height='0'; return; }
  requestAnimationFrame(()=>{
    const ref=document.getElementById('canvas-and-table'); if (!ref) { spacer.style.height='0'; return; }
    const refBottom=ref.getBoundingClientRect().bottom;
    const popupH=el.getBoundingClientRect().height;
    const bottomFixed=28, margeConfort=20;
    const popupTop=window.innerHeight-bottomFixed-popupH;
    const manque=refBottom+margeConfort-popupTop;
    spacer.style.height=manque>0?Math.ceil(manque)+'px':'0';
  });
}

function setStatus(msg,cls) { const el=document.getElementById('status-msg'); el.textContent=msg; el.className=cls; updatePopupSpacer(); }
function clearStatus()      { const el=document.getElementById('status-msg'); el.className=''; el.textContent=''; updatePopupSpacer(); }

function stopAnimations() {
  if (state.animEq) { cancelAnimationFrame(state.animEq.rafId); state.animEq=null; document.getElementById('btn-tester').disabled=false; }
  if (state.animLim) { cancelAnimationFrame(state.animLim.rafId); state.animLim=null; document.getElementById('btn-reagir-max').disabled=false; document.getElementById('btn-reagir-step').disabled=false; }
}
function clearSnapshots() { state.lastFrameEq=null; state.lastFrameLim=null; state.stepCache=null; }

function toggleShowCoeffOneEq()  { state.showCoeffOneEq=!state.showCoeffOneEq; document.getElementById('btn-show-one-eq').classList.toggle('active',state.showCoeffOneEq); buildEquationUI('eq'); redraw(); }
function toggleShowProductsEq()  { state.showProductsEq=!state.showProductsEq; document.getElementById('btn-show-products-eq').classList.toggle('active',state.showProductsEq); redraw(); }
function resetShowProductsEq()   { state.showProductsEq=false; const btn=document.getElementById('btn-show-products-eq'); if(btn) btn.classList.remove('active'); }
function toggleShowCoeffOneLim() { state.showCoeffOneLim=!state.showCoeffOneLim; document.getElementById('btn-show-one-lim').classList.toggle('active',state.showCoeffOneLim); buildEquationUI('lim'); redraw(); }

function razEquilibrage() { stopAnimations(); clearSnapshots(); clearStatus(); document.getElementById('eq-progress').textContent=''; buildEquationUI('eq'); redraw(); }
function razLimitant() {
  stopAnimations(); clearSnapshots(); clearStatus(); unlockPrediction();
  state.qtesR=state.qtesLimInit.slice();
  state.qtesP=REACTIONS[state.reactionLimIdx].produits.map(()=>0);
  state.avancement=0; state.xmax=null;
  document.getElementById('lim-progress').textContent='';
  if (!testState.actif) document.getElementById('btn-reagir-step').disabled=false;
  updateTableFoot(0,state.qtesR.slice(),state.qtesP.slice(),null);
  rebuildExtraRows(false);
  requestAnimationFrame(()=>fixAndRedraw('lim'));
}
function setQteLimDirect(i,val) {
  state.qtesLimInit[i]=val;
  state.qtesR=state.qtesLimInit.slice();
  state.qtesP=REACTIONS[state.reactionLimIdx].produits.map(()=>0);
  state.avancement=0; state.xmax=null;
  stopAnimations(); clearSnapshots(); clearStatus();
  if (!testState.actif) document.getElementById('btn-reagir-step').disabled=false;
  updateTableFoot(0,state.qtesR.slice(),state.qtesP.slice(),null);
  rebuildExtraRows(false);
  requestAnimationFrame(()=>fixAndRedraw('lim'));
}
function changeQteLim(i,delta) {
  const next=Math.max(0,Math.min(20,state.qtesLimInit[i]+delta));
  const el=document.getElementById(`qty-val-${i}`); if(el) el.value=next;
  setQteLimDirect(i,next);
}

/* ══════════════════════════════════════════════════════════════════════════
   COMPARAISON
══════════════════════════════════════════════════════════════════════════ */
const CMP_LABELS=['Désactivée','Comparaison brute','Comparaison avec coefficients stœch.'];

function rebuildExtraRows(resize=true) {
  invalidateGeomCache();
  const tfoot=document.getElementById('table-tfoot'); if (!tfoot) return;
  tfoot.querySelector('tr.pred-row')?.remove();
  tfoot.querySelector('tr.cmp-row')?.remove();
  if (state.predictionMode) {
    const rxn=REACTIONS[state.reactionLimIdx];
    const tr=document.createElement('tr'); tr.className='pred-row';
    const tdAdv=document.createElement('td'); tdAdv.className='td-adv'; tdAdv.id='pred-adv-cell';
    tdAdv.appendChild(makePredWidget('pred-xmax','xmax =','mol','adv')); tr.appendChild(tdAdv);
    for (let i=0;i<N_COLS;i++) {
      const td=document.createElement('td');
      const isR=i<N_REACTIFS, idx=isR?i:i-N_REACTIFS;
      const arr=isR?rxn.reactifs:rxn.produits, isActive=idx<arr.length;
      td.className=(isActive?(isR?'td-reactif':'td-produit'):'')+(i===N_REACTIFS-1?' sep-rp':'');
      if (isActive) { const mol=arr[idx]; const key=isR?`pred-r${idx}`:`pred-p${idx}`; td.appendChild(makePredWidget(key,`n(${mol.formula}) =`,'mol',isR?'reactif':'produit')); }
      tr.appendChild(td);
    }
    tfoot.appendChild(tr);
  }
  if (state.comparaisonMode>0) {
    const rxn=REACTIONS[state.reactionLimIdx], mode=state.comparaisonMode;
    const tr=document.createElement('tr'); tr.className='cmp-row';
    const tdLbl=document.createElement('td'); tdLbl.className='td-adv cmp-label';
    tdLbl.innerHTML=mode===1?'Comparaison<br>brute':'Comparaison avec<br>coefficients<br>stœchiométriques';
    tr.appendChild(tdLbl);
    const tdCnt=document.createElement('td'); tdCnt.className='cmp-content'; tdCnt.colSpan=N_COLS;
    tdCnt.innerHTML=buildCmpText(rxn,mode); tr.appendChild(tdCnt);
    tfoot.appendChild(tr);
  }
  if (resize) { requestAnimationFrame(()=>fixAndRedraw('lim')); }
  else        { requestAnimationFrame(()=>redraw()); }
}

function buildCmpText(rxn,mode) {
  const qtesI=state.qtesLimInit;
  if (mode===1) {
    const parts=rxn.reactifs.map((mol,i)=>({formula:mol.formula,val:qtesI[i]??0}));
    let html='';
    parts.forEach((p,i)=>{
      if(i>0){const op=parts[i-1].val>p.val?'>':parts[i-1].val<p.val?'<':'=';html+=` <strong>${op}</strong> `;}
      html+=`nᵢ(${p.formula}) = ${p.val} mol`;
    });
    return html;
  }
  const parts=rxn.reactifs.map((mol,i)=>{const q=qtesI[i]??0;return{formula:mol.formula,coeff:mol.coeff,val:q,ratio:mol.coeff>0?q/mol.coeff:0};});
  let html='';
  parts.forEach((p,i)=>{
    if(i>0){const op=parts[i-1].ratio>p.ratio?'>':parts[i-1].ratio<p.ratio?'<':'=';html+=` <strong>${op}</strong> `;}
    const ratioStr=Number.isInteger(p.ratio)?p.ratio:+p.ratio.toFixed(3);
    html+=`<span class="cmp-frac"><span class="cmp-frac-num">nᵢ(${p.formula})</span><span class="cmp-frac-den">${p.coeff}</span></span> = ${ratioStr} mol`;
  });
  const minRatio=Math.min(...parts.map(p=>p.ratio));
  const lims=parts.filter(p=>Math.abs(p.ratio-minRatio)<1e-9);
  if (lims.length===parts.length) html+=` &nbsp;— <span class="cmp-limitant">Les deux réactifs sont limitants, mélange initial stœchiométrique.</span>`;
  else if (lims.length===1) html+=` &nbsp;— <span class="cmp-limitant">${lims[0].formula} est le réactif limitant</span>`;
  else html+=` &nbsp;— <span class="cmp-limitant">Les deux réactifs sont limitants, mélange initial stœchiométrique.</span>`;
  return html;
}

function cycleComparaison() {
  state.comparaisonMode=(state.comparaisonMode+1)%3;
  const lbl=document.getElementById('btn-comparaison-label'); if(lbl) lbl.textContent=CMP_LABELS[state.comparaisonMode];
  const btn=document.getElementById('btn-comparaison'); if(btn) btn.classList.toggle('active',state.comparaisonMode>0);
  rebuildExtraRows();
}

function togglePrediction() {
  state.predictionMode=!state.predictionMode;
  const btn=document.getElementById('btn-prediction');
  btn.classList.toggle('active',state.predictionMode);
  btn.textContent=state.predictionMode?'Mode prédiction : Activé':'Mode prédiction : Désactivé';
  rebuildExtraRows();
}

function makePredWidget(key,labelText,unitText,colorClass) {
  const wrap=document.createElement('div'); wrap.className='pred-widget';
  const lbl=document.createElement('span'); lbl.className='pred-widget-label'; lbl.textContent=labelText; wrap.appendChild(lbl);
  const row=document.createElement('div'); row.className='pred-widget-row';
  const btnM=document.createElement('button'); btnM.className='pred-widget-btn'; btnM.textContent='−';
  const inp=document.createElement('input'); inp.type='text'; inp.inputMode='numeric';
  inp.className='pred-widget-input'; inp.id=key; inp.placeholder='?';
  if (state.predictions[key]!==undefined&&state.predictions[key]!==null) inp.value=state.predictions[key];
  const btnP=document.createElement('button'); btnP.className='pred-widget-btn'; btnP.textContent='+';
  const unit=document.createElement('span'); unit.className='pred-widget-unit'; unit.textContent=unitText;
  const readVal=()=>{const v=parseFloat((inp.value||'').replace(',','.')); return isNaN(v)?null:v;};
  const setVal=v=>{state.predictions[key]=v; inp.value=v!==null?v:'';};
  btnM.onclick=()=>{const cur=readVal()??0; setVal(Math.max(0,cur-1));};
  btnP.onclick=()=>{const cur=readVal()??0; setVal(cur+1);};
  inp.addEventListener('change',()=>{const v=parseFloat(inp.value.replace(',','.')); state.predictions[key]=isNaN(v)||v<0?null:v; if(state.predictions[key]===null) inp.value='';});
  row.appendChild(btnM); row.appendChild(inp); row.appendChild(btnP); row.appendChild(unit);
  wrap.appendChild(row); return wrap;
}

function afficherResultatPrediction(qtesRFin,qtesPFin,xmaxFin) {
  if (!state.predictionMode) return;
  const rxn=REACTIONS[state.reactionLimIdx];
  const tfoot=document.getElementById('table-tfoot'); if (!tfoot) return;
  const tr=tfoot.querySelector('tr.pred-row'); if (!tr) return;
  const tdAdv=document.getElementById('pred-adv-cell');
  if (tdAdv) {
    tdAdv.classList.remove('pred-correct','pred-incorrect');
    const predX=state.predictions['pred-xmax'];
    if (predX!==null&&predX!==undefined) { const realX=xmaxFin??state.avancement; tdAdv.classList.add(Math.abs(predX-realX)<0.01?'pred-correct':'pred-incorrect'); }
  }
  for (let i=0;i<N_COLS;i++) {
    const isR=i<N_REACTIFS, idx=isR?i:i-N_REACTIFS, arr=isR?rxn.reactifs:rxn.produits;
    if (idx>=arr.length) continue;
    const key=isR?`pred-r${idx}`:`pred-p${idx}`, realVal=isR?qtesRFin[idx]:qtesPFin[idx];
    const predVal=state.predictions[key];
    const td=tr.children[i+1]; if (!td) continue;
    td.classList.remove('pred-correct','pred-incorrect');
    if (predVal===null||predVal===undefined) continue;
    td.classList.add(Math.abs(predVal-realVal)<0.01?'pred-correct':'pred-incorrect');
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   BOUTONS RÉACTION LIMITANT
══════════════════════════════════════════════════════════════════════════ */
function lockPrediction() {
  const row=document.querySelector('#table-tfoot tr.pred-row'); if (!row) return;
  row.querySelectorAll('.pred-widget-input').forEach(el=>{el.disabled=true; el.style.opacity='0.6';});
  row.querySelectorAll('.pred-widget-btn').forEach(el=>{el.disabled=true; el.style.opacity='0.6';});
}
function unlockPrediction() {
  const row=document.querySelector('#table-tfoot tr.pred-row'); if (!row) return;
  row.querySelectorAll('.pred-widget-input').forEach(el=>{el.disabled=false; el.style.opacity='';});
  row.querySelectorAll('.pred-widget-btn').forEach(el=>{el.disabled=false; el.style.opacity='';});
}
function predictionComplete() {
  if (!state.predictionMode) return true;
  const rxn=REACTIONS[state.reactionLimIdx];
  if (state.predictions['pred-xmax']===null||state.predictions['pred-xmax']===undefined) return false;
  for (let i=0;i<N_COLS;i++) {
    const isR=i<N_REACTIFS, idx=isR?i:i-N_REACTIFS, arr=isR?rxn.reactifs:rxn.produits;
    if (idx>=arr.length) continue;
    const key=isR?`pred-r${idx}`:`pred-p${idx}`;
    if (state.predictions[key]===null||state.predictions[key]===undefined) return false;
  }
  return true;
}

function lancerReactionMax() {
  stopAnimations(); clearStatus();
  if (!predictionComplete()) { setStatus('Renseignez toutes les cases de la ligne Prédiction avant de lancer la réaction.','nok'); return; }
  lockPrediction();
  const rxn=REACTIONS[state.reactionLimIdx];
  const nMax=Math.floor(Math.min(...rxn.reactifs.map((mol,i)=>state.qtesR[i]/mol.coeff)));
  if (nMax===0) {
    if (testState.actif&&testState.mode==='lim') {
      state.xmax=0; updateTableFoot(0,state.qtesR.slice(),state.qtesP.slice(),0);
      afficherResultatPrediction(state.qtesR.slice(),state.qtesP.slice(),0);
      const ok=predictionEstCorrecte(state.qtesR.slice(),state.qtesP.slice(),0);
      if (ok) { testState.score+=1; majBarreProgression(); afficherPopupTest('✓ Bonne prédiction ! (+1 point)','ok',`<button class="btn-test-confirm btn-test-green" onclick="prochainQuestionTest()">Réaction suivante ➜</button>`); }
      else    { afficherPopupTest('✗ Prédiction incorrecte (0 point)','nok',`<button class="btn-test-confirm btn-test-non" onclick="prochainQuestionTest()">Réaction suivante ➜</button>`); }
    } else { setStatus('Aucune réaction possible — vérifiez les quantités.','nok'); }
    return;
  }
  const cache=state.stepCache;
  const qtesR_fin=rxn.reactifs.map((mol,i)=>state.qtesR[i]-mol.coeff*nMax);
  const qtesP_fin=rxn.produits.map((mol,j)=>state.qtesP[j]+mol.coeff*nMax);
  const qtesP_fin_global=cache?rxn.produits.map((mol,j)=>cache.qtesP_initGlobal[j]+mol.coeff*cache.nMaxTotal):qtesP_fin;
  const qtesR_fin_global=cache?rxn.reactifs.map((mol,i)=>cache.qtesRInitGlobal[i]-mol.coeff*cache.nMaxTotal):qtesR_fin;
  const _doLancer=()=>{
    const scalesFixed=cache?cache.scalesFixed:calcScalesFixed(rxn,state.qtesR.slice(),nMax);
    const layoutSrcFixed=computeLayoutLimFixed(state.qtesR.slice(),state.qtesP.slice(),scalesFixed);
    const layoutDstFixed=cache?computeLayoutLimFixed(qtesR_fin_global,qtesP_fin_global,scalesFixed):computeLayoutLimFixed(qtesR_fin,qtesP_fin,scalesFixed);
    if (!layoutSrcFixed||!layoutDstFixed) { requestAnimationFrame(_doLancer); return; }
    const nMaxTotal=cache?cache.nMaxTotal:nMax;
    const anim={rxn,qtesR:state.qtesR.slice(),qtesP:state.qtesP.slice(),nMax,nMaxTotal,step:0,phase:'dissolve',t0:null,passes:[],passeIdx:0,layoutSrcFixed,layoutDstFixed,rafId:null,done:false,isStep:false,
      reactifsOpaques:new Set(rxn.reactifs.flatMap((mol,i)=>Array.from({length:state.qtesR[i]},(_,k)=>`${i}_${k}`))),
      qtesRInit:state.qtesR.slice(),dissolveInitDone:false};
    state.animLim=anim;
    document.getElementById('btn-reagir-max').disabled=true;
    document.getElementById('btn-reagir-step').disabled=true;
    if (testState.actif) document.getElementById('btn-raz-lim').disabled=true;
    anim.rafId=requestAnimationFrame(t=>tickAnimLim(t));
  };
  _doLancer();
}

function lancerReactionStep() {
  stopAnimations(); clearStatus();
  if (!predictionComplete()) { setStatus('Renseignez toutes les cases de la ligne Prédiction avant de lancer la réaction.','nok'); return; }
  lockPrediction();
  const rxn=REACTIONS[state.reactionLimIdx];
  const nMaxTotal=state.stepCache?state.stepCache.nMaxTotal:Math.floor(Math.min(...rxn.reactifs.map((mol,i)=>state.qtesR[i]/mol.coeff)));
  if (nMaxTotal===0) { setStatus('Aucune réaction possible — vérifiez les quantités.','nok'); return; }
  const qtesRInitGlobal=state.stepCache?state.stepCache.qtesRInitGlobal:state.qtesR.slice();
  const qtesR_fin=rxn.reactifs.map((mol,i)=>qtesRInitGlobal[i]-mol.coeff*nMaxTotal);
  const qtesP_initGlobal=state.stepCache?state.stepCache.qtesP_initGlobal:state.qtesP.slice();
  const qtesP_fin=rxn.produits.map((mol,j)=>qtesP_initGlobal[j]+mol.coeff*nMaxTotal);
  const _doLancer=()=>{
    const scalesFixed=state.stepCache?state.stepCache.scalesFixed:calcScalesFixed(rxn,qtesRInitGlobal,nMaxTotal);
    const layoutSrcFixed=computeLayoutLimFixed(qtesRInitGlobal,qtesP_initGlobal,scalesFixed);
    const layoutDstFixed=computeLayoutLimFixed(qtesR_fin,qtesP_fin,scalesFixed);
    if (!layoutSrcFixed||!layoutDstFixed) { requestAnimationFrame(_doLancer); return; }
    if (!state.stepCache) state.stepCache={nMaxTotal,scalesFixed,qtesRInitGlobal,qtesP_initGlobal};
    const anim={rxn,qtesR:state.qtesR.slice(),qtesP:state.qtesP.slice(),nMax:1,nMaxTotal,step:0,phase:'dissolve',t0:null,passes:[],passeIdx:0,layoutSrcFixed,layoutDstFixed,rafId:null,done:false,isStep:true,
      reactifsOpaques:new Set(rxn.reactifs.flatMap((mol,i)=>Array.from({length:state.qtesR[i]},(_,k)=>`${i}_${k}`))),
      qtesRInit:state.qtesR.slice(),dissolveInitDone:false};
    state.animLim=anim;
    document.getElementById('btn-reagir-max').disabled=true;
    document.getElementById('btn-reagir-step').disabled=true;
    anim.rafId=requestAnimationFrame(t=>tickAnimLim(t));
  };
  _doLancer();
}

/* ══════════════════════════════════════════════════════════════════════════
   FINIR ANIMATIONS
══════════════════════════════════════════════════════════════════════════ */
function finirAnimEq() {
  const anim=state.animEq; if (!anim) return;
  anim.done=true; state.animEq=null;
  document.getElementById('btn-tester').disabled=false;
  document.getElementById('btn-raz-eq').disabled=false;
  state.lastFrameEq={
    coeffsR:anim.coeffsR.slice(),
    countsPossible:anim.countsPossible.slice(),
    ghostCounts:anim.ghostSlots&&anim.ghostSlots.some(v=>v>0)?anim.ghostSlots.slice():null,
    doneCount:anim.doneCount.slice(),
    orphans:anim.atoms.filter(a=>!a.assigned),
    canvasW:molCanvas.width,
    canvasH:molCanvas.height,
    hideReactifs:true,
  };
  const coeffsCorrectes=anim.countsPossible.every((c,j)=>c===anim.coeffsP[j]);
  const equilOk=anim.parfait&&coeffsCorrectes;
  if (!testState.actif||testState.mode!=='eq') {
    if (equilOk) {
      setStatus('✓ Réaction équilibrée — tous les atomes sont utilisés !','ok');
    } else {
      const formes=anim.countsPossible.reduce((s,c)=>s+c,0);
      const demandes=anim.coeffsP.reduce((s,c)=>s+c,0);
      const orphelins={};
      anim.atoms.filter(a=>!a.assigned).forEach(a=>{orphelins[a.el]=(orphelins[a.el]||0)+1;});
      let msg=`✗ Réaction non équilibrée`;
      if (!coeffsCorrectes) {
        const details=anim.countsPossible.map((c,j)=>{if(c!==anim.coeffsP[j]) return `${anim.rxn.produits[j].formula} : ${c} formé(s) / ${anim.coeffsP[j]} demandé(s)`;return null;}).filter(Boolean).join(', ');
        msg+=` — coefficients produits incorrects (${details})`;
      } else if (formes<demandes) { msg+=` (${formes}/${demandes} molécules produits formées)`; }
      const exc=Object.entries(orphelins).map(([el,n])=>`${n} ${el}`).join(', ');
      if (exc) msg+=` — atomes restants : ${exc}`;
      setStatus(msg,'nok');
    }
    document.getElementById('eq-progress').textContent='';
    requestAnimationFrame(()=>fixAndRedraw('eq')); return;
  }
  document.getElementById('eq-progress').textContent='';
  requestAnimationFrame(()=>fixAndRedraw('eq'));
  if (equilOk) {
    if (testState.essais>=2) {
      afficherPopupTest('✗ Deux essais épuisés','nok',`<button class="btn-test-confirm btn-test-orange" onclick="voirReponseTest()">Voir la réponse</button><button class="btn-test-confirm btn-test-non" onclick="prochainQuestionTest()">Réaction suivante ➜</button>`);
      return;
    }
    const pts=testState.essais===0?1:0.5;
    testState.score+=pts; majBarreProgression();
    afficherPopupTest(`✓ Bravo ! Réaction équilibrée (${pts===1?'+1 point':'+0,5 point'})`,'ok',`<button class="btn-test-confirm btn-test-green" onclick="prochainQuestionTest()">Réaction suivante ➜</button>`);
  } else {
    testState.essais++;
    if (testState.essais>=2) {
      afficherPopupTest('✗ Deux essais épuisés','nok',`<button class="btn-test-confirm btn-test-orange" onclick="voirReponseTest()">Voir la réponse</button><button class="btn-test-confirm btn-test-non" onclick="prochainQuestionTest()">Réaction suivante ➜</button>`);
    } else {
      setStatus('✗ Pas encore équilibré — dernier essai !','nok');
    }
  }
}

function finirAnimLim() {
  const anim=state.animLim; if (!anim) return;
  state.animLim=null;
  const rxn=anim.rxn;
  state.qtesR=anim.qtesR.slice(); state.qtesP=anim.qtesP.slice();
  if (rxn.reactifs.some((mol,i)=>anim.qtesR[i]<mol.coeff)||anim.qtesR.some(q=>q===0)) state.xmax=state.avancement;
  updateTableFoot(state.avancement,anim.qtesR.slice(),anim.qtesP.slice(),state.xmax);
  state.lastFrameLim={
    layoutSrc:anim.layoutSrcFixed, layoutDst:anim.layoutDstFixed,
    avancement:state.avancement, qtesR:anim.qtesR.slice(), qtesP:anim.qtesP.slice(), xmax:state.xmax,
    reactifsOpaques:new Set(anim.reactifsOpaques),
    qtesRInit:state.stepCache?state.stepCache.qtesRInitGlobal.slice():anim.qtesRInit.slice(),
    rxn,
  };
  const wrap=document.getElementById('canvas-and-table');
  const widthChanged=wrap&&wrap.clientWidth!==molCanvas.width;
  if (widthChanged||state._needRelayoutAfterAnim) {
    state._needRelayoutAfterAnim=false;
    fixCanvasRowHeight('lim'); resizeCanvas(); relayoutLimAfterResize();
  }
  if (!testState.actif) document.getElementById('btn-reagir-max').disabled=false;
  const rxnTerminee=state.xmax!==null&&state.avancement>=state.xmax;
  if (!testState.actif&&!(anim.isStep&&rxnTerminee)) document.getElementById('btn-reagir-step').disabled=false;
  document.getElementById('btn-raz-lim').disabled=false;
  document.getElementById('lim-progress').textContent='';
  if (!testState.actif||testState.mode!=='lim') {
    if (!rxnTerminee&&anim.isStep) return;
    afficherResultatPrediction(anim.qtesR.slice(),anim.qtesP.slice(),state.xmax);
    if (!state.predictionMode) { setStatus('Réaction terminée','ok'); }
    else { const ok=predictionEstCorrecte(anim.qtesR.slice(),anim.qtesP.slice(),state.xmax); if(ok) setStatus('Réaction terminée, prédiction réussie !','ok'); else setStatus('Réaction terminée, prédiction manquée !','nok'); }
    return;
  }
  if (!rxnTerminee&&anim.isStep) return;
  afficherResultatPrediction(anim.qtesR.slice(),anim.qtesP.slice(),state.xmax);
  const ok=predictionEstCorrecte(anim.qtesR.slice(),anim.qtesP.slice(),state.xmax);
  if (ok) { testState.score+=1; majBarreProgression(); afficherPopupTest('✓ Bonne prédiction ! (+1 point)','ok',`<button class="btn-test-confirm btn-test-green" onclick="prochainQuestionTest()">Réaction suivante ➜</button>`); }
  else    { afficherPopupTest('✗ Prédiction incorrecte (0 point)','nok',`<button class="btn-test-confirm btn-test-non" onclick="prochainQuestionTest()">Réaction suivante ➜</button>`); }
}

/* ══════════════════════════════════════════════════════════════════════════
   MODE TEST
══════════════════════════════════════════════════════════════════════════ */
const testState = { actif:false, mode:null, reactions:[], questionIdx:0, score:0, essais:0, repondreVu:false };

function afficherOverlay(html) {
  document.getElementById('test-modal-content').innerHTML=html;
  document.getElementById('test-overlay').classList.add('visible');
}
function fermerOverlay() {
  document.getElementById('test-overlay').classList.remove('visible');
  document.getElementById('test-modal-content').innerHTML='';
}
function afficherPopupTest(msg,cssClass,btnsHtml) {
  const popup=document.getElementById('test-popup');
  document.getElementById('test-popup-msg').textContent=msg;
  document.getElementById('test-popup-msg').className=cssClass;
  document.getElementById('test-popup-btns').innerHTML=btnsHtml;
  popup.classList.add('visible'); updatePopupSpacer();
}
function fermerPopupTest() {
  const popup=document.getElementById('test-popup');
  popup.classList.remove('visible');
  document.getElementById('test-popup-msg').textContent='';
  document.getElementById('test-popup-btns').innerHTML='';
  updatePopupSpacer();
}
function majBarreProgression() {
  const bar=document.getElementById('test-progress-bar');
  if (!testState.actif) { bar.classList.remove('visible'); bar.innerHTML=''; return; }
  const scoreAff=testState.score%1===0?testState.score:testState.score.toFixed(1);
  bar.innerHTML=`<div>Réaction : ${testState.questionIdx+1} / 5</div><div>Score : ${scoreAff} pt${testState.score>1?'s':''}</div>`;
  bar.classList.add('visible');
}

function setTestUI(actif,mode) {
  document.getElementById('tab-equilibrage').disabled=actif;
  document.getElementById('tab-limitant').disabled=actif;
  const selEq=document.getElementById('sel-reaction-eq'), selLim=document.getElementById('sel-reaction-lim');
  if (selEq) selEq.disabled=actif;
  if (selLim) selLim.disabled=actif;
  const btnEq=document.getElementById('btn-test-mode-eq'), btnLim=document.getElementById('btn-test-mode-lim');
  if (actif) {
    if (btnEq) { btnEq.textContent='✕ Sortir du mode test'; btnEq.className='btn btn-quitter-test'; btnEq.onclick=quitterModeTest; }
    if (btnLim) { btnLim.textContent='✕ Sortir du mode test'; btnLim.className='btn btn-quitter-test'; btnLim.onclick=quitterModeTest; }
  } else {
    if (btnEq) { btnEq.textContent='⚙ Mode test'; btnEq.className='btn btn-test-mode'; btnEq.onclick=()=>ouvrirConfirmTest('eq'); }
    if (btnLim) { btnLim.textContent='⚙ Mode test'; btnLim.className='btn btn-test-mode'; btnLim.onclick=()=>ouvrirConfirmTest('lim'); }
  }
  if (mode==='lim') {
    const btnStep=document.getElementById('btn-reagir-step');
    const btnPred=document.getElementById('btn-prediction');
    const btnCmp=document.getElementById('btn-comparaison');
    if (btnStep) btnStep.disabled=actif;
    if (btnPred) btnPred.disabled=actif;
    if (btnCmp)  btnCmp.disabled=actif;
    document.querySelectorAll('.qty-cell-btn, .qty-cell-input').forEach(el=>{ el.disabled=actif; el.style.opacity=actif?'0.5':''; });
  }
}

function ouvrirConfirmTest(mode) {
  if (state.onglet!==(mode==='eq'?'equilibrage':'limitant')) setOnglet(mode==='eq'?'equilibrage':'limitant');
  if (REACTIONS.length<5) { alert('Pas assez de réactions disponibles pour un test (minimum 5).'); return; }
  const msg=mode==='eq'?"Se tester en essayant d'équilibrer 5 réactions ?":"Se tester en essayant de prédire 5 états finaux ?";
  afficherOverlay(`<h2>Mode test</h2><p>${msg}</p><div class="test-modal-btns"><button class="btn-test-confirm btn-test-oui" onclick="lancerTest('${mode}')">Oui</button><button class="btn-test-confirm btn-test-non" onclick="fermerOverlay()">Non</button></div>`);
}

function tirerReactionsTest() {
  const shuffle=arr=>{for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;};
  const d1=shuffle(REACTIONS.map((_,i)=>i).filter(i=>REACTIONS[i].difficulty===1));
  const d2=shuffle(REACTIONS.map((_,i)=>i).filter(i=>REACTIONS[i].difficulty===2));
  const d3=shuffle(REACTIONS.map((_,i)=>i).filter(i=>REACTIONS[i].difficulty===3));
  return [d1[0],d2[0],d2[1],d2[2],d3[0]].filter(i=>i!==undefined);
}

function lancerTest(mode) {
  fermerOverlay();
  const cinq=tirerReactionsTest();
  testState.actif=true; testState.mode=mode; testState.reactions=cinq;
  testState.questionIdx=0; testState.score=0; testState.essais=0; testState.repondreVu=false;
  stopAnimations(); clearSnapshots(); clearStatus(); fermerPopupTest();
  const ongletCible=mode==='eq'?'equilibrage':'limitant';
  state.onglet=ongletCible; _applyOngletUI(ongletCible);
  setTestUI(true,mode); chargerReactionTest();
}

function chargerReactionTest() {
  const idx=testState.reactions[testState.questionIdx];
  testState.essais=0; testState.repondreVu=false;
  fermerPopupTest(); clearStatus(); stopAnimations(); clearSnapshots();
  if (testState.mode==='eq') {
    state.reactionEqIdx=idx;
    initCoeffsUser(); buildEquationUI('eq'); buildThead('eq'); buildTbody('eq');
    document.getElementById('eq-progress').textContent='';
    if (state.showProductsEq) { state.showProductsEq=false; }
    const btnProd=document.getElementById('btn-show-products-eq');
    if (btnProd) btnProd.classList.remove('active');
  } else {
    state.reactionLimIdx=idx;
    const rxn=REACTIONS[idx];
    const idxLimitant=Math.floor(Math.random()*rxn.reactifs.length);
    const xmaxMax=Math.floor(20/Math.max(...rxn.reactifs.map(m=>m.coeff)));
    const xmax=Math.floor(Math.random()*xmaxMax)+1;
    state.qtesLimInit=rxn.reactifs.map((mol,i)=>{
      if (i===idxLimitant) return mol.coeff*xmax;
      const surplusMax=20-mol.coeff*xmax;
      const surplus=surplusMax>0?Math.floor(Math.random()*(surplusMax+1)):0;
      return mol.coeff*xmax+surplus;
    });
    state.qtesR=state.qtesLimInit.slice(); state.qtesP=rxn.produits.map(()=>0);
    state.avancement=0; state.xmax=null; state.predictions={};
    state.predictionMode=true;
    const btnPred=document.getElementById('btn-prediction');
    if (btnPred) { btnPred.classList.add('active'); btnPred.textContent='Mode prédiction : Activé'; }
    state.comparaisonMode=0;
    const btnCmp=document.getElementById('btn-comparaison'), lblCmp=document.getElementById('btn-comparaison-label');
    if (btnCmp) btnCmp.classList.remove('active');
    if (lblCmp) lblCmp.textContent='Désactivée';
    buildEquationUI('lim'); buildThead('lim'); buildTbody('lim');
    document.querySelectorAll('.qty-cell-btn, .qty-cell-input').forEach(el=>{el.disabled=true; el.style.opacity='0.5';});
    document.getElementById('lim-progress').textContent='';
    document.getElementById('btn-reagir-max').disabled=false;
  }
  majBarreProgression();
  requestAnimationFrame(()=>fixAndRedraw(testState.mode));
}

function voirReponseTest() {
  fermerPopupTest();
  const rxn=REACTIONS[testState.reactions[testState.questionIdx]];
  rxn.reactifs.forEach((mol,i)=>{state.coeffsUser[i]=mol.coeff;});
  rxn.produits.forEach((mol,j)=>{state.coeffsUser[rxn.reactifs.length+j]=mol.coeff;});
  state.showProductsEq=true;
  const btnProd=document.getElementById('btn-show-products-eq');
  if (btnProd) btnProd.classList.add('active');
  buildEquationUI('eq'); clearSnapshots(); clearStatus(); redraw();
  afficherPopupTest('Réponse affichée','ok',`<button class="btn-test-confirm btn-test-non" onclick="prochainQuestionTest()">Réaction suivante ➜</button>`);
}

function prochainQuestionTest() {
  fermerPopupTest(); testState.questionIdx++;
  if (testState.questionIdx>=5) { afficherScoreFinal(); return; }
  stopAnimations(); clearSnapshots(); clearStatus();
  if (testState.mode==='eq') { state.showProductsEq=false; const btnProd=document.getElementById('btn-show-products-eq'); if(btnProd) btnProd.classList.remove('active'); }
  chargerReactionTest();
}

function afficherScoreFinal() {
  const score=testState.score, scoreAff=score%1===0?score:score.toFixed(1);
  let message='';
  if      (score>=5)   message='Parfait ! Maîtrise totale.';
  else if (score>=4)   message='Très bien ! Tu maîtrises le sujet.';
  else if (score>=3)   message='Bien. Quelques points à retravailler.';
  else if (score>=1.5) message='Passable. Il faut revoir ce thème.';
  else                 message='Insuffisant. Reprends le cours !';
  const modeLabel=testState.mode==='eq'?'Équilibrage':'Réactif limitant';
  afficherOverlay(`<h2>Résultat du test — ${modeLabel}</h2><div id="test-score-display">${scoreAff} / 5</div><p>${message}</p><div class="test-modal-btns"><button class="btn-test-confirm btn-test-oui" onclick="relancerTest()">Réessayer</button><button class="btn-test-confirm btn-test-non" onclick="quitterModeTest()">Sortir</button></div>`);
}

function relancerTest() {
  fermerOverlay();
  const mode=testState.mode;
  testState.reactions=tirerReactionsTest(); testState.questionIdx=0;
  testState.score=0; testState.essais=0; testState.repondreVu=false;
  stopAnimations(); clearSnapshots(); clearStatus(); fermerPopupTest();
  if (mode==='eq'&&state.showProductsEq) { state.showProductsEq=false; const btnProd=document.getElementById('btn-show-products-eq'); if(btnProd) btnProd.classList.remove('active'); }
  chargerReactionTest();
}

function quitterModeTest() {
  fermerOverlay(); fermerPopupTest(); stopAnimations(); clearSnapshots(); clearStatus();
  const modeQuitte=testState.mode;
  testState.actif=false; testState.mode=null; testState.reactions=[];
  testState.questionIdx=0; testState.score=0; testState.essais=0;
  document.getElementById('test-progress-bar').classList.remove('visible');
  setTestUI(false,modeQuitte);
  if (modeQuitte==='eq') {
    state.showProductsEq=false;
    const btnProd=document.getElementById('btn-show-products-eq');
    if (btnProd) { btnProd.classList.remove('active'); btnProd.disabled=false; }
    initCoeffsUser(); buildEquationUI('eq'); buildThead('eq'); buildTbody('eq');
  } else {
    state.predictionMode=false; state.comparaisonMode=0;
    const btnPred=document.getElementById('btn-prediction'), lblCmp=document.getElementById('btn-comparaison-label');
    if (btnPred) { btnPred.classList.remove('active'); btnPred.textContent='Mode prédiction : Désactivé'; btnPred.disabled=false; }
    const btnCmp=document.getElementById('btn-comparaison');
    if (btnCmp)  { btnCmp.classList.remove('active'); btnCmp.disabled=false; }
    if (lblCmp)  lblCmp.textContent='Désactivée';
    document.getElementById('btn-reagir-step').disabled=false;
    initQtesLim(); buildEquationUI('lim'); buildThead('lim'); buildTbody('lim');
  }
  requestAnimationFrame(()=>fixAndRedraw(modeQuitte));
}

/* ══════════════════════════════════════════════════════════════════════════
   INITIALISATION
══════════════════════════════════════════════════════════════════════════ */
function init() {
  const sortedIndices=Array.from({length:REACTIONS.length},(_,i)=>i)
    .sort((a,b)=>REACTIONS[a].difficulty-REACTIONS[b].difficulty);
  sortedIndices.forEach(i=>{
    const rxn=REACTIONS[i];
    const labelEq=rxn.reactifs.map(r=>r.formula).join(' + ')+' → '+rxn.produits.map(p=>p.formula).join(' + ');
    ['sel-reaction-eq','sel-reaction-lim'].forEach(id=>{
      const opt=document.createElement('option'); opt.value=i;
      opt.textContent=id==='sel-reaction-eq'?labelEq:rxn.label;
      document.getElementById(id).appendChild(opt);
    });
  });
  resizeCanvas();
  initCoeffsUser(); initQtesLim();
  buildEquationUI('eq'); buildThead('eq'); buildTbody('eq');
  const slider=document.getElementById('speed-slider');
  if (slider) { slider.addEventListener('input',updateSpeedLabels); updateSpeedLabels(); }
  const sliderEq=document.getElementById('speed-slider-eq');
  if (sliderEq) { sliderEq.addEventListener('input',updateSpeedLabelsEq); updateSpeedLabelsEq(); }
  requestAnimationFrame(()=>fixAndRedraw('eq'));

  // ── Deep link depuis la page d'accueil (?tab=equilibrage|limitant) ─────
  const _tab = new URLSearchParams(location.search).get('tab');
  if (_tab === 'limitant' || _tab === 'equilibrage') setOnglet(_tab);
}
init();
