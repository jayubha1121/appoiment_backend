import { authService } from "../services/auth.service.js";
import { sendSuccess } from "../utils/response.js";

export class AuthController {
  // =========================
  // REGISTER
  // =========================

  async register(req, res) {
    const data = await authService.register(req.body.email, req.body.password, req.body.name);
    return sendSuccess(res, data, 201);
  }

  // =========================
  // LOGIN
  // =========================

  async login(req, res) {
    const data = await authService.login(req.body.email, req.body.password);
    return sendSuccess(res, data);
  }

  async me(req, res) {
    const data = await authService.me(req.admin);
    return sendSuccess(res, data);
  }

  async changePassword(req, res) {
    const data = await authService.changePassword(
      req.admin,
      req.body.currentPassword,
      req.body.newPassword,
    );
    return sendSuccess(res, data);
  }

  // =========================
  // FORGOT PASSWORD
  // =========================

  async forgotPassword(req, res) {
    const data = await authService.forgotPassword(req.body.email);
    return sendSuccess(res, data);
  }

  // =========================
  // VERIFY OTP
  // =========================

  async verifyOtp(req, res) {
    const data = await authService.verifyOtp(req.body.email, req.body.otp);
    return sendSuccess(res, data);
  }

  // =========================
  // RESET PASSWORD
  // =========================

  async resetPassword(req, res) {
    const data = await authService.resetPassword(
      req.body.email,
      req.body.otp,
      req.body.password,
    );
    return sendSuccess(res, data);
  }
}

export const authController = new AuthController();
