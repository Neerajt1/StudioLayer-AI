import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { getStudioCreditBalance } from "./studio-credit-service.js";
import {
  mapTransactionMasterCreditsToCreditHeads,
  mapTransactionMasterCreditsToPeriodSummary,
  type AdminStudioCreditsCreditHeadSummary,
  type AdminStudioCreditsPeriodSummary,
} from "./admin-studio-credits-mapping.js";
import {
  loadCreditExpirationEvents,
  loadCreditGrantEvents,
  loadCreditUsageEvents,
  summarizeCredits,
  summarizeExpiration,
  summarizeUsage,
  type CreditExpirationEvent,
  type CreditGrantEvent,
  type CreditUsageEvent,
} from "./transaction-master/index.js";

export type {
  AdminStudioCreditsCreditHeadSummary,
  AdminStudioCreditsPeriodSummary,
} from "./admin-studio-credits-mapping.js";
export {
  mapTransactionMasterCreditsToCreditHeads,
  mapTransactionMasterCreditsToPeriodSummary,
} from "./admin-studio-credits-mapping.js";

const BALANCE_BATCH_SIZE = 20;

/** Period filters for TM — matches prior Admin Studio Credits ledger scope. */
const PERIOD_TM_FILTER = { excludeAdmins: false as const };
/** Expiration filters — matches prior Admin expiration (non-admin customers). */
const EXPIRATION_TM_FILTER = { excludeAdmins: true as const };

export interface AdminStudioCreditsCurrentPosition {
  totalCreditsRemaining: number;
  customersWithPositiveBalance: number;
}

export interface AdminCreditExpirationOverview {
  dateRange: {
    fromDate: string;
    toDate: string;
  };
  totalCreditsExpiring: number;
  customersAffected: number;
  byDate: Array<{
    date: string;
    creditsExpiring: number;
    customersAffected: number;
  }>;
}

export interface AdminStudioCreditsOverview {
  dateRange: {
    fromDate: string;
    toDate: string;
  };
  summary: AdminStudioCreditsPeriodSummary;
  currentPosition: AdminStudioCreditsCurrentPosition;
  expiration: AdminCreditExpirationOverview;
}

export interface AdminStudioCreditsTransactionExportRow {
  createdAt: Date;
  transactionId: string;
  userId: number;
  userName: string;
  userEmail: string;
  reasonCode: string;
  amount: number;
  status: string;
  renderId: number | null;
  allocationSourceReference: string | null;
  commercialCreditHead: string | null;
}

export interface AdminStudioCreditsExpirationExportRow {
  expiresAt: Date;
  userName: string;
  userEmail: string;
  remainingAmount: number;
  sourceReference: string;
  reasonCode: string;
  expirationStatus: "Scheduled" | "Expired unused";
  commercialCreditHead: string;
}

function expirationStatusLabel(
  status: CreditExpirationEvent["expirationStatus"],
): "Scheduled" | "Expired unused" {
  return status === "scheduled" ? "Scheduled" : "Expired unused";
}

async function loadNonAdminCustomers() {
  return db
    .select({
      id: usersTable.id,
      subscriptionTier: usersTable.subscriptionTier,
    })
    .from(usersTable)
    .where(eq(usersTable.isAdmin, false));
}

async function loadAdminStudioCreditsCurrentPosition(): Promise<AdminStudioCreditsCurrentPosition> {
  const customers = await loadNonAdminCustomers();
  let totalCreditsRemaining = 0;
  let customersWithPositiveBalance = 0;

  for (let i = 0; i < customers.length; i += BALANCE_BATCH_SIZE) {
    const batch = customers.slice(i, i + BALANCE_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (customer) => {
        const balance = await getStudioCreditBalance({
          userId: customer.id,
          tier: customer.subscriptionTier,
          limit: null,
          isAdmin: false,
        });
        const remaining =
          balance.remaining === Number.POSITIVE_INFINITY
            ? 0
            : Math.max(0, balance.remaining);
        return remaining;
      }),
    );

    for (const remaining of batchResults) {
      totalCreditsRemaining += remaining;
      if (remaining > 0) customersWithPositiveBalance += 1;
    }
  }

  return {
    totalCreditsRemaining,
    customersWithPositiveBalance,
  };
}

export async function loadAdminStudioCreditsPeriodSummary(
  from: Date,
  to: Date,
): Promise<AdminStudioCreditsPeriodSummary> {
  const [credits, usage] = await Promise.all([
    summarizeCredits({ from, to, ...PERIOD_TM_FILTER }),
    summarizeUsage({ from, to, ...PERIOD_TM_FILTER }),
  ]);
  return mapTransactionMasterCreditsToPeriodSummary(
    credits,
    usage.creditsConsumed,
  );
}

