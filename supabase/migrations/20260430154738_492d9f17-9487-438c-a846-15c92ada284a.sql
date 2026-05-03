-- Index to speed up "due for resolution" lookups
CREATE INDEX IF NOT EXISTS idx_news_signals_status_detected
  ON public.news_signals (status, detected_at);

-- Atomic claim: flips up to N rows from 'active' -> 'resolving' and returns them.
-- Uses FOR UPDATE SKIP LOCKED so concurrent runs grab disjoint sets safely.
CREATE OR REPLACE FUNCTION public.claim_signals_for_resolution(
  _max_age_seconds integer DEFAULT 3600,
  _limit integer DEFAULT 100,
  _stuck_seconds integer DEFAULT 600
)
RETURNS TABLE (
  id bigint,
  asset text,
  price_now numeric,
  recommended_position_usd numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- First, requeue anything stuck in 'resolving' for too long (crashed run).
  UPDATE public.news_signals
     SET status = 'active'
   WHERE status = 'resolving'
     AND detected_at < now() - make_interval(secs => _stuck_seconds);

  RETURN QUERY
  WITH due AS (
    SELECT s.id
      FROM public.news_signals s
     WHERE s.status = 'active'
       AND s.detected_at < now() - make_interval(secs => _max_age_seconds)
     ORDER BY s.detected_at ASC
     LIMIT _limit
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.news_signals s
     SET status = 'resolving'
    FROM due
   WHERE s.id = due.id
  RETURNING s.id, s.asset, s.price_now, s.recommended_position_usd;
END;
$$;