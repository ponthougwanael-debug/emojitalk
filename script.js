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
   NOTE : chaque visiteur ne voit que SES posts et SES messages.
   Pour un vrai partage entre visiteurs, il faudra un backend
   (ex : Supabase).
   ============================================================ */

var ME_KEY    = "emojitalk_me";     // profil de l'utilisateur courant
var POSTS_KEY = "emojitalk_posts";  // liste des posts
var MSGS_KEY  = "emojitalk_msgs";   // conversations privées

// Chargement du profil (valeurs par défaut si première visite)
var me = JSON.parse(localStorage.getItem(ME_KEY) || '{"emoji":"","interests":[],"personality":[]}');
if (!me.interests) me.interests = [];
if (!me.personality) me.personality = [];

// Chargement des posts (tableau vide si première visite / donnée corrompue)
var posts = JSON.parse(localStorage.getItem(POSTS_KEY) || "[]");
if (!Array.isArray(posts)) posts = [];

// Chargement des conversations : objet { peerId: {peerPseudo, peerEmoji, messages:[]} }
var convs = JSON.parse(localStorage.getItem(MSGS_KEY) || "{}");
if (typeof convs !== "object" || convs === null || Array.isArray(convs)) convs = {};

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
/** Sauvegarde les conversations privées dans localStorage */
function saveConvs(){ localStorage.setItem(MSGS_KEY, JSON.stringify(convs)); }
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
  navTo("feed");
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
  // Bouton message privé : uniquement pour les posts des AUTRES
  if (p.authorId !== me.id) {
    h += '<button type="button" class="mp-btn" onclick="startConv(\'' + p.authorId + '\')">💬 MP</button>';
  }
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

    // Un clic sur like / signaler / MP / supprimer ne doit PAS ouvrir le post
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
   13. NAVIGATION : BARRE DU BAS + FEED ⇄ DÉTAIL
   La bottom-nav bascule entre feed / messages / paramètres.
   Le hash #post/<id> ouvre le détail d'un post depuis le feed.
   ============================================================ */

/** Ouvre un post en vue détail */
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

/**
 * Bascule entre les grandes vues via la barre du bas.
 * @param {string} view - "feed" | "messages" | "settings"
 */
function navTo(view){
  // Un détail de post ouvert ne garde son sens que dans le feed
  if (view !== "feed" || location.hash.indexOf("#post/") !== 0) {
    if (location.hash !== "") { location.hash = ""; return; } // hashchange relance navTo("feed")
  }

  // Montre la vue demandée, cache les autres
  document.getElementById("feedView").style.display      = view === "feed"      ? "block" : "none";
  document.getElementById("detailView").style.display    = "none";
  document.getElementById("messagesView").style.display  = view === "messages"  ? "block" : "none";
  document.getElementById("settingsView").style.display  = view === "settings"  ? "block" : "none";

  // Met à jour l'état actif de la barre du bas
  var buttons = document.querySelectorAll("#bottomNav button");
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle("active", buttons[i].getAttribute("data-view") === view);
  }

  if (view === "feed") renderFeed();
  if (view === "messages") { closeChat(); renderConvs(); }
  if (view === "settings") buildSettings();
}

// Réagit aux boutons précédent/suivant du navigateur
window.addEventListener("hashchange", function () {
  if (location.hash.indexOf("#post/") === 0) showDetail();
  else navTo("feed");
});

/* ============================================================
   14. MESSAGES PRIVÉS
   Conversations stockées localement : convs[peerId] = {
   peerPseudo, peerEmoji, messages: [{from:"me"|"peer", text, date}] }.
   On démarre une conversation via le bouton "💬 MP" d'un post.
   ============================================================ */

var currentPeer = null; // id de la personne avec qui on discute

/**
 * Ouvre (ou crée) la conversation avec un auteur de post.
 * @param {string} peerId - auteurId du post
 */
