import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import healthRouter from "./health";
import authRouter from "./auth";
import twoFactorRouter from "./twoFactor";
import adminRouter from "./admin";
import leadsRouter from "./leads";
import contactsRouter from "./contacts";
import activitiesRouter from "./activities";
import templatesRouter from "./templates";
import sequencesRouter from "./sequences";
import broadcastsRouter from "./broadcasts";
import triggersRouter from "./triggers";
import settingsRouter from "./settings";
import dashboardRouter from "./dashboard";
import emailRouter from "./email";
import calendarRouter from "./calendar";
import auditRouter from "./audit";
import storageRouter from "./storage";
import filesRouter from "./files";
import aiRouter from "./ai";
import gmailWebhookRouter from "./gmailWebhook";
import horizonWebhookRouter from "./horizonWebhook";
import horizonSyncRouter from "./horizonSync";
import diagnosticsRouter from "./diagnostics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(gmailWebhookRouter);
router.use(horizonWebhookRouter);

router.use(requireAuth);

router.use(twoFactorRouter);
router.use(adminRouter);
router.use(leadsRouter);
router.use(contactsRouter);
router.use(activitiesRouter);
router.use(templatesRouter);
router.use(sequencesRouter);
router.use(broadcastsRouter);
router.use(triggersRouter);
router.use(settingsRouter);
router.use(dashboardRouter);
router.use(emailRouter);
router.use(calendarRouter);
router.use(auditRouter);
router.use(storageRouter);
router.use(filesRouter);
router.use(aiRouter);
router.use(horizonSyncRouter);
router.use(diagnosticsRouter);

export default router;
