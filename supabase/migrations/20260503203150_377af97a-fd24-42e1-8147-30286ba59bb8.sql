
ALTER TABLE public.paper_bot_config
  ADD COLUMN IF NOT EXISTS min_market_volume_usd numeric NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS min_market_liquidity_usd numeric NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS max_open_per_event integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_open_total integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS dynamic_exits boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dynamic_time_stop boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reversal_buy_bonus boolean NOT NULL DEFAULT true;

ALTER TABLE public.paper_positions
  ADD COLUMN IF NOT EXISTS event_id text,
  ADD COLUMN IF NOT EXISTS market_volume_usd numeric,
  ADD COLUMN IF NOT EXISTS market_liquidity_usd numeric,
  ADD COLUMN IF NOT EXISTS price_tier text,
  ADD COLUMN IF NOT EXISTS time_to_resolution_hours numeric;

CREATE INDEX IF NOT EXISTS idx_paper_positions_event_open
  ON public.paper_positions (event_id) WHERE status = 'OPEN';
