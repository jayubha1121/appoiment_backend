import { Types } from "mongoose";
import { BookingModel } from "../models/Booking.js";
import { FormModel } from "../models/Form.js";
import { getMailTransport, getGmailAuthFromEnv, getFromAddress } from "../utils/mailerTransport.js";
import { logger } from "../utils/logger.js";
import { resolveBookingCsvRecipientEmails } from "./booking-csv-email.service.js";
import {
  mapBookingLeanToCsvRow,
  sortCsvRowsForDigest,
  buildAppointmentDigestCombinedCsvPlain,
  bookingCsvBannerRow,
  BOOKING_EXPORT_COLUMNS,
} from "../utils/booking-export-csv.shared.js";
import { formatCalendarDateDdMmYyyyInTimeZone } from "./form-expiry-summary.service.js";
import { withUtf8Bom } from "../utils/csvUtf8Bom.shared.js";
import { formIsEligibleForMorningDigest } from "../repositories/form.repository.js";

function digestEnabledFlag() {
  return String(process.env.BOOKING_DAILY_DIGEST_ENABLED ?? "true").toLowerCase();
}

function digestMaxRows() {
  const n = Number(process.env.BOOKING_DIGEST_MAX_ROWS);
  if (!Number.isFinite(n) || n <= 0) return 50_000;
  return Math.min(Math.floor(n), 500_000);
}

/**
 * Rolling window length (hours) for each form's CSV "recent" block.
 */
export function getBookingDigestNewWindowHours(customEnv = process.env) {
  const explicit = Number(customEnv?.BOOKING_DIGEST_NEW_WINDOW_HOURS);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const legacy = Number(customEnv?.BOOKING_DIGEST_LOOKBACK_HOURS);
  if (Number.isFinite(legacy) && legacy > 0) return legacy;
  return 24;
}

export function getBookingDigestNewBookingsCutoff(
  now = new Date(),
  customEnv = process.env,
) {
  const h = getBookingDigestNewWindowHours(customEnv);
  return new Date(now.getTime() - h * 60 * 60 * 1000);
}

function digestNewBookingsMongoQuery(now, customEnv = process.env) {
  const cutoff = getBookingDigestNewBookingsCutoff(now, customEnv);
  return { bookedAt: { $gte: cutoff } };
}

function bookedAtMillis(bookedAtRaw) {
  if (bookedAtRaw instanceof Date && !Number.isNaN(bookedAtRaw.getTime()))
    return bookedAtRaw.getTime();
  const t = Date.parse(String(bookedAtRaw ?? ""));
  return Number.isFinite(t) ? t : NaN;
}

function partitionBookingLeanDocsByRollingCutoff(leanBookings, cutoff) {
  const recentLean = [];
  const earlierLean = [];
  const c = cutoff.getTime();
  for (const b of leanBookings) {
    const bt = bookedAtMillis(b.bookedAt);
    if (!Number.isFinite(bt) || bt < c) earlierLean.push(b);
    else recentLean.push(b);
  }
  return { recentLean, earlierLean };
}

async function digestFetchBookings(match, lim) {
  return BookingModel.find(match)
    .populate("slotId")
    .populate("formId")
    .sort({ bookedAt: -1 })
    .limit(lim)
    .lean();
}

/** Keep only bookings whose `formId` ref matches — avoids any bad / legacy rows in the snapshot. */
function filterBookingsLeanToForm(bookingsLean, formOid) {
  const want = String(formOid);
  return bookingsLean.filter((b) => {
    const ref = b.formId;
    if (ref == null) return false;
    if (typeof ref === "object" && ref !== null && "_id" in ref) {
      const id = ref._id;
      return id != null && String(id) === want;
    }
    return String(ref) === want;
  });
}

export function sanitizeFormTitleForDigestFilename(rawTitle, maxLen = 48) {
  const base = String(rawTitle ?? "").trim().toLowerCase() || "form";
  const ascii = base
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const slug = ascii.slice(0, maxLen).replace(/^-+|-+$/g, "") || "form";
  return slug;
}

export function digestAttachmentFilename(form, calendarDayDdMmYyyy) {
  const slug = sanitizeFormTitleForDigestFilename(form.title ?? "");
  const idShort = String(form._id).slice(-6);
  const base = `${slug}-${idShort}-${calendarDayDdMmYyyy}`;
  return `${base.slice(0, 180)}.csv`;
}

