import { Types } from "mongoose";
import { FormModel } from "../models/Form.js";
import { BookingModel } from "../models/Booking.js";
import { SlotModel } from "../models/Slot.js";
import { getMailTransport, getGmailAuthFromEnv, getFromAddress } from "../utils/mailerTransport.js";
import { logger } from "../utils/logger.js";
import {
  mapBookingLeanToCsvRow,
  stringifyBookingRowsCsv,
} from "../utils/booking-export-csv.shared.js";
import { withUtf8Bom } from "../utils/csvUtf8Bom.shared.js";

function extractFormEmailRecipients(form) {
  return Array.isArray(form?.emailRecipients)
    ? [...new Set(form.emailRecipients.filter((e) => typeof e === "string" && e.includes("@")))]
    : [];
}

/** YYYY-MM-DD in the given IANA timezone — for comparing calendar days (logic, sorting). */
export function formatCalendarDateInTimeZone(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** DD-MM-YYYY — human-readable labels, filenames, and mail bodies. */
export function formatCalendarDateDdMmYyyyInTimeZone(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const parts = dtf.formatToParts(date);
  const day = parts.find((p) => p.type === "day")?.value ?? "00";
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  return `${day}-${month}-${year}`;
}

/** Booking link cutoff is still strictly in the future (cron will not mail after this instant passes). */
export function isBookingLinkExpiryInstantAfterNow(bookingLinkExpiresAt, now = new Date()) {
  if (!bookingLinkExpiresAt) return false;
  const t = new Date(bookingLinkExpiresAt).getTime();
  return Number.isFinite(t) && t > now.getTime();
}

function expirySummaryCandidatesFilter(now = new Date()) {
  return {
    bookingLinkExpiresAt: { $gt: now },
    expirySummaryEmailSentAt: null,
  };
}

function skippedExpiredBookingLinkButSummaryPendingFilter(now = new Date()) {
  return {
    bookingLinkExpiresAt: { $ne: null, $lte: now },
    expirySummaryEmailSentAt: null,
  };
}

/** True when booking link expiry and `now` share the same local calendar date in the form's timezone. */
export function isFormBookingLinkExpiryOnLocalCalendarToday(
  form,
  now = new Date(),
  defaultTz = "Asia/Kolkata",
) {
  if (!form?.bookingLinkExpiresAt) return false;
  const formTz = String(form.businessTimeZone ?? "").trim() || defaultTz;
  const expiryDay = formatCalendarDateInTimeZone(
    new Date(form.bookingLinkExpiresAt),
    formTz,
  );
  const todayInFormTz = formatCalendarDateInTimeZone(now, formTz);
  return expiryDay === todayInFormTz;
}

/** Admin/debug preview: see what cron would enqueue without delivering mail. */
export async function getFormExpirySummaryJobPreview({
  now = new Date(),
  reportTz,
} = {}) {
  const defaultTz =
    reportTz ??
    process.env.FORMS_EXPIRY_REPORT_TZ ??
    process.env.BUSINESS_TZ ??
    "Asia/Kolkata";

  const mailerConfigured = Boolean(getMailTransport());

  const [candidates, skippedExpiredCount] = await Promise.all([
    FormModel.find(expirySummaryCandidatesFilter(now))
      .select(
        "_id title businessTimeZone bookingLinkExpiresAt expirySummaryEmailSentAt emailRecipients",
      )
      .lean(),
    FormModel.countDocuments(skippedExpiredBookingLinkButSummaryPendingFilter(now)),
  ]);

  const sentEarlier = await FormModel.find({
    bookingLinkExpiresAt: { $ne: null },
    expirySummaryEmailSentAt: { $ne: null },
  })
    .select("_id title businessTimeZone bookingLinkExpiresAt expirySummaryEmailSentAt")
    .lean();

  const expiryDayAlreadyNotifiedForms = sentEarlier.filter((f) =>
    isFormBookingLinkExpiryOnLocalCalendarToday(f, now, defaultTz),
  );

  const due = candidates.filter((f) =>
    isFormBookingLinkExpiryOnLocalCalendarToday(f, now, defaultTz),
  );

  const recipients = [...new Set(due.flatMap((f) => extractFormEmailRecipients(f)))];

  return {
    nowIso: now.toISOString(),
    defaultTimeZone: defaultTz,
    mailerConfigured,
    recipients,
    recipientMeta: {
      source: "form.emailRecipients",
      formsWithRecipients: due.filter((f) => extractFormEmailRecipients(f).length > 0)
        .length,
    },
    hint:
      recipients.length === 0
        ? "No recipient emails found on due forms. Add addresses in each form's Notification settings (bell icon)."
        : expiryDayAlreadyNotifiedForms.length > 0 && due.length === 0
          ? "Expiry-day forms exist but expirySummaryEmailSentAt already set — no repeat mail unless DB field cleared."
          : due.length === 0
            ? `No qualifying forms — either expiry local day (${defaultTz}-relative) ≠ today or booking links already expired.`
            : null,
    candidatesCount: candidates.length,
    skippedExpiredBookingLinkCount: skippedExpiredCount,
    dueCount: due.length,
    dueForms: due.map((f) => {
      const ft = String(f.businessTimeZone ?? "").trim() || defaultTz;
      const expAt = new Date(f.bookingLinkExpiresAt);
      return {
        id: String(f._id),
        title: f.title,
        bookingLinkExpiresAt: expAt.toISOString(),
        businessTimeZone: ft,
        recipientCount: extractFormEmailRecipients(f).length,
        expiryCalendarDayLocal: formatCalendarDateDdMmYyyyInTimeZone(expAt, ft),
        todayCalendarDayLocal: formatCalendarDateDdMmYyyyInTimeZone(now, ft),
      };
    }),
    expiryDayAlreadyNotifiedCount: expiryDayAlreadyNotifiedForms.length,
    expiryDayAlreadyNotifiedForms: expiryDayAlreadyNotifiedForms.map((f) => ({
      id: String(f._id),
      title: f.title,
    })),
  };
}

async function computeSlotSummary(formObjectId) {
  const agg = await SlotModel.aggregate([
    { $match: { formId: formObjectId } },
    {
      $group: {
        _id: null,
        totalSlots: { $sum: 1 },
        slotsWithBookings: {
          $sum: { $cond: [{ $gt: ["$bookedCount", 0] }, 1, 0] },
        },
        totalCapacity: { $sum: "$capacity" },
        totalBookingSeats: { $sum: "$bookedCount" },
      },
    },
  ]);

  const row = agg[0] ?? {
    totalSlots: 0,
    slotsWithBookings: 0,
    totalCapacity: 0,
    totalBookingSeats: 0,
  };

  return {
    totalSlots: row.totalSlots,
    slotsWithBookings: row.slotsWithBookings,
    totalCapacity: row.totalCapacity,
    totalBookingSeats: row.totalBookingSeats,
  };
}

/**
 * Sends one email per form whose booking link expiry timestamp falls on the current **local calendar day**
 * in that form's `businessTimeZone`.
 *
 * Recipient source: each form's own `emailRecipients` list.
 * Successful sends populate `expirySummaryEmailSentAt` to suppress duplicate outbound mail.
 */
export async function runFormExpirySummaryJob({ now = new Date(), reportTz } = {}) {
  const defaultTz =
    reportTz ??
    process.env.FORMS_EXPIRY_REPORT_TZ ??
    process.env.BUSINESS_TZ ??
    "Asia/Kolkata";

  const transport = getMailTransport();
  if (!transport) {
    logger.warn(
      "[form-expiry-summary] EMAIL_USER / EMAIL_PASS missing — skipping job",
    );
    return { skipped: true, reason: "no_mailer_config" };
  }

  const [candidates, skippedExpiredCount] = await Promise.all([
    FormModel.find(expirySummaryCandidatesFilter(now)).lean(),
    FormModel.countDocuments(skippedExpiredBookingLinkButSummaryPendingFilter(now)),
  ]);

  /** Each form compares expiry vs "today" in its own timezone. */
  const due = candidates.filter((f) =>
    isFormBookingLinkExpiryOnLocalCalendarToday(f, now, defaultTz),
  );

  logger.info(
    `[form-expiry-summary] tick now=${now.toISOString()} candidates=${candidates.length} skippedExpiredLinks=${skippedExpiredCount} due=${due.length}`,
  );

  const { user: fromAddr } = getGmailAuthFromEnv();
  let formsProcessed = 0;
  let recipientCount = 0;

  for (const form of due) {
    const formId = form._id;
    const formOid = new Types.ObjectId(String(formId));

    const [slotSummary, bookings, distinctClients] = await Promise.all([
      computeSlotSummary(formOid),
      BookingModel.find({ formId: formOid })
        .populate("slotId")
        .populate("formId")
        .sort({ bookedAt: -1 })
        .lean(),
      BookingModel.distinct("email", { formId: formOid }),
    ]);

    const rows = bookings.map(mapBookingLeanToCsvRow);
    const csv = stringifyBookingRowsCsv(rows);

    const expiryIso = form.bookingLinkExpiresAt
      ? new Date(form.bookingLinkExpiresAt).toISOString()
      : "";

    const formTz =
      String(form.businessTimeZone ?? "").trim() || defaultTz;
    const todayLabel = formatCalendarDateDdMmYyyyInTimeZone(now, formTz);

    const uniqueEmailsCount = distinctClients.filter(Boolean).length;

    const subject = `Booking link expiry — "${form.title.slice(0, 60)}${form.title.length > 60 ? "…" : ""}" — ${bookings.length} bookings, ${uniqueEmailsCount} client(s)`;
    const recipientEmails = extractFormEmailRecipients(form);
    if (!recipientEmails.length) {
      logger.warn(
        `[form-expiry-summary] SKIP form=${String(formId)} no form emailRecipients configured`,
      );
      continue;
    }
    recipientCount += recipientEmails.length;

    const text = buildExpirySummaryPlainText({
      formTitle: form.title,
      formId: String(formId),
      expiryIso,
      formTz,
      todayLabel,
      slotSummary,
      bookingsCount: bookings.length,
      uniqueEmailsCount,
    });

    const html = `
      <p><strong>Automated expiry-day summary — Google Calendar-connected workspace</strong><br/>
      This digest runs on days when a hosted booking link is scheduled to expire.</p>

      <h2>Appointment / booking totals</h2>
      <p style="font-size:115%;margin:16px 0;">
        <strong>Form:</strong> ${escapeHtml(form.title)} — <strong>total bookings:</strong> ${bookings.length}
        &nbsp;|&nbsp;
        <strong>unique clients (distinct emails):</strong> ${uniqueEmailsCount}
      </p>

      <h3>Calendar / expiry metadata</h3>
      <p><strong>Form ID:</strong> ${escapeHtml(String(formId))}</p>
      <p><strong>Booking link expiry (UTC):</strong> ${escapeHtml(expiryIso)}</p>
      <p><strong>Today (form timezone)</strong>, ${escapeHtml(formTz)}: <strong>${escapeHtml(todayLabel)}</strong></p>

      <hr />
      <h3>Slot inventory overview</h3>
      <ul>
        <li><strong>Total slot rows configured:</strong> ${slotSummary.totalSlots}</li>
        <li><strong>Slots with ≥1 booking:</strong> ${slotSummary.slotsWithBookings}</li>
        <li><strong>Total seat capacity:</strong> ${slotSummary.totalCapacity}</li>
        <li><strong>Filled seats (sum of bookedCount):</strong> ${slotSummary.totalBookingSeats}</li>
      </ul>

      <h3>Attachment reminder</h3>
      <p><strong>Line-level booking exports</strong> are attached as UTF‑8 BOM CSV for Excel parity.</p>
    `;

    let anyOk = false;
    for (const to of recipientEmails) {
      try {
        await transport.sendMail({
          from: getFromAddress(fromAddr),
          to,
          subject,
          text,
          html,
          attachments: [
            {
              filename: `form-${String(formId)}-bookings.csv`,
              content: withUtf8Bom(csv),
              contentType: "text/csv; charset=utf-8",
            },
          ],
        });
        anyOk = true;
      } catch (err) {
        logger.error(
          `[form-expiry-summary] Send failed form=${String(formId)} to=${to}`,
          err?.message ?? err,
        );
      }
    }

    if (anyOk) {
      await FormModel.updateOne(
        { _id: formId },
        { $set: { expirySummaryEmailSentAt: new Date() } },
      );
      formsProcessed += 1;
    }
  }

  if (due.length) {
    logger.info(
      `[form-expiry-summary] Done — due=${due.length}, emailed=${formsProcessed}, defaultTz=${defaultTz}`,
    );
  }

  if (due.length && !formsProcessed) {
    logger.warn(
      "[form-expiry-summary] Pending forms existed but SMTP returned zero successes — check Gmail app passwords or production EMAIL_USER / EMAIL_PASS.",
    );
  }

  return {
    dueCount: due.length,
    formsEmailed: formsProcessed,
    defaultTimeZone: defaultTz,
    recipientCount,
    skippedExpiredBookingLinkCount: skippedExpiredCount,
  };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildExpirySummaryPlainText({
  formTitle,
  formId,
  expiryIso,
  formTz,
  todayLabel,
  slotSummary,
  bookingsCount,
  uniqueEmailsCount,
}) {
  const lines = [
    "Booking link expiry — appointments / bookings summary",
    "(Delivered only to this form's configured email recipients.)",
    "",
    "--- KPI block ---",
    `Form: ${formTitle}`,
    `TOTAL BOOKINGS: ${bookingsCount}`,
    `UNIQUE CLIENTS (distinct emails): ${uniqueEmailsCount}`,
    "",
    "Form metadata:",
    `- Form ID: ${formId}`,
    `- Booking link expiry (UTC): ${expiryIso}`,
    `- Today (${formTz}): ${todayLabel}`,
    "",
    "Slot inventory:",
    `- Total configured slot rows: ${slotSummary.totalSlots}`,
    `- Slots with bookings: ${slotSummary.slotsWithBookings}`,
    `- Total seat capacity: ${slotSummary.totalCapacity}`,
    `- Filled seats (bookedCount sum): ${slotSummary.totalBookingSeats}`,
    "",
    "UTF-8 BOM CSV matches the admin export layout (readable column titles — Form, Appointment type, dates/times).",
  ];
  return lines.join("\n");
}
