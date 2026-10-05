import { Schema, Types, model } from "mongoose";

const bookingSchema = new Schema(
  {
    slotId: { type: Types.ObjectId, ref: "Slot", required: true, index: true },
    formId: { type: Types.ObjectId, ref: "Form", required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, default: "", trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    inquiryType: { type: String, required: true, trim: true },
    extraFields: {
      type: Map,
      of: String,
      default: {},
    },
    bookedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

bookingSchema.index({ formId: 1, bookedAt: -1 });
bookingSchema.index({ name: "text", email: "text", phone: "text" });

export const BookingModel = model("Booking", bookingSchema);
