# Plan — onglet « Transformations » de la page Gaz parfait

> Document de planification (aucun code écrit). À relire avant chaque palier ; à fondre dans
> `ARCHITECTURE.md` une fois l'onglet terminé.

---

## 0. Décisions prises

| Sujet | Décision |
|---|---|
| Emplacement | 2ᵉ onglet de `pression/` (le dossier garde son nom ; seuls les titres visibles deviennent « Gaz parfait ») |
| Niveau | **CPGE** — première carte de ce niveau sur le site, assumé |
| Gaz | Air diatomique par défaut (γ = 1,40), γ réglable par l'utilisateur |
| Moteur physique | **Gaz découpé en tranches horizontales** (modèle 1D lagrangien), pas de dynamique moléculaire |
| Molécules | Oui, **décoratives** : elles suivent la densité et la température des tranches, sans être le moteur |
| Grandeurs | **Réalistes** (SI, pression atmosphérique incluse, masses en kg) |
| Célérité du son | **Réelle par défaut** ; case « Ondes exagérées » en option pour la démonstration (§2.3) |
| Ralenti | Jusqu'à ×1/5000 pour regarder l'équilibre mécanique s'établir (§5) |

---

## 1. Dispositif et ordres de grandeur

Cylindre vertical fermé par un piston mobile sans frottement ; au-dessus, l'atmosphère.

| Grandeur | Valeur | Commentaire |
|---|---|---|
| Section S | 20 cm² (Ø ≈ 5 cm) | Petite section : quelques dizaines de kg suffisent à doubler ou tripler la pression |
| Hauteur initiale | 30 cm → V₀ = 0,60 L | |
| Masse du piston | 1 kg | |
| P_atm | 1,013·10⁵ Pa | |
| T₀ | 293 K (20 °C) | |
| P₀ | P_atm + Mg/S ≈ 1,062·10⁵ Pa | |
| n | ≈ 0,026 mol (calculée, non réglée) | |
| Masses « brutales » | 10 / 20 / 40 kg au choix | |
| Grain de sable | 5 à 100 g (curseur), défaut 50 g | 50 g ↔ ΔP ≈ 245 Pa |

**Pourquoi S = 20 cm² ?** Avec une section de 100 cm², même 50 kg ne font passer P que de 1,03 à 1,52·10⁵ Pa, et les états finaux irréversible / réversible ne diffèrent que de 1 % : rien de visible sur le diagramme PV. À 20 cm², les écarts deviennent nets (calculs Python, γ = 1,4, calorifugé) :

| Masse ajoutée | P_ext / P₀ | Brutal : T_f, V_f | Réversible (Laplace) : T_f, V_f | Isotherme : V_f | Période d'oscillation du piston |
|---|---|---|---|---|---|
| 10 kg | 1,46 | 332 K, 0,465 L | 327 K, 0,457 L | 0,410 L | 0,48 s |
| 20 kg | 1,92 | 370 K, 0,394 L | 353 K, 0,376 L | 0,312 L | 0,53 s |
| 40 kg | 2,85 | 448 K, 0,322 L | 395 K, 0,284 L | 0,211 L | 0,55 s |

Ces valeurs servent de **cibles de validation** (§7).

---

## 2. Modèle physique

### 2.1 Gaz en tranches (lagrangien 1D)

- **N ≈ 40 tranches** de même masse ; chaque tranche porte sa masse volumique, son énergie interne massique e, sa pression P = (γ − 1)·ρ·e et sa température T = P/(ρ·r).
- Interfaces entre tranches : position z et vitesse u (grille décalée). L'interface du bas est le fond (fixe), celle du haut est le **piston**.
- Équations : conservation de la quantité de mouvement par tranche, puis de l'énergie (de = −(P + q)·dv + conduction).
- **Viscosité artificielle q** (type von Neumann–Richtmyer + terme linéaire) : c'est elle qui amortit les oscillations et qui **dissipe dans le gaz**. C'est indispensable pour que l'état final brutal soit celui du cours, n·Cv·(T_f − T₀) = −P_ext·(V_f − V₀). Un frottement solide sur le piston fausserait ce bilan (où irait la chaleur ?).
- Piston : (M + m_ajoutée)·a = (P_tranche_haute − P_atm)·S − (M + m)·g. Loquet = vitesse du piston forcée à 0.
- Pesanteur dans le gaz : négligée (ρgh ≈ 4 Pa, sans intérêt ici).
- Schéma explicite saute-mouton, sous-pas imposés par la condition CFL (dt < dz/c) et par la stabilité de la conduction. Coût : 40 tranches × quelques centaines de sous-pas par image, très en deçà de l'onglet molécules.

