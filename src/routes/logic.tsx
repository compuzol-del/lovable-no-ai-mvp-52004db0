import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TopNav } from "@/components/TopNav";

export const Route = createFileRoute("/logic")({
  head: () => ({
    meta: [
      { title: "Logic — Whale Bot Rules" },
      { name: "description", content: "How the whale paper-trading bot decides what to buy and sell." },
    ],
  }),
  component: LogicPage,
});

function LogicPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <div className="mx-auto max-w-4xl p-4 space-y-4" dir="rtl">
        <h1 className="text-2xl font-bold">📖 לוגיקת הבוט</h1>

        <Card>
          <CardHeader><CardTitle>אחרי איזה לווייתנים אנחנו עוקבים?</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>הבוט עוקב אחרי כל ארנק בטבלה <code>tracked_wallets</code> שעמד בסינון איכות. סינון אוטומטי יומי (04:00):</p>
            <ul className="list-disc pr-6 space-y-1">
              <li><b>EXCLUDED (מוחרג):</b> פחות מ-50 פוזיציות סגורות, או win-rate מתחת ל-50%. מושבת אוטומטית.</li>
              <li><b>S-Tier:</b> ציון איכות ≥75 + win-rate גבוה + ROI חיובי + פעיל ב-30 ימים אחרונים.</li>
              <li><b>A-Tier:</b> ≥60. <b>B-Tier:</b> ≥45. <b>C-Tier:</b> &lt;45.</li>
              <li>הציון משקלל: גודל מדגם, win-rate, ROI ממוצע, פעילות אחרונה, פיזור על שווקים שונים.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>מתי הבוט קונה?</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>כל 3 דקות הבוט סורק קניות חדשות של כל הלווייתנים, מקבץ לפי שוק (<code>condition_id</code>), ומחשב ציון 0-100:</p>
            <ul className="list-disc pr-6 space-y-1">
              <li>מספר לווייתנים שונים שקנו את אותה תוצאה</li>
              <li>סך USD שהושקע</li>
              <li>חלון פיצוץ הזמן (מהיר יותר = חזק יותר)</li>
              <li>בונוס ללווייתנים מתויגים (named whales)</li>
              <li>סינון drift: אם המחיר כבר עלה הרבה — מתעלמים</li>
            </ul>
            <p className="font-semibold mt-2">תנאי כניסה (כולם חייבים להתקיים):</p>
            <ul className="list-disc pr-6 space-y-1">
              <li>action = <code>STRONG_BUY</code></li>
              <li>score ≥ <code>min_score</code> (ברירת מחדל 75)</li>
              <li>price drift ≥ -3%</li>
              <li>אין כבר פוזיציה פתוחה על אותו שוק</li>
              <li>מחיר כניסה בין 0.01 ל-0.99</li>
              <li><b>נפח 24 שעות בשוק ≥ $5,000</b> (סינון שווקים מתים)</li>
              <li><b>נזילות בשוק ≥ $1,000</b> (לוודא שאפשר לקנות בלי slippage גדול)</li>
              <li><b>מקסימום 2 פוזיציות פתוחות באותו אירוע</b> (event_id) — מונע over-concentration</li>
              <li><b>מקסימום 15 פוזיציות פתוחות בו-זמנית</b></li>
            </ul>
            <p className="font-semibold mt-2">בונוס Reversal (×2 weight על משקיעי-עומק):</p>
            <ul className="list-disc pr-6 space-y-1">
              <li>אם whale שמכר את השוק הזה ב-14 יום האחרונים חוזר וקונה — זה אות חזק במיוחד (החליף דעה).</li>
              <li>כל whale-reversal מוסיף +5 לציון (עד מקסימום +15).</li>
            </ul>
            <p className="font-semibold mt-2">גודל פוזיציה לפי ציון:</p>
            <ul className="list-disc pr-6 space-y-1">
              <li>75-84 → $100</li>
              <li>85-94 → $175</li>
              <li>95+ → $300</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>מתי הבוט מוכר? (5 חוקי יציאה)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ol className="list-decimal pr-6 space-y-2">
              <li><b className="text-green-500">TAKE_PROFIT:</b> מחיר ≥ +25% מהכניסה.</li>
              <li><b className="text-red-500">STOP_LOSS:</b> מחיר ≤ -20% מהכניסה.</li>
              <li><b className="text-blue-500">BREAKEVEN_STOP:</b> ברגע שהמחיר הגיע ל-+15%, ה-SL זז למחיר הכניסה. אם יורד חזרה — סוגרים בלי הפסד.</li>
              <li><b>TIME_STOP:</b> פוזיציה פתוחה יותר מ-24 שעות → סגירה.</li>
              <li><b>WHALE_REVERSAL:</b> אם ≥2 מהלווייתנים שגרמו לכניסה התחילו למכור את אותו שוק → סגירה מיידית.</li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>כמה זמן מחזיקים?</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>מקסימום <b>24 שעות</b> (time-stop). בפועל רוב הפוזיציות נסגרות מהר יותר על ידי TP/SL/BE/Reversal.</p>
            <p>הבוט בודק את כל הפוזיציות הפתוחות כל 2 דקות, מעדכן מחיר נוכחי, ומפעיל את חוקי היציאה.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>תזמון cron</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <ul className="list-disc pr-6 space-y-1">
              <li><code>scan-wallets</code> — כל 3 דקות (סריקת פעילות ארנקים)</li>
              <li><code>compute-signals</code> — כל 3 דקות (חישוב ציוני סיגנלים)</li>
              <li><code>paper-execute</code> — כל 2 דקות (פתיחה/סגירת פוזיציות)</li>
              <li><code>refresh-whale-performance</code> — יומי 04:00 (חישוב איכות לווייתנים)</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
