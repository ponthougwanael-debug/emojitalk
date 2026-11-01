"use strict";
/* ============================================================
   notify.js — Notifications système (PC + mobile)
   ------------------------------------------------------------
   Affiche une vraie notification du système d'exploitation
   (bandeau Android/iOS, bulle Windows, centre de notifications
   macOS) quand un message privé arrive, même si l'onglet est
   en arrière-plan. Le navigateur demande l'autorisation à la
   première interaction de l'utilisateur (obligatoire).
   ============================================================ */

/* Enregistre le service worker (nécessaire pour les notifications
   quand l'onglet est en arrière-plan). */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(function (e) {
    console.warn("[EmojiTalk] Service worker non enregistré :", e);
  });
}

var NOTIFY_ASKED_KEY = "emojitalk:notif-asked";

/**
 * Demande l'autorisation de notifier. Ne peut être appelée qu'à
 * la suite d'une action de l'utilisateur (clic) — c'est une règle
 * des navigateurs. On la déclenche silencieusement au premier clic
 * sur la page, une seule fois.
 */
function askNotifyPermission() {
  if (!("Notification" in window)) return; // navigateur non compatible
  try { localStorage.setItem(NOTIFY_ASKED_KEY, "1"); } catch (e) {}
  if (Notification.permission === "default") {
    Notification.requestPermission().then(function (p) {
      if (p === "granted") showToast("🔔 Notifications activées !");
    });
  }
}

/* Premier clic n'importe où sur la page → demande d'autorisation (1 seule fois) */
document.addEventListener("click", function once() {
  document.removeEventListener("click", once);
  var asked = false;
  try { asked = localStorage.getItem(NOTIFY_ASKED_KEY) === "1"; } catch (e) {}
  if (!asked) askNotifyPermission();
});

/**
 * Affiche une notification système si possible.
 * @param {string} title  — ex : "💬 🦊"
 * @param {string} body   — texte du message reçu
 */
window.showSystemNotification = function (title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  // Si l'onglet est déjà visible et au premier plan, le toast suffit.
  if (document.hasFocus() && document.visibilityState === "visible") return;

  var options = {
    body: body,
    icon: "data:image/svg+xml," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💬</text></svg>'
    ),
    badge: "data:image/svg+xml," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💬</text></svg>'
    ),
    tag: "emojitalk-mp",   // regroupe les notifications successives
    renotify: true
  };

  try {
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(function (reg) {
        reg.showNotification(title, options);
      }).catch(function () {
        try { new Notification(title, options); } catch (e) {}
      });
    } else {
      new Notification(title, options);
    }
  } catch (e) { /* certains navigateurs exigent SW : on ignore */ }
};
