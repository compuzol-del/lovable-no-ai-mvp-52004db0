#!/usr/bin/env bash
# ============================================================================
# Polymarket Whale Tracker — One-Click Setup for NEW Lovable Account
# ============================================================================
# מה הסקריפט עושה:
#   1. מבקש ממך את ה-NEW_PROJECT_ID, ALCHEMY_API_KEY, DUNE_API_KEY
#   2. מייצר את כל ה-SQL הדרוש (seed wallets + cron jobs) עם ה-URL החדש
#   3. שומר הכל בקובץ אחד: ./RUN_THIS_IN_SQL_EDITOR.sql
#   4. מדפיס הוראות סופיות
#
# שימוש:
#   chmod +x setup_new_account.sh
#   ./setup_new_account.sh
# ============================================================================

set -e

echo "=========================================="
echo " Polymarket Whale Tracker — Setup Wizard"
echo "=========================================="
echo ""

# --- 1. Inputs ---------------------------------------------------------------
read -rp "🔹 NEW Lovable Project ID (UUID from new account URL): " NEW_PROJECT_ID
if [[ -z "$NEW_PROJECT_ID" ]]; then
  echo "❌ Project ID חובה. יוצא."
  exit 1
fi

read -rp "🔹 ALCHEMY_API_KEY (Enter לדלג אם כבר הוגדר): " ALCHEMY_KEY
read -rp "🔹 DUNE_API_KEY    (Enter לדלג אם כבר הוגדר): " DUNE_KEY

NEW_URL="https://project--${NEW_PROJECT_ID}.lovable.app"
echo ""
echo "✅ ה-URL החדש יהיה: $NEW_URL"
echo ""

# --- 2. Secrets instructions -------------------------------------------------
SECRETS_FILE="./SECRETS_TO_ADD.txt"
{
  echo "הוסף את ה-secrets הבאים בחשבון החדש דרך הצ'אט של Lovable:"
  echo "(אמור ל-AI: 'הוסף secrets')"
  echo ""
  [[ -n "$ALCHEMY_KEY" ]] && echo "ALCHEMY_API_KEY = $ALCHEMY_KEY"
  [[ -n "$DUNE_KEY"    ]] && echo "DUNE_API_KEY    = $DUNE_KEY"
  echo ""
  echo "(LOVABLE_API_KEY ו-Supabase keys מוגדרים אוטומטית ע\"י Lovable Cloud)"
} > "$SECRETS_FILE"
echo "📝 כתבתי הוראות secrets ל: $SECRETS_FILE"

# --- 3. Build the SQL --------------------------------------------------------
SQL_OUT="./RUN_THIS_IN_SQL_EDITOR.sql"

cat > "$SQL_OUT" <<SQL_HEADER
-- ============================================================================
-- AUTO-GENERATED SETUP SQL for new Lovable account
-- Project ID:  ${NEW_PROJECT_ID}
-- Project URL: ${NEW_URL}
-- ============================================================================
-- הרץ את כל הקובץ הזה ב-Backend → SQL Editor של החשבון החדש (פעם אחת).
-- ============================================================================

-- 1. Enable required extensions ----------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Drop any pre-existing jobs with the same names (safe re-run) ------------
DO \$\$
DECLARE j text;
BEGIN
  FOR j IN SELECT jobname FROM cron.job WHERE jobname IN (
    'scan-wallets',
    'compute-signals',
    'paper-execute',
    'refresh-whale-performance-daily'
  ) LOOP
    PERFORM cron.unschedule(j);
  END LOOP;
END \$\$;

-- 3. Schedule the 4 cron jobs -----------------------------------------------
SELECT cron.schedule(
  'scan-wallets',
  '*/3 * * * *',
  \$\$ SELECT net.http_post(
        url:='${NEW_URL}/api/public/hooks/scan-wallets',
        headers:='{"Content-Type":"application/json"}'::jsonb,
        body:='{}'::jsonb
      ); \$\$
);

SELECT cron.schedule(
  'compute-signals',
  '*/3 * * * *',
  \$\$ SELECT net.http_post(
        url:='${NEW_URL}/api/public/hooks/compute-signals',
        headers:='{"Content-Type":"application/json"}'::jsonb,
        body:='{}'::jsonb
      ); \$\$
);

SELECT cron.schedule(
  'paper-execute',
  '*/2 * * * *',
  \$\$ SELECT net.http_post(
        url:='${NEW_URL}/api/public/hooks/paper-execute',
        headers:='{"Content-Type":"application/json"}'::jsonb,
        body:='{}'::jsonb
      ); \$\$
);

SELECT cron.schedule(
  'refresh-whale-performance-daily',
  '0 4 * * *',
  \$\$ SELECT net.http_post(
        url:='${NEW_URL}/api/public/hooks/refresh-whale-performance',
        headers:='{"Content-Type":"application/json"}'::jsonb,
        body:='{}'::jsonb
      ); \$\$
);

-- 4. Enable the paper bot ---------------------------------------------------
UPDATE public.paper_bot_config SET enabled = true WHERE id = 1;

-- 5. Verify -----------------------------------------------------------------
SELECT jobname, schedule, active FROM cron.job
 WHERE jobname IN ('scan-wallets','compute-signals','paper-execute','refresh-whale-performance-daily')
 ORDER BY jobname;
SQL_HEADER

# --- 4. Append seed_wallets.sql if it exists ---------------------------------
if [[ -f "./seed_wallets.sql" ]]; then
  {
    echo ""
    echo "-- ========================================================================"
    echo "-- 6. Seed tracked wallets + bot config (from seed_wallets.sql)"
    echo "-- ========================================================================"
    cat ./seed_wallets.sql
  } >> "$SQL_OUT"
  echo "✅ צורף seed_wallets.sql לקובץ ה-SQL"
else
  echo "⚠️  seed_wallets.sql לא נמצא — דלג על הזרעת הארנקים (תוכל להריץ ידנית אחרי)"
fi

# --- 5. Final instructions ---------------------------------------------------
echo ""
echo "=========================================="
echo " ✅ הכל מוכן!"
echo "=========================================="
echo ""
echo "מה לעשות עכשיו בחשבון החדש:"
echo ""
echo "  1️⃣  הוסף את ה-secrets המופיעים ב: $SECRETS_FILE"
echo "      (פשוט אמור ל-AI: 'הוסף secrets ALCHEMY_API_KEY ו-DUNE_API_KEY')"
echo ""
echo "  2️⃣  פתח Backend → SQL Editor והדבק את כל התוכן של:"
echo "      $SQL_OUT"
echo "      ולחץ Run"
echo ""
echo "  3️⃣  היכנס ל-/wallets ולחץ 'חישוב איכות' כדי לחשב tiers"
echo ""
echo "  4️⃣  בדוק /paper שהבוט עובד"
echo ""
echo "✨ זהו — הבוט פעיל בחשבון החדש."
