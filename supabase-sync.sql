-- ============================================================
-- EmojiTalk — synchronisation entre visiteurs via Supabase
-- À exécuter dans le SQL Editor de Supabase.
-- (Ce script remplace/complete supabase-setup.sql : si tu as déjà
--  exécuté supabase-setup.sql, celui-ci recrée la table "posts"
--  avec la structure exacte utilisée par supabase-sync.js.)
-- ============================================================

-- 1. Table des posts partagés
create table if not exists public.posts (
  id                  int8 primary key,          -- même id que côté client (Date.now())
  author_id           text not null,             -- identifiant anonyme du navigateur
  author_pseudo       text not null,
  author_emoji        text not null,
  author_interests    jsonb not null default '[]',
  author_personality  jsonb not null default '[]',
  text                text not null,
  likes               int  not null default 0,
  liked_by            jsonb not null default '[]',
  reports             int  not null default 0,
  reported_by         jsonb not null default '[]',
  parent_id           int8,                      -- non-null = réponse à un autre post
  edited              boolean not null default false,
  created_at          timestamptz not null default now()
);

-- 2. Accès public (projet 100% anonyme, sans compte)
alter table public.posts enable row level security;

drop policy if exists "public read posts"   on public.posts;
drop policy if exists "public write posts"  on public.posts;
drop policy if exists "public update posts" on public.posts;

create policy "public read posts"   on public.posts for select using (true);
create policy "public write posts"  on public.posts for insert with check (true);
create policy "public update posts" on public.posts for update using (true);

-- 3. (Optionnel mais conseillé) Index pour de bonnes performances
create index if not exists posts_created_at_idx on public.posts (created_at desc);
