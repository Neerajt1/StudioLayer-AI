// ---------------------------------------------------------------------------
// Batch 24A — Commercial Reconciliation Report
//
// Internal diagnostic: answers "Is this user's commercial state consistent?"
// Single source of truth comparisons across membership, balance, ledger,
// gallery, account statement, and asset lineage.
// ---------------------------------------------------------------------------

import { and, eq, inArray } from "drizzle-orm";
import {
  STUDIO_CREDIT_USAGE_REASON_CODES,
  StudioCreditTransactionStatus,
  isStudioAdmin,
  membershipAllowanceForTier,
  membershipCreditsRemaining,
  type StudioCreditReasonCodeValue,
} from "@workspace/studio-credit-engine";
import {
  db,
  rendersTable,
  studioCreditTransactionsTable,
  usersTable,
  type Render,
} from "@workspace/db";
import {
  billingCycleStart,
  getStudioCreditBalance,
  sumPendingStudioCreditsHeld,
  sumStudioCreditsUsed,
} from "./studio-credit-service.js";
import { getBillingCycleActivityStats } from "./account-statement/billing-cycle-activity.js";
import {
  loadAccountStatementContext,
  computeMonthlySummaryRows,
} from "./account-statement/data.js";
import {
  computeBillingCycleBalanceSummary,
  finalLedgerRunningBalance,
} from "./account-statement/balance-history.js";
import {
  assetTypeFromRefinementType,
  MASTER_ASSET_VERSION,
} from "./image-architecture/asset-lineage.js";
import { resolveMasterRenderId } from "./image-architecture/master-asset.js";
import { isRefinementType } from "./refinement/refinement-types.js";
import { isRefinementReasonCode, formatMonthKey } from "./account-statement/labels.js";

const KNOWN_TIERS = new Set(["free", "pro", "enterprise"]);
const ACTIVE_RENDER_STATUSES = ["pending", "processing"] as const;
const STALE_TTL_MS = 20 * 60 * 1000;

export type ReconciliationDomain =
  | "membership"
  | "balance"
  | "ledger"
  | "gallery"
  | "accountStatement"
  | "assetLineage"
  | "database";

export interface CommercialMismatch {
  domain: ReconciliationDomain;
  check: string;
  expected: unknown;
  actual: unknown;
  detail: string;
}

export interface CommercialReconciliationReport {
  status: "PASS" | "FAIL";
  userId: number;
  checkedAt: string;
  mismatchCount: number;
  mismatches: CommercialMismatch[];
  snapshot: {
    membership: {
      tier: string;
      allowance: number;
      isAdmin: boolean;
    };
    balance: {
      used: number;
      remaining: number;
      limit: number | null;
      canRender: boolean;
    };
    usageApi: {
      used: number;
      remaining: number | null;
      limit: number | null;
      cycleStats: Awaited<ReturnType<typeof getBillingCycleActivityStats>>;
    };
    ledger: {
      completedUsageTotal: number;
      scopedUsageTotal: number;
      pendingTransactionCount: number;
      stalePendingTransactionCount: number;
      refinementCountInScope: number;
    };
    gallery: {
      cycleStats: Awaited<ReturnType<typeof getBillingCycleActivityStats>>;
    };
    accountStatement: {
      balanceUsed: number;
      balanceRemaining: number;
      cycleCreditsUsed: number;
      cycleImagesCreated: number;
      refinementsInScope: number;
    };
    assetLineage: {
      renderCount: number;
      masterCount: number;
      lineageIssueCount: number;
    };
    database: {
      inFlightRenderCount: number;
      staleInFlightRenderCount: number;
    };
  };
}

function pushMismatch(
  mismatches: CommercialMismatch[],
  entry: CommercialMismatch,
): void {
  mismatches.push(entry);
}

function numbersEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.0001;
}

function countRefinementsInScope(
  transactions: Array<{ createdAt: Date; reasonCode: string }>,
  tier: string,
  cycleStart: Date,
): number {
  const isLifetime = tier === "free";

  return transactions.filter(
    (tx) =>
      (isLifetime || tx.createdAt >= cycleStart)
      && isRefinementReasonCode(tx.reasonCode),
  ).length;
}

