import pg from "pg";

const { Client } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required. Example: node --env-file-if-exists=../../.env ./scripts/preview-inverted-shoot-generation-types.mjs");
  process.exit(1);
}

function connectionTarget(urlString) {
  try {
    const url = new URL(urlString);
    return { host: url.hostname, database: decodeURIComponent(url.pathname.replace(/^\//, "")) };
  } catch {
    return { host: "(unparsed)", database: "(unparsed)" };
  }
}

const client = new Client({ connectionString });
await client.connect();

try {
  const { host, database } = connectionTarget(connectionString);
  console.log(`Preview only — no writes. host=${host} database=${database}`);

  const twoImageCampaign = await client.query(`
    SELECT
      COUNT(*)::int AS sessions,
      COALESCE(SUM(row_count), 0)::int AS rows
    FROM (
      SELECT
        r.generation_session_id,
        COUNT(*)::int AS row_count
      FROM renders r
      WHERE r.generation_type = 'campaign'
        AND r.generation_session_id IN (
          SELECT generation_session_id
          FROM renders
          WHERE parent_render_id IS NULL
            AND generation_session_id IS NOT NULL
          GROUP BY generation_session_id
          HAVING COUNT(*) = 2
             AND BOOL_AND(generation_type = 'campaign')
        )
      GROUP BY r.generation_session_id
    ) sessions
  `);

  const fourImageEditorial = await client.query(`
    SELECT
      COUNT(*)::int AS sessions,
      COALESCE(SUM(row_count), 0)::int AS rows
    FROM (
      SELECT
        r.generation_session_id,
        COUNT(*)::int AS row_count
      FROM renders r
      WHERE r.generation_type = 'editorial'
        AND r.generation_session_id IN (
          SELECT generation_session_id
          FROM renders
          WHERE parent_render_id IS NULL
            AND generation_session_id IS NOT NULL
          GROUP BY generation_session_id
          HAVING COUNT(*) = 4
             AND BOOL_AND(generation_type = 'editorial')
        )
      GROUP BY r.generation_session_id
    ) sessions
  `);

  const skipped = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE root_count = 1 AND generation_type = 'hero')::int AS hero_sessions,
      COUNT(*) FILTER (WHERE root_count = 2 AND generation_type = 'editorial')::int AS consistent_editorial_sessions,
      COUNT(*) FILTER (WHERE root_count = 4 AND generation_type = 'campaign')::int AS consistent_campaign_or_custom4_sessions,
      COUNT(*) FILTER (
        WHERE generation_type = 'campaign' AND root_count > 4 AND root_count <= 20
      )::int AS custom_campaign_sessions
    FROM (
      SELECT
        COUNT(*)::int AS root_count,
        MIN(generation_type) AS generation_type
      FROM renders
      WHERE parent_render_id IS NULL
        AND generation_session_id IS NOT NULL
      GROUP BY generation_session_id
      HAVING COUNT(DISTINCT generation_type) = 1
    ) uniform_sessions
  `);

  const unsessioned = await client.query(`
    SELECT COUNT(*)::int AS unsessioned_root_rows
    FROM renders
    WHERE parent_render_id IS NULL
      AND generation_session_id IS NULL
  `);

  const two = twoImageCampaign.rows[0];
  const four = fourImageEditorial.rows[0];
  const skip = skipped.rows[0];

  console.log("Would update (inverted mapping only):");
  console.log(`  2-image campaign → editorial: ${two.sessions} sessions, ${two.rows} rows`);
  console.log(`  4-image editorial → campaign: ${four.sessions} sessions, ${four.rows} rows`);
  console.log("Would leave unchanged:");
  console.log(`  hero sessions: ${skip.hero_sessions}`);
  console.log(`  consistent editorial (2): ${skip.consistent_editorial_sessions}`);
  console.log(`  consistent campaign/custom-4 (4): ${skip.consistent_campaign_or_custom4_sessions}`);
  console.log(`  custom campaign (5–20): ${skip.custom_campaign_sessions}`);
  console.log(`  unsessioned root rows (not classified in SQL): ${unsessioned.rows[0].unsessioned_root_rows}`);
} finally {
  await client.end();
}
