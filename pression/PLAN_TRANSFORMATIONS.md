# Plan — onglet « Transformations » de la page Gaz parfait

> Document de planification. À relire avant chaque palier ; à fondre dans
> `ARCHITECTURE.md` une fois l'onglet terminé.
>
> **Révision après le palier 2** : l'onglet s'organise désormais en **deux familles de
> transformations**, à pression imposée et à volume imposé (§2.3). Le curseur « Vitesse du
> son » est abandonné : il tordait la physique pour montrer, sur la masse posée, une
> inhomogénéité que ce dispositif ne produit pas (§2.3).
>
> **Révision après le palier 5 : refonte de l'interface (§10).** Le but de l'onglet est
> de se promener dans le diagramme de Clapeyron en enchaînant des transformations. Les
> deux familles ne sont plus deux modes exclusifs (en changer réinitialisait) : le piston
> est **tenu** ou **libre**, on passe de l'un à l'autre à tout moment, et une carte unique
> « Transformation » remplace les cinq façons de lancer une action. Le §10 fait foi là où
> il contredit les §2.6, §2.7 et §5.
>
> **Palier 7 fait** (diagramme T(S), sections Bilan et Gaz) : le prochain palier est R4 (§10.4).
>
> **Révision après R3** : piston-membrane de 1 g (§0, §1), conduction implicite et mode quasi
> statique du moteur, équilibre exigeant T_gaz = T_source si le fond conduit (§2.4), chemin PV
> tracé dès que la pression du gaz est définie (§4.2). Le §10 fait foi pour l'interface ; les
> prochains paliers sont au §10.4.

---

## 0. Décisions prises

