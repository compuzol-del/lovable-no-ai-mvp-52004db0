# Polymarket Compliant Execution Worker

This is a **local Node.js worker** that runs on YOUR computer (a region where Polymarket is allowed).
It is the only place that holds Polymarket API keys + the wallet private key.

## Architecture

```
Supabase (cloud, US)              Your PC (allowed region)
  scans whales  ────►   intents  ────►  worker
                                          │
                                          ├── geoblock check
                                          └── if OK → CLOB order → report back
```

Supabase never sends orders. It only writes "intents" to a queue. This worker:

1. Calls `https://polymarket.com/api/geoblock` first
2. If `blocked=true` → reports it and skips
3. If `blocked=false` → claims one intent, signs EIP-712, posts to CLOB, reports the order id

## Setup (one time)

```bash
cd worker
cp .env.example .env
# edit .env with your real values
npm install
```

### Required env vars in `worker/.env`

| Var | Where to get it |
|-----|-----------------|
| `SUPABASE_URL` | Same as in your Lovable project |
| `WORKER_SHARED_SECRET` | The secret you added in Lovable Cloud secrets |
| `POLYMARKET_PRIVATE_KEY` | Wallet private key (the one funding your Polymarket account) |
| `POLYMARKET_API_KEY` | Polymarket → Profile → Settings → API Keys |
| `POLYMARKET_API_SECRET` | same |
| `POLYMARKET_API_PASSPHRASE` | same |
| `POLYMARKET_FUNDER_ADDRESS` | Your proxy wallet address on Polymarket |
| `POLYMARKET_SIG_TYPE` | `1` (proxy) or `2` (gnosis safe) — usually `1` |

## Run

```bash
node index.mjs
```

The worker logs every check. Leave it running.

## Run as a service (recommended)

With pm2:
```bash
npm install -g pm2
pm2 start index.mjs --name polymarket-worker
pm2 save
pm2 startup    # follow the printed command to enable on boot
```

## After confirming the worker works → DELETE these secrets from Lovable Cloud

(They no longer belong on the cloud — only on your PC):

- `POLYMARKET_PRIVATE_KEY`
- `POLYMARKET_API_KEY`
- `POLYMARKET_API_SECRET`
- `POLYMARKET_API_PASSPHRASE`
- `POLYMARKET_FUNDER_ADDRESS`
- `POLYMARKET_SIG_TYPE`
- `POLYMARKET_RELAYER_API_KEY`
- `POLYMARKET_RELAYER_API_KEY_ADDRESS`

Keep only `WORKER_SHARED_SECRET` in Lovable Cloud (the worker uses it too).
