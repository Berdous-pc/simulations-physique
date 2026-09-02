// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  ui.js — Boucle d'animation et contrôles UI
//  Chargé en DERNIER. Orchestre la simulation.
//  Dépend de : sim.js, tube.js, graph.js
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ── Tab actif : 'son' | 'corde' | 'vagues' ───────────────────────────
// Utilisé par tube.js et graph.js pour brancher sur la bonne simulation.
var activeTab = 'son';

// ── Compteurs de temps pour l'enregistrement ─────────────────────────
var lastSrcUpdateSon = 0;          // Son   — échantillonnage de la membrane
var _srcTickSon      = 0;          // Son   — 1 enregistrement ΔP(t) sur 2
var lastSrcUpdate    = 0;          // Corde — échantillonnage de la source
var _srcTickCorde    = 0;          // Corde — 1 enregistrement y(t) sur 2
var lastYtUpdateV    = 0;          // Vagues

// ── Paliers de vitesse ────────────────────────────────────────────────
var SPEED_STEPS = [0.10, 0.25, 0.50, 1.00];

// ══════════════════════════════════════════════════════════════════════
//  Boucle d'animation principale
// ══════════════════════════════════════════════════════════════════════

function loop(ts) {
    requestAnimationFrame(loop);

    var dtReal = (ts - (loop.lastTs || ts)) / 1000;
    loop.lastTs = ts;
    dtReal = Math.min(dtReal, 0.05);

    if (activeTab === 'son') {
        // ── Avancement temps Son ──────────────────────────────────────
        if (!sim.paused) {
            var dtSim = dtReal * (sim.speedFactor !== undefined ? sim.speedFactor : 1.0);
            sim.simTime += dtSim;

            // Le comptage en périodes est cumulé pas à pas (comme la phase de
            // la source), et non recalculé en t x f : sinon changer la
            // fréquence — donc la longueur d'onde — en cours de route
            // requalifierait rétroactivement tout le temps déjà écoulé.
            chronoTick('son', dtSim);

            pruneImpulses();

            if (sim.impulsePropagating && sim.impulses.length === 0) {
                sim.impulsePropagating = false;
                sim.sourceMode         = null;
                _syncSourceButtons();
                _syncWavePropsBtnState();
            }

            // Échantillonnage de la membrane à pas fixe : c'est lui qui
            // « grave » l'onde émise. L'enregistrement ΔP(t) des balises se
            // fait un pas sur deux (600 Hz → 300 Hz), en phase avec les
            // échantillons pour que les deux lectures soient cohérentes.
            while (sim.simTime - lastSrcUpdateSon >= SRC_DT) {
                lastSrcUpdateSon += SRC_DT;
                stepSourceSon(lastSrcUpdateSon);
                _srcTickSon = 1 - _srcTickSon;
                if (_srcTickSon === 0) updateDptData(lastSrcUpdateSon);
            }
        }

        // Inutile de reconstruire la courbe ΔP(x) quand seul ΔP(t) est
        // affiché (updateDpxData se court-circuite par ailleurs tant que
        // rien n'a changé, ex. en pause).
        // Hors du bloc « non en pause » : déplacer une balise doit faire
        // glisser la trace temporelle même simulation figée.
        rebuildDptData();

        if (sim.graphMode !== 'dpt') updateDpxData();
        drawTube();
        drawGraph();

        if (!sim.paused) {
            _updateCReadout();
            _updateWaveProps();
            _updateChrono('son');
        }

    } else if (activeTab === 'corde') {
        // ── Avancement temps Corde ────────────────────────────────────
        if (!simCorde.paused) {
            var dtSimC = dtReal * (simCorde.speedFactor !== undefined ? simCorde.speedFactor : 1.0);
            simCorde.simTime += dtSimC;

            // Voir le commentaire côté Son : les périodes sont cumulées au fil
            // de l'eau pour rester justes si la fréquence change.
            chronoTick('corde', dtSimC);

            pruneImpulsesCorde();

            if (simCorde.impulsePropagating && simCorde.impulses.length === 0) {
                simCorde.impulsePropagating = false;
                simCorde.sourceMode         = null;
                _syncWavePropsBtnStateCorde();
                _syncLambdaBtnStateCorde();
            }

            // Le bouton Activer/Désactiver dépend de simTime (source encore
            // en mouvement ou non) : on le réévalue à chaque frame plutôt
            // qu'aux seuls changements d'état ci-dessus.
            _syncSourceButtonsCorde();

            // Mode Libre, étape 1/2 — reconstituer la cible : les
            // pointermove n'arrivent qu'à ~60 Hz (souvent moins en
            // trackpad), donc réutiliser directement la dernière position
            // reçue la ferait rester plate jusqu'au prochain événement, puis
            // sauter. On interpole plutôt entre les deux derniers échantillons
            // bruts de la souris (freeRawT0/Y0 → freeRawT1/Y1, horodatés en
            // temps réel, cf. onMove dans tube.js) à l'instant présent, ce qui
            // reconstitue un mouvement continu même entre deux événements.
            // Au-delà du dernier échantillon (frame dessinée avant le
            // prochain pointermove), on maintient la dernière valeur connue.
            if (simCorde.freeDragging) {
                var nowFree = performance.now();
                var ft0 = simCorde.freeRawT0, ft1 = simCorde.freeRawT1;
                if (ft1 > ft0 && nowFree < ft1) {
                    var frac = (nowFree - ft0) / (ft1 - ft0);
                    simCorde.freeTargetY = simCorde.freeRawY0 +
                        (simCorde.freeRawY1 - simCorde.freeRawY0) * frac;
                } else {
                    simCorde.freeTargetY = simCorde.freeRawY1;
                }
            }

            // Mode Libre, étape 2/2 — rapprocher freeY de cette cible par un
            // FILTRE PASSE-BAS (lissage exponentiel), un peu à chaque pas
            // SRC_DT, plutôt que de répartir le déplacement de la souris sur
            // les seuls pas de LA frame en cours. L'ancienne version calculait
            // l'incrément par pas en divisant par le nombre de pas *déjà*
            // écoulés depuis le dernier passage dans la boucle ; au ralenti
            // (curseur de vitesse < 1), une frame réelle avance moins vite
            // qu'un pas SRC_DT, donc ce nombre de pas valait 0 pendant
            // plusieurs frames d'affilée — la position de la souris
            // s'accumulait sans être gravée — puis, dès qu'un pas SRC_DT
            // devenait enfin disponible, tout le déplacement accumulé était
            // recopié d'un coup dans un SEUL échantillon. Une rampe à vitesse
            // bornée réglait déjà ce saut brutal, mais laissait un coude net
            // au moment du rattrapage (la pente passe abruptement de la
            // vitesse max à 0) ; le filtre exponentiel a une courbure continue
            // partout, sans ce coude, pour le même coût par pas.
            var FREE_TAU = 0.02;   // s — constante de temps du lissage
            var freeSmoothK = 1 - Math.exp(-SRC_DT / FREE_TAU);

            // Échantillonnage de la source à pas fixe : c'est lui qui
            // « grave » l'onde émise. L'enregistrement y(t) des balises se
            // fait un pas sur deux (600 Hz → 300 Hz), en phase avec les
            // échantillons pour que les deux lectures soient cohérentes.
            while (simCorde.simTime - lastSrcUpdate >= SRC_DT) {
                lastSrcUpdate += SRC_DT;
                if (simCorde.freeActive) {
                    simCorde.freeY += (simCorde.freeTargetY - simCorde.freeY) * freeSmoothK;
                }
                stepSourceCorde(lastSrcUpdate);
                _srcTickCorde = 1 - _srcTickCorde;
                if (_srcTickCorde === 0) updateYtData(lastSrcUpdate);
            }
        }

        // Inutile de reconstruire la courbe y(x) quand seul y(t) est affiché
        // (updateYxData se court-circuite par ailleurs tant que rien n'a
        // changé, ex. en pause — cf. commentaire équivalent pour Vagues).
        rebuildYtDataCorde();   // cf. rebuildDptData côté Son

        if (simCorde.graphMode !== 'dpt') updateYxData();
        drawCorde();
        drawGraph();

        if (!simCorde.paused) {
            _updateCReadoutCorde();
            _updateWavePropsCorde();
            _updateChrono('corde');
        }
    } else {
        // ── Avancement temps Vagues ───────────────────────────────────
        if (!simVagues.paused) {
            var dtSimV = dtReal * (simVagues.speedFactor || 1.0);
            simVagues.simTime += dtSimV;
            chronoTick('vagues', dtSimV);
            addSourceSampleVagues(simVagues.simTime);

            while (simVagues.simTime - lastYtUpdateV >= VAGUES_YT_SAMPLE_DT) {
                lastYtUpdateV += VAGUES_YT_SAMPLE_DT;
                updateYtDataVagues(lastYtUpdateV);
            }
        }

        // Inutile de reconstruire la courbe y(x) quand seul le graphe y(t) est
        // affiché : elle n'est alors jamais dessinée. (updateYxDataVagues se
        // court-circuite par ailleurs tant que rien n'a changé, ex. en pause.)
        rebuildYtDataVagues();   // cf. rebuildDptData côté Son

        if (simVagues.graphMode !== 'dpt') updateYxDataVagues();
        drawVagues();
        drawGraph();

        if (!simVagues.paused) {
            _updateCReadoutVagues();
            _updateWavePropsVagues();
            _updateChrono('vagues');
        }
    }
}

