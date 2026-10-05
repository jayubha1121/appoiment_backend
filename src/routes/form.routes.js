import { Router } from "express";
import { formController } from "../controllers/form.controller.js";
import {
  createFormValidator,
  formIdParamValidator,
  updateFormValidator,
} from "../validators/booking.validator.js";
import { validateRequest } from "../middleware/validate.middleware.js";
import { requirePermission } from "../middleware/auth.middleware.js";
import { PERMISSIONS } from "../utils/permissions.js";

export const publicFormRouter = Router();
export const adminFormRouter = Router();

// =========================
// PUBLIC
// =========================

publicFormRouter.get(
  "/:formId",
  formIdParamValidator,
  validateRequest,
  (req, res) => formController.getPublicForm(req, res),
);

// =========================
// ADMIN
// =========================

adminFormRouter.get("/", requirePermission(PERMISSIONS.FORMS_VIEW), (req, res) => formController.getAllForms(req, res));

adminFormRouter.post(
  "/",
  requirePermission(PERMISSIONS.FORMS_CREATE),
  createFormValidator,
  validateRequest,
  (req, res) => formController.createForm(req, res),
);

adminFormRouter.put(
  "/:formId",
  requirePermission(PERMISSIONS.FORMS_UPDATE),
  updateFormValidator,
  validateRequest,
  (req, res) => formController.updateForm(req, res),
);

adminFormRouter.delete(
  "/:formId",
  requirePermission(PERMISSIONS.FORMS_DELETE),
  formIdParamValidator,
  validateRequest,
  (req, res) => formController.deleteForm(req, res),
);
