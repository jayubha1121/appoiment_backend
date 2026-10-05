import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import railwayLogRouter from "../railway-log-checker/router.js";
import "../railway-log-checker/logCapture.js";

// Ensure `.env` is loaded from the backend folder even if the process is started elsewhere.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// In tests, Jest sets process.env first; don't override it with `.env`.
dotenv.config({
  path: path.resolve(__dirname, "..", ".env"),
  override: process.env.NODE_ENV !== "test",
});

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
  
  // ✅ FIX 1: Proper FRONTEND_URL handling
  const frontendUrl = process.env.FRONTEND_URL;
  
  if (!frontendUrl) {
    logger.warn(
      "⚠️  FRONTEND_URL is not set. CORS will allow all origins. " +
      "This is fine for development but NOT SAFE for production!"
    );
  }

  // Always trust the first proxy hop.
  // Railway (and all cloud platforms) route traffic through a reverse proxy
  // that sets X-Forwarded-For. Without this, express-rate-limit throws
  // ERR_ERL_UNEXPECTED_X_FORWARDED_FOR and bookings return 500.
  app.set("trust proxy", 1);
  app.use("/railway-log-checker", railwayLogRouter);

  app.use(helmet());
  app.use(compression());
  
  // ✅ FIX 2: CORS configuration with fallback
  const corsOptions = {
    origin: frontendUrl || "*",  // Allow all if not configured, but prefer specific domain
    credentials: frontendUrl ? true : false,  // Only enable credentials if origin is specific
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  };
  
  if (frontendUrl) {
    logger.info(`CORS enabled for: ${frontendUrl}`);
  }
  
  app.use(cors(corsOptions));
  app.use(express.json({ limit: "10kb" }));
  app.use(morgan("combined"));

  app.get("/health", (_req, res) =>
    sendSuccess(res, {
      status: "ok",
      database: getDbStatus(),
    }),
  );

  app.use(
    "/api/auth",
    publicApiRateLimit,
    requireDatabaseConnection,
    authRouter,
  );
  app.use("/api", publicApiRateLimit, requireDatabaseConnection, apiRouter);
  app.use(errorMiddleware);

  return app;
}

const isTest = process.env.NODE_ENV === "test";

async function bootstrap() {
  const app = createApp();
  const port = Number(process.env.PORT ?? 8080);

  app.listen(port, () => {
    logger.info(`✅ Server running on port ${port}`);
    
    // ✅ FIX 3: Log environment configuration status
    logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
    logger.info(`Frontend URL: ${process.env.FRONTEND_URL || "NOT SET (using wildcard)"}`);
    logger.info(`MongoDB URI: ${process.env.MONGODB_URI ? "✅ Configured" : "❌ NOT SET"}`);
    logger.info(`Log Access Token: ${process.env.LOG_ACCESS_TOKEN ? "✅ Configured" : "❌ NOT SET"}`);
  });

  // ✅ FIX 4: Better error handling for DB connection
  await connectDbWithRetry({
    onRetry: (error) => {
      logger.error(
        "MongoDB unavailable. The server is running, but database-backed API routes will return 503 until the database connects.",
        error instanceof Error ? error.name : "UnknownError",
      );
    },
  });

  scheduleAllCronJobs();
}

if (!isTest) {
  bootstrap().catch((error) => {
    console.error("❌ Failed to bootstrap server", error);
    process.exit(1);
  });
}