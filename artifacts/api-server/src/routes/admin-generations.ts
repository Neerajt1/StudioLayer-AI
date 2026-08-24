import type { Request, Response } from "express";
import { parseAdminGenerationsDateRange } from "../services/admin-generations-date-range.js";
import { generateAdminGenerationsExportBuffer } from "../services/admin-generations-export.js";
import { loadAdminGenerationsSummary } from "../services/admin-generations-stats.js";
import { logger } from "../lib/logger.js";

function handleDateRangeError(res: Response, error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("fromDate") ||
    message.includes("toDate") ||
    message.includes("valid date")
  ) {
    res.status(400).json({ error: message });
    return true;
  }
  return false;
}

/** GET /api/admin/generations?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD */
export async function getAdminGenerationsOverview(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const range = parseAdminGenerationsDateRange(req.query);
    const summary = await loadAdminGenerationsSummary(range.from, range.to);

    res.json({
      dateRange: {
        fromDate: range.fromDate,
        toDate: range.toDate,
      },
      summary,
    });
  } catch (error) {
    if (handleDateRangeError(res, error)) return;
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      "admin-generations: summary failed",
    );
    res.status(500).json({ error: "Failed to load generations summary" });
  }
}

/** GET /api/admin/generations/export?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD */
export async function getAdminGenerationsExport(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const range = parseAdminGenerationsDateRange(req.query);
    const result = await generateAdminGenerationsExportBuffer(range);

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
    if (handleDateRangeError(res, error)) return;
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      "admin-generations: export failed",
    );
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate generations export" });
    }
  }
}
