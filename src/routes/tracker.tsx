import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/tracker")({
  head: () => ({
    meta: [
      { title: "Live Wallet Tracker — Polymarket" },
      { name: "description", content: "Live tracking of high-performing Polymarket wallets and their bot activity." },
      { property: "og:title", content: "Live Wallet Tracker" },
      { property: "og:description", content: "Real-time feed of trades from tracked Polymarket wallets." },
    ],
  }),
  component: TrackerPage,
});

type Wallet = {
  address: string;
  label: string | null;
  is_active: boolean;
  last_scanned_at: string | null;
  alert_threshold_usd: number;
};

type Alert = {
  id: string;
  wallet_address: string;
  wallet_label: string | null;
  side: string | null;
  type: string;
  title: string | null;
  outcome: string | null;
  size: number | null;
  price: number | null;
  usdc_size: number | null;
  ts: string;
  asset?: string | null;
  condition_id?: string | null;
  transaction_hash?: string;
  timestamp_unix?: number;
  raw?: any;
};

function typeVariant(t: string): "default" | "secondary" | "destructive" | "outline" {
  const u = t.toUpperCase();
  if (u === "BUY") return "default";
  if (u === "REDEEM") return "destructive";
  if (u === "YIELD" || u === "REWARD") return "secondary";
  return "outline";
}

function TrackerPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [minUsd, setMinUsd] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<Alert | null>(null);

  async function load() {
    const [{ data: w }, { data: a }] = await Promise.all([
      supabase.from("tracked_wallets").select("*").order("created_at", { ascending: true }),
      supabase.from("trade_alerts").select("*").order("ts", { ascending: false }).limit(100),
    ]);
    setWallets((w as Wallet[]) || []);
    setAlerts((a as Alert[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("trade_alerts_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trade_alerts" },
        (payload) => setAlerts((prev) => [payload.new as Alert, ...prev].slice(0, 100)),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function triggerScan() {
    setScanning(true);
    try {
      await fetch("/api/public/hooks/scan-wallets", { method: "POST" });
      await load();
    } finally {
      setScanning(false);
    }
  }

  const filtered = alerts.filter((a) => (a.usdc_size ?? 0) >= minUsd);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold">Live Wallet Tracker</h1>
            <p className="text-sm text-muted-foreground">מעקב חי אחרי planktonXD ו-cohort</p>
          </div>
          <div className="flex gap-2">
            <Link to="/signals">
              <Button variant="outline" size="sm">🐋 Signals</Button>
            </Link>
            <Button onClick={triggerScan} disabled={scanning} size="sm">
              {scanning ? "סורק..." : "סרוק עכשיו"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ארנקים במעקב ({wallets.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {wallets.map((w) => (
              <div key={w.address} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                <div>
                  <div className="font-medium">{w.label || "—"}</div>
                  <div className="font-mono text-xs text-muted-foreground">{w.address}</div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>סף: ${w.alert_threshold_usd}</div>
                  <div>נסרק: {w.last_scanned_at ? new Date(w.last_scanned_at).toLocaleString("he-IL") : "אף פעם"}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">פיד חי ({filtered.length} מתוך {alerts.length})</CardTitle>
            <div className="flex items-center gap-2 text-xs">
              <label>סף $:</label>
              <input
                type="number"
                value={minUsd}
                onChange={(e) => setMinUsd(Number(e.target.value) || 0)}
                className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">טוען...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                אין טריידים עדיין. לחץ "סרוק עכשיו" כדי למשוך את הראשונים.
              </p>
            ) : (
              <div className="space-y-2">
                {filtered.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelected(a)}
                    className="flex w-full items-start justify-between gap-2 rounded-md border border-border p-3 text-right text-sm transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <Badge variant={typeVariant(a.side || a.type)}>
                          {a.side || a.type}
                        </Badge>
                        <span className="truncate font-medium">{a.title || "—"}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {a.outcome} · {a.wallet_label}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      <div className="font-mono font-medium">${(a.usdc_size ?? 0).toFixed(2)}</div>
                      <div className="text-muted-foreground">@ {(a.price ?? 0).toFixed(3)}</div>
                      <div className="text-muted-foreground">{new Date(a.ts).toLocaleString("he-IL")}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {selected && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2">
                  <Badge variant={typeVariant(selected.side || selected.type)}>
                    {selected.side || selected.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground uppercase">{selected.type}</span>
                </div>
                <SheetTitle className="text-left">{selected.title || "—"}</SheetTitle>
                <SheetDescription className="text-left">
                  {selected.outcome ? `Outcome: ${selected.outcome}` : "פרטי פעולה"}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground">סכום (USDC)</div>
                    <div className="mt-1 font-mono text-base font-semibold">
                      ${(selected.usdc_size ?? 0).toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground">מחיר</div>
                    <div className="mt-1 font-mono text-base font-semibold">
                      {(selected.price ?? 0).toFixed(4)}
                    </div>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground">כמות (Shares)</div>
                    <div className="mt-1 font-mono text-base font-semibold">
                      {(selected.size ?? 0).toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground">זמן</div>
                    <div className="mt-1 text-xs font-medium">
                      {new Date(selected.ts).toLocaleString("he-IL")}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 rounded-md border border-border p-3">
                  <div className="text-xs font-semibold text-muted-foreground">שוק</div>
                  <div className="space-y-1 text-xs">
                    <div>
                      <span className="text-muted-foreground">Title: </span>
                      <span className="font-medium">{selected.title || "—"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Outcome: </span>
                      <span className="font-medium">{selected.outcome || "—"}</span>
                    </div>
                    {selected.condition_id && (
                      <div className="break-all">
                        <span className="text-muted-foreground">Condition: </span>
                        <span className="font-mono">{selected.condition_id}</span>
                      </div>
                    )}
                    {selected.asset && (
                      <div className="break-all">
                        <span className="text-muted-foreground">Asset: </span>
                        <span className="font-mono">{selected.asset}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2 rounded-md border border-border p-3">
                  <div className="text-xs font-semibold text-muted-foreground">ארנק</div>
                  <div className="text-xs">
                    <div className="font-medium">{selected.wallet_label || "—"}</div>
                    <div className="break-all font-mono text-muted-foreground">
                      {selected.wallet_address}
                    </div>
                  </div>
                </div>

                {selected.transaction_hash && (
                  <a
                    href={`https://polygonscan.com/tx/${selected.transaction_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block break-all rounded-md border border-border p-3 text-xs hover:bg-muted/50"
                  >
                    <div className="text-muted-foreground">Transaction</div>
                    <div className="mt-1 font-mono text-primary">{selected.transaction_hash} ↗</div>
                  </a>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
