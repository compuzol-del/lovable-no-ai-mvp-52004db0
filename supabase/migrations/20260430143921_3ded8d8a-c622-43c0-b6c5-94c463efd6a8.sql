CREATE TABLE public.news_signals (
  id BIGSERIAL PRIMARY KEY,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hour_bucket TIMESTAMPTZ NOT NULL,
  condition_id TEXT NOT NULL,
  asset TEXT NOT NULL,
  market_question TEXT,
  outcome TEXT,
  category TEXT,
  price_now NUMERIC NOT NULL,
  price_1h_ago NUMERIC NOT NULL,
  pct_change NUMERIC NOT NULL,
  recommended_buy_price NUMERIC,
  recommended_position_usd NUMERIC NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'active',
  resolved_at TIMESTAMPTZ,
  exit_price NUMERIC,
  realized_pnl NUMERIC,
  raw JSONB
);
CREATE INDEX idx_news_signals_detected ON public.news_signals(detected_at DESC);
CREATE INDEX idx_news_signals_status ON public.news_signals(status);
CREATE UNIQUE INDEX idx_news_signals_unique ON public.news_signals(asset, hour_bucket);
ALTER TABLE public.news_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read news_signals" ON public.news_signals FOR SELECT USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.news_signals;