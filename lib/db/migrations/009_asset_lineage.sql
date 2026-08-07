-- Batch 23A: Asset Versioning & Lineage
ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS master_render_id integer REFERENCES renders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS asset_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS asset_type text NOT NULL DEFAULT 'master',
  ADD COLUMN IF NOT EXISTS refinement_type text,
  ADD COLUMN IF NOT EXISTS source_asset_version integer,
  ADD COLUMN IF NOT EXISTS crop_preset text;

-- Backfill lineage for existing renders (recursive walk from roots).
WITH RECURSIVE lineage AS (
  SELECT
    id,
    id AS master_id,
    1 AS version,
    parent_render_id,
    CASE WHEN parent_render_id IS NULL THEN 'master' ELSE 'legacy_refinement' END AS resolved_type
  FROM renders
  WHERE parent_render_id IS NULL

  UNION ALL

  SELECT
    r.id,
    l.master_id,
    l.version + 1,
    r.parent_render_id,
    'legacy_refinement'
  FROM renders r
  INNER JOIN lineage l ON r.parent_render_id = l.id
)
UPDATE renders AS target
SET
  master_render_id = lineage.master_id,
  asset_version = lineage.version,
  asset_type = lineage.resolved_type,
  source_asset_version = CASE
    WHEN lineage.version > 1 THEN lineage.version - 1
    ELSE NULL
  END
FROM lineage
WHERE target.id = lineage.id;

-- Ensure every master points to itself.
UPDATE renders
SET master_render_id = id
WHERE parent_render_id IS NULL AND master_render_id IS DISTINCT FROM id;
