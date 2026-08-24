import type { Request, Response } from "express";
import { Router, type IRouter } from "express";
import { eq, ilike, or, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, studioCreditAllocationsTable, studioCreditTransactionsTable, usersTable } from "@workspace/db";
import { requireAdmin } from "../lib/require-admin.js";
import {
  grantCreditAllocation,
  getStudioCreditBalance,
} from "../services/studio-credit-service.js";
import { StudioCreditReasonCode } from "@workspace/studio-credit-engine";
import {
  createAdminPromotion,
  disableAdminPromotion,
  listAdminPromotions,
  updateAdminPromotion,
} from "./admin-promotions.js";
import { getAdminGenerationsOverview, getAdminGenerationsExport } from "./admin-generations.js";
import { getAdminSystemHealth } from "./admin-system-health.js";
import { getAdminProviderUsage } from "./admin-provider-usage.js";
import {
  getAdminStudioCreditsOverview,
  getAdminStudioCreditsExport,
} from "./admin-studio-credits.js";

/**
 * Admin API — foundation-only.
 * AuthN via session, AuthZ via server-side `users.is_admin` check.
 */
export async function getAdminMe(req: Request, res: Response): Promise<void> {
  const sessionUserId = req.session?.userId;
  if (!sessionUserId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      isAdmin: usersTable.isAdmin,
    })
    .from(usersTable)
    .where(eq(usersTable.id, sessionUserId));

  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
  });
}

function parsePositiveInt(input: unknown, label: string): number {
  if (typeof input === "number" && Number.isInteger(input) && input > 0) {
    return input;
  }
  if (typeof input === "string") {
    const n = Number(input);
    if (Number.isInteger(n) && n > 0) return n;
  }
  throw new Error(`${label} must be a positive integer`);
}

function parseMaybeExpiryDate(input: unknown): Date | null {
  if (input == null) return null;
  if (input === "") return null;
  if (typeof input !== "string") {
    throw new Error("expiresAt must be ISO date string or null");
  }

  // UI sends `YYYY-MM-DD`; interpret as UTC midnight.
  const normalized =
    input.length === 10 ? `${input}T00:00:00.000Z` : input;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) {
    throw new Error("expiresAt is not a valid date");
  }
  return d;
}

function adminGrantSourceReference(input: {
  adminUserId: number;
  targetUserId: number;
  reason: string;
  now: Date;
}): string {
  const safeReason = input.reason.trim().slice(0, 240);
  return [
    "admin-grant",
    input.adminUserId,
    input.targetUserId,
    encodeURIComponent(safeReason),
    input.now.toISOString(),
    randomUUID(),
  ].join(":");
}

/**
 * GET /api/admin/customers?search=<email|name|userId>
 * Safe fields only.
 */
export async function searchAdminCustomers(
  req: Request,
  res: Response,
): Promise<void> {
  const searchRaw = req.query.search;
  const q = typeof searchRaw === "string" ? searchRaw.trim() : "";

  const limitRaw = req.query.limit;
  const limit = Math.min(
    limitRaw == null ? 10 : parsePositiveInt(limitRaw, "limit"),
    25,
  );

  if (q.length === 0) {
    res.json([]);
    return;
  }

  const userIdMatch = /^\d+$/.test(q) ? Number(q) : null;

  const predicateParts = [
    ilike(usersTable.email, `%${q}%`),
    ilike(usersTable.name, `%${q}%`),
  ];
  if (userIdMatch != null) predicateParts.push(eq(usersTable.id, userIdMatch));

  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      isAdmin: usersTable.isAdmin,
      subscriptionTier: usersTable.subscriptionTier,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(or(...predicateParts))
    .orderBy(desc(usersTable.createdAt))
    .limit(limit);

  res.json(rows);
}

/**
 * GET /api/admin/customers/:userId
 * Includes current Studio Credits + ledger-based credit history.
 */
export async function getAdminCustomerDetails(
  req: Request,
  res: Response,
): Promise<void> {
  const userIdRaw = req.params.userId;
  const userId = Number(userIdRaw);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      isAdmin: usersTable.isAdmin,
      subscriptionTier: usersTable.subscriptionTier,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  const balance = await getStudioCreditBalance({
    userId,
    tier: user.subscriptionTier,
    limit: null,
    isAdmin: user.isAdmin,
  });

  const historyRows = await db
    .select({
      transactionId: studioCreditTransactionsTable.transactionId,
      createdAt: studioCreditTransactionsTable.createdAt,
      reasonCode: studioCreditTransactionsTable.reasonCode,
      amount: studioCreditTransactionsTable.amount,
      status: studioCreditTransactionsTable.status,
      renderId: studioCreditTransactionsTable.renderId,
      allocationSourceReference:
        studioCreditAllocationsTable.sourceReference,
      allocationExpiresAt: studioCreditAllocationsTable.expiresAt,
    })
    .from(studioCreditTransactionsTable)
    .leftJoin(
      studioCreditAllocationsTable,
      eq(
        studioCreditAllocationsTable.ledgerTransactionId,
        studioCreditTransactionsTable.transactionId,
      ),
    )
    .where(eq(studioCreditTransactionsTable.userId, userId))
    .orderBy(desc(studioCreditTransactionsTable.createdAt))
    .limit(50);

  res.json({
    account: {
      id: user.id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      subscriptionTier: user.subscriptionTier,
      createdAt: user.createdAt,
    },
    studioCredits: {
      current: balance.remaining,
    },
    history: historyRows,
  });
}

