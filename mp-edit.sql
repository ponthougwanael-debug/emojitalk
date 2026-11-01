-- EmojiTalk — prise en charge de l'édition et suppression des MP.
-- À exécuter une seule fois dans Supabase SQL Editor; réexécutable sans risque.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- Le projet utilise une clé publique anon sans compte connecté. Ces droits
-- suivent le modèle d'accès public déjà utilisé pour l'envoi/lecture des MP.
DROP POLICY IF EXISTS "public update messages" ON public.messages;
CREATE POLICY "public update messages" ON public.messages
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public delete messages" ON public.messages;
CREATE POLICY "public delete messages" ON public.messages
  FOR DELETE USING (true);