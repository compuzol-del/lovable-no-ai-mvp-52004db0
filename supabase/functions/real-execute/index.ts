import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const POLYMARKET_CLOB = "https://clob.polymarket.com";

async function fetchPrice(asset: string | null): Promise<number | null> {
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

// Lazily import @polymarket/clob-client and place a real BUY limit order on Polygon CLOB.
// Uses EIP-712 signing via @ethersproject/wallet under the hood.
async function placeLiveBuyOrder(
  tokenId: string,
  price: number,
  shares: number,
): Promise<{ orderId: string | null; error: string | null }> {
  try {
    const pk = Deno.env.get("POLYMARKET_PRIVATE_KEY");
    const apiKey = Deno.env.get("POLYMARKET_API_KEY");
    const apiSecret = Deno.env.get("POLYMARKET_API_SECRET");
    const passphrase = Deno.env.get("POLYMARKET_API_PASSPHRASE");
    const funder = Deno.env.get("POLYMARKET_FUNDER_ADDRESS") || undefined;
    const sigTypeRaw = Deno.env.get("POLYMARKET_SIG_TYPE");
    if (!pk || !apiKey || !apiSecret || !passphrase) {
      return { orderId: null, error: "missing POLYMARKET_* env vars" };
    }
    if (!tokenId) return { orderId: null, error: "missing tokenId/asset" };

    const [{ ClobClient, OrderType, Side }, walletMod] = await Promise.all([
      import("npm:@polymarket/clob-client@4.21.0"),
      import("npm:@ethersproject/wallet@5.7.0"),
    ]);
    const Wallet = (walletMod as any).Wallet;

    const wallet = new Wallet(pk.startsWith("0x") ? pk : `0x${pk}`);
    const creds = { key: apiKey, secret: apiSecret, passphrase };
    const signatureType = sigTypeRaw ? Number(sigTypeRaw) : undefined;

    const client = new (ClobClient as any)(
      "https://clob.polymarket.com",
      137,
      wallet,
      creds,
      signatureType,
      funder,
    );

    const roundedPrice = Math.round(price * 1000) / 1000;
    const roundedSize = Math.round(shares * 100) / 100;
    if (roundedSize <= 0) return { orderId: null, error: "size rounded to 0" };

    const signed = await client.createOrder({
      tokenID: tokenId,
      price: roundedPrice,
      side: Side.BUY,
      size: roundedSize,
      feeRateBps: 0,
    });
    const resp: any = await client.postOrder(signed, OrderType.GTC);
    if (!resp?.success) {
      return { orderId: null, error: resp?.errorMsg || resp?.error || "order rejected" };
    }
    return { orderId: resp.orderID ?? resp.orderId ?? null, error: null };
  } catch (e: any) {
    return { orderId: null, error: e?.message ?? String(e) };
  }
}

// Real-money sizing: 10 / 20 / 30
function sizeForScore(score: number): number {
  if (score >= 95) return 30;
  if (score >= 85) return 20;
  return 10;
}

function buildReason(s: any): string {
  const wallets = s.unique_wallets;
  const usd = Math.round(Number(s.total_usd));
  const labels: string[] = Array.isArray(s.wallet_labels) ? s.wallet_labels.filter(Boolean) : [];
  const namedPart = labels.length ? ` (${labels.slice(0, 3).join(", ")}${labels.length > 3 ? "…" : ""})` : "";
  const burst = s.burst_minutes != null ? `${Math.round(Number(s.burst_minutes))}m` : "?";
  const drift = s.price_drift_pct != null ? `${Number(s.price_drift_pct).toFixed(1)}%` : "?";
  const avg = Number(s.avg_price).toFixed(3);
  return `${wallets} whales${namedPart} bought $${usd.toLocaleString()} @ avg ${avg} within ${burst}, drift ${drift}, score ${Number(s.score).toFixed(1)}.`;
}

function buildExitStrategy(tpPct: number, slPct: number, hours: number, entry: number): string {
  const tp = (entry * (1 + tpPct / 100)).toFixed(3);
  const sl = (entry * (1 + slPct / 100)).toFixed(3);
  return `TP ${tp} (+${tpPct}%) · SL ${sl} (${slPct}%) · Time-stop ${hours}h`;
}

function nextUtcMidnight(): Date {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: cfg } = await supabaseAdmin.from("real_bot_config").select("*").eq("id", 1).single();
  if (!cfg) return new Response(JSON.stringify({ error: "no config" }), { status: 500, headers: corsHeaders });

  const opened: any[] = [];
  const closed: any[] = [];
  const skipped: any[] = [];

  // 1. Refresh open positions
  const { data: openPos } = await supabaseAdmin.from("real_positions").select("*").eq("status", "OPEN");
  const now = Date.now();
  for (const p of openPos || []) {
    const cur = await fetchPrice(p.asset);
    let exitReason: string | null = null;
    let exitPrice = cur ?? Number(p.current_price ?? p.entry_price);
    const entry = Number(p.entry_price);
    const peak = Math.max(Number(p.peak_price ?? entry), cur ?? entry);
    let slPrice = Number(p.sl_price);
    let breakevenMoved = !!p.breakeven_moved;

    if (cur != null && !breakevenMoved) {
      const triggerPrice = entry * (1 + Number(cfg.breakeven_trigger_pct) / 100);
      if (cur >= triggerPrice) { slPrice = Math.max(slPrice, entry); breakevenMoved = true; }
    }
    if (cur != null) {
      if (cur >= Number(p.tp_price)) {
        exitReason = "TAKE_PROFIT";
        // cap exit at TP to simulate limit order fill
        exitPrice = Math.max(Number(p.tp_price), Math.min(cur, Number(p.tp_price) * 1.05));
      } else if (cur <= slPrice) {
        exitReason = breakevenMoved ? "BREAKEVEN_STOP" : "STOP_LOSS";
        // cap loss at SL price (simulates stop-limit) instead of current crashed price
        exitPrice = slPrice;
      }
    }
    if (!exitReason && new Date(p.time_stop_at).getTime() <= now) exitReason = "TIME_STOP";

    if (!exitReason && cfg.whale_reversal_exit) {
      const wallets: string[] = Array.isArray(p.wallet_addresses) ? (p.wallet_addresses as string[]) : [];
      if (wallets.length > 0) {
        const sinceISO = new Date(p.opened_at).toISOString();
        const { count: sellCount } = await supabaseAdmin
          .from("trade_alerts")
          .select("id", { count: "exact", head: true })
          .eq("side", "SELL").eq("condition_id", p.condition_id)
          .gte("ts", sinceISO).in("wallet_address", wallets);
        if ((sellCount ?? 0) >= 1) exitReason = "WHALE_REVERSAL";
      }
    }

    if (exitReason) {
      const grossPnl = (exitPrice - entry) * Number(p.shares);
      const feePct = Number(cfg.fee_pct ?? 2);
      const fee = grossPnl > 0 ? grossPnl * (feePct / 100) : 0;
      const pnlUsd = grossPnl - fee;
      const pnlPct = ((exitPrice - entry) / entry) * 100;
      await supabaseAdmin.from("real_positions").update({
        status: "CLOSED", exit_price: exitPrice, exit_reason: exitReason,
        pnl_usd: Number(pnlUsd.toFixed(2)), pnl_pct: Number(pnlPct.toFixed(2)),
        closed_at: new Date().toISOString(), current_price: cur,
        last_price_at: new Date().toISOString(), peak_price: peak,
        sl_price: slPrice, breakeven_moved: breakevenMoved,
      }).eq("id", p.id);
      closed.push({ id: p.id, exitReason, pnlPct: pnlPct.toFixed(2) });
    } else if (cur != null) {
      await supabaseAdmin.from("real_positions").update({
        current_price: cur, last_price_at: new Date().toISOString(),
        peak_price: peak, sl_price: slPrice, breakeven_moved: breakevenMoved,
      }).eq("id", p.id);
    }
  }

  // 2. Daily loss kill-switch
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const { data: todayClosed } = await supabaseAdmin
    .from("real_positions").select("pnl_usd").eq("status", "CLOSED")
    .gte("closed_at", todayStart.toISOString());
  const dailyPnl = (todayClosed || []).reduce((s, r: any) => s + Number(r.pnl_usd ?? 0), 0);
  const lossLimit = Number(cfg.daily_loss_limit_usd ?? 50);
  let halted = false;
  if (dailyPnl <= -lossLimit) {
    halted = true;
    const haltUntil = nextUtcMidnight().toISOString();
    if (!cfg.daily_halt_until || new Date(cfg.daily_halt_until).getTime() < Date.now()) {
      await supabaseAdmin.from("real_bot_config").update({ daily_halt_until: haltUntil }).eq("id", 1);
    }
  }
  if (cfg.daily_halt_until && new Date(cfg.daily_halt_until).getTime() > Date.now()) halted = true;

  // 3. Open new positions
  if (cfg.enabled && !halted) {
    const { count: openCount } = await supabaseAdmin
      .from("real_positions").select("id", { count: "exact", head: true }).eq("status", "OPEN");

    if ((openCount ?? 0) >= Number(cfg.max_open_total)) {
      skipped.push({ why: `max_open_total reached (${openCount}/${cfg.max_open_total})` });
    } else {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: signals } = await supabaseAdmin
        .from("whale_signals").select("*").eq("action", "STRONG_BUY")
        .gte("computed_at", since).gte("score", Number(cfg.min_score))
        .order("score", { ascending: false }).limit(50);

      let currentOpen = openCount ?? 0;
      for (const s of signals || []) {
        if (currentOpen >= Number(cfg.max_open_total)) break;
        if (s.price_drift_pct != null && Number(s.price_drift_pct) < Number(cfg.min_drift_pct)) {
          skipped.push({ condition_id: s.condition_id, why: `drift ${s.price_drift_pct}` }); continue;
        }
        const { data: existing } = await supabaseAdmin.from("real_positions").select("id")
          .eq("condition_id", s.condition_id).eq("status", "OPEN").maybeSingle();
        if (existing) { skipped.push({ condition_id: s.condition_id, why: "already open" }); continue; }

        const { data: market } = await supabaseAdmin.from("markets")
          .select("volume,liquidity,event_id").eq("condition_id", s.condition_id).maybeSingle();
        if (market) {
          if (market.volume != null && Number(market.volume) < Number(cfg.min_market_volume_usd)) {
            skipped.push({ condition_id: s.condition_id, why: `low volume ${market.volume}` }); continue;
          }
          if (market.liquidity != null && Number(market.liquidity) < Number(cfg.min_market_liquidity_usd)) {
            skipped.push({ condition_id: s.condition_id, why: `low liquidity ${market.liquidity}` }); continue;
          }
          if (market.event_id) {
            const { count: eventOpen } = await supabaseAdmin.from("real_positions")
              .select("id", { count: "exact", head: true }).eq("status", "OPEN").eq("event_id", market.event_id);
            if ((eventOpen ?? 0) >= Number(cfg.max_open_per_event)) {
              skipped.push({ condition_id: s.condition_id, why: `event cap (${eventOpen}/${cfg.max_open_per_event})` }); continue;
            }
          }
        }

        const entry = (await fetchPrice(s.asset)) ?? Number(s.current_price ?? s.avg_price);
        if (!entry || entry < Number(cfg.min_entry_price) || entry > Number(cfg.max_entry_price)) {
          skipped.push({ condition_id: s.condition_id, why: `bad entry ${entry}` }); continue;
        }
        const refPrice = Number(s.avg_price);
        if (refPrice > 0) {
          const slippagePct = ((entry - refPrice) / refPrice) * 100;
          if (slippagePct > Number(cfg.max_slippage_pct)) {
            skipped.push({ condition_id: s.condition_id, why: `slippage ${slippagePct.toFixed(2)}%` }); continue;
          }
        }

        const sizeUsd = sizeForScore(Number(s.score));
        const shares = sizeUsd / entry;
        const tpPrice = Math.min(0.99, entry * (1 + Number(cfg.tp_pct) / 100));
        const slPrice = Math.max(0.01, entry * (1 + Number(cfg.sl_pct) / 100));
        const timeStopAt = new Date(Date.now() + Number(cfg.time_stop_hours) * 3600 * 1000);
        const reason = buildReason(s);
        const exitStrategy = buildExitStrategy(Number(cfg.tp_pct), Number(cfg.sl_pct), Number(cfg.time_stop_hours), entry);

        let orderId: string | null = null;
        if (!cfg.dry_run) {
          skipped.push({ condition_id: s.condition_id, why: "live mode but Polymarket order placement not implemented yet" });
          continue;
        }

        const { error: insErr, data: ins } = await supabaseAdmin.from("real_positions").insert({
          signal_id: s.id, condition_id: s.condition_id, asset: s.asset, outcome: s.outcome, title: s.title,
          score: s.score, score_breakdown: s.score_breakdown, unique_wallets: s.unique_wallets,
          total_usd: s.total_usd, wallet_labels: s.wallet_labels, wallet_addresses: s.wallet_addresses,
          reason, size_usd: sizeUsd, entry_price: entry, shares,
          tp_price: tpPrice, sl_price: slPrice, time_stop_at: timeStopAt.toISOString(),
          exit_strategy: exitStrategy, current_price: entry, last_price_at: new Date().toISOString(),
          status: "OPEN", event_id: market?.event_id ?? null,
          market_volume_usd: market?.volume ?? null, market_liquidity_usd: market?.liquidity ?? null,
          order_id: orderId, dry_run: !!cfg.dry_run,
        }).select("id").single();

        if (insErr) skipped.push({ condition_id: s.condition_id, why: insErr.message });
        else { opened.push({ id: ins?.id, score: s.score, sizeUsd, entry, dry_run: !!cfg.dry_run }); currentOpen += 1; }
      }
    }
  }

  return new Response(JSON.stringify({
    ok: true, enabled: cfg.enabled, dry_run: !!cfg.dry_run, halted,
    dailyPnl: Number(dailyPnl.toFixed(2)), lossLimit,
    opened: opened.length, closed: closed.length, skipped: skipped.length,
    details: { opened, closed, skipped: skipped.slice(0, 10) },
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