/** Timezone + report date label shared by cron digest and manual single-form sends. */
function digestReportContext(now = new Date()) {
  const tz =
    process.env.BOOKING_DIGEST_CRON_TZ ||
    process.env.FORMS_EXPIRY_CRON_TZ ||
    process.env.BUSINESS_TZ ||
    "Asia/Kolkata";
  const calendarDay = formatCalendarDateDdMmYyyyInTimeZone(now, tz);
  return { tz, calendarDay };
}

/**
 * One form → digest CSV attachment (+ row counts). `null` if zero bookings (capped snapshot).
 * Cron inclusion uses {@link formIsEligibleForMorningDigest} — same openness as `/book/[id]`.
 */
async function buildBookingDigestAttachmentForForm(form, now = new Date()) {
  const { tz, calendarDay } = digestReportContext(now);
  const lim = digestMaxRows();
  const winH = getBookingDigestNewWindowHours();
  const cutoff = getBookingDigestNewBookingsCutoff(now);
  const fid = form._id;
  const oid = fid instanceof Types.ObjectId ? fid : new Types.ObjectId(String(fid));

  let bookingsSnapshot = await digestFetchBookings({ formId: oid }, lim);
  bookingsSnapshot = filterBookingsLeanToForm(bookingsSnapshot, oid);
  if (!bookingsSnapshot.length) return null;

  const { recentLean, earlierLean } =
    partitionBookingLeanDocsByRollingCutoff(bookingsSnapshot, cutoff);

  /** One digest attachment = always this form's title (never another form name in the sheet). */
  const canonicalFormTitle = String(form.title ?? "");
  const toDigestRow = (b) => ({
    ...mapBookingLeanToCsvRow(b),
    formTitle: canonicalFormTitle,
  });

  const rollingRowsSorted = sortCsvRowsForDigest(recentLean.map(toDigestRow));
  const earlierRowsSorted = sortCsvRowsForDigest(earlierLean.map(toDigestRow));
  const totalRows = rollingRowsSorted.length + earlierRowsSorted.length;

  const fname = digestAttachmentFilename(form, calendarDay);
  const rollingBannerNote = `Recent Appointments (last ${winH}h) · ${calendarDay} · ${tz}`;
  const earlierBannerNote = `Earlier Appointments (older than ${winH}h) · capped at ${lim} rows`;

  // ── CSV title block: visible when opened in Excel/Sheets ──────────────────
  const titlePrefix = [
    bookingCsvBannerRow(`Form: ${canonicalFormTitle}`),
    bookingCsvBannerRow(`Report Date: ${calendarDay} · ${tz}`),
    bookingCsvBannerRow(`Total Bookings: ${totalRows} (${rollingRowsSorted.length} recent · ${earlierRowsSorted.length} earlier)`),
    bookingCsvBannerRow(""),
  ].join("\r\n") + "\r\n";

  const csvPlain = titlePrefix + buildAppointmentDigestCombinedCsvPlain({
    rollingWindowRowsSorted: rollingRowsSorted,
    earlierRowsSorted: earlierRowsSorted,
    rollingBannerNote,
    earlierBannerNote,
    spacerBlankCsvLinesBetweenSections: 1,
  });

  const attachment = {
    filename: fname,
    content: withUtf8Bom(csvPlain),
    contentType: "text/csv; charset=utf-8",
  };
  const summary = {
    filename: fname,
    title: String(form.title ?? ""),
    rolling: rollingRowsSorted.length,
    earlier: earlierRowsSorted.length,
    total: totalRows,
  };

  return { attachment, summary, tz, calendarDay, winH, lim };
}

