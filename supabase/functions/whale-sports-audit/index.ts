import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DATA_API = "https://data-api.polymarket.com";
const GAMMA_API = "https://gamma-api.polymarket.com";

const SPORT_KEYWORDS = [
  "epl","nba","nfl","ufc","mma","nhl","mlb","tennis","soccer","football",
  "ucl","champions-league","world-cup","boxing","f1","formula","wnba","ncaa",
  "premier-league","la-liga","laliga","bundesliga","serie-a","cricket","ipl",
  "golf","pga","nascar","rugby","mls","copa","euro-2","fifa","superbowl","super-bowl",
  "playoff","match","-vs-","gameweek",
];

const SPORT_CATEGORIES = new Set([
  "sports","sport","epl","nba","nfl","ufc","soccer","mlb","nhl","tennis","f1","boxing",
  "mma","golf","cricket","football","basketball","baseball","hockey","wnba","ncaa","rugby",
]);

type Pos = {
  conditionId?: string; size?: number; initialValue?: number;
  cashPnl?: number; realizedPnl?: number;
  redeemable?: boolean; endDate?: string; slug?: string; eventSlug?: string;
};

async function fetchAll<T>(url: string, limit = 500, max = 5000): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < max; offset += limit) {
    const r = await fetch(`${url}${url.includes("?") ? "&" : "?"}limit=${limit}&offset=${offset}`, {
      headers: { accept: "application/json" },
    });
    if (!r.ok) break;
    const j = (await r.json()) as T[];
    if (!Array.isArray(j) || j.length === 0) break;
    out.push(...j);
    if (j.length < limit) break;
  }
  return out;
}

function classify(category: string | null, slug: string | null, eventSlug: string | null): "sport" | "nonsport" | "unknown" {
  const cat = (category || "").toLowerCase().trim();
  if (cat) {
    if (SPORT_CATEGORIES.has(cat)) return "sport";
    for (const k of SPORT_CATEGORIES) if (cat.includes(k)) return "sport";
    return "nonsport";
  }
  const text = `${slug || ""} ${eventSlug || ""}`.toLowerCase();
  if (text) {
    for (const k of SPORT_KEYWORDS) if (text.includes(k)) return "sport";
    return "nonsport";
  }
  return "unknown";
}

const marketCache = new Map<string, { category: string | null; slug: string | null; eventSlug: string | null }>();

async function fetchMarkets(conditionIds: string[]) {
  const need = conditionIds.filter((c) => !marketCache.has(c));
  for (let i = 0; i < need.length; i += 25) {
    const batch = need.slice(i, i + 25);
    const qs = batch.map((c) => `condition_ids=${c}`).join("&");
    try {
      const r = await fetch(`${GAMMA_API}/markets?${qs}&limit=100`, { headers: { accept: "application/json" } });
      if (!r.ok) { for (const c of batch) marketCache.set(c, { category: null, slug: null, eventSlug: null }); continue; }
      const j = await r.json() as any[];
      const got = new Set<string>();
      for (const m of j || []) {
        const cid = m.conditionId || m.condition_id;
        if (!cid) continue;
        got.add(cid);
        marketCache.set(cid, {
          category: m.category || m.subcategory || null,
          slug: m.slug || null,
          eventSlug: m.events?.[0]?.slug || m.eventSlug || null,
        });
      }
      for (const c of batch) if (!got.has(c)) marketCache.set(c, { category: null, slug: null, eventSlug: null });
    } catch {
      for (const c of batch) marketCache.set(c, { category: null, slug: null, eventSlug: null });
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const startedAt = Date.now();

  const { data: wallets, error } = await supabase.from("tracked_wallets").select("address,label");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  const cutoff = Date.now() - 90 * 24 * 3600 * 1000;
  const results: any[] = [];

  for (const w of wallets || []) {
    try {
      const positions = await fetchAll<Pos>(`${DATA_API}/positions?user=${w.address}`, 500, 5000);
      // Closed in last 90 days
      const closed90 = positions.filter((p) => {
        const ended = (p.redeemable === true) || (p.endDate && new Date(p.endDate).getTime() < Date.now()) || (p.size != null && Number(p.size) === 0);
        if (!ended) return false;
        if (!p.endDate) return false;
        const t = new Date(p.endDate).getTime();
        return t >= cutoff && t <= Date.now();
      });

      const cids = Array.from(new Set(closed90.map((p) => p.conditionId).filter(Boolean))) as string[];
      await fetchMarkets(cids);

      let s_w = 0, s_l = 0, s_vol = 0;
      let n_w = 0, n_l = 0, n_vol = 0;
      let unk = 0;

      for (const p of closed90) {
        const meta = p.conditionId ? marketCache.get(p.conditionId) : null;
        const cat = classify(meta?.category ?? null, meta?.slug ?? p.slug ?? null, meta?.eventSlug ?? p.eventSlug ?? null);
        const pnl = Number(p.realizedPnl ?? 0) + Number(p.cashPnl ?? 0);
        const vol = Number(p.initialValue ?? 0);
        if (cat === "sport") { s_vol += vol; if (pnl > 0) s_w++; else if (pnl < 0) s_l++; }
        else if (cat === "nonsport") { n_vol += vol; if (pnl > 0) n_w++; else if (pnl < 0) n_l++; }
        else unk++;
      }

      const total_closed = closed90.length;
      const total_decided = s_w + s_l + n_w + n_l;
      const total_winrate = total_decided ? (s_w + n_w) / total_decided : null;
      const sport_decided = s_w + s_l;
      const nonsport_decided = n_w + n_l;
      const total_vol = s_vol + n_vol;

      results.push({
        address: w.address,
        label: w.label,
        total_closed_90d: total_closed,
        total_winrate_pct: total_winrate != null ? Number((total_winrate * 100).toFixed(1)) : null,
        sport_closed: sport_decided,
        sport_winrate_pct: sport_decided ? Number(((s_w / sport_decided) * 100).toFixed(1)) : null,
        sport_pct_of_volume: total_vol > 0 ? Number(((s_vol / total_vol) * 100).toFixed(1)) : 0,
        nonsport_closed: nonsport_decided,
        nonsport_winrate_pct: nonsport_decided ? Number(((n_w / nonsport_decided) * 100).toFixed(1)) : null,
        unknown_count: unk,
        sport_volume_usd: Math.round(s_vol),
        nonsport_volume_usd: Math.round(n_vol),
      });
    } catch (e: any) {
      results.push({ address: w.address, label: w.label, error: e?.message || String(e) });
    }
  }

  return new Response(JSON.stringify({
    ok: true, duration_ms: Date.now() - startedAt, processed: results.length, results,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
