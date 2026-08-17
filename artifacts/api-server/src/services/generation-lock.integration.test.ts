/**
 * Live Postgres two-waiter test for generation coordination.
 * Runs only against localhost studiolayer_credit_dev. Skips otherwise.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";

function isLocalCreditDevDatabase(): boolean {
  const raw = process.env.DATABASE_URL;
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname;
    const local =
      host === "localhost" || host === "127.0.0.1" || host === "::1";
    return local && parsed.pathname.includes("studiolayer_credit_dev");
  } catch {
    return false;
  }
}

const LIVE = isLocalCreditDevDatabase();

describe("live Postgres generation lock concurrency", { skip: !LIVE }, () => {
  it("serializes two simultaneous Creates: no duplicate rows/credits, bounded wait, lock released", async () => {
    const { eq, inArray, sql } = await import("drizzle-orm");
    const {
      db,
      pool,
      usersTable,
      rendersTable,
      studioCreditTransactionsTable,
      studioCreditAllocationsTable,
      studioCreditAllocationConsumptionsTable,
    } = await import("@workspace/db");
    const { StudioCreditTransactionStatus } = await import(
      "@workspace/studio-credit-engine"
    );
    const {
      findActiveGenerationBatch,
      withUserGenerationLock,
    } = await import("./generation-idempotency.js");
    const {
      GENERATION_LOCK_TIMEOUT_MS,
      isGenerationLockBusyError,
    } = await import("./generation-lock.js");
    const {
      assertStudioCreditsAvailable,
      beginGenerationCreditTransaction,
      failStudioCreditTransaction,
    } = await import("./studio-credit-service.js");

    const email = `lock-itest-${randomUUID()}@studiolayer.local`;
    const [user] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash: "lock-integration-test",
        name: "Generation Lock Integration",
        subscriptionTier: "free",
        hasCompletedOnboarding: true,
        isAdmin: false,
      })
      .returning();
    const userId = user!.id;

    async function countAdvisoryLocks(): Promise<number> {
      const result = await db.execute(sql`
        SELECT COUNT(*)::int AS n
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND classid = 0
          AND objid = ${userId}
      `);
      const row = Array.isArray(result) ? result[0] : result.rows?.[0];
      return Number((row as { n?: number } | undefined)?.n ?? 0);
    }

    async function createHero(holdMs = 0): Promise<
      | { type: "created"; renderId: number; creditTransactionId: string }
      | { type: "duplicate"; renderId: number }
    > {
      return withUserGenerationLock(userId, async (tx) => {
        if (holdMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, holdMs));
        }

        const active = await findActiveGenerationBatch(userId, tx);
        if (active.length > 0) {
          return { type: "duplicate" as const, renderId: active[0]!.id };
        }

        const creditCheck = await assertStudioCreditsAvailable({
          userId,
          tier: "free",
          limit: null,
          isAdmin: false,
          imageCount: 1,
          isRefinement: false,
          outputResolution: "2K",
        });
        if (!creditCheck.ok) {
          throw new Error(creditCheck.message);
        }

        const sessionId = randomUUID();
        const [row] = await tx
          .insert(rendersTable)
          .values({
            userId,
            sourceImageUrl: "https://example.invalid/lock-itest.jpg",
            modelPersona: "lock-itest",
            locationEnvironment: "lock-itest",
            status: "processing",
            generationType: "hero",
            studioCreditsUsed: 1,
            generationSessionId: sessionId,
            outputResolution: "2K",
          })
          .returning();

        const creditTransactionId = await beginGenerationCreditTransaction({
          userId,
          imageCount: 1,
          isRefinement: false,
          outputResolution: "2K",
          renderId: row!.id,
          executor: tx,
        });

        return {
          type: "created" as const,
          renderId: row!.id,
          creditTransactionId,
        };
      });
    }

    async function cleanup(): Promise<void> {
      await db
        .delete(studioCreditAllocationConsumptionsTable)
        .where(eq(studioCreditAllocationConsumptionsTable.userId, userId));
      await db
        .delete(studioCreditAllocationsTable)
        .where(eq(studioCreditAllocationsTable.userId, userId));
      await db
        .delete(studioCreditTransactionsTable)
        .where(eq(studioCreditTransactionsTable.userId, userId));
      await db.delete(rendersTable).where(eq(rendersTable.userId, userId));
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }

    try {
      const holdMs = GENERATION_LOCK_TIMEOUT_MS + 1_000;
      const bStarted = Date.now();
      const [aResult, bOutcome] = await Promise.all([
        createHero(holdMs),
        createHero(0)
          .then((result) => ({
            ok: true as const,
            result,
            elapsedMs: Date.now() - bStarted,
            fallbackMs: 0,
          }))
          .catch(async (error) => {
            const elapsedMs = Date.now() - bStarted;
            const fallbackStarted = Date.now();
            const fallback = await findActiveGenerationBatch(userId);
            return {
              ok: false as const,
              error,
              elapsedMs,
              fallback,
              fallbackMs: Date.now() - fallbackStarted,
            };
          }),
      ]);

      assert.equal(aResult.type, "created");

      if (bOutcome.ok) {
        assert.equal(bOutcome.result.type, "duplicate");
        assert.equal(bOutcome.result.renderId, aResult.renderId);
      } else {
        assert.equal(isGenerationLockBusyError(bOutcome.error), true);
        assert.ok(
          bOutcome.fallbackMs < 2_000,
          `409 fallback query took ${bOutcome.fallbackMs}ms; must not wait on the held xact lock`,
        );
        if (bOutcome.fallback.length > 0) {
          assert.equal(bOutcome.fallback[0]!.id, aResult.renderId);
        }
      }

      assert.ok(
        bOutcome.elapsedMs < 8_000,
        `waiter waited ${bOutcome.elapsedMs}ms; must stay bounded`,
      );

      const rendersAfter = await db
        .select({ id: rendersTable.id })
        .from(rendersTable)
        .where(eq(rendersTable.userId, userId));
      assert.equal(rendersAfter.length, 1);

      const creditsAfter = await db
        .select({
          transactionId: studioCreditTransactionsTable.transactionId,
          status: studioCreditTransactionsTable.status,
        })
        .from(studioCreditTransactionsTable)
        .where(eq(studioCreditTransactionsTable.userId, userId));
      assert.equal(creditsAfter.length, 1);
      assert.equal(creditsAfter[0]!.status, StudioCreditTransactionStatus.PENDING);

      assert.equal(await countAdvisoryLocks(), 0);

      await db
        .update(rendersTable)
        .set({ status: "failed" })
        .where(inArray(rendersTable.id, [aResult.renderId]));
      await failStudioCreditTransaction(aResult.creditTransactionId);

      const cResult = await createHero(0);
      assert.equal(cResult.type, "created");
      assert.notEqual(cResult.renderId, aResult.renderId);

      const rendersFinal = await db
        .select({ id: rendersTable.id })
        .from(rendersTable)
        .where(eq(rendersTable.userId, userId));
      assert.equal(rendersFinal.length, 2);

      const creditsFinal = await db
        .select({ transactionId: studioCreditTransactionsTable.transactionId })
        .from(studioCreditTransactionsTable)
        .where(eq(studioCreditTransactionsTable.userId, userId));
      assert.equal(creditsFinal.length, 2);

      assert.equal(await countAdvisoryLocks(), 0);
    } finally {
      await cleanup();
      await pool.end();
    }
  });
});
