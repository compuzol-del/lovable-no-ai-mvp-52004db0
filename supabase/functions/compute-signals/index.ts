import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const POLYMARKET_CLOB = "https://clob.polymarket.com";

type BuyRow = {
  wallet_address: string;
  wallet_label: string | null;
  condition_id: string;
  asset: string | null;
  outcome: string | null;
  title: string | null;
  price: number;
  usdc_size: number;
  ts: string;
};

type Group = {
  condition_id: string;
  asset: string | null;
  outcome: string | null;
  title: string | null;
  rows: BuyRow[];
};

async function fetchCurrentPrice(asset: string | null): Promise<number | null> {
  if (!asset) return null;
  try {
    const r = await fetch(`${POLYMARKET_CLOB}/price?token_id=${asset}&side=BUY`);
    if (!r.ok) return null;
    const j = (await r.json()) as { price?: string };
    return j.price ? Number(j.price) : null;
  } catch {
    return null;
  }
}

function scoreConsensus(uniqueWallets: number): number {
  if (uniqueWallets >= 4) return 100;
  if (uniqueWallets === 3) return 70;
  if (uniqueWallets === 2) return 40;
  return 0;
}
function scoreCapital(totalUsd: number): number {
  if (totalUsd <= 0) return 0;
  const v = Math.log10(totalUsd) * 20;
  return Math.max(0, Math.min(100, v));
}
function scoreFreshness(minutesSinceLast: number): number {
  if (minutesSinceLast <= 15) return 100;
  if (minutesSinceLast <= 60) return 70;
  if (minutesSinceLast <= 240) return 40;
  return 10;
}
function scoreDrift(driftPct: number): number {
  const d = Math.abs(driftPct);
  if (d <= 2) return 100;
  if (d <= 5) return 70;
  if (d <= 10) return 30;
  return 0;
}
function scorePriceAgreement(prices: number[], weights: number[]): number {
  const totalW = weights.reduce((s, w) => s + w, 0);
  if (totalW <= 0 || prices.length < 2) return 100;
  const mean = prices.reduce((s, p, i) => s + p * weights[i], 0) / totalW;
  const variance = prices.reduce((s, p, i) => s + weights[i] * (p - mean) ** 2, 0) / totalW;
  const std = Math.sqrt(variance);
  if (std <= 0.02) return 100;
  if (std >= 0.10) return 30;
  return 100 - ((std - 0.02) / 0.08) * 70;
}
function scoreBurst(burstMinutes: number): number {
  if (burstMinutes <= 30) return 100;
  if (burstMinutes <= 120) return 75;
  if (burstMinutes <= 360) return 50;
  if (burstMinutes <= 720) return 30;
  return 20;
}

const WEIGHTS = {
  consensus: 0.30, capital: 0.20, freshness: 0.20,
  drift: 0.15, agreement: 0.10, burst: 0.05,
};

