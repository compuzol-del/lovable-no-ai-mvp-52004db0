import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const POLYMARKET_DATA_API = "https://data-api.polymarket.com";

// Quality thresholds
const MIN_CLOSED = 100;
const MIN_WIN_RATE = 0.58;
const MIN_AVG_ROI = 5;
const MIN_30D_TRADES = 10;
const MIN_MARKETS = 20;

type Position = {
  conditionId?: string;
  size?: number;
  initialValue?: number;
  currentValue?: number;
  cashPnl?: number;
  realizedPnl?: number;
  percentPnl?: number;
  redeemable?: boolean;
  endDate?: string;
};

async function fetchAll<T>(url: string, limit = 500, max = 5000): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < max; offset += limit) {
    const r = await fetch(`${url}${url.includes("?") ? "&" : "?"}limit=${limit}&offset=${offset}`, {
      headers: { accept: "application/json" },
    });
    if (!r.ok) break;
    const j = (await r.json()) as T[];
    if (!Array.isArray(j) || j.length === 0) break;
    out.push(...j);
    if (j.length < limit) break;
  }
  return out;
}

function computeTier(metrics: {
  closed: number;
  winRate: number;
  avgRoi: number;
  last30d: number;
  markets: number;
}): { tier: string; score: number } {
  const { closed, winRate, avgRoi, last30d, markets } = metrics;

  // Hard exclusion — too few trades to trust
  if (closed < 50) return { tier: "EXCLUDED", score: 0 };
  if (winRate < 0.5) return { tier: "EXCLUDED", score: 0 };

  // Score: 0-100
  let score = 0;
  // Sample size (0-25)
  score += Math.min(25, (closed / 500) * 25);
  // Win rate (0-30) — 50% = 0, 70% = 30
  score += Math.max(0, Math.min(30, ((winRate - 0.5) / 0.2) * 30));
  // ROI (0-25) — 0% = 0, 20% = 25
  score += Math.max(0, Math.min(25, (avgRoi / 20) * 25));
  // Recency (0-10)
  score += Math.min(10, (last30d / 30) * 10);
  // Diversification (0-10)
  score += Math.min(10, (markets / 50) * 10);

  let tier: string;
  if (
    closed >= MIN_CLOSED &&
    winRate >= MIN_WIN_RATE &&
    avgRoi >= MIN_AVG_ROI &&
    last30d >= MIN_30D_TRADES &&
    markets >= MIN_MARKETS &&
    score >= 75
  ) {
    tier = "S";
  } else if (score >= 60) tier = "A";
  else if (score >= 45) tier = "B";
  else tier = "C";

  return { tier, score: Math.round(score * 10) / 10 };
}

export const Route = createFileRoute("/api/public/hooks/refresh-whale-performance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const onlyAddress = url.searchParams.get("address");
        const startedAt = Date.now();

        let q = supabaseAdmin.from("tracked_wallets").select("address,label");
        if (onlyAddress) q = q.eq("address", onlyAddress);
        const { data: wallets, error } = await q;
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const results: any[] = [];

        for (const w of wallets || []) {
          try {
            // Fetch positions (open + closed) and trades
            const [positionsAll, trades] = await Promise.all([
              fetchAll<Position>(`${POLYMARKET_DATA_API}/positions?user=${w.address}`, 500, 5000),
              fetchAll<any>(`${POLYMARKET_DATA_API}/trades?user=${w.address}`, 500, 10000),
            ]);

            // Closed positions = redeemable OR endDate < now
            const now = Date.now();
            const closed = positionsAll.filter(
              (p) =>
                p.redeemable === true ||
                (p.endDate && new Date(p.endDate).getTime() < now) ||
                (p.size != null && Number(p.size) === 0),
            );

            const winning = closed.filter((p) => Number(p.realizedPnl ?? p.cashPnl ?? 0) > 0).length;
            const losing = closed.filter((p) => Number(p.realizedPnl ?? p.cashPnl ?? 0) < 0).length;
            const totalDecided = winning + losing;
            const winRate = totalDecided > 0 ? winning / totalDecided : 0;

            const totalPnl = positionsAll.reduce(
              (s, p) => s + Number(p.realizedPnl ?? 0) + Number(p.cashPnl ?? 0),
              0,
            );
            const totalVolume = positionsAll.reduce((s, p) => s + Number(p.initialValue ?? 0), 0);

            const roiSamples = closed
              .map((p) => Number(p.percentPnl))
              .filter((x) => Number.isFinite(x) && Math.abs(x) < 1000);
            const avgRoi =
              roiSamples.length > 0 ? roiSamples.reduce((a, b) => a + b, 0) / roiSamples.length : 0;

            const uniqueMarkets = new Set(
              positionsAll.map((p) => p.conditionId).filter(Boolean),
            ).size;

            const cutoff30d = now - 30 * 24 * 3600 * 1000;
            const last30dTrades = trades.filter(
              (t: any) => Number(t.timestamp ?? 0) * 1000 >= cutoff30d,
            ).length;
            const lastTradeTs = trades.reduce(
              (m: number, t: any) => Math.max(m, Number(t.timestamp ?? 0)),
              0,
            );

            const { tier, score } = computeTier({
              closed: totalDecided,
              winRate,
              avgRoi,
              last30d: last30dTrades,
              markets: uniqueMarkets,
            });

            await supabaseAdmin.from("whale_performance").upsert(
              {
                wallet_address: w.address,
                total_trades: trades.length,
                closed_positions: totalDecided,
                winning_positions: winning,
                losing_positions: losing,
                win_rate: Number(winRate.toFixed(4)),
                avg_roi_pct: Number(avgRoi.toFixed(2)),
                total_pnl_usd: Number(totalPnl.toFixed(2)),
                total_volume_usd: Number(totalVolume.toFixed(2)),
                unique_markets: uniqueMarkets,
                last_30d_trades: last30dTrades,
                last_trade_at: lastTradeTs > 0 ? new Date(lastTradeTs * 1000).toISOString() : null,
                quality_score: score,
                quality_tier: tier,
                computed_at: new Date().toISOString(),
              },
              { onConflict: "wallet_address" },
            );

            // Auto-disable EXCLUDED
            const shouldBeActive = tier !== "EXCLUDED";
            const reason = !shouldBeActive
              ? `auto: tier=EXCLUDED (closed=${totalDecided}, winrate=${(winRate * 100).toFixed(1)}%)`
              : null;

            await supabaseAdmin
              .from("tracked_wallets")
              .update({
                quality_tier: tier,
                quality_score: score,
                is_active: shouldBeActive,
                auto_disabled_reason: reason,
              })
              .eq("address", w.address);

            results.push({
              address: w.address,
              label: w.label,
              tier,
              score,
              closed: totalDecided,
              winRate: Number((winRate * 100).toFixed(1)),
              avgRoi: Number(avgRoi.toFixed(1)),
              markets: uniqueMarkets,
              last30d: last30dTrades,
              disabled: !shouldBeActive,
            });
          } catch (e: any) {
            results.push({ address: w.address, error: e?.message || String(e) });
          }
        }

        return Response.json({
          ok: true,
          duration_ms: Date.now() - startedAt,
          processed: results.length,
          results,
        });
      },
    },
  },
});
