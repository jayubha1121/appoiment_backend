import { Schema, Types, model } from "mongoose";

const slotSchema = new Schema(
  {
    formId: { type: Types.ObjectId, ref: "Form", required: true, index: true },
    date: { type: Date, required: true, index: true },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    capacity: { type: Number, required: true, min: 1 },
    bookedCount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  },
);

slotSchema.index({ formId: 1, date: 1, startTime: 1, endTime: 1 });

export const SlotModel = model("Slot", slotSchema);
