"use strict";

/* ============================================================
   EmojiTalk — rewards.js
   Systèmes de niveaux/XP, de pièces quotidiennes (récolte 24 h)
   et de coût des demandes privées.
   Chargé APRÈS script.js (voir la balise <script> dans index.html).
   ============================================================ */

/* ---------- 1. CONSTANTES ---------- */

var REWARDS_COOLDOWN = 24 * 60 * 60 * 1000; // 24 h en ms
var REWARDS_BASE_COINS = 50;                // pièces de base par récolte
var REWARDS_COINS_PER_LEVEL = 5;            // bonus par niveau
var MP_COST = 20;                           // coût d'une demande privée
var XP = { post: 10, reply: 5, like: 2, collect: 15 };

/* ---------- 2. ÉTAT (dans le profil localStorage existant) ---------- */

var rewardsMe = JSON.parse(localStorage.getItem("emojitalk_me") || "{}");

/** Applique les valeurs par défaut puis sauvegarde. */
function rewardsInit(){
  var changed = false;
  if (typeof rewardsMe.xp !== "number")        { rewardsMe.xp = 0; changed = true; }
  if (typeof rewardsMe.coins !== "number")     { rewardsMe.coins = 0; changed = true; }
  if (typeof rewardsMe.lastCollect !== "number") { rewardsMe.lastCollect = 0; changed = true; }
  if (typeof rewardsMe.seenLikes !== "number") { rewardsMe.seenLikes = 0; changed = true; }
  if (changed) rewardsSave();
}

function rewardsSave(){
  localStorage.setItem("emojitalk_me", JSON.stringify(rewardsMe));
}

/* ---------- 3. NIVEAUX ---------- */

/** Niveau courant : 100 XP par niveau (niveau 1 = 0-99 XP, etc.) */
function rewardsLevel(){ return Math.floor(rewardsMe.xp / 100) + 1; }

/** XP accumulée dans le niveau courant (0-99) */
function rewardsXpInLevel(){ return rewardsMe.xp % 100; }

/** Ajoute de l'XP et prévient l'utilisateur en cas de passage de niveau. */
function rewardsAddXp(amount, reason){
  var before = rewardsLevel();
  rewardsMe.xp += amount;
  rewardsSave();
  var after = rewardsLevel();
  if (after > before) showToast("🎉 Niveau " + after + " atteint !", "success");
  else if (reason) showToast("+" + amount + " XP (" + reason + ")");
  rewardsRenderPanel();
}

/* ---------- 4. PIÈCES : RÉCOLTE QUOTIDIENNE ---------- */

function rewardsCanCollect(){ return Date.now() - rewardsMe.lastCollect >= REWARDS_COOLDOWN; }

function rewardsCollectAmount(){
  return REWARDS_BASE_COINS + REWARDS_COINS_PER_LEVEL * rewardsLevel();
}

/** Récolte les pièces si le délai de 24 h est écoulé. */
function rewardsCollect(){
  if (!rewardsCanCollect()) {
    showToast("⏳ Reviens dans " + rewardsCountdownText() + " pour récolter.", "error");
    return;
  }
  rewardsMe.lastCollect = Date.now();
  var gain = rewardsCollectAmount();
  rewardsMe.coins += gain;
  rewardsSave();
  rewardsAddXp(XP.collect, "récolte quotidienne");
  showToast("🪙 " + gain + " pièces récoltées !", "success");
  rewardsRenderPanel();
}

/** Temps restant avant la prochaine récolte, formaté "23 h 59 min 59 s". */
function rewardsCountdownText(){
  var left = REWARDS_COOLDOWN - (Date.now() - rewardsMe.lastCollect);
  if (left < 0) left = 0;
  var h = Math.floor(left / 3600000);
  var m = Math.floor((left % 3600000) / 60000);
  var s = Math.floor((left % 60000) / 1000);
  return h + " h " + m + " min " + s + " s";
}

/* ---------- 5. DEMANDES PRIVÉES PAYANTES ---------- */

/**
 * Coûte MP_COST pièces pour démarrer une NOUVELLE conversation.
 * Les messages dans une conversation existante restent gratuits.
 * @returns {boolean} true si l'envoi est autorisé
 */
function rewardsAllowNewConversation(peerId){
  var convs = JSON.parse(localStorage.getItem("emojitalk_msgs") || "{}");
  var existing = convs[peerId] && convs[peerId].messages && convs[peerId].messages.length;
  if (existing) return true; // conversation déjà ouverte : gratuit

  if (rewardsMe.coins < MP_COST) {
    showToast("🪙 Il te faut " + MP_COST + " pièces pour envoyer une demande privée. Récolte-les dans l'onglet Profil ! (" + rewardsMe.coins + "/" + MP_COST + ")", "error");
    return false;
  }
  rewardsMe.coins -= MP_COST;
  rewardsSave();
  showToast("🪙 Demande privée envoyée (−" + MP_COST + " pièces).", "success");
  rewardsRenderPanel();
  return true;
}