export async function getBookingDailyDigestPreview({ now = new Date() } = {}) {
  const winH = getBookingDigestNewWindowHours();
  const lim = digestMaxRows();
  const tz =
    process.env.BOOKING_DIGEST_CRON_TZ ||
    process.env.FORMS_EXPIRY_CRON_TZ ||
    process.env.BUSINESS_TZ ||
    "Asia/Kolkata";

  const DIGEST_ELIGIBILITY_FIELDS =
    "_id title isActive bookingLinkExpiresAt activeTo activeFrom";

  const [allTotal, rollingTotalInDb, recipients, mailConfigured, activeCandidates] =
    await Promise.all([
      BookingModel.countDocuments({}),
      BookingModel.countDocuments(digestNewBookingsMongoQuery(now)),
      resolveBookingCsvRecipientEmails(),
      Promise.resolve(Boolean(getMailTransport())),
      FormModel.find({ isActive: true })
        .select(DIGEST_ELIGIBILITY_FIELDS)
        .sort({ title: 1 })
        .lean(),
    ]);

  const eligibleForms = activeCandidates.filter((f) =>
    formIsEligibleForMorningDigest(f, now),
  );
  const dateLabel = formatCalendarDateDdMmYyyyInTimeZone(now, tz);
  const planned = [];
  for (const form of eligibleForms) {
    const fid = form._id;
    const oid = fid instanceof Types.ObjectId ? fid : new Types.ObjectId(String(fid));
    const n = await BookingModel.countDocuments({ formId: oid });
    if (n <= 0) continue;
    planned.push({
      formId: String(fid),
      formTitle: form.title,
      bookingCountApprox: n,
      attachmentFilename: digestAttachmentFilename(form, dateLabel),
    });
  }

  const inactiveOrExpiredSkippedApprox = Math.max(
    0,
    (await FormModel.countDocuments({})) - eligibleForms.length,
  );

  return {
    nowIso: now.toISOString(),
    enabled:
      digestEnabledFlag() !== "false" &&
      digestEnabledFlag() !== "0" &&
      digestEnabledFlag() !== "no",
    scheduleNote:
      'Production: IST 10:00 — BOOKING_DIGEST_CRON_SCHEDULE default "0 10 * * *" + TZ Asia/Kolkata.',
    newWindowHours: winH,
    maxRowsPerFormSnapshotCap: lim,
    bookingsCountInDb: allTotal,
    rollingWindowMatchedInDb: rollingTotalInDb,
    timezoneLabel: tz,
    rollDateCalendar: dateLabel,
    mailerConfigured,
    recipientCount: recipients.length,
    recipients,
    hint:
      recipients.length === 0
        ? "Recipients missing — add addresses under Integrations → scheduled mail, connect Google Calendar, FORMS_EXPIRY_SUMMARY_EMAILS, or EMAIL_USER fallback."
        : planned.length === 0
          ? "No eligible ongoing forms currently have bookings — nothing would be attached."
          : null,
    digestModeEnglish:
      "One UTF-8 BOM CSV per qualifying form that has bookings. A form qualifies when it would still load publicly (inactive off + open booking window: explicit link expiry instant, otherwise last UTC calendar day on activeTo). Recent-window rows first; optional second block for older capped rows.",
    formsEligibleOngoingCount: eligibleForms.length,
    formsSkippedInactiveExpiredOrInactiveWindowApprox:
      inactiveOrExpiredSkippedApprox,
    formsIncludedWithBookings: planned.length,
    attachmentsPlanned: planned.map((p) => p.attachmentFilename),
    detailPlannedAttachments: planned,
    csvColumnHeaders: BOOKING_EXPORT_COLUMNS.map((c) => c.header),
  };
}

/**
 * Morning digest — one CSV attachment per qualifying form with bookings (~ one Excel sheet per form).
 */
