/**
 * Live Postgres integration tests for Admin System Health.
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

describe("GET /api/admin/system-health", { skip: !LIVE }, () => {
  it("returns safe component health without secrets", async () => {
    const { db, usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { requireAdmin } = await import("../lib/require-admin.js");
    const { getAdminSystemHealth } = await import("./admin-system-health.js");

    const adminEmail = `admin-${randomUUID()}@studiolayer.local`;
    const [adminUser] = await db
      .insert(usersTable)
      .values({
        email: adminEmail,
        passwordHash: "admin-test-hash",
        name: "Local Admin (System Health Test)",
        subscriptionTier: "free",
        hasCompletedOnboarding: true,
        isAdmin: true,
      })
      .returning();

    try {
      const req: any = { session: { userId: adminUser!.id } };
      const res = createMockRes();
      let nextCalled = false;
      await requireAdmin(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);

      await getAdminSystemHealth(req, res);
      const payload = res._json as any;

      assert.ok(payload.checkedAt);
      assert.ok(payload.overallStatus);
      assert.equal(Array.isArray(payload.components), true);
      assert.equal(payload.components.length, 4);

      const keys = payload.components.map((c: any) => c.key);
      assert.deepEqual(keys.sort(), [
        "aiGeneration",
        "api",
        "database",
        "storage",
      ]);

      const api = payload.components.find((c: any) => c.key === "api");
      assert.equal(api.status, "healthy");

      const database = payload.components.find((c: any) => c.key === "database");
      assert.equal(database.status, "healthy");

      const ai = payload.components.find((c: any) => c.key === "aiGeneration");
      assert.equal(ai.status, "not_monitored");

      const serialized = JSON.stringify(payload);
      assert.equal(serialized.includes("DATABASE_URL"), false);
      assert.equal(serialized.includes("R2_SECRET"), false);
      assert.equal(serialized.includes("password"), false);
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
      const res = createMockRes();
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
