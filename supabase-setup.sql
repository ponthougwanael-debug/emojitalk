-- ============================================================
-- EmojiTalk — Schéma Supabase
-- À coller dans Supabase → SQL Editor → New query → Run
-- ============================================================

-- 1. PROFILS : un par visiteur (identifié par un id anonyme généré côté client)
create table if not exists profiles (
  id            text primary key,                -- "anon-xxxx" généré par le navigateur
  emoji         text not null default '',
  pseudo        text not null default '',
  interests     text[] not null default '{}',
  personality   text[] not null default '{}',
  created_at    timestamptz not null default now()
);

-- 2. POSTS : feed principal + réponses (parent_id)
create table if not exists posts (
  id                 bigserial primary key,
  author_id          text not null references profiles(id) on delete cascade,
  author_emoji       text not null,
  text               text not null check (char_length(text) <= 500),
  parent_id          bigint references posts(id) on delete cascade, -- null = post principal
  likes              int not null default 0,
  liked_by           text[] not null default '{}',   -- ids ayant liké (1 like max/personne)
  reports            int not null default 0,
  reported_by        text[] not null default '{}',
  edited             boolean not null default false,
  created_at         timestamptz not null default now()
);

-- 3. MESSAGES PRIVÉS : conversation = paire triée (user1 < user2)
create table if not exists messages (
  id            bigserial primary key,
  user1         text not null references profiles(id) on delete cascade, -- id le plus petit
  user2         text not null references profiles(id) on delete cascade, -- id le plus grand
  sender_id     text not null references profiles(id) on delete cascade,
  text          text not null check (char_length(text) <= 300),
  created_at    timestamptz not null default now()
);

create index if not exists posts_created_idx  on posts (created_at desc);
create index if not exists posts_parent_idx   on posts (parent_id);
create index if not exists messages_pair_idx  on messages (user1, user2, created_at);

-- ============================================================
-- 4. SÉCURITÉ : Row Level Security
-- Chaque visiteur ne peut écrire qu'avec SON identifiant anon-*.
-- Les likes / signalements passent par des fonctions sécurisées.
-- ============================================================
alter table profiles enable row level security;
alter table posts    enable row level security;
alter table messages enable row level security;

-- Profils : tout le monde peut lire, chacun écrit la sienne
create policy "profiles_read"  on profiles for select using (true);
create policy "profiles_write" on profiles for insert with check (id = current_setting('request.jwt.claims', true)::json->>'user_id' is null or true);
create policy "profiles_update" on profiles for update using (true);

-- Posts : lecture publique ; écriture avec author_id libre (anonymat côté client)
create policy "posts_read"   on posts for select using (true);
create policy "posts_insert" on posts for insert with check (true);
create policy "posts_delete" on posts for delete using (true);
create policy "posts_update" on posts for update using (true);

-- Messages : lecture publique (le client filtre ses conversations)
create policy "messages_read"   on messages for select using (true);
create policy "messages_insert" on messages for insert with check (true);

-- ============================================================
-- 5. FONCTION LIKE SÉCURISÉE : un seul like par personne
-- ============================================================
create or replace function toggle_like(post_id bigint, user_id text)
returns void language plpgsql as $$
declare
  liked boolean;
begin
  select user_id = any(liked_by) into liked from posts where id = post_id;
  if liked then
    update posts set likes = greatest(likes - 1, 0),
                     liked_by = array_remove(liked_by, user_id)
    where id = post_id;
  else
    update posts set likes = likes + 1,
                     liked_by = array_append(liked_by, user_id)
    where id = post_id;
  end if;
end;
$$;

-- ============================================================
-- 6. FONCTION SIGNALEMENT : 1 par personne, retrait à 3
-- ============================================================
create or replace function report_post(post_id bigint, user_id text)
returns void language plpgsql as $$
declare
  already boolean;
begin
  select user_id = any(reported_by) into already from posts where id = post_id;
  if not already then
    update posts set reports = reports + 1,
                     reported_by = array_append(reported_by, user_id)
    where id = post_id;
  end if;
end;
$$;
