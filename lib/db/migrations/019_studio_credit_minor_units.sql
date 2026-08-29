-- Studio Credits move from whole-credit integers to integer MINOR UNITS.
--
-- One Studio Credit is now stored as 100 minor units, exactly as currency is
-- stored in paise or cents. This is required because image generation is
-- priced at 1.5 credits per 2K image, which an integer whole-credit column
-- would silently coerce to 1.
--
-- THIS IS A UNIT CONVERSION, NOT A REPRICING.
-- Every existing row is multiplied by 100 so its VALUE is unchanged: a
-- historical 1-credit charge stays worth 1 credit and continues to display as
-- 1 credit. No historical transaction is re-costed at the new prices.
--
-- Idempotency: this migration must run exactly once. Re-running would inflate
-- every balance a hundredfold, so it records itself in studio_credit_ledger_meta
-- and no-ops if that marker is already present.

CREATE TABLE IF NOT EXISTS studio_credit_ledger_meta (
  key TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM studio_credit_ledger_meta WHERE key = 'minor_units_v1'
  ) THEN
    RAISE NOTICE 'Studio Credit minor-unit conversion already applied — skipping';
    RETURN;
  END IF;

  -- Ledger: pending holds and completed charges (stored negative).
  UPDATE studio_credit_transactions SET amount = amount * 100;

  -- Allocation lots and their FIFO consumption audit.
  UPDATE studio_credit_allocations
     SET original_amount = original_amount * 100,
         remaining_amount = remaining_amount * 100;

  UPDATE studio_credit_allocation_consumptions SET amount = amount * 100;

  -- Per-render credit record shown in the Gallery accounting strip.
  UPDATE renders SET studio_credits_used = studio_credits_used * 100;

  -- Deletion audit retains the credits a deleted render actually consumed.
  UPDATE render_deletion_events
     SET original_credits_consumed = original_credits_consumed * 100;

  -- Promotional bonus grants.
  UPDATE studio_promotions SET bonus_credits = bonus_credits * 100
   WHERE bonus_credits IS NOT NULL;

  INSERT INTO studio_credit_ledger_meta (key) VALUES ('minor_units_v1');
END $$;

-- New renders default to one 2K image: 1.5 credits = 150 minor units.
ALTER TABLE renders ALTER COLUMN studio_credits_used SET DEFAULT 150;

COMMENT ON COLUMN studio_credit_transactions.amount IS
  'Studio Credit MINOR UNITS (100 = 1 credit). Negative for usage.';
COMMENT ON COLUMN studio_credit_allocations.original_amount IS
  'Studio Credit MINOR UNITS (100 = 1 credit).';
COMMENT ON COLUMN studio_credit_allocations.remaining_amount IS
  'Studio Credit MINOR UNITS (100 = 1 credit).';
COMMENT ON COLUMN studio_credit_allocation_consumptions.amount IS
  'Studio Credit MINOR UNITS (100 = 1 credit).';
-- BATCH-LEVEL, not per-image: every render row in a generation batch carries the
-- whole batch charge. Do not read this column as a per-image price.
COMMENT ON COLUMN renders.studio_credits_used IS
  'Studio Credit MINOR UNITS (100 = 1 credit). BATCH total for the generation session, repeated on every render row in that batch.';
COMMENT ON COLUMN render_deletion_events.original_credits_consumed IS
  'Studio Credit MINOR UNITS (100 = 1 credit). BATCH total copied from renders.studio_credits_used.';
COMMENT ON COLUMN studio_promotions.bonus_credits IS
  'Studio Credit MINOR UNITS (100 = 1 credit).';
