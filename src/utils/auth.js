import jwt from "jsonwebtoken";
import { AppError } from "./app-error.js";

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new AppError("JWT secret is not configured.", 500);
  }

  return secret;
}

export function signAdminToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

export function verifyAdminToken(token) {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    throw new AppError("Invalid or expired token. Please log in again.", 401);
  }
}
