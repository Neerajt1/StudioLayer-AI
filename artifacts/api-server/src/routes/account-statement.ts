import { Router, type IRouter } from "express";
import { generateAccountStatementBuffer } from "../services/account-statement/index.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

router.get("/account/statement/download", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const result = await generateAccountStatementBuffer(userId);
    if (!result) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

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
    logger.error(
      {
        userId,
        err: error instanceof Error ? error.message : String(error),
      },
      "account-statement: generation failed",
    );
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate account statement" });
    }
  }
});

export default router;
