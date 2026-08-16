import type ExcelJS from "exceljs";
import {
  computeLedgerRunningBalance,
  type AccountStatementContext,
} from "../data.js";
import {
  applyDataCell,
  applyHeaderRow,
  autoSizeColumns,
  freezeHeaderRow,
} from "../styles.js";
import {
  formatStatementDate,
  isUsageReasonCode,
  transactionDescription,
  transactionTypeLabel,
} from "../labels.js";

export function buildCreditLedgerSheet(
  workbook: ExcelJS.Workbook,
  ctx: AccountStatementContext,
): void {
  const sheet = workbook.addWorksheet("Studio Credit Ledger");
  const headers = [
    "S.No.",
    "Date",
    "Transaction Type",
    "Description",
    "Credits Added",
    "Credits Used",
    "Running Balance",
  ];

  sheet.addRow(headers);
  applyHeaderRow(sheet, 1);
  freezeHeaderRow(sheet, 1);

  ctx.transactions.forEach((tx, index) => {
    const creditsAdded = tx.amount > 0 ? tx.amount : 0;
    const creditsUsed =
      tx.amount < 0 && isUsageReasonCode(tx.reasonCode)
        ? Math.abs(tx.amount)
        : tx.amount < 0
          ? Math.abs(tx.amount)
          : 0;
    const runningBalance = ctx.isAdmin
      ? "Unlimited"
      : computeLedgerRunningBalance(ctx, index);
    const linkedRender =
      tx.renderId != null
        ? ctx.renders.find((render) => render.id === tx.renderId)
        : undefined;

    const row = sheet.addRow([
      index + 1,
      formatStatementDate(tx.createdAt),
      transactionTypeLabel(tx.reasonCode, linkedRender?.refinementType),
      transactionDescription(
        tx.reasonCode,
        tx.renderId,
        linkedRender?.refinementType,
      ),
      creditsAdded || "",
      creditsUsed || "",
      runningBalance,
    ]);
    row.eachCell((cell) => applyDataCell(cell));
  });

  autoSizeColumns(sheet);
}
