import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  STUDIO_CREDIT_USAGE_REASON_CODES,
  StudioCreditAllocationStatus,
  StudioCreditReasonCode,
  StudioCreditTransactionStatus,
  adminStudioCreditBalance,
  allocationStatusAfterRemaining,
  computeAvailableStudioCredits,
  computeBillingCycleLedgerStats,
  computeLegacyMembershipBridgeCredits,
  creditCostForTransparentDownload,
  expectedCreditsForAllocation,
  hasActiveMembershipLotCoveringNow,
  isLegacyMembershipBridgeEnabled,
  isStudioAdmin,
  isStudioCreditAllocationReasonCode,
  legacyMembershipSourceReference,
  legacyUtcMembershipPeriodBounds,
  membershipAllowanceForTier,
  planAllocationConsumption,
  reasonCodeForImageRequest,
  reasonCodeForTransparentDownload,
  reasonCodeForGenerationType,
  resolveGenerationCreditCost,
  studioPassExpiresAt,
  sumSpendableAllocationCredits,
  billingCycleStartUtc,
  type BillingCycleLedgerStats,
  type StudioCreditAllocationReasonCode,
  type StudioCreditReasonCodeValue,
} from "@workspace/studio-credit-engine";
import {
  db,
  studioCreditAllocationConsumptionsTable,
  studioCreditAllocationsTable,
  studioCreditTransactionsTable,
  usersTable,
} from "@workspace/db";

/** UTC billing-cycle start — re-exported for account statement and API consumers. */
export function billingCycleStart(now = new Date()): Date {
  return billingCycleStartUtc(now);
}

function creditCostForRequest(
  imageCount: number,
  isRefinement: boolean,
  isRegenerate = false,
  customCampaign = false,
  outputResolution: import("@workspace/studio-credit-engine").OutputResolution = "2K",
): number {
  return resolveGenerationCreditCost({
    imageCount,
    customCampaign,
    isRefinement,
    isRegenerate,
    outputResolution,
  });
}

