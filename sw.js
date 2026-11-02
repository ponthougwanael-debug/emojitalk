/* ============================================================
   EmojiTalk — Service Worker
   Rôle : afficher les notifications système et, au clic,
   ramener l'utilisateur sur le site (ou sur l'onglet ouvert).
   ============================================================ */

/* ⚠️ Version du cache : à incrémenter à CHAQUE déploiement
   (ex: "emojitalk-cache-v2"), sinon les visiteurs restent
   sur l'ancienne version du site. */
const CACHE_VERSION = "emojitalk-cache-v1";

self.addEventListener("install", function () { self.skipWaiting(); });

/* À l'activation : suppression des caches obsolètes (versions antérieures),
   puis prise de contrôle immédiate des onglets ouverts. */
self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (n) { return n !== CACHE_VERSION; })
             .map(function (n) { return caches.delete(n); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

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
