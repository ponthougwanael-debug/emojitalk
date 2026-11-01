"use strict";

/* ============================================================
   mp-sync.js — Synchronisation des messages privés via Supabase
   ------------------------------------------------------------
   Chaque message est enregistré dans la table cloud "messages"
   (voir mp-supabase.sql) et récupéré par le destinataire toutes
   les 4 secondes. À la réception, une notification système est
   affichée (notify.js) en plus du toast dans la page.
   ============================================================ */

(function () {
  if (typeof cloudReady === "undefined" || !cloudReady || !sbClient) {
    console.warn("[EmojiTalk] MP : Supabase indisponible, messages privés en local uniquement.");
    return;
  }

  var MSG_TABLE = "messages";
  var lastSync = 0;        // date du dernier message reçu du cloud
  var sentKeys = {};       // anti-doublon pour l'envoi
  var MP_TOMBSTONE_KEY = "emojitalk:mp-deleted-ids";
  var deletedMP = {};
  try { (JSON.parse(localStorage.getItem(MP_TOMBSTONE_KEY) || "[]") || []).forEach(function (id) { deletedMP[id] = true; }); } catch (e) { deletedMP = {}; }
  function markMPDeleted(id) {
    if (!id) return;
    deletedMP[String(id)] = true;
    try { localStorage.setItem(MP_TOMBSTONE_KEY, JSON.stringify(Object.keys(deletedMP).slice(-1000))); } catch (e) {}
  }
  function newMessageId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); });
  }
  var firstPull = true;    // ne pas notifier pour l'historique au démarrage

  /** Clé de conversation : les deux participants, triés ("a|b") */
  function convKey(a, b) { return [a, b].sort().join("|"); }

  /* --- 1. ENVOI : à chaque saveConvs(), pousser les messages non synchronisés --- */

  var _origSaveConvs = saveConvs;
  saveConvs = function () {
    _origSaveConvs();
    pushNewMessages();
  };

  function pushNewMessages() {
    Object.keys(convs).forEach(function (peerId) {
      convs[peerId].messages.forEach(function (m) {
        if (m.from !== "me") return; // seuls mes messages partent vers le cloud
        if (!m.id) m.id = newMessageId();
        var k = peerId + "|" + m.date + "|" + m.text;
        if (m._synced || sentKeys[k]) return;
        sentKeys[k] = true;

        sbClient.from(MSG_TABLE).insert({
          id: m.id,
          conv_key: convKey(me.id, peerId),
          from_id: me.id,
          to_id: peerId,
          from_pseudo: me.pseudo,
          from_emoji: me.emoji,
          text: m.text,
          msg_date: new Date(m.date).toISOString()
        }).then(function (res) {
          if (!res.error) { m._synced = true; _origSaveConvs(); }
          else { sentKeys[k] = false; console.warn("[EmojiTalk] Envoi MP échoué :", res.error.message); }
        });
      });
    });
  }

  /* --- 2. RÉCEPTION : toutes les 4 s, récupérer les messages qui me concernent --- */

  function pullMessages() {
    sbClient.from(MSG_TABLE)
      .select("*")
      .or("to_id.eq." + me.id + ",from_id.eq." + me.id)
      .order("msg_date", { ascending: true })
      .then(function (res) {
        if (res.error) { console.warn("[EmojiTalk] Réception MP échouée :", res.error.message); return; }

        var changed = false;
        var newest = { pseudo: "", emoji: "", text: "" };
        (res.data || []).forEach(function (r) {
          var d = Date.parse(r.msg_date);
          if (d > lastSync) lastSync = d;

          var peerId = r.from_id === me.id ? r.to_id : r.from_id;
          if (peerId === me.id || deletedMP[String(r.id)] || deletedMP["legacy:" + peerId + "|" + d]) return;

          // Crée la conversation si le destinataire n'a jamais écrit avec moi
          if (!convs[peerId]) {
            convs[peerId] = { peerPseudo: r.from_pseudo, peerEmoji: r.from_emoji, messages: [] };
          }
          var c = convs[peerId];

          // Message reçu → l'ajouter s'il n'est pas déjà présent
          if (r.from_id !== me.id) {
            var exists = c.messages.some(function (m) {
              return m.from === "peer" && m.date === d && m.text === r.text;
            });
            if (!exists) {
              c.messages.push({ from: "peer", text: r.text, date: d });
              newest.pseudo = r.from_pseudo || c.peerPseudo || "Quelqu'un";
              newest.emoji = r.from_emoji || c.peerEmoji || "😀";
              newest.text = r.text;
              changed = true;
            }
          }
        });

        var remoteIds = {};
        (res.data || []).forEach(function (r) { if (!deletedMP[String(r.id)]) remoteIds[String(r.id)] = true; });
        Object.keys(convs).forEach(function (peerId) {
          var before = convs[peerId].messages.length;
          convs[peerId].messages = convs[peerId].messages.filter(function (m) { return !m._fromCloud || remoteIds[String(m._cloudId || m.id)]; });
          if (convs[peerId].messages.length !== before) changed = true;
        });
        if (!changed) return;

        _origSaveConvs(); // stocke en local SANS repousser vers le cloud

        // Rafraîchit l'affichage si l'utilisateur est dans les messages
        var inMessages = document.getElementById("messagesView").style.display !== "none";
        if (inMessages) {
          if (currentPeer) renderChatMessages();
          renderConvs();
          showToast("💬 Nouveau message reçu !");
        }

        // NOTIFICATION SYSTÈME (bandeau mobile / bulle bureau),
        // sauf pour l'historique récupéré au chargement de la page.
        if (!firstPull && typeof showSystemNotification === "function") {
          showSystemNotification("💬 " + newest.emoji + " " + newest.pseudo, newest.text);
        }
        firstPull = false;
      });
  }

  /* --- 2bis. MODIFICATION / SUPPRESSION ; la ligne cloud est rapprochée par UUID,
     puis par conversation, auteur, date et ancien texte pour les MP historiques. --- */
  function locateCloudMessage(detail, isEdit) {
    var m = detail && detail.message;
    var peerId = detail && detail.peerId;
    if (!m || !peerId) return Promise.resolve(null);
    var byId = m._cloudId || m.id;
    if (byId) {
      return sbClient.from(MSG_TABLE).select("id,text,msg_date,edited_at").eq("id", byId).maybeSingle().then(function (res) {
        if (res.error) throw res.error;
        if (res.data) return res.data;
        return findLegacyCloudMessage(detail);
      });
    }
    return findLegacyCloudMessage(detail);
  }
  function findLegacyCloudMessage(detail) {
    var m = detail.message;
    return sbClient.from(MSG_TABLE).select("id,text,msg_date,edited_at")
      .eq("conv_key", convKey(me.id, detail.peerId)).eq("from_id", me.id)
      .eq("to_id", detail.peerId).eq("msg_date", new Date(m.date).toISOString())
      .eq("text", m._oldText || m.text).limit(1).maybeSingle().then(function (res) {
        if (res.error) throw res.error;
        return res.data || null;
      });
  }
  document.addEventListener("emojitalk:mp-edited", function (ev) {
    if (!ev.detail || !ev.detail.message) return;
    var detail = ev.detail;
    locateCloudMessage(detail, true).then(function (row) {
      if (!row) { console.warn("[EmojiTalk] MP modifié localement; ligne cloud introuvable."); return; }
      detail.message._cloudId = row.id;
      sbClient.from(MSG_TABLE).update({ text: detail.message.text, edited_at: new Date(detail.message.editedAt || Date.now()).toISOString() }).eq("id", row.id)
        .then(function (res) { if (res.error) console.warn("[EmojiTalk] Modification MP cloud échouée :", res.error.message); });
    }).catch(function (err) { console.warn("[EmojiTalk] Recherche MP cloud échouée :", err.message); });
  });
  document.addEventListener("emojitalk:mp-deleted", function (ev) {
    if (!ev.detail || !ev.detail.message) return;
    var detail = ev.detail;
    markMPDeleted(detail.id);
    if (detail.message._cloudId) markMPDeleted(detail.message._cloudId);
    locateCloudMessage(detail, false).then(function (row) {
      if (!row) return;
      markMPDeleted(row.id);
      sbClient.from(MSG_TABLE).delete().eq("id", row.id)
        .then(function (res) { if (res.error) console.warn("[EmojiTalk] Suppression MP cloud échouée :", res.error.message); });
    }).catch(function (err) { console.warn("[EmojiTalk] Recherche MP cloud échouée :", err.message); });
  });

  /* Les suppressions faites hors ligne sont rejouées au démarrage. */
  Object.keys(deletedMP).forEach(function (id) {
    sbClient.from(MSG_TABLE).delete().eq("id", id).then(function (res) {
      if (res.error) console.warn("[EmojiTalk] Rejeu de suppression MP échoué :", res.error.message);
    });
  });

  /* --- 3. Démarrage --- */
  pushNewMessages();            // renvoie les messages restés en attente
  setInterval(pullMessages, 4000);

  /* --- 4. Correctifs d'affichage MOBILE (injection CSS) --- */
  var css = document.createElement("style");
  css.textContent =
    "@media (max-width: 640px){" +
    "  body{font-size:15px;}" +
    "  .container{padding:0 10px 90px !important;}" +
    "  header{padding:10px 12px;} header h1{font-size:1.3rem;}" +
    "  header button{padding:8px 12px;min-height:44px;}" +
    "  .card{padding:14px;}" +
    "  .post p,.detail-text,.bubble,.conv-last{overflow-wrap:anywhere;word-break:break-word;}" +
    "  textarea,input[type='text'],input[type='search']{" +
    "    width:100% !important;max-width:100% !important;box-sizing:border-box;" +
    "    font-size:16px;}" +
    "  button{min-height:44px;}" +
    "  .bottom-nav button{flex:1;min-width:0;padding:8px 4px;}" +
    "  .nav-label{font-size:.7rem;}" +
    "  .tags{flex-wrap:wrap;}" +
    "  .post,.conv-item{max-width:100%;}" +
    "}";
  document.head.appendChild(css);
})();