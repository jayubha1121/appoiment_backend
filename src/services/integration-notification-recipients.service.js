import { IntegrationModel } from "../models/Integration.js";
import { logger } from "../utils/logger.js";
import { sanitizeEmailUserForSmtp } from "../utils/mailerTransport.js";
import { getManualCronRecipientEmails } from "./cron-manual-recipients.service.js";

async function integrationGoogleEmailsOnly() {
  const rows = await IntegrationModel.find({
    provider: "google",
    isActive: true,
  })
    .select("email")
    .lean();

  const set = new Set();
  for (const r of rows) {
    const e = String(r.email ?? "").trim().toLowerCase();
    if (e) set.add(e);
  }
  return [...set];
}

/** Comma/semicolon/whitespace-separated email list from env vars. */
export function parseEmailsFromCommaEnv(value) {
  return String(value ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"));
}

/**
 * Recipient list builder: Google integrations ∪ admin-saved manual emails (DB) ∪ `FORMS_EXPIRY_SUMMARY_EMAILS`.
 * If none are resolved and fallback is enabled, adds `EMAIL_USER` (sender inbox) as recipient.
 */
export async function resolveExpirySummaryRecipientEmails() {
  const fromIntegration = await integrationGoogleEmailsOnly();
  const fromManualDb = await getManualCronRecipientEmails();
  const fromEnv = parseEmailsFromCommaEnv(process.env.FORMS_EXPIRY_SUMMARY_EMAILS);

  const uniq = new Set([...fromIntegration, ...fromManualDb, ...fromEnv]);

  let usedSenderFallback = false;
  if (!uniq.size) {
    const flag = String(
      process.env.FORMS_EXPIRY_SUMMARY_USE_SENDER_AS_RECIPIENT ?? "true",
    ).toLowerCase();
    const allowSenderFallback = !["false", "0", "no"].includes(flag);
    const sender = sanitizeEmailUserForSmtp(process.env.EMAIL_USER ?? "");

    if (allowSenderFallback && sender) {
      uniq.add(sender);
      usedSenderFallback = true;
    }
  }

  const emails = [...uniq];

  logger.info(
    `[integration-recipients] count=${emails.length} integrations=${fromIntegration.length} manualDb=${fromManualDb.length} envExtras=${fromEnv.length}${usedSenderFallback ? " senderFallback" : ""}`,
  );

  return {
    emails,
    usedSenderFallback,
    fromIntegrationCount: fromIntegration.length,
    fromManualDbCount: fromManualDb.length,
    fromEnvCount: fromEnv.length,
  };
}
