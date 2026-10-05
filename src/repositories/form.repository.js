import { Types } from "mongoose";
import { BookingModel } from "../models/Booking.js";
import { FormModel } from "../models/Form.js";
import { SlotModel } from "../models/Slot.js";
import { VisitModel } from "../models/Visit.js";
import { buildSlotDocsForRange } from "../services/slot-generator.js";

function toUtcDayStart(value) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isNotExpiredByDay(form, now = new Date()) {
  const today = toUtcDayStart(now);
  const toDay = toUtcDayStart(form.activeTo);
  return today <= toDay;
}

/** Public booking link + APIs: explicit expiry wins; else last day of activeTo (legacy). */
function isPublicLinkOpen(form, now = new Date()) {
  const raw = form.bookingLinkExpiresAt;
  if (raw) {
    const exp = new Date(raw);
    if (!Number.isNaN(exp.getTime())) {
      return now.getTime() <= exp.getTime();
    }
  }
  return isNotExpiredByDay(form, now);
}

/**
 * Mirrors public booking-page access for an active row (explicit link expiry overrides;
 * otherwise last campaign day uses UTC-calendar comparison like consumers see bookable window).
 */
export function formIsEligibleForMorningDigest(form, now = new Date()) {
  return Boolean(form?.isActive) && isPublicLinkOpen(form, now);
}

export class FormRepository {
  async findPublicById(formId, now = new Date()) {
    const form = await FormModel.findOne({
      _id: new Types.ObjectId(formId),
      isActive: true,
    }).lean();
    if (!form) return null;
    return isPublicLinkOpen(form, now) ? form : null;
  }

  async createWithSlots(payload) {
    const form = await FormModel.create({
      title: payload.title,
      description: payload.description,
      customFields: Array.isArray(payload.customFields) ? payload.customFields : [],
      activeFrom: payload.activeFrom,
      activeTo: payload.activeTo,
      activeWeekdays: payload.activeWeekdays,
      startHour: payload.startHour,
      endHour: payload.endHour,
      slotDuration: payload.slotDuration,
      slotCapacity: payload.slotCapacity,
      inquiryTypes: payload.inquiryTypes,
      inquiryAllowCustom: Boolean(payload.inquiryAllowCustom),
      bookingLinkExpiresAt: payload.bookingLinkExpiresAt
        ? new Date(payload.bookingLinkExpiresAt)
        : null,
      businessTimeZone: payload.businessTimeZone || process.env.BUSINESS_TZ || "Asia/Kolkata",
      isActive: payload.isActive ?? true,
      whatsappTemplateName: payload.whatsappTemplateName || "booking_confirm",
      whatsappClientTemplateName: payload.whatsappClientTemplateName || "",
      whatsappPhones: Array.isArray(payload.whatsappPhones) ? payload.whatsappPhones : [],
      emailRecipients: Array.isArray(payload.emailRecipients) ? payload.emailRecipients : [],
    });

    const slotDocs = buildSlotDocsForRange({
      formId: form._id,
      activeFrom: form.activeFrom,
      activeTo: form.activeTo,
      activeWeekdays: form.activeWeekdays,
      startHour: form.startHour,
      endHour: form.endHour,
      slotDuration: form.slotDuration,
      slotCapacity: form.slotCapacity,
      excludedSlotTimes: Array.isArray(payload.excludedSlotTimes) ? payload.excludedSlotTimes : [],
    });

    if (slotDocs.length === 0) {
      return form.toObject();
    }

    await SlotModel.insertMany(slotDocs);
    return form.toObject();
  }

  async update(formId, data) {
    return FormModel.findByIdAndUpdate(
      formId,
      { $set: data },
      { new: true },
    ).lean();
  }

  async findById(formId) {
    return FormModel.findById(formId).lean();
  }

  async findByIdAndTrackVisit(formId) {
    const formObjectId = new Types.ObjectId(formId);
    const now = new Date();
    const form = await FormModel.findOne({
      _id: formObjectId,
      isActive: true,
    }).lean();

    if (!form || !isPublicLinkOpen(form, now)) {
      return null;
    }

    await FormModel.updateOne({ _id: formObjectId }, { $inc: { totalVisits: 1 } });
    await VisitModel.create({ formId: formObjectId });
    return {
      ...form,
      totalVisits: Number(form.totalVisits ?? 0) + 1,
    };
  }

  async findAllWithStats() {
    const forms = await FormModel.find({})
      .sort({ createdAt: -1 })
      .lean();

    if (forms.length === 0) {
      return [];
    }

    const formIds = forms.map((f) => f._id);

    const [slotAggregates, bookingAggregates] = await Promise.all([
      SlotModel.aggregate([
        { $match: { formId: { $in: formIds } } },
        {
          $group: {
            _id: "$formId",
            totalSlots: { $sum: 1 },
            totalCapacity: { $sum: "$capacity" },
            totalBooked: { $sum: "$bookedCount" },
          },
        },
      ]),
      BookingModel.aggregate([
        { $match: { formId: { $in: formIds } } },
        { $group: { _id: "$formId", totalBookings: { $sum: 1 } } },
      ]),
    ]);

    const slotsByForm = new Map(
      slotAggregates.map((entry) => [String(entry._id), entry]),
    );
    const bookingsByForm = new Map(
      bookingAggregates.map((entry) => [String(entry._id), entry]),
    );

    return forms.map((form) => {
      const slots = slotsByForm.get(String(form._id)) ?? {
        totalSlots: 0,
        totalCapacity: 0,
        totalBooked: 0,
      };
      const bookings = bookingsByForm.get(String(form._id)) ?? {
        totalBookings: 0,
      };

      return {
        ...form,
        stats: {
          totalSlots: slots.totalSlots,
          totalCapacity: slots.totalCapacity,
          totalBooked: slots.totalBooked,
          remainingCapacity: Math.max(
            slots.totalCapacity - slots.totalBooked,
            0,
          ),
          totalBookings: bookings.totalBookings,
          fillPercentage:
            slots.totalCapacity === 0
              ? 0
              : Number(
                  (
                    (slots.totalBooked / slots.totalCapacity) *
                    100
                  ).toFixed(2),
                ),
        },
      };
    });
  }

  async deleteCascade(formId) {
    const id = new Types.ObjectId(formId);
    const [form] = await Promise.all([
      FormModel.findByIdAndDelete(id),
      SlotModel.deleteMany({ formId: id }),
      BookingModel.deleteMany({ formId: id }),
      VisitModel.deleteMany({ formId: id }),
    ]);

    return form;
  }
}

export const formRepository = new FormRepository();
