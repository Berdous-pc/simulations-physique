// ═══════════════════════════════════════════════════
//  Simulation pédagogique — Physique-Chimie Lycée
//  Auteur  : Mathieu Berdous
//  Licence : CC BY-NC 4.0 — https://creativecommons.org/licenses/by-nc/4.0/
// ═══════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
//  sim.js — État global et physique de la simulation
//  Chargé en PREMIER. Expose l'objet `sim` et toutes les fonctions
//  physiques utilisées par fil.js (rendu) et ui.js (contrôles + boucle).
//
//  Modèle retenu : modèle de Drude « lycée ».
//    - Le réseau de cations est FIXE (le cristal du métal).
//    - Chaque électron vole en ligne droite entre deux chocs ; sous tension
//      il est accéléré par le champ pendant ce vol.
//    - À chaque choc sur un cation, sa vitesse est remise à la vitesse
//      d'agitation thermique dans une direction aléatoire : toute la
//      mémoire de l'accélération est perdue.
//  Conséquence, et c'est tout l'intérêt : la vitesse de dérive n'augmente
//  pas indéfiniment, elle se stabilise à v = a·τ, donc proportionnelle à U
//  (loi d'Ohm) et d'autant plus faible que les chocs sont fréquents.
// ══════════════════════════════════════════════════════════════════════

'use strict';

// ══════════════════════════════════════════════════════════════════════
//  Constantes de modèle
// ══════════════════════════════════════════════════════════════════════

// ── Réseau de cations ──────────────────────────────────────────────────
// Colonnes alternées de 3 puis 2 ions, décalées d'un demi-pas : c'est un
// empilement compact, celui d'un vrai cristal métallique, et non une
// grille carrée. Trois rangées suffisent à rendre le zigzag lisible sans
// transformer le fil en mur d'obstacles, et laissent chaque ion assez gros
// à l'écran.
//
// Le pas de RÉFÉRENCE vaut hauteur intérieure / 3 ; le pas HORIZONTAL en
// découle (√3/2 du pas de référence, l'écartement d'un empilement
// compact). Tout le reste — rayons, vitesses, accélération — s'exprime par
// rapport à eux : la simulation est donc identique à toute taille de
// canvas.
var ROWS      = 3;
var COL_RATIO = 0.866;   // √3/2 : pas horizontal / pas de référence

// ── Marge aux parois ───────────────────────────────────────────────────
// Distance entre le centre des ions extrêmes (ceux des colonnes à 3) et la
// paroi la plus proche, en fraction de la hauteur intérieure.
// Un réseau strictement régulier la fixerait à 1/(2·ROWS) = 1/6 : les ions
// seraient alors aussi espacés entre eux qu'ils le sont des parois. Mais
// une paroi n'arrête que d'un côté, là où un ion arrête des deux : à marge
// égale, le passage le long du mur est deux fois plus large que ceux du
// centre, et il s'ouvre en deux couloirs continus qui longent tout le fil.
// C'est la même canalisation que celle décrite plus bas pour les rangées,
// et elle est pire : ces couloirs-là sont parfaitement rectilignes et
// bordés par la paroi, donc un électron couché sur l'axe par le champ y
// file d'un bout à l'autre du fil sans heurter un seul ion.
// On resserre donc cette marge d'un facteur 1,5 (1/6 -> 1/9) et on répartit
// la place ainsi libérée entre les rangées, ce qui dégage le centre du fil.
// Le réseau garde exactement sa structure : trois rangées régulièrement
// espacées, colonnes à 2 ions au milieu des creux, quinconce intact.
var EDGE_FRAC = 1 / 9;

// Rayon d'un électron, en fraction du pas du réseau.
var RE_FRAC = 0.055;

// ── Curseur « gêne au déplacement » ────────────────────────────────────
// Il règle l'encombrement des ions du réseau, donc la fréquence des chocs,
// donc le temps de vol moyen τ : c'est la mobilité des porteurs. Avec la
// densité n, ce sont les deux causes de la conductivité (σ = n·e²·τ/m).
// Le rayon de collision vaut rCation + rElectron ; il reste inférieur à un
// demi-pas sur toute la plage, sinon le réseau fermerait complètement les
// couloirs et plus aucun électron ne passerait.
var GENE_STEPS   = [0.105, 0.155, 0.21, 0.26, 0.30]; // rayon cation / pas
var GENE_LABELS  = ['Très faible', 'Faible', 'Moyenne', 'Forte', 'Très forte'];
var GENE_DEFAULT = 2;

// ── Désordre du réseau ─────────────────────────────────────────────────
// Un réseau PARFAITEMENT régulier laisse entre ses rangées des couloirs
// horizontaux entièrement libres : dès que le champ couche les
// trajectoires sur l'axe du fil, une partie des électrons les enfile et
// traverse tout le fil sans jamais heurter un ion. C'est un artefact de la
// périodicité (l'effet de canalisation), pas de la physique visée : il
// ferait croire que les chocs sont accessoires, et il rend la vitesse de
// dérive plus que proportionnelle à U.
// L'empilement compact en quinconce y répond déjà presque seul : les ions
// des colonnes à 2 se logent dans les creux des colonnes à 3, si bien que
// les rangées se succèdent tous les DEMI-pas verticaux. Aucune ligne
// horizontale ne passe entre elles dès que le rayon de collision dépasse
// un quart du pas — c'est le cas sur presque toute la plage du curseur de
// gêne. La marge aux parois resserrée (EDGE_FRAC) écarte les rangées les
// unes des autres et rogne donc cette marge de sécurité : au cran de gêne
// le plus faible, le rayon de collision ne dépasse plus le quart du pas
// que de 10 %, contre 28 % avec un réseau régulier. C'est le décalage
// aléatoire ci-dessous qui fait le reste. Il ne reste qu'au cran le plus faible une fente étroite, que
// referme un décalage minime de chaque ion autour de son site.
// Ce décalage est volontairement PETIT : au-delà, l'œil cesse de lire le
// quinconce et ne voit plus qu'un semis d'ions. Il est tiré une fois pour
// toutes, pas à chaque image — le réseau reste strictement immobile.
var LAT_JITTER = 0.045;

// ── Neutralité du milieu ───────────────────────────────────────────────
// Le fil doit rester NEUTRE. Chaque atome du réseau libère un électron et
// devient un ion +, comme dans le cuivre : le réseau ne bouge pas, le
// nombre d'électrons vaut exactement le nombre d'ions, et la compensation
// des charges est exacte.

// ── Vitesse d'agitation thermique ──────────────────────────────────────
// Exprimée en fraction de la hauteur intérieure du fil parcourue par
// seconde. Constante : le modèle est à température fixe, donc à énergie
// cinétique d'agitation constante (un choc redistribue la direction, pas
// le module).
var VTH_FRAC = 0.90;

// ── Accélération imposée par le champ ──────────────────────────────────
// a = ACC_FRAC × hauteur intérieure × U  (px·s⁻²).
// Calibrée pour qu'à U = 12 V et gêne « Moyenne » la vitesse de dérive
// atteigne environ 0,62 fois la vitesse d'agitation : le mouvement
// d'ensemble devient alors franchement visible sans que le fourmillement
// disparaisse.
// C'est aussi un PLAFOND, et non un simple choix d'esthétique. La
// fréquence des chocs est proportionnelle à la vitesse TOTALE de
// l'électron ; dès que la dérive devient comparable à l'agitation, tau
// diminue quand U augmente et v = a·tau cesse d'être proportionnelle à U.
// Mesuré à gêne « Moyenne », vd/U est constant à 1 % près de 3 à 9 V avec
// les réglages actuels et ne fléchit qu'à 12 V. Monter encore le rapport
// vd/vth — en augmentant ACC_FRAC, en baissant VTH_FRAC ou en rapetissant
// les ions — le rend non monotone : passer de 6 V à 9 V ferait alors
// BAISSER la dérive affichée. La loi d'Ohm prime sur la lisibilité du
// mouvement d'ensemble, pour lequel la trace et les flèches de vitesse
// sont les bons outils.
var ACC_FRAC = 0.239;

