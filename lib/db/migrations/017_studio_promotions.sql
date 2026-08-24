-- Admin-managed promotional schemes (storage only — no pricing wiring yet)

CREATE TABLE IF NOT EXISTS studio_promotions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  badge_label TEXT NOT NULL,
  bonus_credits INTEGER CHECK (bonus_credits IS NULL OR bonus_credits > 0),
  bonus_credits_expires_at TIMESTAMPTZ,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT studio_promotions_end_after_start CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS studio_promotions_start_end_idx
  ON studio_promotions (start_at, end_at);

CREATE INDEX IF NOT EXISTS studio_promotions_enabled_idx
  ON studio_promotions (enabled);
