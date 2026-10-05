import cron from "node-cron";
import { logger } from "../../utils/logger.js";
import { runBookingDailyDigestJob } from "../../services/booking-daily-digest.service.js";

/**
 * IST ~10:00 (`Asia/Kolkata` by default via cron TZ env).
 *
 * BOOKING_DIGEST_CRON_SCHEDULE (default `"0 10 * * *"`)
 * BOOKING_DIGEST_CRON_TZ · BOOKING_DAILY_DIGEST_ENABLED · BOOKING_DIGEST_MAX_ROWS
 * BOOKING_DIGEST_NEW_WINDOW_HOURS (recent block per form) · BOOKING_DIGEST_LOOKBACK_HOURS fallback
 *
 * Behaviour: One UTF‑8 BOM CSV **per qualifying form** that currently has bookings
 * (~ one Excel worksheet per attachment). Forms are skipped when inactive,
 * outside `activeFrom`/`activeTo`, the booking link is expired (`bookingLinkExpiresAt` passed),
 * or they have zero bookings.
 */
export function startBookingDailyDigestCron() {
  if (process.env.NODE_ENV === "test") {
    return () => {};
  }

  const enabled = String(process.env.BOOKING_DAILY_DIGEST_ENABLED ?? "true")
    .toLowerCase();
  if (enabled === "false" || enabled === "0") {
    logger.info("[booking-digest] Cron disabled (BOOKING_DAILY_DIGEST_ENABLED)");
    return () => {};
  }

  const tz =
    process.env.BOOKING_DIGEST_CRON_TZ ||
    process.env.FORMS_EXPIRY_CRON_TZ ||
    process.env.BUSINESS_TZ ||
    "Asia/Kolkata";

  const schedule =
    process.env.BOOKING_DIGEST_CRON_SCHEDULE ||
    process.env.FORMS_EXPIRY_CRON_SCHEDULE ||
    "0 10 * * *";

  if (!cron.validate(schedule)) {
    logger.error(`[booking-digest] Invalid BOOKING_DIGEST_CRON_SCHEDULE: ${schedule}`);
    return () => {};
  }

  const task = cron.schedule(
    schedule,
    () => {
      void runBookingDailyDigestJob().catch((err) => {
        logger.error("[booking-digest] Job failed", err?.message ?? err);
      });
    },
    { timezone: tz },
  );

  logger.info(
    `[booking-digest] Cron scheduled — pattern=${schedule} timezone=${tz}`,
  );

  return () => task.stop();
}
