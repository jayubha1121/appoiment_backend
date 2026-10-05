import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import railwayLogRouter from "../railway-log-checker/router.js";
import "../railway-log-checker/logCapture.js";

// Ensure `.env` is loaded from the backend folder even if the process is started elsewhere.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Deployment-provided variables take precedence over local `.env` values.
dotenv.config({
  path: path.resolve(__dirname, "..", ".env"),
  override: false,
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
  const frontendUrl = process.env.FRONTEND_URL

  // Always trust the first proxy hop.
  // Railway (and all cloud platforms) route traffic through a reverse proxy
  // that sets X-Forwarded-For. Without this, express-rate-limit throws
  // ERR_ERL_UNEXPECTED_X_FORWARDED_FOR and bookings return 500.
  app.set("trust proxy", 1);
  app.use("/railway-log-checker", railwayLogRouter);

  app.use(helmet());
  app.use(compression());
  app.use(cors({ origin: frontendUrl }));
  app.use(express.json({ limit: "10kb" }));
  app.use(morgan("combined"));

  const healthHandler = (_req, res) =>
    sendSuccess(res, {
      status: "ok",
      database: getDbStatus(),
    });
  app.get("/health", healthHandler);
  app.get("/api/health", healthHandler);

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
    logger.info(`Server running on port ${port}`);
  });
  void connectDbWithRetry()
    .then((connected) => {
      if (connected) scheduleAllCronJobs();
    })
    .catch((error) => {
      logger.error(
        "MongoDB connection supervisor stopped unexpectedly",
        error?.name ?? "UnknownError",
      );
    });
}

if (!isTest) {
  bootstrap().catch((error) => {
    console.error("Failed to bootstrap server", error);
    process.exit(1);
  });
}