### 2.2 Échanges thermiques

- La chaleur entre **par le fond** du cylindre, posé sur la source (four ou bain). Les parois latérales et le piston sont isolés. Ce choix crée un vrai gradient de T le long du cylindre, donc un état visiblement non uniforme.
- Flux au fond : Φ = G·(T_ext − T_tranche_basse), où G est la conductance de la paroi du fond (curseur **Isolation**, de « calorifugé » G = 0 à « diathermane »).
- Dans le gaz : conduction entre tranches avec une **diffusivité effective** (elle englobe la convection, non modélisée). La valeur moléculaire de l'air (2·10⁻⁵ m²/s) donnerait un temps de mise en équilibre d'une demi-heure. Cible : 10 à 30 s.

### 2.3 Célérité du son et compromis (à dire dans le bandeau Informations)

**Ce que donne la physique réelle.** Une onde traverse 30 cm en 0,9 ms, environ 500 fois moins que la période du piston (≈ 0,5 s). Le piston, lourd, reste lent devant le son (< 2 m/s contre 343 m/s) : le gaz uniformise sa pression à chaque instant. Estimations pour 40 kg posés brutalement (à vérifier au palier 1) :
- écarts dus à l'accélération du piston : ρ·a·h ≈ 2 × 10 × 0,2 ≈ 4 Pa sur ≈ 2·10⁵ Pa, soit ~0,002 % ;
- ondes émises par le piston : ~ρ·c·Δu, faibles car le piston part de vitesse nulle ; même une masse lâchée de quelques centimètres reste vers 1 %.

**Conséquence pédagogique (message CPGE).** Lors d'une transformation brutale avec ce dispositif, ce qui est hors équilibre, c'est le **système {gaz + piston}** : le piston oscille, P_gaz ≠ P_ext, alors que la pression du gaz est presque uniforme. « Brutal » ne veut pas dire « gaz inhomogène ». L'inhomogénéité réelle porte surtout sur la **température** (échanges par le fond, cf. 2.2), et c'est là que la non-définition se voit le mieux.

