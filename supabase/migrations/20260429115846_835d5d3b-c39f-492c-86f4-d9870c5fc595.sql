ALTER TABLE public.trades
  ALTER COLUMN asset DROP NOT NULL,
  ALTER COLUMN side DROP NOT NULL,
  ALTER COLUMN size DROP NOT NULL,
  ALTER COLUMN price DROP NOT NULL;

DELETE FROM public.activities
WHERE wallet_address = '0x4ffe49ba2a4cae123536a8af4fda48faeb609f71';

DELETE FROM public.trades
WHERE wallet_address = '0x4ffe49ba2a4cae123536a8af4fda48faeb609f71';

DELETE FROM public.positions_snapshots
WHERE wallet_address = '0x4ffe49ba2a4cae123536a8af4fda48faeb609f71';