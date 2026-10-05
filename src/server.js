// FILE: src/server.js
// LOCATION: Backend root folder
// ============================================

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";  // ✅ CRITICAL: Import crypto first!

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure `.env` is loaded from the backend folder
dotenv.config({
  path: path.resolve(__dirname, "..", ".env"),
  override: process.env.NODE_ENV !== "test",
});

// ✅ NOW import railway-log-checker after crypto is available
import railwayLogRouter from "../railway-log-checker/router.js";
import "../railway-log-checker/logCapture.js";

import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { connectDbWithRetry, getDbStatus } from "./config/db.js";
import { requireDatabaseConnection } from "./middleware/db.middleware.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { publicApiRateLimit } from "./middleware/rateLimit.middleware.js";
import { apiRouter, authRouter } from "./routes/index.js";
import { sendSuccess } from "./utils/response.js";
import { logger } from "./utils/logger.js";
import { scheduleAllCronJobs } from "./main/cron/index.js";

export function createApp() {
  const app = express();
  
  // Environment configuration
  const frontendUrl = process.env.FRONTEND_URL;
  
  if (!frontendUrl && process.env.NODE_ENV === "production") {
    logger.warn(
      "⚠️  FRONTEND_URL is not set in production. CORS will allow all origins. " +
      "This is a security risk! Set FRONTEND_URL in Railway Variables."
    );
  }

  // Always trust the first proxy hop (Railway sets X-Forwarded-For)
  app.set("trust proxy", 1);
  app.use("/railway-log-checker", railwayLogRouter);

  // Security & Compression
  app.use(helmet());
  app.use(compression());
  
  // CORS configuration
  const corsOptions = {
    origin: frontendUrl || "*",
    credentials: !!frontendUrl,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  };
  
  app.use(cors(corsOptions));
  app.use(express.json({ limit: "10kb" }));
  app.use(morgan("combined"));

  // Health check endpoint
  app.get("/health", (_req, res) =>
    sendSuccess(res, {
      status: "ok",
      database: getDbStatus(),
    }),
  );

  // API routes
  app.use(
    "/api/auth",
    publicApiRateLimit,
    requireDatabaseConnection,
    authRouter,
  );
  app.use("/api", publicApiRateLimit, requireDatabaseConnection, apiRouter);
  
  // Error handling
  app.use(errorMiddleware);

  return app;
}

const isTest = process.env.NODE_ENV === "test";

async function bootstrap() {
  const app = createApp();
  const port = Number(process.env.PORT ?? 8080);

  app.listen(port, () => {
    logger.info(`✅ Server running on port ${port}`);
    logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
    logger.info(`Frontend URL: ${process.env.FRONTEND_URL || "NOT SET (using wildcard)"}`);
    logger.info(`Database: ${process.env.MONGODB_URI ? "✅ Configured" : "❌ NOT SET"}`);
  });

  // Connect to database with retry
  await connectDbWithRetry({
    onRetry: (error) => {
      logger.error(
        "MongoDB unavailable. The server is running, but database-backed API routes will return 503 until the database connects.",
        error instanceof Error ? error.name : "UnknownError",
      );
    },
  });

  // Schedule cron jobs
  scheduleAllCronJobs();
}

if (!isTest) {
  bootstrap().catch((error) => {
    console.error("❌ Failed to bootstrap server", error);
    process.exit(1);
  });
}