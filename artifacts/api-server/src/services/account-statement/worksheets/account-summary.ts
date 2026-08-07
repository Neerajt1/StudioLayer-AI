import type ExcelJS from "exceljs";
import type { AccountStatementContext } from "../data.js";
import {
  computeOpeningCreditBalance,
} from "../data.js";
import {
  addSummaryRow,
  applyDataCell,
  STATEMENT_FONT,
} from "../styles.js";
import {
  billingCycleLabel,
  formatStatementDate,
  isRefinementReasonCode,
  membershipPlanLabel,
} from "../labels.js";

function countRefinementsInCycle(ctx: AccountStatementContext): number {
  const isLifetime = ctx.user.subscriptionTier === "free";

  return ctx.transactions.filter(
    (tx) =>
      (isLifetime || tx.createdAt >= ctx.cycleStart) &&
      isRefinementReasonCode(tx.reasonCode),
  ).length;
}

export function buildAccountSummarySheet(
  workbook: ExcelJS.Workbook,
  ctx: AccountStatementContext,
): void {
  const sheet = workbook.addWorksheet("Account Summary");
  sheet.properties.defaultRowHeight = 20;

  const titleRow = sheet.addRow(["Studio Account Statement"]);
  titleRow.font = { name: STATEMENT_FONT, bold: true, size: 14 };
  sheet.addRow([]);

  const openingBalance = computeOpeningCreditBalance(ctx);
  const currentBalance = ctx.isAdmin ? "Unlimited" : ctx.balance.remaining;
  const creditsUsed = ctx.isAdmin ? 0 : ctx.balance.used;
  const promotionalDisplay =
    ctx.promotionalCreditsInCycle > 0
      ? ctx.promotionalCreditsInCycle
      : "—";

  addSummaryRow(sheet, "Customer Name", ctx.user.name);
  addSummaryRow(sheet, "Registered Email", ctx.user.email);
  addSummaryRow(
    sheet,
    "Membership Plan",
    membershipPlanLabel(ctx.user.subscriptionTier),
  );
  addSummaryRow(
    sheet,
    "Billing Cycle",
    billingCycleLabel(ctx.user.subscriptionTier, ctx.generatedAt),
  );
  addSummaryRow(
    sheet,
    "Opening Credit Balance",
    ctx.isAdmin ? "Unlimited" : openingBalance,
  );
  addSummaryRow(sheet, "Credits Purchased", ctx.creditsPurchasedInCycle);
  addSummaryRow(sheet, "Promotional Credits", promotionalDisplay);
  addSummaryRow(sheet, "Total Credits Added", ctx.totalCreditsAddedInCycle);
  addSummaryRow(sheet, "Studio Credits Used", creditsUsed);
  addSummaryRow(sheet, "Current Credit Balance", currentBalance);
  addSummaryRow(
    sheet,
    "Images Generated",
    ctx.cycleStats.imagesCreated,
  );
  addSummaryRow(sheet, "Images Refined", countRefinementsInCycle(ctx));
  addSummaryRow(sheet, "Images Deleted", ctx.imagesDeletedInCycle);
  addSummaryRow(
    sheet,
    "Statement Generated On",
    formatStatementDate(ctx.generatedAt),
  );

  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 36;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return;
    row.eachCell((cell) => applyDataCell(cell));
  });
}
