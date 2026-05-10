import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ExternalLink, RefreshCw, Power, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { TopNav } from "@/components/TopNav";

type Position = {
  id: number;
  condition_id: string;
  asset: string | null;
  outcome: string | null;
  title: string | null;
  score: number;
  unique_wallets: number;
  total_usd: number;
  wallet_labels: string[];
  reason: string;
  size_usd: number;
  entry_price: number;
  shares: number;
  tp_price: number;
  sl_price: number;
  time_stop_at: string;
  exit_strategy: string;
  current_price: number | null;
  last_price_at: string | null;
  status: string;
  exit_price: number | null;
  exit_reason: string | null;
  pnl_usd: number | null;
  pnl_pct: number | null;
  opened_at: string;
  closed_at: string | null;
  breakeven_moved: boolean | null;
  peak_price: number | null;
  market_slug?: string | null;
  event_slug?: string | null;
  resolved_outcome?: string | null;
  order_id?: string | null;
  dry_run?: boolean | null;
};

type Config = {
  enabled: boolean;
  dry_run: boolean;
  daily_loss_limit_usd: number;
  daily_halt_until: string | null;
  min_score: number;
  tp_pct: number;
  sl_pct: number;
  time_stop_hours: number;
  breakeven_trigger_pct: number;
  whale_reversal_exit: boolean;
  starting_budget_usd: number;
  min_market_volume_usd: number;
  min_market_liquidity_usd: number;
  max_open_total: number;
  max_open_per_event: number;
  max_slippage_pct: number;
  min_entry_price: number;
  max_entry_price: number;
  fee_pct: number;
  last_run_at: string | null;
  last_run_opened: number | null;
  last_run_closed: number | null;
  last_run_skipped: number | null;
  last_run_status: string | null;
  last_run_error: string | null;
  execution_mode: "paper" | "live_compliant_only";
  last_geo_check_at: string | null;
  last_geo_country: string | null;
  last_geo_blocked: boolean | null;
  worker_last_seen_at: string | null;
};

type Intent = {
  id: number;
  created_at: string;
  position_id: number | null;
  condition_id: string;
  token_id: string;
  side: string;
  price: number;
  shares: number;
  size_usd: number | null;
  status: string;
  order_id: string | null;
  error: string | null;
  geo_country: string | null;
};

export const Route = createFileRoute("/real")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Real Bot — Whale Auto-Trader (Live)" },
      { name: "description", content: "Real-money whale-signal bot on Polymarket." },
    ],
  }),
  component: RealPage,
});