function startConv(peerId){
  // Retrouve les infos d'affichage (pseudo, emoji) depuis ses posts
  var info = null;
  for (var i = 0; i < posts.length; i++) {
    if (posts[i].authorId === peerId) { info = posts[i]; break; }
  }
  if (!info) { showToast("Impossible de trouver cette personne. 😕", "error"); return; }

  if (!convs[peerId]) {
    convs[peerId] = { peerPseudo: info.authorPseudo, peerEmoji: info.authorEmoji, messages: [] };
    saveConvs();
  }
  currentPeer = peerId;
  navTo("messages");
  openChat(peerId);
}

/** Liste des conversations, triée par dernier message */
function renderConvs(){
  var list = document.getElementById("convList");
  var ids = Object.keys(convs);
  if (!ids.length) {
    list.innerHTML = '<div class="empty">Aucune conversation.<br>Clique sur « 💬 MP » sous un post pour en commencer une ! 💌</div>';
    return;
  }
  // Tri : conversation avec le message le plus récent en premier
  ids.sort(function (a, b) {
    var la = convs[a].messages.length ? convs[a].messages[convs[a].messages.length - 1].date : 0;
    var lb = convs[b].messages.length ? convs[b].messages[convs[b].messages.length - 1].date : 0;
    return lb - la;
  });

  list.innerHTML = "";
  ids.forEach(function (id) {
    var c = convs[id];
    var last = c.messages.length ? c.messages[c.messages.length - 1] : null;
    var item = document.createElement("div");
    item.className = "conv-item";
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.innerHTML =
      '<span class="avatar">' + esc(c.peerEmoji) + '</span>' +
      '<div class="conv-info"><strong>' + esc(c.peerPseudo) + '</strong>' +
      '<span class="conv-last">' + (last ? esc(last.text) : "Nouvelle conversation") + '</span></div>' +
      '<button type="button" class="delete-btn" aria-label="Supprimer la conversation">🗑️</button>';
    item.onclick = function () { openChat(id); };
    item.onkeydown = function (ev) { if (ev.key === "Enter") openChat(id); };
    // Le clic sur la corbeille ne doit pas ouvrir la conversation
    var del = item.querySelector(".delete-btn");
    del.onclick = function (ev) { ev.stopPropagation(); deleteConv(id); };
    list.appendChild(item);
  });
}

/** Supprime une conversation entière */
function deleteConv(id){
  delete convs[id];
  if (currentPeer === id) currentPeer = null;
  saveConvs();
  renderConvs();
  closeChat();
  showToast("🗑️ Conversation supprimée.");
}

/** Affiche le salon de discussion avec un correspondant */
function openChat(peerId){
  var c = convs[peerId];
  if (!c) return;
  currentPeer = peerId;

  document.getElementById("convList").style.display = "none";
  document.getElementById("chatArea").style.display = "block";
  document.getElementById("chatHead").innerHTML =
    '<span class="avatar">' + esc(c.peerEmoji) + '</span> <strong>' + esc(c.peerPseudo) + '</strong>';

  renderChatMessages();
  var input = document.getElementById("msgInput");
  input.value = "";
  input.focus();
}

/** Retour à la liste des conversations */
function closeChat(){
  currentPeer = null;
  document.getElementById("convList").style.display = "block";
  document.getElementById("chatArea").style.display = "none";
}

/** Rend les bulles de messages du salon ouvert */
function renderChatMessages(){
  var c = convs[currentPeer];
  if (!c) return;
  var box = document.getElementById("chatMessages");
  if (!c.messages.length) {
    box.innerHTML = '<div class="empty">Dis bonjour à ' + esc(c.peerPseudo) + ' ! 👋</div>';
    return;
  }
  box.innerHTML = "";
  c.messages.forEach(function (m) {
    var b = document.createElement("div");
    b.className = "bubble " + (m.from === "me" ? "mine" : "theirs");
    b.innerHTML = escMultiline(m.text) + '<time>' + relativeDate(m.date) + '</time>';
    box.appendChild(b);
  });
  // Fais défiler jusqu'au dernier message
  box.scrollTop = box.scrollHeight;
}