// Plafond de vitesse, en multiples de la vitesse d'agitation. Sert de
// garde-fou numérique (gêne très faible + tension maximale) et borne le
// nombre de sous-pas nécessaires contre le tunneling à travers un cation.
// À 3,0 il ne jouait plus ce rôle de garde-fou : il écrêtait en régime
// normal jusqu'à 11 % des électrons à gêne « Très faible » sous 12 V, ce
// qui rabotait la dérive là où elle est la plus grande. À 6,0 l'écrêtage
// tombe sous 1,5 % dans le pire cas et devient négligeable partout
// ailleurs, sans changer la dérive mesurée aux réglages courants. Le
// nombre de sous-pas reste très en deçà de son propre plafond de 12.
var VMAX_FACTOR = 6.0;

// ── Étalonnage des grandeurs affichées ─────────────────────────────────
// La simulation mesure une dérive en pixels ; on la ramène d'abord à une
// grandeur sans dimension (fraction de la vitesse d'agitation), ce qui la
// rend indépendante de la taille du canvas, puis on l'étalonne sur des
// ordres de grandeur réels.
// Les réglages par défaut (U = 6 V, gêne « Moyenne ») donnent en régime
// établi vdNorm ≈ 0,345 — valeur mesurée sur 150 s et sur huit réseaux
// tirés indépendamment (dispersion ±4 %), et indépendante de la taille de
// la fenêtre à 2 % près ; les
// deux constantes ci-dessous y calent 0,10 mm/s
// — valeur typique de la vitesse de dérive dans un fil de cuivre d'un
// circuit de TP — et 150 mA. Les deux affichages étant proportionnels à la
// même mesure, ils restent toujours cohérents entre eux (I = n·e·S·v).
// I est proportionnelle à la DENSITÉ de porteurs, pas au nombre
// d'électrons affichés : une fenêtre plus large montre un plus long morceau
// de fil, donc plus d'électrons, sans que l'intensité change. La densité
// d'ions étant fixée par la géométrie du réseau, elle vaut k × (densité
// d'ions) — donc I ∝ k × vdNorm, indépendamment de la taille du canvas.
var VD_MM_PER_NORM = 0.290;  // mm/s pour vdNorm = 1
var K_I            = 435;    // mA par unité de vdNorm

// ── Isolant : électrons liés à leur atome ──────────────────────────────
// Dans un isolant, aucun électron n'est libre : chacun reste lié à son
// noyau et tourne autour de lui. Sous tension, son orbite ne se décale pas
// d'un bloc — le noyau doit rester À L'INTÉRIEUR : elle se DÉFORME. Un
// cercle de rayon R devient une ellipse allongée dans le sens du fil, vers
// la borne +, et un peu aplatie dans l'autre sens ; son centre se déplace
// moins que son bout, si bien que le noyau reste franchement à l'intérieur.
// Tous les atomes subissent la même déformation, qui se réduit à un seul
// nombre signé a, proportionnel à U (cf. isoOrbit).
//
// Dimensions, en fraction de la hauteur intérieure du fil :
//  - R : l'orbite doit tenir entre le noyau et la paroi (marge EDGE_FRAC,
//    soit 0,111) en gardant la place de l'électron lui-même ;
//  - noyau : plus petit que l'ion du conducteur, pour que l'électron ne
//    touche jamais le noyau — les signes + et − ne se superposent alors
//    jamais (à |a| maximal, l'orbite reste à plus de 0,9·R du noyau).
var ISO_R_FRAC   = 0.090;  // rayon de l'orbite non déformée
var ISO_RN_FRAC  = 0.15;    // rayon du noyau, en fraction du pas du réseau
var ISO_A_MAX    = 0.30;    // déformation à |U| = 12 V
var ISO_K        = ISO_A_MAX / 12;   // déformation par volt
var ISO_STRETCH  = 0.70;    // allongement du grand axe par unité de |a|
var ISO_SHIFT    = 1.00;    // décalage du centre, en R par unité de a

// Réponse de la déformation à un changement de tension : oscillateur
// amorti (pulsation ω, amortissement ζ). Elle s'établit en ~0,4 s, avec un
// léger dépassement. Pendant ce court intervalle, les charges se déplacent :
// c'est un bref courant, qui s'annule dès que la déformation est stable.
var ISO_OMEGA = 12;    // rad/s
var ISO_ZETA  = 0.7;

// Tours par seconde de l'électron autour de son noyau (tirés par atome).
var ISO_TURN_MIN = 0.35, ISO_TURN_MAX = 0.70;

// Intensité = K_ISO × vitesse de variation de a (mA par s⁻¹) : à U = 6 V,
// le pic atteint environ 150 mA, comme le régime établi du conducteur.
var K_ISO = 210;
// Lissage de l'intensité : court, pour que le pic reste lisible.
var ISO_I_TAU = 100;   // ms
// En dessous de cette intensité, le schéma n'indique plus de courant (mA).
var ISO_I_SHOW = 10;

// ── Semi-conducteur : l'agitation thermique libère des électrons ───────
// À basse température il se comporte comme l'isolant. Quand T monte, un
// atome neutre peut perdre son électron, qui devient libre et dérive comme
// dans le conducteur ; l'atome, devenu ion +, peut le recapturer si l'électron
// repasse à proximité. Le nombre d'électrons libres est un ÉQUILIBRE entre
// ces deux processus, et il croît avec T — à l'opposé d'un métal.
//
// T agit sur les DEUX processus : elle accélère l'ionisation, et elle
// affaiblit la recapture (un électron très agité se laisse moins retenir).
// Sans cette seconde moitié, la fraction d'atomes ionisés ne croîtrait que
// comme la racine du taux d'ionisation et n'approcherait jamais de 100 %.
// À T très élevée la recapture reste non nulle : on garde quelques atomes
// neutres, pour que ce cran ne se confonde pas avec un conducteur.
//
// Pour chaque cran : taux d'ionisation par atome neutre (s⁻¹) et force de
// la recapture (multiple de SEMI_CAP_RATE). Réglés pour que la fraction
// d'atomes ionisés, à l'équilibre, vaille environ 0 ; 8 ; 25 ; 55 ; 85 %
// (cf. SEMI_F_EQ). L'attraction (SEMI_ATT) renforce aussi la recapture à
// froid : les taux d'ionisation ont été réglés avec elle, par mesure.
var TEMP_LABELS  = ['Très basse', 'Basse', 'Ambiante', 'Élevée', 'Très élevée'];
var TEMP_DEFAULT = 2;
var SEMI_NU      = [0, 0.055, 0.075, 0.39, 1.78];   // s⁻¹
var SEMI_CAP     = [1, 1,      0.8,   0.5,  0.3];
// Fraction d'atomes ionisés à l'équilibre : elle sert à PARTIR de l'état
// d'équilibre quand on choisit ce matériau, au lieu d'un cristal sans
// porteur qui mettrait de longues secondes à se remplir.
var SEMI_F_EQ    = [0, 0.08, 0.25, 0.55, 0.85];

// Agitation thermique : la vitesse d'agitation croît comme √T. Facteurs par
// cran, appliqués à la vitesse de référence (celle du conducteur) pour les
// électrons libres, et à la vitesse de rotation des électrons liés. À champ
// égal, un électron plus rapide subit plus de chocs par seconde : sa dérive
// diminue avec T (baisse de la mobilité), mais le nombre de porteurs croît
// bien plus vite, si bien que le courant total augmente quand même.
var SEMI_VTH = [0.7, 0.85, 1.0, 1.2, 1.4];

