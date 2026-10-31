"use strict";
/* ============================================================
   EmojiTalk — supabase-sync.js
   Synchronise les posts entre TOUS les visiteurs via Supabase.
   Ce fichier se branche sur script.js sans le modifier :
   il remplace savePosts() pour pousser vers le cloud, et
   récupère régulièrement les nouveaux posts des autres.
   ============================================================ */

/* --- 1. Configuration (clé PUBLIQUE, conçue pour le navigateur) --- */
var SUPABASE_URL = "https://zhammhdalbnenmqyegnr.supabase.co";
var SUPABASE_KEY = "sb_publishable_bitCZBT7gfl_wJezzPwVbg_6y-IjBMN";

/* --- 2. Client Supabase (chargé via <script> CDN dans index.html) --- */
var sbClient = null;
var cloudReady = false;
try {
  if (window.supabase && typeof window.supabase.createClient === "function") {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    cloudReady = true;
  } else {
    console.warn("[EmojiTalk] Librairie Supabase non chargée — mode local uniquement.");
  }
} catch (e) {
  console.warn("[EmojiTalk] Impossible d'initialiser Supabase :", e);
}

/* --- 3. Conversion ligne Supabase ⇄ objet post local --- */

function rowToPost(r) {
  return {
    id: Number(r.id),
    authorId: r.author_id,
    authorPseudo: r.author_pseudo,
    authorEmoji: r.author_emoji,
    authorInterests: r.author_interests || [],
    authorPersonality: r.author_personality || [],
    text: r.text,
    likes: r.likes || 0,
    likedBy: r.liked_by || [],
    reports: r.reports || 0,
    reportedBy: r.reported_by || [],
    parentId: r.parent_id === null ? null : Number(r.parent_id),
    edited: !!r.edited,
    date: Date.parse(r.created_at) || Number(r.id)
  };
}

function postToRow(p) {
  return {
    id: p.id,
    author_id: p.authorId,
    author_pseudo: p.authorPseudo || "Anonyme",
    author_emoji: p.authorEmoji || "😀",
    author_interests: p.authorInterests || [],
    author_personality: p.authorPersonality || [],
    text: p.text,
    likes: p.likes || 0,
    liked_by: p.likedBy || [],
    reports: p.reports || 0,
    reported_by: p.reportedBy || [],
    parent_id: p.parentId === null || typeof p.parentId === "undefined" ? null : p.parentId,
    edited: !!p.edited,
    created_at: new Date(p.date).toISOString()
  };
}

/* --- 4. POUSSER : à chaque savePosts(), on envoie tout vers Supabase --- */

var pushTimer = null;

var _origSavePosts = savePosts;
savePosts = function () {
  _origSavePosts();
  if (!cloudReady) return;
  // Petit délai (debounce) : les clics rapides regroupent les envois
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushAllPosts, 500);
};

function pushAllPosts() {
  var rows = posts.slice(0, 200).map(postToRow);
  sbClient.from("posts").upsert(rows, { onConflict: "id" })
    .then(function (res) {
      if (res.error) console.warn("[EmojiTalk] Envoi cloud échoué :", res.error.message);
    });
}

/* --- 5. TIRER : toutes les 5 s, on récupère les posts des autres --- */

var pulling = false;

function pullPosts() {
  if (!cloudReady || pulling) return;
  pulling = true;

  sbClient.from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200)
    .then(function (res) {
      pulling = false;
      if (res.error) { console.warn("[EmojiTalk] Lecture cloud échouée :", res.error.message); return; }

      var remote = (res.data || []).map(rowToPost);
      if (!remote.length) return;

      // Fusion : pour chaque id, on garde la version la plus "riche"
      // (union des likes et des signalements, texte le plus récent).
      var byId = {};
      posts.forEach(function (p) { byId[p.id] = p; });

      var changed = false;
      remote.forEach(function (rp) {
        var lp = byId[rp.id];
        if (!lp) {
          byId[rp.id] = rp;           // post inconnu → on l'ajoute
          changed = true;
        } else {
          // Union des likes et signalements (jamais de perte)
          rp.likedBy.forEach(function (u) {
            if (lp.likedBy.indexOf(u) === -1) { lp.likedBy.push(u); changed = true; }
          });
          rp.reportedBy.forEach(function (u) {
            if (lp.reportedBy.indexOf(u) === -1) { lp.reportedBy.push(u); changed = true; }
          });
          if (rp.likes > lp.likes)   { lp.likes = rp.likes; changed = true; }
          if (rp.reports > lp.reports) { lp.reports = rp.reports; changed = true; }
          if (rp.edited && !lp.edited) { lp.edited = true; changed = true; }
          if (rp.text !== lp.text && rp.date >= lp.date) { lp.text = rp.text; changed = true; }
        }
      });

      // Un post signalé 3+ fois disparaît partout
      Object.keys(byId).forEach(function (k) {
        if (byId[k].reports >= 3) { delete byId[k]; changed = true; }
      });

      if (!changed) return;

      posts = Object.keys(byId).map(function (k) { return byId[k]; });
      posts.sort(function (a, b) { return b.date - a.date; });
      _origSavePosts(); // stocke en local SANS re-déclencher l'envoi cloud

      // Rafraîchit l'affichage si l'utilisateur regarde le feed ou un post
      if (document.getElementById("app").style.display !== "none") {
        if (location.hash.indexOf("#post/") === 0) renderDetail();
        else if (document.getElementById("feedView").style.display !== "none") renderFeed();
      }
    });
}

/* --- 6. Démarrage : première synchronisation + polling --- */
if (cloudReady) {
  pullPosts();                                  // récupère l'existant
  setInterval(pullPosts, 5000);                 // vérifie les nouveaux posts
  window.addEventListener("beforeunload", pushAllPosts); // dernière sauvegarde
}

/* ============================================================
   NOTE — Messages privés : ils restent locaux pour l'instant
   (chaque navigateur voit ses conversations). Une table "messages"
   partagée sera la prochaine étape si tu veux les MP entre
   visiteurs anonymes.
   ============================================================ */
