import { Router } from "express";
import { integrationController } from "../controllers/integration.controller.js";
import { validateRequest } from "../middleware/validate.middleware.js";
import { body, param } from "express-validator";
import { requirePermission } from "../middleware/auth.middleware.js";
import { PERMISSIONS } from "../utils/permissions.js";

export const adminIntegrationRouter = Router();
export const publicIntegrationRouter = Router();

adminIntegrationRouter.get("/google", requirePermission(PERMISSIONS.INTEGRATIONS_VIEW), (req, res) =>
  integrationController.listGoogleIntegrations(req, res),
);

adminIntegrationRouter.post("/google/auth-url", requirePermission(PERMISSIONS.INTEGRATIONS_MANAGE), (req, res) =>
  integrationController.createGoogleAuthUrl(req, res),
);

adminIntegrationRouter.get(
  "/google/:id/calendars",
  requirePermission(PERMISSIONS.INTEGRATIONS_VIEW),
  [param("id").isMongoId()],
  validateRequest,
  (req, res) => integrationController.listGoogleCalendars(req, res),
);

adminIntegrationRouter.put(
  "/google/:id",
  requirePermission(PERMISSIONS.INTEGRATIONS_MANAGE),
  [param("id").isMongoId(), body("calendarId").isString().trim().notEmpty()],
  validateRequest,
  (req, res) => integrationController.updateGoogleCalendar(req, res),
);

adminIntegrationRouter.post(
  "/google/:id/disconnect",
  requirePermission(PERMISSIONS.INTEGRATIONS_MANAGE),
  [param("id").isMongoId()],
  validateRequest,
  (req, res) => integrationController.disconnectGoogle(req, res),
);

adminIntegrationRouter.get("/cron-recipients", requirePermission(PERMISSIONS.INTEGRATIONS_VIEW), (req, res) =>
  integrationController.getCronRecipients(req, res),
);

adminIntegrationRouter.put(
  "/cron-recipients",
  requirePermission(PERMISSIONS.INTEGRATIONS_MANAGE),
  [
    body("emails").isArray({ max: 40 }).withMessage("emails must be an array"),
    body("emails.*").trim().isEmail().normalizeEmail(),
  ],
  validateRequest,
  (req, res) => integrationController.putCronRecipients(req, res),
);

publicIntegrationRouter.get("/google/callback", (req, res) =>
  integrationController.googleCallback(req, res),
);