// Attraction d'un électron libre par l'ion + le plus proche. Elle accélère
// la recapture, qu'un hasard seul rendrait très lente quand il ne reste que
// quelques ions (par neutralité, autant d'ions que d'électrons libres). Elle
// décroît avec T : à froid elle courbe nettement les trajectoires, à chaud
// elle devient négligeable devant l'agitation, et le dernier cran n'en a plus.
// Accélération à la distance SEMI_ATT_D0, en hauteurs de fil par s² ; elle
// varie en 1/d, comme la force de Coulomb dans un plan (adoucie au contact).
var SEMI_ATT    = [4, 1, 0.5, 0.2, 0];
var SEMI_ATT_D0 = 0.30;   // hauteurs de fil
// Sans frottement, un électron attiré ne ferait que tourner autour de l'ion
// sans jamais s'en rapprocher (l'énergie se conserve). Près de l'ion, le
// réseau lui en prend : amortissement de même forme que l'attraction
// (s⁻¹ par unité d'attraction, à la distance SEMI_ATT_D0).
var SEMI_ATT_DAMP = 0.1;

// ── Sauts de lacune ────────────────────────────────────────────────────
// Un ion (atome qui a perdu son électron) peut combler son manque avec
// l'électron lié d'un atome voisin : l'ion « se déplace » alors d'un atome
// vers l'autre, en sens inverse de l'électron. C'est la conduction par
// « trous ». Les noyaux ne bougent jamais : seul se décale le manque.
//
// Un saut n'est pas réservé à un sens. Sans champ, l'ion comble son manque
// depuis n'importe quel voisin : le manque fait une marche au hasard, sans
// dérive. Sous champ, l'électron saute plus volontiers vers la borne + que
// dans l'autre sens, de sorte que le manque dérive en sens inverse — dans le
// sens du courant conventionnel. Poids d'un saut de déplacement Δ (en pas
// du réseau, selon x) : exp(−β·U·Δ).
//
// Aux extrémités du morceau de fil, le réseau se prolonge : un ion de la
// colonne de bord peut recevoir un électron « de l'extérieur » — la lacune
// sort du morceau. Comme pour les électrons libres, une lacune ne disparaît
// pas : au même instant, un atome neutre de la colonne de bord OPPOSÉE cède
// un électron à l'extérieur et devient un ion — une lacune entre. Le nombre
// d'ions reste donc celui des électrons libres : le fil reste neutre.
var SEMI_HOP      = [0.3, 0.4, 0.55, 0.8, 1.1];   // s⁻¹ : taux de saut d'une lacune, voisins tous disponibles
var SEMI_HOP_BIAS = 0.12;   // β, par volt
var SEMI_HOP_T    = 0.25;   // durée du vol de l'électron d'un atome à l'autre (s)
var SEMI_NBR_D    = 0.45;   // distance maximale de deux voisins (hauteurs de fil)

// Un électron ne peut sauter vers un ion que s'il est du côté de son orbite
// qui regarde cet ion : à moins de SEMI_HOP_FACE degrés de la direction du
// noyau voisin. Il n'est dans cette zone qu'une fraction du temps
// (2·SEMI_HOP_FACE / 360) ; les taux de saut, définis en moyenne, sont donc
// multipliés par l'inverse pendant qu'il y est.
var SEMI_HOP_FACE  = 40;
var SEMI_FACE_COS  = Math.cos(SEMI_HOP_FACE * Math.PI / 180);
var SEMI_FACE_BOOST = 180 / SEMI_HOP_FACE;

// Étalonnage des grandeurs affichées : les noyaux sont dessinés plus petits
// que les ions du conducteur, donc un électron libre y subit moins de chocs
// et dérive plus vite (mesuré : ×1,34 à champ égal). Sans correction, un
// semi-conducteur dont 85 % des atomes sont ionisés porterait plus de
// courant que le conducteur lui-même. On ramène donc la dérive et
// l'intensité affichées à l'échelle du conducteur : 1/1,34.
var SEMI_CAL = 0.75;

// Recapture : zone de capture autour d'un ion (en multiples du rayon de
// choc) et taux de capture de référence à l'intérieur (s⁻¹, par électron).
var SEMI_CAP_R    = 1.6;
var SEMI_CAP_RATE = 8;

// Constante de temps du lissage des mesures, en régime établi (ms).
// Longue à dessein : la moyenne instantanée des vitesses de quelques
// dizaines d'électrons fluctue de près de 10 %, et il faut une fenêtre de
// plusieurs secondes pour ramener ce bruit à quelques pour cent.
// Un lissage exponentiel à cette constante mettrait toutefois une bonne
// dizaine de secondes à monter après la fermeture du circuit. La parade,
// dans updateMeasures(), est de repartir d'une MOYENNE COURANTE depuis le
// dernier changement de régime : son coefficient 1/n décroît d'image en
// image, elle converge donc tout de suite, puis l'exponentielle prend le
// relais dès qu'elle devient la plus lente des deux. On a la réactivité au
// début et la stabilité ensuite, sans arbitrer entre les deux.
var MEASURE_TAU = 6000;

// Vitesse d'animation — mêmes crans et même étiquetage que ondes/ et
// pression/, qui portent déjà ce curseur.
var SPEED_STEPS = [0.10, 0.25, 0.50, 1.00];

// Longueur maximale de la trace de l'électron suivi (points, un par image).
// Quelques secondes suffisent : au-delà, la trace remplit le fil et on ne
// distingue plus le trajet récent du fouillis déjà parcouru.
var TRACE_MAX = 300;

// ══════════════════════════════════════════════════════════════════════
//  État global
// ══════════════════════════════════════════════════════════════════════

var sim = {

  // ── Commandes ──
  U_V       : 6,      // tension imposée aux bornes du fil (V), signée
  circuitOn : false,  // interrupteur du circuit (false = ouvert)
  geneIdx   : GENE_DEFAULT,
  material  : 'conducteur',   // 'conducteur', 'isolant' ou 'semi'
  tempIdx   : TEMP_DEFAULT,   // semi-conducteur : cran de température

  // Déduits de la géométrie (cf. updateGeometry) :
  nSites : 0,   // nombre d'ions du réseau
  nElec  : 0,   // nombre d'électrons = nSites (un électron libéré par ion)

  paused       : false,
  speedFactor  : 1,
  showMeasures : true,

  // Flèches de vitesse portées par chaque électron : elles rendent
  // visible le fait que chaque direction individuelle reste tirée au
  // hasard, même quand l'ensemble dérive dans un sens.
  showArrows   : false,

  // ── Électrons ──
  // Tableau d'objets {x, y, vx, vy} en pixels / pixels par seconde.
  electrons : [],

  // Électron suivi (indice dans `electrons`, -1 si aucun) et sa trace.
  // La trace est une suite de points {x, y, b} ; `b` marque une rupture
  // de tracé. Le suivi s'arrête dès que l'électron quitte le fil.
  tracedIdx : -1,
  trace     : [],

  // ── Géométrie du fil, en pixels (calculée par fil.js) ──
  tx1 : 0, tx2 : 0,   // bords intérieurs gauche / droit
  ty1 : 0, ty2 : 0,   // bords intérieurs haut / bas
  ax  : 0, ay  : 0,   // pas de référence du réseau selon x et y
  ayLat : 0,          // pas vertical réel entre deux rangées
  cols : 0,           // nombre de colonnes d'ions (alternance 3 / 2)

  // Positions des ions : `latCols` les groupe par colonne (c'est ainsi que
  // nearestCation les interroge), `lattice` est la même liste à plat pour
  // le rendu. `latOff` garde les décalages normalisés, conservés d'un
  // redimensionnement à l'autre — le réseau ne doit pas se retirer au sort
  // à chaque changement de taille de fenêtre.
  latCols : [],
  lattice : [],
  latOff  : [],

  // ── Grandeurs dérivées de la géométrie ──
  vth     : 0,   // vitesse d'agitation (px/s)
  rElec   : 0,   // rayon d'un électron (px)
  rCation : 0,   // rayon d'un cation (px)
  accPerV : 0,   // accélération par volt (px/s²)

  // ── Isolant ──
  // atoms : un élément {ph, w} par site du réseau (phase et vitesse
  // angulaire de l'électron lié). isoA : déformation des orbites, isoV : sa
  // vitesse de variation (s⁻¹). rNucleus et isoR en pixels.
  atoms    : [],
  free     : [],   // semi-conducteur : électrons libres {x, y, vx, vy}
  hops     : [],   // sauts en cours {src, dst, sx, sy, ex, ey, t} (src/dst : -1 = extérieur)
  nbrs     : [],   // voisins de chaque site (indices)
  hopDx    : 0,    // déplacement cumulé des électrons liés qui sautent (px, signé)
  lastDt   : 0,    // dernier pas de temps simulé (s)
  reseed   : false,   // atomes reconstruits : refaire l'équilibre thermique
  isoA     : 0,
  isoV     : 0,
  isoI     : 0,    // part transitoire de l'intensité (mA), lissée
  semiVd   : 0,    // semi-conducteur : dérive moyenne des électrons libres
  semiI    : 0,    //   et dérive rapportée au nombre d'atomes (∝ intensité)
  rNucleus : 0,
  isoR     : 0,

  // ── Mesures lissées ──
  vdNorm : 0,   // vitesse de dérive / vitesse d'agitation (signée)
  I_mA   : 0,   // intensité affichée (mA, signée)
  vd_mm  : 0,   // vitesse de dérive affichée (mm/s, signée)

  // Demande de recalage de la mesure : toute commande qui change le régime
  // la pose, pour que l'afficheur reparte d'une moyenne neuve au lieu de
  // traîner l'ancien régime derrière lui.
  snapMeasure : true,
  measN       : 0,   // images accumulées depuis le dernier recalage

  needsRedraw : true
};

