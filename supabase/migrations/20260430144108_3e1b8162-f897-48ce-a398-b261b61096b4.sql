CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'scan-news-spikes',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--0c9ec147-5140-4f7e-9ed7-09f536684152.lovable.app/api/public/cron/scan-spikes',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);