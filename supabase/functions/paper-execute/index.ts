import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const POLYMARKET_CLOB = "https://clob.polymarket.com";
const POLYMARKET_GAMMA = "https://gamma-api.polymarket.com";

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

async function fetchMarketMeta(conditionId: string): Promise<{
  volume: number; liquidity: number; endDate: string | null; eventId: string | null;
  closed: boolean; outcomes: string[]; outcomePrices: number[];
} | null> {
  try {
    const r = await fetch(`${POLYMARKET_GAMMA}/markets?condition_ids=${conditionId}`);
    if (!r.ok) return null;
    const arr = await r.json() as any[];
    const m = Array.isArray(arr) ? arr[0] : null;
    if (!m) return null;
    const vol = Number(m.volume24hr ?? m.volumeNum ?? m.volume ?? 0);
    const liq = Number(m.liquidityNum ?? m.liquidity ?? 0);
    const parseArr = (v: any): any[] => {
      if (Array.isArray(v)) return v;
      if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
      return [];
    };
    const outcomes = parseArr(m.outcomes).map(String);
    const outcomePrices = parseArr(m.outcomePrices).map((x: any) => Number(x));
    return {
      volume: vol, liquidity: liq,
      endDate: m.endDate || m.end_date || null,
      eventId: m.eventId || m.event_id || (m.events?.[0]?.id ?? null),
      closed: !!m.closed,
      outcomes,
      outcomePrices,
    };
  } catch {
    return null;
  }
}

// Resolve the actual exit price when the order book is empty (market closed/resolved).
// Returns 1.0 if our outcome won, 0.0 if it lost, or last-known current_price otherwise.
async function resolveExitPrice(p: any): Promise<number | null> {
  const meta = await fetchMarketMeta(p.condition_id);
  if (meta && meta.closed && meta.outcomes.length && meta.outcomePrices.length === meta.outcomes.length) {
    const idx = meta.outcomes.findIndex(
      (o) => o.toLowerCase() === String(p.outcome ?? "").toLowerCase(),
    );
    if (idx >= 0) return meta.outcomePrices[idx];
  }
  return p.current_price != null ? Number(p.current_price) : null;
}

function sizeForScore(score: number): number {
  if (score >= 95) return 90;
  if (score >= 85) return 60;
  return 30;
}