// ══════════════════════════════════════════════════════════════════════
//  ─────────────── TAB SON ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

// ── Afficheur c (Son) ─────────────────────────────────────────────────
function _updateCReadout() {
    var el = document.getElementById('ro-c');
    if (el) el.innerHTML = fmtSciHTML(sim.c_cms, 2);
}

// ── Utilitaires source Son ────────────────────────────────────────────
//  Arrête l'ÉMISSION sans toucher à ce qui est déjà parti : la liste des
//  impulsions est conservée (une impulsion encore en cours d'émission doit
//  aller à son terme, et l'historique de la source est de toute façon figé).
function _stopEmissionSon() {
    sim.sinusoidalActive = false;
    sim.sourceMode       = null;
    _syncSourceButtons();
    _syncWavePropsBtnState();
    _syncLambdaBtnStateSon();
}

//  Horloge du graphe ΔP(t) : reste en attente (dptTimeOrigin = null, cf.
//  resetAnim) tant qu'aucune source n'a été activée depuis le dernier
//  changement de mode (sélecteur Son) ou RAZ. La 1ère activation dans un
//  mode donné démarre l'horloge (origine = simTime courant) ; les suivantes
//  dans le MÊME mode ne la relancent pas — la courbe continue de s'accumuler
//  sur le même axe (plusieurs impulsions superposées, ou arrêt/reprise du
//  mode continu). Un changement de mode force une nouvelle 1ère activation
//  (cf. onSourceModeChangeSon, qui remet dptArmedMode à null).
function _armDptWindowSon(mode) {
    if (sim.dptArmedMode === mode) return;   // déjà démarrée pour ce mode
    sim.dptTimeOrigin = sim.simTime;
    sim.dptArmedMode  = mode;
    _dptClear(1);
    _dptClear(2);
}

//  Le bouton reflète l'état DE LA SOURCE elle-même (la membrane), pas celui
//  de l'onde dans le tube : en impulsion, il s'éteint dès que la membrane a
//  fini son mouvement (sourceActiveUntil), bien avant que l'impulsion n'ait
//  fini de traverser le tube.
function _syncSourceButtons() {
    var btn = document.getElementById('btn-source-active-son');
    if (!btn) return;
    var active = (sim.sourceMode === 'impulse' && sim.simTime < sim.sourceActiveUntil) ||
                 (sim.sourceMode === 'sinus'   && sim.sinusoidalActive);
    btn.classList.toggle('active', active);
}

//  Applique le mode choisi dans le sélecteur : resynchronise le chrono lié
//  et le verrouillage du bouton T, qui dépendent tous deux du mode courant
//  même avant toute activation de la source.
function _applySourceModeSon() {
    var sel  = document.getElementById('sel-mode-son');
    var mode = sel ? sel.value : 'impulse';

    // Impulsion n'a pas de fréquence définie (cf. _syncLambdaBtnStateSon) :
    // le curseur f est verrouillé dès le choix du mode, avant même toute
    // activation de la source.
    var isImpulse = (mode === 'impulse');
    var rowF = document.getElementById('freq-row');
    var slF  = document.getElementById('sl-freq');
    if (rowF) rowF.classList.toggle('disabled', isImpulse);
    if (slF)  slF.disabled = isImpulse;

    _syncSourceButtons();
    _syncWavePropsBtnState();
    _syncLambdaBtnStateSon();
    _syncChronoLink('son', mode);
    _syncChronoUnits('son');
    _updateChrono('son');
}

//  Bouton unique Activer/Désactiver : son effet dépend du mode choisi dans
//  le sélecteur. En Impulsion, chaque appui relance une impulsion et le
//  bouton se rallume tout seul le temps qu'elle traverse le tube. En
//  Sinusoïdale, il bascule l'émission continue on/off.
function toggleSourceActiveSon() {
    var sel  = document.getElementById('sel-mode-son');
    var mode = sel ? sel.value : 'impulse';

    var wasOn = sim.sinusoidalActive;

    if (mode === 'impulse')      sendImpulse();
    else                         toggleSinusoidalSon();

    // Chronomètre lié (case « Lier ») : activer la source le lance s'il est
    // à l'arrêt, sans toucher à la valeur affichée. Désactiver la source ne
    // l'arrête pas non plus : l'onde déjà émise reste chronométrable.
    var isOn = sim.sinusoidalActive;
    if (mode === 'impulse' || (!wasOn && isOn)) _startChronoIfLinked('son');
}

//  Changement de mode dans le sélecteur : coupe systématiquement l'émission
//  en cours, quel que soit le mode visé — il faut rappuyer sur Activer pour
//  repartir dans le nouveau mode.
function onSourceModeChangeSon() {
    var wasContinuous = sim.sinusoidalActive;

    // Changer de type de source remet le graphe ΔP(t) à 0 et en attente :
    // il ne repartira qu'à la prochaine 1ère activation dans le nouveau mode.
    sim.dptTimeOrigin = null;
    sim.dptArmedMode  = null;
    _dptClear(1);
    _dptClear(2);

    // Le chronomètre suit la même règle que le graphe ci-dessus : il
    // mesure une émission, et changer de mode y met fin. Le laisser
    // courir afficherait une durée sans rapport avec ce que montrent
    // désormais les graphes.
    resetChrono('son');

    if (wasContinuous) _stopEmissionSon();

    _applySourceModeSon();
}

//  Chaque appui envoie une NOUVELLE impulsion : celles qui sont déjà dans le
//  tube poursuivent leur route et se superposent, au lieu d'être effacées.
function sendImpulse() {
    if (sim.paused) _setPaused(false);
    _armDptWindowSon('impulse');

    sim.sinusoidalActive   = false;   // tous les modes restent exclusifs
    sim.impulses.push({ startTime: sim.simTime });
    sim.impulsePropagating = true;
    sim.sourceMode         = 'impulse';
    sim.sourceActiveUntil  = Math.max(sim.sourceActiveUntil, sim.simTime + T_IMPULSE);

    _syncSourceButtons();
    _syncWavePropsBtnState();
    _syncLambdaBtnStateSon();
}

function toggleSinusoidalSon() {
    if (sim.sinusoidalActive) {
        _stopEmissionSon();
    } else {
        if (sim.paused) _setPaused(false);
        _armDptWindowSon('sinus');

        sim.sinusoidalActive = true;
        // Démarrage à u = 0, sans saut. Sauf si l'on rallume alors que
        // l'enveloppe d'arrêt n'a pas fini de descendre : la source émet
        // encore, remettre la phase à zéro y créerait justement le saut que
        // l'enveloppe est censée éviter — on laisse alors la phase courir et
        // l'enveloppe remonter (cf. stepSourceSon).
        if (sim.sonEmitMode !== 'sinus') sim.sinPhase = 0;
        sim.sourceMode       = 'sinus';

        _syncSourceButtons();
        _syncWavePropsBtnState();
        _syncLambdaBtnStateSon();
    }
}

// ── Pause / Reset Son ─────────────────────────────────────────────────
function _setPaused(paused) {
    sim.paused = paused;
    var btn = document.getElementById('btn-playpause');
    if (!btn) return;
    if (paused) { btn.textContent = '▶ Reprendre'; btn.className = 'btn btn-play'; }
    else        { btn.textContent = '⏸ Pause';     btn.className = 'btn btn-pause'; }
}

function togglePause() { _setPaused(!sim.paused); }

