import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  ssr: false,
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

function timeLeft(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "פג";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function PaperPage() {
  const [open, setOpen] = useState<Position[]>([]);
  const [closed, setClosed] = useState<Position[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");
  const [filterResult, setFilterResult] = useState<"all" | "win" | "loss">("all");
  const [pnlPage, setPnlPage] = useState(1);
  const PNL_PAGE_SIZE = 20;
  const [lastBotRun, setLastBotRun] = useState<string | null>(null);
  const [lastScanRun, setLastScanRun] = useState<string | null>(null);

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
    const [{ data: o }, { data: c }, { data: cfg }, { data: lastPos }, { data: lastScan }] = await Promise.all([
      supabase.from("paper_positions").select("*").eq("status", "OPEN").order("opened_at", { ascending: false }),
      supabase.from("paper_positions").select("*").eq("status", "CLOSED").order("closed_at", { ascending: false }).limit(500),
      supabase.from("paper_bot_config").select("*").eq("id", 1).single(),
      supabase.from("paper_positions").select("opened_at,closed_at").order("opened_at", { ascending: false }).limit(1),
      supabase.from("tracked_wallets").select("last_scanned_at").order("last_scanned_at", { ascending: false, nullsFirst: false }).limit(1),
    ]);
    setOpen((o as Position[]) || []);
    const closedFiltered = ((c as Position[]) || []).filter((p) => Number(p.pnl_usd ?? 0) !== 0);
    setClosed(closedFiltered);
    setConfig(cfg as Config | null);
    const lp = (lastPos as any[])?.[0];
    setLastBotRun(lp?.closed_at && new Date(lp.closed_at) > new Date(lp.opened_at) ? lp.closed_at : lp?.opened_at ?? null);
    setLastScanRun((lastScan as any[])?.[0]?.last_scanned_at ?? null);
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
  const winRate = closed.length ? (wins / closed.length) * 100 : 0;

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
                              <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">אין נתונים עדיין</td></tr>
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
              <Badge variant={Number(p.pnl_usd ?? 0) >= 0 ? "default" : "destructive"} className="text-xs">
                {p.exit_reason}
              </Badge>
            </>
          )}
          {p.condition_id && (
            <a
              href={`https://polymarket.com/market/${p.condition_id}`}
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
