"use strict";

/* ============================================================
   profile.js — Identité par emoji + profil au clic sur l'avatar
   ------------------------------------------------------------
   - Le pseudo ("Renard-42") n'est plus affiché dans les posts,
     les conversations ou le salon de chat : l'identité visible
     est l'emoji uniquement (l'avatar).
   - Un clic sur l'avatar ouvre une fiche profil : grand emoji,
     centres d'intérêt, personnalité, nombre de posts et liste
     de ses posts (cliquables pour les ouvrir).
   Ce fichier ne modifie NI script.js NI style.css : il s'branche
   sur le DOM après rendu via un MutationObserver.
   ============================================================ */

/* ------------------------------------------------------------
   1. RETROUVER LES INFOS D'UNE PERSONNE
   ------------------------------------------------------------ */

/**
 * Retourne le pseudo affiché (pour retrouver l'auteur) à partir
 * de la carte DOM. Le <strong> de l'en-tête contient "Pseudo emoji".
 * @param {HTMLElement} card - carte .post ou .conv-item
 * @returns {string} pseudo ou ""
 */
function readPseudoFromCard(card){
  var strong = card.querySelector(".post-head strong") || card.querySelector(".conv-info strong");
  if (!strong) return "";
  // Le pseudo est le texte sans l'emoji final
  return strong.textContent.replace(/\s*\S+$/,"").trim() || strong.textContent.trim();
}

/**
 * Retrouve l'auteurId d'une carte : par le texte du post d'abord
 * (fiable), puis par le pseudo en secours.
 * @param {HTMLElement} card
 * @returns {string|null}
 */
function findAuthorId(card){
  var pEl = card.querySelector("p");
  if (pEl) {
    var txt = pEl.textContent;
    for (var i = 0; i < posts.length; i++) {
      if (posts[i].text === txt) return posts[i].authorId;
    }
  }
  var pseudo = card.getAttribute("data-author-pseudo") || readPseudoFromCard(card);
  if (pseudo) {
    for (var j = 0; j < posts.length; j++) {
      if (posts[j].authorPseudo === pseudo) return posts[j].authorId;
    }
  }
  return null;
}

/** Infos d'affichage d'un auteur (emoji, intérêts, personnalité) */
function authorInfo(authorId){
  if (authorId === me.id) {
    return { emoji: me.emoji, interests: me.interests, personality: (me.personality || []) };
  }
  for (var i = 0; i < posts.length; i++) {
    if (posts[i].authorId === authorId) {
      return { emoji: posts[i].authorEmoji, interests: posts[i].authorInterests || [], personality: posts[i].authorPersonality || [] };
    }
  }
  return null;
}

/* ------------------------------------------------------------
   2. FICHE PROFIL (overlay)
   ------------------------------------------------------------ */

/**
 * Ouvre la fiche profil d'une personne dans une superposition.
 * @param {string} authorId - identifiant de l'auteur
 */
function openProfile(authorId){
  var info = authorInfo(authorId);
  if (!info) { showToast("Profil introuvable. 😕", "error"); return; }

  // Posts principaux de cette personne (les réponses exclues)
  var userPosts = posts.filter(function (p) {
    return p.authorId === authorId && !p.parentId;
  }).sort(function (a, b) { return b.date - a.date; });

  // Retire un overlay déjà ouvert
  var old = document.getElementById("profileOverlay");
  if (old) old.remove();

  var ov = document.createElement("div");
  ov.id = "profileOverlay";
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-label", "Profil de " + info.emoji);
  ov.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.85);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;";

  var h = '<div class="card" style="max-width:480px;width:100%;max-height:80vh;overflow-y:auto;position:relative;margin:0;">';
  h += '<button type="button" class="delete-btn" id="profileClose" aria-label="Fermer" style="position:absolute;top:10px;right:10px;margin:0;">✖</button>';

  // Grand emoji = identité
  h += '<div style="text-align:center;">';
  h += '<span style="font-size:4rem;" aria-hidden="true">' + esc(info.emoji) + '</span>';
  h += '</div>';

  // Centres d'intérêt + personnalité
  h += '<div class="tags" style="justify-content:center;margin-top:12px;">';
  info.interests.forEach(function (i2) { h += '<span class="tag">' + esc(i2) + '</span>'; });
  info.personality.forEach(function (x) { h += '<span class="tag">' + esc(x) + '</span>'; });
  h += '</div>';

  h += '<p class="empty" style="padding:12px 0 4px;">📰 ' + userPosts.length + ' post' + (userPosts.length > 1 ? "s" : "") + '</p>';

  // Ses posts, cliquables pour ouvrir le détail
  if (userPosts.length) {
    userPosts.forEach(function (p) {
      h += '<div class="post" data-postid="' + p.id + '" tabindex="0" role="button" aria-label="Ouvrir le post">';
      h += '<div class="post-head"><span class="avatar">' + esc(p.authorEmoji) + '</span>';
      h += '<div><time>' + relativeDate(p.date) + (p.edited ? " (modifié)" : "") + '</time></div></div>';
      h += '<p>' + escMultiline(p.text) + '</p></div>';
    });
  } else {
    h += '<div class="empty">Aucun post pour le moment. 🤫</div>';
  }
  h += '</div>';

  ov.innerHTML = h;

  // Fermeture : clic sur ✖, sur le fond, ou touche Échap
  ov.addEventListener("click", function (ev) {
    if (ev.target === ov || ev.target.id === "profileClose") ov.remove();
  });
  document.addEventListener("keydown", function onEsc(ev) {
    if (ev.key === "Escape") { ov.remove(); document.removeEventListener("keydown", onEsc); }
  });

  // Clic sur un post de la fiche → ouvre le détail
  Array.prototype.forEach.call(ov.querySelectorAll(".post"), function (card) {
    function open() {
      ov.remove();
      openPost(parseInt(card.getAttribute("data-postid"), 10));
    }
    card.onclick = open;
    card.onkeydown = function (ev) { if (ev.key === "Enter") open(); };
  });

  document.body.appendChild(ov);
}

