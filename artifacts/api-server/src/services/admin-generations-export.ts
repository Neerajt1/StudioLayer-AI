import ExcelJS from "exceljs";
import {
  imagesCreatedForReasonCode,
  type StudioCreditReasonCodeValue,
} from "@workspace/studio-credit-engine";
import {
  formatStatementDate,
  generationTypeFromRenderType,
  generationTypeLabel,
  isGenerationReasonCode,
  isRefinementReasonCode,
  transactionTypeLabel,
} from "./account-statement/labels.js";
import {
  applyDataCell,
  applyHeaderRow,
  autoSizeColumns,
  freezeHeaderRow,
} from "./account-statement/styles.js";
import {
  loadAdminGenerationsSummary,
  type AdminGenerationsSummary,
} from "./admin-generations-stats.js";
import { adminGenerationsExportFilename } from "./admin-generations-date-range.js";
import { loadCreditUsageEvents } from "./transaction-master/load-usage.js";
import type { CreditUsageEvent } from "./transaction-master/types.js";

/** Prior Admin Generations included all users' completed usage txs. */
const GENERATIONS_TM_FILTER = { excludeAdmins: false as const };

export interface AdminGenerationsUsageRow {
  transactionId: string;
  createdAt: Date;
  userId: number;
  userEmail: string;
  userName: string;
  reasonCode: string;
  amount: number;
  status: string;
  renderId: number | null;
  generationType: string | null;
  generationSessionId: string | null;
  renderStatus: string | null;
  refinementType: string | null;
}

function formatStatementDateTime(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${formatStatementDate(date)} ${hours}:${minutes} UTC`;
}

function activityCategory(reasonCode: string): string {
  if (isGenerationReasonCode(reasonCode)) return "Generation";
  if (isRefinementReasonCode(reasonCode)) return "Edit";
  return "Usage";
}

function shootTypeLabel(
  reasonCode: string,
  renderGenerationType: string | null,
): string {
  if (isGenerationReasonCode(reasonCode)) {
    return generationTypeLabel(reasonCode);
  }
  if (renderGenerationType) {
    return generationTypeFromRenderType(renderGenerationType);
  }
  return "";
}

function imagesForRow(reasonCode: string): number {
  return imagesCreatedForReasonCode(reasonCode as StudioCreditReasonCodeValue);
}

export function mapCreditUsageEventToAdminGenerationsRow(
  event: CreditUsageEvent,
): AdminGenerationsUsageRow {
  return {
    transactionId: event.transactionId,
    createdAt: event.occurredAt,
    userId: event.customerId,
    userEmail: event.customerEmail,
    userName: event.customerName,
    reasonCode: event.reasonCode,
    amount: -event.amount,
    status: event.status,
    renderId: event.renderId,
    generationType: event.generationType,
    generationSessionId: event.generationSessionId,
    renderStatus: event.renderStatus,
    refinementType: event.refinementType,
  };
}

export async function loadAdminGenerationsUsageRows(
  from: Date,
  to: Date,
): Promise<AdminGenerationsUsageRow[]> {
  const events = await loadCreditUsageEvents({
    from,
    to,
    ...GENERATIONS_TM_FILTER,
  });
  return events
    .map(mapCreditUsageEventToAdminGenerationsRow)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

function buildSummarySheet(
  workbook: ExcelJS.Workbook,
  input: {
    fromDate: string;
    toDate: string;
    generatedAt: Date;
    summary: AdminGenerationsSummary;
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
  addSummaryRow(sheet, "Generations", input.summary.totalGenerations);
  addSummaryRow(sheet, "Images created", input.summary.imagesCreated);
  addSummaryRow(sheet, "Edits made", input.summary.editsMade);
  addSummaryRow(
    sheet,
    "Studio Credits consumed",
    input.summary.studioCreditsUsed,
  );
  autoSizeColumns(sheet);
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

function buildUsageDetailSheet(
  workbook: ExcelJS.Workbook,
  rows: readonly AdminGenerationsUsageRow[],
): void {
  const sheet = workbook.addWorksheet("Usage Detail");
  const headers = [
    "Date/Time (UTC)",
    "Transaction ID",
    "User ID",
    "Email",
    "Name",
    "Activity",
    "Transaction Type",
    "Reason Code",
    "Shoot Type",
    "Render ID",
    "Generation Session ID",
    "Render Status",
    "Images Created",
    "Studio Credits Consumed",
    "Transaction Status",
  ];
  sheet.addRow(headers);
  applyHeaderRow(sheet, 1);
  freezeHeaderRow(sheet);

  for (const row of rows) {
    const dataRow = sheet.addRow([
      formatStatementDateTime(row.createdAt),
      row.transactionId,
      row.userId,
      row.userEmail,
      row.userName,
      activityCategory(row.reasonCode),
      transactionTypeLabel(row.reasonCode, row.refinementType),
      row.reasonCode,
      shootTypeLabel(row.reasonCode, row.generationType),
      row.renderId ?? "",
      row.generationSessionId ?? "",
      row.renderStatus ?? "",
      imagesForRow(row.reasonCode),
      Math.abs(row.amount),
      row.status,
    ]);
    dataRow.eachCell((cell) => applyDataCell(cell));
  }

  autoSizeColumns(sheet);
}

export async function generateAdminGenerationsExportBuffer(input: {
  fromDate: string;
  toDate: string;
  from: Date;
  to: Date;
}): Promise<{ buffer: Buffer; filename: string }> {
  const generatedAt = new Date();
  const [usageRows, summary] = await Promise.all([
    loadAdminGenerationsUsageRows(input.from, input.to),
    loadAdminGenerationsSummary(input.from, input.to),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "StudioLayer AI";
  workbook.created = generatedAt;

  buildSummarySheet(workbook, {
    fromDate: input.fromDate,
    toDate: input.toDate,
    generatedAt,
    summary,
  });
  buildUsageDetailSheet(workbook, usageRows);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    filename: adminGenerationsExportFilename(input.fromDate, input.toDate),
  };
}