/** Envoie le message saisi au correspondant courant */
function sendMessage(){
  var input = document.getElementById("msgInput");
  var text = input.value.trim();
  var c = convs[currentPeer];
  if (!c) return;
  if (!text) { showToast("Écris un message ! 🙂", "error"); return; }
  if (containsBanned(text)) { showToast("🚫 Mots inappropriés détectés.", "error"); return; }

  c.messages.push({ from: "me", text: text, date: Date.now() });
  saveConvs();
  input.value = "";
  renderChatMessages();
  renderConvs();
}

// Entrée = envoyer le message
document.getElementById("msgInput").addEventListener("keydown", function (ev) {
  if (ev.key === "Enter") { ev.preventDefault(); sendMessage(); }
});

/* ============================================================
   15. PARAMÈTRES : MODIFIER SON PROFIL
   ============================================================ */

/**
 * Construit les sélecteurs de la page Paramètres à partir du
 * profil actuel (emoji, intérêts, personnalité).
 */
function buildSettings(){
  // Travail sur une copie : rien n'est sauvegardé avant "Enregistrer"
  var draft = {
    emoji: me.emoji,
    interests: me.interests.slice(),
    personality: (me.personality || []).slice()
  };

  document.getElementById("settingsPseudo").textContent = me.pseudo;
  document.getElementById("errSettings").style.display = "none";

  // --- Sélecteur d'emoji ---
  var picker = document.getElementById("settingsEmojiPicker");
  picker.innerHTML = "";
  EMOJIS.forEach(function (e) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = e;
    if (e === draft.emoji) b.classList.add("selected");
    b.onclick = function () {
      draft.emoji = e;
      document.getElementById("settingsCustomEmoji").value = "";
      picker.querySelectorAll(".selected").forEach(function (x) { x.classList.remove("selected"); });
      b.classList.add("selected");
    };
    picker.appendChild(b);
  });

  var custom = document.getElementById("settingsCustomEmoji");
  custom.value = EMOJIS.indexOf(draft.emoji) !== -1 ? "" : draft.emoji;
  custom.oninput = function (ev) {
    var clean = ev.target.value.replace(/[<>"'`&]/g, "").trim();
    ev.target.value = clean;
    if (clean) {
      draft.emoji = clean;
      picker.querySelectorAll(".selected").forEach(function (x) { x.classList.remove("selected"); });
    }
  };

  // --- Cases à cocher centres d'intérêt ---
  var ip = document.getElementById("settingsInterestPicker");
  ip.innerHTML = "";
  INTERESTS.forEach(function (i) {
    buildCheckbox(ip, i, draft.interests.indexOf(i) !== -1, function (ev) {
      if (ev.target.checked) draft.interests.push(i);
      else draft.interests = draft.interests.filter(function (x) { return x !== i; });
    });
  });

  // --- Cases à cocher personnalité ---
  var pp = document.getElementById("settingsPersonalityPicker");
  pp.innerHTML = "";
  PERSONALITIES.forEach(function (p) {
    buildCheckbox(pp, p, draft.personality.indexOf(p) !== -1, function (ev) {
      if (ev.target.checked) draft.personality.push(p);
      else draft.personality = draft.personality.filter(function (x) { return x !== p; });
    });
  });

  // Le brouillon est conservé jusqu'au clic sur "Enregistrer"
  window._settingsDraft = draft;
}

/** Valide et applique les modifications du profil */
function saveSettings(){
  var d = window._settingsDraft || { emoji: me.emoji, interests: me.interests.slice(), personality: (me.personality || []).slice() };
  if (!d.emoji || !d.emoji.trim()) { document.getElementById("errSettings").style.display = "block"; return; }
  if (!d.interests.length || !d.personality.length) {
    document.getElementById("errSettings").style.display = "block";
    return;
  }
  me.emoji = d.emoji;
  me.interests = d.interests;
  me.personality = d.personality;
  saveMe();
  showToast("✅ Profil mis à jour !", "success");
  buildSettings(); // resynchronise l'affichage
}

/** Efface le profil et relance l'onboarding (les posts sont gardés) */
function resetOnboarding(){
  localStorage.removeItem("emojitalk_onboarded");
  location.reload();
}

/* ============================================================
   16. DÉMARRAGE
   Onboarding si première visite, sinon on arrive directement
   sur le feed.
   ============================================================ */
if (onboardDone) showApp(); else goStep(1);
