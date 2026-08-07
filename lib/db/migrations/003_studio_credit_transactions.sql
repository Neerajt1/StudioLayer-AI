-- Studio Credit Engine v1.0 — immutable audit trail for all credit activity
CREATE TABLE IF NOT EXISTS studio_credit_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  reason_code TEXT NOT NULL,
  render_id INTEGER REFERENCES renders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_credit_tx_user_created
  ON studio_credit_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_studio_credit_tx_user_reason
  ON studio_credit_transactions (user_id, reason_code);
