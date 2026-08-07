-- Batch 9.5B: canonical Gallery generation session identity
ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS generation_session_id uuid;
