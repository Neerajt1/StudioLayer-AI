/**
 * Live Postgres integration tests for Admin Generations summary and export.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { URL } from "node:url";

function loadRootEnvForTests(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const rootEnvPath = path.resolve(here, "../../../../.env");
  process.loadEnvFile?.(rootEnvPath);
}

function isLocalCreditDevDatabase(): boolean {
  const raw = process.env.DATABASE_URL;
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname;
    const local =
      host === "localhost" || host === "127.0.0.1" || host === "::1";
    return local && parsed.pathname.includes("studiolayer_credit_dev");
  } catch {
    return false;
  }
}

function utcDateInputValue(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

loadRootEnvForTests();

const LIVE = isLocalCreditDevDatabase();

function createMockJsonRes() {
  const res: any = {};
  res._status = undefined;
  res._json = undefined;
  res.status = (code: number) => {
    res._status = code;
    return res;
  };
  res.json = (payload: unknown) => {
    res._json = payload;
    return res;
  };
  return res;
}

function createMockExportRes() {
  const res: any = {};
  res._status = undefined;
  res._headers = {} as Record<string, string>;
  res._body = undefined;
  res.status = (code: number) => {
    res._status = code;
    return res;
  };
  res.setHeader = (key: string, value: string) => {
    res._headers[key] = value;
    return res;
  };
  res.send = (body: Buffer) => {
    res._body = body;
    return res;
  };
  res.json = (payload: unknown) => {
    res._json = payload;
    return res;
  };
  return res;
}

describe("GET /api/admin/generations", { skip: !LIVE }, () => {
  it("returns date-filtered ledger metrics without sensitive fields", async () => {
    const {
      db,
      usersTable,
      rendersTable,
      studioCreditTransactionsTable,
    } = await import("@workspace/db");
    const { eq, inArray } = await import("drizzle-orm");
    const { StudioCreditReasonCode, StudioCreditTransactionStatus } =
      await import("@workspace/studio-credit-engine");
    const { requireAdmin } = await import("../lib/require-admin.js");
    const { getAdminGenerationsOverview } = await import("./admin-generations.js");

    const adminEmail = `admin-${randomUUID()}@studiolayer.local`;
    const customerEmail = `cust-${randomUUID()}@studiolayer.local`;
    const fromDate = utcDateInputValue();
    const toDate = utcDateInputValue();

    const [adminUser] = await db
      .insert(usersTable)
      .values({
        email: adminEmail,
        passwordHash: "admin-test-hash",
        name: "Local Admin (Generations Test)",
        subscriptionTier: "free",
        hasCompletedOnboarding: true,
        isAdmin: true,
      })
      .returning();

    const [customer] = await db
      .insert(usersTable)
      .values({
        email: customerEmail,
        passwordHash: "customer-test-hash",
        name: "Local Customer (Generations Test)",
        subscriptionTier: "free",
        hasCompletedOnboarding: true,
        isAdmin: false,
      })
      .returning();

    const txIds: string[] = [];
    let renderId: number | undefined;

    try {
      const sessionId = randomUUID();
      const [render] = await db
        .insert(rendersTable)
        .values({
          userId: customer!.id,
          sourceImageUrl: "https://example.invalid/garment.jpg",
          modelPersona: "test",
          locationEnvironment: "test",
          status: "completed",
          generationType: "hero",
          studioCreditsUsed: 1,
          generationSessionId: sessionId,
        })
        .returning();
      renderId = render!.id;

      const heroTxId = randomUUID();
      txIds.push(heroTxId);
      await db.insert(studioCreditTransactionsTable).values({
        transactionId: heroTxId,
        userId: customer!.id,
        workspaceId: customer!.id,
        amount: -1,
        reasonCode: StudioCreditReasonCode.HERO_GENERATION,
        status: StudioCreditTransactionStatus.COMPLETED,
        renderId: render!.id,
      });

      const refineTxId = randomUUID();
      txIds.push(refineTxId);
      await db.insert(studioCreditTransactionsTable).values({
        transactionId: refineTxId,
        userId: customer!.id,
        workspaceId: customer!.id,
        amount: -1,
        reasonCode: StudioCreditReasonCode.REFINE,
        status: StudioCreditTransactionStatus.COMPLETED,
        renderId: render!.id,
      });

      const req: any = {
        session: { userId: adminUser!.id },
        query: { fromDate, toDate },
      };
      const res = createMockJsonRes();
      let nextCalled = false;
      await requireAdmin(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);

      await getAdminGenerationsOverview(req, res);
      const payload = res._json as any;

      assert.equal(payload.dateRange.fromDate, fromDate);
      assert.equal(payload.dateRange.toDate, toDate);
      assert.ok(typeof payload.summary.totalGenerations === "number");
      assert.ok(typeof payload.summary.imagesCreated === "number");
      assert.equal(payload.recentActivity, undefined);

      assert.ok(payload.summary.totalGenerations >= 1);
      assert.ok(payload.summary.editsMade >= 1);
      assert.ok(payload.summary.studioCreditsUsed >= 2);
    } finally {
      if (txIds.length > 0) {
        await db
          .delete(studioCreditTransactionsTable)
          .where(
            inArray(studioCreditTransactionsTable.transactionId, txIds),
          );
      }
      if (renderId != null) {
        await db.delete(rendersTable).where(eq(rendersTable.id, renderId));
      }
      await db
        .delete(usersTable)
        .where(inArray(usersTable.id, [adminUser!.id, customer!.id]));
    }
  });

  it("export returns an xlsx buffer for the selected date range", async () => {
    const { db, usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { requireAdmin } = await import("../lib/require-admin.js");
    const { getAdminGenerationsExport } = await import("./admin-generations.js");

    const adminEmail = `admin-${randomUUID()}@studiolayer.local`;
    const fromDate = utcDateInputValue();
    const toDate = utcDateInputValue();

    const [adminUser] = await db
      .insert(usersTable)
      .values({
        email: adminEmail,
        passwordHash: "admin-test-hash",
        name: "Local Admin (Generations Export Test)",
        subscriptionTier: "free",
        hasCompletedOnboarding: true,
        isAdmin: true,
      })
      .returning();

    try {
      const req: any = {
        session: { userId: adminUser!.id },
        query: { fromDate, toDate },
      };
      const res = createMockExportRes();
      let nextCalled = false;
      await requireAdmin(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);

      await getAdminGenerationsExport(req, res);

      assert.ok(Buffer.isBuffer(res._body));
      assert.equal(res._body.subarray(0, 2).toString("utf8"), "PK");
      assert.match(
        res._headers["Content-Type"],
        /spreadsheetml\.sheet/,
      );
      assert.match(
        res._headers["Content-Disposition"],
        /StudioLayer Admin Generations/,
      );
    } finally {
      await db.delete(usersTable).where(eq(usersTable.id, adminUser!.id));
    }
  });

  it("non-admin receives 403", async () => {
    const { db, usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { requireAdmin } = await import("../lib/require-admin.js");

    const email = `user-${randomUUID()}@studiolayer.local`;
    const [user] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash: "user-test-hash",
        name: "Local User",
        subscriptionTier: "free",
        hasCompletedOnboarding: true,
        isAdmin: false,
      })
      .returning();

    try {
      const req: any = { session: { userId: user!.id } };
      const res = createMockJsonRes();
      let nextCalled = false;
      await requireAdmin(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, false);
      assert.equal(res._status, 403);
    } finally {
      await db.delete(usersTable).where(eq(usersTable.id, user!.id));
    }
  });
});
