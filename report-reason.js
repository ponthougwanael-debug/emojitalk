"use strict";

/* ============================================================
   report-reason.js — Raison du signalement
   ------------------------------------------------------------
   Remplace reportPost() : au lieu de signaler directement, une
   modale s'ouvre et demande la RAISON (chips prédéfinies ou
   texte libre). La raison est enregistrée dans la table cloud
   "reports" (voir reports.sql) pour consultation côté Supabase.
   Se branche sur script.js sans le modifier.
   ============================================================ */

(function () {

  var REPORT_REASONS = [" Spam", " Haine / harcèlement", " Contenu inapproprié", " Désinformation", " Autre"];

  /** Enregistre la raison dans la table cloud "reports" (insert-only). */
  function pushReason(postId, reason) {
    if (typeof cloudReady === "undefined" || !cloudReady || !sbClient) return;
    sbClient.from("reports").insert({
      post_id: postId,
      reporter_id: me.id,
      reporter_pseudo: me.pseudo,
      reason: reason,
      created_at: new Date().toISOString()
    }).then(function (res) {
      if (res.error) console.warn("[EmojiTalk] Enregistrement de la raison échoué :", res.error.message);
    });
  }

  // Remplace la fonction globale reportPost (les onclick appellent la
  // version globale à chaque clic → la notre prend le relais).
  reportPost = function (id) {
    var p = null;
    for (var i = 0; i < posts.length; i++) { if (posts[i].id === id) { p = posts[i]; break; } }
    if (!p) return;

    if ((p.reportedBy || []).indexOf(me.id) !== -1) {
      showToast("⚠️ Tu as déjà signalé ce post.", "error");
      return;
    }

    var old = document.getElementById("reportOverlay");
    if (old) old.remove();

    var ov = document.createElement("div");
    ov.id = "reportOverlay";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-label", "Signaler ce post");
    ov.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.88);z-index:300;display:flex;align-items:center;justify-content:center;padding:16px;";

    ov.innerHTML =
      '<div class="card" style="max-width:460px;width:100%;margin:0;position:relative;">' +
        '<h2 style="color:#f87171;">🚩 Signaler ce post</h2>' +
        '<p style="color:#e2e8f0;font-size:.95rem;">Pour quelle raison signales-tu ce post ?</p>' +
        '<div id="reportChips" style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0;"></div>' +
        '<textarea id="reportReason" rows="3" maxlength="300" placeholder="Décris la raison (optionnel si tu choisis un motif ci-dessus)..." aria-label="Raison du signalement" style="width:100%;box-sizing:border-box;font-size:16px;"></textarea>' +
        '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">' +
          '<button type="button" id="reportCancel" style="flex:1;min-width:120px;">Annuler</button>' +
          '<button type="button" class="delete-btn" id="reportConfirm" style="flex:1;min-width:140px;margin:0;">🚩 Signaler</button>' +
        '</div>' +
      '</div>';

    var selected = null;

    // Chips de motifs rapides
    var chips = ov.querySelector("#reportChips");
    REPORT_REASONS.forEach(function (r) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = r;
      b.style.cssText = "padding:8px 12px;border-radius:20px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;cursor:pointer;";
      b.onclick = function () {
        selected = r.trim();
        chips.querySelectorAll("button").forEach(function (x) {
          x.style.borderColor = "#334155";
          x.style.background = "#1e293b";
        });
        b.style.borderColor = "#f87171";
        b.style.background = "#7f1d1d";
      };
      chips.appendChild(b);
    });

    function close() { ov.remove(); document.removeEventListener("keydown", onEsc); }
    function onEsc(ev) { if (ev.key === "Escape") close(); }

    ov.addEventListener("click", function (ev) { if (ev.target === ov) close(); });
    ov.querySelector("#reportCancel").addEventListener("click", close);
    document.addEventListener("keydown", onEsc);

    ov.querySelector("#reportConfirm").addEventListener("click", function () {
      var reason = (selected ? selected + " — " : "") + ov.querySelector("#reportReason").value.trim();
      close();

      // Marque le signalement (même logique que l'ancien reportPost)
      p.reportedBy.push(me.id);
      p.reports = (p.reports || 0) + 1;
      savePosts();

      // Pousse la raison vers le cloud (table "reports")
      pushReason(p.id, reason);

      // Notifie supabase-sync.js (synchronise le compteur de signalements)
      document.dispatchEvent(new CustomEvent("emojitalk:post-reports", { detail: { post: p } }));

      if (p.reports >= 3) {
        // Comportement historique : 3 signalements = retrait automatique
        if (typeof deletePostSafe === "function") deletePostSafe(p.id);
      } else {
        showToast("🚩 Post signalé" + (reason ? " : " + reason : "") + ". Merci !", "success");
        if (typeof renderFeed === "function" && document.getElementById("feedView").style.display !== "none") renderFeed();
        if (typeof renderDetail === "function" && location.hash.indexOf("#post/") === 0) renderDetail();
      }
    });

    document.body.appendChild(ov);
    ov.querySelector("#reportCancel").focus();
  };

})();
