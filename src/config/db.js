// FILE: src/config/db.js
// LOCATION: src/config/
// ============================================

import mongoose from "mongoose";
import { logger } from "../utils/logger.js";

const CONNECTION_OPTIONS = {
  serverSelectionTimeoutMS: 10_000,
  connectTimeoutMS: 10_000,
};

let activeUri;
let connectionPromise;

function decodeURIComponentSafely(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getSafeErrorDetails(error, uri = activeUri ?? process.env.MONGODB_URI) {
  let message = error instanceof Error ? error.message : String(error);

  if (uri) {
    message = message.replaceAll(uri, "[REDACTED_MONGODB_URI]");
    const authority = uri.match(/^mongodb(?:\+srv)?:\/\/([^/?#]*)/i)?.[1];
    const credentialsEnd = authority?.lastIndexOf("@") ?? -1;

    if (authority && credentialsEnd >= 0) {
      const credentials = authority.slice(0, credentialsEnd);
      const [username, password] = credentials.split(":", 2);

      for (const value of [
        credentials,
        decodeURIComponentSafely(credentials),
        username,
        decodeURIComponentSafely(username),
        password,
        decodeURIComponentSafely(password ?? ""),
      ]) {
        if (value) message = message.replaceAll(value, "[REDACTED]");
      }
    }
  }

  message = message.replace(
    /mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi,
    "[REDACTED_MONGODB_URI]",
  );
  message = message.replace(
    /((?:password|passwd|pwd|token|access_token|secret)=)[^&\s]+/gi,
    "$1[REDACTED]",
  );

  return {
    name: error?.name ?? "UnknownError",
    message,
    code: error?.code,
    codeName: error?.codeName,
    readyState: mongoose.connection.readyState,
  };
}

function logConnectionError(message, error, uri) {
  logger.error(message, getSafeErrorDetails(error, uri));
}

function validateMongoUri(uri) {
  if (typeof uri !== "string" || uri.trim() === "") {
    throw new Error("MONGODB_URI environment variable is missing");
  }
  if (uri.trim() !== uri || !/^mongodb(?:\+srv)?:\/\//i.test(uri)) {
    throw new Error(
      "MONGODB_URI must be a valid mongodb:// or mongodb+srv:// connection string",
    );
  }
}

mongoose.connection.on("connected", () => {
  logger.info("MongoDB connected successfully");
});

mongoose.connection.on("error", (error) => {
  logConnectionError("MongoDB connection error", error);
});

mongoose.connection.on("disconnected", () => {
  logger.warn("MongoDB disconnected", {
    readyState: mongoose.connection.readyState,
  });
});

export async function connectDb(uri = process.env.MONGODB_URI) {
  validateMongoUri(uri);

  if (mongoose.connection.readyState === 1) return true;
  if (connectionPromise) return connectionPromise;
  if (mongoose.connection.readyState === 2) {
    await mongoose.connection.asPromise();
    return true;
  }

  activeUri = uri;
  mongoose.set("strictQuery", true);
  connectionPromise = mongoose
    .connect(uri, CONNECTION_OPTIONS)
    .then(() => true)
    .finally(() => {
      connectionPromise = undefined;
    });

  return connectionPromise;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

export function getDbStatus() {
  const readyState = mongoose.connection.readyState;
  return {
    isConnected: readyState === 1,
    readyState,
  };
}

export async function connectDbWithRetry({
  uri,
  retryDelayMs = 5000,
  onRetry,
} = {}) {
  const resolvedUri = uri ?? process.env.MONGODB_URI;

  try {
    validateMongoUri(resolvedUri);
  } catch (error) {
    logConnectionError("Invalid MongoDB configuration", error, resolvedUri);
    return false;
  }

  let retryDelay = retryDelayMs;
  while (true) {
    try {
      await connectDb(resolvedUri);
      return true;
    } catch (error) {
      if (typeof onRetry === "function") {
        onRetry(error);
      } else {
        logConnectionError("MongoDB connection failed", error, resolvedUri);
      }

      if (
        error?.name === "ReferenceError" ||
        error?.name === "TypeError" ||
        error?.name === "MongoParseError"
      ) {
        return false;
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      retryDelay = Math.min(retryDelay * 2, 30_000);
    }
  }
}