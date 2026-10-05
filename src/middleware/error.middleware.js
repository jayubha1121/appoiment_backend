import { AppError } from "../utils/app-error.js";
import { logger } from "../utils/logger.js";
import { sendError } from "../utils/response.js";

export function errorMiddleware(error, _req, res, _next) {
  if (error instanceof AppError) {
    return sendError(res, error.message, error.statusCode, error.details);
  }

  if (error instanceof Error) {
    if (error.name === "MongoServerError" && (error).code === 11000) {
      const key = Object.keys((error).keyPattern ?? {})[0] ?? "field";
      return sendError(res, `Duplicate ${key} — this ${key} is already taken`, 409);
    }
    logger.error(error.message, error.stack);
    return sendError(res, "Internal server error", 500);
  }

  return sendError(res, "Internal server error", 500);
}
