
UPDATE public.tracked_wallets tw
SET is_active = false, quality_tier = 'EXCLUDED', quality_score = 0,
    auto_disabled_reason = 'auto: negative avg ROI despite high winrate'
FROM public.whale_performance wp
WHERE wp.wallet_address = tw.address AND tw.is_active = true
  AND wp.closed_positions >= 10 AND wp.avg_roi_pct < -10;

UPDATE public.whale_performance
SET quality_tier='EXCLUDED', quality_score=0
WHERE closed_positions >= 10 AND avg_roi_pct < -10;
