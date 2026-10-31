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

/* --- 2bis. PIERRES TOMBALES : IDs des posts supprimés ---
   Un post supprimé ne doit JAMAIS revenir, même si un autre
   visiteur (ou ce navigateur via localStorage) l'a encore dans
   sa copie locale et le ré-envoie lors d'un push groupé. */
var TOMBSTONE_KEY = "emojitalk:deleted-ids";
var deletedIds = {};
try {
  (JSON.parse(localStorage.getItem(TOMBSTONE_KEY) || "[]") || []).forEach(function (id) { deletedIds[id] = true; });
} catch (e) { deletedIds = {}; }

function markDeleted(id) {
  deletedIds[id] = true;
  try {
    var ids = Object.keys(deletedIds).map(Number).slice(-500); // on garde une trace raisonnable
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(ids));
  } catch (e) { /* quota / mode privé : pas bloquant */ }
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
  // Petit délai (debounce) : les clics rapides regroupent les envois
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushAllPosts, 500);
};

function pushAllPosts() {
  // On n'envoie JAMAIS un post marqué comme supprimé (pierre tombale) :
  // c'est ce qui faisait "ressusciter" les posts/commentaires supprimés
  // lorsqu'un navigateur avait encore une copie locale périmée.
  var rows = posts.filter(function (p) { return !deletedIds[p.id]; }).slice(0, 200).map(postToRow);
  if (!rows.length) return; // rien à pousser (tout a été supprimé localement)
  sbClient.from("posts").upsert(rows, { onConflict: "id" })
    .then(function (res) {
      if (res.error) console.warn("[EmojiTalk] Envoi cloud échoué :", res.error.message);
    });
}

/* --- 4bis. SUPPRESSION RÉELLE dans le cloud ---
   L'upsert ne peut pas retirer une ligne : sans delete explicite,
   un post supprimé "ressusciterait" au prochain pull. script.js
   émet un événement "emojitalk:post-deleted" à chaque suppression. */
document.addEventListener("emojitalk:post-deleted", function (ev) {
  if (!cloudReady || !ev.detail || typeof ev.detail.id === "undefined") return;
  var id = ev.detail.id;
  markDeleted(id); // mémorisé AVANT tout : aucun push/pull ne pourra le ramener
  // On annule tout push groupé en attente qui pourrait contenir ce post.
  clearTimeout(pushTimer);
  sbClient.from("posts").delete().eq("id", id)
    .then(function (res) {
      if (res.error) console.warn("[EmojiTalk] Suppression cloud échouée :", res.error.message);
    });
});

/* --- 4ter. UN-LIKE retiré réellement dans le cloud ---
   script.js émet "emojitalk:post-unliked" quand quelqu'un retire
   son like : on mémorise la pierre tombale et on pousse l'état
   corrigé immédiatement, pour qu'aucun autre navigateur ne le
   ré-ajoute. */
document.addEventListener("emojitalk:post-unliked", function (ev) {
  if (!cloudReady || !ev.detail || !ev.detail.post || !ev.detail.userId) return;
  var p = ev.detail.post;
  if (deletedIds[p.id]) return; // post déjà supprimé : ne rien renvoyer
  markLikeDeleted(p.id, ev.detail.userId);
  clearTimeout(pushTimer);
  var row = postToRow(p);
  sbClient.from("posts").upsert(row, { onConflict: "id" })
    .then(function (res) {
      if (res.error) console.warn("[EmojiTalk] Retrait de like cloud échoué :", res.error.message);
    });
});

/* --- 4quater. SIGNALEMENTS poussés immédiatement ---
   Quand un post atteint 3 signalements, script.js le retire
   localement AVANT que l'upsert ne parte : on pousse donc le
   compteur AVANT la suppression via l'événement
   "emojitalk:post-reports". */
