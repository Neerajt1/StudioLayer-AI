import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { MembershipCreditAllowances } from "@workspace/studio-credit-engine";
import { deleteStudioAccount, StudioDeletionError } from "../services/delete-studio.js";
import { sendWelcomeEmail } from "../services/email/welcome-email.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

/** Complimentary tier allowance — sourced from Studio Credit Engine. */
export const FREE_TIER_LIMIT = MembershipCreditAllowances.complimentary;

function mapUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    subscriptionTier: user.subscriptionTier,
    hasCompletedOnboarding: user.hasCompletedOnboarding,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
  };
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password, name } = parsed.data;

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()));

  if (existing) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(usersTable)
    .values({ email: email.toLowerCase(), passwordHash, name })
    .returning();

  req.session!.userId = user.id;

  void sendWelcomeEmail({ email: user.email, name: user.name });

  res.status(201).json(mapUser(user));
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()));

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  req.session!.userId = user.id;

  res.json(mapUser(user));
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session!.destroy(() => {});
  res.sendStatus(204);
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json(mapUser(user));
});

router.patch("/auth/complete-onboarding", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ hasCompletedOnboarding: true })
    .where(eq(usersTable.id, userId))
    .returning();

  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json(mapUser(user));
});

router.delete("/auth/studio", async (req, res): Promise<void> => {
  const requestLog = logger.child({ route: "DELETE /auth/studio" });

  requestLog.info({ step: "request_received" }, "Studio deletion request received");

  const userId = req.session?.userId;
  if (!userId) {
    requestLog.warn({ step: "authentication" }, "Studio deletion rejected — not authenticated");
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  requestLog.info({ userId, step: "authentication" }, "User authenticated");

  try {
    await deleteStudioAccount(userId, requestLog);
  } catch (error) {
    const step = error instanceof StudioDeletionError ? error.step : "unknown";
    requestLog.error(
      {
        err: error,
        userId,
        step,
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Studio deletion failed",
    );

    res.status(503).json({
      error:
        "We couldn't complete your Studio deletion at this time. Please try again in a few moments.",
    });
    return;
  }

  requestLog.info({ userId, step: "session_destroy" }, "Destroying session");

  try {
    await new Promise<void>((resolve, reject) => {
      req.session!.destroy((destroyError) => {
        if (destroyError) {
          reject(destroyError);
          return;
        }
        resolve();
      });
    });
    requestLog.info({ userId, step: "session_destroy" }, "Session destroyed");
  } catch (destroyError) {
    requestLog.error(
      {
        err: destroyError,
        userId,
        step: "session_destroy",
        stack: destroyError instanceof Error ? destroyError.stack : undefined,
      },
      "Session destroy failed after successful Studio deletion — account already removed",
    );
  }

  requestLog.info({ userId, step: "success_response" }, "Studio deletion complete — success response returned");
  res.sendStatus(204);
});

export default router;
