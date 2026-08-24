/**
 * Live Postgres integration tests for Admin Provider Usage.
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

describe("GET /api/admin/provider-usage", { skip: !LIVE }, () => {
  it("returns all providers without exposing secrets", async () => {
    const { db, usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { requireAdmin } = await import("../lib/require-admin.js");
    const { getAdminProviderUsage } = await import("./admin-provider-usage.js");

    const adminEmail = `admin-${randomUUID()}@studiolayer.local`;
    const [adminUser] = await db
      .insert(usersTable)
      .values({
        email: adminEmail,
        passwordHash: "admin-test-hash",
        name: "Local Admin (Provider Usage Test)",
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

      await getAdminProviderUsage(req, res);
      const payload = res._json as any;

      assert.ok(payload.checkedAt);
      assert.equal(Array.isArray(payload.providers), true);
      assert.equal(payload.providers.length, 7);

      const keys = payload.providers.map((p: any) => p.key);
      assert.deepEqual(keys, [
        "openrouter",
        "fal",
        "openai",
        "railway",
        "neon",
        "cloudflare",
        "github",
      ]);

      const serialized = JSON.stringify(payload);
      assert.equal(serialized.includes("OPENROUTER_API_KEY"), false);
      assert.equal(serialized.includes("FAL_KEY"), false);
      assert.equal(serialized.includes("sk-or-v1"), false);
      assert.equal(serialized.includes("passwordHash"), false);
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
