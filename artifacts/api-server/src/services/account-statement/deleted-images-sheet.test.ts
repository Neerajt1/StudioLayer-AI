import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import type { User } from "@workspace/db";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";

const {
  buildDeletedImagesSheet,
  DELETED_IMAGES_SHEET_NOTE,
} = await import("./worksheets/deleted-images.js");

type AccountStatementContext = Awaited<
  ReturnType<typeof import("./data.js").loadAccountStatementContext>
> extends infer T
  ? Exclude<T, null>
  : never;

function baseContext(): AccountStatementContext {
  const generatedAt = new Date("2026-08-10T12:00:00.000Z");
  const cycleStart = new Date(Date.UTC(2026, 7, 1));

  return {
    user: {
      id: 1,
      email: "test@example.com",
      name: "Test User",
      subscriptionTier: "pro",
      isAdmin: false,
    } as User,
    generatedAt,
    allowance: 120,
    isAdmin: false,
    balance: {
      used: 0,
      limit: 120,
      remaining: 120,
      canRender: true,
    },
    cycleStats: {
      studioCreditsUsed: 0,
      imagesCreated: 0,
      averageRefinementsPerImage: 0,
    },
    cycleStart,
    transactions: [],
    membershipPeriodHints: [],
    renders: [],
    deletionEvents: [],
    creditsPurchasedInCycle: 0,
    promotionalCreditsInCycle: 0,
    totalCreditsAddedInCycle: 0,
    imagesDeletedInCycle: 0,
    allTimeImagesDeleted: 0,
  };
}

describe("buildDeletedImagesSheet", () => {
  it("18. uses the simplified Deleted Images note exactly", () => {
    const workbook = new ExcelJS.Workbook();
    buildDeletedImagesSheet(workbook, baseContext());

    const sheet = workbook.getWorksheet("Deleted Images")!;
    const note = String(sheet.getRow(2).getCell(1).value ?? "");

    assert.equal(note, DELETED_IMAGES_SHEET_NOTE);
  });

  it("19. note contains no refund terminology", () => {
    assert.doesNotMatch(DELETED_IMAGES_SHEET_NOTE, /refund/i);
    assert.doesNotMatch(DELETED_IMAGES_SHEET_NOTE, /deduction/i);
  });

  it("20. does not include Credit Deduction or Deletion Credit Impact columns", () => {
    const workbook = new ExcelJS.Workbook();
    buildDeletedImagesSheet(workbook, baseContext());

    const sheet = workbook.getWorksheet("Deleted Images")!;
    const headerRow = sheet.getRow(4);
    const headers = headerRow.values as Array<string | undefined>;

    assert.ok(headers.includes("Deleted By"));
    assert.ok(!headers.includes("Credit Deduction"));
    assert.ok(!headers.includes("Deletion Credit Impact"));
  });
});
