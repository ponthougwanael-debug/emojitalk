-- ============================================================
-- EmojiTalk — supabase-sync.sql
-- Script COMPLET à coller dans le SQL Editor de Supabase
-- (Dashboard > SQL Editor > New query > coller > Run).
-- Il peut être ré-exécuté sans risque : il ne recrée pas ce
-- qui existe déjà.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Table des posts
-- ------------------------------------------------------------
create table if not exists posts (
  id                bigint primary key,
  author_id         text not null,
  author_pseudo     text not null default 'Anonyme',
  author_emoji      text not null default '😀',
  author_interests  jsonb not null default '[]'::jsonb,
  author_personality jsonb not null default '[]'::jsonb,
  text              text not null,
  likes             int not null default 0,
  liked_by          jsonb not null default '[]'::jsonb,
  reports           int not null default 0,
  reported_by       jsonb not null default '[]'::jsonb,
  parent_id         bigint,
  edited            boolean not null default false,
  created_at        timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. NOUVEAU : table des suppressions partagées ("pierres tombales")
-- Tout appareil qui supprime un post y enregistre l'ID : les
-- autres appareils consultent cette liste et purgent le post,
-- même si le DELETE de la ligne a échoué ou traîne.
-- ------------------------------------------------------------
create table if not exists deleted_posts (
  post_id    bigint primary key,
  deleted_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. Activer l'accès public (site sans compte)
-- ------------------------------------------------------------
alter table posts         enable row level security;
alter table deleted_posts enable row level security;

-- Posts : lecture, création, modification…
drop policy if exists "public read posts"    on posts;
drop policy if exists "public insert posts"  on posts;
drop policy if exists "public update posts"  on posts;
-- …ET SUPPRESSION (c'était le chaînon manquant : sans cette
-- politique, les posts supprimés restaient dans le cloud et
-- réapparaissaient sur les autres appareils).
drop policy if exists "public delete posts"  on posts;

create policy "public read posts"   on posts for select using (true);
create policy "public insert posts" on posts for insert with check (true);
create policy "public update posts" on posts for update using (true);
create policy "public delete posts" on posts for delete using (true);

-- Pierres tombales : lecture (pour filtrer), écriture (pour
-- enregistrer une suppression), suppression (nettoyage).
drop policy if exists "public read deleted"   on deleted_posts;
drop policy if exists "public insert deleted" on deleted_posts;
drop policy if exists "public delete deleted" on deleted_posts;

create policy "public read deleted"   on deleted_posts for select using (true);
create policy "public insert deleted" on deleted_posts for insert with check (true);
create policy "public delete deleted" on deleted_posts for delete using (true);
