import { and, asc, eq } from "drizzle-orm";
import {
  StudioCreditTransactionStatus,
  imagesCreatedForReasonCode,
  isStudioAdmin,
  membershipAllowanceForTier,
  type StudioCreditReasonCodeValue,
} from "@workspace/studio-credit-engine";
import {
  db,
  renderDeletionEventsTable,
  rendersTable,
  studioCreditTransactionsTable,
  usersTable,
  type Render,
  type RenderDeletionEvent,
  type StudioCreditTransaction,
  type User,
} from "@workspace/db";
import {
  billingCycleStart,
  getBillingCycleLedgerStats,
  getStudioCreditBalance,
} from "../studio-credit-service.js";
import { reconcileStaleCommercialState } from "../generation-idempotency.js";
import {
  formatMonthKey,
  isGenerationReasonCode,
  isMembershipAllocationReasonCode,
  isPromotionalReasonCode,
  isPurchasedReasonCode,
  isRefinementReasonCode,
  isUsageReasonCode,
} from "./labels.js";

export interface AccountStatementContext {
  user: User;
  generatedAt: Date;
  allowance: number;
  isAdmin: boolean;
  balance: Awaited<ReturnType<typeof getStudioCreditBalance>>;
  cycleStats: Awaited<ReturnType<typeof getBillingCycleLedgerStats>>;
  cycleStart: Date;
  transactions: StudioCreditTransaction[];
  renders: Render[];
  deletionEvents: RenderDeletionEvent[];
  creditsPurchasedInCycle: number;
  promotionalCreditsInCycle: number;
  totalCreditsAddedInCycle: number;
  imagesDeletedInCycle: number;
  allTimeImagesDeleted: number;
}

export interface MonthlySummaryRow {
  monthKey: string;
  creditsAdded: number;
  creditsUsed: number;
  imagesGenerated: number;
  refinements: number;
  imagesDeleted: number;
  closingBalance: number;
}

export interface CreativeActivityRow {
  sessionId: string;
  dateTime: Date;
  generationType: string;
  imagesGenerated: number;
  imagesRefined: number;
  creditsUsed: number;
  status: string;
}

export async function loadAccountStatementContext(
  userId: number,
): Promise<AccountStatementContext | null> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) return null;

  await reconcileStaleCommercialState(userId);

  const generatedAt = new Date();
  const cycleStart = billingCycleStart(generatedAt);
  const limit = null;
  const allowance = membershipAllowanceForTier(user.subscriptionTier, limit);
  const isAdmin = isStudioAdmin(user);

  const [balance, cycleStats, transactions, renders, deletionEvents] =
    await Promise.all([
      getStudioCreditBalance({
        userId,
        tier: user.subscriptionTier,
        limit,
        isAdmin: user.isAdmin,
      }),
      getBillingCycleLedgerStats(userId, user.subscriptionTier),
      db
        .select()
        .from(studioCreditTransactionsTable)
        .where(
          and(
            eq(studioCreditTransactionsTable.userId, userId),
            eq(
              studioCreditTransactionsTable.status,
              StudioCreditTransactionStatus.COMPLETED,
            ),
          ),
        )
        .orderBy(
          asc(studioCreditTransactionsTable.createdAt),
          asc(studioCreditTransactionsTable.id),
        ),
      db
        .select()
        .from(rendersTable)
        .where(eq(rendersTable.userId, userId))
        .orderBy(asc(rendersTable.createdAt)),
      db
        .select()
        .from(renderDeletionEventsTable)
        .where(eq(renderDeletionEventsTable.userId, userId))
        .orderBy(asc(renderDeletionEventsTable.deletedAt)),
    ]);

  const cycleTransactions = transactions.filter(
    (tx) => tx.createdAt >= cycleStart,
  );

  let creditsPurchasedInCycle = 0;
  let promotionalCreditsInCycle = 0;
  let membershipCreditsInCycle = 0;

  for (const tx of cycleTransactions) {
    if (tx.amount <= 0) continue;
    if (isPurchasedReasonCode(tx.reasonCode)) {
      creditsPurchasedInCycle += tx.amount;
    } else if (isPromotionalReasonCode(tx.reasonCode)) {
      promotionalCreditsInCycle += tx.amount;
    } else if (isMembershipAllocationReasonCode(tx.reasonCode)) {
      membershipCreditsInCycle += tx.amount;
    }
  }

  const totalCreditsAddedInCycle =
    creditsPurchasedInCycle +
    promotionalCreditsInCycle +
    membershipCreditsInCycle;

  const imagesDeletedInCycle = deletionEvents.filter(
    (event) => event.deletedAt >= cycleStart,
  ).length;

  return {
    user,
    generatedAt,
    allowance,
    isAdmin,
    balance,
    cycleStats,
    cycleStart,
    transactions,
    renders,
    deletionEvents,
    creditsPurchasedInCycle,
    promotionalCreditsInCycle,
    totalCreditsAddedInCycle,
    imagesDeletedInCycle,
    allTimeImagesDeleted: deletionEvents.length,
  };
}

