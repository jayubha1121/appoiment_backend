import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { ALL_PERMISSIONS } from "../utils/permissions.js";

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      default: "Administrator",
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["super_admin", "admin", "employee"],
      default: "employee",
      required: true,
    },
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator(values) {
          return Array.isArray(values) && values.every((value) => ALL_PERMISSIONS.includes(value));
        },
        message: "Invalid permissions array",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true },
);

adminSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

adminSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.password);
};

export const Admin = mongoose.model("Admin", adminSchema);
