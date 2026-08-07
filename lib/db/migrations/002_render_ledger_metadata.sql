-- Creative Ledger metadata per render (Studio Gallery v3.1)
ALTER TABLE renders ADD COLUMN IF NOT EXISTS generation_type text NOT NULL DEFAULT 'hero';
ALTER TABLE renders ADD COLUMN IF NOT EXISTS studio_credits_used integer NOT NULL DEFAULT 1;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS refinement_count integer NOT NULL DEFAULT 0;
