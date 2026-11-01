-- ============================================================
-- EmojiTalk — table des messages privés (MP entre visiteurs)
-- À exécuter dans le SQL Editor de Supabase.
-- Ré-exécutable sans risque (if not exists partout).
-- ============================================================

-- 1. Table des messages privés
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  conv_key    text not null,          -- "idA|idB" (triés) : identifie la conversation
  from_id     text not null,          -- expéditeur
  to_id       text not null,          -- destinataire
  from_pseudo text not null,
  from_emoji  text not null,
  text        text not null,
  msg_date    timestamptz not null default now()
);

-- 2. Accès public (projet 100% anonyme, sans compte)
alter table public.messages enable row level security;

drop policy if exists "public read messages"  on public.messages;
drop policy if exists "public write messages" on public.messages;

create policy "public read messages"  on public.messages for select using (true);
create policy "public write messages" on public.messages for insert with check (true);

-- 3. Index pour la lecture rapide des nouvelles conversations
create index if not exists messages_conv_idx on public.messages (conv_key);
create index if not exists messages_date_idx on public.messages (msg_date);

-- 4. Rappel : la politique DELETE sur "posts" (correctif précédent).
-- Si tu ne l'as pas encore exécutée, décommente la ligne suivante :
-- create policy "public delete posts" on public.posts for delete using (true);
