import type ExcelJS from "exceljs";
import type { AccountStatementContext } from "../data.js";
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

export function buildDeletedImagesSheet(
  workbook: ExcelJS.Workbook,
  ctx: AccountStatementContext,
): void {
  const sheet = workbook.addWorksheet("Deleted Images");
  const headers = [
    "S.No.",
    "Deletion Date",
    "Image ID",
    "Generation Session ID",
    "Generation Type",
    "Original Credits Consumed",
    "Deleted By",
  ];

  sheet.addRow(headers);
  applyHeaderRow(sheet, 1);
  freezeHeaderRow(sheet, 1);

  ctx.deletionEvents.forEach((event, index) => {
    const row = sheet.addRow([
      index + 1,
      formatStatementDate(event.deletedAt),
      event.renderId,
      event.generationSessionId ?? "—",
      generationTypeFromRenderType(event.generationType),
      event.originalCreditsConsumed,
      event.deletedBy,
    ]);
    row.eachCell((cell) => applyDataCell(cell));
  });

  autoSizeColumns(sheet);
}
