/**
 * One-time backfill for Gallery card previews.
 *
 * Finds completed renders with outputImageUrl, generates Sharp previews, uploads to R2.
 * Does NOT modify original assets. Does NOT run automatically on deploy.
 *
 * Example:
 *   set -a && source ../../.env && set +a
 *   pnpm exec node --import tsx scripts/backfill-render-previews.ts
 *
 * Optional:
 *   BACKFILL_USER_ID=123   — limit to one workspace/user
 *   BACKFILL_LIMIT=100     — cap renders processed this run
 */
import { and, eq, isNotNull } from "drizzle-orm";

const { db, pool, rendersTable } = await import("@workspace/db");
const { fetchRemoteImageBuffer } = await import("../src/rendering/image-storage.ts");
const { generatePreviewBuffer } = await import(
  "../src/services/image-processing/generate-preview.ts"
);
const {
  previewObjectExists,
  uploadPreviewBufferToR2,
} = await import("../src/services/image-processing/preview-storage.ts");

const userIdFilter = process.env.BACKFILL_USER_ID
  ? Number.parseInt(process.env.BACKFILL_USER_ID, 10)
  : null;
const limit = process.env.BACKFILL_LIMIT
  ? Number.parseInt(process.env.BACKFILL_LIMIT, 10)
  : null;

let processed = 0;
let skipped = 0;
let succeeded = 0;
let failed = 0;

try {
  const conditions = [
    eq(rendersTable.status, "completed"),
    isNotNull(rendersTable.outputImageUrl),
  ];

  if (userIdFilter != null && !Number.isNaN(userIdFilter)) {
    conditions.push(eq(rendersTable.userId, userIdFilter));
  }

  const rows = await db
    .select({
      id: rendersTable.id,
      outputImageUrl: rendersTable.outputImageUrl,
      refinementType: rendersTable.refinementType,
    })
    .from(rendersTable)
    .where(and(...conditions));

  console.log(`Found ${rows.length} completed render(s) with outputImageUrl`);

  for (const row of rows) {
    if (limit != null && processed >= limit) {
      console.log(`Reached BACKFILL_LIMIT=${limit}`);
      break;
    }

    processed += 1;
    const renderId = row.id;
    const outputImageUrl = row.outputImageUrl!;
    const preserveAlpha = row.refinementType === "remove_background";

    const hasWebp = await previewObjectExists(renderId, "webp");
    const hasPng = await previewObjectExists(renderId, "png");
    if (hasWebp || hasPng) {
      skipped += 1;
      console.log(`[skip] render ${renderId} — preview already exists`);
      continue;
    }

    try {
      const { buffer } = await fetchRemoteImageBuffer(outputImageUrl);
      const preview = await generatePreviewBuffer(buffer, { preserveAlpha });
      const url = await uploadPreviewBufferToR2(preview.buffer, renderId, preview.format);
      succeeded += 1;
      console.log(
        `[ok] render ${renderId} — ${preview.format} ${preview.width}x${preview.height} → ${url}`,
      );
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[fail] render ${renderId} — ${message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        processed,
        skipped,
        succeeded,
        failed,
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
