"use strict";

/* ============================================================
   mp-sync.js — Synchronisation et suppressions partagées des MP.
   Les suppressions sont enregistrées dans deleted_messages avant
   de retirer le message : le marqueur reste disponible aux deux
   participants même après suppression de la ligne messages.
   ============================================================ */

(function () {
  if (typeof cloudReady === "undefined" || !cloudReady || !sbClient) {
    console.warn("[EmojiTalk] MP : Supabase indisponible, messages privés en local uniquement.");
    return;
  }

  var MSG_TABLE = "messages";
  var TOMBSTONE_TABLE = "deleted_messages";
  var OUTBOX_KEY = "emojitalk:mp-delete-outbox";
  var LOCAL_TOMBSTONE_KEY = "emojitalk:mp-deleted-ids";
  var sentKeys = {};
  var deletedMP = {};
  var firstPull = true;
  try {
    (JSON.parse(localStorage.getItem(LOCAL_TOMBSTONE_KEY) || "[]") || []).forEach(function (id) { deletedMP[String(id)] = true; });
  } catch (e) { deletedMP = {}; }

  function rememberDeleted(id) {
    if (!id) return;
    deletedMP[String(id)] = true;
    try { localStorage.setItem(LOCAL_TOMBSTONE_KEY, JSON.stringify(Object.keys(deletedMP).slice(-1000))); } catch (e) {}
  }
  function readOutbox() {
    try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]") || []; } catch (e) { return []; }
  }
  function writeOutbox(queue) {
    try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(queue)); } catch (e) {}
  }
  function removeOutboxEntry(key) {
    writeOutbox(readOutbox().filter(function (item) { return item.key !== key; }));
  }
  function newMessageId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); });
  }
  function convKey(a, b) { return [a, b].sort().join("|"); }

  /* Push any unsynced messages. Stable IDs make retries idempotent. */
  var _origSaveConvs = saveConvs;
  saveConvs = function () {
    _origSaveConvs();
    pushNewMessages();
  };
  function pushNewMessages() {
    Object.keys(convs).forEach(function (peerId) {
      (convs[peerId].messages || []).forEach(function (m) {
        if (m.from !== "me") return;
        if (!m.id) m.id = newMessageId();
        if (deletedMP[String(m.id)] || deletedMP[String(m._cloudId || "")]) return;
        var k = peerId + "|" + m.date + "|" + m.text;
        if (m._synced || sentKeys[k]) return;
        sentKeys[k] = true;
        sbClient.from(MSG_TABLE).insert({
          id: m._cloudId || m.id,
          conv_key: convKey(me.id, peerId),
          from_id: me.id,
          to_id: peerId,
          from_pseudo: me.pseudo,
          from_emoji: me.emoji,
          text: m.text,
          msg_date: new Date(m.date).toISOString()
        }).then(function (res) {
          if (!res.error) { m._synced = true; m._fromCloud = true; m._cloudId = m._cloudId || m.id; _origSaveConvs(); }
          else { sentKeys[k] = false; console.warn("[EmojiTalk] Envoi MP échoué :", res.error.message); }
        });
      });
    });
  }

  function legacyRow(detail) {
    var m = detail && detail.message;
    var peerId = detail && detail.peerId;
    if (!m || !peerId) return Promise.resolve(null);
    return sbClient.from(MSG_TABLE).select("id,text,msg_date,conv_key,from_id,to_id")
      .eq("conv_key", convKey(me.id, peerId)).eq("from_id", me.id).eq("to_id", peerId)
      .eq("msg_date", new Date(m.date).toISOString()).eq("text", m._oldText || m.text)
      .limit(1).maybeSingle().then(function (res) {
        if (res.error) throw res.error;
        return res.data || null;
      });
  }
  function locateCloudMessage(detail) {
    var m = detail && detail.message;
    if (!m || !detail.peerId) return Promise.resolve(null);
    var id = m._cloudId || detail.id || m.id;
    if (!id) return legacyRow(detail);
    return sbClient.from(MSG_TABLE).select("id,text,msg_date,conv_key,from_id,to_id")
      .eq("id", id).maybeSingle().then(function (res) {
        if (res.error) throw res.error;
        return res.data || legacyRow(detail);
      });
  }
  function saveSharedTombstone(row) {
    return sbClient.from(TOMBSTONE_TABLE).upsert({ message_id: row.id, conv_key: row.conv_key, from_id: row.from_id, to_id: row.to_id, msg_date: row.msg_date }, { onConflict: "message_id" })
      .then(function (res) { if (res.error) throw res.error; });
  }
  function clearMatchingOutbox(detail, queueKey) {
    if (queueKey) { removeOutboxEntry(queueKey); return; }
    var m = detail.message || {};
    var targetId = String(detail.id || m.id || "");
    writeOutbox(readOutbox().filter(function (item) {
      if (!item || !item.message) return false;
      var queuedId = String(item.id || item.message.id || "");
      return !(queuedId === targetId && String(item.peerId) === String(detail.peerId));
    }));
  }
  function publishDeletion(detail, queueKey) {
    return locateCloudMessage(detail).then(function (row) {
      if (!row) {
        var id = detail.message && (detail.message._cloudId || detail.id || detail.message.id);
        if (!id) return false;
        return sbClient.from(TOMBSTONE_TABLE).select("message_id").eq("message_id", id).maybeSingle().then(function (res) {
          if (res.error) throw res.error;
          if (!res.data) return false;
          rememberDeleted(id);
          clearMatchingOutbox(detail, queueKey);
          return true;
        });
      }
      rememberDeleted(row.id);
      return saveSharedTombstone(row).then(function () {
        return sbClient.from(MSG_TABLE).delete().eq("id", row.id);
      }).then(function (res) {
        if (res.error) throw res.error;
        clearMatchingOutbox(detail, queueKey);
        return true;
      });
    });
  }
  function replayDeleteOutbox() {
    readOutbox().forEach(function (item) {
      if (!item || !item.message) return;
      publishDeletion(item, item.key).catch(function (err) {
        console.warn("[EmojiTalk] Rejeu de suppression MP en attente :", err.message);
      });
    });
  }

  function matchesLegacyTombstone(tombstones, peerId, message) {
    var date = Number(message.date);
    return Object.keys(tombstones).some(function (id) {
      var t = tombstones[id];
      if (!t || t.conv_key !== convKey(me.id, peerId) || !t.msg_date) return false;
      if (Date.parse(t.msg_date) !== date) return false;
      var isOwn = t.from_id === me.id;
      return message.from === (isOwn ? "me" : "peer");
    });
  }

  /* Every pull reads tombstones and the current cloud snapshot. Do not use
     a timestamp cursor: a tombstone must also prune already cached history. */
  function pullMessages() {
    Promise.all([
      sbClient.from(TOMBSTONE_TABLE).select("*"),
      sbClient.from(MSG_TABLE).select("*").or("to_id.eq." + me.id + ",from_id.eq." + me.id).order("msg_date", { ascending: true })
    ]).then(function (results) {
      var deletedRes = results[0], messagesRes = results[1];
      if (deletedRes.error) { console.warn("[EmojiTalk] Lecture des suppressions MP échouée :", deletedRes.error.message); return; }
      if (messagesRes.error) { console.warn("[EmojiTalk] Réception MP échouée :", messagesRes.error.message); return; }

      var tombstones = {};
      (deletedRes.data || []).forEach(function (t) {
        var people = String(t.conv_key || "").split("|");
        if (people.indexOf(String(me.id)) !== -1) tombstones[String(t.message_id)] = t;
      });
      var rows = messagesRes.data || [];

      var changed = false, newest = { pseudo: "", emoji: "", text: "" }, receivedNew = false;
      /* First remove shared-deleted and now-absent cloud messages from local
         copies on either side of the conversation. */
      Object.keys(convs).forEach(function (peerId) {
        var before = (convs[peerId].messages || []).length;
        convs[peerId].messages = (convs[peerId].messages || []).filter(function (m) {
          var cloudId = String(m._cloudId || m.id || "");
          if (tombstones[cloudId] || matchesLegacyTombstone(tombstones, peerId, m)) return false;
          return true;
        });
        if (convs[peerId].messages.length !== before) changed = true;
      });

      rows.forEach(function (r) {
        var id = String(r.id);
        if (tombstones[id]) { rememberDeleted(id); return; }
        var peerId = r.from_id === me.id ? r.to_id : r.from_id;
        if (!peerId || peerId === me.id) return;
        if (!convs[peerId]) convs[peerId] = { peerPseudo: r.from_id === me.id ? "" : r.from_pseudo, peerEmoji: r.from_id === me.id ? "" : r.from_emoji, messages: [] };
        var c = convs[peerId];
        var d = Date.parse(r.msg_date);
        if (r.from_id === me.id) {
          var own = c.messages.find(function (m) { return String(m._cloudId || m.id || "") === id; });
          if (!own) own = c.messages.find(function (m) { return m.from === "me" && m.date === d && m.text === r.text; });
          if (own && (!own._fromCloud || own._cloudId !== r.id)) { own._fromCloud = true; own._cloudId = r.id; own._synced = true; changed = true; }
        } else {
          var existing = c.messages.find(function (m) { return String(m._cloudId || m.id || "") === id; }) || c.messages.find(function (m) { return m.from === "peer" && m.date === d && m.text === r.text; });
          if (existing) {
            if (!existing._fromCloud || existing._cloudId !== r.id) { existing._fromCloud = true; existing._cloudId = r.id; changed = true; }
          } else {
            c.messages.push({ id: r.id, _cloudId: r.id, _fromCloud: true, from: "peer", text: r.text, date: d });
            newest.pseudo = r.from_pseudo || c.peerPseudo || "Quelqu'un";
            newest.emoji = r.from_emoji || c.peerEmoji || "😀";
            newest.text = r.text;
            receivedNew = true;
            changed = true;
          }
        }
      });

      if (changed) {
        _origSaveConvs();
        var messagesView = document.getElementById("messagesView");
        var inMessages = messagesView && messagesView.style.display !== "none";
        if (inMessages) {
          if (currentPeer) renderChatMessages();
          renderConvs();
          if (receivedNew) showToast("💬 Nouveau message reçu !");
        }
        if (!firstPull && receivedNew && typeof showSystemNotification === "function") {
          showSystemNotification("💬 " + newest.emoji + " " + newest.pseudo, newest.text);
        }
      }
      firstPull = false;
      replayDeleteOutbox();
    }).catch(function (err) { console.warn("[EmojiTalk] Synchronisation MP échouée :", err.message); });
  }

  document.addEventListener("emojitalk:mp-edited", function (ev) {
    if (!ev.detail || !ev.detail.message) return;
    var detail = ev.detail;
    locateCloudMessage(detail).then(function (row) {
      if (!row) { console.warn("[EmojiTalk] MP modifié localement; ligne cloud introuvable."); return; }
      detail.message._cloudId = row.id;
      return sbClient.from(MSG_TABLE).update({ text: detail.message.text, edited_at: new Date(detail.message.editedAt || Date.now()).toISOString() }).eq("id", row.id)
        .then(function (res) { if (res.error) console.warn("[EmojiTalk] Modification MP cloud échouée :", res.error.message); });
    }).catch(function (err) { console.warn("[EmojiTalk] Recherche MP cloud échouée :", err.message); });
  });
  document.addEventListener("emojitalk:mp-deleted", function (ev) {
    var detail = ev.detail;
    if (!detail || !detail.message) return;
    publishDeletion(detail, null).then(function (done) {
      if (!done) console.warn("[EmojiTalk] Suppression MP locale gardée en attente : ligne cloud introuvable.");
    }).catch(function (err) { console.warn("[EmojiTalk] Suppression MP cloud en attente :", err.message); });
  });

  /* --- Démarrage --- */
  pushNewMessages();
  replayDeleteOutbox();
  pullMessages();
  setInterval(pullMessages, 4000);

  /* Correctifs d'affichage mobile */
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