// ══════════════════════════════════════════════════════════════════════
//  Géométrie dérivée
//  Appelée par fil.js après chaque redimensionnement, une fois tx1…ty2
//  connus. Tout ce qui suit se déduit du pas du réseau.
// ══════════════════════════════════════════════════════════════════════

function updateGeometry() {
  var innerW = sim.tx2 - sim.tx1;
  var innerH = sim.ty2 - sim.ty1;
  if (innerW <= 0 || innerH <= 0) return;

  // Pas de référence : il fixe les rayons et le nombre de colonnes, et
  // reste volontairement indépendant de la marge aux parois, pour que
  // celle-ci ne déplace pas le calibrage du curseur de gêne.
  sim.ay = innerH / ROWS;

  // Nombre IMPAIR de colonnes : le réseau commence et finit alors par une
  // colonne à 3 ions, et reste symétrique d'un bout à l'autre du fil.
  sim.cols = Math.max(3, Math.round(innerW / (sim.ay * COL_RATIO)));
  if (sim.cols % 2 === 0) sim.cols += 1;
  sim.ax = innerW / sim.cols;

  var a = Math.min(sim.ax, sim.ay);   // pas de référence pour les rayons
  sim.rElec   = Math.max(0.75, a * RE_FRAC);
  sim.rCation = Math.max(2.5, a * GENE_STEPS[sim.geneIdx]);

  sim.vth     = VTH_FRAC * innerH;
  sim.accPerV = ACC_FRAC * innerH;

  sim.rNucleus = Math.max(2.5, a * ISO_RN_FRAC);
  sim.isoR     = ISO_R_FRAC * innerH;

  buildLattice();
  buildNeighbours();
  buildAtoms();

  // Le nombre d'électrons découle du réseau : autant de charges négatives
  // que le réseau porte de charges positives. Le fil est neutre par
  // construction, à toute taille de fenêtre.
  sim.nElec = sim.nSites;
}

// ── Positions des ions ─────────────────────────────────────────────────
// Colonnes alternées 3 / 2, décalées d'un demi-pas vertical : les ions
// d'une colonne à 2 se logent dans les creux de ses voisines à 3.
// Les décalages aléatoires ne sont retirés au sort que si le nombre de
// sites change ; un simple redimensionnement conserve donc le même réseau.
function buildLattice() {
  sim.nSites = Math.ceil(sim.cols / 2) * ROWS + Math.floor(sim.cols / 2) * (ROWS - 1);

  // Pas vertical RÉEL entre deux rangées d'une même colonne à 3. Il est
  // plus grand que le pas de référence sim.ay, puisque la marge aux parois
  // est resserrée et que la place gagnée revient au centre du fil.
  var innerH = sim.ty2 - sim.ty1;
  var yEdge  = EDGE_FRAC * innerH;
  sim.ayLat  = (innerH - 2 * yEdge) / (ROWS - 1);

  if (sim.latOff.length !== sim.nSites) {
    sim.latOff = [];
    for (var k = 0; k < sim.nSites; k++) {
      sim.latOff.push({
        ox : (Math.random() * 2 - 1) * LAT_JITTER,
        oy : (Math.random() * 2 - 1) * LAT_JITTER
      });
    }
  }

  sim.latCols = [];
  sim.lattice = [];
  var n = 0;

  for (var i = 0; i < sim.cols; i++) {
    var full = (i % 2 === 0);              // colonne à 3 ions
    var count = full ? ROWS : ROWS - 1;
    var col = [];

    for (var j = 0; j < count; j++) {
      // Colonne pleine : les ROWS rangées, de la marge haute à la marge
      // basse. Colonne creuse : ions à mi-chemin entre deux rangées, donc
      // décalés d'un demi-pas — c'est le quinconce.
      var yBase = full ? j : (j + 0.5);
      var o = sim.latOff[n++];
      var ion = {
        x : sim.tx1 + (i + 0.5 + o.ox) * sim.ax,
        y : sim.ty1 + yEdge + (yBase + o.oy) * sim.ayLat,
        k : n - 1,                     // indice du site (cf. sim.atoms)
        col : i                        // colonne du réseau
      };
      col.push(ion);
      sim.lattice.push(ion);
    }
    sim.latCols.push(col);
  }
}

// Voisins de chaque site : tous les sites à moins de SEMI_NBR_D hauteurs de fil.
// Dans le quinconce, cela donne les sites des deux colonnes adjacentes et
// ceux de la même colonne, pas ceux d'une colonne plus loin.
function buildNeighbours() {
  var innerH = sim.ty2 - sim.ty1;
  var dmax2  = (SEMI_NBR_D * innerH) * (SEMI_NBR_D * innerH);
  sim.nbrs = [];
  for (var i = 0; i < sim.lattice.length; i++) {
    var list = [];
    for (var j = 0; j < sim.lattice.length; j++) {
      if (i === j) continue;
      var dx = sim.lattice[i].x - sim.lattice[j].x, dy = sim.lattice[i].y - sim.lattice[j].y;
      if (dx * dx + dy * dy < dmax2) list.push(j);
    }
    sim.nbrs.push(list);
  }
}

// ── Atomes de l'isolant ────────────────────────────────────────────────
// Un électron lié par site : phase et sens de rotation tirés une fois, puis
// conservés tant que le nombre de sites ne change pas.
function buildAtoms() {
  if (sim.atoms.length === sim.nSites) return;
  sim.atoms = [];
  sim.free  = [];   // les ions repartent à zéro : plus d'électron libre
  sim.hops  = [];
  sim.reseed = true; // le redimensionnement les re-sème (cf. _doResize)
  for (var k = 0; k < sim.nSites; k++) {
    var turns = ISO_TURN_MIN + Math.random() * (ISO_TURN_MAX - ISO_TURN_MIN);
    sim.atoms.push({
      ph  : Math.random() * 2 * Math.PI,
      w   : 2 * Math.PI * turns,
      ion : false,     // semi-conducteur : l'atome a perdu son électron
      busy: false      // un saut le concerne : il ne prend part à aucun autre événement
    });
  }
}

