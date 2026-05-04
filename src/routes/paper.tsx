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

  async function load() {
    const [{ data: o }, { data: c }, { data: cfg }] = await Promise.all([
      supabase.from("paper_positions").select("*").eq("status", "OPEN").order("opened_at", { ascending: false }),
      supabase.from("paper_positions").select("*").eq("status", "CLOSED").order("closed_at", { ascending: false }).limit(50),
      supabase.from("paper_bot_config").select("*").eq("id", 1).single(),
    ]);
    setOpen((o as Position[]) || []);
    setClosed((c as Position[]) || []);
    setConfig(cfg as Config | null);
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
      const r = await fetch("/api/public/hooks/paper-execute", { method: "POST" });
      const j = await r.json();
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
              <span>Min score: <b>{config.min_score}</b></span>
              <span>TP: <b className="text-green-500">+{config.tp_pct}%</b></span>
              <span>SL: <b className="text-red-500">{config.sl_pct}%</b></span>
              <span>Time-stop: <b>{config.time_stop_hours}h</b></span>
              <span>Trailing→BE: <b className="text-blue-500">+{config.breakeven_trigger_pct}%</b></span>
              <span>Whale-reversal: <b className={config.whale_reversal_exit ? "text-green-500" : "text-muted-foreground"}>{config.whale_reversal_exit ? "ON" : "OFF"}</b></span>
              <span className="text-muted-foreground">Sizing: 75-84→$100 · 85-94→$175 · 95+→$300</span>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="פוזיציות פתוחות" value={open.length.toString()} />
          <StatCard label="P&L פתוח" value={`$${openPnl.toFixed(2)}`} color={pnlColor(openPnl)} />
          <StatCard label="P&L מצטבר (סגור)" value={`$${closedPnl.toFixed(2)}`} color={pnlColor(closedPnl)} />
          <StatCard label="Win rate" value={`${winRate.toFixed(0)}% (${wins}/${closed.length})`} />
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
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-right p-2">שוק</th>
                      <th className="text-right p-2">סטטוס</th>
                      <th className="text-right p-2">Size</th>
                      <th className="text-right p-2">כניסה</th>
                      <th className="text-right p-2">נוכחי/יציאה</th>
                      <th className="text-right p-2">P&L $</th>
                      <th className="text-right p-2">P&L %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...open, ...closed].length === 0 && (
                      <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">אין נתונים עדיין</td></tr>
                    )}
                    {[...open, ...closed].map((p) => {
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
                          <td className="p-2 max-w-[200px] truncate">{p.title || p.condition_id.slice(0, 12)}{p.outcome ? ` · ${p.outcome}` : ""}</td>
                          <td className="p-2"><Badge variant={isOpen ? "default" : "outline"} className="text-xs">{isOpen ? "פתוח" : (p.exit_reason || "סגור")}</Badge></td>
                          <td className="p-2">${Number(p.size_usd).toFixed(0)}</td>
                          <td className="p-2">{Number(p.entry_price).toFixed(3)}</td>
                          <td className="p-2">{Number(price).toFixed(3)}</td>
                          <td className={`p-2 font-medium ${pnlColor(pnlUsd)}`}>{pnlUsd >= 0 ? "+" : ""}${pnlUsd.toFixed(2)}</td>
                          <td className={`p-2 font-medium ${pnlColor(pnlPct)}`}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
            {!loading && closed.length === 0 && (
              <Card><CardContent className="p-6 text-center text-muted-foreground">
                עוד לא נסגרו פוזיציות.
              </CardContent></Card>
            )}
            {closed.map((p) => <PositionCard key={p.id} p={p} isOpen={false} />)}
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
        {/* Reason */}
        <div className="bg-muted/50 rounded p-2">
          <div className="text-xs text-muted-foreground mb-1">למה נכנסנו:</div>
          <div>{p.reason}</div>
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
