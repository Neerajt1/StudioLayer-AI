import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Render, StudioCreditTransaction, User } from "@workspace/db";
import { StudioCreditReasonCode } from "@workspace/studio-credit-engine";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";

const { default: ExcelJS } = await import("exceljs");
const {
  buildLedgerReconciliationSheet,
  LEDGER_RECONCILIATION_SHEET_NOTE,
} = await import("./worksheets/ledger-reconciliation.js");

type AccountStatementContext = {
  user: User;
  generatedAt: Date;
  allowance: number;
  isAdmin: boolean;
  balance: {
    used: number;
    limit: number | null;
    remaining: number;
    canRender: boolean;
  };
  cycleStats: {
    studioCreditsUsed: number;
    imagesCreated: number;
    averageRefinementsPerImage: number;
  };
  cycleStart: Date;
  transactions: StudioCreditTransaction[];
  membershipPeriodHints: Array<{
    ledgerTransactionId: string | null;
    startsAt: Date;
    expiresAt: Date | null;
    periodKey?: string | null;
    originalAmount: number;
  }>;
  renders: Render[];
  deletionEvents: [];
  creditsPurchasedInCycle: number;
  promotionalCreditsInCycle: number;
  totalCreditsAddedInCycle: number;
  imagesDeletedInCycle: number;
  allTimeImagesDeleted: number;
};

function render(partial: Partial<Render> & Pick<Render, "id">): Render {
  return {
    userId: 3,
    sourceImageUrl: null,
    outputImageUrl: "https://example.com/output.png",
    transparentOutputImageUrl: null,
    modelPersona: "test",
    locationEnvironment: "test",
    status: "completed",
    parentRenderId: null,
    masterRenderId: partial.id,
    assetVersion: 1,
    assetType: "master",
    refinementType: null,
    sourceAssetVersion: null,
    cropPreset: null,
    generationType: "campaign",
    outputResolution: "2K",
    studioCreditsUsed: 1,
    refinementCount: 0,
    generationSessionId: null,
    selectedPoseName: null,
    selectedPoseFamily: null,
    createdAt: new Date("2026-08-06T06:50:46.036Z"),
    updatedAt: new Date("2026-08-06T06:51:09.995Z"),
    ...partial,
  };
}

function usageTx(
  partial: Partial<StudioCreditTransaction> &
    Pick<StudioCreditTransaction, "id" | "reasonCode" | "amount">,
): StudioCreditTransaction {
  return {
    transactionId: `tx-${partial.id}`,
    userId: 3,
    workspaceId: 3,
    status: "completed",
    renderId: null,
    createdAt: new Date("2026-08-06T06:50:46.622Z"),
    ...partial,
  };
}

function baseContext(
  overrides: Partial<AccountStatementContext>,
): AccountStatementContext {
  return {
    user: {
      id: 3,
      email: "historical@example.com",
      name: "Historical User",
      subscriptionTier: "free",
      isAdmin: true,
    } as User,
    generatedAt: new Date("2026-08-10T12:00:00.000Z"),
    allowance: 0,
    isAdmin: true,
    balance: {
      used: 0,
      limit: null,
      remaining: Infinity,
      canRender: true,
    },
    cycleStats: {
      studioCreditsUsed: 0,
      imagesCreated: 0,
      averageRefinementsPerImage: 0,
    },
    cycleStart: new Date(Date.UTC(2026, 7, 1)),
    transactions: [],
    membershipPeriodHints: [],
    renders: [],
    deletionEvents: [],
    creditsPurchasedInCycle: 0,
    promotionalCreditsInCycle: 0,
    totalCreditsAddedInCycle: 0,
    imagesDeletedInCycle: 0,
    allTimeImagesDeleted: 0,
    ...overrides,
  };
}

describe("buildLedgerReconciliationSheet", () => {
  it("19. exposes unmapped historical transactions with customer-facing language", async () => {
    const ctx = baseContext({
      renders: [
        render({
          id: 5,
          generationType: "campaign",
          status: "completed",
        }),
      ],
      transactions: [
        usageTx({
          id: 5,
          transactionId: "4c5893b8-30cd-43c9-b28e-0bc1fc9138d1",
          reasonCode: StudioCreditReasonCode.CAMPAIGN_GENERATION,
          amount: -2,
        }),
        usageTx({
          id: 6,
          transactionId: "95782b28-b76a-4d31-9b8f-9c3d90501b0a",
          reasonCode: StudioCreditReasonCode.REFINE,
          amount: -1,
          createdAt: new Date("2026-08-06T06:52:14.335Z"),
        }),
      ],
    });

    const workbook = new ExcelJS.Workbook();
    buildLedgerReconciliationSheet(workbook, ctx as never);

    const sheet = workbook.getWorksheet("Ledger Reconciliation");
    assert.ok(sheet);

    let headerRowNumber = -1;
    sheet.eachRow((row, rowNumber) => {
      if (row.getCell(1).value === "S.No.") {
        headerRowNumber = rowNumber;
      }
    });
    assert.ok(headerRowNumber > 0, "expected header row");

    const headerRow = sheet.getRow(headerRowNumber);
    assert.equal(headerRow.getCell(7).value, "Mapping Status");
    assert.equal(headerRow.getCell(8).value, "Explanation");

    const detailRow = sheet.getRow(headerRowNumber + 1);
    assert.match(String(detailRow.getCell(8).value), /could not be linked/i);
    assert.doesNotMatch(LEDGER_RECONCILIATION_SHEET_NOTE, /refund/i);
  });
});