**Choix retenus :**
1. **Célérité réelle par défaut.** Aucune déformation de la mécanique du gaz.
2. **Ralenti extrême** (curseur Vitesse jusqu'à ×1/5000, §5) : on regarde les petites ondes faire des allers-retours et la pression s'uniformiser. Coût de calcul : ~750 sous-pas par image à ×1 (CFL : dt < dz/c ≈ 20 µs), ~1 sous-pas par image au ralenti extrême ; dans les deux cas très léger.
3. **Loupe sur le profil de pression** (§3, option d'affichage) : P(z) − P̄ tracé le long du cylindre avec une **échelle amplifiée** affichée (×100, ×1000…, choisie automatiquement), pour voir les écarts tout en lisant leur vraie valeur en Pa.
4. **Case « Ondes exagérées »** (section Affichage, décochée par défaut) : ralentit les ondes par un **facteur d'inertie du gaz** dans l'équation du mouvement uniquement, pour que l'aller-retour dure environ un tiers de la période du piston. L'équation d'état, les bilans d'énergie et les états d'équilibre restent exacts. Une étiquette « ondes exagérées » reste affichée sur la scène tant que la case est cochée. Changer la case réinitialise l'expérience.
5. **Échanges thermiques accélérés** (diffusivité effective, cf. 2.2) : seul compromis permanent.
6. Le **temps affiché** est le temps simulé, en ms aux crans de ralenti extrême, en s sinon.

**Amortissement.** Avec la célérité réelle, la viscosité artificielle amortit à la fois les ondes et les oscillations du piston. Le réglage cible : piston amorti en 3 à 5 oscillations ; les ondes, plus rapides, s'éteignent bien avant. Dans la réalité, cet amortissement vient surtout des échanges thermiques avec les parois et des frottements : la phrase du bandeau Informations le dit, sans entrer dans la modélisation.

### 2.4 Critère « grandeurs définies »

Deux niveaux, puisque le gaz peut être quasi uniforme alors que le système ne l'est pas (§2.3) :

- **Grandeurs du gaz définies** (pilote les « ? » de P et T) :
  - P définie si l'écart relatif max entre tranches < 0,1 % (seuil assez fin pour que les ondes exagérées le franchissent, assez large pour que le bruit numérique ne le déclenche pas) ;
  - T définie si l'écart max entre tranches < 0,5 K.
- **Système à l'équilibre** (pilote le badge « À l'équilibre / Hors équilibre » et le tracé PV) : P et T définies **et** piston au repos (énergie cinétique macroscopique < 10⁻⁴ de l'énergie interne) **et** P_gaz = P_ext à 0,1 % près.

Ainsi, pendant les oscillations du piston en célérité réelle, P du gaz s'affiche mais le badge reste « Hors équilibre », et le diagramme PV ne trace pas de point d'équilibre. Seuils à régler à l'usage.

### 2.5 γ réglable

- Section repliable **Gaz** : boutons Monoatomique (5/3), Diatomique (7/5, défaut), Polyatomique (4/3), plus un curseur libre 1,05 à 1,67.
- Cv = R/(γ − 1). Changer γ **réinitialise l'expérience** : changer de gaz en cours de route n'a pas de sens physique.

---

## 3. Scène (canvas)

Rendu en colonne, de bas en haut :

1. **Source thermique** sous le cylindre : rien (air ambiant à T_ext), plaque chauffante (rouge si T_ext > T₀) ou bain thermostaté (bleu si T_ext < T₀). La couleur suit T_ext. Le calorifugeage du fond est dessiné en hachures, plus épaisses si G est faible.
2. **Cylindre** : gaz coloré en dégradé selon la T de chaque tranche (option), plus les **molécules décoratives**.
3. **Piston** + plateau ; **masses** empilées (disques marqués 10/20/40 kg) ; **tas de sable** qui grossit ; **entonnoir** au-dessus quand le versement est actif ; grains en chute.
4. **Loquet** : deux goupilles qui traversent le cylindre au-dessus du piston, en surbrillance quand il est verrouillé.
5. **Sondes** (option) : trois thermomètres et manomètres miniatures sur le flanc (haut / milieu / bas). Pendant une transformation brutale, **ils n'affichent pas la même valeur**. C'est la démonstration la plus directe que « la température du gaz » n'existe pas à cet instant.
6. **Échelle verticale** en cm à côté du cylindre (le volume se lit en hauteur × S).
7. **Loupe sur le profil de pression** (option) : à côté du cylindre, à la même hauteur, la courbe P(z) − P̄ tranche par tranche, axe horizontal centré sur 0, échelle amplifiée affichée en clair (« ×1000 » et graduations en Pa). C'est l'outil qui rend visibles, au ralenti, les ondes en célérité réelle.

**Molécules décoratives** : environ 150 points. Chacune est rattachée à une tranche et advectée avec elle ; leur nombre par tranche suit la masse volumique, leur agitation est proportionnelle à √T. Elles ne rebondissent pas entre elles et n'ont aucune influence sur la physique.

---

## 4. Graphes

Disposition : la scène à gauche, la colonne de graphes à droite, avec un splitter horizontal entre le **diagramme PV** (en haut, le plus grand) et les **graphes temporels** (en bas, un seul canevas découpé en trois cases T(t), P(t), V(t), comme `cinematique/`).

### 4.1 Graphes temporels

- **V(t)** : toujours défini (position du piston) → courbe pleine.
- **T(t), P(t)** : courbe pleine à l'équilibre. Hors équilibre, **bande min–max des tranches** hachurée, avec la mention « non définie ». La moyenne n'est pas tracée : ce serait suggérer qu'elle a un sens.
- Repères en pointillés : **P_ext** = P_atm + (M + m)g/S sur P(t) ; **T_ext** sur T(t).
- Axe des temps : **fenêtre glissante dont la largeur suit le cran de vitesse** (de quelques ms au ralenti extrême à quelques dizaines de s aux crans rapides), unité ms ou s selon la fenêtre. L'historique complet reste enregistré : bouton « Adapter » pour tout revoir.
- Les bandes min–max de P(t) sont minces en célérité réelle ; le zoom permet de les voir. Outils repris d'`ondes/` et `radioactivite/` : zoom rectangle, vue précédente, réticule.

### 4.2 Diagramme PV (Clapeyron)

- Les **états d'équilibre** sont tracés en points pleins, reliés par une courbe pleine quand on passe de l'un à l'autre en restant à l'équilibre (quasi statique).
- Hors équilibre, **aucun point du gaz n'est tracé**. Les états initial et final sont reliés par un pointillé gris avec la mention « chemin non défini ».
- Option **« Pression exercée par le piston »** : trajectoire (V, P_piston) en tireté. L'aire sous cette courbe est le travail reçu, W = −∫P_piston dV, juste même hors équilibre.
- Options **courbes théoriques** passant par l'état initial de la transformation en cours : isotherme (PV = cte) et adiabatique réversible (PV^γ = cte).
- **Le zoom sur le versement de sable** montre l'escalier de micro-transformations brutales, qui épouse la courbe réversible quand les grains sont fins. C'est l'idée de transformation « brutale mais infinitésimale ».

---

## 5. Panneau (onglet Transformations)

Structure canonique (§5 de CONTEXTE_PROJET). « (R) » = section repliable.

1. **Contrôle** : Pause / Réinitialiser ; curseur **Vitesse** élargi à crans (×1/5000 / ×1/1000 / ×1/100 / ×0,1 / ×1 / ×5 / ×20). Les crans lents servent à regarder l'équilibre mécanique s'établir, les crans rapides à attendre les équilibres thermiques et le versement de sable. Affichage du cran en clair (« ×1/1000 »).
2. **Masses** : sélecteur 10 / 20 / 40 kg ; bouton **Poser la masse** (avec loquet fermé : l'expérience se prépare au repos) ; bouton **Loquet : verrouillé / libéré** ; bouton **Retirer les masses** (détente brutale, symétrique).
3. **Sable** : curseur masse d'un grain (5 à 100 g) ; boutons **Un grain** et **Verser / Arrêter** (débit réglable) ; **Retirer le sable**. Afficheur : masse de sable posée.
4. **Thermique** : curseur **Isolation** (calorifugé ↔ diathermane) ; curseur **T_ext** avec deux modes en sous-onglets : **Échelon** (T_ext saute à la valeur choisie) et **Rampe** (T_ext monte ou descend de 1 K toutes les x s jusqu'à la consigne).
5. **Gaz** (R) : γ (cf. 2.5) ; T₀, V₀ initiaux (pris en compte au Réinitialiser).
6. **Affichage** (R) : molécules, dégradé de température, sondes, loupe sur le profil de pression, pression du piston sur PV, isotherme, adiabatique, **ondes exagérées** (réinitialise l'expérience).
7. **Bilan** (R, niveau CPGE) : W reçu, Q reçu, ΔU (avec vérification ΔU = W + Q), et **entropie créée** S_c = ΔS − Q/T_ext. La comparaison brutal / sable en fait un résultat chiffré.

Afficheurs permanents (overlay sur la scène, comme `#info-panel`) : **P, V, T** (« ? » hors équilibre, en terracotta), P_ext, T_ext, badge **À l'équilibre / Hors équilibre**.

Bandeau **Informations** : mode d'emploi de la page (préparer avec le loquet, ralentir pour voir le piston et les ondes, verser le sable, régler l'isolation…), puis une phrase par compromis : échanges thermiques accélérés, ondes exagérées quand la case est cochée, origine réelle de l'amortissement.

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
    ├── tf-sim.js                    ← NOUVEAU : état tf, moteur en tranches, piston, thermique, critère d'équilibre, bilans
    ├── tf-scene.js                  ← NOUVEAU : rendu cylindre, masses, sable, source, sondes, molécules décoratives
    ├── tf-graph.js                  ← NOUVEAU : graphes temporels + diagramme PV, outils zoom/réticule
    ├── tf-ui.js                     ← NOUVEAU : commandes du panneau, boucle de l'onglet
    ├── ui.js                        ← + bascule d'onglets, deep-linking, suspension des boucles
    └── sections-repliables.js       (chargé en dernier)
```

Ordre de chargement : `sim.js` → `recipient.js` → `tf-sim.js` → `tf-scene.js` → `tf-graph.js` → `tf-ui.js` → `ui.js` → `sections-repliables.js`.

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
| Sable fin, calorifugé | état final → Laplace (écart décroissant quand le grain diminue) |
| Sable lent, diathermane | état final → isotherme |
| Échelon de T_ext, piston libre | V_f/V₀ = T_ext/T₀ (isobare) |
| Bilan | ΔU = W + Q à 10⁻³ ; S_c ≥ 0 toujours, → 0 pour le sable fin et lent |
| Changement de γ | états finaux recalculés justes pour 5/3 et 4/3 |
| Célérité réelle | onde lancée par une petite impulsion du piston : aller-retour en 2L/c ≈ 1,75 ms à 5 % près |
| Uniformité en célérité réelle | 40 kg posés brutalement : écart relatif de P entre tranches de l'ordre de 10⁻⁵ à 10⁻⁴ (confirme les estimations du §2.3) |
| Ondes exagérées | mêmes états finaux qu'en célérité réelle (le facteur ne doit rien changer aux équilibres) |
| Ralenti extrême | à ×1/5000 et à ×20, même trajectoire du piston pour un même temps simulé |
| Stabilité | aucune valeur NaN, pas de tranche d'épaisseur négative, à ×20 et pour 40 kg |

---

## 8. Paliers

1. ✅ **Moteur + scène minimale** (terminé ; les onglets et le deep-linking du palier 7 ont été avancés ici pour pouvoir tester la page, résultats des tests dans `ARCHITECTURE.md`) : `tf-sim.js` complet en célérité réelle (tranches, piston, loquet, masses, Isolation), curseur Vitesse avec ralenti extrême, rendu simple du cylindre, afficheurs P, V, T. Tests du §7 lignes 1 à 4 et célérité réelle / uniformité / ralenti.
2. **Mise en évidence du hors-équilibre** : critère à deux niveaux, « ? » dans les afficheurs, badge d'équilibre, dégradé de température, sondes, loupe sur le profil de pression, case Ondes exagérées (et son test), molécules décoratives.
3. **Graphes** : T, P, V(t) avec bandes min–max, diagramme PV avec chemin non défini, pression du piston, courbes théoriques, outils de zoom.
4. **Sable** : grain unique, versement continu, entonnoir et tas, escalier visible au zoom. Tests lignes 5 et 6.
5. **Thermique** : source four/bain, échelon et rampe de T_ext. Test ligne 7.
6. **γ et Bilan** : section Gaz, section Bilan (W, Q, ΔU, S_c). Tests lignes 8 et 9.
7. **Intégration** : onglets dans `index.html`, adaptation de l'onglet existant (`.panel-title` → onglets, suspension de boucle), deep-linking, renommage visible « Gaz parfait », bandeau Informations, responsivité (fenêtre étroite : scène au-dessus des graphes).
8. **Site** : niveau **CPGE** sur l'accueil (nouvelle case de filtre `data-value="cpge"`, badge `.level-cpge` d'une nouvelle couleur, `data-levels="cpge"`), carte « Transformations d'un gaz parfait » (thème Thermodynamique), aperçu `assets/previews/pression-transformations.jpg`, `meta description` et `<title>` de la page mis à jour, sitemap (`lastmod`), `ARCHITECTURE.md`, tableau §8 et §9 de CONTEXTE_PROJET, mention de CPGE dans la `meta description` de l'accueil.

Chaque palier se termine par un commit et peut être montré en classe tel quel à partir du palier 3.

---

## 9. Points encore ouverts

- Valeur du facteur d'inertie de la case « Ondes exagérées » : à régler au palier 2 (cible : aller-retour ≈ 1/3 de la période du piston).
- Gamme des masses (10 / 20 / 40 kg) et section 20 cm² : à valider visuellement dès le palier 1.
- Dégradé de couleur : sur T (recommandé) ou sur la masse volumique ?
- Titre de la carte d'accueil de l'onglet existant : garder « Pression d'un gaz » ou passer à « Modèle cinétique d'un gaz parfait » ?
