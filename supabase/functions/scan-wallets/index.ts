import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const POLYMARKET_DATA_API = "https://data-api.polymarket.com";

async function fetchRecentActivity(wallet: string, sinceTs: number) {
  const url = `${POLYMARKET_DATA_API}/activity?user=${wallet}&limit=500&offset=0`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Polymarket API ${res.status}`);
  const all = (await res.json()) as any[];
  const fresh = all.filter((a) => Number(a?.timestamp || 0) > sinceTs);
  const maxTs = all.reduce((m, a) => Math.max(m, Number(a?.timestamp || 0)), sinceTs);
  return { fresh, maxTs };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const startedAt = Date.now();
  const { data: wallets, error: wErr } = await supabaseAdmin
    .from("tracked_wallets")
    .select("address, label, last_scanned_ts, alert_threshold_usd")
    .eq("is_active", true);

  if (wErr) {
    return new Response(JSON.stringify({ error: wErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<{ wallet: string; new: number; error?: string }> = [];

  for (const w of wallets || []) {
    try {
      const { fresh: activities, maxTs } = await fetchRecentActivity(w.address, w.last_scanned_ts || 0);
      const threshold = Number(w.alert_threshold_usd || 0);

      const newRows = activities
        .filter((a: any) => Number(a?.usdcSize || 0) >= threshold)
        .map((a: any) => ({
          wallet_address: w.address,
          wallet_label: w.label,
          transaction_hash: String(a.transactionHash || ""),
          type: String(a.type || ""),
          side: a.side || null,
          asset: a.asset || null,
          condition_id: a.conditionId || null,
          title: a.title || null,
          outcome: a.outcome || null,
          size: a.size != null ? Number(a.size) : null,
          price: a.price != null ? Number(a.price) : null,
          usdc_size: a.usdcSize != null ? Number(a.usdcSize) : null,
          ts: new Date(Number(a.timestamp) * 1000).toISOString(),
          timestamp_unix: Number(a.timestamp || 0),
          raw: a,
        }))
        .filter((r: any) => r.transaction_hash);

      if (newRows.length > 0) {
        const { error: insErr } = await supabaseAdmin
          .from("trade_alerts")
          .upsert(newRows, {
            onConflict: "wallet_address,transaction_hash,asset,side",
            ignoreDuplicates: true,
          });
        if (insErr) throw insErr;
      }

      await supabaseAdmin
        .from("tracked_wallets")
        .update({
          last_scanned_ts: maxTs,
          last_scanned_at: new Date().toISOString(),
        })
        .eq("address", w.address);

      results.push({ wallet: w.address, new: newRows.length });
    } catch (e: any) {
      results.push({ wallet: w.address, new: 0, error: e?.message || String(e) });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, duration_ms: Date.now() - startedAt, results }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
