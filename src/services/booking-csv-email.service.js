import { stringify } from "csv-stringify/sync";
import {
  getMailTransport,
  getGmailAuthFromEnv,
  getFromAddress,
  sanitizeEmailUserForSmtp,
} from "../utils/mailerTransport.js";
import { logger } from "../utils/logger.js";
import {
  parseEmailsFromCommaEnv,
  resolveExpirySummaryRecipientEmails,
} from "./integration-notification-recipients.service.js";
import {
  mapBookingLeanToCsvRow,
} from "../utils/booking-export-csv.shared.js";
import { withUtf8Bom } from "../utils/csvUtf8Bom.shared.js";

/** When instant mail is required: integrations ∪ configured env ∪ optional sender copy ∪ extras. */
export async function resolveBookingCsvRecipientEmails() {
  const resolved = await resolveExpirySummaryRecipientEmails();
  const set = new Set(resolved.emails);

  const copySender = String(
    process.env.BOOKING_CSV_COPY_EMAIL_USER ?? "true",
  ).toLowerCase();
  if (!["false", "0", "no"].includes(copySender)) {
    const u = sanitizeEmailUserForSmtp(process.env.EMAIL_USER ?? "");
    if (u) set.add(u);
  }

  for (const e of parseEmailsFromCommaEnv(process.env.BOOKING_CSV_EXTRA_EMAILS)) {
    set.add(e);
  }

  return [...set];
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML escaping helper
// ─────────────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-booking CSV with dynamic custom-field columns
// ─────────────────────────────────────────────────────────────────────────────
function buildBookingInstantCsv(row, extraFieldsPlain, customFields) {
  // Standard columns
  const columns = [
    { key: "formTitle",        header: "Form"             },
    { key: "appointmentTitle", header: "Appointment Type" },
    { key: "clientName",       header: "Client Name"      },
    { key: "phone",            header: "Phone"            },
    { key: "email",            header: "Email"            },
    { key: "address",          header: "Address"          },
    { key: "bookedAt",         header: "Booked On"        },
    { key: "slotDate",         header: "Appointment Date" },
    { key: "slotStart",        header: "Start Time"       },
    { key: "slotEnd",          header: "End Time"         },
  ];

  // Extra custom field columns (use label as header, key as data key)
  const customCols = Array.isArray(customFields)
    ? customFields
        .map((f) => ({ key: String(f?.key ?? "").trim(), label: String(f?.label ?? "").trim() }))
        .filter((f) => f.key && f.label)
    : [];

  for (const f of customCols) {
    columns.push({ key: `cf_${f.key}`, header: f.label });
  }

  // Build data object
  const dataRow = { ...row };
  for (const f of customCols) {
    dataRow[`cf_${f.key}`] = String((extraFieldsPlain ?? {})[f.key] ?? "");
  }

  const csv = stringify([dataRow], {
    header: true,
    columns,
    delimiter: ",",
    record_delimiter: "\r\n",
    quoted_empty: false,
  });

  return withUtf8Bom(csv);
}

// ─────────────────────────────────────────────────────────────────────────────
// Professional HTML email template
// ─────────────────────────────────────────────────────────────────────────────
function buildBookingNotificationHtml({ formTitle, row, extraFieldsPlain, customFields }) {
  const tableRow = (label, value, even = false) => `
    <tr style="background:${even ? "#f8f9fa" : "#ffffff"};">
      <td style="padding:10px 14px;color:#666666;font-size:13px;width:38%;border-bottom:1px solid #eeeeee;white-space:nowrap;">${esc(label)}</td>
      <td style="padding:10px 14px;color:#1a1a1a;font-size:13px;font-weight:600;border-bottom:1px solid #eeeeee;">${esc(value)}</td>
    </tr>`;

  let customRows = "";
  if (Array.isArray(customFields) && customFields.length > 0) {
    const customs = customFields
      .map((f) => ({ key: String(f?.key ?? "").trim(), label: String(f?.label ?? "").trim() }))
      .filter((f) => f.key && f.label);
    if (customs.length > 0) {
      customRows += `
        <tr>
          <td colspan="2" style="padding:10px 14px 4px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#999999;border-bottom:1px solid #eeeeee;">
            Additional Information
          </td>
        </tr>`;
      customs.forEach((f, i) => {
        const val = String((extraFieldsPlain ?? {})[f.key] ?? "") || "—";
        customRows += tableRow(f.label, val, i % 2 === 0);
      });
    }
  }

  const addr = String(row.address ?? "").trim() || "—";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.10);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:28px 32px;">
            <p style="margin:0;color:#93c5fd;font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;">New Appointment Booked</p>
            <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:700;line-height:1.3;">${esc(formTitle)}</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${tableRow("Client Name",       row.clientName,       true)}
              ${tableRow("Phone",             row.phone,            false)}
              ${tableRow("Email",             row.email,            true)}
              ${tableRow("Address",           addr,                 false)}
              ${tableRow("Appointment Type",  row.appointmentTitle, true)}
              ${tableRow("Appointment Date",  row.slotDate,         false)}
              ${tableRow("Time Slot",         `${row.slotStart} – ${row.slotEnd}`, true)}
              ${tableRow("Booked On",         row.bookedAt,         false)}
              ${customRows}
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8f9fa;padding:16px 32px;border-top:1px solid #eeeeee;">
            <p style="margin:0;color:#999999;font-size:12px;">
              Full booking details are attached as a CSV file. You can open it directly in Excel or Google Sheets.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plain-text fallback
// ─────────────────────────────────────────────────────────────────────────────
function buildBookingNotificationText({ formTitle, row, extraFieldsPlain, customFields }) {
  const lines = [
    `New Appointment — ${formTitle}`,
    "=".repeat(50),
    `Client Name    : ${row.clientName}`,
    `Phone          : ${row.phone}`,
    `Email          : ${row.email}`,
    `Address        : ${String(row.address ?? "").trim() || "—"}`,
    `Appointment    : ${row.appointmentTitle}`,
    `Date           : ${row.slotDate}`,
    `Time Slot      : ${row.slotStart} – ${row.slotEnd}`,
    `Booked On      : ${row.bookedAt}`,
  ];

  if (Array.isArray(customFields)) {
    const customs = customFields
      .map((f) => ({ key: String(f?.key ?? "").trim(), label: String(f?.label ?? "").trim() }))
      .filter((f) => f.key && f.label);
    if (customs.length > 0) {
      lines.push("", "Additional Information:");
      for (const f of customs) {
        const val = String((extraFieldsPlain ?? {})[f.key] ?? "") || "—";
        lines.push(`  ${f.label.padEnd(14)}: ${val}`);
      }
    }
  }

  lines.push("", "Full export attached as CSV.");
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main: send instant booking notification (always fires, fire-and-forget safe)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {object} booking  - Mongoose booking document
 * @param {object} slot     - Populated slot document/lean
 * @param {object} form     - Form lean object with { title, customFields }
 */
export async function sendNewBookingRowCsvToRecipients(booking, slot, form) {
  if (process.env.NODE_ENV === "test") {
    return { skipped: true, reason: "test" };
  }

  // Respect the BOOKING_CSV_EMAIL_ENABLED flag (defaults to true when not set)
  const csvEnabled = String(process.env.BOOKING_CSV_EMAIL_ENABLED ?? "true").toLowerCase();
  if (csvEnabled === "false" || csvEnabled === "0" || csvEnabled === "no") {
    logger.info("[booking-csv-email] SKIP: BOOKING_CSV_EMAIL_ENABLED is disabled");
    return { skipped: true, reason: "disabled" };
  }

  const transport = getMailTransport();
  if (!transport) {
    logger.warn(
      "[booking-csv-email] SKIP: EMAIL_USER or EMAIL_PASS missing/invalid — no SMTP transport",
    );
    return { skipped: true, reason: "no_mailer" };
  }

  // Only send to form-specific email recipients
  const allRecipients = Array.isArray(form?.emailRecipients)
    ? form.emailRecipients.filter((e) => typeof e === "string" && e.includes("@"))
    : [];

  if (!allRecipients.length) {
    logger.warn(
      "[booking-csv-email] SKIP: no recipients — add email addresses to this form's notification settings",
    );
    return { skipped: true, reason: "no_recipients" };
  }

  // Normalise form arg (accept both object and plain title string for backwards compat)
  const formTitle      = typeof form === "string" ? form : String(form?.title ?? "");
  const customFields   = typeof form === "string" ? [] : (form?.customFields ?? []);

  const plain =
    typeof booking?.toObject === "function"
      ? booking.toObject({ flattenMaps: true })
      : { ...(booking ?? {}) };

  const extraFieldsPlain =
    plain.extraFields && typeof plain.extraFields === "object" ? plain.extraFields : {};

  const row = mapBookingLeanToCsvRow({
    ...plain,
    slotId: slot,
    formId: { title: formTitle },
  });

  const csvContent = buildBookingInstantCsv(row, extraFieldsPlain, customFields);
  const bookingId  = String(booking._id ?? booking.id ?? "new");

  logger.info(
    `[booking-csv-email] Sending booking=${bookingId} to ${allRecipients.length} recipient(s) (${formSpecificEmails.length} form-specific)`,
  );

  const { user: fromAddr } = getGmailAuthFromEnv();
  const subject = `New Appointment — "${String(formTitle).slice(0, 70)}" | ${row.clientName}`;
  const htmlBody  = buildBookingNotificationHtml({ formTitle, row, extraFieldsPlain, customFields });
  const textBody  = buildBookingNotificationText({ formTitle, row, extraFieldsPlain, customFields });

  let sent = 0;
  for (const to of allRecipients) {
    try {
      await transport.sendMail({
        from:    getFromAddress(fromAddr),
        to,
        subject,
        text:    textBody,
        html:    htmlBody,
        attachments: [
          {
            filename:    `booking-${bookingId}.csv`,
            content:     csvContent,
            contentType: "text/csv; charset=utf-8",
          },
        ],
      });
      sent += 1;
    } catch (err) {
      logger.error(
        `[booking-csv-email] SMTP FAILED to=${to}: ${err?.message ?? err}`,
      );
    }
  }

  if (sent) {
    logger.info(
      `[booking-csv-email] OK: ${sent}/${allRecipients.length} delivered`,
    );
  } else {
    logger.warn(
      "[booking-csv-email] FAIL: 0 mails — check SMTP / App Password",
    );
  }

  return { sent, recipientsAttempted: allRecipients.length };
}
