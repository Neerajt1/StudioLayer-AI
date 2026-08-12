import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import {
  STUDIO_CREDIT_USAGE_REASON_CODES,
  StudioCreditTransactionStatus,
  adminStudioCreditBalance,
  computeBillingCycleLedgerStats,
  creditCostForRefine,
  creditCostForTransparentDownload,
  isStudioAdmin,
  billingCycleStartUtc,
  membershipAllowanceForTier,
  reasonCodeForImageRequest,
  reasonCodeForTransparentDownload,
  reasonCodeForGenerationType,
  resolveGenerationCreditCost,
  type BillingCycleLedgerStats,
  type GenerationType,
  type StudioCreditReasonCodeValue,
} from "@workspace/studio-credit-engine";
import {
  db,
  studioCreditTransactionsTable,
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
  await db
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
    );
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
  const since = input.tier === "free" ? undefined : billingCycleStart();
  const used = await sumStudioCreditsUsed(input.userId, since);
  const remaining = Math.max(0, allowance - used);
  const canRender = remaining >= 1;

  return {
    used,
    limit: allowance,
    remaining,
    canRender,
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
