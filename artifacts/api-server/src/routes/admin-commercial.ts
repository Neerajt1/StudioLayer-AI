import { Router, type IRouter } from "express";
import { requireAdmin } from "../lib/require-admin.js";
import { runCommercialReconciliation } from "../services/commercial-reconciliation.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

/**
 * GET /api/admin/commercial/reconcile/:userId
 *
 * Internal diagnostic — answers "Is this user's commercial state consistent?"
 * Admin only. Returns PASS or FAIL with exact mismatch details.
 */
router.get(
  "/admin/commercial/reconcile/:userId",
  requireAdmin,
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params.userId)
      ? req.params.userId[0]
      : req.params.userId;
    const userId = Number(rawId);

    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({ error: "Invalid userId" });
      return;
    }

    try {
      const report = await runCommercialReconciliation(userId);

      if (!report) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      logger.info(
        {
          targetUserId: userId,
          adminUserId: req.session?.userId,
          status: report.status,
          mismatchCount: report.mismatchCount,
        },
        "commercial-reconcile: diagnostic completed",
      );

      res.json(report);
    } catch (error) {
      logger.error(
        {
          targetUserId: userId,
          adminUserId: req.session?.userId,
          err: error instanceof Error ? error.message : String(error),
        },
        "commercial-reconcile: diagnostic failed",
      );
      res.status(500).json({ error: "Reconciliation failed" });
    }
  },
);

export default router;
