
-- wallets we track
CREATE TABLE public.wallets (
  address TEXT PRIMARY KEY,
  label TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.markets (
  condition_id TEXT PRIMARY KEY,
  question TEXT, slug TEXT, event_slug TEXT, event_id TEXT, category TEXT, icon TEXT,
  end_date TIMESTAMPTZ, start_date TIMESTAMPTZ, closed BOOLEAN, resolved_outcome TEXT,
  volume NUMERIC, liquidity NUMERIC, outcomes JSONB, raw JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.activities (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES public.wallets(address) ON DELETE CASCADE,
  transaction_hash TEXT NOT NULL, type TEXT NOT NULL, asset TEXT, condition_id TEXT,
  side TEXT, size NUMERIC, usdc_size NUMERIC, price NUMERIC, outcome TEXT, outcome_index INTEGER,
  timestamp BIGINT NOT NULL,
  ts TIMESTAMPTZ GENERATED ALWAYS AS (to_timestamp(timestamp)) STORED,
  title TEXT, slug TEXT, event_slug TEXT, raw JSONB NOT NULL,
  CONSTRAINT activities_wallet_activity_unique UNIQUE NULLS NOT DISTINCT (wallet_address, transaction_hash, type, asset, side, timestamp, condition_id, outcome_index, size, price)
);
CREATE INDEX activities_wallet_ts_idx ON public.activities(wallet_address, timestamp DESC);
CREATE INDEX activities_condition_idx ON public.activities(condition_id);
CREATE INDEX activities_type_idx ON public.activities(type);
CREATE INDEX activities_wallet_tx_idx ON public.activities(wallet_address, transaction_hash);

CREATE TABLE public.trades (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES public.wallets(address) ON DELETE CASCADE,
  transaction_hash TEXT NOT NULL, asset TEXT, condition_id TEXT, side TEXT, size NUMERIC, price NUMERIC,
  timestamp BIGINT NOT NULL,
  ts TIMESTAMPTZ GENERATED ALWAYS AS (to_timestamp(timestamp)) STORED,
  outcome TEXT, outcome_index INTEGER, title TEXT, slug TEXT, event_slug TEXT, raw JSONB NOT NULL,
  UNIQUE (wallet_address, transaction_hash, asset, side, size, price)
);
CREATE INDEX trades_wallet_ts_idx ON public.trades(wallet_address, timestamp DESC);
CREATE INDEX trades_condition_idx ON public.trades(condition_id);

CREATE TABLE public.positions_snapshots (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES public.wallets(address) ON DELETE CASCADE,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL, asset TEXT, condition_id TEXT, size NUMERIC, avg_price NUMERIC,
  current_price NUMERIC, initial_value NUMERIC, current_value NUMERIC, cash_pnl NUMERIC,
  realized_pnl NUMERIC, percent_pnl NUMERIC, percent_realized_pnl NUMERIC, total_bought NUMERIC,
  outcome TEXT, outcome_index INTEGER, title TEXT, slug TEXT, event_slug TEXT,
  redeemable BOOLEAN, end_date TIMESTAMPTZ, raw JSONB NOT NULL
);
CREATE INDEX positions_wallet_snapshot_idx ON public.positions_snapshots(wallet_address, snapshot_at DESC);
CREATE INDEX positions_status_idx ON public.positions_snapshots(status);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read wallets" ON public.wallets FOR SELECT USING (true);
CREATE POLICY "public read markets" ON public.markets FOR SELECT USING (true);
CREATE POLICY "public read activities" ON public.activities FOR SELECT USING (true);
CREATE POLICY "public read trades" ON public.trades FOR SELECT USING (true);
CREATE POLICY "public read positions" ON public.positions_snapshots FOR SELECT USING (true);

CREATE TABLE public.tracked_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL UNIQUE, label text,
  is_active boolean NOT NULL DEFAULT true,
  alert_threshold_usd numeric NOT NULL DEFAULT 0,
  last_scanned_ts bigint NOT NULL DEFAULT 0,
  last_scanned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  quality_tier TEXT NOT NULL DEFAULT 'UNRATED',
  quality_score NUMERIC NOT NULL DEFAULT 0,
  auto_disabled_reason TEXT
);
ALTER TABLE public.tracked_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read tracked_wallets" ON public.tracked_wallets FOR SELECT TO public USING (true);

CREATE TABLE public.trade_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL, wallet_label text, transaction_hash text NOT NULL,
  type text NOT NULL, side text, asset text, condition_id text, title text, outcome text,
  size numeric, price numeric, usdc_size numeric,
  ts timestamptz NOT NULL, timestamp_unix bigint NOT NULL, raw jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX trade_alerts_uniq ON public.trade_alerts (wallet_address, transaction_hash, asset, side);
CREATE INDEX trade_alerts_wallet_ts_idx ON public.trade_alerts (wallet_address, ts DESC);
CREATE INDEX trade_alerts_ts_idx ON public.trade_alerts (ts DESC);
ALTER TABLE public.trade_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read trade_alerts" ON public.trade_alerts FOR SELECT TO public USING (true);

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE public.wallet_equity_daily (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL, day DATE NOT NULL,
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
  trade_id BIGINT NOT NULL, wallet_address TEXT NOT NULL, condition_id TEXT,
  ts TIMESTAMPTZ NOT NULL, trigger_type TEXT NOT NULL,
  price_at_trade NUMERIC, price_1h_before NUMERIC, price_6h_before NUMERIC,
  price_24h_before NUMERIC, price_1h_after NUMERIC,
  pct_change_1h_before NUMERIC, pct_change_1h_after NUMERIC,
  hours_to_resolution NUMERIC, is_winner BOOLEAN,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trade_id)
);
CREATE INDEX idx_triggers_wallet ON public.trade_triggers (wallet_address);
CREATE INDEX idx_triggers_type ON public.trade_triggers (trigger_type);
ALTER TABLE public.trade_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read triggers" ON public.trade_triggers FOR SELECT USING (true);

