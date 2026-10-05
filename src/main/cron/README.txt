Scheduled jobs live in src/main/cron/

  cron.booking-daily-digest.job.js   — IST morning CSV digest (per qualifying form).
  cron.forms-expiry-summary.job.js   — booking-link expiry mail (calendar “today” in form TZ AND link cutoff instant must still be in the future; already-expired links are skipped).

Entry point: scheduleAllCronJobs() from ./index.js (called from server.js).

GLOBAL kill-switch (recommended for duplicate regions, e.g. US mirror that must not mail):

  ENABLE_CRON_SCHEDULERS=false

When false (or "0"/"no"), no node-cron tasks are registered. The HTTP API is unaffected.

Per-job overrides still apply (BOOKING_DAILY_DIGEST_ENABLED, FORMS_EXPIRY_CRON_ENABLED, …).

Preview without SMTP (authenticated admin API):

  GET /api/admin/reports/expiry-summary/preview
  GET /api/admin/reports/booking-digest/preview

Manual extra recipients (scheduled digest + expiry mail; merged with Google accounts & env):

  GET /api/admin/integrations/cron-recipients   → { emails: string[] }
  PUT /api/admin/integrations/cron-recipients   body { emails: string[] }  (validated, deduped, max 40)

Dashboard: Integrations → “Scheduled mail recipients”.

Manual one-off sends (authenticated):

  POST /api/admin/reports/expiry-summary/run
  POST /api/admin/reports/booking-digest/run   (every qualifying form attachment, cron rules + BOOKING_DAILY_DIGEST_ENABLED)
  POST /api/admin/forms/:formId/send-booking-digest   (same CSV for **one form** · does **not** require cron roster eligibility; needs ≥1 booking)

Digest mail is skipped when zero forms qualify (needs active window, open booking link,
and at least one booking) — use GET /api/admin/reports/booking-digest/preview (JWT).

Single-form CSV from the Dashboard: Forms table → Mail icon sends to the merged digest recipient list only.
