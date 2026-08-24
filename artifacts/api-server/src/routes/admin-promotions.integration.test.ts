/**
 * Live Postgres integration tests for Admin Promotions.
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

describe("Admin Promotions CRUD", { skip: !LIVE }, () => {
  async function ensurePromotionsTable(): Promise<void> {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = path.dirname(fileURLToPath(import.meta.url));
    const sqlPath = path.resolve(
      here,
      "../../../../lib/db/migrations/017_studio_promotions.sql",
    );
    const sql = fs.readFileSync(sqlPath, "utf8");
    const { pool } = await import("@workspace/db");
    await pool.query(sql);
  }

  it("create, list, update, disable", async () => {
    await ensurePromotionsTable();

    const { db, usersTable, studioPromotionsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { requireAdmin } = await import("../lib/require-admin.js");
    const {
      createAdminPromotion,
      listAdminPromotions,
      updateAdminPromotion,
      disableAdminPromotion,
    } = await import("./admin-promotions.js");

    const adminEmail = `admin-${randomUUID()}@studiolayer.local`;
    const [adminUser] = await db
      .insert(usersTable)
      .values({
        email: adminEmail,
        passwordHash: "admin-test-hash",
        name: "Local Admin (Promotions Test)",
        subscriptionTier: "free",
        hasCompletedOnboarding: true,
        isAdmin: true,
      })
      .returning();

    const promotionIds: number[] = [];

    try {
      const createRes = createMockRes();
      const createReq: any = {
        session: { userId: adminUser!.id },
        body: {
          name: "Diwali Special",
          message: "Get 20% extra value this festive season",
          startDate: "2030-11-01",
          endDate: "2030-11-30",
          badgeLabel: "DIWALI OFFER",
          bonusCredits: 25,
          bonusCreditsExpiresAt: null,
          enabled: true,
        },
      };

      let nextCalled = false;
      await requireAdmin(createReq, createRes, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);
      await createAdminPromotion(createReq, createRes);
      assert.equal(createRes._status, 201);

      const created = createRes._json as any;
      promotionIds.push(created.id);
      assert.equal(created.name, "Diwali Special");
      assert.equal(created.badgeLabel, "DIWALI OFFER");
      assert.equal(created.bonusCredits, 25);
      assert.equal(created.enabled, true);
      assert.equal(created.status, "scheduled");
      assert.equal(created.createdByAdminId, adminUser!.id);

      const listRes = createMockRes();
      const listReq: any = { session: { userId: adminUser!.id } };
      await listAdminPromotions(listReq, listRes);
      const all = listRes._json as any[];
      assert.ok(all.some((p) => p.id === created.id));

      const patchRes = createMockRes();
      const patchReq: any = {
        session: { userId: adminUser!.id },
        params: { promotionId: String(created.id) },
        body: {
          name: "Diwali Special (Updated)",
          message: "Updated festive message",
          startDate: "2030-11-01",
          endDate: "2030-11-30",
          badgeLabel: "20% EXTRA",
          bonusCredits: 30,
          bonusCreditsExpiresAt: "2031-01-15",
          enabled: true,
        },
      };
      await updateAdminPromotion(patchReq, patchRes);
      const updated = patchRes._json as any;
      assert.equal(updated.name, "Diwali Special (Updated)");
      assert.equal(updated.badgeLabel, "20% EXTRA");
      assert.equal(updated.bonusCredits, 30);

      const disableRes = createMockRes();
      const disableReq: any = {
        session: { userId: adminUser!.id },
        params: { promotionId: String(created.id) },
      };
      await disableAdminPromotion(disableReq, disableRes);
      assert.equal(disableRes._json.enabled, false);
    } finally {
      for (const id of promotionIds) {
        await db
          .delete(studioPromotionsTable)
          .where(eq(studioPromotionsTable.id, id));
      }
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