/* ---------- 6. PANNEAU PROFIL : NIVEAU, XP, PIÈCES ---------- */

/**
 * Injecte / met à jour le panneau récompenses dans la vue Paramètres
 * (rendue par buildSettings() de script.js). S'exécute aussi via un
 * intervalle léger pour rafraîchir le compte à rebours.
 */
function rewardsRenderPanel(){
  var view = document.getElementById("settingsView");
  if (!view || view.style.display === "none") return;

  var panel = document.getElementById("rewardsPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "rewardsPanel";
    panel.className = "card";
    // Inséré en tête de la vue Paramètres
    view.insertBefore(panel, view.firstChild);
  }

  var lvl = rewardsLevel();
  var xpIn = rewardsXpInLevel();
  var pct = Math.round(xpIn); // 100 XP par niveau
  var canCollect = rewardsCanCollect();

  panel.innerHTML =
    '<h2>🏅 Niveau ' + lvl + '</h2>' +
    '<div style="background:#e5e7eb;border-radius:8px;height:14px;overflow:hidden;margin:8px 0 4px;" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
      '<div style="background:linear-gradient(90deg,#f59e0b,#fbbf24);height:100%;width:' + pct + '%;"></div>' +
    '</div>' +
    '<p style="margin:4px 0;font-size:0.9em;color:#6b7280;">' + xpIn + ' / 100 XP — encore ' + (100 - xpIn) + ' XP pour le niveau ' + (lvl + 1) + '</p>' +
    '<h2 style="margin-top:16px;">🪙 ' + rewardsMe.coins + ' pièces</h2>' +
    (canCollect
      ? '<button type="button" id="rewardsCollectBtn" onclick="rewardsCollect()">🎁 Récolter ' + rewardsCollectAmount() + ' pièces</button>'
      : '<p style="margin:4px 0;font-size:0.9em;color:#6b7280;">⏳ Prochaine récolte dans ' + rewardsCountdownText() + '</p>') +
    '<p style="margin:8px 0 0;font-size:0.85em;color:#9ca3af;">Une demande privée coûte ' + MP_COST + ' pièces.</p>';
}

// Rafraîchit le compte à rebours toutes les secondes quand la vue est visible
setInterval(rewardsRenderPanel, 1000);

/* ---------- 7. INTÉGRATION AVEC script.js ---------- */

// Les fonctions globales de script.js sont "enrobées" pour ajouter
// l'XP et le coût des MPs sans toucher au fichier d'origine.

/** Enveloppe une fonction globale : runs wrapper(this, args) avant l'originale. */
function rewardsWrap(name, wrapper){
  var original = window[name];
  if (typeof original !== "function") return;
  window[name] = function(){
    if (wrapper.apply(this, arguments) === false) return; // false = bloqué
    return original.apply(this, arguments);
  };
}

document.addEventListener("DOMContentLoaded", function(){
  rewardsInit();

  // +10 XP par post créé
  rewardsWrap("createPost", function(){ rewardsAddXp(XP.post, "post publié"); });

  // +5 XP par réponse
  rewardsWrap("submitReply", function(){ rewardsAddXp(XP.reply, "réponse publiée"); });

  // Demande privée : 20 pièces pour une NOUVELLE conversation
  rewardsWrap("sendMessage", function(){
    return rewardsAllowNewConversation(window.currentPeer);
  });

  // XP "likes reçus" : on regagne le nombre total de likes sur nos posts
  // à chaque retour sur le feed ; seule la différence est créditée.
  rewardsWrap("renderFeed", function(){
    setTimeout(function(){
      try {
        var posts = JSON.parse(localStorage.getItem("emojitalk_posts") || "[]");
        var myId = rewardsMe.id;
        var total = 0;
        posts.forEach(function(p){ if (p.authorId === myId && Array.isArray(p.likedBy)) total += p.likedBy.length; });
        if (total > rewardsMe.seenLikes) {
          var gained = (total - rewardsMe.seenLikes) * XP.like;
          rewardsMe.seenLikes = total;
          rewardsSave();
          rewardsAddXp(gained, "j'aime reçus");
        } else if (total < rewardsMe.seenLikes) {
          rewardsMe.seenLikes = total; // post supprimé : on resynchronise
          rewardsSave();
        }
      } catch (e) { /* silencieux */ }
    }, 50);
  });

  rewardsRenderPanel();
});
