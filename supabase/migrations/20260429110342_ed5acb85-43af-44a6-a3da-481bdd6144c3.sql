
-- wallets we track
CREATE TABLE public.wallets (
  address TEXT PRIMARY KEY,
  label TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- market metadata (one row per conditionId)
CREATE TABLE public.markets (
  condition_id TEXT PRIMARY KEY,
  question TEXT,
  slug TEXT,
  event_slug TEXT,
  event_id TEXT,
  category TEXT,
  icon TEXT,
  end_date TIMESTAMPTZ,
  start_date TIMESTAMPTZ,
  closed BOOLEAN,
  resolved_outcome TEXT,
  volume NUMERIC,
  liquidity NUMERIC,
  outcomes JSONB,
  raw JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- every activity event
CREATE TABLE public.activities (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES public.wallets(address) ON DELETE CASCADE,
  transaction_hash TEXT NOT NULL,
  type TEXT NOT NULL,
  asset TEXT,
  condition_id TEXT,
  side TEXT,
  size NUMERIC,
  usdc_size NUMERIC,
  price NUMERIC,
  outcome TEXT,
  outcome_index INTEGER,
  timestamp BIGINT NOT NULL,
  ts TIMESTAMPTZ GENERATED ALWAYS AS (to_timestamp(timestamp)) STORED,
  title TEXT,
  slug TEXT,
  event_slug TEXT,
  raw JSONB NOT NULL,
  UNIQUE (wallet_address, transaction_hash, type, asset, side)
);
CREATE INDEX activities_wallet_ts_idx ON public.activities(wallet_address, timestamp DESC);
CREATE INDEX activities_condition_idx ON public.activities(condition_id);
CREATE INDEX activities_type_idx ON public.activities(type);

-- every trade (BUY/SELL fill)
CREATE TABLE public.trades (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES public.wallets(address) ON DELETE CASCADE,
  transaction_hash TEXT NOT NULL,
  asset TEXT NOT NULL,
  condition_id TEXT,
  side TEXT NOT NULL,
  size NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  timestamp BIGINT NOT NULL,
  ts TIMESTAMPTZ GENERATED ALWAYS AS (to_timestamp(timestamp)) STORED,
  outcome TEXT,
  outcome_index INTEGER,
  title TEXT,
  slug TEXT,
  event_slug TEXT,
  raw JSONB NOT NULL,
  UNIQUE (wallet_address, transaction_hash, asset, side, size, price)
);
CREATE INDEX trades_wallet_ts_idx ON public.trades(wallet_address, timestamp DESC);
CREATE INDEX trades_condition_idx ON public.trades(condition_id);

-- snapshots of positions (open + closed) at sync time
CREATE TABLE public.positions_snapshots (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES public.wallets(address) ON DELETE CASCADE,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL, -- 'open' | 'closed'
  asset TEXT,
  condition_id TEXT,
  size NUMERIC,
  avg_price NUMERIC,
  current_price NUMERIC,
  initial_value NUMERIC,
  current_value NUMERIC,
  cash_pnl NUMERIC,
  realized_pnl NUMERIC,
  percent_pnl NUMERIC,
  percent_realized_pnl NUMERIC,
  total_bought NUMERIC,
  outcome TEXT,
  outcome_index INTEGER,
  title TEXT,
  slug TEXT,
  event_slug TEXT,
  redeemable BOOLEAN,
  end_date TIMESTAMPTZ,
  raw JSONB NOT NULL
);
CREATE INDEX positions_wallet_snapshot_idx ON public.positions_snapshots(wallet_address, snapshot_at DESC);
CREATE INDEX positions_status_idx ON public.positions_snapshots(status);

-- RLS: data is public Polymarket data, anyone can read, only server writes
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
