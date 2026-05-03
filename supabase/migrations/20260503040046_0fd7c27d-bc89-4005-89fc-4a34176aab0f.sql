CREATE TABLE public.paper_positions (
  id BIGSERIAL PRIMARY KEY,
  signal_id BIGINT,
  condition_id TEXT NOT NULL,
  asset TEXT,
  outcome TEXT,
  title TEXT,
  score NUMERIC NOT NULL,
  score_breakdown JSONB DEFAULT '{}'::jsonb,
  unique_wallets INTEGER,
  total_usd NUMERIC,
  wallet_labels JSONB DEFAULT '[]'::jsonb,
  wallet_addresses JSONB DEFAULT '[]'::jsonb,
  reason TEXT NOT NULL,
  size_usd NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,
  shares NUMERIC NOT NULL,
  tp_price NUMERIC NOT NULL,
  sl_price NUMERIC NOT NULL,
  time_stop_at TIMESTAMPTZ NOT NULL,
  exit_strategy TEXT NOT NULL,
  current_price NUMERIC,
  last_price_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'OPEN',
  exit_price NUMERIC,
  exit_reason TEXT,
  pnl_usd NUMERIC,
  pnl_pct NUMERIC,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX paper_positions_one_open_per_condition
  ON public.paper_positions (condition_id) WHERE status = 'OPEN';

CREATE INDEX paper_positions_status_idx ON public.paper_positions (status, opened_at DESC);

ALTER TABLE public.paper_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read paper_positions" ON public.paper_positions FOR SELECT USING (true);

CREATE TABLE public.paper_bot_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT true,
  min_score NUMERIC NOT NULL DEFAULT 75,
  min_drift_pct NUMERIC NOT NULL DEFAULT -3,
  tp_pct NUMERIC NOT NULL DEFAULT 25,
  sl_pct NUMERIC NOT NULL DEFAULT -20,
  time_stop_hours NUMERIC NOT NULL DEFAULT 24,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO public.paper_bot_config (id) VALUES (1);

ALTER TABLE public.paper_bot_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read paper_bot_config" ON public.paper_bot_config FOR SELECT USING (true);