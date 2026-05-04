## שינויים

**1. `supabase/functions/paper-execute/index.ts` — `dynamicExits()`**
- tier "high" (entry > 0.60): `slPct: -15` → **`-10`** (TP נשאר 15 → R:R ~1:1.5)
- tier "mid" (0.20–0.60): `slPct: -20` → **`-15`** (TP נשאר 25 → R:R ~1:1.7)
- tier "low" נשאר כמו שהוא (-30/+50)

**2. `paper_bot_config` (DB update)**
- `breakeven_trigger_pct`: `15` → **`7`** — ה-SL יעבור ל-breakeven מהר יותר וינעל את העסקה מהפסד אחרי תזוזה קטנה לטובה.

## השפעה
- פוזיציות פתוחות קיימות לא יושפעו (ה-`sl_price` כבר נשמר עליהן). השינויים תקפים רק לפוזיציות חדשות שייפתחו.
- ה-breakeven החדש (7%) כן ישפיע גם על פוזיציות פתוחות בריצה הבאה.
