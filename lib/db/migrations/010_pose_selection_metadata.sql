-- Pose Intelligence Phase 2 — persist selected pose per completed render
ALTER TABLE renders ADD COLUMN IF NOT EXISTS selected_pose_name text;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS selected_pose_family text;

CREATE INDEX IF NOT EXISTS renders_user_source_pose_history_idx
  ON renders (user_id, created_at DESC)
  WHERE status = 'completed' AND selected_pose_name IS NOT NULL;
