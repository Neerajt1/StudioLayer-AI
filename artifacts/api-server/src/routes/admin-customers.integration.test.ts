/**
 * Live Postgres integration tests for Admin Customers & Studio Credits.
 * Runs only against localhost `studiolayer_credit_dev`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { URL } from "node:url";

function loadRootEnvForTests(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // artifacts/api-server/src/routes -> repo root is ../../../../
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

loadRootEnvForTests();

const LIVE = isLocalCreditDevDatabase();

function createMockRes() {
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

describe("Admin Customers → search/detail/grant flow", { skip: !LIVE }, () => {
  it("search returns safe customer fields", async () => {
    const { db, usersTable } = await import("@workspace/db");
    const { inArray, eq } = await import("drizzle-orm");
    const { requireAdmin } = await import("../lib/require-admin.js");
    const { searchAdminCustomers } = await import("./admin.js");

    const adminEmail = `admin-${randomUUID()}@studiolayer.local`;
    const customerEmail = `cust-${randomUUID()}@studiolayer.local`;

    const [adminUser] = await db
      .insert(usersTable)
      .values({
        email: adminEmail,
        passwordHash: "admin-test-hash",
        name: "Local Admin (Customers Test)",
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
        name: "Local Customer (Search Test)",
        subscriptionTier: "free",
        hasCompletedOnboarding: true,
        isAdmin: false,
      })
      .returning();

    try {
      const req: any = {
        session: { userId: adminUser!.id },
        query: { search: customerEmail },
        params: {},
        body: {},
      };
      const res = createMockRes();
      let nextCalled = false;
      await requireAdmin(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);

      await searchAdminCustomers(req, res);

      assert.equal(res._status, undefined);
      const payload = res._json as any[];
      assert.equal(payload.length, 1);
      assert.equal(payload[0]!.id, customer!.id);
      assert.equal(payload[0]!.email, customerEmail);
      assert.equal(payload[0]!.name, customer!.name);
      assert.equal(payload[0]!.subscriptionTier, "free");
      assert.equal(payload[0]!.isAdmin, false);

      // No sensitive fields.
      assert.equal(payload[0]!.passwordHash, undefined);
      assert.equal(payload[0]!.password_hash, undefined);
    } finally {
      await db
        .delete(usersTable)
        .where(inArray(usersTable.id, [adminUser!.id, customer!.id]));
    }
  });

  it("grant creates admin_grant_allocation ledger row and refreshes balance/history", async () => {
    const {
      db,
      usersTable,
      studioCreditTransactionsTable,
      studioCreditAllocationsTable,
    } = await import("@workspace/db");
    const { inArray, eq } = await import("drizzle-orm");
    const { requireAdmin } = await import("../lib/require-admin.js");
    const {
      adminGrantCustomerStudioCredits,
      getAdminCustomerDetails,
    } = await import("./admin.js");

    const adminEmail = `admin-${randomUUID()}@studiolayer.local`;
    const customerEmail = `cust-${randomUUID()}@studiolayer.local`;

    const [adminUser] = await db
      .insert(usersTable)
      .values({
        email: adminEmail,
        passwordHash: "admin-test-hash",
        name: "Local Admin (Grant Test)",
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
        name: "Local Customer (Grant Test)",
        subscriptionTier: "free",
        hasCompletedOnboarding: true,
        isAdmin: false,
      })
      .returning();

    const credits = 7;
    const reason = `Manual grant note ${randomUUID()}`;

    try {
      const beforeRes = createMockRes();
      const beforeReq: any = {
        session: { userId: adminUser!.id },
        query: {},
        params: { userId: String(customer!.id) },
        body: {},
      };

      let nextCalled = false;
      await requireAdmin(beforeReq, beforeRes, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);
      await getAdminCustomerDetails(beforeReq, beforeRes);
      const beforeDetails = beforeRes._json as any;

      const beforeCurrent = beforeDetails.studioCredits.current as number;

      // Grant credits with no expiry.
      const grantRes = createMockRes();
      const grantReq: any = {
        session: { userId: adminUser!.id },
        query: {},
        params: { userId: String(customer!.id) },
        body: {
          credits,
          expiresAt: null,
          reason,
        },
      };

      nextCalled = false;
      await requireAdmin(grantReq, grantRes, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);
      await adminGrantCustomerStudioCredits(grantReq, grantRes);

      assert.equal(grantRes._status, undefined);
      const grantPayload = grantRes._json as any;
      assert.equal(grantPayload.ok, true);
      assert.equal(typeof grantPayload.allocationId, "number");
      assert.equal(typeof grantPayload.ledgerTransactionId, "string");

      // Verify ledger contains the grant transaction.
      const [grantLedger] = await db
        .select()
        .from(studioCreditTransactionsTable)
        .where(
          eq(
            studioCreditTransactionsTable.transactionId,
            grantPayload.ledgerTransactionId,
          ),
        )
        .limit(1);
      assert.equal(grantLedger?.reasonCode, "admin_grant_allocation");
      assert.equal(grantLedger?.amount, credits);

      // Verify allocation carries source_reference with admin + reason.
      const [allocation] = await db
        .select()
        .from(studioCreditAllocationsTable)
        .where(
          eq(studioCreditAllocationsTable.ledgerTransactionId, grantPayload.ledgerTransactionId),
        )
        .limit(1);
      assert.ok(allocation?.sourceReference);
      assert.ok(
        allocation!.sourceReference.startsWith(
          `admin-grant:${adminUser!.id}:${customer!.id}:`,
        ),
      );
      assert.ok(
        allocation!.sourceReference.includes(
          encodeURIComponent(reason.trim().slice(0, 240)),
        ),
      );

      // After details should reflect the grant in current balance + history.
      const afterRes = createMockRes();
      const afterReq: any = {
        session: { userId: adminUser!.id },
        query: {},
        params: { userId: String(customer!.id) },
        body: {},
      };
      nextCalled = false;
      await requireAdmin(afterReq, afterRes, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);
      await getAdminCustomerDetails(afterReq, afterRes);
      const afterDetails = afterRes._json as any;

      const afterCurrent = afterDetails.studioCredits.current as number;
      assert.equal(afterCurrent, beforeCurrent + credits);

      const history: any[] = afterDetails.history ?? [];
      const found = history.find(
        (row) =>
          row.reasonCode === "admin_grant_allocation" &&
          row.amount === credits,
      );
      assert.ok(found, "Expected grant ledger row in history");
      assert.equal(found.status, "completed");
    } finally {
      // Delete users last to keep FK constraints predictable.
      await db
        .delete(usersTable)
        .where(inArray(usersTable.id, [adminUser!.id, customer!.id]));
    }
  });

  it("grant with an expiry date stores allocation.expires_at via existing expiry semantics", async () => {
    const {
      db,
      usersTable,
    } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { requireAdmin } = await import("../lib/require-admin.js");
    const { adminGrantCustomerStudioCredits, getAdminCustomerDetails } =
      await import("./admin.js");

    const adminEmail = `admin-${randomUUID()}@studiolayer.local`;
    const customerEmail = `cust-${randomUUID()}@studiolayer.local`;

    const [adminUser] = await db
      .insert(usersTable)
      .values({
        email: adminEmail,
        passwordHash: "admin-test-hash",
        name: "Local Admin (Expiry Test)",
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
        name: "Local Customer (Expiry Test)",
        subscriptionTier: "free",
        hasCompletedOnboarding: true,
        isAdmin: false,
      })
      .returning();

    const credits = 3;
    const reason = `Expiry grant note ${randomUUID()}`;
    const expiresAtDateOnly = "2030-01-15";
    const expectedExpiresAtIso = "2030-01-15T00:00:00.000Z";

    try {
      const grantRes = createMockRes();
      const grantReq: any = {
        session: { userId: adminUser!.id },
        query: {},
        params: { userId: String(customer!.id) },
        body: {
          credits,
          expiresAt: expiresAtDateOnly,
          reason,
        },
      };

      let nextCalled = false;
      await requireAdmin(grantReq, grantRes, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);
      await adminGrantCustomerStudioCredits(grantReq, grantRes);

      assert.equal(grantRes._json.ok, true);

      const detailsRes = createMockRes();
      const detailsReq: any = {
        session: { userId: adminUser!.id },
        query: {},
        params: { userId: String(customer!.id) },
        body: {},
      };

      nextCalled = false;
      await requireAdmin(detailsReq, detailsRes, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);
      await getAdminCustomerDetails(detailsReq, detailsRes);

      const history: any[] = detailsRes._json.history ?? [];
      const found = history.find(
        (row) =>
          row.reasonCode === "admin_grant_allocation" &&
          row.amount === credits,
      );

      assert.ok(found, "Expected expiring grant row in history");
      const actual = found.allocationExpiresAt?.toISOString
        ? found.allocationExpiresAt.toISOString()
        : found.allocationExpiresAt;
      assert.equal(actual, expectedExpiresAtIso);
    } finally {
      await db.delete(usersTable).where(eq(usersTable.id, adminUser!.id));
      await db.delete(usersTable).where(eq(usersTable.id, customer!.id));
    }
  });

  it("non-admin authenticated user receives 403 for admin customer endpoints", async () => {
    const { db, usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { requireAdmin } = await import("../lib/require-admin.js");

    const email = `user-${randomUUID()}@studiolayer.local`;
    const [user] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash: "user-test-hash",
        name: "Local User (No admin)",
        subscriptionTier: "free",
        hasCompletedOnboarding: true,
        isAdmin: false,
      })
      .returning();

    try {
      const req: any = {
        session: { userId: user!.id },
        query: { search: email },
        params: {},
        body: {},
      };
      const res = createMockRes();
      let nextCalled = false;
      await requireAdmin(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, false);
      assert.equal(res._status, 403);
      assert.deepEqual(res._json, { error: "Administrator access required" });

      // Handler must not run (router would omit calling `next`).
    } finally {
      await db.delete(usersTable).where(eq(usersTable.id, user!.id));
    }
  });

  it("unauthenticated request receives 401 for admin customer endpoints", async () => {
    const { requireAdmin } = await import("../lib/require-admin.js");

    const req: any = { session: undefined };
    const res = createMockRes();
    let nextCalled = false;

    await requireAdmin(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res._status, 401);
    assert.deepEqual(res._json, { error: "Not authenticated" });
  });
});

