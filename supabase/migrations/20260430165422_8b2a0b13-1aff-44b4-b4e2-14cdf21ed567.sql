
ALTER TABLE public.news_signals
  ADD COLUMN IF NOT EXISTS price_30m numeric,
  ADD COLUMN IF NOT EXISTS price_2h  numeric,
  ADD COLUMN IF NOT EXISTS price_4h  numeric,
  ADD COLUMN IF NOT EXISTS pnl_30m   numeric,
  ADD COLUMN IF NOT EXISTS pnl_1h    numeric,
  ADD COLUMN IF NOT EXISTS pnl_2h    numeric,
  ADD COLUMN IF NOT EXISTS pnl_4h    numeric,
  ADD COLUMN IF NOT EXISTS horizons_done jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Function: claim signals due for ANY horizon snapshot (30m/1h/2h/4h)
-- Uses horizons_done JSON to track which horizons already captured.
CREATE OR REPLACE FUNCTION public.claim_signals_for_horizon(
  _horizon_seconds integer,
  _horizon_key text,
  _limit integer DEFAULT 100
) RETURNS TABLE(id bigint, asset text, price_now numeric, recommended_position_usd numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT s.id FROM public.news_signals s
    WHERE s.detected_at < now() - make_interval(secs => _horizon_seconds)
      AND NOT (s.horizons_done ? _horizon_key)
      AND s.status IN ('active','resolved')
    ORDER BY s.detected_at ASC
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.news_signals s
     SET horizons_done = s.horizons_done || jsonb_build_object(_horizon_key, 'claimed')
    FROM due
   WHERE s.id = due.id
  RETURNING s.id, s.asset, s.price_now, s.recommended_position_usd;
END;
$$;