// Déformation d'équilibre des orbites pour la tension imposée.
// U > 0 : l'électron est poussé vers la borne +, à gauche du fil, donc a < 0
// (rayon plus grand pour cos φ < 0).
function isoTarget() {
  return sim.circuitOn ? -ISO_K * sim.U_V : 0;
}

// Orbite déformée, relative au noyau : centre décalé de ox (négatif = vers
// la gauche, donc vers la borne + pour U > 0), demi-axes A (selon le fil) et
// B (perpendiculaire). B = R/√s garde à peu près la même aire à l'ellipse :
// elle s'allonge d'un côté et s'aplatit de l'autre.
function isoOrbit() {
  var s = 1 + Math.abs(sim.isoA) * ISO_STRETCH;
  return {
    ox : sim.isoA * ISO_SHIFT * sim.isoR,
    A  : sim.isoR * s,
    B  : sim.isoR / Math.sqrt(s)
  };
}

// Remet l'isolant au repos, à l'équilibre de la tension courante : un
// changement de matériau ne doit pas produire de faux courant.
function resetInsulator() {
  sim.isoA = isoTarget();
  sim.isoV = 0;
}

// ── Ion le plus proche d'un point ──────────────────────────────────────
// Le réseau n'est ni une grille carrée ni parfaitement régulier : on
// balaie la colonne qui contient le point et ses deux voisines, soit au
// plus neuf ions. L'ion le plus proche ne peut pas être plus loin —
// chaque colonne couvre toute la hauteur du fil. Le coût reste constant,
// aucune grille spatiale n'est nécessaire.
function nearestCation(x, y) {
  var i0 = Math.floor((x - sim.tx1) / sim.ax);
  var best = null, bestD = Infinity;

  for (var di = -1; di <= 1; di++) {
    var i = i0 + di;
    if (i < 0 || i >= sim.cols) continue;
    var col = sim.latCols[i];
    for (var k = 0; k < col.length; k++) {
      var c = col[k];
      var dx = x - c.x, dy = y - c.y;
      var d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = c; }
    }
  }

  // Point hors réseau (l'électron sort par une extrémité dans le même pas
  // de temps) : on rend un ion de la colonne de bord, pour que l'appelant
  // ait toujours une référence.
  if (best === null) {
    var ci = Math.min(Math.max(i0, 0), sim.cols - 1);
    best = sim.latCols[ci][0];
  }
  return best;
}

// ══════════════════════════════════════════════════════════════════════
//  Création et placement des électrons
// ══════════════════════════════════════════════════════════════════════

// Vitesse d'agitation : module fixé, direction aléatoire.
// vth : module imposé (la vitesse de référence par défaut).
function _thermalVelocity(e, vth) {
  var v  = vth || sim.vth;
  var th = Math.random() * 2 * Math.PI;
  e.vx = v * Math.cos(th);
  e.vy = v * Math.sin(th);
}

// Position libre : tirée au hasard dans le fil, hors de tout cation.
function _freePosition(e) {
  var rColl = sim.rCation + sim.rElec;
  for (var k = 0; k < 60; k++) {
    var x = sim.tx1 + sim.rElec + Math.random() * (sim.tx2 - sim.tx1 - 2 * sim.rElec);
    var y = sim.ty1 + sim.rElec + Math.random() * (sim.ty2 - sim.ty1 - 2 * sim.rElec);
    var c = nearestCation(x, y);
    var dx = x - c.x, dy = y - c.y;
    if (dx * dx + dy * dy > rColl * rColl) { e.x = x; e.y = y; return; }
  }
  // Repli (réseau très encombrant) : on pose l'électron au point le plus
  // éloigné des cations voisins — à l'aplomb d'une frontière de colonnes,
  // et à un quart de pas d'une rangée, donc à mi-chemin entre une rangée
  // d'une colonne à 3 et la rangée voisine d'une colonne à 2.
  e.x = sim.tx1 + sim.ax;
  e.y = sim.ty1 + EDGE_FRAC * (sim.ty2 - sim.ty1) + 0.25 * sim.ayLat;
}

function initElectrons() {
  sim.electrons = [];
  for (var i = 0; i < sim.nElec; i++) {
    var e = { x: 0, y: 0, vx: 0, vy: 0 };
    _freePosition(e);
    _thermalVelocity(e);
    sim.electrons.push(e);
  }
  clearTrace();
}

// Ajuste l'effectif sur sim.nElec sans réinitialiser les électrons déjà
// présents : un redimensionnement de la fenêtre fait varier le nombre de
// sites du réseau, donc le nombre d'électrons.
function syncElectronCount() {
  var n = sim.nElec;
  var list = sim.electrons;
  while (list.length > n) {
    list.pop();
    if (sim.tracedIdx >= list.length) clearTrace();
  }
  while (list.length < n) {
    var e = { x: 0, y: 0, vx: 0, vy: 0 };
    _freePosition(e);
    _thermalVelocity(e);
    list.push(e);
  }
  sim.needsRedraw = true;
}

