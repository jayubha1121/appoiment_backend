import { Router } from "express";
import { analyticsController } from "../controllers/analytics.controller.js";
import { validateRequest } from "../middleware/validate.middleware.js";
import { visitsQueryValidator } from "../validators/booking.validator.js";
import { requirePermission } from "../middleware/auth.middleware.js";
import { PERMISSIONS } from "../utils/permissions.js";

export const analyticsRouter = Router();

analyticsRouter.get("/overview", requirePermission(PERMISSIONS.DASHBOARD_VIEW), (req, res) => analyticsController.getOverview(req, res));
analyticsRouter.get("/visits", requirePermission(PERMISSIONS.DASHBOARD_VIEW), visitsQueryValidator, validateRequest, (req, res) =>
  analyticsController.getVisits(req, res),
);
analyticsRouter.get("/bookings-by-slot", requirePermission(PERMISSIONS.DASHBOARD_VIEW), (req, res) =>
  analyticsController.getBookingsBySlot(req, res),
);
