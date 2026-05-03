// Discovers top traders from Polymarket leaderboards and inserts them into tracked_wallets.
// Filters for active whales with high volume in recent windows.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TARGET = 100;
const MIN_VOLUME_USD = 250_000; // proxy for "thousands of trades" in last 90d
// Polymarket only serves all-time leaderboards reliably; combine volume + profit for breadth.
const SOURCES = [
  { board: "volume", window: "all" },
  { board: "profit", window: "all" },
];

async function fetchLeaderboard(board: string, window: string) {
  const url = `https://lb-api.polymarket.com/${board}?window=${window}&limit=500`;
  const r = await fetch(url);
  if (!r.ok) {
    console.error(`leaderboard ${board}/${window} failed: ${r.status}`);
    return [];
  }
  const data = await r.json();
  return Array.isArray(data) ? data : (data.data ?? []);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const seen = new Map<string, { label: string | null; amount: number }>();
    for (const w of WINDOWS) {
      const list = await fetchLeaderboard(w);
      for (const row of list) {
        const addr = (row.proxyWallet || row.wallet || row.address || "").toLowerCase();
        if (!addr) continue;
        const amount = Number(row.amount ?? row.volume ?? 0);
        if (amount < MIN_VOLUME_USD) continue;
        const label = row.name || row.pseudonym || null;
        const prev = seen.get(addr);
        if (!prev || amount > prev.amount) seen.set(addr, { label, amount });
      }
    }

    const ranked = [...seen.entries()]
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, TARGET);

    let inserted = 0;
    for (const [address, meta] of ranked) {
      const { error } = await supabase
        .from("tracked_wallets")
        .upsert(
          {
            address,
            label: meta.label,
            is_active: true,
            quality_tier: "UNRATED",
          },
          { onConflict: "address", ignoreDuplicates: true },
        );
      if (!error) inserted++;
    }

    const { count } = await supabase
      .from("tracked_wallets")
      .select("*", { count: "exact", head: true });

    return new Response(
      JSON.stringify({ ok: true, candidates: ranked.length, inserted, total_now: count }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
