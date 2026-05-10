-- 1. New columns on real_bot_config
ALTER TABLE public.real_bot_config
  ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'paper',
  ADD COLUMN IF NOT EXISTS last_geo_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_geo_country text,
  ADD COLUMN IF NOT EXISTS last_geo_blocked boolean,
  ADD COLUMN IF NOT EXISTS worker_last_seen_at timestamptz;

ALTER TABLE public.real_bot_config
  DROP CONSTRAINT IF EXISTS real_bot_config_execution_mode_check;
ALTER TABLE public.real_bot_config
  ADD CONSTRAINT real_bot_config_execution_mode_check
  CHECK (execution_mode IN ('paper','live_compliant_only'));

-- 2. execution_intents table
CREATE TABLE IF NOT EXISTS public.execution_intents (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  position_id bigint REFERENCES public.real_positions(id) ON DELETE SET NULL,
  condition_id text NOT NULL,
  token_id text NOT NULL,
  side text NOT NULL DEFAULT 'BUY',
  price numeric NOT NULL,
  shares numeric NOT NULL,
  size_usd numeric,
  status text NOT NULL DEFAULT 'PENDING',
  claimed_at timestamptz,
  claimed_by text,
  executed_at timestamptz,
  order_id text,
  error text,
  geo_country text,
  geo_ip text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
);

CREATE INDEX IF NOT EXISTS idx_execution_intents_status_created
  ON public.execution_intents(status, created_at);
CREATE INDEX IF NOT EXISTS idx_execution_intents_position
  ON public.execution_intents(position_id);

ALTER TABLE public.execution_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read execution_intents" ON public.execution_intents;
CREATE POLICY "public read execution_intents"
  ON public.execution_intents FOR SELECT
  USING (true);

-- 3. Atomic claim function for the worker
CREATE OR REPLACE FUNCTION public.claim_next_intent(_worker_id text)
RETURNS SETOF public.execution_intents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Expire stale pendings/claims first
  UPDATE public.execution_intents
     SET status = 'EXPIRED', updated_at = now()
   WHERE status IN ('PENDING','CLAIMED')
     AND expires_at < now();

  RETURN QUERY
  WITH next_intent AS (
    SELECT id
      FROM public.execution_intents
     WHERE status = 'PENDING'
     ORDER BY created_at ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.execution_intents ei
     SET status = 'CLAIMED',
         claimed_at = now(),
         claimed_by = _worker_id,
         updated_at = now()
    FROM next_intent
   WHERE ei.id = next_intent.id
  RETURNING ei.*;
END;
$$;

-- 4. Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_execution_intents_updated_at ON public.execution_intents;
CREATE TRIGGER trg_execution_intents_updated_at
  BEFORE UPDATE ON public.execution_intents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();