
CREATE TABLE public.real_bot_config (
  id integer PRIMARY KEY DEFAULT 1,
  enabled boolean NOT NULL DEFAULT false,
  dry_run boolean NOT NULL DEFAULT true,
  daily_loss_limit_usd numeric NOT NULL DEFAULT 50,
  daily_halt_until timestamptz,
  min_score numeric NOT NULL DEFAULT 80,
  min_drift_pct numeric NOT NULL DEFAULT -3,
  tp_pct numeric NOT NULL DEFAULT 25,
  sl_pct numeric NOT NULL DEFAULT -20,
  time_stop_hours numeric NOT NULL DEFAULT 24,
  breakeven_trigger_pct numeric NOT NULL DEFAULT 15,
  whale_reversal_exit boolean NOT NULL DEFAULT true,
  min_market_volume_usd numeric NOT NULL DEFAULT 20000,
  min_market_liquidity_usd numeric NOT NULL DEFAULT 5000,
  max_open_per_event integer NOT NULL DEFAULT 2,
  max_open_total integer NOT NULL DEFAULT 8,
  dynamic_exits boolean NOT NULL DEFAULT true,
  dynamic_time_stop boolean NOT NULL DEFAULT true,
  reversal_buy_bonus boolean NOT NULL DEFAULT true,
  starting_budget_usd numeric NOT NULL DEFAULT 1000,
  max_slippage_pct numeric NOT NULL DEFAULT 1.5,
  min_entry_price numeric NOT NULL DEFAULT 0.05,
  max_entry_price numeric NOT NULL DEFAULT 0.85,
  fee_pct numeric NOT NULL DEFAULT 2,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT real_bot_config_singleton CHECK (id = 1)
);
ALTER TABLE public.real_bot_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read real_bot_config" ON public.real_bot_config FOR SELECT USING (true);
INSERT INTO public.real_bot_config (id) VALUES (1);

CREATE TABLE public.real_positions (
  id bigserial PRIMARY KEY,
  signal_id bigint,
  condition_id text NOT NULL,
  asset text,
  outcome text,
  title text,
  score numeric NOT NULL,
  score_breakdown jsonb DEFAULT '{}'::jsonb,
  unique_wallets integer,
  total_usd numeric,
  wallet_labels jsonb DEFAULT '[]'::jsonb,
  wallet_addresses jsonb DEFAULT '[]'::jsonb,
  reason text NOT NULL,
  size_usd numeric NOT NULL,
  entry_price numeric NOT NULL,
  shares numeric NOT NULL,
  tp_price numeric NOT NULL,
  sl_price numeric NOT NULL,
  time_stop_at timestamptz NOT NULL,
  exit_strategy text NOT NULL,
  current_price numeric,
  last_price_at timestamptz,
  status text NOT NULL DEFAULT 'OPEN',
  exit_price numeric,
  exit_reason text,
  pnl_usd numeric,
  pnl_pct numeric,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  breakeven_moved boolean NOT NULL DEFAULT false,
  peak_price numeric,
  event_id text,
  market_volume_usd numeric,
  market_liquidity_usd numeric,
  price_tier text,
  time_to_resolution_hours numeric,
  order_id text,
  dry_run boolean NOT NULL DEFAULT true
);
ALTER TABLE public.real_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read real_positions" ON public.real_positions FOR SELECT USING (true);
CREATE INDEX idx_real_positions_status ON public.real_positions(status);
CREATE INDEX idx_real_positions_condition ON public.real_positions(condition_id);