/* ------------------------------------------------------------
   3. SIMPLIFICATION DE L'IDENTITÉ (emoji seul) + AVATARS CLIQUABLES
   ------------------------------------------------------------ */

/**
 * Parcourt les cartes rendues et :
 * - mémorise le pseudo (data attribut) puis masque le <strong>
 *   (l'identité affichée devient l'emoji de l'avatar uniquement) ;
 * - rend l'avatar cliquable pour ouvrir la fiche profil.
 */
function enhanceIdentities(){
  // --- Cartes de post (feed, détail, réponses, fiche profil) ---
  Array.prototype.forEach.call(document.querySelectorAll(".post"), function (card) {
    if (card.dataset.enhanced) return;
    var head = card.querySelector(".post-head");
    if (!head) return;
    card.dataset.enhanced = "1";

    var strong = head.querySelector("strong");
    if (strong) {
      card.setAttribute("data-author-pseudo", readPseudoFromCard(card));
      strong.style.display = "none"; // plus de pseudo : l'emoji suffit
    }

    var avatar = head.querySelector(".avatar");
    if (avatar) makeAvatarClickable(avatar, card);
  });

  // --- Liste des conversations ---
  Array.prototype.forEach.call(document.querySelectorAll(".conv-item"), function (item) {
    if (item.dataset.enhanced) return;
    item.dataset.enhanced = "1";
    var strong = item.querySelector(".conv-info strong");
    var avatar = item.querySelector(".avatar");
    if (strong && avatar) {
      var peerPseudo = strong.textContent.trim();
      var peerId = null;
      Object.keys(convs).forEach(function (id) {
        if (convs[id].peerPseudo === peerPseudo) peerId = id;
      });
      if (peerId) {
        makeAvatarClickable(avatar, null, peerId);
        strong.style.display = "none"; // l'avatar suffit
      }
    }
  });

  // --- En-tête du salon de chat ---
  var chatHead = document.getElementById("chatHead");
  if (chatHead && !chatHead.dataset.enhanced && currentPeer) {
    chatHead.dataset.enhanced = "1";
    var chStrong = chatHead.querySelector("strong");
    var chAvatar = chatHead.querySelector(".avatar");
    if (chStrong) chStrong.style.display = "none";
    if (chAvatar) makeAvatarClickable(chAvatar, null, currentPeer);
  }
}

/**
 * Rend un avatar cliquable (avec stopPropagation pour ne pas
 * ouvrir le post / la conversation en même temps).
 * @param {HTMLElement} avatar
 * @param {HTMLElement|null} card - carte .post si context post
 * @param {string|null} knownId - auteurId déjà connu (conversations)
 */
function makeAvatarClickable(avatar, card, knownId){
  if (avatar.dataset.profileHooked) return;
  avatar.dataset.profileHooked = "1";
  avatar.style.cursor = "pointer";
  avatar.title = "Voir le profil";
  avatar.setAttribute("role", "button");
  avatar.setAttribute("tabindex", "0");
  avatar.setAttribute("aria-label", "Voir le profil");

  function open(ev) {
    ev.stopPropagation();
    var id = knownId || (card ? findAuthorId(card) : null);
    if (id) openProfile(id);
  }
  avatar.addEventListener("click", open);
  avatar.addEventListener("keydown", function (ev) { if (ev.key === "Enter") open(ev); });
}

/* ------------------------------------------------------------
   4. OBSERVATEUR : s'applique automatiquement à chaque rendu
   Le feed, le détail et les conversations sont regénérés par
   script.js via innerHTML : le MutationObserver relance
   enhanceIdentities à chaque mise à jour du DOM.
   ------------------------------------------------------------ */
var enhancePending = false;
var observer = new MutationObserver(function () {
  if (enhancePending) return;
  enhancePending = true;
  requestAnimationFrame(function () {
    enhancePending = false;
    enhanceIdentities();
  });
});
observer.observe(document.body, { childList: true, subtree: true });

// Premier passage au chargement
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", enhanceIdentities);
} else {
  enhanceIdentities();
}
