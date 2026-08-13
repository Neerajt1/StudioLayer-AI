import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import rendersRouter from "./renders";
import supportRouter from "./support";
import identitiesRouter from "./identities";
import accountStatementRouter from "./account-statement";
import adminCommercialRouter from "./admin-commercial";
import testOpenRouterRouter from "./test-openrouter";
import paymentsRouter from "./payments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(rendersRouter);
router.use(accountStatementRouter);
router.use(adminCommercialRouter);
router.use(supportRouter);
router.use(identitiesRouter);
router.use(paymentsRouter);
// Internal test route — OpenRouter rendering validation (spec §11)
router.use(testOpenRouterRouter);

export default router;
