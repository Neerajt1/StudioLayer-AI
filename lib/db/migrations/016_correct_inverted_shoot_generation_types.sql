-- Historical Gallery classification only (post 15aacc7 shoot-type correction).
-- Pre-fix mapping stored 2-image shoots as campaign and 4-image shoots as editorial.
--
-- Updates generation_type ONLY where session root count contradicts the stored type:
--   2 roots, all campaign  → editorial
--   4 roots, all editorial → campaign
--
-- Idempotent. Does not touch studio_credits_used, image URLs, hero rows,
-- already-consistent pairs, Custom Campaign (campaign + 4–20), or billing tables.

DO $$
DECLARE
  campaign_to_editorial_sessions integer;
  editorial_to_campaign_sessions integer;
  campaign_to_editorial_rows integer;
  editorial_to_campaign_rows integer;
BEGIN
  SELECT COUNT(*)
  INTO campaign_to_editorial_sessions
  FROM (
    SELECT generation_session_id
    FROM renders
    WHERE parent_render_id IS NULL
      AND generation_session_id IS NOT NULL
    GROUP BY generation_session_id
    HAVING COUNT(*) = 2
       AND BOOL_AND(generation_type = 'campaign')
  ) inverted_two;

  SELECT COUNT(*)
  INTO editorial_to_campaign_sessions
  FROM (
    SELECT generation_session_id
    FROM renders
    WHERE parent_render_id IS NULL
      AND generation_session_id IS NOT NULL
    GROUP BY generation_session_id
    HAVING COUNT(*) = 4
       AND BOOL_AND(generation_type = 'editorial')
  ) inverted_four;

  WITH inverted_two AS (
    SELECT generation_session_id
    FROM renders
    WHERE parent_render_id IS NULL
      AND generation_session_id IS NOT NULL
    GROUP BY generation_session_id
    HAVING COUNT(*) = 2
       AND BOOL_AND(generation_type = 'campaign')
  )
  UPDATE renders
  SET generation_type = 'editorial'
  WHERE generation_type = 'campaign'
    AND generation_session_id IN (SELECT generation_session_id FROM inverted_two);
  GET DIAGNOSTICS campaign_to_editorial_rows = ROW_COUNT;

  WITH inverted_four AS (
    SELECT generation_session_id
    FROM renders
    WHERE parent_render_id IS NULL
      AND generation_session_id IS NOT NULL
    GROUP BY generation_session_id
    HAVING COUNT(*) = 4
       AND BOOL_AND(generation_type = 'editorial')
  )
  UPDATE renders
  SET generation_type = 'campaign'
  WHERE generation_type = 'editorial'
    AND generation_session_id IN (SELECT generation_session_id FROM inverted_four);
  GET DIAGNOSTICS editorial_to_campaign_rows = ROW_COUNT;

  RAISE NOTICE
    '016 inverted shoot types: % 2-image campaign sessions (% rows) → editorial; % 4-image editorial sessions (% rows) → campaign',
    campaign_to_editorial_sessions,
    campaign_to_editorial_rows,
    editorial_to_campaign_sessions,
    editorial_to_campaign_rows;
END $$;
