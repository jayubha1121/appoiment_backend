import { AppError } from "../utils/app-error.js";
import { verifyAdminToken } from "../utils/auth.js";
import { hasPermission } from "../utils/permissions.js";

export function requireAuth(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError("Unauthorized", 401);
  }

  const token = authHeader.replace("Bearer ", "");
  req.admin = verifyAdminToken(token);
  next();
}

export const requireAdmin = requireAuth;

export function requirePermission(permission) {
  return (req, _res, next) => {
    if (!req.admin) {
      throw new AppError("Unauthorized", 401);
    }

    if (!hasPermission(req.admin, permission)) {
      throw new AppError("Forbidden", 403);
    }

    next();
  };
}