function validateAssetLineage(
  renders: Render[],
  mismatches: CommercialMismatch[],
): number {
  const byId = new Map(renders.map((render) => [render.id, render]));
  let issueCount = 0;

  for (const render of renders) {
    const renderLabel = `render ${render.id}`;

    if (render.parentRenderId == null) {
      if (render.assetVersion !== MASTER_ASSET_VERSION) {
        issueCount += 1;
        pushMismatch(mismatches, {
          domain: "assetLineage",
          check: "master_asset_version",
          expected: MASTER_ASSET_VERSION,
          actual: render.assetVersion,
          detail: `${renderLabel} is a root asset but assetVersion is not 1`,
        });
      }

      if (
        render.assetType !== "master"
        && render.assetType !== "legacy_refinement"
      ) {
        issueCount += 1;
        pushMismatch(mismatches, {
          domain: "assetLineage",
          check: "master_asset_type",
          expected: "master",
          actual: render.assetType,
          detail: `${renderLabel} is a root asset but assetType is not master`,
        });
      }

      if (
        render.masterRenderId != null
        && render.masterRenderId !== render.id
      ) {
        issueCount += 1;
        pushMismatch(mismatches, {
          domain: "assetLineage",
          check: "master_self_reference",
          expected: render.id,
          actual: render.masterRenderId,
          detail: `${renderLabel} masterRenderId should reference itself`,
        });
      }

      continue;
    }

    const parent = byId.get(render.parentRenderId);
    if (!parent) {
      issueCount += 1;
      pushMismatch(mismatches, {
        domain: "assetLineage",
        check: "parent_exists",
        expected: `parent ${render.parentRenderId}`,
        actual: null,
        detail: `${renderLabel} references missing parent ${render.parentRenderId}`,
      });
      continue;
    }

    if (render.masterRenderId != null) {
      const resolvedMasterId = resolveMasterRenderId(render, (id) => byId.get(id) ?? null);
      if (render.masterRenderId !== resolvedMasterId) {
        issueCount += 1;
        pushMismatch(mismatches, {
          domain: "assetLineage",
          check: "master_render_id",
          expected: resolvedMasterId,
          actual: render.masterRenderId,
          detail: `${renderLabel} masterRenderId does not match parent chain root`,
        });
      }
    }

    if (
      render.sourceAssetVersion != null
      && render.sourceAssetVersion !== parent.assetVersion
    ) {
      issueCount += 1;
      pushMismatch(mismatches, {
        domain: "assetLineage",
        check: "source_asset_version",
        expected: parent.assetVersion,
        actual: render.sourceAssetVersion,
        detail: `${renderLabel} sourceAssetVersion does not match parent version`,
      });
    }

    if (render.assetVersion !== parent.assetVersion + 1) {
      issueCount += 1;
      pushMismatch(mismatches, {
        domain: "assetLineage",
        check: "asset_version_increment",
        expected: parent.assetVersion + 1,
        actual: render.assetVersion,
        detail: `${renderLabel} assetVersion should be parent version + 1`,
      });
    }

    if (render.refinementType && isRefinementType(render.refinementType)) {
      const expectedType = assetTypeFromRefinementType(render.refinementType);
      if (render.assetType !== expectedType && render.assetType !== "legacy_refinement") {
        issueCount += 1;
        pushMismatch(mismatches, {
          domain: "assetLineage",
          check: "refinement_asset_type",
          expected: expectedType,
          actual: render.assetType,
          detail: `${renderLabel} assetType does not match refinementType`,
        });
      }
    }
  }

  return issueCount;
}

