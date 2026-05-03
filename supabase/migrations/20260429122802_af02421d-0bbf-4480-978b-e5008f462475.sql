ALTER TABLE public.activities
DROP CONSTRAINT IF EXISTS activities_wallet_activity_unique;

ALTER TABLE public.activities
ADD CONSTRAINT activities_wallet_activity_unique
UNIQUE NULLS NOT DISTINCT (wallet_address, transaction_hash, type, asset, side, timestamp, condition_id, outcome_index, size, price);