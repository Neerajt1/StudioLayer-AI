-- Studio Credit allocation lots + consumption audit (Razorpay-ready; no payment wiring)

CREATE TABLE IF NOT EXISTS studio_credit_allocations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL,
  original_amount INTEGER NOT NULL CHECK (original_amount >= 0),
  remaining_amount INTEGER NOT NULL CHECK (remaining_amount >= 0),
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  period_key TEXT,
  source_reference TEXT NOT NULL,
  ledger_transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT studio_credit_allocations_remaining_lte_original
    CHECK (remaining_amount <= original_amount)
);

CREATE UNIQUE INDEX IF NOT EXISTS studio_credit_allocations_source_reference_uidx
  ON studio_credit_allocations (source_reference);

CREATE UNIQUE INDEX IF NOT EXISTS studio_credit_allocations_ledger_transaction_id_uidx
  ON studio_credit_allocations (ledger_transaction_id)
  WHERE ledger_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS studio_credit_allocations_user_status_expires_idx
  ON studio_credit_allocations (user_id, status, expires_at);

CREATE INDEX IF NOT EXISTS studio_credit_allocations_user_reason_period_idx
  ON studio_credit_allocations (user_id, reason_code, period_key);

CREATE TABLE IF NOT EXISTS studio_credit_allocation_consumptions (
  id SERIAL PRIMARY KEY,
  usage_transaction_id TEXT NOT NULL,
  allocation_id INTEGER NOT NULL REFERENCES studio_credit_allocations(id) ON DELETE RESTRICT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS studio_credit_allocation_consumptions_usage_tx_idx
  ON studio_credit_allocation_consumptions (usage_transaction_id);

CREATE INDEX IF NOT EXISTS studio_credit_allocation_consumptions_allocation_idx
  ON studio_credit_allocation_consumptions (allocation_id);

CREATE UNIQUE INDEX IF NOT EXISTS studio_credit_allocation_consumptions_usage_allocation_uidx
  ON studio_credit_allocation_consumptions (usage_transaction_id, allocation_id);

-- Legacy seed: one current UTC-month membership lot for existing paid members.
-- No fake payment / ledger row — entitlement bridge until Razorpay grants.
INSERT INTO studio_credit_allocations (
  user_id,
  reason_code,
  original_amount,
  remaining_amount,
  starts_at,
  expires_at,
  period_key,
  source_reference,
  ledger_transaction_id,
  status
)
SELECT
  u.id AS user_id,
  'membership_allocation' AS reason_code,
  CASE
    WHEN u.subscription_tier = 'pro' THEN 120
    WHEN u.subscription_tier = 'enterprise' THEN 240
    ELSE 0
  END AS original_amount,
  GREATEST(
    0,
    CASE
      WHEN u.subscription_tier = 'pro' THEN 120
      WHEN u.subscription_tier = 'enterprise' THEN 240
      ELSE 0
    END
    - COALESCE(usage.credits_used, 0)
  ) AS remaining_amount,
  date_trunc('month', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS starts_at,
  (date_trunc('month', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + INTERVAL '1 month') AS expires_at,
  'legacy-utc:' || to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM') AS period_key,
  'legacy-seed:' || u.id::text || ':legacy-utc:' || to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM') AS source_reference,
  NULL AS ledger_transaction_id,
  CASE
    WHEN GREATEST(
      0,
      CASE
        WHEN u.subscription_tier = 'pro' THEN 120
        WHEN u.subscription_tier = 'enterprise' THEN 240
        ELSE 0
      END
      - COALESCE(usage.credits_used, 0)
    ) = 0 THEN 'exhausted'
    ELSE 'active'
  END AS status
FROM users u
LEFT JOIN LATERAL (
  SELECT COALESCE(ABS(SUM(t.amount)), 0)::INTEGER AS credits_used
  FROM studio_credit_transactions t
  WHERE t.user_id = u.id
    AND t.status = 'completed'
    AND t.reason_code IN (
      'hero_generation',
      'campaign_generation',
      'editorial_generation',
      'refine',
      'regenerate',
      'transparent_download'
    )
    AND t.created_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
) usage ON TRUE
WHERE u.subscription_tier IN ('pro', 'enterprise')
  AND COALESCE(u.is_admin, FALSE) = FALSE
ON CONFLICT (source_reference) DO NOTHING;

-- Backfill Top-Up / Pass lots from existing positive completed ledger rows
-- (previously non-spendable). Idempotent via source_reference / ledger link.
INSERT INTO studio_credit_allocations (
  user_id,
  reason_code,
  original_amount,
  remaining_amount,
  starts_at,
  expires_at,
  period_key,
  source_reference,
  ledger_transaction_id,
  status
)
SELECT
  t.user_id,
  t.reason_code,
  t.amount AS original_amount,
  t.amount AS remaining_amount,
  t.created_at AS starts_at,
  CASE
    WHEN t.reason_code = 'studio_pass_allocation'
      THEN t.created_at + INTERVAL '7 days'
    ELSE NULL
  END AS expires_at,
  NULL AS period_key,
  'ledger-backfill:' || t.transaction_id AS source_reference,
  t.transaction_id AS ledger_transaction_id,
  CASE
    WHEN t.reason_code = 'studio_pass_allocation'
      AND t.created_at + INTERVAL '7 days' <= NOW() THEN 'expired'
    ELSE 'active'
  END AS status
FROM studio_credit_transactions t
WHERE t.status = 'completed'
  AND t.amount > 0
  AND t.reason_code IN ('top_up_allocation', 'studio_pass_allocation')
ON CONFLICT (source_reference) DO NOTHING;
