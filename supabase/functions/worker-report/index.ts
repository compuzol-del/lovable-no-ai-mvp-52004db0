import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type ReportBody = {
  intent_id?: number;
  status?: "EXECUTED" | "GEO_BLOCKED" | "FAILED";
  order_id?: string | null;
  error?: string | null;
  geo_country?: string | null;
  geo_ip?: string | null;
  geo_blocked?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const expectedSecret = Deno.env.get("WORKER_SHARED_SECRET");
  if (!expectedSecret || req.headers.get("x-worker-secret") !== expectedSecret) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let body: ReportBody = {};
  try { body = await req.json(); } catch {}

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // heartbeat + geo update (whether or not we have an intent — bare geo pings allowed)
  const cfgUpdate: Record<string, unknown> = {
    worker_last_seen_at: new Date().toISOString(),
  };
  if (body.geo_country !== undefined) cfgUpdate.last_geo_country = body.geo_country;
  if (typeof body.geo_blocked === "boolean") {
    cfgUpdate.last_geo_blocked = body.geo_blocked;
    cfgUpdate.last_geo_check_at = new Date().toISOString();
    if (body.geo_blocked) cfgUpdate.execution_mode = "paper"; // safety: drop back to paper
  }
  await supabaseAdmin.from("real_bot_config").update(cfgUpdate).eq("id", 1);

  if (!body.intent_id || !body.status) {
    return json({ ok: true, no_intent: true });
  }

  const update: Record<string, unknown> = {
    status: body.status,
    error: body.error ?? null,
    order_id: body.order_id ?? null,
    geo_country: body.geo_country ?? null,
    geo_ip: body.geo_ip ?? null,
  };
  if (body.status === "EXECUTED") update.executed_at = new Date().toISOString();

  const { data: intent, error: updErr } = await supabaseAdmin
    .from("execution_intents")
    .update(update)
    .eq("id", body.intent_id)
    .select("position_id, status, order_id")
    .single();

  if (updErr) return json({ ok: false, error: updErr.message }, 500);

  // Sync the related real_position
  if (intent?.position_id) {
    if (body.status === "EXECUTED" && body.order_id) {
      await supabaseAdmin.from("real_positions").update({
        order_id: body.order_id, dry_run: false,
      }).eq("id", intent.position_id);
    } else if (body.status === "GEO_BLOCKED" || body.status === "FAILED") {
      // mark the position as a paper/dry trade since live order didn't happen
      await supabaseAdmin.from("real_positions").update({ dry_run: true }).eq("id", intent.position_id);
    }
  }

  return json({ ok: true });
});
