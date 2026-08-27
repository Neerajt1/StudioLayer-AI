import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import rendersRouter from "./renders";
import supportRouter from "./support";
import identitiesRouter from "./identities";
import accountStatementRouter from "./account-statement";
import adminCommercialRouter from "./admin-commercial";
import adminRouter from "./admin";
import testOpenRouterRouter from "./test-openrouter";
import testNanoBananaProRouter from "./test-nano-banana-pro";
import testFlashImagesApiPackagingRouter from "./test-flash-images-api-packaging";
import testNanoProTalentOnlyIdentityRouter from "./test-nano-pro-talent-only-identity";
import testNanoProTalentOnlyIndexAlignedRouter from "./test-nano-pro-talent-only-index-aligned";
import testNanoProStandaloneTrialRouter from "./test-nano-pro-standalone-trial";
import testNanoProIdentityFirstTrialRouter from "./test-nano-pro-identity-first-trial";
import paymentsRouter from "./payments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(rendersRouter);
router.use(accountStatementRouter);
router.use(adminCommercialRouter);
router.use(adminRouter);
router.use(supportRouter);
router.use(identitiesRouter);
router.use(paymentsRouter);
// Internal test route — OpenRouter rendering validation (spec §11)
router.use(testOpenRouterRouter);
// EXPERIMENTAL ONLY — Nano Banana Pro via OpenRouter Image API (gated; no credits)
router.use(testNanoBananaProRouter);
// EXPERIMENTAL ONLY — Flash model via Images API packaging A/B (gated; no credits)
router.use(testFlashImagesApiPackagingRouter);
// EXPERIMENTAL ONLY — Nano Pro Talent-only identity isolation (gated; no credits)
router.use(testNanoProTalentOnlyIdentityRouter);
// EXPERIMENTAL ONLY — Nano Pro Talent-only index-aligned (gated; no credits)
router.use(testNanoProTalentOnlyIndexAlignedRouter);
// EXPERIMENTAL ONLY — Nano Pro Standalone Trial (gated; face-neutral poses; no credits/Gallery)
router.use(testNanoProStandaloneTrialRouter);
// EXPERIMENTAL ONLY — Nano Pro Identity-First / Pose-Second Trial (gated; no credits/Gallery)
router.use(testNanoProIdentityFirstTrialRouter);

export default router;
