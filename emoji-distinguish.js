"use strict";

/* ============================================================
   emoji-distinguish.js — Distinguer les personnes au même emoji
   ------------------------------------------------------------
   Plusieurs personnes peuvent choisir le même emoji (ex : 🦊).
   Pour les distinguer, un petit exposant est ajouté à côté de
   l'avatar : 🦊 (le premier arrivé), 🦊² , 🦊³ ...
   Le numéro est calculé à partir des identifiants (authorId),
   donc il reste STABLE : il ne change pas quand le feed est
   rechargé ou trié différemment.
   Ce fichier ne modifie ni script.js, ni profile.js, ni le CSS :
   il s'branche sur le DOM après rendu via un MutationObserver.
   ============================================================ */

/* ------------------------------------------------------------
   1. REGISTRE : qui utilise quel emoji
   ------------------------------------------------------------ */

/**
 * Construit une carte { emoji -> [authorId, ...] } triée par
 * authorId (ordre stable). "me" est inclus, ainsi que tous les
 * auteurs connus via les posts (et les conversations si présentes).
 * @returns {Object} map emoji -> tableau d'authorId trié
 */
function buildEmojiRegistry(){
  var map = {};
  function add(emoji, id){
    if (!emoji || !id) return;
    if (!map[emoji]) map[emoji] = [];
    if (map[emoji].indexOf(id) === -1) map[emoji].push(id);
  }
  // Les posts connaissent tous les auteurs actifs
  if (typeof posts !== "undefined" && Array.isArray(posts)) {
    posts.forEach(function (p) { add(p.authorEmoji, p.authorId); });
  }
  // Les conversations peuvent connaître des gens sans post
  if (typeof convs !== "undefined" && convs) {
    Object.keys(convs).forEach(function (id) {
      var c = convs[id];
      if (c && c.peerEmoji) add(c.peerEmoji, id);
    });
  }
  // Moi-même (même sans aucun post)
  if (typeof me !== "undefined" && me && me.id && me.emoji) add(me.emoji, me.id);
  // Tri stable : ordre d'arrivée = ordre alphabétique des ids
  Object.keys(map).forEach(function (e) { map[e].sort(); });
  return map;
}

/**
 * Retourne le rang (0 = premier) d'une personne pour un emoji.
 * @param {string} emoji
 * @param {string} authorId
 * @returns {number}
 */
function emojiRank(emoji, authorId){
  var list = buildEmojiRegistry()[emoji];
  if (!list || list.length < 2) return 0; // pas de doublon → pas de badge
  var idx = list.indexOf(authorId);
  return idx; // -1 si inconnu → pas de badge
}

/* Exposants Unicode : ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ puis chiffres normaux au-delà */
var SUP = ["⁰","¹","²","³","⁴","⁵","⁶","⁷","⁸","⁹"];
function supText(n){ // n >= 2
  var s = "";
  while (n > 0) { s = SUP[n % 10] + s; n = Math.floor(n / 10); }
  return s;
}

/* ------------------------------------------------------------
   2. BADGES SUR LES AVATARS
   ------------------------------------------------------------ */

/**
 * Ajoute (ou met à jour) le badge exposant d'un avatar.
 * @param {HTMLElement} avatar
 * @param {string} emoji - emoji affiché
 * @param {string} authorId - auteur de la carte
 */
function applyDupBadge(avatar, emoji, authorId){
  var rank = emojiRank(emoji, authorId);
  var badge = avatar.querySelector(".dup-badge");

  if (rank < 1) { // personne unique ou premier du nom : pas de badge
    if (badge) badge.remove();
    return;
  }

  if (!badge) {
    badge = document.createElement("sup");
    badge.className = "dup-badge";
    // Style inline : discret, coloré, ne décale pas la mise en page
    badge.style.cssText =
      "font-size:.6em;color:#38bdf8;font-weight:700;" +
      "margin-left:1px;pointer-events:none;line-height:1;";
    avatar.appendChild(badge);
  }
  var label = supText(rank + 1); // rang 1 → ² (2e personne avec cet emoji)
  if (badge.textContent !== label) badge.textContent = label;
}

/**
 * Parcourt toutes les cartes (posts, conversations, chat, fiche
 * profil) et pose les badges sur les avatars concernés.
 */
function refreshDupBadges(){
  // Cartes de post : data-author-id est posé par script.js
  Array.prototype.forEach.call(document.querySelectorAll(".post"), function (card) {
    var avatar = card.querySelector(".post-head .avatar");
    var id = card.getAttribute("data-author-id");
    if (!avatar || !id) return;
    var emoji = avatar.textContent.replace(/[\u2070-\u209f]/g, "").trim();
    if (!emoji) return;
    applyDupBadge(avatar, emoji, id);
  });

  // Conversations (liste) et en-tête du chat
  ["conv-item", "chat-head"].forEach(function (cls) {
    Array.prototype.forEach.call(document.querySelectorAll("." + cls), function (item) {
      var avatar = item.querySelector(".avatar");
      var id = item.getAttribute("data-author-id");
      if (!avatar || !id) return;
      var emoji = avatar.textContent.replace(/[\u2070-\u209f]/g, "").trim();
      if (!emoji) return;
      applyDupBadge(avatar, emoji, id);
    });
  });

  // Fiche profil (grand emoji central)
  var ov = document.getElementById("profileOverlay");
  if (ov) {
    var big = ov.querySelector('span[style*="4rem"]');
    var id = ov.getAttribute("data-author-id") ||
             (ov.getAttribute("aria-label") || "").replace("Profil de ", "");
    if (big && typeof currentProfileAuthorId !== "undefined" && currentProfileAuthorId) {
      var emoji2 = big.textContent.replace(/[\u2070-\u209f]/g, "").trim();
      if (emoji2) applyDupBadge(big, emoji2, currentProfileAuthorId);
    }
  }
}

/* ------------------------------------------------------------
   3. OBSERVATEUR : comme profile.js, on réagit à chaque rendu
   ------------------------------------------------------------ */
var dupPending = false;
var dupObserver = new MutationObserver(function () {
  if (dupPending) return;
  dupPending = true;
  requestAnimationFrame(function () {
    dupPending = false;
    refreshDupBadges();
  });
});
dupObserver.observe(document.body, { childList: true, subtree: true });

// Premier passage au chargement
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", refreshDupBadges);
} else {
  refreshDupBadges();
}
