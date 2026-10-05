import { Schema, model } from "mongoose";

const integrationSchema = new Schema(
  {
    provider: { type: String, required: true, enum: ["google"] },
    email: { type: String, required: true, lowercase: true, trim: true },
    calendarId: { type: String, default: "primary", trim: true },
    accessToken: { type: String, default: "" },
    refreshToken: { type: String, default: "" },
    expiryDate: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);

integrationSchema.index({ provider: 1, email: 1 }, { unique: true });

export const IntegrationModel = model("Integration", integrationSchema);

