"use strict";
/* ============================================================
   EmojiTalk — supabase-sync.js
   Synchronise les posts entre TOUS les visiteurs via Supabase.
   Ce fichier se branche sur script.js sans le modifier :
   il remplace savePosts() pour pousser vers le cloud, et
   récupère régulièrement les nouveaux posts des autres.

   NOUVEAU — Pierres tombales PARTAGÉES :
   les IDs des posts supprimés sont stockés dans une table
   cloud "deleted_posts", visible par tous les appareils.
   Fini les posts fantômes visibles sur un appareil mais pas
   sur un autre : tout le monde consulte la même liste.
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

/* --- 2bis. PIERRES TOMBALES : IDs des posts supprimés ---
   Liste locale (cache) de la liste cloud "deleted_posts".
   Elle sert de filtre immédiat entre deux lectures du cloud. */
var TOMBSTONE_KEY = "emojitalk:deleted-ids";
var deletedIds = {};
try {
  (JSON.parse(localStorage.getItem(TOMBSTONE_KEY) || "[]") || []).forEach(function (id) { deletedIds[id] = true; });
} catch (e) { deletedIds = {}; }

function markDeleted(id) {
  deletedIds[id] = true;
  try {
    var ids = Object.keys(deletedIds).map(Number).slice(-500);
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(ids));
  } catch (e) { /* quota / mode privé : pas bloquant */ }
}

/** Enregistre une suppression dans la table cloud partagée. */
function pushTombstone(id) {
  if (!cloudReady) return;
  sbClient.from("deleted_posts").upsert({ post_id: id }, { onConflict: "post_id" })
    .then(function (res) {
      if (res.error) console.warn("[EmojiTalk] Enregistrement de suppression échoué :", res.error.message);
    });
}

/* --- 2ter. PIERRES TOMBALES DE LIKES ---
   Quand quelqu'un retire son like, il ne doit jamais revenir :
   un navigateur ayant une copie périmée de likedBy pourrait le
   ré-uploader lors d'un push groupé. On mémorise donc chaque
   "post:utilisateur" retiré, durablement. */
var LIKE_TOMBSTONE_KEY = "emojitalk:deleted-likes";
var deletedLikes = {}; // clé "postId:userId" → true
try {
  (JSON.parse(localStorage.getItem(LIKE_TOMBSTONE_KEY) || "[]") || []).forEach(function (k) { deletedLikes[k] = true; });
} catch (e) { deletedLikes = {}; }

function likeKey(postId, userId) { return postId + ":" + userId; }

function markLikeDeleted(postId, userId) {
  deletedLikes[likeKey(postId, userId)] = true;
  try {
    var keys = Object.keys(deletedLikes).slice(-2000);
    localStorage.setItem(LIKE_TOMBSTONE_KEY, JSON.stringify(keys));
  } catch (e) { /* quota / mode privé : pas bloquant */ }
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
    likes: (p.likedBy || []).length, // le compteur est TOUJOURS dérivé de likedBy : jamais désynchronisé
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
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushAllPosts, 500);
};

function pushAllPosts() {
  // On n'envoie JAMAIS un post marqué comme supprimé (pierre tombale).
  var rows = posts.filter(function (p) { return !deletedIds[p.id]; }).slice(0, 200).map(postToRow);
  if (!rows.length) return;
  sbClient.from("posts").upsert(rows, { onConflict: "id" })
    .then(function (res) {
      if (res.error) console.warn("[EmojiTalk] Envoi cloud échoué :", res.error.message);
    });
}

/* --- 4bis. SUPPRESSION RÉELLE dans le cloud ---
   À chaque suppression locale, on :
   1. marque l'ID comme supprimé (cache local + table cloud
      partagée "deleted_posts") → aucun appareil ne le
      réintégrera, même s'il a une copie périmée ;
   2. supprime la ligne du cloud (la politique DELETE existe
      désormais dans supabase-sync.sql). */
