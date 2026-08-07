import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { isStudioAdmin } from "@workspace/studio-credit-engine";

/** Admin-only gate for internal diagnostic routes. */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const sessionUserId = req.session?.userId;
  if (!sessionUserId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db
    .select({ isAdmin: usersTable.isAdmin })
    .from(usersTable)
    .where(eq(usersTable.id, sessionUserId));

  if (!isStudioAdmin(user)) {
    res.status(403).json({ error: "Administrator access required" });
    return;
  }

  next();
}
