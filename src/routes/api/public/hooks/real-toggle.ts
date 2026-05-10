import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "../../../../integrations/supabase/client.server";

const POLYMARKET_CLOB = "https://clob.polymarket.com";

export const Route = createFileRoute("/api/public/hooks/real-toggle")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: any = {};
        try {
          body = await request.json();
        } catch {}
        const action = body?.action as "start" | "stop" | undefined;
        const clearHalt = !!body?.clear_halt;

        if (action !== "start" && action !== "stop") {
          return Response.json({ ok: false, error: "action must be 'start' or 'stop'" }, { status: 400 });
        }

        const { data: cfg } = await supabaseAdmin
          .from("real_bot_config")
          .select("*")
          .eq("id", 1)
          .single();
        if (!cfg) return Response.json({ ok: false, error: "no config" }, { status: 500 });

        // STOP: just disable, no checks
        if (action === "stop") {
          await supabaseAdmin.from("real_bot_config").update({ enabled: false }).eq("id", 1);
          return Response.json({ ok: true, enabled: false });
        }

        // START: run health checks before enabling
        const checks: { name: string; ok: boolean; detail?: string }[] = [];

        // 1. Halt status
        const haltActive = cfg.daily_halt_until && new Date(cfg.daily_halt_until).getTime() > Date.now();
        if (haltActive && !clearHalt) {
          checks.push({
            name: "daily_halt",
            ok: false,
            detail: `הבוט מושהה עד ${new Date(cfg.daily_halt_until as string).toISOString()} (שלח clear_halt:true כדי לאפס)`,
          });
        } else {
          checks.push({ name: "daily_halt", ok: true, detail: haltActive ? "halt cleared by request" : "no halt" });
        }

        // 2. Daily loss check (current PnL vs limit)
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        const { data: todayClosed } = await supabaseAdmin
          .from("real_positions")
          .select("pnl_usd")
          .eq("status", "CLOSED")
          .gte("closed_at", todayStart.toISOString());
        const dailyPnl = (todayClosed || []).reduce((s, r: any) => s + Number(r.pnl_usd ?? 0), 0);
        const lossLimit = Number(cfg.daily_loss_limit_usd ?? 50);
        if (dailyPnl <= -lossLimit) {
          checks.push({
            name: "daily_pnl",
            ok: false,
            detail: `P&L היום $${dailyPnl.toFixed(2)} חצה את הסף −$${lossLimit}. העלה את daily_loss_limit_usd לפני הפעלה.`,
          });
        } else {
          checks.push({ name: "daily_pnl", ok: true, detail: `P&L היום $${dailyPnl.toFixed(2)} (limit −$${lossLimit})` });
        }

        // 3. Config sanity
        const sanityIssues: string[] = [];
        if (Number(cfg.min_score) <= 0) sanityIssues.push("min_score <= 0");
        if (Number(cfg.max_open_total) <= 0) sanityIssues.push("max_open_total <= 0");
        if (Number(cfg.min_entry_price) >= Number(cfg.max_entry_price)) sanityIssues.push("min_entry_price >= max_entry_price");
        checks.push({
          name: "config_sanity",
          ok: sanityIssues.length === 0,
          detail: sanityIssues.length === 0 ? "ok" : sanityIssues.join("; "),
        });

        // 4. Polymarket CLOB reachable
        try {
          const r = await fetch(`${POLYMARKET_CLOB}/`, { method: "GET" });
          checks.push({ name: "clob_reachable", ok: r.ok || r.status === 404, detail: `HTTP ${r.status}` });
        } catch (e: any) {
          checks.push({ name: "clob_reachable", ok: false, detail: e?.message || "fetch failed" });
        }

        // 5. Recent signals pipeline alive (so the bot has data to work with)
        const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { count: recentSignals } = await supabaseAdmin
          .from("whale_signals")
          .select("id", { count: "exact", head: true })
          .gte("computed_at", since);
        checks.push({
          name: "signals_pipeline",
          ok: (recentSignals ?? 0) > 0,
          detail: `${recentSignals ?? 0} signals in last 30m`,
        });

        const failed = checks.filter((c) => !c.ok);
        if (failed.length > 0) {
          return Response.json({ ok: false, enabled: cfg.enabled, checks }, { status: 400 });
        }

        const update: Record<string, any> = { enabled: true };
        if (clearHalt && haltActive) update.daily_halt_until = null;
        await supabaseAdmin.from("real_bot_config").update(update).eq("id", 1);

        return Response.json({ ok: true, enabled: true, checks });
      },
    },
  },
});
