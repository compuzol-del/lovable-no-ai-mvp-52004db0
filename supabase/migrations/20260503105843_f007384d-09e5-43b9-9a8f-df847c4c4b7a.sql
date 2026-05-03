ALTER TABLE public.paper_positions
  ADD COLUMN IF NOT EXISTS breakeven_moved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS peak_price numeric;

ALTER TABLE public.paper_bot_config
  ADD COLUMN IF NOT EXISTS breakeven_trigger_pct numeric NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS whale_reversal_exit boolean NOT NULL DEFAULT true;