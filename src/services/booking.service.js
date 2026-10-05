import { bookingRepository } from "../repositories/booking.repository.js";
import { slotRepository } from "../repositories/slot.repository.js";
import { formRepository } from "../repositories/form.repository.js";
import { AppError } from "../utils/app-error.js";
import { googleCalendarService } from "./google-calendar.service.js";
import { whatsAppService } from "./whatsapp.service.js";
import { IntegrationModel } from "../models/Integration.js";

import {
  resolveFormBusinessTimeZone,
  slotLocalTimeToUtcIso,
} from "../utils/timezone.js";

import { sendNewBookingRowCsvToRecipients } from "./booking-csv-email.service.js";

export class BookingService {
  normalizeExtraFieldText(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase();
  }

  collectExtraFieldEntries(form, extraFields) {
    const seen = new Set();
    const entries = [];

    if (Array.isArray(form?.customFields)) {
      for (const field of form.customFields) {
        const key = String(field?.key ?? "").trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);

        const value = String(extraFields?.[key] ?? "").trim();
        if (!value) continue;

        entries.push({
          key,
          label: String(field?.label ?? key).trim(),
          value,
          searchText: this.normalizeExtraFieldText(`${field?.label ?? ""} ${key}`),
        });
      }
    }

    for (const [rawKey, rawValue] of Object.entries(extraFields ?? {})) {
      const key = String(rawKey ?? "").trim();
      if (!key || seen.has(key)) continue;

      const value = String(rawValue ?? "").trim();
      if (!value) continue;

      entries.push({
        key,
        label: key,
        value,
        searchText: this.normalizeExtraFieldText(key),
      });
    }

