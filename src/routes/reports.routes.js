import { Router } from "express";
import {
  previewBookingDigest,
  previewExpirySummary,
  runBookingDigestManual,
  runExpirySummaryManual,
  sendFormDigestManual,
  smtpHealth,
} from "../controllers/reports.controller.js";
import { formIdParamValidator } from "../validators/booking.validator.js";
import { validateRequest } from "../middleware/validate.middleware.js";
import { requirePermission } from "../middleware/auth.middleware.js";
import { PERMISSIONS } from "../utils/permissions.js";

export const adminReportsRouter = Router();

adminReportsRouter.get("/smtp-health", requirePermission(PERMISSIONS.REPORTS_VIEW), (req, res, next) =>
  void smtpHealth(req, res, next),
);

adminReportsRouter.get("/expiry-summary/preview", requirePermission(PERMISSIONS.REPORTS_VIEW), (req, res, next) =>
  void previewExpirySummary(req, res, next),
);

adminReportsRouter.post("/expiry-summary/run", requirePermission(PERMISSIONS.REPORTS_RUN), (req, res, next) =>
  void runExpirySummaryManual(req, res, next),
);

adminReportsRouter.get("/booking-digest/preview", requirePermission(PERMISSIONS.REPORTS_VIEW), (req, res, next) =>
  void previewBookingDigest(req, res, next),
);

adminReportsRouter.post("/booking-digest/run", requirePermission(PERMISSIONS.REPORTS_RUN), (req, res, next) =>
  void runBookingDigestManual(req, res, next),
);

adminReportsRouter.post(
  "/booking-digest/form/:formId",
  requirePermission(PERMISSIONS.REPORTS_RUN),
  formIdParamValidator,
  validateRequest,
  (req, res, next) => void sendFormDigestManual(req, res, next),
);

