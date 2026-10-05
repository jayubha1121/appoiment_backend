import { Schema, Types, model } from "mongoose";

const visitSchema = new Schema(
  {
    formId: { type: Types.ObjectId, ref: "Form", required: true, index: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

visitSchema.index({ formId: 1, createdAt: -1 });

export const VisitModel = model("Visit", visitSchema);
