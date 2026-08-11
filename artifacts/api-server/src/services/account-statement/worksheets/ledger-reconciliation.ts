import type ExcelJS from "exceljs";
import {
  computeStatementReconciliation,
  type AccountStatementContext,
} from "../data.js";
import type { UnmappedHistoricalTransaction } from "../creative-activity-master.js";
import {
  applyDataCell,
  applyHeaderRow,
  autoSizeColumns,
  freezeHeaderRow,
  STATEMENT_FONT,
} from "../styles.js";
import {
  formatStatementDate,
  isGenerationReasonCode,
  isRefinementReasonCode,
  transactionTypeLabel,
} from "../labels.js";

export const LEDGER_RECONCILIATION_SHEET_NOTE =
  "This sheet lists completed Studio Credit transactions that could not be linked to an identifiable image or refinement in the available activity records. This does not necessarily mean no output was produced — only that the activity cannot be reconstructed from persisted records.";

function mappingStatusForUnmapped(tx: UnmappedHistoricalTransaction): string {
  if (tx.renderId != null) {
    return "Unlinked — referenced image not found in activity records";
  }
  if (isRefinementReasonCode(tx.reasonCode)) {
    return "Unlinked — no identifiable refinement activity";
  }
  if (isGenerationReasonCode(tx.reasonCode)) {
    return "Unlinked — no identifiable generation activity";
  }
  return "Unlinked";
}

function customerFacingExplanation(tx: UnmappedHistoricalTransaction): string {
  if (tx.renderId != null) {
    return "Historical credit transaction could not be linked to an identifiable image or refinement in the available activity records.";
  }
  if (isRefinementReasonCode(tx.reasonCode)) {
    return "Historical refinement credit could not be linked to an identifiable refinement in the available activity records.";
  }
  if (isGenerationReasonCode(tx.reasonCode)) {
    return "Historical generation credit could not be linked to an identifiable image in the available activity records.";
  }
  return "Historical credit transaction could not be linked to an identifiable image or refinement in the available activity records.";
}

export function buildLedgerReconciliationSheet(
  workbook: ExcelJS.Workbook,
  ctx: AccountStatementContext,
): void {
  const sheet = workbook.addWorksheet("Ledger Reconciliation");
  const reconciliation = computeStatementReconciliation(ctx);

  const titleRow = sheet.addRow(["Ledger Reconciliation"]);
  titleRow.font = { name: STATEMENT_FONT, bold: true, size: 12 };

  const noteRow = sheet.addRow([LEDGER_RECONCILIATION_SHEET_NOTE]);
  noteRow.font = { name: STATEMENT_FONT, size: 10 };
  sheet.mergeCells(`A${noteRow.number}:H${noteRow.number}`);

  sheet.addRow([]);

  const summaryRows: Array<[string, string | number]> = [
    ["Studio Credits Used", reconciliation.ledgerCreditsUsed],
    ["Identifiable Activity Credits", reconciliation.activityCreditsUsed],
    ["Credits Reconciliation Gap", reconciliation.reconciliationGap],
    ["Unmapped Ledger Credits", reconciliation.unmappedLedgerCredits],
  ];

  for (const [label, value] of summaryRows) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { name: STATEMENT_FONT, bold: true };
    row.eachCell((cell) => applyDataCell(cell));
  }

  sheet.addRow([]);

  const headers = [
    "S.No.",
    "Date",
    "Transaction ID",
    "Transaction Type",
    "Credits Used",
    "Linked Image ID",
    "Mapping Status",
    "Explanation",
  ];

  sheet.addRow(headers);
  const headerRowNumber = sheet.rowCount;
  applyHeaderRow(sheet, headerRowNumber);
  freezeHeaderRow(sheet, headerRowNumber);

  if (reconciliation.unmappedTransactions.length === 0) {
    const row = sheet.addRow([
      "",
      "",
      "",
      "",
      "",
      "",
      "Fully mapped",
      "All completed ledger credits are linked to identifiable creative activity.",
    ]);
    row.eachCell((cell) => applyDataCell(cell));
  } else {
    reconciliation.unmappedTransactions.forEach((tx, index) => {
      const row = sheet.addRow([
        index + 1,
        formatStatementDate(tx.date),
        tx.transactionId,
        transactionTypeLabel(tx.reasonCode),
        tx.amount,
        tx.renderId ?? "—",
        mappingStatusForUnmapped(tx),
        customerFacingExplanation(tx),
      ]);
      row.eachCell((cell) => applyDataCell(cell));
    });
  }

  sheet.getColumn(1).width = 8;
  autoSizeColumns(sheet);
}
