import { stringify } from "csv-stringify/sync";

/** Display timings in CSV/open in Excel — India wall clock unless overridden. */
const CSV_BOOKED_AT_ZONE =
  process.env.BOOKING_CSV_DISPLAY_TZ?.trim() || "Asia/Kolkata";

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function bookedAtToMs(raw) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.getTime();
  const n = Date.parse(String(raw ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Slot `date` in DB — calendar row as UTC Gregorian day → "22 May 2026" for spreadsheets.
 */
function formatSlotCalendarForCsv(slotDateRaw) {
  const d =
    slotDateRaw instanceof Date ? slotDateRaw : new Date(slotDateRaw);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getUTCDate();
  const mon = MONTH_SHORT[d.getUTCMonth()] ?? "";
  const y = d.getUTCFullYear();
  return `${day} ${mon} ${y}`;
}

/** Stored HH:mm (24h) → "10:30 AM" (2-digit hour for tidy Excel columns). */
function formatWallTime12h(timeHHMM) {
  const s = String(timeHHMM ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return s;
  let h = Number(m[1]);
  const min = m[2];
  if (!Number.isFinite(h) || h > 23 || h < 0) return s;
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  const hh = String(h).padStart(2, "0");
  return `${hh}:${min} ${period}`;
}

/**
 * Booking instant → "22 May 2026, 3:45 PM" in `CSV_BOOKED_AT_ZONE` for Excel readability.
 */
function formatBookedAtForCsv(bookedRaw) {
  const d =
    bookedRaw instanceof Date ? bookedRaw : new Date(bookedRaw);
  if (Number.isNaN(d.getTime())) return "";
  const fmt = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: CSV_BOOKED_AT_ZONE,
  });
  const parts = fmt.formatToParts(d);
  const o = {};
  for (const p of parts) {
    if (p.type !== "literal") o[p.type] = p.value;
  }
  const ap = String(o.dayPeriod ?? "").toUpperCase();
  const day = o.day ?? "";
  const mo = o.month ?? "";
  const year = o.year ?? "";
  const hour = o.hour ?? "";
  const minute = o.minute ?? "";
  if (!day || !mo || !year)
    return fmt.format(d);
  let out = `${day} ${mo} ${year}`;
  if (hour !== undefined && minute !== undefined) {
    const hp = /^(\d{1,2})$/.exec(String(hour).trim());
    const hourTidy = hp ? String(Number(hp[1])).padStart(2, "0") : hour;
    out += `, ${hourTidy}:${minute}${ap ? ` ${ap}` : ""}`;
  }
  return out;
}

/**
 * Booking CSV for admin export, digest mail, expiry mail — unified columns (no address / extraFields).
 * Excel-oriented: readable headers, CRLF rows, `\ufeff` added by callers (`withUtf8Bom`).
 * `slotDate` / times / `bookedAt`: human-readable (see BOOKING_CSV_DISPLAY_TZ, default Asia/Kolkata).
 * `bookedAtMs` is digest sort only — never emitted as a CSV column.
 */
export const BOOKING_EXPORT_COLUMNS = [
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

/** Stable Excel-friendly CSV (Windows line breaks; quote fields when delimiter/newline appears). */
const stringifyBookingCsv = (rows, { header }) =>
  stringify(rows, {
    header,
    columns: BOOKING_EXPORT_COLUMNS,
    delimiter: ",",
    record_delimiter: "\r\n",
    quoted_empty: false,
  });

/**
 * Booking lean/populated doc → flat row (populate slotId + formId recommended).
 */
export function mapBookingLeanToCsvRow(bookingLean) {
  const slot = bookingLean?.slotId;
  const form = bookingLean?.formId;
  const ms = bookedAtToMs(bookingLean?.bookedAt);
  return {
    formTitle:        form?.title ?? "",
    appointmentTitle: bookingLean?.inquiryType ?? "",
    clientName:       bookingLean?.name ?? "",
    phone:            bookingLean?.phone ?? "",
    email:            bookingLean?.email ?? "",
    address:          bookingLean?.address ?? "",
    bookedAt:         formatBookedAtForCsv(bookingLean?.bookedAt),
    bookedAtMs:       ms,
    slotDate:         formatSlotCalendarForCsv(slot?.date),
    slotStart:        formatWallTime12h(slot?.startTime),
    slotEnd:          formatWallTime12h(slot?.endTime),
  };
}

/** Digest CSV: sort by form title ascending, then newest bookings first within each form. */
export function sortCsvRowsForDigest(rows) {
  return [...rows].sort((a, b) => {
    const cmp = String(a.formTitle ?? "").localeCompare(String(b.formTitle ?? ""));
    if (cmp !== 0) return cmp;
    const tb = Number(b.bookedAtMs) || 0;
    const ta = Number(a.bookedAtMs) || 0;
    return tb - ta;
  });
}

export function stringifyBookingRowsCsv(rows) {
  return stringifyBookingCsv(rows, { header: true });
}

/** Header row line only (same columns); safe for stacking blocks in Excel. */
export function stringifyBookingCsvHeadersLineOnly() {
  const s = stringifyBookingCsv([], { header: true });
  return String(s).replace(/[\r\n]+$/, "");
}

/** Data rows only (repeat the header line separately for each stacked block). */
export function stringifyBookingRowsCsvWithoutHeader(rows) {
  if (!rows.length) return "";
  const s = stringifyBookingCsv(rows, { header: false });
  return String(s).replace(/[\r\n]+$/, "");
}

/**
 * One CSV line: short section label in the Form column only (others empty).
 */
export function bookingCsvBannerRow(note = "") {
  const row = Object.fromEntries(
    BOOKING_EXPORT_COLUMNS.map(({ key }) => [key, ""]),
  );
  row.formTitle = String(note ?? "").trim();
  const s = stringifyBookingCsv([row], { header: false });
  return String(s).replace(/[\r\n]+$/, "");
}

/**
 * Build full column list including dynamic custom field columns.
 * Deduplicates by key across all forms' customFields.
 */
export function buildCsvColumnsWithCustomFields(customFieldsArrays) {
  const seen = new Set();
  const extraCols = [];
  for (const arr of customFieldsArrays) {
    if (!Array.isArray(arr)) continue;
    for (const cf of arr) {
      const key = String(cf?.key ?? "").trim();
      const label = String(cf?.label ?? key).trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      extraCols.push({ key: `cf_${key}`, header: label });
    }
  }
  const insertAt = BOOKING_EXPORT_COLUMNS.findIndex((c) => c.key === "address");
  const before = BOOKING_EXPORT_COLUMNS.slice(0, insertAt);
  const after  = BOOKING_EXPORT_COLUMNS.slice(insertAt);
  return [...before, ...extraCols, ...after];
}

/**
 * Attach extra field values to a CSV row as `cf_{key}` properties.
 */
export function addExtraFieldsToRow(row, extraFields) {
  if (!extraFields || typeof extraFields !== "object") return row;
  for (const [key, val] of Object.entries(extraFields)) {
    const k = String(key ?? "").trim();
    if (!k) continue;
    row[`cf_${k}`] = String(val ?? "");
  }
  return row;
}

/**
 * Stringify CSV rows with a custom column definition (for dynamic extra-field columns).
 */
export function stringifyBookingCsvWithCols(rows, { columns }) {
  return stringify(rows, {
    header: true,
    columns,
    delimiter: ",",
    record_delimiter: "\r\n",
    quoted_empty: false,
  });
}

const EOL_DIGEST = "\r\n";

/** Digest CSV: rolling block first; if older rows exist · spacer · second block + header repeat. */
export function buildAppointmentDigestCombinedCsvPlain({
  rollingWindowRowsSorted,
  earlierRowsSorted,
  rollingBannerNote,
  earlierBannerNote,
  spacerBlankCsvLinesBetweenSections = 1,
}) {
  const parts = [];
  parts.push(bookingCsvBannerRow(rollingBannerNote));
  parts.push(stringifyBookingCsvHeadersLineOnly());
  if (rollingWindowRowsSorted.length > 0) {
    parts.push(stringifyBookingRowsCsvWithoutHeader(rollingWindowRowsSorted));
  }

  if (earlierRowsSorted.length > 0) {
    const blanks = Number(spacerBlankCsvLinesBetweenSections);
    const nBlank = Number.isFinite(blanks) && blanks >= 0 ? blanks : 0;
    parts.push("", ...Array.from({ length: nBlank }, () => ""));
    parts.push(bookingCsvBannerRow(earlierBannerNote));
    parts.push(stringifyBookingCsvHeadersLineOnly());
    parts.push(stringifyBookingRowsCsvWithoutHeader(earlierRowsSorted));
  }

  const body = parts
    .map((chunk) =>
      chunk === ""
        ? ""
        : chunk.replace(/^[\r\n]+/, "").replace(/[\r\n]+$/, ""),
    )
    .join(EOL_DIGEST);
  return body + EOL_DIGEST;
}
