import { Schema, model } from "mongoose";

/**
 * Singleton doc: extra email addresses chosen in admin (Integrations page) that receive
 * the same scheduled mail as Google-connected accounts (`resolveExpirySummaryRecipientEmails`).
 */
const cronManualRecipientSettingSchema = new Schema(
  {
    singletonKey: {
      type: String,
      required: true,
      unique: true,
      default: "default",
      enum: ["default"],
    },
    emails: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

export const CronManualRecipientSettingModel = model(
  "CronManualRecipientSetting",
  cronManualRecipientSettingSchema,
);