CREATE TABLE public.cohort_lead_analysis (
  id BIGSERIAL PRIMARY KEY,
  leader_address TEXT NOT NULL, follower_address TEXT NOT NULL,
  shared_markets INTEGER NOT NULL DEFAULT 0,
  avg_lead_minutes NUMERIC, median_lead_minutes NUMERIC, leader_first_pct NUMERIC,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (leader_address, follower_address)
);
CREATE INDEX idx_cohort_follower ON public.cohort_lead_analysis (follower_address);
ALTER TABLE public.cohort_lead_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read cohort" ON public.cohort_lead_analysis FOR SELECT USING (true);

CREATE TABLE public.news_signals (
  id BIGSERIAL PRIMARY KEY,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hour_bucket TIMESTAMPTZ NOT NULL,
  condition_id TEXT NOT NULL, asset TEXT NOT NULL, market_question TEXT, outcome TEXT, category TEXT,
  price_now NUMERIC NOT NULL, price_1h_ago NUMERIC NOT NULL, pct_change NUMERIC NOT NULL,
  recommended_buy_price NUMERIC, recommended_position_usd NUMERIC NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'active',
  resolved_at TIMESTAMPTZ, exit_price NUMERIC, realized_pnl NUMERIC, raw JSONB,
  price_30m numeric, price_2h numeric, price_4h numeric,
  pnl_30m numeric, pnl_1h numeric, pnl_2h numeric, pnl_4h numeric,
  horizons_done jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_news_signals_detected ON public.news_signals(detected_at DESC);
CREATE INDEX idx_news_signals_status ON public.news_signals(status);
CREATE INDEX idx_news_signals_status_detected ON public.news_signals (status, detected_at);
CREATE UNIQUE INDEX idx_news_signals_unique ON public.news_signals(asset, hour_bucket);
ALTER TABLE public.news_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read news_signals" ON public.news_signals FOR SELECT USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.news_signals;

CREATE OR REPLACE FUNCTION public.claim_signals_for_resolution(
  _max_age_seconds integer DEFAULT 3600, _limit integer DEFAULT 100, _stuck_seconds integer DEFAULT 600
) RETURNS TABLE (id bigint, asset text, price_now numeric, recommended_position_usd numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.news_signals SET status = 'active'
   WHERE status = 'resolving' AND detected_at < now() - make_interval(secs => _stuck_seconds);
  RETURN QUERY
  WITH due AS (
    SELECT s.id FROM public.news_signals s
     WHERE s.status = 'active' AND s.detected_at < now() - make_interval(secs => _max_age_seconds)
     ORDER BY s.detected_at ASC LIMIT _limit FOR UPDATE SKIP LOCKED
  )
  UPDATE public.news_signals s SET status = 'resolving' FROM due WHERE s.id = due.id
  RETURNING s.id, s.asset, s.price_now, s.recommended_position_usd;
END; $$;
REVOKE EXECUTE ON FUNCTION public.claim_signals_for_resolution(integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_signals_for_resolution(integer, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_signals_for_horizon(
  _horizon_seconds integer, _horizon_key text, _limit integer DEFAULT 100
) RETURNS TABLE(id bigint, asset text, price_now numeric, recommended_position_usd numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT s.id FROM public.news_signals s
    WHERE s.detected_at < now() - make_interval(secs => _horizon_seconds)
      AND NOT (s.horizons_done ? _horizon_key) AND s.status IN ('active','resolved')
    ORDER BY s.detected_at ASC LIMIT _limit FOR UPDATE SKIP LOCKED
  )
  UPDATE public.news_signals s
     SET horizons_done = s.horizons_done || jsonb_build_object(_horizon_key, 'claimed')
    FROM due WHERE s.id = due.id
  RETURNING s.id, s.asset, s.price_now, s.recommended_position_usd;
END; $$;
REVOKE EXECUTE ON FUNCTION public.claim_signals_for_horizon(integer, text, integer) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.claim_signals_for_horizon(integer, text, integer) TO service_role;

CREATE TABLE public.whale_signals (
  id BIGSERIAL PRIMARY KEY,
  condition_id TEXT NOT NULL, asset TEXT, outcome TEXT, title TEXT,
  unique_wallets INT NOT NULL, total_buys INT NOT NULL, total_usd NUMERIC NOT NULL,
  avg_price NUMERIC NOT NULL, min_price NUMERIC, max_price NUMERIC, current_price NUMERIC,
  price_drift_pct NUMERIC,
  first_buy_at TIMESTAMPTZ NOT NULL, last_buy_at TIMESTAMPTZ NOT NULL,
  minutes_since_last_buy INT NOT NULL,
  wallet_labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  wallet_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
  score NUMERIC NOT NULL, action TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  price_std numeric, burst_minutes numeric, score_breakdown jsonb DEFAULT '{}'::jsonb,
  UNIQUE(condition_id, outcome, computed_at)
);
CREATE INDEX idx_whale_signals_action ON public.whale_signals(action, computed_at DESC);
CREATE INDEX idx_whale_signals_score ON public.whale_signals(score DESC, computed_at DESC);
CREATE INDEX idx_whale_signals_condition ON public.whale_signals(condition_id, computed_at DESC);
ALTER TABLE public.whale_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read whale_signals" ON public.whale_signals FOR SELECT USING (true);

CREATE TABLE public.paper_positions (
  id BIGSERIAL PRIMARY KEY,
  signal_id BIGINT, condition_id TEXT NOT NULL, asset TEXT, outcome TEXT, title TEXT,
  score NUMERIC NOT NULL, score_breakdown JSONB DEFAULT '{}'::jsonb,
  unique_wallets INTEGER, total_usd NUMERIC,
  wallet_labels JSONB DEFAULT '[]'::jsonb, wallet_addresses JSONB DEFAULT '[]'::jsonb,
  reason TEXT NOT NULL, size_usd NUMERIC NOT NULL, entry_price NUMERIC NOT NULL, shares NUMERIC NOT NULL,
  tp_price NUMERIC NOT NULL, sl_price NUMERIC NOT NULL, time_stop_at TIMESTAMPTZ NOT NULL,
  exit_strategy TEXT NOT NULL,
  current_price NUMERIC, last_price_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'OPEN',
  exit_price NUMERIC, exit_reason TEXT, pnl_usd NUMERIC, pnl_pct NUMERIC,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(), closed_at TIMESTAMPTZ,
  breakeven_moved boolean NOT NULL DEFAULT false, peak_price numeric
);
CREATE UNIQUE INDEX paper_positions_one_open_per_condition ON public.paper_positions (condition_id) WHERE status = 'OPEN';
CREATE INDEX paper_positions_status_idx ON public.paper_positions (status, opened_at DESC);
ALTER TABLE public.paper_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read paper_positions" ON public.paper_positions FOR SELECT USING (true);

CREATE TABLE public.paper_bot_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT false,
  min_score NUMERIC NOT NULL DEFAULT 75,
  min_drift_pct NUMERIC NOT NULL DEFAULT -3,
  tp_pct NUMERIC NOT NULL DEFAULT 25,
  sl_pct NUMERIC NOT NULL DEFAULT -20,
  time_stop_hours NUMERIC NOT NULL DEFAULT 24,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  breakeven_trigger_pct numeric NOT NULL DEFAULT 15,
  whale_reversal_exit boolean NOT NULL DEFAULT true,
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO public.paper_bot_config (id) VALUES (1);
ALTER TABLE public.paper_bot_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read paper_bot_config" ON public.paper_bot_config FOR SELECT USING (true);

CREATE TABLE public.whale_performance (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  total_trades INTEGER NOT NULL DEFAULT 0,
  closed_positions INTEGER NOT NULL DEFAULT 0,
  winning_positions INTEGER NOT NULL DEFAULT 0,
  losing_positions INTEGER NOT NULL DEFAULT 0,
  win_rate NUMERIC, avg_roi_pct NUMERIC,
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