export async function runBookingDailyDigestJob({ now = new Date() } = {}) {
  if (process.env.NODE_ENV === "test") {
    return { skipped: true, reason: "test" };
  }

  const enabled = digestEnabledFlag();
  if (enabled === "false" || enabled === "0" || enabled === "no") {
    logger.info("[booking-digest] Disabled (BOOKING_DAILY_DIGEST_ENABLED=false)");
    return { skipped: true, reason: "disabled" };
  }

  const transport = getMailTransport();
  if (!transport) {
    logger.warn(
      "[booking-digest] SKIP: EMAIL_USER/PASS missing — could not initialize SMTP transport",
    );
    return { skipped: true, reason: "no_mailer" };
  }

  const { tz, calendarDay } = digestReportContext(now);

  const DIGEST_FIELDS =
    "_id title isActive bookingLinkExpiresAt activeTo activeFrom emailRecipients";
  const digestCandidates = await FormModel.find({ isActive: true })
    .select(DIGEST_FIELDS)
    .sort({ title: 1 })
    .lean();

  const eligibleForms = digestCandidates.filter((f) =>
    formIsEligibleForMorningDigest(f, now),
  );
  const attachments = [];
  /** @type {{ filename: string; title: string; rolling: number; earlier: number; total: number }[]} */
  const summary = [];
  /** @type {number | undefined} */
  let winHForSummary;
  /** Per-form specific attachments and recipients for targeted sends */
  const perFormSends = [];

  for (const form of eligibleForms) {
    const fid = form._id;
    const oid = fid instanceof Types.ObjectId ? fid : new Types.ObjectId(String(fid));
    const bookingsCount = await BookingModel.countDocuments({ formId: oid });
    if (bookingsCount <= 0) continue;

    const built = await buildBookingDigestAttachmentForForm(form, now);
    if (!built) continue;

    winHForSummary = built.winH;
    attachments.push(built.attachment);
    summary.push(built.summary);

    // Collect per-form specific recipients for targeted digest emails
    const formEmails = Array.isArray(form.emailRecipients)
      ? form.emailRecipients.filter((e) => typeof e === "string" && e.includes("@"))
      : [];
    if (formEmails.length > 0) {
      perFormSends.push({ form, built, formEmails });
    }
  }

  const winH =
    typeof winHForSummary === "number"
      ? winHForSummary
      : getBookingDigestNewWindowHours();

  const { user: fromAddr } = getGmailAuthFromEnv();

  let totalRows = summary.reduce((a, x) => a + x.total, 0);
  let sent = 0;
  let recipients = 0;

  if (attachments.length === 0) {
    logger.info(
      "[booking-digest] SKIP: zero qualifying forms with bookings (inactive / expired booking link / inactive window skipped)",
    );
    return {
      skipped: true,
      reason: "no_forms_with_bookings",
      attachments: [],
      formSheetsIncluded: 0,
      recipients: 0,
      sent: 0,
    };
  }

  const recentAcrossAll = summary.reduce((a, x) => a + x.rolling, 0);

  // ── Per-form targeted digest sends (form-specific emailRecipients) ─────────
  for (const { form: pForm, built, formEmails } of perFormSends) {
    recipients += formEmails.length;
    const pSubject = `Daily Report — "${String(pForm.title).slice(0, 60)}" | ${built.summary.total} booking${built.summary.total !== 1 ? "s" : ""} · ${built.calendarDay}`;
    const pText = [
      `Daily Appointments Report — ${built.calendarDay} · ${built.tz}`,
      "",
      `Form: ${pForm.title}`,
      `Total: ${built.summary.total} (${built.summary.rolling} recent · ${built.summary.earlier} earlier)`,
      `File: ${built.summary.filename}`,
    ].join("\n");
    for (const pTo of formEmails) {
      try {
        await transport.sendMail({
          from: getFromAddress(fromAddr),
          to: pTo,
          subject: pSubject,
          text: pText,
          attachments: [built.attachment],
        });
        sent += 1;
        logger.info(`[booking-digest] per-form sent to=${pTo} form="${pForm.title}"`);
      } catch (err) {
        logger.error(`[booking-digest] per-form SMTP FAILED to=${pTo}: ${err?.message ?? err}`);
      }
    }
  }

  const fnames = attachments.map((a) => a.filename);

  return {
    rowCount: totalRows,
    rowCountRollingWindowAcrossForms: recentAcrossAll,
    newWindowHours: winH,
    attachments: fnames,
    formSheetsIncluded: attachments.length,
    recipients,
    sent,
  };
}

/**
 * Admin-triggered digest for one form — same CSV as the cron job (~10 AM), mailed to that form's configured recipients.
 * Ignores `BOOKING_DAILY_DIGEST_ENABLED` so admins can export off-schedule.
 */
