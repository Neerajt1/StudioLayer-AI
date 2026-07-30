import { Router, type IRouter } from "express";
import { IDENTITIES } from "../data/identity-library";

const router: IRouter = Router();

/**
 * GET /identities
 * Returns the full Identity Library catalogue.
 * Requires an active session — identities are studio-only content.
 */
router.get("/identities", (req, res): void => {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json(IDENTITIES);
});

export default router;
