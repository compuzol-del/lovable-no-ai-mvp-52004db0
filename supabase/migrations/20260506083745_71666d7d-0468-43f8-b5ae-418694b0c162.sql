UPDATE public.tracked_wallets
SET is_active = false, quality_tier = 'EXCLUDED', quality_score = 0,
    auto_disabled_reason = 'manual: catastrophic PnL (-$9.67M, avg ROI -100%)'
WHERE address = '0xb744f56635b537e859152d14b022af5afe485210';

UPDATE public.whale_performance
SET quality_tier = 'EXCLUDED', quality_score = 0
WHERE wallet_address = '0xb744f56635b537e859152d14b022af5afe485210';