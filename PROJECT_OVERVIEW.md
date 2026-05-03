# Polymarket Whale Tracker — Project Overview

## What this project does

An automated **paper-trading bot** that follows Polymarket "whales" (large/successful wallets), detects when multiple whales buy into the same market at the same time, scores the signal, and opens simulated positions with TP / SL / trailing-stop / whale-reversal exits.

Goal: identify and ride high-conviction whale moves on prediction markets, while automatically filtering out low-quality whales.

---

## Stack

- **Frontend**: TanStack Start (React 19 + Vite 7), Tailwind v4, shadcn/ui
- **Backend**: Lovable Cloud (Supabase under the hood) — RLS-public read, server-only writes via service role
- **Server logic**: TanStack server routes under `src/routes/api/public/hooks/*`
- **Scheduling**: Supabase `pg_cron` calling those hooks
- **Data source**: Polymarket Data API (`https://data-api.polymarket.com`) and CLOB (`https://clob.polymarket.com`)

---

## Database schema (key tables)

| Table | Purpose |
|---|---|
| `tracked_wallets` | Whales we follow. Has `quality_tier` (S/A/B/C/EXCLUDED/UNRATED), `quality_score`, `is_active`, `auto_disabled_reason`. EXCLUDED whales are auto-disabled. |
| `trade_alerts` | Raw activity stream from tracked wallets (BUY/SELL events). Polled by `scan-wallets` hook. |
| `whale_signals` | Computed signals: when ≥N whales buy the same `condition_id` within a burst window. Has `score`, `score_breakdown`, `action` (STRONG_BUY/etc). |
| `paper_positions` | Simulated trades opened by the bot. Tracks entry, TP, SL, trailing-stop state (`breakeven_moved`, `peak_price`), exit reason, PnL. |
| `paper_bot_config` | Singleton (id=1) with bot toggles: `enabled`, `min_score`, `min_drift_pct`, `tp_pct`, `sl_pct`, `time_stop_hours`, `breakeven_trigger_pct`, `whale_reversal_exit`. |
| `whale_performance` | Per-whale historical metrics: closed positions, win-rate, avg ROI, PnL, unique markets, last-30d activity, computed quality score & tier. |
| `markets`, `trades`, `activities`, `positions_snapshots` | Polymarket reference & history data. |
| `news_signals` | (separate older feature) news-driven price-move signals. |

All tables use **public read RLS**; writes happen only via server routes using the service-role admin client.

---

## Server routes (cron-driven)

Located at `src/routes/api/public/hooks/`:

| Route | Schedule | Purpose |
|---|---|---|
| `scan-wallets` | every few min | Pull recent activity from each tracked wallet via Polymarket API → insert into `trade_alerts`. |
| `compute-signals` | every few min | Aggregate recent BUY alerts by `condition_id`, score them (whale count, USD volume, burst window, named-whale bonus, price drift), insert STRONG_BUY signals into `whale_signals`. |
| `paper-execute` | every few min | (a) Refresh open `paper_positions` with current price, apply trailing-stop-to-breakeven, check TP/SL/time-stop/whale-reversal exits. (b) Open new positions from fresh STRONG_BUY signals if not already in market. Position size scales with score (100 / 175 / 300 USD). |
| `refresh-whale-performance` | daily 04:00 | For every `tracked_wallets` row, fetch all positions+trades from Polymarket API, compute win-rate/ROI/markets/30d-activity, assign quality tier (S/A/B/C/EXCLUDED), and **auto-disable EXCLUDED whales**. |

---

## Scoring & strategy summary

