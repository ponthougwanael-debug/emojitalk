"use strict";

/* ============================================================
   mp-sync.js — Synchronisation des messages privés via Supabase
   ------------------------------------------------------------
   AVANT : les MP n'existaient que dans le localStorage de chaque
   navigateur → un message envoyé n'arrivait jamais chez le
   destinataire. Désormais chaque message est enregistré dans la
   table cloud "messages" (voir mp-supabase.sql) et récupéré par
   le destinataire toutes les 4 secondes.
   Ce fichier se branche sur script.js sans le modifier : il
   remplace saveConvs() pour pousser les nouveaux messages.
   ============================================================ */

(function () {
  if (typeof cloudReady === "undefined" || !cloudReady || !sbClient) {
    console.warn("[EmojiTalk] MP : Supabase indisponible, messages privés en local uniquement.");
    return;
  }

  var MSG_TABLE = "messages";
  var lastSync = 0;        // date du dernier message reçu du cloud
  var sentKeys = {};       // anti-doublon pour l'envoi

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
        var k = peerId + "|" + m.date + "|" + m.text;
        if (m._synced || sentKeys[k]) return;
        sentKeys[k] = true;

        sbClient.from(MSG_TABLE).insert({
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
      .gt("msg_date", new Date(lastSync).toISOString())
      .order("msg_date", { ascending: true })
      .then(function (res) {
        if (res.error) { console.warn("[EmojiTalk] Réception MP échouée :", res.error.message); return; }

        var changed = false;
        (res.data || []).forEach(function (r) {
          var d = Date.parse(r.msg_date);
          if (d > lastSync) lastSync = d;

          var peerId = r.from_id === me.id ? r.to_id : r.from_id;
          if (peerId === me.id) return; // message que j'ai moi-même envoyé

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
              changed = true;
            }
          }
        });

        if (!changed) return;

        _origSaveConvs(); // stocke en local SANS repousser vers le cloud

        // Rafraîchit l'affichage si l'utilisateur est dans les messages
        if (document.getElementById("messagesView").style.display !== "none") {
          if (currentPeer) renderChatMessages();
          renderConvs();
          showToast("💬 Nouveau message reçu !");
        }
      });
  }

  /* --- 3. Démarrage --- */
  pushNewMessages();            // renvoie les messages restés en attente
  setInterval(pullMessages, 4000);

  /* --- 4. Correctifs d'affichage MOBILE (injection CSS) ---
     La mise en page ne s'adaptait pas sur smartphone : textes qui
     débordent, champs trop larges, zones tactiles trop petites. */
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
    "    font-size:16px;}" + /* 16px = évite le zoom automatique sur iOS */
    "  button{min-height:44px;}" +
    "  .bottom-nav button{flex:1;min-width:0;padding:8px 4px;}" +
    "  .nav-label{font-size:.7rem;}" +
    "  .tags{flex-wrap:wrap;}" +
    "  .post,.conv-item{max-width:100%;}" +
    "}";
  document.head.appendChild(css);
})();
