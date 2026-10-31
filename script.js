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

// Longueur maximale d'un post / d'un message privé
var MAX_LEN = 500;
var MAX_MSG_LEN = 300;

// Délai pendant lequel on peut modifier son propre post (5 minutes)
var EDIT_WINDOW = 5 * 60 * 1000;

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
var VIEW_KEY  = "emojitalk_view";   // dernier onglet visité (feed/messages/settings)

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
 * champs (likedBy, reports, parentId...). Évite un plantage au rendu.
 */
var migrationNeeded = false;
posts.forEach(function (p) {
  if (!Array.isArray(p.likedBy))  { p.likedBy = []; if (p.likes > 0) p.likes = 0; migrationNeeded = true; }
  if (typeof p.reports !== "number") { p.reports = 0; migrationNeeded = true; }
  if (!Array.isArray(p.reportedBy)) { p.reportedBy = []; migrationNeeded = true; }
  if (!Array.isArray(p.authorInterests))   p.authorInterests = [];
  if (!Array.isArray(p.authorPersonality)) p.authorPersonality = [];
  if (typeof p.parentId === "undefined") { p.parentId = null; migrationNeeded = true; } // réponses aux posts
  if (typeof p.edited === "undefined")   { p.edited = false; migrationNeeded = true; } // badge "(modifié)"
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
  // Si un emoji est déjà enregistré (retour sur l'onboarding), on le marque
  if (me.emoji === e) b.classList.add("selected");
  b.setAttribute("aria-label", "Choisir l'emoji " + e);
  b.setAttribute("aria-pressed", me.emoji === e ? "true" : "false");
  b.onclick = function () {
    me.emoji = e; saveMe();
    // VISUEL : on marque clairement le bouton choisi (bordure bleue)
    onboardEmojiPicker.querySelectorAll(".selected").forEach(function (x) {
      x.classList.remove("selected");
      x.setAttribute("aria-pressed", "false");
    });
    b.classList.add("selected");
    b.setAttribute("aria-pressed", "true");
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
    // VISUEL : la saisie libre désélectionne les emojis de la liste
    onboardEmojiPicker.querySelectorAll(".selected").forEach(function (x) {
      x.classList.remove("selected");
      x.setAttribute("aria-pressed", "false");
    });
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
  showToast("🎉 Bienvenue !", "success");
  showApp();
}

/** Affiche l'étape n (1, 2 ou 3) et met à jour la progression */
function goStep(n){
  document.getElementById("step1").style.display = n === 1 ? "block" : "none";
  document.getElementById("step2").style.display = n === 2 ? "block" : "none";
  document.getElementById("step3").style.display = n === 3 ? "block" : "none";
  setProgress(n);
}

/** Passe de l'onboarding à l'application (en restaurant le dernier onglet) */
function showApp(){
  document.getElementById("onboarding").style.display = "none";
  document.getElementById("app").style.display = "block";
  // Si l'utilisateur recharge la page, on le ramène à son dernier onglet
  var saved = localStorage.getItem(VIEW_KEY);
  navTo(saved === "messages" || saved === "settings" ? saved : "feed");
}

/* ============================================================
   7. CRÉATION / MODIFICATION DE POST
   ============================================================ */

// Rate limiting : 1 post maximum toutes les 10 secondes
var RATE_KEY = "emojitalk_lastPost";
function rateLimited(){
  var last = parseInt(localStorage.getItem(RATE_KEY) || "0", 10);
  var wait = 10000 - (Date.now() - last);
  if (wait > 0){ showToast("⏳ Réessaie dans " + Math.ceil(wait/1000) + "s.", "error"); return true; }
  return false;
}

// --- État d'édition ---
// editingId : id du post en cours de modification (ou null)
// replyToId : id du post auquel on répond (ou null)
var editingId = null;
var replyToId = null;

/**
 * Charge un post existant dans la zone de texte pour le modifier.
 * Uniquement possible pendant les 5 minutes suivant la publication.
 * @param {number} id - id du post à modifier
 */
function startEdit(id){
  var p = null;
  for (var i = 0; i < posts.length; i++) { if (posts[i].id === id) { p = posts[i]; break; } }
  if (!p) return;
  if (p.authorId !== me.id) return;                       // ses posts : interdit
  if (Date.now() - p.date > EDIT_WINDOW) {                // délai dépassé
    showToast("⏱️ La modification n'est possible que 5 minutes après la publication.", "error");
    return;
  }
  editingId = id;
  document.getElementById("postText").value = p.text;
  updateCounter();
  document.getElementById("postText").focus();
  showToast("✏️ Modifie le texte puis clique sur « Publier ».");
}

/** Annule le mode édition (utilisé par le bouton sous la zone de texte) */
function cancelEdit(){
  editingId = null;
  document.getElementById("postText").value = "";
  updateCounter();
  renderEditBar();
  renderFeed();
}

/** Affiche la barre "modification en cours" au-dessus de la zone de texte */
function renderEditBar(){
  var bar = document.getElementById("editBar");
  if (!bar) return;
  if (editingId !== null) {
    bar.innerHTML = '<div class="undo-box" role="status"><span>✏️ Modification d\'un post en cours.</span><button type="button" onclick="cancelEdit()">✖ Annuler</button></div>';
  } else {
    bar.innerHTML = "";
  }
}

/**
 * Publie un post (ou met à jour le post en cours d'édition).
 * Si replyToId est défini, le post devient une réponse à ce post.
 */
function createPost(){
  var text = document.getElementById("postText").value.trim();

  // ----- Mode édition : on remplace le texte du post existant -----
  if (editingId !== null) {
    var ep = null;
    for (var i = 0; i < posts.length; i++) { if (posts[i].id === editingId) { ep = posts[i]; break; } }
    if (!ep || ep.authorId !== me.id || Date.now() - ep.date > EDIT_WINDOW) {
      editingId = null; renderEditBar();
    } else if (!text) {
      showToast("Écris quelque chose ! 🙂", "error"); return;
    } else if (text.length > MAX_LEN) {
      showToast("Post trop long (max " + MAX_LEN + ").", "error"); return;
    } else if (containsBanned(text)) {
      showToast("🚫 Mots inappropriés détectés. Restons respectueux.", "error"); return;
    } else {
      ep.text = text;
      ep.edited = true;                    // badge "(modifié)" affiché sur la carte
      savePosts();
      editingId = null;
      document.getElementById("postText").value = "";
      updateCounter();
      renderEditBar();
      showToast("✅ Post modifié !", "success");
      renderFeed(); renderDetail();
      return;
    }
  }

  // ----- Mode création classique -----
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
    parentId: replyToId,       // non-null = c'est une réponse à un autre post
    edited: false,
    date: Date.now()
  });
  replyToId = null;            // la réponse est publiée, on repart à zéro
  savePosts();
  localStorage.setItem(RATE_KEY, String(Date.now()));

  // Réinitialise la zone de saisie
  document.getElementById("postText").value = "";
  updateCounter();
  renderEditBar();
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

  // Notifie les autres scripts (supabase-sync.js) de la suppression cloud.
  document.dispatchEvent(new CustomEvent("emojitalk:post-deleted", { detail: { id: id } }));

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
    // On pousse AVANT de retirer, pour que le retrait soit visible partout.
    document.dispatchEvent(new CustomEvent("emojitalk:post-reports", { detail: { post: p } }));
    posts = posts.filter(function (x) { return x.id !== id; });
    showToast("🚩 Post signalé par plusieurs personnes et retiré du feed.", "success");
  } else {
    document.dispatchEvent(new CustomEvent("emojitalk:post-reports", { detail: { post: p } }));
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
 * Retourne les posts à afficher dans le feed : on exclut les réponses
 * (elles apparaissent dans la vue détail de leur post parent), puis on
 * filtre par la recherche et on trie.
 * La recherche porte sur le texte, le pseudo et les tags.
 */
function sortedPosts(){
  var arr = posts.filter(function (p) {
    if (p.parentId) return false;   // les réponses ne s'affichent pas dans le feed
    if (!searchTerm) return true;
    var haystack = (p.text + " " + (p.authorPseudo || "") + " "
      + p.authorInterests.join(" ") + " " + p.authorPersonality.join(" ")).toLowerCase();
    return haystack.indexOf(searchTerm) !== -1;
  });
  if (sortMode === "popular") arr.sort(function (a, b) { return (b.likes - a.likes) || (b.date - a.date); });
  else arr.sort(function (a, b) { return b.date - a.date; });
  return arr;
}

/** Retourne le nombre de réponses d'un post */
function replyCount(id){
  var n = 0;
  posts.forEach(function (p) { if (p.parentId === id) n++; });
  return n;
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

  // En-tête : avatar + pseudo + date relative (+ badge "modifié")
  h += '<div class="post-head">';
  h += '<span class="avatar" aria-hidden="true"' + (isDetail ? ' style="font-size:3rem;"' : '') + '>' + esc(p.authorEmoji) + '</span>';
  h += '<div><strong>' + esc(p.authorPseudo || "Anonyme") + ' ' + esc(p.authorEmoji) + '</strong><br>';
  h += '<time>' + relativeDate(p.date) + (p.edited ? ' · <em>(modifié)</em>' : '') + '</time></div>';
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

  // Dans le feed : lien vers le détail + nombre de réponses
  if (!isDetail) {
    var rc = replyCount(p.id);
    h += '<button type="button" class="mp-btn" onclick="openPost(' + p.id + ')" aria-label="Voir les réponses">💬 ' + rc + '</button>';
  }
  h += '<button type="button" class="report-btn' + (reported ? " reported" : "") + '" onclick="reportPost(' + p.id + ')" aria-label="Signaler ce post"' + (reported ? " disabled" : "") + '>🚩 ' + (reported ? "Signalé" : "Signaler") + '</button>';
  // Bouton message privé : uniquement pour les posts des AUTRES
  if (p.authorId !== me.id) {
    h += '<button type="button" class="mp-btn" onclick="startConv(\'' + p.authorId + '\')">💬 MP</button>';
  }
  // Boutons modifier / supprimer : uniquement pour l'auteur du post
  if (p.authorId === me.id) {
    h += '<button type="button" class="delete-btn" onclick="deletePostSafe(' + p.id + ')">🗑️ ' + (isDetail ? "Supprimer mon post" : "Supprimer") + '</button>';
    // Modification possible pendant 5 minutes après publication
    if (Date.now() - p.date < EDIT_WINDOW) {
      h += '<button type="button" class="mp-btn" onclick="startEdit(' + p.id + ')">✏️ ' + (isDetail ? "Modifier mon post" : "Modifier") + '</button>';
    }
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
    card.setAttribute("data-author-id", p.authorId); // fiche profil fiable
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
   L'onglet actif est mémorisé : un rechargement de page ramène
   à la vue où l'utilisateur était.
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

/**
 * Rend le post correspondant au hash courant, avec ses réponses
 * (posts dont parentId = id, triées du plus ancien au plus récent)
 * et une zone de réponse.
 */
function renderDetail(){
  var id = parseInt(location.hash.replace("#post/", ""), 10);
  var p = null;
  for (var i = 0; i < posts.length; i++) { if (posts[i].id === id) { p = posts[i]; break; } }
  var container = document.getElementById("postDetail");
  if (!p) { container.innerHTML = '<div class="empty">Post introuvable. 😕</div>'; return; }

  // Post parent
  var h = '<div class="card">' + postCardHTML(p, true) + '</div>';

  // Réponses existantes (du plus ancien au plus récent)
  var replies = posts.filter(function (x) { return x.parentId === id; })
                     .sort(function (a, b) { return a.date - b.date; });
  h += '<h2 style="margin:18px 0 10px;">💬 ' + replies.length + ' réponse' + (replies.length > 1 ? "s" : "") + '</h2>';
  if (replies.length) {
    h += '<div id="repliesList">';
    replies.forEach(function (r) { h += '<div class="post" data-author-id="' + esc(r.authorId) + '">' + postCardHTML(r, false) + '</div>'; });
    h += '</div>';
  }

  // Zone de réponse : pré-remplie avec "@Pseudo " pour répondre à l'auteur
  h += '<div class="card"><h2>↩️ Répondre</h2>'
     + '<textarea id="replyText" rows="2" maxlength="' + MAX_LEN + '" placeholder="Ta réponse à ' + esc(p.authorPseudo || "Anonyme") + '..." aria-label="Réponse au post"></textarea>'
     + '<button onclick="submitReply(' + id + ')">Répondre</button></div>';

  container.innerHTML = h;
}

/**
 * Publie une réponse au post ouvert en détail.
 * La réponse est un post classique avec parentId renseigné :
 * elle n'apparaît pas dans le feed, mais dans le fil du post parent.
 * @param {number} parentId - id du post auquel on répond
 */
function submitReply(parentId){
  var ta = document.getElementById("replyText");
  var text = ta ? ta.value.trim() : "";
  if (!text) { showToast("Écris une réponse ! 🙂", "error"); return; }
  if (text.length > MAX_LEN) { showToast("Réponse trop longue (max " + MAX_LEN + ").", "error"); return; }
  if (containsBanned(text)) { showToast("🚫 Mots inappropriés détectés. Restons respectueux.", "error"); return; }

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
    parentId: parentId,   // rattache la réponse à son post parent
    edited: false,
    date: Date.now()
  });
  savePosts();
  showToast("✅ Réponse publiée !", "success");
  renderDetail(); // rafraîchit le fil avec la nouvelle réponse
}

/**
 * Bascule entre les grandes vues via la barre du bas.
 * @param {string} view - "feed" | "messages" | "settings"
 */
function navTo(view){
  // Cas 1 : on est sur le détail d'un post et on demande le feed.
  // L'effacement du hash déclenche hashchange, qui rappellera navTo("feed").
  if (view === "feed" && location.hash.indexOf("#post/") === 0) {
    location.hash = "";
    return;
  }
  // Cas 2 : on est sur le détail d'un post et on demande une AUTRE vue
  // (messages / paramètres). Même mécanique, mais on mémorise la vue
  // cible pour que hashchange ne nous ramène pas au feed.
  if (view !== "feed" && location.hash.indexOf("#post/") === 0) {
    window._pendingView = view;
    location.hash = "";
    return;
  }
  // Cas 3 : un hash non-post traîne → on le nettoie silencieusement.
  if (location.hash !== "" && location.hash.indexOf("#post/") !== 0) {
    location.hash = "";
  }
  window._pendingView = null;

  // Mémorise l'onglet actif (restauré au rechargement de la page)
  localStorage.setItem(VIEW_KEY, view);

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
  if (location.hash.indexOf("#post/") === 0) { window._pendingView = null; showDetail(); }
  else navTo(window._pendingView || "feed");
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
    item.setAttribute("data-author-id", id); // fiche profil fiable
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
  updateMsgCounter();
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
  if (text.length > MAX_MSG_LEN) { showToast("Message trop long (max " + MAX_MSG_LEN + ").", "error"); return; }
  if (containsBanned(text)) { showToast("🚫 Mots inappropriés détectés.", "error"); return; }

  c.messages.push({ from: "me", text: text, date: Date.now() });
  saveConvs();
  input.value = "";
  updateMsgCounter();
  renderChatMessages();
  renderConvs();
}

/** Met à jour le compteur "x / 300" sous la zone de message privé */
function updateMsgCounter(){
  var el = document.getElementById("msgCounter");
  if (!el) return;
  var len = document.getElementById("msgInput").value.length;
  el.textContent = len + " / " + MAX_MSG_LEN;
  el.classList.toggle("limit", len >= MAX_MSG_LEN - 30);
}
document.getElementById("msgInput").addEventListener("input", updateMsgCounter);

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
   16. BOUTON "RETOUR EN HAUT"
   Apparaît après 400px de défilement (le bouton est dans le HTML,
   son affichage est géré ici pour garder la logique en JS).
   ============================================================ */
window.addEventListener("scroll", function () {
  var btn = document.getElementById("toTop");
  if (btn) btn.style.display = window.scrollY > 400 ? "block" : "none";
});

/* ============================================================
   17. DÉMARRAGE
   Onboarding si première visite, sinon on arrive directement
   sur le feed (ou le dernier onglet visité).
   ============================================================ */
if (onboardDone) showApp(); else goStep(1);
