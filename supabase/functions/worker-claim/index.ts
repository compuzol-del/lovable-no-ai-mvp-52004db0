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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const envSecret = Deno.env.get("WORKER_SHARED_SECRET");
  const headerSecret = req.headers.get("x-worker-secret");
  const expected = envSecret?.trim();
  const received = headerSecret?.trim();
  const debug = {
    hasEnvSecret: !!expected,
    hasHeaderSecret: !!received,
    envSecretLength: expected?.length ?? 0,
    headerSecretLength: received?.length ?? 0,
    secretsMatch: !!expected && received === expected,
  };
  console.log("worker-claim auth debug:", debug);
  if (!expected || !received || received !== expected) {
    return json({ ok: false, error: "unauthorized", debug }, 401);
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const workerId = typeof body.worker_id === "string" ? body.worker_id : "unknown";

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // heartbeat
  await supabaseAdmin.from("real_bot_config").update({
    worker_last_seen_at: new Date().toISOString(),
  }).eq("id", 1);

  const { data, error } = await supabaseAdmin.rpc("claim_next_intent", { _worker_id: workerId });
  if (error) return json({ ok: false, error: error.message }, 500);

  const intent = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return json({ ok: true, intent });
});