**Signal score (0–100)** combines:
- # unique whales buying the same outcome
- total USD spent
- time burst (faster = stronger)
- whale "label" bonus (named whales weigh more)
- price drift filter (don't chase pumps; require `min_drift_pct`)

**Entry rule**: `action == STRONG_BUY` AND `score ≥ min_score` (default 75) AND `drift ≥ -3%` AND no existing open position on the same `condition_id` AND price between 0.01 and 0.99.

**Exits** (any triggers close):
1. `TAKE_PROFIT` — price ≥ TP (default +25%)
2. `STOP_LOSS` — price ≤ SL (default −20%)
3. `BREAKEVEN_STOP` — once price reaches +15%, SL moves to entry; close if it falls back to entry
4. `TIME_STOP` — open > 24h
5. `WHALE_REVERSAL` — ≥2 of the entry whales sell the same market after our entry

**Whale-quality filter** (the key feature that prevents bad whales):
- Hard EXCLUDED if <50 closed positions OR win-rate <50% → auto-disabled, no signals.
- Score 0–100 from sample size + win-rate + ROI + recency + market diversification.
- Tiers: **S** ≥75 (with elite thresholds), **A** ≥60, **B** ≥45, **C** <45.
- Dashboard at `/wallets` shows ONLY S/A/B active whales.

---

## Frontend pages

- `/` — landing
- `/paper` — paper-bot dashboard (open positions, closed positions, P&L summary, config display, tabs)
- `/wallets` — quality-filtered whale list with manual "compute quality" button
- `/signals` — recent whale signals
- `/tracker` — older news-signal tracker

---

## Secrets in use

- `LOVABLE_API_KEY` (managed)
- `ALCHEMY_API_KEY`
- `DUNE_API_KEY`
- Supabase ones (auto-provisioned by Lovable Cloud)

---

## Cron jobs (pg_cron) — must be re-created in new project

```sql
-- 1. Scan wallets (frequency depends on what was set)
SELECT cron.schedule('scan-wallets', '*/3 * * * *', $$ SELECT net.http_post(url:='<NEW_URL>/api/public/hooks/scan-wallets', headers:='{"Content-Type":"application/json"}'::jsonb, body:='{}'::jsonb); $$);

-- 2. Compute signals
SELECT cron.schedule('compute-signals', '*/3 * * * *', $$ SELECT net.http_post(url:='<NEW_URL>/api/public/hooks/compute-signals', headers:='{"Content-Type":"application/json"}'::jsonb, body:='{}'::jsonb); $$);

-- 3. Paper execute
SELECT cron.schedule('paper-execute', '*/2 * * * *', $$ SELECT net.http_post(url:='<NEW_URL>/api/public/hooks/paper-execute', headers:='{"Content-Type":"application/json"}'::jsonb, body:='{}'::jsonb); $$);

-- 4. Refresh whale performance (daily)
SELECT cron.schedule('refresh-whale-performance-daily', '0 4 * * *', $$ SELECT net.http_post(url:='<NEW_URL>/api/public/hooks/refresh-whale-performance', headers:='{"Content-Type":"application/json"}'::jsonb, body:='{}'::jsonb); $$);
```

Replace `<NEW_URL>` with `https://project--<NEW_PROJECT_ID>.lovable.app`.

---

## Recent improvements

1. ✅ Trailing stop to breakeven after +15%
2. ✅ Whale-reversal exit (≥2 entry whales sell → exit)
3. ✅ Whale quality scoring system (S/A/B/C/EXCLUDED) with auto-disable
4. ✅ `/wallets` filtered to show only passing whales
5. ✅ Position sizing scales with signal score

## Pending / next ideas

- Weight `whale_signals` score by per-whale `quality_score` (so an S-tier whale counts more than a B)
- Liquidity filter (`≥$50K market volume`) before entry
- Time-to-resolution filter
- ROI-weighted whale signal aggregation (soft version: not exclude, just resize)

---

## Migration checklist (current → new account)

1. Push to GitHub from old project
2. Disable Lovable Cloud on old project
3. Create new project in new account → import from GitHub
4. Enable Lovable Cloud on new project (fresh DB, all `supabase/migrations/*.sql` auto-run)
5. Add secrets: `ALCHEMY_API_KEY`, `DUNE_API_KEY`
6. Run `seed_wallets.sql` to restore whale list + bot config
7. Re-create the 4 cron jobs above with the new project URL
8. Hit `/wallets` → "חישוב איכות" to recompute quality scores
9. Verify `/paper` dashboard loads
