-- EmojiTalk RLS hardening
-- Tables/columns are cross-checked against supabase-sync.js, mp-sync.js,
-- mp-supabase.sql and reports.sql. Review identity caveat and TODOs before use.
--
-- IMPORTANT IDENTITY LIMITATION:
-- The browser app currently identifies visitors with client-generated text IDs
-- (e.g. anon-...); these are not bound to Supabase auth.uid(). RLS cannot safely
-- prove that a caller owns from_id/to_id/author_id from those values alone.
-- The policies below use auth.uid()::text so they fail closed for that app until
-- proper Supabase Auth identities are used and the app stores auth.uid() in its
-- author_id/from_id/to_id columns. TODO: confirm deployed table column types,
-- especially posts.author_id and messages.from_id/to_id before running. Do not replace these checks with client-claimed
-- IDs or pseudo values: that would not be a security boundary.

-- Verified table references: posts and deleted_posts (supabase-sync.js),
-- messages (mp-supabase.sql / mp-sync.js), deleted_messages (mp-sync.js),
-- reports (reports.sql). TODO: confirm the deployed DDL for posts,
-- deleted_posts and deleted_messages; their full column definitions are not
-- present in the inspected SQL files.
alter table public.posts enable row level security;
alter table public.messages enable row level security;
alter table public.deleted_posts enable row level security;
alter table public.deleted_messages enable row level security;
alter table public.reports enable row level security;

-- Remove existing policies on the known tables before applying these rules.
-- Otherwise PostgreSQL OR-combines permissive policies, which could leave old
-- public access grants active. Review unrelated custom policies before running.
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('posts', 'messages', 'deleted_posts', 'deleted_messages', 'reports')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- Posts are publicly readable. Only the authenticated author may change/remove
-- their post. author_id and author_pseudo are the app's known posts columns;
-- pseudo is intentionally not used for authorization because it is spoofable.
drop policy if exists "posts_public_select" on public.posts;
create policy "posts_public_select" on public.posts
  for select to anon, authenticated using (true);

drop policy if exists "posts_author_update" on public.posts;
create policy "posts_author_update" on public.posts
  for update to authenticated
  using (author_id = auth.uid()::text)
  with check (author_id = auth.uid()::text);

drop policy if exists "posts_author_delete" on public.posts;
create policy "posts_author_delete" on public.posts
  for delete to authenticated using (author_id = auth.uid()::text);
-- No posts INSERT policy is granted here: add one only after author_id is tied
-- to auth.uid() by the client/server implementation.

-- Private messages: known columns are from_id, to_id, conv_key, etc.
-- Participant checks use the trusted JWT subject, never a caller-supplied
-- conversation key. Once app identity is upgraded to Supabase Auth, each side
-- can read messages in which it is sender/recipient and insert only as sender.
drop policy if exists "messages_participants_select" on public.messages;
create policy "messages_participants_select" on public.messages
  for select to authenticated
  using (auth.uid()::text = from_id or auth.uid()::text = to_id);

drop policy if exists "messages_sender_insert" on public.messages;
create policy "messages_sender_insert" on public.messages
  for insert to authenticated
  with check (auth.uid()::text = from_id);

-- MP deletion markers use the known deleted_messages columns. Access is limited
-- to conversation participants; INSERT identifies the creating participant by
-- from_id. The existing MP sync's upsert also needs UPDATE; intentionally no
-- UPDATE/DELETE grant is provided by this hardening script.
drop policy if exists "deleted_messages_participants_select" on public.deleted_messages;
create policy "deleted_messages_participants_select" on public.deleted_messages
  for select to authenticated
  using (auth.uid()::text = from_id or auth.uid()::text = to_id);

drop policy if exists "deleted_messages_participants_insert" on public.deleted_messages;
create policy "deleted_messages_participants_insert" on public.deleted_messages
  for insert to authenticated
  with check (auth.uid()::text = from_id or auth.uid()::text = to_id);

-- reports has known columns post_id, reporter_id, reporter_pseudo, reason,
-- created_at. Reporting is INSERT-only for anon/authenticated; no SELECT policy
-- is intentionally created (RLS therefore denies reads).
drop policy if exists "reports_public_insert_only" on public.reports;
create policy "reports_public_insert_only" on public.reports
  for insert to anon, authenticated with check (true);

-- deleted_posts is a shared tombstone table referenced by supabase-sync.js.
-- Referenced column post_id is known; full deployed schema is unknown. There is
-- no trusted participant/owner column confirmed in the available sync code.
-- RLS is enabled with no policies so browser roles cannot read or write it.
-- TODO: add authenticated, owner-bound policies after schema/identity redesign.

-- PROFILES / INTERESTS
-- No profiles or interests table definition/usage exists in the active uploaded
-- sync code; supabase-setup.sql explicitly labels its profiles schema obsolete.
-- Do not guess table or owner-column names. TODO: when exact schemas exist, add:
--   alter table public.<EXACT_PROFILE_TABLE> enable row level security;
--   alter table public.<EXACT_INTEREST_TABLE> enable row level security;
--   policies: SELECT to anon, authenticated USING (true);
--   INSERT/UPDATE/DELETE to authenticated USING/WITH CHECK (<owner_col> = auth.uid()::text);
-- Replace every TODO placeholder using the actual verified schema first.
