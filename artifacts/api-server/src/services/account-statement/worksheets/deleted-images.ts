import type ExcelJS from "exceljs";
import type { AccountStatementContext } from "../data.js";
import { computeDeletedImageRows } from "../deleted-images-data.js";
import {
  applyDataCell,
  applyHeaderRow,
  autoSizeColumns,
  freezeHeaderRow,
  STATEMENT_FONT,
} from "../styles.js";
import {
  formatStatementDate,
  generationTypeFromRenderType,
} from "../labels.js";

export const DELETED_IMAGES_SHEET_NOTE =
  "Deleted Images is for record-keeping and credit reconciliation. Credits are charged for successful generations and post-production actions such as Remove Background. Crop is free.";

function formatOptionalDate(date: Date | null): string {
  return date ? formatStatementDate(date) : "—";
}

function formatOptionalCount(value: number | null): string | number {
  return value ?? "—";
}

export function buildDeletedImagesSheet(
  workbook: ExcelJS.Workbook,
  ctx: AccountStatementContext,
): void {
  const sheet = workbook.addWorksheet("Deleted Images");

  const titleRow = sheet.addRow(["Deleted Images"]);
  titleRow.font = { name: STATEMENT_FONT, bold: true, size: 14 };

  const noteRow = sheet.addRow([DELETED_IMAGES_SHEET_NOTE]);
  noteRow.font = { name: STATEMENT_FONT, size: 10 };
  sheet.mergeCells(`A${noteRow.number}:I${noteRow.number}`);

  sheet.addRow([]);

  const headers = [
    "S.No.",
    "Deletion Date",
    "Image ID",
    "Generation Session ID",
    "Generation Type",
    "Original Generation Date",
    "Original Generation Credits (Batch)",
    "Original Generation Images (Billable)",
    "Deleted By",
  ];

  const headerRowNumber = sheet.lastRow!.number + 1;
  sheet.addRow(headers);
  applyHeaderRow(sheet, headerRowNumber);
  freezeHeaderRow(sheet, headerRowNumber);

  const rows = computeDeletedImageRows(ctx);
  rows.forEach((row, index) => {
    const excelRow = sheet.addRow([
      index + 1,
      formatStatementDate(row.deletedAt),
      row.renderId,
      row.generationSessionId,
      generationTypeFromRenderType(row.generationType),
      formatOptionalDate(row.originalGenerationDate),
      formatOptionalCount(row.originalGenerationCredits),
      formatOptionalCount(row.originalGenerationImageCount),
      row.deletedBy,
    ]);
    excelRow.eachCell((cell) => applyDataCell(cell));
  });

  autoSizeColumns(sheet);
}
