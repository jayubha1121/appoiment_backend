import { Schema, model } from "mongoose";

const formSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    customFields: {
      type: [
        new Schema(
          {
            key: { type: String, required: true, trim: true },
            label: { type: String, required: true, trim: true },
            required: { type: Boolean, default: false },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    activeFrom: { type: Date, required: true },
    activeTo: { type: Date, required: true },
    activeWeekdays: {
      type: [Number],
      required: true,
      default: [1, 2, 3, 4, 5, 6, 0],
    }, // 0=Sun ... 6=Sat
    startHour: { type: Number, default: 10, min: 0, max: 23 },
    endHour: { type: Number, default: 19, min: 1, max: 24 },
    slotDuration: {
      type: Number,
      required: true,
      enum: [10, 15, 30, 45, 60],
    },
    slotCapacity: { type: Number, required: true, min: 1 },
    inquiryTypes: {
      type: [String],
      default: ["General Inquiry", "Consultation", "Follow-up"],
    },
    inquiryAllowCustom: { type: Boolean, default: false },
    /** When set, public /book/{id} and APIs stay open until this instant (can be after last slot day). */
    bookingLinkExpiresAt: { type: Date, default: null },
    /**
     * IANA timezone name of the business (e.g. "Asia/Kolkata").
     * Stored at form creation from the admin's browser timezone so slot HH:MM
     * times are always converted to UTC correctly regardless of server timezone.
     */
    businessTimeZone: {
      type: String,
      default: () => process.env.BUSINESS_TZ || "Asia/Kolkata",
      trim: true,
    },
    isActive: { type: Boolean, default: true },
    totalVisits: { type: Number, default: 0 },
    /** Set when daily cron sent expiry-day summary + bookings CSV to integration emails. */
    expirySummaryEmailSentAt: { type: Date, default: null },
    /**
     * WhatsApp template name used for all staff notifications on this form.
     * Must match an approved WATI template name.
     */
    whatsappTemplateName: { type: String, default: "booking_confirm", trim: true },
    /**
     * WhatsApp template name sent to the client as a booking confirmation.
     * Separate from staff notifications. Defaults to whatsappTemplateName if not set.
     */
    whatsappClientTemplateName: { type: String, default: "", trim: true },
    /**
     * Phone numbers (Indian 10-digit or full E.164) that receive a WhatsApp
     * notification whenever a client books this form.
     */
    whatsappPhones: { type: [String], default: [] },
    /**
     * Per-form email recipients. These receive instant booking notifications and
     * form-specific daily digest emails in addition to global integration recipients.
     */
    emailRecipients: { type: [String], default: [] },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

formSchema.index({ createdAt: -1 });
formSchema.index({ isActive: 1, activeFrom: 1, activeTo: 1 });
formSchema.index({ isActive: 1, activeFrom: 1, activeTo: 1, activeWeekdays: 1 });

export const FormModel = model("Form", formSchema);
