## המטרה

לעבור מארכיטקטורה שבה Supabase מנסה לבצע LIVE (ונחסם ע"י Polymarket geoblock) לארכיטקטורה תואמת חוקית: Supabase = "מוח", המחשב הביתי שלך = "יד מבצעת".

## הארכיטקטורה החדשה

```text
┌─────────────────────────┐
│  Supabase (Cloud)       │
│  - scan markets         │
│  - whale signals        │
│  - rank candidates      │
│  - paper bot (כמו היום) │
│  - real-execute:        │
│      DRY RUN בלבד       │
│      → כותב ל-execution_intents
└──────────┬──────────────┘
           │ (polling / pull)
           ▼
┌─────────────────────────┐
│  Worker מקומי (PC שלך)  │
│  Node.js script         │
│  1. geoblock check      │
│  2. אם OK → CLOB order  │
│  3. עדכון intent status │
└─────────────────────────┘
```

## מה ייבנה

### 1. שינויי DB (migration)
- טבלה חדשה **`execution_intents`**:
  - `id`, `created_at`, `position_id` (FK ל-`real_positions`)
  - `token_id`, `price`, `shares`, `side`
  - `status`: `PENDING` / `CLAIMED` / `EXECUTED` / `GEO_BLOCKED` / `FAILED` / `EXPIRED`
  - `claimed_at`, `claimed_by` (worker id)
  - `order_id`, `error`, `geo_country`, `geo_ip`
  - `expires_at` (default +5 דק')
- שדות חדשים ב-`real_bot_config`:
  - `execution_mode` text default `'paper'` — ערכים: `paper` / `live_compliant_only`
  - `last_geo_check_at`, `last_geo_country`, `last_geo_blocked` (boolean)
- פונקציה `claim_next_intent(_worker_id text)` — SECURITY DEFINER, מבצעת `FOR UPDATE SKIP LOCKED`, מחזירה intent אחד במצב PENDING ומסמנת CLAIMED.

### 2. שינוי `real-execute` edge function
- במקום לנסות `placeLiveBuyOrder` ישירות:
  - תמיד יוצר את שורת ה-`real_positions` עם `dry_run=true`/`order_id=null`
  - אם `execution_mode='live_compliant_only'` → גם יוצר שורה ב-`execution_intents` עם status=PENDING
  - מסיר לחלוטין את הקריאה ל-`@polymarket/clob-client` מתוך ה-edge function
  - `last_run_status` לא יכול יותר להיות `live order failed: geo block`

### 3. Edge functions חדשים ל-worker
- **`worker-claim`** (POST) — Worker שולח `worker_id`, מקבל intent אחד או 204. מאומת ע"י `WORKER_SHARED_SECRET` בכותרת.
- **`worker-report`** (POST) — Worker מעדכן intent: status, order_id, error, geo data. אם EXECUTED → מעדכן גם את `real_positions.order_id` ו-`dry_run=false`. אם GEO_BLOCKED → מעדכן `real_bot_config.last_geo_*` ומחזיר את ה-mode ל-`paper`.

### 4. Worker מקומי (פרויקט Node.js נפרד שתריץ במחשב)
מסופק כתיקייה חדשה בתוך הריפו: `worker/` עם:
- `package.json` (deps: `@polymarket/clob-client`, `@ethersproject/wallet`, `node-fetch`/built-in fetch)
- `index.mjs` עם לולאה כל 10 שניות:
  1. `GET https://polymarket.com/api/geoblock` — אם blocked → דווח GEO_BLOCKED לכל intent וחכה דקה
  2. קרא `worker-claim`. אם אין intent → המתן.
  3. בנה ClobClient מ-`POLYMARKET_*` env vars **שיושבים בקובץ `.env` מקומי בלבד** (לא ב-Supabase יותר)
  4. שלח BUY GTC → דווח `worker-report` עם תוצאה
- `README.md` עם הוראות התקנה: `npm install`, ערוך `.env` (העתק את 4 המפתחות מ-Supabase ל-PC, ואז **מחק אותם מ-Supabase**), `node index.mjs`
- אופציונלי: קובץ `worker.service` ל-systemd / `pm2` להרצה כשירות

### 5. שינויי UI ב-`/real`
- Badge חדש למעלה:
  - 🟢 `LIVE COMPLIANT (Worker connected, last seen 12s ago, IL ✅)`
  - 🟡 `PAPER MODE`
  - 🔴 `GEO BLOCKED — last check: US`
  - ⚫ `Worker offline (last seen 4m ago)` — מחושב מ-intents שנתקעו ב-CLAIMED או מ-`updated_at` של config
- כפתור Toggle: `Paper` ↔ `Live Compliant`
- טאב חדש "Execution Queue" שמציג את 20 ה-intents האחרונים ע"י status
- בכל פוזיציה ב-LIVE: badge עם `order_id` (קליקבילי ל-Polygonscan)

### 6. ניקוי secrets
- אחרי שה-worker רץ במחשב: למחוק מ-Supabase את `POLYMARKET_PRIVATE_KEY`, `POLYMARKET_API_KEY`, `POLYMARKET_API_SECRET`, `POLYMARKET_API_PASSPHRASE`, `POLYMARKET_FUNDER_ADDRESS`, `POLYMARKET_SIG_TYPE` (השארת רק ב-`.env` מקומי)
- מוסיפים secret חדש אחד ל-Supabase: `WORKER_SHARED_SECRET` (טוקן ארוך אקראי שיהיה גם ב-`.env` של ה-worker)

## למה זו הגישה הנכונה

- **חוקי**: ה-geoblock check הוא הראשון לפני כל פעולה; אם blocked → לא שולחים, נקודה.
- **בלי VPN/proxy**: המפתחות יושבים על מכונה שגיאוגרפית מותרת (הבית שלך). אין עקיפה.
- **מבודד סיכון**: גם אם Supabase נפרצת — אין שם מפתחות ארנק יותר.
- **paper נשאר ברירת מחדל**: גם אם ה-worker כבוי, המוח ממשיך לרוץ ב-paper.
- **observability**: כל ניסיון ביצוע נשמר כ-intent עם status מלא, כולל סיבת חסימה.

## רצף עבודה אחרי אישור התוכנית

1. Migration לטבלה `execution_intents` + שדות חדשים ב-`real_bot_config` + פונקציית claim
2. עדכון `real-execute` (הסרת קריאת LIVE, הוספת יצירת intents)
3. יצירת `worker-claim` ו-`worker-report` edge functions
4. בקשת secret חדש: `WORKER_SHARED_SECRET`
5. יצירת תיקיית `worker/` עם הקוד + README
6. עדכוני UI ב-`/real`: badges, toggle, Execution Queue tab
7. הוראות לך: התקן את ה-worker מקומית, העתק secrets, הרץ, ואז מחק את ה-secrets מ-Supabase