function pnlColor(pct: number | null) {
  if (pct == null) return "text-muted-foreground";
  if (pct > 0) return "text-green-500";
  if (pct < 0) return "text-red-500";
  return "text-muted-foreground";
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

function timeLeft(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "פג";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function marketUrl(p: Position) {
  if (p.event_slug) return `https://polymarket.com/event/${p.event_slug}`;
  if (p.market_slug) return `https://polymarket.com/market/${p.market_slug}`;
  return `https://polymarket.com/search?q=${encodeURIComponent(p.title || p.condition_id)}`;
}

async function attachMarketData(positions: Position[]) {
  const conditionIds = Array.from(new Set(positions.map((p) => p.condition_id).filter(Boolean)));
  if (conditionIds.length === 0) return positions;
  const { data: markets } = await supabase
    .from("markets")
    .select("condition_id,slug,event_slug,resolved_outcome")
    .in("condition_id", conditionIds);
  const byConditionId = new Map((markets || []).map((m) => [m.condition_id, m]));
  return positions.map((p) => {
    const market = byConditionId.get(p.condition_id);
    return {
      ...p,
      market_slug: market?.slug ?? null,
      event_slug: market?.event_slug ?? null,
      resolved_outcome: market?.resolved_outcome ?? null,
    };
  });
}

function RealPage() {
  const [open, setOpen] = useState<Position[]>([]);
  const [closed, setClosed] = useState<Position[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");
  const [filterResult, setFilterResult] = useState<"all" | "win" | "loss">("all");
  const [pnlPage, setPnlPage] = useState(1);
  const PNL_PAGE_SIZE = 20;
  const [lastBotRun, setLastBotRun] = useState<string | null>(null);
  const [intents, setIntents] = useState<Intent[]>([]);

  const closedFiltered = closed.filter((p) => {
    const pnl = Number(p.pnl_usd ?? 0);
    if (filterResult === "win" && pnl <= 0) return false;
    if (filterResult === "loss" && pnl >= 0) return false;
    if (p.closed_at) {
      const t = new Date(p.closed_at).getTime();
      if (filterFrom && t < new Date(filterFrom).getTime()) return false;
      if (filterTo && t > new Date(filterTo).getTime() + 86400000) return false;
    }
    return true;
  });
  const filteredPnl = closedFiltered.reduce((s, p) => s + Number(p.pnl_usd ?? 0), 0);
  const filteredWins = closedFiltered.filter((p) => Number(p.pnl_usd ?? 0) > 0).length;
  const filteredWinRate = closedFiltered.length ? (filteredWins / closedFiltered.length) * 100 : 0;

  // Daily PnL today (UTC)
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const dailyPnl = closed
    .filter((p) => p.closed_at && new Date(p.closed_at).getTime() >= todayStart.getTime())
    .reduce((s, p) => s + Number(p.pnl_usd ?? 0), 0);

  async function load() {
    const [{ data: o }, { data: c }, { data: cfg }, { data: lastPos }] = await Promise.all([
      supabase.from("real_positions").select("*").eq("status", "OPEN").order("opened_at", { ascending: false }),
      supabase.from("real_positions").select("*").eq("status", "CLOSED").order("closed_at", { ascending: false }).limit(500),
      supabase.from("real_bot_config").select("*").eq("id", 1).single(),
      supabase.from("real_positions").select("opened_at,closed_at").order("opened_at", { ascending: false }).limit(1),
    ]);
    const openWithMarkets = await attachMarketData((o as Position[]) || []);
    const closedFiltered = ((c as Position[]) || []).filter((p) => Number(p.pnl_usd ?? 0) !== 0);
    const closedWithMarkets = await attachMarketData(closedFiltered);
    setOpen(openWithMarkets);
    setClosed(closedWithMarkets);
    const realCfg = cfg as Config | null;
    setConfig(realCfg);
    const lp = (lastPos as any[])?.[0];
    setLastBotRun(realCfg?.last_run_at ?? (lp?.closed_at && new Date(lp.closed_at) > new Date(lp.opened_at) ? lp.closed_at : lp?.opened_at ?? null));
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  async function runNow() {
    setRunning(true);
    try {
      const { data: j, error } = await supabase.functions.invoke("real-execute");
      if (error) throw new Error(error.message || "failed");
      if (!j?.ok) throw new Error(j?.error || "failed");
      const firstSkip = j?.details?.skipped?.[0]?.why;
      toast.success(`Opened ${j.opened} · Closed ${j.closed} · Skipped ${j.skipped}${j.halted ? " · HALTED" : ""}${firstSkip ? ` · ${firstSkip}` : ""}`, { duration: 8000 });
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRunning(false);
    }
  }

  async function toggleBot(action: "start" | "stop", clearHalt = false) {
    setToggling(true);
    try {
      const { data: j, error } = await supabase.functions.invoke("real-toggle", {
        body: { action, clear_halt: clearHalt },
      });
      if (error) throw new Error(error.message || "failed");
      if (!j?.ok) {
        const failed = (j.checks || []).filter((c: any) => !c.ok);
        if (failed.length > 0) {
          const msg = failed.map((c: any) => `❌ ${c.name}: ${c.detail}`).join("\n");
          toast.error(msg, { duration: 8000 });
          // If halt is the only blocker, offer override
          const onlyHalt = failed.length === 1 && failed[0].name === "daily_halt";
          if (onlyHalt && action === "start" && !clearHalt) {
            if (confirm("הבוט מושהה ע״י ה-kill switch היומי. לאפס את ההשהיה ולהפעיל בכל זאת?")) {
              await toggleBot("start", true);
              return;
            }
          }
        } else {
          toast.error(j.error || "failed");
        }
        return;
      }
      toast.success(action === "start" ? "✅ הבוט הופעל — כל הבדיקות עברו" : "🛑 הבוט נעצר");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setToggling(false);
    }
  }

  const totalOpenValue = open.reduce((s, p) => s + (p.current_price ?? p.entry_price) * Number(p.shares), 0);
  const totalOpenCost = open.reduce((s, p) => s + Number(p.size_usd), 0);
  const openPnl = totalOpenValue - totalOpenCost;
  const closedPnl = closed.reduce((s, p) => s + Number(p.pnl_usd ?? 0), 0);
  const wins = closed.filter((p) => Number(p.pnl_usd ?? 0) > 0).length;
  const winRate = closed.length ? (wins / closed.length) * 100 : 0;

  const isHalted = config?.daily_halt_until && new Date(config.daily_halt_until).getTime() > Date.now();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <div className="mx-auto max-w-6xl p-4 space-y-4">
        {/* Mode banner */}
        <div className={`rounded-lg border-2 p-3 flex items-center gap-2 flex-wrap ${config?.dry_run ? "border-yellow-500/50 bg-yellow-500/10" : "border-red-500/50 bg-red-500/10"}`}>
          <AlertTriangle className={`h-5 w-5 ${config?.dry_run ? "text-yellow-500" : "text-red-500"}`} />
          <div className="text-sm flex-1">
            <b>💵 Real Money — {config?.dry_run ? "DRY RUN" : "LIVE 🔴"}</b>
            {config?.dry_run
              ? <span className="text-muted-foreground"> (סימולציה — לא נשלחות הזמנות אמיתיות לפולימרקט)</span>
              : <span className="text-muted-foreground"> (הזמנות נשלחות לפולימרקט CLOB עם כסף אמיתי)</span>}
          </div>
          <Button
            size="sm"
            variant={config?.dry_run ? "destructive" : "outline"}
            onClick={async () => {
              const goingLive = !!config?.dry_run;
              const msg = goingLive
                ? "⚠️ לעבור למצב LIVE? יישלחו הזמנות אמיתיות לפולימרקט עם כסף אמיתי."
                : "לחזור למצב DRY RUN (סימולציה ללא הזמנות אמיתיות)?";
              if (!confirm(msg)) return;
              const { data: j, error } = await supabase.functions.invoke("real-set-mode", {
                body: { dry_run: !goingLive },
              });
              if (error || !j?.ok) toast.error(error?.message || j?.error || "failed");
              else { toast.success(goingLive ? "🔴 LIVE mode" : "🟡 DRY RUN"); await load(); }
            }}
          >
            {config?.dry_run ? "עבור ל-LIVE" : "חזור ל-DRY RUN"}
          </Button>
        </div>

        {isHalted && (
          <div className="rounded-lg border-2 border-red-500/60 bg-red-500/15 p-3 text-sm">
            🛑 <b>הבוט מושהה לעצירת הפסד יומית</b> — חוזר לפעילות ב-{fmtTime(config?.daily_halt_until ?? null)}.
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold">💵 Real Bot</h1>
            <p className="text-sm text-muted-foreground">בוט כסף אמיתי — סכומים קטנים, פילטרים מוקשחים, kill-switch יומי</p>
            <p className="text-xs text-muted-foreground mt-1">
              🤖 ריצת בוט אחרונה: <b>{fmtTime(lastBotRun)}</b>
              {config?.last_run_status ? <> · {config.last_run_status} · O:{config.last_run_opened ?? 0} C:{config.last_run_closed ?? 0} S:{config.last_run_skipped ?? 0}</> : null}
              {config?.last_run_error ? <> · {config.last_run_error}</> : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {config?.enabled ? (
              <Button onClick={() => toggleBot("stop")} disabled={toggling} size="sm" variant="destructive">
                <Power className={`h-4 w-4 mr-1 ${toggling ? "animate-pulse" : ""}`} />
                עצור בוט
              </Button>
            ) : (
              <Button onClick={() => toggleBot("start")} disabled={toggling} size="sm" variant="default">
                <Power className={`h-4 w-4 mr-1 ${toggling ? "animate-pulse" : ""}`} />
                הפעל בוט (עם בדיקות)
              </Button>
            )}
            <Button onClick={runNow} disabled={running} size="sm" variant="outline">
              <RefreshCw className={`h-4 w-4 mr-1 ${running ? "animate-spin" : ""}`} />
              ריצה ידנית
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (!confirm("לאפס? כל הפוזיציות (פתוחות + סגורות) יימחקו, הבוט ייעצר וההשהיה היומית תתאפס.")) return;
                const { data: j, error } = await supabase.functions.invoke("real-reset");
                if (error || !j?.ok) toast.error(error?.message || j?.error || "failed");
                else { toast.success("✅ אופס"); await load(); }
              }}
            >
              איפוס
            </Button>
          </div>
        </div>

        {config && (
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-4 text-sm">
              <Badge variant={config.enabled ? "default" : "destructive"}>
                <Power className="h-3 w-3 mr-1" /> {config.enabled ? "פעיל" : "כבוי"}
              </Badge>
              <span>Min score: <b>{config.min_score}</b></span>
              <span>Min vol: <b>${Number(config.min_market_volume_usd).toLocaleString()}</b></span>
              <span>Min liq: <b>${Number(config.min_market_liquidity_usd).toLocaleString()}</b></span>
              <span>Max open: <b>{config.max_open_total}</b></span>
              <span>Slippage: <b>{config.max_slippage_pct}%</b></span>
              <span>Daily loss limit: <b className="text-red-500">−${config.daily_loss_limit_usd}</b></span>
              <span>Whale-reversal: <b className={config.whale_reversal_exit ? "text-green-500" : "text-muted-foreground"}>{config.whale_reversal_exit ? "ON (≥1)" : "OFF"}</b></span>
              <span className="text-muted-foreground">Sizing: 75-84→$10 · 85-94→$20 · 95+→$30</span>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(() => {
            const budget = Number(config?.starting_budget_usd ?? 1000);
            const totalPnl = openPnl + closedPnl;
            const equity = budget + totalPnl;
            const available = equity - totalOpenCost;
            const limit = Number(config?.daily_loss_limit_usd ?? 50);
            const dailyColor = dailyPnl <= -limit ? "text-red-500" : dailyPnl < 0 ? "text-orange-500" : "text-green-500";
            return (
              <>
                <StatCard label={`💵 זמין (מתוך $${budget.toFixed(0)})`} value={`$${available.toFixed(2)}`} color={available < budget ? "text-orange-500" : ""} />
                <StatCard label={`🔒 נעול (${open.length})`} value={`$${totalOpenCost.toFixed(2)}`} color="text-muted-foreground" />
                <StatCard label={`📅 P&L היום (limit −$${limit})`} value={`${dailyPnl >= 0 ? "+" : ""}$${dailyPnl.toFixed(2)}`} color={dailyColor} />
                <StatCard label={`סגור: ${closed.length} · Win ${winRate.toFixed(0)}%`} value={`${closedPnl >= 0 ? "+" : ""}$${closedPnl.toFixed(2)}`} color={pnlColor(closedPnl)} />
              </>
            );
          })()}
        </div>

        <Tabs defaultValue="pnl">
          <TabsList>
            <TabsTrigger value="pnl">📊 רווח והפסד</TabsTrigger>
            <TabsTrigger value="open">פתוחות ({open.length})</TabsTrigger>
            <TabsTrigger value="closed">סגורות ({closed.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pnl">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">טבלת רווח והפסד</CardTitle></CardHeader>
              <CardContent className="p-0">
                {(() => {
                  const all = [...open, ...closed].sort((a, b) => {
                    const ta = new Date(a.closed_at ?? a.opened_at).getTime();
                    const tb = new Date(b.closed_at ?? b.opened_at).getTime();
                    return tb - ta;
                  });
                  const totalPages = Math.max(1, Math.ceil(all.length / PNL_PAGE_SIZE));
                  const curPage = Math.min(pnlPage, totalPages);
                  const pageItems = all.slice((curPage - 1) * PNL_PAGE_SIZE, curPage * PNL_PAGE_SIZE);
                  return (
                    <>
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm table-fixed">
                          <thead className="bg-muted/50 text-xs text-muted-foreground">
                            <tr>
                              <th className="text-right p-2 w-[28%]">שוק</th>
                              <th className="text-center p-2 w-[14%]">סטטוס</th>
                              <th className="text-center p-2 w-[10%]">Size</th>
                              <th className="text-center p-2 w-[10%]">כניסה</th>
                              <th className="text-center p-2 w-[14%]">נוכחי/יציאה</th>
                              <th className="text-center p-2 w-[12%]">P&L $</th>
                              <th className="text-center p-2 w-[10%]">P&L %</th>
                              <th className="text-center p-2 w-[6%]">קישור</th>
                            </tr>
                          </thead>
                          <tbody>
                            {all.length === 0 && (
                              <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">אין נתונים עדיין</td></tr>
                            )}
                            {pageItems.map((p) => {
                              const isOpen = p.status === "OPEN";
                              const price = isOpen ? (p.current_price ?? p.entry_price) : (p.exit_price ?? p.entry_price);
                              const pnlUsd = isOpen
                                ? (Number(price) - Number(p.entry_price)) * Number(p.shares)
                                : Number(p.pnl_usd ?? 0);
                              const pnlPct = isOpen
                                ? ((Number(price) - Number(p.entry_price)) / Number(p.entry_price)) * 100
                                : Number(p.pnl_pct ?? 0);
                              return (
                                <tr key={p.id} className="border-t">
                                  <td className="p-2 truncate text-right">{p.title || p.condition_id.slice(0, 12)}{p.outcome ? ` · ${p.outcome}` : ""}</td>
                                  <td className="p-2 text-center"><Badge variant={isOpen ? "default" : "outline"} className="text-xs">{isOpen ? "פתוח" : (p.exit_reason || "סגור")}</Badge></td>
                                  <td className="p-2 text-center">${Number(p.size_usd).toFixed(0)}</td>
                                  <td className="p-2 text-center">{Number(p.entry_price).toFixed(3)}</td>
                                  <td className="p-2 text-center">{Number(price).toFixed(3)}</td>
                                  <td className={`p-2 text-center font-medium ${pnlColor(pnlUsd)}`}>{pnlUsd >= 0 ? "+" : ""}${pnlUsd.toFixed(2)}</td>
                                  <td className={`p-2 text-center font-medium ${pnlColor(pnlPct)}`}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%</td>
                                  <td className="p-2 text-center">
                                    {p.condition_id && (
                                      <a href={marketUrl(p)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center text-primary hover:underline">
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </a>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="md:hidden divide-y">
                        {all.length === 0 && (
                          <div className="p-4 text-center text-muted-foreground text-sm">אין נתונים עדיין</div>
                        )}
                        {pageItems.map((p) => {
                          const isOpen = p.status === "OPEN";
                          const price = isOpen ? (p.current_price ?? p.entry_price) : (p.exit_price ?? p.entry_price);
                          const pnlUsd = isOpen
                            ? (Number(price) - Number(p.entry_price)) * Number(p.shares)
                            : Number(p.pnl_usd ?? 0);
                          const pnlPct = isOpen
                            ? ((Number(price) - Number(p.entry_price)) / Number(p.entry_price)) * 100
                            : Number(p.pnl_pct ?? 0);
                          return (
                            <div key={p.id} className="p-3 space-y-2">
                              <div className="flex justify-between items-start gap-2">
                                <div className="text-sm font-medium flex-1 min-w-0 truncate text-right">
                                  {p.title || p.condition_id.slice(0, 12)}{p.outcome ? ` · ${p.outcome}` : ""}
                                </div>
                                <div className="text-right shrink-0">
                                  <div className={`text-sm font-bold ${pnlColor(pnlUsd)}`}>{pnlUsd >= 0 ? "+" : ""}${pnlUsd.toFixed(2)}</div>
                                  <div className={`text-xs ${pnlColor(pnlPct)}`}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%</div>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <Badge variant={isOpen ? "default" : "outline"} className="text-[10px]">{isOpen ? "פתוח" : (p.exit_reason || "סגור")}</Badge>
                                <span>Size: <b className="text-foreground">${Number(p.size_usd).toFixed(0)}</b></span>
                                <span>כניסה: <b className="text-foreground">{Number(p.entry_price).toFixed(3)}</b></span>
                                <span>{isOpen ? "נוכחי" : "יציאה"}: <b className="text-foreground">{Number(price).toFixed(3)}</b></span>
                                {p.condition_id && (
                                  <a href={marketUrl(p)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                                    פולימרקט <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                                {!isOpen && p.resolved_outcome && (
                                  <span>רשמי: <b className="text-foreground">{p.resolved_outcome}</b></span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {all.length > PNL_PAGE_SIZE && (
                        <div className="flex items-center justify-center gap-2 p-3 border-t">
                          <Button size="sm" variant="outline" disabled={curPage <= 1} onClick={() => setPnlPage(curPage - 1)}>הקודם</Button>
                          <span className="text-xs text-muted-foreground">עמוד {curPage} מתוך {totalPages}</span>
                          <Button size="sm" variant="outline" disabled={curPage >= totalPages} onClick={() => setPnlPage(curPage + 1)}>הבא</Button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="open" className="space-y-3">
            {loading && <p className="text-sm text-muted-foreground">טוען…</p>}
            {!loading && open.length === 0 && (
              <Card><CardContent className="p-6 text-center text-muted-foreground">
                אין פוזיציות פתוחות כרגע.
              </CardContent></Card>
            )}
            {open.map((p) => <PositionCard key={p.id} p={p} isOpen />)}
          </TabsContent>

          <TabsContent value="closed" className="space-y-3">
            <Card>
              <CardContent className="p-3 flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">מתאריך</label>
                  <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">עד תאריך</label>
                  <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">תוצאה</label>
                  <div className="flex gap-1">
                    <Button size="sm" variant={filterResult === "all" ? "default" : "outline"} onClick={() => setFilterResult("all")}>הכל</Button>
                    <Button size="sm" variant={filterResult === "win" ? "default" : "outline"} onClick={() => setFilterResult("win")} className={filterResult === "win" ? "" : "text-green-500"}>רווח</Button>
                    <Button size="sm" variant={filterResult === "loss" ? "default" : "outline"} onClick={() => setFilterResult("loss")} className={filterResult === "loss" ? "" : "text-red-500"}>הפסד</Button>
                  </div>
                </div>
                {(filterFrom || filterTo || filterResult !== "all") && (
                  <Button size="sm" variant="ghost" onClick={() => { setFilterFrom(""); setFilterTo(""); setFilterResult("all"); }}>נקה</Button>
                )}
                <div className="ml-auto text-sm flex flex-wrap gap-3">
                  <span>סה"כ: <b>{closedFiltered.length}</b></span>
                  <span>Win: <b>{filteredWinRate.toFixed(0)}%</b></span>
                  <span className={pnlColor(filteredPnl)}>P&L: <b>{filteredPnl >= 0 ? "+" : ""}${filteredPnl.toFixed(2)}</b></span>
                </div>
              </CardContent>
            </Card>
            {!loading && closedFiltered.length === 0 && (
              <Card><CardContent className="p-6 text-center text-muted-foreground">אין פוזיציות שתואמות את הפילטר.</CardContent></Card>
            )}
            {closedFiltered.map((p) => <PositionCard key={p.id} p={p} isOpen={false} />)}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-xl font-bold ${color || ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function PositionCard({ p, isOpen }: { p: Position; isOpen: boolean }) {
  const livePrice = p.current_price ?? p.entry_price;
  const livePnlPct = isOpen
    ? ((livePrice - Number(p.entry_price)) / Number(p.entry_price)) * 100
    : Number(p.pnl_pct ?? 0);
  const livePnlUsd = isOpen
    ? (livePrice - Number(p.entry_price)) * Number(p.shares)
    : Number(p.pnl_usd ?? 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-base flex-1">
            {p.title || p.condition_id.slice(0, 12)}
            {p.outcome && <Badge variant="outline" className="ml-2">{p.outcome}</Badge>}
            {p.dry_run && <Badge variant="outline" className="ml-2 text-yellow-500 border-yellow-500/50">DRY</Badge>}
          </CardTitle>
          <div className="text-right shrink-0">
            <div className={`text-lg font-bold ${pnlColor(livePnlPct)}`}>{livePnlPct >= 0 ? "+" : ""}{livePnlPct.toFixed(1)}%</div>
            <div className={`text-xs ${pnlColor(livePnlUsd)}`}>{livePnlUsd >= 0 ? "+" : ""}${livePnlUsd.toFixed(2)}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="bg-muted/50 rounded p-2">
          <div className="text-xs text-muted-foreground mb-1">למה נכנסנו:</div>
          <ul className="list-disc pr-5 space-y-0.5 text-sm">
            {(() => {
              const cleaned = (p.reason || "").replace(/0x[a-fA-F0-9]{40}/g, "").replace(/\s{2,}/g, " ").trim();
              const parts = cleaned.split(/[•·\n]|(?:\s\|\s)|(?:,\s)/).map((s) => s.trim()).filter((s) => s.length > 1);
              return (parts.length ? parts : [cleaned]).map((b, i) => <li key={i}>{b}</li>);
            })()}
          </ul>
        </div>

        <div className="grid grid-cols-4 gap-2 text-xs">
          <Field label="כניסה" value={Number(p.entry_price).toFixed(3)} />
          <Field label="נוכחי" value={livePrice.toFixed(3)} bold />
          <Field label="TP" value={Number(p.tp_price).toFixed(3)} color="text-green-500" />
          <Field label={p.breakeven_moved ? "SL (BE🔒)" : "SL"} value={Number(p.sl_price).toFixed(3)} color={p.breakeven_moved ? "text-blue-500" : "text-red-500"} />
        </div>

        <div className="bg-muted/30 rounded p-2 text-xs">
          <div className="text-muted-foreground mb-1">יציאה:</div>
          <div>{p.exit_strategy}</div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Size: <b className="text-foreground">${Number(p.size_usd).toFixed(0)}</b></span>
          <span>Score: <b className="text-foreground">{Number(p.score).toFixed(0)}</b></span>
          <span>נפתח: {fmtTime(p.opened_at)}</span>
          {isOpen ? (
            <span>נשאר: <b className="text-foreground">{timeLeft(p.time_stop_at)}</b></span>
          ) : (
            <>
              <span>נסגר: {fmtTime(p.closed_at)}</span>
              {p.resolved_outcome && <span>תוצאה רשמית: <b className="text-foreground">{p.resolved_outcome}</b></span>}
              <Badge variant={Number(p.pnl_usd ?? 0) >= 0 ? "default" : "destructive"} className="text-xs">{p.exit_reason}</Badge>
            </>
          )}
          {p.condition_id && (
            <a href={marketUrl(p)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              שוק <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground text-[10px]">{label}</div>
      <div className={`${color || ""} ${bold ? "font-bold" : ""}`}>{value}</div>
    </div>
  );
}
