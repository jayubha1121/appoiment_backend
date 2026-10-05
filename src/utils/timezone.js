function partsToObject(parts) {
  const out = {};
  for (const p of parts) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return out;
}

function getTimeZoneOffsetMinutes(date, timeZone) {
  // Returns the offset of `timeZone` at `date` in minutes, i.e.
  // localTime(timeZone) = utcTime + offsetMinutes
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = partsToObject(dtf.formatToParts(date));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - date.getTime()) / 60000;
}

function zonedDateTimeToUtcMs({ year, month, day, hour, minute, second, timeZone }) {
  // Start with a UTC guess then correct by the timezone offset.
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let offset = getTimeZoneOffsetMinutes(new Date(guess), timeZone);
  let corrected = guess - offset * 60000;

  // One more pass handles DST transitions (not used in Asia/Kolkata, but keeps this generic).
  offset = getTimeZoneOffsetMinutes(new Date(corrected), timeZone);
  corrected = guess - offset * 60000;
  return corrected;
}

/**
 * Timezone used to interpret stored slot date + start/end HH:mm for the **public booking** flow.
 * Order: form field → BUSINESS_TZ → Asia/Kolkata.
 * Kolkata default fits India operators while hosts (e.g. Railway) stay on UTC clock.
 *
 * @param {object} [options]
 * @param {{ businessTimeZone?: string|null }} [options.form] Public form doc from DB (optional).
 */
export function resolveFormBusinessTimeZone({ form } = {}) {
  const fromForm = form?.businessTimeZone && String(form.businessTimeZone).trim();
  if (fromForm) return fromForm;
  const fromEnv = process.env.BUSINESS_TZ && String(process.env.BUSINESS_TZ).trim();
  if (fromEnv) return fromEnv;
  return "Asia/Kolkata";
}

export function detectServerTimeZone() {
  // Prefer the standard `TZ` env var (widely supported by Node hosts).
  const tzFromEnv = String(process.env.TZ ?? "").trim();
  if (tzFromEnv) return tzFromEnv;

  // Best-effort auto-detection from the runtime.
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof tz === "string" && tz.trim()) return tz.trim();
  } catch {
    // ignore
  }

  // Safe fallback when timezone can't be detected.
  return "UTC";
}

/**
 * Interpret a calendar date + wall time in an IANA timezone and return the instant as ISO UTC.
 * Used so booking link expiry is defined in the admin's zone but stored and checked on the server.
 */
export function wallClockExpiryToUtcIso({ dateStr, timeHHmm, timeZone }) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr ?? "").trim());
  const tm = /^(\d{2}):(\d{2})$/.exec(
    String(timeHHmm ?? "")
      .trim()
      .slice(0, 5),
  );
  if (!dm || !tm) {
    throw new Error("INVALID_WALL_CLOCK");
  }
  const year = Number(dm[1]);
  const month = Number(dm[2]);
  const day = Number(dm[3]);
  const hour = Number(tm[1]);
  const minute = Number(tm[2]);
  const tz = String(timeZone ?? "").trim();
  if (!tz) {
    throw new Error("INVALID_TIMEZONE");
  }
  const utcMs = zonedDateTimeToUtcMs({
    year,
    month,
    day,
    hour,
    minute,
    second: 0,
    timeZone: tz,
  });
  return new Date(utcMs).toISOString();
}

export function slotLocalTimeToUtcIso({ slotDate, timeHHMM, timeZone }) {
  const d = new Date(slotDate);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();

  const [hRaw, mRaw] = String(timeHHMM ?? "").split(":");
  const hour = Number(hRaw ?? 0) || 0;
  const minute = Number(mRaw ?? 0) || 0;

  const utcMs = zonedDateTimeToUtcMs({
    year,
    month,
    day,
    hour,
    minute,
    second: 0,
    timeZone,
  });

  return new Date(utcMs).toISOString();
}