function resetSimAnim() {
    resetAnim();
    lastSrcUpdateSon = 0;
    _srcTickSon      = 0;
    // Le chronomètre mesure le temps de simulation : remettre celle-ci à
    // zéro sans l'arrêter laisserait une durée qui ne correspond plus à rien.
    resetChrono('son');
    // resetAnim remet sourceMode à null : on réapplique la sélection du
    // menu déroulant, qui elle n'est pas remise à zéro.
    _applySourceModeSon();
    var btn = document.getElementById('btn-playpause');
    if (btn) { btn.textContent = '⏸ Pause'; btn.className = 'btn btn-pause'; }
    sim.pressureColorMode = false;
    var btnPc = document.getElementById('btn-pressure-color');
    if (btnPc) btnPc.classList.remove('active');

    // La sélection est un mode d'inspection, au même titre que le coloriage
    // et le réticule : la remise à zéro la relâche. Elle ne disparaît plus
    // d'elle-même, initCols() ne reconstruisant plus les particules à tout
    // propos (cf. la garde dans sim.js).
    sim.selectionMode = false;
    clearSelection();
    var btnSel = document.getElementById('btn-select');
    if (btnSel) { btnSel.disabled = false; btnSel.classList.remove('active'); }

    // Le réticule est un mode d'inspection : la remise à zéro le relâche aussi.
    sim.graphCursorMode = false;
    var btnCur = document.getElementById('btn-graph-cursor');
    if (btnCur) btnCur.classList.remove('active');
    var tip = document.getElementById('graph-hover-tooltip');
    if (tip) tip.style.display = 'none';
}

// ── Sliders Son ───────────────────────────────────────────────────────
//  Les readouts sont rafraîchis ICI et pas seulement dans la boucle : celle-ci
//  ne les met à jour que si l'animation tourne, si bien qu'en pause les valeurs
//  de T et λ restaient figées sur les anciens réglages.
function onSliderFreq(v) {
    sim.freq = parseFloat(v);
    var lbl = document.getElementById('lbl-freq');
    if (lbl) lbl.textContent = sim.freq.toFixed(1).replace('.', ',');
    initCols();
    _updateWaveProps();
    _updateChrono('son');   // l'affichage en T dépend de f
}

function onSliderRho(v) {
    sim.rho = parseFloat(v);
    var lbl = document.getElementById('lbl-rho');
    if (lbl) lbl.textContent = sim.rho.toFixed(1).replace('.', ',');
    updateCelerite();
    _updateCReadout();
    initCols();
    _updateWaveProps();
}

function onSliderK(v) {
    sim.K = parseFloat(v);
    var lbl = document.getElementById('lbl-K');
    if (lbl) lbl.textContent = sim.K.toFixed(1).replace('.', ',');
    updateCelerite();
    _updateCReadout();
    initCols();
    _updateWaveProps();
}

function onSliderAtten(v) {
    sim.attenuation = parseFloat(v);
    var lbl = document.getElementById('lbl-atten');
    if (lbl) lbl.textContent = sim.attenuation.toFixed(2).replace('.', ',');
}

function onSliderSpeed(v) {
    var idx = parseInt(v, 10);
    sim.speedFactor = SPEED_STEPS[idx];
    var lbl = document.getElementById('lbl-speed');
    if (lbl) lbl.textContent = sim.speedFactor.toFixed(2).replace('.', ',');
}

// ── Propriétés de l'onde Son ──────────────────────────────────────────
function toggleWaveProps() {
    sim.wavePropsVisible = !sim.wavePropsVisible;
    _applyWavePropsState();
}

function _applyWavePropsState() {
    var btn      = document.getElementById('btn-wave-props');
    var simple   = document.getElementById('readout-simple');
    var extended = document.getElementById('readout-props');
    if (sim.wavePropsVisible) {
        if (btn)      btn.classList.add('active');
        if (simple)   simple.style.display = 'none';
        if (extended) extended.style.display = '';
        _updateWaveProps();
    } else {
        if (btn)      btn.classList.remove('active');
        if (simple)   simple.style.display = '';
        if (extended) extended.style.display = 'none';
    }
}

function _updateWaveProps() {
    if (!sim.wavePropsVisible) return;
    var elC = document.getElementById('ro-c-ext');
    if (elC) elC.innerHTML = fmtSciHTML(sim.c_cms, 2);
    var f   = sim.freq;
    var T   = (f > 0) ? 1 / f : 0;
    var elF = document.getElementById('ro-f');
    var elT = document.getElementById('ro-T');
    if (elF) elF.textContent = f.toFixed(2).replace('.', ',');
    if (elT) elT.textContent = T.toFixed(3).replace('.', ',');
    var lambda = sim.c_cms * T;
    var elL    = document.getElementById('ro-lambda');
    if (elL) elL.innerHTML = fmtSciHTML(lambda, 2);
}

//  Impulsion n'a pas de fréquence définie : le comptage en T, l'affichage de
//  λ et le curseur f n'y ont aucun sens. On se base sur le SÉLECTEUR de mode,
//  pas sur sourceMode (qui ne reflète que l'émission en cours) : le
//  verrouillage doit s'appliquer dès que le mode est choisi, même avant toute
//  activation de la source. Jumeau de _cordeModeIsImpulseOrFree.
function _sonModeIsImpulse() {
    var sel = document.getElementById('sel-mode-son');
    return !sel || sel.value === 'impulse';
}

function _syncWavePropsBtnState() {
    var btn = document.getElementById('btn-wave-props');
    if (!btn) return;
    var isImpulse = _sonModeIsImpulse();
    btn.disabled = isImpulse;
    if (isImpulse && sim.wavePropsVisible) {
        sim.wavePropsVisible = false;
        _applyWavePropsState();
    }
}

// ── Boutons au-dessus du tube — Son ───────────────────────────────────
function toggleSelect() {
    if (sim.pressureColorMode) return;
    sim.selectionMode = !sim.selectionMode;
    var btn = document.getElementById('btn-select');
    if (btn) btn.classList.toggle('active', sim.selectionMode);
    if (!sim.selectionMode) clearSelection();
}

function togglePressureColor() {
    sim.pressureColorMode = !sim.pressureColorMode;
    var btn       = document.getElementById('btn-pressure-color');
    var btnSelect = document.getElementById('btn-select');
    if (btn) btn.classList.toggle('active', sim.pressureColorMode);
    if (sim.pressureColorMode) {
        sim.selectionMode = false;
        if (btnSelect) { btnSelect.disabled = true; btnSelect.classList.remove('active'); }
        clearSelection();
    } else {
        if (btnSelect) btnSelect.disabled = false;
    }
}

// ── Bouton "Afficher graphe" (Son) ──────────────────────────────────
// Masque entièrement #graph-area (+ le splitter) pour que la zone
// d'animation occupe tout l'espace disponible. Même mécanique que côté
// Corde (cf. toggleShowGraphCorde) : désactivé par défaut.
function toggleShowGraphSon() {
    sim.graphVisible = !sim.graphVisible;
    if (sim.graphVisible) _resetSplitFracToDefault();
    _applyShowGraphSon();
}

function _applyShowGraphSon() {
    var btn = document.getElementById('btn-show-graph-son');
    if (btn) btn.classList.toggle('active', sim.graphVisible);

    var leftCol = document.getElementById('left-col');
    if (leftCol) leftCol.classList.toggle('graph-hidden', activeTab === 'son' && !sim.graphVisible);

    // La classe de pré-masquage posée dans <head> (cf. script inline, pour
    // l'onglet chargé directement au premier paint) ne doit pas survivre au
    // premier calcul de l'état réel — cf. commentaire équivalent côté Corde.
    document.documentElement.classList.remove('init-graph-hidden');

    // Rétablit la répartition réglée par l'utilisateur, ou la retire quand
    // le graphe est masqué.
    applySplitFrac(splitFrac);

    scheduleResizeTube();
    resizeGraph();
}

//  Impulsion n'a pas de fréquence définie : λ = c·T n'aurait aucun sens. On
//  se base sur le SÉLECTEUR de mode (cf. _sonModeIsImpulse), pas sur
//  sourceMode : le verrouillage doit s'appliquer dès que le mode est
//  choisi, même avant toute activation de la source.

// ── Bouton "Afficher la longueur d'onde" (Son) ───────────────────────
function toggleLambdaSon() {
    var btn = document.getElementById('btn-lambda-son');
    if (btn && btn.disabled) return;
    sim.lambdaVisible = !sim.lambdaVisible;
    _applyLambdaSon();
}

function _applyLambdaSon() {
    var btn = document.getElementById('btn-lambda-son');
    if (btn) btn.classList.toggle('active', sim.lambdaVisible);
}

