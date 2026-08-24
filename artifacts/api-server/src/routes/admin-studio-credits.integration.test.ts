/**
 * Live Postgres integration tests for Admin Studio Credits overview and export.
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

function addUtcDays(date: Date, days: number): string {
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days),
  );
  return utcDateInputValue(next);
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
  res._headers = {} as Record<string, string>;
  res._body = undefined;
  res._status = undefined;
  res._json = undefined;
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

describe("GET /api/admin/studio-credits", { skip: !LIVE }, () => {
  it("returns business summary, current position, and expiration overview", async () => {
    const { db, usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { requireAdmin } = await import("../lib/require-admin.js");
    const { getAdminStudioCreditsOverview } = await import("./admin-studio-credits.js");

    const adminEmail = `admin-${randomUUID()}@studiolayer.local`;
    const now = new Date();
    const fromDate = utcDateInputValue(now);
    const toDate = utcDateInputValue(now);
    const expirationFromDate = fromDate;
    const expirationToDate = addUtcDays(now, 30);

    const [adminUser] = await db
      .insert(usersTable)
      .values({
        email: adminEmail,
        passwordHash: "admin-test-hash",
        name: "Local Admin (Studio Credits Test)",
        subscriptionTier: "free",
        hasCompletedOnboarding: true,
        isAdmin: true,
      })
      .returning();

    try {
      const req: any = {
        session: { userId: adminUser!.id },
        query: { fromDate, toDate, expirationFromDate, expirationToDate },
      };
      const res = createMockJsonRes();
      let nextCalled = false;
      await requireAdmin(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);

      await getAdminStudioCreditsOverview(req, res);
      const payload = res._json as any;

      assert.equal(payload.dateRange.fromDate, fromDate);
      assert.equal(payload.dateRange.toDate, toDate);
      assert.ok(typeof payload.summary.creditsAdded === "number");
      assert.ok(typeof payload.summary.promotionalCreditsGranted === "number");
      assert.ok(typeof payload.summary.creditsConsumed === "number");
      assert.ok(typeof payload.currentPosition.totalCreditsRemaining === "number");
      assert.ok(typeof payload.expiration.totalCreditsExpiring === "number");
      assert.ok(Array.isArray(payload.expiration.byDate));
      assert.equal(payload.customers, undefined);

      const serialized = JSON.stringify(payload);
      assert.equal(serialized.includes("passwordHash"), false);
    } finally {
      await db.delete(usersTable).where(eq(usersTable.id, adminUser!.id));
    }
  });

  it("export returns an xlsx buffer for the selected date range", async () => {
    const { db, usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { requireAdmin } = await import("../lib/require-admin.js");
    const { getAdminStudioCreditsExport } = await import("./admin-studio-credits.js");

    const adminEmail = `admin-${randomUUID()}@studiolayer.local`;
    const now = new Date();
    const fromDate = utcDateInputValue(now);
    const toDate = utcDateInputValue(now);
    const expirationFromDate = fromDate;
    const expirationToDate = addUtcDays(now, 30);

    const [adminUser] = await db
      .insert(usersTable)
      .values({
        email: adminEmail,
        passwordHash: "admin-test-hash",
        name: "Local Admin (Studio Credits Export Test)",
        subscriptionTier: "free",
        hasCompletedOnboarding: true,
        isAdmin: true,
      })
      .returning();

    try {
      const req: any = {
        session: { userId: adminUser!.id },
        query: { fromDate, toDate, expirationFromDate, expirationToDate },
      };
      const res = createMockExportRes();
      let nextCalled = false;
      await requireAdmin(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);

      await getAdminStudioCreditsExport(req, res);

      assert.ok(Buffer.isBuffer(res._body));
      assert.equal(res._body.subarray(0, 2).toString("utf8"), "PK");
      assert.match(
        res._headers["Content-Disposition"],
        /StudioLayer Admin Studio Credits/,
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
