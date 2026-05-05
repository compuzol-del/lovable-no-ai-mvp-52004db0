import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "../../../../integrations/supabase/client.server";

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

function sizeForScore(score: number): number {
  if (score >= 95) return 300;
  if (score >= 85) return 175;
  return 100;
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

export const Route = createFileRoute("/api/public/hooks/paper-execute")({
  server: {
    handlers: {
      POST: async () => {
        // 1. Load config
        const { data: cfg } = await supabaseAdmin
          .from("paper_bot_config")
          .select("*")
          .eq("id", 1)
          .single();
        if (!cfg) return Response.json({ error: "no config" }, { status: 500 });

        const opened: any[] = [];
        const closed: any[] = [];
        const skipped: any[] = [];

        // 2. CLOSE: refresh open positions and check exit conditions
        const { data: openPos } = await supabaseAdmin
          .from("paper_positions")
          .select("*")
          .eq("status", "OPEN");

        const now = Date.now();
        for (const p of openPos || []) {
          const cur = await fetchPrice(p.asset);
          let exitReason: string | null = null;
          let exitPrice = cur ?? Number(p.current_price ?? p.entry_price);
          const entry = Number(p.entry_price);
          const peak = Math.max(Number(p.peak_price ?? entry), cur ?? entry);
          let slPrice = Number(p.sl_price);
          let breakevenMoved = !!p.breakeven_moved;

          // 2a. Trailing: move SL to breakeven once price >= entry * (1+trigger%)
          if (cur != null && !breakevenMoved) {
            const triggerPrice = entry * (1 + Number(cfg.breakeven_trigger_pct) / 100);
            if (cur >= triggerPrice) {
              slPrice = Math.max(slPrice, entry); // never lower the SL
              breakevenMoved = true;
            }
          }

          // 2b. TP / SL / time-stop
          if (cur != null) {
            if (cur >= Number(p.tp_price)) exitReason = "TAKE_PROFIT";
            else if (cur <= slPrice) exitReason = breakevenMoved ? "BREAKEVEN_STOP" : "STOP_LOSS";
          }
          if (!exitReason && new Date(p.time_stop_at).getTime() <= now) {
            exitReason = "TIME_STOP";
          }

          // 2c. Whale-reversal exit: same whales started selling this market
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
              if ((sellCount ?? 0) >= 2) {
                exitReason = "WHALE_REVERSAL";
              }
            }
          }

          if (exitReason) {
            const pnlUsd = (exitPrice - entry) * Number(p.shares);
            const pnlPct = ((exitPrice - entry) / entry) * 100;
            await supabaseAdmin
              .from("paper_positions")
              .update({
                status: "CLOSED",
                exit_price: exitPrice,
                exit_reason: exitReason,
                pnl_usd: Number(pnlUsd.toFixed(2)),
                pnl_pct: Number(pnlPct.toFixed(2)),
                closed_at: new Date().toISOString(),
                current_price: cur,
                last_price_at: new Date().toISOString(),
                peak_price: peak,
                sl_price: slPrice,
                breakeven_moved: breakevenMoved,
              })
              .eq("id", p.id);
            closed.push({ id: p.id, exitReason, pnlPct: pnlPct.toFixed(2) });
          } else if (cur != null) {
            await supabaseAdmin
              .from("paper_positions")
              .update({
                current_price: cur,
                last_price_at: new Date().toISOString(),
                peak_price: peak,
                sl_price: slPrice,
                breakeven_moved: breakevenMoved,
              })
              .eq("id", p.id);
          }
        }

        // 3. OPEN: scan recent STRONG_BUY signals
        if (cfg.enabled) {
          const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
          const { data: signals } = await supabaseAdmin
            .from("whale_signals")
            .select("*")
            .eq("action", "STRONG_BUY")
            .gte("computed_at", since)
            .gte("score", Number(cfg.min_score))
            .order("score", { ascending: false })
            .limit(50);

          for (const s of signals || []) {
            // Drift filter (don't chase pumps)
            if (s.price_drift_pct != null && Number(s.price_drift_pct) < Number(cfg.min_drift_pct)) {
              skipped.push({ condition_id: s.condition_id, why: `drift ${s.price_drift_pct}` });
              continue;
            }

            // Dedup: skip if any open position already on this condition_id
            const { data: existing } = await supabaseAdmin
              .from("paper_positions")
              .select("id")
              .eq("condition_id", s.condition_id)
              .eq("status", "OPEN")
              .maybeSingle();
            if (existing) {
              skipped.push({ condition_id: s.condition_id, why: "already open" });
              continue;
            }

            const entry = (await fetchPrice(s.asset)) ?? Number(s.current_price ?? s.avg_price);
            if (!entry || entry <= 0 || entry >= 0.99) {
              skipped.push({ condition_id: s.condition_id, why: `bad entry ${entry}` });
              continue;
            }

            const sizeUsd = sizeForScore(Number(s.score));
            const shares = sizeUsd / entry;
            const tpPrice = Math.min(0.99, entry * (1 + Number(cfg.tp_pct) / 100));
            const slPrice = Math.max(0.01, entry * (1 + Number(cfg.sl_pct) / 100));
            const timeStopAt = new Date(Date.now() + Number(cfg.time_stop_hours) * 3600 * 1000);

            const reason = buildReason(s);
            const exitStrategy = buildExitStrategy(
              Number(cfg.tp_pct),
              Number(cfg.sl_pct),
              Number(cfg.time_stop_hours),
              entry,
            );

            const { error: insErr, data: ins } = await supabaseAdmin
              .from("paper_positions")
              .insert({
                signal_id: s.id,
                condition_id: s.condition_id,
                asset: s.asset,
                outcome: s.outcome,
                title: s.title,
                score: s.score,
                score_breakdown: s.score_breakdown,
                unique_wallets: s.unique_wallets,
                total_usd: s.total_usd,
                wallet_labels: s.wallet_labels,
                wallet_addresses: s.wallet_addresses,
                reason,
                size_usd: sizeUsd,
                entry_price: entry,
                shares,
                tp_price: tpPrice,
                sl_price: slPrice,
                time_stop_at: timeStopAt.toISOString(),
                exit_strategy: exitStrategy,
                current_price: entry,
                last_price_at: new Date().toISOString(),
                status: "OPEN",
              })
              .select("id")
              .single();

            if (insErr) {
              skipped.push({ condition_id: s.condition_id, why: insErr.message });
            } else {
              opened.push({ id: ins?.id, score: s.score, sizeUsd, entry });
            }
          }
        }

        return Response.json({
          ok: true,
          enabled: cfg.enabled,
          opened: opened.length,
          closed: closed.length,
          skipped: skipped.length,
          details: { opened, closed, skipped: skipped.slice(0, 10) },
        });
      },
    },
  },
});
