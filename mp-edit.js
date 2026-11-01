"use strict";
/* EmojiTalk — édition/suppression des MP de l'utilisateur courant. */
(function () {
  var style = document.createElement("style");
  style.textContent = ".mp-message-actions{display:flex;gap:6px;justify-content:flex-end;margin-top:5px}.mp-message-actions button{border:0;border-radius:6px;padding:3px 7px;font-size:.72rem;cursor:pointer;background:rgba(15,23,42,.10);color:inherit}.mp-message-actions button:hover{background:rgba(15,23,42,.2)}.mp-edit-form{display:grid;gap:6px}.mp-edit-form textarea{width:100%;min-height:72px;resize:vertical;box-sizing:border-box}.mp-edit-form .mp-edit-controls{display:flex;gap:6px;justify-content:flex-end}.mp-edit-form button{font-size:.78rem;padding:5px 9px}.bubble.mine{position:relative}";
  document.head.appendChild(style);

  var MP_TOMBSTONE_KEY = "emojitalk:mp-deleted-ids";
  var MP_DELETE_OUTBOX_KEY = "emojitalk:mp-delete-outbox";
  function persistTombstone(ids) {
    try {
      var old = JSON.parse(localStorage.getItem(MP_TOMBSTONE_KEY) || "[]") || [];
      ids.forEach(function (id) { if (id && old.indexOf(String(id)) === -1) old.push(String(id)); });
      localStorage.setItem(MP_TOMBSTONE_KEY, JSON.stringify(old.slice(-1000)));
    } catch (e) { /* stockage indisponible : suppression locale tout de même */ }
  }
  function queueDeleteForSync(detail) {
    try {
      var queue = JSON.parse(localStorage.getItem(MP_DELETE_OUTBOX_KEY) || "[]") || [];
      var m = detail.message || {};
      var key = String(detail.id || m.id) + "|" + String(detail.peerId) + "|" + String(m.date);
      if (!queue.some(function (item) { return item.key === key; })) {
        queue.push({ key: key, id: detail.id, peerId: detail.peerId, message: m });
      }
      localStorage.setItem(MP_DELETE_OUTBOX_KEY, JSON.stringify(queue.slice(-1000)));
    } catch (e) { console.warn("[EmojiTalk] File de suppression MP locale indisponible."); }
  }
  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); });
  }
  function ensureIds() {
    if (!window.convs) return false;
    var changed = false;
    Object.keys(convs).forEach(function (peerId) {
      (convs[peerId].messages || []).forEach(function (m) { if (!m.id) { m.id = makeId(); changed = true; } });
    });
    return changed;
  }
  if (ensureIds() && typeof saveConvs === "function") saveConvs();

  var renderBase = window.renderChatMessages;
  window.renderChatMessages = function () {
    if (typeof renderBase === "function") renderBase();
    ensureIds();
    var c = convs && convs[currentPeer];
    var box = document.getElementById("chatMessages");
    if (!c || !box) return;
    var mine = c.messages.filter(function (m) { return m.from === "me"; });
    Array.prototype.forEach.call(box.querySelectorAll(".bubble.mine"), function (bubble, i) {
      var m = mine[i];
      if (!m) return;
      bubble.dataset.messageId = m.id;
      var editedLabel = m.edited ? document.createElement("small") : null;
      if (editedLabel) { editedLabel.className = "mp-edited-label"; editedLabel.textContent = "modifié"; editedLabel.style.cssText = "display:block;font-size:.68rem;opacity:.7;text-align:right"; bubble.insertBefore(editedLabel, bubble.querySelector("time")); }
      var actions = document.createElement("div");
      actions.className = "mp-message-actions";
      actions.innerHTML = '<button type="button" data-mp-action="edit" aria-label="Modifier ce message">✏️ modifier</button><button type="button" data-mp-action="delete" aria-label="Supprimer ce message">🗑️ supprimer</button>';
      bubble.appendChild(actions);
    });
  };

  function saveLocal() {
    if (typeof saveConvs === "function") saveConvs();
    if (typeof renderChatMessages === "function") renderChatMessages();
    if (typeof renderConvs === "function") renderConvs();
  }
  function findMessage(peerId, id) {
    var c = convs && convs[peerId];
    if (!c) return null;
    for (var i = 0; i < c.messages.length; i++) if (c.messages[i].id === id && c.messages[i].from === "me") return { conv: c, message: c.messages[i], index: i };
    return null;
  }
  function beginEdit(bubble, peerId, id) {
    var found = findMessage(peerId, id);
    if (!found) return;
    var form = document.createElement("form"); form.className = "mp-edit-form";
    var area = document.createElement("textarea"); area.maxLength = MAX_MSG_LEN; area.value = found.message.text;
    area.setAttribute("aria-label", "Modifier le message");
    var controls = document.createElement("div"); controls.className = "mp-edit-controls";
    var cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Annuler";
    var save = document.createElement("button"); save.type = "submit"; save.textContent = "Enregistrer";
    controls.appendChild(cancel); controls.appendChild(save); form.appendChild(area); form.appendChild(controls);
    bubble.replaceChildren(form);
    cancel.addEventListener("click", function () { renderChatMessages(); });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var text = area.value.trim();
      if (!text) { showToast("Écris un message ! 🙂", "error"); return; }
      if (text.length > MAX_MSG_LEN) { showToast("Message trop long (max " + MAX_MSG_LEN + ").", "error"); return; }
      if (containsBanned(text)) { showToast("🚫 Mots inappropriés détectés.", "error"); return; }
      var oldText = found.message.text;
      found.message.text = text;
      found.message._oldText = oldText;
      found.message.edited = true;
      found.message.editedAt = Date.now();
      saveLocal();
      document.dispatchEvent(new CustomEvent("emojitalk:mp-edited", { detail: { id: found.message.id, peerId: peerId, message: Object.assign({}, found.message) } }));
      if (typeof showToast === "function") showToast("✏️ Message modifié.");
    });
    area.focus(); area.setSelectionRange(area.value.length, area.value.length);
  }
  function deleteMessage(peerId, id) {
    if (!window.confirm("Supprimer ce message ?")) return;
    var found = findMessage(peerId, id);
    if (!found) return;
    var detail = { id: found.message.id, peerId: peerId, message: Object.assign({}, found.message) };
    persistTombstone([detail.id, detail.message._cloudId, "legacy:" + peerId + "|" + detail.message.date]);
    queueDeleteForSync(detail);
    found.conv.messages.splice(found.index, 1);
    saveLocal();
    document.dispatchEvent(new CustomEvent("emojitalk:mp-deleted", { detail: detail }));
    if (typeof showToast === "function") showToast("🗑️ Message supprimé.");
  }
  document.getElementById("chatMessages").addEventListener("click", function (ev) {
    var button = ev.target.closest("button[data-mp-action]");
    if (!button) return;
    ev.preventDefault(); ev.stopPropagation();
    var bubble = button.closest(".bubble.mine");
    if (!bubble || !currentPeer) return;
    var action = button.dataset.mpAction, id = bubble.dataset.messageId, peerId = currentPeer;
    if (action === "edit") beginEdit(bubble, peerId, id);
    else if (action === "delete") deleteMessage(peerId, id);
  });
})();