    return entries;
  }

  pickExtraFieldValue(entries, keywords, fallbackIndex = 0) {
    const match = entries.find((entry) =>
      keywords.some((keyword) => entry.searchText.includes(keyword)),
    );

    if (match?.value) return match.value;
    return entries[fallbackIndex]?.value || "";
  }

  resolveWhatsAppTemplateFields(form, extraFields) {
    const entries = this.collectExtraFieldEntries(form, extraFields);
    const orderedValues = entries.map((entry) => entry.value).filter(Boolean);

    return {
      block: this.pickExtraFieldValue(entries, ["block", "tower", "wing", "building", "phase", "section"], 0) || "N/A",
      number: this.pickExtraFieldValue(entries, ["number", "flat", "unit", "apartment", "house", "villa", "plot", "shop", "office", "room", "deed", "door"], 1) || orderedValues[0] || "N/A",
      extra1: orderedValues[0] || "",
      extra2: orderedValues[1] || "",
      extra3: orderedValues[2] || "",
    };
  }

  validateInquiryType(form, inquiryTypeRaw) {
    const inquiryType = String(inquiryTypeRaw ?? "").trim();

    if (!inquiryType || inquiryType.length > 120) {
      throw new AppError("Invalid inquiry type", 400);
    }

    const presets = Array.isArray(form.inquiryTypes)
      ? form.inquiryTypes
          .map((x) => String(x).trim())
          .filter(Boolean)
      : [];

    const allowCustom = Boolean(form.inquiryAllowCustom);

    if (!allowCustom) {
      if (!presets.includes(inquiryType)) {
        throw new AppError(
          "Invalid inquiry type for this form",
          400
        );
      }
    }

    return inquiryType;
  }

  async createBooking(data) {
    const form = await formRepository.findPublicById(
      data.formId
    );

    if (!form) {
      throw new AppError("Form not found", 404);
    }

    const inquiryType =
      this.validateInquiryType(
        form,
        data.inquiryType
      );

    const extraFields =
      data.extraFields &&
      typeof data.extraFields === "object"
        ? data.extraFields
        : {};

    const requiredFields = Array.isArray(
      form.customFields
    )
      ? form.customFields.filter(
          (f) => f?.required
        )
      : [];

    for (const f of requiredFields) {
      const key = String(f.key ?? "").trim();

      if (!key) continue;

      const value = (
        extraFields &&
        key in extraFields
          ? String(extraFields[key] ?? "")
          : ""
      ).trim();

      if (!value) {
        throw new AppError(
          `Missing required field: ${
            String(f.label ?? key)
          }`,
          400
        );
      }
    }

    const slot =
      await slotRepository.findById(
        data.slotId
      );

    if (!slot) {
      throw new AppError("Slot not found", 404);
    }

    if (
      slot.formId.toString() !== data.formId
    ) {
      throw new AppError(
        "Slot does not belong to the selected form",
        400
      );
    }

    const timeZone =
      resolveFormBusinessTimeZone({
        form,
      });

    const slotStartIso =
      slotLocalTimeToUtcIso({
        slotDate: slot.date,
        timeHHMM: slot.startTime,
        timeZone,
      });

    if (
      Date.parse(slotStartIso) <= Date.now()
    ) {
      throw new AppError(
        "That slot time has already passed — pick a later slot.",
        400
      );
    }

    const booking =
      await bookingRepository.bookSlot(
        data.slotId,
        {
          ...data,
          inquiryType,
          address:
            data.address != null
              ? String(data.address)
              : "",
          extraFields,
        }
      );

    const whatsappFields = this.resolveWhatsAppTemplateFields(form, extraFields);

    // ─── Customer WhatsApp ────────────────────────────────

    whatsAppService
      .sendBookingConfirmation({
        phone: booking.phone,
        name: booking.name,

        slotDate: slot.date,

        startTime: slot.startTime,
        endTime: slot.endTime,

        inquiryType:
          booking.inquiryType,

        formTitle: form.title,

        templateName:
          String(form.whatsappClientTemplateName || form.whatsappTemplateName || "booking_confirm").trim(),

        block: whatsappFields.block,
        number: whatsappFields.number,

        extra1: whatsappFields.extra1,

        extra2: whatsappFields.extra2,

        extra3: whatsappFields.extra3,
      })

      .catch((err) => {
        console.error(
          "[WhatsApp] Error:",
          err?.message ?? err
        );
      });

    // ─── Staff WhatsApp Notifications ─────────────────────

    const waPhones = Array.isArray(
      form.whatsappPhones
    )
      ? form.whatsappPhones.filter(
          (p) =>
            String(p ?? "").trim()
        )
      : [];

    if (waPhones.length > 0) {
      const waTpl = String(
        form.whatsappTemplateName ||
          process.env.WATI_TEMPLATE_NAME ||
          "booking__confirm"
      ).trim();

      void whatsAppService
        .sendStaffNotifications(
          waPhones,
          waTpl,
          {
            name: booking.name,

            slotDate: slot.date,

            startTime:
              slot.startTime,

            endTime:
              slot.endTime,

            inquiryType:
              booking.inquiryType,

            formTitle:
              form.title,

            block: whatsappFields.block,

            number:
              whatsappFields.number,

            extra1: whatsappFields.extra1,

            extra2: whatsappFields.extra2,

            extra3: whatsappFields.extra3,
          }
        )

        .catch((err) => {
          console.error(
            "[WhatsApp] Staff notify error:",
            err?.message ?? err
          );
        });
    }

    // ─── Email Notifications ──────────────────────────────

    void sendNewBookingRowCsvToRecipients(
      booking,
      slot,
      form
    ).catch((err) => {
      console.error(
        "[booking-csv-email] Error:",
        err?.message ?? err
      );
    });

    // ─── Google Calendar ──────────────────────────────────

    try {
      const integrations =
        await IntegrationModel.find({
          provider: "google",
          isActive: true,
          refreshToken: {
            $ne: "",
          },
        })
          .lean()
          .limit(25);

      const slotDate = new Date(
        slot.date
      );

      const year =
        slotDate.getUTCFullYear();

      const month = String(
        slotDate.getUTCMonth() + 1
      ).padStart(2, "0");

      const day = String(
        slotDate.getUTCDate()
      ).padStart(2, "0");

      const dateStr =
        `${year}-${month}-${day}`;

      const timezone =
        resolveFormBusinessTimeZone({
          form,
        });

      const startLocalStr =
        `${dateStr}T${slot.startTime}:00`;

      const endLocalStr =
        `${dateStr}T${slot.endTime}:00`;

      const title =
        `${form.title} — ${booking.name}`;

      const addr = String(
        booking.address ?? ""
      ).trim();

      const description = [
        `Name: ${booking.name}`,
        `Phone: ${booking.phone}`,
        `Email: ${booking.email}`,
        `Inquiry: ${booking.inquiryType}`,

        ...(addr
          ? [`Address: ${addr}`]
          : []),

        `Slot: ${slot.startTime} - ${slot.endTime}`,

        ...Object.entries(
          extraFields
        )
          .filter(([k, v]) =>
            String(v ?? "").trim()
          )

          .map(
            ([k, v]) =>
              `${k}: ${String(v ?? "").trim()}`
          ),
      ].join("\n");

      await Promise.all(
        integrations.map(
          (integration) =>
            googleCalendarService.createEventForBooking(
              {
                integration,
                title,
                description,
                startIso:
                  startLocalStr,
                endIso:
                  endLocalStr,
                timezone,
              }
            )
        )
      );
    } catch {
      // ignore
    }

    return booking;
  }

  getAllBookings(filters) {
    return bookingRepository.findAll(
      filters
    );
  }

  getBookingsForExport(filters) {
    return bookingRepository.findAllForExport(
      filters
    );
  }

  deleteBooking(bookingId) {
    return bookingRepository.deleteById(
      bookingId
    );
  }
}

export const bookingService =
  new BookingService();