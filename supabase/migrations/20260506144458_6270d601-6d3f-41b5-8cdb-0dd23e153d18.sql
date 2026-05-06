
UPDATE public.tracked_wallets tw
SET is_active = false,
    quality_tier = 'EXCLUDED',
    quality_score = 0,
    auto_disabled_reason = 'auto: catastrophic loss (pnl=' || ROUND(wp.total_pnl_usd)::text || ', avgRoi=' || ROUND(wp.avg_roi_pct,1)::text || '%, closed=' || wp.closed_positions::text || ')'
FROM public.whale_performance wp
WHERE wp.wallet_address = tw.address
  AND tw.is_active = true
  AND (wp.total_pnl_usd <= -100000 OR (wp.closed_positions >= 10 AND wp.avg_roi_pct <= -50));

UPDATE public.whale_performance wp
SET quality_tier = 'EXCLUDED', quality_score = 0
WHERE wp.total_pnl_usd <= -100000 OR (wp.closed_positions >= 10 AND wp.avg_roi_pct <= -50);
