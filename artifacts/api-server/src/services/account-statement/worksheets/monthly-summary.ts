import type ExcelJS from "exceljs";
import {
  computeMonthlySummaryRows,
  type AccountStatementContext,
} from "../data.js";
import {
  applyDataCell,
  applyHeaderRow,
  autoSizeColumns,
  freezeHeaderRow,
} from "../styles.js";
import { formatMonthDisplay } from "../labels.js";

export function buildMonthlySummarySheet(
  workbook: ExcelJS.Workbook,
  ctx: AccountStatementContext,
): void {
  const sheet = workbook.addWorksheet("Monthly Summary");
  const headers = [
    "Month",
    "Opening Balance",
    "Credits Added",
    "Credits Used",
    "Activity Credits Used",
    "Credits Reconciliation Gap",
    "Images Generated",
    "Refinements",
    "Images Deleted",
    "Closing Balance",
  ];

  sheet.addRow(headers);
  applyHeaderRow(sheet, 1);
  freezeHeaderRow(sheet, 1);

  const rows = computeMonthlySummaryRows(ctx);
  for (const row of rows) {
    const excelRow = sheet.addRow([
      formatMonthDisplay(row.monthKey),
      ctx.isAdmin ? "Unlimited" : row.openingBalance,
      row.creditsAdded,
      row.creditsUsed,
      row.activityCreditsUsed,
      row.creditsReconciliationGap,
      row.imagesGenerated,
      row.refinements,
      row.imagesDeleted,
      ctx.isAdmin ? "Unlimited" : row.closingBalance,
    ]);
    excelRow.eachCell((cell) => applyDataCell(cell));
  }

  autoSizeColumns(sheet);
}
