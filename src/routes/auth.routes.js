import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";
import { validateRequest } from "../middleware/validate.middleware.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  verifyOtpValidator,
  resetPasswordValidator,
  changePasswordValidator,
} from "../validators/auth.validator.js";

export const authRouter = Router();

// =========================
// REGISTER
// Only works when no admin accounts exist yet (first-time bootstrap).
// =========================

authRouter.post(
  "/register",
  registerValidator,
  validateRequest,
  (req, res) => authController.register(req, res),
);

// =========================
// LOGIN
// =========================

authRouter.post(
  "/login",
  loginValidator,
  validateRequest,
  (req, res) => authController.login(req, res),
);

authRouter.get("/me", requireAuth, (req, res) => authController.me(req, res));

authRouter.put(
  "/change-password",
  requireAuth,
  changePasswordValidator,
  validateRequest,
  (req, res) => authController.changePassword(req, res),
);

// =========================
// FORGOT PASSWORD
// =========================

authRouter.post(
  "/forgot-password",
  forgotPasswordValidator,
  validateRequest,
  (req, res) => authController.forgotPassword(req, res),
);

authRouter.post(
  "/verify-otp",
  verifyOtpValidator,
  validateRequest,
  (req, res) => authController.verifyOtp(req, res),
);

authRouter.post(
  "/reset-password",
  resetPasswordValidator,
  validateRequest,
  (req, res) => authController.resetPassword(req, res),
);