export async function sendBookingDailyDigestManualForForm({
  formId,
  now = new Date(),
} = {}) {
  if (process.env.NODE_ENV === "test") {
    return {
      skipped: true,
      reason: "test",
      message: "Manual digest is unavailable in NODE_ENV=test.",
    };
  }

  if (!Types.ObjectId.isValid(String(formId))) {
    return {
      skipped: true,
      reason: "invalid_form_id",
      message: "Invalid form id.",
    };
  }

  const oid = new Types.ObjectId(String(formId));

  const transport = getMailTransport();
  if (!transport) {
    return {
      skipped: true,
      reason: "no_mailer",
      message:
        "Gmail SMTP not wired: set EMAIL_USER and password in EMAIL_PASS, EMAIL_PASSWORD, or GMAIL_APP_PASSWORD (16‑character App Password — not your normal Gmail login). Restart the server after changing .env.",
    };
  }

  /** Manual send — bookings exist; openness hint uses same rule as cron ({@link formIsEligibleForMorningDigest}). */
  const DIGEST_FIELDS =
    "_id title isActive bookingLinkExpiresAt activeTo activeFrom emailRecipients";
  const form = await FormModel.findById(oid).select(DIGEST_FIELDS).lean();
  if (!form) {
    return {
      skipped: true,
      reason: "not_found",
      message: "Form not found.",
    };
  }

  // Only use per-form email recipients
  const recipients = Array.isArray(form.emailRecipients)
    ? form.emailRecipients.filter((e) => typeof e === "string" && e.includes("@"))
    : [];

  if (!recipients.length) {
    return {
      skipped: true,
      reason: "no_recipients",
      message:
        "No email recipients configured for this form. Add addresses in the form's notification settings (bell icon).",
    };
  }

  const cronEligible = formIsEligibleForMorningDigest(form, now);

  const bookingsCount = await BookingModel.countDocuments({ formId: oid });

  if (bookingsCount <= 0) {
    return {
      skipped: true,
      reason: "no_bookings",
      message: "This form has no bookings yet.",
    };
  }

  const built = await buildBookingDigestAttachmentForForm(form, now);
  if (!built) {
    return {
      skipped: true,
      reason: "no_bookings",
      message: "Could not load bookings for this export.",
    };
  }

  const { tz, calendarDay, attachment, summary, winH } = built;
  const { user: fromAddr } = getGmailAuthFromEnv();
  if (!fromAddr) {
    return {
      skipped: true,
      reason: "no_sender",
      message:
        "EMAIL_USER is empty — cannot set From. It must match the Gmail account App Password belongs to.",
    };
  }

  const csvUtf8 =
    typeof attachment.content === "string"
      ? attachment.content
      : String(attachment.content ?? "");
  const mailAttachment = {
    filename: attachment.filename,
    content: Buffer.from(csvUtf8, "utf8"),
    contentType: attachment.contentType ?? "text/csv; charset=utf-8",
  };

  const plainLines = [
    `${calendarDay} · ${tz}`,
    "",
    `[Manual send] Appointment CSV digest for "${summary.title}".`,
    `Same CSV layout as the scheduled morning digest (rolling ${winH}h block + snapshot).`,
    `Rows: ${summary.total} (${summary.rolling} recent · ${summary.earlier} earlier).`,
  ];
  if (!cronEligible) {
    plainLines.push(
      "",
      "(This form may be skipped by automatic morning cron — check campaign dates, booking-link expiry, or inactive flag — this CSV was sent manually anyway.)",
    );
  }
  plainLines.push("", attachment.filename);
  const plainText = plainLines.join("\n");

  const cronNote = cronEligible
    ? ""
    : `<tr><td colspan="3" style="padding:10px 32px;background:#fffbeb;border-top:1px solid #fde68a;"><p style="margin:0;font-size:12px;color:#92400e;">Note: The scheduled morning digest may skip this form (inactive, expired booking link, or outside campaign window). This report was sent manually.</p></td></tr>`;

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.10);">

        <!-- Header -->
        <tr>
          <td colspan="3" style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:28px 32px;">
            <p style="margin:0;color:#93c5fd;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;">Appointment Report</p>
            <h1 style="margin:6px 0 4px;color:#ffffff;font-size:22px;font-weight:700;line-height:1.3;">${escapeHtml(summary.title)}</h1>
            <p style="margin:0;color:#bfdbfe;font-size:13px;">${escapeHtml(calendarDay)} &nbsp;&middot;&nbsp; ${escapeHtml(tz)}</p>
          </td>
        </tr>

        <!-- Stats -->
        <tr style="background:#ffffff;">
          <td align="center" style="padding:20px 12px;border-bottom:1px solid #eeeeee;border-right:1px solid #eeeeee;width:33%;">
            <div style="font-size:34px;font-weight:700;color:#1e3a5f;line-height:1;">${escapeHtml(String(summary.total))}</div>
            <div style="font-size:10px;color:#888888;margin-top:6px;text-transform:uppercase;letter-spacing:.06em;">Total Bookings</div>
          </td>
          <td align="center" style="padding:20px 12px;border-bottom:1px solid #eeeeee;border-right:1px solid #eeeeee;width:33%;">
            <div style="font-size:34px;font-weight:700;color:#16a34a;line-height:1;">${escapeHtml(String(summary.rolling))}</div>
            <div style="font-size:10px;color:#888888;margin-top:6px;text-transform:uppercase;letter-spacing:.06em;">Last ${escapeHtml(String(winH))}h</div>
          </td>
          <td align="center" style="padding:20px 12px;border-bottom:1px solid #eeeeee;width:33%;">
            <div style="font-size:34px;font-weight:700;color:#ea580c;line-height:1;">${escapeHtml(String(summary.earlier))}</div>
            <div style="font-size:10px;color:#888888;margin-top:6px;text-transform:uppercase;letter-spacing:.06em;">Earlier</div>
          </td>
        </tr>

        <!-- File info -->
        <tr>
          <td colspan="3" style="background:#f8f9fa;padding:16px 32px;border-top:1px solid #eeeeee;">
            <p style="margin:0;color:#1e3a5f;font-size:13px;font-weight:600;">Attached: ${escapeHtml(summary.filename)}</p>
            <p style="margin:6px 0 0;color:#888888;font-size:11px;">Open in Excel or Google Sheets &mdash; UTF-8 BOM encoded for correct character display.</p>
          </td>
        </tr>

        ${cronNote}

        <!-- Footer -->
        <tr>
          <td colspan="3" style="background:#f0f2f5;padding:12px 32px;">
            <p style="margin:0;color:#999999;font-size:11px;">${escapeHtml(calendarDay)} &nbsp;&middot;&nbsp; Appointment Management System</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const subjectStem = summary.title.slice(0, 60);
  const subject = `Appointment Report — "${subjectStem}"${summary.title.length > 60 ? "…" : ""} | ${summary.total} booking${summary.total !== 1 ? "s" : ""} | ${calendarDay}`;

  /** @type {{ to: string; message: string }[]} */
  const smtpFailures = [];
  let sent = 0;
  for (const to of recipients) {
    try {
      await transport.sendMail({
        from: getFromAddress(fromAddr),
        to,
        subject,
        text: plainText,
        html: htmlBody,
        attachments: [mailAttachment],
      });
      sent += 1;
      logger.info(
        `[booking-digest] Manual OK form=${String(oid)} file=${attachment.filename} to=${to}`,
      );
    } catch (err) {
      const raw =
        typeof err?.response === "string"
          ? err.response
          : err?.message ?? String(err);
      const line = typeof raw === "string" ? raw : String(raw);
      smtpFailures.push({ to: String(to), message: line });
      logger.error(
        `[booking-digest] Manual SMTP FAILED form=${String(oid)} to=${to}: ${line}`,
      );
    }
  }

  if (sent === 0 && recipients.length > 0) {
    const snippets = smtpFailures
      .slice(0, 4)
      .map((f) => `${f.to}: ${f.message.slice(0, 200)}`)
      .join(" | ");
    return {
      skipped: true,
      reason: "smtp_failed",
      message:
        snippets.length > 0
          ? `${snippets}${snippets.length > 400 ? "…" : ""} — Gmail: App Password → EMAIL_PASS or EMAIL_PASSWORD only; EMAIL_USER must be that Gmail; restart backend after .env edits.`
          : "SMTP send failed — no error text returned. Logs may have more.",
      details: {
        attempts: smtpFailures.slice(0, 12),
        recipientCount: recipients.length,
      },
    };
  }
  return {
    skipped: false,
    sent,
    recipients: recipients.length,
    filename: summary.filename,
    formTitle: summary.title,
    rowCount: summary.total,
    rollingRows: summary.rolling,
    earlierRows: summary.earlier,
    newWindowHours: winH,
    timezone: tz,
    calendarDay,
    /** `true` only if this form would also get cron’s auto digest (active window + open link + etc.). */
    includedInMorningCron: Boolean(cronEligible),
    ...(smtpFailures.length > 0 && {
      deliveryFailures: smtpFailures,
      warning:
        `${smtpFailures.length} recipient(s) did not receive the mail — see deliveryFailures for Gmail’s reason.`,
    }),
  };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
