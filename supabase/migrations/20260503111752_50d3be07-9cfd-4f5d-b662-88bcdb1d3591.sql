
CREATE TABLE public.whale_performance (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  total_trades INTEGER NOT NULL DEFAULT 0,
  closed_positions INTEGER NOT NULL DEFAULT 0,
  winning_positions INTEGER NOT NULL DEFAULT 0,
  losing_positions INTEGER NOT NULL DEFAULT 0,
  win_rate NUMERIC,
  avg_roi_pct NUMERIC,
  total_pnl_usd NUMERIC NOT NULL DEFAULT 0,
  total_volume_usd NUMERIC NOT NULL DEFAULT 0,
  unique_markets INTEGER NOT NULL DEFAULT 0,
  last_30d_trades INTEGER NOT NULL DEFAULT 0,
  last_trade_at TIMESTAMPTZ,
  quality_score NUMERIC NOT NULL DEFAULT 0,
  quality_tier TEXT NOT NULL DEFAULT 'C',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_summary JSONB
);

ALTER TABLE public.whale_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read whale_performance" ON public.whale_performance FOR SELECT USING (true);

CREATE INDEX idx_whale_performance_score ON public.whale_performance(quality_score DESC);
CREATE INDEX idx_whale_performance_tier ON public.whale_performance(quality_tier);

ALTER TABLE public.tracked_wallets
  ADD COLUMN IF NOT EXISTS quality_tier TEXT NOT NULL DEFAULT 'UNRATED',
  ADD COLUMN IF NOT EXISTS quality_score NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_disabled_reason TEXT;
