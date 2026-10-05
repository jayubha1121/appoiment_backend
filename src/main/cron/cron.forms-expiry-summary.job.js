import cron from "node-cron";
import { logger } from "../../utils/logger.js";
import { runFormExpirySummaryJob } from "../../services/form-expiry-summary.service.js";

/**
 * IST 10:00 default: mails only forms whose expiry **calendar date** equals “today”
 * **in each form TZ** AND whose `bookingLinkExpiresAt` instant is **after** job `now`.
 * Forms whose deadline already passed remain excluded (cron-level skip until link extended / DB corrected).
 *
 * Env:
 * - FORMS_EXPIRY_CRON_ENABLED=true|false (default true; set false locally/tests)
 * - FORMS_EXPIRY_CRON_SCHEDULE cron expression (default "0 10 * * *" = IST 10:00)
 * - FORMS_EXPIRY_CRON_TZ IANA TZ (default BUSINESS_TZ or Asia/Kolkata)
 * - FORMS_EXPIRY_REPORT_TZ calendar-day match fallback (forms without businessTimeZone)
 */
export function startFormExpirySummaryCron() {
  if (process.env.NODE_ENV === "test") {
    return () => {};
  }

  const enabledRaw = String(
    process.env.FORMS_EXPIRY_CRON_ENABLED ?? "true",
  ).toLowerCase();
  if (enabledRaw === "false" || enabledRaw === "0") {
    logger.info("[form-expiry-summary] Cron disabled (FORMS_EXPIRY_CRON_ENABLED)");
    return () => {};
  }

  const tz =
    process.env.FORMS_EXPIRY_CRON_TZ ||
    process.env.BUSINESS_TZ ||
    "Asia/Kolkata";
  const schedule = process.env.FORMS_EXPIRY_CRON_SCHEDULE || "0 10 * * *";

  if (!cron.validate(schedule)) {
    logger.error(
      `[form-expiry-summary] Invalid FORMS_EXPIRY_CRON_SCHEDULE: ${schedule}`,
    );
    return () => {};
  }

  const task = cron.schedule(
    schedule,
    () => {
      void runFormExpirySummaryJob().catch((err) => {
        logger.error(
          "[form-expiry-summary] Scheduled job failed",
          err?.message ?? err,
        );
      });
    },
    { timezone: tz },
  );

  logger.info(
    `[form-expiry-summary] Cron scheduled — pattern=${schedule} timezone=${tz}`,
  );

  return () => {
    task.stop();
  };
}
