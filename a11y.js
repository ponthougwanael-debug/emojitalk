"use strict";

/* ============================================================
   EmojiTalk — a11y.js
   Améliorations d'accessibilité et de confort, ajoutées en
   surcouche de script.js (sans le modifier) :
   1. aria-current + déplacement du focus au changement de vue
   2. État vide automatique pour la liste des conversations
   ============================================================ */

(function () {

  /* ------------------------------------------------------------
     1. NAVIGATION : aria-current + focus sur le titre de la vue
     Quand on clique sur un onglet de la barre du bas :
     - l'onglet actif reçoit aria-current="page" (lecteurs d'écran)
     - le focus est déplacé sur le titre de la nouvelle vue,
       sinon un visiteur au clavier / lecteur d'écran ne sait pas
       que la page a changé.
     ------------------------------------------------------------ */
  var nav = document.getElementById("bottomNav");
  if (nav) {
    // Vue affichée -> élément de titre à focus
    var headingOf = { feed: "feedView", messages: "messagesView", settings: "settingsView" };

    // État initial : le bouton actif au chargement est marqué
    var initial = nav.querySelector("button.active");
    if (initial) initial.setAttribute("aria-current", "page");

    nav.addEventListener("click", function (ev) {
      var btn = ev.target.closest("button[data-view]");
      if (!btn) return;

      // Mise à jour de aria-current sur tous les onglets
      var buttons = nav.querySelectorAll("button");
      for (var i = 0; i < buttons.length; i++) {
        if (buttons[i] === btn) buttons[i].setAttribute("aria-current", "page");
        else buttons[i].removeAttribute("aria-current");
      }

      // Déplacement du focus sur le titre de la vue affichée.
      // Petit délai : script.js vient de basculer l'affichage.
      setTimeout(function () {
        var view = document.getElementById(headingOf[btn.getAttribute("data-view")]);
        if (!view || view.style.display === "none") return;
        var h = view.querySelector("h2");
        if (h) {
          h.setAttribute("tabindex", "-1"); // nécessaire pour focus() sur un non-champ
          h.focus({ preventScroll: true });
        }
      }, 0);
    });
  }

  /* ------------------------------------------------------------
     2. MESSAGES : état vide de la liste des conversations
     Si renderConvs() (script.js) ne génère aucune conversation,
     on affiche un message d'accueil avec un rappel comment
     démarrer. Un MutationObserver surveille la liste : le message
     disparaît dès qu'une conversation apparaît.
     ------------------------------------------------------------ */
  var convList = document.getElementById("convList");
  if (convList && typeof MutationObserver !== "undefined") {

    function refreshEmptyState() {
      var existing = document.getElementById("convEmptyState");
      var hasItems = convList.querySelector(".conv-item");

      if (!hasItems) {
        if (!existing) {
          var d = document.createElement("div");
          d.className = "empty";
          d.id = "convEmptyState";
          d.setAttribute("role", "status");
          d.textContent = "Aucune conversation pour le moment. Clique sur \uD83D\uDCAC MP sous un post du feed pour discuter avec son auteur !";
          convList.appendChild(d);
        }
      } else if (existing) {
        existing.remove();
      }
    }

    var observer = new MutationObserver(refreshEmptyState);
    observer.observe(convList, { childList: true });
  }

})();
