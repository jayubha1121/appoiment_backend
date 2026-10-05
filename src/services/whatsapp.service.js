import { logger } from "../utils/logger.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatPhone(phone) {
  let digits = String(phone ?? "").replace(/\D/g, "");

  if (!digits) return null;

  if (digits.length === 10) {
    digits = "91" + digits;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = "91" + digits.slice(1);
  }

  if (digits.length < 10 || digits.length > 15) {
    logger.warn(`[WhatsApp] Invalid phone: ${phone}`);
    return null;
  }

  return digits;
}

function formatDate(dateInput) {
  try {
    let day, month, year;

    if (dateInput instanceof Date) {
      day = dateInput.getUTCDate();
      month = dateInput.getUTCMonth();
      year = dateInput.getUTCFullYear();
    } else {
      const str = String(dateInput ?? "").trim();
      const parts = str.split("T")[0].split("-");

      year = parseInt(parts[0]);
      month = parseInt(parts[1]) - 1;
      day = parseInt(parts[2]);
    }

    if (isNaN(day) || isNaN(month) || isNaN(year)) {
      return String(dateInput);
    }

    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    return `${day} ${months[month]} ${year}`;
  } catch (err) {
    logger.warn(`[WhatsApp] Date format error: ${err.message}`);
    return String(dateInput);
  }
}

function formatTime(time24) {
  try {
    const [hourStr, minuteStr] = String(time24 ?? "").split(":");

    let hour = parseInt(hourStr);
    const minute = minuteStr ?? "00";

    if (isNaN(hour)) return time24;

    const ampm = hour >= 12 ? "PM" : "AM";

    if (hour === 0) {
      hour = 12;
    } else if (hour > 12) {
      hour = hour - 12;
    }

    return `${hour}:${minute} ${ampm}`;
  } catch {
    return time24;
  }
}

function safe(value, fallback = "N/A") {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    String(value).trim() === ""
  ) {
    return fallback;
  }

  return String(value).trim();
}

// ─── Service ────────────────────────────────────────────────────────────────

export class WhatsAppService {
  async sendBookingConfirmation({
    phone,
    name,
    slotDate,
    startTime,
    endTime,
    inquiryType,
    formTitle,
    templateName,

    // extra dynamic fields
    block,
    number,
    extra1,
    extra2,
    extra3,
  }) {
    const endpoint = String(
      process.env.WATI_API_ENDPOINT ?? ""
    ).trim();

    const token = String(
      process.env.WATI_ACCESS_TOKEN ?? ""
    ).trim();

    const template = String(
      templateName ??
      process.env.WATI_TEMPLATE_NAME ??
      "booking__confirm"
    ).trim();

    if (!endpoint || !token) {
      logger.warn(
        "[WhatsApp] Missing WATI credentials"
      );

      return { skipped: true };
    }

    const waNumber = formatPhone(phone);

    if (!waNumber) {
      logger.warn(
        `[WhatsApp] Invalid phone: ${phone}`
      );

      return { skipped: true };
    }

    const dateReadable = formatDate(slotDate);

    const timeReadable =
      `${formatTime(startTime)} - ${formatTime(endTime)}`;

    const project =
      inquiryType ||
      formTitle ||
      "General";

    logger.info(
      `[WhatsApp] Date: ${dateReadable} | Time: ${timeReadable}`
    );

    // Dynamic parameters
    const parameters = [
      {
        name: "1",
        value: safe(name),
      },
      {
        name: "2",
        value: safe(dateReadable),
      },
      {
        name: "3",
        value: safe(timeReadable),
      },
      {
        name: "4",
        value: safe(project),
      },
      {
        name: "5",
        value: safe(block),
      },
      {
        name: "6",
        value: safe(number),
      },
      {
        name: "7",
        value: safe(formTitle),
      },
      {
        name: "8",
        value: safe(extra1),
      },
      {
        name: "9",
        value: safe(extra2),
      },
      {
        name: "10",
        value: safe(extra3),
      },
    ];

    logger.info(
      `[WhatsApp] Sending to ${waNumber} (${name}) via ${template}`
    );

    logger.info(
      `[WhatsApp] Parameters: ${JSON.stringify(parameters)}`
    );

    const body = {
      template_name: template,
      broadcast_name: `Booking-${safe(name)}`,
      parameters,
    };

    const url =
      `${endpoint.replace(/\/$/, "")}` +
      `/api/v1/sendTemplateMessage?whatsappNumber=${waNumber}`;

    try {
      const res = await fetch(url, {
        method: "POST",

        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },

        body: JSON.stringify(body),
      });

      const text = await res.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      if (!res.ok) {
        logger.error(
          `[WhatsApp] Wati error ${res.status}: ${text}`
        );

        return {
          success: false,
          status: res.status,
          data,
        };
      }

      logger.info(
        `[WhatsApp] Message sent OK to ${waNumber}`
      );

      return {
        success: true,
        data,
      };
    } catch (err) {
      logger.error(
        `[WhatsApp] Network error: ${err.message}`
      );

      return {
        success: false,
        error: err.message,
      };
    }
  }

  async sendStaffNotifications(
    phones,
    templateName,
    bookingData
  ) {
    const endpoint = String(
      process.env.WATI_API_ENDPOINT ?? ""
    ).trim();

    const token = String(
      process.env.WATI_ACCESS_TOKEN ?? ""
    ).trim();

    if (!endpoint || !token) {
      logger.warn(
        "[WhatsApp] Staff notify skipped"
      );

      return;
    }

    const tpl =
      String(templateName ?? "").trim() ||
      process.env.WATI_TEMPLATE_NAME ||
      "booking__confirm";

    const results = [];

    for (const phone of phones) {
      const p = String(phone ?? "").trim();

      if (!p) continue;

      try {
        const result =
          await this.sendBookingConfirmation({
            phone: p,
            templateName: tpl,
            ...bookingData,
          });

        results.push({
          phone: p,
          ...result,
        });
      } catch (err) {
        logger.error(
          `[WhatsApp] Staff notify failed for ${p}: ${err?.message ?? err}`
        );

        results.push({
          phone: p,
          success: false,
          error: err?.message,
        });
      }
    }

    return results;
  }
}

export const whatsAppService =
  new WhatsAppService();