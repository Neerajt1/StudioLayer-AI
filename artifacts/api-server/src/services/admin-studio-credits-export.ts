import ExcelJS from "exceljs";
import {
  formatStatementDate,
  transactionTypeLabel,
} from "./account-statement/labels.js";
import {
  applyDataCell,
  applyHeaderRow,
  autoSizeColumns,
  freezeHeaderRow,
} from "./account-statement/styles.js";
import {
  adminStudioCreditsExportFilename,
  loadAdminStudioCreditsCreditHeadSummary,
  loadAdminStudioCreditsExpirationExportRows,
  loadAdminStudioCreditsOverview,
  loadAdminStudioCreditsTransactionsForExport,
  type AdminStudioCreditsExpirationExportRow,
  type AdminStudioCreditsTransactionExportRow,
} from "./admin-studio-credits-data.js";

function formatStatementDateTime(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${formatStatementDate(date)} ${hours}:${minutes} UTC`;
}

function addSummaryRow(
  sheet: ExcelJS.Worksheet,
  label: string,
  value: string | number,
): void {
  const row = sheet.addRow([label, value]);
  applyDataCell(row.getCell(1), { bold: true });
  applyDataCell(row.getCell(2));
}

function buildSummarySheet(
  workbook: ExcelJS.Workbook,
  input: {
    fromDate: string;
    toDate: string;
    generatedAt: Date;
    overview: Awaited<ReturnType<typeof loadAdminStudioCreditsOverview>>;
    creditHeadSummary: Awaited<
      ReturnType<typeof loadAdminStudioCreditsCreditHeadSummary>
    >;
  },
): void {
  const sheet = workbook.addWorksheet("Summary");
  addSummaryRow(sheet, "Report from", input.fromDate);
  addSummaryRow(sheet, "Report to", input.toDate);
  addSummaryRow(
    sheet,
    "Generated at",
    formatStatementDateTime(input.generatedAt),
  );
  sheet.addRow([]);

  const creditHeadHeader = sheet.addRow(["Credit Head", "Credits"]);
  applyHeaderRow(sheet, creditHeadHeader.number);
  const creditHeadRows = sheet.addRows([
    ["Studio Basic Credits", input.creditHeadSummary.studioBasicCredits],
    ["Studio Pro Credits", input.creditHeadSummary.studioProCredits],
    ["Top-Up Credits", input.creditHeadSummary.topUpCredits],
    ["Studio Pass Credits", input.creditHeadSummary.studioPassCredits],
    ["Promotional Credits", input.creditHeadSummary.promotionalCredits],
  ]);
  for (const row of creditHeadRows) {
    row.eachCell((cell) => applyDataCell(cell));
  }
  const totalRow = sheet.addRow([
    "TOTAL CREDITS ADDED",
    input.creditHeadSummary.totalCreditsAdded,
  ]);
  applyDataCell(totalRow.getCell(1), { bold: true });
  applyDataCell(totalRow.getCell(2), { bold: true });

  // unknownCredits is reporting-only — never folded into TOTAL CREDITS ADDED.
  if (input.creditHeadSummary.unknownCredits > 0) {
    addSummaryRow(
      sheet,
      "Unclassified membership credits (unknown)",
      input.creditHeadSummary.unknownCredits,
    );
  }

  sheet.addRow([]);
  addSummaryRow(sheet, "Credits consumed", input.overview.summary.creditsConsumed);
  sheet.addRow([]);
  addSummaryRow(
    sheet,
    "Current outstanding credits",
    input.overview.currentPosition.totalCreditsRemaining,
  );
  addSummaryRow(
    sheet,
    "Customers with current balance",
    input.overview.currentPosition.customersWithPositiveBalance,
  );
  sheet.addRow([]);
  addSummaryRow(
    sheet,
    "Expiration period from",
    input.overview.expiration.dateRange.fromDate,
  );
  addSummaryRow(
    sheet,
    "Expiration period to",
    input.overview.expiration.dateRange.toDate,
  );
  addSummaryRow(
    sheet,
    "Unused credits expiring during selected expiration period",
    input.overview.expiration.totalCreditsExpiring,
  );
  addSummaryRow(
    sheet,
    "Customers affected by expiration",
    input.overview.expiration.customersAffected,
  );
  autoSizeColumns(sheet);
}

function buildCreditExpirationSheet(
  workbook: ExcelJS.Workbook,
  rows: readonly AdminStudioCreditsExpirationExportRow[],
): void {
  const sheet = workbook.addWorksheet("Credit Expiration");
  sheet.addRow([
    "Expiry date",
    "Customer",
    "Email",
    "Credits expiring",
    "Allocation reference",
    "Reason code",
    "Credit head",
    "Status",
  ]);
  applyHeaderRow(sheet, 1);
  freezeHeaderRow(sheet);

  for (const row of rows) {
    const dataRow = sheet.addRow([
      formatStatementDate(row.expiresAt),
      row.userName,
      row.userEmail,
      row.remainingAmount,
      row.sourceReference,
      row.reasonCode,
      row.commercialCreditHead,
      row.expirationStatus,
    ]);
    dataRow.eachCell((cell) => applyDataCell(cell));
  }

  autoSizeColumns(sheet);
}

function buildTransactionsSheet(
  workbook: ExcelJS.Workbook,
  rows: readonly AdminStudioCreditsTransactionExportRow[],
): void {
  const sheet = workbook.addWorksheet("Credit Transactions");
  sheet.addRow([
    "Date/Time (UTC)",
    "Customer",
    "Email",
    "Transaction type",
    "Reason code",
    "Credits",
    "Status",
    "Render ID",
    "Reference",
    "Credit head",
  ]);
  applyHeaderRow(sheet, 1);
  freezeHeaderRow(sheet);

  for (const row of rows) {
    const dataRow = sheet.addRow([
      formatStatementDateTime(row.createdAt),
      row.userName,
      row.userEmail,
      transactionTypeLabel(row.reasonCode),
      row.reasonCode,
      row.amount,
      row.status,
      row.renderId ?? "",
      row.allocationSourceReference ?? "",
      row.commercialCreditHead ?? "",
    ]);
    dataRow.eachCell((cell) => applyDataCell(cell));
  }

  autoSizeColumns(sheet);
}

export async function generateAdminStudioCreditsExportBuffer(input: {
  fromDate: string;
  toDate: string;
  from: Date;
  to: Date;
  expirationFromDate: string;
  expirationToDate: string;
  expirationFrom: Date;
  expirationTo: Date;
}): Promise<{ buffer: Buffer; filename: string }> {
  const generatedAt = new Date();
  const [overview, creditHeadSummary, expirationRows, transactions] =
    await Promise.all([
      loadAdminStudioCreditsOverview({
        fromDate: input.fromDate,
        toDate: input.toDate,
        from: input.from,
        to: input.to,
        expirationFromDate: input.expirationFromDate,
        expirationToDate: input.expirationToDate,
        expirationFrom: input.expirationFrom,
        expirationTo: input.expirationTo,
      }),
      loadAdminStudioCreditsCreditHeadSummary(input.from, input.to),
      loadAdminStudioCreditsExpirationExportRows({
        from: input.expirationFrom,
        to: input.expirationTo,
      }),
      loadAdminStudioCreditsTransactionsForExport(input.from, input.to),
    ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "StudioLayer AI";
  workbook.created = generatedAt;

  buildSummarySheet(workbook, {
    fromDate: input.fromDate,
    toDate: input.toDate,
    generatedAt,
    overview,
    creditHeadSummary,
  });
  buildCreditExpirationSheet(workbook, expirationRows);
  buildTransactionsSheet(workbook, transactions);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    filename: adminStudioCreditsExportFilename(input.fromDate, input.toDate),
  };
}
