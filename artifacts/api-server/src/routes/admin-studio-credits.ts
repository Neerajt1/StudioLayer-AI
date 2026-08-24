import type { Request, Response } from "express";
import { parseAdminGenerationsDateRange } from "../services/admin-generations-date-range.js";
import { parseAdminExpirationDateRange } from "../services/admin-studio-credits-stats.js";
import { loadAdminStudioCreditsOverview } from "../services/admin-studio-credits-data.js";
import { generateAdminStudioCreditsExportBuffer } from "../services/admin-studio-credits-export.js";
import { logger } from "../lib/logger.js";

function handleQueryError(res: Response, error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("fromDate") ||
    message.includes("toDate") ||
    message.includes("expirationFromDate") ||
    message.includes("expirationToDate") ||
    message.includes("valid date") ||
    message.includes("Expiration range")
  ) {
    res.status(400).json({ error: message });
    return true;
  }
  return false;
}

/** GET /api/admin/studio-credits */
export async function getAdminStudioCreditsOverview(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const range = parseAdminGenerationsDateRange(req.query);
    const expirationRange = parseAdminExpirationDateRange(req.query);
    const overview = await loadAdminStudioCreditsOverview({
      fromDate: range.fromDate,
      toDate: range.toDate,
      from: range.from,
      to: range.to,
      expirationFromDate: expirationRange.expirationFromDate,
      expirationToDate: expirationRange.expirationToDate,
      expirationFrom: expirationRange.from,
      expirationTo: expirationRange.to,
    });

    res.json(overview);
  } catch (error) {
    if (handleQueryError(res, error)) return;
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      "admin-studio-credits: overview failed",
    );
    res.status(500).json({ error: "Failed to load Studio Credits overview" });
  }
}

/** GET /api/admin/studio-credits/export */
export async function getAdminStudioCreditsExport(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const range = parseAdminGenerationsDateRange(req.query);
    const expirationRange = parseAdminExpirationDateRange(req.query);
    const result = await generateAdminStudioCreditsExportBuffer({
      ...range,
      expirationFromDate: expirationRange.expirationFromDate,
      expirationToDate: expirationRange.expirationToDate,
      expirationFrom: expirationRange.from,
      expirationTo: expirationRange.to,
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader("Cache-Control", "no-store");
    res.send(result.buffer);
  } catch (error) {
    if (handleQueryError(res, error)) return;
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      "admin-studio-credits: export failed",
    );
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate Studio Credits export" });
    }
  }
}