/**
 * POST /api/admin/customers/:userId/studio-credits/grant
 */
export async function adminGrantCustomerStudioCredits(
  req: Request,
  res: Response,
): Promise<void> {
  const sessionAdminUserId = req.session?.userId;
  if (!sessionAdminUserId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const userIdRaw = req.params.userId;
  const userId = Number(userIdRaw);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  const { credits, expiresAt, reason } = req.body ?? {};

  const parsedCredits = parsePositiveInt(credits, "credits");
  const parsedReason =
    typeof reason === "string" ? reason.trim() : "";
  if (parsedReason.length === 0) {
    res.status(400).json({ error: "Reason is required" });
    return;
  }
  if (parsedReason.length > 500) {
    res.status(400).json({ error: "Reason is too long" });
    return;
  }

  let parsedExpiry: Date | null;
  try {
    parsedExpiry = parseMaybeExpiryDate(expiresAt);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }

  const [targetUser] = await db
    .select({ id: usersTable.id, subscriptionTier: usersTable.subscriptionTier })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!targetUser) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  const now = new Date();
  const sourceReference = adminGrantSourceReference({
    adminUserId: sessionAdminUserId,
    targetUserId: userId,
    reason: parsedReason,
    now,
  });

  const result = await grantCreditAllocation({
    userId,
    reasonCode: StudioCreditReasonCode.ADMIN_GRANT_ALLOCATION,
    credits: parsedCredits,
    sourceReference,
    startsAt: now,
    expiresAt: parsedExpiry,
    tier: targetUser.subscriptionTier,
  });

  res.json({
    ok: true,
    allocationId: result.allocationId,
    ledgerTransactionId: result.ledgerTransactionId,
  });
}

const router: IRouter = Router();

router.get("/admin/me", requireAdmin, async (req, res): Promise<void> => {
  await getAdminMe(req, res);
});

router.get(
  "/admin/system-health",
  requireAdmin,
  async (req, res): Promise<void> => {
    await getAdminSystemHealth(req, res);
  },
);

router.get(
  "/admin/provider-usage",
  requireAdmin,
  async (req, res): Promise<void> => {
    await getAdminProviderUsage(req, res);
  },
);

router.get(
  "/admin/studio-credits/export",
  requireAdmin,
  async (req, res): Promise<void> => {
    await getAdminStudioCreditsExport(req, res);
  },
);

router.get(
  "/admin/studio-credits",
  requireAdmin,
  async (req, res): Promise<void> => {
    await getAdminStudioCreditsOverview(req, res);
  },
);

router.get(
  "/admin/generations/export",
  requireAdmin,
  async (req, res): Promise<void> => {
    await getAdminGenerationsExport(req, res);
  },
);

router.get(
  "/admin/generations",
  requireAdmin,
  async (req, res): Promise<void> => {
    await getAdminGenerationsOverview(req, res);
  },
);

router.get(
  "/admin/customers",
  requireAdmin,
  async (req, res): Promise<void> => {
    await searchAdminCustomers(req, res);
  },
);

router.get(
  "/admin/customers/:userId",
  requireAdmin,
  async (req, res): Promise<void> => {
    await getAdminCustomerDetails(req, res);
  },
);

router.post(
  "/admin/customers/:userId/studio-credits/grant",
  requireAdmin,
  async (req, res): Promise<void> => {
    await adminGrantCustomerStudioCredits(req, res);
  },
);

router.get(
  "/admin/promotions",
  requireAdmin,
  async (req, res): Promise<void> => {
    await listAdminPromotions(req, res);
  },
);

router.post(
  "/admin/promotions",
  requireAdmin,
  async (req, res): Promise<void> => {
    await createAdminPromotion(req, res);
  },
);

router.patch(
  "/admin/promotions/:promotionId",
  requireAdmin,
  async (req, res): Promise<void> => {
    await updateAdminPromotion(req, res);
  },
);

router.post(
  "/admin/promotions/:promotionId/disable",
  requireAdmin,
  async (req, res): Promise<void> => {
    await disableAdminPromotion(req, res);
  },
);

export default router;

