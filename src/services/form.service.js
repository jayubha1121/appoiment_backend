import { formRepository } from "../repositories/form.repository.js";
import { AppError } from "../utils/app-error.js";
import { wallClockExpiryToUtcIso } from "../utils/timezone.js";
import { SlotModel } from "../models/Slot.js";
import { buildSlotDocsForRange } from "./slot-generator.js";

export class FormService {
  // =========================
  // CREATE FORM
  // =========================

  createForm(data) {
    const payload = { ...data };
    const dateStr = String(payload.bookingLinkExpiresDate ?? "").trim();
    const timeStr = String(payload.bookingLinkExpiresTime ?? "").trim().slice(0, 5);
    const tz = String(payload.bookingLinkExpiresTimeZone ?? "").trim();

    if (!dateStr || !timeStr || !tz) {
      throw new AppError(
        "bookingLinkExpiresDate, bookingLinkExpiresTime, and bookingLinkExpiresTimeZone are required",
        400,
      );
    }

    let iso;
    try {
      iso = wallClockExpiryToUtcIso({ dateStr, timeHHmm: timeStr, timeZone: tz });
    } catch {
      throw new AppError("Invalid public link close date, time, or timezone", 400);
    }

    const linkExp = new Date(iso);
    const activeFrom = new Date(payload.activeFrom);

    if (Number.isNaN(linkExp.getTime()) || Number.isNaN(activeFrom.getTime())) {
      throw new AppError("Invalid dates", 400);
    }

    if (linkExp < activeFrom) {
      throw new AppError("Public link expiry must be on or after activeFrom", 400);
    }

    const cap = new Date(activeFrom);
    cap.setUTCFullYear(cap.getUTCFullYear() + 2);

    if (linkExp > cap) {
      throw new AppError("Public link expiry is too far in the future (max 2 years from start)", 400);
    }

    const now = new Date();
    if (linkExp.getTime() < now.getTime() - 60_000) {
      throw new AppError("Public link expiry must be in the future", 400);
    }

    payload.bookingLinkExpiresAt = iso;
    delete payload.bookingLinkExpiresDate;
    delete payload.bookingLinkExpiresTime;
    // Carry the timezone as the business timezone for slot UTC conversion.
    payload.businessTimeZone = String(payload.bookingLinkExpiresTimeZone ?? "").trim() || process.env.BUSINESS_TZ || "Asia/Kolkata";
    delete payload.bookingLinkExpiresTimeZone;

    return formRepository.createWithSlots(payload);
  }

  // =========================
  // UPDATE FORM
  // =========================

  async updateForm(formId, data) {
    const form = await formRepository.update(formId, data);
    if (!form) throw new AppError("Form not found", 404);

    const scheduleFields = ["activeFrom", "activeTo", "activeWeekdays", "startHour", "endHour", "slotDuration", "slotCapacity"];
    const hasScheduleChange = scheduleFields.some((f) => f in data);

    if (hasScheduleChange) {
      await SlotModel.deleteMany({ formId: form._id, bookedCount: 0 });

      const slotDocs = buildSlotDocsForRange({
        formId: form._id,
        activeFrom: form.activeFrom,
        activeTo: form.activeTo,
        activeWeekdays: form.activeWeekdays,
        startHour: form.startHour,
        endHour: form.endHour,
        slotDuration: form.slotDuration,
        slotCapacity: form.slotCapacity,
        excludedSlotTimes: [],
      });

      if (slotDocs.length > 0) {
        await SlotModel.insertMany(slotDocs);
      }
    }

    return form;
  }

  // =========================
  // DELETE FORM
  // =========================

  async deleteForm(formId) {
    const form = await formRepository.deleteCascade(formId);
    if (!form) throw new AppError("Form not found", 404);
    return { id: formId };
  }

  // =========================
  // GET PUBLIC FORM
  // =========================

  async getPublicForm(formId) {
    const form = await formRepository.findByIdAndTrackVisit(formId);
    if (!form) throw new AppError("Form not found", 404);
    return form;
  }

  // =========================
  // GET ALL FORMS
  // =========================

  getAllForms() {
    return formRepository.findAllWithStats();
  }
}

export const formService = new FormService();