export function computeOpeningCreditBalance(ctx: AccountStatementContext): number {
  if (ctx.isAdmin) return 0;
  return ctx.allowance;
}

export function computeMonthlySummaryRows(
  ctx: AccountStatementContext,
): MonthlySummaryRow[] {
  const monthMap = new Map<string, MonthlySummaryRow>();

  const ensureMonth = (monthKey: string): MonthlySummaryRow => {
    const existing = monthMap.get(monthKey);
    if (existing) return existing;
    const row: MonthlySummaryRow = {
      monthKey,
      creditsAdded: 0,
      creditsUsed: 0,
      imagesGenerated: 0,
      refinements: 0,
      imagesDeleted: 0,
      closingBalance: 0,
    };
    monthMap.set(monthKey, row);
    return row;
  };

  for (const tx of ctx.transactions) {
    const monthKey = formatMonthKey(tx.createdAt);
    const row = ensureMonth(monthKey);

    if (tx.amount > 0) {
      row.creditsAdded += tx.amount;
    } else if (isUsageReasonCode(tx.reasonCode)) {
      row.creditsUsed += Math.abs(tx.amount);
    }

    if (isGenerationReasonCode(tx.reasonCode)) {
      row.imagesGenerated += imagesCreatedForReasonCode(
        tx.reasonCode as StudioCreditReasonCodeValue,
      );
    } else if (isRefinementReasonCode(tx.reasonCode)) {
      row.refinements += 1;
    }
  }

  for (const event of ctx.deletionEvents) {
    const monthKey = formatMonthKey(event.deletedAt);
    ensureMonth(monthKey).imagesDeleted += 1;
  }

  if (monthMap.size === 0) {
    ensureMonth(formatMonthKey(ctx.generatedAt));
  }

  const sortedMonths = [...monthMap.keys()].sort();
  let cumulativeAdded = 0;
  let cumulativeUsed = 0;

  for (const monthKey of sortedMonths) {
    const row = monthMap.get(monthKey)!;

    if (ctx.user.subscriptionTier === "free") {
      cumulativeAdded = ctx.allowance;
      cumulativeUsed += row.creditsUsed;
      row.closingBalance = Math.max(0, cumulativeAdded - cumulativeUsed);
    } else {
      row.closingBalance = Math.max(
        0,
        ctx.allowance + row.creditsAdded - row.creditsUsed,
      );
    }
  }

  if (
    ctx.user.subscriptionTier !== "free" &&
    sortedMonths.length > 0
  ) {
    const currentMonthKey = formatMonthKey(ctx.generatedAt);
    const currentRow = monthMap.get(currentMonthKey);
    if (currentRow) {
      currentRow.closingBalance = ctx.isAdmin
        ? 0
        : Math.max(0, ctx.balance.remaining);
    }
  }

  return sortedMonths.map((monthKey) => monthMap.get(monthKey)!);
}

export function computeLedgerRunningBalance(
  ctx: AccountStatementContext,
  txIndex: number,
): number {
  if (ctx.isAdmin) return 0;

  let cycleUsed = 0;
  let cycleAdded = 0;
  const tx = ctx.transactions[txIndex];
  const txMonth = formatMonthKey(tx.createdAt);

  for (let i = 0; i <= txIndex; i += 1) {
    const current = ctx.transactions[i];

    if (
      ctx.user.subscriptionTier !== "free" &&
      formatMonthKey(current.createdAt) !== txMonth
    ) {
      continue;
    }

    if (current.amount > 0) {
      cycleAdded += current.amount;
    } else if (isUsageReasonCode(current.reasonCode)) {
      cycleUsed += Math.abs(current.amount);
    }
  }

  return Math.max(0, ctx.allowance + cycleAdded - cycleUsed);
}

