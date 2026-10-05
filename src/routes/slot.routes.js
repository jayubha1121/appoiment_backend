import { Router } from "express";
import { body, param } from "express-validator";
import { slotController } from "../controllers/slot.controller.js";
import {
  formIdParamValidator,
  slotDateQueryValidator,
} from "../validators/slot.validator.js";
import { validateRequest } from "../middleware/validate.middleware.js";
import { requirePermission } from "../middleware/auth.middleware.js";
import { PERMISSIONS } from "../utils/permissions.js";

export const publicSlotRouter = Router();
export const adminSlotRouter = Router();

publicSlotRouter.get(
  "/:formId/slots",
  formIdParamValidator,
  slotDateQueryValidator,
  validateRequest,
  (req, res) => slotController.getAvailableSlots(req, res),
);

adminSlotRouter.get(
  "/form/:formId",
  requirePermission(PERMISSIONS.FORMS_VIEW),
  formIdParamValidator,
  validateRequest,
  (req, res) => slotController.getFormSlots(req, res),
);

adminSlotRouter.patch(
  "/:slotId/status",
  requirePermission(PERMISSIONS.FORMS_UPDATE),
  [param("slotId").isMongoId(), body("isActive").isBoolean()],
  validateRequest,
  (req, res) => slotController.setSlotActive(req, res),
);