document.addEventListener("emojitalk:post-deleted", function (ev) {
  if (!cloudReady || !ev.detail || typeof ev.detail.id === "undefined") return;
  var id = ev.detail.id;
  markDeleted(id);
  pushTombstone(id); // partagé avec TOUS les appareils
  clearTimeout(pushTimer);
  sbClient.from("posts").delete().eq("id", id)
    .then(function (res) {
      if (res.error) console.warn("[EmojiTalk] Suppression cloud échouée :", res.error.message);
    });
});

/* --- 4quinquies. SUPPRESSION DE COMPTE dans le cloud ---
   account.js émet "emojitalk:account-deleted" avec l'ID de l'auteur.
   AVANT ce correctif : aucun listener n'existait pour cet
   événement → les lignes de l'auteur restaient dans la table
   cloud "posts" et revenaient à la prochaine synchronisation,
   même après la suppression du profil (sur PC ET mobile).
   On supprime donc ici TOUTES les lignes de l'auteur :
   - ses posts/réponses dans la table "posts" ;
   - ses pierres tombales partagées (pour tous les appareils) ;
   - ses messages privés dans la table "messages". */
document.addEventListener("emojitalk:account-deleted", function (ev) {
  if (!cloudReady || !ev.detail || !ev.detail.authorId) return;
  var authorId = ev.detail.authorId;
  var postIds = ev.detail.postIds || [];

  // 1. Pierres tombales partagées : plus aucun appareil ne
  //    réintégrera un de ces posts, même avec une copie périmée.
  postIds.forEach(function (id) { pushTombstone(id); });

  // 2. Supprime toutes les lignes de l'auteur dans le cloud.
  clearTimeout(pushTimer); // évite un push groupé juste après
  sbClient.from("posts").delete().eq("author_id", authorId)
    .then(function (res) {
      if (res.error) console.warn("[EmojiTalk] Suppression des posts cloud échouée :", res.error.message);
    });

  // 3. Supprime aussi ses messages privés (deux sens :
  //    envoyés et reçus par ce compte).
  sbClient.from("messages").delete().or("from_id.eq." + authorId + ",to_id.eq." + authorId)
    .then(function (res) {
      if (res.error) console.warn("[EmojiTalk] Suppression des MP cloud échouée :", res.error.message);
    });
});

/* --- 4ter. UN-LIKE retiré réellement dans le cloud --- */
document.addEventListener("emojitalk:post-unliked", function (ev) {
  if (!cloudReady || !ev.detail || !ev.detail.post || !ev.detail.userId) return;
  var p = ev.detail.post;
  if (deletedIds[p.id]) return;
  markLikeDeleted(p.id, ev.detail.userId);
  clearTimeout(pushTimer);
  var row = postToRow(p);
  sbClient.from("posts").upsert(row, { onConflict: "id" })
    .then(function (res) {
      if (res.error) console.warn("[EmojiTalk] Retrait de like cloud échoué :", res.error.message);
    });
});

/* --- 4quater. SIGNALEMENTS poussés immédiatement --- */
document.addEventListener("emojitalk:post-reports", function (ev) {
  if (!cloudReady || !ev.detail || !ev.detail.post) return;
  if (deletedIds[ev.detail.post.id]) return;
  var row = postToRow(ev.detail.post);
  sbClient.from("posts").upsert(row, { onConflict: "id" })
    .then(function (res) {
      if (res.error) console.warn("[EmojiTalk] Signalement cloud échoué :", res.error.message);
    });
});

/* --- 5. TIRER : toutes les 5 s, on récupère le cloud --- */

var pulling = false;

/**
 * Récupère la liste cloud des IDs supprimés et la fusionne dans
 * le cache local. Retourne les IDs de NOUVELLES suppressions
 * découvertes (pour purger les posts locaux correspondants).
 */
function pullTombstones(callback) {
  if (!cloudReady) { callback(false); return; }
  sbClient.from("deleted_posts").select("post_id").limit(5000)
    .then(function (res) {
      if (res.error) { console.warn("[EmojiTalk] Lecture des suppressions échouée :", res.error.message); callback(false); return; }
      var changed = false;
      (res.data || []).forEach(function (row) {
        var id = Number(row.post_id);
        if (!deletedIds[id]) { markDeleted(id); changed = true; }
      });
      callback(changed);
    });
}