document.addEventListener("emojitalk:post-reports", function (ev) {
  if (!cloudReady || !ev.detail || !ev.detail.post) return;
  if (deletedIds[ev.detail.post.id]) return; // déjà supprimé : ne rien renvoyer
  var row = postToRow(ev.detail.post);
  sbClient.from("posts").upsert(row, { onConflict: "id" })
    .then(function (res) {
      if (res.error) console.warn("[EmojiTalk] Signalement cloud échoué :", res.error.message);
    });
});

/* --- 4quinquies. SUPPRESSION DE COMPTE ---
   account.js émet "emojitalk:account-deleted" : on supprime du cloud
   TOUTES les lignes de cet auteur (posts + réponses), après avoir
   annulé tout push groupé en attente. */
document.addEventListener("emojitalk:account-deleted", function (ev) {
  if (!cloudReady || !ev.detail || !ev.detail.authorId) return;
  clearTimeout(pushTimer); // aucun push en attente ne doit ré-uploader ses posts
  sbClient.from("posts").delete().eq("author_id", ev.detail.authorId)
    .then(function (res) {
      if (res.error) console.warn("[EmojiTalk] Suppression compte cloud échouée :", res.error.message);
    });
});

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

      var remote = (res.data || []).map(rowToPost).filter(function (rp) {
        // Un post supprimé (pierre tombale) n'est jamais réintégré,
        // même si la ligne traîne encore dans le cloud le temps du delete.
        return !deletedIds[rp.id];
      });

      // Fusion : pour chaque id, on garde la version la plus "riche"
      // (union des likes et des signalements, texte le plus récent).
      var byId = {};
      posts.forEach(function (p) { if (!deletedIds[p.id]) byId[p.id] = p; });

      var changed = false;
      remote.forEach(function (rp) {
        var lp = byId[rp.id];
        if (!lp) {
          // Post inconnu → on l'ajoute, mais on retire d'abord les
          // likes que CE navigateur a explicitement retirés.
          rp.likedBy = (rp.likedBy || []).filter(function (u) {
            return !deletedLikes[likeKey(rp.id, u)];
          });
          rp.likes = rp.likedBy.length; // compteur toujours dérivé de likedBy
          byId[rp.id] = rp;
          changed = true;
        } else {
          // Union des likes et signalements (jamais de perte),
          // SAUF les likes explicitement retirés (pierre tombale).
          rp.likedBy.forEach(function (u) {
            if (deletedLikes[likeKey(rp.id, u)]) return; // retiré ici → ne jamais réintégrer
            if (lp.likedBy.indexOf(u) === -1) { lp.likedBy.push(u); changed = true; }
          });
          rp.reportedBy.forEach(function (u) {
            if (lp.reportedBy.indexOf(u) === -1) { lp.reportedBy.push(u); changed = true; }
          });
          lp.likes = lp.likedBy.length; // recalcul : le compteur ne peut plus mentir
          if (rp.reports > lp.reports) { lp.reports = rp.reports; changed = true; }
          if (rp.edited && !lp.edited) { lp.edited = true; changed = true; }
          if (rp.text !== lp.text && rp.date >= lp.date) { lp.text = rp.text; changed = true; }
        }
      });

      // Posts disparus du cloud (supprimés ailleurs ou signalés 3+ fois)
      // → on les retire aussi localement.
      Object.keys(byId).forEach(function (k) {
        if (byId[k].reports >= 3) { delete byId[k]; changed = true; }
      });
      // On retire tout post local venu du cloud mais absent du cloud
      // maintenant — MÊME SI la liste cloud est vide. L'ancienne
      // condition "if (remote.length)" laissait justement ressusciter
      // le dernier post supprimé quand le feed devenait vide.
      var remoteIds = {};
      remote.forEach(function (rp) { remoteIds[rp.id] = true; });
      Object.keys(byId).forEach(function (k) {
        if (!remoteIds[k] && byId[k]._fromCloud) { delete byId[k]; changed = true; }
      });
      remote.forEach(function (rp) { if (byId[rp.id]) byId[rp.id]._fromCloud = true; });

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