// Dynamic TP/SL by entry price tier
function dynamicExits(entry: number): { tpPct: number; slPct: number; tier: string; maxHours: number } {
  if (entry < 0.20) return { tpPct: 40, slPct: -20, tier: "low", maxHours: 24 };
  if (entry > 0.60) return { tpPct: 12, slPct: -8, tier: "high", maxHours: 6 };
  return { tpPct: 20, slPct: -12, tier: "mid", maxHours: 12 };
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: cfg } = await supabaseAdmin.from("paper_bot_config").select("*").eq("id", 1).single();
  if (!cfg) return new Response(JSON.stringify({ error: "no config" }), { status: 500, headers: corsHeaders });

  const opened: any[] = [];
  const closed: any[] = [];
  const skipped: any[] = [];

  const { data: openPos } = await supabaseAdmin.from("paper_positions").select("*").eq("status", "OPEN");

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
      if (cur >= triggerPrice) {
        slPrice = Math.max(slPrice, entry);
        breakevenMoved = true;
      }
    }

    if (cur != null) {
      if (cur >= Number(p.tp_price)) exitReason = "TAKE_PROFIT";
      else if (cur <= slPrice) exitReason = breakevenMoved ? "BREAKEVEN_STOP" : "STOP_LOSS";
    }
    if (!exitReason && new Date(p.time_stop_at).getTime() <= now) {
      exitReason = "TIME_STOP";
    }

    if (!exitReason && cfg.whale_reversal_exit) {
      const wallets: string[] = Array.isArray(p.wallet_addresses) ? (p.wallet_addresses as string[]) : [];
      if (wallets.length > 0) {
        const sinceISO = new Date(p.opened_at).toISOString();
        const { count: sellCount } = await supabaseAdmin
          .from("trade_alerts")
          .select("id", { count: "exact", head: true })
          .eq("side", "SELL")
          .eq("condition_id", p.condition_id)
          .gte("ts", sinceISO)
          .in("wallet_address", wallets);
        if ((sellCount ?? 0) >= 2) exitReason = "WHALE_REVERSAL";
      }
    }

    if (exitReason) {
      // Realistic stop-loss fill: assume sell near SL with up to 5% slippage,
      // not at whatever current price happens to be (which can gap far below SL).
      if ((exitReason === "STOP_LOSS" || exitReason === "BREAKEVEN_STOP") && cur != null) {
        const worstAcceptable = slPrice * 0.95;
        exitPrice = Math.max(worstAcceptable, Math.min(slPrice, cur));
      }
      const pnlUsd = (exitPrice - entry) * Number(p.shares);
      const pnlPct = ((exitPrice - entry) / entry) * 100;
      await supabaseAdmin.from("paper_positions").update({
        status: "CLOSED", exit_price: exitPrice, exit_reason: exitReason,
        pnl_usd: Number(pnlUsd.toFixed(2)), pnl_pct: Number(pnlPct.toFixed(2)),
        closed_at: new Date().toISOString(), current_price: cur,
        last_price_at: new Date().toISOString(), peak_price: peak,
        sl_price: slPrice, breakeven_moved: breakevenMoved,
      }).eq("id", p.id);
      closed.push({ id: p.id, exitReason, pnlPct: pnlPct.toFixed(2) });
    } else if (cur != null) {
      await supabaseAdmin.from("paper_positions").update({
        current_price: cur, last_price_at: new Date().toISOString(),
        peak_price: peak, sl_price: slPrice, breakeven_moved: breakevenMoved,
      }).eq("id", p.id);
    }
  }

  if (cfg.enabled) {
    // Concentration: count current open positions and group by event
    const { data: openAll } = await supabaseAdmin
      .from("paper_positions").select("event_id").eq("status", "OPEN");
    const openByEvent = new Map<string, number>();
    let totalOpen = (openAll || []).length;
    for (const o of openAll || []) {
      const k = o.event_id || "_none_";
      openByEvent.set(k, (openByEvent.get(k) || 0) + 1);
    }
    const maxTotal = Number(cfg.max_open_total ?? 15);
    const maxPerEvent = Number(cfg.max_open_per_event ?? 2);
    const minVol = Number(cfg.min_market_volume_usd ?? 0);
    const minLiq = Number(cfg.min_market_liquidity_usd ?? 0);
    const useDynExits = cfg.dynamic_exits !== false;
    const useDynTime = cfg.dynamic_time_stop !== false;

    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: signals } = await supabaseAdmin
      .from("whale_signals").select("*").eq("action", "STRONG_BUY")
      .gte("computed_at", since).gte("score", Number(cfg.min_score))
      .order("score", { ascending: false }).limit(50);

    for (const s of signals || []) {
      if (totalOpen >= maxTotal) {
        skipped.push({ condition_id: s.condition_id, why: `max_open_total ${maxTotal}` });
        continue;
      }
      if (s.price_drift_pct != null && Number(s.price_drift_pct) < Number(cfg.min_drift_pct)) {
        skipped.push({ condition_id: s.condition_id, why: `drift ${s.price_drift_pct}` });
        continue;
      }

      const { data: existing } = await supabaseAdmin
        .from("paper_positions").select("id")
        .eq("condition_id", s.condition_id).eq("status", "OPEN").maybeSingle();
      if (existing) {
        skipped.push({ condition_id: s.condition_id, why: "already open" });
        continue;
      }

      // Cooldown: don't re-enter same market right after a recent close
      // - WHALE_REVERSAL / STOP_LOSS / BREAKEVEN_STOP → 6h cooldown (whales bailed, don't chase)
      // - TIME_STOP → 3h cooldown
      // - TAKE_PROFIT → 1h cooldown (positive, but avoid immediate re-entry at higher price)
      const { data: lastClosed } = await supabaseAdmin
        .from("paper_positions")
        .select("exit_reason, closed_at")
        .eq("condition_id", s.condition_id)
        .eq("status", "CLOSED")
        .order("closed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastClosed?.closed_at) {
        const cooldownHours =
          lastClosed.exit_reason === "TAKE_PROFIT" ? 1 :
          lastClosed.exit_reason === "TIME_STOP" ? 3 : 6;
        const ageMs = Date.now() - new Date(lastClosed.closed_at).getTime();
        if (ageMs < cooldownHours * 3600 * 1000) {
          const minsLeft = Math.round((cooldownHours * 3600 * 1000 - ageMs) / 60000);
          skipped.push({ condition_id: s.condition_id, why: `cooldown ${lastClosed.exit_reason} ${minsLeft}m left` });
          continue;
        }
      }

      const meta = await fetchMarketMeta(s.condition_id);
      if (meta) {
        if (minVol > 0 && meta.volume < minVol) {
          skipped.push({ condition_id: s.condition_id, why: `volume ${Math.round(meta.volume)} < ${minVol}` });
          continue;
        }
        if (minLiq > 0 && meta.liquidity < minLiq) {
          skipped.push({ condition_id: s.condition_id, why: `liquidity ${Math.round(meta.liquidity)} < ${minLiq}` });
          continue;
        }
      }
      const eventKey = meta?.eventId || "_none_";
      if ((openByEvent.get(eventKey) || 0) >= maxPerEvent) {
        skipped.push({ condition_id: s.condition_id, why: `max_per_event ${maxPerEvent}` });
        continue;
      }

      const entry = (await fetchPrice(s.asset)) ?? Number(s.current_price ?? s.avg_price);
      if (!entry || entry <= 0.01 || entry >= 0.99) {
        skipped.push({ condition_id: s.condition_id, why: `bad entry ${entry}` });
        continue;
      }

      // Dynamic TP/SL by entry price tier (or fall back to config flat values)
      const tier = useDynExits ? dynamicExits(entry) : { tpPct: Number(cfg.tp_pct), slPct: Number(cfg.sl_pct), tier: "flat", maxHours: Number(cfg.time_stop_hours) };

      // Dynamic time-stop: min(config hours, tier max, 25% of time-to-resolution)
      let timeStopHours = Math.min(Number(cfg.time_stop_hours), tier.maxHours);
      let ttrHours: number | null = null;
      if (useDynTime && meta?.endDate) {
        const ttrMs = new Date(meta.endDate).getTime() - Date.now();
        if (ttrMs > 0) {
          ttrHours = ttrMs / 3600000;
          timeStopHours = Math.max(2, Math.min(timeStopHours, ttrHours * 0.25));
        }
      }

      // Gap-risk filter: high-tier (entry > 0.60) on markets resolving within 12h
      // are prone to sudden price gaps around events (goals, decisions). Skip them.
      if (tier.tier === "high" && ttrHours != null && ttrHours < 12) {
        skipped.push({ condition_id: s.condition_id, why: `gap risk: high tier + ttr ${ttrHours.toFixed(1)}h` });
        continue;
      }

      const sizeUsd = sizeForScore(Number(s.score));
      const shares = sizeUsd / entry;
      const tpPrice = Math.min(0.99, entry * (1 + tier.tpPct / 100));
      const slPrice = Math.max(0.01, entry * (1 + tier.slPct / 100));
      const timeStopAt = new Date(Date.now() + timeStopHours * 3600 * 1000);

      const reason = buildReason(s);
      const exitStrategy = buildExitStrategy(tier.tpPct, tier.slPct, timeStopHours, entry);

      const { error: insErr, data: ins } = await supabaseAdmin.from("paper_positions").insert({
        signal_id: s.id, condition_id: s.condition_id, asset: s.asset, outcome: s.outcome, title: s.title,
        score: s.score, score_breakdown: s.score_breakdown, unique_wallets: s.unique_wallets,
        total_usd: s.total_usd, wallet_labels: s.wallet_labels, wallet_addresses: s.wallet_addresses,
        reason, size_usd: sizeUsd, entry_price: entry, shares,
        tp_price: tpPrice, sl_price: slPrice, time_stop_at: timeStopAt.toISOString(),
        exit_strategy: exitStrategy, current_price: entry,
        last_price_at: new Date().toISOString(), status: "OPEN",
        event_id: meta?.eventId ?? null,
        market_volume_usd: meta?.volume ?? null,
        market_liquidity_usd: meta?.liquidity ?? null,
        price_tier: tier.tier,
        time_to_resolution_hours: ttrHours,
      }).select("id").single();

      if (insErr) skipped.push({ condition_id: s.condition_id, why: insErr.message });
      else {
        opened.push({ id: ins?.id, score: s.score, sizeUsd, entry, tier: tier.tier });
        totalOpen++;
        openByEvent.set(eventKey, (openByEvent.get(eventKey) || 0) + 1);
      }
    }
  }

  return new Response(JSON.stringify({
    ok: true, enabled: cfg.enabled,
    opened: opened.length, closed: closed.length, skipped: skipped.length,
    details: { opened, closed, skipped: skipped.slice(0, 10) },
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
