import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExternalLink, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { TopNav } from "@/components/TopNav";

const clampScore = (n: number) => Math.max(0, Math.min(100, n));

function verdict(s: { score: number; action: string; price_drift_pct: number; current_price: number | null }) {
  if (s.current_price == null) {
    return { emoji: "❓", title: "אין מספיק נתונים", sub: "לא הצלחנו למשוך את המחיר הנוכחי", color: "muted" as const };
  }
  if (s.action === "STRONG_BUY") {
    return { emoji: "✅", title: "כדאי לקנות", sub: `ציון ${clampScore(s.score).toFixed(0)}/100 — לווייתנים נכנסו חזק וברוב`, color: "good" as const };
  }
  if (s.score >= 60 && Math.abs(s.price_drift_pct) <= 7) {
    return { emoji: "🟡", title: "אולי — שווה לעקוב", sub: `ציון ${clampScore(s.score).toFixed(0)}/100 — סיגנל בינוני`, color: "warn" as const };
  }
  if (s.price_drift_pct > 7) {
    return { emoji: "❌", title: "מאוחר מדי", sub: `המחיר כבר עלה ${s.price_drift_pct.toFixed(1)}% מאז שהלווייתנים קנו`, color: "bad" as const };
  }
  return { emoji: "⚪", title: "לא מומלץ", sub: `ציון ${clampScore(s.score).toFixed(0)}/100 — חלש`, color: "bad" as const };
}

function oneLiner(s: {
  score: number;
  action: string;
  price_drift_pct: number;
  current_price: number | null;
  unique_wallets: number;
  total_usd: number;
}) {
  const score = `ציון ${clampScore(s.score).toFixed(0)}/100`;
  if (s.current_price == null) return `${score} — אין מחיר נוכחי, אי אפשר להחליט`;
  if (s.action === "STRONG_BUY")
    return `${score} — כדאי לקנות: ${s.unique_wallets} לווייתנים נכנסו חזק והמחיר עוד קרוב לכניסה שלהם`;
  if (s.price_drift_pct > 7)
    return `${score} — מאוחר מדי: המחיר כבר עלה ${s.price_drift_pct.toFixed(1)}% מאז שקנו`;
  if (s.score >= 60) return `${score} — אולי שווה: סיגנל בינוני, לא הכי חזק`;
  if (s.unique_wallets < 3) return `${score} — חלש: רק ${s.unique_wallets} לווייתנים, אין קונצנזוס`;
  return `${score} — לא מומלץ: הסיגנל לא חזק מספיק`;
}

export const Route = createFileRoute("/signals")({
  head: () => ({
    meta: [
      { title: "Whale Alerts — Polymarket" },
      { name: "description", content: "התראות בלייב על קניות לווייתנים בפולימרקט." },
    ],
  }),
  component: SignalsPage,
});

type Signal = {
  id: number;
  condition_id: string;
  asset: string | null;
  outcome: string | null;
  title: string | null;
  unique_wallets: number;
  total_usd: number;
  avg_price: number;
  current_price: number | null;
  price_drift_pct: number;
  minutes_since_last_buy: number;
  wallet_labels: string[];
  wallet_addresses: string[];
  score: number;
  action: string;
  computed_at: string;
  price_std?: number | null;
  burst_minutes?: number | null;
  score_breakdown?: Record<
    string,
    { score: number; weight: number }
  > | null;
};

const PARAM_LABELS: Record<string, string> = {
  consensus: "קונצנזוס לווייתנים",
  capital: "גודל הון",
  freshness: "טריות",
  drift: "סטיית מחיר",
  agreement: "הסכמת מחיר",
  burst: "חלון זמן",
};

type WalletBuy = {
  wallet_address: string;
  wallet_label: string | null;
  total_usd: number;
  avg_price: number;
  buys: number;
  last_ts: string;
};

