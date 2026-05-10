// Polymarket compliant execution worker
// Runs on YOUR PC. Pulls intents from Supabase, checks geoblock, places CLOB orders.
import "dotenv/config";
import { Wallet } from "@ethersproject/wallet";
import { ClobClient, OrderType, Side } from "@polymarket/clob-client";

const {
  SUPABASE_URL,
  WORKER_SHARED_SECRET,
  POLYMARKET_PRIVATE_KEY,
  POLYMARKET_API_KEY,
  POLYMARKET_API_SECRET,
  POLYMARKET_API_PASSPHRASE,
  POLYMARKET_FUNDER_ADDRESS,
  POLYMARKET_SIG_TYPE,
  WORKER_ID = "home-pc",
  POLL_INTERVAL_MS = "10000",
} = process.env;

const required = {
  SUPABASE_URL, WORKER_SHARED_SECRET, POLYMARKET_PRIVATE_KEY,
  POLYMARKET_API_KEY, POLYMARKET_API_SECRET, POLYMARKET_API_PASSPHRASE,
};
for (const [k, v] of Object.entries(required)) {
  if (!v) { console.error(`❌ missing env: ${k}`); process.exit(1); }
}

const FN_BASE = `${SUPABASE_URL}/functions/v1`;
const HEADERS = {
  "content-type": "application/json",
  "x-worker-secret": WORKER_SHARED_SECRET,
};

function log(...args) { console.log(new Date().toISOString(), ...args); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function checkGeoblock() {
  try {
    const r = await fetch("https://polymarket.com/api/geoblock", {
      headers: { "user-agent": "Mozilla/5.0" },
    });
    const j = await r.json().catch(() => ({}));
    // shape: { blocked: bool, country?: string, ... }
    return {
      blocked: !!j.blocked,
      country: j.country ?? j.region ?? null,
      raw: j,
    };
  } catch (e) {
    log("⚠️ geoblock check failed:", e.message);
    return { blocked: true, country: null, raw: { error: e.message } };
  }
}

async function claimIntent() {
  const r = await fetch(`${FN_BASE}/worker-claim`, {
    method: "POST", headers: HEADERS,
    body: JSON.stringify({ worker_id: WORKER_ID }),
  });
  if (!r.ok) { log("claim failed:", r.status, await r.text()); return null; }
  const j = await r.json();
  return j.intent ?? null;
}

async function reportIntent(payload) {
  const r = await fetch(`${FN_BASE}/worker-report`, {
    method: "POST", headers: HEADERS,
    body: JSON.stringify(payload),
  });
  if (!r.ok) log("report failed:", r.status, await r.text());
}

// Build CLOB client once
const wallet = new Wallet(
  POLYMARKET_PRIVATE_KEY.startsWith("0x") ? POLYMARKET_PRIVATE_KEY : `0x${POLYMARKET_PRIVATE_KEY}`,
);
const creds = {
  key: POLYMARKET_API_KEY,
  secret: POLYMARKET_API_SECRET,
  passphrase: POLYMARKET_API_PASSPHRASE,
};
const sigType = POLYMARKET_SIG_TYPE ? Number(POLYMARKET_SIG_TYPE) : undefined;
const client = new ClobClient(
  "https://clob.polymarket.com",
  137,
  wallet,
  creds,
  sigType,
  POLYMARKET_FUNDER_ADDRESS || undefined,
);

async function placeOrder(intent) {
  const price = Math.round(Number(intent.price) * 1000) / 1000;
  const size = Math.round(Number(intent.shares) * 100) / 100;
  if (size <= 0) throw new Error("size rounded to 0");

  const feeRateBps = Number(await client.getFeeRateBps(intent.token_id));
  const signed = await client.createOrder({
    tokenID: intent.token_id,
    price,
    side: intent.side === "SELL" ? Side.SELL : Side.BUY,
    size,
    feeRateBps,
  });
  const resp = await client.postOrder(signed, OrderType.GTC);
  if (!resp?.success) {
    throw new Error(resp?.errorMsg || resp?.error || "order rejected");
  }
  return resp.orderID ?? resp.orderId ?? null;
}

async function tick() {
  const geo = await checkGeoblock();
  if (geo.blocked) {
    log(`🔴 GEO BLOCKED (${geo.country ?? "?"}) — skipping cycle`);
    await reportIntent({ geo_blocked: true, geo_country: geo.country });
    await sleep(60000);
    return;
  }

  const intent = await claimIntent();
  if (!intent) {
    // no work; just heartbeat that geo is OK
    await reportIntent({ geo_blocked: false, geo_country: geo.country });
    return;
  }

  log(`📥 claimed intent #${intent.id} ${intent.side} ${intent.shares} @ ${intent.price}`);
  try {
    const orderId = await placeOrder(intent);
    log(`✅ executed → order ${orderId}`);
    await reportIntent({
      intent_id: intent.id, status: "EXECUTED", order_id: orderId,
      geo_blocked: false, geo_country: geo.country,
    });
  } catch (e) {
    log(`❌ order failed:`, e.message);
    await reportIntent({
      intent_id: intent.id, status: "FAILED", error: String(e.message ?? e),
      geo_blocked: false, geo_country: geo.country,
    });
  }
}

log(`🚀 worker started · id=${WORKER_ID} · poll=${POLL_INTERVAL_MS}ms`);
const interval = Number(POLL_INTERVAL_MS);
while (true) {
  try { await tick(); } catch (e) { log("tick error:", e.message); }
  await sleep(interval);
}
