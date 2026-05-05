מטרה

לבצע ניתוח חד-פעמי של 213 הלוייתנים שאנחנו עוקבים אחריהם, להראות עבור כל אחד:

- כמה פוזיציות **ספורט** היו לו ב-90 הימים האחרונים
- אחוז ההצלחה שלו על פוזיציות ספורט (לעומת אחוז ההצלחה הכללי)
- חלק הספורט מסך הפעילות שלו

זה ניתוח חקירה — לא תכונת אפליקציה. הפלט יהיה דוח שתוכל להוריד (CSV + סיכום), ובמידה ותרצה — נשתמש בו כדי להחליט אם להוסיף פילטר "no sports" לבוט.

## איך נזהה "ספורט"

שלוש שכבות, בסדר עדיפות:

1. שדה `category` של ה-market (אם קיים ב-Polymarket Gamma API: `Sports`, `EPL`, `NBA`, `NFL`, `UFC`, `Soccer`, `MLB`, `NHL`, `Tennis`, `F1`, `Boxing` וכד').
2. אם אין `category`, ננסה לזהות לפי `event_slug` / `slug` עם רשימת מילות מפתח (epl, nba, nfl, ufc, mma, nhl, mlb, tennis, soccer, football, ucl, champions-league, world-cup, boxing, f1, formula, wnba, ncaa).
3. אם עדיין לא בטוח — נסמן כ-`unknown` (לא יכלל בספירת הספורט).

## איך נמדוד "הצלחה"

- נמשוך מ-`https://data-api.polymarket.com/positions?user=<addr>` את כל הפוזיציות.
- "סגורה" = `redeemable=true` או `endDate < now` או `size==0`.
- "מנצחת" = `realizedPnl + cashPnl > 0`.
- חלון זמן: פוזיציות עם `endDate` ב-90 הימים האחרונים (כי `positions` לא תמיד מחזיר תאריך פתיחה).
- win-rate = מנצחות / (מנצחות + מפסידות) — מתעלמים מתיקו / 0.

## איך זה יורץ

פונקציה זמנית חד-פעמית (edge function `whale-sports-audit`) ש:

1. שולפת את כל ה-wallets מהטבלה `tracked_wallets`.
2. עבור כל ארנק — מושכת `positions` מ-Polymarket (עד 5000), מסננת ל-90 הימים האחרונים לפי `endDate`.
3. עבור כל `condition_id` ייחודי — שולפת מטה-דאטה מ-Gamma API (`/markets?condition_ids=...`) בקבוצות, כדי לקבל `category` + `event_slug`. שומרת cache בזיכרון בתוך הריצה כדי לא לחזור על אותו market פעמיים.
4. מסווגת ספורט/לא-ספורט/unknown לפי הלוגיקה למעלה.
5. מחזירה JSON עם שורה לכל ארנק:
  ```
   { address, label, total_closed, total_winrate,
     sport_closed, sport_winrate, sport_pct_of_volume,
     nonsport_closed, nonsport_winrate, unknown_count }
  ```
6. בנוסף — סיכום אגרגטיבי: כמה ארנקים הם "בעיקר ספורט" (>50% ספורט), ומהו ה-win-rate הממוצע על ספורט מול לא-ספורט.

הריצה תבוצע פעם אחת דרך `curl_edge_functions`, התוצאה תישמר כ-`/mnt/documents/whale_sports_audit.csv` + טבלת סיכום קצרה בצ'אט.

## מה לא נעשה כרגע

- לא נשנה את הבוט.
- לא נשנה את ה-tier system.
- לא ניצור טבלה חדשה ב-DB (זה ניתוח חד-פעמי; אם תרצה לחזור עליו נהפוך לכפתור ב-`/wallets`).

## אחרי שתאשר

לאחר הרצת הניתוח נציג:

- TOP 20 לוייתנים עם הכי הרבה ספורט (% מהפעילות)
- TOP 20 עם הכי הרבה ספורט אבל **win-rate נמוך**
- 5 לוייתנים שיש להם דווקא **win-rate גבוה על ספורט** (אם רוצים בכל זאת לעקוב)

ואז תחליט אם:
(א) להוסיף flag `exclude_sports` ב-`paper_bot_config`,
(ב) לסמן ידנית לוייתנים "sports-heavy" כ-inactive,
(ג) לא לעשות כלום ולהשאיר כמו שזה.