function fmtUsd(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtAgo(min: number) {
  if (min < 60) return `לפני ${min} דק'`;
  const h = Math.floor(min / 60);
  if (h < 24) return `לפני ${h} שע'`;
  return `לפני ${Math.floor(h / 24)} ימים`;
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Signal | null>(null);
  const [marketSlug, setMarketSlug] = useState<string | null>(null);
  const [walletBreakdown, setWalletBreakdown] = useState<WalletBuy[] | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [lastSignalAt, setLastSignalAt] = useState<string | null>(null);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  async function load() {
    const { data: latest } = await supabase
      .from("whale_signals")
      .select("computed_at")
      .order("computed_at", { ascending: false })
      .limit(1);
    const lastBatch = latest?.[0]?.computed_at;
    setLastSignalAt(lastBatch ?? null);

    // מתי הסריקה האחרונה של הארנקים (trade_alerts)
    const { data: lastTrade } = await supabase
      .from("trade_alerts")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1);
    setLastScanAt(lastTrade?.[0]?.created_at ?? null);

    if (!lastBatch) {
      setSignals([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("whale_signals")
      .select("*")
      .eq("computed_at", lastBatch)
      .order("score", { ascending: false });
    setSignals((data as Signal[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("whale_signals_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whale_signals" },
        (payload) => {
          const s = payload.new as Signal;
          if (s.action === "STRONG_BUY") {
            toast.success(`🐋 ${s.unique_wallets} לווייתנים קנו ${fmtUsd(s.total_usd)}`, {
              description: `${s.title} → ${s.outcome} @ ${s.avg_price.toFixed(2)}`,
            });
          }
          load();
        },
      )
      .subscribe();

    // Fallback polling — מבטיח רענון גם אם realtime נופל
    const poll = setInterval(load, 30_000);
    // טיימר לעדכון "לפני X דקות"
    const tick = setInterval(() => setNow(Date.now()), 15_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  async function openDetails(s: Signal) {
    setSelected(s);
    setWalletBreakdown(null);
    setMarketSlug(null);
    setLoadingDetails(true);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ data: trades }, { data: market }] = await Promise.all([
      supabase
        .from("trade_alerts")
        .select("wallet_address,wallet_label,price,usdc_size,ts")
        .eq("condition_id", s.condition_id)
        .eq("outcome", s.outcome ?? "")
        .eq("side", "BUY")
        .gte("ts", since)
        .order("ts", { ascending: false })
        .limit(2000),
      supabase
        .from("markets")
        .select("slug,event_slug")
        .eq("condition_id", s.condition_id)
        .maybeSingle(),
    ]);

    const map = new Map<string, WalletBuy>();
    for (const t of trades || []) {
      const addr = t.wallet_address as string;
      const usd = Number(t.usdc_size || 0);
      const price = Number(t.price || 0);
      const cur = map.get(addr) || {
        wallet_address: addr,
        wallet_label: (t.wallet_label as string | null) ?? null,
        total_usd: 0,
        avg_price: 0,
        buys: 0,
        last_ts: t.ts as string,
      };
      const newTotal = cur.total_usd + usd;
      cur.avg_price =
        newTotal > 0 ? (cur.avg_price * cur.total_usd + price * usd) / newTotal : price;
      cur.total_usd = newTotal;
      cur.buys += 1;
      if (!cur.wallet_label && t.wallet_label) cur.wallet_label = t.wallet_label as string;
      if ((t.ts as string) > cur.last_ts) cur.last_ts = t.ts as string;
      map.set(addr, cur);
    }
    const breakdown = Array.from(map.values()).sort((a, b) => b.total_usd - a.total_usd);
    setWalletBreakdown(breakdown);
    setMarketSlug(
      (market?.event_slug as string | undefined) ||
        (market?.slug as string | undefined) ||
        null,
    );
    setLoadingDetails(false);
  }

  const marketUrl = (s: Signal) =>
    marketSlug
      ? `https://polymarket.com/event/${marketSlug}`
      : `https://polymarket.com/markets/${s.condition_id}`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold">🐋 התראות לווייתנים</h1>
              <p className="text-xs text-muted-foreground">
                {signals.length} התראות · 🟢 לייב — מתעדכן אוטומטית
              </p>
            </div>
            <div className="flex gap-1">
              <Link to="/tracker">
                <Button variant="ghost" size="sm">פיד</Button>
              </Link>
            </div>
          </div>
          {/* שורת סנכרון */}
          {(() => {
            const sigMin = lastSignalAt
              ? Math.floor((now - new Date(lastSignalAt).getTime()) / 60000)
              : null;
            const scanMin = lastScanAt
              ? Math.floor((now - new Date(lastScanAt).getTime()) / 60000)
              : null;
            const sigStale = sigMin == null || sigMin > 10;
            const scanStale = scanMin == null || scanMin > 10;
            const fmt = (m: number | null) =>
              m == null ? "—" : m < 1 ? "עכשיו" : m < 60 ? `לפני ${m} דק'` : `לפני ${Math.floor(m / 60)} שע'`;
            return (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/40 px-2 py-1.5 text-[11px]">
                <span className="flex items-center gap-1">
                  <span className={scanStale ? "text-destructive" : "text-green-500"}>●</span>
                  סריקת ארנקים: <span className="font-mono">{fmt(scanMin)}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className={sigStale ? "text-destructive" : "text-green-500"}>●</span>
                  חישוב סיגנלים: <span className="font-mono">{fmt(sigMin)}</span>
                </span>
              </div>
            );
          })()}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4">
        {/* באנר ענק — האם לקנות עכשיו? */}
        {!loading && (() => {
          const buyNow = signals.find((s) => {
            // כל 5 התנאים — חלון הקנייה
            return (
              s.action === "STRONG_BUY" &&
              s.current_price != null &&
              s.unique_wallets >= 3 &&
              s.total_usd >= 10000 &&
              s.price_drift_pct <= 5 &&
              s.minutes_since_last_buy <= 60
            );
          });

          if (buyNow) {
            return (
              <button
                onClick={() => openDetails(buyNow)}
                className="mb-4 block w-full rounded-2xl border-4 border-primary bg-primary/15 p-5 text-right shadow-lg animate-pulse"
              >
                <div className="mb-2 flex items-center justify-between">
                  <Badge className="text-sm">עכשיו!</Badge>
                  <div className="text-3xl">🚨</div>
                </div>
                <div className="mb-1 text-2xl font-extrabold text-primary">
                  קנה עכשיו ✅
                </div>
                <div className="mb-3 text-sm font-medium leading-snug">
                  {buyNow.title} → <span className="font-bold">{buyNow.outcome}</span>
                </div>
                <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-background/60 px-2 py-1">
                    מחיר עכשיו: <span className="font-mono font-bold">{buyNow.current_price?.toFixed(2)}</span>
                  </div>
                  <div className="rounded bg-background/60 px-2 py-1">
                    לווייתנים קנו ב: <span className="font-mono font-bold">{buyNow.avg_price.toFixed(2)}</span>
                  </div>
                </div>
                <div className="space-y-1 text-xs">
                  <div>✅ {buyNow.unique_wallets} לווייתנים (≥3)</div>
                  <div>✅ {fmtUsd(buyNow.total_usd)} הון (≥$10K)</div>
                  <div>✅ סטייה {buyNow.price_drift_pct.toFixed(1)}% (≤5%)</div>
                  <div>✅ קנייה {fmtAgo(buyNow.minutes_since_last_buy)} (≤שעה)</div>
                  <div>✅ ציון {clampScore(buyNow.score).toFixed(0)}/100</div>
                </div>
                <div className="mt-3 text-center text-xs font-bold text-primary">
                  לחץ לפרטים והפעלה ←
                </div>
              </button>
            );
          }

          // אין הזדמנות — מסביר למה
          const best = signals[0];
          if (!best) return null;
          const reasons: string[] = [];
          if (best.action !== "STRONG_BUY") reasons.push("הציון לא מספיק גבוה");
          if (best.unique_wallets < 3) reasons.push(`רק ${best.unique_wallets} לווייתנים (צריך 3+)`);
          if (best.total_usd < 10000) reasons.push(`רק ${fmtUsd(best.total_usd)} הון (צריך $10K+)`);
          if (best.price_drift_pct > 5) reasons.push(`המחיר כבר עלה ${best.price_drift_pct.toFixed(1)}% (מקס 5%)`);
          if (best.minutes_since_last_buy > 60) reasons.push(`הקנייה לפני ${fmtAgo(best.minutes_since_last_buy)} (צריך פחות משעה)`);

          return (
            <div className="mb-4 rounded-2xl border-2 border-dashed border-border bg-muted/30 p-4 text-center">
              <div className="mb-1 text-3xl">⏳</div>
              <div className="text-base font-bold">אין הזדמנות לקנייה כרגע</div>
              <div className="mt-1 text-xs text-muted-foreground">
                ממתינים שכל 5 התנאים יתקיימו יחד
              </div>
              {reasons.length > 0 && (
                <div className="mt-3 rounded-md bg-background/60 p-2 text-right text-xs text-muted-foreground">
                  <div className="mb-1 font-semibold text-foreground">האות הכי חזק כרגע חסר:</div>
                  {reasons.slice(0, 2).map((r, i) => (
                    <div key={i}>❌ {r}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">טוען...</p>
        ) : signals.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mb-2 text-4xl">🌊</div>
            <p className="text-sm text-muted-foreground">אין התראות כרגע. המערכת סורקת ברקע — התראות יופיעו כאן אוטומטית.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {signals.map((s) => {
              const isStrong = s.action === "STRONG_BUY";
              const driftBad = s.price_drift_pct > 5;
              return (
                <button
                  key={s.id}
                  onClick={() => openDetails(s)}
                  className={`block w-full text-right rounded-lg border p-3 transition-colors hover:bg-muted/50 ${
                    isStrong ? "border-primary/60 bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="mb-2 flex items-baseline gap-2">
                    <span className="text-lg">{isStrong ? "🚨" : "👀"}</span>
                    <div className="text-base font-bold leading-tight">
                      {s.unique_wallets} לווייתנים · {fmtUsd(s.total_usd)}
                    </div>
                  </div>

                  <div className="mb-2 text-sm font-medium leading-snug">
                    {s.title || "—"}
                  </div>
                  <div className="mb-2 text-xs text-muted-foreground">
                    קנו: <span className="font-semibold text-foreground">{s.outcome}</span>
                    {" "}במחיר ממוצע{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {s.avg_price.toFixed(2)}
                    </span>
                    {s.current_price != null && (
                      <>
                        {" "}· עכשיו{" "}
                        <span className={`font-mono font-semibold ${driftBad ? "text-destructive" : "text-foreground"}`}>
                          {s.current_price.toFixed(2)}
                        </span>
                        {" "}
                        <span className={driftBad ? "text-destructive" : "text-muted-foreground"}>
                          ({s.price_drift_pct >= 0 ? "+" : ""}{s.price_drift_pct.toFixed(1)}%)
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{fmtAgo(s.minutes_since_last_buy)}</span>
                    <Badge variant={isStrong ? "default" : "secondary"} className="text-[10px]">
                      {isStrong ? "כדאי לעקוב" : "מעקב"}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selected && (() => {
            const v = verdict(selected);
            const colorCls =
              v.color === "good"
                ? "border-primary bg-primary/10 text-primary"
                : v.color === "warn"
                ? "border-yellow-500/60 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                : v.color === "bad"
                ? "border-destructive/60 bg-destructive/10 text-destructive"
                : "border-border bg-muted text-muted-foreground";
            return (
            <>
              <DialogHeader>
                <DialogTitle className="text-right leading-snug text-base">
                  {selected.title || "—"}
                </DialogTitle>
                <DialogDescription className="text-right">
                  קנו: <span className="font-semibold text-foreground">{selected.outcome}</span>
                </DialogDescription>
              </DialogHeader>

              {/* שורה אחת — סיכום ההחלטה */}
              <div className="rounded-md bg-muted px-3 py-2 text-right text-sm font-medium leading-snug">
                {oneLiner(selected)}
              </div>

              {/* שורה תחתונה — ההמלצה */}
              <div className={`rounded-xl border-2 p-4 text-center ${colorCls}`}>
                <div className="text-4xl mb-1">{v.emoji}</div>
                <div className="text-xl font-bold">{v.title}</div>
                <div className="mt-1 text-xs opacity-90">{v.sub}</div>
              </div>

              {/* 3 מספרים בלבד */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-border p-2">
                  <div className="text-[10px] text-muted-foreground">לווייתנים</div>
                  <div className="text-lg font-bold">{selected.unique_wallets}</div>
                </div>
                <div className="rounded-lg border border-border p-2">
                  <div className="text-[10px] text-muted-foreground">סה"כ קנו</div>
                  <div className="text-lg font-bold">{fmtUsd(selected.total_usd)}</div>
                </div>
                <div className="rounded-lg border border-border p-2">
                  <div className="text-[10px] text-muted-foreground">מחיר ממוצע</div>
                  <div className="text-lg font-bold font-mono">{selected.avg_price.toFixed(2)}</div>
                </div>
              </div>

              {/* כפתור פעולה ראשי */}
              <a
                href={marketUrl(selected)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:opacity-90"
              >
                <ExternalLink className="h-4 w-4" />
                פתח בפולימרקט
              </a>

              {/* פרטים מתקדמים — מקופלים */}
              <details className="rounded-lg border border-border">
                <summary className="flex cursor-pointer items-center justify-between p-3 text-xs font-medium text-muted-foreground hover:bg-muted/50">
                  <ChevronDown className="h-3 w-3" />
                  <span>פרטים מתקדמים (לווייתנים, ציון, סטיות)</span>
                </summary>
                <div className="space-y-3 border-t border-border p-3">
                  {(() => {
                    // רק נתונים קריטיים באמת — שאר הפרמטרים יכולים להיות חסרים בלי למנוע החלטה
                    if (selected.current_price != null) return null;
                    return (
                      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
                        ⚠️ חסר מחיר נוכחי — לא ניתן לחשב סטיית מחיר
                      </div>
                    );
                  })()}

                  {selected.current_price != null && (
                    <div className="flex justify-between rounded-md border border-border p-2 text-xs">
                      <span className="text-muted-foreground">מחיר עכשיו</span>
                      <span className="font-mono font-bold">
                        {selected.current_price.toFixed(3)}{" "}
                        <span className={selected.price_drift_pct > 5 ? "text-destructive" : "text-muted-foreground"}>
                          ({selected.price_drift_pct >= 0 ? "+" : ""}{selected.price_drift_pct.toFixed(1)}%)
                        </span>
                      </span>
                    </div>
                  )}

                  {selected.score_breakdown && (
                    <div>
                      <div className="mb-1.5 text-xs font-semibold">פירוק ציון: {clampScore(selected.score).toFixed(0)}/100</div>
                      <div className="space-y-1">
                        {Object.entries(selected.score_breakdown).map(([key, val]) => {
                          const raw = typeof val === "number" ? val : Number((val as any)?.score);
                          const num = Number.isFinite(raw) ? raw : 0;
                          const pct = Math.max(0, Math.min(100, num));
                          return (
                            <div key={key} className="text-[11px]">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">{PARAM_LABELS[key] || key}</span>
                                <span className="font-mono">{num.toFixed(0)}</span>
                              </div>
                              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className={`h-full ${pct >= 70 ? "bg-primary" : pct >= 40 ? "bg-primary/60" : "bg-muted-foreground/40"}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="mb-1.5 text-xs font-semibold">לווייתנים שקנו</div>
                    {loadingDetails || !walletBreakdown ? (
                      <p className="py-2 text-center text-[11px] text-muted-foreground">טוען...</p>
                    ) : (
                      <div className="space-y-1">
                        {walletBreakdown.map((w) => (
                          <div
                            key={w.wallet_address}
                            className="flex items-center justify-between rounded-md border border-border p-2 text-[11px]"
                          >
                            <div className="flex flex-col items-end">
                              <div className="font-bold">{fmtUsd(w.total_usd)}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">
                                @ {w.avg_price.toFixed(3)} · {w.buys} קניות
                              </div>
                            </div>
                            <a
                              href={`https://polymarket.com/profile/${w.wallet_address}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 font-medium text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {w.wallet_label || shortAddr(w.wallet_address)}
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </details>
            </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
