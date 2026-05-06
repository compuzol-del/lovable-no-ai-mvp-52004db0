import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const POLYMARKET_DATA_API = "https://data-api.polymarket.com";

const MIN_CLOSED = 100;
const MIN_WIN_RATE = 0.58;
const MIN_AVG_ROI = 5;
const MIN_30D_TRADES = 10;
const MIN_MARKETS = 20;

type Position = {
  conditionId?: string; size?: number; initialValue?: number; currentValue?: number;
  cashPnl?: number; realizedPnl?: number; percentPnl?: number;
  redeemable?: boolean; endDate?: string;
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

function computeTier(metrics: { closed: number; winRate: number; avgRoi: number; last30d: number; markets: number; volumeUsd: number; totalPnlUsd?: number }): { tier: string; score: number } {
  const { closed, winRate, avgRoi, last30d, markets, volumeUsd, totalPnlUsd } = metrics;

  // Dollar-PnL is the primary truth. avgRoi (percentPnl mean) is misleading:
  // losses cap at -100% but wins are unbounded, so a profitable whale can still
  // have a negative avg %. Only exclude on avgRoi if dollar PnL is also bad.
  const isProfitable = (totalPnlUsd ?? 0) > 1_000;
  const isVeryProfitable = (totalPnlUsd ?? 0) > 25_000;
  const isActiveHighVolume = (last30d >= 10 && volumeUsd >= 50_000) || volumeUsd >= 500_000;

  // Hard guards (apply to everyone)
  if ((totalPnlUsd ?? 0) <= -50_000) return { tier: "EXCLUDED", score: 0 };
  if (closed >= 30 && winRate < 0.40 && !isProfitable) return { tier: "EXCLUDED", score: 0 };

  // Soft activity gate — must show SOMETHING (trades, volume, or profit)
  if (!isActiveHighVolume && !isProfitable && closed < 10) {
    return { tier: "EXCLUDED", score: 0 };
  }
  // Only exclude on negative avgRoi if NOT profitable in dollars
  if (closed >= 20 && avgRoi < -25 && !isProfitable) return { tier: "EXCLUDED", score: 0 };

  let score = 0;
  score += Math.min(20, (closed / 300) * 20);
  score += Math.max(0, Math.min(20, ((winRate - 0.45) / 0.25) * 20));
  // ROI score (can go negative — capped)
  score += Math.max(-10, Math.min(15, (avgRoi / 20) * 15));
  score += Math.min(10, (last30d / 30) * 10);
  score += Math.min(10, (markets / 50) * 10);
  // Dollar PnL bonus — the most important signal
  if (isVeryProfitable) score += 25;
  else if (isProfitable) score += 12;
  // Volume bonus
  score += Math.min(10, (volumeUsd / 1_000_000) * 10);

  let tier: string;
  if (closed >= MIN_CLOSED && winRate >= MIN_WIN_RATE && isVeryProfitable && last30d >= MIN_30D_TRADES && markets >= MIN_MARKETS && score >= 70) {
    tier = "S";
  } else if (score >= 55) tier = "A";
  else if (score >= 40) tier = "B";
  else if (score >= 20) tier = "C";
  else tier = "EXCLUDED";

  return { tier, score: Math.round(score * 10) / 10 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const onlyAddress = url.searchParams.get("address");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "10"), 25);
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const startedAt = Date.now();

  let q = supabaseAdmin.from("tracked_wallets").select("address,label").order("address");
  if (onlyAddress) q = q.eq("address", onlyAddress);
  else q = q.range(offset, offset + limit - 1);
  const { data: wallets, error } = await q;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  const results: any[] = [];

  for (const w of wallets || []) {
    try {
      const [positionsAll, trades] = await Promise.all([
        fetchAll<Position>(`${POLYMARKET_DATA_API}/positions?user=${w.address}`, 500, 5000),
        fetchAll<any>(`${POLYMARKET_DATA_API}/trades?user=${w.address}`, 500, 10000),
      ]);

      const now = Date.now();
      const closed = positionsAll.filter((p) =>
        p.redeemable === true ||
        (p.endDate && new Date(p.endDate).getTime() < now) ||
        (p.size != null && Number(p.size) === 0),
      );

      // Use combined pnl (realizedPnl + cashPnl) AND percentPnl to decide win/loss.
      // Polymarket sometimes records lost positions with realizedPnl=0 (expired without redemption)
      // — those must still count as losses. We treat any closed position with combined pnl < 0
      // OR percentPnl < 0 as a loss, and only > 0 as a win.
      const pnlOf = (p: Position) => Number(p.realizedPnl ?? 0) + Number(p.cashPnl ?? 0);
      const winning = closed.filter((p) => pnlOf(p) > 0 || Number(p.percentPnl ?? 0) > 0).length;
      const losing = closed.filter((p) => {
        const pnl = pnlOf(p);
        const pct = Number(p.percentPnl ?? 0);
        return pnl < 0 || pct < 0 || (pnl === 0 && p.size === 0 && Number(p.initialValue ?? 0) > 0);
      }).length;
      const totalDecided = winning + losing;
      const winRate = totalDecided > 0 ? winning / totalDecided : 0;

      const totalPnl = positionsAll.reduce((s, p) => s + Number(p.realizedPnl ?? 0) + Number(p.cashPnl ?? 0), 0);
      const totalVolume = positionsAll.reduce((s, p) => s + Number(p.initialValue ?? 0), 0);

      const roiSamples = closed
        .map((p) => Number(p.percentPnl))
        .filter((x) => Number.isFinite(x) && Math.abs(x) < 1000);
      const avgRoi = roiSamples.length > 0 ? roiSamples.reduce((a, b) => a + b, 0) / roiSamples.length : 0;

      const uniqueMarkets = new Set(positionsAll.map((p) => p.conditionId).filter(Boolean)).size;

      const cutoff30d = now - 30 * 24 * 3600 * 1000;
      const last30dTrades = trades.filter((t: any) => Number(t.timestamp ?? 0) * 1000 >= cutoff30d).length;
      const lastTradeTs = trades.reduce((m: number, t: any) => Math.max(m, Number(t.timestamp ?? 0)), 0);

      const { tier, score } = computeTier({
        closed: totalDecided, winRate, avgRoi, last30d: last30dTrades, markets: uniqueMarkets, volumeUsd: totalVolume, totalPnlUsd: totalPnl,
      });

      await supabaseAdmin.from("whale_performance").upsert({
        wallet_address: w.address, total_trades: trades.length, closed_positions: totalDecided,
        winning_positions: winning, losing_positions: losing,
        win_rate: Number(winRate.toFixed(4)), avg_roi_pct: Number(avgRoi.toFixed(2)),
        total_pnl_usd: Number(totalPnl.toFixed(2)), total_volume_usd: Number(totalVolume.toFixed(2)),
        unique_markets: uniqueMarkets, last_30d_trades: last30dTrades,
        last_trade_at: lastTradeTs > 0 ? new Date(lastTradeTs * 1000).toISOString() : null,
        quality_score: score, quality_tier: tier, computed_at: new Date().toISOString(),
      }, { onConflict: "wallet_address" });

      const shouldBeActive = tier !== "EXCLUDED";
      const reason = !shouldBeActive
        ? `auto: tier=EXCLUDED (closed=${totalDecided}, winrate=${(winRate * 100).toFixed(1)}%)`
        : null;

      await supabaseAdmin.from("tracked_wallets").update({
        quality_tier: tier, quality_score: score,
        is_active: shouldBeActive, auto_disabled_reason: reason,
      }).eq("address", w.address);

      results.push({
        address: w.address, label: w.label, tier, score, closed: totalDecided,
        winRate: Number((winRate * 100).toFixed(1)),
        avgRoi: Number(avgRoi.toFixed(1)), markets: uniqueMarkets,
        last30d: last30dTrades, disabled: !shouldBeActive,
      });
    } catch (e: any) {
      results.push({ address: w.address, error: e?.message || String(e) });
    }
  }

  return new Response(JSON.stringify({
    ok: true, duration_ms: Date.now() - startedAt, processed: results.length, results,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