// ── Report des électrons dans un fil redimensionné ─────────────────────
// On conserve leur position RELATIVE : le redimensionnement de la fenêtre
// ne doit pas rebattre les cartes de la simulation en cours.
function remapElectrons(ox1, oy1, ow, oh) {
  if (ow <= 0 || oh <= 0) return;
  var sx = (sim.tx2 - sim.tx1) / ow;
  var sy = (sim.ty2 - sim.ty1) / oh;
  var lists = [sim.electrons, sim.free];
  for (var L = 0; L < lists.length; L++) {
    for (var i = 0; i < lists[L].length; i++) {
      var e = lists[L][i];
      e.x = sim.tx1 + (e.x - ox1) * sx;
      e.y = sim.ty1 + (e.y - oy1) * sy;
      e.vx *= sx;
      e.vy *= sy;
    }
  }
  for (var k = 0; k < sim.trace.length; k++) {
    var p = sim.trace[k];
    p.x = sim.tx1 + (p.x - ox1) * sx;
    p.y = sim.ty1 + (p.y - oy1) * sy;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Électron suivi à la trace
// ══════════════════════════════════════════════════════════════════════

function clearTrace() {
  sim.tracedIdx = -1;
  sim.trace = [];
}

// Marque l'électron le plus proche du centre du fil : c'est celui qui
// restera le plus longtemps visible avant d'être réinjecté.
function traceCentralElectron() {
  var cx = (sim.tx1 + sim.tx2) / 2, cy = (sim.ty1 + sim.ty2) / 2;
  var best = -1, bestD = Infinity;
  for (var i = 0; i < sim.electrons.length; i++) {
    var e = sim.electrons[i];
    var d = (e.x - cx) * (e.x - cx) + (e.y - cy) * (e.y - cy);
    if (d < bestD) { bestD = d; best = i; }
  }
  sim.tracedIdx = best;
  sim.trace = [];
  if (best >= 0) {
    sim.trace.push({ x: sim.electrons[best].x, y: sim.electrons[best].y, b: true });
  }
  sim.needsRedraw = true;
}

function _pushTracePoint(e, isBreak) {
  sim.trace.push({ x: e.x, y: e.y, b: !!isBreak });
  if (sim.trace.length > TRACE_MAX) sim.trace.shift();
}

// ══════════════════════════════════════════════════════════════════════
//  Intégration physique
// ══════════════════════════════════════════════════════════════════════

// Accélération imposée aux électrons (px/s², selon x).
// Signe : une tension U > 0 crée un champ orienté vers la droite ; la
// charge de l'électron étant négative, la force qu'il subit est orientée
// vers la GAUCHE. Le courant conventionnel, lui, va vers la droite.
function fieldAcceleration() {
  if (!sim.circuitOn) return 0;
  return -sim.accPerV * sim.U_V;
}

// dtMs : pas de temps simulé, en millisecondes.
function stepPhysics(dtMs) {
  var dt = dtMs / 1000;
  if (dt <= 0) return;

  if (sim.material === 'isolant') { stepInsulator(dt); return; }
  if (sim.material === 'semi')    { stepSemi(dt);      return; }

  stepFreeElectrons(sim.electrons, dt, sim.rCation, sim.rElec, false);

  // ── Trace de l'électron suivi (un point par image) ──
  if (sim.tracedIdx >= 0 && sim.tracedIdx < sim.electrons.length) {
    _pushTracePoint(sim.electrons[sim.tracedIdx], false);
  }
}

// Avance une liste d'électrons libres pendant dt (s) : champ, vol libre,
// chocs sur les noyaux (rayon rNuc), parois, sortie et réinjection.
// rE : rayon de l'électron. capture : dans un semi-conducteur, force de la
// recapture (0 ou false : aucune) — un électron
// qui passe près d'un ion peut être recapturé et disparaît de la liste.
function stepFreeElectrons(list, dt, rNuc, rE, capture, vth, att) {
  var acc   = fieldAcceleration();
  var rColl = rNuc + rE;
  vth = vth || sim.vth;
  var vmax  = VMAX_FACTOR * vth;
  att = att || 0;
  var attH  = sim.ty2 - sim.ty1;
  var attD0 = SEMI_ATT_D0 * attH;

  // ── Sous-pas : un électron ne doit jamais franchir un cation en une
  //    seule avance, sinon il le traverserait sans choc.
  var nsub = Math.ceil((vmax * dt) / (0.35 * rColl));
  if (nsub < 1)  nsub = 1;
  if (nsub > 12) nsub = 12;
  var h = dt / nsub;

  var yMin = sim.ty1 + rE, yMax = sim.ty2 - rE;

  var rCap = rColl * SEMI_CAP_R;
  var pCap = 1 - Math.exp(-SEMI_CAP_RATE * (capture || 0) * h);

  for (var s = 0; s < nsub; s++) {
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.dead) continue;

      // ── Accélération par le champ, puis avance ──
      e.vx += acc * h;

      // Semi-conducteur : attraction par l'ion + le plus proche (1/d²,
      // adoucie à la distance de choc pour rester finie au contact).
      if (att > 0) {
        var bi = -1, bd2 = Infinity;
        for (var q = 0; q < sim.atoms.length; q++) {
          if (!sim.atoms[q].ion) continue;
          var qx = sim.lattice[q].x - e.x, qy = sim.lattice[q].y - e.y;
          var qd = qx * qx + qy * qy;
          if (qd < bd2) { bd2 = qd; bi = q; }
        }
        if (bi >= 0) {
          var dd = Math.sqrt(bd2);
          var dm = Math.max(dd, rColl);
          var shape = attD0 / dm;   // 1/d : loi de Coulomb dans un plan
          var ga = att * shape;      // px/s²
          e.vx += ga * (sim.lattice[bi].x - e.x) / dd * h;
          e.vy += ga * (sim.lattice[bi].y - e.y) / dd * h;
          var kd = Math.exp(-SEMI_ATT_DAMP * (att / attH) * shape * h);   // att/attH : sans dimension
          e.vx *= kd;
          e.vy *= kd;
        }
      }

      // Garde-fou : les chocs bornent déjà la vitesse, mais à gêne très
      // faible un vol libre peut durer longtemps.
      var v2 = e.vx * e.vx + e.vy * e.vy;
      if (v2 > vmax * vmax) {
        var f = vmax / Math.sqrt(v2);
        e.vx *= f; e.vy *= f;
      }

      e.x += e.vx * h;
      e.y += e.vy * h;

      // ── Parois haute et basse du fil : rebond élastique ──
      if (e.y < yMin)      { e.y = yMin; e.vy =  Math.abs(e.vy); }
      else if (e.y > yMax) { e.y = yMax; e.vy = -Math.abs(e.vy); }

      // ── Choc sur un cation du réseau ──
      var c  = nearestCation(e.x, e.y);
      var dx = e.x - c.x, dy = e.y - c.y;
      var d2 = dx * dx + dy * dy;

      // Semi-conducteur : près d'un ion, l'électron peut être recapturé.
      if (capture && d2 < rCap * rCap && sim.atoms[c.k].ion && !sim.atoms[c.k].busy && Math.random() < pCap) {
        sim.atoms[c.k].ion = false;
        e.dead = true;
        continue;
      }

      if (d2 < rColl * rColl) {
        var d = Math.sqrt(d2);
        var nx, ny;
        if (d < 1e-6) { nx = 1; ny = 0; }        // pile au centre : direction arbitraire
        else          { nx = dx / d; ny = dy / d; }

        // Remise à la surface du cation
        e.x = c.x + nx * rColl;
        e.y = c.y + ny * rColl;

        // Redistribution complète de la direction, module ramené à la
        // vitesse d'agitation : c'est ici que l'énergie gagnée sur le
        // champ est cédée au réseau (effet Joule).
        _thermalVelocity(e, vth);
        // …mais la nouvelle direction doit s'éloigner du cation, sinon
        // l'électron y replonge et reste collé.
        if (e.vx * nx + e.vy * ny < 0) { e.vx = -e.vx; e.vy = -e.vy; }
      }

      // ── Extrémités du fil : sortie et réinjection ──
      // L'électron qui sort est remplacé à l'instant même par un autre qui
      // entre par l'extrémité opposée : le nombre de charges négatives
      // dans le fil ne varie jamais, le milieu reste neutre.
      // L'électron suivi n'est plus le même une fois réinjecté à l'autre
      // bout : on abandonne le suivi plutôt que de raccorder deux trajets.
      var isTraced = (list === sim.electrons && i === sim.tracedIdx);
      if (e.x > sim.tx2 - rE) {
        e.x = sim.tx1 + rE;
        e.y = yMin + Math.random() * (yMax - yMin);
        if (isTraced) clearTrace();
      } else if (e.x < sim.tx1 + rE) {
        e.x = sim.tx2 - rE;
        e.y = yMin + Math.random() * (yMax - yMin);
        if (isTraced) clearTrace();
      }
    }
  }

  // Électrons recapturés : retirés de la liste, en place.
  if (capture) {
    var w = 0;
    for (var j = 0; j < list.length; j++) {
      if (!list[j].dead) list[w++] = list[j];
    }
    list.length = w;
  }
}

// Position de l'électron lié de l'atome k (sur son orbite déformée).
function boundPosition(k) {
  var o = isoOrbit(), c = sim.lattice[k], ph = sim.atoms[k].ph;
  return { x: c.x + o.ox + o.A * Math.cos(ph), y: c.y + o.B * Math.sin(ph) };
}

// Vitesse d'agitation des électrons libres au cran de température courant.
function semiVth() {
  return sim.vth * SEMI_VTH[sim.tempIdx];
}

// Change le cran de température. Les électrons libres en vol gardent sinon
// leur ancienne vitesse jusqu'au choc suivant : on la rééchelonne tout de
// suite, pour que l'effet du curseur se voie immédiatement.
function setTemperature(idx) {
  var k = SEMI_VTH[idx] / SEMI_VTH[sim.tempIdx];
  sim.tempIdx = idx;
  for (var i = 0; i < sim.free.length; i++) {
    sim.free[i].vx *= k;
    sim.free[i].vy *= k;
  }
}

// Point de l'orbite de l'atome k au paramètre t.
function orbitPoint(k, t) {
  var o = isoOrbit(), c = sim.lattice[k];
  return { x: c.x + o.ox + o.A * Math.cos(t), y: c.y + o.B * Math.sin(t) };
}