export function computeCreativeActivityRows(
  ctx: AccountStatementContext,
): CreativeActivityRow[] {
  const renderById = new Map(ctx.renders.map((render) => [render.id, render]));
  const sessionIds = new Set<string>();

  const sessionIdForRender = (render: Render): string =>
    render.generationSessionId ?? `session-render-${render.id}`;

  const rendersForSession = (sessionId: string): Render[] =>
    ctx.renders.filter((render) => sessionIdForRender(render) === sessionId);

  for (const render of ctx.renders) {
    if (render.generationSessionId) {
      sessionIds.add(render.generationSessionId);
    }
  }

  for (const event of ctx.deletionEvents) {
    if (event.generationSessionId) {
      sessionIds.add(event.generationSessionId);
    }
  }

  const sessionMeta = new Map<
    string,
    {
      dateTime: Date;
      generationType: string;
      imagesGenerated: number;
      imagesRefined: number;
      creditsUsed: number;
      status: string;
    }
  >();

  const ensureSession = (sessionId: string) => {
    if (!sessionMeta.has(sessionId)) {
      sessionMeta.set(sessionId, {
        dateTime: ctx.generatedAt,
        generationType: "—",
        imagesGenerated: 0,
        imagesRefined: 0,
        creditsUsed: 0,
        status: "Completed",
      });
    }
    return sessionMeta.get(sessionId)!;
  };

  for (const render of ctx.renders) {
    const sessionId = sessionIdForRender(render);
    sessionIds.add(sessionId);
    const meta = ensureSession(sessionId);
    if (render.createdAt < meta.dateTime) {
      meta.dateTime = render.createdAt;
    }
    if (meta.generationType === "—") {
      meta.generationType = render.generationType;
    }
    if (render.status === "failed") {
      meta.status = "Failed";
    }
  }

  for (const tx of ctx.transactions) {
    if (!isUsageReasonCode(tx.reasonCode)) continue;

    const render = tx.renderId != null ? renderById.get(tx.renderId) : null;
    const sessionId =
      render?.generationSessionId ??
      ctx.deletionEvents.find((event) => event.renderId === tx.renderId)
        ?.generationSessionId ??
      (tx.renderId != null ? `session-render-${tx.renderId}` : `session-tx-${tx.id}`);

    sessionIds.add(sessionId);
    const sessionRenders = rendersForSession(sessionId);
    const sessionAllFailed =
      sessionRenders.length > 0
      && sessionRenders.every((row) => row.status === "failed");
    if (sessionAllFailed) {
      continue;
    }

    const meta = ensureSession(sessionId);

    if (tx.createdAt < meta.dateTime) {
      meta.dateTime = tx.createdAt;
    }

    meta.creditsUsed += Math.abs(tx.amount);

    if (isGenerationReasonCode(tx.reasonCode)) {
      meta.imagesGenerated += imagesCreatedForReasonCode(
        tx.reasonCode as StudioCreditReasonCodeValue,
      );
      meta.generationType = tx.reasonCode.replace("_generation", "");
    } else if (isRefinementReasonCode(tx.reasonCode)) {
      meta.imagesRefined += 1;
    }
  }

  return [...sessionIds]
    .map((sessionId) => {
      const meta = ensureSession(sessionId);
      const sessionRenders = rendersForSession(sessionId);
      const sessionAllFailed =
        sessionRenders.length > 0
        && sessionRenders.every((row) => row.status === "failed");
      const sessionAnyCompleted = sessionRenders.some(
        (row) => row.status === "completed",
      );

      if (sessionAllFailed || (!sessionAnyCompleted && meta.status === "Failed")) {
        meta.creditsUsed = 0;
        meta.status = "Failed";
      }

      return {
        sessionId,
        dateTime: meta.dateTime,
        generationType: meta.generationType,
        imagesGenerated: meta.imagesGenerated,
        imagesRefined: meta.imagesRefined,
        creditsUsed: meta.creditsUsed,
        status: meta.status,
      };
    })
    .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
}
