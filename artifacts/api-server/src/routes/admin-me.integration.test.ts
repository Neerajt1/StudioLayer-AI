import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

describe("GET /api/admin/me (admin authorization foundation)", { skip: !LIVE }, () => {
  it("admin user: 200 and safe fields only", async () => {
    const { db, usersTable } = await import("@workspace/db");
    const { inArray, eq } = await import("drizzle-orm");
    const { requireAdmin } = await import("../lib/require-admin.js");
    const { getAdminMe } = await import("./admin.js");

    const email = `admin-${randomUUID()}@studiolayer.local`;

    const [adminUser] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash: "admin-test-hash",
        name: "Local Admin (Test)",
        subscriptionTier: "free",
        hasCompletedOnboarding: true,
        isAdmin: true,
      })
      .returning();

    try {
      const req: any = { session: { userId: adminUser!.id } };
      const res = createMockRes();
      let nextCalled = false;
      const next = () => {
        nextCalled = true;
      };

      await requireAdmin(req, res, next as any);
      assert.equal(nextCalled, true);

      await getAdminMe(req, res);

      assert.equal(res._status, undefined, "handler uses res.json without status override");
      assert.ok(res._json && typeof res._json === "object");

      const payload = res._json as any;
      assert.equal(payload.id, adminUser!.id);
      assert.equal(payload.email, email);
      assert.equal(payload.name, "Local Admin (Test)");
      assert.equal(payload.isAdmin, true);

      // Ensure sensitive fields are not exposed.
      assert.equal(payload.passwordHash, undefined);
      assert.equal(payload.password_hash, undefined);
    } finally {
      await db.delete(usersTable).where(inArray(usersTable.id, [adminUser!.id]));
    }
  });

  it("non-admin authenticated user: 403", async () => {
    const { db, usersTable } = await import("@workspace/db");
    const { inArray } = await import("drizzle-orm");
    const { requireAdmin } = await import("../lib/require-admin.js");

    const email = `user-${randomUUID()}@studiolayer.local`;

    const [userRow] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash: "user-test-hash",
        name: "Local User (Test)",
        subscriptionTier: "free",
        hasCompletedOnboarding: true,
        isAdmin: false,
      })
      .returning();

    try {
      const req: any = { session: { userId: userRow!.id } };
      const res = createMockRes();
      let nextCalled = false;
      const next = () => {
        nextCalled = true;
      };

      await requireAdmin(req, res, next as any);
      assert.equal(nextCalled, false);
      assert.equal(res._status, 403);
      assert.deepEqual(res._json, { error: "Administrator access required" });
    } finally {
      await db.delete(usersTable).where(inArray(usersTable.id, [userRow!.id]));
    }
  });

  it("unauthenticated request: 401", async () => {
    const { requireAdmin } = await import("../lib/require-admin.js");

    const req: any = { session: undefined };
    const res = createMockRes();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    await requireAdmin(req, res, next as any);
    assert.equal(nextCalled, false);
    assert.equal(res._status, 401);
    assert.deepEqual(res._json, { error: "Not authenticated" });
  });
});

