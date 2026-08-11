import { and, asc, eq } from "drizzle-orm";
import {
  StudioCreditTransactionStatus,
  isStudioAdmin,
  membershipAllowanceForTier,
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
import {
  billableGenerationImagesForTransaction,
  countRenderOutcomes,
  deriveSessionActivityStatus,
  refinementRendersInSession,
  rendersForSession,
  resolveSessionIdForRender,
  resolveSessionIdForTransaction,
  rootRendersInSession,
} from "./billable-output.js";
import {
  applyMonthlyBalanceFields,
  computeLedgerRunningBalance as computeLedgerRunningBalanceFromHistory,
  type StatementBalanceContext,
} from "./balance-history.js";

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
  openingBalance: number;
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
  imagesRequested: number;
  imagesCompleted: number;
  imagesFailed: number;
  imagesGenerated: number;
  imagesRefined: number;
  creditsUsed: number;
  status: string;
}

function renderByIdMap(renders: Render[]): Map<number, Render> {
  return new Map(renders.map((render) => [render.id, render]));
}

/** Billable generation images in billing-cycle scope — render outcomes first, ledger fallback. */
export function computeStatementCycleImagesGenerated(
  ctx: AccountStatementContext,
): number {
  const isLifetime = ctx.user.subscriptionTier === "free";
  const renderById = renderByIdMap(ctx.renders);
  let total = 0;

  for (const tx of ctx.transactions) {
    if (!isGenerationReasonCode(tx.reasonCode)) continue;
    if (!isLifetime && tx.createdAt < ctx.cycleStart) continue;

    const sessionId = resolveSessionIdForTransaction(
      tx,
      renderById,
      ctx.deletionEvents,
    );
    const sessionRenders = rendersForSession(sessionId, ctx.renders);
    total += billableGenerationImagesForTransaction(tx, sessionRenders);
  }

  return total;
}

function statementBalanceContext(
  ctx: AccountStatementContext,
): StatementBalanceContext {
  return {
    allowance: ctx.allowance,
    tier: ctx.user.subscriptionTier,
    isAdmin: ctx.isAdmin,
    generatedAt: ctx.generatedAt,
    transactions: ctx.transactions,
    liveRemaining: ctx.balance.remaining,
  };
}

/** Membership allowance for the customer's plan — not a historical ledger balance. */
export function computeMembershipAllowance(ctx: AccountStatementContext): number {
  if (ctx.isAdmin) return 0;
  return ctx.allowance;
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

export function computeMonthlySummaryRows(
  ctx: AccountStatementContext,
): MonthlySummaryRow[] {
  const monthMap = new Map<string, MonthlySummaryRow>();

  const ensureMonth = (monthKey: string): MonthlySummaryRow => {
    const existing = monthMap.get(monthKey);
    if (existing) return existing;
    const row: MonthlySummaryRow = {
      monthKey,
      openingBalance: 0,
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
      const sessionId = resolveSessionIdForTransaction(
        tx,
        renderByIdMap(ctx.renders),
        ctx.deletionEvents,
      );
      const sessionRenders = rendersForSession(sessionId, ctx.renders);
      row.imagesGenerated += billableGenerationImagesForTransaction(
        tx,
        sessionRenders,
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
  const activityRows = sortedMonths.map((monthKey) => {
    const row = monthMap.get(monthKey)!;
    return {
      monthKey,
      creditsAdded: row.creditsAdded,
      creditsUsed: row.creditsUsed,
    };
  });
  const balanceFields = applyMonthlyBalanceFields(
    statementBalanceContext(ctx),
    activityRows,
  );

  return sortedMonths.map((monthKey, index) => {
    const row = monthMap.get(monthKey)!;
    const balances = balanceFields[index]!;
    row.openingBalance = balances.openingBalance;
    row.closingBalance = balances.closingBalance;
    return row;
  });
}

export function computeLedgerRunningBalance(
  ctx: AccountStatementContext,
  txIndex: number,
): number {
  return computeLedgerRunningBalanceFromHistory(
    statementBalanceContext(ctx),
    txIndex,
  );
}

export function computeCreativeActivityRows(
  ctx: AccountStatementContext,
): CreativeActivityRow[] {
  const renderById = renderByIdMap(ctx.renders);
  const sessionIds = new Set<string>();
  const creditsBySession = new Map<string, number>();

  for (const render of ctx.renders) {
    sessionIds.add(resolveSessionIdForRender(render));
  }

  for (const event of ctx.deletionEvents) {
    if (event.generationSessionId) {
      sessionIds.add(event.generationSessionId);
    }
  }

  for (const tx of ctx.transactions) {
    if (!isUsageReasonCode(tx.reasonCode)) continue;

    const sessionId = resolveSessionIdForTransaction(
      tx,
      renderById,
      ctx.deletionEvents,
    );
    sessionIds.add(sessionId);
    creditsBySession.set(
      sessionId,
      (creditsBySession.get(sessionId) ?? 0) + Math.abs(tx.amount),
    );
  }

  return [...sessionIds]
    .map((sessionId) => {
      const sessionRenders = rendersForSession(sessionId, ctx.renders);
      const roots = rootRendersInSession(sessionRenders);
      const refinements = refinementRendersInSession(sessionRenders);
      const rootOutcomes = countRenderOutcomes(roots);
      const refinementOutcomes = countRenderOutcomes(refinements);
      const status = deriveSessionActivityStatus(rootOutcomes);

      let dateTime = ctx.generatedAt;
      let generationType = "—";

      for (const render of sessionRenders) {
        if (render.createdAt < dateTime) {
          dateTime = render.createdAt;
        }
        if (generationType === "—") {
          generationType = render.generationType;
        }
      }

      for (const tx of ctx.transactions) {
        if (!isUsageReasonCode(tx.reasonCode)) continue;
        if (
          resolveSessionIdForTransaction(tx, renderById, ctx.deletionEvents)
          !== sessionId
        ) {
          continue;
        }
        if (tx.createdAt < dateTime) {
          dateTime = tx.createdAt;
        }
        if (generationType === "—" && isGenerationReasonCode(tx.reasonCode)) {
          generationType = tx.reasonCode.replace("_generation", "");
        }
      }

      const imagesCompleted = rootOutcomes.completed;
      const imagesGenerated =
        status === "Failed" && imagesCompleted === 0
          ? 0
          : imagesCompleted;
      const imagesRefined =
        status === "Failed" && refinementOutcomes.completed === 0
          ? 0
          : refinementOutcomes.completed;
      const creditsUsed = creditsBySession.get(sessionId) ?? 0;

      return {
        sessionId,
        dateTime,
        generationType,
        imagesRequested: rootOutcomes.requested,
        imagesCompleted,
        imagesFailed: rootOutcomes.failed,
        imagesGenerated,
        imagesRefined,
        creditsUsed,
        status,
      };
    })
    .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
}
