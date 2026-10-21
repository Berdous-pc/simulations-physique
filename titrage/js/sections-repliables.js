/* ══════════════════════════════════════════════════════════════════
   sections-repliables.js — TEST (branche test-sections-repliables)
   Associe aux titres de section marqués data-repliable un bouton
   masquer/afficher qui replie les commandes de la section
   (les sections essentielles ou à un seul élément restent fixes).
   Aucune modification du HTML : au chargement, les éléments qui suivent
   chaque .section-title (jusqu'au prochain <hr class="sep">) sont
   regroupés dans un conteneur .section-body.
   Auteur : Mathieu Berdous — berdouspc.com
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  document.querySelectorAll('#panel-body .section-title[data-repliable]').forEach(function (titre) {
    // Récupère les frères suivants jusqu'au séparateur (ou la fin du bloc)
    var suivants = [];
    for (var el = titre.nextElementSibling; el && !el.classList.contains('sep'); el = el.nextElementSibling) {
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
      btn.title = replie ? 'Afficher les commandes de cette section'
                         : 'Masquer les commandes de cette section';
      btn.setAttribute('aria-expanded', String(!replie));
    }
    btn.addEventListener('click', basculer);
    titre.addEventListener('click', function (e) { if (e.target !== btn) basculer(); });

    // Sections repliées par défaut
    basculer();
  });
})();
