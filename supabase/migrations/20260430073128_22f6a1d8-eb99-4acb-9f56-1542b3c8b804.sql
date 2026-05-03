
-- Tracked wallets for live monitoring
CREATE TABLE public.tracked_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL UNIQUE,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  alert_threshold_usd numeric NOT NULL DEFAULT 0,
  last_scanned_ts bigint NOT NULL DEFAULT 0,
  last_scanned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tracked_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read tracked_wallets"
ON public.tracked_wallets FOR SELECT TO public USING (true);

-- Trade alerts (each new trade detected by the scanner)
CREATE TABLE public.trade_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  wallet_label text,
  transaction_hash text NOT NULL,
  type text NOT NULL,
  side text,
  asset text,
  condition_id text,
  title text,
  outcome text,
  size numeric,
  price numeric,
  usdc_size numeric,
  ts timestamptz NOT NULL,
  timestamp_unix bigint NOT NULL,
  raw jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX trade_alerts_uniq
  ON public.trade_alerts (wallet_address, transaction_hash, asset, side);

CREATE INDEX trade_alerts_wallet_ts_idx
  ON public.trade_alerts (wallet_address, ts DESC);

CREATE INDEX trade_alerts_ts_idx
  ON public.trade_alerts (ts DESC);

ALTER TABLE public.trade_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read trade_alerts"
ON public.trade_alerts FOR SELECT TO public USING (true);

-- Seed: planktonXD + cohort
INSERT INTO public.tracked_wallets (address, label) VALUES
  ('0x9d84ce0306f8531c4d77e0e13ecda3b6c6e8e1c1', 'planktonXD (target)')
ON CONFLICT (address) DO NOTHING;
