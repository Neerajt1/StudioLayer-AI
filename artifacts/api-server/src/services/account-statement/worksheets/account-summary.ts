import type ExcelJS from "exceljs";
import type { AccountStatementContext } from "../data.js";
import {
  computeMembershipAllowance,
  computeStatementCycleImagesGenerated,
  computeStatementCycleRefinements,
  computeStatementLedgerCreditsUsed,
  computeStatementReconciliation,
} from "../data.js";
import {
  addSummaryRow,
  applyDataCell,
  STATEMENT_FONT,
} from "../styles.js";
import {
  billingCycleLabel,
  formatStatementDate,
  membershipPlanLabel,
} from "../labels.js";

export function buildAccountSummarySheet(
  workbook: ExcelJS.Workbook,
  ctx: AccountStatementContext,
): void {
  const sheet = workbook.addWorksheet("Account Summary");
  sheet.properties.defaultRowHeight = 20;

  const titleRow = sheet.addRow(["Studio Account Statement"]);
  titleRow.font = { name: STATEMENT_FONT, bold: true, size: 14 };
  sheet.addRow([]);

  const membershipAllowance = computeMembershipAllowance(ctx);
  const currentBalance = ctx.isAdmin ? "Unlimited" : ctx.balance.remaining;
  const creditsUsed = computeStatementLedgerCreditsUsed(ctx);
  const reconciliation = computeStatementReconciliation(ctx);
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
    "Membership Allowance",
    ctx.isAdmin ? "Unlimited" : membershipAllowance,
  );
  addSummaryRow(sheet, "Credits Purchased", ctx.creditsPurchasedInCycle);
  addSummaryRow(sheet, "Promotional Credits", promotionalDisplay);
  addSummaryRow(sheet, "Total Credits Added", ctx.totalCreditsAddedInCycle);
  addSummaryRow(sheet, "Studio Credits Used", creditsUsed);
  addSummaryRow(sheet, "Activity Credits Used", reconciliation.activityCreditsUsed);
  if (reconciliation.reconciliationGap !== 0) {
    addSummaryRow(
      sheet,
      "Credits Reconciliation Gap",
      reconciliation.reconciliationGap,
    );
    addSummaryRow(
      sheet,
      "Unmapped Ledger Credits",
      reconciliation.unmappedLedgerCredits,
    );
  }
  addSummaryRow(sheet, "Current Credit Balance", currentBalance);
  addSummaryRow(
    sheet,
    "Images Generated",
    computeStatementCycleImagesGenerated(ctx),
  );
  addSummaryRow(sheet, "Post-Production", computeStatementCycleRefinements(ctx));
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
