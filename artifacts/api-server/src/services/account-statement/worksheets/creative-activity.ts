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
    "Generation Type",
    "Images Generated",
    "Images Refined",
    "Credits Used",
    "Status",
  ];

  sheet.addRow(headers);
  applyHeaderRow(sheet, 1);
  freezeHeaderRow(sheet, 1);

  const rows = computeCreativeActivityRows(ctx);
  rows.forEach((activity, index) => {
    const row = sheet.addRow([
      index + 1,
      formatStatementDate(activity.dateTime),
      activity.sessionId,
      generationTypeFromRenderType(activity.generationType),
      activity.imagesGenerated,
      activity.imagesRefined,
      activity.creditsUsed,
      activity.status,
    ]);
    row.eachCell((cell) => applyDataCell(cell));
  });

  autoSizeColumns(sheet);
}
