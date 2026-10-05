import { slotRepository } from "../repositories/slot.repository.js";
import { formRepository } from "../repositories/form.repository.js";
import { AppError } from "../utils/app-error.js";
import {
  resolveFormBusinessTimeZone,
  slotLocalTimeToUtcIso,
} from "../utils/timezone.js";

export class SlotService {
  async getAllSlotsForBookingPage(formId, date) {
    const form = await formRepository.findPublicById(formId);
    if (!form) {
      throw new AppError("Form not found", 404);
    }
    const items = date
      ? await slotRepository.findByFormIdAndDate(formId, date)
      : await slotRepository.findByFormId(formId);

    // Interpret slot calendar day + HH:mm in business TZ (default Asia/Kolkata on UTC-hosted servers).
    const timeZone = resolveFormBusinessTimeZone({ form });

    const nowMs = Date.now();
    const mapped = items.map((slot) => ({
      ...slot,
      startUtc: slotLocalTimeToUtcIso({
        slotDate: slot.date,
        timeHHMM: slot.startTime,
        timeZone,
      }),
      endUtc: slotLocalTimeToUtcIso({
        slotDate: slot.date,
        timeHHMM: slot.endTime,
        timeZone,
      }),
      timeZone,
    }));

    // Hide slots that already started (compare instants — server clock is authoritative).
    return mapped.filter((slot) => Date.parse(slot.startUtc) > nowMs);
  }

  getSlotsByFormId(formId) {
    return slotRepository.findAllByFormId(formId);
  }

  async setSlotActive(slotId, isActive) {
    const slot = await slotRepository.setSlotActive(slotId, isActive);
    if (!slot) {
      throw new AppError(
        "Slot not found or has existing bookings and cannot be changed",
        400,
      );
    }
    return slot;
  }
}

export const slotService = new SlotService();
