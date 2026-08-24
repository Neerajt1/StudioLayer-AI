import type { Request, Response } from "express";
import { refreshAdminProviderUsage } from "../services/admin-provider-usage.js";
import { logger } from "../lib/logger.js";

/** GET /api/admin/provider-usage */
export async function getAdminProviderUsage(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const snapshot = await refreshAdminProviderUsage();
    res.json({
      checkedAt: snapshot.checkedAt,
      providers: snapshot.providers,
    });
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      "admin-provider-usage: refresh failed",
    );
    res.status(500).json({ error: "Failed to refresh provider usage" });
  }
}
