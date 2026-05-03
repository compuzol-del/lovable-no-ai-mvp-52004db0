ALTER TABLE public.activities
DROP CONSTRAINT IF EXISTS activities_wallet_address_transaction_hash_type_asset_side_key;

ALTER TABLE public.activities
ADD CONSTRAINT activities_wallet_activity_unique
UNIQUE (wallet_address, transaction_hash, type, asset, side, timestamp, condition_id, outcome_index, size, price);

CREATE INDEX IF NOT EXISTS activities_wallet_tx_idx
ON public.activities(wallet_address, transaction_hash);