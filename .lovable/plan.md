## הבעיה

פוזיציה #32 (Cremonese vs Lazio O/U 2.5):
- כניסה 0.64, SL ב-0.576 (-10%)
- בפועל נסגרה ב-0.29 → **-54.69%**

הסיבה: הבוט רץ כל ~2 דק'. בשוק ספורט המחיר קפץ מ-0.66 ל-0.29 בשנייה (גול / החלטה). הבוט סוגר ב-`current_price` של אותו רגע, לא ב-SL.

זו לא בעיה בחוקים — זו בעיה ב**סימולציית הפילינג** + חשיפה לשווקים עם gap risk גבוה.

## תיקונים

### 1. `supabase/functions/paper-execute/index.ts` — exit price ריאלי

כשנסגר ב-`STOP_LOSS` או `BREAKEVEN_STOP`, להניח slippage של עד 5% מתחת ל-SL במקום למכור ב-current price:

```ts
let exitPrice = cur ?? Number(p.current_price ?? p.entry_price);
if (exitReason === "STOP_LOSS" || exitReason === "BREAKEVEN_STOP") {
  // assume fill near SL with up to 5% slippage; can't be worse than current price
  const maxSlippage = slPrice * 0.95;
  exitPrice = Math.max(maxSlippage, Math.min(slPrice, cur ?? slPrice));
}
```

תוצאה: פוזיציה כמו #32 הייתה נסגרת סביב 0.547 (-14%) במקום -54%.

עבור `WHALE_REVERSAL` ו-`TIME_STOP` משאירים סגירה ב-current price (אלה לא stops עם מחיר מוגדר).

### 2. סינון שוקי ספורט קצרי-טווח עם gap risk

בלולאת ה-OPEN, לדלג על שווקים שנפתרים תוך פחות מ-12 שעות **ו-**ה-tier הוא "high":

```ts
if (tier.tier === "high" && ttrHours != null && ttrHours < 12) {
  skipped.push({ condition_id: s.condition_id, why: `gap risk: high tier + ttr ${ttrHours.toFixed(1)}h` });
  continue;
}
```

הרציונל: tier "high" (entry > 0.60) על שוק שנסגר היום = יחס סיכון/סיכוי גרוע בגלל קפיצות מחיר חדות סביב אירועים.

### 3. הקטנת `time_stop_hours` לברירת מחדל ל-tier high

ב-`dynamicExits` נוסיף החזר של `maxTimeStopHours`:
- low: 24h
- mid: 12h  
- high: 6h

ואז:
```ts
timeStopHours = Math.min(timeStopHours, tier.maxHours);
```

### 4. איפוס נתונים

לאחר אישור, מיגרציה:
```sql
DELETE FROM paper_positions;
```

(ה-budget בקונפיג נשאר 1000.)

## למה לא לפתור עם תדירות הרצה גבוהה יותר
גם אם הבוט ירוץ כל 10 שניות, gaps בשוקי ספורט מתרחשים מיידית סביב אירועים. הפתרון הנכון לפייפר הוא **לסמלץ פילינג ריאלי של stop-loss** (ולא לקנות בשווקים שאי אפשר להגן עליהם).

## מה לא משתנה
- TP/SL/breakeven אחוזים
- סכומי 30/60/90
- שאר חוקי הסינון
