"use strict";

/* ============================================================
   EmojiTalk — script.js
   Toute la logique du site est ici, séparée du HTML.
   ============================================================ */

/* ============================================================
   1. CONSTANTES ET CONFIGURATION
   ============================================================ */

// Emojis proposés dans le sélecteur d'onboarding
var EMOJIS = ["😀","😎","🦊","🐱","🐼","🚀","🌟","🎧","🎮","🎨","🍕","⚽","🌵","🦉","🐙","🌈"];

// Centres d'intérêt disponibles
var INTERESTS = ["Technologie","Sport","Musique","Cinéma","Voyage","Cuisine","Jeux vidéo","Lecture","Art","Nature","Mode","Science"];

// Traits de personnalité disponibles
var PERSONALITIES = ["Extraverti","Introverti","Rigolo","Sérieux","Curieux","Rêveur","Sociable","Calme","Aventurier","Créatif"];

// Longueur maximale d'un post
var MAX_LEN = 500;

// Animaux utilisés pour générer les pseudos aléatoires ("Renard-42")
var PSEUDO_ANIMALS = ["Renard","Panda","Hibou","Tigre","Poulpe","Lynx","Renardeau","Koala","Faucon","Orque"];

// Filtre de mots interdits — modération BASIQUE, facilement contournable.
// Le système de signalement reste la vraie protection côté client.
var BANNED_WORDS = ["connard","enculé","salope","pute","ntm","tg","fdp","batard","bâtard","encule"];

/**
 * Vérifie si un texte contient un mot interdit.
 * @param {string} text - le texte du post
 * @returns {boolean}
 */
function containsBanned(text){
  var low = text.toLowerCase();
  for (var i = 0; i < BANNED_WORDS.length; i++) {
    if (low.indexOf(BANNED_WORDS[i]) !== -1) return true;
  }
  return false;
}

/* ============================================================
   2. SÉCURITÉ : ÉCHAPPEMENT XSS
   Tout contenu affiché passe par esc() : les caractères HTML
   dangereux sont neutralisés.
   ============================================================ */

/**
 * Échappe les caractères spéciaux HTML pour empêcher l'injection de code.
 * @param {*} s - valeur à échapper (convertie en chaîne)
 * @returns {string} chaîne sûre à insérer dans innerHTML
 */
