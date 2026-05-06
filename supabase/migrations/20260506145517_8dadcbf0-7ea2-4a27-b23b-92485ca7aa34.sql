
UPDATE public.tracked_wallets tw
SET is_active = false, quality_tier = 'EXCLUDED', quality_score = 0,
    auto_disabled_reason = 'auto: catastrophic loss'
FROM public.whale_performance wp
WHERE wp.wallet_address = tw.address AND tw.is_active = true
  AND (wp.total_pnl_usd <= -100000
       OR (wp.closed_positions >= 10 AND wp.avg_roi_pct <= -50)
       OR (wp.closed_positions >= 10 AND wp.win_rate < 0.40));

UPDATE public.whale_performance
SET quality_tier='EXCLUDED', quality_score=0
WHERE total_pnl_usd <= -100000
   OR (closed_positions >= 10 AND avg_roi_pct <= -50)
   OR (closed_positions >= 10 AND win_rate < 0.40);
