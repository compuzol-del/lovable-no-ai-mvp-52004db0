// Discovers top traders from Polymarket leaderboards and inserts them into tracked_wallets.
// Filters for active whales with high volume in recent windows.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TARGET = 200;
const MIN_VOLUME_USD = 250_000; // proxy for "thousands of trades" in last 90d
const MIN_PROFIT_USD = 5_000;   // only profitable wallets from profit board
// API caps results at ~50 per call; spread across multiple windows for breadth.
const SOURCES = [
  { board: "profit", window: "1d",  priority: 3 },
  { board: "profit", window: "7d",  priority: 3 },
  { board: "profit", window: "30d", priority: 3 },
  { board: "profit", window: "all", priority: 3 },
  { board: "volume", window: "1d",  priority: 1 },
  { board: "volume", window: "7d",  priority: 1 },
  { board: "volume", window: "30d", priority: 1 },
  { board: "volume", window: "all", priority: 1 },
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
    // Track best (label, source priority, normalized score) per wallet.
    // Score = priority * 1e9 + amount, so profit-board entries always rank above
    // volume-only entries even if their dollar amount is smaller.
    const seen = new Map<string, { label: string | null; score: number }>();
    for (const { board, window, priority } of SOURCES) {
      const list = await fetchLeaderboard(board, window);
      for (const row of list) {
        const addr = (row.proxyWallet || row.wallet || row.address || "").toLowerCase();
        if (!addr) continue;
        const amount = Number(row.amount ?? row.volume ?? 0);
        if (board === "volume" && amount < MIN_VOLUME_USD) continue;
        if (board === "profit" && amount < MIN_PROFIT_USD) continue;
        const label = row.name || row.pseudonym || null;
        const score = priority * 1e9 + Math.max(0, amount);
        const prev = seen.get(addr);
        if (!prev || score > prev.score) seen.set(addr, { label, score });
      }
    }

    const ranked = [...seen.entries()]
      .sort((a, b) => b[1].score - a[1].score)
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
