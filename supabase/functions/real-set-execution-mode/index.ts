import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: any = {};
  try { body = await req.json(); } catch {}

  const mode = body.execution_mode;
  if (mode !== "paper" && mode !== "live_compliant_only") {
    return json({ ok: false, error: "execution_mode must be 'paper' or 'live_compliant_only'" }, 400);
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // dry_run mirrors execution_mode for backwards compat with existing UI checks
  const { error } = await supabaseAdmin.from("real_bot_config").update({
    execution_mode: mode,
    dry_run: mode === "paper",
  }).eq("id", 1);

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, execution_mode: mode });
});
