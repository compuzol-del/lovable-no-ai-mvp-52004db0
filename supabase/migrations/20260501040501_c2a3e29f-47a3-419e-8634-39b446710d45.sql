-- Whale Consensus Signals: aggregated buy patterns from tracked wallets
CREATE TABLE public.whale_signals (
  id BIGSERIAL PRIMARY KEY,
  condition_id TEXT NOT NULL,
  asset TEXT,
  outcome TEXT,
  title TEXT,
  
  -- Aggregation metrics (24h window)
  unique_wallets INT NOT NULL,
  total_buys INT NOT NULL,
  total_usd NUMERIC NOT NULL,
  avg_price NUMERIC NOT NULL,           -- USD-weighted
  min_price NUMERIC,
  max_price NUMERIC,
  current_price NUMERIC,
  price_drift_pct NUMERIC,              -- (current - avg) / avg * 100
  
  -- Timing
  first_buy_at TIMESTAMPTZ NOT NULL,
  last_buy_at TIMESTAMPTZ NOT NULL,
  minutes_since_last_buy INT NOT NULL,
  
  -- Wallets that bought (array of labels)
  wallet_labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  wallet_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Score & decision
  score NUMERIC NOT NULL,
  action TEXT NOT NULL,                 -- STRONG_BUY | WATCH | IGNORE
  
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(condition_id, outcome, computed_at)
);

CREATE INDEX idx_whale_signals_action ON public.whale_signals(action, computed_at DESC);
CREATE INDEX idx_whale_signals_score ON public.whale_signals(score DESC, computed_at DESC);
CREATE INDEX idx_whale_signals_condition ON public.whale_signals(condition_id, computed_at DESC);

ALTER TABLE public.whale_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read whale_signals"
  ON public.whale_signals FOR SELECT
  USING (true);