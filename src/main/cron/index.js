import { logger } from "../../utils/logger.js";
import { startBookingDailyDigestCron } from "./cron.booking-daily-digest.job.js";
import { startFormExpirySummaryCron } from "./cron.forms-expiry-summary.job.js";

/**
 * Globally disables every node-cron registration (API still serves).
 *
 * Typical use:
 * - US / standby region deployments that share the codebase but must not send IST digests twice.
 *
 * Accepted falsey values (case insensitive): false, 0, no
 */
export function isCronSchedulingDisabledGlobally() {
  const raw = String(process.env.ENABLE_CRON_SCHEDULERS ?? "true").trim().toLowerCase();
  return ["false", "0", "no"].includes(raw);
}

/**
 * Register all recurring jobs once per process startup.
 *
 * Each job module may still internally disable itself (e.g. `BOOKING_DAILY_DIGEST_ENABLED=false`).
 *
 * Returns a teardown function stopping every registered task when available.
 */
export function scheduleAllCronJobs() {
  if (process.env.NODE_ENV === "test") {
    logger.info("[cron] Skipped registrars (NODE_ENV=test)");
    return () => {};
  }

  if (isCronSchedulingDisabledGlobally()) {
    logger.info(
      "[cron] All schedulers skipped — ENABLE_CRON_SCHEDULERS is false/no/0 (API unchanged)",
    );
    return () => {};
  }

  const stopFns = [
    startFormExpirySummaryCron(),
    startBookingDailyDigestCron(),
  ];

  return () => {
    for (const fn of stopFns) {
      try {
        if (typeof fn === "function") fn();
      } catch (_) {
        // ignore teardown errors from node-cron
      }
    }
  };
}

export { startBookingDailyDigestCron, startFormExpirySummaryCron };
