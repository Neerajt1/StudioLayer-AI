import { Router, type IRouter } from "express";
import { eq, and, desc, count } from "drizzle-orm";
import { db, rendersTable, usersTable } from "@workspace/db";
import { CreateRenderBody, GetRenderParams } from "@workspace/api-zod";
import { FREE_TIER_LIMIT } from "./auth";

const router: IRouter = Router();

const TIER_LIMITS: Record<string, number | null> = {
  free: FREE_TIER_LIMIT,
  pro: null,
  enterprise: null,
};

router.get("/renders/usage", async (req, res): Promise<void> => {
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

  const [result] = await db
    .select({ count: count() })
    .from(rendersTable)
    .where(eq(rendersTable.userId, userId));

  const used = result?.count ?? 0;
  const tier = user.subscriptionTier;
  const limit = TIER_LIMITS[tier] ?? null;
  const canRender = limit === null || used < limit;

  res.json({ used, limit, tier, canRender });
});

router.get("/renders", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const renders = await db
    .select()
    .from(rendersTable)
    .where(eq(rendersTable.userId, userId))
    .orderBy(desc(rendersTable.createdAt));

  res.json(renders);
});

router.post("/renders", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = CreateRenderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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

  const tier = user.subscriptionTier;
  const limit = TIER_LIMITS[tier] ?? null;

  if (limit !== null) {
    const [result] = await db
      .select({ count: count() })
      .from(rendersTable)
      .where(eq(rendersTable.userId, userId));
    const used = result?.count ?? 0;
    if (used >= limit) {
      res.status(403).json({
        error: `Free tier limit of ${limit} renders reached. Upgrade to Pro for unlimited renders.`,
      });
      return;
    }
  }

  const { sourceImageUrl, modelPersona, locationEnvironment } = parsed.data;

  const [render] = await db
    .insert(rendersTable)
    .values({
      userId,
      sourceImageUrl,
      modelPersona,
      locationEnvironment,
      status: "pending",
    })
    .returning();

  // Simulate async processing: mark as processing
  // In production, this triggers a diffusion API call (Replicate, Fal.ai, etc.)
  // and the outputImageUrl is populated via webhook/polling when the job completes.
  setTimeout(async () => {
    await db
      .update(rendersTable)
      .set({ status: "processing" })
      .where(eq(rendersTable.id, render.id));
  }, 500);

  res.status(201).json(render);
});

router.get("/renders/:id", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetRenderParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [render] = await db
    .select()
    .from(rendersTable)
    .where(
      and(
        eq(rendersTable.id, params.data.id),
        eq(rendersTable.userId, userId),
      ),
    );

  if (!render) {
    res.status(404).json({ error: "Render not found" });
    return;
  }

  res.json(render);
});

export default router;
