-- Ensure extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove old jobs (ignore errors if not present)
DO $$
DECLARE j text;
BEGIN
  FOR j IN SELECT jobname FROM cron.job WHERE jobname IN (
    'scan-news-spikes','resolve-signals-5min','snapshot-horizons','scan-wallets-2min'
  )
  LOOP
    PERFORM cron.unschedule(j);
  END LOOP;
END $$;

-- Schedule new wallet scan every 2 minutes
SELECT cron.schedule(
  'scan-wallets-2min',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--0c9ec147-5140-4f7e-9ed7-09f536684152.lovable.app/api/public/hooks/scan-wallets',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);