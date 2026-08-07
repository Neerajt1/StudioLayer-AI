-- Batch 11: informational audit trail for Gallery image deletions (account statement)
CREATE TABLE IF NOT EXISTS render_deletion_events (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  render_id integer NOT NULL,
  generation_session_id uuid,
  generation_type text NOT NULL,
  original_credits_consumed integer NOT NULL,
  deleted_by text NOT NULL DEFAULT 'user',
  deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS render_deletion_events_user_id_idx
  ON render_deletion_events(user_id);

CREATE INDEX IF NOT EXISTS render_deletion_events_deleted_at_idx
  ON render_deletion_events(deleted_at);