export async function runCommercialReconciliation(
  userId: number,
): Promise<CommercialReconciliationReport | null> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) return null;

  const checkedAt = new Date().toISOString();
  const mismatches: CommercialMismatch[] = [];
  const limit = null;
  const cycleStart = billingCycleStart();
  const since = user.subscriptionTier === "free" ? undefined : cycleStart;

  const [
    balance,
    pendingHeld,
    cycleStats,
    statementCtx,
    allCompletedTransactions,
    allTransactions,
    renders,
    inFlightRenders,
  ] = await Promise.all([
    getStudioCreditBalance({
      userId,
      tier: user.subscriptionTier,
      limit,
      isAdmin: user.isAdmin,
    }),
    sumPendingStudioCreditsHeld(userId),
    getBillingCycleActivityStats(userId, user.subscriptionTier),
    loadAccountStatementContext(userId),
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
          inArray(
            studioCreditTransactionsTable.reasonCode,
            STUDIO_CREDIT_USAGE_REASON_CODES as unknown as string[],
          ),
        ),
      ),
    db
      .select()
      .from(studioCreditTransactionsTable)
      .where(eq(studioCreditTransactionsTable.userId, userId)),
    db
      .select()
      .from(rendersTable)
      .where(eq(rendersTable.userId, userId)),
    db
      .select()
      .from(rendersTable)
      .where(
        and(
          eq(rendersTable.userId, userId),
          inArray(rendersTable.status, [...ACTIVE_RENDER_STATUSES]),
        ),
      ),
  ]);

  const allowance = membershipAllowanceForTier(user.subscriptionTier, limit);
  const scopedUsageTotal = await sumStudioCreditsUsed(userId, since);
  const lifetimeUsageTotal = await sumStudioCreditsUsed(userId);

  const scopedCompletedTotal = allCompletedTransactions
    .filter((tx) => since == null || tx.createdAt >= since)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const pendingTransactions = allTransactions.filter(
    (tx) => tx.status === StudioCreditTransactionStatus.PENDING,
  );

  const staleCutoff = new Date(Date.now() - STALE_TTL_MS);
  const stalePendingTransactions = pendingTransactions.filter(
    (tx) => tx.createdAt < staleCutoff,
  );

  const staleInFlightRenders = inFlightRenders.filter(
    (render) => render.updatedAt < staleCutoff,
  );

  const refinementCountInScope = countRefinementsInScope(
    allCompletedTransactions,
    user.subscriptionTier,
    cycleStart,
  );

  const masterCount = renders.filter((render) => render.parentRenderId == null).length;
  const lineageIssueCount = validateAssetLineage(renders, mismatches);

  // ── Membership ───────────────────────────────────────────────────────────
  if (!KNOWN_TIERS.has(user.subscriptionTier)) {
    pushMismatch(mismatches, {
      domain: "membership",
      check: "known_tier",
      expected: [...KNOWN_TIERS],
      actual: user.subscriptionTier,
      detail: "subscriptionTier is not a recognised membership plan",
    });
  }

  if (!isStudioAdmin(user) && allowance <= 0) {
    pushMismatch(mismatches, {
      domain: "membership",
      check: "positive_allowance",
      expected: "> 0",
      actual: allowance,
      detail: "Non-admin user has zero membership allowance",
    });
  }

  // ── Balance (skip arithmetic for admin unlimited accounts) ───────────────
  if (!isStudioAdmin(user)) {
    const membershipRemaining = membershipCreditsRemaining(
      user.subscriptionTier,
      balance.used,
      limit,
    );

    if (!numbersEqual(balance.remaining, membershipRemaining)) {
      pushMismatch(mismatches, {
        domain: "balance",
        check: "membership_remaining_formula",
        expected: membershipRemaining,
        actual: balance.remaining,
        detail: "remaining credits do not match allowance − used (membership formula)",
      });
    }

    if (!numbersEqual(balance.remaining, Math.max(0, allowance - balance.used))) {
      pushMismatch(mismatches, {
        domain: "balance",
        check: "allowance_minus_used",
        expected: Math.max(0, allowance - balance.used),
        actual: balance.remaining,
        detail: "remaining credits do not match allowance − used",
      });
    }

    if (!numbersEqual(balance.used, scopedUsageTotal)) {
      pushMismatch(mismatches, {
        domain: "balance",
        check: "used_vs_ledger_scope",
        expected: scopedUsageTotal,
        actual: balance.used,
        detail: "used credits do not match scoped ledger sum",
      });
    }

    if (!numbersEqual(balance.limit ?? 0, allowance)) {
      pushMismatch(mismatches, {
        domain: "balance",
        check: "limit_vs_allowance",
        expected: allowance,
        actual: balance.limit,
        detail: "balance.limit does not match membership allowance",
      });
    }
  }

  // ── Ledger ─────────────────────────────────────────────────────────────────
  if (!numbersEqual(scopedCompletedTotal, scopedUsageTotal)) {
    pushMismatch(mismatches, {
      domain: "ledger",
      check: "scoped_completed_transactions",
      expected: scopedUsageTotal,
      actual: scopedCompletedTotal,
      detail: "scoped completed transaction sum does not match sumStudioCreditsUsed",
    });
  }

  for (const tx of allCompletedTransactions) {
    if (tx.renderId == null) continue;
    const linkedRender = renders.find((render) => render.id === tx.renderId);
    if (!linkedRender) {
      pushMismatch(mismatches, {
        domain: "ledger",
        check: "transaction_render_link",
        expected: `render ${tx.renderId}`,
        actual: null,
        detail: `Completed transaction ${tx.transactionId} references missing render ${tx.renderId}`,
      });
    }
  }

  if (pendingTransactions.length > 0) {
    pushMismatch(mismatches, {
      domain: "ledger",
      check: "no_pending_transactions",
      expected: 0,
      actual: pendingTransactions.length,
      detail: "Pending credit transactions exist — balance may be indeterminate until finalized",
    });
  }

  if (stalePendingTransactions.length > 0) {
    pushMismatch(mismatches, {
      domain: "ledger",
      check: "no_stale_pending_transactions",
      expected: 0,
      actual: stalePendingTransactions.length,
      detail: "Stale pending credit transactions exceed reconciliation TTL",
    });
  }

  // ── Gallery / usage API ────────────────────────────────────────────────────
  if (!numbersEqual(cycleStats.studioCreditsUsed, balance.used)) {
    pushMismatch(mismatches, {
      domain: "gallery",
      check: "cycle_stats_vs_balance_used",
      expected: balance.used,
      actual: cycleStats.studioCreditsUsed,
      detail: "Gallery cycleStats.studioCreditsUsed does not match balance.used",
    });
  }

  const usageApiRemaining = isStudioAdmin(user) ? null : balance.remaining;
  const usageApiLimit = isStudioAdmin(user) ? null : balance.limit;

  // ── Account Statement ─────────────────────────────────────────────────────
  if (statementCtx) {
    if (!isStudioAdmin(user)) {
      if (!numbersEqual(statementCtx.balance.used, balance.used)) {
        pushMismatch(mismatches, {
          domain: "accountStatement",
          check: "statement_balance_used",
          expected: balance.used,
          actual: statementCtx.balance.used,
          detail: "Account Statement balance.used does not match live balance",
        });
      }

      if (!numbersEqual(statementCtx.balance.remaining, balance.remaining)) {
        pushMismatch(mismatches, {
          domain: "accountStatement",
          check: "statement_balance_remaining",
          expected: balance.remaining,
          actual: statementCtx.balance.remaining,
          detail: "Account Statement balance.remaining does not match live balance",
        });
      }
    }

    if (!numbersEqual(statementCtx.cycleStats.studioCreditsUsed, cycleStats.studioCreditsUsed)) {
      pushMismatch(mismatches, {
        domain: "accountStatement",
        check: "statement_cycle_credits_used",
        expected: cycleStats.studioCreditsUsed,
        actual: statementCtx.cycleStats.studioCreditsUsed,
        detail: "Account Statement cycleStats.studioCreditsUsed mismatch",
      });
    }

    if (!numbersEqual(statementCtx.cycleStats.imagesCreated, cycleStats.imagesCreated)) {
      pushMismatch(mismatches, {
        domain: "accountStatement",
        check: "statement_cycle_images_created",
        expected: cycleStats.imagesCreated,
        actual: statementCtx.cycleStats.imagesCreated,
        detail: "Account Statement cycleStats.imagesCreated mismatch",
      });
    }

    const statementRefinements = countRefinementsInScope(
      statementCtx.transactions,
      user.subscriptionTier,
      statementCtx.cycleStart,
    );

    if (statementRefinements !== refinementCountInScope) {
      pushMismatch(mismatches, {
        domain: "accountStatement",
        check: "statement_refinement_count",
        expected: refinementCountInScope,
        actual: statementRefinements,
        detail: "Account Statement refinement count does not match ledger scope",
      });
    }

    // Exclude membership_allocation ledger rows — allowance already represents
    // the membership pool. Include purchased + promotional only.
    const cycleBalance = computeBillingCycleBalanceSummary({
      allowance,
      creditsAddedInCycle:
        statementCtx.creditsPurchasedInCycle +
        statementCtx.promotionalCreditsInCycle,
      creditsUsedInCycle: balance.used,
      liveRemaining: balance.remaining,
      pendingHeld,
    });

    if (!cycleBalance.matchesLiveRemaining) {
      pushMismatch(mismatches, {
        domain: "accountStatement",
        check: "statement_cycle_balance_equation",
        expected: balance.remaining,
        actual: cycleBalance.computedClosing,
        detail:
          "Membership allowance + purchased/promo credits − cycle credits used − pending holds does not match live remaining balance",
      });
    }

    const monthlyRows = computeMonthlySummaryRows(statementCtx);
    const currentMonthKey = formatMonthKey(statementCtx.generatedAt);
    const currentMonthRow = monthlyRows.find(
      (row) => row.monthKey === currentMonthKey,
    );

    if (
      currentMonthRow &&
      !numbersEqual(currentMonthRow.closingBalance, balance.remaining)
    ) {
      pushMismatch(mismatches, {
        domain: "accountStatement",
        check: "statement_current_month_closing",
        expected: balance.remaining,
        actual: currentMonthRow.closingBalance,
        detail: "Monthly Summary current-month closing does not match live remaining balance",
      });
    }

    for (const row of monthlyRows) {
      const expectedClosing = Math.max(
        0,
        row.openingBalance + row.creditsAdded - row.creditsUsed,
      );
      const isCurrentMonth = row.monthKey === currentMonthKey;
      const actualClosing = row.closingBalance;

      if (
        !isCurrentMonth &&
        !numbersEqual(actualClosing, expectedClosing)
      ) {
        pushMismatch(mismatches, {
          domain: "accountStatement",
          check: "statement_monthly_balance_arithmetic",
          expected: expectedClosing,
          actual: actualClosing,
          detail: `Monthly Summary balance arithmetic mismatch for ${row.monthKey}`,
        });
      }
    }

    if (
      !isStudioAdmin(user) &&
      statementCtx.transactions.some((tx) => tx.createdAt >= statementCtx.cycleStart)
    ) {
      const ledgerFinal = finalLedgerRunningBalance({
        allowance,
        tier: user.subscriptionTier,
        isAdmin: false,
        generatedAt: statementCtx.generatedAt,
        transactions: statementCtx.transactions,
        liveRemaining: balance.remaining,
      });

      if (!numbersEqual(ledgerFinal, balance.remaining)) {
        pushMismatch(mismatches, {
          domain: "accountStatement",
          check: "statement_ledger_final_running_balance",
          expected: balance.remaining,
          actual: ledgerFinal,
          detail:
            "Final Studio Credit Ledger running balance does not match live remaining balance",
        });
      }
    }
  } else {
    pushMismatch(mismatches, {
      domain: "accountStatement",
      check: "statement_context_loaded",
      expected: "loaded",
      actual: null,
      detail: "Account Statement context could not be loaded",
    });
  }

  // ── Database integrity ─────────────────────────────────────────────────────
  if (staleInFlightRenders.length > 0) {
    pushMismatch(mismatches, {
      domain: "database",
      check: "no_stale_in_flight_renders",
      expected: 0,
      actual: staleInFlightRenders.length,
      detail: "Stale pending/processing renders block generation deduplication",
    });
  }

  return {
    status: mismatches.length === 0 ? "PASS" : "FAIL",
    userId,
    checkedAt,
    mismatchCount: mismatches.length,
    mismatches,
    snapshot: {
      membership: {
        tier: user.subscriptionTier,
        allowance,
        isAdmin: user.isAdmin,
      },
      balance: {
        used: balance.used,
        remaining: balance.remaining,
        limit: balance.limit,
        canRender: balance.canRender,
      },
      usageApi: {
        used: balance.used,
        remaining: usageApiRemaining,
        limit: usageApiLimit,
        cycleStats,
      },
      ledger: {
        completedUsageTotal: lifetimeUsageTotal,
        scopedUsageTotal,
        pendingTransactionCount: pendingTransactions.length,
        stalePendingTransactionCount: stalePendingTransactions.length,
        refinementCountInScope,
      },
      gallery: {
        cycleStats,
      },
      accountStatement: {
        balanceUsed: statementCtx?.balance.used ?? -1,
        balanceRemaining: statementCtx?.balance.remaining ?? -1,
        cycleCreditsUsed: statementCtx?.cycleStats.studioCreditsUsed ?? -1,
        cycleImagesCreated: statementCtx?.cycleStats.imagesCreated ?? -1,
        refinementsInScope: statementCtx
          ? countRefinementsInScope(
            statementCtx.transactions,
            user.subscriptionTier,
            statementCtx.cycleStart,
          )
          : -1,
      },
      assetLineage: {
        renderCount: renders.length,
        masterCount,
        lineageIssueCount,
      },
      database: {
        inFlightRenderCount: inFlightRenders.length,
        staleInFlightRenderCount: staleInFlightRenders.length,
      },
    },
  };
}
