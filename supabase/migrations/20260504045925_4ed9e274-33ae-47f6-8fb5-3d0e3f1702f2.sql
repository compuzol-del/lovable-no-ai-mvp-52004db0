ALTER TABLE public.paper_bot_config 
ADD COLUMN IF NOT EXISTS starting_budget_usd numeric NOT NULL DEFAULT 1000;