// Paramètre t du point de l'orbite qui se trouve dans la direction alpha vue
// du noyau (l'orbite est une ellipse décentrée : on résout l'intersection
// avec la demi-droite issue du noyau).
function orbitPhaseFacing(alpha) {
  var o = isoOrbit(), ca = Math.cos(alpha), sa = Math.sin(alpha);
  var Rr    = Math.sqrt(o.A * sa * o.A * sa + o.B * ca * o.B * ca);
  var delta = Math.atan2(o.B * ca, o.A * sa);
  var arg   = Math.max(-1, Math.min(1, -o.ox * sa / Rr));
  var base  = Math.acos(arg);
  var t1 = -delta + base, t2 = -delta - base;
  // Des deux solutions, celle qui est du côté de alpha (l'autre est à l'opposé).
  var x1 = o.ox + o.A * Math.cos(t1), y1 = o.B * Math.sin(t1);
  return (x1 * ca + y1 * sa > 0) ? t1 : t2;
}

// L'électron de l'atome k est-il du côté de son orbite qui regarde la
// direction (tx, ty), vue du noyau ?
function facing(k, tx, ty) {
  var p = boundPosition(k), c = sim.lattice[k];
  var vx = p.x - c.x, vy = p.y - c.y;
  return vx * tx + vy * ty >= SEMI_FACE_COS * Math.sqrt(vx * vx + vy * vy) * Math.sqrt(tx * tx + ty * ty);
}

// Ionise l'atome k : son électron quitte l'orbite et devient libre, avec une
// vitesse d'agitation dirigée en s'éloignant du noyau.
function ionise(k) {
  var at = sim.atoms[k];
  var p  = boundPosition(k);
  var e  = { x: p.x, y: p.y, vx: 0, vy: 0 };
  _thermalVelocity(e, semiVth());
  var c = sim.lattice[k];
  if (e.vx * (p.x - c.x) + e.vy * (p.y - c.y) < 0) { e.vx = -e.vx; e.vy = -e.vy; }
  at.ion = true;
  sim.free.push(e);
}

// Part des atomes ionisés choisie au hasard parmi les atomes neutres, pour
// partir de l'équilibre : appelé à l'entrée dans le mode semi-conducteur.
function seedSemi() {
  sim.free = [];
  sim.hops = [];
  for (var k = 0; k < sim.atoms.length; k++) { sim.atoms[k].ion = false; sim.atoms[k].busy = false; }
  var n = Math.round(SEMI_F_EQ[sim.tempIdx] * sim.atoms.length);
  for (var i = 0; i < n; i++) {
    var k2;
    do { k2 = Math.floor(Math.random() * sim.atoms.length); } while (sim.atoms[k2].ion);
    ionise(k2);
  }
}

// Poids d'un saut dont l'électron se déplace de delta pas du réseau selon x.
function hopWeight(delta) {
  var U = sim.circuitOn ? sim.U_V : 0;
  return Math.exp(-SEMI_HOP_BIAS * U * delta);
}

// Côté du morceau de fil où le site touche l'extérieur : -1 (gauche), +1
// (droite), 0 s'il est à l'intérieur.
function edgeSide(k) {
  var col = sim.lattice[k].col;
  if (col === 0) return -1;
  if (col === sim.cols - 1) return 1;
  return 0;
}

// Fait avancer les sauts en cours, puis tire les nouveaux.
function stepHops(dt) {
  var h, hp;
  for (h = sim.hops.length - 1; h >= 0; h--) {
    hp = sim.hops[h];
    hp.t += dt / SEMI_HOP_T;
    if (hp.t >= 1) {
      if (hp.dst >= 0) {
        // L'électron entre sur l'orbite du côté d'où il vient, puis la parcourt.
        sim.atoms[hp.dst].ph = orbitPhaseFacing(hp.alpha);
        sim.atoms[hp.dst].ion = false;
        sim.atoms[hp.dst].busy = false;
      }
      if (hp.src >= 0) sim.atoms[hp.src].busy = false;
      sim.hops.splice(h, 1);
    }
  }

  var lam = SEMI_HOP[sim.tempIdx];
  var N = sim.atoms.length, ax = sim.ax;
  var k, j, c, cj;

  for (k = 0; k < N; k++) {
    var at = sim.atoms[k];
    if (at.busy) continue;
    c = sim.lattice[k];
    var side = edgeSide(k), nb = sim.nbrs[k];
    var cand = [], rates = [], R = 0, W = 0, w;

    if (!at.ion) continue;   // seul un ion peut recevoir un électron

    // Ion : il peut recevoir l'électron d'un voisin neutre, ou de l'extérieur.
    var opp = -1;   // atome neutre de la colonne de bord opposée, prêt à céder
    for (j = 0; j < nb.length; j++) {
      cj = sim.lattice[nb[j]];
      w = hopWeight((c.x - cj.x) / ax);
      W += w;
      var aj = sim.atoms[nb[j]];
      if (!aj.ion && !aj.busy && facing(nb[j], c.x - cj.x, c.y - cj.y)) {
        cand.push(nb[j]); rates.push(lam * w * SEMI_FACE_BOOST); R += lam * w * SEMI_FACE_BOOST;
      }
    }
    if (side !== 0) {
      w = hopWeight(-side);
      W += w;
      // La lacune ne peut sortir que si l'autre bout peut en accueillir une.
      var oppCol = (side < 0) ? sim.cols - 1 : 0, free = [];
      for (j = 0; j < N; j++) {
        if (sim.lattice[j].col === oppCol && !sim.atoms[j].ion && !sim.atoms[j].busy &&
            facing(j, -side, 0)) free.push(j);
      }
      if (free.length > 0) {
        opp = free[Math.floor(Math.random() * free.length)];
        cand.push(-1); rates.push(lam * w); R += lam * w;
      }
    }
    if (cand.length === 0 || W <= 0) continue;

    // Un événement se produit pendant dt avec la probabilité 1 − exp(−R·dt/W).
    R /= W;
    if (Math.random() >= 1 - Math.exp(-R * dt)) continue;

    // Choix du saut, proportionnel aux taux.
    var pick = Math.random() * (R * W), acc = 0, q = 0;
    for (q = 0; q < cand.length; q++) { acc += rates[q]; if (pick < acc) break; }
    if (q >= cand.length) q = cand.length - 1;
    var other = cand[q], p0;

    // L'ion k reçoit un électron.
    at.busy = true;
    if (other >= 0) {
      p0 = boundPosition(other);
      sim.atoms[other].ion = true;
      sim.atoms[other].busy = true;
      sim.hopDx += c.x - sim.lattice[other].x;
      sim.hops.push({ src: other, dst: k, sx: p0.x, sy: p0.y, ex: 0, ey: 0, t: 0,
                      alpha: Math.atan2(sim.lattice[other].y - c.y, sim.lattice[other].x - c.x) });
    } else {
      // De l'extérieur : l'électron entre par le bord, et un électron sort
      // par le bord opposé, d'un atome qui devient ion.
      var co = sim.lattice[opp];
      var pe = boundPosition(opp);
      sim.hopDx += -side * ax;
      sim.hops.push({ src: -1, dst: k, sx: c.x + side * ax, sy: c.y, ex: 0, ey: 0, t: 0,
                      alpha: side > 0 ? 0 : Math.PI });
      sim.atoms[opp].ion = true;
      sim.atoms[opp].busy = true;
      sim.hopDx += -side * ax;
      sim.hops.push({ src: opp, dst: -1, sx: pe.x, sy: pe.y, ex: co.x - side * ax, ey: co.y, t: 0, alpha: 0 });
    }
  }
}

// Position de l'électron en vol d'un saut : il va de son point de départ au
// point d'entrée sur l'orbite de l'atome d'arrivée, du côté d'où il vient —
// il ne traverse jamais le noyau.
function hopPosition(hp) {
  var s = hp.t > 1 ? 1 : hp.t;
  s = s * s * (3 - 2 * s);
  var tx = hp.ex, ty = hp.ey;
  if (hp.dst >= 0) { var p = orbitPoint(hp.dst, orbitPhaseFacing(hp.alpha)); tx = p.x; ty = p.y; }
  return { x: hp.sx + (tx - hp.sx) * s, y: hp.sy + (ty - hp.sy) * s };
}

