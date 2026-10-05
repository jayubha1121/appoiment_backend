import mongoose from "mongoose";
import { logger } from "../utils/logger.js";

let isDbConnected = false;

function ensureRetryWritesDisabled(uri) {
  const raw = String(uri ?? "").trim();
  if (!raw) return raw;

  // If URI already contains retryWrites, force it to false.
  if (/retrywrites\s*=/i.test(raw)) {
    return raw.replace(/([?&])retrywrites=[^&]*/gi, "$1retryWrites=false");
  }

  // Works for both mongodb:// and mongodb+srv:// connection strings.
  return raw.includes("?") ? `${raw}&retryWrites=false` : `${raw}?retryWrites=false`;
}

export async function connectDb(uri = process.env.MONGODB_URI) {
  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  mongoose.set("strictQuery", true);
  const safeUri = ensureRetryWritesDisabled(uri);
  await mongoose.connect(safeUri, {
    // Some managed/shared Mongo deployments don't support retryable writes.
    // Force-disable at the driver option level too.
    retryWrites: false,
  });
  isDbConnected = true;
  logger.info("MongoDB connected");
}

export async function disconnectDb() {
  await mongoose.disconnect();
  isDbConnected = false;
}

export function getDbStatus() {
  return {
    isConnected: isDbConnected && mongoose.connection.readyState === 1,
    readyState: mongoose.connection.readyState,
  };
}

export async function connectDbWithRetry({
  uri,
  retryDelayMs = 5000,
  onRetry,
} = {}) {
  const resolvedUri = uri ?? process.env.MONGODB_URI;

  while (true) {
    try {
      await connectDb(resolvedUri);
      return true;
    } catch (error) {
      isDbConnected = false;

      if (typeof onRetry === "function") {
        onRetry(error);
      } else {
        logger.error(
          "MongoDB connection failed. Retrying...",
          error instanceof Error ? error.name : "UnknownError",
        );
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}
