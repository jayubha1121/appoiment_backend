import { randomInt } from "node:crypto";
import { Admin } from "../models/admin.model.js";
import { signAdminToken } from "../utils/auth.js";
import { AppError } from "../utils/app-error.js";
import { getGmailAuthFromEnv, getMailTransport } from "../utils/mailerTransport.js";
import {
  buildAuthUserPayload,
  normalizeUserPermissions,
} from "../utils/permissions.js";

export class AuthService {
  // =========================
  // OTP STORE (in-memory with 5-minute expiry)
  // =========================

  otpStore = new Map(); // email → { otp, expiresAt }

  #getOtp(email) {
    const entry = this.otpStore.get(email);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.otpStore.delete(email);
      return null;
    }
    return entry.otp;
  }

  #setOtp(email, otp) {
    this.otpStore.set(email, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
  }

  // =========================
  // REGISTER — only succeeds when zero admins exist (bootstrap).
  // =========================

  async register(email, password, name = "Administrator") {
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const normalizedPassword = String(password ?? "").trim();
    const normalizedName = String(name ?? "").trim() || "Administrator";

    if (!normalizedEmail || !normalizedPassword) {
      throw new AppError("Email and password are required", 400);
    }

    if (normalizedPassword.length < 6) {
      throw new AppError("Password must be at least 6 characters", 400);
    }

    const admin = await Admin.create({
      name: normalizedName,
      email: normalizedEmail,
      password: normalizedPassword,
      role: "super_admin",
      permissions: normalizeUserPermissions("super_admin"),
      isActive: true,
    });

    return {
      message: "Admin registered successfully",
      user: buildAuthUserPayload(admin),
    };
  }

  // =========================
  // LOGIN
  // =========================

  async login(email, password) {
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const normalizedPassword = String(password ?? "").trim();

    const admin = await Admin.findOne({ email: normalizedEmail });

    if (!admin) {
      throw new AppError("Invalid credentials", 401);
    }

    const isMatch = await admin.comparePassword(normalizedPassword);

    if (!isMatch) {
      throw new AppError("Invalid credentials", 401);
    }

    if (!admin.isActive) {
      throw new AppError("This account is inactive", 403);
    }

    const user = buildAuthUserPayload(admin);

    return {
      token: signAdminToken(user),
      user,
    };
  }

  async me(authUser) {
    const user = await Admin.findById(authUser?.id);

    if (!user || !user.isActive) {
      throw new AppError("Unauthorized", 401);
    }

    return { user: buildAuthUserPayload(user) };
  }

  async changePassword(authUser, currentPassword, newPassword) {
    const normalizedCurrent = String(currentPassword ?? "").trim();
    const normalizedNext = String(newPassword ?? "").trim();

    if (normalizedNext.length < 6) {
      throw new AppError("Password must be at least 6 characters", 400);
    }

    const user = await Admin.findById(authUser?.id);
    if (!user || !user.isActive) {
      throw new AppError("Unauthorized", 401);
    }

    const isMatch = await user.comparePassword(normalizedCurrent);
    if (!isMatch) {
      throw new AppError("Current password is incorrect", 400);
    }

    user.password = normalizedNext;
    await user.save();

    return { message: "Password updated successfully" };
  }

  // =========================
  // FORGOT PASSWORD
  // =========================

  async forgotPassword(email) {
    const normalizedEmail = String(email ?? "").trim().toLowerCase();

    const admin = await Admin.findOne({ email: normalizedEmail });

    if (!admin) {
      throw new AppError("Email not found", 404);
    }

    const otp = randomInt(100000, 1000000).toString();

    this.#setOtp(normalizedEmail, otp);

    const transport = getMailTransport();
    const { user } = getGmailAuthFromEnv();

    if (!transport || !user) {
      throw new AppError(
        "Outbound email is not configured. Set EMAIL_USER and EMAIL_PASS (Gmail App Password), then restart the server.",
        503,
      );
    }

    await transport.sendMail({
      from: user,
      to: normalizedEmail,
      subject: "Password Reset OTP",
      html: `
        <h2>Password Reset</h2>
        <p>Your OTP Code:</p>
        <h1>${otp}</h1>
        <p>This OTP is valid for 5 minutes.</p>
      `,
    });

    return { message: "OTP sent successfully" };
  }

  // =========================
  // VERIFY OTP
  // =========================

  async verifyOtp(email, otp) {
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const savedOtp = this.#getOtp(normalizedEmail);

    if (!savedOtp) throw new AppError("OTP not found or has expired", 404);
    if (savedOtp !== otp) throw new AppError("Invalid OTP", 400);

    return { success: true, message: "OTP verified" };
  }

  // =========================
  // RESET PASSWORD
  // =========================

  async resetPassword(email, otp, password) {
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const savedOtp = this.#getOtp(normalizedEmail);

    if (!savedOtp) throw new AppError("OTP not found or has expired", 404);
    if (savedOtp !== otp) throw new AppError("Invalid OTP", 400);

    const admin = await Admin.findOne({ email: normalizedEmail });
    if (!admin) throw new AppError("User not found", 404);

    admin.password = String(password).trim();
    await admin.save();

    this.otpStore.delete(normalizedEmail);

    return { message: "Password reset successful" };
  }
}

export const authService = new AuthService();
