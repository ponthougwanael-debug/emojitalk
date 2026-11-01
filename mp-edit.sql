-- EmojiTalk — edition/suppression des MP avec tombstones partagés.
-- À exécuter une fois dans Supabase SQL Editor. Ré-exécutable sans risque.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- Le site utilise des visiteurs anonymes (clé anon). Ces politiques
-- suivent le modèle public déjà utilisé pour lecture/envoi des messages.
DROP POLICY IF EXISTS "public update messages" ON public.messages;
CREATE POLICY "public update messages" ON public.messages
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public delete messages" ON public.messages;
CREATE POLICY "public delete messages" ON public.messages
  FOR DELETE USING (true);

-- Un tombstone demeure après la suppression de la ligne messages et indique
-- aux deux participants quel message retirer de leur copie locale.
CREATE TABLE IF NOT EXISTS public.deleted_messages (
  message_id uuid PRIMARY KEY,
  conv_key text NOT NULL,
  from_id text NOT NULL,
  to_id text NOT NULL,
  msg_date timestamptz NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deleted_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read deleted messages" ON public.deleted_messages;
DROP POLICY IF EXISTS "public insert deleted messages" ON public.deleted_messages;
DROP POLICY IF EXISTS "public update deleted messages" ON public.deleted_messages;
CREATE POLICY "public read deleted messages" ON public.deleted_messages
  FOR SELECT USING (true);
CREATE POLICY "public insert deleted messages" ON public.deleted_messages
  FOR INSERT WITH CHECK (true);
CREATE POLICY "public update deleted messages" ON public.deleted_messages
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS deleted_messages_conv_idx
  ON public.deleted_messages (conv_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.messages TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.deleted_messages TO anon, authenticated;
