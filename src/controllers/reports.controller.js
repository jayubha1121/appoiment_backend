import { Types } from "mongoose";
import { sendSuccess, sendError } from "../utils/response.js";
import { getSmtpHealthSnapshot } from "../utils/mailerTransport.js";
import {
  runFormExpirySummaryJob,
  getFormExpirySummaryJobPreview,
} from "../services/form-expiry-summary.service.js";
import {
  runBookingDailyDigestJob,
  getBookingDailyDigestPreview,
  sendBookingDailyDigestManualForForm,
} from "../services/booking-daily-digest.service.js";

export async function smtpHealth(_req, res, next) {
  try {
    const data = await getSmtpHealthSnapshot();
    return sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function previewExpirySummary(_req, res, next) {
  try {
    const data = await getFormExpirySummaryJobPreview({ now: new Date() });
    return sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function runExpirySummaryManual(_req, res, next) {
  try {
    const data = await runFormExpirySummaryJob({ now: new Date() });
    return sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function previewBookingDigest(_req, res, next) {
  try {
    const data = await getBookingDailyDigestPreview({ now: new Date() });
    return sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function runBookingDigestManual(_req, res, next) {
  try {
    const data = await runBookingDailyDigestJob({ now: new Date() });
    return sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /reports/booking-digest/form/:formId
 * Same as cron digest but for a single form — ignores cron eligibility flag.
 */
export async function sendFormDigestManual(req, res, next) {
  try {
    const formId = String(req.params.formId ?? "");
    if (!Types.ObjectId.isValid(formId)) {
      return sendError(res, "Invalid form id.", 400, { reason: "invalid_form_id" });
    }
    const result = await sendBookingDailyDigestManualForForm({ formId, now: new Date() });
    if (result.skipped) {
      const code =
        result.reason === "smtp_failed" || result.reason === "smtp_verify_failed"
          ? 502
          : result.reason === "test"
            ? 503
            : result.reason === "not_found"
              ? 404
              : 400;
      return sendError(res, result.message ?? result.reason, code, {
        reason: result.reason,
        ...(result.details && typeof result.details === "object" ? result.details : {}),
      });
    }
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
