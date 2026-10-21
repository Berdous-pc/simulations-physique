/* ══════════════════════════════════════════════════════════════════
   sections-repliables.js
   Associe aux titres de section marqués data-repliable un bouton
   masquer/afficher qui replie les commandes de la section
   (les sections essentielles ou à un seul élément restent fixes).
   Aucune modification du HTML : au chargement, les éléments qui suivent
   chaque .section-title sont regroupés dans un conteneur .section-body.
     - Structure canonique (.panel-section, cf. CONTEXTE_PROJET.md) :
       le titre est le 1er enfant du bloc, tout le reste du bloc est pris.
     - Ancienne structure « à plat » (titres et commandes frères) :
       arrêt au prochain .sep, au titre suivant ou à un bloc qui
       contient un titre, pour ne jamais avaler la section suivante.
   Copier ce fichier tel quel dans le js/ de chaque page.
   Auteur : Mathieu Berdous — berdouspc.com
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // Vrai si el marque le début de la section suivante
  function finDeSection(el) {
    return el.classList.contains('sep') ||
           el.classList.contains('section-title') ||
           el.querySelector('.section-title') !== null;
  }

  document.querySelectorAll('#panel-body .section-title[data-repliable]').forEach(function (titre) {
    // Récupère les frères suivants jusqu'à la fin de la section (ou du bloc)
    var suivants = [];
    for (var el = titre.nextElementSibling; el && !finDeSection(el); el = el.nextElementSibling) {
      suivants.push(el);
    }
    if (!suivants.length) return;

    // Conteneur des commandes de la section
    var corps = document.createElement('div');
    corps.className = 'section-body';
    titre.parentNode.insertBefore(corps, suivants[0]);
    suivants.forEach(function (el) { corps.appendChild(el); });

    // Bouton replier/déplier ajouté dans le titre
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'section-toggle';
    btn.title = 'Masquer les commandes de cette section';
    btn.setAttribute('aria-expanded', 'true');
    titre.appendChild(btn);

    function basculer() {
      var replie = corps.classList.toggle('collapsed');
      // Classe sur le titre : permet de supprimer sa marge basse une fois plié
      titre.classList.toggle('section-repliee', replie);
      btn.title = replie ? 'Afficher les commandes de cette section'
                         : 'Masquer les commandes de cette section';
      btn.setAttribute('aria-expanded', String(!replie));
      // Prévient la page (l'événement remonte jusqu'à la section) : utile quand
      // déplier une section doit aussi changer l'affichage de la simulation
      // (ex. interferences/ : valeurs lues en M sur le canvas).
      titre.dispatchEvent(new CustomEvent('sectionrepliee', {
        bubbles: true,
        detail: { repliee: replie }
      }));
    }
    btn.addEventListener('click', basculer);
    titre.addEventListener('click', function (e) { if (e.target !== btn) basculer(); });

    // Sections repliées par défaut
    basculer();
  });
})();
