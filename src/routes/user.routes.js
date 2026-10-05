import { Router } from "express";
import { validateRequest } from "../middleware/validate.middleware.js";
import { requirePermission } from "../middleware/auth.middleware.js";
import { userController } from "../controllers/user.controller.js";
import {
  createUserValidator,
  resetUserPasswordValidator,
  updateUserValidator,
  userIdParamValidator,
} from "../validators/user.validator.js";
import { PERMISSIONS } from "../utils/permissions.js";

export const adminUserRouter = Router();

adminUserRouter.get("/", requirePermission(PERMISSIONS.USERS_VIEW), (req, res) =>
  userController.listUsers(req, res),
);

adminUserRouter.post(
  "/",
  requirePermission(PERMISSIONS.USERS_CREATE),
  createUserValidator,
  validateRequest,
  (req, res) => userController.createUser(req, res),
);

adminUserRouter.put(
  "/:userId",
  requirePermission(PERMISSIONS.USERS_UPDATE),
  userIdParamValidator,
  updateUserValidator,
  validateRequest,
  (req, res) => userController.updateUser(req, res),
);

adminUserRouter.put(
  "/:userId/password",
  requirePermission(PERMISSIONS.USERS_UPDATE),
  userIdParamValidator,
  resetUserPasswordValidator,
  validateRequest,
  (req, res) => userController.resetUserPassword(req, res),
);

adminUserRouter.delete(
  "/:userId",
  requirePermission(PERMISSIONS.USERS_DELETE),
  userIdParamValidator,
  validateRequest,
  (req, res) => userController.deleteUser(req, res),
);