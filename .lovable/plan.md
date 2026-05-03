## מה משנים עכשיו

**1. מהירות resolve**
- משנה `resolve-signals-5min` מ-`*/5 * * * *` ל-`*/2 * * * *` (כל 2 דקות).
- ככה signal שעבר שעה נסגר תוך מקסימום 2 דק' במקום 5, ומקבלים PnL מעודכן יותר.
- `scan-news-spikes` נשאר על 5 דק' (יקר יותר API-wise).

---

## הצעות לייעול האסטרטגיה (כדי להיות בטוחים שהיא עובדת)

### A. הרחבת ה-Backtest (אימות סטטיסטי)
1. **Multiple holding periods** — היום בודקים רק +1h. להוסיף +30min, +2h, +4h, +24h. אולי ה-edge חזק יותר ב-2h.
2. **Bootstrap confidence intervals** — להריץ 1000 sub-samples על ה-trades ולחשב 95% CI ל-ROI. אם ה-CI חוצה 0 → ה-edge לא סטטיסטית מובהק.
3. **Walk-forward validation** — לחלק את ההיסטוריה ל-train (70%) / test (30%) chronologically, ולבדוק שה-edge נשמר ב-out-of-sample.
4. **Per-category breakdown** — לבדוק אם ה-edge מגיע רק מקטגוריה אחת (Politics? Crypto?) או רוחבי.

### B. סינון איכותי של ה-signals (להעלות win-rate)
5. **Volume gate** — לדרוש שלשוק יש `volume24hr > $X` (למשל $5K). שווקים מתים = false signals.
6. **Liquidity gate** — `liquidity > $1K` כדי לוודא שאפשר באמת לקנות ב-$100 בלי לזוז את המחיר.
7. **Spike consistency** — לדרוש ש-3 נקודות מחיר רצופות מראות מגמת עלייה (לא רק ספייק חד-פעמי שיכול להיות wash trade).
8. **News correlation check** — להצליב עם feed חדשות (RSS/API) ולסמן אם יש כותרת רלוונטית ב-±30 דק' מה-spike.

### C. Live shadow tracking (אמת מול backtest)
9. **השוואת live vs. simulated** — אחרי 100 signals אמיתיים, להשוות את ה-realized PnL מול מה שה-backtest הציג. סטייה גדולה = overfitting.
10. **Slippage calibration** — היום מניחים 0.5% slippage. למדוד בפועל ב-orderbook depth ולכייל.

### D. Risk controls
11. **Max signals per hour** — לא יותר מ-5 signals חדשים בשעה (אחרת news event גדול = over-exposure).
12. **Stop-loss** — אם המחיר ירד מתחת ל-50% תוך 30 דק', לסגור מוקדם במקום לחכות שעה.

---

## הצעה לסדר עבודה

הייתי ממליץ קודם על **A1+A4+B5+B6** — כי:
- A1+A4 נותנים בסיס סטטיסטי שאנחנו לא רודפים noise.
- B5+B6 מסננים מיד את ה-signals הגרועים בלי שינוי גדול בקוד.

C ו-D מחכים שיהיה לנו 2-4 שבועות של live data.

רוצה שאתחיל עם **A1+A4+B5+B6** + שינוי ה-cron ל-2 דק'? או שתעדיף סט אחר?
