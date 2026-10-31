"use strict";

/* ============================================================
   account.js — Suppression du compte
   ------------------------------------------------------------
   Permet de supprimer son compte : profil, posts, réponses et
   conversations. L'action est IRRÉVERSIBLE : une modale de
   confirmation avec avertissement s'affiche avant l'exécution.
   Ce fichier se branche sur script.js et supabase-sync.js sans
   les modifier (marque les posts comme supprimés via les pierres
   tombales + événement "emojitalk:account-deleted" pour le cloud).
   ============================================================ */

/**
 * Ouvre la modale de confirmation de suppression de compte.
 * Appelée par le bouton "Supprimer mon compte" des paramètres.
 */
function openDeleteAccountModal(){
  // Retire une modale déjà ouverte
  var old = document.getElementById("deleteAccountOverlay");
  if (old) old.remove();

  var ov = document.createElement("div");
  ov.id = "deleteAccountOverlay";
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  ov.setAttribute("aria-label", "Confirmer la suppression du compte");
  ov.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.88);z-index:300;display:flex;align-items:center;justify-content:center;padding:16px;";

  ov.innerHTML =
    '<div class="card" style="max-width:460px;width:100%;margin:0;position:relative;">' +
      '<h2 style="color:#f87171;">⚠️ Supprimer ton compte ?</h2>' +
      '<p style="color:#e2e8f0;font-size:.95rem;">Cette action est <strong style="color:#f87171;">irréversible</strong>. Elle supprimera définitivement :</p>' +
      '<ul style="color:#94a3b8;font-size:.9rem;margin:10px 0 16px 20px;line-height:1.7;">' +
        '<li>Ton profil (emoji, centres d\u2019intérêt, personnalité, pseudo)</li>' +
        '<li>Tous tes posts et tes réponses</li>' +
        '<li>Toutes tes conversations privées</li>' +
        '<li>Tes likes et tes signalements</li>' +
      '</ul>' +
      '<p style="color:#94a3b8;font-size:.85rem;">Il n\u2019y a aucun moyen de récupérer ton compte ou tes données ensuite.</p>' +
      '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">' +
        '<button type="button" id="deleteAccountCancel" style="flex:1;min-width:140px;">Annuler</button>' +
        '<button type="button" class="delete-btn" id="deleteAccountConfirm" style="flex:1;min-width:140px;margin:0;">🗑️ Supprimer définitivement</button>' +
      '</div>' +
    '</div>';

  ov.addEventListener("click", function (ev) {
    if (ev.target === ov) ov.remove(); // clic sur le fond = annuler
  });
  ov.querySelector("#deleteAccountCancel").addEventListener("click", function () { ov.remove(); });
  ov.querySelector("#deleteAccountConfirm").addEventListener("click", function () {
    ov.remove();
    deleteMyAccount();
  });

  // Échap = annuler
  document.addEventListener("keydown", function onEsc(ev) {
    if (ev.key === "Escape") { ov.remove(); document.removeEventListener("keydown", onEsc); }
  });

  document.body.appendChild(ov);
  ov.querySelector("#deleteAccountCancel").focus();
}

/**
 * Supprime réellement le compte :
 * 1. Marque tous ses posts/réponses comme supprimés (pierres tombales
 *    → jamais ré-upaloadés ni réintégrés, même par un navigateur périmé).
 * 2. Notifie supabase-sync.js pour supprimer les lignes du cloud.
 * 3. Vide le localStorage puis recharge la page (retour à l'onboarding).
 */
function deleteMyAccount(){
  // 1. Pierres tombales locales pour chacun de mes posts
  var myPosts = [];
  posts.forEach(function (p) { if (p.authorId === me.id) myPosts.push(p); });

  myPosts.forEach(function (p) {
    if (typeof markDeleted === "function") markDeleted(p.id); // empêche toute résurrection
  });

  // 2. Suppression cloud (toutes les lignes de cet auteur)
  document.dispatchEvent(new CustomEvent("emojitalk:account-deleted", {
    detail: { authorId: me.id, postIds: myPosts.map(function (p) { return p.id; }) }
  }));

  // 3. Nettoyage local complet (on CONSERVE les pierres tombales :
  //    ce sont elles qui empêchent les posts de revenir)
  [
    ME_KEY, POSTS_KEY, MSGS_KEY, VIEW_KEY,
    "emojitalk_onboarded", RATE_KEY
  ].forEach(function (k) { localStorage.removeItem(k); });

  showToast("🗑️ Compte supprimé. Au revoir ! 👋");
  setTimeout(function () { location.reload(); }, 800);
}