function reasonCodeForRequest(
  imageCount: number,
  isRefinement: boolean,
  isRegenerate: boolean,
  customCampaign: boolean,
): StudioCreditReasonCodeValue {
  if (isRegenerate) return reasonCodeForImageRequest(1, false, true);
  if (isRefinement) return reasonCodeForImageRequest(1, true, false);
  if (customCampaign) return reasonCodeForGenerationType("campaign");
  return reasonCodeForImageRequest(imageCount as 1 | 2 | 4, false, false);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

/** Begin a single pending transaction for an entire generation request. */
export async function beginStudioCreditTransaction(input: {
  userId: number;
  amount: number;
  reasonCode: StudioCreditReasonCodeValue;
  renderId?: number | null;
}): Promise<string> {
  const transactionId = randomUUID();
  await db.insert(studioCreditTransactionsTable).values({
    transactionId,
    userId: input.userId,
    workspaceId: input.userId,
    amount: -Math.abs(input.amount),
    reasonCode: input.reasonCode,
    status: StudioCreditTransactionStatus.PENDING,
    renderId: input.renderId ?? null,
  });
  return transactionId;
}

export async function completeStudioCreditTransaction(
  transactionId: string,
): Promise<void> {
  const updated = await db
    .update(studioCreditTransactionsTable)
    .set({ status: StudioCreditTransactionStatus.COMPLETED })
    .where(
      and(
        eq(studioCreditTransactionsTable.transactionId, transactionId),
        eq(
          studioCreditTransactionsTable.status,
          StudioCreditTransactionStatus.PENDING,
        ),
      ),
    )
    .returning({
      transactionId: studioCreditTransactionsTable.transactionId,
      userId: studioCreditTransactionsTable.userId,
      amount: studioCreditTransactionsTable.amount,
      reasonCode: studioCreditTransactionsTable.reasonCode,
    });

  const row = updated[0];
  if (!row) return;

  const charge = Math.abs(row.amount);
  if (
    charge > 0 &&
    (STUDIO_CREDIT_USAGE_REASON_CODES as readonly string[]).includes(
      row.reasonCode,
    )
  ) {
    await consumeAllocationsForUsageTransaction({
      userId: row.userId,
      usageTransactionId: row.transactionId,
      credits: charge,
    });
  }
}

export async function failStudioCreditTransaction(
  transactionId: string,
): Promise<void> {
  await db
    .update(studioCreditTransactionsTable)
    .set({
      status: StudioCreditTransactionStatus.FAILED,
      amount: 0,
    })
    .where(
      and(
        eq(studioCreditTransactionsTable.transactionId, transactionId),
        eq(
          studioCreditTransactionsTable.status,
          StudioCreditTransactionStatus.PENDING,
        ),
      ),
    );
}

/**
 * Finalize a generation credit hold for partial batch success.
 * Charges only for completed renders; releases the hold when none succeeded.
 */
export async function finalizeGenerationCreditTransaction(input: {
  transactionId: string;
  completedCount: number;
  creditPerCompletedImage: number;
}): Promise<{ chargedCredits: number }> {
  const charged = input.completedCount * input.creditPerCompletedImage;

  if (charged <= 0) {
    await failStudioCreditTransaction(input.transactionId);
    return { chargedCredits: 0 };
  }

  await db
    .update(studioCreditTransactionsTable)
    .set({ amount: -Math.abs(charged) })
    .where(
      and(
        eq(studioCreditTransactionsTable.transactionId, input.transactionId),
        eq(
          studioCreditTransactionsTable.status,
          StudioCreditTransactionStatus.PENDING,
        ),
      ),
    );

  await completeStudioCreditTransaction(input.transactionId);
  return { chargedCredits: charged };
}

/**
 * Server-side reconciliation only — reverses completed charges when every render
 * in the linked generation session failed (orphan/legacy billing inconsistency).
 */
export async function reverseOrphanCompletedStudioCreditTransaction(
  transactionId: string,
): Promise<boolean> {
  const rows = await db
    .update(studioCreditTransactionsTable)
    .set({
      status: StudioCreditTransactionStatus.FAILED,
      amount: 0,
    })
    .where(
      and(
        eq(studioCreditTransactionsTable.transactionId, transactionId),
        eq(
          studioCreditTransactionsTable.status,
          StudioCreditTransactionStatus.COMPLETED,
        ),
      ),
    )
    .returning({ transactionId: studioCreditTransactionsTable.transactionId });

  return rows.length > 0;
}

/** Sum completed consumption transactions only. */
export async function sumStudioCreditsUsed(
  userId: number,
  since?: Date,
): Promise<number> {
  const conditions = [
    eq(studioCreditTransactionsTable.userId, userId),
    eq(
      studioCreditTransactionsTable.status,
      StudioCreditTransactionStatus.COMPLETED,
    ),
    inArray(
      studioCreditTransactionsTable.reasonCode,
      STUDIO_CREDIT_USAGE_REASON_CODES as unknown as string[],
    ),
  ];

  if (since) {
    conditions.push(gte(studioCreditTransactionsTable.createdAt, since));
  }

  const [row] = await db
    .select({
      total: sql<number>`COALESCE(ABS(SUM(${studioCreditTransactionsTable.amount})), 0)`,
    })
    .from(studioCreditTransactionsTable)
    .where(and(...conditions));

  return Number(row?.total ?? 0);
}

/** Absolute credits currently held by pending usage transactions. */
export async function sumPendingStudioCreditsHeld(
  userId: number,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(ABS(SUM(${studioCreditTransactionsTable.amount})), 0)`,
    })
    .from(studioCreditTransactionsTable)
    .where(
      and(
        eq(studioCreditTransactionsTable.userId, userId),
        eq(
          studioCreditTransactionsTable.status,
          StudioCreditTransactionStatus.PENDING,
        ),
        inArray(
          studioCreditTransactionsTable.reasonCode,
          STUDIO_CREDIT_USAGE_REASON_CODES as unknown as string[],
        ),
      ),
    );

  return Number(row?.total ?? 0);
}

async function loadUserAllocationLots(userId: number) {
  return db
    .select()
    .from(studioCreditAllocationsTable)
    .where(eq(studioCreditAllocationsTable.userId, userId));
}

async function lazyExpireAllocationLots(
  userId: number,
  now = new Date(),
): Promise<void> {
  await db
    .update(studioCreditAllocationsTable)
    .set({ status: StudioCreditAllocationStatus.EXPIRED })
    .where(
      and(
        eq(studioCreditAllocationsTable.userId, userId),
        eq(
          studioCreditAllocationsTable.status,
          StudioCreditAllocationStatus.ACTIVE,
        ),
        sql`${studioCreditAllocationsTable.expiresAt} IS NOT NULL`,
        lte(studioCreditAllocationsTable.expiresAt, now),
      ),
    );
}

/**
 * Idempotent legacy seed for paid members missing a current-period membership lot.
 * Does not invent a payment ledger row.
 *
 * Razorpay precedence: if any spendable membership lot already covers `now`
 * (including Razorpay-granted lots), this function returns without seeding.
 * That prevents double entitlement when Razorpay allocations are authoritative.
 *
 * Production cutover (do NOT flip in this hardening PR via Railway):
 * set STUDIO_CREDIT_LEGACY_MEMBERSHIP_BRIDGE=false once Razorpay membership
 * grants are live for all paid users, so the UTC-month implicit bridge cannot
 * reappear beside Razorpay period lots. Leave the bridge ON until that cutover
 * so legacy paid members without Razorpay lots are not stranded.
 */
export async function ensureLegacyMembershipAllocation(input: {
  userId: number;
  tier: string;
  now?: Date;
}): Promise<void> {
  if (input.tier !== "pro" && input.tier !== "enterprise") return;

  const now = input.now ?? new Date();
  await lazyExpireAllocationLots(input.userId, now);

  const existingLots = await loadUserAllocationLots(input.userId);
  // Razorpay/grant lots already cover the membership pool — do not seed a second one.
  if (hasActiveMembershipLotCoveringNow(existingLots, now)) {
    return;
  }

  const bounds = legacyUtcMembershipPeriodBounds(now);
  const sourceReference = legacyMembershipSourceReference(
    input.userId,
    bounds.periodKey,
  );

  const [existing] = await db
    .select({ id: studioCreditAllocationsTable.id })
    .from(studioCreditAllocationsTable)
    .where(eq(studioCreditAllocationsTable.sourceReference, sourceReference))
    .limit(1);

  if (existing) return;

  const allowance = membershipAllowanceForTier(input.tier, null);
  const used = await sumStudioCreditsUsed(input.userId, bounds.startsAt);
  const remaining = Math.max(0, allowance - used);
  const status =
    remaining <= 0
      ? StudioCreditAllocationStatus.EXHAUSTED
      : StudioCreditAllocationStatus.ACTIVE;

  try {
    await db.insert(studioCreditAllocationsTable).values({
      userId: input.userId,
      reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
      originalAmount: allowance,
      remainingAmount: remaining,
      startsAt: bounds.startsAt,
      expiresAt: bounds.expiresAt,
      periodKey: bounds.periodKey,
      sourceReference,
      ledgerTransactionId: null,
      status,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
}

/**
 * Idempotent grant of a spendable allocation lot + positive ledger row.
 * Payment verification is intentionally out of scope — callers must only invoke
 * after a verified commercial event (future Razorpay) or explicit admin/test path.
 */
export async function grantCreditAllocation(input: {
  userId: number;
  reasonCode: StudioCreditAllocationReasonCode;
  credits: number;
  sourceReference: string;
  startsAt: Date;
  expiresAt: Date | null;
  periodKey?: string | null;
  tier?: string;
}): Promise<{
  allocationId: number;
  ledgerTransactionId: string;
  created: boolean;
}> {
  if (!isStudioCreditAllocationReasonCode(input.reasonCode)) {
    throw new Error(`Unsupported allocation reason: ${input.reasonCode}`);
  }

  const [user] = await db
    .select({
      subscriptionTier: usersTable.subscriptionTier,
      isAdmin: usersTable.isAdmin,
    })
    .from(usersTable)
    .where(eq(usersTable.id, input.userId))
    .limit(1);

  if (!user) {
    throw new Error(`Cannot grant credits: user ${input.userId} not found`);
  }

  const tier = input.tier ?? user.subscriptionTier;
  const isPaidMember = tier === "pro" || tier === "enterprise";

  if (input.reasonCode === StudioCreditReasonCode.TOP_UP_ALLOCATION && !isPaidMember) {
    throw new Error("Top-Up credits require an active paid membership");
  }

  if (
    input.reasonCode === StudioCreditReasonCode.STUDIO_PASS_ALLOCATION &&
    isPaidMember
  ) {
    throw new Error("Studio Pass is only available to non-members");
  }

  if (
    input.reasonCode === StudioCreditReasonCode.MEMBERSHIP_ALLOCATION &&
    !isPaidMember
  ) {
    throw new Error("Membership allocation requires a paid membership tier");
  }

  if (
    input.reasonCode === StudioCreditReasonCode.MEMBERSHIP_UPGRADE_ALLOCATION
  ) {
    throw new Error("Membership upgrade allocations are not available");
  }

  const expected = expectedCreditsForAllocation({
    reasonCode: input.reasonCode,
    tier,
  });
  if (input.credits !== expected) {
    throw new Error(
      `Allocation credits must be ${expected} for ${input.reasonCode} (got ${input.credits})`,
    );
  }

  if (input.reasonCode === StudioCreditReasonCode.TOP_UP_ALLOCATION) {
    if (input.expiresAt != null) {
      throw new Error("Top-Up allocations must have expiresAt=null");
    }
  }

  if (input.reasonCode === StudioCreditReasonCode.STUDIO_PASS_ALLOCATION) {
    const expectedExpiry = studioPassExpiresAt(input.startsAt);
    if (
      !input.expiresAt ||
      Math.abs(input.expiresAt.getTime() - expectedExpiry.getTime()) > 1000
    ) {
      throw new Error("Studio Pass expiresAt must be startsAt + 7 days");
    }
  }

  if (input.reasonCode === StudioCreditReasonCode.MEMBERSHIP_ALLOCATION) {
    if (!input.expiresAt) {
      throw new Error("Membership allocations require expiresAt (period end)");
    }
    if (!input.periodKey) {
      throw new Error("Membership allocations require periodKey");
    }
  }

  const [existing] = await db
    .select()
    .from(studioCreditAllocationsTable)
    .where(
      eq(studioCreditAllocationsTable.sourceReference, input.sourceReference),
    )
    .limit(1);

  if (existing) {
    return {
      allocationId: existing.id,
      ledgerTransactionId: existing.ledgerTransactionId ?? "",
      created: false,
    };
  }

  const ledgerTransactionId = randomUUID();

  try {
    const result = await db.transaction(async (tx) => {
      await tx.insert(studioCreditTransactionsTable).values({
        transactionId: ledgerTransactionId,
        userId: input.userId,
        workspaceId: input.userId,
        amount: Math.abs(input.credits),
        reasonCode: input.reasonCode,
        status: StudioCreditTransactionStatus.COMPLETED,
        renderId: null,
      });

      const [allocation] = await tx
        .insert(studioCreditAllocationsTable)
        .values({
          userId: input.userId,
          reasonCode: input.reasonCode,
          originalAmount: input.credits,
          remainingAmount: input.credits,
          startsAt: input.startsAt,
          expiresAt: input.expiresAt,
          periodKey: input.periodKey ?? null,
          sourceReference: input.sourceReference,
          ledgerTransactionId,
          status: StudioCreditAllocationStatus.ACTIVE,
        })
        .returning({ id: studioCreditAllocationsTable.id });

      return allocation;
    });

    return {
      allocationId: result!.id,
      ledgerTransactionId,
      created: true,
    };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const [race] = await db
      .select()
      .from(studioCreditAllocationsTable)
      .where(
        eq(studioCreditAllocationsTable.sourceReference, input.sourceReference),
      )
      .limit(1);

    if (!race) throw error;

    return {
      allocationId: race.id,
      ledgerTransactionId: race.ledgerTransactionId ?? "",
      created: false,
    };
  }
}

/**
 * Apply lot decrements + consumption audit for a completed usage charge.
 * Idempotent per usage_transaction_id.
 */
export async function consumeAllocationsForUsageTransaction(input: {
  userId: number;
  usageTransactionId: string;
  credits: number;
  now?: Date;
}): Promise<void> {
  if (input.credits <= 0) return;

  const now = input.now ?? new Date();

  const [existing] = await db
    .select({ id: studioCreditAllocationConsumptionsTable.id })
    .from(studioCreditAllocationConsumptionsTable)
    .where(
      eq(
        studioCreditAllocationConsumptionsTable.usageTransactionId,
        input.usageTransactionId,
      ),
    )
    .limit(1);

  if (existing) return;

  const [user] = await db
    .select({ subscriptionTier: usersTable.subscriptionTier })
    .from(usersTable)
    .where(eq(usersTable.id, input.userId))
    .limit(1);

  if (user) {
    await ensureLegacyMembershipAllocation({
      userId: input.userId,
      tier: user.subscriptionTier,
      now,
    });
  }

  await lazyExpireAllocationLots(input.userId, now);

  const lots = await loadUserAllocationLots(input.userId);
  const plan = planAllocationConsumption(
    lots.map((row) => ({
      id: row.id,
      reasonCode: row.reasonCode,
      remainingAmount: row.remainingAmount,
      startsAt: row.startsAt,
      expiresAt: row.expiresAt,
      status: row.status,
      createdAt: row.createdAt,
      periodKey: row.periodKey,
    })),
    input.credits,
    now,
  );

  await db.transaction(async (tx) => {
    const [again] = await tx
      .select({ id: studioCreditAllocationConsumptionsTable.id })
      .from(studioCreditAllocationConsumptionsTable)
      .where(
        eq(
          studioCreditAllocationConsumptionsTable.usageTransactionId,
          input.usageTransactionId,
        ),
      )
      .limit(1);
    if (again) return;

    for (const item of plan) {
      const [updated] = await tx
        .update(studioCreditAllocationsTable)
        .set({
          remainingAmount: item.remainingAfter,
          status: allocationStatusAfterRemaining(
            item.remainingAfter,
            lots.find((l) => l.id === item.allocationId)?.expiresAt ?? null,
            now,
          ),
        })
        .where(
          and(
            eq(studioCreditAllocationsTable.id, item.allocationId),
            eq(studioCreditAllocationsTable.userId, input.userId),
            sql`${studioCreditAllocationsTable.remainingAmount} >= ${item.amount}`,
          ),
        )
        .returning({ id: studioCreditAllocationsTable.id });

      if (!updated) {
        throw new Error(
          `Failed to consume ${item.amount} from allocation ${item.allocationId}`,
        );
      }

      await tx.insert(studioCreditAllocationConsumptionsTable).values({
        usageTransactionId: input.usageTransactionId,
        allocationId: item.allocationId,
        userId: input.userId,
        amount: item.amount,
      });
    }
  });
}

export async function getStudioCreditBalance(input: {
  userId: number;
  tier: string;
  limit: number | null;
  isAdmin: boolean;
}): Promise<{
  used: number;
  limit: number | null;
  remaining: number;
  canRender: boolean;
}> {
  if (isStudioAdmin(input)) {
    return adminStudioCreditBalance();
  }

  const allowance = membershipAllowanceForTier(input.tier, input.limit);
  const now = new Date();
  const pendingHeld = await sumPendingStudioCreditsHeld(input.userId);

  // Free complimentary: lifetime pool, no allocation lots.
  if (input.tier === "free") {
    const used = await sumStudioCreditsUsed(input.userId);
    const remaining = computeAvailableStudioCredits({
      spendableFromLots: Math.max(0, allowance - used),
      pendingHeld,
    });
    return {
      used,
      limit: allowance,
      remaining,
      canRender: remaining >= 1,
    };
  }

  await ensureLegacyMembershipAllocation({
    userId: input.userId,
    tier: input.tier,
    now,
  });
  await lazyExpireAllocationLots(input.userId, now);

  const lots = await loadUserAllocationLots(input.userId);
  const lotViews = lots.map((row) => ({
    id: row.id,
    reasonCode: row.reasonCode,
    remainingAmount: row.remainingAmount,
    startsAt: row.startsAt,
    expiresAt: row.expiresAt,
    status: row.status,
    createdAt: row.createdAt,
    periodKey: row.periodKey,
  }));

  const spendableFromLots = sumSpendableAllocationCredits(lotViews, now);
  const hasMembershipLot = hasActiveMembershipLotCoveringNow(lotViews, now);
  const legacyWindowStart = billingCycleStart(now);
  const completedUsageInLegacyWindow = await sumStudioCreditsUsed(
    input.userId,
    legacyWindowStart,
  );
  const bridgeCredits = computeLegacyMembershipBridgeCredits({
    bridgeEnabled: isLegacyMembershipBridgeEnabled(
      process.env as Record<string, string | undefined>,
    ),
    hasActiveMembershipLot: hasMembershipLot,
    membershipAllowance: allowance,
    completedUsageInLegacyWindow,
  });

  const remaining = computeAvailableStudioCredits({
    spendableFromLots,
    pendingHeld,
    legacyMembershipBridgeCredits: bridgeCredits,
  });

  return {
    used: completedUsageInLegacyWindow,
    limit: allowance,
    remaining,
    canRender: remaining >= 1,
  };
}

export async function assertStudioCreditsAvailable(input: {
  userId: number;
  tier: string;
  limit: number | null;
  isAdmin: boolean;
  imageCount: number;
  isRefinement: boolean;
  customCampaign?: boolean;
  outputResolution?: import("@workspace/studio-credit-engine").OutputResolution;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (isStudioAdmin(input)) return { ok: true };

  const required = creditCostForRequest(
    input.imageCount,
    input.isRefinement,
    false,
    input.customCampaign,
    input.outputResolution ?? "2K",
  );

  const balance = await getStudioCreditBalance({
    userId: input.userId,
    tier: input.tier,
    limit: input.limit,
    isAdmin: false,
  });

  if (balance.remaining < required) {
    return {
      ok: false,
      message: `Insufficient Studio Credits. This action requires ${required} Studio Credit${required === 1 ? "" : "s"}.`,
    };
  }

  return { ok: true };
}

export async function assertTransparentDownloadCreditsAvailable(input: {
  userId: number;
  tier: string;
  limit: number | null;
  isAdmin: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (isStudioAdmin(input)) return { ok: true };

  const required = creditCostForTransparentDownload();
  const balance = await getStudioCreditBalance({
    userId: input.userId,
    tier: input.tier,
    limit: input.limit,
    isAdmin: false,
  });

  if (balance.remaining < required) {
    return {
      ok: false,
      message: `Insufficient Studio Credits. Transparent PNG download requires ${required} Studio Credit.`,
    };
  }

  return { ok: true };
}

/** No-op — transparent PNG download is free. Retained for API compatibility. */
export async function deductTransparentDownloadCredit(input: {
  userId: number;
  renderId: number;
}): Promise<string | null> {
  if (creditCostForTransparentDownload() === 0) {
    return null;
  }

  const transactionId = await beginStudioCreditTransaction({
    userId: input.userId,
    amount: creditCostForTransparentDownload(),
    reasonCode: reasonCodeForTransparentDownload(),
    renderId: input.renderId,
  });
  await completeStudioCreditTransaction(transactionId);
  return transactionId;
}

export async function beginGenerationCreditTransaction(input: {
  userId: number;
  imageCount: number;
  isRefinement: boolean;
  isRegenerate?: boolean;
  customCampaign?: boolean;
  outputResolution?: import("@workspace/studio-credit-engine").OutputResolution;
  renderId: number;
}): Promise<string> {
  const amount = creditCostForRequest(
    input.imageCount,
    input.isRefinement,
    input.isRegenerate,
    input.customCampaign,
    input.outputResolution ?? "2K",
  );
  const reasonCode = reasonCodeForRequest(
    input.imageCount,
    input.isRefinement,
    input.isRegenerate ?? false,
    input.customCampaign ?? false,
  );

  return beginStudioCreditTransaction({
    userId: input.userId,
    amount,
    reasonCode,
    renderId: input.renderId,
  });
}

export type { BillingCycleLedgerStats };

/**
 * Billing-cycle creative analytics from the Studio Credit ledger.
 * Uses completed credit transactions (historical) — not surviving render rows —
 * so Gallery asset deletion never rewrites cycle totals.
 */
export async function getBillingCycleLedgerStats(
  userId: number,
  tier?: string,
): Promise<BillingCycleLedgerStats> {
  const cycleStart = tier === "free" ? undefined : billingCycleStart();
  const studioCreditsUsed = await sumStudioCreditsUsed(userId, cycleStart);

  const cycleConditions = [
    eq(studioCreditTransactionsTable.userId, userId),
    eq(
      studioCreditTransactionsTable.status,
      StudioCreditTransactionStatus.COMPLETED,
    ),
    inArray(
      studioCreditTransactionsTable.reasonCode,
      STUDIO_CREDIT_USAGE_REASON_CODES as unknown as string[],
    ),
  ];

  if (cycleStart) {
    cycleConditions.push(gte(studioCreditTransactionsTable.createdAt, cycleStart));
  }

  const cycleTransactions = await db
    .select({
      reasonCode: studioCreditTransactionsTable.reasonCode,
    })
    .from(studioCreditTransactionsTable)
    .where(and(...cycleConditions));

  return computeBillingCycleLedgerStats({
    studioCreditsUsed,
    transactions: cycleTransactions,
  });
}
