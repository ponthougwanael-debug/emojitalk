/* ============================================================
   EmojiTalk — Service Worker
   Rôle : afficher les notifications système et, au clic,
   ramener l'utilisateur sur le site (ou sur l'onglet ouvert).
   ============================================================ */

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

/* Clic sur la notification → focus sur l'onglet du site, ou ouverture */
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.indexOf(self.location.origin) === 0) { return c.focus(); }
      }
      return self.clients.openWindow(self.location.origin);
    })
  );
});
