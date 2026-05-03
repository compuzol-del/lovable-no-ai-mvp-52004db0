
CREATE TABLE public.wallet_equity_daily (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  day DATE NOT NULL,
  cumulative_pnl NUMERIC NOT NULL DEFAULT 0,
  cumulative_volume NUMERIC NOT NULL DEFAULT 0,
  trade_count INTEGER NOT NULL DEFAULT 0,
  open_value NUMERIC,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wallet_address, day)
);
CREATE INDEX idx_equity_wallet_day ON public.wallet_equity_daily (wallet_address, day);
ALTER TABLE public.wallet_equity_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read equity" ON public.wallet_equity_daily FOR SELECT USING (true);

CREATE TABLE public.trade_triggers (
  id BIGSERIAL PRIMARY KEY,
  trade_id BIGINT NOT NULL,
  wallet_address TEXT NOT NULL,
  condition_id TEXT,
  ts TIMESTAMPTZ NOT NULL,
  trigger_type TEXT NOT NULL,
  price_at_trade NUMERIC,
  price_1h_before NUMERIC,
  price_6h_before NUMERIC,
  price_24h_before NUMERIC,
  price_1h_after NUMERIC,
  pct_change_1h_before NUMERIC,
  pct_change_1h_after NUMERIC,
  hours_to_resolution NUMERIC,
  is_winner BOOLEAN,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trade_id)
);
CREATE INDEX idx_triggers_wallet ON public.trade_triggers (wallet_address);
CREATE INDEX idx_triggers_type ON public.trade_triggers (trigger_type);
ALTER TABLE public.trade_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read triggers" ON public.trade_triggers FOR SELECT USING (true);

CREATE TABLE public.cohort_lead_analysis (
  id BIGSERIAL PRIMARY KEY,
  leader_address TEXT NOT NULL,
  follower_address TEXT NOT NULL,
  shared_markets INTEGER NOT NULL DEFAULT 0,
  avg_lead_minutes NUMERIC,
  median_lead_minutes NUMERIC,
  leader_first_pct NUMERIC,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (leader_address, follower_address)
);
CREATE INDEX idx_cohort_follower ON public.cohort_lead_analysis (follower_address);
ALTER TABLE public.cohort_lead_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read cohort" ON public.cohort_lead_analysis FOR SELECT USING (true);
