import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const POLYMARKET_CLOB = "https://clob.polymarket.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const action = body?.action as "start" | "stop" | undefined;
  const clearHalt = !!body?.clear_halt;

  if (action !== "start" && action !== "stop") {
    return json({ ok: false, error: "action must be 'start' or 'stop'" }, 400);
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: cfg, error: cfgError } = await supabaseAdmin
    .from("real_bot_config")
    .select("*")
    .eq("id", 1)
    .single();

  if (cfgError || !cfg) return json({ ok: false, error: cfgError?.message || "no config" }, 500);

  if (action === "stop") {
    const { error } = await supabaseAdmin.from("real_bot_config").update({ enabled: false }).eq("id", 1);
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, enabled: false });
  }

  const checks: { name: string; ok: boolean; detail?: string }[] = [];
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

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data: todayClosed } = await supabaseAdmin
    .from("real_positions")
    .select("pnl_usd")
    .eq("status", "CLOSED")
    .gte("closed_at", todayStart.toISOString());
  const dailyPnl = (todayClosed || []).reduce((s: number, r: any) => s + Number(r.pnl_usd ?? 0), 0);
  const lossLimit = Number(cfg.daily_loss_limit_usd ?? 100);
  checks.push(
    dailyPnl <= -lossLimit
      ? { name: "daily_pnl", ok: false, detail: `P&L היום $${dailyPnl.toFixed(2)} חצה את הסף −$${lossLimit}.` }
      : { name: "daily_pnl", ok: true, detail: `P&L היום $${dailyPnl.toFixed(2)} (limit −$${lossLimit})` },
  );

  const sanityIssues: string[] = [];
  if (Number(cfg.min_score) <= 0) sanityIssues.push("min_score <= 0");
  if (Number(cfg.max_open_total) <= 0) sanityIssues.push("max_open_total <= 0");
  if (Number(cfg.min_entry_price) >= Number(cfg.max_entry_price)) sanityIssues.push("min_entry_price >= max_entry_price");
  checks.push({ name: "config_sanity", ok: sanityIssues.length === 0, detail: sanityIssues.length ? sanityIssues.join("; ") : "ok" });

  try {
    const r = await fetch(`${POLYMARKET_CLOB}/`, { method: "GET" });
    checks.push({ name: "clob_reachable", ok: r.ok || r.status === 404, detail: `HTTP ${r.status}` });
  } catch (e: any) {
    checks.push({ name: "clob_reachable", ok: false, detail: e?.message || "fetch failed" });
  }

  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { count: recentSignals } = await supabaseAdmin
    .from("whale_signals")
    .select("id", { count: "exact", head: true })
    .gte("computed_at", since);
  checks.push({ name: "signals_pipeline", ok: (recentSignals ?? 0) > 0, detail: `${recentSignals ?? 0} signals in last 30m` });

  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) return json({ ok: false, enabled: cfg.enabled, checks });

  const update: { enabled: true; daily_halt_until?: null } = { enabled: true };
  if (clearHalt && haltActive) update.daily_halt_until = null;
  const { error } = await supabaseAdmin.from("real_bot_config").update(update).eq("id", 1);
  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true, enabled: true, checks });
});