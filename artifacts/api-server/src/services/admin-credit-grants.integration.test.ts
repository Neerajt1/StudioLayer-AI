/**
 * Live Postgres integration test for admin/manual credit grants.
 * Runs only against localhost `studiolayer_credit_dev`.
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

describe("admin_grant_allocation (engine + consumption)", { skip: !LIVE }, () => {
  it("free user: arbitrary positive credits grant, appears in balance, and is consumed (no expiry)", async () => {
    const {
      db,
      usersTable,
      studioCreditTransactionsTable,
      studioCreditAllocationsTable,
      studioCreditAllocationConsumptionsTable,
    } = await import("@workspace/db");

    const { eq } = await import("drizzle-orm");

    const {
      StudioCreditReasonCode,
      StudioCreditTransactionStatus,
    } = await import("@workspace/studio-credit-engine");

    const {
      beginStudioCreditTransaction,
      completeStudioCreditTransaction,
      grantCreditAllocation,
      getStudioCreditBalance,
    } = await import("./studio-credit-service.js");

    const email = `admin-grant-itest-${randomUUID()}@studiolayer.local`;
    const [user] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash: "admin-grant-itest",
        name: "Admin Grant Integration (free)",
        subscriptionTier: "free",
        hasCompletedOnboarding: true,
        isAdmin: false,
      })
      .returning();

    assert.ok(user);
    const userId = user!.id;

    try {
      const before = await getStudioCreditBalance({
        userId,
        tier: "free",
        limit: null,
        isAdmin: false,
      });

      const credits = 10;
      const allocationStartsAt = new Date(Date.now() - 60_000);
      const expiresAt = null;
      const sourceReference = `admin-grant-itest:${userId}:${randomUUID()}:note:free`;

      const grant = await grantCreditAllocation({
        userId,
        reasonCode: StudioCreditReasonCode.ADMIN_GRANT_ALLOCATION,
        credits,
        sourceReference,
        startsAt: allocationStartsAt,
        expiresAt,
      });

      const [lot] = await db
        .select()
        .from(studioCreditAllocationsTable)
        .where(eq(studioCreditAllocationsTable.id, grant.allocationId))
        .limit(1);

      assert.equal(lot?.reasonCode, StudioCreditReasonCode.ADMIN_GRANT_ALLOCATION);
      assert.equal(lot?.remainingAmount, credits);
      assert.equal(lot?.expiresAt, null);
      assert.equal(lot?.sourceReference, sourceReference);

      const after = await getStudioCreditBalance({
        userId,
        tier: "free",
        limit: null,
        isAdmin: false,
      });

      // Free-tier balance = complimentary pool + spendable lots.
      assert.equal(after.remaining, before.remaining + credits);

      // Consume 1 credit via a completed generation hold transaction.
      const pendingUsageTxId = await beginStudioCreditTransaction({
        userId,
        amount: 1,
        reasonCode: StudioCreditReasonCode.HERO_GENERATION,
      });

      const beforeUsage = await db
        .select()
        .from(studioCreditTransactionsTable)
        .where(
          eq(studioCreditTransactionsTable.transactionId, pendingUsageTxId),
        )
        .limit(1);
      assert.equal(beforeUsage[0]?.status, StudioCreditTransactionStatus.PENDING);

      await completeStudioCreditTransaction(pendingUsageTxId);

      const afterLot = await db
        .select()
        .from(studioCreditAllocationsTable)
        .where(eq(studioCreditAllocationsTable.id, grant.allocationId))
        .limit(1);

      assert.equal(afterLot[0]?.remainingAmount, credits - 1);

      const consumptions = await db
        .select()
        .from(studioCreditAllocationConsumptionsTable)
        .where(
          eq(studioCreditAllocationConsumptionsTable.usageTransactionId, pendingUsageTxId),
        );

      assert.equal(consumptions.length, 1);
      assert.equal(consumptions[0]!.allocationId, grant.allocationId);
      assert.equal(consumptions[0]!.amount, 1);

      const [usageTx] = await db
        .select()
        .from(studioCreditTransactionsTable)
        .where(eq(studioCreditTransactionsTable.transactionId, pendingUsageTxId))
        .limit(1);
      assert.equal(usageTx?.status, StudioCreditTransactionStatus.COMPLETED);

      const [uAfter] = await db
        .select({ subscriptionTier: usersTable.subscriptionTier })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      assert.equal(uAfter?.subscriptionTier, "free");
    } finally {
      // Delete consumptions first (they restrict allocation deletes).
      await db
        .delete(studioCreditAllocationConsumptionsTable)
        .where(eq(studioCreditAllocationConsumptionsTable.userId, userId));
      await db
        .delete(studioCreditAllocationsTable)
        .where(eq(studioCreditAllocationsTable.userId, userId));
      await db
        .delete(studioCreditTransactionsTable)
        .where(eq(studioCreditTransactionsTable.userId, userId));
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
  });

  it("rejects zero and negative credits for admin grants", async () => {
    const {
      db,
      usersTable,
      studioCreditAllocationsTable,
    } = await import("@workspace/db");

    const { eq } = await import("drizzle-orm");

    const { StudioCreditReasonCode } = await import("@workspace/studio-credit-engine");

    const { grantCreditAllocation } = await import("./studio-credit-service.js");

    const email = `admin-grant-itest-${randomUUID()}@studiolayer.local`;
    const [user] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash: "admin-grant-itest",
        name: "Admin Grant Integration (validation)",
        subscriptionTier: "free",
        hasCompletedOnboarding: true,
        isAdmin: false,
      })
      .returning();

    assert.ok(user);
    const userId = user!.id;

    try {
      await assert.rejects(() =>
        grantCreditAllocation({
          userId,
          reasonCode: StudioCreditReasonCode.ADMIN_GRANT_ALLOCATION,
          credits: 0,
          sourceReference: `admin-grant-itest:${userId}:${randomUUID()}:zero`,
          startsAt: new Date(),
          expiresAt: null,
        }),
      );

      await assert.rejects(() =>
        grantCreditAllocation({
          userId,
          reasonCode: StudioCreditReasonCode.ADMIN_GRANT_ALLOCATION,
          credits: -5,
          sourceReference: `admin-grant-itest:${userId}:${randomUUID()}:neg`,
          startsAt: new Date(),
          expiresAt: null,
        }),
      );

      const lots = await db
        .select()
        .from(studioCreditAllocationsTable)
        .where(eq(studioCreditAllocationsTable.userId, userId));
      assert.equal(lots.length, 0);
    } finally {
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
  });

  it("paid user: admin grant can be created, and fixed-price top-up / studio-pass rules remain enforced", async () => {
    const {
      db,
      usersTable,
      studioCreditAllocationsTable,
      studioCreditTransactionsTable,
    } = await import("@workspace/db");

    const { eq } = await import("drizzle-orm");

    const {
      StudioCreditReasonCode,
      studioPassExpiresAt,
    } = await import("@workspace/studio-credit-engine");

    const { grantCreditAllocation } = await import("./studio-credit-service.js");

    const email = `admin-grant-itest-${randomUUID()}@studiolayer.local`;
    const [user] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash: "admin-grant-itest",
        name: "Admin Grant Integration (paid)",
        subscriptionTier: "pro",
        hasCompletedOnboarding: true,
        isAdmin: false,
      })
      .returning();

    assert.ok(user);
    const userId = user!.id;

    try {
      const credits = 25;
      const sourceReference = `admin-grant-itest:${userId}:${randomUUID()}:paid`;
      const grant = await grantCreditAllocation({
        userId,
        reasonCode: StudioCreditReasonCode.ADMIN_GRANT_ALLOCATION,
        credits,
        sourceReference,
        startsAt: new Date(Date.now() - 60_000),
        expiresAt: null,
      });

      const [adminLot] = await db
        .select()
        .from(studioCreditAllocationsTable)
        .where(eq(studioCreditAllocationsTable.id, grant.allocationId))
        .limit(1);

      assert.equal(adminLot?.reasonCode, StudioCreditReasonCode.ADMIN_GRANT_ALLOCATION);
      assert.equal(adminLot?.remainingAmount, credits);
      assert.equal(adminLot?.sourceReference, sourceReference);

      // Subscription unchanged by grants (we only read user tier in grantCreditAllocation).
      const [uAfter] = await db
        .select({ subscriptionTier: usersTable.subscriptionTier })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      assert.equal(uAfter?.subscriptionTier, "pro");

      // Top-Up is fixed at 35 credits and must have expiresAt=null.
      await assert.rejects(() =>
        grantCreditAllocation({
          userId,
          reasonCode: StudioCreditReasonCode.TOP_UP_ALLOCATION,
          credits: 34,
          sourceReference: `admin-grant-itest:${userId}:${randomUUID()}:topup-wrong`,
          startsAt: new Date(Date.now() - 60_000),
          expiresAt: null,
        }),
      );

      await grantCreditAllocation({
        userId,
        reasonCode: StudioCreditReasonCode.TOP_UP_ALLOCATION,
        credits: 35,
        sourceReference: `admin-grant-itest:${userId}:${randomUUID()}:topup-ok`,
        startsAt: new Date(Date.now() - 60_000),
        expiresAt: null,
      });

      // Studio Pass cannot be granted to paid users.
      const passStartsAt = new Date(Date.now() - 60_000);
      await assert.rejects(() =>
        grantCreditAllocation({
          userId,
          reasonCode: StudioCreditReasonCode.STUDIO_PASS_ALLOCATION,
          credits: 40,
          sourceReference: `admin-grant-itest:${userId}:${randomUUID()}:pass-paid`,
          startsAt: passStartsAt,
          expiresAt: studioPassExpiresAt(passStartsAt),
        }),
      );

      // Studio Pass fixed amount = 40 for free users (optional extra safety).
      const email2 = `admin-grant-itest2-${randomUUID()}@studiolayer.local`;
      const [freeUser] = await db
        .insert(usersTable)
        .values({
          email: email2,
          passwordHash: "admin-grant-itest",
          name: "Admin Grant Integration (free pass validation)",
          subscriptionTier: "free",
          hasCompletedOnboarding: true,
          isAdmin: false,
        })
        .returning();

      assert.ok(freeUser);
      const freeUserId = freeUser!.id;

      try {
        const freePassStartsAt = new Date(Date.now() - 60_000);
        await assert.rejects(() =>
          grantCreditAllocation({
            userId: freeUserId,
            reasonCode: StudioCreditReasonCode.STUDIO_PASS_ALLOCATION,
            credits: 41,
            sourceReference: `admin-grant-itest:${freeUserId}:${randomUUID()}:pass-wrong`,
            startsAt: freePassStartsAt,
            expiresAt: studioPassExpiresAt(freePassStartsAt),
          }),
        );
      } finally {
        await db.delete(usersTable).where(eq(usersTable.id, freeUserId));
      }
    } finally {
      // Delete in child order to avoid FK restrict errors.
      // (Allocations reference user by cascade; consumptions reference allocation.)
      await db.delete(studioCreditTransactionsTable).where(eq(studioCreditTransactionsTable.userId, userId));
      await db.delete(studioCreditAllocationsTable).where(eq(studioCreditAllocationsTable.userId, userId));
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
  });

  it("expiring admin grants are not spendable (expiry semantics)", async () => {
    const {
      db,
      usersTable,
      studioCreditTransactionsTable,
      studioCreditAllocationsTable,
    } = await import("@workspace/db");

    const { eq } = await import("drizzle-orm");

    const { StudioCreditReasonCode, StudioCreditTransactionStatus } = await import("@workspace/studio-credit-engine");

    const {
      beginStudioCreditTransaction,
      completeStudioCreditTransaction,
      grantCreditAllocation,
      getStudioCreditBalance,
    } = await import("./studio-credit-service.js");

    const email = `admin-grant-itest-${randomUUID()}@studiolayer.local`;
    const [user] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash: "admin-grant-itest",
        name: "Admin Grant Integration (expiry)",
        subscriptionTier: "free",
        hasCompletedOnboarding: true,
        isAdmin: false,
      })
      .returning();

    assert.ok(user);
    const userId = user!.id;

    try {
      const now = new Date();
      const startsAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const expiresAt = new Date(now.getTime() - 60_000); // already expired
      const credits = 10;
      const sourceReference = `admin-grant-itest:${userId}:${randomUUID()}:expired`;

      const before = await getStudioCreditBalance({
        userId,
        tier: "free",
        limit: null,
        isAdmin: false,
      });

      await grantCreditAllocation({
        userId,
        reasonCode: StudioCreditReasonCode.ADMIN_GRANT_ALLOCATION,
        credits,
        sourceReference,
        startsAt,
        expiresAt,
      });

      const after = await getStudioCreditBalance({
        userId,
        tier: "free",
        limit: null,
        isAdmin: false,
      });

      // Expired allocation lots should contribute nothing to balance.
      assert.equal(after.remaining, before.remaining);

      // Attempt to consume: should fail due to no spendable lots.
      const pendingUsageTxId = await beginStudioCreditTransaction({
        userId,
        amount: 1,
        reasonCode: StudioCreditReasonCode.HERO_GENERATION,
      });

      const beforeUsage = await db
        .select()
        .from(studioCreditTransactionsTable)
        .where(eq(studioCreditTransactionsTable.transactionId, pendingUsageTxId))
        .limit(1);
      assert.equal(beforeUsage[0]?.status, StudioCreditTransactionStatus.PENDING);

      await assert.rejects(() => completeStudioCreditTransaction(pendingUsageTxId), /Insufficient allocation lots/);

      const [lot] = await db
        .select()
        .from(studioCreditAllocationsTable)
        .where(eq(studioCreditAllocationsTable.userId, userId))
        .limit(1);
      assert.equal(lot?.remainingAmount, credits);
    } finally {
      await db.delete(studioCreditAllocationsTable).where(eq(studioCreditAllocationsTable.userId, userId));
      await db.delete(studioCreditTransactionsTable).where(eq(studioCreditTransactionsTable.userId, userId));
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
  });
});

