import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ExternalLink, RefreshCw } from "lucide-react";
import { TopNav } from "@/components/TopNav";

type Row = {
  address: string;
  label: string | null;
  is_active: boolean;
  quality_tier: string;
  quality_score: number;
  auto_disabled_reason: string | null;
  perf?: {
    closed_positions: number;
    win_rate: number | null;
    avg_roi_pct: number | null;
    total_pnl_usd: number;
    unique_markets: number;
    last_30d_trades: number;
  } | null;
};

const TIER_COLORS: Record<string, string> = {
  S: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  A: "bg-green-500/20 text-green-400 border-green-500/40",
  B: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  C: "bg-gray-500/20 text-gray-400 border-gray-500/40",
  EXCLUDED: "bg-red-500/20 text-red-400 border-red-500/40",
  UNRATED: "bg-muted text-muted-foreground border-border",
};

export const Route = createFileRoute("/wallets")({
  head: () => ({
    meta: [
      { title: "Tracked Whales — Polymarket Bot" },
      { name: "description", content: "Polymarket whale wallets ranked by quality." },
    ],
  }),
  component: WalletsPage,
});

function WalletsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  async function load() {
    const { data: wallets } = await supabase
      .from("tracked_wallets")
      .select("address,label,is_active,quality_tier,quality_score,auto_disabled_reason");
    const { data: perf } = await supabase
      .from("whale_performance")
      .select(
        "wallet_address,closed_positions,win_rate,avg_roi_pct,total_pnl_usd,unique_markets,last_30d_trades",
      );
    const perfMap = new Map((perf || []).map((p: any) => [p.wallet_address, p]));
    const merged: Row[] = (wallets || []).map((w: any) => ({
      ...w,
      perf: perfMap.get(w.address) || null,
    }));
    merged.sort((a, b) => Number(b.quality_score) - Number(a.quality_score));
    setRows(merged);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function refresh() {
    setRefreshing(true);
    setRefreshMsg("מעדכן… זה יכול לקחת 1-3 דקות");
    try {
      const { data: j, error } = await supabase.functions.invoke("refresh-whale-performance");
      if (error) throw error;
      setRefreshMsg(`עודכנו ${j.processed} ארנקים`);
      await load();
    } catch (e: any) {
      setRefreshMsg(`שגיאה: ${e.message}`);
    } finally {
      setRefreshing(false);
    }
  }

  async function scanNew() {
    setScanning(true);
    setRefreshMsg("סורק לוויתנים חדשים…");
    try {
      const { data: j, error } = await supabase.functions.invoke("discover-whales", {
        body: { wantNew: 20 },
      });
      if (error) throw error;
      setRefreshMsg(`נוספו ${j.inserted} לוויתנים חדשים. מחשב איכות…`);
      const { data: r } = await supabase.functions.invoke("refresh-whale-performance");
      setRefreshMsg(`נוספו ${j.inserted} חדשים, דורגו ${r?.processed ?? 0} ארנקים`);
      await load();
    } catch (e: any) {
      setRefreshMsg(`שגיאה: ${e.message}`);
    } finally {
      setScanning(false);
    }
  }

  const tierCounts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.quality_tier] = (acc[r.quality_tier] || 0) + 1;
    return acc;
  }, {});

  const [tab, setTab] = useState("passing");
  const passing = rows.filter((r) => r.is_active && ["S", "A", "B"].includes(r.quality_tier));
  const other = rows.filter(
    (r) => !passing.includes(r) && r.quality_tier !== "EXCLUDED",
  );
  const visible = tab === "passing" ? passing : other;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <div className="mx-auto max-w-6xl p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold">🐋 לווייתנים</h1>
            <p className="text-sm text-muted-foreground">
              עוברים: {passing.length} · אחר: {other.length}
              {tierCounts.S ? ` · S:${tierCounts.S}` : ""}
              {tierCounts.A ? ` · A:${tierCounts.A}` : ""}
              {tierCounts.B ? ` · B:${tierCounts.B}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={scanNew} disabled={scanning || refreshing} size="sm" variant="outline">
              <RefreshCw className={`h-4 w-4 mr-1 ${scanning ? "animate-spin" : ""}`} />
              סרוק 20 חדשים
            </Button>
            <Button onClick={refresh} disabled={refreshing || scanning} size="sm">
              <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
              חישוב איכות
            </Button>
          </div>
        </div>

        {refreshMsg && <p className="text-xs text-muted-foreground">{refreshMsg}</p>}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="passing">עוברים ({passing.length})</TabsTrigger>
            <TabsTrigger value="other">אחר ({other.length})</TabsTrigger>
          </TabsList>
          <TabsContent value={tab}>
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                {loading ? (
                  <p className="p-4 text-sm text-muted-foreground">טוען…</p>
                ) : visible.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">אין נתונים. לחץ "חישוב איכות".</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="text-right p-2">Tier</th>
                        <th className="text-right p-2">Score</th>
                        <th className="text-right p-2">Label</th>
                        <th className="text-right p-2">סגורות</th>
                        <th className="text-right p-2">Win%</th>
                        <th className="text-right p-2">ROI</th>
                        <th className="text-right p-2">PnL</th>
                        <th className="text-right p-2">שווקים</th>
                        <th className="text-right p-2">30d</th>
                        <th className="text-right p-2">סיבה</th>
                        <th className="text-right p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((w) => {
                        const p = w.perf;
                        return (
                          <tr key={w.address} className="border-t">
                            <td className="p-2">
                              <Badge variant="outline" className={`text-xs ${TIER_COLORS[w.quality_tier] || ""}`}>
                                {w.quality_tier}
                              </Badge>
                            </td>
                            <td className="p-2 font-mono">{Number(w.quality_score).toFixed(1)}</td>
                            <td className="p-2 font-medium max-w-[140px] truncate">
                              <a
                                href={`https://polymarket.com/profile/${w.address}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline"
                                title={w.address}
                              >
                                {w.label || w.address.slice(0, 8)}
                              </a>
                            </td>
                            <td className="p-2">{p?.closed_positions ?? "—"}</td>
                            <td className="p-2">
                              {p?.win_rate != null ? `${(Number(p.win_rate) * 100).toFixed(0)}%` : "—"}
                            </td>
                            <td className="p-2">
                              {p?.avg_roi_pct != null ? `${Number(p.avg_roi_pct).toFixed(1)}%` : "—"}
                            </td>
                            <td className="p-2">
                              {p?.total_pnl_usd != null
                                ? `$${Math.round(Number(p.total_pnl_usd)).toLocaleString()}`
                                : "—"}
                            </td>
                            <td className="p-2">{p?.unique_markets ?? "—"}</td>
                            <td className="p-2">{p?.last_30d_trades ?? "—"}</td>
                            <td className="p-2 text-xs text-muted-foreground max-w-[160px] truncate">
                              {w.auto_disabled_reason || "—"}
                            </td>
                            <td className="p-2">
                              <a
                                href={`https://polymarket.com/profile/${w.address}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                              >
                                PM <ExternalLink className="h-3 w-3" />
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
