-- Studio Credit transactions v1.1 — transaction_id + status lifecycle
ALTER TABLE studio_credit_transactions
  ADD COLUMN IF NOT EXISTS transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';

UPDATE studio_credit_transactions
SET transaction_id = 'legacy-' || id::TEXT
WHERE transaction_id IS NULL;

UPDATE studio_credit_transactions
SET status = 'completed'
WHERE status IS NULL OR status = '';

ALTER TABLE studio_credit_transactions
  ALTER COLUMN transaction_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_credit_tx_transaction_id
  ON studio_credit_transactions (transaction_id);

CREATE INDEX IF NOT EXISTS idx_studio_credit_tx_user_status
  ON studio_credit_transactions (user_id, status);
