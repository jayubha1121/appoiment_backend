import { getDbStatus } from "../config/db.js";
import { sendError } from "../utils/response.js";

export function requireDatabaseConnection(_req, res, next) {
  const db = getDbStatus();

  if (!db.isConnected) {
    return sendError(
      res,
      "Database is not connected yet. Start MongoDB or update MONGODB_URI, then retry.",
      503,
      db,
    );
  }

  next();
}