function _syncLambdaBtnStateSon() {
    var btn = document.getElementById('btn-lambda-son');
    if (!btn) return;
    var isImpulse = _sonModeIsImpulse();
    btn.disabled = isImpulse;
    if (isImpulse && sim.lambdaVisible) {
        sim.lambdaVisible = false;
        _applyLambdaSon();
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Chronomètre — module commun à tous les onglets
// ══════════════════════════════════════════════════════════════════════
//  Il compte le temps de SIMULATION et non le temps réel : il se fige donc
//  avec la pause et suit le facteur de vitesse, sans quoi les durées lues
//  ne correspondraient pas à celles des graphes.
//
//  Deux unités : la seconde, ou la période T de la source. Le comptage en T
//  n'a de sens que pour un signal périodique — le bouton reste donc désactivé
//  dans les modes sans période (Impulsion partout, plus Libre côté Corde). La
//  conversion utilise la fréquence COURANTE : changer f en cours de
//  chronométrage réinterprète l'ensemble de la durée écoulée.
//
//  UN SEUL jeu de fonctions pour tous les onglets. Chaque onglet apporte
//  seulement ce qui le distingue (CHRONO_DEFS ci-dessous) ; le reste — la
//  marche, la remise à zéro, la bascule d'unité, l'affichage — est écrit une
//  fois. Le gabarit HTML est lui aussi commun, au suffixe d'id près : tous
//  les éléments d'un onglet s'appellent « <base>-<tab> » (cf. index.html).

//  Ce qui change d'un onglet à l'autre, et rien d'autre :
//   — sim         : l'objet d'état d'où sortent freq (conversion en T) ;
//   — noPeriod    : le mode courant a-t-il une période définie ? Se base sur
//                   le SÉLECTEUR de mode et non sur l'état d'émission, pour
//                   que le verrouillage s'applique dès le choix du mode ;
//   — linkDefault : la case « Lier » est-elle cochée par défaut pour ce mode ?
//                   Liée pour les émissions continues, où le chrono compte des
//                   périodes depuis le début de l'émission ; déliée sinon, le
//                   déclenchement se faisant plutôt à la main au passage
//                   devant un repère.
var CHRONO_DEFS = {
    son: {
        sim         : function() { return sim; },
        noPeriod    : function() { return _sonModeIsImpulse(); },
        linkDefault : function(mode) { return mode === 'sinus'; }
    },
    corde: {
        sim         : function() { return simCorde; },
        noPeriod    : function() { return _cordeModeIsImpulseOrFree(); },
        linkDefault : function(mode) { return mode === 'sinus' || mode === 'periodic'; }
    },
    vagues: {
        sim         : function() { return simVagues; },
        //  La source Vagues est sinusoïdale et toujours en marche : le
        //  comptage en T a donc toujours un sens. Cela changera avec le
        //  mode Impulsion, qui apportera aussi la case « Lier » et le
        //  linkDefault correspondant.
        noPeriod    : function() { return false; },
        linkDefault : function()  { return false; }
    }
};

//  État par onglet. `lastTxt` mémorise le dernier texte écrit dans
//  l'afficheur : _updateChrono est appelée à chaque frame, l'écriture DOM ne
//  doit avoir lieu que si la valeur a changé.
var chronos = {
    son   : { running: false, elapsed: 0, periods: 0, unit: 's', lastTxt: '' },
    corde : { running: false, elapsed: 0, periods: 0, unit: 's', lastTxt: '' },
    vagues: { running: false, elapsed: 0, periods: 0, unit: 's', lastTxt: '' }
};

//  Icônes marche/arrêt dessinées en SVG plutôt qu'avec les caractères ▶ et
//  ⏸ : ces glyphes sont rendus par la police emoji, dont les métriques
//  décalent visiblement le symbole dans le bouton.
var CHRONO_ICO_PLAY  = '<svg class="chrono-ico" viewBox="0 0 12 12" aria-hidden="true">' +
                       '<polygon points="3.5,2 10,6 3.5,10"/></svg>';
var CHRONO_ICO_PAUSE = '<svg class="chrono-ico" viewBox="0 0 12 12" aria-hidden="true">' +
                       '<rect x="3" y="2" width="2.5" height="8"/>' +
                       '<rect x="6.5" y="2" width="2.5" height="8"/></svg>';

function _chronoEl(base, tab) { return document.getElementById(base + '-' + tab); }

//  Avance du chronomètre, appelée par la boucle avec le pas de temps de
//  SIMULATION de l'onglet. Les périodes sont cumulées pas à pas plutôt que
//  recalculées en fin de course : le compte reste juste même si la fréquence
//  a changé pendant le chronométrage.
function chronoTick(tab, dtSim) {
    var c = chronos[tab];
    if (!c || !c.running) return;
    c.elapsed += dtSim;
    c.periods += dtSim * CHRONO_DEFS[tab].sim().freq;
}

function toggleChrono(tab) {
    chronos[tab].running = !chronos[tab].running;
    _syncChronoBtn(tab);
}

//  Remise à zéro : arrête aussi le comptage, pour repartir d'un chronomètre
//  à l'arrêt sur 0 plutôt que de le voir redémarrer aussitôt. C'est aussi ce
//  qu'appelle la remise à zéro générale de l'onglet.
function resetChrono(tab) {
    var c = chronos[tab];
    c.elapsed = 0;
    c.periods = 0;
    c.running = false;
    _syncChronoBtn(tab);
    _updateChrono(tab);
}

function setChronoUnit(tab, unit) {
    var btn = _chronoEl('btn-chrono-unit-' + unit, tab);
    if (btn && btn.disabled) return;
    chronos[tab].unit = (unit === 'T') ? 'T' : 's';
    _syncChronoUnits(tab);
    _updateChrono(tab);
}

//  Case « Lier » : quand elle est cochée, activer la source déclenche le
//  chronomètre. Elle est recochée/décochée à chaque changement de mode (cf.
//  _syncChronoLink), l'utilisateur restant libre de la modifier ensuite pour
//  le mode courant.
function _chronoLinked(tab) {
    var chk = _chronoEl('chk-chrono-link', tab);
    return !!(chk && chk.checked);
}

function _syncChronoLink(tab, mode) {
    var chk = _chronoEl('chk-chrono-link', tab);
    if (chk) chk.checked = CHRONO_DEFS[tab].linkDefault(mode);
}

//  Démarrage du chronomètre lié. Appelé à la mise en marche de la source :
//  par le bouton Activer, et — côté Corde — par la saisie de la boule en mode
//  Libre (cf. onDown dans tube.js), où le geste EST la source.
function _startChronoIfLinked(tab) {
    if (!_chronoLinked(tab) || chronos[tab].running) return;
    chronos[tab].running = true;
    _syncChronoBtn(tab);
}

function _syncChronoBtn(tab) {
    var btn = _chronoEl('btn-chrono-start', tab);
    if (!btn) return;
    var run = chronos[tab].running;
    btn.innerHTML = run ? CHRONO_ICO_PAUSE : CHRONO_ICO_PLAY;
    btn.title     = run ? 'Arrêter le chronomètre' : 'Démarrer le chronomètre';
    btn.classList.toggle('running', run);
}

//  Appelée aussi au changement de mode de source : passer dans un mode sans
//  période alors que l'affichage est en T le ramène aux secondes.
function _syncChronoUnits(tab) {
    var c        = chronos[tab];
    var noPeriod = CHRONO_DEFS[tab].noPeriod();
    if (noPeriod && c.unit === 'T') c.unit = 's';

    var btnT = _chronoEl('btn-chrono-unit-T', tab);
    if (btnT) {
        btnT.disabled = noPeriod;
        btnT.classList.toggle('active', c.unit === 'T');
    }
    var btnS = _chronoEl('btn-chrono-unit-s', tab);
    if (btnS) btnS.classList.toggle('active', c.unit === 's');
}

function _updateChrono(tab) {
    var el = _chronoEl('chrono-value', tab);
    if (!el) return;
    var c   = chronos[tab];
    var inT = (c.unit === 'T' && CHRONO_DEFS[tab].sim().freq > 0);
    var txt = inT ? fmtFR(c.periods, 2) : fmtFR(c.elapsed, 2);
    // Écriture conditionnelle : la fonction est appelée à chaque frame.
    if (txt !== c.lastTxt) { el.textContent = txt; c.lastTxt = txt; }

    var lbl = _chronoEl('chrono-unit-lbl', tab);
    if (lbl) lbl.textContent = inT ? 'T' : 's';
}

// ══════════════════════════════════════════════════════════════════════
//  ─────────────── TAB CORDE ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

// ── Afficheur c (Corde) ───────────────────────────────────────────────
function _updateCReadoutCorde() {
    var el = document.getElementById('ro-c-corde');
    if (el) el.textContent = fmtFRRound(simCorde.c_cms, 2);
}

// ── Utilitaires source Corde ──────────────────────────────────────────
//  Arrête l'ÉMISSION sans toucher à ce qui est déjà parti : la liste des
//  impulsions est conservée (une impulsion encore en cours d'émission doit
//  aller à son terme, et l'historique de la source est de toute façon figé).
function _stopEmissionCorde() {
    simCorde.sinusoidalActive = false;
    simCorde.periodicActive   = false;
    simCorde.sourceMode       = null;
    _syncSourceButtonsCorde();
    _syncWavePropsBtnStateCorde();
    _syncLambdaBtnStateCorde();
}

//  Horloge du graphe y(t) : reste en attente (ytTimeOrigin = null) tant que
//  la source n'a pas été activée pour la 1ère fois depuis le dernier
//  changement de mode (sélecteur Corde) ou RAZ. Contrairement à Son, le
//  choix du mode est décorrélé de l'activation (sélecteur + bouton Activer
//  séparés) : c'est donc onSourceModeChangeCorde qui remet à null, et
//  chaque point d'activation (impulsion, continu, 1ère saisie en Libre) qui
//  démarre l'horloge — seulement si elle ne l'est pas déjà.
function _armYtWindowCorde() {
    if (simCorde.ytTimeOrigin !== null) return;   // déjà démarrée
    simCorde.ytTimeOrigin = simCorde.simTime;
    _ytClearCorde(1);
    _ytClearCorde(2);
}

//  Le bouton reflète l'état DE LA SOURCE elle-même (le pot vibrant), pas
//  celui de l'onde sur la corde : en impulsion, il s'éteint dès que le pot
//  a fini son mouvement (sourceActiveUntil), bien avant que l'impulsion
//  n'ait fini de traverser la corde.
function _syncSourceButtonsCorde() {
    var btn = document.getElementById('btn-source-active-corde');
    if (!btn) return;
    var active = (simCorde.sourceMode === 'impulse'  && simCorde.simTime < simCorde.sourceActiveUntil) ||
                 (simCorde.sourceMode === 'sinus'    && simCorde.sinusoidalActive) ||
                 (simCorde.sourceMode === 'periodic' && simCorde.periodicActive);
    btn.classList.toggle('active', active);
}

//  Applique le mode choisi dans le sélecteur : c'est le seul endroit qui
//  décide de l'état « Libre » et de l'activation des commandes qui n'ont
//  pas de sens dans ce mode (bouton Activer, curseurs f et A, propriétés
//  de l'onde — le geste de la souris n'a ni fréquence ni amplitude fixe).
function _applySourceModeCorde() {
    var sel  = document.getElementById('sel-mode-corde');
    var mode = sel ? sel.value : 'impulse';
    var free = (mode === 'free');

    simCorde.freeActive = free;
    if (free) {
        simCorde.sourceMode = 'free';
    } else if (simCorde.sourceMode === 'free') {
        simCorde.sourceMode   = null;
        simCorde.freeY        = 0;   // la corde relâchée revient au repos
        simCorde.freeTargetY  = 0;
        simCorde.freeDragging = false;
    }

    var btn = document.getElementById('btn-source-active-corde');
    if (btn) btn.disabled = free;

    // Impulsion n'a pas de fréquence définie non plus (cf. λ = c·T plus
    // bas) : le curseur f est verrouillé dès le choix du mode.
    var noFreq = free || mode === 'impulse';

    var rowF = document.getElementById('freq-row-corde');
    var rowA = document.getElementById('ampl-row-corde');
    if (rowF) rowF.classList.toggle('disabled', noFreq);
    if (rowA) rowA.classList.toggle('disabled', free);
    var slF = document.getElementById('sl-freq-corde');
    var slA = document.getElementById('sl-ampl-corde');
    if (slF) slF.disabled = noFreq;
    if (slA) slA.disabled = free;

    _syncSourceButtonsCorde();
    _syncWavePropsBtnStateCorde();
    _syncLambdaBtnStateCorde();
    _syncChronoLink('corde', mode);
    _syncChronoUnits('corde');
    _updateChrono('corde');
}

//  Bouton unique Activer/Désactiver : son effet dépend du mode choisi dans
//  le sélecteur. En Impulsion, chaque appui relance une impulsion et le
//  bouton se rallume tout seul le temps qu'elle traverse la corde (cf.
//  animate() dans la boucle principale). En Sinusoïdale et Périodique, il
//  bascule l'émission continue on/off.
function toggleSourceActiveCorde() {
    var sel  = document.getElementById('sel-mode-corde');
    var mode = sel ? sel.value : 'impulse';
    if (mode === 'free')          return;   // bouton désactivé — cf. _applySourceModeCorde

    var wasOn = simCorde.sinusoidalActive || simCorde.periodicActive;

    if (mode === 'impulse')       sendImpulseCorde();
    else if (mode === 'sinus')    toggleSinusoidalCorde();
    else                          togglePeriodicCorde();

    // Chronomètre lié (case « Lier ») : activer la source le lance s'il est
    // à l'arrêt, sans toucher à la valeur affichée — la remise à zéro reste
    // la main de l'utilisateur (bouton ⟲). S'il tourne déjà, on n'y touche
    // pas : une mesure en cours n'est jamais interrompue, y compris quand on
    // envoie une nouvelle impulsion pendant qu'une autre voyage encore.
    // Désactiver la source ne l'arrête pas non plus : l'onde déjà émise
    // continue de se propager et reste chronométrable.
    var isOn = simCorde.sinusoidalActive || simCorde.periodicActive;
    if (mode === 'impulse' || (!wasOn && isOn)) _startChronoIfLinked('corde');
}

//  Changement de mode dans le sélecteur : basculer entre Sinusoïdale et
//  Périodique alors qu'une émission continue tourne ne l'arrête pas — la
//  source reste activée, juste dans le nouveau mode. Ce n'est que vers un
//  mode qui n'a pas d'émission continue (Impulsion, Libre) qu'elle est
//  coupée (une impulsion en cours de propagation, elle, va à son terme).
//  Coupe systématiquement l'émission en cours, quel que soit le mode visé —
//  il faut rappuyer sur Activer pour repartir dans le nouveau mode.
function onSourceModeChangeCorde() {
    var wasContinuous = simCorde.sinusoidalActive || simCorde.periodicActive;

    // Changer de type de source remet le graphe y(t) à 0 et le met en
    // attente : il ne repartira qu'à la prochaine 1ère activation dans le
    // nouveau mode (cf. _armYtWindowCorde).
    simCorde.ytTimeOrigin = null;
    _ytClearCorde(1);
    _ytClearCorde(2);

    // Même règle que pour le graphe ci-dessus (cf. onSourceModeChangeSon).
    resetChrono('corde');

    if (wasContinuous) _stopEmissionCorde();

    _applySourceModeCorde();
}

//  Chaque appui envoie une NOUVELLE impulsion : celles qui sont déjà sur la
//  corde poursuivent leur route et se superposent, au lieu d'être effacées.
function sendImpulseCorde() {
    if (simCorde.paused) _setPausedCorde(false);
    _armYtWindowCorde();

    simCorde.sinusoidalActive   = false;   // tous les modes restent exclusifs
    simCorde.periodicActive     = false;
    simCorde.impulses.push({ startTime: simCorde.simTime });
    simCorde.impulsePropagating = true;
    simCorde.sourceMode         = 'impulse';
    simCorde.sourceActiveUntil  = Math.max(simCorde.sourceActiveUntil, simCorde.simTime + T_IMPULSE);

    _syncSourceButtonsCorde();
    _syncWavePropsBtnStateCorde();
    _syncLambdaBtnStateCorde();
}

function toggleSinusoidalCorde() {
    if (simCorde.sinusoidalActive) {
        _stopEmissionCorde();
    } else {
        if (simCorde.paused) _setPausedCorde(false);
        _armYtWindowCorde();

        simCorde.sinusoidalActive = true;
        simCorde.periodicActive   = false;   // tous les modes restent exclusifs
        simCorde.sinPhase         = 0;       // démarrage à y = 0, sans saut
        simCorde.sourceMode       = 'sinus';

        _syncSourceButtonsCorde();
        _syncWavePropsBtnStateCorde();
        _syncLambdaBtnStateCorde();
    }
}

//  Signal « Périodique » : somme fondamentale + harmonique 2 (cf.
//  stepSourceCorde), non sinusoïdale mais toujours lisse — même logique de
//  bascule on/off que le mode Sinusoïdale.
function togglePeriodicCorde() {
    if (simCorde.periodicActive) {
        _stopEmissionCorde();
    } else {
        if (simCorde.paused) _setPausedCorde(false);
        _armYtWindowCorde();

        simCorde.periodicActive   = true;
        simCorde.sinusoidalActive = false;   // tous les modes restent exclusifs
        simCorde.periodicPhase    = 0;       // démarrage à y = 0, sans saut
        simCorde.sourceMode       = 'periodic';

        _syncSourceButtonsCorde();
        _syncWavePropsBtnStateCorde();
        _syncLambdaBtnStateCorde();
    }
}

// ── Pause / Reset Corde ───────────────────────────────────────────────
function _setPausedCorde(paused) {
    simCorde.paused = paused;
    var btn = document.getElementById('btn-playpause-corde');
    if (!btn) return;
    if (paused) { btn.textContent = '▶ Reprendre'; btn.className = 'btn btn-play'; }
    else        { btn.textContent = '⏸ Pause';     btn.className = 'btn btn-pause'; }
}

function togglePauseCorde() { _setPausedCorde(!simCorde.paused); }

function resetSimAnimCorde() {
    resetAnimCorde();
    lastSrcUpdate = 0;
    _srcTickCorde = 0;
    // Le chronomètre mesure le temps de simulation : remettre celle-ci à
    // zéro sans l'arrêter laisserait une durée qui ne correspond plus à rien.
    resetChrono('corde');
    // resetAnimCorde remet sourceMode à null : on réapplique la sélection
    // du menu déroulant, qui elle n'est pas remise à zéro.
    _applySourceModeCorde();
    var btn = document.getElementById('btn-playpause-corde');
    if (btn) { btn.textContent = '⏸ Pause'; btn.className = 'btn btn-pause'; }

    // Le réticule est un mode d'inspection : la remise à zéro le relâche
    // aussi, sans quoi le bouton restait allumé sur une scène vierge.
    simCorde.graphCursorMode = false;
    var btnCur = document.getElementById('btn-graph-cursor');
    if (btnCur) btnCur.classList.remove('active');
    var tip = document.getElementById('graph-hover-tooltip');
    if (tip) tip.style.display = 'none';
}

// ── Sliders Corde ─────────────────────────────────────────────────────
//  Les readouts sont rafraîchis ICI et pas seulement dans la boucle : celle-ci
//  ne les met à jour que si l'animation tourne, si bien qu'en pause les
//  valeurs de T et λ restaient figées sur les anciens réglages.
function onSliderFreqCorde(v) {
    simCorde.freq = parseFloat(v);
    var lbl = document.getElementById('lbl-freq-corde');
    if (lbl) lbl.textContent = simCorde.freq.toFixed(1).replace('.', ',');
    _updateWavePropsCorde();
    _updateChrono('corde');   // l'affichage en T dépend de f
}

function onSliderAmplCorde(v) {
    simCorde.amplitudeCm = parseFloat(v);
    var lbl = document.getElementById('lbl-ampl-corde');
    if (lbl) lbl.textContent = simCorde.amplitudeCm.toFixed(1).replace('.', ',');
}

function onSliderMu(v) {
    simCorde.mu = parseFloat(v);
    var lbl = document.getElementById('lbl-mu');
    if (lbl) lbl.textContent = simCorde.mu.toFixed(1).replace('.', ',');
    updateCeleriteCorde();
    _updateCReadoutCorde();
    _updateWavePropsCorde();
}

function onSliderTension(v) {
    simCorde.T_tension = parseFloat(v);
    var lbl = document.getElementById('lbl-T-tension');
    if (lbl) lbl.textContent = simCorde.T_tension.toFixed(1).replace('.', ',');
    updateCeleriteCorde();
    _updateCReadoutCorde();
    _updateWavePropsCorde();
}

function onSliderAttenCorde(v) {
    simCorde.attenuation = parseFloat(v);
    var lbl = document.getElementById('lbl-atten-corde');
    if (lbl) lbl.textContent = simCorde.attenuation.toFixed(2).replace('.', ',');
}

function onSliderSpeedCorde(v) {
    var idx = parseInt(v, 10);
    simCorde.speedFactor = SPEED_STEPS[idx];
    var lbl = document.getElementById('lbl-speed-corde');
    if (lbl) lbl.textContent = simCorde.speedFactor.toFixed(2).replace('.', ',');
}

// ── Propriétés de l'onde Corde ────────────────────────────────────────
// ── Aspect de la corde : 'continu' | 'discret' ────────────────────────
//  Purement visuel : rien n'est réinitialisé, l'onde en cours poursuit sa
//  route. Passer en Discret cale simplement les balises sur les points
//  matériels les plus proches (une balise ne peut pas être posée sur un
//  lien entre deux points).
function setCordeAspect(mode) {
    if (mode !== 'discret') mode = 'continu';
    simCorde.aspect = mode;

    var btnC = document.getElementById('btn-aspect-continu');
    var btnD = document.getElementById('btn-aspect-discret');
    if (btnC) btnC.classList.toggle('active', mode === 'continu');
    if (btnD) btnD.classList.toggle('active', mode === 'discret');

    if (mode === 'discret') {
        // Le graphe y(t) enregistré jusqu'ici décrit un point qui n'est plus
        // celui suivi : on recalcule la trace pour la nouvelle position, comme
        // après un drag (cf. _markBeaconMoved dans tube.js).
        var moved1 = simCorde.beacon1.x, moved2 = simCorde.beacon2.x;
        snapCordeBeacon(simCorde.beacon1);
        snapCordeBeacon(simCorde.beacon2);
        if (simCorde.beacon1.active && simCorde.beacon1.x !== moved1) _ytMarkMovedCorde(1);
        if (simCorde.beacon2.active && simCorde.beacon2.x !== moved2) _ytMarkMovedCorde(2);
    }
}

// ── Bouton "Afficher graphe" (Corde) ────────────────────────────────
// Masque entièrement #graph-area (+ le splitter) pour que la zone
// d'animation occupe tout l'espace disponible.
function toggleShowGraphCorde() {
    simCorde.graphVisible = !simCorde.graphVisible;
    if (simCorde.graphVisible) _resetSplitFracToDefault();
    _applyShowGraphCorde();
}

function _applyShowGraphCorde() {
    var btn = document.getElementById('btn-show-graph-corde');
    if (btn) btn.classList.toggle('active', simCorde.graphVisible);

    var leftCol = document.getElementById('left-col');
    if (leftCol) leftCol.classList.toggle('graph-hidden', activeTab === 'corde' && !simCorde.graphVisible);

    // La classe posée avant l'exécution de ce script (cf. script inline dans
    // <head>, pour éviter le flash au chargement direct sur #corde ou #son)
    // n'est plus utile dès que l'état réel est appliqué : sans ce retrait,
    // elle masquerait #graph-area en permanence, même sur les autres onglets
    // et même après avoir cliqué sur « Afficher graphe ».
    document.documentElement.classList.remove('init-graph-hidden');

    // Rétablit la répartition réglée par l'utilisateur, ou la retire quand
    // le graphe est masqué : sans ça, une hauteur inline laissée par un drag
    // précédent figerait #anim-area et laisserait une bande vide sous
    // l'animation, là où le graphe se trouvait.
    applySplitFrac(splitFrac);

    scheduleResizeTube();
    resizeGraph();
}

function toggleWavePropsCorde() {
    simCorde.wavePropsVisible = !simCorde.wavePropsVisible;
    _applyWavePropsCorde();
}

function _applyWavePropsCorde() {
    var btn      = document.getElementById('btn-wave-props-corde');
    var simple   = document.getElementById('readout-simple-corde');
    var extended = document.getElementById('readout-props-corde');
    if (simCorde.wavePropsVisible) {
        if (btn)      btn.classList.add('active');
        if (simple)   simple.style.display = 'none';
        if (extended) extended.style.display = '';
        _updateWavePropsCorde();
    } else {
        if (btn)      btn.classList.remove('active');
        if (simple)   simple.style.display = '';
        if (extended) extended.style.display = 'none';
    }
}

function _updateWavePropsCorde() {
    if (!simCorde.wavePropsVisible) return;
    var elC = document.getElementById('ro-c-ext-corde');
    if (elC) elC.textContent = fmtFRRound(simCorde.c_cms, 2);
    var f   = simCorde.freq;
    var T   = (f > 0) ? 1 / f : 0;
    var elF = document.getElementById('ro-f-corde');
    var elT = document.getElementById('ro-T-corde');
    if (elF) elF.textContent = f.toFixed(2).replace('.', ',');
    if (elT) elT.textContent = T.toFixed(3).replace('.', ',');
    var lambda = simCorde.c_cms * T;   // m (c en m/s × T en s)
    var elL    = document.getElementById('ro-lambda-corde');
    if (elL) elL.textContent = fmtFRRound(lambda, 2);
}

//  Impulsion et Libre n'ont pas de fréquence définie : λ = c·T n'aurait
//  aucun sens. On se base sur le SÉLECTEUR de mode, pas sur sourceMode
//  (qui ne reflète que l'émission en cours) : le verrouillage doit
//  s'appliquer dès que le mode est choisi, même avant toute activation
//  de la source.
function _cordeModeIsImpulseOrFree() {
    var sel = document.getElementById('sel-mode-corde');
    var mode = sel ? sel.value : 'impulse';
    return (mode === 'impulse' || mode === 'free');
}

// ── Bouton "Afficher la longueur d'onde" (Corde) ─────────────────────
function toggleLambdaCorde() {
    var btn = document.getElementById('btn-lambda-corde');
    if (btn && btn.disabled) return;
    simCorde.lambdaVisible = !simCorde.lambdaVisible;
    _applyLambdaCorde();
}

function _applyLambdaCorde() {
    var btn = document.getElementById('btn-lambda-corde');
    if (btn) btn.classList.toggle('active', simCorde.lambdaVisible);
}

function _syncLambdaBtnStateCorde() {
    var btn = document.getElementById('btn-lambda-corde');
    if (!btn) return;
    var isImpulse = _cordeModeIsImpulseOrFree();
    btn.disabled = isImpulse;
    if (isImpulse && simCorde.lambdaVisible) {
        simCorde.lambdaVisible = false;
        _applyLambdaCorde();
    }
}

// ── Bouton "Afficher graphe" (Vagues) ───────────────────────────────
// Même mécanique que Son/Corde (cf. toggleShowGraphSon).
function toggleShowGraphVagues() {
    simVagues.graphVisible = !simVagues.graphVisible;
    if (simVagues.graphVisible) _resetSplitFracToDefault();
    _applyShowGraphVagues();
}

function _applyShowGraphVagues() {
    var btn = document.getElementById('btn-show-graph-vagues');
    if (btn) btn.classList.toggle('active', simVagues.graphVisible);

    var leftCol = document.getElementById('left-col');
    if (leftCol) leftCol.classList.toggle('graph-hidden', activeTab === 'vagues' && !simVagues.graphVisible);

    document.documentElement.classList.remove('init-graph-hidden');

    applySplitFrac(splitFrac);

    scheduleResizeTube();
    resizeGraph();
}

// ── Bouton "Afficher la longueur d'onde" (Vagues) ────────────────────
function toggleLambdaVagues() {
    simVagues.lambdaVisible = !simVagues.lambdaVisible;
    _applyLambdaVagues();
}

function _applyLambdaVagues() {
    var btn = document.getElementById('btn-lambda-vagues');
    if (btn) btn.classList.toggle('active', simVagues.lambdaVisible);
}

function _syncWavePropsBtnStateCorde() {
    var btn = document.getElementById('btn-wave-props-corde');
    if (!btn) return;
    var isImpulse = _cordeModeIsImpulseOrFree();
    btn.disabled = isImpulse;
    if (isImpulse && simCorde.wavePropsVisible) {
        simCorde.wavePropsVisible = false;
        _applyWavePropsCorde();
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Balises — communes (routées selon activeTab)
// ══════════════════════════════════════════════════════════════════════

function toggleBeaconActive(n) {
    if (activeTab === 'corde') {
        _toggleBeaconCorde(n);
    } else if (activeTab === 'vagues') {
        _toggleBeaconVagues(n);
    } else {
        _toggleBeaconSon(n);
    }
}

function _toggleBeaconSon(n) {
    var beacon = (n === 1) ? sim.beacon1 : sim.beacon2;
    var btn    = document.getElementById('btn-beacon' + n);
    beacon.active = !beacon.active;
    if (beacon.active) {
        // frac est CONSERVÉ d'une activation à l'autre : masquer une balise
        // pour dégager la vue ne doit pas faire perdre la position choisie.
        // (Le bouton « Remettre à zéro » restaure les positions par défaut.)
        beacon.x = sim.tubeLeft + sim.tubeLength * beacon.frac;
        if (btn) btn.classList.add('active');
    } else {
        if (btn) btn.classList.remove('active');
        _dptClear(n);
    }
}

function _toggleBeaconCorde(n) {
    var beacon = (n === 1) ? simCorde.beacon1 : simCorde.beacon2;
    var btn    = document.getElementById('btn-beacon' + n);
    beacon.active = !beacon.active;
    if (beacon.active) {
        // frac est CONSERVÉ d'une activation à l'autre : masquer une balise
        // pour dégager la vue ne doit pas faire perdre la position choisie.
        // (Le bouton « Remettre à zéro » restaure les positions par défaut.)
        beacon.x = simCorde.cordeLeft + simCorde.cordeLength * beacon.frac;
        snapCordeBeacon(beacon);   // aspect Discret : cale sur un point matériel
        if (btn) btn.classList.add('active');
    } else {
        if (btn) btn.classList.remove('active');
        _ytClearCorde(n);
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Onglets principaux (Corde | Son | Vagues)
// ══════════════════════════════════════════════════════════════════════

function setMainTab(tab) {
    activeTab = tab;
    history.replaceState(null, '', location.pathname + '#' + tab);

    var tabs     = ['corde', 'son', 'vagues'];
    var sections = tabs.map(function(t) { return document.getElementById('section-' + t); });
    var buttons  = tabs.map(function(t) { return document.getElementById('tab-' + t); });

    tabs.forEach(function(t, idx) {
        if (sections[idx]) sections[idx].style.display = (t === tab) ? '' : 'none';
        if (buttons[idx])  buttons[idx].classList.toggle('active', t === tab);
    });

    // ── Bandeau Instructions ──────────────────────────────────────────
    var allHints = document.querySelectorAll('.panel-hint');
    allHints.forEach(function(h) { h.style.display = 'none'; });
    var hint = document.getElementById('panel-hint-' + tab);
    if (hint) hint.style.display = '';

    // ── Box source : afficher la bonne version ────────────────────────
    var srcSon    = document.getElementById('source-son');
    var srcCorde  = document.getElementById('source-corde');
    var srcVagues = document.getElementById('source-vagues');
    if (srcSon)    srcSon.style.display    = (tab === 'son')   ? '' : 'none';
    if (srcCorde)  srcCorde.style.display  = (tab === 'corde') ? '' : 'none';
    if (srcVagues) srcVagues.style.display = (tab === 'vagues') ? '' : 'none';

    // Chronomètre : une box par onglet, une seule visible à la fois
    ['son', 'corde', 'vagues'].forEach(function(t) {
        var box = document.getElementById('chrono-' + t);
        if (box) box.style.display = (t === tab) ? '' : 'none';
    });

    // ── Boutons son-only / vagues-only au-dessus du canvas ───────────
    var sonOnlyBtns = document.querySelectorAll('.son-only');
    sonOnlyBtns.forEach(function(b) {
        b.style.display = (tab === 'son') ? '' : 'none';
    });
    var vaguesOnlyBtns = document.querySelectorAll('.vagues-only');
    vaguesOnlyBtns.forEach(function(b) {
        b.style.display = (tab === 'vagues') ? '' : 'none';
    });
    // Bande « Trajectoire des molécules d'eau » : conditionnée à l'onglet ET à
    // la vue en coupe, elle ne peut pas passer par la classe .vagues-only.
    syncBtnOrbitesVagues();

    // ── Remise à zéro des états de balises dans les boutons ───────────
    // Resynchronise l'état visuel des boutons Balise selon le tab
    var b1 = (tab === 'corde') ? simCorde.beacon1 : (tab === 'vagues') ? simVagues.beacon1 : sim.beacon1;
    var b2 = (tab === 'corde') ? simCorde.beacon2 : (tab === 'vagues') ? simVagues.beacon2 : sim.beacon2;
    var btnB1 = document.getElementById('btn-beacon1');
    var btnB2 = document.getElementById('btn-beacon2');
    if (btnB1) btnB1.classList.toggle('active', b1.active);
    if (btnB2) btnB2.classList.toggle('active', b2.active);

    // ── Labels des boutons graphe ─────────────────────────────────────
    _updateGraphBtnLabels(tab);

    // ── Mode graphe actif : resynchroniser les boutons ────────────────
    var mode = (tab === 'corde') ? simCorde.graphMode : (tab === 'vagues') ? simVagues.graphMode : sim.graphMode;
    var btnDpx  = document.getElementById('btn-graph-dpx');
    var btnDpt  = document.getElementById('btn-graph-dpt');
    var btnBoth = document.getElementById('btn-graph-both');
    if (btnDpx)  btnDpx.classList.toggle ('active', mode === 'dpx');
    if (btnDpt)  btnDpt.classList.toggle ('active', mode === 'dpt');
    if (btnBoth) btnBoth.classList.toggle('active', mode === 'both');
    var graphArea = document.getElementById('graph-area');
    if (graphArea) graphArea.classList.toggle('mode-both', mode === 'both');

    // ── Layout vagues : canvas plein espace ──────────────────────────
    var animArea = document.getElementById('anim-area');
    if (animArea) animArea.classList.toggle('vagues-layout', tab === 'vagues');

    // ── Zone graphe masquée (bouton "Afficher graphe", Son + Corde) ──────
    var leftCol = document.getElementById('left-col');
    var graphHidden = (tab === 'corde'  && !simCorde.graphVisible) ||
                       (tab === 'son'    && !sim.graphVisible) ||
                       (tab === 'vagues' && !simVagues.graphVisible);
    if (leftCol) leftCol.classList.toggle('graph-hidden', graphHidden);
    // cf. commentaire dans _applyShowGraphCorde/_applyShowGraphSon : la classe
    // de pré-masquage posée dans <head> ne doit pas survivre au premier
    // calcul de l'état réel.
    document.documentElement.classList.remove('init-graph-hidden');

    // La box source n'a pas le même contenu d'un onglet à l'autre, donc pas la
    // même hauteur : il faut réajuster son échelle. Le ResizeObserver, lui, ne
    // verrait rien — la taille de #anim-area, elle, n'a pas changé.
    _applySourceScale();

    // La répartition réglée au splitter est posée ou retirée selon que le
    // graphe est visible dans ce nouvel onglet (cf. applySplitFrac).
    applySplitFrac(splitFrac);

    // ── Resize pour adapter les canvas au tab ─────────────────────────
    if (tab === 'corde') {
        resizeCorde();
    } else if (tab === 'son') {
        resizeTube();
    } else if (tab === 'vagues') {
        resizeVagues();
    }
    resizeGraph();
}

// ══════════════════════════════════════════════════════════════════════
//  Bandeau Instructions (collapsible)
// ══════════════════════════════════════════════════════════════════════

function toggleHint(id) {
    var hint = document.getElementById('panel-hint-' + id);
    if (!hint) return;
    hint.classList.toggle('collapsed');
    var btn = document.getElementById('btn-hint-' + id);
    if (btn) {
        btn.title = hint.classList.contains('collapsed')
            ? 'Afficher les instructions'
            : 'Masquer les instructions';
    }
}

// ══════════════════════════════════════════════════════════════════════
//  Initialisation
// ══════════════════════════════════════════════════════════════════════

function init() {
    resizeTube();
    resizeCorde();
    resizeVagues();
    resizeGraph();

    // La répartition mémorisée est en flex-grow : elle suit le
    // redimensionnement d'elle-même. On la réapplique tout de même pour la
    // reborner — un plancher qui tenait dans l'ancienne hauteur peut ne
    // plus tenir dans la nouvelle.
    window.addEventListener('resize', function() {
        applySplitFrac(splitFrac);
        scheduleResizeTube();
    });

    requestAnimationFrame(loop);
    _syncUIToSim();
}

// Synchronise les valeurs initiales de l'UI avec les états de sim et simCorde
function _syncUIToSim() {
    // ── Son ────────────────────────────────────────────────────────────
    _setSlider('sl-freq',  sim.freq,        'lbl-freq',  1);
    _setSlider('sl-rho',   sim.rho,         'lbl-rho',   1);
    _setSlider('sl-K',     sim.K,           'lbl-K',     1);
    _setSlider('sl-atten', sim.attenuation, 'lbl-atten', 2);
    sim.speedFactor = 1.00;
    var slSpeed = document.getElementById('sl-speed');
    if (slSpeed) slSpeed.value = 3;
    var lblSpeed = document.getElementById('lbl-speed');
    if (lblSpeed) lblSpeed.textContent = '1,00';
    sim.wavePropsVisible = false;
    _applyWavePropsState();
    sim.lambdaVisible = false;
    _applyLambdaSon();
    sim.graphVisible = false;
    _applyShowGraphSon();
    updateCelerite();
    _updateCReadout();
    _applySourceModeSon();
    var btn = document.getElementById('btn-playpause');
    if (btn) { btn.textContent = '⏸ Pause'; btn.className = 'btn btn-pause'; }

    // ── Corde ──────────────────────────────────────────────────────────
    _setSlider('sl-freq-corde',  simCorde.freq,        'lbl-freq-corde',  1);
    _setSlider('sl-ampl-corde',  simCorde.amplitudeCm, 'lbl-ampl-corde',  1);
    _setSlider('sl-mu',          simCorde.mu,          'lbl-mu',          1);
    _setSlider('sl-T-tension',   simCorde.T_tension,   'lbl-T-tension',   1);
    _setSlider('sl-atten-corde', simCorde.attenuation, 'lbl-atten-corde', 2);
    simCorde.speedFactor = 1.00;
    var slSpeedC = document.getElementById('sl-speed-corde');
    if (slSpeedC) slSpeedC.value = 3;
    var lblSpeedC = document.getElementById('lbl-speed-corde');
    if (lblSpeedC) lblSpeedC.textContent = '1,00';
    simCorde.wavePropsVisible = false;
    _applyWavePropsCorde();
    _syncWavePropsBtnStateCorde();
    simCorde.lambdaVisible = false;
    _applyLambdaCorde();
    _syncLambdaBtnStateCorde();
    simCorde.graphVisible = false;
    _applyShowGraphCorde();
    updateCeleriteCorde();
    _updateCReadoutCorde();
    _applySourceModeCorde();
    var btnC = document.getElementById('btn-playpause-corde');
    if (btnC) { btnC.textContent = '⏸ Pause'; btnC.className = 'btn btn-pause'; }

    // ── Vagues ─────────────────────────────────────────────────────────
    _setSlider('sl-freq-vagues',  simVagues.freq,        'lbl-freq-vagues',  1);
    _setSlider('sl-ampl-vagues',  simVagues.amplitude,   'lbl-ampl-vagues',  1);
    _setSlider('sl-h-vagues',     simVagues.h,           'lbl-h-vagues',     3);
    var lblHV = document.getElementById('lbl-h-vagues');
    if (lblHV) lblHV.textContent = (simVagues.h * 1000).toFixed(1).replace('.', ',');
    _setSlider('sl-g-vagues',     simVagues.g,           'lbl-g-vagues',     2);
    _setSlider('sl-atten-vagues', simVagues.attenuation, 'lbl-atten-vagues', 2);
    simVagues.speedFactor = 1.00;
    var slSpeedV = document.getElementById('sl-speed-vagues');
    if (slSpeedV) slSpeedV.value = 3;
    var lblSpeedV = document.getElementById('lbl-speed-vagues');
    if (lblSpeedV) lblSpeedV.textContent = '1,00';
    simVagues.wavePropsVisible = false;
    _applyWavePropsVagues();
    simVagues.lambdaVisible = false;
    _applyLambdaVagues();
    simVagues.graphVisible = false;
    _applyShowGraphVagues();
    updateCeleriteVagues();
    _updateCReadoutVagues();
    var btnV = document.getElementById('btn-playpause-vagues');
    if (btnV) { btnV.textContent = '⏸ Pause'; btnV.className = 'btn btn-pause'; }

    // ── Onglet actif : depuis le hash URL ou Son par défaut ───────────
    var hash = window.location.hash.replace('#', '');
    var validTabs = ['corde', 'son', 'vagues'];
    setMainTab(validTabs.indexOf(hash) !== -1 ? hash : 'son');
}

function _setSlider(sliderId, value, lblId, decimals) {
    var sl  = document.getElementById(sliderId);
    var lbl = document.getElementById(lblId);
    if (sl)  sl.value = value;
    if (lbl) lbl.textContent = value.toFixed(decimals).replace('.', ',');
}

// ── Démarrage ──────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);
