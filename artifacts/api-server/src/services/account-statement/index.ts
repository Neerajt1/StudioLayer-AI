import ExcelJS from "exceljs";
import {
  loadAccountStatementContext,
  type AccountStatementContext,
} from "./data.js";
import { statementFilename } from "./labels.js";
import { buildAccountSummarySheet } from "./worksheets/account-summary.js";
import { buildMonthlySummarySheet } from "./worksheets/monthly-summary.js";
import { buildCreditLedgerSheet } from "./worksheets/credit-ledger.js";
import { buildCreativeActivitySheet } from "./worksheets/creative-activity.js";
import { buildDeletedImagesSheet } from "./worksheets/deleted-images.js";

export type AccountStatementWorksheetBuilder = (
  workbook: ExcelJS.Workbook,
  context: AccountStatementContext,
) => void;

/** Ordered worksheet builders — add new sheets here without changing the download route. */
const WORKSHEET_BUILDERS: AccountStatementWorksheetBuilder[] = [
  buildAccountSummarySheet,
  buildMonthlySummarySheet,
  buildCreditLedgerSheet,
  buildCreativeActivitySheet,
  buildDeletedImagesSheet,
];

export async function generateAccountStatementBuffer(
  userId: number,
): Promise<{ buffer: Buffer; filename: string } | null> {
  const context = await loadAccountStatementContext(userId);
  if (!context) return null;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "StudioLayer AI";
  workbook.created = context.generatedAt;

  for (const buildSheet of WORKSHEET_BUILDERS) {
    buildSheet(workbook, context);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    buffer,
    filename: statementFilename(context.generatedAt),
  };
}

export { loadAccountStatementContext };
