ALTER TABLE public.whale_signals
  ADD COLUMN IF NOT EXISTS price_std numeric,
  ADD COLUMN IF NOT EXISTS burst_minutes numeric,
  ADD COLUMN IF NOT EXISTS score_breakdown jsonb DEFAULT '{}'::jsonb;