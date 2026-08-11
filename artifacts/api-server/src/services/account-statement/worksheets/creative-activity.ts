import type ExcelJS from "exceljs";
import {
  computeCreativeActivityRows,
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
  generationTypeFromRenderType,
} from "../labels.js";

export function buildCreativeActivitySheet(
  workbook: ExcelJS.Workbook,
  ctx: AccountStatementContext,
): void {
  const sheet = workbook.addWorksheet("Creative Activity");
  const headers = [
    "S.No.",
    "Date",
    "Generation Session ID",
    "Transaction ID",
    "Activity Type",
    "Generation Type",
    "Batch Action",
    "Output",
    "Outputs Requested",
    "Image ID",
    "Result",
    "Billable Image",
    "Credits Used",
    "Session Status",
  ];

  sheet.addRow(headers);
  applyHeaderRow(sheet, 1);
  freezeHeaderRow(sheet, 1);

  const rows = computeCreativeActivityRows(ctx);
  rows.forEach((activity, index) => {
    const row = sheet.addRow([
      index + 1,
      formatStatementDate(activity.dateTime),
      activity.generationSessionId,
      activity.transactionId ?? "—",
      activity.activityType,
      generationTypeFromRenderType(activity.generationType),
      activity.batchAction,
      activity.outputLabel,
      activity.outputsRequested,
      activity.renderId,
      activity.result,
      activity.billableImage ? "Yes" : "No",
      activity.creditsUsed,
      activity.sessionStatus,
    ]);
    row.eachCell((cell) => applyDataCell(cell));
  });

  autoSizeColumns(sheet);
}