export async function loadAdminStudioCreditsCreditHeadSummary(
  from: Date,
  to: Date,
): Promise<AdminStudioCreditsCreditHeadSummary> {
  const credits = await summarizeCredits({ from, to, ...PERIOD_TM_FILTER });
  return mapTransactionMasterCreditsToCreditHeads(credits);
}

export async function loadAdminStudioCreditsExpirationOverview(input: {
  expirationFromDate: string;
  expirationToDate: string;
  from: Date;
  to: Date;
}): Promise<AdminCreditExpirationOverview> {
  const summary = await summarizeExpiration({
    from: input.from,
    to: input.to,
    ...EXPIRATION_TM_FILTER,
  });
  return {
    dateRange: {
      fromDate: input.expirationFromDate,
      toDate: input.expirationToDate,
    },
    totalCreditsExpiring: summary.totalCreditsExpiring,
    customersAffected: summary.customersAffected,
    byDate: summary.byDate,
  };
}

export async function loadAdminStudioCreditsExpirationExportRows(input: {
  from: Date;
  to: Date;
}): Promise<AdminStudioCreditsExpirationExportRow[]> {
  const events = await loadCreditExpirationEvents({
    from: input.from,
    to: input.to,
    ...EXPIRATION_TM_FILTER,
  });
  return events
    .map((event) => ({
      expiresAt: event.expiresAt,
      userName: event.customerName,
      userEmail: event.customerEmail,
      remainingAmount: event.creditsUnused,
      sourceReference: event.sourceReference,
      reasonCode: event.reasonCode,
      expirationStatus: expirationStatusLabel(event.expirationStatus),
      commercialCreditHead: event.commercialCreditHead,
    }))
    .sort((a, b) => {
      const dateCompare = a.expiresAt.getTime() - b.expiresAt.getTime();
      if (dateCompare !== 0) return dateCompare;
      return a.userEmail.localeCompare(b.userEmail);
    });
}

function mapGrantToTransactionRow(
  event: CreditGrantEvent,
): AdminStudioCreditsTransactionExportRow {
  return {
    createdAt: event.occurredAt,
    transactionId: event.transactionId,
    userId: event.customerId,
    userName: event.customerName,
    userEmail: event.customerEmail,
    reasonCode: event.reasonCode,
    amount: event.amount,
    status: event.status,
    renderId: null,
    allocationSourceReference: event.sourceReference,
    commercialCreditHead: event.commercialCreditHead,
  };
}

function mapUsageToTransactionRow(
  event: CreditUsageEvent,
): AdminStudioCreditsTransactionExportRow {
  return {
    createdAt: event.occurredAt,
    transactionId: event.transactionId,
    userId: event.customerId,
    userName: event.customerName,
    userEmail: event.customerEmail,
    reasonCode: event.reasonCode,
    amount: -event.amount,
    status: event.status,
    renderId: event.renderId,
    allocationSourceReference: null,
    commercialCreditHead: null,
  };
}

export async function loadAdminStudioCreditsTransactionsForExport(
  from: Date,
  to: Date,
): Promise<AdminStudioCreditsTransactionExportRow[]> {
  const [grants, usage] = await Promise.all([
    loadCreditGrantEvents({ from, to, ...PERIOD_TM_FILTER }),
    loadCreditUsageEvents({ from, to, ...PERIOD_TM_FILTER }),
  ]);

  return [
    ...grants.map(mapGrantToTransactionRow),
    ...usage.map(mapUsageToTransactionRow),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function loadAdminStudioCreditsOverview(input: {
  fromDate: string;
  toDate: string;
  from: Date;
  to: Date;
  expirationFromDate: string;
  expirationToDate: string;
  expirationFrom: Date;
  expirationTo: Date;
}): Promise<AdminStudioCreditsOverview> {
  const [summary, currentPosition, expiration] = await Promise.all([
    loadAdminStudioCreditsPeriodSummary(input.from, input.to),
    loadAdminStudioCreditsCurrentPosition(),
    loadAdminStudioCreditsExpirationOverview({
      expirationFromDate: input.expirationFromDate,
      expirationToDate: input.expirationToDate,
      from: input.expirationFrom,
      to: input.expirationTo,
    }),
  ]);

  return {
    dateRange: {
      fromDate: input.fromDate,
      toDate: input.toDate,
    },
    summary,
    currentPosition,
    expiration,
  };
}

export function adminStudioCreditsExportFilename(
  fromDate: string,
  toDate: string,
): string {
  return `StudioLayer Admin Studio Credits - ${fromDate} to ${toDate}.xlsx`;
}