| Sujet | Décision |
|---|---|
| Emplacement | 2ᵉ onglet de `pression/` (le dossier garde son nom ; seuls les titres visibles deviennent « Gaz parfait ») |
| Niveau | **CPGE** — première carte de ce niveau sur le site, assumé |
| Gaz | Air diatomique par défaut (γ = 1,40), γ réglable par l'utilisateur |
| Moteur physique | **Gaz découpé en tranches horizontales** (modèle 1D lagrangien), pas de dynamique moléculaire |
| **Deux familles** | **Pression imposée** (masse posée, sable, P_air) : le *système* est hors équilibre, le gaz reste quasi uniforme. **Volume imposé** (le piston est mené à un nouveau volume en une durée τ réglable) : le *gaz lui-même* devient inhomogène si τ est court devant L/c (§2.3) |
| Molécules | Oui, **pilotées par le modèle** : elles montrent ce que fait le gaz (densité, agitation thermique, mouvement d'ensemble, ondes) tranche par tranche ; ce ne sont pas elles qui calculent la pression (§3) |
| Grandeurs | **Réalistes** (SI, pression atmosphérique incluse, masses en kg) |
| Célérité du son | **Toujours réelle.** Plus de curseur « Vitesse du son » : les fronts se voient dans la famille à volume imposé, avec le seul ralenti |
| Ralenti | Jusqu'à ×1/5000 pour regarder un front traverser le gaz (≈ 1 ms en réalité) |
| Disposition | **Colonne de gauche** (celle du tableau actuel) : les graphes en haut, le tableau des valeurs en dessous ; scène à droite, contre le panneau (§4) |
| Contraintes extérieures | **Pression de l'air au-dessus du piston** et **température extérieure** réglables, chacune en échelon (brutal) ou en rampe (pas à pas) ; masses et sable restent disponibles (§2.6) |
| Taille du cylindre | 30 cm de gaz au départ, comme au palier 1 : l'agrandir ne change presque rien (§1) |
| Masse du piston (R3) | **~1 g, une membrane plus légère que le gaz** (0,76 g), au lieu de 1 kg : un échelon de P_air rend alors la pression du gaz non définie ; la masse posée (en kg) reste l'exemple du gaz uniforme (§10.5) |

---

## 1. Dispositif et ordres de grandeur

Cylindre vertical fermé par un piston mobile sans frottement ; au-dessus, l'air d'une **enceinte** dont on règle la pression P_air (atmosphère par défaut, cf. §2.6). Dans la famille à volume imposé, la tige du piston est menée par un **vérin** (§2.7).

| Grandeur | Valeur | Commentaire |
|---|---|---|
| Section S | 20 cm² (Ø ≈ 5 cm) | Petite section : quelques dizaines de kg suffisent à doubler ou tripler la pression |
| Hauteur initiale | 30 cm → V₀ = 0,60 L | |
| Masse du piston | **1 g** (membrane, depuis R3 ; 1 kg avant) | plus léger que le gaz (0,76 g) : un échelon de P_air rend la pression non définie (§10.5) |
| P_air (au-dessus du piston) | 1,013·10⁵ Pa par défaut, réglable de 0 (vide) à 5·10⁵ Pa | |
| T₀ | 293 K (20 °C) | |
| P_ext | P_air + (M + m)·g/S | P₀ = P_ext initiale = 1,0133·10⁵ Pa (1,062·10⁵ Pa avec le piston de 1 kg) |
| n | ≈ 0,026 mol (calculée, non réglée) | |
| Masses « brutales » | 10 / 20 / 40 kg au choix | |
| Grain de sable | 5 à 100 g (curseur), défaut 50 g | 50 g ↔ ΔP ≈ 245 Pa |
| Traversée du gaz par le son | L/c ≈ 0,9 ms | Temps de mise en équilibre mécanique du gaz |
| Volume imposé : durée τ | 2 ms à 60 s (curseur logarithmique) | Descendre sous 2 ms demande un schéma plus robuste (§9) |

**Pourquoi S = 20 cm² ?** Avec une section de 100 cm², même 50 kg ne font passer P que de 1,03 à 1,52·10⁵ Pa, et les états finaux irréversible / réversible ne diffèrent que de 1 % : rien de visible sur le diagramme PV. À 20 cm², les écarts deviennent nets (calculs Python, γ = 1,4, calorifugé) :

| Masse ajoutée | P_ext / P₀ | Brutal : T_f, V_f | Réversible (Laplace) : T_f, V_f | Isotherme : V_f | Période d'oscillation du piston |
|---|---|---|---|---|---|
| 10 kg | 1,46 | 332 K, 0,465 L | 327 K, 0,457 L | 0,410 L | 0,48 s |
| 20 kg | 1,92 | 370 K, 0,394 L | 353 K, 0,376 L | 0,312 L | 0,53 s |
| 40 kg | 2,85 | 448 K, 0,322 L | 395 K, 0,284 L | 0,211 L | 0,55 s |

Ces valeurs (calculées avec le piston de 1 kg, P₀ = 106,2 kPa) ont servi de **cibles de validation** (§7). Avec la membrane, P₀ = 101,33 kPa et les cibles changent un peu : 20 kg brutaux, calorifugé → 374,24 K, 0,3892 L (formule brutale exacte au banc) ; sable continu → loi de Laplace, 355,72 K (ARCHITECTURE.md, tests R3).

**Pourquoi ne pas agrandir le cylindre ?** Les rapports qui décident du hors-équilibre ne dépendent presque pas de la taille :
- la section S n'intervient dans aucun (modèle 1D) ; elle ne fixe que la masse nécessaire pour une pression donnée ;
- pour la masse posée, le piston est c/√(g·L) fois plus lent que le son (§2.3) : passer de 30 cm à 3 m ne ramènerait ce rapport que de 170 à 55, toujours un gaz uniforme ;
- pour le volume imposé, les équations de la mécanique des gaz n'ont pas d'échelle propre : seul compte le rapport τ / (L/c). Un cylindre plus haut allonge L/c (3 m → 9 ms), donc les durées, sans rien montrer de plus ;
- la mise en équilibre thermique, elle, s'allongerait comme L² : des attentes plus longues pour rien.

Le dessin, mis à l'échelle de la scène, serait d'ailleurs le même. Le réglage V₀ de la section Gaz (§5) suffit à qui veut essayer.

---

## 2. Modèle physique

### 2.1 Gaz en tranches (lagrangien 1D)

- **N = 80 tranches** de même masse (30 aux paliers 1 et 2 : trop peu pour un front net) ; chaque tranche porte sa masse volumique, son énergie interne massique e, sa pression P = (γ − 1)·ρ·e et sa température T = P/(ρ·r).
- Interfaces entre tranches : position z et vitesse u (grille décalée). L'interface du bas est le fond (fixe), celle du haut est le **piston**.
- Équations : conservation de la quantité de mouvement par tranche, puis de l'énergie (de = −(P + q)·dv + conduction).
- **Viscosité artificielle q** (type von Neumann–Richtmyer + terme linéaire) : elle amortit les ondes, donne aux fronts une épaisseur de quelques tranches et **dissipe dans le gaz** (c'est elle qui crée l'entropie d'un front de compression, §2.7).
- Piston, selon la famille (§2.7) :
  - **pression imposée** : (M + m_ajoutée)·a = (P_tranche_haute − P_air)·S − (M + m)·g. Loquet = vitesse du piston forcée à 0 ;
  - **volume imposé** : vitesse du piston imposée par le vérin, aucune équation du mouvement.
- P_air variable : le bilan d'énergie de contrôle (`tfEnergieTotale`) remplace le terme P_atm·S·z par le travail cumulé de l'enceinte, W_air = −∫P_air·S·dz. Volume imposé : il ajoute le travail du vérin, W_op = −∫P_face·S·dz.
- Pesanteur dans le gaz : négligée (ρgh ≈ 4 Pa, sans intérêt ici).
- Schéma explicite saute-mouton, sous-pas imposés par la condition CFL (dt < dz/c) et par la stabilité de la conduction. Coût : 80 tranches × quelques centaines de sous-pas par image, très en deçà de l'onglet molécules.

### 2.2 Échanges thermiques

- La chaleur entre **par le fond** du cylindre, posé sur la source (four ou bain). Les parois latérales et le piston sont isolés. Ce choix crée un vrai gradient de T le long du cylindre, donc un état visiblement non uniforme.
- Flux au fond : Φ = G·(T_ext − T_tranche_basse), où G est la conductance de la paroi du fond (curseur **Isolation**, de « calorifugé » G = 0 à « diathermane »).
- Dans le gaz : conduction entre tranches avec une **diffusivité effective** (elle englobe la convection, non modélisée). La valeur moléculaire de l'air (2·10⁻⁵ m²/s) donnerait un temps de mise en équilibre d'une demi-heure. Cible : 10 à 30 s (τ_th ≈ 15 s).
- Isolation et échelon de T_ext sont **communs aux deux familles**.

### 2.3 Ce que chaque famille montre (à dire dans le bandeau Informations)

**La masse posée ne rend pas le gaz inhomogène.** Pour comprimer notablement le gaz, il faut une masse M ≈ ΔP·S/g ; le gaz pèse ρ·S·L. Avec ΔP ≈ P :

  M / m_gaz ≈ P / (ρ·g·L) = c² / (γ·g·L) ≈ 2,9·10⁴

Section, pression et masse s'éliminent : le piston chargé met c/√(g·L) ≈ 170 fois plus de temps à bouger que le son à traverser le gaz, qui garde une pression uniforme. Baisser P_air n'y change rien (le gaz s'allège d'autant), donner une vitesse initiale à la masse non plus (pour un saut de pression de 10 %, il faut ~25 m/s, soit 6 kJ d'énergie cinétique contre 150 J d'énergie interne : on écrase le gaz). Il faudrait une colonne de ~12 km, l'échelle de hauteur de l'atmosphère. **Depuis R3 (membrane de 1 g)**, ce raisonnement ne vaut plus que pour la **masse posée** : un échelon de P_air sur la membrane nue lance un vrai front de compression (Pmax/Pmin = 1,50 mesuré), l'écart de pression dans le gaz valant environ ΔP × (masse du gaz / masse du piston).

Message pour la **famille à pression imposée** : lors d'une transformation brutale, c'est le **système {gaz + piston}** qui est hors équilibre. Le piston oscille, P_gaz ≠ P_ext, l'état du système n'est pas un point du diagramme PV, et le travail se calcule avec P_ext, toujours définie. Le gaz, lui, reste presque uniforme ; c'est la thermique (échanges par le fond, dissipation sous le piston) qui le rend inhomogène.

Message pour la **famille à volume imposé** : quand le volume change en une durée τ courte devant L/c ≈ 0,9 ms, le gaz n'a pas le temps de s'uniformiser. Un front part du piston, le gaz est comprimé et chauffé près de lui alors que le fond n'a encore rien senti : P et T ne sont pas définies. Estimations Python (compression 30 → 15 cm, calorifugé, 100 tranches, à vérifier au palier 3) :

| τ | Pmax/Pmin pendant la compression | Écart de T entre tranches | T finale (Laplace : 386,8 K) |
|---|---|---|---|
| 2 ms | 2,2 | 83 K | 390,2 K |
| 3 ms | 1,33 | 28 K | 387,2 K |
| 10 ms | 1,02 | 1,5 K | 386,8 K |
| ≥ 100 ms | 1,000 | 0 K | 386,8 K |

Ces écarts se voient **sans loupe**, avec la célérité réelle et le seul ralenti.

**Choix retenus :**
1. **Célérité réelle**, toujours. Le curseur « Vitesse du son » (palier 2 bis) est retiré.
2. **Ralenti extrême** (curseur Vitesse jusqu'à ×1/5000, §5) : un front qui traverse le gaz en 0,9 ms dure ~4,5 s à l'écran.
3. **Échanges thermiques accélérés** (diffusivité effective, cf. 2.2) : seul compromis permanent.
4. Le **temps affiché** est le temps simulé, en ms aux crans de ralenti extrême, en s sinon.
5. **Dissipation près du piston** (famille à pression imposée) : la chaleur de l'amortissement du piston est déposée surtout sous le piston ; une compression brutale y laisse une couche chaude qui s'uniformise par conduction.

**Amortissement du piston (pression imposée).** Fraction fixe de l'amortissement critique, piston amorti en 3 à 5 oscillations. Dans la réalité, il vient surtout de la turbulence, des échanges thermiques avec les parois et des frottements : la phrase du bandeau Informations le dit, sans entrer dans la modélisation.

### 2.4 Critère « grandeurs définies »

Deux niveaux, puisque le gaz peut être quasi uniforme alors que le système ne l'est pas (§2.3) :

- **Grandeurs du gaz définies** (pilote les « ? » de P et T) :
  - P définie si l'écart relatif max entre tranches < 0,1 % ;
  - T définie si l'écart max entre tranches < 0,5 K.
- **Système à l'équilibre** (pilote le badge « À l'équilibre / Hors équilibre », les points d'équilibre du diagramme PV, l'arrivée des étapes du journal et le chrono figé) : P et T définies **et** gaz et piston au repos (énergie cinétique macroscopique < 10⁻⁴ de l'énergie interne ; piston tenu : vérin arrêté) **et**, piston libre, P_gaz = P_ext à 0,1 % près **et**, si le fond conduit, |T_gaz − T_source| < 0,5 K (ajouté après R3 : un gaz uniforme qui chauffait lentement à travers un fond peu conducteur passait sinon pour « à l'équilibre »).

Ainsi, pendant les oscillations du piston chargé, P du gaz s'affiche mais le badge reste « Hors équilibre » ; pendant une compression rapide à volume imposé, P et T passent à « ? ». Seuils à régler à l'usage.

### 2.5 γ réglable

- Section repliable **Gaz** : boutons Monoatomique (5/3), Diatomique (7/5, défaut), Polyatomique (4/3), plus un curseur libre 1,05 à 1,67.
- Cv = R/(γ − 1). Changer γ **réinitialise l'expérience** : changer de gaz en cours de route n'a pas de sens physique.

### 2.6 Famille à pression imposée : contraintes réglables

Deux grandeurs imposées de l'extérieur, réglées de la même manière :

| Grandeur | Plage | Échelon | Rampe |
|---|---|---|---|
| **P_air**, pression de l'air au-dessus du piston | 0 (vide) à 5·10⁵ Pa | saute d'un coup à la consigne : compression ou détente **brutale**, équivalente à poser ou retirer une masse | pas de 1 kPa (réglable) toutes les x s jusqu'à la consigne : transformation **quasi statique** quand x est grand devant l'amortissement du piston |
| **T_ext**, température de la source sous le fond (commune aux deux familles) | 250 à 600 K | saut de température de la source : échauffement brutal, gradients de T dans le gaz | pas de 1 K toutes les x s : échauffement quasi statique (isobare si le piston est libre, isochore s'il est verrouillé ou tenu par le vérin) |

- P_ext = P_air + (M + m)·g/S reste la grandeur affichée et tracée ; P_air est la commande.
- La rampe de pression est l'équivalent « continu » du sable : même idée de succession de petites transformations brutales, réglable finement. Le sable garde son intérêt visuel (grain par grain).
- Une rampe s'arrête à la consigne ; modifier la consigne en cours de rampe change seulement la cible.
- Le piston a des butées (2 cm et 50 cm). Avec P_air = 0 et un gaz chaud, il peut atteindre la butée haute : l'afficher (« piston en butée ») plutôt que d'interdire le réglage.

### 2.7 Famille à volume imposé

- Le **vérin** tient la tige du piston : la position du piston est imposée, le poids du piston et P_air n'interviennent plus (ils sont repris par le vérin).
- Commandes : **hauteur visée** (5 à 50 cm, donc V visé) et **durée τ** (2 ms à 60 s, logarithmique), bouton **Lancer**. Le piston va de sa position à la cible avec un profil de vitesse lisse, u(t) = (Δz/τ)·(1 − cos 2πt/τ) : vitesse nulle au départ et à l'arrivée, au plus 2·Δz/τ. Puis il reste immobile (isochore).
- Bouton **Retour** : même τ, vers la hauteur de départ. C'est l'**aller-retour** qui montre la réversibilité : avec τ long, le gaz revient à son état initial ; avec τ court, il revient plus chaud (calorifugé), l'entropie créée ne disparaît pas.
- Travail reçu : W = −∫P_face·S·dz, où P_face est la pression de la tranche contre le piston, **mesurée par le vérin** : elle reste définie même quand celle du gaz ne l'est pas. C'est la courbe « pression sur le piston » du diagramme PV (§4.2).
- Choisir une famille se fait au repos et **réinitialise l'expérience** (le piston passe de libre à tenu).

**Quasi statique n'est pas réversible.** Avec un fond diathermane, deux temps entrent en jeu, L/c ≈ 1 ms (mécanique) et τ_th ≈ 15 s (thermique). Le seul curseur τ traverse trois régimes :

| τ | Mécanique | Thermique | Bilan |
|---|---|---|---|
| ≪ 1 ms | hors équilibre (front) | hors équilibre | brutale |
| 1 ms ≪ τ ≪ 15 s | **quasi statique** : gaz uniforme en P | gradient de T avec le fond | **quasi statique mais irréversible** (S_c > 0) |
| ≫ 15 s | quasi statique | quasi statique | réversible (isotherme) |

Calorifugé, le régime intermédiaire disparaît : réversible (Laplace) dès que τ ≫ L/c.

---

## 3. Scène (canvas)

Rendu en colonne, de bas en haut :

1. **Source thermique** sous le cylindre : rien (air ambiant à T_ext), plaque chauffante (rouge si T_ext > T₀) ou bain thermostaté (bleu si T_ext < T₀). La couleur suit T_ext. Le calorifugeage du fond est dessiné en hachures, plus épaisses si G est faible.
2. **Cylindre** : gaz coloré en dégradé selon la T de chaque tranche (option), plus les **molécules** pilotées par le modèle.
3. **Piston** + plateau ; **masses** empilées (disques marqués 10/20/40 kg) ; **tas de sable** qui grossit ; **entonnoir** au-dessus quand le versement est actif ; grains en chute. Volume imposé : à la place du plateau, la tige est prise dans un **vérin** fixé au bâti, et un repère marque la hauteur visée. **Depuis R1** : la tige traverse le plateau et la charge (blocs enfilés, sable par-dessus) ; le vérin, suspendu au plafond de l'enceinte, la saisit par une pince quand le piston est tenu (§10.2). Depuis R3, piston dessiné mince (membrane). Entonnoir et grains en chute : pas encore faits.
4. **Loquet** : deux goupilles qui traversent le cylindre au-dessus du piston, en surbrillance quand il est verrouillé (famille à pression imposée). **Remplacé en R1** par la pince du vérin (§10.2).
5. **Sondes** (option) : trois thermomètres et manomètres miniatures sur le flanc (haut / milieu / bas). Pendant une transformation brutale, **ils n'affichent pas la même valeur**. C'est la démonstration la plus directe que « la température du gaz » n'existe pas à cet instant.
6. **Échelle verticale** en cm à côté du cylindre (le volume se lit en hauteur × S).
7. **Profil de pression** (option) : à côté du cylindre, à la même hauteur, P(z) tranche par tranche. Échelle **absolue** par défaut (les écarts du volume imposé se lisent directement) ; échelle amplifiée P(z) − P̄ en option, pour voir les très petits écarts de la masse posée en lisant leur vraie valeur en Pa.
8. **Enceinte** au-dessus du cylindre : cloche transparente qui couvre le haut du cylindre, le plateau et les masses, reliée à un manomètre qui affiche P_air. L'air de la cloche est teinté d'autant plus que P_air est forte (vide : cloche claire, mention « vide »).

**Molécules par bandes de gaz** : les 80 tranches sont regroupées à l'affichage en 10 bandes de même masse, chacune contenant 60 molécules en vol libre qui ne quittent jamais leur bande :
- une bande comprimée s'aplatit et ses molécules se serrent ; un front se voit comme des bandes écrasées l'une après l'autre ;
- vitesse ∝ √T et **couleur** selon T **de la tranche où se trouve la molécule** (interpolée entre centres de tranches), et non de la moyenne de sa bande : un front, épais de ~3 tranches, tombe à l'intérieur d'une bande de 8 et serait lissé par la moyenne. Le confinement par bande donne la densité, la tranche locale donne l'agitation : le front devient une frontière nette entre molécules rouges et rapides et molécules bleues et lentes ; limites des bandes en pointillé ;
- les molécules de la bande du haut frappent le piston.

**Ce que les molécules portent, et ce qu'elles ne portent pas.** Elles montrent la **densité** (resserrement), la **température** (agitation et couleur) et le **mouvement d'ensemble** (dérive avec leur bande). La **pression** n'est pas une propriété visible d'une molécule : elle se lit comme le produit densité × agitation, et ce sont les sondes et le profil qui la donnent. L'encart d'aide le dit en une phrase. Option à essayer au palier 3, à garder seulement si elle reste discrète : un bref éclat à chaque choc sur le piston et les parois, plus fréquent et plus vif là où P est grande.

**Agitation à l'échelle réelle au ralenti extrême.** Aujourd'hui, l'agitation est affichée à vitesse fixe (0,12 m/s à l'échelle du dessin à T₀) quel que soit le cran, alors que la dérive du gaz suit le temps simulé : leurs proportions sont fausses. Or au cran ×1/5000, les vraies vitesses tombent à l'échelle du dessin (agitation 500 m/s → 0,10 m/s, dérive derrière un front 150 m/s → 0,03 m/s). À ce cran, l'agitation est donc tirée du **temps simulé, à l'échelle réelle**, avec la mention « vitesses réelles » sur la scène ; aux autres crans, elle reste conventionnelle. L'élève voit qu'un front avance à une vitesse du même ordre que l'agitation moléculaire : le son, c'est l'agitation qui transmet la perturbation. **Abandonné ensuite** : dès ×1/1000 les vraies vitesses dépassent l'échelle lisible, et cette exception d'un seul cran rendait le curseur incohérent ; l'agitation est désormais la même à tous les crans, avec en option des écarts exagérés, v ∝ (T/T₀)³ (`ARCHITECTURE.md`).

**Selon la famille.** Sous la masse posée, les molécules ne montrent presque rien en densité (le gaz reste uniforme), mais bien la couche chaude sous le piston : c'est le message de cette famille, à dire dans l'encart d'aide. À volume imposé et τ court, elles montrent le front.

Versions abandonnées : vols libres d'une paroi à l'autre, libre parcours court, molécules ancrées qui frémissaient (agitation invisible). Pas de traînées. Pas de loupes comparatives haut / bas. Plus de mention « Son N fois plus lent ».

Limite assumée, dite dans l'encart d'aide : la pression et la température viennent du modèle en tranches, pas du décompte des chocs de ces molécules (600 molécules donneraient des valeurs trop bruitées, cf. l'onglet Pression qui fait ce calcul). Les molécules ne se choquent pas entre elles ; leur agitation est ralentie d'un même facteur pour rester lisible (les vraies vitesses, ~500 m/s, sont invisibles à l'œil).

---

## 4. Graphes

Disposition (de gauche à droite) : **colonne graphes + tableau** (la colonne du tableau du palier 1), **scène**, panneau.

- Colonne de gauche, de haut en bas : le **diagramme PV**, puis les **graphes temporels** (un seul canevas découpé en trois cases T(t), P(t), V(t), comme `cinematique/`), puis le **tableau des valeurs** (t, P, T, V, P_ext, T_ext, badge d'équilibre ; compact, sur deux colonnes de valeurs si la place manque). Splitter horizontal entre le diagramme PV et les graphes temporels.
- La colonne s'élargit par rapport au palier 1 pour que les graphes restent lisibles ; un splitter vertical entre cette colonne et la scène règle leur partage de largeur (par défaut ~50 / 50).
- Fenêtre étroite ou portrait : scène en haut, graphes dessous (la scène garde au moins ~45 % de la hauteur, c'est l'élément central).
- Le cylindre conserve sa règle de taille du palier 1 (aussi large que la place le permet, au plus 75 % de sa hauteur dessinée), sur une zone désormais plus étroite.

### 4.1 Graphes temporels

- **V(t)** : toujours défini (position du piston) → courbe pleine.
- **T(t), P(t)** : courbe pleine à l'équilibre. Hors équilibre, **bande min–max des tranches** hachurée, avec la mention « non définie ». La moyenne n'est pas tracée : ce serait suggérer qu'elle a un sens.
- Repères en pointillés : **P_ext** = P_air + (M + m)g/S sur P(t) (famille à pression imposée) ; **T_ext** sur T(t). Ils suivent les échelons et les rampes.
- Axe des temps : **fenêtre glissante dont la largeur suit le cran de vitesse** (de quelques ms au ralenti extrême à quelques dizaines de s aux crans rapides), unité ms ou s selon la fenêtre. L'historique complet reste enregistré : bouton « Adapter » pour tout revoir.
- Outils repris d'`ondes/` et `radioactivite/` : zoom rectangle, vue précédente, réticule.

### 4.2 Diagramme PV (Clapeyron)

- Les **états d'équilibre** sont tracés en points pleins, reliés par une courbe pleine quand on passe de l'un à l'autre en restant à l'équilibre (quasi statique).
- Tant que la **pression** du gaz n'est pas uniforme, **aucun point du gaz n'est tracé** : un pointillé gris relie les points connus, avec la mention « chemin non défini ». **Décision après R3** : une température seule non uniforme n'efface pas le point (V et P restent définis, P·V = nR·T_moy exactement, l'aire sous la courbe reste le travail). Ainsi, un piston chargé qui oscille trace le chemin du gaz autour de l'état final : le gaz a un état, c'est le système {gaz + piston} qui est hors équilibre. Pas de troisième style de trait (jugé trop chargé) : c'est le diagramme TS (§10.6) qui montrera qu'un tel état n'est pas un équilibre.
- **Nuage des tranches** (option, activée par défaut ; **remplacé après R2** par la pression de chaque tranche au volume du gaz, sur une verticale : l'abscisse du nuage n'était pas le volume du gaz porté par l'axe) : chaque tranche est un petit point (N·V_tranche, P_tranche), c'est-à-dire l'état qu'aurait le gaz entier s'il était partout comme cette tranche. À l'équilibre, les points se confondent en un seul ; pendant une transformation brutale, le nuage éclate puis se resserre ; en quasi statique, un point unique glisse le long de la courbe. C'est l'image directe de « le gaz n'a pas UN état ». Couleur des points selon T, comme les molécules.
- Option **« Pression sur le piston »** : trajectoire (V, P_piston) en tireté, P_piston étant la pression exercée par le piston (pression imposée) ou mesurée par le vérin (volume imposé). L'aire sous cette courbe est le travail reçu, juste même hors équilibre.
- Options **courbes théoriques** passant par l'état initial de la transformation en cours : isotherme (PV = cte) et adiabatique réversible (PV^γ = cte).
- **Le zoom sur le versement de sable** montre l'escalier de micro-transformations brutales, qui épouse la courbe réversible quand les grains sont fins. C'est l'idée de transformation « brutale mais infinitésimale ».

---

## 5. Panneau (onglet Transformations)

Structure canonique (§5 de CONTEXTE_PROJET). « (R) » = section repliable.

1. **Contrôle** : Pause / Réinitialiser ; curseur **Vitesse** élargi à crans (×1/5000 / ×1/1000 / ×1/100 / ×0,1 / ×1 / ×5 / ×20). Les crans lents servent à regarder les fronts traverser le gaz et le piston osciller, les crans rapides à attendre les équilibres thermiques et le versement de sable. Affichage du cran en clair (« ×1/1000 »).
2. **Contrainte** : sous-onglets **Pression imposée** / **Volume imposé** (changer réinitialise, §2.7).
   - *Pression imposée* :
     - **Pression extérieure** : curseur **P_air** (0 à 5 bar) ; sous-onglets **Échelon** / **Rampe** (pas et durée du pas réglables) ; bouton **Appliquer** ; afficheur P_ext.
     - **Charges sur le piston** : sélecteur 10 / 20 / 40 kg ; bouton **Poser / Retirer la masse** ; bouton **Loquet : verrouillé / libéré** ; sable : masse d'un grain (5 à 100 g), boutons **Un grain**, **Verser / Arrêter** (débit réglable), **Retirer le sable**, masse de sable posée.
   - *Volume imposé* : curseur **Hauteur visée** (cm, avec le volume en L) ; curseur **Durée τ** (2 ms à 60 s), affiché avec L/c et τ_th pour situer le régime (« brutal », « quasi statique », « quasi statique et réversible ») ; boutons **Lancer** et **Retour**.
3. **Thermique** : curseur **Isolation** (calorifugé ↔ diathermane) ; curseur **T_ext** avec les sous-onglets **Échelon** / **Rampe** et le bouton **Appliquer**.
4. **Gaz** (R) : γ (cf. 2.5) ; T₀, V₀ initiaux (pris en compte au Réinitialiser).
5. **Affichage** (R) : molécules, dégradé de température, sondes, profil de pression (absolu / amplifié), nuage des tranches, pression sur le piston, isotherme, adiabatique.
6. **Bilan** (R, niveau CPGE) : W reçu, Q reçu, ΔU (avec vérification ΔU = W + Q), et **entropie créée** S_c = ΔS − Q/T_ext. La comparaison brutal / lent, et l'aller-retour, en font un résultat chiffré.

Afficheurs permanents (tableau en bas de la colonne de gauche, sous les graphes, §4) : **P, V, T** (« ? » hors équilibre, en terracotta), P_ext, T_ext, badge **À l'équilibre / Hors équilibre**.

Bandeau **Informations** : mode d'emploi de la page (choisir une contrainte, préparer avec le loquet, ralentir pour voir le piston et les fronts, régler τ, verser le sable, régler l'isolation…), puis une phrase par compromis : échanges thermiques accélérés, origine réelle de l'amortissement du piston, et pourquoi la masse posée laisse le gaz uniforme (c/√(g·L)).

---

## 6. Architecture des fichiers

### 6.1 Cohabitation avec l'onglet existant (point critique)

Les scripts du site partagent le **scope global**, et l'onglet actuel occupe déjà des noms génériques : `sim`, `canvas`, `ctx`, `resize`, `drawScene`, `loop`, `init`, `resetSim`, `togglePause`… Le nouvel onglet **préfixe tout** (`tf…`) et range son état dans un unique objet `tf`. Aucun nouveau nom générique global.

L'onglet actif seul fait tourner sa boucle : la boucle de l'onglet molécules doit être suspendue quand il est masqué (c'est aussi un gain de performance).

### 6.2 Fichiers

```
pression/
├── index.html               ← + .panel-main-tabs, + colonne gauche et panneau du 2ᵉ onglet
├── ARCHITECTURE.md          ← complété à la fin
├── PLAN_TRANSFORMATIONS.md  ← ce fichier
├── css/style.css            ← + styles du 2ᵉ onglet
└── js/
    ├── sim.js, recipient.js         (onglet Pression, inchangés hors suspension de boucle)
    ├── tf-sim.js                    ← état tf, moteur en tranches, piston libre ou tenu par le vérin, thermique, critère d'équilibre, bilans
    ├── tf-molecules.js              ← molécules par bandes, pilotées par le modèle
    ├── tf-scene.js                  ← rendu cylindre, masses, sable, vérin, source, sondes, profil
    ├── tf-graph.js                  ← NOUVEAU : graphes temporels + diagramme PV (nuage des tranches), outils zoom/réticule
    ├── tf-ui.js                     ← commandes du panneau, boucle de l'onglet
    ├── ui.js                        ← + bascule d'onglets, deep-linking, suspension des boucles
    └── sections-repliables.js       (chargé en dernier)
```

Ordre de chargement : `sim.js` → `recipient.js` → `tf-sim.js` → `tf-molecules.js` → `tf-scene.js` → `tf-graph.js` → `tf-ui.js` → `ui.js` → `sections-repliables.js`.

### 6.3 Deep-linking

`#pression` (défaut) et `#transformations`, mise à jour par `history.replaceState` à chaque bascule (§9 de CONTEXTE_PROJET).

---

## 7. Validation (banc Chrome headless + Python)

Chaque test charge la page en `#transformations`, pilote les fonctions `tf…` et compare aux valeurs analytiques.

| Test | Attendu |
|---|---|
| Repos initial | P, T, V constantes à 10⁻⁴ près pendant 60 s simulées |
| Conservation de l'énergie (calorifugé, sans viscosité) | U + Ec gaz + Ec piston + Ep piston + P_atm·V constant à 10⁻³ |
| Masse brutale, calorifugé (10 / 20 / 40 kg) | T_f et V_f du tableau §1 à 0,5 % |
| Masse brutale, diathermane | V_f = nRT₀/P_ext, T_f = T₀ |
| Uniformité sous la masse posée | 40 kg posés brutalement : écart relatif de P entre tranches de l'ordre de 10⁻⁵ à 10⁻⁴ (confirme §2.3) |
| Sable fin, calorifugé | état final → Laplace (écart décroissant quand le grain diminue) |
| Sable lent, diathermane | état final → isotherme |
| Échelon de T_ext, piston libre | V_f/V₀ = T_ext/T₀ (isobare) |
| Bilan | ΔU = W + Q à 10⁻³ ; S_c ≥ 0 toujours, → 0 pour le sable fin et lent |
| Échelon de P_air (1,013 → 3 bar), calorifugé | même état final que la masse équivalente (formule du §1 avec P_ext) |
| Rampe lente de P_air, calorifugé / diathermane | état final → Laplace / → isotherme |
| P_air = 0 (vide) | équilibre à P_ext = Mg/S ; butée haute atteinte proprement si le gaz est chaud |
| Bilan avec P_air variable | énergie totale (avec W_air) constante à 10⁻⁶ |
| Volume imposé, τ long, calorifugé | 30 → 15 cm : T_f = 386,8 K (Laplace) à 0,1 % ; S_c ≈ 0 |
| Volume imposé, τ = 2 ms, calorifugé | Pmax/Pmin > 2 pendant la compression ; T_f > Laplace (~390 K, cf. §2.3) ; S_c > 0 |
| Volume imposé, τ long, diathermane | T_f = T₀ (isotherme), S_c → 0 quand τ ≫ τ_th ; S_c > 0 pour 1 ms ≪ τ ~ τ_th |
| Aller-retour à volume imposé | τ long : retour à l'état initial à 10⁻³ ; τ court, calorifugé : T_retour > T₀ |
| Bilan avec le vérin | énergie totale (avec W_op) constante à 10⁻⁶ |
| Changement de γ | états finaux recalculés justes pour 5/3 et 4/3 |
| Célérité réelle | onde lancée par une petite impulsion du piston : aller-retour en 2L/c ≈ 1,75 ms à 5 % près |
| Ralenti extrême | à ×1/5000 et à ×20, même trajectoire du piston pour un même temps simulé |
| Stabilité | aucune valeur NaN, pas de tranche d'épaisseur négative, à ×20, pour 40 kg et pour τ = 2 ms |

---

## 8. Paliers

1. ✅ **Moteur + scène minimale** (terminé ; les onglets et le deep-linking du palier 8 ont été avancés ici pour pouvoir tester la page, résultats des tests dans `ARCHITECTURE.md`) : `tf-sim.js` complet en célérité réelle (tranches, piston, loquet, masses, Isolation), curseur Vitesse avec ralenti extrême, rendu simple du cylindre, afficheurs P, V, T.
2. ✅ **Mise en évidence du hors-équilibre** (terminé) : critère à deux niveaux, « ? » dans les afficheurs, badge d'équilibre, dégradé de température, sondes, loupe sur le profil de pression, molécules pilotées par le modèle. Ajouts ensuite : curseur Vitesse du son, dissipation près du piston, molécules confinées dans 10 bandes.
3. ✅ **Volume imposé** (terminé ; régime affiché à côté de τ avancé du palier 7, résultats des tests dans `ARCHITECTURE.md`) : passage à 80 tranches ; sous-onglets Pression imposée / Volume imposé ; vérin (moteur, scène, panneau), hauteur visée, durée τ, Lancer / Retour ; travail W_op ; profil de pression en échelle absolue ; **retrait du curseur Vitesse du son** et de sa mention ; molécules : vitesse et couleur selon la tranche locale, agitation à l'échelle réelle au cran ×1/5000, essai des éclats de chocs (§3). Tests : volume imposé (τ long, τ = 2 ms, aller-retour), bilan avec le vérin, stabilité à 2 ms, uniformité sous la masse posée revérifiée à 80 tranches.
4. ✅ **Graphes et nouvelle disposition** (terminé ; le chemin PV est tracé plein tant que P et T sont définies, même piston en mouvement, cf. ARCHITECTURE.md) : graphes puis tableau dans la colonne de gauche, splitters ; T, P, V(t) avec bandes min–max, diagramme PV avec chemin non défini, **nuage des tranches**, pression sur le piston, courbes théoriques, outils de zoom. *Depuis : nuage remplacé par la pression de chaque tranche au volume du gaz ; chemin plein dès que P est définie (§4.2).*
5. ✅ **Contraintes extérieures** (terminé, résultats des tests dans `ARCHITECTURE.md`) : P_air (enceinte, manomètre) et T_ext (source four / bain), échelon et rampe pour les deux, butées signalées. Tests : échelon de T_ext, échelon et rampes de P_air, vide, bilan avec W_air.
6. **Sable** (en grande partie fait : physique et tas en R1, versement continu en R3, un point d'équilibre par marche d'escalier sur le diagramme ; tests sable fin calorifugé faits) : reste **l'entonnoir et les grains en chute**, et le test sable lent diathermane.
7. ✅ **γ, Bilan et diagramme TS** (terminé, résultats des tests dans `ARCHITECTURE.md`) : section **Gaz** (γ, T₀, V₀ ; tout changement réinitialise), section **Bilan** (W, Q, ΔU, W + Q, ΔS, Σ δQ/T_source, S_c ; dernière étape et depuis A), diagramme **T(S)** (§10.6) dans son propre encart ; colonne gauche réglée par quatre boutons activables, P = f(V), T = f(S), T, P, V = f(t), Tableau (de 0 à 4 encarts ; remplace les onglets P(V) / T(S) / Les deux d'un premier essai) ; courbes isochore et isobare ajoutées dans les deux diagrammes.
8. **Intégration** : renommage visible « Gaz parfait », bandeau Informations (dont l'argument c/√(g·L)), responsivité (fenêtre étroite : scène au-dessus des graphes). Le bandeau Informations est déjà réécrit au fil de R1 à R3 ; la **responsivité est à revérifier** avec le nouveau panneau (trois boutons, journal, réglages fins).
9. **Site** : niveau **CPGE** sur l'accueil (nouvelle case de filtre `data-value="cpge"`, badge `.level-cpge` d'une nouvelle couleur, `data-levels="cpge"`), carte « Transformations d'un gaz parfait » (thème Thermodynamique), aperçu `assets/previews/pression-transformations.jpg`, `meta description` et `<title>` de la page mis à jour, sitemap (`lastmod`), `ARCHITECTURE.md`, tableau §8 et §9 de CONTEXTE_PROJET, mention de CPGE dans la `meta description` de l'accueil.

Chaque palier se termine par un commit et peut être montré en classe tel quel à partir du palier 3.

---

## 9. Points encore ouverts

- **Masse retirée lentement** alors qu'il ne reste que des blocs : retirée par petits pas, dessinée comme un bloc dont l'étiquette décroît (§10.3).
- ~~**τ < 2 ms**~~ : réglé au palier 3 (signe faux dans la viscosité) ; le vérin descend à 0,5 ms, piston jusqu'à 400 m/s.
- ~~Viscosité linéaire~~ : réglé au palier 3, TF_CL = 0,5 et TF_CQ = 2 (à 0,15, le calcul diverge pour τ = 2 ms).
- Gamme des masses (0 à 40 kg) et section 20 cm² : à revoir avec la membrane de 1 g (le nuage des tranches n'existe plus).
- Dégradé de couleur : sur T (recommandé) ou sur la masse volumique ?
- Titre de la carte d'accueil de l'onglet existant : garder « Pression d'un gaz » ou passer à « Modèle cinétique d'un gaz parfait » ?
- Option future, hors de cet onglet : dynamique moléculaire réelle (disques durs) pour une thermalisation qui ne doit rien au modèle.
- **Message sous les trois boutons** : avec G = 0,03 W/K et l'action température, il dit « fond peu conducteur » alors que les deux manières lentes sont presque identiques. Le seuil (rapport des durées réversible / quasi statique ≤ 1,5) est à affiner.
- **Bilan d'énergie au choc de la membrane** : écart de 10⁻² J (≈ 10⁻⁴ en relatif) après un échelon de P_air, contre 10⁻⁴ J avec le piston de 1 kg. À surveiller.
- **Essai à la souris** de R3 : validé au banc headless seulement.

---

## 10. Refonte de l'interface : enchaîner les transformations

### 10.1 Constat (après le palier 5)

- Changer de famille réinitialisait : impossible d'enchaîner une isochore et une isobare, donc de parcourir un cycle.
- Cinq façons de lancer une action (Appliquer P_air ; masse puis loquet ; Lancer / Retour du vérin ; Appliquer T_ext ; changer de famille), trois paires de sous-onglets, quatre curseurs pas / période.
- Doublons : masse posée et échelon de P_air ; loquet et vérin à l'arrêt ; rampe (pas + période) et durée τ.

### 10.2 Piston tenu ou libre

- **Tenu** : une pince, au bout de la tige d'un vérin suspendu au plafond de l'enceinte, saisit le haut de la tige du piston. À l'arrêt, c'est l'ancien loquet ; en mouvement, l'ancien vérin. Le poids et P_air sont alors repris par la pince.
- **Libre** : la tige du vérin se rétracte ; le piston est soumis à P_air, à son poids, à celui des masses et à la pression du gaz.
- On passe de l'un à l'autre **à tout moment, sans réinitialiser** (bouton permanent en tête de la carte). Libérer un piston que le gaz n'équilibre pas est une transformation brutale ; tenir un piston en mouvement l'arrête net (son énergie cinétique est perdue, comme avec l'ancien loquet).
- Les masses sont des disques fendus enfilés sur la tige, au-dessus du plateau : masses et pince coexistent.
- Bilan d'énergie : un seul compte, U + Ec (+ Ec et énergie potentielle du piston s'il est libre) − Q − W_air − W_op, recalé à chaque changement discontinu de commande (tenir, libérer, poser une masse) pour rester continu.

### 10.3 Carte « Transformation »

> *Depuis R3, la durée, les marches et le bouton Lancer décrits ici sont dans les **Réglages fins** (repliés) ; la carte principale porte les trois boutons du §10.5.*

```
Piston : 🔒 tenu / 🔓 libre
Agir sur :  [ Volume ]  [ Pression ]  [ Température ]
            (Pression : [ Masse ] [ Air de l'enceinte ])
Valeur visée : curseur (hauteur, masse totale, P_air, T_source)
Durée :     brutale ───────── lente
Pas de l'escalier (si durée > 0, sauf Volume) → « n marches, une toutes les x s »
Transformation attendue : …
[ Lancer ]   (pendant l'action : « En cours… » et [ Interrompre ])
```

- **Volume** : tient le piston et le mène à la hauteur visée en τ (profil lisse du §2.7, τ de 0,5 ms à 60 s).
- **Pression** : applique la consigne **et libère** le piston. Deux moyens au choix de l'utilisateur :
  - *Masse* (valeur visée = masse totale posée, 0 à 40 kg). Brutale : un bloc posé ou retiré d'un coup. Lente : du **sable**, versé ou retiré grain à grain (escalier dont le pas est la masse d'un grain). Le retrait brutal prend d'abord sur les blocs, le retrait lent d'abord sur le sable.
  - *Air de l'enceinte* (P_air, du vide à 5 bar), échelon ou escalier.
- **Température** de la source : échelon ou escalier ; le piston garde son état (libre → isobare, tenu → isochore), ce que la carte affiche.
- **Durée** commune : « brutale » (échelon) puis des durées croissantes. Une durée non nulle donne un **escalier** de marches égales : n = ⌈|Δ| / pas⌉ marches, une toutes les durée / n. Faire tendre le pas vers 0 donne la transformation continue.
- Une seule action à la fois ; elle peut être interrompue (l'escalier s'arrête sur sa marche, le vérin s'arrête là où il est).
- L'isolation du fond reste un **état** (section Échanges thermiques, au-dessus de la carte) : c'est elle qui décide adiabatique ou non.
- **Vitesse adaptée** (case cochée par défaut) : au Lancer, le cran de vitesse est choisi pour que l'action dure quelques secondes à l'écran (durée du vérin ou de l'escalier ; oscillations du piston pour une pression brutale ; mise en équilibre thermique pour une température brutale).

### 10.4 Paliers de la refonte

- ✅ **R1** (terminé) : piston tenu / libre sans réinitialisation, pince et masses enfilées, carte unique, escaliers, masse visée (blocs et sable), vitesse adaptée.
- ✅ **R2** (terminé, cf. ARCHITECTURE.md) : journal des étapes (A → B, B → C…), états d'équilibre étiquetés et étapes colorées sur le diagramme PV, « revenir à l'état B » (instantané), **chrono des graphes figé à l'équilibre** (option : l'axe des temps saute les attentes, coupures marquées). Ajouts demandés pendant R2 : flèche de sens de parcours au milieu de chaque étape, état actuel cerclé d'une couleur réservée (orange). Une action sans effet (piston tenu au repos, température avec un fond calorifugé…) n'est pas notée.
- ✅ **R3** (terminé, cf. ARCHITECTURE.md ; ajouts : conduction implicite en mode quasi statique et crans jusqu'à ×10 000, durées réglées sur la chaleur échangée et les résistances thermiques — les premières, 3 τ_int et 10 τ_th, laissaient le gaz non défini —, vitesse adaptée au retour à l'équilibre, équilibre exigeant T_gaz = T_source si le fond conduit) : trois boutons **Brutalement / Quasi statiquement / Réversiblement** à la place des curseurs de durée et de marches (§10.5). Deux commits : moteur (pression qui varie continûment en mode quasi statique), puis interface.
- ✅ **R4a** (terminé, §10.7) : montage enceinte ou masses, fond sur l'isolant ou l'une de deux sources à température saisie, valeur visée en champ avec arrivée prévue, pas à pas, annuler l'étape.
- ✅ **R4b** (terminé, §10.8) : panneau épuré, montage en tête de carte et visible sur la scène, vitesse sur une ligne, pas à pas comme quatrième manière pour les trois grandeurs.
- ✅ **R4c** (terminé, §10.9) : panneau en État initial / Conditions / Transformation ; grandeur réglée déduite des conditions (organe piston ou source) ; deux modes, Viser une valeur et À la main (voyant d'équilibre, cartes d'organes, pas 1-2-5) ; réglages fins supprimés.
- ✅ **R4d** (terminé, §10.10) : section État initial en Dispositif (montage, gaz) et Point de départ A (P₀, V₀, T₀ réglables, n déduite) ; réglages en brouillon, appliqués aussitôt sans étape, sinon par « Recommencer depuis A ».
- ✅ **R4e** (terminé, §10.11) : journal des Étapes en frise sur fond blanc (points = états, traits = étapes, pointillés si le gaz est passé par un état non défini) ; titre = nature, puce de la manière, S créée ; clic sur un point = courbes de référence, sur un trait = mise en évidence et Bilan de cette étape.
- ✅ **R4f** (terminé, §10.12) : cycles — retour à un état déjà noté reconnu (même lettre, ⟳ cycle) ; colonne Cycle du Bilan et phrase moteur / récepteur (rendement, Carnot, efficacités).
- **R4** : file d'attente (action lancée pendant une autre → « ensuite », enchaînement à l'équilibre), séquences enregistrées (localStorage, export JSON), préréglages (aller-retour, Carnot, Stirling, Lenoir).
- **R5** (option) : viser en cliquant sur le diagramme de Clapeyron.
- ✅ **Diagramme TS et Bilan** (§10.6, palier 7) : terminé. **Prochain palier proposé : R4**, puis R5, et les paliers 8 (intégration) et 9 (site).

**Mode quasi statique du moteur** (ajouté après R2) : au repos mécanique, pression uniforme et conduction seule, pas ~0,7 ms au lieu de ~1 µs ; les escaliers lents tiennent enfin le cran ×20 (avant : ×0,8 avec un gaz chaud et comprimé). Résultats identiques au calcul complet (ARCHITECTURE.md).

Le palier 6 (sable) est absorbé par R1 pour la physique et le tas ; l'entonnoir et les grains en chute restent à faire.

### 10.5 Palier R3 : trois boutons

**Constat.** Durée et hauteur des marches restent trop complexes pour se promener dans le diagramme. Le cours ne distingue que trois manières de transformer : brutale, quasi statique, réversible. La page fixe elle-même les paramètres qui illustrent chacune.

**Carte.**

```
Piston : 🔒 tenu / 🔓 libre
Agir sur : [ Volume ] [ Pression ] [ Température ]   (Pression : [ Masse ] [ Air de l'enceinte ])
Valeur visée : curseur
[ Brutalement ]  [ Quasi statiquement ]  [ Réversiblement ]
▸ Réglages fins (repliés) : durée et hauteur des marches, comme en R1, pour les démonstrations du professeur
```

Un clic lance l'action (plus de bouton Lancer) ; Interrompre reste disponible. Le journal dit « compression brutale », « chauffage isobare quasi statique »…

**Où naît l'irréversibilité thermique.** La chaleur traverse deux obstacles : la paroi du fond (n·Cv/G : 0,5 s diathermane, 18 s à 0,03 W/K, 180 s à 0,003 W/K) et la conduction dans le gaz (4L²/(π²D) ≈ 15 s). L'écart de température se loge dans le plus lent :
- fond peu conducteur (G ≲ 0,01 W/K) : dans la paroi. Le gaz reste uniforme, son chemin est défini, et de l'entropie est pourtant créée : **quasi statique mais irréversible**, au sens propre ;
- fond très conducteur : dans le gaz. Assez rapide pour créer de l'entropie, la transformation le laisse non uniforme en température (T non définie, donc pas quasi statique) ; assez lente pour que T reste définie, elle est presque réversible.

**Paramètres choisis par la page** (τ_int = 4L²/(π²D), conduction dans le gaz ; τ_th, mise en équilibre thermique totale, cf. `tfDurees`) :

| Action | Brutalement | Quasi statiquement | Réversiblement |
|---|---|---|---|
| Volume (vérin) | τ = max(0,5 ms ; 2·\|Δz\| / 150 m/s) : vitesse de pointe ~150 m/s, la pression du gaz n'est **clairement pas définie** (30 → 15 cm : τ = 2 ms, Pmax/Pmin = 2,2 ; course de 1 cm : 0,5 ms) | τ = max(1 s ; 3·τ_int si le fond conduit) : lent devant le son et devant la conduction dans le gaz | τ = 10·τ_th (calorifugé : comme le bouton du milieu) |
| Pression, masse | un bloc posé ou retiré d'un coup | sable versé ou retiré **en continu**, même durée que le bouton du milieu du volume | idem, en 10·τ_th |
| Pression, air de l'enceinte | échelon de P_air (cf. note ci-dessous sur la pression non définie) | rampe **continue** de P_air | idem, en 10·τ_th |
| Température de la source | échelon | rampe continue en 3·τ_int | rampe continue en 10·τ_th |

**Demande de l'auteur : la transformation brutale doit montrer une pression non définie** dans le gaz, à volume imposé comme à pression imposée par l'air de l'enceinte (le cas de la masse, au contraire, illustre un gaz qui reste uniforme alors que le système est hors équilibre, §2.3).
- **Volume imposé** : le paramétrage ci-dessus l'assure (vitesse de pointe fixée plutôt que la durée : une petite course reste brutale). La non-uniformité est d'autant plus marquée que la course est grande.
- **Air de l'enceinte : impossible avec le piston actuel.** L'écart de pression dans le gaz vaut environ ΔP × (masse du gaz / masse du piston) ; le gaz pèse 0,76 g. Mesuré (P_air 101 → 200 kPa, calorifugé) :

  | Piston | Pmax/Pmin | P non définie pendant |
  |---|---|---|
  | 1 kg (actuel) | 1,0007 | jamais |
  | 100 g | 1,0065 | 29 ms |
  | 10 g | 1,063 | 48 ms |

  **Décidé : (a)**, un piston **plus léger que le gaz** (~1 g, une membrane) : l'air de l'enceinte lancerait alors un vrai front de compression (à mesurer ; P₀ ≈ P_atm, la masse posée en kg resterait l'exemple du gaz uniforme ; amortissement du piston et stabilité du schéma à revalider) ; plutôt que (b), garder le piston de 1 kg et réserver la pression non définie au volume imposé.

  Mesure préliminaire, piston de 1 g (P_air 101 → 200 kPa, calorifugé) : Pmax/Pmin = 1,50, P non définie pendant 48 ms ; calcul stable ; état final 374,71 K (formule de la transformation brutale : 374,7 K) ; bilan d'énergie à 1,7·10⁻³ J (10⁻⁴ J avec 1 kg : à surveiller).

  Conséquences à traiter dans R3 : P₀ ≈ P_atm (le poids du piston ne compte plus : 5 Pa) ; amortissement du piston (fraction de l'amortissement critique, presque nul pour 1 g : la viscosité du gaz amortit seule, à vérifier) ; libérer un piston tenu hors équilibre lance aussi un front ; les tests du §1 et de R1 refaits (les cibles de la masse posée changent de quelques dixièmes de kelvin, P₀ passant de 106,2 à 101,3 kPa) ; scène : piston dessiné plus mince ; masses de 10 à 40 kg sur une membrane : choix d'image assumé.

**Messages quand deux boutons se confondent.** Calorifugé : « ici, quasi statique suffit pour être réversible : aucun échange thermique ». Fond très conducteur : « le fond ne limite pas les échanges : quasi statique et réversible se confondent », **seulement si les deux boutons affichent la même durée**. Fond conducteur (G·R_int ≥ 1, l'écart de température se loge dans le gaz) mais durées différentes : quasi statique crée déjà peu d'entropie, réversible est k fois plus lent pour en créer encore moins (une grande transformation diathermane donne 5 h 18 contre 7 h 37 : « se confondent » y était trompeur). Fond peu conducteur : les deux boutons, partis du même état, arrivent à des états différents.

**Moteur (premier commit)** ✅ (fait, résultats dans ARCHITECTURE.md ; piston de 1 g compris). Le mode quasi statique suit une pression extérieure qui varie continûment (rampe de P_air, sable versé en continu) : à chaque sous-pas, chaque tranche est comprimée ou détendue de façon adiabatique jusqu'à la nouvelle pression, sans repasser par le calcul complet (aujourd'hui, chaque marche d'escalier piston libre le relance pendant que le piston oscille : ~1 min à l'écran pour 40 marches avec un fond conducteur). Validation contre les escaliers fins actuels : loi de Laplace (calorifugé), isotherme (diathermane, lent), bilan d'énergie.

**Interface (second commit).** Trois boutons ; durées calculées à partir de `tfDurees` au moment du clic ; vitesse adaptée avec deux crans de plus, ×100 et ×500 (le bouton de droite, fond peu conducteur, dure jusqu'à 30 min simulées) ; réglages fins repliés ; bandeau Informations (la différence entre quasi statique et réversible dépend de l'isolation du fond). *Fait : crans jusqu'à ×10 000 (et non ×500), grâce à la conduction implicite ; les durées des manières lentes ne sont pas 3 τ_int et 10 τ_th, qui laissaient le gaz non défini, mais réglées sur la chaleur échangée et les résistances thermiques du gaz et de la paroi (ARCHITECTURE.md).*

**Tests.** Pour chaque action et chaque isolation (calorifugé, 0,003 W/K, diathermane) : brutal → P non définie pendant l'action (volume ; air si (a) retenu) ; quasi statique → chemin défini (P et T définies tout du long) ; réversible → état final à 10⁻³ près de la loi de Laplace ou de l'isotherme ; quasi statique contre réversible, fond peu conducteur → états finaux différents (S_c > 0 contre S_c ≈ 0, mesurés par le banc en attendant la section Bilan) ; durée à l'écran avec la vitesse adaptée.


### 10.6 Diagramme TS (fait, avec le Bilan : palier 7)

> *Réalisé comme décrit ci-dessous ; ΔS affiché en mJ/K. Écarts : la légende du T(S) est en bas à droite (en haut, elle cachait les tranches pendant un choc) ; l'entropie échangée est Σ δQ / T_source, si bien que S_c compte aussi l'entropie créée dans la paroi du fond.*

**Idée** (de l'auteur) : un état d'équilibre d'un gaz parfait, fixé par deux variables, est un point dans **tous** les diagrammes (PV, TS…). Si l'un ne peut pas le placer, le système n'est pas à l'équilibre, même si un autre le peut. Exemple : gaz à pression uniforme mais température non uniforme (couche chaude, chauffage par le fond) → point en PV (V et P définis), pas de point en TS (S défini, T non).

| Situation | PV | TS |
|---|---|---|
| Équilibre | point | point |
| P uniforme, T non uniforme | point | segment vertical (températures des tranches) au S du gaz |
| Choc (P non uniforme) | segment vertical (pressions des tranches) au V du gaz | segment vertical |

- **Entropie** : chaque tranche est localement en équilibre, s_j = n_j·[Cv·ln T_j + R·ln(V_j/n_j)] + cte ; S du gaz = somme des tranches, toujours définie. Afficher ΔS en J/K, S = 0 à l'état initial. Coût : 80 logarithmes par échantillon.
- **Ce que le TS montrera** : compression brutale calorifugée qui dérive vers la droite (S augmente sans chaleur) face à la réversible verticale ; résorption d'une couche chaude à volume constant, point qui glisse horizontalement ; quasi statique contre réversible avec un fond peu conducteur (écart en S = entropie créée dans la paroi) ; aire sous la courbe = Q seulement si T est défini et la transformation réversible.
- **Courbes de référence** : isotherme horizontale, adiabatique réversible verticale, isochore T ∝ e^(S/Cv), isobare T ∝ e^(S/Cp).
- **Affichage** : onglets PV / TS sur la case du diagramme (ou les deux l'un sous l'autre, en option). Le tracé du PV (chemin coloré par étape, lettres, flèches, état actuel, segment des tranches, zoom, réticule) est généralisé en un tracé de diagramme paramétré par ses axes.
- **Tests** : S_c lu sur le TS égal à celui du Bilan ; réversible calorifugé vertical à 10⁻³ près ; isotherme diathermane horizontale ; segment TS présent exactement quand T n'est pas définie.
### 10.7 Palier R4a : se promener entre les états (fait)

**Constat de l'auteur.** Enchaîner restait difficile : l'isotherme réversible d'un cycle de Carnot était impossible (la température de la source ne se réglait qu'en lançant une transformation), la masse passait par une consigne abstraite, et le sable ne se versait pas à la main.

**Principes.** Une commande par geste ; on ne voit que ce qui sert ; on sait où l'on va avant de cliquer.

```
Contrôle :      [ Pause ] [ RAZ ]      ▸ Vitesse ×1 (replié : curseur, vitesse adaptée)
Piston :        [ 🔒 Tenu ] [ 🔓 Libre ]
Fond posé sur : [ Isolant ]
                [ Source chaude ] [ 400 ] K [= T gaz]
                [ Source froide ] [ 293,15 ] K [= T gaz]
Agir sur :      [ Volume ] [ Pression ] [ Température ]
Valeur visée :  [−] [ 15 ] cm [+] [État ▾]
Arrivée prévue réversiblement : 0,300 L · 264 kPa · 387 K   (+ cercle pointillé sur P(V) et T(S))
[ Brutalement ] [ Quasi statiquement ] [ Réversiblement ]
Pas à pas :     [ − 1 grain ] [ + 1 grain ]   (pression ; ± 1 kPa en mode enceinte)
[ Interrompre ] [ ↶ Annuler l'étape ]
▸ Réglages fins
Section Montage et gaz : Pression par [ Air de l'enceinte ] [ Masses posées ] (réinitialise)
```

- **Montage** : la pression passe par l'air de l'enceinte (défaut, tout le diagramme accessible) ou par les masses (jamais sous 1 atm) ; plus de sous-onglets dans la carte.
- **Fond** : trois supports. Chaque source garde sa température (`tf.Tchaude`, `tf.Tfroide`), saisie au clavier quand le cylindre n'est pas dessus ; « = T gaz » la recopie. La source sous le cylindre est `tf.Text`, que l'action Température fait varier. Le fond (support, températures, G) fait partie des instantanés : revenir à un état remet le cylindre où il était. RAZ remet le cylindre sur l'isolant si la source qui le porte n'est pas à T0.
- **Valeur visée** : un seul champ, la valeur actuelle tant qu'on n'y touche pas (elle la suit de nouveau après chaque action, un retour ou RAZ), − et + vers la graduation voisine, menu des états du journal.
- **Arrivée prévue** : fond sur une source, même état final quelle que soit la manière ; isolant, loi de Laplace (réversible) et premier principe sous pression finale constante (pression brutale) ; volume brutal : « un peu plus chaud », non chiffré.
- **Pas à pas** : un grain de sable (50 g par défaut, ΔP ≈ 245 Pa : au-dessus du seuil d'équilibre de 0,1 %, un grain de 20 g passait inaperçu) ou un pas de P_air (1 kPa) par clic, répété si le bouton est maintenu ; les clics successifs forment une seule étape (`tfEtapeRouvrir` retire la lettre d'arrivée si le gaz l'a atteinte entre deux). Une étape dont la charge ou P_air a changé n'est jamais retirée du journal comme « sans effet ».
- **Courbes de référence** : par l'état de la ligne sélectionnée du journal (A compris), sinon par le départ de l'étape en cours.

Test (banc Chrome headless) : cycle de Carnot complet en quatre manières réversibles (adiabatique jusqu'à 400 K visée par l'arrivée prévue, source chaude « = T gaz », isotherme, adiabatique jusqu'à 293 K, source froide, isotherme jusqu'au volume de A par le menu) : retour à A à 0,05 K et 0,02 kPa près, S créée 0,07 mJ/K depuis A.

### 10.8 Palier R4b : panneau épuré (fait)

**Constat de l'auteur après R4a.** Encore trop fouillis : trop de texte, le choix enceinte / masses introuvable (en bas, dans Montage et gaz), la scène identique dans les deux montages, la vitesse repliée, le pas à pas peu ergonomique. Exigence : **tout centralisé dans la carte**, aucune commande sur la scène.

```
[ ⏸ Pause ] [ ↺ RAZ ]
Vitesse ──────●────── ×1 [Auto]
[ Air de l'enceinte ] [ Masses posées ]          ← en tête ; recommence (confirmation si étapes)
Piston [ Tenu ] [ Libre ]
Fond   [ Isolant ] [ Chaude 400 K ] [ Froide 293 K ]   ← clic sur la température : saisie, = T gaz
[ Volume ] [ Pression ] [ Température ]
[−] [ 15 ] cm [+] [État ▾]
→ 0,300 L · 264 kPa · 387 K
[ Brutalement ] [ Quasi statiquement ] [ Réversiblement  = quasi statiquement ] [ Pas à pas  1 cm par clic ]
[ Interrompre ] [ ↶ Annuler l'étape ]
▸ Réglages fins
```

- **Scène selon le montage** (`tf.montage`) : enceinte, fond crème, cloche, manomètre, air teinté, pas de plateau ; masses, fond bleu clair d'air libre, portique qui porte le vérin, « air libre · 1 atm », plateau épais.
- **Pas à pas = quatrième manière**, un mode : − et + du champ agissent à chaque clic (grain de sable, 1 kPa, 1 cm de vérin à 150 m/s, échelon de 1 K de la source), maintenus ils répètent ; le champ, en lecture seule, montre la valeur actuelle ; les trois autres manières sont grisées. Les − et + ne sont jamais désactivés pendant une action (un bouton désactivé sous le doigt n'enverrait pas le pointerup qui arrête la répétition).
- **Texte retiré** : phrases sous les manières (remplacées par « = quasi statiquement » sur le bouton Réversiblement), sous le fond, « Actuellement… » ; arrivée prévue en une ligne (→, puis « brutalement → » quand elle est chiffrée). Seule phrase restante : agir sur la température avec le cylindre sur l'isolant.
- **Sources 1 et 2** (demande de l'auteur, après R4b) : plus de « chaude » ni de « froide » (`tf.fond` = '1' ou '2', `tf.T1`, `tf.T2`). Chaque onglet de source porte une flèche ▾ qui déroule, par-dessus la carte, le réglage de sa température : − champ + (10 K), « = T gaz » ; chaque réglage s'applique aussitôt ; un clic ailleurs, Échap ou la flèche le referment. Source sous le cylindre : réglage grisé (Agir sur Température).

### 10.9 Palier R4c : conditions, puis viser ou agir à la main (fait)

**Constat de l'auteur après R4b.** Interface encore complexe et peu jolie, surtout le pas à pas : une « manière » qui changeait le rôle de − et +, figeait le champ et grisait les autres boutons. On ne distinguait pas l'état (piston, fond) de l'action.

**Principes.** Ce qui recommence l'expérience est replié à part ; les contraintes sont des états, et la nature de la transformation en découle ; agir se fait de deux façons, viser une valeur ou à la main, sur les deux seuls organes du dispositif : le piston et la source.

```
Contrôle        [ Pause ] [ RAZ ]   Vitesse ──●── ×1 [Auto]
▸ État initial  enceinte · di · 293 K · 30 cm      ← replié ; montage, γ, T0, hauteur (réinitialisent)
Conditions      Piston [ Tenu ] [ Libre ]
                Fond   [ Isolant ] [ Source 1 ▾ ] [ Source 2 ▾ ]
Transformation  [ Viser une valeur ] [ À la main ]
  Viser :       [ Agir sur le piston ] [ Agir sur la source ]   ← la source grisée sur l'isolant
                Hauteur visée du piston  [−] [ 15 ] cm [+] [État ▾]
                Compression adiabatique → 0,300 L · 264 kPa · 387 K
                ▌Brutale 0,5 ms   ▌Quasi statique 1 s   ▌Réversible   (liseré rouge, ambre, vert)
                pendant l'action : [████░░ Quasi statique · reste 0,6 s] [■]
  À la main :   ● Équilibre : pas suivant possible   (orange : attendre le vert)
                Vérin  adiabatique          28,0 cm  [▼ 1 cm] [▲ 1 cm]  Pas ──●──
                Source 1  isochore           400 K   [− 1 K] [+ 1 K]    Pas ──●──
                Étape en cours : 12 pas, dont 3 sans attendre l'équilibre
Étapes          … [↶ Annuler la dernière]
```

- **Grandeur déduite des conditions** (`_tfOrgane`, `_tfCleOrgane`) : piston tenu → hauteur (vérin) ; libre → P_air ou masse de sable selon le montage ; source → T_source. Plus de « Volume / Pression / Température » : cliquer Volume tenait le piston à la place de l'élève, qui ne voyait pas que c'est tenir le piston qui rend la transformation isochore. Agir sur la pression d'un piston tenu passe désormais par Libre (lui-même une transformation brutale s'il n'est pas équilibré).
- **Nature** (`_tfNature`) : piston sur l'isolant, adiabatique ; piston sur une source, « isotherme si lente » ; source, isochore (tenu) ou isobare (libre). Écrite dans l'arrivée prévue (« Compression adiabatique ») et sur chaque carte d'organe.
- **À la main** : le voyant reprend `tfMesures().equilibre`. Chaque pas compte (`nbPas`) et, s'il part hors équilibre, `nbHors` : c'est la différence entre quasi statique et brutal en petits morceaux. Pas en 1-2-5 (`TF_PAS_ESC`, six crans) : 1 mm à 5 cm, grains de 10 à 500 g, 0,5 à 20 kPa, 0,5 à 20 K ; le même pas sert aux marches des escaliers des réglages fins.
- **Progression** (`_tfMajProgres`, `_tfLance`) : vérin ou rampe continue ; ■ = Interrompre.
- **Réglages fins supprimés** (après R4c) : la durée libre et l'escalier automatique faisaient double emploi avec les trois manières et le mode À la main, et les textes « Transformation attendue » et durées caractéristiques avec les graphes et la nature affichée. Seul se perd le régime intermédiaire du vérin (τ de quelques ms : ondes pendant la course, état final proche du réversible), à retrouver autrement si besoin. Le moteur garde ses escaliers (`tfAppliquer` avec un pas), inutilisés par le panneau.

### 10.10 Palier R4d : état initial = point de départ A (fait)

```
ÉTAT INITIAL                  enceinte · di · 100 kPa · 0,6 L · 293 K  ›
  Dispositif
    Pression exercée par  [ Air de l'enceinte | Masses posées ]
    Gaz                   [ Mono | Di | Poly ]          γ = 1,40
  Point de départ A
    P₀  [−][  100 kPa  ][+]
    V₀  [−][   0,6 L   ][+]
    T₀  [−][   293 K   ][+]
    n = 24,6 mmol · hauteur 30 cm (· masse posée … kg)
  [ Pas encore appliqué : des étapes sont faites.
    ↺ Recommencer depuis A   Rétablir ]
```

- **Deux natures de réglages** : le dispositif (ce qui ne change pas pendant l'expérience) et le point A, premier point des diagrammes PV et TS et première ligne des Étapes : pour un cycle, on part de n'importe quel point du plan.
- **Valeurs par défaut rondes** : P_atm = 100 kPa (1 bar, au lieu de 101,325 kPa), d'où P₀ = 100 kPa avec les deux montages (P_atm + 5 Pa de piston), T₀ = 293 K, source 2 à 293 K. Les cibles de validation plus haut (P₀ = 101,33 kPa, 293,15 K) datent d'avant.
- **P₀ réglable** ; n = P₀V₀/(RT₀) s'en déduit. Air de l'enceinte : P_air = P₀ (au poids du piston près), de 20 à 500 kPa. Masses posées : à l'air libre, P₀ fixe la masse posée au départ (un bloc), de P_atm à 40 kg posés (≈ 298 kPa) ; changer de montage ramène P₀ dans ces bornes.
- **Plus de curseurs** : champs − valeur + comme la valeur visée (pas 10 kPa, 0,05 L, 10 K, vers le multiple voisin), saisie au clavier ; γ seulement par les trois onglets, affiché à droite.
- **Brouillon** : sans étape, un réglage s'applique aussitôt ; avec des étapes, rien n'est effacé, un encart propose « Recommencer depuis A » (= RAZ, qui applique toujours le brouillon) ou « Rétablir » ; le résumé du titre replié commence alors par ✎. Remplace la confirmation au changement de montage.
- **Reste ouvert** : faire glisser le point A sur le diagramme de Clapeyron quand la section est ouverte.

### 10.11 Palier R4e : frise des étapes (fait)

```
ÉTAPES                                        ↶ Annuler la dernière
┌──────────────────────────────────────────────────────────────┐
│ ○ A  0,600 L · 100,0 kPa · 293,0 K                      ↺ A  │
│ ┆  Compression adiabatique  (brutale)                        │
│ ┆  P_air → 150 kPa · isolant · S créée 12,67 mJ/K            │
│ ○ B  0,457 L · 150,0 kPa · 334,9 K                      ↺ B  │
│ │  Compression adiabatique  (quasi statique)                 │
│ │  P_air → 250 kPa · 1,00 s · isolant · S créée 0,00 mJ/K    │
│ ○ C  …                                                       │
└──────────────────────────────────────────────────────────────┘
```

- **Points et traits** : les états (cercle blanc cerclé de la couleur de l'étape qui y arrive, comme les lettres du diagramme) et les transformations (trait de la couleur de l'étape). Point « en cours… » qui pulse, ou cerclé en pointillés si l'étape a été interrompue avant l'équilibre.
- **Trait plein ou pointillé** selon ce qui s'est passé, pas selon la manière : `nonDef` passe à vrai dès qu'un échantillon des graphes a P ou T non définie (`tfEtapesSuivre`), comme le chemin du diagramme. Une compression quasi statique reste pleine ; une brutale, une mise en contact avec une source plus chaude ou des pas faits hors équilibre sont pointillés.
- **Titre = nature** (`_tfTitreEtape`) : Compression, Détente, Chauffage, Refroidissement + adiabatique (isolant), isotherme (piston sur une source, lentement), monotherme (piston sur une source, brutalement ou avec des pas hors équilibre), isochore ou isobare (source). Puce de la manière aux couleurs des boutons ; détail : consigne, durée, fond, pas hors équilibre, S créée (de `bilan0` à `bilan1`, relevé à l'arrivée).
- **Deux clics** : point → courbes de référence par cet état (`selEtat`, remplace `selA`, valable pour toutes les lettres) ; trait → étape mise en évidence et Bilan de cette étape (de son départ à son arrivée). Plus de phrase d'aide sous la frise.
- **Cycles** : fait au palier R4f (§10.12).

### 10.12 Palier R4f : cycles (fait)

- **Retour à un état déjà noté** (`_tfEtatDejaVu`, à l'arrivée d'une étape) : à 0,5 % près sur V et P et 0,5 K près sur T (`TF_RETOUR_VP`, `TF_RETOUR_T`), l'état reprend la lettre (état `retour`), le départ de l'étape exclu. La lettre n'est pas redessinée sur les diagrammes ni répétée dans le menu État ; la suivante ne compte pas les retours (A, B, C, D, A, puis E).
- **Cycle fermé** (`_tfCycleFerme`) : de la dernière étape partie de cette lettre à celle qui y revient ; pastille **⟳ cycle** sur le point de la frise.
- **Bilan** : la colonne Cycle remplace « Depuis A » (le dernier cycle fermé, ou celui qui contient l'étape cliquée) ; ΔU et ΔS du gaz y sont presque nuls. Dessous, en phrases : moteur (W < 0), rendement η = −W / Q_abs, comparé à Carnot entre les températures extrêmes des sources touchées pendant le cycle ; récepteur (W > 0), efficacités frigorifique Q_abs / W et de pompe à chaleur Q_cédée / W ; travail net sous 1 % de Q_abs : « ni moteur ni récepteur ». Q_abs : chaleur absorbée, somme des seuls apports positifs (`tf.Qabs`, dans les instantanés).
- **Validation** (banc) : Stirling sans régénérateur entre les sources à 293 et 400 K, V 0,6 ↔ 0,3 L, n = 24,6 mmol. Isothermes quasi statiques : W = −15,22 J (théorie nR·ΔT·ln 2 = 15,2 J), Q_abs = 111,6 J (théorie 111,4 J), η = 0,14 contre 0,27 pour Carnot. Isothermes brutales : W = +0,83 J pour 103 J absorbés, ni moteur ni récepteur (S créée 97 mJ/K).
