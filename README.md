# 💬 EmojiTalk

Site de discussion **sans compte** : ton identité, c'est un emoji. Choisis ton avatar, tes centres d'intérêt et ta personnalité, puis participe au feed public ou discute en privé.

## ✨ Fonctionnalités

- 🔐 **Aucun compte requis** — onboarding en 3 étapes (emoji → centres d'intérêt → personnalité)
- 😀 **Avatar emoji** — emoji prédéfini ou personnalisé, distinction automatique si deux utilisateurs ont le même (🦊 et 🦊²)
- 📰 **Feed public** — posts de 500 caractères max, recherche, tri par récents/populaires
- ❤️ **Likes et réponses** — fils de discussion avec vue détail
- 💬 **Messages privés** — conversations 1-to-1 en temps quasi réel
- 🚩 **Signalements** — avec choix du motif, et mots interdits côté client
- 🔔 **Notifications système** — à la réception d'un message privé (PWA)
- ♿ **Accessibilité** — navigation clavier, ARIA, contrastes
- ☁️ **Synchronisation cloud** — le feed et les MPs sont partagés entre tous les visiteurs via Supabase

## 🛠️ Stack

- HTML / CSS / JavaScript vanilla (sans framework)
- [Supabase](https://supabase.com) (PostgreSQL + API REST) pour la synchronisation
- Service Worker pour les notifications

## 📁 Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Page unique (SPA) : onboarding, feed, MPs, paramètres |
| `style.css` | Styles (thème sombre, verre dépoli) |
| `script.js` | Cœur du site : posts, likes, MPs, paramètres |
| `supabase-sync.js` | Sync cloud du feed |
| `mp-sync.js` | Sync cloud des messages privés |
| `notify.js` | Notifications système |
| `report-reason.js` | Modale de motif de signalement |
| `profile.js`, `account.js` | Profil et gestion du compte |
| `emoji-distinguish.js`, `a11y.js` | Distinction d'emoji, accessibilité |
| `*.sql` | Scripts de création des tables et policies Supabase |

## 🚀 Déploiement

### 1. Supabase

1. Crée un projet sur [supabase.com](https://supabase.com).
2. Dans l'éditeur SQL, exécute les scripts dans l'ordre :
   `supabase-setup.sql` → `supabase-sync.sql` → `mp-supabase.sql` → `mp-edit.sql` → `reports.sql`
3. Copie l'**URL** et la clé **anon** du projet (Settings → API).

### 2. Configuration

Les identifiants Supabase (URL + clé publique anon) sont à renseigner dans `supabase-sync.js` et `mp-sync.js`.

### 3. GitHub Pages

1. Pousse le code sur GitHub.
2. Settings → Pages → Source : branche `main`, dossier racine.
3. Le site est disponible sur `https://<utilisateur>.github.io/emojitalk/`.

## 📄 Licence

Voir [LICENSE](LICENSE) (MIT).