function decide(finalScore: number, uniqueWallets: number, totalUsd: number, driftPct: number, burstMinutes: number) {
  if (finalScore >= 75 && uniqueWallets >= 3 && totalUsd >= 10000 && Math.abs(driftPct) <= 5 && burstMinutes <= 120) {
    return "STRONG_BUY";
  }
  if (finalScore >= 50 && uniqueWallets >= 2) return "WATCH";
  return "IGNORE";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const reversalLookback = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // Load config (for reversal bonus toggle)
  const { data: cfgRow } = await supabaseAdmin
    .from("paper_bot_config").select("reversal_buy_bonus").eq("id", 1).maybeSingle();
  const reversalBonusEnabled = cfgRow?.reversal_buy_bonus !== false;

  const { data: rows, error } = await supabaseAdmin
    .from("trade_alerts")
    .select("wallet_address,wallet_label,condition_id,asset,outcome,title,price,usdc_size,ts,side")
    .gte("ts", since)
    .eq("side", "BUY")
    .not("condition_id", "is", null)
    .order("ts", { ascending: false })
    .limit(10000);

  // Load past SELLs (last 14 days) for reversal detection
  const { data: pastSells } = await supabaseAdmin
    .from("trade_alerts")
    .select("wallet_address,condition_id,ts")
    .gte("ts", reversalLookback)
    .lt("ts", since)
    .eq("side", "SELL")
    .not("condition_id", "is", null)
    .limit(20000);

  const sellSet = new Set<string>();
  for (const s of (pastSells || []) as any[]) {
    sellSet.add(`${s.wallet_address}::${s.condition_id}`);
  }

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  const groups = new Map<string, Group>();
  for (const r of (rows || []) as BuyRow[]) {
    if (!r.condition_id || r.usdc_size == null || r.price == null) continue;
    const key = `${r.condition_id}::${r.outcome ?? ""}`;
    const g = groups.get(key) || {
      condition_id: r.condition_id, asset: r.asset, outcome: r.outcome, title: r.title, rows: [],
    };
    g.rows.push(r);
    groups.set(key, g);
  }

  const now = Date.now();
  const computedAt = new Date(now).toISOString();
  const signalsToInsert: any[] = [];

  for (const g of groups.values()) {
    const wallets = new Set(g.rows.map((r) => r.wallet_address));
    const uniqueWallets = wallets.size;
    if (uniqueWallets < 2) continue;

    const totalUsd = g.rows.reduce((s, r) => s + Number(r.usdc_size || 0), 0);
    const weightedSum = g.rows.reduce((s, r) => s + Number(r.price) * Number(r.usdc_size), 0);
    const avgPrice = weightedSum / totalUsd;
    const prices = g.rows.map((r) => Number(r.price));
    const usdWeights = g.rows.map((r) => Number(r.usdc_size || 0));
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const lastBuyMs = Math.max(...g.rows.map((r) => new Date(r.ts).getTime()));
    const firstBuyMs = Math.min(...g.rows.map((r) => new Date(r.ts).getTime()));
    const minutesSinceLast = Math.floor((now - lastBuyMs) / 60000);
    const burstMinutes = (lastBuyMs - firstBuyMs) / 60000;

    const currentPrice = await fetchCurrentPrice(g.asset);
    const driftPct = currentPrice != null ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;

    const sConsensus = scoreConsensus(uniqueWallets);
    const sCapital = scoreCapital(totalUsd);
    const sFreshness = scoreFreshness(minutesSinceLast);
    const sDrift = scoreDrift(driftPct);
    const sAgreement = scorePriceAgreement(prices, usdWeights);
    const sBurst = scoreBurst(burstMinutes);

    // Reversal bonus: count whales in this group who SOLD this market in the past 14d
    let reversalCount = 0;
    if (reversalBonusEnabled) {
      for (const w of wallets) {
        if (sellSet.has(`${w}::${g.condition_id}`)) reversalCount++;
      }
    }
    // Each reversal whale adds +5 to final score, capped at +15
    const reversalBonus = Math.min(15, reversalCount * 5);

    const baseScore =
      WEIGHTS.consensus * sConsensus +
      WEIGHTS.capital * sCapital +
      WEIGHTS.freshness * sFreshness +
      WEIGHTS.drift * sDrift +
      WEIGHTS.agreement * sAgreement +
      WEIGHTS.burst * sBurst;
    const finalScore = Math.min(100, baseScore + reversalBonus);

    const action = decide(finalScore, uniqueWallets, totalUsd, driftPct, burstMinutes);
    if (action === "IGNORE") continue;

    const totalW = usdWeights.reduce((s, w) => s + w, 0);
    const meanW = prices.reduce((s, p, i) => s + p * usdWeights[i], 0) / totalW;
    const varianceW = prices.reduce((s, p, i) => s + usdWeights[i] * (p - meanW) ** 2, 0) / totalW;
    const priceStd = Math.sqrt(varianceW);

    const labels = Array.from(new Set(g.rows.map((r) => r.wallet_label).filter(Boolean)));
    const addresses = Array.from(wallets);

    signalsToInsert.push({
      condition_id: g.condition_id, asset: g.asset, outcome: g.outcome, title: g.title,
      unique_wallets: uniqueWallets, total_buys: g.rows.length, total_usd: totalUsd,
      avg_price: avgPrice, min_price: minPrice, max_price: maxPrice,
      current_price: currentPrice, price_drift_pct: driftPct,
      price_std: Number(priceStd.toFixed(4)), burst_minutes: Number(burstMinutes.toFixed(1)),
      first_buy_at: new Date(firstBuyMs).toISOString(),
      last_buy_at: new Date(lastBuyMs).toISOString(),
      minutes_since_last_buy: minutesSinceLast,
      wallet_labels: labels, wallet_addresses: addresses,
      score: Number(finalScore.toFixed(2)),
      score_breakdown: {
        consensus: { score: Number(sConsensus.toFixed(1)), weight: WEIGHTS.consensus },
        capital: { score: Number(sCapital.toFixed(1)), weight: WEIGHTS.capital },
        freshness: { score: Number(sFreshness.toFixed(1)), weight: WEIGHTS.freshness },
        drift: { score: Number(sDrift.toFixed(1)), weight: WEIGHTS.drift },
        agreement: { score: Number(sAgreement.toFixed(1)), weight: WEIGHTS.agreement },
        burst: { score: Number(sBurst.toFixed(1)), weight: WEIGHTS.burst },
        reversal: { count: reversalCount, bonus: reversalBonus },
      },
      action, computed_at: computedAt,
    });
  }

  if (signalsToInsert.length > 0) {
    const { error: insErr } = await supabaseAdmin.from("whale_signals").insert(signalsToInsert);
    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), { status: 500, headers: corsHeaders });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true, computed_at: computedAt, groups_examined: groups.size,
      signals_created: signalsToInsert.length,
      strong_buy: signalsToInsert.filter((s) => s.action === "STRONG_BUY").length,
      watch: signalsToInsert.filter((s) => s.action === "WATCH").length,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