// Semi-conducteur : orbites des atomes neutres (déformées par le champ),
// ionisation thermique, puis mouvement des électrons libres.
function stepSemi(dt) {
  stepInsulator(dt, SEMI_VTH[sim.tempIdx]);
  sim.lastDt = dt;
  stepHops(dt);

  var nNeutral = 0;
  for (var k = 0; k < sim.atoms.length; k++) if (!sim.atoms[k].ion) nNeutral++;

  // Nombre d'ionisations attendues pendant dt : partie entière certaine,
  // reste tiré au sort.
  var ev = SEMI_NU[sim.tempIdx] * nNeutral * dt;
  while (ev > 0 && nNeutral > 0) {
    if (Math.random() < Math.min(1, ev)) {
      var kk;
      do { kk = Math.floor(Math.random() * sim.atoms.length); } while (sim.atoms[kk].ion);
      ionise(kk);
      nNeutral--;
    }
    ev -= 1;
  }

  stepFreeElectrons(sim.free, dt, sim.rNucleus, sim.rElec, SEMI_CAP[sim.tempIdx],
                    semiVth(), SEMI_ATT[sim.tempIdx] * (sim.ty2 - sim.ty1));
}

// Isolant : la déformation a rejoint sa valeur d'équilibre selon un
// oscillateur amorti, et chaque électron avance sur son orbite.
// dt en secondes. Sous-pas de 5 ms au plus, pour que l'intégration reste
// stable même à la vitesse d'animation maximale.
function stepInsulator(dt, speed) {
  var aeq = isoTarget();
  var n = Math.max(1, Math.ceil(dt / 0.005));
  var h = dt / n;
  for (var s = 0; s < n; s++) {
    var acc = ISO_OMEGA * ISO_OMEGA * (aeq - sim.isoA) - 2 * ISO_ZETA * ISO_OMEGA * sim.isoV;
    sim.isoV += acc * h;
    sim.isoA += sim.isoV * h;
  }
  for (var i = 0; i < sim.atoms.length; i++) {
    sim.atoms[i].ph += sim.atoms[i].w * dt * (speed || 1);
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Mesures
//  La vitesse de dérive est la moyenne des vitesses selon x. Sans
//  générateur elle oscille autour de zéro : c'est exactement le point de
//  cours que la page doit rendre visible.
// ══════════════════════════════════════════════════════════════════════

function updateMeasures(dtRealMs) {
  // Isolant : aucun électron ne dérive. L'intensité n'est non nulle que
  // pendant la déformation des orbites — un électron poussé vers la borne +
  // équivaut à un courant conventionnel de sens opposé.
  if (sim.material !== 'conducteur') {
    var rawI = -K_ISO * sim.isoV;
    sim.isoI += (rawI - sim.isoI) * (1 - Math.exp(-dtRealMs / ISO_I_TAU));
  }
  if (sim.material === 'isolant') {
    sim.I_mA   = sim.isoI;
    sim.vdNorm = 0;
    sim.vd_mm  = 0;
    return;
  }
  if (sim.material === 'semi') { _measureSemi(dtRealMs); return; }

  var n = sim.electrons.length;
  var raw = 0;
  if (n > 0 && sim.vth > 0) {
    var sum = 0;
    for (var i = 0; i < n; i++) sum += sim.electrons[i].vx;
    raw = (sum / n) / sim.vth;
  }

  if (sim.snapMeasure) {
    sim.measN = 0;
    sim.vdNorm = 0;
    sim.snapMeasure = false;
  }
  sim.measN++;

  // Coefficient exponentiel : constante de temps fixe, donc indépendante du
  // taux de rafraîchissement de l'écran.
  var alphaEma = 1 - Math.exp(-dtRealMs / MEASURE_TAU);
  // Coefficient de la moyenne courante depuis le dernier recalage. Il vaut
  // 1 à la première image (l'afficheur prend aussitôt la valeur mesurée),
  // puis décroît en 1/n. On garde le plus GRAND des deux : la moyenne
  // courante mène la danse au début, l'exponentielle prend le relais dès
  // qu'elle devient la plus lente — c'est-à-dire au bout de MEASURE_TAU.
  var alpha = Math.max(1 / sim.measN, alphaEma);
  sim.vdNorm += (raw - sim.vdNorm) * alpha;

  sim.vd_mm = sim.vdNorm * VD_MM_PER_NORM;
  // L'intensité est comptée positive dans le sens conventionnel, donc à
  // l'opposé du déplacement des électrons. Elle suit la densité de
  // porteurs, et non l'effectif affiché, qui ne dépend que de la longueur
  // de fil montrée à l'écran.
  sim.I_mA  = -K_I * sim.vdNorm;
}

// Semi-conducteur : deux composantes. La dérive des électrons libres, lissée
// longuement comme dans le conducteur, et le bref courant des orbites qui se
// déforment (isoI). Le courant permanent est rapporté au nombre d'ATOMES et
// non d'électrons libres : il croît donc avec le nombre de porteurs.
function _measureSemi(dtRealMs) {
  var nf = sim.free.length, sum = 0;
  for (var i = 0; i < nf; i++) sum += sim.free[i].vx;
  var rawVd = (nf > 0 && sim.vth > 0) ? (sum / nf) / sim.vth : 0;
  // Les électrons liés qui sautent d'un atome à l'autre portent aussi le
  // courant : leur déplacement cumulé, rapporté au temps simulé écoulé.
  var hopV = sim.hopDx / Math.max(sim.lastDt, 1e-6);
  sim.hopDx = 0;
  var rawI  = (sim.nSites > 0 && sim.vth > 0) ? ((sum + hopV) / sim.nSites) / sim.vth : 0;

  if (sim.snapMeasure) {
    sim.measN = 0;
    sim.semiVd = 0;
    sim.semiI  = 0;
    sim.snapMeasure = false;
  }
  sim.measN++;
  var alpha = Math.max(1 / sim.measN, 1 - Math.exp(-dtRealMs / MEASURE_TAU));
  sim.semiVd += (rawVd - sim.semiVd) * alpha;
  sim.semiI  += (rawI  - sim.semiI)  * alpha;

  var on = sim.circuitOn && sim.U_V !== 0;   // circuit ouvert : pas de dérive
  sim.vdNorm = on ? sim.semiVd : 0;
  sim.vd_mm  = sim.vdNorm * VD_MM_PER_NORM * SEMI_CAL;
  sim.I_mA   = (on ? -K_I * SEMI_CAL * sim.semiI : 0) + sim.isoI;
}

// ══════════════════════════════════════════════════════════════════════
//  Réinitialisation
// ══════════════════════════════════════════════════════════════════════

function resetSim() {
  sim.U_V         = 6;
  sim.circuitOn   = false;
  sim.geneIdx     = GENE_DEFAULT;
  sim.material    = 'conducteur';
  sim.tempIdx     = TEMP_DEFAULT;
  sim.free        = [];
  sim.hops        = [];
  for (var q = 0; q < sim.atoms.length; q++) { sim.atoms[q].ion = false; sim.atoms[q].busy = false; }
  sim.isoI        = 0;
  sim.semiVd      = 0;
  sim.semiI       = 0;
  resetInsulator();
  sim.paused      = false;
  sim.speedFactor = 1;
  sim.vdNorm      = 0;
  sim.I_mA        = 0;
  sim.vd_mm       = 0;
  sim.snapMeasure = true;
  sim.measN       = 0;

  updateGeometry();
  initElectrons();
  if (typeof syncUIToSim === 'function') syncUIToSim();
  sim.needsRedraw = true;
}