/** Purge localement tous les posts dont l'ID est une pierre tombale. */
function purgeDeletedLocally() {
  var before = posts.length;
  posts = posts.filter(function (p) { return !deletedIds[p.id]; });
  if (posts.length !== before) {
    _origSavePosts();
    if (document.getElementById("app").style.display !== "none") {
      if (location.hash.indexOf("#post/") === 0) renderDetail();
      else if (document.getElementById("feedView").style.display !== "none") renderFeed();
    }
  }
}

function pullPosts() {
  if (!cloudReady || pulling) return;
  pulling = true;

  // 1) D'abord la liste des suppressions partagée…
  pullTombstones(function (tombstonesChanged) {
    if (tombstonesChanged) purgeDeletedLocally();

    // 2) …puis les posts.
    sbClient.from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(function (res) {
        pulling = false;
        if (res.error) { console.warn("[EmojiTalk] Lecture cloud échouée :", res.error.message); return; }

        var remote = (res.data || []).map(rowToPost).filter(function (rp) {
          return !deletedIds[rp.id];
        });

        // Fusion : pour chaque id, on garde la version la plus "riche".
        var byId = {};
        posts.forEach(function (p) { if (!deletedIds[p.id]) byId[p.id] = p; });

        var changed = false;
        remote.forEach(function (rp) {
          var lp = byId[rp.id];
          if (!lp) {
            rp.likedBy = (rp.likedBy || []).filter(function (u) {
              return !deletedLikes[likeKey(rp.id, u)];
            });
            rp.likes = rp.likedBy.length;
            byId[rp.id] = rp;
            changed = true;
          } else {
            rp.likedBy.forEach(function (u) {
              if (deletedLikes[likeKey(rp.id, u)]) return;
              if (lp.likedBy.indexOf(u) === -1) { lp.likedBy.push(u); changed = true; }
            });
            rp.reportedBy.forEach(function (u) {
              if (lp.reportedBy.indexOf(u) === -1) { lp.reportedBy.push(u); changed = true; }
            });
            lp.likes = lp.likedBy.length;
            if (rp.reports > lp.reports) { lp.reports = rp.reports; changed = true; }
            if (rp.edited && !lp.edited) { lp.edited = true; changed = true; }
            if (rp.text !== lp.text && rp.date >= lp.date) { lp.text = rp.text; changed = true; }
          }
        });

        // Posts signalés 3+ fois → retirés partout.
        Object.keys(byId).forEach(function (k) {
          if (byId[k].reports >= 3) { delete byId[k]; changed = true; }
        });
        // Posts venu du cloud mais disparus du cloud → supprimés
        // ailleurs → on les retire localement, même feed vide.
        var remoteIds = {};
        remote.forEach(function (rp) { remoteIds[rp.id] = true; });
        Object.keys(byId).forEach(function (k) {
          if (!remoteIds[k] && byId[k]._fromCloud) { delete byId[k]; changed = true; }
        });
        remote.forEach(function (rp) { if (byId[rp.id]) byId[rp.id]._fromCloud = true; });

        if (!changed) return;

        posts = Object.keys(byId).map(function (k) { return byId[k]; });
        posts.sort(function (a, b) { return b.date - a.date; });
        _origSavePosts();

        if (document.getElementById("app").style.display !== "none") {
          if (location.hash.indexOf("#post/") === 0) renderDetail();
          else if (document.getElementById("feedView").style.display !== "none") renderFeed();
        }
      });
  });
}

/* --- 6. Démarrage : première synchronisation + polling --- */
if (cloudReady) {
  pullPosts();
  setInterval(pullPosts, 5000);
  window.addEventListener("beforeunload", pushAllPosts);
}

/* ============================================================
   NOTE — Messages privés : ils sont synchronisés via la table
   "messages" par mp-sync.js (envoi à chaque saveConvs(),
   réception toutes les 4 s). Voir mp-sync.js et mp-supabase.sql.
   ============================================================ */