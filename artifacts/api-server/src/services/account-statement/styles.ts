import type ExcelJS from "exceljs";

export const STATEMENT_FONT = "Calibri";

export const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF5F5F5" },
};

export const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD4D4D8" } },
  left: { style: "thin", color: { argb: "FFD4D4D8" } },
  bottom: { style: "thin", color: { argb: "FFD4D4D8" } },
  right: { style: "thin", color: { argb: "FFD4D4D8" } },
};

export function applyHeaderRow(sheet: ExcelJS.Worksheet, rowNumber: number): void {
  const row = sheet.getRow(rowNumber);
  row.font = { name: STATEMENT_FONT, bold: true, size: 11 };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle", horizontal: "left" };
  row.eachCell((cell) => {
    cell.border = THIN_BORDER;
  });
  row.height = 22;
}

export function applyDataCell(
  cell: ExcelJS.Cell,
  options?: { bold?: boolean; numFmt?: string },
): void {
  cell.font = {
    name: STATEMENT_FONT,
    size: 11,
    bold: options?.bold ?? false,
  };
  cell.border = THIN_BORDER;
  cell.alignment = { vertical: "middle", wrapText: true };
  if (options?.numFmt) {
    cell.numFmt = options.numFmt;
  }
}

export function autoSizeColumns(sheet: ExcelJS.Worksheet, minWidth = 12): void {
  sheet.columns.forEach((column) => {
    let maxLength = minWidth;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const value = cell.value;
      const text =
        value == null
          ? ""
          : typeof value === "object" && "richText" in (value as object)
            ? String((value as ExcelJS.CellRichTextValue).richText
                .map((part) => part.text)
                .join(""))
            : String(value);
      maxLength = Math.max(maxLength, Math.min(text.length + 2, 48));
    });
    column.width = maxLength;
  });
}

export function freezeHeaderRow(sheet: ExcelJS.Worksheet, rowNumber = 1): void {
  sheet.views = [{ state: "frozen", ySplit: rowNumber, activeCell: "A2" }];
}

export function addSummaryRow(
  sheet: ExcelJS.Worksheet,
  label: string,
  value: string | number,
): void {
  const row = sheet.addRow([label, value]);
  applyDataCell(row.getCell(1), { bold: true });
  applyDataCell(row.getCell(2));
}
