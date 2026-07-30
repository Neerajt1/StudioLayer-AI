import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import rendersRouter from "./renders";
import supportRouter from "./support";
import identitiesRouter from "./identities";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(rendersRouter);
router.use(supportRouter);
router.use(identitiesRouter);

export default router;