function esc(s){
  s = String(s == null ? "" : s);
  return s
    .replace(/&/g, "&amp;")   // & en premier, sinon on double-échappe les autres
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Comme esc(), mais conserve les retours à la ligne (<br>) */
function escMultiline(s){ return esc(s).replace(/\n/g, "<br>"); }

/* ============================================================
   3. NOTIFICATIONS TOAST
   Remplacent les alert() bloquants : un message apparaît en bas
   à droite et disparaît tout seul après 3 secondes.
   ============================================================ */

/**
 * Affiche une notification toast.
 * @param {string} message - texte à afficher
 * @param {string} [type] - "success", "error" ou vide (info)
 */
function showToast(message, type){
  var container = document.getElementById("toastContainer");
  var t = document.createElement("div");
  t.className = "toast" + (type ? " " + type : "");
  t.setAttribute("role", "status");
  t.textContent = message;
  container.appendChild(t);

  // Disparition automatique : on ajoute la classe .hide (animation CSS),
  // puis on retire l'élément du DOM une fois l'animation terminée.
  setTimeout(function () {
    t.classList.add("hide");
    setTimeout(function () { t.remove(); }, 300);
  }, 3000);
}

/* ============================================================
   4. STOCKAGE LOCAL (localStorage)
   NOTE : chaque visiteur ne voit que SES posts. Pour un vrai feed
   partagé, il faudra brancher un backend (ex : Supabase).
   ============================================================ */

var ME_KEY    = "emojitalk_me";     // profil de l'utilisateur courant
var POSTS_KEY = "emojitalk_posts";  // liste des posts

// Chargement du profil (valeurs par défaut si première visite)
var me = JSON.parse(localStorage.getItem(ME_KEY) || '{"emoji":"","interests":[],"personality":[]}');
if (!me.interests) me.interests = [];
if (!me.personality) me.personality = [];

// Chargement des posts (tableau vide si première visite / donnée corrompue)
var posts = JSON.parse(localStorage.getItem(POSTS_KEY) || "[]");
if (!Array.isArray(posts)) posts = [];

/**
 * Migration : complète les anciens posts qui n'ont pas les nouveaux
 * champs (likedBy, reports...). Évite un plantage au rendu.
 */
var migrationNeeded = false;
posts.forEach(function (p) {
  if (!Array.isArray(p.likedBy))  { p.likedBy = []; if (p.likes > 0) p.likes = 0; migrationNeeded = true; }
  if (typeof p.reports !== "number") { p.reports = 0; migrationNeeded = true; }
  if (!Array.isArray(p.reportedBy)) { p.reportedBy = []; migrationNeeded = true; }
  if (!Array.isArray(p.authorInterests))   p.authorInterests = [];
  if (!Array.isArray(p.authorPersonality)) p.authorPersonality = [];
});

/** Sauvegarde le profil dans localStorage */
function saveMe(){ localStorage.setItem(ME_KEY, JSON.stringify(me)); }
/** Sauvegarde les posts dans localStorage */
function savePosts(){ localStorage.setItem(POSTS_KEY, JSON.stringify(posts)); }
if (migrationNeeded) savePosts();

// Identifiant anonyme persistant : sert à mémoriser les likes/signalements
// et à identifier le propriétaire d'un post (droit de suppression).
if (!me.id) { me.id = "anon-" + Math.random().toString(36).slice(2, 9); saveMe(); }

// Pseudo lisible généré une seule fois (ex : "Renard-42")
if (!me.pseudo) {
  me.pseudo = PSEUDO_ANIMALS[Math.floor(Math.random() * PSEUDO_ANIMALS.length)]
            + "-" + Math.floor(10 + Math.random() * 90);
  saveMe();
}

/* ============================================================
   5. ONBOARDING : CONSTRUCTION DES SÉLECTEURS
   ============================================================ */

var onboardDone = localStorage.getItem("emojitalk_onboarded") === "1";

// --- Sélecteur d'emoji : un bouton par emoji de la liste ---
var onboardEmojiPicker = document.getElementById("onboardEmojiPicker");
EMOJIS.forEach(function (e) {
  var b = document.createElement("button");
  b.type = "button";
  b.textContent = e;
  b.setAttribute("aria-label", "Choisir l'emoji " + e);
  b.onclick = function () {
    me.emoji = e; saveMe();
    document.getElementById("customEmoji").value = "";         // vide le champ libre
    document.getElementById("errStep1").style.display = "none"; // cache l'erreur
  };
  onboardEmojiPicker.appendChild(b);
});

// --- Champ libre emoji : on retire les caractères HTML dangereux
//     à la saisie (double protection avec esc()) ---
document.getElementById("customEmoji").addEventListener("input", function (ev) {
  var clean = ev.target.value.replace(/[<>"'`&]/g, "").trim();
  ev.target.value = clean;
  if (clean) {
    me.emoji = clean; saveMe();
    document.getElementById("errStep1").style.display = "none";
  }
});

/**
 * Fabrique une case à cocher stylisée (label + checkbox cachée).
 * @param {HTMLElement} container - où insérer la case
 * @param {string} value - texte affiché / valeur
 * @param {boolean} checked - état initial
 * @param {Function} onChange - callback au changement
 */
function buildCheckbox(container, value, checked, onChange){
  var label = document.createElement("label");
  var cb = document.createElement("input");
  cb.type = "checkbox";
  cb.value = value;
  cb.checked = checked;
  cb.onchange = onChange;
  label.appendChild(cb);
  label.appendChild(document.createTextNode(" " + value));
  container.appendChild(label);
}

// --- Sélecteur de centres d'intérêt (coché = déjà choisi) ---
var onboardInterestPicker = document.getElementById("onboardInterestPicker");
INTERESTS.forEach(function (i) {
  buildCheckbox(onboardInterestPicker, i, me.interests.indexOf(i) !== -1, function (ev) {
    if (ev.target.checked) me.interests.push(i);
    else me.interests = me.interests.filter(function (x) { return x !== i; });
    saveMe();
    document.getElementById("errStep2").style.display = "none";
  });
});

// --- Sélecteur de personnalité ---
var onboardPersonalityPicker = document.getElementById("onboardPersonalityPicker");
PERSONALITIES.forEach(function (p) {
  buildCheckbox(onboardPersonalityPicker, p, (me.personality || []).indexOf(p) !== -1, function (ev) {
    me.personality = me.personality || [];
    if (ev.target.checked) me.personality.push(p);
    else me.personality = me.personality.filter(function (x) { return x !== p; });
    saveMe();
    document.getElementById("errStep3").style.display = "none";
  });
});

/* ============================================================
   6. ONBOARDING : VALIDATION DES ÉTAPES + BARRE DE PROGRESSION
   Impossible de continuer sans avoir validé l'étape en cours.
   ============================================================ */

/** Met à jour la barre de progression (33 % / 66 % / 100 %) */
function setProgress(n){
  document.getElementById("progressFill").style.width = (n * 33.33) + "%";
}

/** Étape 1 : un emoji est obligatoire */
function validateStep1(){
  if (!me.emoji || !me.emoji.trim()) {
    document.getElementById("errStep1").style.display = "block";
    return;
  }
  goStep(2);
}

/** Étape 2 : au moins un centre d'intérêt */
function validateStep2(){
  if (!me.interests.length) {
    document.getElementById("errStep2").style.display = "block";
    return;
  }
  goStep(3);
}

/** Étape 3 : au moins une personnalité, puis on entre dans le feed */
function finishOnboarding(){
  if (!(me.personality || []).length) {
    document.getElementById("errStep3").style.display = "block";
    return;
  }
  onboardDone = true;
  localStorage.setItem("emojitalk_onboarded", "1");
  setProgress(3);
  showToast("🎉 Bienvenue " + me.pseudo + " !", "success");
  showApp();
}

/** Affiche l'étape n (1, 2 ou 3) et met à jour la progression */
function goStep(n){
  document.getElementById("step1").style.display = n === 1 ? "block" : "none";
  document.getElementById("step2").style.display = n === 2 ? "block" : "none";
  document.getElementById("step3").style.display = n === 3 ? "block" : "none";
  setProgress(n);
}

/** Passe de l'onboarding à l'application */
function showApp(){
  document.getElementById("onboarding").style.display = "none";
  document.getElementById("app").style.display = "block";
  showFeed();
}

/* ============================================================
   7. CRÉATION DE POST
   ============================================================ */

// Rate limiting : 1 post maximum toutes les 10 secondes
var RATE_KEY = "emojitalk_lastPost";
function rateLimited(){
  var last = parseInt(localStorage.getItem(RATE_KEY) || "0", 10);
  var wait = 10000 - (Date.now() - last);
  if (wait > 0){ showToast("⏳ Réessaie dans " + Math.ceil(wait/1000) + "s.", "error"); return true; }
  return false;
}

/** Publie un post après validation (vide, longueur, filtre, rate limit) */
function createPost(){
  var text = document.getElementById("postText").value.trim();
  if (!text) { showToast("Écris quelque chose ! 🙂", "error"); return; }
  if (text.length > MAX_LEN) { showToast("Post trop long (max " + MAX_LEN + ").", "error"); return; }
  if (containsBanned(text)) { showToast("🚫 Mots inappropriés détectés. Restons respectueux.", "error"); return; }
  if (rateLimited()) return;

  // On fige l'emoji / les tags / le pseudo au moment de la publication :
  // modifier son profil plus tard ne réécrira pas l'historique.
  posts.unshift({
    id: Date.now(),
    authorId: me.id,
    authorPseudo: me.pseudo,
    authorEmoji: me.emoji,
    authorInterests: me.interests.slice(),
    authorPersonality: (me.personality || []).slice(),
    text: text,
    likes: 0,
    likedBy: [],
    reports: 0,
    reportedBy: [],
    date: Date.now()
  });
  savePosts();
  localStorage.setItem(RATE_KEY, String(Date.now()));

  // Réinitialise la zone de saisie
  document.getElementById("postText").value = "";
  updateCounter();
  showToast("✅ Post publié !", "success");
  if (location.hash.indexOf("#post/") === 0) showFeed();
  else { renderFeed(); renderDetail(); }
}

/** Met à jour le compteur "x / 500" sous la zone de texte */
function updateCounter(){
  var len = document.getElementById("postText").value.length;
  var c = document.getElementById("charCounter");
  c.textContent = len + " / " + MAX_LEN;
  c.classList.toggle("limit", len >= MAX_LEN - 50); // passe en rouge près de la limite
}
document.getElementById("postText").addEventListener("input", updateCounter);

/** Formate une date en temps relatif, ex : "il y a 2 min" */
function relativeDate(timestamp){
  var diff = Date.now() - timestamp;
  var min = Math.floor(diff / 60000);
  if (min < 1)   return "à l'instant";
  if (min < 60)  return "il y a " + min + " min";
  var h = Math.floor(min / 60);
  if (h < 24)    return "il y a " + h + " h";
  var j = Math.floor(h / 24);
  if (j < 7)     return "il y a " + j + " j";
  // Au-delà d'une semaine : date complète
  return new Date(timestamp).toLocaleDateString("fr-FR");
}

/* ============================================================
   8. SUPPRESSION AVEC ANNULATION (10 secondes)
   ============================================================ */

var undoTimer = null, lastDeleted = null, lastIndex = 0;

/** Supprime un post, mais propose "Annuler" pendant 10 s */
function deletePostSafe(id){
  var idx = -1;
  for (var i = 0; i < posts.length; i++) { if (posts[i].id === id) { idx = i; break; } }
  if (idx === -1) return;

  lastDeleted = posts[idx]; lastIndex = idx;
  posts.splice(idx, 1);
  savePosts();
  showFeed();

  var area = document.getElementById("undoArea");
  area.innerHTML = '<div class="undo-box" role="status"><span>🗑️ Post supprimé.</span><button type="button" onclick="undoRestore()">↩️ Annuler</button></div>';
  showToast("🗑️ Post supprimé (annulable 10 s).");
  clearTimeout(undoTimer);
  undoTimer = setTimeout(function () { lastDeleted = null; area.innerHTML = ""; }, 10000);
}

/** Restaure le post supprimé (appelé par le bouton "Annuler") */
function undoRestore(){
  clearTimeout(undoTimer);
  if (lastDeleted){
    posts.splice(lastIndex, 0, lastDeleted);
    savePosts();
    lastDeleted = null;
  }
  document.getElementById("undoArea").innerHTML = "";
  showToast("↩️ Post restauré.", "success");
  renderFeed();
}

/* ============================================================
   9. SIGNALEMENT
   1 signalement par personne et par post. À partir de 3
   signalements, le post est retiré automatiquement.
   ============================================================ */

function reportPost(id){
  var p = null;
  for (var i = 0; i < posts.length; i++) { if (posts[i].id === id) { p = posts[i]; break; } }
  if (!p) return;

  p.reportedBy = p.reportedBy || [];
  if (p.reportedBy.indexOf(me.id) !== -1) return; // a déjà signalé ce post

  p.reportedBy.push(me.id);
  p.reports = (p.reports || 0) + 1;

  if (p.reports >= 3) {
    posts = posts.filter(function (x) { return x.id !== id; });
    showToast("🚩 Post signalé par plusieurs personnes et retiré du feed.", "success");
  } else {
    showToast("🚩 Merci, ton signalement a été pris en compte.", "success");
  }
  savePosts();
  renderFeed(); renderDetail();
}

/* ============================================================
   10. RECHERCHE ET TRI DU FEED
   ============================================================ */

var sortMode = "recent"; // "recent" ou "popular"
var searchTerm = "";     // terme de recherche en direct (minuscules)

// Recherche en direct : on filtre le feed à chaque frappe
document.getElementById("searchInput").addEventListener("input", function (ev) {
  searchTerm = ev.target.value.trim().toLowerCase();
  renderFeed();
});

/** Change le mode de tri et rafraîchit le feed */
function setSort(mode){
  sortMode = mode;
  document.getElementById("sortRecent").classList.toggle("active", mode === "recent");
  document.getElementById("sortPopular").classList.toggle("active", mode === "popular");
  renderFeed();
}

/**
 * Retourne les posts filtrés par la recherche puis triés.
 * La recherche porte sur le texte, le pseudo et les tags.
 */
function sortedPosts(){
  var arr = posts.filter(function (p) {
    if (!searchTerm) return true;
    var haystack = (p.text + " " + (p.authorPseudo || "") + " "
      + p.authorInterests.join(" ") + " " + p.authorPersonality.join(" ")).toLowerCase();
    return haystack.indexOf(searchTerm) !== -1;
  });
  if (sortMode === "popular") arr.sort(function (a, b) { return (b.likes - a.likes) || (b.date - a.date); });
  else arr.sort(function (a, b) { return b.date - a.date; });
  return arr;
}

/* ============================================================
   11. RENDU : CARTES DE POST, FEED, DÉTAIL
   ============================================================ */

/**
 * Génère le HTML d'une carte de post.
 * @param {Object} p - le post
 * @param {boolean} isDetail - true pour la vue détail (plus grand)
 * @returns {string} HTML (tout contenu utilisateur déjà échappé)
 */
function postCardHTML(p, isDetail){
  var liked = p.likedBy.indexOf(me.id) !== -1;       // ai-je déjà liké ?
  var reported = p.reportedBy.indexOf(me.id) !== -1; // ai-je déjà signalé ?
  var h = "";

  // En-tête : avatar + pseudo + date relative
  h += '<div class="post-head">';
  h += '<span class="avatar" aria-hidden="true"' + (isDetail ? ' style="font-size:3rem;"' : '') + '>' + esc(p.authorEmoji) + '</span>';
  h += '<div><strong>' + esc(p.authorPseudo || "Anonyme") + ' ' + esc(p.authorEmoji) + '</strong><br>';
  h += '<time>' + relativeDate(p.date) + '</time></div>';
  h += '</div>';

  // Texte du post (échappé, retours à la ligne conservés)
  h += '<p' + (isDetail ? ' class="detail-text"' : '') + '>' + escMultiline(p.text) + '</p>';

  // Tags : centres d'intérêt + personnalité de l'auteur au moment du post
  h += '<div class="tags">';
  p.authorInterests.forEach(function (i) { h += '<span class="tag">' + esc(i) + '</span>'; });
  p.authorPersonality.forEach(function (x) { h += '<span class="tag">' + esc(x) + '</span>'; });
  h += '</div>';

  // Zone d'actions : la propagation du clic est bloquée plus bas
  // pour ne pas déclencher l'ouverture du post.
  h += '<div data-actions="1">';
  h += '<button type="button" class="like' + (liked ? " liked" : "") + '" onclick="toggleLike(' + p.id + ')" aria-label="Aimer ce post">' + (liked ? "❤️" : "🤍") + " " + p.likes + (isDetail ? " j'aime" : "") + '</button>';
  h += '<button type="button" class="report-btn' + (reported ? " reported" : "") + '" onclick="reportPost(' + p.id + ')" aria-label="Signaler ce post"' + (reported ? " disabled" : "") + '>🚩 ' + (reported ? "Signalé" : "Signaler") + '</button>';
  // Bouton supprimer : uniquement pour l'auteur du post
  if (p.authorId === me.id) {
    h += '<button type="button" class="delete-btn" onclick="deletePostSafe(' + p.id + ')">🗑️ ' + (isDetail ? "Supprimer mon post" : "Supprimer") + '</button>';
  }
  h += '</div>';
  return h;
}

/** Affiche la liste des posts dans le feed */
function renderFeed(){
  var feed = document.getElementById("feed");
  var list = sortedPosts();

  if (!posts.length) {
    feed.innerHTML = '<div class="empty">Aucun post. Lance la discussion ! 🚀</div>';
    return;
  }
  if (!list.length) {
    // Des posts existent mais aucun ne correspond à la recherche
    feed.innerHTML = '<div class="empty">Aucun résultat pour ta recherche. 🔍</div>';
    return;
  }

  feed.innerHTML = "";
  list.forEach(function (p) {
    var card = document.createElement("div");
    card.className = "post";
    card.tabIndex = 0;                       // carte accessible au clavier
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", "Ouvrir le post");
    card.innerHTML = postCardHTML(p, false);

    // Un clic sur like / signaler / supprimer ne doit PAS ouvrir le post
    var actions = card.querySelector('[data-actions="1"]');
    if (actions) actions.onclick = function (ev) { ev.stopPropagation(); };

    // Clic ou Entrée = ouvrir la page de détail
    card.onclick = function () { openPost(p.id); };
    card.onkeydown = function (ev) { if (ev.key === "Enter") openPost(p.id); };
    feed.appendChild(card);
  });
}

/* ============================================================
   12. LIKES : UN SEUL PAR PERSONNE
   likedBy mémorise QUI a liké : on peut liker puis un-liker,
   mais jamais compter deux fois.
   ============================================================ */

function toggleLike(id){
  var p = null;
  for (var i = 0; i < posts.length; i++) { if (posts[i].id === id) { p = posts[i]; break; } }
  if (!p) return;

  p.likedBy = p.likedBy || [];
  var idx = p.likedBy.indexOf(me.id);
  if (idx !== -1) {
    p.likedBy.splice(idx, 1);              // déjà liké → on retire le like
    p.likes = Math.max(0, p.likes - 1);
  } else {
    p.likedBy.push(me.id);                 // pas encore liké → on ajoute
    p.likes++;
  }
  savePosts();
  if (location.hash.indexOf("#post/") === 0) renderDetail();
  else renderFeed();
}

/* ============================================================
   13. NAVIGATION FEED ⇄ DÉTAIL (via le hash d'URL)
   #post/<id> = page détail, hash vide = feed.
   Le bouton retour du navigateur fonctionne grâce à hashchange.
   ============================================================ */

function openPost(id){ location.hash = "#post/" + id; showDetail(); }

/** Affiche le feed et efface le hash */
function showFeed(){
  if (location.hash !== "") location.hash = "";
  document.getElementById("feedView").style.display = "block";
  document.getElementById("detailView").style.display = "none";
  renderFeed();
}

/** Affiche la vue détail */
function showDetail(){
  document.getElementById("feedView").style.display = "none";
  document.getElementById("detailView").style.display = "block";
  renderDetail();
}

/** Rend le post correspondant au hash courant */
function renderDetail(){
  var id = parseInt(location.hash.replace("#post/", ""), 10);
  var p = null;
  for (var i = 0; i < posts.length; i++) { if (posts[i].id === id) { p = posts[i]; break; } }
  var container = document.getElementById("postDetail");
  if (!p) { container.innerHTML = '<div class="empty">Post introuvable. 😕</div>'; return; }
  container.innerHTML = '<div class="card">' + postCardHTML(p, true) + '</div>';
}

// Réagit aux boutons précédent/suivant du navigateur
window.addEventListener("hashchange", function () {
  if (location.hash.indexOf("#post/") === 0) showDetail();
  else showFeed();
});

/* ============================================================
   14. DÉMARRAGE
   Onboarding si première visite, sinon on arrive directement
   sur le feed.
   ============================================================ */
if (onboardDone) showApp(); else goStep(1);
