-- Shape metadata for Aura drafts. Written at generation time by
-- generate-authority-content using _shared/fingerprint.ts, and read back as the
-- no-repeat lookback. Nullable and NOT backfilled: older rows simply do not
-- constrain rotation.
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS hook_style text,
  ADD COLUMN IF NOT EXISTS ending_type text;

COMMENT ON COLUMN public.content_items.hook_style IS
  'Classified OPEN shape of this draft (fingerprint.hookStyleOf). Used to stop the same opening type repeating across a member''s recent drafts.';
COMMENT ON COLUMN public.content_items.ending_type IS
  'Classified LAND shape of this draft (fingerprint.endingTypeOf).';

-- The lookback is: user_id + made_by + status, newest first.
CREATE INDEX IF NOT EXISTS content_items_user_made_by_created_idx
  ON public.content_items (user_id, made_by, created_at DESC);