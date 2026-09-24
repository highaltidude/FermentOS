import { Router, type IRouter } from "express";
import healthRouter from "./health";
import recipesRouter from "./recipes";
import brewSessionsRouter from "./brew_sessions";
import inventoryRouter from "./inventory";
import dashboardRouter from "./dashboard";
import equipmentRouter from "./equipment";
import adminRouter from "./admin";
import authRouter from "./auth";
import settingsRouter from "./settings";
import systemRouter from "./system";
import backupRouter from "./backup";
import haRouter from "./ha";
import sensorsRouter from "./sensors";
import integrationsRouter from "./integrations";
import { apiAuth } from "../middlewares/apiAuth";

const router: IRouter = Router();

// Auth gate runs first. It exempts a fixed list of health, recovery, Home
// Assistant and iSpindel endpoints (middlewares/authExemptions.ts). The
// /admin/auth/* routes are not exempt; the web UI reaches them through the
// same-origin check, so the user can always recover from a lockdown.
router.use(apiAuth);

router.use(healthRouter);
router.use("/admin/auth", authRouter);
router.use(dashboardRouter);
router.use(recipesRouter);
router.use(brewSessionsRouter);
router.use(inventoryRouter);
router.use("/equipment", equipmentRouter);
router.use("/admin", adminRouter);
router.use(settingsRouter);
router.use(systemRouter);
router.use(backupRouter);
router.use("/ha", haRouter);
router.use(sensorsRouter);
router.use("/integrations", integrationsRouter);

export default router;
