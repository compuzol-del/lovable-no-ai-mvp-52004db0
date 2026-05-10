## מטרה

להוסיף **בוט אמיתי (Real Money)** לצד ה-Paper Bot, עם דשבורד נפרד, סכומים קטנים, פילטרים מוקשחים, daily loss limit, ו-Dry Run עד שיגיעו מפתחות Polymarket.

ה-Paper Bot הקיים **לא ישתנה בכלל** — קוד, הגדרות, וטבלאות נשארים זהים.

---

## שינויי DB (migration)

טבלאות חדשות זהות במבנה ל-Paper:

- **`real_bot_config`** (singleton id=1) — אותם שדות כמו `paper_bot_config` + שדות חדשים:
  - `dry_run boolean default true`
  - `daily_loss_limit_usd numeric default 50`
  - `daily_halt_until timestamptz` — מתעדכן אוטומטית כשנפרץ הסף
  - ערכי ברירת מחדל מוקשחים: `min_score=80`, `min_market_volume_usd=20000`, `min_market_liquidity_usd=5000`, `max_open_total=8`, `max_open_per_event=2`
- **`real_positions`** — מבנה זהה ל-`paper_positions` + `order_id text` (ID מ-Polymarket אחרי ביצוע אמיתי).
- RLS: public read, writes via service role בלבד (כמו ה-Paper).

## דשבורד חדש `/real`

- שכפול 1:1 של `src/routes/paper.tsx` → `src/routes/real.tsx`, קורא מ-`real_positions` / `real_bot_config`.
- 3 לשוניות פנימיות זהות (פתוחות / סגורות / קונפיג) + לינקים ל-Polymarket.
- באנר אדום למעלה: **"💵 Real Money — Dry Run"** או **"💵 Real Money — LIVE"** לפי הסטטוס.
- מציג: Daily PnL היום, Daily Loss Limit, האם הבוט מושהה עד מחר.
- טאב חדש ב-`TopNav`: **💵 Real Bot** ליד ה-Paper Bot.

## Hook חדש `real-execute`

שכפול של `paper-execute` עם השינויים הבאים בלבד:

**סכומי הימור:**
- 75-84 → $10 · 85-94 → $20 · 95+ → $30

**Daily Loss Kill-Switch:**
- לפני כל ריצה: סכום `pnl_usd` מכל הפוזיציות שנסגרו היום (00:00 UTC ואילך).
- אם ≤ −$50 → לעדכן `daily_halt_until = tomorrow 00:00 UTC`, לדלג על פתיחות חדשות (סגירות של פוזיציות פתוחות ממשיכות לרוץ).
- אם `now() < daily_halt_until` → לדלג על פתיחות.

**פילטרים מוקשחים נוספים (מעבר למה שכבר ב-Paper):**
- `min_score ≥ 80`
- `min_market_volume_usd ≥ 20000`
- `min_market_liquidity_usd ≥ 5000`
- `max_open_total = 8`
- מחיר כניסה בין 0.05 ל-0.85
- Slippage guard: אם המחיר הנוכחי > 1.5% מעל `avg_price` של הסיגנל → דלג
- Whale-reversal exit: ≥1 sell (במקום ≥2)

**Dry Run:**
- אם `dry_run=true` → רק כותב את הפוזיציה ל-`real_positions` עם `order_id=null`. אין שום קריאת רשת ל-Polymarket לביצוע.
- אם `dry_run=false` → שולח limit order ל-Polymarket CLOB דרך `POLYMARKET_*` secrets.

**עמלות:**
- חישוב PnL נטו עם הפחתת ~2% עמלת זכייה.

## מפתחות שצריך להביא מ-Polymarket

(אבקש דרך `add_secret` רק אחרי שתאשר את התוכנית)

1. `POLYMARKET_PRIVATE_KEY` — private key של ארנק Polygon שמחובר ל-Polymarket
2. `POLYMARKET_API_KEY`
3. `POLYMARKET_API_SECRET`
4. `POLYMARKET_API_PASSPHRASE`

איך משיגים: polymarket.com → Profile → Settings → API Keys → Create API Key. הארנק חייב USDC.e על Polygon ו-approval חתום ל-Polymarket Exchange.

## Cron

תצטרך להוסיף ידנית (אתן לך SQL מוכן בסוף):
```
SELECT cron.schedule('real-execute', '*/2 * * * *', ...);
```

## רצף עבודה

1. Migration לטבלאות `real_bot_config` + `real_positions`.
2. יצירת `src/routes/real.tsx` (משכפל את `/paper`).
3. עדכון `TopNav.tsx` עם הטאב החדש.
4. יצירת `src/routes/api/public/hooks/real-execute.ts` עם הסכומים, ה-kill switch, וה-Dry Run mode.
5. עדכון `/logic` בהסבר על הבוט האמיתי.
6. אחרי שתאשר ותביא את 4 המפתחות → להחליף את ה-Dry Run בקריאות אמיתיות ל-Polymarket CLOB.
