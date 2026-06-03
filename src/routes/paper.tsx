import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ExternalLink, RefreshCw, Power } from "lucide-react";
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
};

type Config = {
  enabled: boolean;
  min_score: number;
  tp_pct: number;
  sl_pct: number;
  time_stop_hours: number;
  breakeven_trigger_pct: number;
  whale_reversal_exit: boolean;
  starting_budget_usd: number;
};

export const Route = createFileRoute("/paper")({
  head: () => ({
    meta: [
      { title: "Paper Bot — Whale Auto-Trader" },
      { name: "description", content: "Automated paper-money bot trading whale signals on Polymarket." },
    ],
  }),
  component: PaperPage,
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

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("he-IL", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

  const marketRows: Array<{
    condition_id: string;
    slug: string | null;
    event_slug: string | null;
    resolved_outcome: string | null;
  }> = [];

  for (let i = 0; i < conditionIds.length; i += 50) {
    const chunk = conditionIds.slice(i, i + 50);
    const { data } = await supabase
      .from("markets")
      .select("condition_id,slug,event_slug,resolved_outcome")
      .in("condition_id", chunk);
    if (data) marketRows.push(...data);
  }

  const byConditionId = new Map(marketRows.map((m) => [m.condition_id, m]));
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

async function fetchPositionsByStatus(status: "OPEN" | "CLOSED") {
  const pageSize = 1000;
  const rows: Position[] = [];
  const orderColumn = status === "OPEN" ? "opened_at" : "closed_at";

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("paper_positions")
      .select("*")
      .eq("status", status)
      .order(orderColumn, { ascending: false, nullsFirst: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data as Position[]) || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return rows;
}

function PaperPage() {
  const [open, setOpen] = useState<Position[]>([]);
  const [closed, setClosed] = useState<Position[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");
  const [filterResult, setFilterResult] = useState<"all" | "win" | "loss">("all");
  const [pnlPage, setPnlPage] = useState(1);
  const PNL_PAGE_SIZE = 20;
  const [tradesPage, setTradesPage] = useState(1);
  const TRADES_PAGE_SIZE = 50;
  const [lastBotRun, setLastBotRun] = useState<string | null>(null);
  const [lastScanRun, setLastScanRun] = useState<string | null>(null);
  const loadSeq = useRef(0);
  const hasLoaded = useRef(false);

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

  async function load() {
    const seq = ++loadSeq.current;
    if (!hasLoaded.current) setLoading(true);
    setLoadError(null);

    try {
      const [o, c, { data: cfg }, { data: lastPos }, { data: lastScan }] = await Promise.all([
        fetchPositionsByStatus("OPEN"),
        fetchPositionsByStatus("CLOSED"),
        supabase.from("paper_bot_config").select("*").eq("id", 1).single(),
        supabase.from("paper_positions").select("opened_at,closed_at").order("opened_at", { ascending: false }).limit(1),
        supabase.from("tracked_wallets").select("last_scanned_at").order("last_scanned_at", { ascending: false, nullsFirst: false }).limit(1),
      ]);

      if (seq !== loadSeq.current) return;
      setOpen(o);
      setClosed(c);
      setConfig(cfg as Config | null);
      const lp = (lastPos as any[])?.[0];
      setLastBotRun(lp?.closed_at && new Date(lp.closed_at) > new Date(lp.opened_at) ? lp.closed_at : lp?.opened_at ?? null);
      setLastScanRun((lastScan as any[])?.[0]?.last_scanned_at ?? null);
      hasLoaded.current = true;
      setLoading(false);

      Promise.all([attachMarketData(o), attachMarketData(c.slice(0, 120))])
        .then(([openWithMarkets, recentClosedWithMarkets]) => {
          if (seq !== loadSeq.current) return;
          setOpen(openWithMarkets);
          const enrichedById = new Map(recentClosedWithMarkets.map((p) => [p.id, p]));
          setClosed((prev) => prev.map((p) => enrichedById.get(p.id) ?? p));
        })
        .catch(() => undefined);
    } catch (e: any) {
      if (seq !== loadSeq.current) return;
      hasLoaded.current = true;
      setLoadError(e?.message ?? "טעינת הדשבורד נכשלה");
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    const channel = supabase
      .channel("paper_positions_dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "paper_positions" }, () => {
        window.setTimeout(() => void load(), 250);
      })
      .subscribe();

    return () => {
      clearInterval(t);
      void supabase.removeChannel(channel);
    };
  }, []);

  async function runNow() {
    setRunning(true);
    try {
      const { data: j, error } = await supabase.functions.invoke("paper-execute");
      if (error) throw error;
      toast.success(`Opened ${j.opened} · Closed ${j.closed} · Skipped ${j.skipped}`);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRunning(false);
    }
  }

  // Stats
  const totalOpenValue = open.reduce((s, p) => s + (p.current_price ?? p.entry_price) * Number(p.shares), 0);
  const totalOpenCost = open.reduce((s, p) => s + Number(p.size_usd), 0);
  const openPnl = totalOpenValue - totalOpenCost;
  const closedPnl = closed.reduce((s, p) => s + Number(p.pnl_usd ?? 0), 0);
  const wins = closed.filter((p) => Number(p.pnl_usd ?? 0) > 0).length;
  const losses = closed.filter((p) => Number(p.pnl_usd ?? 0) < 0).length;
  const winRate = wins + losses ? (wins / (wins + losses)) * 100 : 0;
  const last24h = closed.filter((p) => p.closed_at && Date.now() - new Date(p.closed_at).getTime() <= 24 * 3600000);
  const pnl24h = last24h.reduce((s, p) => s + Number(p.pnl_usd ?? 0), 0);
  const wins24h = last24h.filter((p) => Number(p.pnl_usd ?? 0) > 0).length;
  const losses24h = last24h.filter((p) => Number(p.pnl_usd ?? 0) < 0).length;
  const winRate24h = wins24h + losses24h ? (wins24h / (wins24h + losses24h)) * 100 : 0;
  const allTrades = [...open, ...closed].sort((a, b) => {
    const ta = new Date(a.closed_at ?? a.opened_at).getTime();
    const tb = new Date(b.closed_at ?? b.opened_at).getTime();
    return tb - ta;
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <div className="mx-auto max-w-6xl p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold">🤖 Paper Bot</h1>
            <p className="text-sm text-muted-foreground">קונה ומוכר אוטומטית לפי סיגנלי לווייתנים</p>
            <p className="text-xs text-muted-foreground mt-1">
              🤖 ריצת בוט אחרונה: <b>{fmtTime(lastBotRun)}</b> · 🐋 סריקת ארנקים אחרונה: <b>{fmtTime(lastScanRun)}</b>
            </p>
          </div>
          <Button onClick={runNow} disabled={running} size="sm">
            <RefreshCw className={`h-4 w-4 mr-1 ${running ? "animate-spin" : ""}`} />
            הפעל עכשיו
          </Button>
        </div>

        {/* Status banner */}
        {loadError && (
          <Card>
            <CardContent className="p-4 text-sm text-destructive">
              שגיאה בטעינת הדשבורד: {loadError}
            </CardContent>
          </Card>
        )}

        {/* Status banner */}
        {config && (
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-4 text-sm">
              <Badge variant={config.enabled ? "default" : "destructive"}>
                <Power className="h-3 w-3 mr-1" /> {config.enabled ? "פעיל" : "כבוי"}
              </Badge>
              <span>💰 תקציב התחלתי: <b className="text-primary">${Number(config.starting_budget_usd ?? 1000).toFixed(0)}</b></span>
              <span>Min score: <b>{config.min_score}</b></span>
              <span className="text-muted-foreground">TP/SL דינמי: low +40/-20 · mid +20/-12 · high +12/-8</span>
              <span>Time-stop: <b>24h/12h/6h</b></span>
              <span>Trailing→BE: <b className="text-blue-500">+{config.breakeven_trigger_pct}%</b></span>
              <span>Whale-reversal: <b className={config.whale_reversal_exit ? "text-green-500" : "text-muted-foreground"}>{config.whale_reversal_exit ? "ON" : "OFF"}</b></span>
              <span className="text-muted-foreground">Sizing: 75-84→$30 · 85-94→$60 · 95+→$90</span>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(() => {
            const budget = Number(config?.starting_budget_usd ?? 1000);
            const totalPnl = openPnl + closedPnl;
            const equity = budget + totalPnl;
            const available = equity - totalOpenCost;
            const totalPct = (totalPnl / budget) * 100;
            return (
              <>
                <StatCard label={`💵 זמין (מתוך $${budget.toFixed(0)})`} value={`$${available.toFixed(2)}`} color={available < budget ? "text-orange-500" : ""} />
                <StatCard label={`🔒 נעול בפוזיציות (${open.length})`} value={`$${totalOpenCost.toFixed(2)}`} color="text-muted-foreground" />
                <StatCard label="הון כולל (Equity)" value={`$${equity.toFixed(2)} (${totalPct >= 0 ? "+" : ""}${totalPct.toFixed(1)}%)`} color={pnlColor(totalPnl)} />
                <StatCard label={`סגור: ${closed.length} · Win ${winRate.toFixed(0)}%`} value={`${closedPnl >= 0 ? "+" : ""}$${closedPnl.toFixed(2)}`} color={pnlColor(closedPnl)} />
              </>
            );
          })()}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="כל הזמנים · עסקאות" value={`${closed.length} סגורות · ${open.length} פתוחות`} />
          <StatCard label="כל הזמנים · Win" value={`${winRate.toFixed(1)}% (${wins}/${wins + losses})`} color={pnlColor(closedPnl)} />
          <StatCard label="24 שעות · עסקאות" value={`${last24h.length} סגורות`} />
          <StatCard label={`24 שעות · Win ${winRate24h.toFixed(1)}%`} value={`${pnl24h >= 0 ? "+" : ""}$${pnl24h.toFixed(2)}`} color={pnlColor(pnl24h)} />
        </div>

        <Tabs defaultValue="pnl">
          <TabsList>
            <TabsTrigger value="pnl">📊 רווח והפסד</TabsTrigger>
            <TabsTrigger value="trades">כל העסקאות ({allTrades.length})</TabsTrigger>
            <TabsTrigger value="open">פתוחות ({open.length})</TabsTrigger>
            <TabsTrigger value="closed">סגורות ({closed.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pnl">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">טבלת רווח והפסד</CardTitle></CardHeader>
              <CardContent className="p-0">
                {(() => {
                  const all = allTrades;
                  const totalPages = Math.max(1, Math.ceil(all.length / PNL_PAGE_SIZE));
                  const curPage = Math.min(pnlPage, totalPages);
                  const pageItems = all.slice((curPage - 1) * PNL_PAGE_SIZE, curPage * PNL_PAGE_SIZE);
                  return (
                    <>
                      {/* Desktop table */}
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
                                      <a
                                        href={marketUrl(p)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center justify-center text-primary hover:underline"
                                        title="פתח בפולימרקט / חיפוש רשמי"
                                      >
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

                      {/* Mobile cards */}
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
                                  <a
                                    href={marketUrl(p)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-primary hover:underline"
                                  >
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

          <TabsContent value="trades">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">תיעוד כל הקניות והמכירות</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {(() => {
                  const totalPages = Math.max(1, Math.ceil(allTrades.length / TRADES_PAGE_SIZE));
                  const curPage = Math.min(tradesPage, totalPages);
                  const pageItems = allTrades.slice((curPage - 1) * TRADES_PAGE_SIZE, curPage * TRADES_PAGE_SIZE);
                  return (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[1100px] text-sm">
                          <thead className="bg-muted/50 text-xs text-muted-foreground">
                            <tr>
                              <th className="text-right p-2">שוק</th>
                              <th className="text-center p-2">סטטוס</th>
                              <th className="text-center p-2">זמן קנייה</th>
                              <th className="text-center p-2">מחיר קנייה</th>
                              <th className="text-center p-2">סכום</th>
                              <th className="text-center p-2">כמות</th>
                              <th className="text-center p-2">זמן מכירה</th>
                              <th className="text-center p-2">מחיר מכירה/נוכחי</th>
                              <th className="text-center p-2">שווי יציאה</th>
                              <th className="text-center p-2">P&L</th>
                              <th className="text-center p-2">סיבת יציאה</th>
                              <th className="text-center p-2">קישור</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allTrades.length === 0 && (
                              <tr><td colSpan={12} className="p-4 text-center text-muted-foreground">אין עסקאות עדיין</td></tr>
                            )}
                            {pageItems.map((p) => {
                              const isOpen = p.status === "OPEN";
                              const exitOrCurrent = isOpen ? (p.current_price ?? p.entry_price) : (p.exit_price ?? p.entry_price);
                              const exitValue = Number(exitOrCurrent) * Number(p.shares);
                              const pnlUsd = isOpen
                                ? (Number(exitOrCurrent) - Number(p.entry_price)) * Number(p.shares)
                                : Number(p.pnl_usd ?? 0);
                              return (
                                <tr key={p.id} className="border-t">
                                  <td className="p-2 text-right max-w-[320px]">
                                    <div className="truncate font-medium">{p.title || p.condition_id.slice(0, 12)}</div>
                                    <div className="text-xs text-muted-foreground truncate">{p.outcome || "—"}</div>
                                  </td>
                                  <td className="p-2 text-center"><Badge variant={isOpen ? "default" : "outline"} className="text-xs">{isOpen ? "פתוחה" : "סגורה"}</Badge></td>
                                  <td className="p-2 text-center whitespace-nowrap">{fmtDateTime(p.opened_at)}</td>
                                  <td className="p-2 text-center">{Number(p.entry_price).toFixed(3)}</td>
                                  <td className="p-2 text-center">${Number(p.size_usd).toFixed(2)}</td>
                                  <td className="p-2 text-center">{Number(p.shares).toFixed(2)}</td>
                                  <td className="p-2 text-center whitespace-nowrap">{fmtDateTime(p.closed_at)}</td>
                                  <td className="p-2 text-center">{Number(exitOrCurrent).toFixed(3)}</td>
                                  <td className="p-2 text-center">${exitValue.toFixed(2)}</td>
                                  <td className={`p-2 text-center font-medium ${pnlColor(pnlUsd)}`}>{pnlUsd >= 0 ? "+" : ""}${pnlUsd.toFixed(2)}</td>
                                  <td className="p-2 text-center text-xs text-muted-foreground">{isOpen ? "עדיין פתוחה" : (p.exit_reason || "—")}</td>
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
                      {allTrades.length > TRADES_PAGE_SIZE && (
                        <div className="flex items-center justify-center gap-2 p-3 border-t">
                          <Button size="sm" variant="outline" disabled={curPage <= 1} onClick={() => setTradesPage(curPage - 1)}>הקודם</Button>
                          <span className="text-xs text-muted-foreground">עמוד {curPage} מתוך {totalPages}</span>
                          <Button size="sm" variant="outline" disabled={curPage >= totalPages} onClick={() => setTradesPage(curPage + 1)}>הבא</Button>
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
                אין פוזיציות פתוחות כרגע. הבוט מחכה לסיגנל STRONG_BUY הבא.
              </CardContent></Card>
            )}
            {open.map((p) => <PositionCard key={p.id} p={p} isOpen />)}
          </TabsContent>

          <TabsContent value="closed" className="space-y-3">
            <Card>
              <CardContent className="p-3 flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">מתאריך</label>
                  <input
                    type="date"
                    value={filterFrom}
                    onChange={(e) => setFilterFrom(e.target.value)}
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">עד תאריך</label>
                  <input
                    type="date"
                    value={filterTo}
                    onChange={(e) => setFilterTo(e.target.value)}
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  />
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
              <Card><CardContent className="p-6 text-center text-muted-foreground">
                אין פוזיציות שתואמות את הפילטר.
              </CardContent></Card>
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
          </CardTitle>
          <div className="text-right shrink-0">
            <div className={`text-lg font-bold ${pnlColor(livePnlPct)}`}>
              {livePnlPct >= 0 ? "+" : ""}{livePnlPct.toFixed(1)}%
            </div>
            <div className={`text-xs ${pnlColor(livePnlUsd)}`}>
              {livePnlUsd >= 0 ? "+" : ""}${livePnlUsd.toFixed(2)}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Reason — bullets, without wallet addresses */}
        <div className="bg-muted/50 rounded p-2">
          <div className="text-xs text-muted-foreground mb-1">למה נכנסנו:</div>
          <ul className="list-disc pr-5 space-y-0.5 text-sm">
            {(() => {
              // Strip wallet addresses (0x… 40-hex) and split into bullets
              const cleaned = (p.reason || "")
                .replace(/0x[a-fA-F0-9]{40}/g, "")
                .replace(/\s{2,}/g, " ")
                .trim();
              const parts = cleaned
                .split(/[•·\n]|(?:\s\|\s)|(?:,\s)/)
                .map((s) => s.trim())
                .filter((s) => s.length > 1);
              return (parts.length ? parts : [cleaned]).map((b, i) => <li key={i}>{b}</li>);
            })()}
          </ul>
        </div>

        {/* Prices */}
        <div className="grid grid-cols-4 gap-2 text-xs">
          <Field label="כניסה" value={Number(p.entry_price).toFixed(3)} />
          <Field label="נוכחי" value={livePrice.toFixed(3)} bold />
          <Field label="TP" value={Number(p.tp_price).toFixed(3)} color="text-green-500" />
          <Field
            label={p.breakeven_moved ? "SL (BE🔒)" : "SL"}
            value={Number(p.sl_price).toFixed(3)}
            color={p.breakeven_moved ? "text-blue-500" : "text-red-500"}
          />
        </div>

        {/* Exit strategy */}
        <div className="bg-muted/30 rounded p-2 text-xs">
          <div className="text-muted-foreground mb-1">יציאה:</div>
          <div>{p.exit_strategy}</div>
        </div>

        {/* Meta */}
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
              <Badge variant={Number(p.pnl_usd ?? 0) >= 0 ? "default" : "destructive"} className="text-xs">
                {p.exit_reason}
              </Badge>
            </>
          )}
          {p.condition_id && (
            <a
              href={marketUrl(p)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
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
