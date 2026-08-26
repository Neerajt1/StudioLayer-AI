-- Per-user furniture usage history for editorial furniture cooldown.
-- One row per successful furniture-bearing generated image.

CREATE TABLE IF NOT EXISTS furniture_usage_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  furniture_asset_id TEXT NOT NULL,
  furniture_family TEXT NOT NULL,
  render_id INTEGER REFERENCES renders(id) ON DELETE SET NULL,
  generation_session_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS furniture_usage_events_user_created_idx
  ON furniture_usage_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS furniture_usage_events_user_asset_idx
  ON furniture_usage_events (user_id, furniture_asset_id, created_at DESC);
